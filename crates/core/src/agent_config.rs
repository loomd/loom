use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentDiscoveryStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub executable_path: Option<String>,
    pub install_command: String,
    pub download_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveryOverview {
    pub agents: Vec<AgentDiscoveryStatus>,
    pub npm_installed: bool,
    pub npm_path: Option<String>,
    pub node_install_command: String,
    pub node_download_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchedModel {
    pub id: String,
    pub name: Option<String>,
    pub owned_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelsResponse {
    pub data: Vec<FetchedModel>,
}

/// 收集需要搜索可执行文件的目录。
/// 进程启动时捕获的 `PATH` 可能已过期（例如刚通过 winget 安装 Node.js 后），
/// 因此 Windows 上额外从注册表实时读取持久化的 PATH，保证能发现新安装的工具。
fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    dirs.extend(
        crate::storage::manager::registry_path_entries()
            .into_iter()
            .map(PathBuf::from),
    );

    if let Ok(path_val) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&path_val));
    }

    dirs
}

fn check_executable(name: &str) -> Option<String> {
    // Windows 上优先匹配带可执行扩展名的 shim（npm 生成的 opencode.cmd / opencode.ps1），
    // 无扩展名的 bash 脚本无法直接运行且通不过 import_cli_tool 的校验，仅作最后回退。
    let candidates = [
        format!("{}.exe", name),
        format!("{}.cmd", name),
        format!("{}.bat", name),
        format!("{}.ps1", name),
        name.to_string(),
    ];

    for dir in search_dirs() {
        for cand in &candidates {
            let path = dir.join(cand);
            if path.is_file() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }
    None
}

pub fn discover_agents() -> DiscoveryOverview {
    let mut agents = Vec::new();

    // npm check
    let npm_path = check_executable("npm");
    let npm_installed = npm_path.is_some();

    // 1. OpenCode
    // 仅探测可执行文件是否存在，绝不执行 `--version` 等子命令：
    // 1) 违反安全规则（禁止执行 PATH 扫描发现的 CLI 工具）；
    // 2) 启动外部进程会阻塞 IPC 线程，导致切换页面卡顿。
    let opencode_path = check_executable("opencode");
    let opencode_installed = opencode_path.is_some();

    agents.push(AgentDiscoveryStatus {
        name: "opencode".to_string(),
        installed: opencode_installed,
        version: None,
        executable_path: opencode_path,
        install_command: "npm install -g opencode-ai".to_string(),
        download_url: "https://opencode.ai/docs/zh-cn".to_string(),
    });

    let node_install_command = "winget install OpenJS.NodeJS".to_string();

    DiscoveryOverview {
        agents,
        npm_installed,
        npm_path,
        node_install_command,
        node_download_url: "https://nodejs.org/".to_string(),
    }
}

pub fn fetch_models(base_url: &str, api_key: &str) -> Result<Vec<FetchedModel>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let trimmed_base = base_url.trim_end_matches('/');
    let url = if trimmed_base.ends_with("/v1") {
        format!("{}/models", trimmed_base)
    } else {
        format!("{}/v1/models", trimmed_base)
    };

    let mut req = client.get(&url);
    if !api_key.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = req.send().map_err(|e| format!("Failed to send request to {}: {}", url, e))?;

    if !resp.status().is_success() {
        return Err(format!("Server returned error HTTP status {}: {}", resp.status(), resp.text().unwrap_or_default()));
    }

    let body = resp.text().map_err(|e| format!("Failed to read response body: {}", e))?;
    let parsed: ModelsResponse = serde_json::from_str(&body).map_err(|e| format!("Failed to parse models response JSON: {}", e))?;

    Ok(parsed.data)
}

pub fn write_opencode_config(
    provider_name: &str,
    base_url: &str,
    api_key: &str,
    selected_models: &[String],
) -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find user home directory".to_string())?;
    let opencode_config_dir = home.join(".config").join("opencode");
    fs::create_dir_all(&opencode_config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;

    let config_file = opencode_config_dir.join("opencode.json");

    let mut existing_config: serde_json::Value = if config_file.exists() {
        let content = fs::read_to_string(&config_file).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let provider_key = if provider_name.is_empty() { "custom" } else { provider_name };

    let mut provider_models = serde_json::Map::new();
    for m in selected_models {
        let mut model_obj = serde_json::Map::new();
        model_obj.insert("name".to_string(), serde_json::Value::String(m.clone()));
        provider_models.insert(m.clone(), serde_json::Value::Object(model_obj));
    }

    let provider_config = serde_json::json!({
        "npmPackage": "@ai-sdk/openai",
        "name": provider_key,
        "options": {
            "baseURL": base_url,
            "apiKey": api_key
        },
        "models": provider_models
    });

    if existing_config.get("provider").is_none() {
        existing_config["provider"] = serde_json::json!({});
    }

    existing_config["provider"][provider_key] = provider_config;

    let formatted_json = serde_json::to_string_pretty(&existing_config)
        .map_err(|e| format!("Failed to serialize opencode.json: {}", e))?;

    // Atomic write to prevent file corruption
    let tmp_file = config_file.with_extension("json.tmp");
    fs::write(&tmp_file, &formatted_json).map_err(|e| format!("Failed to write tmp opencode.json: {}", e))?;
    fs::rename(&tmp_file, &config_file).map_err(|e| format!("Failed to rename opencode.json: {}", e))?;

    Ok(config_file.to_string_lossy().to_string())
}
