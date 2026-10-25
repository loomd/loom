use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::acp::AcpBridge;

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
pub struct AppServerSessionInfo {
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
    info: AppServerSessionInfo,
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
    let paired = fetch_pair_binding(server_url, token).unwrap_or(false);
    if let Ok(mut cfg) = get_relay_config().lock() {
        cfg.mobile_paired = paired;
        save_relay_config(&cfg);
    }
    paired
}

/// 根据「桌面端在线状态」「手机端在线状态」「是否已绑定」推导会话状态。
///
/// 关键点：**已绑定但手机端离线**不再退化成「等待配对」，
/// 而是「等待手机端自动重连」——双端绑定一次即可，后续直接建联。
fn apply_runtime_status(
    info: &mut AppServerSessionInfo,
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
pub fn get_relay_status() -> Result<AppServerSessionInfo, String> {
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
            apply_runtime_status(&mut info, desktop_online, mobile_online);
            info.relay_url = Some(cfg.server_url.clone());
            info.username = cfg.username.clone();
            info.logged_in = cfg.token.is_some();
            info.mobile_paired = cfg.mobile_paired;
            return Ok(info);
        }
    }

    Ok(AppServerSessionInfo {
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
pub fn start_app_server(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
    let cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?
        .clone();

    let token = cfg.token.as_ref()
        .ok_or("未登录，请先在远程连接页面登录自建 Relay 账号")?
        .clone();

    let server_url = cfg.server_url.clone();

    // 查询账号绑定状态：已绑定的手机端重连不需要配对码，
    // 只有未绑定时才生成一次性配对码。
    let mobile_paired = refresh_pair_binding_cache(&server_url, &token);

    let mut pair_data: Option<RelayPairData> = None;
    if !mobile_paired {
        // Request pairing code from relay server
        pair_data = Some(request_pairing_code(&server_url, &token)?);
    }

    // Stop existing session if any
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    if let Some(mut existing) = map.remove(&workspace_dir) {
        if let Ok(mut stop) = existing.stop_signal.lock() {
            *stop = true;
        }
        if let Some(mut child) = existing.child.take() {
            let _ = child.kill();
        }
    }

    // Spawn mcode acp: the Agent Client Protocol server that provides
    // session/new, session/prompt and session/update over stdin/stdout.
    // Note: mcode app-server only exposes low-level account/runtime methods
    // and does not implement the Agent protocol.
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "mcode", "acp"]);
        c
    };

    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("mcode");
        c.args(["acp"]);
        c
    };

    cmd.current_dir(&workspace_dir);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("启动 mcode acp 失败: {}", e))?;

    let pid = child.id();
    let child_stdin = child.stdin.take()
        .ok_or("无法获取 mcode acp stdin")?;
    let child_stdout = child.stdout.take()
        .ok_or("无法获取 mcode acp stdout")?;
    let child_stderr = child.stderr.take()
        .ok_or("无法获取 mcode acp stderr")?;

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

    let info = AppServerSessionInfo {
        status,
        pairing_code,
        workspace_dir: Some(workspace_dir.clone()),
        started_at_ms: Some(now_ms()),
        expires_at_ms,
        pid: Some(pid),
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

    let workspace_dir_clone = workspace_dir.clone();
    let bridge_flags = BridgeFlags {
        ws_connected: ws_connected.clone(),
        desktop_online: desktop_online.clone(),
        stop_signal: stop_signal_clone,
    };
    std::thread::spawn(move || {
        relay_bridge_thread(
            ws_url,
            child_stdin,
            child_stdout,
            child_stderr,
            workspace_dir_clone,
            bridge_flags,
        );
    });

    map.insert(
        workspace_dir,
        ManagedSession {
            info: info.clone(),
            child: Some(child),
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
pub fn stop_app_server(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
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

    Ok(AppServerSessionInfo {
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
pub fn get_app_server_status(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
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
        apply_runtime_status(&mut info, desktop_online, mobile_online);
        info.relay_url = Some(cfg.server_url.clone());
        info.username = cfg.username.clone();
        info.logged_in = cfg.token.is_some();
        info.mobile_paired = cfg.mobile_paired;
        Ok(info)
    } else {
        Ok(AppServerSessionInfo {
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

/// Background thread that connects to the relay WebSocket and bridges it to
/// the `mcode acp` child process over the Agent Client Protocol.
///
/// The thread acts as the ACP client: it performs the handshake, converts the
/// phone's envelopes into ACP requests, and converts ACP notifications into
/// phone frames. The relay server itself stays a stateless byte pipe.
///
/// Uses `tungstenite` for synchronous WebSocket communication paired with
/// standard threads, matching the project-wide convention of avoiding
/// async runtimes.
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
    mut stdin: std::process::ChildStdin,
    stdout: std::process::ChildStdout,
    stderr: std::process::ChildStderr,
    workspace_dir: String,
    flags: BridgeFlags,
) {
    use std::sync::mpsc;
    use std::time::Duration;
    use tungstenite::{connect, Message};

    let BridgeFlags {
        ws_connected,
        desktop_online,
        stop_signal,
    } = flags;

    let (tx_out, rx_out) = mpsc::channel::<String>();

    // Thread: read lines from the Agent's stdout and send through channel
    let stop_clone1 = stop_signal.clone();
    let stdout_reader_thread = std::thread::spawn(move || {
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

    // Thread: continuously drain the Agent's stderr. Without draining it the
    // pipe buffer fills up and blocks the child process.
    let stop_clone2 = stop_signal.clone();
    let stderr_reader_thread = std::thread::spawn(move || {
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

    // ACP handshake: send `initialize` first; the session is created once the
    // initialize response comes back.
    let mut bridge = AcpBridge::new(workspace_dir);
    for req in bridge.start() {
        if writeln!(stdin, "{}", req).is_err() {
            eprintln!("[RELAY-BRIDGE] 写入 initialize 失败");
            return;
        }
        let _ = stdin.flush();
    }

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

                    // 1. Drain the Agent's stdout, translate it, and forward it to the phone
                    while let Ok(line) = rx_out.try_recv() {
                        if line.trim().is_empty() {
                            continue;
                        }
                        let actions = bridge.on_agent_line(&line);
                        if !write_to_agent(&mut stdin, &actions.to_agent) {
                            eprintln!("[RELAY-BRIDGE] 写入 stdin 失败");
                            break;
                        }
                        let mut failed = false;
                        for frame in actions.to_mobile {
                            if let Err(e) = socket.send(Message::Text(frame)) {
                                eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                failed = true;
                                break;
                            }
                        }
                        if failed {
                            break;
                        }
                    }

                    // 2. Read from WebSocket and translate it into an ACP request
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
                                                eprintln!("[RELAY-BRIDGE] 手机端已连接");
                                            } else if event == "peer_disconnected" {
                                                if let Ok(mut c) = ws_connected.lock() {
                                                    *c = false;
                                                }
                                                eprintln!("[RELAY-BRIDGE] 手机端已断开");
                                            }
                                        }
                                        continue;
                                    }
                                }

                                // Translate the phone's envelope into an ACP request
                                let actions = bridge.on_mobile_frame(&text);
                                if !write_to_agent(&mut stdin, &actions.to_agent) {
                                    eprintln!("[RELAY-BRIDGE] 写入 stdin 失败");
                                    break;
                                }
                                for frame in actions.to_mobile {
                                    if let Err(e) = socket.send(Message::Text(frame)) {
                                        eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                        break;
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

    drop(stdin);
    let _ = stdout_reader_thread.join();
    let _ = stderr_reader_thread.join();
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
}

