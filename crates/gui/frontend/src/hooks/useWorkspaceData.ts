import { useState, useEffect, useCallback } from 'react';
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
  importGlobalDocToProject,
} from '../api';
import type { FileEntry } from '../api';
import type { Project, CliTool, Template, ProjectSkill, AgentDoc, GlobalSkillTemplate, GlobalDocTemplate } from '../types';
import { mergeCliArgs } from '../utils';
import type { ConsoleTab } from './useTabs';

function getMergedArgs(tool: CliTool, tpl: Template): string[] {
  return mergeCliArgs(tool.custom_args || [], tpl.args || []);
}

export interface TabActions {
  addTab: (tab: ConsoleTab) => void;
  setActiveTabId: (id: string) => void;
  openEditorTab: (file: FileEntry, cwd: string) => void;
  removeTabById: (id: string) => void;
}

export function useWorkspaceData(
  project: Project,
  toast: { success: (msg: string) => void; error: (msg: string) => void },
  t: (key: string, params?: Record<string, string>) => string,
  tabActions: TabActions,
) {
  const [cliTools, setCliTools] = useState<CliTool[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateLaunching, setTemplateLaunching] = useState<string | null>(null);

  const [skills, setSkills] = useState<ProjectSkill[]>([]);
  const [agentDocs, setAgentDocs] = useState<AgentDoc[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDocPath, setNewDocPath] = useState('');
  const [newDocType, setNewDocType] = useState('claude');

  const [showImportSkillModal, setShowImportSkillModal] = useState(false);
  const [showImportDocModal, setShowImportDocModal] = useState(false);
  const [globalSkills, setGlobalSkills] = useState<GlobalSkillTemplate[]>([]);
  const [globalDocs, setGlobalDocs] = useState<GlobalDocTemplate[]>([]);
  const [selectedGlobalDoc, setSelectedGlobalDoc] = useState<GlobalDocTemplate | null>(null);
  const [importDocRelPath, setImportDocRelPath] = useState('');

  const [currentPath, setCurrentPath] = useState<string>(project.root_path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<string>('');

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const loadFiles = useCallback(async (path: string) => {
    setLoadingFiles(true);
    setFileError(null);
    try {
      const list = await listProjectFiles(path);
      setFiles(list);
    } catch (e) {
      console.error('Failed to list files', e);
      setFileError(String(e));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPath(project.root_path);
  }, [project.root_path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

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
    const timer = setTimeout(() => {
      loadToolsAndTemplates();
      loadSkillsAndDocs();
    }, 0);
    return () => clearTimeout(timer);
  }, [project.id, loadToolsAndTemplates, loadSkillsAndDocs]);

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
      tabActions.openEditorTab({
        name: newDoc.file_name,
        path: newDoc.absolute_path,
        is_dir: false,
        size: 0
      }, currentPath);
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
      tabActions.openEditorTab({
        name: newDoc.file_name,
        path: newDoc.absolute_path,
        is_dir: false,
        size: 0
      }, currentPath);
    } catch (e) {
      toast.error('导入文档失败: ' + String(e));
    }
  };

  const handleRunTemplate = async (tpl: Template) => {
    const tool = cliTools.find(t => t.id === tpl.cli_id);
    if (!tool) {
      toast.error('CLI Tool not found');
      return;
    }
    setTemplateLaunching(tpl.id);
    try {
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
        env: customEnvs,
      };
      tabActions.addTab(newTab);
      tabActions.setActiveTabId(newSessionId);
      toast.success(t('temp.toast.launched') + ': ' + tpl.name);
    } catch (e) {
      toast.error(String(e) || t('temp.toast.launchFailed'));
    } finally {
      setTemplateLaunching(null);
    }
  };

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
    setTemplates(prev => {
      const newTemplates = reorderArray(prev, draggedIndex, targetIndex);
      return newTemplates;
    });
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
        } catch (e) {
          toast.error('Failed to open file: ' + String(e));
        }
      } else {
        tabActions.openEditorTab(file, currentPath);
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
    } catch (e) {
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
      tabActions.removeTabById(file.path);
      loadFiles(currentPath);
    } catch (e) {
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

  return {
    cliTools,
    templates,
    templateLaunching,
    skills,
    agentDocs,
    loadingSkills,
    loadingDocs,
    showAddDocModal,
    setShowAddDocModal,
    newDocPath,
    setNewDocPath,
    newDocType,
    setNewDocType,
    showImportSkillModal,
    setShowImportSkillModal,
    showImportDocModal,
    setShowImportDocModal,
    globalSkills,
    globalDocs,
    selectedGlobalDoc,
    setSelectedGlobalDoc,
    importDocRelPath,
    setImportDocRelPath,
    currentPath,
    files,
    loadingFiles,
    fileError,
    fileFilter,
    setFileFilter,
    contextMenu,
    draggedIndex,
    loadFiles,
    handleRunTemplate,
    handleToggleSkill,
    handleCreateDoc,
    handleOpenAddDocModal,
    handleImportSkill,
    handleOpenImportSkillModal,
    handleImportDoc,
    handleOpenImportDocModal,
    handleDragStart,
    handleDragEnter,
    handleDragEnd,
    handleFileDoubleClick,
    handleContextMenu,
    handleCloseContextMenu,
    handleOpenInManager,
    handleDeleteFile,
    handleGoUp,
    isAtRoot,
    loadToolsAndTemplates,
    loadSkillsAndDocs,
  };
}
