// OT pay-period total safeguards — regression tests for the "OFF day still counts OT" bug.
// A day marked OFF (block) must contribute ZERO overtime, adding time must clear an OFF,
// and both OT displays read the single getCurrentPeriodOT() source of truth.
const fs = require('fs');
const path = require('path');
const { makeApp, assert, approx, summary } = require('./harness');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// Exact reported dataset for pay period Nov 13 - Nov 26; Nov 26 is OFF but carries a
// legacy leftover 3.0 OT entry (the corruption that made the total read 33.0).
function dataset() {
  return {
    '2026-11-13': [{ type: 'ot', hours: 3.5 }],
    '2026-11-16': [{ type: 'ot', hours: 3.5 }], '2026-11-17': [{ type: 'ot', hours: 3.5 }],
    '2026-11-18': [{ type: 'ot', hours: 3.5 }], '2026-11-19': [{ type: 'ot', hours: 3.5 }],
    '2026-11-20': [{ type: 'ot', hours: 3.5 }],
    '2026-11-23': [{ type: 'ot', hours: 3.0 }], '2026-11-24': [{ type: 'ot', hours: 3.0 }],
    '2026-11-25': [{ type: 'ot', hours: 3.0 }],
    '2026-11-26': [{ type: 'block' }, { type: 'ot', hours: 3.0 }]
  };
}
function boot() {
  const { OT, document } = makeApp(SRC, { seedStorage: { 'tracker-v3-data': { version: 3, data: dataset() } } });
  OT.state.activePeriod = OT.getPayPeriod(OT.parseDateKey('2026-11-13'));
  return { OT, document };
}

console.log('== OT pay-period total (Nov 13 - Nov 26) ==');
let { OT, document } = boot();
assert('total is 30.0, not 33.0', approx(OT.getCurrentPeriodOT(), 30.0), OT.getCurrentPeriodOT());

const n26 = OT.getDateEntries('2026-11-26');
assert('OFF day healed to block-only (no leftover OT)', n26.length === 1 && n26[0].type === 'block');

// read-guard: even if a day is re-corrupted, an OFF day counts zero OT
OT.setDateEntries('2026-11-26', [{ type: 'block' }, { type: 'ot', hours: 3.0 }]);
assert('OFF day contributes zero OT even when corrupted', approx(OT.getCurrentPeriodOT(), 30.0), OT.getCurrentPeriodOT());

// write path: adding OT onto an OFF day clears the OFF (no coexistence)
OT.state.pickScope = 'month';
OT.state.addSelectedDays = ['2026-11-26'];
OT.state.addType = 'ot';
OT.state.addHours = '4';
document.getElementById('addHours').value = '4';
OT.savePickedDays();
const n26b = OT.getDateEntries('2026-11-26');
assert('adding OT to an OFF day removes the OFF', n26b.length === 1 && n26b[0].type === 'ot' && n26b[0].hours === 4);
assert('total updates to 34.0 after that add', approx(OT.getCurrentPeriodOT(), 34.0), OT.getCurrentPeriodOT());

// reverse: switching a day to OFF removes its OT from the total
OT.setDateEntries('2026-11-13', [{ type: 'block' }]);
assert('OT -> OFF drops that OT from total', approx(OT.getCurrentPeriodOT(), 30.5), OT.getCurrentPeriodOT());

summary();
