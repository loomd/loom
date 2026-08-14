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

#[derive(Parser)]
#[command(name = "loom", version, about = "多项目统一管理，多agent并行开发", propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<AppCommand>,
}

#[derive(Subcommand)]
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

#[derive(Args)]
struct ListArgs {
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
    #[arg(long, value_name = "table|json", help = "指定输出格式")]
    format: Option<String>,
}

#[derive(Args)]
struct SearchArgs {
    /// 搜索关键词
    query: String,
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Args)]
struct TemplateArgs {
    #[command(subcommand)]
    command: Option<TemplateCommand>,
}

#[derive(Subcommand)]
enum TemplateCommand {
    /// 列出模板
    List(TemplateListArgs),
    /// 创建新模板
    Add(TemplateAddArgs),
    /// 删除模板
    Delete(TemplateDeleteArgs),
}

#[derive(Args)]
struct TemplateListArgs {
    #[arg(long, help = "按 agent 名称或 ID 过滤")]
    agent: Option<String>,
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Args)]
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

#[derive(Args)]
struct TemplateDeleteArgs {
    #[arg(long, required = true, help = "Agent 名称或 ID")]
    agent: String,
    #[arg(long, required = true, help = "模板名称")]
    name: String,
}

#[derive(Args)]
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
