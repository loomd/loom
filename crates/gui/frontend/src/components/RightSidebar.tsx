import React from "react";
import { useI18n } from "../I18nContext";
import type { Project, Page } from "../types";
import type { CompositeState } from "../hooks/useProjectCompositeStates";

interface RightSidebarProps {
  projects: Project[];
  selectedProjectId: string;
  page: Page;
  compositeStates: Record<string, CompositeState>;
  onProjectSelect: (id: string, page?: Page) => void;
  enabled?: boolean;
  width?: number;
  position?: "left" | "right";
  projectColumnAlign?: string;
  draggedIndex?: number | null;
  dragOverIndex?: number | null;
  onNavigate?: (page: Page) => void;
  onSettingsClick?: () => void;
  onAgentsClick?: () => void;
  onRemoteClick?: () => void;
  onHermesClick?: () => void;
  hermesEnabled?: boolean;
  remoteEnabled?: boolean;
  agentsEnabled?: boolean;
  onRegisterProject?: () => void;
  onAddClick?: () => void;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  onDragEnd?: () => void;
}

export default function RightSidebar({
  projects,
  selectedProjectId,
  page,
  compositeStates,
  onProjectSelect,
  enabled = true,
  width = 170,
  projectColumnAlign = "left",
  draggedIndex = null,
  dragOverIndex = null,
  onNavigate,
  onSettingsClick,
  onAgentsClick,
  onRegisterProject,
  onAddClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRemoteClick,
  onHermesClick,
  hermesEnabled = false,
  remoteEnabled = false,
  agentsEnabled = true,
}: RightSidebarProps) {
  const { t } = useI18n();

  if (enabled === false) return null;

  const handleSettings = onSettingsClick || (() => onNavigate?.("settings"));
  const handleAgents = onAgentsClick || (() => onNavigate?.("agents"));
  const handleRemote = onRemoteClick || (() => onNavigate?.("remote"));
  const handleHermes = onHermesClick || (() => onNavigate?.("hermes"));
  const handleAdd = onAddClick || onRegisterProject;

  return (
    <aside
      className="sidebar right-sidebar"
      style={{
        position: "relative",
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderLeft: "1px solid var(--border-subtle)",
        borderRight: "none",
        background: "var(--bg-sidebar)",
        backdropFilter: "blur(20px)",
        padding: "8px",
        boxSizing: "border-box",
        userSelect: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          overflowY: "auto",
          flexGrow: 1,
          marginTop: "8px",
          paddingBottom: "4px",
          justifyContent: projectColumnAlign === "center" ? "center" : "flex-start",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {projects.length === 0 && (
          <div
            style={{
              padding: "12px 8px",
              fontSize: "0.8rem",
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            No projects linked
          </div>
        )}
        {projects.map((p, index) => {
          const isActive = page === "workspace" && selectedProjectId === p.id;
          const isDragging = draggedIndex !== null && index === draggedIndex;
          const isDragOver = dragOverIndex !== null && index === dragOverIndex;
          const showTopLine = isDragOver && draggedIndex !== null && draggedIndex > index;
          const showBottomLine = isDragOver && draggedIndex !== null && draggedIndex < index;

          return (
            <button
              key={p.id}
              className={`nav-item right-sidebar-project-item${isActive ? " active" : ""}`}
              onClick={() => {
                onProjectSelect(p.id);
                if (page !== "workspace") onNavigate?.("workspace");
              }}
              draggable={!!onDragStart}
              onDragStart={(e) => onDragStart?.(e, index)}
              onDragOver={(e) => onDragOver?.(e, index)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop?.(e, index)}
              onDragEnd={onDragEnd}
              style={{
                width: "100%",
                textAlign: "left",
                background: isDragging ? "var(--bg-elevated)" : undefined,
                border: isDragging
                  ? "1px dashed var(--accent-purple)"
                  : "1px solid transparent",
                boxShadow: showTopLine
                  ? "0 -2px 0 0 var(--accent-purple)"
                  : showBottomLine
                    ? "0 2px 0 0 var(--accent-purple)"
                    : "none",
                cursor: onDragStart ? "grab" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 8px",
                borderRadius: "var(--radius-sm)",
                opacity: isDragging ? 0.4 : 1,
                transform: isDragging ? "scale(0.96)" : "none",
                transition:
                  "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.1s ease",
              }}
            >
              <span
                className={compositeStates[p.id] ? `project-status-text ${compositeStates[p.id]}` : ""}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexGrow: 1,
                  fontWeight: 400,
                  pointerEvents: draggedIndex !== null ? "none" : "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  lineHeight: "1.2",
                  gap: "6px",
                }}
              >
                {p.name}
              </span>
            </button>
          );
        })}

        {handleAdd && (
          <button
            className="nav-item"
            onClick={handleAdd}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 8px",
              borderRadius: "var(--radius-sm)",
              transition:
                "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                fontWeight: 400,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: "1.2",
                gap: "6px",
              }}
            >
              {t("proj.sidebar.add")}
            </span>
          </button>
        )}

        {hermesEnabled && handleHermes && (
          <button
            className={`nav-item${page === "hermes" ? " active" : ""}`}
            onClick={handleHermes}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 8px",
              borderRadius: "var(--radius-sm)",
              transition:
                "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}
          >
            <span
              className="hermes-nav-text"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: "1.2",
                gap: "6px",
              }}
            >
              Hermes
            </span>
          </button>
        )}

        {remoteEnabled && handleRemote && (
          <button
            className={`nav-item${page === "remote" ? " active" : ""}`}
            onClick={handleRemote}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 8px",
              borderRadius: "var(--radius-sm)",
              transition:
                "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                fontWeight: 400,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: "1.2",
                gap: "6px",
              }}
            >
              远程连接
            </span>
          </button>
        )}

        {agentsEnabled && handleAgents && (
          <button
            className={`nav-item${page === "agents" ? " active" : ""}`}
            onClick={handleAgents}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 8px",
              borderRadius: "var(--radius-sm)",
              transition:
                "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                fontWeight: 400,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: "1.2",
                gap: "6px",
              }}
            >
              配置引导
            </span>
          </button>
        )}

        {handleSettings && (
          <button
            className={`nav-item${page === "settings" ? " active" : ""}`}
            onClick={handleSettings}
            style={{
              width: "100%",
              textAlign: "left",
              border: "1px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 8px",
              borderRadius: "var(--radius-sm)",
              transition:
                "opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
                fontWeight: 400,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: "1.2",
                gap: "6px",
              }}
            >
              {t("nav.settings")}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
