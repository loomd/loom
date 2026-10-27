---
status: planned
created: 2026-10-27
priority: high
tags:
- feishu
- bot
- acp
- gui
- tauri
- hermes
created_at: 2026-10-27T01:52:59.459502800Z
updated_at: 2026-10-27T01:52:59.459502800Z
---

# 077-feishu-bot-agent-bridge: 飞书机器人 Agent 对话桥接（Hermes 页面）

## Overview
在 Loom 桌面端侧边栏新增独立的「Hermes」页面，实现飞书机器人 Agent 对话桥接。用户在飞书中 @机器人 即可发起 AI 对话，Loom 通过本地 `mcode acp` 执行 Agent 任务并将流式结果回复到飞书。Hermes 页面提供飞书应用凭证配置、工作区选择、服务启停控制和实时状态监控，是飞书机器人服务在 Loom 中的管理入口。

## 技术方案

### 核心链路
```
[飞书用户 @机器人] --> [飞书开放平台] --WebSocket长连接--> [Loom Tauri 后端 (hermes.rs)]
                                                                    |
                                                            解析消息事件
                                                            提取用户文本
                                                                    |
                                                                    v
                                                          [mcode acp 子进程]
                                                            (ACP/JSON-RPC 2.0)
                                                                    |
                                                            session/update 流式增量
                                                                    |
                                                                    v
                                                          [飞书 API 回复消息]
```

### Hermes 页面（前端）

#### 侧边栏位置
- 新增 Page 类型 `"hermes"`，侧边栏按钮位于「+ 注册项目」与「远程连接」之间。
- 当前侧边栏按钮顺序变为：项目列表 → `+ 注册项目` → **Hermes** → `远程连接` → `配置引导` → `设置`。

#### 页面布局
- 页面为全屏独立页（与 workspace / settings / agents / remote 同级），不依赖特定项目选择。
- 顶部：飞书应用凭证配置区域（App ID / App Secret 输入框，可编辑保存，Secret 脱敏显示）。
- 中部：工作区选择下拉（从已注册项目列表选取，指定 `mcode acp` 的 `cwd`）。
- 核心区：一键【启动 Hermes 服务】/ 【停止服务】按钮。
- 状态指示：实时显示服务状态（已停止 / 连接中 / 已连接 / 错误），收到消息时闪烁提示。
- 消息日志：滚动展示最近的飞书消息收发记录（用户问题摘要 + Agent 回复摘要 + 时间戳）。

#### 前端文件
- `crates/gui/frontend/src/pages/HermesPage.tsx` — Hermes 页面组件。
- `crates/gui/frontend/src/components/Sidebar.tsx` — 新增 Hermes 按钮。
- `crates/gui/frontend/src/App.tsx` — 注册 `"hermes"` 页面路由。

### Tauri 后端

#### 飞书连接管理（`hermes.rs`）
- 新建 `crates/gui/src-tauri/src/hermes.rs` 模块，职责：管理飞书 WebSocket 长连接、拉起并守护 `mcode acp` 子进程、在飞书消息与 ACP 协议之间做双向翻译。
- 架构模式参考现有的 `relay_adapter.rs`（远程连接适配器），复用类似的子进程管理和 ACP 桥接模式。
- 飞书长连接通过 Rust HTTP/WebSocket 客户端实现（`reqwest` + `tungstenite`），或通过 sidecar Node.js 脚本使用官方 SDK。

#### Tauri 命令
- `start_hermes_service` — 启动飞书机器人服务（参数：App ID、App Secret、工作区路径）。
- `stop_hermes_service` — 停止飞书机器人服务。
- `get_hermes_status` — 获取当前服务状态和最近消息日志。

#### 飞书接入方式
- **使用 WebSocket 长连接模式**：飞书开放平台原生支持，无需公网 IP / 域名 / HTTPS 证书，客户端主动连接飞书网关，适合部署在内网或个人电脑。
- 飞书 SDK 选型：优先在 Rust 侧直接对接飞书开放平台 API（获取 `tenant_access_token`、建立长连接、收发消息）；若 Rust 直连复杂度过高，可用 sidecar Node.js 脚本（`@larksuiteoapi/node-sdk`）桥接。

### 与现有架构的关系
- **复用 ACP 协议**：与手机端远程控制（`relay_adapter.rs` + `acp.rs`）使用完全相同的 `mcode acp` 子进程和 ACP 协议流（`initialize` → `session/new` → `session/prompt` → `session/update`）。
- **独立于远程连接**：Hermes 和远程连接是两个并行的服务，可以同时运行，互不干扰。
- **配置隔离**：Hermes 的飞书凭证和工作区配置独立存储，不影响远程连接的 Relay 配置。

## Requirements

### 侧边栏与页面
- [ ] 新增 Page 类型 `"hermes"`，`Sidebar.tsx` 中在「+ 注册项目」按钮与「远程连接」按钮之间新增「Hermes」按钮。
- [ ] `App.tsx` 中注册 `"hermes"` 页面路由，渲染 `HermesPage` 组件。
- [ ] 页面布局：顶部凭证配置 → 中部工作区选择 → 核心启停按钮 → 状态指示 → 消息日志。

### 飞书连接与消息处理
- [ ] 飞书事件接收：支持 WebSocket 长连接模式，订阅 `im.message.receive_v1` 事件，解析 @机器人 的文本消息。
- [ ] 飞书消息回复：通过飞书 API（`POST /open-apis/im/v1/messages`）将 Agent 回复发送回对应的聊天（支持单聊直接回复和群聊 reply 回复）。
- [ ] 流式回复策略：Agent 输出较长时，先发送「正在思考...」占位消息，完成后通过 `PATCH /open-apis/im/v1/messages/:message_id` 更新为最终内容；超长内容分段发送。

