---
status: completed
created: 2026-10-25
priority: high
tags:
- mobile
- react-native
- expo
- android
- apk
depends_on:
- 074-073a-relay-server-pairing-protocol
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:29:25.552616100Z
updated_at: 2026-10-25T06:30:00.000000000Z
---

# 076-073c-mobile-native-app: 手机端 React Native 原生远程工作台 (Mobile Client)

## Overview
设计并实现一个原生 Android 移动端 App，使用 React Native + Expo 框架开发。用户在手机上打开 App，登录账号并输入 4 位配对码即可连接电脑上的工作区，享受原生 App 的丝滑交互体验：支持双向打字对话、Thinking 思考折叠、Markdown 代码高亮、文件树只读浏览、以及工具调用权限/问卷结构化卡片审批。支持导出 APK 安装包，通过 expo-updates 实现 OTA 自动热更新。

## Requirements

### 登录与配对
- [x] 启动页: App 图标、版本号、自建 Relay 服务器地址配置入口。
- [x] 登录页: 用户名/密码登录，注册入口链接，JWT 持久化到 SecureStore。
- [x] 配对页: 4 位大号数字验证码输入框，自动聚焦，输入完成即自动提交验证。
- [x] 本地记忆: 利用 AsyncStorage 记录上次成功连接的服务器地址，支持一键重连或重新配对。

### 核心流式对话工作区（Chat View）
- [x] 对接 Loom 远程聊天帧协议: 通过 WebSocket 接收电脑端（ACP 适配层）下发的帧并增量渲染。
  - [x] `chat`: Agent 回复正文增量，**按到达顺序**追加为正文消息（仅当最后一条仍是正文时才合并增量）。
  - [x] `chat_end`: 本轮结束（正文/思考/工具已按到达顺序落库，无需额外收尾）。
  - [x] `thinking`: 思考过程增量，独立成「思考」折叠行，位置跟随真实到达顺序。
  - [x] `tool_call`: 工具调用状态（同一 `toolCallId` 的更新原地覆盖；**连续的多个工具调用在列表里折叠成一行**，点击展开明细）。
  - [x] `permission_request`: 权限审批请求，载荷为 JSON 字符串。
  - [x] `error`: 错误提示。
  - [x] 每个下行帧带 `projectId`：多项目会话可同时在跑，帧据此归属到**产生它**的项目会话（对话中途切项目不会串内容）。
  - [x] 上行: 用户文本走 `chat` 信封；审批裁决走 `permission_response` 帧（`{"id","approved","optionId"}`）；叫停走 `stop` 帧（桌面端转成 ACP `session/cancel`）。
- [x] 停止当前对话: 生成中显示「生成中 + 停止」状态条，停止后本轮结束（`chat_end` 载荷为 `cancelled`）。
- [x] 对话中插入提问: 生成中发送的消息标记为「排队中」，本轮结束后自动执行。
- [x] 思考状态折叠展开展现（Thinking Process）。
- [x] Markdown 渲染: 支持标题、列表、表格、代码块高亮（react-native-markdown-display）。
  - 注：库的默认表格规则在 RN 上会渲染成空表格，移动端改为自绘表格规则（`components/MarkdownText.tsx`）。
- [ ] 代码块一键复制到剪贴板（未落地：当前无剪贴板依赖，代码块为只读展示；历史按钮因未接 `onCopy` 而无实际功能，已移除）。
- [x] 输入框: 底部固定输入区，支持多行文本输入，发送按钮。
- [x] 消息列表: FlatList 虚拟化长列表，自动滚动到底部。

### 结构化交互与权限审查（Questionnaire / Permissions）
- [x] 收到 Agent 权限确认请求时，弹出底部模态卡片（Bottom Sheet）。
- [x] 支持单选、多选选项点击与即时提交，回传给电脑端。
- [x] 文件操作确认（创建/修改/删除）的专用审批卡片。

