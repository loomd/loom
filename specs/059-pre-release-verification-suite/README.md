---
status: planned
created: '2026-08-13'
tags:
  - verification
  - qa
  - onboarding
  - cli
  - skill
  - opencode
priority: high
created_at: '2026-08-13T16:19:42.160952600+00:00'
---

# 预发布验证套件：配置引导拖拽 / CLI自动可用 / Skill可用性 / Opencode自动安装

> **Status**: planned · **Priority**: high · **Created**: 2026-08-13

## Overview

预发布前的验证套件，涵盖四项功能验收检查，确保核心用户路径在发布前全部可用。验证日期：2026-08-14（明天）。

## Plan

### 1. 配置引导页顶部可拖拽
- [ ] 打开 Loom GUI，进入设置/配置引导页
- [ ] 验证页面顶部标题栏可拖拽移动窗口（点击 + 按住拖动）
- [ ] 验证拖拽不触发页面内交互（点击按钮、输入框无冲突）
- [ ] 验证在非顶部区域拖拽不受影响

### 2. Loom CLI 安装后自动可用
- [ ] 全新环境安装 loom（cargo install 或发布包）
- [ ] 安装完成无需额外配置，直接在终端运行 `loom --help`
- [ ] 验证 `loom config` 等基本子命令可执行
- [ ] 验证首次运行若配置不存在会自动初始化默认配置（或给出清晰引导）
- [ ] Windows / macOS / Linux 各平台均验证

### 3. loom skill 可用性验证
- [ ] 确认 loom skill 已正确安装到 opencode skill 目录
- [ ] 通过 `loom skill` 命令能列出/管理已注册的 skill
- [ ] 使用 loom skill 配置一个 agent，验证 agent 配置正确写入并生效
- [ ] 验证 skill 的版本化机制（如果有）
- [ ] 验证卸载/更新 skill 的完整流程

### 4. 检测未安装 Opencode 后的安装链路验证
- [ ] 确保当前环境未安装 opencode
- [ ] 通过 loom 检测到 opencode 缺失，触发安装引导
- [ ] 验证安装链路完整执行（下载 → 安装 → 可执行）
- [ ] 安装完成后验证 `opencode` 命令可直接使用
- [ ] 验证 opencode 的 skill 机制可加载 loom skill
- [ ] 验证 opencode + loom skill 配合后 agent 自动配置链路完整
- [ ] 各平台安装链路正常执行

## Test

- [ ] 四项验证全部通过，无任何阻塞问题
- [ ] 若发现问题，记录 issue 并标注优先级
- [ ] 最终汇总验证结果

## Notes

- 此 spec 为纯验证任务，不涉及新功能开发
- 验证发现的功能缺陷应创建新的 bug spec 关联
