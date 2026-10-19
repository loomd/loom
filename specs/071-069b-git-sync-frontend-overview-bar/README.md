---
status: complete
created: 2026-10-19
priority: high
tags:
- gui
- react
- overview
- git
parent: 069-git-project-sync-manager
created_at: 2026-10-19T13:16:16.001807300Z
updated_at: 2026-10-19T13:26:36.209750200Z
completed_at: 2026-10-19T13:26:36.209750200Z
transitions:
- status: complete
  at: 2026-10-19T13:26:36.209750200Z
---

# 071-069b-git-sync-frontend-overview-bar: 概览页 Git 状态横条组件与交互

## Overview
在工作区概览页（Overview）右侧顶部设计并实现精致美观的紧凑型 Git 状态条组件 GitStatusBar。

## Requirements
- [x] 在项目打开/切换时自动异步拉取 Git 状态
- [x] 展示当前分支名、落后/超前标签（如 ↓3 待拉取）、未提交改动标记
- [x] 提供「检查更新」按钮（刷新触发后端 fetch 检查）
- [x] 当有新提交待更新时高亮显示「一键拉取」按钮
- [x] 拉取中状态（loading spin/禁用按钮）与成功/失败轻提示 Toast
- [x] 适配当前主题风格（dark, day, gray），视觉精致且不占用过多纵向高度（~36-40px）
- [x] 非 Git 项目优雅隐藏或显示轻量提示
