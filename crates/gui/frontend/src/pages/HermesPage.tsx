import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from "@tauri-apps/api/window";
import WindowControlButtons from '../components/WindowControlButtons';
import WorkspaceSelect from '../components/WorkspaceSelect';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Project } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

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
  const { t } = useI18n();

  // ─── Config state ───────────────────────────────────
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');

  // 默认/兜底的工作区路径：优先使用传入的 defaultProjectId，其次取项目列表首项
  const fallbackWorkspace =
    projects.find((p) => p.id === defaultProjectId)?.root_path ??
    (projects.length > 0 ? projects[0].root_path : '');
  const resolvedProject = projects.find(
    (p) => p.root_path === selectedWorkspace || p.id === selectedWorkspace
  );
  const activeWorkspace = resolvedProject?.root_path || selectedWorkspace || fallbackWorkspace;

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
          const matched = projects.find(
            (p) => p.root_path === cfg.default_project_id || p.id === cfg.default_project_id
          );
          setSelectedWorkspace(matched ? matched.root_path : cfg.default_project_id);
        } else if (defaultProjectId) {
          const matched = projects.find((p) => p.id === defaultProjectId);
          if (matched) {
            setSelectedWorkspace(matched.root_path);
          }
        }
      })
      .catch(() => {});
  }, [defaultProjectId, projects]);

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
    const proj = projects.find((p) => p.root_path === activeWorkspace || p.id === activeWorkspace);
    try {
      await saveHermesConfig({
        app_id: appId,
        app_secret: appSecret,
        default_project_id: proj?.id || activeWorkspace,
      });
      toast.success('配置已保存');
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    }
  }, [appId, appSecret, activeWorkspace, projects, toast]);

  const handleStart = useCallback(async () => {
    if (!appId || !appSecret) {
      toast.error('请先填写飞书 App ID 和 App Secret');
      return;
    }
    const proj = projects.find((p) => p.root_path === activeWorkspace || p.id === activeWorkspace);
    const projectPath = proj?.root_path || activeWorkspace;
    if (!projectPath) {
      toast.error('请选择一个工作区');
      return;
    }

    setStarting(true);
    setStatus((prev) => ({
      ...prev,
      state: 'connecting',
      error_message: undefined,
    }));

    try {
      // Save config before starting
      await saveHermesConfig({
        app_id: appId,
        app_secret: appSecret,
        default_project_id: proj?.id || projectPath,
      });
      await startHermesService(appId, appSecret, projectPath);
      toast.success('Hermes 服务已启动');
    } catch (err) {
      setStatus((prev) => ({
        ...prev,
        state: 'error',
        error_message: String(err),
      }));
      toast.error(`启动失败: ${err}`);
    } finally {
      setStarting(false);
    }
  }, [appId, appSecret, activeWorkspace, projects, toast]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopHermesService();
      setStatus((prev) => ({
        ...prev,
        state: 'stopped',
        error_message: undefined,
      }));
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
    <div className="hermes-page">
      {/* 顶部窗口拖拽栏：左侧为侧边栏折叠开关，右侧为窗口控制按钮（与远程连接页一致） */}
      <div className="remote-topbar" data-tauri-drag-region>
        <div className="remote-topbar-left">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="sidebar-toggle-mini-btn"
              title={isSidebarCollapsed ? t('proj.sidebar.expand') : t('proj.sidebar.collapse')}
              style={{ marginLeft: '0px', marginRight: '0px' }}
            >
              {isSidebarCollapsed ? "▶" : "◀"}
            </button>
          )}
        </div>
        <div className="remote-topbar-right">
          <WindowControlButtons />
        </div>
      </div>

      {/* 主体 */}
      <div className="hermes-body">
        {/* 标题区：左侧标题块 + 右侧状态徽章（与远程连接页同构） */}
        <div className="remote-title-row" data-tauri-drag-region>
          <div className="remote-header-text">
            <h1
              className="remote-title hermes-gradient-title"
              data-tauri-drag-region
              onMouseDown={(e) => {
                if (e.button === 0) {
                  getCurrentWindow().startDragging();
                }
              }}
            >
              Hermes
            </h1>
            <p className="remote-subtitle" data-tauri-drag-region>
              飞书机器人 Agent 桥接
            </p>
          </div>
          <div className="remote-header-badges">
            <span className={`badge ${meta.badge}`}>
              <span className={`dot ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="hermes-main">
          {/* 卡片 1: 凭证与工作区配置 */}
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">飞书应用凭证与工作区</h2>
                <p className="remote-card-desc">
                  配置飞书开放平台企业自建应用凭据与 mcode ACP 运行时的工作区目录。
                </p>
              </div>
            </div>

            <div className="remote-form-grid">
              <div className="remote-field">
                <label className="form-label">App ID</label>
                <input
                  type="text"
                  className="input"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  disabled={isRunning}
                  spellCheck={false}
                />
              </div>
              <div className="remote-field">
                <label className="form-label">App Secret</label>
                <div className="remote-inline">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    className="input"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    disabled={isRunning}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>
            </div>

            <div className="remote-field">
              <label className="form-label">工作区项目 (CWD)</label>
              <WorkspaceSelect
                projects={projects}
                value={activeWorkspace}
                onChange={setSelectedWorkspace}
                disabled={isRunning}
                placeholder={projects.length === 0 ? '暂无工作区项目' : '选择工作区项目'}
              />
              <span className="remote-hint">指定 mcode acp 子进程的工作目录</span>
            </div>

            <div className="remote-actions">
              <div className="remote-hint">
                {status.error_message && (
                  <span className="danger">{status.error_message}</span>
                )}
              </div>
              <div className="remote-actions-buttons">
                {!isRunning ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleSaveConfig}
                      disabled={isRunning}
                    >
                      仅保存配置
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleStart}
                      disabled={starting || !appId || !appSecret || !activeWorkspace}
                    >
                      {starting ? '启动中...' : '启动 Hermes 服务'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleStop}
                    disabled={stopping}
                  >
                    {stopping ? '停止中...' : '停止 Hermes 服务'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* 卡片 2: 消息日志 */}
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">消息日志</h2>
                <p className="remote-card-desc">
                  展示近期的飞书群聊及私聊交互消息与转发摘要。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  invoke('open_hermes_audit_dir').catch(() => {
                    toast.error('无法打开审计日志目录');
                  });
                }}
              >
                打开审计归档目录
              </button>
            </div>

            <div ref={logContainerRef} className="hermes-log-box">
              {status.log_entries.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
                  暂无消息记录
                </div>
              ) : (
                status.log_entries.map((entry, i) => (
                  <div key={i} className={`hermes-log-item ${entry.direction}`}>
                    <span className="hermes-log-time">{entry.timestamp}</span>
                    <span className={`hermes-log-dir ${entry.direction}`}>
                      {entry.direction === 'in' ? '← IN' : '→ OUT'}
                    </span>
                    <span className="hermes-log-sender">
                      [{entry.chat_type === 'group' ? '群' : '私'}] {entry.user_name}
                    </span>
                    <span className="hermes-log-summary">{entry.summary}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 右侧辅助栏：状态信息与操作指引（与远程连接页布局一致） */}
        <aside className="hermes-side">
          <section className="card remote-card">
            <div className="remote-card-head">
              <div className="remote-card-heading">
                <h2 className="remote-card-title">运行状态</h2>
              </div>
            </div>
            <ul className="remote-status-list">
              <li>
                <span className="remote-status-label">服务状态</span>
                <span className="remote-status-value">
                  <span className={`badge ${meta.badge}`}>
                    <span className={`dot ${meta.dot}`} />
                    {meta.label}
                  </span>
                </span>
              </li>
              <li>
                <span className="remote-status-label">连接时长</span>
                <span className="remote-status-value">
                  {status.connected_since && status.state === 'connected' ? status.connected_since : '--'}
                </span>
              </li>
              <li>
                <span className="remote-status-label">消息总数</span>
                <span className="remote-status-value">
                  {status.log_entries.length} 条
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
              <li>在飞书开放平台创建企业自建应用，开启机器人功能并获取 App ID / Secret。</li>
              <li>确保已授予机器人必要权限（如读取和发送消息），并选择对应的项目工作区。</li>
              <li>点击「启动 Hermes 服务」，随后可在飞书内与机器人直接对话，触发本地 ACP 任务。</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
