import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { verifyPairCode } from "@/services/api";
import {
  getToken,
  clearToken,
  getServerUrl,
  getDeviceId,
  saveLastPairInfo,
} from "@/services/storage";
import { setBaseUrl } from "@/services/api";
import { connectToRelay } from "@/services/websocket";

const CODE_LENGTH = 4;

export default function PairScreen() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

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

  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>输入配对码</Text>
      <Text style={styles.subtext}>
        在桌面端 Loom 上生成 4 位配对码，输入后即可连接工作区
      </Text>

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
          <Text style={styles.secondaryButtonText}>重新配对</Text>
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
