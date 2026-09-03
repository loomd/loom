use loom_core::storage::expand_env_vars;
use std::collections::{HashMap, VecDeque};
use std::ptr;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use winapi::ctypes::c_void;
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::processthreadsapi::*;
use winapi::um::winnt::*;

// ─── Raw Win32 Types (not all exposed by winapi 0.3.9) ───────────────────────
#[allow(clippy::upper_case_acronyms)]
type DWORD = u32;
#[allow(clippy::upper_case_acronyms)]
type BOOL = i32;
#[allow(clippy::upper_case_acronyms)]
type HRESULT = i32;
#[allow(clippy::upper_case_acronyms)]
type HPCON = *mut c_void;
#[allow(clippy::upper_case_acronyms)]
type LPWCH = *mut u16;
#[allow(clippy::upper_case_acronyms)]
type LPVOID = *mut c_void;
type SizeT = usize;

#[repr(C)]
#[derive(Clone, Copy)]
#[allow(non_snake_case, clippy::upper_case_acronyms)]
struct COORD {
    X: i16,
    Y: i16,
}

#[repr(C)]
#[allow(non_snake_case)]
struct SECURITY_ATTRIBUTES {
    nLength: DWORD,
    lpSecurityDescriptor: LPVOID,
    bInheritHandle: BOOL,
}

#[repr(C)]
#[allow(non_snake_case, clippy::upper_case_acronyms)]
struct STARTUPINFOEXW {
    StartupInfo: STARTUPINFOW,
    lpAttributeList: *mut PROC_THREAD_ATTRIBUTE_LIST,
}

#[repr(C)]
struct PROC_THREAD_ATTRIBUTE_LIST(#[allow(dead_code)] c_void);

const PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE: DWORD = 0x00020016;
const EXTENDED_STARTUPINFO_PRESENT: DWORD = 0x00080000;
const CREATE_UNICODE_ENVIRONMENT: DWORD = 0x00000400;
const STARTF_USESHOWWINDOW: DWORD = 0x00000001;
const SW_HIDE: u16 = 0;

// ─── ConPTY FFI ───────────────────────────────────────────────────────────────
extern "system" {
    fn CreatePseudoConsole(
        size: COORD,
        hInput: HANDLE,
        hOutput: HANDLE,
        dwFlags: DWORD,
        phPC: *mut HPCON,
    ) -> HRESULT;

    fn ResizePseudoConsole(hPC: HPCON, size: COORD) -> HRESULT;

    fn ClosePseudoConsole(hPC: HPCON);

    fn CreatePipe(
        lpReadAttributes: *mut HANDLE,
        lpWriteAttributes: *mut HANDLE,
        lpPipeAttributes: *mut SECURITY_ATTRIBUTES,
        nSize: DWORD,
    ) -> BOOL;

    fn ReadFile(
        hFile: HANDLE,
        lpBuffer: LPVOID,
        nNumberOfBytesToRead: DWORD,
        lpNumberOfBytesRead: *mut DWORD,
        lpOverlapped: *mut c_void,
    ) -> BOOL;

    fn WriteFile(
        hFile: HANDLE,
        lpBuffer: *const c_void,
        nNumberOfBytesToWrite: DWORD,
        lpNumberOfBytesWritten: *mut DWORD,
        lpOverlapped: *mut c_void,
    ) -> BOOL;

    fn InitializeProcThreadAttributeList(
        lpAttributeList: *mut PROC_THREAD_ATTRIBUTE_LIST,
        dwAttributeCount: DWORD,
        dwFlags: DWORD,
        lpdwSize: *mut SizeT,
    ) -> BOOL;

    fn UpdateProcThreadAttribute(
        lpAttributeList: *mut PROC_THREAD_ATTRIBUTE_LIST,
        dwFlags: DWORD,
        Attribute: usize,
        lpValue: *const c_void,
        cbSize: SizeT,
        lpPreviousValue: *mut c_void,
        lpReturnSize: *mut SizeT,
    ) -> BOOL;

    fn DeleteProcThreadAttributeList(lpAttributeList: *mut PROC_THREAD_ATTRIBUTE_LIST);

    fn CreateProcessW(
        lpApplicationName: LPWCH,
        lpCommandLine: LPWCH,
        lpProcessAttributes: *mut SECURITY_ATTRIBUTES,
        lpThreadAttributes: *mut SECURITY_ATTRIBUTES,
        bInheritHandles: BOOL,
        dwCreationFlags: DWORD,
        lpEnvironment: LPVOID,
        lpCurrentDirectory: LPWCH,
        lpStartupInfo: *const STARTUPINFOW,
        lpProcessInformation: *mut PROCESS_INFORMATION,
    ) -> BOOL;
}

// ─── Job Object ───────────────────────────────────────────────────────────────
pub struct JobObject {
    handle: HANDLE,
}

unsafe impl Send for JobObject {}
unsafe impl Sync for JobObject {}

impl JobObject {
    pub fn new() -> std::io::Result<Self> {
        unsafe {
            use winapi::um::jobapi2::{CreateJobObjectW, SetInformationJobObject};

            let handle = CreateJobObjectW(ptr::null_mut(), ptr::null());
            if handle.is_null() {
                return Err(std::io::Error::last_os_error());
            }

            let mut info = std::mem::zeroed::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;

            let res = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *mut _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if res == 0 {
                let err = std::io::Error::last_os_error();
                CloseHandle(handle);
                return Err(err);
            }

            Ok(Self { handle })
        }
    }

    pub fn assign_process(&self, process_handle: HANDLE) -> std::io::Result<()> {
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
            CloseHandle(self.handle);
        }
    }
}

