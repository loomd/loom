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
- [x] 通知点击唤醒窗口：用户点击 Toast 通知时，自动 `unminimize()` + `show()` + `set_focus()` 唤醒并置顶聚焦 Loom 窗口（最小化状态下 `set_focus` 无效，必须先 `unminimize`）。
- [x] 通知点击跳转项目：通知载荷携带 `project_root`，点击后切回工作区并选中对应项目。**不强制跳转到具体会话/终端**，避免打断用户当前视线。
- [x] 通知内容包含项目名与会话标识：标题为 `{项目名} - 任务已完成`，正文为 `会话标题 任务已执行完毕`（空格分隔）。项目名为空时标题只保留事件描述。
- [x] 会话标题回退：优先取 Agent 会话库的 `session_title`，库中无标题（实测本地库约四分之一会话 `title` 为 NULL）时退回 Loom 终端标签标题。
- [x] 过滤 opencode 占位标题：opencode 早期会话的 title 是 `New session - <时间戳>` 这类自动占位串，通知需按无标题处理，与前端历史面板的过滤规则保持一致。
- [x] 纯文字通知：不设置 `appLogoOverride` 图片，AUMID 注册也只写 `DisplayName` 不写 `IconUri`。图标会让 Windows 在文字左侧留出缩进并把通知框撑宽，标题与副标题因此显得没有左对齐。
- [x] 恢复终端时为空的 `title` 兜底生成非空标题：持久化数据里可能存着历史遗留的空标题，且会被反复写回，导致标签页空白并让通知缺少会话标识。
- [x] 开发环境（`cargo tauri dev`）下点击通知同样可激活：`tauri-plugin-notification` 在 `target\debug` / `target\release` 下会刻意跳过 `app_id`，通知将归属 Windows PowerShell 导致点击无效，改用 `tauri-winrt-notification` 直接接管。

## Non-goals
- 不监听终端普通 CLI 命令（如 git、npm、cargo 等手动在 PTY 敲击的命令）的退出状态。
- 不采用复杂的自绘悬浮 Webview 弹窗，坚持使用 Windows 原生 Toast 体验，确保轻量与系统一致性。
- 不注册 COM 激活器（ToastActivatorCLSID），因此 **Loom 完全退出后再点击通知中心的旧通知不会拉起应用**；仅在应用运行期间点击才生效。

## Technical Notes
- **插件引入**：`crates/gui/src-tauri/Cargo.toml` 引入 `tauri-plugin-notification = "2.0.0"`，在 `capabilities` 中配置 `notification:default` 权限，并在 `src/main.rs` 中初始化 `tauri_plugin_notification::init()`。
- **状态监听位置**：在 `crates/gui/src-tauri/src/agent_monitor.rs` 中，现有的 `notify_state_change` 或会话周期轮询时，检测旧状态为 `Running` 且新状态为 `Idle` 或 `Completed` 的边界事件。
- **窗口状态检查与通知触发**：通过 `app_handle.get_webview_window("main")` 检查 `is_focused()` 与 `is_minimized()`，若在后台则分发 `Notification` 构建并调用 `show()`，同时调用 `window.request_user_attention(Some(UserAttentionType::Informational))`。
- **为什么不能直接用插件发通知**：`tauri-plugin-notification` 的桌面实现在 Windows 上走 `notify-rust`，且源码中当 exe 目录以 `target\debug` / `target\release` 结尾时会**刻意不设置 `app_id`**；`notify-rust` 无 `app_id` 时回退到 `Toast::POWERSHELL_APP_ID`，通知归属 PowerShell，点击只会拉起 PowerShell。更严重的是该插件的桌面实现**从不注册 `on_activated`**，即便设置了 app_id 也拿不到点击回调。因此改用 `crates/gui/src-tauri/src/notification.rs` 直接调用 `tauri-winrt-notification`。
- **AUMID 前提条件**：WinRT Toast 在 **App 运行期间**的点击会通过 `IToastNotification::Activated` 事件直接回传本进程，前提是进程在启动时调用 `SetCurrentProcessExplicitAppUserModelID`，且该 AUMID 在 `HKCU\Software\Classes\AppUserModelId\{AUMID}` 下注册了 `DisplayName`。`notification.rs` 在 `main()` 中 `crash_shield::install()` 之后立即完成这两步，已安装版本重复执行无害，同时让开发环境也能发出可点击的通知。AUMID 必须与 `tauri.conf.json` 的 `identifier`（`com.loom.app`）一致，否则与 NSIS 写入的快捷方式 AUMID 不匹配。
- **前端跳转链路**：后端 `on_activated` 回调中先 `focus_main_window` 再 `app.emit("agent-notification-activate", payload)`；`App.tsx` 收到后按 `projectPathKey` 归一化匹配项目（忽略大小写与分隔符差异），切回 `workspace` 页并选中项目即结束，不再向 `ProjectWorkspace` 派发终端定位事件。
- **项目名与会话标题的来源**：后端只持有 `workspace_dir`，项目名与终端标签标题由前端在 `poll_agent_state` 时以 `projectName` / `terminalTitle` 参数传入；`build_notification_title` 与 `build_notification_body` 负责组装，均为纯函数便于单测。

## Acceptance Criteria
- [x] `harnspec validate` 验证规范格式合法。
- [x] `cargo check --all-targets` 无编译错误。
- [x] `cargo clippy --all-targets` 无告警。
- [x] `cargo test --workspace` 全量测试通过。
- [x] 前端 `npm run build` 构建通过。
- [x] 当 Agent 从运行变为完成且窗口未聚焦时，触发系统 Toast 与任务栏闪烁。
- [x] 窗口隐藏到托盘时点击通知，Loom 恢复到前台并聚焦。
- [x] 点击通知后自动切换到触发通知的项目，不强制跳转到具体终端。
- [x] 项目路径在大小写 / 分隔符不一致时仍能正确匹配；目标项目不存在时停留在原项目并给出提示，而非跳到错误位置。
