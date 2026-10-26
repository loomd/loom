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
  /** 绑定归属的设备标识：用于判断绑定是否属于本机 */
  deviceId?: string | null;
}

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
}

export interface ModelItem {
  id: string;
  name: string;
  args: string[];
}

export interface RelayMessage {
  type:
    | "chat"
    | "chat_end"
    | "thinking"
    | "tool_call"
    | "permission_request"
    | "permission_response"
    | "project_list"
    | "project_switched"
    | "model_list"
    | "model_switched"
    | "switch_project"
    | "switch_model"
    | "get_context"
    | "stop"
    | "error"
    | "control"
    | "ping"
    | "pong";
  payload: string;
  timestamp: number;
  /**
   * 帧归属的项目 ID。
   *
   * 桌面端多项目的会话可以同时在跑，帧本身必须带归属信息，
   * 否则「对话中途切项目」时内容会被写进正在看的那个项目。
   */
  projectId?: string;
}

export interface ControlEvent {
  action: string;
  target: string;
  params?: Record<string, string>;
}

/** 消息类型：正文 / 思考过程 / 工具调用 / 错误 */
export type MessageKind = "text" | "thinking" | "tool" | "error";

/** 工具调用快照（对应桌面端下发的 tool_call 帧负载） */
export interface ToolCallInfo {
  toolCallId: string;
  /** 展示标题，如「读取文件」 */
  title: string;
  /** 工具名，如 read_file */
  name: string;
  /** 工具类别，如 execute / edit */
  kind: string;
  /** 状态：pending / in_progress / completed / failed */
  status: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  /** 消息类别，决定渲染方式 */
  kind: MessageKind;
  content: string;
  timestamp: number;
  /**
   * 消息状态：
   * - `sending` 刚发出，等待上行
   * - `sent` 已送达桌面端
   * - `queued` 本轮对话进行中，排队等待执行
   * - `delivered` Agent 已开始/完成回应
   * - `cancelled` 排队中被叫停，一并取消
   * - `error` 出错
   */
  status: "sending" | "sent" | "queued" | "delivered" | "cancelled" | "error";
  /** kind 为 tool 时的工具调用快照 */
  tool?: ToolCallInfo;
}
