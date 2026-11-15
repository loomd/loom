---
status: in-progress
created: 2026-11-15
priority: high
tags:
- gui
- agent
- backend
- frontend
- agy
---

# 078: Antigravity CLI (agy) 灯态与会话监控体系适配

## 概述
Loom 现已在侧边栏终端全面支持 OpenCode 与 MiniMax Code (mcode) 的呼吸灯态及历史会话恢复，但此前未适配 Antigravity CLI (`agy`)。本 spec 旨在基于 `~/.gemini/antigravity-cli/conversation_summaries.db`，建立与 agy 的无侵入式只读实时状态同步管道，实现工作区 Tab 栏状态灯、项目全局复合灯态、多终端并发防抢占仲裁、系统通知及基于 Conversation ID 的历史会话精准恢复。

## 需求规范

### 1. agy 会话与状态提取规则
- **数据库路径**：`~/.gemini/antigravity-cli/conversation_summaries.db`
- **工作区匹配**：`workspace_uris LIKE '%<project_root_path>%'`（兼容 URL 编码及反斜杠/正斜杠差异）
- **状态字段映射**：
  - `status == "CASCADE_RUN_STATUS_RUNNING"` 或 `not_fully_idle == 1`：映射为 `AgentState::Running`（翠绿呼吸灯）
  - `status == "CASCADE_RUN_STATUS_IDLE"`：
    - 更新时间在 15 秒内：映射为 `AgentState::Waiting`（天蓝静灯）
    - 超过 15 秒无更新：映射为 `AgentState::Idle`（紫色静灯）
  - `killed == 1`：映射为 `AgentState::Error`（红静灯）
- **会话标题查询**：
  - 优先读取 `title`，若为空则取 `preview` 的前 30 个字符作为会话名称。

### 2. 多终端并发仲裁机制
- 终端生成时通过 `register_pty` 记录时间戳。
- 用户输入时通过 `mark_pty_active` 记录交互时间。
- 单独限定 `agent_type == "agy"` 时，只匹配 agy 候选会话，避免与 mcode 或 opencode 终端相互抢占。

### 3. 前端与恢复机制
- `isAgentTerminal` 扩展识别 `agy` / `antigravity` 命令与标题。
- `getTerminalAgentType` 支持根据 `sessionId`（标准 36 位 UUID）或启动命令返回 `'agy'`。
- 支持右键点击历史会话或会话恢复命令：`agy --conversation <conversation_id>`。
- 启动 agy 运行模板时，自动标记终端 `isOpencode: true` 开启状态监听。
