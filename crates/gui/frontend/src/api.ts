// Tauri command wrappers — calls Rust backend via IPC
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CliTool, Category, Template, GlobalEnvVar, LogEvent, StatusEvent, Project, AgentInstance } from './types';

// ─── CLI Tools ────────────────────────────────────────────
export const getCliTools = (): Promise<CliTool[]> =>
  invoke('get_cli_tools');

export const importCliTool = (path: string): Promise<CliTool> =>
  invoke('import_cli_tool', { path });

export const scanPathEnv = (): Promise<CliTool[]> =>
  invoke('scan_path_env');

export const scanDirectory = (path: string): Promise<CliTool[]> =>
  invoke('scan_directory', { path });

export const deleteCliTool = (cliId: string): Promise<void> =>
  invoke('delete_cli_tool', { cliId });

export const updateCliEnv = (
  cliId: string,
  env: Record<string, string>
): Promise<void> =>
  invoke('update_cli_env', { cliId, env });

export const updateCliArgs = (
  cliId: string,
  args: string[]
): Promise<void> =>
  invoke('update_cli_args', { cliId, args });

// ─── Categories ───────────────────────────────────────────
export const createCategory = (name: string, desc: string): Promise<Category> =>
  invoke('create_category', { name, desc });

export const deleteCategory = (catId: string): Promise<void> =>
  invoke('delete_category', { catId });

export const assignCliCategory = (
  cliId: string,
  catId: string | null
): Promise<void> =>
  invoke('assign_cli_category', { cliId, catId });

export const updateCategory = (
  catId: string,
  name: string,
  desc: string
): Promise<Category> =>
  invoke('update_category', { catId, name, desc });

export const smartClassify = (): Promise<[number, number]> =>
  invoke('smart_classify');

// ─── Global Environment Variables ─────────────────────────
export const getGlobalEnvVars = (): Promise<GlobalEnvVar[]> =>
  invoke('get_global_env_vars');

export const createGlobalEnvVar = (
  key: string,
  value: string,
  description: string
): Promise<GlobalEnvVar> =>
  invoke('create_global_env_var', { key, value, description });

export const updateGlobalEnvVar = (
  id: string,
  key: string,
  value: string,
  description: string
): Promise<GlobalEnvVar> =>
  invoke('update_global_env_var', { id, key, value, description });

export const deleteGlobalEnvVar = (id: string): Promise<void> =>
  invoke('delete_global_env_var', { id });

// ─── Templates ────────────────────────────────────────────
export const getTemplates = (): Promise<Template[]> =>
  invoke('get_templates');

export const createTemplate = (
  cliId: string,
  name: string,
  args: string[],
  env: Record<string, string>,
  envVarIds: string[],
  pwd?: string,
  cmdOverride?: string,
  envMode?: 'inherit' | 'isolated'
): Promise<Template> =>
  invoke('create_template', { cliId, name, args, env, envVarIds, pwd, cmdOverride, envMode });

export const updateTemplate = (
  templateId: string,
  name: string,
  args: string[],
  env: Record<string, string>,
  envVarIds: string[],
  pwd?: string,
  cmdOverride?: string,
  envMode?: 'inherit' | 'isolated'
): Promise<Template> =>
  invoke('update_template', { templateId, name, args, env, envVarIds, pwd, cmdOverride, envMode });

export const deleteTemplate = (templateId: string): Promise<void> =>
  invoke('delete_template', { templateId });

// ─── Process Lifecycle ────────────────────────────────────
export const runCliTemplate = (templateId: string): Promise<string> =>
  invoke('run_cli_template', { templateId });

export const killCliInstance = (instanceId: string): Promise<void> =>
  invoke('kill_cli_instance', { instanceId });

// ─── Event Listeners ──────────────────────────────────────
export const onLogEvent = (
  callback: (event: LogEvent) => void
): Promise<() => void> =>
  listen<LogEvent>('cli-log-event', (e) => callback(e.payload));

export const onStatusEvent = (
  callback: (event: StatusEvent) => void
): Promise<() => void> =>
  listen<StatusEvent>('cli-status-event', (e) => callback(e.payload));

// ─── Language ─────────────────────────────────────────────
export const getLanguage = (): Promise<string> =>
  invoke('get_language');

export const setLanguage = (lang: string): Promise<void> =>
  invoke('set_language', { lang });

// ─── Theme Configurations ─────────────────────────────────
export const getTheme = (): Promise<string> =>
  invoke('get_theme');

export const setTheme = (theme: string): Promise<void> =>
  invoke('set_theme', { theme });

// ─── Font Configurations ──────────────────────────────────
export const getFontFamily = (): Promise<string> =>
  invoke('get_font_family');

export const setFontFamily = (font: string): Promise<void> =>
  invoke('set_font_family', { font });

export const getFontSize = (): Promise<string> =>
  invoke('get_font_size');

export const setFontSize = (size: string): Promise<void> =>
  invoke('set_font_size', { size });

// ─── Projects ─────────────────────────────────────────────
export const getProjects = (): Promise<Project[]> =>
  invoke('get_projects');

export const createProject = (name: string, rootPath: string): Promise<Project> =>
  invoke('create_project', { name, rootPath });

export const deleteProject = (id: string): Promise<void> =>
  invoke('delete_project', { id });

export const getProjectAgents = (projectId: string): Promise<AgentInstance[]> =>
  invoke('get_project_agents', { projectId });

export const spawnProjectAgent = (
  projectId: string,
  command: string,
  args: string[],
  envMode: 'inherit' | 'isolated',
  customEnvs: Record<string, string>,
  pwd?: string
): Promise<string> =>
  invoke('spawn_project_agent', { projectId, command, args, envMode, customEnvs, pwd });

export const getAgentLogs = (instanceId: string): Promise<string[]> =>
  invoke('get_agent_logs', { instanceId });

export const killAgentProcess = (instanceId: string): Promise<void> =>
  invoke('kill_agent_process', { instanceId });

export const bringAgentToForeground = (instanceId: string): Promise<boolean> =>
  invoke('bring_agent_to_foreground', { instanceId });

export const selectDirectory = (): Promise<string | null> =>
  invoke('select_directory');

export const reorderProjects = (ids: string[]): Promise<void> =>
  invoke('reorder_projects', { ids });
