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

export default function EnvVarsPage() {
  const { t } = useI18n();
  const [envVars, setEnvVars] = useState<GlobalEnvVar[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVar, setEditingVar] = useState<GlobalEnvVar | null>(null);
  
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

  useEffect(() => {
    load();
  }, []);

  const handleEditClick = (ev: GlobalEnvVar | null) => {
    setEditingVar(ev);
    if (ev) {
      setModalKey(ev.key);
      setModalValue(ev.value);
      setModalDesc(ev.description || '');
    } else {
      setModalKey('');
      setModalValue('');
      setModalDesc('');
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    const key = modalKey.trim();
    const val = modalValue.trim();
    if (!key) {
      toast.error(t('env.toast.keyEmpty'));
      return;
    }
    
    // Check duplicates locally (ignoring self if editing)
    if (envVars.some(ev => ev.key.toUpperCase() === key.toUpperCase() && (!editingVar || ev.id !== editingVar.id))) {
      toast.error(t('env.toast.dupKey', { key }));
      return;
    }

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

  const handleDeleteClick = async (id: string) => {
    if (!confirm(t('temp.confirm.delete', { name: envVars.find(e => e.id === id)?.key ?? '' }))) {
      return;
    }
    try {
      await deleteGlobalEnvVar(id);
      load();
      toast.success(t('temp.toast.deleted'));
    } catch (e: any) {
      toast.error(e?.toString() ?? 'Delete failed');
    }
  };

  const filtered = envVars.filter(ev =>
    !search ||
    ev.key.toLowerCase().includes(search.toLowerCase()) ||
    ev.value.toLowerCase().includes(search.toLowerCase()) ||
    (ev.description && ev.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('env.title')}</div>
          <div className="page-subtitle">{t('env.desc')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => handleEditClick(null)} style={{ fontSize: 12 }}>
          <span>＋</span> {t('env.btn.newVar')}
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">{t('env.empty.noVars')}</div>
            {search && <div className="empty-state-desc">没有找到匹配的环境变量</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((ev, idx) => (
              <div key={ev.id} className="card-outer" style={{ animationDelay: `${idx * 40}ms` }}>
                <div
                  className="card-inner"
                  style={{
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: '200px 300px 1fr auto',
                    gap: 16,
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--accent-purple)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.key}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.value}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ev.description || '-'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-icon" onClick={() => handleEditClick(ev)} style={{ fontSize: 12 }}>📝</button>
                    <button className="btn-icon" onClick={() => handleDeleteClick(ev.id)} style={{ color: 'var(--accent-red)', fontSize: 12 }}>✕</button>
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
                  placeholder="e.g. DATABASE_URL"
                  value={modalKey}
                  onChange={e => setModalKey(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('env.table.value')}</label>
                <input
                  className="input"
                  placeholder="e.g. postgres://localhost/db"
                  value={modalValue}
                  onChange={e => setModalValue(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('env.table.desc')}</label>
                <input
                  className="input"
                  placeholder="e.g. Local development database connection string"
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
