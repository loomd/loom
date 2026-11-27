use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const LARK_HOST: &str = "https://open.feishu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantAccessTokenResp {
    pub code: i64,
    pub msg: String,
    #[serde(default)]
    pub tenant_access_token: String,
    #[serde(default)]
    pub expire: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEndpointData {
    #[serde(rename = "URL")]
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsEndpointResp {
    pub code: i64,
    #[serde(default)]
    pub msg: String,
    pub data: Option<WsEndpointData>,
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct LarkApiError {
    pub code: i64,
    pub message: String,
    pub is_fatal: bool,
}

impl std::fmt::Display for LarkApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.code > 0 {
            write!(f, "[{}] {}", self.code, self.message)
        } else {
            write!(f, "{}", self.message)
        }
    }
}

impl std::error::Error for LarkApiError {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRespData {
    pub message_id: String,
    pub chat_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageResp {
    pub code: i64,
    pub msg: String,
    pub data: Option<SendMessageRespData>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuotedMessageInfo {
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub msg_type: String,
    pub text: String,
}

pub struct LarkClient {
    pub app_id: String,
    pub app_secret: String,
    http_client: reqwest::blocking::Client,
    token_cache: Mutex<Option<(String, Instant)>>,
    user_name_cache: Mutex<HashMap<String, String>>,
    chat_name_cache: Mutex<HashMap<String, String>>,
    bot_open_id: Mutex<Option<String>>,
}

impl LarkClient {
    pub fn new(app_id: String, app_secret: String) -> Self {
        let http_client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();
        Self {
            app_id,
            app_secret,
            http_client,
            token_cache: Mutex::new(None),
            user_name_cache: Mutex::new(HashMap::new()),
            chat_name_cache: Mutex::new(HashMap::new()),
            bot_open_id: Mutex::new(None),
        }
    }

    /// 获取 tenant_access_token（带本地内存缓存）
    pub fn get_tenant_access_token(&self) -> Result<String, String> {
        let mut guard = self.token_cache.lock().map_err(|e| e.to_string())?;
        if let Some((token, expire_at)) = guard.as_ref() {
            if Instant::now() < *expire_at {
                return Ok(token.clone());
            }
        }

        let url = format!("{}/open-apis/auth/v3/tenant_access_token/internal", LARK_HOST);
        let resp = self
            .http_client
            .post(&url)
            .json(&json!({
                "app_id": self.app_id,
                "app_secret": self.app_secret,
            }))
            .send()
            .map_err(|e| format!("请求 tenant_access_token 失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("飞书鉴权接口返回 HTTP 状态码: {}", resp.status()));
        }

        let body: TenantAccessTokenResp = resp
            .json()
            .map_err(|e| format!("解析 tenant_access_token 响应失败: {}", e))?;

        if body.code != 0 || body.tenant_access_token.is_empty() {
            return Err(format!("飞书鉴权错误 ({}): {}", body.code, body.msg));
        }

        // 提前 300 秒刷新，以防临界失效
        let ttl_secs = (body.expire - 300).max(60) as u64;
        let expire_at = Instant::now() + Duration::from_secs(ttl_secs);
        *guard = Some((body.tenant_access_token.clone(), expire_at));

        Ok(body.tenant_access_token)
    }

    /// 获取长连接 (WebSocket) 接入点地址
    pub fn get_ws_endpoint(&self) -> Result<String, LarkApiError> {
        let url = format!("{}/callback/ws/endpoint", LARK_HOST);
        let resp = self
            .http_client
            .post(&url)
            .json(&json!({
                "AppID": self.app_id,
                "AppSecret": self.app_secret,
            }))
            .send()
            .map_err(|e| LarkApiError {
                code: -1,
                message: format!("请求飞书长连接接入点失败: {}", e),
                is_fatal: false,
            })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let is_client_err = status.is_client_error();
            return Err(LarkApiError {
                code: status.as_u16() as i64,
                message: format!("获取接入点接口返回 HTTP 状态码: {}", status),
                is_fatal: is_client_err,
            });
        }

        let body: WsEndpointResp = resp
            .json()
            .map_err(|e| LarkApiError {
                code: -1,
                message: format!("解析接入点响应失败: {}", e),
                is_fatal: false,
            })?;

        if body.code != 0 {
            let mut err_msg = body.msg;
            if err_msg.trim().is_empty() {
                if let Some(err_val) = &body.error {
                    if let Some(loc_msg) = err_val
                        .get("localizedMessage")
                        .and_then(|m| m.get("message"))
                        .and_then(|s| s.as_str())
                    {
                        if !loc_msg.trim().is_empty() {
                            err_msg = loc_msg.to_string();
                        }
                    }
                }
            }

            if err_msg.trim().is_empty() {
                err_msg = match body.code {
                    1000040346 => "飞书凭据无效，请检查 App ID 与 App Secret 是否匹配".to_string(),
                    99991663 => "App Secret 错误".to_string(),
                    99991668 => "App ID 不存在".to_string(),
                    99991677 => "应用尚未在飞书开放平台配置长连接 (WebSocket) 模式".to_string(),
                    _ => format!("飞书错误码: {}", body.code),
                };
            }

            let is_fatal = matches!(
                body.code,
                1000040346 | 99991663 | 99991668 | 99991677 | 40001
            );

            return Err(LarkApiError {
                code: body.code,
                message: format!("获取长连接失败 ({}): {}", body.code, err_msg),
                is_fatal,
            });
        }

        let data = body.data.ok_or_else(|| LarkApiError {
            code: -1,
            message: "接入点响应未包含数据".to_string(),
            is_fatal: true,
        })?;
        if data.url.is_empty() {
            return Err(LarkApiError {
                code: -1,
                message: "飞书返回的 WebSocket URL 为空".to_string(),
                is_fatal: true,
            });
        }

        Ok(data.url)
    }

    /// 发送纯文本消息
    #[allow(dead_code)]
    pub fn send_text_message(
        &self,
        receive_id_type: &str,
        receive_id: &str,
        text: &str,
    ) -> Result<String, String> {
        let token = self.get_tenant_access_token()?;
        let url = format!(
            "{}/open-apis/im/v1/messages?receive_id_type={}",
            LARK_HOST, receive_id_type
        );

        let content = json!({ "text": text }).to_string();
        let resp = self
            .http_client
            .post(&url)
            .bearer_auth(token)
            .json(&json!({
                "receive_id": receive_id,
                "msg_type": "text",
                "content": content,
            }))
            .send()
            .map_err(|e| format!("发送消息网络错误: {}", e))?;

        let body: SendMessageResp = resp
            .json()
            .map_err(|e| format!("解析发送消息响应失败: {}", e))?;

        if body.code != 0 {
            return Err(format!("发送消息失败 ({}): {}", body.code, body.msg));
        }

        let data = body.data.ok_or_else(|| "发送响应未包含 message_id".to_string())?;
        Ok(data.message_id)
    }

    /// 发送飞书交互卡片消息 (Card 2.0 / Interactive)
    pub fn send_card_message(
        &self,
        receive_id_type: &str,
        receive_id: &str,
        card_content_json: &serde_json::Value,
    ) -> Result<String, String> {
        let token = self.get_tenant_access_token()?;
        let url = format!(
            "{}/open-apis/im/v1/messages?receive_id_type={}",
            LARK_HOST, receive_id_type
        );

        let content_str = card_content_json.to_string();
        let resp = self
            .http_client
            .post(&url)
            .bearer_auth(token)
            .json(&json!({
                "receive_id": receive_id,
                "msg_type": "interactive",
                "content": content_str,
            }))
            .send()
            .map_err(|e| format!("发送卡片网络错误: {}", e))?;

        let body: SendMessageResp = resp
            .json()
            .map_err(|e| format!("解析发送卡片响应失败: {}", e))?;

        if body.code != 0 {
            return Err(format!("发送卡片失败 ({}): {}", body.code, body.msg));
        }

        let data = body.data.ok_or_else(|| "发送卡片响应缺少 message_id".to_string())?;
        Ok(data.message_id)
    }

    /// 更新/编辑已发送的卡片消息（用于打字机流式更新与状态变迁）
    pub fn update_card_message(
        &self,
        message_id: &str,
        card_content_json: &serde_json::Value,
    ) -> Result<(), String> {
        let token = self.get_tenant_access_token()?;
        let url = format!("{}/open-apis/im/v1/messages/{}", LARK_HOST, message_id);

        let content_str = card_content_json.to_string();
        let resp = self
            .http_client
            .patch(&url)
            .bearer_auth(token)
            .json(&json!({
                "content": content_str,
            }))
            .send()
            .map_err(|e| format!("更新卡片网络错误: {}", e))?;

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("解析更新卡片响应失败: {}", e))?;

        let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
        if code != 0 {
            let msg = body.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
            return Err(format!("更新卡片失败 ({}): {}", code, msg));
        }

        Ok(())
    }

    /// 对消息添加表情回复 (Reaction)
    pub fn add_reaction(&self, message_id: &str, emoji_type: &str) -> Result<(), String> {
        let token = self.get_tenant_access_token()?;
        let url = format!("{}/open-apis/im/v1/messages/{}/reactions", LARK_HOST, message_id);

        let resp = self
            .http_client
            .post(&url)
            .bearer_auth(token)
            .json(&json!({
                "reaction_type": {
                    "emoji_type": emoji_type
                }
            }))
            .send()
            .map_err(|e| format!("添加表情回复网络错误: {}", e))?;

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("解析添加表情回复响应失败: {}", e))?;

        let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
        if code != 0 {
            let msg = body.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
            return Err(format!("添加表情回复失败 ({}): {}", code, msg));
        }

        Ok(())
    }
    /// 发送 Markdown 卡片消息（无标题栏纯净排版，失败时自动降级为纯文本）
    pub fn send_markdown_message(
        &self,
        receive_id_type: &str,
        receive_id: &str,
        markdown: &str,
    ) -> Result<String, String> {
        let card = build_clean_markdown_card(markdown);
        match self.send_card_message(receive_id_type, receive_id, &card) {
            Ok(msg_id) => Ok(msg_id),
            Err(e) => {
                eprintln!("[Hermes] 发送纯净 Markdown 卡片失败: {}，降级为纯文本发送", e);
                self.send_text_message(receive_id_type, receive_id, markdown)
            }
        }
    }

