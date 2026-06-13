/**
 * app.js — Overtime Tracker
 * UConn Facilities OT equalization tracker.
 */

(function() {
  'use strict';

  var STORAGE_KEY = 'tracker-v3-data';
  var THEME_KEY = 'tracker-v3-theme';
  var SETTINGS_KEY = 'tracker-v3-settings';
  var META_KEY = 'tracker-v3-meta';
  var START_DATE = new Date(2026, 4, 15);
  var MS_PER_DAY = 86400000;
  var WORK_YEAR_START_MONTH = 8; // September
  var FAMILY_SICK_CAP_DAYS = 10;
  var PL_CAP_DAYS = 3;
  var MAX_CONSEC_WORKDAYS = 5;

  var state = {
    theme: 'dark',
    data: {},
    settings: {
      vacationRemaining: 0,
      sickRemaining: 0,
      compRemaining: 0,
      hcompRemaining: 0,
      vacationMonthlyAccrual: 0,
      sickMonthlyAccrual: 0,
      balanceAsOfDate: '',
      accrualEffectiveDate: '',
      familySickUsedDays: 0,
      plUsedDays: 0,
      manualOccasions: [0, 0, 0, 0],
      manualOccasionNotes: ['', '', '', ''],
      workdayHours: 7.5,
      snapshotDate: '',
      fmlaEnabled: false,
      fmlaStartDate: '',
      fmlaSnapshotHours: 0,
      fmlaPeriods: [],
      userName: 'David'
    },
    meta: { lastBackup: '', lastSaved: '', backupRevision: 0, lastAccrualKey: '' },
    tab: 'home',
    calMonth: new Date(),
    activePeriod: 0,
    selectedDate: null,
    editType: 'ot',
    editHours: '0',
    editFmlaReason: 'self',
    editFmlaCharge: 'vac',
    addMode: 'single',
    addDateStart: '',
    addDateEnd: '',
    addType: 'ot',
    addHours: '0',
    addFmlaReason: 'self',
    addFmlaCharge: 'vac',
    previewMode: 'month',
    previewMonth: new Date(),
    previewPeriod: 0,
    logFilter: 'all',
    backupOpen: false,
    snapshotUnit: 'days',
    balanceUnit: 'hours',
    confirmCb: null,
    undoAction: null
  };

  try { state.theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { var p = JSON.parse(saved); if (p && p.data) state.data = p.data; }
  } catch (e) {}
  try {
    var ss = localStorage.getItem(SETTINGS_KEY);
    if (ss) {
      var sp = JSON.parse(ss);
      for (var k in sp) if (sp[k] !== undefined) state.settings[k] = sp[k];
      if (!Array.isArray(state.settings.manualOccasions) || state.settings.manualOccasions.length !== 4) state.settings.manualOccasions = [0,0,0,0];
      if (!Array.isArray(state.settings.manualOccasionNotes) || state.settings.manualOccasionNotes.length !== 4) state.settings.manualOccasionNotes = ['','','',''];
      if (!Array.isArray(state.settings.fmlaPeriods)) state.settings.fmlaPeriods = [];
      if (state.settings.fmlaStartDate && state.settings.fmlaPeriods.length === 0) {
        state.settings.fmlaPeriods = [{ id: 'fp1', label: 'Period 1', startDate: state.settings.fmlaStartDate, snapshotHours: state.settings.fmlaSnapshotHours || 0 }];
      }
    }
  } catch (e) {}
  if (!state.settings.balanceAsOfDate) state.settings.balanceAsOfDate = formatDateKey(new Date());
  if (!state.settings.accrualEffectiveDate) state.settings.accrualEffectiveDate = state.settings.balanceAsOfDate;
  state.settings.compRemaining = parseFloat(state.settings.compRemaining) || 0;
  state.settings.hcompRemaining = parseFloat(state.settings.hcompRemaining) || 0;
  state.settings.vacationMonthlyAccrual = parseFloat(state.settings.vacationMonthlyAccrual) || 0;
  state.settings.sickMonthlyAccrual = parseFloat(state.settings.sickMonthlyAccrual) || 0;
  try {
    var mm = localStorage.getItem(META_KEY);
    if (mm) state.meta = JSON.parse(mm);
  } catch (e) {}
  state.activePeriod = getPayPeriod(new Date());
  state.previewPeriod = state.activePeriod;
  state.addDateStart = formatDateKey(new Date());
  state.addDateEnd = formatDateKey(new Date());

  // === Date helpers ===
  function formatDateKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = '0' + m;
    var day = String(d.getDate()); if (day.length < 2) day = '0' + day;
    return y + '-' + m + '-' + day;
  }
  function parseDateKey(k) {
    if (!k || typeof k !== 'string') return new Date();
    var p = k.split('-');
    if (p.length !== 3) return new Date();
    var y = parseInt(p[0]), m = parseInt(p[1]), d = parseInt(p[2]);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
    return new Date(y, m - 1, d);
  }
  function getPayPeriod(d) { return Math.floor(Math.floor((d - START_DATE) / MS_PER_DAY) / 14); }
  function getPeriodStart(i) { return new Date(START_DATE.getTime() + i * 14 * MS_PER_DAY); }
  function getPeriodEnd(i) { return new Date(START_DATE.getTime() + (i * 14 + 13) * MS_PER_DAY); }
  function formatPeriodRange(i) {
    var s = getPeriodStart(i), e = getPeriodEnd(i);
    var opts = { month: 'short', day: 'numeric' };
    return s.toLocaleDateString('en-US', opts) + ' - ' + e.toLocaleDateString('en-US', opts);
  }
  function isWorkday(d) { return d.getDay() !== 0 && d.getDay() !== 6; }
  function nextWorkday(d) {
    var nd = new Date(d.getTime() + MS_PER_DAY);
    while (!isWorkday(nd)) nd = new Date(nd.getTime() + MS_PER_DAY);
    return nd;
  }
  function daysBetween(a, b) { return Math.round((b - a) / MS_PER_DAY); }

  function haptic(style) {
    try {
      if (navigator.vibrate) {
        var p = { light: 10, medium: 20, heavy: 30, success: [10, 30, 10] };
        navigator.vibrate(p[style || 'light'] || 10);
      }
    } catch (e) {}
  }
  function markSaved() { state.meta.lastSaved = new Date().toISOString(); saveMeta(); }
  function saveData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: state.data })); markSaved(); } catch (e) {} }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); markSaved(); } catch (e) {} }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(state.meta)); } catch (e) {} }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // === Multi-entry data helpers ===
  // Each date can have multiple entries: [{type,hours}, ...] or single {type,hours} (backward compat)
  function getDateEntries(key) {
    var e = state.data[key];
    if (!e) return [];
    if (Array.isArray(e)) return e;
    return [e]; // backward compat: single entry object
  }
  function setDateEntries(key, arr) {
    if (!arr || arr.length === 0) { delete state.data[key]; }
    else if (arr.length === 1) { state.data[key] = arr[0]; } // single: keep as plain object
    else { state.data[key] = arr; }
  }
  function fmtCompact(h) {
    if (typeof h !== 'number') return '?';
    var r = Math.round(h * 100) / 100;
    if (r === Math.floor(r)) return String(Math.floor(r));
    return (r % 0.5 === 0) ? r.toFixed(1) : r.toFixed(2);
  }

  // === Year helpers ===
  function getWorkYearStart(d) {
    var y = d.getFullYear();
    var startYear = d.getMonth() >= WORK_YEAR_START_MONTH ? y : y - 1;
    return new Date(startYear, WORK_YEAR_START_MONTH, 1);
  }
  function getWorkYearEnd(d) {
    var s = getWorkYearStart(d);
    return new Date(s.getFullYear() + 1, WORK_YEAR_START_MONTH, 0);
  }
  function getCalYearStart(d) { return new Date(d.getFullYear(), 0, 1); }
  function getCalYearEnd(d) { return new Date(d.getFullYear(), 11, 31); }
  // === FMLA helpers (multi-period) ===
  var FMLA_PERIOD_COLORS = ['#3b82f6','#a855f7','#f59e0b','#ef4444','#10b981','#ec4899'];
  var FMLA_PERIOD_CSS    = ['fmla','fmla-p2','fmla-p3','fmla-p4','fmla-p5','fmla-p6'];
  var FMLA_PERIOD_NAMES  = ['Blue','Purple','Amber','Red','Green','Pink'];

  function getFmlaPeriods() {
    var periods = state.settings.fmlaPeriods || [];
    return periods.slice().sort(function(a,b){ return a.startDate < b.startDate ? -1 : 1; });
  }
  function getFmlaPeriodIndex(period) {
    var periods = getFmlaPeriods();
    for (var i = 0; i < periods.length; i++) if (periods[i].id === period.id) return i;
    return 0;
  }
  function getFmlaPeriodColor(period) {
    return FMLA_PERIOD_COLORS[getFmlaPeriodIndex(period) % FMLA_PERIOD_COLORS.length];
  }
  function getFmlaPeriodCssClass(period) {
    return FMLA_PERIOD_CSS[getFmlaPeriodIndex(period) % FMLA_PERIOD_CSS.length];
  }
  function getFmlaPeriodForDateStr(dateKey) {
    var periods = getFmlaPeriods();
    var result = null;
    for (var i = 0; i < periods.length; i++) {
      if (periods[i].startDate && periods[i].startDate <= dateKey) result = periods[i];
      else break;
    }
    return result;
  }
  function getFmlaPeriodHoursUsed(period) {
    if (!period || !period.startDate) return 0;
    var periods = getFmlaPeriods();
    var idx = getFmlaPeriodIndex(period);
    var nextStart = (idx + 1 < periods.length) ? periods[idx + 1].startDate : null;
    var total = parseFloat(period.snapshotHours) || 0;
    for (var k in state.data) {
      if (k < period.startDate) continue;
      if (nextStart && k >= nextStart) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (!e || e.type !== 'fmla') continue;
        total += e.hours || 0;
      }
    }
    return total;
  }
  function getFmlaTotalHours() { return 12 * 5 * WD(); }
  function getFmlaPeriodHoursLeft(period) { return getFmlaTotalHours() - getFmlaPeriodHoursUsed(period); }
  function getCurrentFmlaPeriod() {
    if (!state.settings.fmlaEnabled) return null;
    return getFmlaPeriodForDateStr(formatDateKey(new Date()));
  }
  function getFmlaWindowStart() {
    var p = getCurrentFmlaPeriod();
    return p ? parseDateKey(p.startDate) : null;
  }
  function getFmlaWindowEnd() {
    var s = getFmlaWindowStart();
    if (!s) return null;
    return new Date(s.getFullYear() + 1, s.getMonth(), s.getDate() - 1);
  }
  function inFmlaWindow(d) {
    var s = getFmlaWindowStart(), e = getFmlaWindowEnd();
    if (!s || !e) return false;
    return d >= s && d <= e;
  }
  function calcFmlaHoursUsed() {
    var p = getCurrentFmlaPeriod();
    return p ? getFmlaPeriodHoursUsed(p) : 0;
  }
  function calcFmlaHoursLeft() {
    var p = getCurrentFmlaPeriod();
    return p ? getFmlaPeriodHoursLeft(p) : 0;
  }
  function calcSickChargeFromFmla(fromDate) {
    var today = new Date(), total = 0;
    for (var k in state.data) {
      var d = parseDateKey(k);
      if (!inWorkYear(d, today)) continue;
      if (fromDate && d < fromDate) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (!e || e.type !== 'fmla') continue;
        if (typeof e.sickCharge === 'number') total += e.sickCharge;
        if (typeof e.familySickCharge === 'number') total += e.familySickCharge;
      }
    }
    return total;
  }
  function calcVacChargeFromFmla(fromDate) {
    var today = new Date(), total = 0;
    for (var k in state.data) {
      var d = parseDateKey(k);
      if (!inWorkYear(d, today)) continue;
      if (fromDate && d < fromDate) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (!e || e.type !== 'fmla') continue;
        if (typeof e.vacCharge === 'number') total += e.vacCharge;
      }
    }
    return total;
  }
  function calcFamilySickChargeFromFmla() {
    var today = new Date(), total = 0;
    for (var k in state.data) {
      var d = parseDateKey(k);
      if (!inCalYear(d, today)) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (!e || e.type !== 'fmla') continue;
        if (typeof e.familySickCharge === 'number') total += e.familySickCharge;
      }
    }
    return total;
  }


  function getQuarterIndex(d) {
    var monthsFromStart = (d.getFullYear() - getWorkYearStart(d).getFullYear()) * 12 + (d.getMonth() - WORK_YEAR_START_MONTH);
    return Math.floor(monthsFromStart / 3);
  }
  function getQuarterMonths(qIdx) {
    var months = [];
    for (var i = 0; i < 3; i++) months.push((WORK_YEAR_START_MONTH + qIdx * 3 + i) % 12);
    return months;
  }
  function getQuarterName(qIdx) {
    var m = getQuarterMonths(qIdx);
    var names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[m[0]] + '-' + names[m[2]];
  }
  function daysUntilSep1() {
    var today = new Date();
    var nextSep = new Date(today.getFullYear(), 8, 1);
    if (today >= nextSep) nextSep = new Date(today.getFullYear() + 1, 8, 1);
    return Math.ceil((nextSep - today) / MS_PER_DAY);
  }
  function daysUntilJan1() {
    var today = new Date();
    var nextJan = new Date(today.getFullYear() + 1, 0, 1);
    return Math.ceil((nextJan - today) / MS_PER_DAY);
  }

  // === Type info ===
  var TYPES = {
    ot:    { label: 'OT', name: 'Overtime', color: 'ot', tag: 'OT' },
    vac:   { label: 'VAC', name: 'Vacation', color: 'vac', tag: 'V' },
    sick:  { label: 'SICK', name: 'Sick', color: 'sick', tag: 'S' },
    fsick: { label: 'FS', name: 'Family Sick', color: 'fsick', tag: 'FS' },
    pl:    { label: 'PL', name: 'Personal Leave', color: 'pl', tag: 'PL' },
    comp:  { label: 'COMP', name: 'Regular Comp', color: 'comp', tag: 'C' },
    hcomp: { label: 'H-COMP', name: 'Holiday Comp', color: 'hcomp', tag: 'HC' },
    block: { label: 'OFF', name: 'Blocked', color: 'block', tag: 'OFF' },
    fmla:  { label: 'FMLA', name: 'FMLA Leave', color: 'fmla', tag: 'FMLA' }
  };
  var WD = function() { return state.settings.workdayHours || 7.5; };

  // === Date filter helpers ===
  function inWorkYear(d, ref) { return d >= getWorkYearStart(ref) && d <= getWorkYearEnd(ref); }
  function inCalYear(d, ref) { return d >= getCalYearStart(ref) && d <= getCalYearEnd(ref); }
  function getEntriesIn(type, filterFn) {
    var arr = [];
    for (var k in state.data) {
      var d = parseDateKey(k);
      if (!filterFn(d)) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (!e || e.type !== type) continue;
        arr.push({ key: k, date: d, entry: e });
      }
    }
    return arr;
  }
  function sumHours(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) { var h = arr[i].entry.hours; if (typeof h === 'number') s += h; }
    return s;
  }

  // === Bank calculations ===
  function getBalanceAsOfDate() { return parseDateKey(state.settings.balanceAsOfDate || formatDateKey(new Date())); }
  function getAccrualStartDate() {
    var b = getBalanceAsOfDate();
    var a = parseDateKey(state.settings.accrualEffectiveDate || state.settings.balanceAsOfDate || formatDateKey(new Date()));
    return a > b ? a : b;
  }
  function countMonthlyAccrualsThrough(today) {
    var start = getAccrualStartDate();
    var end = today || new Date();
    var count = 0;
    var cur = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    while (cur <= end) {
      count++;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return count;
  }
  function calcAccruedMonthly(rate) {
    return (parseFloat(rate) || 0) * countMonthlyAccrualsThrough(new Date());
  }
  function getBankUsageSince(type, fromDate) {
    return sumHours(getEntriesIn(type, function(d) { return d >= fromDate; }));
  }
  function calcVacationLeft(extraSubtract) {
    var asOf = getBalanceAsOfDate();
    var used = getBankUsageSince('vac', asOf);
    var fmlaVac = calcVacChargeFromFmla(asOf);
    var left = (parseFloat(state.settings.vacationRemaining) || 0) + calcAccruedMonthly(state.settings.vacationMonthlyAccrual) - used - fmlaVac - (extraSubtract || 0);
    return left;
  }
  function calcSickLeft(extraSubtract) {
    var asOf = getBalanceAsOfDate();
    var sickUsed = getBankUsageSince('sick', asOf);
    var fsickUsed = getBankUsageSince('fsick', asOf);
    var fmlaSick = calcSickChargeFromFmla(asOf);
    return (parseFloat(state.settings.sickRemaining) || 0) + calcAccruedMonthly(state.settings.sickMonthlyAccrual) - sickUsed - fsickUsed - fmlaSick - (extraSubtract || 0);
  }
  function calcCompLeft(extraSubtract) {
    var asOf = getBalanceAsOfDate();
    return (parseFloat(state.settings.compRemaining) || 0) - getBankUsageSince('comp', asOf) - (extraSubtract || 0);
  }
  function calcHolidayCompLeft(extraSubtract) {
    var asOf = getBalanceAsOfDate();
    return (parseFloat(state.settings.hcompRemaining) || 0) - getBankUsageSince('hcomp', asOf) - (extraSubtract || 0);
  }

  // === Monthly Accrual Auto-Add System ===
  // Produces a "YYYY-MM" key for duplicate-prevention tracking
  function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // applyMonthlyAccrual(force)
  //   force=false → only runs on the 1st of the month, skips if already done this month
  //   force=true  → runs any day (manual/test button), but still skips if already done this month
  //
  // How it works:
  //   1. calcVacationLeft() / calcSickLeft() already factor in the current projection
  //      (the existing countMonthlyAccrualsThrough logic credits the 1st's accrual on the 1st).
  //   2. We "bake in" that computed balance as the new baseline (vacationRemaining / sickRemaining)
  //      and reset balanceAsOfDate + accrualEffectiveDate to the 1st of the current month.
  //   3. After baking in, countMonthlyAccrualsThrough returns 0 until next month's 1st,
  //      so there is NO double-counting — the projection and auto-add stay in sync.
  //   4. lastAccrualKey (stored in state.meta) prevents re-running in the same month
  //      even if the app refreshes, reopens, or the device restarts.
  function applyMonthlyAccrual(force) {
    var now = new Date();
    var mk = monthKey(now);

    // Duplicate prevention: already processed this month — skip regardless of force
    if (state.meta.lastAccrualKey === mk) {
      if (force) showToast('Accrual already applied for ' + mk, 'info');
      return;
    }

    // Auto-run guard: only fire on the 1st unless manually forced
    if (!force && now.getDate() !== 1) return;

    // Capture the current true balances (projection already credited for this month)
    var newVac  = calcVacationLeft();
    var newSick = calcSickLeft();

    // Bake computed balances into the stored baseline (never go below 0)
    state.settings.vacationRemaining = Math.max(0, parseFloat(newVac.toFixed(4)));
    state.settings.sickRemaining     = Math.max(0, parseFloat(newSick.toFixed(4)));

    // Reset the balance date to the 1st of the current month so the projection
    // starts fresh from 0 — no double-count when next month arrives
    var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    var firstStr = formatDateKey(firstOfMonth);
    state.settings.balanceAsOfDate    = firstStr;
    state.settings.accrualEffectiveDate = firstStr;

    // Mark this month as processed — persisted to localStorage via saveMeta()
    state.meta.lastAccrualKey = mk;

    saveSettings();
    saveMeta();
    render();

    if (force) showToast('Accrual applied for ' + mk);
  }

  // Schedule a midnight check so the app applies accrual on the 1st without a manual refresh
  function scheduleMidnightAccrualCheck() {
    var now = new Date();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var msUntilMidnight = tomorrow - now + 500; // +500ms buffer
    setTimeout(function() {
      applyMonthlyAccrual(false);
      scheduleMidnightAccrualCheck(); // chain for the next day
    }, msUntilMidnight);
  }
  function calcFamilySickDaysUsed(extraAdd) {
    var today = new Date();
    var entries = getEntriesIn('fsick', function(d) { return inCalYear(d, today); });
    var hours = sumHours(entries) + calcFamilySickChargeFromFmla();
    var days = hours / WD();
    return state.settings.familySickUsedDays + days + (extraAdd || 0);
  }
  function calcPLDaysUsed(extraAdd) {
    var today = new Date();
    var entries = getEntriesIn('pl', function(d) { return inCalYear(d, today); });
    var hours = sumHours(entries);
    var days = hours / WD();
    return state.settings.plUsedDays + days + (extraAdd || 0);
  }
  function getFmlaContext(isPanel) {
    return {
      reason: isPanel ? state.editFmlaReason : state.addFmlaReason,
      charge: isPanel ? state.editFmlaCharge : state.addFmlaCharge
    };
  }
  function calcFmlaAllocation(hours, ctx) {
    var reason = (ctx && ctx.reason) || 'self';
    var charge = (ctx && ctx.charge) || 'vac';
    var allocation = { reason: reason, charge: charge, sickCharge: 0, familySickCharge: 0, vacCharge: 0, unpaidCharge: 0 };
    if (reason === 'spouse') {
      if (charge === 'fsick') {
        allocation.familySickCharge = Math.min(hours, Math.max(0, calcSickLeft(0)));
        allocation.unpaidCharge = Math.max(0, hours - allocation.familySickCharge);
      } else if (charge === 'unpaid') {
        allocation.unpaidCharge = hours;
      } else {
        allocation.vacCharge = Math.min(hours, Math.max(0, calcVacationLeft(0)));
        allocation.unpaidCharge = Math.max(0, hours - allocation.vacCharge);
      }
      return allocation;
    }
    allocation.sickCharge = Math.min(hours, Math.max(0, calcSickLeft(0)));
    var vacNeeded = hours - allocation.sickCharge;
    allocation.vacCharge = Math.min(vacNeeded, Math.max(0, calcVacationLeft(0)));
    allocation.unpaidCharge = Math.max(0, hours - allocation.sickCharge - allocation.vacCharge);
    return allocation;
  }
  function fmlaReserveWarning(hours, allocation) {
    var combinedAfter = calcSickLeft(0) + calcVacationLeft(0) + calcCompLeft(0) + calcHolidayCompLeft(0)
      - ((allocation && allocation.sickCharge) || 0)
      - ((allocation && allocation.familySickCharge) || 0)
      - ((allocation && allocation.vacCharge) || 0);
    var reserve = WD() * 10;
    return combinedAfter < reserve ? 'FMLA reserve warning: this may leave less than two weeks (' + reserve.toFixed(1) + ' hrs) of combined accruals. Confirm with HR.' : '';
  }
  function formatFmlaDetail(entry) {
    var parts = ['FMLA ' + (entry.fmlaReason === 'spouse' ? 'Wife' : 'Self')];
    if ((entry.sickCharge || 0) > 0) parts.push('Sick ' + fmtHM(entry.sickCharge));
    if ((entry.familySickCharge || 0) > 0) parts.push('Family Sick ' + fmtHM(entry.familySickCharge));
    if ((entry.vacCharge || 0) > 0) parts.push('Vac ' + fmtHM(entry.vacCharge));
    var unpaidAmt = typeof entry.unpaidCharge === 'number' ? entry.unpaidCharge : Math.max(0, (entry.hours || 0) - (entry.sickCharge || 0) - (entry.familySickCharge || 0) - (entry.vacCharge || 0));
    if (unpaidAmt > 0.01) parts.push('Unpaid ' + fmtHM(unpaidAmt));
    return parts.join(' · ');
  }

  // === Stretches (consecutive workdays of sick/fsick ONLY, no breaks) ===
  function getStretches(filterFn) {
    // Build a map of dates that have any sick or fsick entry
    var dateMap = {};
    for (var k in state.data) {
      var dayEntries = getDateEntries(k);
      var hasSick = false, hasAny = false;
      for (var ei = 0; ei < dayEntries.length; ei++) {
        if (dayEntries[ei].type === 'sick') { hasSick = true; hasAny = true; }
        else if (dayEntries[ei].type === 'fsick') { hasAny = true; }
      }
      if (hasAny) {
        var d = parseDateKey(k);
        if (!filterFn || filterFn(d)) dateMap[k] = { key: k, date: d, hasSick: hasSick };
      }
    }
    var keys = Object.keys(dateMap).sort();
    var stretches = [], current = null;
    for (var i = 0; i < keys.length; i++) {
      var info = dateMap[keys[i]];
      if (!current) {
        current = { start: info.date, end: info.date, days: 1, hasSick: info.hasSick };
      } else {
        var next = nextWorkday(current.end);
        if (formatDateKey(next) === info.key) {
          current.end = info.date; current.days++;
          if (info.hasSick) current.hasSick = true;
        } else {
          stretches.push(current);
          current = { start: info.date, end: info.date, days: 1, hasSick: info.hasSick };
        }
      }
    }
    if (current) stretches.push(current);
    return stretches;
  }

  function getOccasionsByQuarter() {
    var today = new Date();
    var counts = [0, 0, 0, 0];
    var stretches = getStretches(function(d) { return inWorkYear(d, today); });
    for (var i = 0; i < stretches.length; i++) {
      var s = stretches[i];
      if (!s.hasSick) continue;
      var q = getQuarterIndex(s.start);
      if (q >= 0 && q < 4) counts[q]++;
    }
    // Add manual offsets
    for (var j = 0; j < 4; j++) counts[j] += state.settings.manualOccasions[j] || 0;
    return counts;
  }

  // === Conflict / projection checks ===
  // Returns { ok, blocks, warns, info } where blocks/warns/info are arrays of messages
  function checkEntry(type, hours, dateStr, fmlaCtx) {
    var blocks = [], warns = [], info = [];
    try {

    if (type === 'vac') {
      var newLeft = calcVacationLeft(hours);
      if (newLeft < 0) blocks.push('Not enough vacation. Have ' + calcVacationLeft(0).toFixed(2) + ' hrs, need ' + hours + '.');
      else if (newLeft < WD() * 3) warns.push('Vacation low after this: ' + newLeft.toFixed(2) + ' hrs left (' + (newLeft / WD()).toFixed(1) + ' days).');
      else info.push('After save: ' + newLeft.toFixed(2) + ' vacation hrs left (' + (newLeft / WD()).toFixed(1) + ' days).');
    }

    if (type === 'sick') {
      var newSickLeft = calcSickLeft(hours);
      if (newSickLeft < 0) blocks.push('Not enough sick hours. Have ' + calcSickLeft(0).toFixed(2) + ', need ' + hours + '.');
      else if (newSickLeft < WD() * 3) warns.push('Sick low after this: ' + newSickLeft.toFixed(2) + ' hrs left.');
      else info.push('After save: ' + newSickLeft.toFixed(2) + ' sick hrs left.');

      // Occasion check
      if (dateStr) {
        var d = parseDateKey(dateStr);
        var q = getQuarterIndex(d);
        var counts = getOccasionsByQuarter();
        // Conservatively assume this will be a new occasion if no adjacent sick/fsick exists
        var couldAdd = checkWouldAddOccasion(dateStr, type);
        if (couldAdd && q >= 0 && q < 4 && counts[q] >= 1) {
          var occNum = counts[q] + 1; var occSuffix = occNum === 1 ? 'st' : occNum === 2 ? 'nd' : occNum === 3 ? 'rd' : 'th'; warns.push('This would be your ' + occNum + occSuffix + ' occasion in ' + getQuarterName(q) + '. Limit is 1 per quarter.');
        }
      }
    }

    if (type === 'fsick') {
      var newSickLeft2 = calcSickLeft(hours);
      if (newSickLeft2 < 0) blocks.push('Family sick draws from sick bank. Have ' + calcSickLeft(0).toFixed(2) + ' sick hrs, need ' + hours + '.');
      var newFsickDays = calcFamilySickDaysUsed(hours / WD());
      if (newFsickDays > FAMILY_SICK_CAP_DAYS) blocks.push('Exceeds 10-day family sick cap. Have ' + (FAMILY_SICK_CAP_DAYS - calcFamilySickDaysUsed(0)).toFixed(2) + ' days left.');
      else if (newFsickDays > FAMILY_SICK_CAP_DAYS - 2) warns.push('Family sick low: ' + (FAMILY_SICK_CAP_DAYS - newFsickDays).toFixed(2) + ' days left after this.');
      else info.push('After save: ' + (FAMILY_SICK_CAP_DAYS - newFsickDays).toFixed(2) + ' family sick days left.');
    }

    if (type === 'pl') {
      var newPlDays = calcPLDaysUsed(hours / WD());
      if (newPlDays > PL_CAP_DAYS) blocks.push('Exceeds 3-day PL cap. Have ' + (PL_CAP_DAYS - calcPLDaysUsed(0)).toFixed(2) + ' days left.');
      else info.push('After save: ' + (PL_CAP_DAYS - newPlDays).toFixed(2) + ' PL days left.');
    }

    if (type === 'comp') {
      var newCompLeft = calcCompLeft(hours);
      if (newCompLeft < 0) blocks.push('Not enough regular comp time. Have ' + calcCompLeft(0).toFixed(2) + ' hrs, need ' + hours + '.');
      else info.push('After save: ' + newCompLeft.toFixed(2) + ' regular comp hrs left.');
    }

    if (type === 'hcomp') {
      var newHCompLeft = calcHolidayCompLeft(hours);
      if (newHCompLeft < 0) blocks.push('Not enough holiday comp time. Have ' + calcHolidayCompLeft(0).toFixed(2) + ' hrs, need ' + hours + '.');
      else info.push('After save: ' + newHCompLeft.toFixed(2) + ' holiday comp hrs left.');
    }

    if (type === 'fmla') {
      if (!getCurrentFmlaPeriod()) {
        blocks.push('Add an FMLA period in Settings (FMLA Tracking section) before logging FMLA leave.');
      } else {
        var fmlaLeft = calcFmlaHoursLeft();
        if (fmlaLeft < hours) {
          blocks.push('Only ' + fmlaLeft.toFixed(2) + ' FMLA hrs left of your 12-week entitlement (' + (fmlaLeft/WD()/5).toFixed(1) + ' weeks).');
        } else {
          var alloc = calcFmlaAllocation(hours, fmlaCtx || { reason: 'self', charge: 'vac' });
          if ((fmlaCtx && fmlaCtx.reason) === 'spouse' && fmlaCtx.charge === 'fsick') {
            var newFsickFmlaDays = calcFamilySickDaysUsed((alloc.familySickCharge || 0) / WD());
            if (newFsickFmlaDays > FAMILY_SICK_CAP_DAYS) blocks.push('Exceeds 10-day family sick cap. Have ' + (FAMILY_SICK_CAP_DAYS - calcFamilySickDaysUsed(0)).toFixed(2) + ' days left.');
            if ((alloc.familySickCharge || 0) < hours) blocks.push('Family sick FMLA needs ' + hours + ' hrs, but only ' + calcSickLeft(0).toFixed(2) + ' sick hrs are available.');
          }
          if (alloc.unpaidCharge > 0) {
            warns.push(alloc.unpaidCharge.toFixed(2) + ' hrs will be UNPAID FMLA. Confirm with HR.');
          }
          var reserveMsg = fmlaReserveWarning(hours, alloc);
          if (reserveMsg) warns.push(reserveMsg);
          if ((fmlaCtx && fmlaCtx.reason) === 'spouse') {
            warns.push('Spouse/caregiver FMLA paid-bank coding can vary. Confirm the charge type with HR.');
          }
          if (alloc.vacCharge > 0 || alloc.sickCharge > 0 || alloc.familySickCharge > 0) {
            info.push('After save: ' + formatFmlaDetail({ type: 'fmla', hours: hours, fmlaReason: alloc.reason, sickCharge: alloc.sickCharge, familySickCharge: alloc.familySickCharge, vacCharge: alloc.vacCharge, unpaidCharge: alloc.unpaidCharge }) + '.');
          } else {
            info.push('After save: unpaid FMLA only.');
          }
          if (fmlaLeft - hours < WD() * 5 * 2 && fmlaLeft - hours >= 0) {
            warns.push('Low FMLA: only ' + (fmlaLeft - hours).toFixed(2) + ' hrs (' + ((fmlaLeft - hours)/WD()/5).toFixed(1) + ' weeks) remaining after this entry.');
          }
      }
    }
    }

    // Consecutive workdays check (sick/fsick chains)
    if (dateStr && (type === 'sick' || type === 'fsick')) {
      var consecLen = projectConsecutiveLength(dateStr, type);
      if (consecLen > MAX_CONSEC_WORKDAYS) warns.push('This makes ' + consecLen + ' consecutive workdays of sick/family sick. Limit before doctor note: ' + MAX_CONSEC_WORKDAYS + '.');
    }

    } catch (err) {
      console.error('checkEntry error:', err);
    }
    return { ok: blocks.length === 0, blocks: blocks, warns: warns, info: info };
  }

  function checkWouldAddOccasion(dateStr, type) {
    var d = parseDateKey(dateStr);
    var origData = state.data[dateStr];
    var result = false;
    try {
      var tempEntries = getDateEntries(dateStr).slice();
      var found = false;
      for (var ti = 0; ti < tempEntries.length; ti++) { if (tempEntries[ti].type === type) { found = true; break; } }
      if (!found) tempEntries.push({ type: type, hours: 1 });
      state.data[dateStr] = tempEntries;
      var stretches = getStretches(function(dd) { return inWorkYear(dd, d); });
      for (var i = 0; i < stretches.length; i++) {
        var s = stretches[i];
        if (d >= s.start && d <= s.end) { result = s.hasSick; break; }
      }
    } catch (err) { result = false; }
    finally {
      if (origData === undefined) delete state.data[dateStr];
      else state.data[dateStr] = origData;
    }
    return result;
  }

  function projectConsecutiveLength(dateStr, type) {
    var d = parseDateKey(dateStr);
    var origData = state.data[dateStr];
    var len = 1;
    try {
      var tempEntries = getDateEntries(dateStr).slice();
      var found = false;
      for (var ti = 0; ti < tempEntries.length; ti++) { if (tempEntries[ti].type === type) { found = true; break; } }
      if (!found) tempEntries.push({ type: type, hours: 1 });
      state.data[dateStr] = tempEntries;
      var stretches = getStretches(function(dd) { return inWorkYear(dd, d); });
      for (var i = 0; i < stretches.length; i++) {
        var s = stretches[i];
        if (d >= s.start && d <= s.end) { len = s.days; break; }
      }
    } catch (err) { len = 1; }
    finally {
      if (origData === undefined) delete state.data[dateStr];
      else state.data[dateStr] = origData;
    }
    return len;
  }

  // === Icons ===
  var icons = {
    home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    list: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    chevLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    chevRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    chevUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    db: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
  };

  // === Toast ===
  var toastTimer = null;
  function showToast(msg, type, undoFn) {
    var el = document.getElementById('toast');
    var cls = type === 'error' ? 'toast-error' : type === 'warn' ? 'toast-warn' : 'toast-success';
    state.undoAction = undoFn || null;
    var undoBtn = undoFn ? '<button class="toast-undo" data-action="undo-action">Undo</button>' : '';
    el.innerHTML = '<div class="toast-wrap"><div class="toast ' + cls + '" style="display:flex;align-items:center">' + escapeHtml(msg) + undoBtn + '</div></div>';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.innerHTML = ''; state.undoAction = null; }, 4000);
  }

  // === Confirm modal ===
  function showConfirm(title, body, onConfirm, confirmLabel) {
    state.confirmCb = onConfirm;
    var el = document.getElementById('modal');
    el.innerHTML = ''
      + '<div class="modal-backdrop" data-action="modal-cancel">'
        + '<div class="modal" data-stop="1">'
          + '<div class="modal-title">' + escapeHtml(title) + '</div>'
          + '<div class="modal-body">' + body + '</div>'
          + '<div class="modal-actions">'
            + '<button class="btn" style="flex:1" data-action="modal-cancel">Cancel</button>'
            + '<button class="btn-primary" style="flex:1;padding:11px;width:auto" data-action="modal-ok">' + escapeHtml(confirmLabel || 'Continue') + '</button>'
          + '</div>'
        + '</div>'
      + '</div>';
  }
  function closeConfirm() {
    state.confirmCb = null;
    document.getElementById('modal').innerHTML = '';
  }

  // === Theme ===
  function applyTheme() {
    var isLight = state.theme === 'light';
    document.body.classList.toggle('light', isLight);
    if (isLight) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#eef1f5' : '#0b0d12');
    try {
      localStorage.setItem(THEME_KEY, state.theme);
      localStorage.setItem('khub_theme', state.theme);
      localStorage.setItem('khub_theme_override', 'true');
    } catch (e) {}
    document.getElementById('themeBtn').innerHTML = state.theme === 'dark' ? icons.moon : icons.sun;
  }
  function setGreeting() {
    var h = new Date().getHours();
    var g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    var uName = (state.settings.userName || 'David').trim() || 'David';
    document.getElementById('greeting').textContent = g + ', ' + uName;
  }

  // === Type chips ===
  function renderTypeChips(active, includeBlock, dataAction, includeFmla) {
    var types = ['ot', 'vac', 'sick', 'fsick', 'pl', 'comp', 'hcomp'];
    if (includeFmla && state.settings.fmlaEnabled) types.push('fmla');
    if (includeBlock) types.push('block');
    var html = '<div class="type-chips" style="grid-template-columns:repeat(' + types.length + ',1fr)">';
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      var cls = 'type-chip ' + TYPES[t].color + (active === t ? ' active' : '');
      html += '<button class="' + cls + '" data-action="' + dataAction + '" data-type="' + t + '">' + TYPES[t].label + '</button>';
    }
    html += '</div>';
    return html;
  }

  // === Status alerts (Home top) ===
  function renderStatusAlerts() {
    var html = '';
    var needsSnapshot = state.settings.vacationRemaining === 0 && state.settings.sickRemaining === 0;
    if (needsSnapshot) {
      html += '<div class="alert alert-info" data-action="goto-settings"><span class="alert-icon">' + icons.info + '</span><div class="alert-body"><div class="alert-title">Set your starting balances</div>Tap to open Settings and enter your current vacation hours, sick hours, occasions used, and PL/family sick days used.</div></div>';
    }

    var vacLeft = calcVacationLeft(0);
    var sickLeft = calcSickLeft(0);
    var compLeft = calcCompLeft(0);
    var hcompLeft = calcHolidayCompLeft(0);
    var fsickLeft = FAMILY_SICK_CAP_DAYS - calcFamilySickDaysUsed(0);
    var plLeft = PL_CAP_DAYS - calcPLDaysUsed(0);
    var qCounts = getOccasionsByQuarter();
    var currQ = getQuarterIndex(new Date());

    var alerts = [];
    if (vacLeft > 0 && vacLeft < WD() * 2) alerts.push({ type: 'warn', title: 'Vacation low', body: vacLeft.toFixed(2) + ' hrs (' + (vacLeft / WD()).toFixed(1) + ' days) remaining.' });
    if (vacLeft <= 0 && state.settings.vacationRemaining > 0) alerts.push({ type: 'danger', title: 'Vacation depleted', body: 'You have 0 vacation hours available.' });
    if (sickLeft > 0 && sickLeft < WD() * 2) alerts.push({ type: 'warn', title: 'Sick bank low', body: sickLeft.toFixed(2) + ' hrs left. Family sick also draws from this.' });
    if (sickLeft <= 0 && state.settings.sickRemaining > 0) alerts.push({ type: 'danger', title: 'Sick bank depleted', body: 'No sick hours available. Family sick is also unavailable until this refills.' });
    if (fsickLeft <= 2 && fsickLeft > 0) alerts.push({ type: 'warn', title: 'Family sick low', body: fsickLeft.toFixed(1) + ' of 10 days remaining this calendar year.' });
    if (fsickLeft <= 0 && state.settings.sickRemaining > 0) alerts.push({ type: 'danger', title: 'Family sick exhausted', body: '10-day cap reached. Resets January 1.' });
    if (plLeft <= 1 && plLeft > 0) alerts.push({ type: 'warn', title: 'PL low', body: plLeft.toFixed(1) + ' of 3 days remaining this calendar year.' });
    if (plLeft <= 0) alerts.push({ type: 'warn', title: 'PL exhausted', body: '3-day cap reached. Resets January 1.' });

    if (currQ >= 0 && currQ < 4 && qCounts[currQ] >= 1) {
      alerts.push({ type: 'warn', title: 'Q' + (currQ + 1) + ' occasion used', body: 'You used your sick occasion for ' + getQuarterName(currQ) + '. Next available ' + getQuarterName((currQ + 1) % 4) + '.' });
    }

    if (state.settings.fmlaEnabled && state.settings.fmlaPeriods && state.settings.fmlaPeriods.length > 0) {
      var fmlaLeftAl = calcFmlaHoursLeft();
      var fmlaRenewDate = getFmlaWindowEnd();
      var daysToRenew = fmlaRenewDate ? Math.ceil((fmlaRenewDate - new Date()) / MS_PER_DAY) : null;
      if (fmlaLeftAl <= 0) {
        alerts.push({ type: 'danger', title: 'FMLA exhausted', body: '12-week entitlement used. Leave is unpaid until renewal ' + (fmlaRenewDate ? fmlaRenewDate.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '') + '.' });
      } else if (fmlaLeftAl < WD() * 5 * 2) {
        alerts.push({ type: 'warn', title: 'FMLA running low', body: fmlaLeftAl.toFixed(1) + ' hrs (' + (fmlaLeftAl/WD()/5).toFixed(1) + ' weeks) remaining of 12-week entitlement.' });
      }
      if (daysToRenew !== null && daysToRenew <= 30 && daysToRenew > 0 && fmlaLeftAl > 0) {
        alerts.push({ type: 'info', title: 'FMLA year renews soon', body: 'Your FMLA entitlement renews in ' + daysToRenew + ' days (' + fmlaRenewDate.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) + '). Contact HR to re-certify if needed.' });
      }
    }
    var daysSep = daysUntilSep1();
    if (daysSep <= 14 && daysSep > 0) alerts.push({ type: 'info', title: 'Work year ending', body: daysSep + ' days until September 1. Occasions reset then. Back up your data.' });
    var daysJan = daysUntilJan1();
    if (daysJan <= 14 && daysJan > 0) alerts.push({ type: 'info', title: 'Calendar year ending', body: daysJan + ' days until January 1. PL and family sick reset then.' });

    for (var i = 0; i < alerts.length; i++) {
      var a = alerts[i];
      var iconName = a.type === 'danger' ? 'warn' : a.type === 'warn' ? 'warn' : 'info';
      html += '<div class="alert alert-' + a.type + '"><span class="alert-icon">' + icons[iconName] + '</span><div class="alert-body"><div class="alert-title">' + escapeHtml(a.title) + '</div>' + escapeHtml(a.body) + '</div></div>';
    }
    return html;
  }

  // === Add Entry projection ===
  /* ── Time picker helpers ── */
  function fmtHM(decHrs) {
    var hr = Math.floor(decHrs), mn = Math.round((decHrs - hr) * 60);
    if (mn === 60) { hr++; mn = 0; }
    return (hr > 0 ? hr + 'h' : '') + (mn > 0 ? (hr > 0 ? ' ' : '') + (mn < 10 ? '0' : '') + mn + 'm' : '') || '0m';
  }

  function renderHoursPicker(idSuffix, currentVal) {
    var v = parseFloat(currentVal) || 0;
    var lbl = v > 0 ? fmtHM(v) : 'Tap to set time';
    return '<button class="time-picker-btn" id="tpbtn-' + idSuffix + '" type="button" data-action="open-time-picker" data-suffix="' + idSuffix + '">⏱ ' + lbl + '</button>';
  }

  function renderFmlaControls(prefix, reason, charge) {
    var html = '<div class="projection ok" style="margin-top:6px">';
    html += '<div class="label mb-2">FMLA For</div>';
    html += '<div class="toggle-row" style="margin-bottom:8px">';
    html += '<button class="toggle-btn ' + (reason !== 'spouse' ? 'active' : '') + '" data-action="fmla-reason" data-prefix="' + prefix + '" data-val="self">Self</button>';
    html += '<button class="toggle-btn ' + (reason === 'spouse' ? 'active' : '') + '" data-action="fmla-reason" data-prefix="' + prefix + '" data-val="spouse">Wife/Spouse</button>';
    html += '</div>';
    if (reason === 'spouse') {
      html += '<div class="label mb-2">Paid Charge</div>';
      html += '<div class="toggle-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:0">';
      html += '<button class="toggle-btn ' + (charge === 'vac' ? 'active' : '') + '" data-action="fmla-charge" data-prefix="' + prefix + '" data-val="vac">Vacation</button>';
      html += '<button class="toggle-btn ' + (charge === 'fsick' ? 'active' : '') + '" data-action="fmla-charge" data-prefix="' + prefix + '" data-val="fsick">Family Sick</button>';
      html += '<button class="toggle-btn ' + (charge === 'unpaid' ? 'active' : '') + '" data-action="fmla-charge" data-prefix="' + prefix + '" data-val="unpaid">Unpaid</button>';
      html += '</div>';
    } else {
      html += '<div class="text-xs muted">Self FMLA uses sick first, then vacation, then unpaid.</div>';
    }
    html += '</div>';
    return html;
  }

  function showTimePicker(initHrs, initMins, onConfirm) {
    // Calculator-style: digits shift left as you type (like a phone keypad)
    var modal = document.getElementById('modal');
    var h0 = Math.min(Math.max(Math.floor(initHrs), 0), 23);
    var m0 = Math.min(Math.max(Math.round(initMins), 0), 59);
    var inputDigits = h0 ? String(h0 * 100 + m0) : (m0 ? '0' + (m0 < 10 ? '0' : '') + m0 : '');
    function readTime() {
      if (!inputDigits) return { h: 0, m: 0 };
      var h = 0, m = 0;
      if (inputDigits.length === 1) {
        h = parseInt(inputDigits, 10) || 0;
      } else if (inputDigits.length === 2) {
        h = parseInt(inputDigits.charAt(0), 10) || 0;
        m = parseInt(inputDigits.charAt(1), 10) || 0;
      } else {
        h = parseInt(inputDigits.slice(0, -2), 10) || 0;
        m = parseInt(inputDigits.slice(-2), 10) || 0;
      }
      return { h: h, m: m };
    }
    function getH() { return readTime().h; }
    function getM() { return readTime().m; }
    function toDecimal() { return getH()+getM()/60; }
    function dispStr() { return getH()+':'+(getM()<10?'0':'')+getM(); }
    function hintStr() {
      var h = getH(), m = getM(), total = toDecimal();
      if (h === 0 && m === 0) return 'Type hours and minutes';
      return fmtHM(total) + ' selected';
    }
    function flashInvalid(msg) {
      var dEl = document.getElementById('calc-disp');
      var hEl = document.getElementById('calc-hint');
      if (hEl) hEl.textContent = msg;
      if (dEl) {
        dEl.classList.remove('tp-invalid');
        void dEl.offsetWidth;
        dEl.classList.add('tp-invalid');
        setTimeout(function(){ dEl.classList.remove('tp-invalid'); refreshDisp(); }, 240);
      }
    }
    function pushDigit(d) {
      var next = (inputDigits + String(d)).slice(-4);
      var prev = inputDigits;
      inputDigits = next;
      var t = readTime();
      inputDigits = prev;
      if (t.m > 59) { flashInvalid('Minutes must be 00-59'); return; }
      if (t.h > 23) { flashInvalid('Hours must be 0-23'); return; }
      inputDigits = next;
      refreshDisp();
    }
    function doBksp() { inputDigits = inputDigits.slice(0, -1); refreshDisp(); }
    function refreshDisp() {
      var el=document.getElementById('calc-disp'); if(!el) return;
      el.textContent=dispStr();
      el.style.color=(getH()===0&&getM()===0)?'var(--muted)':'var(--ot)';
      var hint=document.getElementById('calc-hint');
      if(hint) hint.textContent=hintStr();
    }
    function doConfirm() {
      var v=toDecimal(); modal.innerHTML='';
      document.removeEventListener('keydown',onCalcKey);
      onConfirm(parseFloat(v.toFixed(4)));
    }
    function doClose() { modal.innerHTML=''; document.removeEventListener('keydown',onCalcKey); }
    function onCalcKey(e) {
      if(e.key>='0'&&e.key<='9'){haptic('light');pushDigit(parseInt(e.key));e.preventDefault();}
      else if(e.key==='Backspace'){haptic('light');doBksp();e.preventDefault();}
      else if(e.key==='Enter'){haptic('success');doConfirm();e.preventDefault();}
      else if(e.key==='Escape'){doClose();e.preventDefault();}
    }
    var bs='padding:15px 0;font-size:20px;font-weight:600;border-radius:12px;width:100%;cursor:pointer;font-family:inherit;';
    var html='<div class="modal-backdrop" id="tp-backdrop" style="z-index:70">';
    html+='<div class="modal" data-stop="1" style="max-width:15rem;padding:16px 14px">';
    html+='<div id="calc-disp" style="text-align:center;font-size:52px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-0.03em;padding:8px 0 2px;color:var(--muted)">'+dispStr()+'</div>';
    html+='<div style="text-align:center;font-size:10px;color:var(--dim);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px">h : mm</div>';
    html+='<div id="calc-hint" style="text-align:center;font-size:12px;color:var(--muted);font-weight:600;margin:-5px 0 12px">'+hintStr()+'</div>';
    html+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px">';
    var rows2=[['1','2','3'],['4','5','6'],['7','8','9'],['⌫','0','✓']];
    for(var ri2=0;ri2<rows2.length;ri2++){
      for(var ci2=0;ci2<rows2[ri2].length;ci2++){
        var k2=rows2[ri2][ci2];
        if(k2==='✓'){
          html+='<button id="tp-set" style="'+bs+'background:var(--ot);color:white;border:none">✓</button>';
        } else if(k2==='⌫'){
          html+='<button id="tp-bk" style="'+bs+'background:var(--input-bg);border:1px solid var(--input-border);color:var(--text)">⌫</button>';
        } else {
          html+='<button class="cdk" data-d="'+k2+'" style="'+bs+'background:var(--input-bg);border:1px solid var(--input-border);color:var(--text)">'+k2+'</button>';
        }
      }
    }
    html+='</div>';
    html+='<button id="tp-cancel" style="width:100%;padding:10px;border-radius:10px;background:transparent;border:1px solid var(--input-border);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>';
    html+='</div></div>';
    modal.innerHTML=html; refreshDisp();
    document.addEventListener('keydown',onCalcKey);
    modal.querySelectorAll('.cdk').forEach(function(b2){
      b2.addEventListener('click',function(){haptic('light');pushDigit(parseInt(b2.getAttribute('data-d')));});
    });
    document.getElementById('tp-bk').addEventListener('click',function(){haptic('light');doBksp();});
    document.getElementById('tp-set').addEventListener('click',function(){haptic('success');doConfirm();});
    document.getElementById('tp-cancel').addEventListener('click',doClose);
    document.getElementById('tp-backdrop').addEventListener('click',function(e){if(e.target===this)doClose();});
  }

  function initAllPickers() { /* time picker now handled via data-action delegation */ }

  function cleanDecimal(value, places) {
    var n = parseFloat(value);
    if (isNaN(n) || !isFinite(n)) return 0;
    var p = Math.pow(10, places || 2);
    return Math.round(n * p) / p;
  }

  function settingDisplay(value) {
    return cleanDecimal(value, 2);
  }

  // Opens the keypad for a given settings field, with correct unit conversion in and out.
  function openSettingNumPad(field, unit, max) {
    var wd = state.settings.workdayHours || 7.5;
    var balToDisp = function(hrs) { return settingDisplay(state.balanceUnit === 'days' ? hrs / wd : hrs); };
    var dispToBal = function(v) { return cleanDecimal(state.balanceUnit === 'days' ? v * wd : v, 4); };
    var snapToDisp = function(days) { return settingDisplay(state.snapshotUnit === 'hours' ? days * wd : days); };
    var dispToSnap = function(v) { return cleanDecimal(state.snapshotUnit === 'hours' ? v / wd : v, 4); };
    // field -> { get current display value, write confirmed display value back to state }
    var map = {
      setVac:        { cur: balToDisp(state.settings.vacationRemaining),       set: function(v){ state.settings.vacationRemaining = dispToBal(v); }, label: 'Vacation Available' },
      setSick:       { cur: balToDisp(state.settings.sickRemaining),           set: function(v){ state.settings.sickRemaining = dispToBal(v); }, label: 'Sick Available' },
      setComp:       { cur: balToDisp(state.settings.compRemaining),           set: function(v){ state.settings.compRemaining = dispToBal(v); }, label: 'Regular Comp Available' },
      setHComp:      { cur: balToDisp(state.settings.hcompRemaining),          set: function(v){ state.settings.hcompRemaining = dispToBal(v); }, label: 'Holiday Comp Available' },
      setVacAccrual: { cur: balToDisp(state.settings.vacationMonthlyAccrual),  set: function(v){ state.settings.vacationMonthlyAccrual = dispToBal(v); }, label: 'Monthly Vacation Accrual' },
      setSickAccrual:{ cur: balToDisp(state.settings.sickMonthlyAccrual),      set: function(v){ state.settings.sickMonthlyAccrual = dispToBal(v); }, label: 'Monthly Sick Accrual' },
      setFsick:      { cur: snapToDisp(state.settings.familySickUsedDays), set: function(v){ state.settings.familySickUsedDays = dispToSnap(v); }, label: 'Family Sick Used' },
      setPL:         { cur: snapToDisp(state.settings.plUsedDays), set: function(v){ state.settings.plUsedDays = dispToSnap(v); }, label: 'PL Used' },
      setWorkday:    { cur: settingDisplay(state.settings.workdayHours), set: function(v){ state.settings.workdayHours = v > 0 ? cleanDecimal(v, 2) : 7.5; }, label: 'Workday Hours' }
    };
    var cfg = map[field];
    if (!cfg) return;
    showNumPad(cfg.label, cfg.cur, unit, { min: 0, max: max, onConfirm: function(v) {
      cfg.set(v);
      saveSettings();
      haptic('success');
      render();
      showToast('Saved');
    }});
  }

  // Renders a tappable button that opens the in-app numeric keypad (no OS keyboard).
  // fieldId maps to a settings field; display value is shown in the current toggle unit.
  function numPadBtn(fieldId, displayVal, unit, max) {
    var shown = (displayVal === null || displayVal === undefined || isNaN(displayVal)) ? '0' : String(parseFloat(parseFloat(displayVal).toFixed(2)));
    return '<button type="button" class="setting-input numpad-btn" data-action="numpad" data-field="' + fieldId + '" data-unit="' + escapeHtml(unit || '') + '"' + (max !== undefined ? ' data-max="' + max + '"' : '') + ' style="text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between">' + '<span>' + shown + '</span><span style="color:var(--dim);font-size:12px">' + escapeHtml(unit || '') + ' ⌨</span></button>';
  }

  // In-app decimal keypad. Replaces the iOS keyboard on Settings numeric fields.
  // label = field name, initVal = starting decimal, unit = e.g. 'hrs'/'days', opts = {min,max,onConfirm}
  function showNumPad(label, initVal, unit, opts) {
    opts = opts || {};
    var modal = document.getElementById('modal');
    // digitStr holds raw typed characters (digits + one optional '.')
    var digitStr = (initVal !== null && initVal !== undefined && !isNaN(initVal) && initVal !== 0) ? String(initVal) : '';
    function curVal() { var v = parseFloat(digitStr); return isNaN(v) ? 0 : v; }
    function dispStr() { return digitStr === '' ? '0' : digitStr; }
    function hintStr() {
      if (digitStr === '' ) return 'Tap to enter ' + (unit || 'value');
      return curVal() + ' ' + (unit || '');
    }
    function flashInvalid(msg) {
      var dEl = document.getElementById('np-disp');
      var hEl = document.getElementById('np-hint');
      if (hEl) hEl.textContent = msg;
      if (dEl) { dEl.classList.remove('tp-invalid'); void dEl.offsetWidth; dEl.classList.add('tp-invalid'); setTimeout(function(){ dEl.classList.remove('tp-invalid'); refreshDisp(); }, 240); }
    }
    function pushDigit(d) {
      if (d === '.') { if (digitStr.indexOf('.') !== -1) return; if (digitStr === '') digitStr = '0'; digitStr += '.'; refreshDisp(); return; }
      var next = digitStr + String(d);
      // Guard against absurd length
      if (next.replace('.', '').length > 6) { flashInvalid('Too many digits'); return; }
      var test = parseFloat(next);
      if (opts.max !== undefined && !isNaN(test) && test > opts.max) { flashInvalid('Max is ' + opts.max); return; }
      digitStr = next; refreshDisp();
    }
    function doBksp() { digitStr = digitStr.slice(0, -1); refreshDisp(); }
    function refreshDisp() {
      var el = document.getElementById('np-disp'); if (!el) return;
      el.textContent = dispStr();
      el.style.color = (digitStr === '' || curVal() === 0) ? 'var(--muted)' : 'var(--ot)';
      var hint = document.getElementById('np-hint'); if (hint) hint.textContent = hintStr();
    }
    function doConfirm() {
      var v = curVal();
      if (opts.min !== undefined && v < opts.min) v = opts.min;
      if (opts.max !== undefined && v > opts.max) v = opts.max;
      modal.innerHTML = ''; document.removeEventListener('keydown', onKey);
      if (opts.onConfirm) opts.onConfirm(parseFloat(v.toFixed(4)));
    }
    function doClose() { modal.innerHTML = ''; document.removeEventListener('keydown', onKey); }
    function onKey(e) {
      if (e.key >= '0' && e.key <= '9') { haptic('light'); pushDigit(parseInt(e.key)); e.preventDefault(); }
      else if (e.key === '.') { haptic('light'); pushDigit('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { haptic('light'); doBksp(); e.preventDefault(); }
      else if (e.key === 'Enter') { haptic('success'); doConfirm(); e.preventDefault(); }
      else if (e.key === 'Escape') { doClose(); e.preventDefault(); }
    }
    var bs = 'padding:15px 0;font-size:20px;font-weight:600;border-radius:12px;width:100%;cursor:pointer;font-family:inherit;';
    var html = '<div class="modal-backdrop" id="np-backdrop" style="z-index:70">';
    html += '<div class="modal" data-stop="1" style="max-width:16rem;padding:16px 14px">';
    html += '<div style="text-align:center;font-size:11px;color:var(--dim);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;font-weight:600">' + escapeHtml(label) + '</div>';
    html += '<div id="np-disp" style="text-align:center;font-size:48px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-0.03em;padding:4px 0 2px;color:var(--muted)">' + dispStr() + '</div>';
    html += '<div style="text-align:center;font-size:10px;color:var(--dim);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">' + escapeHtml(unit || '') + '</div>';
    html += '<div id="np-hint" style="text-align:center;font-size:12px;color:var(--muted);font-weight:600;margin:-5px 0 12px">' + hintStr() + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px">';
    var rows = [['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']];
    for (var ri = 0; ri < rows.length; ri++) {
      for (var ci = 0; ci < rows[ri].length; ci++) {
        var k = rows[ri][ci];
        if (k === '⌫') { html += '<button id="np-bk" style="' + bs + 'background:var(--input-bg);border:1px solid var(--input-border);color:var(--text)">⌫</button>'; }
        else { html += '<button class="npk" data-d="' + k + '" style="' + bs + 'background:var(--input-bg);border:1px solid var(--input-border);color:var(--text)">' + k + '</button>'; }
      }
    }
    html += '</div>';
    html += '<button id="np-set" style="width:100%;padding:14px;border-radius:12px;background:var(--ot);color:white;border:none;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">Set</button>';
    html += '<button id="np-cancel" style="width:100%;padding:10px;border-radius:10px;background:transparent;border:1px solid var(--input-border);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>';
    html += '</div></div>';
    modal.innerHTML = html; refreshDisp();
    document.addEventListener('keydown', onKey);
    modal.querySelectorAll('.npk').forEach(function(b) { b.addEventListener('click', function() { haptic('light'); pushDigit(b.getAttribute('data-d')); }); });
    document.getElementById('np-bk').addEventListener('click', function() { haptic('light'); doBksp(); });
    document.getElementById('np-set').addEventListener('click', function() { haptic('success'); doConfirm(); });
    document.getElementById('np-cancel').addEventListener('click', doClose);
    document.getElementById('np-backdrop').addEventListener('click', function(e) { if (e.target === this) doClose(); });
  }

  function bindCalendarSwipe() {
    var el = document.getElementById('calCard');
    if (!el || el._sw) return;
    el._sw = true;
    var sx, sy;
    el.addEventListener('touchstart', function(e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function(e) {
      if (sx === undefined) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 44) {
        haptic('light');
        state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + (dx < 0 ? 1 : -1));
        render();
      }
      sx = undefined;
    }, { passive: true });
  }

  function bindPanelDateInput() {
    var inp = document.getElementById('panelDate');
    if (!inp) return;
    inp.addEventListener('change', function() {
      if (!inp.value) return;
      state.selectedDate = parseDateKey(inp.value);
      // Suggest first unused type for the new date
      var dayEntries = getDateEntries(inp.value);
      var used = {};
      for (var ui = 0; ui < dayEntries.length; ui++) used[dayEntries[ui].type] = true;
      var nextT = 'ot'; var allTp = ['ot','vac','sick','fsick','pl','comp','hcomp','fmla','block'];
      for (var ni = 0; ni < allTp.length; ni++) { if (!used[allTp[ni]]) { nextT = allTp[ni]; break; } }
      state.editType = nextT;
      state.editHours = '0';
      renderPanel();
      setTimeout(initAllPickers, 0);
    });
  }

  function bindInputFocusSelect() {
    document.querySelectorAll('.setting-input, .hours-input').forEach(function(inp) {
      if (!inp._fs) { inp._fs = true; inp.addEventListener('focus', function() { inp.select(); }); }
    });
  }

  function bindPanelFocusScroll() {
    var panel = document.querySelector('.panel');
    if (!panel) return;
    panel.querySelectorAll('input').forEach(function(inp) {
      inp.addEventListener('focus', function() {
        setTimeout(function() { try { inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e){} }, 300);
      });
    });
  }

  function renderAddProjection() {
    if (state.addType === 'block') return '<div id="addProjection"></div>';
    var hours = parseFloat(state.addHours) || 0;
    if (hours <= 0) return '<div id="addProjection"></div>';

    // For range mode, sum hours across all days for the projection check
    var dayCount = 1;
    if (state.addMode === 'range') {
      var s = parseDateKey(state.addDateStart);
      var e = parseDateKey(state.addDateEnd);
      dayCount = Math.max(1, daysBetween(s, e) + 1);
    }
    var totalHours = hours * dayCount;

    var result = checkEntry(state.addType, totalHours, state.addDateStart, state.addType === 'fmla' ? getFmlaContext(false) : null);
    var cls = result.blocks.length ? 'danger' : result.warns.length ? 'warn' : 'ok';
    var html = '<div id="addProjection" class="projection ' + cls + '">';
    for (var i = 0; i < result.blocks.length; i++) html += '<span class="projection-line"><strong>BLOCKED:</strong> ' + escapeHtml(result.blocks[i]) + '</span>';
    for (var j = 0; j < result.warns.length; j++) html += '<span class="projection-line"><strong>Warning:</strong> ' + escapeHtml(result.warns[j]) + '</span>';
    for (var k = 0; k < result.info.length; k++) html += '<span class="projection-line">' + escapeHtml(result.info[k]) + '</span>';
    html += '</div>';
    return html;
  }

  function renderAddEntryCard() {
    var html = '<div class="card card-lg card-mb">';
    html += '<div class="label mb-2">Add Entry</div>';
    html += '<div class="toggle-row">';
    html += '<button class="toggle-btn ' + (state.addMode === 'single' ? 'active' : '') + '" data-action="add-mode" data-mode="single">Single Day</button>';
    html += '<button class="toggle-btn ' + (state.addMode === 'range' ? 'active' : '') + '" data-action="add-mode" data-mode="range">Date Range</button>';
    html += '</div>';
    if (state.addMode === 'single') {
      html += '<input class="date-input" type="date" id="addDateStart" value="' + escapeHtml(state.addDateStart) + '">';
    } else {
      html += '<div class="date-pair">';
      html += '<input class="date-input" type="date" id="addDateStart" value="' + escapeHtml(state.addDateStart) + '">';
      html += '<input class="date-input" type="date" id="addDateEnd" value="' + escapeHtml(state.addDateEnd) + '">';
      html += '</div>';
    }
    html += renderTypeChips(state.addType, true, 'add-type', true);
    if (state.addType !== 'block') {
      if (state.addType === 'fmla') html += renderFmlaControls('add', state.addFmlaReason, state.addFmlaCharge);
      html += '<input type="hidden" id="addHours" value="' + escapeHtml(state.addHours) + '">';
      html += renderHoursPicker('add', state.addHours);
      html += '<div id="addProjectionWrap">' + renderAddProjection() + '</div>';
    }
    html += '<button class="btn-primary" data-action="add-save">Save Entry</button>';
    html += '<button class="btn" data-action="open-day-edit" style="width:100%;margin-top:8px;background:var(--input-bg);border:1px solid var(--input-border);color:var(--text)">Open Day to Edit</button>';
    html += '</div>';
    return html;
  }

  function renderEditProjection() {
    if (!state.selectedDate) return '<div id="editProjection"></div>';
    if (state.editType === 'block') return '<div id="editProjection"></div>';
    var hrs = parseFloat(state.editHours) || 0;
    if (hrs <= 0) return '<div id="editProjection"></div>';
    var key = formatDateKey(state.selectedDate);
    var r = checkEntry(state.editType, hrs, key, state.editType === 'fmla' ? getFmlaContext(true) : null);
    var cls = r.blocks.length ? 'danger' : r.warns.length ? 'warn' : 'ok';
    var html = '<div id="editProjection" class="projection ' + cls + '">';
    for (var i = 0; i < r.blocks.length; i++) html += '<span class="projection-line"><strong>BLOCKED:</strong> ' + escapeHtml(r.blocks[i]) + '</span>';
    for (var jj = 0; jj < r.warns.length; jj++) html += '<span class="projection-line"><strong>Warning:</strong> ' + escapeHtml(r.warns[jj]) + '</span>';
    for (var kk = 0; kk < r.info.length; kk++) html += '<span class="projection-line">' + escapeHtml(r.info[kk]) + '</span>';
    html += '</div>';
    return html;
  }

  // === Render Home ===
  function renderHome() {
    var vacLeft = calcVacationLeft(0);
    var sickLeft = calcSickLeft(0);
    var compLeft = calcCompLeft(0);
    var hcompLeft = calcHolidayCompLeft(0);
    var fsickUsed = calcFamilySickDaysUsed(0);
    var fsickLeft = FAMILY_SICK_CAP_DAYS - fsickUsed;
    var plUsed = calcPLDaysUsed(0);
    var plLeft = PL_CAP_DAYS - plUsed;
    var qCounts = getOccasionsByQuarter();
    var currQ = getQuarterIndex(new Date());

    var html = '<div class="home-grid"><div class="home-col-left">';

    // Status alerts
    html += renderStatusAlerts();

    // Add Entry card
    html += '<div id="addEntryCard">' + renderAddEntryCard() + '</div>';
    html += '</div><div class="home-col-right">';

    // Period card
    var progress = getPeriodProgress();
    html += '<div class="period-card">';
    html += '<div class="label mb-1">Current Pay Period</div>';
    html += '<div class="period-head"><div class="period-range">' + formatPeriodRange(state.activePeriod) + '</div>';
    html += '<div class="nav-row">';
    html += '<button class="small-btn" data-action="prev-period">' + icons.chevLeft + '</button>';
    html += '<button class="small-btn" data-action="next-period">' + icons.chevRight + '</button>';
    html += '</div></div>';
    html += '<div style="display:flex;align-items:baseline;gap:8px"><div class="big-num">' + getCurrentPeriodOT().toFixed(1) + '</div><div class="big-unit">OT hrs</div></div>';
    html += '<div class="text-sm muted mt-1">Day ' + progress + ' of 14</div>';
    html += '<div class="progress-track"><div class="progress-fill" style="width:' + ((progress / 14) * 100) + '%"></div></div>';
    html += '</div>';

    // Banks
    html += '<div class="banks-grid">';
    html += bankCard('Vacation Available', 'vac', vacLeft, 'hrs', (vacLeft / WD()).toFixed(1) + ' days left', vacLeft <= 0, vacLeft < WD() * 2, Math.max(vacLeft, state.settings.vacationRemaining || 1));
    html += bankCard('Sick Available', 'sick', sickLeft, 'hrs', (sickLeft / WD()).toFixed(1) + ' days left', sickLeft <= 0, sickLeft < WD() * 2, Math.max(sickLeft, state.settings.sickRemaining || 1));
    html += bankCard('Regular Comp', 'comp', compLeft, 'hrs', 'manual bank', compLeft <= 0, compLeft < WD(), Math.max(compLeft, state.settings.compRemaining || 1));
    html += bankCard('Holiday Comp', 'hcomp', hcompLeft, 'hrs', 'manual bank', hcompLeft <= 0, hcompLeft < WD(), Math.max(hcompLeft, state.settings.hcompRemaining || 1));
    var fsickD = bankDayDisplay(fsickLeft, FAMILY_SICK_CAP_DAYS, '10 days');
    html += bankCard('Family Sick', 'fsick', fsickD.value, fsickD.unit, fsickD.sub, fsickLeft <= 0, fsickLeft <= 2, fsickD.maxVal, fsickD.bigOverride);
    var plD = bankDayDisplay(plLeft, PL_CAP_DAYS, '3 days');
    html += bankCard('PL', 'pl', plD.value, plD.unit, plD.sub, plLeft <= 0, plLeft <= 1, plD.maxVal, plD.bigOverride);
    if (state.settings.fmlaEnabled) {
      var fmlaPeriodsList = getFmlaPeriods();
      var fmlaTotal = getFmlaTotalHours();
      for (var fpi = 0; fpi < fmlaPeriodsList.length; fpi++) {
        var fp = fmlaPeriodsList[fpi];
        if (!fp.startDate) continue;
        var fpLeft = getFmlaPeriodHoursLeft(fp);
        var fpUsed = getFmlaPeriodHoursUsed(fp);
        var fpColor = getFmlaPeriodColor(fp);
        var fpLabel = (fp.label || ('FMLA P' + (fpi+1)));
        var fpWeeksLeft = fpLeft / 5 / WD();
        var fpBar = '<div style="margin-top:6px;height:5px;border-radius:3px;background:var(--border)"><div style="height:5px;border-radius:3px;background:' + fpColor + ';width:' + Math.max(0,Math.min(100,fpUsed/fmlaTotal*100)).toFixed(1) + '%"></div></div>';
        html += '<div class="bank-card ' + (fpLeft <= 0 ? 'warn' : fpLeft < WD()*5*2 ? 'warn' : '') + '" style="border-color:' + fpColor + '30">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div class="bank-label">' + fpLabel + '</div>';
        html += '<div style="font-size:22px;font-weight:700;color:' + fpColor + '">' + fpWeeksLeft.toFixed(1) + '<span style="font-size:11px;font-weight:500;opacity:.7"> wks</span></div>';
        html += '</div>';
        html += '<div class="bank-sub">' + fpLeft.toFixed(1) + ' hrs of ' + fmlaTotal.toFixed(0) + ' left</div>';
        html += fpBar;
        html += '</div>';
      }
    }
    html += '</div>';

    // Occasions card (full-width)
    html += '<div class="card card-mb">';
    html += '<div class="flex-between mb-2"><div class="label">Sick Occasions This Year</div>';
    var totalOcc = qCounts.reduce(function(a, b) { return a + b; }, 0);
    html += '<div class="num" style="font-size:13px;font-weight:600;color:var(--period)">' + totalOcc + ' of 4 used</div></div>';
    html += '<div class="quarter-strip" style="margin-bottom:0">';
    for (var q = 0; q < 4; q++) {
      var cls = 'q-pill';
      if (q === currQ) cls += ' active';
      if (qCounts[q] > 0) cls += ' used';
      var allowed = 1;
      html += '<div class="' + cls + '"><div class="q-name">' + getQuarterName(q) + '</div><div class="q-count">' + qCounts[q] + '</div><div class="q-sub">of ' + allowed + '</div></div>';
    }
    html += '</div></div>';

    // Month preview
    html += renderMonthPreview();

    // Backup section
    html += renderBackupSection();

    html += '</div></div>';
    return html;
  }

  function chipDayHr(daysLeft) {
    // Compact chip text: days normally, flip to clock+hours when under one workday.
    if (daysLeft > 0 && daysLeft < 1) { return '🕐 ' + fmtHM(daysLeft * WD()); }
    return daysLeft.toFixed(1) + ' days';
  }

  function bankDayDisplay(daysLeft, capDays, capLabel) {
    // Under one workday: flip to hours with clock icon. Otherwise show days.
    var hoursLeft = daysLeft * WD();
    if (daysLeft > 0 && daysLeft < 1) {
      // bigOverride renders the clock + hours directly so it reads "🕐 2h left" with no stray decimal
      return { value: hoursLeft, unit: '', sub: 'under a day', maxVal: capDays * WD(), bigOverride: '🕐 ' + fmtHM(hoursLeft) + ' <span style="font-size:13px;font-weight:500;color:var(--muted)">left</span>' };
    }
    return { value: daysLeft, unit: 'days', sub: hoursLeft.toFixed(1) + ' hrs of ' + capLabel, maxVal: capDays };
  }

  function bankCard(label, kind, value, unit, sub, empty, low, maxVal, bigOverride) {
    var cls = 'bank-card bank-' + kind + (empty ? ' empty' : low ? ' low' : '');
    var barColor = empty ? 'var(--danger)' : low ? 'var(--warn)' : 'var(--' + kind + ')';
    var pct = (maxVal && maxVal > 0) ? Math.max(0, Math.min(100, (value / maxVal) * 100)).toFixed(1) : 0;
    var bar = maxVal ? '<div class="progress-track" style="height:4px;margin-top:6px"><div class="progress-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' : '';
    var bigHtml = bigOverride ? bigOverride : (value.toFixed(1) + ' <span style="font-size:13px;font-weight:500;color:var(--muted)">' + unit + '</span>');
    return '<div class="' + cls + '"><div class="bank-label">' + label + '</div><div class="bank-num">' + bigHtml + '</div><div class="bank-sub">' + escapeHtml(sub) + '</div>' + bar + '</div>';
  }

  function getCurrentPeriodOT() {
    var sum = 0;
    for (var k in state.data) {
      if (getPayPeriod(parseDateKey(k)) !== state.activePeriod) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        var e = dayEntries[di];
        if (e && e.type === 'ot' && typeof e.hours === 'number') sum += e.hours;
      }
    }
    return sum;
  }
  function getPeriodProgress() {
    var start = getPeriodStart(state.activePeriod);
    var diff = Math.floor((new Date() - start) / MS_PER_DAY) + 1;
    return Math.max(0, Math.min(14, diff));
  }

  function renderMonthPreview() {
    var html = '<div class="card card-mb">';
    html += '<div class="label mb-2">Upcoming & Recent</div>';
    html += '<div class="view-toggle">';
    html += '<button class="view-toggle-btn ' + (state.previewMode === 'month' ? 'active' : '') + '" data-action="preview-mode" data-mode="month">By Month</button>';
    html += '<button class="view-toggle-btn ' + (state.previewMode === 'period' ? 'active' : '') + '" data-action="preview-mode" data-mode="period">By Pay Period</button>';
    html += '</div>';
    html += '<div class="month-head">';
    html += '<button class="small-btn" data-action="preview-prev">' + icons.chevLeft + '</button>';
    var titleText, entries;
    if (state.previewMode === 'month') {
      titleText = state.previewMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      var ms = state.previewMonth.getFullYear(), mmo = state.previewMonth.getMonth();
      entries = collectEntries(function(d) { return d.getFullYear() === ms && d.getMonth() === mmo; });
    } else {
      titleText = formatPeriodRange(state.previewPeriod);
      var ps = getPeriodStart(state.previewPeriod), pe = getPeriodEnd(state.previewPeriod);
      entries = collectEntries(function(d) { return d >= ps && d <= pe; });
    }
    html += '<div class="month-title">' + titleText + '</div>';
    html += '<button class="small-btn" data-action="preview-next">' + icons.chevRight + '</button>';
    html += '</div>';
    if (entries.length === 0) {
      html += '<div class="preview-empty">No entries this ' + (state.previewMode === 'month' ? 'month' : 'period') + '</div>';
    } else {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var T = TYPES[e.entry.type];
        var dateStr = e.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        var hrsStr = e.entry.type === 'block' ? '' : (typeof e.entry.hours === 'number' ? fmtHM(e.entry.hours) : '');
        html += '<div class="preview-item" data-action="preview-tap" data-date="' + e.key + '">';
        html += '<span class="preview-tag tag-' + T.color + '">' + T.tag + '</span>';
        html += '<span class="preview-date">' + dateStr + '</span>';
        html += '<span class="preview-hrs">' + hrsStr + '</span>';
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function collectEntries(filterFn) {
    var arr = [];
    for (var k in state.data) {
      var d = parseDateKey(k);
      if (!filterFn(d)) continue;
      var dayEntries = getDateEntries(k);
      for (var di = 0; di < dayEntries.length; di++) {
        arr.push({ key: k, date: d, entry: dayEntries[di] });
      }
    }
    arr.sort(function(a, b) { return a.date - b.date; });
    return arr;
  }

  function renderBackupSection() {
    var lastBackup = state.meta.lastBackup;
    var statusText, statusCls = '';
    if (!lastBackup) {
      statusText = 'No backups yet';
      statusCls = 'warn';
    } else {
      var bd = new Date(lastBackup);
      var daysSince = Math.floor((new Date() - bd) / MS_PER_DAY);
      if (daysSince === 0) statusText = 'Last backup: today';
      else if (daysSince === 1) statusText = 'Last backup: yesterday';
      else statusText = 'Last backup: ' + daysSince + ' days ago';
      if (daysSince > 14) statusCls = 'warn';
    }
    var html = '<div class="backup-section card-mb">';
    html += '<button class="backup-toggle" data-action="toggle-backup">';
    html += '<div class="backup-toggle-left"><span style="color:var(--vac)">' + icons.db + '</span>';
    html += '<div><div class="backup-title">Backup Your Data</div><div class="backup-status ' + statusCls + '">' + statusText + '</div></div></div>';
    html += '<span style="color:var(--muted)">' + (state.backupOpen ? icons.chevUp : icons.chevDown) + '</span>';
    html += '</button>';
    if (state.backupOpen) {
      html += '<div class="backup-body">';
      html += '<div class="backup-explain">Your data lives on this device only. Export saves a backup file you can keep or share. Import restores from a saved file. Back up regularly so you do not lose your history.</div>';
      html += '<button class="backup-btn-big" data-action="export">';
      html += '<div class="backup-btn-icon">' + icons.download + '</div>';
      html += '<div class="backup-btn-main">Export Backup<div class="backup-btn-sub">Save a copy to your device</div></div>';
      html += '</button>';
      html += '<button class="backup-btn-big" data-action="import">';
      html += '<div class="backup-btn-icon imp">' + icons.upload + '</div>';
      html += '<div class="backup-btn-main">Import Backup<div class="backup-btn-sub">Restore from a saved file</div></div>';
      html += '</button>';
      // Cloud backup
      var cloudTs = window.KHub?.CloudBackup?.lastSaved('overtime-tracker');
      var cloudSub = cloudTs ? 'Last saved: ' + new Date(cloudTs).toLocaleString() : 'Not saved to cloud yet';
      html += '<button class="backup-btn-big" data-action="cloud-save">';
      html += '<div class="backup-btn-icon">☁</div>';
      html += '<div class="backup-btn-main">Save to Cloud<div class="backup-btn-sub">' + cloudSub + '</div></div>';
      html += '</button>';
      html += '<button class="backup-btn-big" data-action="cloud-restore">';
      html += '<div class="backup-btn-icon imp">☁</div>';
      html += '<div class="backup-btn-main">Restore from Cloud<div class="backup-btn-sub">Load your last cloud backup</div></div>';
      html += '</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function summaryChip(label, value, color) {
    return '<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:5px 10px;flex-shrink:0">'
      +'<div style="font-size:9px;font-weight:600;color:var(--dim);text-transform:uppercase;letter-spacing:0.08em">'+label+'</div>'
      +'<div style="font-size:13px;font-weight:700;color:'+color+';font-variant-numeric:tabular-nums;white-space:nowrap">'+value+'</div>'
      +'</div>';
  }
  function savedStatusText() {
    if (!state.meta.lastSaved) return 'Saved locally';
    var d = new Date(state.meta.lastSaved);
    if (isNaN(d.getTime())) return 'Saved locally';
    var diff = Math.max(0, Math.floor((new Date() - d) / 1000));
    if (diff < 10) return 'Saved just now';
    if (diff < 60) return 'Saved ' + diff + 's ago';
    if (diff < 3600) return 'Saved ' + Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return 'Saved ' + Math.floor(diff / 3600) + 'h ago';
    return 'Saved ' + Math.floor(diff / 86400) + 'd ago';
  }
  function renderSummaryPill() {
    var otHrs=getCurrentPeriodOT();
    var vacLeft=calcVacationLeft(0);
    var sickLeft=calcSickLeft(0);
    var compLeft=calcCompLeft(0);
    var hcompLeft=calcHolidayCompLeft(0);
    var fsickLeft=FAMILY_SICK_CAP_DAYS-calcFamilySickDaysUsed(0);
    var plLeft=PL_CAP_DAYS-calcPLDaysUsed(0);
    var html='<div class="saved-signal"><span class="saved-dot"></span><span>' + savedStatusText() + '</span></div>';
    html+='<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;padding-bottom:2px;-ms-overflow-style:none;scrollbar-width:none">';
    html+=summaryChip('OT · '+formatPeriodRange(state.activePeriod),otHrs.toFixed(1)+' hrs','var(--ot)');
    html+=summaryChip('Vacation',vacLeft.toFixed(1)+' hrs',vacLeft<=0?'var(--danger)':vacLeft<WD()*2?'var(--warn)':'var(--vac)');
    html+=summaryChip('Sick',sickLeft.toFixed(1)+' hrs',sickLeft<=0?'var(--danger)':sickLeft<WD()*2?'var(--warn)':'var(--sick)');
    html+=summaryChip('Comp',compLeft.toFixed(1)+' hrs',compLeft<=0?'var(--danger)':compLeft<WD()?'var(--warn)':'var(--comp)');
    html+=summaryChip('Holiday Comp',hcompLeft.toFixed(1)+' hrs',hcompLeft<=0?'var(--danger)':hcompLeft<WD()?'var(--warn)':'var(--hcomp)');
    html+=summaryChip('Fam Sick',chipDayHr(fsickLeft),fsickLeft<=0?'var(--danger)':fsickLeft<=2?'var(--warn)':'var(--fsick)');
    html+=summaryChip('PL',chipDayHr(plLeft),plLeft<=0?'var(--danger)':plLeft<=1?'var(--warn)':'var(--pl)');
    html+='</div>';
    return html;
  }

  // === Calendar ===
  function renderCalendar() {
    var firstDay = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth(), 1);
    var lastDay = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 0);
    var todayStr = formatDateKey(new Date());

    var html = '<div class="card card-mb-sm">';
    html += '<div class="flex-between"><div>';
    html += '<div class="label">Active Period</div>';
    html += '<div class="period-range">' + formatPeriodRange(state.activePeriod) + '</div>';
    html += '<div class="text-sm muted mt-1">' + getCurrentPeriodOT().toFixed(1) + ' OT hrs logged</div>';
    html += '</div><div class="nav-row">';
    html += '<button class="small-btn" data-action="prev-period">' + icons.chevLeft + '</button>';
    html += '<button class="small-btn" data-action="next-period">' + icons.chevRight + '</button>';
    html += '</div></div></div>';

    html += '<div class="card card-lg card-mb" id="calCard">';
    html += '<div class="cal-header">';
    html += '<button class="small-btn" data-action="prev-month">' + icons.chevLeft + '</button>';
    html += '<div class="cal-month">' + state.calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }) + '</div>';
    html += '<button class="small-btn" data-action="next-month">' + icons.chevRight + '</button>';
    html += '</div>';

    // Build explicit row arrays so we can append week-total cells
    var calRows = [[]];
    for (var bpad = 0; bpad < firstDay.getDay(); bpad++) calRows[0].push(null);
    for (var dnum = 1; dnum <= lastDay.getDate(); dnum++) {
      if (calRows[calRows.length-1].length === 7) calRows.push([]);
      calRows[calRows.length-1].push(dnum);
    }
    while (calRows[calRows.length-1].length < 7) calRows[calRows.length-1].push(null);

    // Header row — 7 day names + sigma column
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr) 26px;gap:3px;margin-bottom:6px">';
    var dayNames = ['S','M','T','W','T','F','S'];
    for (var ni = 0; ni < 7; ni++) html += '<div class="cal-day-name">' + dayNames[ni] + '</div>';
    html += '<div class="cal-day-name" style="text-align:center;font-size:8px">Σ</div>';
    html += '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:5px">';
    for (var ri = 0; ri < calRows.length; ri++) {
      var row = calRows[ri];
      var weekTotal = 0, weekHasData = false;
      html += '<div style="display:grid;grid-template-columns:repeat(7,1fr) 26px;gap:5px;align-items:start">';
      for (var ci = 0; ci < 7; ci++) {
        var d = row[ci];
        if (!d) { html += '<div></div>'; continue; }
        var date = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth(), d);
        var key = formatDateKey(date);
        var dayEntries = getDateEntries(key);
        var inActive = getPayPeriod(date) === state.activePeriod;
        var isToday = key === todayStr;
        var classes = ['cal-cell'];
        var subParts = [];
        if (dayEntries.length > 0) {
          var firstType = dayEntries[0].type;
          if (firstType === 'ot') classes.push(getPayPeriod(date) % 2 === 0 ? 'ot' : 'ot-alt');
          else if (firstType === 'fmla') { var calFmlaP = getFmlaPeriodForDateStr(key); classes.push(calFmlaP ? getFmlaPeriodCssClass(calFmlaP) : 'fmla'); }
          else classes.push(firstType);
          for (var cei = 0; cei < dayEntries.length; cei++) {
            var ce = dayEntries[cei];
            if (ce.type === 'block') subParts.push('OFF');
            else if (typeof ce.hours === 'number') { subParts.push(TYPES[ce.type].tag+':'+fmtCompact(ce.hours)); weekTotal+=ce.hours; weekHasData=true; }
          }
        }
        if (inActive) classes.push('in-period');
        if (isToday) classes.push('today');
        var subText = subParts.join('\n');
        html += '<button class="' + classes.join(' ') + '" data-action="day" data-date="' + key + '">';
        html += '<span class="cal-cell-num">' + d + '</span>';
        if (subText) html += '<span class="cal-cell-sub">' + subText + '</span>';
        html += '</button>';
      }
      html += '<div style="display:flex;align-items:center;justify-content:center;padding-top:4px;font-size:9px;font-weight:700;color:'+(weekHasData?'var(--muted)':'transparent')+'">'+(weekHasData?fmtCompact(weekTotal):'')+'</div>';
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // === Log ===
  function renderLog() {
    var filters = [
      { id: 'all', label: 'All' },
      { id: 'ot', label: 'OT' },
      { id: 'vac', label: 'Vacation' },
      { id: 'sick', label: 'Sick' },
      { id: 'fsick', label: 'Family Sick' },
      { id: 'pl', label: 'PL' },
      { id: 'comp', label: 'Comp' },
      { id: 'hcomp', label: 'Holiday Comp' },
      { id: 'fmla', label: 'FMLA' },
      { id: 'block', label: 'Blocked' }
    ];
    var html = '<div class="filter-scroll"><div class="filter-row">';
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      html += '<button class="filter-chip ' + (state.logFilter === f.id ? 'active' : '') + '" data-action="filter" data-filter="' + f.id + '">' + f.label + '</button>';
    }
    html += '</div></div>';

    var entries = collectEntries(function() { return true; });
    if (state.logFilter !== 'all') entries = entries.filter(function(e) { return e.entry.type === state.logFilter; });
    entries.sort(function(a, b) { return b.date - a.date; });

    if (entries.length === 0) {
      html += '<div class="card card-mb text-center" style="padding:28px"><div class="text-sm muted">No entries match this filter.</div></div>';
    } else {
      html += '<div class="log-list">';
      for (var j = 0; j < entries.length; j++) {
        var en = entries[j];
        var T = TYPES[en.entry.type];
        var dateStr = en.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        var valStr;
        if (en.entry.type === 'block') {
          valStr = 'OFF';
        } else {
          valStr = typeof en.entry.hours === 'number' ? fmtHM(en.entry.hours) : '';
        }
        html += '<button class="log-item" data-action="log-tap" data-date="' + en.key + '">';
        var logSubLine = formatPeriodRange(getPayPeriod(en.date));
        var logTagHtml = '<span class="preview-tag tag-' + T.color + '">' + T.tag + '</span>';
        var logValColor = 'var(--' + T.color + ')';
        if (en.entry.type === 'fmla') {
          logSubLine = formatFmlaDetail(en.entry) + ' · ' + logSubLine;
          var logFmlaP = getFmlaPeriodForDateStr(en.key);
          if (logFmlaP) {
            var logPIdx = getFmlaPeriodIndex(logFmlaP);
            var logPColor = getFmlaPeriodColor(logFmlaP);
            logSubLine = (logFmlaP.label || ('Period ' + (logPIdx+1))) + ' · ' + logSubLine;
            logTagHtml = '<span class="preview-tag" style="background:' + logPColor + '20;color:' + logPColor + '">FMLA P' + (logPIdx+1) + '</span>';
            logValColor = logPColor;
          }
        }
        html += '<div><div class="log-date">' + dateStr + '</div><div class="log-period">' + logSubLine + '</div></div>';
        html += '<div class="log-right">' + logTagHtml + '<span class="log-value" style="color:' + logValColor + '">' + valStr + '</span></div>';
        html += '</button>';
      }
      html += '</div>';
    }
    return html;
  }

  // === Settings ===
  function renderSettings() {
    var qCounts = getOccasionsByQuarter();
    var html = '<div class="card card-mb-sm" style="padding:0;overflow:hidden">';
    html += '<div class="setting-row"><div class="label">Theme</div>';
    html += '<div class="theme-row">';
    html += '<button class="theme-btn ' + (state.theme === 'dark' ? 'active' : '') + '" data-action="theme-dark">Dark</button>';
    html += '<button class="theme-btn ' + (state.theme === 'light' ? 'active' : '') + '" data-action="theme-light">Light</button>';
    html += '</div></div>';

    html += '<div class="setting-row"><div class="label">Your Name</div>';
    html += '<input class="setting-input" type="text" id="setUserName" placeholder="Enter your name" value="' + escapeHtml(state.settings.userName || 'David') + '">';
    html += '<div class="text-xs muted mt-1">Used in the greeting at the top of the app.</div></div>';

    var balInDays = state.balanceUnit === 'days';
    var balWD = state.settings.workdayHours || 7.5;
    var balUnitLabel = balInDays ? 'days' : 'hrs';
    var toBalDisplay = function(hrs) { return settingDisplay(balInDays ? hrs / balWD : hrs); };
    html += '<div class="setting-row"><div class="label">Live Bank Baseline</div>';
    html += '<div class="text-xs muted mb-2">Enter available balances as of the date below. Saving changed balances asks for confirmation and becomes the new baseline going forward. Export a backup before major changes.</div>';
    html += '<div class="flex-between mb-2">';
    html += '<span class="text-xs muted">Enter balances in:</span>';
    html += '<div style="display:flex;gap:3px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:10px;padding:3px">';
    html += '<button class="toggle-btn ' + (!balInDays ? 'active' : '') + '" data-action="balance-unit" data-unit="hours" style="padding:5px 12px;font-size:12px;border-radius:8px">Hours</button>';
    html += '<button class="toggle-btn ' + (balInDays ? 'active' : '') + '" data-action="balance-unit" data-unit="days" style="padding:5px 12px;font-size:12px;border-radius:8px">Days</button>';
    html += '</div></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    html += '<div><div class="text-xs muted mb-1">Balance as of</div><input class="date-input" type="date" id="setBalanceDate" value="' + escapeHtml(state.settings.balanceAsOfDate || formatDateKey(new Date())) + '"></div>';
    html += '<div><div class="text-xs muted mb-1">Accrual effective</div><input class="date-input" type="date" id="setAccrualDate" value="' + escapeHtml(state.settings.accrualEffectiveDate || state.settings.balanceAsOfDate || formatDateKey(new Date())) + '"></div>';
    html += '<div><div class="text-xs muted mb-1">Vacation Available (' + balUnitLabel + ')</div>' + numPadBtn('setVac', toBalDisplay(state.settings.vacationRemaining), balUnitLabel) + '</div>';
    html += '<div><div class="text-xs muted mb-1">Sick Available (' + balUnitLabel + ')</div>' + numPadBtn('setSick', toBalDisplay(state.settings.sickRemaining), balUnitLabel) + '</div>';
    html += '<div><div class="text-xs muted mb-1">Regular Comp Available (' + balUnitLabel + ')</div>' + numPadBtn('setComp', toBalDisplay(state.settings.compRemaining), balUnitLabel) + '</div>';
    html += '<div><div class="text-xs muted mb-1">Holiday Comp Available (' + balUnitLabel + ')</div>' + numPadBtn('setHComp', toBalDisplay(state.settings.hcompRemaining), balUnitLabel) + '</div>';
    html += '<div><div class="text-xs muted mb-1">Monthly Vacation Accrual (' + balUnitLabel + ')</div>' + numPadBtn('setVacAccrual', toBalDisplay(state.settings.vacationMonthlyAccrual), balUnitLabel) + '</div>';
    html += '<div><div class="text-xs muted mb-1">Monthly Sick Accrual (' + balUnitLabel + ')</div>' + numPadBtn('setSickAccrual', toBalDisplay(state.settings.sickMonthlyAccrual), balUnitLabel) + '</div>';
    html += '</div>' + (balInDays ? '<div class="text-xs muted mt-1">Values shown in days (' + balWD + ' hrs = 1 day). App stores and displays balances in hours.</div>' : '') + '</div>';
    // Monthly accrual note + manual trigger button
    html += '<div class="text-xs muted" style="margin-top:6px;margin-bottom:8px">Monthly earned hours are automatically added on the 1st of each month.</div>';
    html += '<button class="small-btn" style="font-size:12px;padding:7px 14px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:10px;color:var(--text);cursor:pointer;width:100%" data-action="apply-accrual">Apply Monthly Accrual</button>';

    var snapInHours = state.snapshotUnit === 'hours';
    var fsickDisplayVal = settingDisplay(snapInHours ? state.settings.familySickUsedDays * WD() : state.settings.familySickUsedDays);
    var plDisplayVal = settingDisplay(snapInHours ? state.settings.plUsedDays * WD() : state.settings.plUsedDays);
    var snapUnitLabel = snapInHours ? 'hrs' : 'days';
    var fsickMax = snapInHours ? (10 * WD()) : 10;
    var plMax = snapInHours ? (3 * WD()) : 3;
    html += '<div class="setting-row">';
    html += '<div class="flex-between mb-2"><div class="label">Snapshot: Already Used</div>';
    html += '<div style="display:flex;gap:3px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:10px;padding:3px">';
    html += '<button class="toggle-btn ' + (snapInHours ? 'active' : '') + '" data-action="snap-unit" data-unit="hours" style="padding:5px 12px;font-size:12px;border-radius:8px">Hours</button>';
    html += '<button class="toggle-btn ' + (!snapInHours ? 'active' : '') + '" data-action="snap-unit" data-unit="days" style="padding:5px 12px;font-size:12px;border-radius:8px">Days</button>';
    html += '</div></div>';
    html += '<div class="text-xs muted mb-2">Family sick and PL used this year. Toggle Days/Hours to match whatever your records show — the app converts automatically (' + WD() + ' hrs = 1 day).</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    html += '<div><div class="text-xs muted mb-1">Family sick ' + snapUnitLabel + ' used</div>' + numPadBtn('setFsick', fsickDisplayVal, snapUnitLabel, fsickMax) + '</div>';
    html += '<div><div class="text-xs muted mb-1">PL ' + snapUnitLabel + ' used</div>' + numPadBtn('setPL', plDisplayVal, snapUnitLabel, plMax) + '</div>';
    html += '</div></div>';

    html += '<div class="setting-row"><div class="label">Snapshot: Occasions Used This Year</div>';
    html += '<div class="text-xs muted mb-2">Tap a quarter to toggle whether the occasion has been used.</div>';
    html += '<div class="occ-grid">';
    for (var q = 0; q < 4; q++) {
      var setCls = state.settings.manualOccasions[q] > 0 ? ' set' : '';
      html += '<div class="occ-box' + setCls + '" data-action="toggle-occ" data-q="' + q + '"><div class="occ-box-q">Q' + (q + 1) + ' ' + getQuarterName(q) + '</div><div class="occ-box-v">' + (state.settings.manualOccasions[q] || 0) + '</div></div>';
    }
    html += '</div>';
    html += '<div class="text-xs muted mt-2">Dated sick entries automatically count too. Current quarter totals: ' + qCounts.join(', ') + '</div>';
    html += '</div>';

    html += '<div class="setting-row"><div class="label">Workday Hours</div>';
    html += numPadBtn('setWorkday', state.settings.workdayHours, 'hrs');
    html += '<div class="text-xs muted mt-1">Default 7.5 (7am-3pm minus 30 min lunch)</div></div>';

    html += '<div class="setting-row">';
    html += '<div class="flex-between mb-2"><div class="label">FMLA Tracking</div>';
    html += '<div style="display:flex;gap:3px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:10px;padding:3px">';
    html += '<button class="toggle-btn ' + (!state.settings.fmlaEnabled ? 'active' : '') + '" data-action="fmla-toggle" data-val="off" style="padding:5px 12px;font-size:12px;border-radius:8px">Off</button>';
    html += '<button class="toggle-btn ' + (state.settings.fmlaEnabled ? 'active' : '') + '" data-action="fmla-toggle" data-val="on" style="padding:5px 12px;font-size:12px;border-radius:8px' + (state.settings.fmlaEnabled ? ';background:var(--fmla);color:white' : '') + '">On</button>';
    html += '</div></div>';
    html += '<div class="text-xs muted mb-2">Federal & CT FMLA: 12 weeks per authorization of job-protected leave. CT uses <em>Measure Forward</em> — each period starts from the first day taken under that certification. A new doctor renewal starts a new 12-week period.</div>';
    if (state.settings.fmlaEnabled) {
      var settingsPeriods = getFmlaPeriods();
      var fmlaTotal = getFmlaTotalHours();
      if (settingsPeriods.length === 0) {
        html += '<div class="text-xs muted mt-2" style="color:var(--warn)">Add at least one FMLA period below.</div>';
      }
      for (var spi = 0; spi < settingsPeriods.length; spi++) {
        var sp = settingsPeriods[spi];
        var spColor = FMLA_PERIOD_COLORS[spi % FMLA_PERIOD_COLORS.length];
        var spUsed = getFmlaPeriodHoursUsed(sp);
        var spLeft = getFmlaPeriodHoursLeft(sp);
        var spEnd = sp.startDate ? (function(){ var sd = parseDateKey(sp.startDate); return new Date(sd.getFullYear()+1, sd.getMonth(), sd.getDate()-1); })() : null;
        var spCls = spLeft <= 0 ? 'danger' : spLeft < WD() * 5 * 2 ? 'warn' : 'ok';
        html += '<div style="border:1px solid ' + spColor + '40;border-radius:12px;padding:12px;margin-top:10px;background:' + spColor + '08">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
        html += '<div style="width:12px;height:12px;border-radius:50%;background:' + spColor + ';flex-shrink:0"></div>';
        html += '<input style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);font-size:16px;font-weight:600;padding:2px 0" id="fmla-plabel-' + sp.id + '" value="' + escapeHtml(sp.label || ('Period ' + (spi+1))) + '" placeholder="Period name">';
        if (settingsPeriods.length > 1) html += '<button class="small-btn" data-action="delete-fmla-period" data-period-id="' + sp.id + '" style="color:var(--danger);font-size:11px">✕ Remove</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
        html += '<div><div class="text-xs muted mb-1">Start date (first day taken)</div><input class="date-input" type="date" id="fmla-pstart-' + sp.id + '" value="' + escapeHtml(sp.startDate || '') + '"></div>';
        html += '<div><div class="text-xs muted mb-1">Hrs used before app</div><input class="setting-input" type="number" onfocus="this.select()" step="0.25" min="0" inputmode="decimal" id="fmla-psnap-' + sp.id + '" value="' + (sp.snapshotHours || 0) + '"></div>';
        html += '</div>';
        if (sp.startDate) {
          html += '<div class="projection ' + spCls + ' mt-2">';
          html += '<span class="projection-line">Used: <strong>' + spUsed.toFixed(1) + ' hrs</strong> (' + (spUsed/WD()/5).toFixed(1) + ' of 12 wks)</span>';
          html += '<span class="projection-line">Remaining: <strong>' + spLeft.toFixed(1) + ' hrs</strong> (' + (spLeft/WD()/5).toFixed(1) + ' wks)</span>';
          html += '<span class="projection-line">12-month window ends: ' + (spEnd ? spEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—') + '</span>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '<button class="btn-primary" data-action="add-fmla-period" style="margin-top:10px;background:transparent;border:1px dashed var(--fmla);color:var(--fmla);font-size:13px">+ Add New FMLA Period</button>';
      html += '<div class="text-xs muted mt-2" style="border-top:1px solid var(--border);padding-top:8px"><strong>CT withdrawal order:</strong> Sick bank first → Vacation after sick exhausted → Unpaid if both depleted. Each period gets a different color in the calendar and log.</div>';
    }
    html += '</div>';
    html += '<div class="setting-row"><div class="label">Reset Dates</div>';
    html += '<div class="text-sm mt-1">January 1: Family Sick (10 days), PL (3 days)</div>';
    html += '<div class="text-sm">September 1: Sick Occasions (1 per quarter)</div></div>';

    html += '<div class="setting-row"><button class="btn-primary" data-action="save-settings">Save Settings</button></div>';
    html += '</div>';

    html += '<div class="card card-mb"><div class="label mb-1">About</div><div class="text-sm">Time Tracker v3</div><div class="text-xs muted mt-1">Local-only. Your data stays on this device. Export regularly.</div></div>';
    return html;
  }

  function renderNav() {
    var items = [
      { id: 'home', label: 'HOME', icon: icons.home },
      { id: 'calendar', label: 'CALENDAR', icon: icons.calendar },
      { id: 'log', label: 'LOG', icon: icons.list }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var active = state.tab === it.id ? ' active' : '';
      html += '<button class="nav-btn' + active + '" data-action="tab" data-tab="' + it.id + '">';
      html += '<div class="nav-icon-wrap">' + it.icon + '</div>';
      html += '<span class="nav-label">' + it.label + '</span></button>';
    }
    document.getElementById('nav').innerHTML = html;
  }

  function renderPanel() {
    var el = document.getElementById('panel');
    if (!state.selectedDate) { el.innerHTML = ''; return; }
    var key = formatDateKey(state.selectedDate);
    var dayEntries = getDateEntries(key);
    var dateStr = state.selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

    var html = '<div class="panel-backdrop" data-action="close-panel">';
    html += '<div class="panel" data-stop="1">';
    html += '<button class="back-btn" data-action="close-panel">' + icons.chevLeft + ' Done</button>';
    html += '<div class="panel-head"><div><div class="label">Entry</div><div class="panel-date">' + escapeHtml(dateStr) + '</div></div>';
    html += '<button class="small-btn" data-action="close-panel">' + icons.x + '</button>';
    html += '</div>';
    html += '<input class="date-input" type="date" id="panelDate" value="' + key + '" style="margin-bottom:12px">';

    // ── Existing entries list ──
    if (dayEntries.length > 0) {
      html += '<div class="label mb-2">This Day\'s Entries</div>';
      for (var pei = 0; pei < dayEntries.length; pei++) {
        var de = dayEntries[pei];
        var DT = TYPES[de.type] || { label: de.type, color: 'muted', name: de.type };
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:12px;padding:10px 12px">';
        html += '<span class="preview-tag tag-' + DT.color + '">' + DT.label + '</span>';
        if (de.type === 'block') {
          html += '<span style="flex:1;font-size:14px;font-weight:600">Day Off</span>';
        } else if (de.type === 'fmla') {
          var fmlaDesc = fmtHM(de.hours);
          var unpaidAmt = de.hours - (de.sickCharge || 0) - (de.vacCharge || 0);
          if (de.sickCharge > 0) fmlaDesc += ' · S:' + fmtHM(de.sickCharge);
          if (de.vacCharge > 0) fmlaDesc += ' · V:' + fmtHM(de.vacCharge);
          if (unpaidAmt > 0.01) fmlaDesc += ' · Unpaid:' + fmtHM(unpaidAmt);
          html += '<span style="flex:1;font-size:13px;font-weight:600">' + formatFmlaDetail(de) + '</span>';
          html += '<button class="small-btn" data-action="edit-entry-time" data-entry-type="' + de.type + '" title="Edit hours">⏱</button>';
        } else {
          html += '<span style="flex:1;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums">' + fmtHM(de.hours) + '</span>';
          html += '<button class="small-btn" data-action="edit-entry-time" data-entry-type="' + de.type + '" title="Edit hours">⏱</button>';
        }
        html += '<button class="small-btn" style="color:var(--danger)" data-action="delete-entry" data-entry-type="' + de.type + '">' + icons.trash + '</button>';
        html += '</div>';
      }
    }

    // ── Add entry form ──
    var addLabel = dayEntries.length > 0 ? 'Add Another Entry' : 'Add Entry';
    html += '<div style="border-top:1px solid var(--border);margin-top:' + (dayEntries.length > 0 ? '12' : '0') + 'px;padding-top:' + (dayEntries.length > 0 ? '12' : '0') + 'px">';
    html += '<div class="label mb-2">' + addLabel + '</div>';
    html += renderTypeChips(state.editType, true, 'edit-type', true);
    if (state.editType !== 'block') {
      if (state.editType === 'fmla') html += renderFmlaControls('edit', state.editFmlaReason, state.editFmlaCharge);
      html += '<input type="hidden" id="editHours" value="' + escapeHtml(state.editHours) + '">';
      html += renderHoursPicker('edit', state.editHours);
      html += '<div id="editProjectionWrap">' + renderEditProjection() + '</div>';
    }
    html += '<button class="btn-primary" data-action="panel-add-save">' + (dayEntries.length > 0 ? 'Add to Day' : 'Save Entry') + '</button>';
    html += '</div>';

    html += '</div></div>';
    el.innerHTML = html;
    setTimeout(function() { initAllPickers(); bindPanelDateInput(); bindPanelFocusScroll(); bindPanelSwipe(); }, 0);
  }

  function bindPanelSwipe() {
    var panel = document.querySelector('.panel');
    if (!panel || panel._sw) return;
    panel._sw = true;
    var startY, dragging;
    panel.addEventListener('touchstart', function(e) { startY = e.touches[0].clientY; dragging = true; }, { passive: true });
    panel.addEventListener('touchmove', function(e) {
      if (!dragging) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0) { panel.style.transform = 'translateY('+Math.min(dy,200)+'px)'; panel.style.transition = 'none'; }
    }, { passive: true });
    panel.addEventListener('touchend', function(e) {
      if (!dragging) return; dragging = false;
      var dy = e.changedTouches[0].clientY - startY;
      panel.style.transform = ''; panel.style.transition = '';
      if (dy > 80) { haptic('light'); state.selectedDate = null; renderPanel(); render(); }
    }, { passive: true });
  }

  function render() {
    try {
      var content = document.getElementById('content');
      var pill = state.tab !== 'settings' ? renderSummaryPill() : '';
      if (state.tab === 'home') content.innerHTML = pill + renderHome();
      else if (state.tab === 'calendar') content.innerHTML = pill + renderCalendar();
      else if (state.tab === 'log') content.innerHTML = pill + renderLog();
      else if (state.tab === 'settings') content.innerHTML = renderSettings();
      renderNav();
      renderPanel();
      setTimeout(function() { initAllPickers(); bindInputFocusSelect(); bindCalendarSwipe(); if (state.tab === 'settings') bindLiveSettingInputs(); }, 0);
    } catch (err) {
      console.error('Render error:', err);
      try { showToast('Display error: ' + err.message, 'error'); } catch (e) {}
    }
  }

  // === Actions ===
  function handleAction(action, el) {
    try {
    if (action === 'tab') { haptic('light'); state.tab = el.getAttribute('data-tab'); state.selectedDate = null; render(); }
    else if (action === 'prev-period') { haptic('light'); state.activePeriod--; render(); }
    else if (action === 'next-period') { haptic('light'); state.activePeriod++; render(); }
    else if (action === 'prev-month') { haptic('light'); state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1); render(); }
    else if (action === 'next-month') { haptic('light'); state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1); render(); }
    else if (action === 'preview-mode') { haptic('light'); state.previewMode = el.getAttribute('data-mode'); render(); }
    else if (action === 'preview-prev') {
      haptic('light');
      if (state.previewMode === 'month') state.previewMonth = new Date(state.previewMonth.getFullYear(), state.previewMonth.getMonth() - 1);
      else state.previewPeriod--;
      render();
    }
    else if (action === 'preview-next') {
      haptic('light');
      if (state.previewMode === 'month') state.previewMonth = new Date(state.previewMonth.getFullYear(), state.previewMonth.getMonth() + 1);
      else state.previewPeriod++;
      render();
    }
    else if (action === 'preview-tap' || action === 'day' || action === 'log-tap') {
      haptic('light'); openEditPanel(el.getAttribute('data-date'));
    }
    else if (action === 'close-panel') { state.selectedDate = null; renderPanel(); }
    else if (action === 'edit-type') {
      haptic('light');
      state.editType = el.getAttribute('data-type');
      state.editHours = '0';
      if (state.editType === 'fmla' && !state.editFmlaReason) { state.editFmlaReason = 'self'; state.editFmlaCharge = 'vac'; }
      renderPanel(); setTimeout(function() { initAllPickers(); bindPanelDateInput(); }, 0);
    }
    else if (action === 'panel-add-save') { doPanelAddSave(); }
    else if (action === 'edit-entry-time') {
      haptic('light');
      var entryType = el.getAttribute('data-entry-type');
      var eetKey = formatDateKey(state.selectedDate);
      var eetEntries = getDateEntries(eetKey);
      var curHours = 0;
      for (var ei2 = 0; ei2 < eetEntries.length; ei2++) { if (eetEntries[ei2].type === entryType) { curHours = eetEntries[ei2].hours || 0; break; } }
      var curHr = Math.floor(curHours), curMn = Math.round((curHours - curHr) * 60);
      showTimePicker(curHr, curMn, function(v) {
        var e2 = getDateEntries(eetKey);
        for (var j = 0; j < e2.length; j++) { if (e2[j].type === entryType) { e2[j].hours = v; break; } }
        setDateEntries(eetKey, e2);
        saveData(); showToast('Updated'); render(); renderPanel();
      });
    }
    else if (action === 'delete-entry') {
      haptic('medium');
      var delType = el.getAttribute('data-entry-type');
      var delKey = formatDateKey(state.selectedDate);
      var prevDel=getDateEntries(delKey).slice();
      var remaining=prevDel.filter(function(e){return e.type!==delType;});
      setDateEntries(delKey,remaining);
      saveData();
      var _dk=delKey,_dp=prevDel;
      showToast('Deleted',null,function(){setDateEntries(_dk,_dp);saveData();showToast('Undone');render();renderPanel();});
      render();renderPanel();
    }
    else if (action === 'edit-delete') {
      // Legacy: delete all entries for this date
      var dk = formatDateKey(state.selectedDate);
      setDateEntries(dk, []);
      saveData(); haptic('medium'); showToast('All entries deleted'); state.selectedDate = null; render();
    }
    else if (action === 'add-mode') {
      haptic('light');
      state.addMode = el.getAttribute('data-mode');
      var amCard = document.getElementById('addEntryCard');
      if (amCard) { amCard.innerHTML = renderAddEntryCard(); setTimeout(initAllPickers, 0); }
    }
    else if (action === 'add-type') {
      haptic('light');
      state.addType = el.getAttribute('data-type');
      state.addHours = '0';
      if (state.addType === 'fmla' && !state.addFmlaReason) { state.addFmlaReason = 'self'; state.addFmlaCharge = 'vac'; }
      var atCard = document.getElementById('addEntryCard');
      if (atCard) { atCard.innerHTML = renderAddEntryCard(); setTimeout(initAllPickers, 0); }
    }
    else if (action === 'fmla-reason') {
      haptic('light');
      var fpfx = el.getAttribute('data-prefix');
      var fval = el.getAttribute('data-val');
      if (fpfx === 'edit') {
        state.editFmlaReason = fval;
        if (fval !== 'spouse') state.editFmlaCharge = 'vac';
      } else {
        state.addFmlaReason = fval;
        if (fval !== 'spouse') state.addFmlaCharge = 'vac';
      }
      if (fpfx === 'edit') renderPanel();
      else { var fc = document.getElementById('addEntryCard'); if (fc) fc.innerHTML = renderAddEntryCard(); }
    }
    else if (action === 'fmla-charge') {
      haptic('light');
      var cpfx = el.getAttribute('data-prefix');
      if (cpfx === 'edit') { state.editFmlaCharge = el.getAttribute('data-val'); renderPanel(); }
      else { state.addFmlaCharge = el.getAttribute('data-val'); var cc = document.getElementById('addEntryCard'); if (cc) cc.innerHTML = renderAddEntryCard(); }
    }
    else if (action === 'add-quick') {
      haptic('light');
      state.addHours = el.getAttribute('data-val');
      try {
        var ahi = document.getElementById('addHours');
        if (ahi) ahi.value = state.addHours;
        var aProj = document.getElementById('addProjectionWrap');
        if (aProj) aProj.innerHTML = renderAddProjection();
      } catch (err) {}
    }
    else if (action === 'open-time-picker') {
      haptic('light');
      var sfx = el.getAttribute('data-suffix');
      var curV = parseFloat(sfx === 'add' ? state.addHours : state.editHours) || 0;
      var curHr = Math.floor(curV), curMn = Math.round((curV - curHr) * 60);
      showTimePicker(curHr, curMn, function(v) {
        var btn2 = document.getElementById('tpbtn-' + sfx);
        var hi2  = document.getElementById(sfx === 'add' ? 'addHours' : 'editHours');
        if (sfx === 'add') state.addHours = String(v);
        else               state.editHours = String(v);
        if (hi2)  hi2.value = String(v);
        if (btn2) btn2.innerHTML = '⏱ ' + fmtHM(v);
        if (sfx === 'add') {
          var pw = document.getElementById('addProjectionWrap');
          if (pw) pw.innerHTML = renderAddProjection();
        } else {
          var pw2 = document.getElementById('editProjectionWrap');
          if (pw2) pw2.innerHTML = renderEditProjection();
        }
      });
    }
    else if (action === 'numpad') {
      haptic('light');
      var npField = el.getAttribute('data-field');
      var npUnit = el.getAttribute('data-unit') || '';
      var npMax = el.getAttribute('data-max');
      openSettingNumPad(npField, npUnit, npMax !== null ? parseFloat(npMax) : undefined);
    }
    else if (action === 'add-save') { saveAddEntry(); }
    else if (action === 'open-day-edit') {
      haptic('light');
      var odeEl = document.getElementById('addDateStart');
      var odeKey = (odeEl && odeEl.value) ? odeEl.value : state.addDateStart;
      if (!odeKey) { showToast('Pick a date first', 'error'); haptic('heavy'); return; }
      openEditPanel(odeKey);
    }
    else if (action === 'filter') { haptic('light'); state.logFilter = el.getAttribute('data-filter'); render(); }
    else if (action === 'theme-dark') { haptic('light'); state.theme = 'dark'; applyTheme(); render(); }
    else if (action === 'theme-light') { haptic('light'); state.theme = 'light'; applyTheme(); render(); }
    else if (action === 'save-settings') { saveSettingsForm(); }
    else if (action === 'apply-accrual') { haptic('medium'); applyMonthlyAccrual(true); }
    else if (action === 'toggle-occ') {
      var q = parseInt(el.getAttribute('data-q'));
      state.settings.manualOccasions[q] = state.settings.manualOccasions[q] > 0 ? 0 : 1;
      saveSettings();
      haptic('light');
      render();
    }
    else if (action === 'snap-unit') {
      haptic('light');
      state.snapshotUnit = el.getAttribute('data-unit');
      state.settings.familySickUsedDays = cleanDecimal(state.settings.familySickUsedDays, 4);
      state.settings.plUsedDays = cleanDecimal(state.settings.plUsedDays, 4);
      saveSettings();
      render();
    }
    else if (action === 'balance-unit') {
      haptic('light');
      state.balanceUnit = el.getAttribute('data-unit');
      state.settings.vacationRemaining = cleanDecimal(state.settings.vacationRemaining, 4);
      state.settings.sickRemaining = cleanDecimal(state.settings.sickRemaining, 4);
      state.settings.compRemaining = cleanDecimal(state.settings.compRemaining, 4);
      state.settings.hcompRemaining = cleanDecimal(state.settings.hcompRemaining, 4);
      state.settings.vacationMonthlyAccrual = cleanDecimal(state.settings.vacationMonthlyAccrual, 4);
      state.settings.sickMonthlyAccrual = cleanDecimal(state.settings.sickMonthlyAccrual, 4);
      saveSettings();
      render();
    }
    else if (action === 'fmla-toggle') { haptic('light'); state.settings.fmlaEnabled = el.getAttribute('data-val') === 'on'; saveSettings(); render(); }
    else if (action === 'add-fmla-period') {
      haptic('light');
      if (!state.settings.fmlaPeriods) state.settings.fmlaPeriods = [];
      var newId = 'fp' + Date.now();
      var num = state.settings.fmlaPeriods.length + 1;
      state.settings.fmlaPeriods.push({ id: newId, label: 'Period ' + num, startDate: '', snapshotHours: 0 });
      saveSettings(); render();
    }
    else if (action === 'delete-fmla-period') {
      haptic('light');
      var pid = el.getAttribute('data-period-id');
      if (pid && state.settings.fmlaPeriods) {
        if (state.settings.fmlaPeriods.length <= 1) { showToast('Keep at least one period', 'error'); return; }
        state.settings.fmlaPeriods = state.settings.fmlaPeriods.filter(function(pp){ return pp.id !== pid; });
        saveSettings(); render();
      }
    }
    else if (action === 'toggle-backup') { haptic('light'); state.backupOpen = !state.backupOpen; render(); }
    else if (action === 'export') { doExport(); }
    else if (action === 'import') { document.getElementById('fileInput').click(); }
    else if (action === 'cloud-save') {
      if (!window.KHub?.Firebase?.db || !window.KHub?.CloudBackup || !window.KHub?.CloudAuth) { showToast('Cloud backup unavailable', 'error'); return; }
      var saveCloud = function() {
        KHub.CloudBackup.save('overtime-tracker',
          ['tracker-v3-data', 'tracker-v3-theme', 'tracker-v3-settings', 'tracker-v3-meta'])
          .then(function() { showToast('Saved to cloud'); render(); })
          .catch(function(e) {
            if (e && e.code === 'auth-required') {
              KHub.CloudAuth.openDialog().then(function(result) { if (result) saveCloud(); });
              return;
            }
            showToast(KHub.CloudAuth.authMessage(e) || 'Cloud save failed', 'error');
            console.error(e);
          });
      };
      if (!KHub.CloudAuth.currentUser()) {
        KHub.CloudAuth.openDialog().then(function(result) { if (result) saveCloud(); });
      } else {
        saveCloud();
      }
    }
    else if (action === 'cloud-restore') {
      if (!window.KHub?.Firebase?.db || !window.KHub?.CloudBackup || !window.KHub?.CloudAuth) { showToast('Cloud backup unavailable', 'error'); return; }
      var restoreCloud = function() {
        showConfirm('Restore from Cloud', 'Replace all data with your cloud backup? This cannot be undone.', function() {
          KHub.CloudBackup.restore('overtime-tracker',
            ['tracker-v3-data', 'tracker-v3-theme', 'tracker-v3-settings', 'tracker-v3-meta'],
            null,
            function() { showToast('Restored from cloud'); setTimeout(function(){ location.reload(); }, 800); }
          ).catch(function(e) {
            if (e && e.code === 'auth-required') {
              KHub.CloudAuth.openDialog().then(function(result) { if (result) restoreCloud(); });
              return;
            }
            var msg = e.message === 'no-backup' ? 'No cloud backup found for this account' : (KHub.CloudAuth.authMessage(e) || 'Cloud restore failed');
            showToast(msg, 'error'); console.error(e);
          });
        });
      };
      if (!KHub.CloudAuth.currentUser()) {
        KHub.CloudAuth.openDialog().then(function(result) { if (result) restoreCloud(); });
      } else {
        restoreCloud();
      }
    }
    else if (action === 'goto-settings') { haptic('light'); state.tab = 'settings'; render(); }
    else if (action === 'modal-ok') {
      var cb = state.confirmCb;
      closeConfirm();
      if (cb) cb();
    }
    else if (action === 'modal-cancel') { closeConfirm(); }
    else if (action === 'undo-action') { if (state.undoAction) { var _ucb=state.undoAction; state.undoAction=null; if(toastTimer)clearTimeout(toastTimer); document.getElementById('toast').innerHTML=''; _ucb(); } }
    } catch (err) {
      try { showToast('Action error: ' + err.message, 'error'); } catch (ee) {}
    }
  }

  function openEditPanel(dateKey) {
    state.selectedDate = parseDateKey(dateKey);
    // Suggest a type not yet logged for this day
    var dayEntries = getDateEntries(dateKey);
    var usedTypes = {};
    for (var ui = 0; ui < dayEntries.length; ui++) usedTypes[dayEntries[ui].type] = true;
    var defaultType = 'ot';
    if (usedTypes['ot']) {
      var allT = ['vac', 'sick', 'fsick', 'pl', 'comp', 'hcomp', 'block'];
      if (state.settings.fmlaEnabled) allT.splice(6, 0, 'fmla'); // insert fmla before block only if enabled
      for (var ai = 0; ai < allT.length; ai++) { if (!usedTypes[allT[ai]]) { defaultType = allT[ai]; break; } }
    }
    state.editType = defaultType;
    state.editHours = '0';
    renderPanel();
  }

  function doPanelAddSave() {
    if (!state.selectedDate) return;
    var key = formatDateKey(state.selectedDate);

    if (state.editType === 'block') {
      var existingForBlock = getDateEntries(key).filter(function(e) { return e.type !== 'block'; });
      function doBlock() {
        setDateEntries(key, [{ type: 'block' }]);
        saveData(); haptic('success'); showToast('Saved — Day marked Off');
        render(); renderPanel();
      }
      if (existingForBlock.length > 0) {
        showConfirm('Replace existing entries?', 'Marking this day Off will remove ' + existingForBlock.length + ' existing entr' + (existingForBlock.length === 1 ? 'y' : 'ies') + ' for this date.', doBlock, 'Mark Off');
      } else {
        doBlock();
      }
      return;
    }

    var inp = document.getElementById('editHours');
    var h = parseFloat(inp ? inp.value : state.editHours);
    if (isNaN(h) || h < 0) { showToast('Enter valid hours', 'error'); haptic('heavy'); return; }
    if (h === 0) { showToast('Tap ⏱ to set hours', 'error'); haptic('heavy'); return; }

    var check = checkEntry(state.editType, h, key, state.editType === 'fmla' ? getFmlaContext(true) : null);
    if (check.blocks.length > 0) { showToast(check.blocks[0], 'error'); haptic('heavy'); return; }

    var prevSnap = getDateEntries(key).slice();
    function doSave() {
      var entries = getDateEntries(key).filter(function(e) { return e.type !== state.editType; });
      var newEntry;
      if (state.editType === 'fmla') {
        var alloc = calcFmlaAllocation(h, getFmlaContext(true));
        newEntry = { type: 'fmla', hours: h, fmlaReason: alloc.reason, fmlaCharge: alloc.charge, sickCharge: parseFloat(alloc.sickCharge.toFixed(4)), familySickCharge: parseFloat(alloc.familySickCharge.toFixed(4)), vacCharge: parseFloat(alloc.vacCharge.toFixed(4)), unpaidCharge: parseFloat(alloc.unpaidCharge.toFixed(4)) };
      } else {
        newEntry = { type: state.editType, hours: h };
      }
      entries.push(newEntry);
      setDateEntries(key, entries);
      saveData(); haptic('success');
      var _uk=key,_up=prevSnap;
      showToast('Saved',null,function(){setDateEntries(_uk,_up);saveData();showToast('Undone');render();renderPanel();});
      // Suggest next unused type for add form
      var fresh = getDateEntries(key), used = {};
      for (var fi = 0; fi < fresh.length; fi++) used[fresh[fi].type] = true;
      var nextT = 'ot'; var allT2 = ['ot','vac','sick','fsick','pl','comp','hcomp','fmla','block'];
      for (var ni = 0; ni < allT2.length; ni++) { if (!used[allT2[ni]]) { nextT = allT2[ni]; break; } }
      state.editType = nextT;
      state.editHours = '0';
      render(); renderPanel();
    }

    if (check.warns.length > 0) {
      var body = '<div>' + check.warns.map(escapeHtml).join('<br>') + '</div>';
      showConfirm('Confirm save', body, doSave, 'Save Anyway'); return;
    }
    doSave();
  }

  function saveAddEntry() {
    var sEl = document.getElementById('addDateStart');
    var eEl = document.getElementById('addDateEnd');
    var startStr = sEl ? sEl.value : state.addDateStart;
    var endStr;
    if (state.addMode === 'range') endStr = eEl ? eEl.value : state.addDateEnd;
    else endStr = startStr;

    if (!startStr) { showToast('Pick a date', 'error'); haptic('heavy'); return; }
    if (state.addMode === 'range' && !endStr) { showToast('Pick an end date', 'error'); haptic('heavy'); return; }
    var startD = parseDateKey(startStr);
    var endD = parseDateKey(endStr);
    if (endD < startD) { showToast('End must be after start', 'error'); haptic('heavy'); return; }

    var hoursPerDay = 0;
    if (state.addType !== 'block') {
      var hi = document.getElementById('addHours');
      hoursPerDay = parseFloat(hi ? hi.value : state.addHours);
      if (isNaN(hoursPerDay) || hoursPerDay < 0) { showToast('Enter valid hours', 'error'); haptic('heavy'); return; }
      if (hoursPerDay === 0) { showToast('Tap ⏱ to set hours', 'error'); haptic('heavy'); return; }
    }

    // Check total impact
    if (state.addType !== 'block' && state.addType !== 'ot') {
      var dayCount = daysBetween(startD, endD) + 1;
      var totalHours = hoursPerDay * dayCount;
      var check = checkEntry(state.addType, totalHours, startStr, state.addType === 'fmla' ? getFmlaContext(false) : null);
      if (check.blocks.length > 0) {
        showToast(check.blocks[0], 'error'); haptic('heavy'); return;
      }
      if (check.warns.length > 0) {
        var body = '<div>' + check.warns.map(escapeHtml).join('<br>') + '</div>';
        showConfirm('Confirm save', body, function() { doAddEntry(startD, endD, hoursPerDay); }, 'Save Anyway');
        return;
      }
    }
    doAddEntry(startD, endD, hoursPerDay);
  }

  function doAddEntry(startD, endD, hoursPerDay) {
    var count = 0, undoSnap = {};
    var cur = new Date(startD.getTime());
    while (cur <= endD) {
      var k = formatDateKey(cur);
      undoSnap[k] = getDateEntries(k).slice();
      if (state.addType === 'block') {
        setDateEntries(k, [{ type: 'block' }]);
      } else if (state.addType === 'fmla') {
        var alloc2 = calcFmlaAllocation(hoursPerDay, getFmlaContext(false));
        var existFmla = getDateEntries(k).filter(function(e) { return e.type !== 'fmla'; });
        existFmla.push({ type: 'fmla', hours: hoursPerDay, fmlaReason: alloc2.reason, fmlaCharge: alloc2.charge, sickCharge: parseFloat(alloc2.sickCharge.toFixed(4)), familySickCharge: parseFloat(alloc2.familySickCharge.toFixed(4)), vacCharge: parseFloat(alloc2.vacCharge.toFixed(4)), unpaidCharge: parseFloat(alloc2.unpaidCharge.toFixed(4)) });
        setDateEntries(k, existFmla);
      } else {
        var existOther = getDateEntries(k).filter(function(e) { return e.type !== state.addType; });
        existOther.push({ type: state.addType, hours: hoursPerDay });
        setDateEntries(k, existOther);
      }
      count++;
      cur = new Date(cur.getTime() + MS_PER_DAY);
    }
    saveData();
    haptic('success');
    var _auk=Object.keys(undoSnap),_aus=undoSnap;
    showToast('Saved '+count+' '+(count===1?'entry':'entries'),null,function(){
      for(var _i=0;_i<_auk.length;_i++) setDateEntries(_auk[_i],_aus[_auk[_i]]);
      saveData();showToast('Undone');render();
    });
    state.addHours = '0';
    state.addDateStart = formatDateKey(new Date());
    state.addDateEnd = formatDateKey(new Date());
    render();
    setTimeout(initAllPickers, 0);
  }

  // Live-apply a settings numeric field on every keystroke (targeted, no full re-render).
  // Fixes the "have to enter it twice" bug: the typed value commits immediately and the
  // box never blanks out on re-render. Save button + confirm dialog remain as a safety net.
  function liveSettingInput(inputEl, settingKey) {
    if (!inputEl || inputEl._liveBound) return;
    inputEl._liveBound = true;
    inputEl.addEventListener('input', function() {
      try {
        var bWD = state.settings.workdayHours || 7.5;
        var raw = parseFloat(inputEl.value);
        if (isNaN(raw)) return; // let user clear/retype without forcing 0
        var hrs = state.balanceUnit === 'days' ? raw * bWD : raw;
        state.settings[settingKey] = Math.max(0, hrs);
        saveSettings();
      } catch (e) {}
    });
  }
  function bindLiveSettingInputs() {
    // Numeric settings fields are now in-app keypad buttons (openSettingNumPad),
    // which commit + save on confirm. No live input binding needed anymore.
  }

  function saveSettingsForm() {
    // Numeric balance/accrual/snapshot/workday fields are now handled by the in-app
    // keypad (openSettingNumPad), which writes to state.settings and saves immediately.
    // This function now only commits the remaining input-based fields: dates, username, FMLA.
    var nextSettings = {};
    for (var sk0 in state.settings) nextSettings[sk0] = state.settings[sk0];
    var balEl = document.getElementById('setBalanceDate');
    var accEl = document.getElementById('setAccrualDate');
    nextSettings.balanceAsOfDate = balEl && balEl.value ? balEl.value : (state.settings.balanceAsOfDate || formatDateKey(new Date()));
    nextSettings.accrualEffectiveDate = accEl && accEl.value ? accEl.value : nextSettings.balanceAsOfDate;
    var nameEl = document.getElementById('setUserName');
    nextSettings.userName = nameEl ? (nameEl.value.trim() || 'David') : (state.settings.userName || 'David');
    if (nextSettings.fmlaEnabled) {
      var spList = nextSettings.fmlaPeriods || [];
      for (var spi2 = 0; spi2 < spList.length; spi2++) {
        var spd = spList[spi2];
        var spStartEl = document.getElementById('fmla-pstart-' + spd.id);
        var spSnapEl  = document.getElementById('fmla-psnap-'  + spd.id);
        var spLabelEl = document.getElementById('fmla-plabel-' + spd.id);
        if (spStartEl) spd.startDate     = spStartEl.value || '';
        if (spSnapEl)  spd.snapshotHours = parseFloat(spSnapEl.value) || 0;
        if (spLabelEl) spd.label         = spLabelEl.value || ('Period ' + (spi2+1));
      }
      nextSettings.fmlaPeriods = spList;
    }
    var watched = [
      ['Balance as of', 'balanceAsOfDate'],
      ['Vacation Available', 'vacationRemaining'],
      ['Sick Available', 'sickRemaining'],
      ['Regular Comp Available', 'compRemaining'],
      ['Holiday Comp Available', 'hcompRemaining']
    ];
    var changes = [];
    for (var wi = 0; wi < watched.length; wi++) {
      var keyName = watched[wi][1];
      if (String(state.settings[keyName] || '') !== String(nextSettings[keyName] || '')) {
        changes.push(watched[wi][0] + ': ' + escapeHtml(state.settings[keyName] || '0') + ' -> ' + escapeHtml(nextSettings[keyName] || '0'));
      }
    }
    function applySettingsSave() {
      state.settings = nextSettings;
      saveSettings();
      haptic('success');
      showToast('Settings saved');
      render();
    }
    if (changes.length > 0) {
      showConfirm('Confirm bank correction', '<div>These changes become the new baseline going forward. Old calendar entries are not changed.</div><div style="margin-top:8px">' + changes.join('<br>') + '</div>', applySettingsSave, 'Save Baseline');
      return;
    }
    applySettingsSave();
  }

  function doExport() {
    try {
      var payload = { version: 3, exportedAt: new Date().toISOString(), data: state.data, settings: state.settings };
      var json = JSON.stringify(payload, null, 2);
      var filename = 'timetracker-backup.json';
      function markSaved() { state.meta.lastBackup = new Date().toISOString(); saveMeta(); haptic('success'); showToast('Backup saved'); render(); }
      function fallbackDownload() {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        markSaved();
      }
      if (window.showSaveFilePicker) {
        window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }] })
          .then(function(h) { return h.createWritable(); })
          .then(function(w) { return w.write(json).then(function() { return w.close(); }); })
          .then(markSaved)
          .catch(function(err) { if (!err || err.name !== 'AbortError') fallbackDownload(); });
      } else { fallbackDownload(); }
    } catch (err) { showToast('Export failed', 'error'); }
  }

  // === Event delegation ===
  document.addEventListener('click', function(e) {
    try {
      var el = e.target;
      while (el && el !== document.body) {
        if (el.getAttribute && el.getAttribute('data-action')) {
          var action = el.getAttribute('data-action');
          if ((action === 'close-panel' || action === 'modal-cancel') && el.classList && (el.classList.contains('panel-backdrop') || el.classList.contains('modal-backdrop'))) {
            if (e.target === el) { handleAction(action, el); return; }
            return;
          }
          handleAction(action, el);
          return;
        }
        el = el.parentNode;
      }
    } catch (err) {
      try { showToast('Click error: ' + err.message, 'error'); } catch (ee) {}
    }
  });

  document.addEventListener('input', function(e) {
    if (!e.target || !e.target.id) return;
    var id = e.target.id;
    var v = e.target.value;
    if (id === 'editHours') {
      if (/^0\d/.test(v)) { v = v.replace(/^0+/, ''); e.target.value = v; }
      if (v === '') { v = '0'; e.target.value = v; }
      state.editHours = v;
      // Update projection only via innerHTML on stable wrapper
      try {
        var ep = document.getElementById('editProjectionWrap');
        if (ep) ep.innerHTML = renderEditProjection();
      } catch (err) {}
    } else if (id === 'addHours') {
      if (/^0\d/.test(v)) { v = v.replace(/^0+/, ''); e.target.value = v; }
      if (v === '') { v = '0'; e.target.value = v; }
      state.addHours = v;
      try {
        var projEl = document.getElementById('addProjectionWrap');
        if (projEl) projEl.innerHTML = renderAddProjection();
      } catch (err) {}
    } else if (id === 'addDateStart') {
      state.addDateStart = v || formatDateKey(new Date());
      if (state.addMode === 'single') state.addDateEnd = state.addDateStart;
    } else if (id === 'addDateEnd') {
      state.addDateEnd = v || formatDateKey(new Date());
    }
  });

  document.addEventListener('focus', function(e) {
    if (e.target && (e.target.id === 'editHours' || e.target.id === 'addHours')) {
      try { e.target.select(); } catch (err) {}
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.target && e.target.id === 'editHours' && e.key === 'Enter') doPanelAddSave();
    else if (e.target && e.target.id === 'addHours' && e.key === 'Enter') handleAction('add-save', e.target);
  });

  document.getElementById('fileInput').addEventListener('change', function(e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var imported = JSON.parse(ev.target.result);
        var raw = imported && imported.data ? imported.data : imported;
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('bad');
        function applyImport() {
          state.data = raw;
          if (imported && imported.settings) {
            for (var sk in imported.settings) {
              if (state.settings[sk] !== undefined) state.settings[sk] = imported.settings[sk];
            }
            // Migrate old single-period FMLA format to multi-period
            if (!Array.isArray(state.settings.fmlaPeriods)) state.settings.fmlaPeriods = [];
            if (state.settings.fmlaStartDate && state.settings.fmlaPeriods.length === 0) {
              state.settings.fmlaPeriods = [{ id: 'fp1', label: 'Period 1', startDate: state.settings.fmlaStartDate, snapshotHours: state.settings.fmlaSnapshotHours || 0 }];
            }
            if (!state.settings.balanceAsOfDate) state.settings.balanceAsOfDate = formatDateKey(new Date());
            if (!state.settings.accrualEffectiveDate) state.settings.accrualEffectiveDate = state.settings.balanceAsOfDate;
            state.settings.hcompRemaining = parseFloat(state.settings.hcompRemaining) || 0;
            state.settings.vacationMonthlyAccrual = parseFloat(state.settings.vacationMonthlyAccrual) || 0;
            state.settings.sickMonthlyAccrual = parseFloat(state.settings.sickMonthlyAccrual) || 0;
            saveSettings();
          }
          saveData();
          haptic('success');
          showToast('Imported ' + Object.keys(raw).length + ' entries');
          render();
        }
        var hasExisting = Object.keys(state.data).length > 0;
        if (hasExisting) {
          showConfirm('Replace existing data?', 'This will overwrite your current ' + Object.keys(state.data).length + ' entries with the backup. This cannot be undone.', applyImport, 'Replace');
        } else {
          applyImport();
        }
      } catch (err) {
        showToast('Invalid backup file', 'error'); haptic('heavy');
      }
    };
    reader.onerror = function() { showToast('Could not read file', 'error'); };
    reader.readAsText(file);
  });

  // Global error handler to surface what is actually crashing
  window.addEventListener('error', function(ev) {
    try {
      var msg = ev && ev.message ? ev.message : 'Unknown error';
      var src = ev && ev.filename ? (' @ ' + ev.filename.split('/').pop() + ':' + ev.lineno) : '';
      showToast('JS ERROR: ' + msg + src, 'error');
    } catch (e) {}
  });

  document.getElementById('settingsBtn').innerHTML = icons.settings;
  document.getElementById('settingsBtn').addEventListener('click', function() { haptic('light'); state.tab = 'settings'; render(); });
  document.getElementById('themeBtn').addEventListener('click', function() { haptic('light'); state.theme = state.theme === 'dark' ? 'light' : 'dark'; applyTheme(); render(); });

  applyTheme();
  setGreeting();
  render();
  // On startup: apply accrual if it's the 1st and hasn't run this month yet
  applyMonthlyAccrual(false);
  // Keep a midnight watcher running so the 1st is caught without a manual refresh
  scheduleMidnightAccrualCheck();
  // Cloud sync: pull newer cloud data on open/resume and push edits shortly after changes.
  if (window.KHub?.CloudBackup && window.KHub?.CloudAuth) {
    var OT_CLOUD_APP = 'overtime-tracker';
    var OT_CLOUD_KEYS = ['tracker-v3-data', 'tracker-v3-theme', 'tracker-v3-settings', 'tracker-v3-meta'];
    var otAutoSaveStarted = false;
    var otCloudSaveTimer = null;
    var otCloudChecking = false;
    var otCloudSaving = false;

    function otCloudUser() { return KHub.CloudAuth.currentUser(); }
    function checkOvertimeCloudLatest() {
      if (!otCloudUser() || otCloudChecking) return Promise.resolve();
      otCloudChecking = true;
      return KHub.CloudBackup.restoreLatestIfNewer(OT_CLOUD_APP, OT_CLOUD_KEYS, null, function() {
        location.reload();
      }).catch(function(e) {
        console.warn('[OvertimeCloud] restore check failed', e);
      }).finally(function() { otCloudChecking = false; });
    }
    function saveOvertimeCloudSoon() {
      if (!otCloudUser()) return;
      clearTimeout(otCloudSaveTimer);
      otCloudSaveTimer = setTimeout(function() {
        if (otCloudSaving || !otCloudUser()) return;
        otCloudSaving = true;
        KHub.CloudBackup.save(OT_CLOUD_APP, OT_CLOUD_KEYS)
          .catch(function(e) { console.warn('[OvertimeCloud] auto save failed', e); })
          .finally(function() { otCloudSaving = false; });
      }, 1800);
    }

    KHub.CloudAuth.onChange(function(user) {
      if (!user) return;
      checkOvertimeCloudLatest().finally(function() {
        if (!otAutoSaveStarted) {
          otAutoSaveStarted = true;
          KHub.CloudBackup.autoSave(OT_CLOUD_APP, OT_CLOUD_KEYS);
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') checkOvertimeCloudLatest();
            else saveOvertimeCloudSoon();
          });
          window.addEventListener('focus', checkOvertimeCloudLatest);
          window.addEventListener('online', checkOvertimeCloudLatest);
          document.addEventListener('input', saveOvertimeCloudSoon, true);
          document.addEventListener('change', saveOvertimeCloudSoon, true);
          document.addEventListener('click', function(e) {
            if (e && e.target && e.target.closest('button,[data-action],input,select,textarea')) saveOvertimeCloudSoon();
          }, true);
        }
      });
    });
  }

  // === Service worker (KHub standard: offline cache + PWA install) ===
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function(err) {
        console.warn('Service worker registration failed: ' + err);
      });
    });
  }
})();
