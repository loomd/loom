import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from "@tauri-apps/api/window";
import WindowControlButtons from '../components/WindowControlButtons';
import WorkspaceSelect from '../components/WorkspaceSelect';
import {
  getRelayStatus,
  setRelayUrl as apiSetRelayUrl,
  relayLogin,
  relayRegister,
  relayLogout,
  startRemoteSession,
  stopRemoteSession,
  unbindMobile,
} from '../api';
import type { RemoteSessionInfo, Project } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface RemoteConnectionPageProps {
  projects: Project[];
  active?: boolean;
  /** 当前工作区项目，作为远程会话工作区的默认选项 */
  defaultProjectId?: string;
  /** 左侧固定面板是否处于折叠状态（与项目区共用同一状态） */
  isSidebarCollapsed?: boolean;
  /** 点击左上角按钮切换左侧固定面板的折叠 / 展开 */
  onToggleSidebar?: () => void;
}

type StatusTone = 'green' | 'blue' | 'amber' | 'gray';

const SESSION_STATUS: Record<string, { label: string; dot: string; badge: string; tone: StatusTone }> = {
  connected: { label: '手机端已连接', dot: 'dot-green', badge: 'badge-emerald', tone: 'green' },
  waiting_pairing: { label: '配对中', dot: 'dot-blue', badge: 'badge-blue', tone: 'blue' },
  waiting_mobile: { label: '等待手机端', dot: 'dot-amber', badge: 'badge-amber', tone: 'amber' },
  connecting: { label: '重连中', dot: 'dot-amber', badge: 'badge-amber', tone: 'amber' },
  starting: { label: '正在启动', dot: 'dot-amber', badge: 'badge-amber', tone: 'amber' },
  stopped: { label: '已停止', dot: 'dot-gray', badge: 'badge-gray', tone: 'gray' },
};

