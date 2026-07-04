---
status: complete
created: 2026-07-04
priority: medium
tags:
- gui
- terminal
- layout
- split-view
created_at: 2026-07-04T09:43:58.630830Z
updated_at: 2026-07-04T09:52:41.962807500Z
completed_at: 2026-07-04T09:52:41.962807500Z
transitions:
- status: in-progress
  at: 2026-07-04T09:50:52.303031900Z
- status: complete
  at: 2026-07-04T09:52:41.962807500Z
---



# Vertical Split Dual View

> **Status**: planned · **Priority**: medium · **Created**: 2026-07-04

## Overview

当前Loom桌面应用仅支持横向双开（水平并列）终端视图，用户无法选择竖向双开（垂直堆叠）布局。本规范旨在扩展双开功能，支持横向和竖向两种双开模式，提升多终端操作的灵活性和用户体验。

## Design

### 核心设计思路

1. **布局方向枚举**：将现有的 `isGridLayout` 布尔状态扩展为枚举类型，支持三种模式：
   - `single`：单终端模式（默认）
   - `horizontal`：横向双开（水平并列，现有功能）
   - `vertical`：竖向双开（垂直堆叠，新增功能）

2. **切换按钮交互**：在工具栏添加布局切换按钮，支持循环切换三种模式：
   - 单签 → 双开（横向） → 双开（竖向） → 单签
   - 按钮文案根据当前模式动态显示

3. **布局容器样式**：根据当前模式动态调整 `flexDirection` 属性：
   - 横向双开：`flexDirection: 'row'`（现有）
   - 竖向双开：`flexDirection: 'column'`（新增）

4. **终端容器适配**：在竖向双开模式下，终端容器需要调整高度分配逻辑，确保两个终端面板垂直堆叠且各占50%高度。

### 技术架构

- **状态管理**：在 `ProjectWorkspace.tsx` 中扩展布局状态类型
- **样式计算**：修改 `getGridStyle()` 函数，根据布局模式返回对应的CSS样式
- **按钮交互**：更新工具栏按钮的点击事件处理逻辑
- **终端渲染**：适配竖向双开模式下的终端容器布局

## Plan

- [x] Task 1: 定义布局模式枚举类型
- [x] Task 2: 更新状态管理和切换逻辑
- [x] Task 3: 修改 `getGridStyle()` 函数支持竖向布局
- [x] Task 4: 更新工具栏切换按钮的交互和文案
- [x] Task 5: 适配终端容器在竖向模式下的布局
- [ ] Task 6: 测试验证横向和竖向双开功能

## Test

- [ ] 验证横向双开功能保持正常
- [ ] 验证竖向双开功能正常工作
- [ ] 验证布局切换按钮的交互逻辑
- [ ] 验证终端在两种双开模式下的显示效果
- [ ] 验证单签模式切换回正常工作

## Notes

### 实现细节

1. **布局状态类型定义**：
   ```typescript
   type LayoutMode = 'single' | 'horizontal' | 'vertical';
   ```

2. **状态变量更新**：
   ```typescript
   const [layoutMode, setLayoutMode] = useState<LayoutMode>('single');
   const showGrid = layoutMode !== 'single' && terminals.length > 1;
   ```

3. **样式计算函数**：
   ```typescript
   const getGridStyle = (): React.CSSProperties => {
     return {
       display: 'flex',
       flexDirection: layoutMode === 'vertical' ? 'column' : 'row',
       gap: '0px',
       width: '100%',
       height: '100%',
     };
   };
   ```

4. **切换按钮逻辑**：
   ```typescript
   const toggleLayoutMode = () => {
     setLayoutMode(prev => {
       if (prev === 'single') return 'horizontal';
       if (prev === 'horizontal') return 'vertical';
       return 'single';
     });
   };
   ```

5. **按钮文案显示**：
   ```typescript
   const getLayoutButtonText = () => {
     if (layoutMode === 'single') return '双开';
     if (layoutMode === 'horizontal') return '竖开';
     return '单签';
   };
   ```

### 相关文件

- `crates/gui/frontend/src/pages/ProjectWorkspace.tsx`：主要修改文件
- `crates/gui/frontend/src/index.css`：可能需要添加竖向布局相关样式

### 依赖关系

无外部依赖，可独立实现。
