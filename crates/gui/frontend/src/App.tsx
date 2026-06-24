import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { ToastProvider, useToast } from './ToastContext';
import { I18nProvider, useI18n } from './I18nContext';
import SettingsPage from './pages/SettingsPage';
import ProjectWorkspace from './pages/ProjectWorkspace';
import { 
  getTheme, 
  setTheme, 
  getFontFamily, 
  getFontSize, 
  setFontFamily as apiFontFamily, 
  setFontSize as apiFontSize,
  getProjects,
  createProject,
  deleteProject,
  selectDirectory,
  reorderProjects
} from './api';
import logoIcon from './assets/logo.png';
import type { Category, Project } from './types';

type Page = 'workspace' | 'settings';

interface NavItemProps {
  icon: string;
  label: string;
  page: Page;
  current: Page;
  onClick: () => void;
}

function NavItem({ icon, label, current, page, onClick }: NavItemProps) {
  return (
    <button
      className={`nav-item${current === page ? ' active' : ''}`}
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', background: 'none', cursor: 'pointer' }}
      data-page={page}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
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
  const toast = useToast();

  const [page, setPage] = useState<Page>('workspace');
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [theme, setThemeState] = useState<'dark' | 'day'>('dark');
  const [fontFamily, setFontFamilyState] = useState('Plus Jakarta Sans');
  const [fontSize, setFontSizeState] = useState('14px');
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; latestVersion: string; url: string; error?: boolean } | null>(null);

  // Silent auto-update check on startup
  useEffect(() => {
    const performUpdateCheck = async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const currentVersion = await getVersion();
        
        const response = await fetch('https://api.github.com/repos/GoldTest/Loom/releases/latest', {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const latestVersion = data.tag_name;
          const url = data.html_url;
          
          const cleanV1 = currentVersion.replace(/^v/, '');
          const cleanV2 = latestVersion.replace(/^v/, '');
          const parts1 = cleanV1.split('.').map((p: string) => parseInt(p, 10) || 0);
          const parts2 = cleanV2.split('.').map((p: string) => parseInt(p, 10) || 0);
          
          let hasNew = false;
          const maxLength = Math.max(parts1.length, parts2.length);
          for (let i = 0; i < maxLength; i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;
            if (num2 > num1) {
              hasNew = true;
              break;
            } else if (num2 < num1) {
              break;
            }
          }
          
          setUpdateInfo({
            hasUpdate: hasNew,
            latestVersion,
            url
          });
        } else {
          setUpdateInfo({
            hasUpdate: false,
            latestVersion: '',
            url: '',
            error: true
          });
        }
      } catch (err) {
        console.error('Failed to perform silent update check:', err);
        setUpdateInfo({
          hasUpdate: false,
          latestVersion: '',
          url: '',
          error: true
        });
      }
    };
    
    const timer = setTimeout(() => {
      performUpdateCheck();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  // Register project modal states
  const [showModal, setShowModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjPath, setNewProjPath] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch projects list
  const fetchProjects = useCallback(async () => {
    try {
      const projs = await getProjects();
      setProjects(projs);
      if (projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e) {
      toast.error(String(e) || 'Failed to fetch projects');
    }
  }, [selectedProjectId, toast]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === index) return;
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }

    const updated = [...projects];
    const item = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, item);
    
    setProjects(updated);
    setDraggedIndex(null);
    
    try {
      const ids = updated.map(p => p.id);
      await reorderProjects(ids);
    } catch (err) {
      toast.error('Failed to save project order');
      fetchProjects();
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Load categories
  const loadCategories = useCallback(async () => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<Category[]>('get_categories')
        .then(cats => setCategories(cats))
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjects();
      loadCategories();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProjects, loadCategories]);

  // Theme, Font startup configurations
  useEffect(() => {
    getTheme()
      .then((t) => {
        if (t === 'dark' || t === 'day') {
          setThemeState(t);
          document.body.className = `theme-${t}`;
        }
      })
      .catch(() => {});

    Promise.all([getFontFamily(), getFontSize()])
      .then(([family, size]) => {
        setFontFamilyState(family);
        setFontSizeState(size);
        applyFontToDocument(family, size);
      })
      .catch(() => {});
  }, []);

  // Global keyboard shortcuts (e.g. Ctrl+A / Cmd+A Select All in inputs/textareas)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          if (active.classList.contains('xterm-helper-textarea')) {
            return;
          }
          e.preventDefault();
          (active as HTMLInputElement | HTMLTextAreaElement).select();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

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

  // Browse Directory folder
  const handleBrowseFolder = async () => {
    try {
      const selected = await selectDirectory();
      if (selected) {
        setNewProjPath(selected);
        if (!newProjName.trim()) {
          const normalized = selected.replace(/\\/g, '/');
          const segments = normalized.split('/').filter(Boolean);
          if (segments.length > 0) {
            setNewProjName(segments[segments.length - 1]);
          }
        }
      }
    } catch {
      toast.error('Failed to open directory browser');
    }
  };

  // Create Project
  const handleRegisterProject = async () => {
    if (!newProjPath.trim()) {
      toast.error('Project root path is required');
      return;
    }

    let resolvedName = newProjName.trim();
    if (!resolvedName) {
      const normalized = newProjPath.trim().replace(/\\/g, '/');
      const segments = normalized.split('/').filter(Boolean);
      if (segments.length > 0) {
        resolvedName = segments[segments.length - 1];
      }
    }
    if (!resolvedName) {
      resolvedName = 'New Project';
    }

    setCreating(true);
    try {
      const proj = await createProject(resolvedName, newProjPath.trim());
      toast.success(t('proj.toast.created'));
      setShowModal(false);
      setNewProjName('');
      setNewProjPath('');
      setProjects(prev => [...prev, proj]);
      setSelectedProjectId(proj.id);
      setPage('workspace');
    } catch (e) {
      toast.error(String(e) || t('proj.toast.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  // Unregister/Delete Project Link
  const handleUnregisterProject = async (proj: Project) => {
    if (!confirm(t('proj.confirm.delete', { name: proj.name }))) return;
    try {
      await deleteProject(proj.id);
      toast.success(t('proj.toast.deleted'));
      setProjects(prev => {
        const updated = prev.filter(p => p.id !== proj.id);
        if (selectedProjectId === proj.id) {
          if (updated.length > 0) {
            setSelectedProjectId(updated[0].id);
          } else {
            setSelectedProjectId('');
          }
        }
        return updated;
      });
    } catch (e) {
      toast.error(String(e) || t('proj.toast.deleteFailed'));
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Logo and Header */}
        <div className="sidebar-logo" style={{ paddingBottom: '16px', borderBottom: 'none' }}>
          <img src={logoIcon} style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} alt="Loom" />
          <div style={{ flexGrow: 1 }}>
            <div className="sidebar-logo-text">Loom</div>
            <div className="sidebar-logo-badge" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }} title={t('nav.logoSubtitle')}>{t('nav.logoSubtitle')}</div>
          </div>
        </div>

        {/* Project Selector List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flexGrow: 1, marginTop: '8px', paddingBottom: '4px' }}>
          {projects.length === 0 ? (
            <div style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No projects linked
            </div>
          ) : (
            projects.map((p, index) => {
              const isActive = page === 'workspace' && selectedProjectId === p.id;
              const isDragging = index === draggedIndex;
              const isDragOver = index === dragOverIndex;
              const showTopLine = isDragOver && draggedIndex !== null && draggedIndex > index;
              const showBottomLine = isDragOver && draggedIndex !== null && draggedIndex < index;
              return (
                <button
                  key={p.id}
                  className={`nav-item${isActive ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setPage('workspace');
                  }}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{ 
                    width: '100%', 
                    textAlign: 'left', 
                    background: isDragging ? 'var(--bg-elevated)' : 'none', 
                    border: isDragging ? '1px dashed var(--accent-purple)' : '1px solid transparent', 
                    boxShadow: showTopLine 
                      ? '0 -2px 0 0 var(--accent-purple)' 
                      : showBottomLine 
                        ? '0 2px 0 0 var(--accent-purple)' 
                        : 'none',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    opacity: isDragging ? 0.4 : 1,
                    transform: isDragging ? 'scale(0.96)' : 'none',
                    transition: 'opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.1s ease'
                  }}
                >
                  <span className="nav-icon" style={{ 
                    pointerEvents: draggedIndex !== null ? 'none' : 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '18px',
                    transform: 'none'
                  }}>📁</span>
                  <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flexGrow: 1,
                    fontWeight: isActive ? 600 : 400,
                    pointerEvents: draggedIndex !== null ? 'none' : 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    lineHeight: '1.2'
                  }}>
                    {p.name}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Plus button & Settings at the bottom */}
        <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '2px' }}>
          <div style={{ flexGrow: 1 }}>
            <NavItem 
              icon="⚙️" 
              label={t('nav.settings')} 
              page="settings" 
              current={page} 
              onClick={() => setPage('settings')} 
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="sidebar-add-btn"
            style={{ marginRight: '-6px' }}
            title={t('proj.sidebar.add')}
          >
            ＋
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="main-content">
        <div style={{ display: page === 'workspace' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {projects.length === 0 ? (
            <div className="empty-state-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)', textAlign: 'center', margin: '40px auto', maxWidth: '600px' }}>
              <div style={{ fontSize: '3rem' }}>📁</div>
              <h2>{t('proj.empty.noProjects')}</h2>
              <p style={{ maxWidth: '400px', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                {t('proj.empty.desc')}
              </p>
              <button className="btn-primary" onClick={() => setShowModal(true)}>
                {t('proj.btn.new')}
              </button>
            </div>
          ) : (
            projects.map(p => (
              <div
                key={p.id}
                style={{
                  display: p.id === selectedProjectId ? 'flex' : 'none',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden'
                }}
              >
                <ProjectWorkspace 
                  project={p} 
                  isVisible={p.id === selectedProjectId}
                  onUnregisterProject={handleUnregisterProject}
                />
              </div>
            ))
          )}
        </div>
        
        <div style={{ display: page === 'settings' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <SettingsPage
            theme={theme}
            onThemeChange={handleThemeChange}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onFontFamilyChange={handleFontFamilyChange}
            onFontSizeChange={handleFontSizeChange}
            updateInfo={updateInfo}
          />
        </div>
      </main>

      {/* Register Project Modal */}
      {showModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ backgroundColor: 'var(--bg-modal)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', width: '90%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              {t('proj.modal.newTitle')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('proj.modal.name')}</label>
              <input 
                type="text"
                placeholder={t('proj.modal.namePlaceholder')}
                value={newProjName}
                onChange={e => setNewProjName(e.target.value)}
                style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('proj.modal.path')}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text"
                  placeholder={t('proj.modal.pathPlaceholder')}
                  value={newProjPath}
                  onChange={e => setNewProjPath(e.target.value)}
                  style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', outline: 'none', flexGrow: 1 }}
                />
                <button 
                  type="button"
                  className="btn-secondary"
                  onClick={handleBrowseFolder}
                  style={{ padding: '8px 12px', whiteSpace: 'nowrap', backgroundColor: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                >
                  📁 Browse...
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
              >
                {t('proj.modal.btn.cancel')}
              </button>
              <button 
                className="btn-primary" 
                onClick={handleRegisterProject}
                disabled={creating}
                style={{ padding: '8px 16px' }}
              >
                {creating ? 'Registering...' : t('proj.modal.btn.create')}
              </button>
            </div>
          </div>
        </div>
      )}
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
