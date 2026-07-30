import React, { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "../I18nContext";
import type { Project } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

interface BottomPanelProps {
  enabled: boolean;
  mode: "embedded" | "floating";
  sidebarWidth: number;
  projects: Project[];
  selectedProjectId: string;
  onProjectSelect: (projectId: string) => void;
  compositeStates: Record<string, CompositeState>;
  onNavigate?: (page: "settings") => void;
  onRegisterProject?: () => void;
  onHeightChange?: (height: number) => void;
  page?: string;
}

export default function BottomPanel({
  enabled,
  mode,
  sidebarWidth,
  projects,
  selectedProjectId,
  onProjectSelect,
  compositeStates,
  onNavigate,
  onRegisterProject,
  onHeightChange,
  page,
}: BottomPanelProps) {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure actual panel height via DOM
  useEffect(() => {
    if (!panelRef.current || !onHeightChange || !enabled) return;
    const h = panelRef.current.clientHeight;
    onHeightChange(h);
  }, [projects, mode, onHeightChange, enabled]);

  const isEmbedded = mode === "embedded";
  const showPanel = isEmbedded || isVisible;

  // ─── Floating mode: hover trigger ──────────────────────────
  useEffect(() => {
    if (isEmbedded) return;

    const triggerZone = 16;

    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      if (e.clientX >= sidebarWidth && e.clientY >= windowHeight - triggerZone) {
        setIsVisible(true);
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isEmbedded]);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isEmbedded) return;
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  }, [isEmbedded]);

  if (!enabled) return null;

  return (
    <div
      ref={panelRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
        style={{
          position: "fixed",
          bottom: 0,
          left: `${sidebarWidth}px`,
          right: 0,
          height: "auto",
          minHeight: "50px",
          maxHeight: "92px",
          background: "var(--bg-card)",
          backdropFilter: "blur(20px)",
          zIndex: 10000,
          display: showPanel ? "flex" : "none",
          flexDirection: "row",
          alignItems: "stretch",
          transform: isEmbedded ? "translateY(0)" : (isVisible ? "translateY(0)" : "translateY(100%)"),
          opacity: isEmbedded ? 1 : (isVisible ? 1 : 0),
          transition: "transform 150ms ease, opacity 150ms ease, height 150ms ease",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
    >
      {/* Plus (top) & Gear (bottom) */}
      <div
        style={{
          width: "30px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "6px",
          padding: "0 2px",
        }}
      >
        {onRegisterProject && (
          <button
            onClick={onRegisterProject}
            style={{
              padding: "2px",
              cursor: "pointer",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "none",
              transition: "background-color 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="注册"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="4" x2="12" y2="20"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
            </svg>
          </button>
        )}
        {onNavigate && (
          <button
            onClick={() => onNavigate("settings")}
            style={{
              padding: "2px",
              cursor: "pointer",
              borderRadius: "4px",
              background: page === "settings" ? "var(--accent-purple)" : "transparent",
              color: page === "settings" ? "white" : "var(--text-secondary)",
              border: "none",
              transition: "background-color 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="设置"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Projects list */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          alignContent: "center",
          gap: "2px 4px",
          padding: "4px 12px",
          overflowY: "auto",
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
            {t("proj.sidebar.title")}
          </span>
        )}
        {projects.map((project) => {
          const isActive = selectedProjectId === project.id;
          return (
            <div
              key={project.id}
              onClick={() => onProjectSelect(project.id)}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                cursor: "pointer",
                overflow: "hidden",
                fontSize: "13px",
                borderRadius: "6px",
                background: isActive ? "var(--bg-elevated)" : "transparent",
                color: "var(--text-primary)",
                transition: "background-color 0.2s ease",
                whiteSpace: "nowrap",
                border: "1px solid",
                borderColor: isActive ? "var(--border-subtle)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <span
                className={`project-status-text${compositeStates[project.id] ? ` ${compositeStates[project.id]}` : ""}`}
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
      </div>
    </div>
  );
}
