import React, { useState, useEffect, useCallback } from 'react';
import {
  getGlobalEnvVars,
  createGlobalEnvVar,
  updateGlobalEnvVar,
  deleteGlobalEnvVar
} from '../api';
import type { GlobalEnvVar } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';
import { useDialog } from '../DialogContext';

// Group flat list by key
function groupByKey(vars: GlobalEnvVar[]): Map<string, GlobalEnvVar[]> {
  const map = new Map<string, GlobalEnvVar[]>();
  for (const v of vars) {
    const arr = map.get(v.key) ?? [];
    arr.push(v);
    map.set(v.key, arr);
  }
  return map;
}

export default function EnvVarsPage() {
  const { t } = useI18n();
  const [envVars, setEnvVars] = useState<GlobalEnvVar[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVar, setEditingVar] = useState<GlobalEnvVar | null>(null);
  // When adding a value to an existing key, prefill the key
  const [prefillKey, setPrefillKey] = useState('');

  const [modalKey, setModalKey] = useState('');
  const [modalValue, setModalValue] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toast = useToast();
  const dialog = useDialog();

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const vars = await getGlobalEnvVars();
      setEnvVars(vars);
    } catch {
      toast.error('Failed to load global environment variables');
    }
  }, [toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const openNew = (keyPrefill = '') => {
    setEditingVar(null);
    setPrefillKey(keyPrefill);
    setModalKey(keyPrefill);
    setModalValue('');
    setModalDesc('');
    setShowModal(true);
  };

  const openEdit = (ev: GlobalEnvVar) => {
    setEditingVar(ev);
    setPrefillKey('');
    setModalKey(ev.key);
    setModalValue(ev.value);
    setModalDesc(ev.description || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    const key = modalKey.trim();
    const val = modalValue.trim();
    if (!key) { toast.error(t('env.toast.keyEmpty')); return; }
    setSaving(true);
    try {
      if (editingVar) {
        await updateGlobalEnvVar(editingVar.id, key, val, modalDesc.trim());
      } else {
        await createGlobalEnvVar(key, val, modalDesc.trim());
      }
      setShowModal(false);
      load();
      window.dispatchEvent(new Event('loom-refresh-data'));
      toast.success(t('env.toast.saved'));
    } catch {
      toast.error(t('env.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, key: string) => {
    const ok = await dialog.confirm({ message: t('temp.confirm.delete', { name: key }), danger: true });
    if (!ok) return;
    try {
      await deleteGlobalEnvVar(id);
      load();
      window.dispatchEvent(new Event('loom-refresh-data'));
      toast.success(t('temp.toast.deleted'));
    } catch {
      toast.error('Delete failed');
    }
  };

  const allVars = envVars.filter(ev =>
    !search ||
    ev.key.toLowerCase().includes(search.toLowerCase()) ||
    ev.value.toLowerCase().includes(search.toLowerCase()) ||
    (ev.description && ev.description.toLowerCase().includes(search.toLowerCase()))
  );

  const grouped = groupByKey(allVars);
  const groupEntries = Array.from(grouped.entries());

  const columnHeaderStyle = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)'
  };

	return (
		<div data-tour-target="env-vars-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
			<div className="page-header">
				<div>
					<div className="page-title">{t('env.title')}</div>
					<div className="page-subtitle">{t('env.desc')}</div>
				</div>
				<button className="btn btn-primary" onClick={() => openNew()} style={{ fontSize: 12 }}>
					<span>＋</span> {t('env.btn.newVar')}
				</button>
			</div>

      <div style={{ padding: '16px 28px 0', flex: 'none' }}>
        <div className="search-input-wrap" style={{ width: '100%', maxWidth: '320px' }}>
          <span className="search-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            className="input"
            placeholder={t('env.search.placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, paddingTop: 12, paddingRight: 32 }}>
        {groupEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t('env.empty.noVars')}</div>
            {search && <div className="empty-state-desc">{t('env.empty.noSearchResult')}</div>}
          </div>
        ) : (
          <>
            {groupEntries.map(([key, values]) => {
              const isExpanded = !!search || expandedKeys.has(key);
              return (
              <div
                key={key}
                style={{
                  flexShrink: 0,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden'
                }}
              >
                {/* Key header row */}
                <div
                  onClick={() => toggleExpand(key)}
                  title={isExpanded ? t('env.group.collapse') : t('env.group.expand')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
                    cursor: 'pointer', userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 14, height: 14, flexShrink: 0,
                      color: 'var(--text-tertiary)',
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 200ms var(--ease-spring)'
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {key}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', flexShrink: 0,
                      borderRadius: 99,
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 600
                    }}>
                      {values.length} {t('env.group.valueCount')}
                    </span>
                  </div>
                  {/* Add another value for this key */}
                  <button
                    className="btn btn-ghost"
                    onClick={e => { e.stopPropagation(); openNew(key); }}
                    style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                    title={t('env.btn.addValue')}
                  >
                    ＋ {t('env.btn.addValue')}
                  </button>
                </div>

                {/* Values list */}
                {isExpanded && (
                <div style={{ padding: '0 14px' }}>
                  {/* Column header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 10px'
                  }}>
                    <span style={{ ...columnHeaderStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('env.table.value')}</span>
                    <span style={{ ...columnHeaderStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('env.table.desc')}</span>
                    <span style={{ ...columnHeaderStyle, textAlign: 'right' }}>{t('env.table.actions')}</span>
                  </div>
                  {values.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: '7px 10px',
                        borderTop: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(empty)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.description || '-'}
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => openEdit(ev)}
                          style={{ fontSize: 11, padding: '2px 8px', height: 'auto', minHeight: 'auto', lineHeight: 1.6 }}
                        >
                          {t('temp.card.btn.edit')}
                        </button>
                        <button
                          className="btn-delete-project"
                          onClick={() => handleDelete(ev.id, ev.key)}
                          style={{ fontSize: 12, padding: '2px 6px' }}
                          title={t('temp.card.btn.delete')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
              );
            })}
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {editingVar ? t('temp.card.btn.edit') : t('env.btn.newVar')}
              </div>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('env.table.key')} *</label>
                <input
                  className="input"
                  placeholder="e.g. MODEL_NAME"
                  value={modalKey}
                  onChange={e => setModalKey(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  autoFocus={!prefillKey}
                  readOnly={!!prefillKey && !editingVar}
                />
                {!!prefillKey && !editingVar && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {t('env.modal.keyLocked')}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t('env.table.value')}</label>
                <input
                  className="input"
                  placeholder="e.g. claude-3-opus"
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  autoFocus={!!prefillKey}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('env.table.desc')}</label>
                <input
                  className="input"
                  placeholder={t('env.modal.descPlaceholder')}
                  value={modalDesc}
                  onChange={e => setModalDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                {t('cat.modal.btn.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('env.btn.saving') : t('temp.modal.btn.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
