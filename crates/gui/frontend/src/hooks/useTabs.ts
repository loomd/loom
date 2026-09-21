import { useState, useCallback } from 'react';
import type { FileEntry } from '../api';
import { useDialog } from '../DialogContext';

export interface ConsoleTab {
  id: string;
  title: string;
  type: 'overview' | 'terminal' | 'editor' | 'agents-skills';
  cwd: string;
  command?: string;
  isOpencode?: boolean;
  opencodeSessionId?: string;
  args?: string[];
  env?: Record<string, string>;
  filePath?: string;
  isDirty?: boolean;
  initialCommand?: string;
}

export type GridLayout = '2x1' | '1x2' | '3x1' | '1x3' | '2x2' | '2x3' | '3x2' | '3x3' | '2+1' | '1+2';

export const GRID_LAYOUTS: readonly GridLayout[] = ['2x1', '1x2', '3x1', '1x3', '1+2', '2+1', '2x2', '2x3', '3x2', '3x3'];

export function isCompositeLayout(layout: GridLayout): boolean {
  return layout === '2+1' || layout === '1+2';
}

export function gridDims(layout: GridLayout): { cols: number; rows: number } {
  if (isCompositeLayout(layout)) return { cols: 2, rows: 2 };
  const [cols, rows] = layout.split('x').map(Number);
  return { cols, rows };
}

export function gridCellCount(layout: GridLayout): number {
  if (isCompositeLayout(layout)) return 3;
  const { cols, rows } = gridDims(layout);
  return cols * rows;
}

export function gridCellAreas(layout: GridLayout): string | null {
  if (layout === '2+1') return '"a c" "b c"';
  if (layout === '1+2') return '"a b" "a c"';
  return null;
}

export function layoutPreview(layout: GridLayout | null): { cols: number; rows: number; areas: string } {
  switch (layout) {
    case null: return { cols: 2, rows: 2, areas: '"a a" "a a"' };
    case '2x1': return { cols: 2, rows: 2, areas: '"a b" "a b"' };
    case '1x2': return { cols: 2, rows: 2, areas: '"a a" "b b"' };
    case '3x1': return { cols: 3, rows: 2, areas: '"a b c" "a b c"' };
    case '1x3': return { cols: 2, rows: 3, areas: '"a a" "b b" "c c"' };
    case '2+1': return { cols: 2, rows: 2, areas: '"a c" "b c"' };
    case '1+2': return { cols: 2, rows: 2, areas: '"a b" "a c"' };
    case '2x2': return { cols: 2, rows: 2, areas: '"a b" "c d"' };
    case '2x3': return { cols: 2, rows: 3, areas: '"a b" "c d" "e f"' };
    case '3x2': return { cols: 3, rows: 2, areas: '"a b c" "d e f"' };
    case '3x3': return { cols: 3, rows: 3, areas: '"a b c" "d e f" "g h i"' };
  }
}

export interface GridSplitLine {
  axis: 'col' | 'row';
  index: number;
  start: number;
  span: number;
}

export interface SplitWeights {
  col: number[];
  row: number[];
}

export function isDefaultSplitWeights(w: SplitWeights | undefined): boolean {
  if (!w) return true;
  return w.col.every(v => v === 1) && w.row.every(v => v === 1);
}

export function splitLines(areas: string): GridSplitLine[] {
  const grid = (areas.match(/"([^"]*)"/g) ?? []).map(s => s.replaceAll('"', '').trim().split(/\s+/));
  const cols = grid[0].length;
  const rows = grid.length;
  const lines: GridSplitLine[] = [];
  for (let c = 0; c < cols - 1; c++) {
    let start = -1;
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] !== grid[r][c + 1]) {
        if (start === -1) start = r;
      } else if (start !== -1) {
        lines.push({ axis: 'col', index: c, start, span: r - start });
        start = -1;
      }
    }
    if (start !== -1) lines.push({ axis: 'col', index: c, start, span: rows - start });
  }
  for (let r = 0; r < rows - 1; r++) {
    let start = -1;
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== grid[r + 1][c]) {
        if (start === -1) start = c;
      } else if (start !== -1) {
        lines.push({ axis: 'row', index: r, start, span: c - start });
        start = -1;
      }
    }
    if (start !== -1) lines.push({ axis: 'row', index: r, start, span: cols - start });
  }
  return lines;
}

