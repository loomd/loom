import React, { useState, useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";

const log: string[] = [];

function Inner({ id }: { id: string }) {
  useEffect(() => {
    log.push(`mount ${id}`);
    return () => { log.push(`unmount ${id}`); };
  }, [id]);
  return <span data-testid={`inner-${id}`}>{id}</span>;
}

function Pane({ id, active }: { id: string; active: boolean }) {
  return (
    <div style={{ display: active ? 'block' : 'none' }}>
      <Inner id={id} />
    </div>
  );
}

function Harness({ sim }: { sim: 'flip' | 'swap' }) {
  const [order, setOrder] = useState(["A", "B"]);
  return (
    <div>
      {order.map((id) => <Pane key={id} id={id} active={id === "A"} />)}
      {sim === 'flip' ? (
        <button onClick={() => setOrder([...order].reverse())}>flip</button>
      ) : (
        <button onClick={() => setOrder(["B", "A"])}>swap</button>
      )}
    </div>
  );
}

describe("pure keyed flip debug", () => {
  it("no strictmode fireEvent flip", () => {
    render(<Harness sim="flip" />);
    log.length = 0;
    fireEvent.click(screen.getByText("flip"));
    expect(log).toEqual([]);
  });

  it("no strictmode fireEvent swap (new array literal)", () => {
    render(<Harness sim="swap" />);
    log.length = 0;
    fireEvent.click(screen.getByText("swap"));
    expect(log).toEqual([]);
  });

  it("strict fireEvent swap (new array literal)", () => {
    render(
      <React.StrictMode>
        <Harness sim="swap" />
      </React.StrictMode>
    );
    log.length = 0;
    fireEvent.click(screen.getByText("swap"));
    expect(log).toEqual([]);
  });
});
