---
status: in-progress
created: 2026-08-14
priority: high
tags:
- cli
- template
- core
- frontend
- skill
parent: 055-agent-auto-config-skill-ecosystem
created_at: 2026-08-14T09:07:08.796984700Z
updated_at: 2026-08-14T09:07:23.894094300Z
transitions:
- status: in-progress
  at: 2026-08-14T09:07:23.894094300Z
---

# CLI 模板配置与派生面板实时同步

> **Status**: planned · **Priority**: high · **Created**: 2026-08-14

## Overview

运行中的 Agent 通过内部注入的 loom skill 调用 `loom` CLI，直接为 Loom 配置运行模板（list / add / delete）。模板新增后，概览页"派生"面板实时显示可派生的 Agent。注入的 SKILL.md 首环节增加 loom CLI 可用性检测，不可用时即退出流程。

## Requirements

### 核心层（loom_core）
- [ ] 新增 `resolve_cli_id(agent)`：按 CLI 工具 name / alias / id 解析为 cli_id，找不到报错
- [ ] 新增 `get_templates_for_cli(cli_id) -> Vec<Template>`
- [ ] 新增 `delete_template_by_name(cli_id, name)`（复用现有 delete_template 校验语义）
- [ ] 复用现有 `create_template`（已校验 cli 存在、同 cli 同名唯一）

### CLI（loom）
- [ ] `loom template list [--agent <name>] [--json]`：列出全部或按 agent 过滤的模板
- [ ] `loom template add --agent <name> --name <模板名> [--arg <参数>]... [--env KEY=VALUE]... [--pwd <dir>] [--env-mode <inherit|isolated>]`
- [ ] `loom template delete --agent <name> --name <模板名>`
- [ ] `print_help` 增加 template 命令说明

### GUI 后端（文件监听 + 事件推送）
- [ ] 引入 notify 依赖，后台线程监听 loom.json 变化（debounce），emit `config-changed` 事件
- [ ] 监听线程随 setup 启动，应用退出时停止

### 前端（派生面板实时刷新）
- [ ] SpawnAgentPanel 订阅 `config-changed` 事件，收到后重新拉取 getTemplates()
- [ ] 打开面板时仍先拉取一次（兜底）

### SKILL.md 同步
- [ ] 注入的 SKILL.md 首环节增加 loom CLI 可用性检测（`loom --version`），不可用则退出流程
- [ ] SKILL.md 中 template list / add / delete 命令与实现保持一致
- [ ] 更新 skill 版本号并重新注入

### 测试
- [ ] 核心层单元测试：resolve_cli_id、get_templates_for_cli、delete_template_by_name
- [ ] CLI 命令参数解析测试（list / add / delete 校验）
- [ ] 前端测试：SpawnAgentPanel 收到事件后刷新
- [ ] 全量验证：cargo test / clippy、前端 build / test / lint

## Non-Goals

- 不新增模板编辑（update）命令（可用 delete + add 代替）
- 不改变模板数据模型（复用现有 Template 结构）
- 不做项目级模板绑定（属于 058 范围）

## Technical Notes

- 模板存储于 `LoomStorage.templates`（全局），`cli_id` 指向 CliTool
- 派生面板链路：App.tsx 触发 `loom-open-spawn` → SpawnAgentPanel → getTemplates()
- 事件名统一为 `config-changed`，前端用 `@tauri-apps/api/event.listen` 订阅

## Acceptance Criteria

- [ ] `loom template add / list / delete` 在终端可直接操作 Loom 模板
- [ ] 新增模板后派生面板无需重开即可显示
- [ ] skill 首环节检测 CLI 可用性，不可用即退出
- [ ] 全部测试通过
