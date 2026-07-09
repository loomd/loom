import React from 'react';

export function EditorPlaceholder() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary, #1e1e1e)',
        color: 'var(--text-muted, #888)',
        fontSize: '13px',
        minHeight: '100%',
        width: '100%',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '2px solid var(--border-subtle, #3e3e42)',
            borderTopColor: 'var(--accent, #6ee7b7)',
            borderRadius: '50%',
            animation: 'editor-spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <div>Loading editor...</div>
      </div>
      <style>{`
        @keyframes editor-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}