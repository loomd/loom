use std::collections::HashMap;
use std::env;
use std::error::Error;
use std::path::PathBuf;
use std::process;

use clap::{Parser, Subcommand, Args, CommandFactory};
use loom_core::storage::{
    create_template, delete_template_by_name, get_cli_tools, get_templates,
    get_templates_for_cli, resolve_cli_id, CliTool, StorageError,
};

#[derive(Debug, Parser)]
#[command(name = "loom", version, about = "多项目统一管理，多agent并行开发", propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<AppCommand>,
}

#[derive(Debug, Subcommand)]
enum AppCommand {
    /// 列出所有已注册的 CLI 工具
    List(ListArgs),
    /// 按名称或路径搜索已注册的 CLI 工具
    Search(SearchArgs),
    /// 管理 CLI 工具的运行模板
    Template(TemplateArgs),
    #[cfg(debug_assertions)]
    #[command(hide = true)]
    MockRun(MockRunArgs),
}

#[derive(Debug, Args)]
struct ListArgs {
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
    #[arg(long, value_name = "table|json", help = "指定输出格式")]
    format: Option<String>,
}

#[derive(Debug, Args)]
struct SearchArgs {
    /// 搜索关键词
    query: String,
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Debug, Args)]
struct TemplateArgs {
    #[command(subcommand)]
    command: Option<TemplateCommand>,
}

#[derive(Debug, Subcommand)]
enum TemplateCommand {
    /// 列出模板
    List(TemplateListArgs),
    /// 创建新模板
    Add(TemplateAddArgs),
    /// 删除模板
    Delete(TemplateDeleteArgs),
}

#[derive(Debug, Args)]
struct TemplateListArgs {
    #[arg(long, help = "按 agent 名称或 ID 过滤")]
    agent: Option<String>,
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Debug, Args)]
struct TemplateAddArgs {
    #[arg(long, required = true, help = "Agent 名称或 ID")]
    agent: String,
    #[arg(long, required = true, help = "模板名称")]
    name: String,
    #[arg(long, action = clap::ArgAction::Append, num_args = 1, help = "命令行参数（可多次）")]
    arg: Vec<String>,
    #[arg(long, action = clap::ArgAction::Append, value_name = "KEY=VALUE", help = "环境变量（可多次）")]
    env: Vec<String>,
    #[arg(long, help = "工作目录")]
    pwd: Option<String>,
    #[arg(long, value_name = "inherit|isolated", help = "环境变量模式")]
    env_mode: Option<String>,
}

#[derive(Debug, Args)]
struct TemplateDeleteArgs {
    #[arg(long, required = true, help = "Agent 名称或 ID")]
    agent: String,
    #[arg(long, required = true, help = "模板名称")]
    name: String,
}

#[derive(Debug, Args)]
#[cfg(debug_assertions)]
struct MockRunArgs {
    #[arg(last = true, num_args = 0.., allow_hyphen_values = true)]
    args: Vec<String>,
}

#[derive(Debug)]
enum CliError {
    Storage(StorageError),
    Io(std::io::Error),
    UnknownTool(String),
    ToolExecFailed(String),
    InvalidInput(String),
}

impl std::fmt::Display for CliError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CliError::Storage(e) => write!(f, "{}", e),
            CliError::Io(e) => write!(f, "IO error: {}", e),
            CliError::UnknownTool(name) => {
                write!(f, "Unknown command '{}'. Try `loom list` or `loom --help`.", name)
            }
            CliError::ToolExecFailed(msg) => write!(f, "{}", msg),
            CliError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
        }
    }
}

impl Error for CliError {}
impl From<StorageError> for CliError {
    fn from(e: StorageError) -> Self {
        CliError::Storage(e)
    }
}
impl From<std::io::Error> for CliError {
    fn from(e: std::io::Error) -> Self {
        CliError::Io(e)
    }
}

