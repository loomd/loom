import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { getToken, getServerUrl } from "@/services/storage";
import { setBaseUrl, getPairBinding } from "@/services/api";
import { colors, font, space } from "@/theme";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (!token) {
          router.replace("/login");
          return;
        }

        // 账号已完成绑定 → 直接进聊天页重连，不再要求输入配对码
        const serverUrl = await getServerUrl();
        setBaseUrl(serverUrl);
        try {
          const binding = await getPairBinding(token);
          if (cancelled) return;
          router.replace(binding.paired ? "/chat" : "/pair");
        } catch {
          // 查询失败（如网络异常）：先进聊天页，连接失败时由聊天页给出提示
          if (!cancelled) {
            router.replace("/chat");
          }
        }
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    const timer = setTimeout(checkAuth, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Loom Remote</Text>
      <Text style={styles.version}>v{APP_VERSION}</Text>
      <ActivityIndicator
        style={styles.spinner}
        size="small"
        color={colors.accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1,
  },
  version: {
    fontSize: font.small,
    color: colors.textFaint,
    marginTop: space.sm,
  },
  spinner: {
    marginTop: space.xl,
  },
});
