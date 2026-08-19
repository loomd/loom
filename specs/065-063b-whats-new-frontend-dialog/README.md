---
status: complete
created: 2026-08-19
priority: high
tags:
- gui frontend updater
parent: 063-update-whats-new-notification
created_at: 2026-08-19T08:19:23.452196300Z
updated_at: 2026-08-19T08:27:23.835910600Z
completed_at: 2026-08-19T08:27:23.835910600Z
transitions:
- status: complete
  at: 2026-08-19T08:27:23.835910600Z
---

# What's New：前端启动对比与弹窗展示

## Overview

前端在启动时对比当前应用版本与后端记录的「上次运行版本」：若刚完成更新，拉取对应版本 whats-new 内容并弹出弹窗展示；关闭后回写新版本，保证只弹一次。

## Requirements

### 版本对比逻辑
- [x] 启动时并行获取 `getVersion()` 与后端 `get_last_version()`
- [x] 触发语义：无记录 → 不弹，直接回写当前版本；记录 < 当前 → 弹窗；记录 >= 当前 → 不弹
- [x] 聚合语义：弹窗展示 (last_version, current_version] 区间内所有版本内容，跨版本更新时逐版本展示
- [x] dev 调试：`LOOM_FORCE_WHATS_NEW` 生效时跳过对比、展示全部版本内容（预览下个版本 md）
- [x] 弹窗关闭（含用户主动关闭）后调用 `set_last_version(current)` 防重复

### What's New 弹窗组件
- [x] 新增居中 modal 组件（复用现有弹窗样式变量，如 `--bg-modal`、`--border-subtle`、`--radius-md`）
- [x] 展示版本号标题 + markdown 内容 + 关闭按钮
- [x] 极简 markdown 渲染：标题（`#`/`##`）、列表（`-`）、粗体（`**`）、代码块（```` ``` ````）、空行分段；不支持的不渲染样式（纯文本降级）
- [x] i18n：中英文文案 key（标题、关闭按钮等）加入 I18nContext

### 测试
- [x] 组件测试：弹窗渲染内容、关闭回调、markdown 渲染器用例（WhatsNewDialog.test.tsx，6 用例）
- [x] 对比逻辑单测（mock getVersion / getLastVersion）
- [x] 全量验证：前端 build / test / lint（162 用例全过）

## Non-Goals

- 不引入 react-markdown 等新依赖（极简自写渲染器，语法子集见上）
- 不改动 UpdateToast 与既有更新检查链路
- 不在设置页新增"查看历史 What's New"入口

## Technical Notes

- 集成点：`App.tsx` 挂载 What's New 弹窗状态，或新建 `useWhatsNew` hook（参考 `useUpdateChecker.ts` 风格）
- markdown 内容由用户维护于 `crates/gui/src-tauri/whats-new/<version>.md`
- API 桥接见 `api.ts`，新增 `getLastVersion` / `setLastVersion` / `getWhatsNew` 三个 invoke 封装

## Acceptance Criteria

- [x] 更新后重启自动弹出一次，关闭后不再重复（逻辑已实现，待用户本地 debug 实机验证）
- [x] 全新安装不弹（lastVersion 为 None 时不触发，逻辑已实现）
- [x] md 中的标题/列表/粗体/代码块渲染正确（组件测试覆盖）
- [x] 本地 debug（LOOM_FORCE_WHATS_NEW=1）可强制弹出验证内容（command 已实现，待用户实机验证）
- [x] 前端 build / test / lint 全部通过
