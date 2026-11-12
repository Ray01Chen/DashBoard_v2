import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achievement, slotPresentation, monitorCard } from '../public/monitor-ui.js';
import {
  cycleReason,
  rotatedReason,
  productionState,
  alertReasonText,
} from '../public/alert-display.js';
import { translate, locales } from '../public/i18n.js';
const date = '2026-11-11',
  at = (clock) => Date.parse(`${date}T${clock}:00+07:00`);
const config = {
  schedules: {
    day: [
      { id: 'p1', kind: 'production', start: '08:00', end: '09:00' },
      { id: 'b1', kind: 'break', start: '09:00', end: '09:10' },
      { id: 'p2', kind: 'production', start: '09:10', end: '10:00' },
    ],
    night: [],
  },
  monitoring: {},
};
const series = [
  {
    id: 'p1',
    start: '08:00',
    end: '09:00',
    startAt: at('08:00'),
    endAt: at('09:00'),
    target: 100,
    actual: 0,
  },
];
const reason = {
  id: 'performance',
  severity: 'red',
  key: 'alertPerformanceReason',
  params: { actual: 0, target: 100, rate: '0', green: 95, red: 85 },
};
const line = {
  line: 'L',
  model: 'M',
  key: 'L',
  status: 'red',
  unified: { severity: 'red', reasons: [reason], results: [reason] },
  currentSlot: config.schedules.day[1],
  periodState: 'breakMonitoring',
  series,
  currentActual: null,
  currentTarget: null,
  currentGap: null,
};
const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
test('display achievement preserves NULL and submitted zero without dividing by zero', () => {
  assert.equal(achievement(null, 100), null);
  assert.equal(achievement(0, 100), 0);
  assert.equal(achievement(99, 100), 99);
  assert.equal(achievement(10, 0), null);
  assert.equal(achievement(10, null), null);
});
test('slot summary separates break, next production and the last ended interval', () => {
  const ctx = { config, date, shift: 'day', now: at('09:05') };
  const view = slotPresentation(line, ctx);
  assert.equal(view.state, 'onBreak');
  assert.equal(view.slot.id, 'b1');
  assert.equal(view.next.id, 'p2');
  assert.equal(view.label, 'currentInterval');
  const ended = slotPresentation(
    { ...line, currentSlot: null, periodState: 'historicalShift' },
    { ...ctx, now: at('10:20') },
  );
  assert.equal(ended.state, 'completed');
  assert.equal(ended.slot.id, 'p1');
  assert.equal(ended.label, 'previousSlot');
  const upcoming = slotPresentation(
    { ...line, currentSlot: null, periodState: 'futureShift' },
    { ...ctx, now: at('07:00') },
  );
  assert.equal(upcoming.slot.id, 'p1');
  assert.equal(upcoming.label, 'nextSlot');
  assert.equal(
    productionState({ ...line, periodState: 'outsideShift' }, at('09:05')),
    'completed',
  );
});
test('slot summary follows each line configuration and an after-midnight production day', () => {
  const custom = {
    ...config,
    lineSchedules: {
      L: {
        day: config.schedules.day,
        night: [{ id: 'n1', kind: 'production', start: '00:00', end: '01:00' }],
      },
    },
  };
  const now = Date.parse('2026-11-12T00:05:00+07:00');
  const view = slotPresentation(
    {
      ...line,
      periodState: 'activeMonitoring',
      currentSlot: { id: 'n1', start: '00:00', end: '01:00' },
    },
    { config: custom, date, shift: 'night', now },
  );
  assert.equal(view.state, 'producing');
  assert.equal(view.slot.id, 'n1');
  assert.equal(view.next, undefined);
});
test('manual reason paging shares the automatic cadence while keeping the highest light', () => {
  const alert = {
    severity: 'red',
    reasons: [
      reason,
      { id: 'reporting', severity: 'yellow', key: 'alertReportingOK', params: { grace: 10 } },
    ],
  };
  assert.equal(rotatedReason(alert, 1000, 'ui-cycle', date).id, 'performance');
  cycleReason(alert, 1500, 'ui-cycle', date, 1);
  assert.equal(rotatedReason(alert, 1501, 'ui-cycle', date).id, 'reporting');
  assert.equal(alert.severity, 'red');
  assert.equal(rotatedReason(alert, 6500, 'ui-cycle', date).id, 'performance');
  cycleReason(alert, 6600, 'ui-cycle', date, -1);
  assert.equal(rotatedReason(alert, 6601, 'ui-cycle', date).id, 'reporting');
});
test('horizontal cards translate all information bands, expose complete reasons and escape identities', () => {
  for (const language of locales) {
    const html = monitorCard(
      { ...line, line: 'L<script>', model: 'M<img>', sourceLabel: 'Pack<script>' },
      {
        config,
        date,
        shift: 'day',
        now: at('09:05'),
        metricScope: 'interval',
        t: (key, params) => translate(language, key, params),
        esc,
        number: (value) => (value == null ? '—' : String(value)),
        icon: () => '',
      },
      '<span data-metric="currentTarget"></span>',
    );
    assert.doesNotMatch(
      html,
      /<script>|<img>|achievementRate|openProductionDetails|alertPerformanceReason/,
    );
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /data-line-expand/);
    assert.match(html, /data-card-alert-list/);
    assert.match(html, /data-achievement/);
    assert.equal((html.match(/09:00–09:10/g) || []).length, 1);
    assert.doesNotMatch(
      html,
      /data-next-slot|09:10–10:00|data-expanded-period|card-period-summary/,
    );
  }
});

test('reason presentation rounds numeric tails without changing thresholds or source data', () => {
  const input = {
    key: 'reason',
    params: {
      rate: '89.677419355',
      planned: 116.129032258,
      required: '132.56789',
      actual: 139,
      cutoff: at('09:00'),
    },
  };
  const text = alertReasonText(input, (key, params) =>
    key === 'reason' ? JSON.stringify(params) : key,
  );
  const result = JSON.parse(text);
  assert.equal(result.rate, 89.68);
  assert.equal(result.planned, 116.13);
  assert.equal(result.required, 132.57);
  assert.equal(result.actual, 139);
  assert.equal(result.cutoff, '2026-11-11 09:00');
  assert.equal(input.params.rate, '89.677419355');
});
