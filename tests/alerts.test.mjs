import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertConfig, evaluateAlerts } from '../public/alerts.js';
import {
  rotatedReason,
  alertReasonText,
  productionStatusText,
} from '../public/alert-display.js';
import { scheduleIssues, schedulePreview } from '../public/schedule-preview.js';
import { locales, translate } from '../public/i18n.js';
const hour = 3600000,
  base = Date.parse('2026-11-04T08:00:00+07:00');
const slot = (id, start, end, actual, target = 100) => ({
  id,
  start: `${8 + start}:00`,
  end: `${8 + end}:00`,
  startAt: base + start * hour,
  endAt: base + end * hour,
  actual,
  target,
});
const series = [slot('a', 0, 1, 100), slot('b', 1.5, 2.5, null), slot('c', 2.5, 3.5, null)];
function evaluate(type, overrides = {}) {
  const settings = alertConfig();
  for (const name of Array.isArray(type) ? type : [type])
    if (name) settings[name].enabled = true;
  return evaluateAlerts({
    series,
    windows: series,
    now: base + 1.25 * hour,
    settings,
    standardUPH: 100,
    deadline: base + 3.5 * hour,
    ...overrides,
  });
}
test('performance uses ended reported slots only, including a submitted zero', () => {
  for (const [actual, severity] of [
    [95, 'green'],
    [94.99, 'yellow'],
    [85, 'yellow'],
    [84.99, 'red'],
    [0, 'red'],
  ]) {
    const values = [slot('a', 0, 1, actual), slot('b', 1, 2, null), slot('c', 2, 3, 9999)];
    const alert = evaluate('performance', {
      series: values,
      windows: values,
      now: base + 2 * hour,
    });
    assert.equal(alert.severity, severity);
    assert.equal(alert.results[0].params.actual, actual);
    assert.equal(alert.results[0].params.target, 100);
  }
  assert.equal(evaluate('performance', { series: [slot('a', 0, 1, null)] }).severity, 'noData');
  assert.equal(
    evaluate('performance', { series: [slot('a', 0, 1, 10, null)] }).severity,
    'noData',
  );
  assert.equal(evaluate('performance', { series: [slot('a', 0, 1, 0, 0)] }).severity, 'noData');
});
test('reporting respects grace, escalation, NULL versus zero, and never demands break or unfinished output', () => {
  const values = [slot('a', 0, 1, null), slot('b', 1.5, 2.5, null)];
  const check = (minutes) =>
    evaluate('reporting', {
      series: values,
      windows: values,
      now: base + hour + minutes * 60000,
    });
  assert.equal(check(10).severity, 'green');
  assert.equal(check(10.01).severity, 'yellow');
  assert.equal(check(40).severity, 'yellow');
  assert.equal(check(40.01).severity, 'red');
  assert.equal(check(30).results[0].params.count, 1);
  assert.equal(evaluate('reporting', { series: [slot('a', 0, 1, 0)] }).severity, 'green');
  assert.equal(
    evaluate('reporting', { series: [slot('break', 1, 1.25, null)], windows: [] }).severity,
    'noData',
  );
  assert.equal(evaluate('reporting', { now: base }).severity, 'green');
});
test('completion forecasts from the contiguous prefix, not recent averages or the wall clock', () => {
  const alert = evaluate('completion');
  assert.equal(alert.severity, 'green');
  assert.equal(alert.results[0].params.cutoff, base + hour);
  assert.equal(alert.results[0].params.hours, '2.00'); // 30 minute break excluded
  assert.equal(alert.results[0].params.remaining, 200);
  assert.equal(alert.results[0].params.rate, '100');
  assert.equal(
    evaluate('completion', { now: base + 1.75 * hour }).results[0].params.hours,
    '2.00',
  );
  const gap = [series[0], series[1], { ...series[2], actual: 999 }];
  const stale = evaluate('completion', { series: gap, now: base + 3.6 * hour });
  assert.equal(stale.results[0].params.cutoff, base + hour);
  assert.equal(stale.results[0].params.remaining, 200);
  assert.equal(stale.severity, 'noData');
  assert.equal(stale.stale, true);
});
test('completion capacity thresholds, deadlines, zero balance, missing standards and unconfirmed aggregate', () => {
  assert.equal(evaluate('completion', { standardUPH: 100 / 1.1 }).severity, 'yellow');
  assert.equal(evaluate('completion', { standardUPH: 90 }).severity, 'red');
  assert.equal(evaluate('completion', { deadline: base + 2 * hour }).severity, 'red');
  assert.equal(evaluate('completion', { standardUPH: null }).severity, 'noData');
  assert.equal(evaluate('completion', { deadline: NaN }).severity, 'noData');
  assert.equal(
    evaluate('completion', { series: [{ ...series[0], reported: false }] }).severity,
    'noData',
  );
  assert.equal(
    evaluate('completion', { series: [{ ...series[0], targetComplete: false }] }).severity,
    'noData',
  );
  const done = series.map((value) => ({ ...value, actual: 100 }));
  assert.equal(
    evaluate('completion', { series: done, now: base + 4 * hour }).severity,
    'green',
  );
  assert.equal(evaluate('completion', { now: base }).severity, 'noData');
});
test('overall signal retains highest severity, unknown prevents false green, disabled is gray', () => {
  assert.equal(evaluate(null).severity, 'disabled');
  assert.equal(
    evaluate(['performance', 'completion'], { standardUPH: null }).severity,
    'noData',
  );
  const red = evaluate(['performance', 'reporting'], { series: [{ ...series[0], actual: 0 }] });
  assert.equal(red.severity, 'red');
  const legacy = evaluate('completion', {
    standardUPH: null,
    legacyEnabled: true,
    legacy: [
      { id: 'gap', type: 'gap', color: 'red', value: 30, threshold: 10, comparison: 'gte' },
    ],
  });
  assert.equal(legacy.severity, 'red');
  assert.equal(legacy.reasons[0].id, 'legacy-gap');
  assert.equal(
    evaluate(null, {
      legacyEnabled: true,
      legacy: [{ id: 'blue', color: 'blue', type: 'gap' }],
    }).severity,
    'yellow',
  );
});
test('reason carousel starts with highest severity and resets immediately after a rule is cleared', () => {
  const alert = evaluate(['completion', 'reporting'], {
    standardUPH: 50,
    now: base + 2.75 * hour,
  });
  assert.equal(alert.reasons[0].severity, 'red');
  assert.equal(rotatedReason(alert, 1000, 'rotation-test').id, alert.reasons[0].id);
  assert.equal(rotatedReason(alert, 5999, 'rotation-test').id, alert.reasons[0].id);
  assert.equal(rotatedReason(alert, 6000, 'rotation-test').id, alert.reasons[1].id);
  assert.equal(alert.severity, 'red');
  const cleared = { ...alert, reasons: [alert.reasons[1]] };
  assert.equal(rotatedReason(cleared, 6001, 'rotation-test').id, cleared.reasons[0].id);
});
test('all alert messages, settings and production states translate in every existing language', () => {
  const scenarios = [
    evaluate('performance'),
    evaluate('completion'),
    evaluate('completion', { standardUPH: null }),
    evaluate('reporting'),
    evaluate('reporting', { series: [{ ...series[0], actual: null }], now: base + 2 * hour }),
    evaluate(null, {
      legacyEnabled: true,
      legacy: [
        {
          id: 'idle',
          type: 'idle',
          color: 'yellow',
          value: 300,
          threshold: 200,
          comparison: 'gte',
        },
      ],
    }),
  ];
  for (const lang of locales) {
    const t = (key, params) => translate(lang, key, params);
    for (const alert of scenarios)
      for (const reason of alert.results) {
        const text = alertReasonText(reason, t);
        assert.doesNotMatch(text, /alert[A-Z_]|\{\w+\}/);
      }
    for (const state of [
      'activeMonitoring',
      'breakMonitoring',
      'futureShift',
      'historicalShift',
    ])
      assert.doesNotMatch(productionStatusText({ periodState: state }, t), /Monitoring|Shift/);
  }
});
test('schedule diagnostics catch overlap, invalid duration and clock times across midnight', () => {
  const schedules = {
    day: [{ id: 'd', kind: 'production', start: '08:00', end: '09:00' }],
    night: [{ id: 'n', kind: 'production', start: '23:00', end: '01:00' }],
  };
  assert.deepEqual(scheduleIssues(schedules), []);
  assert.ok(
    scheduleIssues({
      ...schedules,
      day: [...schedules.day, { kind: 'break', start: '08:30', end: '09:10' }],
    }).includes('errOverlap'),
  );
  assert.ok(
    scheduleIssues({
      ...schedules,
      day: [{ kind: 'production', start: '00:30', end: '02:00' }],
    }).includes('errOverlap'),
  );
  for (const [start, end, code] of [
    ['08:00', '08:00', 'errTime'],
    ['08:00', '21:00', 'errDuration'],
    ['25:00', '09:00', 'errTime'],
  ])
    assert.ok(
      scheduleIssues({ ...schedules, day: [{ kind: 'production', start, end }] }).includes(
        code,
      ),
    );
  for (const lang of locales) {
    const html = schedulePreview({ lines: [], productionUnits: [] }, schedules, '', {
      t: (key, params) => translate(lang, key, params),
      esc: String,
    });
    assert.match(html, /schedule-timeline/);
    assert.doesNotMatch(html, /scheduleTimeline|scheduleTargetHelp|scheduleValid/);
  }
});

