# mobile/AGENTS.md — 移动端（React Native + Expo）开发规范与协议备忘

本文件是仓库根 `AGENTS.md` 在 `mobile/` 目录下的补充。所有条目均为**已对真实环境实测确认**的事实，
接手本目录的任务时**直接采信，不要重新搭环境验证协议**。

---

## 1. 目录定位

```
mobile/
├── app/          expo-router 文件系统路由（index/login/register/pair/chat/settings）
├── components/   ChatBubble / CodeBlock / ThinkingBlock / PermissionCard / StatusBar
├── services/     api.ts（HTTP）、websocket.ts（WS 连接管理）、storage.ts（本地持久化）
├── scripts/      sync-version.mjs（版本号对齐）、build-apk.mjs（本地打包入口）
├── types/        与 relay/src/types.ts 对齐的类型
├── android/      **expo prebuild 生成目录，已被 .gitignore 排除，不入库**
└── dist/         打包产物目录，已被 .gitignore 排除，不入库
```

技术栈：Expo SDK 52 / React Native 0.76 / expo-router 4 / TypeScript 5.6。
本目录**没有** lint / test 脚本，校验手段见第 5 节。

---

## 2. 已验证的协议事实（无需再验证）

### 2.1 Agent 服务选型：只能用 `mcode acp`

| 命令 | 是不是 Agent 协议服务 | 说明 |
|---|---|---|
| `mcode acp` | ✅ 是 | stdin/stdout 上的 ACP / JSON-RPC 2.0，实现 `session/*` |
| `mcode app-server --stdio` | ❌ 否 | 运行时服务，只暴露 `account/*`、`desktopService/transport`、`server/prepareRestart`，**没有** `session/new` / `session/prompt` |

往 app-server stdin 写自定义信封会被判非法 JSON-RPC（`-32600`），且**回程报文缺少 `type` 字段会被手机端静默丢弃**，
表现为"发出去没下文、也不报错"。两者不可混用。

### 2.2 ACP 握手与调用（对真实 `mcode acp` 实测）

握手顺序固定三步：

1. `initialize`，`params.protocolVersion` **必须是数字 `1`**（传字符串报 `-32602 Invalid params`）
2. 收到响应后发 `notifications/initialized`
3. `session/new` → 返回 `sessionId`（形如 `mvs_xxx`）

- `sessionId` 是 `session/prompt` 的**必需参数**；会话就绪前发 prompt 会得到
  `-32602 Invalid params`（`sessionId: expected string, received null`），所以**必须排队等就绪再发**
- `session/prompt` 参数：`{sessionId, prompt:[{type:"text", text:"..."}]}`
- 正常结束：响应 `{"result":{"stopReason":"end_turn"}}`
- 正文以 `session/update` **增量推送**：`agent_message_chunk`（正文）、`agent_thought_chunk`（思考）、
  `tool_call` / `tool_call_update`（工具）、`session_info_update` / `usage_update`（可忽略）
- 权限：`session/request_permission` → 回 `{"outcome":{"outcome":"selected","optionId":...}}` 或 `{"outcome":{"outcome":"cancelled"}}`

### 2.3 桌面端 → 手机端帧协议

中继层是无状态字节管道（只拦截 `type === "control"`），协议翻译在
`crates/gui/src-tauri/src/acp.rs`。手机端收到的帧类型：

| type | 含义 | 手机端处理 |
|---|---|---|
| `chat` | Agent 回复正文增量 | **同一轮的所有增量合并进同一个气泡**，直到 `chat_end` |
| `chat_end` | 本轮结束 | 关闭当前气泡（后续 `chat` 另起气泡） |
| `thinking` | 思考过程增量 | 并入当前气泡的 `<thinking>` 块 |
| `tool_call` | 工具调用状态（payload 为 JSON 字符串） | 同一 `toolCallId` 的更新合并为一条，**独立成气泡** |
| `permission_request` | 权限审批请求（payload 为 JSON 字符串） | 弹审批卡片 |
| `error` | 错误提示 | 独立成气泡 |

上行：用户文本走 `chat` 信封；审批裁决走 `permission_response` 帧
`{"type":"permission_response","payload":"{\"id\",\"approved\",\"optionId\"}"}`。

### 2.4 账号级绑定与重连语义（中继侧已实现）

配对码只是**一次性的绑定授权凭据**，不是会话凭据：

| 阶段 | 手机端行为 | 中继行为 |
|---|---|---|
| 首次配对 | `POST /api/pair/verify {code, deviceId}` → 成功即建立绑定 | 校验通过后把 `user_id ↔ device_id` 写入 `mobile_bindings` |
| 后续重连 | `GET /api/pair/binding` 判断已绑定 → 直接进聊天页；`/ws/mobile?token=..&deviceId=..` **不带 code** | 已绑定 → 仅凭 token 放行；未绑定 → 必须带有效 code，否则 `close(4001)` |
| 换设备 | 同账号的其它 `deviceId` 会被拒绝（`close(4001)`），需桌面端先解绑 | 绑定按账号唯一，`device_id` 记录具体设备 |
| 强制解绑 | 桌面端「解绑手机端」→ `POST /api/pair/unbind` | 删除绑定行并断开该账号全部连接 |

**不要再把「重新输入配对码」当成断连后的恢复手段** —— 绑定是持久的，
断连恢复路径是「自动重连」。只有 `close(4001)`（未绑定 / 绑定失效 / 绑定到其他设备）
才需要回到 `/pair` 页面。

中继的心跳以「最后一次收到 pong」为基准，阈值 90s（允许连续 2 次 pong 丢失），
手机息屏或切网导致的 pong 迟到不会导致链路被误杀。

---

## 3. 易踩的坑（务必先读）

