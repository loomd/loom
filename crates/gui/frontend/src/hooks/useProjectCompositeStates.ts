import { useState, useEffect, useRef } from "react";

export type CompositeState =
  | "idle"
  | "active"
  | "waiting"
  | "running"
  | "agent_call"
  | "question"
  | "error";

const PRIORITY: Record<string, number> = {
  idle: 1,
  active: 2,
  waiting: 3,
  running: 4,
  agent_call: 5,
  question: 6,
  error: 7,
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

  let best: CompositeState = "active";
  let bestP = PRIORITY["active"];
  for (const s of terminals.values()) {
    const p = PRIORITY[s] ?? -1;
    if (p > bestP) {
      bestP = p;
      best = s;
    }
  }
  return best;
}

// ─── React hook ──────────────────────────────────────────────
type StateMap = Record<string, CompositeState>;

export function useProjectCompositeStates(projects: { id: string }[]): StateMap {
  const [states, setStates] = useState<StateMap>({});
  const prevRef = useRef<StateMap>({});
  const projectIds = projects.map(p => p.id).join(",");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds]);

  return states;
}
