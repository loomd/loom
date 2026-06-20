import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { ToastProvider } from './ToastContext';
import { I18nProvider, useI18n } from './I18nContext';
import Dashboard from './pages/Dashboard';
import CategoriesPage from './pages/CategoriesPage';
import TemplatesPage from './pages/TemplatesPage';
import InstancesPage from './pages/InstancesPage';
import EnvVarsPage from './pages/EnvVarsPage';
import SettingsPage from './pages/SettingsPage';
import { getCliTools, getTheme, setTheme, getFontFamily, getFontSize, setFontFamily as apiFontFamily, setFontSize as apiFontSize } from './api';
import logoIcon from './assets/logo.png';
import type { CliTool, Category, Template, RunningInstance } from './types';

// ─── Simple icons (Unicode + SVG inline) ─────────────────────
const Icons = {
  terminal: '⌨',
  grid: '⊞',
  tag: '◈',
  play: '▶',
  instance: '◉',
  env: '⚡',
  settings: '⚙',
};

type Page = 'dashboard' | 'categories' | 'templates' | 'instances' | 'env' | 'settings';

interface NavItemProps {
  icon: string;
  label: string;
  page: Page;
  current: Page;
  badge?: number;
  onClick: () => void;
}

function NavItem({ icon, label, current, page, badge, onClick }: NavItemProps) {
  return (
    <button
      className={`nav-item${current === page ? ' active' : ''}`}
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', background: 'none', border: '1px solid transparent', cursor: 'pointer' }}
      data-page={page}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="nav-badge">{badge}</span>
      )}
    </button>
  );
}

function applyFontToDocument(family: string, size: string) {
  document.documentElement.style.setProperty('--font-family', family === 'System Default'
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    : `'${family}', 'Plus Jakarta Sans', sans-serif`);
  document.documentElement.style.setProperty('--font-size-base', size);
  const sizeNum = parseFloat(size);
  if (!isNaN(sizeNum)) {
    document.documentElement.style.fontSize = size;
  }
}

