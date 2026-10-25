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
          placeholderTextColor="#71717a"
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
    backgroundColor: "#0a0a0f",
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#e4e4e7",
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 24,
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
  hint: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 6,
  },
  button: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  backButton: {
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 15,
    color: "#a1a1aa",
  },
});
