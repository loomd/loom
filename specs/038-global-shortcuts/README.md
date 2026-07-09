---
status: planned
created: 2026-07-09
priority: low
tags:
  - gui
  - tauri
  - feature
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# 全局快捷键与键盘导航

## Overview
当前应用快捷键极少（仅 Monaco 编辑器默认的 Ctrl+S 和 Ctrl+A）。缺乏桌面应用应有的键盘导航能力。利用 `tauri-plugin-global-shortcut` 注册系统级快捷键，并增加应用内键盘导航。

## Requirements
- [ ] 添加 `tauri-plugin-global-shortcut` 到 `crates/gui/src-tauri/Cargo.toml`
- [ ] 在前端注册应用内快捷键（通过 `keydown` 事件监听）：
  - `Ctrl+Tab` / `Ctrl+Shift+Tab` — 切换终端标签页
  - `Ctrl+W` — 关闭当前终端标签页（有运行中进程时确认）
  - `Ctrl+,` — 打开设置页
  - `Ctrl+Shift+P` — 命令面板（预留）
  - `Escape` — 关闭当前模态框
  - `Ctrl+Backtick` — 切换终端面板焦点
- [ ] 系统级全局快捷键（通过 Tauri plugin）：
  - `Alt+Space` — 从任何窗口唤出/隐藏 Loom（类似 VS Code 的"切换窗口可见性"）
  - 仅在 Windows 上启用
- [ ] 在 `SettingsPage` 的 General 设置中增加快捷键配置 UI（展示绑定列表，暂不可自定义）
- [ ] 在 `TitleBar` 或状态栏提示当前可用快捷键

## Non-Goals
- 不实现快捷键自定义 UI（仅展示只读列表）
- 不添加 macOS/Linux 特定快捷键讨论（保留扩展点）
- 不改动现有 Monaco Editor 内置快捷键

## Acceptance Criteria
- [ ] `Ctrl+Tab` 在终端标签页之间循环切换
- [ ] `Ctrl+W` 关闭当前终端
- [ ] `Ctrl+,` 切换到设置页
- [ ] `Escape` 关闭模态框
- [ ] `Alt+Space` 全局唤出/隐藏应用
- [ ] 快捷键列表在设置页显示
- [ ] `npm run build` 无错误
- [ ] `npm run lint` 无错误
- [ ] `cargo build` 无错误
