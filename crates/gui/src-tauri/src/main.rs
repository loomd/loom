#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use loom_core::storage::{self as cstore, AgentDoc, AgentInstance, Category, CliTool, GlobalDocTemplate, GlobalEnvVar, GlobalSkillTemplate, Project, ProjectSkill, Template};
use std::collections::HashMap;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[tauri::command]
fn update_ime_position(
    _window: tauri::Window,
    _x: f64,
    _y: f64,
    _cursor_x: i32,
    _cursor_y: i32,
    _cell_w: f64,
    _cell_h: f64,
    _is_cursor_hidden: bool,
) {
    // Stub implementation: positioning is now handled natively by WebView2
    // using unclipped, sized CSS overrides on the textarea during composition.
}

#[tauri::command]
fn get_cli_tools() -> Result<Vec<CliTool>, String> {
    cstore::get_cli_tools().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_categories() -> Result<Vec<Category>, String> {
    cstore::get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_cli_tool(path: String) -> Result<CliTool, String> {
    cstore::import_cli_tool(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_path_env() -> Result<Vec<CliTool>, String> {
    cstore::scan_path_env().map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<CliTool>, String> {
    cstore::scan_directory(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_category(name: String, desc: String) -> Result<Category, String> {
    cstore::create_category(name, desc).map_err(|e| e.to_string())
}

#[tauri::command]
fn assign_cli_category(cli_id: String, cat_id: Option<String>) -> Result<(), String> {
    cstore::assign_cli_category(cli_id, cat_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_cli_env(cli_id: String, env: HashMap<String, String>) -> Result<(), String> {
    cstore::update_cli_env(cli_id, env).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_cli_args(cli_id: String, args: Vec<String>) -> Result<(), String> {
    cstore::update_cli_args(cli_id, args).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_template(
    cli_id: String,
    name: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_var_ids: Vec<String>,
    pwd: Option<String>,
    cmd_override: Option<String>,
    env_mode: Option<String>,
) -> Result<Template, String> {
    cstore::create_template(
        cli_id,
        name,
        args,
        env,
        env_var_ids,
        pwd,
        cmd_override,
        env_mode,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_templates() -> Result<Vec<Template>, String> {
    cstore::get_templates().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_template(template_id: String) -> Result<(), String> {
    cstore::delete_template(template_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_template(
    template_id: String,
    name: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    env_var_ids: Vec<String>,
    pwd: Option<String>,
    cmd_override: Option<String>,
    env_mode: Option<String>,
) -> Result<Template, String> {
    cstore::update_template(
        template_id,
        name,
        args,
        env,
        env_var_ids,
        pwd,
        cmd_override,
        env_mode,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_global_env_vars() -> Result<Vec<GlobalEnvVar>, String> {
    cstore::get_global_env_vars().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_global_env_var(
    key: String,
    value: String,
    description: String,
) -> Result<GlobalEnvVar, String> {
    cstore::create_global_env_var(key, value, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_global_env_var(
    id: String,
    key: String,
    value: String,
    description: String,
) -> Result<GlobalEnvVar, String> {
    cstore::update_global_env_var(id, key, value, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_global_env_var(id: String) -> Result<(), String> {
    cstore::delete_global_env_var(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_cli_tool(cli_id: String) -> Result<(), String> {
    cstore::delete_cli_tool(cli_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_category(cat_id: String) -> Result<(), String> {
    cstore::delete_category(cat_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_cli_template(app_handle: tauri::AppHandle, template_id: String) -> Result<String, String> {
    use tauri::Emitter;
    let on_event = std::sync::Arc::new(move |event_name: String, payload: serde_json::Value| {
        let _ = app_handle.emit(&event_name, payload);
    });
    cstore::run_cli_template(template_id, Some(on_event)).map_err(|e| e.to_string())
}

#[tauri::command]
fn kill_cli_instance(instance_id: String) -> Result<(), String> {
    cstore::kill_cli_instance(instance_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_language() -> Result<String, String> {
    cstore::get_language().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_language(lang: String) -> Result<(), String> {
    cstore::set_language(lang).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_theme() -> Result<String, String> {
    cstore::get_theme().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_theme(theme: String) -> Result<(), String> {
    cstore::set_theme(theme).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    let autostart_manager = app.autolaunch();
    autostart_manager
        .is_enabled()
        .map_err(|e: tauri_plugin_autostart::Error| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autostart_manager = app.autolaunch();
    if enabled {
        autostart_manager
            .enable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())?;
    } else {
        autostart_manager
            .disable()
            .map_err(|e: tauri_plugin_autostart::Error| e.to_string())?;
    }
    cstore::set_autostart_enabled(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_category(cat_id: String, name: String, desc: String) -> Result<Category, String> {
    cstore::update_category(cat_id, name, desc).map_err(|e| e.to_string())
}

#[tauri::command]
fn smart_classify() -> Result<(usize, usize), String> {
    cstore::smart_classify().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_font_family() -> Result<String, String> {
    cstore::get_font_family().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_font_family(font: String) -> Result<(), String> {
    cstore::set_font_family(font).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_font_size() -> Result<String, String> {
    cstore::get_font_size().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_font_size(size: String) -> Result<(), String> {
    cstore::set_font_size(size).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_projects() -> Result<Vec<Project>, String> {
    cstore::get_projects().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(name: String, root_path: String) -> Result<Project, String> {
    cstore::create_project(name, root_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(id: String) -> Result<(), String> {
    cstore::delete_project(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_projects(ids: Vec<String>) -> Result<(), String> {
    cstore::reorder_projects(ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_templates(ids: Vec<String>) -> Result<(), String> {
    cstore::reorder_templates(ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_cli_tools(ids: Vec<String>) -> Result<(), String> {
    cstore::reorder_cli_tools(ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_project_agents(project_id: String) -> Result<Vec<AgentInstance>, String> {
    cstore::get_project_agents(project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_agent_logs(instance_id: String) -> Result<Vec<String>, String> {
    cstore::read_agent_logs(instance_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn spawn_project_agent(
    app_handle: tauri::AppHandle,
    project_id: String,
    command: String,
    args: Vec<String>,
    env_mode: String,
    custom_envs: HashMap<String, String>,
    pwd: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;
    let on_event = std::sync::Arc::new(move |event_name: String, payload: serde_json::Value| {
        let _ = app_handle.emit(&event_name, payload);
    });
    cstore::spawn_project_agent(
        project_id,
        command,
        args,
        env_mode,
        custom_envs,
        pwd,
        Some(on_event),
    )
    .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
mod win_util {
    use std::ffi::c_void;

    struct EnumData {
        pid: u32,
        hwnd: Option<*mut c_void>,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowThreadProcessId(hwnd: *mut c_void, lpdwProcessId: *mut u32) -> u32;
        fn EnumWindows(
            lpEnumFunc: unsafe extern "system" fn(*mut c_void, isize) -> i32,
            lParam: isize,
        ) -> i32;
        fn SetForegroundWindow(hwnd: *mut c_void) -> i32;
        fn ShowWindow(hwnd: *mut c_void, nCmdShow: i32) -> i32;
        fn IsIconic(hwnd: *mut c_void) -> i32;
        fn IsWindowVisible(hwnd: *mut c_void) -> i32;
        fn GetWindow(hwnd: *mut c_void, uCmd: u32) -> *mut c_void;
        fn BringWindowToTop(hwnd: *mut c_void) -> i32;
    }

    #[allow(non_snake_case)]
    unsafe extern "system" fn enum_windows_callback_strict(
        hwnd: *mut c_void,
        lParam: isize,
    ) -> i32 {
        let data = &mut *(lParam as *mut EnumData);
        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }
        if process_id == data.pid {
            let has_no_owner = unsafe { GetWindow(hwnd, 4).is_null() }; // GW_OWNER = 4
            let is_visible_or_iconic = unsafe { IsWindowVisible(hwnd) != 0 || IsIconic(hwnd) != 0 };
            if has_no_owner && is_visible_or_iconic {
                data.hwnd = Some(hwnd);
                return 0; // stop enumeration
            }
        }
        1 // continue enumeration
    }

    #[allow(non_snake_case)]
    unsafe extern "system" fn enum_windows_callback_fallback(
        hwnd: *mut c_void,
        lParam: isize,
    ) -> i32 {
        let data = &mut *(lParam as *mut EnumData);
        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut process_id);
        }
        if process_id == data.pid {
            if data.hwnd.is_none() || unsafe { IsWindowVisible(hwnd) != 0 } {
                data.hwnd = Some(hwnd);
            }
            if unsafe { IsWindowVisible(hwnd) != 0 } {
                return 0; // stop enumeration
            }
        }
        1 // continue enumeration
    }

    pub fn bring_pid_to_foreground(pid: u32) -> bool {
        let mut data = EnumData { pid, hwnd: None };
        unsafe {
            // First try strict check to get the main window
            EnumWindows(
                enum_windows_callback_strict,
                &mut data as *mut EnumData as isize,
            );

            // If not found, try fallback check
            if data.hwnd.is_none() {
                EnumWindows(
                    enum_windows_callback_fallback,
                    &mut data as *mut EnumData as isize,
                );
            }

            if let Some(hwnd) = data.hwnd {
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, 9); // SW_RESTORE = 9
                } else {
                    ShowWindow(hwnd, 5); // SW_SHOW = 5
                }
                BringWindowToTop(hwnd);
                SetForegroundWindow(hwnd);
                true
            } else {
                false
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod win_util {
    pub fn bring_pid_to_foreground(_pid: u32) -> bool {
        false
    }
}

#[tauri::command]
fn kill_agent_process(instance_id: String) -> Result<(), String> {
    cstore::kill_cli_instance(instance_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn bring_agent_to_foreground(instance_id: String) -> Result<bool, String> {
    // 1. Try to get pid from in-memory running child handle
    let pid_opt = {
        let active = cstore::get_active_instances().lock().unwrap();
        if let Some(child_arc) = active.get(&instance_id) {
            if let Ok(guard) = child_arc.lock() {
                Some(guard.id())
            } else {
                None
            }
        } else {
            None
        }
    };

    // 2. If not found in memory, look up the active instances list from JSON
    let pid = pid_opt.or_else(|| {
        let list = cstore::get_active_instances_list();
        list.iter()
            .find(|x| x.instance_id == instance_id)
            .map(|x| x.pid)
    });

    if let Some(pid) = pid {
        let success = win_util::bring_pid_to_foreground(pid);
        Ok(success)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string());
    Ok(result)
}

#[derive(serde::Serialize)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
fn list_project_files(dir_path: String) -> Result<Vec<FileEntry>, String> {
    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let entries =
        std::fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut file_entries = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let file_path = entry.path();
            let name = file_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if name.is_empty() || name == "." || name == ".." {
                continue;
            }

            let is_dir = file_path.is_dir();
            let size = if is_dir {
                0
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };

            file_entries.push(FileEntry {
                name,
                path: file_path.to_string_lossy().to_string(),
                is_dir,
                size,
            });
        }
    }

    file_entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(file_entries)
}

#[tauri::command]
fn open_file_with_system(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File/Folder does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    let res = std::process::Command::new("cmd")
        .args(&["/C", "start", "", &file_path])
        .status();

    #[cfg(target_os = "macos")]
    let res = std::process::Command::new("open").arg(&file_path).status();

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let res = std::process::Command::new("xdg-open")
        .arg(&file_path)
        .status();

    match res {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("Command exited with status: {}", status)),
        Err(e) => Err(format!("Failed to run command: {}", e)),
    }
}

#[tauri::command]
fn open_in_manager(item_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&item_path);
    if !path.exists() {
        return Err("Item does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let win_path = item_path.replace("/", "\\");
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", win_path))
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(&["-R", &item_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("xdg-open")
                .arg(path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn read_text_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file_entry(file_path: String, is_dir: bool) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    if is_dir {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_project_skills(project_id: String) -> Result<Vec<ProjectSkill>, String> {
    cstore::get_project_skills(project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_project_skill(
    project_id: String,
    skill_name: String,
    enabled: bool,
) -> Result<(), String> {
    cstore::toggle_project_skill(project_id, skill_name, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_project_agent_docs(project_id: String) -> Result<Vec<AgentDoc>, String> {
    cstore::scan_project_agent_docs(project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project_agent_doc(
    project_id: String,
    relative_path: String,
    doc_type: String,
) -> Result<AgentDoc, String> {
    cstore::create_project_agent_doc(project_id, relative_path, doc_type).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_global_skills() -> Result<Vec<GlobalSkillTemplate>, String> {
    cstore::get_global_skills().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_global_skill(
    name: String,
    description: String,
    content: String,
    files: HashMap<String, String>,
) -> Result<GlobalSkillTemplate, String> {
    cstore::create_global_skill(name, description, content, files).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_global_skill(
    id: String,
    name: String,
    description: String,
    content: String,
    files: HashMap<String, String>,
) -> Result<GlobalSkillTemplate, String> {
    cstore::update_global_skill(id, name, description, content, files).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_global_skill(id: String) -> Result<(), String> {
    cstore::delete_global_skill(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_global_docs() -> Result<Vec<GlobalDocTemplate>, String> {
    cstore::get_global_docs().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_global_doc(
    alias: String,
    default_filename: String,
    content: String,
) -> Result<GlobalDocTemplate, String> {
    cstore::create_global_doc(alias, default_filename, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_global_doc(
    id: String,
    alias: String,
    default_filename: String,
    content: String,
) -> Result<GlobalDocTemplate, String> {
    cstore::update_global_doc(id, alias, default_filename, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_global_doc(id: String) -> Result<(), String> {
    cstore::delete_global_doc(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_global_skill_to_project(project_id: String, skill_id: String) -> Result<(), String> {
    cstore::import_global_skill_to_project(project_id, skill_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_global_doc_to_project(
    project_id: String,
    doc_id: String,
    relative_path: String,
) -> Result<AgentDoc, String> {
    cstore::import_global_doc_to_project(project_id, doc_id, relative_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn parse_local_skill_dir(path: String) -> Result<GlobalSkillTemplate, String> {
    let dir_path = std::path::Path::new(&path);
    cstore::parse_local_skill_dir(dir_path).map_err(|e| e.to_string())
}

fn execute_test_command(cmd: &str, args_json: &str) -> Result<String, String> {
    let args: serde_json::Value = serde_json::from_str(args_json)
        .map_err(|e| format!("Failed to parse TAURI_TEST_ARGS: {}", e))?;

    match cmd {
        "get_cli_tools" => {
            let res = get_cli_tools()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "import_cli_tool" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| "Missing argument 'path'".to_string())?;
            let res = import_cli_tool(path.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "scan_path_env" => {
            let res = scan_path_env()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "scan_directory" => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| "Missing argument 'path'".to_string())?;
            let res = scan_directory(path.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "create_category" => {
            let name = args["name"]
                .as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let desc = args["desc"].as_str().unwrap_or("");
            let res = create_category(name.to_string(), desc.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "assign_cli_category" => {
            let cli_id = args["cli_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let cat_id = args["cat_id"].as_str().map(|s| s.to_string());
            assign_cli_category(cli_id.to_string(), cat_id)?;
            Ok("null".to_string())
        }
        "update_cli_env" => {
            let cli_id = args["cli_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let env_obj = args["env"]
                .as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v
                    .as_str()
                    .ok_or_else(|| "Env value must be a string".to_string())?;
                env.insert(k.clone(), v_str.to_string());
            }
            update_cli_env(cli_id.to_string(), env)?;
            Ok("null".to_string())
        }
        "create_template" => {
            let cli_id = args["cli_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let name = args["name"]
                .as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let args_arr = args["args"]
                .as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(
                    a.as_str()
                        .ok_or_else(|| "Arg must be a string".to_string())?
                        .to_string(),
                );
            }
            let env_obj = args["env"]
                .as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v
                    .as_str()
                    .ok_or_else(|| "Env value must be a string".to_string())?;
                env.insert(k.clone(), v_str.to_string());
            }
            let mut env_var_ids = Vec::new();
            if let Some(arr) = args.get("env_var_ids").and_then(|a| a.as_array()) {
                for id in arr {
                    if let Some(s) = id.as_str() {
                        env_var_ids.push(s.to_string());
                    }
                }
            }
            let pwd = args["pwd"].as_str().map(|s| s.to_string());
            let cmd_override = args["cmd_override"].as_str().map(|s| s.to_string());
            let env_mode = args
                .get("env_mode")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let res = cstore::create_template(
                cli_id.to_string(),
                name.to_string(),
                cmd_args,
                env,
                env_var_ids,
                pwd,
                cmd_override,
                env_mode,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "get_templates" => {
            let res = get_templates()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_template" => {
            let template_id = args["template_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            delete_template(template_id.to_string())?;
            Ok("null".to_string())
        }
        "update_template" => {
            let template_id = args["template_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            let name = args["name"]
                .as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let args_arr = args["args"]
                .as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(
                    a.as_str()
                        .ok_or_else(|| "Arg must be a string".to_string())?
                        .to_string(),
                );
            }
            let env_obj = args["env"]
                .as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v
                    .as_str()
                    .ok_or_else(|| "Env value must be a string".to_string())?;
                env.insert(k.clone(), v_str.to_string());
            }
            let mut env_var_ids = Vec::new();
            if let Some(arr) = args.get("env_var_ids").and_then(|a| a.as_array()) {
                for id in arr {
                    if let Some(s) = id.as_str() {
                        env_var_ids.push(s.to_string());
                    }
                }
            }
            let pwd = args["pwd"].as_str().map(|s| s.to_string());
            let cmd_override = args["cmd_override"].as_str().map(|s| s.to_string());
            let env_mode = args
                .get("env_mode")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let res = cstore::update_template(
                template_id.to_string(),
                name.to_string(),
                cmd_args,
                env,
                env_var_ids,
                pwd,
                cmd_override,
                env_mode,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_cli_tool" => {
            let cli_id = args["cli_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            delete_cli_tool(cli_id.to_string())?;
            Ok("null".to_string())
        }
        "delete_category" => {
            let cat_id = args["cat_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cat_id'".to_string())?;
            delete_category(cat_id.to_string())?;
            Ok("null".to_string())
        }
        "run_cli_template" => {
            let template_id = args["template_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            let instance_id =
                cstore::run_cli_template(template_id.to_string(), None).map_err(|e| e.to_string())?;
            println!("INSTANCE_ID: {}", instance_id);

            let child_arc_opt = cstore::get_active_instances()
                .lock()
                .unwrap()
                .get(&instance_id)
                .cloned();
            if let Some(child_arc) = child_arc_opt {
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Ok(mut guard) = child_arc.lock() {
                        match guard.try_wait() {
                            Ok(Some(_status)) => break,
                            Ok(None) => {}
                            Err(_) => break,
                        }
                    } else {
                        break;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Ok("".to_string())
        }
        "kill_cli_instance" => {
            let instance_id = args["instance_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'instance_id'".to_string())?;
            kill_cli_instance(instance_id.to_string())?;
            Ok("null".to_string())
        }
        "get_language" => {
            let res = get_language()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_language" => {
            let lang = args["lang"]
                .as_str()
                .ok_or_else(|| "Missing argument 'lang'".to_string())?;
            set_language(lang.to_string())?;
            Ok("null".to_string())
        }
        "get_theme" => {
            let res = get_theme()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_theme" => {
            let theme = args["theme"]
                .as_str()
                .ok_or_else(|| "Missing argument 'theme'".to_string())?;
            set_theme(theme.to_string())?;
            Ok("null".to_string())
        }
        "update_category" => {
            let cat_id = args["cat_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cat_id'".to_string())?;
            let name = args["name"]
                .as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let desc = args["desc"].as_str().unwrap_or("");
            let res = update_category(cat_id.to_string(), name.to_string(), desc.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "smart_classify" => {
            let res = smart_classify()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "get_font_family" => {
            let res = get_font_family()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_font_family" => {
            let font = args["font"]
                .as_str()
                .ok_or_else(|| "Missing argument 'font'".to_string())?;
            set_font_family(font.to_string())?;
            Ok("null".to_string())
        }
        "get_font_size" => {
            let res = get_font_size()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_font_size" => {
            let size = args["size"]
                .as_str()
                .ok_or_else(|| "Missing argument 'size'".to_string())?;
            set_font_size(size.to_string())?;
            Ok("null".to_string())
        }
        "get_global_env_vars" => {
            let res = get_global_env_vars()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "create_global_env_var" => {
            let key = args["key"]
                .as_str()
                .ok_or_else(|| "Missing argument 'key'".to_string())?;
            let value = args["value"]
                .as_str()
                .ok_or_else(|| "Missing argument 'value'".to_string())?;
            let description = args["description"].as_str().unwrap_or("");
            let res =
                create_global_env_var(key.to_string(), value.to_string(), description.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "update_global_env_var" => {
            let id = args["id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'id'".to_string())?;
            let key = args["key"]
                .as_str()
                .ok_or_else(|| "Missing argument 'key'".to_string())?;
            let value = args["value"]
                .as_str()
                .ok_or_else(|| "Missing argument 'value'".to_string())?;
            let description = args["description"].as_str().unwrap_or("");
            let res = update_global_env_var(
                id.to_string(),
                key.to_string(),
                value.to_string(),
                description.to_string(),
            )?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_global_env_var" => {
            let id = args["id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'id'".to_string())?;
            delete_global_env_var(id.to_string())?;
            Ok("null".to_string())
        }
        "get_projects" => {
            let res = get_projects()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "create_project" => {
            let name = args["name"]
                .as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let root_path = args["root_path"]
                .as_str()
                .ok_or_else(|| "Missing argument 'root_path'".to_string())?;
            let res = create_project(name.to_string(), root_path.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_project" => {
            let id = args["id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'id'".to_string())?;
            delete_project(id.to_string())?;
            Ok("null".to_string())
        }
        "get_project_agents" => {
            let project_id = args["project_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'project_id'".to_string())?;
            let res = get_project_agents(project_id.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "spawn_project_agent" => {
            let project_id = args["project_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'project_id'".to_string())?;
            let command = args["command"]
                .as_str()
                .ok_or_else(|| "Missing argument 'command'".to_string())?;
            let args_arr = args["args"]
                .as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(
                    a.as_str()
                        .ok_or_else(|| "Arg must be a string".to_string())?
                        .to_string(),
                );
            }
            let env_mode = args["env_mode"].as_str().unwrap_or("inherit").to_string();
            let env_obj = args["custom_envs"].as_object();
            let mut custom_envs = HashMap::new();
            if let Some(obj) = env_obj {
                for (k, v) in obj {
                    let v_str = v
                        .as_str()
                        .ok_or_else(|| "Env value must be a string".to_string())?;
                    custom_envs.insert(k.clone(), v_str.to_string());
                }
            }
            let pwd = args
                .get("pwd")
                .and_then(|p| p.as_str())
                .map(|s| s.to_string());
            let instance_id = cstore::spawn_project_agent(
                project_id.to_string(),
                command.to_string(),
                cmd_args,
                env_mode,
                custom_envs,
                pwd,
                None,
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::json!(instance_id).to_string())
        }
        "kill_agent_process" => {
            let instance_id = args["instance_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'instance_id'".to_string())?;
            kill_agent_process(instance_id.to_string())?;
            Ok("null".to_string())
        }
        "bring_agent_to_foreground" => {
            let instance_id = args["instance_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'instance_id'".to_string())?;
            let res = bring_agent_to_foreground(instance_id.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "update_cli_args" => {
            let cli_id = args["cli_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let args_arr = args["args"]
                .as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(
                    a.as_str()
                        .ok_or_else(|| "Arg must be a string".to_string())?
                        .to_string(),
                );
            }
            update_cli_args(cli_id.to_string(), cmd_args)?;
            Ok("null".to_string())
        }
        "get_agent_logs" => {
            let instance_id = args["instance_id"]
                .as_str()
                .ok_or_else(|| "Missing argument 'instance_id'".to_string())?;
            let res = get_agent_logs(instance_id.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "select_directory" => {
            let path = args["path"].as_str().map(|s| s.to_string());
            serde_json::to_string(&path).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown command '{}'", cmd)),
    }
}

#[tauri::command]
fn log_frontend(level: String, message: String) {
    println!("[Frontend-{}] {}", level, message);
}

mod pty;

fn get_window_state_path() -> std::path::PathBuf {
    let mut path = cstore::get_config_path();
    path.pop();
    path.join("window_state.json")
}

fn save_window_state(window: &tauri::Window) {
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        #[derive(serde::Serialize)]
        struct WinState {
            x: i32,
            y: i32,
            width: u32,
            height: u32,
        }
        if let Ok(json) = serde_json::to_string_pretty(&WinState {
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
        }) {
            let _ = std::fs::write(get_window_state_path(), json);
        }
    }
}

#[tauri::command]
fn get_skipped_version() -> Result<Option<String>, String> {
    cstore::get_skipped_version().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_skipped_version(version: Option<String>) -> Result<(), String> {
    cstore::set_skipped_version(version).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_project_column_align() -> Result<String, String> {
    cstore::get_project_column_align().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_project_column_align(align: String) -> Result<(), String> {
    cstore::set_project_column_align(align).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_update_check_interval() -> Result<String, String> {
    cstore::get_update_check_interval().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_update_check_interval(interval: String) -> Result<(), String> {
    cstore::set_update_check_interval(interval).map_err(|e| e.to_string())
}

fn main() {
    #[cfg(target_os = "windows")]
    pty::init_process_session_job();

    if let Ok(cmd) = std::env::var("TAURI_TEST_CMD") {
        let args_json = std::env::var("TAURI_TEST_ARGS").unwrap_or_else(|_| "{}".to_string());
        let res = execute_test_command(&cmd, &args_json);
        match res {
            Ok(output) => {
                println!("{}", output);
                std::process::exit(0);
            }
            Err(err) => {
                eprintln!("{}", err);
                std::process::exit(1);
            }
        }
    }

    let builder = tauri::Builder::default().manage(pty::PtyState::default());

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let state_path = get_window_state_path();
                let has_state = state_path.exists()
                    && std::fs::read_to_string(&state_path)
                        .ok()
                        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
                        .is_some();
                if has_state {
                    let content = std::fs::read_to_string(&state_path).unwrap();
                    #[derive(serde::Deserialize)]
                    struct WinState {
                        x: i32,
                        y: i32,
                        width: u32,
                        height: u32,
                    }
                    if let Ok(state) = serde_json::from_str::<WinState>(&content) {
                        let _ =
                            window.set_size(tauri::PhysicalSize::new(state.width, state.height));
                        let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
                    }
                } else {
                    if let Some(monitor) = window.current_monitor().unwrap_or(None) {
                        let size = monitor.size();
                        let w = (size.width as f64 * 0.625) as u32;
                        let h = (size.height as f64 * 0.764) as u32;
                        let _ = window.set_size(tauri::PhysicalSize::new(w, h));
                    }
                    let _ = window.center();
                }
            }

            // Run process synchronization in a background thread to prevent blocking Tauri's main startup thread (which causes the white screen freeze).
            std::thread::spawn(|| {
                let _ = cstore::sync_running_processes();
            });

            // Restore autostart setting from config after version update
            // The OS registry entry may be cleared during app update, but our config preserves the user's preference.
            if let Ok(desired) = cstore::get_autostart_enabled() {
                if desired {
                    let autostart_manager = app.autolaunch();
                    let _ = autostart_manager.enable();
                }
            }

            let quit_item = MenuItemBuilder::with_id("quit", "Quit / 退出").build(app)?;
            let show_item =
                MenuItemBuilder::with_id("show", "Show Loom / 显示主窗口").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(
                    Image::from_bytes(include_bytes!("../icons/tray.png"))
                        .expect("Failed to load tray icon"),
                )
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                save_window_state(&window);
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                save_window_state(&window);
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            update_ime_position,
            get_cli_tools,
            get_categories,
            import_cli_tool,
            scan_path_env,
            scan_directory,
            create_category,
            assign_cli_category,
            update_cli_env,
            update_cli_args,
            create_template,
            get_templates,
            delete_template,
            update_template,
            delete_cli_tool,
            delete_category,
            run_cli_template,
            kill_cli_instance,
            get_language,
            set_language,
            get_theme,
            set_theme,
            open_url,
            get_autostart,
            set_autostart,
            get_global_env_vars,
            create_global_env_var,
            update_global_env_var,
            delete_global_env_var,
            update_category,
            smart_classify,
            get_font_family,
            set_font_family,
            get_font_size,
            set_font_size,
            log_frontend,
            get_projects,
            create_project,
            delete_project,
            reorder_projects,
            reorder_templates,
            reorder_cli_tools,
            get_project_agents,
            spawn_project_agent,
            get_agent_logs,
            kill_agent_process,
            bring_agent_to_foreground,
            select_directory,
            list_project_files,
            open_file_with_system,
            open_in_manager,
            read_text_file,
            write_text_file,
            delete_file_entry,
            get_project_skills,
            toggle_project_skill,
            scan_project_agent_docs,
            create_project_agent_doc,
            get_global_skills,
            create_global_skill,
            update_global_skill,
            delete_global_skill,
            get_global_docs,
            create_global_doc,
            update_global_doc,
            delete_global_doc,
            import_global_skill_to_project,
            import_global_doc_to_project,
            parse_local_skill_dir,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_history,
            pty::pty_close,
            get_skipped_version,
            set_skipped_version,
            get_project_column_align,
            set_project_column_align,
            get_update_check_interval,
            set_update_check_interval
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
