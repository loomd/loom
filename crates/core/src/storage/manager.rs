use crate::storage::error::{Result, StorageError};
use crate::storage::models::{
    AgentDoc, AgentInstance, AppConfig, Category, CliTool, GlobalDocTemplate, GlobalEnvVar,
    GlobalSkillTemplate, LoomStorage, Project, ProjectSkill, Template,
};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use uuid::Uuid;

pub static ACTIVE_INSTANCES: OnceLock<Mutex<HashMap<String, Arc<Mutex<Child>>>>> = OnceLock::new();

pub fn get_active_instances() -> &'static Mutex<HashMap<String, Arc<Mutex<Child>>>> {
    ACTIVE_INSTANCES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ActiveInstance {
    pub instance_id: String,
    pub pid: u32,
    pub template_id: String,
}

pub fn get_active_instances_path() -> PathBuf {
    get_config_path().with_file_name("active_instances.json")
}

pub fn get_active_instances_list() -> Vec<ActiveInstance> {
    let path = get_active_instances_path();
    if !path.exists() {
        return Vec::new();
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_active_instances_list(list: &[ActiveInstance]) {
    let path = get_active_instances_path();
    if let Ok(content) = serde_json::to_string_pretty(list) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let temp_path = path.with_extension("tmp");
        let write_and_rename = (|| {
            use std::io::Write;
            let mut file = fs::File::create(&temp_path)?;
            file.write_all(content.as_bytes())?;
            file.sync_all()?;
            drop(file);
            fs::rename(&temp_path, &path)?;
            Ok::<(), std::io::Error>(())
        })();
        if write_and_rename.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn kill_process_tree(pid: u32) -> std::io::Result<()> {
    let mut cmd = Command::new("taskkill");
    cmd.args(&["/F", "/T", "/PID", &pid.to_string()]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    let mut child = cmd.spawn()?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn kill_process_tree(pid: u32) -> std::io::Result<()> {
    let mut cmd = Command::new("kill");
    cmd.args(&["-9", &pid.to_string()]);
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    let mut child = cmd.spawn()?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn migrate_legacy_config(new_path: &Path) {
    if new_path.exists() {
        return;
    }
    // Attempt migration from legacy config path 1 (com/CliMaster/CliMaster/climaster.json)
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "CliMaster", "CliMaster") {
        let legacy_path = proj_dirs.config_dir().join("climaster.json");
        if legacy_path.exists() {
            if let Some(parent) = new_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::copy(&legacy_path, new_path).is_ok() {
                let legacy_instances = legacy_path.with_file_name("active_instances.json");
                let new_instances = new_path.with_file_name("active_instances.json");
                if legacy_instances.exists() {
                    let _ = fs::copy(&legacy_instances, &new_instances);
                }
                return;
            }
        }
    }
    // Attempt migration from legacy config path 2 (com/climaster/CliMaster/climaster.json)
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "climaster", "CliMaster") {
        let legacy_path = proj_dirs.data_local_dir().join("climaster.json");
        if legacy_path.exists() {
            if let Some(parent) = new_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::copy(&legacy_path, new_path).is_ok() {
                let legacy_instances = legacy_path.with_file_name("active_instances.json");
                let new_instances = new_path.with_file_name("active_instances.json");
                if legacy_instances.exists() {
                    let _ = fs::copy(&legacy_instances, &new_instances);
                }
            }
        }
    }
}

pub fn get_config_path() -> PathBuf {
    if let Ok(p) = env::var("LOOM_CONFIG_PATH") {
        PathBuf::from(p)
    } else if let Some(proj_dirs) = directories::ProjectDirs::from(
        "com",
        "loom",
        if cfg!(debug_assertions) {
            "LoomDev"
        } else {
            "Loom"
        },
    ) {
        let config_dir = proj_dirs.config_dir();
        let _ = fs::create_dir_all(config_dir);
        let path = config_dir.join("loom.json");

        #[cfg(debug_assertions)]
        {
            if !path.exists() {
                if let Some(release_dirs) = directories::ProjectDirs::from("com", "loom", "Loom") {
                    let release_path = release_dirs.config_dir().join("loom.json");
                    if release_path.exists() {
                        let _ = fs::copy(&release_path, &path);
                    }
                }
            }
        }

        migrate_legacy_config(&path);
        path
    } else {
        PathBuf::from("loom.json")
    }
}

pub fn get_instance_log_path(instance_id: &str) -> PathBuf {
    let mut path = get_config_path();
    path.pop(); // Remove "loom.json"
    let logs_dir = path.join("logs");
    let _ = fs::create_dir_all(&logs_dir);
    logs_dir.join(format!("{}.log", instance_id))
}

pub fn append_to_instance_log(instance_id: &str, line: &str) {
    let path = get_instance_log_path(instance_id);
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        use std::io::Write;
        let _ = writeln!(file, "{}", line);
    }
}

pub fn read_agent_logs(instance_id: String) -> Result<Vec<String>> {
    let path = get_instance_log_path(&instance_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path)?;
    let lines = content.lines().map(|s| s.to_string()).collect();
    Ok(lines)
}

fn expand_env_vars(arg: &str, envs: &HashMap<String, String>) -> String {
    let mut result = arg.to_string();

    // 1. Expand %VAR%
    let mut start_idx = 0;
    while let Some(start) = result[start_idx..].find('%') {
        let abs_start = start_idx + start;
        if let Some(end) = result[abs_start + 1..].find('%') {
            let abs_end = abs_start + 1 + end;
            let key = &result[abs_start + 1..abs_end];
            if !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '_') {
                let val = envs.get(key).cloned().unwrap_or_default();
                result.replace_range(abs_start..=abs_end, &val);
                start_idx = abs_start + val.len();
                continue;
            }
        }
        start_idx = abs_start + 1;
    }

    // 2. Expand $env:VAR
    let mut start_idx = 0;
    while let Some(start) = result[start_idx..].find("$env:") {
        let abs_start = start_idx + start;
        let key_start = abs_start + 5;
        let mut key_end = key_start;
        for c in result[key_start..].chars() {
            if c.is_alphanumeric() || c == '_' {
                key_end += c.len_utf8();
            } else {
                break;
            }
        }
        if key_end > key_start {
            let key = &result[key_start..key_end];
            let val = envs.get(key).cloned().unwrap_or_default();
            result.replace_range(abs_start..key_end, &val);
            start_idx = abs_start + val.len();
        } else {
            start_idx = key_start;
        }
    }

    // 3. Expand $VAR
    let mut start_idx = 0;
    while let Some(start) = result[start_idx..].find('$') {
        let abs_start = start_idx + start;
        if result[abs_start..].starts_with("$env:") {
            start_idx = abs_start + 5;
            continue;
        }
        let key_start = abs_start + 1;
        let mut key_end = key_start;
        for c in result[key_start..].chars() {
            if c.is_alphanumeric() || c == '_' {
                key_end += c.len_utf8();
            } else {
                break;
            }
        }
        if key_end > key_start {
            let key = &result[key_start..key_end];
            let val = envs.get(key).cloned().unwrap_or_default();
            result.replace_range(abs_start..key_end, &val);
            start_idx = abs_start + val.len();
        } else {
            start_idx = key_start;
        }
    }

    result
}

pub fn spawn_in_new_terminal(
    executable_path: &Path,
    args: &[String],
    working_dir: &Path,
    env_mode: &str,
    custom_envs: &HashMap<String, String>,
    config: &AppConfig,
    command: &str,
) -> std::io::Result<Child> {
    let mut merged_envs = HashMap::new();
    for (key, val) in std::env::vars() {
        merged_envs.insert(key, val);
    }
    if let Some(tool) = config
        .cli_tools
        .iter()
        .find(|t| t.id == command || t.name == command)
    {
        for (k, v) in &tool.custom_env {
            merged_envs.insert(k.clone(), v.clone());
        }
    }
    for (k, v) in custom_envs {
        merged_envs.insert(k.clone(), v.clone());
    }

    let processed_args: Vec<String> = args
        .iter()
        .map(|a| expand_env_vars(a, &merged_envs))
        .collect();

    #[cfg(target_os = "windows")]
    {
        // Detect shell once and cache it to avoid blocking the main UI thread in release mode.
        #[derive(Copy, Clone, Debug)]
        enum TargetShell {
            Pwsh,
            PowerShell,
            Cmd,
        }

        static DETECTED_SHELL: OnceLock<TargetShell> = OnceLock::new();
        let shell = *DETECTED_SHELL.get_or_init(|| {
            if Command::new("pwsh")
                .arg("-NoProfile")
                .arg("-Command")
                .arg("exit")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok()
            {
                TargetShell::Pwsh
            } else if Command::new("powershell")
                .arg("-NoProfile")
                .arg("-Command")
                .arg("exit")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok()
            {
                TargetShell::PowerShell
            } else {
                TargetShell::Cmd
            }
        });

        let mut use_pwsh = false;
        let mut use_powershell = false;
        match shell {
            TargetShell::Pwsh => use_pwsh = true,
            TargetShell::PowerShell => use_powershell = true,
            TargetShell::Cmd => {}
        }

        let mut cmd = if use_pwsh || use_powershell {
            let shell_bin = if use_pwsh { "pwsh" } else { "powershell" };
            let mut shell_cmd = Command::new(shell_bin);
            shell_cmd.arg("-Command");

            let cd_cmd = if !working_dir.as_os_str().is_empty() {
                format!(
                    "Set-Location '{}'; ",
                    working_dir.to_string_lossy().replace("'", "''")
                )
            } else {
                "".to_string()
            };
            let escaped_exe = executable_path.to_string_lossy().replace("'", "''");
            let escaped_args: Vec<String> = processed_args
                .iter()
                .map(|a| format!("'{}'", a.replace("'", "''")))
                .collect();

            let command_str = format!("{}& '{}' {}", cd_cmd, escaped_exe, escaped_args.join(" "));
            shell_cmd.arg(&command_str);
            shell_cmd
        } else {
            let mut shell_cmd = Command::new("cmd");
            shell_cmd.arg("/c");

            let cd_cmd = if !working_dir.as_os_str().is_empty() {
                format!(
                    "cd /d \"{}\" && ",
                    working_dir.to_string_lossy().replace("\"", "\"\"")
                )
            } else {
                "".to_string()
            };
            let escaped_exe = executable_path.to_string_lossy().replace("\"", "\"\"");
            let escaped_args: Vec<String> = processed_args
                .iter()
                .map(|a| format!("\"{}\"", a.replace("\"", "\"\"")))
                .collect();

            let command_str = format!("{}\"{}\" {}", cd_cmd, escaped_exe, escaped_args.join(" "));
            shell_cmd.arg(&command_str);
            shell_cmd
        };

        if !working_dir.as_os_str().is_empty() {
            cmd.current_dir(working_dir);
        }

        // Set envs
        if env_mode == "isolated" {
            cmd.env_clear();
            let preserves = [
                "SystemRoot",
                "SystemDrive",
                "PATHEXT",
                "TEMP",
                "TMP",
                "COMSPEC",
                "USERNAME",
                "USERPROFILE",
                "APPDATA",
                "LOCALAPPDATA",
                "PROGRAMFILES",
                "PROGRAMFILES(X86)",
                "COMMONPROGRAMFILES",
                "PATH",
            ];
            for var in &preserves {
                if let Ok(val) = env::var(var) {
                    cmd.env(var, val);
                }
            }
        }

        if let Some(tool) = config
            .cli_tools
            .iter()
            .find(|t| t.id == command || t.name == command)
        {
            for (k, v) in &tool.custom_env {
                cmd.env(k, v);
            }
        }

        for (k, v) in custom_envs {
            cmd.env(k, v);
        }

        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000010 | 0x00000200); // CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP

        cmd.stdout(Stdio::inherit());
        cmd.stderr(Stdio::inherit());
        cmd.stdin(Stdio::inherit());

        cmd.spawn()
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new(executable_path);
        cmd.args(&processed_args);
        if !working_dir.as_os_str().is_empty() {
            cmd.current_dir(working_dir);
        }

        if env_mode == "isolated" {
            cmd.env_clear();
            if let Ok(path) = env::var("PATH") {
                cmd.env("PATH", path);
            }
            if let Ok(home) = env::var("HOME") {
                cmd.env("HOME", home);
            }
        }

        if let Some(tool) = config
            .cli_tools
            .iter()
            .find(|t| t.id == command || t.name == command)
        {
            for (k, v) in &tool.custom_env {
                cmd.env(k, v);
            }
        }

        for (k, v) in custom_envs {
            cmd.env(k, v);
        }

        cmd.spawn()
    }
}

pub fn load_config() -> Result<AppConfig> {
    let path = get_config_path();
    let manager = StorageManager::with_path(path);
    manager.load_or_init()
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = get_config_path();
    let manager = StorageManager::with_path(path);
    manager.save(config)
}

pub struct StorageManager {
    config_path: PathBuf,
}

impl StorageManager {
    pub fn new() -> std::result::Result<Self, StorageError> {
        let path = if let Ok(p) = env::var("LOOM_CONFIG_PATH") {
            PathBuf::from(p)
        } else if let Some(proj_dirs) = directories::ProjectDirs::from(
            "com",
            "loom",
            if cfg!(debug_assertions) {
                "LoomDev"
            } else {
                "Loom"
            },
        ) {
            let p = proj_dirs.data_local_dir().join("loom.json");
            let _ = fs::create_dir_all(proj_dirs.data_local_dir());

            #[cfg(debug_assertions)]
            {
                if !p.exists() {
                    if let Some(release_dirs) =
                        directories::ProjectDirs::from("com", "loom", "Loom")
                    {
                        let release_p = release_dirs.data_local_dir().join("loom.json");
                        if release_p.exists() {
                            let _ = fs::copy(&release_p, &p);
                        }
                    }
                }
            }

            migrate_legacy_config(&p);
            p
        } else {
            return Err(StorageError::DirectoryResolutionError);
        };
        Ok(Self { config_path: path })
    }

    pub fn with_path(path: PathBuf) -> Self {
        Self { config_path: path }
    }

    pub fn config_path(&self) -> &Path {
        &self.config_path
    }

    pub fn load_or_init(&self) -> std::result::Result<LoomStorage, StorageError> {
        if !self.config_path.exists() {
            let default_storage = LoomStorage::default();
            self.save(&default_storage)?;
            return Ok(default_storage);
        }

        let file = std::fs::File::open(&self.config_path)?;
        let reader = std::io::BufReader::new(file);
        let storage = serde_json::from_reader(reader)?;
        Ok(storage)
    }

    pub fn save(&self, storage: &LoomStorage) -> std::result::Result<(), StorageError> {
        let content = serde_json::to_vec_pretty(storage)?;

        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let temp_path = self.config_path.with_extension("tmp");
        let write_res = (|| {
            use std::io::Write;
            let mut file = fs::File::create(&temp_path)?;
            file.write_all(&content)?;
            file.sync_all()?;
            Ok::<(), std::io::Error>(())
        })();

        match write_res {
            Ok(_) => {
                if let Err(e) = fs::rename(&temp_path, &self.config_path) {
                    let _ = fs::remove_file(&temp_path);
                    return Err(e.into());
                }
                Ok(())
            }
            Err(e) => {
                let _ = fs::remove_file(&temp_path);
                Err(e.into())
            }
        }
    }
}

pub fn get_cli_tools() -> Result<Vec<CliTool>> {
    let config = load_config()?;
    Ok(config.cli_tools)
}

pub fn get_categories() -> Result<Vec<Category>> {
    let config = load_config()?;
    Ok(config.categories)
}

pub fn import_cli_tool(path: String) -> Result<CliTool> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(StorageError::Validation(format!(
            "File does not exist: {}",
            path
        )));
    }
    if !p.is_file() {
        return Err(StorageError::Validation(format!(
            "Path is not a file: {}",
            path
        )));
    }

    let is_exe = {
        #[cfg(target_os = "windows")]
        {
            if let Some(ext) = p.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                ext == "exe" || ext == "cmd" || ext == "bat" || ext == "ps1"
            } else {
                false
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = p.metadata() {
                meta.permissions().mode() & 0o111 != 0
            } else {
                false
            }
        }
    };
    if !is_exe {
        return Err(StorageError::Validation(format!(
            "File is not executable: {}",
            path
        )));
    }

    let mut config = load_config()?;
    let path_buf = PathBuf::from(&path);
    if let Some(existing) = config.cli_tools.iter().find(|t| t.path == path_buf) {
        return Ok(existing.clone());
    }

    let name = p
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let new_tool = CliTool {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: path_buf,
        version: "1.0.0".to_string(),
        category_id: None,
        custom_env: HashMap::new(),
        custom_args: Vec::new(),
    };
    config.cli_tools.push(new_tool.clone());
    save_config(&config)?;
    Ok(new_tool)
}

