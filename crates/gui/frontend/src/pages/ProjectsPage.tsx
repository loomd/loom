import React, { useState, useEffect, useCallback } from 'react';
import { 
  getProjects, 
  createProject, 
  deleteProject, 
  getProjectAgents, 
  spawnProjectAgent, 
  killAgentProcess,
  bringAgentToForeground,
  getCliTools,
  onStatusEvent,
  onLogEvent,
  selectDirectory,
  getAgentLogs
} from '../api';
import type { Project, AgentInstance, CliTool } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

export default function ProjectsPage() {
  const { t } = useI18n();
  const toast = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeAgents, setActiveAgents] = useState<AgentInstance[]>([]);
  const [cliTools, setCliTools] = useState<CliTool[]>([]);

  // Project registration modal states
  const [showModal, setShowModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjPath, setNewProjPath] = useState('');
  const [creating, setCreating] = useState(false);

  // Spawn launcher states
  const [spawnCommand, setSpawnCommand] = useState('');
  const [spawnArgs, setSpawnArgs] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [customCommand, setCustomCommand] = useState('');
  const [envMode, setEnvMode] = useState<'inherit' | 'isolated'>('inherit');
  const [customEnvsText, setCustomEnvsText] = useState('{\n  "ENV_VAR_NAME": "value"\n}');
  const [spawning, setSpawning] = useState(false);

  // Terminal log modal states
  const [selectedAgentLogs, setSelectedAgentLogs] = useState<{ id: string; command: string; logs: string[] } | null>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Fetch all projects
  const fetchProjects = useCallback(async () => {
    try {
      const projs = await getProjects();
      setProjects(projs);
      if (projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e: any) {
      toast.error(e?.toString() || 'Failed to fetch projects');
    }
  }, [selectedProjectId, toast]);

  // Fetch CLI tools for launcher autocomplete
  const fetchCliTools = useCallback(async () => {
    try {
      const tools = await getCliTools();
      setCliTools(tools);
      if (tools.length > 0 && !spawnCommand && !isCustom) {
        setSpawnCommand(tools[0].name);
      }
    } catch { /* ignore */ }
  }, [spawnCommand, isCustom]);

  // Refresh agents for active project
  const refreshAgents = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const list = await getProjectAgents(selectedProjectId);
      // Sort running first, then sorted by start_time descending
      const active = list.filter(a => a.status === 'running')
        .sort((a, b) => b.start_time.localeCompare(a.start_time));
      setActiveAgents(active);
    } catch (e: any) {
      console.error('Failed to fetch project agents', e);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchProjects();
    fetchCliTools();
  }, []);

  useEffect(() => {
    refreshAgents();
  }, [selectedProjectId, refreshAgents]);

  // Listen to background process events (breathing light status updates & logs)
  useEffect(() => {
    let unlistenStatus: (() => void) | undefined;
    let unlistenLogs: (() => void) | undefined;

    onStatusEvent(() => {
      refreshAgents();
    }).then(fn => { unlistenStatus = fn; });

    onLogEvent((event) => {
      // If we currently have the log terminal open for this instance, append it
      setSelectedAgentLogs(prev => {
        if (prev && prev.id === event.instance_id) {
          return {
            ...prev,
            logs: [...prev.logs, `[${event.stream.toUpperCase()}] ${event.chunk}`]
          };
        }
        return prev;
      });
    }).then(fn => { unlistenLogs = fn; });

    return () => {
      if (unlistenStatus) unlistenStatus();
      if (unlistenLogs) unlistenLogs();
    };
  }, [refreshAgents]);

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
    } catch (e: any) {
      toast.error('Failed to open directory browser');
    }
  };

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
    } catch (e: any) {
      toast.error(e?.toString() || t('proj.toast.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleUnregisterProject = async (proj: Project) => {
    if (!confirm(t('proj.confirm.delete', { name: proj.name }))) return;
    try {
      await deleteProject(proj.id);
      toast.success(t('proj.toast.deleted'));
      setProjects(prev => prev.filter(p => p.id !== proj.id));
      if (selectedProjectId === proj.id) {
        setSelectedProjectId('');
      }
    } catch (e: any) {
      toast.error(e?.toString() || t('proj.toast.deleteFailed'));
    }
  };

  const handleSpawn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    const finalCommand = isCustom ? customCommand : spawnCommand;
    if (!finalCommand.trim()) {
      toast.error('Command cannot be empty');
      return;
    }

    let parsedEnvs: Record<string, string> = {};
    if (envMode === 'isolated') {
      try {
        parsedEnvs = JSON.parse(customEnvsText);
      } catch (err) {
        toast.error('Custom environment variables must be valid JSON');
        return;
      }
    }

    setSpawning(true);
    // Parse arguments by splitting on spaces (respecting simple quotes is out of scope for basic launcher, space is standard)
    const args = spawnArgs.trim() ? spawnArgs.trim().split(/\s+/) : [];

    try {
      await spawnProjectAgent(selectedProjectId, finalCommand.trim(), args, envMode, parsedEnvs);
      toast.success('Agent spawned successfully');
      setSpawnArgs('');
      refreshAgents();
    } catch (err: any) {
      toast.error(err?.toString() || 'Failed to spawn agent');
    } finally {
      setSpawning(false);
    }
  };

  const handleKill = async (agent: AgentInstance) => {
    try {
      setActiveAgents(prev => prev.filter(a => a.id !== agent.id));

      if (selectedAgentLogs && selectedAgentLogs.id === agent.id) {
        setSelectedAgentLogs(null);
      }

      await killAgentProcess(agent.id);
      toast.success(t('inst.toast.terminated'));
      setTimeout(refreshAgents, 300);
    } catch (err: any) {
      toast.error(err?.toString() || 'Failed to terminate agent');
      refreshAgents();
    }
  };

  const formatTime = (epochSecondsStr: string) => {
    try {
      const date = new Date(parseInt(epochSecondsStr) * 1000);
      return date.toLocaleTimeString();
    } catch {
      return epochSecondsStr;
    }
  };

  const calculateDuration = (start: string, end?: string) => {
    if (!end) return '-';
    try {
      const duration = parseInt(end) - parseInt(start);
      if (duration < 60) return `${duration}s`;
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      return `${mins}m ${secs}s`;
    } catch {
      return '-';
    }
  };

  return (
    <div className="projects-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      {/* Header section with Project Selector */}
      <div className="header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)', padding: '16px 24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexGrow: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {t('proj.title')}
            </h1>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
              {t('proj.desc')}
            </span>
          </div>
          
          <select 
            value={selectedProjectId} 
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{ 
              backgroundColor: 'var(--bg-input)', 
              color: 'var(--text-primary)', 
              padding: '8px 16px', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid var(--border-subtle)',
              fontSize: '0.9rem',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '200px',
              marginLeft: '20px'
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {selectedProject && (
            <button 
              onClick={() => handleUnregisterProject(selectedProject)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-red)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                padding: '4px 8px'
              }}
              title="Delete project link"
            >
              🗑 {t('proj.modal.btn.cancel')}
            </button>
          )}
        </div>

        <button 
          className="btn-primary" 
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>＋</span> {t('proj.btn.new')}
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '60px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)', textAlign: 'center' }}>
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
        selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexGrow: 1 }}>
            {/* Quick Spawn Launcher Panel */}
            <form onSubmit={handleSpawn} className="launcher-card" style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚀 {t('proj.launcher.title')}
              </h3>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Command / CLI Tool</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={isCustom ? 'custom' : spawnCommand}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustom(true);
                        } else {
                          setIsCustom(false);
                          setSpawnCommand(val);
                        }
                      }}
                      style={{ 
                        backgroundColor: 'var(--bg-input)', 
                        color: 'var(--text-primary)', 
                        padding: '8px 12px', 
                        borderRadius: 'var(--radius-sm)', 
                        border: '1px solid var(--border-subtle)',
                        flex: '1',
                        outline: 'none'
                      }}
                    >
                      {cliTools.map(tool => (
                        <option key={tool.id} value={tool.name}>{tool.name}</option>
                      ))}
                      <option value="custom">-- Custom Command --</option>
                    </select>
                    {isCustom && (
                      <input 
                        type="text"
                        placeholder={t('proj.launcher.cmdPlaceholder')}
                        value={customCommand}
                        onChange={(e) => setCustomCommand(e.target.value)}
                        style={{ 
                          backgroundColor: 'var(--bg-input)', 
                          color: 'var(--text-primary)', 
                          padding: '8px 12px', 
                          borderRadius: 'var(--radius-sm)', 
                          border: '1px solid var(--border-subtle)',
                          flex: '1.5',
                          outline: 'none'
                        }}
                      />
                    )}
                  </div>
                </div>

                <div style={{ flex: '2 1 350px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Arguments</label>
                  <input
                    type="text"
                    placeholder={t('proj.launcher.argsPlaceholder')}
                    value={spawnArgs}
                    onChange={(e) => setSpawnArgs(e.target.value)}
                    style={{ 
                      backgroundColor: 'var(--bg-input)', 
                      color: 'var(--text-primary)', 
                      padding: '8px 12px', 
                      borderRadius: 'var(--radius-sm)', 
                      border: '1px solid var(--border-subtle)',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Environment Isolation Toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  🌐 {t('proj.launcher.envMode')}
                </label>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="envMode" 
                      value="inherit" 
                      checked={envMode === 'inherit'}
                      onChange={() => setEnvMode('inherit')}
                    />
                    <span>{t('proj.launcher.envMode.inherit')}</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="envMode" 
                      value="isolated" 
                      checked={envMode === 'isolated'}
                      onChange={() => setEnvMode('isolated')}
                    />
                    <span>{t('proj.launcher.envMode.isolated')}</span>
                  </label>
                </div>

                {envMode === 'isolated' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {t('proj.launcher.customEnvs')}
                    </label>
                    <textarea
                      value={customEnvsText}
                      onChange={(e) => setCustomEnvsText(e.target.value)}
                      rows={3}
                      placeholder={t('proj.launcher.customEnvsPlaceholder')}
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={spawning}
                  style={{ padding: '10px 24px', fontWeight: 600 }}
                >
                  {spawning ? 'Spawning...' : t('proj.launcher.btn.spawn')}
                </button>
              </div>
            </form>

            {/* Active Agents Grid */}
            <div className="launcher-card" style={{ backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🟢 {t('proj.agents.activeTitle')} ({activeAgents.length})
              </h3>
              {activeAgents.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '4px 8px' }}>
                  {t('proj.agents.noActive')}
                </div>
              ) : (
                <div className="agents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {activeAgents.map(agent => (
                    <div 
                      key={agent.id} 
                      className="agent-card" 
                      style={{ 
                        backgroundColor: 'var(--bg-elevated)', 
                        padding: '16px', 
                        borderRadius: 'var(--radius-md)', 
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        position: 'relative',
                        transition: 'transform 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onClick={async () => {
                        try {
                          const historical = await getAgentLogs(agent.id);
                          setSelectedAgentLogs({ id: agent.id, command: `${agent.command} ${agent.arguments.join(' ')}`, logs: historical });
                        } catch (err) {
                          setSelectedAgentLogs({ id: agent.id, command: `${agent.command} ${agent.arguments.join(' ')}`, logs: [`[SYSTEM] Failed to load logs: ${err}`] });
                        }
                        try {
                          await bringAgentToForeground(agent.id);
                        } catch (err) {
                          console.error('Failed to bring agent to foreground:', err);
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>
                          {agent.command}
                        </span>
                        {/* Dynamic breathing light status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="status-light running" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }}></span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)' }}>{t('proj.status.running')}</span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('proj.agent.card.pid')}</span>
                          <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{agent.pid || '-'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('proj.agent.card.started')}</span>
                          <span>{formatTime(agent.start_time)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Args</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={agent.arguments.join(' ')}>
                            {agent.arguments.join(' ') || '(none)'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Env</span>
                          <span style={{ fontSize: '0.75rem', color: agent.env_mode === 'isolated' ? 'var(--accent-sky)' : 'var(--text-tertiary)' }}>
                            {agent.env_mode === 'isolated' ? t('proj.launcher.envMode.isolated') : t('proj.launcher.envMode.inherit')}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }} onClick={e => e.stopPropagation()}>
                        <button
                          className="btn-secondary"
                          onClick={async () => {
                            try {
                              const historical = await getAgentLogs(agent.id);
                              setSelectedAgentLogs({ id: agent.id, command: `${agent.command} ${agent.arguments.join(' ')}`, logs: historical });
                            } catch (err) {
                              setSelectedAgentLogs({ id: agent.id, command: `${agent.command} ${agent.arguments.join(' ')}`, logs: [`[SYSTEM] Failed to load logs: ${err}`] });
                            }
                            try {
                              await bringAgentToForeground(agent.id);
                            } catch (err) {
                              console.error('Failed to bring agent to foreground:', err);
                            }
                          }}
                          style={{ padding: '4px 12px', fontSize: '0.85rem', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
                        >
                          📺 {t('proj.launcher.btn.spawn') === '启动 Agent' ? '前台显示' : 'Bring to Front'}
                        </button>
                        <button 
                          className="btn-danger" 
                          onClick={() => handleKill(agent)}
                          style={{ padding: '4px 12px', fontSize: '0.85rem', backgroundColor: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        >
                          {t('proj.agent.card.btn.kill')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

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

      {/* Terminal Log Modal / Console */}
      {selectedAgentLogs && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal-content" style={{ backgroundColor: '#0d1117', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid #30363d', width: '90%', maxWidth: '800px', height: '80%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#c9d1d9', fontFamily: 'monospace' }}>
                Console: {selectedAgentLogs.command}
              </h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {activeAgents.some(a => a.id === selectedAgentLogs.id) && (
                  <button
                    onClick={async () => {
                      const agent = activeAgents.find(a => a.id === selectedAgentLogs.id);
                      if (agent) {
                        await handleKill(agent);
                        setSelectedAgentLogs(null);
                      }
                    }}
                    style={{ backgroundColor: 'var(--accent-red)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    {t('proj.agent.card.btn.kill')}
                  </button>
                )}
                <button 
                  onClick={() => setSelectedAgentLogs(null)}
                  style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div style={{ 
              flexGrow: 1, 
              backgroundColor: '#010409', 
              borderRadius: 'var(--radius-sm)', 
              padding: '12px', 
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: '#8b949e',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {selectedAgentLogs.logs.length === 0 ? (
                <div style={{ color: '#484f58', fontStyle: 'italic' }}>Listening for stdout/stderr logs... (Old logs might not be stored in memory. Open log console during execution to stream live output)</div>
              ) : (
                selectedAgentLogs.logs.map((log, idx) => (
                  <div key={idx} style={{ color: log.startsWith('[STDERR]') ? 'var(--accent-red)' : '#c9d1d9' }}>{log}</div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
