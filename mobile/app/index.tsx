import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { getToken } from "@/services/storage";

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (token) {
          router.replace("/pair");
        } else {
          router.replace("/login");
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
        color="#6366f1"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#e4e4e7",
    letterSpacing: 1,
  },
  version: {
    fontSize: 14,
    color: "#a1a1aa",
    marginTop: 8,
  },
  spinner: {
    marginTop: 32,
  },
});
