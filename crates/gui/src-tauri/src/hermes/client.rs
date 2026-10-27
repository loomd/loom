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
    pub msg: String,
    pub data: Option<WsEndpointData>,
}

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

pub struct LarkClient {
    pub app_id: String,
    pub app_secret: String,
    http_client: reqwest::blocking::Client,
    token_cache: Mutex<Option<(String, Instant)>>,
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
    pub fn get_ws_endpoint(&self) -> Result<String, String> {
        let url = format!("{}/callback/ws/endpoint", LARK_HOST);
        let resp = self
            .http_client
            .post(&url)
            .json(&json!({
                "AppID": self.app_id,
                "AppSecret": self.app_secret,
            }))
            .send()
            .map_err(|e| format!("请求飞书长连接接入点失败: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("获取接入点接口返回 HTTP 状态码: {}", resp.status()));
        }

        let body: WsEndpointResp = resp
            .json()
            .map_err(|e| format!("解析接入点响应失败: {}", e))?;

        if body.code != 0 {
            return Err(format!("获取长连接失败 ({}): {}", body.code, body.msg));
        }

        let data = body.data.ok_or_else(|| "接入点响应未包含数据".to_string())?;
        if data.url.is_empty() {
            return Err("飞书返回的 WebSocket URL 为空".to_string());
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
}

// ─── 卡片构建工具函数 ────────────────────────────────────────────────────────

/// 构建 Agent 思考中/流式回答卡片
pub fn build_agent_stream_card(title: &str, markdown_content: &str, is_finished: bool) -> serde_json::Value {
    let status_tag = if is_finished {
        "已完成"
    } else {
        "思考 / 执行中..."
    };
    let header_color = if is_finished { "green" } else { "blue" };

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
                    "content": if markdown_content.is_empty() { "..." } else { markdown_content }
                },
                {
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": format!("状态: {}", status_tag)
                        }
                    ]
                }
            ]
        }
    })
}

/// 构建权限确认请求卡片（包含批准/拒绝按钮）
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
                    "tag": "action",
                    "actions": [
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
                        },
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
        assert_eq!(body_elements[0]["content"], "测试输出");
    }

    #[test]
    fn test_build_permission_cards() {
        let req_card = build_permission_request_card("perm_1", "write_file", "写入 main.rs");
        let actions = &req_card["body"]["elements"][1]["actions"];
        assert_eq!(actions[0]["text"]["content"], "批准");
        assert_eq!(actions[1]["text"]["content"], "拒绝");

        let resolved_card = build_permission_resolved_card("write_file", "approve", "ou_123");
        let content = resolved_card["body"]["elements"][0]["content"].as_str().unwrap();
        assert!(content.contains("已批准"));
        assert!(content.contains("ou_123"));
    }

    #[test]
    fn test_ws_endpoint_url_path() {
        // 飞书长连接接口必须使用根路由 /callback/ws/endpoint，不能带 /open-apis 前缀
        let url = format!("{}/callback/ws/endpoint", LARK_HOST);
        assert_eq!(url, "https://open.feishu.cn/callback/ws/endpoint");
        assert!(!url.contains("/open-apis/callback"));
    }
}