fn print_tool_table(tools: &[&CliTool]) {
    println!("{:<20} {:<50} {:<10} {:<15}", "Name", "Path", "Version", "Category");
    println!("{}", "-".repeat(100));
    for t in tools {
        let cat = t.category_id.as_deref().unwrap_or("None");
        println!("{:<20} {:<50} {:<10} {:<15}", t.name, t.path.display(), t.version, cat);
    }
}

fn print_help_text() {
    println!("{}", Cli::command().render_help());
}

fn list_tools(args: &ListArgs) -> Result<(), CliError> {
    let format_json = args.json || args.format.as_deref() == Some("json");
    if let Some(f) = &args.format {
        if f != "json" && f != "table" {
            return Err(CliError::InvalidInput(format!(
                "invalid format '{}'. Use 'table' or 'json'",
                f
            )));
        }
    }
    let tools = get_cli_tools()?;
    if format_json {
        println!("{}", serde_json::to_string_pretty(&tools).unwrap());
    } else {
        let refs: Vec<&CliTool> = tools.iter().collect();
        print_tool_table(&refs);
    }
    Ok(())
}

fn search_tools(args: &SearchArgs) -> Result<(), CliError> {
    let tools = get_cli_tools()?;
    let query_lower = args.query.to_lowercase();
    let matches: Vec<&CliTool> = tools
        .iter()
        .filter(|t| {
            t.name.to_lowercase().contains(&query_lower)
                || t.path.to_string_lossy().to_lowercase().contains(&query_lower)
        })
        .collect();
    if args.json {
        println!("{}", serde_json::to_string_pretty(&matches).unwrap());
    } else {
        print_tool_table(&matches);
    }
    Ok(())
}

fn cmd_template(args: &TemplateArgs) -> Result<(), CliError> {
    match &args.command {
        Some(TemplateCommand::List(a)) => template_list(a),
        Some(TemplateCommand::Add(a)) => template_add(a),
        Some(TemplateCommand::Delete(a)) => template_delete(a),
        None => {
            eprintln!("Error: subcommand required (list/add/delete)");
            eprintln!("Try 'loom template --help' for more information.");
            Ok(())
        }
    }
}

fn template_list(args: &TemplateListArgs) -> Result<(), CliError> {
    let templates = match &args.agent {
        Some(a) => get_templates_for_cli(&resolve_cli_id(a)?)?,
        None => get_templates()?,
    };
    if args.json {
        println!("{}", serde_json::to_string_pretty(&templates).unwrap());
    } else {
        println!("{:<24} {:<30} {:<16} {:<20}", "ID", "Name", "CLI ID", "Args");
        println!("{}", "-".repeat(92));
        for t in templates {
            println!(
                "{:<24} {:<30} {:<16} {:<20}",
                t.id, t.name, t.cli_id, t.args.join(" ")
            );
        }
    }
    Ok(())
}

fn template_add(args: &TemplateAddArgs) -> Result<(), CliError> {
    let cli_id = resolve_cli_id(&args.agent)?;
    let mut env: HashMap<String, String> = HashMap::new();
    for kv in &args.env {
        match kv.split_once('=') {
            Some((k, v)) => {
                env.insert(k.to_string(), v.to_string());
            }
            None => {
                return Err(CliError::InvalidInput(format!(
                    "--env expects KEY=VALUE, got '{}'",
                    kv
                )));
            }
        }
    }
    let tpl = create_template(
        cli_id,
        args.name.clone(),
        args.arg.clone(),
        env,
        vec![],
        args.pwd.clone(),
        args.env_mode.clone(),
    )?;
    println!("Template created: {} (id={})", tpl.name, tpl.id);
    println!("{}", serde_json::to_string_pretty(&tpl).unwrap());
    Ok(())
}

fn template_delete(args: &TemplateDeleteArgs) -> Result<(), CliError> {
    let cli_id = resolve_cli_id(&args.agent)?;
    delete_template_by_name(&cli_id, &args.name)?;
    println!(
        "Template '{}' deleted for agent '{}'",
        args.name, args.agent
    );
    Ok(())
}

