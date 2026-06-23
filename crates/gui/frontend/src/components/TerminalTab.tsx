import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

interface TerminalTabProps {
  sessionId: string;
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  isVisible: boolean;
}

export function TerminalTab({ sessionId, cwd, command, args, env, isVisible }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialized = useRef<boolean>(false);
  const spawnSuccessRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;

    let active = true;
    let cleanupFn: (() => void) | null = null;

    const preventScroll = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      if (el) {
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', preventScroll);
    }
    const outer = outerRef.current;
    if (outer) {
      outer.addEventListener('scroll', preventScroll);
    }

    const startInit = () => {
      if (!active || !containerRef.current) return;

      // Ensure the container is truly mounted in the active document body
      if (!containerRef.current.isConnected) {
        requestAnimationFrame(startInit);
        return;
      }

      initialized.current = true;

      // Create Terminal
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 13,
        scrollback: 10000,
        theme: {
          background: '#121214',
          foreground: '#e4e4e7',
          cursor: '#a1a1aa',
          black: '#18181b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#f4f4f5',
          brightBlack: '#71717a',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#fafafa',
        }
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Load History Buffer & attach events
      const initShell = async () => {
        // 1. Initial fit check to get size
        const container = containerRef.current;
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
          try {
            fitAddon.fit();
          } catch (e) {
            console.warn("Initial fit failed, using default size:", e);
          }
        }
        const cols = term.cols && term.cols > 0 ? term.cols : 80;
        const rows = term.rows && term.rows > 0 ? term.rows : 24;

        // 2. Spawn PTY process
        try {
          await invoke('pty_spawn', {
            sessionId,
            cwd,
            command,
            args,
            env,
            cols,
            rows
          });
          if (!termRef.current) return () => {};
          spawnSuccessRef.current = true;
        } catch (err) {
          if (!termRef.current) return () => {};
          term.write(`\r\n\x1b[31mFailed to spawn terminal process: ${err}\x1b[0m\r\n`);
          return () => {};
        }

        // 3. Populate existing history (if any)
        try {
          const history: number[] = await invoke('pty_history', { sessionId });
          if (!termRef.current) return () => {};
          if (history && history.length > 0) {
            term.write(new Uint8Array(history));
          }
        } catch (e) {
          console.warn("Failed to retrieve pty history:", e);
        }

        // 4. Hook up user keyboard input
        const dataSub = term.onData((text) => {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(text);
          invoke('pty_write', { sessionId, data: Array.from(bytes) }).catch(err => {
            console.error("PTY Write error:", err);
          });
        });

        // 5. Listen to stream events directly
        const unlistenData = await listen<number[]>(`pty-data-${sessionId}`, (event) => {
          if (!termRef.current) return;
          const uint8Data = new Uint8Array(event.payload);
          term.write(uint8Data);
        });
        if (!termRef.current) {
          dataSub.dispose();
          unlistenData();
          return () => {};
        }

        const unlistenExit = await listen<void>(`pty-exit-${sessionId}`, () => {
          if (!termRef.current) return;
          term.write('\r\n\x1b[33mTerminal process exited.\x1b[0m\r\n');
        });
        if (!termRef.current) {
          dataSub.dispose();
          unlistenData();
          unlistenExit();
          return () => {};
        }

        // Focus terminal so keyboard input immediately works
        term.focus();

        return () => {
          dataSub.dispose();
          unlistenData();
          unlistenExit();
        };
      };

      initShell().then(cleanup => {
        if (active) {
          cleanupFn = cleanup;
        } else if (cleanup) {
          cleanup();
        }
      });
    };

    requestAnimationFrame(startInit);

    // Size observer for resize sync
    const resizeObserver = new ResizeObserver(() => {
      if (isVisible && termRef.current && fitAddonRef.current && spawnSuccessRef.current) {
        const timer = setTimeout(() => {
          if (!termRef.current || !fitAddonRef.current || !spawnSuccessRef.current) return;
          const container = containerRef.current;
          if (container && container.clientWidth > 0 && container.clientHeight > 0) {
            try {
              fitAddonRef.current.fit();
              invoke('pty_resize', {
                sessionId,
                cols: termRef.current.cols,
                rows: termRef.current.rows
              }).catch(err => console.warn("Resize update failed:", err));
            } catch (e) {
              console.warn("Resize error:", e);
            }
          }
        }, 20);
        return () => clearTimeout(timer);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      active = false;
      resizeObserver.disconnect();
      if (cleanupFn) cleanupFn();

      if (container) {
        container.removeEventListener('scroll', preventScroll);
      }
      if (outer) {
        outer.removeEventListener('scroll', preventScroll);
      }

      const term = termRef.current;
      termRef.current = null;
      fitAddonRef.current = null;
      spawnSuccessRef.current = false;
      initialized.current = false;

      if (term) {
        setTimeout(() => {
          try {
            term.dispose();
          } catch (e) {
            console.warn("Error disposing terminal:", e);
          }
        }, 0);
      }
      invoke('pty_close', { sessionId }).catch(() => {});
    };
  }, [sessionId, cwd, command, args, env]);

  // Ensure calculations fire when visibility switches back on
  useEffect(() => {
    if (isVisible && fitAddonRef.current && termRef.current && spawnSuccessRef.current) {
      const timer = setTimeout(() => {
        if (!termRef.current || !fitAddonRef.current || !spawnSuccessRef.current) return;
        const container = containerRef.current;
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
          try {
            fitAddonRef.current.fit();
            invoke('pty_resize', {
              sessionId,
              cols: termRef.current.cols,
              rows: termRef.current.rows
            }).catch(() => {});
            termRef.current.focus();
          } catch (e) {
            console.warn("Visibility resize failed", e);
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, sessionId]);

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#121214',
        padding: '12px',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid var(--border-subtle, #27272a)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <style>{`
        .xterm {
          height: 100%;
        }
        .xterm-viewport {
          height: 100% !important;
        }
        .xterm-helpers {
          left: 0 !important;
          top: 0 !important;
          z-index: 10 !important;
        }
        .xterm-helper-textarea {
          font-family: Consolas, "Courier New", monospace !important;
          font-size: 13px !important;
          line-height: 1.2 !important;
          border: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          outline: none !important;
          box-shadow: none !important;
          color: transparent !important;
          background: transparent !important;
          opacity: 0.01 !important;
          z-index: 10 !important;
        }
      `}</style>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative'
        }}
      />
    </div>
  );
}
