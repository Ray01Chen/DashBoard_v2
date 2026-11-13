import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overviewRows,
  overviewChanges,
  mergeOverviewReset,
} from '../public/overview-inline.js';
import { planStationReset } from '../line-production.mjs';
import { reportDefaultTarget } from '../public/production-targets.js';

test('overview station editor uses configured station order, keeps NULL/zero/notes and excludes foreign or no-output stations', () => {
  const config = {
    rows: [
      { id: 2, line: 'L', model: 'M', job: 'PD', station: 'Input', active: true },
      { id: 1, line: 'L', model: 'M', job: 'TE', station: 'Pack', active: true },
      { id: 3, line: 'OTHER', model: 'M', active: true },
      { id: 4, line: 'L', model: 'M', active: true, hasOutput: false },
      { id: 5, line: 'L', model: 'M', active: false },
    ],
  };
  const report = {
    records: [
      {
        rowId: 2,
        version: 4,
        slots: [
          {
            id: 'old-id',
            start: '08:00',
            end: '09:00',
            target: 0,
            actual: 0,
            issue: ' note\nkept ',
          },
        ],
      },
    ],
    defaults: {
      1: {
        slots: [
          { id: 'new-id', start: '08:00', end: '09:00', target: 20, actual: null, issue: '' },
        ],
      },
    },
    rowVersions: { 1: 7 },
  };
  const rows = overviewRows(
    config,
    report,
    { line: 'L', model: 'M' },
    { start: '08:00', end: '09:00' },
  );
  assert.deepEqual(
    rows.map((item) => item.row.id),
    [2, 1],
  );
  assert.deepEqual(
    rows.map((item) => item.version),
    [4, 7],
  );
  assert.deepEqual(overviewChanges(rows), { valid: true, rows: [] });
  rows[0].draft.actual = '12';
  rows[1].draft.target = '';
  rows[1].draft.issue = 'New issue';
  assert.deepEqual(overviewChanges(rows), {
    valid: true,
    rows: [
      { rowId: 2, values: { actual: 12 } },
      { rowId: 1, values: { target: null, issue: 'New issue' } },
    ],
  });
  assert.equal(report.records[0].slots[0].issue, ' note\nkept ');
  assert.equal(report.defaults[1].slots[0].target, 20);
});
test('overview multi-station preflight rejects any invalid cell without changing originals', () => {
  const rows = [
    {
      row: { id: 1 },
      slot: { target: 10, actual: null, issue: '' },
      draft: { target: '10', actual: '-1', issue: '' },
    },
  ];
  assert.equal(overviewChanges(rows).valid, false);
  rows[0].draft.actual = '0';
  assert.deepEqual(overviewChanges(rows).rows, [{ rowId: 1, values: { actual: 0 } }]);
  rows[0].draft.actual = '1.5';
  assert.equal(overviewChanges(rows).valid, false);
  rows[0].draft.actual = '100000000';
  assert.equal(overviewChanges(rows).valid, false);
  rows[0].draft.actual = '';
  rows[0].draft.issue = 'x'.repeat(2001);
  assert.equal(overviewChanges(rows).valid, false);
  assert.equal(rows[0].slot.actual, null);
});

