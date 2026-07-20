// Tauri command wrappers — calls Rust backend via IPC
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	CliTool,
	Category,
	Template,
	GlobalEnvVar,
	LogEvent,
	StatusEvent,
	Project,
	AgentInstance,
	ProjectSkill,
	AgentDoc,
	ScanResult,
} from "./types";

// ─── CLI Tools ────────────────────────────────────────────
export const getCliTools = (): Promise<CliTool[]> => invoke("get_cli_tools");

export const importCliTool = (path: string): Promise<CliTool> =>
	invoke("import_cli_tool", { path });

export const scanPathEnv = (): Promise<CliTool[]> => invoke("scan_path_env");

export const scanDirectory = (path: string): Promise<CliTool[]> =>
	invoke("scan_directory", { path });

export const deleteCliTool = (cliId: string): Promise<void> =>
	invoke("delete_cli_tool", { cliId });

export const toggleCliToolAgent = (cliId: string): Promise<CliTool> =>
	invoke("toggle_cli_tool_agent", { cliId });

export const deleteAiAgent = (cliId: string): Promise<void> =>
	invoke("delete_ai_agent", { cliId });

export const reorderCliTools = (ids: string[]): Promise<void> =>
	invoke("reorder_cli_tools", { ids });

export const updateCliEnv = (
	cliId: string,
	env: Record<string, string>,
): Promise<void> => invoke("update_cli_env", { cliId, env });

export const updateCliArgs = (cliId: string, args: string[]): Promise<void> =>
	invoke("update_cli_args", { cliId, args });

// ─── Categories ───────────────────────────────────────────
export const createCategory = (name: string, desc: string): Promise<Category> =>
	invoke("create_category", { name, desc });

export const deleteCategory = (catId: string): Promise<void> =>
	invoke("delete_category", { catId });

export const assignCliCategory = (
	cliId: string,
	catId: string | null,
): Promise<void> => invoke("assign_cli_category", { cliId, catId });

export const updateCategory = (
	catId: string,
	name: string,
	desc: string,
): Promise<Category> => invoke("update_category", { catId, name, desc });

export const smartClassify = (): Promise<[number, number]> =>
	invoke("smart_classify");

// ─── Global Environment Variables ─────────────────────────
export const getGlobalEnvVars = (): Promise<GlobalEnvVar[]> =>
	invoke("get_global_env_vars");

export const createGlobalEnvVar = (
	key: string,
	value: string,
	description: string,
): Promise<GlobalEnvVar> =>
	invoke("create_global_env_var", { key, value, description });

export const updateGlobalEnvVar = (
	id: string,
	key: string,
	value: string,
	description: string,
): Promise<GlobalEnvVar> =>
	invoke("update_global_env_var", { id, key, value, description });

export const deleteGlobalEnvVar = (id: string): Promise<void> =>
	invoke("delete_global_env_var", { id });

// ─── Templates ────────────────────────────────────────────
export const getTemplates = (): Promise<Template[]> => invoke("get_templates");

export const createTemplate = (
	cliId: string,
	name: string,
	args: string[],
	env: Record<string, string>,
	envVarIds: string[],
	pwd?: string,
	cmdOverride?: string,
	envMode?: "inherit" | "isolated",
): Promise<Template> =>
	invoke("create_template", {
		cliId,
		name,
		args,
		env,
		envVarIds,
		pwd,
		cmdOverride,
		envMode,
	});

export const updateTemplate = (
	templateId: string,
	name: string,
	args: string[],
	env: Record<string, string>,
	envVarIds: string[],
	pwd?: string,
	cmdOverride?: string,
	envMode?: "inherit" | "isolated",
): Promise<Template> =>
	invoke("update_template", {
		templateId,
		name,
		args,
		env,
		envVarIds,
		pwd,
		cmdOverride,
		envMode,
	});

export const deleteTemplate = (templateId: string): Promise<void> =>
	invoke("delete_template", { templateId });

export const reorderTemplates = (ids: string[]): Promise<void> =>
	invoke("reorder_templates", { ids });

// ─── Process Lifecycle ────────────────────────────────────
export const runCliTemplate = (templateId: string): Promise<string> =>
	invoke("run_cli_template", { templateId });

export const killCliInstance = (instanceId: string): Promise<void> =>
	invoke("kill_cli_instance", { instanceId });

