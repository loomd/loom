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
      --accent-hover: #4f46e5;
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
      gap: 12px;
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
    .btn {
      background: var(--bg-elevated);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .btn:hover {
      background: var(--border-subtle);
      border-color: var(--accent-primary);
    }
    .btn-primary {
      background: var(--accent-primary);
      border-color: var(--accent-primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.3);
      color: var(--status-danger);
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: var(--status-danger);
    }
    .btn-sm {
      padding: 3px 8px;
      font-size: 0.75rem;
      border-radius: 4px;
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
      display: flex;
      align-items: center;
      gap: 8px;
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
    .badge-danger {
      background: rgba(239, 68, 68, 0.15);
      color: var(--status-danger);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .badge-role-admin {
      background: rgba(245, 158, 11, 0.15);
      color: var(--status-warning);
      border: 1px solid rgba(245, 158, 11, 0.3);
      font-weight: 600;
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
    /* Admin Auth Box */
    .admin-auth-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      background: var(--bg-elevated);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
    }
    .input-text {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px;
      color: var(--text-main);
      font-size: 0.85rem;
      outline: none;
      min-width: 180px;
    }
    .input-text:focus {
      border-color: var(--accent-primary);
    }
    .input-select {
      background: var(--bg-base);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 10px;
      color: var(--text-main);
      font-size: 0.85rem;
      outline: none;
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
    /* Modal Dialog */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(4px);
    }
    .modal-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .modal-title {
      font-size: 1.1rem;
      font-weight: 600;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-label {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .form-hint {
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 8px;
    }
    .action-group {
      display: flex;
      align-items: center;
      gap: 6px;
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
          <p class="header-subtitle">自建中继手机端远程控制与用户管理网关</p>
        </div>
      </div>
      <div class="header-right">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span>Online</span>
        </div>
        <button class="btn" onclick="fetchStatus()">刷新监控</button>
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
        <div class="metric-sub">5 分钟内待连 (安全脱敏)</div>
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

    <!-- Admin User Management Panel -->
    <section class="panel" id="admin-panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <span>账号体系与用户管理 (User Management)</span>
          <span id="admin-badge" class="badge badge-secondary">未解锁管理员</span>
        </h2>
        <div class="action-group" id="admin-top-actions">
          <!-- 解锁后动态插入创建账号等按钮 -->
        </div>
      </div>

      <!-- 未解锁提示与表单 -->
      <div id="admin-login-box" class="admin-auth-bar">
        <span style="font-size: 0.85rem; color: var(--text-muted);">管理员身份认证:</span>
        <input type="password" id="admin-key-input" class="input-text" placeholder="输入 ADMIN_KEY 密钥或管理员密码" />
        <button class="btn btn-primary" onclick="handleAdminLogin()">解锁管理控制台</button>
      </div>

      <!-- 已解锁用户管理列表 -->
      <div id="admin-users-table-container" style="display: none;" class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>最后更新</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
            <tr><td colspan="7" class="empty-row">正在加载用户档案...</td></tr>
          </tbody>
        </table>
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

    <!-- Active Pairing Codes (Masked for Security) -->
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">
          <span>当前有效配对码 (Active Pairing Codes)</span>
          <span class="badge badge-secondary" style="font-size: 0.72rem;">已脱敏掩码保护</span>
        </h2>
        <span class="panel-count" id="count-codes">0 个待配对</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>配对码 (脱敏)</th>
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
          <div class="info-val">wss://&lt;host&gt;/ws/desktop?token=&lt;jwt&gt;</div>
        </div>
        <div class="info-card">
          <div class="info-label">移动端长连接端点</div>
          <div class="info-val">wss://&lt;host&gt;/ws/mobile?token=&lt;jwt&gt;&code=&lt;code&gt;</div>
        </div>
        <div class="info-card">
          <div class="info-label">账号登录认证接口</div>
          <div class="info-val">POST /api/auth/login</div>
        </div>
        <div class="info-card">
          <div class="info-label">账号注册接口 (3-24位字符)</div>
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

  <!-- Modal: Create User -->
  <div id="modal-create-user" class="modal-backdrop" style="display: none;">
    <div class="modal-card">
      <div class="modal-title">新建系统账号</div>
      <div class="form-group">
        <label class="form-label">用户名</label>
        <input type="text" id="new-user-name" class="input-text" placeholder="3-24位英文字母/数字/下划线" />
        <span class="form-hint">仅允许英文字母、数字、下划线(_)和中划线(-)</span>
      </div>
      <div class="form-group">
        <label class="form-label">初始密码</label>
        <input type="password" id="new-user-pwd" class="input-text" placeholder="至少 6 位字符" />
      </div>
      <div class="form-group">
        <label class="form-label">账号角色</label>
        <select id="new-user-role" class="input-select">
          <option value="user">普通用户 (User)</option>
          <option value="admin">系统管理员 (Admin)</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeCreateModal()">取消</button>
        <button class="btn btn-primary" onclick="submitCreateUser()">确认创建</button>
      </div>
    </div>
  </div>

  <!-- Modal: Reset Password -->
  <div id="modal-reset-pwd" class="modal-backdrop" style="display: none;">
    <div class="modal-card">
      <div class="modal-title">重置用户密码</div>
      <div class="form-group">
        <label class="form-label">目标用户</label>
        <input type="text" id="reset-user-target" class="input-text" disabled />
        <input type="hidden" id="reset-user-id" />
      </div>
      <div class="form-group">
        <label class="form-label">新密码</label>
        <input type="password" id="reset-new-pwd" class="input-text" placeholder="输入新的密码 (至少 6 位)" />
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeResetModal()">取消</button>
        <button class="btn btn-primary" onclick="submitResetPassword()">确认修改</button>
      </div>
    </div>
  </div>

  <script>
    let adminToken = sessionStorage.getItem("loom_admin_token") || "";

    function formatUptime(seconds) {
      const d = Math.floor(seconds / (3600 * 24));
      const h = Math.floor((seconds % (3600 * 24)) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (d > 0) return d + "天 " + h + "时 " + m + "分";
      if (h > 0) return h + "时 " + m + "分 " + s + "秒";
      return m + "分 " + s + "秒";
    }

    // ---- Admin Functions ----

    function getAdminHeaders() {
      return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + adminToken,
        "x-admin-key": adminToken
      };
    }

    async function handleAdminLogin() {
      const key = document.getElementById("admin-key-input").value.trim();
      if (!key) {
        alert("请输入管理员密钥或密码");
        return;
      }

      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminKey: key })
        });
        const json = await res.json();
        if (!json.ok) {
          alert(json.error || "认证失败");
          return;
        }

        adminToken = json.data.adminToken;
        sessionStorage.setItem("loom_admin_token", adminToken);
        updateAdminView();
        loadUsers();
      } catch (e) {
        alert("连接服务器认证失败: " + e.message);
      }
    }

    function handleAdminLogout() {
      adminToken = "";
      sessionStorage.removeItem("loom_admin_token");
      updateAdminView();
    }

    function updateAdminView() {
      const isLogged = Boolean(adminToken);
      const badge = document.getElementById("admin-badge");
      const loginBox = document.getElementById("admin-login-box");
      const tableContainer = document.getElementById("admin-users-table-container");
      const topActions = document.getElementById("admin-top-actions");

      if (isLogged) {
        badge.className = "badge badge-role-admin";
        badge.innerText = "管理员已授权";
        loginBox.style.display = "none";
        tableContainer.style.display = "block";
        topActions.innerHTML =
          '<button class="btn btn-primary btn-sm" onclick="openCreateModal()">+ 新建账号</button>' +
          '<button class="btn btn-sm" onclick="loadUsers()">刷新列表</button>' +
          '<button class="btn btn-danger btn-sm" onclick="handleAdminLogout()">锁定退出</button>';
      } else {
        badge.className = "badge badge-secondary";
        badge.innerText = "未解锁管理员";
        loginBox.style.display = "flex";
        tableContainer.style.display = "none";
        topActions.innerHTML = "";
      }
    }

    async function loadUsers() {
      if (!adminToken) return;
      try {
        const res = await fetch("/api/admin/users", {
          headers: getAdminHeaders()
        });
        const json = await res.json();
        if (!json.ok) {
          if (res.status === 403 || res.status === 401) {
            handleAdminLogout();
            alert("管理员会话过期或无权访问，请重新认证");
            return;
          }
          alert(json.error || "获取用户列表失败");
          return;
        }

        const tbody = document.getElementById("users-tbody");
        const list = json.data || [];
        if (list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="empty-row">数据库暂无注册账号</td></tr>';
          return;
        }

        tbody.innerHTML = list.map(u => {
          const roleBadge = u.role === "admin"
            ? '<span class="badge badge-role-admin">管理员</span>'
            : '<span class="badge badge-secondary">普通用户</span>';

          const statusBadge = u.status === "active"
            ? '<span class="badge badge-success">正常使用</span>'
            : '<span class="badge badge-danger">已封禁</span>';

          const toggleStatusBtn = u.status === "active"
            ? '<button class="btn btn-danger btn-sm" onclick="toggleUserStatus(' + u.id + ', \'disabled\')">禁用</button>'
            : '<button class="btn btn-sm" onclick="toggleUserStatus(' + u.id + ', \'active\')">启用</button>';

          const resetPwdBtn = '<button class="btn btn-sm" onclick="openResetModal(' + u.id + ', \'' + u.username + '\')">重置密码</button>';
          const deleteBtn = '<button class="btn btn-danger btn-sm" onclick="deleteUserAccount(' + u.id + ', \'' + u.username + '\')">删除</button>';

          return '<tr>' +
            '<td>#' + u.id + '</td>' +
            '<td><strong>' + u.username + '</strong></td>' +
            '<td>' + roleBadge + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + new Date(u.createdAt).toLocaleString() + '</td>' +
            '<td>' + new Date(u.updatedAt).toLocaleString() + '</td>' +
            '<td><div class="action-group">' + resetPwdBtn + toggleStatusBtn + deleteBtn + '</div></td>' +
            '</tr>';
        }).join('');
      } catch (e) {
        console.error("加载用户列表失败:", e);
      }
    }

    function openCreateModal() {
      document.getElementById("new-user-name").value = "";
      document.getElementById("new-user-pwd").value = "";
      document.getElementById("modal-create-user").style.display = "flex";
    }

    function closeCreateModal() {
      document.getElementById("modal-create-user").style.display = "none";
    }

    async function submitCreateUser() {
      const username = document.getElementById("new-user-name").value.trim();
      const password = document.getElementById("new-user-pwd").value;
      const role = document.getElementById("new-user-role").value;

      if (!username || !password) {
        alert("请填写完整的用户名和密码");
        return;
      }

      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: getAdminHeaders(),
          body: JSON.stringify({ username, password, role })
        });
        const json = await res.json();
        if (!json.ok) {
          alert(json.error || "创建用户失败");
          return;
        }
        alert("账号 " + username + " 创建成功");
        closeCreateModal();
        loadUsers();
        fetchStatus();
      } catch (e) {
        alert("请求失败: " + e.message);
      }
    }

    function openResetModal(userId, username) {
      document.getElementById("reset-user-id").value = userId;
      document.getElementById("reset-user-target").value = username + " (ID: #" + userId + ")";
      document.getElementById("reset-new-pwd").value = "";
      document.getElementById("modal-reset-pwd").style.display = "flex";
    }

    function closeResetModal() {
      document.getElementById("modal-reset-pwd").style.display = "none";
    }

    async function submitResetPassword() {
      const userId = parseInt(document.getElementById("reset-user-id").value, 10);
      const password = document.getElementById("reset-new-pwd").value;
      if (!password || password.length < 6) {
        alert("新密码长度不能少于 6 位");
        return;
      }

      try {
        const res = await fetch("/api/admin/users/password", {
          method: "POST",
          headers: getAdminHeaders(),
          body: JSON.stringify({ userId, password })
        });
        const json = await res.json();
        if (!json.ok) {
          alert(json.error || "重置密码失败");
          return;
        }
        alert("密码已成功重置");
        closeResetModal();
        loadUsers();
      } catch (e) {
        alert("请求失败: " + e.message);
      }
    }

    async function toggleUserStatus(userId, targetStatus) {
      const actionName = targetStatus === "disabled" ? "封禁并断开连接" : "解除封禁";
      if (!confirm("确定要" + actionName + "该账号吗？")) return;

      try {
        const res = await fetch("/api/admin/users/status", {
          method: "POST",
          headers: getAdminHeaders(),
          body: JSON.stringify({ userId, status: targetStatus })
        });
        const json = await res.json();
        if (!json.ok) {
          alert(json.error || "更新状态失败");
          return;
        }
        loadUsers();
        fetchStatus();
      } catch (e) {
        alert("请求失败: " + e.message);
      }
    }

    async function deleteUserAccount(userId, username) {
      if (!confirm("警告: 确定要彻底删除账号 " + username + " 吗？此操作无法撤销！")) return;

      try {
        const res = await fetch("/api/admin/users?userId=" + userId, {
          method: "DELETE",
          headers: getAdminHeaders()
        });
        const json = await res.json();
        if (!json.ok) {
          alert(json.error || "删除失败");
          return;
        }
        alert("账号已删除");
        loadUsers();
        fetchStatus();
      } catch (e) {
        alert("请求失败: " + e.message);
      }
    }

    // ---- Status & Sessions ----

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

        // Codes Table (脱敏展示)
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

    // 初始化
    updateAdminView();
    if (adminToken) {
      loadUsers();
    }
    fetchStatus();
    setInterval(fetchStatus, 4000);
  </script>
</body>
</html>`;
}
