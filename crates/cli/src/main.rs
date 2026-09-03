use std::collections::HashMap;
use std::env;
use std::error::Error;
use std::path::PathBuf;
use std::process;

use clap::{Args, CommandFactory, Parser, Subcommand};
use loom_core::storage::{
    create_global_env_var, create_project, create_template, delete_global_env_var, delete_project,
    delete_template_by_name, get_cli_tools, get_global_env_vars, get_projects, get_templates,
    get_templates_for_cli, reorder_projects, reorder_templates, update_global_env_var,
    update_template, CliTool, StorageError,
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
    /// 兼容别名：管理 CLI 工具（支持 loom tool list / loom tool search）
    Tool(ToolArgs),
    /// 管理项目
    Project(ProjectArgs),
    /// 管理全局环境变量
    Env(EnvArgs),
    /// 管理 CLI 工具的运行模板
    Template(TemplateArgs),
    #[cfg(debug_assertions)]
    #[command(hide = true)]
    MockRun(MockRunArgs),
}

#[derive(Debug, Args)]
struct ToolArgs {
    #[command(subcommand)]
    command: Option<ToolCommand>,
}

#[derive(Debug, Subcommand)]
enum ToolCommand {
    /// 列出所有已注册的 CLI 工具
    List(ListArgs),
    /// 按名称或路径搜索已注册的 CLI 工具
    Search(SearchArgs),
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
struct ProjectArgs {
    #[command(subcommand)]
    command: Option<ProjectCommand>,
}

#[derive(Debug, Subcommand)]
enum ProjectCommand {
    /// 列出所有项目
    List(ProjectListArgs),
    /// 创建新项目
    Add(ProjectAddArgs),
    /// 删除项目（按 ID 或名称）
    Delete(ProjectDeleteArgs),
    /// 对项目列表按指定 ID 顺序重新排序
    Reorder(ProjectReorderArgs),
}

#[derive(Debug, Args)]
struct ProjectListArgs {
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Debug, Args)]
struct ProjectAddArgs {
    /// 项目名称
    name: String,
    /// 项目根目录路径
    root_path: String,
}

#[derive(Debug, Args)]
struct ProjectDeleteArgs {
    /// 项目 ID 或名称
    id_or_name: String,
}

#[derive(Debug, Args)]
struct ProjectReorderArgs {
    /// 项目 ID 列表
    #[arg(required = true, num_args = 1..)]
    ids: Vec<String>,
}

#[derive(Debug, Args)]
struct EnvArgs {
    #[command(subcommand)]
    command: Option<EnvCommand>,
}

#[derive(Debug, Subcommand)]
enum EnvCommand {
    /// 列出全局环境变量
    List(EnvListArgs),
    /// 设置全局环境变量（创建或更新）
    Set(EnvSetArgs),
    /// 删除全局环境变量（按 ID 或 Key）
    Delete(EnvDeleteArgs),
}

#[derive(Debug, Args)]
struct EnvListArgs {
    #[arg(long, help = "输出 JSON 格式")]
    json: bool,
}

#[derive(Debug, Args)]
struct EnvSetArgs {
    /// 变量名 Key
    key: String,
    /// 变量值 Value
    value: String,
    /// 描述 Description
    description: Option<String>,
}

