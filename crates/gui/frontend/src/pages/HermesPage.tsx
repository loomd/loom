import React, { useState, useEffect, useRef, useCallback } from 'react';
import WindowControlButtons from '../components/WindowControlButtons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Project } from '../types';
import { useToast } from '../ToastContext';

// ─── Types ──────────────────────────────────────────────

interface HermesConfig {
  app_id: string;
  app_secret: string;
  default_project_id: string;
  auto_start?: boolean;
}

interface HermesLogEntry {
  timestamp: string;
  direction: 'in' | 'out';
  user_name: string;
  chat_type: 'p2p' | 'group';
  summary: string;
}

interface HermesStatus {
  state: 'stopped' | 'connecting' | 'connected' | 'error';
  error_message?: string;
  log_entries: HermesLogEntry[];
  connected_since?: string;
}

// ─── Status styling ─────────────────────────────────────

type StatusTone = 'green' | 'blue' | 'amber' | 'gray' | 'red';

const STATUS_META: Record<string, { label: string; dot: string; badge: string; tone: StatusTone }> = {
  connected: { label: '已连接', dot: 'dot-green', badge: 'badge-emerald', tone: 'green' },
  connecting: { label: '连接中...', dot: 'dot-blue', badge: 'badge-blue', tone: 'blue' },
  error: { label: '连接错误', dot: 'dot-amber', badge: 'badge-amber', tone: 'red' },
  stopped: { label: '已停止', dot: 'dot-gray', badge: 'badge-gray', tone: 'gray' },
};

const getStatusMeta = (state?: string) => STATUS_META[state ?? 'stopped'] ?? STATUS_META.stopped;

// ─── API wrappers ───────────────────────────────────────

const getHermesConfig = (): Promise<HermesConfig> =>
  invoke('get_hermes_config');

const saveHermesConfig = (config: HermesConfig): Promise<void> =>
  invoke('save_hermes_config', { config });

const startHermesService = (appId: string, appSecret: string, projectPath: string): Promise<void> =>
  invoke('start_hermes_service', { appId, appSecret, projectPath });

const stopHermesService = (): Promise<void> =>
  invoke('stop_hermes_service');

const getHermesStatus = (): Promise<HermesStatus> =>
  invoke('get_hermes_status');

// ─── Component ──────────────────────────────────────────

interface HermesPageProps {
  projects: Project[];
  active?: boolean;
  defaultProjectId?: string;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export default function HermesPage({
  projects,
  active,
  defaultProjectId,
  isSidebarCollapsed,
  onToggleSidebar,
}: HermesPageProps) {
  const toast = useToast();

  // ─── Config state ───────────────────────────────────
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId ?? '');

  // ─── Service state ──────────────────────────────────
  const [status, setStatus] = useState<HermesStatus>({ state: 'stopped', log_entries: [] });
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Load config on mount
  useEffect(() => {
    getHermesConfig()
      .then((cfg) => {
        setAppId(cfg.app_id || '');
        setAppSecret(cfg.app_secret || '');
        if (cfg.default_project_id) {
          setSelectedProjectId(cfg.default_project_id);
        } else if (defaultProjectId) {
          setSelectedProjectId(defaultProjectId);
        }
      })
      .catch(() => {});
  }, [defaultProjectId]);

