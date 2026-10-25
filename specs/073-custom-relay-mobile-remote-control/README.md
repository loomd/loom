---
status: completed
created: 2026-10-25
priority: high
tags:
- remote-control
- relay
- mobile
- mcode
created_at: 2026-10-25T05:28:11.100513500Z
updated_at: 2026-10-25T06:30:00.000000000Z
---

# 073-custom-relay-mobile-remote-control: 自建中继手机端远程控制与配对系统 (Umbrella)

## Overview
为彻底替换 MiniMax 官方移动端私有闭源中继链路（认证黑盒与单设备绑定限制），设计并实现一套完全自主可控、轻量高效的自建中继远程控制与配对系统。通过独立的 Relay Server 实现账号注册/登录、4 位数字配对码签发与双向 WebSocket 消息转发；Loom 电脑端连接自建 Relay 并将数据流管接至本地 `mcode acp`（ACP / JSON-RPC 2.0）；提供专属 React Native 原生移动端 App（导出 APK），实现手机随时随地远程控制电脑工作区、流式代码生成与权限审批。

## Requirements
- [x] 074-073a-relay-server-pairing-protocol: 独立轻量中继服务（Node.js + TypeScript），负责账号体系、配对码生命周期管理与 WebSocket 管道中继。
- [x] 075-073b-loom-desktop-relay-adapter: Loom 电脑端客户端接入，对接自建 Relay 并将手机端信封翻译为本地 `mcode acp` 的 ACP 协议，在侧边栏新增独立「远程连接」页提供状态和配对码展示。
- [x] 076-073c-mobile-native-app: 原生 React Native 移动端 App（Expo），支持配对输入、会话管理、流式对话气泡、文件查看与权限问卷审批，可导出 APK 并支持 OTA 自动更新。

## Non-Goals
- 不依赖 MiniMax 官方闭源桌面端的 @mavis/remote-control-bridge 封闭私有报文，完全替换现有官方中继代码。
- 不支持局域网直连模式，统一走公网自建 Relay Server。
- 不支持多手机同时连接同一台电脑，单电脑绑定单手机（基于账号体系）。
- 不在各大手机应用商店上架，通过侧载 APK + OTA 热更新实现分发。

## Technical Notes
- 核心引擎保持使用官方标准开放的 `mcode acp`（stdin/stdout 上的 ACP / JSON-RPC 2.0 服务）。注意 `mcode app-server --stdio` 是运行时服务，不实现 `session/*`，不可混用。
- 手机端与电脑端通信走 Loom 远程聊天帧协议（`chat` / `chat_end` / `thinking` / `tool_call` / `permission_request` / `permission_response` / `error`），由中继服务器进行无状态转发，不落盘敏感代码；协议翻译由电脑端 ACP 适配层完成。
- 技术栈统一为 TypeScript/React 体系：Relay Server（Node.js + ws）、移动端（React Native + Expo）、桌面端（Rust Tauri + React 前端）。
- 账号体系采用轻量 SQLite + JWT，Relay Server 同时承担认证服务职责。
- 部署采用 GitHub Actions 自动化，推送至服务器。

## Architecture
```
[手机 React Native App] <--wss--> [自建 Relay Server (Node.js)] <--wss--> [Loom Desktop (Rust/Tauri)]
                                         |                                          |
                                   SQLite 账号库                        mcode acp (ACP/JSON-RPC 2.0)
                                   JWT 认证                              ↑ 协议翻译适配层 (acp.rs)
```

## Acceptance Criteria
- [x] 用户在 Loom 电脑端侧边栏「远程连接」页登录账号并开启远程服务，可向自建 Relay 注册并获得 4 位配对码。
- [x] 手机 App 登录同一账号后输入 4 位配对码，能成功打通与电脑端的双向长连接，电脑端显示手机在线。
- [x] 手机端输入 prompt，电脑端 `mcode acp` 正常执行，并在手机端实时打字流式渲染响应结果。
- [x] 完全不依赖 MiniMax 官方云端 API，所有通信经由自建 Relay Server。
