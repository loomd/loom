import type { RelayMessage } from "@/types";

type MessageCallback = (message: RelayMessage) => void;
type StatusCallback = (connected: boolean) => void;

const MAX_RECONNECT_DELAY = 30000;

let ws: WebSocket | null = null;
let messageCallbacks: MessageCallback[] = [];
let statusCallbacks: StatusCallback[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let shouldReconnect = false;
let currentUrl = "";
let currentToken = "";
let currentCode = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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

function getReconnectDelay(): number {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
  reconnectAttempt++;
  return delay;
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
  if (reconnectTimer) return;

  const delay = getReconnectDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldReconnect) {
      connectInternal();
    }
  }, delay);
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

  const url = `${currentUrl}/ws/mobile?token=${encodeURIComponent(currentToken)}&code=${encodeURIComponent(currentCode)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempt = 0;
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
        // Raw text stream from app-server, wrap as chat
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

  ws.onclose = () => {
    stopHeartbeat();
    notifyStatus(false);
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose 会紧随其后触发
  };
}

export function connectToRelay(
  baseUrl: string,
  token: string,
  code: string,
): void {
  const wsUrl = baseUrl.replace(/^http/, "ws");
  currentUrl = wsUrl;
  currentToken = token;
  currentCode = code;
  shouldReconnect = true;
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

export function disconnect(): void {
  shouldReconnect = false;
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
  notifyStatus(false);
}
