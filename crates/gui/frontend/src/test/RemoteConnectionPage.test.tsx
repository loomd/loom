import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import { DialogProvider } from "../DialogContext";
import RemoteConnectionPage from "../pages/RemoteConnectionPage";
import { invoke } from "@tauri-apps/api/core";
import type { AppServerSessionInfo, Project } from "../types";

const projects: Project[] = [
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

const stoppedSession: AppServerSessionInfo = {
  status: "stopped",
  pairingCode: null,
  workspaceDir: null,
  startedAtMs: null,
  expiresAtMs: null,
  pid: null,
  mobileDeviceName: null,
  message: null,
  relayUrl: "wss://agent.ccxcc.cn",
  username: "tester",
  loggedIn: true,
  mobilePaired: false,
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <DialogProvider>{children}</DialogProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function renderPage(session: AppServerSessionInfo = stoppedSession) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "get_relay_status") return session;
    return undefined;
  });
  return render(
    <TestWrapper>
      <RemoteConnectionPage projects={projects} active defaultProjectId="p1" />
    </TestWrapper>
  );
}

describe("RemoteConnectionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染中继、认证与远程会话三个区块", async () => {
    renderPage();
    expect(await screen.findByText("自建 Relay 中继服务器")).toBeInTheDocument();
    expect(screen.getByText("中继账号认证")).toBeInTheDocument();
    expect(screen.getByText("远程工作区会话")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue("wss://agent.ccxcc.cn")).toBeInTheDocument();
    });
  });

  it("工作区下拉框展开后可选择项目", async () => {
    renderPage();
    const trigger = await screen.findByRole("combobox", { name: "目标工作区项目" });
    // 默认选中当前工作区项目
    expect(trigger).toHaveTextContent("loom");

    fireEvent.click(trigger);
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("D:\\Develop\\loom");
    expect(options[1]).toHaveTextContent("D:\\Develop\\web");

    fireEvent.click(options[1]);
    await waitFor(() => {
      expect(trigger).toHaveTextContent("web");
      expect(trigger).toHaveTextContent("D:\\Develop\\web");
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("等待配对时展示配对码与倒计时", async () => {
    renderPage({
      ...stoppedSession,
      status: "waiting_pairing",
      pairingCode: "8421",
      workspaceDir: "D:\\Develop\\loom",
      expiresAtMs: Date.now() + 120_000,
    });
    expect(await screen.findByText("8421")).toBeInTheDocument();
    expect(screen.getByText(/有效时间剩余/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "断开连接并停止服务" })).toBeInTheDocument();
  });

  it("已绑定但手机端离线时不再索要配对码", async () => {
    renderPage({
      ...stoppedSession,
      status: "waiting_mobile",
      pairingCode: null,
      workspaceDir: "D:\\Develop\\loom",
      mobilePaired: true,
    });
    expect(await screen.findAllByText(/手机端已绑定，等待其自动重连/)).not.toHaveLength(0);
    expect(screen.queryByText(/有效时间剩余/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "解绑手机端" })).toBeInTheDocument();
  });

  it("未绑定时不展示解绑按钮", async () => {
    renderPage({
      ...stoppedSession,
      status: "waiting_pairing",
      pairingCode: "8421",
      workspaceDir: "D:\\Develop\\loom",
    });
    expect(await screen.findByText("8421")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "解绑手机端" })).not.toBeInTheDocument();
  });

  it("左上角提供侧边栏折叠/展开按钮，行为与项目区一致", () => {
    const onToggleSidebar = vi.fn();
    const { container, rerender } = render(
      <TestWrapper>
        <RemoteConnectionPage
          projects={projects}
          active
          defaultProjectId="p1"
          isSidebarCollapsed={false}
          onToggleSidebar={onToggleSidebar}
        />
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
        <RemoteConnectionPage
          projects={projects}
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

  it("未启用侧边栏折叠时不渲染切换按钮", () => {
    const { container } = render(
      <TestWrapper>
        <RemoteConnectionPage projects={projects} active defaultProjectId="p1" />
      </TestWrapper>
    );

    expect(container.querySelector(".sidebar-toggle-mini-btn")).toBeNull();
  });
});
