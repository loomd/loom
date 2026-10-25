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
}

// ---- Pairing ----

export interface PairCreateResponse {
  code: string;
  expiresAt: number; // Unix timestamp (seconds)
}

export interface PairVerifyRequest {
  code: string;
}

export interface PairVerifyResponse {
  valid: boolean;
}

// ---- WebSocket relay ----

export interface RelayControlMessage {
  type: "control";
  event: "peer_connected" | "peer_disconnected" | "error";
  data?: unknown;
}

export interface RelayDataMessage {
  type: "data";
  payload: string;
}

export type RelayMessage = RelayControlMessage | RelayDataMessage;

// ---- App-level session status (used by desktop GUI) ----

export type AppServerSessionStatus =
  | "stopped"
  | "waiting_pairing"
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
