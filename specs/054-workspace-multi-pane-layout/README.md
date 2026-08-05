---
status: complete
created: 2026-08-05
priority: medium
tags:
- gui
- terminal
- layout
- grid
depends_on:
- 027-vertical-split-dual-view
created_at: 2026-08-05T07:37:44.197583100Z
updated_at: 2026-08-05T07:57:38.034518700Z
completed_at: 2026-08-05T07:57:38.034518700Z
transitions:
- status: in-progress
  at: 2026-08-05T07:46:39.145131600Z
- status: complete
  at: 2026-08-05T07:57:38.034518700Z
---

# Workspace Multi-Pane Layout 多开网格布局

## Overview

当前 Loom 工作区仅支持双开(横向/竖向各 50%),且布局按钮为三态循环。本规范将双开升级为预设网格布局(最高 3x3),通过右上角"多开"按钮弹出布局选择器,支持横向2、竖向2、横向3、竖向3、2x2、2x3、3x2、3x3 共 8 种布局。终端按 tab 栏顺序自动填充 pane,拖动 tab 排序后页面自动重排。

## Requirements

- [x] 右上角布局按钮改为"多开"入口,点击弹出 popup 布局选择器(替代现有三态循环按钮)
- [x] 选择器提供 8 种预设:横向2、竖向2、横向3、竖向3、2x2、2x3、3x2、3x3,暂不支持超过 3x3
- [x] 选中布局后按 tab 栏中 terminal 的顺序从左到右、从上到下填充 pane
- [x] 拖动 tab 改变顺序后,网格自动按新顺序重排
- [x] terminal 数超过格子数:网格只显示前 N 个;点击其余 terminal tab 临时退出网格单屏聚焦,再点击恢复网格(保留现有交互)
- [x] terminal 数不足格子数:空 pane 显示占位符
- [x] 仅 terminal 类型参与平铺;editor/overview 标签点击后退出网格单屏显示
- [x] 移除 TerminalPanel 中 `idx < 2` 硬编码,网格尺寸按布局行列计算
- [x] 布局模式状态从 `single|horizontal|vertical` 重构为布局描述(如 `2x2` 或 null)
- [x] 新增 i18n 文案(布局选择器标题、各布局名称)

## Non-Goals

- 不实现 pane 手动拖动调大小(resize)
- 不实现任意递归分割(tmux 式 split tree)
- 不支持 3x3 以上布局
- 不实现拖动 tab 到特定 pane(仅 tab 栏内排序)

## Technical Notes

- 状态:useTabs.ts 的 layoutMode 改为 `null | '2x1' | '1x2' | '3x1' | '1x3' | '2x2' | '2x3' | '3x2' | '3x3'`,语义为 cols x rows;`GRID_LAYOUTS`/`gridDims`/`gridCellCount` 工具函数同样在 useTabs.ts 导出
- TerminalPanel.tsx 网格渲染:CSS grid(`gridTemplateColumns/rows: repeat(N, 1fr)`)+ 1px gap 分隔线;空位渲染"新建终端"占位按钮;超出格子数的 terminal 以 `display:none` 保持挂载(会话保活)
- LayoutSelector.tsx:新建组件,按钮 + 绝对定位 popup(9 宫格小预览),点击外部/Esc 关闭
- ProjectWorkspace.tsx:布局按钮改为 popup(绝对定位浮层),点击外部关闭;`pendingGridMode` 类型泛化为 `GridLayout | null`
- 与 spec 027(vertical-split-dual-view)功能重叠,027 已 complete,本 spec 为其升级替代

## Acceptance Criteria

- 8 种布局均可选中并正确渲染
- 3 个 terminal 选 2x2:前 3 格显示终端,第 4 格为占位符
- 5 个 terminal 选 2x2:网格只显示前 4 个,第 5 个 tab 点击后单屏聚焦,再点回恢复网格
- 拖动 tab 顺序后网格 pane 顺序同步变化
- 切换回单屏/关闭最后一个额外终端时布局状态正确退出