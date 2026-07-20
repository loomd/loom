use super::error::StorageError;
use super::manager::{load_config, save_config};
use super::models::{AppConfig, Category, CliTool, Template};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

static TEST_MUTEX: Mutex<()> = Mutex::new(());

fn run_test_with_temp_config<F>(f: F)
where
    F: FnOnce(&Path),
{
    let _lock = TEST_MUTEX.lock().unwrap();

    let temp_dir = tempfile::tempdir().expect("Failed to create temp directory");
    let temp_config_path = temp_dir.path().join("loom.json");

    std::env::set_var("LOOM_CONFIG_PATH", &temp_config_path);

    // Run the test
    f(&temp_config_path);

    // Clean up
    std::env::remove_var("LOOM_CONFIG_PATH");
}

#[test]
fn test_serialization_fidelity() {
    let mut custom_env = HashMap::new();
    custom_env.insert("GIT_DIR".to_string(), ".git".to_string());

    let tool_uuid = "753b8118-2041-4770-b74c-47dbdf0e806c".to_string();
    let tool = CliTool {
        id: tool_uuid.clone(),
        name: "git".to_string(),
        path: PathBuf::from("/usr/bin/git"),
        version: "2.40.1".to_string(),
        category_id: Some("category-dev".to_string()),
        custom_env,
        custom_args: Vec::new(),
        is_agent: false,
    };

    let category = Category {
        id: "category-dev".to_string(),
        name: "Development".to_string(),
        description: "Tools for software development".to_string(),
    };

    let mut template_env = HashMap::new();
    template_env.insert("GIT_PAGER".to_string(), "cat".to_string());

    let template = Template {
        id: "template-git-status".to_string(),
        cli_id: tool_uuid,
        name: "git status".to_string(),
        args: vec!["status".to_string(), "-sb".to_string()],
        env: template_env,
        env_var_ids: Vec::new(),
        pwd: Some(PathBuf::from("/projects/my-app")),
        last_run: Some("1687258210".to_string()),
        cmd_override: None,
        env_mode: None,
    };

let original = AppConfig {
		cli_tools: vec![tool],
		categories: vec![category],
		templates: vec![template],
		env_vars: Vec::new(),
		language: "zh".to_string(),
		theme: "dark".to_string(),
		font_family: "Plus Jakarta Sans".to_string(),
		font_size: "14px".to_string(),
		project_column_align: "top".to_string(),
		projects: Vec::new(),
		agent_instances: Vec::new(),
		global_skills: Vec::new(),
		global_docs: Vec::new(),
		autostart: false,
		skipped_version: None,
		update_check_interval: String::new(),
		has_onboarded: false,
		agent_skill_map: HashMap::new(),
		floating_sidebar_enabled: true,
		floating_sidebar_position: "right".to_string(),
	};

    // Serialize
    let serialized = serde_json::to_string_pretty(&original).expect("Failed to serialize");

    // Deserialize
    let deserialized: AppConfig = serde_json::from_str(&serialized).expect("Failed to deserialize");

    // Equality verification
    assert_eq!(original, deserialized);
}

#[test]
fn test_default_initialization() {
    run_test_with_temp_config(|config_path| {
        assert!(!config_path.exists());

        let loaded = load_config().expect("failed to load config");
        assert_eq!(loaded, AppConfig::default());

        assert!(config_path.exists());
        let file_content = fs::read_to_string(config_path).expect("failed to read written config");
        let parsed: serde_json::Value =
            serde_json::from_str(&file_content).expect("written config is not valid JSON");

        // Verify it has empty lists
        assert_eq!(parsed["cli_tools"], serde_json::json!([]));
        assert_eq!(parsed["categories"], serde_json::json!([]));
        assert_eq!(parsed["templates"], serde_json::json!([]));
    });
}

#[test]
fn test_atomic_save_load_roundtrip() {
    run_test_with_temp_config(|_config_path| {
        let mut config = load_config().expect("failed to load config");

        // Modify configuration
        let new_tool = CliTool {
            id: Uuid::new_v4().to_string(),
            name: "test-tool".to_string(),
            path: PathBuf::from("/path/to/tool"),
            version: "1.0.0".to_string(),
            category_id: None,
            custom_env: HashMap::new(),
            custom_args: Vec::new(),
            is_agent: false,
        };
        config.cli_tools.push(new_tool);

        save_config(&config).expect("failed to save config");

        let loaded = load_config().expect("failed to reload config");
        assert_eq!(loaded, config);
    });
}

