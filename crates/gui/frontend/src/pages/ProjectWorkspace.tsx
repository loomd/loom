import React, { Suspense, useEffect, useMemo, useState } from 'react';
import WindowControlButtons from '../components/WindowControlButtons';
import { useTabs } from '../hooks/useTabs';
import { useWorkspaceData } from '../hooks/useWorkspaceData';
import { TerminalPanel } from '../components/TerminalPanel';
import { FileExplorerPanel } from '../components/FileExplorerPanel';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';
import { EditorPlaceholder } from '../components/EditorPlaceholder';
import { pollAgentState } from '../api';
import type { Project, AgentStateInfo } from '../types';
const FileEditor = React.lazy(() => import('../components/FileEditor').then(m => ({ default: m.FileEditor })));

interface Props {
  project: Project;
  isVisible: boolean;
  onUnregisterProject: (proj: Project) => void;
  theme?: 'dark' | 'day' | 'gray';
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export default function ProjectWorkspace({ project, isVisible, onUnregisterProject, theme, isSidebarCollapsed, onToggleSidebar }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const tabsState = useTabs(project.root_path);
	const {
		tabs, activeTabId, setActiveTabId, layoutMode, setLayoutMode,
		terminals, showGrid, handleAddRawTerminal, handleCloseTerminal,
		handleOpenFile, updateTabDirty, removeTabById,
	} = tabsState;
const activeTerminals = useMemo(() => terminals.filter(t => t.isOpencode).length, [terminals]);
const [agentStateMap, setAgentStateMap] = useState<Record<string, AgentStateInfo>>({});

  useEffect(() => {
    if (activeTerminals === 0) return;
    const interval = setInterval(async () => {
      const opencodeTerms = terminals.filter(t => t.isOpencode);
      const results: Record<string, AgentStateInfo> = {};
      for (const term of opencodeTerms) {
        try {
          const info = await pollAgentState(project.root_path, term.id);
          if (info) results[term.id] = info;
        } catch { /* DB not available */ }
      }
      setAgentStateMap(results);
    }, 2000);
    return () => clearInterval(interval);
  }, [project.root_path, activeTerminals, terminals]);

	const data = useWorkspaceData(project, toast, t, {
		addTab: tabsState.addTab,
		setActiveTabId,
		openEditorTab: handleOpenFile,
		removeTabById: tabsState.removeTabById,
	});

	useEffect(() => {
		if (activeTabId === 'agents-skills') {
			data.loadSkillsAndDocs();
		}
	}, [activeTabId, data.loadSkillsAndDocs]);

	useEffect(() => {
		if (!isVisible) return;
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.id) {
				data.handleRunTemplate(detail);
				return;
			}
			if (detail === "ctrl-tab") {
				const idx = tabs.findIndex(t => t.id === activeTabId);
				const next = (idx + 1) % tabs.length;
				setLayoutMode("single");
				setActiveTabId(tabs[next].id);
			} else if (detail === "ctrl-w") {
				if (activeTabId !== "overview" && activeTabId !== "agents-skills") {
					removeTabById(activeTabId);
				}
			}
		};
		window.addEventListener("loom-shortcut", handler);
		window.addEventListener("loom-run-template", handler);
		return () => {
			window.removeEventListener("loom-shortcut", handler);
			window.removeEventListener("loom-run-template", handler);
		};
	}, [tabs, activeTabId, setActiveTabId, setLayoutMode, removeTabById, data, isVisible]);

	return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div data-tauri-drag-region style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle, #27272a)', padding: '2px 8px 4px 0px', gap: '0px', minHeight: '30px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0px', alignSelf: 'stretch' }}>
          {onToggleSidebar && (
            <button onClick={onToggleSidebar} className="sidebar-toggle-mini-btn"
              title={isSidebarCollapsed ? t("proj.sidebar.expand") : t("proj.sidebar.collapse")}
              style={{ marginLeft: '0px', marginRight: '0px' }}>
              {isSidebarCollapsed ? "▶" : "◀"}
            </button>
          )}
          {tabs.filter(tab => tab.id === 'overview' || tab.id === 'agents-skills').map(tab => (
            <div key={tab.id}
              onClick={() => { setLayoutMode('single'); setActiveTabId(tab.id); }}
              data-tauri-drag-region
              style={{
                display: 'flex', alignItems: 'center', lineHeight: 1, gap: '6px', padding: '4px 4px',
                flexShrink: 0,
                backgroundColor: tab.id === activeTabId ? 'var(--bg-elevated, #27272a)' : 'transparent',
                border: '1px solid',
                borderColor: tab.id === activeTabId ? 'var(--border-subtle, #3e3e42)' : 'transparent',
                borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer',
                color: tab.id === activeTabId ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #a1a1aa)',
                fontSize: '0.82rem', fontWeight: 400, whiteSpace: 'nowrap', userSelect: 'none',
              }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: tab.id === 'overview' ? '80px' : '60px' }}>
                {tab.title}
              </span>
            </div>
          ))}
          {tabs.filter(tab => tab.id !== 'overview' && tab.id !== 'agents-skills').length > 0 && (
            <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'var(--border-subtle, #27272a)', flexShrink: 0, margin: '6px 0' }} />
          )}
        </div>
        <div data-tauri-drag-region onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}
          style={{ display: 'flex', gap: '2px', overflowX: 'auto', flex: 1, scrollbarWidth: 'none', msOverflowStyle: 'none' }} className="titlebar-tabs-scroll"
        >
          {tabs.filter(tab => tab.id !== 'overview' && tab.id !== 'agents-skills').map(tab => {
            const isActive = showGrid
              ? tab.type === 'terminal' && terminals.findIndex(t => t.id === tab.id) < 2
              : tab.id === activeTabId;
            return (
              <div key={tab.id}
                onClick={() => {
                  if (showGrid && tab.type === 'terminal' && terminals.findIndex(t => t.id === tab.id) < 2) return;
                  setLayoutMode('single');
                  setActiveTabId(tab.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', lineHeight: 1, gap: '0px', padding: '4px 4px',
                  flexShrink: 0,
                  backgroundColor: isActive ? 'var(--bg-elevated, #27272a)' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border-subtle, #3e3e42)' : 'transparent',
                  borderRadius: 'var(--radius-md, 6px)', cursor: 'pointer',
                  color: isActive ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #a1a1aa)',
                  fontSize: '0.82rem', fontWeight: 400, whiteSpace: 'nowrap', userSelect: 'none',
                }}>
                {tab.type === 'editor' && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>📄</span>}
                {tab.type === 'terminal' && tab.isOpencode && (
                  <span
                    className={`agent-status-dot ${agentStateMap[tab.id]?.state || 'idle'}`}
                    title={t(`agent.status.${agentStateMap[tab.id]?.state || 'idle'}`)}
                    style={{ marginRight: '4px' }}
                  />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', lineHeight: 1.3, transform: 'translateY(-0.06em)', minWidth: tab.type === 'terminal' ? '24px' : 0, maxWidth: tab.type === 'terminal' ? 'none' : '60px' }}>
                  {tab.title}
                </span>
                <span onClick={(e) => { if (!isActive) return; handleCloseTerminal(tab.id, e); }}
                  style={{ marginLeft: '2px', cursor: 'pointer', display: 'inline-block', width: '12px', height: '12px', textAlign: 'center', lineHeight: '12px', fontSize: tab.isDirty ? '0.6rem' : '0.7rem', visibility: isActive ? 'visible' : 'hidden', pointerEvents: isActive ? 'auto' : 'none' }}
                  className={`tab-close-icon ${tab.isDirty ? 'dirty' : ''}`}
                  title={tab.isDirty ? '有未保存的更改' : undefined}
                />
              </div>
            );
          })}
        </div>
        <div data-tauri-drag-region onDoubleClick={() => { document.querySelector('.titlebar-tabs-scroll')?.scrollTo({ left: 0, behavior: 'smooth' }); }}
          style={{ width: '24px', flexShrink: 0, alignSelf: 'stretch', cursor: 'grab' }} title="拖拽窗口 / 双击回到起始位置" />
        <div style={{ display: 'flex', gap: '2px', alignItems: 'stretch', alignSelf: 'stretch' }}>
          <button onClick={handleAddRawTerminal}
            style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 4px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: 'var(--text-primary, #fff)', fontWeight: 500, userSelect: 'none' }}>
            {t('proj.launcher.btn.spawn') === '启动 Agent' ? '终端' : 'Terminal'}
          </button>
          {terminals.length > 1 && (
            <button onClick={() => setLayoutMode(prev => prev === 'single' ? 'horizontal' : prev === 'horizontal' ? 'vertical' : 'single')}
              style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 4px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: layoutMode !== 'single' ? 'var(--accent-emerald, #10b981)' : 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: layoutMode !== 'single' ? '#fff' : 'var(--text-primary, #fff)', fontWeight: 500, userSelect: 'none' }}>
              {layoutMode === 'single' ? (t('proj.launcher.btn.spawn') === '启动 Agent' ? '双开' : 'Dual') : layoutMode === 'horizontal' ? (t('proj.launcher.btn.spawn') === '启动 Agent' ? '竖开' : 'Vertical') : (t('proj.launcher.btn.spawn') === '启动 Agent' ? '单签' : 'Single')}
            </button>
          )}
          <WindowControlButtons />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {activeTabId === 'overview' && !showGrid && (
          <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: '24px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
<div data-tour-target="templates-section" style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px', overflowY: 'auto' }}>
				<h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
					{t('proj.launcher.title') || 'Quick Spawn'}
              </h3>
              {data.templates.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', padding: '8px 0' }}>
                  {t('proj.launcher.noTemplates')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
{data.templates.map((tpl, i) => (
						<button key={tpl.id} draggable={true}
							data-tour-target="run-btn"
							onDragStart={(e) => data.handleDragStart(e, i)}
							onDragEnter={() => data.handleDragEnter(i)}
							onDragEnd={data.handleDragEnd}
							onDragOver={(e) => e.preventDefault()}
							onClick={() => data.handleRunTemplate(tpl)}
                      disabled={data.templateLaunching === tpl.id}
                      className="btn btn-ghost"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                        borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle, #27272a)',
                        backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.04))',
                        cursor: 'grab', fontSize: '0.85rem', fontWeight: 600, width: '100%',
                        minWidth: 0, overflow: 'hidden', textAlign: 'left', justifyContent: 'flex-start',
                        opacity: data.draggedIndex === i ? 0.4 : 1,
                        transition: 'opacity 0.2s, transform 0.2s, background-color 0.2s',
                      }}>
                      {data.templateLaunching === tpl.id ? '⏳' : '🟢'}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{tpl.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 4, display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px', overflow: 'hidden' }}>
              <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>📁 {t('proj.explorer.title') || 'File Explorer'}</span>
                <button onClick={() => onUnregisterProject(project)} className="btn-delete-project" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  🗑 {t('proj.modal.btn.cancel')}
                </button>
              </h3>
              <FileExplorerPanel
                files={data.files}
                loadingFiles={data.loadingFiles}
                fileError={data.fileError}
                fileFilter={data.fileFilter}
                currentPath={data.currentPath}
                isAtRoot={data.isAtRoot}
                contextMenu={data.contextMenu}
                onRefresh={() => data.loadFiles(data.currentPath)}
                onGoUp={data.handleGoUp}
                onFilterChange={data.setFileFilter}
                onFileDoubleClick={data.handleFileDoubleClick}
                onContextMenu={data.handleContextMenu}
                onCloseContextMenu={data.handleCloseContextMenu}
                onOpenInManager={data.handleOpenInManager}
                onDeleteFile={data.handleDeleteFile}
              />
            </div>
          </div>
        )}

        {activeTabId === 'agents-skills' && (
          <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'row', gap: '24px', padding: '0px 24px 24px 24px', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>🔌 指令管理</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => data.loadSkillsAndDocs()} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: 'var(--text-primary, #fff)', fontWeight: 500 }}>
                    ↻ 刷新
                  </button>
                  <button onClick={data.handleOpenImportSkillModal} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: 'var(--text-primary, #fff)', fontWeight: 500 }}>
                    从全局库导入
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))', borderRadius: 'var(--radius-md, 14px)', border: '1px solid var(--border-subtle, #27272a)', boxShadow: 'var(--shadow-card-inset)', padding: '12px' }}>
                {data.loadingSkills ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>正在加载技能...</div>
                ) : data.skills.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>未检测到项目技能</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {data.skills.map(skill => (
                      <div key={skill.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 8px)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={skill.skill_path}>路径: {skill.skill_path}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>来源: {skill.source}</span>
                        </div>
                        <label className="switch" style={{ display: 'inline-block', position: 'relative', width: '40px', height: '20px' }}>
                          <input type="checkbox" checked={skill.enabled} onChange={(e) => data.handleToggleSkill(skill.name, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                          <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: skill.enabled ? 'var(--accent-emerald, #10b981)' : '#3f3f46', borderRadius: '20px', transition: '0.4s' }}>
                            <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: skill.enabled ? '22px' : '4px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '0.4s' }} />
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '2px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 规则管理</h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={data.handleOpenImportDocModal} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: 'var(--text-primary, #fff)', fontWeight: 500 }}>
                    从全局库导入
                  </button>
                  <button onClick={data.handleOpenAddDocModal} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', backgroundColor: 'var(--bg-elevated, #18181b)', border: '1px solid var(--border-subtle, #27272a)', color: 'var(--text-primary, #fff)', fontWeight: 500 }}>
                    + 新建指令
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))', borderRadius: 'var(--radius-md, 14px)', border: '1px solid var(--border-subtle, #27272a)', boxShadow: 'var(--shadow-card-inset)' }}>
                {data.loadingDocs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>正在扫描规则文档...</div>
                ) : data.agentDocs.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>未检测到指令文件 (CLAUDE.md / AGENTS.md / gemini.md 等)</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle, #27272a)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>文件名</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>相对路径</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600, width: '80px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.agentDocs.map(doc => (
                        <tr key={doc.absolute_path} onDoubleClick={() => handleOpenFile({ name: doc.file_name, path: doc.absolute_path, is_dir: false, size: 0 }, data.currentPath)}
                          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)', cursor: 'pointer' }} className="file-row">
                          <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500 }}>📄 {doc.file_name}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{doc.relative_path}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); handleOpenFile({ name: doc.file_name, path: doc.absolute_path, is_dir: false, size: 0 }, data.currentPath); }}
                              style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-subtle, #27272a)', backgroundColor: 'var(--bg-elevated, #18181b)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                              编辑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        <TerminalPanel
          terminals={terminals}
          activeTabId={activeTabId}
          layoutMode={layoutMode}
          showGrid={showGrid}
          isVisible={isVisible}
          theme={theme}
        />

        {tabs.map(tab => {
          if (tab.type !== 'editor' || !tab.filePath) return null;
          const isTabVisible = tab.id === activeTabId;
          return (
            <div key={tab.id} style={{ display: isTabVisible ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', height: '100%', boxSizing: 'border-box' }}>
              <Suspense fallback={<EditorPlaceholder />}>
                <FileEditor
                  filePath={tab.filePath}
                  onContentDirtyChange={(dirty) => updateTabDirty(tab.id, dirty)}
                  theme={theme}
                />
              </Suspense>
            </div>
          );
        })}
      </div>

      {data.showAddDocModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>新建规则文档</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>文档类型 / 预设模板</label>
              <select value={data.newDocType} onChange={(e) => { const val = e.target.value; data.setNewDocType(val); if (val === 'claude') data.setNewDocPath('./CLAUDE.md'); else if (val === 'gemini') data.setNewDocPath('./gemini.md'); else if (val === 'agents') data.setNewDocPath('./AGENTS.md'); else if (val === 'agents_instructions') data.setNewDocPath('./agents_instructions.md'); }}
                style={{ backgroundColor: 'var(--bg-input, #09090b)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 6px)', padding: '8px 10px', fontSize: '0.85rem', outline: 'none' }}>
                <option value="claude">CLAUDE.md (Claude Code)说明文件</option>
                <option value="gemini">gemini.md (Gemini)说明文件</option>
                <option value="agents">AGENTS.md (通用Agent)说明文件</option>
                <option value="agents_instructions">agents_instructions.md 说明文件</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>相对路径</label>
              <input type="text" value={data.newDocPath} onChange={(e) => data.setNewDocPath(e.target.value)}
                style={{ backgroundColor: 'var(--bg-input, #09090b)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 6px)', padding: '8px 10px', fontSize: '0.85rem', outline: 'none' }} placeholder="./CLAUDE.md" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => data.setShowAddDocModal(false)} className="btn btn-ghost" style={{ border: '1px solid var(--border-subtle, #27272a)', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', fontSize: '0.85rem' }}>取消</button>
              <button onClick={data.handleCreateDoc} style={{ backgroundColor: 'var(--accent-emerald, #10b981)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>创建</button>
            </div>
          </div>
        </div>
      )}

      {data.showImportSkillModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => data.setShowImportSkillModal(false)}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>从全局库导入项目技能</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {data.globalSkills.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>暂无全局技能模版，请先前往"设置"界面创建全局模版。</div>
              ) : data.globalSkills.map(skill => (
                <div key={skill.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.02))', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 6px)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description || '无具体描述'}</span>
                  </div>
                  <button onClick={() => data.handleImportSkill(skill.id)} style={{ backgroundColor: 'var(--accent-emerald, #10b981)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>导入</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => data.setShowImportSkillModal(false)} className="btn btn-ghost" style={{ border: '1px solid var(--border-subtle, #27272a)', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', fontSize: '0.85rem' }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {data.showImportDocModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => data.setShowImportDocModal(false)}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>从全局库导入项目指令</h3>
            {data.globalDocs.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>暂无全局规则文档，请先前往"设置"界面创建全局模版。</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>选用指令模版</label>
                  <select value={data.selectedGlobalDoc?.id || ''} onChange={(e) => { const s = data.globalDocs.find(d => d.id === e.target.value); if (s) { data.setSelectedGlobalDoc(s); data.setImportDocRelPath(s.default_filename); } }}
                    style={{ backgroundColor: 'var(--bg-input, #09090b)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 6px)', padding: '8px 10px', fontSize: '0.85rem', outline: 'none' }}>
                    {data.globalDocs.map(doc => <option key={doc.id} value={doc.id}>{doc.alias}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>项目相对路径</label>
                  <input type="text" value={data.importDocRelPath} onChange={(e) => data.setImportDocRelPath(e.target.value)}
                    style={{ backgroundColor: 'var(--bg-input, #09090b)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-subtle, #27272a)', borderRadius: 'var(--radius-sm, 6px)', padding: '8px 10px', fontSize: '0.85rem', outline: 'none' }} placeholder="./CLAUDE.md" />
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => data.setShowImportDocModal(false)} className="btn btn-ghost" style={{ border: '1px solid var(--border-subtle, #27272a)', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', fontSize: '0.85rem' }}>取消</button>
              {data.globalDocs.length > 0 && (
                <button onClick={data.handleImportDoc} style={{ backgroundColor: 'var(--accent-emerald, #10b981)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>导入</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
