---
status: complete
created: 2026-08-19
priority: high
tags:
- rust storage updater
parent: 063-update-whats-new-notification
created_at: 2026-08-19T08:19:23.384082Z
updated_at: 2026-08-19T08:24:25.906853800Z
completed_at: 2026-08-19T08:24:25.906853800Z
transitions:
- status: complete
  at: 2026-08-19T08:24:25.906853800Z
---

# What's New：Rust 侧版本记录与内容读取

## Overview

在 Rust 侧新增「上次运行版本」的持久化读写（复用 StorageManager 既有模式），并提供按版本读取 whats-new markdown 内容文件的 Tauri command，供前端启动对比与展示。

## Requirements

### 核心层（loom_core StorageManager）
- [x] 新增 `get_last_version() -> Result<Option<String>>`：读取上次运行版本，无记录返回 None
- [x] 新增 `set_last_version(version: Option<String>) -> Result<()>`：写入/清除上次运行版本
- [x] 单元测试：读写往返、None 语义（遵循 TEST_MUTEX 串行约定）

### GUI 后端（src-tauri）
- [x] Tauri command `get_last_version` / `set_last_version`，桥接 StorageManager
- [x] Tauri command `get_whats_new_aggregate(last_version, current_version)`：聚合读取 (last, current] 区间内所有版本 md 内容，按版本降序返回（新版本在前）
- [x] Tauri command `get_whats_new_all()`：调试用，返回全部版本 md（LOOM_FORCE_WHATS_NEW 预览用）
  - dev 模式：读 `crates/gui/src-tauri/whats-new/`（仓库相对路径）
  - prod 模式：从 `resource_dir()` 读同路径文件
  - 文件缺失/解析失败自动跳过，不报错
- [x] `tauri.conf.json` `bundle.resources` 声明 `whats-new/*.md`（md 文件仅 KB 级，全部打包体积可忽略）
- [x] dev 调试开关：检测 `LOOM_FORCE_WHATS_NEW` 环境变量并暴露给前端（command `is_whats_new_forced`），本地验证时跳过版本对比、预览全部版本内容

## Non-Goals

- 不解析 markdown 内容（仅原样返回字符串）
- 不接入 updater 插件内部状态

## Technical Notes

- 参考 `manager.rs` 中 `get_skipped_version`（L1934）/ `set_skipped_version`（L1939）的既有实现模式
- whats-new 目录建议：`crates/gui/src-tauri/whats-new/`，文件名即版本号，如 `v0.6.6.md`（为下个版本预备的内容）
- 需要确认 skipped_version 存储载体（AppConfig 字段或独立文件），last_version 沿用同一载体
- 实施说明（2026-08-19）：内容文件命名对应"即将发布的下个版本"（当前开发 0.6.6 → v0.6.6.md），聚合展示用户跨越的所有版本；版本比较为纯数字 semver（忽略 rc 后缀），单元测试覆盖过滤/排序/上限

## Acceptance Criteria

- [x] `get_last_version` / `set_last_version` 往返正确且有单元测试
- [x] `get_whats_new_aggregate` 在 dev/prod 两种模式下路径解析正确，缺失文件跳过，区间过滤与降序排序有单元测试
- [x] 打包产物包含全部 whats-new 资源（KB 级，体积可忽略）
- [x] `cargo test`、`cargo clippy --all-targets` 通过