pub fn scan_path_env() -> Result<Vec<CliTool>> {
    let path_val = match env::var("PATH") {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };

    let paths: Vec<PathBuf> = env::split_paths(&path_val).collect();
    let mut config = load_config()?;
    let mut scanned = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for dir in paths {
        if !dir.is_dir() {
            continue;
        }
        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let is_exe = {
                #[cfg(target_os = "windows")]
                {
                    if let Some(ext) = path.extension() {
                        let ext = ext.to_string_lossy().to_lowercase();
                        ext == "exe" || ext == "cmd" || ext == "bat" || ext == "ps1"
                    } else {
                        false
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = path.metadata() {
                        meta.permissions().mode() & 0o111 != 0
                    } else {
                        false
                    }
                }
            };

            if is_exe {
                if let Some(name) = path.file_stem() {
                    let name_str = name.to_string_lossy().to_string();
                    if seen_names.insert(name_str.clone()) {
                        let exists = config.cli_tools.iter().any(|t| t.path == path);
                        let tool = if exists {
                            config
                                .cli_tools
                                .iter()
                                .find(|t| t.path == path)
                                .unwrap()
                                .clone()
                        } else {
                            let new_tool = CliTool {
                                id: uuid::Uuid::new_v4().to_string(),
                                name: name_str,
                                path: path.clone(),
                                version: "1.0.0".to_string(),
                                category_id: None,
                                custom_env: HashMap::new(),
                                custom_args: Vec::new(),
                            };
                            config.cli_tools.push(new_tool.clone());
                            new_tool
                        };
                        scanned.push(tool);
                    }
                }
            }
        }
    }

    save_config(&config)?;
    Ok(scanned)
}