#[derive(Debug, Args)]
struct EnvDeleteArgs {
    /// 变量 ID 或 Key
    id_or_key: String,
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
    /// 编辑已有模板
    Edit(TemplateEditArgs),
    /// 删除模板
    Delete(TemplateDeleteArgs),
    /// 对模板列表按指定 ID 顺序重新排序
    Reorder(TemplateReorderArgs),
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
struct TemplateEditArgs {
    #[arg(long, required = true, help = "模板 ID")]
    id: String,
    #[arg(long, help = "新的模板名称")]
    name: Option<String>,
    #[arg(long, action = clap::ArgAction::Append, num_args = 1, help = "新的命令行参数（指定时完全覆盖）")]
    arg: Option<Vec<String>>,
    #[arg(long, action = clap::ArgAction::Append, value_name = "KEY=VALUE", help = "新的环境变量（指定时完全覆盖）")]
    env: Option<Vec<String>>,
    #[arg(long, help = "新的工作目录")]
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
struct TemplateReorderArgs {
    /// 模板 ID 列表
    #[arg(required = true, num_args = 1..)]
    ids: Vec<String>,
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

fn cmd_tool(args: &ToolArgs) -> Result<(), CliError> {
    match &args.command {
        Some(ToolCommand::List(a)) => list_tools(a),
        Some(ToolCommand::Search(a)) => search_tools(a),
        None => {
            let default_list = ListArgs {
                json: false,
                format: None,
            };
            list_tools(&default_list)
        }
    }
}

fn cmd_project(args: &ProjectArgs) -> Result<(), CliError> {
    match &args.command {
        Some(ProjectCommand::List(a)) => project_list(a),
        Some(ProjectCommand::Add(a)) => project_add(a),
        Some(ProjectCommand::Delete(a)) => project_delete(a),
        Some(ProjectCommand::Reorder(a)) => project_reorder(a),
        None => {
            let default_list = ProjectListArgs { json: false };
            project_list(&default_list)
        }
    }
}

fn project_list(args: &ProjectListArgs) -> Result<(), CliError> {
    let projects = get_projects()?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&projects).unwrap());
    } else {
        println!("{:<36} {:<24} {:<40}", "ID", "Name", "Root Path");
        println!("{}", "-".repeat(102));
        for p in projects {
            println!(
                "{:<36} {:<24} {:<40}",
                p.id,
                p.name,
                p.root_path.display()
            );
        }
    }
    Ok(())
}

fn project_add(args: &ProjectAddArgs) -> Result<(), CliError> {
    let project = create_project(args.name.clone(), args.root_path.clone())?;
    println!("Project created: {} (id={})", project.name, project.id);
    println!("{}", serde_json::to_string_pretty(&project).unwrap());
    Ok(())
}

fn project_delete(args: &ProjectDeleteArgs) -> Result<(), CliError> {
    let projects = get_projects()?;
    let target_id = if let Some(p) = projects.iter().find(|p| p.id == args.id_or_name) {
        p.id.clone()
    } else if let Some(p) = projects.iter().find(|p| p.name == args.id_or_name) {
        p.id.clone()
    } else {
        args.id_or_name.clone()
    };
    delete_project(target_id)?;
    println!("Project '{}' deleted", args.id_or_name);
    Ok(())
}

fn project_reorder(args: &ProjectReorderArgs) -> Result<(), CliError> {
    reorder_projects(args.ids.clone())?;
    println!("Projects reordered successfully");
    Ok(())
}

fn cmd_env(args: &EnvArgs) -> Result<(), CliError> {
    match &args.command {
        Some(EnvCommand::List(a)) => env_list(a),
        Some(EnvCommand::Set(a)) => env_set(a),
        Some(EnvCommand::Delete(a)) => env_delete(a),
        None => {
            let default_list = EnvListArgs { json: false };
            env_list(&default_list)
        }
    }
}

fn env_list(args: &EnvListArgs) -> Result<(), CliError> {
    let env_vars = get_global_env_vars()?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&env_vars).unwrap());
    } else {
        println!("{:<36} {:<24} {:<30} {:<20}", "ID", "Key", "Value", "Description");
        println!("{}", "-".repeat(112));
        for ev in env_vars {
            println!(
                "{:<36} {:<24} {:<30} {:<20}",
                ev.id, ev.key, ev.value, ev.description
            );
        }
    }
    Ok(())
}

