const fs = require('fs');
const { execSync } = require('child_process');
const { makeApp, injectLegacyHook, assert, approx, summary } = require('./harness');

const path = require('path');
const REPO = path.join(__dirname, '..');
const NEW_SRC = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
const OLD_SRC = injectLegacyHook(execSync('git -C "' + REPO + '" show main:js/app.js', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));

// ── Legacy dataset (what a live device would already have) ──
// Today in sandbox: 2026-07 (work year Sep 2025 - Aug 2026, Q3 = Jun-Aug)
const legacySettings = {
  vacationRemaining: 100, sickRemaining: 200, compRemaining: 40, hcompRemaining: 20,
  vacationMonthlyAccrual: 0, sickMonthlyAccrual: 0,
  balanceAsOfDate: '2026-01-01', accrualEffectiveDate: '2026-01-01',
  familySickUsedDays: 0, plUsedDays: 0,
  manualOccasions: [0, 0, 0, 0], manualOccasionNotes: ['', '', '', ''],
  workdayHours: 7.5, snapshotDate: '', fmlaEnabled: true, fmlaStartDate: '',
  fmlaSnapshotHours: 0,
  fmlaPeriods: [{ id: 'fp1', label: 'Period 1', startDate: '2026-06-01', snapshotHours: 0 }],
  userName: 'David'
  // NOTE: no funeralEvents key -- simulates pre-upgrade settings
};
const legacyData = {
  '2026-07-01': { type: 'sick', hours: 7.5 },              // Wed
  '2026-07-02': { type: 'fsick', hours: 7.5 },             // Thu (bridges into one stretch with 7/1)
  '2026-06-10': { type: 'fmla', hours: 7.5, fmlaReason: 'self', fmlaCharge: 'vac', sickCharge: 7.5, familySickCharge: 0, vacCharge: 0, unpaidCharge: 0 },
  '2026-06-15': [{ type: 'ot', hours: 4 }, { type: 'vac', hours: 3.5 }],  // multi-entry day
  '2026-03-05': { type: 'sick', hours: 7.5 }               // Q2 occurrence
};
const seed = {
  'tracker-v3-data': { version: 3, data: legacyData },
  'tracker-v3-settings': legacySettings,
  'tracker-v3-meta': { lastBackup: '', lastSaved: '', backupRevision: 0, lastAccrualKey: '2026-07' }
};
function freshSeed() { return JSON.parse(JSON.stringify(seed)); }

// Expected by hand: sickLeft = 200 - 7.5(sick 7/1) - 7.5(fsick 7/2) - 7.5(fmla sickCharge) - 7.5(sick 3/5) = 170
// vacLeft = 100 - 3.5 = 96.5 ; famSickDays = 1 ; occasions: Q2=1 (3/5), Q3=1 (7/1+7/2 one stretch)

console.log('\n== 1-4, 20: Legacy data loads identically (parity vs main) ==');
const oldApp = makeApp(OLD_SRC, { seedStorage: freshSeed() }).OT;
const newApp = makeApp(NEW_SRC, { seedStorage: freshSeed() }).OT;

assert('T1 legacy sick entry loads (new)', newApp.getDateEntries('2026-07-01')[0].type === 'sick');
assert('T4a sick balance unchanged after upgrade (170 expected)', approx(newApp.calcSickLeft(0), 170), newApp.calcSickLeft(0));
assert('T4b sick balance parity old vs new', approx(oldApp.calcSickLeft(0), newApp.calcSickLeft(0)), oldApp.calcSickLeft(0) + ' vs ' + newApp.calcSickLeft(0));
assert('T4c vacation parity (96.5)', approx(newApp.calcVacationLeft(0), 96.5) && approx(oldApp.calcVacationLeft(0), newApp.calcVacationLeft(0)));
assert('T4d comp/hcomp parity', approx(oldApp.calcCompLeft(0), newApp.calcCompLeft(0)) && approx(oldApp.calcHolidayCompLeft(0), newApp.calcHolidayCompLeft(0)));
assert('T2a fsick loads and deducts from sick bank', approx(newApp.calcFamilySickDaysUsed(0), 1), newApp.calcFamilySickDaysUsed(0));
assert('T2b family sick parity', approx(oldApp.calcFamilySickDaysUsed(0), newApp.calcFamilySickDaysUsed(0)));
const oldOcc = oldApp.getOccasionsByQuarter(), newOcc = newApp.getOccasionsByQuarter();
assert('T1b occurrences: Q2=1, Q3=1 (fsick bridged, counts once)', newOcc[2] === 1 && newOcc[3] === 1, JSON.stringify(newOcc));
assert('T4e occurrence parity old vs new', JSON.stringify(oldOcc) === JSON.stringify(newOcc), JSON.stringify(oldOcc) + ' vs ' + JSON.stringify(newOcc));
assert('T3 FMLA loads with allocations (7.5 used)', approx(newApp.calcFmlaHoursUsed(), 7.5) && approx(oldApp.calcFmlaHoursUsed(), 7.5));
assert('T15 old settings without funeralEvents default safely to []', Array.isArray(newApp.state.settings.funeralEvents) && newApp.state.settings.funeralEvents.length === 0);
assert('T14 multi-entry day intact (ot+vac both present)', newApp.getDateEntries('2026-06-15').length === 2);