#[test]
fn test_malformed_json_error() {
    run_test_with_temp_config(|config_path| {
        fs::write(config_path, "invalid json { [").expect("failed to write malformed json");

        let result = load_config();
        assert!(result.is_err());
        match result.unwrap_err() {
            StorageError::SerializationError(_) => {} // expected
            other => panic!(
                "expected StorageError::SerializationError error, got: {:?}",
                other
            ),
        }
    });
}

#[test]
fn test_crash_safety_on_failed_write() {
    run_test_with_temp_config(|config_path| {
        // 1. Save a valid configuration first
        let mut original_config = AppConfig::default();
        original_config.cli_tools.push(CliTool {
            id: Uuid::new_v4().to_string(),
            name: "original-tool".to_string(),
            path: PathBuf::from("/path/to/original"),
            version: "1.0.0".to_string(),
            category_id: None,
            custom_env: HashMap::new(),
            custom_args: Vec::new(),
            is_agent: false,
        });
        save_config(&original_config).expect("failed to save original config");

        // 2. Create a directory where the temp file path is expected.
        // This will cause fs::File::create(temp_path) to fail because
        // a directory exists at that path.
        let temp_path = config_path.with_extension("tmp");
        fs::create_dir(&temp_path).expect("failed to create dummy temp dir");

        // 3. Attempt to save a modified configuration
        let mut modified_config = original_config.clone();
        modified_config.cli_tools[0].name = "modified-tool".to_string();

        let save_result = save_config(&modified_config);
        assert!(save_result.is_err());

        // 4. Verify that the original config remains intact
        let loaded_config = load_config().expect("failed to load config");
        assert_eq!(loaded_config, original_config);

        // Cleanup the directory so temp_dir deletion works cleanly
        let _ = fs::remove_dir(&temp_path);
    });
}

#[test]
fn test_get_set_theme() {
    run_test_with_temp_config(|_config_path| {
        use super::manager::{get_theme, set_theme};

        // Default theme should be "gray"
        let default_theme = get_theme().expect("Failed to get default theme");
        assert_eq!(default_theme, "gray");

        // Set and get theme
        set_theme("day".to_string()).expect("Failed to set theme");
        let updated_theme = get_theme().expect("Failed to get updated theme");
        assert_eq!(updated_theme, "day");
    });
}

#[test]
fn test_get_set_skipped_version() {
    run_test_with_temp_config(|_config_path| {
        use super::manager::{get_skipped_version, set_skipped_version};

        // Default should be None
        let default_version = get_skipped_version().expect("Failed to get default skipped version");
        assert_eq!(default_version, None);

        // Set a skipped version
        set_skipped_version(Some("0.2.1".to_string()))
            .expect("Failed to set skipped version");
        let updated = get_skipped_version().expect("Failed to get updated skipped version");
        assert_eq!(updated, Some("0.2.1".to_string()));

        // Clear by setting None
        set_skipped_version(None).expect("Failed to clear skipped version");
        let cleared = get_skipped_version().expect("Failed to get cleared skipped version");
        assert_eq!(cleared, None);
    });
}

#[test]
fn test_skipped_version_persistence() {
    run_test_with_temp_config(|_config_path| {
        use super::manager::{get_skipped_version, set_skipped_version};

        // Set version
        set_skipped_version(Some("1.0.0-rc.3".to_string()))
            .expect("Failed to set skipped version");

        // Read directly from config to verify persistence
        let config = load_config().expect("Failed to load config");
        assert_eq!(config.skipped_version, Some("1.0.0-rc.3".to_string()));

        // Reload via getter (simulates fresh load)
        let reloaded = get_skipped_version().expect("Failed to reload skipped version");
        assert_eq!(reloaded, Some("1.0.0-rc.3".to_string()));
    });
}


