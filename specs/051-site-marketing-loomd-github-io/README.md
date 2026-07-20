---
status: complete
created: 2026-07-20
priority: high
tags:
- site
- marketing
- astro
- github-pages
created_at: 2026-07-20T07:58:52.181942200Z
updated_at: 2026-07-20T08:06:16.503944600Z
completed_at: 2026-07-20T08:06:16.503944600Z
transitions:
- status: in-progress
  at: 2026-07-20T07:59:19.630914200Z
---

# Loom 宣传站点：site 目录 + GitHub Pages 部署到 loomd.github.io

## Overview

为 loom 创建宣传网站，部署到 https://loomd.github.io。站点源码放在当前项目的 site/ 目录，通过 GitHub Actions 自动构建并推送到 loomd.github.io 仓库。

## Requirements

- [x] 在 GitHub 上创建 loomd/loomd.github.io 空仓库
- [x] 在当前项目新增 site/ 目录，使用 Astro 框架构建宣传站
- [x] 站点包含：Hero 区域（产品名、标语、下载 CTA）、功能特性展示、设计风格符合 loom 品牌
- [x] 编写 .github/workflows/deploy-site.yml：PR 触发时构建验证，push 到 main 时自动部署到 loomd.github.io
- [x] 部署方式：Actions 构建 site/ → 使用 peaceiris/actions-gh-pages 将产物推送到 loomd.github.io 仓库的 main 分支
- [x] 站点启用 GitHub Pages

## Non-Goals

- 不使用现有 crates/gui/frontend/ 的 Tauri 桌面端代码
- 不做文档站（如 VitePress/ReadMe），是宣传/营销类站点

## Technical Notes

- 框架：Astro
- 部署目标：https://loomd.github.io（GitHub Pages 在 loomd.github.io 仓库配置）
- 构建产物推送：通过 Actions peaceiris/actions-gh-pages，使用仓库的 PAT 推送到外部仓库
