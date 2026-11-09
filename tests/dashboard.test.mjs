import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAuth } from '../auth.mjs';
import { outputShares, sum, trendSvg, hourlyLabelLayout } from '../public/dashboard.js';
import { translate } from '../public/i18n.js';
import {
  boardPage,
  linesForGroup,
  currentScheduleInterval,
  monitoringPeriodState,
  defaultMonitoring,
  migrateRuleControls,
} from '../public/monitor.js';
test('monitoring labels distinguish history, future shifts, breaks and active overnight work', () => {
  const c = {
    schedules: {
      night: [
        { start: '23:00', end: '00:00', kind: 'production' },
        { start: '00:00', end: '00:10', kind: 'break' },
        { start: '00:10', end: '01:00', kind: 'production' },
      ],
    },
  };
  const state = (date, time) =>
    monitoringPeriodState(c, date, 'night', Date.parse(time + '+07:00'));
  assert.equal(state('2026-11-03', '2026-11-04T18:00:00'), 'historicalShift');
  assert.equal(state('2026-11-05', '2026-11-04T18:00:00'), 'futureShift');
  assert.equal(state('2026-11-04', '2026-11-04T18:00:00'), 'outsideShift');
  assert.equal(state('2026-11-04', '2026-11-05T00:05:00'), 'breakMonitoring');
  assert.equal(state('2026-11-04', '2026-11-05T00:15:00'), 'activeMonitoring');
});
test('hour labels use short times and rotation instead of skipping intervals', () => {
  assert.deepEqual(hourlyLabelLayout(326, 12), {
    compact: true,
    angle: -55,
    bottom: 76,
    height: 258,
  });
  assert.equal(hourlyLabelLayout(1061, 12).compact, true);
  assert.equal(hourlyLabelLayout(1200, 5).compact, false);
  assert.equal(hourlyLabelLayout(700, 1).angle, 0);
});

test('legacy alert type switches migrate to individual enabled checkboxes once', () => {
  const monitoring = defaultMonitoring({ lines: [], rows: [] });
  delete monitoring.ruleControlsVersion;
  monitoring.alertMode = 'idle';
  assert.equal(migrateRuleControls(monitoring), true);
  assert.equal(monitoring.alertMode, 'all');
  assert.ok(monitoring.rules.filter((r) => r.type === 'gap').every((r) => !r.enabled));
  assert.ok(monitoring.rules.filter((r) => r.type === 'idle').every((r) => r.enabled));
  monitoring.rules[0].enabled = true;
  assert.equal(migrateRuleControls(monitoring), false);
  assert.equal(monitoring.rules[0].enabled, true);
});

test('group filters include all, selected groups and empty groups without dropping ungrouped lines', () => {
  const config = {
    lines: ['A', 'B', 'C'],
    monitoring: {
      groups: [
        { id: 'g', lines: ['A', 'B'] },
        { id: 'empty', lines: [] },
      ],
    },
  };
  assert.deepEqual(linesForGroup(config, ''), ['A', 'B', 'C']);
  assert.deepEqual(linesForGroup(config, 'g', ['Historical']), ['A', 'B']);
  assert.deepEqual(linesForGroup(config, '', ['Historical']), ['A', 'B', 'C', 'Historical']);
  assert.deepEqual(linesForGroup(config, 'empty'), []);
});
test('presentation pages contain at most seven lines and preserve all remaining lines', () => {
  const lines = Array.from({ length: 16 }, (_, i) => `Line ${i}`);
  assert.deepEqual(
    [0, 1, 2].flatMap((page) => boardPage(lines, page).lines),
    lines,
  );
  assert.equal(boardPage(lines, 0).lines.length, 7);
  assert.equal(boardPage(lines, 2).lines.length, 2);
  assert.equal(boardPage(lines, 99).page, 2);
  assert.equal(boardPage(lines, -1).page, 0);
  assert.deepEqual(boardPage([], 0), { lines: [], page: 0, pages: 1, total: 0 });
});
test('current interval handles breaks, boundaries, cross-midnight shifts and historical reports', () => {
  const config = {
    schedules: {
      night: [
        { id: 'n1', start: '23:00', end: '00:00', kind: 'production' },
        { id: 'b1', start: '00:00', end: '00:10', kind: 'break' },
        { id: 'n2', start: '00:10', end: '01:00', kind: 'production' },
      ],
    },
  };
  const current = (time) =>
    currentScheduleInterval(config, '2026-11-04', 'night', Date.parse(time + '+07:00'));
  assert.equal(current('2026-11-04T23:59:59').id, 'n1');
  assert.equal(current('2026-11-05T00:00:00').kind, 'break');
  assert.equal(current('2026-11-05T00:10:00').id, 'n2');
  assert.equal(current('2026-11-05T01:00:00'), null);
  assert.equal(current('2026-11-06T00:15:00'), null);
});

