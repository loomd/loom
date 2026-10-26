import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { openUrl } from '../api';
import { useToast } from '../ToastContext';

interface ApkDownloadQrBadgeProps {
  className?: string;
}

export const ApkDownloadQrBadge: React.FC<ApkDownloadQrBadgeProps> = ({ className = '' }) => {
  const toast = useToast();
  const [version, setVersion] = useState<string>('0.8.3');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 获取当前客户端版本号
  useEffect(() => {
    let cancelled = false;
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((v) => {
        if (!cancelled && v) setVersion(v);
      })
      .catch(() => {
        // 非 Tauri 环境或获取失败时保持 fallback 版本
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const apkFileName = `Loom-${version}.apk`;
  const downloadUrl = `https://github.com/loomd/loom/releases/download/v${version}/${apkFileName}`;

  // 渲染二维码
  useEffect(() => {
    QRCode.toDataURL(downloadUrl, {
      width: 170,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('生成 APK 下载二维码失败:', err));
  }, [downloadUrl]);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 220);
  };

  const handleOpenBrowser = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await openUrl(downloadUrl);
      toast.success('已在系统浏览器中打开下载页面');
    } catch {
      window.open(downloadUrl, '_blank');
      toast.success('已在新标签页打开下载页面');
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(downloadUrl);
      toast.success('下载直链已复制到剪贴板');
    } catch {
      toast.error('复制失败，请手动在浏览器中打开');
    }
  };

  return (
    <div
      className={`apk-qr-badge-container ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="button"
      aria-label="扫码下载 APK"
    >
      <div className={`apk-qr-badge ${isOpen ? 'active' : ''}`}>
        <svg
          className="apk-qr-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* 手机外框 */}
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
        <span className="apk-qr-badge-text">扫码下载 APK</span>
        <svg
          className="apk-qr-mini-code"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </div>

      {isOpen && (
        <div className="apk-qr-popover" onClick={(e) => e.stopPropagation()}>
          <div className="apk-qr-popover-header">
            <div className="apk-qr-popover-title">
              <span className="apk-qr-popover-name">Loom 手机端</span>
              <span className="badge badge-emerald apk-qr-version">v{version}</span>
            </div>
            <div className="apk-qr-popover-subtitle">Android 安装包 (APK)</div>
          </div>

          <div className="apk-qr-image-wrapper">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`下载 Loom v${version} APK 二维码`}
                className="apk-qr-image"
                width={170}
                height={170}
              />
            ) : (
              <div className="apk-qr-placeholder">正在生成二维码...</div>
            )}
          </div>

          <div className="apk-qr-meta">
            <div className="apk-qr-meta-item">
              <span className="apk-qr-meta-label">文件名称:</span>
              <span className="apk-qr-meta-value apk-qr-mono" title={apkFileName}>
                {apkFileName}
              </span>
            </div>
            <div className="apk-qr-meta-item">
              <span className="apk-qr-meta-label">包名:</span>
              <span className="apk-qr-meta-value apk-qr-mono">loom.ccxcc.cn</span>
            </div>
          </div>

          <div className="apk-qr-popover-tip">
            手机相机或浏览器扫码，直接下载并安装
          </div>

          <div className="apk-qr-popover-actions">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleCopyLink}
              title="复制直接下载链接"
            >
              复制直链
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={handleOpenBrowser}
              title="在系统浏览器中直接下载安装包"
            >
              电脑下载
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApkDownloadQrBadge;
