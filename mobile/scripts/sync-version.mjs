#!/usr/bin/env node
/**
 * 对齐移动端的三处版本号，保证「版本号只有一个事实来源」。
 *
 *   mobile/app.json            expo.version + expo.android.versionCode  ← 事实来源（入库）
 *   mobile/package.json        version                                  ← 与 app.json 保持一致
 *   mobile/android/app/build.gradle  versionCode / versionName           ← 打包实际读取处（不入库）
 *
 * 背景：`mobile/android/` 是 `expo prebuild` 生成的目录且被 .gitignore 排除。
 * `expo prebuild` 会自动把 app.json 的版本写进 build.gradle，但**沿用旧原生目录**
 * 直接打包时，build.gradle 里的值会停留在旧版本号 —— 打出来的包 versionCode 没变，
 * Android 拒绝覆盖安装，用户手机上的旧包继续生效。
 *
 * 用法：
 *   node scripts/sync-version.mjs          # 对齐（幂等）
 *   node scripts/sync-version.mjs --check  # 只校验，不一致则退出码 1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const appJsonPath = path.join(mobileRoot, "app.json");
const packageJsonPath = path.join(mobileRoot, "package.json");
const gradlePath = path.join(mobileRoot, "android", "app", "build.gradle");

const checkOnly = process.argv.includes("--check");
const problems = [];

function fail(message) {
  console.error(`[sync-version] ${message}`);
  process.exit(1);
}

// ── 1. 读取事实来源 ─────────────────────────────────────────────────────────
if (!fs.existsSync(appJsonPath)) fail(`找不到 ${appJsonPath}`);
const appConfig = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const versionName = appConfig?.expo?.version;
const versionCode = appConfig?.expo?.android?.versionCode;

if (!versionName) fail("app.json 缺少 expo.version");
if (!versionCode || !Number.isInteger(Number(versionCode))) {
  fail("app.json 缺少 expo.android.versionCode（或不是整数）");
}

// ── 2. package.json ────────────────────────────────────────────────────────
if (!fs.existsSync(packageJsonPath)) fail(`找不到 ${packageJsonPath}`);
const packageRaw = fs.readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageRaw);

if (packageJson.version !== versionName) {
  if (checkOnly) {
    problems.push(
      `package.json version=${packageJson.version} != app.json expo.version=${versionName}`,
    );
  } else {
    packageJson.version = versionName;
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `[sync-version] 已同步 package.json version -> ${versionName}`,
    );
  }
}

// ── 3. Android 原生工程 ───────────────────────────────────────────────────
if (!fs.existsSync(gradlePath)) {
  fail(
    `找不到 ${gradlePath}\n` +
      `原生工程尚未生成，请先执行：npx expo prebuild --platform android`,
  );
}

const original = fs.readFileSync(gradlePath, "utf8");

// 只在 defaultConfig 块内改写，避免误伤其它同名变量
const defaultConfigMatch = original.match(/defaultConfig\s*\{/);
if (!defaultConfigMatch) fail("未在 build.gradle 中找到 defaultConfig 块");
const blockStart = defaultConfigMatch.index;
const blockEnd = original.indexOf("\n    }", blockStart);
if (blockEnd === -1) fail("未能在 build.gradle 中定位 defaultConfig 块的结束位置");

const head = original.slice(0, blockStart);
const body = original.slice(blockStart, blockEnd);
const tail = original.slice(blockEnd);

const nextBody = body
  .replace(/versionCode.*$/m, `versionCode ${versionCode}`)
  .replace(/versionName\s+".*"/, `versionName "${versionName}"`);
const updated = head + nextBody + tail;

if (updated !== original) {
  if (checkOnly) {
    const currentName = body.match(/versionName\s+"([^"]+)"/)?.[1];
    const currentCode = body.match(/versionCode\s+(\S+)/)?.[1];
    problems.push(
      `build.gradle ${currentName}(${currentCode}) != app.json ${versionName}(${versionCode})`,
    );
  } else {
    fs.writeFileSync(gradlePath, updated, "utf8");
    console.log(
      `[sync-version] 已同步 build.gradle -> versionName "${versionName}" / versionCode ${versionCode}`,
    );
  }
} else {
  console.log(
    `[sync-version] build.gradle 已是 versionName "${versionName}" / versionCode ${versionCode}`,
  );
}

const manifestPath = path.join(
  mobileRoot,
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);
if (fs.existsSync(manifestPath)) {
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  if (!manifestContent.includes("android:usesCleartextTraffic")) {
    const patched = manifestContent.replace(
      "<application ",
      '<application android:usesCleartextTraffic="true" ',
    );
    if (patched !== manifestContent) {
      fs.writeFileSync(manifestPath, patched, "utf8");
      console.log('[sync-version] 已为 AndroidManifest.xml 补全 android:usesCleartextTraffic="true"');
    }
  }
}

// 保证 Kotlin 版本为 1.9.25（兼容 expo-modules-core Compose Compiler）
const rootGradlePath = path.join(mobileRoot, "android", "build.gradle");
if (fs.existsSync(rootGradlePath)) {
  const rootGradle = fs.readFileSync(rootGradlePath, "utf8");
  if (rootGradle.includes("'1.9.24'")) {
    fs.writeFileSync(rootGradlePath, rootGradle.replace(/'1.9.24'/g, "'1.9.25'"), "utf8");
    console.log("[sync-version] 已将 root build.gradle 的 kotlinVersion 对齐至 1.9.25");
  }
}

const gradlePropsPath = path.join(mobileRoot, "android", "gradle.properties");
if (fs.existsSync(gradlePropsPath)) {
  const props = fs.readFileSync(gradlePropsPath, "utf8");
  if (!props.includes("android.kotlinVersion")) {
    fs.appendFileSync(gradlePropsPath, "\nandroid.kotlinVersion=1.9.25\n", "utf8");
    console.log("[sync-version] 已在 gradle.properties 中配置 android.kotlinVersion=1.9.25");
  }
}

if (problems.length > 0) {
  console.error(
    `[sync-version] 版本号不一致：\n  - ${problems.join("\n  - ")}\n` +
      `请执行 node scripts/sync-version.mjs`,
  );
  process.exit(1);
}
