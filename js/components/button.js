/**
 * components/button.js — KHub Boilerplate
 * Programmatic button factory.
 * Usage: KHub.Components.Button.create({ label, variant, onClick, ariaLabel })
 * Variants: 'primary' | 'secondary' | 'danger' | 'icon' | 'sm'
 */
(function () {
  'use strict';

  function create({ label = 'Button', variant = 'primary', onClick, ariaLabel, disabled = false, icon = null } = {}) {
    const btn = document.createElement('button');
    btn.className = `btn btn-${variant}`;
    btn.textContent = icon ? `${icon} ${label}` : label;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    if (disabled) btn.disabled = true;
    if (typeof onClick === 'function') btn.addEventListener('click', onClick);
    return btn;
  }

  window.KHub = window.KHub || {};
  window.KHub.Components = window.KHub.Components || {};
  window.KHub.Components.Button = { create };
})();

