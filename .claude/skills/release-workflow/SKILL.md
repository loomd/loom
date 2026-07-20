---
name: release-workflow
description: 检查项目的 CI 构建情况、分析和修复发生的报错、在本地运行测试和打包校验、自动更新版本配置并提交推送相应的 Release 标签。
---

# Release Workflow

此 Skill 引导项目从 CI 修复到最终更新版本和在 GitHub 自动发布 release 的完整标准化流程。

## 适用场景

当用户提到以下需求时，应执行或参考此 Skill 的流程指导：
- “发布新版本” / “发版”
- “修复 CI 构建/发布 workflow 失败”
- “更新版本号并重新打 Tag 发版”
- “发布新的 release/更新包”

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

在本地验证一切正常后，依照当前的语义化版本号，在以下三个核心位置提升版本号（例如从 `v0.3.4` 提升至 `v0.3.5`）：
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

### 第五步：提交版本变更（推 tag 前的强制约束）

**🚨 关键规则：必须先提交版本变更，再打 tag 推送。tag 必须指向包含版本号提升的 commit。** 0.4.6 发布事故（tag 指向了 0.4.5 的 commit，导致安装包名仍是 0.4.5）就是因为违反了这个顺序。

1. 添加所有有变更的修正文件和版本配置文件：
   ```bash
   git add Cargo.toml crates/gui/frontend/package.json crates/gui/src-tauri/tauri.conf.json [其他被修改的文件]
   ```

2. 创建合规的 Git 提交信息，**必须先提交**：
   ```powershell
   git commit -m @'
   chore: bump version to v0.X.Y

   - Desc of changes
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