function calculateNextSlots(
  prevSlots: (string | null)[],
  count: number,
  newSessionId: string,
  targetSlotIndex?: number
): (string | null)[] {
  const currentSlots: (string | null)[] = Array.from({ length: count }, (_, i) => prevSlots[i] ?? null);
  if (targetSlotIndex !== undefined && targetSlotIndex >= 0 && targetSlotIndex < count) {
    currentSlots[targetSlotIndex] = newSessionId;
    return currentSlots;
  }
  const emptyIdx = currentSlots.findIndex(s => s === null);
  if (emptyIdx !== -1) {
    currentSlots[emptyIdx] = newSessionId;
    return currentSlots;
  }
  return currentSlots;
}

function orderTabsWithSlots(allTabs: ConsoleTab[], slots: (string | null)[]): ConsoleTab[] {
  const overviewTab = allTabs.find(t => t.id === 'overview');
  const termMap = new Map<string, ConsoleTab>();
  for (const t of allTabs) {
    if (t.type === 'terminal') {
      termMap.set(t.id, t);
    }
  }

  const slotted: ConsoleTab[] = [];
  for (const id of slots) {
    if (id && termMap.has(id)) {
      slotted.push(termMap.get(id)!);
      termMap.delete(id);
    }
  }

  const unslotted: ConsoleTab[] = [];
  for (const t of allTabs) {
    if (t.type === 'terminal' && termMap.has(t.id)) {
      unslotted.push(t);
      termMap.delete(t.id);
    }
  }

  const otherTabs = allTabs.filter(t => t.id !== 'overview' && t.type !== 'terminal');

  const result: ConsoleTab[] = [];
  if (overviewTab) result.push(overviewTab);
  result.push(...slotted);
  result.push(...unslotted);
  result.push(...otherTabs);
  return result;
}

