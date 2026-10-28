use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use super::audit::{current_date_str, current_timestamp_str, AuditLogger, AuditRecord};
use super::client::{
    build_permission_request_card, build_permission_resolved_card, LarkClient,
};
use super::ws::{LarkEventHandler, LarkWsClient};
use crate::acp::match_model_option;

#[derive(Debug, PartialEq, Eq)]
pub enum HermesCommand {
    Help,
    NewSession,
    ListModels,
    SwitchModel(String),
    Stop,
}

pub fn parse_hermes_command(text: &str) -> Option<HermesCommand> {
    let trimmed = text.trim();

    // 匹配 /help / @help / help
    if trimmed.eq_ignore_ascii_case("/help")
        || trimmed.eq_ignore_ascii_case("@help")
        || trimmed.eq_ignore_ascii_case("help")
    {
        return Some(HermesCommand::Help);
    }

    // 匹配 /stop / @stop / stop
    if trimmed.eq_ignore_ascii_case("/stop")
        || trimmed.eq_ignore_ascii_case("@stop")
        || trimmed.eq_ignore_ascii_case("stop")
    {
        return Some(HermesCommand::Stop);
    }

    // 匹配 /new / @new / new
    if trimmed.eq_ignore_ascii_case("/new")
        || trimmed.eq_ignore_ascii_case("@new")
        || trimmed.eq_ignore_ascii_case("new")
    {
        return Some(HermesCommand::NewSession);
    }

    // 匹配单纯的 /models / @models / models / /model-list / @model-list / model-list
    if trimmed.eq_ignore_ascii_case("/models")
        || trimmed.eq_ignore_ascii_case("@models")
        || trimmed.eq_ignore_ascii_case("models")
        || trimmed.eq_ignore_ascii_case("/model-list")
        || trimmed.eq_ignore_ascii_case("@model-list")
        || trimmed.eq_ignore_ascii_case("model-list")
        || trimmed.eq_ignore_ascii_case("/model")
        || trimmed.eq_ignore_ascii_case("@model")
        || trimmed.eq_ignore_ascii_case("model")
    {
        return Some(HermesCommand::ListModels);
    }

    // 匹配带参数的 /models <model> / /model <model> / @models <model> / @model <model>
    for prefix in ["/models", "/model", "@models", "@model", "models", "model"] {
        if trimmed.to_lowercase().starts_with(prefix) {
            let remainder = trimmed[prefix.len()..].trim();
            if remainder.starts_with("-list") {
                return Some(HermesCommand::ListModels);
            }
            if !remainder.is_empty() {
                return Some(HermesCommand::SwitchModel(remainder.to_string()));
            }
        }
    }

    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HermesLogEntry {
    pub timestamp: String,
    pub direction: String, // "in" | "out"
    pub user_name: String,
    pub chat_type: String, // "p2p" | "group"
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HermesStatus {
    pub state: String, // "stopped" | "connecting" | "connected" | "error"
    pub error_message: Option<String>,
    pub log_entries: Vec<HermesLogEntry>,
    pub connected_since: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HermesConfig {
    pub app_id: String,
    pub app_secret: String,
    pub default_project_id: String,
    #[serde(default)]
    pub auto_start: bool,
}

struct PendingPermission {
    acp_request_id: serde_json::Value,
    tool_name: String,
    #[allow(dead_code)]
    chat_id: String,
    card_message_id: Option<String>,
    allow_option_id: Option<String>,
}

struct ActiveChatSession {
    current_chunk_buffer: String,
    accumulated_content: String,
    #[allow(dead_code)]
    last_updated: Instant,
    is_finished: bool,
    chat_type: String,
    current_message_id: Option<String>,
}

struct PendingSessionRequest {
    chat_id: String,
    chat_type: String,
    initial_prompt: Option<String>,
}

pub struct HermesBridge {
    app_handle: Option<AppHandle>,
    client: Arc<LarkClient>,
    project_path: String,
    stop_signal: Arc<AtomicBool>,
    status: Arc<Mutex<HermesStatus>>,
    acp_stdin: Arc<Mutex<Option<ChildStdin>>>,
    acp_child: Arc<Mutex<Option<Child>>>,
    next_rpc_id: AtomicI64,
    active_chats: Arc<Mutex<HashMap<String, ActiveChatSession>>>,
    pending_permissions: Arc<Mutex<HashMap<String, PendingPermission>>>,
    current_acp_session_id: Arc<Mutex<Option<String>>>,
    chat_to_session: Arc<Mutex<HashMap<String, String>>>,
    session_to_chat: Arc<Mutex<HashMap<String, String>>>,
    model_options: Arc<Mutex<Vec<serde_json::Value>>>,
    current_model: Arc<Mutex<String>>,
    pending_model_configs: Arc<Mutex<HashMap<String, String>>>,
    pending_session_requests: Arc<Mutex<HashMap<i64, PendingSessionRequest>>>,
    pending_prompt_to_chat: Arc<Mutex<HashMap<i64, String>>>,
    pub audit_logger: Arc<AuditLogger>,
}

impl HermesBridge {
    pub fn new(
        app_handle: Option<AppHandle>,
        app_id: String,
        app_secret: String,
        project_path: String,
    ) -> Self {
        let client = Arc::new(LarkClient::new(app_id, app_secret));
        let status = Arc::new(Mutex::new(HermesStatus {
            state: "connecting".to_string(),
            error_message: None,
            log_entries: Vec::new(),
            connected_since: None,
        }));

        Self {
            app_handle,
            client,
            project_path,
            stop_signal: Arc::new(AtomicBool::new(false)),
            status,
            acp_stdin: Arc::new(Mutex::new(None)),
            acp_child: Arc::new(Mutex::new(None)),
            next_rpc_id: AtomicI64::new(1),
            active_chats: Arc::new(Mutex::new(HashMap::new())),
            pending_permissions: Arc::new(Mutex::new(HashMap::new())),
            current_acp_session_id: Arc::new(Mutex::new(None)),
            chat_to_session: Arc::new(Mutex::new(HashMap::new())),
            session_to_chat: Arc::new(Mutex::new(HashMap::new())),
            model_options: Arc::new(Mutex::new(Vec::new())),
            current_model: Arc::new(Mutex::new(String::new())),
            pending_model_configs: Arc::new(Mutex::new(HashMap::new())),
            pending_session_requests: Arc::new(Mutex::new(HashMap::new())),
            pending_prompt_to_chat: Arc::new(Mutex::new(HashMap::new())),
            audit_logger: Arc::new(AuditLogger::new()),
        }
    }

    pub fn get_status(&self) -> HermesStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn stop(&self) {
        self.stop_signal.store(true, Ordering::Relaxed);

        // 终止 ACP 子进程
        if let Ok(mut child_guard) = self.acp_child.lock() {
            if let Some(mut child) = child_guard.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut stdin_guard) = self.acp_stdin.lock() {
            *stdin_guard = None;
        }

        // 更新状态为已停止
        if let Ok(mut s) = self.status.lock() {
            s.state = "stopped".to_string();
            s.error_message = None;
            self.broadcast_status(&s);
        }
    }

    pub fn start(self: Arc<Self>) {
        // 初始广播 connecting 状态，确保前端第一时间展示连接状态
        if let Ok(s) = self.status.lock() {
            self.broadcast_status(&s);
        }

        // 1. 启动 ACP 子进程并启动 stdout 消费线程
        if let Err(err) = self.spawn_acp_process(&self) {
            eprintln!("[Hermes] 启动 ACP 失败: {}", err);
            let mut s = self.status.lock().unwrap();
            s.state = "error".to_string();
            s.error_message = Some(format!("启动 ACP 失败: {}", err));
            self.broadcast_status(&s);
            return;
        }

        // 2. 启动飞书长连接客户端
        let ws_client = LarkWsClient::new(
            self.client.clone(),
            self.clone(),
            self.stop_signal.clone(),
        );
        ws_client.start_loop();
    }

    fn broadcast_status(&self, status: &HermesStatus) {
        if let Some(app) = &self.app_handle {
            let _ = app.emit("hermes-status-update", status);
        }
    }

    fn add_log(&self, direction: &str, user_name: &str, chat_type: &str, summary: &str) {
        let now_str = chrono_like_now();
        let entry = HermesLogEntry {
            timestamp: now_str,
            direction: direction.to_string(),
            user_name: user_name.to_string(),
            chat_type: chat_type.to_string(),
            summary: summary.to_string(),
        };

        if let Ok(mut s) = self.status.lock() {
            s.log_entries.push(entry);
            // 最多保留 200 条日志
            if s.log_entries.len() > 200 {
                s.log_entries.remove(0);
            }
            self.broadcast_status(&s);
        }
    }

    /// 启动 ACP 子进程 (mcode acp)
    fn spawn_acp_process(&self, arc_self: &Arc<Self>) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        use std::os::windows::process::CommandExt;
        #[cfg(target_os = "windows")]
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        #[cfg(target_os = "windows")]
        let (mut cmd, args_display) = {
            let mut c = Command::new("cmd");
            c.args(["/C", "mcode", "acp"]);
            (c, "cmd /C mcode acp".to_string())
        };

        #[cfg(not(target_os = "windows"))]
        let (mut cmd, args_display) = {
            let acp_bin = resolve_acp_executable()?;
            let mut c = Command::new(&acp_bin);
            c.arg("acp");
            (c, format!("{} acp", acp_bin))
        };

        println!("[Hermes] 拉起 ACP 进程: {}, cwd: {}", args_display, self.project_path);

        cmd.current_dir(&self.project_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| format!("启动 ACP 进程错误: {}", e))?;
        let stdout = child.stdout.take().ok_or_else(|| "无法获取 ACP stdout".to_string())?;
        let stdin = child.stdin.take().ok_or_else(|| "无法获取 ACP stdin".to_string())?;

        *self.acp_stdin.lock().unwrap() = Some(stdin);
        *self.acp_child.lock().unwrap() = Some(child);

        // 发送 initialize
        let init_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": init_id,
            "method": "initialize",
            "params": {
                "protocolVersion": 1,
                "capabilities": {},
                "clientInfo": {
                    "name": "loom-hermes",
                    "version": "0.1"
                }
            }
        });
        self.send_to_acp(&init_req)?;

        // 监听 ACP stdout
        let self_clone = arc_self.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                if self_clone.stop_signal.load(Ordering::Relaxed) {
                    break;
                }
                match line_res {
                    Ok(line) => {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            self_clone.handle_acp_line(trimmed);
                        }
                    }
                    Err(e) => {
                        eprintln!("[Hermes] 读取 ACP stdout 异常: {}", e);
                        break;
                    }
                }
            }

            // 若非主动停止且有在途任务，向所有在途会话发送异常终止通知并收尾
            if !self_clone.stop_signal.load(Ordering::Relaxed) {
                let mut chats = self_clone.active_chats.lock().unwrap();
                for (cid, s) in chats.iter_mut() {
                    if !s.is_finished {
                        s.is_finished = true;
                        let _ = self_clone.client.send_text_message(
                            "chat_id",
                            cid,
                            "❌ [Hermes] Agent 后台进程异常断开，当前任务已中断。",
                        );
                    }
                }
            }
        });

        Ok(())
    }

    fn send_to_acp(&self, val: &serde_json::Value) -> Result<(), String> {
        let mut guard = self.acp_stdin.lock().unwrap();
        if let Some(stdin) = guard.as_mut() {
            let mut s = serde_json::to_string(val).map_err(|e| e.to_string())?;
            s.push('\n');
            stdin
                .write_all(s.as_bytes())
                .map_err(|e| format!("写入 ACP stdin 失败: {}", e))?;
            stdin.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("ACP 子进程未运行".to_string())
        }
    }

    /// 处理从 ACP stdout 收到的 JSON-RPC 消息
    fn handle_acp_line(&self, line: &str) {
        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => return,
        };

        // 1. 如果是响应 initialize 的结果 -> 发送 notifications/initialized & session/new
        if let Some(id) = parsed.get("id").and_then(|i| i.as_i64()) {
            if id == 1 && parsed.get("result").is_some() {
                let _ = self.send_to_acp(&json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {}
                }));
                let session_id_req = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                let _ = self.send_to_acp(&json!({
                    "jsonrpc": "2.0",
                    "id": session_id_req,
                    "method": "session/new",
                    "params": {
                        "cwd": self.project_path,
                        "mcpServers": []
                    }
                }));
                return;
            }

            // 如果是 session/new 的响应
            if let Some(res) = parsed.get("result") {
                if let Some(sid) = res.get("sessionId").and_then(|s| s.as_str()) {
                    // 1. 缓存可用模型列表及当前模型
                    if let Some(config_options) = res.get("configOptions").and_then(|v| v.as_array()) {
                        for opt_cfg in config_options {
                            if opt_cfg.get("id").and_then(|v| v.as_str()) == Some("model") {
                                if let Some(cur) = opt_cfg.get("currentValue").and_then(|v| v.as_str()) {
                                    let mut cur_guard = self.current_model.lock().unwrap();
                                    if cur_guard.is_empty() {
                                        *cur_guard = cur.to_string();
                                    }
                                }
                                if let Some(opts) = opt_cfg.get("options").and_then(|v| v.as_array()) {
                                    *self.model_options.lock().unwrap() = opts.clone();
                                }
                                break;
                            }
                        }
                    }

                    // 2. 检查是否为指定群聊/用户发起的 session/new 请求（自动创建或 /new / /model 指令）
                    let maybe_pending = self.pending_session_requests.lock().unwrap().remove(&id);
                    if let Some(pending) = maybe_pending {
                        let chat_id = pending.chat_id;
                        let chat_type = pending.chat_type;

                        if let Some(old_sid) = self.chat_to_session.lock().unwrap().insert(chat_id.clone(), sid.to_string()) {
                            self.session_to_chat.lock().unwrap().remove(&old_sid);
                        }
                        self.session_to_chat.lock().unwrap().insert(sid.to_string(), chat_id.clone());

                        // 若该会话有待配置的目标模型，立即发送 session/set_config_option
                        let pending_model = self.pending_model_configs.lock().unwrap().remove(&chat_id);
                        if let Some(model_val) = pending_model {
                            let cfg_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                            let _ = self.send_to_acp(&json!({
                                "jsonrpc": "2.0",
                                "id": cfg_id,
                                "method": "session/set_config_option",
                                "params": {
                                    "sessionId": sid,
                                    "configId": "model",
                                    "value": model_val
                                }
                            }));
                        }

                        if let Some(prompt_text) = pending.initial_prompt {
                            // 首次接入自动建会话：继续发起 prompt
                            let prompt_req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                            self.pending_prompt_to_chat.lock().unwrap().insert(prompt_req_id, chat_id.clone());
                            let prompt_req = json!({
                                "jsonrpc": "2.0",
                                "id": prompt_req_id,
                                "method": "session/prompt",
                                "params": {
                                    "sessionId": sid,
                                    "prompt": [
                                        {
                                            "type": "text",
                                            "text": prompt_text
                                        }
                                    ]
                                }
                            });
                            if let Err(e) = self.send_to_acp(&prompt_req) {
                                eprintln!("[Hermes] 向 ACP 发送初始 prompt 失败: {}", e);
                                self.add_log("out", "Hermes", &chat_type, &format!("向 ACP 发送初始 prompt 失败: {}", e));
                                let _ = self.client.send_text_message(
                                    "chat_id",
                                    &chat_id,
                                    &format!("❌ [Hermes] 发送初始指令至 Agent 失败: {}", e),
                                );
                                let mut chats = self.active_chats.lock().unwrap();
                                if let Some(s) = chats.get_mut(&chat_id) {
                                    s.is_finished = true;
                                }
                            }
                        } else {
                            let _ = self.client.send_text_message(
                                "chat_id",
                                &chat_id,
                                &format!("🎉 [Hermes] 新对话就绪！Session ID: `{}`", sid),
                            );
                        }
                    } else {
                        // 首次启动默认 session（预热会话，等待首个接入的会话认领）
                        *self.current_acp_session_id.lock().unwrap() = Some(sid.to_string());
                    }

                    println!("[Hermes] ACP Session 创建成功: {}", sid);
                    return;
                }
            }

            // 检查是否有 pending_session_requests 出错
            if let Some(err) = parsed.get("error") {
                if let Some(pending) = self.pending_session_requests.lock().unwrap().remove(&id) {
                    let err_msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("创建会话失败");
                    let _ = self.client.send_text_message(
                        "chat_id",
                        &pending.chat_id,
                        &format!("❌ [Hermes] 启动新会话失败: {}", err_msg),
                    );
                    let mut chats = self.active_chats.lock().unwrap();
                    if let Some(s) = chats.get_mut(&pending.chat_id) {
                        s.is_finished = true;
                    }
                }
            }

            // 如果是 session/prompt 的完成响应
            if parsed.get("result").is_some() || parsed.get("error").is_some() {
                let target_chat_id = parsed
                    .get("id")
                    .and_then(|i| i.as_i64())
                    .and_then(|req_id| self.pending_prompt_to_chat.lock().unwrap().remove(&req_id));

                if let Some(err) = parsed.get("error") {
                    let err_msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("ACP 返回执行错误");
                    eprintln!("[Hermes] ACP 回复错误: {}", err);
                    if let Some(ref cid) = target_chat_id {
                        let _ = self.client.send_text_message(
                            "chat_id",
                            cid,
                            &format!("❌ [Hermes] 任务执行出错: {}", err_msg),
                        );
                    } else {
                        let chats = self.active_chats.lock().unwrap();
                        for cid in chats.keys() {
                            let _ = self.client.send_text_message(
                                "chat_id",
                                cid,
                                &format!("❌ [Hermes] 任务执行出错: {}", err_msg),
                            );
                        }
                    }
                }

                if let Some(chat_id) = target_chat_id {
                    self.flush_chat_finish(&chat_id);
                } else {
                    self.flush_all_active_chats_finish();
                }
                return;
            }
        }

        // 2. 如果是 ACP 发来的通知 (Notification)
        if let Some(method) = parsed.get("method").and_then(|m| m.as_str()) {
            match method {
                "session/update" => {
                    if let Some(params) = parsed.get("params") {
                        self.handle_session_update(params);
                    }
                }
                "session/request_permission" => {
                    let req_id = parsed.get("id").cloned().unwrap_or(json!(null));
                    if let Some(params) = parsed.get("params") {
                        self.handle_permission_request(req_id, params);
                    }
                }
                _ => {}
            }
        }
    }

    /// 发送单段回复文本（采用纯净 Markdown 卡片排版，异常时自动降级纯文本）
    fn send_segment(&self, chat_id: &str, chat_type: &str, segment: &str) {
        if segment.trim().is_empty() {
            return;
        }
        if let Err(e) = self.client.send_markdown_message("chat_id", chat_id, segment) {
            eprintln!("[Hermes] 发送回复文本段落失败: {}", e);
        }
        self.add_log(
            "out",
            "Hermes Agent",
            chat_type,
            &format!("发送回复: {}", truncate_str(segment, 40)),
        );
    }

    /// 提取并清空指定会话的当前文本缓冲，将其累加至总回复内容中
    fn flush_chat_buffer(&self, target_chat_id: &str) -> Option<(String, String)> {
        let mut chats = self.active_chats.lock().unwrap();
        let session = chats.get_mut(target_chat_id)?;
        let segment = session.current_chunk_buffer.trim().to_string();
        if segment.is_empty() {
            return None;
        }
        if !session.accumulated_content.is_empty() {
            session.accumulated_content.push_str("\n\n");
        }
        session.accumulated_content.push_str(&segment);
        session.current_chunk_buffer.clear();
        session.current_message_id = None;
        Some((session.chat_type.clone(), segment))
    }

    /// 处理流式内容更新：
    /// - 收到正式回复增量 (agent_message_chunk) 时在内存缓冲
    /// - 遇到工具调用、工具更新或思考过程时，立即将当前已缓冲文本作为独立段落发出
    /// - 彻底忽略思考过程和工具调用本身，不向飞书用户展示中间过程
    fn handle_session_update(&self, params: &serde_json::Value) {
        let sid = params.get("sessionId").and_then(|s| s.as_str());
        let target_chat_id = sid.and_then(|s| self.session_to_chat.lock().unwrap().get(s).cloned());

        let update = match params.get("update") {
            Some(u) => u,
            None => return,
        };

        let session_update = update
            .get("sessionUpdate")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if session_update == "agent_message_chunk" {
            let chunk = update
                .pointer("/content/text")
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if chunk.is_empty() {
                return;
            }

            let msg_id = update
                .get("messageId")
                .and_then(|m| m.as_str())
                .map(|s| s.to_string());

            let mut to_flush = Vec::new();
            {
                let mut chats = self.active_chats.lock().unwrap();
                for (chat_id, session) in chats.iter_mut() {
                    if session.is_finished {
                        continue;
                    }
                    if let Some(ref target) = target_chat_id {
                        if chat_id != target {
                            continue;
                        }
                    }

                    // 若 messageId 发生变化且当前缓冲非空，先冲刷上一条消息段落
                    if let Some(ref mid) = msg_id {
                        if let Some(ref cur_mid) = session.current_message_id {
                            if cur_mid != mid {
                                let segment = session.current_chunk_buffer.trim().to_string();
                                if !segment.is_empty() {
                                    if !session.accumulated_content.is_empty() {
                                        session.accumulated_content.push_str("\n\n");
                                    }
                                    session.accumulated_content.push_str(&segment);
                                    session.current_chunk_buffer.clear();
                                    to_flush.push((chat_id.clone(), session.chat_type.clone(), segment));
                                }
                            }
                        }
                        session.current_message_id = Some(mid.clone());
                    }

                    session.current_chunk_buffer.push_str(chunk);
                    session.last_updated = Instant::now();
                }
            }

            for (cid, ctype, seg) in to_flush {
                self.send_segment(&cid, &ctype, &seg);
            }
        } else if session_update == "tool_call"
            || session_update == "tool_call_update"
            || session_update == "agent_thought_chunk"
        {
            // 当 Agent 转向工具调用或思考过程时：
            // 若当前段落存在已缓冲的正式文本，立即将其作为独立段落发出；
            // 严格忽略思考过程和工具调用本身，不向群里发送任何思考或工具状态。
            let mut to_flush = Vec::new();
            {
                let mut chats = self.active_chats.lock().unwrap();
                for (chat_id, session) in chats.iter_mut() {
                    if session.is_finished {
                        continue;
                    }
                    if let Some(ref target) = target_chat_id {
                        if chat_id != target {
                            continue;
                        }
                    }
                    let segment = session.current_chunk_buffer.trim().to_string();
                    if !segment.is_empty() {
                        if !session.accumulated_content.is_empty() {
                            session.accumulated_content.push_str("\n\n");
                        }
                        session.accumulated_content.push_str(&segment);
                        session.current_chunk_buffer.clear();
                        session.current_message_id = None;
                        to_flush.push((chat_id.clone(), session.chat_type.clone(), segment));
                    }
                }
            }

            for (cid, ctype, seg) in to_flush {
                self.send_segment(&cid, &ctype, &seg);
            }
        }
    }

    /// 在任务执行完毕后，冲刷剩余文本段落，并落盘审计日志
    fn flush_chat_finish(&self, target_chat_id: &str) {
        if let Some((chat_type, segment)) = self.flush_chat_buffer(target_chat_id) {
            self.send_segment(target_chat_id, &chat_type, &segment);
        }

        let (c_type, total_content) = {
            let mut chats = self.active_chats.lock().unwrap();
            if let Some(session) = chats.get_mut(target_chat_id) {
                if session.is_finished {
                    return;
                }
                session.is_finished = true;
                (session.chat_type.clone(), session.accumulated_content.clone())
            } else {
                return;
            }
        };

        // 审计落盘：回答完成
        let cur_m = self.current_model.lock().unwrap().clone();
        self.audit_logger.record(&AuditRecord {
            timestamp: current_timestamp_str(),
            date: current_date_str(),
            direction: "out".to_string(),
            event_type: "agent_reply".to_string(),
            chat_id: target_chat_id.to_string(),
            chat_type: c_type,
            sender_id: "Hermes Agent".to_string(),
            model: if cur_m.is_empty() { None } else { Some(cur_m) },
            content: total_content,
            meta: json!({}),
        });
    }

    /// 冲刷所有活跃会话的剩余文本
    fn flush_all_active_chats_finish(&self) {
        let chat_ids: Vec<String> = {
            let chats = self.active_chats.lock().unwrap();
            chats.keys().cloned().collect()
        };
        for cid in chat_ids {
            self.flush_chat_finish(&cid);
        }
    }

    /// 处理权限申请
    fn handle_permission_request(&self, req_id: serde_json::Value, params: &serde_json::Value) {
        let tool_name = params
            .get("toolCall")
            .and_then(|t| t.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("unknown_tool");
        let description = params
            .get("description")
            .and_then(|d| d.as_str())
            .unwrap_or("请求调用系统工具");

        let uuid_str = format!("perm_{}", self.next_rpc_id.fetch_add(1, Ordering::SeqCst));

        // 优先根据 sessionId 定位目标 chat_id 发送权限确认卡片，兜底使用当前首个活跃 chat
        let sid_opt = params.get("sessionId").and_then(|s| s.as_str());
        let target_chat_id = sid_opt
            .and_then(|s| self.session_to_chat.lock().unwrap().get(s).cloned())
            .or_else(|| {
                let chats = self.active_chats.lock().unwrap();
                chats.keys().next().cloned()
            });

        let target_chat_id = match target_chat_id {
            Some(id) => id,
            None => return,
        };

        // 在发送权限卡片前，先冲刷前面已生成的说明文本段落
        if let Some((chat_type, segment)) = self.flush_chat_buffer(&target_chat_id) {
            self.send_segment(&target_chat_id, &chat_type, &segment);
        }

        // 解析 ACP 附带的权限选项列表，提取第一个允许类选项 ID
        let mut allow_option_id = None;
        if let Some(opts) = params.get("options").and_then(|o| o.as_array()) {
            for opt in opts {
                let kind = opt.get("kind").and_then(|k| k.as_str()).unwrap_or("");
                let oid = opt.get("optionId").and_then(|o| o.as_str());
                if (kind == "allow_once" || kind == "allow_always") && oid.is_some() {
                    allow_option_id = oid.map(|s| s.to_string());
                    break;
                }
            }
        }

        let perm_card = build_permission_request_card(&uuid_str, tool_name, description);
        let msg_id = match self.client.send_card_message("chat_id", &target_chat_id, &perm_card) {
            Ok(id) => {
                self.add_log("out", "Hermes", "p2p", &format!("已发送权限确认卡片: {}", tool_name));
                Some(id)
            }
            Err(e) => {
                eprintln!("[Hermes] 发送权限卡片失败: {}", e);
                let fallback_text = format!(
                    "⚠️ [Hermes] Agent 申请执行工具 `{}`，但交互卡片推送失败: {}\n如需继续，请检查飞书应用权限或配置。",
                    tool_name, e
                );
                let _ = self.client.send_text_message("chat_id", &target_chat_id, &fallback_text);
                self.add_log("out", "Hermes", "p2p", &format!("发送权限卡片失败: {}", tool_name));
                None
            }
        };

        self.pending_permissions.lock().unwrap().insert(
            uuid_str,
            PendingPermission {
                acp_request_id: req_id,
                tool_name: tool_name.to_string(),
                chat_id: target_chat_id,
                card_message_id: msg_id,
                allow_option_id,
            },
        );
    }

    fn handle_command_help(&self, chat_id: &str, chat_type: &str) {
        let reply = "🤖 **Hermes 指令帮助**\n\n\
                     支持的快捷指令如下：\n\
                     - `/help` : 查看指令帮助说明\n\
                     - `/stop` : 强制停止当前正在回答的任务\n\
                     - `/new` : 重置当前会话，开启全新的上下文对话\n\
                     - `/models` : 查看当前生效模型及支持切换的模型列表\n\
                     - `/model <模型名称>` (或 `/models <名称>`) : 切换指定模型并自动开启新会话\n\n\
                     💡 **使用提示:** 在群聊中可直接 `@机器人 /help` 或在私聊中直接发送。";
        let _ = self.client.send_text_message("chat_id", chat_id, reply);
        self.add_log("out", "Hermes", chat_type, "已返回指令帮助指南");
    }

    fn handle_command_stop(&self, chat_id: &str, chat_type: &str) {
        let sid_opt = self.chat_to_session.lock().unwrap().get(chat_id).cloned();

        let mut was_running = false;

        {
            let mut chats = self.active_chats.lock().unwrap();
            if let Some(session) = chats.get_mut(chat_id) {
                if !session.is_finished {
                    was_running = true;
                    session.is_finished = true;
                }
            }
        }

        if was_running {
            // 向 ACP 发送 session/cancel
            if let Some(ref sid) = sid_opt {
                let cancel_notify = json!({
                    "jsonrpc": "2.0",
                    "method": "session/cancel",
                    "params": {
                        "sessionId": sid
                    }
                });
                let _ = self.send_to_acp(&cancel_notify);
            }

            // 冲刷中止前已产生的部分文本段落
            if let Some((c_type, segment)) = self.flush_chat_buffer(chat_id) {
                self.send_segment(chat_id, &c_type, &segment);
            }

            let _ = self.client.send_text_message("chat_id", chat_id, "🛑 [Hermes] 任务已手动中止。");
            self.add_log("out", "Hermes", chat_type, "任务已手动强制停止");
        } else {
            let _ = self.client.send_text_message("chat_id", chat_id, "ℹ️ [Hermes] 当前没有正在执行的任务。");
            self.add_log("out", "Hermes", chat_type, "当前无正在执行任务，忽略 /stop");
        }
    }

    fn handle_command_new(&self, chat_id: &str, chat_type: &str) {
        let req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
        self.pending_session_requests.lock().unwrap().insert(
            req_id,
            PendingSessionRequest {
                chat_id: chat_id.to_string(),
                chat_type: chat_type.to_string(),
                initial_prompt: None,
            },
        );

        // 清理当前会话进行中的卡片状态
        self.active_chats.lock().unwrap().remove(chat_id);

        let _ = self.send_to_acp(&json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "session/new",
            "params": {
                "cwd": self.project_path,
                "mcpServers": []
            }
        }));

        let reply = "🎉 **Hermes 新会话启动中**\n已请求重置当前会话，正在为你建立全新上下文...";
        let _ = self.client.send_text_message("chat_id", chat_id, reply);
        self.add_log("out", "Hermes", chat_type, "已请求开启全新会话");
    }

    fn handle_command_model_list(&self, chat_id: &str, chat_type: &str) {
        let opts = self.model_options.lock().unwrap().clone();
        let cur = self.current_model.lock().unwrap().clone();

        let mut reply = String::new();
        reply.push_str("🤖 **Hermes 模型列表**\n\n");
        if !cur.is_empty() {
            reply.push_str(&format!("**当前生效模型:** `{}`\n\n", cur));
        }

        if opts.is_empty() {
            reply.push_str("当前正在连接 Agent，暂未获取到动态模型列表。常用支持模型:\n");
            reply.push_str("- `M3.1-Flash · thinking` (默认)\n");
            reply.push_str("- `M3.1-Flash`\n");
            reply.push_str("- `M3 · thinking`\n");
            reply.push_str("- `gemini-3.8-flash-tiered`\n");
            reply.push_str("- `claude-sonnet-4-6`\n");
        } else {
            reply.push_str("**支持切换的模型列表:**\n");
            for (idx, opt) in opts.iter().enumerate() {
                let name = opt.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let val = opt.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let is_cur = if !cur.is_empty() && (val == cur || name == cur) {
                    " *(当前)*"
                } else {
                    ""
                };
                reply.push_str(&format!("{}. `{}`{}\n", idx + 1, name, is_cur));
            }
        }

        reply.push_str("\n💡 **切换方式:** 发送 `/model <模型名称>` (或 `/models <名称>`) 即可切换并自动启动新对话。");
        let _ = self.client.send_text_message("chat_id", chat_id, &reply);
        self.add_log("out", "Hermes", chat_type, "已返回支持的模型列表");
    }

    fn handle_command_switch_model(&self, chat_id: &str, chat_type: &str, target: &str) {
        let opts = self.model_options.lock().unwrap().clone();
        let matched = match_model_option(target, &opts);
        match matched {
            Some(matched_val) => {
                let display_name = opts
                    .iter()
                    .find(|o| o.get("value").and_then(|v| v.as_str()) == Some(&matched_val))
                    .and_then(|o| o.get("name").and_then(|v| v.as_str()))
                    .unwrap_or(&matched_val)
                    .to_string();

                *self.current_model.lock().unwrap() = matched_val.clone();

                let req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                self.pending_session_requests.lock().unwrap().insert(
                    req_id,
                    PendingSessionRequest {
                        chat_id: chat_id.to_string(),
                        chat_type: chat_type.to_string(),
                        initial_prompt: None,
                    },
                );
                self.pending_model_configs.lock().unwrap().insert(chat_id.to_string(), matched_val);

                // 清理旧状态
                self.active_chats.lock().unwrap().remove(chat_id);

                let _ = self.send_to_acp(&json!({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "method": "session/new",
                    "params": {
                        "cwd": self.project_path,
                        "mcpServers": []
                    }
                }));

                let reply = format!(
                    "✅ **Hermes 模型已切换**\n已将模型切换为: `{}`\n正在自动为您启动全新会话...",
                    display_name
                );
                let _ = self.client.send_text_message("chat_id", chat_id, &reply);
                self.add_log("out", "Hermes", chat_type, &format!("已切换模型至: {}", display_name));
            }
            None => {
                let reply = format!(
                    "⚠️ 未找到匹配的模型: `{}`\n💡 请发送 `/models` 查看支持的模型名称列表。",
                    target
                );
                let _ = self.client.send_text_message("chat_id", chat_id, &reply);
                self.add_log("out", "Hermes", chat_type, &format!("未匹配到模型: {}", target));
            }
        }
    }
}