// ─── Event Listeners ──────────────────────────────────────
export const onLogEvent = (
	callback: (event: LogEvent) => void,
): Promise<() => void> =>
	listen<LogEvent>("cli-log-event", (e) => callback(e.payload));

export const onStatusEvent = (
	callback: (event: StatusEvent) => void,
): Promise<() => void> =>
	listen<StatusEvent>("cli-status-event", (e) => callback(e.payload));

// ─── Language ─────────────────────────────────────────────
export const getLanguage = (): Promise<string> => invoke("get_language");

export const setLanguage = (lang: string): Promise<void> =>
	invoke("set_language", { lang });

// ─── Theme Configurations ─────────────────────────────────
export const getTheme = (): Promise<string> => invoke("get_theme");

export const setTheme = (theme: string): Promise<void> =>
	invoke("set_theme", { theme });

export const getProjectColumnAlign = (): Promise<string> =>
	invoke("get_project_column_align");

export const setProjectColumnAlign = (align: string): Promise<void> =>
	invoke("set_project_column_align", { align });

// ─── Font Configurations ──────────────────────────────────
export const getFontFamily = (): Promise<string> => invoke("get_font_family");

export const setFontFamily = (font: string): Promise<void> =>
  invoke("set_font_family", { font });

export const getFontSize = (): Promise<string> => invoke("get_font_size");

export const setFontSize = (size: string): Promise<void> =>
  invoke("set_font_size", { size });

// ─── Floating Sidebar Configurations ────────────────────────
export const getFloatingSidebarEnabled = (): Promise<boolean> =>
  invoke("get_floating_sidebar_enabled");

export const setFloatingSidebarEnabled = (enabled: boolean): Promise<void> =>
  invoke("set_floating_sidebar_enabled", { enabled });

export const getFloatingSidebarPosition = (): Promise<string> =>
  invoke("get_floating_sidebar_position");

export const setFloatingSidebarPosition = (position: string): Promise<void> =>
  invoke("set_floating_sidebar_position", { position });

// ─── Projects ─────────────────────────────────────────────
export const getProjects = (): Promise<Project[]> => invoke("get_projects");

export const createProject = (
	name: string,
	rootPath: string,
): Promise<Project> => invoke("create_project", { name, rootPath });

export const deleteProject = (id: string): Promise<void> =>
	invoke("delete_project", { id });

export const getProjectAgents = (projectId: string): Promise<AgentInstance[]> =>
	invoke("get_project_agents", { projectId });

export const spawnProjectAgent = (
	projectId: string,
	command: string,
	args: string[],
	envMode: "inherit" | "isolated",
	customEnvs: Record<string, string>,
	pwd?: string,
): Promise<string> =>
	invoke("spawn_project_agent", {
		projectId,
		command,
		args,
		envMode,
		customEnvs,
		pwd,
	});

export const getAgentLogs = (instanceId: string): Promise<string[]> =>
	invoke("get_agent_logs", { instanceId });

export const killAgentProcess = (instanceId: string): Promise<void> =>
	invoke("kill_agent_process", { instanceId });

export const bringAgentToForeground = (instanceId: string): Promise<boolean> =>
	invoke("bring_agent_to_foreground", { instanceId });

export const selectDirectory = (): Promise<string | null> =>
	invoke("select_directory");

export const reorderProjects = (ids: string[]): Promise<void> =>
	invoke("reorder_projects", { ids });

export const getProjectSkills = (projectId: string): Promise<ProjectSkill[]> =>
	invoke("get_project_skills", { projectId });

export const toggleProjectSkill = (
	projectId: string,
	skillName: string,
	enabled: boolean,
): Promise<void> =>
	invoke("toggle_project_skill", { projectId, skillName, enabled });

export const scanProjectAgentDocs = (projectId: string): Promise<AgentDoc[]> =>
	invoke("scan_project_agent_docs", { projectId });

export const createProjectAgentDoc = (
	projectId: string,
	relativePath: string,
	docType: string,
): Promise<AgentDoc> =>
	invoke("create_project_agent_doc", { projectId, relativePath, docType });

// ─── Global Skills & Document Templates IPC ─────────────────
import type { GlobalSkillTemplate, GlobalDocTemplate } from "./types";

export const getGlobalSkills = (): Promise<GlobalSkillTemplate[]> =>
	invoke("get_global_skills");

export const createGlobalSkill = (
	name: string,
	description: string,
	content: string,
	files: Record<string, string>,
): Promise<GlobalSkillTemplate> =>
	invoke("create_global_skill", { name, description, content, files });

