use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use prost::Message as ProstMessage;
use tungstenite::{connect, Message};

use super::client::LarkClient;
use super::proto::{Frame, Header};

static GLOBAL_PROCESSED_IDS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn get_processed_ids() -> &'static Mutex<HashSet<String>> {
    GLOBAL_PROCESSED_IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn extract_service_id(url: &str) -> i32 {
    if let Some(pos) = url.find("service_id=") {
        let after = &url[pos + "service_id=".len()..];
        let num_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        num_str.parse::<i32>().unwrap_or(0)
    } else {
        0
    }
}

pub trait LarkEventHandler: Send + Sync + 'static {
    fn on_connected(&self);
    fn on_disconnected(&self, reason: &str);
    fn on_error(&self, reason: &str);
    fn on_text_message(
        &self,
        chat_id: String,
        chat_type: String,
        message_id: String,
        sender_open_id: String,
        text: String,
    );
    fn on_card_action(
        &self,
        operator_open_id: String,
        action_value: serde_json::Value,
    );
}

pub struct LarkWsClient {
    client: Arc<LarkClient>,
    handler: Arc<dyn LarkEventHandler>,
    stop_signal: Arc<AtomicBool>,
}

impl LarkWsClient {
    pub fn new(
        client: Arc<LarkClient>,
        handler: Arc<dyn LarkEventHandler>,
        stop_signal: Arc<AtomicBool>,
    ) -> Self {
        Self {
            client,
            handler,
            stop_signal,
        }
    }

    /// 启动后台长连接线程（支持心跳保活与智能重连）
    pub fn start_loop(self) {
        thread::spawn(move || {
            let mut backoff_secs = 2;
            let mut failed_attempts = 0;

            while !self.stop_signal.load(Ordering::Relaxed) {
                // 1. 获取长连接 Endpoint
                let ws_url = match self.client.get_ws_endpoint() {
                    Ok(url) => {
                        failed_attempts = 0;
                        backoff_secs = 2; // 重置退避
                        url
                    }
                    Err(err) => {
                        failed_attempts += 1;
                        if err.is_fatal {
                            eprintln!("[Hermes WS] 飞书鉴权/配置致命错误: {}", err);
                            self.handler.on_error(&err.message);
                            break; // 致命错误，停止重试
                        }

                        if failed_attempts >= 3 {
                            self.handler.on_error(&format!("多次连接失败 (已重试 {} 次): {}", failed_attempts, err.message));
                        } else {
                            self.handler.on_disconnected(&format!("获取端点失败: {}", err.message));
                        }

                        if self.sleep_interruptible(backoff_secs) {
                            break;
                        }
                        backoff_secs = (backoff_secs * 2).min(60);
                        continue;
                    }
                };

                let service_id = extract_service_id(&ws_url);

                // 2. 建立 WebSocket 连接
                let (mut socket, _) = match connect(&ws_url) {
                    Ok(conn) => {
                        failed_attempts = 0;
                        backoff_secs = 2;
                        self.handler.on_connected();
                        conn
                    }
                    Err(err) => {
                        failed_attempts += 1;
                        let err_msg = format!("WebSocket 建连失败: {}", err);
                        eprintln!("[Hermes WS] {}", err_msg);
                        if failed_attempts >= 3 {
                            self.handler.on_error(&format!("无法连接飞书长连接网关 (已尝试 {} 次): {}", failed_attempts, err));
                        } else {
                            self.handler.on_disconnected(&err_msg);
                        }

                        if self.sleep_interruptible(backoff_secs) {
                            break;
                        }
                        backoff_secs = (backoff_secs * 2).min(60);
                        continue;
                    }
                };

                // 设置底层 TCP 读取超时为 1 秒，以便循环响应 stop_signal 和发送心跳
                if let tungstenite::stream::MaybeTlsStream::NativeTls(stream) = socket.get_mut() {
                    let _ = stream.get_mut().set_read_timeout(Some(Duration::from_millis(1000)));
                }

                let mut last_ping = Instant::now();
                let ping_interval = Duration::from_secs(30);

                // 3. 消息循环
                while !self.stop_signal.load(Ordering::Relaxed) {
                    // 定时发送心跳 PingFrame 保活
                    if last_ping.elapsed() >= ping_interval {
                        let ping_frame = Frame {
                            seq_id: 0,
                            log_id: 0,
                            service: service_id,
                            method: 0, // FrameTypeControl
                            headers: vec![Header {
                                key: "type".to_string(),
                                value: "ping".to_string(),
                            }],
                            payload_encoding: None,
                            payload_type: None,
                            payload: None,
                            log_id_new: None,
                        };
                        let mut buf = Vec::new();
                        if ping_frame.encode(&mut buf).is_ok() {
                            if let Err(e) = socket.send(Message::Binary(buf)) {
                                eprintln!("[Hermes WS] 发送心跳 Ping 失败: {}", e);
                                if !self.stop_signal.load(Ordering::Relaxed) {
                                    self.handler.on_disconnected(&format!("发送心跳失败: {}", e));
                                }
                                break;
                            }
                        }
                        last_ping = Instant::now();
                    }

                    let msg = match socket.read() {
                        Ok(msg) => msg,
                        Err(tungstenite::Error::Io(ref e))
                            if e.kind() == std::io::ErrorKind::WouldBlock
                                || e.kind() == std::io::ErrorKind::TimedOut =>
                        {
                            // 读超时唤醒，继续检查 stop_signal 和心跳时间
                            continue;
                        }
                        Err(err) => {
                            if !self.stop_signal.load(Ordering::Relaxed) {
                                eprintln!("[Hermes WS] 读取连接中断: {}", err);
                                self.handler.on_disconnected(&format!("WebSocket 链接中断: {}", err));
                            }
                            break;
                        }
                    };

                    match msg {
                        Message::Binary(bin) => {
                            let frame = match Frame::decode(&bin[..]) {
                                Ok(f) => f,
                                Err(e) => {
                                    eprintln!("[Hermes WS] protobuf decode frame error: {}", e);
                                    continue;
                                }
                            };

                            // method = 0: 控制帧 (Ping/Pong)
                            if frame.method == 0 {
                                let is_ping = frame.headers.iter().any(|h| h.key == "type" && h.value == "ping");
                                if is_ping {
                                    let pong_frame = Frame {
                                        seq_id: frame.seq_id,
                                        log_id: frame.log_id,
                                        service: frame.service,
                                        method: 0, // 控制帧 method 必须是 0
                                        headers: vec![Header {
                                            key: "type".to_string(),
                                            value: "pong".to_string(),
                                        }],
                                        payload_encoding: None,
                                        payload_type: None,
                                        payload: None,
                                        log_id_new: frame.log_id_new,
                                    };
                                    let mut buf = Vec::new();
                                    if pong_frame.encode(&mut buf).is_ok() {
                                        let _ = socket.send(Message::Binary(buf));
                                    }
                                }
                                continue;
                            }

                            // method = 1: 数据帧 (业务事件)
                            if frame.method == 1 {
                                // 立即回复 ACK
                                let ack_frame = Frame {
                                    seq_id: frame.seq_id,
                                    log_id: frame.log_id,
                                    service: frame.service,
                                    method: 1,
                                    headers: vec![Header {
                                        key: "type".to_string(),
                                        value: "pong".to_string(),
                                    }],
                                    payload_encoding: None,
                                    payload_type: None,
                                    payload: Some(b"{\"code\":200}".to_vec()),
                                    log_id_new: frame.log_id_new,
                                };
                                let mut ack_buf = Vec::new();
                                if ack_frame.encode(&mut ack_buf).is_ok() {
                                    let _ = socket.send(Message::Binary(ack_buf));
                                }

                                // 派发处理业务 Payload
                                if let Some(payload_bytes) = frame.payload {
                                    if let Ok(json_val) = serde_json::from_slice::<serde_json::Value>(&payload_bytes) {
                                        self.dispatch_event(json_val);
                                    }
                                }
                            }
                        }
                        Message::Ping(p) => {
                            let _ = socket.send(Message::Pong(p));
                        }
                        Message::Close(_) => {
                            if !self.stop_signal.load(Ordering::Relaxed) {
                                self.handler.on_disconnected("服务端关闭连接");
                            }
                            break;
                        }
                        _ => {}
                    }
                }

                let _ = socket.close(None);
                if self.stop_signal.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(Duration::from_millis(1500));
            }
        });
    }

