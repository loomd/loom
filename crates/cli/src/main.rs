use std::collections::HashMap;
use std::env;
use std::process;
use std::path::PathBuf;
use loom_core::storage::{
    create_template, delete_template_by_name, get_cli_tools, get_templates,
    get_templates_for_cli, resolve_cli_id,
};

fn print_help() {
    println!("loom - 多项目统一管理，多agent并行开发");
    println!("Usage:");
    println!("  loom [options] <command> [args]");
    println!();
    println!("Options:");
    println!("  -h, --help      Show this help menu");
    println!("  -v, --version   Show version info");
    println!();
    println!("Commands:");
    println!("  list            List all registered CLI tools");
    println!("  search <query>  Search for registered CLI tools by query");
    println!("  template        Manage run templates for CLI tools (list/add/delete)");
    println!();
    println!("You can also run a CLI tool directly by its name or alias:");
    println!("  loom <name-or-alias> [extra args...]");
}

fn print_version() {
    println!("loom {}", env!("CARGO_PKG_VERSION"));
}

/// Try to run a command by looking up alias in cli_tools, then name in cli_tools.
/// Returns Ok(exit_code) if found and executed, or Err if not found.
fn try_run_override(subcmd: &str, extra_args: &[String]) -> Result<i32, String> {
    let tools = get_cli_tools().map_err(|e| e.to_string())?;

    // First: look for a CLI tool whose alias matches
    if let Some(tool) = tools.iter().find(|t| t.alias.as_deref() == Some(subcmd)) {
        let tool_path: PathBuf = tool.path.clone();
        let mut cmd = process::Command::new(&tool_path);

        // Add tool default args, then extra args passed on command line
        cmd.args(&tool.custom_args);
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

    // Second: look for a CLI tool whose name matches
    if let Some(tool) = tools.iter().find(|t| t.name == subcmd) {
        let tool_path: PathBuf = tool.path.clone();
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

fn print_template_help() {
    println!("Manage run templates for CLI tools (agents)");
    println!("Usage:");
    println!("  loom template list [--agent <name>] [--json]");
    println!("  loom template add --agent <name> --name <name> [--arg <arg>]... [--env KEY=VALUE]... [--pwd <dir>] [--env-mode <inherit|isolated>]");
    println!("  loom template delete --agent <name> --name <name>");
}

fn cmd_template(args: &[String]) -> i32 {
    match args.first().map(|s| s.as_str()) {
        Some("list") => template_list(&args[1..]),
        Some("add") => template_add(&args[1..]),
        Some("delete") => template_delete(&args[1..]),
        Some("help") | Some("-h") | Some("--help") => {
            print_template_help();
            0
        }
        Some(other) => {
            eprintln!("Error: unknown template subcommand '{}'", other);
            print_template_help();
            1
        }
        None => {
            print_template_help();
            0
        }
    }
}

fn template_list(args: &[String]) -> i32 {
    let mut agent: Option<String> = None;
    let mut format_json = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --agent requires a value");
                    return 1;
                }
                agent = Some(args[i + 1].clone());
                i += 2;
            }
            "--json" => {
                format_json = true;
                i += 1;
            }
            _ => {
                eprintln!("Error: excessive or unknown argument '{}'", args[i]);
                return 1;
            }
        }
    }

    let templates = match agent {
        Some(a) => match resolve_cli_id(&a).and_then(|id| get_templates_for_cli(&id)) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Error: {}", e);
                return 1;
            }
        },
        None => match get_templates() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Error: {}", e);
                return 1;
            }
        },
    };

    if format_json {
        println!("{}", serde_json::to_string_pretty(&templates).unwrap());
    } else {
        println!("{:<24} {:<30} {:<16} {:<20}", "ID", "Name", "CLI ID", "Args");
        println!("{}", "-".repeat(92));
        for t in templates {
            println!("{:<24} {:<30} {:<16} {:<20}", t.id, t.name, t.cli_id, t.args.join(" "));
        }
    }
    0
}

fn template_add(args: &[String]) -> i32 {
    let mut agent: Option<String> = None;
    let mut name: Option<String> = None;
    let mut cli_args: Vec<String> = Vec::new();
    let mut env: HashMap<String, String> = HashMap::new();
    let mut pwd: Option<String> = None;
    let mut env_mode: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --agent requires a value");
                    return 1;
                }
                agent = Some(args[i + 1].clone());
                i += 2;
            }
            "--name" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --name requires a value");
                    return 1;
                }
                name = Some(args[i + 1].clone());
                i += 2;
            }
            "--arg" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --arg requires a value");
                    return 1;
                }
                cli_args.push(args[i + 1].clone());
                i += 2;
            }
            "--env" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --env requires KEY=VALUE");
                    return 1;
                }
                let kv = &args[i + 1];
                match kv.split_once('=') {
                    Some((k, v)) => {
                        env.insert(k.to_string(), v.to_string());
                    }
                    None => {
                        eprintln!("Error: --env expects KEY=VALUE, got '{}'", kv);
                        return 1;
                    }
                }
                i += 2;
            }
            "--pwd" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --pwd requires a value");
                    return 1;
                }
                pwd = Some(args[i + 1].clone());
                i += 2;
            }
            "--env-mode" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --env-mode requires a value");
                    return 1;
                }
                env_mode = Some(args[i + 1].clone());
                i += 2;
            }
            _ => {
                eprintln!("Error: excessive or unknown argument '{}'", args[i]);
                return 1;
            }
        }
    }

    let (agent, name) = match (agent, name) {
        (Some(a), Some(n)) => (a, n),
        _ => {
            eprintln!("Error: both --agent and --name are required");
            print_template_help();
            return 1;
        }
    };

    let cli_id = match resolve_cli_id(&agent) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("Error: {}", e);
            return 1;
        }
    };

    match create_template(cli_id, name, cli_args, env, vec![], pwd, env_mode) {
        Ok(tpl) => {
            println!("Template created: {} (id={})", tpl.name, tpl.id);
            println!("{}", serde_json::to_string_pretty(&tpl).unwrap());
            0
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            1
        }
    }
}

fn template_delete(args: &[String]) -> i32 {
    let mut agent: Option<String> = None;
    let mut name: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --agent requires a value");
                    return 1;
                }
                agent = Some(args[i + 1].clone());
                i += 2;
            }
            "--name" => {
                if i + 1 >= args.len() {
                    eprintln!("Error: --name requires a value");
                    return 1;
                }
                name = Some(args[i + 1].clone());
                i += 2;
            }
            _ => {
                eprintln!("Error: excessive or unknown argument '{}'", args[i]);
                return 1;
            }
        }
    }

    let (agent, name) = match (agent, name) {
        (Some(a), Some(n)) => (a, n),
        _ => {
            eprintln!("Error: both --agent and --name are required");
            print_template_help();
            return 1;
        }
    };

    let cli_id = match resolve_cli_id(&agent) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("Error: {}", e);
            return 1;
        }
    };

    match delete_template_by_name(&cli_id, &name) {
        Ok(()) => {
            println!("Template '{}' deleted for agent '{}'", name, agent);
            0
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            1
        }
    }
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
        "template" => {
            process::exit(cmd_template(&args[2..]));
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
                        let self_exe = env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from("loom"));
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
            // Try to dispatch via alias or direct tool name
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
