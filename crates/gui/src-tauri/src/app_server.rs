use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McodeAuthInfo {
    pub is_logged_in: bool,
    pub region: Option<String>,
    pub status: String,
    pub expires_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerSessionInfo {
    pub status: String, // "stopped" | "starting" | "waiting_pairing" | "connected"
    pub pairing_code: Option<String>,
    pub region: Option<String>,
    pub workspace_dir: String,
    pub started_at_ms: Option<u64>,
    pub expires_at_ms: Option<u64>,
    pub pid: Option<u32>,
    pub mobile_device_name: Option<String>,
    pub message: Option<String>,
}

struct ManagedSession {
    info: AppServerSessionInfo,
    child: Option<Child>,
    desktop_device_id: String,
}

static SESSIONS: OnceLock<Mutex<HashMap<String, ManagedSession>>> = OnceLock::new();

fn get_sessions_map() -> &'static Mutex<HashMap<String, ManagedSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_minimax_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("MINIMAX_DATA_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile).join(".minimax");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = PathBuf::from(home).join(".minimax");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// 读取或初始化稳定的 desktop_device_id
fn get_or_create_device_id() -> String {
    // 优先读取 MiniMax Agent 的 state.json
    if let Ok(appdata) = std::env::var("APPDATA") {
        let state_path = PathBuf::from(appdata)
            .join("MiniMax Agent")
            .join("remote-control")
            .join("state.json");
        if state_path.exists() {
            if let Ok(content) = fs::read_to_string(&state_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(id) = parsed.get("desktop_device_id").and_then(|v| v.as_str()) {
                        return id.to_string();
                    }
                }
            }
        }
    }

    // 次选在 .minimax/remote-control/state.json
    if let Some(base_dir) = get_minimax_dir() {
        let state_dir = base_dir.join("remote-control");
        let state_path = state_dir.join("state.json");
        if state_path.exists() {
            if let Ok(content) = fs::read_to_string(&state_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(id) = parsed.get("desktop_device_id").and_then(|v| v.as_str()) {
                        return id.to_string();
                    }
                }
            }
        } else {
            let new_id = generate_uuid();
            let _ = fs::create_dir_all(&state_dir);
            let val = serde_json::json!({ "desktop_device_id": new_id });
            let _ = fs::write(state_path, val.to_string());
            return new_id;
        }
    }

    "dd238609-0202-41ec-87d9-d35c10e3efb9".to_string()
}

fn generate_uuid() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        (now & 0xFFFFFFFF) as u32,
        ((now >> 32) & 0xFFFF) as u16,
        ((now >> 48) & 0x0FFF) as u16,
        ((now >> 60) & 0x0FFF) as u16,
        now as u64 & 0xFFFFFFFFFFFF
    )
}

/// 读取本地 AccessToken
fn get_local_access_token(region_dir: &str) -> Option<String> {
    let base_dir = get_minimax_dir()?;
    let auth_file = base_dir
        .join("auth")
        .join("prod")
        .join(region_dir)
        .join("mcode-public")
        .join("auth.json");

    if !auth_file.exists() {
        return None;
    }

    let content = fs::read_to_string(auth_file).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&content).ok()?;
    let records = parsed.get("records")?.as_object()?;
    for record in records.values() {
        if let Some(token) = record.get("accessToken").and_then(|t| t.as_str()) {
            if !token.is_empty() {
                return Some(token.to_string());
            }
        }
    }
    None
}

#[derive(Deserialize)]
struct RawAuthState {
    status: Option<String>,
    region: Option<String>,
    #[serde(rename = "expiresAtMs")]
    expires_at_ms: Option<u64>,
}

