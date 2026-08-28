import React from "react";
import { render, act } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../components/ProjectWorkspace", () => ({
  default: () => <div data-testid="project-workspace" />,
}));

vi.mock("../pages/SettingsPage", () => ({
  default: () => <div data-testid="settings-page" />,
}));

vi.mock("../components/RightSidebar", () => ({
  default: () => <div data-testid="right-sidebar" />,
}));

vi.mock("../components/GlobalErrorHandler", () => ({
  default: () => <div data-testid="global-error-handler" />,
}));

vi.mock("../pages/AgentManagementPage", () => ({
  AgentManagementPage: () => <div data-testid="agent-management-page" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("App", () => {
  it("renders without crashing", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_projects") return Promise.resolve([]);
      if (cmd === "get_theme") return Promise.resolve("dark");
      if (cmd === "get_font_family") return Promise.resolve("Plus Jakarta Sans");
      if (cmd === "get_font_size") return Promise.resolve("14px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      return Promise.resolve(undefined);
    });

    const App = (await import("../App")).default;
    const { container } = render(<App />);
    // 冲刷挂载阶段异步 invoke 引发的状态更新，避免 act 警告
    await act(async () => {});

    expect(container.querySelector(".app-container")).toBeTruthy();
  });

  it("renders empty state when no projects", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_projects") return Promise.resolve([]);
      if (cmd === "get_theme") return Promise.resolve("dark");
      if (cmd === "get_font_family") return Promise.resolve("Plus Jakarta Sans");
      if (cmd === "get_font_size") return Promise.resolve("14px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      return Promise.resolve(undefined);
    });

    const App = (await import("../App")).default;
    render(<App />);
    await act(async () => {});

    await vi.waitFor(() => {
      expect(screen.getByText("暂无项目")).toBeInTheDocument();
    });
  });

  it("applies theme class to root element", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_projects") return Promise.resolve([]);
      if (cmd === "get_theme") return Promise.resolve("dark");
      if (cmd === "get_font_family") return Promise.resolve("Plus Jakarta Sans");
      if (cmd === "get_font_size") return Promise.resolve("14px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      return Promise.resolve(undefined);
    });

    const App = (await import("../App")).default;
    render(<App />);
    await act(async () => {});

    await vi.waitFor(() => {
      expect(document.body.className).toContain("theme-dark");
    });
  });
});
