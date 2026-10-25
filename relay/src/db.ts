import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { UserSummary } from "./types.js";

let db: Database.Database | null = null;

/**
 * 返回 SQLite 单例实例。首次调用时自动初始化表结构。
 * 严格保持原有表结构定义，不进行任何非必要的结构迁移。
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.DB_PATH || "./data/relay.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 账号级手机端绑定：一个账号只绑定一台手机（主键即 user_id），
    -- 绑定成功后手机端重连不再需要配对码，除非显式解绑。
    CREATE TABLE IF NOT EXISTS mobile_bindings (
      user_id     INTEGER PRIMARY KEY,
      device_id   TEXT,
      paired_at   TEXT NOT NULL,
      device_name TEXT
    );
  `);

  console.log(`[RELAY] SQLite 已初始化: ${dbPath}`);
  return db;
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row ? row.count : 0;
}

export function getUserMap(): Map<number, string> {
  const db = getDb();
  const rows = db.prepare("SELECT id, username FROM users").all() as { id: number; username: string }[];
  const map = new Map<number, string>();
  for (const r of rows) {
    map.set(r.id, r.username);
  }
  return map;
}

export function getAllUsers(): UserSummary[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, username, created_at FROM users ORDER BY id ASC")
    .all() as { id: number; username: string; created_at: string }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    createdAt: r.created_at,
  }));
}

export function updateUserPassword(userId: number, passwordHash: string): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, userId);
  return result.changes > 0;
}

export function deleteUser(userId: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return result.changes > 0;
}

// ---- 账号级手机端绑定 ----

export interface MobileBinding {
  userId: number;
  deviceId: string | null;
  pairedAt: string;
  deviceName: string | null;
}

/**
 * 查询账号当前绑定的手机端。未绑定时返回 null。
 */
export function getMobileBinding(userId: number): MobileBinding | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT user_id, device_id, paired_at, device_name FROM mobile_bindings WHERE user_id = ?",
    )
    .get(userId) as
    | {
        user_id: number;
        device_id: string | null;
        paired_at: string;
        device_name: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    deviceId: row.device_id ?? null,
    pairedAt: row.paired_at,
    deviceName: row.device_name ?? null,
  };
}

/**
 * 建立或覆盖账号的手机端绑定。
 * 账号维度唯一：同一账号始终只保留一台手机。
 */
export function upsertMobileBinding(
  userId: number,
  deviceId?: string | null,
  deviceName?: string | null,
): MobileBinding {
  const db = getDb();
  const pairedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO mobile_bindings (user_id, device_id, paired_at, device_name)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET device_id = excluded.device_id,
                                        paired_at = excluded.paired_at,
                                        device_name = excluded.device_name`,
  ).run(userId, deviceId ?? null, pairedAt, deviceName ?? null);
  console.log(
    `[RELAY] 账号已绑定手机端: userId=${userId}, deviceId=${deviceId ?? "(legacy)"}`,
  );
  return { userId, deviceId: deviceId ?? null, pairedAt, deviceName: deviceName ?? null };
}

/**
 * 更新账号已绑定手机端的设备标识（老版本客户端没有 deviceId，升级时补齐）。
 */
export function setMobileBindingDeviceId(
  userId: number,
  deviceId: string,
): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE mobile_bindings SET device_id = ? WHERE user_id = ?")
    .run(deviceId, userId);
  return result.changes > 0;
}

/**
 * 统计已完成手机端绑定的账号数。
 */
export function countMobileBindings(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM mobile_bindings")
    .get() as { count: number };
  return row ? row.count : 0;
}

/**
 * 解除账号的手机端绑定（强制解绑）。解除后手机端重连需要重新输入配对码。
 */
export function deleteMobileBinding(userId: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM mobile_bindings WHERE user_id = ?").run(userId);
  return result.changes > 0;
}
