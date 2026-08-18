---
status: planned
created: 2026-08-17
priority: medium
tags:
- xterm
- dependencies
- upgrade
created_at: 2026-08-17T06:50:45.900939200Z
updated_at: 2026-08-17T06:50:45.900939200Z
---

# xterm 稳定版发布跟进

## 概述

当前 xterm 相关依赖已升级到 beta 版本（@xterm/xterm 6.1.0-beta.302 等），以获得最新的功能和修复。xterm 团队尚未发布包含这些功能的稳定版。本 spec 跟踪 xterm 稳定版的发布，并在稳定版可用时执行升级切换。

## 当前状态

- 2026-08-18: beta 版本存在 bug，相关修改已本地回退，恢复稳定版依赖（@xterm/xterm ^6.0.0、@xterm/addon-fit ^0.11.0、@xterm/addon-web-links ^0.12.0、@xterm/addon-webgl ^0.19.0），等待稳定版发布后再升级
- @xterm/xterm: ^6.0.0 → 6.1.0-beta.302（锁定精确版本）
- @xterm/addon-fit: ^0.11.0 → 0.12.0-beta.299
- @xterm/addon-web-links: ^0.12.0 → 0.13.0-beta.299
- @xterm/addon-webgl: ^0.19.0 → 0.20.0-beta.298

## 需求

- [ ] 跟踪 xterm 各包的 npm 发布，监测稳定版发布
- [ ] 稳定版发布后，验证包含当前 beta 版本的所有功能
- [ ] 升级到稳定版，移除精确版本锁定，使用 ^ 范围
- [ ] 运行全量测试确保无回归
- [ ] 验证终端 IME 输入、WebGL 渲染、Web Links 功能正常

## 非目标

- 不需要主动联系 xterm 维护者
- 不引入新的 xterm 功能

## 验收标准

- 所有 @xterm/* 依赖从 beta 版本切换到稳定版
- 使用 ^ 范围（如 ^6.1.0）而非精确版本
- 终端功能无回归