    /// 缓存用户姓名
    pub fn cache_user_name(&self, open_id: &str, name: &str) {
        if open_id.is_empty() || name.is_empty() {
            return;
        }
        if let Ok(mut cache) = self.user_name_cache.lock() {
            cache.insert(open_id.to_string(), name.to_string());
        }
    }

    /// 获取用户姓名（带本地缓存和通讯录 API 查询兜底）
    pub fn get_user_name(&self, open_id: &str) -> Option<String> {
        if open_id.is_empty() {
            return None;
        }

        // 1. 优先查缓存
        if let Ok(cache) = self.user_name_cache.lock() {
            if let Some(name) = cache.get(open_id) {
                return Some(name.clone());
            }
        }

        // 2. 调飞书通讯录 API 获取用户信息
        let token = self.get_tenant_access_token().ok()?;
        let url = format!("{}/open-apis/contact/v3/users/{}?user_id_type=open_id", LARK_HOST, open_id);

        let resp = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let body: serde_json::Value = resp.json().ok()?;
        if body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1) != 0 {
            return None;
        }

        let user_obj = body.get("data").and_then(|d| d.get("user"))?;
        let name = user_obj
            .get("name")
            .and_then(|n| n.as_str())
            .or_else(|| user_obj.get("nickname").and_then(|n| n.as_str()))
            .filter(|s| !s.trim().is_empty())?;

