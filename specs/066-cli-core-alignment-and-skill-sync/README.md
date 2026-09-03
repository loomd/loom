---
status: completed
created: '2026-09-03'
tags:
  - cli
  - core
  - skill
  - docs
priority: high
created_at: '2026-09-03T02:28:09.548316200+00:00'
---

# CLI-Core-Skill-Alignment

> **Status**: completed · **Priority**: high · **Created**: 2026-09-03

## Overview

解决 `loom-cli`、`loom-core` 和 `crates/core/src/skills.rs`（生成的 `SKILL.md`）三者之间的能力脱节问题：
1. `loom-cli` 缺少 `project`、`env` 命令组以及 `template edit` / `template reorder` 命令，导致 AI 代理依照 `SKILL.md` 指令调用时报错（甚至误执行系统的 `/usr/bin/env`），被迫直接读写 `loom.json` 带来数据竞争与损坏隐患。
2. `skills.rs` 文档与 CLI 实际参数、格式存在不一致（如 `loom tool list` vs `loom list`，参数格式不统一）。
3. 补齐 CLI 对底层 `loom_core::storage` 已有能力的暴露，并同步修正 `SKILL.md` 文档与测试用例。

## Design

### 1. `loom-cli` 命令集扩充 (`crates/cli/src/main.rs`)

1. **`project` 命令组**:
   - `loom project list` (输出项目 ID、名称、路径、绑定模板数)
   - `loom project add <name> <root_path>`
   - `loom project delete <id>`
2. **`env` 命令组**:
   - `loom env list` (输出全局环境变量 key、value、description、enabled)
   - `loom env set <key> <value> [description]`
   - `loom env delete <id-or-key>`
3. **`template` 命令组扩充**:
   - `loom template edit <id>` (支持更新 `--name`, `--args`, `--cwd`, `--env`, `--description`)
   - `loom template reorder <id1> <id2> ...`
4. **`list` 与兼容性**:
   - 支持 `loom tool list` 作为 `loom list` 的子命令别名或保留顶层 `loom list` 并在 `loom tool list` 兼容解析，避免 AI 习惯使用 `loom tool list` 报未知命令。

### 2. `skills.rs` 文档同步 (`crates/core/src/skills.rs`)

- 更新内嵌的 `SKILL.md` 模板内容，与 CLI 真实实现的命令、参数完全对齐。
- 更新相关的自动生成与测试断言。

### 3. 测试与验证

- `crates/cli/src/main.rs` 单元测试与端到端测试覆盖：
  - 测试 `project list/add/delete`
  - 测试 `env list/set/delete`
  - 测试 `template edit/reorder`
  - 测试 `tool list` 兼容调用
- 运行 `cargo test`、`cargo clippy`。

## Plan

- [x] 创建 spec 并分析现状
- [ ] 在 `crates/cli/src/main.rs` 中实现 `project` 子命令 (`list`, `add`, `delete`)
- [ ] 在 `crates/cli/src/main.rs` 中实现 `env` 子命令 (`list`, `set`, `delete`)
- [ ] 在 `crates/cli/src/main.rs` 中补齐 `template edit` 和 `template reorder` 子命令
- [ ] 在 `crates/cli/src/main.rs` 中增加 `tool` 子命令兼容 (`tool list`)
- [ ] 更新 `crates/core/src/skills.rs` 中的 `SKILL.md` 模板与说明
- [ ] 编写并执行单元测试与 CLI 本地验证
- [ ] 完成 spec 验收并标记完成

## Test

- [ ] `cargo test -p loom-cli` 全部通过
- [ ] `cargo test -p loom-core` 全部通过
- [ ] `cargo clippy --all-targets` 无报错
- [ ] 本地验证 `loom project list/add/delete` 真实运行成功
- [ ] 本地验证 `loom env list/set/delete` 真实运行成功
- [ ] 本地验证 `loom template edit/reorder` 真实运行成功
- [ ] 本地验证 `loom tool list` 正常列出工具
