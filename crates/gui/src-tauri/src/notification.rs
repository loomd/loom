//! Windows 原生 Toast 通知与点击激活。
//!
//! `tauri-plugin-notification` 的桌面实现在 Windows 上走 `notify-rust`，并且当可执行文件位于
//! `target\debug` / `target\release` 时会**刻意跳过** `app_id` 设置（见插件 `desktop.rs`）。
//! 没有 app_id 时 `notify-rust` 回退到 `Toast::POWERSHELL_APP_ID`，通知归属 Windows PowerShell：
//! 弹窗照常出现，但点击只会拉起 PowerShell，Loom 不会回到前台，更没有任何回传数据可用。
//!
//! 这里改为直接使用 `tauri-winrt-notification`：它在启动时注册 AUMID 之后，
//! 可以通过 `on_activated` 把点击事件直接回传给仍在运行的 Loom 进程。
//! （仅"应用已退出后再点通知"才需要注册 COM 激活器，不在本功能范围内。）

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// 通知点击后派发给前端的跳转事件名。
pub const ACTIVATE_EVENT: &str = "agent-notification-activate";

/// Loom 的 AppUserModelID，必须与 `tauri.conf.json` 中的 identifier 保持一致，
/// 否则已安装版 Start Menu 快捷方式的 AUMID 会与运行时注册的不匹配。
pub const AUMID: &str = "com.loom.app";

/// 通知点击后回传给前端的定位信息。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AgentNotificationPayload {
    /// 触发通知的项目工作区根目录，用于匹配前端项目。
    pub project_root: String,
    /// 触发通知的 PTY 会话 ID，用于定位终端标签页。
    pub pty_session_id: String,
    /// 触发类型：`completed` / `question` / `error`。
    pub trigger: String,
    /// 通知标题，供前端在无法定位时提示。
    pub title: String,
}

/// 启动时为当前进程设置 AUMID，使 Toast 归属 Loom 而非 PowerShell。
///
/// 未安装版本（Tauri NSIS 已写入快捷方式 AUMID）重复写入是无害的，
/// 因此这里统一执行，同时让 `cargo tauri dev` 的开发环境也能发出可点击的通知。
pub fn ensure_aumid_registered() {
    #[cfg(windows)]
    {
        register_process_aumid();
        register_aumid_display_name();
    }
}

#[cfg(windows)]
fn register_process_aumid() {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(pszAppID: *const u16) -> i32;
    }

    let wide: Vec<u16> = std::ffi::OsStr::new(AUMID)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: `wide` 是以 NUL 结尾的合法 UTF-16 字符串，且在调用期间保持存活。
    let hr = unsafe { SetCurrentProcessExplicitAppUserModelID(wide.as_ptr()) };
    if hr < 0 {
        eprintln!("[Notification] 设置进程 AUMID 失败, hr=0x{:08X}", hr);
    }
}

#[cfg(windows)]
fn register_aumid_display_name() {
    use windows_registry::CURRENT_USER;

    let path = format!(r"SOFTWARE\Classes\AppUserModelId\{AUMID}");
    // 只注册 DisplayName，不写 IconUri：产品侧不展示通知图标。
    let result = CURRENT_USER
        .create(&path)
        .and_then(|key| key.set_string("DisplayName", "Loom"));

    if let Err(e) = result {
        eprintln!("[Notification] 注册 AUMID 显示名失败: {}", e);
    }
}

/// 将主窗口恢复到前台可见并获取焦点。
pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // 最小化状态下 set_focus 无效，必须先 unminimize。
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 派发跳转事件，驱动前端切换到对应项目与终端。
pub fn emit_activation(app: &AppHandle, payload: &AgentNotificationPayload) {
    if let Err(e) = app.emit(ACTIVATE_EVENT, payload) {
        eprintln!("[Notification] 派发激活事件失败: {}", e);
    }
}

/// 弹出系统通知，并绑定点击后的前台唤醒与页面跳转。
#[cfg(windows)]
pub fn show_agent_toast(
    app: &AppHandle,
    title: &str,
    body: &str,
    payload: AgentNotificationPayload,
) -> Result<(), String> {
    use tauri_winrt_notification::{Duration, Toast};

    let click_app = app.clone();
    let click_payload = payload.clone();

    // 不设置 image：Windows 会把 appLogoOverride 图标渲染在文字左侧并给文字留出缩进，
    // 导致标题与副标题看起来没有左对齐，且通知框被撑得比文字宽。纯文字 Toast 更紧凑。
    Toast::new(AUMID)
        .title(title)
        .text1(body)
        .duration(Duration::Short)
        .on_activated(move |_action| {
            focus_main_window(&click_app);
            emit_activation(&click_app, &click_payload);
            Ok(())
        })
        .show()
        .map_err(|e| e.to_string())
}

/// 非 Windows 平台沿用官方通知插件（不支持点击回传，仅作为视觉提示）。
#[cfg(not(windows))]
pub fn show_agent_toast(
    app: &AppHandle,
    title: &str,
    body: &str,
    _payload: AgentNotificationPayload,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aumid_matches_tauri_identifier() {
        // AUMID 必须与 tauri.conf.json 的 identifier 一致，否则已安装版无法激活
        assert_eq!(AUMID, "com.loom.app");
    }

    #[test]
    fn test_payload_serialization() {
        let payload = AgentNotificationPayload {
            project_root: r"D:\Develop\loom".to_string(),
            pty_session_id: "pty-1".to_string(),
            trigger: "completed".to_string(),
            title: "Loom - Agent 任务已完成".to_string(),
        };
        let json = serde_json::to_string(&payload).expect("payload should serialize");
        assert!(json.contains(r#""project_root":"D:\\Develop\\loom""#));
        assert!(json.contains(r#""pty_session_id":"pty-1""#));
        assert!(json.contains(r#""trigger":"completed""#));
    }
}
