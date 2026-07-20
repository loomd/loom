---
status: complete
created: 2026-07-20
priority: high
tags:
- gui ux onboarding guidance
created_at: 2026-07-20T07:40:40.031022200Z
updated_at: 2026-07-20T07:53:57.327648500Z
completed_at: 2026-07-20T07:53:57.327648500Z
transitions:
- status: in-progress
  at: 2026-07-20T07:43:03.706980600Z
- status: complete
  at: 2026-07-20T07:53:57.327648500Z
---

# 完整项目引导流水线

## 概述

当前 OnboardingWizard 仅在首次启动时扫描 PATH 选择 Agent，结束后用户即陷入无引导的空白界面。本 spec 将引导扩展到覆盖 Loom 完整使用动线的新手指引系统，确保用户从打开应用到第一次跑起 Agent 全程无阻。

## 动线设计（B 方案）

`
Agent 扫描与发现 → 项目注册 → 环境变量配置 → 模板配置 → 开发执行
`

这种顺序的核心优势是**先发现能力，再落地**。用户先看到系统中存在哪些 AI Agent（opencode、Claude Code 等），有了获得感后，再引导完成后续配置。

## 拆解子 Spec

- [x] **045-tour-overlays** — Tour 步骤叠加层系统（通用 step-by-step overlay 组件）
- [x] **046-onboarding-step-scan** — 引导：Agent 扫描与发现（现有 OnboardingWizard 的重构图）
- [x] **047-onboarding-step-project** — 引导：项目注册
- [x] **048-onboarding-step-config** — 引导：环境变量 + 模板配置
- [x] **049-onboarding-step-verify** — 引导：首次执行验证

## 设计原则

- 纯前端实现，轻量 overlay + CSS spotlight mask，不引第三方库
- 每步可跳过，设置页可随时重播完整动线
- 进度持久化到 localStorage，支持断点续接
- i18n 中英双语
- 与现有 OnboardingWizard 统一样式语言
