import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useProjectCompositeStates,
  reportShellStatus,
  removeShellStatus,
  syncProjectShells,
} from "../hooks/useProjectCompositeStates";

describe("useProjectCompositeStates", () => {
  const projA = "proj-a";
  const projB = "proj-b";

  beforeEach(() => {
    // Clean up statuses before each test
    syncProjectShells(projA, {});
    syncProjectShells(projB, {});
  });

  test("returns empty map when no projects or no active shells", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }, { id: projB }])
    );
    expect(result.current[projA]).toBeUndefined();
    expect(result.current[projB]).toBeUndefined();
  });

  test("shows active or waiting (blue light) when a raw terminal or waiting opencode exists", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }])
    );

    act(() => {
      reportShellStatus(projA, "term-1", "active");
    });
    expect(result.current[projA]).toBe("active");

    act(() => {
      reportShellStatus(projA, "term-1", "waiting");
    });
    expect(result.current[projA]).toBe("waiting");
  });

  test("upgrades light to higher priority state (e.g. running, question, error)", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }])
    );

    act(() => {
      reportShellStatus(projA, "term-1", "active");
      reportShellStatus(projA, "term-2", "running");
    });
    expect(result.current[projA]).toBe("running");

    act(() => {
      reportShellStatus(projA, "term-2", "error");
    });
    expect(result.current[projA]).toBe("error");
  });

  test("reverts to undefined (no light) when all terminals are removed", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }])
    );

    act(() => {
      reportShellStatus(projA, "term-1", "active");
    });
    expect(result.current[projA]).toBe("active");

    act(() => {
      removeShellStatus(projA, "term-1");
    });
    expect(result.current[projA]).toBeUndefined();
  });

  test("syncProjectShells completely replaces active terminals snapshot and reflects waiting blue light", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }])
    );

    // Initial state: old terminal was running (green pulse)
    act(() => {
      syncProjectShells(projA, { "term-old": "running" });
    });
    expect(result.current[projA]).toBe("running");

    // Replace snapshot: old terminal closed, only new waiting terminal exists (blue light)
    act(() => {
      syncProjectShells(projA, { "term-new": "waiting" });
    });
    expect(result.current[projA]).toBe("waiting");

    // Cleared snapshot
    act(() => {
      syncProjectShells(projA, {});
    });
    expect(result.current[projA]).toBeUndefined();
  });
});
