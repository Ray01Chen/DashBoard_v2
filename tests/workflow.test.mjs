import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupAccess,
  setupReadiness,
  scheduleReadiness,
  addBatchMappings,
  updateMapping,
  mappingStaff,
  mappingSelection,
  removeMapping,
  reorderMapping,
  staffSettingsMarkup,
} from '../public/workforce-settings.js';
import {
  planEntryPaste,
  entryGridDestination,
  currentEntrySlot,
  entryProductionUnits,
  missingConfigurationMarkup,
} from '../public/entry.js';
import { aggregateMonitorSeries } from '../public/dashboard.js';
import { showLineDetail } from '../public/line-detail.js';
import { orderedStationRows } from '../public/production-models.js';

function fixture() {
  return {
    plant: 'BP9',
    lines: ['A', 'B'],
    jobs: ['PD', 'QA'],
    stations: ['Pack', 'Test'],
    schedules: {
      day: [{ id: 'd', kind: 'production', start: '08:00', end: '09:00' }],
      night: [{ id: 'n', kind: 'production', start: '23:00', end: '01:00' }],
    },
    personnel: [
      { id: 'pd', name: 'PD person', job: 'PD', active: true },
      { id: 'qa', name: 'QA person', job: 'QA', active: true },
    ],
    lineStaffing: Object.fromEntries(
      ['A', 'B'].map((line) => [line, { day: ['pd'], night: ['pd'], owners: ['qa'] }]),
    ),
    rows: [
      { id: 1, line: 'A', job: 'PD', station: 'Pack', active: true, dailyTarget: 10 },
      { id: 2, line: 'B', job: 'PD', station: 'Pack', active: true, dailyTarget: 20 },
    ],
    monitoring: { groups: [], rules: [], outputSources: { A: 1, B: 2 } },
  };
}

test('configuration shows only its current pair without old suggestions or deleted rows', () => {
  const draft = fixture();
  draft.models = ['Current', 'Other'];
  draft.productionUnits = [
    {
      line: 'A',
      model: 'Current',
      dailyTarget: 300,
      staffing: { day: ['pd'], night: ['pd'], owners: ['qa'] },
    },
    { line: 'A', model: 'Other', dailyTarget: 400, staffing: { day: [], night: [], owners: [] } },
  ];
  draft.rows = [
    { ...draft.rows[0], model: 'Default', active: false },
    { id: 3, line: 'A', model: 'Other', job: 'QA', station: 'Test', active: true },
    { id: 7, line: 'A', model: 'Current', job: 'PD', station: 'Pack', active: true },
    {
      id: 8,
      line: 'A',
      model: 'Current',
      job: 'QA',
      station: 'Test',
      active: false,
      deleted: true,
    },
  ];
  const unit = mappingSelection(draft, 'A', 'missing');
  assert.equal(unit.model, 'Current');
  assert.equal(mappingSelection(draft, 'B', 'Other').line, 'A');
  const before = structuredClone(draft);
  const esc = (value) => String(value).replaceAll('<', '&lt;');
  const html = staffSettingsMarkup({
    draft,
    esc,
    icon: () => '',
    language: 'en',
    selectedLine: 'A',
    selectedModel: 'Current',
  });
  assert.ok(html.includes('data-mapping-line-filter'));
  assert.ok(html.includes('data-configured-mapping="7"'));
  for (const id of [1, 3, 8]) assert.ok(!html.includes(`data-configured-mapping="${id}"`));
  assert.ok(!html.includes('data-mapping-template'));
  assert.ok(!html.includes('Previous setup'));
  assert.ok(html.includes('PD person'));
  assert.ok(!html.includes('data-row-field="model"'));
  assert.ok(!html.includes('data-mapping-line-select'));
  assert.deepEqual(draft, before);
  assert.equal(unit.dailyTarget, 300);
});

