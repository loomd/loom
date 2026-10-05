import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockTerminalInstance: Record<string, unknown>;

function FakeTerminal(this: Record<string, unknown>, opts?: Record<string, unknown>) {
  const textarea = document.createElement("textarea");
  const element = document.createElement("div");
  const compositionView = document.createElement("div");
  compositionView.className = "composition-view";
  element.append(textarea, compositionView);
  let composing = false;
  const syncTextArea = vi.fn(() => {
    if (composing) return;
    textarea.style.left = "30px";
    textarea.style.top = "40px";
  });
  const updateCompositionElements = vi.fn(() => {
    if (!composing) return;
    compositionView.style.left = textarea.style.left = "30px";
    compositionView.style.top = textarea.style.top = "40px";
  });
  const nativeStart = vi.fn(() => {
    composing = true;
    return { left: textarea.style.left, top: textarea.style.top };
  });
  textarea.addEventListener("compositionstart", nativeStart);
  textarea.addEventListener("compositionupdate", updateCompositionElements);
  textarea.addEventListener("compositionend", () => { composing = false; });
  const line = { getCell: vi.fn() };
  Object.assign(this, {
    options: { fontSize: opts?.fontSize ?? 13 },
    loadAddon: vi.fn(),
    open: vi.fn((container: HTMLElement) => container.append(element)),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    onRender: vi.fn(() => ({ dispose: vi.fn() })),
    _core: {
      _syncTextArea: syncTextArea,
      _compositionHelper: { updateCompositionElements },
    },
    nativeStart,
    write: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    refresh: vi.fn(),
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
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  mockTerminalInstance = this;
}
vi.mock("@xterm/xterm", () => ({
  Terminal: FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function (this: { fit: ReturnType<typeof vi.fn> }) {
    this.fit = vi.fn();
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

describe("TerminalTab", () => {
  it("resynchronizes before native composition starts and aligns both IME elements immediately", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { container } = render(<TerminalTab sessionId="ime-start" cwd="/tmp" isVisible={true} />);
    await vi.advanceTimersByTimeAsync(100);
    const textarea = mockTerminalInstance.textarea as HTMLTextAreaElement;
    textarea.style.left = "790px";
    textarea.style.top = "460px";
    textarea.value = "existing";
    const event = new CompositionEvent("compositionstart", { bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);

    expect(mockTerminalInstance.nativeStart).toHaveReturnedWith({ left: "30px", top: "40px" });
    const view = container.querySelector<HTMLElement>(".composition-view")!;
    expect(view.style.left).toBe("30px");
    expect(view.style.top).toBe("40px");
    expect(view.parentElement!.parentElement!.style.getPropertyValue("--ime-left")).toBe("30px");
    expect(textarea.value).toBe("existing");
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps repeated preedit updates aligned without replacing composed text", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { container } = render(<TerminalTab sessionId="ime-update" cwd="/tmp" isVisible={true} />);
    await vi.advanceTimersByTimeAsync(100);
    const textarea = mockTerminalInstance.textarea as HTMLTextAreaElement;
    for (const value of ["ni", "你好", "hao"]) {
      textarea.dispatchEvent(new CompositionEvent("compositionstart"));
      textarea.value = value;
      textarea.dispatchEvent(new CompositionEvent("compositionupdate", { data: value }));
      const view = container.querySelector<HTMLElement>(".composition-view")!;
      expect(textarea.style.left).toBe(view.style.left);
      expect(textarea.style.top).toBe(view.style.top);
      expect(textarea.value).toBe(value);
      textarea.dispatchEvent(new CompositionEvent("compositionend", { data: value }));
      expect(textarea.value).toBe(value);
    }
  });

  it("refreshes stale coordinates on resize/render and disposes the synchronization listeners", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { unmount } = render(<TerminalTab sessionId="ime-resize" cwd="/tmp" isVisible={true} />);
    await vi.advanceTimersByTimeAsync(100);
    const textarea = mockTerminalInstance.textarea as HTMLTextAreaElement;
    const onResize = mockTerminalInstance.onResize as ReturnType<typeof vi.fn>;
    const onRender = mockTerminalInstance.onRender as ReturnType<typeof vi.fn>;
    expect(onResize).toHaveBeenCalled();
    expect(onRender).toHaveBeenCalled();
    for (const subscribe of [onResize, onRender]) {
      textarea.style.left = "790px";
      textarea.style.top = "460px";
      subscribe.mock.calls[0][0]();
      expect(textarea.style.left).toBe("30px");
      expect(textarea.style.top).toBe("40px");
    }
    unmount();
    for (const subscribe of [onResize, onRender]) {
      expect(subscribe.mock.results[0].value.dispose).toHaveBeenCalled();
    }
    textarea.style.left = "790px";
    textarea.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(textarea.style.left).toBe("790px");
  });

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

  it("updates terminal font size dynamically when fontSize prop changes", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { rerender } = render(
      <TerminalTab sessionId="s-font" cwd="/tmp" isVisible={true} fontSize="14px" />
    );
    await vi.waitFor(() => {
      expect(mockTerminalInstance).toBeDefined();
      expect((mockTerminalInstance.options as { fontSize: number }).fontSize).toBe(14);
    });

    rerender(
      <TerminalTab sessionId="s-font" cwd="/tmp" isVisible={true} fontSize="18px" />
    );
    await vi.waitFor(() => {
      expect((mockTerminalInstance.options as { fontSize: number }).fontSize).toBe(18);
    });
  });

  it("respects spawnDelay before calling pty_spawn", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);

    const { TerminalTab } = await import("../components/TerminalTab");
    render(
      <TerminalTab sessionId="s-delayed" cwd="/tmp" isVisible={true} spawnDelay={200} />
    );

    // Initial check before delay elapses
    expect(mockInvoke).not.toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "s-delayed" }));

    // Fast-forward timer by 200ms
    await vi.advanceTimersByTimeAsync(200);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "s-delayed" }));
    });
  });

  it("does not trigger pty_resize on visibility toggle if terminal dimensions remain unchanged", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockInvoke = invoke as ReturnType<typeof vi.fn>;
    mockInvoke.mockResolvedValue(undefined);

    const { TerminalTab } = await import("../components/TerminalTab");
    const { rerender } = render(
      <TerminalTab sessionId="s-vis" cwd="/tmp" isVisible={true} />
    );

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("pty_spawn", expect.objectContaining({ sessionId: "s-vis" }));
    });

    mockInvoke.mockClear();

    // Toggle to hidden
    rerender(
      <TerminalTab sessionId="s-vis" cwd="/tmp" isVisible={false} />
    );
    await vi.advanceTimersByTimeAsync(100);

    // Toggle back to visible
    rerender(
      <TerminalTab sessionId="s-vis" cwd="/tmp" isVisible={true} />
    );
    await vi.advanceTimersByTimeAsync(100);

    expect(mockInvoke).not.toHaveBeenCalledWith("pty_resize", expect.anything());
  });

  it("does not focus terminal on mount or visibility change if isFocused is false", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const { rerender } = render(
      <TerminalTab sessionId="s-unfocused" cwd="/tmp" isVisible={true} isFocused={false} />
    );
    await vi.advanceTimersByTimeAsync(100);

    expect(mockTerminalInstance.focus).not.toHaveBeenCalled();

    // Toggle visibility
    rerender(
      <TerminalTab sessionId="s-unfocused" cwd="/tmp" isVisible={false} isFocused={false} />
    );
    await vi.advanceTimersByTimeAsync(100);
    rerender(
      <TerminalTab sessionId="s-unfocused" cwd="/tmp" isVisible={true} isFocused={false} />
    );
    await vi.advanceTimersByTimeAsync(100);

    expect(mockTerminalInstance.focus).not.toHaveBeenCalled();
  });

  it("triggers onFocus callback when terminal receives focus or is clicked", async () => {
    const { TerminalTab } = await import("../components/TerminalTab");
    const onFocus = vi.fn();
    const { container } = render(
      <TerminalTab sessionId="s-focused" cwd="/tmp" isVisible={true} onFocus={onFocus} />
    );
    await vi.advanceTimersByTimeAsync(100);

    const outer = container.firstChild as HTMLElement;
    outer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(onFocus).toHaveBeenCalled();

    const textarea = (mockTerminalInstance.textarea as HTMLTextAreaElement);
    textarea.dispatchEvent(new FocusEvent("focus"));
    expect(onFocus).toHaveBeenCalledTimes(2);
  });
});
