import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ErrorBoundary from "../components/ErrorBoundary";

const Bomb = (): React.ReactNode => {
  throw new Error("💥 crashed");
};

const Good = (): React.ReactNode => <div>ok</div>;

function Fallback({ retry }: { retry: () => void }) {
  return (
    <div>
      <span>custom fallback</span>
      <button onClick={retry}>retry</button>
    </div>
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <Good />
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders fallback UI on error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("出错了")).toBeInTheDocument();
    expect(screen.getByText("点击重试")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<Fallback retry={() => {}} />}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom fallback")).toBeInTheDocument();
  });

  it("recovers after clicking retry", () => {
    let shouldThrow = true;
    function ConditionalBomb() {
      if (shouldThrow) throw new Error("💥");
      return <div>ok</div>;
    }
    render(
      <ErrorBoundary>
        <ConditionalBomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("出错了")).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText("点击重试"));
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("dispatches errorboundary:error event on catch", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => (e as CustomEvent).type === "errorboundary:error",
    );
    expect(calls.length).toBe(1);
    const detail = (calls[0][0] as CustomEvent).detail;
    expect(detail.error).toContain("💥 crashed");
  });
});
