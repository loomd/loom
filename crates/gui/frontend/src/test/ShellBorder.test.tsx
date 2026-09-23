import React from "react";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "../I18nContext";
import { ToastProvider } from "../ToastContext";
import { DialogProvider } from "../DialogContext";
import GeneralSettingsTab from "../pages/settings/GeneralSettingsTab";
import { TerminalPanel, computeCollapsedBorders } from "../components/TerminalPanel";
import { TerminalTab } from "../components/TerminalTab";
import type { ConsoleTab } from "../hooks/useTabs";

// Mock tauri core & event
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.7.9")),
}));

vi.mock("../api", () => ({
  getAutostart: vi.fn(() => Promise.resolve(false)),
  setAutostart: vi.fn(() => Promise.resolve()),
  getUpdateCheckInterval: vi.fn(() => Promise.resolve("")),
  setUpdateCheckInterval: vi.fn(() => Promise.resolve()),
  getRestoreTerminals: vi.fn(() => Promise.resolve(true)),
  setRestoreTerminals: vi.fn(() => Promise.resolve()),
  getShellBorderEnabled: vi.fn(() => Promise.resolve(false)),
  setShellBorderEnabled: vi.fn(() => Promise.resolve()),
  getShellBorderColor: vi.fn(() => Promise.resolve("#8b5cf6")),
  setShellBorderColor: vi.fn(() => Promise.resolve()),
  getWhatsNewAll: vi.fn(() => Promise.resolve([])),
  openUrl: vi.fn(),
}));

function FakeTerminal(this: Record<string, unknown>, opts?: Record<string, unknown>) {
  const textarea = document.createElement("textarea");
  const element = document.createElement("div");
  Object.assign(this, {
    options: { fontSize: opts?.fontSize ?? 13 },
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    hasSelection: vi.fn(() => false),
    textarea,
    element,
    cols: 80,
    rows: 24,
  });
}

vi.mock("@xterm/xterm", () => ({
  Terminal: FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function (this: { fit: ReturnType<typeof vi.fn> }) {
    this.fit = vi.fn();
  }),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn(function (this: Record<string, unknown>) {}),
}));

// Mock ResizeObserver
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as unknown as typeof ResizeObserver;

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <DialogProvider>{ui}</DialogProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