test('delete hides a saved mapping, clears its source and re-add creates a new ID; disable remains visible', () => {
  const draft = fixture();
  const options = { draft, esc: String, icon: () => '', language: 'en', selectedLine: 'A' };
  const otherLine = structuredClone(draft.rows[1]);
  assert.equal(updateMapping(draft, 0, { active: false }).ok, true);
  assert.ok(staffSettingsMarkup(options).includes('data-configured-mapping="1"'));
  assert.equal(removeMapping(draft, 0).ok, true);
  assert.equal(draft.rows[0].deleted, true);
  assert.ok(!staffSettingsMarkup(options).includes('data-configured-mapping="1"'));
  assert.ok(staffSettingsMarkup(options).includes('No stations configured'));
  assert.equal(updateMapping(draft, 0, { active: true }).ok, false);
  assert.equal(
    addBatchMappings(draft, ['A'], [{ job: 'PD', station: 'Pack' }], () => 'new-readded').ok,
    true,
  );
  assert.equal(draft.rows.at(-1).id, 'new-readded');
  assert.equal(draft.rows[0].active, false);
  assert.equal(draft.rows[0].deleted, true);
  assert.deepEqual(draft.rows[1], otherLine);
  assert.equal(removeMapping(draft, draft.rows.length - 1).ok, true);
  assert.equal(draft.rows.length, 2);
  for (const index of [-1, NaN, 99]) assert.equal(removeMapping(draft, index).ok, false);
});

test('station reordering preserves interleaved units, deleted IDs, row values and source selection', () => {
  const draft = fixture();
  draft.rows.splice(
    2,
    0,
    { id: 9, line: 'A', job: 'PD', station: 'Pack', active: false, deleted: true },
    { id: 3, line: 'A', job: 'QA', station: 'Test', active: true, dailyTarget: 33 },
    { id: 4, line: 'A', job: 'PD', station: 'Test', active: false, dailyTarget: 44 },
  );
  const before = structuredClone(draft);
  assert.deepEqual(reorderMapping(draft, 4, 1), { ok: true, changed: true });
  assert.deepEqual(
    draft.rows.map((row) => row.id),
    [4, 2, 9, 1, 3],
  );
  for (const row of before.rows)
    assert.deepEqual(
      draft.rows.find((item) => item.id === row.id),
      row,
    );
  assert.equal(draft.monitoring.outputSources.A, before.monitoring.outputSources.A);
  const moved = structuredClone(draft);
  assert.equal(reorderMapping(draft, 1, 2).ok, false);
  assert.equal(reorderMapping(draft, 9, 1).ok, false);
  assert.deepEqual(draft, moved);
  assert.equal(reorderMapping(draft, 4, 3, true).ok, true);
  assert.deepEqual(
    draft.rows.map((row) => row.id),
    [1, 2, 9, 3, 4],
  );
});

test('saved station snapshots follow configured order while unknown history keeps relative order', () => {
  const rows = [{ id: 1, station: 'Old name' }, { id: 999 }, { id: 3 }, { id: 998 }];
  const before = structuredClone(rows);
  const ordered = orderedStationRows({ rows: [{ id: 3 }, { id: 1 }] }, rows);
  assert.deepEqual(
    ordered.map((row) => row.id),
    [3, 1, 999, 998],
  );
  assert.equal(ordered[1].station, 'Old name');
  assert.deepEqual(rows, before);
});

test('configured entry choices remain visible without mappings and retain separate historical models', () => {
  const config = fixture();
  config.models = ['Current'];
  config.productionUnits = [{ line: 'A', model: 'Current', dailyTarget: 300, staffing: {} }];
  assert.equal(entryProductionUnits(config, []).length, 1);
  assert.deepEqual(
    entryProductionUnits(config, [{ line: 'A', model: 'Default' }]).map((unit) => unit.model),
    ['Current', 'Default'],
  );
  const esc = (value) => String(value);
  const member = missingConfigurationMarkup({
    config,
    units: config.productionUnits,
    esc,
    text: (key) => key,
  });
  const manager = missingConfigurationMarkup({
    config,
    units: config.productionUnits,
    esc,
    text: (key) => key,
    canConfigure: true,
  });
  assert.ok(member.includes('askManagerConfiguration'));
  assert.ok(!member.includes('data-entry-action="configure-unit"'));
  assert.ok(manager.includes('data-entry-action="configure-unit"'));
  assert.ok(manager.includes('>100</td>'));
  assert.ok(manager.includes('>200</td>'));
  assert.ok(!manager.includes('data-entry-field'));
  assert.ok(manager.includes('disabled aria-label="actual"'));
});

