---
status: completed
created: 2026-10-25
priority: high
tags:
- loom
- tauri
- app-server
- adapter
depends_on:
- 074-073a-relay-server-pairing-protocol
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:28:50.868431400Z
updated_at: 2026-10-25T06:30:00.000000000Z
---

# 075-073b-loom-desktop-relay-adapter: Loom 电脑端自建中继适配器与 mcode app-server 管道绑定 (Desktop Adapter)

## Overview
在 Loom Rust 后端与前端中，实现连接自建 Relay Server 的适配器。完全替换现有的 MiniMax 官方云端配对链路（删除 `app_server.rs` 中对 `agent.minimax.cn` 的 API 调用），改为连接自建 Relay Server。负责本地拉起并守护当前工作区的 mcode app-server --stdio 实例，将接收自 WebSocket 的客户端指令写入子进程 stdin，将子进程 stdout 的 JSON-RPC 消息流回推给 Relay Server。

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
  - [x] 状态指示: 实时指示连接状态（未连接 / 等待手机配对 / 手机已连接）。
  - [x] 一键【断开连接并停止服务】操作。

### Relay 配置与账号管理
- [x] Relay 服务器地址持久化到 loom.json 或独立的 remote-config.json。
- [x] 账号登录: 调用自建 Relay 的 POST /api/auth/login，获取 JWT 并持久化。
- [x] 账号注册: 调用自建 Relay 的 POST /api/auth/register。
- [x] Token 自动刷新: JWT 即将过期时自动调用 refresh 接口续期。

### 核心 IPC 与进程桥接
- [x] 启动工作区 mcode app-server --stdio 常驻子进程，绑定至选定的工作区目录。
- [x] 异步建立与自建 Relay Server 的 WebSocket Producer 连接（wss://<relay>/ws/desktop?token=<jwt>）。
- [x] 实现 stdin/stdout 双向流式管道绑定:
  - [x] 将 WebSocket 接收到的手机端请求实时写入 app-server 的 stdin。
  - [x] 监听 app-server 的 stdout，按行（\n 分隔的 JSON-RPC 消息）读取并通过 WebSocket 发送给 Relay。
  - [x] app-server 的 stderr 输出记录到日志，不转发给手机端。

### 异常处理与自愈
- [x] 网络闪断后自动重连 WebSocket（指数退避，最大间隔 30 秒）。
- [x] 工作区切换或应用退出时，安全终止后台 mcode app-server 子进程。
- [x] app-server 进程崩溃后自动重启（最多 3 次，之后提示用户）。

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

## Acceptance Criteria
- [x] 侧边栏显示「远程连接」按钮，点击进入独立远程连接管理页面。
- [x] 可在页面内配置自建 Relay 地址并登录/注册账号。
- [x] 选择工作区并点击启动按钮，能自动连接自建 Relay 并显示配对码。
- [x] 手机连上后，页面即时变成已连接状态。
- [x] 手机发送测试请求时，本地 mcode app-server 正确接收并产出输出流。
- [x] 点击断开时，子进程和网络连接干净退出。
- [x] 现有 `agent.minimax.cn` 官方 API 调用代码已全部移除。
