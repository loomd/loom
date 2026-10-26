import { useState } from "react";
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
import { register } from "@/services/api";
import { saveToken } from "@/services/storage";
import { colors, font, radius, space } from "@/theme";

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      Alert.alert("提示", "请输入用户名");
      return;
    }
    if (trimmedUser.length < 3 || trimmedUser.length > 24) {
      Alert.alert("提示", "用户名长度需在 3 到 24 个字符之间");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUser)) {
      Alert.alert("提示", "用户名仅支持英文字母、数字、下划线和连字符");
      return;
    }
    if (!password) {
      Alert.alert("提示", "请输入密码");
      return;
    }
    if (password.length < 6) {
      Alert.alert("提示", "密码长度不能少于 6 位");
      return;
    }
    if (password.length > 64) {
      Alert.alert("提示", "密码长度不能超过 64 位");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("提示", "两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const result = await register(trimmedUser, password);
      await saveToken(result.token);
      router.replace("/pair");
    } catch (err) {
      const message = err instanceof Error ? err.message : "注册失败";
      Alert.alert("注册失败", message);
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
        <Text style={styles.heading}>注册 Loom Remote</Text>

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

        <View style={styles.inputGroup}>
          <Text style={styles.label}>确认密码</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="再次输入密码"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>注册</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.back()}
        >
          <Text style={styles.linkText}>
            已有账号？<Text style={styles.linkHighlight}>登录</Text>
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
    marginBottom: space.xl,
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