test('line targets and mappings depend on their own master data, never complete staffing', () => {
  const draft = fixture();
  draft.personnel = [];
  draft.lineStaffing = {};
  draft.rows = [];
  let access = setupAccess(draft);
  assert.equal(access.targets.enabled, true);
  assert.equal(access.workforce.enabled, true);
  assert.deepEqual(access.staffing.missing, ['personnel']);
  assert.equal(access.personnel.enabled, true);
  draft.personnel = [{ id: 'one', job: 'PD', name: 'One person', active: true }];
  assert.equal(setupAccess(draft).staffing.enabled, true);
  assert.equal(setupReadiness(draft).staffing, false);
  draft.schedules.night.push({ id: 'overlap', kind: 'production', start: '08:30', end: '09:30' });
  access = setupAccess(draft);
  assert.equal(access.personnel.enabled, true);
  assert.equal(access.workforce.enabled, true);
  assert.ok(access.targets.missing.includes('structure'));
  assert.equal(scheduleReadiness(draft.schedules), false);
  for (const key of ['groups', 'alerts', 'appearance']) assert.equal(access[key].enabled, true);
});

test('batch line configuration skips duplicates, reactivates stable archived IDs, and rejects invalid pairs atomically', () => {
  const draft = fixture();
  draft.rows.push({ id: 42, line: 'A', job: 'QA', station: 'Test', active: false, dailyTarget: 9 });
  const result = addBatchMappings(
    draft,
    ['A', 'B', 'B', 'unknown'],
    [
      { job: 'PD', station: 'Pack' },
      { job: 'QA', station: 'Test' },
    ],
    () => 'new-b',
  );
  assert.deepEqual(result, { ok: true, added: 2, skipped: 2 });
  assert.equal(draft.rows.find((row) => row.id === 42).active, true);
  assert.equal(draft.rows.find((row) => row.id === 42).dailyTarget, 9);
  assert.equal(draft.rows.filter((row) => row.id === 'new-b').length, 1);
  const saved = structuredClone(draft);
  assert.equal(addBatchMappings(draft, ['A'], [{ job: 'PD', station: 'unknown' }]).ok, false);
  assert.deepEqual(draft, saved);
});

test('mapping edits preserve IDs, reject duplicates and retire output sources on deactivation', () => {
  const draft = fixture();
  draft.rows.push({ id: 3, line: 'A', job: 'QA', station: 'Test', active: true });
  const before = structuredClone(draft.rows[2]);
  assert.equal(updateMapping(draft, 2, { job: 'PD', station: 'Pack' }).ok, false);
  assert.deepEqual(draft.rows[2], before);
  assert.equal(updateMapping(draft, 0, { line: 'B' }).ok, false);
  assert.equal(updateMapping(draft, 0, { active: false }).ok, true);
  assert.equal(draft.rows[0].id, 1);
  assert.equal(draft.monitoring.outputSources.A, 'all');
  assert.equal(setupReadiness(draft).workforce, true);
  updateMapping(draft, 2, { active: false });
  assert.equal(setupReadiness(draft).workforce, false);
});

test('job-matched teams and line owners use active personnel only', () => {
  const draft = fixture();
  draft.lineStaffing.A.day.push('qa', 'pd');
  assert.deepEqual(
    mappingStaff(draft, draft.rows[0]).day.map((person) => person.id),
    ['pd'],
  );
  assert.deepEqual(
    mappingStaff(draft, draft.rows[0]).owners.map((person) => person.id),
    ['qa'],
  );
  draft.personnel[0].active = false;
  assert.deepEqual(mappingStaff(draft, draft.rows[0]).day, []);
});

test('Excel paste preflights the full rectangle, preserves blanks and zero, and rejects unavailable or invalid cells', () => {
  const grid = [0, 1].map((row) =>
    [0, 1].map((column) => ({ rowKey: `row-${row}`, slotId: `slot-${column}`, field: 'actual' })),
  );
  const plan = planEntryPaste('0\t20\r\n\t4\r\n', grid, 0, 0);
  assert.equal(plan.valid, true);
  assert.deepEqual(
    plan.edits.map((edit) => edit.value),
    [0, 20, null, 4],
  );
  for (const value of ['1\t2\t3', '1\t2\n3', '1\t2\n3\t-4', '1e2', '2.5'])
    assert.equal(planEntryPaste(value, grid, 0, 0).valid, false, value);
  grid[1][1] = null;
  assert.equal(planEntryPaste('1\t2\n3\t4', grid, 0, 0).valid, false);
});

