---
status: planned
created: 2026-08-13
priority: high
tags:
- agent
- frontend
- project-card
- template
- gui
parent: 055-agent-auto-config-skill-ecosystem
created_at: 2026-08-13T13:58:04.075489800Z
updated_at: 2026-08-13T13:58:04.186638500Z
---

# 项目面板 Agent 快捷卡片与自动模板绑定及操作闭环

> **Status**: planned · **Priority**: high · **Created**: 2026-08-13

## Overview

在项目管理 UI 页面中增强 Agent 交互闭环。在注册项目卡片列表上方或顶部增加 Agent 配置入口卡片，配置完成后自动向 Loom 注册 Agent 的 CLI 执行 Template，并提供快捷运行按钮。

## Requirements & Design

- **项目面板 Agent 注册卡片**：
  - 在 Project Dashboard / Workspace 界面中增加直观的 “配置 Agent / OpenCode” 快捷引导卡片。
  - 点击卡片直接跳转至 Agent 配置页面。
- **自动化 Loom 运行模板绑定**：
  - 当完成 Agent 配置后，提供“为当前/选定项目自动生成 Agent 运行模板”的按钮。
  - 自动向 Loom 的 `templates` 配置中写入形如 `opencode run` 或 `claude` 的模板，自动配置环境变量（如 `OPENAI_API_KEY` 等）。
- **操作与启动闭环**：
  - 用户在项目面板直接点击“运行 OpenCode”，Loom 通过 PTY/Process Engine 唤起该终端，同时注入了 Loom Skill 的 Agent 将可以在工作区终端中直接执行 `loom` CLI 命令反向管理 Loom 设施。

## Implementation Steps

- [ ] 在前端 Project Grid / Header 中设计并植入 “Agent 配置与绑定”卡片。
- [ ] 开发配置完成后的“一键自动绑定为 Loom 运行模板”逻辑。
- [ ] 关联 Agent Status，若已配好则直接在项目卡片显示“启动 Agent”快捷按钮。
- [ ] 编写 E2E 测试/前端单元测试，验证卡片跳转与模板自动注入绑定逻辑。

## Acceptance Criteria

- [ ] 用户可在注册项目面板清晰看到 Agent 状态与配置入口卡片。
- [ ] 点击配置完成之后，项目下可直接看到并快速运行绑定好的 Agent Template。
- [ ] Agent 启动后可通过内部 Skill 直接执行 `loom` CLI 命令。
