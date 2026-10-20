---
status: complete
created: 2026-10-20
priority: high
tags:
- gui
- layout
- panel
created_at: 2026-10-20T06:07:21.344694200Z
updated_at: 2026-10-20T06:24:21.953987500Z
completed_at: 2026-10-20T06:24:21.953987500Z
transitions:
- status: in-progress
  at: 2026-10-20T06:07:36.369096400Z
- status: complete
  at: 2026-10-20T06:24:21.953987500Z
---

# 072-docked-project-panels-quad-coexist: 四向固定项目面板共存与悬浮模式移除

## Overview
移除原有的边缘鼠标悬浮侧边栏交互机制，将左侧、右侧、顶部、底部四个方向的项目面板统一为相互独立、可自由共存的固定停靠面板（Docked Panels）。全新设计并实现顶部固定面板（TopPanel），将右侧悬浮面板改造为真正的右侧固定列，底部面板精简为纯固定模式，升级外层布局容器以支持四向自由组合。

## Requirements
- [x] 移除悬浮模式交互逻辑：彻底清理 `mousemove` 边缘检测、滑出隐藏定时器及 floating 模式判定。
- [x] 四向面板独立状态管理：支持 `left`、`right`、`top`、`bottom` 四个面板独立开关与持久化，允许多个面板同时开启共存。
- [x] 实现全新顶部固定面板 `TopPanel.tsx`：
  - [x] 横向项目胶囊列表，支持选中高亮、运行状态指示灯与横向滚轮滚动。
  - [x] 预留 `data-tauri-drag-region` 窗口拖拽区域与双击还原/最大化。
  - [x] 集成添加项目入口、设置入口以及窗口控制按钮（最小化/最大化/关闭）。
- [x] 改造右侧面板为固定面板：
  - [x] 移除 position fixed/absolute 悬浮定位，转为 Flex 容器流式固定占位。
  - [x] 支持右侧独立宽度调整（Resizer）与折叠。
- [x] 底部固定面板精简：
  - [x] 移除 `BottomPanel.tsx` 中的 floating 悬浮分支，固定展示嵌入模式。
- [x] 升级 `AppLayout.tsx`：
  - [x] 组织为外层上下顶底、中间左右双立柱与主工作区的灵活四向嵌套布局。
- [x] 设置页面（`GeneralSettingsTab.tsx`）交互升级：
  - [x] 提供四个独立的固定面板启用开关（左侧、右侧、顶部、底部）。
  - [x] 保留“至少开启一个面板”的安全守卫逻辑，防止用户关闭所有面板导致无法访问设置。
- [x] 自动化测试与构建校验：
  - [x] 更新既有单测与 Mock，通过全量 `npm run lint`、`npm test` 与 `npm run build`。

## Non-Goals
- 不再保留任何鼠标移至边缘自动滑出的悬浮面板功能。
- 不引入外部复杂的 Docking 框架，保持轻量无依赖的纯 React + CSS 布局。

## Technical Notes
- 窗口控制按钮协调：当顶部面板开启时，窗口右上角控制按钮由 TopPanel 承载；各子页面可避免重复渲染或隐藏多余的窗口控制。
- 尺寸控制：左侧与右侧面板分别维护独立的宽度 `sidebarWidth` / `rightSidebarWidth`，底部与顶部维护对应的高度。

## Acceptance Criteria
- [x] 用户可以同时开启左、右、顶、底四个面板，项目切换状态实时双向同步。
- [x] 顶部面板可以平滑滚动选择项目，并能通过空白区域拖拽移动应用窗口。
- [x] 右侧固定面板能正常展示并支持拖拽调整宽度。
- [x] 尝试关闭最后一个开启的面板时，给出拦截提示。
- [x] 前端测试、Lint 与编译检查全量通过。
