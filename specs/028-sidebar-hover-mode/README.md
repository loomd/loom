---
status: complete
created: 2026-07-04
priority: medium
tags:
- gui
- sidebar
- ux
- hover
created_at: 2026-07-04T10:28:48.567907700Z
updated_at: 2026-07-04T10:41:41.028853400Z
completed_at: 2026-07-04T10:41:41.028853400Z
transitions:
- status: in-progress
  at: 2026-07-04T10:36:02.422954400Z
- status: complete
  at: 2026-07-04T10:41:41.028853400Z
---



# Sidebar Hover Mode

> **Status**: planned · **Priority**: medium · **Created**: 2026-07-04

## Overview

在窗口右侧添加一个悬浮项目切换侧边栏，鼠标悬浮在右侧边缘时显示，离开时自动隐藏。左侧保留现有的收起展开功能，两个侧边栏独立工作，互不干扰。为全屏模式提供更好的项目切换体验。

## Requirements

- [x] 在窗口右侧添加悬浮项目切换侧边栏
- [x] 右侧侧边栏宽度固定为120px（显示项目名称）
- [x] 项目列表在侧边栏中竖向居中排列
- [x] 鼠标移到窗口右侧边缘（距离边缘5px）时显示右侧侧边栏
- [x] 鼠标离开右侧侧边栏区域后立即隐藏（无延迟）
- [x] 项目名称支持跑马灯效果（过长时自动滚动）
- [x] 点击项目名称切换项目
- [x] 左侧侧边栏保持现有功能不变
- [x] 状态持久化（localStorage）
- [x] 可通过设置开关启用/禁用右侧悬浮侧边栏

## Design

### 双侧边栏架构

```
┌─────────────────────────────────────────────────────────┐
│  左侧侧边栏 (固定/收起)  │  主内容区  │  右侧悬浮侧边栏 │
│  - 项目列表              │            │  - 快速切换项目   │
│  - 设置入口              │            │  - 悬浮显示/隐藏  │
│  - 收起展开功能          │            │                  │
└─────────────────────────────────────────────────────────┘
```

### 右侧侧边栏交互流程

1. **悬浮触发**：鼠标移动到窗口右侧边缘5px区域
2. **显示动画**：侧边栏从右向左滑入（150ms过渡）
3. **悬停反馈**：鼠标悬停在项目名称上时触发跑马灯滚动
4. **点击切换**：点击项目名称立即切换项目
5. **隐藏动画**：鼠标离开侧边栏区域后立即隐藏（150ms过渡）

### 技术实现

1. **状态管理**：
   - `loom_right_sidebar_enabled`: 布尔值，是否启用右侧悬浮侧边栏
   - `loom_right_sidebar_visible`: 布尔值，右侧侧边栏当前是否可见

2. **事件处理**：
   - `onMouseEnterRightTrigger`：鼠标进入右侧触发区域时显示
   - `onMouseLeaveRightSidebar`：鼠标离开右侧侧边栏时立即隐藏
   - `onClickProject`：点击项目名称切换项目

3. **CSS动画**：
   ```css
   .right-sidebar {
     position: fixed;
     right: 0;
     top: 0;
     bottom: 0;
     width: 120px;
     background: var(--bg-card);
     border-left: 1px solid var(--border-subtle);
     transition: transform 150ms ease, opacity 150ms ease;
     overflow-y: auto;
     display: flex;
     flex-direction: column;
     justify-content: center;
   }
   .right-sidebar.hover-hidden {
     transform: translateX(100%);
     opacity: 0;
   }
   .project-item {
     padding: 8px 12px;
     cursor: pointer;
     overflow: hidden;
     font-size: 13px;
     color: var(--text-primary);
     border-radius: 4px;
     margin: 2px 4px;
   }
   .project-item:hover {
     background: var(--bg-elevated);
   }
   .project-item.active {
     background: var(--accent-purple);
     color: white;
   }
   .project-name {
     white-space: nowrap;
     display: inline-block;
   }
   .project-item:hover .project-name {
     animation: marquee 3s linear infinite;
   }
   @keyframes marquee {
     0% { transform: translateX(0); }
     100% { transform: translateX(-100%); }
   }
   ```

4. **布局调整**：
   - 右侧侧边栏使用overlay方式，不占用主内容区空间
   - 宽度固定120px，显示项目名称
   - 项目列表在侧边栏中竖向居中排列
   - 项目名称悬停时触发跑马灯滚动效果

## Plan

- [x] 创建右侧侧边栏组件
- [x] 实现悬浮触发区域
- [x] 实现鼠标悬浮显示/隐藏逻辑
- [x] 添加延迟隐藏机制
- [x] 添加项目列表和切换功能
- [x] 添加状态持久化
- [x] 添加动画效果
- [x] 在设置页面添加开关
- [x] 添加i18n翻译
- [x] 调整主内容区布局

## Test

- [x] 右侧悬浮侧边栏正常显示/隐藏
- [x] 鼠标移到右侧边缘时侧边栏显示
- [x] 鼠标离开后立即隐藏
- [x] 项目名称正确显示，过长时悬停触发跑马灯效果
- [x] 点击项目名称切换项目
- [x] 左侧侧边栏功能不受影响
- [x] 状态在重启后保持
- [x] 动画流畅无卡顿
- [x] 全屏模式下体验良好

## Notes

- 右侧侧边栏只用于项目切换，保持简洁
- 考虑添加"悬浮灵敏度"设置（触发区域宽度）
- 可以添加快捷键快速切换项目
- 需要处理多显示器场景
