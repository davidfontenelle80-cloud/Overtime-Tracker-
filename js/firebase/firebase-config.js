/**
 * firebase-config.js — Ministry Tracker
 * Initializes Firebase and exposes KHub.Firebase (app + db).
 *
 * Activated by: KHub.Config.features.firebase = true  (js/config.js)
 * Load order in index.html:
 *   1. Firebase SDK compat scripts (CDN)
 *   2. js/config.js
 *   3. THIS FILE
 *   4. ...rest of app scripts
 */
(function () {
  'use strict';

  if (!window.KHub?.Config?.features?.firebase) {
    return; // feature flag off — skip silently
  }

  const firebaseConfig = {
    apiKey:            "AIzaSyAUiVMxG1JbtpaW3KKmYSsTheMP473uTbQ",
    authDomain:        "khub-apps.firebaseapp.com",
    projectId:         "khub-apps",
    storageBucket:     "khub-apps.firebasestorage.app",
    messagingSenderId: "969605091721",
    appId:             "1:969605091721:web:4068564af7bc0dc56c1158",
    measurementId:     "G-613M7EM3ZZ",
  };

  try {
    const app = firebase.initializeApp(firebaseConfig);
    const db  = firebase.firestore();

    window.KHub = window.KHub || {};
    window.KHub.Firebase = { app, db };

    KHub.Config.log('[Firebase] initialized — project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('[KHub.Firebase] init failed:', err);
  }
})();
