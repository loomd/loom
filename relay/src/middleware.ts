import type { IncomingMessage, ServerResponse } from "node:http";

// ---- CORS ----

/**
 * 设置 CORS 响应头。如果是 OPTIONS 预检请求，自动响应 204 并返回 true。
 * 调用方收到 true 时应直接 return 不再继续处理。
 */
export function corsMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

// ---- Rate Limiter ----

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * 创建一个基于内存 Map 的简单限流器。
 * 返回的函数接收 IP 字符串，返回 true 表示允许通过、false 表示被限流。
 */
export function createRateLimiter(
  opts: RateLimiterOptions,
): (ip: string) => boolean {
  const store = new Map<string, RateLimitEntry>();

  // 定期清理过期条目
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(ip);
      }
    }
  }, opts.windowMs);
  cleanup.unref();

  return (ip: string): boolean => {
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }

    entry.count++;
    if (entry.count > opts.maxRequests) {
      return false;
    }
    return true;
  };
}

/**
 * 从请求中提取客户端 IP。
 */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}
