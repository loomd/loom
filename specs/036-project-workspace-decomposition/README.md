---
status: complete
created: 2026-07-09
priority: high
tags:
- gui
- react
- refactor
- architecture
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-10T14:14:52.300217Z
completed_at: 2026-07-10T14:14:52.300217Z
transitions:
- status: in-progress
  at: 2026-07-10T14:03:07.737571Z
- status: complete
  at: 2026-07-10T14:14:52.300217Z
---

# ProjectWorkspace 解耦重构

## Overview
`ProjectWorkspace.tsx` 当前 1782 行，是前端最大的文件。它管理标签页系统（overview/skills/templates/terminals/files）、终端会话、Monaco 文件编辑器、技能执行、模板运行和文件浏览器。拆分为独立 hooks 和子组件，每个关注点可独立维护和测试。

## Requirements
- [x] 提取 `useTabs` hook：
  - 标签页管理（打开、关闭、切换、排序）
  - 终端标签与工具标签的类型区分
  - `activeTab` / `terminalTabs` 状态
  - 标签关闭确认（正在运行的终端）
- [x] 提取 `useTerminalSessions` hook：
  - 终端创建、销毁
  - 终端输出缓冲区管理
  - PTY 事件监听（`pty-data-*`, `pty-exit-*`）
  - xterm.js 实例引用管理
- [x] 提取 `useWorkspaceData` hook：
  - 项目工具/模板/技能/文档的加载
  - 文件树浏览
  - 文件打开/保存
- [x] 提取 `TerminalPanel` 组件：
  - 垂直双分屏布局管理（spec 027）
  - 终端标签栏
  - 当前活动终端渲染
- [x] 提取 `FileExplorerPanel` 组件：
  - 文件树渲染
  - 文件/目录操作按钮
  - 文件选中状态
- [x] ProjectWorkspace.tsx 降级为：
  - 初始化 hooks
  - 将数据分发给各面板组件
  - 布局框架（左右分栏）
- [x] 目标：ProjectWorkspace.tsx 从 1782 行降低到 <400 行

## Non-Goals
- 不改动 PTY 后端的实现（`pty.rs`）
- 不改动 `TerminalTab.tsx` 或 `FileEditor.tsx` 的内部实现
- 不改动标签页类型的序列化/反序列化逻辑（`types.ts`）
- 不改变终端双分屏的交互行为

## Acceptance Criteria
- [x] 终端创建/销毁/切换正常
- [x] 文件树浏览和文件打开正常
- [x] Monaco 编辑器打开/编辑/保存正常
- [x] 技能和模板标签页功能正常
- [x] 垂直双分屏（dual view）交互正常
- [x] `npm run build` 无错误
- [x] `npm run lint` 无错误
- [x] 每个提取的 hook 和组件可独立编写测试
