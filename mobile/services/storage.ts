import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "loom_jwt_token";
const SERVER_URL_KEY = "loom_server_url";
const PAIR_INFO_KEY = "loom_pair_info";

const DEFAULT_SERVER_URL = "https://agent.ccxcc.cn";

export interface PairInfo {
  code: string;
  workspaceId: string;
  workspaceName: string;
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, url);
}

export async function getServerUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(SERVER_URL_KEY);
  if (!url) {
    return DEFAULT_SERVER_URL;
  }
  // 自动修复迁移历史存储中的 ws:// 或 wss:// 协议
  if (url.startsWith("wss://") || url.startsWith("ws://")) {
    const fixed = url.replace(/^ws/, "http");
    await AsyncStorage.setItem(SERVER_URL_KEY, fixed);
    return fixed;
  }
  return url;
}

export async function saveLastPairInfo(info: PairInfo): Promise<void> {
  await AsyncStorage.setItem(PAIR_INFO_KEY, JSON.stringify(info));
}

export async function getLastPairInfo(): Promise<PairInfo | null> {
  const raw = await AsyncStorage.getItem(PAIR_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PairInfo;
  } catch {
    return null;
  }
}
