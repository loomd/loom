import React, { useRef, useCallback } from "react";
import { useI18n } from "../I18nContext";
import WindowControlButtons from "./WindowControlButtons";
import type { Project, Page } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

interface TopPanelProps {
  projects: Project[];
  selectedProjectId: string;
  onProjectSelect: (projectId: string) => void;
  compositeStates: Record<string, CompositeState>;
  onNavigate?: (page: Page) => void;
  onRegisterProject?: () => void;
  page?: Page;
}

export function TopPanel({
  projects,
  selectedProjectId,
  onProjectSelect,
  compositeStates,
  onNavigate,
  onRegisterProject,
  page = "workspace",
}: TopPanelProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (listRef.current) {
      listRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: "38px",
        minHeight: "38px",
        maxHeight: "38px",
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        padding: "0 0 0 8px",
        boxSizing: "border-box",
        userSelect: "none",
        zIndex: 50,
        position: "relative",
      }}
    >
      {/* 左侧项目列表及快捷新建 */}
      <div
        ref={listRef}
        onWheel={handleWheel}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          overflowX: "auto",
          maxWidth: "calc(100vw - 220px)",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          flexShrink: 1,
        }}
      >
        {projects.length === 0 && (
          <span
            style={{
              color: "var(--text-tertiary)",
              fontSize: "12px",
              padding: "0 4px",
              fontStyle: "italic",
            }}
          >
            {t("proj.sidebar.title") || "No Projects"}
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
                if (page !== "workspace") {
                  onNavigate?.("workspace");
                }
              }}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "3px 10px",
                height: "26px",
                cursor: "pointer",
                fontSize: "12px",
                borderRadius: "6px",
                background: isActive ? "var(--bg-elevated)" : "transparent",
                color: "var(--text-primary)",
                transition: "background-color 0.15s ease",
                whiteSpace: "nowrap",
                border: "1px solid",
                borderColor: isActive ? "var(--border-subtle)" : "transparent",
              }}
              title={project.name}
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
                  maxWidth: "160px",
                  lineHeight: 1.2,
                }}
              >
                {project.name}
              </span>
            </div>
          );
        })}

        {onRegisterProject && (
          <div
            onClick={onRegisterProject}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              cursor: "pointer",
              borderRadius: "5px",
              background: "transparent",
              color: "var(--text-secondary)",
              transition: "background-color 0.15s ease",
            }}
            title={t("proj.sidebar.add") || "注册项目"}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="4" x2="12" y2="20"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
            </svg>
          </div>
        )}
      </div>

      {/* 中间自适应拖拽区域 */}
      <div
        data-tauri-drag-region
        style={{
          flex: 1,
          height: "100%",
          minWidth: "20px",
          cursor: "grab",
        }}
      />

      {/* 右侧快捷入口与窗口控制按钮 */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          height: "100%",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        {onNavigate && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", paddingRight: "4px" }}>
            <div
              onClick={() => onNavigate("agents")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px 8px",
                height: "24px",
                cursor: "pointer",
                borderRadius: "5px",
                fontSize: "12px",
                background: page === "agents" ? "var(--accent-purple)" : "transparent",
                color: page === "agents" ? "#ffffff" : "var(--text-secondary)",
                transition: "background-color 0.15s ease",
              }}
              title={t("nav.agents") || "Agents"}
              onMouseEnter={(e) => {
                if (page !== "agents") e.currentTarget.style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                if (page !== "agents") e.currentTarget.style.background = "transparent";
              }}
            >
              Agents
            </div>
            <div
              onClick={() => onNavigate("settings")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                cursor: "pointer",
                borderRadius: "5px",
                background: page === "settings" ? "var(--accent-purple)" : "transparent",
                color: page === "settings" ? "#ffffff" : "var(--text-secondary)",
                transition: "background-color 0.15s ease",
              }}
              title={t("nav.settings") || "系统设置"}
              onMouseEnter={(e) => {
                if (page !== "settings") e.currentTarget.style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                if (page !== "settings") e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
          <WindowControlButtons />
        </div>
      </div>
    </div>
  );
}

export default TopPanel;
