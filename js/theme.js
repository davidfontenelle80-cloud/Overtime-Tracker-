/**
 * theme.js -- KHub Boilerplate
 * Dark is the default. Light is the toggle.
 * On first visit with no saved preference, dark is applied.
 * Respects OS preference only if the user has not manually chosen.
 * Updates <meta name="theme-color"> live on every theme change.
 */
(function () {
  'use strict';

  const STORAGE_KEY  = 'khub_theme';
  const OVERRIDE_KEY = 'khub_theme_override';
  const META_COLORS  = { dark: '#0b0d12', light: '#eef1f5' };

  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    // Dark default unless OS explicitly prefers light
    return mediaQuery.matches ? 'light' : 'dark';
  }

  function updateMetaColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = META_COLORS[theme] || META_COLORS.dark;
  }

  function apply(theme) {
    if (theme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
    updateMetaColor(theme);

    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const isDark = theme === 'dark';
      btn.textContent = isDark ? '☀️' : '🌙';
      const label = isDark
        ? (window.KHub?.I18n?.t('themeToggleLight') || 'Switch to light mode')
        : (window.KHub?.I18n?.t('themeToggleDark')  || 'Switch to dark mode');
      btn.setAttribute('aria-label', label);
    }

    if (window.KHub?.emit) window.KHub.emit('theme:change', theme);
  }

  function toggle() {
    localStorage.setItem(OVERRIDE_KEY, 'true');
    const current = localStorage.getItem(STORAGE_KEY) || 'dark';
    apply(current === 'dark' ? 'light' : 'dark');
  }

  // Follow OS changes only if user has not manually overridden
  mediaQuery.addEventListener('change', e => {
    if (!localStorage.getItem(OVERRIDE_KEY)) {
      apply(e.matches ? 'light' : 'dark');
    }
  });

  // Apply immediately before DOMContentLoaded to prevent flash
  apply(getInitialTheme());

  window.KHub = window.KHub || {};
  window.KHub.Theme = {
    apply,
    toggle,
    get current() {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    },
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OVERRIDE_KEY);
      apply(mediaQuery.matches ? 'light' : 'dark');
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', toggle);
  });
})();
