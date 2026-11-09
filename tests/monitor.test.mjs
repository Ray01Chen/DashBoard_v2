import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultMonitoring,
  buildLineMonitor,
  productionWindows,
  productiveSeconds,
  overviewMetrics,
} from '../public/monitor.js';
function configuration() {
  const c = {
    lines: ['CD303'],
    rows: [
      { id: 3, line: 'CD303', station: 'HI', job: 'PD', active: true },
      { id: 4, line: 'CD303', station: 'Pack', job: null, active: true },
    ],
    schedules: {
      day: [
        { id: 'd1', kind: 'production', start: '08:00', end: '09:00' },
        { id: 'db', kind: 'break', start: '09:00', end: '09:10' },
        { id: 'd2', kind: 'production', start: '09:10', end: '10:00' },
      ],
      night: [
        { id: 'n1', kind: 'production', start: '23:00', end: '00:00' },
        { id: 'nb', kind: 'break', start: '00:00', end: '00:10' },
        { id: 'n2', kind: 'production', start: '00:10', end: '01:00' },
      ],
    },
  };
  c.monitoring = defaultMonitoring(c);
  return c;
}
const at = (time) => Date.parse(`2026-11-04T${time}:00+07:00`);
const record = (id, actual, target = 100) => ({
  rowId: id,
  slots: [
    { id: 'd1', target, actual, issue: '' },
    { id: 'd2', target: null, actual: null, issue: '' },
  ],
});
const line = (c, records = [], now = at('08:00'), activity = {}, shift = 'day') =>
  buildLineMonitor(c, records, '2026-11-04', shift, activity, now)[0];

test('overview counts separate the active interval and cumulative totals from future targets', () => {
  const series = [
    { startAt: at('08:00'), endAt: at('09:00'), target: 100, actual: 90 },
    { startAt: at('09:10'), endAt: at('10:00'), target: 200, actual: null },
    { startAt: at('10:00'), endAt: at('11:00'), target: 300, actual: 777 },
  ];
  assert.deepEqual(overviewMetrics(series, at('08:30')), {
    currentTarget: 100,
    currentActual: 90,
    currentGap: -10,
    cumulativeTarget: 100,
    cumulativeActual: 90,
    cumulativeGap: -10,
  });
  assert.deepEqual(overviewMetrics(series, at('09:05')), {
    currentTarget: null,
    currentActual: null,
    currentGap: null,
    cumulativeTarget: 100,
    cumulativeActual: 90,
    cumulativeGap: -10,
  });
  assert.equal(overviewMetrics(series, at('09:30')).cumulativeGap, -210);
  assert.equal(overviewMetrics(series, at('07:59')).cumulativeTarget, null);
  assert.equal(
    overviewMetrics([{ ...series[0], target: null, actual: null }, series[0]], at('08:30'))
      .currentTarget,
    100,
  );
  assert.equal(overviewMetrics(series, at('11:00')).cumulativeActual, 867);
  assert.equal(overviewMetrics(series, at('11:00')).currentTarget, null);
  assert.equal(
    overviewMetrics(
      series.map((slot) => ({ ...slot, actual: null })),
      at('11:00'),
    ).cumulativeGap,
    null,
  );
  assert.equal(overviewMetrics([{ ...series[0], actual: 0 }], at('08:30')).cumulativeActual, 0);
  assert.equal(overviewMetrics([{ ...series[0], actual: 0 }], at('08:30')).currentGap, -100);
  assert.equal(overviewMetrics([{ ...series[0], target: null }], at('08:30')).currentGap, null);
});

