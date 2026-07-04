import React, { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "../I18nContext";
import type { Project } from "../types";

interface RightSidebarProps {
  projects: Project[];
  selectedProjectId: string;
  onProjectSelect: (projectId: string) => void;
  enabled: boolean;
  page: "workspace" | "settings";
  onNavigate: (page: "workspace" | "settings") => void;
  onRegisterProject?: () => void;
}

export default function RightSidebar({
  projects,
  selectedProjectId,
  onProjectSelect,
  enabled,
  page,
  onNavigate,
  onRegisterProject,
}: RightSidebarProps) {
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSidebar = useCallback(() => {
    if (!enabled) return;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  }, [enabled]);

  const scheduleHide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!enabled) return;
      
      const windowWidth = window.innerWidth;
      const triggerZone = 10;
      
      if (e.clientX >= windowWidth - triggerZone) {
        showSidebar();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [enabled, showSidebar]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnterSidebar = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  }, []);

  const handleMouseLeaveSidebar = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  if (!enabled) return null;

  return (
    <div
      ref={sidebarRef}
      className={`right-sidebar ${isVisible ? "visible" : "hidden"}`}
      onMouseEnter={handleMouseEnterSidebar}
      onMouseLeave={handleMouseLeaveSidebar}
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: "120px",
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border-subtle)",
        transform: isVisible ? "translateX(0)" : "translateX(100%)",
        opacity: isVisible ? 1 : 0,
        transition: "transform 150ms ease, opacity 150ms ease",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        backdropFilter: "blur(20px)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "4px",
          padding: "8px",
        }}
      >
        {projects.map((project) => {
          const isActive = selectedProjectId === project.id;
          return (
            <div
              key={project.id}
              className={`right-sidebar-project-item ${isActive ? "active" : ""}`}
              onClick={() => onProjectSelect(project.id)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                overflow: "hidden",
                fontSize: "13px",
                borderRadius: "4px",
                margin: "2px 4px",
                background: isActive ? "var(--accent-purple)" : "transparent",
                color: isActive ? "white" : "var(--text-primary)",
                transition: "background-color 0.2s ease",
                whiteSpace: "nowrap",
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
              <div
                className="right-sidebar-project-name"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={project.name}
              >
                {project.name}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "4px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {onRegisterProject && (
          <div
            onClick={onRegisterProject}
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: "13px",
              borderRadius: "4px",
              margin: "2px 4px",
              color: "var(--text-primary)",
              transition: "background-color 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t("proj.sidebar.add")}
            </span>
          </div>
        )}
        <div
          onClick={() => onNavigate("settings")}
          style={{
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: "13px",
            borderRadius: "4px",
            margin: "2px 4px",
            background: page === "settings" ? "var(--accent-purple)" : "transparent",
            color: page === "settings" ? "white" : "var(--text-primary)",
            transition: "background-color 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          onMouseEnter={(e) => {
            if (page !== "settings") {
              e.currentTarget.style.background = "var(--bg-elevated)";
            }
          }}
          onMouseLeave={(e) => {
            if (page !== "settings") {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t("nav.settings")}
          </span>
        </div>
      </div>
    </div>
  );
}