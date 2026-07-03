import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { readTextFile, writeTextFile } from '../api';
import { useToast } from '../ToastContext';
import { useI18n } from '../I18nContext';

interface FileEditorProps {
  filePath: string;
  onContentDirtyChange: (isDirty: boolean) => void;
  theme?: 'dark' | 'day' | 'gray';
}

const getMonacoTheme = (theme?: 'dark' | 'day' | 'gray') => {
  switch (theme) {
    case 'day':
      return 'vs';
    case 'gray':
      return 'vs-dark';
    default:
      return 'vs-dark';
  }
};

export function FileEditor({ filePath, onContentDirtyChange, theme }: FileEditorProps) {
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { t } = useI18n();

  // Load file content
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    readTextFile(filePath)
      .then((data) => {
        if (!active) return;
        setContent(data);
        setInitialContent(data);
        onContentDirtyChange(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to read file:', err);
        setError(String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filePath]);

  // Determine Monaco Editor language mode from file extension
  const getLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'json':
        return 'json';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'rs':
        return 'rust';
      case 'toml':
        return 'toml';
      case 'md':
        return 'markdown';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'bat':
      case 'cmd':
        return 'bat';
      case 'py':
        return 'python';
      case 'go':
        return 'go';
      case 'sql':
        return 'sql';
      case 'xml':
        return 'xml';
      default:
        return 'plaintext';
    }
  };

  const handleSave = async (currentVal: string) => {
    try {
      await writeTextFile(filePath, currentVal);
      setInitialContent(currentVal);
      onContentDirtyChange(false);
      toast.success(t('editor.toast.saved') || '文件保存成功');
    } catch (err) {
      console.error('Failed to save file:', err);
      toast.error((t('editor.toast.saveFailed') || '保存失败: ') + String(err));
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const newVal = value || '';
    setContent(newVal);
    const isDirty = newVal !== initialContent;
    onContentDirtyChange(isDirty);
  };

  // Keyboard shortcut listener for Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!loading && !error) {
          handleSave(content);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [content, loading, error, filePath, initialContent]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-tertiary)',
        gap: '12px'
      }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: '2px solid var(--border-subtle)',
          borderTopColor: 'var(--accent-purple)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ fontSize: '0.85rem' }}>{t('editor.loading') || '正在加载文件内容...'}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--accent-red)',
        gap: '16px',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2rem' }}>⚠️</div>
        <div style={{ fontSize: '0.9rem', maxWidth: '400px', wordBreak: 'break-all' }}>
          {(t('editor.error') || '加载文件失败: ') + error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Editor Header Bar with Save Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-elevated, rgba(255,255,255,0.01))',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)'
      }}>
        <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={filePath}>
          {filePath}
        </span>
        <button
          onClick={() => handleSave(content)}
          disabled={content === initialContent}
          style={{
            background: content === initialContent ? 'transparent' : 'var(--accent-purple)',
            color: content === initialContent ? 'var(--text-tertiary)' : '#fff',
            border: content === initialContent ? '1px solid var(--border-subtle)' : '1px solid transparent',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: content === initialContent ? 'not-allowed' : 'pointer',
            fontSize: '0.72rem',
            fontWeight: 500,
            transition: 'background 0.2s'
          }}
        >
          💾 {t('editor.save') || '保存 (Ctrl+S)'}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
        <Editor
          height="100%"
          width="100%"
          language={getLanguage(filePath)}
          theme={getMonacoTheme(theme)}
          value={content}
          onChange={handleEditorChange}
          options={{
            fontSize: 13,
            fontFamily: 'Consolas, "Courier New", monospace',
            minimap: { enabled: true },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            tabSize: 2,
            insertSpaces: true
          }}
        />
      </div>
    </div>
  );
}
