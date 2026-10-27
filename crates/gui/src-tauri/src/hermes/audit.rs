use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;
use serde::{Deserialize, Serialize};

use loom_core::storage::manager as cstore;

/// 审计日志条目（全字段结构化留存，不截断）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRecord {
    pub timestamp: String,
    pub date: String,
    pub direction: String,        // "in" | "out"
    pub event_type: String,       // "message" | "reply" | "command" | "permission"
    pub chat_id: String,
    pub chat_type: String,        // "group" | "p2p"
    pub sender_id: String,        // open_id 或 "Hermes"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub content: String,
    #[serde(default)]
    pub meta: serde_json::Value,
}

pub struct AuditLogger {
    log_dir: PathBuf,
    write_lock: Mutex<()>,
}

impl AuditLogger {
    pub fn new() -> Self {
        let mut base_dir = cstore::get_config_path();
        base_dir.pop(); // 移除 loom.json，进入配置根目录
        let log_dir = base_dir.join("logs").join("hermes");
        let _ = fs::create_dir_all(&log_dir);

        Self {
            log_dir,
            write_lock: Mutex::new(()),
        }
    }

    pub fn get_log_dir(&self) -> PathBuf {
        self.log_dir.clone()
    }

    /// 记录一条审计日志到当天的 .jsonl 文件
    pub fn record(&self, entry: &AuditRecord) {
        let _guard = match self.write_lock.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        let file_name = format!("hermes-audit-{}.jsonl", entry.date);
        let file_path = self.log_dir.join(file_name);

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
        {
            if let Ok(serialized) = serde_json::to_string(entry) {
                let _ = writeln!(file, "{}", serialized);
            }
        }
    }

    /// 查询某天的审计日志，默认返回今天，按倒序排列
    pub fn read_records(&self, date_opt: Option<&str>, limit: usize) -> Vec<AuditRecord> {
        let date_str = date_opt
            .map(|s| s.to_string())
            .unwrap_or_else(current_date_str);
        let file_name = format!("hermes-audit-{}.jsonl", date_str);
        let file_path = self.log_dir.join(file_name);

        if !file_path.exists() {
            return Vec::new();
        }

        let content = match fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };

        let mut list: Vec<AuditRecord> = content
            .lines()
            .filter_map(|line| serde_json::from_str::<AuditRecord>(line.trim()).ok())
            .collect();

        list.reverse();
        list.truncate(limit);
        list
    }
}

pub fn current_date_str() -> String {
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs() + 8 * 3600; // UTC+8
    let days = secs / 86400;
    // 简易公历转换
    days_to_date(days)
}

pub fn current_timestamp_str() -> String {
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let millis = dur.subsec_millis();
    let secs = dur.as_secs() + 8 * 3600; // UTC+8
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let hour = day_secs / 3600;
    let min = (day_secs % 3600) / 60;
    let sec = day_secs % 60;
    format!("{} {:02}:{:02}:{:02}.{:03}", days_to_date(days), hour, min, sec, millis)
}

fn days_to_date(days_since_epoch: u64) -> String {
    // 简易公历算法（自 1970-01-01 起）
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", year, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_date_formatting() {
        let date_str = current_date_str();
        assert_eq!(date_str.len(), 10);
        assert_eq!(&date_str[4..5], "-");
        assert_eq!(&date_str[7..8], "-");
    }

    #[test]
    fn test_audit_record_serialization() {
        let rec = AuditRecord {
            timestamp: "2026-10-27 15:50:00.123".to_string(),
            date: "2026-10-27".to_string(),
            direction: "in".to_string(),
            event_type: "message".to_string(),
            chat_id: "oc_123".to_string(),
            chat_type: "group".to_string(),
            sender_id: "ou_user".to_string(),
            model: Some("M3.1-Flash".to_string()),
            content: "say hi".to_string(),
            meta: json!({ "source": "feishu_ws" }),
        };

        let json_str = serde_json::to_string(&rec).unwrap();
        let restored: AuditRecord = serde_json::from_str(&json_str).unwrap();
        assert_eq!(restored.content, "say hi");
        assert_eq!(restored.chat_type, "group");
    }
}
