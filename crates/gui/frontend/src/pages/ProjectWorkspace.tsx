import React, { useState, useEffect, useCallback } from 'react';
import {
  getCliTools,
  getTemplates,
  getGlobalEnvVars,
  reorderTemplates,
  listProjectFiles,
  openFileWithSystem
} from '../api';
import type { FileEntry } from '../api';
import type { Project, CliTool, Template } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';
import { TerminalTab } from '../components/TerminalTab';
import { FileEditor } from '../components/FileEditor';

interface Props {
  project: Project;
  isVisible: boolean;
  onUnregisterProject: (proj: Project) => void;
}

interface ConsoleTab {
  id: string; // 'overview' / 终端 sessionId / 编辑器文件绝对路径
  title: string;
  type: 'overview' | 'terminal' | 'editor';
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  filePath?: string;
  isDirty?: boolean;
}

/**
 * 级联合并 CLI 工具的默认参数和模板自定义参数。
 *
 * TODO: 请在此处实现级联逻辑以形成最终派生终端所执行的完整参数列表。
 * 请考虑：
 * - 安全性：`tool.custom_args` 或 `tpl.args` 有可能为 undefined，应如何防护？
 * - 顺序：通常工具默认参数在前，模板的特异性参数追加在后。
 *
 * @param tool 关联的 CLI 工具实体
 * @param tpl 当前执行的模板
 */