describe("Shell Border Settings & Features", () => {
  const defaultSettingsProps = {
    theme: "dark" as const,
    onThemeChange: vi.fn(async () => {}),
    projectColumnAlign: "top",
    onProjectColumnAlignChange: vi.fn(async () => {}),
    fontFamily: "Plus Jakarta Sans",
    fontSize: "14px",
    onFontFamilyChange: vi.fn(async () => {}),
    onFontSizeChange: vi.fn(async () => {}),
    onCheckUpdate: vi.fn(async () => {}),
    floatingSidebarEnabled: false,
    onFloatingSidebarEnabledChange: vi.fn(),
    floatingSidebarPosition: "right" as const,
    onFloatingSidebarPositionChange: vi.fn(),
    sidebarCollapseEnabled: false,
    onSidebarCollapseEnabledChange: vi.fn(),
    bottomPanelMode: "embedded" as const,
    onBottomPanelModeChange: vi.fn(),
    shellBorderEnabled: false,
    onShellBorderEnabledChange: vi.fn(),
    shellBorderColor: "#8b5cf6",
    onShellBorderColorChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'shell边框' toggle and 'shell边框颜色选择' button in settings", async () => {
    await act(async () => {
      renderWithProviders(<GeneralSettingsTab {...defaultSettingsProps} />);
    });

    expect(screen.getByText("shell边框")).toBeInTheDocument();
    expect(screen.getByText("shell边框颜色选择")).toBeInTheDocument();
    expect(screen.getByText("#8b5cf6")).toBeInTheDocument();
  });

  it("triggers onShellBorderEnabledChange when toggling 'shell边框'", async () => {
    const onToggle = vi.fn();
    await act(async () => {
      renderWithProviders(
        <GeneralSettingsTab
          {...defaultSettingsProps}
          shellBorderEnabled={false}
          onShellBorderEnabledChange={onToggle}
        />
      );
    });

    const button = screen.getByTestId("shell-border-toggle");
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("opens palette modal and changes color when clicking preset", async () => {
    const onColorChange = vi.fn();
    await act(async () => {
      renderWithProviders(
        <GeneralSettingsTab
          {...defaultSettingsProps}
          shellBorderColor="#8b5cf6"
          onShellBorderColorChange={onColorChange}
        />
      );
    });

    // Click color picker trigger
    const colorBtn = screen.getByTestId("shell-border-color-btn");
    expect(colorBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(colorBtn);
    });

    // Modal should be opened
    expect(screen.getByTestId("shell-border-color-modal")).toBeInTheDocument();
    expect(screen.getByText("选择 shell 边框颜色")).toBeInTheDocument();

    // Select a preset (e.g. 科技蓝 #3b82f6)
    const bluePreset = screen.getByTitle("科技蓝");
    await act(async () => {
      fireEvent.click(bluePreset);
    });

    // Click '确定'
    const confirmBtn = screen.getByText("确定");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(onColorChange).toHaveBeenCalledWith("#3b82f6");
    expect(screen.queryByTestId("shell-border-color-modal")).not.toBeInTheDocument();
  });

  it("TerminalTab applies simple colored line border without glow when borderColor is provided", () => {
    const { container } = render(
      <TerminalTab
        sessionId="s1"
        cwd="/test"
        isVisible={true}
        borderColor="#3b82f6"
      />
    );

    const outer = container.firstChild as HTMLElement;
    expect(outer.style.border).toBe("2px solid rgb(59, 130, 246)");
    expect(outer.style.boxShadow).toBe("");
  });

  it("TerminalTab falls back to subtle border when borderColor is not provided", () => {
    const { container } = render(
      <TerminalTab
        sessionId="s1"
        cwd="/test"
        isVisible={true}
      />
    );

    const outer = container.firstChild as HTMLElement;
    expect(outer.style.border).toContain("var(--border-subtle");
  });

  it("TerminalPanel in multi-split mode only renders borders on spawned shells, and not on empty slots", async () => {
    const terminals: ConsoleTab[] = [
      { id: "tab-1", title: "Terminal 1", cwd: "/test" },
    ];
    // 2-slot grid, only slot 0 has terminal, slot 1 is empty (null)
    const terminalSlots = ["tab-1", null];

    let rendered: ReturnType<typeof render>;
    await act(async () => {
      rendered = render(
        <TerminalPanel
          terminals={terminals}
          terminalSlots={terminalSlots}
          activeTabId="tab-1"
          layoutMode="1x2"
          showGrid={true}
          isVisible={true}
          shellBorderEnabled={true}
          shellBorderColor="#10b981"
        />
      );
    });

    // Spawned terminal pane exists
    const pane1 = rendered!.container.querySelector('[data-testid="pane-tab-1"]') as HTMLElement;
    expect(pane1).toBeTruthy();
    expect(pane1.style.display).toBe("flex");

    // Empty slot should have '+ 新派生' button and no shell border
    const emptyBtn = screen.getByText("+ 新派生");
    expect(emptyBtn).toBeInTheDocument();
    const emptySlot = emptyBtn.parentElement as HTMLElement;
    expect(emptySlot.style.border).toBe("");
  });

  describe("computeCollapsedBorders border collapse logic", () => {
    it("merges adjacent borders in 2x1 horizontal split (A on left, B on right)", () => {
      const activeSlots: (ConsoleTab | null)[] = [
        { id: "tab-a", title: "A", cwd: "" },
        { id: "tab-b", title: "B", cwd: "" },
      ];
      const areas = '"a b" "a b"';

      const borderA = computeCollapsedBorders("a", areas, activeSlots, "#8b5cf6");
      const borderB = computeCollapsedBorders("b", areas, activeSlots, "#8b5cf6");

      // Slot A: left side, keeps left and right borders
      expect(borderA.borderLeft).toBe("2px solid #8b5cf6");
      expect(borderA.borderRight).toBe("2px solid #8b5cf6");
      expect(borderA.borderTopLeftRadius).toBe("4px");
      expect(borderA.borderTopRightRadius).toBe("0px");

      // Slot B: right side, has left neighbor A with shell -> borderLeft collapsed to 0px
      expect(borderB.borderLeft).toBe("0px");
      expect(borderB.borderRight).toBe("2px solid #8b5cf6");
      expect(borderB.borderTopLeftRadius).toBe("0px");
      expect(borderB.borderTopRightRadius).toBe("4px");
    });

    it("merges adjacent borders in 1x2 vertical split (A on top, B on bottom)", () => {
      const activeSlots: (ConsoleTab | null)[] = [
        { id: "tab-a", title: "A", cwd: "" },
        { id: "tab-b", title: "B", cwd: "" },
      ];
      const areas = '"a a" "b b"';

      const borderA = computeCollapsedBorders("a", areas, activeSlots, "#8b5cf6");
      const borderB = computeCollapsedBorders("b", areas, activeSlots, "#8b5cf6");

      // Slot A: top, keeps top and bottom borders
      expect(borderA.borderTop).toBe("2px solid #8b5cf6");
      expect(borderA.borderBottom).toBe("2px solid #8b5cf6");

      // Slot B: bottom, has top neighbor A with shell -> borderTop collapsed to 0px
      expect(borderB.borderTop).toBe("0px");
      expect(borderB.borderBottom).toBe("2px solid #8b5cf6");
    });

    it("does not collapse border if adjacent neighbor is an empty slot", () => {
      // Slot A has shell, Slot B is null (empty)
      const activeSlots: (ConsoleTab | null)[] = [
        { id: "tab-a", title: "A", cwd: "" },
        null,
      ];
      const areas = '"a b" "a b"';

      // If A is null and B has shell
      const activeSlotsWithBOnly: (ConsoleTab | null)[] = [
        null,
        { id: "tab-b", title: "B", cwd: "" },
      ];
      const borderB = computeCollapsedBorders("b", areas, activeSlotsWithBOnly, "#8b5cf6");

      // Since neighbor A is empty, B must NOT collapse its borderLeft
      expect(borderB.borderLeft).toBe("2px solid #8b5cf6");
      expect(borderB.borderRight).toBe("2px solid #8b5cf6");
    });
  });
});
