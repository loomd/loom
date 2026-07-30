---
status: complete
created: 2026-07-30
priority: high
tags:
- gui
- react
- layout
- tauri
- panel
created_at: 2026-07-30T13:32:25.434036800Z
updated_at: 2026-07-30T13:45:15.938069200Z
completed_at: 2026-07-30T13:45:15.938069200Z
transitions:
- status: in-progress
  at: 2026-07-30T13:32:49.086519100Z
---

# 底部嵌入式项目面板

## Overview
在 ProjectWorkspace 底部新增一个嵌入式项目面板，固定显示于主内容区下方。左侧/右侧悬浮面板已存在（spec 039），本 spec 仅处理底部面板。

## 设计决策
- **仅支持底部位置**：左侧和右侧维持现有悬浮模式，不做嵌入
- **两种模式**：
  - **嵌入式（默认）**：面板固定显示，push 主内容区向上，不遮挡
  - **悬浮式**：覆盖层模式，鼠标触发显示/隐藏（复用 RightSidebar 的悬浮模式）
- **不允许拖拽**：固定位置，固定高度
- **嵌入高度**：固定 150px
- **控制面板不复用左上角箭头**：通过设置项控制

## Requirements

### 1. 数据模型（crates/core/src/storage/models.rs + manager.rs）
- [x] 在 AppConfig 中添加字段：
  - `bottom_panel_enabled: bool`（默认 true）
  - `bottom_panel_mode: String`（默认 "embedded"，可选值 "embedded" / "floating"）
- [x] 在 manager.rs 中实现 getter/setter：
  - `get_bottom_panel_enabled()`
  - `set_bottom_panel_enabled(bool)`
  - `get_bottom_panel_mode()`
  - `set_bottom_panel_mode(String)`
- [x] 导出到 storage mod.rs

### 2. Rust Tauri commands（crates/gui/src-tauri/src/main.rs）
- [x] 添加 Tauri command 函数：get/set_bottom_panel_enabled, get/set_bottom_panel_mode
- [x] 注册到 command dispatch 和 #[tauri::command]

### 3. 前端 API（crates/gui/frontend/src/api.ts）
- [x] 添加 TypeScript 封装函数：getBottomPanelEnabled, setBottomPanelEnabled, getBottomPanelMode, setBottomPanelMode

### 4. 设置项（crates/gui/frontend/src/pages/settings/GeneralSettingsTab.tsx）
- [x] 新增「底部项目面板」设置组：
  - 开关：启用/禁用底部面板（复用 floatingSidebar 的开关样式）
  - 选择：嵌入 / 悬浮（仅在启用时显示，复用 floatingSidebar 的 left/right 选择样式）

### 5. App.tsx 状态管理
- [x] 添加 bottomPanelEnabled, bottomPanelMode 状态
- [x] localStorage 持久化（key: loom_bottom_panel_enabled, loom_bottom_panel_mode）
- [x] 启动时从 Rust 后端加载初始值
- [x] change handler 同时写前端状态 + localStorage + 后端 API
- [x] 通过 props 传递给 ProjectWorkspace

### 6. BottomPanel 组件（新增 crates/gui/frontend/src/components/BottomPanel.tsx）
- [x] **嵌入模式**：
  - position: fixed; bottom: 0; left: 0; right: 0
  - 固定高度 150px
  - 背景使用 var(--bg-card)，玻璃拟态 backdrop-filter
  - 顶部边框 1px solid var(--border-subtle)
  - 内部内容：水平排列的项目列表条目，左侧加设置入口
  - 项目条目：hover 高亮，active 项目高亮显示，点击切换项目
  - 显示项目 composite status
- [x] **悬浮模式**：
  - position: fixed; bottom: 0; left: 0; right: 0
  - 触发区域：窗口底部 16px
  - 显示时向上滑出 150px，隐藏时 translateY(100%) + opacity 0
  - 鼠标悬停面板时保持显示，离开后 100ms 隐藏
- [x] 统一使用 RightSidebar 已有的项目条目视觉样式，保持一致性
- [x] 启用开关为 false 时直接返回 null

### 7. ProjectWorkspace 集成（crates/gui/frontend/src/pages/ProjectWorkspace.tsx）
- [x] 接收 bottomPanelEmbedded prop
- [x] 嵌入模式时，内容区域预留底部 150px padding-bottom

### 8. i18n（crates/gui/frontend/src/I18nContext.tsx）
- [x] 添加翻译键：proj.bottomPanel.* (5 keys, zh+en)

## Non-Goals
- 左侧/右侧面板不做任何变更（spec 039 已实现）
- 不支持面板高度拖拽
- 不添加左上角箭头状态循环
- 底部面板不与 RightSidebar 的悬浮功能合并

## Technical Notes
- RightSidebar 已使用 `position: fixed; z-index: 9999` 覆盖层模式，底部面板使用相同模式
- 嵌入模式使用 fixed 定位 + 内容区 padding-bottom 预留空间
- 项目数据流复用已有 RightSidebar 的 props（projects, selectedProjectId, onProjectSelect, compositeStates）
- 设置项样式复用 GeneralSettingsTab 中已有的 floatingSidebar 设置组样式

## Acceptance Criteria
- 嵌入模式下，面板固定显示在底部，高度 150px，主内容区不被遮挡
- 悬浮模式下，面板默认隐藏，鼠标靠近底部 16px 时滑出显示
- 设置项可切换启用/禁用和嵌入/悬浮模式
- 设置变更即时生效，重启后保持
- 项目切换、status 显示与 RightSidebar 一致
- 与 RightSidebar 悬浮功能互不冲突
