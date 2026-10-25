---
status: completed
created: 2026-10-25
priority: high
tags:
- relay
- websocket
- protocol
- auth
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:28:29.294971400Z
updated_at: 2026-10-25T06:30:00.000000000Z
---

# 074-073a-relay-server-pairing-protocol: 独立轻量中继服务、账号体系与配对通道协议 (Relay Server)

## Overview
设计并实现一个极轻量的自建中继服务（Relay Server），使用 Node.js + TypeScript 开发，可部署在公网 VPS。提供用户注册/登录账号体系（SQLite + JWT）、HTTP 4 位纯数字配对码签发与验证接口，并通过 WebSocket 建立电脑端（Producer）与手机端（Consumer）之间的端到端数据中继通道，支持心跳存活保活。单电脑绑定单手机。

## Requirements

### 账号与认证体系
- [x] 注册接口 POST /api/auth/register: 用户名 + 密码注册，密码 bcrypt 哈希存储于 SQLite。
- [x] 登录接口 POST /api/auth/login: 验证凭据，签发 JWT（有效期 7 天，可刷新）。
- [x] Token 刷新接口 POST /api/auth/refresh: 用未过期 JWT 换取新 JWT。
- [x] SQLite 用户表: id, username, password_hash, created_at, updated_at。
- [x] 所有后续 API 和 WebSocket 连接均需 Bearer JWT 认证。

### 配对码生命周期管理
- [x] 电脑端调用 POST /api/pair/create（需认证）注册工作区，生成 4 位纯数字随机配对码（例如 4892），设置 5 分钟过期 TTL。
- [x] 同一用户同时只能有一个活跃配对码，新建自动作废旧码。
- [x] 手机端输入配对码调用 POST /api/pair/verify（需认证）进行校验与关联，双方必须是同一账号。

### WebSocket 双向数据中继转发引擎
- [x] 电脑端连接端点: wss://<host>/ws/desktop?token=<jwt>。
- [x] 手机端连接端点: wss://<host>/ws/mobile?token=<jwt>&code=<code>。
- [x] 握手时服务端验证 JWT 有效性和用户身份。
- [x] 双方连接成功后，服务端自动将二者的 WebSocket 数据流管道打通（Pipe/Relay），双向透明转发文本帧与二进制帧。
- [x] 单用户同时只允许一台电脑 + 一部手机建立通道。

### 心跳与状态广播
- [x] 服务端每 30 秒发送 Ping 帧，监测连接断开并通知对端（广播 peer_disconnected / peer_connected 控制帧）。
- [x] 客户端 60 秒无 Pong 则判定断线并释放通道。

### 安全设计
- [x] 中继服务器仅在内存维护活动 socket 对，不落地持久化任何工作区代码或会话敏感记录。
- [x] 密码 bcrypt 哈希，JWT HS256 签名，密钥通过环境变量注入。
- [x] 配对码 4 位数字 + 5 分钟过期 + 同账号验证 三重保护，防止碰撞攻击。
- [x] WebSocket 强制 wss://（TLS），传输层加密。
- [x] 限流: 配对码创建每用户每分钟最多 3 次，登录失败每 IP 每分钟最多 5 次。

## Non-Goals
- 不在服务器端做业务层的会话解析或 LLM 模型调用，纯粹作为网络层中继 + 认证网关。
- 不引入重型数据库（MySQL/PostgreSQL/Redis），SQLite 单文件满足用户量需求。

## Technical Notes
- 项目位置: `relay/` 目录（项目根目录下）。
- 技术栈: Node.js + TypeScript + ws + better-sqlite3 + jsonwebtoken + bcryptjs。
- 内存开销极小（通常 < 30MB），支持 Docker 容器化一键部署。
- 部署通过 GitHub Actions 自动化: push 到 main 分支的 relay/ 变更触发构建并部署至服务器。
- 共享类型定义: `relay/src/types.ts` 导出的 JSON-RPC / 控制帧类型供移动端和桌面端复用。

## Directory Structure
```
relay/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
├── src/
│   ├── index.ts          # 入口，HTTP + WebSocket 服务器
│   ├── auth.ts           # 注册/登录/JWT 签发与验证
│   ├── pairing.ts        # 配对码生命周期管理
│   ├── relay.ts          # WebSocket 中继转发引擎
│   ├── db.ts             # SQLite 初始化与查询
│   ├── types.ts          # 共享类型定义（三端复用）
│   └── middleware.ts     # 限流、CORS、认证中间件
└── data/                 # SQLite 数据文件（gitignore）
```

## Acceptance Criteria
- [x] 用户可通过 API 注册账号并登录获取 JWT。
- [x] 电脑端使用 JWT 请求配对码成功，返回 4 位数字 + 过期时间。
- [x] 手机端使用同一账号 JWT + 正确配对码后双方进入同一 relay channel。
- [x] 手机端发送的消息电脑端原样收到；电脑端发出的数据手机端原样收到。
- [x] 任意一方断开连接后，中继通道优雅释放，配对码超时自动清理。
- [x] 非同一账号的配对码验证被拒绝。
- [x] GitHub Actions 推送 relay/ 变更后自动构建部署。