/// 识别当前机器上 MiniMax Code 的登录状态与所属区域 (cn / global)
#[tauri::command]
pub fn get_mcode_auth_status() -> Result<McodeAuthInfo, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let base_dir = match get_minimax_dir() {
        Some(d) => d,
        None => {
            return Ok(McodeAuthInfo {
                is_logged_in: false,
                region: None,
                status: "not_installed".to_string(),
                expires_at_ms: None,
            });
        }
    };

    let regions = [("cn", "cn"), ("en", "global")];
    for (dir_name, region_label) in regions {
        let state_file = base_dir
            .join("auth")
            .join("prod")
            .join(dir_name)
            .join("mcode-public")
            .join("auth-state.json");

        if state_file.exists() {
            if let Ok(content) = fs::read_to_string(&state_file) {
                if let Ok(parsed) = serde_json::from_str::<RawAuthState>(&content) {
                    let status = parsed.status.unwrap_or_default();
                    let exp = parsed.expires_at_ms.unwrap_or(0);
                    let is_valid = status == "authenticated" && (exp == 0 || exp > now);
                    if is_valid {
                        let detected_region = parsed
                            .region
                            .filter(|r| !r.is_empty())
                            .unwrap_or_else(|| region_label.to_string());
                        return Ok(McodeAuthInfo {
                            is_logged_in: true,
                            region: Some(detected_region),
                            status: "authenticated".to_string(),
                            expires_at_ms: parsed.expires_at_ms,
                        });
                    }
                }
            }
        }
    }

    Ok(McodeAuthInfo {
        is_logged_in: false,
        region: None,
        status: "logged_out".to_string(),
        expires_at_ms: None,
    })
}

#[derive(Deserialize)]
struct PairingCodeResponse {
    pairing_code: Option<String>,
    expires_in_s: Option<u64>,
    base_resp: Option<BaseResp>,
}

#[derive(Deserialize)]
struct BaseResp {
    status_code: Option<i32>,
    status_msg: Option<String>,
}

#[derive(Deserialize)]
struct BindingsResponse {
    binding: Option<BindingDetail>,
}

#[derive(Deserialize)]
struct BindingDetail {
    state: Option<String>,
    mobile_device_name: Option<String>,
}

/// 向 MiniMax 官方云端申请真实配对码
fn request_official_pairing_code(token: &str, device_id: &str) -> Result<(String, u64), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let url = "https://agent.minimax.cn/minimax-cloud/api/v1/remote-control/pairing/code";
    let body = serde_json::json!({
        "device_name": "Loom Desktop",
        "device_id": device_id
    });

    let res = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Device-Id", device_id)
        .header("X-Mavis-Desktop-Channel", "desktop")
        .header("User-Agent", "MiniMaxAgent")
        .json(&body)
        .send()
        .map_err(|e| format!("请求官方云端配对码失败: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        let err_text = res.text().unwrap_or_default();
        return Err(format!("官方云端返回错误 (HTTP {}): {}", status, err_text));
    }

    let parsed = res
        .json::<PairingCodeResponse>()
        .map_err(|e| format!("解析官方配对码响应失败: {}", e))?;

    if let Some(base) = &parsed.base_resp {
        if let Some(code) = base.status_code {
            if code != 0 {
                return Err(format!(
                    "官方云端配对错误: {}",
                    base.status_msg.as_deref().unwrap_or("未知错误")
                ));
            }
        }
    }

    let code = parsed
        .pairing_code
        .ok_or_else(|| "官方云端响应中未包含配对码".to_string())?;
    let exp_s = parsed.expires_in_s.unwrap_or(300);

    Ok((code, exp_s))
}

/// 检查云端真实绑定状态
fn check_cloud_binding_status(token: &str, device_id: &str) -> Option<(String, Option<String>)> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;

    let url = "https://agent.minimax.cn/minimax-cloud/api/v1/remote-control/desktop/bindings";
    let res = client
        .get(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("X-Device-Id", device_id)
        .header("X-Mavis-Desktop-Channel", "desktop")
        .header("User-Agent", "MiniMaxAgent")
        .send()
        .ok()?;

    if !res.status().is_success() {
        return None;
    }

    let parsed = res.json::<BindingsResponse>().ok()?;
    if let Some(b) = parsed.binding {
        let state = b.state.unwrap_or_default();
        return Some((state, b.mobile_device_name));
    }

    None
}

