/**
 * theme.js — KHub Boilerplate
 * Dark mode toggle with system-preference sync.
 *
 * Behavior:
 *   1. On first visit: reads prefers-color-scheme
 *   2. User can toggle — choice saved to localStorage
 *   3. Listens for OS-level changes and follows them (only if user hasn't overridden)
 *   4. Sets data-theme="light"|"dark" on <html>
 *   5. Updates toggle button text + aria-label
 */
(function () {
  'use strict';

  const STORAGE_KEY  = 'khub_theme';
  const OVERRIDE_KEY = 'khub_theme_override'; // true = user explicitly chose

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const isDark = theme === 'dark';
      btn.textContent = isDark ? '☀️' : '🌙';
      // Use i18n if loaded, otherwise fall back to English
      const label = isDark
        ? (window.KHub?.I18n?.t('themeToggleLight') || 'Switch to light mode')
        : (window.KHub?.I18n?.t('themeToggleDark')  || 'Switch to dark mode');
      btn.setAttribute('aria-label', label);
    }

    if (window.KHub?.emit) window.KHub.emit('theme:change', theme);
  }

  function toggle() {
    localStorage.setItem(OVERRIDE_KEY, 'true');
    apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }

  // Follow OS changes unless the user has explicitly chosen
  mediaQuery.addEventListener('change', e => {
    if (!localStorage.getItem(OVERRIDE_KEY)) {
      apply(e.matches ? 'dark' : 'light');
    }
  });

  // Apply immediately (before DOMContentLoaded) to prevent flash of wrong theme
  apply(getInitialTheme());

  window.KHub = window.KHub || {};
  window.KHub.Theme = {
    apply,
    toggle,
    get current() { return document.documentElement.getAttribute('data-theme'); },
    reset() {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OVERRIDE_KEY);
      apply(mediaQuery.matches ? 'dark' : 'light');
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle')?.addEventListener('click', toggle);
  });
})();

