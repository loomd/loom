---
status: complete
created: 2026-07-20
priority: high
tags:
- gui,ux,onboarding
created_at: 2026-07-20T07:40:42Z
updated_at: 2026-07-20T07:51:27.295786200Z
completed_at: 2026-07-20T07:51:27.295786200Z
transitions:
- status: complete
  at: 2026-07-20T07:51:27.295786200Z
---

# 引导 Step 0：Agent 扫描与发现

## 概述

动线第一步。用户打开 Loom 后，自动触发 PATH 扫描，展示发现的 AI Agent 列表，勾选要注册的 Agent，完成后进入下一步。

## 需求

- [x] 复用现有 `OnboardingWizard` + `useOnboarding` 的扫描/选择逻辑
- [x] 扫描结果展示后自动推进到下一步（无需用户手动点完成）
- [x] 若勾选了 Agent，确认后持久化结果到引导状态
- [x] 零 Agent 场景：提供 "手动添加" 和 "跳过" 两个选项
- [x] 步骤标题 "发现 AI Agents"，说明 "扫描 PATH 后找到以下 AI 编程助手"
- [x] 已注册 Agent 标记 "已配置"，未安装显示安装链接

## Non-Goals

- 不改变现有 Agent 识别逻辑（详见 040 spec）