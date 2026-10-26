# mobile/AGENTS.md — 移动端（React Native + Expo）开发规范与协议备忘

本文件是仓库根 `AGENTS.md` 在 `mobile/` 目录下的补充。所有条目均为**已对真实环境实测确认**的事实，
接手本目录的任务时**直接采信，不要重新搭环境验证协议**。

---

## 1. 目录定位

```
mobile/
├── app/          expo-router 文件系统路由（index/login/register/pair/chat/settings）
├── components/   ChatHeader / ConversationRow / MarkdownText / ToolCallGroup /
│                 ThinkingBlock / PermissionCard / overlays（滑出抽屉与底部面板）/ icons
├── services/     api.ts（HTTP）、websocket.ts（WS 连接管理）、storage.ts（本地持久化）、
│                 conversation.ts（消息组装与渲染单元切分）
├── scripts/      sync-version.mjs（版本号对齐）、build-apk.mjs（本地打包入口）
├── theme.ts      全局设计令牌（色板 / 圆角 / 间距），全端共用
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
`crates/gui/src-tauri/src/acp.rs`；桌面端与中继的连接、账号配对、
拉起并守护 `mcode acp` 子进程在 `crates/gui/src-tauri/src/relay_adapter.rs`
（原名 `app_server.rs`，已按真实用途改名——**不要**按旧名去找）。
手机端收到的帧类型：

| type | 含义 | 手机端处理 |
|---|---|---|
| `chat` | Agent 回复正文增量 | **按到达顺序**追加为正文消息；只有最后一条仍是正文时才合并增量，否则另起一条 |
| `chat_end` | 本轮结束 | 无需收尾（正文/思考/工具已按到达顺序落库）；载荷为 `cancelled` 表示本轮被叫停 |
| `thinking` | 思考过程增量 | 独立成「思考」消息（连续增量合并），位置跟随真实到达顺序 |
| `tool_call` | 工具调用状态（payload 为 JSON 字符串） | 同一 `toolCallId` 原地更新状态；**连续的多个工具调用在列表里折叠成一行**，点击展开明细 |
| `permission_request` | 权限审批请求（payload 为 JSON 字符串） | 弹审批卡片 |
| `error` | 错误提示 | 独立成气泡 |

**每个下行帧都带 `projectId`**：多项目的 ACP 会话可以同时在跑，中继层又只是字节透传，
帧不带归属信息就没法区分内容来自哪个项目。手机端按 `projectId` 落库，
**不是**按「当前正在看的项目」——否则「对话中途切项目」时，切换前那个项目的输出会串到新项目里。
（旧版桌面端不下发该字段，手机端此时退回当前项目，属兼容降级。）

上行：用户文本走 `chat` 信封；审批裁决走 `permission_response` 帧
`{"type":"permission_response","payload":"{\"id\",\"approved\",\"optionId\"}"}`；
叫停走 `stop` 帧 `{"type":"stop"}`。

### 2.5 停止与插入（桌面端与手机端必须同时更新）

| 能力 | 手机端 | 桌面端 |
|---|---|---|
| 停止当前对话 | 生成中显示「停止」按钮，发 `stop` 帧 | 转成 ACP `session/cancel`（`params.sessionId` 必需），丢弃排队中的提问，Agent 回应后补发 `chat_end`（载荷 `cancelled`） |
| 对话中插入提问 | 生成中发送的消息标记「排队中」，本轮结束后自动执行 | 同一 session 只允许一个 `session/prompt` 在途，后续提问进 `prompt_queue`，上一轮结束后自动派发 |

- **不是所有 Agent 都实现了 `session/cancel`**：桌面端有 3 秒兜底超时，
  超时未收到 Agent 回应就直接结束该项目的 ACP 子进程，保证「停止」一定生效
  （代价是该项目下一条消息要重新拉起会话）。
- 叫停会**连带丢弃排队中的提问**（桌面端清 `prompt_queue`），
  手机端收到 `chat_end`（载荷 `cancelled`）后把「排队中」的消息标记为「已取消」。
- `stop` 帧由桌面端桥接循环单独处理：**不会**为该项目新建 ACP 进程。

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

### 3.1 版本号：跨端统一管理 + 打包前强制对齐

仓库采用**全端版本强对齐（统一管理方案）**，通常直接在仓库根目录执行：
```powershell
node scripts/bump-version.mjs <new_version>  # 统一对齐 Loom/Mobile/Relay 版本
node scripts/bump-version.mjs --check        # 校验全端版本一致性
```

移动端内部版本号在三处出现，其中 **`mobile/app.json` 是移动端的事实来源**：

| 位置 | 字段 | 是否入库 |
|---|---|---|
| `mobile/app.json` | `expo.version` / `expo.android.versionCode` | ✅ 事实来源 |
| `mobile/package.json` | `version` | ✅ 与 app.json 保持一致 |
| `mobile/android/app/build.gradle` | `versionCode` / `versionName` | ❌ 生成目录，被 .gitignore 排除 |

- `expo prebuild`（`@expo/config-plugins` 的 `withVersion`）会自动把 app.json 的版本写进
  `build.gradle`；但**沿用旧原生目录**（不重新 prebuild）直接打包时，
  `build.gradle` 里的值会停留在旧版本号 → 打出来的包 versionCode 没变 →
  Android 拒绝覆盖安装 → 用户手机上的旧包继续生效（现场就是这么复现的）。
- 根目录脚本 `scripts/bump-version.mjs` 会自动调用 `mobile/scripts/sync-version.mjs`，确保三处同步；
- 若仅调试移动端，改动 `app.json` 后可单独在 `mobile/` 目录对齐：

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
手机端**按到达顺序**把每一段落成独立消息，因此思考增量必须**来一段就追加一段**，
不能只在"开气泡那一刻"取一次，否则整段思考过程会被 `chat_end` 直接丢弃。

### 3.3 工具调用连续出现时要折叠成一行

`tool_call` 帧各自是一条消息（同一 `toolCallId` 的后续状态原地覆盖），
但渲染层 `buildConversationRows()` 会把**连续的多个工具调用合并为一个渲染单元**，
只显示一行摘要，点击才展开明细——否则工具卡片会在对话流里堆成一长条。
「正文 → 工具 → 正文」必须保持三段，不要把工具后的正文并回前面的正文。

### 3.4 心跳与控制帧不能进业务协议流

- 手机端每 30s 发的 `pong`、中继层的 `control` 帧，**一律不得写入 ACP stdin**，否则污染 JSON-RPC 流。
- 桌面端适配层已按帧类型过滤，手机端不要再转发 `ping`/`pong`。

### 3.5 通道与协议是一条链

手机端 → relay → 桌面端 → `mcode acp` 是单向串行链路，任一环协议错配都是**静默失败**，
接入新协议时先做「发一条 → 看对端是否真的执行」的单向验证，再往上叠 UI。

### 3.6 多项目并发：帧必须按 projectId 归属

桌面端会同时为多个项目各拉起一个 ACP 会话，它们的输出在同一条中继链路上交织。
手机端**不能**按「当前正在看的项目」落库，必须按帧里的 `projectId`，
否则「对话中途切项目」会把上一个项目的输出写进新项目（用户看到的就是内容串台）。

桌面端新增下行帧时，务必同步补上 `projectId`
（`crates/gui/src-tauri/src/relay_adapter.rs` 的 `tag_project`）。

同理，手机端**每个项目各自维护** `busy` / `stopping` / `awaitingDelivery`：
A 项目在生成中不影响 B 项目的状态条与停止按钮。

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
- **明文 HTTP**：`app.json` 里已声明 `android.usesCleartextTraffic: true`（设置页允许填
  `http://ip:port` 的 relay）。但 `mobile/android/` 是生成目录，**旧 prebuild 产物里
  `AndroidManifest.xml` 不会带这个属性**，导致 release 包发 `http://` 请求直接
  `Network request failed`。重新 `npx expo prebuild --platform android` 即可补齐；
  排查「连不上 http  relay」时先确认 manifest 里有 `usesCleartextTraffic`。
