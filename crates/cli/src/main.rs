use std::env;
use std::process;
use std::path::PathBuf;
use climaster_core::storage::{get_cli_tools, get_templates, get_global_env_vars};

fn print_help() {
    println!("climaster - CLI Tool Manager");
    println!("Usage:");
    println!("  climaster [options] <command> [args]");
    println!();
    println!("Options:");
    println!("  -h, --help      Show this help menu");
    println!("  -v, --version   Show version info");
    println!();
    println!("Commands:");
    println!("  list            List all registered CLI tools");
    println!("  search <query>  Search for registered CLI tools by query");
    println!();
    println!("You can also run a CLI tool or template directly by its command override:");
    println!("  climaster <override-name> [extra args...]");
}

fn print_version() {
    println!("climaster {}", env!("CARGO_PKG_VERSION"));
}

/// Try to run a command by looking up cmd_override in templates, or name in cli_tools.
/// Returns Ok(exit_code) if found and executed, or Err if not found.
fn try_run_override(subcmd: &str, extra_args: &[String]) -> Result<i32, String> {
    let tools = get_cli_tools().map_err(|e| e.to_string())?;
    let templates = get_templates().map_err(|e| e.to_string())?;
    let global_env_vars = get_global_env_vars().map_err(|e| e.to_string())?;

    // First: look for a template whose cmd_override matches
    if let Some(tpl) = templates.iter().find(|t| t.cmd_override.as_deref() == Some(subcmd)) {
        let tool = tools.iter().find(|t| t.id == tpl.cli_id)
            .ok_or_else(|| format!("CLI tool for template '{}' not found", tpl.name))?;

        let tool_path: PathBuf = tool.path.clone().into();
        let mut cmd = process::Command::new(&tool_path);

        // Add template args, then extra args passed on command line
        cmd.args(&tpl.args);
        cmd.args(extra_args);

        // Working directory
        if let Some(ref pwd) = tpl.pwd {
            let p: PathBuf = pwd.clone().into();
            if !p.as_os_str().is_empty() {
                cmd.current_dir(&p);
            }
        }

        // Env: first the tool's custom_env, then the global env, then the template's env (template wins)
        for (k, v) in &tool.custom_env {
            cmd.env(k, v);
        }
        for var_id in &tpl.env_var_ids {
            if let Some(global_var) = global_env_vars.iter().find(|ev| &ev.id == var_id) {
                cmd.env(&global_var.key, &global_var.value);
            }
        }
        for (k, v) in &tpl.env {
            cmd.env(k, v);
        }

        // Inherit stdin/stdout/stderr from the parent process
        cmd.stdin(process::Stdio::inherit());
        cmd.stdout(process::Stdio::inherit());
        cmd.stderr(process::Stdio::inherit());

        let status = cmd.status().map_err(|e| format!("Failed to execute '{}': {}", tool_path.display(), e))?;
        return Ok(status.code().unwrap_or(1));
    }

    // Second: look for a CLI tool whose name matches
    if let Some(tool) = tools.iter().find(|t| t.name == subcmd) {
        let tool_path: PathBuf = tool.path.clone().into();
        let mut cmd = process::Command::new(&tool_path);

        // Pass all extra args
        cmd.args(extra_args);

        // Inject the tool's custom env vars
        for (k, v) in &tool.custom_env {
            cmd.env(k, v);
        }

        cmd.stdin(process::Stdio::inherit());
        cmd.stdout(process::Stdio::inherit());
        cmd.stderr(process::Stdio::inherit());

        let status = cmd.status().map_err(|e| format!("Failed to execute '{}': {}", tool_path.display(), e))?;
        return Ok(status.code().unwrap_or(1));
    }

    Err(format!("Unknown command '{}'", subcmd))
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_help();
        process::exit(0);
    }

    let first_arg = &args[1];

    match first_arg.as_str() {
        "-h" | "--help" | "help" => {
            print_help();
            process::exit(0);
        }
        "-v" | "--version" | "version" => {
            print_version();
            process::exit(0);
        }
        "list" => {
            let mut format_json = false;
            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "--json" => {
                        format_json = true;
                        i += 1;
                    }
                    "--format" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --format requires a value");
                            process::exit(1);
                        }
                        let val = &args[i + 1];
                        if val == "json" {
                            format_json = true;
                        } else if val == "table" {
                            format_json = false;
                        } else {
                            eprintln!("Error: invalid format '{}'", val);
                            process::exit(1);
                        }
                        i += 2;
                    }
                    _ => {
                        eprintln!("Error: excessive or unknown argument '{}'", args[i]);
                        process::exit(1);
                    }
                }
            }

            let tools = match get_cli_tools() {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("Error loading configuration: {}", e);
                    process::exit(1);
                }
            };

            if format_json {
                let json_str = serde_json::to_string_pretty(&tools).unwrap();
                println!("{}", json_str);
            } else {
                println!("{:<20} {:<50} {:<10} {:<15}", "Name", "Path", "Version", "Category");
                println!("{}", "-".repeat(100));
                for t in tools {
                    let cat = t.category_id.unwrap_or_else(|| "None".to_string());
                    println!("{:<20} {:<50} {:<10} {:<15}", t.name, t.path.display(), t.version, cat);
                }
            }
        }
        "search" => {
            if args.len() < 3 {
                eprintln!("Error: search query is required");
                process::exit(1);
            }

            let query = &args[2];
            if query == "--json" || query.starts_with('-') {
                eprintln!("Error: search query is required");
                process::exit(1);
            }

            let mut format_json = false;
            if args.len() > 3 {
                if args[3] == "--json" {
                    format_json = true;
                } else {
                    eprintln!("Error: unknown argument '{}'", args[3]);
                    process::exit(1);
                }
            }

            let tools = match get_cli_tools() {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("Error loading configuration: {}", e);
                    process::exit(1);
                }
            };

            let query_lower = query.to_lowercase();
            let matches: Vec<_> = tools.into_iter()
                .filter(|t| t.name.to_lowercase().contains(&query_lower) || t.path.to_string_lossy().to_lowercase().contains(&query_lower))
                .collect();

            if format_json {
                let json_str = serde_json::to_string_pretty(&matches).unwrap();
                println!("{}", json_str);
            } else {
                println!("{:<20} {:<50} {:<10} {:<15}", "Name", "Path", "Version", "Category");
                println!("{}", "-".repeat(100));
                for t in matches {
                    let cat = t.category_id.unwrap_or_else(|| "None".to_string());
                    println!("{:<20} {:<50} {:<10} {:<15}", t.name, t.path.display(), t.version, cat);
                }
            }
        }
        "mock-run" => {
            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "--print-env" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --print-env requires a name");
                            process::exit(1);
                        }
                        let name = &args[i + 1];
                        let val = env::var(name).unwrap_or_else(|_| "".to_string());
                        println!("{}", val);
                        i += 2;
                    }
                    "--stdout" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --stdout requires text");
                            process::exit(1);
                        }
                        println!("{}", args[i + 1]);
                        i += 2;
                    }
                    "--stderr" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --stderr requires text");
                            process::exit(1);
                        }
                        eprintln!("{}", args[i + 1]);
                        i += 2;
                    }
                    "--stdout-loop" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --stdout-loop requires a count");
                            process::exit(1);
                        }
                        let count: usize = args[i + 1].parse().unwrap_or(0);
                        for line_num in 0..count {
                            println!("Line {}", line_num);
                            std::thread::sleep(std::time::Duration::from_millis(10));
                        }
                        i += 2;
                    }
                    "--sleep" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --sleep requires milliseconds");
                            process::exit(1);
                        }
                        let ms: u64 = args[i + 1].parse().unwrap_or(0);
                        std::thread::sleep(std::time::Duration::from_millis(ms));
                        i += 2;
                    }
                    "--exit" => {
                        if i + 1 >= args.len() {
                            eprintln!("Error: --exit requires a code");
                            process::exit(1);
                        }
                        let code: i32 = args[i + 1].parse().unwrap_or(0);
                        process::exit(code);
                    }
                    "--spawn-child" => {
                        let self_exe = env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("climaster"));
                        let mut cmd = process::Command::new(self_exe);
                        cmd.arg("mock-run");
                        for a in &args[i + 1..] {
                            cmd.arg(a);
                        }
                        let mut child = cmd.spawn().expect("failed to spawn child");
                        let _ = child.wait();
                        process::exit(0);
                    }
                    _ => {
                        eprintln!("Error: unknown mock-run option '{}'", args[i]);
                        process::exit(1);
                    }
                }
            }
            process::exit(0);
        }
        subcmd => {
            // Try to dispatch via cmd_override or direct tool name
            let extra_args: Vec<String> = args[2..].to_vec();
            match try_run_override(subcmd, &extra_args) {
                Ok(exit_code) => process::exit(exit_code),
                Err(err) => {
                    eprintln!("Error: {}", err);
                    print_help();
                    process::exit(1);
                }
            }
        }
    }
}
