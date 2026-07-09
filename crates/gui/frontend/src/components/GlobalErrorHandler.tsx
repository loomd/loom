import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../ToastContext';

export default function GlobalErrorHandler() {
  const toast = useToast();

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
      invoke('log_frontend', { level: 'error', message: msg }).catch(() => {});
      toast.error('发生未知运行时错误，请查看控制台日志');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.stack || event.reason.message
          : String(event.reason);
      invoke('log_frontend', {
        level: 'error',
        message: `Unhandled rejection: ${reason}`,
      }).catch(() => {});
      toast.error('未处理的 Promise 错误，请查看控制台日志');
    };

    const handleErrorBoundary = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      console.error('[ErrorBoundary Error]', detail?.error, detail?.componentStack);
      toast.error('组件渲染错误，已尝试恢复');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('errorboundary:error', handleErrorBoundary);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('errorboundary:error', handleErrorBoundary);
    };
  }, [toast]);

  return null;
}
