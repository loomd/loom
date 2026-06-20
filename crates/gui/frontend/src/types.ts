// TypeScript types matching Rust core models exactly

export interface CliTool {
  id: string;
  name: string;
  path: string;
  version: string;
  category_id?: string;
  custom_env: Record<string, string>;
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