### 工作区辅助面板
- [x] 抽屉式侧边栏（Drawer）查看工作区文件目录树（只读）。
- [x] 查看实时终端运行日志流（Terminal Output Log）。
- [x] 连接状态栏: 顶部常驻显示连接状态、延迟、电脑端工作区路径。

### APK 导出与自动更新
- [x] 使用 Expo EAS Build 生成 standalone APK（不依赖 Google Play）。
- [x] 集成 expo-updates: App 启动时检查 OTA 更新，有新版本自动下载并在下次启动时应用。
- [x] 更新检查地址指向自建 Relay Server 或 GitHub Releases 静态托管。

### 离线与异常处理
- [x] 网络断开时显示离线提示横幅，自动重连（指数退避）。
- [x] WebSocket 断连后保留本地聊天历史，重连后可继续查看。
- [x] App 切到后台时维持 WebSocket 连接（Android 后台服务），回到前台时刷新状态。

## Non-Goals
- 不在移动端内置完整本地编译器或重型代码编辑器（如 Monaco），移动端定位于会话交互、监控、审批与轻量查看。
- 不发布到 Google Play / App Store，通过 APK 侧载分发。
- 不支持 iOS（初期仅 Android APK，后续可通过 Expo 扩展到 iOS）。

## Technical Notes
- 项目位置: `mobile/` 目录（项目根目录下）。
- 技术栈: React Native + Expo SDK 52+, TypeScript, expo-router (文件系统路由)。
- 共享类型: 从 `relay/src/types.ts` 复制或通过 npm workspace 共享 JSON-RPC / 控制帧类型定义。
- UI 组件库: React Native Paper 或 NativeBase（视开发速度选择）。
- 构建: `eas build --platform android --profile production` 产出 APK。
- OTA: `expo-updates` 配合 EAS Update 或自托管更新清单。

## Directory Structure
```
mobile/
├── app.json              # Expo 配置
├── eas.json              # EAS Build 配置
├── package.json
├── tsconfig.json
├── app/                  # expo-router 文件系统路由
│   ├── _layout.tsx       # 根布局（导航容器）
│   ├── index.tsx         # 启动/登录页
│   ├── login.tsx         # 登录页
│   ├── register.tsx      # 注册页
│   ├── pair.tsx          # 配对码输入页
│   ├── chat.tsx          # 核心对话工作台
│   └── settings.tsx      # 服务器地址配置
├── components/
│   ├── ChatHeader.tsx     # 顶栏（项目/模型/连接状态）
│   ├── ConversationRow.tsx# 对话行渲染分发（用户气泡/正文/思考/工具组）
│   ├── MarkdownText.tsx   # Markdown 渲染（自绘表格与代码块）
│   ├── ToolCallGroup.tsx  # 连续工具调用折叠成一行
│   ├── ThinkingBlock.tsx  # 思考过程折叠块
│   ├── PermissionCard.tsx # 权限审批卡片
│   ├── overlays.tsx       # 左侧滑出抽屉 / 底部滑出面板
│   └── icons.tsx          # 纯 View 绘制的图标（禁用 emoji）
├── services/
│   ├── api.ts             # HTTP API 调用
│   ├── websocket.ts       # WebSocket 连接管理
│   ├── conversation.ts    # 消息组装与渲染单元切分
│   └── storage.ts         # 本地持久化
├── theme.ts               # 全局设计令牌（色板/圆角/间距）
└── types/
    └── index.ts           # 类型定义（与 relay 对齐）
```

## Acceptance Criteria
- [x] 在 Android 手机上安装 APK，打开 App 能看到登录页面。
- [x] 登录后输入电脑上显示的 4 位配对码，3 秒内完成握手并进入工作台。
- [x] 手机发送提示词，页面能实时流畅打字显示 Agent 的回答与代码块。
- [x] 遇到敏感命令或问卷时，手机端能弹出单选/确认卡片并提交裁决。
- [x] App 布局在主流 Android 手机下无溢出、输入法虚拟键盘弹起无遮挡。
- [x] eas build 能成功导出可安装的 APK 文件。
- [x] expo-updates 能检测到新版本并自动下载应用。
