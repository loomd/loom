import React, { useState, useEffect } from 'react';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  runCliTemplate,
  getGlobalEnvVars
} from '../api';
import type { CliTool, Template, GlobalEnvVar } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';
import { mergeCliArgs } from '../utils';

interface Props {
  tools: CliTool[];
  onInstanceLaunched: (instanceId: string, template: Template, tool: CliTool) => void;
}

export function TemplateModal({
  tools, template, defaultCliId, onClose, onSave,
}: {
  tools: CliTool[];
  template?: Template;
  defaultCliId?: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'general' | 'env'>('general');
  const [cliId, setCliId] = useState(template?.cli_id ?? defaultCliId ?? (tools[0]?.id ?? ''));
  const [name, setName] = useState(template?.name ?? '');
  const [argsStr, setArgsStr] = useState(template?.args.join(' ') ?? '');
  const [pwd, setPwd] = useState(template?.pwd ?? '');
  const [cmdOverride, setCmdOverride] = useState(template?.cmd_override ?? '');
  const [envMode, setEnvMode] = useState<'inherit' | 'isolated'>(template?.env_mode ?? 'inherit');
  const [globalVars, setGlobalVars] = useState<GlobalEnvVar[]>([]);
  const [selectedGlobalVarIds, setSelectedGlobalVarIds] = useState<string[]>(template?.env_var_ids ?? []);
  const [envPairs, setEnvPairs] = useState<{ k: string; v: string }[]>(
    Object.entries(template?.env ?? {}).map(([k, v]) => ({ k, v }))
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const addEnv = () => setEnvPairs(p => [...p, { k: '', v: '' }]);
  const removeEnv = (i: number) => setEnvPairs(p => p.filter((_, idx) => idx !== i));
  const updateEnv = (i: number, field: 'k' | 'v', val: string) =>
    setEnvPairs(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  useEffect(() => {
    getGlobalEnvVars().then(setGlobalVars).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('temp.toast.fieldsRequired')); return; }
    if (!cliId) { toast.error(t('temp.modal.selectTool')); return; }
    setSaving(true);
    try {
      const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
      const env: Record<string, string> = {};
      for (const { k, v } of envPairs) {
        if (k.trim()) env[k.trim()] = v;
      }
      const overrideVal = cmdOverride.trim() || undefined;
      if (template) {
        await updateTemplate(template.id, name.trim(), args, env, selectedGlobalVarIds, pwd.trim() || undefined, overrideVal, envMode);
      } else {
        await createTemplate(cliId, name.trim(), args, env, selectedGlobalVarIds, pwd.trim() || undefined, overrideVal, envMode);
      }
      onSave();
      onClose();
      toast.success(template ? t('temp.toast.updated') : t('temp.toast.created'));
    } catch {
      toast.error(t('temp.toast.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Generate real-time execution preview
  const getPreviewText = () => {
    const selectedToolObj = tools.find(t => t.id === cliId);
    const exeName = selectedToolObj ? selectedToolObj.name : 'cli-tool';
    
    const toolArgs = selectedToolObj?.custom_args ?? [];
    const templateArgs = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
    const mergedArgs = mergeCliArgs(toolArgs, templateArgs);
    const finalArgs = mergedArgs.length > 0 ? ` ${mergedArgs.join(' ')}` : '';
    
    // Gather environments (both custom and active global env vars)
    const activeGlobalVars = globalVars.filter(gv => selectedGlobalVarIds.includes(gv.id));
    const activeEnvs: string[] = [];
    
    activeGlobalVars.forEach(gv => {
      activeEnvs.push(`${gv.key}=${gv.value}`);
    });
    
    envPairs.forEach(pair => {
      if (pair.k.trim()) {
        activeEnvs.push(`${pair.k.trim()}=${pair.v}`);
      }
    });
    
    const envPrefix = activeEnvs.length > 0 ? `${activeEnvs.join(' ')} ` : '';
    const pwdPrefix = pwd.trim() ? `cd ${pwd.trim()} && ` : '';
    
    return `${pwdPrefix}${envPrefix}${exeName}${finalArgs}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{template ? t('temp.modal.editTitle') : t('temp.modal.newTitle')}</div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        
        {/* Navigation Tabs */}
        <div className="spec-tabs-header">
          <button
            type="button"
            className={`spec-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <span>📝</span> {t('temp.modal.general') || '基本设置'}
          </button>
          <button
            type="button"
            className={`spec-tab-btn ${activeTab === 'env' ? 'active' : ''}`}
            onClick={() => setActiveTab('env')}
          >
            <span>🌐</span> {t('temp.modal.envTab') || '环境变量'}
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* Double-Bezel nested container holding form fields */}
          <div className="spec-bezel-outer">
            <div className="spec-bezel-inner">
              {activeTab === 'general' && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('temp.modal.tool')} *</label>
                    <select className="input" value={cliId} onChange={e => setCliId(e.target.value)} disabled={!!template}>
                      {tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('temp.modal.name')} *</label>
                    <input className="input" placeholder={t('temp.modal.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('temp.card.args') || '参数'}</label>
                    <input className="input" placeholder={t('temp.modal.argsPlaceholder')} value={argsStr} onChange={e => setArgsStr(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('temp.modal.pwd')}</label>
                    <input className="input" placeholder={t('temp.modal.pwdPlaceholder')} value={pwd} onChange={e => setPwd(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t('temp.modal.cmdOverride')}
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400, fontFamily: 'monospace' }}>loom &lt;name&gt;</span>
                    </label>
                    <input
                      className="input"
                      placeholder={t('temp.modal.cmdOverridePlaceholder')}
                      value={cmdOverride}
                      onChange={e => setCmdOverride(e.target.value)}
                      style={{ fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                </>
              )}

              {activeTab === 'env' && (
                <>
                  {/* Environment Isolation Mode selection */}
                  <div className="form-group">
                    <label className="form-label">{t('proj.launcher.envMode') || 'Environment Mode'}</label>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', marginTop: '4px', marginBottom: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input 
                          type="radio" 
                          name="tplEnvMode" 
                          value="inherit" 
                          checked={envMode === 'inherit'}
                          onChange={() => setEnvMode('inherit')}
                        />
                        <span>{t('proj.launcher.envMode.inherit') || 'Inherit'}</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input 
                          type="radio" 
                          name="tplEnvMode" 
                          value="isolated" 
                          checked={envMode === 'isolated'}
                          onChange={() => setEnvMode('isolated')}
                        />
                        <span>{t('proj.launcher.envMode.isolated') || 'Isolated'}</span>
                      </label>
                    </div>
                  </div>

                  {/* Global Env vars — grouped by KEY, mutually exclusive within each group */}
                  <div className="form-group">
                    <label className="form-label" style={{ marginBottom: 4 }}>
                      {t('temp.modal.globalEnvs')}
                    </label>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                      {t('temp.modal.globalEnvsDesc')}
                    </div>
                    {globalVars.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
                        {t('temp.modal.noGlobalEnvs')}
                      </div>
                    ) : (() => {
                      // Group by key
                      const grouped = new Map<string, GlobalEnvVar[]>();
                      for (const gv of globalVars) {
                        const arr = grouped.get(gv.key) ?? [];
                        arr.push(gv);
                        grouped.set(gv.key, arr);
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {Array.from(grouped.entries()).map(([key, values]) => {
                            const selectedInGroup = values.find(v => selectedGlobalVarIds.includes(v.id));
                            return (
                              <div key={key} style={{
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                overflow: 'hidden'
                              }}>
                                {/* Key label */}
                                <div style={{
                                  padding: '5px 10px',
                                  background: 'var(--bg-elevated)',
                                  borderBottom: '1px solid var(--border-subtle)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8
                                }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--accent-purple)' }}>{key}</span>
                                  {values.length > 1 && (
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t('env.group.selectOne')}</span>
                                  )}
                                  {selectedInGroup && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedGlobalVarIds(p => p.filter(id => id !== selectedInGroup.id))}
                                      style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                    >
                                      ✕ {t('env.group.clear')}
                                    </button>
                                  )}
                                </div>
                                {/* Values — single-select within group */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px' }}>
                                  {values.map(gv => {
                                    const checked = selectedGlobalVarIds.includes(gv.id);
                                    return (
                                      <div
                                        key={gv.id}
                                        className={`env-chip ${checked ? 'active' : ''}`}
                                        onClick={() => {
                                          // Deselect all siblings in same key group, then select this one
                                          setSelectedGlobalVarIds(p => {
                                            const withoutGroup = p.filter(id => !values.some(v => v.id === id));
                                            return checked ? withoutGroup : [...withoutGroup, gv.id];
                                          });
                                        }}
                                        title={`${gv.key}=${gv.value}${gv.description ? ' — ' + gv.description : ''}`}
                                        style={{ maxWidth: 200 }}
                                      >
                                        <span className="env-chip-check">✓</span>
                                        <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {gv.value || <em style={{ color: 'var(--text-tertiary)' }}>(empty)</em>}
                                        </span>
                                        {gv.description && (
                                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10, marginLeft: 2 }}>
                                            · {gv.description}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Custom Env vars key-values overrides */}
                  <div className="form-group">
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <label className="form-label" style={{ margin: 0 }}>{t('temp.card.envs')}</label>
                      <button type="button" className="btn btn-ghost" onClick={addEnv} style={{ fontSize: 11, padding: '4px 10px' }}>＋ {t('temp.modal.btn.addVar')}</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
                      {envPairs.map((pair, i) => (
                        <div key={i} className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input className="input" placeholder="KEY" value={pair.k} onChange={e => updateEnv(i, 'k', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 14, flexShrink: 0 }}>=</span>
                          <input className="input" placeholder="value" value={pair.v} onChange={e => updateEnv(i, 'v', e.target.value)} style={{ flex: 1.5, fontFamily: 'monospace', fontSize: 12 }} />
                          <button type="button" className="btn-icon" onClick={() => removeEnv(i)} style={{ color: 'var(--accent-red)', flexShrink: 0, border: 'none', background: 'transparent' }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Live Execution Preview Terminal */}
          <div style={{ marginTop: '4px' }}>
            <div className="spec-preview-terminal">
              <div className="spec-preview-terminal-header">
                <div className="spec-terminal-dot red" />
                <div className="spec-terminal-dot yellow" />
                <div className="spec-terminal-dot green" />
                <div className="spec-preview-terminal-title">{t('temp.modal.preview') || 'Execution Preview'}</div>
              </div>
              <div className="spec-preview-cmd-line">
                {getPreviewText()}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{t('cat.modal.btn.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('temp.modal.btn.saving') : template ? t('temp.modal.btn.save') : t('temp.modal.btn.creating')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage({ tools, onInstanceLaunched }: Props) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>();
  const [launching, setLaunching] = useState<string | null>(null);
  const toast = useToast();

  const load = async () => {
    try { setTemplates(await getTemplates()); } catch { toast.error(t('temp.toast.launchFailed')); }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('temp.confirm.delete', { name }))) return;
    try { await deleteTemplate(id); load(); toast.success(t('temp.toast.deleted')); } catch { toast.error(t('cat.toast.deleteFailed')); }
  };

  const handleRun = async (tpl: Template) => {
    const tool = tools.find(t => t.id === tpl.cli_id);
    if (!tool) { toast.error(t('temp.modal.selectTool')); return; }
    setLaunching(tpl.id);
    try {
      const instanceId = await runCliTemplate(tpl.id);
      onInstanceLaunched(instanceId, tpl, tool);
      toast.success(t('temp.toast.launched') + ': ' + tpl.name);
    } catch {
      toast.error(t('temp.toast.launchFailed'));
    } finally {
      setLaunching(null);
    }
  };

  const getToolName = (cliId: string) => tools.find(t => t.id === cliId)?.name ?? '?';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('temp.title')}</div>
          <div className="page-subtitle">{t('temp.desc')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingTemplate(undefined); setShowModal(true); }} style={{ fontSize: 12 }} disabled={tools.length === 0}>
          <span>＋</span> {t('temp.btn.new')}
        </button>
      </div>

      <div className="page-body">
        {templates.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">▶️</div>
            <div className="empty-state-title">{t('temp.empty.noTemps')}</div>
            <div className="empty-state-desc">{t('temp.empty.desc')}</div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)} disabled={tools.length === 0}>＋ {t('temp.empty.btn.createFirst')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map((tpl, i) => (
              <div key={tpl.id} className="card-outer" style={{ animationDelay: `${i * 30}ms`, animation: 'fadeSlideIn 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
                <div className="card-inner" style={{ padding: '14px 18px' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{tpl.name}</span>
                      <span className="badge badge-purple" style={{ fontSize: 10 }}>{getToolName(tpl.cli_id)}</span>
                      {tpl.cmd_override && (
                        <span className="badge badge-emerald" style={{ fontSize: 10 }} title={t('temp.card.cmdOverride')}>
                          {tpl.cmd_override}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-success"
                        onClick={() => handleRun(tpl)}
                        disabled={launching === tpl.id}
                        style={{ fontSize: 12, padding: '5px 12px' }}
                      >
                        {launching === tpl.id ? <span className="scan-spinner" style={{ width: 12, height: 12 }} /> : '▶'}
                        {launching === tpl.id ? t('temp.modal.btn.creating') : t('temp.card.btn.run')}
                      </button>
                      <button className="btn-icon" title={t('temp.card.btn.edit')} onClick={() => { setEditingTemplate(tpl); setShowModal(true); }}>✎</button>
                      <button className="btn-icon" title={t('temp.card.btn.delete')} onClick={() => handleDelete(tpl.id, tpl.name)} style={{ color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)' }}>✕</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {tpl.cmd_override && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        <span style={{ color: 'var(--accent-purple)', marginRight: 4 }}>{t('temp.card.cmdOverride')}:</span>
                        loom {tpl.cmd_override}
                      </span>
                    )}
                    {tpl.args.length > 0 && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        <span style={{ color: 'var(--accent-emerald)', marginRight: 4 }}>{t('temp.card.args')}:</span>
                        {tpl.args.join(' ')}
                      </span>
                    )}
                    {tpl.pwd && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        <span style={{ color: 'var(--accent-amber)', marginRight: 4 }}>{t('temp.card.pwd')}:</span>
                        {tpl.pwd}
                      </span>
                    )}
                    {Object.keys(tpl.env).length > 0 && (
                      <span style={{ fontSize: 11 }}>
                        <span style={{ color: 'var(--accent-blue)', marginRight: 4 }}>{t('temp.card.envs')}:</span>
                        {Object.keys(tpl.env).join(', ')}
                      </span>
                    )}
                    {tpl.last_run && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {t('temp.card.lastRun')}: {new Date(parseInt(tpl.last_run) * 1000).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <TemplateModal
          tools={tools}
          template={editingTemplate}
          onClose={() => { setShowModal(false); setEditingTemplate(undefined); }}
          onSave={load}
        />
      )}
    </div>
  );
}
