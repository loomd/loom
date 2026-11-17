---
status: complete
created: 2026-11-17
priority: high
tags:
- gui
- agent
- frontend
- backend
- zcode
created_at: 2026-11-17T11:24:45.959313700Z
updated_at: 2026-11-17T11:36:31.870258600Z
completed_at: 2026-11-17T11:36:31.870258600Z
transitions:
- status: complete
  at: 2026-11-17T11:36:31.870258600Z
---

# 079: ZCode CLI 配置引导接入

## 概述

Loom「配置引导」页（AgentManagementPage）当前只支持 opencode / mcode / agy 三个 Agent 的安装、更新、版本检测与模型配置。本 spec 将 ZCode CLI（npm 包 `zcode-app-cli`，其运行时与官方 ZCode Desktop 3.18.2 同源）纳入同一套引导流程，并统一 Agent 展示顺序为 mcode → zcode → agy → opencode。

## 需求规范

### 1. Agent 发现与版本检测
- [x] `discover_agents()` 增加 `zcode` 条目，可执行文件按 `zcode` 扫描（`.exe` / `.cmd` / `.bat` / `.ps1`）。
- [x] 安装命令：`npm install -g zcode-app-cli@latest`；文档链接指向 npm 包页。
- [x] 版本检测必须静态读取，严禁执行外部二进制：
  - 优先读 `~/.zcode/cli/version.json` 的 `checkedVersion`；
  - 回退读 npm 全局 `node_modules/zcode-app-cli/package.json` 的 `version`。
- [x] 最新版本查询：`fetch_agent_latest_version("zcode")` 请求 npm registry 的 `zcode-app-cli/latest`。

### 2. 顺序调整
- [x] 发现列表与「选择配置目标 Agent」选择器统一为 mcode → zcode → agy → opencode。

### 3. 配置到 Loom
- [x] 新增 `configure_zcode_provider` 命令，写入 `~/.zcode/v2/provider_config.json`（与 ZCode Desktop 共享同一份文件）：
  - `config.providerConfigRules.providerRules` 写入一个 `standard-personal` 个人 Provider，字段遵循官方 provider schema（`access` / `api` / `personalModelIds` / `modelOrder` / `visibility`）。
  - `config.modelConfigRules.manualProviderModelRules` 为每个选中模型写入完整模型配置（自定义模型通常不在内置目录中，仅 smart overlay 不足以使其可用）。
  - `config.providerOrder` 与 `config.defaultModelSelection` 同步更新。
- [x] 协议映射：OpenAI 兼容 → `openai-chat-completions`；Anthropic → `anthropic-messages`；不支持 Gemini。
- [x] 写入必须原子（临时文件 + rename），且严格保留既有 provider 规则与模型规则。
- [x] 配置成功后为每个选中模型创建 Loom 运行模板，参数为 `--model <providerId>/<modelId>`。

### 4. 前端
- [x] 「配置引导」页目标 Agent 选择器增加 ZCode，配套安装 / 更新 / 版本检测按钮与提示文案。
- [x] 更新命令使用 `npm install -g zcode-app-cli@latest`（`zcode-app-cli` 本身没有 `update` 子命令，`zcode update` 属于 Rust CLI 的自更新，不可混用）。

## 非目标
- 不实现 ZCode Desktop 桌面端的自动化安装。
- 不改动 mcode / opencode / agy 既有配置逻辑。

## 验收标准
- [x] `cargo check --all-targets`、`cargo clippy --all-targets`、`cargo test --workspace` 全绿。
- [x] 前端 `npm run lint`、`npm test` 全绿（293 项）。
- [x] 发现列表顺序为 mcode、zcode、agy、opencode。
- [x] zcode 条目能返回安装状态与版本；未安装时给出正确安装命令。

## 实现记录

### 改动文件
- `crates/core/src/agent_config.rs`：`detect_zcode_version()`、`fetch_agent_latest_version()` 的 zcode 分支、`discover_agents()` 顺序与 zcode 条目、`build_zcode_api_type()`、`normalize_zcode_base_url()`、`write_zcode_config_to_path()`、`write_zcode_config()`。
- `crates/core/src/storage/manager.rs`：`KNOWN_AGENTS` 增加 `zcode`，使 PATH 扫描能把 zcode 归类为 Agent。
- `crates/gui/src-tauri/src/main.rs`：新增 `configure_zcode_provider` Tauri 命令，并注册到 invoke_handler 与移动端 IPC 分发。
- `crates/gui/frontend/src/api.ts`：新增 `configureZcodeProvider`。
- `crates/gui/frontend/src/pages/AgentManagementPage.tsx`：目标 Agent 选择器、协议约束、保存分支、模板生成、版本检测列表。
- `crates/gui/frontend/src/test/AgentManagementPage.test.tsx`、`src/test/utils.test.ts`：配套测试。

### 关键决策
- **配置目标文件**：优先 `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`，其次 `ZCODE_DATA_BASE_DIR/v2/provider_config.json`，默认 `~/.zcode/v2/provider_config.json`。前者用于把某个模板的 provider 隔离到独立文件。
- **模型配置用 manual 规则**：自定义模型不在 zcode 内置目录中，仅写 smart overlay（`providerModelRules`）时模型不可选，因此每个模型都补一份完整的 `manualProviderModelRules`。
- **协议不含 Gemini**：官方 provider schema 只认 `anthropic-messages` / `openai-chat-completions` / `openai-responses`，与 mcode 一样只开放 OpenAI 兼容与 Anthropic。
- **模板参数**：`--model <providerId>/<modelId>`，与 zcode 的 `--model <provider/model>` 语义一致；重复配置时同步更新既有模板。

### 验证
- 单元测试：`test_discover_agents`、`test_build_zcode_api_type`、`test_normalize_zcode_base_url`、`test_write_zcode_config_merge_existing`、`test_write_zcode_config_overwrites_same_provider`。
- 真机探针：调用真实 `discover_agents()` 得到 `mcode / zcode / agy / opencode` 顺序，zcode 命中 `C:\nvm4w\nodejs\zcode.cmd`、版本 `3.18.2-47`；写入的 provider 配置经与官方 `provider.example.json` 对照，字段结构一致。

