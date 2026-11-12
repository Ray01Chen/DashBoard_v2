import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewRows, overviewChanges } from '../public/overview-inline.js';

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