export const updateGlobalSkill = (
	id: string,
	name: string,
	description: string,
	content: string,
	files: Record<string, string>,
): Promise<GlobalSkillTemplate> =>
	invoke("update_global_skill", { id, name, description, content, files });

export const deleteGlobalSkill = (id: string): Promise<void> =>
	invoke("delete_global_skill", { id });

export const getGlobalDocs = (): Promise<GlobalDocTemplate[]> =>
	invoke("get_global_docs");

export const createGlobalDoc = (
	alias: string,
	defaultFilename: string,
	content: string,
): Promise<GlobalDocTemplate> =>
	invoke("create_global_doc", { alias, defaultFilename, content });

export const updateGlobalDoc = (
	id: string,
	alias: string,
	defaultFilename: string,
	content: string,
): Promise<GlobalDocTemplate> =>
	invoke("update_global_doc", { id, alias, defaultFilename, content });

export const deleteGlobalDoc = (id: string): Promise<void> =>
	invoke("delete_global_doc", { id });

export const importGlobalSkillToProject = (
	projectId: string,
	skillId: string,
): Promise<void> =>
	invoke("import_global_skill_to_project", { projectId, skillId });

export const importGlobalDocToProject = (
	projectId: string,
	docId: string,
	relativePath: string,
): Promise<AgentDoc> =>
	invoke("import_global_doc_to_project", { projectId, docId, relativePath });

export const parseLocalSkillDir = (
	path: string,
): Promise<GlobalSkillTemplate> => invoke("parse_local_skill_dir", { path });

// ─── Autostart Configurations ──────────────────────────────
export const getAutostart = (): Promise<boolean> => invoke("get_autostart");

export const setAutostart = (enabled: boolean): Promise<void> =>
	invoke("set_autostart", { enabled });

// ─── File Explorer ────────────────────────────────────────
export interface FileEntry {
	name: string;
	path: string;
	is_dir: boolean;
	size: number;
}

export const listProjectFiles = (dirPath: string): Promise<FileEntry[]> =>
	invoke("list_project_files", { dirPath });

export const openFileWithSystem = (filePath: string): Promise<void> =>
	invoke("open_file_with_system", { filePath });
export const openInManager = (itemPath: string): Promise<void> =>
	invoke("open_in_manager", { itemPath });

export const deleteFileEntry = (
	filePath: string,
	isDir: boolean,
): Promise<void> => invoke("delete_file_entry", { filePath, isDir });

export const readTextFile = (filePath: string): Promise<string> =>
	invoke("read_text_file", { filePath });

export const writeTextFile = (
	filePath: string,
	content: string,
): Promise<void> => invoke("write_text_file", { filePath, content });

export const openUrl = (url: string): Promise<void> =>
	invoke("open_url", { url });

export const getSkippedVersion = (): Promise<string | null> =>
	invoke("get_skipped_version");

export const setSkippedVersion = (version: string | null): Promise<void> =>
	invoke("set_skipped_version", { version });

export const getUpdateCheckInterval = (): Promise<string> =>
	invoke("get_update_check_interval");

export const setUpdateCheckInterval = (interval: string): Promise<void> =>
	invoke("set_update_check_interval", { interval });

// ─── AI Agent Classification & Onboarding ────────────────────
export const scanAndClassifyAgents = (): Promise<ScanResult[]> =>
	invoke("scan_and_classify_agents");

export const getOnboardedStatus = (): Promise<boolean> =>
	invoke("get_onboarded_status");

export const setOnboardedStatus = (status: boolean): Promise<void> =>
	invoke("set_onboarded_status", { status });

export const createAgentTemplates = (
	agents: Array<[string, string]>,
): Promise<Template[]> =>
	invoke("create_agent_templates", { agents });

export const getAgentSkillMap = (): Promise<Record<string, string>> =>
	invoke("get_agent_skill_map");

export const setAgentSkillMap = (
	skillMap: Record<string, string>,
): Promise<void> => invoke("set_agent_skill_map", { skillMap });

// ─── Agent Status Monitor ───────────────────────────────────
import type { AgentStateInfo } from "./types";

export const pollAgentState = (
	workspaceDir: string,
	ptySessionId?: string,
): Promise<AgentStateInfo | null> => invoke("poll_agent_state", { workspaceDir, ptySessionId: ptySessionId ?? null });
