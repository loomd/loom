/**
 * 生成自建 Relay Server 的管理面板单文件 HTML
 */
export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loom Relay Console</title>
  <style>
    :root {
      --bg-base: #0b0c10;
      --bg-card: #13141f;
      --bg-elevated: #1a1b29;
      --border-subtle: #242638;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent-primary: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.15);
      --status-success: #10b981;
      --status-warning: #f59e0b;
      --status-danger: #ef4444;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 24px;
      min-height: 100vh;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      background: var(--accent-primary);
      color: #fff;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.9rem;
      letter-spacing: 0.5px;
    }
    .header-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .header-subtitle {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--status-success);
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 500;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--status-success);
      box-shadow: 0 0 8px var(--status-success);
    }
    .btn-refresh {
      background: var(--bg-elevated);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .btn-refresh:hover {
      background: var(--border-subtle);
      border-color: var(--accent-primary);
    }
    /* Metric Cards */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
    }
    .metric-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .metric-title {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .metric-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: #fff;
      font-family: var(--font-mono);
    }
    .metric-sub {
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    /* Section Panels */
    .panel {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 12px;
    }
    .panel-title {
      font-size: 1rem;
      font-weight: 600;
    }
    .panel-count {
      font-size: 0.75rem;
      padding: 2px 8px;
      background: var(--bg-elevated);
      border-radius: 12px;
      color: var(--text-muted);
    }
    /* Table */
    .table-wrapper {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    th {
      color: var(--text-muted);
      font-weight: 500;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    tr:last-child td {
      border-bottom: none;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--status-success);
    }
    .badge-secondary {
      background: rgba(156, 163, 175, 0.12);
      color: var(--text-muted);
    }
    .badge-active {
      background: rgba(99, 102, 241, 0.18);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    .code-tag {
      font-family: var(--font-mono);
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--accent-primary);
      letter-spacing: 2px;
      background: var(--bg-elevated);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px dashed var(--accent-primary);
    }
    .empty-row {
      text-align: center;
      color: var(--text-muted);
      padding: 24px;
      font-style: italic;
    }
    /* Info Box */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .info-card {
      background: var(--bg-elevated);
      border-radius: 8px;
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .info-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .info-val {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: #e5e7eb;
      word-break: break-all;
    }
    footer {
      text-align: center;
      font-size: 0.75rem;
      color: #4b5563;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <span class="logo-badge">LOOM</span>
        <div>
          <h1 class="header-title">Relay Console</h1>
          <p class="header-subtitle">自建中继手机端远程控制与通信网关</p>
        </div>
      </div>
      <div class="header-right">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>Online</span>
        </div>
        <button class="btn-refresh" onclick="fetchStatus()">刷新数据</button>
      </div>
    </header>

    <!-- Metrics -->
    <section class="metrics-grid">
      <div class="metric-card">
        <div class="metric-title">已建立通道</div>
        <div class="metric-value" id="metric-bridged" style="color: var(--accent-primary)">0</div>
        <div class="metric-sub">电脑与手机双向互通</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">活跃桌面端</div>
        <div class="metric-value" id="metric-desktop">0</div>
        <div class="metric-sub">在线 Loom Desktop</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">活跃手机端</div>
        <div class="metric-value" id="metric-mobile">0</div>
        <div class="metric-sub">在线移动 App</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">有效配对码</div>
        <div class="metric-value" id="metric-codes">0</div>
        <div class="metric-sub">5 分钟内待连</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">注册用户数</div>
        <div class="metric-value" id="metric-users">0</div>
        <div class="metric-sub">SQLite 用户档案</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">服务运行时间</div>
        <div class="metric-value" id="metric-uptime" style="font-size: 1.25rem">-</div>
        <div class="metric-sub" id="metric-started">已启动</div>
      </div>
    </section>

    <!-- Active Sessions -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">活动远程连接会话 (Active Channels)</h2>
        <span class="panel-count" id="count-sessions">0 个活动会话</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>用户 ID</th>
              <th>用户名</th>
              <th>电脑端状态</th>
              <th>手机端状态</th>
              <th>中继管道状态</th>
            </tr>
          </thead>
          <tbody id="sessions-tbody">
            <tr><td colspan="5" class="empty-row">暂无活动连接</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Active Pairing Codes -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">当前有效配对码 (Active Pairing Codes)</h2>
        <span class="panel-count" id="count-codes">0 个待配对</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>配对码</th>
              <th>所属用户 ID</th>
              <th>所属用户名</th>
              <th>有效剩余时间</th>
              <th>生成时间</th>
            </tr>
          </thead>
          <tbody id="codes-tbody">
            <tr><td colspan="5" class="empty-row">暂无有效配对码</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Quick Endpoints Guide -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">服务接入端点指引 (Endpoints)</h2>
      </div>
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">桌面端长连接端点</div>
          <div class="info-val">wss://<host>/ws/desktop?token=&lt;jwt&gt;</div>
        </div>
        <div class="info-card">
          <div class="info-label">移动端长连接端点</div>
          <div class="info-val">wss://<host>/ws/mobile?token=&lt;jwt&gt;&code=&lt;code&gt;</div>
        </div>
        <div class="info-card">
          <div class="info-label">账号登录认证接口</div>
          <div class="info-val">POST /api/auth/login</div>
        </div>
        <div class="info-card">
          <div class="info-label">账号注册接口</div>
          <div class="info-val">POST /api/auth/register</div>
        </div>
        <div class="info-card">
          <div class="info-label">配对码创建接口</div>
          <div class="info-val">POST /api/pair/create</div>
        </div>
        <div class="info-card">
          <div class="info-label">健康探测接口</div>
          <div class="info-val">GET /api/health</div>
        </div>
      </div>
    </section>

    <footer>
      Loom Remote Control Relay Server • Node.js + TypeScript + WebSocket
    </footer>
  </div>

  <script>
    function formatUptime(seconds) {
      const d = Math.floor(seconds / (3600 * 24));
      const h = Math.floor((seconds % (3600 * 24)) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (d > 0) return d + "天 " + h + "时 " + m + "分";
      if (h > 0) return h + "时 " + m + "分 " + s + "秒";
      return m + "分 " + s + "秒";
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const json = await res.json();
        if (!json.ok) return;

        const data = json.data;

        // Metrics
        document.getElementById('metric-bridged').innerText = data.metrics.bridgedChannels;
        document.getElementById('metric-desktop').innerText = data.metrics.desktopOnline;
        document.getElementById('metric-mobile').innerText = data.metrics.mobileOnline;
        document.getElementById('metric-codes').innerText = data.metrics.activeCodes;
        document.getElementById('metric-users').innerText = data.metrics.totalUsers;
        document.getElementById('metric-uptime').innerText = formatUptime(data.uptimeSeconds);
        document.getElementById('metric-started').innerText = "自 " + new Date(Date.now() - data.uptimeSeconds * 1000).toLocaleTimeString();

        // Sessions Table
        const sessionsTbody = document.getElementById('sessions-tbody');
        document.getElementById('count-sessions').innerText = data.sessions.length + ' 个活动会话';
        if (data.sessions.length === 0) {
          sessionsTbody.innerHTML = '<tr><td colspan="5" class="empty-row">暂无活动连接</td></tr>';
        } else {
          sessionsTbody.innerHTML = data.sessions.map(s => {
            const bridgedBadge = s.channelBridged
              ? '<span class="badge badge-active">双向管道已打通</span>'
              : '<span class="badge badge-secondary">等待对端连入</span>';
            const desktopBadge = s.desktopOnline
              ? '<span class="badge badge-success">在线</span>'
              : '<span class="badge badge-secondary">离线</span>';
            const mobileBadge = s.mobileOnline
              ? '<span class="badge badge-success">在线</span>'
              : '<span class="badge badge-secondary">离线</span>';

            return '<tr>' +
              '<td>#' + s.userId + '</td>' +
              '<td><strong>' + (s.username || '用户' + s.userId) + '</strong></td>' +
              '<td>' + desktopBadge + '</td>' +
              '<td>' + mobileBadge + '</td>' +
              '<td>' + bridgedBadge + '</td>' +
              '</tr>';
          }).join('');
        }

        // Codes Table
        const codesTbody = document.getElementById('codes-tbody');
        document.getElementById('count-codes').innerText = data.pairings.length + ' 个待配对';
        if (data.pairings.length === 0) {
          codesTbody.innerHTML = '<tr><td colspan="5" class="empty-row">暂无有效配对码</td></tr>';
        } else {
          codesTbody.innerHTML = data.pairings.map(c => {
            return '<tr>' +
              '<td><span class="code-tag">' + c.code + '</span></td>' +
              '<td>#' + c.userId + '</td>' +
              '<td>' + (c.username || '用户' + c.userId) + '</td>' +
              '<td>' + c.expiresInSeconds + ' 秒</td>' +
              '<td>' + new Date(c.createdAt).toLocaleTimeString() + '</td>' +
              '</tr>';
          }).join('');
        }
      } catch (err) {
        console.error('获取状态失败:', err);
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 3000);
  </script>
</body>
</html>`;
}