fn exec_tool(
    tool: &CliTool,
    default_args: &[String],
    extra_args: &[String],
) -> Result<i32, CliError> {
    let mut cmd = process::Command::new(&tool.path);
    cmd.args(default_args);
    cmd.args(extra_args);
    for (k, v) in &tool.custom_env {
        cmd.env(k, v);
    }
    cmd.stdin(process::Stdio::inherit());
    cmd.stdout(process::Stdio::inherit());
    cmd.stderr(process::Stdio::inherit());
    let status = cmd
        .status()
        .map_err(|e| CliError::ToolExecFailed(format!("Failed to execute '{}': {}", tool.path.display(), e)))?;
    Ok(status.code().unwrap_or(1))
}

fn try_run_tool(name: &str, extra_args: &[String]) -> Result<i32, CliError> {
    let tools = get_cli_tools()?;
    if let Some(tool) = tools.iter().find(|t| t.alias.as_deref() == Some(name)) {
        return exec_tool(tool, &tool.custom_args, extra_args);
    }
    if let Some(tool) = tools.iter().find(|t| t.name == name) {
        return exec_tool(tool, &[], extra_args);
    }
    Err(CliError::UnknownTool(name.to_string()))
}

#[allow(dead_code)]
fn resolve_tool(name: &str) -> Result<CliTool, CliError> {
    let tools = get_cli_tools()?;
    if let Some(tool) = tools.iter().find(|t| t.alias.as_deref() == Some(name)) {
        return Ok(tool.clone());
    }
    if let Some(tool) = tools.iter().find(|t| t.name == name) {
        return Ok(tool.clone());
    }
    Err(CliError::UnknownTool(name.to_string()))
}

