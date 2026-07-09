import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockTerminalInstance: Record<string, unknown>;
let mockFitAddonInstance: { fit: ReturnType<typeof vi.fn> };

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
  mockTerminalInstance = this;
}
vi.mock("@xterm/xterm", () => ({
  Terminal: FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function (this: { fit: ReturnType<typeof vi.fn> }) {
    this.fit = vi.fn();
    mockFitAddonInstance = this as unknown as { fit: ReturnType<typeof vi.fn> };
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const originalRAF = globalThis.requestAnimationFrame;
beforeEach(() => {
  vi.useFakeTimers();
  globalThis.requestAnimationFrame = vi.fn((cb: (t: number) => void) => {
    cb(0);
    return 0;
  });
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

describe("TerminalTab", () => {
  it("renders container div", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { container } = render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(container.querySelector('[style*="position: relative"]')).toBeTruthy();
    });
  });

  it("creates xterm Terminal instance on mount", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(mockTerminalInstance).toBeDefined();
      expect(mockTerminalInstance.cols).toBe(80);
    });
  });

  it("loads FitAddon into terminal", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(mockTerminalInstance.loadAddon).toHaveBeenCalled();
    });
  });

  it("calls pty_spawn on mount", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);

    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({
        sessionId: "sess-1",
        cwd: "/tmp",
      }));
    });
  });

  it("passes command and args to pty_spawn", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);

    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab
        sessionId="sess-2"
        cwd="/app"
        command="npm"
        args={["run", "test"]}
        isVisible={true}
      />
    );
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({
        sessionId: "sess-2",
        cwd: "/app",
        command: "npm",
        args: ["run", "test"],
      }));
    });
  });

  it("retrieves pty history after spawn", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "pty_spawn") return Promise.resolve(undefined);
      if (cmd === "pty_history") return Promise.resolve([72, 105]);
      return Promise.resolve(undefined);
    });

    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_history", { sessionId: "sess-1" });
    });
  });

  it("cleans up on unmount: disposes terminal and closes pty", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);

    const { TerminalTab } = await import("../components/TerminalTab");
    const { unmount } = render(
      <TerminalTab sessionId="sess-1" cwd="/tmp" isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_spawn", expect.any(Object));
    });

    unmount();

    expect(mockInvoke).toHaveBeenCalledWith("pty_close", { sessionId: "sess-1" });
  });

  it("renders with different themes", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { container: darkContainer } = render(
      <TerminalTab sessionId="s-1" cwd="/tmp" isVisible={true} theme="dark" />
    );
    expect(darkContainer.querySelector('[style*="background-color"]')).toBeTruthy();

    const { container: grayContainer } = render(
      <TerminalTab sessionId="s-2" cwd="/tmp" isVisible={true} theme="gray" />
    );
    expect(grayContainer.querySelector('[style*="background-color"]')).toBeTruthy();
  });
});
