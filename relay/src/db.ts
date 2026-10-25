import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database | null = null;

/**
 * 返回 SQLite 单例实例。首次调用时自动初始化表结构。
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

