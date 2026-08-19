import React, { Suspense } from 'react';
import { TerminalPlaceholder } from './TerminalPlaceholder';
import type { ConsoleTab, GridLayout } from '../hooks/useTabs';
import { gridCellAreas, gridCellCount, gridDims } from '../hooks/useTabs';

const TerminalTab = React.lazy(() => import('./TerminalTab').then(m => ({ default: m.TerminalTab })));

interface TerminalPanelProps {
  terminals: ConsoleTab[];
  activeTabId: string;
  layoutMode: GridLayout | null;
  showGrid: boolean;
  isVisible: boolean;
  theme?: 'dark' | 'day' | 'gray';
  onAddTerminal?: () => void;
  onPaneFocus?: (tabId: string) => void;
}

export function TerminalPanel({ terminals, activeTabId, layoutMode, showGrid, isVisible, theme, onAddTerminal, onPaneFocus }: TerminalPanelProps) {
  const dims = showGrid && layoutMode ? gridDims(layoutMode) : null;
  const areas = showGrid && layoutMode ? gridCellAreas(layoutMode) : null;
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
      />
    </Suspense>
  );

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
      <div className="grid-pane-container" style={{
        flex: 1,
        minHeight: 0,
        display: dims ? 'grid' : 'flex',
        flexDirection: dims ? undefined : 'column',
        gridTemplateColumns: dims ? `repeat(${dims.cols}, 1fr)` : undefined,
        gridTemplateRows: dims ? `repeat(${dims.rows}, 1fr)` : undefined,
        gridTemplateAreas: areas ?? undefined,
        gap: dims ? '1px' : 0,
        backgroundColor: dims ? 'var(--border-subtle, #27272a)' : undefined,
      }}>
        {terminals.map((tab, idx) => {
          const isTabVisible = dims ? idx < cellCount : tab.id === activeTabId;
          const gridArea = areas ? String.fromCharCode(97 + idx) : undefined;
          return (
            <div key={tab.id} data-testid={`pane-${tab.id}`} onClick={() => { if (dims) onPaneFocus?.(tab.id); }} style={{
              display: isTabVisible ? 'flex' : 'none',
              flexDirection: 'column',
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              backgroundColor: '#121214',
              gridArea,
              ...(dims ? {} : { flex: 1 }),
            }}>
              {renderTerminal(tab, isTabVisible)}
            </div>
          );
        })}
        {dims && Array.from({ length: Math.max(0, cellCount - terminals.length) }, (_, i) => (
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
              + 新建终端
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
