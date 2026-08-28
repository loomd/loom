import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useProjectCompositeStates,
  reportShellStatus,
  removeShellStatus,
} from "../hooks/useProjectCompositeStates";

describe("useProjectCompositeStates", () => {
  const projA = "proj-a";
  const projB = "proj-b";

  beforeEach(() => {
    // Clean up statuses before each test
    removeShellStatus(projA, "term-1");
    removeShellStatus(projA, "term-2");
    removeShellStatus(projB, "term-1");
  });

  test("returns empty map when no projects or no active shells", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }, { id: projB }])
    );
    expect(result.current[projA]).toBeUndefined();
    expect(result.current[projB]).toBeUndefined();
  });

  test("shows active (blue light) when a raw terminal or idle opencode exists", () => {
    const { result } = renderHook(() =>
      useProjectCompositeStates([{ id: projA }])
    );

    act(() => {
      reportShellStatus(projA, "term-1", "active");
    });

    expect(result.current[projA]).toBe("active");
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
});