test('main entry rectangle maps adjacent Target/Actual columns and rows to stations', () => {
  const paired = Object.fromEntries(
    ['target', 'actual'].map((field) => [
      field,
      [0, 1].map((row) =>
        [0, 1].map((column) => ({
          rowKey: `row-${row}`,
          slotId: `slot-${column}`,
          field,
        })),
      ),
    ]),
  );
  const plan = planEntryPaste(
    '10\t20\t11\t21\n30\t40\t31\t41',
    paired.actual,
    0,
    0,
    paired,
  );
  assert.equal(plan.valid, true);
  assert.deepEqual(
    plan.edits.map(({ rowKey, slotId, field, value }) => [rowKey, slotId, field, value]),
    [
      ['row-0', 'slot-0', 'target', 10],
      ['row-0', 'slot-0', 'actual', 20],
      ['row-0', 'slot-1', 'target', 11],
      ['row-0', 'slot-1', 'actual', 21],
      ['row-1', 'slot-0', 'target', 30],
      ['row-1', 'slot-0', 'actual', 40],
      ['row-1', 'slot-1', 'target', 31],
      ['row-1', 'slot-1', 'actual', 41],
    ],
  );
});

test('single-column main entry paste alternates Target/Actual rows and clips overflow', () => {
  const paired = Object.fromEntries(
    ['target', 'actual'].map((field) => [
      field,
      [0, 1, 2].map((row) =>
        [0, 1].map((column) => ({
          rowKey: `station-${row}`,
          slotId: `slot-${column}`,
          field,
        })),
      ),
    ]),
  );
  for (let count = 1; count <= 9; count++) {
    const plan = planEntryPaste(
      Array.from({ length: count }, (_, index) => String(index + 1)).join('\n'),
      paired.actual,
      0,
      0,
      paired,
    );
    assert.equal(plan.valid, true, `row count ${count}`);
    assert.deepEqual(
      plan.edits.map(({ rowKey, slotId, field, value }) => [rowKey, slotId, field, value]),
      Array.from({ length: Math.min(count, 6) }, (_, index) => [
        `station-${Math.floor(index / 2)}`,
        'slot-0',
        index % 2 === 0 ? 'target' : 'actual',
        index + 1,
      ]),
      `row count ${count}`,
    );
  }
  const oneRow = planEntryPaste('77', paired.actual, 0, 0, paired);
  assert.equal(oneRow.edits[0].field, 'target');
  assert.equal(oneRow.edits[0].value, 77);
  const fromSecondStation = planEntryPaste('1\n2\n3\n4\n5', paired.target, 1, 0, paired);
  assert.deepEqual(
    fromSecondStation.edits.map(({ rowKey, field, value }) => [rowKey, field, value]),
    [
      ['station-1', 'target', 1],
      ['station-1', 'actual', 2],
      ['station-2', 'target', 3],
      ['station-2', 'actual', 4],
    ],
  );
});

test('six station rows with Target/Actual columns stay in the selected interval', () => {
  const paired = Object.fromEntries(
    ['target', 'actual'].map((field) => [
      field,
      Array.from({ length: 6 }, (_, row) =>
        [0, 1].map((column) => ({
          rowKey: `station-${row}`,
          slotId: `slot-${column}`,
          field,
        })),
      ),
    ]),
  );
  const plan = planEntryPaste(
    '5\t0\n5\t0\n5\t0\n5\t12\n5\t0\n5\t0',
    paired.actual,
    0,
    0,
    paired,
  );
  assert.equal(plan.valid, true);
  assert.deepEqual(
    plan.edits.map(({ rowKey, slotId, field, value }) => [rowKey, slotId, field, value]),
    Array.from({ length: 6 }, (_, row) => [
      [`station-${row}`, 'slot-0', 'target', 5],
      [`station-${row}`, 'slot-0', 'actual', row === 3 ? 12 : 0],
    ]).flat(),
  );
  assert.ok(plan.edits.every((edit) => edit.slotId === 'slot-0'));
});