pub static GLOBAL_JOB: OnceLock<JobObject> = OnceLock::new();
pub static PTY_SPAWN_TIMES: OnceLock<Mutex<HashMap<String, u128>>> = OnceLock::new();

pub fn init_process_session_job() {
    if let Ok(job) = JobObject::new() {
        unsafe {
            let current = GetCurrentProcess();
            if job.assign_process(current).is_ok() {
                let _ = GLOBAL_JOB.set(job);
            }
        }
    }
}

// ─── Terminal Buffer ──────────────────────────────────────────────────────────
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

// ─── ConPTY Handle Wrapper ────────────────────────────────────────────────────
struct RawHandle(HANDLE);
unsafe impl Send for RawHandle {}
unsafe impl Sync for RawHandle {}

struct ConPty {
    hpc: HPCON,
    stdin_write: RawHandle,
    stdout_read: RawHandle,
}

unsafe impl Send for ConPty {}
unsafe impl Sync for ConPty {}

impl ConPty {
    fn close(&mut self) {
        unsafe {
            if !self.hpc.is_null() {
                ClosePseudoConsole(self.hpc);
                self.hpc = ptr::null_mut();
            }
            if self.stdin_write.0 != INVALID_HANDLE_VALUE && !self.stdin_write.0.is_null() {
                CloseHandle(self.stdin_write.0);
                self.stdin_write.0 = INVALID_HANDLE_VALUE;
            }
            if self.stdout_read.0 != INVALID_HANDLE_VALUE && !self.stdout_read.0.is_null() {
                CloseHandle(self.stdout_read.0);
                self.stdout_read.0 = INVALID_HANDLE_VALUE;
            }
        }
    }
}

impl Drop for ConPty {
    fn drop(&mut self) {
        self.close();
    }
}

fn create_pipe_pair() -> std::io::Result<(HANDLE, HANDLE)> {
    unsafe {
        let mut read_handle: HANDLE = INVALID_HANDLE_VALUE;
        let mut write_handle: HANDLE = INVALID_HANDLE_VALUE;
        let ok = CreatePipe(&mut read_handle, &mut write_handle, ptr::null_mut(), 0);
        if ok == 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok((read_handle, write_handle))
    }
}

fn open_conpty(cols: u16, rows: u16) -> Result<ConPty, String> {
    let (stdin_read, stdin_write) =
        create_pipe_pair().map_err(|e| format!("Failed to create stdin pipe: {}", e))?;
    let (stdout_read, stdout_write) =
        create_pipe_pair().map_err(|e| format!("Failed to create stdout pipe: {}", e))?;

    let coord = COORD {
        X: cols as i16,
        Y: rows as i16,
    };

    let mut hpc: HPCON = ptr::null_mut();
    let hr = unsafe { CreatePseudoConsole(coord, stdin_read, stdout_write, 0, &mut hpc) };

    unsafe {
        CloseHandle(stdin_read);
        CloseHandle(stdout_write);
    }

    if hr != 0 {
        return Err(format!("CreatePseudoConsole failed: HRESULT 0x{:08X}", hr));
    }

    Ok(ConPty {
        hpc,
        stdin_write: RawHandle(stdin_write),
        stdout_read: RawHandle(stdout_read),
    })
}

// ─── PTY Session ──────────────────────────────────────────────────────────────
pub struct PtySession {
    conpty: Mutex<ConPty>,
    pub buffer: Arc<Mutex<TerminalBuffer>>,
    pub is_running: Arc<Mutex<bool>>,
    pub child_pid: u32,
}

#[derive(Default)]
pub struct PtyState {
    pub sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
}

