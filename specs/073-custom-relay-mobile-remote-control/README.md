---
status: planned
created: 2026-10-25
priority: high
tags:
- remote-control
- relay
- mobile
- mcode
created_at: 2026-10-25T05:28:11.100513500Z
updated_at: 2026-10-25T05:28:11.100513500Z
---

# 073-custom-relay-mobile-remote-control: 自建中继手机端远程控制与配对系统 (Umbrella)

## Overview
为彻底解决 MiniMax 官方移动端私有闭源中继链路的认证黑盒与单设备绑定限制，设计并实现一套完全自主可控、轻量高效的自建中继远程控制与配对系统。通过独立的 Relay Server 实现 4 位数字配对码签发与双向 WebSocket 消息转发；Loom 电脑端连接 Relay 并将数据流管接至本地 mcode app-server --stdio；提供专属移动端 Web / PWA 客户端，实现手机随时随地远程控制电脑工作区、流式代码生成与权限审批。

## Requirements
- [ ] 074-073a-relay-server-pairing-protocol: 独立轻量中继服务（Node/Go），负责配对码生命周期管理与 WebSocket 管道中继。
- [ ] 075-073b-loom-desktop-relay-adapter: Loom 电脑端客户端接入，对接自建 Relay 并双向桥接本地 mcode app-server --stdio，在概览页提供状态和配对码展示。
- [ ] 076-073c-mobile-web-pwa-client: 移动端响应式 Web / PWA 界面，支持配对输入、会话管理、流式对话气泡、文件查看与权限问卷审批。
- [ ] 局域网直连与公网中继双模式: 支持配置局域网直连或公网自建服务器地址。

## Non-Goals
- 不依赖 MiniMax 官方闭源桌面端的 @mavis/remote-control-bridge 封闭私有报文。
- 不强制在各大手机应用商店上架原生安装包，采用响应式 PWA / Web 达到即开即用的原生体验。

## Technical Notes
- 核心引擎保持使用官方标准开放的 mcode app-server --stdio（JSON-RPC 2.0）。
- 手机端与电脑端通信走标准 JSON-RPC 2.0 / 流式文本帧，由中继服务器进行无状态转发，不落盘敏感代码。

## Acceptance Criteria
- [ ] 用户在 Loom 电脑端点击开启远程服务，可向自建 Relay 注册并获得 4 位配对码。
- [ ] 手机在浏览器输入 4 位配对码后，能成功打通与电脑端的双向长连接，电脑端显示手机在线。
- [ ] 手机端输入 prompt，电脑端 mcode app-server 正常执行，并在手机端实时打字流式渲染响应结果。