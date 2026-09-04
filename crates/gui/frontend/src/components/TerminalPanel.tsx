import React, { Suspense } from 'react';
import { TerminalPlaceholder } from './TerminalPlaceholder';
import { SplitGrid } from './SplitGrid';
import type { ConsoleTab, GridLayout } from '../hooks/useTabs';
import { gridCellAreas, gridCellCount, gridDims, layoutPreview } from '../hooks/useTabs';

const TerminalTab = React.lazy(() => import('./TerminalTab').then(m => ({ default: m.TerminalTab })));

interface TerminalPanelProps {
  terminals: ConsoleTab[];
  activeTabId: string;
  layoutMode: GridLayout | null;
  showGrid: boolean;
  isVisible: boolean;
  theme?: 'dark' | 'day' | 'gray';
  fontSize?: string | number;
  onAddTerminal?: () => void;
  onPaneFocus?: (tabId: string) => void;
  projectId?: string;
}

export function TerminalPanel({ terminals, activeTabId, layoutMode, showGrid, isVisible, theme, fontSize, onAddTerminal, onPaneFocus, projectId }: TerminalPanelProps) {
  const dims = showGrid && layoutMode ? gridDims(layoutMode) : null;
  const areas = showGrid && layoutMode ? (gridCellAreas(layoutMode) ?? layoutPreview(layoutMode).areas) : null;
  const cellCount = dims ? gridCellCount(layoutMode!) : 0;

  const renderTerminal = (tab: ConsoleTab, visible: boolean) => (
    <Suspense fallback={<TerminalPlaceholder />}>
      <TerminalTab
        sessionId={tab.id}
        cwd={tab.cwd}
        command={tab.command}
        args={tab.args}
        env={tab.env}
        initialCommand={tab.initialCommand}
        isVisible={isVisible && visible}
        theme={theme}
        fontSize={fontSize}
      />
    </Suspense>
  );

  const panes = terminals.map((tab, idx) => {
    const isTabVisible = dims ? idx < cellCount : tab.id === activeTabId;
    return (
      <div key={tab.id} data-testid={`pane-${tab.id}`} onClick={() => { if (dims) onPaneFocus?.(tab.id); }} style={{
        display: isTabVisible ? 'flex' : 'none',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        backgroundColor: '#121214',
        gridArea: areas ? String.fromCharCode(97 + idx) : undefined,
        ...(dims ? {} : { flex: 1 }),
      }}>
        {renderTerminal(tab, isTabVisible)}
      </div>
    );
  });

  const emptyPanes = dims ? Array.from({ length: Math.max(0, cellCount - terminals.length) }, (_, i) => (
    <div key={`empty-${i}`} style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden',
      backgroundColor: '#121214',
      gridArea: areas ? String.fromCharCode(97 + terminals.length + i) : undefined,
    }}>
      <button
        onClick={onAddTerminal}
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
        {panes}
        {emptyPanes}
      </SplitGrid>
    </div>
  );
}