// ─── Shell Detection ─────────────────────────────────────────────────────────
fn find_shell() -> String {
    let find_pwsh = || -> Option<String> {
        which::which("pwsh")
            .ok()
            .map(|p| p.to_string_lossy().to_string())
    };
    let find_powershell = || -> Option<String> {
        let sys = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
        if std::path::Path::new(sys).exists() {
            return Some(sys.to_string());
        }
        which::which("powershell")
            .ok()
            .map(|p| p.to_string_lossy().to_string())
    };
    let find_cmd = || -> String {
        let sys = "C:\\Windows\\System32\\cmd.exe";
        if std::path::Path::new(sys).exists() {
            return sys.to_string();
        }
        which::which("cmd")
            .ok()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "cmd.exe".to_string())
    };

    find_pwsh()
        .or_else(find_powershell)
        .unwrap_or_else(find_cmd)
}

// ─── Build Command Line ──────────────────────────────────────────────────────
fn build_command_line(
    shell_path: &str,
    cmd_to_run: Option<&str>,
    cmd_args: Option<&[String]>,
) -> String {
    let Some(target_cmd) = cmd_to_run else {
        return shell_path.to_string();
    };
    let path_lower = shell_path.to_lowercase();
    let is_pwsh = path_lower.contains("pwsh") || path_lower.contains("powershell");

    if is_pwsh {
        let esc = target_cmd.replace("'", "''");
        let args: Vec<String> = cmd_args
            .unwrap_or(&[])
            .iter()
            .map(|a| format!("'{}'", a.replace("'", "''")))
            .collect();
        format!("{} -NoExit -Command & '{}' {}", shell_path, esc, args.join(" "))
    } else {
        let esc = target_cmd.replace("\"", "\"\"");
        let args: Vec<String> = cmd_args
            .unwrap_or(&[])
            .iter()
            .map(|a| format!("\"{}\"", a.replace("\"", "\"\"")))
            .collect();
        format!("{} /K \"{}\" {}", shell_path, esc, args.join(" "))
    }
}

// ─── Fresh PATH from Registry ────────────────────────────────────────────────
fn fresh_path_value() -> Option<String> {
    use loom_core::storage::manager::registry_path_entries;
    let mut segments: Vec<String> = registry_path_entries();
    if let Ok(path_val) = std::env::var("PATH") {
        segments.extend(std::env::split_paths(&path_val).map(|p| p.to_string_lossy().to_string()));
    }
    let mut seen = std::collections::HashSet::new();
    segments.retain(|s| !s.is_empty() && seen.insert(s.clone()));
    if segments.is_empty() {
        None
    } else {
        Some(segments.join(";"))
    }
}

// ─── Core Spawn ───────────────────────────────────────────────────────────────
#[allow(clippy::too_many_arguments)]
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

    let shell_exe = find_shell();
    let conpty = open_conpty(cols, rows)?;

    let mut merged_envs: HashMap<String, String> = std::env::vars().collect();
    if let Some(fresh_path) = fresh_path_value() {
        merged_envs.insert("PATH".to_string(), fresh_path);
    }
    if let Some(ref custom_envs) = env {
        for (key, val) in custom_envs {
            merged_envs.insert(key.clone(), val.clone());
        }
    }

    let expanded_args = args.as_ref().map(|raw_args| {
        raw_args
            .iter()
            .map(|arg| expand_env_vars(arg, &merged_envs))
            .collect::<Vec<String>>()
    });

    let cmd_line = build_command_line(&shell_exe, command.as_deref(), expanded_args.as_deref());
    let env_block = build_env_block(&merged_envs);
    let work_dir = cwd
        .as_ref()
        .filter(|d| !d.is_empty())
        .map(|d| d.replace("/", "\\"));

    let stdout_read_val = conpty.stdout_read.0 as usize;

    let child_pid =
        create_process_with_pty(&cmd_line, &env_block, work_dir.as_deref(), conpty.hpc)?;

    let ring_buffer = Arc::new(Mutex::new(TerminalBuffer::new(1024 * 512)));
    let is_running = Arc::new(Mutex::new(true));

    let session = Arc::new(PtySession {
        conpty: Mutex::new(conpty),
        buffer: ring_buffer.clone(),
        is_running: is_running.clone(),
        child_pid,
    });

    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id.clone(), session.clone());

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    PTY_SPAWN_TIMES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .insert(session_id.clone(), now);

    // Read loop thread
    let session_id_clone = session_id.clone();
    let is_running_clone = is_running.clone();

    std::thread::spawn(move || {
        let stdout_handle = stdout_read_val as HANDLE;
        let mut buffer = [0u8; 4096];
        while *is_running_clone.lock().unwrap() {
            let mut bytes_read: DWORD = 0;
            let ok = unsafe {
                ReadFile(
                    stdout_handle,
                    buffer.as_mut_ptr() as LPVOID,
                    buffer.len() as DWORD,
                    &mut bytes_read,
                    ptr::null_mut(),
                )
            };
            if ok == 0 || bytes_read == 0 {
                break;
            }
            let chunk = &buffer[..bytes_read as usize];
            ring_buffer.lock().unwrap().write(chunk);
            let _ = app.emit(&format!("pty-data-{}", session_id_clone), chunk.to_vec());
        }
        *is_running_clone.lock().unwrap() = false;
        let _ = app.emit(&format!("pty-exit-{}", session_id_clone), ());
    });

    Ok(())
}

