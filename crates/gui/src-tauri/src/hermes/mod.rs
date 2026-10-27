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

    Ok(())
}

#[command]
pub fn stop_hermes_service() -> Result<(), String> {
    let mut guard = get_bridge_lock().lock().map_err(|e| e.to_string())?;
    if let Some(bridge) = guard.take() {
        bridge.stop();
    }
    Ok(())
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
