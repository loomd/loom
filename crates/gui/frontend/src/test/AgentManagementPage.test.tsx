import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import { DialogProvider } from "../DialogContext";
import { AgentManagementPage } from "../pages/AgentManagementPage";
import { invoke } from "@tauri-apps/api/core";

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <DialogProvider>{children}</DialogProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

describe("AgentManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "get_agent_discovery_status") {
        return {
          agents: [
            {
              name: "opencode",
              installed: true,
              version: "1.19.3",
              executable_path: "C:\\bin\\opencode.cmd",
              install_command: "npm install -g opencode-ai",
              download_url: "https://opencode.ai",
            },
            {
              name: "mcode",
              installed: true,
              version: "0.6.10",
              executable_path: "C:\\bin\\mcode.cmd",
              install_command: "irm https://install.ps1 | iex",
              download_url: "https://minimaxi.com",
            },
          ],
          npm_installed: true,
          npm_path: "C:\\bin\\npm.cmd",
          node_install_command: "winget install NodeJS",
          node_download_url: "https://nodejs.org",
        };
      }
      if (cmd === "check_agent_latest_version") {
        const payload = args as { agentName?: string };
        if (payload?.agentName === "opencode") {
          return "1.19.3"; // 已是最新
        }
        if (payload?.agentName === "mcode") {
          return "0.6.12"; // 0.6.10 -> 0.6.12，有新版本
        }
        return "1.0.0";
      }
      if (cmd === "get_injected_skill_paths") {
        return [];
      }
      if (cmd === "get_loom_skill_version") {
        return "0.8.1";
      }
      if (cmd === "get_loom_cli_status") {
        return { installed: true, version: "0.8.1" };
      }
      if (cmd === "get_cli_tools") {
        return [];
      }
      return null;
    });
  });

  it("配置引导页右上角包含三个窗口控制按钮", () => {
    const { container } = render(
      <TestWrapper>
        <AgentManagementPage active={true} />
      </TestWrapper>
    );

    const winCtrlBtns = container.querySelectorAll(".window-ctrl-btn");
    expect(winCtrlBtns.length).toBe(3);
  });

  it("左上角提供侧边栏折叠/展开按钮，行为与项目区一致", () => {
    const onToggleSidebar = vi.fn();
    const { container, rerender } = render(
      <TestWrapper>
        <AgentManagementPage active={true} isSidebarCollapsed={false} onToggleSidebar={onToggleSidebar} />
      </TestWrapper>
    );

    const btn = container.querySelector(".sidebar-toggle-mini-btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // 侧边栏展开时显示折叠箭头
    expect(btn.textContent).toBe("◀");
    expect(btn.getAttribute("title")).toBe("折叠侧边栏");

    fireEvent.click(btn);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    // 侧边栏折叠时显示展开箭头
    rerender(
      <TestWrapper>
        <AgentManagementPage active={true} isSidebarCollapsed={true} onToggleSidebar={onToggleSidebar} />
      </TestWrapper>
    );
    const collapsedBtn = container.querySelector(".sidebar-toggle-mini-btn") as HTMLButtonElement;
    expect(collapsedBtn.textContent).toBe("▶");
    expect(collapsedBtn.getAttribute("title")).toBe("展开侧边栏");
  });

  it("未启用侧边栏折叠时不渲染切换按钮", () => {
    const { container } = render(
      <TestWrapper>
        <AgentManagementPage active={true} />
      </TestWrapper>
    );

    expect(container.querySelector(".sidebar-toggle-mini-btn")).toBeNull();
  });

  it("当 active 为 true 时展示当前版本、检测最新版本并显示版本状态", async () => {
    const { findAllByText, findByText } = render(
      <TestWrapper>
        <AgentManagementPage active={true} />
      </TestWrapper>
    );

    // 验证当前版本展示（opencode 当前版本与最新版本均为 v1.19.3）
    const opencodeVersions = await findAllByText("v1.19.3");
    expect(opencodeVersions.length).toBeGreaterThanOrEqual(1);
    expect(await findByText("v0.6.10")).toBeDefined();

    // 验证最新版本与对比结果
    await waitFor(() => {
      // opencode: 当前 1.19.3，最新 1.19.3 -> 已是最新
      // mcode: 当前 0.6.10，最新 0.6.12 -> 有新版本
      expect(invoke).toHaveBeenCalledWith("check_agent_latest_version", { agentName: "opencode" });
      expect(invoke).toHaveBeenCalledWith("check_agent_latest_version", { agentName: "mcode" });
    });

    expect(await findByText("已是最新")).toBeDefined();
    expect(await findByText("有新版本")).toBeDefined();
    expect(await findByText(/检测到新版本 v0.6.12/)).toBeDefined();
  });

  it("当 active 为 false 时切出不触发最新版本检测", async () => {
    render(
      <TestWrapper>
        <AgentManagementPage active={false} />
      </TestWrapper>
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke).not.toHaveBeenCalledWith("check_agent_latest_version", expect.anything());
  });
});
