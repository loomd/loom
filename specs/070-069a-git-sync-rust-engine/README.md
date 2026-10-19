---
status: complete
created: 2026-10-19
priority: high
tags:
- rust
- git
- ipc
- tauri
parent: 069-git-project-sync-manager
created_at: 2026-10-19T13:16:09.134842600Z
updated_at: 2026-10-19T13:26:36.060933900Z
completed_at: 2026-10-19T13:26:36.060933900Z
transitions:
- status: in-progress
  at: 2026-10-19T13:16:27.575745400Z
- status: complete
  at: 2026-10-19T13:26:36.060933900Z
---

# 070-069a-git-sync-rust-engine: Git Sync Rust 引擎与 IPC 命令

## Overview
在 Rust 侧（crates/core 或 crates/gui/src-tauri）实现安全的 Git 操作包装函数，并暴露 Tauri IPC 命令：
1. check_git_project(project_path): 探测是否为 git 仓库，获取当前分支名、上游跟踪分支、ahead/behind 提交数、是否有工作区未提交改动。支持静默 fetch。
2. pull_git_project(project_path): 在工作区执行 git pull，返回拉取结果与输出信息。

## Requirements
- [x] 探测目录是否属于 Git 仓库
- [x] 执行安全非交互 git fetch（带超时与免交互环境变量）
- [x] 解析分支名与远端分支追踪信息
- [x] 统计 ahead/behind 提交数量
- [x] 探测工作区干净状态
- [x] 执行安全 pull 并捕获输出
- [x] 注册 Tauri 命令并在前端 typed bridge 中暴露