// ─── LarkEventHandler 实现 ──────────────────────────────────────────────────

impl LarkEventHandler for HermesBridge {
    fn on_connected(&self) {
        println!("[Hermes] 飞书 WebSocket 长连接已就绪");
        if let Ok(mut s) = self.status.lock() {
            s.state = "connected".to_string();
            s.error_message = None;
            s.connected_since = Some(chrono_like_now());
            self.broadcast_status(&s);
        }
    }

    fn on_disconnected(&self, reason: &str) {
        eprintln!("[Hermes] 飞书长连接中断: {}", reason);
        if let Ok(mut s) = self.status.lock() {
            if s.state != "stopped" && s.state != "error" {
                s.state = "connecting".to_string();
                s.error_message = Some(reason.to_string());
                self.broadcast_status(&s);
            }
        }
    }

    fn on_error(&self, reason: &str) {
        eprintln!("[Hermes] 飞书长连接发生致命错误: {}", reason);
        if let Ok(mut s) = self.status.lock() {
            if s.state != "stopped" {
                s.state = "error".to_string();
                s.error_message = Some(reason.to_string());
                self.broadcast_status(&s);
            }
        }
    }

    fn on_text_message(
        &self,
        chat_id: String,
        chat_type: String,
        message_id: String,
        sender_open_id: String,
        text: String,
    ) {
        let maybe_cmd = parse_hermes_command(&text);

        // 1. /stop 指令优先响应，绕过在途互斥拦截以强制中止当前任务
        if let Some(HermesCommand::Stop) = maybe_cmd {
            if !message_id.is_empty() {
                let client = self.client.clone();
                let mid = message_id.clone();
                thread::spawn(move || {
                    let _ = client.add_reaction(&mid, "OK");
                });
            }
            self.add_log("in", &sender_open_id, &chat_type, &text);
            self.handle_command_stop(&chat_id, &chat_type);
            return;
        }

        // 2. 会话在途互斥保护：若当前会话上一条任务还在执行中，忽略并发重发消息，避免并发冲突与双重回复
        {
            let chats = self.active_chats.lock().unwrap();
            if let Some(existing) = chats.get(&chat_id) {
                if !existing.is_finished {
                    println!("[Hermes] 会话 {} 正在执行上一条任务，忽略并发输入: {}", chat_id, text);
                    return;
                }
            }
        }

        // 3. 开始处理消息：第一时间对用户消息添加表情回复 (Reaction)
        if !message_id.is_empty() {
            let client = self.client.clone();
            let mid = message_id.clone();
            thread::spawn(move || {
                let _ = client.add_reaction(&mid, "OK");
            });
        }

        self.add_log("in", &sender_open_id, &chat_type, &text);

        // 审计落盘：记录每一条用户消息
        let cur_m = self.current_model.lock().unwrap().clone();
        self.audit_logger.record(&AuditRecord {
            timestamp: current_timestamp_str(),
            date: current_date_str(),
            direction: "in".to_string(),
            event_type: "user_message".to_string(),
            chat_id: chat_id.clone(),
            chat_type: chat_type.clone(),
            sender_id: sender_open_id.clone(),
            model: if cur_m.is_empty() { None } else { Some(cur_m) },
            content: text.clone(),
            meta: json!({ "message_id": message_id }),
        });

        // 4. 其他指令判断：/help / /new / /models / /model <name>
        if let Some(cmd) = maybe_cmd {
            match cmd {
                HermesCommand::Help => {
                    self.handle_command_help(&chat_id, &chat_type);
                    return;
                }
                HermesCommand::NewSession => {
                    self.handle_command_new(&chat_id, &chat_type);
                    return;
                }
                HermesCommand::ListModels => {
                    self.handle_command_model_list(&chat_id, &chat_type);
                    return;
                }
                HermesCommand::SwitchModel(target) => {
                    self.handle_command_switch_model(&chat_id, &chat_type, &target);
                    return;
                }
                HermesCommand::Stop => unreachable!(),
            }
        }

        // 5. 注册为当前活跃会话（无占位卡片，待收到 Agent 正式文本段落时直接发送）
        {
            let mut chats = self.active_chats.lock().unwrap();
            chats.insert(
                chat_id.clone(),
                ActiveChatSession {
                    current_chunk_buffer: String::new(),
                    accumulated_content: String::new(),
                    last_updated: Instant::now(),
                    is_finished: false,
                    chat_type: chat_type.clone(),
                    current_message_id: None,
                },
            );
        }

        // 7. 检查当前 chat_id 是否已有绑定的独立 Session
        let session_id_opt = {
            let mut chat_to_sess = self.chat_to_session.lock().unwrap();
            if let Some(sid) = chat_to_sess.get(&chat_id).cloned() {
                Some(sid)
            } else {
                // 首次接入：尝试认领启动时的初始预热 session（仅首个接入的会话可认领一次，认领后消耗为 None）
                if let Some(prewarmed_sid) = self.current_acp_session_id.lock().unwrap().take() {
                    chat_to_sess.insert(chat_id.clone(), prewarmed_sid.clone());
                    self.session_to_chat.lock().unwrap().insert(prewarmed_sid.clone(), chat_id.clone());
                    println!("[Hermes] 会话 {} 认领了初始独立 ACP Session: {}", chat_id, prewarmed_sid);
                    Some(prewarmed_sid)
                } else {
                    None
                }
            }
        };

        match session_id_opt {
            Some(session_id_str) => {
                let prompt_req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                self.pending_prompt_to_chat.lock().unwrap().insert(prompt_req_id, chat_id.clone());
                let prompt_req = json!({
                    "jsonrpc": "2.0",
                    "id": prompt_req_id,
                    "method": "session/prompt",
                    "params": {
                        "sessionId": session_id_str,
                        "prompt": [
                            {
                                "type": "text",
                                "text": text
                            }
                        ]
                    }
                });

                if let Err(e) = self.send_to_acp(&prompt_req) {
                    eprintln!("[Hermes] 向 ACP 发送 prompt 失败: {}", e);
                    self.add_log("out", "Hermes", &chat_type, &format!("向 ACP 发送 prompt 失败: {}", e));
                    let _ = self.client.send_text_message(
                        "chat_id",
                        &chat_id,
                        &format!("❌ [Hermes] 发送指令至 Agent 失败: {}", e),
                    );
                    let mut chats = self.active_chats.lock().unwrap();
                    if let Some(s) = chats.get_mut(&chat_id) {
                        s.is_finished = true;
                    }
                }
            }
            None => {
                // 首次接入且无可用预热 session：为该会话自动创建专属独立的 ACP Session，待创建成功后发送 prompt
                let new_session_req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
                self.pending_session_requests.lock().unwrap().insert(
                    new_session_req_id,
                    PendingSessionRequest {
                        chat_id: chat_id.clone(),
                        chat_type: chat_type.clone(),
                        initial_prompt: Some(text),
                    },
                );

                let cur_m = self.current_model.lock().unwrap().clone();
                if !cur_m.is_empty() {
                    self.pending_model_configs.lock().unwrap().insert(chat_id.clone(), cur_m);
                }

                println!(
                    "[Hermes] 会话 {} 首次接入，自动为其创建独立 ACP Session (req_id: {})",
                    chat_id, new_session_req_id
                );
                let _ = self.send_to_acp(&json!({
                    "jsonrpc": "2.0",
                    "id": new_session_req_id,
                    "method": "session/new",
                    "params": {
                        "cwd": self.project_path,
                        "mcpServers": []
                    }
                }));
            }
        }
    }

