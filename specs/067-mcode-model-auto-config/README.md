# 067-mcode-model-auto-config: mcode 与 opencode 多 Agent 模型自动配置与滚动选择

## 1. 背景与目标
在现有 Loom 系统中，已支持针对 OpenCode 的模型接口拉取、JSON 配置写入以及运行模板创建。为了扩展对 MiniMax Code (mcode) 等多 Agent 生态的支持，需要实现：
1. 模型自动配置面板支持多 Agent 滚动选择与固定。
2. 针对 mcode 的 `config.yaml` 自动写入，支持在不存在或已存在 `custom_provider` 的情况下安全注入 provider 与模型信息。
3. 针对 mcode 屏蔽不适用的 Gemini 协议，仅支持 OpenAI 兼容与 Anthropic 协议。
4. 模型配置完成后，自动在 Loom 中创建/更新对应的运行模板。

## 2. 架构与设计

### 2.1 mcode 配置文件路径与格式
- 配置文件路径：优先读取 `$MINIMAX_DATA_DIR/config.yaml`，未设置时读取用户主目录下的 `~/.minimax/config.yaml`。
- YAML 结构说明：
  ```yaml
  custom_provider:
    <provider_id>:
      name: <provider_name>
      kind: custom
      enabled: true
      api: openai-completions # 或 anthropic-messages
      options:
        apiKey: <api_key>
        baseURL: <base_url>
        authMode: api-key
      models:
        <model_id>:
          name: <model_id>
          attachment: true
          reasoning: true
          temperature: true
          tool_call: true
          limit:
            context: 1000000
            output: 64000
          modalities:
            input:
              - text
              - image
            output:
              - text
          thinking_config:
            mode: switchable
            default_value: 'true'
  ```
- 若原 `config.yaml` 文件中不存在 `custom_provider` 字段或该字段为 null，则自动初始化字典后再写入。
- 写入时使用临时文件 `.tmp` 进行原子重命名替换，防止损坏原有配置。

### 2.2 前端交互改造 (`AgentManagementPage.tsx`)
1. 右侧配置区增加 Agent 滚动选择列表：
   - 展示 OpenCode、mcode 卡片（含就绪状态与路径）。
   - 右侧提供“选择”按钮，点击后固定选中该 Agent。
2. 协议联动：
   - 选中 opencode 时：支持 OpenAI、Anthropic、Gemini。
   - 选中 mcode 时：过滤掉 Gemini，仅显示 OpenAI、Anthropic。若当前已选 Gemini 则自动回退到 OpenAI。
3. 保存联动：
   - 调用对应的 IPC 命令保存至对应配置文件并创建 Loom 模板。
