import type { RelayMessage } from "@/types";

type MessageCallback = (message: RelayMessage) => void;
type StatusCallback = (connected: boolean) => void;
/** 服务端判定为鉴权失败（未绑定 / 绑定失效）时回调，需引导用户重新配对 */
type AuthErrorCallback = (reason: string) => void;

const MAX_RECONNECT_DELAY = 30000;
/**
 * 连接稳定阈值：建连后存活超过该时长才重置退避计数。
 * 否则「刚连上就被服务端拒绝」会不断把退避重置回 1 秒，形成重连风暴。
 */
const STABLE_CONNECTION_MS = 10000;

let ws: WebSocket | null = null;
let messageCallbacks: MessageCallback[] = [];
let statusCallbacks: StatusCallback[] = [];
let authErrorCallbacks: AuthErrorCallback[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let shouldReconnect = false;
let currentUrl = "";
let currentToken = "";
let currentCode = "";
let currentDeviceId = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
/** 当前连接被服务端判定为鉴权失败：自动重连无意义，需重新配对 */
let authRejected = false;
/** 当前连接建立的时间戳，用于判断连接是否稳定 */
let openedAt = 0;
/** 最近一次收到的控制帧错误文案 */
let lastControlError = "";

function notifyStatus(connected: boolean): void {
  for (const cb of statusCallbacks) {
    cb(connected);
  }
}

function notifyMessage(message: RelayMessage): void {
  for (const cb of messageCallbacks) {
    cb(message);
  }
}

function notifyAuthError(reason: string): void {
  for (const cb of authErrorCallbacks) {
    cb(reason);
  }
}

/**
 * 指数退避 + 抖动。抖动用于打散客户端的重连节奏，避免服务端恢复瞬间被同时涌入。
 */
function getReconnectDelay(): number {
  const base = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
  reconnectAttempt++;
  return Math.min(MAX_RECONNECT_DELAY, Math.round(base * (0.7 + Math.random() * 0.6)));
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const pong: RelayMessage = {
        type: "pong",
        payload: "",
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(pong));
    }
  }, 30000);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!shouldReconnect) return;
  // 鉴权失败：继续重连也不会成功，等待用户重新输入配对码
  if (authRejected) return;
  if (reconnectTimer) return;

  const delay = getReconnectDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldReconnect && !authRejected) {
      connectInternal();
    }
  }, delay);
}

/** 从控制帧里取出可读的错误文案（data 可能是字符串或 { message } 对象） */
function extractControlText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const data = (message as { data?: unknown }).data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const inner = (data as { message?: unknown }).message;
    if (typeof inner === "string") return inner;
  }
  return "";
}

function buildMobileUrl(): string {
  const query = [`token=${encodeURIComponent(currentToken)}`];
  if (currentDeviceId) {
    query.push(`deviceId=${encodeURIComponent(currentDeviceId)}`);
  }
  // code 仅在首次配对时有意义；账号已绑定后中继会忽略它
  if (currentCode) {
    query.push(`code=${encodeURIComponent(currentCode)}`);
  }
  return `${currentUrl}/ws/mobile?${query.join("&")}`;
}

function connectInternal(): void {
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }

  const url = buildMobileUrl();
  ws = new WebSocket(url);

  ws.onopen = () => {
    openedAt = Date.now();
    notifyStatus(true);
    startHeartbeat();
  };

  ws.onmessage = (event: WebSocketMessageEvent) => {
    try {
      const raw = event.data as string;
      try {
        const message = JSON.parse(raw) as RelayMessage & { event?: string };
        if (message.type === "control") {
          if (message.event === "peer_connected") {
            notifyStatus(true);
          } else if (message.event === "peer_disconnected") {
            notifyStatus(false);
          } else if (message.event === "error") {
            // 记录错误文案：紧随其后的 close(4001) 会用它提示用户重新配对
            lastControlError = extractControlText(message);
          }
          notifyMessage(message);
          return;
        }
        if (message.type === "ping") {
          const pong: RelayMessage = {
            type: "pong",
            payload: "",
            timestamp: Date.now(),
          };
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(pong));
          }
          return;
        }
        notifyMessage(message);
      } catch {
        // Raw text stream, wrap as chat
        notifyMessage({
          type: "chat",
          payload: raw,
          timestamp: Date.now(),
        });
      }
    } catch {
      // 忽略严重异常
    }
  };

  ws.onclose = (event: { code?: number; reason?: string }) => {
    stopHeartbeat();
    notifyStatus(false);

    // 连接稳定运行过才重置退避，避免「连上即被拒」时退避被反复清零
    if (openedAt && Date.now() - openedAt > STABLE_CONNECTION_MS) {
      reconnectAttempt = 0;
    }
    openedAt = 0;

    // 4001：中继判定鉴权失败（未绑定 / 配对码失效 / 绑定到其他设备）
    if (event?.code === 4001) {
      authRejected = true;
      notifyAuthError(lastControlError || "绑定已失效，请重新输入配对码");
    }

    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose 会紧随其后触发
  };
}

/** 建立（或复用）与中继的 WebSocket 连接 */
export function connectToRelay(
  baseUrl: string,
  token: string,
  code?: string,
  deviceId?: string,
): void {
  const wsUrl = baseUrl.replace(/^http/, "ws");
  const nextCode = code ?? "";
  const nextDeviceId = deviceId ?? "";

  // 目标未变且已有可用连接时，不重复建连
  const sameTarget =
    currentUrl === wsUrl &&
    currentToken === token &&
    currentCode === nextCode &&
    currentDeviceId === nextDeviceId;
  if (
    sameTarget &&
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    shouldReconnect = true;
    authRejected = false;
    return;
  }

  currentUrl = wsUrl;
  currentToken = token;
  currentCode = nextCode;
  currentDeviceId = nextDeviceId;
  shouldReconnect = true;
  authRejected = false;
  lastControlError = "";
  reconnectAttempt = 0;
  connectInternal();
}

export function send(message: string): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const relayMessage: RelayMessage = {
      type: "chat",
      payload: message,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(relayMessage));
  }
}

/**
 * 回应桌面端发来的权限审批请求。
 *
 * 桌面端会把它转换成对 `session/request_permission` 的 JSON-RPC 响应，
 * 因此这里只传回请求 ID、是否同意以及选中的选项 ID。
 */
export function sendPermissionResponse(
  requestId: string,
  approved: boolean,
  optionId?: string,
): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const relayMessage: RelayMessage = {
      type: "permission_response",
      payload: JSON.stringify({ id: requestId, approved, optionId }),
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(relayMessage));
  }
}

export function onMessage(callback: MessageCallback): () => void {
  messageCallbacks.push(callback);
  return () => {
    messageCallbacks = messageCallbacks.filter((cb) => cb !== callback);
  };
}

export function onStatusChange(callback: StatusCallback): () => void {
  statusCallbacks.push(callback);
  return () => {
    statusCallbacks = statusCallbacks.filter((cb) => cb !== callback);
  };
}

/**
 * 订阅鉴权失败事件：绑定失效时需要引导用户重新输入配对码。
 */
export function onAuthError(callback: AuthErrorCallback): () => void {
  authErrorCallbacks.push(callback);
  return () => {
    authErrorCallbacks = authErrorCallbacks.filter((cb) => cb !== callback);
  };
}

export function disconnect(): void {
  shouldReconnect = false;
  authRejected = false;
  openedAt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }
  reconnectAttempt = 0;
  messageCallbacks = [];
  statusCallbacks = [];
  authErrorCallbacks = [];
  notifyStatus(false);
}