    fn on_card_action(&self, operator_open_id: String, action_value: serde_json::Value) {
        let action = action_value
            .get("action")
            .and_then(|a| a.as_str())
            .unwrap_or_default();
        let req_id = action_value
            .get("req_id")
            .and_then(|r| r.as_str())
            .unwrap_or_default();

        let pending_opt = self.pending_permissions.lock().unwrap().remove(req_id);
        if let Some(pending) = pending_opt {
            let approved = action == "approve";
            let decision_str = if approved { "approved" } else { "rejected" };

            // 1. 回复 ACP 权限结果（严格按照 ACP 规范的 outcome 对象结构）
            let outcome = if approved {
                let option_id = pending
                    .allow_option_id
                    .as_deref()
                    .unwrap_or("allow_once");
                json!({
                    "outcome": "selected",
                    "optionId": option_id
                })
            } else {
                json!({
                    "outcome": "cancelled"
                })
            };

            let rpc_resp = json!({
                "jsonrpc": "2.0",
                "id": pending.acp_request_id,
                "result": {
                    "outcome": outcome
                }
            });
            let _ = self.send_to_acp(&rpc_resp);

            // 2. 更新卡片为已处理状态
            if let Some(msg_id) = pending.card_message_id {
                let resolved_card = build_permission_resolved_card(
                    &pending.tool_name,
                    action,
                    &operator_open_id,
                );
                let _ = self.client.update_card_message(&msg_id, &resolved_card);
            }

            self.add_log(
                "in",
                &operator_open_id,
                "p2p",
                &format!("权限确认结果: {} -> {}", pending.tool_name, decision_str),
            );
        }
    }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────

#[allow(dead_code)]
fn resolve_acp_executable() -> Result<String, String> {
    // 1. 尝试环境变量中的 mcode
    if let Ok(path) = which::which("mcode") {
        return Ok(path.to_string_lossy().to_string());
    }
    // 2. 检查常见安装路径
    let home_opt = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from);