test('compact hourly trends omit axes and expose every interval including blanks to hover', () => {
  const ctx = {
    t: (key, p) => translate('en', key, p),
    esc: (v) =>
      String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    number: (v) => (v == null ? '—' : String(v)),
  };
  const values = [
    { slot: { start: '08:00', end: '09:00' }, target: 100, actual: 90 },
    { slot: { start: '09:00', end: '10:00' }, target: 100, actual: null },
  ];
  const small = trendSvg(values, ctx, true);
  assert.doesNotMatch(small, /<text|chart-grid/);
  assert.equal([...small.matchAll(/data-trend-tip=/g)].length, 2);
  assert.match(small, /08:00 - 09:00\nTarget: 100\nActual: 90\nBelow target/);
  assert.match(small, /09:00 - 10:00\nTarget: 100\nActual: —\nAwaiting data/);
  assert.match(small, /point-below/);
  const detailed = trendSvg(values, ctx);
  assert.match(detailed, /<text/);
  assert.match(detailed, /chart-grid/);
  assert.doesNotMatch(
    trendSvg(
      [{ slot: { start: '<unsafe>', end: '10:00' }, target: null, actual: null }],
      ctx,
      true,
    ),
    /<unsafe>/,
  );
});

test('fullscreen trends use their container geometry and retain readable interval labels', () => {
  const ctx = { t: (key) => key, esc: String, number: (value) => String(value ?? '—') };
  const values = Array.from({ length: 12 }, (_, index) => ({
    slot: {
      start: `${String(index + 7).padStart(2, '0')}:00`,
      end: `${String(index + 8).padStart(2, '0')}:00`,
    },
    target: 100,
    actual: index === 3 ? null : 90,
  }));
  const wide = trendSvg(values, { ...ctx, trendSize: { width: 1320, height: 130 } });
  assert.match(wide, /viewBox="0 0 1320 130"/);
  assert.match(wide, /x="1296"/);
  assert.equal((wide.match(/data-trend-tip=/g) || []).length, 12);
  const narrow = trendSvg(values, { ...ctx, trendSize: { width: 340, height: 95 } });
  assert.match(narrow, /viewBox="0 0 600 95"/);
  assert.match(narrow, /width="600"/);
  assert.equal((narrow.match(/class="trend-time-label"/g) || []).length, 12);
  for (const value of values) assert.ok(narrow.includes(value.slot.start));
  assert.match(
    trendSvg(values, { ...ctx, trendSize: { width: 1320, height: 130 } }, true),
    /viewBox="0 0 310 82"/,
  );
});

test('dense whole-day trends retain every time label and hit area without compressing the axis', () => {
  const ctx = { t: (key) => key, esc: String, number: (value) => String(value ?? '—') };
  const values = Array.from({ length: 72 }, (_, index) => ({
    slot: {
      start: `${String(Math.floor(index / 3)).padStart(2, '0')}:${String((index % 3) * 20).padStart(2, '0')}`,
    },
    target: 10,
    actual: index % 2 ? null : 0,
  }));
  for (const width of [280, 600, 1320]) {
    const svg = trendSvg(values, { ...ctx, trendSize: { width, height: 230 } });
    assert.match(svg, /viewBox="0 0 3480 230"/);
    assert.match(svg, /width="3480"/);
    const positions = [...svg.matchAll(/class="trend-time-label" x="([\d.]+)"/g)].map((match) =>
      Number(match[1]),
    );
    assert.equal(positions.length, values.length);
    for (let index = 1; index < positions.length; index++)
      assert.ok(positions[index] - positions[index - 1] >= 48);
    assert.equal((svg.match(/data-trend-tip=/g) || []).length, values.length);
  }
  assert.match(trendSvg([], ctx), /emptyChart/);
  assert.equal((trendSvg([values[0]], ctx).match(/class="trend-time-label"/g) || []).length, 1);
});

test('output shares use actual output of the selected lines and preserve missing values', () => {
  const lines = [
    { line: 'A', actual: 30 },
    { line: 'B', actual: 70 },
    { line: 'C', actual: null },
  ];
  assert.deepEqual(
    outputShares(lines).map((l) => l.percent),
    [30, 70, 0],
  );
  assert.equal(outputShares(lines)[2].actual, null);
  assert.deepEqual(
    outputShares(lines.slice(0, 1)).map((l) => l.percent),
    [100],
  );
  assert.deepEqual(
    outputShares([{ line: 'A', actual: 0 }]).map((l) => l.percent),
    [0],
  );
  assert.equal(sum([null, undefined]), null);
  assert.equal(sum([null, 0]), 0);
  assert.equal(sum([30, 70, null]), 100);
});

test('legacy accounts migrate once with new passwords, correct roles and revoked sessions', () => {
  const db = new DatabaseSync(':memory:');
  let auth = createAuth(db);
  db.prepare("UPDATE users SET username='admin' WHERE username='manager'").run();
  db.prepare("UPDATE users SET username='operator' WHERE username='member'").run();
  db.prepare("INSERT INTO sessions VALUES('old-token','admin',?)").run(Date.now() + 100000);
  auth = createAuth(db);
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal(auth.login(req, 'manager', 'manager').user.role, 'admin');
  assert.equal(auth.login(req, 'member', 'member').user.role, 'operator');
  assert.equal(auth.login(req, 'admin', 'manager').status, 401);
  assert.equal(auth.login(req, 'operator', 'member').status, 401);
  const hashes = db.prepare('SELECT password_hash FROM users ORDER BY username').all();
  createAuth(db);
  assert.deepEqual(
    db.prepare('SELECT password_hash FROM users ORDER BY username').all(),
    hashes,
  );
  db.close();
});
