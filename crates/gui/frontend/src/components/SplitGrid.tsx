import { useEffect, useMemo, useRef, useState } from 'react';
import type { GridSplitLine } from '../hooks/useTabs';
import { splitLines } from '../hooks/useTabs';

const MIN_RATIO = 0.1;
const HANDLE_SIZE = 6;

interface SplitWeights {
  col: number[];
  row: number[];
}

interface SplitGridProps {
  cols: number;
  rows: number;
  areas: string;
  grid: boolean;
  layoutKey?: string | null;
  children: React.ReactNode;
}

export function SplitGrid({ cols, rows, areas, grid, layoutKey, children }: SplitGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [weightsMap, setWeightsMap] = useState<Record<string, SplitWeights>>({});
  const [hovered, setHovered] = useState<GridSplitLine | null>(null);

  const key = grid && layoutKey ? layoutKey : '__single__';
  const stored = weightsMap[key];
  const storedCol = stored && stored.col.length === cols ? stored.col : Array(cols).fill(1);
  const storedRow = stored && stored.row.length === rows ? stored.row : Array(rows).fill(1);

  const lines = useMemo(() => (grid ? splitLines(areas) : []), [grid, areas]);
  const totalCol = storedCol.reduce((a, b) => a + b, 0);
  const totalRow = storedRow.reduce((a, b) => a + b, 0);

  const updateWeights = (isCol: boolean, next: number[]) => {
    setWeightsMap(prev => {
      const cur = prev[key] ?? { col: Array(cols).fill(1), row: Array(rows).fill(1) };
      return { ...prev, [key]: isCol ? { ...cur, col: next } : { ...cur, row: next } };
    });
  };

  useEffect(() => {
    const onReset = (e: Event) => {
      if ((e as CustomEvent).detail !== layoutKey) return;
      setWeightsMap(prev => ({
        ...prev,
        [key]: { col: Array(cols).fill(1), row: Array(rows).fill(1) },
      }));
    };
    window.addEventListener('loom-reset-splits', onReset);
    return () => window.removeEventListener('loom-reset-splits', onReset);
  }, [key, cols, rows, layoutKey]);

  const startDrag = (line: GridSplitLine) => (e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const isCol = line.axis === 'col';
    const startPos = isCol ? e.clientX : e.clientY;
    const startWeights = (isCol ? storedCol : storedRow).slice();
    const total = startWeights.reduce((a, b) => a + b, 0);
    const min = total * MIN_RATIO;

    const move = (ev: MouseEvent) => {
      const delta = ((isCol ? ev.clientX : ev.clientY) - startPos) / (isCol ? rect.width : rect.height) * total;
      const next = startWeights.slice();
      next[line.index] = Math.min(Math.max(startWeights[line.index] + delta, min), total - min);
      next[line.index + 1] = total - next[line.index];
      updateWeights(isCol, next);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = isCol ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
  };

  const colBoundaryPct = (index: number) => storedCol.slice(0, index + 1).reduce((a, b) => a + b, 0) / totalCol * 100;
  const rowBoundaryPct = (index: number) => storedRow.slice(0, index + 1).reduce((a, b) => a + b, 0) / totalRow * 100;
  const rangePct = (weights: number[], total: number, start: number, span: number) => ({
    start: weights.slice(0, start).reduce((a, b) => a + b, 0) / total * 100,
    span: weights.slice(start, start + span).reduce((a, b) => a + b, 0) / total * 100,
  });
  const rowRange = (line: GridSplitLine) => rangePct(storedRow, totalRow, line.start, line.span);
  const colRange = (line: GridSplitLine) => rangePct(storedCol, totalCol, line.start, line.span);

  return (
    <div ref={containerRef} className="grid-pane-container" style={{
      flex: 1,
      minHeight: 0,
      display: grid ? 'grid' : 'flex',
      flexDirection: grid ? undefined : 'column',
      position: 'relative',
      gridTemplateColumns: grid ? storedCol.map(w => `${w}fr`).join(' ') : undefined,
      gridTemplateRows: grid ? storedRow.map(w => `${w}fr`).join(' ') : undefined,
      gridTemplateAreas: grid ? areas : undefined,
      gap: grid ? 1 : 0,
      backgroundColor: grid ? 'var(--border-subtle, #27272a)' : undefined,
    }}>
      {children}
      {grid && lines.map(line => line.axis === 'col' ? (
        <div
          key={`col-${line.index}`}
          data-testid={`split-col-${line.index}`}
          onMouseDown={startDrag(line)}
          onMouseEnter={() => setHovered(line)}
          onMouseLeave={() => setHovered(l => (l === line ? null : l))}
          style={{
            position: 'absolute',
            left: `calc(${colBoundaryPct(line.index)}% - ${HANDLE_SIZE / 2}px)`,
            top: `${rowRange(line).start}%`,
            height: `${rowRange(line).span}%`,
            width: HANDLE_SIZE,
            cursor: 'col-resize',
            zIndex: 5,
            borderRadius: 2,
            backgroundColor: hovered === line ? 'rgba(16, 185, 129, 0.45)' : 'transparent',
            transition: 'background-color 0.15s',
          }}
        />
      ) : (
        <div
          key={`row-${line.index}`}
          data-testid={`split-row-${line.index}`}
          onMouseDown={startDrag(line)}
          onMouseEnter={() => setHovered(line)}
          onMouseLeave={() => setHovered(l => (l === line ? null : l))}
          style={{
            position: 'absolute',
            top: `calc(${rowBoundaryPct(line.index)}% - ${HANDLE_SIZE / 2}px)`,
            left: `${colRange(line).start}%`,
            width: `${colRange(line).span}%`,
            height: HANDLE_SIZE,
            cursor: 'row-resize',
            zIndex: 5,
            borderRadius: 2,
            backgroundColor: hovered === line ? 'rgba(16, 185, 129, 0.45)' : 'transparent',
            transition: 'background-color 0.15s',
          }}
        />
      ))}
    </div>
  );
}