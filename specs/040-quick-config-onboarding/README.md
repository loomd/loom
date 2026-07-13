---
status: planned
created: 2026-07-11
priority: medium
tags:
- gui
- ux
- cli
- onboarding
- agent
created_at: 2026-07-11T06:35:19.615112600Z
updated_at: 2026-07-11T07:00:00.000000000Z
---

# 快捷配置与功能引导

## 概述

Loom 的核心定位是 **AI Agent CLI 管理器**。新用户首次使用时，全量扫描 PATH 中的所有可执行文件，通过智能分类将 AI 编程助手 CLI（如 opencode、Claude Code、Codex、Gemini CLI 等）**置顶高亮**，其他工具自动归入"其他"类别靠后展示。引导用户快速注册 AI Agent 并完成初始设置，实现开箱即用。

> 设置页中的 "CLI 工具管理" 本质上是 **Agent 管理** —— 这些工具不是通用的开发者工具，而是基于终端交互的 AI 编程代理。但 Loom 仍然管理所有工具，只是 AI Agent 享有最高优先级。

## 前置对齐

在实施本 spec 前，需先完成以下重命名/重构：

- [ ] 将设置页的 "CLI Tools"（工具）标签统一更名为 "Agents"（代理）
- [ ] `CliToolsTab` → `AgentsTab`，`CliToolConfigModal` → `AgentConfigModal`
- [ ] 在全局语义上，所有 "CLI 工具" 相关命名逐步向 "Agent" 收敛

## 需求

### 1. 全量扫描与智能分类

利用现有的 `scan_path_env()` 全量扫描 PATH，但返回时按以下优先级排序：

- [ ] **优先级 A — AI Agent CLI（置顶高亮）**：检测常见 AI 编程助手：
  - `opencode` / `opencode.exe`
  - `claude` / `claude.exe`（Claude Code）
  - `codex` / `codex.exe`（Codex CLI）
  - `gemini` / `gemini.exe`（Gemini CLI for coding）
  - 可扩展的识别规则列表
- [ ] **优先级 B — 其他工具（靠后/折叠）**：所有非 AI 类的通用开发者工具
  - 默认折叠展示，不干扰 AI Agent 的可见性
- [ ] 读取各 AI Agent 的版本信息（`--version`）
- [ ] 标记检测到的 AI Agent 状态（已安装 / 未安装 / 版本信息）
- [ ] 未安装的 AI Agent 给出安装提示（官网链接 / 包管理器命令）

### 2. 一键注册与技能关联

- [ ] 检测到的 AI Agent 自动推荐注册为 Loom 的 Agent（即 CliTool）
- [ ] 每个 AI Agent 自动关联对应的 Skill（Agent 的工作指引 SKILL.md）
- [ ] 提供"一键注册全部 AI Agent" 和 "逐个确认" 两种模式
- [ ] 对于已注册的 Agent，显示"已配置"状态
- [ ] 其他工具仅列出，不主动推荐注册

### 3. 首次启动引导向导（Welcome/Onboarding）

- [ ] 首次启动 Loom 时自动弹出快捷配置向导
- [ ] 第 1 步：展示检测结果概览，AI Agent 区置顶显示，其他工具折叠在底部。勾选要注册的 AI Agent
- [ ] 第 2 步：为每个 AI Agent 配置关联的 Skill
- [ ] 第 3 步：完成概览 —— 展示已注册的 AI Agent 和下一步操作建议
- [ ] 整个流程不超过 3 步完成

### 4. 后续入口

- [ ] 支持跳过引导，稍后通过菜单（帮助 / 设置）重新打开
- [ ] 配置完成后展示功能概览与可用命令列表
- [ ] 提供"重新检测"功能，用于安装新 Agent 后更新

## 非目标

- 不涉及手动导入/扫描其他项目管理工具
- 不修改用户已有的自定义配置
- 不限制用户手动注册非 AI 类工具，只是不主动推荐

## 验收标准

- 新用户首次启动 Loom 时自动弹出快捷配置向导
- 向导全量扫描 PATH 中的所有可执行文件
- AI Agent CLI（opencode、claude、codex、gemini 等）在列表顶部高亮显示
- 非 AI 工具折叠在"其他工具"区域，不抢占注意力
- 对于未安装的 AI Agent，提供安装提示（官网链接或包管理器命令）
- AI Agent 可一键注册全部，并可关联对应的 Skill 文件
- 整个流程不超过 3 步完成
- 跳过后可通过菜单再次打开引导