fn env_set(args: &EnvSetArgs) -> Result<(), CliError> {
    let env_vars = get_global_env_vars()?;
    let desc = args.description.clone().unwrap_or_default();
    if let Some(existing) = env_vars.iter().find(|ev| ev.key == args.key) {
        let updated = update_global_env_var(
            existing.id.clone(),
            args.key.clone(),
            args.value.clone(),
            desc,
        )?;
        println!("Environment variable updated: {}={}", updated.key, updated.value);
        println!("{}", serde_json::to_string_pretty(&updated).unwrap());
    } else {
        let created = create_global_env_var(args.key.clone(), args.value.clone(), desc)?;
        println!("Environment variable created: {}={}", created.key, created.value);
        println!("{}", serde_json::to_string_pretty(&created).unwrap());
    }
    Ok(())
}

fn env_delete(args: &EnvDeleteArgs) -> Result<(), CliError> {
    let env_vars = get_global_env_vars()?;
    let target_id = if let Some(ev) = env_vars.iter().find(|ev| ev.id == args.id_or_key) {
        ev.id.clone()
    } else if let Some(ev) = env_vars.iter().find(|ev| ev.key == args.id_or_key) {
        ev.id.clone()
    } else {
        args.id_or_key.clone()
    };
    delete_global_env_var(target_id)?;
    println!("Environment variable '{}' deleted", args.id_or_key);
    Ok(())
}

