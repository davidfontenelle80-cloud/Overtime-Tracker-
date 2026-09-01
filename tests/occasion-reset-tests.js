// Regression: sick-occasion quarters must reset every work year (Sept 1).
// Manual occasion toggles used to persist across work years, showing last
// year's occasions on the new year. Clock is frozen at 2026-07-15 -> the
// current work year starts Sept 1 2025 (key 2025).
const fs = require('fs');
const path = require('path');
const { makeApp, assert, summary } = require('./harness');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const SETTINGS_KEY = 'tracker-v3-settings';

function boot(settings) {
  return makeApp(SRC, { seedStorage: { [SETTINGS_KEY]: JSON.stringify(settings) } });
}

console.log('Occasion work-year reset tests (frozen clock 2026-07-15, work year key = 2025)');

// A) David's case: manual occasions from a PRIOR year (no year stamp) must clear on load.
(function () {
  const { OT, storage } = boot({ manualOccasions: [1, 1, 1, 1], manualOccasionNotes: ['a','b','c','d'] });
  const q = OT.getOccasionsByQuarter();
  assert('A stale prior-year manual occasions reset to 0 on load', JSON.stringify(q) === '[0,0,0,0]', JSON.stringify(q));
  assert('A settings.manualOccasions zeroed', JSON.stringify(OT.state.settings.manualOccasions) === '[0,0,0,0]');
  assert('A notes cleared', JSON.stringify(OT.state.settings.manualOccasionNotes) === '["","","",""]');
  assert('A year stamped to current work year 2025', OT.state.settings.manualOccasionYear === 2025);
  const persisted = JSON.parse(storage.get(SETTINGS_KEY));
  assert('A reset persisted to storage', persisted.manualOccasionYear === 2025 && JSON.stringify(persisted.manualOccasions) === '[0,0,0,0]');
})();

// B) Same work year: legitimate current-year manual occasions are PRESERVED.
(function () {
  const { OT } = boot({ manualOccasions: [1, 0, 1, 0], manualOccasionNotes: ['x','','y',''], manualOccasionYear: 2025 });
  const q = OT.getOccasionsByQuarter();
  assert('B same-year manual occasions preserved', JSON.stringify(q) === '[1,0,1,0]', JSON.stringify(q));
  assert('B notes preserved', OT.state.settings.manualOccasionNotes[0] === 'x' && OT.state.settings.manualOccasionNotes[2] === 'y');
})();

// C) Rollover across a NEW Sept 1: crossing into work year 2026 clears all quarters.
(function () {
  const { OT, storage } = boot({ manualOccasions: [1, 1, 1, 1], manualOccasionNotes: ['a','b','c','d'], manualOccasionYear: 2025 });
  // At load (clock 2025) they are preserved:
  assert('C preserved before rollover', JSON.stringify(OT.getOccasionsByQuarter()) === '[1,1,1,1]');
  // Simulate the app crossing into the next work year (Sept 1 2026):
  OT.ensureOccasionYear(new Date(2026, 8, 1));
  assert('C all quarters reset after Sept 1 2026', JSON.stringify(OT.state.settings.manualOccasions) === '[0,0,0,0]');
  assert('C year advanced to 2026', OT.state.settings.manualOccasionYear === 2026);
  const persisted = JSON.parse(storage.get(SETTINGS_KEY));
  assert('C rollover persisted', persisted.manualOccasionYear === 2026);
})();

// D) Fresh install (no settings): starts at zeros, stamped current year, no crash.
(function () {
  const { OT } = makeApp(SRC, {});
  assert('D fresh install occasions zero', JSON.stringify(OT.getOccasionsByQuarter()) === '[0,0,0,0]');
  assert('D fresh install stamped 2025', OT.state.settings.manualOccasionYear === 2025);
})();

// E) Each quarter boundary maps correctly (Sep-Nov=Q0 ... Jun-Aug=Q3) from the work-year start.
(function () {
  const { OT } = boot({ manualOccasionYear: 2025 });
  assert('E Sep -> Q0', OT.getQuarterIndex(new Date(2025, 8, 15)) === 0);
  assert('E Dec -> Q1', OT.getQuarterIndex(new Date(2025, 11, 15)) === 1);
  assert('E Mar -> Q2', OT.getQuarterIndex(new Date(2026, 2, 15)) === 2);
  assert('E Aug -> Q3', OT.getQuarterIndex(new Date(2026, 7, 15)) === 3);
  assert('E next Sep -> Q0 of next year', OT.getQuarterIndex(new Date(2026, 8, 1)) === 0);
})();

summary();