### 3.1 版本号：单一来源 + 打包前强制对齐

版本号在三处出现，**只有 `mobile/app.json` 是事实来源**：

| 位置 | 字段 | 是否入库 |
|---|---|---|
| `mobile/app.json` | `expo.version` / `expo.android.versionCode` | ✅ 事实来源 |
| `mobile/package.json` | `version` | ✅ 与 app.json 保持一致 |
| `mobile/android/app/build.gradle` | `versionCode` / `versionName` | ❌ 生成目录，被 .gitignore 排除 |

- `expo prebuild`（`@expo/config-plugins` 的 `withVersion`）会自动把 app.json 的版本写进
  `build.gradle`；但**沿用旧原生目录**（不重新 prebuild）直接打包时，
  `build.gradle` 里的值会停留在旧版本号 → 打出来的包 versionCode 没变 →
  Android 拒绝覆盖安装 → 用户手机上的旧包继续生效（现场就是这么复现的）。
- 因此**改版本号只改 `app.json` 一处**，其余由脚本对齐：

```powershell
cd mobile
npm run sync:version    # 对齐 package.json 与 build.gradle（幂等）
npm run check:version   # 只校验，不一致则退出码 1（CI 可用）
npm run build:apk:local # 打包入口：自动先 sync 再 gradle，最后拷到 mobile/dist/
```

- 打包后务必核对：`aapt2 dump badging mobile\dist\loom-remote-release.apk | Select-String "^package:"`
  → 应看到 `versionCode` 与 `versionName` 和 `app.json` 一致。
- 别人拉代码后若需要原生工程，先 `npx expo prebuild --platform android`（版本号会自动带上）。

### 3.2 `thinking` 帧可能晚于首段正文到达

工具调用场景下真实帧序是：`chat`(英文铺垫) → `tool_call` → `thinking`(大段) → `chat`(正文) → `chat_end`。
思考增量**不能只在"开气泡那一刻"取一次**，否则整段思考过程会被 `chat_end` 直接丢弃；
必须"已开气泡就并入该气泡的 `<thinking>` 块"。

### 3.3 工具调用本来就是独立气泡

`tool_call` 帧会另起一条气泡（`[工具] 名称 · 状态`），这是预期行为，
不是"流式回复被拆包"。排查时先区分"正文被拆"还是"工具卡片插在中间"。

### 3.4 心跳与控制帧不能进业务协议流

- 手机端每 30s 发的 `pong`、中继层的 `control` 帧，**一律不得写入 ACP stdin**，否则污染 JSON-RPC 流。
- 桌面端适配层已按帧类型过滤，手机端不要再转发 `ping`/`pong`。

### 3.5 通道与协议是一条链

手机端 → relay → 桌面端 → `mcode acp` 是单向串行链路，任一环协议错配都是**静默失败**，
接入新协议时先做「发一条 → 看对端是否真的执行」的单向验证，再往上叠 UI。

---

## 4. 构建与打包

```powershell
# 推荐：统一入口（先同步版本号，再打包，最后拷到 dist/）
cd mobile
$env:ANDROID_HOME='E:\Develop\AndroidSDK'
npm run build:apk:local

# 产物（dist 被 gitignore，不入库）
mobile\dist\loom-remote-release.apk
```

脚本入口：

| 命令 | 作用 |
|---|---|
| `npm run sync:version` | 把 app.json 的版本号对齐到 package.json 与 build.gradle（幂等） |
| `npm run check:version` | 只校验版本号一致性，不一致则退出码 1 |
| `npm run build:apk:local` | sync → `gradlew assembleRelease` → 拷贝 APK 到 `mobile/dist/` 并回显版本号 |

- 若原生工程被删改过，先 `npx expo prebuild --platform android` 重新生成再打包。
- release 包复用 `signingConfigs.debug`（debug.keystore），**与历史包同签名**，可直接覆盖安装；
  正式分发前应换自有 keystore。
- gradle 打包会顺带跑 `expo:lintVitalRelease`（lint）与 `createBundleReleaseJsAndAssets`（Metro 导出 JS bundle）。
- `assets/app.manifest`（expo-updates 资源）可能是**上一次导出的陈旧产物**：
  改版本后若 manifest 的 `commitTime` 没变，说明该任务被判定 UP-TO-DATE，
  删掉 `android/app/build/generated/assets/createReleaseUpdatesResources/app.manifest`
  与 `android/app/build/intermediates/assets/release/mergeReleaseAssets/app.manifest` 后重打包。
- `updates.url` 目前是占位地址 `https://u.expo.dev/placeholder`，OTA 实际不可用；
  排查"代码没生效"时先确认手机跑的是包内 bundle 而不是 OTA bundle。

---

## 5. 本目录的验证方式

- 类型检查：`cd mobile; npx tsc --noEmit`（本目录没有 lint / test 脚本，这是唯一的静态检查）
- 桌面端协议适配层（Rust）单测：
  `cargo test -p loom-gui --bin loom-gui acp::tests`
- 真实 `mcode acp` 端到端（需本机已登录 mcode，默认跳过）：
  `cargo test -p loom-gui --bin loom-gui acp::tests::test_live -- --ignored --nocapture`
- 打包验证：`npm run build:apk:local` + `aapt2 dump badging` 核对版本号

---

## 6. 红线

- 遵守根 `AGENTS.md` 的红线：**禁止执行 PATH 扫描发现的 CLI 工具**（连 `--version` 也不行），
  禁止未经授权 `git push`，禁止创建分支（一律在 `main` 上改）。
- 本目录的改动优先保持小 diff；不要顺手重构 `app/chat.tsx` 的帧分发结构，
  它与 `crates/gui/src-tauri/src/acp.rs` 的帧协议是强耦合的。