fn cmd_template(args: &TemplateArgs) -> Result<(), CliError> {
    match &args.command {
        Some(TemplateCommand::List(a)) => template_list(a),
        Some(TemplateCommand::Add(a)) => template_add(a),
        Some(TemplateCommand::Edit(a)) => template_edit(a),
        Some(TemplateCommand::Delete(a)) => template_delete(a),
        Some(TemplateCommand::Reorder(a)) => template_reorder(a),
        None => {
            eprintln!("Error: subcommand required (list/add/edit/delete/reorder)");
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

fn template_edit(args: &TemplateEditArgs) -> Result<(), CliError> {
    let templates = get_templates()?;
    let existing = templates
        .into_iter()
        .find(|t| t.id == args.id)
        .ok_or_else(|| StorageError::TemplateNotFound(args.id.clone()))?;

    let name = args.name.clone().unwrap_or(existing.name);
    let new_args = args.arg.clone().unwrap_or(existing.args);

    let env = if let Some(env_pairs) = &args.env {
        let mut parsed_env: HashMap<String, String> = HashMap::new();
        for kv in env_pairs {
            match kv.split_once('=') {
                Some((k, v)) => {
                    parsed_env.insert(k.to_string(), v.to_string());
                }
                None => {
                    return Err(CliError::InvalidInput(format!(
                        "--env expects KEY=VALUE, got '{}'",
                        kv
                    )));
                }
            }
        }
        parsed_env
    } else {
        existing.env
    };

    let pwd = if args.pwd.is_some() {
        args.pwd.clone()
    } else {
        existing.pwd.map(|p| p.to_string_lossy().to_string())
    };

    let env_mode = if args.env_mode.is_some() {
        args.env_mode.clone()
    } else {
        existing.env_mode
    };

    let updated = update_template(
        args.id.clone(),
        name,
        new_args,
        env,
        existing.env_var_ids,
        pwd,
        env_mode,
    )?;

    println!("Template updated: {} (id={})", updated.name, updated.id);
    println!("{}", serde_json::to_string_pretty(&updated).unwrap());
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

fn template_reorder(args: &TemplateReorderArgs) -> Result<(), CliError> {
    reorder_templates(args.ids.clone())?;
    println!("Templates reordered successfully");
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
fn resolve_cli_id(name_or_id: &str) -> Result<String, CliError> {
    let tools = get_cli_tools()?;
    if let Some(tool) = tools.iter().find(|t| t.id == name_or_id) {
        return Ok(tool.id.clone());
    }
    if let Some(tool) = tools.iter().find(|t| t.alias.as_deref() == Some(name_or_id)) {
        return Ok(tool.id.clone());
    }
    if let Some(tool) = tools.iter().find(|t| t.name.eq_ignore_ascii_case(name_or_id)) {
        return Ok(tool.id.clone());
    }
    Err(CliError::UnknownTool(name_or_id.to_string()))
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
                Some(AppCommand::Tool(a)) => cmd_tool(&a),
                Some(AppCommand::Project(a)) => cmd_project(&a),
                Some(AppCommand::Env(a)) => cmd_env(&a),
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
            if matches!(
                e.kind(),
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion
            ) {
                println!("{}", e.render());
                process::exit(0);
            }
            // 如果第一个参数是已知子命令（但参数解析失败，例如缺少必填参数），直接打印错误信息
            let known_subcommands = ["list", "search", "tool", "project", "env", "template"];
            if known_subcommands.contains(&args[1].as_str()) {
                eprintln!("{}", e.render());
                process::exit(1);
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
        fn template_edit_command() {
            let cli = Cli::try_parse_from([
                "loom", "template", "edit", "--id", "t-123", "--name", "new-name", "--env", "FOO=BAR",
            ])
            .unwrap();
            match cli.command {
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::Edit(a)),
                })) => {
                    assert_eq!(a.id, "t-123");
                    assert_eq!(a.name, Some("new-name".to_string()));
                    assert_eq!(a.env, Some(vec!["FOO=BAR".to_string()]));
                }
                _ => panic!("expected template edit"),
            }
        }

        #[test]
        fn template_reorder_command() {
            let cli = Cli::try_parse_from([
                "loom", "template", "reorder", "id1", "id2", "id3",
            ])
            .unwrap();
            match cli.command {
                Some(AppCommand::Template(TemplateArgs {
                    command: Some(TemplateCommand::Reorder(a)),
                })) => {
                    assert_eq!(a.ids, vec!["id1".to_string(), "id2".to_string(), "id3".to_string()]);
                }
                _ => panic!("expected template reorder"),
            }
        }

        #[test]
        fn project_list_command() {
            let cli = Cli::try_parse_from(["loom", "project", "list", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::Project(ProjectArgs {
                    command: Some(ProjectCommand::List(a)),
                })) => {
                    assert!(a.json);
                }
                _ => panic!("expected project list"),
            }
        }

        #[test]
        fn project_add_command() {
            let cli = Cli::try_parse_from(["loom", "project", "add", "my-app", "/path/to/app"]).unwrap();
            match cli.command {
                Some(AppCommand::Project(ProjectArgs {
                    command: Some(ProjectCommand::Add(a)),
                })) => {
                    assert_eq!(a.name, "my-app");
                    assert_eq!(a.root_path, "/path/to/app");
                }
                _ => panic!("expected project add"),
            }
        }

        #[test]
        fn project_delete_command() {
            let cli = Cli::try_parse_from(["loom", "project", "delete", "my-app"]).unwrap();
            match cli.command {
                Some(AppCommand::Project(ProjectArgs {
                    command: Some(ProjectCommand::Delete(a)),
                })) => {
                    assert_eq!(a.id_or_name, "my-app");
                }
                _ => panic!("expected project delete"),
            }
        }

        #[test]
        fn project_reorder_command() {
            let cli = Cli::try_parse_from(["loom", "project", "reorder", "p1", "p2"]).unwrap();
            match cli.command {
                Some(AppCommand::Project(ProjectArgs {
                    command: Some(ProjectCommand::Reorder(a)),
                })) => {
                    assert_eq!(a.ids, vec!["p1".to_string(), "p2".to_string()]);
                }
                _ => panic!("expected project reorder"),
            }
        }

        #[test]
        fn env_list_command() {
            let cli = Cli::try_parse_from(["loom", "env", "list", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::Env(EnvArgs {
                    command: Some(EnvCommand::List(a)),
                })) => {
                    assert!(a.json);
                }
                _ => panic!("expected env list"),
            }
        }

        #[test]
        fn env_set_command() {
            let cli = Cli::try_parse_from(["loom", "env", "set", "API_KEY", "secret", "API token"]).unwrap();
            match cli.command {
                Some(AppCommand::Env(EnvArgs {
                    command: Some(EnvCommand::Set(a)),
                })) => {
                    assert_eq!(a.key, "API_KEY");
                    assert_eq!(a.value, "secret");
                    assert_eq!(a.description, Some("API token".to_string()));
                }
                _ => panic!("expected env set"),
            }
        }

        #[test]
        fn env_delete_command() {
            let cli = Cli::try_parse_from(["loom", "env", "delete", "API_KEY"]).unwrap();
            match cli.command {
                Some(AppCommand::Env(EnvArgs {
                    command: Some(EnvCommand::Delete(a)),
                })) => {
                    assert_eq!(a.id_or_key, "API_KEY");
                }
                _ => panic!("expected env delete"),
            }
        }

        #[test]
        fn tool_list_command() {
            let cli = Cli::try_parse_from(["loom", "tool", "list", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::Tool(ToolArgs {
                    command: Some(ToolCommand::List(a)),
                })) => {
                    assert!(a.json);
                }
                _ => panic!("expected tool list"),
            }
        }

        #[test]
        fn tool_search_command() {
            let cli = Cli::try_parse_from(["loom", "tool", "search", "cargo", "--json"]).unwrap();
            match cli.command {
                Some(AppCommand::Tool(ToolArgs {
                    command: Some(ToolCommand::Search(a)),
                })) => {
                    assert_eq!(a.query, "cargo");
                    assert!(a.json);
                }
                _ => panic!("expected tool search"),
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
        fn template_edit_cmd() {
            let tmp_pwd = tempfile::tempdir().expect("create pwd temp dir");
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            let tid = uuid::Uuid::new_v4().to_string();
            let tpl = Template {
                id: tid.clone(),
                cli_id: tool.id.clone(),
                name: "dev-build".to_string(),
                args: vec![],
                env: HashMap::new(),
                env_var_ids: vec![],
                pwd: None,
                last_run: None,
                env_mode: None,
            };
            let _g = TestGuard::with_tools_and_templates(vec![tool], vec![tpl]);

            let args = TemplateEditArgs {
                id: tid.clone(),
                name: Some("release-build".to_string()),
                arg: Some(vec!["--release".to_string()]),
                env: Some(vec!["RUST_LOG=info".to_string()]),
                pwd: Some(tmp_pwd.path().to_string_lossy().to_string()),
                env_mode: Some("isolated".to_string()),
            };
            let result = template_edit(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn template_reorder_cmd() {
            let tool = make_tool("cargo", "/usr/bin/cargo", "1.70", None);
            let tid1 = uuid::Uuid::new_v4().to_string();
            let tid2 = uuid::Uuid::new_v4().to_string();
            let tpl1 = Template {
                id: tid1.clone(),
                cli_id: tool.id.clone(),
                name: "build1".to_string(),
                args: vec![],
                env: HashMap::new(),
                env_var_ids: vec![],
                pwd: None,
                last_run: None,
                env_mode: None,
            };
            let tpl2 = Template {
                id: tid2.clone(),
                cli_id: tool.id.clone(),
                name: "build2".to_string(),
                args: vec![],
                env: HashMap::new(),
                env_var_ids: vec![],
                pwd: None,
                last_run: None,
                env_mode: None,
            };
            let _g = TestGuard::with_tools_and_templates(vec![tool], vec![tpl1, tpl2]);

            let args = TemplateReorderArgs {
                ids: vec![tid2.clone(), tid1.clone()],
            };
            let result = template_reorder(&args);
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

    // ===== Project Command Tests =====

    mod project_command {
        use super::*;
        use loom_core::storage::models::Project;
        use std::path::PathBuf;

        #[test]
        fn project_list_empty() {
            let _g = TestGuard::new(&LoomStorage::default());
            let args = ProjectListArgs { json: false };
            let result = project_list(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn project_list_json() {
            let project = Project {
                id: "p1".to_string(),
                name: "proj1".to_string(),
                root_path: PathBuf::from("/tmp/proj1"),
                env_profiles: HashMap::new(),
                quick_commands: vec![],
            };
            let config = LoomStorage {
                projects: vec![project],
                ..LoomStorage::default()
            };
            let _g = TestGuard::new(&config);
            let args = ProjectListArgs { json: true };
            let result = project_list(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn project_add_and_delete() {
            let tmp_root = tempfile::tempdir().expect("create project root dir");
            let _g = TestGuard::new(&LoomStorage::default());
            let add_args = ProjectAddArgs {
                name: "my-app".to_string(),
                root_path: tmp_root.path().to_string_lossy().to_string(),
            };
            let add_res = project_add(&add_args);
            assert!(add_res.is_ok());

            let del_args = ProjectDeleteArgs {
                id_or_name: "my-app".to_string(),
            };
            let del_res = project_delete(&del_args);
            assert!(del_res.is_ok());
        }

        #[test]
        fn project_reorder_cmd() {
            let p1 = Project {
                id: "p1".to_string(),
                name: "proj1".to_string(),
                root_path: PathBuf::from("/tmp/proj1"),
                env_profiles: HashMap::new(),
                quick_commands: vec![],
            };
            let p2 = Project {
                id: "p2".to_string(),
                name: "proj2".to_string(),
                root_path: PathBuf::from("/tmp/proj2"),
                env_profiles: HashMap::new(),
                quick_commands: vec![],
            };
            let config = LoomStorage {
                projects: vec![p1, p2],
                ..LoomStorage::default()
            };
            let _g = TestGuard::new(&config);
            let args = ProjectReorderArgs {
                ids: vec!["p2".to_string(), "p1".to_string()],
            };
            let result = project_reorder(&args);
            assert!(result.is_ok());
        }
    }

    // ===== Env Command Tests =====

    mod env_command {
        use super::*;

        #[test]
        fn env_list_empty() {
            let _g = TestGuard::new(&LoomStorage::default());
            let args = EnvListArgs { json: false };
            let result = env_list(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn env_set_and_delete() {
            let _g = TestGuard::new(&LoomStorage::default());
            let set_args = EnvSetArgs {
                key: "API_KEY".to_string(),
                value: "12345".to_string(),
                description: Some("test key".to_string()),
            };
            let set_res = env_set(&set_args);
            assert!(set_res.is_ok());

            let del_args = EnvDeleteArgs {
                id_or_key: "API_KEY".to_string(),
            };
            let del_res = env_delete(&del_args);
            assert!(del_res.is_ok());
        }

        #[test]
        fn env_delete_not_found() {
            let _g = TestGuard::new(&LoomStorage::default());
            let del_args = EnvDeleteArgs {
                id_or_key: "NON_EXISTENT".to_string(),
            };
            let del_res = env_delete(&del_args);
            assert!(del_res.is_err());
        }
    }

    // ===== Tool Command Tests =====

    mod tool_command {
        use super::*;

        #[test]
        fn tool_list_cmd() {
            let _g = TestGuard::with_tools(vec![make_tool("cargo", "/usr/bin/cargo", "1.70", None)]);
            let args = ListArgs {
                json: true,
                format: None,
            };
            let result = list_tools(&args);
            assert!(result.is_ok());
        }

        #[test]
        fn tool_search_cmd() {
            let _g = TestGuard::with_tools(vec![make_tool("cargo", "/usr/bin/cargo", "1.70", None)]);
            let args = SearchArgs {
                query: "car".to_string(),
                json: false,
            };
            let result = search_tools(&args);
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
