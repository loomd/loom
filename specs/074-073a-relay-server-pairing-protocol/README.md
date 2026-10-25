---
status: planned
created: 2026-10-25
priority: high
tags:
- relay
- websocket
- protocol
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:28:29.294971400Z
updated_at: 2026-10-25T05:28:29.294971400Z
---

# 074-073a-relay-server-pairing-protocol: 独立轻量中继服务与配对通道协议 (Relay Server)

## Overview
设计并实现一个极轻量的中继服务（Relay Server），可部署在公网 VPS 或本地服务器。提供 HTTP 4 位纯数字配对码签发与验证接口，并通过 WebSocket 建立电脑端（Producer）与手机端（Consumer）之间的端到端数据中继通道，支持多连接透明转发与心跳存活保活。

## Requirements
- [ ] 配对码生命周期管理:
  - [ ] 电脑端调用 POST /api/pair/create 注册工作区，生成 4 位纯数字随机配对码（例如 4892），设置 5 分钟过期 TTL。
  - [ ] 手机端输入配对码调用 POST /api/pair/verify 进行预校验与关联。
- [ ] WebSocket 双向数据中继转发引擎:
  - [ ] 电脑端连接端点: wss://<host>/ws/desktop?code=<code>。
  - [ ] 手机端连接端点: wss://<host>/ws/mobile?code=<code>。
  - [ ] 双方连接成功后，服务端自动将二者的 WebSocket 数据流管道打通（Pipe/Relay），双向透明转发文本帧与二进制帧。
- [ ] 心跳与状态广播:
  - [ ] 服务端定时发送 Ping 帧，监测连接断开并通知对端（如广播 peer_disconnected / peer_connected）。
  - [ ] 支持单电脑端被多个手机/平板同时以只读/交互模式接入。
- [ ] 零存储与端到端安全:
  - [ ] 中继服务器仅在内存维护活动 socket 对，不落地持久化任何工作区代码或会话敏感记录。
  - [ ] 可选支持共享访问密码（Passphrase）保护。

## Non-Goals
- 不在服务器端做业务层的会话解析或 LLM 模型调用，纯粹作为网络层中继。
- 不引入重型数据库（如 MySQL/Redis），单进程内存 Map 即可满足单机并发通道需求。

## Technical Notes
- 技术选型推荐使用 Node.js（ws）或 Go，单文件即可部署启动。
- 内存开销极小（通常 < 30MB），支持 Docker 容器化一键部署在普通云服务器上。

## Acceptance Criteria
- [ ] 电脑端请求能成功获取 4 位数字配对码。
- [ ] 手机端输入正确配对码后双方进入同一 relay channel。
- [ ] 手机端发送的消息电脑端原样收到；电脑端发出的数据手机端原样收到。
- [ ] 任意一方断开连接后，中继通道优雅释放，配对码超时自动清理。