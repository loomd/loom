---
status: complete
created: 2026-07-11
priority: medium
tags:
- gui
- sidebar
- layout
- ux
- react
depends_on:
- 028-sidebar-hover-mode
- 026-sidebar-resize-collapse
created_at: 2026-07-11T00:00:00Z
updated_at: 2026-07-11T04:53:31.273430900Z
completed_at: 2026-07-11T04:53:31.273430900Z
transitions:
- status: in-progress
  at: 2026-07-11T04:53:25.765511800Z
- status: complete
  at: 2026-07-11T04:53:31.273430900Z
---

# 左侧侧边栏可折叠隐藏 + 悬浮侧边栏左右定位

> **Status**: planned · **Priority**: medium · **Created**: 2026-07-11

## Overview

两个独立的侧边栏改动：

1. **左侧侧边栏**：不再默认显示，改为默认隐藏。设置页新增"启用左侧侧边栏折叠"开关（默认关闭）。开启后 ProjectWorkspace 左上角"概览"旁出现展开按钮，点击展开/收起左侧栏，保留拖拽缩放功能。
2. **右侧悬浮侧边栏**：新增左右定位选项，可在设置中选择悬浮侧边栏出现在窗口左侧或右侧，鼠标悬浮对应边缘时自动滑出。

## Requirements

### A — 左侧侧边栏默认隐藏 + 设置页控制

- [x] 新增"启用左侧侧边栏折叠"开关（默认关闭）
- [x] 开关关闭时：左侧侧边栏完全隐藏，AppLayout grid 列为 `1fr`，ProjectWorkspace 不显示展开按钮
- [x] 开关开启时：左侧侧边栏默认收起，ProjectWorkspace 左上角"概览"旁显示展开按钮
- [x] `projectColumnAlign` 设置仅在侧边栏启用时生效
- [x] 保留拖拽调整宽度（140px ~ 450px，默认 170px）、双击重置、拖到 < 80px 自动折叠
- [x] 保留项目拖拽排序、设置入口、添加项目按钮
- [x] 持久化 key：`loom_sidebar_collapse_enabled`

### B — 悬浮侧边栏支持左右定位

- [x] 将现有 `RightSidebar.tsx` 改造为支持 `position: "left" | "right"` 属性
- [x] 悬浮触发区域：`position="right"` 时鼠标靠近右侧边缘（10px）触发；`position="left"` 时鼠标靠近左侧边缘（10px）触发
- [x] fixed 定位到对应侧（`left: 0` 或 `right: 0`）
- [x] 滑入/滑出动画方向与位置对应：右侧 `translateX(100%) → 0`；左侧 `translateX(-100%) → 0`
- [x] `border` 样式随位置切换：右侧 `border-left`，左侧 `border-right`
- [x] 项目列表和底部操作（添加项目、设置入口）保持不变
- [x] 宽度保持 120px

### C — 设置页新增

- [x] 将原有的"启用右侧悬浮侧边栏"开关改为"启用悬浮侧边栏" + 位置选择器（左侧 / 右侧）
- [x] 位置选择器：两个按钮 `左侧 | 右侧`
- [x] 新增"启用左侧侧边栏折叠"开关（默认关闭）
- [x] 持久化 key：
  - `loom_floating_sidebar_enabled`
  - `loom_floating_sidebar_position`
  - `loom_sidebar_collapse_enabled`
- [x] 更新 i18n 翻译 key

## Non-Goals

- 不删除 `Sidebar.tsx` 组件
- 不改变右侧悬浮侧边栏宽度（保持 120px）
- 不新增悬浮侧边栏中的图标显示
- 不修改 Rust/Tauri 后端

## Architecture

### 最终布局示意

```
设置开启"左侧侧边栏折叠" + 悬浮侧边栏 position="right"
┌──────────┬─────────────────────────────┬────────────┐
│ 左侧栏   │      主内容区               │ 悬浮触发区  │
│ (折叠/   │     (100%剩余宽度)           │ (右侧边缘   │
│  展开)   │                             │  10px)     │
│          │  ┌──────────────────────┐   │            │
│          │  │  [▶] 概览  Terminal  │   │            │
│          │  └──────────────────────┘   │            │
└──────────┴─────────────────────────────┴────────────┘

设置开启 + 悬浮侧边栏 position="left"
┌──────────┬─────────────────────────────┬────────────┐
│ 悬浮触发  │      主内容区               │            │
│ (左侧边缘 │                             │            │
│  10px)   │  ┌──────────────────────┐   │            │
│          │  │  [▶] 概览  Terminal  │   │            │
│          │  └──────────────────────┘   │            │
└──────────┴─────────────────────────────┴────────────┘
```

### 组件变更

| 文件 | 变更 |
|------|------|
| `src/App.tsx` | 新增 `sidebarCollapseEnabled`、`floatingSidebarPosition` 状态 |
| `src/components/AppLayout.tsx` | 根据 `sidebarCollapseEnabled` + `isCollapsed` 控制 grid 列 |
| `src/components/RightSidebar.tsx` | 新增 `position` prop，支持左右定位和对应动画 |
| `src/pages/ProjectWorkspace.tsx` | 用 `sidebarCollapseEnabled` 控制展开按钮显隐，按钮移至"概览"旁 |
| `src/pages/SettingsPage.tsx` | 传递新 props |
| `src/pages/settings/GeneralSettingsTab.tsx` | 新增左侧栏折叠开关 + 浮动侧边栏位置选择 |
| `src/I18nContext.tsx` | 更新/添加翻译 key |

### 状态管理

```typescript
// 新增
const [sidebarCollapseEnabled, setSidebarCollapseEnabled] = useState<boolean>(false);
const [floatingSidebarPosition, setFloatingSidebarPosition] = useState<"left" | "right">("right");

// 保留
const [sidebarWidth, setSidebarWidth] = useState<number>(170);
const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
const [floatingSidebarEnabled, setFloatingSidebarEnabled] = useState<boolean>(true);
```

## Plan

- [ ] 修改 `App.tsx`：新增 `sidebarCollapseEnabled`、`floatingSidebarPosition` 状态和持久化
- [ ] 改造 `RightSidebar.tsx`：支持 `position` prop，切换 left/right 定位和动画
- [ ] 修改 `AppLayout.tsx`：根据 `sidebarCollapseEnabled` + `isCollapsed` 控制 grid
- [ ] 修改 `ProjectWorkspace.tsx`：展开按钮受 `sidebarCollapseEnabled` 控制，位置移至"概览"旁
- [ ] 修改 `GeneralSettingsTab.tsx`：新增左侧栏折叠开关 + 浮窗位置选择
- [ ] 更新 `I18nContext.tsx`
- [ ] 更新测试文件
- [ ] `npm run lint && cargo clippy` 验证

## Test

- [ ] 默认态：左侧栏隐藏，无展开按钮，主内容区满宽
- [ ] 开启"左侧侧边栏折叠"：展开按钮出现，点击展开/收起正常
- [ ] 侧边栏拖拽缩放、双击重置、自动折叠正常
- [ ] 关闭"左侧侧边栏折叠"：按钮消失，侧边栏隐藏
- [ ] 悬浮侧边栏 position="right"：右侧边缘触发，从右滑入
- [ ] 悬浮侧边栏 position="left"：左侧边缘触发，从左滑入
- [ ] 悬浮侧边栏启用/关闭正常
- [ ] 无编译/类型错误
