//! ACP（Agent Client Protocol）适配层
//!
//! 桌面端通过 `mcode acp` 子进程与 Agent 通信：子进程在 stdin/stdout 上提供
//! JSON-RPC 2.0 服务，实现 ACP 的 `initialize` / `session/new` / `session/prompt`
//! 请求，以及 `session/update` / `session/request_permission` 通知与请求。
//!
//! 手机端只使用简单信封（`{"type":"chat","payload":"..."}`），本模块负责在
//! 手机端信封与 ACP 标准协议之间做双向翻译：
//!
//! - 手机端 `chat` 信封 → ACP `session/prompt` 请求
//! - 手机端 `stop` 信封 → ACP `session/cancel` 通知（中断在途的一轮）
//! - ACP `session/update` → 手机端 `chat` / `thinking` / `tool_call` 帧
//! - ACP `session/request_permission` → 手机端 `permission_request` 帧
//! - 中继层控制帧与心跳帧（`control` / `ping` / `pong`）一律不下发给 Agent
//!
//! 参考：`specs/073-074-relay-pairing-protocol`、`specs/075-076-mobile-chat-protocol`。

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};

/// `mcode acp` 的 ACP 协议版本。`initialize` 的 `protocolVersion` 必须是数字，
/// 传字符串会被服务端拒绝（-32602 Invalid params）。
pub const ACP_PROTOCOL_VERSION: i64 = 1;

/// 桌面端下发给手机端的帧类型。
pub mod frame {
    /// Agent 回复正文增量。
    pub const CHAT: &str = "chat";
    /// 本轮对话结束。
    pub const CHAT_END: &str = "chat_end";
    /// 思考过程增量。
    pub const THINKING: &str = "thinking";
    /// 工具调用状态更新（payload 为 JSON 字符串）。
    pub const TOOL_CALL: &str = "tool_call";
    /// 权限请求（payload 为 JSON 字符串）。
    pub const PERMISSION_REQUEST: &str = "permission_request";
    /// 错误提示。
    pub const ERROR: &str = "error";
}

/// 本轮被用户中断时的 `chat_end` 载荷。
///
/// 与 ACP 的 `stopReason: "cancelled"` 保持一致，手机端据此把排队中的提问标记为已取消。
pub const STOP_REASON_CANCELLED: &str = "cancelled";

/// ACP 连接阶段。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    /// 已发出 `initialize`，等待响应。
    Initializing,
    /// `initialize` 已完成，已发出 `session/new`，等待响应。
    CreatingSession,
    /// 会话就绪，可以接受 prompt。
    Ready,
    /// 握手失败。
    Failed,
}

/// 一次待答复的权限请求。
#[derive(Debug, Clone)]
struct PendingPermission {
    /// `session/request_permission` 的 JSON-RPC 请求 ID。
    acp_id: i64,
    /// 可选项，顺序与 ACP 返回一致。
    options: Vec<PermissionOption>,
}

/// 权限可选项。
#[derive(Debug, Clone)]
struct PermissionOption {
    option_id: String,
    kind: String,
}

/// 工具调用快照。
#[derive(Debug, Clone, Default)]
struct ToolCallSnapshot {
    title: String,
    name: String,
    kind: String,
    status: String,
}

/// 一次状态转移产生的动作。
#[derive(Debug, Default)]
pub struct AcpActions {
    /// 需要写入子进程 stdin 的 JSON-RPC 行。
    pub to_agent: Vec<String>,
    /// 需要下发给手机端的帧（JSON 字符串）。
    pub to_mobile: Vec<String>,
}

/// 桌面端侧的 ACP 客户端状态机。
pub struct AcpBridge {
    phase: Phase,
    workspace_dir: String,
    session_id: Option<String>,
    next_request_id: i64,
    session_new_request_id: Option<i64>,
    active_prompt_id: Option<i64>,
    prompt_queue: VecDeque<String>,
    pending_permissions: HashMap<String, PendingPermission>,
    tool_calls: HashMap<String, ToolCallSnapshot>,
    /// 已发出 `session/cancel` 但尚未收到 Agent 回应的 prompt id。
    ///
    /// 这些 prompt 的迟到响应不再产出错误帧，只用于收尾（补发 `chat_end`）。
    cancelled_prompt_ids: HashSet<i64>,
    /// 发出取消请求的时刻（毫秒），用于桌面端判断「Agent 不支持取消」时的兜底超时。
    cancel_requested_at: Option<u64>,
}

