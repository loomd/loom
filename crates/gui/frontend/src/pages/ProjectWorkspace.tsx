import React, { useState, useEffect, useCallback } from 'react';
import { 
  getProjectAgents, 
  spawnProjectAgent, 
  killAgentProcess,
  bringAgentToForeground,
  getCliTools,
  getTemplates,
  getGlobalEnvVars,
  onStatusEvent
} from '../api';
import type { Project, AgentInstance, CliTool, Template } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface Props {
  project: Project;
  onUnregisterProject: (proj: Project) => void;
}

export default function ProjectWorkspace({ project, onUnregisterProject }: Props) {
  const { t } = useI18n();
  const toast = useToast();

  const [activeAgents, setActiveAgents] = useState<AgentInstance[]>([]);
  const [cliTools, setCliTools] = useState<CliTool[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateLaunching, setTemplateLaunching] = useState<string | null>(null);

  // Fetch agents for project
  const refreshAgents = useCallback(async () => {
    try {
      const list = await getProjectAgents(project.id);
      const active = list.filter(a => a.status === 'running')
        .sort((a, b) => b.start_time.localeCompare(a.start_time));
      setActiveAgents(active);
    } catch (e) {
      console.error('Failed to fetch project agents', e);
    }
  }, [project.id]);

  // Load tools & templates
  const loadToolsAndTemplates = useCallback(async () => {
    try {
      const toolsData = await getCliTools();
      setCliTools(toolsData);
      
      const templatesData = await getTemplates();
      setTemplates(templatesData);
    } catch (e) {
      console.error('Failed to load tools and templates', e);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshAgents();
      loadToolsAndTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [project.id, refreshAgents, loadToolsAndTemplates]);

  // Status Event Listeners
  useEffect(() => {
    let unlistenStatus: (() => void) | undefined;

    onStatusEvent(() => {
      refreshAgents();
    }).then(fn => { unlistenStatus = fn; });

    return () => {
      if (unlistenStatus) unlistenStatus();
    };
  }, [refreshAgents]);

  // Kill agent process
  const handleKill = async (agent: AgentInstance) => {
    try {
      setActiveAgents(prev => prev.filter(a => a.id !== agent.id));

      await killAgentProcess(agent.id);
      toast.success(t('inst.toast.terminated'));
      setTimeout(refreshAgents, 300);
    } catch (err) {
      toast.error(String(err) || 'Failed to terminate agent');
      refreshAgents();
    }
  };

  // Run Template in project context
  const handleRunTemplate = async (tpl: Template) => {
    const tool = cliTools.find(t => t.id === tpl.cli_id);
    if (!tool) {
      toast.error('CLI Tool not found');
      return;
    }

    setTemplateLaunching(tpl.id);
    try {
      // Gather merged environment variables (tool's custom env, template global env, template env overrides)
      const globalVars = await getGlobalEnvVars();
      const customEnvs: Record<string, string> = { ...tool.custom_env };
      
      for (const gvId of tpl.env_var_ids) {
        const gv = globalVars.find(v => v.id === gvId);
        if (gv) {
          customEnvs[gv.key] = gv.value;
        }
      }
      
      for (const [k, v] of Object.entries(tpl.env)) {
        customEnvs[k] = v;
      }

      // Spawn it in the project path as a project agent!
      const envMode = tpl.env_mode || 'inherit';
      await spawnProjectAgent(project.id, tool.id, tpl.args, envMode, customEnvs, tpl.pwd);
      toast.success(t('temp.toast.launched') + ': ' + tpl.name);
      
      refreshAgents();
    } catch (e) {
      toast.error(String(e) || t('temp.toast.launchFailed'));
    } finally {
      setTemplateLaunching(null);
    }
  };

  // Helper date/time formatters
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '24px' }}>
      
      {/* ── Project Title & Path Header ────────────────────────── */}
      <div className="header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', padding: '8px 0', border: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {project.name}
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            {project.root_path}
          </span>
        </div>
        
        <button 
          onClick={() => onUnregisterProject(project)}
          style={{
            background: 'none',
            border: '1px solid var(--border-subtle)',
            color: 'var(--accent-red)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background 0.2s'
          }}
          className="btn-ghost"
          title="Unregister project"
        >
          🗑 {t('proj.modal.btn.cancel')}
        </button>
      </div>

      <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        
        {/* ── Quick Spawn Launcher Panel ── */}
        <div className="launcher-card" style={{ backgroundColor: 'transparent', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🚀 {t('proj.launcher.title') || 'Quick Spawn'}
          </h3>
          {templates.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '12px 8px' }}>
              {t('proj.launcher.noTemplates')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => handleRunTemplate(tpl)}
                  disabled={templateLaunching === tpl.id}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-elevated)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                >
                  {templateLaunching === tpl.id ? '⏳' : '🟢'}
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Active Agents Grid ── */}
        <div className="launcher-card" style={{ backgroundColor: 'transparent', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
    </div>
  );
}
