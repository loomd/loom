import React from 'react';
import { useI18n } from '../I18nContext';
import { useToast } from '../ToastContext';

interface Props {
  theme: 'dark' | 'day';
  onThemeChange: (newTheme: 'dark' | 'day') => Promise<void>;
  fontFamily: string;
  fontSize: string;
  onFontFamilyChange: (family: string) => Promise<void>;
  onFontSizeChange: (size: string) => Promise<void>;
}

const PRESETS = [
  'System Default',
  'Plus Jakarta Sans',
  'HarmonyOS Sans SC',
  'Inter',
  'Outfit',
  'JetBrains Mono',
  'Fira Code'
];

export default function SettingsPage({
  theme,
  onThemeChange,
  fontFamily,
  fontSize,
  onFontFamilyChange,
  onFontSizeChange
}: Props) {
  const { t, language, setLanguage } = useI18n();
  const toast = useToast();

  const handleThemeSelect = async (newTheme: 'dark' | 'day') => {
    try {
      await onThemeChange(newTheme);
      toast.success(t('settings.toast.themeSaved'));
    } catch {
      toast.error(t('settings.toast.themeSaveFailed'));
    }
  };

  const handleFontFamilySelect = async (family: string) => {
    try {
      await onFontFamilyChange(family);
      toast.success(t('settings.toast.fontSaved'));
    } catch {
      toast.error(t('settings.toast.fontSaveFailed'));
    }
  };

  const handleFontSizeSelect = async (size: string) => {
    try {
      await onFontSizeChange(size);
      toast.success(t('settings.toast.fontSaved'));
    } catch {
      toast.error(t('settings.toast.fontSaveFailed'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-title">{t('settings.title')}</div>
          <div className="page-subtitle">{t('settings.subtitle')}</div>
        </div>
      </div>

      {/* ── Page Body ────────────────────────────────────── */}
      <div className="page-body" style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* ── Theme Settings ─────────────────────────────── */}
        <div className="card-outer">
          <div className="card-inner" style={{ padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {t('settings.theme.title')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              {t('settings.theme.desc')}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Dark Theme Option */}
              <button
                onClick={() => handleThemeSelect('dark')}
                style={{
                  background: theme === 'dark' ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                  border: theme === 'dark' ? '2px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 200ms var(--ease-spring)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
                className={theme === 'dark' ? 'theme-active' : ''}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: '20px' }}>🌙</span>
                  {theme === 'dark' && (
                    <span style={{
                      background: 'var(--accent-purple)',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>✓</span>
                  )}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('settings.theme.dark')}
                </span>
              </button>

              {/* Day Theme Option */}
              <button
                onClick={() => handleThemeSelect('day')}
                style={{
                  background: theme === 'day' ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                  border: theme === 'day' ? '2px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 200ms var(--ease-spring)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
                className={theme === 'day' ? 'theme-active' : ''}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: '20px' }}>☀️</span>
                  {theme === 'day' && (
                    <span style={{
                      background: 'var(--accent-purple)',
                      color: '#ffffff',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>✓</span>
                  )}
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('settings.theme.day')}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Font Settings ─────────────────────────────── */}
        <div className="card-outer">
          <div className="card-inner" style={{ padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {t('settings.font.title')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              {t('settings.font.desc')}
            </div>

            {/* Font Family Selection */}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              {t('settings.font.family')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {PRESETS.map(preset => {
                const isActive = fontFamily === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => handleFontFamilySelect(preset)}
                    style={{
                      background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                      border: isActive ? '1px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontFamily: preset === 'System Default' ? 'inherit' : preset,
                      color: 'var(--text-primary)',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 200ms var(--ease-spring)',
                    }}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            {/* Custom Font Family Input */}
            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label">{t('settings.font.custom')}</label>
              <input
                className="input"
                placeholder={t('settings.font.customPlaceholder')}
                value={PRESETS.includes(fontFamily) ? '' : fontFamily}
                onChange={e => {
                  const val = e.target.value;
                  onFontFamilyChange(val || 'System Default');
                }}
                style={{ maxWidth: '320px' }}
              />
            </div>

            {/* Font Size Selection */}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              {t('settings.font.size')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: t('settings.font.small'), value: '12px' },
                { label: t('settings.font.medium'), value: '14px' },
                { label: t('settings.font.large'), value: '16px' },
                { label: t('settings.font.xlarge'), value: '18px' },
              ].map(sz => {
                const isActive = fontSize === sz.value;
                return (
                  <button
                    key={sz.value}
                    onClick={() => handleFontSizeSelect(sz.value)}
                    style={{
                      background: isActive ? 'var(--accent-purple-dim)' : 'var(--bg-elevated)',
                      border: isActive ? '1px solid var(--accent-purple)' : '1px solid var(--border-mid)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      color: 'var(--text-primary)',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 200ms var(--ease-spring)',
                    }}
                  >
                    {sz.label}
                  </button>
                );
              })}
            </div>

            {/* Font Preview Section */}
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {t('settings.font.preview')}
            </div>
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              fontFamily: fontFamily === 'System Default' ? 'inherit' : fontFamily,
              fontSize: fontSize,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
            }}>
              The quick brown fox jumps over the lazy dog. 1234567890 (智能分类与字体管理测试)
            </div>
          </div>
        </div>

        {/* ── Language Settings ──────────────────────────── */}
        <div className="card-outer">
          <div className="card-inner" style={{ padding: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {t('settings.lang.title')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('settings.lang.desc')}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setLanguage('zh')}
                className={`btn ${language === 'zh' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', padding: '10px 20px' }}
              >
                简体中文
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`btn ${language === 'en' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', padding: '10px 20px' }}
              >
                English
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

