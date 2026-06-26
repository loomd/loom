import React, { useState, useEffect } from 'react';
import {
  getGlobalEnvVars,
  createGlobalEnvVar,
  updateGlobalEnvVar,
  deleteGlobalEnvVar
} from '../api';
import type { GlobalEnvVar } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

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
  const toast = useToast();

  const load = async () => {
    try {
      const vars = await getGlobalEnvVars();
      setEnvVars(vars);
    } catch (e: any) {
      toast.error(e?.toString() ?? 'Failed to load global environment variables');
    }
  };

  useEffect(() => { load(); }, []);

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
      toast.success(t('env.toast.saved'));
    } catch (e: any) {
      toast.error(e?.toString() ?? t('env.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, key: string) => {
    if (!confirm(t('temp.confirm.delete', { name: key }))) return;
    try {
      await deleteGlobalEnvVar(id);
      load();
      toast.success(t('temp.toast.deleted'));
    } catch (e: any) {
      toast.error(e?.toString() ?? 'Delete failed');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('env.title')}</div>
          <div className="page-subtitle">{t('env.desc')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()} style={{ fontSize: 12 }}>
          <span>＋</span> {t('env.btn.newVar')}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, flexGrow: 1, minHeight: 0 }}>
        <div className="search-input-wrap" style={{ width: '100%', maxWidth: '320px', marginBottom: 4, flex: 'none' }}>
          <span className="search-icon">🔍</span>
          <input
            className="input"
            placeholder={t('env.search.placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>

        {groupEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">{t('env.empty.noVars')}</div>
            {search && <div className="empty-state-desc">{t('env.empty.noSearchResult')}</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexGrow: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
            {groupEntries.map(([key, values], idx) => (
              <div key={key} className="card-outer" style={{ animationDelay: `${idx * 40}ms` }}>
                <div className="card-inner" style={{ padding: '14px 18px' }}>
                  {/* Key header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--accent-purple)' }}>
                        {key}
                      </span>
                      <span style={{
                        fontSize: 10, padding: '2px 7px',
                        borderRadius: 99,
                        background: 'var(--accent-purple-dim)',
                        color: 'var(--accent-purple)',
                        fontWeight: 600
                      }}>
                        {values.length} {t('env.group.valueCount')}
                      </span>
                    </div>
                    {/* Add another value for this key */}
                    <button
                      className="btn btn-ghost"
                      onClick={() => openNew(key)}
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      title={t('env.btn.addValue')}
                    >
                      ＋ {t('env.btn.addValue')}
                    </button>
                  </div>

                  {/* Values list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {values.map((ev, vi) => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr auto',
                          gap: 12,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: vi % 2 === 0 ? 'var(--bg-elevated)' : 'transparent',
                          border: '1px solid var(--border-subtle)'
                        }}
                      >
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(empty)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.description || '-'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button className="btn-icon" onClick={() => openEdit(ev)} style={{ fontSize: 12 }}>📝</button>
                          <button className="btn-icon" onClick={() => handleDelete(ev.id, ev.key)} style={{ color: 'var(--accent-red)', fontSize: 12 }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
