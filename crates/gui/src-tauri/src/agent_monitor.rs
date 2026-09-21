use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Thinking,
    Running,
    Waiting,
    Error,
    AgentCall,
    Question,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStateInfo {
    pub state: AgentState,
    pub session_id: String,
}

/// Monotonic counter to resolve sub-millisecond input ordering.
static ACTIVE_SEQ: AtomicU64 = AtomicU64::new(1);

/// Global tracking of active PTY and session ownership.
///
/// Multi-PTY resolution rules:
/// 1. PTY must be registered via `register_pty(pty_session_id)` at spawn time.
/// 2. PTY is marked active on user input via `mark_pty_active(pty_session_id)`.
/// 3. A session is claimed by the first active PTY whose spawn timestamp <= session's last activity.
/// 4. Once claimed, a session is locked to that PTY until ownership is transferred.
/// 5. When a PTY receives input and the latest session is active after its spawn time,
///    it can CLAIM the session or TRANSFER ownership from another PTY.
/// 6. A PTY that lost its claimed session automatically drops back to Waiting.
/// 7. Sessions created before a PTY was spawned cannot be claimed by that PTY.
static LAST_ACTIVE_PTY: OnceLock<Mutex<Option<(String, i64)>>> = OnceLock::new();
/// Maps pty_session_id -> (last_input_timestamp_ms, seq)
static PTY_LAST_ACTIVE: OnceLock<Mutex<HashMap<String, (i64, u64)>>> = OnceLock::new();
/// Maps pty_session_id -> agent_type (e.g. "opencode" or "mcode")
static PTY_AGENT_TYPE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
/// Maps pty_session_id -> (claimed_session_id, last_polled_ts)
static SESSION_CACHE: OnceLock<Mutex<HashMap<String, (String, i64)>>> = OnceLock::new();
/// Maps session_id -> owning_pty_session_id (exclusive ownership)
static SESSION_OWNER: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
/// Maps pty_session_id -> spawn_timestamp_ms
static PTY_SPAWNS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();

/// Time window (ms) during which a PTY's input is considered "active".
/// 30 seconds covers user thinking time between prompt submissions.
const ACTIVE_WINDOW_MS: i64 = 30_000;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Call when a new PTY session is spawned. Records its creation time.
pub fn register_pty(pty_session_id: &str) {
    let now = now_ms();
    let spawns = PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()));
    spawns.lock().unwrap().insert(pty_session_id.to_string(), now);
    eprintln!("[AgentPoll:register_pty] {} at {}", pty_session_id, now);
}

/// Alias for register_pty used by pty spawning logic
pub fn record_pty_spawn(pty_session_id: &str) {
    register_pty(pty_session_id);
}

/// Call when user sends input to a PTY session.
pub fn mark_pty_active(pty_session_id: &str) {
    let now = now_ms();
    let seq = ACTIVE_SEQ.fetch_add(1, Ordering::SeqCst);
    let cell = LAST_ACTIVE_PTY.get_or_init(|| Mutex::new(None));
    *cell.lock().unwrap() = Some((pty_session_id.to_string(), now));

    let active_map = PTY_LAST_ACTIVE.get_or_init(|| Mutex::new(HashMap::new()));
    active_map.lock().unwrap().insert(pty_session_id.to_string(), (now, seq));

    // Also ensure it's registered in PTY_SPAWNS if not already
    let spawns = PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut spawns_guard = spawns.lock().unwrap();
    spawns_guard.entry(pty_session_id.to_string()).or_insert(now);
}

/// Call when a PTY session is closed to clean up its ownership.
pub fn cleanup_pty(pty_session_id: &str) {
    if let Some(spawns) = PTY_SPAWNS.get() {
        spawns.lock().unwrap().remove(pty_session_id);
    }
    if let Some(active_map) = PTY_LAST_ACTIVE.get() {
        active_map.lock().unwrap().remove(pty_session_id);
    }
    if let Some(types) = PTY_AGENT_TYPE.get() {
        types.lock().unwrap().remove(pty_session_id);
    }
    if let Some(cache) = SESSION_CACHE.get() {
        if let Some((sess_id, _)) = cache.lock().unwrap().remove(pty_session_id) {
            if let Some(owners) = SESSION_OWNER.get() {
                let mut owners_guard = owners.lock().unwrap();
                if owners_guard.get(&sess_id).map(|s| s.as_str()) == Some(pty_session_id) {
                    owners_guard.remove(&sess_id);
                }
            }
        }
    }
    if let Some(cell) = LAST_ACTIVE_PTY.get() {
        let mut guard = cell.lock().unwrap();
        if let Some((id, _)) = &*guard {
            if id == pty_session_id {
                *guard = None;
            }
        }
    }
}

