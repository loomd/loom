import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

export function useTerminalSessions(
  sessionIds: string[],
  onSessionData?: (sessionId: string, data: number[]) => void,
  onSessionExit?: (sessionId: string, exitCode: number) => void,
) {
  const unlisteners = useRef<Array<() => void>>([]);

  const cleanup = useCallback(() => {
    for (const unlistener of unlisteners.current) {
      unlistener();
    }
    unlisteners.current = [];
  }, []);

  useEffect(() => {
    cleanup();

    const registrations: Array<Promise<() => void>> = [];

    for (const sessionId of sessionIds) {
      if (onSessionData) {
        registrations.push(
          listen<number[]>(`pty-data-${sessionId}`, (e) => {
            onSessionData(sessionId, e.payload);
          })
        );
      }
      if (onSessionExit) {
        registrations.push(
          listen<number>(`pty-exit-${sessionId}`, (e) => {
            onSessionExit(sessionId, e.payload);
          })
        );
      }
    }

    if (registrations.length > 0) {
      Promise.all(registrations).then((unlistenerFns) => {
        unlisteners.current = unlistenerFns;
      });
    }

    return cleanup;
  }, [sessionIds, onSessionData, onSessionExit, cleanup]);

  return { cleanup };
}
