import React, { useState, useEffect, useRef, useCallback } from 'react';
import WindowControlButtons from '../components/WindowControlButtons';
import {
  getRelayStatus,
  setRelayUrl as apiSetRelayUrl,
  relayLogin,
  relayRegister,
  relayLogout,
  startAppServer,
  stopAppServer,
} from '../api';
import type { AppServerSessionInfo, Project } from '../types';
import { useToast } from '../ToastContext';

interface RemoteConnectionPageProps {
  projects: Project[];
  active?: boolean;
}

export const RemoteConnectionPage: React.FC<RemoteConnectionPageProps> = ({ projects, active = true }) => {
  const toast = useToast();
  const isMountedRef = useRef<boolean>(true);

  // Relay 配置与认证状态
  const [relayUrl, setRelayUrl] = useState<string>('ws://agent.ccxcc.cn:9099');
  const [editingRelayUrl, setEditingRelayUrl] = useState<string>('ws://agent.ccxcc.cn:9099');
  const [isSavingUrl, setIsSavingUrl] = useState<boolean>(false);

  // 账号输入
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // 会话状态
  const [session, setSession] = useState<AppServerSessionInfo | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const activeWorkspace = selectedWorkspace || (projects.length > 0 ? projects[0].root_path : '');

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
    if (!username.trim() || !password.trim()) {
      toast.error('请输入用户名和密码');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await relayRegister(relayUrl, username.trim(), password.trim());
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
      const res = await startAppServer(activeWorkspace);
      setSession(res);
      toast.success('远程会话已启动，配对码已就绪');
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '启动会话失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  // 停止远程会话
  const handleStopSession = async () => {
    if (!activeWorkspace) return;
    setActionLoading(true);
    try {
      const res = await stopAppServer(activeWorkspace);
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

  const isSessionRunning = session && session.status !== 'stopped';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* 顶部标题栏 */}
      <header
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
          minHeight: '48px',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'none' }}>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>远程连接</h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            自建中继手机端远程控制与配对管理
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <WindowControlButtons />
        </div>
      </header>

      {/* 主体滚动区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          maxWidth: '860px',
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {/* 卡片 1: 自建 Relay 服务器地址配置 */}
        <section
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>自建 Relay 中继服务器</h2>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
              }}
            >
              当前生效: {relayUrl}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            用于桌面端与移动端之间的 WebSocket 管道中继与账号认证，支持 ws:// 或 wss:// 协议。
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={editingRelayUrl}
              onChange={(e) => setEditingRelayUrl(e.target.value)}
              placeholder="ws://agent.ccxcc.cn:9099 或 wss://agent.ccxcc.cn"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-input, var(--bg-primary))',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
              }}
            />
            <button
              className="btn-secondary"
              onClick={handleSaveRelayUrl}
              disabled={isSavingUrl || editingRelayUrl.trim() === relayUrl}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              {isSavingUrl ? '保存中...' : '保存地址'}
            </button>
          </div>
        </section>

        {/* 卡片 2: 账号认证管理 */}
        <section
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>中继账号认证</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: session?.loggedIn ? 'var(--status-online, #22c55e)' : 'var(--text-tertiary)',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: session?.loggedIn ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {session?.loggedIn ? `已登录: ${session.username}` : '未登录'}
              </span>
            </div>
          </div>

          {!session?.loggedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                手机端与桌面端需使用相同的中继账号方可配对与中继连接。若无账号请直接点击「注册并登录」。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-input, var(--bg-primary))',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                  }}
                />
                <input
                  type="password"
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-input, var(--bg-primary))',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  onClick={handleRegister}
                  disabled={authLoading}
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  {authLoading ? '处理中...' : '注册并登录'}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleLogin}
                  disabled={authLoading}
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  {authLoading ? '登录中...' : '立即登录'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                当前账号已通过自建 Relay 鉴权，生成的配对码将绑定至该账号。
              </div>
              <button
                className="btn-secondary"
                onClick={handleLogout}
                style={{ padding: '6px 14px', fontSize: '0.85rem' }}
              >
                退出登录
              </button>
            </div>
          )}
        </section>

        {/* 卡片 3: 工作区绑定与核心启停 */}
        <section
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>远程工作区会话</h2>
            {/* 状态徽标 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor:
                    session?.status === 'connected'
                      ? 'var(--status-online, #22c55e)'
                      : session?.status === 'waiting_pairing'
                      ? '#3b82f6'
                      : session?.status === 'starting'
                      ? '#eab308'
                      : 'var(--text-tertiary)',
                }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {session?.status === 'connected'
                  ? '手机端已连接'
                  : session?.status === 'waiting_pairing'
                  ? '等待手机配对'
                  : session?.status === 'starting'
                  ? '正在启动'
                  : '服务已停止'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>目标工作区项目:</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <select
                value={activeWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                disabled={Boolean(isSessionRunning)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-input, var(--bg-primary))',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.root_path}>
                    {p.name} ({p.root_path})
                  </option>
                ))}
              </select>

              {!isSessionRunning ? (
                <button
                  className="btn-primary"
                  onClick={handleStartSession}
                  disabled={actionLoading || !session?.loggedIn || projects.length === 0}
                  style={{ padding: '8px 20px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                >
                  {actionLoading ? '启动中...' : '开启远程会话'}
                </button>
              ) : (
                <button
                  className="btn-danger"
                  onClick={handleStopSession}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    whiteSpace: 'nowrap',
                    backgroundColor: 'var(--status-offline, #ef4444)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                  }}
                >
                  {actionLoading ? '断开中...' : '断开连接并停止服务'}
                </button>
              )}
            </div>
          </div>

          {/* 配对码醒目展示区 */}
          {session?.status === 'waiting_pairing' && session.pairingCode && (
            <div
              style={{
                marginTop: '8px',
                padding: '24px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px dashed var(--accent-purple, #6366f1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                请在手机端打开 App，登录相同账号并输入下方 4 位配对码：
              </span>
              <div
                style={{
                  fontSize: '3.2rem',
                  fontWeight: 700,
                  letterSpacing: '12px',
                  fontFamily: 'monospace',
                  color: 'var(--accent-purple, #6366f1)',
                  paddingLeft: '12px',
                  userSelect: 'all',
                }}
              >
                {session.pairingCode}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '0.85rem', color: remainingSeconds < 30 ? '#ef4444' : 'var(--text-tertiary)' }}>
                  有效时间剩余: {Math.floor(remainingSeconds / 60)} 分 {remainingSeconds % 60} 秒
                </span>
                <button
                  className="btn-secondary"
                  onClick={() => handleCopyCode(session.pairingCode!)}
                  style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                >
                  {copied ? '已复制' : '复制配对码'}
                </button>
              </div>
            </div>
          )}

          {/* 已连接状态说明 */}
          {session?.status === 'connected' && (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--status-online, #22c55e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  手机端已建立双向管道
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  工作区子进程 PID: {session.pid ?? '活跃'} | 管道直通 mcode app-server --stdio
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--status-online, #22c55e)',
                  fontWeight: 600,
                }}
              >
                传输中
              </span>
            </div>
          )}
        </section>

        {/* 提示指南 */}
        <section
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-tertiary)',
            lineHeight: '1.6',
            padding: '0 8px',
          }}
        >
          <div>使用说明:</div>
          <div>1. 确保公网或本地自建 Relay 中继服务正在正常运行。</div>
          <div>2. 电脑端与手机端登录同一 Relay 账号。</div>
          <div>3. 点击「开启远程会话」，将生成的 4 位配对码输入手机端 App 即可建立端到端通信。</div>
          <div>4. 通信全程由中继透明转发，本地代码不落盘中继服务器，安全高效。</div>
        </section>
      </div>
    </div>
  );
};

export default RemoteConnectionPage;
