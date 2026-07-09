---
status: complete
created: 2026-07-09
priority: medium
tags:
  - gui
  - react
  - performance
created_at: 2026-07-09T00:00:00Z
updated_at: 2026-07-09T00:00:00Z
---

# 代码分割与 Bundle 优化

## Overview
当前所有组件（包括 xterm.js ~200KB 和 Monaco Editor ~5MB）被静态导入打包。终端和文件编辑器仅在特定场景使用（项目工作区），绝大多数用户进入应用时不需加载。通过 `React.lazy` + `Suspense` 实现按需加载，显著减少初始 JS 体积和首屏加载时间。

## Requirements
- [ ] 将 `TerminalTab` 改为动态导入：
  - `const TerminalTab = React.lazy(() => import('./components/TerminalTab'))`
  - 包裹 `<Suspense fallback={<TerminalPlaceholder />}>`
- [ ] 将 `FileEditor` 改为动态导入：
  - `const FileEditor = React.lazy(() => import('./components/FileEditor'))`
  - 包裹 `<Suspense fallback={<EditorPlaceholder />}>`
- [ ] 在 `ProjectWorkspace.tsx` 中应用 lazy 加载到终端和编辑器
- [ ] 提取 `TerminalPlaceholder` 组件（简约 loading 骨架屏，高度匹配终端区域）
- [ ] 提取 `EditorPlaceholder` 组件（简约 loading 骨架屏，高度匹配编辑器区域）
- [ ] 验证 Monaco Editor 的 `@monaco-editor/react` 是否按预期 code-split（需检查其内部加载行为，避免双重加载）
- [ ] 可选评估：将 `RightSidebar` 中的 `GlobalSkillModal` / `GlobalDocModal` 也做懒加载（操作路径更深）

## Non-Goals
- 不做路由级别的 code splitting（当前 SPA 无路由库）
- 不引入 webpack/vite 的 manual chunks 配置（依赖 React.lazy 自然分割）
- 不优化 Rust/Tauri 侧二进制体积

## Acceptance Criteria
- [ ] 应用初始加载时不请求 xterm.js 和 Monaco Editor 的 chunk
- [ ] 打开终端 tab 时才加载 xterm.js chunk（可见 loading 占位）
- [ ] 打开文件编辑器时才加载 Monaco Editor chunk（可见 loading 占位）
- [ ] 终端/编辑器功能正常（交互、样式、xterm addon）
- [ ] `npm run build` 产物应产生多个 JS chunk（而非单个 bundle）
- [ ] 构建通过：`npm run build` 无错误
- [ ] 无功能回归
