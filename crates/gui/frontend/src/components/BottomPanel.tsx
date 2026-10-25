import React, { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "../I18nContext";
import type { Project } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

interface BottomPanelProps {
  enabled: boolean;
  projects: Project[];
  selectedProjectId: string;
  onProjectSelect: (projectId: string) => void;
  compositeStates: Record<string, CompositeState>;
  onNavigate?: (page: "workspace" | "settings" | "agents" | "remote") => void;
  onRegisterProject?: () => void;
  onHeightChange?: (height: number) => void;
  page?: string;
  userHeight?: number | null;
  onUserHeightChange?: (h: number | null) => void;
}

export default function BottomPanel({
  enabled,
  projects,
  selectedProjectId,
  onProjectSelect,
  compositeStates,
  onNavigate,
  onRegisterProject,
  onHeightChange,
  page,
  userHeight,
  onUserHeightChange,
}: BottomPanelProps) {
  const { t } = useI18n();
  const [rowCount, setRowCount] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const calcRows = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const items = el.children;
    if (items.length === 0) { setRowCount(1); return; }
    let rows = 1;
    let prevTop = (items[0] as HTMLElement).offsetTop;
    for (let i = 1; i < items.length; i++) {
      const top = (items[i] as HTMLElement).offsetTop;
      if (top > prevTop) { rows++; prevTop = top; }
    }
    setRowCount(rows);
  }, []);

  useEffect(() => { calcRows(); }, [projects, calcRows]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(calcRows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [calcRows]);

  const autoHeight = rowCount <= 1 ? 42 : 78;
  const panelHeight = userHeight != null ? userHeight : autoHeight;
  const isManuallyShrunk = userHeight != null && userHeight < autoHeight;

  useEffect(() => {
    if (!onHeightChange || !enabled) return;
    onHeightChange(panelHeight);
  }, [panelHeight, onHeightChange, enabled]);

  // 拖动顶部边缘调整高度
  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = panelHeight;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      let newHeight = startHeight + deltaY;
      if (newHeight < 40) newHeight = 40;
      if (newHeight > 240) newHeight = 240;
      onUserHeightChange?.(newHeight);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelHeight, onUserHeightChange]);

  const handleResizerDoubleClick = useCallback(() => {
    onUserHeightChange?.(null);
  }, [onUserHeightChange]);

  if (!enabled) return null;

  return (
    <footer
      ref={panelRef}
      className="bottom-panel fixed-mode"
      style={{
        width: "100%",
        height: `${panelHeight}px`,
        minHeight: `${panelHeight}px`,
        maxHeight: `${panelHeight}px`,
        background: "var(--bg-card)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        flexShrink: 0,
        position: "relative",
        boxSizing: "border-box",
        overflow: "hidden",
        userSelect: "none",
        zIndex: 40,
      }}
    >
      <div
        className="bottom-panel-resizer"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "4px",
          cursor: "row-resize",
          zIndex: 10,
        }}
        onMouseDown={handleResizerMouseDown}
        onDoubleClick={handleResizerDoubleClick}
        title="拖动调整高度 / 双击恢复自动"
      />

      {/* 项目列表 */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          alignContent: rowCount >= 3 || isManuallyShrunk ? "flex-start" : "center",
          gap: "4px",
          padding: "6px 8px",
          overflowY: rowCount >= 3 || isManuallyShrunk ? "auto" : "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          boxSizing: "border-box",
        }}
      >
        {projects.length === 0 && (
          <span
            style={{
              color: "var(--text-tertiary)",
              fontSize: "13px",
              fontStyle: "italic",
            }}
          >
            {t("proj.sidebar.title") || "暂无项目"}
          </span>
        )}
        {projects.map((project) => {
          const isActive = selectedProjectId === project.id && page === "workspace";
          const stateClass = compositeStates[project.id];
          return (
            <div
              key={project.id}
              onClick={() => {
                onProjectSelect(project.id);
                if (page !== "workspace") onNavigate?.("workspace");
              }}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 10px",
                height: "28px",
                cursor: "pointer",
                overflow: "hidden",
                fontSize: "13px",
                borderRadius: "6px",
                background: isActive ? "var(--bg-elevated)" : "transparent",
                color: "var(--text-primary)",
                transition: "background-color 0.15s ease",
                whiteSpace: "nowrap",
                border: "1px solid",
                borderColor: isActive ? "var(--border-subtle)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                className={`project-status-text${stateClass ? ` ${stateClass}` : ""}`}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={project.name}
              >
                {project.name}
              </span>
            </div>
          );
        })}

        <div style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
          {onRegisterProject && (
            <div
              onClick={onRegisterProject}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px 6px",
                height: "28px",
                cursor: "pointer",
                borderRadius: "6px",
                background: "transparent",
                color: "var(--text-secondary)",
                transition: "background-color 0.15s ease",
                border: "1px solid transparent",
              }}
              title={t("proj.register") || "新建项目"}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="4" x2="12" y2="20"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
              </svg>
            </div>
          )}
          {onNavigate && (
            <div
              onClick={() => onNavigate("settings")}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px 6px",
                height: "28px",
                cursor: "pointer",
                borderRadius: "6px",
                background: page === "settings" ? "var(--accent-purple)" : "transparent",
                color: page === "settings" ? "white" : "var(--text-secondary)",
                transition: "background-color 0.15s ease",
                border: "1px solid transparent",
              }}
              title={t("settings") || "设置"}
              onMouseEnter={(e) => {
                if (page !== "settings") e.currentTarget.style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                if (page !== "settings") e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
