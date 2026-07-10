---
status: complete
created: 2026-07-09
priority: high
tags:
  - gui
  - react
  - error-handling
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-10T10:00:00Z
completed_at: 2026-07-10T10:00:00Z
transitions:
  - status: in-progress
    at: 2026-07-09T12:00:00Z
  - status: complete
    at: 2026-07-10T10:00:00Z
---

# Error Boundary & 错误处理增强

## Overview
整个前端应用零 Error Boundary，任何组件抛出未捕获异常直接白屏。同时存在多处 `.catch(() => {})` 静默吞错误模式（主题/字体/配置加载失败），用户无任何反馈。此 spec 系统性地建立错误恢复层级。

## Requirements
- [x] 创建 `ErrorBoundary` 组件（class component，捕获 `componentDidCatch` + `getDerivedStateFromError`）
- [x] 在 `main.tsx` 的 `<App />` 外层包裹根级 ErrorBoundary，渲染"出错了，点击重试" fallback UI
- [x] 在侧边栏/主内容区边界额外包裹 ErrorBoundary（隔离故障区域，不影响另一侧）
- [x] 全局搜索替换 `.catch(() => {})` 模式，改为至少 `console.error` + toast 提示用户
- [x] 具体清理目标（共约 6 处）：
  - `App.tsx` 主题加载失败的 catch
  - `App.tsx` 字体加载失败的 catch
  - `GeneralSettingsTab.tsx` 应用版本获取的 catch
  - `GeneralSettingsTab.tsx` 更新间隔设置的 catch
- [x] 对 `window.addEventListener('error', ...)` 处理程序增加用户可见的 toast（目前仅写入 Rust 日志）
- [x] 编写 ErrorBoundary 的单元测试（渲染 fallback、点击重试）

## Non-Goals
- 不改动 Rust 后端错误模型
- 不引入第三方 error tracking 服务（Sentry 等）
- 不重构现有组件的错误抛出方式

## Acceptance Criteria
- [x] 在任意组件中 `throw new Error("test")` 应显示 fallback UI 而非白屏
- [x] 主题/字体加载失败时用户能看到 toast 提示
- [x] 侧边栏崩溃不影响主内容区渲染，反之亦然
- [x] 构建通过：`npm run build` 无错误
- [x] Lint 通过：`npm run lint` 无错误
- [x] ErrorBoundary 单元测试通过
