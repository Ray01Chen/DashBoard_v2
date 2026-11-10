import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannedProduction, allocateDailyTarget } from '../public/production-targets.js';
import { buildLineMonitor, defaultMonitoring } from '../public/monitor.js';
import { targetsSettingsMarkup } from '../public/workforce-settings.js';
const schedules = {
  day: [
    { id: 'd1', kind: 'production', start: '08:00', end: '09:00' },
    { id: 'db', kind: 'break', start: '09:00', end: '09:15' },
    { id: 'd2', kind: 'production', start: '09:15', end: '11:15' },
  ],
  night: [
    { id: 'n1', kind: 'production', start: '23:00', end: '01:00' },
    { id: 'nb', kind: 'break', start: '01:00', end: '01:30' },
    { id: 'n2', kind: 'production', start: '01:30', end: '02:30' },
    { id: 'nb2', kind: 'break', start: '02:30', end: '03:00' },
  ],
};
function fixture() {
  const config = {
    lines: ['L'],
    models: ['M'],
    rows: [{ id: 1, line: 'L', model: 'M', active: true }],
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 600 }],
    schedules: structuredClone(schedules),
  };
  config.monitoring = defaultMonitoring(config);
  config.monitoring.rules = [];
  config.monitoring.unified = { completion: { enabled: true, green: 100, red: 110 } };
  return config;
}
test('planned pace shares the existing two-shift allocation and excludes breaks and gaps', () => {
  const config = fixture();
  assert.deepEqual(plannedProduction(config, 600, 'L'), { target: 600, hours: 6, uph: 100 });
  for (const shift of ['day', 'night'])
    assert.deepEqual(plannedProduction(config, 600, 'L', shift), {
      target: 300,
      hours: 3,
      uph: 100,
    });
  assert.equal(
    plannedProduction(config, 1, 'L', 'day').target +
      plannedProduction(config, 1, 'L', 'night').target,
    1,
  );
});
test('plan follows line-specific timetable and changed presets without copying or persisting derived values', () => {
  const config = fixture();
  config.lineSchedules = { L: { day: [schedules.day[0]], night: [] } };
  assert.deepEqual(plannedProduction(config, 600, 'L'), { target: 600, hours: 1, uph: 600 });
  assert.equal(plannedProduction(config, 300, 'L').uph, 300);
  assert.equal(plannedProduction(config, 600, 'unmapped').uph, 100);
  config.lineSchedules.L.day.push(schedules.day[2]);
  assert.equal(plannedProduction(config, 600, 'L').uph, 200);
  assert.equal(Object.hasOwn(config.productionUnits[0], 'plannedUPH'), false);
});
test('missing targets, zero hours, invalid clocks and fractional goals never produce NaN or Infinity', () => {
  const config = fixture();
  for (const target of [null, undefined, -1, 1.5, NaN, Infinity])
    assert.equal(plannedProduction(config, target, 'L').uph, null);
  assert.deepEqual(plannedProduction(config, 0, 'L'), { target: 0, hours: 6, uph: 0 });
  config.schedules = { day: [schedules.day[1]], night: [] };
  assert.deepEqual(plannedProduction(config, 100, 'L'), { target: null, hours: 0, uph: null });
  for (const [start, end] of [
    ['08:00', '08:00'],
    ['bad', '09:00'],
    ['08:00', '25:00'],
  ]) {
    config.schedules.day = [{ kind: 'production', start, end }];
    assert.equal(plannedProduction(config, 100, 'L').uph, null);
  }
  config.schedules = structuredClone(schedules);
  config.schedules.day.push({ ...schedules.day[0], id: 'duplicate' });
  assert.equal(plannedProduction(config, 100, 'L').uph, null);
  config.schedules.day.pop();
  config.schedules.day[1].start = '08:30';
  assert.equal(plannedProduction(config, 100, 'L').uph, null);
});
test('monitor derives the planned baseline and per-scope deadline even if obsolete manual settings exist', () => {
  const config = fixture();
  config.monitoring.capacity = { '["L","M"]': { standardUPH: 9999, deadline: '12:00' } };
  const values = allocateDailyTarget(config, 600, 'L').map((slot) => ({
    ...slot,
    actual: slot.id === 'd1' ? 100 : null,
  }));
  const now = Date.parse('2026-11-04T09:05:00+07:00');
  const all = buildLineMonitor(
    config,
    [{ rowId: 1, slots: values }],
    '2026-11-04',
    'all',
    {},
    now,
  )[0];
  const risk = all.unified.results[0];
  assert.equal(all.plan.uph, 100);
  assert.equal(risk.params.planned, 100);
  assert.equal(risk.params.deadline, Date.parse('2026-11-05T02:30:00+07:00'));
  const day = buildLineMonitor(
    config,
    [{ rowId: 1, slots: values.filter((slot) => slot.shift === 'day') }],
    '2026-11-04',
    'day',
    {},
    now,
  )[0];
  assert.equal(day.plan.target, 300);
  assert.equal(day.unified.results[0].params.deadline, Date.parse('2026-11-04T11:15:00+07:00'));
  const night = buildLineMonitor(
    config,
    [
      {
        rowId: 1,
        slots: values
          .filter((slot) => slot.shift === 'night')
          .map((slot) => ({ ...slot, actual: slot.id === 'n1' ? 200 : null })),
      },
    ],
    '2026-11-04',
    'night',
    {},
    Date.parse('2026-11-05T01:10:00+07:00'),
  )[0];
  assert.equal(night.plan.target, 300);
  assert.equal(night.unified.results[0].params.planned, 100);
  assert.equal(
    night.unified.results[0].params.deadline,
    Date.parse('2026-11-05T02:30:00+07:00'),
  );
});
test('archived plans retain original target and productive time after current settings change', () => {
  const config = fixture();
  const slots = allocateDailyTarget(config, 600, 'L').map((slot) => ({
    ...slot,
    actual: slot.target,
  }));
  const snapshot = {
    sourceDailyTarget: 600,
    productionDay: Object.fromEntries(
      ['day', 'night'].map((shift) => [
        shift,
        { slots: slots.filter((slot) => slot.shift === shift) },
      ]),
    ),
  };
  config.productionUnits[0].dailyTarget = 1200;
  config.schedules.day.push({ id: 'new', kind: 'production', start: '14:00', end: '15:00' });
  const now = Date.parse('2026-11-05T10:00:00+07:00');
  const record = { rowId: 1, version: 1, slots, defaultsSnapshot: snapshot };
  const line = buildLineMonitor(config, [record], '2026-11-04', 'all', {}, now)[0];
  assert.deepEqual(line.plan, { target: 600, hours: 6, uph: 100 });
  assert.equal(line.unified.severity, 'green');
  assert.equal(
    line.unified.results[0].params.deadline,
    Date.parse('2026-11-05T02:30:00+07:00'),
  );
  delete snapshot.productionDay.night;
  assert.equal(
    buildLineMonitor(config, [record], '2026-11-04', 'all', {}, now)[0].unified.severity,
    'noData',
  );
  delete record.defaultsSnapshot;
  const unknown = buildLineMonitor(config, [record], '2026-11-04', 'all', {}, now)[0];
  assert.equal(unknown.unified.severity, 'noData');
});
test('daily-target settings expose read-only all/day/night plan information in all supported languages', () => {
  for (const language of ['zh', 'en', 'th']) {
    const html = targetsSettingsMarkup({ draft: fixture(), esc: String, language });
    for (const scope of ['all', 'day', 'night']) {
      assert.match(
        html,
        new RegExp(`data-planned-scope="${scope}" data-planned-field="uph">100<`),
      );
      assert.match(
        html,
        new RegExp(
          `data-planned-scope="${scope}" data-planned-field="hours">${scope === 'all' ? 6 : 3}<`,
        ),
      );
    }
    assert.doesNotMatch(html, /<input[^>]*data-planned|effectiveHours|data-capacity/);
  }
});
