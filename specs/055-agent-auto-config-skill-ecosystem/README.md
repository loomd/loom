---
status: planned
created: '2026-08-13'
tags:
  - agent
  - skill
  - opencode
  - autoconfig
  - template
priority: high
created_at: '2026-08-13T13:57:59.080799400+00:00'
---

# Agent 自动配置与版本化 Skill 闭环生态

> **Status**: planned · **Priority**: high · **Created**: 2026-08-13

## Overview

本项目旨在为 Loom 提供完整的 Agent 自动化接入与自理操控生态。
包含三大关键能力：
1. **启动自动注入版本化 Loom Skill**：应用启动时自动检测并升级全局及本地 Agent（Claude Code, OpenCode 等）的 Loom Skill，让被派生的 Agent 能够通过 Loom CLI（查看项目、添加/启动模板、配置变量）反向自治 Loom。
2. **Agent 独立配置与一键发现面板**：提供包含 OpenCode / Claude Code 等 Agent 的下载/扫描引导，支持用户输入 Custom Provider BaseURL 和 API Key，自动请求网络接口拉取可用模型列表，选择模型后一键打包生成并写入标准 JSON 配置文件。
3. **注册项目面板快捷卡片与自动模板绑定**：在 UI 项目面板顶部提供 Agent 配置入口卡片，配置完成后自动向 Loom Core 注册 Agent 运行模板并与当前项目建立绑定，实现从发现、配置到点击直运行的闭环。

## Child Specs

- `056-055a-versioned-skill-auto-injector`: 应用启动时版本化 Skill 自动注入引擎
- `057-055b-opencode-discovery-model-fetcher`: Agent 下载发现、模型动态拉取与 JSON 配置自动生成
- `058-055c-agent-project-card-and-template-binder`: 项目面板 Agent 快捷卡片与自动模板绑定及操作闭环

## Acceptance Criteria

- [ ] 应用启动时成功检查并写入/升级 Loom 专属 Skill (`~/.claude/skills/loom/SKILL.md` 及 OpenCode Skill 目录)，带版本号（Version-stamped）。
- [ ] 在 GUI 中提供完整的 Agent 下载检查、状态识别以及 Provider (BaseURL / Key) 校验页面。
- [ ] 输入 BaseURL 与 API Key 后可动态拉取 `/v1/models`模型列表并供用户选择，一键写回对应的 `opencode.json` 等配置文件。
- [ ] 在项目列表头部展示 Agent 注册引导卡片，一键跳转配置并自动将产出的 CLI 运行指令绑定为项目 Template。
- [ ] 被启动的 Agent 可识别内嵌 Skill，直接调动 `loom` CLI 命令自我管理和管理项目。

## Non-Goals

- 本阶段暂不提供遥远未知第三方 CLI Agent 的自动安装脚本下载器，对未安装 CLI 仅提供命令/链接引导。
