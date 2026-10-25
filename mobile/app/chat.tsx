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
} from "react-native";
import { useRouter } from "expo-router";
import type { ChatMessage, RelayMessage } from "@/types";
import {
  onMessage,
  onStatusChange,
  send,
  disconnect,
} from "@/services/websocket";
import { clearToken } from "@/services/storage";
import { StatusBar } from "@/components/StatusBar";
import { ChatBubble } from "@/components/ChatBubble";
import { PermissionCard, type PermissionRequest } from "@/components/PermissionCard";

let nextId = 1;

function generateId(): string {
  return `msg_${Date.now()}_${nextId++}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [connected, setConnected] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const unsubStatus = onStatusChange((isConnected) => {
      setConnected(isConnected);
    });

    const unsubMessage = onMessage((relayMsg: RelayMessage) => {
      if (relayMsg.type === "chat") {
        // 尝试解析是否是权限请求 JSON-RPC
        try {
          const parsed = JSON.parse(relayMsg.payload);
          if (parsed && parsed.method === "request_permission" && parsed.params) {
            setPendingPermission({
              id: parsed.id || `perm_${Date.now()}`,
              title: parsed.params.title || "权限确认请求",
              description: parsed.params.description || "",
              options: parsed.params.options || [],
            });
            return;
          }
        } catch {
          // 普通文本消息
        }

        const agentMessage: ChatMessage = {
          id: generateId(),
          role: "agent",
          content: relayMsg.payload,
          timestamp: relayMsg.timestamp,
          status: "delivered",
        };
        setMessages((prev) => [...prev, agentMessage]);
      }
    });

    return () => {
      unsubStatus();
      unsubMessage();
    };
  }, []);

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
    const response = {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        confirmed: true,
        selectedOptions: selectedOptions || [],
      },
    };
    send(JSON.stringify(response));
    setPendingPermission(null);
  };

  const handleRejectPermission = (requestId: string) => {
    const response = {
      jsonrpc: "2.0",
      id: requestId,
      result: {
        confirmed: false,
      },
    };
    send(JSON.stringify(response));
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