    fn sleep_interruptible(&self, secs: u64) -> bool {
        for _ in 0..(secs * 10) {
            if self.stop_signal.load(Ordering::Relaxed) {
                return true;
            }
            thread::sleep(Duration::from_millis(100));
        }
        false
    }

    fn dispatch_event(&self, root: serde_json::Value) {
        // 1. 根据 header.event_id 进行事件级去重，杜绝飞书服务端重发导致的重复触发
        if let Some(event_id) = root
            .get("header")
            .and_then(|h| h.get("event_id"))
            .and_then(|e| e.as_str())
        {
            if !event_id.is_empty() {
                let mut processed = get_processed_ids().lock().unwrap();
                if processed.contains(event_id) {
                    println!("[Hermes WS] 收到重复 event_id，已忽略: {}", event_id);
                    return;
                }
                if processed.len() >= 5000 {
                    processed.clear();
                }
                processed.insert(event_id.to_string());
            }
        }

        let event_type = root
            .get("header")
            .and_then(|h| h.get("event_type"))
            .and_then(|t| t.as_str())
            .unwrap_or_default();

        match event_type {
            "im.message.receive_v1" => {
                let event = match root.get("event") {
                    Some(e) => e,
                    None => return,
                };

                // 过滤机器人/应用自身发出的消息，防止群聊自循环
                let sender_type = event
                    .get("sender")
                    .and_then(|s| s.get("sender_type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("user");
                if sender_type == "app" || sender_type == "bot" {
                    return;
                }

                let message = match event.get("message") {
                    Some(m) => m,
                    None => return,
                };

                let chat_id = message
                    .get("chat_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let chat_type = message
                    .get("chat_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("p2p")
                    .to_string();
                let message_id = message
                    .get("message_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                // 2. 根据 message_id 进行全局消息级去重
                if !message_id.is_empty() {
                    let mut processed = get_processed_ids().lock().unwrap();
                    if processed.contains(&message_id) {
                        println!("[Hermes WS] 收到重复 message_id，已忽略: {}", message_id);
                        return;
                    }
                    if processed.len() >= 5000 {
                        processed.clear();
                    }
                    processed.insert(message_id.clone());
                }
                let sender_open_id = event
                    .get("sender")
                    .and_then(|s| s.get("sender_id"))
                    .and_then(|sid| sid.get("open_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                let msg_type = message
                    .get("message_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();

                // 仅处理文本类型消息
                if msg_type == "text" {
                    let content_str = message
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();
                    let mentions = message.get("mentions").and_then(|m| m.as_array());
                    if let Ok(content_obj) = serde_json::from_str::<serde_json::Value>(content_str) {
                        if let Some(text) = content_obj.get("text").and_then(|t| t.as_str()) {
                            // 群聊场景过滤：若群消息未 @ 机器人且不是斜杠指令，忽略群内普通闲聊
                            let has_mentions = mentions.map(|arr| !arr.is_empty()).unwrap_or(false);
                            let is_cmd = text.trim_start().starts_with('/') || text.trim_start().starts_with('@');
                            if chat_type == "group" && !has_mentions && !is_cmd {
                                return;
                            }

                            let cleaned_text = clean_text_mentions(text, mentions.map(|v| v.as_slice()));
                            if !cleaned_text.trim().is_empty() {
                                self.handler.on_text_message(
                                    chat_id,
                                    chat_type,
                                    message_id,
                                    sender_open_id,
                                    cleaned_text,
                                );
                            }
                        }
                    }
                }
            }
            "card.action.trigger" => {
                let event = match root.get("event") {
                    Some(e) => e,
                    None => return,
                };
                let operator_open_id = event
                    .get("operator")
                    .and_then(|o| o.get("open_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                if let Some(action_val) = event.get("action").and_then(|a| a.get("value")) {
                    self.handler.on_card_action(operator_open_id, action_val.clone());
                }
            }
            _ => {}
        }
    }
}

/// 清洗群聊中的 @机器人 文本（如飞书占位符 `@_user_1 你好` -> `你好`）
/// 注意：绝对不能粗暴吞掉用户输入的指令（如 `@models`、`@new`）
pub fn clean_text_mentions(raw: &str, mentions: Option<&[serde_json::Value]>) -> String {
    let mut cleaned = raw.to_string();

    // 1. 如果有飞书 mentions 数组，精确剔除各 mention 的 key（如 "@_user_1"）
    if let Some(mention_list) = mentions {
        for m in mention_list {
            if let Some(key) = m.get("key").and_then(|k| k.as_str()) {
                if !key.is_empty() {
                    cleaned = cleaned.replace(key, "");
                }
            }
        }
    }

    // 2. 兜底清洗飞书标准占位符格式: @_user_1, @_user_2 等
    let mut result = String::new();
    let chars: Vec<char> = cleaned.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '@' && i + 6 < chars.len() {
            let slice: String = chars[i..i + 7].iter().collect();
            if slice == "@_user_" {
                i += 7;
                while i < chars.len() && chars[i].is_ascii_digit() {
                    i += 1;
                }
                continue;
            }
        }
        result.push(chars[i]);
        i += 1;
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text_mentions() {
        // 飞书占位符被剔除
        assert_eq!(clean_text_mentions("@_user_1 你好，世界", None), "你好，世界");
        assert_eq!(clean_text_mentions("@_user_1 /models", None), "/models");
        assert_eq!(clean_text_mentions("@_user_1 @models", None), "@models");

        // 用户输入的 @ 指令必须完整保留，不能被误吞
        assert_eq!(clean_text_mentions("@models", None), "@models");
        assert_eq!(clean_text_mentions("@new", None), "@new");
        assert_eq!(clean_text_mentions("/models", None), "/models");
        assert_eq!(clean_text_mentions("/help", None), "/help");
        assert_eq!(clean_text_mentions("没有mention的消息", None), "没有mention的消息");

        // 通过 mentions key 精确清洗
        let mentions = vec![serde_json::json!({
            "key": "@_user_1",
            "name": "机器人"
        })];
        assert_eq!(clean_text_mentions("@_user_1 @models", Some(&mentions)), "@models");
    }

    #[test]
    fn test_extract_service_id() {
        let url = "wss://msg-frontier.feishu.cn/ws/v2?fpid=493&service_id=33554678&ticket=abc";
        assert_eq!(extract_service_id(url), 33554678);

        let url_no_sid = "wss://msg-frontier.feishu.cn/ws/v2?fpid=493";
        assert_eq!(extract_service_id(url_no_sid), 0);
    }
}