    if let Some(home) = home_opt {
        let standard_path = home.join(".minimax").join("bin").join("mcode.exe");
        if standard_path.exists() {
            return Ok(standard_path.to_string_lossy().to_string());
        }
        let standard_sh = home.join(".minimax").join("bin").join("mcode");
        if standard_sh.exists() {
            return Ok(standard_sh.to_string_lossy().to_string());
        }
    }
    // 3. 回退为直接运行 "mcode"（依靠系统 PATH）
    Ok("mcode".to_string())
}

#[cfg(test)]
fn extract_content_chunk(params: &serde_json::Value) -> String {
    let mut chunk = String::new();
    if let Some(update) = params.get("update") {
        let session_update = update
            .get("sessionUpdate")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // 核心过滤：只提取正式回复消息 (agent_message_chunk)，严禁提取思考过程 (agent_thought_chunk)
        // 与工具调用 (tool_call / tool_call_update) 发送给飞书用户。
        if session_update == "agent_message_chunk" {
            if let Some(text) = update.pointer("/content/text").and_then(|t| t.as_str()) {
                chunk.push_str(text);
            }
        } else if session_update.is_empty() {
            // 兜底无 sessionUpdate 标识的情况：严格排除包含 thought 或 tool 的内容
            if update.get("thought").is_none() && update.get("toolCall").is_none() {
                if let Some(content) = update.get("content") {
                    if let Some(text) = content.get("text").and_then(|t| t.as_str()) {
                        chunk.push_str(text);
                    }
                }
            }
        }
    }
    chunk
}