        let name_str = name.trim().to_string();
        if let Ok(mut cache) = self.user_name_cache.lock() {
            cache.insert(open_id.to_string(), name_str.clone());
        }

        Some(name_str)
    }

    /// 缓存群名称
    #[allow(dead_code)]
    pub fn cache_chat_name(&self, chat_id: &str, name: &str) {
        if chat_id.is_empty() || name.is_empty() {
            return;
        }
        if let Ok(mut cache) = self.chat_name_cache.lock() {
            cache.insert(chat_id.to_string(), name.to_string());
        }
    }

    /// 获取群聊名称（带本地缓存与 IM 群信息 API 查询）
    pub fn get_chat_name(&self, chat_id: &str) -> Option<String> {
        if chat_id.is_empty() {
            return None;
        }

        // 1. 优先查缓存
        if let Ok(cache) = self.chat_name_cache.lock() {
            if let Some(name) = cache.get(chat_id) {
                return Some(name.clone());
            }
        }

        // 2. 调飞书群信息 API: GET /open-apis/im/v1/chats/:chat_id
        let token = self.get_tenant_access_token().ok()?;
        let url = format!("{}/open-apis/im/v1/chats/{}", LARK_HOST, chat_id);

        let resp = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .ok()?;

        if !resp.status().is_success() {
            return None;
        }

        let body: serde_json::Value = resp.json().ok()?;
        if body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1) != 0 {
            return None;
        }

