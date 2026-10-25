import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getDb } from "./db.js";
import type { AuthResponse, JwtPayload } from "./types.js";

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";
const JWT_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

function getSecret(): string {
  return process.env.JWT_SECRET || "loom-relay-dev-secret";
}

function signToken(userId: number, username: string): AuthResponse {
  const secret = getSecret();
  const token = jwt.sign({ userId, username } satisfies JwtPayload, secret, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + JWT_EXPIRES_SECONDS;
  return { token, expiresAt };
}

/**
 * 注册新用户并返回 JWT。
 * @throws 用户名已存在时抛出错误。
 */
export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  if (!username || !password) {
    throw new Error("用户名和密码不能为空");
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username) as { id: number } | undefined;
  if (existing) {
    throw new Error("用户名已存在");
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hash);

  const userId = Number(result.lastInsertRowid);
  console.log(`[RELAY] 新用户注册: ${username} (id=${userId})`);
  return signToken(userId, username);
}

/**
 * 用户登录，验证密码后返回 JWT。
 */
export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  if (!username || !password) {
    throw new Error("用户名和密码不能为空");
  }

  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string } | undefined;
  if (!row) {
    throw new Error("用户名或密码错误");
  }

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    throw new Error("用户名或密码错误");
  }

  console.log(`[RELAY] 用户登录: ${username}`);
  return signToken(row.id, username);
}

/**
 * 刷新 JWT。验证旧 token 后签发新 token。
 */
export function refreshToken(oldToken: string): AuthResponse {
  if (!oldToken) {
    throw new Error("token 不能为空");
  }
  const decoded = verifyToken(oldToken);
  console.log(`[RELAY] Token 刷新: ${decoded.username}`);
  return signToken(decoded.userId, decoded.username);
}

/**
 * 验证 JWT 并返回 payload。
 * @throws token 无效或过期时抛出错误。
 */
export function verifyToken(token: string): JwtPayload {
  if (!token) {
    throw new Error("token 不能为空");
  }
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & JwtPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    throw new Error("无效或过期的 token");
  }
}
