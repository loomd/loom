import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import type { ChatMessage, RelayMessage, ProjectItem, ModelItem } from "@/types";
import {
  onMessage,
  onStatusChange,
  onAuthError,
  send,
  sendStop,
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
import {
  appendText,
  appendThinking,
  buildConversationRows,
  createErrorMessage,
  createTextMessage,
  markQueuedCancelled,
  markUserMessageDelivered,
  parseToolCall,
  upsertTool,
  type ConversationRowItem,
} from "@/services/conversation";
import { ChatHeader } from "@/components/ChatHeader";
import { ConversationRow } from "@/components/ConversationRow";
import {
  PermissionCard,
  type PermissionOption,
  type PermissionRequest,
} from "@/components/PermissionCard";
import { SlideDrawer, SlideUpSheet } from "@/components/overlays";
import { Chevron, StatusDot, StopIcon } from "@/components/icons";
import { colors, font, radius, space } from "@/theme";

/** 单个项目的独立会话状态容器 */
interface ProjectSessionState {
  messages: ChatMessage[];
  draftText: string;
  modelId: string;
  pendingPermission: PermissionRequest | null;
  /** 该项目是否有正在进行的一轮对话 */
  busy: boolean;
  /** 已请求停止，等待桌面端确认 */
  stopping: boolean;
  /** 本轮即将开始回应提问，等第一条 Agent 帧到达后把提问标记为「已送达」 */
  awaitingDelivery: boolean;
}

function createDefaultSessionState(modelId: string = ""): ProjectSessionState {
  return {
    messages: [],
    draftText: "",
    modelId,
    pendingPermission: null,
    busy: false,
    stopping: false,
    awaitingDelivery: false,
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
  const { width: windowWidth } = useWindowDimensions();

  // 1. 已开放的项目与模型清单
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("");
  const [showProjectDrawer, setShowProjectDrawer] = useState(false);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  /** 桌面端当前使用的模型（项目未单独指定时以此为准） */
  const [desktopModelId, setDesktopModelId] = useState<string>("");

  // 2. 每个项目独立的会话状态池：projectId -> ProjectSessionState
  const [sessions, setSessions] = useState<Record<string, ProjectSessionState>>({});

  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ConversationRowItem>>(null);

  // 使用 ref 跟踪当前活动项目 ID，避免 WebSocket 回调闭包捕获旧状态
  const activeProjectIdRef = useRef<string>("");
  useEffect(() => {
    activeProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  // 当前活动项目的独立会话数据
  const currentSession = useMemo(
    () => sessions[currentProjectId] ?? createDefaultSessionState(),
    [sessions, currentProjectId],
  );
  const currentMessages = currentSession.messages;
  const currentModelId = currentSession.modelId || desktopModelId;
  const currentInputText = currentSession.draftText;
  const currentPendingPermission = currentSession.pendingPermission;
  /** 当前项目是否有一轮对话正在进行 */
  const currentBusy = currentSession.busy;
  /** 已请求停止、等待桌面端确认 */
  const currentStopping = currentSession.stopping;

  // 供 WebSocket 回调读取的最新模型 ID，避免闭包捕获旧值
  const currentModelIdRef = useRef<string>("");
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  // 渲染单元：连续的多个工具调用合并为一行
  const rows = useMemo(
    () => buildConversationRows(currentMessages),
    [currentMessages],
  );

  // 获取当前项目名称和当前模型名称
  const currentProjectName =
    projects.find((p) => p.id === currentProjectId)?.name || "默认工作区";
  const currentModelName =
    models.find((m) => m.id === currentModelId)?.name || "默认模型";

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

  /**
   * 帧归属的项目。
   *
   * 桌面端给每个下行帧都带上 projectId（多个项目的会话可以同时在跑），
   * 缺失时（例如旧版桌面端）退回当前正在看的项目。
   */
  const resolveFrameProject = useCallback(
    (relayMsg: RelayMessage): string => {
      return relayMsg.projectId || activeProjectIdRef.current;
    },
    [],
  );

  /** 更新指定项目的消息序列 */
  const updateProjectMessages = useCallback(
    (pid: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      if (!pid) return;
      setSessions((prev) => {
        const sess = prev[pid] || createDefaultSessionState();
        return {
          ...prev,
          [pid]: { ...sess, messages: updater(sess.messages) },
        };
      });
    },
    [],
  );

  /**
   * 落一条 Agent 帧：追加内容，并把本轮对应的提问标记为已送达。
   *
   * `awaitingDelivery` 只在「本轮即将开始回应提问」时为真，
   * 这样「本轮剩余的输出」不会被误判成「排队提问已经开始执行」。
   */
  const appendAgentFrame = useCallback(
    (pid: string, updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      if (!pid) return;
      setSessions((prev) => {
        const sess = prev[pid] || createDefaultSessionState();
        const messages = updater(sess.messages);
        return {
          ...prev,
          [pid]: {
            ...sess,
            messages: sess.awaitingDelivery
              ? markUserMessageDelivered(messages)
              : messages,
            busy: true,
            awaitingDelivery: false,
          },
        };
      });
    },
    [],
  );

  /**
   * 本轮结束：清掉「生成中」状态。
   *
   * 被叫停时（stopReason 为 cancelled），排队中的提问一并标记为已取消。
   */
  const endTurn = useCallback((pid: string, stopReason: string) => {
    if (!pid) return;
    const cancelled = stopReason === "cancelled";
    setSessions((prev) => {
      const sess = prev[pid] || createDefaultSessionState();
      const messages = cancelled
        ? markQueuedCancelled(sess.messages)
        : sess.messages;
      const hasPending = messages.some(
        (m) => m.role === "user" && (m.status === "sent" || m.status === "queued"),
      );
      return {
        ...prev,
        [pid]: {
          ...sess,
          busy: false,
          stopping: false,
          // 下一轮会回应剩下的提问：等它的第一条帧到达再标记送达
          awaitingDelivery: hasPending,
          messages,
        },
      };
    });
  }, []);

  /** 权限请求：说明 Agent 正在本轮中回应，同时把提问标记为已送达 */
  const markPermissionRequest = useCallback(
    (pid: string, request: PermissionRequest) => {
      if (!pid) return;
      setSessions((prev) => {
        const sess = prev[pid] || createDefaultSessionState();
        return {
          ...prev,
          [pid]: {
            ...sess,
            messages: sess.awaitingDelivery
              ? markUserMessageDelivered(sess.messages)
              : sess.messages,
            awaitingDelivery: false,
            busy: true,
            pendingPermission: request,
          },
        };
      });
    },
    [],
  );

  // 追加 Agent 文本增量（按到达顺序落库）
  const appendAgentText = useCallback(
    (pid: string, text: string) => {
      appendAgentFrame(pid, (messages) => appendText(messages, text));
    },
    [appendAgentFrame],
  );

  // 追加思考过程增量
  const appendThinkingText = useCallback(
    (pid: string, text: string) => {
      appendAgentFrame(pid, (messages) => appendThinking(messages, text));
    },
    [appendAgentFrame],
  );

  // 追加工具调用状态
  const appendToolCall = useCallback(
    (pid: string, payload: string) => {
      const tool = parseToolCall(payload);
      if (!tool) return;
      appendAgentFrame(pid, (messages) => upsertTool(messages, tool));
    },
    [appendAgentFrame],
  );

  /** 切换模型：更新模型并清空当前项目的对话区 */
  const applyModelSwitch = useCallback((modelId: string) => {
    setDesktopModelId(modelId);
    const targetPid = activeProjectIdRef.current;
    if (!targetPid) return;
    setSessions((prev) => {
      const sess = prev[targetPid] || createDefaultSessionState();
      return {
        ...prev,
        [targetPid]: {
          ...sess,
          modelId,
          messages: [],
          pendingPermission: null,
          busy: false,
          stopping: false,
          awaitingDelivery: false,
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
      } else {
        // 链路断开：桌面端那轮对话已经不存在了，清理「生成中」状态
        setSessions((prev) => {
          const next: Record<string, ProjectSessionState> = {};
          for (const [pid, sess] of Object.entries(prev)) {
            next[pid] = {
              ...sess,
              busy: false,
              stopping: false,
              awaitingDelivery: false,
            };
          }
          return next;
        });
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
                const initialPid =
                  data.currentProjectId || data.projects[0]?.id || "";
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
              if (data.currentModelId) {
                setDesktopModelId(data.currentModelId);
              }
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
            // 模型变化后清空对话区，避免新旧模型的上下文混在一起
            if (data.modelId && data.modelId !== currentModelIdRef.current) {
              applyModelSwitch(data.modelId);
            } else if (data.modelId) {
              setDesktopModelId(data.modelId);
            }
          } catch {
            // ignore
          }
          return;
        }
        case "chat": {
          const pid = resolveFrameProject(relayMsg);
          if (relayMsg.payload.startsWith("{")) {
            try {
              const parsed = JSON.parse(relayMsg.payload);
              if (parsed && parsed.method === "request_permission" && parsed.params) {
                markPermissionRequest(pid, toPermissionRequest(parsed));
                return;
              }
            } catch {
              // 普通文本消息
            }
          }
          appendAgentText(pid, relayMsg.payload);
          return;
        }
        case "chat_end": {
          // 本轮结束：正文、思考、工具已按到达顺序落入列表，这里只收尾状态
          endTurn(resolveFrameProject(relayMsg), relayMsg.payload);
          return;
        }
        case "thinking": {
          appendThinkingText(resolveFrameProject(relayMsg), relayMsg.payload);
          return;
        }
        case "tool_call": {
          appendToolCall(resolveFrameProject(relayMsg), relayMsg.payload);
          return;
        }
        case "permission_request": {
          try {
            const parsed = JSON.parse(relayMsg.payload);
            if (parsed && parsed.params) {
              markPermissionRequest(
                resolveFrameProject(relayMsg),
                toPermissionRequest(parsed),
              );
            }
          } catch {
            // 忽略
          }
          return;
        }
        case "error": {
          const pid = resolveFrameProject(relayMsg);
          updateProjectMessages(pid, (messages) => [
            ...messages,
            createErrorMessage(relayMsg.payload),
          ]);
          endTurn(pid, "end_turn");
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
  }, [
    appendAgentText,
    appendThinkingText,
    appendToolCall,
    updateProjectMessages,
    endTurn,
    markPermissionRequest,
    resolveFrameProject,
    applyModelSwitch,
    router,
  ]);

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
    if (rows.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [rows.length, currentMessages]);

  // Android 实体返回键：优先关闭抽屉/面板
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showProjectDrawer) {
          setShowProjectDrawer(false);
          return true;
        }
        if (showModelPicker) {
          setShowModelPicker(false);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [showProjectDrawer, showModelPicker]);

  const handleSend = useCallback(() => {
    const text = currentInputText.trim();
    if (!text || !currentProjectId) return;

    // 本轮对话进行中：这条提问会排在本轮之后执行
    const queued = currentBusy;

    const userMessage = createTextMessage(text, "user");
    userMessage.status = queued ? "queued" : "sending";

    // 清空草稿并放入用户提问气泡
    setSessions((prev) => {
      const sess = prev[currentProjectId] || createDefaultSessionState();
      return {
        ...prev,
        [currentProjectId]: {
          ...sess,
          draftText: "",
          // 发出即进入「生成中」：桌面端收到后才会开始本轮对话
          busy: true,
          // 空闲时发出的提问会立即开启一轮对话：等第一条 Agent 帧到达再标记送达
          awaitingDelivery: queued ? sess.awaitingDelivery : true,
          messages: [...sess.messages, userMessage],
        },
      };
    });

    // 发送消息：桌面端在此时才会为该项目按需拉起对应模型的 ACP 进程
    send(text);

    // 标记为已发送
    const sentStatus: ChatMessage["status"] = queued ? "queued" : "sent";
    setSessions((prev) => {
      const sess = prev[currentProjectId];
      if (!sess) return prev;
      return {
        ...prev,
        [currentProjectId]: {
          ...sess,
          messages: sess.messages.map((m) =>
            m.id === userMessage.id ? { ...m, status: sentStatus } : m,
          ),
        },
      };
    });
  }, [currentInputText, currentProjectId, currentBusy]);

  /** 叫停当前项目正在进行的一轮对话 */
  const handleStop = useCallback(() => {
    const pid = currentProjectId;
    if (!pid) return;
    sendStop();
    setSessions((prev) => {
      const sess = prev[pid] || createDefaultSessionState();
      return {
        ...prev,
        [pid]: { ...sess, stopping: true },
      };
    });
  }, [currentProjectId]);

  async function handleDisconnect() {
    disconnect();
    await clearToken();
    router.replace("/login");
  }

  const handleApprovePermission = (
    requestId: string,
    selectedOptions?: string[],
  ) => {
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

  // 切换模型：清空当前项目的对话区后再切换
  const handleSelectModel = (model: ModelItem) => {
    setShowModelPicker(false);
    if (model.id === currentModelId) return;

    applyModelSwitch(model.id);
    sendSwitchModel(model.id);
  };

  const drawerWidth = Math.min(300, Math.round(windowWidth * 0.82));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      {/* 顶栏 */}
      <ChatHeader
        connected={connected}
        projectName={currentProjectName}
        modelName={currentModelName}
        onOpenProjects={() => setShowProjectDrawer(true)}
        onOpenModels={() => setShowModelPicker(true)}
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
      {currentPendingPermission ? (
        <View style={styles.permissionWrapper}>
          <PermissionCard
            request={currentPendingPermission}
            onApprove={handleApprovePermission}
            onReject={handleRejectPermission}
          />
        </View>
      ) : null}

      {/* 对话流：正文横向占满，工具调用折叠成行 */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={rows}
        renderItem={({ item }) => <ConversationRow item={item} />}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{currentProjectName}</Text>
            <Text style={styles.emptySubText}>尚未开始对话</Text>
            <View style={styles.emptyDivider} />
            <Text style={styles.emptyTip}>
              发送消息后，桌面端会为该项目按需拉起专属会话
            </Text>
            <View style={styles.modelTag}>
              <Text style={styles.modelTagText}>{currentModelName}</Text>
            </View>
          </View>
        }
      />

      {/* 生成中状态条：显示当前轮次进度，并提供「停止」 */}
      {currentBusy ? (
        <View style={styles.busyBar}>
          <View style={styles.busyStatus}>
            <StatusDot
              color={currentStopping ? colors.textFaint : colors.accent}
              size={6}
            />
            <Text style={styles.busyText}>
              {currentStopping ? "正在停止…" : "生成中"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={handleStop}
            disabled={currentStopping}
            activeOpacity={0.7}
            accessibilityLabel="停止当前对话"
          >
            <StopIcon
              color={currentStopping ? colors.textFaint : colors.danger}
              size={9}
            />
            <Text
              style={[
                styles.stopText,
                currentStopping && styles.stopTextDisabled,
              ]}
            >
              停止
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 底部输入框 */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={currentInputText}
          onChangeText={handleInputChange}
          placeholder={
            currentBusy
              ? "继续输入，提问将排在本轮之后"
              : `向 ${currentProjectName} 发送消息`
          }
          placeholderTextColor={colors.textFaint}
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

      {/* 侧边栏：工作区项目抽屉（滑出 + 可滚动） */}
      <SlideDrawer
        visible={showProjectDrawer}
        onClose={() => setShowProjectDrawer(false)}
        width={drawerWidth}
      >
        <View style={styles.drawerRoot}>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerHeaderText}>
              <Text style={styles.drawerTitle}>工作区项目</Text>
              <Text style={styles.drawerSubtitle}>
                {projects.length} 个项目 · 每个项目独立会话
              </Text>
            </View>
            <TouchableOpacity
              style={styles.drawerClose}
              onPress={() => setShowProjectDrawer(false)}
              activeOpacity={0.6}
              accessibilityLabel="关闭项目列表"
            >
              <Chevron size={13} color={colors.textMuted} direction="left" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.drawerList}
            contentContainerStyle={styles.drawerListContent}
            showsVerticalScrollIndicator={false}
          >
            {projects.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Text style={styles.drawerEmptyText}>
                  暂未同步到已注册项目，连接后自动加载
                </Text>
              </View>
            ) : (
              projects.map((proj) => {
                const isSelected = proj.id === currentProjectId;
                const msgCount = sessions[proj.id]?.messages?.length || 0;

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
                      <Text
                        style={[
                          styles.projectItemName,
                          isSelected && styles.projectItemNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {proj.name}
                      </Text>
                      <View
                        style={[
                          styles.projectBadge,
                          isSelected && styles.projectBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.projectBadgeText,
                            isSelected && styles.projectBadgeTextActive,
                          ]}
                        >
                          {isSelected
                            ? "当前"
                            : msgCount > 0
                              ? `${msgCount} 条`
                              : "空"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.projectItemPath} numberOfLines={1}>
                      {proj.path}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={styles.drawerFooter}>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={handleDisconnect}
              activeOpacity={0.7}
            >
              <Text style={styles.disconnectText}>断开连接</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SlideDrawer>

      {/* 模型选择：底部滑出面板 */}
      <SlideUpSheet
        visible={showModelPicker}
        onClose={() => setShowModelPicker(false)}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>切换模型</Text>
          <Text style={styles.sheetSubtitle} numberOfLines={1}>
            {currentProjectName} · 切换后清空当前对话
          </Text>
        </View>

        <ScrollView
          style={styles.modelList}
          contentContainerStyle={styles.modelListContent}
          showsVerticalScrollIndicator={false}
        >
          {models.length === 0 ? (
            <View style={styles.drawerEmpty}>
              <Text style={styles.drawerEmptyText}>
                暂无可用模型，连接后自动加载
              </Text>
            </View>
          ) : (
            models.map((model) => {
              const isSelected = model.id === currentModelId;
              const argsDesc =
                model.args && model.args.length > 0
                  ? model.args.join(" ")
                  : "默认配置";
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
                  <View
                    style={[
                      styles.modelDot,
                      isSelected && styles.modelDotSelected,
                    ]}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SlideUpSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  permissionWrapper: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: space.lg,
  },
  emptyCard: {
    marginHorizontal: space.lg,
    marginTop: space.xxl,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: "700",
  },
  emptySubText: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: 4,
  },
  emptyDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space.md,
  },
  emptyTip: {
    color: colors.textFaint,
    fontSize: font.small,
    lineHeight: 20,
  },
  modelTag: {
    alignSelf: "flex-start",
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  modelTagText: {
    color: colors.accentText,
    fontSize: font.tiny,
    fontWeight: "600",
  },
  authBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(240, 180, 41, 0.10)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(240, 180, 41, 0.35)",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  authBannerText: {
    flex: 1,
    color: colors.warning,
    fontSize: font.small,
    lineHeight: 18,
  },
  authBannerButton: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(240, 180, 41, 0.45)",
  },
  authBannerButtonText: {
    color: colors.warning,
    fontSize: font.tiny,
    fontWeight: "600",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  busyBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  busyStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  busyText: {
    color: colors.textMuted,
    fontSize: font.tiny,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopText: {
    color: colors.danger,
    fontSize: font.tiny,
    fontWeight: "600",
  },
  stopTextDisabled: {
    color: colors.textFaint,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.sm + 2,
    color: colors.text,
    fontSize: font.body,
    maxHeight: 120,
    marginRight: space.sm,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 4,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceActive,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: font.small,
    fontWeight: "600",
  },
  drawerRoot: {
    flex: 1,
    paddingTop: space.lg,
  },
  drawerHeader: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerHeaderText: {
    flex: 1,
  },
  drawerClose: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: "700",
  },
  drawerSubtitle: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: 2,
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  drawerEmpty: {
    paddingVertical: space.xxl,
    alignItems: "center",
  },
  drawerEmptyText: {
    color: colors.textFaint,
    fontSize: font.small,
    textAlign: "center",
    lineHeight: 20,
  },
  projectItem: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: space.sm,
  },
  projectItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  projectItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  projectItemName: {
    flex: 1,
    color: colors.text,
    fontSize: font.body,
    fontWeight: "600",
  },
  projectItemNameSelected: {
    color: colors.accentText,
  },
  projectBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectBadgeActive: {
    borderColor: colors.accent,
  },
  projectBadgeText: {
    color: colors.textFaint,
    fontSize: font.tiny,
  },
  projectBadgeTextActive: {
    color: colors.accentText,
  },
  projectItemPath: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: 4,
  },
  drawerFooter: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  disconnectButton: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(240, 101, 111, 0.4)",
    alignItems: "center",
  },
  disconnectText: {
    color: colors.danger,
    fontSize: font.small,
    fontWeight: "600",
  },
  sheetHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: "700",
  },
  sheetSubtitle: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: 3,
  },
  modelList: {
    flexShrink: 1,
  },
  modelListContent: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  modelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: space.sm,
  },
  modelItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  modelItemTextGroup: {
    flex: 1,
  },
  modelItemName: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: "600",
  },
  modelItemNameSelected: {
    color: colors.accentText,
  },
  modelItemArgs: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: 2,
  },
  modelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  modelDotSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
