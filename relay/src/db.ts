import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { UserSummary } from "./types.js";

let db: Database.Database | null = null;

/**
 * 确保 users 表具备 role、status、updated_at 等列（平滑升级旧数据库）。
 */
function migrateSchema(database: Database.Database): void {
  const columns = database
    .prepare("PRAGMA table_info(users)")
    .all() as { name: string }[];
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("role")) {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }
  if (!colNames.has("status")) {
    database.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!colNames.has("updated_at")) {
    database.exec("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP");
  }
}

/**
 * 返回 SQLite 单例实例。首次调用时自动初始化表结构并完成迁移。
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
      role          TEXT DEFAULT 'user',
      status        TEXT DEFAULT 'active',
      created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  migrateSchema(db);

  console.log(`[RELAY] SQLite 已初始化并完成架构校验: ${dbPath}`);
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
    .prepare(
      "SELECT id, username, COALESCE(role, 'user') as role, COALESCE(status, 'active') as status, created_at, COALESCE(updated_at, created_at) as updated_at FROM users ORDER BY id ASC"
    )
    .all() as {
      id: number;
      username: string;
      role: string;
      status: string;
      created_at: string;
      updated_at: string;
    }[];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role === "admin" ? "admin" : "user",
    status: r.status === "disabled" ? "disabled" : "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getUserById(id: number): {
  id: number;
  username: string;
  role: string;
  status: string;
  password_hash: string;
} | undefined {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, username, COALESCE(role, 'user') as role, COALESCE(status, 'active') as status, password_hash FROM users WHERE id = ?"
    )
    .get(id) as {
      id: number;
      username: string;
      role: string;
      status: string;
      password_hash: string;
    } | undefined;
}

export function updateUserPassword(userId: number, passwordHash: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(passwordHash, userId);
  return result.changes > 0;
}

export function updateUserStatus(userId: number, status: "active" | "disabled"): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(status, userId);
  return result.changes > 0;
}

export function deleteUser(userId: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return result.changes > 0;
}


