//! 内置 `loom` CLI 的注入逻辑：
//! 1. 接收 GUI 编译期内嵌的 CLI 字节（release 构建由 `crates/gui/src-tauri/build.rs` 注入）
//! 2. 启动时读取 `~/.loom/bin/.version` 与当前版本比对，一致则跳过，否则覆盖更新
//! 3. 写出到 `~/.loom/bin/`，Windows 上注册进用户级 PATH（`HKCU\Environment`）并广播 `WM_SETTINGCHANGE`

use std::fs;
use std::path::{Path, PathBuf};

/// 安装目录下的 CLI 可执行文件名
fn cli_exe_name() -> String {
    #[cfg(target_os = "windows")]
    {
        "loom.exe".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        "loom".to_string()
    }
}

/// `~/.loom/bin` 安装目录
pub fn loom_bin_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".loom").join("bin"))
}

/// 安装后的 CLI 完整路径
pub fn installed_cli_path() -> Option<PathBuf> {
    loom_bin_dir().map(|dir| dir.join(cli_exe_name()))
}

/// 安装目录下记录已安装 CLI 版本的元数据文件
fn version_file() -> Option<PathBuf> {
    loom_bin_dir().map(|dir| dir.join(".version"))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CliInstallStatus {
    pub installed: bool,
    /// 已安装 CLI 的版本（读自 `~/.loom/bin/.version`，未安装为空）
    pub version: String,
    /// 当前应用内置的 CLI 版本（用于比对判断是否需要更新）
    pub bundled_version: String,
    pub bin_dir: String,
    pub cli_path: String,
    /// 是否为 dev 构建（dev 不内嵌 CLI，界面应禁用操作）
    pub is_dev: bool,
}

/// 查询当前 CLI 安装状态（只读，不做任何写入）
pub fn get_loom_cli_status() -> CliInstallStatus {
    let cli_path = installed_cli_path();
    let installed = cli_path.as_deref().map(|p| p.is_file()).unwrap_or(false);
    let version = version_file()
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    CliInstallStatus {
        installed,
        version,
        bundled_version: env!("CARGO_PKG_VERSION").to_string(),
        bin_dir: loom_bin_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        cli_path: cli_path
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_dev: cfg!(debug_assertions),
    }
}

/// 执行 CLI 注入：比对版本 -> 需要时用内嵌字节覆盖 `~/.loom/bin/loom.exe` -> 注册用户 PATH。
/// 版本一致时幂等跳过，返回当前状态。
pub fn install_loom_cli(embedded: &[u8], version: &str) -> Result<CliInstallStatus, String> {
    if embedded.is_empty() {
        return Err("当前构建未内嵌 loom CLI（开发模式）。".to_string());
    }

    let Some(bin_dir) = loom_bin_dir() else {
        return Err("无法解析用户主目录。".to_string());
    };
    fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("创建目录 {} 失败: {}", bin_dir.display(), e))?;

    let dest = bin_dir.join(cli_exe_name());

    // 版本比对：已安装且版本一致则跳过，否则执行安装/更新
    let up_to_date = dest.is_file()
        && version_file()
            .and_then(|p| fs::read_to_string(p).ok())
            .map(|v| v.trim() == version)
            .unwrap_or(false);
    if !up_to_date {
        write_cli(&dest, embedded)?;
        write_version(&bin_dir, version)?;
    }

    #[cfg(target_os = "windows")]
    add_to_user_path(&bin_dir)?;

    Ok(CliInstallStatus {
        installed: true,
        version: version.to_string(),
        bundled_version: version.to_string(),
        bin_dir: bin_dir.to_string_lossy().to_string(),
        cli_path: dest.to_string_lossy().to_string(),
        is_dev: cfg!(debug_assertions),
    })
}

/// 原子写出 CLI：先写临时文件，再替换目标（Windows 上 rename 不能覆盖已存在文件，先移除）。
fn write_cli(dest: &Path, embedded: &[u8]) -> Result<(), String> {
    let tmp = dest.with_extension("exe.tmp");
    fs::write(&tmp, embedded)
        .map_err(|e| format!("写入临时文件 {} 失败: {}", tmp.display(), e))?;
    let _ = fs::remove_file(dest);
    fs::rename(&tmp, dest)
        .map_err(|e| format!("替换 {} 失败（可能被占用，请关闭正在运行的 loom 命令后重试）: {}", dest.display(), e))?;
    Ok(())
}

/// 记录已安装版本到 `~/.loom/bin/.version`
fn write_version(bin_dir: &Path, version: &str) -> Result<(), String> {
    let path = bin_dir.join(".version");
    fs::write(&path, format!("{version}\n"))
        .map_err(|e| format!("写入版本元数据 {} 失败: {}", path.display(), e))
}

/// 把 `dir` 追加到用户级 PATH（`HKCU\Environment\Path`）并广播环境变更。
/// 已存在时视为成功（幂等）。
#[cfg(target_os = "windows")]
pub fn add_to_user_path(dir: &Path) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    let dir_str = dir.to_string_lossy().to_string();
    let env_key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| format!("打开注册表 HKCU\\Environment 失败: {}", e))?;

    let current: String = env_key.get_value("Path").unwrap_or_default();
    let mut entries: Vec<String> = current
        .split(';')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    let normalized = dir_str.trim_end_matches('\\').to_string();
    let already_present = entries
        .iter()
        .any(|e| e.trim_end_matches('\\').eq_ignore_ascii_case(&normalized));
    if already_present {
        return Ok(());
    }

    entries.push(dir_str);
    let new_path = entries.join(";");
    env_key
        .set_value("Path", &new_path)
        .map_err(|e| format!("写入用户 PATH 失败: {}", e))?;

    broadcast_env_change();
    Ok(())
}

/// 向系统广播 `WM_SETTINGCHANGE`，让已运行的进程（含新终端）刷新环境变量。
#[cfg(target_os = "windows")]
fn broadcast_env_change() {
    use winapi::um::winuser::{SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE};

    let msg: Vec<u16> = "Environment\0".encode_utf16().collect();
    unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            msg.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            std::ptr::null_mut(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_exe_name() {
        #[cfg(target_os = "windows")]
        assert_eq!(cli_exe_name(), "loom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(cli_exe_name(), "loom");
    }

    #[test]
    fn test_installed_cli_path_under_home() {
        let path = installed_cli_path().expect("home dir should resolve");
        let comps: Vec<_> = path.components().map(|c| c.as_os_str()).collect();
        assert!(comps.iter().any(|c| *c == std::ffi::OsStr::new(".loom")));
        assert!(comps.iter().any(|c| *c == std::ffi::OsStr::new("bin")));
        assert_eq!(path.file_name().unwrap().to_string_lossy(), cli_exe_name());
    }
}
