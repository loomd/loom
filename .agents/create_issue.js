const { execFileSync } = require('child_process');

const title = '[UI]: 配置并使用自定义 Provider 时，欢迎页仍显示 "Login required / Sign in with /login" 提示';
const body = `### 问题描述 (Problem Description)
在 Mcode 终端中，当用户已经配置并使用自定义 Provider（例如配置了自定义模型，底部状态栏已成功识别并正常显示如 \`gemini-3.7-flash-high\`）时，启动主页（Welcome Banner）顶部仍会常驻显示：
- \`o Login required\`
- \`o Sign in with /login\`

这容易对使用自定义 Provider / 第三方模型 API 的用户产生误导，误以为环境未就绪或必须先通过 \`/login\` 登录 MiniMax 官方账号才能使用。

### 期望行为 (Expected Behavior)
- 当检测到已配置且处于激活状态的自定义 Provider 时，欢迎页顶部不应强制显示 \`Login required\` 和 \`Sign in with /login\` 提示。
- 或者将该状态区域替换为当前 Provider 的状态标识（例如显示 \`Custom Provider Active\` 或模型就绪状态）。

### 复现步骤 (Steps to Reproduce)
1. 在配置中设置自定义 Provider 及相应模型（如 \`gemini-3.7-flash-high\`）。
2. 启动 Mcode 进入终端主界面。
3. 观察欢迎页：底部状态栏显示已连接自定义模型，但顶部欢迎卡片依然显示 \`o Login required\` 和 \`o Sign in with /login\`。

### 环境信息 (Environment)
- Mcode 版本: v0.4.12
- OS: Windows 11 / 跨平台通用
`;

try {
  const result = execFileSync('gh', [
    'issue', 'create',
    '--repo', 'MiniMax-AI/minimax-code',
    '--title', title,
    '--body', body
  ], { encoding: 'utf8' });
  console.log('SUCCESS:', result.trim());
} catch (err) {
  console.error('FAILED:', err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
}
