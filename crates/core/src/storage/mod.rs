pub mod error;
pub mod manager;
pub mod models;

pub use error::{Result, StorageError};
pub use manager::{
    assign_cli_category, create_category, create_global_doc, create_global_env_var,
    create_global_skill, create_project, create_project_agent_doc, create_template,
    delete_category, delete_cli_tool, delete_global_doc, delete_global_env_var,
    delete_global_skill, delete_project, delete_template, get_active_instances,
    get_active_instances_list, get_autostart_enabled, get_categories, get_cli_tools,
    get_config_path, get_font_family, get_font_size, get_global_docs, get_global_env_vars,
    get_global_skills, get_language, get_project_agents, get_project_skills, get_projects,
    get_skipped_version, get_templates, get_theme, get_project_column_align, get_update_check_interval, set_project_column_align, set_update_check_interval, import_cli_tool, import_global_doc_to_project,
    import_global_skill_to_project, kill_cli_instance, parse_local_skill_dir, read_agent_logs,
    reorder_cli_tools, reorder_projects, reorder_templates, run_cli_template, scan_directory,
    scan_path_env, scan_project_agent_docs, set_autostart_enabled, set_font_family, set_font_size,
    set_language, set_skipped_version, set_theme, smart_classify, spawn_project_agent,
    sync_running_processes, toggle_project_skill, update_category, update_cli_args, update_cli_env,
    update_global_doc, update_global_env_var, update_global_skill, update_template, StorageManager,
};
pub use models::{
    AgentDoc, AgentInstance, AppConfig, Category, CliTool, GlobalDocTemplate, GlobalEnvVar,
    GlobalSkillTemplate, LoomStorage, Project, ProjectSkill, Template,
};

#[cfg(test)]
mod tests;
