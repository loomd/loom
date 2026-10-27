import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import { DialogProvider } from "../DialogContext";
import HermesPage from "../pages/HermesPage";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const mockProjects: Project[] = [
  {
    id: "p1",
    name: "loom",
    root_path: "D:\\Develop\\loom",
    env_profiles: {},
    quick_commands: [],
  },
  {
    id: "p2",
    name: "web",
    root_path: "D:\\Develop\\web",
    env_profiles: {},
    quick_commands: [],
  },
];

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <DialogProvider>{children}</DialogProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

describe("HermesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_hermes_config") {
        return {
          app_id: "cli_123456",
          app_secret: "secret_123456",
          default_project_id: "p1",
        };
      }
      if (cmd === "get_hermes_status") {
        return {
          state: "stopped",
          log_entries: [],
        };
      }
      return undefined;
    });
  });

  it("页面右上角包含三个窗口控制按钮", async () => {
    const { container } = render(
      <TestWrapper>
        <HermesPage projects={mockProjects} active defaultProjectId="p1" />
      </TestWrapper>
    );

    await waitFor(() => {
      const winCtrlBtns = container.querySelectorAll(".window-ctrl-btn");
      expect(winCtrlBtns.length).toBe(3);
    });
  });

  it("左上角提供侧边栏折叠/展开按钮，行为与远程连接页一致", async () => {
    const onToggleSidebar = vi.fn();
    const { container, rerender } = render(
      <TestWrapper>
        <HermesPage
          projects={mockProjects}
          active
          defaultProjectId="p1"
          isSidebarCollapsed={false}
          onToggleSidebar={onToggleSidebar}
        />
      </TestWrapper>
    );

    const btn = container.querySelector(".sidebar-toggle-mini-btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe("◀");
    expect(btn.getAttribute("title")).toBe("折叠侧边栏");

    fireEvent.click(btn);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    rerender(
      <TestWrapper>
        <HermesPage
          projects={mockProjects}
          active
          defaultProjectId="p1"
          isSidebarCollapsed={true}
          onToggleSidebar={onToggleSidebar}
        />
      </TestWrapper>
    );

    const collapsedBtn = container.querySelector(".sidebar-toggle-mini-btn") as HTMLButtonElement;
    expect(collapsedBtn.textContent).toBe("▶");
    expect(collapsedBtn.getAttribute("title")).toBe("展开侧边栏");
  });

  it("未传 onToggleSidebar 时不渲染折叠切换按钮", () => {
    const { container } = render(
      <TestWrapper>
        <HermesPage projects={mockProjects} active defaultProjectId="p1" />
      </TestWrapper>
    );

    expect(container.querySelector(".sidebar-toggle-mini-btn")).toBeNull();
  });

  it("已选择工作区时点击启动，正确调用 start_hermes_service 传递 root_path", async () => {
    const invokeMock = vi.mocked(invoke);
    const { container } = render(
      <TestWrapper>
        <HermesPage projects={mockProjects} active defaultProjectId="p1" />
      </TestWrapper>
    );

    // 等待配置加载完毕（App ID、Secret 已填充）
    await waitFor(() => {
      const startBtn = container.querySelector(".btn-primary") as HTMLButtonElement;
      expect(startBtn).toBeTruthy();
      expect(startBtn.disabled).toBe(false);
    });

    const startBtn = container.querySelector(".btn-primary") as HTMLButtonElement;
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "start_hermes_service",
        expect.objectContaining({
          appId: "cli_123456",
          appSecret: "secret_123456",
          projectPath: "D:\\Develop\\loom",
        })
      );
    });
  });
});
