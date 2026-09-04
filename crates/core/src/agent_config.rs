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

pub fn resolve_models_request(base_url: &str, api_key: &str, protocol: Option<&str>) -> (String, bool, bool) {
    let trimmed_base = base_url.trim().trim_end_matches('/');
    let proto = protocol.unwrap_or("openai").trim().to_ascii_lowercase();
    let is_gemini = proto == "gemini";
    let is_anthropic = proto == "anthropic";

    let mut url = if trimmed_base.ends_with("/models") {
        trimmed_base.to_string()
    } else if trimmed_base.ends_with("/v1beta")
        || trimmed_base.ends_with("/v1alpha")
        || trimmed_base.ends_with("/v1")
        || trimmed_base.ends_with("/v2")
    {
        format!("{}/models", trimmed_base)
    } else if is_gemini {
        format!("{}/v1beta/models", trimmed_base)
    } else {
        format!("{}/v1/models", trimmed_base)
    };

    let key = api_key.trim();
    if is_gemini && !key.is_empty() && !url.contains("key=") {
        let separator = if url.contains('?') { '&' } else { '?' };
        url = format!("{}{}{}key={}", url, separator, "", key);
    }

    (url, is_gemini, is_anthropic)
}

pub fn fetch_models(base_url: &str, api_key: &str, protocol: Option<&str>) -> Result<Vec<FetchedModel>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let (url, is_gemini, is_anthropic) = resolve_models_request(base_url, api_key, protocol);
    let key = api_key.trim();

    let mut req = client.get(&url);
    if !key.is_empty() {
        if is_anthropic {
            req = req
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .header("Authorization", format!("Bearer {}", key));
        } else if is_gemini {
            req = req
                .header("x-goog-api-key", key)
                .header("Authorization", format!("Bearer {}", key));
        } else {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let resp = req.send().map_err(|e| format!("Failed to send request to {}: {}", url, e))?;

    if !resp.status().is_success() {
        return Err(format!("Server returned error HTTP status {}: {}", resp.status(), resp.text().unwrap_or_default()));
    }

    let body = resp.text().map_err(|e| format!("Failed to read response body: {}", e))?;
    let json_val: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("Failed to parse models response JSON: {}", e))?;

    let items: Vec<serde_json::Value> = if let Some(arr) = json_val.get("data").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = json_val.get("models").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = json_val.as_array() {
        arr.clone()
    } else {
        return Err("Unexpected models response format (expected 'data' or 'models' array)".to_string());
    };

    let mut result = Vec::new();
    for item in items {
        let raw_id = item.get("id").and_then(|v| v.as_str())
            .or_else(|| item.get("name").and_then(|v| v.as_str()));

        if let Some(id_str) = raw_id {
            // Strip 'models/' prefix if present (common in Gemini API response)
            let clean_id = id_str.strip_prefix("models/").unwrap_or(id_str).to_string();
            let display_name = item.get("displayName")
                .or_else(|| item.get("display_name"))
                .or_else(|| item.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let owned_by = item.get("owned_by")
                .or_else(|| item.get("ownedBy"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            result.push(FetchedModel {
                id: clean_id,
                name: display_name,
                owned_by,
            });
        }
    }

    Ok(result)
}

pub fn build_provider_config(
    provider_name: &str,
    protocol: &str,
    base_url: &str,
    api_key: &str,
    selected_models: &[String],
) -> serde_json::Value {
    let provider_key = if provider_name.is_empty() { "custom" } else { provider_name };

    let mut provider_models = serde_json::Map::new();
    for m in selected_models {
        let mut model_obj = serde_json::Map::new();
        model_obj.insert("name".to_string(), serde_json::Value::String(m.clone()));
        provider_models.insert(m.clone(), serde_json::Value::Object(model_obj));
    }

    let proto = protocol.to_ascii_lowercase();
    match proto.as_str() {
        "anthropic" => {
            serde_json::json!({
                "name": provider_key,
                "npm": "@ai-sdk/anthropic",
                "options": {
                    "baseURL": base_url,
                    "apiKey": api_key
                },
                "models": provider_models
            })
        }
        "gemini" => {
            serde_json::json!({
                "name": provider_key,
                "npm": "@ai-sdk/google",
                "options": {
                    "baseURL": base_url,
                    "apiKey": api_key
                },
                "models": provider_models
            })
        }
        _ => {
            serde_json::json!({
                "name": provider_key,
                "npmPackage": "@ai-sdk/openai",
                "options": {
                    "baseURL": base_url,
                    "apiKey": api_key
                },
                "models": provider_models
            })
        }
    }
}

pub fn write_opencode_config(
    provider_name: &str,
    protocol: &str,
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
    let provider_config = build_provider_config(provider_name, protocol, base_url, api_key, selected_models);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_provider_config_openai() {
        let models = vec!["gpt-4o".to_string(), "gpt-4o-mini".to_string()];
        let val = build_provider_config("openai_test", "openai", "https://api.openai.com/v1", "key123", &models);
        assert_eq!(val["name"], "openai_test");
        assert_eq!(val["npmPackage"], "@ai-sdk/openai");
        assert_eq!(val["options"]["baseURL"], "https://api.openai.com/v1");
        assert_eq!(val["options"]["apiKey"], "key123");
        assert!(val["models"]["gpt-4o"].is_object());
        assert!(val["models"]["gpt-4o-mini"].is_object());
    }

    #[test]
    fn test_build_provider_config_anthropic() {
        let models = vec!["claude-3-5-sonnet".to_string()];
        let val = build_provider_config("anthropic_test", "anthropic", "https://api.anthropic.com/v1", "key456", &models);
        assert_eq!(val["name"], "anthropic_test");
        assert_eq!(val["npm"], "@ai-sdk/anthropic");
        assert_eq!(val["options"]["baseURL"], "https://api.anthropic.com/v1");
        assert_eq!(val["options"]["apiKey"], "key456");
        assert!(val["models"]["claude-3-5-sonnet"].is_object());
    }

    #[test]
    fn test_build_provider_config_gemini() {
        let models = vec!["gemini-1.5-pro".to_string()];
        let val = build_provider_config("gemini_test", "gemini", "https://generativelanguage.googleapis.com/v1beta", "key789", &models);
        assert_eq!(val["name"], "gemini_test");
        assert_eq!(val["npm"], "@ai-sdk/google");
        assert_eq!(val["options"]["baseURL"], "https://generativelanguage.googleapis.com/v1beta");
        assert_eq!(val["options"]["apiKey"], "key789");
        assert!(val["models"]["gemini-1.5-pro"].is_object());
    }

    #[test]
    fn test_resolve_models_request_gemini_with_v1beta() {
        let (url, is_gemini, _) = resolve_models_request("http://127.0.0.1:8045/v1beta", "sk-123", Some("gemini"));
        assert!(is_gemini);
        assert_eq!(url, "http://127.0.0.1:8045/v1beta/models?key=sk-123");
    }

    #[test]
    fn test_resolve_models_request_gemini_without_version() {
        let (url, is_gemini, _) = resolve_models_request("http://127.0.0.1:8045", "sk-123", Some("gemini"));
        assert!(is_gemini);
        assert_eq!(url, "http://127.0.0.1:8045/v1beta/models?key=sk-123");
    }

    #[test]
    fn test_resolve_models_request_openai_with_v1beta() {
        // Even if protocol is None/openai, entering /v1beta should not produce /v1beta/v1/models
        let (url, _, _) = resolve_models_request("http://127.0.0.1:8045/v1beta", "", None);
        assert_eq!(url, "http://127.0.0.1:8045/v1beta/models");
    }

    #[test]
    fn test_resolve_models_request_openai_with_v1() {
        let (url, _, _) = resolve_models_request("https://api.openai.com/v1", "sk-test", Some("openai"));
        assert_eq!(url, "https://api.openai.com/v1/models");
    }
}
