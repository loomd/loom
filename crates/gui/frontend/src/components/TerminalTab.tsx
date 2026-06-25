import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';

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
      const measureEl = containerRef.current?.querySelector('.xterm-char-measure-element');
      if (measureEl) {
        const rect = measureEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { width: rect.width, height: rect.height };
        }
      }
      const core = (termRef.current as any)?._core;
      if (core?._renderService?.dimensions?.css?.cell) {
        const cell = core._renderService.dimensions.css.cell;
        if (cell.width > 0 && cell.height > 0) {
          return { width: cell.width, height: cell.height };
        }
      }
      return { width: 7.15, height: 15.17 };
    };

    const syncTextareaPosition = () => {
      const term = termRef.current;
      const textarea = term?.textarea;
      if (term && textarea) {
        const { width, height } = getCellDimensions();
        
        // Custom virtual cursor detection logic
        const getTargetCursorPosition = (t: any) => {
          const isHidden = !!t?._core?.coreService?.isCursorHidden;
          const defaultX = t.buffer.active.cursorX;
          const defaultY = t.buffer.active.cursorY;

          if (!isHidden) {
            return { x: defaultX, y: defaultY, isHidden: false };
          }

          const rows = t.rows;
          const cols = t.cols;
          const buffer = t.buffer.active;
          const viewportY = buffer.viewportY;

          for (let y = rows - 1; y >= 0; y--) {
            const line = buffer.getLine(viewportY + y);
            if (!line) continue;

            for (let x = cols - 1; x >= 0; x--) {
              const cell = line.getCell(x);
              if (!cell) continue;

              const chars = cell.getChars();
              const isBlock = chars === '█' || chars === '\u2588';
              const isBar = chars === '|' || chars === '│' || chars === '\u258f' || chars === '┃' || chars === '▕';
              const isInverse = cell.isInverse() !== 0;

              const isVirtualCursor = isBlock || isBar || ((chars === ' ' || chars === '') && isInverse);

              if (isVirtualCursor) {
                // Avoid matching borders or solid lines made of blocks/inverse spaces
                if (isBlock || (chars === ' ' && isInverse)) {
                  const leftCell = x > 0 ? line.getCell(x - 1) : null;
                  const rightCell = x < cols - 1 ? line.getCell(x + 1) : null;
                  const leftIsBlock = leftCell && (leftCell.getChars() === '█' || leftCell.getChars() === '\u2588' || (leftCell.getChars() === ' ' && leftCell.isInverse() !== 0));
                  const rightIsBlock = rightCell && (rightCell.getChars() === '█' || rightCell.getChars() === '\u2588' || (rightCell.getChars() === ' ' && rightCell.isInverse() !== 0));
                  if (leftIsBlock && rightIsBlock) {
                    continue;
                  }
                }
                return { x, y, isHidden: false };
              }
            }
          }

          return { x: defaultX, y: defaultY, isHidden: true };
        };

        const target = getTargetCursorPosition(term);
        
        textarea.style.left = `${target.x * width}px`;
        textarea.style.top = `${target.y * height}px`;

        if (isComposing && target.isHidden) {
          textarea.style.setProperty('color', 'transparent', 'important');
          textarea.style.setProperty('caret-color', 'transparent', 'important');
        } else if (isComposing) {
          textarea.style.setProperty('color', '#e4e4e7', 'important');
          textarea.style.setProperty('caret-color', '#a1a1aa', 'important');
        } else {
          textarea.style.removeProperty('color');
          textarea.style.removeProperty('caret-color');
        }

        const rect = textarea.getBoundingClientRect();
        invoke('update_ime_position', {
          x: rect.left,
          y: rect.bottom,
          cursor_x: target.x,
          cursor_y: target.y,
          cell_w: width,
          cell_h: height,
          is_cursor_hidden: target.isHidden
        }).catch(err => {
          console.warn("Failed to update native IME position:", err);
        });
      }
    };

    const preventGlobalScroll = (e: Event) => {
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
      if (el) {
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

      const textarea = term.textarea;
      const termEl = term.element;
      console.log('IME Log: Init - textarea exists:', !!textarea, 'termEl exists:', !!termEl);
      if (textarea && termEl) {
        const logState = (action: string) => {
          const rect = textarea.getBoundingClientRect();
          const activeEl = document.activeElement;
          const activeInfo = activeEl ? `${activeEl.tagName}.${activeEl.className}` : 'none';
          console.log(`[IME ${action}] activeElement=${activeInfo} scroll=${textarea.scrollLeft},${textarea.scrollTop} styleLeft=${textarea.style.left} styleTop=${textarea.style.top} rectLeft=${rect.left} rectTop=${rect.top} rectWidth=${rect.width} rectHeight=${rect.height} valLen=${textarea.value.length} sel=${textarea.selectionStart},${textarea.selectionEnd}`);
        };

        const handleStart = (e: any) => {
          isComposing = true;
          termEl.classList.add('is-composing');
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
          console.log('IME Log: compositionstart - data:', e.data);
          logState('start');
        };
        const handleEnd = (e: any) => {
          isComposing = false;
          termEl.classList.remove('is-composing');
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
          console.log('IME Log: compositionend - data:', e.data);
          logState('end');
          flushPtyBuffer();
        };
        const handleUpdate = (e: any) => {
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          syncTextareaPosition();
          console.log('IME Log: compositionupdate - data:', e.data);
          logState('update');
        };
        const handleScroll = () => {
          console.log('IME Log: scroll event fired!');
          logState('scroll before reset');
          textarea.scrollLeft = 0;
          textarea.scrollTop = 0;
          logState('scroll after reset');
        };
        const handleKey = (e: any) => {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            console.log('IME Log: backspace/delete keydown (capture)!', e.key);
            logState('keydown delete');
          }
          // Clear residue text before composition starts or during normal input
          const isIME = e.keyCode === 229 || e.key === 'Process';
          const isChar = e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
          if ((isIME || isChar) && !isComposing) {
            if (textarea && textarea.value !== '') {
              console.log('IME Log: keydown - clearing residue textarea value:', JSON.stringify(textarea.value));
              textarea.value = '';
            }
          }
        };
        const handleFocus = () => {
          console.log('IME Log: textarea focus event');
          logState('focus');
        };
        const handleBlur = () => {
          console.log('IME Log: textarea blur event');
          logState('blur');
        };

        textarea.addEventListener('compositionstart', handleStart);
        textarea.addEventListener('compositionend', handleEnd);
        textarea.addEventListener('compositionupdate', handleUpdate);
        textarea.addEventListener('scroll', handleScroll);
        textarea.addEventListener('keydown', handleKey, true);
        textarea.addEventListener('focus', handleFocus, true);
        textarea.addEventListener('blur', handleBlur, true);
        cleanupComposition = () => {
          console.log('IME Log: cleanup called');
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
          console.log('[IME onData] text:', JSON.stringify(text), 'length:', text.length, 'isComposing:', isComposing);
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
        padding: '4px',
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
          width: 100% !important;
          height: 100% !important;
        }
        .xterm .xterm-helpers {
          left: 0;
          overflow: hidden;
        }
        .xterm.is-composing .xterm-helpers {
          z-index: 10 !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
          pointer-events: none !important;
        }
        .xterm.is-composing .xterm-helper-textarea {
          position: absolute !important;
          font-family: Consolas, "Courier New", monospace !important;
          font-size: 13px !important;
          line-height: 1.2 !important;
          border: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          outline: none !important;
          box-shadow: none !important;
          color: #e4e4e7 !important; /* Make pinyin visible */
          background: transparent !important;
          caret-color: #a1a1aa !important; /* Show caret */
          opacity: 1 !important;
          white-space: nowrap !important;
          z-index: 10 !important;
          width: 200px !important;
          height: 20px !important;
          pointer-events: none !important;
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