pub fn scan_directory(path: String) -> Result<Vec<CliTool>> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(StorageError::Validation(format!(
            "Directory does not exist: {}",
            path
        )));
    }

    let mut config = load_config()?;
    let mut scanned = Vec::new();
    let mut visited = std::collections::HashSet::new();

    fn walk_dir(
        dir: &Path,
        depth: usize,
        max_depth: usize,
        visited: &mut std::collections::HashSet<PathBuf>,
        config: &mut AppConfig,
        scanned: &mut Vec<CliTool>,
    ) -> std::io::Result<()> {
        if depth > max_depth {
            return Ok(());
        }

        let canonical = match dir.canonicalize() {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };
        if !visited.insert(canonical) {
            return Ok(());
        }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let _ = walk_dir(&entry_path, depth + 1, max_depth, visited, config, scanned);
            } else if entry_path.is_file() {
                let is_exe = {
                    #[cfg(target_os = "windows")]
                    {
                        if let Some(ext) = entry_path.extension() {
                            let ext = ext.to_string_lossy().to_lowercase();
                            ext == "exe" || ext == "cmd" || ext == "bat" || ext == "ps1"
                        } else {
                            false
                        }
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = entry_path.metadata() {
                            meta.permissions().mode() & 0o111 != 0
                        } else {
                            false
                        }
                    }
                };

                if is_exe {
                    if let Some(name) = entry_path.file_stem() {
                        let name_str = name.to_string_lossy().to_string();
                        let exists = config.cli_tools.iter().any(|t| t.path == entry_path);
                        let tool = if exists {
                            config
                                .cli_tools
                                .iter()
                                .find(|t| t.path == entry_path)
                                .unwrap()
                                .clone()
                        } else {
                            let new_tool = CliTool {
                                id: uuid::Uuid::new_v4().to_string(),
                                name: name_str,
                                path: entry_path.clone(),
                                version: "1.0.0".to_string(),
                                category_id: None,
                                custom_env: HashMap::new(),
                                custom_args: Vec::new(),
                            };
                            config.cli_tools.push(new_tool.clone());
                            new_tool
                        };
                        scanned.push(tool);
                    }
                }
            }
        }
        Ok(())
    }

    let _ = walk_dir(&root, 1, 3, &mut visited, &mut config, &mut scanned);

    save_config(&config)?;
    Ok(scanned)
}

pub fn create_category(name: String, desc: String) -> Result<Category> {
    if name.is_empty() {
        return Err(StorageError::Validation(
            "Category name cannot be empty".to_string(),
        ));
    }
    if name.len() > 255 {
        return Err(StorageError::Validation(
            "Category name is too long".to_string(),
        ));
    }

    let mut config = load_config()?;
    if config.categories.iter().any(|c| c.name == name) {
        return Err(StorageError::Validation(format!(
            "Category with name {} already exists",
            name
        )));
    }

    let new_cat = Category {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        description: desc,
    };

    config.categories.push(new_cat.clone());
    save_config(&config)?;
    Ok(new_cat)
}

pub fn assign_cli_category(cli_id: String, cat_id: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    let tool_index = config
        .cli_tools
        .iter()
        .position(|t| t.id == cli_id)
        .ok_or_else(|| StorageError::CliToolNotFound(cli_id.clone()))?;

    if let Some(ref cid) = cat_id {
        if !config.categories.iter().any(|c| &c.id == cid) {
            return Err(StorageError::CategoryNotFound(cid.clone()));
        }
    }

    config.cli_tools[tool_index].category_id = cat_id;
    save_config(&config)?;
    Ok(())
}

pub fn update_cli_env(cli_id: String, env: HashMap<String, String>) -> Result<()> {
    let mut config = load_config()?;
    let tool_index = config
        .cli_tools
        .iter()
        .position(|t| t.id == cli_id)
        .ok_or_else(|| StorageError::CliToolNotFound(cli_id.clone()))?;

    for (k, _v) in &env {
        if k.is_empty() {
            return Err(StorageError::Validation(
                "Environment variable key cannot be empty".to_string(),
            ));
        }
        if k.contains('=') || k.chars().any(|c| c.is_whitespace()) {
            return Err(StorageError::Validation(format!(
                "Invalid character in environment key: {}",
                k
            )));
        }
    }

    config.cli_tools[tool_index].custom_env = env;
    save_config(&config)?;
    Ok(())
}

pub fn update_cli_args(cli_id: String, args: Vec<String>) -> Result<()> {
    let mut config = load_config()?;
    let tool_index = config
        .cli_tools
        .iter()
        .position(|t| t.id == cli_id)
        .ok_or_else(|| StorageError::CliToolNotFound(cli_id.clone()))?;

    config.cli_tools[tool_index].custom_args = args;
    save_config(&config)?;
    Ok(())
}

pub fn create_template(
    cli_id: String,
    name: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_var_ids: Vec<String>,
    pwd: Option<String>,
    cmd_override: Option<String>,
    env_mode: Option<String>,
) -> Result<Template> {
    if name.is_empty() {
        return Err(StorageError::Validation(
            "Template name cannot be empty".to_string(),
        ));
    }

    let mut config = load_config()?;
    if !config.cli_tools.iter().any(|t| t.id == cli_id) {
        return Err(StorageError::CliToolNotFound(cli_id));
    }

    if config
        .templates
        .iter()
        .any(|t| t.cli_id == cli_id && t.name == name)
    {
        return Err(StorageError::Validation(format!(
            "Template with name {} already exists for this CLI",
            name
        )));
    }

    let normalized_override = cmd_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(ref override_name) = normalized_override {
        if config
            .templates
            .iter()
            .any(|t| t.cmd_override.as_ref() == Some(override_name))
        {
            return Err(StorageError::Validation(format!(
                "Command override '{}' already exists",
                override_name
            )));
        }
        if ["list", "search", "mock-run", "help", "version"].contains(&override_name.as_str()) {
            return Err(StorageError::Validation(format!(
                "Command override '{}' conflicts with built-in commands",
                override_name
            )));
        }
    }

    let pwd_path = pwd.map(PathBuf::from);
    if let Some(ref p) = pwd_path {
        if !p.as_os_str().is_empty() {
            let path = p.clone();
            if !path.exists() || !path.is_dir() {
                return Err(StorageError::Validation(format!(
                    "Working directory does not exist: {:?}",
                    p
                )));
            }
        }
    }

    let new_template = Template {
        id: uuid::Uuid::new_v4().to_string(),
        cli_id,
        name,
        args,
        env,
        env_var_ids,
        pwd: pwd_path,
        last_run: None,
        cmd_override: normalized_override,
        env_mode,
    };

    config.templates.push(new_template.clone());
    save_config(&config)?;
    Ok(new_template)
}

pub fn get_templates() -> Result<Vec<Template>> {
    let config = load_config()?;
    Ok(config.templates)
}

pub fn delete_template(template_id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.templates.len();
    config.templates.retain(|t| t.id != template_id);
    if config.templates.len() == initial_len {
        return Err(StorageError::TemplateNotFound(template_id));
    }
    save_config(&config)?;
    Ok(())
}

