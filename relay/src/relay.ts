import type { WebSocket } from "ws";
import {
  verifyPairingCode,
  consumePairingCode,
} from "./pairing.js";
import type { RelayControlMessage } from "./types.js";

// ---- 会话存储 ----

interface UserSession {
  desktopWs?: WebSocket;
  mobileWs?: WebSocket;
}

/** userId → UserSession */
const sessions = new Map<number, UserSession>();

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

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
  let alive = true;

  ws.on("pong", () => {
    alive = true;
  });

  const pingInterval = setInterval(() => {
    if (!alive) {
      console.log("[RELAY] 心跳超时，断开连接");
      ws.terminate();
      return;
    }
    alive = false;
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // 额外设置一个超时定时器兜底
  const timeoutCheck = setInterval(() => {
    if (!alive) {
      ws.terminate();
    }
  }, HEARTBEAT_TIMEOUT_MS);

  return () => {
    clearInterval(pingInterval);
    clearInterval(timeoutCheck);
  };
}

/**
 * 建立双向中继管道。收到的消息原样转发给对端。
 * 如果消息是 JSON 格式的控制帧（type === "control"），不转发给对端。
 */
function bridgePair(desktop: WebSocket, mobile: WebSocket): void {
  desktop.on("message", (raw, isBinary) => {
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
  });

  mobile.on("message", (raw, isBinary) => {
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
  });
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
    bridgePair(ws, session.mobileWs);
    sendControl(ws, "peer_connected");
    sendControl(session.mobileWs, "peer_connected");
    console.log(`[RELAY] 双向管道已建立 (desktop 后到): userId=${userId}`);
  }

  ws.on("close", () => {
    cleanupHeartbeat();
    if (session.desktopWs === ws) {
      session.desktopWs = undefined;
    }
    // 通知对端
    if (session.mobileWs && session.mobileWs.readyState === session.mobileWs.OPEN) {
      sendControl(session.mobileWs, "peer_disconnected");
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
 * 需要提供配对码进行验证。
 */
export function handleMobileConnection(
  ws: WebSocket,
  userId: number,
  code: string,
): void {
  // 验证配对码
  const verifyResult = verifyPairingCode(userId, code);
  if (!verifyResult.valid) {
    sendControl(ws, "error", verifyResult.error || "配对码无效或已过期");
    ws.close(4001, "invalid pairing code");
    return;
  }

  // 消费配对码（一次性使用）
  consumePairingCode(code);

  const session = getOrCreateSession(userId);

  // 单用户只允许一部 mobile
  if (session.mobileWs && session.mobileWs.readyState === session.mobileWs.OPEN) {
    sendControl(session.mobileWs, "error", "被新的手机端连接取代");
    session.mobileWs.close(1000, "replaced");
  }

  session.mobileWs = ws;
  console.log(`[RELAY] 手机端已连接: userId=${userId}, code=${code}`);

  const cleanupHeartbeat = startHeartbeat(ws);

  // 如果 desktop 端已在线，打通管道
  if (session.desktopWs && session.desktopWs.readyState === session.desktopWs.OPEN) {
    bridgePair(session.desktopWs, ws);
    sendControl(session.desktopWs, "peer_connected");
    sendControl(ws, "peer_connected");
    console.log(`[RELAY] 双向管道已建立 (mobile 后到): userId=${userId}`);
  }

  ws.on("close", () => {
    cleanupHeartbeat();
    if (session.mobileWs === ws) {
      session.mobileWs = undefined;
    }
    // 通知对端
    if (session.desktopWs && session.desktopWs.readyState === session.desktopWs.OPEN) {
      sendControl(session.desktopWs, "peer_disconnected");
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
