/**
 * error-boundary.js — KHub Boilerplate
 * Global error boundary: catches uncaught errors and unhandled promise rejections.
 *
 * Features:
 *  - Shows user-facing message (translated via i18n)
 *  - Shows technical detail in dev mode only
 *  - Dismiss button hides the banner
 *  - Optional retry callback (pass a function to show a "Try again" button)
 *  - Announces error to screen readers via KHub.A11y.announce
 *  - Logs all errors to console (swap for Sentry / Firebase Crashlytics here)
 *
 * Manual usage:
 *   KHub.ErrorBoundary.show('Custom message', retryFn?)
 *   KHub.ErrorBoundary.dismiss()
 */
(function () {
  'use strict';

  let _retryFn = null;

  function show(message, retryFn) {
    _retryFn = retryFn || null;

    const el  = document.getElementById('error-boundary');
    const msg = document.getElementById('error-message');
    if (!el || !msg) {
      // DOM not ready yet — fall back to console
      console.error('[KHub.ErrorBoundary]', message);
      return;
    }

    const title   = window.KHub?.I18n?.t('errorTitle')  || 'Something went wrong';
    const dismiss = window.KHub?.I18n?.t('dismiss')      || 'Dismiss';
    const retry   = window.KHub?.I18n?.t('tryAgain')     || 'Try again';

    msg.textContent = message || title;

    // Rebuild action buttons
    const footer = el.querySelector('.error-boundary-footer');
    if (footer) footer.remove();
    const actions = document.createElement('div');
    actions.className = 'error-boundary-footer';

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn-sm btn-danger';
    dismissBtn.textContent = dismiss;
    dismissBtn.addEventListener('click', KHub.ErrorBoundary.dismiss);
    actions.appendChild(dismissBtn);

    if (typeof retryFn === 'function') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-sm btn-secondary';
      retryBtn.textContent = retry;
      retryBtn.addEventListener('click', () => { dismiss(); retryFn(); });
      actions.appendChild(retryBtn);
    }

    el.appendChild(actions);
    el.hidden = false;
    el.focus();

    // Announce to screen readers
    window.KHub?.A11y?.announce(msg.textContent, 'assertive');
  }

  function dismiss() {
    const el = document.getElementById('error-boundary');
    if (el) el.hidden = true;
    _retryFn = null;
  }

  // ── Global error handlers ─────────────────────────────────
  window.addEventListener('error', event => {
    console.error('[KHub] Uncaught error:', event.error ?? event.message);
    const detail = window.KHub?.Config?.isDev ? event.message : null;
    show(detail);
  });

  window.addEventListener('unhandledrejection', event => {
    console.error('[KHub] Unhandled rejection:', event.reason);
    const detail = window.KHub?.Config?.isDev ? String(event.reason) : null;
    show(detail);
  });

  window.KHub = window.KHub || {};
  window.KHub.ErrorBoundary = { show, dismiss };
})();