impl AcpBridge {
    /// 创建适配器。`workspace_dir` 为 `session/new` 的工作目录。
    pub fn new(workspace_dir: String) -> Self {
        Self {
            phase: Phase::Initializing,
            workspace_dir,
            session_id: None,
            next_request_id: 1,
            session_new_request_id: None,
            active_prompt_id: None,
            prompt_queue: VecDeque::new(),
            pending_permissions: HashMap::new(),
            tool_calls: HashMap::new(),
            cancelled_prompt_ids: HashSet::new(),
            cancel_requested_at: None,
        }
    }

    /// 生成握手请求。必须首先写入子进程 stdin。
    pub fn start(&mut self) -> Vec<String> {
        let id = self.alloc_id();
        vec![json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "protocolVersion": ACP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {
                    "name": "loom-desktop",
                    "version": env!("CARGO_PKG_VERSION"),
                }
            }
        })
        .to_string()]
    }

    /// 处理子进程 stdout 的一行输出。
    pub fn on_agent_line(&mut self, line: &str) -> AcpActions {
        let mut actions = AcpActions::default();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return actions;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            return actions;
        };

        // 服务端 → 客户端的请求 / 通知
        if let Some(method) = value.get("method").and_then(|v| v.as_str()) {
            match method {
                "session/update" => {
                    if let Some(frame) = self.translate_session_update(&value) {
                        actions.to_mobile.push(frame);
                    }
                }
                "session/request_permission" => {
                    actions
                        .to_mobile
                        .extend(self.translate_permission_request(&value));
                }
                _ => {}
            }
            return actions;
        }

        // 响应
        let Some(id) = value.get("id").and_then(|v| v.as_i64()) else {
            return actions;
        };

        match self.phase {
            Phase::Initializing => {
                if let Some(err) = value.get("error") {
                    self.phase = Phase::Failed;
                    actions.to_mobile.push(error_frame(&error_message(err)));
                    return actions;
                }
                self.phase = Phase::CreatingSession;
                actions.to_agent.push(
                    json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string(),
                );
                actions.to_agent.push(self.build_session_new());
                return actions;
            }
            Phase::CreatingSession => {
                if self.session_new_request_id != Some(id) {
                    return actions;
                }
                match value.pointer("/result/sessionId").and_then(|v| v.as_str()) {
                    Some(sid) => {
                        self.session_id = Some(sid.to_string());
                        self.phase = Phase::Ready;
                    }
                    None => {
                        self.phase = Phase::Failed;
                        actions
                            .to_mobile
                            .push(error_frame("创建 Agent 会话失败，未返回 sessionId"));
                    }
                }
                actions.to_agent.extend(self.pump_prompts());
                return actions;
            }
            Phase::Ready => {}
            Phase::Failed => return actions,
        }

        // 已被取消的 prompt：Agent 的迟到响应只用于收尾，不再产出错误帧
        if self.cancelled_prompt_ids.remove(&id) {
            self.active_prompt_id = None;
            self.cancel_requested_at = None;
            actions.to_mobile.push(make_frame(frame::CHAT_END, STOP_REASON_CANCELLED));
            actions.to_agent.extend(self.pump_prompts());
            return actions;
        }

        if self.active_prompt_id == Some(id) {
            self.active_prompt_id = None;
            self.cancel_requested_at = None;
            if let Some(err) = value.get("error") {
                actions.to_mobile.push(error_frame(&error_message(err)));
            } else {
                let stop = value
                    .pointer("/result/stopReason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("end_turn");
                actions.to_mobile.push(make_frame(frame::CHAT_END, stop));
            }
            actions.to_agent.extend(self.pump_prompts());
            return actions;
        }

        if let Some(err) = value.get("error") {
            actions.to_mobile.push(error_frame(&error_message(err)));
        }
        actions
    }

    /// 处理手机端下发的一帧。
    pub fn on_mobile_frame(&mut self, text: &str) -> AcpActions {
        let mut actions = AcpActions::default();
        let trimmed = text.trim();

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            // 非 JSON 帧：按纯文本 prompt 处理
            self.enqueue_prompt(trimmed, &mut actions);
            return actions;
        };

        let Some(kind) = value.get("type").and_then(|v| v.as_str()) else {
            self.enqueue_prompt(trimmed, &mut actions);
            return actions;
        };

        match kind {
            // 中继层控制帧与心跳帧：绝不下发给 Agent（否则会污染 ACP 协议流）
            "control" | "ping" | "pong" => {}
            "permission_response" => {
                if let Some(resp) = payload_value(&value) {
                    if let Some(req) = self.build_permission_reply(&resp) {
                        actions.to_agent.push(req);
                    }
                }
            }
            "chat" => {
                let payload = value
                    .get("payload")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if payload.is_empty() {
                    return actions;
                }
                // 兼容旧版移动端：payload 本身就是 JSON-RPC 权限应答
                if let Ok(inner) = serde_json::from_str::<Value>(&payload) {
                    if inner.get("id").is_some()
                        && (inner.get("result").is_some() || inner.get("error").is_some())
                    {
                        if let Some(req) = self.build_permission_reply(&inner) {
                            actions.to_agent.push(req);
                        }
                        return actions;
                    }
                }
                self.enqueue_prompt(&payload, &mut actions);
            }
            // 手机端主动叫停：转成 ACP `session/cancel` 通知
            "stop" | "cancel" => {
                self.cancel_active(&mut actions);
            }
            _ => {}
        }
        actions
    }

    /// 构造 `session/new` 请求。
    fn build_session_new(&mut self) -> String {
        let id = self.alloc_id();
        self.session_new_request_id = Some(id);
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "session/new",
            "params": {
                "cwd": self.workspace_dir,
                "mcpServers": []
            }
        })
        .to_string()
    }

    /// 把 `session/update` 翻译为手机端帧。
    fn translate_session_update(&mut self, value: &Value) -> Option<String> {
        let update = value.pointer("/params/update")?;
        let kind = update.get("sessionUpdate").and_then(|v| v.as_str())?;
        match kind {
            "agent_message_chunk" => {
                let text = update
                    .pointer("/content/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if text.is_empty() {
                    None
                } else {
                    Some(make_frame(frame::CHAT, text))
                }
            }
            "agent_thought_chunk" => {
                let text = update
                    .pointer("/content/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if text.is_empty() {
                    None
                } else {
                    Some(make_frame(frame::THINKING, text))
                }
            }
            "tool_call" | "tool_call_update" => {
                let tool_call_id = update
                    .get("toolCallId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if tool_call_id.is_empty() {
                    return None;
                }
                let snapshot = self.tool_calls.entry(tool_call_id.clone()).or_default();
                if let Some(v) = update.get("title").and_then(|v| v.as_str()) {
                    snapshot.title = v.to_string();
                }
                if let Some(v) = update.get("name").and_then(|v| v.as_str()) {
                    snapshot.name = v.to_string();
                }
                if let Some(v) = update.get("kind").and_then(|v| v.as_str()) {
                    snapshot.kind = v.to_string();
                }
                if let Some(v) = update.get("status").and_then(|v| v.as_str()) {
                    snapshot.status = v.to_string();
                }
                let payload = json!({
                    "toolCallId": tool_call_id,
                    "title": snapshot.title,
                    "name": snapshot.name,
                    "kind": snapshot.kind,
                    "status": snapshot.status,
                });
                Some(make_frame(frame::TOOL_CALL, &payload.to_string()))
            }
            _ => None,
        }
    }

    /// 把 `session/request_permission` 翻译为手机端 `permission_request` 帧。
    fn translate_permission_request(&mut self, value: &Value) -> Vec<String> {
        let Some(acp_id) = value.get("id").and_then(|v| v.as_i64()) else {
            return Vec::new();
        };

        let mut options = Vec::new();
        let mut mobile_options = Vec::new();
        if let Some(list) = value.pointer("/params/options").and_then(|v| v.as_array()) {
            for opt in list {
                let option_id = opt
                    .get("optionId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if option_id.is_empty() {
                    continue;
                }
                let name = opt.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let kind = opt.get("kind").and_then(|v| v.as_str()).unwrap_or("").to_string();
                mobile_options.push(json!({
                    "id": option_id,
                    "label": name,
                    "description": kind,
                }));
                options.push(PermissionOption { option_id, kind });
            }
        }

        let mobile_id = format!("perm_{}", acp_id);
        self.pending_permissions.insert(
            mobile_id.clone(),
            PendingPermission { acp_id, options },
        );

        let title = value
            .pointer("/params/toolCall/title")
            .and_then(|v| v.as_str())
            .unwrap_or("需要授权的操作");
        let payload = json!({
            "method": "request_permission",
            "id": mobile_id,
            "params": {
                "title": title,
                "description": format!("Agent 请求执行：{}", title),
                "options": mobile_options,
            }
        });
        vec![make_frame(frame::PERMISSION_REQUEST, &payload.to_string())]
    }

    /// 把手机端的权限应答转换为对 `session/request_permission` 的 JSON-RPC 响应。
    fn build_permission_reply(&mut self, response: &Value) -> Option<String> {
        let mobile_id = response.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let pending = self.pending_permissions.remove(mobile_id)?;

        let approved = response
            .get("approved")
            .and_then(|v| v.as_bool())
            .or_else(|| {
                response
                    .pointer("/result/confirmed")
                    .and_then(|v| v.as_bool())
            })
            .unwrap_or(false);

        let mut selected = response
            .get("optionId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if selected.is_none() {
            selected = response
                .pointer("/result/selectedOptions")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }
        if selected.is_none() && approved {
            // 未显式选择时，回退到第一个允许类选项
            selected = pending
                .options
                .iter()
                .find(|o| o.kind == "allow_once" || o.kind == "allow_always")
                .map(|o| o.option_id.clone());
        }

        let outcome = match selected {
            Some(option_id) if approved => {
                json!({ "outcome": { "outcome": "selected", "optionId": option_id } })
            }
            _ => json!({ "outcome": { "outcome": "cancelled" } }),
        };

        Some(
            json!({ "jsonrpc": "2.0", "id": pending.acp_id, "result": outcome }).to_string(),
        )
    }

    /// 排队一条 prompt。
    fn enqueue_prompt(&mut self, text: &str, actions: &mut AcpActions) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        if self.phase == Phase::Failed {
            actions.to_mobile.push(error_frame("Agent 会话不可用"));
            return;
        }
        self.prompt_queue.push_back(text.to_string());
        actions.to_agent.extend(self.pump_prompts());
    }

    /// 中断在途的一轮对话。
    ///
    /// - 排队中的提问一并丢弃：用户既然叫停，未执行的提问不再排队；
    /// - 向 Agent 发出 ACP `session/cancel`（`sessionId` 为必需参数）；
    /// - `chat_end` 在 Agent 回应（或桌面端兜底结束会话）时才补发，
    ///   手机端据此结束「生成中」状态。
    fn cancel_active(&mut self, actions: &mut AcpActions) {
        self.prompt_queue.clear();

        let Some(prompt_id) = self.active_prompt_id else {
            // 本来就没有在途的一轮：直接告诉手机端本轮已结束
            actions.to_mobile.push(make_frame(frame::CHAT_END, STOP_REASON_CANCELLED));
            return;
        };

        self.cancelled_prompt_ids.insert(prompt_id);
        self.cancel_requested_at = Some(now_ms());

        if let Some(session_id) = self.session_id.clone() {
            actions.to_agent.push(
                json!({
                    "jsonrpc": "2.0",
                    "method": "session/cancel",
                    "params": { "sessionId": session_id }
                })
                .to_string(),
            );
        }
    }

    /// 取消请求是否已超时未果。
    ///
    /// 并非所有 Agent 都实现了 `session/cancel`；超时后由桌面端结束该会话的
    /// 子进程，保证手机端的「停止」一定能生效。
    pub fn cancel_timed_out(&self, timeout_ms: u64) -> bool {
        match self.cancel_requested_at {
            Some(at) => now_ms().saturating_sub(at) > timeout_ms,
            None => false,
        }
    }

    /// 派发队列中的 prompt。同一时刻只允许一个 `session/prompt` 在途。
    fn pump_prompts(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        if self.active_prompt_id.is_some() {
            return out;
        }
        let Some(session_id) = self.session_id.clone() else {
            return out;
        };
        let Some(text) = self.prompt_queue.pop_front() else {
            return out;
        };
        let id = self.alloc_id();
        self.active_prompt_id = Some(id);
        out.push(
            json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": "session/prompt",
                "params": {
                    "sessionId": session_id,
                    "prompt": [ { "type": "text", "text": text } ]
                }
            })
            .to_string(),
        );
        out
    }

    fn alloc_id(&mut self) -> i64 {
        let id = self.next_request_id;
        self.next_request_id += 1;
        id
    }
}

