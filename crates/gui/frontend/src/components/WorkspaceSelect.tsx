import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../types';

interface Props {
  projects: Project[];
  value: string;
  onChange: (rootPath: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * 工作区项目选择器：自绘下拉框，展示「项目名 + 根目录路径」双行信息，
 * 替代原生 select（原生下拉无法呈现路径副标题，样式在暗色主题下也不可控）。
 */
export const WorkspaceSelect: React.FC<Props> = ({
  projects,
  value,
  onChange,
  disabled = false,
  placeholder = '选择工作区项目',
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = projects.find((p) => p.root_path === value) ?? null;
  const selectedIndex = projects.findIndex((p) => p.root_path === value);
  // 会话运行中的工作区可能已不在项目列表内（如项目被删除），仍需展示当前路径
  const orphanWorkspace = !selected && value ? value : null;

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // 打开时滚动到选中项
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled || projects.length === 0) return;
    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, projects.length, selectedIndex]);

  const selectAt = useCallback(
    (index: number) => {
      const target = projects[index];
      if (!target) return;
      onChange(target.root_path);
      close();
    },
    [projects, onChange, close]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || projects.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0
        ? (delta > 0 ? 0 : projects.length - 1)
        : (activeIndex + delta + projects.length) % projects.length;
      setActiveIndex(next);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      if (activeIndex >= 0) selectAt(activeIndex);
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="ws-select" ref={rootRef}>
      <button
        type="button"
        className={`ws-select-trigger${open ? ' open' : ''}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        role="combobox"
        aria-label="目标工作区项目"
      >
        <span className="ws-select-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </span>
        <span className="ws-select-text">
          {selected ? (
            <>
              <span className="ws-select-name">{selected.name}</span>
              <span className="ws-select-path">{selected.root_path}</span>
            </>
          ) : orphanWorkspace ? (
            <>
              <span className="ws-select-name">当前会话工作区</span>
              <span className="ws-select-path">{orphanWorkspace}</span>
            </>
          ) : (
            <span className="ws-select-name muted">{placeholder}</span>
          )}
        </span>
        <span className="ws-select-caret" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="ws-select-menu" role="listbox" ref={listRef} aria-label="工作区项目列表">
          {projects.map((p, i) => (
            <div
              key={p.id}
              role="option"
              aria-selected={p.root_path === value}
              data-index={i}
              className={`ws-select-option${i === activeIndex ? ' active' : ''}${p.root_path === value ? ' selected' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectAt(i)}
            >
              <span className="ws-select-option-main">
                <span className="ws-select-option-name">{p.name}</span>
                <span className="ws-select-option-path">{p.root_path}</span>
              </span>
              {p.root_path === value && (
                <span className="ws-select-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceSelect;
