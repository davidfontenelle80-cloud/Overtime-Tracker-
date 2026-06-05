/**
 * a11y.js — KHub Boilerplate
 * Accessibility utilities: live region, focus management,
 * dynamic text sizing, keyboard shortcuts.
 *
 * Load this AFTER config.js and BEFORE app.js.
 */
(function () {
  'use strict';

  // ── Live region announcer ─────────────────────────────────
  // Screen readers announce messages pushed here.
  // Usage: KHub.A11y.announce('File saved.') — polite (non-interrupting)
  //        KHub.A11y.announce('Error!', 'assertive') — interrupting
  let _politeRegion, _assertiveRegion;

  function _ensureRegions() {
    if (_politeRegion) return;
    _politeRegion = document.createElement('div');
    _politeRegion.setAttribute('aria-live', 'polite');
    _politeRegion.setAttribute('aria-atomic', 'true');
    _politeRegion.className = 'sr-only';
    document.body.appendChild(_politeRegion);

    _assertiveRegion = document.createElement('div');
    _assertiveRegion.setAttribute('aria-live', 'assertive');
    _assertiveRegion.setAttribute('aria-atomic', 'true');
    _assertiveRegion.className = 'sr-only';
    document.body.appendChild(_assertiveRegion);
  }

  function announce(message, priority = 'polite') {
    _ensureRegions();
    const region = priority === 'assertive' ? _assertiveRegion : _politeRegion;
    // Clear then set — ensures re-announcement of same message
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = message; });
  }

  // ── Focus management ──────────────────────────────────────
  // Move focus to a heading or landmark after a view change.
  // Usage: KHub.A11y.focusMain()  /  KHub.A11y.focusEl('#some-id')
  function focusMain() {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: false });
  }

  function focusEl(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: false });
  }

  // ── Dynamic text sizing ───────────────────────────────────
  // Respects browser font size preferences via rem.
  // Users can override via a font-size control (e.g., A- / A+).
  // Multiplier stored in localStorage; applied to <html> font-size.
  const FONT_KEY     = 'khub_font_scale';
  const FONT_STEPS   = [0.85, 1, 1.15, 1.3];  // 85% / 100% / 115% / 130%
  let   _fontStep    = parseInt(localStorage.getItem(FONT_KEY) ?? '1', 10);

  function applyFontScale(step) {
    _fontStep = Math.max(0, Math.min(FONT_STEPS.length - 1, step));
    document.documentElement.style.fontSize = `${FONT_STEPS[_fontStep] * 16}px`;
    localStorage.setItem(FONT_KEY, String(_fontStep));
  }

  function increaseFontSize() { applyFontScale(_fontStep + 1); }
  function decreaseFontSize() { applyFontScale(_fontStep - 1); }
  function resetFontSize()    { applyFontScale(1); }

  // ── Keyboard shortcut registry ────────────────────────────
  // Usage: KHub.A11y.addShortcut('alt+d', () => KHub.Theme.toggle())
  const _shortcuts = {};

  function addShortcut(combo, fn) {
    _shortcuts[combo.toLowerCase()] = fn;
  }

  function _comboFromEvent(e) {
    const parts = [];
    if (e.altKey)   parts.push('alt');
    if (e.ctrlKey)  parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  document.addEventListener('keydown', e => {
    // Skip if inside an input/textarea (don't steal text editing shortcuts)
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const fn = _shortcuts[_comboFromEvent(e)];
    if (fn) { e.preventDefault(); fn(e); }
  });

  // ── Default shortcuts ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    applyFontScale(_fontStep);

    // Alt+D — toggle dark mode
    addShortcut('alt+d', () => window.KHub?.Theme?.toggle());
    // Alt+L — toggle language
    addShortcut('alt+l', () => window.KHub?.I18n?.toggle());
    // Alt+H — jump to main content (keyboard shortcut complement to skip link)
    addShortcut('alt+h', () => focusMain());
  });

  window.KHub = window.KHub || {};
  window.KHub.A11y = {
    announce,
    focusMain,
    focusEl,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
    addShortcut,
  };
})();

