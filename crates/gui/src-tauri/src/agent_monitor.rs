use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// Cache: PTY session_id → (opencode_session_id, last_active_ms)
static SESSION_CACHE: OnceLock<Mutex<HashMap<String, (String, i64)>>> = OnceLock::new();

fn get_pty_spawn_time(pty_session_id: &str) -> Option<i64> {
    let map = crate::pty::PTY_SPAWN_TIMES.get()?;
    let guard = map.lock().ok()?;
    guard.get(pty_session_id).map(|&ts| ts as i64)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Running,
    Waiting,
    Error,
    AgentCall,
    Question,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentStateInfo {
    pub state: AgentState,
    pub session_id: String,
}

pub struct AgentMonitor;

impl AgentMonitor {
    pub fn new() -> Self {
        Self
    }

    fn get_db_path() -> Option<PathBuf> {
        if let Ok(h) = std::env::var("HOME") {
            let p = PathBuf::from(&h).join(".local/share/opencode/opencode.db");
            if p.exists() { return Some(p); }
        }
        if let Ok(h) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(&h).join(".local/share/opencode/opencode.db");
            if p.exists() { return Some(p); }
            let p2 = PathBuf::from(&h).join("AppData/Local/opencode/opencode.db");
            if p2.exists() { return Some(p2); }
        }
        if let Ok(l) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(&l).join("opencode/opencode.db");
            if p.exists() { return Some(p); }
        }
        None
    }

    pub fn poll_state(&self, workspace_dir: &str) -> Option<AgentStateInfo> {
        let idle = || AgentStateInfo {
            state: AgentState::Idle,
            session_id: String::new(),
        };

        // If DB doesn't exist or can't open, return Idle (purple)
        let db_path = match Self::get_db_path() {
            Some(p) => p,
            None => {
                eprintln!("[AgentPoll] no DB path, Idle");
                return Some(idle());
            }
        };
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AgentPoll] open DB failed: {}, Idle", e);
                return Some(idle());
            }
        };

        let pattern = format!("{}%", workspace_dir.replace('\\', "/"));
        eprintln!("[AgentPoll] workspace_dir: {}, pattern: {}", workspace_dir, pattern);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let session_id = 'outer: {
            // Only accept sessions created within the last 10 minutes
            let threshold = now.saturating_sub(10 * 60_000);
            let mut stmt = match conn.prepare("SELECT id, time_created FROM session WHERE directory LIKE ?1 AND time_created >= ?2 AND (parent_id IS NULL OR parent_id = '') ORDER BY time_created DESC LIMIT 1") {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[AgentPoll] session prepare failed: {}, Idle", e);
                    break 'outer None;
                }
            };
            let mut rows = match stmt.query(rusqlite::params![pattern, threshold]) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[AgentPoll] session query failed: {}, Idle", e);
                    break 'outer None;
                }
            };
            match rows.next() {
                Ok(Some(r)) => match r.get::<_, String>(0) {
                    Ok(id) => Some(id),
                    Err(e) => {
                        eprintln!("[AgentPoll] session row get failed: {}, Idle", e);
                        None
                    }
                },
                Ok(None) => None,
                Err(e) => {
                    eprintln!("[AgentPoll] session next failed: {}, Idle", e);
                    None
                }
            }
        };

        match session_id {
            None => {
                eprintln!("[AgentPoll] no session for workspace, Idle");
                return Some(idle());
            }
            Some(sid) => self.poll_parts(&conn, &sid),
        }
    }

    /// Check if a session is already claimed by another PTY in the cache (excluding ourselves)
    fn session_claimed_by_other(cache: &HashMap<String, (String, i64)>, session_id: &str, my_pty: &str) -> bool {
        cache.iter().any(|(pty, (sid, _))| pty != my_pty && sid == session_id)
    }

    /// Poll agent state scoped to a specific PTY terminal.
    /// Each PTY tracks its own session via cache, preventing multiple terminals
    /// from sharing the same session.
    pub fn poll_state_for_pty(&self, workspace_dir: &str, pty_session_id: &str) -> Option<AgentStateInfo> {
        let idle = || AgentStateInfo {
            state: AgentState::Idle,
            session_id: String::new(),
        };

        let db_path = match Self::get_db_path() {
            Some(p) => p,
            None => {
                eprintln!("[AgentPoll:pty={}] no DB path, Idle", pty_session_id);
                return Some(idle());
            }
        };
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AgentPoll:pty={}] open DB failed: {}, Idle", pty_session_id, e);
                return Some(idle());
            }
        };

        let pattern = format!("{}%", workspace_dir.replace('\\', "/"));
        let now = now_ms();
        let idle_timeout = 15_000; // 15s of inactivity → stale
        let cache = SESSION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

        // 1. Check cache: does this PTY already have a tracked session?
        {
            let mut guard = cache.lock().unwrap();
            if let Some((cached_sid, _last_active)) = guard.get(pty_session_id).cloned() {
                let result = self.poll_parts(&conn, &cached_sid);
                if let Some(info) = result {
                    // Check if session is still active (not idle AND not stale Waiting)
                    let is_stale = if info.state == AgentState::Waiting {
                        // Check if the latest part is older than idle_timeout
                        let latest_ts: i64 = conn
                            .query_row(
                                "SELECT time_created FROM part WHERE session_id = ?1 ORDER BY time_created DESC LIMIT 1",
                                rusqlite::params![cached_sid],
                                |row| row.get(0),
                            )
                            .unwrap_or(0);
                        now - latest_ts > idle_timeout
                    } else {
                        info.state == AgentState::Idle
                    };

                    if !is_stale {
                        guard.insert(pty_session_id.to_string(), (cached_sid, now));
                        return Some(info);
                    }
                }

                // Session is stale — remove from cache and fall through to find a new one
                eprintln!("[AgentPoll:pty={}] cached session {} stale, releasing", pty_session_id, cached_sid);
                guard.remove(pty_session_id);
            }
        }

        // 2. Find an unclaimed session for this PTY
        let spawn_time = get_pty_spawn_time(pty_session_id).unwrap_or(0);
        let threshold = now.saturating_sub(10 * 60_000).max(spawn_time);

        // Iterate sessions newest-first, pick the first not claimed by other PTYs
        let mut guard = cache.lock().unwrap();
        let session_id: Option<String> = conn
            .prepare(
                "SELECT id FROM session WHERE directory LIKE ?1 AND time_created >= ?2 AND (parent_id IS NULL OR parent_id = '') ORDER BY time_created DESC",
            )
            .ok()
            .and_then(|mut stmt| {
                let mut rows = stmt.query(rusqlite::params![pattern, threshold]).ok()?;
                loop {
                    match rows.next() {
                        Ok(Some(r)) => {
                            if let Ok(sid) = r.get::<_, String>(0) {
                                if !Self::session_claimed_by_other(&guard, &sid, pty_session_id) {
                                    return Some(sid);
                                }
                            }
                        }
                        _ => return None,
                    }
                }
            });

        match session_id {
            Some(sid) => {
                guard.insert(pty_session_id.to_string(), (sid.clone(), now));
                drop(guard);
                eprintln!("[AgentPoll:pty={}] claimed session {}", pty_session_id, sid);
                self.poll_parts(&conn, &sid)
            }
            None => {
                eprintln!("[AgentPoll:pty={}] no unclaimed session, Idle", pty_session_id);
                Some(idle())
            }
        }
    }

    fn poll_parts(&self, conn: &Connection, session_id: &str) -> Option<AgentStateInfo> {
        let mut stmt = match conn.prepare("SELECT data, time_created FROM part WHERE session_id = ?1 ORDER BY time_created DESC") {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[AgentPoll] parts query prepare failed, Idle");
                return Some(AgentStateInfo { state: AgentState::Idle, session_id: session_id.to_string() });
            }
        };
        let mut rows = match stmt.query(rusqlite::params![session_id]) {
            Ok(r) => r,
            Err(_) => {
                eprintln!("[AgentPoll] parts query failed, Idle");
                return Some(AgentStateInfo { state: AgentState::Idle, session_id: session_id.to_string() });
            }
        };

        let mut parts: Vec<(String, i64)> = Vec::new();
        loop {
            match rows.next() {
                Ok(Some(r)) => {
                    let data: String = match r.get(0) { Ok(d) => d, Err(_) => continue };
                    let ts: i64 = match r.get(1) { Ok(t) => t, Err(_) => continue };
                    parts.push((data, ts));
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }

        if parts.is_empty() {
            eprintln!("[AgentPoll] no parts, Idle, session: {}", session_id);
            return Some(AgentStateInfo { state: AgentState::Idle, session_id: session_id.to_string() });
        }

        // Scan parts for active tool status
        let (mut task_running, mut question_running) = (false, false);
        for (data, _) in &parts {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(data) {
                if val.get("type").and_then(|v| v.as_str()) != Some("tool") { continue; }
                let status = val.get("state")
                    .and_then(|s| s.get("status"))
                    .and_then(|s| s.as_str()).unwrap_or("");
                let tool_name = val.get("tool").and_then(|t| t.as_str()).unwrap_or("");
                if status == "running" {
                    if tool_name == "task" { task_running = true; }
                    else if tool_name == "question" { question_running = true; }
                }
            }
        }

        if question_running {
            eprintln!("[AgentPoll] Question, session: {}", session_id);
            return Some(AgentStateInfo { state: AgentState::Question, session_id: session_id.to_string() });
        }
        if task_running {
            eprintln!("[AgentPoll] AgentCall, session: {}", session_id);
            return Some(AgentStateInfo { state: AgentState::AgentCall, session_id: session_id.to_string() });
        }

        // Check if latest part is step-finish with reason="stop" -> Waiting
        let (latest_data, _) = &parts[0];
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(latest_data) {
            let part_type = val.get("type").and_then(|t| t.as_str());
            let reason = val.get("reason").and_then(|r| r.as_str());
            if part_type == Some("step-finish") && reason == Some("stop") {
                eprintln!("[AgentPoll] step-finish stop, Waiting, session: {}", session_id);
                return Some(AgentStateInfo { state: AgentState::Waiting, session_id: session_id.to_string() });
            }
        }

        let state = Self::parse_state(latest_data);
        eprintln!("[AgentPoll] parse_state: {:?}, parts={}, session: {}", state, parts.len(), session_id);
        Some(AgentStateInfo { state, session_id: session_id.to_string() })
    }

    pub fn reset_idle(&self) {}

    fn parse_state(data_json: &str) -> AgentState {
        let val: serde_json::Value = match serde_json::from_str(data_json) {
            Ok(v) => v,
            Err(_) => return AgentState::Running,
        };

        let part_type = match val.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => return AgentState::Running,
        };

        match part_type {
            "reasoning" => AgentState::Running,
            "tool" => {
                let tool = val.get("tool").and_then(|t| t.as_str()).unwrap_or("");
                if tool == "question" {
                    if let Some("running") = val.get("state")
                        .and_then(|s| s.get("status"))
                        .and_then(|s| s.as_str())
                    {
                        return AgentState::Question;
                    }
                }
                let status = val.get("state")
                    .and_then(|s| s.get("status"))
                    .and_then(|s| s.as_str());
                match status {
                    Some("running") => AgentState::Running,
                    Some("error") => AgentState::Error,
                    Some("completed") => AgentState::Waiting,
                    _ => AgentState::Running,
                }
            }
            "step-finish" => AgentState::Running,
            "step-start" => AgentState::Running,
            "agent" => AgentState::AgentCall,
            "text" => AgentState::Running,
            _ => AgentState::Running,
        }
    }
}

impl Default for AgentMonitor {
    fn default() -> Self {
        Self::new()
    }
}