pub fn update_template(
    template_id: String,
    name: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_var_ids: Vec<String>,
    pwd: Option<String>,
    cmd_override: Option<String>,
    env_mode: Option<String>,
) -> Result<Template> {
    let mut config = load_config()?;
    let template_idx = config
        .templates
        .iter()
        .position(|t| t.id == template_id)
        .ok_or_else(|| StorageError::TemplateNotFound(template_id.clone()))?;

    if name.is_empty() {
        return Err(StorageError::Validation(
            "Template name cannot be empty".to_string(),
        ));
    }

    let normalized_override = cmd_override
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Some(ref override_name) = normalized_override {
        if config
            .templates
            .iter()
            .any(|t| t.id != template_id && t.cmd_override.as_ref() == Some(override_name))
        {
            return Err(StorageError::Validation(format!(
                "Command override '{}' already exists",
                override_name
            )));
        }
        if ["list", "search", "mock-run", "help", "version"].contains(&override_name.as_str()) {
            return Err(StorageError::Validation(format!(
                "Command override '{}' conflicts with built-in commands",
                override_name
            )));
        }
    }

    let pwd_path = pwd.map(PathBuf::from);
    if let Some(ref p) = pwd_path {
        if !p.as_os_str().is_empty() {
            let path = p.clone();
            if !path.exists() || !path.is_dir() {
                return Err(StorageError::Validation(format!(
                    "Working directory does not exist: {:?}",
                    p
                )));
            }
        }
    }

    config.templates[template_idx].name = name;
    config.templates[template_idx].args = args;
    config.templates[template_idx].env = env;
    config.templates[template_idx].env_var_ids = env_var_ids;
    config.templates[template_idx].pwd = pwd_path;
    config.templates[template_idx].cmd_override = normalized_override;
    config.templates[template_idx].env_mode = env_mode;

    let updated = config.templates[template_idx].clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_cli_tool(cli_id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.cli_tools.len();
    config.cli_tools.retain(|t| t.id != cli_id);
    if config.cli_tools.len() == initial_len {
        return Err(StorageError::CliToolNotFound(cli_id));
    }
    // Cascade delete templates
    config.templates.retain(|t| t.cli_id != cli_id);
    save_config(&config)?;
    Ok(())
}

pub fn delete_category(cat_id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.categories.len();
    config.categories.retain(|c| c.id != cat_id);
    if config.categories.len() == initial_len {
        return Err(StorageError::CategoryNotFound(cat_id));
    }
    // Orphan CLIs by setting category_id to None
    for tool in &mut config.cli_tools {
        if tool.category_id.as_ref() == Some(&cat_id) {
            tool.category_id = None;
        }
    }
    save_config(&config)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ArgKey {
    Positional(usize),
    Flag(String),
    Named(String),
    Config { switch: String, subkey: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ArgValue {
    None,
    Single(String),
    ConfigValue(String),
}

struct ParsedArg {
    key: ArgKey,
    value: ArgValue,
    original_switch: Option<char>,
}

fn parse_args(args: &[String]) -> Vec<ParsedArg> {
    let mut parsed = Vec::new();
    let mut positional_count = 0;
    let mut i = 0;
    while i < args.len() {
        let item = &args[i];
        if item.is_empty() {
            i += 1;
            continue;
        }
        if (item == "-c" || item == "--config") && i + 1 < args.len() && args[i + 1].contains('=') {
            let val_str = &args[i + 1];
            if let Some(eq_idx) = val_str.find('=') {
                let subkey = val_str[..eq_idx].to_string();
                let val = val_str[eq_idx + 1..].to_string();
                parsed.push(ParsedArg {
                    key: ArgKey::Config {
                        switch: item.clone(),
                        subkey,
                    },
                    value: ArgValue::ConfigValue(val),
                    original_switch: None,
                });
                i += 2;
                continue;
            }
        }

        if item.starts_with('-') && item.contains('=') {
            if let Some(eq_idx) = item.find('=') {
                let key = item[..eq_idx].to_string();
                let val = item[eq_idx + 1..].to_string();
                parsed.push(ParsedArg {
                    key: ArgKey::Named(key),
                    value: ArgValue::Single(val),
                    original_switch: Some('='),
                });
                i += 1;
                continue;
            }
        }

        if item.starts_with('-') {
            if i + 1 < args.len() && !args[i + 1].starts_with('-') {
                parsed.push(ParsedArg {
                    key: ArgKey::Named(item.clone()),
                    value: ArgValue::Single(args[i + 1].clone()),
                    original_switch: None,
                });
                i += 2;
            } else {
                parsed.push(ParsedArg {
                    key: ArgKey::Flag(item.clone()),
                    value: ArgValue::None,
                    original_switch: None,
                });
                i += 1;
            }
        } else {
            parsed.push(ParsedArg {
                key: ArgKey::Positional(positional_count),
                value: ArgValue::Single(item.clone()),
                original_switch: None,
            });
            positional_count += 1;
            i += 1;
        }
    }
    parsed
}

fn get_arg_key_str(key: &ArgKey) -> String {
    match key {
        ArgKey::Positional(idx) => format!("pos:{}", idx),
        ArgKey::Flag(k) => format!("flag:{}", k),
        ArgKey::Named(k) => format!("named:{}", k),
        ArgKey::Config { switch, subkey } => format!("config:{}:{}", switch, subkey),
    }
}

pub fn merge_cli_args(base_args: &[String], override_args: &[String]) -> Vec<String> {
    let base_parsed = parse_args(base_args);
    let override_parsed = parse_args(override_args);

    let mut merged_map = std::collections::HashMap::new();
    let mut order = Vec::new();

    for arg in base_parsed {
        let key_str = get_arg_key_str(&arg.key);
        merged_map.insert(key_str.clone(), arg);
        order.push(key_str);
    }

    for arg in override_parsed {
        let key_str = get_arg_key_str(&arg.key);
        if let Some(existing) = merged_map.get_mut(&key_str) {
            existing.value = arg.value;
            if arg.original_switch.is_some() {
                existing.original_switch = arg.original_switch;
            }
        } else {
            merged_map.insert(key_str.clone(), arg);
            order.push(key_str);
        }
    }

    let mut result = Vec::new();
    for key_str in order {
        if let Some(arg) = merged_map.get(&key_str) {
            match &arg.key {
                ArgKey::Positional(_) => {
                    if let ArgValue::Single(v) = &arg.value {
                        result.push(v.clone());
                    }
                }
                ArgKey::Flag(k) => {
                    result.push(k.clone());
                }
                ArgKey::Named(k) => {
                    if let ArgValue::Single(v) = &arg.value {
                        if arg.original_switch == Some('=') {
                            result.push(format!("{}={}", k, v));
                        } else {
                            result.push(k.clone());
                            result.push(v.clone());
                        }
                    }
                }
                ArgKey::Config { switch, subkey } => {
                    if let ArgValue::ConfigValue(v) = &arg.value {
                        result.push(switch.clone());
                        result.push(format!("{}={}", subkey, v));
                    }
                }
            }
        }
    }
    result
}

pub fn run_cli_template(
    template_id: String,
    on_event: Option<Arc<dyn Fn(String, serde_json::Value) + Send + Sync + 'static>>,
) -> Result<String> {
    let config = load_config()?;
    let template = config
        .templates
        .iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| StorageError::TemplateNotFound(template_id.clone()))?
        .clone();

    let tool = config
        .cli_tools
        .iter()
        .find(|t| t.id == template.cli_id)
        .ok_or_else(|| StorageError::CliToolNotFound(template.cli_id.to_string()))?;

    let tool_path = &tool.path;
    if !tool_path.exists() {
        return Err(StorageError::Validation(format!(
            "CLI tool path does not exist: {}",
            tool.path.display()
        )));
    }

    let working_dir = if let Some(ref pwd) = template.pwd {
        pwd.clone()
    } else {
        PathBuf::new()
    };

    let mut custom_envs = HashMap::new();
    for var_id in &template.env_var_ids {
        if let Some(global_var) = config.env_vars.iter().find(|ev| &ev.id == var_id) {
            custom_envs.insert(global_var.key.clone(), global_var.value.clone());
        }
    }
    for (k, v) in &template.env {
        custom_envs.insert(k.clone(), v.clone());
    }

    let env_mode = template
        .env_mode
        .clone()
        .unwrap_or_else(|| "inherit".to_string());

    let final_args = merge_cli_args(&tool.custom_args, &template.args);

    let child = spawn_in_new_terminal(
        &tool.path,
        &final_args,
        &working_dir,
        &env_mode,
        &custom_envs,
        &config,
        &template.cli_id,
    )?;
    let instance_id = Uuid::new_v4().to_string();
    let pid = child.id();

    // Log startup command details
    append_to_instance_log(&instance_id, &format!("[SPAWN] Command: {:?}", tool.path));
    append_to_instance_log(&instance_id, &format!("[SPAWN] Args: {:?}", template.args));
    if let Some(ref pwd) = template.pwd {
        append_to_instance_log(&instance_id, &format!("[SPAWN] Working Dir: {:?}", pwd));
    }
    println!(
        "[Template Spawn] Command: {} {:?}",
        tool.path.display(),
        template.args
    );

    let mut list = get_active_instances_list();
    list.push(ActiveInstance {
        instance_id: instance_id.clone(),
        pid,
        template_id: template_id.clone(),
    });
    save_active_instances_list(&list);

    let payload = serde_json::json!({
        "instance_id": instance_id,
        "status": "running",
        "exit_code": null
    });
    if let Some(ref cb) = on_event {
        cb("cli-status-event".to_string(), payload.clone());
    }
    println!(
        "EVENT: cli-status-event:{}",
        serde_json::to_string(&payload)?
    );

    let child_arc = Arc::new(Mutex::new(child));
    get_active_instances()
        .lock()
        .unwrap()
        .insert(instance_id.clone(), child_arc.clone());

    let instance_id_clone = instance_id.clone();
    let child_arc_stdout = child_arc.clone();
    let on_event_stdout = on_event.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut stdout_opt = None;
        if let Ok(mut guard) = child_arc_stdout.lock() {
            stdout_opt = guard.stdout.take();
        }
        if let Some(stdout) = stdout_opt {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let log_payload = serde_json::json!({
                        "instance_id": instance_id_clone,
                        "stream": "stdout",
                        "chunk": l
                    });
                    if let Some(ref cb) = on_event_stdout {
                        cb("cli-log-event".to_string(), log_payload.clone());
                    }
                    println!(
                        "EVENT: cli-log-event:{}",
                        serde_json::to_string(&log_payload).unwrap_or_default()
                    );
                    append_to_instance_log(&instance_id_clone, &format!("[STDOUT] {}", l));
                }
            }
        }
    });

    let instance_id_clone_err = instance_id.clone();
    let child_arc_stderr = child_arc.clone();
    let on_event_stderr = on_event.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut stderr_opt = None;
        if let Ok(mut guard) = child_arc_stderr.lock() {
            stderr_opt = guard.stderr.take();
        }
        if let Some(stderr) = stderr_opt {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let log_payload = serde_json::json!({
                        "instance_id": instance_id_clone_err,
                        "stream": "stderr",
                        "chunk": l
                    });
                    if let Some(ref cb) = on_event_stderr {
                        cb("cli-log-event".to_string(), log_payload.clone());
                    }
                    println!(
                        "EVENT: cli-log-event:{}",
                        serde_json::to_string(&log_payload).unwrap_or_default()
                    );
                    append_to_instance_log(&instance_id_clone_err, &format!("[STDERR] {}", l));
                }
            }
        }
    });

    let instance_id_clone_mon = instance_id.clone();
    let template_id_clone = template_id.clone();
    let on_event_mon = on_event.clone();
    std::thread::spawn(move || {
        let status_res = {
            let mut active = true;
            let mut exit_status = None;
            while active {
                std::thread::sleep(std::time::Duration::from_millis(50));
                if let Ok(mut guard) = child_arc.lock() {
                    match guard.try_wait() {
                        Ok(Some(status)) => {
                            active = false;
                            exit_status = Some(status);
                        }
                        Ok(None) => {}
                        Err(_) => {
                            active = false;
                        }
                    }
                } else {
                    active = false;
                }
            }
            exit_status
        };

        let exit_code = status_res.and_then(|s| s.code());
        let status_str = if let Some(code) = exit_code {
            if code == 0 {
                "stopped"
            } else {
                "failed"
            }
        } else {
            "stopped"
        };

        append_to_instance_log(
            &instance_id_clone_mon,
            &format!("[EXIT] Status: {}, Exit Code: {:?}", status_str, exit_code),
        );

        let status_payload = serde_json::json!({
            "instance_id": instance_id_clone_mon,
            "status": status_str,
            "exit_code": exit_code
        });
        if let Some(ref cb) = on_event_mon {
            cb("cli-status-event".to_string(), status_payload.clone());
        }
        println!(
            "EVENT: cli-status-event:{}",
            serde_json::to_string(&status_payload).unwrap_or_default()
        );

        get_active_instances()
            .lock()
            .unwrap()
            .remove(&instance_id_clone_mon);

        let mut list = get_active_instances_list();
        list.retain(|x| x.instance_id != instance_id_clone_mon);
        save_active_instances_list(&list);

        if let Ok(mut cfg) = load_config() {
            if let Some(t) = cfg
                .templates
                .iter_mut()
                .find(|temp| temp.id == template_id_clone)
            {
                let now_str = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default();
                t.last_run = Some(now_str);
                let _ = save_config(&cfg);
            }
        }
    });

    Ok(instance_id)
}