- release 包复用 `signingConfigs.debug`（debug.keystore），**与历史包同签名**，可直接覆盖安装；
  正式分发前应换自有 keystore。
- gradle 打包会顺带跑 `expo:lintVitalRelease`（lint）与 `createBundleReleaseJsAndAssets`（Metro 导出 JS bundle）。
- `assets/app.manifest`（expo-updates 资源）可能是**上一次导出的陈旧产物**：
  改版本后若 manifest 的 `commitTime` 没变，说明该任务被判定 UP-TO-DATE，
  删掉 `android/app/build/generated/assets/createReleaseUpdatesResources/app.manifest`
  与 `android/app/build/intermediates/assets/release/mergeReleaseAssets/app.manifest` 后重打包。
- `updates.url` 目前是占位地址 `https://u.expo.dev/placeholder`，OTA 实际不可用；
  排查"代码没生效"时先确认手机跑的是包内 bundle 而不是 OTA bundle。
- **Kotlin 1.9.25 依赖**：`expo-modules-core` 的 Compose Compiler (1.5.15) 强依赖 Kotlin `1.9.25`，
  `sync-version.mjs` 与 `build-apk.mjs` 会自动注入 `android.kotlinVersion=1.9.25`，避免 1.9.24 报错。

### 4.1 「JS 改了但包里还是旧代码」的坑（已实测踩过）

APK 里的 `assets/index.android.bundle` 是 **Hermes 字节码**（不是可读 JS），
所以**别用 `grep 字符串` 的方式判断包里有没有你的新代码**——一定搜不到。

真正会「打进去旧代码」的有两处缓存：

| 缓存 | 位置 | 症状 |
|---|---|---|
| gradle bundle 任务产物 | `android/app/build/generated/assets/createBundleReleaseJsAndAssets/`（含 `.hbc`）与 `generated/res/createBundleReleaseJsAndAssets/` | 任务被判定 UP-TO-DATE，把上一次的 `.hbc` 重新打进 APK |
| Metro 转换缓存 | `%TEMP%/metro-cache` | 命中旧模块转换结果 |

`npm run build:apk:local` 现在会一次性清掉上面这些目录再打包（见 `scripts/build-apk.mjs`），
**不要绕过脚本直接跑 `gradlew assembleRelease`**，否则可能拿到旧 bundle。

判定"包里到底是不是新代码"要用**行为验证**，不要靠 grep：

- 先在界面上放一个肉眼可见的标记（例如空态文案加 `· dbg`），
  装到设备上确认能看到，再删掉标记重新打包；
- 或用 `debugPrintTree` 之类在运行时打印，让 logcat 说话。

---

## 5. 本目录的验证方式

- 类型检查：`cd mobile; npx tsc --noEmit`（本目录没有 lint / test 脚本，这是唯一的静态检查）
- 打包可行性检查（Metro 全量编译，验证模块解析与 reanimated babel 插件）：
  `cd mobile; npx expo export --platform android --output-dir .tmp-export-check`
  （产物目录是临时的，验证完删掉）
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
- 消息的**组装规则**（增量合并、工具折叠、渲染单元切分）集中在
  `services/conversation.ts`，改渲染样式请动 `components/`，不要在 `app/chat.tsx` 里堆样式。
- **禁止在界面里使用 emoji**：图标一律用 `components/icons.tsx` 里的纯 View 绘制，
  配色与圆角一律取自 `theme.ts`，保持全端风格统一。
