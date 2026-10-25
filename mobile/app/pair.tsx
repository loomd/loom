import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { verifyPairCode, getPairBinding, setBaseUrl } from "@/services/api";
import {
  getToken,
  clearToken,
  getServerUrl,
  getDeviceId,
  saveLastPairInfo,
} from "@/services/storage";
import { connectToRelay } from "@/services/websocket";

const CODE_LENGTH = 4;

/**
 * 绑定归属：
 * - none  未绑定（首次配对 / 绑定已失效）
 * - mine  绑定属于本机（无需再输码，应直接回聊天页）
 * - other 绑定在别的设备上（需先在桌面端解绑，或用新配对码改绑）
 */
type BindingOwner = "none" | "mine" | "other";

export default function PairScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string }>();
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState<string>(
    typeof params.reason === "string" ? params.reason : "",
  );
  const [bindingOwner, setBindingOwner] = useState<BindingOwner | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  /**
   * 自检账号的绑定状态。
   * 绑定属于本机时直接回聊天页，避免一次误判把用户永久困在配对页。
   */
  const checkBinding = useCallback(async (): Promise<BindingOwner> => {
    const token = await getToken();
    if (!token) {
      router.replace("/login");
      return "none";
    }
    const serverUrl = await getServerUrl();
    setBaseUrl(serverUrl);
    const deviceId = await getDeviceId();
    try {
      const binding = await getPairBinding(token);
      if (!binding.paired) return "none";
      const boundDeviceId = binding.deviceId ?? null;
      // 老版本客户端建立的绑定没有设备标识，一律视为属于本机
      if (!boundDeviceId || boundDeviceId === deviceId) return "mine";
      return "other";
    } catch {
      // 查询失败（网络异常）：保持当前页面，允许继续输入配对码
      return "none";
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const owner = await checkBinding();
      if (cancelled) return;
      setBindingOwner(owner);
      if (owner === "mine") {
        router.replace("/chat");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkBinding, router]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/[^0-9]/g, "");
      if (!digit && !value) {
        // 退格：清空当前格并聚焦前一格
        const updated = [...digits];
        updated[index] = "";
        setDigits(updated);
        if (index > 0) {
          inputRefs.current[index - 1]?.focus();
        }
        return;
      }
      if (!digit) return;

      const char = digit.charAt(digit.length - 1);
      const updated = [...digits];
      updated[index] = char;
      setDigits(updated);

      if (index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        // 最后一位已填写，自动提交
        const code = updated.join("");
        if (code.length === CODE_LENGTH) {
          handleSubmit(code);
        }
      }
    },
    [digits],
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === "Backspace" && !digits[index] && index > 0) {
        const updated = [...digits];
        updated[index - 1] = "";
        setDigits(updated);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  async function handleSubmit(code: string) {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const serverUrl = await getServerUrl();
      setBaseUrl(serverUrl);

      const deviceId = await getDeviceId();
      const result = await verifyPairCode(token, code, deviceId);
      const isSuccess = Boolean(result.success ?? result.valid);
      if (isSuccess) {
        await saveLastPairInfo({
          code,
          workspaceId: result.workspaceId || "default",
          workspaceName: result.workspaceName || "Loom Workspace",
        });
        setReason("");
        setBindingOwner("mine");
        connectToRelay(serverUrl, token, code, deviceId);
        router.replace("/chat");
      } else {
        const errorText = (result as { error?: string }).error || "验证码无效或已过期";
        Alert.alert("配对失败", errorText);
        resetDigits();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "配对验证失败";
      Alert.alert("配对失败", message);
      resetDigits();
    } finally {
      setLoading(false);
    }
  }

  function resetDigits() {
    setDigits(["", "", "", ""]);
    inputRefs.current[0]?.focus();
  }

  /** 重新自检绑定状态：已绑定则回聊天页，其余给出明确提示 */
  async function handleRetryConnection() {
    const owner = await checkBinding();
    setBindingOwner(owner);
    if (owner === "mine") {
      router.replace("/chat");
      return;
    }
    if (owner === "other") {
      Alert.alert(
        "绑定在其他设备",
        "此账号已绑定另一台手机设备，请先在桌面端点击「解绑手机端」，或直接输入桌面端新生成的配对码改绑到本机。",
      );
      return;
    }
    Alert.alert(
      "尚未绑定",
      "当前账号还没有绑定手机端，请在桌面端点击「开启远程会话」生成配对码后输入。",
    );
  }

  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{reason ? "重新绑定手机端" : "输入配对码"}</Text>
      <Text style={styles.subtext}>
        {reason
          ? `${reason}\n请在桌面端点击「开启远程会话」生成新的配对码后输入。`
          : "在桌面端 Loom 上生成 4 位配对码，输入后即可连接工作区"}
      </Text>

      {bindingOwner === "other" ? (
        <Text style={styles.warning}>
          该账号已绑定另一台手机设备，请在桌面端点击「解绑手机端」后重试，
          或直接输入桌面端新生成的配对码改绑到本机。
        </Text>
      ) : null}

      <View style={styles.codeRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            style={[styles.codeInput, digit ? styles.codeInputFilled : null]}
            value={digit}
            onChangeText={(val) => handleDigitChange(index, val)}
            onKeyPress={(e) => handleKeyPress(index, e.nativeEvent.key)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            editable={!loading}
          />
        ))}
      </View>

      {loading && (
        <ActivityIndicator
          style={styles.spinner}
          size="large"
          color="#6366f1"
        />
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={resetDigits}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>清空重填</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleRetryConnection}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>重试连接</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleLogout}
          disabled={loading}
        >
          <Text style={styles.dangerButtonText}>退出登录</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#e4e4e7",
    marginBottom: 12,
  },
  subtext: {
    fontSize: 14,
    color: "#a1a1aa",
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 20,
  },
  warning: {
    fontSize: 13,
    color: "#fbbf24",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 19,
  },
  codeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 32,
  },
  codeInput: {
    width: 60,
    height: 72,
    backgroundColor: "#16161d",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#27272a",
    fontSize: 28,
    fontWeight: "700",
    color: "#e4e4e7",
    textAlign: "center",
  },
  codeInputFilled: {
    borderColor: "#6366f1",
  },
  spinner: {
    marginBottom: 24,
  },
  actions: {
    marginTop: 16,
    alignItems: "center",
    gap: 12,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: "#6366f1",
    fontWeight: "500",
  },
  dangerButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  dangerButtonText: {
    fontSize: 15,
    color: "#ef4444",
    fontWeight: "500",
  },
});
