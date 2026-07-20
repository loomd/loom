---
status: complete
created: 2026-07-20
priority: high
tags:
- gui,ux,onboarding
depends_on:
- 047-onboarding-step-scan
created_at: 2026-07-20T07:40:43Z
updated_at: 2026-07-20T07:51:27.413828Z
completed_at: 2026-07-20T07:51:27.413828Z
transitions:
- status: complete
  at: 2026-07-20T07:51:27.413828Z
---

# 引导 Step 1：项目注册

## 概述

动线第二步。用户选择项目所在目录，通过 RegisterProjectFlow 完成项目注册，绑定扫描到的 Agent，为后续建立容器。

## 需求

- [x] 高亮右侧 "New Project" 按钮，弹出 Tour 卡片说明
- [x] 卡片文案 "为您的工作选择一个项目目录，Loom 会在此管理 Agent 和环境"
- [x] 用户点击后，高亮 `RegisterProjectFlow` 的输入框区域
- [x] 自动填入默认路径（用户 HOME 目录）
- [x] Agent 自动绑定：将上一步选中的 Agent 自动注册到该项目
- [x] 注册完成后自动推进到下一步

## Non-Goals

- 不改造现有 RegisterProjectFlow 的内部逻辑