---
status: complete
created: 2026-07-20
priority: high
tags:
- gui,ux,component
created_at: 2026-07-20T07:40:41Z
updated_at: 2026-07-20T07:48:42.131820300Z
completed_at: 2026-07-20T07:48:42.131820300Z
transitions:
- status: in-progress
  at: 2026-07-20T07:46:30.265845600Z
- status: complete
  at: 2026-07-20T07:48:42.131820300Z
---

# Tour 步骤叠加层组件

## 概述

提供通用的 step-by-step 引导叠加层组件，通过 CSS spotlight mask 高亮指定 UI 区域，配合浮动卡片展示步骤说明。不依赖第三方库，纯 CSS/React 实现。

## 需求

- [x] 新增 `TourOverlay` 组件（`components/TourOverlay.tsx`）：接收步骤列表，按索引渲染 spotlight + 浮动卡片
- [x] Spotlight 实现：给目标元素加 `data-tour-target` 属性，overlay 用 CSS clip-path + backdrop-filter 创建蒙版遮罩
- [x] 浮动卡片：步骤标题、说明文字、快捷键提示（可选）
- [x] 导航控件：上一步 / 下一步 / 跳过
- [x] 步骤进度指示：圆点或步骤条
- [x] 动画：spotlight 切换平滑过渡（300ms ease）
- [x] zIndex 管理：overlay 始终最顶层（高于 modal、tooltip）
- [x] `useTour` hook（`hooks/useTour.ts`）：封装当前步骤、前进/后退/完成/跳过、状态持久化
- [x] i18n 集成：步骤文案全部走 `t()` 函数

## 非目标

- 不处理具体业务步骤内容（由各引导场景传入）
- 不包含 Tooltips 气泡组件（另有 spec 覆盖）