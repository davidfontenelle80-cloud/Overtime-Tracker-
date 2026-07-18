(function () {
  'use strict';

  function showRecovery(message) {
    if (document.getElementById('overtime-recovery')) return;
    var wrap = document.createElement('div');
    wrap.id = 'overtime-recovery';
    wrap.setAttribute('role', 'alert');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b0d12;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;';
    wrap.innerHTML = '<div style="max-width:420px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">Overtime Tracker needs a refresh</h1><p style="line-height:1.5;color:#cbd5e1">' + (message || 'A required app file did not load.') + '</p><button id="overtime-repair-btn" style="margin-top:16px;padding:14px 18px;border:0;border-radius:12px;background:#60a5fa;color:#07111f;font-weight:800;font-size:16px">Repair and reopen</button></div>';
    document.body.appendChild(wrap);
    document.getElementById('overtime-repair-btn').addEventListener('click', repairAndReload);
  }

  function repairAndReload() {
    var work = [];
    if ('caches' in window) {
      work.push(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          return key.indexOf('overtime-tracker-') === 0;
        }).map(function (key) { return caches.delete(key); }));
      }));
    }
    if ('serviceWorker' in navigator) {
      work.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.filter(function (reg) {
          return reg.scope.indexOf('/Overtime-Tracker-/') !== -1;
        }).map(function (reg) { return reg.unregister(); }));
      }));
    }
    Promise.all(work).finally(function () { location.reload(); });
  }

  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      showRecovery('A required JavaScript or style file could not be loaded.');
    }
  }, true);

  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () {
        showRecovery('The app update service could not start.');
      });
    }

    setTimeout(function () {
      var content = document.getElementById('content');
      var nav = document.getElementById('nav');
      if ((!content || !content.children.length) && (!nav || !nav.children.length)) {
        showRecovery('The app loaded, but its controls did not start.');
      }
    }, 3500);
  });
})();
