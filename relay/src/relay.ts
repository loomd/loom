import type { WebSocket } from "ws";
import {
  verifyPairingCode,
  markPairingCodeBound,
  isAccountPaired,
  getAccountBinding,
  markAccountPaired,
  ensureBindingDeviceId,
} from "./pairing.js";
import type { RelayControlMessage } from "./types.js";

// ---- 会话存储 ----

interface UserSession {
  desktopWs?: WebSocket;
  mobileWs?: WebSocket;
  /** 解除当前双向桥接的监听器（重连时先解绑，避免监听器堆积） */
  unbridge?: () => void;
}

/** userId → UserSession */
const sessions = new Map<number, UserSession>();

const HEARTBEAT_INTERVAL_MS = 30_000;
/**
 * 心跳超时阈值。以「最后一次收到 pong」为基准，允许连续 2 次 pong 丢失
 * （手机息屏休眠、WiFi/4G 切换、瞬时抖动）后再判定链路失效，
 * 避免单次 pong 迟到就误杀长连接。
 */
const HEARTBEAT_TIMEOUT_MS = 90_000;

// ---- 工具函数 ----

function sendControl(
  ws: WebSocket,
  event: RelayControlMessage["event"],
  data?: unknown,
): void {
  if (ws.readyState === ws.OPEN) {
    const msg: RelayControlMessage = { type: "control", event };
    if (data !== undefined) msg.data = data;
    ws.send(JSON.stringify(msg));
  }
}

function getOrCreateSession(userId: number): UserSession {
  let session = sessions.get(userId);
  if (!session) {
    session = {};
    sessions.set(userId, session);
  }
  return session;
}

/**
 * 启动心跳检测。
 * 返回 cleanup 函数，断开时调用以清除定时器。
 */
function startHeartbeat(ws: WebSocket): () => void {
  let lastPongAt = Date.now();

  ws.on("pong", () => {
    lastPongAt = Date.now();
  });

  // 判定基准是「最后一次收到 pong 的时间」，而不是布尔标记：
  // 单次 pong 迟到只会被下一次 ping 覆盖，不会立刻误杀连接。
  const timer = setInterval(() => {
    if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
      console.log("[RELAY] 心跳超时，断开连接");
      ws.terminate();
      return;
    }
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(timer);
  };
}

/**
 * 建立双向中继管道。收到的消息原样转发给对端。
 * 如果消息是 JSON 格式的控制帧（type === "control"），不转发给对端。
 *
 * 返回解绑函数：解除监听器，避免对端重连后旧监听器堆积导致重复投递。
 */
function bridgePair(desktop: WebSocket, mobile: WebSocket): () => void {
  const onDesktopMessage = (raw: Buffer, isBinary: boolean) => {
    if (mobile.readyState === mobile.OPEN) {
      // 尝试解析控制帧，控制帧不转发
      if (!isBinary) {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed && parsed.type === "control") return;
        } catch {
          // 不是 JSON，正常转发
        }
      }
      mobile.send(raw, { binary: isBinary });
    }
  };

  const onMobileMessage = (raw: Buffer, isBinary: boolean) => {
    if (desktop.readyState === desktop.OPEN) {
      if (!isBinary) {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed && parsed.type === "control") return;
        } catch {
          // 不是 JSON，正常转发
        }
      }
      desktop.send(raw, { binary: isBinary });
    }
  };

  desktop.on("message", onDesktopMessage);
  mobile.on("message", onMobileMessage);

  return () => {
    desktop.off("message", onDesktopMessage);
    mobile.off("message", onMobileMessage);
  };
}

/**
 * 在会话上建立（或重建）双向管道。
 */
function ensureBridged(session: UserSession, desktop: WebSocket, mobile: WebSocket): void {
  session.unbridge?.();
  session.unbridge = bridgePair(desktop, mobile);
  sendControl(desktop, "peer_connected");
  sendControl(mobile, "peer_connected");
}

// ---- 公开 API ----

/**
 * 处理桌面端 WebSocket 连接。
 */
export function handleDesktopConnection(
  ws: WebSocket,
  userId: number,
): void {
  const session = getOrCreateSession(userId);

  // 单用户只允许一台 desktop
  if (session.desktopWs && session.desktopWs.readyState === session.desktopWs.OPEN) {
    sendControl(session.desktopWs, "error", "被新的桌面端连接取代");
    session.desktopWs.close(1000, "replaced");
  }

  session.desktopWs = ws;
  console.log(`[RELAY] 桌面端已连接: userId=${userId}`);

  const cleanupHeartbeat = startHeartbeat(ws);

  // 如果 mobile 端已在线，打通管道
  if (session.mobileWs && session.mobileWs.readyState === session.mobileWs.OPEN) {
    ensureBridged(session, ws, session.mobileWs);
    console.log(`[RELAY] 双向管道已建立 (desktop 后到): userId=${userId}`);
  }

  ws.on("close", () => {
    cleanupHeartbeat();
    // 只有当关闭的仍是会话当前持有的连接时才通知对端：
    // 旧连接延迟关闭时不能把「已重连成功」误报成「对端断开」。
    if (session.desktopWs === ws) {
      session.desktopWs = undefined;
      if (session.mobileWs && session.mobileWs.readyState === session.mobileWs.OPEN) {
        sendControl(session.mobileWs, "peer_disconnected");
      }
    }
    console.log(`[RELAY] 桌面端已断开: userId=${userId}`);
    cleanupEmptySession(userId);
  });

  ws.on("error", (err) => {
    console.error(`[RELAY] 桌面端 WebSocket 错误: userId=${userId}`, err.message);
  });
}

