---
status: planned
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
updated_at: 2026-10-25T05:28:50.868431400Z
---

# 075-073b-loom-desktop-relay-adapter: Loom 电脑端中继适配器与 mcode app-server 管道绑定 (Desktop Adapter)

## Overview
在 Loom Rust 核心层与前端概览页中，实现连接自建 Relay Server 的适配器。负责本地拉起并守护当前工作区的 mcode app-server --stdio 实例，将接收自 WebSocket 的客户端指令写入子进程 stdin，将子进程 stdout 的 JSON-RPC 消息流回推给 Relay Server，并在工作区概览页（Overview）中提供中继服务器配置、一键启停、状态与配对码展示。

## Requirements
- [ ] Relay 配置支持:
  - [ ] 在设置或概览页支持配置自建中继服务器地址（默认支持局域网或用户自有域名）。
- [ ] 核心 IPC 与进程桥接:
  - [ ] 启动工作区 mcode app-server --stdio 常驻子进程，绑定至当前工作区目录。
  - [ ] 异步建立与 Relay Server 的 WebSocket Producer 连接（wss://<relay>/ws/desktop?code=<code>）。
  - [ ] 实现 stdin/stdout 双向流式管道绑定:
    - [ ] 将 WebSocket 接收到的手机端请求实时写入 app-server 的 stdin。
    - [ ] 监听 app-server 的 stdout，按行读取 JSON-RPC 响应并通过 WebSocket 发送给 Relay。
- [ ] 概览页控制面板（RemoteSessionCard）:
  - [ ] 一键【开启自建远程会话】按钮。
  - [ ] 醒目展示当前 4 位配对码与倒计时。
  - [ ] 实时指示连接状态（未连接 / 等待手机配对 / 手机已连接）。
  - [ ] 一键【断开连接并停止服务】操作。
- [ ] 异常处理与自愈:
  - [ ] 网络闪断自动重连机制。
  - [ ] 工作区切换或应用退出时，安全终止后台 mcode app-server 子进程。

## Non-Goals
- 不修改 mcode CLI 二进制本身，纯粹通过外部子进程标准输入输出（stdio）进行安全包装。

## Technical Notes
- 在 Rust 后端利用标准线程/WebSocket 处理长连接中继，避免前端页面刷新打断网络链路。

## Acceptance Criteria
- [ ] 点击概览页启动按钮，能自动连接自建 Relay 并显示配对码。
- [ ] 手机连上后，Loom 概览页即时变成绿色已连接。
- [ ] 手机发送测试请求时，本地 mcode app-server 正确接收并产出输出流。
- [ ] 点击断开时，子进程和网络连接干净退出。