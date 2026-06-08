/**
 * cloud-backup.js - KHub Cloud Backup Module
 * Saves localStorage data to a Firebase Auth user-scoped Firestore backup.
 */
(function () {
  'use strict';

  window.KHub = window.KHub || {};

  function getDeviceId() {
    var id = localStorage.getItem('khub-device-id');
    if (!id) {
      id = 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('khub-device-id', id);
    }
    return id;
  }

  function auth() {
    return window.KHub && KHub.Firebase && KHub.Firebase.auth;
  }

  function currentUser() {
    var a = auth();
    return a ? a.currentUser : null;
  }

  function authRequiredError() {
    var err = new Error('auth-required');
    err.code = 'auth-required';
    return err;
  }

  function ensureReady(requireUser) {
    if (!window.KHub || !KHub.Firebase || !KHub.Firebase.db || !KHub.Firebase.auth) {
      return Promise.reject(new Error('Firebase not ready'));
    }
    if (requireUser !== false && !currentUser()) {
      return Promise.reject(authRequiredError());
    }
    return null;
  }

  function appRef(appId) {
    return KHub.Firebase.db.collection('backups').doc(appId);
  }

  function userRef(appId) {
    return appRef(appId).collection('users').doc(currentUser().uid);
  }

  function deviceRef(appId) {
    return userRef(appId).collection('devices').doc(getDeviceId());
  }

  function latestRef(appId) {
    return userRef(appId).collection('meta').doc('latest');
  }

  function markerKey(appId) {
    var user = currentUser();
    return 'khub-cloud-backup-' + appId + (user ? '-' + user.uid : '');
  }

  function collectKeys(exactKeys, scanPrefix) {
    var result = {};
    (exactKeys || []).forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) result[k] = v;
    });
    if (scanPrefix) {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith(scanPrefix)) result[k] = localStorage.getItem(k);
      }
    }
    return result;
  }

  function savedAtISO(data) {
    if (!data) return '';
    if (data.savedAtISO) return data.savedAtISO;
    if (data.savedAt && typeof data.savedAt.toDate === 'function') return data.savedAt.toDate().toISOString();
    return '';
  }

  function writeKeys(savedKeys) {
    Object.keys(savedKeys || {}).forEach(function (k) {
      localStorage.setItem(k, savedKeys[k]);
    });
  }

  function markSaved(appId, iso) {
    localStorage.setItem(markerKey(appId), iso || new Date().toISOString());
  }

  function localExactKeyIsNewer(data, exactKeys) {
    var remoteKeys = (data && data.keys) || {};
    for (var i = 0; i < (exactKeys || []).length; i++) {
      var key = exactKeys[i];
      var localRaw = localStorage.getItem(key);
      var remoteRaw = remoteKeys[key];
      if (!localRaw || !remoteRaw || localRaw === remoteRaw) continue;
      try {
        var localState = JSON.parse(localRaw);
        var remoteState = JSON.parse(remoteRaw);
        if (localState && remoteState && localState.updatedAt && remoteState.updatedAt) {
          if (Date.parse(localState.updatedAt) > Date.parse(remoteState.updatedAt)) return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function useGoogleRedirect() {
    var ua = (navigator && navigator.userAgent) || '';
    var standalone = false;
    try {
      standalone = !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
    } catch (e) {}
    return standalone || /iPhone|iPad|iPod|Android/i.test(ua);
  }

  function googleProvider() {
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  function finishGoogleRedirect() {
    var notReady = ensureReady(false);
    if (notReady) return notReady;
    if (!auth().getRedirectResult) return Promise.resolve(null);
    return auth().getRedirectResult().catch(function (e) {
      console.warn('[CloudAuth] Google redirect result failed:', e);
      return null;
    });
  }

  function getLatestSnapshot(appId) {
    return latestRef(appId).get().catch(function (e) {
      console.warn('[CloudBackup] latest read skipped:', e);
      return null;
    });
  }
  function authMessage(e) {
    var code = e && (e.code || e.message) || '';
    if (code.indexOf('auth/user-not-found') !== -1) return 'No account found for that email.';
    if (code.indexOf('auth/wrong-password') !== -1 || code.indexOf('auth/invalid-credential') !== -1) return 'Email or password was not correct. Try Sign in with your existing password, or tap Reset password.';
    if (code.indexOf('auth/email-already-in-use') !== -1) return 'That email already has an account. Tap Sign in instead of Create account.';
    if (code.indexOf('auth/weak-password') !== -1) return 'Use a password with at least 6 characters.';
    if (code.indexOf('auth/invalid-email') !== -1) return 'Enter a valid email address.';
    if (code.indexOf('auth/configuration-not-found') !== -1) return 'Cloud sign-in is not enabled yet. In Firebase Authentication, enable Email/Password sign-in.';
    if (code.indexOf('auth/requests-from-referer') !== -1) return 'This website is blocked by the Google API key restriction. Add https://davidfontenelle80-cloud.github.io/* to allowed websites.';
    if (code.indexOf('auth/unauthorized-domain') !== -1) return 'This website is not authorized for Google sign-in. Add davidfontenelle80-cloud.github.io in Firebase Authentication settings.';
    if (code.indexOf('auth/popup-blocked') !== -1) return 'The Google sign-in popup was blocked. Allow popups for this site and try again.';
    if (code.indexOf('auth/popup-closed-by-user') !== -1 || code.indexOf('auth/cancelled-popup-request') !== -1) return 'Google sign-in was cancelled. Try again when you are ready.';
    if (code.indexOf('auth/network-request-failed') !== -1) return 'Cloud sign-in could not reach Firebase. Check your connection and try again.';
    if (code.indexOf('auth/too-many-requests') !== -1) return 'Firebase temporarily blocked sign-in attempts. Wait a few minutes, then try again.';
    if (code.indexOf('auth-timeout') !== -1) return 'Cloud sign-in is taking too long. Check your connection and tap Sign in again.';
    if (code.indexOf('permission-denied') !== -1 || code.indexOf('Missing or insufficient permissions') !== -1) return 'Cloud backup is blocked by Firestore rules. Update rules to allow backups/{appId}/users/{yourUserId}.';
    return e && e.message ? e.message : 'Cloud account failed.';
  }

  function openAuthDialog(startMode) {
    startMode = startMode || 'signin';
    return new Promise(function (resolve, reject) {
      var old = document.getElementById('khubCloudAuthDialog');
      if (old) old.remove();

      var overlay = document.createElement('div');
      overlay.id = 'khubCloudAuthDialog';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;';
      overlay.innerHTML =
        '<div style="width:min(420px,100%);background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
          '<h3 id="khubCloudAuthTitle" style="margin:0 0 8px;font-size:18px;color:#111827;">Cloud account</h3>' +
          '<p style="margin:0 0 12px;color:#4b5563;font-size:13px;line-height:1.4;">Sign in with the same email and password on every device. Use Sign in if the email already exists; use Create account only the first time.</p>' +
          '<label style="display:block;font-size:13px;font-weight:700;margin:10px 0 6px;color:#374151;">Email</label>' +
          '<input id="khubCloudEmail" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" style="box-sizing:border-box;width:100%;padding:11px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#111827;">' +
          '<label id="khubCloudPasswordLabel" style="display:block;font-size:13px;font-weight:700;margin:10px 0 6px;color:#374151;">Password</label>' +
          '<input id="khubCloudPassword" type="password" autocomplete="new-password" style="box-sizing:border-box;width:100%;padding:11px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#111827;">' +
          '<div id="khubCloudAuthError" style="min-height:18px;margin:10px 0;color:#dc2626;font-size:13px;"></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px;">' +
            '<button id="khubCloudCancel" type="button" style="padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#111827;">Cancel</button>' +
            '<button id="khubCloudReset" type="button" style="padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#111827;">Reset password</button>' +
            '<button id="khubCloudCreate" type="button" style="padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#111827;">Create account</button>' +
            '<button id="khubCloudSignIn" type="button" style="padding:10px 12px;border-radius:10px;border:0;background:#2563eb;color:white;font-weight:700;">Sign in</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var emailEl = document.getElementById('khubCloudEmail');
      var passEl = document.getElementById('khubCloudPassword');
      var errEl = document.getElementById('khubCloudAuthError');
      setTimeout(function () {
        emailEl.value = '';
        passEl.value = '';
      }, 100);
      var close = function () { overlay.remove(); };
      var busy = function (on) {
        ['khubCloudSignIn', 'khubCloudCreate', 'khubCloudReset'].forEach(function (id) {
          var b = document.getElementById(id);
          if (b) b.disabled = on;
        });
      };
      var run = function (promiseFactory, successText, waitText) {
        var done = false;
        var timeoutId;
        errEl.style.color = '#4b5563';
        errEl.textContent = waitText || 'Signing in...';
        busy(true);
        timeoutId = setTimeout(function () {
          if (done) return;
          done = true;
          errEl.style.color = '#dc2626';
          errEl.textContent = authMessage({ code: 'auth-timeout' });
          busy(false);
        }, 15000);
        promiseFactory().then(function (result) {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          close();
          resolve(successText || result);
        }).catch(function (e) {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          errEl.style.color = '#dc2626';
          errEl.textContent = authMessage(e);
          busy(false);
        });
      };
      document.getElementById('khubCloudCancel').onclick = function () { close(); resolve(null); };

      document.getElementById('khubCloudSignIn').onclick = function () {
        run(function () { return window.KHub.CloudAuth.signIn(emailEl.value, passEl.value); }, 'signed-in', 'Signing in...');
      };
      document.getElementById('khubCloudCreate').onclick = function () {
        run(function () { return window.KHub.CloudAuth.signUp(emailEl.value, passEl.value); }, 'created', 'Creating account...');
      };
      document.getElementById('khubCloudReset').onclick = function () {
        if (!emailEl.value.trim()) { errEl.textContent = 'Enter your email first.'; return; }
        run(function () { return window.KHub.CloudAuth.resetPassword(emailEl.value); }, 'reset-sent', 'Sending reset email...');
      };
      overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(); resolve(null); } });
      emailEl.focus();
    });
  }


  window.KHub.CloudAuth = {
    currentUser: currentUser,
    onChange: function (cb) {
      var a = auth();
      if (!a) return function () {};
      return a.onAuthStateChanged(cb);
    },
    signIn: function (email, password) {
      var notReady = ensureReady(false);
      if (notReady) return notReady;
      return auth().signInWithEmailAndPassword(String(email || '').trim(), password);
    },
    signUp: function (email, password) {
      var notReady = ensureReady(false);
      if (notReady) return notReady;
      return auth().createUserWithEmailAndPassword(String(email || '').trim(), password);
    },
    signInWithGoogle: function () {
      var notReady = ensureReady(false);
      if (notReady) return notReady;
      var provider = googleProvider();
      if (useGoogleRedirect() && auth().signInWithRedirect) {
        return auth().signInWithRedirect(provider).then(function () { return 'redirect-started'; });
      }
      return auth().signInWithPopup(provider).catch(function (e) {
        if ((e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request')) && auth().signInWithRedirect) {
          return auth().signInWithRedirect(provider).then(function () { return 'redirect-started'; });
        }
        throw e;
      });
    },
    signOut: function () {
      var a = auth();
      return a ? a.signOut() : Promise.resolve();
    },
    resetPassword: function (email) {
      var notReady = ensureReady(false);
      if (notReady) return notReady;
      return auth().sendPasswordResetEmail(String(email || '').trim());
    },
    openDialog: openAuthDialog,
    finishGoogleRedirect: finishGoogleRedirect,
    authMessage: authMessage
  };

  window.KHub.CloudBackup = {
    save: function (appId, exactKeys, scanPrefix) {
      var notReady = ensureReady(true);
      if (notReady) return notReady;

      var user = currentUser();
      var iso = new Date().toISOString();
      var payload = {
        appId: appId,
        uid: user.uid,
        email: user.email || '',
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
        savedAtISO: iso,
        deviceId: getDeviceId(),
        keys: collectKeys(exactKeys, scanPrefix)
      };

      return deviceRef(appId).set(payload).then(function () {
        return latestRef(appId).set(payload);
      }).then(function () {
        markSaved(appId, iso);
        return iso;
      });
    },

    restore: function (appId, exactKeys, scanPrefix, onSuccess) {
      var notReady = ensureReady(true);
      if (notReady) return notReady;

      return getLatestSnapshot(appId).then(function (latestSnap) {
        if (latestSnap && latestSnap.exists) return latestSnap;
        return deviceRef(appId).get();
      }).then(function (snap) {
        if (!snap.exists) return Promise.reject(new Error('no-backup'));
        var data = snap.data() || {};
        writeKeys(data.keys);
        markSaved(appId, savedAtISO(data));
        if (typeof onSuccess === 'function') onSuccess(data);
        return data;
      });
    },

    restoreLatestIfNewer: function (appId, exactKeys, scanPrefix, onSuccess) {
      var notReady = ensureReady(true);
      if (notReady) {
        return notReady.catch(function (e) {
          if (e && e.code === 'auth-required') return false;
          throw e;
        });
      }

      return getLatestSnapshot(appId).then(function (snap) {
        if (!snap || !snap.exists) return false;
        var data = snap.data() || {};
        var remoteISO = savedAtISO(data);
        var localISO = localStorage.getItem(markerKey(appId));
        if (remoteISO && localISO && Date.parse(remoteISO) <= Date.parse(localISO)) return false;
        if (localExactKeyIsNewer(data, exactKeys)) return false;
        writeKeys(data.keys);
        markSaved(appId, remoteISO);
        if (typeof onSuccess === 'function') onSuccess(data);
        return true;
      }).catch(function (e) {
        console.warn('[CloudBackup] restoreLatestIfNewer failed:', e);
        return false;
      });
    },

    lastSaved: function (appId) {
      return localStorage.getItem(markerKey(appId));
    },

    isSignedIn: function () {
      return !!currentUser();
    },

    autoSave: function (appId, exactKeys, scanPrefix) {
      if (!window.KHub || !KHub.Firebase || !KHub.Firebase.db || !KHub.Firebase.auth) return;
      var saving = false;
      function doSave() {
        if (saving || !currentUser()) return;
        saving = true;
        KHub.CloudBackup.save(appId, exactKeys, scanPrefix)
          .catch(function (e) { console.warn('[CloudBackup] autoSave failed:', e); })
          .then(function () { saving = false; }, function () { saving = false; });
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') doSave();
      });
      window.addEventListener('pagehide', function () { doSave(); });
      return doSave;
    }
  };
})();
