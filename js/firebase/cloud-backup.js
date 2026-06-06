/**
 * cloud-backup.js — KHub Cloud Backup Module
 * Saves / restores localStorage data to Cloud Firestore.
 *
 * Requires: firebase-config.js (KHub.Firebase.db must be available)
 *
 * Usage from app.js:
 *   KHub.CloudBackup.save('ministry-tracker', ['ministry-tracker-v4'], prefixScan);
 *   KHub.CloudBackup.restore('ministry-tracker', ['ministry-tracker-v4'], () => location.reload());
 *   KHub.CloudBackup.autoSave('ministry-tracker', ['ministry-tracker-v4'], prefixScan);
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

  function docRef(appId) {
    return KHub.Firebase.db
      .collection('backups')
      .doc(appId)
      .collection('devices')
      .doc(getDeviceId());
  }

  function collectKeys(exactKeys, scanPrefix) {
    var result = {};
    exactKeys.forEach(function (k) {
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

  window.KHub.CloudBackup = {

    save: function (appId, exactKeys, scanPrefix) {
      if (!window.KHub || !KHub.Firebase || !KHub.Firebase.db) {
        return Promise.reject(new Error('Firebase not ready'));
      }
      var keys = collectKeys(exactKeys || [], scanPrefix);
      var payload = {
        appId: appId,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
        deviceId: getDeviceId(),
        keys: keys
      };
      return docRef(appId)
        .set(payload)
        .then(function () {
          var ts = new Date().toISOString();
          localStorage.setItem('khub-cloud-backup-' + appId, ts);
          return ts;
        });
    },

    restore: function (appId, exactKeys, scanPrefix, onSuccess) {
      if (!window.KHub || !KHub.Firebase || !KHub.Firebase.db) {
        return Promise.reject(new Error('Firebase not ready'));
      }
      return docRef(appId)
        .get()
        .then(function (snap) {
          if (!snap.exists) {
            return Promise.reject(new Error('no-backup'));
          }
          var data = snap.data();
          var savedKeys = data.keys || {};
          Object.keys(savedKeys).forEach(function (k) {
            localStorage.setItem(k, savedKeys[k]);
          });
          if (typeof onSuccess === 'function') onSuccess();
        });
    },

    lastSaved: function (appId) {
      return localStorage.getItem('khub-cloud-backup-' + appId);
    },

    autoSave: function (appId, exactKeys, scanPrefix) {
      if (!window.KHub || !KHub.Firebase || !KHub.Firebase.db) {
        return;
      }
      var saving = false;
      function doSave() {
        if (saving) return;
        saving = true;
        KHub.CloudBackup.save(appId, exactKeys, scanPrefix)
          .catch(function (e) { console.warn('[CloudBackup] autoSave failed:', e); })
          .then(function () { saving = false; }, function () { saving = false; });
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') doSave();
      });
      window.addEventListener('pagehide', function () { doSave(); });
    }

  };

})();
