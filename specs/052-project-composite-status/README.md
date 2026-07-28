---
status: complete
created: 2026-07-28
priority: high
tags:
- gui
- frontend
- sidebar
- agent
- status
depends_on:
- 042-agent-status-monitor
created_at: 2026-07-28T05:39:18.639208900Z
updated_at: 2026-07-28T05:42:56.778672200Z
completed_at: 2026-07-28T05:42:56.778672200Z
transitions:
- status: complete
  at: 2026-07-28T05:42:56.778672200Z
---

# Project Composite Status

> **Status**: in-progress · **Priority**: high · **Created**: 2026-07-28

## Overview

当前左侧 Sidebar 项目项仅显示项目名称，无任何实时状态反馈。用户切换 ProjectWorkspace 页才能查看 agent 状态。

本 spec 通过在 Sidebar 项目文字上叠加复合灯态，实现**项目级状态感知**——聚合项目内所有子状态（opencode AI agent、spawned process 等）为一个复合灯态，通过文字颜色+闪烁动画表达，替代现有 emoji 图标。

## 设计

### 复合灯态聚合规则

项目灯态 = 项目内所有子状态按优先级聚合，取最高优先级

| 优先级 | 子状态条件 | 复合灯态 | 颜色 | 动画 |
|--------|-----------|---------|------|------|
| 1 | 任一子状态为 `error` (opencode error / process failed) | error | `var(--accent-red)` | 慢呼吸 1.5s |
| 2 | opencode 为 `question` (等待用户回答) | question | `var(--accent-amber)` | 脉冲 0.8s |
| 3 | 任一子状态为 `running` / `agent_call` | running | `var(--accent-emerald)` | 呼吸 1s |
| 4 | opencode 为 `waiting` (回复完成) | waiting | `var(--accent-sky)` | 静态 (天蓝) |
| 5 | opencode 为 `idle` | idle | `var(--accent-lilac)` 或 `#a855f7` | 静态 |
| 6 | 无 session/无 activity | — | `var(--text-secondary)` (默认灰) | 无 |

### 颜色方案

参考 shell 终端灯态设计：
- **error** → 红色 `var(--accent-red)` — 同终端错误提示
- **question** → 琥珀 `var(--accent-amber)` — 同 Shell 警告色
- **running** → 翠绿 `var(--accent-emerald)` — 同 Shell 运行指示
- **waiting** → 天蓝 `var(--accent-sky)` — 默认活跃态（同你指定的默认色）
- **idle** → 紫 `#a855f7` — 休眠态

### 文字闪烁替代 emoji

- **移除** Sidebar 项目项的 `📁` emoji
- 项目名称文字通过 `color` + `animation` 表达灯态，无需额外图标元素
- 闪烁动画使用 CSS `@keyframes` 控制 `opacity` / `text-shadow`

### 子状态源

| 子状态源 | 获取方式 | 当前状态 |
|---------|---------|---------|
| OpenCode AI Agent | `pollAgentState(project.root_path)` | ✅ 已有 |
| Spawned Process (agent instances) | `getProjectAgents(project.id)` 过滤 `status=running` | ✅ 已有 |
| CLI tool 运行实例 | 待扩展 | ❌ 后续 |

### 聚合层位置

新建 `src/hooks/useProjectCompositeStates.ts`：
- 输入 `projects: Project[]`
- 每 2s 并行调用 `pollAgentState` + 读取 `activeAgents` 状态
- 输出 `Record<string, CompositeState>`（projectId → 聚合后灯态）
- 聚合逻辑：遍历所有子状态，按优先级表取最高级

### 实现路径

1. **hooks/useProjectCompositeStates.ts** — 聚合 hook
2. **App.tsx** — 引入 hook，透传 `compositeStates` 到 Sidebar
3. **Sidebar.tsx** — 删除 emoji，接受 `compositeStates` prop，动态 style
4. **index.css** — 新增 `@keyframes` 动画类

## Plan

- [x] 创建 `useProjectCompositeStates` hook：聚合 opencode + process 状态
- [x] Sidebar 删除 `📁` emoji，接收 `compositeStates` prop 驱动文字颜色+动画
- [x] App.tsx 透传 compositeStates 到 Sidebar
- [x] App.tsx 路由将 compositeStates 也传入 RightSidebar（同步去 emoji + 灯态）
- [x] RightSidebar 同步删除 emoji + 加灯态
- [x] 编写 CSS `@keyframes` 动画类（pulse-slow, pulse-fast, breathe 等）
- [x] 验证：npm run lint

## Test

- [x] Sidebar 项目文字颜色随复合状态正确变化
- [x] error 状态 → 红色 + 慢呼吸动画
- [x] running 状态 → 翠绿 + 呼吸动画
- [x] question 状态 → 琥珀 + 脉冲动画
- [x] 无活动项目 → 默认文字色，无动画
- [x] emoji 已完全移除（Sidebar + RightSidebar）
- [x] 多项目时每个项目独立轮询互不干扰

## Notes

- 依赖 Spec 042 Agent Status Monitor（提供 `pollAgentState` 能力）
- 颜色变量 `var(--accent-*)` 已在现有的 CSS 变量体系中定义
- 后续可扩展更多子状态源，只需在 `useProjectCompositeStates` 中添加聚合输入
