import { useState, useCallback } from "react";
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
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { login } from "@/services/api";
import { saveToken, getServerUrl } from "@/services/storage";
import { setBaseUrl } from "@/services/api";
import { colors, font, radius, space } from "@/theme";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState("");

  // 每次回到本页都重新读取服务器地址：从设置页改完返回时不能还显示旧值
  useFocusEffect(
    useCallback(() => {
      getServerUrl().then((url) => {
        setServerUrl(url);
        setBaseUrl(url);
      });
    }, []),
  );

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
        <Text style={styles.version}>v{APP_VERSION}</Text>

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
            placeholderTextColor={colors.textFaint}
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
            placeholderTextColor={colors.textFaint}
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
    backgroundColor: colors.bg,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl + space.lg,
    paddingBottom: space.xl,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: space.sm,
  },
  version: {
    fontSize: font.small,
    color: colors.textFaint,
    marginBottom: space.lg,
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginBottom: space.xl,
    marginTop: space.lg,
  },
  serverLabel: {
    fontSize: font.small,
    color: colors.textMuted,
  },
  serverUrl: {
    fontSize: font.small,
    color: colors.accentText,
    flex: 1,
  },
  inputGroup: {
    marginBottom: space.lg,
  },
  label: {
    fontSize: font.small,
    color: colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: font.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
    marginTop: space.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: font.body,
    fontWeight: "600",
    color: "#ffffff",
  },
  linkRow: {
    alignItems: "center",
    marginTop: space.xl,
  },
  linkText: {
    fontSize: font.small,
    color: colors.textMuted,
  },
  linkHighlight: {
    color: colors.accentText,
  },
});
