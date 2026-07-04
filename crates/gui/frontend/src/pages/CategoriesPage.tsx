import React, { useState } from 'react';
import { createCategory, deleteCategory, updateCategory, smartClassify } from '../api';
import type { Category, CliTool } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface Props {
  categories: Category[];
  tools: CliTool[];
  onCategoriesChange: () => void;
}

export default function CategoriesPage({ categories, tools, onCategoriesChange }: Props) {
  const { t, language } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Classifying state
  const [classifying, setClassifying] = useState(false);

  const toast = useToast();

  const getToolCount = (catId: string) =>
    tools.filter(t => t.category_id === catId).length;

  const getToolsForCat = (catId: string) =>
    tools.filter(t => t.category_id === catId);

  const uncategorizedCount = tools.filter(t => !t.category_id).length;

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error(t('cat.toast.nameRequired')); return; }
    setCreating(true);
    try {
      await createCategory(newName.trim(), newDesc.trim());
      setNewName(''); setNewDesc('');
      setShowModal(false);
      onCategoriesChange();
      toast.success(t('cat.toast.created', { name: newName.trim() }));
    } catch (e) {
      toast.error(e?.toString() ?? t('cat.toast.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleEditClick = (cat: Category) => {
    setEditCategory(cat);
    setEditName(cat.name);
    setEditDesc(cat.description || '');
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editCategory) return;
    if (!editName.trim()) { toast.error(t('cat.toast.nameRequired')); return; }
    setSaving(true);
    try {
      await updateCategory(editCategory.id, editName.trim(), editDesc.trim());
      setShowEditModal(false);
      setEditCategory(null);
      onCategoriesChange();
      toast.success(t('cat.toast.updated', { name: editName.trim() }));
    } catch (e) {
      toast.error(e?.toString() ?? t('cat.toast.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    const count = getToolCount(cat.id);
    const msg = count > 0
      ? t('cat.confirm.deleteWithTools', { name: cat.name, count })
      : t('cat.confirm.delete', { name: cat.name });
    if (!confirm(msg)) return;
    try {
      await deleteCategory(cat.id);
      onCategoriesChange();
      toast.success(t('cat.toast.deleted', { name: cat.name }));
    } catch (e) {
      toast.error(e?.toString() ?? t('cat.toast.deleteFailed'));
    }
  };

  const handleSmartClassify = async () => {
    setClassifying(true);
    try {
      const [sys, dev] = await smartClassify();
      onCategoriesChange();
      toast.success(t('cat.toast.smartClassified', { sys, dev }));
    } catch (e) {
      toast.error(e?.toString() ?? t('cat.toast.smartClassifyFailed'));
    } finally {
      setClassifying(false);
    }
  };

  const CATEGORY_COLORS = [
    '#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('cat.title')}</div>
          <div className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{t('cat.subtitle', { catCount: categories.length, toolCount: tools.length })}</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
            <span style={{
              color: uncategorizedCount > 0 ? 'var(--accent-orange)' : 'var(--accent-emerald)',
              fontWeight: 500,
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill)',
              background: uncategorizedCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
            }}>
              {uncategorizedCount > 0 ? t('cat.stats.uncategorized', { count: uncategorizedCount }) : t('cat.stats.allCategorized')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={handleSmartClassify} disabled={classifying} style={{ fontSize: 12 }}>
            {classifying ? t('cat.smartClassify.running') : t('cat.btn.smartClassify')}
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ fontSize: 12 }}>
            <span>＋</span> {t('cat.btn.new')}
          </button>
        </div>
      </div>

      <div className="page-body">
        {uncategorizedCount > 0 && (
          <div className="card-outer" style={{ marginBottom: 16 }}>
            <div className="card-inner" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
              <div className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>💡</span>
                <span>
                  {language === 'zh'
                    ? `有 ${uncategorizedCount} 个未分类的工具。试试使用“智能分类”自动分类您的系统和开发指令吧！`
                    : `There are ${uncategorizedCount} uncategorized tools. Try using "Smart Classify" to auto-categorize standard system & dev tools!`}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={handleSmartClassify} disabled={classifying} style={{ fontSize: 12, padding: '4px 10px' }}>
                {classifying ? t('cat.smartClassify.running') : t('cat.btn.smartClassify')}
              </button>
            </div>
          </div>
        )}

        {categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂️</div>
            <div className="empty-state-title">{t('cat.empty.noCats')}</div>
            <div className="empty-state-desc">{t('cat.empty.desc')}</div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>＋ {t('cat.empty.btn.createFirst')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {categories.map((cat, i) => {
              const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
              const count = getToolCount(cat.id);
              const catTools = getToolsForCat(cat.id);
              return (
                <div key={cat.id} className="card-outer" style={{ animationDelay: `${i * 40}ms`, animation: 'fadeSlideIn 400ms cubic-bezier(0.16,1,0.3,1) both' }}>
                  <div className="card-inner" style={{ padding: 18 }}>
                    {/* Header */}
                    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                      <div className="flex items-center gap-2">
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: color,
                          boxShadow: `0 0 10px ${color}80`,
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                          {cat.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-gray" style={{ fontSize: 11, marginRight: 4 }}>{t('cat.card.toolsCount', { count })}</span>
                        <button
                          className="btn-icon"
                          onClick={() => handleEditClick(cat)}
                          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-mid)', background: 'var(--bg-elevated)', width: 26, height: 26, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                          title={t('cat.modal.editTitle')}
                        >
                          📝
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => handleDelete(cat)}
                          style={{ color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', width: 26, height: 26, fontSize: 11 }}
                        >✕</button>
                      </div>
                    </div>

                    {/* Description */}
                    {cat.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, lineHeight: 1.5 }}>
                        {cat.description}
                      </p>
                    )}

                    {/* Tool chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {catTools.slice(0, 8).map(t => (
                        <span key={t.id} style={{
                          fontSize: 11, padding: '3px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: `${color}18`,
                          border: `1px solid ${color}30`,
                          color: `${color}`,
                          fontFamily: 'monospace',
                        }}>
                          {t.name}
                        </span>
                      ))}
                      {catTools.length > 8 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '3px 4px' }}>
                          {t('cat.card.more', { count: catTools.length - 8 })}
                        </span>
                      )}
                      {catTools.length === 0 && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          {t('cat.card.noTools')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{t('cat.modal.newTitle')}</div>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('cat.modal.name')} *</label>
                <input
                  className="input"
                  placeholder={t('cat.modal.namePlaceholder')}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('cat.modal.desc')}</label>
                <input
                  className="input"
                  placeholder={t('cat.modal.descPlaceholder')}
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>{t('cat.modal.btn.cancel')}</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? t('cat.modal.btn.creating') : t('cat.modal.btn.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editCategory && (
        <div className="modal-overlay" onClick={() => { setShowEditModal(false); setEditCategory(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{t('cat.modal.editTitle')}</div>
              <button className="btn-icon" onClick={() => { setShowEditModal(false); setEditCategory(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('cat.modal.name')} *</label>
                <input
                  className="input"
                  placeholder={t('cat.modal.namePlaceholder')}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('cat.modal.desc')}</label>
                <input
                  className="input"
                  placeholder={t('cat.modal.descPlaceholder')}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowEditModal(false); setEditCategory(null); }}>{t('cat.modal.btn.cancel')}</button>
              <button className="btn btn-primary" onClick={handleUpdate} disabled={saving}>
                {saving ? t('cat.modal.btn.saving') : t('cat.modal.btn.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
