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
  username: string;
}

export interface PairCreateResponse {
  code: string;
  expiresAt: number;
}

export interface PairVerifyRequest {
  code: string;
  /** 手机端设备标识 */
  deviceId?: string;
}

export interface PairVerifyResponse {
  success?: boolean;
  valid?: boolean;
  workspaceId?: string;
  workspaceName?: string;
}

/** 账号与手机端的绑定状态 */
export interface PairBindingResponse {
  paired: boolean;
  pairedAt: string | null;
  deviceName: string | null;
}

export interface RelayMessage {
  type:
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
  payload: string;
  timestamp: number;
}

export interface ControlEvent {
  action: string;
  target: string;
  params?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
  status: "sending" | "sent" | "delivered" | "error";
}