test('spreadsheet keyboard navigation skips unavailable cells and exits at Tab boundaries', () => {
  const cell = { disabled: false };
  const grid = [
    [cell, null, cell],
    [cell, cell, cell],
  ];
  assert.deepEqual(entryGridDestination(grid, 0, 0, 'Tab'), { row: 0, column: 2 });
  assert.deepEqual(entryGridDestination(grid, 0, 2, 'Tab'), { row: 1, column: 0 });
  assert.deepEqual(entryGridDestination(grid, 0, 2, 'Enter'), { row: 1, column: 2 });
  assert.equal(entryGridDestination(grid, 0, 0, 'Tab', true), null);
  assert.equal(entryGridDestination(grid, 1, 2, 'Tab'), null);
});

test('automatic interval selection uses Bangkok time, excludes breaks and retains the night production date', () => {
  const context = { config: fixture(), date: '2026-11-05' };
  assert.deepEqual(currentEntrySlot(context, new Date('2026-11-05T01:20:00Z')), {
    shift: 'day',
    id: 'd',
  });
  assert.deepEqual(currentEntrySlot(context, new Date('2026-11-05T17:20:00Z')), {
    shift: 'night',
    id: 'n',
  });
  assert.equal(currentEntrySlot(context, new Date('2026-11-06T02:00:00Z')), null);
  context.config.schedules.day.push({ id: 'break', kind: 'break', start: '09:00', end: '09:10' });
  assert.equal(currentEntrySlot(context, new Date('2026-11-05T02:05:00Z')), null);
});

test('group charts aggregate stable interval IDs instead of combining unrelated historical positions', () => {
  const scheduled = [{ id: 'new', start: '08:00', end: '09:00' }];
  const lines = [
    {
      series: [
        { ...scheduled[0], target: 10, actual: null },
        { id: 'old', start: '07:40', end: '08:00', target: 4, actual: 0 },
      ],
    },
    {
      series: [
        { id: 'other', start: '09:00', end: '10:00', target: 8, actual: 7 },
        { ...scheduled[0], target: 20, actual: 15 },
      ],
    },
  ];
  assert.deepEqual(
    aggregateMonitorSeries(lines, scheduled).map((value) => [
      value.slot.id,
      value.target,
      value.actual,
    ]),
    [
      ['new', 30, 15],
      ['old', 4, 0],
      ['other', 8, 7],
    ],
  );
});

test('fullscreen line details retain historical interval labels, assigned staff and escaped issue text', () => {
  const config = fixture();
  const content = { innerHTML: '' },
    close = {};
  const dialog = {
    open: false,
    querySelector: (selector) => (selector === '#line-detail-content' ? content : close),
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  const esc = (value) =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  showLineDetail(dialog, {
    config,
    date: '2026-11-05',
    shift: 'day',
    line: 'A',
    records: [
      {
        rowId: 1,
        version: 1,
        rowSnapshot: config.rows[0],
        dayTeam: 'Saved person',
        owner: 'Saved owner',
        slots: [
          {
            id: 'retired',
            start: '07:40',
            end: '08:00',
            target: 20,
            actual: 0,
            issue: '<script>unsafe</script>',
          },
        ],
      },
    ],
    t: (key) => key,
    esc,
    number: (value) => value ?? '—',
    icon: () => '',
  });
  assert.equal(dialog.open, true);
  assert.ok(content.innerHTML.includes('07:40–08:00'));
  assert.ok(content.innerHTML.includes('Saved person'));
  assert.ok(content.innerHTML.includes('Saved owner'));
  assert.ok(content.innerHTML.includes('line-modal-owner'));
  assert.ok(content.innerHTML.includes('line-modal-station-people'));
  assert.ok(content.innerHTML.includes('line-modal-shift-people'));
  assert.ok(content.innerHTML.includes('<small>day</small>'));
  assert.ok(!content.innerHTML.includes('line-modal-people'));
  assert.ok(content.innerHTML.includes('viewBox="0 0 1040 320"'));
  assert.ok(content.innerHTML.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  assert.ok(!content.innerHTML.includes('<script>'));
  close.onclick();
  assert.equal(dialog.open, false);
});
