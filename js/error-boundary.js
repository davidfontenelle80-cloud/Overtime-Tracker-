/**
 * error-boundary.js - KHub Boilerplate
 * Global error boundary with a specific troubleshooting label.
 */
(function () {
  'use strict';

  let _retryFn = null;
  let _lastErrorReport = '';

  function asText(value) {
    if (value == null) return '';
    if (value instanceof Error) return value.message || value.name || 'Unknown error';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }

  function fileName(src) {
    if (!src) return 'unknown';
    try { return String(src).split('/').pop().split('?')[0] || 'unknown'; }
    catch (e) { return 'unknown'; }
  }

  function clean(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'unknown';
  }

  function classify(message) {
    const m = String(message || '').toLowerCase();
    if (m.includes('permission') || m.includes('firestore')) return 'CLOUD-RULES';
    if (m.includes('auth') || m.includes('password') || m.includes('email')) return 'AUTH';
    if (m.includes('quota') || m.includes('network') || m.includes('fetch')) return 'NETWORK';
    if (m.includes('localstorage') || m.includes('storage')) return 'STORAGE';
    return 'JS-ERROR';
  }

  function buildContext(message, meta) {
    meta = meta || {};
    const rawMessage = asText(message || meta.message || meta.error || meta.reason);
    const source = fileName(meta.filename || meta.source || meta.file);
    const line = meta.lineno || meta.line || '';
    const col = meta.colno || meta.column || '';
    const kind = meta.kind || classify(rawMessage);
    const where = source + (line ? ':' + line : '') + (col ? ':' + col : '');
    const label = [kind, clean(where)].filter(Boolean).join('-');
    return {
      kind,
      label,
      message: rawMessage || 'No error message was provided.',
      where,
      stack: asText(meta.stack || (meta.error && meta.error.stack) || (meta.reason && meta.reason.stack))
    };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function show(message, retryFn, meta) {
    if (retryFn && typeof retryFn === 'object' && !meta) {
      meta = retryFn;
      retryFn = null;
    }
    _retryFn = typeof retryFn === 'function' ? retryFn : null;

    const el  = document.getElementById('error-boundary');
    const msg = document.getElementById('error-message');
    const ctx = buildContext(message, meta);
    _lastErrorReport = 'Error label: ' + ctx.label + '\nMessage: ' + ctx.message + '\nWhere: ' + ctx.where + (ctx.stack ? '\nStack: ' + ctx.stack : '');

    if (!el || !msg) {
      console.error('[KHub.ErrorBoundary]', _lastErrorReport);
      return;
    }

    const heading = el.querySelector('strong');
    if (heading) heading.textContent = ctx.kind === 'JS-ERROR' ? 'App error caught' : ctx.kind.replace(/-/g, ' ');
    msg.textContent = ctx.message;

    el.querySelectorAll('.error-boundary-footer, .error-boundary-details').forEach(node => node.remove());
    Array.from(el.children).forEach(child => {
      if (child.tagName === 'BUTTON') child.remove();
    });

    const details = document.createElement('div');
    details.className = 'error-boundary-details';

    const labelRow = document.createElement('div');
    const labelStrong = document.createElement('strong');
    labelStrong.textContent = 'Error label: ';
    const labelCode = document.createElement('code');
    labelCode.textContent = ctx.label;
    labelRow.appendChild(labelStrong);
    labelRow.appendChild(labelCode);

    const whereRow = document.createElement('div');
    const whereStrong = document.createElement('strong');
    whereStrong.textContent = 'Where: ';
    const whereText = document.createElement('span');
    whereText.textContent = ctx.where;
    whereRow.appendChild(whereStrong);
    whereRow.appendChild(whereText);

    const help = document.createElement('div');
    help.className = 'error-boundary-help';
    help.textContent = 'Send this label and what you tapped before the error.';

    details.appendChild(labelRow);
    details.appendChild(whereRow);
    details.appendChild(help);
    el.appendChild(details);

    const dismiss = window.KHub?.I18n?.t('dismiss') || 'Dismiss';
    const retry = window.KHub?.I18n?.t('tryAgain') || 'Try again';

    const actions = document.createElement('div');
    actions.className = 'error-boundary-footer';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-sm btn-secondary';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy error';
    copyBtn.addEventListener('click', () => {
      copyText(_lastErrorReport).then(() => {
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy error'; }, 1200);
      }).catch(() => console.warn('[KHub.ErrorBoundary] Copy failed'));
    });
    actions.appendChild(copyBtn);

    if (_retryFn) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-sm btn-secondary';
      retryBtn.type = 'button';
      retryBtn.textContent = retry;
      retryBtn.addEventListener('click', () => { const fn = _retryFn; dismissError(); if (fn) fn(); });
      actions.appendChild(retryBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn-sm btn-danger';
    dismissBtn.type = 'button';
    dismissBtn.textContent = dismiss;
    dismissBtn.addEventListener('click', dismissError);
    actions.appendChild(dismissBtn);

    el.appendChild(actions);
    el.hidden = false;
    el.focus();

    window.KHub?.A11y?.announce(ctx.kind + ': ' + ctx.message + '. Error label ' + ctx.label, 'assertive');
  }

  function dismissError() {
    const el = document.getElementById('error-boundary');
    if (el) el.hidden = true;
    _retryFn = null;
  }

  window.addEventListener('error', event => {
    const err = event.error;
    console.error('[KHub] Uncaught error:', err || event.message);
    show(event.message || err, null, {
      kind: 'JS-ERROR',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: err,
      stack: err && err.stack
    });
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    console.error('[KHub] Unhandled rejection:', reason);
    show(asText(reason), null, {
      kind: classify(asText(reason)),
      source: 'promise',
      reason,
      stack: reason && reason.stack
    });
  });

  window.KHub = window.KHub || {};
  window.KHub.ErrorBoundary = { show, dismiss: dismissError, lastReport: () => _lastErrorReport };
})();