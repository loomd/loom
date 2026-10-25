import React, { useState, useEffect, useRef } from 'react';
import {
  getMcodeAuthStatus,
  getAppServerStatus,
  startAppServer,
  stopAppServer,
} from '../api';
import type { McodeAuthInfo, AppServerSessionInfo } from '../types';
import { useToast } from '../ToastContext';

interface Props {
  workspaceDir: string;
  active?: boolean;
}

export const RemoteSessionCard: React.FC<Props> = ({ workspaceDir, active = true }) => {
  const toast = useToast();
  const [auth, setAuth] = useState<McodeAuthInfo | null>(null);
  const [session, setSession] = useState<AppServerSessionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 初始加载和状态检查
  useEffect(() => {
    if (!active || !workspaceDir) return;
    let cancelled = false;
    Promise.all([
      getMcodeAuthStatus(),
      getAppServerStatus(workspaceDir),
    ])
      .then(([authRes, sessionRes]) => {
        if (!cancelled && isMountedRef.current) {
          setAuth(authRes);
          setSession(sessionRes);
        }
      })
      .catch((e: unknown) => {
        console.warn('Failed to refresh remote session state:', e);
      });

    return () => {
      cancelled = true;
    };
  }, [active, workspaceDir]);

  // 当处于等待配对时，自动轮询云端绑定状态
  useEffect(() => {
    if (!active || !workspaceDir || session?.status !== 'waiting_pairing') return;
    const interval = setInterval(async () => {
      try {
        const s = await getAppServerStatus(workspaceDir);
        if (isMountedRef.current) {
          setSession(s);
          if (s.status === 'connected') {
            toast.success(`手机端已连接${s.mobileDeviceName ? `: ${s.mobileDeviceName}` : ''}`);
          }
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [active, workspaceDir, session?.status, toast]);

  // 配对码过期倒计时定时刷新
  useEffect(() => {
    if (session?.status !== 'waiting_pairing' || !session.expiresAtMs) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.status, session?.expiresAtMs]);

  const handleStart = async () => {
    if (!workspaceDir || loading) return;
    setLoading(true);
    try {
      const res = await startAppServer(workspaceDir);
      if (isMountedRef.current) {
        setSession(res);
      }
      toast.success('官方配对码已获取，请在手机端输入配对码');
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '启动远程会话失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleStop = async () => {
    if (!workspaceDir || loading) return;
    setLoading(true);
    try {
      const res = await stopAppServer(workspaceDir);
      if (isMountedRef.current) {
        setSession(res);
      }
      toast.info('远程会话已断开');
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '断开远程会话失败');
      toast.error(msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleCopyCode = () => {
    if (!session?.pairingCode) return;
    const cleanDigits = session.pairingCode.replace(/\D/g, '');
    navigator.clipboard.writeText(cleanDigits);
    setCopied(true);
    toast.info('配对码已复制到剪贴板');
    setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  };

  const isRunning = session && session.status !== 'stopped';
  const isConnected = session?.status === 'connected';
  const isLoggedIn = auth?.isLoggedIn;
  const regionLabel = auth?.region === 'cn' ? '国内版 (cn)' : auth?.region === 'global' ? '海外版 (global)' : '未登录';
  const remainingSec = Math.max(0, Math.floor(((session?.expiresAtMs ?? 0) - now) / 1000));

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: 'var(--radius-sm, 6px)',
        border: '1px solid var(--border-subtle, #27272a)',
        backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.03))',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        <span>手机远程连接</span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: isLoggedIn ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isLoggedIn ? 'var(--text-success, #22c55e)' : 'var(--text-danger, #ef4444)',
          }}
        >
          {regionLabel}
        </span>
      </div>

      {!isRunning ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            启动官方远程会话后，可在手机 MiniMax Code App 中输入云端配对码直连此工作区。
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStart}
            disabled={loading || !isLoggedIn}
            style={{
              width: '100%',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isLoggedIn ? 'pointer' : 'not-allowed',
              opacity: isLoggedIn ? 1 : 0.6,
            }}
          >
            {loading ? '正在请求官方云端配对码...' : '开启手机远程会话'}
          </button>
          {!isLoggedIn && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-warning, #eab308)' }}>
              未检测到有效登录态，请先在终端运行 mcode login。
            </div>
          )}
        </div>
      ) : isConnected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm, 6px)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              fontSize: '0.8rem',
              color: 'var(--text-success, #22c55e)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--text-success, #22c55e)',
                display: 'inline-block',
              }}
            />
            <span>已连接手机: {session.mobileDeviceName || '移动端已配对'}</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleStop}
            disabled={loading}
            style={{
              width: '100%',
              padding: '4px 10px',
              fontSize: '0.75rem',
              color: 'var(--text-danger, #ef4444)',
              borderColor: 'rgba(239, 68, 68, 0.2)',
            }}
          >
            {loading ? '正在断开...' : '断开手机连接'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 8px',
              borderRadius: 'var(--radius-sm, 6px)',
              backgroundColor: 'var(--bg-active, rgba(99, 102, 241, 0.08))',
              border: '1px dashed var(--accent-purple, #6366f1)',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              MiniMax 官方 4 位配对码
              {remainingSec > 0 && ` (${formatCountdown(remainingSec)})`}
            </span>
            <span
              style={{
                fontSize: '1.7rem',
                fontWeight: 700,
                letterSpacing: '8px',
                color: 'var(--accent-purple, #6366f1)',
                fontFamily: 'monospace',
                userSelect: 'all',
              }}
            >
              {session.pairingCode || '----'}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCopyCode}
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                height: '22px',
                marginTop: '2px',
                color: copied ? 'var(--text-success, #22c55e)' : 'var(--text-secondary)',
              }}
            >
              {copied ? '已复制' : '复制配对码'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--text-success, #22c55e)',
                  display: 'inline-block',
                }}
              />
              等待手机输入配对码...
            </span>
            {session.pid && <span>PID: {session.pid}</span>}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleStop}
            disabled={loading}
            style={{
              width: '100%',
              padding: '4px 10px',
              fontSize: '0.75rem',
              color: 'var(--text-danger, #ef4444)',
              borderColor: 'rgba(239, 68, 68, 0.2)',
            }}
          >
            {loading ? '停止中...' : '取消并停止服务'}
          </button>
        </div>
      )}
    </div>
  );
};
