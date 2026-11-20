---
status: complete
created: 2026-11-20
priority: high
tags:
- hermes
- feishu
- bot
created_at: 2026-11-20T06:30:41.800891500Z
updated_at: 2026-11-20T06:35:30.316061700Z
completed_at: 2026-11-20T06:35:30.316061700Z
transitions:
- status: in-progress
  at: 2026-11-20T06:30:47.360091400Z
- status: complete
  at: 2026-11-20T06:35:30.316061700Z
---

# Hermes: 显式@自身识别与机器人互相@消息响应

> **Status**: in-progress · **Priority**: High · **Created**: 2026-11-20

## Overview

在飞书多机器人共存群聊场景中，用户反馈：
1. **多机器人群聊冲突**：同一个群聊中存在多个 Hermes 机器人时，由于逻辑仅简单检查 `!mentions.is_empty()`，无法区分消息是发给哪一个机器人的，导致所有活跃的 Hermes 实例均对消息进行回复。
2. **机器人间互相调用阻断**：先前的自循环防护直接过滤了所有 `sender_type == "app" || sender_type == "bot"` 的消息，导致机器人之间即使显式 @ 彼此，消息也会被全局丢弃，无法实现机器人互相对话协同。

本 Spec 旨在：
- 在长连接启动阶段或按需自动拉取并缓存当前 Hermes 实例自身的 `bot_open_id`。
- 在群聊（`group`）场景下，严格执行显式目标匹配：仅当 `mentions` 中明确包含自身 `bot_open_id` 时才进行处理与响应；其他非目标机器人自动静默忽略。
- 精确化自循环防护：解除全局忽略 `bot` / `app` 消息，改为“仅忽略 sender_open_id 等于自身 open_id”的消息，确保其它机器人发出的、并且显式 @ 了当前机器人的消息能够正常被接收和处理。

## Design

### 1. 自动拉取自身 Identity（`bot_open_id`）
在 `crates/gui/src-tauri/src/hermes/client.rs`：
- 在 `LarkClient` 结构体中增加 `bot_open_id: Mutex<Option<String>>`。
- 新增接口 `get_bot_open_id(&self) -> Result<String, String>`：
  - 调用飞书 OpenAPI `GET /open-apis/bot/v3/info`（带 `tenant_access_token`）。
  - 解析响应结果 `bot.open_id`，缓存至 `bot_open_id`。
  - 提供 `cached_bot_open_id(&self) -> Option<String>`，供消息过滤环节快速读取。

### 2. 精准过滤自身消息，放行其他机器人互相@
在 `crates/gui/src-tauri/src/hermes/ws.rs`：
- 废弃原先的死规则 `if sender_type == "app" || sender_type == "bot" { return; }`。
- 替换为：若 `sender_open_id == self_bot_open_id`（发件人 open_id 即为自身 open_id），或者在无法获得自身 open_id 时若 `sender_type == "app"` 且未明确指向其他目标，则拦截自身消息。
- 当 `sender_open_id != self_bot_open_id` 时，不论发件人是真人用户还是其他机器人（`sender_type == "bot" || sender_type == "app"`），均允许继续向下流转。

### 3. 群聊消息（`chat_type == "group"`）仅在显式@自身时响应
- 从 `message.mentions` 中提取所有被 @ 的用户或机器人的 `open_id`（`mentions[*].id.open_id`）。
- 若 `chat_type == "group"`：
  - 若 `self_open_id` 存在：仅当 `mentions` 中包含该 `self_open_id` 时才予以响应。
  - 若 `mentions` 中不包含当前机器人的 `self_open_id`，即使消息以 `/cmd` 开头或者包含其他人的 mention，也直接忽略不处理。
  - 在 p2p 单聊场景下不受此限制，继续正常响应。

## Plan

- [x] 创建 Spec 与任务分解
- [x] 在 `LarkClient` 中实现 `get_bot_info` 接口与 `bot_open_id` 缓存机制
- [x] 在 `LarkWsClient` 启动或建立连接时预热拉取 `bot_open_id`
- [x] 改造 `ws.rs` 中的消息过滤机制：精确过滤自身消息，允许其他 Bot 发送的消息
- [x] 改造群聊过滤机制：仅在显式 @ 当前机器人自身 `open_id` 时响应
- [x] 编写并执行单元测试与全量检查（`cargo check`, `cargo test`）

## Test

- [x] 单元测试验证：包含/不包含自身 open_id 的群聊过滤逻辑
- [x] 单元测试验证：自己发给自己的消息被拦截，其他 bot 发给当前 bot 且 @ 当前 bot 的消息被放行
- [x] 工作区编译与全量测试通过：`cargo test --workspace`