test('duplicate legacy thresholds collapse to one most-severe reason and unknown targets cannot be green', () => {
  const alert = evaluate(null, {
    legacyEnabled: true,
    legacy: [
      { id: 'gap-yellow', type: 'gap', threshold: 5, color: 'yellow' },
      { id: 'gap-red', type: 'gap', threshold: 10, color: 'red' },
    ],
  });
  assert.equal(alert.results.length, 1);
  assert.equal(alert.results[0].id, 'legacy-gap-red');
  assert.equal(
    evaluate(null, {
      legacyEnabled: true,
      legacyNeedsTarget: true,
      series: [{ ...series[0], target: null }],
    }).severity,
    'noData',
  );
});

test('overnight source monitoring keeps midnight, break and whole-day alert calculations consistent', async () => {
  const { buildLineMonitor, defaultMonitoring } = await import('../public/monitor.js');
  const config = {
    lines: ['L'],
    models: ['M'],
    rows: [{ id: 1, line: 'L', model: 'M', station: 'Pack', active: true }],
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 300 }],
    schedules: {
      day: [{ id: 'd', kind: 'production', start: '08:00', end: '09:00' }],
      night: [
        { id: 'n1', kind: 'production', start: '23:00', end: '00:00' },
        { id: 'nb', kind: 'break', start: '00:00', end: '00:30' },
        { id: 'n2', kind: 'production', start: '00:30', end: '01:30' },
      ],
    },
  };
  config.monitoring = defaultMonitoring(config);
  config.monitoring.rules = [];
  config.monitoring.unified = alertConfig();
  for (const rule of Object.values(config.monitoring.unified)) rule.enabled = true;
  config.monitoring.capacity = { '["L","M"]': { standardUPH: 200, deadline: '01:30' } };
  const records = [
    {
      rowId: 1,
      slots: [
        { ...config.schedules.day[0], target: 100, actual: 100 },
        { ...config.schedules.night[0], target: 100, actual: 0 },
        { ...config.schedules.night[2], target: 100, actual: null },
      ],
    },
  ];
  const now = Date.parse('2026-11-05T00:15:00+07:00');
  const whole = buildLineMonitor(config, records, '2026-11-04', 'all', {}, now)[0];
  assert.equal(whole.periodState, 'breakMonitoring');
  assert.equal(whole.unified.severity, 'red');
  const risk = whole.unified.results.find((result) => result.id === 'completion');
  assert.equal(risk.params.cutoff, Date.parse('2026-11-05T00:00:00+07:00'));
  assert.equal(risk.params.hours, '1.00');
  assert.equal(risk.params.remaining, 200);
  assert.equal(risk.severity, 'green');
  assert.equal(
    whole.unified.results.find((result) => result.id === 'reporting').severity,
    'green',
  );
  const selected = buildLineMonitor(
    config,
    [{ rowId: 1, slots: [records[0].slots[1], records[0].slots[2]] }],
    '2026-11-04',
    'night',
    {},
    now,
    records,
  )[0];
  assert.deepEqual(selected.unified, whole.unified);
  const afterEnd = buildLineMonitor(
    config,
    records,
    '2026-11-04',
    'all',
    {},
    Date.parse('2026-11-05T02:20:00+07:00'),
  )[0];
  assert.equal(
    afterEnd.unified.results.find((result) => result.id === 'reporting').severity,
    'red',
  );
});

