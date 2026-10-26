import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApkDownloadQrBadge from '../components/ApkDownloadQrBadge';

// Mock api
vi.mock('../api', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// Mock ToastContext
vi.mock('../ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('ApkDownloadQrBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders download badge with initial text', () => {
    render(<ApkDownloadQrBadge />);
    expect(screen.getByText('扫码下载 APK')).toBeInTheDocument();
  });

  it('shows popover with package name on hover and hides on leave', async () => {
    const { container } = render(<ApkDownloadQrBadge />);
    const containerEl = container.querySelector('.apk-qr-badge-container')!;
    expect(screen.queryByText('loom.ccxcc.cn')).not.toBeInTheDocument();

    // 鼠标移入
    fireEvent.mouseEnter(containerEl);
    await waitFor(() => {
      expect(screen.getByText('loom.ccxcc.cn')).toBeInTheDocument();
      expect(screen.getByText('Loom 手机端')).toBeInTheDocument();
      expect(screen.getByText('Android 安装包 (APK)')).toBeInTheDocument();
    });

    // 鼠标移出
    fireEvent.mouseLeave(containerEl);
    await waitFor(
      () => {
        expect(screen.queryByText('loom.ccxcc.cn')).not.toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });
});