console.log('\n== 5: Adding Regular Sick deducts and creates occurrence ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  const chk = OT.checkEntry('sick', 7.5, '2026-07-20', null); // Mon, isolated -> 2nd Q3 occasion
  assert('T5a sick checkEntry ok (bank has room)', chk.ok);
  assert('T5b warns about 2nd occasion in quarter', chk.warns.some(w => /occasion/.test(w)), JSON.stringify(chk.warns));
  OT.setDateEntries('2026-07-20', [{ type: 'sick', hours: 7.5 }]);
  assert('T5c sick bank deducts (162.5)', approx(OT.calcSickLeft(0), 162.5), OT.calcSickLeft(0));
  assert('T5d occurrence created (Q3=2)', OT.getOccasionsByQuarter()[3] === 2);
}

console.log('\n== 6-7: Family Sick -- no occurrence, 10-day cap ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  OT.setDateEntries('2026-07-21', [{ type: 'fsick', hours: 7.5 }]); // isolated Tue
  assert('T6a fsick deducts sick bank (162.5)', approx(OT.calcSickLeft(0), 162.5));
  assert('T6b no new occurrence (Q3 still 1)', OT.getOccasionsByQuarter()[3] === 1, JSON.stringify(OT.getOccasionsByQuarter()));
  // Cap: already 2 fsick days this cal year after the add; snapshot 7 more = 9 used
  OT.state.settings.familySickUsedDays = 7; // 7 snapshot + 2 logged = 9 used
  const chkOk = OT.checkEntry('fsick', 7.5, '2026-07-22', null);   // -> exactly 10, allowed
  assert('T7a 10th family sick day allowed', chkOk.ok, JSON.stringify(chkOk.blocks));
  const chkBlock = OT.checkEntry('fsick', 15, '2026-07-22', null); // -> 12 days, blocked
  assert('T7b beyond 10-day cap blocked', !chkBlock.ok && chkBlock.blocks.some(b => /10-day/.test(b)), JSON.stringify(chkBlock.blocks));
}

console.log('\n== 8-9, 12: Immediate funeral -- 3 days per death, per-event, no occurrence ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  OT.state.settings.funeralEvents = [{ id: 'fe1', label: 'Grandmother' }, { id: 'fe2', label: 'Uncle' }];
  const day = h => ({ type: 'sfuneralImmediate', hours: h, eventId: 'fe1', eventLabel: 'Grandmother' });
  OT.setDateEntries('2026-07-20', [day(7.5)]);
  OT.setDateEntries('2026-07-21', [day(7.5)]);
  const chk3 = OT.checkEntry('sfuneralImmediate', 7.5, '2026-07-22', { eventId: 'fe1' });
  assert('T8a 3rd day for same death allowed', chk3.ok, JSON.stringify(chk3.blocks));
  OT.setDateEntries('2026-07-22', [day(7.5)]);
  const chk4 = OT.checkEntry('sfuneralImmediate', 7.5, '2026-07-23', { eventId: 'fe1' });
  assert('T8b 4th day for same death blocked', !chk4.ok && chk4.blocks.some(b => /funeral event/.test(b)), JSON.stringify(chk4.blocks));
  const chkE2 = OT.checkEntry('sfuneralImmediate', 22.5, '2026-07-27', { eventId: 'fe2' });
  assert('T9 second death has its own fresh 3-day allowance', chkE2.ok, JSON.stringify(chkE2.blocks));
  assert('T8c sick bank deducted by funeral (170-22.5=147.5)', approx(OT.calcSickLeft(0), 147.5), OT.calcSickLeft(0));
  assert('T12a immediate funeral creates no occurrence (Q3 still 1)', OT.getOccasionsByQuarter()[3] === 1, JSON.stringify(OT.getOccasionsByQuarter()));
  const noEvent = OT.checkEntry('sfuneralImmediate', 7.5, '2026-07-28', { eventId: '' });
  assert('T8d missing event blocked (limit must be trackable)', !noEvent.ok);
  assert('T18a per-event days at WD 7.5 (3.0)', approx(OT.calcFuneralImmediateDaysUsed('fe1', 0), 3));
  OT.state.settings.workdayHours = 8; // workday change recalcs day-based limits
  assert('T18b per-event days recalc at WD 8 (22.5/8=2.8125)', approx(OT.calcFuneralImmediateDaysUsed('fe1', 0), 2.8125), OT.calcFuneralImmediateDaysUsed('fe1', 0));
  OT.state.settings.workdayHours = 7.5;
  // T17: delete a funeral day -> allowance restored
  OT.setDateEntries('2026-07-22', []);
  assert('T17 deleting funeral entry restores allowance (2.0 used)', approx(OT.calcFuneralImmediateDaysUsed('fe1', 0), 2));
}

