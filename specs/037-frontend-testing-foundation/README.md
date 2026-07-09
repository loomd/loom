---
status: complete
created: 2026-07-09
priority: high
tags:
  - gui
  - testing
  - quality
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# 前端测试覆盖

## Overview
当前前端测试仅覆盖解耦后的设置页子组件（`SettingsDecoupling.test.tsx`，239 行）。核心组件均无测试：
- `ProjectWorkspace.tsx` (1782 行) — 零测试
- `App.tsx` (1186 行) — 零测试
- `TerminalTab.tsx` (637 行) — 零测试
- `FileEditor.tsx` (241 行) — 零测试
- `RightSidebar.tsx` — 零测试
- `utils.ts::mergeCliArgs` (145 行) — 零测试
- `api.ts` — 零测试

充分利用现有的 `test/setup.ts` mock 基础设施（已 mock `invoke`、`listen`、window 操作）。

## Requirements
- [ ] 为 `utils.ts` 工具函数写测试（重点是 `mergeCliArgs` 的复杂逻辑）：
  - 数组模式、对象模式
  - 空输入
  - 参数覆盖优先级
- [ ] 为 `api.ts` 包装器写测试：
  - 每个导出函数的调用参数验证
  - mock `invoke` 返回值
  - 错误传播
- [ ] 为 `TerminalTab.tsx` 写测试：
  - 渲染终端容器
  - 标签页切换
  - 关闭终端
  - mock xterm.js 的 `@xterm/xterm` 模块
- [ ] 为 `FileEditor.tsx` 写测试：
  - 渲染编辑器
  - 语言选择
  - 保存操作
  - mock `@monaco-editor/react`
- [ ] 为 `RightSidebar.tsx` 写测试：
  - 技能/文档 Tab 渲染
  - 点击打开 modal
- [ ] 为 `App.tsx` 写测试（分解后可测性提升后补充）：
  - 项目列表渲染
  - 页面切换
  - 主题切换
- [ ] 检查并修复所有跳过的 e2e 测试（`gui.test.ts` 中 6 个 `.skip`）：
  - 第 297、341、657、679、912、958 行
  - 分析跳过原因，修复或标记为已知限制

## Non-Goals
- 不追求 100% 覆盖率
- 不改动被测试组件的实现（除非为可测性做最小侵入改动）
- 不引入新的测试框架或 runner

## Acceptance Criteria
- [ ] 核心工具函数 `mergeCliArgs` 有完整测试
- [ ] `TerminalTab` 有基本渲染和交互测试
- [ ] `FileEditor` 有基本渲染测试
- [ ] `RightSidebar` 有基本渲染测试
- [ ] `api.ts` 的每个导出函数有 mock 调用测试
- [ ] `vitest run` 全部通过
- [ ] 测试运行时间无明显增加（控制在 <30s）
