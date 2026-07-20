// DISTINCT COMMENT FOR MODELS
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CliTool {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub version: String,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub custom_env: HashMap<String, String>,
    #[serde(default)]
    pub custom_args: Vec<String>,
    #[serde(default)]
    pub is_agent: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GlobalEnvVar {
    pub id: String,
    pub key: String,
    pub value: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Template {
    pub id: String,
    pub cli_id: String,
    pub name: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub env_var_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pwd: Option<PathBuf>,
    #[serde(default)]
    pub last_run: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cmd_override: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_mode: Option<String>,
}

pub fn default_language() -> String {
    "zh".to_string()
}

pub fn default_theme() -> String {
    "gray".to_string()
}

pub fn default_font_family() -> String {
    "Plus Jakarta Sans".to_string()
}

pub fn default_font_size() -> String {
    "14px".to_string()
}

pub fn default_project_column_align() -> String {
    "top".to_string()
}

pub fn default_update_check_interval() -> String {
    "30min".to_string()
}

pub fn default_has_onboarded() -> bool {
    false
}

pub fn default_floating_sidebar_enabled() -> bool {
    true
}

pub fn default_floating_sidebar_position() -> String {
    "right".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root_path: PathBuf,
    #[serde(default)]
    pub env_profiles: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub quick_commands: Vec<Template>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentInstance {
    pub id: String,
    pub project_id: String,
    pub command: String,
    pub arguments: Vec<String>,
    pub status: String,   // "running", "success", "failed", "interrupted"
    pub env_mode: String, // "inherit" or "isolated"
    #[serde(default)]
    pub custom_envs: HashMap<String, String>,
    pub start_time: String,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GlobalSkillTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    #[serde(default)]
    pub files: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GlobalDocTemplate {
    pub id: String,
    pub alias: String,
    pub default_filename: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LoomStorage {
    #[serde(default)]
    pub cli_tools: Vec<CliTool>,
    #[serde(default)]
    pub categories: Vec<Category>,
    #[serde(default)]
    pub templates: Vec<Template>,
    #[serde(default)]
    pub env_vars: Vec<GlobalEnvVar>,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_project_column_align")]
    pub project_column_align: String,
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub agent_instances: Vec<AgentInstance>,
    #[serde(default)]
    pub global_skills: Vec<GlobalSkillTemplate>,
    #[serde(default)]
    pub global_docs: Vec<GlobalDocTemplate>,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub skipped_version: Option<String>,
    #[serde(default = "default_update_check_interval")]
    pub update_check_interval: String,
    #[serde(default = "default_has_onboarded")]
    pub has_onboarded: bool,
    #[serde(default = "default_floating_sidebar_enabled")]
    pub floating_sidebar_enabled: bool,
    #[serde(default = "default_floating_sidebar_position")]
    pub floating_sidebar_position: String,
    #[serde(default)]
    pub agent_skill_map: HashMap<String, String>,
}

impl Default for LoomStorage {
    fn default() -> Self {
        Self {
            cli_tools: Vec::new(),
            categories: Vec::new(),
            templates: Vec::new(),
            env_vars: Vec::new(),
            language: default_language(),
            theme: default_theme(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            project_column_align: default_project_column_align(),
            projects: Vec::new(),
            agent_instances: Vec::new(),
            global_skills: Vec::new(),
            global_docs: Vec::new(),
            autostart: false,
            skipped_version: None,
            update_check_interval: default_update_check_interval(),
            has_onboarded: default_has_onboarded(),
            floating_sidebar_enabled: default_floating_sidebar_enabled(),
            floating_sidebar_position: default_floating_sidebar_position(),
            agent_skill_map: HashMap::new(),
        }
    }
}

pub type AppConfig = LoomStorage;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectSkill {
    pub name: String,
    pub enabled: bool,
    pub source: String,
    pub skill_path: String,
    pub computed_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentDoc {
    pub relative_path: String,
    pub absolute_path: PathBuf,
    pub file_name: String,
}
