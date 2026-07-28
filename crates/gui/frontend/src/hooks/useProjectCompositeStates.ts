import { useState, useEffect, useRef } from "react";

export type CompositeState =
  | "idle"
  | "waiting"
  | "running"
  | "agent_call"
  | "question"
  | "error";

const PRIORITY: Record<string, number> = {
  idle: 1,
  waiting: 2,
  running: 3,
  agent_call: 4,
  question: 5,
  error: 6,
};

// ─── Module-level store: projectId → { terminalId → CompositeState } ───
const shellMap = new Map<string, Map<string, CompositeState>>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** Report a terminal's composite status. Called by ProjectWorkspace when shell status changes. */
export function reportShellStatus(projectId: string, terminalId: string, state: CompositeState) {
  let terminals = shellMap.get(projectId);
  if (!terminals) {
    terminals = new Map();
    shellMap.set(projectId, terminals);
  }
  if (terminals.get(terminalId) !== state) {
    terminals.set(terminalId, state);
    notify();
  }
}

/** Remove a terminal's status. Called when a terminal is closed. */
export function removeShellStatus(projectId: string, terminalId: string) {
  const terminals = shellMap.get(projectId);
  if (terminals) {
    terminals.delete(terminalId);
    if (terminals.size === 0) shellMap.delete(projectId);
    notify();
  }
}

function computeComposite(projectId: string): CompositeState | null {
  const terminals = shellMap.get(projectId);
  if (!terminals || terminals.size === 0) return null;

  let best: CompositeState = "idle";
  let bestP = -1;
  for (const s of terminals.values()) {
    const p = PRIORITY[s] ?? -1;
    if (p > bestP) {
      bestP = p;
      best = s;
    }
  }
  return bestP <= 1 ? null : best;
}

// ─── React hook ──────────────────────────────────────────────
type StateMap = Record<string, CompositeState>;

export function useProjectCompositeStates(projects: { id: string }[]): StateMap {
  const [states, setStates] = useState<StateMap>({});
  const prevRef = useRef<StateMap>({});

  useEffect(() => {
    const sync = () => {
      const next: StateMap = {};
      let changed = false;

      for (const p of projects) {
        const composite = computeComposite(p.id);
        if (composite) {
          next[p.id] = composite;
        }
        if (prevRef.current[p.id] !== composite) changed = true;
      }

      prevRef.current = next;
      if (changed) setStates(next);
    };

    sync();
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, [projects]);

  return states;
}
