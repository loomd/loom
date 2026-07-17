use loom_core::storage::expand_env_vars;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

// Job Object Helper for Process Tree Cleanup on Windows
pub struct JobObject {
    handle: winapi::um::winnt::HANDLE,
}

unsafe impl Send for JobObject {}
unsafe impl Sync for JobObject {}

impl JobObject {
    pub fn new() -> std::io::Result<Self> {
        unsafe {
            use std::ptr;
            use winapi::um::jobapi2::{CreateJobObjectW, SetInformationJobObject};
            use winapi::um::winnt::{
                JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            };

            let handle = CreateJobObjectW(ptr::null_mut(), ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error());
            }

            let mut info = std::mem::zeroed::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | winapi::um::winnt::JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;

            let res = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *mut _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if res == 0 {
                let err = std::io::Error::last_os_error();
                winapi::um::handleapi::CloseHandle(handle);
                return Err(err);
            }

            Ok(Self { handle })
        }
    }

    pub fn assign_process(&self, process_handle: winapi::um::winnt::HANDLE) -> std::io::Result<()> {
        unsafe {
            use winapi::um::jobapi2::AssignProcessToJobObject;
            let res = AssignProcessToJobObject(self.handle, process_handle);
            if res == 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        }
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        unsafe {
            winapi::um::handleapi::CloseHandle(self.handle);
        }
    }
}

pub static GLOBAL_JOB: OnceLock<JobObject> = OnceLock::new();

#[cfg(target_os = "windows")]
pub fn init_process_session_job() {
    if let Ok(job) = JobObject::new() {
        unsafe {
            let current = winapi::um::processthreadsapi::GetCurrentProcess();
            if job.assign_process(current).is_ok() {
                let _ = GLOBAL_JOB.set(job);
            }
        }
    }
}

// Byte-based Terminal Buffer for redrawing
pub struct TerminalBuffer {
    buffer: VecDeque<u8>,
    max_bytes: usize,
}

impl TerminalBuffer {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(max_bytes),
            max_bytes,
        }
    }

    pub fn write(&mut self, data: &[u8]) {
        if data.len() >= self.max_bytes {
            self.buffer.clear();
            let start = data.len() - self.max_bytes;
            self.buffer.extend(&data[start..]);
            return;
        }

        let overflow = (self.buffer.len() + data.len()).saturating_sub(self.max_bytes);
        if overflow > 0 {
            self.buffer.drain(0..overflow);
        }
        self.buffer.extend(data);
    }

    pub fn get_history(&self) -> Vec<u8> {
        self.buffer.iter().copied().collect()
    }
}

// Active PTY Handle struct
pub struct PtySession {
    pub pty_master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    pub stdin_writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub buffer: Arc<Mutex<TerminalBuffer>>,
    pub is_running: Arc<Mutex<bool>>,
}

#[derive(Default)]
pub struct PtyState {
    pub sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
}

/// Builds the terminal shell arguments to execute the command on startup
/// while keeping the shell open and interactive afterwards.
pub fn build_shell_args(
    shell_path: &str,
    cmd_to_run: Option<&str>,
    cmd_args: Option<&[String]>,
) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(target_cmd) = cmd_to_run {
        let path_lower = shell_path.to_lowercase();
        let is_pwsh = path_lower.contains("pwsh") || path_lower.contains("powershell");
        let is_cmd = path_lower.contains("cmd.exe") || path_lower.ends_with("cmd");

        if is_pwsh {
            let escaped_exe = target_cmd.replace("'", "''");
            let escaped_args: Vec<String> = cmd_args
                .unwrap_or(&[])
                .iter()
                .map(|a| format!("'{}'", a.replace("'", "''")))
                .collect();
            let command_str = format!("& '{}' {}", escaped_exe, escaped_args.join(" "));
            args.push("-NoExit".to_string());
            args.push("-Command".to_string());
            args.push(command_str);
        } else if is_cmd {
            let escaped_exe = target_cmd.replace("\"", "\"\"");
            let escaped_args: Vec<String> = cmd_args
                .unwrap_or(&[])
                .iter()
                .map(|a| format!("\"{}\"", a.replace("\"", "\"\"")))
                .collect();
            let command_str = format!("\"{}\" {}", escaped_exe, escaped_args.join(" "));
            args.push("/K".to_string());
            args.push(command_str);
        } else {
            // Unix fallback (bash/zsh/sh/etc): execute the command, then exec a new shell to keep PTY interactive
            let escaped_exe = target_cmd.replace("'", "'\\''");
            let escaped_args: Vec<String> = cmd_args
                .unwrap_or(&[])
                .iter()
                .map(|a| format!("'{}'", a.replace("'", "'\\''")))
                .collect();
            let command_str = format!(
                "'{}' {}; exec {}",
                escaped_exe,
                escaped_args.join(" "),
                shell_path
            );
            args.push("-c".to_string());
            args.push(command_str);
        }
    }
    args
}



