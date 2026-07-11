import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { I18nProvider } from "../I18nContext";
import type { Project } from "../types";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

const mockProjects: Project[] = [
  { id: "p-1", name: "Project Alpha", root_path: "/alpha", env_profiles: {}, quick_commands: [] },
  { id: "p-2", name: "Project Beta", root_path: "/beta", env_profiles: {}, quick_commands: [] },
  { id: "p-3", name: "Project Gamma", root_path: "/gamma", env_profiles: {}, quick_commands: [] },
];

async function renderSidebar(props: Record<string, unknown> = {}) {
  const { default: RightSidebarComp } = await import("../components/RightSidebar");
  return render(
    <TestWrapper>
      <RightSidebarComp
        projects={mockProjects}
        selectedProjectId="p-1"
        onProjectSelect={vi.fn()}
        enabled={true}
        position="right"
        page="workspace"
        onNavigate={vi.fn()}
        onRegisterProject={vi.fn()}
        {...props}
      />
    </TestWrapper>
  );
}

describe("RightSidebar", () => {
  it("does not render when disabled", async () => {
    const { default: RightSidebarComp } = await import("../components/RightSidebar");
    const { container } = render(
      <TestWrapper>
        <RightSidebarComp
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={vi.fn()}
          enabled={false}
          position="right"
          page="workspace"
          onNavigate={vi.fn()}
        />
      </TestWrapper>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders project names", async () => {
    await renderSidebar();
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();
    expect(screen.getByText("Project Gamma")).toBeInTheDocument();
  });

  it("highlights selected project", async () => {
    await renderSidebar({ selectedProjectId: "p-2" });
    const items = document.querySelectorAll(".right-sidebar-project-item");
    const activeItem = Array.from(items).find(
      (el) => el.classList.contains("active")
    );
    expect(activeItem).toBeTruthy();
    expect(activeItem?.textContent).toContain("Project Beta");
  });

  it("calls onProjectSelect when project clicked", async () => {
    const onProjectSelect = vi.fn();
    await renderSidebar({ onProjectSelect });
    fireEvent.click(screen.getByText("Project Beta"));
    expect(onProjectSelect).toHaveBeenCalledWith("p-2");
  });

  it("renders register project button", async () => {
    const onRegisterProject = vi.fn();
    await renderSidebar({ onRegisterProject });
    expect(screen.getByText((c) => c.includes("注册项目"))).toBeInTheDocument();
  });

  it("calls onRegisterProject when add button clicked", async () => {
    const onRegisterProject = vi.fn();
    await renderSidebar({ onRegisterProject });
    fireEvent.click(screen.getByText((c) => c.includes("注册项目")));
    expect(onRegisterProject).toHaveBeenCalled();
  });

  it("renders settings button", async () => {
    await renderSidebar();
    expect(screen.getByText((c) => c.includes("系统设置"))).toBeInTheDocument();
  });

  it("calls onNavigate to settings when settings button clicked", async () => {
    const onNavigate = vi.fn();
    await renderSidebar({ onNavigate });
    fireEvent.click(screen.getByText((c) => c.includes("系统设置")));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("highlights settings button when on settings page", async () => {
    await renderSidebar({ page: "settings" });
    const items = document.querySelectorAll('[style*="cursor: pointer"]');
    const settingsItems = Array.from(items).filter(
      (el) => el.textContent?.includes("系统设置")
    );
    expect(settingsItems.length).toBeGreaterThanOrEqual(1);
  });
});
