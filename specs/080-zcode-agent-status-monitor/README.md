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
- [x] **「运行中」的判定来自运行时日志**，而不是数据库：zcode 的 `turn_usage` / `model_usage` / `tool_usage` 都是回合结束后才落库，回合进行中数据库里没有任何 `running` 记录（实测确认）。真正实时的是 `~/.zcode/cli/log/zcode-<日期>.jsonl` 里成对出现的 `turn.started` 与 `turn.completed` / `turn.failed` 事件（带 `sessionId` / `turnId`）。有 started 无终态即判定为运行中；超过 15 分钟未落终态视为陈旧（进程被强杀）。
- [x] 状态映射（优先级：等待用户回答 > 运行中 > 异常 > 待命）：
  - 运行时日志中存在未结束的回合 → `AgentState::Running`（翠绿呼吸灯）
  - `part` 表中存在 `tool = "AskUserQuestion"` 且 `state.status = "running"` 的工具调用 → `AgentState::Question`（琥珀色）
  - `session_input` 存在 `status = 'admitted'` 且 `delivery = 'guide'` 的待引导输入 → `AgentState::Question`
  - 最近一次 `turn_usage.status = 'error'` → `AgentState::Error`（红静灯）
  - 其余 → `AgentState::Waiting`（天蓝静灯）
- [x] **等待回答必须优先于运行中**：zcode 的交互式问卷由 `AskUserQuestion` 工具实现，等待用户回答期间回合在运行时日志里仍未结束（回合阻塞在工具调用上），若把「运行中」排在前面，问卷等待只会显示绿灯，永远等不到黄灯。
- [x] 会话标题取 `session.title`，为空时回退 `input_history` 中该会话首条输入的前 30 字符。
- [x] 日志不可用时退化为「`session.time_updated` 在 10 秒内更新」。

### 2. 并发仲裁
- [x] zcode 与 mcode / agy 同属隔离型会话：多终端并存时不得抢占其他 PTY 正在工作的会话。
- [x] 限定 `agent_type == "zcode"` 时只匹配 zcode 候选会话；缓存会话与 agent 类型不匹配时主动解绑。

### 3. 前端与恢复
- [x] `isAgentTerminal` 识别 `zcode`；`getTerminalAgentType` 支持 `sess_` 前缀会话 ID 与启动命令返回 `'zcode'`。
- [x] 历史会话列表的来源标签区分 `agy` / `zcode` / `mcode` / `opencode`，zcode 不再落入 opencode 兜底分支。
- [x] 历史会话恢复命令：`zcode --resume <sessionId>`，需剔除与恢复冲突的旧参数。
- [x] 运行 zcode 模板时自动标记终端 `isOpencode: true` 开启状态监听。

### 4. PTY 关闭顺序（顺带修复的崩溃）
- [x] `pty_close` 改为「先终止进程 → 等读线程退出 → 再关闭 ConPTY」。旧实现先关 ConPTY 再杀进程，会让仍在运行的 shell 立刻失去伪终端句柄，PowerShell 恢复输入循环时 `GetConsoleScreenBufferInfo` 抛 `Win32Exception(233)` 并 FailFast，终端里表现为 `ResourceUnavailable: Process terminated.` 加一串 .NET 调用栈。
- [x] `PtySession` 增加 `reader_done` 标志，关闭 ConPTY 句柄前等待读线程结束，避免与阻塞在 `ReadFile` 的读线程并发使用同一句柄。

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
- **不用进程存活判定「运行中」**：zcode 的 TUI 空闲时进程仍然存活，若以进程存活作为「运行中」会导致灯常亮。
- **不用数据库的 running 状态**：zcode 的 turn_usage / model_usage / tool_usage 均为回合结束后落库，回合进行中数据库无 running 记录；改用运行时日志的 turn.started / turn.completed 配对。
- **日志读取要点**：运行时写日志时持有文件，读取需用允许共享读写的打开方式（Rust `File::open` 默认 FILE_SHARE_READ|WRITE|DELETE，兼容）；只解析尾部 2MB，并对每行先做字符串预筛，避免每 2 秒全量解析。
- **会话 ID 前缀不冲突**：zcode 为 `sess_<uuid>`，opencode 为 `ses_` / `session_`，mcode 为 `mvs_`，agy 为裸 UUID，四者可无歧义区分。
- **问卷判定查 `part` 表**：`session_input` 只记录排队输入（实测为 `queue` / `discarded`），真正的交互式问卷是 `part` 表里 `tool = "AskUserQuestion"` 的工具调用，用户回答前保持 `state.status = "running"`。查询优先用 `json_extract`，SQLite 未启用 JSON 函数时退化为字符串匹配。
- **候选会话过滤**：排除子会话（`parent_id` 非空）与已删除会话（`time_deleted` 非空），避免抢占历史会话。
- **隔离型仲裁**：zcode 与 mcode / agy 一样按隔离型处理，工作中的会话不会被其它 PTY 抢占。

### 验证
- 单元测试：`test_zcode_session_state_mapping`（日志驱动的六种状态迁移）、`test_zcode_candidate_sessions_matching_workspace`（大小写/斜杠匹配、子会话与已删除会话排除）、`test_zcode_session_id_prefix`（前缀不冲突）、`test_zcode_busy_turns_from_runtime_log`（日志配对）、`test_parse_iso8601_utc_ms`（时间戳解析）。
- 真机观测：启动一次真实 zcode 回合并以 300ms 间隔采样运行时日志，35 次采样中有 25 次捕捉到「有 started 无 completed」的忙碌态（约覆盖整个回合时长），回合结束后立即归零。


