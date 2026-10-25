import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { login } from "@/services/api";
import { saveToken, getServerUrl } from "@/services/storage";
import { setBaseUrl } from "@/services/api";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState("");

  useEffect(() => {
    getServerUrl().then((url) => {
      setServerUrl(url);
      setBaseUrl(url);
    });
  }, []);

  async function handleLogin() {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      Alert.alert("提示", "请输入用户名");
      return;
    }
    if (!password) {
      Alert.alert("提示", "请输入密码");
      return;
    }

    setLoading(true);
    try {
      const result = await login(trimmedUser, password);
      await saveToken(result.token);
      router.replace("/pair");
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败";
      Alert.alert("登录失败", `${message}\n(目标地址: ${serverUrl || "默认"})`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>登录到 Loom Remote</Text>
        <Text style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 16 }}>版本: v{APP_VERSION}</Text>

        <TouchableOpacity
          style={styles.serverRow}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.serverLabel}>服务器: </Text>
          <Text style={styles.serverUrl} numberOfLines={1}>
            {serverUrl}
          </Text>
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="输入用户名"
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>密码</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="输入密码"
            placeholderTextColor="#71717a"
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>登录</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push("/register")}
        >
          <Text style={styles.linkText}>
            没有账号？<Text style={styles.linkHighlight}>注册</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#e4e4e7",
    marginBottom: 24,
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161d",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 24,
  },
  serverLabel: {
    fontSize: 13,
    color: "#a1a1aa",
  },
  serverUrl: {
    fontSize: 13,
    color: "#6366f1",
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: "#a1a1aa",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#16161d",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#e4e4e7",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  button: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  linkRow: {
    alignItems: "center",
    marginTop: 20,
  },
  linkText: {
    fontSize: 14,
    color: "#a1a1aa",
  },
  linkHighlight: {
    color: "#6366f1",
  },
});
