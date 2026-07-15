import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '../api';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
  sessionId: string;
  cwd: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  isVisible: boolean;
  theme?: 'dark' | 'day' | 'gray';
  isTopInVerticalLayout?: boolean;
}

const getTerminalTheme = (theme?: 'dark' | 'day' | 'gray') => {
  switch (theme) {
    case 'day':
      return {
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
      };
    case 'gray':
      return {
        background: '#1a1a1f',
        foreground: '#e0e0e0',
        cursor: '#a0a0a0',
        black: '#1a1a1f',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e0e0e0',
        brightBlack: '#707070',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f4f4f5',
      };
    default: // dark
      return {
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
      };
  }
};

export function TerminalTab({ sessionId, cwd, command, args, env, isVisible, theme, isTopInVerticalLayout }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialized = useRef<boolean>(false);
  const spawnSuccessRef = useRef<boolean>(false);

  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    if (!containerRef.current || initialized.current) return;

    let active = true;
    let cleanupFn: (() => void) | null = null;
    let cleanupComposition: (() => void) | null = null;
    let isComposing = false;
    const ptyBuffer: Uint8Array[] = [];

    const flushPtyBuffer = () => {
      if (ptyBuffer.length > 0 && termRef.current) {
        const totalLength = ptyBuffer.reduce((acc, val) => acc + val.length, 0);
        const concatenated = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of ptyBuffer) {
          concatenated.set(arr, offset);
          offset += arr.length;
        }
        termRef.current.write(concatenated);
        ptyBuffer.length = 0;
      }
    };

    const getCellDimensions = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const core = (termRef.current as any)?._core;
      if (core?._renderService?.dimensions?.css?.cell) {
        const cell = core._renderService.dimensions.css.cell;
        if (cell.width > 0 && cell.height > 0) {
          return { width: cell.width, height: cell.height };
        }
      }
      const measureEl = containerRef.current?.querySelector('.xterm-char-measure-element');
      if (measureEl) {
        const rect = measureEl.getBoundingClientRect();
        const text = measureEl.textContent || '';
        const charCount = text.length || 1;
        const width = rect.width / charCount;
        if (width > 0 && rect.height > 0) {
          return { width, height: rect.height };
        }
      }
      return { width: 7.8, height: 15.17 };
    };

    const syncTextareaPosition = () => {
      const term = termRef.current;
      const textarea = term?.textarea;
      const container = containerRef.current;
      if (term && textarea && container) {
        const { width, height } = getCellDimensions();
        
        // Custom single-row virtual cursor detection logic
        const getTargetCursorPosition = (t: Terminal) => {
          const defaultX = t.buffer.active.cursorX;
          const defaultY = t.buffer.active.cursorY;
          const isHidden = !!((t as Terminal & { _core?: { coreService?: { isCursorHidden?: boolean } } })?._core?.coreService?.isCursorHidden);

          if (!isHidden) {
            return { x: defaultX, y: defaultY };
          }

          // If cursor is hidden (e.g. in pwsh with PSReadLine), scan from right to left
          // on the active row to find the first cell representing the virtual cursor.
          const buffer = t.buffer.active;
          const line = buffer.getLine(buffer.viewportY + defaultY);
          if (line) {
            const cols = t.cols;
            const startX = Math.min(defaultX, cols - 1);
            for (let x = startX; x >= 0; x--) {
              const cell = line.getCell(x);
              if (!cell) continue;

              const isInverse = cell.isInverse() !== 0;
              const isCustomBg = !cell.isBgDefault() || cell.isBgRGB() || cell.isBgPalette();
              
              if (isInverse || isCustomBg) {
                return { x, y: defaultY };
              }
            }
          }

          return { x: defaultX, y: defaultY };
        };

        const target = getTargetCursorPosition(term);
        
        // Calculate coordinates relative to the terminal container (.xterm-helpers)
        // using absolute positioning to avoid viewport/transform mismatch issues.
        const leftPx = `${target.x * width}px`;
        const topPx = `${target.y * height}px`;
        
        // Set CSS variables on the container wrapping the terminal to prevent 
        // xterm.js internal updates from wiping them out.
        container.style.setProperty('--ime-left', leftPx);
        container.style.setProperty('--ime-top', topPx);
        textarea.style.left = leftPx;
        textarea.style.top = topPx;
      }
    };

    const preventGlobalScroll = (e: Event) => {
      if (!isVisibleRef.current) return;

      const target = e.target;
      if (target === document || target === window) {
        window.scrollTo(0, 0);
        document.documentElement.scrollLeft = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollLeft = 0;
        document.body.scrollTop = 0;
        return;
      }

      const el = target as HTMLElement;
      if (el && el.classList) {
        // Allow xterm viewport scrolling to function normally
        if (el.classList.contains('xterm-viewport')) {
          return;
        }

        // Never interfere with xterm's IME helper elements.
        // xterm dynamically writes top/left on xterm-helper-textarea to track
        // cursor position so the OS IME candidate box appears at the right spot.
        // Forcing scrollLeft/scrollTop=0 on the textarea or its parent (.xterm-helpers)
        // races with that JS and causes the candidate box to flicker or jump.
        if (
          el.classList.contains('xterm-helper-textarea') ||
          el.classList.contains('xterm-helpers')
        ) {
          return;
        }
      }
      
      const container = containerRef.current;
      if (el && container && el.contains(container)) {
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }
    };

    document.addEventListener('scroll', preventGlobalScroll, true);

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
        theme: getTerminalTheme(theme)
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        event.preventDefault();
        openUrl(uri);
      });
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);

      const textarea = term.textarea;
      const termEl = term.element;
      if (textarea && termEl) {
        const handleStart = () => {
          isComposing = true;
          termEl.classList.add('is-composing');
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
        };
        const handleEnd = () => {
          isComposing = false;
          termEl.classList.remove('is-composing');
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
          flushPtyBuffer();
        };
        const handleUpdate = () => {
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
        };
        const handleScroll = () => {
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const handleFocus = (_e: FocusEvent) => {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const handleBlur = (_e: FocusEvent) => {};
        const handleKey = (e: KeyboardEvent) => {
          // Clear residue text before composition starts or during normal input
          // Only clear residue for alpha/letter keys (e.g. KeyA-KeyZ) to prevent
          // messing up punctuation inputs (comma, space, etc.) which confirm composition.
          const isAlphaKey = e.code ? e.code.startsWith('Key') : /^[a-zA-Z]$/.test(e.key);
          const isIME = e.keyCode === 229 || e.key === 'Process';
          const isChar = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
          if (isAlphaKey && (isIME || isChar) && !isComposing) {
            if (textarea && textarea.value !== '') {
              textarea.value = '';
            }
          }
        };

        textarea.addEventListener('compositionstart', handleStart);
        textarea.addEventListener('compositionend', handleEnd);
        textarea.addEventListener('compositionupdate', handleUpdate);
        textarea.addEventListener('scroll', handleScroll);
        textarea.addEventListener('keydown', handleKey, true);
        textarea.addEventListener('focus', handleFocus, true);
        textarea.addEventListener('blur', handleBlur, true);
        cleanupComposition = () => {
          textarea.removeEventListener('compositionstart', handleStart);
          textarea.removeEventListener('compositionend', handleEnd);
          textarea.removeEventListener('compositionupdate', handleUpdate);
          textarea.removeEventListener('scroll', handleScroll);
          textarea.removeEventListener('keydown', handleKey, true);
          textarea.removeEventListener('focus', handleFocus, true);
          textarea.removeEventListener('blur', handleBlur, true);
        };
      }

      // Let the browser handle standard copy and paste shortcuts
      term.attachCustomKeyEventHandler((event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
          return false;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && term.hasSelection()) {
          return false;
        }
        return true;
      });

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
          // Sync size right after spawn completes
          try {
            fitAddon.fit();
            invoke('pty_resize', {
              sessionId,
              cols: term.cols,
              rows: term.rows
            }).catch(e => console.warn("Initial pty_resize failed:", e));
          } catch (e) {
            console.warn("Initial fit failed:", e);
          }
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
          if (isComposing) {
            ptyBuffer.push(uint8Data);
          } else {
            term.write(uint8Data);
          }
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
          if (cleanupComposition) cleanupComposition();
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
      if (isVisible && termRef.current && fitAddonRef.current) {
        const timer = setTimeout(() => {
          if (!termRef.current || !fitAddonRef.current) return;
          const container = containerRef.current;
          if (container && container.clientWidth > 0 && container.clientHeight > 0) {
            try {
              fitAddonRef.current.fit();
              if (spawnSuccessRef.current) {
                invoke('pty_resize', {
                  sessionId,
                  cols: termRef.current.cols,
                  rows: termRef.current.rows
                }).catch(err => console.warn("Resize update failed:", err));
              }
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
      if (cleanupComposition) cleanupComposition();

      document.removeEventListener('scroll', preventGlobalScroll, true);

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
      invoke('pty_close', { sessionId }).catch((err) => console.warn('Failed to close PTY session:', err));
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
            }).catch((err) => console.warn('Failed to resize PTY:', err));
            termRef.current.focus();
          } catch (e) {
            console.warn("Visibility resize failed", e);
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, sessionId]);

  const getOuterBg = (theme?: 'dark' | 'day' | 'gray') => {
    switch (theme) {
      case 'gray': return '#1a1a1f';
      default: return '#121214';
    }
  };

  return (
    <div
      ref={outerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: getOuterBg(theme),
        padding: `4px 4px ${isTopInVerticalLayout ? '4px' : '28px'} 4px`,
        margin: '0px',
        overflow: 'hidden',
        position: 'relative',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle, #27272a)',
        boxSizing: 'border-box'
      }}
    >
      <style>{`
        .xterm {
          width: 100%;
          height: 100%;
        }
        .xterm-viewport {
          height: 100% !important;
          background-color: ${getOuterBg(theme)} !important;
        }
        .xterm .xterm-helpers {
          left: 0;
          overflow: visible !important;
        }
        .xterm.is-composing .xterm-helper-textarea {
          position: absolute !important;
          left: var(--ime-left, 0px) !important;
          top: var(--ime-top, 0px) !important;
          opacity: 1 !important;
          z-index: 99999 !important;
          width: 200px !important;
          height: 16px !important;
          clip: auto !important;
          clip-path: none !important;
          overflow: visible !important;
          color: transparent !important; /* Hide textarea text to let xterm.js render it natively */
          background: transparent !important;
          caret-color: transparent !important; /* Hide caret */
          pointer-events: none !important;
          font-family: Consolas, "Courier New", monospace !important;
          font-size: 13px !important;
          line-height: 1.2 !important;
          border: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          outline: none !important;
          box-shadow: none !important;
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