/// 构造一条下发手机端的帧。
pub fn make_frame(kind: &str, payload: &str) -> String {
    json!({
        "type": kind,
        "payload": payload,
        "timestamp": now_ms(),
    })
    .to_string()
}

/// 读取帧里的 `payload`。它既可以是一段 JSON 字符串，也可以直接是 JSON 对象。
fn payload_value(frame: &Value) -> Option<Value> {
    match frame.get("payload") {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok(),
        Some(v @ Value::Object(_)) => Some(v.clone()),
        _ => None,
    }
}

fn error_frame(message: &str) -> String {
    make_frame(frame::ERROR, message)
}

fn error_message(err: &Value) -> String {
    err.get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("未知错误")
        .to_string()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bridge() -> AcpBridge {
        AcpBridge::new("D:/workspace".to_string())
    }

    /// 完成握手，返回就绪的适配器。
    fn ready_bridge() -> AcpBridge {
        let mut b = bridge();
        b.start();
        let actions = b.on_agent_line(r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}"#);
        assert_eq!(actions.to_agent.len(), 2);
        assert!(actions.to_agent[0].contains("notifications/initialized"));
        assert!(actions.to_agent[1].contains("session/new"));
        let actions = b.on_agent_line(r#"{"jsonrpc":"2.0","id":2,"result":{"sessionId":"mvs_test"}}"#);
        assert!(actions.to_agent.is_empty());
        assert!(actions.to_mobile.is_empty());
        b
    }

    #[test]
    fn test_handshake_sequence() {
        let mut b = bridge();
        let start = b.start();
        assert_eq!(start.len(), 1);
        assert!(start[0].contains("\"method\":\"initialize\""));
        // protocolVersion 必须是数字
        let parsed: Value = serde_json::from_str(&start[0]).unwrap();
        assert!(parsed["params"]["protocolVersion"].is_i64());
        assert_eq!(parsed["params"]["protocolVersion"].as_i64(), Some(1));
    }

    #[test]
    fn test_initialize_failure_is_reported_to_mobile() {
        let mut b = bridge();
        b.start();
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"protocol mismatch"}}"#,
        );
        assert_eq!(actions.to_mobile.len(), 1);
        assert!(actions.to_mobile[0].contains("\"type\":\"error\""));
        assert!(actions.to_mobile[0].contains("protocol mismatch"));
    }

    #[test]
    fn test_stop_frame_becomes_session_cancel() {
        let mut b = ready_bridge();
        // 先发一轮对话，制造在途的 prompt
        let actions = b.on_mobile_frame(r#"{"type":"chat","payload":"跑很久"}"#);
        assert_eq!(actions.to_agent.len(), 1);
        let prompt_id: i64 = serde_json::from_str::<Value>(&actions.to_agent[0]).unwrap()["id"]
            .as_i64()
            .unwrap();

        // 手机端叫停
        let actions = b.on_mobile_frame(r#"{"type":"stop","payload":""}"#);
        assert_eq!(actions.to_agent.len(), 1);
        let req: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(req["method"], "session/cancel");
        assert_eq!(req["params"]["sessionId"], "mvs_test");
        assert!(actions.to_mobile.is_empty(), "chat_end 等 Agent 回应后再补发");

        // Agent 对被取消的 prompt 的迟到响应：只收尾，不报错误
        let actions = b.on_agent_line(&format!(
            r#"{{"jsonrpc":"2.0","id":{},"error":{{"code":-32000,"message":"cancelled"}}}}"#,
            prompt_id
        ));
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "chat_end");
        assert_eq!(frame["payload"], STOP_REASON_CANCELLED);
    }

    #[test]
    fn test_stop_discards_queued_prompts() {
        let mut b = ready_bridge();
        let first = b.on_mobile_frame(r#"{"type":"chat","payload":"一"}"#);
        assert_eq!(first.to_agent.len(), 1);
        let prompt_id: i64 = serde_json::from_str::<Value>(&first.to_agent[0]).unwrap()["id"]
            .as_i64()
            .unwrap();
        // 第二条排队中
        let second = b.on_mobile_frame(r#"{"type":"chat","payload":"二"}"#);
        assert!(second.to_agent.is_empty(), "同一时刻只允许一个 prompt 在途");

        // 叫停：排队中的提问一并丢弃
        let actions = b.on_mobile_frame(r#"{"type":"stop","payload":""}"#);
        assert_eq!(actions.to_agent.len(), 1);

        // Agent 回应取消后不应再派发排队中的 prompt
        let actions = b.on_agent_line(&format!(
            r#"{{"jsonrpc":"2.0","id":{},"result":{{"stopReason":"cancelled"}}}}"#,
            prompt_id
        ));
        assert!(actions.to_agent.is_empty(), "排队中的提问应随叫停一起丢弃");
        assert_eq!(actions.to_mobile.len(), 1);
    }

    #[test]
    fn test_stop_without_active_prompt_ends_turn() {
        let mut b = ready_bridge();
        let actions = b.on_mobile_frame(r#"{"type":"stop","payload":""}"#);
        assert!(actions.to_agent.is_empty(), "没有在途 prompt 时不必发 session/cancel");
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "chat_end");
        assert_eq!(frame["payload"], STOP_REASON_CANCELLED);
    }

    #[test]
    fn test_mobile_chat_becomes_session_prompt() {
        let mut b = ready_bridge();
        let actions = b.on_mobile_frame(r#"{"type":"chat","payload":"你好"}"#);
        assert_eq!(actions.to_agent.len(), 1);
        let req: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(req["method"], "session/prompt");
        assert_eq!(req["params"]["sessionId"], "mvs_test");
        assert_eq!(req["params"]["prompt"][0]["type"], "text");
        assert_eq!(req["params"]["prompt"][0]["text"], "你好");
    }

    #[test]
    fn test_heartbeat_and_control_frames_never_reach_agent() {
        let mut b = ready_bridge();
        for frame in [
            r#"{"type":"pong","payload":"","timestamp":1}"#,
            r#"{"type":"ping","payload":"","timestamp":1}"#,
            r#"{"type":"control","event":"peer_connected"}"#,
        ] {
            let actions = b.on_mobile_frame(frame);
            assert!(actions.to_agent.is_empty(), "帧不应下发给 Agent: {}", frame);
            assert!(actions.to_mobile.is_empty());
        }
    }

    #[test]
    fn test_agent_message_chunk_is_forwarded_to_mobile() {
        let mut b = ready_bridge();
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"mvs_test","update":{"sessionUpdate":"agent_message_chunk","messageId":"m1","content":{"type":"text","text":"收到"}}}}"#,
        );
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "chat");
        assert_eq!(frame["payload"], "收到");
    }

    #[test]
    fn test_thought_chunk_uses_thinking_frame() {
        let mut b = ready_bridge();
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"思考中"}}}}"#,
        );
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "thinking");
    }

    #[test]
    fn test_tool_call_updates_are_merged() {
        let mut b = ready_bridge();
        b.on_agent_line(
            r#"{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"tool_call","toolCallId":"c1","title":"bash","name":"bash","kind":"execute"}}}"#,
        );
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"tool_call_update","toolCallId":"c1","status":"completed"}}}"#,
        );
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "tool_call");
        let payload: Value = serde_json::from_str(frame["payload"].as_str().unwrap()).unwrap();
        assert_eq!(payload["title"], "bash");
        assert_eq!(payload["status"], "completed");
    }

    #[test]
    fn test_prompt_response_ends_turn() {
        let mut b = ready_bridge();
        let actions = b.on_mobile_frame(r#"{"type":"chat","payload":"hi"}"#);
        let req: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        let prompt_id = req["id"].as_i64().unwrap();
        let actions = b.on_agent_line(&format!(
            r#"{{"jsonrpc":"2.0","id":{},"result":{{"stopReason":"end_turn"}}}}"#,
            prompt_id
        ));
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "chat_end");
        assert_eq!(frame["payload"], "end_turn");
    }

    #[test]
    fn test_second_prompt_waits_for_first_to_finish() {
        let mut b = ready_bridge();
        let first = b.on_mobile_frame(r#"{"type":"chat","payload":"一"}"#);
        assert_eq!(first.to_agent.len(), 1);
        let second = b.on_mobile_frame(r#"{"type":"chat","payload":"二"}"#);
        assert!(second.to_agent.is_empty(), "同一时刻只允许一个 prompt 在途");

        let req: Value = serde_json::from_str(&first.to_agent[0]).unwrap();
        let prompt_id = req["id"].as_i64().unwrap();
        let actions = b.on_agent_line(&format!(
            r#"{{"jsonrpc":"2.0","id":{},"result":{{"stopReason":"end_turn"}}}}"#,
            prompt_id
        ));
        assert_eq!(actions.to_agent.len(), 1);
        let queued: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(queued["params"]["prompt"][0]["text"], "二");
    }

    #[test]
    fn test_permission_request_roundtrip() {
        let mut b = ready_bridge();
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","id":77,"method":"session/request_permission","params":{"sessionId":"mvs_test","toolCall":{"toolCallId":"c1","title":"执行 bash","kind":"execute"},"options":[{"optionId":"allow_once","name":"允许一次","kind":"allow_once"},{"optionId":"reject_once","name":"拒绝","kind":"reject_once"}]}}"#,
        );
        assert_eq!(actions.to_mobile.len(), 1);
        let frame: Value = serde_json::from_str(&actions.to_mobile[0]).unwrap();
        assert_eq!(frame["type"], "permission_request");
        let payload: Value = serde_json::from_str(frame["payload"].as_str().unwrap()).unwrap();
        assert_eq!(payload["method"], "request_permission");
        assert_eq!(payload["id"], "perm_77");
        assert_eq!(payload["params"]["title"], "执行 bash");
        assert_eq!(payload["params"]["options"][0]["id"], "allow_once");

        // 手机端确认
        let reply = json!({
            "type": "permission_response",
            "payload": serde_json::to_string(&json!({
                "id": "perm_77",
                "approved": true,
                "optionId": "allow_once",
            }))
            .unwrap(),
        })
        .to_string();
        let actions = b.on_mobile_frame(&reply);
        assert_eq!(actions.to_agent.len(), 1);
        let resp: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(resp["id"], 77);
        assert_eq!(resp["result"]["outcome"]["outcome"], "selected");
        assert_eq!(resp["result"]["outcome"]["optionId"], "allow_once");
    }

    #[test]
    fn test_legacy_mobile_permission_reply_is_supported() {
        let mut b = ready_bridge();
        b.on_agent_line(
            r#"{"jsonrpc":"2.0","id":88,"method":"session/request_permission","params":{"sessionId":"mvs_test","toolCall":{"toolCallId":"c1","title":"执行 bash"},"options":[{"optionId":"allow_once","name":"允许一次","kind":"allow_once"}]}}"#,
        );
        // 旧版移动端把 JSON-RPC 应答塞在 chat 信封里
        let legacy = json!({
            "type": "chat",
            "payload": serde_json::to_string(&json!({
                "jsonrpc": "2.0",
                "id": "perm_88",
                "result": { "confirmed": true, "selectedOptions": ["allow_once"] },
            }))
            .unwrap(),
        })
        .to_string();
        let actions = b.on_mobile_frame(&legacy);
        assert_eq!(actions.to_agent.len(), 1);
        let resp: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(resp["id"], 88);
        assert_eq!(resp["result"]["outcome"]["optionId"], "allow_once");
    }

    #[test]
    fn test_permission_rejection_maps_to_cancelled() {
        let mut b = ready_bridge();
        b.on_agent_line(
            r#"{"jsonrpc":"2.0","id":99,"method":"session/request_permission","params":{"sessionId":"mvs_test","toolCall":{"toolCallId":"c1","title":"执行 bash"},"options":[{"optionId":"allow_once","name":"允许一次","kind":"allow_once"}]}}"#,
        );
        let reply = json!({
            "type": "permission_response",
            "payload": serde_json::to_string(&json!({ "id": "perm_99", "approved": false }))
                .unwrap(),
        })
        .to_string();
        let actions = b.on_mobile_frame(&reply);
        let resp: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(resp["result"]["outcome"]["outcome"], "cancelled");
    }

    #[test]
    fn test_prompt_before_session_ready_is_queued() {
        let mut b = bridge();
        b.start();
        let actions = b.on_mobile_frame(r#"{"type":"chat","payload":"提前到达"}"#);
        assert!(actions.to_agent.is_empty(), "会话未就绪时不应立即发送 prompt");
        // 会话就绪后自动补发
        b.on_agent_line(r#"{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}"#);
        let actions = b.on_agent_line(r#"{"jsonrpc":"2.0","id":2,"result":{"sessionId":"mvs_test"}}"#);
        assert_eq!(actions.to_agent.len(), 1);
        let req: Value = serde_json::from_str(&actions.to_agent[0]).unwrap();
        assert_eq!(req["method"], "session/prompt");
        assert_eq!(req["params"]["prompt"][0]["text"], "提前到达");
    }

    #[test]
    fn test_unknown_agent_method_is_ignored() {
        let mut b = ready_bridge();
        let actions = b.on_agent_line(
            r#"{"jsonrpc":"2.0","method":"mcode/session/goal/get","params":{}}"#,
        );
        assert!(actions.to_mobile.is_empty());
        assert!(actions.to_agent.is_empty());
    }

    /// 端到端测试：对接真实的 `mcode acp` 进程跑一轮对话。
    ///
    /// 需要本机安装并登录 mcode，因此默认跳过，用
    /// `cargo test -p loom-gui --bin loom-gui acp::tests::test_live -- --ignored --nocapture`
    /// 手动触发。
    #[test]
    #[ignore = "需要本机安装并登录 mcode"]
    fn test_live_agent_roundtrip() {
        use std::io::{BufRead, BufReader, Write};
        use std::process::{Command, Stdio};
        use std::sync::mpsc;
        use std::time::Duration;

        let workspace = std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string());

        #[cfg(windows)]
        let mut child = Command::new("cmd")
            .args(["/C", "mcode", "acp"])
            .current_dir(&workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("无法启动 mcode acp");

        #[cfg(not(windows))]
        let mut child = Command::new("mcode")
            .arg("acp")
            .current_dir(&workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("无法启动 mcode acp");

        let mut stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");

        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(l) => {
                        if tx.send(l).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let mut bridge = AcpBridge::new(workspace);
        for req in bridge.start() {
            writeln!(stdin, "{}", req).expect("write");
            stdin.flush().ok();
        }

        // 等待握手完成
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        while std::time::Instant::now() < deadline && bridge.session_id.is_none() {
            let Ok(line) = rx.recv_timeout(Duration::from_secs(5)) else {
                continue;
            };
            let actions = bridge.on_agent_line(&line);
            for req in &actions.to_agent {
                writeln!(stdin, "{}", req).expect("write");
                stdin.flush().ok();
            }
        }
        assert!(bridge.session_id.is_some(), "ACP 会话未建立");

        // 发起一轮对话
        let actions = bridge.on_mobile_frame(r#"{"type":"chat","payload":"只回复两个字：收到"}"#);
        assert_eq!(actions.to_agent.len(), 1);
        for req in &actions.to_agent {
            writeln!(stdin, "{}", req).expect("write");
            stdin.flush().ok();
        }

        let mut text = String::new();
        let mut ended = false;
        let deadline = std::time::Instant::now() + Duration::from_secs(120);
        while std::time::Instant::now() < deadline {
            let Ok(line) = rx.recv_timeout(Duration::from_secs(10)) else {
                continue;
            };
            let actions = bridge.on_agent_line(&line);
            for frame in &actions.to_mobile {
                let v: Value = serde_json::from_str(frame).expect("frame json");
                match v["type"].as_str() {
                    Some("chat") => {
                        text.push_str(v["payload"].as_str().unwrap_or_default());
                    }
                    Some("chat_end") => {
                        ended = true;
                    }
                    _ => {}
                }
            }
            if ended {
                break;
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        assert!(ended, "未收到会话结束标记");
        assert!(
            text.contains("收到"),
            "回复内容不符: {:?}",
            text
        );
    }
}
