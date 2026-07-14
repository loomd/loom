// TypeScript types matching Rust core models exactly

export interface CliTool {
  id: string;
  name: string;
  path: string;
  version: string;
  category_id?: string;
  custom_env: Record<string, string>;
  custom_args?: string[];
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

export interface GlobalEnvVar {
  id: string;
  key: string;
  value: string;
  description: string;
}

export interface Template {
  id: string;
  cli_id: string;
  name: string;
  args: string[];
  env: Record<string, string>;
  env_var_ids: string[];
  pwd?: string;
  last_run?: string;
  cmd_override?: string;
  env_mode?: 'inherit' | 'isolated';
}

export interface ActiveInstance {
  instance_id: string;
  pid: number;
  template_id: string;
}

export type InstanceStatus = 'running' | 'stopped' | 'failed';

export interface LogEvent {
  instance_id: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface StatusEvent {
  instance_id: string;
  status: InstanceStatus;
  exit_code?: number;
}

export interface RunningInstance {
  instance_id: string;
  template: Template;
  tool: CliTool;
  status: InstanceStatus;
  logs: LogEvent[];
  exit_code?: number;
  started_at: Date;
}

export interface Project {
  id: string;
  name: string;
  root_path: string;
  env_profiles: Record<string, Record<string, string>>;
  quick_commands: Template[];
}

export interface ProjectSkill {
  name: string;
  enabled: boolean;
  source: string;
  skill_path: string;
  computed_hash: string;
}

export interface AgentDoc {
  relative_path: string;
  absolute_path: string;
  file_name: string;
}

export interface GlobalSkillTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  files: Record<string, string>;
}

export interface GlobalDocTemplate {
  id: string;
  alias: string;
  default_filename: string;
  content: string;
}

export interface AgentInstance {
  id: string;
  project_id: string;
  command: string;
  arguments: string[];
  status: 'running' | 'success' | 'failed' | 'interrupted';
  env_mode: 'inherit' | 'isolated';
  custom_envs: Record<string, string>;
  start_time: string;
  end_time?: string;
  pid?: number;
}

export interface ScanResult {
  name: string;
  path: string;
  is_agent: boolean;
  provider: string | null;
  is_installed: boolean;
  is_registered: boolean;
  tool_id: string | null;
}
