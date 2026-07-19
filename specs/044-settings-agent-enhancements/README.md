---
status: planned
created: 2026-07-19
priority: high
tags:
- gui
- tray
- agent
- settings
- frontend
created_at: 2026-07-19T16:48:32.837191Z
updated_at: 2026-07-19T16:48:32.837191Z
---

# 设置与 Agent 管理增强

## 概述

对设置页面、系统托盘和 Agent 管理模块进行一系列增强和修复：设置页顶栏支持拖拽窗口、系统托盘新增最大/最小化选项、Agent 管理支持删除 AI（非 CLI）、修复增删 Agent 不实时刷新的问题、优化 Agent/CLI 列表性能、精简默认 Agent 白名单。

## 需求

### 1. 设置页顶部 Tab 支持拖拽窗口
- [ ] 设置页面顶部标签栏区域（非具体标签内容）可充当窗口拖拽手柄（drag region）
- [ ] 仅在非最大化窗口时生效
- [ ] 符合 Tauri `data-tauri-drag-region` 规范或自定义 mousedown/mousemove 方案
- [ ] 不影响标签切换点击事件（需区分拖拽 vs 点击）

### 2. 系统托盘新增最大化 / 最小化
- [ ] 托盘右键菜单增加「最大化」「最小化」选项
- [ ] 窗口已最大化时「最大化」项置灰或隐藏，反之亦然
- [ ] 通过 Tauri window API 切换窗口状态
- [ ] 与现有「显示/隐藏」逻辑协调

### 3. Agent 管理支持删除 AI
- [ ] Agent 管理页面中，AI Agent 卡片/条目旁增加删除按钮
- [ ] 删除的是 AI Agent（移除配置文件/注册信息），而非删除对应 CLI 工具
- [ ] 删除前弹出确认对话框
- [ ] 删除操作成功后同步更新本地存储

### 4. 修复增删 Agent 后不实时刷新
- [ ] 添加新 Agent 后列表立即显示新条目（无需手动刷新）
- [ ] 删除 Agent 后列表立即移除对应条目
- [ ] 确认当前刷新机制缺陷根因（state 未更新 / 未触发 re-render / 未回写 storage）
- [ ] 修复后确保增删操作触发 UI 更新

### 5. 优化列表性能：不扫描，仅追踪已有配置
- [ ] Agent 列表不再执行全量 PATH 扫描
- [ ] 仅显示已有配置文件/存储中注册的 Agent
- [ ] CLI 列表仅显示已有模板配置的工具（不扫描发现新 CLI）
- [ ] 移除扫描按钮或将其语义改为「刷新显示已有条目」
- [ ] 消除扫描带来的性能抖动和列表闪烁

### 6. 调节默认 Agent 白名单
- [ ] 默认 Agent 列表严格按 name 匹配以下白名单：
  - `omp`, `pi`, `claude`, `opencode`, `codex`, `gemini`, `agy`, `grok`, `copilot`, `cursor`, `aider`, `windsurf`
- [ ] 移除默认列表中的 `swe-agent`, `langchain`, `vibe` 及其他非白名单条目
- [ ] 用户自行添加的 Agent 不受此限制
- [ ] 白名单匹配逻辑为严格字符串相等（非模糊/包含匹配）

## 非目标
- 不修改 CLI 工具的删除逻辑（与 AI Agent 删除分离）
- 不涉及 Agent 进程状态监控（spec 042 已完成）
- 不改动后端 Rust 核心数据模型（若无必要）
- 不新增 PATH 扫描相关功能

## 验收标准
- [ ] 设置页顶栏可拖拽窗口，标签切换不受影响
- [ ] 系统托盘右键可最大化/最小化窗口
- [ ] Agent 管理可删除 AI Agent，不影响 CLI 工具
- [ ] 增删 Agent 后列表立即刷新
- [ ] Agent/CLI 列表不再触发扫描，仅显示已有条目
- [ ] 默认 Agent 白名单生效：仅 omp/pi/claude/opencode/codex/gemini/agy/grok
- [ ] 构建通过：npm run build 无错误
- [ ] Lint 通过：npm run lint 无错误