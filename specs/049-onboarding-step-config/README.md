---
status: complete
created: 2026-07-20
priority: high
tags:
- gui,ux,onboarding
depends_on:
- 048-onboarding-step-project
created_at: 2026-07-20T07:40:44Z
updated_at: 2026-07-20T07:51:27.527555600Z
completed_at: 2026-07-20T07:51:27.527555600Z
transitions:
- status: complete
  at: 2026-07-20T07:51:27.527555600Z
---

# 引导 Step 2：环境变量与模板配置

## 概述

动线第三步。引导用户完成两项关键配置：环境变量（供模板引用）和模板（定义如何运行 Agent）。

## 需求

### 环境变量

- [x] 高亮 EnvVars 设置区域
- [x] Tour 卡片 "配置环境变量，模板中可通过 %VAR% 引用它们"
- [x] 提供示例变量（如 `WORKSPACE_DIR`）参考
- [x] 允许跳过（变量后续可随时补充）

### 模板

- [x] 高亮 Templates 区域
- [x] Tour 卡片 "创建模板来定义如何运行你的 Agent"
- [x] 为已注册的每个 Agent 自动生成一个默认模板（command = agent path）
- [x] 一键生成全部按钮
- [x] 允许跳过

## Non-Goals

- 不要求用户完善模板指令/参数（仅生成基础框架）