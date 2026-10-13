---
status: complete
created: '2026-10-10'
tags:
  - gui
  - tauri
  - multi-window
  - workspace
priority: high
created_at: '2026-10-10T01:50:06.786264100+00:00'
transitions:
  - status: in-progress
    at: '2026-10-10T01:55:00.000000000+00:00'
  - status: complete
    at: '2026-10-10T02:15:00.000000000+00:00'
---

# 多原生窗口项目独立并开管理

> **Status**: complete · **Priority**: high · **Created**: 2026-10-10

## Overview

目前 Loom 单主窗口一屏内仅能管理展示单个项目，多项目之间需要通过侧边栏频繁切换。当用户进行微服务架构、前后端联动、多 Agent 并发开发或者多显示器工作时，缺乏同屏或跨屏同时观察并操作多个项目终端与工作区的能力。

本规范实现**方案二：多原生窗口模式（Multi-Window）**：在保持单一 Rust 进程和单实例安全架构的前提下，通过 Tauri `WebviewWindowBuilder` 派生独立的项目工作区原生窗口。用户可随时右键点击项目选择“在独立窗口中打开”，将特定项目置于独立的原生窗口中全屏显示，支持配合 Windows Snap Layouts 自由跨屏、分屏并行开发与操作。

## Design

### 1. 架构与进程边界
- **保持单一 Rust 主进程**：全局配置持久化（`loom.json`）、PTY 进程会话管理、系统托盘和全局快捷键由主进程统一管理，避免多进程引发的文件锁冲突、WebView2 数据目录冲突和快捷键抢占。
- **动态 Webview 窗口派生**：
  - 后端提供 Tauri 命令 `open_project_window(project_id: String, title: String)`。
  - 窗口 Label 规范：`project-window-${project_id}`。若对应窗口已存在，则聚焦并置顶（`show()` + `set_focus()`），避免重复弹出同项目窗口。
  - 窗口初始尺寸：1200 x 780，最小尺寸：800 x 560，标题栏自定义透明或自绘。
  - 通过 `initialization_script` 注入 `window.__LOOM_PROJECT_WINDOW__ = { projectId, windowType: "project" }`，避免 Windows 文件路径解析中带 query 参数导致的问题。

### 2. 前端展示与窗口解耦
- **独立项目窗口模式**：
  - 在前端入口（`App.tsx`）检测 `__LOOM_PROJECT_WINDOW__`。
  - 不渲染左侧主导航侧边栏（`Sidebar`），将整个窗口空间分配给当前指定的 `ProjectWorkspace`。
  - 使用 `ProjectWorkspace` 顶栏自带的拖拽区域（`data-tauri-drag-region`）与 `WindowControlButtons`（最小化/最大化/关闭按钮）。
  - 子窗口关闭仅销毁当前 Webview 窗口，不退出整个应用程序。
- **主窗口模式**：
  - 保持原有的完整行为。
  - 在左侧侧边栏项目图标的右键菜单中，增加“在独立窗口中打开”选项。

### 3. 数据与状态同步
- 所有窗口共用同一个 Tauri 后端。
- `config-changed` 事件在后端通过 `app_handle.emit` 广播，所有打开的项目窗口均能实时感知配置变化。
- 窗口各自维护针对其项目的终端与文件编辑状态。

### 4. 主窗口互斥避让与窗口快速聚焦
- **互斥防双开机制**：
  - 后端维护当前处于打开状态的独立子窗口项目集合 `OPEN_PROJECT_WINDOWS`，并在窗口打开和销毁时实时向前端广播 `open-project-windows-changed`。
  - 主窗口一旦检测到当前选中的项目已在子窗口打开，自动切走至下一个可用项目，杜绝同一项目双开。
  - 在 `Sidebar.tsx` 中，已在独立窗口运行的项目展示专属的向外箭头小图标（`↗`），在主窗口不可作为常规激活项；用户在主窗口点击该项目时，直接将其对应的独立窗口唤醒至屏幕前置并聚焦（Focus/Bring to front）。
  - 当子窗口关闭时，该项目自动解除锁定，主窗口无缝恢复对其可操作性。

## Plan

- [x] 后端：在 `crates/gui/src-tauri/src/main.rs` 中实现 `open_project_window` Tauri 命令并注册。
- [x] 前端类型与 API：在 `types.ts` 和 `api.ts` 中封装 `openProjectWindow` IPC 调用。
- [x] 前端侧边栏交互：在 `Sidebar.tsx` 项目右键菜单中增加“在独立窗口中打开”功能。
- [x] 前端路由与布局适配：在 `App.tsx` 增加对独立项目窗口的解析与全屏渲染模式。
- [x] 国际化与样式微调：在中英文语言包补充“在独立窗口中打开”文案，确保独立窗口标题栏和窗口控制器正常工作。
- [x] 跨窗口互斥与避让：实现主窗口自动避让切走逻辑，侧边栏显示独立窗口状态，点击直接唤醒对应窗口。
- [x] 自动化测试与质量验收：运行 Rust 静态检查、全量单元测试及前端编译构建测试。

## Test

- [x] `cargo check --all-targets` 与 `cargo clippy --all-targets` 通过，无告警与报错。
- [x] `cargo test --workspace` 通过（114 个测试全数通过）。
- [x] 前端 `npm run build` 和 `npm run lint` 通过。
- [x] 前端单元测试 `npm test` 通过（225 个用例全数通过）。

## Notes

- 确保独立窗口在关闭时不会触发全应用退出（仅关闭当前 Webview 窗口）。
- 窗口尺寸和位置遵从操作系统管理，避免窗口重叠闪烁。