pub fn kill_cli_instance(instance_id: String) -> Result<()> {
    if let Ok(mut cfg) = load_config() {
        if let Some(inst) = cfg.agent_instances.iter_mut().find(|i| i.id == instance_id) {
            inst.status = "interrupted".to_string();
            let now_str = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_default();
            inst.end_time = Some(now_str);
            let _ = save_config(&cfg);
        }
    }

    let instance_id_clone = instance_id.clone();
    std::thread::spawn(move || {
        let child_arc_opt = get_active_instances()
            .lock()
            .unwrap()
            .get(&instance_id_clone)
            .cloned();
        if let Some(child_arc) = child_arc_opt {
            let pid = {
                if let Ok(guard) = child_arc.lock() {
                    guard.id()
                } else {
                    return;
                }
            };
            let _ = kill_process_tree(pid);
        }

        let mut list = get_active_instances_list();
        if let Some(pos) = list.iter().position(|x| x.instance_id == instance_id_clone) {
            let entry = list.remove(pos);
            save_active_instances_list(&list);
            let _ = kill_process_tree(entry.pid);
        }
    });

    Ok(())
}

pub fn get_language() -> Result<String> {
    let config = load_config()?;
    Ok(config.language.clone())
}

pub fn set_language(lang: String) -> Result<()> {
    let mut config = load_config()?;
    config.language = lang;
    save_config(&config)?;
    Ok(())
}

pub fn get_theme() -> Result<String> {
    let config = load_config()?;
    Ok(config.theme.clone())
}

pub fn set_theme(theme: String) -> Result<()> {
    let mut config = load_config()?;
    config.theme = theme;
    save_config(&config)?;
    Ok(())
}

pub fn get_autostart_enabled() -> Result<bool> {
    let config = load_config()?;
    Ok(config.autostart)
}

pub fn set_autostart_enabled(enabled: bool) -> Result<()> {
    let mut config = load_config()?;
    config.autostart = enabled;
    save_config(&config)?;
    Ok(())
}

pub fn get_skipped_version() -> Result<Option<String>> {
    let config = load_config()?;
    Ok(config.skipped_version.clone())
}

pub fn set_skipped_version(version: Option<String>) -> Result<()> {
    let mut config = load_config()?;
    config.skipped_version = version;
    save_config(&config)?;
    Ok(())
}

pub fn get_project_column_align() -> Result<String> {
    let config = load_config()?;
    Ok(config.project_column_align.clone())
}

pub fn set_project_column_align(align: String) -> Result<()> {
    let mut config = load_config()?;
    config.project_column_align = align;
    save_config(&config)?;
    Ok(())
}

pub fn get_update_check_interval() -> Result<String> {
    let config = load_config()?;
    Ok(config.update_check_interval.clone())
}

pub fn set_update_check_interval(interval: String) -> Result<()> {
    let mut config = load_config()?;
    config.update_check_interval = interval;
    save_config(&config)?;
    Ok(())
}

