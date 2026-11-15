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

/// 静态探测 mcode 当前安装版本（读取 current 文件或 package.json，严禁执行外部二进制）
fn detect_mcode_version(executable_path: Option<&str>) -> Option<String> {
    // 1. 尝试从可执行文件所在目录及其父级查找 current
    if let Some(path_str) = executable_path {
        let exe_path = PathBuf::from(path_str);
        if let Some(parent) = exe_path.parent() {
            let current_path = parent.join("current");
            if let Ok(content) = fs::read_to_string(&current_path) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    // 2. 尝试从用户主目录 ~/.minimax-code/current 读取
    if let Some(home) = dirs::home_dir() {
        let current_path = home.join(".minimax-code").join("current");
        if let Ok(content) = fs::read_to_string(&current_path) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

/// 静态探测 opencode 当前安装版本（读取 node_modules/opencode-ai/package.json，严禁执行外部二进制）
fn detect_opencode_version(executable_path: Option<&str>) -> Option<String> {
    let mut candidate_package_jsons: Vec<PathBuf> = Vec::new();

    if let Some(path_str) = executable_path {
        let exe_path = PathBuf::from(path_str);
        if let Some(parent) = exe_path.parent() {
            // Windows 下全局 npm 模块通常位于 bin 所在目录的同级 node_modules
            candidate_package_jsons.push(parent.join("node_modules").join("opencode-ai").join("package.json"));
            // Linux/macOS 下 bin 同级的 ../lib/node_modules
            if let Some(grandparent) = parent.parent() {
                candidate_package_jsons.push(grandparent.join("lib").join("node_modules").join("opencode-ai").join("package.json"));
            }
        }
        // 如果是符号链接，尝试解析真实路径定位 package.json
        if let Ok(real_path) = fs::canonicalize(&exe_path) {
            if let Some(parent) = real_path.parent() {
                candidate_package_jsons.push(parent.join("package.json"));
                if let Some(grandparent) = parent.parent() {
                    candidate_package_jsons.push(grandparent.join("package.json"));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = dirs::data_dir() {
        candidate_package_jsons.push(appdata.join("npm").join("node_modules").join("opencode-ai").join("package.json"));
    }

    if let Some(home) = dirs::home_dir() {
        candidate_package_jsons.push(home.join(".npm-global").join("lib").join("node_modules").join("opencode-ai").join("package.json"));
    }

    for path in candidate_package_jsons {
        if path.is_file() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }

    None
}

/// 静态探测 agy 当前安装版本（读取 package.json、scoop manifest、version 文件或最新运行日志，严禁执行外部二进制）
fn detect_agy_version(executable_path: Option<&str>) -> Option<String> {
    let mut candidate_package_jsons: Vec<PathBuf> = Vec::new();
    let mut candidate_manifest_jsons: Vec<PathBuf> = Vec::new();

    if let Some(path_str) = executable_path {
        let exe_path = PathBuf::from(path_str);

        // Windows 下若为 scoop shim（例如 agy.exe 配套 agy.shim），解析 shim 获取真实二进制路径
        let shim_path = exe_path.with_extension("shim");
        if shim_path.is_file() {
            if let Ok(content) = fs::read_to_string(&shim_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("path =") || trimmed.starts_with("path=") {
                        let raw = trimmed.split('=').nth(1).unwrap_or("").trim().trim_matches('"');
                        let target = PathBuf::from(raw);
                        if let Some(p) = target.parent() {
                            candidate_manifest_jsons.push(p.join("scoop-manifest.json"));
                            candidate_manifest_jsons.push(p.join("scoop-install.json"));
                            candidate_manifest_jsons.push(p.join("manifest.json"));
                            if let Some(gp) = p.parent() {
                                candidate_manifest_jsons.push(gp.join("current").join("scoop-manifest.json"));
                                candidate_manifest_jsons.push(gp.join("current").join("scoop-install.json"));
                            }
                        }
                    }
                }
            }
        }

        if let Some(parent) = exe_path.parent() {
            candidate_manifest_jsons.push(parent.join("scoop-manifest.json"));
            candidate_manifest_jsons.push(parent.join("scoop-install.json"));
            candidate_manifest_jsons.push(parent.join("manifest.json"));

            // npm 全局安装场景：Windows 下 bin 同级的 node_modules/@google/antigravity-cli/package.json
            candidate_package_jsons.push(parent.join("node_modules").join("@google").join("antigravity-cli").join("package.json"));
            candidate_package_jsons.push(parent.join("node_modules").join("antigravity-cli").join("package.json"));
            // Linux/macOS 下 ../lib/node_modules/@google/antigravity-cli/package.json
            if let Some(grandparent) = parent.parent() {
                candidate_manifest_jsons.push(grandparent.join("current").join("scoop-manifest.json"));
                candidate_manifest_jsons.push(grandparent.join("current").join("scoop-install.json"));
                candidate_package_jsons.push(grandparent.join("lib").join("node_modules").join("@google").join("antigravity-cli").join("package.json"));
                candidate_package_jsons.push(grandparent.join("lib").join("node_modules").join("antigravity-cli").join("package.json"));
            }
        }
        if let Ok(real_path) = fs::canonicalize(&exe_path) {
            if let Some(parent) = real_path.parent() {
                candidate_manifest_jsons.push(parent.join("scoop-manifest.json"));
                candidate_manifest_jsons.push(parent.join("scoop-install.json"));
                candidate_package_jsons.push(parent.join("package.json"));
                if let Some(grandparent) = parent.parent() {
                    candidate_manifest_jsons.push(grandparent.join("current").join("scoop-manifest.json"));
                    candidate_manifest_jsons.push(grandparent.join("current").join("scoop-install.json"));
                    candidate_package_jsons.push(grandparent.join("package.json"));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = dirs::data_dir() {
        candidate_package_jsons.push(appdata.join("npm").join("node_modules").join("@google").join("antigravity-cli").join("package.json"));
        candidate_package_jsons.push(appdata.join("npm").join("node_modules").join("antigravity-cli").join("package.json"));
    }

    if let Some(home) = dirs::home_dir() {
        candidate_manifest_jsons.push(home.join("scoop").join("apps").join("antigravity-cli").join("current").join("scoop-manifest.json"));
        candidate_manifest_jsons.push(home.join("scoop").join("apps").join("antigravity-cli").join("current").join("scoop-install.json"));
        candidate_manifest_jsons.push(home.join(".scoop").join("apps").join("antigravity-cli").join("current").join("scoop-manifest.json"));
        candidate_package_jsons.push(home.join(".npm-global").join("lib").join("node_modules").join("@google").join("antigravity-cli").join("package.json"));
        candidate_package_jsons.push(home.join(".gemini").join("antigravity-cli").join("package.json"));
        candidate_package_jsons.push(home.join(".antigravity").join("package.json"));
    }

    // 优先从 scoop manifest / install json 读取 version
    for path in candidate_manifest_jsons {
        if path.is_file() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                        let trimmed = v.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }

    for path in candidate_package_jsons {
        if path.is_file() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                        return Some(v.to_string());
                    }
                }
            }
        }
    }

    // 尝试从 ~/.gemini/antigravity-cli/version 读取
    if let Some(home) = dirs::home_dir() {
        let ver_file = home.join(".gemini").join("antigravity-cli").join("version");
        if let Ok(content) = fs::read_to_string(&ver_file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }

        // 尝试从 ~/.gemini/antigravity-cli/log 查找最新日志中的 "Language server version: x.y.z"
        let log_dir = home.join(".gemini").join("antigravity-cli").join("log");
        if let Ok(entries) = fs::read_dir(&log_dir) {
            let mut log_files: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|ext| ext == "log").unwrap_or(false))
                .collect();
            // 文件名格式为 cli-YYYYMMDD_HHMMSS.log，按文件名倒序排序即为最新日志
            log_files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

            for log_file in log_files.iter().take(5) {
                if let Ok(content) = fs::read_to_string(log_file) {
                    for line in content.lines().take(60) {
                        if let Some(idx) = line.find("Language server version:") {
                            let part = &line[idx + "Language server version:".len()..];
                            let ver = part.trim();
                            if !ver.is_empty() {
                                return Some(ver.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// 联网查询 Agent 最新发布版本（查询 npmjs 官方 registry 或官方更新清单）
pub fn fetch_agent_latest_version(agent_name: &str) -> Result<String, String> {
    let lower = agent_name.to_lowercase();
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(3))
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    if lower == "agy" || lower == "antigravity" {
        // 请求 Antigravity CLI 官方 auto-updater manifest
        let manifest_file = if cfg!(target_os = "windows") {
            if cfg!(target_arch = "aarch64") {
                "windows_arm64.json"
            } else {
                "windows_amd64.json"
            }
        } else if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") {
                "darwin_arm64.json"
            } else {
                "darwin_amd64.json"
            }
        } else if cfg!(target_arch = "aarch64") {
            "linux_arm64.json"
        } else {
            "linux_amd64.json"
        };

        let primary_url = format!(
            "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/{}",
            manifest_file
        );

        match client.get(&primary_url).header("User-Agent", "loom").send() {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(json) = resp.json::<serde_json::Value>() {
                    if let Some(ver) = json.get("version").and_then(|v| v.as_str()) {
                        return Ok(ver.to_string());
                    }
                }
                Err("Failed to parse version from updater manifest".to_string())
            }
            Ok(resp) => Err(format!("HTTP {}", resp.status())),
            Err(e) => {
                // 回退尝试跨平台 linux_amd64.json
                let fallback_url = "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/linux_amd64.json";
                if let Ok(resp2) = client.get(fallback_url).header("User-Agent", "loom").send() {
                    if resp2.status().is_success() {
                        if let Ok(json) = resp2.json::<serde_json::Value>() {
                            if let Some(ver) = json.get("version").and_then(|v| v.as_str()) {
                                return Ok(ver.to_string());
                            }
                        }
                    }
                }
                Err(e.to_string())
            }
        }
    } else {
        let (pkg_name, is_scoped) = match lower.as_str() {
            "opencode" => ("opencode-ai", false),
            "mcode" => ("@minimax-ai/code", true),
            other => return Err(format!("Unsupported agent: {}", other)),
        };

        let url = if is_scoped {
            format!("https://registry.npmjs.org/{}/latest", pkg_name.replace('/', "%2F"))
        } else {
            format!("https://registry.npmjs.org/{}/latest", pkg_name)
        };

        match client.get(&url).header("User-Agent", "loom").send() {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Ok(json) = resp.json::<serde_json::Value>() {
                        if let Some(ver) = json.get("version").and_then(|v| v.as_str()) {
                            return Ok(ver.to_string());
                        }
                    }
                    Err("Failed to parse version from response".to_string())
                } else {
                    Err(format!("HTTP {}", resp.status()))
                }
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

pub fn discover_agents() -> DiscoveryOverview {
    let mut agents = Vec::new();

    // npm check
    let npm_path = check_executable("npm");
    let npm_installed = npm_path.is_some();

    // 1. OpenCode
    // 仅探测可执行文件是否存在与读取静态 package.json，绝不执行 `--version` 等子命令：
    // 1) 严格遵守安全规则（禁止执行 PATH 扫描发现的 CLI 工具）；
    // 2) 避免启动外部进程阻塞 IPC 线程导致切页卡顿。
    let opencode_path = check_executable("opencode");
    let opencode_installed = opencode_path.is_some();
    let opencode_version = if opencode_installed {
        detect_opencode_version(opencode_path.as_deref())
    } else {
        None
    };

    agents.push(AgentDiscoveryStatus {
        name: "opencode".to_string(),
        installed: opencode_installed,
        version: opencode_version,
        executable_path: opencode_path,
        install_command: "npm install -g opencode-ai".to_string(),
        download_url: "https://opencode.ai/docs/zh-cn".to_string(),
    });

    // 2. Mcode
    let mcode_path = check_executable("mcode");
    let mcode_installed = mcode_path.is_some();
    let mcode_version = if mcode_installed {
        detect_mcode_version(mcode_path.as_deref())
    } else {
        None
    };

    agents.push(AgentDiscoveryStatus {
        name: "mcode".to_string(),
        installed: mcode_installed,
        version: mcode_version,
        executable_path: mcode_path,
        install_command: "irm https://filecdn.minimax.chat/public/install.ps1 | iex".to_string(),
        download_url: "https://www.minimaxi.com/".to_string(),
    });

    // 3. Antigravity CLI (agy)
    let agy_path = check_executable("agy").or_else(|| {
        #[cfg(target_os = "windows")]
        if let Some(local_appdata) = dirs::data_local_dir() {
            let winget_agy = local_appdata.join("Microsoft").join("WinGet").join("Links").join("agy.exe");
            if winget_agy.is_file() {
                return Some(winget_agy.to_string_lossy().to_string());
            }
        }

        if let Some(home) = dirs::home_dir() {
            let candidates = [
                home.join(".gemini").join("antigravity-cli").join("bin").join("agy.cmd"),
                home.join(".gemini").join("antigravity-cli").join("bin").join("agy.exe"),
                home.join(".gemini").join("antigravity-cli").join("bin").join("agy"),
                home.join("scoop").join("shims").join("agy.exe"),
                home.join(".scoop").join("shims").join("agy.exe"),
                home.join(".antigravity").join("bin").join("agy.cmd"),
                home.join(".antigravity").join("bin").join("agy.exe"),
                home.join(".antigravity").join("bin").join("agy"),
            ];
            for cand in candidates {
                if cand.is_file() {
                    return Some(cand.to_string_lossy().to_string());
                }
            }
        }
        None
    });
    let agy_installed = agy_path.is_some();
    let agy_version = if agy_installed {
        detect_agy_version(agy_path.as_deref())
    } else {
        None
    };

    agents.push(AgentDiscoveryStatus {
        name: "agy".to_string(),
        installed: agy_installed,
        version: agy_version,
        executable_path: agy_path,
        install_command: if cfg!(target_os = "windows") {
            "irm https://antigravity.google/cli/install.ps1 | iex".to_string()
        } else {
            "curl -fsSL https://antigravity.google/cli/install.sh | bash".to_string()
        },
        download_url: "https://antigravity.google/".to_string(),
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

pub fn fetch_models_blocking(
    base_url: &str,
    api_key: &str,
    protocol: Option<&str>,
) -> Result<Vec<FetchedModel>, String> {
    let (url, is_gemini, is_anthropic) = resolve_models_request(base_url, api_key, protocol);

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut req = client.get(&url);

    let key = api_key.trim();
    if !key.is_empty() {
        if is_anthropic {
            req = req.header("x-api-key", key);
            req = req.header("anthropic-version", "2023-06-01");
        } else if !is_gemini {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let resp = req.send().map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        return Err(format!("Server returned error status {}: {}", status, body));
    }

    let json_val: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let mut result = Vec::new();

    // Check if models are in `data` (OpenAI style) or `models` (Gemini style)
    let models_array = json_val
        .get("data")
        .and_then(|v| v.as_array())
        .or_else(|| json_val.get("models").and_then(|v| v.as_array()))
        .or_else(|| json_val.as_array());

    let arr = match models_array {
        Some(a) => a,
        None => return Err(format!("Unrecognized models payload structure: {:?}", json_val)),
    };

    for item in arr {
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

pub fn fetch_models(
    base_url: &str,
    api_key: &str,
    protocol: Option<&str>,
) -> Result<Vec<FetchedModel>, String> {
    fetch_models_blocking(base_url, api_key, protocol)
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

/// 清理 Base URL 中可能附带的用户备注、注释与多余字符。
/// 例如用户从文档、微信或表格复制时粘入的：
/// `https://code.ai80.vip (站点根路径)` -> `https://code.ai80.vip`
/// `https://code.ai80.vip（官方推荐）` -> `https://code.ai80.vip`
/// `https://code.ai80.vip # 站点根路径` -> `https://code.ai80.vip`
/// `https://code.ai80.vip // 备注` -> `https://code.ai80.vip`
/// `https://code.ai80.vip【推荐地址】` -> `https://code.ai80.vip`
pub fn clean_base_url_comment(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return String::new();
    }

    // 1. 去除包裹的引号与代码块反引号
    s = s.trim_matches(|c| c == '"' || c == '\'' || c == '`').trim().to_string();

    // 2. 去除 Markdown 列表前缀，如 "- https://...", "* https://...", "1. https://..."
    if let Some(stripped) = s.strip_prefix("- ").or_else(|| s.strip_prefix("* ")).or_else(|| s.strip_prefix("+ ")) {
        s = stripped.trim().to_string();
    } else if let Some(idx) = s.find(". http") {
        s = s[idx + 2..].trim().to_string();
    }

    // 3. 处理注释符号：
    // 3.1 处理 '#' 注释
    if let Some(idx) = s.find('#') {
        s = s[..idx].trim().to_string();
    }

    // 3.2 处理 '//' 注释（跳过协议开头的 http:// 或 https://）
    let scheme_offset = if s.starts_with("https://") {
        8
    } else if s.starts_with("http://") {
        7
    } else {
        0
    };
    if let Some(idx) = s[scheme_offset..].find("//") {
        s = s[..scheme_offset + idx].trim().to_string();
    }

    // 3.3 处理 /* ... */ 块注释
    if let Some(idx) = s.find("/*") {
        s = s[..idx].trim().to_string();
    }

    // 3.4 处理 SQL / 连字符风格注释 '--'（非 host 部分）
    if let Some(idx) = s[scheme_offset..].find(" --") {
        s = s[..scheme_offset + idx].trim().to_string();
    }

    // 3.5 处理分号注释 ';' 或 '；'
    if let Some(idx) = s.find([';', '；']) {
        s = s[..idx].trim().to_string();
    }

    // 4. 清理各种括号备注：
    // 英文括号 ()、中文全角括号（）、方括号 []、全角方括号【】、尖括号 <>、花括号 {}
    let bracket_chars = ['(', '（', '[', '【', '<', '{', '《', '“', '‘'];
    if let Some(idx) = s.find(bracket_chars) {
        s = s[..idx].trim().to_string();
    }

    // 5. 空白字符切分：URL 本身不包含裸空格或全角空格，若后面跟说明文字截取空格前内容
    if let Some(idx) = s.find(|c: char| c.is_whitespace() || c == '　') {
        s = s[..idx].trim().to_string();
    }

    // 6. 清除末尾可能残留的标点符号
    s = s.trim_end_matches(|c: char| {
        c == '/' || c == ',' || c == '，' || c == '。' || c == '-' || c == '_' || c == ':' || c == '：'
    }).trim().to_string();

    s
}

pub fn normalize_mcode_base_url(base_url: &str) -> String {
    let cleaned = clean_base_url_comment(base_url);
    let mut trimmed = cleaned.as_str();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with("/models") {
        trimmed = trimmed.strip_suffix("/models").unwrap().trim_end_matches('/');
    }
    if trimmed.ends_with("/v1")
        || trimmed.ends_with("/v1beta")
        || trimmed.ends_with("/v1alpha")
        || trimmed.ends_with("/v2")
    {
        trimmed.to_string()
    } else {
        format!("{}/v1", trimmed)
    }
}

pub fn build_mcode_provider_config(
    provider_name: &str,
    protocol: &str,
    base_url: &str,
    api_key: &str,
    selected_models: &[String],
) -> serde_yaml::Value {
    let provider_key = if provider_name.is_empty() { "custom" } else { provider_name };
    let proto = protocol.to_ascii_lowercase();
    let api_type = match proto.as_str() {
        "anthropic" => "anthropic-messages",
        _ => "openai-completions",
    };

    let mut models_map = serde_yaml::Mapping::new();
    for m in selected_models {
        let mut model_fields = serde_yaml::Mapping::new();
        model_fields.insert(
            serde_yaml::Value::String("name".to_string()),
            serde_yaml::Value::String(m.clone()),
        );
        model_fields.insert(
            serde_yaml::Value::String("attachment".to_string()),
            serde_yaml::Value::Bool(true),
        );
        model_fields.insert(
            serde_yaml::Value::String("reasoning".to_string()),
            serde_yaml::Value::Bool(true),
        );
        model_fields.insert(
            serde_yaml::Value::String("temperature".to_string()),
            serde_yaml::Value::Bool(true),
        );
        model_fields.insert(
            serde_yaml::Value::String("tool_call".to_string()),
            serde_yaml::Value::Bool(true),
        );

        let mut limit_fields = serde_yaml::Mapping::new();
        limit_fields.insert(
            serde_yaml::Value::String("context".to_string()),
            serde_yaml::Value::Number(1000000.into()),
        );
        limit_fields.insert(
            serde_yaml::Value::String("output".to_string()),
            serde_yaml::Value::Number(64000.into()),
        );
        model_fields.insert(
            serde_yaml::Value::String("limit".to_string()),
            serde_yaml::Value::Mapping(limit_fields),
        );

        let mut modalities_fields = serde_yaml::Mapping::new();
        modalities_fields.insert(
            serde_yaml::Value::String("input".to_string()),
            serde_yaml::Value::Sequence(vec![
                serde_yaml::Value::String("text".to_string()),
                serde_yaml::Value::String("image".to_string()),
            ]),
        );
        modalities_fields.insert(
            serde_yaml::Value::String("output".to_string()),
            serde_yaml::Value::Sequence(vec![
                serde_yaml::Value::String("text".to_string()),
            ]),
        );
        model_fields.insert(
            serde_yaml::Value::String("modalities".to_string()),
            serde_yaml::Value::Mapping(modalities_fields),
        );

        let mut thinking_fields = serde_yaml::Mapping::new();
        thinking_fields.insert(
            serde_yaml::Value::String("mode".to_string()),
            serde_yaml::Value::String("switchable".to_string()),
        );
        thinking_fields.insert(
            serde_yaml::Value::String("default_value".to_string()),
            serde_yaml::Value::String("true".to_string()),
        );
        model_fields.insert(
            serde_yaml::Value::String("thinking_config".to_string()),
            serde_yaml::Value::Mapping(thinking_fields),
        );

        models_map.insert(
            serde_yaml::Value::String(m.clone()),
            serde_yaml::Value::Mapping(model_fields),
        );
    }

    let normalized_base_url = normalize_mcode_base_url(base_url);

    let mut options_map = serde_yaml::Mapping::new();
    options_map.insert(
        serde_yaml::Value::String("apiKey".to_string()),
        serde_yaml::Value::String(api_key.to_string()),
    );
    options_map.insert(
        serde_yaml::Value::String("baseURL".to_string()),
        serde_yaml::Value::String(normalized_base_url),
    );
    options_map.insert(
        serde_yaml::Value::String("authMode".to_string()),
        serde_yaml::Value::String("api-key".to_string()),
    );

    let mut provider_entry = serde_yaml::Mapping::new();
    provider_entry.insert(
        serde_yaml::Value::String("name".to_string()),
        serde_yaml::Value::String(provider_key.to_string()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("kind".to_string()),
        serde_yaml::Value::String("custom".to_string()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("enabled".to_string()),
        serde_yaml::Value::Bool(true),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api".to_string()),
        serde_yaml::Value::String(api_type.to_string()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("options".to_string()),
        serde_yaml::Value::Mapping(options_map),
    );
    provider_entry.insert(
        serde_yaml::Value::String("models".to_string()),
        serde_yaml::Value::Mapping(models_map),
    );

    serde_yaml::Value::Mapping(provider_entry)
}

pub fn write_mcode_config_to_path(
    config_file: &std::path::Path,
    provider_name: &str,
    protocol: &str,
    base_url: &str,
    api_key: &str,
    selected_models: &[String],
) -> Result<String, String> {
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let mut existing_val: serde_yaml::Value = if config_file.exists() {
        let content = fs::read_to_string(config_file).unwrap_or_else(|_| "".to_string());
        if content.trim().is_empty() {
            serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
        } else {
            serde_yaml::from_str(&content).unwrap_or_else(|_| serde_yaml::Value::Mapping(serde_yaml::Mapping::new()))
        }
    } else {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    };

    if !existing_val.is_mapping() {
        existing_val = serde_yaml::Value::Mapping(serde_yaml::Mapping::new());
    }

    let root_map = existing_val.as_mapping_mut().unwrap();
    let custom_provider_key = serde_yaml::Value::String("custom_provider".to_string());

    // 考虑不存在 custom_provider 或者 custom_provider 不是 mapping 的情况
    if !root_map.contains_key(&custom_provider_key) || !root_map.get(&custom_provider_key).is_some_and(|v| v.is_mapping()) {
        root_map.insert(custom_provider_key.clone(), serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
    }

    let custom_providers = root_map.get_mut(&custom_provider_key).unwrap().as_mapping_mut().unwrap();

    let provider_key = if provider_name.is_empty() { "custom" } else { provider_name };
    let provider_config = build_mcode_provider_config(provider_name, protocol, base_url, api_key, selected_models);

    custom_providers.insert(serde_yaml::Value::String(provider_key.to_string()), provider_config);

    let formatted_yaml = serde_yaml::to_string(&existing_val)
        .map_err(|e| format!("Failed to serialize config.yaml: {}", e))?;

    let tmp_file = config_file.with_extension("yaml.tmp");
    fs::write(&tmp_file, &formatted_yaml).map_err(|e| format!("Failed to write tmp config.yaml: {}", e))?;
    fs::rename(&tmp_file, config_file).map_err(|e| format!("Failed to rename config.yaml: {}", e))?;

    Ok(config_file.to_string_lossy().to_string())
}

pub fn write_mcode_config(
    provider_name: &str,
    protocol: &str,
    base_url: &str,
    api_key: &str,
    selected_models: &[String],
) -> Result<String, String> {
    let minimax_dir = if let Ok(dir) = std::env::var("MINIMAX_DATA_DIR") {
        std::path::PathBuf::from(dir)
    } else {
        let home = dirs::home_dir().ok_or_else(|| "Could not find user home directory".to_string())?;
        home.join(".minimax")
    };
    let config_file = minimax_dir.join("config.yaml");
    write_mcode_config_to_path(&config_file, provider_name, protocol, base_url, api_key, selected_models)
}

/// 格式化 agy 的 Google Gemini API Base URL。
/// 根据 https://docs.ai80.vip/antigravity/faq 规范：
/// GOOGLE_GEMINI_BASE_URL 必须为站点根路径，绝对不能带 /v1、/v1beta、/gemini 或 /antigravity，
/// 且自动清理用户输入中夹带的括号说明、注释等备注内容，因为 agy 会自动拼接 /v1beta。
pub fn normalize_agy_base_url(base_url: &str) -> String {
    let cleaned = clean_base_url_comment(base_url);
    let mut trimmed = cleaned.as_str();
    if trimmed.is_empty() {
        return String::new();
    }
    loop {
        let before = trimmed;
        if trimmed.ends_with("/models") {
            trimmed = trimmed.strip_suffix("/models").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/v1beta") {
            trimmed = trimmed.strip_suffix("/v1beta").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/v1alpha") {
            trimmed = trimmed.strip_suffix("/v1alpha").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/v1") {
            trimmed = trimmed.strip_suffix("/v1").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/v2") {
            trimmed = trimmed.strip_suffix("/v2").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/gemini") {
            trimmed = trimmed.strip_suffix("/gemini").unwrap().trim_end_matches('/');
        }
        if trimmed.ends_with("/antigravity") {
            trimmed = trimmed.strip_suffix("/antigravity").unwrap().trim_end_matches('/');
        }
        if trimmed == before {
            break;
        }
    }
    trimmed.to_string()
}

/// 写入 agy 的 settings.json 配置文件。
/// 严格保留现有配置字段（如 trustedWorkspaces 等），原子写入。
pub fn write_agy_config_to_path(
    config_file: &std::path::Path,
    selected_models: &[String],
    default_model: Option<&str>,
) -> Result<String, String> {
    if let Some(parent) = config_file.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let mut existing_config: serde_json::Value = if config_file.exists() {
        let content = fs::read_to_string(config_file).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if !existing_config.is_object() {
        existing_config = serde_json::json!({});
    }

    let root_obj = existing_config.as_object_mut().unwrap();

    // 1. 设置 modelProvider 为 gemini
    root_obj.insert("modelProvider".to_string(), serde_json::Value::String("gemini".to_string()));

    // 2. 设置当前选中的模型
    let chosen_model = default_model
        .or_else(|| selected_models.first().map(|s| s.as_str()))
        .unwrap_or("gemini-2.5-pro");
    root_obj.insert("model".to_string(), serde_json::Value::String(chosen_model.to_string()));

    // 3. 增量合入 customModelsConfig
    if !root_obj.contains_key("customModelsConfig") || !root_obj["customModelsConfig"].is_object() {
        root_obj.insert("customModelsConfig".to_string(), serde_json::json!({}));
    }
    let custom_models_config = root_obj.get_mut("customModelsConfig").unwrap().as_object_mut().unwrap();

    if !custom_models_config.contains_key("customModels") || !custom_models_config["customModels"].is_object() {
        custom_models_config.insert("customModels".to_string(), serde_json::json!({}));
    }
    let custom_models = custom_models_config.get_mut("customModels").unwrap().as_object_mut().unwrap();

    for m in selected_models {
        custom_models.insert(
            m.clone(),
            serde_json::json!({
                "apiProvider": "API_PROVIDER_GOOGLE_GEMINI",
                "modelName": m
            }),
        );
    }

    let formatted_json = serde_json::to_string_pretty(&existing_config)
        .map_err(|e| format!("Failed to serialize settings.json: {}", e))?;

    let tmp_file = config_file.with_extension("json.tmp");
    fs::write(&tmp_file, &formatted_json).map_err(|e| format!("Failed to write tmp settings.json: {}", e))?;
    fs::rename(&tmp_file, config_file).map_err(|e| format!("Failed to rename settings.json: {}", e))?;

    Ok(config_file.to_string_lossy().to_string())
}

pub fn write_agy_config(
    selected_models: &[String],
    default_model: Option<&str>,
) -> Result<String, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find user home directory".to_string())?;
    let config_file = home.join(".gemini").join("antigravity-cli").join("settings.json");
    write_agy_config_to_path(&config_file, selected_models, default_model)
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
    fn test_normalize_mcode_base_url() {
        assert_eq!(normalize_mcode_base_url(""), "");
        assert_eq!(normalize_mcode_base_url("   "), "");
        assert_eq!(normalize_mcode_base_url("https://api.deepseek.com"), "https://api.deepseek.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.deepseek.com/"), "https://api.deepseek.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.openai.com/v1"), "https://api.openai.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.openai.com/v1/"), "https://api.openai.com/v1");
        assert_eq!(normalize_mcode_base_url("https://generativelanguage.googleapis.com/v1beta"), "https://generativelanguage.googleapis.com/v1beta");
        assert_eq!(normalize_mcode_base_url("https://generativelanguage.googleapis.com/v1alpha/"), "https://generativelanguage.googleapis.com/v1alpha");
        assert_eq!(normalize_mcode_base_url("https://api.example.com/v2"), "https://api.example.com/v2");
        assert_eq!(normalize_mcode_base_url("https://api.anthropic.com"), "https://api.anthropic.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.anthropic.com/v1"), "https://api.anthropic.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.deepseek.com/models"), "https://api.deepseek.com/v1");
        assert_eq!(normalize_mcode_base_url("https://api.deepseek.com/v1/models"), "https://api.deepseek.com/v1");
    }

    #[test]
    fn test_build_mcode_provider_config_openai() {
        let models = vec!["deepseek-chat".to_string(), "deepseek-reasoner".to_string()];
        let val = build_mcode_provider_config("deepseek", "openai", "https://api.deepseek.com", "sk-ds123", &models);
        let mapping = val.as_mapping().unwrap();
        assert_eq!(mapping.get(serde_yaml::Value::String("name".to_string())).unwrap().as_str().unwrap(), "deepseek");
        assert_eq!(mapping.get(serde_yaml::Value::String("kind".to_string())).unwrap().as_str().unwrap(), "custom");
        assert!(mapping.get(serde_yaml::Value::String("enabled".to_string())).unwrap().as_bool().unwrap());
        assert_eq!(mapping.get(serde_yaml::Value::String("api".to_string())).unwrap().as_str().unwrap(), "openai-completions");

        let options = mapping.get(serde_yaml::Value::String("options".to_string())).unwrap().as_mapping().unwrap();
        assert_eq!(options.get(serde_yaml::Value::String("baseURL".to_string())).unwrap().as_str().unwrap(), "https://api.deepseek.com/v1");
        assert_eq!(options.get(serde_yaml::Value::String("apiKey".to_string())).unwrap().as_str().unwrap(), "sk-ds123");
        assert_eq!(options.get(serde_yaml::Value::String("authMode".to_string())).unwrap().as_str().unwrap(), "api-key");

        let models_map = mapping.get(serde_yaml::Value::String("models".to_string())).unwrap().as_mapping().unwrap();
        assert!(models_map.contains_key(serde_yaml::Value::String("deepseek-chat".to_string())));
        assert!(models_map.contains_key(serde_yaml::Value::String("deepseek-reasoner".to_string())));
    }

    #[test]
    fn test_build_mcode_provider_config_anthropic() {
        let models = vec!["claude-3-5-sonnet-20241022".to_string()];
        let val = build_mcode_provider_config("claude", "anthropic", "https://api.anthropic.com/v1", "sk-ant123", &models);
        let mapping = val.as_mapping().unwrap();
        assert_eq!(mapping.get(serde_yaml::Value::String("api".to_string())).unwrap().as_str().unwrap(), "anthropic-messages");
    }

    #[test]
    fn test_write_mcode_config_when_custom_provider_missing() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let config_path = tmp_dir.path().join("config.yaml");

        // 初始为空文件或包含其他顶层字段（但不含 custom_provider）
        fs::write(&config_path, "defaultModel: minimax/MiniMax-M3\nversion: 1\n").unwrap();

        let models = vec!["gpt-4o".to_string()];
        let res = write_mcode_config_to_path(&config_path, "custom_test", "openai", "https://api.test.com", "key_abc", &models);
        assert!(res.is_ok());

        let written_content = fs::read_to_string(&config_path).unwrap();
        let parsed: serde_yaml::Value = serde_yaml::from_str(&written_content).unwrap();
        let root = parsed.as_mapping().unwrap();

        assert!(root.contains_key(serde_yaml::Value::String("defaultModel".to_string())));
        assert!(root.contains_key(serde_yaml::Value::String("custom_provider".to_string())));

        let custom_provider = root.get(serde_yaml::Value::String("custom_provider".to_string())).unwrap().as_mapping().unwrap();
        assert!(custom_provider.contains_key(serde_yaml::Value::String("custom_test".to_string())));
    }

    #[test]
    fn test_write_mcode_config_when_file_not_exist() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let config_path = tmp_dir.path().join("nested").join("config.yaml");

        let models = vec!["gemini-2.0-flash".to_string()];
        let res = write_mcode_config_to_path(&config_path, "gemini_provider", "openai", "https://generativelanguage.googleapis.com", "key_gemini", &models);
        assert!(res.is_ok());

        let written_content = fs::read_to_string(&config_path).unwrap();
        let parsed: serde_yaml::Value = serde_yaml::from_str(&written_content).unwrap();
        let root = parsed.as_mapping().unwrap();

        let custom_provider = root.get(serde_yaml::Value::String("custom_provider".to_string())).unwrap().as_mapping().unwrap();
        assert!(custom_provider.contains_key(serde_yaml::Value::String("gemini_provider".to_string())));
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

    #[test]
    fn test_clean_base_url_comment() {
        assert_eq!(clean_base_url_comment(""), "");
        assert_eq!(clean_base_url_comment("   "), "");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("\"https://code.ai80.vip\""), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("`https://code.ai80.vip`"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("- https://code.ai80.vip"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip (站点根路径)"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip（官方推荐）"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip # 站点根"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip // 备注说明"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip/*备注*/"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip【推荐】"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip [官方]"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip - 官方中转"), "https://code.ai80.vip");
        assert_eq!(clean_base_url_comment("https://code.ai80.vip 官方推荐"), "https://code.ai80.vip");
    }

    #[test]
    fn test_discover_agents() {
        let overview = discover_agents();
        assert_eq!(overview.agents.len(), 3);
        assert_eq!(overview.agents[0].name, "opencode");
        assert_eq!(overview.agents[0].install_command, "npm install -g opencode-ai");
        assert_eq!(overview.agents[1].name, "mcode");
        assert_eq!(overview.agents[1].install_command, "irm https://filecdn.minimax.chat/public/install.ps1 | iex");
        assert_eq!(overview.agents[2].name, "agy");
        #[cfg(target_os = "windows")]
        assert_eq!(overview.agents[2].install_command, "irm https://antigravity.google/cli/install.ps1 | iex");
    }

    #[test]
    fn test_normalize_agy_base_url() {
        assert_eq!(normalize_agy_base_url(""), "");
        assert_eq!(normalize_agy_base_url("   "), "");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1beta"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1beta/"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1/models"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/gemini"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/antigravity"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/gemini/v1beta"), "https://code.ai80.vip");
        // 测试用户附带各种备注的场景
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip (站点根路径)"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip（官方推荐）"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1beta (Gemini接口)"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip/v1 # 自动剥离"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip【推荐】/v1beta"), "https://code.ai80.vip");
        assert_eq!(normalize_agy_base_url("https://code.ai80.vip // 站点根"), "https://code.ai80.vip");
    }

    #[test]
    fn test_write_agy_config_merge_existing() {
        let tmp_dir = tempfile::tempdir().unwrap();
        let config_path = tmp_dir.path().join("settings.json");

        // 模拟已有 trustedWorkspaces 与既有模型
        let initial_json = r#"{
  "modelProvider": "gemini",
  "model": "gemini-1.5-pro",
  "trustedWorkspaces": ["C:\\test"],
  "customModelsConfig": {
    "customModels": {
      "gemini-1.5-pro": {
        "apiProvider": "API_PROVIDER_GOOGLE_GEMINI",
        "modelName": "gemini-1.5-pro"
      }
    }
  }
}"#;
        fs::write(&config_path, initial_json).unwrap();

        let new_models = vec!["gemini-4-argon".to_string(), "gemini-3.8-flash".to_string()];
        let res = write_agy_config_to_path(&config_path, &new_models, Some("gemini-4-argon"));
        assert!(res.is_ok());

        let content = fs::read_to_string(&config_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed["modelProvider"], "gemini");
        assert_eq!(parsed["model"], "gemini-4-argon");
        assert_eq!(parsed["trustedWorkspaces"][0], "C:\\test");

        let custom_models = parsed["customModelsConfig"]["customModels"].as_object().unwrap();
        // 原有模型保留
        assert!(custom_models.contains_key("gemini-1.5-pro"));
        // 新增模型合入
        assert!(custom_models.contains_key("gemini-4-argon"));
        assert_eq!(custom_models["gemini-4-argon"]["apiProvider"], "API_PROVIDER_GOOGLE_GEMINI");
        assert!(custom_models.contains_key("gemini-3.8-flash"));
    }

    #[test]
    fn test_fetch_agent_latest_version_unsupported() {
        let res = fetch_agent_latest_version("unknown_agent");
        assert!(res.is_err());
    }

    #[test]
    fn test_fetch_agent_latest_version_agy() {
        if let Ok(ver) = fetch_agent_latest_version("agy") {
            assert!(!ver.is_empty());
            assert!(ver.contains('.'));
        }
    }
}