#[cfg(debug_assertions)]
fn cmd_mock_run(args: &MockRunArgs) -> Result<i32, CliError> {
    let mut i = 0;
    while i < args.args.len() {
        match args.args[i].as_str() {
            "--print-env" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--print-env requires a name".into()));
                }
                let val = env::var(&args.args[i + 1]).unwrap_or_default();
                println!("{}", val);
                i += 2;
            }
            "--stdout" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--stdout requires text".into()));
                }
                println!("{}", args.args[i + 1]);
                i += 2;
            }
            "--stderr" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--stderr requires text".into()));
                }
                eprintln!("{}", args.args[i + 1]);
                i += 2;
            }
            "--stdout-loop" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--stdout-loop requires a count".into()));
                }
                let count: usize = args.args[i + 1].parse().unwrap_or(0);
                for line_num in 0..count {
                    println!("Line {}", line_num);
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                i += 2;
            }
            "--sleep" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--sleep requires milliseconds".into()));
                }
                let ms: u64 = args.args[i + 1].parse().unwrap_or(0);
                std::thread::sleep(std::time::Duration::from_millis(ms));
                i += 2;
            }
            "--exit" => {
                if i + 1 >= args.args.len() {
                    return Err(CliError::InvalidInput("--exit requires a code".into()));
                }
                let code: i32 = args.args[i + 1].parse().unwrap_or(0);
                return Ok(code);
            }
            "--spawn-child" => {
                let self_exe = env::current_exe().unwrap_or_else(|_| PathBuf::from("loom"));
                let mut cmd = process::Command::new(self_exe);
                cmd.arg("mock-run");
                for a in &args.args[i + 1..] {
                    cmd.arg(a);
                }
                let mut child = cmd.spawn().map_err(|e| {
                    CliError::ToolExecFailed(format!("failed to spawn child: {}", e))
                })?;
                let _ = child.wait();
                return Ok(0);
            }
            _ => {
                return Err(CliError::InvalidInput(format!(
                    "unknown mock-run option '{}'",
                    args.args[i]
                )));
            }
        }
    }
    Ok(0)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_help_text();
        process::exit(0);
    }
    match Cli::try_parse_from(&args) {
        Ok(cli) => {
            let result: Result<(), CliError> = match cli.command {
                Some(AppCommand::List(a)) => list_tools(&a),
                Some(AppCommand::Search(a)) => search_tools(&a),
                Some(AppCommand::Template(a)) => cmd_template(&a),
                #[cfg(debug_assertions)]
                Some(AppCommand::MockRun(a)) => cmd_mock_run(&a).map(|_| ()),
                None => {
                    print_help_text();
                    process::exit(0);
                }
            };
            if let Err(e) = result {
                eprintln!("Error: {}", e);
                process::exit(1);
            }
        }
        Err(e) => {
            if matches!(e.kind(), clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion) {
                println!("{}", e.render());
                process::exit(0);
            }
            let name = &args[1];
            let extra: Vec<String> = args[2..].to_vec();
            match try_run_tool(name, &extra) {
                Ok(code) => process::exit(code),
                Err(err) => {
                    eprintln!("Error: {}", err);
                    print_help_text();
                    process::exit(1);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use loom_core::storage::models::LoomStorage;
    use loom_core::storage::Template;
    use std::io::Write;
    use std::sync::Mutex;

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    struct TestGuard {
        _guard: std::sync::MutexGuard<'static, ()>,
        _temp_dir: tempfile::TempDir,
    }

    impl TestGuard {
        fn new(config: &LoomStorage) -> Self {
            let guard = TEST_MUTEX.lock().unwrap();
            let tmp_dir = tempfile::tempdir().expect("create temp dir");
            let config_path = tmp_dir.path().join("loom.json");
            env::set_var("LOOM_CONFIG_PATH", config_path.to_str().unwrap());
            let mut file = std::fs::File::create(&config_path).unwrap();
            file.write_all(
                serde_json::to_string_pretty(config)
                    .expect("serialize config")
                    .as_bytes(),
            )
            .unwrap();
            file.sync_all().unwrap();
            drop(file);
            Self {
                _guard: guard,
                _temp_dir: tmp_dir,
            }
        }

        fn with_tools(tools: Vec<CliTool>) -> Self {
            let config = LoomStorage {
                cli_tools: tools,
                ..LoomStorage::default()
            };
            Self::new(&config)
        }

        fn with_tools_and_templates(tools: Vec<CliTool>, templates: Vec<Template>) -> Self {
            let config = LoomStorage {
                cli_tools: tools,
                templates,
                ..LoomStorage::default()
            };
            Self::new(&config)
        }
    }

    impl Drop for TestGuard {
        fn drop(&mut self) {
            env::remove_var("LOOM_CONFIG_PATH");
        }
    }

    fn make_tool(
        name: &str,
        path: &str,
        version: &str,
        alias: Option<&str>,
    ) -> CliTool {
        CliTool {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            path: PathBuf::from(path),
            version: version.to_string(),
            category_id: None,
            custom_env: HashMap::new(),
            custom_args: vec![],
            is_agent: false,
            alias: alias.map(|a| a.to_string()),
        }
    }

    // ===== Argument Parsing Tests =====

    mod arg_parsing {
        use super::*;

        #[test]
        fn list_command_basic() {
            let cli = Cli::try_parse_from(["loom", "list"]).unwrap();
            assert!(matches!(cli.command, Some(AppCommand::List(_))));
        }

        #[test]
        fn list_command_json_flag() {
            let cli = Cli::try_parse_from(["loom", "list", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::List(a)) => assert!(a.json),
                _ => panic!("expected List"),
            }
        }

        #[test]
        fn list_command_format_json() {
            let cli = Cli::try_parse_from(["loom", "list", "--format", "json"]).unwrap();
            match cli.command {
                Some(AppCommand::List(a)) => assert_eq!(a.format, Some("json".to_string())),
                _ => panic!("expected List"),
            }
        }

        #[test]
        fn search_command_with_query() {
            let cli = Cli::try_parse_from(["loom", "search", "cargo"]).unwrap();
            match cli.command {
                Some(AppCommand::Search(a)) => assert_eq!(a.query, "cargo"),
                _ => panic!("expected Search"),
            }
        }

        #[test]
        fn search_command_json() {
            let cli = Cli::try_parse_from(["loom", "search", "cargo", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::Search(a)) => {
                    assert_eq!(a.query, "cargo");
                    assert!(a.json);
                }
                _ => panic!("expected Search"),
            }
        }

        #[test]
        fn template_list_command() {
            let cli = Cli::try_parse_from(["loom", "template", "list"]).unwrap();
            assert!(matches!(
                cli.command,
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::List(_)),
                }))
            ));
        }

        #[test]
        fn template_add_command() {
            let cli = Cli::try_parse_from([
                "loom", "template", "add", "--agent", "tool1", "--name", "t1",
            ])
            .unwrap();
            match cli.command {
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::Add(a)),
                })) => {
                    assert_eq!(a.agent, "tool1");
                    assert_eq!(a.name, "t1");
                }
                _ => panic!("expected template add"),
            }
        }

        #[test]
        fn template_add_with_env() {
            let cli = Cli::try_parse_from([
                "loom", "template", "add", "--agent", "t", "--name", "n", "--env", "KEY=VAL",
            ])
            .unwrap();
            match cli.command {
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::Add(a)),
                })) => {
                    assert_eq!(a.env, vec!["KEY=VAL".to_string()]);
                }
                _ => panic!("expected template add"),
            }
        }

        #[test]
        fn template_add_missing_agent_rejects() {
            let err = Cli::try_parse_from(["loom", "template", "add", "--name", "t1"]).unwrap_err();
            assert!(err.kind() == clap::error::ErrorKind::MissingRequiredArgument);
        }

        #[test]
        fn template_delete_command() {
            let cli = Cli::try_parse_from([
                "loom", "template", "delete", "--agent", "t", "--name", "n",
            ])
            .unwrap();
            match cli.command {
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::Delete(a)),
                })) => {
                    assert_eq!(a.agent, "t");
                    assert_eq!(a.name, "n");
                }
                _ => panic!("expected template delete"),
            }
        }

        #[test]
        fn unknown_command_is_error() {
            let err = Cli::try_parse_from(["loom", "foo"]).unwrap_err();
            assert_ne!(err.kind(), clap::error::ErrorKind::DisplayHelp);
        }

        #[test]
        fn no_args_gives_none() {
            let cli = Cli::try_parse_from(["loom"]).unwrap();
            assert!(cli.command.is_none());
        }

        #[test]
        fn version_flag() {
            let err = Cli::try_parse_from(["loom", "--version"]).unwrap_err();
            assert!(matches!(
                err.kind(),
                clap::error::ErrorKind::DisplayVersion
            ));
        }
    }

    // ===== List Command Tests =====

    mod list_command {
        use super::*;

        #[test]
        fn list_empty_table() {
            let _g = TestGuard::with_tools(vec![]);
            let args = ListArgs {
                json: false,
                format: None,
            };
            let result = list_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn list_with_tools_table() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = ListArgs {
                json: false,
                format: None,
            };
            let result = list_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn list_json_output() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                Some("cgo"),
            )]);
            let args = ListArgs {
                json: true,
                format: None,
            };
            let result = list_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn list_invalid_format_error() {
            let _g = TestGuard::with_tools(vec![]);
            let args = ListArgs {
                json: false,
                format: Some("xml".to_string()),
            };
            let result = list_tools(&args);
            assert!(matches!(result, Err(CliError::InvalidInput(_))));
        }

        #[test]
        fn list_format_table_is_valid() {
            let _g = TestGuard::with_tools(vec![]);
            let args = ListArgs {
                json: false,
                format: Some("table".to_string()),
            };
            let result = list_tools(&args);
            assert!(result.is_ok());
        }
    }

    // ===== Search Command Tests =====

    mod search_command {
        use super::*;

        #[test]
        fn search_matches_name() {
            let _g = TestGuard::with_tools(vec![
                make_tool("cargo", "/usr/bin/cargo", "1.70", None),
                make_tool("rustc", "/usr/bin/rustc", "1.70", None),
            ]);
            let args = SearchArgs {
                query: "cargo".to_string(),
                json: false,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn search_matches_path() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = SearchArgs {
                query: "/usr/bin/cargo".to_string(),
                json: false,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn search_partial_match() {
            let _g = TestGuard::with_tools(vec![
                make_tool("cargo", "/usr/bin/cargo", "1.70", None),
                make_tool("make", "/usr/bin/make", "3.81", None),
            ]);
            let args = SearchArgs {
                query: "car".to_string(),
                json: false,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn search_case_insensitive() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "Cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = SearchArgs {
                query: "CARGO".to_string(),
                json: false,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn search_no_match() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = SearchArgs {
                query: "nonexistent".to_string(),
                json: false,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn search_json_output() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = SearchArgs {
                query: "cargo".to_string(),
                json: true,
            };
            let result = search_tools(&args);
            assert!(result.is_ok());
        }
    }

    // ===== Template Command Tests =====

    mod template_command {
        use super::*;

        #[test]
        fn template_list_empty() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = TemplateListArgs {
                agent: None,
                json: false,
            };
            let result = template_list(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn template_add_basic() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = TemplateAddArgs {
                agent: "cargo".to_string(),
                name: "build".to_string(),
                arg: vec!["--release".to_string()],
                env: vec![],
                pwd: None,
                env_mode: None,
            };
            let result = template_add(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn template_add_with_env() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = TemplateAddArgs {
                agent: "cargo".to_string(),
                name: "test".to_string(),
                arg: vec![],
                env: vec!["RUST_LOG=debug".to_string()],
                pwd: None,
                env_mode: Some("isolated".to_string()),
            };
            let result = template_add(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn template_add_invalid_env_format() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let args = TemplateAddArgs {
                agent: "cargo".to_string(),
                name: "bad".to_string(),
                arg: vec![],
                env: vec!["no_equals_sign".to_string()],
                pwd: None,
                env_mode: None,
            };
            let result = template_add(&args);
            assert!(matches!(result, Err(CliError::InvalidInput(_))));
        }

        #[test]
        fn template_add_unknown_agent() {
            let _g = TestGuard::with_tools(vec![]);
            let args = TemplateAddArgs {
                agent: "nonexistent".to_string(),
                name: "t".to_string(),
                arg: vec![],
                env: vec![],
                pwd: None,
                env_mode: None,
            };
            let result = template_add(&args);
            assert!(result.is_err());
        }

        #[test]
        fn template_delete_cmd() {
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            let tid = uuid::Uuid::new_v4().to_string();
            let tpl = Template {
                id: tid.clone(),
                cli_id: tool.id.clone(),
                name: "build".to_string(),
                args: vec![],
                env: HashMap::new(),
                env_var_ids: vec![],
                pwd: None,
                last_run: None,
                env_mode: None,
            };
            let _g = TestGuard::with_tools_and_templates(vec![tool], vec![tpl]);

            let args = TemplateDeleteArgs {
                agent: "cargo".to_string(),
                name: "build".to_string(),
            };
            let result = template_delete(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn template_list_with_agent_filter() {
            let _g = TestGuard::with_tools(vec![
                make_tool("cargo", "/usr/bin/cargo", "1.70", None),
                make_tool("rustc", "/usr/bin/rustc", "1.70", None),
            ]);
            let args = TemplateListArgs {
                agent: Some("cargo".to_string()),
                json: false,
            };
            let result = template_list(&args);
            assert!(result.is_ok());
        }
    }

    // ===== Tool Resolution Tests =====

    mod try_run_tool {
        use super::*;

        #[test]
        fn alias_match() {
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", Some("cgo"));
            let _g = TestGuard::with_tools(vec![tool]);
            let result = resolve_tool("cgo");
            assert!(result.is_ok());
            assert_eq!(result.unwrap().name, "cargo");
        }

        #[test]
        fn name_match() {
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            let _g = TestGuard::with_tools(vec![tool]);
            let result = resolve_tool("cargo");
            assert!(result.is_ok());
        }

        #[test]
        fn unknown_tool_error() {
            let _g = TestGuard::with_tools(vec![make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                None,
            )]);
            let result = resolve_tool("nonexistent");
            assert!(matches!(result, Err(CliError::UnknownTool(_))));
        }

        #[test]
        fn alias_takes_priority_over_name() {
            let t1 = make_tool(
                "cargo",
                "/usr/bin/cargo",
                "1.70",
                Some("mytool"),
            );
            let t2 = make_tool(
                "mytool",
                "/usr/bin/other",
                "2.0",
                None,
            );
            let _g = TestGuard::with_tools(vec![t1, t2]);
            let tool = resolve_tool("mytool").unwrap();
            assert_eq!(tool.name, "cargo");
        }

        #[test]
        fn tool_with_custom_args() {
            let mut tool = make_tool("cargo", "/usr/bin/cargo", "1.70", Some("cgo"));
            tool.custom_args = vec!["--locked".to_string()];
            let _g = TestGuard::with_tools(vec![tool]);
            let resolved = resolve_tool("cgo").unwrap();
            assert_eq!(resolved.custom_args, vec!["--locked".to_string()]);
        }
    }

    // ===== CliError Display Tests =====

    mod cli_error_display {
        use super::*;

        #[test]
        fn unknown_tool_error_message() {
            let err = CliError::UnknownTool("foo".to_string());
            assert!(format!("{}", err).contains("foo"));
            assert!(format!("{}", err).contains("loom list"));
        }

        #[test]
        fn invalid_input_error_message() {
            let err = CliError::InvalidInput("bad value".to_string());
            assert!(format!("{}", err).contains("bad value"));
        }

        #[test]
        fn io_error_message() {
            let err = CliError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "file not found",
            ));
            assert!(format!("{}", err).contains("file not found"));
        }
    }

    // ===== PrintToolTable Tests =====

    mod print_tool_table {
        use super::*;

        #[test]
        fn empty_table_has_header() {
            let _g = TestGuard::with_tools(vec![]);
            let tools = get_cli_tools().unwrap();
            let refs: Vec<&CliTool> = tools.iter().collect();
            print_tool_table(&refs);
        }

        #[test]
        fn table_with_category() {
            let mut tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            tool.category_id = Some("build".to_string());
            let _g = TestGuard::with_tools(vec![tool]);
            let tools = get_cli_tools().unwrap();
            let refs: Vec<&CliTool> = tools.iter().collect();
            print_tool_table(&refs);
        }

        #[test]
        fn table_without_category_shows_none() {
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            let _g = TestGuard::with_tools(vec![tool]);
            let tools = get_cli_tools().unwrap();
            let refs: Vec<&CliTool> = tools.iter().collect();
            print_tool_table(&refs);
        }
    }

    // ===== MockRun Tests =====

    #[cfg(debug_assertions)]
    mod mock_run {
        use super::*;

        #[test]
        fn mock_run_stdout() {
            let args = MockRunArgs {
                args: vec!["--stdout".to_string(), "hello".to_string()],
            };
            let result = cmd_mock_run(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn mock_run_exit_code() {
            let args = MockRunArgs {
                args: vec!["--exit".to_string(), "42".to_string()],
            };
            let result = cmd_mock_run(&args);
            assert_eq!(result.ok(), Some(42));
        }

        #[test]
        fn mock_run_print_env() {
            env::set_var("LOOM_TEST_ENV", "test_value");
            let args = MockRunArgs {
                args: vec!["--print-env".to_string(), "LOOM_TEST_ENV".to_string()],
            };
            let result = cmd_mock_run(&args);
            assert!(result.is_ok());
            env::remove_var("LOOM_TEST_ENV");
        }

        #[test]
        fn mock_run_sleep_zero() {
            let args = MockRunArgs {
                args: vec!["--sleep".to_string(), "0".to_string()],
            };
            let result = cmd_mock_run(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn mock_run_stdout_loop() {
            let args = MockRunArgs {
                args: vec![
                    "--stdout-loop".to_string(),
                    "3".to_string(),
                ],
            };
            let result = cmd_mock_run(&args);
            assert!(result.is_ok());
        }
    }
}
