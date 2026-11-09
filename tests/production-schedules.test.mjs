import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentEntrySlot } from '../public/entry.js';
import { normalizeSchedules } from '../schedule-config.mjs';
import {
  schedulesForLine,
  scheduleFor,
  scheduleCatalog,
} from '../public/production-schedules.js';
import { allocateDailyTarget } from '../public/production-targets.js';
import { buildProductionDefaults } from '../production-defaults.mjs';
import { buildLineMonitor, currentScheduleInterval } from '../public/monitor.js';

const template = {
  day: [
    { id: 'd1', start: '08:00', end: '09:00', kind: 'production' },
    { id: 'b1', start: '09:00', end: '09:10', kind: 'break' },
    { id: 'd2', start: '09:10', end: '10:00', kind: 'production' },
  ],
  night: [{ id: 'n1', start: '20:00', end: '21:00', kind: 'production' }],
};
const custom = {
  day: [
    { id: 'a1', start: '08:00', end: '08:30', kind: 'production' },
    { id: 'ab', start: '08:30', end: '08:40', kind: 'break' },
    { id: 'a2', start: '08:40', end: '10:00', kind: 'production' },
  ],
  night: structuredClone(template.night),
};
const fail = (status, code) => {
  throw Object.assign(new Error(code), { status });
};

test('line copies retain unchanged template IDs and isolate edits, including overnight validation', () => {
  const copy = structuredClone(template);
  copy.day[0].end = '08:50';
  copy.day[1].start = '08:50';
  const normalized = normalizeSchedules(copy, template, fail);
  assert.notEqual(normalized.day[0].id, 'd1');
  assert.notEqual(normalized.day[1].id, 'b1');
  assert.equal(normalized.day[2].id, 'd2');
  assert.equal(normalized.night[0].id, 'n1');
  assert.equal(template.day[0].end, '09:00');
  const overlap = structuredClone(custom);
  overlap.night[0] = { start: '09:30', end: '11:00', kind: 'production' };
  assert.throws(() => normalizeSchedules(overlap, custom, fail), /errOverlap/);
  const overnight = {
    day: template.day,
    night: [
      { id: 'late', start: '23:00', end: '00:30', kind: 'production' },
      { id: 'pause', start: '00:30', end: '00:40', kind: 'break' },
      { id: 'early', start: '00:40', end: '01:30', kind: 'production' },
    ],
  };
  assert.equal(normalizeSchedules(overnight, template, fail).night.length, 3);
});

test('template inheritance and line-specific allocation preserve exact daily totals across models', () => {
  const config = { lines: ['A', 'B'], schedules: template, lineSchedules: { A: custom } };
  assert.equal(schedulesForLine(config, 'A'), custom);
  assert.equal(schedulesForLine(config, 'B'), template);
  assert.equal(scheduleFor(config, 'A', 'all').length, 4);
  assert.ok(scheduleCatalog(config, 'day').some((slot) => slot.id === 'a1'));
  assert.ok(scheduleCatalog(config, 'day').some((slot) => slot.id === 'd1'));
  const allocations = ['A', 'B'].map((line) => allocateDailyTarget(config, 170, line));
  assert.equal(
    allocations[0].reduce((sum, slot) => sum + slot.target, 0),
    170,
  );
  assert.equal(
    allocations[1].reduce((sum, slot) => sum + slot.target, 0),
    170,
  );
  assert.equal(allocations[0][0].target, 30);
  assert.equal(allocations[1][0].target, 60);
  delete config.lineSchedules.A;
  assert.equal(schedulesForLine(config, 'A'), template);
});

test('monitoring, target defaults and idle alerts follow each physical line’s break', () => {
  const config = {
    lines: ['A', 'B'],
    models: ['M'],
    schedules: template,
    lineSchedules: { A: custom },
    rows: [
      { id: 1, line: 'A', model: 'M', active: true },
      { id: 2, line: 'B', model: 'M', active: true },
    ],
    productionUnits: ['A', 'B'].map((line) => ({
      line,
      model: 'M',
      dailyTarget: 170,
      staffing: { day: [], night: [], owners: [] },
    })),
    monitoring: {
      groups: [],
      unitOutputSources: {},
      outputSources: {},
      rules: [
        {
          id: 'idle',
          enabled: true,
          type: 'idle',
          comparison: 'gt',
          threshold: 0,
          color: 'yellow',
        },
      ],
    },
  };
  const defaults = buildProductionDefaults(config, 'day');
  assert.equal(defaults[1].slots[0].id, 'a1');
  assert.equal(defaults[1].slots[0].target, 30);
  assert.equal(defaults[2].slots[0].id, 'd1');
  const now = Date.parse('2026-11-09T08:35:00+07:00');
  const lines = buildLineMonitor(config, Object.values(defaults), '2026-11-09', 'day', {}, now);
  assert.equal(lines.find((line) => line.line === 'A').periodState, 'breakMonitoring');
  assert.equal(lines.find((line) => line.line === 'A').currentTarget, null);
  assert.equal(lines.find((line) => line.line === 'A').rule, null);
  assert.equal(lines.find((line) => line.line === 'B').currentTarget, 60);
  assert.equal(lines.find((line) => line.line === 'B').rule.type, 'idle');
  assert.equal(
    currentScheduleInterval({ schedules: custom }, '2026-11-09', 'day', now).id,
    'ab',
  );
});

