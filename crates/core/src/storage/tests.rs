use super::manager::{load_config, save_config};
use super::models::{AppConfig, CliTool, Category, Template};
use super::error::StorageError;
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
    let temp_config_path = temp_dir.path().join("climaster.json");
    
    std::env::set_var("CLIMASTER_CONFIG_PATH", &temp_config_path);
    
    // Run the test
    f(&temp_config_path);
    
    // Clean up
    std::env::remove_var("CLIMASTER_CONFIG_PATH");
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
        let parsed: serde_json::Value = serde_json::from_str(&file_content).expect("written config is not valid JSON");
        
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
            StorageError::SerializationError(_) => {}, // expected
            other => panic!("expected StorageError::SerializationError error, got: {:?}", other),
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
        
        // Default theme should be "dark"
        let default_theme = get_theme().expect("Failed to get default theme");
        assert_eq!(default_theme, "dark");
        
        // Set and get theme
        set_theme("day".to_string()).expect("Failed to set theme");
        let updated_theme = get_theme().expect("Failed to get updated theme");
        assert_eq!(updated_theme, "day");
    });
}

