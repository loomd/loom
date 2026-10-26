//! 自建 Relay 适配层（桌面端）
//!
//! 职责：管理桌面端与自建 Relay Server 的连接（登录 / 注册 / 配对 / 解绑），
//! 拉起并守护当前工作区的 `mcode acp` 子进程，并在中继 WebSocket 与
//! ACP（Agent Client Protocol）之间做双向翻译。
//!
//! **注意命名**：本模块历史上叫 `app_server.rs`，是为了对接官方的
//! `mcode app-server --stdio`。但 `mcode app-server` 是**运行时服务**，只暴露
//! `account/*`、`server/prepareRestart`、`desktopService/transport`，
//! **不实现** `session/new` / `session/prompt`，无法承载 Agent 对话。
//! 真正的 Agent 协议服务是 `mcode acp`（stdin/stdout 上的 ACP / JSON-RPC 2.0），
//! 协议翻译在同目录的 `acp.rs`。这里改成 `relay_adapter.rs` 以免再次误用。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::acp::{frame as acp_frame, make_frame, AcpBridge, STOP_REASON_CANCELLED};
use loom_core::storage as cstore;

/// 取消请求的兜底超时（毫秒）。
///
/// 并非所有 Agent 都实现了 ACP `session/cancel`；超时未果时由桌面端直接结束
/// 该项目的 ACP 子进程，保证手机端的「停止」一定能生效。
const CANCEL_FALLBACK_TIMEOUT_MS: u64 = 3000;

