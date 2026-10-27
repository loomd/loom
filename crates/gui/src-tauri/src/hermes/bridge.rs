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
    build_agent_stream_card, build_permission_request_card, build_permission_resolved_card,
    LarkClient,
};
use super::ws::{LarkEventHandler, LarkWsClient};
use crate::acp::match_model_option;

#[derive(Debug, PartialEq, Eq)]
pub enum HermesCommand {
    Help,
    NewSession,
    ListModels,
    SwitchModel(String),
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
}

struct ActiveChatSession {
    card_message_id: Option<String>,
    fallback_text_mode: bool,
    accumulated_content: String,
    #[allow(dead_code)]
    last_updated: Instant,
    is_finished: bool,
    chat_type: String,
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
    pending_new_chat_commands: Arc<Mutex<HashMap<i64, String>>>,
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
            pending_new_chat_commands: Arc::new(Mutex::new(HashMap::new())),
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

                    // 2. 检查是否为指定群聊/用户发起的 session/new 指令
                    let maybe_chat_id = self.pending_new_chat_commands.lock().unwrap().remove(&id);
                    if let Some(chat_id) = maybe_chat_id {
                        self.chat_to_session.lock().unwrap().insert(chat_id.clone(), sid.to_string());
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

                        let _ = self.client.send_text_message(
                            "chat_id",
                            &chat_id,
                            &format!("🎉 [Hermes] 新对话就绪！Session ID: `{}`", sid),
                        );
                    } else {
                        // 首次启动默认 session
                        *self.current_acp_session_id.lock().unwrap() = Some(sid.to_string());
                    }

