import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

const BACKGROUND = "#0a0a0f";
const HEADER_BG = "#16161d";
const TEXT_COLOR = "#e4e4e7";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={BACKGROUND} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: HEADER_BG },
          headerTintColor: TEXT_COLOR,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: BACKGROUND },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="login"
          options={{ title: "登录", headerBackVisible: false }}
        />
        <Stack.Screen
          name="register"
          options={{ title: "注册" }}
        />
        <Stack.Screen
          name="pair"
          options={{ title: "配对工作区", headerBackVisible: false }}
        />
        <Stack.Screen
          name="chat"
          options={{ title: "对话", headerBackVisible: false }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: "设置" }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