### ACP 协议桥接
- [ ] ACP 子进程管理：拉起 `mcode acp` 子进程，完成 ACP 握手（`initialize` → `notifications/initialized` → `session/new`），管理会话生命周期。
- [ ] ACP 协议翻译：将飞书用户消息翻译为 `session/prompt`，将 `session/update` 的 `agent_message_chunk` 增量流聚合为完整回复文本。
- [ ] 多会话隔离：按飞书 `chat_id` + `user_id` 维度隔离 ACP 会话，不同用户/群的对话互不干扰。每个隔离维度独立维护一个 ACP session。
- [ ] 权限请求处理：ACP `session/request_permission` 事件转化为飞书交互卡片（card message），用户点击按钮完成审批，响应回传至 ACP。

### 配置与持久化
- [ ] Hermes 配置（App ID、App Secret、默认工作区路径、是否自启动）持久化到 `loom.json` 的 `hermes` 字段或独立的 `hermes-config.json`。
- [ ] App Secret 在前端脱敏显示（仅显示末四位），存储时加密或使用系统密钥链。

### 异常处理与自愈
- [ ] ACP 子进程崩溃自动重启（最多 3 次，之后提示用户手动重启）。
- [ ] 飞书长连接断线自动重连（指数退避，最大间隔 30 秒）。
- [ ] 错误状态实时反馈到 Hermes 页面（连接失败原因、子进程退出码等）。

## Non-Goals
- 不修改 `mcode acp` 本身，仅通过 stdin/stdout 与其交互。
- 不替代现有的手机端远程控制功能（远程连接页面），两者独立共存。
- 不实现飞书端的富文本编辑器或终端模拟器。
- 第一版不支持文件上传/下载（后续可扩展通过飞书文件 API 传递）。
- 不实现多租户（单实例绑定一个飞书应用）。

## Technical Notes
- 飞书长连接模式使用开放平台 SDK 内部协议，SDK 自动管理连接建立、心跳和重连，每个应用最多 50 个长连接。
- 飞书消息有长度限制，长回复需分段或使用富文本卡片消息（interactive card）承载。
- 飞书事件有 3 秒处理超时（长连接模式），超时会触发重试；需立即 ACK 后异步处理 Agent 请求。
- ACP 协议要点：`initialize` 的 `protocolVersion` 是数字 `1`（不是字符串）；`session/prompt` 同一时刻只允许一个在途。
- Hermes 名称含义：希腊神话中的信使之神，象征 Loom 与飞书之间的消息传递桥梁。
- 后端核心文件：`crates/gui/src-tauri/src/hermes.rs`（飞书连接 + ACP 桥接），参考 `relay_adapter.rs` 的架构模式。
- 前端核心文件：`crates/gui/frontend/src/pages/HermesPage.tsx`。
- 侧边栏按钮顺序：项目列表 → `+ 注册项目` → **Hermes** → `远程连接` → `配置引导` → `设置`。

## Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│ Loom Desktop (Tauri)                                            │
│                                                                 │
│  ┌──────────────────┐    Tauri IPC     ┌──────────────────────┐ │
│  │ HermesPage.tsx   │ ◄──────────────► │ hermes.rs            │ │
│  │ (React 前端)      │                  │ (Tauri 后端)          │ │
│  │ - 凭证配置        │                  │ - 飞书 WebSocket 长连接│ │
│  │ - 工作区选择      │                  │ - mcode acp 子进程管理 │ │
│  │ - 启停控制        │                  │ - ACP 协议翻译        │ │
│  │ - 状态/日志       │                  │ - 消息收发            │ │
│  └──────────────────┘                  └───────┬──────────────┘ │
│                                                │                │
└────────────────────────────────────────────────┼────────────────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                              ▼                  ▼                  ▼
                    ┌──────────────┐   ┌──────────────┐   ┌────────────────┐
                    │ 飞书开放平台   │   │ mcode acp    │   │ 飞书 REST API  │
                    │ WebSocket 网关 │   │ (stdin/stdout)│   │ 发送/更新消息   │
                    │ 事件推送       │   │ ACP/JSON-RPC │   │ im/v1/messages │
                    └──────────────┘   └──────────────┘   └────────────────┘
```

## Acceptance Criteria
- [ ] 侧边栏在「+ 注册项目」与「远程连接」之间显示「Hermes」按钮，点击进入 Hermes 管理页面。
- [ ] 在 Hermes 页面填入飞书 App ID / App Secret 并选择工作区后，点击启动，飞书机器人能成功上线。
- [ ] 用户在飞书单聊中向机器人发送消息，Loom 通过 `mcode acp` 产出 Agent 回复，回复显示在飞书聊天中。
- [ ] 用户在飞书群聊中 @机器人 发消息，机器人能识别并以回复消息的形式响应。
- [ ] Agent 输出较长时，用户先看到「正在思考...」占位消息，完成后更新为最终内容。
- [ ] 不同用户/群的对话互相隔离，不会串会话。
- [ ] ACP 子进程异常退出后能自动重启并恢复服务，Hermes 页面实时显示错误状态。
- [ ] 飞书长连接断线后能自动重连，页面状态指示同步更新。
- [ ] 点击停止服务时，子进程和飞书连接干净退出。