---
status: complete
created: 2026-07-16
priority: high
tags:
- gui
- agent
- backend
- frontend
---

# AI Agent 状态监控

## 概述

当前 Loom 在侧边栏启动 AI Agent（如 OpenCode）后，无法获知实时运行状态，用户只能通过终端输出推测。本 spec 通过只读查询 OpenCode 的 SQLite 数据库（`~/.local/share/opencode/opencode.db`），实时映射 Agent 状态并在 UI 展示指示灯。

## 需求

### 1. 状态枚举定义

```typescript
enum AgentState {
  Idle = 'idle',           // 15s 无活动 / 初始空闲
  Thinking = 'thinking',   // 模型推理中
  Running = 'running',     // 工具调用 / 执行中
  Done = 'done',           // 正常完成
  Error = 'error',         // 工具执行出错
  AgentCall = 'agent_call', // 子 agent 运行中
  Offline = 'offline',     // Agent 进程已退出
}
```

指示灯映射：Idle=灰静, Thinking=蓝呼吸, Running=绿呼吸, Done=绿静, Error=红静, AgentCall=黄呼吸, Offline=无

### 2. OpenCode SQLite 适配器

- DB 路径: `~/.local/share/opencode/opencode.db`
- 定位活跃 session: `SELECT id FROM session WHERE directory=? ORDER BY time_created DESC LIMIT 1`（按工作目录匹配 Loom 项目）
- 查询最新 part: `SELECT data FROM part WHERE session_id=? ORDER BY time_created DESC LIMIT 1`
- 状态映射 (只看 part 表的 `type` + `state.status`)：

| part.type | 附加条件 | 映射状态 |
|-----------|---------|----------|
| `reasoning` | - | Thinking |
| `tool` | state.status=running | Running |
| `tool` | state.status=error | Error |
| `agent` | - | AgentCall |
| `step-finish` / `text`(有 time.end) | - | Done |
| `text`(无 time.end) | 正在流式输出 | Running |
| 15s 无 part 更新 | 活跃态超时 | Idle |
- 纯只读，不修改数据库

### 3. Tauri 后端实现

- [x] `crates/gui/src-tauri/src/agent_monitor.rs` — SQLite 查询模块
- [x] `poll_agent_state` Tauri 命令：前端每 2s 轮询调用
- [x] 缓存 `last_session_ts`，15s 无更新 → Idle
- [x] Agent 进程退出 → 前端不轮询，默认显示休眠

### 4. 前端状态展示

- [x] ProjectsPage agent card 显示状态指示灯
- [x] `agent-status-dot` CSS 类：呼吸态用 @keyframes pulse-dot 动画
- [x] `agent-status-text` 类：显示状态文字
- [x] `useEffect` + `setInterval` 每 2s 调用 `pollAgentState` 轮询状态

## 非目标

- 不修改 OpenCode 数据库（只读查询）
- 不通过 PTY 输出解析获取状态
- 不支持远程 Agent
- 不展示 Agent 内部详细进度（具体工具参数、token 用量）

## 验收标准

- [x] OpenCode 推理时显示蓝色呼吸灯（Thinking）
- [x] OpenCode 执行工具时显示绿色呼吸灯（Running）
- [x] OpenCode 完成回复时显示绿色静灯（Done）
- [x] OpenCode 执行工具出错时显示红色灯（Error）
- [x] 子 agent 运行时显示黄色呼吸灯（AgentCall）
- [x] 空闲超 15s 显示灰色静灯（Idle）
- [x] Agent 退出后指示灯消失（Offline）
- [x] 轮询不造成 UI 卡顿或高 CPU 占用