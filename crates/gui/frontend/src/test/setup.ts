import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Tauri invoke
const mockInvoke = vi.fn((cmd: string) => {
  if (cmd === 'get_autostart') return Promise.resolve(false);
  if (cmd === 'get_version') return Promise.resolve('0.3.8');
  if (cmd === 'set_language') return Promise.resolve();
  return Promise.resolve([]);
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock Tauri window
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(() => {})),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock Tauri app
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(() => Promise.resolve('0.3.8')),
}));

// Mock Tauri plugin process
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

// Mock Tauri plugin updater
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(() => Promise.resolve(null)),
}));
