import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { screen } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '../I18nContext';
import { LayoutSelector } from '../components/LayoutSelector';

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe('LayoutSelector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders multi button with default text', () => {
    render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={vi.fn()} />
      </TestWrapper>
    );

    expect(screen.getAllByText('多开').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('单屏')).not.toBeInTheDocument();
  });

  it('automatically opens popup window when mouse hovers over the button', () => {
    const { container } = render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={vi.fn()} />
      </TestWrapper>
    );

    const rootContainer = container.firstElementChild as HTMLElement;
    expect(screen.queryByText('单屏')).not.toBeInTheDocument();

    // Mouse enters container/button
    fireEvent.mouseEnter(rootContainer);

    expect(screen.getByText('单屏')).toBeInTheDocument();
    expect(screen.getByText('恢复初始')).toBeInTheDocument();
  });

  it('automatically closes popup window when mouse leaves the button/popup', () => {
    const { container } = render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={vi.fn()} />
      </TestWrapper>
    );

    const rootContainer = container.firstElementChild as HTMLElement;

    // Hover to open
    fireEvent.mouseEnter(rootContainer);
    expect(screen.getByText('单屏')).toBeInTheDocument();

    // Mouse leaves
    fireEvent.mouseLeave(rootContainer);
    // Before timeout finishes, it is still visible
    expect(screen.getByText('单屏')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByText('单屏')).toBeInTheDocument();

    // Advance timer past the 20ms close timeout
    act(() => {
      vi.advanceTimersByTime(15);
    });

    expect(screen.queryByText('单屏')).not.toBeInTheDocument();
  });

  it('keeps popup open if mouse re-enters before timeout completes', () => {
    const { container } = render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={vi.fn()} />
      </TestWrapper>
    );

    const rootContainer = container.firstElementChild as HTMLElement;

    // Hover to open
    fireEvent.mouseEnter(rootContainer);
    expect(screen.getByText('单屏')).toBeInTheDocument();

    // Mouse leaves briefly (e.g. crossing between button and popup)
    fireEvent.mouseLeave(rootContainer);
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // Re-enters
    fireEvent.mouseEnter(rootContainer);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Should still remain open
    expect(screen.getByText('单屏')).toBeInTheDocument();
  });

  it('selects layout option and closes popup on option click', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={onSelect} />
      </TestWrapper>
    );

    const rootContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(rootContainer);

    // Click single layout option
    const singleBtn = screen.getByRole('button', { name: '单屏' });
    fireEvent.click(singleBtn);

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.queryByText('单屏')).not.toBeInTheDocument();
  });

  it('restores pending layout on click when pendingLayout exists without affecting hover behavior', () => {
    const onRestorePending = vi.fn();
    render(
      <TestWrapper>
        <LayoutSelector
          layoutMode={null}
          pendingLayout="2x1"
          onRestorePending={onRestorePending}
          onSelect={vi.fn()}
        />
      </TestWrapper>
    );

    const button = screen.getByTitle('布局');
    fireEvent.click(button);

    expect(onRestorePending).toHaveBeenCalledTimes(1);
  });

  it('closes popup on Escape key', () => {
    const { container } = render(
      <TestWrapper>
        <LayoutSelector layoutMode={null} onSelect={vi.fn()} />
      </TestWrapper>
    );

    const rootContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(rootContainer);
    expect(screen.getByText('单屏')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('单屏')).not.toBeInTheDocument();
  });
});
