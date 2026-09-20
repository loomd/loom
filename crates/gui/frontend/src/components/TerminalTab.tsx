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
  initialCommand?: string;
  spawnDelay?: number;
  isVisible: boolean;
  isFocused?: boolean;
  onFocus?: () => void;
  theme?: 'dark' | 'day' | 'gray';
  fontSize?: string | number;
}

const parseFontSize = (size?: string | number): number => {
  if (typeof size === 'number') return size >= 8 && size <= 72 ? size : 13;
  if (typeof size === 'string') {
    const parsed = parseInt(size, 10);
    return isNaN(parsed) || parsed < 8 || parsed > 72 ? 13 : parsed;
  }
  return 13;
};

const getTerminalTheme = (theme?: 'dark' | 'day' | 'gray') => {
  switch (theme) {
    case 'day':
      return {
        background: '#1a1a1f',
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
        background: '#1a1a1f',
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

export function TerminalTab({ sessionId, cwd, command, args, env, initialCommand, spawnDelay, isVisible, isFocused, onFocus, theme, fontSize }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialized = useRef<boolean>(false);
  const spawnSuccessRef = useRef<boolean>(false);
  const lastColsRef = useRef<number>(-1);
  const lastRowsRef = useRef<number>(-1);
  const fontSizeRef = useRef(fontSize);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  const onFocusRef = useRef(onFocus);
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

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

    const startInit = async () => {
      if (!active || !containerRef.current) return;

      // 1. 如果存在错峰延迟，先等待指定时间
      if (spawnDelay && spawnDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, spawnDelay));
        if (!active || !containerRef.current) return;
      }

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
        fontSize: parseFontSize(fontSizeRef.current),
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
        // Compatibility with xterm 6.0.0: mirror upstream #5759 and #5761.
        // Remove this private-API adapter after the stable upgrade in spec 062.
        // Let xterm own cell geometry and viewport checks; styled cells are not
        // a reliable way to distinguish an application's cursor from its UI.
        const core = (term as Terminal & {
          _core?: {
            _syncTextArea?: () => void;
            _compositionHelper?: { updateCompositionElements: () => void };
          };
        })._core;
        const syncTextareaPosition = () => {
          core?._syncTextArea?.();
          // Keep the composing CSS override on the same coordinates that xterm
          // uses for both the helper textarea and the visible preedit layer.
          const container = containerRef.current;
          if (container && textarea.style.left && textarea.style.top) {
            container.style.setProperty('--ime-left', textarea.style.left);
            container.style.setProperty('--ime-top', textarea.style.top);
          }
        };
        const handleStart = () => {
          isComposing = true;
          core?._compositionHelper?.updateCompositionElements();
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
        const handleFocus = () => {
          onFocusRef.current?.();
        };
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

        // Capture runs before xterm's listener sets its isComposing guard.
        textarea.addEventListener('compositionstart', syncTextareaPosition, true);
        textarea.addEventListener('compositionstart', handleStart);
        textarea.addEventListener('compositionend', handleEnd);
        textarea.addEventListener('compositionupdate', handleUpdate);
        textarea.addEventListener('scroll', handleScroll);
        textarea.addEventListener('keydown', handleKey, true);
        textarea.addEventListener('focus', handleFocus, true);
        textarea.addEventListener('blur', handleBlur, true);
        const resizeSync = term.onResize(syncTextareaPosition);
        const renderSync = term.onRender(syncTextareaPosition);
        cleanupComposition = () => {
          resizeSync.dispose();
          renderSync.dispose();
          textarea.removeEventListener('compositionstart', syncTextareaPosition, true);
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
        // 1. Initial fit check: 确保容器已具备准确尺寸
        const container = containerRef.current;
        if (container && (container.clientWidth <= 0 || container.clientHeight <= 0) && isVisibleRef.current) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          if (!active) return () => {};
        }

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
          lastColsRef.current = cols;
          lastRowsRef.current = rows;
          // Sync size right after spawn completes only if dimensions changed
          try {
            fitAddon.fit();
            const currentCols = term.cols;
            const currentRows = term.rows;
            if (currentCols > 0 && currentRows > 0 && (currentCols !== cols || currentRows !== rows)) {
              lastColsRef.current = currentCols;
              lastRowsRef.current = currentRows;
              invoke('pty_resize', {
                sessionId,
                cols: currentCols,
                rows: currentRows
              }).catch(e => console.warn("Initial pty_resize failed:", e));
            }
          } catch (e) {
            console.warn("Initial fit failed:", e);
          }

          if (initialCommand) {
            setTimeout(() => {
              const encoder = new TextEncoder();
              const bytes = encoder.encode(`${initialCommand}\r`);
              invoke('pty_write', { sessionId, data: Array.from(bytes) }).catch(err => {
                console.error("PTY Write initial command error:", err);
              });
            }, 500);
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

        // Focus terminal so keyboard input immediately works if marked as focused
        const shouldFocus = isFocusedRef.current !== undefined ? isFocusedRef.current : isVisibleRef.current;
        if (shouldFocus) {
          term.focus();
        }

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
      const container = containerRef.current;
      if (!isVisibleRef.current || !termRef.current || !fitAddonRef.current) return;
      if (!container || container.clientWidth < 1 || container.clientHeight < 1) return;
      setTimeout(() => {
        if (!termRef.current || !fitAddonRef.current) return;
        const container = containerRef.current;
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
          try {
            fitAddonRef.current.fit();
            const currentCols = termRef.current.cols;
            const currentRows = termRef.current.rows;
            if (spawnSuccessRef.current && currentCols > 0 && currentRows > 0 && (currentCols !== lastColsRef.current || currentRows !== lastRowsRef.current)) {
              lastColsRef.current = currentCols;
              lastRowsRef.current = currentRows;
              invoke('pty_resize', {
                sessionId,
                cols: currentCols,
                rows: currentRows
              }).catch(err => console.warn("Resize update failed:", err));
            }
          } catch (e) {
            console.warn("Resize error:", e);
          }
        }
      }, 20);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const currentCols = termRef.current.cols;
            const currentRows = termRef.current.rows;
            if (currentCols > 0 && currentRows > 0 && (currentCols !== lastColsRef.current || currentRows !== lastRowsRef.current)) {
              lastColsRef.current = currentCols;
              lastRowsRef.current = currentRows;
              invoke('pty_resize', {
                sessionId,
                cols: currentCols,
                rows: currentRows
              }).catch((err) => console.warn('Failed to resize PTY:', err));
            }
            const shouldFocus = isFocused !== undefined ? isFocused : true;
            if (shouldFocus) {
              termRef.current.focus();
            }
            if (termRef.current.rows > 0) {
              termRef.current.refresh(0, termRef.current.rows - 1);
            }
          } catch (e) {
            console.warn("Visibility resize failed", e);
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, isFocused, sessionId]);

  // Focus when isFocused becomes true while already visible
  useEffect(() => {
    if (isVisible && isFocused && termRef.current && spawnSuccessRef.current) {
      termRef.current.focus();
    }
  }, [isVisible, isFocused]);

  // Dynamically update terminal font size when fontSize prop changes
  useEffect(() => {
    if (!termRef.current) return;
    const sizeNum = parseFontSize(fontSize);
    if (termRef.current.options && termRef.current.options.fontSize !== sizeNum) {
      termRef.current.options.fontSize = sizeNum;
      if (fitAddonRef.current && spawnSuccessRef.current) {
        const timer = setTimeout(() => {
          if (!termRef.current || !fitAddonRef.current || !spawnSuccessRef.current) return;
          try {
            fitAddonRef.current.fit();
            const currentCols = termRef.current.cols;
            const currentRows = termRef.current.rows;
            if (currentCols > 0 && currentRows > 0 && (currentCols !== lastColsRef.current || currentRows !== lastRowsRef.current)) {
              lastColsRef.current = currentCols;
              lastRowsRef.current = currentRows;
              invoke('pty_resize', {
                sessionId,
                cols: currentCols,
                rows: currentRows
              }).catch((err) => console.warn('Failed to resize PTY on font size change:', err));
            }
          } catch (e) {
            console.warn('Resize error on font size change:', e);
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [fontSize, sessionId]);

  const getOuterBg = (theme?: 'dark' | 'day' | 'gray') => {
    switch (theme) {
      case 'gray': return '#1a1a1f';
      default: return '#1a1a1f';
    }
  };

  const parsedFontSize = parseFontSize(fontSize);

  return (
    <div
      ref={outerRef}
      onPointerDownCapture={() => {
        onFocusRef.current?.();
      }}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: getOuterBg(theme),
        padding: `0px`,
        margin: '0px',
        overflow: 'hidden',
        position: 'relative',
        borderRadius: '4px',
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
          height: ${Math.round(parsedFontSize * 1.2)}px !important;
          clip: auto !important;
          clip-path: none !important;
          overflow: visible !important;
          color: transparent !important; /* Hide textarea text to let xterm.js render it natively */
          background: transparent !important;
          caret-color: transparent !important; /* Hide caret */
          pointer-events: none !important;
          font-family: Consolas, "Courier New", monospace !important;
          font-size: ${parsedFontSize}px !important;
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
