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
    "dark".to_string()
}

pub fn default_font_family() -> String {
    "Plus Jakarta Sans".to_string()
}

pub fn default_font_size() -> String {
    "14px".to_string()
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
    pub status: String, // "running", "success", "failed", "interrupted"
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
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub agent_instances: Vec<AgentInstance>,
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
            projects: Vec::new(),
            agent_instances: Vec::new(),
        }
    }
}

pub type AppConfig = LoomStorage;


