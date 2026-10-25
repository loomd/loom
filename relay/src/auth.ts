import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getDb, getUserCount, updateUserPassword } from "./db.js";
import type { AuthResponse, JwtPayload } from "./types.js";

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";
const JWT_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;
const MIN_PASSWORD_LEN = 6;
const MAX_PASSWORD_LEN = 64;

function getSecret(): string {
  return process.env.JWT_SECRET || "loom-relay-dev-secret";
}

export function validateRegistrationInput(username: string, password: string): void {
  if (!username || !password) {
    throw new Error("用户名和密码不能为空");
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    throw new Error("用户名长度必须在 3 到 24 个字符之间");
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    throw new Error("用户名仅支持英文字母、数字、下划线(_)和减号(-)");
  }
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(`密码长度不能少于 ${MIN_PASSWORD_LEN} 个字符`);
  }
  if (password.length > MAX_PASSWORD_LEN) {
    throw new Error(`密码长度不能超过 ${MAX_PASSWORD_LEN} 个字符`);
  }
}

function signToken(userId: number, username: string, role: "admin" | "user" = "user"): AuthResponse {
  const secret = getSecret();
  const token = jwt.sign({ userId, username, role } satisfies JwtPayload, secret, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + JWT_EXPIRES_SECONDS;
  return { token, expiresAt, username };
}

/**
 * 注册新用户并返回 JWT。
 * @throws 格式不合规或用户名已存在时抛出错误。
 */
export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const trimmedUser = username ? username.trim() : "";
  validateRegistrationInput(trimmedUser, password);

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(trimmedUser) as { id: number } | undefined;
  if (existing) {
    throw new Error("用户名已存在");
  }

  // 首个注册用户自动提升为管理员，方便自建节点快速初始化
  const totalUsers = getUserCount();
  const role: "admin" | "user" = totalUsers === 0 ? "admin" : "user";

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = db
    .prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, 'active')")
    .run(trimmedUser, hash, role);

  const userId = Number(result.lastInsertRowid);
  console.log(`[RELAY] 新用户注册: ${trimmedUser} (id=${userId}, role=${role})`);
  return signToken(userId, trimmedUser, role);
}

/**
 * 管理员直接创建新用户。
 */
export async function adminCreateUserAccount(
  username: string,
  password: string,
  role: "admin" | "user" = "user",
): Promise<{ id: number; username: string; role: string }> {
  const trimmedUser = username ? username.trim() : "";
  validateRegistrationInput(trimmedUser, password);

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(trimmedUser) as { id: number } | undefined;
  if (existing) {
    throw new Error("用户名已存在");
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = db
    .prepare("INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, ?, 'active')")
    .run(trimmedUser, hash, role);

  const userId = Number(result.lastInsertRowid);
  console.log(`[RELAY] 管理员创建用户: ${trimmedUser} (id=${userId}, role=${role})`);
  return { id: userId, username: trimmedUser, role };
}

/**
 * 管理员重置指定用户密码。
 */
export async function adminResetUserPassword(
  userId: number,
  newPassword: string,
): Promise<void> {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
    throw new Error(`新密码长度不能少于 ${MIN_PASSWORD_LEN} 个字符`);
  }
  if (newPassword.length > MAX_PASSWORD_LEN) {
    throw new Error(`新密码长度不能超过 ${MAX_PASSWORD_LEN} 个字符`);
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const success = updateUserPassword(userId, hash);
  if (!success) {
    throw new Error("用户不存在或更新密码失败");
  }
  console.log(`[RELAY] 管理员已重置用户密码: id=${userId}`);
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

  const trimmedUser = username.trim();
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash, COALESCE(role, 'user') as role, COALESCE(status, 'active') as status FROM users WHERE username = ?")
    .get(trimmedUser) as { id: number; password_hash: string; role: string; status: string } | undefined;
  if (!row) {
    throw new Error("用户名或密码错误");
  }

  if (row.status === "disabled") {
    throw new Error("该账号已被管理员封禁，无法登录");
  }

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    throw new Error("用户名或密码错误");
  }

  const role: "admin" | "user" = row.role === "admin" ? "admin" : "user";
  console.log(`[RELAY] 用户登录: ${trimmedUser} (role=${role})`);
  return signToken(row.id, trimmedUser, role);
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
  return signToken(decoded.userId, decoded.username, decoded.role || "user");
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
    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role === "admin" ? "admin" : "user",
    };
  } catch {
    throw new Error("无效或过期的 token");
  }
}

