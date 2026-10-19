use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitProjectStatus {
    pub is_git: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_dirty: bool,
    pub last_checked: u64,
    pub error: Option<String>,
}

impl Default for GitProjectStatus {
    fn default() -> Self {
        Self {
            is_git: false,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            is_dirty: false,
            last_checked: current_timestamp(),
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitPullResult {
    pub success: bool,
    pub message: String,
    pub status: Option<GitProjectStatus>,
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn create_base_git_cmd(args: &[&str], current_dir: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.args(args);
    cmd.current_dir(current_dir);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd
}

/// 执行本地轻量级 Git 命令（如 rev-parse, branch 等，耗时微秒至毫秒级，无线程创建开销）
fn run_git_local_cmd(args: &[&str], current_dir: &Path) -> Result<std::process::Output, String> {
    let mut cmd = create_base_git_cmd(args, current_dir);
    cmd.output()
        .map_err(|e| format!("Failed to run git {:?}: {}", args, e))
}

/// 执行涉及远端网络的 Git 命令（fetch, pull），在独立线程中执行并施加严苛超时保护
fn run_git_network_cmd(
    args: &[&str],
    current_dir: &Path,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut cmd = create_base_git_cmd(args, current_dir);
    let (tx, rx) = mpsc::channel();
    let args_vec: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    thread::spawn(move || {
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to run git {:?}: {}", args_vec, e));
        let _ = tx.send(output);
    });

    match rx.recv_timeout(timeout) {
        Ok(res) => res,
        Err(_) => Err(format!("git command timed out after {:?}", timeout)),
    }
}

/// 检查指定路径是否为 Git 仓库并获取其状态
/// 如果 `fetch` 为 true，会异步静默 fetch 远端（带 5 秒超时保护）
pub fn check_git_status(project_path: &Path, fetch: bool) -> GitProjectStatus {
    let mut status = GitProjectStatus {
        is_git: false,
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        is_dirty: false,
        last_checked: current_timestamp(),
        error: None,
    };

    if !project_path.exists() {
        return status;
    }

    // 1. 检查是否为 git 仓库
    let rev_parse_res = run_git_local_cmd(&["rev-parse", "--is-inside-work-tree"], project_path);
    let is_inside_work_tree = match rev_parse_res {
        Ok(out) => out.status.success() && String::from_utf8_lossy(&out.stdout).trim() == "true",
        Err(_) => false,
    };

    if !is_inside_work_tree {
        return status;
    }

    status.is_git = true;

    // 2. 获取当前分支名
    if let Ok(branch_out) = run_git_local_cmd(&["branch", "--show-current"], project_path) {
        if branch_out.status.success() {
            let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();
            if !branch.is_empty() {
                status.branch = Some(branch);
            }
        }
    }

    // 如果未获取到分支名（如 detached HEAD），尝试简短 HEAD
    if status.branch.is_none() {
        if let Ok(head_out) = run_git_local_cmd(&["rev-parse", "--short", "HEAD"], project_path) {
            if head_out.status.success() {
                let head = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
                if !head.is_empty() {
                    status.branch = Some(format!("HEAD ({})", head));
                }
            }
        }
    }

    // 3. 检查是否有 upstream
    if let Ok(upstream_out) = run_git_local_cmd(
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        project_path,
    ) {
        if upstream_out.status.success() {
            let upstream = String::from_utf8_lossy(&upstream_out.stdout).trim().to_string();
            if !upstream.is_empty() {
                status.upstream = Some(upstream);
            }
        }
    }

    // 4. 如果有 upstream 且允许 fetch，执行静默 fetch（带 5 秒超时保护）
    if fetch && status.upstream.is_some() {
        let fetch_res = run_git_network_cmd(
            &["fetch", "--quiet"],
            project_path,
            Duration::from_secs(5),
        );
        if let Err(e) = fetch_res {
            status.error = Some(format!("Fetch failed: {}", e));
        }
    }

    // 5. 计算 ahead / behind
    if status.upstream.is_some() {
        if let Ok(behind_out) =
            run_git_local_cmd(&["rev-list", "--count", "HEAD..@{u}"], project_path)
        {
            if behind_out.status.success() {
                let count_str = String::from_utf8_lossy(&behind_out.stdout).trim().to_string();
                status.behind = count_str.parse::<u32>().unwrap_or(0);
            }
        }

        if let Ok(ahead_out) =
            run_git_local_cmd(&["rev-list", "--count", "@{u}..HEAD"], project_path)
        {
            if ahead_out.status.success() {
                let count_str = String::from_utf8_lossy(&ahead_out.stdout).trim().to_string();
                status.ahead = count_str.parse::<u32>().unwrap_or(0);
            }
        }
    }

    // 6. 检查本地是否有未提交的更改（working tree 是否脏）
    if let Ok(status_out) = run_git_local_cmd(&["status", "--porcelain"], project_path) {
        if status_out.status.success() {
            let output = String::from_utf8_lossy(&status_out.stdout);
            status.is_dirty = !output.trim().is_empty();
        }
    }

    status
}

/// 执行拉取操作 (git pull)
pub fn pull_git_project(project_path: &Path) -> GitPullResult {
    if !project_path.exists() {
        return GitPullResult {
            success: false,
            message: "Project path does not exist".to_string(),
            status: None,
        };
    }

    let pull_out = run_git_network_cmd(&["pull"], project_path, Duration::from_secs(30));

    match pull_out {
        Ok(out) => {
            let stdout_msg = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let combined = if !stdout_msg.is_empty() && !stderr_msg.is_empty() {
                format!("{}\n{}", stdout_msg, stderr_msg)
            } else if !stdout_msg.is_empty() {
                stdout_msg
            } else {
                stderr_msg
            };

            let success = out.status.success();
            let updated_status = check_git_status(project_path, false);

            GitPullResult {
                success,
                message: if combined.is_empty() {
                    if success {
                        "Updated successfully".to_string()
                    } else {
                        "Failed without message".to_string()
                    }
                } else {
                    combined
                },
                status: Some(updated_status),
            }
        }
        Err(e) => {
            let updated_status = check_git_status(project_path, false);
            GitPullResult {
                success: false,
                message: format!("Pull execution error: {}", e),
                status: Some(updated_status),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_non_existent_path() {
        let path = Path::new("some/non/existent/path/12345");
        let status = check_git_status(path, false);
        assert!(!status.is_git);
        assert!(status.branch.is_none());

        let pull_res = pull_git_project(path);
        assert!(!pull_res.success);
    }

    #[test]
    fn test_empty_temp_dir_is_not_git() {
        let dir = tempdir().unwrap();
        let status = check_git_status(dir.path(), false);
        assert!(!status.is_git);
        assert!(status.branch.is_none());
    }

    #[test]
    fn test_current_repo_is_git() {
        let current_dir = std::env::current_dir().unwrap();
        let status = check_git_status(&current_dir, false);
        assert!(status.is_git);
        assert!(status.branch.is_some());
    }
}
