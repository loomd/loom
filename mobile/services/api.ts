import type {
  AuthResponse,
  PairCreateResponse,
  PairVerifyResponse,
} from "@/types";

let baseUrl = "https://localhost:8443";

export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, "");
}

export function getBaseUrl(): string {
  return baseUrl;
}

async function request<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
    token?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const errorData = (await response.json()) as { message?: string };
      if (errorData.message) {
        message = errorData.message;
      }
    } catch {
      // 无法解析错误体，使用默认消息
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function refreshToken(token: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/refresh", {
    method: "POST",
    token,
  });
}

export async function createPairCode(
  token: string,
): Promise<PairCreateResponse> {
  return request<PairCreateResponse>("/api/pair/create", {
    method: "POST",
    token,
  });
}

export async function verifyPairCode(
  token: string,
  code: string,
): Promise<PairVerifyResponse> {
  return request<PairVerifyResponse>("/api/pair/verify", {
    method: "POST",
    token,
    body: { code },
  });
}
