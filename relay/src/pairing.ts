import type { WebSocket } from "ws";
import {
  getMobileBinding,
  upsertMobileBinding,
  deleteMobileBinding,
  setMobileBindingDeviceId,
  type MobileBinding,
} from "./db.js";

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

export interface VerifyPairingResult {
  valid: boolean;
  error?: string;
}

/**
 * 验证配对码。码必须存在、未过期、且属于同一用户。
 */
export function verifyPairingCode(
  userId: number,
  code: string,
): VerifyPairingResult {
  const entry = pairings.get(code);
  if (!entry) {
    return { valid: false, error: "配对码不存在或已失效，请在桌面端重新生成" };
  }
  if (entry.userId !== userId) {
    return {
      valid: false,
      error: `配对码由桌面端账号生成，与当前手机登录账号不一致，请在手机端登录相同账号`,
    };
  }
  if (Date.now() > entry.expiresAt) {
    // 过期，清理
    pairings.delete(code);
    if (userToCode.get(userId) === code) {
      userToCode.delete(userId);
    }
    return { valid: false, error: "配对码已超时过期，请在桌面端刷新生成新码" };
  }
  return { valid: true };
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

// ---- 账号级绑定 ----
//
// 配对码只用于「首次把手机端绑定到账号」这一次授权动作。
// 绑定成功后手机端重连只需要账号 token，无需再次输入配对码；
// 只有显式解绑（桌面端「解绑手机」或管理接口）才会让配对码重新生效。

/**
 * 账号是否已完成手机端绑定。
 */
export function isAccountPaired(userId: number): boolean {
  return getMobileBinding(userId) !== null;
}

/**
 * 查询账号的绑定信息。
 */
export function getAccountBinding(userId: number): MobileBinding | null {
  return getMobileBinding(userId);
}

/**
 * 标记账号已完成手机端绑定。
 */
export function markAccountPaired(
  userId: number,
  deviceId?: string | null,
  deviceName?: string | null,
): MobileBinding {
  return upsertMobileBinding(userId, deviceId, deviceName);
}

/**
 * 为已绑定但没有设备标识的账号补齐 deviceId（老版本客户端升级路径）。
 * @returns 是否发生了补写。
 */
export function ensureBindingDeviceId(
  userId: number,
  deviceId: string,
): boolean {
  const binding = getMobileBinding(userId);
  if (!binding || binding.deviceId) return false;
  setMobileBindingDeviceId(userId, deviceId);
  return true;
}

/**
 * 解除账号的手机端绑定（强制解绑）。
 */
export function unbindAccount(userId: number): boolean {
  return deleteMobileBinding(userId);
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
 * 配对码进入绑定流程后的处理。
 *
 * 配对码在有效期内保持可用，避免「HTTP 校验通过但 WebSocket 建连失败」后
 * 手机端因为码已被销毁而彻底无法重试。真正的一次性语义落在账号绑定上：
 * 绑定成功后手机端重连不再需要配对码。
 */
export function markPairingCodeBound(code: string): void {
  const entry = pairings.get(code);
  if (entry) {
    console.log(`[RELAY] 配对码已进入绑定流程: userId=${entry.userId}, code=${code}`);
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

/**
 * 对 4 位配对码执行掩码脱敏（例如 "1234" -> "**34"）。
 * 避免在公网状态接口和监控控制台中明文泄露未过期的配对凭据。
 */
export function maskPairingCode(code: string): string {
  if (!code || code.length < 2) return "****";
  return "**" + code.slice(-2);
}

export interface PairingSummary {
  userId: number;
  code: string;
  expiresInSeconds: number;
  createdAt: number;
}

export function getActivePairingSummaries(mask: boolean = true): PairingSummary[] {
  const now = Date.now();
  const list: PairingSummary[] = [];
  for (const [code, entry] of pairings) {
    if (entry.expiresAt > now) {
      list.push({
        userId: entry.userId,
        code: mask ? maskPairingCode(code) : code,
        expiresInSeconds: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
        createdAt: entry.createdAt,
      });
    }
  }
  return list;
}

