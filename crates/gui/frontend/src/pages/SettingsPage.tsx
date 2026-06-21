import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../I18nContext';
import { useToast } from '../ToastContext';
import { 
  getCliTools,
  deleteCliTool,
  scanPathEnv,
  importCliTool,
  assignCliCategory,
  getTemplates,
  deleteTemplate,
  updateCliEnv,
  updateCliArgs
} from '../api';
import type { CliTool, Category, Template } from '../types';
import EnvVarsPage from './EnvVarsPage';
import { TemplateModal } from './TemplatesPage';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  theme: 'dark' | 'day';
  onThemeChange: (newTheme: 'dark' | 'day') => Promise<void>;
  fontFamily: string;
  fontSize: string;
  onFontFamilyChange: (family: string) => Promise<void>;
  onFontSizeChange: (size: string) => Promise<void>;
}

const PRESETS = [
  'System Default',
  'Plus Jakarta Sans',
  'HarmonyOS Sans SC',
  'Inter',
  'Outfit',
  'JetBrains Mono',
  'Fira Code'
];

type Tab = 'general' | 'tools' | 'env';

export default function SettingsPage({
  theme,
  onThemeChange,
  fontFamily,
  fontSize,
  onFontFamilyChange,
  onFontSizeChange
}: Props) {
  const { t, language, setLanguage } = useI18n();
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<Tab>('general');

  // ─── CLI Tools & Templates Tab States ──────────────────────────
  const [cliTools, setCliTools] = useState<CliTool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [toolsSearch, setToolsSearch] = useState('');
  const [toolsFilterCat, setToolsFilterCat] = useState('');
  const [selectedTool, setSelectedTool] = useState<CliTool | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>();
  const [editingToolConfig, setEditingToolConfig] = useState<CliTool | null>(null);
  const [scanningTools, setScanningTools] = useState(false);

  // Fetch categories
  const loadCategories = useCallback(async () => {
    try {
      const cats = await invoke<Category[]>('get_categories');
      setCategories(cats);
    } catch (e) {
      console.error('Failed to get categories:', e);
    }
  }, []);

  // Load tools & templates
  const loadToolsAndTemplates = useCallback(async () => {
    try {
      const toolsData = await getCliTools();
      setCliTools(toolsData);
      
      const templatesData = await getTemplates();
      setTemplates(templatesData);
      
      // Keep selected tool reference updated
      if (selectedTool) {
        const updated = toolsData.find(t => t.id === selectedTool.id);
        if (updated) {
          setSelectedTool(updated);
        }
      } else if (toolsData.length > 0) {
        setSelectedTool(toolsData[0]);
      }
    } catch (e) {
      console.error('Failed to load tools and templates:', e);
    }
  }, [selectedTool]);

  useEffect(() => {
    if (activeSubTab === 'tools') {
      loadCategories();
      loadToolsAndTemplates();
    }
  }, [activeSubTab]);

  const handleThemeSelect = async (newTheme: 'dark' | 'day') => {
    try {
      await onThemeChange(newTheme);
      toast.success(t('settings.toast.themeSaved'));
    } catch {
      toast.error(t('settings.toast.themeSaveFailed'));
    }
  };

  const handleFontFamilySelect = async (family: string) => {
    try {
      await onFontFamilyChange(family);
      toast.success(t('settings.toast.fontSaved'));
    } catch {
      toast.error(t('settings.toast.fontSaveFailed'));
    }
  };

  const handleFontSizeSelect = async (size: string) => {
    try {
      await onFontSizeChange(size);
      toast.success(t('settings.toast.fontSaved'));
    } catch {
      toast.error(t('settings.toast.fontSaveFailed'));
    }
  };

  // CLI Tools scan and import operations
  const handleScanPath = async () => {
    setScanningTools(true);
    try {
      const found = await scanPathEnv();
      await loadToolsAndTemplates();
      toast.success(t('db.toast.scanSuccess', { count: found.length }));
    } catch (e) {
      toast.error(String(e) ?? t('db.toast.scanFailed'));
    } finally {
      setScanningTools(false);
    }
  };

  const handleImportTool = async () => {
    const path = prompt(t('db.prompt.import'));
    if (!path) return;
    try {
      await importCliTool(path.trim());
      await loadToolsAndTemplates();
      toast.success(t('db.toast.imported'));
    } catch (e) {
      toast.error(String(e) ?? t('db.toast.importFailed'));
    }
  };

  const handleDeleteTool = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t('db.confirm.remove'))) return;
    try {
      await deleteCliTool(id);
      if (selectedTool?.id === id) {
        setSelectedTool(null);
      }
      await loadToolsAndTemplates();
      toast.success(t('db.toast.removed'));
    } catch (e) {
      toast.error(String(e) ?? t('db.toast.removeFailed'));
    }
  };

  const handleCategoryChange = async (toolId: string, catId: string) => {
    try {
      await assignCliCategory(toolId, catId || null);
      await loadToolsAndTemplates();
      toast.success(t('db.toast.catUpdated'));
    } catch (e) {
      toast.error(String(e) ?? t('db.toast.catUpdateFailed'));
    }
  };

  // Delete Template
  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(t('temp.confirm.delete', { name }))) return;
    try {
      await deleteTemplate(id);
      await loadToolsAndTemplates();
      toast.success(t('temp.toast.deleted'));
    } catch (e) {
      toast.error(String(e) ?? 'Failed to delete template');
    }
  };

  const filteredTools = cliTools.filter(t => {
    const q = toolsSearch.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.path.toLowerCase().includes(q);
    const matchCat = !toolsFilterCat || t.category_id === toolsFilterCat;
    return matchSearch && matchCat;
  });

  const getToolTemplates = (toolId: string) => {
    return templates.filter(t => t.cli_id === toolId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="page-header" style={{ paddingBottom: '0px' }}>
        <div>
          <div className="page-title">{t('settings.title')}</div>
          <div className="page-subtitle">{t('settings.subtitle')}</div>
        </div>
      </div>

      {/* ── Sub Tabs Navigation ────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1px', gap: '8px' }}>
        <button 
          onClick={() => setActiveSubTab('general')}
          style={{
            padding: '8px 16px',
            fontSize: '0.9rem',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'general' ? '2px solid var(--accent-purple)' : '2px solid transparent',
            color: activeSubTab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          ⚙️ {t('settings.title') || 'General Settings'}
        </button>
        <button 
          onClick={() => setActiveSubTab('tools')}
          style={{
            padding: '8px 16px',
            fontSize: '0.9rem',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'tools' ? '2px solid var(--accent-purple)' : '2px solid transparent',
            color: activeSubTab === 'tools' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          🛠️ {t('workspace.tab.tools') || 'Tools & Templates'}
        </button>
        <button 
          onClick={() => setActiveSubTab('env')}
          style={{
            padding: '8px 16px',
            fontSize: '0.9rem',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'env' ? '2px solid var(--accent-purple)' : '2px solid transparent',
            color: activeSubTab === 'env' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          ⚡ {t('workspace.tab.env') || 'Environment Config'}
        </button>
      </div>

      {/* ── Sub Tab Views ────────────────────────────────────── */}
      <div style={{ flexGrow: 1, minHeight: 0, overflowY: activeSubTab === 'tools' ? 'hidden' : 'auto' }}>
        
        {/* ── General Settings View ── */}
        {activeSubTab === 'general' && (
          <div className="page-body" style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Theme Settings */}
            <div className="card-outer">
              <div className="card-inner" style={{ padding: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t('settings.theme.title')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  {t('settings.theme.desc')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <button
                    onClick={() => handleThemeSelect('dark')}
                    style={{
                      background: theme === 'dark' ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                      border: theme === 'dark' ? '2px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 200ms var(--ease-spring)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                    className={theme === 'dark' ? 'theme-active' : ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: '20px' }}>🌙</span>
                      {theme === 'dark' && (
                        <span style={{
                          background: 'var(--accent-purple)',
                          color: '#ffffff',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t('settings.theme.dark')}
                    </span>
                  </button>

                  <button
                    onClick={() => handleThemeSelect('day')}
                    style={{
                      background: theme === 'day' ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                      border: theme === 'day' ? '2px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 200ms var(--ease-spring)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                    className={theme === 'day' ? 'theme-active' : ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: '20px' }}>☀️</span>
                      {theme === 'day' && (
                        <span style={{
                          background: 'var(--accent-purple)',
                          color: '#ffffff',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>✓</span>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t('settings.theme.day')}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Font Settings */}
            <div className="card-outer">
              <div className="card-inner" style={{ padding: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t('settings.font.title')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  {t('settings.font.desc')}
                </div>

                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  {t('settings.font.family')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {PRESETS.map(preset => {
                    const isActive = fontFamily === preset;
                    return (
                      <button
                        key={preset}
                        onClick={() => handleFontFamilySelect(preset)}
                        style={{
                          background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                          border: isActive ? '1px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 16px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          fontFamily: preset === 'System Default' ? 'inherit' : preset,
                          color: 'var(--text-primary)',
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 200ms var(--ease-spring)',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label">{t('settings.font.custom')}</label>
                  <input
                    className="input"
                    placeholder={t('settings.font.customPlaceholder')}
                    value={PRESETS.includes(fontFamily) ? '' : fontFamily}
                    onChange={e => {
                      const val = e.target.value;
                      onFontFamilyChange(val || 'System Default');
                    }}
                    style={{ maxWidth: '320px' }}
                  />
                </div>

                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  {t('settings.font.size')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: t('settings.font.small'), value: '12px' },
                    { label: t('settings.font.medium'), value: '14px' },
                    { label: t('settings.font.large'), value: '16px' },
                    { label: t('settings.font.xlarge'), value: '18px' },
                  ].map(sz => {
                    const isActive = fontSize === sz.value;
                    return (
                      <button
                        key={sz.value}
                        onClick={() => handleFontSizeSelect(sz.value)}
                        style={{
                          background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                          border: isActive ? '1px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 16px',
                          cursor: 'pointer',
                          textAlign: 'center',
                          color: 'var(--text-primary)',
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 200ms var(--ease-spring)',
                        }}
                      >
                        {sz.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('settings.font.preview')}
                </div>
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  fontFamily: fontFamily === 'System Default' ? 'inherit' : fontFamily,
                  fontSize: fontSize,
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  minHeight: '60px',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  The quick brown fox jumps over the lazy dog. 1234567890 (智能分类与字体管理测试)
                </div>
              </div>
            </div>

            {/* Language Settings */}
            <div className="card-outer">
              <div className="card-inner" style={{ padding: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {t('settings.lang.title')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  {t('settings.lang.desc')}
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setLanguage('zh')}
                    className={`btn ${language === 'zh' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md)', padding: '10px 20px' }}
                  >
                    简体中文
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={`btn ${language === 'en' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md)', padding: '10px 20px' }}
                  >
                    English
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── CLI Tools & Templates View ── */}
        {activeSubTab === 'tools' && (
          <div style={{ display: 'flex', height: '100%', gap: '16px', minHeight: 0 }}>
            {/* Left Column: CLI Tools */}
            <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid var(--border-subtle)', paddingRight: '16px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost" onClick={handleScanPath} disabled={scanningTools} style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}>
                  {scanningTools ? t('db.btn.scanning') : `🔍 ${t('db.btn.scan')}`}
                </button>
                <button className="btn btn-ghost" onClick={handleImportTool} style={{ flex: 1, fontSize: '0.8rem', padding: '6px 8px' }}>
                  📥 {t('db.btn.import')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder={t('db.search.placeholder')}
                  value={toolsSearch}
                  onChange={e => setToolsSearch(e.target.value)}
                  className="input"
                  style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                />
                
                <select
                  value={toolsFilterCat}
                  onChange={e => setToolsFilterCat(e.target.value)}
                  className="input"
                  style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                >
                  <option value="">{t('db.filter.allCategories')}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value="uncategorized">{t('db.tool.uncategorized')}</option>
                </select>
              </div>

              {/* Tools List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                {filteredTools.length === 0 ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
                    {t('db.empty.noResults')}
                  </div>
                ) : (
                  filteredTools.map(tool => {
                    const isSelected = selectedTool?.id === tool.id;
                    return (
                      <div
                        key={tool.id}
                        onClick={() => setSelectedTool(tool)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isSelected ? 'var(--bg-active)' : 'var(--bg-card)',
                          border: isSelected ? '1px solid var(--accent-purple)' : '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flexGrow: 1 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                            {tool.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tool.path}>
                            {tool.path}
                          </span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                            <select
                              value={tool.category_id || ''}
                              onChange={e => handleCategoryChange(tool.id, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-subtle)',
                                backgroundColor: 'var(--bg-input)',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              <option value="">{t('db.tool.noCategory')}</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingToolConfig(tool);
                              }}
                              className="btn btn-ghost"
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                height: 'auto',
                                minHeight: 'auto',
                                lineHeight: '1'
                              }}
                            >
                              ⚙️ {t('db.tool.config') || '配置'}
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={e => handleDeleteTool(e, tool.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-red)',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Remove CLI Tool"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Templates for Selected Tool */}
            <div style={{ width: '60%', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
              {!selectedTool ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '40px', color: 'var(--text-tertiary)' }}>
                  <span style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛠️</span>
                  <p style={{ margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>
                    Select a CLI Tool from the left to view and edit templates
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        📋 {selectedTool.name} {t('temp.title')}
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        Path: {selectedTool.path}
                      </span>
                    </div>

                    <button
                      className="btn-primary"
                      onClick={() => {
                        setEditingTemplate(undefined);
                        setShowTemplateModal(true);
                      }}
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      ＋ {t('temp.btn.new')}
                    </button>
                  </div>

                  {/* Templates Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {getToolTemplates(selectedTool.id).length === 0 ? (
                      <div style={{ padding: '24px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: '0.9rem', textAlign: 'center' }}>
                        {t('temp.empty.noTemps')}
                      </div>
                    ) : (
                      getToolTemplates(selectedTool.id).map(tpl => (
                        <div
                          key={tpl.id}
                          className="template-card"
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '14px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                              {tpl.name}
                            </span>
                            
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="btn-secondary"
                                onClick={() => {
                                  setEditingTemplate(tpl);
                                  setShowTemplateModal(true);
                                }}
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              >
                                {t('temp.card.btn.edit')}
                              </button>
                              <button
                                className="btn-secondary"
                                onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                                style={{ padding: '4px 10px', fontSize: '0.8rem', color: 'var(--accent-red)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                              >
                                {t('temp.card.btn.delete')}
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {tpl.cmd_override && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{t('temp.card.cmdOverride')}</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>loom {tpl.cmd_override}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{t('temp.card.args')}</span>
                              <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{tpl.args.join(' ') || '(none)'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{t('temp.card.envs')}</span>
                              <span>
                                {Object.keys(tpl.env).length + (tpl.env_var_ids?.length || 0)} variables
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{t('proj.launcher.envMode') || 'Environment Mode'}</span>
                              <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                                {tpl.env_mode || 'inherit'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Template Modal */}
            {showTemplateModal && selectedTool && (
              <TemplateModal
                tools={cliTools}
                template={editingTemplate}
                defaultCliId={selectedTool.id}
                onClose={() => {
                  setShowTemplateModal(false);
                  setEditingTemplate(undefined);
                }}
                onSave={() => {
                  loadToolsAndTemplates();
                }}
              />
            )}

            {/* Tool Config Modal */}
            {editingToolConfig && (
              <CliToolConfigModal
                tool={editingToolConfig}
                onClose={() => setEditingToolConfig(null)}
                onSave={() => {
                  loadToolsAndTemplates();
                }}
              />
            )}
          </div>
        )}

        {/* ── Environment Variables View ── */}
        {activeSubTab === 'env' && (
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <EnvVarsPage />
          </div>
        )}

      </div>
    </div>
  );
}

interface CliToolConfigModalProps {
  tool: CliTool;
  onClose: () => void;
  onSave: () => void;
}

function CliToolConfigModal({ tool, onClose, onSave }: CliToolConfigModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [argsStr, setArgsStr] = useState(tool.custom_args?.join(' ') ?? '');
  const [envPairs, setEnvPairs] = useState<{ k: string; v: string }[]>(
    Object.entries(tool.custom_env ?? {}).map(([k, v]) => ({ k, v }))
  );
  const [saving, setSaving] = useState(false);

  const addEnv = () => setEnvPairs(p => [...p, { k: '', v: '' }]);
  const removeEnv = (i: number) => setEnvPairs(p => p.filter((_, idx) => idx !== i));
  const updateEnv = (i: number, field: 'k' | 'v', val: string) =>
    setEnvPairs(p => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const handleSave = async () => {
    setSaving(true);
    try {
      const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
      const env: Record<string, string> = {};
      for (const { k, v } of envPairs) {
        if (k.trim()) {
          const key = k.trim();
          if (key.includes('=') || /\s/.test(key)) {
            toast.error(t('env.toast.saveFailed') + ': Invalid character in environment key');
            setSaving(false);
            return;
          }
          env[key] = v;
        }
      }

      await updateCliEnv(tool.id, env);
      await updateCliArgs(tool.id, args);
      toast.success(t('env.toast.saved') || 'Saved successfully');
      onSave();
      onClose();
    } catch (e: any) {
      toast.error(e?.toString() ?? t('env.toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('db.tool.configTitle') || 'Configure CLI Tool'}</div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="spec-bezel-outer">
            <div className="spec-bezel-inner" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('db.tool.customArgs') || 'Default Arguments'}</label>
                <input
                  className="input"
                  placeholder={t('db.tool.customArgsPlaceholder') || 'Enter tool-level default arguments'}
                  value={argsStr}
                  onChange={e => setArgsStr(e.target.value)}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>{t('db.tool.customEnv') || 'Tool Environment Variables'}</label>
                  <button type="button" className="btn btn-ghost" onClick={addEnv} style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto' }}>＋ {t('temp.modal.btn.addVar')}</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                  {envPairs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                      No environment variables configured.
                    </div>
                  ) : (
                    envPairs.map((pair, i) => (
                      <div key={i} className="form-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input className="input" placeholder="KEY" value={pair.k} onChange={e => updateEnv(i, 'k', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 14, flexShrink: 0 }}>=</span>
                        <input className="input" placeholder="value" value={pair.v} onChange={e => updateEnv(i, 'v', e.target.value)} style={{ flex: 1.5, fontFamily: 'monospace', fontSize: 12 }} />
                        <button type="button" className="btn-icon" onClick={() => removeEnv(i)} style={{ color: 'var(--accent-red)', flexShrink: 0, border: 'none', background: 'transparent' }}>✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{t('cat.modal.btn.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('env.btn.saving') : t('env.btn.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
