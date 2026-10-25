import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { register, login, refreshToken, verifyToken } from "./auth.js";
import {
  createPairingCode,
  verifyPairingCode,
} from "./pairing.js";
import { handleDesktopConnection, handleMobileConnection } from "./relay.js";
import {
  corsMiddleware,
  createRateLimiter,
  getClientIp,
} from "./middleware.js";
import { getDb } from "./db.js";
import type {
  ApiResponse,
  AuthRegisterRequest,
  AuthLoginRequest,
  PairVerifyRequest,
} from "./types.js";

// ---- 配置 ----

const PORT = parseInt(process.env.PORT || "8443", 10);

// 限流：每个 IP 每分钟最多 60 次请求
const rateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
});

// ---- 工具函数 ----

function jsonResponse<T>(
  res: http.ServerResponse,
  statusCode: number,
  body: ApiResponse<T>,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 64; // 64KB

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("无效的 JSON 格式");
  }
}

/**
 * 从 Authorization header 中提取 Bearer token。
 */
function extractBearerToken(
  req: http.IncomingMessage,
): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

// ---- HTTP 路由处理 ----

async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // CORS
  if (corsMiddleware(req, res)) return;

  // 限流
  const ip = getClientIp(req);
  if (!rateLimiter(ip)) {
    jsonResponse(res, 429, { ok: false, error: "请求过于频繁，请稍后重试" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  try {
    // ---- Health ----
    if (pathname === "/api/health" && method === "GET") {
      jsonResponse(res, 200, { ok: true, data: { status: "ok" } });
      return;
    }

    // ---- Auth: Register ----
    if (pathname === "/api/auth/register" && method === "POST") {
      const body = parseJson<AuthRegisterRequest>(await readBody(req));
      const result = await register(body.username, body.password);
      jsonResponse(res, 201, { ok: true, data: result });
      return;
    }

    // ---- Auth: Login ----
    if (pathname === "/api/auth/login" && method === "POST") {
      const body = parseJson<AuthLoginRequest>(await readBody(req));
      const result = await login(body.username, body.password);
      jsonResponse(res, 200, { ok: true, data: result });
      return;
    }

    // ---- Auth: Refresh ----
    if (pathname === "/api/auth/refresh" && method === "POST") {
      const token = extractBearerToken(req);
      if (!token) {
        jsonResponse(res, 401, { ok: false, error: "缺少 Authorization header" });
        return;
      }
      const result = refreshToken(token);
      jsonResponse(res, 200, { ok: true, data: result });
      return;
    }

    // ---- Pair: Create ----
    if (pathname === "/api/pair/create" && method === "POST") {
      const token = extractBearerToken(req);
      if (!token) {
        jsonResponse(res, 401, { ok: false, error: "缺少 Authorization header" });
        return;
      }
      const user = verifyToken(token);
      const result = createPairingCode(user.userId);
      jsonResponse(res, 200, { ok: true, data: result });
      return;
    }

    // ---- Pair: Verify ----
    if (pathname === "/api/pair/verify" && method === "POST") {
      const token = extractBearerToken(req);
      if (!token) {
        jsonResponse(res, 401, { ok: false, error: "缺少 Authorization header" });
        return;
      }
      const user = verifyToken(token);
      const body = parseJson<PairVerifyRequest>(await readBody(req));
      const valid = verifyPairingCode(user.userId, body.code);
      jsonResponse(res, 200, { ok: true, data: { valid } });
      return;
    }

    // ---- 404 ----
    jsonResponse(res, 404, { ok: false, error: "未找到该路由" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "内部服务器错误";
    console.error(`[RELAY] HTTP 错误: ${method} ${pathname} - ${message}`);

    // 区分客户端错误和服务器错误
    const status =
      message.includes("已存在") ||
      message.includes("不能为空") ||
      message.includes("无效") ||
      message.includes("错误")
        ? 400
        : 500;
    jsonResponse(res, status, { ok: false, error: message });
  }
}

// ---- 启动 ----

// 初始化数据库
getDb();

const server = http.createServer(handleHttpRequest);

// WebSocket 服务器（noServer 模式，手动 upgrade）
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const token = url.searchParams.get("token");

  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let user: { userId: number; username: string };
  try {
    user = verifyToken(token);
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  if (pathname === "/ws/desktop") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleDesktopConnection(ws, user.userId);
    });
    return;
  }

  if (pathname === "/ws/mobile") {
    const code = url.searchParams.get("code");
    if (!code) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleMobileConnection(ws, user.userId, code);
    });
    return;
  }

  socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`[RELAY] 服务器已启动，监听端口 ${PORT}`);
  console.log(`[RELAY] HTTP API: http://localhost:${PORT}/api/health`);
  console.log(`[RELAY] WebSocket: ws://localhost:${PORT}/ws/desktop`);
  console.log(`[RELAY] WebSocket: ws://localhost:${PORT}/ws/mobile`);
});
