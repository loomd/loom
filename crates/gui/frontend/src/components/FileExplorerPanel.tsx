import React from 'react';
import type { FileEntry } from '../api';

interface ContextMenuState {
  x: number;
  y: number;
  file: FileEntry;
}

interface FileExplorerPanelProps {
  files: FileEntry[];
  loadingFiles: boolean;
  fileError: string | null;
  fileFilter: string;
  currentPath: string;
  isAtRoot: boolean;
  contextMenu: ContextMenuState | null;
  onRefresh: () => void;
  onGoUp: () => void;
  onFilterChange: (value: string) => void;
  onFileDoubleClick: (file: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, file: FileEntry) => void;
  onCloseContextMenu: () => void;
  onOpenInManager: () => void;
  onDeleteFile: () => void;
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name: string, isDir: boolean) {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'py':
    case 'rs':
    case 'go':
    case 'c':
    case 'cpp':
    case 'h':
    case 'java':
      return '📄';
    case 'toml':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'ini':
    case 'conf':
    case 'lock':
      return '⚙️';
    case 'md':
    case 'txt':
    case 'pdf':
      return '📝';
    case 'gitignore':
      return '🛡️';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'ico':
      return '🖼️';
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
    case '7z':
      return '📦';
    case 'bat':
    case 'sh':
    case 'cmd':
    case 'ps1':
      return '⚡';
    default:
      return '📄';
  }
}

function renderBreadcrumbs(currentPath: string, onNavigate: (path: string) => void) {
  const normalized = currentPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const isWindowsRoot = normalized.includes(':');

  const breadcrumbStyle: React.CSSProperties = {
    cursor: 'pointer',
    padding: '0px',
    borderRadius: 'var(--radius-sm, 4px)',
    transition: 'color 150ms ease, background-color 150ms ease',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
      {isWindowsRoot ? (
        <span onClick={() => onNavigate(segments[0] + '/')} style={breadcrumbStyle} className="breadcrumb-item">
          {segments[0]}
        </span>
      ) : (
        <span onClick={() => onNavigate('/')} style={breadcrumbStyle} className="breadcrumb-item">
          /
        </span>
      )}
      {segments.map((seg, idx) => {
        if (idx === 0 && isWindowsRoot) return null;
        let path = '';
        if (isWindowsRoot) {
          path = segments.slice(0, idx + 1).join('/');
        } else {
          path = '/' + segments.slice(0, idx + 1).join('/');
        }
        return (
          <React.Fragment key={idx}>
            <span style={{ color: 'var(--text-tertiary)', userSelect: 'none' }}>/</span>
            <span onClick={() => onNavigate(path)} style={breadcrumbStyle} className="breadcrumb-item">
              {seg}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function FileExplorerPanel({
  files,
  loadingFiles,
  fileError,
  fileFilter,
  currentPath,
  isAtRoot,
  contextMenu,
  onRefresh,
  onGoUp,
  onFilterChange,
  onFileDoubleClick,
  onContextMenu,
  onCloseContextMenu,
  onOpenInManager,
  onDeleteFile,
}: FileExplorerPanelProps) {
  const filtered = files.filter(f => f.name.toLowerCase().includes(fileFilter.toLowerCase()));

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      paddingTop: '2px',
      overflow: 'hidden'
    }}>
      {/* File Explorer Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-card-outer, rgba(255,255,255,0.02))',
        borderRadius: 'var(--radius-sm, 8px)',
        border: '1px solid var(--border-subtle, #27272a)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: 0 }}>
          <button
            onClick={onGoUp}
            disabled={isAtRoot}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary, #fff)',
              cursor: isAtRoot ? 'default' : 'pointer',
              padding: '4px 4px',
              borderRadius: 'var(--radius-sm, 4px)',
              opacity: isAtRoot ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem'
            }}
            title="Go Up"
          >
            ⬆️
          </button>
          <button
            onClick={onRefresh}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary, #fff)',
              cursor: 'pointer',
              padding: '4px 4px',
              borderRadius: 'var(--radius-sm, 4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem'
            }}
            title="Refresh"
          >
            🔄
          </button>
        </div>

        <div style={{ flexGrow: 1, flexShrink: 0, flexBasis: 0, overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', padding: 0, minWidth: 0 }}>
          {renderBreadcrumbs(currentPath, onGoUp)}
        </div>

        <input
          type="text"
          placeholder="Filter files..."
          value={fileFilter}
          onChange={(e) => onFilterChange(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-input, #09090b)',
            color: 'var(--text-primary, #fff)',
            border: '1px solid var(--border-subtle, #27272a)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '4px 10px',
            fontSize: '0.8rem',
            outline: 'none',
            flex: '0 1 80px',
            minWidth: '40px',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {/* File List Pane */}
      <div
        onClick={onCloseContextMenu}
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: 'var(--bg-card-inner, rgba(255,255,255,0.03))',
          borderRadius: 'var(--radius-md, 14px)',
          border: '1px solid var(--border-subtle, #27272a)',
          boxShadow: 'var(--shadow-card-inset)'
        }}>
        {loadingFiles ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            Loading files...
          </div>
        ) : fileError ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '8px', color: 'var(--accent-red, #ef4444)', padding: '20px' }}>
            <span>Error loading files:</span>
            <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', opacity: 0.8, textAlign: 'center', wordBreak: 'break-all' }}>{fileError}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
            No files found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #27272a)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, width: '100px', textAlign: 'right' }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((file) => (
                <tr
                  key={file.path}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                  }}
                  className="file-row"
                >
                  <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <span style={{ fontSize: '1.05rem', lineHeight: 1, userSelect: 'none' }}>{getFileIcon(file.name, file.is_dir)}</span>
                    <span
                      style={{
                        color: file.is_dir ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: file.is_dir ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    {formatFileSize(file.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          onClick={onCloseContextMenu}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000,
              backgroundColor: 'var(--bg-modal, #1c1917)',
              border: '1px solid var(--border-subtle, #3e3e42)',
              borderRadius: 'var(--radius-sm, 6px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              minWidth: '160px',
              padding: '4px',
            }}
          >
            <div
              style={{
                padding: '4px 8px 6px 8px',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                borderBottom: '1px solid var(--border-subtle, #27272a)',
                marginBottom: '4px',
                userSelect: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
              }}
              title={contextMenu.file.name}
            >
              {contextMenu.file.is_dir ? '📁' : '📄'} {contextMenu.file.name}
            </div>
            <button
              onClick={onOpenInManager}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--text-primary, #fafafa)',
                borderRadius: '4px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              📂 在管理器中打开
            </button>
            <button
              onClick={onDeleteFile}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--accent-red, #ef4444)',
                borderRadius: '4px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              🗑 删除{contextMenu.file.is_dir ? '文件夹' : '文件'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
