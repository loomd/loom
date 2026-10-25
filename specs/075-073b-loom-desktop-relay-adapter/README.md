---
status: completed
created: 2026-10-25
priority: high
tags:
- loom
- tauri
- acp
- adapter
depends_on:
- 074-073a-relay-server-pairing-protocol
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:28:50.868431400Z
updated_at: 2026-10-25T06:30:00.000000000Z
---

# 075-073b-loom-desktop-relay-adapter: Loom 电脑端自建中继适配器与 mcode acp 协议适配 (Desktop Adapter)

## Overview
在 Loom Rust 后端与前端中，实现连接自建 Relay Server 的适配器。完全替换现有的 MiniMax 官方云端配对链路（删除 `app_server.rs` 中对 `agent.minimax.cn` 的 API 调用），改为连接自建 Relay Server。负责本地拉起并守护当前工作区的 `mcode acp` 实例（stdin/stdout 上的 ACP / JSON-RPC 2.0 服务），在手机端简单信封与 ACP 标准协议之间做双向翻译。

> 协议更正（2026-10-25）：`mcode app-server --stdio` **不是** Agent 协议服务，它只暴露 `account/*`、`server/prepareRestart`、`desktopService/transport` 等底层运行时方法，**不实现** `session/new` / `session/prompt`。真正的 Agent 协议服务是 `mcode acp`（`mcode acp --help`：Run MiniMax Code as an Agent Client Protocol server over stdio）。桌面端必须拉起 `mcode acp`。

在侧边栏新增独立的「远程连接」页面（位于「+ 注册项目」按钮与「配置引导」之间），提供账号登录、中继服务器配置、一键启停、状态与配对码展示。一台电脑只支持一个远程手机连接。

## Requirements

### 侧边栏「远程连接」页面
- [x] 新增 Page 类型 "remote"，侧边栏按钮位于「+ 注册项目」与「配置引导」之间。
- [x] 页面内容为全屏独立页（与 workspace / settings / agents 同级），不依赖特定项目选择。
- [x] 页面布局:
  - [x] 顶部: 自建 Relay 服务器地址配置（可编辑保存）。
  - [x] 中部: 账号登录区域（用户名/密码，登录/注册按钮，登录状态显示）。
  - [x] 核心区: 工作区选择下拉（从已注册项目列表选取）+ 一键【开启远程会话】按钮。
  - [x] 配对码展示: 醒目展示当前 4 位配对码与倒计时。
  - [x] 状态指示: 实时指示连接状态（已停止 / 配对中 / 手机端已连接）。
  - [x] 一键【断开连接并停止服务】操作。

### Relay 配置与账号管理
- [x] Relay 服务器地址持久化到 loom.json 或独立的 remote-config.json。
- [x] 账号登录: 调用自建 Relay 的 POST /api/auth/login，获取 JWT 并持久化。
- [x] 账号注册: 调用自建 Relay 的 POST /api/auth/register。
- [x] Token 自动刷新: JWT 即将过期时自动调用 refresh 接口续期。

### 核心 IPC 与进程桥接
- [x] 启动工作区 `mcode acp` 常驻子进程，绑定至选定的工作区目录。
- [x] 异步建立与自建 Relay Server 的 WebSocket Producer 连接（wss://<relay>/ws/desktop?token=<jwt>）。
- [x] 实现 ACP 协议适配层（`crates/gui/src-tauri/src/acp.rs`，纯函数状态机，可单测）:
  - [x] 握手: `initialize`（`protocolVersion` 必须是数字 `1`）→ `notifications/initialized` → `session/new`（`cwd` = 工作区目录）。
  - [x] 入站翻译: ACP `session/update`（`agent_message_chunk` / `agent_thought_chunk` / `tool_call` / `tool_call_update`）→ 手机端 `chat` / `thinking` / `tool_call` 帧。
  - [x] 出站翻译: 手机端 `chat` 信封 → ACP `session/prompt`（同一时刻只允许一个在途，其余排队）。
  - [x] 权限审批: ACP `session/request_permission` → 手机端 `permission_request` 帧；手机端应答 → ACP `{"outcome":{"outcome":"selected","optionId":...}}` 或 `{"outcome":{"outcome":"cancelled"}}`。
  - [x] 中继层控制帧与心跳帧（`control` / `ping` / `pong`）一律不下发给 Agent，避免污染 ACP 协议流。
- [x] Relay Server 保持无状态字节管道（仅拦截 `type == "control"` 的帧），不解析业务协议。
- [x] 子进程 stderr 持续回收并记入日志（不回收会填满管道缓冲并阻塞子进程）。

### 异常处理与自愈
- [x] 网络闪断后自动重连 WebSocket（指数退避，最大间隔 30 秒）。
- [x] 工作区切换或应用退出时，安全终止后台 `mcode acp` 子进程。
- [x] `mcode acp` 进程崩溃后自动重启（最多 3 次，之后提示用户）。

### 删除旧代码
- [x] 删除 `app_server.rs` 中所有 `agent.minimax.cn` 官方云端 API 调用。
- [x] 删除 `request_official_pairing_code()` 和 `check_cloud_binding_status()` 函数。
- [x] 更新 RemoteSessionCard 组件或替换为新的远程连接页面组件。

## Non-Goals
- 不修改 mcode CLI 二进制本身，纯粹通过外部子进程标准输入输出（stdio）进行安全包装。
- 不保留 MiniMax 官方云端中继的任何代码路径。

## Technical Notes
- 在 Rust 后端使用 `tungstenite` 处理 WebSocket 长连接。
- stdin/stdout 桥接在独立线程中运行，避免前端页面刷新打断网络链路。
- JSON-RPC 消息按行分隔（每条消息以 `\n` 结尾），无需 Content-Length header 解析。
- ACP 协议要点（已对真实 `mcode acp` 实测确认）:
  - `initialize` 的 `params.protocolVersion` 是**数字**（`1`），传字符串会被拒（-32602）。
  - 握手顺序：`initialize` → 收到响应 → `notifications/initialized` → `session/new`。
  - `session/new` 结果里的 `sessionId`（形如 `mvs_xxx`）是后续 `session/prompt` 的必需参数。
  - `session/prompt` 参数：`{sessionId, prompt:[{type:"text", text:"..."}]}`；结果 `{stopReason:"end_turn"}`。
  - 正文以 `session/update` 增量推送：`agent_message_chunk` 的 `content.text`。
  - `mcode app-server --stdio` 是运行时服务，不是 Agent 协议服务，两者不可混用。

## Acceptance Criteria
- [x] 侧边栏显示「远程连接」按钮，点击进入独立远程连接管理页面。
- [x] 可在页面内配置自建 Relay 地址并登录/注册账号。
- [x] 选择工作区并点击启动按钮，能自动连接自建 Relay 并显示配对码。
- [x] 手机连上后，页面即时变成已连接状态。
- [x] 手机发送测试请求时，本地 `mcode acp` 正确建立会话、执行 prompt 并产出输出流（`acp::tests::test_live_agent_roundtrip` 对真实进程端到端验证）。
- [x] 点击断开时，子进程和网络连接干净退出。
- [x] 现有 `agent.minimax.cn` 官方 API 调用代码已全部移除。
