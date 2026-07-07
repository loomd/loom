---
status: in-progress
created: 2026-07-07
priority: high
tags:
- gui
- react
- refactor
created_at: 2026-07-07T15:34:46.045992400Z
updated_at: 2026-07-07T15:34:51.214954300Z
transitions:
- status: in-progress
  at: 2026-07-07T15:34:51.214954300Z
---

# SettingsPage 解耦重构

## Overview
SettingsPage.tsx 当前 3522 行，包含 4 个子标签页（General/CLI Tools/Env/Libs）和 3 个内联模态框（CliToolConfig/GlobalSkill/GlobalDoc），全部耦合在一个文件中。将其按功能拆分为独立的页面组件和 UI 组件，SettingsPage 降级为薄壳路由层。

## Requirements
- [ ] 提取 WindowControlButtons 到 components/WindowControlButtons.tsx
- [ ] 提取 General 标签页到 pages/settings/GeneralSettingsTab.tsx
- [ ] 提取 CLI Tools 标签页到 pages/settings/CliToolsTab.tsx  
- [ ] 提取 Library 标签页到 pages/settings/LibsTab.tsx
- [ ] 提取 CliToolConfigModal 到 components/CliToolConfigModal.tsx
- [ ] 提取 GlobalSkillModal 到 components/GlobalSkillModal.tsx
- [ ] 提取 GlobalDocModal 到 components/GlobalDocModal.tsx
- [ ] SettingsPage.tsx 降级为仅管理标签切换和 props 分发的薄壳
- [ ] EnvVarsPage 保持原样不变（已在独立文件）
- [ ] 所有现有 props 接口保持不变
- [ ] 编写组件单元测试验证解耦后功能正确

## Non-Goals
- 不改动 EnvVarsPage（已在独立文件中）
- 不改动后端 Rust 代码
- 不改动数据模型或 API 签名
- 不改动 i18n 字典或 Toast 接口

## Acceptance Criteria
- [ ] SettingsPage.tsx 从 3522 行降低到 <300 行
- [ ] 拆分的每个组件可独立导入和测试
- [ ] 所有现有功能和交互保持不变（主题切换、字体、语言、工具管理、技能库等）
- [ ] 构建通过：npm run build 无错误
- [ ] Lint 通过：npm run lint 无错误
- [ ] 单元测试覆盖每个新组件的渲染和核心交互