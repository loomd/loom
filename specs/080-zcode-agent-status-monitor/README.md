---
status: complete
created: 2026-11-17
priority: high
tags:
- gui
- agent
- backend
- frontend
- zcode
depends_on:
- 079-zcode-config-onboarding
created_at: 2026-11-17T11:24:46.050920600Z
updated_at: 2026-11-17T11:36:31.962507700Z
completed_at: 2026-11-17T11:36:31.962507700Z
transitions:
- status: complete
  at: 2026-11-17T11:36:31.962507700Z
---

# 080: ZCode CLI 灯态与会话监控适配

## 概述

Loom 侧边栏终端的呼吸灯态、项目复合灯态与历史会话恢复已支持 opencode / mcode / agy。本 spec 基于 ZCode CLI 的本地会话库 `~/.zcode/cli/db/db.sqlite`，建立无侵入只读状态同步管道，实现终端 Tab 状态灯与基于 `sess_*` 会话 ID 的历史会话精准恢复。

## 需求规范

### 1. 会话与状态提取
- [x] 数据库路径：`~/.zcode/cli/db/db.sqlite`，支持 `ZCODE_SESSION_DB_PATH` 与 `ZCODE_DATA_BASE_DIR` 覆盖。
- [x] 会话表 `session` 关键字段：`id`（形如 `sess_<uuid>`）、`directory`（工作区绝对路径）、`title`、`time_updated`、`time_deleted`、`last_outcome`。
- [x] 工作区匹配：`directory` 前缀匹配，兼容正反斜杠与大小写差异。
- [x] 运行态判定：`turn_usage.status = 'running'` 或 `tool_usage.status = 'running'` 表示 Agent 正在工作；`session_runtime_presence` 表示会话仍被运行时进程持有。
- [x] 状态映射：
  - 存在 running 回合或 running 工具调用 → `AgentState::Running`（翠绿呼吸灯）
  - `session_input` 存在 `status = 'admitted'` 且 `delivery = 'guide'` 的待引导输入 → `AgentState::Question`（琥珀色）
  - 最近一次 `turn_usage.status = 'error'` → `AgentState::Error`（红静灯）
  - 其余 → `AgentState::Waiting`（天蓝静灯）
- [x] 会话标题取 `session.title`，为空时回退 `input_history` 中该会话首条输入的前 30 字符。

### 2. 并发仲裁
- [x] zcode 与 mcode / agy 同属隔离型会话：多终端并存时不得抢占其他 PTY 正在工作的会话。
- [x] 限定 `agent_type == "zcode"` 时只匹配 zcode 候选会话；缓存会话与 agent 类型不匹配时主动解绑。

### 3. 前端与恢复
- [x] `isAgentTerminal` 识别 `zcode`；`getTerminalAgentType` 支持 `sess_` 前缀会话 ID 与启动命令返回 `'zcode'`。
- [x] 历史会话恢复命令：`zcode --resume <sessionId>`，需剔除与恢复冲突的旧参数。
- [x] 运行 zcode 模板时自动标记终端 `isOpencode: true` 开启状态监听。

## 非目标
- 不写入 zcode 的任何数据库，不改动 ZCode 的配置与凭据。
- 不实现 zcode TUI 的自绘界面。

## 验收标准
- [x] `cargo check --all-targets`、`cargo clippy --all-targets`、`cargo test --workspace` 全绿。
- [x] 前端 `npm run lint`、`npm test` 全绿（293 项）。
- [x] zcode 终端在 Tab 上正确显示状态灯，且可从历史会话恢复。

## 实现记录

### 改动文件
- `crates/gui/src-tauri/src/agent_monitor.rs`：`ZCODE_CACHED_CONN`、`get_zcode_db_path()`、`is_zcode_session_id()`、`find_candidate_zcode_sessions()`、`find_latest_zcode_session()`、`poll_zcode_session()`、`SessionSource::Zcode`，以及连接缓存由三源扩为四源。
- `crates/gui/frontend/src/utils.ts`：新增 `buildZcodeResumeArgs()`。
- `crates/gui/frontend/src/pages/ProjectWorkspace.tsx`：终端识别、agent 类型判定、历史会话恢复分支。
- `crates/gui/frontend/src/hooks/useWorkspaceData.ts`：运行 zcode 模板时开启状态监听标记。
- `crates/gui/frontend/src/test/utils.test.ts`：`buildZcodeResumeArgs` 测试。

### 关键决策
- **不用进程存活判定「运行中」**：zcode 的 TUI 空闲时进程仍然存活，若以进程存活作为「运行中」会导致灯常亮。工作态取自 `turn_usage` / `tool_usage` 的 `running` 状态，与 mcode / agy 的语义一致。
- **会话 ID 前缀不冲突**：zcode 为 `sess_<uuid>`，opencode 为 `ses_` / `session_`，mcode 为 `mvs_`，agy 为裸 UUID，四者可无歧义区分。
- **候选会话过滤**：排除子会话（`parent_id` 非空）与已删除会话（`time_deleted` 非空），避免抢占历史会话。
- **隔离型仲裁**：zcode 与 mcode / agy 一样按隔离型处理，工作中的会话不会被其它 PTY 抢占。

### 验证
- 单元测试：`test_zcode_session_state_mapping`（六种状态迁移）、`test_zcode_candidate_sessions_matching_workspace`（大小写/斜杠匹配、子会话与已删除会话排除）、`test_zcode_session_id_prefix`（前缀不冲突）。
- 前端测试：`buildZcodeResumeArgs` 三项用例。