/// 获取当前工作区 app-server 的运行与配对状态（带云端状态联动）
#[tauri::command]
pub fn get_app_server_status(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    if let Some(sess) = map.get_mut(&workspace_dir) {
        // 如果处于等待配对中，尝试探测云端是否已绑定
        if sess.info.status == "waiting_pairing" {
            if let Some(token) = get_local_access_token("cn") {
                if let Some((state, device_name)) = check_cloud_binding_status(&token, &sess.desktop_device_id) {
                    if state == "bound" || state == "connected" || device_name.is_some() {
                        sess.info.status = "connected".to_string();
                        sess.info.mobile_device_name = device_name;
                        sess.info.message = Some("手机端已成功连接".to_string());
                    }
                }
            }
        }
        Ok(sess.info.clone())
    } else {
        Ok(AppServerSessionInfo {
            status: "stopped".to_string(),
            pairing_code: None,
            region: None,
            workspace_dir,
            started_at_ms: None,
            expires_at_ms: None,
            pid: None,
            mobile_device_name: None,
            message: None,
        })
    }
}

/// 启动指定工作区的 app-server 远程控制会话并向官方云端申请真实配对码
#[tauri::command]
pub fn start_app_server(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
    let auth = get_mcode_auth_status()?;
    if !auth.is_logged_in {
        return Err("当前未检测到有效的 MiniMax 登录凭证，请先在终端执行 mcode login 完成登录。".to_string());
    }

    let region_dir = if auth.region.as_deref() == Some("global") { "en" } else { "cn" };
    let token = get_local_access_token(region_dir)
        .ok_or_else(|| "无法读取本地有效的 MiniMax AccessToken".to_string())?;

    let device_id = get_or_create_device_id();

    // 1. 向官方云端请求真实 4 位数字配对码
    let (pairing_code, expires_in_s) = request_official_pairing_code(&token, &device_id)?;

    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    // 如果已在运行，先停止旧实例
    if let Some(mut existing) = map.remove(&workspace_dir) {
        if let Some(mut child) = existing.child.take() {
            let _ = child.kill();
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let expires_at_ms = now + expires_in_s * 1000;

    // 2. 启动本地后台 mcode app-server
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
        cmd.creation_flags(0x08000000);
    }

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return Err(format!("启动 mcode app-server 失败: {}", e));
        }
    };

    let pid = child.id();
    let info = AppServerSessionInfo {
        status: "waiting_pairing".to_string(),
        pairing_code: Some(pairing_code),
        region: auth.region,
        workspace_dir: workspace_dir.clone(),
        started_at_ms: Some(now),
        expires_at_ms: Some(expires_at_ms),
        pid: Some(pid),
        mobile_device_name: None,
        message: Some("官方配对码已生成，请在手机端输入配对码".to_string()),
    };

    map.insert(
        workspace_dir,
        ManagedSession {
            info: info.clone(),
            child: Some(child),
            desktop_device_id: device_id,
        },
    );

    Ok(info)
}

/// 停止指定工作区的 app-server 会话
#[tauri::command]
pub fn stop_app_server(workspace_dir: String) -> Result<AppServerSessionInfo, String> {
    let mut map = get_sessions_map()
        .lock()
        .map_err(|e| format!("锁竞争异常: {}", e))?;

    if let Some(mut sess) = map.remove(&workspace_dir) {
        if let Some(mut child) = sess.child.take() {
            let _ = child.kill();
        }
    }

    Ok(AppServerSessionInfo {
        status: "stopped".to_string(),
        pairing_code: None,
        region: None,
        workspace_dir,
        started_at_ms: None,
        expires_at_ms: None,
        pid: None,
        mobile_device_name: None,
        message: Some("已断开远程会话".to_string()),
    })
}
