#!/usr/bin/env node
/**
 * 本地打包 release APK 的统一入口。
 *
 * 流程：同步版本号 -> gradlew assembleRelease -> 拷贝产物到 mobile/dist/。
 * 版本号的事实来源是 mobile/app.json；package.json 与原生工程里的版本号由
 * sync-version.mjs 在打包前强制对齐，避免沿用旧原生目录时
 * versionCode 不变导致无法覆盖安装。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, "..");
const androidRoot = path.join(mobileRoot, "android");
const distDir = path.join(mobileRoot, "dist");
const apkPath = path.join(
  androidRoot,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
const metadataPath = path.join(
  androidRoot,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "output-metadata.json",
);

function run(command, args, cwd) {
  console.log(`[build-apk] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`[build-apk] 执行失败: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[build-apk] 命令退出码 ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// 1. 版本号同步
run("node", [path.join(scriptDir, "sync-version.mjs")], mobileRoot);

// 2. 清理旧 Bundle 缓存，防止 React Native / Metro 沿用旧缓存
//
// 注意：只删 generated/assets 下的一层目录**不够**。实测遇到过「JS 改动没进包」：
//   - gradle 的 bundle 任务被判定 UP-TO-DATE，直接把上一次的 index.android.bundle
//     （Hermes 字节码 .hbc）重新打进 APK；
//   - Metro 的转换缓存（%TEMP%/metro-cache）也会命中旧产物。
// 因此这里把 bundle 产物、assets 目标目录、intermediates 以及 Metro 缓存一起清掉，
// 保证打出来的包一定包含当前源码。
const staleDirs = [
  path.join(androidRoot, "app", "build", "generated", "assets", "createBundleReleaseJsAndAssets"),
  path.join(androidRoot, "app", "build", "generated", "res", "createBundleReleaseJsAndAssets"),
  path.join(androidRoot, "app", "build", "intermediates", "assets", "release"),
  path.join(androidRoot, "app", "build", "intermediates", "sourcemaps", "react", "release"),
  path.join(os.tmpdir(), "metro-cache"),
];
for (const dir of staleDirs) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[build-apk] 已清理陈旧产物: ${dir}`);
  }
}
const staleManifests = [
  path.join(androidRoot, "app", "build", "generated", "assets", "createReleaseUpdatesResources", "app.manifest"),
  path.join(androidRoot, "app", "build", "intermediates", "assets", "release", "mergeReleaseAssets", "app.manifest"),
];
for (const manifest of staleManifests) {
  if (fs.existsSync(manifest)) {
    fs.rmSync(manifest, { force: true });
    console.log(`[build-apk] 已清理陈旧 manifest: ${manifest}`);
  }
}

// 3. 打包
const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(gradlew, ["assembleRelease", "--console=plain"], androidRoot);

// 3. 产物分发 + 版本回显
if (!fs.existsSync(apkPath)) {
  console.error(`[build-apk] 未找到产物: ${apkPath}`);
  process.exit(1);
}
fs.mkdirSync(distDir, { recursive: true });
const distApk = path.join(distDir, "loom-remote-release.apk");
fs.copyFileSync(apkPath, distApk);

let version = "";
if (fs.existsSync(metadataPath)) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const element = metadata.elements?.[0];
  if (element) {
    version = ` versionName=${element.versionName} versionCode=${element.versionCode}`;
  }
}

console.log(`[build-apk] 完成:${distApk}${version}`);
