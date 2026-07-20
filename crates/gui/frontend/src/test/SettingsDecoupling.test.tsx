import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import WindowControlButtons from "../components/WindowControlButtons";
import GeneralSettingsTab from "../pages/settings/GeneralSettingsTab";
import CliToolsTab from "../pages/settings/CliToolsTab";
import LibsTab from "../pages/settings/LibsTab";
import CliToolConfigModal from "../components/CliToolConfigModal";
import GlobalSkillModal from "../components/GlobalSkillModal";
import GlobalDocModal from "../components/GlobalDocModal";
import SettingsPage from "../pages/SettingsPage";
import type { CliTool, GlobalSkillTemplate, GlobalDocTemplate } from "../types";

// Wrapper to provide i18n and toast context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// Mock invoke for components that need it
import { invoke } from "@tauri-apps/api/core";

describe("WindowControlButtons", () => {
  it("renders maximize and close buttons", () => {
    const { container } = renderWithProviders(<WindowControlButtons />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);
  });
});

describe("GeneralSettingsTab", () => {
  const defaultProps = {
    theme: "dark" as const,
    onThemeChange: vi.fn(async () => {}),
    projectColumnAlign: "top",
    onProjectColumnAlignChange: vi.fn(async () => {}),
    fontFamily: "Plus Jakarta Sans",
    fontSize: "14px",
    onFontFamilyChange: vi.fn(async () => {}),
    onFontSizeChange: vi.fn(async () => {}),
    onCheckUpdate: vi.fn(async () => {}),
    floatingSidebarEnabled: true,
    onFloatingSidebarEnabledChange: vi.fn(),
    floatingSidebarPosition: "right" as const,
    onFloatingSidebarPositionChange: vi.fn(),
    sidebarCollapseEnabled: false,
    onSidebarCollapseEnabledChange: vi.fn(),
    onboarding: {
      state: {
        showWizard: false,
        currentStep: 0,
        isScanning: false,
        isCompleting: false,
        agents: [],
        tools: [],
        allResults: [],
        selectedAgents: new Set<string>(),
      },
      checkOnboarding: vi.fn(async () => false),
      startScan: vi.fn(async () => {}),
      reopenWizard: vi.fn(async () => {}),
      goNext: vi.fn(),
      goPrev: vi.fn(),
      selectAgentResult: vi.fn(),
      toggleAllSelected: vi.fn(),
      closeWizard: vi.fn(async () => {}),
      skipWizard: vi.fn(async () => {}),
    },
  };

  it("renders theme section", async () => {
    await act(async () => {
      renderWithProviders(<GeneralSettingsTab {...defaultProps} />);
    });
    expect(screen.getByText("界面主题")).toBeInTheDocument();
  });

  it("renders font section", async () => {
    await act(async () => {
      renderWithProviders(<GeneralSettingsTab {...defaultProps} />);
    });
    expect(screen.getByText("字体管理")).toBeInTheDocument();
  });

  it("renders language section", async () => {
    await act(async () => {
      renderWithProviders(<GeneralSettingsTab {...defaultProps} />);
    });
    expect(screen.getByText("简体中文")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("renders version info", async () => {
    await act(async () => {
      renderWithProviders(<GeneralSettingsTab {...defaultProps} />);
    });
    expect(screen.getAllByText(/Loom/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("CliToolsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string) => {
        if (cmd === "get_categories") return Promise.resolve([]);
        return Promise.resolve([]);
      }
    );
  });

  it("renders scan and import buttons", async () => {
    await act(async () => {
      renderWithProviders(<CliToolsTab />);
    });
    expect(screen.getByText((c) => c.includes("扫描 PATH"))).toBeInTheDocument();
  });
});

describe("LibsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skills and docs sections", async () => {
    await act(async () => {
      renderWithProviders(<LibsTab />);
    });
    const skills = screen.getAllByText((c) => c.includes("技能模版"));
    expect(skills.length).toBeGreaterThanOrEqual(1);
    const docs = screen.getAllByText((c) => c.includes("规则文档"));
    expect(docs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("CliToolConfigModal", () => {
  const mockTool: CliTool = {
    id: "tool-1",
    name: "test-tool",
    path: "/usr/bin/test",
    version: "1.0.0",
    custom_env: {},
    custom_args: [],
    is_agent: false,
  };

  it("renders modal with tool info", async () => {
    await act(async () => {
      renderWithProviders(
        <CliToolConfigModal tool={mockTool} onClose={vi.fn()} onSave={vi.fn()} />
      );
    });
    expect(screen.getByText((c) => c.includes("配置"))).toBeInTheDocument();
  });

  it("calls onClose when overlay clicked", async () => {
    const onClose = vi.fn();
    const { container } = await act(async () => {
      return renderWithProviders(
        <CliToolConfigModal tool={mockTool} onClose={onClose} onSave={vi.fn()} />
      );
    });
    const overlay = container.querySelector(".modal-overlay");
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("GlobalSkillModal", () => {
  const mockSkill: GlobalSkillTemplate = {
    id: "skill-1",
    name: "test-skill",
    description: "A test skill",
    content: "# Skill content",
    files: {},
  };

  it("renders in create mode", () => {
    renderWithProviders(
      <GlobalSkillModal onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText("新建全局技能文件夹")).toBeInTheDocument();
  });

  it("renders in edit mode", () => {
    renderWithProviders(
      <GlobalSkillModal skill={mockSkill} isEdit={true} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText("编辑全局技能文件夹")).toBeInTheDocument();
  });
});

describe("GlobalDocModal", () => {
  const mockDoc: GlobalDocTemplate = {
    id: "doc-1",
    alias: "test-doc",
    default_filename: "TEST.md",
    content: "# Doc content",
  };

  it("renders in create mode", () => {
    renderWithProviders(
      <GlobalDocModal onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText("新建全局规则文档")).toBeInTheDocument();
  });

  it("renders in edit mode", () => {
    renderWithProviders(
      <GlobalDocModal doc={mockDoc} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText("编辑全局规则文档")).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  const defaultProps = {
    theme: "dark" as const,
    onThemeChange: vi.fn(async () => {}),
    projectColumnAlign: "top",
    onProjectColumnAlignChange: vi.fn(async () => {}),
    fontFamily: "Plus Jakarta Sans",
    fontSize: "14px",
    onFontFamilyChange: vi.fn(async () => {}),
    onFontSizeChange: vi.fn(async () => {}),
    onCheckUpdate: vi.fn(async () => {}),
    floatingSidebarEnabled: true,
    onFloatingSidebarEnabledChange: vi.fn(),
    floatingSidebarPosition: "right" as const,
    onFloatingSidebarPositionChange: vi.fn(),
    sidebarCollapseEnabled: false,
    onSidebarCollapseEnabledChange: vi.fn(),
    onboarding: {
      state: {
        showWizard: false,
        currentStep: 0,
        isScanning: false,
        isCompleting: false,
        agents: [],
        tools: [],
        allResults: [],
        selectedAgents: new Set<string>(),
      },
      checkOnboarding: vi.fn(async () => false),
      startScan: vi.fn(async () => {}),
      reopenWizard: vi.fn(async () => {}),
      goNext: vi.fn(),
      goPrev: vi.fn(),
      selectAgentResult: vi.fn(),
      toggleAllSelected: vi.fn(),
      closeWizard: vi.fn(async () => {}),
      skipWizard: vi.fn(async () => {}),
    },
  };

  it("renders page header with title", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    const titles = screen.getAllByText("系统设置");
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it("renders all 4 tab buttons", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    expect(screen.getByText((c) => c.includes("外观偏好"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("CLI 工具"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("环境变量"))).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("模版库管理"))).toBeInTheDocument();
  });

  it("shows general tab by default", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    expect(screen.getByText("界面主题")).toBeInTheDocument();
  });

  it("switches to tools tab on click", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    const toolsTab = screen.getByText((c) => c.includes("CLI 工具"));
    await act(async () => { fireEvent.click(toolsTab); });
    expect(screen.getByText((c) => c.includes("扫描 PATH"))).toBeInTheDocument();
  });

  it("switches to env tab on click", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    const envTab = screen.getByText((c) => c.includes("环境变量"));
    await act(async () => { fireEvent.click(envTab); });
    expect(screen.getByText("全局环境变量")).toBeInTheDocument();
  });

  it("switches to libs tab on click", async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage {...defaultProps} />);
    });
    const libsTab = screen.getByText((c) => c.includes("模版库管理"));
    await act(async () => { fireEvent.click(libsTab); });
    const skills = screen.getAllByText((c) => c.includes("技能模版"));
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });
});
