#!/usr/bin/env node
/**
 * 跨端统一版本号管理脚本 (Unified Multi-platform Version Manager)
 *
 * 统一管理与同步整个仓库跨端各模块的版本号（方案 A: 全端版本强对齐）：
 *   1. 根目录 Cargo.toml ([workspace.package] version)
 *   2. crates/gui/src-tauri/tauri.conf.json (version)
 *   3. crates/gui/frontend/package.json (version)
 *   4. crates/gui/frontend/src/pages/AgentManagementPage.tsx (skillVersion 默认 fallback)
 *
 * 用法：
 *   node scripts/bump-version.mjs --check                 # 校验全端版本是否一致
 *   node scripts/bump-version.mjs <new_version>           # 统一修改全端版本号 (例如 0.8.4)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");

const cargoTomlPath = path.join(rootDir, "Cargo.toml");
const tauriConfPath = path.join(rootDir, "crates", "gui", "src-tauri", "tauri.conf.json");
const frontendPkgPath = path.join(rootDir, "crates", "gui", "frontend", "package.json");
const agentMgmtPath = path.join(
  rootDir,
  "crates",
  "gui",
  "frontend",
  "src",
  "pages",
  "AgentManagementPage.tsx"
);

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const targetVersion = args.find((arg) => !arg.startsWith("--"));

function fail(msg) {
  console.error(`\x1b[31m[bump-version ERROR]\x1b[0m ${msg}`);
  process.exit(1);
}

function success(msg) {
  console.log(`\x1b[32m[bump-version]\x1b[0m ${msg}`);
}

function info(msg) {
  console.log(`[bump-version] ${msg}`);
}

// ── 1. 读取当前各模块版本 ────────────────────────────────────────────────────────
function readCurrentVersions() {
  const versions = {};

  // 1. Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    const content = fs.readFileSync(cargoTomlPath, "utf8");
    const match = content.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/);
    if (match) versions["Cargo.toml"] = match[1];
  }

  // 2. tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const json = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    if (json.version) versions["tauri.conf.json"] = json.version;
  }

  // 3. frontend package.json
  if (fs.existsSync(frontendPkgPath)) {
    const json = JSON.parse(fs.readFileSync(frontendPkgPath, "utf8"));
    if (json.version) versions["frontend/package.json"] = json.version;
  }

  // 4. AgentManagementPage.tsx
  if (fs.existsSync(agentMgmtPath)) {
    const content = fs.readFileSync(agentMgmtPath, "utf8");
    const match = content.match(/useState<string>\('([^']+)'\)/);
    if (match) versions["AgentManagementPage.tsx"] = match[1];
  }

  return versions;
}

// ── 2. Check 模式 ────────────────────────────────────────────────────────────
if (checkOnly) {
  const versions = readCurrentVersions();
  console.log("正在检查跨端模块版本号对齐状态：");
  let hasMismatch = false;
  const primaryVersion = versions["Cargo.toml"];

  for (const [key, ver] of Object.entries(versions)) {
    const match = ver === primaryVersion;
    if (!match) hasMismatch = true;
    const mark = match ? "\x1b[32mOK\x1b[0m" : "\x1b[31mMISMATCH\x1b[0m";
    console.log(`  - ${key.padEnd(28)}: ${ver.padEnd(10)} [${mark}]`);
  }

  if (hasMismatch) {
    fail("跨端模块版本号存在不一致，请运行: node scripts/bump-version.mjs <target_version>");
  } else {
    success(`所有模块版本号一致，统一版本: v${primaryVersion}`);
    process.exit(0);
  }
}

// ── 3. 修改模式 ──────────────────────────────────────────────────────────────
if (!targetVersion) {
  fail("缺少目标版本号参数。\n用法: node scripts/bump-version.mjs <new_version>");
}

if (!/^\d+\.\d+\.\d+.*$/.test(targetVersion)) {
  fail(`无效的语义化版本号格式: "${targetVersion}"，格式应如 "0.8.4"`);
}

info(`开始跨端统一更新版本号 -> v${targetVersion}`);

// 1. Cargo.toml
if (fs.existsSync(cargoTomlPath)) {
  const content = fs.readFileSync(cargoTomlPath, "utf8");
  const updated = content.replace(
    /(\[workspace\.package\][\s\S]*?version\s*=\s*)"[^"]+"/,
    `$1"${targetVersion}"`
  );
  fs.writeFileSync(cargoTomlPath, updated, "utf8");
  info(`已更新 Cargo.toml -> ${targetVersion}`);
}

// 2. tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
  const json = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  json.version = targetVersion;
  fs.writeFileSync(tauriConfPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  info(`已更新 crates/gui/src-tauri/tauri.conf.json -> ${targetVersion}`);
}

// 3. frontend package.json
if (fs.existsSync(frontendPkgPath)) {
  const json = JSON.parse(fs.readFileSync(frontendPkgPath, "utf8"));
  json.version = targetVersion;
  fs.writeFileSync(frontendPkgPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  info(`已更新 crates/gui/frontend/package.json -> ${targetVersion}`);
}

// 4. AgentManagementPage.tsx
if (fs.existsSync(agentMgmtPath)) {
  const content = fs.readFileSync(agentMgmtPath, "utf8");
  const updated = content.replace(
    /useState<string>\('[^']+'\)/,
    `useState<string>('${targetVersion}')`
  );
  fs.writeFileSync(agentMgmtPath, updated, "utf8");
  info(`已更新 crates/gui/frontend/src/pages/AgentManagementPage.tsx fallback -> ${targetVersion}`);
}

// 5. 检查 whats-new 日志提示
const whatsNewPath = path.join(
  rootDir,
  "crates",
  "gui",
  "src-tauri",
  "whats-new",
  `v${targetVersion}.md`
);
if (!fs.existsSync(whatsNewPath)) {
  console.log(`\n\x1b[33m[提示]\x1b[0m 尚未找到对应的更新日志: ${path.relative(rootDir, whatsNewPath)}`);
  console.log(`       发版前请创建或完善该文件以提供新版本更新弹窗说明。\n`);
}

success(`跨端版本号已统一更新为 v${targetVersion}！`);