/// 给下发手机端的帧补上项目标识。
///
/// 多个项目的 ACP 会话可以同时在跑，中继层又只是字节透传，帧本身不带归属信息。
/// 手机端据此把内容写回**产生它**的那个项目的会话，而不是当前正在看的项目，
/// 避免「对话中途切项目 → 内容串到别的项目」。
fn tag_project(frame: &str, project_id: &str) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(frame) else {
        return frame.to_string();
    };
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "projectId".to_string(),
            serde_json::Value::String(project_id.to_string()),
        );
    }
    serde_json::to_string(&value).unwrap_or_else(|_| frame.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProjectItem {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModelItem {
    pub id: String,
    pub name: String,
    pub args: Vec<String>,
}

pub fn get_available_remote_projects() -> Vec<RemoteProjectItem> {
    if let Ok(projects) = cstore::get_projects() {
        projects
            .into_iter()
            .map(|p| RemoteProjectItem {
                id: p.id,
                name: p.name,
                path: p.root_path.to_string_lossy().to_string(),
            })
            .collect()
    } else {
        Vec::new()
    }
}

pub fn get_available_remote_models() -> Vec<RemoteModelItem> {
    let mut list = vec![RemoteModelItem {
        id: "default".to_string(),
        name: "mcode (默认模型)".to_string(),
        args: vec![],
    }];

    if let Ok(templates) = cstore::get_templates() {
        for t in templates {
            if t.args.iter().any(|arg| arg == "--model" || arg.starts_with("--model="))
                || t.name.to_lowercase().contains("mcode")
                || t.name.to_lowercase().contains("mc")
            {
                list.push(RemoteModelItem {
                    id: t.id,
                    name: t.name,
                    args: t.args,
                });
            }
        }
    }

    list
}

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub server_url: String,
    pub username: Option<String>,
    pub token: Option<String>,
    pub token_expires_at: Option<u64>,
    /// 账号与手机端的绑定状态缓存（以中继服务端为准，本地仅作展示与按钮可见性判断）。
    #[serde(default)]
    pub mobile_paired: bool,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            server_url: "wss://agent.ccxcc.cn".to_string(),
            username: None,
            token: None,
            token_expires_at: None,
            mobile_paired: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayAuthResponse {
    pub ok: bool,
    pub data: Option<RelayAuthData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayAuthData {
    pub token: String,
    #[serde(default)]
    pub expires_at: u64,
    #[serde(default)]
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPairResponse {
    pub ok: bool,
    pub data: Option<RelayPairData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPairData {
    pub code: String,
    pub expires_at: u64,
}

/// 账号与手机端的绑定状态。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPairBindingData {
    pub paired: bool,
    #[serde(default)]
    pub paired_at: Option<String>,
    #[serde(default)]
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayPairBindingResponse {
    pub ok: bool,
    pub data: Option<RelayPairBindingData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSessionInfo {
    /// stopped | starting | waiting_pairing | waiting_mobile | connecting | connected
    pub status: String,
    pub pairing_code: Option<String>,
    pub workspace_dir: Option<String>,
    pub started_at_ms: Option<u64>,
    pub expires_at_ms: Option<u64>,
    pub pid: Option<u32>,
    pub mobile_device_name: Option<String>,
    pub message: Option<String>,
    pub relay_url: Option<String>,
    pub username: Option<String>,
    pub logged_in: bool,
    /// 账号是否已与手机端完成绑定。已绑定后重连不再需要配对码。
    pub mobile_paired: bool,
}

// ── Internal state ─────────────────────────────────────────────────────────

struct ManagedSession {
    info: RemoteSessionInfo,
    child: Option<Child>,
    /// Flag set when WebSocket relay thread detects mobile connected
    ws_connected: Arc<Mutex<bool>>,
    /// Flag set when the desktop's own relay WebSocket is alive.
    /// `None` = 尚未建立过连接；`Some(true)` = 在线；`Some(false)` = 曾在线后掉线（正在重连）
    desktop_online: Arc<Mutex<Option<bool>>>,
    /// Stop signal for the relay thread
    stop_signal: Arc<Mutex<bool>>,
}

static SESSIONS: OnceLock<Mutex<HashMap<String, ManagedSession>>> = OnceLock::new();
static RELAY_CONFIG: OnceLock<Mutex<RelayConfig>> = OnceLock::new();

fn get_sessions_map() -> &'static Mutex<HashMap<String, ManagedSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_relay_config() -> &'static Mutex<RelayConfig> {
    RELAY_CONFIG.get_or_init(|| Mutex::new(RelayConfig::default()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ── Config persistence ─────────────────────────────────────────────────────

/// 历史版本默认中继地址（明文 ws + 9099 端口），仅用于配置迁移识别
const LEGACY_RELAY_URL: &str = "ws://agent.ccxcc.cn:9099";

fn get_config_path() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("MINIMAX_DATA_DIR") {
        let p = std::path::PathBuf::from(dir);
        if p.exists() {
            return p.join("loom-relay-config.json");
        }
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = std::path::PathBuf::from(userprofile).join(".minimax");
        if p.exists() {
            return p.join("loom-relay-config.json");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = std::path::PathBuf::from(home).join(".minimax");
        if p.exists() {
            return p.join("loom-relay-config.json");
        }
    }
    std::path::PathBuf::from("loom-relay-config.json")
}

fn load_relay_config() -> RelayConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut cfg) = serde_json::from_str::<RelayConfig>(&content) {
                // 历史默认地址为明文 ws + 9099 端口，已改由 nginx TLS 终止，统一迁移到 HTTPS 入口
                if cfg.server_url == LEGACY_RELAY_URL {
                    cfg.server_url = RelayConfig::default().server_url;
                }
                return cfg;
            }
        }
    }
    RelayConfig::default()
}

fn save_relay_config(cfg: &RelayConfig) {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(path, json);
    }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))
}

fn api_url(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    // Convert ws:// to http:// and wss:// to https:// for API calls
    let http_base = base
        .replace("wss://", "https://")
        .replace("ws://", "http://");
    format!("{}{}", http_base, path)
}

/// 向中继申请一次性配对码（仅在账号尚未绑定手机端时使用）。
fn request_pairing_code(server_url: &str, token: &str) -> Result<RelayPairData, String> {
    let client = http_client()?;
    let pair_url = api_url(server_url, "/api/pair/create");

    let res = client
        .post(&pair_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("请求配对码失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("请求配对码失败 (HTTP {}): {}", status, err_text));
    }

    let parsed: RelayPairResponse = res
        .json()
        .map_err(|e| format!("解析配对码响应失败: {}", e))?;

    if !parsed.ok {
        return Err(parsed.error.unwrap_or_else(|| "请求配对码失败".to_string()));
    }

    parsed.data.ok_or_else(|| "响应中缺少配对码数据".to_string())
}

/// 查询中继侧的账号绑定状态：是否已与手机端完成绑定。
fn fetch_pair_binding(server_url: &str, token: &str) -> Result<bool, String> {
    let client = http_client()?;
    let url = api_url(server_url, "/api/pair/binding");

    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("查询绑定状态失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("查询绑定状态失败 (HTTP {}): {}", status, err_text));
    }

    let parsed: RelayPairBindingResponse = res
        .json()
        .map_err(|e| format!("解析绑定状态响应失败: {}", e))?;

    if !parsed.ok {
        return Err(parsed.error.unwrap_or_else(|| "查询绑定状态失败".to_string()));
    }

    Ok(parsed.data.map(|d| d.paired).unwrap_or(false))
}

/// 查询绑定状态并写入本地缓存，供界面展示与按钮可见性判断。
fn refresh_pair_binding_cache(server_url: &str, token: &str) -> bool {
    // 查询失败时保留原缓存：一次网络抖动不应把「已绑定」误判成「未绑定」
    let paired = match fetch_pair_binding(server_url, token) {
        Ok(paired) => paired,
        Err(_) => {
            return get_relay_config()
                .lock()
                .map(|cfg| cfg.mobile_paired)
                .unwrap_or(false);
        }
    };
    if let Ok(mut cfg) = get_relay_config().lock() {
        cfg.mobile_paired = paired;
        save_relay_config(&cfg);
    }
    paired
}

/// 异步刷新绑定缓存：绑定查询是一次网络请求，不应阻塞中继桥接线程的消息处理。
fn refresh_binding_cache_async(server_url: &str, token: &str) {
    let server_url = server_url.to_string();
    let token = token.to_string();
    std::thread::spawn(move || {
        refresh_pair_binding_cache(&server_url, &token);
    });
}

/// 根据「桌面端在线状态」「手机端在线状态」「是否已绑定」推导会话状态。
///
/// 关键点：**已绑定但手机端离线**不再退化成「等待配对」，
/// 而是「等待手机端自动重连」——双端绑定一次即可，后续直接建联。
fn apply_runtime_status(
    info: &mut RemoteSessionInfo,
    desktop_online: Option<bool>,
    mobile_online: bool,
) {
    if info.status == "stopped" || info.status == "starting" {
        return;
    }

    if mobile_online {
        info.status = "connected".to_string();
        info.message = Some("手机端已成功连接".to_string());
    } else if desktop_online == Some(false) {
        // 桌面端曾连上过中继又掉线 → 正在重连（配对码不因重连而消失）
        info.status = "connecting".to_string();
        info.message = Some("桌面端正在重新连接中继服务器".to_string());
    } else if info.mobile_paired {
        info.status = "waiting_mobile".to_string();
        info.message =
            Some("手机端当前离线，等待其自动重连（已绑定，无需重新输入配对码）".to_string());
    } else {
        info.status = "waiting_pairing".to_string();
        if info.pairing_code.is_some() {
            info.message = Some("配对码已生成，请在手机端输入配对码".to_string());
        }
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────

/// Get current relay configuration and login status
#[tauri::command]
pub fn get_relay_status() -> Result<RemoteSessionInfo, String> {
    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    // Check if there's an active session
    let map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    // Find any active session
    for sess in map.values() {
        if sess.info.status != "stopped" {
            let mut info = sess.info.clone();
            let mobile_online = sess
                .ws_connected
                .lock()
                .map(|c| *c)
                .unwrap_or(false);
            let desktop_online = sess.desktop_online.lock().map(|c| *c).unwrap_or(None);
            // 绑定状态以本地缓存的最新值为准：手机端配对成功后缓存会被刷新，
            // 若沿用会话启动时的快照，手机端一断连就会退回「等待配对」并重新弹配对码
            info.mobile_paired = cfg.mobile_paired;
            apply_runtime_status(&mut info, desktop_online, mobile_online);
            info.relay_url = Some(cfg.server_url.clone());
            info.username = cfg.username.clone();
            info.logged_in = cfg.token.is_some();
            return Ok(info);
        }
    }

    Ok(RemoteSessionInfo {
        status: "stopped".to_string(),
        pairing_code: None,
        workspace_dir: None,
        started_at_ms: None,
        expires_at_ms: None,
        pid: None,
        mobile_device_name: None,
        message: None,
        relay_url: Some(cfg.server_url.clone()),
        username: cfg.username.clone(),
        logged_in: cfg.token.is_some(),
        mobile_paired: cfg.mobile_paired,
    })
}

/// Update relay server URL
#[tauri::command]
pub fn set_relay_url(url: String) -> Result<(), String> {
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.server_url = url;
    save_relay_config(&cfg);
    Ok(())
}

/// Login to self-hosted relay server
#[tauri::command]
pub fn relay_login(server_url: String, username: String, password: String) -> Result<RelayAuthData, String> {
    let client = http_client()?;
    let url = api_url(&server_url, "/api/auth/login");

    let body = serde_json::json!({
        "username": username,
        "password": password
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("连接中继服务器失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("登录失败 (HTTP {}): {}", status, err_text));
    }

    let parsed: RelayAuthResponse = res
        .json()
        .map_err(|e| format!("解析登录响应失败: {}", e))?;

    if !parsed.ok {
        return Err(parsed.error.unwrap_or_else(|| "登录失败".to_string()));
    }

    let mut data = parsed.data.ok_or("响应中缺少登录数据")?;
    if data.username.is_empty() {
        data.username = username;
    }

    // Persist config
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.server_url = server_url.clone();
    cfg.username = Some(data.username.clone());
    cfg.token = Some(data.token.clone());
    cfg.token_expires_at = Some(data.expires_at);
    save_relay_config(&cfg);
    drop(cfg);

    // 登录后同步一次绑定状态：已绑定的账号开启会话时不再生成配对码
    refresh_pair_binding_cache(&server_url, &data.token);

    Ok(data)
}

/// Register on self-hosted relay server
#[tauri::command]
pub fn relay_register(server_url: String, username: String, password: String) -> Result<RelayAuthData, String> {
    let client = http_client()?;
    let url = api_url(&server_url, "/api/auth/register");

    let body = serde_json::json!({
        "username": username,
        "password": password
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("连接中继服务器失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("注册失败 (HTTP {}): {}", status, err_text));
    }

    let parsed: RelayAuthResponse = res
        .json()
        .map_err(|e| format!("解析注册响应失败: {}", e))?;

    if !parsed.ok {
        return Err(parsed.error.unwrap_or_else(|| "注册失败".to_string()));
    }

    let mut data = parsed.data.ok_or("响应中缺少注册数据")?;
    if data.username.is_empty() {
        data.username = username;
    }

    // Persist config
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.server_url = server_url.clone();
    cfg.username = Some(data.username.clone());
    cfg.token = Some(data.token.clone());
    cfg.token_expires_at = Some(data.expires_at);
    save_relay_config(&cfg);
    drop(cfg);

    // 注册后同步一次绑定状态（新账号必然是未绑定）
    refresh_pair_binding_cache(&server_url, &data.token);

    Ok(data)
}

/// Logout from relay server
#[tauri::command]
pub fn relay_logout() -> Result<(), String> {
    // Stop any active session first
    let map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    for sess in map.values() {
        if let Ok(mut stop) = sess.stop_signal.lock() {
            *stop = true;
        }
    }
    drop(map);

    // Clear all sessions
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    for (_, mut sess) in map.drain() {
        if let Some(mut child) = sess.child.take() {
            let _ = child.kill();
        }
    }

    // Clear auth
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.username = None;
    cfg.token = None;
    cfg.token_expires_at = None;
    cfg.mobile_paired = false;
    save_relay_config(&cfg);

    Ok(())
}

/// Start remote session: spawn mcode acp and connect to relay
#[tauri::command]
pub fn start_remote_session(workspace_dir: String) -> Result<RemoteSessionInfo, String> {
    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?
        .clone();

    let token = cfg.token.as_ref()
        .ok_or("未登录，请先在远程连接页面登录自建 Relay 账号")?
        .clone();

    let server_url = cfg.server_url.clone();

    // 默认开放所有已注册项目：确定初始项目与工作目录
    let projects = get_available_remote_projects();
    let (initial_workspace_dir, initial_project_id) = if !workspace_dir.trim().is_empty() {
        let pid = projects
            .iter()
            .find(|p| p.path == workspace_dir)
            .map(|p| p.id.clone())
            .unwrap_or_default();
        (workspace_dir, pid)
    } else if let Some(p) = projects.first() {
        (p.path.clone(), p.id.clone())
    } else {
        (
            std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            String::new(),
        )
    };

    let mobile_paired = refresh_pair_binding_cache(&server_url, &token);

    let mut pair_data: Option<RelayPairData> = None;
    if !mobile_paired {
        pair_data = Some(request_pairing_code(&server_url, &token)?);
    }

    // Stop existing session if any
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    for (_, mut existing) in map.drain() {
        if let Ok(mut stop) = existing.stop_signal.lock() {
            *stop = true;
        }
        if let Some(mut child) = existing.child.take() {
            let _ = child.kill();
        }
    }

    let ws_connected = Arc::new(Mutex::new(false));
    let desktop_online = Arc::new(Mutex::new(None));
    let stop_signal = Arc::new(Mutex::new(false));

    let (status, pairing_code, expires_at_ms, message) = match &pair_data {
        Some(data) => (
            "waiting_pairing".to_string(),
            Some(data.code.clone()),
            Some(data.expires_at),
            "配对码已生成，请在手机端输入配对码".to_string(),
        ),
        None => (
            "waiting_mobile".to_string(),
            None,
            None,
            "手机端已绑定，等待手机端自动连接（无需重新输入配对码）".to_string(),
        ),
    };

    let info = RemoteSessionInfo {
        status,
        pairing_code,
        workspace_dir: Some(initial_workspace_dir.clone()),
        started_at_ms: Some(now_ms()),
        expires_at_ms,
        pid: None,
        mobile_device_name: None,
        message: Some(message),
        relay_url: Some(server_url.clone()),
        username: cfg.username.clone(),
        logged_in: true,
        mobile_paired,
    };

    // Spawn relay bridge thread
    let stop_signal_clone = stop_signal.clone();
    let ws_url = format!(
        "{}/ws/desktop?token={}",
        server_url.trim_end_matches('/'),
        token
    );

    let bridge_flags = BridgeFlags {
        ws_connected: ws_connected.clone(),
        desktop_online: desktop_online.clone(),
        stop_signal: stop_signal_clone,
    };

    let initial_dir_for_thread = initial_workspace_dir.clone();
    let initial_pid_for_thread = initial_project_id;
    std::thread::spawn(move || {
        relay_bridge_thread(
            ws_url,
            RelayEndpoint {
                server_url,
                token,
            },
            initial_dir_for_thread,
            initial_pid_for_thread,
            bridge_flags,
        );
    });

    map.insert(
        initial_workspace_dir,
        ManagedSession {
            info: info.clone(),
            child: None,
            ws_connected,
            desktop_online,
            stop_signal,
        },
    );

    Ok(info)
}

/// 强制解绑手机端。
///
/// 解绑后手机端重连必须重新输入配对码；同时立刻为运行中的会话申请一枚新的
/// 配对码，用户可以在桌面端直接看到新的配对码并重新绑定。
#[tauri::command]
pub fn unbind_mobile() -> Result<(), String> {
    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?
        .clone();

    let token = cfg
        .token
        .as_ref()
        .ok_or("未登录，无法解除绑定")?
        .clone();

    let client = http_client()?;
    let url = api_url(&cfg.server_url, "/api/pair/unbind");

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("解除绑定失败: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().unwrap_or_default();
        return Err(format!("解除绑定失败 (HTTP {}): {}", status, err_text));
    }

    // 本地会话状态同步为「未绑定」，界面回到配对码流程
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    for sess in map.values_mut() {
        sess.info.mobile_paired = false;
        if sess.info.status == "stopped" {
            continue;
        }
        if let Ok(data) = request_pairing_code(&cfg.server_url, &token) {
            sess.info.pairing_code = Some(data.code.clone());
            sess.info.expires_at_ms = Some(data.expires_at);
        }
        sess.info.status = "waiting_pairing".to_string();
        sess.info.message = Some("绑定已解除，请重新输入配对码".to_string());
    }
    drop(map);

    // 同步本地绑定状态缓存
    if let Ok(mut cfg) = get_relay_config().lock() {
        cfg.mobile_paired = false;
        save_relay_config(&cfg);
    }

    Ok(())
}

/// Stop the remote session
#[tauri::command]
pub fn stop_remote_session(workspace_dir: String) -> Result<RemoteSessionInfo, String> {
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    if let Some(mut sess) = map.remove(&workspace_dir) {
        // Signal relay thread to stop
        if let Ok(mut stop) = sess.stop_signal.lock() {
            *stop = true;
        }
        // Kill child process
        if let Some(mut child) = sess.child.take() {
            let _ = child.kill();
        }
    }

    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    Ok(RemoteSessionInfo {
        status: "stopped".to_string(),
        pairing_code: None,
        workspace_dir: Some(workspace_dir),
        started_at_ms: None,
        expires_at_ms: None,
        pid: None,
        mobile_device_name: None,
        message: Some("已断开远程会话".to_string()),
        relay_url: Some(cfg.server_url.clone()),
        username: cfg.username.clone(),
        logged_in: cfg.token.is_some(),
        mobile_paired: false,
    })
}

/// Get status of the current session
#[tauri::command]
pub fn get_remote_session_status(workspace_dir: String) -> Result<RemoteSessionInfo, String> {
    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    let map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    if let Some(sess) = map.get(&workspace_dir) {
        let mut info = sess.info.clone();
        let mobile_online = sess.ws_connected.lock().map(|c| *c).unwrap_or(false);
        let desktop_online = sess.desktop_online.lock().map(|c| *c).unwrap_or(None);
        // 同上：状态推导必须使用最新的绑定缓存
        info.mobile_paired = cfg.mobile_paired;
        apply_runtime_status(&mut info, desktop_online, mobile_online);
        info.relay_url = Some(cfg.server_url.clone());
        info.username = cfg.username.clone();
        info.logged_in = cfg.token.is_some();
        Ok(info)
    } else {
        Ok(RemoteSessionInfo {
            status: "stopped".to_string(),
            pairing_code: None,
            workspace_dir: Some(workspace_dir),
            started_at_ms: None,
            expires_at_ms: None,
            pid: None,
            mobile_device_name: None,
            message: None,
            relay_url: Some(cfg.server_url.clone()),
            username: cfg.username.clone(),
            logged_in: cfg.token.is_some(),
            mobile_paired: cfg.mobile_paired,
        })
    }
}

/// Initialize relay config from disk on startup
pub fn init_relay_config() {
    let cfg = load_relay_config();
    let global = get_relay_config();
    if let Ok(mut g) = global.lock() {
        *g = cfg;
    }
}

// ── WebSocket relay bridge thread ──────────────────────────────────────────

/// Write JSON-RPC lines to the Agent's stdin. Returns false on write failure.
fn write_to_agent(stdin: &mut std::process::ChildStdin, lines: &[String]) -> bool {
    for line in lines {
        if writeln!(stdin, "{}", line).is_err() {
            return false;
        }
        let _ = stdin.flush();
    }
    true
}

/// 中继服务端点信息：桥接线程在手机端连接状态变化时用它刷新绑定缓存。
struct RelayEndpoint {
    server_url: String,
    token: String,
}

/// 启动 mcode acp 子进程（工作目录与附加参数）
fn spawn_mcode_acp(workspace_dir: &str, model_args: &[String]) -> Result<Child, String> {
    #[cfg(windows)]
    let (mut cmd, args_display) = {
        let mut c = Command::new("cmd");
        let mut args = vec!["/C".to_string(), "mcode".to_string()];
        args.extend(model_args.iter().cloned());
        args.push("acp".to_string());
        let display = args.join(" ");
        c.args(&args);
        (c, display)
    };

    #[cfg(not(windows))]
    let (mut cmd, args_display) = {
        let mut c = Command::new("mcode");
        let mut args = Vec::new();
        args.extend(model_args.iter().cloned());
        args.push("acp".to_string());
        let display = format!("mcode {}", args.join(" "));
        c.args(&args);
        (c, display)
    };

    eprintln!("[RELAY-AGENT] 正在拉起进程: {} (工作目录: {})", args_display, workspace_dir);

    cmd.current_dir(workspace_dir);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd.spawn().map_err(|e| format!("启动 mcode acp 失败: {}", e))?;
    eprintln!("[RELAY-AGENT] ✅ mcode acp 进程启动成功 (PID: {})", child.id());
    Ok(child)
}

/// 承载单个活跃 ACP 会话与子进程生命周期
#[allow(dead_code)]
struct ActiveAgentSession {
    child: Child,
    stdin: std::process::ChildStdin,
    bridge: AcpBridge,
    rx_out: std::sync::mpsc::Receiver<String>,
    stop_reader: Arc<Mutex<bool>>,
    _stdout_thread: Option<std::thread::JoinHandle<()>>,
    _stderr_thread: Option<std::thread::JoinHandle<()>>,
    pub workspace_dir: String,
    pub project_id: String,
    pub model_id: String,
    pub model_args: Vec<String>,
}

impl ActiveAgentSession {
    fn new(
        workspace_dir: String,
        project_id: String,
        model_id: String,
        model_args: Vec<String>,
    ) -> Result<Self, String> {
        let mut child = spawn_mcode_acp(&workspace_dir, &model_args)?;
        let mut stdin = child.stdin.take().ok_or("无法获取 mcode acp stdin")?;
        let stdout = child.stdout.take().ok_or("无法获取 mcode acp stdout")?;
        let stderr = child.stderr.take().ok_or("无法获取 mcode acp stderr")?;

        let (tx_out, rx_out) = std::sync::mpsc::channel::<String>();
        let stop_reader = Arc::new(Mutex::new(false));

        let stop_clone1 = stop_reader.clone();
        let stdout_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(stopped) = stop_clone1.lock() {
                    if *stopped {
                        break;
                    }
                }
                match line {
                    Ok(l) => {
                        if tx_out.send(l).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let stop_clone2 = stop_reader.clone();
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(stopped) = stop_clone2.lock() {
                    if *stopped {
                        break;
                    }
                }
                match line {
                    Ok(l) => eprintln!("[ACP] {}", l),
                    Err(_) => break,
                }
            }
        });

        let mut bridge = AcpBridge::new(workspace_dir.clone());
        for req in bridge.start() {
            let _ = writeln!(stdin, "{}", req);
            let _ = stdin.flush();
        }

        Ok(Self {
            child,
            stdin,
            bridge,
            rx_out,
            stop_reader,
            _stdout_thread: Some(stdout_thread),
            _stderr_thread: Some(stderr_thread),
            workspace_dir,
            project_id,
            model_id,
            model_args,
        })
    }

    fn stop(&mut self) {
        if let Ok(mut stopped) = self.stop_reader.lock() {
            *stopped = true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let pid = self.child.id();
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000)
                .output();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// 向 WebSocket 连接下发当前已注册项目与可用模型/模板列表
fn send_context_lists<S: std::io::Read + std::io::Write>(
    socket: &mut tungstenite::WebSocket<S>,
    current_project_id: &str,
    current_model_id: &str,
) {
    let projects = get_available_remote_projects();
    let models = get_available_remote_models();

    let proj_payload = serde_json::json!({
        "currentProjectId": current_project_id,
        "projects": projects,
    });
    let proj_frame = serde_json::json!({
        "type": "project_list",
        "payload": proj_payload.to_string(),
        "timestamp": now_ms(),
    });
    let _ = socket.send(tungstenite::Message::Text(proj_frame.to_string()));

    let model_payload = serde_json::json!({
        "currentModelId": current_model_id,
        "models": models,
    });
    let model_frame = serde_json::json!({
        "type": "model_list",
        "payload": model_payload.to_string(),
        "timestamp": now_ms(),
    });
    let _ = socket.send(tungstenite::Message::Text(model_frame.to_string()));
}

/// Relay 桥接线程共享的运行期标志。
struct BridgeFlags {
    /// 手机端是否已接入中继管道
    ws_connected: Arc<Mutex<bool>>,
    /// 桌面端自身的中继 WebSocket 状态：None=未连接过 / Some(true)=在线 / Some(false)=掉线重连中
    desktop_online: Arc<Mutex<Option<bool>>>,
    /// 停止信号
    stop_signal: Arc<Mutex<bool>>,
}

fn relay_bridge_thread(
    ws_url: String,
    endpoint: RelayEndpoint,
    initial_workspace_dir: String,
    initial_project_id: String,
    flags: BridgeFlags,
) {
    use std::time::Duration;
    use tungstenite::{connect, Message};

    let BridgeFlags {
        ws_connected,
        desktop_online,
        stop_signal,
    } = flags;

    // 多项目按需独立 ACP 会话池：每个项目独立工作区，只有开始对话后才为该项目创建对应模型的 ACP 进程
    let mut pool: HashMap<String, ActiveAgentSession> = HashMap::new();
    let mut active_project_id: String = initial_project_id.clone();
    let mut current_model_id: String = "default".to_string();
    let mut current_model_args: Vec<String> = vec![];

    println!(
        "[RELAY-BRIDGE] 远程会话已就绪，当前选定初始项目: {}，尚未产生对话，不提前拉起 ACP 进程",
        active_project_id
    );

    let mut retry_delay_ms = 1000u64;

    while let Ok(stopped) = stop_signal.lock() {
        if *stopped {
            break;
        }
        drop(stopped);

        eprintln!("[RELAY-BRIDGE] 正在连接中继 WebSocket: {}", ws_url);
        match connect(&ws_url) {
            Ok((mut socket, _response)) => {
                eprintln!("[RELAY-BRIDGE] WebSocket 连接成功");
                retry_delay_ms = 1000;
                if let Ok(mut online) = desktop_online.lock() {
                    *online = Some(true);
                }

                // Set read timeout on the underlying stream
                match socket.get_ref() {
                    tungstenite::stream::MaybeTlsStream::Plain(s) => {
                        let _ = s.set_read_timeout(Some(Duration::from_millis(100)));
                    }
                    tungstenite::stream::MaybeTlsStream::NativeTls(s) => {
                        let _ = s.get_ref().set_read_timeout(Some(Duration::from_millis(100)));
                    }
                    _ => {}
                }

                // Bridge loop
                loop {
                    if let Ok(stopped) = stop_signal.lock() {
                        if *stopped {
                            let _ = socket.close(None);
                            break;
                        }
                    }

                    // 1. 排空已激活项目的 stdout 并转发到手机端
                    let mut cancel_timeout_agents: Vec<String> = Vec::new();
                    for (pid, agent) in pool.iter_mut() {
                        while let Ok(line) = agent.rx_out.try_recv() {
                            if line.trim().is_empty() {
                                continue;
                            }
                            let actions = agent.bridge.on_agent_line(&line);
                            if !write_to_agent(&mut agent.stdin, &actions.to_agent) {
                                eprintln!("[RELAY-BRIDGE] 写入 Agent stdin 失败");
                                break;
                            }
                            let mut failed = false;
                            for frame in actions.to_mobile {
                                if let Err(e) = socket.send(Message::Text(tag_project(&frame, pid))) {
                                    eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                    failed = true;
                                    break;
                                }
                            }
                            if failed {
                                break;
                            }
                        }
                        // 兜底：Agent 未实现 session/cancel 时，超时后结束该会话
                        if agent.bridge.cancel_timed_out(CANCEL_FALLBACK_TIMEOUT_MS) {
                            cancel_timeout_agents.push(pid.clone());
                        }
                    }
                    for pid in cancel_timeout_agents {
                        if let Some(mut agent) = pool.remove(&pid) {
                            eprintln!(
                                "[RELAY-CANCEL] 项目【{}】的 Agent 未响应 session/cancel，结束该会话进程",
                                pid
                            );
                            agent.stop();
                            let frame = make_frame(acp_frame::CHAT_END, STOP_REASON_CANCELLED);
                            let _ = socket.send(Message::Text(tag_project(&frame, &pid)));
                        }
                    }

                    // 2. Read from WebSocket
                    match socket.read() {
                        Ok(msg) => match msg {
                            Message::Text(text) => {
                                // Check if this is a relay control message
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                                    if val.get("type").and_then(|v| v.as_str()) == Some("control") {
                                        if let Some(event) = val.get("event").and_then(|v| v.as_str()) {
                                            if event == "peer_connected" {
                                                if let Ok(mut c) = ws_connected.lock() {
                                                    *c = true;
                                                }
                                                eprintln!("[RELAY-BRIDGE] 手机端已连接，正在同步项目与模型列表");
                                                send_context_lists(&mut socket, &active_project_id, &current_model_id);

                                                refresh_binding_cache_async(
                                                    &endpoint.server_url,
                                                    &endpoint.token,
                                                );
                                            } else if event == "peer_disconnected" {
                                                if let Ok(mut c) = ws_connected.lock() {
                                                    *c = false;
                                                }
                                                eprintln!("[RELAY-BRIDGE] 手机端已断开");
                                                refresh_binding_cache_async(
                                                    &endpoint.server_url,
                                                    &endpoint.token,
                                                );
                                            }
                                        }
                                        continue;
                                    }

                                    // 处理多项目与模型切换协议
                                    let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                    if msg_type == "switch_project" {
                                        if let Some(payload_str) = val.get("payload").and_then(|v| v.as_str()) {
                                            if let Ok(req) = serde_json::from_str::<serde_json::Value>(payload_str) {
                                                if let Some(target_pid) = req.get("projectId").and_then(|v| v.as_str()) {
                                                    let projects = get_available_remote_projects();
                                                    if let Some(target_p) = projects.into_iter().find(|p| p.id == target_pid) {
                                                        eprintln!("[RELAY-PROJECT] 📁 手机端请求切换项目 -> 【{}】 (路径: {})", target_p.name, target_p.path);
                                                        active_project_id = target_p.id.clone();
                                                        let is_running = pool.contains_key(&active_project_id);
                                                        eprintln!("[RELAY-PROJECT] 💡 该项目 ACP 状态: {}", if is_running { "已常驻活跃" } else { "未拉起 (将在发送首条消息时按需创建)" });

                                                        let ack = serde_json::json!({
                                                            "type": "project_switched",
                                                            "payload": serde_json::json!({
                                                                "projectId": target_p.id,
                                                                "projectName": target_p.name,
                                                                "workspaceDir": target_p.path,
                                                            }).to_string(),
                                                            "timestamp": now_ms(),
                                                        });
                                                        let _ = socket.send(tungstenite::Message::Text(ack.to_string()));
                                                    }
                                                }
                                            }
                                        }
                                        continue;
                                    } else if msg_type == "switch_model" {
                                        eprintln!("[RELAY-MODEL] 🤖 收到手机端切换模型请求: {}", text);
                                        if let Some(payload_str) = val.get("payload").and_then(|v| v.as_str()) {
                                            if let Ok(req) = serde_json::from_str::<serde_json::Value>(payload_str) {
                                                if let Some(target_mid) = req.get("modelId").and_then(|v| v.as_str()) {
                                                    let models = get_available_remote_models();
                                                    if let Some(target_m) = models.into_iter().find(|m| m.id == target_mid) {
                                                        eprintln!("[RELAY-MODEL] 🎯 目标模型: 【{}】 (参数: {:?})", target_m.name, target_m.args);
                                                        current_model_id = target_m.id.clone();
                                                        current_model_args = target_m.args.clone();

                                                        // 若当前项目此前已经创建过旧模型的 Agent，则将其关闭并从池中移除；
                                                        // 新模型的 Agent 将在下一次发消息时按需重新拉起
                                                        if let Some(mut old_agent) = pool.remove(&active_project_id) {
                                                            eprintln!("[RELAY-MODEL] 🔄 已释放当前项目旧模型的 ACP 进程，等待下一次发消息时拉起新模型");
                                                            old_agent.stop();
                                                        } else {
                                                            eprintln!("[RELAY-MODEL] 💡 当前项目尚未创建进程，已记录选定模型，将在发消息时直接使用此模型拉起");
                                                        }

                                                        let ack = serde_json::json!({
                                                            "type": "model_switched",
                                                            "payload": serde_json::json!({
                                                                "modelId": target_m.id,
                                                                "modelName": target_m.name,
                                                            }).to_string(),
                                                            "timestamp": now_ms(),
                                                        });
                                                        let _ = socket.send(tungstenite::Message::Text(ack.to_string()));
                                                    }
                                                }
                                            }
                                        }
                                        continue;
                                    } else if msg_type == "get_context" {
                                        eprintln!("[RELAY-BRIDGE] 📋 收到 get_context 请求，下发已注册项目与可用模型列表");
                                        send_context_lists(&mut socket, &active_project_id, &current_model_id);
                                        continue;
                                    } else if msg_type == "stop" || msg_type == "cancel" {
                                        // 手机端叫停：不新建 ACP 进程，只对当前项目已有的会话发取消
                                        eprintln!("[RELAY-CANCEL] 收到手机端停止请求 (目标活动项目: {})", active_project_id);
                                        if let Some(agent) = pool.get_mut(&active_project_id) {
                                            let actions = agent.bridge.on_mobile_frame(&text);
                                            let pid = agent.project_id.clone();
                                            if !write_to_agent(&mut agent.stdin, &actions.to_agent) {
                                                eprintln!("[RELAY-BRIDGE] 写入 Agent stdin 失败");
                                            }
                                            for frame in actions.to_mobile {
                                                if let Err(e) = socket.send(Message::Text(tag_project(&frame, &pid))) {
                                                    eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                                    break;
                                                }
                                            }
                                        }
                                        continue;
                                    }
                                }

                                // 3. 收到手机端对话/业务消息：按需激活当前项目的 ACP 会话
                                eprintln!("[RELAY-CHAT] 💬 收到对话消息 (目标活动项目: {}): {}", active_project_id, text);

                                // 若当前项目尚未启动 ACP 会话，则在此时按需为该项目拉起对应模型的 mcode acp
                                if !pool.contains_key(&active_project_id) {
                                    let projects = get_available_remote_projects();
                                    let target_path = projects
                                        .iter()
                                        .find(|p| p.id == active_project_id)
                                        .map(|p| p.path.clone())
                                        .unwrap_or_else(|| initial_workspace_dir.clone());

                                    eprintln!(
                                        "[RELAY-CHAT] 🚀 项目【{}】首次对话触发！正在为其拉起专属 ACP 进程 (模型: 【{}】)...",
                                        active_project_id, current_model_id
                                    );

                                    match ActiveAgentSession::new(
                                        target_path,
                                        active_project_id.clone(),
                                        current_model_id.clone(),
                                        current_model_args.clone(),
                                    ) {
                                        Ok(agent) => {
                                            eprintln!("[RELAY-CHAT] ✅ 项目【{}】专属 ACP 会话建立完成！", active_project_id);
                                            pool.insert(active_project_id.clone(), agent);
                                        }
                                        Err(e) => {
                                            eprintln!("[RELAY-CHAT] ❌ 按需拉起 Agent 失败: {}", e);
                                        }
                                    }
                                }

                                if let Some(agent) = pool.get_mut(&active_project_id) {
                                    let actions = agent.bridge.on_mobile_frame(&text);
                                    let pid = agent.project_id.clone();
                                    if !write_to_agent(&mut agent.stdin, &actions.to_agent) {
                                        eprintln!("[RELAY-BRIDGE] 写入 Agent stdin 失败");
                                        break;
                                    }
                                    for frame in actions.to_mobile {
                                        if let Err(e) = socket.send(Message::Text(tag_project(&frame, &pid))) {
                                            eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                            break;
                                        }
                                    }
                                }
                            }
                            Message::Binary(_) => {}
                            Message::Ping(p) => {
                                let _ = socket.send(Message::Pong(p));
                            }
                            Message::Close(_) => {
                                eprintln!("[RELAY-BRIDGE] 服务端关闭了 WebSocket");
                                break;
                            }
                            _ => {}
                        },
                        Err(tungstenite::Error::Io(ref e))
                            if e.kind() == std::io::ErrorKind::WouldBlock
                                || e.kind() == std::io::ErrorKind::TimedOut =>
                        {
                            // Timeout, continue to next loop iteration
                        }
                        Err(e) => {
                            eprintln!("[RELAY-BRIDGE] 读取 WebSocket 异常: {}", e);
                            break;
                        }
                    }
                }

                if let Ok(mut c) = ws_connected.lock() {
                    *c = false;
                }
                if let Ok(mut online) = desktop_online.lock() {
                    *online = Some(false);
                }
            }
            Err(e) => {
                eprintln!("[RELAY-BRIDGE] 连接中继失败: {}, 将在 {}ms 后重试", e, retry_delay_ms);
                std::thread::sleep(Duration::from_millis(retry_delay_ms));
                retry_delay_ms = (retry_delay_ms * 2).min(30_000);
            }
        }
    }

    // 退出时彻底释放所有项目的 ACP 子进程
    for (_, mut agent) in pool.drain() {
        agent.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_relay_auth_response_with_username() {
        let json = r#"{"ok":true,"data":{"token":"abc","expiresAt":123456,"username":"user1"}}"#;
        let res: RelayAuthResponse = serde_json::from_str(json).expect("should deserialize");
        assert!(res.ok);
        let data = res.data.expect("data should exist");
        assert_eq!(data.token, "abc");
        assert_eq!(data.expires_at, 123456);
        assert_eq!(data.username, "user1");
    }

    #[test]
    fn test_deserialize_relay_auth_response_without_username_backward_compatible() {
        let json = r#"{"ok":true,"data":{"token":"abc","expiresAt":123456}}"#;
        let res: RelayAuthResponse = serde_json::from_str(json).expect("should deserialize without username");
        assert!(res.ok);
        let data = res.data.expect("data should exist");
        assert_eq!(data.token, "abc");
        assert_eq!(data.expires_at, 123456);
        assert_eq!(data.username, "");
    }

    #[test]
    fn test_tag_project_adds_project_id_to_frame() {
        let frame = r#"{"type":"chat","payload":"hi","timestamp":1}"#;
        let tagged = tag_project(frame, "proj-a");
        let v: serde_json::Value = serde_json::from_str(&tagged).expect("should be json");
        assert_eq!(v["type"], "chat");
        assert_eq!(v["payload"], "hi");
        assert_eq!(v["projectId"], "proj-a");
    }

    #[test]
    fn test_tag_project_keeps_non_json_frame() {
        let frame = "not a json frame";
        assert_eq!(tag_project(frame, "proj-a"), frame);
    }
}