export function getMergedArgs(tool: CliTool, tpl: Template): string[] {
  return [...(tool.custom_args || []), ...(tpl.args || [])];
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

  // File Explorer state
  const [currentPath, setCurrentPath] = useState<string>(project.root_path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<string>('');

  const loadFiles = useCallback(async (path: string) => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const list = await listProjectFiles(path);
      setFiles(list);
    } catch (e: any) {
      console.error('Failed to list files', e);
      setFileError(String(e));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  // Sync currentPath when project changes
  useEffect(() => {
    setCurrentPath(project.root_path);
  }, [project.root_path]);

  // Load files when currentPath changes
  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return '📁';
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'py':
      case 'rs':
      case 'go':
      case 'c':
      case 'cpp':
      case 'h':
      case 'java':
        return '📄';
      case 'toml':
      case 'json':
      case 'yaml':
      case 'yml':
      case 'ini':
      case 'conf':
      case 'lock':
        return '⚙️';
      case 'md':
      case 'txt':
      case 'pdf':
        return '📝';
      case 'gitignore':
        return '🛡️';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
      case 'gif':
      case 'ico':
        return '🖼️';
      case 'zip':
      case 'tar':
      case 'gz':
      case 'rar':
      case '7z':
        return '📦';
      case 'bat':
      case 'sh':
      case 'cmd':
      case 'ps1':
        return '⚡';
      default:
        return '📄';
    }
  };

  const handleOpenFile = (file: FileEntry) => {
    const fileId = file.path;
    const alreadyOpen = tabs.find(t => t.id === fileId);

    if (alreadyOpen) {
      setActiveTabId(fileId);
    } else {
      const newEditorTab: ConsoleTab = {
        id: fileId,
        title: file.name,
        type: 'editor',
        cwd: currentPath,
        filePath: file.path,
        isDirty: false
      };
      setTabs(prev => [...prev, newEditorTab]);
      setActiveTabId(fileId);
    }
  };

  const handleFileDoubleClick = async (file: FileEntry) => {
    if (file.is_dir) {
      setCurrentPath(file.path);
    } else {
      const binaryExtensions = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
        'exe', 'dll', 'so', 'dylib', 'bin', 'mp3', 'mp4', 'wav', 'ogg', 'woff', 'woff2', 'ttf', 'eot'
      ];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (binaryExtensions.includes(ext)) {
        try {
          await openFileWithSystem(file.path);
        } catch (e: any) {
          toast.error('Failed to open file: ' + String(e));
        }
      } else {
        handleOpenFile(file);
      }
    }
  };

  const handleGoUp = () => {
    let cleanPath = currentPath.replace(/\\/g, '/');
    if (cleanPath.endsWith('/') && cleanPath.length > 3) {
      cleanPath = cleanPath.slice(0, -1);
    }
    const lastSlash = cleanPath.lastIndexOf('/');
    if (lastSlash > 0) {
      let parent = cleanPath.substring(0, lastSlash);
      if (parent.endsWith(':')) {
        parent += '/';
      }
      setCurrentPath(parent);
    } else if (lastSlash === 0) {
      setCurrentPath('/');
    }
  };

  const isAtRoot = (() => {
    const clean = currentPath.replace(/\\/g, '/');
    if (clean === '/' || clean === '') return true;
    if (clean.length <= 3 && clean.endsWith(':')) return true;
    if (clean.length <= 3 && clean.endsWith(':/')) return true;
    return false;
  })();

  const renderBreadcrumbs = () => {
    const normalized = currentPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const isWindowsRoot = normalized.includes(':');

    const breadcrumbStyle: React.CSSProperties = {
      cursor: 'pointer',
      padding: '2px 4px',
      borderRadius: 'var(--radius-sm, 4px)',
      transition: 'color 150ms ease, background-color 150ms ease',
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        {isWindowsRoot ? (
          <span 
            onClick={() => setCurrentPath(segments[0] + '/')}
            style={breadcrumbStyle}
            className="breadcrumb-item"
          >
            {segments[0]}
          </span>
        ) : (
          <span 
            onClick={() => setCurrentPath('/')}
            style={breadcrumbStyle}
            className="breadcrumb-item"
          >
            /
          </span>
        )}
        
        {segments.map((seg, idx) => {
          if (idx === 0 && isWindowsRoot) return null;
          
          let path = '';
          if (isWindowsRoot) {
            path = segments.slice(0, idx + 1).join('/');
          } else {
            path = '/' + segments.slice(0, idx + 1).join('/');
          }
          
          return (
            <React.Fragment key={idx}>
              <span style={{ color: 'var(--text-tertiary)', userSelect: 'none' }}>/</span>
              <span 
                onClick={() => setCurrentPath(path)}
                style={breadcrumbStyle}
                className="breadcrumb-item"
              >
                {seg}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    );
  };


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
        args: getMergedArgs(tool, tpl),
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
    const tabToClose = tabs.find(t => t.id === id);
    if (tabToClose?.type === 'editor' && tabToClose.isDirty) {
      const confirmClose = confirm(t('editor.confirm.close') || '文件有未保存的更改，确定要关闭吗？');
      if (!confirmClose) return;
    }
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
      <div className="header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', padding: '8px 24px 4px 24px', border: 'none', marginBottom: '0px' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '8px' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            {project.name}
          </h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {project.root_path}
          </span>
        </div>

        <button
          onClick={() => onUnregisterProject(project)}
          className="btn-delete-project"
          style={{
            fontSize: '0.75rem',
            padding: '3px 8px',
          }}
        >
          🗑 {t('proj.modal.btn.cancel')}
        </button>
      </div>

      {/* ── Subparts Console Tab bar Header ────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: activeTabId === 'overview' ? 'none' : '1px solid var(--border-subtle, #27272a)',
        padding: '2px 24px 4px 24px',
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
                {tab.type === 'editor' && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>📄</span>}
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  maxWidth: tab.id === 'overview' ? '80px' : (tab.type === 'editor' ? '60px' : '75px')
                }}>
                  {tab.title}
                </span>
                {tab.id !== 'overview' && (
                  <span
                    onClick={(e) => handleCloseTerminal(tab.id, e)}
                    style={{
                      marginLeft: '2px',
                      cursor: 'pointer',
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      textAlign: 'center',
                      lineHeight: '12px',
                      fontSize: tab.isDirty ? '0.6rem' : '0.7rem'
                    }}
                    className={`tab-close-icon ${tab.isDirty ? 'dirty' : ''}`}
                    title={tab.isDirty ? '有未保存的更改' : undefined}
                  />
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
          <div style={{
            flexGrow: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'row',
            gap: '24px',
            padding: '0px 24px 24px 24px',
            overflow: 'hidden'
          }}>
            {/* Left Column: Quick Derive Templates (25% width) */}
            <div style={{
              width: '25%',
              minWidth: '180px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingTop: '2px',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚀 {t('proj.launcher.title') || 'Quick Spawn'}
              </h3>
              {templates.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', padding: '8px 0' }}>
                  {t('proj.launcher.noTemplates')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
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
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm, 6px)',
                        border: '1px solid var(--border-subtle, #27272a)',
                        backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.04))',
                        cursor: 'grab',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        width: '100%',
                        minWidth: 0,
                        overflow: 'hidden',
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                        opacity: draggedIndex === i ? 0.4 : 1,
                        transition: 'opacity 0.2s, transform 0.2s, background-color 0.2s',
                      }}
                    >
                      {templateLaunching === tpl.id ? '⏳' : '🟢'}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{tpl.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: File Explorer (75% width) */}
            <div style={{
              width: '75%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingTop: '2px',
              overflow: 'hidden'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📁 {t('proj.explorer.title') || 'File Explorer'}
              </h3>
              
              {/* File Explorer Toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                backgroundColor: 'var(--bg-card-outer, rgba(255,255,255,0.02))',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px solid var(--border-subtle, #27272a)'
              }}>
                <button
                  onClick={handleGoUp}
                  disabled={isAtRoot}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle, #27272a)',
                    color: 'var(--text-primary, #fff)',
                    cursor: isAtRoot ? 'default' : 'pointer',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    opacity: isAtRoot ? 0.4 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem'
                  }}
                  title="Go Up"
                >
                  ⬆️
                </button>

                <button
                  onClick={() => loadFiles(currentPath)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--border-subtle, #27272a)',
                    color: 'var(--text-primary, #fff)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem'
                  }}
                  title="Refresh"
                >
                  🔄
                </button>

                {/* Breadcrumbs */}
                <div style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                  {renderBreadcrumbs()}
                </div>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-input, #09090b)',
                    color: 'var(--text-primary, #fff)',
                    border: '1px solid var(--border-subtle, #27272a)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    padding: '4px 10px',
                    fontSize: '0.8rem',
                    outline: 'none',
                    width: '160px',
                    transition: 'border-color 0.2s',
                  }}
                />
              </div>

              {/* File List Pane */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-md, 14px)',
                border: '1px solid var(--border-subtle, #27272a)',
                boxShadow: 'var(--shadow-card-inset)'
              }}>
                {loadingFiles ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                    Loading files...
                  </div>
                ) : fileError ? (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '8px', color: 'var(--accent-red, #ef4444)', padding: '20px' }}>
                    <span>Error loading files:</span>
                    <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', opacity: 0.8, textAlign: 'center', wordBreak: 'break-all' }}>{fileError}</span>
                    <button 
                      onClick={() => setCurrentPath(project.root_path)}
                      className="btn btn-ghost"
                      style={{ marginTop: '12px', border: '1px solid var(--border-subtle, #27272a)', padding: '6px 12px', borderRadius: 'var(--radius-sm, 6px)' }}
                    >
                      Back to Project Root
                    </button>
                  </div>
                ) : (() => {
                  const filtered = files.filter(f => f.name.toLowerCase().includes(fileFilter.toLowerCase()));
                  if (filtered.length === 0) {
                    return (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                        No files found
                      </div>
                    );
                  }
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle, #27272a)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Name</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600, width: '100px', textAlign: 'right' }}>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((file) => (
                          <tr
                            key={file.path}
                            onDoubleClick={() => handleFileDoubleClick(file)}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                              cursor: 'pointer',
                            }}
                            className="file-row"
                          >
                            <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                              <span style={{ fontSize: '1.05rem', lineHeight: 1, userSelect: 'none' }}>{getFileIcon(file.name, file.is_dir)}</span>
                              <span 
                                style={{ 
                                  color: file.is_dir ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  fontWeight: file.is_dir ? 500 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                              {formatFileSize(file.size)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
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

        {/* Built-in File Editor Viewport */}
        {tabs.map((tab) => {
          if (tab.type !== 'editor' || !tab.filePath) return null;
          const isTabVisible = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              style={{
                display: isTabVisible ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                width: '100%',
                height: '100%',
                boxSizing: 'border-box'
              }}
            >
              <FileEditor
                filePath={tab.filePath}
                onContentDirtyChange={(dirty) => {
                  setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, isDirty: dirty } : t));
                }}
              />
            </div>
          );
        })}

      </div>
    </div>
  );
}