/**
 * 处理手机端 WebSocket 连接。
 *
 * 授权规则：
 * - 账号已完成绑定 → 直接放行（重连不再需要配对码）；
 *   若绑定记录了 deviceId，则只有同一台设备可以复用该绑定。
 * - 账号未绑定 → 必须提供有效配对码，校验通过后建立绑定。
 */
export function handleMobileConnection(
  ws: WebSocket,
  userId: number,
  code?: string,
  deviceId?: string,
): void {
  if (isAccountPaired(userId)) {
    const binding = getAccountBinding(userId);
    const boundDeviceId = binding?.deviceId ?? null;

    if (boundDeviceId && deviceId && boundDeviceId !== deviceId) {
      sendControl(ws, "error", "此账号已绑定其他手机设备，请先在桌面端解绑");
      ws.close(4001, "bound to another device");
      return;
    }

    // 老版本客户端没有 deviceId：放行并顺手补齐绑定标识
    if (!boundDeviceId && deviceId) {
      ensureBindingDeviceId(userId, deviceId);
    }
  } else {
    if (!code) {
      sendControl(ws, "error", "该账号尚未绑定手机端，请在手机端输入配对码完成绑定");
      ws.close(4001, "not paired");
      return;
    }

    const verifyResult = verifyPairingCode(userId, code);
    if (!verifyResult.valid) {
      sendControl(ws, "error", verifyResult.error || "配对码无效或已过期");
      ws.close(4001, "invalid pairing code");
      return;
    }

    // 校验通过 → 绑定账号，后续重连凭 token 即可
    markPairingCodeBound(code);
    markAccountPaired(userId, deviceId);
  }

  const session = getOrCreateSession(userId);

  // 单用户只允许一部 mobile
  if (session.mobileWs && session.mobileWs.readyState === session.mobileWs.OPEN) {
    sendControl(session.mobileWs, "error", "被新的手机端连接取代");
    session.mobileWs.close(1000, "replaced");
  }

  session.mobileWs = ws;
  console.log(`[RELAY] 手机端已连接: userId=${userId}`);

  const cleanupHeartbeat = startHeartbeat(ws);

  // 如果 desktop 端已在线，打通管道
  if (session.desktopWs && session.desktopWs.readyState === session.desktopWs.OPEN) {
    ensureBridged(session, session.desktopWs, ws);
    console.log(`[RELAY] 双向管道已建立 (mobile 后到): userId=${userId}`);
  }

  ws.on("close", () => {
    cleanupHeartbeat();
    // 同上：只有当前持有的连接关闭时才通知对端
    if (session.mobileWs === ws) {
      session.mobileWs = undefined;
      if (session.desktopWs && session.desktopWs.readyState === session.desktopWs.OPEN) {
        sendControl(session.desktopWs, "peer_disconnected");
      }
    }
    console.log(`[RELAY] 手机端已断开: userId=${userId}`);
    cleanupEmptySession(userId);
  });

  ws.on("error", (err) => {
    console.error(`[RELAY] 手机端 WebSocket 错误: userId=${userId}`, err.message);
  });
}

function cleanupEmptySession(userId: number): void {
  const session = sessions.get(userId);
  if (!session) return;
  if (!session.desktopWs && !session.mobileWs) {
    session.unbridge?.();
    session.unbridge = undefined;
    sessions.delete(userId);
  }
}

export interface SessionSummary {
  userId: number;
  desktopOnline: boolean;
  mobileOnline: boolean;
  channelBridged: boolean;
}

export function getActiveSessionSummaries(): SessionSummary[] {
  const list: SessionSummary[] = [];
  for (const [userId, session] of sessions) {
    const desktopOnline = session.desktopWs?.readyState === session.desktopWs?.OPEN;
    const mobileOnline = session.mobileWs?.readyState === session.mobileWs?.OPEN;
    if (desktopOnline || mobileOnline) {
      list.push({
        userId,
        desktopOnline: Boolean(desktopOnline),
        mobileOnline: Boolean(mobileOnline),
        channelBridged: Boolean(desktopOnline && mobileOnline),
      });
    }
  }
  return list;
}

/**
 * 强制断开指定用户的所有连接（桌面端与手机端）。
 * 用于管理员封禁账号或删除账号时立即生效。
 */
export function terminateUserSessions(userId: number, reason: string = "账号状态已变更，连接已断开"): void {
  const session = sessions.get(userId);
  if (!session) return;
  if (session.desktopWs) {
    try {
      sendControl(session.desktopWs, "error", { message: reason });
      session.desktopWs.close(1008, reason);
    } catch {}
  }
  if (session.mobileWs) {
    try {
      sendControl(session.mobileWs, "error", { message: reason });
      session.mobileWs.close(1008, reason);
    } catch {}
  }
  sessions.delete(userId);
  console.log(`[RELAY] 用户连接已强制清理: userId=${userId}, 原因: ${reason}`);
}