console.log('\n== 10-12: Non-immediate funeral -- 3 days/calendar year, Jan 1 reset, no occurrence ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  const day = h => ({ type: 'sfuneralNonImmediate', hours: h });
  OT.setDateEntries('2026-07-20', [day(7.5)]);
  OT.setDateEntries('2026-07-21', [day(7.5)]);
  const chk3 = OT.checkEntry('sfuneralNonImmediate', 7.5, '2026-07-22', null);
  assert('T10a 3rd non-imm day this year allowed', chk3.ok, JSON.stringify(chk3.blocks));
  OT.setDateEntries('2026-07-22', [day(7.5)]);
  const chk4 = OT.checkEntry('sfuneralNonImmediate', 7.5, '2026-07-23', null);
  assert('T10b 4th non-imm day this year blocked', !chk4.ok && chk4.blocks.some(b => /calendar year/.test(b)), JSON.stringify(chk4.blocks));
  assert('T12b non-imm funeral creates no occurrence', OT.getOccasionsByQuarter()[3] === 1);
  assert('T10c non-imm days independent of immediate cap', approx(OT.calcFuneralNonImmediateDaysUsed(0), 3));
}
{
  // Jan 1 reset: prior-year usage does not count (Dec 2025 is prior cal year but SAME work year)
  const s = freshSeed();
  s['tracker-v3-data'].data['2025-12-10'] = { type: 'sfuneralNonImmediate', hours: 7.5 };
  s['tracker-v3-data'].data['2025-12-11'] = { type: 'sfuneralNonImmediate', hours: 7.5 };
  s['tracker-v3-data'].data['2025-12-12'] = { type: 'sfuneralNonImmediate', hours: 7.5 };
  const { OT } = makeApp(NEW_SRC, { seedStorage: s });
  assert('T11 non-imm allowance resets Jan 1 (0 used in 2026)', approx(OT.calcFuneralNonImmediateDaysUsed(0), 0), OT.calcFuneralNonImmediateDaysUsed(0));
  const chk = OT.checkEntry('sfuneralNonImmediate', 22.5, '2026-07-20', null);
  assert('T11b full 3 days available in new year', chk.ok, JSON.stringify(chk.blocks));
}

console.log('\n== 13: FMLA creates no occurrence ==');
{
  const s = freshSeed();
  s['tracker-v3-data'].data = { '2026-07-06': { type: 'fmla', hours: 7.5, fmlaReason: 'self', sickCharge: 7.5, familySickCharge: 0, vacCharge: 0, unpaidCharge: 0 } };
  const { OT } = makeApp(NEW_SRC, { seedStorage: s });
  assert('T13 FMLA-only data -> zero occurrences', OT.getOccasionsByQuarter().every(c => c === 0), JSON.stringify(OT.getOccasionsByQuarter()));
}

console.log('\n== 12c: Occurrence bridging documented behavior ==');
{
  // sick Mon, fsick Tue, sick Wed -> ONE stretch (fsick bridges; existing behavior preserved)
  const s = freshSeed();
  s['tracker-v3-data'].data = {
    '2026-07-06': { type: 'sick', hours: 7.5 },
    '2026-07-07': { type: 'fsick', hours: 7.5 },
    '2026-07-08': { type: 'sick', hours: 7.5 }
  };
  const a = makeApp(NEW_SRC, { seedStorage: s }).OT;
  const b = makeApp(OLD_SRC, { seedStorage: JSON.parse(JSON.stringify(s)) }).OT;
  assert('T12c fsick still bridges sick stretches (1 occurrence, parity with main)',
    a.getOccasionsByQuarter()[3] === 1 && b.getOccasionsByQuarter()[3] === 1,
    JSON.stringify(a.getOccasionsByQuarter()) + ' vs ' + JSON.stringify(b.getOccasionsByQuarter()));
  // sick Mon, funeral Tue, sick Wed -> TWO stretches (funeral does NOT bridge -- new, documented)
  const s2 = freshSeed();
  s2['tracker-v3-data'].data = {
    '2026-07-06': { type: 'sick', hours: 7.5 },
    '2026-07-07': { type: 'sfuneralImmediate', hours: 7.5, eventId: 'fe1', eventLabel: 'X' },
    '2026-07-08': { type: 'sick', hours: 7.5 }
  };
  const c = makeApp(NEW_SRC, { seedStorage: s2 }).OT;
  assert('T12d funeral does not bridge: sick-funeral-sick = 2 occurrences', c.getOccasionsByQuarter()[3] === 2, JSON.stringify(c.getOccasionsByQuarter()));
}

