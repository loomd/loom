---
status: complete
created: 2026-10-19
priority: high
tags:
- git
- sync
- overview
- rust
- gui
created_at: 2026-10-19T13:16:01.961703300Z
updated_at: 2026-10-19T13:26:36.333044100Z
completed_at: 2026-10-19T13:26:36.333044100Z
transitions:
- status: in-progress
  at: 2026-10-19T13:16:27.474607200Z
- status: complete
  at: 2026-10-19T13:26:36.333044100Z
---

# 069-git-project-sync-manager: Git 项目自动检查与更新管理 (Git Sync Manager)

## Overview
在 Loom 项目工作区概览页（Overview）中为 Git 项目提供安全且不显拥挤的 Git 状态检测与更新拉取能力，包括当前分支、落后/超前 commit 统计、未提交变更检测、一键检查更新与一键拉取。

## Requirements
- [x] 070-069a-git-sync-rust-engine: Rust 侧提供非阻塞、安全的 Git 状态检测与拉取命令（fetch、rev-list、status、pull）
- [x] 071-069b-git-sync-frontend-overview-bar: 前端概览页（Overview）右侧顶部紧凑型 Git 状态横条组件与交互逻辑

## Non-Goals
- 复杂的 Git 冲突图形化三方合并（若遇冲突直接中断并安全提示用户手动处理）
- 自动强行 rebase 或覆盖工作区脏代码
