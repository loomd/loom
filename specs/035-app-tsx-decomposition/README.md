---
status: planned
created: 2026-07-09
priority: high
tags:
  - gui
  - react
  - refactor
  - architecture
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# App.tsx 解耦重构

## Overview
`App.tsx` 当前 1186 行，职责混杂：管理页面路由、项目 CRUD、拖放排序、更新检查、模态框、主题/字体设置、Toast 等。按关注点拆分为可测试的自定义 hooks 和布局组件，App.tsx 降级为编排层。

## Requirements
- [ ] 提取 `useProjects` hook：
  - 项目列表加载、创建、重命名、删除、重新排序
  - 当前选中项目状态 (`selectedProjectId`)
  - 项目拖放处理逻辑 (`handleDragStart`, `handleDragOver`, `handleDrop`)
- [ ] 提取 `useTheme` hook：
  - 主题切换（dark/day/gray）
  - 字体大小管理
  - 字体大小输入防抖
  - 与 `invoke("set_config", ...)` 同步
- [ ] 提取 `useUpdateChecker` hook：
  - 版本检查
  - 更新下载状态跟踪
  - 下载进度
  - 安装触发
- [ ] 提取 `Sidebar` 布局组件：
  - 项目列表渲染
  - 项目拖放排序
  - 添加/设置按钮
- [ ] 提取 `AppLayout` 布局组件：
  - 侧边栏 + 主内容区 + 右面板的布局框架
  - page 切换逻辑（workspace/settings）
- [ ] App.tsx 降级为：
  - 初始化 hooks
  - 将数据分发给子组件
  - 模态框组合层
- [ ] 目标：App.tsx 从 1186 行降低到 <300 行

## Non-Goals
- 不改动前端 API 层（`api.ts`）
- 不改动 `ProjectWorkspace.tsx`
- 不引入外部状态管理库（只用 React hooks + Context）
- 不改动页面路由机制（保留 `page` 状态 + `display:none` 模式，待后续优化）

## Acceptance Criteria
- [ ] 项目 CRUD、拖放排序功能正常
- [ ] 主题切换、字体大小调整正常
- [ ] 更新检查、下载、安装流程正常
- [ ] Toast 通知正常
- [ ] 每个提取的 hook 可以独立写单元测试
- [ ] `npm run build` 无错误
- [ ] `npm run lint` 无错误
