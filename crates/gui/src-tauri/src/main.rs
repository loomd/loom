#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use climaster_core::storage::{
    CliTool, Category, Template, GlobalEnvVar,
    get_cli_tools as core_get_cli_tools,
    get_categories as core_get_categories,
    import_cli_tool as core_import_cli_tool,
    scan_path_env as core_scan_path_env,
    scan_directory as core_scan_directory,
    create_category as core_create_category,
    assign_cli_category as core_assign_cli_category,
    update_cli_env as core_update_cli_env,
    create_template as core_create_template,
    get_templates as core_get_templates,
    delete_template as core_delete_template,
    update_template as core_update_template,
    delete_cli_tool as core_delete_cli_tool,
    delete_category as core_delete_category,
    run_cli_template as core_run_cli_template,
    kill_cli_instance as core_kill_cli_instance,
    get_active_instances as core_get_active_instances,
    get_language as core_get_language,
    set_language as core_set_language,
    get_theme as core_get_theme,
    set_theme as core_set_theme,
    get_global_env_vars as core_get_global_env_vars,
    create_global_env_var as core_create_global_env_var,
    update_global_env_var as core_update_global_env_var,
    delete_global_env_var as core_delete_global_env_var,
    update_category as core_update_category,
    smart_classify as core_smart_classify,
    get_font_family as core_get_font_family,
    set_font_family as core_set_font_family,
    get_font_size as core_get_font_size,
    set_font_size as core_set_font_size,
};