console.log('\n== 15-16: Backup compatibility ==');
{
  // Old-format backup (no funeral fields anywhere, single-entry objects)
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  assert('T15b import-shaped old data yields correct balances (170)', approx(OT.calcSickLeft(0), 170));
  // New export payload shape { version, data, settings } roundtrip with funeral data
  OT.state.settings.funeralEvents = [{ id: 'fe1', label: 'Grandmother' }];
  OT.setDateEntries('2026-07-20', [{ type: 'sfuneralImmediate', hours: 7.5, eventId: 'fe1', eventLabel: 'Grandmother' }]);
  const payload = { version: 3, exportedAt: new Date().toISOString(), data: OT.state.state ? OT.state.state.data : OT.state.data, settings: OT.state.settings };
  const reseed = {
    'tracker-v3-data': { version: 3, data: payload.data },
    'tracker-v3-settings': payload.settings,
    'tracker-v3-meta': { lastBackup: '', lastSaved: '', backupRevision: 0, lastAccrualKey: '2026-07' }
  };
  const OT2 = makeApp(NEW_SRC, { seedStorage: reseed }).OT;
  assert('T16a export/restore retains funeral entry + event id', OT2.getDateEntries('2026-07-20')[0].eventId === 'fe1');
  assert('T16b restored funeral usage correct (1 day)', approx(OT2.calcFuneralImmediateDaysUsed('fe1', 0), 1));
  assert('T16c restored funeral events list intact', OT2.getFuneralEvents().length === 1 && OT2.getFuneralEvents()[0].label === 'Grandmother');
  assert('T16d restored balances reflect funeral deduction (162.5)', approx(OT2.calcSickLeft(0), 162.5), OT2.calcSickLeft(0));
}

console.log('\n== 19: Date-range total cap enforcement (checkEntry gets total hours) ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  // 4-day range of non-imm funeral at 7.5/day = 30 hrs = 4 days > 3-day cap -> blocked
  const chk = OT.checkEntry('sfuneralNonImmediate', 30, '2026-07-20', null);
  assert('T19a 4-day range blocked by annual cap', !chk.ok, JSON.stringify(chk.blocks));
  // 3-day range = 22.5 hrs allowed
  const chkOk = OT.checkEntry('sfuneralNonImmediate', 22.5, '2026-07-20', null);
  assert('T19b 3-day range allowed', chkOk.ok, JSON.stringify(chkOk.blocks));
  // fsick 11-day range blocked
  const chkFs = OT.checkEntry('fsick', 7.5 * 10, '2026-07-20', null);
  assert('T19c fsick range beyond remaining cap blocked', !chkFs.ok, JSON.stringify(chkFs.blocks));
}

console.log('\n== Config helpers (rules centralized) ==');
{
  const { OT } = makeApp(NEW_SRC, { seedStorage: freshSeed() });
  assert('C1 countsAsOccurrence: only sick', OT.countsAsOccurrence('sick') && !OT.countsAsOccurrence('fsick') && !OT.countsAsOccurrence('sfuneralImmediate') && !OT.countsAsOccurrence('sfuneralNonImmediate') && !OT.countsAsOccurrence('fmla'));
  assert('C2 usesSickBank: sick, fsick, both funerals; not fmla-direct', OT.usesSickBank('sick') && OT.usesSickBank('fsick') && OT.usesSickBank('sfuneralImmediate') && OT.usesSickBank('sfuneralNonImmediate') && !OT.usesSickBank('fmla'));
  assert('C3 bridging: sick+fsick yes, funerals+fmla no', OT.canBridgeSickStretch('sick') && OT.canBridgeSickStretch('fsick') && !OT.canBridgeSickStretch('sfuneralImmediate') && !OT.canBridgeSickStretch('sfuneralNonImmediate') && !OT.canBridgeSickStretch('fmla'));
  assert('C4 TYPES has new funeral entries', OT.TYPES.sfuneralImmediate && OT.TYPES.sfuneralNonImmediate);
  assert('C5 isSickLeaveType covers the family', ['sick','fsick','sfuneralImmediate','sfuneralNonImmediate','fmla'].every(t => OT.isSickLeaveType(t)) && !OT.isSickLeaveType('ot') && !OT.isSickLeaveType('vac'));
}

summary();
