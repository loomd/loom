pub mod audit;
pub mod bridge;
pub mod client;
pub mod proto;
pub mod ws;

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, command};

pub use bridge::{HermesConfig, HermesStatus};
use bridge::HermesBridge;
use loom_core::storage::manager as cstore;

static GLOBAL_BRIDGE: OnceLock<Mutex<Option<Arc<HermesBridge>>>> = OnceLock::new();

fn get_bridge_lock() -> &'static Mutex<Option<Arc<HermesBridge>>> {
    GLOBAL_BRIDGE.get_or_init(|| Mutex::new(None))
}

fn get_hermes_config_path() -> PathBuf {
    let mut path = cstore::get_config_path();
    path.pop(); // 移除 loom.json，保留配置所在目录
    let _ = fs::create_dir_all(&path);
    path.join("hermes.json")
}

#[command]
pub fn get_hermes_config() -> Result<HermesConfig, String> {
    let path = get_hermes_config_path();
    if !path.exists() {
        return Ok(HermesConfig::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: HermesConfig = serde_json::from_str(&content).unwrap_or_default();
    Ok(config)
}

#[command]
pub fn save_hermes_config(config: HermesConfig) -> Result<(), String> {
    let path = get_hermes_config_path();
    let json_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn start_hermes_service(
    app: AppHandle,
    app_id: String,
    app_secret: String,
    project_path: String,
) -> Result<(), String> {
    let mut guard = get_bridge_lock().lock().map_err(|e| e.to_string())?;

    // 如果已有实例在运行，先停止旧实例
    if let Some(existing) = guard.take() {
        existing.stop();
    }

    if app_id.trim().is_empty() || app_secret.trim().is_empty() {
        return Err("App ID 和 App Secret 不能为空".to_string());
    }

    let bridge = Arc::new(HermesBridge::new(
        Some(app),
        app_id.trim().to_string(),
        app_secret.trim().to_string(),
        project_path.trim().to_string(),
    ));

    bridge.clone().start();
    *guard = Some(bridge);

    // 记住开启状态：保存 auto_start = true
    if let Ok(mut config) = get_hermes_config() {
        config.app_id = app_id.trim().to_string();
        config.app_secret = app_secret.trim().to_string();
        config.auto_start = true;
        let _ = save_hermes_config(config);
    }

    Ok(())
}

#[command]
pub fn stop_hermes_service() -> Result<(), String> {
    let mut guard = get_bridge_lock().lock().map_err(|e| e.to_string())?;
    if let Some(bridge) = guard.take() {
        bridge.stop();
    }

    // 记住关闭状态：保存 auto_start = false
    if let Ok(mut config) = get_hermes_config() {
        config.auto_start = false;
        let _ = save_hermes_config(config);
    }

    Ok(())
}

/// 在 Loom 启动时检测上次是否开启，若是则自动拉起 Hermes 服务
pub fn try_autostart_hermes_service(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));

        let Ok(config) = get_hermes_config() else { return };
        if !config.auto_start {
            return;
        }
        if config.app_id.trim().is_empty() || config.app_secret.trim().is_empty() {
            return;
        }

        let project_path = if !config.default_project_id.trim().is_empty() {
            cstore::get_projects()
                .ok()
                .and_then(|projects| {
                    projects
                        .into_iter()
                        .find(|p| p.id == config.default_project_id)
                        .map(|p| p.root_path.to_string_lossy().to_string())
                })
        } else {
            None
        }
        .unwrap_or_else(|| {
            cstore::get_projects()
                .ok()
                .and_then(|projects| {
                    projects
                        .first()
                        .map(|p| p.root_path.to_string_lossy().to_string())
                })
                .unwrap_or_else(|| {
                    std::env::current_dir()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string()
                })
        });

        println!("[Hermes] 检测到上次运行处于开启状态，自动启动 Hermes 服务 (cwd: {})", project_path);
        let _ = start_hermes_service(
            app,
            config.app_id,
            config.app_secret,
            project_path,
        );
    });
}

#[command]
pub fn get_hermes_status() -> Result<HermesStatus, String> {
    let guard = get_bridge_lock().lock().map_err(|e| e.to_string())?;
    if let Some(bridge) = guard.as_ref() {
        Ok(bridge.get_status())
    } else {
        Ok(HermesStatus {
            state: "stopped".to_string(),
            error_message: None,
            log_entries: Vec::new(),
            connected_since: None,
        })
    }
}

#[command]
pub fn get_hermes_audit_dir() -> Result<String, String> {
    let logger = audit::AuditLogger::new();
    Ok(logger.get_log_dir().to_string_lossy().to_string())
}

#[command]
pub fn open_hermes_audit_dir() -> Result<(), String> {
    let logger = audit::AuditLogger::new();
    let dir = logger.get_log_dir();
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(())
}

#[command]
pub fn get_hermes_audit_records(date: Option<String>, limit: Option<usize>) -> Result<Vec<audit::AuditRecord>, String> {
    let logger = audit::AuditLogger::new();
    Ok(logger.read_records(date.as_deref(), limit.unwrap_or(200)))
}
