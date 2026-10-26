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
  Modal,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import type { ChatMessage, RelayMessage, ProjectItem, ModelItem } from "@/types";
import {
  onMessage,
  onStatusChange,
  onAuthError,
  send,
  sendPermissionResponse,
  connectToRelay,
  disconnect,
  sendSwitchProject,
  sendSwitchModel,
  requestContext,
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

/** 单个项目的独立会话状态容器 */
interface ProjectSessionState {
  messages: ChatMessage[];
  draftText: string;
  modelId: string;
  activeAgentId: string | null;
  thinkingText: string;
  toolCallIds: Record<string, string>;
  pendingPermission: PermissionRequest | null;
}

function createDefaultSessionState(modelId: string = "default"): ProjectSessionState {
  return {
    messages: [],
    draftText: "",
    modelId,
    activeAgentId: null,
    thinkingText: "",
    toolCallIds: {},
    pendingPermission: null,
  };
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

  // 1. 已开放的项目与模型清单
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("");
  const [showProjectDrawer, setShowProjectDrawer] = useState(false);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // 2. 每个项目独立的会话状态池：projectId -> ProjectSessionState
  const [sessions, setSessions] = useState<Record<string, ProjectSessionState>>({});

  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // 使用 ref 跟踪当前活动项目 ID，避免 WebSocket 回调闭包捕获旧状态
  const activeProjectIdRef = useRef<string>("");
  useEffect(() => {
    activeProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  // 当前活动项目的独立会话数据
  const currentSession = sessions[currentProjectId] || createDefaultSessionState();
  const currentMessages = currentSession.messages;
  const currentModelId = currentSession.modelId;
  const currentInputText = currentSession.draftText;
  const currentPendingPermission = currentSession.pendingPermission;

  // 获取当前项目名称和当前模型名称
  const currentProjectName = projects.find((p) => p.id === currentProjectId)?.name || "默认工作区";
  const currentModelName = models.find((m) => m.id === currentModelId)?.name || "mcode (默认)";

  // 更新当前项目的输入框草稿
  const handleInputChange = (text: string) => {
    if (!currentProjectId) return;
    setSessions((prev) => {
      const sess = prev[currentProjectId] || createDefaultSessionState();
      return {
        ...prev,
        [currentProjectId]: { ...sess, draftText: text },
      };
    });
  };

  // 追加消息到指定项目的独立流中
  const appendMessage = useCallback((msg: ChatMessage, projId?: string) => {
    const targetPid = projId || activeProjectIdRef.current;
    if (!targetPid) return;

    setSessions((prev) => {
      const sess = prev[targetPid] || createDefaultSessionState();
      return {
        ...prev,
        [targetPid]: {
          ...sess,
          messages: [...sess.messages, msg],
        },
      };
    });
  }, []);

  // 追加 Agent 文本增量（合并到该项目当前活跃回复气泡）
  const appendAgentText = useCallback((text: string, timestamp: number) => {
    if (!text) return;
    const targetPid = activeProjectIdRef.current;
    if (!targetPid) return;

    setSessions((prev) => {
      const sess = prev[targetPid] || createDefaultSessionState();
      const activeId = sess.activeAgentId;

      if (activeId) {
        return {
          ...prev,
          [targetPid]: {
            ...sess,
            messages: sess.messages.map((m) =>
              m.id === activeId ? { ...m, content: m.content + text } : m,
            ),
          },
        };
      }

      const id = generateId();
      const thinking = sess.thinkingText;
      const content = thinking ? `<thinking>${thinking}</thinking>\n${text}` : text;
      const newMsg: ChatMessage = {
        id,
        role: "agent",
        content,
        timestamp,
        status: "delivered",
      };

      return {
        ...prev,
        [targetPid]: {
          ...sess,
          activeAgentId: id,
          thinkingText: "",
          messages: [...sess.messages, newMsg],
        },
      };
    });
  }, []);

  // 追加思考过程增量
  const appendThinking = useCallback((text: string) => {
    if (!text) return;
    const targetPid = activeProjectIdRef.current;
    if (!targetPid) return;

    setSessions((prev) => {
      const sess = prev[targetPid] || createDefaultSessionState();
      const activeId = sess.activeAgentId;

      if (!activeId) {
        return {
          ...prev,
          [targetPid]: {
            ...sess,
            thinkingText: sess.thinkingText + text,
          },
        };
      }

      return {
        ...prev,
        [targetPid]: {
          ...sess,
          messages: sess.messages.map((m) => {
            if (m.id !== activeId) return m;
            const matched = m.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
            if (matched) {
              const head = `<thinking>${matched[1]}${text}</thinking>`;
              return { ...m, content: head + m.content.slice(matched[0].length) };
            }
            return { ...m, content: `<thinking>${text}</thinking>\n${m.content}` };
          }),
        },
      };
    });
  }, []);

  // 追加工具调用状态
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

    const targetPid = activeProjectIdRef.current;
    if (!targetPid) return;

    setSessions((prev) => {
      const sess = prev[targetPid] || createDefaultSessionState();
      const existingId = sess.toolCallIds[toolCallId];

      if (existingId) {
        return {
          ...prev,
          [targetPid]: {
            ...sess,
            messages: sess.messages.map((m) =>
              m.id === existingId ? { ...m, content: label } : m,
            ),
          },
        };
      }

      const id = generateId();
      const newMsg: ChatMessage = {
        id,
        role: "agent",
        content: label,
        timestamp: Date.now(),
        status: "delivered",
      };

      return {
        ...prev,
        [targetPid]: {
          ...sess,
          toolCallIds: { ...sess.toolCallIds, [toolCallId]: id },
          messages: [...sess.messages, newMsg],
        },
      };
    });
  }, []);

  useEffect(() => {
    const unsubStatus = onStatusChange((isConnected) => {
      setConnected(isConnected);
      if (isConnected) {
        setAuthError(null);
        requestContext();
      }
    });

    const unsubAuthError = onAuthError((reason) => {
      const detail =
        reason || "绑定已失效，请在桌面端点击「开启远程会话」生成新的配对码";
      setAuthError(detail);
      Alert.alert("绑定已失效", detail, [
        {
          text: "去重新配对",
          onPress: () =>
            router.replace({ pathname: "/pair", params: { reason: detail } }),
        },
        { text: "稍后再说", style: "cancel" },
      ]);
    });

    const unsubMessage = onMessage((relayMsg: RelayMessage) => {
      switch (relayMsg.type) {
        case "project_list": {
          try {
            const data = JSON.parse(relayMsg.payload) as {
              currentProjectId: string;
              projects: ProjectItem[];
            };
            if (data.projects && Array.isArray(data.projects)) {
              setProjects(data.projects);
              if (!activeProjectIdRef.current) {
                const initialPid = data.currentProjectId || data.projects[0]?.id || "";
                setCurrentProjectId(initialPid);
              }
            }
          } catch {
            // ignore
          }
          return;
        }
        case "model_list": {
          try {
            const data = JSON.parse(relayMsg.payload) as {
              currentModelId: string;
              models: ModelItem[];
            };
            if (data.models && Array.isArray(data.models)) {
              setModels(data.models);
            }
          } catch {
            // ignore
          }
          return;
        }
        case "project_switched": {
          try {
            const data = JSON.parse(relayMsg.payload) as {
              projectId: string;
              projectName: string;
              workspaceDir: string;
            };
            setCurrentProjectId(data.projectId);
          } catch {
            // ignore
          }
          return;
        }
        case "model_switched": {
          try {
            const data = JSON.parse(relayMsg.payload) as {
              modelId: string;
              modelName: string;
            };
            const targetPid = activeProjectIdRef.current;
            if (targetPid) {
              setSessions((prev) => {
                const sess = prev[targetPid] || createDefaultSessionState();
                return {
                  ...prev,
                  [targetPid]: { ...sess, modelId: data.modelId },
                };
              });
            }
          } catch {
            // ignore
          }
          return;
        }
        case "chat": {
          if (relayMsg.payload.startsWith("{")) {
            try {
              const parsed = JSON.parse(relayMsg.payload);
              if (parsed && parsed.method === "request_permission" && parsed.params) {
                const targetPid = activeProjectIdRef.current;
                if (targetPid) {
                  setSessions((prev) => {
                    const sess = prev[targetPid] || createDefaultSessionState();
                    return {
                      ...prev,
                      [targetPid]: {
                        ...sess,
                        pendingPermission: toPermissionRequest(parsed),
                      },
                    };
                  });
                }
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
          const targetPid = activeProjectIdRef.current;
          if (targetPid) {
            setSessions((prev) => {
              const sess = prev[targetPid];
              if (!sess) return prev;
              return {
                ...prev,
                [targetPid]: {
                  ...sess,
                  activeAgentId: null,
                  thinkingText: "",
                },
              };
            });
          }
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
              const targetPid = activeProjectIdRef.current;
              if (targetPid) {
                setSessions((prev) => {
                  const sess = prev[targetPid] || createDefaultSessionState();
                  return {
                    ...prev,
                    [targetPid]: {
                      ...sess,
                      pendingPermission: toPermissionRequest(parsed),
                    },
                  };
                });
              }
            }
          } catch {
            // 忽略
          }
          return;
        }
        case "error": {
          appendMessage({
            id: generateId(),
            role: "agent",
            content: `[错误] ${relayMsg.payload}`,
            timestamp: Date.now(),
            status: "error",
          });
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
  }, [appendAgentText, appendThinking, appendToolCall, appendMessage, router]);

  // 初始建联
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
    if (currentMessages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [currentMessages]);

  const handleSend = useCallback(() => {
    const text = currentInputText.trim();
    if (!text || !currentProjectId) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      status: "sending",
    };

    // 清空草稿并放入用户提问气泡
    setSessions((prev) => {
      const sess = prev[currentProjectId] || createDefaultSessionState();
      return {
        ...prev,
        [currentProjectId]: {
          ...sess,
          draftText: "",
          messages: [...sess.messages, userMessage],
        },
      };
    });

    // 发送消息：桌面端在此时才会为该项目按需拉起对应模型的 ACP 进程
    send(text);

    // 标记为已发送
    setSessions((prev) => {
      const sess = prev[currentProjectId];
      if (!sess) return prev;
      return {
        ...prev,
        [currentProjectId]: {
          ...sess,
          messages: sess.messages.map((m) =>
            m.id === userMessage.id ? { ...m, status: "sent" as const } : m,
          ),
        },
      };
    });
  }, [currentInputText, currentProjectId]);

  async function handleDisconnect() {
    disconnect();
    await clearToken();
    router.replace("/login");
  }

  const handleApprovePermission = (requestId: string, selectedOptions?: string[]) => {
    sendPermissionResponse(requestId, true, selectedOptions?.[0]);
    if (currentProjectId) {
      setSessions((prev) => {
        const sess = prev[currentProjectId];
        if (!sess) return prev;
        return {
          ...prev,
          [currentProjectId]: { ...sess, pendingPermission: null },
        };
      });
    }
  };

  const handleRejectPermission = (requestId: string) => {
    sendPermissionResponse(requestId, false);
    if (currentProjectId) {
      setSessions((prev) => {
        const sess = prev[currentProjectId];
        if (!sess) return prev;
        return {
          ...prev,
          [currentProjectId]: { ...sess, pendingPermission: null },
        };
      });
    }
  };

  // 切换项目：切换到对应项目的独立会话空间
  const handleSelectProject = (proj: ProjectItem) => {
    setShowProjectDrawer(false);
    if (proj.id === currentProjectId) return;
    setCurrentProjectId(proj.id);
    sendSwitchProject(proj.id);
  };

  // 切换模型：仅改变当前项目的选定模型设置
  const handleSelectModel = (model: ModelItem) => {
    setShowModelPicker(false);
    if (model.id === currentModelId) return;

    if (currentProjectId) {
      setSessions((prev) => {
        const sess = prev[currentProjectId] || createDefaultSessionState();
        return {
          ...prev,
          [currentProjectId]: { ...sess, modelId: model.id },
        };
      });
    }

    sendSwitchModel(model.id);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      {/* 顶部自定义状态栏 */}
      <StatusBar
        connected={connected}
        currentProjectName={currentProjectName}
        currentModelName={currentModelName}
        onOpenProjects={() => setShowProjectDrawer(true)}
        onOpenModels={() => setShowModelPicker(true)}
        onDisconnect={handleDisconnect}
      />

      {/* 鉴权失败横幅 */}
      {authError ? (
        <View style={styles.authBanner}>
          <Text style={styles.authBannerText} numberOfLines={2}>
            {authError}
          </Text>
          <TouchableOpacity
            style={styles.authBannerButton}
            onPress={() =>
              router.replace({
                pathname: "/pair",
                params: { reason: authError },
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.authBannerButtonText}>重新配对</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 权限确认审批卡片 */}
      {currentPendingPermission && (
        <View style={styles.permissionWrapper}>
          <PermissionCard
            request={currentPendingPermission}
            onApprove={handleApprovePermission}
            onReject={handleRejectPermission}
          />
        </View>
      )}

      {/* 当前项目的独立聊天气泡流 */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={currentMessages}
        renderItem={({ item }) => <ChatBubble message={item} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBadge}>
              <Text style={styles.emptyIconBadgeText}>📁</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {currentProjectName}
            </Text>
            <Text style={styles.emptySubText}>
              当前项目尚未开启对话（ACP 进程处于休眠状态）
            </Text>
            <View style={styles.modelTag}>
              <Text style={styles.modelTagText}>
                待激活 Agent: {currentModelName}
              </Text>
            </View>
            <Text style={styles.emptyTip}>
              在下方输入消息并发送，将即时为该项目拉起专属 ACP 会话
            </Text>
          </View>
        }
      />

      {/* 底部输入框 */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={currentInputText}
          onChangeText={handleInputChange}
          placeholder={`向 ${currentProjectName} 发送消息...`}
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
            !currentInputText.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!currentInputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendButtonText}>发送</Text>
        </TouchableOpacity>
      </View>

      {/* 侧边栏：多项目切换抽屉（停靠在左侧） */}
      <Modal
        visible={showProjectDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectDrawer(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerTitle}>工作区项目</Text>
                <Text style={styles.drawerSubtitle}>
                  已开放 Loom 项目 ({projects.length}) · 独立工作区
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowProjectDrawer(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.drawerList}>
              {projects.length === 0 ? (
                <View style={styles.drawerEmpty}>
                  <Text style={styles.drawerEmptyText}>
                    暂未同步到已注册项目，连接后自动加载
                  </Text>
                </View>
              ) : (
                projects.map((proj) => {
                  const isSelected = proj.id === currentProjectId;
                  const sess = sessions[proj.id];
                  const msgCount = sess?.messages?.length || 0;
                  const hasConversation = msgCount > 0;

                  return (
                    <TouchableOpacity
                      key={proj.id}
                      style={[
                        styles.projectItem,
                        isSelected && styles.projectItemSelected,
                      ]}
                      onPress={() => handleSelectProject(proj)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.projectItemHeader}>
                        <Text style={styles.projectItemIcon}>📁</Text>
                        <Text
                          style={[
                            styles.projectItemName,
                            isSelected && styles.projectItemNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {proj.name}
                        </Text>
                        {isSelected ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>当前活动</Text>
                          </View>
                        ) : hasConversation ? (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>{msgCount} 条对话</Text>
                          </View>
                        ) : (
                          <View style={styles.idleBadge}>
                            <Text style={styles.idleBadgeText}>空对话</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.projectItemPath} numberOfLines={1}>
                        {proj.path}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
          <TouchableOpacity
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={() => setShowProjectDrawer(false)}
          />
        </View>
      </Modal>

      {/* 模型选择弹出层 */}
      <Modal
        visible={showModelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlayCenter}
          activeOpacity={1}
          onPress={() => setShowModelPicker(false)}
        >
          <View
            style={styles.modelDialog}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modelDialogHeader}>
              <Text style={styles.modelDialogTitle}>为当前项目切换 Agent 模型</Text>
              <Text style={styles.modelDialogSubtitle}>
                当前工作区: 【{currentProjectName}】
              </Text>
            </View>

            <ScrollView style={[styles.modelList, { maxHeight: 360 }]}>
              {models.length === 0 ? (
                <View style={styles.drawerEmpty}>
                  <Text style={styles.drawerEmptyText}>
                    暂无可用模型，连接后自动加载
                  </Text>
                </View>
              ) : (
                models.map((model) => {
                  const isSelected = model.id === currentModelId;
                  const argsDesc = model.args && model.args.length > 0 ? model.args.join(" ") : "默认配置";
                  return (
                    <TouchableOpacity
                      key={model.id}
                      style={[
                        styles.modelItem,
                        isSelected && styles.modelItemSelected,
                      ]}
                      onPress={() => handleSelectModel(model)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modelItemLeft}>
                        <Text style={styles.modelItemIcon}>🤖</Text>
                        <View style={styles.modelItemTextGroup}>
                          <Text
                            style={[
                              styles.modelItemName,
                              isSelected && styles.modelItemNameSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {model.name}
                          </Text>
                          <Text style={styles.modelItemArgs} numberOfLines={1}>
                            {argsDesc}
                          </Text>
                        </View>
                      </View>
                      {isSelected && (
                        <View style={styles.activeCheckmark}>
                          <Text style={styles.activeCheckmarkText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modelCancelButton}
              onPress={() => setShowModelPicker(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modelCancelButtonText}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1c1c28",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2d2d40",
  },
  emptyIconBadgeText: {
    fontSize: 26,
  },
  emptyTitle: {
    color: "#f4f4f5",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubText: {
    color: "#a1a1aa",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  modelTag: {
    backgroundColor: "#202030",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#373752",
    marginTop: 14,
    marginBottom: 8,
  },
  modelTagText: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyTip: {
    color: "#52525b",
    fontSize: 11,
    marginTop: 10,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 16,
  },
  authBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#241a10",
    borderBottomWidth: 1,
    borderBottomColor: "#78350f",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  authBannerText: {
    flex: 1,
    color: "#fbbf24",
    fontSize: 12,
    lineHeight: 18,
  },
  authBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#78350f",
  },
  authBannerButtonText: {
    color: "#fef3c7",
    fontSize: 12,
    fontWeight: "600",
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
  modalOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  drawerBackdrop: {
    flex: 1,
  },
  drawerContainer: {
    width: "78%",
    maxWidth: 300,
    backgroundColor: "#13131a",
    borderRightWidth: 1,
    borderRightColor: "#27272a",
    paddingTop: Platform.OS === "android" ? 36 : 0,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#202028",
  },
  drawerTitle: {
    color: "#f4f4f5",
    fontSize: 17,
    fontWeight: "700",
  },
  drawerSubtitle: {
    color: "#71717a",
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#202028",
  },
  closeButtonText: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
  drawerList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  drawerEmpty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  drawerEmptyText: {
    color: "#71717a",
    fontSize: 13,
    textAlign: "center",
  },
  projectItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#181822",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#272732",
  },
  projectItemSelected: {
    backgroundColor: "#1e1e2e",
    borderColor: "#6366f1",
  },
  projectItemHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  projectItemIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  projectItemName: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  projectItemNameSelected: {
    color: "#a5b4fc",
  },
  currentBadge: {
    backgroundColor: "#312e81",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    color: "#c7d2fe",
    fontSize: 10,
    fontWeight: "600",
  },
  activeBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  activeBadgeText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "500",
  },
  idleBadge: {
    backgroundColor: "#181820",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  idleBadgeText: {
    color: "#52525b",
    fontSize: 10,
  },
  projectItemPath: {
    color: "#71717a",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 22,
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modelDialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#161620",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#272736",
    padding: 16,
  },
  modelDialogHeader: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#252535",
    paddingBottom: 10,
  },
  modelDialogTitle: {
    color: "#f4f4f5",
    fontSize: 16,
    fontWeight: "700",
  },
  modelDialogSubtitle: {
    color: "#818cf8",
    fontSize: 12,
    marginTop: 2,
  },
  modelList: {
    marginVertical: 4,
  },
  modelItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1e1e2b",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a3c",
  },
  modelItemSelected: {
    backgroundColor: "#26263b",
    borderColor: "#6366f1",
  },
  modelItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  modelItemIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  modelItemTextGroup: {
    flex: 1,
  },
  modelItemName: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  modelItemNameSelected: {
    color: "#c7d2fe",
  },
  modelItemArgs: {
    color: "#71717a",
    fontSize: 11,
    marginTop: 2,
  },
  activeCheckmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  activeCheckmarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  modelCancelButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#20202e",
    alignItems: "center",
  },
  modelCancelButtonText: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
});