pub struct AgentMonitor;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionSource {
    OpenCode,
    Mcode,
}

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

    fn get_mcode_db_path() -> Option<PathBuf> {
        if let Ok(dir) = std::env::var("MINIMAX_DATA_DIR") {
            let p = PathBuf::from(dir).join("v2").join("sqlite").join("runtime-state.sqlite");
            if p.exists() { return Some(p); }
        }
        if let Ok(h) = std::env::var("USERPROFILE") {
            let p = PathBuf::from(&h).join(".minimax").join("v2").join("sqlite").join("runtime-state.sqlite");
            if p.exists() { return Some(p); }
        }
        if let Ok(h) = std::env::var("HOME") {
            let p = PathBuf::from(&h).join(".minimax").join("v2").join("sqlite").join("runtime-state.sqlite");
            if p.exists() { return Some(p); }
        }
        None
    }

    fn open_readonly_conn(db_path: &PathBuf) -> Result<Connection, rusqlite::Error> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI;
        let conn = Connection::open_with_flags(db_path, flags)?;
        let _ = conn.execute_batch("PRAGMA query_only = ON;");
        Ok(conn)
    }

    fn find_latest_opencode_session(conn: &Connection, workspace_dir: &str) -> Option<(String, i64)> {
        let pattern = format!("{}%", workspace_dir.replace('\\', "/"));
        let mut stmt = conn.prepare(
            "SELECT s.id, COALESCE(MAX(p.time_created), s.time_created) AS last_active \
             FROM session s \
             LEFT JOIN part p ON p.session_id = s.id \
             WHERE s.directory LIKE ?1 AND (s.parent_id IS NULL OR s.parent_id = '') \
             GROUP BY s.id \
             ORDER BY last_active DESC LIMIT 1"
        ).ok()?;
        stmt.query_row(rusqlite::params![pattern], |row| {
            let id: String = row.get(0)?;
            let ts: i64 = row.get(1)?;
            Ok((id, ts))
        }).ok()
    }

    fn find_latest_mcode_session(conn: &Connection, workspace_dir: &str) -> Option<(String, i64)> {
        let ws_clean = workspace_dir.trim().to_lowercase();
        let ws_backslash = ws_clean.replace('/', "\\");
        let ws_slash = ws_clean.replace('\\', "/");
        let pattern_slash = format!("{}%", ws_slash);
        let pattern_backslash = format!("{}%", ws_backslash);

        let mut stmt = conn.prepare(
            "SELECT session_id, updated_at_ms \
             FROM local_runtime_sessions \
             WHERE ( \
                 REPLACE(LOWER(workspace_dir), '/', '\\') = ?1 \
                 OR REPLACE(LOWER(project_workspace_dir), '/', '\\') = ?1 \
                 OR REPLACE(LOWER(workspace_dir), '\\', '/') = ?2 \
                 OR REPLACE(LOWER(project_workspace_dir), '\\', '/') = ?2 \
                 OR LOWER(workspace_dir) LIKE ?3 \
                 OR LOWER(project_workspace_dir) LIKE ?3 \
                 OR LOWER(workspace_dir) LIKE ?4 \
                 OR LOWER(project_workspace_dir) LIKE ?4 \
             ) \
             AND (parent_session_id IS NULL OR parent_session_id = '') \
             ORDER BY updated_at_ms DESC LIMIT 1"
        ).ok()?;

        stmt.query_row(
            rusqlite::params![ws_backslash, ws_slash, pattern_slash, pattern_backslash],
            |row| {
                let id: String = row.get(0)?;
                let ts: i64 = row.get(1)?;
                Ok((id, ts))
            }
        ).ok()
    }

    pub fn poll_state(&self, workspace_dir: &str, agent_type: Option<&str>) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let opencode_conn = Self::get_db_path().and_then(|p| Self::open_readonly_conn(&p).ok());
        let mcode_conn = Self::get_mcode_db_path().and_then(|p| Self::open_readonly_conn(&p).ok());

        if opencode_conn.is_none() && mcode_conn.is_none() {
            eprintln!("[AgentPoll] no DB path, Waiting");
            return Some(waiting());
        }

        self.poll_state_with_conns(opencode_conn.as_ref(), mcode_conn.as_ref(), workspace_dir, agent_type)
    }

    pub fn poll_state_with_conns(
        &self,
        opencode_conn: Option<&Connection>,
        mcode_conn: Option<&Connection>,
        workspace_dir: &str,
        agent_type: Option<&str>,
    ) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let is_opencode = agent_type.is_none_or(|t| t.eq_ignore_ascii_case("opencode"));
        let is_mcode = agent_type.is_none_or(|t| t.eq_ignore_ascii_case("mcode"));

        let mut latest_opencode = None;
        if is_opencode {
            if let Some(conn) = opencode_conn {
                latest_opencode = Self::find_latest_opencode_session(conn, workspace_dir);
            }
        }

        let mut latest_mcode = None;
        if is_mcode {
            if let Some(conn) = mcode_conn {
                latest_mcode = Self::find_latest_mcode_session(conn, workspace_dir);
            }
        }

        let chosen = match (latest_opencode, latest_mcode) {
            (Some((oid, ots)), Some((mid, mts))) => {
                if mts >= ots {
                    Some((mid, SessionSource::Mcode))
                } else {
                    Some((oid, SessionSource::OpenCode))
                }
            }
            (Some((oid, _)), None) => Some((oid, SessionSource::OpenCode)),
            (None, Some((mid, _))) => Some((mid, SessionSource::Mcode)),
            (None, None) => None,
        };

        match chosen {
            Some((sid, SessionSource::OpenCode)) => {
                if let Some(conn) = opencode_conn {
                    self.poll_parts(conn, &sid)
                } else {
                    Some(waiting())
                }
            }
            Some((sid, SessionSource::Mcode)) => {
                if let Some(conn) = mcode_conn {
                    self.poll_mcode_parts(conn, &sid)
                } else {
                    Some(waiting())
                }
            }
            None => {
                eprintln!("[AgentPoll] no session for workspace, Waiting");
                Some(waiting())
            }
        }
    }

    /// Legacy single-connection helper (primarily used in tests)
    #[allow(dead_code)]
    pub fn poll_state_with_conn(&self, conn: &Connection, workspace_dir: &str) -> Option<AgentStateInfo> {
        self.poll_state_with_conns(Some(conn), None, workspace_dir, None)
    }

    /// Poll agent state scoped to a specific PTY terminal.
    pub fn poll_state_for_pty(&self, workspace_dir: &str, pty_session_id: &str, agent_type: Option<&str>) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let opencode_conn = Self::get_db_path().and_then(|p| Self::open_readonly_conn(&p).ok());
        let mcode_conn = Self::get_mcode_db_path().and_then(|p| Self::open_readonly_conn(&p).ok());

        if opencode_conn.is_none() && mcode_conn.is_none() {
            eprintln!("[AgentPoll:pty={}] no DB path, Waiting", pty_session_id);
            return Some(waiting());
        }

        self.poll_state_for_pty_with_conns(opencode_conn.as_ref(), mcode_conn.as_ref(), workspace_dir, pty_session_id, agent_type)
    }

    pub fn poll_state_for_pty_with_conns(
        &self,
        opencode_conn: Option<&Connection>,
        mcode_conn: Option<&Connection>,
        workspace_dir: &str,
        pty_session_id: &str,
        agent_type: Option<&str>,
    ) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let now = now_ms();
        let cache = SESSION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let owners = SESSION_OWNER.get_or_init(|| Mutex::new(HashMap::new()));
        let spawns = PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()));

        let is_opencode = agent_type.is_none_or(|t| t.eq_ignore_ascii_case("opencode"));
        let is_mcode = agent_type.is_none_or(|t| t.eq_ignore_ascii_case("mcode"));

        let poll_by_sid = |sid: &str| -> Option<AgentStateInfo> {
            if sid.starts_with("mvs_") || opencode_conn.is_none() {
                if let Some(conn) = mcode_conn {
                    return self.poll_mcode_parts(conn, sid);
                }
            }
            if let Some(conn) = opencode_conn {
                return self.poll_parts(conn, sid);
            }
            if let Some(conn) = mcode_conn {
                return self.poll_mcode_parts(conn, sid);
            }
            Some(waiting())
        };

        // If agent_type is specified, ensure any existing cached session matches that agent type.
        if let Some(at) = agent_type {
            let mut cache_guard = cache.lock().unwrap();
            if let Some((cached, _)) = cache_guard.get(pty_session_id) {
                let cached_is_mcode = cached.starts_with("mvs_");
                let mismatch = if at.eq_ignore_ascii_case("opencode") {
                    cached_is_mcode
                } else if at.eq_ignore_ascii_case("mcode") {
                    !cached_is_mcode
                } else {
                    false
                };
                if mismatch {
                    let old_sid = cached.clone();
                    cache_guard.remove(pty_session_id);
                    let mut owners_guard = owners.lock().unwrap();
                    if owners_guard.get(&old_sid).map(|s| s.as_str()) == Some(pty_session_id) {
                        owners_guard.remove(&old_sid);
                    }
                }
            }
        }

        // 1. Query the latest active session for this workspace (filtered by agent_type if specified)
        let opencode_latest = if is_opencode {
            opencode_conn.and_then(|conn| Self::find_latest_opencode_session(conn, workspace_dir))
        } else {
            None
        };
        let mcode_latest = if is_mcode {
            mcode_conn.and_then(|conn| Self::find_latest_mcode_session(conn, workspace_dir))
        } else {
            None
        };

        let latest_info = match (opencode_latest, mcode_latest) {
            (Some((oid, ots)), Some((mid, mts))) => {
                if mts >= ots {
                    Some((mid, mts, SessionSource::Mcode))
                } else {
                    Some((oid, ots, SessionSource::OpenCode))
                }
            }
            (Some((oid, ots)), None) => Some((oid, ots, SessionSource::OpenCode)),
            (None, Some((mid, mts))) => Some((mid, mts, SessionSource::Mcode)),
            (None, None) => None,
        };

        let (latest_sid, last_active_time, latest_source) = match latest_info {
            Some(info) => info,
            None => {
                eprintln!("[AgentPoll:pty={}] no session for workspace ({:?}), Waiting", pty_session_id, agent_type);
                return Some(waiting());
            }
        };

        // 2. Input gate: check if this PTY is active and is the latest active for this agent type.
        {
            if let Some(at) = agent_type {
                let types = PTY_AGENT_TYPE.get_or_init(|| Mutex::new(HashMap::new()));
                types.lock().unwrap().insert(pty_session_id.to_string(), at.to_string());
            }

            let (pty_last_active, my_seq) = PTY_LAST_ACTIVE.get_or_init(|| Mutex::new(HashMap::new()))
                .lock().unwrap()
                .get(pty_session_id)
                .copied()
                .unwrap_or((0, 0));

            let is_recent = now - pty_last_active <= ACTIVE_WINDOW_MS;

            let is_most_recent_for_type = {
                let active_map = PTY_LAST_ACTIVE.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
                let types_map = PTY_AGENT_TYPE.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
                let my_type = agent_type.map(|s| s.to_string()).or_else(|| types_map.get(pty_session_id).cloned());

                let mut more_recent_peer = false;
                for (other_pty, (other_ts, other_seq)) in active_map.iter() {
                    if other_pty != pty_session_id && (*other_ts, *other_seq) > (pty_last_active, my_seq) && now - *other_ts <= ACTIVE_WINDOW_MS {
                        let other_type = types_map.get(other_pty).cloned();
                        let is_peer = match (&my_type, &other_type) {
                            (Some(t1), Some(t2)) => t1.eq_ignore_ascii_case(t2),
                            (None, None) => true,
                            _ => false,
                        };
                        if is_peer {
                            more_recent_peer = true;
                            break;
                        }
                    }
                }
                !more_recent_peer
            };

            let can_claim = is_recent && is_most_recent_for_type;
            if !can_claim {
                let cache_guard = cache.lock().unwrap();
                if let Some((cached, _)) = cache_guard.get(pty_session_id) {
                    let owners_guard = owners.lock().unwrap();
                    if let Some(owner) = owners_guard.get(cached) {
                        if owner != pty_session_id {
                            eprintln!("[AgentPoll:pty={}] cached session {} transferred to {}, reverting to Waiting", pty_session_id, cached, owner);
                            drop(owners_guard);
                            drop(cache_guard);
                            cache.lock().unwrap().remove(pty_session_id);
                            return Some(waiting());
                        }
                    }
                    eprintln!("[AgentPoll:pty={}] not active, polling cached session {}", pty_session_id, cached);
                    return poll_by_sid(cached);
                }
                eprintln!("[AgentPoll:pty={}] not active, Waiting", pty_session_id);
                return Some(waiting());
            }
        }

        // 3. Check cache: does this PTY already track the latest session?
        {
            let guard = cache.lock().unwrap();
            if let Some((cached, _)) = guard.get(pty_session_id) {
                if cached == &latest_sid {
                    eprintln!("[AgentPoll:pty={}] cached session {} unchanged", pty_session_id, cached);
                    return poll_by_sid(cached);
                }
                eprintln!("[AgentPoll:pty={}] latest session changed (was {}, now {}), trying to claim new session", pty_session_id, cached, latest_sid);
            }
        }

        // 4. Session inactive before PTY spawn? Don't claim it.
        let spawn_time_opt = spawns.lock().unwrap().get(pty_session_id).copied();
        eprintln!("[AgentPoll:pty={}] spawn_time={:?} last_active_time={}", pty_session_id, spawn_time_opt, last_active_time);
        if let Some(spawn_time) = spawn_time_opt {
            if last_active_time < spawn_time {
                eprintln!("[AgentPoll:pty={}] session {} last active before PTY spawn ({} < {}), not claiming", pty_session_id, latest_sid, last_active_time, spawn_time);
                return Some(waiting());
            }
        }

        // 5. Claim or Transfer session ownership.
        {
            let mut guard = owners.lock().unwrap();
            let prev_owner = guard.insert(latest_sid.clone(), pty_session_id.to_string());
            if let Some(prev) = prev_owner {
                if prev != pty_session_id {
                    eprintln!("[AgentPoll:pty={}] transferred session {} ownership from {} to {}", pty_session_id, latest_sid, prev, pty_session_id);
                    cache.lock().unwrap().remove(&prev);
                }
            } else {
                eprintln!("[AgentPoll:pty={}] claimed session {}", pty_session_id, latest_sid);
            }
        }

        cache.lock().unwrap().insert(pty_session_id.to_string(), (latest_sid.clone(), now));

        match latest_source {
            SessionSource::OpenCode => {
                if let Some(conn) = opencode_conn {
                    self.poll_parts(conn, &latest_sid)
                } else {
                    Some(waiting())
                }
            }
            SessionSource::Mcode => {
                if let Some(conn) = mcode_conn {
                    self.poll_mcode_parts(conn, &latest_sid)
                } else {
                    Some(waiting())
                }
            }
        }
    }

    /// Legacy single-connection helper (primarily used in tests)
    #[cfg(test)]
    pub fn poll_state_for_pty_with_conn(&self, conn: &Connection, workspace_dir: &str, pty_session_id: &str) -> Option<AgentStateInfo> {
        self.poll_state_for_pty_with_conns(Some(conn), None, workspace_dir, pty_session_id, None)
    }

    fn poll_mcode_parts(&self, conn: &Connection, session_id: &str) -> Option<AgentStateInfo> {
        // 1. Check questionnaire_requests for pending user interaction (Question state)
        if let Ok(mut stmt) = conn.prepare("SELECT status FROM questionnaire_requests WHERE session_id = ?1 AND status = 'pending' LIMIT 1") {
            if let Ok(mut rows) = stmt.query(rusqlite::params![session_id]) {
                if let Ok(Some(_)) = rows.next() {
                    eprintln!("[AgentPoll:mcode] Question, session: {}", session_id);
                    return Some(AgentStateInfo {
                        state: AgentState::Question,
                        session_id: session_id.to_string(),
                    });
                }
            }
        }

        // 2. Check local_runtime_background_tasks for running sub-agents / background tasks (AgentCall state)
        if let Ok(mut stmt) = conn.prepare("SELECT status FROM local_runtime_background_tasks WHERE owner_session_id = ?1 AND status = 'running' LIMIT 1") {
            if let Ok(mut rows) = stmt.query(rusqlite::params![session_id]) {
                if let Ok(Some(_)) = rows.next() {
                    eprintln!("[AgentPoll:mcode] AgentCall, session: {}", session_id);
                    return Some(AgentStateInfo {
                        state: AgentState::AgentCall,
                        session_id: session_id.to_string(),
                    });
                }
            }
        }

        // 3. Check local_runtime_sessions for status and error_message
        if let Ok(mut stmt) = conn.prepare("SELECT status, error_message FROM local_runtime_sessions WHERE session_id = ?1 LIMIT 1") {
            if let Ok(mut rows) = stmt.query(rusqlite::params![session_id]) {
                if let Ok(Some(row)) = rows.next() {
                    let status: String = row.get(0).unwrap_or_default();
                    let err_msg: Option<String> = row.get(1).ok();

                    if let Some(err) = err_msg {
                        if !err.is_empty() && status != "started" {
                            eprintln!("[AgentPoll:mcode] Error: {}, session: {}", err, session_id);
                            return Some(AgentStateInfo {
                                state: AgentState::Error,
                                session_id: session_id.to_string(),
                            });
                        }
                    }

                    let state = if status == "started" {
                        AgentState::Running
                    } else {
                        AgentState::Waiting
                    };
                    eprintln!("[AgentPoll:mcode] {:?}, session: {}", state, session_id);
                    return Some(AgentStateInfo {
                        state,
                        session_id: session_id.to_string(),
                    });
                }
            }
        }

        Some(AgentStateInfo {
            state: AgentState::Waiting,
            session_id: session_id.to_string(),
        })
    }

    fn poll_parts(&self, conn: &Connection, session_id: &str) -> Option<AgentStateInfo> {
        let mut stmt = match conn.prepare("SELECT data, time_created FROM part WHERE session_id = ?1 ORDER BY time_created DESC") {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[AgentPoll] parts query prepare failed, Waiting");
                return Some(AgentStateInfo { state: AgentState::Waiting, session_id: session_id.to_string() });
            }
        };
        let mut rows = match stmt.query(rusqlite::params![session_id]) {
            Ok(r) => r,
            Err(_) => {
                eprintln!("[AgentPoll] parts query failed, Waiting");
                return Some(AgentStateInfo { state: AgentState::Waiting, session_id: session_id.to_string() });
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
            eprintln!("[AgentPoll] no parts, Waiting, session: {}", session_id);
            return Some(AgentStateInfo { state: AgentState::Waiting, session_id: session_id.to_string() });
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

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY,
                directory TEXT NOT NULL,
                parent_id TEXT,
                time_created INTEGER NOT NULL
            )",
            [],
        ).unwrap();
        conn.execute(
            "CREATE TABLE part (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                data TEXT NOT NULL,
                time_created INTEGER NOT NULL
            )",
            [],
        ).unwrap();
        conn
    }

    fn setup_test_mcode_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE local_runtime_sessions (
                session_id TEXT PRIMARY KEY,
                workspace_dir TEXT,
                project_workspace_dir TEXT,
                parent_session_id TEXT,
                status TEXT,
                error_message TEXT,
                updated_at_ms INTEGER NOT NULL
            )",
            [],
        ).unwrap();
        conn.execute(
            "CREATE TABLE questionnaire_requests (
                request_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                status TEXT NOT NULL
            )",
            [],
        ).unwrap();
        conn.execute(
            "CREATE TABLE local_runtime_background_tasks (
                task_id TEXT PRIMARY KEY,
                owner_session_id TEXT NOT NULL,
                status TEXT NOT NULL
            )",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn test_resumed_historical_session_is_claimed_and_tracked() {
        let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let conn = setup_test_db();
        let monitor = AgentMonitor::new();
        let ws_dir = "C:/test/workspace";
        let pty_id = "pty_test_1";

        // 1. 模拟历史会话（创建于 1000 毫秒）
        conn.execute(
            "INSERT INTO session (id, directory, parent_id, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["old_sess_123", ws_dir, "", 1000],
        ).unwrap();
        conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p1", "old_sess_123", r#"{"type":"step-finish","reason":"stop"}"#, 1050],
        ).unwrap();

        // 2. 启动 PTY（时间戳为 2000 毫秒）
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_id.to_string(), 2000);
        mark_pty_active(pty_id);

        // 3. 在没有唤醒前，历史会话 last_active 为 1050 < 2000，不会被认领，返回 Waiting
        let state = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_id).unwrap();
        assert_eq!(state.state, AgentState::Waiting);

        // 4. 用户通过 /session 唤醒了 old_sess_123，产生了新的 reasoning/running part (时间戳 3000 >= 2000)
        conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p2", "old_sess_123", r#"{"type":"reasoning"}"#, 3000],
        ).unwrap();

        // 5. 再次轮询：历史会话被成功识别为最新活跃会话，并认领追踪，状态变为 Running！
        let state2 = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_id).unwrap();
        assert_eq!(state2.state, AgentState::Running);
        assert_eq!(state2.session_id, "old_sess_123");

        // 6. 任务调用了 task 工具 (AgentCall)
        conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p3", "old_sess_123", r#"{"type":"tool","tool":"task","state":{"status":"running"}}"#, 3500],
        ).unwrap();

        let state3 = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_id).unwrap();
        assert_eq!(state3.state, AgentState::AgentCall);

        // 7. 清理
        cleanup_pty(pty_id);
    }

    #[test]
    fn test_mcode_session_lifecycle_and_states() {
        let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let mcode_conn = setup_test_mcode_db();
        let monitor = AgentMonitor::new();
        let ws_dir = "C:/test/mcode_workspace";
        let pty_id = "pty_mcode_test";

        // 1. PTY 注册与激活 (时间戳 2000)
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_id.to_string(), 2000);
        mark_pty_active(pty_id);

        // 2. 插入一个 started 状态的 mcode session (时间戳 2500)
        mcode_conn.execute(
            "INSERT INTO local_runtime_sessions (session_id, workspace_dir, project_workspace_dir, parent_session_id, status, error_message, updated_at_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params!["mvs_test_001", ws_dir, ws_dir, "", "started", "", 2500],
        ).unwrap();

        // 3. 轮询 -> 识别为 Running
        let state1 = monitor.poll_state_for_pty_with_conns(None, Some(&mcode_conn), ws_dir, pty_id, Some("mcode")).unwrap();
        assert_eq!(state1.state, AgentState::Running);
        assert_eq!(state1.session_id, "mvs_test_001");

        // 4. 插入 Question 请求 (pending)
        mcode_conn.execute(
            "INSERT INTO questionnaire_requests (request_id, session_id, status) VALUES (?1, ?2, ?3)",
            rusqlite::params!["req_01", "mvs_test_001", "pending"],
        ).unwrap();
        let state2 = monitor.poll_state_for_pty_with_conns(None, Some(&mcode_conn), ws_dir, pty_id, Some("mcode")).unwrap();
        assert_eq!(state2.state, AgentState::Question);

        // 5. 问题处理完毕，插入子 Agent 任务 (running)
        mcode_conn.execute(
            "UPDATE questionnaire_requests SET status = 'answered' WHERE request_id = 'req_01'",
            [],
        ).unwrap();
        mcode_conn.execute(
            "INSERT INTO local_runtime_background_tasks (task_id, owner_session_id, status) VALUES (?1, ?2, ?3)",
            rusqlite::params!["task_01", "mvs_test_001", "running"],
        ).unwrap();
        let state3 = monitor.poll_state_for_pty_with_conns(None, Some(&mcode_conn), ws_dir, pty_id, Some("mcode")).unwrap();
        assert_eq!(state3.state, AgentState::AgentCall);

        // 6. 任务完成，会话变为 idle -> 状态为 Waiting
        mcode_conn.execute(
            "UPDATE local_runtime_background_tasks SET status = 'completed' WHERE task_id = 'task_01'",
            [],
        ).unwrap();
        mcode_conn.execute(
            "UPDATE local_runtime_sessions SET status = 'idle' WHERE session_id = 'mvs_test_001'",
            [],
        ).unwrap();
        let state4 = monitor.poll_state_for_pty_with_conns(None, Some(&mcode_conn), ws_dir, pty_id, Some("mcode")).unwrap();
        assert_eq!(state4.state, AgentState::Waiting);

        cleanup_pty(pty_id);
    }

    #[test]
    fn test_session_transfer_between_ptys() {
        let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let conn = setup_test_db();
        let monitor = AgentMonitor::new();
        let ws_dir = "C:/test/workspace_transfer";
        let pty_a = "pty_transfer_A";
        let pty_b = "pty_transfer_B";

        // 1. PTY A 启动并拥有 session_shared
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_a.to_string(), 1000);
        mark_pty_active(pty_a);

        conn.execute(
            "INSERT INTO session (id, directory, parent_id, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["session_shared", ws_dir, "", 1050],
        ).unwrap();
        conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p_a1", "session_shared", r#"{"type":"reasoning"}"#, 1100],
        ).unwrap();

        // PTY A 轮询 -> 成功拥有 session_shared，状态为 Running
        let state_a = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_a).unwrap();
        assert_eq!(state_a.state, AgentState::Running);
        assert_eq!(state_a.session_id, "session_shared");

        // 2. PTY B 在 2000 毫秒启动
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_b.to_string(), 2000);

        // 3. 用户在 PTY B 里输入 /sessions 切换并发送指令，产生新 part (时间戳 2500)
        mark_pty_active(pty_b);
        conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p_b1", "session_shared", r#"{"type":"reasoning"}"#, 2500],
        ).unwrap();

        // 4. PTY B 轮询 -> 成功转移并接管 session_shared，状态为 Running！
        let state_b = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_b).unwrap();
        assert_eq!(state_b.state, AgentState::Running);
        assert_eq!(state_b.session_id, "session_shared");

        // 5. PTY A 轮询 -> 发现 session_shared 所有权已转移至 PTY B，自动退回到 Waiting！
        let state_a_after = monitor.poll_state_for_pty_with_conn(&conn, ws_dir, pty_a).unwrap();
        assert_eq!(state_a_after.state, AgentState::Waiting);

        cleanup_pty(pty_a);
        cleanup_pty(pty_b);
    }

    #[test]
    fn test_concurrent_opencode_and_mcode_ptys_do_not_preempt() {
        let _lock = TEST_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let opencode_conn = setup_test_db();
        let mcode_conn = setup_test_mcode_db();
        let monitor = AgentMonitor::new();
        let ws_dir = "C:/test/workspace_dual";
        let pty_opencode = "pty_dual_opencode";
        let pty_mcode = "pty_dual_mcode";

        // 1. 同时注册两个 PTY (时间戳 1000)
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_opencode.to_string(), 1000);
        PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()))
            .lock().unwrap()
            .insert(pty_mcode.to_string(), 1000);

        // 2. 写入 opencode 会话 (时间戳 1500)
        opencode_conn.execute(
            "INSERT INTO session (id, directory, parent_id, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["ses_opencode_1", ws_dir, "", 1500],
        ).unwrap();
        opencode_conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p_oc_1", "ses_opencode_1", r#"{"type":"reasoning"}"#, 1550],
        ).unwrap();

        // 3. 写入 mcode 会话 (时间戳 2000 > 1500)
        mcode_conn.execute(
            "INSERT INTO local_runtime_sessions (session_id, workspace_dir, project_workspace_dir, parent_session_id, status, error_message, updated_at_ms) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params!["mvs_mcode_1", ws_dir, ws_dir, "", "started", "", 2000],
        ).unwrap();

        // 4. 用户在两个终端均触发输入活跃
        mark_pty_active(pty_opencode);
        mark_pty_active(pty_mcode);

        // 5. 轮询 opencode 终端 (限定 agent_type = "opencode")
        // 尽管 mcode 会话时间戳更新 (2000 > 1550)，opencode 终端仍应精准认领 ses_opencode_1
        let state_oc = monitor.poll_state_for_pty_with_conns(
            Some(&opencode_conn),
            Some(&mcode_conn),
            ws_dir,
            pty_opencode,
            Some("opencode"),
        ).unwrap();
        assert_eq!(state_oc.state, AgentState::Running);
        assert_eq!(state_oc.session_id, "ses_opencode_1");

        // 6. 轮询 mcode 终端 (限定 agent_type = "mcode")
        let state_mc = monitor.poll_state_for_pty_with_conns(
            Some(&opencode_conn),
            Some(&mcode_conn),
            ws_dir,
            pty_mcode,
            Some("mcode"),
        ).unwrap();
        assert_eq!(state_mc.state, AgentState::Running);
        assert_eq!(state_mc.session_id, "mvs_mcode_1");

        // 7. opencode 终端产生新动作 (时间戳 3000)，再次激活并轮询
        mark_pty_active(pty_opencode);
        opencode_conn.execute(
            "INSERT INTO part (id, session_id, data, time_created) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["p_oc_2", "ses_opencode_1", r#"{"type":"tool","tool":"question","state":{"status":"running"}}"#, 3000],
        ).unwrap();

        let state_oc2 = monitor.poll_state_for_pty_with_conns(
            Some(&opencode_conn),
            Some(&mcode_conn),
            ws_dir,
            pty_opencode,
            Some("opencode"),
        ).unwrap();
        assert_eq!(state_oc2.state, AgentState::Question);
        assert_eq!(state_oc2.session_id, "ses_opencode_1");

        // 8. 验证 mcode 终端依然稳固拥有 mvs_mcode_1，未被 opencode 抢占或冲刷！
        let state_mc2 = monitor.poll_state_for_pty_with_conns(
            Some(&opencode_conn),
            Some(&mcode_conn),
            ws_dir,
            pty_mcode,
            Some("mcode"),
        ).unwrap();
        assert_eq!(state_mc2.state, AgentState::Running);
        assert_eq!(state_mc2.session_id, "mvs_mcode_1");

        cleanup_pty(pty_opencode);
        cleanup_pty(pty_mcode);
    }
}