test('an aggregate source with a missing station report cannot masquerade as confirmed output', async () => {
  const { buildLineMonitor, defaultMonitoring } = await import('../public/monitor.js');
  const config = {
    lines: ['L'],
    rows: [1, 2].map((id) => ({ id, line: 'L', model: 'M', active: true })),
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 100 }],
    schedules: {
      day: [{ id: 'd', kind: 'production', start: '08:00', end: '09:00' }],
      night: [],
    },
  };
  config.monitoring = defaultMonitoring(config);
  config.monitoring.outputSources.L = 'all';
  config.monitoring.rules = [];
  config.monitoring.unified = alertConfig();
  config.monitoring.unified.performance.enabled = true;
  config.monitoring.unified.reporting.enabled = true;
  const records = [1, 2].map((rowId) => ({
    rowId,
    slots: [{ id: 'd', target: 100, actual: rowId === 1 ? 100 : null }],
  }));
  const line = buildLineMonitor(
    config,
    records,
    '2026-11-04',
    'day',
    {},
    base + 1.25 * hour,
  )[0];
  assert.equal(line.actual, 100); // Partial display total is still useful.
  assert.equal(
    line.unified.results.find((result) => result.id === 'performance').severity,
    'noData',
  );
  assert.equal(
    line.unified.results.find((result) => result.id === 'reporting').severity,
    'yellow',
  );
  records[1].slots[0].actual = 0;
  const completed = buildLineMonitor(
    config,
    records,
    '2026-11-04',
    'day',
    {},
    base + 1.25 * hour,
  )[0];
  assert.equal(
    completed.unified.results.find((result) => result.id === 'reporting').severity,
    'green',
  );
  assert.equal(
    completed.unified.results.find((result) => result.id === 'performance').params.rate,
    '50',
  );
});

