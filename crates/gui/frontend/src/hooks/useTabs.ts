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
  args?: string[];
  env?: Record<string, string>;
  filePath?: string;
  isDirty?: boolean;
}

export function useTabs(projectRoot: string) {
  const dialog = useDialog();
  const [tabs, setTabs] = useState<ConsoleTab[]>([
    { id: 'overview', title: '概览', type: 'overview', cwd: projectRoot },
    { id: 'agents-skills', title: '技能管理', type: 'agents-skills', cwd: projectRoot }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('overview');
  const [layoutMode, setLayoutMode] = useState<'single' | 'horizontal' | 'vertical'>('single');

  const terminals = tabs.filter(t => t.type === 'terminal');
  const showGrid = layoutMode !== 'single' && terminals.length > 1;

  const handleAddRawTerminal = useCallback(() => {
    const sessionId = crypto.randomUUID();
    const newTab: ConsoleTab = {
      id: sessionId,
      title: `Terminal ${terminals.length + 1}`,
      type: 'terminal',
      cwd: projectRoot
    };
    setLayoutMode('single');
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(sessionId);
  }, [projectRoot, terminals.length]);

  const handleCloseTerminal = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tabToClose = tabs.find(t => t.id === id);
    if (tabToClose?.type === 'editor' && tabToClose.isDirty) {
      const confirmed = await dialog.confirm({ message: '文件有未保存的更改，确定要关闭吗？', danger: true });
      if (!confirmed) return;
    }
    setTabs(prev => {
      if (id === activeTabId) {
        const idx = prev.findIndex(t => t.id === id);
        const filtered = prev.filter(t => t.id !== id);
        if (idx > 0 && prev[idx - 1].id !== 'agents-skills') {
          setActiveTabId(prev[idx - 1].id);
        } else if (idx < prev.length - 1) {
          setActiveTabId(prev[idx + 1].id);
        } else {
          setActiveTabId(filtered[0]?.id ?? 'overview');
        }
      }
      return prev.filter(t => t.id !== id);
    });
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

  const addTab = useCallback((tab: ConsoleTab) => {
    setTabs(prev => [...prev, tab]);
  }, []);

	const removeTabById = useCallback((id: string) => {
		setTabs(prev => {
			const filtered = prev.filter(t => t.id !== id);
			if (id === activeTabId) {
				const idx = prev.findIndex(t => t.id === id);
				if (idx > 0 && prev[idx - 1].id !== 'agents-skills') {
					setActiveTabId(prev[idx - 1].id);
				} else if (idx < prev.length - 1) {
					setActiveTabId(prev[idx + 1].id);
				} else {
					setActiveTabId(filtered[0]?.id ?? 'overview');
				}
			}
			return filtered;
		});
	}, [activeTabId]);

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
      return next;
    });
  }, []);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    layoutMode,
    setLayoutMode,
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
