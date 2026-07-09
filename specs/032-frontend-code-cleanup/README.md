---
status: complete
created: 2026-07-09
priority: medium
tags:
  - gui
  - react
  - refactor
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# 前端代码清理

## Overview
三个低风险但影响开发体验的问题：(1) `TerminalTab.tsx` 残留 20+ 条 IME 调试 `console.log`；(2) 设置页 4 个 tab 始终挂载在 DOM 中（`display:none` 而非条件 unmount）；(3) `main.rs` 中 40+ 行逐个导入函数并 `as core_xxx` 别名，可简化为模块别名。

## Requirements
- [ ] 清理 `TerminalTab.tsx` 中所有 `console.log` / `console.warn` 调试语句（约 20+ 处，集中在 IME 位置计算逻辑）
  - 对仍有价值的日志改为 `console.debug` 或通过环境变量开关
  - 大部分可安全移除（IME 定位功能已稳定）
- [ ] 修复设置页 tab 挂载问题：
  - 当前 `SettingsPage.tsx` 中 4 个 tab 子组件始终渲染
  - 改为真正的条件挂载（active tab 才 mount，切换时 unmount/mount）
  - 注意保留 tab 切换时状态重置（非目标，但目前隐式依赖应确认）
- [ ] 简化 `main.rs` 导入：
  - 当前模式：`use loom_core::storage::function_name as core_function_name;` × 40+
  - 改为：`use loom_core::storage as core_storage;`
  - 调用处改为 `core_storage::function_name(...)`
  - 保留特殊别名（如冲突的命名）不变

## Non-Goals
- 不改动 `TerminalTab.tsx` 的 IME 定位逻辑本身
- 不为 tab 挂载引入状态持久化（切换 tab 允许丢失未保存状态）
- 不动 `main.rs` 中的 Tauri 命令签名

## Acceptance Criteria
- [ ] 终端不再打印调试日志（正常使用场景）
- [ ] 切换设置 tab 时不可见的 tab 组件从 DOM 中卸载
- [ ] `main.rs` 导入从 40+ 行减少到 <5 行
- [ ] `npm run build` 无错误
- [ ] `npm run lint` 无错误
- [ ] `cargo build` 无错误
- [ ] 终端 IME 输入中日韩文字正常工作（回归验证）
