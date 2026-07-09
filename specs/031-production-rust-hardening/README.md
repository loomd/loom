---
status: complete
created: 2026-07-09
priority: high
tags:
  - core
  - cli
  - gui
  - rust
  - robustness
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# Production Rust 代码加固

## Overview
`crates/core/src/storage/manager.rs` 中存在约 10 个 `.unwrap()` 调用在生产运行路径上（非测试代码），任何意外的 `None` 或 `Err` 都会直接 panic 崩溃进程。全部替换为带上下文的错误传播。

## Requirements
- [ ] 定位 `manager.rs` 中所有非测试代码的 `.unwrap()` 调用（约 10 处）
- [ ] 逐个分析每个 unwrap 的上下文，判断应使用：
  - `.ok_or_else(|| StorageError::...)?` 传播错误
  - `.unwrap_or_default()` 提供安全默认值
  - `.unwrap_or_else(|e| { warn!("..."); fallback })` 带降级
- [ ] 重点关注的调用点（基于扫描结果）：
  - 第 721 行附近：工具迭代中的 unwrap
  - 第 824 行附近
  - 第 1403 行附近
  - 第 1526 行附近
  - 第 1569 行附近
  - 第 2180 行附近
  - 第 2296 行附近
- [ ] 替换后确保错误信息包含足够的上下文（哪个操作、哪个资源）
- [ ] 运行 `cargo test` 确认现有测试不受影响

## Non-Goals
- 不改动第三方库依赖
- 不重构 manager.rs 的整体架构
- 不增加新的错误类型变体（使用现有 `StorageError`）

## Acceptance Criteria
- [ ] 所有生产代码路径上的 `.unwrap()` 被消除
- [ ] `cargo clippy --all-targets` 无新增警告（允许既有的 clippy 规则）
- [ ] `cargo test` 全部通过
- [ ] 错误发生时进程不再 panic，而是返回 `Err` 给调用方
