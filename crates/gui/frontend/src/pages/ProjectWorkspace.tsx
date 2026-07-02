import React, { useState, useEffect, useCallback } from 'react';
import {
  getCliTools,
  getTemplates,
  getGlobalEnvVars,
  reorderTemplates,
  listProjectFiles,
  openFileWithSystem,
  openInManager,
  getProjectSkills,
  toggleProjectSkill,
  scanProjectAgentDocs,
  createProjectAgentDoc,
  deleteFileEntry,
  getGlobalSkills,
  getGlobalDocs,
  importGlobalSkillToProject,
  importGlobalDocToProject
} from '../api';
import type { FileEntry } from '../api';
import type { Project, CliTool, Template, ProjectSkill, AgentDoc, GlobalSkillTemplate, GlobalDocTemplate } from '../types';
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
  type: 'overview' | 'terminal' | 'editor' | 'agents-skills';
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  filePath?: string;
  isDirty?: boolean;
}

import { mergeCliArgs } from '../utils';

/**
 * 级联合并 CLI 工具的默认参数和模板自定义参数。
 *
 * @param tool 关联的 CLI 工具实体
 * @param tpl 当前执行的模板
 */
export function getMergedArgs(tool: CliTool, tpl: Template): string[] {
  return mergeCliArgs(tool.custom_args || [], tpl.args || []);
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
    { id: 'overview', title: '概览', type: 'overview', cwd: project.root_path },
    { id: 'agents-skills', title: '技能管理', type: 'agents-skills', cwd: project.root_path }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('overview');
  const [isGridLayout, setIsGridLayout] = useState<boolean>(false);

  // Agent & Skills state
  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [agentDocs, setAgentDocs] = useState<AgentDoc[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDocPath, setNewDocPath] = useState('');
  const [newDocType, setNewDocType] = useState('claude');

  // Import from global states
  const [showImportSkillModal, setShowImportSkillModal] = useState(false);
  const [showImportDocModal, setShowImportDocModal] = useState(false);
  const [globalSkills, setGlobalSkills] = useState<GlobalSkillTemplate[]>([]);
  const [globalDocs, setGlobalDocs] = useState<GlobalDocTemplate[]>([]);
  const [selectedGlobalDoc, setSelectedGlobalDoc] = useState<GlobalDocTemplate | null>(null);
  const [importDocRelPath, setImportDocRelPath] = useState('');

  // File Explorer state
  const [currentPath, setCurrentPath] = useState<string>(project.root_path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<string>('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null);

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

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleOpenInManager = async () => {
    if (!contextMenu) return;
    const { file } = contextMenu;
    setContextMenu(null);
    try {
      await openInManager(file.path);
    } catch (e: any) {
      toast.error(`打开失败: ${String(e)}`);
    }
  };

  const handleDeleteFile = async () => {
    if (!contextMenu) return;
    const { file } = contextMenu;
    const confirmMsg = file.is_dir
      ? `确定要删除文件夹 "${file.name}" 及其所有内容吗？此操作不可撤销。`
      : `确定要删除文件 "${file.name}" 吗？此操作不可撤销。`;
    if (!confirm(confirmMsg)) {
      setContextMenu(null);
      return;
    }
    setContextMenu(null);
    try {
      await deleteFileEntry(file.path, file.is_dir);
      toast.success(`已删除 ${file.name}`);
      // Close any open editor tab for this file
      setTabs(prev => prev.filter(t => t.id !== file.path));
      if (activeTabId === file.path) setActiveTabId('overview');
      loadFiles(currentPath);
    } catch (e: any) {
      toast.error(`删除失败: ${String(e)}`);
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

  const loadSkillsAndDocs = useCallback(async () => {
    setLoadingSkills(true);
    setLoadingDocs(true);
    try {
      const skillsData = await getProjectSkills(project.id);
      setSkills(skillsData);
    } catch (e) {
      console.error('Failed to load project skills', e);
    } finally {
      setLoadingSkills(false);
    }

    try {
      const docsData = await scanProjectAgentDocs(project.id);
      setAgentDocs(docsData);
    } catch (e) {
      console.error('Failed to scan agent docs', e);
    } finally {
      setLoadingDocs(false);
    }
  }, [project.id]);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        loadToolsAndTemplates();
        loadSkillsAndDocs();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [project.id, isVisible, loadToolsAndTemplates, loadSkillsAndDocs]);

  const handleToggleSkill = async (skillName: string, enabled: boolean) => {
    try {
      await toggleProjectSkill(project.id, skillName, enabled);
      toast.success(`${enabled ? '开启' : '关闭'} 技能 ${skillName} 成功`);
      loadSkillsAndDocs();
    } catch (e) {
      toast.error(`操作失败: ${String(e)}`);
    }
  };

  const handleCreateDoc = async () => {
    if (!newDocPath.trim()) {
      toast.error('路径不能为空');
      return;
    }
    try {
      const newDoc = await createProjectAgentDoc(project.id, newDocPath.trim(), newDocType);
      toast.success(`创建文档 ${newDoc.file_name} 成功`);
      setShowAddDocModal(false);
      setNewDocPath('');
      loadSkillsAndDocs();
      handleOpenFile({
        name: newDoc.file_name,
        path: newDoc.absolute_path,
        is_dir: false,
        size: 0
      });
    } catch (e) {
      toast.error(`创建失败: ${String(e)}`);
    }
  };

  const handleOpenAddDocModal = () => {
    setNewDocType('claude');
    setNewDocPath('./CLAUDE.md');
    setShowAddDocModal(true);
  };

  const handleOpenImportSkillModal = async () => {
    try {
      const data = await getGlobalSkills();
      setGlobalSkills(data);
      setShowImportSkillModal(true);
    } catch (e) {
      toast.error('加载全局技能列表失败: ' + String(e));
    }
  };

  const handleImportSkill = async (skillTemplateId: string) => {
    try {
      await importGlobalSkillToProject(project.id, skillTemplateId);
      toast.success('从全局库导入技能成功');
      setShowImportSkillModal(false);
      loadSkillsAndDocs();
    } catch (e) {
      toast.error('导入技能失败: ' + String(e));
    }
  };

  const handleOpenImportDocModal = async () => {
    try {
      const data = await getGlobalDocs();
      setGlobalDocs(data);
      if (data.length > 0) {
        setSelectedGlobalDoc(data[0]);
        setImportDocRelPath(data[0].default_filename);
      }
      setShowImportDocModal(true);
    } catch (e) {
      toast.error('加载全局文档模版列表失败: ' + String(e));
    }
  };

  const handleImportDoc = async () => {
    if (!selectedGlobalDoc || !importDocRelPath.trim()) {
      toast.error('请选择模版并指定相对路径');
      return;
    }
    try {
      const newDoc = await importGlobalDocToProject(project.id, selectedGlobalDoc.id, importDocRelPath.trim());
      toast.success(`从全局配置导入文档 "${newDoc.file_name}" 成功`);
      setShowImportDocModal(false);
      loadSkillsAndDocs();
      handleOpenFile({
        name: newDoc.file_name,
        path: newDoc.absolute_path,
        is_dir: false,
        size: 0
      });
    } catch (e) {
      toast.error('导入文档失败: ' + String(e));
    }
  };

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

      {/* ── Subparts Console Tab bar Header ────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle, #27272a)',
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
            onClick={() => onUnregisterProject(project)}
            className="btn-delete-project"
            style={{
              fontSize: '0.75rem',
              padding: '3px 8px',
            }}
          >
            🗑 {t('proj.modal.btn.cancel')}
          </button>
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
            padding: '36px 24px 24px 24px',
            position: 'relative',
            overflow: 'hidden'
          }}>

          {/* Project Info Banner */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: '12px',
            backgroundColor: 'var(--bg-card-outer, rgba(255,255,255,0.02))',
            borderBottom: '1px solid var(--border-subtle, #27272a)',
            zIndex: 1
          }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.root_path}
            </span>
          </div>
            {/* Left Column: Quick Derive Templates (20% width) */}
            <div style={{
              width: '20%',
              minWidth: '180px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingTop: '2px',
              overflowY: 'auto'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {t('proj.launcher.title') || 'Quick Spawn'}
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

            {/* Right Column: File Explorer (80% width) */}
            <div style={{
              width: '80%',
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
              <div
                onClick={handleCloseContextMenu}
                style={{
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
                            onContextMenu={(e) => handleContextMenu(e, file)}
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

        {/* Agents & Skills Tab Content */}
        {activeTabId === 'agents-skills' && (
          <div style={{
            flexGrow: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'row',
            gap: '24px',
            padding: '0px 24px 24px 24px',
            overflow: 'hidden'
          }}>
            {/* Left Column: Skills Management (50% width) */}
            <div style={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingTop: '2px',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔌 智能体技能管理
                </h3>
                <button
                  onClick={handleOpenImportSkillModal}
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
                  从全局库导入
                </button>
              </div>

              <div style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-md, 14px)',
                border: '1px solid var(--border-subtle, #27272a)',
                boxShadow: 'var(--shadow-card-inset)',
                padding: '12px'
              }}>
                {loadingSkills ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                    正在加载技能...
                  </div>
                ) : skills.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    未检测到项目技能
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {skills.map((skill) => (
                      <div
                        key={skill.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px',
                          backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.02))',
                          border: '1px solid var(--border-subtle, #27272a)',
                          borderRadius: 'var(--radius-sm, 8px)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {skill.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={skill.skill_path}>
                            路径: {skill.skill_path}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            来源: {skill.source}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <label className="switch" style={{ display: 'inline-block', position: 'relative', width: '40px', height: '20px' }}>
                            <input
                              type="checkbox"
                              checked={skill.enabled}
                              onChange={(e) => handleToggleSkill(skill.name, e.target.checked)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                              position: 'absolute',
                              cursor: 'pointer',
                              top: 0, left: 0, right: 0, bottom: 0,
                              backgroundColor: skill.enabled ? 'var(--accent-emerald, #10b981)' : '#3f3f46',
                              borderRadius: '20px',
                              transition: '0.4s'
                            }}>
                              <span style={{
                                position: 'absolute',
                                content: '""',
                                height: '14px', width: '14px',
                                left: skill.enabled ? '22px' : '4px',
                                bottom: '3px',
                                backgroundColor: '#fff',
                                borderRadius: '50%',
                                transition: '0.4s'
                              }} />
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Agent Docs (50% width) */}
            <div style={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              paddingTop: '2px',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.0rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📝 智能体指令文档管理
                </h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={handleOpenImportDocModal}
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
                    从全局库导入
                  </button>
                  <button
                    onClick={handleOpenAddDocModal}
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
                    + 新建指令
                  </button>
                </div>
              </div>

              <div style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))',
                borderRadius: 'var(--radius-md, 14px)',
                border: '1px solid var(--border-subtle, #27272a)',
                boxShadow: 'var(--shadow-card-inset)'
              }}>
                {loadingDocs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                    正在扫描指令文档...
                  </div>
                ) : agentDocs.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                    未检测到指令文件 (CLAUDE.md / AGENTS.md / gemini.md 等)
                  </div>
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
                      {agentDocs.map((doc) => (
                        <tr
                          key={doc.absolute_path}
                          onDoubleClick={() => handleOpenFile({
                            name: doc.file_name,
                            path: doc.absolute_path,
                            is_dir: false,
                            size: 0
                          })}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                            cursor: 'pointer',
                          }}
                          className="file-row"
                        >
                          <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                            📄 {doc.file_name}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                            {doc.relative_path}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFile({
                                  name: doc.file_name,
                                  path: doc.absolute_path,
                                  is_dir: false,
                                  size: 0
                                });
                              }}
                              style={{
                                padding: '2px 6px',
                                fontSize: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-subtle, #27272a)',
                                backgroundColor: 'var(--bg-elevated, #18181b)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer'
                              }}
                            >
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

        {/* Terminals Viewport (Tabbed or Tiled Grid) */}
        <div style={{
          ...getGridStyle(),
          flex: 1,
          minHeight: 0,
          paddingRight: '6px',
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          onClick={handleCloseContextMenu}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000,
              backgroundColor: 'var(--bg-modal, #1c1917)',
              border: '1px solid var(--border-subtle, #3e3e42)',
              borderRadius: 'var(--radius-sm, 6px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: '160px',
              padding: '4px',
            }}
          >
            <div
              style={{
                padding: '4px 8px 6px 8px',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                borderBottom: '1px solid var(--border-subtle, #27272a)',
                marginBottom: '4px',
                userSelect: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
              }}
              title={contextMenu.file.name}
            >
              {contextMenu.file.is_dir ? '📁' : '📄'} {contextMenu.file.name}
            </div>
            <button
              onClick={handleOpenInManager}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--text-primary, #fafafa)',
                borderRadius: '4px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              📂 在管理器中打开
            </button>
            <button
              onClick={handleDeleteFile}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--accent-red, #ef4444)',
                borderRadius: '4px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              🗑 删除{contextMenu.file.is_dir ? '文件夹' : '文件'}
            </button>
          </div>
        </div>
      )}

      {showAddDocModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>新建智能体指令文档</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>文档类型 / 预设模板</label>
              <select
                value={newDocType}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewDocType(val);
                  if (val === 'claude') setNewDocPath('./CLAUDE.md');
                  else if (val === 'gemini') setNewDocPath('./gemini.md');
                  else if (val === 'agents') setNewDocPath('./AGENTS.md');
                  else if (val === 'agents_instructions') setNewDocPath('./agents_instructions.md');
                }}
                style={{
                  backgroundColor: 'var(--bg-input, #09090b)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-subtle, #27272a)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 10px',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="claude">CLAUDE.md (Claude Code)说明文件</option>
                <option value="gemini">gemini.md (Gemini)说明文件</option>
                <option value="agents">AGENTS.md (通用Agent)说明文件</option>
                <option value="agents_instructions">agents_instructions.md 说明文件</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>相对路径</label>
              <input
                type="text"
                value={newDocPath}
                onChange={(e) => setNewDocPath(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-input, #09090b)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-subtle, #27272a)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 10px',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
                placeholder="./CLAUDE.md"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setShowAddDocModal(false)}
                className="btn btn-ghost"
                style={{
                  border: '1px solid var(--border-subtle, #27272a)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                取消
              </button>
              <button
                onClick={handleCreateDoc}
                style={{
                  backgroundColor: 'var(--accent-emerald, #10b981)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportSkillModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportSkillModal(false)}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>从全局库导入项目技能</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {globalSkills.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
                  暂无全局技能模版，请先前往“设置”界面创建全局模版。
                </div>
              ) : (
                globalSkills.map(skill => (
                  <div
                    key={skill.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.02))',
                      border: '1px solid var(--border-subtle, #27272a)',
                      borderRadius: 'var(--radius-sm, 6px)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0, paddingRight: '12px' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description || '无具体描述'}</span>
                    </div>
                    <button
                      onClick={() => handleImportSkill(skill.id)}
                      style={{
                        backgroundColor: 'var(--accent-emerald, #10b981)',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm, 4px)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        flexShrink: 0
                      }}
                    >
                      导入
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setShowImportSkillModal(false)}
                className="btn btn-ghost"
                style={{
                  border: '1px solid var(--border-subtle, #27272a)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportDocModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportDocModal(false)}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal, #1c1917)', padding: '24px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle, #27272a)', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>从全局库导入项目指令</h3>

            {globalDocs.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
                暂无全局指令文档，请先前往“设置”界面创建全局模版。
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>选用指令模版</label>
                  <select
                    value={selectedGlobalDoc?.id || ''}
                    onChange={(e) => {
                      const selected = globalDocs.find(d => d.id === e.target.value);
                      if (selected) {
                        setSelectedGlobalDoc(selected);
                        setImportDocRelPath(selected.default_filename);
                      }
                    }}
                    style={{
                      backgroundColor: 'var(--bg-input, #09090b)',
                      color: 'var(--text-primary, #fff)',
                      border: '1px solid var(--border-subtle, #27272a)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  >
                    {globalDocs.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.alias}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>项目相对路径</label>
                  <input
                    type="text"
                    value={importDocRelPath}
                    onChange={(e) => setImportDocRelPath(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg-input, #09090b)',
                      color: 'var(--text-primary, #fff)',
                      border: '1px solid var(--border-subtle, #27272a)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                    placeholder="./CLAUDE.md"
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setShowImportDocModal(false)}
                className="btn btn-ghost"
                style={{
                  border: '1px solid var(--border-subtle, #27272a)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                取消
              </button>
              {globalDocs.length > 0 && (
                <button
                  onClick={handleImportDoc}
                  style={{
                    backgroundColor: 'var(--accent-emerald, #10b981)',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  导入
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
