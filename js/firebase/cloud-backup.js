/**
 * cloud-backup.js — KHub Cloud Backup Module
 * Saves / restores localStorage data to Cloud Firestore.
 *
 * Requires: firebase-config.js (KHub.Firebase.db must be available)
 *
 * Usage from app.js:
 *   KHub.CloudBackup.save('ministry-tracker', ['ministry-tracker-v4'], prefixScan);
 *   KHub.CloudBackup.restore('ministry-tracker', ['ministry-tracker-v4'], () => location.reload());
 */
(function () {
  'use strict';

  window.KHub = window.KHub || {};

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getDeviceId() {
    let id = localStorage.getItem('khub-device-id');
    if (!id) {
      id = 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem('khub-device-id', id);
    }
    return id;
  }

  function docRef(appId) {
    return KHub.Firebase.db
      .collection('backups')
      .doc(appId)
      .collection('devices')
      .doc(getDeviceId());
  }

  function collectKeys(exactKeys, scanPrefix) {
    const result = {};
    exactKeys.forEach(function (k) {
      const v = localStorage.getItem(k);
      if (v !== null) result[k] = v;
    });
    if (scanPrefix) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(scanPrefix)) result[k] = localStorage.getItem(k);
      }
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.KHub.CloudBackup = {

    /**
     * save(appId, exactKeys, scanPrefix)
     *  exactKeys  – array of exact localStorage keys to back up
     *  scanPrefix – optional string; also backs up any key starting with this
     */
    save: function (appId, exactKeys, scanPrefix) {
      if (!window.KHub?.Firebase?.db) {
        KHub.Config.warn('[CloudBackup] Firebase not ready');
        return Promise.reject(new Error('Firebase not ready'));
      }
      const keys = collectKeys(exactKeys, scanPrefix);
      const payload = {
        appId:     appId,
        savedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        deviceId:  getDeviceId(),
        keys:      keys,
      };
      return docRef(appId)
        .set(payload)
        .then(function () {
          const ts = new Date().toISOString();
          localStorage.setItem('khub-cloud-backup-' + appId, ts);
          KHub.Config.log('[CloudBackup] saved', appId);
          return ts;
        });
    },

    /**
     * restore(appId, exactKeys, scanPrefix, onSuccess)
     *  Fetches the latest backup for this device and restores keys to localStorage.
     *  Calls onSuccess() after restore (usually location.reload()).
     */
    restore: function (appId, exactKeys, scanPrefix, onSuccess) {
      if (!window.KHub?.Firebase?.db) {
        return Promise.reject(new Error('Firebase not ready'));
      }
      return docRef(appId)
        .get()
        .then(function (snap) {
          if (!snap.exists) {
            return Promise.reject(new Error('no-backup'));
          }
          const data = snap.data();
          const savedKeys = data.keys || {};
          Object.keys(savedKeys).forEach(function (k) {
            localStorage.setItem(k, savedKeys[k]);
          });
          KHub.Config.log('[CloudBackup] restored', appId, Object.keys(savedKeys).length, 'keys');
          if (typeof onSuccess === 'function') onSuccess();
        });
    },

    /** Returns ISO string of last cloud save for this app, or null. */
    lastSaved: function (appId) {
      return localStorage.getItem('khub-cloud-backup-' + appId);
    },

    /**
     * autoSave(appId, exactKeys, scanPrefix)
     * 