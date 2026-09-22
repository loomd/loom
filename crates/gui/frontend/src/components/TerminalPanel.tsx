import React, { Suspense } from 'react';
import { TerminalPlaceholder } from './TerminalPlaceholder';
import { SplitGrid } from './SplitGrid';
import type { ConsoleTab, GridLayout } from '../hooks/useTabs';
import { gridCellAreas, gridCellCount, gridDims, layoutPreview } from '../hooks/useTabs';

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
}

export function TerminalPanel({ terminals, terminalSlots, activeTabId, layoutMode, showGrid, isVisible, theme, fontSize, onAddTerminal, onPaneFocus, projectId }: TerminalPanelProps) {
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

  const renderTerminal = (tab: ConsoleTab, visible: boolean, isTabFocused: boolean) => (
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
      />
    </Suspense>
  );

  let gridPanes: React.ReactNode[];
  if (dims) {
    gridPanes = activeSlots.map((tab, slotIdx) => {
      const areaName = areas ? String.fromCharCode(97 + slotIdx) : undefined;
      if (tab) {
        const isTabFocused = tab.id === effectiveFocusTabId;
        return (
          <div key={tab.id} data-testid={`pane-${tab.id}`} onClick={() => { onPaneFocus?.(tab.id); }} style={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            backgroundColor: '#121214',
            gridArea: areaName,
          }}>
            {renderTerminal(tab, true, isTabFocused)}
          </div>
        );
      }
      return (
        <div key={`empty-${slotIdx}`} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: '#121214',
          gridArea: areaName,
        }}>
          <button
            onClick={() => onAddTerminal?.(slotIdx)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
              fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer',
              backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px dashed var(--border-subtle, #3e3e42)',
              color: 'var(--text-tertiary, #71717a)', userSelect: 'none',
            }}
          >
            + 新派生
          </button>
        </div>
      );
    });
  } else {
    gridPanes = terminals.map((tab) => {
      const isTabVisible = tab.id === activeTabId;
      const isTabFocused = isTabVisible && tab.id === effectiveFocusTabId;
      return (
        <div key={tab.id} data-testid={`pane-${tab.id}`} onClick={() => { onPaneFocus?.(tab.id); }} style={{
          display: isTabVisible ? 'flex' : 'none',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
          overflow: 'hidden',
          backgroundColor: '#121214',
          flex: 1,
        }}>
          {renderTerminal(tab, isTabVisible, isTabFocused)}
        </div>
      );
    });
  }

  // 保留未在网格中展示的终端进程实例，避免状态被销毁
  const hiddenPanes = dims ? terminals.filter(tab => !activeSlots.some(s => s?.id === tab.id)).map(tab => (
    <div key={tab.id} style={{ display: 'none' }}>
      {renderTerminal(tab, false, false)}
    </div>
  )) : [];

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: (showGrid || terminals.some(t => t.id === activeTabId)) ? 'flex' : 'none',
      flexDirection: 'column',
      backgroundColor: '#121214',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <SplitGrid cols={dims?.cols ?? 1} rows={dims?.rows ?? 1} areas={areas ?? '"a"'} grid={!!dims} layoutKey={layoutMode} projectId={projectId}>
        {gridPanes}
        {hiddenPanes}
      </SplitGrid>
    </div>
  );
}
