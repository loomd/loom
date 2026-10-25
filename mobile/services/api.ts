import type {
  AuthResponse,
  PairCreateResponse,
  PairVerifyResponse,
  PairBindingResponse,
} from "@/types";

let baseUrl = "https://agent.ccxcc.cn";

export function setBaseUrl(url: string): void {
  if (!url) return;
  let clean = url.trim().replace(/\/+$/, "");
  if (clean.startsWith("wss://")) {
    clean = "https://" + clean.slice(6);
  } else if (clean.startsWith("ws://")) {
    clean = "http://" + clean.slice(5);
  } else if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  baseUrl = clean;
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

  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`网络连接失败 (${url}): ${detail}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`请求失败 (HTTP ${response.status})`);
    }
    throw new Error(`解析响应 JSON 失败 (HTTP ${response.status})`);
  }

  if (body && typeof body === "object") {
    const envelope = body as { ok?: boolean; data?: unknown; error?: string };
    if (envelope.ok === false) {
      throw new Error(envelope.error || `请求失败 (HTTP ${response.status})`);
    }
    if (envelope.ok === true && "data" in envelope) {
      return envelope.data as T;
    }
  }

  if (!response.ok) {
    throw new Error(`请求失败 (HTTP ${response.status})`);
  }

  return body as T;
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
  deviceId?: string,
): Promise<PairVerifyResponse> {
  return request<PairVerifyResponse>("/api/pair/verify", {
    method: "POST",
    token,
    body: { code, deviceId },
  });
}

/**
 * 查询账号与手机端的绑定状态。
 * 已绑定 → 后续重连凭 token 即可，无需再次输入配对码。
 */
export async function getPairBinding(
  token: string,
): Promise<PairBindingResponse> {
  return request<PairBindingResponse>("/api/pair/binding", {
    method: "GET",
    token,
  });
}
