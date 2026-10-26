import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { getServerUrl, saveServerUrl } from "@/services/storage";
import { setBaseUrl } from "@/services/api";
import { colors, font, radius, space } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const [serverUrl, setServerUrlState] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getServerUrl().then((url) => {
      setServerUrlState(url);
    });
  }, []);

  async function handleSave() {
    const trimmed = serverUrl.trim();
    if (!trimmed) {
      Alert.alert("提示", "服务器地址不能为空");
      return;
    }

    await saveServerUrl(trimmed);
    setBaseUrl(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>服务器设置</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Relay 服务器地址</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={(text) => {
            setServerUrlState(text);
            setSaved(false);
          }}
          placeholder="https://agent.ccxcc.cn"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          Relay 服务器地址，格式为 https://domain 或 http://ip:port
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={handleSave}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>
          {saved ? "已保存" : "保存"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.backButtonText}>返回</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: space.xl,
  },
  inputGroup: {
    marginBottom: space.xl,
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
  hint: {
    fontSize: font.tiny,
    color: colors.textFaint,
    marginTop: 6,
    lineHeight: 17,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  buttonText: {
    fontSize: font.body,
    fontWeight: "600",
    color: "#ffffff",
  },
  backButton: {
    alignItems: "center",
    marginTop: space.xl,
    paddingVertical: space.md,
  },
  backButtonText: {
    fontSize: font.body,
    color: colors.textMuted,
  },
});
