/**
 * auth.js — KHub Boilerplate
 * Reusable auth pattern — wired but inactive by default.
 *
 * Activation:
 *   1. Set KHub.Config.features.auth = true in js/config.js
 *   2. Implement signIn / signOut / onAuthChange with your provider
 *      (Firebase Auth, Supabase, custom JWT — swap the TODO blocks)
 *   3. Call KHub.Auth.renderControls('#container') to inject sign-in UI
 *
 * This module owns:
 *   - Auth state (_user)
 *   - Sign-in / sign-out lifecycle
 *   - onAuthChange subscriber list
 *   - UI controls (sign-in button, user chip, sign-out button)
 */
(function () {
  'use strict';

  let _user       = null;
  const _listeners = [];

  // ── Core auth actions ─────────────────────────────────────

  async function signIn(credentials = {}) {
    if (!_isEnabled()) return null;

    try {
      // TODO: replace with your provider, e.g.:
      // const cred = await firebase.auth().signInWithEmailAndPassword(credentials.email, credentials.password);
      // _setUser(cred.user);
      console.log('[KHub.Auth] signIn — implement provider here.', credentials);
      return null;
    } catch (err) {
      console.error('[KHub.Auth] signIn error:', err);
      window.KHub?.ErrorBoundary?.show(err.message);
      return null;
    }
  }

  async function signOut() {
    if (!_isEnabled()) return;
    try {
      // TODO: await firebase.auth().signOut();
      console.log('[KHub.Auth] signOut — implement provider here.');
      _setUser(null);
    } catch (err) {
      console.error('[KHub.Auth] signOut error:', err);
      window.KHub?.ErrorBoundary?.show(err.message);
    }
  }

  /** Register a callback that fires whenever auth state changes. */
  function onAuthChange(callback) {
    if (typeof callback !== 'function') return;
    _listeners.push(callback);
    // Fire immediately with current state
    callback(_user);
    // TODO: also wire to provider's live listener, e.g.:
    // firebase.auth().onAuthStateChanged(u => { _setUser(u); });
  }

  function getUser()    { return _user; }
  function isSignedIn() { return !!_user; }

  // ── UI controls ───────────────────────────────────────────
  /**
   * Inject auth controls into a container element.
   * Shows: sign-in button (signed out) OR user chip + sign-out (signed in).
   * Usage: KHub.Auth.renderControls('#header-auth')
   */
  function renderControls(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    function render(user) {
      container.innerHTML = '';
      if (user) {
        // Signed-in chip
        const chip = document.createElement('div');
        chip.className = 'auth-chip';
        chip.setAttribute('role', 'status');
        chip.setAttribute('aria-label', `Signed in as ${user.email || user.displayName || 'user'}`);

        const avatar = document.createElement('span');
        avatar.className = 'auth-avatar';
        avatar.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
        avatar.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'auth-name';
        name.textContent = user.displayName || user.email || 'Signed in';

        const out = document.createElement('button');
        out.className = 'btn btn-sm btn-secondary';
        out.textContent = window.KHub?.I18n?.t('signOut') || 'Sign Out';
        out.addEventListener('click', signOut);

        chip.append(avatar, name, out);
        container.appendChild(chip);
      } else {
        // Sign-in button
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = window.KHub?.I18n?.t('signIn') || 'Sign In';
        btn.addEventListener('click', () => {
          // Show sign-in modal
          window.KHub?.Components?.Modal?.open({
            title:        window.KHub?.I18n?.t('signIn') || 'Sign In',
            body:         _buildSignInForm(),
            confirmLabel: window.KHub?.I18n?.t('signIn') || 'Sign In',
            cancelLabel:  window.KHub?.I18n?.t('cancel') || 'Cancel',
            onConfirm() {
              const email    = document.getElementById('auth-email')?.value;
              const password = document.getElementById('auth-password')?.value;
              if (email && password) signIn({ email, password });
            },
          });
        });
        container.appendChild(btn);
      }
    }

    onAuthChange(render);
  }

  function _buildSignInForm() {
    return `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="input-group">
          <label class="input-label" for="auth-email">
            ${window.KHub?.I18n?.t('email') || 'Email'}
          </label>
          <input id="auth-email" type="email" class="input-field"
                 autocomplete="email" placeholder="you@example.com" />
        </div>
        <div class="input-group">
          <label class="input-label" for="auth-password">
            ${window.KHub?.I18n?.t('password') || 'Password'}
          </label>
          <input id="auth-password" type="password" class="input-field"
                 autocomplete="current-password" />
        </div>
      </div>`;
  }

  // ── Internal helpers ──────────────────────────────────────
  function _setUser(user) {
    _user = user;
    _listeners.forEach(fn => { try { fn(user); } catch (e) { console.error(e); } });
    window.KHub?.emit?.('auth:change', user);
    window.KHub?.A11y?.announce(
      user
        ? (window.KHub?.I18n?.t('signIn') || 'Signed in')
        : (window.KHub?.I18n?.t('signOut') || 'Signed out')
    );
  }

  function _isEnabled() {
    if (!window.KHub?.Config?.features?.auth) {
      console.warn('[KHub.Auth] Auth is disabled. Set KHub.Config.features.auth = true.');
      return false;
    }
    return true;
  }

  window.KHub = window.KHub || {};
  window.KHub.Auth = { signIn, signOut, onAuthChange, getUser, isSignedIn, renderControls };
})();

