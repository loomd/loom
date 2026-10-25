use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub server_url: String,
    pub username: Option<String>,
    pub token: Option<String>,
    pub token_expires_at: Option<u64>,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            server_url: "ws://agent.ccxcc.cn:9099".to_string(),
            username: None,
            token: None,
            token_expires_at: None,
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
    pub expires_at: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerSessionInfo {
    pub status: String, // "stopped" | "starting" | "waiting_pairing" | "connected"
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
}

// ── Internal state ─────────────────────────────────────────────────────────

struct ManagedSession {
    info: AppServerSessionInfo,
    child: Option<Child>,
    /// Flag set when WebSocket relay thread detects mobile connected
    ws_connected: Arc<Mutex<bool>>,
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
            if let Ok(cfg) = serde_json::from_str::<RelayConfig>(&content) {
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
            // Check ws_connected flag from relay thread
            if let Ok(connected) = sess.ws_connected.lock() {
                if *connected && info.status == "waiting_pairing" {
                    info.status = "connected".to_string();
                    info.message = Some("手机端已成功连接".to_string());
                }
            }
            info.relay_url = Some(cfg.server_url.clone());
            info.username = cfg.username.clone();
            info.logged_in = cfg.token.is_some();
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

    let data = parsed.data.ok_or("响应中缺少登录数据")?;

    // Persist config
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.server_url = server_url;
    cfg.username = Some(data.username.clone());
    cfg.token = Some(data.token.clone());
    cfg.token_expires_at = Some(data.expires_at);
    save_relay_config(&cfg);

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

    let data = parsed.data.ok_or("响应中缺少注册数据")?;

    // Persist config
    let mut cfg = get_relay_config()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;
    cfg.server_url = server_url;
    cfg.username = Some(data.username.clone());
    cfg.token = Some(data.token.clone());
    cfg.token_expires_at = Some(data.expires_at);
    save_relay_config(&cfg);

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
    save_relay_config(&cfg);

    Ok(())
}

/// Start remote session: spawn mcode app-server and connect to relay
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

    // Request pairing code from relay server
    let client = http_client()?;
    let pair_url = api_url(&server_url, "/api/pair/create");

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

    let pair_data = parsed.data.ok_or("响应中缺少配对码数据")?;

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

    // Spawn mcode app-server --stdio
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "mcode", "app-server", "--stdio"]);
        c
    };

    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("mcode");
        c.args(["app-server", "--stdio"]);
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
        .map_err(|e| format!("启动 mcode app-server 失败: {}", e))?;

    let pid = child.id();
    let child_stdin = child.stdin.take()
        .ok_or("无法获取 app-server stdin")?;
    let child_stdout = child.stdout.take()
        .ok_or("无法获取 app-server stdout")?;

    let ws_connected = Arc::new(Mutex::new(false));
    let stop_signal = Arc::new(Mutex::new(false));

    let info = AppServerSessionInfo {
        status: "waiting_pairing".to_string(),
        pairing_code: Some(pair_data.code.clone()),
        workspace_dir: Some(workspace_dir.clone()),
        started_at_ms: Some(now_ms()),
        expires_at_ms: Some(pair_data.expires_at),
        pid: Some(pid),
        mobile_device_name: None,
        message: Some("配对码已生成，请在手机端输入配对码".to_string()),
        relay_url: Some(server_url.clone()),
        username: cfg.username.clone(),
        logged_in: true,
    };

    // Spawn relay bridge thread
    let ws_connected_clone = ws_connected.clone();
    let stop_signal_clone = stop_signal.clone();
    let ws_url = format!(
        "{}/ws/desktop?token={}",
        server_url.trim_end_matches('/'),
        token
    );

    std::thread::spawn(move || {
        relay_bridge_thread(
            ws_url,
            child_stdin,
            child_stdout,
            ws_connected_clone,
            stop_signal_clone,
        );
    });

    map.insert(
        workspace_dir,
        ManagedSession {
            info: info.clone(),
            child: Some(child),
            ws_connected,
            stop_signal,
        },
    );

    Ok(info)
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
        // Check ws_connected flag from relay thread
        if let Ok(connected) = sess.ws_connected.lock() {
            if *connected && info.status == "waiting_pairing" {
                info.status = "connected".to_string();
                info.message = Some("手机端已成功连接".to_string());
            }
        }
        info.relay_url = Some(cfg.server_url.clone());
        info.username = cfg.username.clone();
        info.logged_in = cfg.token.is_some();
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

/// Background thread that connects to the relay WebSocket and bridges
/// stdin/stdout of the mcode app-server process.
///
/// Uses `tungstenite` for synchronous WebSocket communication paired with
/// standard threads, matching the project-wide convention of avoiding
/// async runtimes.
fn relay_bridge_thread(
    ws_url: String,
    mut stdin: std::process::ChildStdin,
    stdout: std::process::ChildStdout,
    ws_connected: Arc<Mutex<bool>>,
    stop_signal: Arc<Mutex<bool>>,
) {
    use std::sync::mpsc;
    use std::time::Duration;
    use tungstenite::{connect, Message};

    let (tx_out, rx_out) = mpsc::channel::<String>();

    // Thread: read lines from app-server stdout and send through channel
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

                    // 1. Send all queued stdout lines to WebSocket
                    while let Ok(line) = rx_out.try_recv() {
                        if !line.trim().is_empty() {
                            if let Err(e) = socket.send(Message::Text(line)) {
                                eprintln!("[RELAY-BRIDGE] 发送消息到 WebSocket 失败: {}", e);
                                break;
                            }
                        }
                    }

                    // 2. Read from WebSocket and write to stdin
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

                                // Forward to app-server stdin
                                if let Err(e) = writeln!(stdin, "{}", text) {
                                    eprintln!("[RELAY-BRIDGE] 写入 stdin 失败: {}", e);
                                    break;
                                }
                                let _ = stdin.flush();
                            }
                            Message::Binary(bin) => {
                                if let Err(e) = stdin.write_all(&bin) {
                                    eprintln!("[RELAY-BRIDGE] 写入 stdin 失败: {}", e);
                                    break;
                                }
                                let _ = stdin.flush();
                            }
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
}
