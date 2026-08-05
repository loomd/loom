import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConsoleTab } from "../hooks/useTabs";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function FakeTerminal(this: Record<string, unknown>, _opts: Record<string, unknown>) {
  const textarea = document.createElement("textarea");
  const element = document.createElement("div");
  const line = { getCell: vi.fn() };
  Object.assign(this, {
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
    buffer: {
      active: {
        cursorX: 0,
        cursorY: 0,
        viewportY: 0,
        getLine: vi.fn(() => line),
      },
    },
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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../api", () => ({
  openUrl: vi.fn(),
}));

const originalRAF = globalThis.requestAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.requestAnimationFrame = vi.fn((cb: (t: number) => void) => {
    cb(0);
    return 0;
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function MockResizeObserver(this: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }, _cb: ResizeObserverCallback) {
    this.observe = vi.fn();
    this.disconnect = vi.fn();
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.requestAnimationFrame = originalRAF;
});

function makeTerminal(id: string): ConsoleTab {
  return { id, title: `Terminal ${id}`, type: "terminal", cwd: "/tmp" };
}

describe("TerminalPanel", () => {
  it("does not recreate terminal sessions when switching between single and grid layout", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const countSpawns = (sessionId: string) =>
      invokeMock.mock.calls.filter(c => c[0] === "pty_spawn" && c[1]?.sessionId === sessionId).length;

    const { rerender } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode={null} showGrid={false} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(countSpawns("t1")).toBe(1);
    });

    rerender(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="1x2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(countSpawns("t2")).toBe(1);
    });
    expect(countSpawns("t1")).toBe(1);

    rerender(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t2" layoutMode="2x2" showGrid={true} isVisible={true} />
    );
    expect(countSpawns("t1")).toBe(1);
    expect(countSpawns("t2")).toBe(1);
  });

  it("keeps the remaining terminal alive when closing one while in 3x3 grid mode", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const countSpawns = (sessionId: string) =>
      invokeMock.mock.calls.filter(c => c[0] === "pty_spawn" && c[1]?.sessionId === sessionId).length;
    const countCloses = (sessionId: string) =>
      invokeMock.mock.calls.filter(c => c[0] === "pty_close" && c[1]?.sessionId === sessionId).length;

    const { rerender } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="3x3" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(countSpawns("t1")).toBe(1);
      expect(countSpawns("t2")).toBe(1);
    });

    rerender(
      <TerminalPanel terminals={[t1]} activeTabId="t1" layoutMode="3x3" showGrid={false} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(countCloses("t2")).toBe(1);
    });
    expect(countSpawns("t1")).toBe(1);
    expect(countSpawns("t2")).toBe(1);
  });

  it("reports pane focus when clicking a terminal pane in grid mode", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const onPaneFocus = vi.fn();

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} onPaneFocus={onPaneFocus} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t1" }));
    });

    fireEvent.click(container.querySelector('[data-testid="pane-t2"]')!);
    expect(onPaneFocus).toHaveBeenCalledWith("t2");
  });
});
