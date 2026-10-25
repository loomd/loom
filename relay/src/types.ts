// ============================================================
// Shared types for Loom Relay (relay / mobile / desktop)
// ============================================================

// ---- Auth ----

export interface AuthRegisterRequest {
  username: string;
  password: string;
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: number; // Unix timestamp (seconds)
  username: string;
}

// ---- Pairing ----

export interface PairCreateResponse {
  code: string;
  expiresAt: number; // Unix timestamp (seconds)
}

export interface PairVerifyRequest {
  code: string;
  /** 手机端设备标识：绑定后用于识别「同一台设备」的重连 */
  deviceId?: string;
}

export interface PairVerifyResponse {
  valid: boolean;
  success: boolean;
  workspaceId?: string;
  workspaceName?: string;
}

// ---- WebSocket relay ----

export interface RelayControlMessage {
  type: "control";
  event: "peer_connected" | "peer_disconnected" | "error";
  data?: unknown;
}

/**
 * 业务帧类型：桌面端 ↔ 手机端之间的 Loom 远程聊天帧协议。
 *
 * 中继层不解析业务语义，只做字节转发（唯一例外：`type === "control"` 的帧不转发）。
 * 实际出现的帧类型没有 "data" 这种通用容器帧，全部是下面这些具名帧。
 */
export type RelayFrameType =
  | "chat"
  | "chat_end"
  | "thinking"
  | "tool_call"
  | "permission_request"
  | "permission_response"
  | "error"
  | "control"
  | "ping"
  | "pong";

export interface RelayFrameMessage {
  type: RelayFrameType;
  payload: string;
  timestamp?: number;
}

export type RelayMessage = RelayControlMessage | RelayFrameMessage;

// ---- App-level session status (used by desktop GUI) ----

/** 桌面端远程会话状态，与 crates/gui/src-tauri/src/relay_adapter.rs 的 RemoteSessionInfo 对齐 */
export type RemoteSessionStatus =
  | "stopped"
  | "starting"
  | "waiting_pairing"
  | "waiting_mobile"
  | "connecting"
  | "connected";

// ---- HTTP response envelope ----

export interface ApiOk<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: string;
}

export type ApiResponse<T = unknown> = ApiOk<T> | ApiErr;

// ---- JWT payload ----

export interface JwtPayload {
  userId: number;
  username: string;
}

// ---- Admin User Management ----

export interface UserSummary {
  id: number;
  username: string;
  createdAt: string;
}

export interface AdminCreateUserRequest {
  username: string;
  password: string;
}

export interface AdminResetPasswordRequest {
  userId: number;
  password: string;
}
