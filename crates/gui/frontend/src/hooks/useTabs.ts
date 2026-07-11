import { useState, useCallback } from 'react';
import type { FileEntry } from '../api';

export interface ConsoleTab {
  id: string;
  title: string;
  type: 'overview' | 'terminal' | 'editor' | 'agents-skills';
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  filePath?: string;
  isDirty?: boolean;
}

export function useTabs(projectRoot: string) {
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

  const handleCloseTerminal = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const tabToClose = prev.find(t => t.id === id);
      if (tabToClose?.type === 'editor' && tabToClose.isDirty) {
        const confirmClose = confirm('文件有未保存的更改，确定要关闭吗？');
        if (!confirmClose) return prev;
      }
      return prev.filter(t => t.id !== id);
    });
    setActiveTabId(prev => prev === id ? 'overview' : prev);
  }, []);

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
				const nextId = idx > 0 ? prev[idx - 1].id : (filtered[0]?.id ?? 'overview');
				setActiveTabId(nextId);
			}
			return filtered;
		});
	}, [activeTabId]);

  const updateTabDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t));
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
  };
}
