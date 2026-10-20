import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getGitStatus, pullGitProject } from '../api';
import type { GitProjectStatus } from '../types';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface Props {
  projectPath: string;
  active?: boolean;
}

// 模块级状态缓存：保留每个项目路径最近一次的检测结果，切换时第 1 帧秒级展示，杜绝闪烁消失
const gitStatusCache = new Map<string, GitProjectStatus>();

export const GitStatusBar: React.FC<Props> = ({ projectPath, active = true }) => {
  const { t } = useI18n();
  const toast = useToast();

  // 初始状态优先从缓存中同步读取
  const [status, setStatus] = useState<GitProjectStatus | null>(() => {
    return projectPath ? gitStatusCache.get(projectPath) || null : null;
  });
  const [checking, setChecking] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const wasActiveRef = useRef<boolean>(active);

  // 容器宽度监听：当宽度小于 540px 时自适应切换为紧凑文案
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setIsCompact(entry.contentRect.width < 540);
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  const loadStatus = useCallback(async (fetchRemote: boolean) => {
    if (!projectPath) return;
    setChecking(fetchRemote);
    try {
      const res = await getGitStatus(projectPath, fetchRemote);
      if (isMountedRef.current) {
        gitStatusCache.set(projectPath, res);
        setStatus(res);
      }
    } catch (e) {
      console.warn('Failed to load git status:', e);
    } finally {
      if (isMountedRef.current) {
        setChecking(false);
      }
    }
  }, [projectPath]);

  // 项目路径变化时静默更新状态，平滑保留已有显示，绝不强制置空
  useEffect(() => {
    let cancelled = false;

    // 后台静默读取本地 git 状态
    getGitStatus(projectPath, false)
      .then((res) => {
        if (!cancelled) {
          gitStatusCache.set(projectPath, res);
          setStatus(res);
          // 若为 git 项目，静默联网 fetch 一次更新
          if (res.is_git) {
            loadStatus(true);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectPath, loadStatus]);

  // 当从非激活态（切到终端/其他标签/外部页面）切换回激活态（概览）时，自动静默刷新一次
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      // 先秒级拉取本地状态（立即感知终端刚做完的 commit / checkout / 本地改动）
      getGitStatus(projectPath, false)
        .then((res) => {
          if (isMountedRef.current) {
            gitStatusCache.set(projectPath, res);
            setStatus(res);
            if (res.is_git) {
              loadStatus(true);
            }
          }
        })
        .catch(() => {});
    }
    wasActiveRef.current = active;
  }, [active, projectPath, loadStatus]);

  const handleManualCheck = () => {
    if (checking || pulling) return;
    loadStatus(true);
  };

  const handlePull = async () => {
    if (pulling || !projectPath) return;
    setPulling(true);
    try {
      const res = await pullGitProject(projectPath);
      if (!isMountedRef.current) return;
      if (res.success) {
        toast.success(t('proj.git.pullSuccess') || 'Update successful');
        if (res.status) {
          gitStatusCache.set(projectPath, res.status);
          setStatus(res.status);
        } else {
          loadStatus(false);
        }
      } else {
        toast.error(`${t('proj.git.pullFailed') || 'Update failed'}: ${res.message}`);
        if (res.status) {
          gitStatusCache.set(projectPath, res.status);
          setStatus(res.status);
        }
      }
    } catch (e) {
      if (isMountedRef.current) {
        toast.error(`${t('proj.git.pullFailed') || 'Update failed'}: ${String(e)}`);
      }
    } finally {
      if (isMountedRef.current) {
        setPulling(false);
      }
    }
  };

  // 如果非 Git 仓库，优雅隐藏该栏目，不侵占任何空间
  if (!status || !status.is_git) {
    return null;
  }

  const hasUpdate = status.behind > 0;

  return (
    <div
      ref={containerCallbackRef}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isCompact ? '4px 8px' : '5px 12px',
        borderRadius: 'var(--radius-sm, 6px)',
        border: hasUpdate
          ? '1px solid rgba(99, 102, 241, 0.4)'
          : '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        backgroundColor: hasUpdate
          ? 'rgba(99, 102, 241, 0.08)'
          : 'var(--bg-elevated, rgba(255, 255, 255, 0.03))',
        fontSize: '0.8rem',
        color: 'var(--text-secondary, #a1a1aa)',
        flexShrink: 0,
        gap: '6px 10px',
        minHeight: '34px',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s, background-color 0.2s, padding 0.2s',
      }}
    >
      {/* 左侧：分支信息与状态徽章 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        {/* 分支标识胶囊 */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            padding: '2px 7px',
            borderRadius: '4px',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
          title={
            status.upstream
              ? `${status.branch || 'HEAD'} → ${status.upstream}`
              : status.branch || 'HEAD'
          }
        >
          {/* Git 分支矢量图标 */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              color: hasUpdate ? 'var(--accent-purple, #818cf8)' : 'var(--text-secondary, #a1a1aa)',
            }}
          >
            <line x1="5" y1="3" x2="5" y2="13" />
            <circle cx="5" cy="3" r="2" />
            <circle cx="5" cy="13" r="2" />
            <path d="M5 8c3 0 6 1 6 4" />
            <circle cx="11" cy="12" r="2" />
          </svg>

          {/* 分支名称 */}
          <span
            style={{
              fontWeight: 600,
              color: 'var(--text-primary, #f4f4f5)',
              fontFamily: 'monospace',
              fontSize: '0.76rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: isCompact ? '100px' : '150px',
            }}
          >
            {status.branch || 'HEAD'}
          </span>

          {/* 远端分支追踪信息：统一使用 @ 前缀展示 */}
          {status.upstream && (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-tertiary, #71717a)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: isCompact ? '90px' : '150px',
              }}
            >
              @{status.upstream.replace(/^refs\/remotes\//, '')}
            </span>
          )}
        </div>

        {/* 状态徽标：有修改 */}
        {status.is_dirty && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              color: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              padding: '1px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
            title={t('proj.git.dirty') || '有修改'}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                flexShrink: 0,
              }}
            />
            {t('proj.git.dirty') || '有修改'}
          </span>
        )}

        {/* 状态徽标：超前本地提交 */}
        {status.ahead > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '0.72rem',
              color: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              padding: '1px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
            title={t('proj.git.ahead', { n: status.ahead })}
          >
            {isCompact ? `↑ ${status.ahead}` : `↑ ${t('proj.git.ahead', { n: status.ahead })}`}
          </span>
        )}

        {/* 状态徽标：落后远端提交（有更新） */}
        {hasUpdate ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontWeight: 600,
              fontSize: '0.74rem',
              color: 'var(--accent-purple, #818cf8)',
              backgroundColor: 'rgba(99, 102, 241, 0.18)',
              padding: '1px 7px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
            title={t('proj.git.behind', { n: status.behind })}
          >
            {isCompact ? `↓ ${status.behind}` : `↓ ${t('proj.git.behind', { n: status.behind })}`}
          </span>
        ) : (
          !status.is_dirty &&
          status.upstream && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.72rem',
                color: 'var(--text-tertiary, #71717a)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  opacity: 0.8,
                  flexShrink: 0,
                }}
              />
              <span title={t('proj.git.upToDate') || '最新'}>
                {t('proj.git.upToDate') || '最新'}
              </span>
            </span>
          )
        )}
      </div>

      {/* 右侧：操作按钮组 */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          marginLeft: 'auto',
        }}
      >
        {/* 检查更新按钮：空间充足为「检查更新」，窄屏紧凑为「检查」 */}
        <button
          type="button"
          onClick={handleManualCheck}
          disabled={checking || pulling}
          title={t('proj.git.check') || 'Check Updates'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            height: '24px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary, #a1a1aa)',
            cursor: checking || pulling ? 'not-allowed' : 'pointer',
            fontSize: '0.72rem',
            opacity: checking ? 0.6 : 1,
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!checking && !pulling) {
              e.currentTarget.style.color = 'var(--text-primary, #f4f4f5)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary, #a1a1aa)';
            e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255,255,255,0.12))';
          }}
        >
          {/* 刷新旋转图标 */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: checking ? 'spin 1s linear infinite' : 'none',
              flexShrink: 0,
            }}
          >
            <path d="M2.5 8a5.5 5.5 0 0 1 9.39-3.89L13.5 5.5" />
            <path d="M13.5 2v3.5H10" />
            <path d="M13.5 8a5.5 5.5 0 0 1-9.39 3.89L2.5 10.5" />
            <path d="M2.5 14v-3.5H6" />
          </svg>
          <span>
            {checking
              ? isCompact
                ? (t('proj.git.checkingCompact') || '检查中...')
                : (t('proj.git.checking') || '检查中...')
              : isCompact
              ? (t('proj.git.checkCompact') || '检查')
              : (t('proj.git.check') || '检查更新')}
          </span>
        </button>

        {/* 一键更新按钮：空间充足为「一键更新」，窄屏紧凑为「更新」 */}
        {hasUpdate && (
          <button
            type="button"
            onClick={handlePull}
            disabled={pulling}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 9px',
              height: '24px',
              borderRadius: '4px',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              backgroundColor: 'var(--accent-purple, #6366f1)',
              color: '#ffffff',
              cursor: pulling ? 'not-allowed' : 'pointer',
              fontSize: '0.72rem',
              fontWeight: 600,
              boxShadow: '0 1px 3px rgba(99, 102, 241, 0.35)',
              opacity: pulling ? 0.7 : 1,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!pulling) e.currentTarget.style.backgroundColor = '#4f46e5';
            }}
            onMouseLeave={(e) => {
              if (!pulling) e.currentTarget.style.backgroundColor = 'var(--accent-purple, #6366f1)';
            }}
          >
            {/* 下载/更新图标 */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
              }}
            >
              <line x1="8" y1="2" x2="8" y2="11" />
              <polyline points="4 7 8 11 12 7" />
              <line x1="3" y1="14" x2="13" y2="14" />
            </svg>
            <span>
              {pulling
                ? isCompact
                  ? (t('proj.git.pullingCompact') || '更新中...')
                  : (t('proj.git.pulling') || '正在更新...')
                : isCompact
                ? (t('proj.git.pullCompact') || '更新')
                : (t('proj.git.pull') || '一键更新')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
