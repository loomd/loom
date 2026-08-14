use std::fs;
use std::path::PathBuf;

pub const LOOM_SKILL_VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn get_loom_skill_content() -> String {
    format!(
        r#"---
name: loom
version: {}
description: Loom CLI and Workspace management integration for AI Agents
---

# Loom Skill for AI Agents

This skill enables AI agents to interact with and manage the Loom environment, tools, templates, and workspace processes using the `loom` CLI.

## Step 0: Verify Loom CLI Availability

Before doing anything else, confirm the `loom` CLI is installed and callable:
- Run `loom --version`. If the command fails (binary not found, or non-zero exit code), the CLI is unavailable — stop this workflow immediately and report to the user. Do not proceed with any other step.

## Capabilities & Commands

### 1. View & Manage Projects
- List all projects: `loom project list`
- Add project: `loom project add <name> <root_path>`

### 2. Manage Run Templates (agents)
Templates define how to launch an agent/tool in the Loom workspace (parameters, env vars, working dir).
- List all templates: `loom template list [--json]`
- List templates for a specific agent: `loom template list --agent <agent-name> [--json]`
- Add a template: `loom template add --agent <agent-name> --name <template-name> [--arg <arg>]... [--env KEY=VALUE]... [--pwd <dir>] [--env-mode <inherit|isolated>]`
- Delete a template: `loom template delete --agent <agent-name> --name <template-name>`

`--agent` accepts a registered tool name, alias or id. Newly added templates make a derivable agent appear in the Loom overview (derive) panel in real time.

### 3. Environment Variables
- List global env vars: `loom env list`
- Set global env var: `loom env set <key> <value> [description]`

### 4. System Status & Tools
- List registered CLI tools: `loom tool list`
"#,
        LOOM_SKILL_VERSION
    )
}

pub fn get_skill_target_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        // OpenCode skill directories
        dirs.push(home.join(".agents").join("skills").join("loom"));
        dirs.push(home.join(".config").join("opencode").join("skills").join("loom"));
    }
    dirs
}

pub fn get_existing_skill_paths() -> Vec<String> {
    let mut paths = Vec::new();
    for dir in get_skill_target_dirs() {
        let file_path = dir.join("SKILL.md");
        if file_path.exists() {
            if let Some(s) = file_path.to_str() {
                paths.push(s.to_string());
            }
        }
    }
    paths
}

fn parse_version(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("version:") {
            let parts: Vec<&str> = trimmed.split(':').collect();
            if parts.len() >= 2 {
                return Some(parts[1].trim().trim_matches('"').trim_matches('\'').to_string());
            }
        }
    }
    None
}

fn is_version_newer(new_ver: &str, old_ver: &str) -> bool {
    let parse_v = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };
    let v1 = parse_v(new_ver);
    let v2 = parse_v(old_ver);
    v1 > v2
}

pub fn inject_loom_skills() -> Result<usize, String> {
    let dirs = get_skill_target_dirs();
    let mut injected_count = 0;

    for dir in dirs {
        if let Err(e) = fs::create_dir_all(&dir) {
            eprintln!("[SkillInjector] Failed to create dir {:?}: {}", dir, e);
            continue;
        }

        let file_path = dir.join("SKILL.md");
        let should_write = if file_path.exists() {
            match fs::read_to_string(&file_path) {
                Ok(existing_content) => {
                    if existing_content.contains("user-override: true") {
                        false
                    } else if let Some(existing_ver) = parse_version(&existing_content) {
                        is_version_newer(LOOM_SKILL_VERSION, &existing_ver)
                    } else {
                        true
                    }
                }
                Err(_) => true,
            }
        } else {
            true
        };

        if should_write {
            let content = get_loom_skill_content();
            if let Err(e) = fs::write(&file_path, content) {
                eprintln!("[SkillInjector] Failed to write skill to {:?}: {}", file_path, e);
            } else {
                injected_count += 1;
                println!("[SkillInjector] Successfully injected Loom Skill to {:?}", file_path);
            }
        }
    }

    Ok(injected_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_parse() {
        let content = "---\nname: loom\nversion: 0.1.0\n---";
        assert_eq!(parse_version(content), Some("0.1.0".to_string()));
    }

    #[test]
    fn test_is_version_newer() {
        assert!(is_version_newer("0.2.0", "0.1.0"));
        assert!(is_version_newer("0.1.1", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.1.0"));
        assert!(!is_version_newer("0.1.0", "0.2.0"));
    }
}