#[tauri::command]
fn get_cli_tools() -> Result<Vec<CliTool>, String> {
    core_get_cli_tools().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_categories() -> Result<Vec<Category>, String> {
    core_get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_cli_tool(path: String) -> Result<CliTool, String> {
    core_import_cli_tool(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_path_env() -> Result<Vec<CliTool>, String> {
    core_scan_path_env().map_err(|e| e.to_string())
}

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<CliTool>, String> {
    core_scan_directory(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_category(name: String, desc: String) -> Result<Category, String> {
    core_create_category(name, desc).map_err(|e| e.to_string())
}

#[tauri::command]
fn assign_cli_category(cli_id: String, cat_id: Option<String>) -> Result<(), String> {
    core_assign_cli_category(cli_id, cat_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_cli_env(cli_id: String, env: HashMap<String, String>) -> Result<(), String> {
    core_update_cli_env(cli_id, env).map_err(|e| e.to_string())
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
) -> Result<Template, String> {
    core_create_template(cli_id, name, args, env, env_var_ids, pwd, cmd_override).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_templates() -> Result<Vec<Template>, String> {
    core_get_templates().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_template(template_id: String) -> Result<(), String> {
    core_delete_template(template_id).map_err(|e| e.to_string())
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
) -> Result<Template, String> {
    core_update_template(template_id, name, args, env, env_var_ids, pwd, cmd_override).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_global_env_vars() -> Result<Vec<GlobalEnvVar>, String> {
    core_get_global_env_vars().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_global_env_var(key: String, value: String, description: String) -> Result<GlobalEnvVar, String> {
    core_create_global_env_var(key, value, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_global_env_var(id: String, key: String, value: String, description: String) -> Result<GlobalEnvVar, String> {
    core_update_global_env_var(id, key, value, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_global_env_var(id: String) -> Result<(), String> {
    core_delete_global_env_var(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_cli_tool(cli_id: String) -> Result<(), String> {
    core_delete_cli_tool(cli_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_category(cat_id: String) -> Result<(), String> {
    core_delete_category(cat_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_cli_template(app_handle: tauri::AppHandle, template_id: String) -> Result<String, String> {
    use tauri::Emitter;
    let on_event = std::sync::Arc::new(move |event_name: String, payload: serde_json::Value| {
        let _ = app_handle.emit(&event_name, payload);
    });
    core_run_cli_template(template_id, Some(on_event)).map_err(|e| e.to_string())
}

#[tauri::command]
fn kill_cli_instance(instance_id: String) -> Result<(), String> {
    core_kill_cli_instance(instance_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_language() -> Result<String, String> {
    core_get_language().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_language(lang: String) -> Result<(), String> {
    core_set_language(lang).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_theme() -> Result<String, String> {
    core_get_theme().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_theme(theme: String) -> Result<(), String> {
    core_set_theme(theme).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_category(cat_id: String, name: String, desc: String) -> Result<Category, String> {
    core_update_category(cat_id, name, desc).map_err(|e| e.to_string())
}

#[tauri::command]
fn smart_classify() -> Result<(usize, usize), String> {
    core_smart_classify().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_font_family() -> Result<String, String> {
    core_get_font_family().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_font_family(font: String) -> Result<(), String> {
    core_set_font_family(font).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_font_size() -> Result<String, String> {
    core_get_font_size().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_font_size(size: String) -> Result<(), String> {
    core_set_font_size(size).map_err(|e| e.to_string())
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
            let path = args["path"].as_str()
                .ok_or_else(|| "Missing argument 'path'".to_string())?;
            let res = import_cli_tool(path.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "scan_path_env" => {
            let res = scan_path_env()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "scan_directory" => {
            let path = args["path"].as_str()
                .ok_or_else(|| "Missing argument 'path'".to_string())?;
            let res = scan_directory(path.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "create_category" => {
            let name = args["name"].as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let desc = args["desc"].as_str().unwrap_or("");
            let res = create_category(name.to_string(), desc.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "assign_cli_category" => {
            let cli_id = args["cli_id"].as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let cat_id = args["cat_id"].as_str().map(|s| s.to_string());
            assign_cli_category(cli_id.to_string(), cat_id)?;
            Ok("null".to_string())
        }
        "update_cli_env" => {
            let cli_id = args["cli_id"].as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let env_obj = args["env"].as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v.as_str().ok_or_else(|| "Env value must be a string".to_string())?;
                env.insert(k.clone(), v_str.to_string());
            }
            update_cli_env(cli_id.to_string(), env)?;
            Ok("null".to_string())
        }
        "create_template" => {
            let cli_id = args["cli_id"].as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            let name = args["name"].as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let args_arr = args["args"].as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(a.as_str().ok_or_else(|| "Arg must be a string".to_string())?.to_string());
            }
            let env_obj = args["env"].as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v.as_str().ok_or_else(|| "Env value must be a string".to_string())?;
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
            let res = core_create_template(cli_id.to_string(), name.to_string(), cmd_args, env, env_var_ids, pwd, cmd_override).map_err(|e| e.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "get_templates" => {
            let res = get_templates()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_template" => {
            let template_id = args["template_id"].as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            delete_template(template_id.to_string())?;
            Ok("null".to_string())
        }
        "update_template" => {
            let template_id = args["template_id"].as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            let name = args["name"].as_str()
                .ok_or_else(|| "Missing argument 'name'".to_string())?;
            let args_arr = args["args"].as_array()
                .ok_or_else(|| "Missing or invalid argument 'args'".to_string())?;
            let mut cmd_args = Vec::new();
            for a in args_arr {
                cmd_args.push(a.as_str().ok_or_else(|| "Arg must be a string".to_string())?.to_string());
            }
            let env_obj = args["env"].as_object()
                .ok_or_else(|| "Missing or invalid argument 'env'".to_string())?;
            let mut env = HashMap::new();
            for (k, v) in env_obj {
                let v_str = v.as_str().ok_or_else(|| "Env value must be a string".to_string())?;
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
            let res = core_update_template(template_id.to_string(), name.to_string(), cmd_args, env, env_var_ids, pwd, cmd_override).map_err(|e| e.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_cli_tool" => {
            let cli_id = args["cli_id"].as_str()
                .ok_or_else(|| "Missing argument 'cli_id'".to_string())?;
            delete_cli_tool(cli_id.to_string())?;
            Ok("null".to_string())
        }
        "delete_category" => {
            let cat_id = args["cat_id"].as_str()
                .ok_or_else(|| "Missing argument 'cat_id'".to_string())?;
            delete_category(cat_id.to_string())?;
            Ok("null".to_string())
        }
        "run_cli_template" => {
            let template_id = args["template_id"].as_str()
                .ok_or_else(|| "Missing argument 'template_id'".to_string())?;
            let instance_id = core_run_cli_template(template_id.to_string(), None).map_err(|e| e.to_string())?;
            println!("INSTANCE_ID: {}", instance_id);

            let child_arc_opt = core_get_active_instances().lock().unwrap().get(&instance_id).cloned();
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
            let instance_id = args["instance_id"].as_str()
                .ok_or_else(|| "Missing argument 'instance_id'".to_string())?;
            kill_cli_instance(instance_id.to_string())?;
            Ok("null".to_string())
        }
        "get_language" => {
            let res = get_language()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_language" => {
            let lang = args["lang"].as_str()
                .ok_or_else(|| "Missing argument 'lang'".to_string())?;
            set_language(lang.to_string())?;
            Ok("null".to_string())
        }
        "get_theme" => {
            let res = get_theme()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_theme" => {
            let theme = args["theme"].as_str()
                .ok_or_else(|| "Missing argument 'theme'".to_string())?;
            set_theme(theme.to_string())?;
            Ok("null".to_string())
        }
        "update_category" => {
            let cat_id = args["cat_id"].as_str()
                .ok_or_else(|| "Missing argument 'cat_id'".to_string())?;
            let name = args["name"].as_str()
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
            let font = args["font"].as_str()
                .ok_or_else(|| "Missing argument 'font'".to_string())?;
            set_font_family(font.to_string())?;
            Ok("null".to_string())
        }
        "get_font_size" => {
            let res = get_font_size()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "set_font_size" => {
            let size = args["size"].as_str()
                .ok_or_else(|| "Missing argument 'size'".to_string())?;
            set_font_size(size.to_string())?;
            Ok("null".to_string())
        }
        "get_global_env_vars" => {
            let res = get_global_env_vars()?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "create_global_env_var" => {
            let key = args["key"].as_str()
                .ok_or_else(|| "Missing argument 'key'".to_string())?;
            let value = args["value"].as_str()
                .ok_or_else(|| "Missing argument 'value'".to_string())?;
            let description = args["description"].as_str().unwrap_or("");
            let res = create_global_env_var(key.to_string(), value.to_string(), description.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "update_global_env_var" => {
            let id = args["id"].as_str()
                .ok_or_else(|| "Missing argument 'id'".to_string())?;
            let key = args["key"].as_str()
                .ok_or_else(|| "Missing argument 'key'".to_string())?;
            let value = args["value"].as_str()
                .ok_or_else(|| "Missing argument 'value'".to_string())?;
            let description = args["description"].as_str().unwrap_or("");
            let res = update_global_env_var(id.to_string(), key.to_string(), value.to_string(), description.to_string())?;
            serde_json::to_string(&res).map_err(|e| e.to_string())
        }
        "delete_global_env_var" => {
            let id = args["id"].as_str()
                .ok_or_else(|| "Missing argument 'id'".to_string())?;
            delete_global_env_var(id.to_string())?;
            Ok("null".to_string())
        }
        _ => Err(format!("Unknown command '{}'", cmd)),
    }
}

#[tauri::command]
fn log_frontend(level: String, message: String) {
    println!("[Frontend-{}] {}", level, message);
}

fn main() {
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

    tauri::Builder::default()
        .setup(|app| {
            let quit_item = MenuItemBuilder::with_id("quit", "Quit / 退出").build(app)?;
            let show_item = MenuItemBuilder::with_id("show", "Show CliMaster / 显示主窗口").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

            let _tray = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png")).expect("Failed to load tray icon"))
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
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
                    }
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
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_cli_tools,
            get_categories,
            import_cli_tool,
            scan_path_env,
            scan_directory,
            create_category,
            assign_cli_category,
            update_cli_env,
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
            log_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
