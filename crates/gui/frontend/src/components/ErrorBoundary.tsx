import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    window.dispatchEvent(
      new CustomEvent('errorboundary:error', {
        detail: { error: error.message, componentStack: errorInfo.componentStack },
      }),
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '200px',
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
            出错了
          </h3>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: '0.85rem',
              maxWidth: '400px',
              color: 'var(--text-tertiary)',
            }}
          >
            {this.state.error?.message || '组件渲染时发生未知错误'}
          </p>
          <button
            onClick={this.handleRetry}
            className="btn-secondary"
            style={{
              padding: '8px 24px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            点击重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
