---
status: planned
created: 2026-08-13
priority: high
tags:
- agent
- opencode
- models
- tauri
- config
parent: 055-agent-auto-config-skill-ecosystem
created_at: 2026-08-13T13:58:04.037119200Z
updated_at: 2026-08-13T13:58:04.148154100Z
---

# Agent 下载发现、模型动态拉取与 JSON 配置自动生成

> **Status**: planned · **Priority**: high · **Created**: 2026-08-13

## Overview

提供专用的 Agent 配置页面，实现 OpenCode / Claude Code 的状态扫描与发现，针对 Custom Provider 自动请求 BaseURL 拉取模型列表，并自动化打包写回目标 Agent 配置文件（如 `opencode.json`）。

## Requirements & Design

- **PATH 状态检测与下载引导**：检测系统 PATH 中是否存在 `opencode` / `claude` CLI，若未安装显示官方下载路径与一键复制安装指令（如 `npm install -g opencode-ai`）。
- **Provider & Model 发现引擎**：
  - 用户可填写 Provider 名称（如 OpenRouter, DeepSeek, Custom API）、BaseURL（如 `https://api.deepseek.com/v1`）与 API Key。
  - 后端通过 reqwest 异步请求 `${BaseURL}/models`，解析并返回模型 ID 列表供前端 Selector 下拉选择。
- **自动配置文件生成**：
  - 将选中的 Provider / Model / Key 生成/更新至目标配置文件（例如 OpenCode 的 `opencode.json` 或 `~/.config/opencode/opencode.json`）。
- **Tauri IPC Command**：
  - `fetch_provider_models(base_url, api_key)`
  - `write_opencode_config(config_data)`
  - `detect_agents_status()`

## Implementation Steps

- [ ] 在 `crates/core` 中引入 HTTP 客户端功能拉取 OpenAI 规范的 `/models` 响应。
- [ ] 实现 `opencode.json` 结构的解析与安全序列化合并写回。
- [ ] 编写前端 Agent 专用配置 View 页面组件。
- [ ] 完成 BaseURL / API Key 校验、动态模型下拉框与 JSON 配置同步写入功能。
- [ ] 增加错误边界与网络超时/KEY异常提示机制。

## Acceptance Criteria

- [ ] 输入合法的 BaseURL 和 API Key 后，能成功拉取该 Provider 旗下的所有 Model 列表。
- [ ] 选择 Model 并点击保存后，目标 Agent 的 `opencode.json` 会被正确无损写入或更新。
- [ ] 若 Agent 未安装，UI 明确显示“未检测到”并提供标准安装指南。