function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>('dashboard');
  const [tools, setTools] = useState<CliTool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTool, setSelectedTool] = useState<CliTool | undefined>();
  const [instances, setInstances] = useState<RunningInstance[]>([]);
  const [theme, setThemeState] = useState<'dark' | 'day'>('dark');
  const [fontFamily, setFontFamilyState] = useState('Plus Jakarta Sans');
  const [fontSize, setFontSizeState] = useState('14px');

  const handleThemeChange = async (newTheme: 'dark' | 'day') => {
    setThemeState(newTheme);
    document.body.className = `theme-${newTheme}`;
    try {
      await setTheme(newTheme);
    } catch (err) {
      console.error('Failed to persist theme preference', err);
    }
  };

  const handleFontFamilyChange = async (family: string) => {
    setFontFamilyState(family);
    applyFontToDocument(family, fontSize);
    try {
      await apiFontFamily(family);
    } catch (err) {
      console.error('Failed to persist font family', err);
    }
  };

  const handleFontSizeChange = async (size: string) => {
    setFontSizeState(size);
    applyFontToDocument(fontFamily, size);
    try {
      await apiFontSize(size);
    } catch (err) {
      console.error('Failed to persist font size', err);
    }
  };

  const loadTools = useCallback(async () => {
    try {
      const data = await getCliTools();
      setTools(data);
      // Extract categories from tools data — categories are stored separately
      // but we'll drive them from the API
    } catch { /* handled in child */ }
  }, []);

  // Load categories separately via a core-level query
  // We piggyback on tool data since categories are in the same config
  const refreshAll = useCallback(async () => {
    try {
      const data = await getCliTools();
      setTools(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // We need categories too — since the backend doesn't expose a standalone
    // get_categories command, we use the storage directly via the tool data.
    // Let's add a get_categories Tauri command wrapper via dynamic invoke
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<{ id: string; name: string; description: string }[]>('get_categories')
        .then(cats => setCategories(cats))
        .catch(() => {
          // Fallback: derive from tools (categories were added by create_category)
          // This path used only if get_categories not registered
        });
    });
    loadTools();
  }, [loadTools]);

  useEffect(() => {
    getTheme()
      .then((t) => {
        if (t === 'dark' || t === 'day') {
          setThemeState(t);
          document.body.className = `theme-${t}`;
        }
      })
      .catch(() => {});
  }, []);

  // Load persisted font settings on startup
  useEffect(() => {
    Promise.all([getFontFamily(), getFontSize()])
      .then(([family, size]) => {
        setFontFamilyState(family);
        setFontSizeState(size);
        applyFontToDocument(family, size);
      })
      .catch(() => {});
  }, []);

  const handleCategoriesChange = useCallback(async () => {
    await refreshAll();
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<Category[]>('get_categories').then(cats => setCategories(cats)).catch(() => {});
    });
  }, [refreshAll]);

  const handleInstanceLaunched = useCallback(
    (instanceId: string, template: Template, tool: CliTool) => {
      const inst: RunningInstance = {
        instance_id: instanceId,
        template,
        tool,
        status: 'running',
        logs: [],
        started_at: new Date(),
      };
      setInstances(prev => [...prev, inst]);
      setPage('instances');
    },
    []
  );

  const runningCount = instances.filter(i => i.status === 'running').length;

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ paddingBottom: '16px' }}>
          <img src={logoIcon} style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} alt="CliMaster" />
          <div style={{ flexGrow: 1 }}>
            <div className="sidebar-logo-text">CliMaster</div>
            <div className="sidebar-logo-badge">{t('nav.logoSubtitle')}</div>
          </div>
        </div>

        <NavItem icon={Icons.terminal} label={t('nav.cliTools')} page="dashboard" current={page} badge={tools.length || undefined} onClick={() => setPage('dashboard')} />
        <NavItem icon={Icons.tag} label={t('nav.categories')} page="categories" current={page} badge={categories.length || undefined} onClick={() => setPage('categories')} />
        <NavItem icon={Icons.env} label={t('nav.envVars')} page="env" current={page} onClick={() => setPage('env')} />
        <NavItem icon={Icons.play} label={t('nav.templates')} page="templates" current={page} onClick={() => setPage('templates')} />
        <NavItem icon={Icons.instance} label={t('nav.instances')} page="instances" current={page} badge={runningCount || undefined} onClick={() => setPage('instances')} />
        <NavItem icon={Icons.settings} label={t('nav.settings')} page="settings" current={page} onClick={() => setPage('settings')} />

        {/* Bottom status */}
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{t('nav.stats.tools')}</span><span style={{ color: 'var(--text-secondary)' }}>{tools.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{t('nav.stats.running')}</span>
              <span style={{ color: runningCount > 0 ? 'var(--accent-emerald)' : 'var(--text-secondary)' }}>
                {runningCount}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('nav.stats.categories')}</span><span style={{ color: 'var(--text-secondary)' }}>{categories.length}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="main-content">
        {page === 'dashboard' && (
          <Dashboard
            categories={categories}
            onToolsChange={refreshAll}
            onSelectTool={setSelectedTool}
            selectedToolId={selectedTool?.id}
          />
        )}
        {page === 'categories' && (
          <CategoriesPage
            categories={categories}
            tools={tools}
            onCategoriesChange={handleCategoriesChange}
          />
        )}
        {page === 'env' && (
          <EnvVarsPage />
        )}
        {page === 'templates' && (
          <TemplatesPage
            tools={tools}
            onInstanceLaunched={handleInstanceLaunched}
          />
        )}
        {page === 'instances' && (
          <InstancesPage
            instances={instances}
            onInstancesChange={setInstances}
          />
        )}
        {page === 'settings' && (
          <SettingsPage
            theme={theme}
            onThemeChange={handleThemeChange}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onFontFamilyChange={handleFontFamilyChange}
            onFontSizeChange={handleFontSizeChange}
          />
        )}
      </main>
    </div>
  );
}

export default function Root() {
  return (
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  );
}