fn chrono_like_now() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let hour = (secs / 3600 + 8) % 24; // UTC+8
    let min = (secs / 60) % 60;
    let sec = secs % 60;
    format!("{:02}:{:02}:{:02}", hour, min, sec)
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        format!("{}...", s.chars().take(max_len).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hermes_command() {
        assert_eq!(parse_hermes_command("/help"), Some(HermesCommand::Help));
        assert_eq!(parse_hermes_command("@help"), Some(HermesCommand::Help));
        assert_eq!(parse_hermes_command("help"), Some(HermesCommand::Help));

        assert_eq!(parse_hermes_command("/stop"), Some(HermesCommand::Stop));
        assert_eq!(parse_hermes_command("@stop"), Some(HermesCommand::Stop));
        assert_eq!(parse_hermes_command("stop"), Some(HermesCommand::Stop));

        assert_eq!(parse_hermes_command("/new"), Some(HermesCommand::NewSession));
        assert_eq!(parse_hermes_command("@new"), Some(HermesCommand::NewSession));
        assert_eq!(parse_hermes_command("new"), Some(HermesCommand::NewSession));

        assert_eq!(parse_hermes_command("/models"), Some(HermesCommand::ListModels));
        assert_eq!(parse_hermes_command("@models"), Some(HermesCommand::ListModels));
        assert_eq!(parse_hermes_command("models"), Some(HermesCommand::ListModels));
        assert_eq!(parse_hermes_command("/model"), Some(HermesCommand::ListModels));
        assert_eq!(parse_hermes_command("@model-list"), Some(HermesCommand::ListModels));

        assert_eq!(
            parse_hermes_command("/models M3.1-Flash"),
            Some(HermesCommand::SwitchModel("M3.1-Flash".to_string()))
        );
        assert_eq!(
            parse_hermes_command("/model claude-sonnet-4-6"),
            Some(HermesCommand::SwitchModel("claude-sonnet-4-6".to_string()))
        );
        assert_eq!(
            parse_hermes_command("@model gemini-3.8-flash-tiered"),
            Some(HermesCommand::SwitchModel("gemini-3.8-flash-tiered".to_string()))
        );

        assert_eq!(parse_hermes_command("你好，请帮我写个脚本"), None);
        assert_eq!(parse_hermes_command(""), None);
    }

    #[test]
    fn test_extract_content_chunk_filters_thought_and_tools() {
        // 1. 正式回答内容应当被提取
        let msg_update = json!({
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {
                    "type": "text",
                    "text": "你好！这是回答正文"
                }
            }
        });
        assert_eq!(extract_content_chunk(&msg_update), "你好！这是回答正文");

        // 2. 思考过程 (thought) 必须被完全过滤
        let thought_update1 = json!({
            "update": {
                "sessionUpdate": "agent_thought_chunk",
                "content": {
                    "type": "text",
                    "text": "正在深入思考中..."
                }
            }
        });
        assert_eq!(extract_content_chunk(&thought_update1), "");

        let thought_update2 = json!({
            "update": {
                "sessionUpdate": "agent_thought_chunk",
                "thought": {
                    "text": "思考链细节"
                }
            }
        });
        assert_eq!(extract_content_chunk(&thought_update2), "");

        // 3. 工具调用 (tool_call) 必须被完全过滤
        let tool_update = json!({
            "update": {
                "sessionUpdate": "tool_call",
                "toolCall": {
                    "name": "bash",
                    "content": "ls -la"
                }
            }
        });
        assert_eq!(extract_content_chunk(&tool_update), "");
    }
}
