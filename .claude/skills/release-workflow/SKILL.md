---
name: release-workflow
description: 检查项目的 CI 构建情况、分析和修复发生的报错、在本地运行测试和打包校验、自动更新版本配置并提交推送相应的 Release 标签。
---

# Release Workflow

此 Skill 引导项目从 CI 修复到最终更新版本和在 GitHub 自动发布 release 的完整标准化流程。

## 适用场景

当用户提到以下需求时，应执行或参考此 Skill 的流程指导：
- "发布新版本" / "发版"
- "修复 CI 构建/发布 workflow 失败"
- "更新版本号并重新打 Tag 发版"
- "发布新的 release/更新包"

## 前置分流：本地构建 vs 正式发布

**在开始任何步骤之前，必须先判断用户的真实意图：**

| 用户表达 | 行为 |
|---|---|
| "构建本地 release" / "本地构建" / "本地打包" / "build local" | 使用 `cargo tauri build` 构建本地 Tauri 打包版本，输出裸 exe 产物路径 |
| "发版" / "发布新版本" / "更新版本" / "打 tag" / "推送 release" | 完整 CI 修复→提版本→打 tag→推 GitHub 流程 |

### 本地构建

**注意：打包前必须先重新编译 loom CLI**，否则 `cargo tauri build` 会把旧的 CLI 产物内嵌进 GUI（例如缺失 `template` 子命令）。如果之前已编译过 `loom-gui` 且有增量缓存，需先对 `loom-gui` 进行 clean，确保内嵌 `loom.exe` 成功更新。正确顺序：

```bash
cargo clean -p loom-gui
cargo build --release --package loom-cli
cargo tauri build
```

构建完成后，必须回传产物的**完整绝对路径**：
```
构建完成！
Release 路径:
- GUI: D:\...\loom\target\release\loom-gui.exe
```

**注意：** 本地构建与正式发布的区别：
- **禁止**修改 `Cargo.toml`、`package.json`、`tauri.conf.json` 中的版本号
- **禁止** `git commit`、`git push`、`git tag`
- **禁止**触发 GitHub Actions / CI release workflow
- **禁止**生成 installer / 打包签名

如果无法区分意图，应询问用户："你指的是本地构建还是正式发布？"

## 核心流程分步指南

### 第一步：检查当前 CI 构建与发布状态

使用 Github CLI (gh) 检查最近的运行记录，找出失败的工作流运行和故障步骤：
```powershell
# 列出最近 5 次的运行历史
gh run list --limit 5

# 查看特定运行（特别是失败运行）的具体执行日志
gh run view <RUN_ID>
# 或者直接定位失败日志
gh run view <RUN_ID> --log-failed
```

### 第二步：定位并修复编译/测试错误

根据日志中的错误（例如 TypeScript 类型报错、未定义的变量/函数调用等），在源码中修复它。
- 优先选择在已有文件中进行最简逻辑修改（Ponytail 风格），避免在未取得许可时引入非必要的大规模重构。

### 第三步：本地测试与编译校验

在准备提升版本号发版前，必须在本地确保相关 environment 编译和测试完全通过，防止将错误再次推送到远程：
1. **前端类型及打包验证**：
   ```powershell
   npm --prefix crates/gui/frontend run build
   ```
2. **Rust Workspace 静态类型与宏展开检查**：
   ```powershell
   cargo check --workspace
   ```
3. **Rust Workspace 核心单元测试**：
   ```powershell
   cargo test --workspace
   ```

### 第四步：更新版本配置信息

在本地验证一切正常后，依照当前的语义化版本号，在以下四个核心位置提升版本号（例如从 `v0.3.4` 提升至 `v0.3.5`）：
1. 根目录的 **`Cargo.toml`** 中的 `[workspace.package]` 部分：
   ```toml
   version = "0.3.5"
   ```
2. Frontend 目录的 **`crates/gui/frontend/package.json`**：
   ```json
   "version": "0.3.5"
   ```
3. Tauri 配置的 **`crates/gui/src-tauri/tauri.conf.json`**：
   ```json
   "version": "0.3.5"
   ```
