use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use prost::Message as ProstMessage;
use tungstenite::{connect, Message};

use super::client::LarkClient;
use super::proto::{Frame, Header};

pub trait LarkEventHandler: Send + Sync + 'static {
    fn on_connected(&self);
    fn on_disconnected(&self, reason: &str);
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

    /// 启动后台长连接线程（支持断线自动指数退避重连）
    pub fn start_loop(self) {
        thread::spawn(move || {
            let mut backoff_secs = 2;
            while !self.stop_signal.load(Ordering::Relaxed) {
                // 1. 获取长连接 Endpoint
                let ws_url = match self.client.get_ws_endpoint() {
                    Ok(url) => {
                        backoff_secs = 2; // 重置退避
                        url
                    }
                    Err(err) => {
                        self.handler.on_disconnected(&format!("获取长连接端点失败: {}", err));
                        if self.sleep_interruptible(backoff_secs) {
                            break;
                        }
                        backoff_secs = (backoff_secs * 2).min(60);
                        continue;
                    }
                };

                // 2. 建立 WebSocket 连接
                let (mut socket, _) = match connect(ws_url) {
                    Ok(conn) => {
                        self.handler.on_connected();
                        conn
                    }
                    Err(err) => {
                        self.handler.on_disconnected(&format!("WebSocket 建连失败: {}", err));
                        if self.sleep_interruptible(backoff_secs) {
                            break;
                        }
                        backoff_secs = (backoff_secs * 2).min(60);
                        continue;
                    }
                };

                // 3. 消息循环
                while !self.stop_signal.load(Ordering::Relaxed) {
                    let msg = match socket.read() {
                        Ok(msg) => msg,
                        Err(err) => {
                            self.handler.on_disconnected(&format!("WebSocket 链接中断: {}", err));
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
                                let pong_frame = Frame {
                                    seq_id: frame.seq_id,
                                    log_id: frame.log_id,
                                    service: frame.service,
                                    method: 2, // 2: Pong
                                    headers: frame.headers,
                                    payload_encoding: None,
                                    payload_type: None,
                                    payload: None,
                                    log_id_new: frame.log_id_new,
                                };
                                let mut buf = Vec::new();
                                if pong_frame.encode(&mut buf).is_ok() {
                                    let _ = socket.send(Message::Binary(buf));
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
                            self.handler.on_disconnected("服务端关闭连接");
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
                    if let Ok(content_obj) = serde_json::from_str::<serde_json::Value>(content_str) {
                        if let Some(text) = content_obj.get("text").and_then(|t| t.as_str()) {
                            let cleaned_text = clean_text_mentions(text);
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

/// 清洗群聊中的 @机器人 文本（如 `@_user_1 你好` -> `你好`）
fn clean_text_mentions(raw: &str) -> String {
    let mut result = String::new();
    let mut in_mention = false;
    for ch in raw.chars() {
        if ch == '@' {
            in_mention = true;
            continue;
        }
        if in_mention {
            if ch.is_whitespace() {
                in_mention = false;
            }
            continue;
        }
        result.push(ch);
    }
    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text_mentions() {
        assert_eq!(clean_text_mentions("@_user_1 你好，世界"), "你好，世界");
        assert_eq!(clean_text_mentions("@bot 帮我写一段代码"), "帮我写一段代码");
        assert_eq!(clean_text_mentions("没有mention的消息"), "没有mention的消息");
    }
}
