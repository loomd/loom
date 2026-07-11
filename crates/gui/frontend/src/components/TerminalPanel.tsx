import React, { Suspense } from 'react';
import { TerminalPlaceholder } from './TerminalPlaceholder';
import type { ConsoleTab } from '../hooks/useTabs';

const TerminalTab = React.lazy(() => import('./TerminalTab').then(m => ({ default: m.TerminalTab })));

interface TerminalPanelProps {
  terminals: ConsoleTab[];
  activeTabId: string;
  layoutMode: 'single' | 'horizontal' | 'vertical';
  showGrid: boolean;
  isVisible: boolean;
  theme?: 'dark' | 'day' | 'gray';
}

export function TerminalPanel({ terminals, activeTabId, layoutMode, showGrid, isVisible, theme }: TerminalPanelProps) {
  const getGridStyle = (): React.CSSProperties => ({
    display: 'flex',
    flexDirection: layoutMode === 'vertical' ? 'column' : 'row',
    gap: '0px',
    width: '100%',
    height: '100%',
  });

  return (
    <div style={{
      ...getGridStyle(),
      flex: 1,
      minHeight: 0,
      paddingRight: '0px',
      backgroundColor: '#121214',
      boxSizing: 'border-box',
      display: (showGrid || terminals.some(t => t.id === activeTabId)) ? 'flex' : 'none'
    }}>
      {terminals.map((tab, idx) => {
        const isTabVisible = showGrid ? (idx < 2) : (tab.id === activeTabId);
        const isTerminalVisible = isVisible && isTabVisible;
        return (
          <div
            key={tab.id}
            style={{
              display: isTabVisible ? 'block' : 'none',
              flex: 1,
              height: layoutMode === 'vertical' ? '50%' : '100%',
              width: layoutMode === 'vertical' ? '100%' : 'auto',
              minWidth: 0
            }}
          >
            <Suspense fallback={<TerminalPlaceholder />}>
              <TerminalTab
                sessionId={tab.id}
                cwd={tab.cwd}
                command={tab.command}
                args={tab.args}
                env={tab.env}
                isVisible={isTerminalVisible}
                theme={theme}
                isTopInVerticalLayout={layoutMode === 'vertical' && idx === 0}
              />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
