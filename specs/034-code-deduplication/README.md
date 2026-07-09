---
status: complete
created: 2026-07-09
priority: medium
tags:
  - core
  - gui
  - rust
  - refactor
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# 跨 Crate 代码去重

## Overview
`expand_env_vars` 函数（~70 行环境变量插值逻辑，处理 `%VAR%` 和 `$VAR` 格式）在两处独立存在：
- `crates/core/src/storage/manager.rs:191`
- `crates/gui/src-tauri/src/pty.rs:187`

内容几乎逐字复制。核心版本应公开导出，GUI 侧改为依赖 `loom_core` 的公开 API。

## Requirements
- [ ] 确认 `loom_core` 中 `expand_env_vars` 的可见性（当前是否为 `pub`）
- [ ] 若非 `pub`，将其改为 `pub` 并确保 `lib.rs` 或其 `storage/mod.rs` 重新导出
- [ ] 删除 `crates/gui/src-tauri/src/pty.rs` 中的重复实现
- [ ] 在 `pty.rs` 中改用 `use loom_core::storage::expand_env_vars;`（或 `loom_core::expand_env_vars`，取决于导出路径）
- [ ] 验证两端功能一致（检查两处实现是否有细微差异）
  - 若存在差异，统一为更完善的版本
- [ ] 搜索是否还有其他跨 crate 重复代码
  - 重点关注 `manager.rs` 中的 `kill_process_tree` 与 `pty.rs` 中的 Windows job object 逻辑

## Non-Goals
- 不重构 `expand_env_vars` 的逻辑或性能
- 不引入新的公共 API
- 不改动 `expand_env_vars` 的外部行为

## Acceptance Criteria
- [ ] `pty.rs` 中不再包含 `expand_env_vars` 的独立实现
- [ ] GUI 终端的环境变量展开行为与 CLI 一致（回归测试）
- [ ] `cargo build` 无错误
- [ ] `cargo test` 全部通过
