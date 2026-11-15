import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import { DialogProvider } from "../DialogContext";
import { AgentManagementPage } from "../pages/AgentManagementPage";
import { cleanBaseUrlComment, normalizeAgyBaseUrl } from "../utils";
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
            {
              name: "agy",
              installed: true,
              version: "1.5.9",
              executable_path: "C:\\bin\\agy.cmd",
              install_command: "irm https://antigravity.google/cli/install.ps1 | iex",
              download_url: "https://antigravity.google/product/antigravity-cli",
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
        if (payload?.agentName === "agy") {
          return "1.5.9"; // 已是最新
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
      // agy: 当前 1.5.9，最新 1.5.9 -> 已是最新
      expect(invoke).toHaveBeenCalledWith("check_agent_latest_version", { agentName: "opencode" });
      expect(invoke).toHaveBeenCalledWith("check_agent_latest_version", { agentName: "mcode" });
      expect(invoke).toHaveBeenCalledWith("check_agent_latest_version", { agentName: "agy" });
    });

    const latestBadges = await findAllByText("已是最新");
    expect(latestBadges.length).toBe(2);
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

  it("切换选择 Antigravity CLI 时仅支持 Gemini 协议并提供正确的占位提示", async () => {
    const { findByText, findAllByText, getByPlaceholderText, queryByText } = render(
      <TestWrapper>
        <AgentManagementPage active={true} />
      </TestWrapper>
    );

    // 查找并点击选择 agy 卡片
    const agyLabels = await findAllByText("Antigravity CLI");
    expect(agyLabels.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(agyLabels[0]);

    // 验证切换后标题变为 Antigravity CLI 模型自动配置（列表中一个，标题中一个）
    const activeTitles = await findAllByText("Antigravity CLI");
    expect(activeTitles.length).toBe(2);

    // 验证协议兼容性限制文案
    expect(await findByText("agy 暂时仅支持 Gemini 原生接口")).toBeDefined();

    // 验证仅展示 Gemini 协议，不展示 OpenAI 兼容
    expect(await findByText("Gemini")).toBeDefined();
    expect(queryByText("OpenAI 兼容")).toBeNull();

    // 验证 Base URL placeholder 提示
    const baseUrlInput = getByPlaceholderText("请输入站点根路径");
    expect(baseUrlInput).toBeDefined();
  });

  it("cleanBaseUrlComment 与 normalizeAgyBaseUrl 正确剥离各类括号备注与后缀", () => {
    // 括号备注
    expect(cleanBaseUrlComment("https://code.ai80.vip (站点根路径)")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip（官方推荐）")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip【推荐】")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip[官方]")).toBe("https://code.ai80.vip");

    // 注释符号
    expect(cleanBaseUrlComment("https://code.ai80.vip # 注意不要带v1")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip // 备注")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip/* block */")).toBe("https://code.ai80.vip");
    expect(cleanBaseUrlComment("https://code.ai80.vip; 分号说明")).toBe("https://code.ai80.vip");

    // normalizeAgyBaseUrl 清洗
    expect(normalizeAgyBaseUrl("https://code.ai80.vip/v1/ (站点根路径)")).toBe("https://code.ai80.vip");
    expect(normalizeAgyBaseUrl("https://code.ai80.vip/v1beta")).toBe("https://code.ai80.vip");
    expect(normalizeAgyBaseUrl("https://code.ai80.vip/gemini")).toBe("https://code.ai80.vip");
    expect(normalizeAgyBaseUrl("https://code.ai80.vip/models/")).toBe("https://code.ai80.vip");
  });

  it("配置引导保存 agy 配置与 Loom 运行模板时追加 --dangerously-skip-permissions 参数", async () => {
    // Mock fetch_provider_models 及后续调用
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_agent_discovery_status") {
        return {
          agents: [
            {
              name: "agy",
              installed: true,
              version: "1.5.9",
              executable_path: "C:\\bin\\agy.cmd",
              install_command: "irm https://install.ps1 | iex",
              download_url: "https://antigravity.google",
            },
          ],
          npm_installed: true,
          npm_path: "C:\\bin\\npm.cmd",
          node_install_command: "winget install NodeJS",
          node_download_url: "https://nodejs.org",
        };
      }
      if (cmd === "check_agent_latest_version") {
        return "1.5.9";
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
      if (cmd === "fetch_provider_models") {
        return [
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }
        ];
      }
      if (cmd === "configure_agy_provider") {
        return "C:\\Users\\test\\.gemini\\antigravity-cli\\settings.json";
      }
      if (cmd === "get_cli_tools") {
        return [{ id: "cli-agy-id", name: "agy", path: "C:\\bin\\agy.cmd" }];
      }
      if (cmd === "get_templates") {
        return [];
      }
      if (cmd === "create_template") {
        return {
          id: "tpl-1",
          cli_id: "cli-agy-id",
          name: "agy gemini-2.5-pro",
          args: ["--model", "gemini-2.5-pro", "--dangerously-skip-permissions"],
          env: {},
          env_var_ids: [],
          created_at: 1000,
          updated_at: 1000,
        };
      }
      return null;
    });

    const { findAllByText, findByText, getByPlaceholderText } = render(
      <TestWrapper>
        <AgentManagementPage active={true} />
      </TestWrapper>
    );

    // 选中 agy
    const agyLabels = await findAllByText("Antigravity CLI");
    fireEvent.click(agyLabels[0]);

    // 填写 Base URL 和 API Key
    const baseUrlInput = getByPlaceholderText("请输入站点根路径");
    fireEvent.change(baseUrlInput, { target: { value: "https://code.ai80.vip" } });

    // 点击获取模型
    const fetchBtn = await findByText("获取模型列表");
    fireEvent.click(fetchBtn);

    // 等待模型加载并勾选
    const modelItem = await findByText("Gemini 2.5 Pro");
    fireEvent.click(modelItem);

    // 点击保存并创建模板
    const saveBtn = await findByText(/写入 settings\.json & 自动创建 Loom 运行模板/);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("create_template", expect.objectContaining({
        args: ["--model", "gemini-2.5-pro", "--dangerously-skip-permissions"],
      }));
    });
  });
});
