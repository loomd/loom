import { useEffect, useRef, useState } from 'react';
import type { GridLayout } from '../hooks/useTabs';
import { GRID_LAYOUTS, gridDims } from '../hooks/useTabs';
import { useI18n } from '../I18nContext';

interface LayoutOptionProps {
  active: boolean;
  label: string;
  cols: number;
  rows: number;
  onClick: () => void;
}

function LayoutOption({ active, label, cols, rows, onClick }: LayoutOptionProps) {
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
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 10px)`, gridTemplateRows: `repeat(${rows}, 10px)`, gap: '2px' }}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: active ? 'var(--accent-emerald, #10b981)' : 'var(--text-tertiary, #71717a)' }} />
        ))}
      </div>
      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #a1a1aa)', userSelect: 'none' }}>{label}</span>
    </button>
  );
}

interface LayoutSelectorProps {
  layoutMode: GridLayout | null;
  onSelect: (layout: GridLayout | null) => void;
}

export function LayoutSelector({ layoutMode, onSelect }: LayoutSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', alignSelf: 'center' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', alignSelf: 'center', lineHeight: 1, padding: '4px 4px',
          fontSize: '0.82rem', borderRadius: 'var(--radius-sm, 4px)', cursor: 'pointer',
          backgroundColor: layoutMode ? 'var(--accent-emerald, #10b981)' : 'var(--bg-elevated, #18181b)',
          border: '1px solid var(--border-subtle, #27272a)',
          color: layoutMode ? '#fff' : 'var(--text-primary, #fff)', fontWeight: 500, userSelect: 'none',
        }}
      >
        {layoutMode ? layoutMode : t('proj.layout.multi')}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
          backgroundColor: 'var(--bg-modal, #1c1917)', border: '1px solid var(--border-subtle, #27272a)',
          borderRadius: 'var(--radius-md, 8px)', padding: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '2px 4px 6px', userSelect: 'none' }}>
            {t('proj.layout.title')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '6px' }}>
            <LayoutOption active={layoutMode === null} label={t('proj.layout.single')} cols={1} rows={1}
              onClick={() => { onSelect(null); setOpen(false); }} />
            {GRID_LAYOUTS.map(l => {
              const { cols, rows } = gridDims(l);
              return (
                <LayoutOption key={l} active={layoutMode === l} label={`${cols}×${rows}`} cols={cols} rows={rows}
                  onClick={() => { onSelect(l); setOpen(false); }} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
