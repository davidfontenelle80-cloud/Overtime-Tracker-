/**
 * firebase-config.js - KHub Firebase init.
 * Initializes Firebase and exposes KHub.Firebase (app + db + auth).
 */
(function () {
  'use strict';

  if (!window.KHub?.Config?.features?.firebase) {
    return;
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
    const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    window.KHub = window.KHub || {};
    window.KHub.Firebase = { app, db, auth };

    KHub.Config.log('[Firebase] initialized - project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('[KHub.Firebase] init failed:', err);
  }
})();