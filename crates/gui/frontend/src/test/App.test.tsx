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
      if (cmd === "get_font_size") return Promise.resolve("15px");
      if (cmd === "get_terminal_font_size") return Promise.resolve("13px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      if (cmd === "get_bottom_panel_height") return Promise.resolve(0);
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
      if (cmd === "get_font_size") return Promise.resolve("15px");
      if (cmd === "get_terminal_font_size") return Promise.resolve("13px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      if (cmd === "get_bottom_panel_height") return Promise.resolve(0);
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
      if (cmd === "get_font_size") return Promise.resolve("15px");
      if (cmd === "get_terminal_font_size") return Promise.resolve("13px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      if (cmd === "get_bottom_panel_height") return Promise.resolve(0);
      return Promise.resolve(undefined);
    });

    const App = (await import("../App")).default;
    render(<App />);
    await act(async () => {});

    await vi.waitFor(() => {
      expect(document.body.className).toContain("theme-dark");
    });
  });

  it("switches to the notification's project when the toast is clicked", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_projects") {
        return Promise.resolve([
          { id: "p1", name: "alpha", root_path: "D:\\Develop\\alpha" },
          { id: "p2", name: "beta", root_path: "D:\\Develop\\beta" },
        ]);
      }
      if (cmd === "get_theme") return Promise.resolve("dark");
      if (cmd === "get_font_family") return Promise.resolve("Plus Jakarta Sans");
      if (cmd === "get_font_size") return Promise.resolve("15px");
      if (cmd === "get_terminal_font_size") return Promise.resolve("13px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      if (cmd === "get_bottom_panel_height") return Promise.resolve(0);
      return Promise.resolve(undefined);
    });

    const { listen: mockListen } = await import("@tauri-apps/api/event");
    const listenMock = mockListen as ReturnType<typeof vi.fn>;

    const App = (await import("../App")).default;
    render(<App />);
    await act(async () => {});

    await vi.waitFor(() => {
      expect(screen.getByText("alpha")).toBeInTheDocument();
    });

    const handlerCall = listenMock.mock.calls.find((c) => c[0] === "agent-notification-activate");
    expect(handlerCall).toBeTruthy();
    const handler = handlerCall![1] as (e: unknown) => void;

    const activeNames = () =>
      Array.from(document.querySelectorAll(".nav-item.active")).map((el) => el.textContent ?? "");

    await vi.waitFor(() => expect(activeNames().join()).toContain("alpha"));

    // 故意使用大小写、斜杠与末尾分隔符都不同的路径，验证路径归一化生效
    await act(async () => {
      handler({
        payload: {
          project_root: "d:/develop/beta/",
          pty_session_id: "pty-7",
          trigger: "completed",
          title: "Loom - Agent 任务已完成",
        },
      });
    });

    await vi.waitFor(() => {
      const active = activeNames().join();
      expect(active).toContain("beta");
      expect(active).not.toContain("alpha");
    });
  });

  it("keeps the current project when the notification's project no longer exists", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_projects") {
        return Promise.resolve([{ id: "p1", name: "alpha", root_path: "D:\\Develop\\alpha" }]);
      }
      if (cmd === "get_theme") return Promise.resolve("dark");
      if (cmd === "get_font_family") return Promise.resolve("Plus Jakarta Sans");
      if (cmd === "get_font_size") return Promise.resolve("15px");
      if (cmd === "get_terminal_font_size") return Promise.resolve("13px");
      if (cmd === "get_project_column_align") return Promise.resolve("top");
      if (cmd === "get_language") return Promise.resolve("zh");
      if (cmd === "get_sidebar_width") return Promise.resolve(170);
      if (cmd === "get_floating_sidebar_enabled") return Promise.resolve(false);
      if (cmd === "get_floating_sidebar_position") return Promise.resolve("right");
      if (cmd === "get_bottom_panel_mode") return Promise.resolve("embedded");
      if (cmd === "get_bottom_panel_height") return Promise.resolve(0);
      return Promise.resolve(undefined);
    });

    const { listen: mockListen } = await import("@tauri-apps/api/event");
    const listenMock = mockListen as ReturnType<typeof vi.fn>;

    const App = (await import("../App")).default;
    render(<App />);
    await act(async () => {});

    const handlerCall = listenMock.mock.calls.find((c) => c[0] === "agent-notification-activate");
    expect(handlerCall).toBeTruthy();
    const handler = handlerCall![1] as (e: unknown) => void;

    const activeNames = () =>
      Array.from(document.querySelectorAll(".nav-item.active")).map((el) => el.textContent ?? "");

    await vi.waitFor(() => expect(activeNames().join()).toContain("alpha"));

    await act(async () => {
      handler({
        payload: {
          project_root: "E:\\nowhere",
          pty_session_id: "pty-9",
          trigger: "error",
          title: "Loom - Agent 执行异常",
        },
      });
    });

    // 项目已不存在：不应把用户带到别处，停留在原项目
    expect(activeNames().join()).toContain("alpha");
  });
});