fn build_env_block(envs: &HashMap<String, String>) -> Vec<u16> {
    let mut block = Vec::new();
    for (key, val) in envs {
        for c in format!("{}={}", key, val).encode_utf16() {
            block.push(c);
        }
        block.push(0);
    }
    block.push(0);
    block
}

fn create_process_with_pty(
    cmd_line: &str,
    env_block: &[u16],
    cwd: Option<&str>,
    hpc: HPCON,
) -> Result<u32, String> {
    unsafe {
        let si_size = std::mem::size_of::<STARTUPINFOEXW>();
        let mut si_ex: STARTUPINFOEXW = std::mem::zeroed();
        si_ex.StartupInfo.cb = si_size as u32;
        si_ex.StartupInfo.dwFlags = STARTF_USESHOWWINDOW;
        si_ex.StartupInfo.wShowWindow = SW_HIDE;

        let mut attr_list_size: SizeT = 0;
        InitializeProcThreadAttributeList(ptr::null_mut(), 1, 0, &mut attr_list_size);

        let mut attr_list_bytes = vec![0u8; attr_list_size];
        let attr_list = attr_list_bytes.as_mut_ptr() as *mut PROC_THREAD_ATTRIBUTE_LIST;

        let ok = InitializeProcThreadAttributeList(attr_list, 1, 0, &mut attr_list_size);
        if ok == 0 {
            return Err(format!(
                "InitializeProcThreadAttributeList failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        let ok = UpdateProcThreadAttribute(
            attr_list,
            0,
            PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE as usize,
            hpc as LPVOID,
            std::mem::size_of::<HPCON>(),
            ptr::null_mut(),
            ptr::null_mut(),
        );
        if ok == 0 {
            DeleteProcThreadAttributeList(attr_list);
            return Err(format!(
                "UpdateProcThreadAttribute failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        si_ex.lpAttributeList = attr_list;

        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let mut cmd_wide: Vec<u16> = cmd_line.encode_utf16().chain(std::iter::once(0)).collect();
        let mut cwd_wide: Option<Vec<u16>> =
            cwd.map(|d| d.encode_utf16().chain(std::iter::once(0)).collect());
        let cwd_ptr = cwd_wide
            .as_mut()
            .map(|w| w.as_mut_ptr())
            .unwrap_or(ptr::null_mut());

        let flags = EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT;

        let ok = CreateProcessW(
            ptr::null_mut(),
            cmd_wide.as_mut_ptr(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
            flags,
            env_block.as_ptr() as LPVOID,
            cwd_ptr,
            &si_ex.StartupInfo,
            &mut pi,
        );

        DeleteProcThreadAttributeList(attr_list);

        if ok == 0 {
            return Err(format!(
                "CreateProcessW failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        Ok(pi.dwProcessId)
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────
#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    crate::agent_monitor::record_pty_spawn(&session_id);
    spawn_pty_session(app, state.inner(), session_id, command, args, env, cwd, cols, rows)
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

    if !data.is_empty() && data[0] != 0x1B {
        crate::agent_monitor::mark_pty_active(&session_id);
    }

    let conpty = session.conpty.lock().unwrap();
    let mut bytes_written: DWORD = 0;
    let ok = unsafe {
        WriteFile(
            conpty.stdin_write.0,
            data.as_ptr() as *const c_void,
            data.len() as DWORD,
            &mut bytes_written,
            ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(format!("Failed to write: {}", std::io::Error::last_os_error()));
    }
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

    let conpty = session.conpty.lock().unwrap();
    let coord = COORD {
        X: cols as i16,
        Y: rows as i16,
    };
    let hr = unsafe { ResizePseudoConsole(conpty.hpc, coord) };
    if hr != 0 {
        return Err(format!("Resize failed: HRESULT 0x{:08X}", hr));
    }
    Ok(())
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
        // 先显式关闭 ConPTY 管道与伪终端句柄，促使阻塞在 ReadFile 的读线程立即收到 EOF 退出，杜绝 UAF 悬垂句柄
        if let Ok(mut conpty) = s.conpty.lock() {
            conpty.close();
        }
        let pid = s.child_pid;
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if !handle.is_null() {
                TerminateProcess(handle, 1);
                CloseHandle(handle);
            }
        }
    }
    crate::agent_monitor::cleanup_pty(&session_id);
    Ok(())
}
