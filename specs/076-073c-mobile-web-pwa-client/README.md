---
status: planned
created: 2026-10-25
priority: high
tags:
- mobile
- web
- pwa
- client
depends_on:
- 074-073a-relay-server-pairing-protocol
parent: 073-custom-relay-mobile-remote-control
created_at: 2026-10-25T05:29:25.552616100Z
updated_at: 2026-10-25T05:29:25.552616100Z
---

# 076-073c-mobile-web-pwa-client: 手机端自适应 Web / PWA 远程工作台 (Mobile Client)

## Overview
设计并实现一个专为移动端手机浏览器（iOS Safari / Android Chrome）优化的轻量 Web / PWA 远程工作台。用户在手机上打开网页，输入 4 位配对码即可连接电脑上的工作区，享受原生 App 般的丝滑交互体验：支持双向打字对话、Thinking 思考折叠、Markdown 代码高亮、文件树只读浏览、以及工具调用权限/问卷结构化卡片审批。

## Requirements
- [ ] 移动端配对与连接管理:
  - [ ] 极简输入界面: 4 位大号数字验证码输入框，自动聚焦，输入即提交验证。
  - [ ] 本地记忆与自动重连: 利用 localStorage 记录上次配对信息，支持一键重连或重新配对。
  - [ ] PWA 支持: 提供 manifest.json 与快捷图标，支持“添加到手机主屏幕”作为全屏 App 运行。
- [ ] 核心流式对话工作区（Chat View）:
  - [ ] 对接 JSON-RPC 流: 逐字打字机渲染 Agent 回复内容。
  - [ ] 思考状态折叠展开展现（Thinking Process）。
  - [ ] 代码块高亮与一键复制。
- [ ] 结构化交互与权限审查（Questionnaire / Permissions）:
  - [ ] 收到 Agent 权限确认请求时，弹出吸底模态卡片。
  - [ ] 支持单选、多选选项点击与即时提交，回传给电脑端。
- [ ] 移动端工作区辅助面板:
  - [ ] 抽屉式侧边栏查看工作区文件目录树。
  - [ ] 查看实时终端运行日志（Terminal Output Log）。

## Non-Goals
- 不在移动端内置完整本地编译器或重型代码编辑器（如 Monaco），移动端定位于会话交互、监控、审批与轻量查看。

## Technical Notes
- 采用 React 或轻量 Web 体系实现，首屏体积轻巧，确保在移动网络下秒开。

## Acceptance Criteria
- [ ] 在手机端浏览器打开网页，输入电脑上显示的 4 位配对码，3 秒内完成握手并进入工作台。
- [ ] 手机发送提示词，页面能实时流畅打字显示 Agent 的回答与代码块。
- [ ] 遇到敏感命令或问卷时，手机端能弹出单选/确认卡片并提交裁决。
- [ ] 页面在 iOS 和 Android 手机下布局无溢出、输入法虚拟键盘弹起无遮挡。