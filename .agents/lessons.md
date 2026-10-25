# 经验教训记录

## 2026-07-20: React Hooks 导入缺失导致运行时错误

### 现象
前端报 `useEffect is not defined` 运行时错误。

### 原因
在 `SettingsPage.tsx` 第 1 行只导入了 `useState`：
```tsx
import React, { useState } from "react";
```
但代码在第 64 行使用了 `useEffect`，缺少对应的导入。

### 修复
```tsx
import React, { useState, useEffect } from "react";
```

### 经验
1. **添加新 Hook 时必须检查导入列表**：每次在组件中引入新的 React Hook（如 `useEffect`, `useCallback`, `useMemo` 等），必须同步更新 import 语句。
2. **TypeScript 编译可以捕获此类错误**：这种错误在 `npm run build` 或 `npm run lint` 时应该能被检测出来。开发时要确保类型检查通过。
3. **Chrome DevTools 可能不会立即报错**：如果代码被 Vite 的 HMR 热更新，导入缺失会直接导致模块加载失败，页面会白屏。需要检查浏览器控制台和终端日志。
4. **copilot/IDE 自动补全可能遗漏**：AI 辅助编写代码时，有时会忘记同步更新 import 语句，交付前必须检查文件的 import 部分是否完整。

### 相关文件
- `crates/gui/frontend/src/pages/SettingsPage.tsx`

## 2026-10-25: mcode app-server 不是 Agent 协议服务，手机端远程对话链路全断

### 现象
手机端配对成功、输入 prompt 后，Agent 毫无反应，界面停在用户气泡上，且**没有任何错误提示**。

### 原因
两个协议错配叠加：

1. **子进程选错**：`mcode app-server --stdio` 是**运行时服务**，只暴露 `account/*`、`server/prepareRestart`、`desktopService/transport`，**不实现** `session/new` / `session/prompt`。真正的 Agent 协议服务是 `mcode acp`（stdin/stdout 上的 ACP / JSON-RPC 2.0）。
2. **报文格式不匹配**：手机端发的是自定义信封 `{"type":"chat","payload":"..."}`，被原样写进 app-server stdin 后被判为非法 JSON-RPC：
   ```json
   {"id":null,"error":{"code":-32600,"message":"Message must be a request, notification, or response."}}
   ```
   prompt 从未执行。回程的 JSON-RPC 帧又因缺少 `type` 字段被手机端 `relayMsg.type === "chat"` 的判断静默丢弃。
3. **心跳污染**：手机每 30s 发的 `{"type":"pong"}` 同样被写进 stdin，持续产生 -32600 噪音。

### 修复
- 桌面端改拉起 `mcode acp`，新增 `crates/gui/src-tauri/src/acp.rs` 适配层做双向协议翻译。
- 中继层 `control` / `ping` / `pong` 帧一律不下发给 Agent。

### 经验
1. **区分 `mcode app-server` 与 `mcode acp`**：前者是运行时服务，后者才是 Agent 协议服务。接入前先跑 `mcode <cmd> --help` 看它到底暴露哪些方法，别凭名字猜。
2. **ACP 握手要点**（已实测）：`initialize` 的 `params.protocolVersion` 必须是**数字** `1`（传字符串报 -32602）；顺序是 `initialize` → 收到响应 → `notifications/initialized` → `session/new`；`session/new` 返回的 `sessionId`（形如 `mvs_xxx`）是 `session/prompt` 的必需参数；正文以 `session/update` 的 `agent_message_chunk` 增量推送。
3. **静默失败最危险**：报文格式错时手机端表现为"没反应"，没有报错日志。接入新协议时一定要先做「发一条 → 看对端是否真的执行」的单向验证，再往上叠 UI。
4. **子进程 stderr 必须回收**：不回收会填满管道缓冲并阻塞子进程（原先 `app_server.rs` 就漏了这块，该文件现已改名为 `relay_adapter.rs`）。
5. **别让心跳进入业务协议流**：中继层的保活帧要在适配层就挡掉。

### 相关文件
- `crates/gui/src-tauri/src/acp.rs`
- `crates/gui/src-tauri/src/relay_adapter.rs`（原名 `app_server.rs`，已按真实用途改名）
- `mobile/services/websocket.ts`、`mobile/app/chat.tsx`
- `specs/073-custom-relay-mobile-remote-control/README.md`