test('overview timing follows overnight windows and alarms exclude future entered values', () => {
  const c = configuration();
  c.schedules.all = [...c.schedules.day, ...c.schedules.night];
  const slots = productionWindows(c, '2026-11-04', 'all').map((slot) => ({
    ...slot,
    target: 100,
    actual: null,
  }));
  slots[0].actual = 100;
  slots[2].actual = 0;
  const result = line(c, [{ rowId: 4, slots }], at('08:10'), {}, 'all');
  assert.equal(result.target, 400);
  assert.equal(result.currentTarget, 100);
  assert.equal(result.cumulativeActual, 100);
  assert.equal(result.cumulativeGap, 0);
  assert.ok(!result.matches.some((rule) => rule.type === 'gap'));
  const overnight = line(
    c,
    [{ rowId: 4, slots }],
    Date.parse('2026-11-05T00:15:00+07:00'),
    {},
    'all',
  );
  assert.equal(overnight.currentTarget, 100);
  assert.equal(overnight.cumulativeTarget, 400);
  assert.equal(overnight.cumulativeActual, 100);
  assert.equal(overnight.cumulativeGap, -300);
  assert.equal(line(c, [{ rowId: 4, slots }], at('07:59'), {}, 'all').status, 'neutral');
});
test('rule checkboxes alone control each alert type', () => {
  const c = configuration();
  c.monitoring.rules.filter((r) => r.type === 'idle').forEach((r) => (r.enabled = false));
  assert.equal(line(c, [record(4, 94)], at('08:10')).rule.type, 'gap');
  assert.equal(line(c, [], at('08:10')).rule, null);
  c.monitoring.rules.forEach((r) => (r.enabled = r.type === 'idle'));
  assert.equal(line(c, [record(4, 90)], at('08:00')).rule, null);
  assert.equal(line(c, [record(4, 94)], at('08:10')).rule.type, 'idle');
  c.monitoring.rules.forEach((r) => (r.enabled = true));
  assert.equal(line(c, [record(4, 94)], at('08:10')).matches.length, 3);
});
test('monitoring uses configured output stations and avoids double-counting', () => {
  const c = configuration();
  assert.equal(c.monitoring.outputSources.CD303, 4);
  const l = line(c, [record(3, 200), record(4, 90)]);
  assert.equal(l.actual, 90);
  assert.equal(l.cumulativeGap, -10);
  assert.deepEqual(l.sourceRows, [4]);
  c.monitoring.outputSources.CD303 = 'all';
  assert.equal(line(c, [record(3, 200), record(4, 90)]).actual, 290);
});
test('shared line actuals count once under an old all-stations setting while station target edits stay comparable', () => {
  const c = configuration();
  c.monitoring.outputSources.CD303 = 'all';
  const records = [record(3, 90, 80), record(4, 90, 95)];
  records.forEach((record) => {
    record.slots[0].lineShared = true;
    record.slots[0].targetShared = true;
  });
  const shared = line(c, records);
  assert.equal(shared.source, 'all');
  assert.equal(shared.sharedOutput, true);
  assert.equal(shared.actual, 90);
  assert.equal(shared.target, 95);
  assert.equal(shared.cumulativeGap, -5);
  records[0].slots[1] = { id: 'd2', actual: 3, target: 7 };
  records[1].slots[1] = { id: 'd2', actual: 4, target: 8 };
  const mixed = line(c, records);
  assert.equal(mixed.series.find((slot) => slot.id === 'd1').actual, 90);
  assert.equal(mixed.series.find((slot) => slot.id === 'd2').actual, 7);
  assert.equal(mixed.series.find((slot) => slot.id === 'd2').target, 15);
});
test('shortfall rules honor greater-than and inclusive thresholds', () => {
  const c = configuration();
  assert.equal(line(c, [record(4, 95)]).rule, null);
  assert.equal(line(c, [record(4, 94)]).rule.color, 'yellow');
  assert.equal(line(c, [record(4, 90)]).rule.color, 'red');
  assert.equal(line(c, [record(4, 100)]).cumulativeGap, 0);
  assert.equal(line(c, [record(4, 110)]).rule, null);
});
test('idle timer triggers the 300 and 600 second warning levels', () => {
  const c = configuration();
  assert.equal(line(c, [], at('08:04')).rule, null);
  assert.equal(line(c, [], at('08:05')).rule.color, 'yellow');
  assert.equal(line(c, [], at('08:10')).rule.color, 'red');
  assert.equal(line(c, [], at('08:05')).idleSeconds, 300);
});
test('breaks pause idle counting and do not flash idle alerts', () => {
  const c = configuration(),
    activity = { 4: { lastIncreaseAt: new Date(at('08:59')).toISOString() } };
  const paused = line(c, [record(4, 100)], at('09:05'), activity);
  assert.equal(paused.active, false);
  assert.equal(paused.idleSeconds, 60);
  assert.equal(paused.rule, null);
  assert.equal(line(c, [record(4, 100)], at('09:12'), activity).idleSeconds, 180);
  assert.equal(line(c, [record(4, 100)], at('09:14'), activity).rule.color, 'yellow');
});
test('an output increase resets the idle baseline', () => {
  const c = configuration();
  const l = line(c, [record(4, 100)], at('08:10'), {
    4: { lastIncreaseAt: new Date(at('08:09')).toISOString() },
  });
  assert.equal(l.idleSeconds, 60);
  assert.equal(l.rule, null);
});
test('no idle warning outside the shift or on historical/future reports', () => {
  const c = configuration();
  for (const now of [at('07:59'), at('10:00'), Date.parse('2026-11-05T09:00:00+07:00')]) {
    const l = line(c, [], now);
    assert.equal(l.rule, null);
    assert.equal(l.blink, false);
  }
});
test('stronger colors win when multiple rules match', () => {
  const c = configuration(),
    l = line(c, [record(4, 94)], at('08:10'));
  assert.equal(l.matches.length, 3);
  assert.equal(l.rule.type, 'idle');
  assert.equal(l.status, 'red');
  assert.equal(l.blink, true);
});
test('disabled rules and nonblinking rules are respected', () => {
  const c = configuration();
  for (const r of c.monitoring.rules) r.enabled = false;
  assert.equal(line(c, [record(4, 0)], at('08:10')).rule, null);
  c.monitoring.rules[1].enabled = true;
  c.monitoring.rules[1].blink = false;
  const l = line(c, [record(4, 0)], at('08:10'));
  assert.equal(l.status, 'red');
  assert.equal(l.blink, false);
});
test('missing actual values remain missing rather than becoming zero shortfalls', () => {
  const c = configuration();
  const l = line(c, [record(4, null)], at('08:00'));
  assert.equal(l.actual, null);
  assert.equal(l.cumulativeGap, null);
  assert.equal(l.status, 'neutral');
  assert.equal(line(c, [record(4, 0)], at('08:00')).actual, 0);
});
test('night windows keep midnight intervals on the next calendar day', () => {
  const c = configuration(),
    windows = productionWindows(c, '2026-11-04', 'night');
  assert.equal(new Date(windows[1].startAt).toISOString(), '2026-11-04T17:10:00.000Z');
  const now = Date.parse('2026-11-05T00:14:00+07:00'),
    since = Date.parse('2026-11-04T23:59:00+07:00');
  assert.equal(productiveSeconds(windows, since, now), 300);
  assert.equal(
    line(c, [], now, { 4: { lastIncreaseAt: new Date(since).toISOString() } }, 'night').rule
      .color,
    'yellow',
  );
});