test('archived alerts use the saved schedule without inventing missing intervals from a new plan', async () => {
  const { buildLineMonitor, defaultMonitoring } = await import('../public/monitor.js');
  const config = {
    lines: ['L'],
    models: ['M'],
    rows: [{ id: 1, line: 'L', model: 'M', active: true }],
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 100 }],
    schedules: {
      day: [{ id: 'new', kind: 'production', start: '10:00', end: '11:00' }],
      night: [],
    },
  };
  config.monitoring = defaultMonitoring(config);
  config.monitoring.rules = [];
  config.monitoring.unified = alertConfig();
  for (const rule of Object.values(config.monitoring.unified)) rule.enabled = true;
  config.monitoring.capacity = { '["L","M"]': { standardUPH: 100 } };
  const records = [
    {
      rowId: 1,
      version: 1,
      rowSnapshot: config.rows[0],
      slots: [{ id: 'old', start: '08:00', end: '09:00', target: 100, actual: 100 }],
    },
  ];
  const line = buildLineMonitor(
    config,
    records,
    '2026-11-04',
    'day',
    {},
    Date.parse('2026-11-05T12:00:00+07:00'),
  )[0];
  assert.equal(line.unified.severity, 'green');
  assert.equal(
    line.unified.results.find((result) => result.id === 'completion').params.remaining,
    0,
  );
  assert.equal(
    line.unified.results.find((result) => result.id === 'reporting').severity,
    'green',
  );
});

test('renaming or retiring line/model catalogs migrates or removes capacity presets', async () => {
  const { renameCatalogItem, removeCatalogItem } =
    await import('../public/catalog-settings.js');
  const preset = { standardUPH: 123, deadline: '01:30' };
  const config = {
    lines: ['L'],
    models: ['M'],
    rows: [],
    personnel: [],
    productionUnits: [{ line: 'L', model: 'M' }],
    monitoring: { capacity: { '["L","M"]': preset } },
  };
  renameCatalogItem(config, 'lines', 'L', 'L2');
  renameCatalogItem(config, 'models', 'M', 'M2');
  assert.deepEqual(config.monitoring.capacity, { '["L2","M2"]': preset });
  removeCatalogItem(config, 'models', 'M2');
  assert.deepEqual(config.monitoring.capacity, {});
});

test('a night shift starting after midnight keeps the production-day date when filtered alone', async () => {
  const { buildLineMonitor, defaultMonitoring, productionWindows, monitoringPeriodState } =
    await import('../public/monitor.js');
  const config = {
    lines: ['L'],
    rows: [{ id: 1, line: 'L', active: true }],
    schedules: {
      day: [{ id: 'd', kind: 'production', start: '08:00', end: '09:00' }],
      night: [{ id: 'n', kind: 'production', start: '00:00', end: '01:00' }],
    },
  };
  config.monitoring = defaultMonitoring(config);
  config.monitoring.rules = [];
  config.monitoring.unified = alertConfig();
  config.monitoring.unified.reporting.enabled = true;
  const now = Date.parse('2026-11-05T00:10:00+07:00');
  assert.equal(
    productionWindows(config, '2026-11-04', 'night')[0].startAt,
    Date.parse('2026-11-05T00:00:00+07:00'),
  );
  assert.equal(monitoringPeriodState(config, '2026-11-04', 'night', now), 'activeMonitoring');
  const line = buildLineMonitor(
    config,
    [
      {
        rowId: 1,
        version: 1,
        slots: [{ ...config.schedules.night[0], actual: null, target: 100 }],
      },
    ],
    '2026-11-04',
    'night',
    {},
    now,
  )[0];
  assert.equal(line.series[0].startAt, Date.parse('2026-11-05T00:00:00+07:00'));
  assert.equal(line.unified.results[0].severity, 'green'); // Still unfinished, not overdue.
});

test('reason percentages retain enough precision to explain a threshold crossing', () => {
  const values = [{ ...series[0], actual: 94.999 }];
  const performance = evaluate('performance', { series: values });
  assert.equal(performance.severity, 'yellow');
  assert.equal(performance.results[0].params.rate, '94.999');
  const risk = evaluate('completion', { standardUPH: 100 / 1.10001 });
  assert.equal(risk.severity, 'red');
  assert.equal(risk.results[0].params.rate, '110.001');
});
