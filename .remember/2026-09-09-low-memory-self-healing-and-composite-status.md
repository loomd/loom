# Session: 2026-09-09 低内存渲染进程崩溃自愈与终端状态到项目灯态投影修复

## 背景
本次修改解决了两项影响生产使用与直观状态感知的核心问题：
1. **低内存场景崩溃黑屏**：系统内存紧张时，Windows/Chromium OOM 强杀 WebView2 渲染进程，宿主未监听导致窗口黑屏卡死无响应。
2. **终端灯态传递到项目灯态异常**：当前目录仅有 1 个终端且呈现蓝灯（`waiting`），但项目名称却呈现绿色呼吸灯（`running`）。

---

## 1. WebView2 渲染进程崩溃自愈（ProcessFailed）

### 问题与表现
- 当整机内存严重不足（例如并发运行多个大型 IDE、编译任务或虚拟机）时，操作系统内存管理器与 Chromium OOM 机制会优先强杀非系统关键且内存占用高的子进程，`msedgewebview2.exe`（Renderer 进程）首当其冲。
- Rust 宿主进程 `loom-gui.exe` 和后台 PTY 终端会话依然存活，但由于失去渲染管道输出，窗口画面全黑，且前端 JS 虚拟机死亡无法响应任何点击操作。

### 根因
- Tauri 跨平台抽象层默认未暴露底层的 WebView 进程崩溃事件。
- Loom 宿主启动时未挂载 Windows 底层 WebView2 控制器的 `ProcessFailed` 事件监听，导致渲染子进程退出后无法原地恢复。

### 修复措施
1. **引入与封装**：
   - 在 `crates/gui/src-tauri/Cargo.toml` 中引入 `webview2-com = "0.38"`（Windows 平台依赖）。
   - 在 `crash_shield.rs` 崩溃守护模块中封装 `install_webview_shield`，非 Windows 平台提供透明空实现。
2. **底层事件截获与原生自愈**：
   - 在窗口初始化阶段，通过 `with_webview` 取得 `ICoreWebView2Controller`，挂载 `ProcessFailedEventHandler`。
   - 截获退出事件，过滤掉浏览器核心退出（`BROWSER_PROCESS_EXITED`），对渲染异常退出（`RENDER_PROCESS_EXITED`）、渲染卡死（`RENDER_PROCESS_UNRESPONSIVE`）、GPU 进程退出等，直接调用宿主原生 `core.Reload()` 重建渲染管道并重载页面。
3. **防护与审计**：
   - 增加 5 秒最小自愈重载冷却时间窗（Debounce），杜绝连续 OOM 极端情况下的反复死循环重载。
   - 崩溃信息统一写入 `crash.log` 审计，包含异常类型、uptime 运行时间及进程 PID。

---

## 2. 终端灯态向项目灯态传递的幽灵状态修复

### 问题与表现
- 用户在项目工作区内仅保留一个 opencode 终端，终端 Tab 头部的圆点已正常变为天蓝色静态灯（`waiting`，等待用户输入）。
- 但左侧边栏、底部面板或右侧栏中的项目名称文本依然呈现绿色呼吸灯（`running` 状态动画）。

### 根因分析
1. **分散 Push 机制与漏删隐患**：
   - 原先通过多个独立的 `useEffect` 零散调用 `reportShellStatus(projectId, termId, state)` 向全局 `shellMap` 注入状态。
2. **`agentStateMap` 孤儿记录幽灵复活**：
   - 终端关闭时，虽然部分逻辑尝试从 `shellMap` 移除该终端，但组件内的 `agentStateMap` 从未清理已销毁的终端 ID。
   - 存活终端发生任何状态刷新时，`useEffect` 重新遍历 `Object.entries(agentStateMap)`，将历史终端曾经的 `running` 状态再次上报回全局 `shellMap`。
3. **优先级覆盖**：
   - `useProjectCompositeStates.ts` 计算优先级：`running` (4) > `waiting` (3)。
   - 全局 Map 中残留的幽灵 `running` 强行覆盖了当前真实存活终端的 `waiting`，导致项目灯态被永久锁死在绿色呼吸灯。
4. **初值判定缺陷**：
   - `computeComposite` 原先将初值硬编码为 `"active"` (2)，导致仅有 `idle` (1) 终端时也会被强制提升为 `active`。

### 修复措施
1. **全量快照投影（Snapshot Projection）**：
   - 在 `useProjectCompositeStates.ts` 中新增 `syncProjectShells(projectId, activeShells)`。
   - 废除零散容易漏删的 push 模式，每次状态变动直接以当前真实存活的 `terminals` 列表为唯一真理源，一次性全量覆盖项目的终端状态映射。已关闭终端在快照中直接被物理抹除。
2. **孤儿状态自动回收**：
   - 在 `ProjectWorkspace.tsx` 轮询更新 `agentStateMap` 时，过滤剔除已不存在于当前 `terminals` 列表中的记录。
3. **优先级计算归真**：
   - 移除 `computeComposite` 硬编码初值，纯粹按存活终端中最高优先级判定。单一 `waiting` 终端准确反映为 `waiting`（天蓝静态），彻底消除误判。