#[test]
fn test_project_crud() {
    run_test_with_temp_config(|_config_path| {
        use super::manager::{create_project, delete_project, get_project_agents, get_projects};

        let initial_projects = get_projects().expect("Failed to get initial projects");
        assert_eq!(initial_projects.len(), 0);

        let current_dir = std::env::current_dir().expect("Failed to get current dir");
        let current_dir_str = current_dir.to_string_lossy().to_string();

        let new_proj = create_project("Loom Test".to_string(), current_dir_str.clone())
            .expect("Failed to create project");
        assert_eq!(new_proj.name, "Loom Test");
        assert_eq!(new_proj.root_path, current_dir);

        let projects_list = get_projects().expect("Failed to list projects");
        assert_eq!(projects_list.len(), 1);
        assert_eq!(projects_list[0].id, new_proj.id);

        let agents = get_project_agents(new_proj.id.clone()).expect("Failed to get agents");
        assert_eq!(agents.len(), 0);

        delete_project(new_proj.id.clone()).expect("Failed to delete project");
        let final_projects = get_projects().expect("Failed to list final projects");
        assert_eq!(final_projects.len(), 0);
    });
}

#[test]
fn test_project_reorder() {
    run_test_with_temp_config(|_config_path| {
        use super::manager::{create_project, get_projects, reorder_projects};

        let current_dir = std::env::current_dir().expect("Failed to get current dir");
        let current_dir_str = current_dir.to_string_lossy().to_string();

        let p1 = create_project("Proj 1".to_string(), current_dir_str.clone()).unwrap();
        let p2 = create_project("Proj 2".to_string(), current_dir_str.clone()).unwrap();
        let p3 = create_project("Proj 3".to_string(), current_dir_str.clone()).unwrap();

        let list = get_projects().unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].id, p1.id);
        assert_eq!(list[1].id, p2.id);
        assert_eq!(list[2].id, p3.id);

        // Reorder to: p2, p3, p1
        reorder_projects(vec![p2.id.clone(), p3.id.clone(), p1.id.clone()]).unwrap();

        let reordered_list = get_projects().unwrap();
        assert_eq!(reordered_list.len(), 3);
        assert_eq!(reordered_list[0].id, p2.id);
        assert_eq!(reordered_list[1].id, p3.id);
        assert_eq!(reordered_list[2].id, p1.id);

        // Reorder with a subset, ensuring the omitted one (p3) is appended to the end
        reorder_projects(vec![p1.id.clone(), p2.id.clone()]).unwrap();

        let final_list = get_projects().unwrap();
        assert_eq!(final_list.len(), 3);
        assert_eq!(final_list[0].id, p1.id);
        assert_eq!(final_list[1].id, p2.id);
        assert_eq!(final_list[2].id, p3.id);
    });
}

#[test]
fn test_cli_tools_reorder() {
    run_test_with_temp_config(|config_path| {
        use super::manager::{get_cli_tools, import_cli_tool, reorder_cli_tools};

        let temp_dir_path = config_path.parent().unwrap();
        let ext = if cfg!(target_os = "windows") {
            ".exe"
        } else {
            ""
        };
        let path1 = temp_dir_path.join(format!("tool1{}", ext));
        let path2 = temp_dir_path.join(format!("tool2{}", ext));
        let path3 = temp_dir_path.join(format!("tool3{}", ext));

        std::fs::write(&path1, "").unwrap();
        std::fs::write(&path2, "").unwrap();
        std::fs::write(&path3, "").unwrap();

        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            for p in &[&path1, &path2, &path3] {
                let mut perms = std::fs::metadata(p).unwrap().permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(p, perms).unwrap();
            }
        }

        let t1 = import_cli_tool(path1.to_string_lossy().to_string()).unwrap();
        let t2 = import_cli_tool(path2.to_string_lossy().to_string()).unwrap();
        let t3 = import_cli_tool(path3.to_string_lossy().to_string()).unwrap();

        let list = get_cli_tools().unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].id, t1.id);
        assert_eq!(list[1].id, t2.id);
        assert_eq!(list[2].id, t3.id);

        // Reorder to: t2, t3, t1
        reorder_cli_tools(vec![t2.id.clone(), t3.id.clone(), t1.id.clone()]).unwrap();

        let reordered = get_cli_tools().unwrap();
        assert_eq!(reordered.len(), 3);
        assert_eq!(reordered[0].id, t2.id);
        assert_eq!(reordered[1].id, t3.id);
        assert_eq!(reordered[2].id, t1.id);

        // Reorder with subset: t1, t2 -> t3 appended at end
        reorder_cli_tools(vec![t1.id.clone(), t2.id.clone()]).unwrap();

        let final_list = get_cli_tools().unwrap();
        assert_eq!(final_list.len(), 3);
        assert_eq!(final_list[0].id, t1.id);
        assert_eq!(final_list[1].id, t2.id);
        assert_eq!(final_list[2].id, t3.id);
    });
}
