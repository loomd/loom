import type { WebSocket } from "ws";

interface PairingEntry {
  userId: number;
  code: string;
  createdAt: number;
  expiresAt: number;
  desktopWs?: WebSocket;
}

/** code → PairingEntry */
const pairings = new Map<string, PairingEntry>();

/** userId → code（快速反查，同一用户只保留一个活跃码） */
const userToCode = new Map<number, string>();

const CODE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 秒

/**
 * 为用户生成 4 位随机配对码。同一用户旧码自动作废。
 */
export function createPairingCode(userId: number): {
  code: string;
  expiresAt: number;
} {
  // 作废旧码
  const oldCode = userToCode.get(userId);
  if (oldCode) {
    pairings.delete(oldCode);
    userToCode.delete(userId);
  }

  const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MS;

  pairings.set(code, {
    userId,
    code,
    createdAt: now,
    expiresAt,
  });
  userToCode.set(userId, code);

  console.log(
    `[RELAY] 配对码已创建: userId=${userId}, code=${code}, 过期=${new Date(expiresAt).toISOString()}`,
  );
  return { code, expiresAt: Math.floor(expiresAt / 1000) };
}

/**
 * 验证配对码。码必须存在、未过期、且属于同一用户。
 */
export function verifyPairingCode(
  userId: number,
  code: string,
): boolean {
  const entry = pairings.get(code);
  if (!entry) return false;
  if (entry.userId !== userId) return false;
  if (Date.now() > entry.expiresAt) {
    // 过期，清理
    pairings.delete(code);
    if (userToCode.get(userId) === code) {
      userToCode.delete(userId);
    }
    return false;
  }
  return true;
}

/**
 * 查询用户当前的活跃配对条目。
 */
export function getPairingByUserId(userId: number): PairingEntry | undefined {
  const code = userToCode.get(userId);
  if (!code) return undefined;
  const entry = pairings.get(code);
  if (!entry) {
    userToCode.delete(userId);
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    pairings.delete(code);
    userToCode.delete(userId);
    return undefined;
  }
  return entry;
}

/**
 * 绑定桌面端 WebSocket 到当前用户的配对条目。
 */
export function setDesktopWs(userId: number, ws: WebSocket): void {
  const entry = getPairingByUserId(userId);
  if (entry) {
    entry.desktopWs = ws;
  }
}

/**
 * 消费配对码（验证成功后移除，防止重复使用）。
 */
export function consumePairingCode(code: string): void {
  const entry = pairings.get(code);
  if (entry) {
    userToCode.delete(entry.userId);
    pairings.delete(code);
  }
}

// ---- 定时清理过期码 ----

function cleanupExpired(): void {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, entry] of pairings) {
    if (now > entry.expiresAt) {
      pairings.delete(code);
      if (userToCode.get(entry.userId) === code) {
        userToCode.delete(entry.userId);
      }
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[RELAY] 已清理 ${cleaned} 个过期配对码`);
  }
}

const cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // 不阻止进程退出

export interface PairingSummary {
  userId: number;
  code: string;
  expiresInSeconds: number;
  createdAt: number;
}

export function getActivePairingSummaries(): PairingSummary[] {
  const now = Date.now();
  const list: PairingSummary[] = [];
  for (const [code, entry] of pairings) {
    if (entry.expiresAt > now) {
      list.push({
        userId: entry.userId,
        code,
        expiresInSeconds: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
        createdAt: entry.createdAt,
      });
    }
  }
  return list;
}