test('historical slots and archived mappings retain their original line and output source', () => {
  const c = configuration(),
    saved = [3, 4].map((id) => ({
      ...record(id, id === 4 ? 90 : 200),
      version: 1,
      rowSnapshot: structuredClone(c.rows.find((row) => row.id === id)),
      defaultsSnapshot: { outputSource: 4 },
      slots: c.schedules.day
        .filter((slot) => slot.kind === 'production')
        .map((slot, index) => ({
          ...slot,
          target: index === 0 ? 100 : null,
          actual: index === 0 ? (id === 4 ? 90 : 200) : null,
        })),
    }));
  c.lines = ['NEW'];
  c.rows = c.rows.map((row) => ({ ...row, line: 'NEW', active: false }));
  c.schedules.day = [{ id: 'new-slot', kind: 'production', start: '10:00', end: '11:00' }];
  c.monitoring.outputSources = { NEW: 'all', CD303: 3 };
  const lines = buildLineMonitor(c, saved, '2026-11-04', 'day', {}, at('12:00')),
    historical = lines.find((line) => line.line === 'CD303');
  assert.ok(historical);
  assert.deepEqual(historical.sourceRows, [4]);
  assert.equal(historical.source, 4);
  assert.equal(historical.sourceLabel, 'Pack');
  assert.equal(historical.actual, 90);
  assert.equal(historical.target, 100);
  assert.equal(historical.cumulativeGap, -10);
  assert.equal(historical.cumulativeTarget, 100);
  assert.equal(historical.cumulativeActual, 90);
  assert.equal(historical.series.find((slot) => slot.id === 'd1').start, '08:00');
  assert.equal(historical.series.filter((slot) => slot.id === 'd1').length, 1);
  assert.equal(lines.find((line) => line.line === 'NEW').actual, null);
  assert.equal(historical.blink, false);
});