pub fn update_category(cat_id: String, name: String, desc: String) -> Result<Category> {
    if name.is_empty() {
        return Err(StorageError::Validation(
            "Category name cannot be empty".to_string(),
        ));
    }
    if name.len() > 255 {
        return Err(StorageError::Validation(
            "Category name is too long".to_string(),
        ));
    }

    let mut config = load_config()?;
    let cat_idx = config
        .categories
        .iter()
        .position(|c| c.id == cat_id)
        .ok_or_else(|| StorageError::CategoryNotFound(cat_id.clone()))?;

    if config
        .categories
        .iter()
        .enumerate()
        .any(|(i, c)| i != cat_idx && c.name == name)
    {
        return Err(StorageError::Validation(format!(
            "Category with name {} already exists",
            name
        )));
    }

    config.categories[cat_idx].name = name;
    config.categories[cat_idx].description = desc;

    let updated = config.categories[cat_idx].clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn smart_classify() -> Result<(usize, usize)> {
    let mut config = load_config()?;
    let lang = config.language.clone();

    let (sys_name, dev_name) = if lang == "zh" {
        ("系统", "开发")
    } else {
        ("System", "Development")
    };

    let sys_cat_id = if let Some(cat) = config.categories.iter().find(|c| c.name == sys_name) {
        cat.id.clone()
    } else {
        let new_id = Uuid::new_v4().to_string();
        config.categories.push(Category {
            id: new_id.clone(),
            name: sys_name.to_string(),
            description: if lang == "zh" {
                "系统指令与工具".to_string()
            } else {
                "System commands and tools".to_string()
            },
        });
        new_id
    };

    let dev_cat_id = if let Some(cat) = config.categories.iter().find(|c| c.name == dev_name) {
        cat.id.clone()
    } else {
        let new_id = Uuid::new_v4().to_string();
        config.categories.push(Category {
            id: new_id.clone(),
            name: dev_name.to_string(),
            description: if lang == "zh" {
                "开发工具与编译器".to_string()
            } else {
                "Development tools and compilers".to_string()
            },
        });
        new_id
    };

    let sys_cmds = [
        "cmd",
        "powershell",
        "pwsh",
        "ping",
        "ipconfig",
        "systeminfo",
        "netstat",
        "explorer",
        "taskkill",
        "tasklist",
        "sc",
        "reg",
        "shutdown",
        "chkdsk",
        "attrib",
        "robocopy",
        "xcopy",
        "nslookup",
        "tracert",
        "arp",
        "route",
        "net",
        "wmic",
        "sfc",
        "dism",
        "gpupdate",
        "gpresult",
        "cipher",
        "compact",
        "format",
        "diskpart",
        "hostname",
        "whoami",
        "taskmgr",
        "control",
        "mstsc",
        "regedit",
        "dxdiag",
        "cleanmgr",
    ];

    let dev_cmds = [
        "java", "javac", "rustc", "cargo", "git", "npm", "node", "yarn", "pnpm", "python", "pip",
        "go", "gcc", "g++", "clang", "docker", "mvn", "gradle", "php", "ruby", "gem", "composer",
        "dotnet", "make", "cmake", "git-lfs", "gh", "code", "rustup", "bun", "deno", "subl", "vim",
        "nano", "bash", "sh", "zsh", "ssh", "scp", "sftp", "curl", "wget",
    ];

    let mut sys_count = 0;
    let mut dev_count = 0;

    for tool in &mut config.cli_tools {
        let tool_stem = tool
            .path
            .file_stem()
            .map(|s| s.to_string_lossy().to_lowercase())
            .unwrap_or_else(|| tool.name.to_lowercase());

        if sys_cmds.contains(&tool_stem.as_str()) {
            if tool.category_id.as_ref() != Some(&sys_cat_id) {
                tool.category_id = Some(sys_cat_id.clone());
                sys_count += 1;
            }
        } else if dev_cmds.contains(&tool_stem.as_str()) {
            if tool.category_id.as_ref() != Some(&dev_cat_id) {
                tool.category_id = Some(dev_cat_id.clone());
                dev_count += 1;
            }
        }
    }

    // Always save config to ensure categories themselves are stored
    save_config(&config)?;

    Ok((sys_count, dev_count))
}

pub fn get_font_family() -> Result<String> {
    let config = load_config()?;
    Ok(config.font_family.clone())
}

pub fn set_font_family(font: String) -> Result<()> {
    let mut config = load_config()?;
    config.font_family = font;
    save_config(&config)?;
    Ok(())
}

pub fn get_font_size() -> Result<String> {
    let config = load_config()?;
    Ok(config.font_size.clone())
}

pub fn set_font_size(size: String) -> Result<()> {
    let mut config = load_config()?;
    config.font_size = size;
    save_config(&config)?;
    Ok(())
}

pub fn get_global_env_vars() -> Result<Vec<GlobalEnvVar>> {
    let config = load_config()?;
    Ok(config.env_vars.clone())
}

pub fn create_global_env_var(
    key: String,
    value: String,
    description: String,
) -> Result<GlobalEnvVar> {
    let mut config = load_config()?;
    let key_trimmed = key.trim().to_string();
    if key_trimmed.is_empty() {
        return Err(StorageError::Validation(
            "Environment variable key cannot be empty".to_string(),
        ));
    }
    if config
        .env_vars
        .iter()
        .any(|ev| ev.key == key_trimmed && ev.value == value)
    {
        return Err(StorageError::Validation(format!(
            "Environment variable '{}' with value '{}' already exists",
            key_trimmed, value
        )));
    }
    let new_var = GlobalEnvVar {
        id: uuid::Uuid::new_v4().to_string(),
        key: key_trimmed,
        value,
        description,
    };
    config.env_vars.push(new_var.clone());
    save_config(&config)?;
    Ok(new_var)
}

pub fn update_global_env_var(
    id: String,
    key: String,
    value: String,
    description: String,
) -> Result<GlobalEnvVar> {
    let mut config = load_config()?;
    let key_trimmed = key.trim().to_string();
    if key_trimmed.is_empty() {
        return Err(StorageError::Validation(
            "Environment variable key cannot be empty".to_string(),
        ));
    }
    let idx = config
        .env_vars
        .iter()
        .position(|ev| ev.id == id)
        .ok_or_else(|| StorageError::Validation(format!("Environment variable not found")))?;

    if config
        .env_vars
        .iter()
        .any(|ev| ev.id != id && ev.key == key_trimmed)
    {
        return Err(StorageError::Validation(format!(
            "Environment variable '{}' already exists",
            key_trimmed
        )));
    }

    config.env_vars[idx].key = key_trimmed;
    config.env_vars[idx].value = value;
    config.env_vars[idx].description = description;

    let updated = config.env_vars[idx].clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_global_env_var(id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.env_vars.len();
    config.env_vars.retain(|ev| ev.id != id);
    if config.env_vars.len() == initial_len {
        return Err(StorageError::Validation(format!(
            "Environment variable not found"
        )));
    }

    // Also remove from any template referencing it
    for tpl in &mut config.templates {
        tpl.env_var_ids.retain(|x| x != &id);
    }

    save_config(&config)?;
    Ok(())
}

pub fn get_projects() -> Result<Vec<Project>> {
    let config = load_config()?;
    Ok(config.projects.clone())
}

pub fn create_project(name: String, root_path: String) -> Result<Project> {
    let name_trimmed = name.trim().to_string();
    if name_trimmed.is_empty() {
        return Err(StorageError::Validation(
            "Project name cannot be empty".to_string(),
        ));
    }
    let path = PathBuf::from(&root_path);
    if !path.exists() || !path.is_dir() {
        return Err(StorageError::Validation(format!(
            "Project root directory does not exist: {}",
            root_path
        )));
    }

    let mut config = load_config()?;
    let new_project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: name_trimmed,
        root_path: path,
        env_profiles: HashMap::new(),
        quick_commands: Vec::new(),
    };
    config.projects.push(new_project.clone());
    save_config(&config)?;
    Ok(new_project)
}

pub fn delete_project(id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.projects.len();
    config.projects.retain(|p| p.id != id);
    if config.projects.len() == initial_len {
        return Err(StorageError::Validation(format!("Project not found")));
    }
    config.agent_instances.retain(|ai| ai.project_id != id);
    save_config(&config)?;
    Ok(())
}

pub fn reorder_projects(ids: Vec<String>) -> Result<()> {
    let mut config = load_config()?;
    let mut reordered = Vec::with_capacity(config.projects.len());

    // First, add matching projects in the requested order
    for id in &ids {
        if let Some(pos) = config.projects.iter().position(|p| &p.id == id) {
            reordered.push(config.projects.remove(pos));
        }
    }

    // Add any remaining projects that were not in the ids list (to prevent data loss)
    reordered.append(&mut config.projects);

    config.projects = reordered;
    save_config(&config)?;
    Ok(())
}

pub fn reorder_templates(ids: Vec<String>) -> Result<()> {
    let mut config = load_config()?;
    let mut reordered = Vec::with_capacity(config.templates.len());

    // First, add matching templates in the requested order
    for id in &ids {
        if let Some(pos) = config.templates.iter().position(|t| &t.id == id) {
            reordered.push(config.templates.remove(pos));
        }
    }

    // Add any remaining templates that were not in the ids list (to prevent data loss)
    reordered.append(&mut config.templates);

    config.templates = reordered;
    save_config(&config)?;
    Ok(())
}

pub fn reorder_cli_tools(ids: Vec<String>) -> Result<()> {
    let mut config = load_config()?;
    let mut reordered = Vec::with_capacity(config.cli_tools.len());

    // First, add matching CLI tools in the requested order
    for id in &ids {
        if let Some(pos) = config.cli_tools.iter().position(|t| &t.id == id) {
            reordered.push(config.cli_tools.remove(pos));
        }
    }

    // Add any remaining CLI tools that were not in the ids list (to prevent data loss)
    reordered.append(&mut config.cli_tools);

    config.cli_tools = reordered;
    save_config(&config)?;
    Ok(())
}

pub fn get_project_agents(project_id: String) -> Result<Vec<AgentInstance>> {
    let config = load_config()?;
    let filtered = config
        .agent_instances
        .iter()
        .filter(|ai| ai.project_id == project_id)
        .cloned()
        .collect();
    Ok(filtered)
}

pub fn spawn_project_agent(
    project_id: String,
    command: String,
    args: Vec<String>,
    env_mode: String,
    custom_envs: HashMap<String, String>,
    pwd: Option<String>,
    on_event: Option<Arc<dyn Fn(String, serde_json::Value) + Send + Sync + 'static>>,
) -> Result<String> {
    let config = load_config()?;
    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let executable_path = if let Some(tool) = config
        .cli_tools
        .iter()
        .find(|t| t.id == command || t.name == command)
    {
        tool.path.clone()
    } else {
        PathBuf::from(&command)
    };

    let working_dir = if let Some(ref p_str) = pwd {
        let p = Path::new(p_str);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            project.root_path.join(p)
        }
    } else {
        project.root_path.clone()
    };

    let mut final_args = Vec::new();
    if let Some(tool) = config
        .cli_tools
        .iter()
        .find(|t| t.id == command || t.name == command)
    {
        final_args.extend(tool.custom_args.clone());
    }
    final_args.extend(args.clone());

    let child = spawn_in_new_terminal(
        &executable_path,
        &final_args,
        &working_dir,
        &env_mode,
        &custom_envs,
        &config,
        &command,
    )?;
    let instance_id = Uuid::new_v4().to_string();
    let pid = child.id();

    // Log startup command details
    append_to_instance_log(
        &instance_id,
        &format!("[SPAWN] Command: {:?}", executable_path),
    );
    append_to_instance_log(&instance_id, &format!("[SPAWN] Args: {:?}", args));
    append_to_instance_log(
        &instance_id,
        &format!("[SPAWN] Working Dir: {:?}", working_dir),
    );
    append_to_instance_log(&instance_id, &format!("[SPAWN] Env Mode: {}", env_mode));
    println!(
        "[Agent Spawn] Command: {} {:?}",
        executable_path.display(),
        args
    );
    println!("[Agent Spawn] Working Dir: {:?}", working_dir);
    println!("[Agent Spawn] Env Mode: {}", env_mode);

    let start_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();

    let new_instance = AgentInstance {
        id: instance_id.clone(),
        project_id: project_id.clone(),
        command: command.clone(),
        arguments: args.clone(),
        status: "running".to_string(),
        env_mode: env_mode.clone(),
        custom_envs: custom_envs.clone(),
        start_time,
        end_time: None,
        pid: Some(pid),
    };

    let mut config_mut = load_config()?;
    config_mut.agent_instances.push(new_instance);
    save_config(&config_mut)?;

    let mut list = get_active_instances_list();
    list.push(ActiveInstance {
        instance_id: instance_id.clone(),
        pid,
        template_id: "".to_string(),
    });
    save_active_instances_list(&list);

    let payload = serde_json::json!({
        "instance_id": instance_id,
        "status": "running",
        "exit_code": null
    });
    if let Some(ref cb) = on_event {
        cb("cli-status-event".to_string(), payload.clone());
    }

    let child_arc = Arc::new(Mutex::new(child));
    get_active_instances()
        .lock()
        .unwrap()
        .insert(instance_id.clone(), child_arc.clone());

    let instance_id_clone = instance_id.clone();
    let child_arc_stdout = child_arc.clone();
    let on_event_stdout = on_event.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut stdout_opt = None;
        if let Ok(mut guard) = child_arc_stdout.lock() {
            stdout_opt = guard.stdout.take();
        }
        if let Some(stdout) = stdout_opt {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let log_payload = serde_json::json!({
                        "instance_id": instance_id_clone,
                        "stream": "stdout",
                        "chunk": l
                    });
                    if let Some(ref cb) = on_event_stdout {
                        cb("cli-log-event".to_string(), log_payload.clone());
                    }
                    println!("[Agent Stdout] [{}]: {}", instance_id_clone, l);
                    append_to_instance_log(&instance_id_clone, &format!("[STDOUT] {}", l));
                }
            }
        }
    });

    let instance_id_clone_err = instance_id.clone();
    let child_arc_stderr = child_arc.clone();
    let on_event_stderr = on_event.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut stderr_opt = None;
        if let Ok(mut guard) = child_arc_stderr.lock() {
            stderr_opt = guard.stderr.take();
        }
        if let Some(stderr) = stderr_opt {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let log_payload = serde_json::json!({
                        "instance_id": instance_id_clone_err,
                        "stream": "stderr",
                        "chunk": l
                    });
                    if let Some(ref cb) = on_event_stderr {
                        cb("cli-log-event".to_string(), log_payload.clone());
                    }
                    eprintln!("[Agent Stderr] [{}]: {}", instance_id_clone_err, l);
                    append_to_instance_log(&instance_id_clone_err, &format!("[STDERR] {}", l));
                }
            }
        }
    });

    let instance_id_clone_mon = instance_id.clone();
    let on_event_mon = on_event.clone();
    std::thread::spawn(move || {
        let status_res = {
            let mut active = true;
            let mut exit_status = None;
            while active {
                std::thread::sleep(std::time::Duration::from_millis(50));
                if let Ok(mut guard) = child_arc.lock() {
                    match guard.try_wait() {
                        Ok(Some(status)) => {
                            active = false;
                            exit_status = Some(status);
                        }
                        Ok(None) => {}
                        Err(_) => {
                            active = false;
                        }
                    }
                } else {
                    active = false;
                }
            }
            exit_status
        };

        let exit_code = status_res.and_then(|s| s.code());
        let status_str = if let Some(code) = exit_code {
            if code == 0 {
                "success"
            } else {
                "failed"
            }
        } else {
            "failed"
        };

        println!(
            "[Agent Exit] [{}]: Status: {}, Exit Code: {:?}",
            instance_id_clone_mon, status_str, exit_code
        );
        append_to_instance_log(
            &instance_id_clone_mon,
            &format!("[EXIT] Status: {}, Exit Code: {:?}", status_str, exit_code),
        );

        let status_payload = serde_json::json!({
            "instance_id": instance_id_clone_mon,
            "status": status_str,
            "exit_code": exit_code
        });
        if let Some(ref cb) = on_event_mon {
            cb("cli-status-event".to_string(), status_payload.clone());
        }

        get_active_instances()
            .lock()
            .unwrap()
            .remove(&instance_id_clone_mon);

        let mut list = get_active_instances_list();
        list.retain(|x| x.instance_id != instance_id_clone_mon);
        save_active_instances_list(&list);

        if let Ok(mut cfg) = load_config() {
            if let Some(inst) = cfg
                .agent_instances
                .iter_mut()
                .find(|i| i.id == instance_id_clone_mon)
            {
                if inst.status != "interrupted" {
                    inst.status = status_str.to_string();
                }
                let now_str = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default();
                inst.end_time = Some(now_str);
                let _ = save_config(&cfg);
            }
        }
    });

    Ok(instance_id)
}

