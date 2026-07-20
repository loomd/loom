# 经验教训记录

## 2026-07-20: React Hooks 导入缺失导致运行时错误

### 现象
前端报 `useEffect is not defined` 运行时错误。

### 原因
在 `SettingsPage.tsx` 第 1 行只导入了 `useState`：
```tsx
import React, { useState } from "react";
```
但代码在第 64 行使用了 `useEffect`，缺少对应的导入。

### 修复
```tsx
import React, { useState, useEffect } from "react";
```

### 经验
1. **添加新 Hook 时必须检查导入列表**：每次在组件中引入新的 React Hook（如 `useEffect`, `useCallback`, `useMemo` 等），必须同步更新 import 语句。
2. **TypeScript 编译可以捕获此类错误**：这种错误在 `npm run build` 或 `npm run lint` 时应该能被检测出来。开发时要确保类型检查通过。
3. **Chrome DevTools 可能不会立即报错**：如果代码被 Vite 的 HMR 热更新，导入缺失会直接导致模块加载失败，页面会白屏。需要检查浏览器控制台和终端日志。
4. **copilot/IDE 自动补全可能遗漏**：AI 辅助编写代码时，有时会忘记同步更新 import 语句，交付前必须检查文件的 import 部分是否完整。

### 相关文件
- `crates/gui/frontend/src/pages/SettingsPage.tsx`