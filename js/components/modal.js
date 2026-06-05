/**
 * components/modal.js — KHub Boilerplate
 * Accessible modal: focus trap, Escape to close, aria roles.
 * Usage: KHub.Components.Modal.open({ title, body, onConfirm, onCancel })
 *        KHub.Components.Modal.close()
 */
(function () {
  'use strict';

  let _backdrop = null;
  let _prevFocus = null;

  const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function trapFocus(modal) {
    const focusable = [...modal.querySelectorAll(FOCUSABLE)];
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first.focus();
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    });
  }

  function open({ title = '', body = '', confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel } = {}) {
    close(); // ensure no double modals
    _prevFocus = document.activeElement;

    _backdrop = document.createElement('div');
    _backdrop.className = 'modal-backdrop';
    _backdrop.setAttribute('role', 'dialog');
    _backdrop.setAttribute('aria-modal', 'true');
    _backdrop.setAttribute('aria-labelledby', 'modal-title');

    _backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">${title}</h2>
          <button class="btn btn-icon" id="modal-close" aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          ${cancelLabel ? `<button class="btn btn-secondary" id="modal-cancel">${cancelLabel}</button>` : ''}
          ${confirmLabel ? `<button class="btn btn-primary" id="modal-confirm">${confirmLabel}</button>` : ''}
        </div>
      </div>`;

    document.body.appendChild(_backdrop);
    trapFocus(_backdrop);

    _backdrop.querySelector('#modal-close')?.addEventListener('click', () => { close(); onCancel?.(); });
    _backdrop.querySelector('#modal-cancel')?.addEventListener('click', () => { close(); onCancel?.(); });
    _backdrop.querySelector('#modal-confirm')?.addEventListener('click', () => { close(); onConfirm?.(); });
    _backdrop.addEventListener('click', e => { if (e.target === _backdrop) { close(); onCancel?.(); } });
    document.addEventListener('keydown', _onEscape);
  }

  function _onEscape(e) {
    if (e.key === 'Escape') { close(); }
  }

  function close() {
    if (_backdrop) {
      _backdrop.remove();
      _backdrop = null;
      document.removeEventListener('keydown', _onEscape);
    }
    _prevFocus?.focus();
    _prevFocus = null;
  }

  window.KHub = window.KHub || {};
  window.KHub.Components = window.KHub.Components || {};
  window.KHub.Components.Modal = { open, close };
})();