// Core PTY spawn function
pub fn spawn_pty_session(
    app: AppHandle,
    state: &PtyState,
    session_id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let cols = if cols == 0 { 80 } else { cols };
    let rows = if rows == 0 { 24 } else { rows };

    let pty_system = native_pty_system();
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Always spawn the default system shell instead of running the tool executable directly.
    let shell_exe = {
        #[cfg(target_os = "windows")]
        {
            // Detect shell with priority: pwsh -> powershell -> cmd
            let find_pwsh = || -> Option<String> {
                // Check PATH first (covers Microsoft Store installs, custom paths, etc.)
                if let Ok(path) = which::which("pwsh") {
                    return Some(path.to_string_lossy().to_string());
                }
                None
            };

            let find_powershell = || -> Option<String> {
                let system32_powershell =
                    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
                if std::path::Path::new(system32_powershell).exists() {
                    return Some(system32_powershell.to_string());
                }
                if let Ok(path) = which::which("powershell") {
                    return Some(path.to_string_lossy().to_string());
                }
                None
            };

            let find_cmd = || -> String {
                let system32_cmd = "C:\\Windows\\System32\\cmd.exe";
                if std::path::Path::new(system32_cmd).exists() {
                    return system32_cmd.to_string();
                }
                if let Ok(path) = which::which("cmd") {
                    return path.to_string_lossy().to_string();
                }
                "cmd.exe".to_string()
            };

            if let Some(pwsh) = find_pwsh() {
                pwsh
            } else if let Some(ps) = find_powershell() {
                ps
            } else {
                find_cmd()
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
    };

    let mut cmd_builder = CommandBuilder::new(&shell_exe);

    // Explicitly inherit all parent environment variables to avoid missing DLL crashes on Windows
    for (key, val) in std::env::vars() {
        cmd_builder.env(key, val);
    }

    // Merge template-specific environment overrides if provided
    let mut merged_envs = HashMap::new();
    for (key, val) in std::env::vars() {
        merged_envs.insert(key, val);
    }
    if let Some(ref custom_envs) = env {
        for (key, val) in custom_envs {
            merged_envs.insert(key.clone(), val.clone());
        }
    }

    if let Some(custom_envs) = env {
        for (key, val) in custom_envs {
            cmd_builder.env(key, val);
        }
    }

    // Resolve parameter arguments inside the interactive shell
    let expanded_args = args.as_ref().map(|raw_args| {
        raw_args
            .iter()
            .map(|arg| expand_env_vars(arg, &merged_envs))
            .collect::<Vec<String>>()
    });

    let shell_args = build_shell_args(&shell_exe, command.as_deref(), expanded_args.as_deref());
    if !shell_args.is_empty() {
        cmd_builder.args(shell_args);
    }

    if let Some(ref dir) = cwd {
        if !dir.is_empty() {
            let clean_dir = dir.replace("/", "\\");
            cmd_builder.cwd(clean_dir);
        }
    }

    let pty_slave = pair.slave;
    let _child = pty_slave
        .spawn_command(cmd_builder)
        .map_err(|e| format!("Failed to spawn child: {}", e))?;

    // Drop slave to prevent stdout hang on read
    drop(pty_slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    let ring_buffer = Arc::new(Mutex::new(TerminalBuffer::new(1024 * 512))); // 512 KB buffer limit
    let is_running = Arc::new(Mutex::new(true));

    let session = Arc::new(PtySession {
        pty_master: Mutex::new(pair.master),
        stdin_writer: Arc::new(Mutex::new(writer)),
        buffer: ring_buffer.clone(),
        is_running: is_running.clone(),
    });

    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), session);

    // Read loop thread
    let session_id_clone = session_id.clone();
    let is_running_clone = is_running.clone();

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buffer = [0u8; 4096];
        while *is_running_clone.lock().unwrap() {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = &buffer[..n];
                    ring_buffer.lock().unwrap().write(chunk);

                    // Emit binary blob directly to frontend via Tauri 2.0
                    let _ = app.emit(&format!("pty-data-{}", session_id_clone), chunk.to_vec());
                }
                Err(_) => break,
            }
        }
        *is_running_clone.lock().unwrap() = false;
        let _ = app.emit(&format!("pty-exit-{}", session_id_clone), ());
    });

    Ok(())
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    session_id: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    spawn_pty_session(app, &state, session_id, command, args, env, cwd, cols, rows)
}
#[tauri::command]
pub fn pty_write(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Session not found".to_string())?;

    let mut writer = session.stdin_writer.lock().unwrap();
    writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Session not found".to_string())?;

    let res = session
        .pty_master
        .lock()
        .unwrap()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e));
    res
}

#[tauri::command]
pub fn pty_history(
    state: tauri::State<'_, PtyState>,
    session_id: String,
) -> Result<Vec<u8>, String> {
    let session = state
        .sessions
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "Session not found".to_string())?;

    let history = session.buffer.lock().unwrap().get_history();
    Ok(history)
}

#[tauri::command]
pub fn pty_close(state: tauri::State<'_, PtyState>, session_id: String) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().remove(&session_id);
    if let Some(s) = session {
        *s.is_running.lock().unwrap() = false;
    }
    Ok(())
}