const getStatusMeta = (status?: string) => SESSION_STATUS[status ?? 'stopped'] ?? SESSION_STATUS.stopped;

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const RemoteConnectionPage: React.FC<RemoteConnectionPageProps> = ({
  projects,
  active = true,
  defaultProjectId,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const toast = useToast();
  const { t } = useI18n();
  const isMountedRef = useRef<boolean>(true);

  // Relay 配置与认证状态
  const [relayUrl, setRelayUrl] = useState<string>('wss://agent.ccxcc.cn');
  const [editingRelayUrl, setEditingRelayUrl] = useState<string>('wss://agent.ccxcc.cn');
  const [isSavingUrl, setIsSavingUrl] = useState<boolean>(false);

  // 账号输入
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // 会话状态
  const [session, setSession] = useState<RemoteSessionInfo | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const isSessionRunning = Boolean(session && session.status !== 'stopped');
  // 运行中的会话以后端记录为准，避免下拉框与实际会话错位
  const runningWorkspace = isSessionRunning ? (session?.workspaceDir ?? '') : '';
  const fallbackWorkspace =
    projects.find((p) => p.id === defaultProjectId)?.root_path ??
    (projects.length > 0 ? projects[0].root_path : '');
  const activeWorkspace = runningWorkspace || selectedWorkspace || fallbackWorkspace;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 刷新会话与登录状态
  const refreshStatus = useCallback(async () => {
    try {
      const res = await getRelayStatus();
      if (isMountedRef.current) {
        setSession(res);
        if (res.relayUrl) {
          setRelayUrl(res.relayUrl);
          setEditingRelayUrl(res.relayUrl);
        }
        if (res.workspaceDir) {
          setSelectedWorkspace(res.workspaceDir);
        }
      }
    } catch (e) {
      console.warn('获取中继与会话状态失败:', e);
    }
  }, []);

  // 初始加载与激活时刷新
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getRelayStatus()
      .then((res) => {
        if (!cancelled && isMountedRef.current) {
          setSession(res);
          if (res.relayUrl) {
            setRelayUrl(res.relayUrl);
            setEditingRelayUrl(res.relayUrl);
          }
          if (res.workspaceDir) {
            setSelectedWorkspace(res.workspaceDir);
          }
        }
      })
      .catch((e) => {
        console.warn('获取中继与会话状态失败:', e);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  // 轮询会话状态（当处于运行/等待配对/已连接中）
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      refreshStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [active, refreshStatus]);

  // 配对码倒计时定时器
  useEffect(() => {
    if (session?.status !== 'waiting_pairing' || !session.expiresAtMs) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.status, session?.expiresAtMs]);

  // 保存 Relay 服务器地址
  const handleSaveRelayUrl = async () => {
    const trimmed = editingRelayUrl.trim();
    if (!trimmed) {
      toast.error('中继服务器地址不能为空');
      return;
    }
    setIsSavingUrl(true);
    try {
      await apiSetRelayUrl(trimmed);
      setRelayUrl(trimmed);
      toast.success('中继服务器地址已更新');
      await refreshStatus();
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '更新地址失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setIsSavingUrl(false);
    }
  };

  // 登录
  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('请输入用户名和密码');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await relayLogin(relayUrl, username.trim(), password.trim());
      toast.success(`登录成功，欢迎 ${res.username}`);
      setPassword('');
      await refreshStatus();
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '登录失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setAuthLoading(false);
    }
  };

  // 注册
  const handleRegister = async () => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      toast.error('请输入用户名和密码');
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 24) {
      toast.error('用户名长度必须在 3 到 24 个字符之间');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      toast.error('用户名仅支持英文字母、数字、下划线和连字符');
      return;
    }
    if (password.length < 6) {
      toast.error('密码长度不能少于 6 位');
      return;
    }
    if (password.length > 64) {
      toast.error('密码长度不能超过 64 位');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await relayRegister(relayUrl, trimmed, password);
      toast.success(`注册成功并已自动登录: ${res.username}`);
      setPassword('');
      await refreshStatus();
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '注册失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setAuthLoading(false);
    }
  };

  // 退出登录
  const handleLogout = async () => {
    try {
      await relayLogout();
      toast.success('已退出登录并停止当前远程会话');
      await refreshStatus();
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '退出失败');
      toast.error(msg);
    }
  };

  // 开启远程会话
  const handleStartSession = async () => {
    if (!activeWorkspace) {
      toast.error('请先选择一个工作区项目');
      return;
    }
    if (!session?.loggedIn) {
      toast.error('请先登录自建中继账号');
      return;
    }
    setActionLoading(true);
    try {
      const res = await startRemoteSession(activeWorkspace);
      setSession(res);
      toast.success(
        res.pairingCode
          ? '远程会话已启动，配对码已就绪'
          : '远程会话已启动，等待已绑定的手机端连接',
      );
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '启动会话失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  // 强制解绑手机端：解绑后手机端需要重新输入配对码
  const handleUnbindMobile = async () => {
    setActionLoading(true);
    try {
      await unbindMobile();
      toast.success('已解除手机端绑定，手机端需重新输入配对码');
      await refreshStatus();
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '解除绑定失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  // 停止远程会话
  const handleStopSession = async () => {
    const target = session?.workspaceDir || activeWorkspace;
    if (!target) return;
    setActionLoading(true);
    try {
      const res = await stopRemoteSession(target);
      setSession(res);
      toast.success('远程会话已安全终止');
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '终止会话失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  // 复制配对码
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('配对码已复制到剪贴板');
      setTimeout(() => {
        if (isMountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      toast.error('复制失败，请手动记录');
    }
  };

  // 倒计时计算
  const remainingSeconds = session?.expiresAtMs
    ? Math.max(0, Math.floor((session.expiresAtMs * (session.expiresAtMs < 10000000000 ? 1000 : 1) - now) / 1000))
    : 0;

  const statusMeta = getStatusMeta(session?.status);
  const loggedIn = Boolean(session?.loggedIn);
  const relayHost = (() => {
    try {
      return new URL(relayUrl).host || relayUrl;
    } catch {
      return relayUrl;
    }
  })();

  return (
    <div className="remote-page">
      {/* 顶部窗口拖拽栏：左侧为侧边栏折叠开关，右侧为窗口控制按钮（与「配置引导」页一致） */}
      <div className="remote-topbar" data-tauri-drag-region>
        <div className="remote-topbar-left">
          {onToggleSidebar && (
            <button onClick={onToggleSidebar} className="sidebar-toggle-mini-btn"
              title={isSidebarCollapsed ? t('proj.sidebar.expand') : t('proj.sidebar.collapse')}
              style={{ marginLeft: '0px', marginRight: '0px' }}>
              {isSidebarCollapsed ? "▶" : "◀"}
            </button>
          )}
        </div>
        <div className="remote-topbar-right">
          <WindowControlButtons />
        </div>
      </div>

      {/* 主体 */}
      <div className="remote-body">
        {/* 标题区：左侧标题块 + 右侧状态徽章（与「配置引导」页同构） */}
        <div className="remote-title-row" data-tauri-drag-region>
          <div className="remote-header-text">
            <h1
              className="remote-title"
              data-tauri-drag-region
              onMouseDown={(e) => {
                if (e.button === 0) {
                  getCurrentWindow().startDragging();
                }
              }}
            >远程连接</h1>
            <p className="remote-subtitle" data-tauri-drag-region>自建中继手机端远程控制与配对管理</p>
          </div>
          <div className="remote-header-badges">
            <span className={`badge ${loggedIn ? 'badge-emerald' : 'badge-gray'}`}>
              <span className={`dot ${loggedIn ? 'dot-green' : 'dot-gray'}`} />
              {loggedIn ? `已登录 ${session?.username ?? ''}`.trim() : '未登录'}
            </span>
            <span className={`badge ${statusMeta.badge}`}>
              <span className={`dot ${statusMeta.dot}`} />
              {statusMeta.label}
            </span>
          </div>
        </div>
        <div className="remote-main">
          {/* 卡片 1: 自建 Relay 服务器地址配置 */}
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">自建 Relay 中继服务器</h2>
                <p className="remote-card-desc">
                  用于桌面端与移动端之间的 WebSocket 管道中继与账号认证，支持 ws:// 或 wss:// 协议。
                </p>
              </div>
              <span className="badge badge-gray remote-mono" title="当前生效的中继地址">
                {relayHost}
              </span>
            </div>
            <div className="remote-inline">
              <input
                type="text"
                className="input"
                value={editingRelayUrl}
                onChange={(e) => setEditingRelayUrl(e.target.value)}
                placeholder="wss://agent.ccxcc.cn 或 ws://127.0.0.1:9099"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleSaveRelayUrl}
                disabled={isSavingUrl || editingRelayUrl.trim() === relayUrl}
              >
                {isSavingUrl ? '保存中...' : '保存地址'}
              </button>
            </div>
          </section>

          {/* 卡片 2: 账号认证管理 */}
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">中继账号认证</h2>
                <p className="remote-card-desc">手机端与桌面端需使用相同的中继账号方可配对与中继连接。</p>
              </div>
              <span className={`badge ${loggedIn ? 'badge-emerald' : 'badge-gray'}`}>
                <span className={`dot ${loggedIn ? 'dot-green' : 'dot-gray'}`} />
                {loggedIn ? '已登录' : '未登录'}
              </span>
            </div>

            {!loggedIn ? (
              <>
                <div className="remote-form-grid">
                  <input
                    type="text"
                    className="input"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    className="input"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="remote-actions">
                  <span className="remote-hint">若无账号，请先注册并自动登录。</span>
                  <div className="remote-actions-buttons">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleRegister}
                      disabled={authLoading}
                    >
                      {authLoading ? '处理中...' : '注册并登录'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleLogin}
                      disabled={authLoading}
                    >
                      {authLoading ? '登录中...' : '立即登录'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="remote-account">
                <div className="remote-account-avatar" aria-hidden="true">
                  {(session?.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="remote-account-info">
                  <div className="remote-account-name">{session?.username}</div>
                  <div className="remote-account-meta">已通过自建 Relay 鉴权，生成的配对码将绑定至该账号。</div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                  退出登录
                </button>
              </div>
            )}
          </section>

          {/* 卡片 3: 远程工作区会话 */}
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">远程工作区会话</h2>
                <p className="remote-card-desc">选择工作区后开启远程会话，手机端输入配对码即可直连该工作区。</p>
              </div>
              <span className={`badge ${statusMeta.badge}`}>
                <span className={`dot ${statusMeta.dot}`} />
                {statusMeta.label}
              </span>
            </div>

            <div className="remote-field">
              <label className="form-label">目标工作区项目</label>
              <WorkspaceSelect
                projects={projects}
                value={activeWorkspace}
                onChange={setSelectedWorkspace}
                disabled={isSessionRunning}
                placeholder={projects.length === 0 ? '暂无工作区项目' : '选择工作区项目'}
              />
            </div>

            {projects.length === 0 && (
              <div className="remote-hint remote-hint-block">请先在左侧创建工作区项目，再开启远程会话。</div>
            )}

            <div className="remote-actions">
              <span className="remote-hint">
                {isSessionRunning
                  ? `会话工作区：${runningWorkspace || '未知'}${session?.mobilePaired ? ' · 手机端已绑定，等待其自动重连' : ''}`
                  : '开启后会在下方生成 4 位配对码，有效期内可重复配对。'}
              </span>
              <div className="remote-actions-buttons">
                {session?.mobilePaired && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleUnbindMobile}
                    disabled={actionLoading}
                    title="解除账号与手机端的绑定关系，解绑后手机端需要重新输入配对码"
                  >
                    {actionLoading ? '处理中...' : '解绑手机端'}
                  </button>
                )}
                {!isSessionRunning ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleStartSession}
                    disabled={actionLoading || !loggedIn || projects.length === 0}
                  >
                    {actionLoading ? '启动中...' : '开启远程会话'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger" onClick={handleStopSession} disabled={actionLoading}>
                    {actionLoading ? '断开中...' : '断开连接并停止服务'}
                  </button>
                )}
              </div>
            </div>

            {/* 配对码醒目展示区 */}
            {session?.status === 'waiting_pairing' && session.pairingCode && (
              <div className="remote-pairing">
                <span className="remote-pairing-hint">
                  请在手机端打开 App，登录相同账号并输入下方 4 位配对码：
                </span>
                <div
                  className="remote-pairing-code"
                  onClick={() => handleCopyCode(session.pairingCode!)}
                  title="点击复制"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCopyCode(session.pairingCode!);
                    }
                  }}
                >
                  {session.pairingCode}
                </div>
                <div className="remote-pairing-meta">
                  <span className={remainingSeconds < 30 ? 'danger' : undefined}>
                    有效时间剩余: {formatCountdown(remainingSeconds)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleCopyCode(session.pairingCode!)}
                  >
                    {copied ? '已复制' : '复制配对码'}
                  </button>
                </div>
              </div>
            )}

            {/* 已绑定但手机端离线：绑定关系已持久化，等待手机端自动重连 */}
            {(session?.status === 'waiting_mobile' || session?.status === 'connecting') && (
              <div className="remote-connected">
                <div className="remote-connected-info">
                  <div className="remote-connected-title">
                    {session.status === 'connecting'
                      ? '桌面端正在重新连接中继服务器'
                      : '手机端已绑定，等待其自动重连'}
                  </div>
                  <div className="remote-connected-meta">
                    {session.status === 'connecting'
                      ? '网络恢复后会自动重连，无需重新输入配对码。'
                      : '绑定关系已保存在中继账号中，手机端离线或切换网络后会自动重新连接，无需再次输入配对码。'}
                  </div>
                </div>
                <span className="badge badge-amber">等待中</span>
              </div>
            )}

            {/* 已连接状态说明 */}
            {session?.status === 'connected' && (
              <div className="remote-connected">
                <div className="remote-connected-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div className="remote-connected-info">
                  <div className="remote-connected-title">手机端已建立双向管道</div>
                  <div className="remote-connected-meta">
                    {session.mobileDeviceName ? `已配对设备：${session.mobileDeviceName} · ` : ''}
                    工作区子进程 PID: {session.pid ?? '活跃'} | ACP 通道 mcode acp
                  </div>
                </div>
                <span className="badge badge-emerald">传输中</span>
              </div>
            )}
          </section>
        </div>

        {/* 侧栏: 状态总览与使用说明 */}
        <aside className="remote-side">
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">连接状态</h2>
              </div>
            </div>
            <ul className="remote-status-list">
              <li>
                <span className="dot dot-green" />
                <span className="remote-status-label">中继服务器</span>
                <span className="remote-status-value" title={relayUrl}>
                  {relayHost}
                </span>
              </li>
              <li>
                <span className={`dot ${loggedIn ? 'dot-green' : 'dot-gray'}`} />
                <span className="remote-status-label">账号认证</span>
                <span className="remote-status-value">{loggedIn ? session?.username : '未登录'}</span>
              </li>
              <li>
                <span className={`dot ${statusMeta.dot}`} />
                <span className="remote-status-label">远程会话</span>
                <span className="remote-status-value">{statusMeta.label}</span>
              </li>
              <li>
                <span className={`dot ${session?.status === 'connected' ? 'dot-green' : session?.mobilePaired ? 'dot-amber' : 'dot-gray'}`} />
                <span className="remote-status-label">手机端</span>
                <span className="remote-status-value">
                  {session?.status === 'connected'
                    ? session.mobileDeviceName || '已配对'
                    : session?.mobilePaired
                      ? '已绑定（离线）'
                      : '未连接'}
                </span>
              </li>
              <li>
                <span className={`dot ${activeWorkspace ? 'dot-green' : 'dot-gray'}`} />
                <span className="remote-status-label">目标工作区</span>
                <span className="remote-status-value" title={activeWorkspace}>
                  {activeWorkspace
                    ? projects.find((p) => p.root_path === activeWorkspace)?.name || activeWorkspace
                    : '未选择'}
                </span>
              </li>
            </ul>
          </section>

          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">使用说明</h2>
              </div>
            </div>
            <ol className="remote-guide">
              <li>确保公网或本地自建 Relay 中继服务正在正常运行。</li>
              <li>电脑端与手机端登录同一 Relay 账号。</li>
              <li>首次配对：点击「开启远程会话」，将生成的 4 位配对码输入手机端 App。</li>
              <li>绑定只做一次：此后手机端启动或断线重连都会自动建联，不再需要配对码。</li>
              <li>需要换手机时点击「解绑手机端」，再重新输入新的配对码即可。</li>
              <li>通信全程由中继透明转发，本地代码不落盘中继服务器，安全高效。</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default RemoteConnectionPage;
