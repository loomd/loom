import type { ChatMessage, ToolCallInfo } from "@/types";

/**
 * 对话消息的组装规则。
 *
 * 桌面端按帧推送：正文增量、思考增量、工具调用交替到达。
 * 这里严格按到达顺序落库，并把「连续的多个工具调用」保留为多条消息，
 * 由渲染层合并成一行，避免出现「工具一次显示一大排」。
 */

let seq = 1;

export function createMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${seq++}`;
}

export function createTextMessage(
  text: string,
  role: "user" | "agent" = "agent",
): ChatMessage {
  return {
    id: createMessageId("msg"),
    role,
    kind: "text",
    content: text,
    timestamp: Date.now(),
    status: "delivered",
  };
}

export function createThinkingMessage(text: string): ChatMessage {
  return {
    id: createMessageId("think"),
    role: "agent",
    kind: "thinking",
    content: text,
    timestamp: Date.now(),
    status: "delivered",
  };
}

export function createToolMessage(tool: ToolCallInfo): ChatMessage {
  return {
    id: createMessageId("tool"),
    role: "agent",
    kind: "tool",
    content: tool.title || tool.name,
    timestamp: Date.now(),
    status: "delivered",
    tool,
  };
}

export function createErrorMessage(text: string): ChatMessage {
  return {
    id: createMessageId("err"),
    role: "agent",
    kind: "error",
    content: text,
    timestamp: Date.now(),
    status: "error",
  };
}

/**
 * 追加正文增量。
 *
 * 只有当列表最后一条仍是 Agent 正文时才合并，否则新起一条，
 * 这样「正文 → 工具调用 → 正文」会如实呈现为三段而不是被合并成一段。
 */
export function appendText(
  messages: ChatMessage[],
  text: string,
): ChatMessage[] {
  if (!text) return messages;

  const last = messages[messages.length - 1];
  if (last && last.kind === "text" && last.role === "agent") {
    const next = messages.slice(0, -1);
    next.push({ ...last, content: last.content + text });
    return next;
  }

  return [...messages, createTextMessage(text)];
}

/** 追加思考增量：连续的思考片段合并为同一条 */
export function appendThinking(
  messages: ChatMessage[],
  text: string,
): ChatMessage[] {
  if (!text) return messages;

  const last = messages[messages.length - 1];
  if (last && last.kind === "thinking") {
    const next = messages.slice(0, -1);
    next.push({ ...last, content: last.content + text });
    return next;
  }

  return [...messages, createThinkingMessage(text)];
}

/**
 * 写入/更新工具调用。
 *
 * 同一 toolCallId 的后续状态更新原地覆盖，不会产生重复条目。
 */
export function upsertTool(
  messages: ChatMessage[],
  tool: ToolCallInfo,
): ChatMessage[] {
  const index = messages.findIndex(
    (m) => m.kind === "tool" && m.tool?.toolCallId === tool.toolCallId,
  );

  if (index >= 0) {
    const next = messages.slice();
    const existing = next[index];
    next[index] = {
      ...existing,
      content: tool.title || tool.name || existing.content,
      tool: { ...(existing.tool as ToolCallInfo), ...tool },
    };
    return next;
  }

  return [...messages, createToolMessage(tool)];
}

/** 解析桌面端下发的工具调用负载 */
export function parseToolCall(payload: string): ToolCallInfo | null {
  try {
    const info = JSON.parse(payload) as Partial<ToolCallInfo>;
    if (!info || !info.toolCallId) return null;
    return {
      toolCallId: info.toolCallId,
      title: info.title || "",
      name: info.name || info.title || "",
      kind: info.kind || "",
      status: info.status || "pending",
    };
  } catch {
    return null;
  }
}

/**
 * 把最早一条尚未回执的用户提问标记为「已送达」。
 *
 * 覆盖两种情形：
 * - `sent`：普通提问，Agent 已经开始回应；
 * - `queued`：本轮对话进行中排队的提问，Agent 已轮到执行它。
 */
export function markUserMessageDelivered(
  messages: ChatMessage[],
): ChatMessage[] {
  const index = messages.findIndex(
    (m) =>
      m.role === "user" && (m.status === "queued" || m.status === "sent"),
  );
  if (index < 0) return messages;
  const next = messages.slice();
  next[index] = { ...next[index], status: "delivered" };
  return next;
}

/** 叫停：排队中的提问一并标记为已取消 */
export function markQueuedCancelled(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.role === "user" && m.status === "queued"
      ? { ...m, status: "cancelled" as const }
      : m,
  );
}

/**
 * 列表渲染单元。
 *
 * 连续的多个工具调用合并成一个「tools」单元，
 * 从而在对话流里只占一行，而不是堆出一长条工具卡片。
 */
export type ConversationRowItem =
  | { key: string; type: "message"; message: ChatMessage }
  | { key: string; type: "tools"; tools: ToolCallInfo[] };

/** 把消息序列转换为渲染单元序列（合并连续工具调用） */
export function buildConversationRows(
  messages: ChatMessage[],
): ConversationRowItem[] {
  const rows: ConversationRowItem[] = [];
  let pendingTools: ToolCallInfo[] = [];

  const flushTools = () => {
    if (pendingTools.length === 0) return;
    rows.push({
      key: `tools-${pendingTools[0].toolCallId || pendingTools.length}`,
      type: "tools",
      tools: pendingTools,
    });
    pendingTools = [];
  };

  for (const message of messages) {
    if (message.kind === "tool" && message.tool) {
      pendingTools.push(message.tool);
      continue;
    }
    flushTools();
    rows.push({ key: message.id, type: "message", message });
  }
  flushTools();

  return rows;
}