        let chat_name = body
            .get("data")
            .and_then(|d| d.get("name"))
            .and_then(|n| n.as_str())
            .filter(|s| !s.trim().is_empty())?;

        let name_str = chat_name.trim().to_string();
        if let Ok(mut cache) = self.chat_name_cache.lock() {
            cache.insert(chat_id.to_string(), name_str.clone());
        }

        Some(name_str)
    }

    /// 获取当前机器人自身的 open_id（带本地内存缓存）
    pub fn get_bot_open_id(&self) -> Result<String, String> {
        if let Ok(guard) = self.bot_open_id.lock() {
            if let Some(id) = guard.as_ref() {
                if !id.is_empty() {
                    return Ok(id.clone());
                }
            }
        }

        let token = self.get_tenant_access_token()?;
        let url = format!("{}/open-apis/bot/v3/info", LARK_HOST);

        let resp = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .map_err(|e| format!("请求飞书机器人信息失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("飞书机器人信息接口返回 HTTP 状态码: {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("解析机器人信息响应失败: {}", e))?;

        let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
        if code != 0 {
            let msg = body.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
            return Err(format!("获取机器人信息失败 ({}): {}", code, msg));
        }

        let open_id = body
            .get("bot")
            .and_then(|b| b.get("open_id"))
            .and_then(|o| o.as_str())
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "机器人信息中缺少 open_id".to_string())?
            .trim()
            .to_string();

        if let Ok(mut guard) = self.bot_open_id.lock() {
            *guard = Some(open_id.clone());
        }

        Ok(open_id)
    }

    /// 读取已缓存的自身 open_id（不发起网络请求）
    pub fn cached_bot_open_id(&self) -> Option<String> {
        self.bot_open_id.lock().ok()?.clone()
    }

    /// 获取指定消息内容及发送者（用于引用回复感知）
    pub fn get_quoted_message_info(&self, message_id: &str) -> Result<QuotedMessageInfo, String> {
        if message_id.is_empty() {
            return Err("message_id 为空".to_string());
        }

        let token = self.get_tenant_access_token()?;
        let url = format!("{}/open-apis/im/v1/messages/{}", LARK_HOST, message_id);

        let resp = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .map_err(|e| format!("获取被引用消息网络错误: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("获取被引用消息接口 HTTP 状态码: {}", resp.status()));
        }

        let body: serde_json::Value = resp
            .json()
            .map_err(|e| format!("解析被引用消息响应失败: {}", e))?;

        let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
        if code != 0 {
            let msg = body.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
            return Err(format!("获取被引用消息失败 ({}): {}", code, msg));
        }

        let item = body
            .get("data")
            .and_then(|d| d.get("items"))
            .and_then(|items| items.as_array())
            .and_then(|arr| arr.first())
            .ok_or_else(|| "未找到被引用消息内容".to_string())?;

        let sender_id = item
            .get("sender")
            .and_then(|s| s.get("id"))
            .and_then(|id| id.as_str())
            .unwrap_or_default()
            .to_string();

        let sender_type = item
            .get("sender")
            .and_then(|s| s.get("sender_type"))
            .and_then(|st| st.as_str())
            .unwrap_or("user");

        let sender_name = if sender_type == "app" || sender_type == "bot" {
            Some("Hermes".to_string())
        } else if !sender_id.is_empty() {
            self.get_user_name(&sender_id)
        } else {
            None
        };

        let msg_type = item
            .get("msg_type")
            .and_then(|m| m.as_str())
            .unwrap_or("text")
            .to_string();

        let content_str = item
            .get("body")
            .and_then(|b| b.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or_default();

        let text = extract_text_from_message(&msg_type, content_str);

        Ok(QuotedMessageInfo {
            sender_id,
            sender_name,
            msg_type,
            text,
        })
    }

    /// 下载消息中的资源（如图片、文件等）
    pub fn download_message_resource(
        &self,
        message_id: &str,
        file_key: &str,
        resource_type: &str,
    ) -> Result<Vec<u8>, String> {
        if message_id.is_empty() || file_key.is_empty() {
            return Err("message_id 或 file_key 为空".to_string());
        }

        let token = self.get_tenant_access_token()?;
        let url = format!(
            "{}/open-apis/im/v1/messages/{}/resources/{}?type={}",
            LARK_HOST, message_id, file_key, resource_type
        );

        let resp = self
            .http_client
            .get(&url)
            .bearer_auth(token)
            .send()
            .map_err(|e| format!("下载消息资源网络错误: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("下载消息资源接口返回 HTTP 状态码: {}", resp.status()));
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();

        let bytes = resp
            .bytes()
            .map_err(|e| format!("读取消息资源数据流失败: {}", e))?
            .to_vec();

        if content_type.contains("application/json") {
            if let Ok(body) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
                if code != 0 {
                    let msg = body.get("msg").and_then(|m| m.as_str()).unwrap_or("未知错误");
                    return Err(format!("飞书下载资源失败 ({}): {}", code, msg));
                }
            }
        }

        Ok(bytes)
    }
}

/// 本地附件缓存目录路径
pub fn get_hermes_attachments_dir() -> std::path::PathBuf {
    let mut base_dir = loom_core::storage::manager::get_config_path();
    base_dir.pop();
    base_dir.join("hermes").join("attachments")
}

/// 检查并获取已缓存的附件本地绝对路径
pub fn get_cached_attachment_path(file_key: &str, ext: &str) -> Option<std::path::PathBuf> {
    let attach_dir = get_hermes_attachments_dir();
    let filename = if ext.is_empty() {
        file_key.to_string()
    } else {
        format!("{}.{}", file_key, ext.trim_start_matches('.'))
    };
    let file_path = attach_dir.join(filename);
    if file_path.exists() {
        Some(file_path)
    } else {
        None
    }
}

/// 保存消息资源到本地持久化缓存目录并返回绝对路径
pub fn save_attachment(file_key: &str, ext: &str, bytes: &[u8]) -> Result<std::path::PathBuf, String> {
    let attach_dir = get_hermes_attachments_dir();
    if let Err(e) = std::fs::create_dir_all(&attach_dir) {
        return Err(format!("创建 attachments 目录失败: {}", e));
    }
    let filename = if ext.is_empty() {
        file_key.to_string()
    } else {
        format!("{}.{}", file_key, ext.trim_start_matches('.'))
    };
    let file_path = attach_dir.join(filename);
    if let Err(e) = std::fs::write(&file_path, bytes) {
        return Err(format!("写入 attachment 文件失败: {}", e));
    }
    Ok(file_path)
}

/// 从 post 富文本中提取出的内容结构
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExtractedPostContent {
    /// 展平后的文本内容（包含标题、段落、代码块、链接等）
    pub text: String,
    /// 包含的所有图片 key（按出现顺序排列，去重）
    pub image_keys: Vec<String>,
}

/// 解析 post 富文本中的文字、代码块与图片 key
pub fn extract_post_content(parsed: &serde_json::Value) -> ExtractedPostContent {
    let mut result_lines = Vec::new();
    let mut image_keys = Vec::new();

    let lang_obj = if let Some(zh) = parsed.get("zh_cn") {
        Some(zh)
    } else if let Some(map) = parsed.as_object() {
        // 如果存在其它语言或者未嵌套语言
        if map.contains_key("content") {
            Some(parsed)
        } else {
            map.values().next()
        }
    } else {
        None
    };

    if let Some(post) = lang_obj {
        if let Some(title) = post.get("title").and_then(|t| t.as_str()) {
            if !title.trim().is_empty() {
                result_lines.push(title.to_string());
            }
        }
        if let Some(paragraphs) = post.get("content").and_then(|c| c.as_array()) {
            for p in paragraphs {
                if let Some(elements) = p.as_array() {
                    let mut line = String::new();
                    for elem in elements {
                        let tag = elem.get("tag").and_then(|t| t.as_str()).unwrap_or("");
                        match tag {
                            "text" => {
                                if let Some(txt) = elem.get("text").and_then(|t| t.as_str()) {
                                    line.push_str(txt);
                                }
                            }
                            "code_block" => {
                                let code = elem.get("text").and_then(|t| t.as_str()).unwrap_or_default();
                                let lang = elem.get("language").and_then(|l| l.as_str()).unwrap_or("");
                                if !line.is_empty() {
                                    result_lines.push(std::mem::take(&mut line));
                                }
                                result_lines.push(format!("```{}\n{}\n```", lang, code));
                            }
                            "a" => {
                                let txt = elem.get("text").and_then(|t| t.as_str()).unwrap_or("");
                                let href = elem.get("href").and_then(|h| h.as_str()).unwrap_or("");
                                if !href.is_empty() && !txt.is_empty() && txt != href {
                                    line.push_str(&format!("[{}]({})", txt, href));
                                } else if !txt.is_empty() {
                                    line.push_str(txt);
                                } else {
                                    line.push_str(href);
                                }
                            }
                            "at" => {
                                // 优先保留 @_user_1 等占位符 key，以便上层 clean_text_mentions 剔除
                                if let Some(key) = elem.get("key").and_then(|k| k.as_str()) {
                                    line.push_str(key);
                                } else if let Some(name) = elem.get("user_name").and_then(|n| n.as_str()) {
                                    line.push_str(&format!("@{}", name));
                                }
                            }
                            "img" => {
                                if let Some(k) = elem.get("image_key").and_then(|k| k.as_str()) {
                                    if !k.is_empty() && !image_keys.contains(&k.to_string()) {
                                        image_keys.push(k.to_string());
                                    }
                                }
                            }
                            "emotion" => {
                                if let Some(emoji_type) = elem.get("emoji_type").and_then(|e| e.as_str()) {
                                    line.push_str(&format!("[{}]", emoji_type));
                                }
                            }
                            _ => {}
                        }
                    }
                    if !line.is_empty() {
                        result_lines.push(line);
                    }
                }
            }
        }
    }

    ExtractedPostContent {
        text: result_lines.join("\n"),
        image_keys,
    }
}

/// 从飞书消息体中提取纯文本可读内容
pub fn extract_text_from_message(msg_type: &str, content_json_str: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(content_json_str) {
        Ok(v) => v,
        Err(_) => return content_json_str.to_string(),
    };

    match msg_type {
        "text" => parsed
            .get("text")
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .to_string(),
        "post" => {
            let extracted = extract_post_content(&parsed);
            if extracted.text.is_empty() {
                if !extracted.image_keys.is_empty() {
                    format!("[图片 * {}]", extracted.image_keys.len())
                } else {
                    "[富文本消息]".to_string()
                }
            } else {
                extracted.text
            }
        }
        "image" => "[图片]".to_string(),
        "file" => "[文件]".to_string(),
        "audio" => "[语音]".to_string(),
        "media" => "[视频]".to_string(),
        "share_chat" => "[群名片]".to_string(),
        "share_user" => "[个人名片]".to_string(),
        "interactive" => "[卡片消息]".to_string(),
        _ => format!("[{}]", msg_type),
    }
}

// ─── 卡片构建工具函数 ────────────────────────────────────────────────────────

/// 构建无头部横幅的纯净 Markdown 卡片
pub fn build_clean_markdown_card(markdown_content: &str) -> serde_json::Value {
    json!({
        "schema": "2.0",
        "body": {
            "elements": [
                {
                    "tag": "markdown",
                    "content": markdown_content
                }
            ]
        }
    })
}

/// 构建 Agent 思考中/流式回答卡片
#[allow(dead_code)]
pub fn build_agent_stream_card(title: &str, markdown_content: &str, is_finished: bool) -> serde_json::Value {
    let status_tag = if is_finished {
        "已完成"
    } else {
        "思考 / 执行中..."
    };
    let header_color = if is_finished { "green" } else { "blue" };

    let content = if markdown_content.is_empty() {
        format!("*{}*", status_tag)
    } else if is_finished {
        markdown_content.to_string()
    } else {
        format!("{}\n\n---\n*{}*", markdown_content, status_tag)
    };

    json!({
        "schema": "2.0",
        "header": {
            "title": {
                "tag": "plain_text",
                "content": format!("🤖 {}", title)
            },
            "template": header_color
        },
        "body": {
            "elements": [
                {
                    "tag": "markdown",
                    "content": content
                }
            ]
        }
    })
}

/// 构建权限确认请求卡片（采用飞书卡片 2.0 规范的 column_set 分栏并排展示批准/拒绝按钮）
pub fn build_permission_request_card(
    req_id: &str,
    tool_name: &str,
    detail: &str,
) -> serde_json::Value {
    json!({
        "schema": "2.0",
        "header": {
            "title": {
                "tag": "plain_text",
                "content": "⚠️ 权限确认请求"
            },
            "template": "orange"
        },
        "body": {
            "elements": [
                {
                    "tag": "markdown",
                    "content": format!("**Agent 正在申请调用工具:** `{}`\n\n**请求详情:**\n```\n{}\n```", tool_name, detail)
                },
                {
                    "tag": "column_set",
                    "flex_mode": "flow",
                    "background_style": "default",
                    "columns": [
                        {
                            "tag": "column",
                            "width": "auto",
                            "weight": 1,
                            "vertical_align": "top",
                            "elements": [
                                {
                                    "tag": "button",
                                    "text": {
                                        "tag": "plain_text",
                                        "content": "批准"
                                    },
                                    "type": "primary",
                                    "value": {
                                        "action": "approve",
                                        "req_id": req_id
                                    }
                                }
                            ]
                        },
                        {
                            "tag": "column",
                            "width": "auto",
                            "weight": 1,
                            "vertical_align": "top",
                            "elements": [
                                {
                                    "tag": "button",
                                    "text": {
                                        "tag": "plain_text",
                                        "content": "拒绝"
                                    },
                                    "type": "danger",
                                    "value": {
                                        "action": "reject",
                                        "req_id": req_id
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    })
}

/// 构建权限已被处理后的卡片展示
pub fn build_permission_resolved_card(
    tool_name: &str,
    decision: &str,
    operator: &str,
) -> serde_json::Value {
    let (status_text, color) = if decision == "approve" {
        ("已批准", "green")
    } else {
        ("已拒绝", "red")
    };
    json!({
        "schema": "2.0",
        "header": {
            "title": {
                "tag": "plain_text",
                "content": "权限确认结果"
            },
            "template": color
        },
        "body": {
            "elements": [
                {
                    "tag": "markdown",
                    "content": format!("工具 `{}` 的权限请求 **{}**（操作人: {}）", tool_name, status_text, operator)
                }
            ]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_agent_stream_card() {
        let card = build_agent_stream_card("Hermes Agent", "测试输出", false);
        let schema = card.get("schema").and_then(|s| s.as_str());
        assert_eq!(schema, Some("2.0"));
        let title = card["header"]["title"]["content"].as_str().unwrap();
        assert!(title.contains("Hermes Agent"));
        let body_elements = card["body"]["elements"].as_array().unwrap();
        assert_eq!(body_elements[0]["tag"], "markdown");
        assert!(body_elements[0]["content"].as_str().unwrap().contains("测试输出"));
        assert!(body_elements[0]["content"].as_str().unwrap().contains("思考 / 执行中..."));
    }

    #[test]
    fn test_build_permission_cards() {
        let req_card = build_permission_request_card("perm_1", "write_file", "写入 main.rs");
        assert_eq!(req_card["schema"], "2.0");
        let col_set = &req_card["body"]["elements"][1];
        assert_eq!(col_set["tag"], "column_set");
        let btn_approve = &col_set["columns"][0]["elements"][0];
        let btn_reject = &col_set["columns"][1]["elements"][0];
        assert_eq!(btn_approve["text"]["content"], "批准");
        assert_eq!(btn_reject["text"]["content"], "拒绝");

        let resolved_card = build_permission_resolved_card("write_file", "approve", "ou_123");
        let content = resolved_card["body"]["elements"][0]["content"].as_str().unwrap();
        assert!(content.contains("已批准"));
        assert!(content.contains("ou_123"));
    }

    #[test]
    fn test_build_clean_markdown_card() {
        let card = build_clean_markdown_card("## 标题\n- 列表项\n```rust\nlet x = 1;\n```");
        assert_eq!(card["schema"], "2.0");
        assert!(card.get("header").is_none(), "纯净卡片不应包含彩色头部横幅");
        let body_elements = card["body"]["elements"].as_array().unwrap();
        assert_eq!(body_elements[0]["tag"], "markdown");
        assert!(body_elements[0]["content"].as_str().unwrap().contains("## 标题"));
    }

    #[test]
    fn test_ws_endpoint_url_path() {
        // 飞书长连接接口必须使用根路由 /callback/ws/endpoint，不能带 /open-apis 前缀
        let url = format!("{}/callback/ws/endpoint", LARK_HOST);
        assert_eq!(url, "https://open.feishu.cn/callback/ws/endpoint");
        assert!(!url.contains("/open-apis/callback"));
    }

    #[test]
    fn test_extract_text_from_message() {
        // 纯文本
        let text_json = serde_json::json!({ "text": "你好，Loom" }).to_string();
        assert_eq!(extract_text_from_message("text", &text_json), "你好，Loom");

        // 富文本 post
        let post_json = serde_json::json!({
            "zh_cn": {
                "title": "公告标题",
                "content": [
                    [
                        { "tag": "text", "text": "第一段文字 " },
                        { "tag": "at", "user_name": "张三" }
                    ],
                    [
                        { "tag": "text", "text": "第二段正文" }
                    ]
                ]
            }
        }).to_string();
        let extracted = extract_text_from_message("post", &post_json);
        assert!(extracted.contains("公告标题"));
        assert!(extracted.contains("第一段文字 @张三"));
        assert!(extracted.contains("第二段正文"));

        // 多媒体类型占位
        assert_eq!(extract_text_from_message("image", "{}"), "[图片]");
        assert_eq!(extract_text_from_message("file", "{}"), "[文件]");
    }

    #[test]
    fn test_extract_post_content_with_code_and_multi_images() {
        let post_json = serde_json::json!({
            "zh_cn": {
                "title": "测试图文与代码混排",
                "content": [
                    [
                        { "tag": "text", "text": "请看这段脚本与两张截图：" },
                        { "tag": "at", "key": "@_user_1", "user_name": "子飞鱼" }
                    ],
                    [
                        { "tag": "code_block", "language": "bash", "text": "git status\ngit push" }
                    ],
                    [
                        { "tag": "img", "image_key": "img_111" },
                        { "tag": "text", "text": " 第一张图说明" }
                    ],
                    [
                        { "tag": "img", "image_key": "img_222" },
                        { "tag": "img", "image_key": "img_111" } // 重复 key 测试去重
                    ]
                ]
            }
        });

        let extracted = extract_post_content(&post_json);
        assert!(extracted.text.contains("测试图文与代码混排"));
        assert!(extracted.text.contains("请看这段脚本与两张截图：@_user_1"));
        assert!(extracted.text.contains("```bash\ngit status\ngit push\n```"));
        assert!(extracted.text.contains("第一张图说明"));
        assert_eq!(extracted.image_keys, vec!["img_111".to_string(), "img_222".to_string()]);
    }

    #[test]
    fn test_client_caches() {
        let client = LarkClient::new("app_id".to_string(), "app_secret".to_string());
        client.cache_user_name("ou_123", "张三");
        assert_eq!(client.get_user_name("ou_123"), Some("张三".to_string()));
        assert_eq!(client.get_user_name(""), None);

        client.cache_chat_name("oc_456", "研发讨论群");
        assert_eq!(client.get_chat_name("oc_456"), Some("研发讨论群".to_string()));
        assert_eq!(client.get_chat_name(""), None);
    }
}
