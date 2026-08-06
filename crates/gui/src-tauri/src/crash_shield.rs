use std::io::Write;
use std::sync::OnceLock;

static CRASH_HANDLER: OnceLock<crash_handler::CrashHandler> = OnceLock::new();
static RESTART_CMDLINE: OnceLock<Vec<u16>> = OnceLock::new();
static LOG_PATH: OnceLock<String> = OnceLock::new();
static RESTART_COUNT: OnceLock<u32> = OnceLock::new();

const MAX_RESTARTS: u32 = 2;

pub fn install() {
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let count = std::env::args()
        .find_map(|a| {
            a.strip_prefix("--crash-restart-count=")
                .and_then(|v| v.parse::<u32>().ok())
        })
        .unwrap_or(0);
    let mut log_dir = loom_core::storage::get_config_path();
    log_dir.pop();
    let log_path = log_dir.join("crash.log").to_string_lossy().to_string();

    let _ = RESTART_COUNT.set(count);
    let _ = LOG_PATH.set(log_path);

    // Pre-build the restart command line while the heap is healthy. In the
    // crash callback we must avoid allocations (the crash is likely heap
    // corruption), so we only re-use this pre-built wide string.
    let can_restart = std::env::var("TAURI_TEST_CMD").is_err() && count < MAX_RESTARTS;
    if can_restart && !exe.is_empty() {
        let next = count + 1;
        let helper = format!(
            "cmd.exe /c \"ping -n 3 127.0.0.1 >nul & start \"\" \"{}\" --crash-restart-count={}\"",
            exe, next
        );
        let wide: Vec<u16> = helper.encode_utf16().chain(std::iter::once(0)).collect();
        let _ = RESTART_CMDLINE.set(wide);
    }

    let event = unsafe {
        crash_handler::make_crash_event(|context| {
            log_crash(context.exception_code);
            restart_now();
            crash_handler::CrashEventResult::Handled(true)
        })
    };

    if let Ok(handler) = crash_handler::CrashHandler::attach(event) {
        let _ = CRASH_HANDLER.set(handler);
        eprintln!(
            "[CrashShield] attached restart_count={} restart_armed={}",
            count,
            RESTART_CMDLINE.get().is_some()
        );
    } else {
        eprintln!("[CrashShield] attach failed");
    }
}

fn log_crash(exception_code: i32) {
    let Some(path) = LOG_PATH.get() else { return };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let count = RESTART_COUNT.get().copied().unwrap_or(0);
    let line = format!(
        "[{}] crash code=0x{:08X} restart_count={} pid={}\n",
        ts,
        exception_code as u32,
        count,
        std::process::id()
    );
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(line.as_bytes());
    }
}

fn restart_now() {
    #[cfg(target_os = "windows")]
    {
        let Some(cmdline) = RESTART_CMDLINE.get() else { return };
        let mut cmdline = cmdline.clone();

        use winapi::um::processthreadsapi::{CreateProcessW, PROCESS_INFORMATION, STARTUPINFOW};
        use winapi::um::winbase::{CREATE_BREAKAWAY_FROM_JOB, CREATE_NO_WINDOW};

        let mut si: STARTUPINFOW = unsafe { std::mem::zeroed() };
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };

        // CREATE_BREAKAWAY_FROM_JOB: this process lives in a
        // KILL_ON_JOB_CLOSE job object; without breaking away, the spawned
        // helper would be killed the moment our job handle closes on exit.
        let ok = unsafe {
            CreateProcessW(
                std::ptr::null(),
                cmdline.as_mut_ptr(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
                CREATE_BREAKAWAY_FROM_JOB | CREATE_NO_WINDOW,
                std::ptr::null_mut(),
                std::ptr::null(),
                &mut si,
                &mut pi,
            )
        };
        if ok != 0 {
            unsafe {
                winapi::um::handleapi::CloseHandle(pi.hProcess);
                winapi::um::handleapi::CloseHandle(pi.hThread);
            }
            eprintln!(
                "[CrashShield] scheduled restart #{}",
                RESTART_COUNT.get().copied().unwrap_or(0) + 1
            );
        } else {
            eprintln!(
                "[CrashShield] restart spawn failed err={}",
                std::io::Error::last_os_error()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_config_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "loom-crash-shield-test-{}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn install_respects_test_mode_and_logs_crash() {
        let dir = test_config_dir();
        let config_path = dir.join("loom.json");
        std::env::set_var("LOOM_CONFIG_PATH", &config_path);
        std::env::set_var("TAURI_TEST_CMD", "1");

        install();

        // In test mode the restart command must NOT be armed
        assert!(RESTART_CMDLINE.get().is_none());

        log_crash(0xc0000005u32 as i32);

        let log = fs::read_to_string(dir.join("crash.log")).unwrap();
        assert!(log.contains("0xC0000005"), "crash.log missing entry: {log}");

        fs::remove_dir_all(&dir).ok();
    }
}
