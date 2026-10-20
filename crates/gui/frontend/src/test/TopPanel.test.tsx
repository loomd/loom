import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { I18nProvider } from "../I18nContext";
import { TopPanel } from "../components/TopPanel";
import type { Project } from "../types";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

const mockProjects: Project[] = [
  { id: "p-1", name: "Project Alpha", root_path: "/alpha", env_profiles: {}, quick_commands: [] },
  { id: "p-2", name: "Project Beta", root_path: "/beta", env_profiles: {}, quick_commands: [] },
];

describe("TopPanel", () => {
  it("renders all project names and empty state when no projects", () => {
    const { rerender } = render(
      <TestWrapper>
        <TopPanel
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={vi.fn()}
          compositeStates={{}}
        />
      </TestWrapper>
    );

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <TopPanel
          projects={[]}
          selectedProjectId=""
          onProjectSelect={vi.fn()}
          compositeStates={{}}
        />
      </TestWrapper>
    );

    expect(screen.getByText("项目列表")).toBeInTheDocument();
  });

  it("handles project selection and page navigation", () => {
    const onSelect = vi.fn();
    const onNav = vi.fn();

    render(
      <TestWrapper>
        <TopPanel
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={onSelect}
          compositeStates={{}}
          onNavigate={onNav}
          page="settings"
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText("Project Beta"));
    expect(onSelect).toHaveBeenCalledWith("p-2");
    expect(onNav).toHaveBeenCalledWith("workspace");
  });

  it("triggers onRegisterProject when add button is clicked", () => {
    const onRegister = vi.fn();

    render(
      <TestWrapper>
        <TopPanel
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={vi.fn()}
          compositeStates={{}}
          onRegisterProject={onRegister}
        />
      </TestWrapper>
    );

    const addBtn = screen.getByTitle("注册项目");
    fireEvent.click(addBtn);
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it("navigates to settings and agents when clicked", () => {
    const onNav = vi.fn();

    render(
      <TestWrapper>
        <TopPanel
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={vi.fn()}
          compositeStates={{}}
          onNavigate={onNav}
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText("Agents"));
    expect(onNav).toHaveBeenCalledWith("agents");

    fireEvent.click(screen.getByTitle("系统设置"));
    expect(onNav).toHaveBeenCalledWith("settings");
  });

  it("contains drag region for window control", () => {
    const { container } = render(
      <TestWrapper>
        <TopPanel
          projects={mockProjects}
          selectedProjectId="p-1"
          onProjectSelect={vi.fn()}
          compositeStates={{}}
        />
      </TestWrapper>
    );

    const dragRegions = container.querySelectorAll("[data-tauri-drag-region]");
    expect(dragRegions.length).toBeGreaterThan(0);
  });
});
