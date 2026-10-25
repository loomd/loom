import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../I18nContext';
import { ToastProvider } from '../ToastContext';
import { GitStatusBar } from '../components/GitStatusBar';
import type { GitProjectStatus } from '../types';

const mockGetGitStatus = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getGitStatus: (...args: unknown[]) => mockGetGitStatus(...args),
  };
});

const gitStatus: GitProjectStatus = {
  is_git: true,
  branch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  is_dirty: false,
  last_checked: 0,
  error: null,
};

// 隐藏探针（aria-hidden）量的是纯文本宽度
const PROBE_TEXT_WIDTHS: Record<string, number> = {
  '@origin/main': 72,
  '@main': 34,
  '检查中...': 56,
};

// 普通元素量的是自身整体宽度
const ELEMENT_WIDTHS: Record<string, number> = {
  ...PROBE_TEXT_WIDTHS,
  main: 30,
  最新: 32,
  检查更新: 93,
  '检查中...': 89,
};

// 取可见文本（排除 aria-hidden 隐藏探针）
const visibleText = (el: Element): string => {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent || '';
      continue;
    }
    if (node instanceof HTMLElement) {
      if (node.hasAttribute('aria-hidden')) continue;
      out += visibleText(node);
    }
  }
  return out.trim();
};

const fakeWidth = (el: Element) => {
  const table = el.hasAttribute('aria-hidden') ? PROBE_TEXT_WIDTHS : ELEMENT_WIDTHS;
  return table[visibleText(el)] ?? 0;
};

// 状态条可用宽度，由用例动态调整
let barWidth = 600;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

function renderBar() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <GitStatusBar projectPath="/repo" />
      </ToastProvider>
    </I18nProvider>
  );
}

// 取可见的上游分支标签（隐藏测量探针带 aria-hidden，需排除）
const upstreamLabel = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span'))
    .filter((el) => !el.hasAttribute('aria-hidden'))
    .map((el) => (el.textContent || '').trim())
    .find((text) => text.startsWith('@'));

// 取检查按钮的可见文案
const checkButtonLabel = (container: HTMLElement) =>
  container.querySelector('button span:not([aria-hidden="true"])')?.textContent?.trim() ?? '';

const triggerResize = () => {
  act(() => {
    MockResizeObserver.instances.forEach((observer) => observer.trigger());
  });
};

describe('GitStatusBar 上游分支标签', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    barWidth = 600;
    mockGetGitStatus.mockResolvedValue(gitStatus);

    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return barWidth;
      },
    });
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: Element) {
        return fakeWidth(this);
      },
    });
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const width = fakeWidth(this);
      return {
        width,
        height: 16,
        top: 0,
        left: 0,
        right: width,
        bottom: 16,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterEach(() => {
    if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth);
    if (originalScrollWidth) Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    mockGetGitStatus.mockReset();
  });

  it('宽度足够时显示完整的 @origin/main', async () => {
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();

    expect(upstreamLabel(container)).toBe('@origin/main');
  });

  it('宽度不足时降级为 @main', async () => {
    barWidth = 260;
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();

    expect(upstreamLabel(container)).toBe('@main');
  });

  it('宽度恢复后重新显示完整的 @origin/main', async () => {
    barWidth = 260;
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();
    expect(upstreamLabel(container)).toBe('@main');

    barWidth = 600;
    triggerResize();

    expect(upstreamLabel(container)).toBe('@origin/main');
  });

  it('检查中整行放不下时上游降级为 @main', async () => {
    // 远端检查请求保持挂起，使按钮停留在「检查中」状态
    mockGetGitStatus.mockImplementation((_path: string, fetchRemote: boolean) =>
      fetchRemote ? new Promise<GitProjectStatus>(() => {}) : Promise.resolve(gitStatus),
    );
    barWidth = 280;
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();

    expect(upstreamLabel(container)).toBe('@main');
    expect(checkButtonLabel(container)).toBe('检查中...');
  });

  it('检查中极窄时收起检查文案，仅保留转圈图标', async () => {
    mockGetGitStatus.mockImplementation((_path: string, fetchRemote: boolean) =>
      fetchRemote ? new Promise<GitProjectStatus>(() => {}) : Promise.resolve(gitStatus),
    );
    barWidth = 180;
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();

    expect(checkButtonLabel(container)).toBe('');
    expect(container.querySelector('button svg')).not.toBeNull();
    expect(upstreamLabel(container)).toBe('@main');
  });

  it('检查中宽度足够时保留检查中文案', async () => {
    mockGetGitStatus.mockImplementation((_path: string, fetchRemote: boolean) =>
      fetchRemote ? new Promise<GitProjectStatus>(() => {}) : Promise.resolve(gitStatus),
    );
    const { container } = renderBar();

    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
    triggerResize();

    expect(checkButtonLabel(container)).toBe('检查中...');
  });
});