4. Frontend Agent 管理页默认 Skill 版本 State **`crates/gui/frontend/src/pages/AgentManagementPage.tsx`**：
   ```tsx
   const [skillVersion, setSkillVersion] = useState<string>('0.3.5');
   ```

5. **`loom` skill 与 `loom` CLI 的版本自动联动机制说明**：
   - **`loom` CLI 版本**直接绑定 workspace 版本（`crates/cli/Cargo.toml` 中定义 `version.workspace = true`），只要更新根目录 `Cargo.toml`，`loom --version` 即可自动同步最新版本。
   - **`loom` skill 后端模版版本**在 `crates/core/src/skills.rs` 中使用 `LOOM_SKILL_VERSION = env!("CARGO_PKG_VERSION")`，在编译阶段自动获取 `Cargo.toml` 的版本，因此生成的 Skill YAML 标头也会自动更新。
   - **前端静态 Fallback 版本**：`AgentManagementPage.tsx` 中的 `skillVersion` 默认初始值须一并更改，避免未完成后端通信前显示旧版本。
   - **发版前校验**：确认注入的 `~/.claude/skills/loom/SKILL.md` / `~/.config/opencode/skills/loom/SKILL.md` 中的 `version` 字段与 `loom --version` 输出一致（均为目标版本号）。

### 第五步：编写更新日志（whats-new）

创建或更新对应版本的 whats-new 更新日志文件，用于新版首次启动时弹窗展示：

1. 检查 `crates/gui/src-tauri/whats-new/` 目录下是否存在 `v0.X.Y.md` 文件
2. 若不存在，创建该文件；若存在，更新内容为当前版本的变更摘要
3. 文件内容采用 Markdown 格式，简要描述该版本的新功能、修复和改进：
   ```markdown
   - 新功能 A
   - 修复 B
   - 改进 C
   ```
4. 将该文件加入 git 暂存区，与版本配置一起提交

**请务必在发版前提醒用户编写此文件**，否则用户升级后将看不到更新提示。

### 第六步：提交版本变更（推 tag 前的强制约束）

**🚨 关键规则：必须先提交版本变更，再打 tag 推送。tag 必须指向包含版本号提升的 commit。** 0.4.6 发布事故（tag 指向了 0.4.5 的 commit，导致安装包名仍是 0.4.5）就是因为违反了这个顺序。

1. 添加所有有变更的修正文件、版本配置文件和更新日志：
   ```bash
   git add Cargo.toml crates/gui/frontend/package.json crates/gui/src-tauri/tauri.conf.json crates/gui/src-tauri/whats-new/v0.X.Y.md [其他被修改的文件]
   ```

2. 创建合规的 Git 提交信息，**必须先提交**，提交信息应包含更新日志变更：
   ```powershell
   git commit -m @'
   chore: bump version to v0.X.Y

   - 更新日志
   - 其他变更说明
   '@
   ```

3. **【强制校验】** 检查已提交的版本号是否与目标 tag 一致，确认版本文件在已提交的内容中而不是仅仅在暂存区：
   ```powershell
   # 检查已提交的版本号（而非工作区/暂存区）
   git show HEAD:Cargo.toml | Select-String 'version = "'
   git show HEAD:crates/gui/src-tauri/tauri.conf.json | Select-String '"version"'
   git show HEAD:crates/gui/frontend/package.json | Select-String '"version"'

   # 确认没有未提交的版本变更残留
   git diff --name-only
   # 输出应为空。若还有文件未提交，则回到第 1 步重新添加提交
   ```

4. **工作区必须干净**之后，才能建立版本 Tag 并推送至 GitHub（此操作会触发 `.github/workflows/release.yml` 自动编译构建 NSIS Windows 安装包并发布到 GitHub Release）：
   ```bash
   # 先确认默认分支（很多仓库已从 master 迁移到 main）
   gh repo view --json defaultBranchRef | jq -r .defaultBranchRef.name

   # 推送代码和 tag 到正确的默认分支
   git tag v0.3.5
   git push origin <默认分支> v0.3.5
   ```