---
status: planned
created: 2026-08-13
priority: high
tags:
- agent
- skill
- rust
- injection
- versioning
parent: 055-agent-auto-config-skill-ecosystem
created_at: 2026-08-13T13:58:03.964114500Z
updated_at: 2026-08-13T13:58:04.102979200Z
---

# 应用启动时版本化 Skill 自动注入引擎

> **Status**: planned · **Priority**: high · **Created**: 2026-08-13

## Overview

负责在 Loom（Rust 后端/Core）启动时，自动将最新的 `loom` Skill 文件版本化注入到全局与常见 Agent 的 Skill 目录中（如 Claude Code `~/.claude/skills/loom/SKILL.md`，OpenCode `~/.agents/skills/loom/SKILL.md`）。

## Requirements & Design

- **版本对比管理**：Skill 文件中标注版本头部元数据（如 `version: 0.1.0`），启动时若目标文件不存在或版本低于内置版本，则自动安全覆盖更新；若包含用户自定义标志（如 `user-override: true`）或更高版本则跳过。
- **内置 Skill 内容定义**：包含 Loom CLI 核心指令指南（`loom list` / `loom template run` / `loom env set` / `loom status`），让被拉起的 Agent 能理解并精确操控 Loom。
- **跨平台路径适配**：智能解析各操作系统下的用户 HOME 目录与各 Agent 规范的 Skill 存放位置。
- **Tauri 命令暴漏**：提供 `inject_loom_skills` Tauri 命令，以便在 GUI 界面支持手动“重新注入/更新 Skill”。

## Implementation Steps

- [ ] 在 `crates/core/src` 中增加 `skills` 模块与版本对比校验逻辑。
- [ ] 编写内置 Loom Skill Markdown 模版（含版本号与详细的 `loom` CLI 配合指令）。
- [ ] 在 Tauri 启动序列 (`crates/gui/src-tauri/src/main.rs`) 中加入启动自动注入调用。
- [ ] 暴露 Tauri 手动触发 IPC `inject_loom_skills`。
- [ ] 编写 Rust 单元测试验证不同版本、缺失目录下的自动创建与覆盖行为。

## Acceptance Criteria

- [ ] 每次 Loom 启动均静默且快速完成 Skill 校验与注入。
- [ ] `~/.claude/skills/loom/SKILL.md` 与 `~/.agents/skills/loom/SKILL.md` 正确创建。
- [ ] 版本较低的文件会被自动无缝平滑升级，且修改符合安全性规范。
