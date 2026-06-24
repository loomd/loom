import React, { useState, useEffect, useRef, useCallback } from 'react';
import { killCliInstance } from '../api';
import type { RunningInstance } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface Props {
  instances: RunningInstance[];
  onInstancesChange: (updater: (prev: RunningInstance[]) => RunningInstance[]) => void;
}

export default function InstancesPage({ instances, onInstancesChange }: Props) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();



  // Auto-scroll terminal
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [instances.find(i => i.instance_id === selectedId)?.logs.length]);

  const handleKill = async (instanceId: string) => {
    if (!confirm(t('inst.confirm.terminate'))) return;
    try {
      await killCliInstance(instanceId);
      toast.success(t('inst.toast.terminated'));
    } catch (e: any) {
      toast.error(e?.toString() ?? t('inst.toast.terminateFailed'));
    }
  };

  const handleDismiss = (instanceId: string) => {
    onInstancesChange(prev => prev.filter(i => i.instance_id !== instanceId));
    if (selectedId === instanceId) setSelectedId(null);
  };

  const selected = instances.find(i => i.instance_id === selectedId);

  const getStatusColor = (status: string) => {
    if (status === 'running') return 'var(--accent-emerald)';
    if (status === 'failed') return 'var(--accent-red)';
    return 'var(--text-tertiary)';
  };

  const formatDuration = (start: Date) => {
    const sec = Math.floor((Date.now() - start.getTime()) / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('inst.title')}</div>
          <div className="page-subtitle">
            {instances.filter(i => i.status === 'running').length} {t('inst.status.running')} ·{' '}
            {instances.length} {t('nav.stats.running').toLowerCase()}
          </div>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="empty-state">
            <div className="empty-state-icon">💤</div>
            <div className="empty-state-title">{t('inst.empty.title')}</div>
            <div className="empty-state-desc">{t('inst.empty.desc')}</div>
          </div>
        </div>
      ) : (
        <div className="split-layout" style={{ flex: 1, overflow: 'hidden' }}>
          {/* Left: Instance list */}
          <div className="split-left">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
              {t('inst.table.template')}
            </div>
            {instances.map(inst => (
              <div
                key={inst.instance_id}
                className={`tool-row${selectedId === inst.instance_id ? ' selected' : ''}`}
                onClick={() => setSelectedId(inst.instance_id)}
                style={{ gridTemplateColumns: '1fr auto', cursor: 'pointer' }}
              >
                <div className="tool-info">
                  <div className="flex items-center gap-2">
                    <div
                      className={`dot${inst.status === 'running' ? ' dot-green' : inst.status === 'failed' ? ' dot-red' : ' dot-gray'}`}
                      style={inst.status !== 'running' ? { animation: 'none' } : {}}
                    />
                    <span className="tool-name">{inst.template.name}</span>
                  </div>
                  <div className="tool-path">{inst.tool.name} · {formatDuration(inst.started_at)}</div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {inst.status === 'running' && (
                    <button
                      className="btn-icon"
                      title="Kill"
                      onClick={() => handleKill(inst.instance_id)}
                      style={{ color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', width: 26, height: 26, fontSize: 11 }}
                    >■</button>
                  )}
                  {inst.status !== 'running' && (
                    <button
                      className="btn-icon"
                      title="Dismiss"
                      onClick={() => handleDismiss(inst.instance_id)}
                      style={{ width: 26, height: 26, fontSize: 11 }}
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right: Log terminal */}
          <div className="split-right">
            {!selected ? (
              <div className="empty-state" style={{ height: '100%' }}>
                <div className="empty-state-icon">🖥️</div>
                <div className="empty-state-title">{t('inst.terminal.title')}</div>
                <div className="empty-state-desc">{t('inst.desc')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
                {/* Instance info */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`dot${selected.status === 'running' ? ' dot-green' : selected.status === 'failed' ? ' dot-red' : ' dot-gray'}`}
                        style={selected.status !== 'running' ? { animation: 'none' } : {}}
                      />
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {selected.template.name}
                      </span>
                      <span className="badge" style={{ background: `${getStatusColor(selected.status)}18`, color: getStatusColor(selected.status), border: `1px solid ${getStatusColor(selected.status)}30`, fontSize: 10 }}>
                        {t(`inst.status.${selected.status}`)}
                        {selected.exit_code !== undefined && ` (${t('inst.exitCode', { code: selected.exit_code })})`}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'monospace' }}>
                      {selected.tool.path}
                      {selected.template.args.length > 0 && <span style={{ color: 'var(--accent-emerald)' }}> {selected.template.args.join(' ')}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost"
                      onClick={() => onInstancesChange(prev => prev.map(i => i.instance_id === selected.instance_id ? { ...i, logs: [] } : i))}
                      style={{ fontSize: 11 }}
                    >
                      {t('inst.terminal.clear')}
                    </button>
                    {selected.status === 'running' && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleKill(selected.instance_id)}
                        style={{ fontSize: 11 }}
                      >
                        ■ {t('inst.btn.terminate')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Terminal */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div className="terminal-header">
                    <div className="terminal-dots">
                      <div className="terminal-dot" style={{ background: '#ef4444' }} />
                      <div className="terminal-dot" style={{ background: '#f59e0b' }} />
                      <div className="terminal-dot" style={{ background: '#10b981' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                      {selected.instance_id.slice(0, 12)}… · {selected.logs.length} lines
                    </span>
                  </div>
                  <div className="log-terminal" style={{ flex: 1, height: 'auto', minHeight: 0 }}>
                    {selected.logs.length === 0 ? (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontStyle: 'italic' }}>
                        {selected.status === 'running' ? 'Waiting for output…' : t('inst.terminal.noLogs')}
                      </span>
                    ) : (
                      selected.logs.map((log, i) => (
                        <span key={i} className={`terminal-line ${log.stream}`}>
                          {log.stream === 'stderr' && <span style={{ color: '#f87171', marginRight: 4 }}>[err]</span>}
                          {log.chunk}
                        </span>
                      ))
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