pub fn sync_running_processes() -> Result<()> {
    let mut config = load_config()?;
    let mut modified = false;

    for inst in &mut config.agent_instances {
        if inst.status == "running" {
            let is_alive = if let Some(pid) = inst.pid {
                #[cfg(target_os = "windows")]
                {
                    let mut cmd = Command::new("tasklist");
                    cmd.args(&["/FI", &format!("PID eq {}", pid)]);
                    cmd.stdout(Stdio::piped());
                    cmd.stderr(Stdio::null());
                    if let Ok(child) = cmd.spawn() {
                        if let Ok(output) = child.wait_with_output() {
                            let stdout = String::from_utf8_lossy(&output.stdout);
                            stdout.contains(&pid.to_string())
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let mut cmd = Command::new("kill");
                    cmd.args(&["-0", &pid.to_string()]);
                    cmd.stdout(Stdio::null());
                    cmd.stderr(Stdio::null());
                    if let Ok(mut child) = cmd.spawn() {
                        child.wait().map(|s| s.success()).unwrap_or(false)
                    } else {
                        false
                    }
                }
            } else {
                false
            };

            if !is_alive {
                inst.status = "interrupted".to_string();
                let now_str = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_default();
                inst.end_time = Some(now_str);
                modified = true;
            }
        }
    }

    if modified {
        save_config(&config)?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct LockFileSkill {
    pub source: String,
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "skillPath")]
    pub skill_path: String,
    #[serde(rename = "computedHash")]
    pub computed_hash: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct LockFile {
    pub version: u32,
    pub skills: HashMap<String, LockFileSkill>,
}

pub fn get_project_skills(project_id: String) -> Result<Vec<ProjectSkill>> {
    let config = load_config()?;
    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let lock_path = project.root_path.join("skills-lock.json");
    let mut skills_map = HashMap::new();

    if lock_path.exists() {
        if let Ok(content) = fs::read_to_string(&lock_path) {
            if let Ok(lock_file) = serde_json::from_str::<LockFile>(&content) {
                for (name, skill) in lock_file.skills {
                    skills_map.insert(
                        name.clone(),
                        ProjectSkill {
                            name,
                            enabled: false,
                            source: skill.source,
                            skill_path: skill.skill_path,
                            computed_hash: skill.computed_hash,
                        },
                    );
                }
            }
        }
    }

    // Now scan directory for actually present skills and their active status
    let skills_dir = project.root_path.join(".agents").join("skills");
    if skills_dir.exists() && skills_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name_os) = path.file_name() {
                        let name = name_os.to_string_lossy().to_string();
                        let skill_md = path.join("SKILL.md");
                        let skill_md_disabled = path.join("SKILL.md.disabled");

                        let enabled = skill_md.exists();

                        if let Some(existing) = skills_map.get_mut(&name) {
                            existing.enabled = enabled;
                        } else if skill_md.exists() || skill_md_disabled.exists() {
                            // If it exists on disk but not in lock file, still show it
                            skills_map.insert(
                                name.clone(),
                                ProjectSkill {
                                    name,
                                    enabled,
                                    source: "".to_string(),
                                    skill_path: "".to_string(),
                                    computed_hash: "".to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<ProjectSkill> = skills_map.into_values().collect();
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

pub fn toggle_project_skill(project_id: String, skill_name: String, enabled: bool) -> Result<()> {
    let config = load_config()?;
    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let skills_dir = project
        .root_path
        .join(".agents")
        .join("skills")
        .join(&skill_name);
    if !skills_dir.exists() {
        return Err(StorageError::Validation(format!(
            "Skill '{}' directory does not exist mapping this project",
            skill_name
        )));
    }

    let skill_md = skills_dir.join("SKILL.md");
    let skill_md_disabled = skills_dir.join("SKILL.md.disabled");

    if enabled {
        if skill_md_disabled.exists() {
            fs::rename(&skill_md_disabled, &skill_md)
                .map_err(|e| StorageError::Validation(format!("Failed to enable skill: {}", e)))?;
        } else if !skill_md.exists() {
            fs::write(
                &skill_md,
                format!("# {}\n\nSkill description goes here.", skill_name),
            )
            .map_err(|e| StorageError::Validation(format!("Failed to create SKILL.md: {}", e)))?;
        }
    } else {
        if skill_md.exists() {
            fs::rename(&skill_md, &skill_md_disabled)
                .map_err(|e| StorageError::Validation(format!("Failed to disable skill: {}", e)))?;
        }
    }

    Ok(())
}

pub fn scan_project_agent_docs(project_id: String) -> Result<Vec<AgentDoc>> {
    let config = load_config()?;
    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let mut docs = Vec::new();
    let root = &project.root_path;

    fn walk_dir(dir: &Path, root: &Path, docs: &mut Vec<AgentDoc>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name() {
                        let name_str = name.to_string_lossy().to_lowercase();
                        if name_str == "node_modules"
                            || name_str == "target"
                            || name_str == ".git"
                            || name_str == ".tmp"
                            || name_str == ".backup"
                        {
                            continue;
                        }
                    }
                    walk_dir(&path, root, docs);
                } else if path.is_file() {
                    if let Some(file_name_os) = path.file_name() {
                        let file_name_lower = file_name_os.to_string_lossy().to_lowercase();
                        if file_name_lower == "agents.md"
                            || file_name_lower == "claude.md"
                            || file_name_lower == "gemini.md"
                            || file_name_lower == "agents_instructions.md"
                        {
                            if let Ok(rel_path) = path.strip_prefix(root) {
                                let mut rel_str = rel_path.to_string_lossy().replace('\\', "/");
                                if !rel_str.starts_with("./") {
                                    rel_str = format!("./{}", rel_str);
                                }
                                docs.push(AgentDoc {
                                    relative_path: rel_str,
                                    absolute_path: path.clone(),
                                    file_name: file_name_os.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    walk_dir(root, root, &mut docs);
    docs.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });
    Ok(docs)
}

pub fn create_project_agent_doc(
    project_id: String,
    relative_path: String,
    doc_type: String,
) -> Result<AgentDoc> {
    let config = load_config()?;
    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    // Strip manual relative indicators
    let mut clean_rel = relative_path.replace('\\', "/");
    if clean_rel.starts_with("./") {
        clean_rel = clean_rel.split_at(2).1.to_string();
    }
    if clean_rel.starts_with('/') {
        clean_rel = clean_rel.split_at(1).1.to_string();
    }

    let absolute_path = project.root_path.join(&clean_rel);
    if absolute_path.exists() {
        return Err(StorageError::Validation(format!(
            "Document at '{}' already exists",
            clean_rel
        )));
    }

    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            StorageError::Validation(format!("Failed to create directory structure: {}", e))
        })?;
    }

    let file_name = absolute_path
        .file_name()
        .ok_or_else(|| StorageError::Validation("Invalid file target path".to_string()))?
        .to_string_lossy()
        .to_string();

    let template = match doc_type.to_lowercase().as_str() {
        "claude" => {
            "# CLAUDE.md\n\n## Build & Test Commands\n- Build: `cargo build` / `npm run build`\n- Test: `cargo test` / `npm test`\n"
        }
        "agents" => {
            "# AGENTS.md\n\n## Multi-Agent Configuration\nDescribe roles, hierarchies, and rules for agents working on this area of the codebase.\n"
        }
        "gemini" => {
            "# gemini.md\n\n## Gemini Integration Guidelines\nIdentify prompts, system instructions, and schemas tailored for Gemini-based models here.\n"
        }
        _ => {
            "# Agent Instructions\n\n- Custom agent guidelines.\n"
        }
    };

    fs::write(&absolute_path, template)
        .map_err(|e| StorageError::Validation(format!("Failed to write agent document: {}", e)))?;

    let final_rel_str = if clean_rel.starts_with("./") {
        clean_rel
    } else {
        format!("./{}", clean_rel)
    };

    Ok(AgentDoc {
        relative_path: final_rel_str,
        absolute_path,
        file_name,
    })
}

// ─── Global Skills & Document Templates ───────────────────────────────────

pub fn get_global_skills() -> Result<Vec<GlobalSkillTemplate>> {
    let config = load_config()?;
    Ok(config.global_skills)
}

pub fn create_global_skill(
    name: String,
    description: String,
    content: String,
    files: HashMap<String, String>,
) -> Result<GlobalSkillTemplate> {
    let mut config = load_config()?;

    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err(StorageError::Validation(
            "Skill name cannot be empty".to_string(),
        ));
    }

    if config
        .global_skills
        .iter()
        .any(|s| s.name.eq_ignore_ascii_case(&trimmed_name))
    {
        return Err(StorageError::Validation(format!(
            "Global skill with name '{}' already exists",
            trimmed_name
        )));
    }

    let template = GlobalSkillTemplate {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name,
        description,
        content,
        files,
    };

    config.global_skills.push(template.clone());
    save_config(&config)?;
    Ok(template)
}

pub fn update_global_skill(
    id: String,
    name: String,
    description: String,
    content: String,
    files: HashMap<String, String>,
) -> Result<GlobalSkillTemplate> {
    let mut config = load_config()?;

    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err(StorageError::Validation(
            "Skill name cannot be empty".to_string(),
        ));
    }

    let idx = config
        .global_skills
        .iter()
        .position(|s| s.id == id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Global skill with ID {} not found", id))
        })?;

    if config
        .global_skills
        .iter()
        .enumerate()
        .any(|(i, s)| i != idx && s.name.eq_ignore_ascii_case(&trimmed_name))
    {
        return Err(StorageError::Validation(format!(
            "Global skill with name '{}' already exists",
            trimmed_name
        )));
    }

    let item = &mut config.global_skills[idx];
    item.name = trimmed_name;
    item.description = description;
    item.content = content;
    item.files = files;

    let updated = item.clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_global_skill(id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.global_skills.len();
    config.global_skills.retain(|s| s.id != id);

    if config.global_skills.len() == initial_len {
        return Err(StorageError::Validation(format!(
            "Global skill with ID {} not found",
            id
        )));
    }

    save_config(&config)?;
    Ok(())
}

pub fn get_global_docs() -> Result<Vec<GlobalDocTemplate>> {
    let config = load_config()?;
    Ok(config.global_docs)
}

pub fn create_global_doc(
    alias: String,
    default_filename: String,
    content: String,
) -> Result<GlobalDocTemplate> {
    let mut config = load_config()?;

    let trimmed_alias = alias.trim().to_string();
    if trimmed_alias.is_empty() {
        return Err(StorageError::Validation(
            "Document template alias cannot be empty".to_string(),
        ));
    }

    if config
        .global_docs
        .iter()
        .any(|d| d.alias.eq_ignore_ascii_case(&trimmed_alias))
    {
        return Err(StorageError::Validation(format!(
            "Global doc template with alias '{}' already exists",
            trimmed_alias
        )));
    }

    let template = GlobalDocTemplate {
        id: Uuid::new_v4().to_string(),
        alias: trimmed_alias,
        default_filename: default_filename.trim().to_string(),
        content,
    };

    config.global_docs.push(template.clone());
    save_config(&config)?;
    Ok(template)
}

pub fn update_global_doc(
    id: String,
    alias: String,
    default_filename: String,
    content: String,
) -> Result<GlobalDocTemplate> {
    let mut config = load_config()?;

    let trimmed_alias = alias.trim().to_string();
    if trimmed_alias.is_empty() {
        return Err(StorageError::Validation(
            "Document template alias cannot be empty".to_string(),
        ));
    }

    let idx = config
        .global_docs
        .iter()
        .position(|d| d.id == id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Global doc template with ID {} not found", id))
        })?;

    if config
        .global_docs
        .iter()
        .enumerate()
        .any(|(i, d)| i != idx && d.alias.eq_ignore_ascii_case(&trimmed_alias))
    {
        return Err(StorageError::Validation(format!(
            "Global doc template with alias '{}' already exists",
            trimmed_alias
        )));
    }

    let item = &mut config.global_docs[idx];
    item.alias = trimmed_alias;
    item.default_filename = default_filename.trim().to_string();
    item.content = content;

    let updated = item.clone();
    save_config(&config)?;
    Ok(updated)
}

pub fn delete_global_doc(id: String) -> Result<()> {
    let mut config = load_config()?;
    let initial_len = config.global_docs.len();
    config.global_docs.retain(|d| d.id != id);

    if config.global_docs.len() == initial_len {
        return Err(StorageError::Validation(format!(
            "Global doc template with ID {} not found",
            id
        )));
    }

    save_config(&config)?;
    Ok(())
}

pub fn import_global_skill_to_project(project_id: String, skill_id: String) -> Result<()> {
    let config = load_config()?;

    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let skill = config
        .global_skills
        .iter()
        .find(|s| s.id == skill_id)
        .ok_or_else(|| {
            StorageError::Validation(format!(
                "Global skill template with ID {} not found",
                skill_id
            ))
        })?;

    let skill_dir = project
        .root_path
        .join(".agents")
        .join("skills")
        .join(&skill.name);
    fs::create_dir_all(&skill_dir).map_err(|e| {
        StorageError::Validation(format!("Failed to create skill directory: {}", e))
    })?;

    let skill_md = skill_dir.join("SKILL.md");
    fs::write(&skill_md, &skill.content)
        .map_err(|e| StorageError::Validation(format!("Failed to write SKILL.md: {}", e)))?;

    for (rel_path, file_content) in &skill.files {
        let clean_rel = rel_path.replace('\\', "/");
        let mut clean_rel_str = clean_rel.as_str();
        if clean_rel_str.starts_with("./") {
            clean_rel_str = &clean_rel_str[2..];
        }
        if clean_rel_str.starts_with('/') {
            clean_rel_str = &clean_rel_str[1..];
        }
        if clean_rel_str.is_empty() || clean_rel_str.contains("..") {
            continue;
        }
        let target_path = skill_dir.join(clean_rel_str);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                StorageError::Validation(format!(
                    "Failed to create directory structure for skill file: {}",
                    e
                ))
            })?;
        }
        fs::write(&target_path, file_content).map_err(|e| {
            StorageError::Validation(format!(
                "Failed to write skill file '{}': {}",
                clean_rel_str, e
            ))
        })?;
    }

    Ok(())
}

pub fn import_global_doc_to_project(
    project_id: String,
    doc_id: String,
    relative_path: String,
) -> Result<AgentDoc> {
    let config = load_config()?;

    let project = config
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Project with ID {} not found", project_id))
        })?;

    let doc = config
        .global_docs
        .iter()
        .find(|d| d.id == doc_id)
        .ok_or_else(|| {
            StorageError::Validation(format!("Global doc template with ID {} not found", doc_id))
        })?;

    let mut clean_rel = relative_path.replace('\\', "/");
    if clean_rel.starts_with("./") {
        clean_rel = clean_rel.split_at(2).1.to_string();
    }
    if clean_rel.starts_with('/') {
        clean_rel = clean_rel.split_at(1).1.to_string();
    }

    let absolute_path = project.root_path.join(&clean_rel);

    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            StorageError::Validation(format!("Failed to create directory structure: {}", e))
        })?;
    }

    let file_name = absolute_path
        .file_name()
        .ok_or_else(|| StorageError::Validation("Invalid file target path".to_string()))?
        .to_string_lossy()
        .to_string();

    fs::write(&absolute_path, &doc.content)
        .map_err(|e| StorageError::Validation(format!("Failed to write document: {}", e)))?;

    let final_rel_str = if clean_rel.starts_with("./") {
        clean_rel
    } else {
        format!("./{}", clean_rel)
    };

    Ok(AgentDoc {
        relative_path: final_rel_str,
        absolute_path,
        file_name,
    })
}

