---
status: complete
created: 2026-10-15
priority: high
tags:
- agent
- notification
- windows
- tauri
- gui
created_at: 2026-10-15T07:52:19.383125900Z
updated_at: 2026-10-15T08:08:34.083668400Z
completed_at: 2026-10-15T08:08:34.083668400Z
transitions:
- status: complete
  at: 2026-10-15T08:08:34.083668400Z
---

# 068-agent-system-notification: Agent 任务完成系统通知与任务栏提醒

## Overview
在现有 Loom 系统中，OpenCode 与 mcode 等 AI Agent 能够自动执行长链条任务。当 Agent 在后台执行耗时任务时，用户往往会切换到浏览器、编辑器或其他应用中工作。为了在 Agent 任务完成时及时获知结果，系统需要在 Windows 等桌面环境下提供轻量、不打扰的原生系统通知（Windows 右下角原生 Toast，几秒后自动淡出并收归通知中心）并联动任务栏图标闪烁提醒（Taskbar Flashing），点击后可直接唤醒并聚焦 Loom。

## Requirements
- [x] 接入 Tauri 官方通知插件 `tauri-plugin-notification` (v2.0.0)。
- [x] 仅监听 Agent 运行状态变化：通过 `agent_monitor.rs` 精确捕获会话从 `running` 迁移至 `idle` 或 `completed` 的时机。
- [x] 窗口前后台与焦点门禁：当 Loom 窗口处于前台且激活聚焦状态时不弹系统通知；仅在窗口处于失焦（Unfocused）、最小化（Minimized）或隐藏到托盘时触发通知。
- [x] Windows 原生 Toast 通知：系统右下角弹出通知条，显示 Agent 任务完成摘要（如 `[Loom] Agent 任务已完成`，正文包含会话标识/耗时等），展示数秒后自动淡出并收归 Windows 通知中心。
- [x] Windows 任务栏高亮提示：任务完成且窗口在后台时，调用 `request_user_attention` 触发任务栏图标闪烁/变橙高亮。
- [x] 用户点击 Toast 通知时，自动调用 `window.show()` + `window.set_focus()` 唤醒并置顶聚焦 Loom 窗口。

## Non-goals
- 不监听终端普通 CLI 命令（如 git、npm、cargo 等手动在 PTY 敲击的命令）的退出状态。
- 不采用复杂的自绘悬浮 Webview 弹窗，坚持使用 Windows 原生 Toast 体验，确保轻量与系统一致性。

## Technical Notes
- **插件引入**：`crates/gui/src-tauri/Cargo.toml` 引入 `tauri-plugin-notification = "2.0.0"`，在 `capabilities` 中配置 `notification:default` 权限，并在 `src/main.rs` 中初始化 `tauri_plugin_notification::init()`。
- **状态监听位置**：在 `crates/gui/src-tauri/src/agent_monitor.rs` 中，现有的 `notify_state_change` 或会话周期轮询时，检测旧状态为 `Running` 且新状态为 `Idle` 或 `Completed` 的边界事件。
- **窗口状态检查与通知触发**：通过 `app_handle.get_webview_window("main")` 检查 `is_focused()` 与 `is_minimized()`，若在后台则分发 `Notification` 构建并调用 `show()`，同时调用 `window.request_user_attention(Some(UserAttentionType::Informational))`。

## Acceptance Criteria
- [x] `harnspec validate` 验证规范格式合法。
- [x] `cargo check --all-targets` 无编译错误。
- [x] `cargo clippy --all-targets` 无告警。
- [x] `cargo test --workspace` 全量测试通过。
- [x] 前端 `npm run build` 构建通过。
- [x] 当 Agent 从运行变为完成且窗口未聚焦时，触发系统 Toast 与任务栏闪烁。