export function useTabs(projectRoot: string) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<ConsoleTab[]>([
    { id: 'overview', title: '概览', type: 'overview', cwd: projectRoot }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('overview');
  const [layoutMode, setLayoutModeInternal] = useState<GridLayout | null>(null);
  const [terminalSlots, setTerminalSlots] = useState<(string | null)[]>([]);

  const terminals = tabs.filter(t => t.type === 'terminal');
  const showGrid = layoutMode !== null;

  const setLayoutMode = useCallback((mode: GridLayout | null | ((prev: GridLayout | null) => GridLayout | null)) => {
    setLayoutModeInternal(prevMode => {
      const nextMode = typeof mode === 'function' ? mode(prevMode) : mode;
      if (!nextMode) {
        setTerminalSlots([]);
      } else {
        const count = gridCellCount(nextMode);
        setTerminalSlots(prevSlots => {
          const activeTerminalIds = new Set(tabs.filter(t => t.type === 'terminal').map(t => t.id));
          const nextSlots: (string | null)[] = Array.from({ length: count }, (_, i) => {
            const existing = prevSlots[i];
            return existing && activeTerminalIds.has(existing) ? existing : null;
          });
          const slottedSet = new Set(nextSlots.filter((id): id is string => id !== null));
          const unslotted = tabs.filter(t => t.type === 'terminal' && !slottedSet.has(t.id));
          let unslottedIdx = 0;
          for (let i = 0; i < count; i++) {
            if (!nextSlots[i] && unslottedIdx < unslotted.length) {
              nextSlots[i] = unslotted[unslottedIdx].id;
              unslottedIdx++;
            }
          }
          return nextSlots;
        });
      }
      return nextMode;
    });
  }, [tabs]);

  const handleAddRawTerminal = useCallback((keepGrid = false, initialCmd?: string, targetSlotIndex?: number) => {
    const sessionId = crypto.randomUUID();
    const newTab: ConsoleTab = {
      id: sessionId,
      title: initialCmd ? `Terminal (${initialCmd.split(' ')[0]})` : `Terminal ${terminals.length + 1}`,
      type: 'terminal',
      cwd: projectRoot,
      initialCommand: initialCmd
    };
    if (!keepGrid) {
      setLayoutMode(null);
      setTabs(prev => [...prev, newTab]);
    } else if (layoutMode) {
      const count = gridCellCount(layoutMode);
      setTerminalSlots(prevSlots => {
        const nextSlots = calculateNextSlots(prevSlots, count, sessionId, targetSlotIndex);
        setTabs(prevTabs => orderTabsWithSlots([...prevTabs, newTab], nextSlots));
        return nextSlots;
      });
    } else {
      setTabs(prev => [...prev, newTab]);
    }
    setActiveTabId(sessionId);
  }, [projectRoot, terminals.length, layoutMode, setLayoutMode]);

  const handleCloseTerminal = useCallback(async (id: string, e?: React.MouseEvent): Promise<string | null> => {
    e?.stopPropagation?.();
    const tabToClose = tabs.find(t => t.id === id);
    if (tabToClose?.type === 'editor' && tabToClose.isDirty) {
      const confirmed = await dialog.confirm({ message: '文件有未保存的更改，确定要关闭吗？', danger: true });
      if (!confirmed) return null;
    }
    const filtered = tabs.filter(t => t.id !== id);
    let nextActive: string | null = null;
    if (id === activeTabId) {
      const idx = tabs.findIndex(t => t.id === id);
      if (idx > 0) {
        nextActive = tabs[idx - 1].id;
      } else if (idx < tabs.length - 1) {
        nextActive = tabs[idx + 1].id;
      } else {
        nextActive = filtered[0]?.id ?? 'overview';
      }
    }
    setTerminalSlots(prev => prev.map(s => s === id ? null : s));
    setTabs(filtered);
    if (nextActive) setActiveTabId(nextActive);
    return nextActive;
  }, [activeTabId, dialog, tabs]);

  const handleOpenFile = useCallback((file: FileEntry, cwd: string) => {
    const fileId = file.path;
    setTabs(prev => {
      const alreadyOpen = prev.find(t => t.id === fileId);
      if (alreadyOpen) return prev;
      const newEditorTab: ConsoleTab = {
        id: fileId,
        title: file.name,
        type: 'editor',
        cwd,
        filePath: file.path,
        isDirty: false
      };
      return [...prev, newEditorTab];
    });
    setActiveTabId(fileId);
  }, []);

  const addTab = useCallback((tab: ConsoleTab, targetSlotIndex?: number) => {
    if (tab.type === 'terminal' && layoutMode) {
      const count = gridCellCount(layoutMode);
      setTerminalSlots(prevSlots => {
        const nextSlots = calculateNextSlots(prevSlots, count, tab.id, targetSlotIndex);
        setTabs(prevTabs => orderTabsWithSlots([...prevTabs, tab], nextSlots));
        return nextSlots;
      });
    } else {
      setTabs(prev => [...prev, tab]);
    }
  }, [layoutMode]);

	const removeTabById = useCallback((id: string): string | null => {
		const filtered = tabs.filter(t => t.id !== id);
		let nextActive: string | null = null;
		if (id === activeTabId) {
			const idx = tabs.findIndex(t => t.id === id);
			if (idx > 0) {
				nextActive = tabs[idx - 1].id;
			} else if (idx < tabs.length - 1) {
				nextActive = tabs[idx + 1].id;
			} else {
				nextActive = filtered[0]?.id ?? 'overview';
			}
		}
		setTerminalSlots(prev => prev.map(s => s === id ? null : s));
		setTabs(filtered);
		if (nextActive) setActiveTabId(nextActive);
		return nextActive;
	}, [tabs, activeTabId]);

  const updateTabDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t));
  }, []);

  const moveTab = useCallback((fromId: string, toId: string, after: boolean) => {
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.id === fromId);
      let toIdx = prev.findIndex(t => t.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      if (toIdx > fromIdx) toIdx -= 1;
      if (after) toIdx += 1;
      next.splice(toIdx, 0, moved);

      if (layoutMode) {
        const count = gridCellCount(layoutMode);
        const nextTerms = next.filter(t => t.type === 'terminal');
        setTerminalSlots(Array.from({ length: count }, (_, i) => nextTerms[i]?.id ?? null));
      }

      return next;
    });
  }, [layoutMode]);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    layoutMode,
    setLayoutMode,
    terminalSlots,
    setTerminalSlots,
    terminals,
    showGrid,
    handleAddRawTerminal,
    handleCloseTerminal,
    handleOpenFile,
    addTab,
    removeTabById,
    updateTabDirty,
    moveTab,
  };
}
