import React, { Suspense } from 'react';
import { TerminalPlaceholder } from './TerminalPlaceholder';
import { SplitGrid } from './SplitGrid';
import type { ConsoleTab, GridLayout } from '../hooks/useTabs';
import { gridCellAreas, gridCellCount, gridDims, layoutPreview } from '../hooks/useTabs';
import { computeCollapsedBorders } from '../utils';

const TerminalTab = React.lazy(() => import('./TerminalTab').then(m => ({ default: m.TerminalTab })));

interface TerminalPanelProps {
  terminals: ConsoleTab[];
  terminalSlots?: (string | null)[];
  activeTabId: string;
  layoutMode: GridLayout | null;
  showGrid: boolean;
  isVisible: boolean;
  theme?: 'dark' | 'day' | 'gray';
  fontSize?: string | number;
  onAddTerminal?: (targetSlotIndex?: number) => void;
  onPaneFocus?: (tabId: string) => void;
  projectId?: string;
  shellBorderEnabled?: boolean;
  shellBorderColor?: string;
  shellBorderWidth?: string;
}

export function TerminalPanel({ terminals, terminalSlots, activeTabId, layoutMode, showGrid, isVisible, theme, fontSize, onAddTerminal, onPaneFocus, projectId, shellBorderEnabled, shellBorderColor, shellBorderWidth }: TerminalPanelProps) {
  const dims = showGrid && layoutMode ? gridDims(layoutMode) : null;
  const areas = showGrid && layoutMode ? (gridCellAreas(layoutMode) ?? layoutPreview(layoutMode).areas) : null;
  const cellCount = dims ? gridCellCount(layoutMode!) : 0;

  const activeSlots: (ConsoleTab | null)[] = React.useMemo(() => {
    if (!dims) return [];
    if (terminalSlots && terminalSlots.length === cellCount) {
      const slottedTabs = terminalSlots.map(id => (id ? terminals.find(t => t.id === id) ?? null : null));
      const slottedIds = new Set(slottedTabs.filter((t): t is ConsoleTab => t !== null).map(t => t.id));
      const unslotted = terminals.filter(t => !slottedIds.has(t.id));
      let unslottedIdx = 0;
      return slottedTabs.map(tab => {
        if (tab) return tab;
        if (unslottedIdx < unslotted.length) {
          return unslotted[unslottedIdx++];
        }
        return null;
      });
    }
    return Array.from({ length: cellCount }, (_, i) => terminals[i] ?? null);
  }, [dims, terminalSlots, cellCount, terminals]);

  const visibleTerminals = dims
    ? activeSlots.filter((t): t is ConsoleTab => t !== null)
    : terminals.filter(t => t.id === activeTabId);

  const effectiveFocusTabId = visibleTerminals.some(t => t.id === activeTabId)
    ? activeTabId
    : (visibleTerminals[0]?.id ?? null);

  const isMultiSplit = !!(showGrid && dims);

  const renderTerminal = (tab: ConsoleTab, visible: boolean, isTabFocused: boolean, borderStyle?: React.CSSProperties) => (
    <Suspense fallback={<TerminalPlaceholder />}>
      <TerminalTab
        sessionId={tab.id}
        cwd={tab.cwd}
        command={tab.command}
        args={tab.args}
        env={tab.env}
        initialCommand={tab.initialCommand}
        isVisible={isVisible && visible}
        isFocused={isVisible && visible && isTabFocused}
        onFocus={() => onPaneFocus?.(tab.id)}
        theme={theme}
        fontSize={fontSize}
        borderWidth={shellBorderWidth}
        borderStyle={borderStyle}
      />
    </Suspense>
  );

  // 保持所有存在的终端在同一个单一列表中渲染（key={tab.id} 始终稳定在同一层级），
  // 避免在分屏网格、单屏模式或不同槽位布局切换时发生 React Keyed 卸载与销毁重建。
  const terminalPanes = terminals.map((tab) => {
    if (dims) {
      const slotIdx = activeSlots.findIndex(s => s?.id === tab.id);
      const isSlotted = slotIdx !== -1;
      const areaName = isSlotted && areas ? String.fromCharCode(97 + slotIdx) : undefined;
      const isTabFocused = isSlotted && tab.id === effectiveFocusTabId;
      const appliedBorderStyle = isMultiSplit && isSlotted && shellBorderEnabled && areaName
        ? (computeCollapsedBorders(areaName, areas ?? '"a"', activeSlots, shellBorderColor || '#8b5cf6', shellBorderWidth || '1px') as React.CSSProperties)
        : undefined;

      return (
        <div
          key={tab.id}
          data-testid={`pane-${tab.id}`}
          onClick={() => { if (isSlotted) onPaneFocus?.(tab.id); }}
          style={{
            display: isSlotted ? 'flex' : 'none',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: isMultiSplit ? 'visible' : 'hidden',
            backgroundColor: '#121214',
            gridArea: areaName,
          }}
        >
          {renderTerminal(tab, isSlotted, isTabFocused, appliedBorderStyle)}
        </div>
      );
    }

    const isTabVisible = tab.id === activeTabId;
    const isTabFocused = isTabVisible && tab.id === effectiveFocusTabId;

    return (
      <div
        key={tab.id}
        data-testid={`pane-${tab.id}`}
        onClick={() => { onPaneFocus?.(tab.id); }}
        style={{
          display: isTabVisible ? 'flex' : 'none',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: '#121214',
          flex: 1,
        }}
      >
        {renderTerminal(tab, isTabVisible, isTabFocused)}
      </div>
    );
  });

  // 在分屏模式下，如果有空槽位，渲染对应的占位 "+ 新派生" 按钮
  const emptyPanes = dims
    ? activeSlots.map((tab, slotIdx) => {
        if (tab !== null) return null;
        const areaName = areas ? String.fromCharCode(97 + slotIdx) : undefined;
        return (
          <div
            key={`empty-${slotIdx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              backgroundColor: '#121214',
              gridArea: areaName,
            }}
          >
            <button
              onClick={() => onAddTerminal?.(slotIdx)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                borderRadius: 'var(--radius-sm, 6px)',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-elevated, #18181b)',
                border: '1px dashed var(--border-subtle, #3e3e42)',
                color: 'var(--text-tertiary, #71717a)',
                userSelect: 'none',
              }}
            >
              + 新派生
            </button>
          </div>
        );
      }).filter(Boolean)
    : [];

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: (showGrid || terminals.some(t => t.id === activeTabId)) ? 'flex' : 'none',
      flexDirection: 'column',
      backgroundColor: '#121214',
      boxSizing: 'border-box',
      overflow: 'hidden',
      padding: (showGrid && dims) ? '0 1px 0 0' : 0,
    }}>
      <SplitGrid cols={dims?.cols ?? 1} rows={dims?.rows ?? 1} areas={areas ?? '"a"'} grid={!!dims} layoutKey={layoutMode} projectId={projectId}>
        {terminalPanes}
        {emptyPanes}
      </SplitGrid>
    </div>
  );
}