  // Poll status while active
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      getHermesStatus()
        .then((s) => { if (!cancelled) setStatus(s); })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [active]);

  // Listen for real-time status events from backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<HermesStatus>('hermes-status-update', (e) => {
      setStatus(e.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [status.log_entries]);

  // ─── Handlers ───────────────────────────────────────

  const handleSaveConfig = useCallback(async () => {
    try {
      await saveHermesConfig({
        app_id: appId,
        app_secret: appSecret,
        default_project_id: selectedProjectId,
      });
      toast.success('配置已保存');
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    }
  }, [appId, appSecret, selectedProjectId, toast]);

  const handleStart = useCallback(async () => {
    if (!appId || !appSecret) {
      toast.error('请先填写飞书 App ID 和 App Secret');
      return;
    }
    const proj = projects.find((p) => p.id === selectedProjectId);
    if (!proj) {
      toast.error('请选择一个工作区');
      return;
    }

    setStarting(true);
    try {
      // Save config before starting
      await saveHermesConfig({
        app_id: appId,
        app_secret: appSecret,
        default_project_id: selectedProjectId,
      });
      await startHermesService(appId, appSecret, proj.root_path);
      toast.success('Hermes 服务已启动');
    } catch (err) {
      toast.error(`启动失败: ${err}`);
    } finally {
      setStarting(false);
    }
  }, [appId, appSecret, selectedProjectId, projects, toast]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopHermesService();
      toast.success('Hermes 服务已停止');
    } catch (err) {
      toast.error(`停止失败: ${err}`);
    } finally {
      setStopping(false);
    }
  }, [toast]);

  const isRunning = status.state === 'connecting' || status.state === 'connected';
  const meta = getStatusMeta(status.state);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Title bar */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onToggleSidebar && (
            <button
              className="nav-item"
              onClick={onToggleSidebar}
              style={{
                padding: '4px 6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {isSidebarCollapsed ? '\u25b6' : '\u25c0'}
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Hermes
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            飞书机器人 Agent 桥接
          </span>
        </div>
        <WindowControlButtons />
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: meta.tone === 'green' ? '#10b981'
              : meta.tone === 'blue' ? '#3b82f6'
              : meta.tone === 'red' ? '#ef4444'
              : meta.tone === 'amber' ? '#f59e0b'
              : '#6b7280',
            boxShadow: meta.tone === 'green' ? '0 0 6px rgba(16, 185, 129, 0.5)'
              : meta.tone === 'blue' ? '0 0 6px rgba(59, 130, 246, 0.5)'
              : 'none',
          }} />
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {meta.label}
          </span>
          {status.error_message && (
            <span style={{ fontSize: '0.8rem', color: '#ef4444', marginLeft: '8px' }}>
              {status.error_message}
            </span>
          )}
          {status.connected_since && status.state === 'connected' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
              {status.connected_since}
            </span>
          )}
        </div>

        {/* Config section */}
        <div style={{
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            飞书应用凭证
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>App ID</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="cli_xxxxxxxxxxxxxxxx"
              disabled={isRunning}
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>App Secret</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled={isRunning}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {showSecret ? '隐藏' : '显示'}
              </button>
            </div>
          </div>
        </div>

        {/* Workspace selection */}
        <div style={{
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            工作区
          </h3>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={isRunning}
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="">选择工作区...</option>
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name} - {proj.root_path}
              </option>
            ))}
          </select>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            指定 mcode acp 子进程的工作目录 (cwd)
          </p>
        </div>

        {/* Start/Stop buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {!isRunning ? (
            <>
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={starting || !appId || !appSecret || !selectedProjectId}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: starting ? 'wait' : 'pointer',
                  opacity: (starting || !appId || !appSecret || !selectedProjectId) ? 0.5 : 1,
                }}
              >
                {starting ? '启动中...' : '启动 Hermes 服务'}
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={isRunning}
                style={{
                  padding: '10px 16px',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                仅保存配置
              </button>
            </>
          ) : (
            <button
              onClick={handleStop}
              disabled={stopping}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: stopping ? 'wait' : 'pointer',
                opacity: stopping ? 0.5 : 1,
              }}
            >
              {stopping ? '停止中...' : '停止 Hermes 服务'}
            </button>
          )}
        </div>

        {/* Message log */}
        <div style={{
          padding: '16px',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
          minHeight: '160px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              消息日志
            </h3>
            <button
              onClick={() => {
                invoke('open_hermes_audit_dir').catch(() => {
                  toast.error('无法打开审计日志目录');
                });
              }}
              style={{
                fontSize: '0.75rem',
                padding: '3px 8px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              打开审计归档目录
            </button>
          </div>
          <div
            ref={logContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              scrollbarWidth: 'thin',
            }}
          >
            {status.log_entries.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)', padding: '16px 0', textAlign: 'center', fontStyle: 'italic' }}>
                暂无消息记录
              </div>
            ) : (
              status.log_entries.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'baseline',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: entry.direction === 'in'
                      ? 'rgba(59, 130, 246, 0.05)'
                      : 'rgba(16, 185, 129, 0.05)',
                  }}
                >
                  <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, fontSize: '0.7rem' }}>
                    {entry.timestamp}
                  </span>
                  <span style={{
                    flexShrink: 0,
                    fontWeight: 600,
                    color: entry.direction === 'in' ? '#3b82f6' : '#10b981',
                    fontSize: '0.7rem',
                  }}>
                    {entry.direction === 'in' ? '\u2190 IN' : '\u2192 OUT'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    [{entry.chat_type === 'group' ? '\u7fa4' : '\u79c1'}] {entry.user_name}
                  </span>
                  <span style={{
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.summary}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
