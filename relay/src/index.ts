import http from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import {
  register,
  login,
  refreshToken,
  verifyToken,
  adminResetUserPassword,
} from "./auth.js";
import {
  createPairingCode,
  verifyPairingCode,
  getActivePairingSummaries,
  isAccountPaired,
  getAccountBinding,
  markAccountPaired,
  ensureBindingDeviceId,
  unbindAccount,
} from "./pairing.js";
import {
  handleDesktopConnection,
  handleMobileConnection,
  getActiveSessionSummaries,
  terminateUserSessions,
} from "./relay.js";
import {
  corsMiddleware,
  createRateLimiter,
  getClientIp,
} from "./middleware.js";
import {
  getDb,
  getUserCount,
  getUserMap,
  getAllUsers,
  deleteUser,
  countMobileBindings,
} from "./db.js";
import { renderDashboardHtml } from "./dashboard.js";
import type {
  ApiResponse,
  AuthRegisterRequest,
  AuthLoginRequest,
  PairVerifyRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
} from "./types.js";

// ---- 配置 ----

const PORT = parseInt(process.env.PORT || "8443", 10);
const START_TIME = Date.now();

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

function htmlResponse(res: http.ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
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

/**
 * 校验当前请求是否具备管理员权限。
 * 纯基于管理密钥认证（RELAY_ADMIN_KEY / ADMIN_KEY 或 JWT_SECRET），不污染数据库表结构。
 */
function checkIsAdmin(req: http.IncomingMessage): boolean {
  const configuredAdminKey =
    process.env.RELAY_ADMIN_KEY ||
    process.env.ADMIN_KEY ||
    process.env.JWT_SECRET ||
    "loom-admin-secret";
  const customAdminKey = req.headers["x-admin-key"] as string | undefined;
  if (customAdminKey && customAdminKey === configuredAdminKey) {
    return true;
  }

  const token = extractBearerToken(req);
  return token === configuredAdminKey;
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
    // ---- Dashboard (Console UI) ----
    if ((pathname === "/" || pathname === "/admin") && method === "GET") {
      htmlResponse(res, renderDashboardHtml());
      return;
    }

    // ---- Health ----
    if (pathname === "/api/health" && method === "GET") {
      jsonResponse(res, 200, { ok: true, data: { status: "ok" } });
      return;
    }

    // ---- System Status & Metrics (Used by Dashboard) ----
    if (pathname === "/api/status" && method === "GET") {
      const sessions = getActiveSessionSummaries();
      const pairings = getActivePairingSummaries(true); // 默认脱敏显示
      const totalUsers = getUserCount();
      const userMap = getUserMap();

      const sessionsWithNames = sessions.map((s) => ({
        ...s,
        username: userMap.get(s.userId) || `用户#${s.userId}`,
      }));

      const pairingsWithNames = pairings.map((p) => ({
        ...p,
        username: userMap.get(p.userId) || `用户#${p.userId}`,
      }));

      const desktopOnline = sessions.filter((s) => s.desktopOnline).length;
      const mobileOnline = sessions.filter((s) => s.mobileOnline).length;
      const bridgedChannels = sessions.filter((s) => s.channelBridged).length;

      jsonResponse(res, 200, {
        ok: true,
        data: {
          uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
          metrics: {
            desktopOnline,
            mobileOnline,
            bridgedChannels,
            activeCodes: pairings.length,
            boundAccounts: countMobileBindings(),
            totalUsers,
          },
          sessions: sessionsWithNames,
          pairings: pairingsWithNames,
        },
      });
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

      const pairSuccess = {
        valid: true,
        success: true,
        workspaceId: "default",
        workspaceName: "Loom Workspace",
      };

      // 已绑定的账号无需再次校验配对码（重连场景）
      if (isAccountPaired(user.userId)) {
        const binding = getAccountBinding(user.userId);
        const boundDeviceId = binding?.deviceId ?? null;
        const requestDeviceId = body.deviceId ?? null;

        // 同一台设备，或老版本客户端没带 deviceId：直接放行
        if (!requestDeviceId || !boundDeviceId || boundDeviceId === requestDeviceId) {
          // 老版本客户端配对时没带 deviceId：借这次请求补齐绑定标识
          if (!boundDeviceId && requestDeviceId) {
            ensureBindingDeviceId(user.userId, requestDeviceId);
          }
          jsonResponse(res, 200, { ok: true, data: pairSuccess });
          return;
        }

        // 绑定到了别的设备：只有桌面端新生成的配对码才能把绑定改到本设备
        const rebindResult = verifyPairingCode(user.userId, body.code);
        if (!rebindResult.valid) {
          jsonResponse(res, 200, {
            ok: false,
            error:
              "此账号已绑定其他手机设备，请先在桌面端点击「解绑手机端」，或用桌面端新生成的配对码改绑到本设备",
          });
          return;
        }

        // 配对码校验通过 → 把绑定改到当前设备
        console.log(
          `[RELAY] 配对码校验通过，绑定改绑到新设备: userId=${user.userId}, deviceId=${requestDeviceId}`,
        );
        markAccountPaired(user.userId, requestDeviceId);
        jsonResponse(res, 200, { ok: true, data: pairSuccess });
        return;
      }

      const verifyResult = verifyPairingCode(user.userId, body.code);
      if (!verifyResult.valid) {
        jsonResponse(res, 200, {
          ok: false,
          error:
            `${verifyResult.error || "配对码无效或已过期"}。该账号当前未绑定手机端，请在桌面端点击「开启远程会话」生成新配对码后重新输入`,
        });
        return;
      }

      // 校验通过即建立账号级绑定：此后手机端重连只需 token
      markAccountPaired(user.userId, body.deviceId);
      jsonResponse(res, 200, { ok: true, data: pairSuccess });
      return;
    }

    // ---- Pair: Binding Status ----
    if (pathname === "/api/pair/binding" && method === "GET") {
      const token = extractBearerToken(req);
      if (!token) {
        jsonResponse(res, 401, { ok: false, error: "缺少 Authorization header" });
        return;
      }
      const user = verifyToken(token);
      const binding = getAccountBinding(user.userId);
      jsonResponse(res, 200, {
        ok: true,
        data: {
          paired: Boolean(binding),
          pairedAt: binding?.pairedAt ?? null,
          deviceName: binding?.deviceName ?? null,
        },
      });
      return;
    }

    // ---- Pair: Unbind (强制解绑) ----
    if (pathname === "/api/pair/unbind" && method === "POST") {
      const token = extractBearerToken(req);
      if (!token) {
        jsonResponse(res, 401, { ok: false, error: "缺少 Authorization header" });
        return;
      }
      const user = verifyToken(token);
      const removed = unbindAccount(user.userId);
      // 解绑后立刻断开手机端连接，让手机端回到「需要配对码」的状态
      terminateUserSessions(user.userId, "绑定已解除，请重新输入配对码");
      jsonResponse(res, 200, {
        ok: true,
        data: { success: true, removed },
      });
      return;
    }

    // ---- Admin: Login / Authenticate ----
    if (pathname === "/api/admin/login" && method === "POST") {
      const body = parseJson<{ adminKey?: string }>(await readBody(req));
      const configuredAdminKey =
        process.env.RELAY_ADMIN_KEY ||
        process.env.ADMIN_KEY ||
        process.env.JWT_SECRET ||
        "loom-admin-secret";

      if (body.adminKey && body.adminKey === configuredAdminKey) {
        jsonResponse(res, 200, {
          ok: true,
          data: {
            adminToken: configuredAdminKey,
          },
        });
        return;
      }

      jsonResponse(res, 401, { ok: false, error: "管理员密钥错误" });
      return;
    }

    // ---- Admin: Get User List ----
    if (pathname === "/api/admin/users" && method === "GET") {
      if (!checkIsAdmin(req)) {
        jsonResponse(res, 403, { ok: false, error: "无权访问，需要管理员权限" });
        return;
      }
      const users = getAllUsers();
      jsonResponse(res, 200, { ok: true, data: users });
      return;
    }

    // ---- Admin: Create User ----
    if (pathname === "/api/admin/users" && method === "POST") {
      if (!checkIsAdmin(req)) {
        jsonResponse(res, 403, { ok: false, error: "无权访问，需要管理员权限" });
        return;
      }
      const body = parseJson<AdminCreateUserRequest>(await readBody(req));
      const userRes = await register(body.username, body.password);
      jsonResponse(res, 201, { ok: true, data: { username: userRes.username } });
      return;
    }

    // ---- Admin: Reset User Password ----
    if (pathname === "/api/admin/users/password" && method === "POST") {
      if (!checkIsAdmin(req)) {
        jsonResponse(res, 403, { ok: false, error: "无权访问，需要管理员权限" });
        return;
      }
      const body = parseJson<AdminResetPasswordRequest>(await readBody(req));
      if (!body.userId || !body.password) {
        jsonResponse(res, 400, { ok: false, error: "缺少 userId 或 password" });
        return;
      }
      await adminResetUserPassword(body.userId, body.password);
      jsonResponse(res, 200, { ok: true, data: { message: "密码重置成功" } });
      return;
    }

    // ---- Admin: Delete User ----
    if (pathname === "/api/admin/users" && method === "DELETE") {
      if (!checkIsAdmin(req)) {
        jsonResponse(res, 403, { ok: false, error: "无权访问，需要管理员权限" });
        return;
      }
      const userIdParam = url.searchParams.get("userId");
      const userId = userIdParam ? parseInt(userIdParam, 10) : undefined;
      if (!userId || isNaN(userId)) {
        jsonResponse(res, 400, { ok: false, error: "请提供有效的 userId 参数" });
        return;
      }
      terminateUserSessions(userId, "用户已被管理员删除");
      const success = deleteUser(userId);
      if (!success) {
        jsonResponse(res, 404, { ok: false, error: "未找到该用户" });
        return;
      }
      jsonResponse(res, 200, { ok: true, data: { message: "用户已删除" } });
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
      message.includes("错误") ||
      message.includes("少于") ||
      message.includes("超过")
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
    // code 可选：账号已完成绑定时仅凭 token 即可重连
    const code = url.searchParams.get("code") ?? undefined;
    const deviceId = url.searchParams.get("deviceId") ?? undefined;
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleMobileConnection(ws, user.userId, code, deviceId);
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
