import React, { useState, useEffect, useCallback } from 'react';
import {
  getCliTools,
  getTemplates,
  getGlobalEnvVars,
  reorderTemplates
} from '../api';
import type { Project, CliTool, Template } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';
import { TerminalTab } from '../components/TerminalTab';

interface Props {
  project: Project;
  isVisible: boolean;
  onUnregisterProject: (proj: Project) => void;
}

interface ConsoleTab {
  id: string; // 'overview' 或者 具体的 sessionId
  title: string;
  type: 'overview' | 'terminal';
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export default function ProjectWorkspace({ project, isVisible, onUnregisterProject }: Props) {
  const { t } = useI18n();
  const toast = useToast();

  const [cliTools, setCliTools] = useState<CliTool[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateLaunching, setTemplateLaunching] = useState<string | null>(null);

  // Drag and drop state for templates
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Multi-tab interactive CLI terminal states
  const [tabs, setTabs] = useState<ConsoleTab[]>([
    { id: 'overview', title: '概览', type: 'overview', cwd: project.root_path }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('overview');
  const [isGridLayout, setIsGridLayout] = useState<boolean>(false);

  // Load tools & templates
  const loadToolsAndTemplates = useCallback(async () => {
    try {
      const toolsData = await getCliTools();
      setCliTools(toolsData);

      const templatesData = await getTemplates();
      setTemplates(templatesData);
    } catch (e) {
      console.error('Failed to load tools and templates', e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadToolsAndTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [project.id, loadToolsAndTemplates]);

  // Run Template and spawn a new immersive Terminal Tab in project workspace
  const handleRunTemplate = async (tpl: Template) => {
    const tool = cliTools.find(t => t.id === tpl.cli_id);
    if (!tool) {
      toast.error('CLI Tool not found');
      return;
    }

    setTemplateLaunching(tpl.id);
    try {
      // Gather merged environment variables (tool's custom env, template global env, template env overrides)
      const globalVars = await getGlobalEnvVars();
      const customEnvs: Record<string, string> = { ...tool.custom_env };
      
      for (const gvId of tpl.env_var_ids) {
        const gv = globalVars.find(v => v.id === gvId);
        if (gv) {
          customEnvs[gv.key] = gv.value;
        }
      }
      
      for (const [k, v] of Object.entries(tpl.env)) {
        customEnvs[k] = v;
      }

      const newSessionId = crypto.randomUUID();
      const newTab: ConsoleTab = {
        id: newSessionId,
        title: tpl.name,
        type: 'terminal',
        cwd: tpl.pwd ? (tpl.pwd.startsWith('/') || tpl.pwd.includes(':') ? tpl.pwd : `${project.root_path}/${tpl.pwd}`) : project.root_path,
        command: tool.path,
        args: tpl.args,
        env: customEnvs
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newSessionId);
      toast.success(t('temp.toast.launched') + ': ' + tpl.name);
    } catch (e) {
      toast.error(String(e) || t('temp.toast.launchFailed'));
    } finally {
      setTemplateLaunching(null);
    }
  };



  // Drag and drop events for quick derive templates
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const reorderArray = (list: Template[], fromIndex: number, toIndex: number): Template[] => {
      const result = Array.from(list);
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    };

    const newTemplates = reorderArray(templates, draggedIndex, targetIndex);
    setTemplates(newTemplates);
    setDraggedIndex(targetIndex);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null) return;
    setDraggedIndex(null);
    try {
      const ids = templates.map(t => t.id);
      await reorderTemplates(ids);
    } catch (e) {
      console.error('Failed to save template order', e);
      toast.error('Failed to save template order');
    }
  };

  // Launch a standard raw interactive terminal page
  const handleAddRawTerminal = () => {
    const sessionId = crypto.randomUUID();
    const newTab: ConsoleTab = {
      id: sessionId,
      title: `Terminal ${tabs.filter(t => t.type === 'terminal').length + 1}`,
      type: 'terminal',
      cwd: project.root_path
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(sessionId);
  };

  const handleCloseTerminal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTabId === id) {
      setActiveTabId('overview');
    }
  };

  const terminals = tabs.filter(t => t.type === 'terminal');
  const showGrid = isGridLayout && terminals.length > 1;

  const getGridStyle = (): React.CSSProperties => {
    return {
      display: 'flex',
      flexDirection: 'row',
      gap: '12px',
      width: '100%',
      height: '100%',
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Project Title & Path Header ────────────────────────── */}
      <div className="header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', padding: '24px 24px 8px 24px', border: 'none', marginBottom: '0px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {project.name}
          </h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {project.root_path}
          </span>
        </div>

        <button
          onClick={() => onUnregisterProject(project)}
          style={{
            background: 'none',
            border: '1px solid var(--border-subtle)',
            color: 'var(--accent-red)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background 0.2s'
          }}
          className="btn-ghost"
        >
          🗑 {t('proj.modal.btn.cancel')}
        </button>
      </div>

      {/* ── Subparts Console Tab bar Header ────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle, #27272a)',
        padding: '4px 24px 8px 24px',
        marginBottom: '0px',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', flex: 1 }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  backgroundColor: isActive ? 'var(--bg-elevated, #27272a)' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border-subtle, #3e3e42)' : 'transparent',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer',
                  color: isActive ? 'var(--text-primary, #ffffff)' : 'var(--text-secondary, #a1a1aa)',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  maxWidth: '120px',
                }}
              >
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  maxWidth: tab.id === 'overview' ? '80px' : '75px'
                }}>
                  {tab.title}
                </span>
                {tab.id !== 'overview' && (
                  <span
                    onClick={(e) => handleCloseTerminal(tab.id, e)}
                    style={{
                      marginLeft: '2px',
                      fontSize: '0.7rem',
                      opacity: 0.6,
                      cursor: 'pointer'
                    }}
                    className="close-hover"
                  >
                    ✕
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleAddRawTerminal}
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
              backgroundColor: 'var(--bg-elevated, #18181b)',
              border: '1px solid var(--border-subtle, #27272a)',
              color: 'var(--text-primary, #fff)',
              fontWeight: 500
            }}
          >
            + {t('proj.launcher.btn.spawn') === '启动 Agent' ? '新建终端' : 'New Terminal'}
          </button>

          {tabs.filter(t => t.type === 'terminal').length > 1 && (
            <button
              onClick={() => setIsGridLayout(!isGridLayout)}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                borderRadius: 'var(--radius-sm, 4px)',
                cursor: 'pointer',
                backgroundColor: isGridLayout ? 'var(--accent-emerald, #10b981)' : 'var(--bg-elevated, #18181b)',
                border: '1px solid var(--border-subtle, #27272a)',
                color: isGridLayout ? '#fff' : 'var(--text-primary, #fff)',
                fontWeight: 500
              }}
            >
              🔳 {isGridLayout ? '单签切换' : '平铺多开'}
            </button>
          )}
        </div>
      </div>

      {/* ── Active Screens Grid or Viewport Layer ───────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Overview Tab Content */}
        {activeTabId === 'overview' && !showGrid && (
          <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', padding: '24px' }}>
            {/* Quick Spawn Launcher Panel */}
            <div className="launcher-card" style={{ backgroundColor: 'transparent', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚀 {t('proj.launcher.title') || 'Quick Spawn'}
              </h3>
              {templates.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '12px 8px' }}>
                  {t('proj.launcher.noTemplates')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {templates.map((tpl, i) => (
                    <button
                      key={tpl.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => handleRunTemplate(tpl)}
                      disabled={templateLaunching === tpl.id}
                      className="btn btn-ghost"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-elevated)',
                        cursor: 'grab',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        opacity: draggedIndex === i ? 0.4 : 1,
                        transition: 'opacity 0.2s, transform 0.2s',
                      }}
                    >
                      {templateLaunching === tpl.id ? '⏳' : '🟢'}
                      <span>{tpl.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>


          </div>
        )}

        {/* Terminals Viewport (Tabbed or Tiled Grid) */}
        <div style={{
          ...getGridStyle(),
          flex: 1,
          minHeight: 0,
          paddingRight: '6px',
          paddingBottom: '6px',
          boxSizing: 'border-box'
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
                  height: '100%',
                  minWidth: 0
                }}
              >
                <TerminalTab
                  sessionId={tab.id}
                  cwd={tab.cwd}
                  command={tab.command}
                  args={tab.args}
                  env={tab.env}
                  isVisible={isTerminalVisible}
                />
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