test('reset derives targets, clears zeros and quantities, preserves saved issues and validates every revision', () => {
  const slot = { id: 'p', start: '08:00', end: '09:00', kind: 'production' };
  const config = {
    rows: [1, 2, 3, 4].map((id) => ({
      id,
      line: 'L',
      model: id === 3 ? 'OTHER' : 'M',
      active: id !== 4,
    })),
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 101 }],
    schedules: { day: [slot], night: [{ ...slot, id: 'n', start: '20:00', end: '21:00' }] },
  };
  const report = {
    records: [0, 100].map((actual, index) => ({
      rowId: index + 1,
      version: 5,
      slots: [{ ...slot, target: 999, actual, issue: 'Keep saved issue' }],
    })),
    defaults: {},
    rowVersions: {},
  };
  const data = {
    date: '2099-01-01',
    shift: 'day',
    line: 'L',
    model: 'M',
    interval: slot,
    expectedVersions: [
      { rowId: 1, version: 5 },
      { rowId: 2, version: 5 },
    ],
  };
  const fail = (status, code) => {
    throw Object.assign(new Error(code), { status });
  };
  const before = structuredClone(report);
  const patches = planStationReset(data, config, report, fail);
  assert.equal(patches.length, 2);
  assert.ok(
    patches.every(
      (patch) =>
        patch.slots[0].actual === null &&
        patch.slots[0].target === 51 &&
        !Object.hasOwn(patch.slots[0], 'issue'),
    ),
  );
  assert.deepEqual(report, before);
  for (const expectedVersions of [
    data.expectedVersions.slice(1),
    [
      { rowId: 1, version: 5 },
      { rowId: 2, version: 4 },
    ],
    [
      { rowId: 1, version: 5 },
      { rowId: 1, version: 5 },
    ],
  ]) {
    assert.throws(() => planStationReset({ ...data, expectedVersions }, config, report, fail), {
      status: 409,
    });
  }
  for (const extra of [
    { completeActuals: true },
    { rows: [] },
    { values: { actual: 123, issue: 'Overwrite' } },
    { throughLatest: [] },
  ]) {
    assert.throws(() => planStationReset({ ...data, ...extra }, config, report, fail), {
      status: 400,
    });
  }
  assert.throws(
    () =>
      planStationReset(
        { ...data, interval: { start: '09:00', end: '09:15' } },
        config,
        report,
        fail,
      ),
    { status: 400 },
  );
});

test('reset replaces only one shift in whole-day statistics and cannot retain a stale actual', () => {
  const previous = {
    rowId: 1,
    version: 9,
    slots: [
      { id: 'd', shift: 'day', actual: 15, issue: 'Day issue' },
      { id: 'n', shift: 'night', actual: 100, issue: 'Night issue' },
    ],
  };
  const saved = {
    rowId: 1,
    version: 3,
    slots: [{ id: 'd', actual: null, target: 51, issue: 'Day issue' }],
  };
  const result = mergeOverviewReset(previous, saved, 'day');
  assert.deepEqual(result.slots, [{ ...saved.slots[0], shift: 'day' }, previous.slots[1]]);
  assert.equal(result.version, 9);
  assert.equal(previous.slots[0].actual, 15);
  assert.equal(mergeOverviewReset(undefined, saved, 'day').slots.length, 1);
});

test('default targets follow current allocation or historical captured shift and preserve zero', () => {
  const slot = { id: 'p', start: '08:00', end: '09:00', kind: 'production' };
  const row = { id: 1, line: 'L', model: 'M', active: true };
  const config = {
    rows: [row],
    productionUnits: [{ line: 'L', model: 'M', dailyTarget: 101 }],
    schedules: { day: [slot], night: [{ ...slot, id: 'n', start: '20:00', end: '21:00' }] },
  };
  const record = {
    slots: [{ ...slot, target: 999 }],
    defaultsSnapshot: {
      slots: [{ ...slot, target: 17 }],
      productionDay: { day: { slots: [{ ...slot, target: 0 }] } },
    },
  };
  assert.equal(reportDefaultTarget(config, row, '2099-01-01', 'day', slot, record), 51);
  assert.equal(reportDefaultTarget(config, row, '2020-01-01', 'day', slot, record), 0);
  delete record.defaultsSnapshot.productionDay;
  assert.equal(reportDefaultTarget(config, row, '2020-01-01', 'day', slot, record), 17);
  assert.equal(
    reportDefaultTarget(
      config,
      row,
      '2020-01-01',
      'day',
      { start: '09:00', end: '10:00' },
      record,
    ),
    null,
  );
  assert.equal(
    reportDefaultTarget(config, row, '2020-01-01', 'day', slot, null, {
      slots: [{ ...slot, target: 23 }],
    }),
    23,
  );
});
