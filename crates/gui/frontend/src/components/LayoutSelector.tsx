import { useEffect, useRef, useState } from 'react';
import type { GridLayout } from '../hooks/useTabs';
import { GRID_LAYOUTS, isCompositeLayout, layoutPreview } from '../hooks/useTabs';
import { useI18n } from '../I18nContext';

interface LayoutOptionProps {
  active: boolean;
  label: string;
  cols: number;
  rows: number;
  areas: string;
  onClick: () => void;
}

function LayoutOption({ active, label, cols, rows, areas, onClick }: LayoutOptionProps) {
  const letters = Array.from(new Set(areas.replaceAll('"', '').split(/\s+/).filter(Boolean)));
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px',
        cursor: 'pointer', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid',
        borderColor: active ? 'var(--accent-emerald, #10b981)' : 'var(--border-subtle, #27272a)',
        backgroundColor: active ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-elevated, #18181b)',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 10px)`, gridTemplateRows: `repeat(${rows}, 10px)`, gap: '2px', gridTemplateAreas: areas }}>
        {letters.map(ch => (
          <div key={ch} style={{ gridArea: ch, minWidth: 0, minHeight: 0, borderRadius: 2, backgroundColor: active ? 'var(--accent-emerald, #10b981)' : 'var(--text-tertiary, #71717a)' }} />
        ))}
      </div>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #a1a1aa)', userSelect: 'none' }}>{label}</span>
    </button>
  );
}

interface LayoutSelectorProps {
  layoutMode: GridLayout | null;
  pendingLayout?: GridLayout | null;
  onRestorePending?: () => void;
  onSelect: (layout: GridLayout | null) => void;
  projectId?: string;
}

export function LayoutSelector({ layoutMode, pendingLayout, onRestorePending, onSelect, projectId }: LayoutSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dirtyLayouts, setDirtyLayouts] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const effectiveMode = layoutMode ?? pendingLayout ?? null;

  useEffect(() => {
    const onDirty = (e: Event) => {
      const { projectId: pid, layout, dirty } = (e as CustomEvent).detail as { projectId?: string; layout: string; dirty: boolean };
      if (pid !== projectId) return;
      setDirtyLayouts(prev => {
        if (prev.has(layout) === dirty) return prev;
        const next = new Set(prev);
        if (dirty) next.add(layout);
        else next.delete(layout);
        return next;
      });
    };
    window.addEventListener('loom-splits-dirty', onDirty);
    return () => window.removeEventListener('loom-splits-dirty', onDirty);
  }, [projectId]);

  const handleReset = () => {
    if (!effectiveMode) return;
    window.dispatchEvent(new CustomEvent('loom-reset-splits', { detail: { projectId, layout: effectiveMode } }));
    setDirtyLayouts(prev => {
      const next = new Set(prev);
      next.delete(effectiveMode);
      return next;
    });
    setOpen(false);
  };

  const handleClick = () => {
    if (!layoutMode && pendingLayout && onRestorePending) {
      onRestorePending();
      return;
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <div
        ref={btnRef}
        onClick={handleClick}
        className={`workspace-tab-item ${effectiveMode ? 'active' : ''}`}
        title={t('proj.layout.title')}
        style={{
          gap: '6px', padding: '4px 4px', cursor: 'pointer',
        }}
      >
        <span style={{ display: 'inline-grid', gridTemplateAreas: '"content"', placeItems: 'center' }}>
          <span
            style={{
              gridArea: 'content',
              visibility: 'hidden',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
            aria-hidden="true"
          >
            {t('proj.layout.multi')}
          </span>
          <span
            style={{
              gridArea: 'content',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'center',
            }}
          >
            {effectiveMode ? effectiveMode : t('proj.layout.multi')}
          </span>
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
          backgroundColor: 'var(--bg-modal, #1c1917)', border: '1px solid var(--border-subtle, #27272a)',
          borderRadius: 'var(--radius-md, 8px)', padding: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 6px', userSelect: 'none' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('proj.layout.title')}</span>
            <button
              onClick={handleReset}
              title={t('proj.layout.reset')}
              disabled={!effectiveMode}
              style={{
                fontSize: '0.68rem',
                color: effectiveMode ? 'var(--text-secondary, #a1a1aa)' : 'var(--text-tertiary, #52525b)',
                cursor: effectiveMode ? 'pointer' : 'default',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid',
                borderColor: (effectiveMode && dirtyLayouts.has(effectiveMode)) ? 'var(--accent-purple, #a855f7)' : 'var(--border-subtle, #27272a)',
                backgroundColor: 'var(--bg-elevated, #18181b)',
                opacity: effectiveMode ? 1 : 0.5,
                userSelect: 'none',
              }}
            >
              {t('proj.layout.reset')}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '6px' }}>
            <LayoutOption active={effectiveMode === null} label={t('proj.layout.single')} {...layoutPreview(null)}
              onClick={() => { onSelect(null); setOpen(false); }} />
            {GRID_LAYOUTS.map(l => {
              const { cols, rows, areas } = layoutPreview(l);
              return (
                <LayoutOption key={l} active={effectiveMode === l} label={isCompositeLayout(l) ? l : `${cols}×${rows}`} cols={cols} rows={rows} areas={areas}
                  onClick={() => { onSelect(l); setOpen(false); }} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