pub fn parse_local_skill_dir(dir_path: &Path) -> Result<GlobalSkillTemplate> {
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(StorageError::Validation(
            "Selected path does not exist or is not a directory".to_string(),
        ));
    }

    let folder_name = dir_path
        .file_name()
        .ok_or_else(|| StorageError::Validation("Invalid folder path".to_string()))?
        .to_string_lossy()
        .to_string();

    // 1. Find SKILL.md or Skill.md (case-insensitive check)
    let mut skill_md_path = None;
    let mut skill_md_name = None;
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.eq_ignore_ascii_case("skill.md") {
                skill_md_path = Some(entry.path());
                skill_md_name = Some(name);
                break;
            }
        }
    }

    let skill_md_path = skill_md_path.ok_or_else(|| {
        StorageError::Validation(
            "The directory must contain a 'SKILL.md' or 'Skill.md' file".to_string(),
        )
    })?;

    let content = fs::read_to_string(&skill_md_path)
        .map_err(|e| StorageError::Validation(format!("Failed to read SKILL.md: {}", e)))?;

    // 2. Recursively read other files
    let mut files = HashMap::new();
    let skill_md_name_str = skill_md_name.unwrap_or_else(|| "SKILL.md".to_string());

    fn visit_dirs(
        dir: &Path,
        base_dir: &Path,
        skill_md_name: &str,
        files: &mut HashMap<String, String>,
    ) -> Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir).map_err(|e| StorageError::Validation(e.to_string()))? {
                let entry = entry.map_err(|e| StorageError::Validation(e.to_string()))?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, base_dir, skill_md_name, files)?;
                } else {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                    if file_name.eq_ignore_ascii_case(skill_md_name)
                        && path.parent() == Some(base_dir)
                    {
                        continue;
                    }
                    let rel_path = path
                        .strip_prefix(base_dir)
                        .map_err(|e| StorageError::Validation(e.to_string()))?
                        .to_string_lossy()
                        .replace('\\', "/");

                    if let Ok(file_content) = fs::read_to_string(&path) {
                        files.insert(rel_path, file_content);
                    }
                }
            }
        }
        Ok(())
    }

    visit_dirs(dir_path, dir_path, &skill_md_name_str, &mut files)?;

    Ok(GlobalSkillTemplate {
        id: Uuid::new_v4().to_string(),
        name: folder_name,
        description: "".to_string(),
        content,
        files,
    })
}
