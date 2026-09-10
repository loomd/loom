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
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let db_path = match Self::get_db_path() {
            Some(p) => p,
            None => {
                eprintln!("[AgentPoll] no DB path, Waiting");
                return Some(waiting());
            }
        };
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AgentPoll] open DB failed: {}, Waiting", e);
                return Some(waiting());
            }
        };

        self.poll_state_with_conn(&conn, workspace_dir)
    }

    pub fn poll_state_with_conn(&self, conn: &Connection, workspace_dir: &str) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let pattern = format!("{}%", workspace_dir.replace('\\', "/"));
        eprintln!("[AgentPoll] workspace_dir: {}, pattern: {}", workspace_dir, pattern);

        let session_id = 'outer: {
            let mut stmt = match conn.prepare(
                "SELECT s.id, COALESCE(MAX(p.time_created), s.time_created) AS last_active \
                 FROM session s \
                 LEFT JOIN part p ON p.session_id = s.id \
                 WHERE s.directory LIKE ?1 AND (s.parent_id IS NULL OR s.parent_id = '') \
                 GROUP BY s.id \
                 ORDER BY last_active DESC LIMIT 1"
            ) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[AgentPoll] session prepare failed: {}, Waiting", e);
                    break 'outer None;
                }
            };
            let mut rows = match stmt.query(rusqlite::params![pattern]) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[AgentPoll] session query failed: {}, Waiting", e);
                    break 'outer None;
                }
            };
            match rows.next() {
                Ok(Some(r)) => match r.get::<_, String>(0) {
                    Ok(id) => Some(id),
                    Err(e) => {
                        eprintln!("[AgentPoll] session row get failed: {}, Waiting", e);
                        None
                    }
                },
                Ok(None) => None,
                Err(e) => {
                    eprintln!("[AgentPoll] session next failed: {}, Waiting", e);
                    None
                }
            }
        };

        match session_id {
            None => {
                eprintln!("[AgentPoll] no session for workspace, Waiting");
                Some(waiting())
            }
            Some(sid) => self.poll_parts(conn, &sid),
        }
    }

    /// Poll agent state scoped to a specific PTY terminal.
    /// Session ownership is first-claim-first-own. A session inactive before
    /// the PTY was spawned belongs to a previous application run and won't
    /// be claimed — keeping the indicator dark until a new or resumed conversation starts.
    pub fn poll_state_for_pty(&self, workspace_dir: &str, pty_session_id: &str) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let db_path = match Self::get_db_path() {
            Some(p) => p,
            None => {
                eprintln!("[AgentPoll:pty={}] no DB path, Waiting", pty_session_id);
                return Some(waiting());
            }
        };
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[AgentPoll:pty={}] open DB failed: {}, Waiting", pty_session_id, e);
                return Some(waiting());
            }
        };

        self.poll_state_for_pty_with_conn(&conn, workspace_dir, pty_session_id)
    }

    pub fn poll_state_for_pty_with_conn(&self, conn: &Connection, workspace_dir: &str, pty_session_id: &str) -> Option<AgentStateInfo> {
        let waiting = || AgentStateInfo {
            state: AgentState::Waiting,
            session_id: String::new(),
        };

        let pattern = format!("{}%", workspace_dir.replace('\\', "/"));
        let now = now_ms();
        let cache = SESSION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
        let owners = SESSION_OWNER.get_or_init(|| Mutex::new(HashMap::new()));
        let spawns = PTY_SPAWNS.get_or_init(|| Mutex::new(HashMap::new()));

        // 1. Query the latest active session for this workspace (with last_active timestamp).
        //    Do this first — we need it for both cache-hit and new-claim paths.
        let latest_info: Option<(String, i64)> = conn
            .prepare(
                "SELECT s.id, COALESCE(MAX(p.time_created), s.time_created) AS last_active \
                 FROM session s \
                 LEFT JOIN part p ON p.session_id = s.id \
                 WHERE s.directory LIKE ?1 AND (s.parent_id IS NULL OR s.parent_id = '') \
                 GROUP BY s.id \
                 ORDER BY last_active DESC LIMIT 1"
            )
            .ok()
            .and_then(|mut stmt| {
                stmt.query_row(rusqlite::params![pattern], |row| {
                    let id: String = row.get(0)?;
                    let ts: i64 = row.get(1)?;
                    Ok((id, ts))
                }).ok()
            });

        let (latest_sid, last_active_time) = match latest_info {
            Some(info) => info,
            None => {
                eprintln!("[AgentPoll:pty={}] no session for workspace, Waiting", pty_session_id);
                return Some(waiting());
            }
        };

        // 2. Input gate: only the globally last-active PTY can CLAIM / TRANSFER sessions.
        //    Stale entries older than ACTIVE_WINDOW_MS are ignored.
        //    If we already own a cached session, verify we still own it before polling.
        {
            let guard = LAST_ACTIVE_PTY.get_or_init(|| Mutex::new(None))
                .lock().unwrap();
            let can_claim = matches!(&*guard, Some((id, ts)) if id == pty_session_id && now - *ts <= ACTIVE_WINDOW_MS);
            if !can_claim {
                let cache_guard = cache.lock().unwrap();
                if let Some((cached, _)) = cache_guard.get(pty_session_id) {
                    // If ownership was transferred to another active PTY, drop cache and revert to Waiting
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
                    return self.poll_parts(conn, cached);
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
                    return self.poll_parts(conn, cached);
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
        // Since can_claim is true and last_active_time >= spawn_time, this PTY is actively
        // interacting with this session (e.g. newly created or resumed via /session).
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
        self.poll_parts(conn, &latest_sid)
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

    #[test]
    fn test_resumed_historical_session_is_claimed_and_tracked() {
        let _lock = TEST_MUTEX.lock().unwrap();
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
    fn test_session_transfer_between_ptys() {
        let _lock = TEST_MUTEX.lock().unwrap();
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
}