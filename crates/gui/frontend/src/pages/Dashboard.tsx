import React, { useState, useEffect, useCallback } from 'react';
import { getCliTools, scanPathEnv, deleteCliTool, assignCliCategory, importCliTool } from '../api';
import type { CliTool, Category } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface Props {
  categories: Category[];
  onToolsChange: () => void;
  onSelectTool: (tool: CliTool) => void;
  selectedToolId?: string;
}

export default function Dashboard({ categories, onToolsChange, onSelectTool, selectedToolId }: Props) {
  const { t } = useI18n();
  const [tools, setTools] = useState<CliTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await getCliTools();
      setTools(data);
    } catch {
      toast.error(t('db.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleScanPath = async () => {
    setScanning(true);
    try {
      const found = await scanPathEnv();
      await load();
      onToolsChange();
      toast.success(t('db.toast.scanSuccess', { count: found.length }));
    } catch {
      toast.error(t('db.toast.scanFailed'));
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    const path = prompt(t('db.prompt.import'));
    if (!path) return;
    try {
      await importCliTool(path.trim());
      await load();
      onToolsChange();
      toast.success(t('db.toast.imported'));
    } catch {
      toast.error(t('db.toast.importFailed'));
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t('db.confirm.remove'))) return;
    try {
      await deleteCliTool(id);
      await load();
      onToolsChange();
      toast.success(t('db.toast.removed'));
    } catch {
      toast.error(t('db.toast.removeFailed'));
    }
  };

  const handleCategoryChange = async (toolId: string, catId: string) => {
    try {
      await assignCliCategory(toolId, catId || null);
      await load();
      onToolsChange();
      toast.success(t('db.toast.catUpdated'));
    } catch {
      toast.error(t('db.toast.catUpdateFailed'));
    }
  };

  const filtered = tools.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q);
    const matchCat = !filterCat || t.category_id === filterCat;
    return matchSearch && matchCat;
  });

  const getCatName = (id?: string) => {
    if (!id) return null;
    return categories.find(c => c.id === id)?.name;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">{t('db.title')}</div>
          <div className="page-subtitle">{t('db.subtitle', { count: tools.length })}</div>
        </div>
        <div className="flex gap-2 items-center">
          <button className="btn btn-ghost" onClick={handleImport} style={{ fontSize: 12 }}>
            <span>＋</span> {t('db.btn.import')}
          </button>
          <button className="btn btn-primary" onClick={handleScanPath} disabled={scanning} style={{ fontSize: 12 }}>
            {scanning ? <span className="scan-spinner" /> : <span>⟳</span>}
            {scanning ? t('db.btn.scanning') : t('db.btn.scan')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center" style={{ padding: '0 28px 12px' }}>
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="input"
            placeholder={t('db.search.placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ width: 160 }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">{t('db.filter.allCategories')}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(search || filterCat) && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setFilterCat(''); }} style={{ fontSize: 12 }}>
            {t('db.btn.clear')}
          </button>
        )}
      </div>

      {/* List */}
      <div className="page-body" style={{ paddingTop: 0 }}>
        {loading ? (
          <div className="empty-state">
            <div className="scan-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⌨️</div>
            <div className="empty-state-title">{tools.length === 0 ? t('db.empty.noTools') : t('db.empty.noResults')}</div>
            <div className="empty-state-desc">
              {tools.length === 0
                ? t('db.empty.desc.noTools')
                : t('db.empty.desc.noResults')}
            </div>
            {tools.length === 0 && (
              <button className="btn btn-primary" onClick={handleScanPath} disabled={scanning}>
                {scanning ? t('db.btn.scanning') : `⟳ ${t('db.empty.btn.scanNow')}`}
              </button>
            )}
          </div>
        ) : (
          <div className="tool-list">
            {filtered.map((tool, i) => (
              <div
                key={tool.id}
                className={`tool-row${selectedToolId === tool.id ? ' selected' : ''}`}
                style={{ animationDelay: `${i * 20}ms` }}
                onClick={() => onSelectTool(tool)}
              >
                <div className="tool-info">
                  <div className="tool-name">{tool.name}</div>
                  <div className="tool-path">{tool.path}</div>
                </div>

                <div className="flex items-center gap-2">
                  {getCatName(tool.category_id) ? (
                    <span className="badge badge-purple">{getCatName(tool.category_id)}</span>
                  ) : (
                    <span className="badge badge-gray">{t('db.tool.uncategorized')}</span>
                  )}
                  <select
                    className="input"
                    style={{ width: 130, fontSize: 11, padding: '4px 28px 4px 8px', height: 28 }}
                    value={tool.category_id ?? ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleCategoryChange(tool.id, e.target.value)}
                  >
                    <option value="">{t('db.tool.noCategory')}</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="tool-actions">
                  <button
                    className="btn-icon"
                    title="Remove"
                    onClick={e => handleDelete(e, tool.id)}
                    style={{ color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
