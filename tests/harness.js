// Boots the real app.js in a sandboxed VM with mocked DOM + localStorage.
// Usage: makeApp(appSource, { seedStorage }) -> returns window.OTInternals
const vm = require('vm');

function mockElement() {
  const el = {
    innerHTML: '', textContent: '', value: '', style: {},
    classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    appendChild(){}, removeChild(){}, click(){}, select(){}, focus(){},
  };
  return el;
}

function makeApp(source, opts) {
  opts = opts || {};
  const store = new Map();
  for (const [k, v] of Object.entries(opts.seedStorage || {})) store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const byId = {};
  const document = {
    getElementById: id => (byId[id] = byId[id] || mockElement()),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){},
    createElement: () => mockElement(),
    body: mockElement(),
    documentElement: mockElement(),
  };
  const window = { __OT_TEST__: true, addEventListener(){}, removeEventListener(){} };
  const sandbox = {
    window, document, localStorage,
    navigator: {},
    console,
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    Date, Math, JSON, parseFloat, parseInt, isNaN, isFinite, String, Number, Array, Object, Boolean, RegExp, Error,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'app.js' });
  if (!window.OTInternals) throw new Error('OTInternals not exposed');
  return { OT: window.OTInternals, storage: store, document, byId };
}

// For the baseline (main branch) source, inject a minimal test hook before the final })();
function injectLegacyHook(source) {
  const hook = `
  if (typeof window !== 'undefined' && window.__OT_TEST__) {
    window.OTInternals = {
      state: state, checkEntry: checkEntry, getStretches: getStretches,
      getOccasionsByQuarter: getOccasionsByQuarter, calcSickLeft: calcSickLeft,
      calcVacationLeft: calcVacationLeft, calcCompLeft: calcCompLeft,
      calcHolidayCompLeft: calcHolidayCompLeft, calcFamilySickDaysUsed: calcFamilySickDaysUsed,
      calcPLDaysUsed: calcPLDaysUsed, calcFmlaHoursUsed: calcFmlaHoursUsed,
      getDateEntries: getDateEntries, setDateEntries: setDateEntries, formatDateKey: formatDateKey, WD: WD
    };
  }
`;
  const idx = source.lastIndexOf('})();');
  if (idx === -1) throw new Error('IIFE close not found');
  return source.slice(0, idx) + hook + source.slice(idx);
}

let passed = 0, failed = 0; const failures = [];
function assert(label, cond, detail) {
  if (cond) { console.log('  PASS: ' + label); passed++; }
  else { console.error('  FAIL: ' + label + (detail !== undefined ? ' -- ' + detail : '')); failed++; failures.push(label); }
}
function approx(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }
function summary() {
  console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) { console.log('Failed: ' + failures.join(' | ')); process.exit(1); }
}
module.exports = { makeApp, injectLegacyHook, assert, approx, summary };