test('historical slot union aggregates each saved cell once and preserves all-source semantics', () => {
  const c = configuration(),
    saved = [3, 4].map((id) => ({
      ...record(id, id === 3 ? 200 : 90),
      version: 1,
      rowSnapshot: c.rows.find((row) => row.id === id),
      defaultsSnapshot: { outputSource: 'all' },
      slots: [
        {
          id: 'old-slot',
          start: '07:00',
          end: '08:00',
          target: 100,
          actual: id === 3 ? 200 : 90,
        },
      ],
    }));
  c.rows[1].active = false;
  c.monitoring.outputSources.CD303 = 3;
  const result = line(c, saved, Date.parse('2026-11-05T12:00:00+07:00'));
  assert.equal(result.source, 'all');
  assert.deepEqual(result.sourceRows, [3, 4]);
  assert.equal(result.actual, 290);
  assert.equal(result.target, 200);
  assert.equal(result.series.filter((slot) => slot.id === 'old-slot').length, 1);
  assert.equal(result.series.find((slot) => slot.id === 'old-slot').actual, 290);
  assert.equal(result.series.find((slot) => slot.id === 'd1').actual, null);
});

test('unsaved UI defaults cannot become history or replace a saved snapshot', () => {
  const c = configuration(),
    defaults = {
      rowId: 4,
      configVersion: 9,
      slots: [
        { id: 'd1', start: '00:00', end: '00:20', target: 999, actual: null },
        { id: 'ghost', start: '01:00', end: '02:00', target: 999, actual: null },
      ],
    },
    saved = {
      ...record(4, 0),
      version: 1,
      rowSnapshot: c.rows[1],
      slots: [
        { id: 'd1', start: '08:00', end: '09:00', target: 0, actual: 0 },
        { id: 'old', start: '06:00', end: '07:00', target: 7, actual: 5 },
      ],
    };
  const pending = line(c, [defaults]);
  assert.equal(
    pending.series.some((slot) => slot.id === 'ghost'),
    false,
  );
  assert.equal(pending.target, 999);
  assert.equal(pending.actual, null);
  for (const input of [
    [saved, defaults],
    [defaults, saved],
  ]) {
    const result = line(c, input);
    assert.equal(result.target, 0);
    assert.equal(result.actual, 0);
    assert.equal(result.series.find((slot) => slot.id === 'd1').start, '08:00');
    const archived = line(c, input, Date.parse('2026-11-05T12:00:00+07:00'));
    assert.equal(archived.target, 7);
    assert.equal(archived.actual, 5);
    assert.equal(
      result.series.some((slot) => slot.id === 'ghost'),
      false,
    );
  }
});

test('legacy snapshots without captured output settings use the selected archived station, not every row', () => {
  const c = configuration(),
    saved = [3, 4].map((id) => ({
      ...record(id, id === 3 ? 200 : 90),
      rowSnapshot: { ...c.rows.find((row) => row.id === id) },
      version: 1,
    }));
  c.rows.forEach((row) => {
    row.active = false;
  });
  assert.equal(line(c, saved).actual, 90);
  c.lines = [];
  c.monitoring.outputSources = {};
  const result = buildLineMonitor(c, saved, '2026-11-04', 'day', {}, at('12:00'))[0];
  assert.equal(result.line, 'CD303');
  assert.equal(result.actual, 90);
  assert.deepEqual(result.sourceRows, [4]);
});
