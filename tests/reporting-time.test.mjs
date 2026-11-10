import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertConfig, evaluateAlerts, validAlertConfig } from '../public/alerts.js';
import { productionWindows } from '../public/monitor.js';
const end = Date.parse('2026-11-10T13:00:00+07:00');
function evaluate(minutes, reporting, actual = null) {
  const values = [
    {
      id: 'slot',
      start: '12:40',
      end: '13:00',
      startAt: end - 20 * 60000,
      endAt: end,
      target: 20,
      actual,
    },
  ];
  const settings = alertConfig({ unified: { reporting: { enabled: true, ...reporting } } });
  return evaluateAlerts({
    series: values,
    windows: values,
    now: end + minutes * 60000,
    settings,
  });
}
test('CD303 example: grace 30 and absolute red 45 stay 45, not 75', () => {
  const reporting = { graceMinutes: 30, redAfterMinutes: 45 };
  assert.equal(evaluate(30, reporting).severity, 'green');
  assert.equal(evaluate(35, reporting).severity, 'yellow');
  assert.equal(evaluate(35, reporting).results[0].params.red, 45);
  assert.equal(evaluate(45, reporting).severity, 'yellow');
  assert.equal(evaluate(45.01, reporting).severity, 'red');
  assert.equal(evaluate(35, reporting, 0).severity, 'green');
});
test('legacy extra delays migrate once, retaining effective thresholds and data', () => {
  const input = { unified: { reporting: { enabled: true, graceMinutes: 30, redMinutes: 45 } } };
  const config = alertConfig(input);
  assert.equal(config.reporting.redAfterMinutes, 75);
  assert.equal(Object.hasOwn(config.reporting, 'redMinutes'), false);
  assert.deepEqual(alertConfig({ unified: config }), config);
  assert.equal(input.unified.reporting.redMinutes, 45);
  assert.equal(evaluate(46, { graceMinutes: 30, redMinutes: 45 }).severity, 'yellow');
  assert.equal(evaluate(75.01, { graceMinutes: 30, redMinutes: 45 }).severity, 'red');
  assert.equal(
    alertConfig({ unified: { reporting: { graceMinutes: 30 } } }).reporting.redAfterMinutes,
    60,
  );
});
test('absolute red limits use the same end-of-slot base for several time lengths', () => {
  for (const redAfterMinutes of [30, 45, 60, 75, 90]) {
    assert.equal(
      evaluate(redAfterMinutes - 0.01, { graceMinutes: 10, redAfterMinutes }).severity,
      'yellow',
    );
    assert.equal(
      evaluate(redAfterMinutes + 0.01, { graceMinutes: 10, redAfterMinutes }).severity,
      'red',
    );
    assert.equal(
      evaluate(redAfterMinutes + 0.01, { graceMinutes: 10, redAfterMinutes }).results[0].params
        .red,
      redAfterMinutes,
    );
  }
  assert.equal(
    validAlertConfig({
      unified: { reporting: { enabled: true, graceMinutes: 46, redAfterMinutes: 45 } },
    }),
    false,
  );
});
test('actual production windows retain 45 and 75 minutes, including midnight; breaks are separate', () => {
  for (const [start, endTime, duration] of [
    ['08:00', '08:45', 45],
    ['08:00', '09:15', 75],
    ['23:30', '00:15', 45],
    ['23:30', '00:45', 75],
  ]) {
    const config = {
      schedules: {
        day: [
          { id: 'p', kind: 'production', start, end: endTime },
          { id: 'b', kind: 'break', start: '12:00', end: '12:30' },
        ],
        night: [],
      },
    };
    const windows = productionWindows(config, '2026-11-10', 'day');
    assert.equal(windows.length, 1);
    assert.equal((windows[0].endAt - windows[0].startAt) / 60000, duration);
  }
});
