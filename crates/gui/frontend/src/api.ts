// Tauri command wrappers — calls Rust backend via IPC
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CliTool, Category, Template, GlobalEnvVar, LogEvent, StatusEvent } from './types';

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
  cmdOverride?: string
): Promise<Template> =>
  invoke('create_template', { cliId, name, args, env, envVarIds, pwd, cmdOverride });

export const updateTemplate = (
  templateId: string,
  name: string,
  args: string[],
  env: Record<string, string>,
  envVarIds: string[],
  pwd?: string,
  cmdOverride?: string
): Promise<Template> =>
  invoke('update_template', { templateId, name, args, env, envVarIds, pwd, cmdOverride });

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
