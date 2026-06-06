/**
 * config.js — KHub Boilerplate
 * Environment detection and feature flags.
 *
 * No build step — dev vs prod is detected at runtime from location.hostname.
 * Dev  = localhost / 127.0.0.1 / file:// protocol
 * Prod = everything else (GitHub Pages, Netlify, custom domain, etc.)
 *
 * Feature flags:
 *   auth     — enables KHub.Auth sign-in/out (implement provider in auth.js)
 *   firebase — enables Firebase SDK (configure in firebase/firebase-config.js)
 *
 * To fork this boilerplate for a new app, update:
 *   appName, version, repoOwner, repoName
 */
(function () {
  'use strict';

  const hostname = location.hostname;
  const isDev    = hostname === 'localhost'
                || hostname === '127.0.0.1'
                || location.protocol === 'file:';

  window.KHub = window.KHub || {};
  window.KHub.Config = {
    // ── Identity ──────────────────────────────────────────
    appName:   'Overtime Tracker',
    version:   '1.0.0',
    repoOwner: 'davidfontenelle80-cloud',
    repoName:  'Overtime-Tracker-',

    // ── Environment ───────────────────────────────────────
    env:    isDev ? 'development' : 'production',
    isDev,
    isProd: !isDev,

    // ── Feature flags ─────────────────────────────────────
    // Set to true to activate. See individual module files for setup steps.
    features: {
      auth:     false,   // -> js/auth.js
      firebase: true,    // -> firebase/firebase-config.js
    },

    // ── Logging ───────────────────────────────────────────
    // Use KHub.Config.log() instead of console.log() so logs are
    // automatically silenced in production.
    log(...args) {
      if (isDev) console.log('[KHub]', ...args);
    },
    warn(...args) {
      if (isDev) console.warn('[KHub]', ...args);
    },
  };

  if (isDev) {
    console.log(`[KHub] Dev mode — v${window.KHub.Config.version}`);
  }
})();

