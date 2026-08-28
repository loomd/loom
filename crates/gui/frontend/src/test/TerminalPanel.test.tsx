import React from "react";
import { render, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
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
beforeAll(async () => {
  // 预加载 TerminalTab，避免 React.lazy 在测试内异步解析触发 act 警告
  await import("../components/TerminalTab");
});
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

    let rerender!: ReturnType<typeof render>["rerender"];
    await act(async () => {
      ({ rerender } = render(
        <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode={null} showGrid={false} isVisible={true} />
      ));
    });
    await vi.waitFor(() => {
      expect(countSpawns("t1")).toBe(1);
    });

    await act(async () => {
      rerender(
        <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="1x2" showGrid={true} isVisible={true} />
      );
    });
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

  it.each(["2+1", "1+2"])("places composite layout %s panes on the expected grid areas", async (layout) => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode={layout as "2+1" | "1+2"} showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t3" }));
    });

    const expectedTemplate = layout === "2+1" ? '"a c" "b c"' : '"a b" "a c"';
    expect(container.querySelector('[data-testid="pane-t1"]')!.getAttribute("style")).toContain("grid-area: a");
    expect(container.querySelector('[data-testid="pane-t2"]')!.getAttribute("style")).toContain("grid-area: b");
    expect(container.querySelector('[data-testid="pane-t3"]')!.getAttribute("style")).toContain("grid-area: c");
    expect(container.querySelector(".grid-pane-container")!.getAttribute("style")).toContain(`grid-template-areas: ${expectedTemplate}`);
  });

  it("fills the remaining composite pane with an add-terminal button", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const onAddTerminal = vi.fn();

    const { container } = render(
      <TerminalPanel terminals={[t1]} activeTabId="t1" layoutMode="2+1" showGrid={true} isVisible={true} onAddTerminal={onAddTerminal} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t1" }));
    });

    const buttons = Array.from(container.querySelectorAll("button")).filter(b => b.textContent === "+ 新派生");
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(onAddTerminal).toHaveBeenCalledTimes(1);
  });

  function mockContainerRect(el: Element) {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 1000, height: 800, left: 0, top: 0, right: 1000, bottom: 800, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it("resizes columns when dragging the vertical splitter", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t2" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window);

    expect(grid.getAttribute("style")).toContain("grid-template-columns: 1.4fr 0.6");
  });

  it("resizes rows when dragging the horizontal splitter", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t2" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-row-0"]')!;
    fireEvent.mouseDown(splitter, { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 600 });
    fireEvent.mouseUp(window);

    expect(grid.getAttribute("style")).toContain("grid-template-rows: 1.5fr");
    expect(grid.getAttribute("style")).toContain("0.5fr;");
  });

  it.each(["2+1", "1+2"])("places split lines to match composite layout %s", async (layout) => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode={layout as "2+1" | "1+2"} showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t3" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    expect(grid.querySelector('[data-testid="split-col-0"]')).toBeTruthy();
    const rowSplitter = grid.querySelector('[data-testid="split-row-0"]')!;
    const expectedLeft = layout === "2+1" ? "left: 0%" : "left: 50%";
    expect(rowSplitter.getAttribute("style")).toContain(expectedLeft);
    expect(rowSplitter.getAttribute("style")).toContain("width: 50%");
  });

  it("keeps split weights per layout and restores them when switching back", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");

    const { rerender, container } = render(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode="2+1" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t3" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window);
    expect(grid.getAttribute("style")).toContain("grid-template-columns: 1.4fr 0.6");

    rerender(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode="1+2" showGrid={true} isVisible={true} />
    );
    const grid2 = container.querySelector(".grid-pane-container")!;
    expect(grid2.getAttribute("style")).toContain("grid-template-columns: 1fr 1fr");

    rerender(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode="2+1" showGrid={true} isVisible={true} />
    );
    const grid3 = container.querySelector(".grid-pane-container")!;
    expect(grid3.getAttribute("style")).toContain("grid-template-columns: 1.4fr 0.6");
  });

  it("resets split weights when the reset event fires for the current layout", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t2" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window);
    expect(grid.getAttribute("style")).toContain("grid-template-columns: 1.4fr 0.6");

    act(() => {
      window.dispatchEvent(new CustomEvent("loom-reset-splits", { detail: "2x2" }));
    });
    await vi.waitFor(() => {
      expect(grid.getAttribute("style")).toContain("grid-template-columns: 1fr 1fr");
    });
  });

  it("keeps the row splitter aligned with resized columns in 1+2 layout", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode="1+2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t3" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const rowSplitter = grid.querySelector('[data-testid="split-row-0"]')!;
    expect(rowSplitter.getAttribute("style")).toContain("left: 50%");
    expect(rowSplitter.getAttribute("style")).toContain("width: 50%");

    const colSplitter = grid.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(colSplitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseUp(window);

    await vi.waitFor(() => {
      expect(rowSplitter.getAttribute("style")).toContain("left: 30%");
    });
    expect(rowSplitter.getAttribute("style")).toContain("width: 70%");
  });

  it("dispatches splits-dirty events on drag and on reset", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const events: Array<{ layout: string; dirty: boolean }> = [];
    const onDirty = (e: Event) => {
      events.push((e as CustomEvent).detail);
    };
    window.addEventListener("loom-splits-dirty", onDirty);

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t2" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window);

    expect(events.some(e => e.layout === "2x2" && e.dirty)).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent("loom-reset-splits", { detail: "2x2" }));
    });
    await vi.waitFor(() => {
      expect(events.some(e => e.layout === "2x2" && !e.dirty)).toBe(true);
    });

    window.removeEventListener("loom-splits-dirty", onDirty);
  });

  it("does not move the other splitter when dragging one in 1x3 layout", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");

    const { container } = render(
      <TerminalPanel terminals={[t1, t2, t3]} activeTabId="t1" layoutMode="1x3" showGrid={true} isVisible={true} />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t3" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const row0 = grid.querySelector('[data-testid="split-row-0"]')!;
    const row1 = grid.querySelector('[data-testid="split-row-1"]')!;
    const row1Before = row1.getAttribute("style");

    fireEvent.mouseDown(row0, { clientY: 400 });
    fireEvent.mouseMove(window, { clientY: 700 });
    fireEvent.mouseUp(window);

    await vi.waitFor(() => {
      expect(row0.getAttribute("style")).toContain("calc(56.6667% - 3px)");
    });
    expect(row1.getAttribute("style")).toBe(row1Before);
    expect(grid.getAttribute("style")).toContain("grid-template-rows: 1.7fr 0.3");
  });

  it("scopes reset and dirty events to the matching project", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();
    invokeMock.mockResolvedValue([]);

    const { TerminalPanel } = await import("../components/TerminalPanel");
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const events: Array<{ projectId?: string; layout: string; dirty: boolean }> = [];
    const onDirty = (e: Event) => {
      events.push((e as CustomEvent).detail);
    };
    window.addEventListener("loom-splits-dirty", onDirty);

    const { container } = render(
      <TerminalPanel terminals={[t1, t2]} activeTabId="t1" layoutMode="2x2" showGrid={true} isVisible={true} projectId="proj-a" />
    );
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "t2" }));
    });

    const grid = container.querySelector(".grid-pane-container")!;
    mockContainerRect(grid);
    const splitter = container.querySelector('[data-testid="split-col-0"]')!;
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window);

    expect(events.some(e => e.projectId === "proj-a" && e.layout === "2x2" && e.dirty)).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent("loom-reset-splits", { detail: { projectId: "proj-b", layout: "2x2" } }));
    });
    expect(grid.getAttribute("style")).toContain("grid-template-columns: 1.4fr 0.6");

    act(() => {
      window.dispatchEvent(new CustomEvent("loom-reset-splits", { detail: { projectId: "proj-a", layout: "2x2" } }));
    });
    await vi.waitFor(() => {
      expect(grid.getAttribute("style")).toContain("grid-template-columns: 1fr 1fr");
    });

    window.removeEventListener("loom-splits-dirty", onDirty);
  });
});
