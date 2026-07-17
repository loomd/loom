use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// Per-PTY cache: pty_session_id → (opencode_session_id, last_active_ms)
static SESSION_CACHE: OnceLock<Mutex<HashMap<String, (String, i64)>>> = OnceLock::new();

/// Session ownership lock: opencode_session_id → pty_session_id.
/// The first PTY that claims a session becomes its owner. Other PTYs
/// cannot see this session — they stay Idle instead.
static SESSION_OWNER: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

/// PTY spawn timestamps: pty_session_id → spawn_time_ms
static PTY_SPAWNS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();

/// Tracks which PTY most recently received real (non-escape) user input.
/// Only the single last-active PTY is allowed to claim new sessions.
static LAST_ACTIVE_PTY: OnceLock<Mutex<Option<(String, i64)>>> = OnceLock::new();

const ACTIVE_WINDOW_MS: i64 = 30_000;

/// Record when a PTY terminal was spawned. Sessions created before this
/// timestamp belong to a previous application run and won't be claimed.
pub fn record_pty_spawn(pty_session_id: &str) {
    PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
        .lock().unwrap()
        .insert(pty_session_id.to_string(), now_ms());
}

/// Mark a PTY as having received real (non-escape) user input.
/// Sets this PTY as the globally last-active PTY, which is the only one
/// allowed to claim new opencode sessions.
pub fn mark_pty_active(pty_session_id: &str) {
    *LAST_ACTIVE_PTY.get_or_init(|| Mutex::new(None))
        .lock().unwrap() = Some((pty_session_id.to_string(), now_ms()));
}

/// Remove a PTY's state when its terminal is closed.
pub fn cleanup_pty(pty_session_id: &str) {
    if let Some(last) = LAST_ACTIVE_PTY.get() {
        let mut guard = last.lock().unwrap();
        if let Some((id, _)) = &*guard {
            if id == pty_session_id {
                *guard = None;
            }
        }
    }
    if let Some(sp) = PTY_SPAWNS.get() {
        sp.lock().unwrap().remove(pty_session_id);
    }
    if let Some(cache) = SESSION_CACHE.get() {
        cache.lock().unwrap().remove(pty_session_id);
    }
    if let Some(owners) = SESSION_OWNER.get() {
        owners.lock().unwrap().retain(|_, v| v != pty_session_id);
    }
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

        let session_id = 'outer: {
            let mut stmt = match conn.prepare("SELECT id, time_created FROM session WHERE directory LIKE ?1 AND (parent_id IS NULL OR parent_id = '') ORDER BY time_created DESC LIMIT 1") {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[AgentPoll] session prepare failed: {}, Idle", e);
                    break 'outer None;
                }
            };
            let mut rows = match stmt.query(rusqlite::params![pattern]) {
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
                Some(idle())
            }
            Some(sid) => self.poll_parts(&conn, &sid),
        }
    }

    /// Poll agent state scoped to a specific PTY terminal.
    /// Session ownership is first-claim-first-own. A session created before
    /// the PTY was spawned belongs to a previous application run and won't
    /// be claimed — keeping the indicator dark until a new conversation starts.
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
        let cache = SESSION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let owners = SESSION_OWNER.get_or_init(|| Mutex::new(HashMap::new()));
        let spawns = PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()));

        // 1. Query the latest session for this workspace (with time_created).
        //    Do this first — we need it for both cache-hit and new-claim paths.
        let latest_info: Option<(String, i64)> = conn
            .prepare("SELECT id, time_created FROM session WHERE directory LIKE ?1 AND (parent_id IS NULL OR parent_id = '') ORDER BY time_created DESC LIMIT 1")
            .ok()
            .and_then(|mut stmt| {
                stmt.query_row(rusqlite::params![pattern], |row| {
                    let id: String = row.get(0)?;
                    let ts: i64 = row.get(1)?;
                    Ok((id, ts))
                }).ok()
            });

        let (latest_sid, session_time) = match latest_info {
            Some(info) => info,
            None => {
                eprintln!("[AgentPoll:pty={}] no session for workspace, Idle", pty_session_id);
                return Some(idle());
            }
        };

        // 2. Input gate: only the globally last-active PTY can CLAIM new sessions.
        //    Stale entries older than ACTIVE_WINDOW_MS are ignored.
        //    But if we already own a cached session, keep showing its state.
        {
            let guard = LAST_ACTIVE_PTY.get_or_init(|| Mutex::new(None))
                .lock().unwrap();
            let can_claim = match &*guard {
                Some((id, ts)) if id == pty_session_id && now - *ts <= ACTIVE_WINDOW_MS => true,
                _ => false,
            };
            if !can_claim {
                let cache_guard = cache.lock().unwrap();
                if let Some((cached, _)) = cache_guard.get(pty_session_id) {
                    eprintln!("[AgentPoll:pty={}] not active, polling cached session {}", pty_session_id, cached);
                    return self.poll_parts(&conn, cached);
                }
                eprintln!("[AgentPoll:pty={}] not active, Idle", pty_session_id);
                return Some(idle());
            }
        }

        // 3. Check cache: does this PTY already track the latest session?
        {
            let guard = cache.lock().unwrap();
            if let Some((cached, _)) = guard.get(pty_session_id) {
                if cached == &latest_sid {
                    eprintln!("[AgentPoll:pty={}] cached session {} unchanged", pty_session_id, cached);
                    return self.poll_parts(&conn, cached);
                }
                eprintln!("[AgentPoll:pty={}] latest session changed (was {}, now {}), trying to claim new session", pty_session_id, cached, latest_sid);
            }
        }

        // 4. Session from a previous run? Don't claim it.
        let spawn_time_opt = spawns.lock().unwrap().get(pty_session_id).copied();
        eprintln!("[AgentPoll:pty={}] spawn_time={:?} session_time={}", pty_session_id, spawn_time_opt, session_time);
        if let Some(spawn_time) = spawn_time_opt {
            if session_time < spawn_time {
                eprintln!("[AgentPoll:pty={}] session {} created before PTY spawn ({} < {}), not claiming", pty_session_id, latest_sid, session_time, spawn_time);
                return Some(idle());
            }
        }

        // 5. Check session ownership.
        {
            let guard = owners.lock().unwrap();
            if let Some(owner) = guard.get(&latest_sid) {
                if owner != pty_session_id {
                    eprintln!("[AgentPoll:pty={}] session {} owned by {}, fallback to cached session", pty_session_id, latest_sid, owner);
                    let cache_guard = cache.lock().unwrap();
                    if let Some((cached, _)) = cache_guard.get(pty_session_id) {
                        return self.poll_parts(&conn, cached);
                    }
                    return Some(idle());
                }
            }
        }

        // 6. Claim ownership if free.
        {
            let mut guard = owners.lock().unwrap();
            if !guard.contains_key(&latest_sid) {
                guard.insert(latest_sid.clone(), pty_session_id.to_string());
                eprintln!("[AgentPoll:pty={}] claimed session {}", pty_session_id, latest_sid);
            }
        }

        cache.lock().unwrap().insert(pty_session_id.to_string(), (latest_sid.clone(), now));
        self.poll_parts(&conn, &latest_sid)
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