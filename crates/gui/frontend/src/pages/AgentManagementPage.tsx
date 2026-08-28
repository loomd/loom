import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAgentDiscoveryStatus, fetchProviderModels, configureOpencodeProvider, triggerInjectLoomSkills, getInjectedSkillPaths, getLoomSkillVersion, installLoomCli, getLoomCliStatus, getTemplates, createTemplate, importCliTool, getCliTools, openUrl } from '../api';
import type { AgentDiscoveryStatus, CliInstallStatus, FetchedModel } from '../types';
import { useToast } from '../ToastContext';

interface AgentManagementPageProps {
  onOpenTerminal?: (cmd: string) => void;
  /** 页面是否处于激活状态（用于切回页面时重新检测环境） */
  active?: boolean;
}

export const AgentManagementPage: React.FC<AgentManagementPageProps> = ({ onOpenTerminal, active }) => {
  const toast = useToast();

  const [discovery, setDiscovery] = useState<AgentDiscoveryStatus | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [injectingSkill, setInjectingSkill] = useState<boolean>(false);
  const [injectedPaths, setInjectedPaths] = useState<string[]>([]);
  const [skillVersion, setSkillVersion] = useState<string>('0.6.9');
  const [cliStatus, setCliStatus] = useState<CliInstallStatus | null>(null);
  const [installingCli, setInstallingCli] = useState<boolean>(false);

  // Provider config states
  const [providerId, setProviderId] = useState<string>('loom');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [models, setModels] = useState<FetchedModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [configuring, setConfiguring] = useState<boolean>(false);

  const loadSkillPaths = useCallback(async () => {
    try {
      const paths = await getInjectedSkillPaths();
      setInjectedPaths(paths);
    } catch {
      // ignore
    }
  }, []);

  const loadDiscovery = useCallback(async () => {
    try {
      const res = await getAgentDiscoveryStatus();
      setDiscovery(res);
    } catch (err) {
      toast.error(err?.toString() || '加载 Agent 发现状态失败');
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    // 每次页面激活（含首次挂载）时重新检测环境，保证安装 node 后返回本页能实时刷新
    if (active) {
      getAgentDiscoveryStatus()
        .then(res => {
          if (!cancelled) setDiscovery(res);
        })
        .catch(err => {
          if (!cancelled) toast.error(err?.toString() || '加载 Agent 发现状态失败');
        });
    }

    getInjectedSkillPaths()
      .then(paths => {
        if (!cancelled) setInjectedPaths(paths);
      })
      .catch(() => {});

    getLoomSkillVersion()
      .then(v => {
        if (!cancelled) setSkillVersion(v);
      })
      .catch(() => {});

    getLoomCliStatus()
      .then(s => {
        if (!cancelled) setCliStatus(s);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [active, toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadDiscovery();
    } finally {
      setRefreshing(false);
    }
  };

  const handleInjectSkills = async () => {
    setInjectingSkill(true);
    try {
      const updatedCount = await triggerInjectLoomSkills();
      await loadSkillPaths();
      toast.success(`Skill 注入/检查完成！修改或更新了 ${updatedCount} 个文件`);
    } catch (err: unknown) {
      toast.error(`Skill 注入失败: ${err}`);
    } finally {
      setInjectingSkill(false);
    }
  };

  const handleInstallCli = async () => {
    setInstallingCli(true);
    try {
      const s = await installLoomCli();
      setCliStatus(s);
      toast.success(`loom CLI v${s.version} 安装成功`);
    } catch (err: unknown) {
      toast.error(`loom CLI 安装失败: ${err}`);
    } finally {
      setInstallingCli(false);
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      toast.error('请输入 Base URL');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetchProviderModels(baseUrl, apiKey);
      setModels(res);
      if (res.length > 0) {
        setSelectedModels([res[0].id]);
        toast.success(`获取成功！检索到 ${res.length} 个可用模型`);
      } else {
        toast.error('未检索到任何可用模型，请检查 Base URL / Key');
      }
    } catch (err: unknown) {
      toast.error(`模型拉取失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleToggleModel = (id: string) => {
    setSelectedModels(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSelectAllModels = () => {
    if (selectedModels.length === models.length) {
      setSelectedModels([]);
    } else {
      setSelectedModels(models.map(m => m.id));
    }
  };

  const handleSaveConfig = async () => {
    if (!providerId.trim() || !baseUrl.trim() || selectedModels.length === 0) {
      toast.error('请完整填写 Provider、Base URL 并至少选择一个模型');
      return;
    }

    setConfiguring(true);
    try {
      await configureOpencodeProvider(providerId, baseUrl, apiKey, selectedModels);
      toast.success(`已自动写入 opencode.json 配置文件！(已配置 ${selectedModels.length} 个模型)`);

      const cliTools = await getCliTools();
      const opencodeAgent = discovery?.agents.find(a => a.name.toLowerCase().includes('opencode'));
      if (opencodeAgent?.executable_path) {
        const existingTool = cliTools.find(t => t.name.toLowerCase() === 'opencode' || t.path === opencodeAgent.executable_path);
        let targetToolId = existingTool?.id;

        if (!targetToolId) {
          const imported = await importCliTool(opencodeAgent.executable_path);
          targetToolId = imported.id;
        }

        const existingTemplates = await getTemplates();
        for (const model of selectedModels) {
          const tplName = `opencode ${model}`;
          const existing = existingTemplates.find(t => t.cli_id === targetToolId && t.name === tplName);
          if (!existing) {
            await createTemplate(
              targetToolId,
              tplName,
              ['--model', `${providerId}/${model}`],
              {},
              [],
              undefined,
              'inherit'
            );
          }
        }
        toast.success(`已自动创建/同步 ${selectedModels.length} 个 Agent 运行模板！`);
        window.dispatchEvent(new Event('loom-refresh-data'));
      }
    } catch (err: unknown) {
      toast.error(`配置失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div data-tauri-drag-region style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', color: 'var(--text-primary)' }}>
      <div data-tauri-drag-region style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h1
            data-tauri-drag-region
            onMouseDown={(e) => {
              if (e.button === 0) {
                getCurrentWindow().startDragging();
              }
            }}
            style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', userSelect: 'none', cursor: 'default' }}
          >配置引导</h1>
          <p data-tauri-drag-region style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
            安装opencode 自动注入模型与配置agent
          </p>
          {cliStatus?.installed && injectedPaths.length > 0 && (
            <div className="rainbow-wave-banner" style={{ marginTop: '10px' }}>
              <span className="rainbow-wave-text">
                ✨ 当前已支持Agent直接配置loom，欢迎使用
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '5px 14px',
            borderRadius: 'var(--radius-sm, 4px)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            cursor: refreshing ? 'default' : 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            flexShrink: 0,
            transition: 'background 0.2s'
          }}
        >
          {refreshing ? '检测中...' : '重新检测'}
        </button>
      </div>

      <div className="guide-grid">
        {/* Left Column: Environment Discovery */}
        <section style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)' }}>
            环境检测
          </h2>
          {!discovery ? (
            <div style={{ color: 'var(--text-secondary)' }}>检测中...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>loom CLI 全局命令</h3>
                    {cliStatus && cliStatus.version && (
                      <span className="badge badge-emerald" style={{ fontSize: '11px', fontFamily: 'monospace' }}>v{cliStatus.version}</span>
                    )}
                  </div>
                  <button
                    onClick={handleInstallCli}
                    disabled={installingCli || cliStatus?.is_dev}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm, 4px)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      cursor: cliStatus?.is_dev ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      opacity: cliStatus?.is_dev ? 0.6 : 1,
                      transition: 'background 0.2s'
                    }}
                  >
                    {installingCli ? '正在安装...' : cliStatus?.is_dev ? 'dev 环境' : '安装 / 修复'}
                  </button>
                </div>
                {cliStatus?.is_dev ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    dev 环境，无法操作（发布版安装后自动注入全局 CLI）
                  </div>
                ) : cliStatus?.installed ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '8px' }}>
                    {cliStatus.cli_path}
                    {cliStatus.bundled_version && cliStatus.version !== cliStatus.bundled_version && (
                      <span style={{ display: 'block', color: '#f59e0b', marginTop: '4px' }}>
                        内置版本 v{cliStatus.bundled_version} 与已装版本 v{cliStatus.version} 不一致，可点击“安装 / 修复”更新
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    未检测到全局 loom CLI，请点击右侧“安装 / 修复”使其进入 PATH
                  </div>
                )}
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>loom skill自动注入</h3>
                    <span className="badge badge-emerald" style={{ fontSize: '11px', fontFamily: 'monospace' }}>v{skillVersion}</span>
                  </div>
                  <button
                    onClick={handleInjectSkills}
                    disabled={injectingSkill}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-sm, 4px)',
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      transition: 'background 0.2s'
                    }}
                  >
                    {injectingSkill ? '正在注入...' : '手动注入'}
                  </button>
                </div>
                {injectedPaths.length > 0 ? (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {injectedPaths.map(p => (
                      <div key={p} style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {p}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    未检测到已注入的 Skill 目录，请点击右侧“手动注入”
                  </div>
                )}
              </div>

              <div style={{ padding: '16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>node / npm 环境</h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    background: discovery.npm_installed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: discovery.npm_installed ? 'var(--accent-emerald, #10b981)' : '#f59e0b',
                    border: `1px solid ${discovery.npm_installed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                  }}>
                    {discovery.npm_installed ? '已就绪' : '未检测到'}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                  {discovery.npm_installed ? `路径: ${discovery.npm_path}` : '未检测到全局 npm 包管理器，建议先安装 Node.js'}
                </p>
                {!discovery.npm_installed && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button
                      onClick={() => onOpenTerminal?.(discovery.node_install_command)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        background: 'var(--accent-primary, #3b82f6)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      点击安装
                    </button>
                    <button
                      onClick={() => openUrl(discovery.node_download_url)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-link, #3b82f6)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        alignSelf: 'center',
                        textDecoration: 'none'
                      }}
                    >
                      查看官方文档
                    </button>
                  </div>
                )}
              </div>

              {discovery.agents.map((agent) => (
                <div key={agent.name} style={{ padding: '16px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px' }}>{agent.name}</h3>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      background: agent.installed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: agent.installed ? 'var(--accent-emerald, #10b981)' : '#f59e0b',
                      border: `1px solid ${agent.installed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                    }}>
                      {agent.installed ? '已就绪' : '未检测到'}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0' }}>
                    {agent.installed ? `路径: ${agent.executable_path}` : `建议命令: ${agent.install_command}`}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    {!agent.installed && (
                      discovery.npm_installed ? (
                        <button
                          onClick={() => onOpenTerminal?.(agent.install_command)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--accent-primary, #3b82f6)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          点击安装
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            background: 'var(--border-subtle)',
                            color: 'var(--text-tertiary)',
                            border: 'none',
                            cursor: 'not-allowed'
                          }}
                        >
                          需先安装 Node.js
                        </button>
                      )
                    )}
                    <button
                      onClick={() => openUrl(agent.download_url)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-link, #3b82f6)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        alignSelf: 'center',
                        textDecoration: 'none'
                      }}
                    >
                      查看官方文档
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: opencode Model Configuration */}
        <section style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--accent-primary, #3b82f6)', fontWeight: 600 }}>opencode</span> 模型自动配置
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: 500, color: 'var(--text-secondary)' }}>Provider 标识</label>
              <input
                type="text"
                value={providerId}
                onChange={e => setProviderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
                placeholder="例如 loom, deepseek, siliconflow"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: 500, color: 'var(--text-secondary)' }}>Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
                placeholder="https://api.openai.com/v1 或兼容端点"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', marginBottom: '6px', fontWeight: 500, color: 'var(--text-secondary)' }}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
                placeholder="sk-..."
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleFetchModels}
                disabled={fetchingModels}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                {fetchingModels ? '拉取中...' : '获取模型列表'}
              </button>
            </div>

            {models.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    选择模型 ({selectedModels.length}/{models.length})
                  </label>
                  <button
                    onClick={handleSelectAllModels}
                    style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm, 4px)',
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {selectedModels.length === models.length ? '取消全选' : '全选'}
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    background: 'var(--bg-input)',
                    padding: '8px'
                  }}
                >
                  {models.map(m => {
                    const checked = selectedModels.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: checked ? 'var(--bg-elevated)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          userSelect: 'none'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleModel(m.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name || m.id}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {models.length > 0 && (
              <button
                onClick={handleSaveConfig}
                disabled={configuring}
                style={{
                  marginTop: '12px',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'var(--accent-emerald, #10b981)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {configuring ? '保存并绑定中...' : '写入 opencode.json & 自动创建 Loom 运行模板'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};