test('current-slot entry navigation uses the selected line and skips its own break', () => {
  const config = { schedules: template, lineSchedules: { A: custom } };
  const context = { config, date: '2026-11-09' };
  const atBreak = new Date('2026-11-09T08:35:00+07:00');
  assert.equal(currentEntrySlot(context, atBreak, 'A'), null);
  assert.equal(currentEntrySlot(context, atBreak, 'B').id, 'd1');
  assert.equal(currentEntrySlot(context, new Date('2026-11-09T08:45:00+07:00'), 'A').id, 'a2');
});

test('current and future entry hide deleted CONFIG intervals while archived dates retain saved data', async () => {
  const { reportSchedule } = await import('../public/production-schedules.js');
  const config = { schedules: custom, lineSchedules: { B: template } };
  const saved = [{ ...template.day[0], target: 12, actual: 0, issue: 'Kept in storage' }];
  const before = structuredClone(saved),
    now = Date.parse('2026-11-09T08:35:00+07:00');
  assert.deepEqual(
    reportSchedule(config, 'A', 'day', '2026-11-09', saved, now).map((slot) => slot.id),
    ['a1', 'a2'],
  );
  assert.deepEqual(
    reportSchedule(config, 'A', 'day', '2099-01-01', saved, now).map((slot) => slot.id),
    ['a1', 'a2'],
  );
  assert.deepEqual(reportSchedule(config, 'A', 'day', '2001-01-01', saved, now), saved);
  assert.equal(reportSchedule(config, 'B', 'day', '2026-11-09', saved, now)[0].id, 'd1');
  assert.deepEqual(saved, before);
  const overnight = {
    schedules: {
      day: template.day,
      night: [{ id: 'night-new', start: '23:00', end: '01:00', kind: 'production' }],
    },
  };
  assert.equal(
    reportSchedule(
      overnight,
      'A',
      'night',
      '2026-11-09',
      saved,
      Date.parse('2026-11-10T00:30:00+07:00'),
    )[0].id,
    'night-new',
  );
  assert.equal(
    reportSchedule(
      overnight,
      'A',
      'night',
      '2026-11-09',
      saved,
      Date.parse('2026-11-10T02:00:00+07:00'),
    )[0].id,
    'd1',
  );
});

test('editing the default template isolates existing lines until an explicit subset is applied', async () => {
  const { editScheduleTemplate, applyScheduleTemplate } =
    await import('../public/production-schedules.js');
  const config = { lines: ['A', 'B'], schedules: structuredClone(template) };
  const editable = editScheduleTemplate(config);
  editable.day[0].end = '08:50';
  editable.day[1].start = '08:50';
  assert.equal(config.lineSchedules.A.day[0].end, '09:00');
  assert.equal(config.lineSchedules.B.day[0].end, '09:00');
  assert.equal(applyScheduleTemplate(config, 'default', ['A']), true);
  assert.equal(config.lineSchedules.A.day[0].end, '08:50');
  assert.equal(config.lineSchedules.B.day[0].end, '09:00');
  editable.day[0].end = '08:45';
  assert.equal(config.lineSchedules.A.day[0].end, '08:50');
  const before = JSON.stringify(config);
  assert.equal(applyScheduleTemplate(config, 'default', ['A', 'unknown']), false);
  assert.equal(JSON.stringify(config), before);
});

test('named templates remain independent and reuse normalized IDs when applied in the same save', async () => {
  const { scheduleTemplate, editScheduleTemplate, applyScheduleTemplate } =
    await import('../public/production-schedules.js');
  const config = {
    lines: ['A', 'B'],
    schedules: structuredClone(template),
    scheduleTemplates: [
      { id: 'saved-one', name: 'Short break', schedules: structuredClone(template) },
      { id: 'saved-two', name: 'Long break', schedules: structuredClone(custom) },
    ],
  };
  const raw = editScheduleTemplate(config, 'saved-one');
  raw.day[0].end = '08:50';
  raw.day[1].start = '08:50';
  assert.equal(config.schedules.day[0].end, '09:00');
  assert.equal(scheduleTemplate(config, 'saved-two').schedules.day[0].end, '08:30');
  assert.equal(config.lineSchedules, undefined);
  applyScheduleTemplate(config, 'saved-one', ['A', 'B']);
  const normalized = normalizeSchedules(raw, template, fail);
  const references = [{ input: raw, output: normalized }];
  const a = normalizeSchedules(config.lineSchedules.A, template, fail, references);
  const b = normalizeSchedules(config.lineSchedules.B, template, fail, references);
  assert.equal(a.day[0].id, normalized.day[0].id);
  assert.equal(b.day[0].id, normalized.day[0].id);
  assert.equal(a.day[2].id, 'd2');
});
