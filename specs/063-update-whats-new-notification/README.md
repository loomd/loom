---
status: planned
created: 2026-08-19
priority: high
tags:
- gui updater frontend rust
created_at: 2026-08-19T08:19:23.316852100Z
updated_at: 2026-08-19T08:19:23.316852100Z
---

# 更新后 What's New 通知

## Overview

应用通过 updater 安装新版本并重启后，用户对"发生了什么变化"一无所知。本功能在重启后的首次启动时，通过「上次记录版本 vs 当前版本」对比判定"刚更新"，弹出 What's New 弹窗展示用户手动维护的本次更新说明（markdown 内容，按版本存放在仓库中并打包进应用）。

## Requirements

### 子功能拆分
- [ ] 064-063a-whats-new-rust-storage：Rust 侧持久化上次运行版本 + whats-new 内容文件读取命令
- [ ] 065-063b-whats-new-frontend-dialog：前端启动对比逻辑 + What's New 弹窗展示

## Non-Goals

- 不自动生成更新说明内容（由维护者手动编写 md 文件）
- 不改变现有 updater 检查/下载/安装链路（UpdateToast 保持现状）
- 不做 WebView 内嵌浏览器式富文本渲染（仅支持基础 markdown 子集）
- 不在设置页新增 UI（仅在更新后自动弹出）

## Technical Notes

- 版本记录复用 StorageManager 既有 get/set 模式（与 `get_skipped_version` 同构）
- 内容文件：`crates/gui/src-tauri/whats-new/<version>.md`，通过 tauri.conf.json `bundle.resources` 打包；dev 模式直接读仓库目录
- 对比逻辑在前端：`getVersion()` vs 后端 `get_last_version()`
- 触发语义：无记录（全新安装）→ 不弹并写当前版本；记录 < 当前 → 弹；记录 >= 当前 → 不弹
- 调试：dev 模式提供强制弹窗开关（如环境变量 `LOOM_FORCE_WHATS_NEW`），便于本地验证内容

## Acceptance Criteria

- [ ] 更新后重启首次启动弹出 What's New 弹窗，展示当前版本对应 md 内容
- [ ] 全新安装与版本未变化时不弹窗
- [ ] 弹窗关闭后记录最新版本，下次启动不再重复弹出
- [ ] 本地 debug 可强制弹出验证内容效果
- [ ] 全部测试通过（cargo test / clippy、前端 build / test / lint）
