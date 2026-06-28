pub mod error;
pub mod manager;
pub mod models;

pub use error::{StorageError, Result};
pub use models::{CliTool, Category, Template, AppConfig, LoomStorage, GlobalEnvVar, Project, AgentInstance, ProjectSkill, AgentDoc, GlobalSkillTemplate, GlobalDocTemplate};
pub use manager::{
    get_cli_tools, import_cli_tool, scan_path_env, scan_directory,
    create_category, get_categories, assign_cli_category, update_cli_env, update_cli_args, create_template,
    get_templates, delete_template, update_template, delete_cli_tool, delete_category,
    run_cli_template, kill_cli_instance, get_config_path, get_active_instances, get_active_instances_list,
    get_language, set_language, get_theme, set_theme, StorageManager,
    get_global_env_vars, create_global_env_var, update_global_env_var, delete_global_env_var,
    update_category, smart_classify, get_font_family, set_font_family, get_font_size, set_font_size,
    get_projects, create_project, delete_project, reorder_projects, reorder_templates, reorder_cli_tools, get_project_agents, spawn_project_agent, sync_running_processes,
    read_agent_logs, get_project_skills, toggle_project_skill, scan_project_agent_docs, create_project_agent_doc,
    get_global_skills, create_global_skill, update_global_skill, delete_global_skill,
    get_global_docs, create_global_doc, update_global_doc, delete_global_doc,
    import_global_skill_to_project, import_global_doc_to_project, parse_local_skill_dir,
    get_autostart_enabled, set_autostart_enabled
};

#[cfg(test)]
mod tests;
