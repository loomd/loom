---
status: in-progress
created: 2026-09-20
priority: high
tags:
- xterm
- ime
- bug
created_at: 2026-09-20T08:03:44.867789Z
updated_at: 2026-09-20T08:03:44.976684Z
transitions:
- status: in-progress
  at: 2026-09-20T08:03:44.976684Z
---

# Terminal IME cursor synchronization

## Overview

Chinese preedit text and its candidate window can use stale or different coordinates in xterm.js 6.0.0 when a TUI redraws its prompt. Keep both anchored to xterm's actual cursor rather than guessing from styled cells. Related report: MiniMax-AI/minimax-code#236.

## Requirements

- [x] Synchronize the helper textarea before xterm handles compositionstart, then immediately update composition elements after xterm starts composing.
- [x] Refresh the anchor after terminal resize/render and keep Loom's CSS coordinate overrides consistent with xterm.
- [x] Preserve composition text, event delivery, PTY buffering and listener cleanup.
- [x] Cover stale initial positions, composition updates, resize, and unmount with regression tests.

## Non-goals

No xterm beta upgrade, PTY protocol changes, TUI-specific cursor guessing, or long-preedit clipping. This compatibility adapter can be removed when the stable upgrade tracked in spec 062 includes xtermjs/xterm.js#5759 and #5761.

## Acceptance criteria

- [ ] Frontend tests, TypeScript build and lint pass.
- [x] Browser checks with real xterm 6.0.0 verify textarea and preedit alignment.
- [ ] Windows 11 / WebView2 manual validation records the IME version and checks first/repeated composition, resize, right-click focus, selection, Enter and Esc without duplicate or lost input.

## Technical notes

Update TerminalTab.tsx and its focused tests. Follow xterm's own _syncTextArea and CompositionHelper update order; isolate and document this temporary dependency on 6.0 internals. Do not mark Windows acceptance complete based on browser-simulated composition events.

## Verification notes

- Three new regression tests fail on the original implementation and pass after the fix; the focused terminal suites pass 34 tests.
- Full frontend suite: 194 tests pass with `NODE_OPTIONS=--no-experimental-webstorage npm test` on Node 26.4.0. Without that flag, three unchanged App tests fail because Node exposes an undefined localStorage.
- `npm run build` passes, including TypeScript. Changed-file ESLint passes. Full `npm run lint` reports one pre-existing prefer-const error at ProjectWorkspace.tsx:64, unchanged in this PR.
- Chromium with the real TerminalTab component and xterm 6.0.0 (mocked Tauri transport): a styled cell preceding the actual cursor produces mismatched textarea/preedit left positions (15.6px vs 23.4px) before the fix and matching 23.4px positions after it. A deliberately stale helper is corrected before xterm processes compositionstart. A synthetic Chinese commit emits exactly one input event.
- Windows 11, WebView2 and native IME validation remain pending; browser-synthetic events do not establish that the originating issue is resolved.
