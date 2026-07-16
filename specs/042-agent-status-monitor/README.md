---
status: planned
created: 2026-07-16
priority: high
tags:
- gui
- agent
- backend
- frontend
created_at: 2026-07-16T16:38:20.238409100Z
updated_at: 2026-07-16T16:38:20.238409100Z
---

# AI Agent 状态监控

## 概述\n\n当前 Loom 在侧边栏启动 AI Agent（如 OpenCode、Claude Code 等）后，无法获知其实时运行状态（思考中、执行工具、空闲、完成、出错），用户只能通过观察终端输出来推测，体验割裂。\n\n本 spec 要求通过读取不同 AI Agent 的本地 session 文件（会话记录），提取当前活跃会话的状态信息，在 Loom UI 中实时展示 Agent 的运行状态。\n\n## 需求\n\n### 1. 适配层抽象\n- [ ] 定义统一的状态枚举 AgentStatus: Thinking | Running | Done | Error | Interrupted | Idle | Offline\n- [ ] 设计适配器 trait AgentStatusAdapter，每种 AI Agent 实现一个适配器\n- [ ] 适配器通过读取 Agent 持久化的 session 文件来推断状态，不侵入 Agent 进程\n- [ ] 注册机制：按 Agent 类型选择对应适配器\n\n### 2. OpenCode 适配器\n- [ ] 定位当前活跃 session：读取 ~/.local/share/opencode/sessions/ 下最新的 session JSON 文件\n- [ ] 解析 session 文件中的消息记录\n- [ ] 根据最后一条消息的 role/status 判断状态\n- [ ] 15s 无更新且为 Running → Stale(Idle)\n\n### 3. 其他 Agent 适配器（预留）\n- [ ] Claude Code 适配器（JSONL 会话日志）\n- [ ] Codex CLI 适配器\n- [ ] 可插拔，新增 Agent 只需新实现一个 adapter\n\n### 4. 前端状态展示\n- [ ] ProjectsPage 侧边栏中已启动的 Agent 显示实时状态指示灯\n- [ ] 状态颜色: Thinking=蓝, Running=绿脉冲, Done=绿静, Error=红, Interrupted=橙, Idle=灰, Offline=无\n- [ ] 鼠标悬停显示状态详情文本\n- [ ] 轮询频率: 活跃时 1s/次，Idle/Offline 时降为 5s/次\n\n### 5. Tauri 后端轮询\n- [ ] 新增 Tauri 命令 poll_agent_status 返回当前状态\n- [ ] 轮询在独立线程中执行，不阻塞主线程\n- [ ] 缓存 session 文件解析结果，避免频繁读盘\n- [ ] Agent 进程退出后自动停止轮询，状态置为 Offline\n\n## 非目标\n\n- 不通过 ACP 协议或 PTY 输出解析获取状态\n- 不修改 Agent 的 session 文件（只读读取）\n- 不依赖 SQLite 数据库文件\n- 不支持远程 Agent 或 SSH 会话\n- 不支持 Agent 内部详细进度（如具体工具调用参数）\n\n## 验收标准\n\n- OpenCode 思考时显示蓝色 Thinking 状态\n- OpenCode 执行工具时显示绿色脉冲 Running 状态\n- OpenCode 回复完成时显示绿色 Done 状态\n- OpenCode 出错时显示红色 Error 状态\n- Agent 退出后状态自动变为 Offline\n- 新增 Agent 适配器只需实现一个 trait\n- 轮询不造成 UI 卡顿或高 CPU 占用