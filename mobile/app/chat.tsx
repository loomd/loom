import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import type { ChatMessage, RelayMessage } from "@/types";
import {
  onMessage,
  onStatusChange,
  onAuthError,
  send,
  sendPermissionResponse,
  connectToRelay,
  disconnect,
} from "@/services/websocket";
import {
  clearToken,
  getToken,
  getServerUrl,
  getDeviceId,
  getLastPairInfo,
} from "@/services/storage";
import { setBaseUrl } from "@/services/api";
import { StatusBar } from "@/components/StatusBar";
import { ChatBubble } from "@/components/ChatBubble";
import { PermissionCard, type PermissionOption, type PermissionRequest } from "@/components/PermissionCard";

let nextId = 1;

function generateId(): string {
  return `msg_${Date.now()}_${nextId++}`;
}

/** 把桌面端下发的权限请求 JSON 转成审批卡片需要的结构。 */
function toPermissionRequest(parsed: {
  id?: string;
  params?: {
    title?: string;
    description?: string;
    options?: PermissionOption[];
  };
}): PermissionRequest {
  return {
    id: parsed.id || `perm_${Date.now()}`,
    title: parsed.params?.title || "权限确认请求",
    description: parsed.params?.description || "",
    options: parsed.params?.options || [],
  };
}

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  // 正在累积内容的 Agent 回复气泡
  const activeAgentIdRef = useRef<string | null>(null);
  // 尚未归入气泡的思考过程
  const thinkingRef = useRef("");
  // toolCallId -> 已创建的气泡 ID
  const toolCallIdsRef = useRef<Record<string, string>>({});

  // 追加 Agent 回复增量：同一轮的多段增量合并到同一个气泡里
  const appendAgentText = useCallback((text: string, timestamp: number) => {
    if (!text) return;
    const activeId = activeAgentIdRef.current;
    if (activeId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === activeId ? { ...m, content: m.content + text } : m)),
      );
      return;
    }
    const id = generateId();
    activeAgentIdRef.current = id;
    const thinking = thinkingRef.current;
    thinkingRef.current = "";
    const content = thinking ? `<thinking>${thinking}</thinking>\n${text}` : text;
    setMessages((prev) => [
      ...prev,
      { id, role: "agent", content, timestamp, status: "delivered" },
    ]);
  }, []);

  // 思考过程增量：正文气泡还没开时先缓存；已经开了则并入该气泡的 <thinking> 块
  const appendThinking = useCallback((text: string) => {
    if (!text) return;
    const activeId = activeAgentIdRef.current;
    if (!activeId) {
      thinkingRef.current += text;
      return;
    }
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== activeId) return m;
        const matched = m.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
        if (matched) {
          const head = `<thinking>${matched[1]}${text}</thinking>`;
          return { ...m, content: head + m.content.slice(matched[0].length) };
        }
        return { ...m, content: `<thinking>${text}</thinking>\n${m.content}` };
      }),
    );
  }, []);

  // 工具调用：同一个 toolCallId 的状态更新合并到同一条
  const appendToolCall = useCallback((payload: string) => {
    let toolCallId = "";
    let label = payload;
    try {
      const info = JSON.parse(payload) as {
        toolCallId?: string;
        name?: string;
        title?: string;
        status?: string;
      };
      toolCallId = info.toolCallId || "";
      const name = info.name || info.title || "工具";
      label = `[工具] ${name} · ${info.status || "pending"}`;
    } catch {
      return;
    }
    if (!toolCallId) return;
    const existingId = toolCallIdsRef.current[toolCallId];
    if (existingId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === existingId ? { ...m, content: label } : m)),
      );
      return;
    }
    const id = generateId();
    toolCallIdsRef.current[toolCallId] = id;
    setMessages((prev) => [
      ...prev,
      { id, role: "agent", content: label, timestamp: Date.now(), status: "delivered" },
    ]);
  }, []);

  const appendError = useCallback((text: string) => {
    const id = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "agent",
        content: `[错误] ${text}`,
        timestamp: Date.now(),
        status: "error",
      },
    ]);
  }, []);

  useEffect(() => {
    const unsubStatus = onStatusChange((isConnected) => {
      setConnected(isConnected);
    });

    // 鉴权失败（未绑定 / 绑定失效 / 绑定到其他设备）：引导用户重新配对
    const unsubAuthError = onAuthError((reason) => {
      Alert.alert(
        "需要重新配对",
        reason || "绑定已失效，请在桌面端生成新的配对码后重新输入",
      );
      router.replace("/pair");
    });

    const unsubMessage = onMessage((relayMsg: RelayMessage) => {
      switch (relayMsg.type) {
        case "chat": {
          // 兼容旧版桌面端：权限请求以 JSON 形式塞在 chat 信封里
          if (relayMsg.payload.startsWith("{")) {
            try {
              const parsed = JSON.parse(relayMsg.payload);
              if (parsed && parsed.method === "request_permission" && parsed.params) {
                setPendingPermission(toPermissionRequest(parsed));
                return;
              }
            } catch {
              // 普通文本消息
            }
          }
          appendAgentText(relayMsg.payload, relayMsg.timestamp);
          return;
        }
        case "chat_end": {
          activeAgentIdRef.current = null;
          thinkingRef.current = "";
          return;
        }
        case "thinking": {
          appendThinking(relayMsg.payload);
          return;
        }
        case "tool_call": {
          appendToolCall(relayMsg.payload);
          return;
        }
        case "permission_request": {
          try {
            const parsed = JSON.parse(relayMsg.payload);
            if (parsed && parsed.params) {
              setPendingPermission(toPermissionRequest(parsed));
            }
          } catch {
            // 忽略无法解析的权限请求
          }
          return;
        }
        case "error": {
          appendError(relayMsg.payload);
          return;
        }
        default:
          return;
      }
    });

    return () => {
      unsubStatus();
      unsubAuthError();
      unsubMessage();
    };
  }, [appendAgentText, appendThinking, appendToolCall, appendError, router]);

  // 进入聊天页即自动建联：已绑定的账号凭 token 直接连上，无需输入配对码
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) router.replace("/login");
        return;
      }
      const serverUrl = await getServerUrl();
      setBaseUrl(serverUrl);
      const deviceId = await getDeviceId();
      const pairInfo = await getLastPairInfo();
      if (cancelled) return;
      connectToRelay(serverUrl, token, pairInfo?.code, deviceId);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      status: "sending",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    send(text);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === userMessage.id ? { ...m, status: "sent" as const } : m,
      ),
    );
  }, [inputText]);

  async function handleDisconnect() {
    disconnect();
    await clearToken();
    router.replace("/login");
  }

  const handleApprovePermission = (requestId: string, selectedOptions?: string[]) => {
    sendPermissionResponse(requestId, true, selectedOptions?.[0]);
    setPendingPermission(null);
  };

  const handleRejectPermission = (requestId: string) => {
    sendPermissionResponse(requestId, false);
    setPendingPermission(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <StatusBar
        connected={connected}
        onDisconnect={handleDisconnect}
      />

      {/* 权限确认审批卡片 */}
      {pendingPermission && (
        <View style={styles.permissionWrapper}>
          <PermissionCard
            request={pendingPermission}
            onApprove={handleApprovePermission}
            onReject={handleRejectPermission}
          />
        </View>
      )}

      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        renderItem={({ item }) => <ChatBubble message={item} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              已连接到工作区，发送消息开始对话
            </Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="输入消息..."
          placeholderTextColor="#71717a"
          multiline
          maxLength={4096}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendButtonText}>发送</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  permissionWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 120,
  },
  emptyText: {
    color: "#52525b",
    fontSize: 14,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#16161d",
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#20202a",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    color: "#f4f4f5",
    fontSize: 15,
    maxHeight: 120,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#6366f1",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#2e2e3e",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