                    println!("[Hermes] ACP Session 创建成功: {}", sid);
                    return;
                }
            }

            // 如果是 session/prompt 的完成响应
            if parsed.get("result").is_some() || parsed.get("error").is_some() {
                self.flush_all_active_chats_finish();
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

    /// 处理流式内容更新（仅在内存累积文本，不实时请求飞书更新卡片，彻底规避飞书 API 频控限制）
    fn handle_session_update(&self, params: &serde_json::Value) {
        let content_chunk = extract_content_chunk(params);
        if content_chunk.is_empty() {
            return;
        }

        let sid = params.get("sessionId").and_then(|s| s.as_str());
        let target_chat_id = sid.and_then(|s| self.session_to_chat.lock().unwrap().get(s).cloned());

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
            session.accumulated_content.push_str(&content_chunk);
        }
    }

    /// 在文本输出完毕后，一次性将最终结果更新到飞书卡片（或纯文本发送），彻底规避飞书频控
    fn flush_all_active_chats_finish(&self) {
        let mut chats = self.active_chats.lock().unwrap();
        for (chat_id, session) in chats.iter_mut() {
            if session.is_finished {
                continue;
            }
            session.is_finished = true;
            if let Some(ref card_msg_id) = session.card_message_id {
                let card = build_agent_stream_card("Hermes Agent", &session.accumulated_content, true);
                if let Err(e) = self.client.update_card_message(card_msg_id, &card) {
                    eprintln!("[Hermes] 完成态更新卡片失败: {}，尝试降级发送纯文本", e);
                    let reply_text = if session.accumulated_content.trim().is_empty() {
                        "🤖 [Hermes] 任务已执行完毕。".to_string()
                    } else {
                        format!("🤖 [Hermes]\n{}", session.accumulated_content)
                    };
                    let _ = self.client.send_text_message("chat_id", chat_id, &reply_text);
                }
            } else if session.fallback_text_mode {
                let reply_text = if session.accumulated_content.trim().is_empty() {
                    "🤖 [Hermes] 任务已执行完毕。".to_string()
                } else {
                    format!("🤖 [Hermes]\n{}", session.accumulated_content)
                };
                let _ = self.client.send_text_message("chat_id", chat_id, &reply_text);
            }
            let c_type = session.chat_type.clone();
            self.add_log("out", "Hermes Agent", &c_type, &format!("回答完成: {}", truncate_str(&session.accumulated_content, 40)));

            // 审计落盘：回答完成
            let cur_m = self.current_model.lock().unwrap().clone();
            self.audit_logger.record(&AuditRecord {
                timestamp: current_timestamp_str(),
                date: current_date_str(),
                direction: "out".to_string(),
                event_type: "agent_reply".to_string(),
                chat_id: chat_id.clone(),
                chat_type: c_type,
                sender_id: "Hermes Agent".to_string(),
                model: if cur_m.is_empty() { None } else { Some(cur_m) },
                content: session.accumulated_content.clone(),
                meta: json!({
                    "card_message_id": session.card_message_id,
                    "fallback_text_mode": session.fallback_text_mode
                }),
            });
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

        // 寻找当前活跃的 chat_id 发送权限确认卡片
        let chats = self.active_chats.lock().unwrap();
        let target_chat_id = match chats.keys().next() {
            Some(id) => id.clone(),
            None => return,
        };

        let perm_card = build_permission_request_card(&uuid_str, tool_name, description);
        let msg_id = match self.client.send_card_message("chat_id", &target_chat_id, &perm_card) {
            Ok(id) => Some(id),
            Err(e) => {
                eprintln!("[Hermes] 发送权限卡片失败: {}", e);
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
            },
        );

        self.add_log("out", "Hermes", "p2p", &format!("请求权限确认: {}", tool_name));
    }

    fn handle_command_help(&self, chat_id: &str, chat_type: &str) {
        let reply = "🤖 **Hermes 指令帮助**\n\n\
                     支持的快捷指令如下：\n\
                     - `/help` : 查看指令帮助说明\n\
                     - `/new` : 重置当前会话，开启全新的上下文对话\n\
                     - `/models` : 查看当前生效模型及支持切换的模型列表\n\
                     - `/model <模型名称>` (或 `/models <名称>`) : 切换指定模型并自动开启新会话\n\n\
                     💡 **使用提示:** 在群聊中可直接 `@机器人 /help` 或在私聊中直接发送。";
        let _ = self.client.send_text_message("chat_id", chat_id, reply);
        self.add_log("out", "Hermes", chat_type, "已返回指令帮助指南");
    }

    fn handle_command_new(&self, chat_id: &str, chat_type: &str) {
        let req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
        self.pending_new_chat_commands.lock().unwrap().insert(req_id, chat_id.to_string());

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
                self.pending_new_chat_commands.lock().unwrap().insert(req_id, chat_id.to_string());
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
            s.state = "connecting".to_string();
            s.error_message = Some(reason.to_string());
            self.broadcast_status(&s);
        }
    }

    fn on_text_message(
        &self,
        chat_id: String,
        chat_type: String,
        _message_id: String,
        sender_open_id: String,
        text: String,
    ) {
        // 会话在途互斥保护：若当前会话上一条任务还在执行中，忽略并发重发消息，避免并发冲突与双重回复
        {
            let chats = self.active_chats.lock().unwrap();
            if let Some(existing) = chats.get(&chat_id) {
                if !existing.is_finished {
                    println!("[Hermes] 会话 {} 正在执行上一条任务，忽略并发输入: {}", chat_id, text);
                    return;
                }
            }
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
            meta: json!({ "message_id": _message_id }),
        });

        // 指令判断：/help / /new / /models / /model <name>
        if let Some(cmd) = parse_hermes_command(&text) {
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
            }
        }

        // 1. 尝试发送思考中占位卡片，失败则降级为纯文本提示
        let init_card = build_agent_stream_card("Hermes Agent", "正在分析任务...", false);
        let (card_msg_id, fallback_text_mode) = match self.client.send_card_message("chat_id", &chat_id, &init_card) {
            Ok(id) => {
                self.add_log("out", "Hermes", &chat_type, "已发送交互卡片: 正在分析任务...");
                (Some(id), false)
            }
            Err(e) => {
                eprintln!("[Hermes] 发送初始卡片失败: {}，尝试降级为纯文本", e);
                self.add_log("out", "Hermes", &chat_type, &format!("发送卡片失败 ({})，降级为纯文本", e));
                let _ = self.client.send_text_message("chat_id", &chat_id, "🤖 [Hermes] 收到消息，正在分析任务...");
                (None, true)
            }
        };

        // 2. 注册为当前活跃会话
        {
            let mut chats = self.active_chats.lock().unwrap();
            chats.insert(
                chat_id.clone(),
                ActiveChatSession {
                    card_message_id: card_msg_id,
                    fallback_text_mode,
                    accumulated_content: String::new(),
                    last_updated: Instant::now(),
                    is_finished: false,
                    chat_type: chat_type.clone(),
                },
            );
        }

        // 3. 向 ACP 发起 prompt（使用绑定到当前 chat 的 session_id）
        let session_id_str = {
            let chat_sid = self.chat_to_session.lock().unwrap().get(&chat_id).cloned();
            match chat_sid {
                Some(sid) => sid,
                None => {
                    let default_sid = self.current_acp_session_id.lock().unwrap().clone();
                    match default_sid {
                        Some(sid) => {
                            self.chat_to_session.lock().unwrap().insert(chat_id.clone(), sid.clone());
                            self.session_to_chat.lock().unwrap().insert(sid.clone(), chat_id.clone());
                            sid
                        }
                        None => "default".to_string(),
                    }
                }
            }
        };

        let prompt_req_id = self.next_rpc_id.fetch_add(1, Ordering::SeqCst);
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

            // 1. 回复 ACP 权限结果
            let rpc_resp = json!({
                "jsonrpc": "2.0",
                "id": pending.acp_request_id,
                "result": {
                    "outcome": decision_str
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
