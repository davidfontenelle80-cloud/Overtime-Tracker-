/**
 * perf.js — KHub Boilerplate
 * Lightweight performance check using the Navigation Timing API.
 *
 * Runs automatically on DOMContentLoaded and logs results.
 * In dev mode: prints a formatted table to the console.
 * In prod mode: silent unless a threshold is exceeded.
 *
 * Thresholds (WCAG / Core Web Vitals guidance):
 *   FCP  < 1800ms  (good), < 3000ms (needs improvement)
 *   LCP  < 2500ms  (good), < 4000ms (needs improvement)
 *   TTFB < 800ms   (good)
 *   DOM  < 1500ms  (good)
 *
 * Usage:
 *   KHub.Perf.report()          — log current metrics to console
 *   KHub.Perf.getMetrics()      — returns metrics object
 *   KHub.Perf.onSlowLoad(fn)    — register callback if LCP > threshold
 */
(function () {
  'use strict';

  const THRESHOLDS = {
    fcp:  { good: 1800, warn: 3000 },
    lcp:  { good: 2500, warn: 4000 },
    ttfb: { good:  800, warn: 1600 },
    dom:  { good: 1500, warn: 3000 },
  };

  let _metrics    = {};
  let _slowCbs    = [];
  let _observed   = false;

  // ── Collect Navigation Timing metrics ────────────────────
  function _collectTiming() {
    const nav = performance.getEntriesByType('navigation')[0];
    if (!nav) return;

    _metrics.ttfb   = Math.round(nav.responseStart - nav.requestStart);
    _metrics.dom    = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
    _metrics.load   = Math.round(nav.loadEventEnd - nav.startTime);
    _metrics.dns    = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
    _metrics.tcp    = Math.round(nav.connectEnd - nav.connectStart);
    _metrics.transfer = Math.round(nav.responseEnd - nav.responseStart);
  }

  // ── Collect Paint metrics (FCP) ───────────────────────────
  function _collectPaint() {
    performance.getEntriesByType('paint').forEach(entry => {
      if (entry.name === 'first-contentful-paint') {
        _metrics.fcp = Math.round(entry.startTime);
      }
    });
  }

  // ── Observe LCP via PerformanceObserver ──────────────────
  function _observeLCP() {
    if (!('PerformanceObserver' in window) || _observed) return;
    _observed = true;
    try {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last    = entries[entries.length - 1];
        _metrics.lcp  = Math.round(last.startTime);
        _checkThresholds();
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      KHub.Config.warn('LCP observer not supported:', e.message);
    }
  }

  // ── Check thresholds and call slow-load callbacks ─────────
  function _checkThresholds() {
    const slow = [];
    Object.entries(THRESHOLDS).forEach(([key, { good, warn }]) => {
      const val = _metrics[key];
      if (val === undefined) return;
      if (val > warn)       slow.push({ key, val, level: 'warn' });
      else if (val > good)  slow.push({ key, val, level: 'needs-improvement' });
    });
    if (slow.length) {
      _slowCbs.forEach(fn => { try { fn(slow, _metrics); } catch (e) { console.error(e); } });
    }
  }

  // ── Public API ────────────────────────────────────────────
  function getMetrics() { return { ..._metrics }; }

  function report() {
    _collectTiming();
    _collectPaint();

    const pad  = (s, n) => String(s).padStart(n);
    const flag = (key, val) => {
      if (val === undefined) return '—';
      const t = THRESHOLDS[key];
      if (!t) return `${val}ms`;
      if (val <= t.good) return `✅ ${val}ms`;
      if (val <= t.warn) return `⚠️  ${val}ms`;
      return `🚨 ${val}ms`;
    };

    console.group('[KHub.Perf] Performance report');
    console.log(`  TTFB       ${flag('ttfb', _metrics.ttfb)}`);
    console.log(`  FCP        ${flag('fcp',  _metrics.fcp)}`);
    console.log(`  LCP        ${flag('lcp',  _metrics.lcp)}`);
    console.log(`  DOM ready  ${flag('dom',  _metrics.dom)}`);
    console.log(`  Full load  ${_metrics.load !== undefined ? _metrics.load + 'ms' : '—'}`);
    console.log(`  DNS        ${_metrics.dns  !== undefined ? _metrics.dns  + 'ms' : '—'}`);
    console.log(`  TCP        ${_metrics.tcp  !== undefined ? _metrics.tcp  + 'ms' : '—'}`);
    console.groupEnd();
  }

  function onSlowLoad(fn) {
    if (typeof fn === 'function') _slowCbs.push(fn);
  }

  // ── Auto-run on load ──────────────────────────────────────
  window.addEventListener('load', () => {
    // Wait one frame so all timing entries are flushed
    requestAnimationFrame(() => {
      _collectTiming();
      _collectPaint();
      _observeLCP();
      _checkThresholds();

      if (window.KHub?.Config?.isDev) report();
    });
  });

  window.KHub = window.KHub || {};
  window.KHub.Perf = { getMetrics, report, onSlowLoad };
})();

