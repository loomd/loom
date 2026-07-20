---
status: complete
created: 2026-07-20
priority: high
tags:
- gui,ux,onboarding
depends_on:
- 049-onboarding-step-config
created_at: 2026-07-20T07:40:45Z
updated_at: 2026-07-20T07:51:27.640987500Z
completed_at: 2026-07-20T07:51:27.640987500Z
transitions:
- status: complete
  at: 2026-07-20T07:51:27.640987500Z
---

# 引导 Step 3：首次执行验证

## 概述

动线最后一步。真正跑一次 Agent 模板，终端联动输出，完成引导闭环。

## 需求

- [x] 从已配置的模板中选一个（优先选已注册 Agent 对应的模板）
- [x] 高亮 "运行" 按钮区域，弹出 "最后一步，让我们实际跑一次"
- [x] 自动执行模板，终端面板联动显示输出
- [x] 执行成功：完成卡片 "配置完成，开始开发吧" + 后续操作建议（快捷键提示）
- [x] 执行失败：错误原因 + "我知道了" 按钮，不阻塞退出
- [x] 引导完成后标记 `onboarding_completed=true`
- [x] 设置页提供 "重新运行引导" 按钮

## Non-Goals

- 不等待 Agent 完整执行结束，超时 45 秒即算通过