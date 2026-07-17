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
  Idle = 'idle',           // 15s 无活动 / 初始空闲（紫色静灯）
  Running = 'running',     // 模型推理 / 工具执行 / 流式输出（翠绿呼吸）
  Waiting = 'waiting',     // 工具完成 / step-stop 停顿（天蓝静灯）
  Error = 'error',         // 工具执行出错（红静灯）
  AgentCall = 'agent_call', // 子 agent 运行中（粉红呼吸）
  Question = 'question',   // 等待用户回答问题（琥珀呼吸）
}
```

注：Spec 早期设计的 `Thinking`、`Done`、`Offline` 状态在实际实现中已合并/裁撤：
- `Thinking` → `Running`（推理也是运行的一部分，无需单独状态）
- `Done` → `Waiting`（工具完成后的停顿态，等待下一轮用户输入）
- `Offline` 移除（Agent 进程退出后前端直接停止轮询，不显示指示灯）

### 2. OpenCode SQLite 适配器

- DB 路径: `~/.local/share/opencode/opencode.db`
- 定位活跃 session: `SELECT id FROM session WHERE directory=? ORDER BY time_created DESC LIMIT 1`（按工作目录匹配 Loom 项目）
- 查询最新 part: `SELECT data FROM part WHERE session_id=? ORDER BY time_created DESC LIMIT 1`
- 状态映射 (只看 part 表的 `type` + `state.status`)：

| part.type | 附加条件 | 映射状态 |
|-----------|---------|----------|
| `reasoning` | - | Running |
| `tool` | state.status=running, tool!=question | Running |
| `tool` | state.status=running, tool=question | Question |
| `tool` | state.status=error | Error |
| `tool` | state.status=completed | Waiting |
| `tool` | tool=task, state.status=running | AgentCall |
| `agent` | - | AgentCall |
| `step-finish` | reason=stop 无后续 part | Waiting |
| `step-finish` | 其他情况 | Running |
| `step-start` | - | Running |
| `text` | 正在流式输出 | Running |
| 最新 part 是 `step-finish` + `reason=stop` | - | Waiting |
| 15s 无 part 更新 | 活跃态超时 | Idle |

完全的状态流转逻辑见 `agent_monitor.rs:195` `parse_state()` + `poll_parts()`。
- 纯只读，不修改数据库

### 3. Tauri 后端实现

- [x] `crates/gui/src-tauri/src/agent_monitor.rs` — SQLite 查询模块
- [x] `poll_agent_state` Tauri 命令：前端每 2s 轮询调用
- [x] 缓存 `last_session_ts`，15s 无更新 → Idle
- [x] Agent 进程退出 → 前端不轮询，默认显示休眠

### 4. 前端状态展示

- [x] ProjectsPage agent card 显示状态指示灯
- [x] `agent-status-dot` CSS 类 + 状态名称作为 class 名（如 `.agent-status-dot.running`），呼吸态用 `@keyframes pulse-dot` 动画
- [x] `agent-status-text` 类：显示状态文字
- [x] `useEffect` + `setInterval` 每 2s 调用 `pollAgentState` 轮询状态

各状态的 CSS 呈现：

| 状态 | 背景色 | box-shadow | 动画 |
|------|--------|-----------|------|
| idle | `#a855f7`（紫色） | 无 | 无 |
| running | `var(--accent-emerald)` | 0 0 6px 翠绿 | pulse-dot 1s infinite |
| waiting | `var(--accent-sky)`（天蓝） | 无 | 无 |
| error | `var(--accent-red)`（红） | 无 | 无 |
| agent_call | `var(--accent-pink)` | 0 0 6px 粉红 | pulse-dot 1s infinite |
| question | `var(--accent-amber)` | 0 0 8px 琥珀 | pulse-dot 0.8s infinite |

## 非目标

- 不修改 OpenCode 数据库（只读查询）
- 不通过 PTY 输出解析获取状态
- 不支持远程 Agent
- 不展示 Agent 内部详细进度（具体工具参数、token 用量）

## 验收标准

- [x] OpenCode 推理时显示翠绿呼吸灯（Running）
- [x] OpenCode 执行工具时显示翠绿呼吸灯（Running）
- [x] OpenCode 完成回复后显示天蓝静灯（Waiting）
- [x] OpenCode 执行工具出错时显示红色静灯（Error）
- [x] 子 agent 运行时显示粉红呼吸灯（AgentCall）
- [x] 空闲超 15s 显示紫色静灯（Idle）
- [x] Agent 提问等待回答时显示琥珀呼吸灯（Question）
- [x] Agent 退出后前端停止轮询，不显示指示灯
- [x] 轮询不造成 UI 卡顿或高 CPU 占用