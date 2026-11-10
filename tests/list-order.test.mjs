import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naturalOrder, byProduction } from '../public/list-order.js';
import { linePickerGroups, linePickerMarkup } from '../public/line-picker.js';
import { orderedStationRows } from '../public/production-models.js';
import { translate } from '../public/i18n.js';
import { alertReasonText } from '../public/alert-display.js';

test('natural order sorts numeric segments without changing catalog arrays or stable ties', () => {
  const input = Object.freeze(['CD10', 'CD2', 'CD1', 'cd2']);
  assert.deepEqual(naturalOrder(input, 'en'), ['CD1', 'CD2', 'cd2', 'CD10']);
  assert.deepEqual(input, ['CD10', 'CD2', 'CD1', 'cd2']);
});
test('explicit display, sequence and config order take precedence over natural labels', () => {
  const input = [
    { name: 'CD1' },
    { name: 'CD10', displayOrder: 0 },
    { name: 'CD2', sequence: 1 },
  ];
  assert.deepEqual(
    naturalOrder(input, 'en', (item) => item.name).map((item) => item.name),
    ['CD10', 'CD2', 'CD1'],
  );
  for (const key of ['order', 'configOrder'])
    assert.deepEqual(
      naturalOrder(
        [
          { name: 'A', [key]: 2 },
          { name: 'B', [key]: 1 },
        ],
        'en',
        (item) => item.name,
      ).map((item) => item.name),
      ['B', 'A'],
    );
});
test('text ordering follows each supported locale', () => {
  const values = ['泰語2', 'ไทย10', 'Apple10', 'Apple2', 'ไทย2', '中文10', '中文2'];
  for (const language of ['zh', 'en', 'th']) {
    const expected = [...values].sort(
      new Intl.Collator(language, { numeric: true, sensitivity: 'base' }).compare,
    );
    assert.deepEqual(naturalOrder(values, language), expected);
  }
});
test('line/model groups sort naturally while station IDs retain configured sequence', () => {
  const rows = [
    { id: 'b', line: 'CD2', model: 'M2', station: 'Station10' },
    { id: 'a', line: 'CD2', model: 'M2', station: 'Station2' },
    { id: 'c', line: 'CD1', model: 'M10' },
  ];
  const config = { rows };
  assert.deepEqual(
    byProduction(orderedStationRows(config, [...rows].reverse()), 'en').map((row) => row.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    config.rows.map((row) => row.id),
    ['b', 'a', 'c'],
  );
});
test('editing a sorted catalog resolves original indexes rather than display positions', () => {
  const catalog = ['CD10', 'CD2', 'CD1'];
  const display = naturalOrder(
    catalog.map((value, index) => ({ value, index })),
    'en',
    (item) => item.value,
  );
  catalog[display[1].index] = 'CD3';
  assert.deepEqual(catalog, ['CD10', 'CD3', 'CD1']);
});
test('line groups use current configuration, exclude retired members and include ungrouped lines', () => {
  const config = {
    lines: ['CD10', 'CD2', 'CD1'],
    monitoring: {
      groups: [
        { id: 'ten', name: '10F', lines: ['CD10', 'old'] },
        { id: 'two', name: '2F', lines: ['CD2', 'CD2'] },
      ],
    },
  };
  assert.deepEqual(
    linePickerGroups(config, 'en').map((group) => [group.id, group.lines]),
    [
      ['group:two', ['CD2']],
      ['group:ten', ['CD10']],
      ['ungrouped', ['CD1']],
    ],
  );
  config.lines.push('CD3');
  assert.deepEqual(linePickerGroups(config, 'en').at(-1).lines, ['CD1', 'CD3']);
  const markup = linePickerMarkup(config, ['CD2'], {
    t: (key, params) => translate('en', key, params),
    esc: String,
    language: 'en',
  });
  assert.match(markup, /<details class="line-multiselect" id="schedule-line-picker">/);
  assert.doesNotMatch(markup, /<details[^>]*\bopen\b/);
  assert.match(markup, /data-line-picker-search/);
  assert.match(markup, /data-schedule-apply-line="CD2" checked/);
});
test('compact alert summaries translate, retain full explanations and never change evaluation data', () => {
  const reason = {
    key: 'alertCompletionReason',
    params: {
      rate: '123.456789',
      required: '50',
      planned: 40,
      remaining: 100,
      hours: '2',
      cutoff: Date.parse('2026-11-11T09:00:00+07:00'),
      deadline: Date.parse('2026-11-11T19:00:00+07:00'),
      stale: true,
      green: 100,
      red: 110,
    },
  };
  for (const language of ['en', 'zh', 'th']) {
    const t = (key, params) => translate(language, key, params);
    const summary = alertReasonText(reason, t, { compact: true });
    const full = alertReasonText(reason, t);
    assert.match(summary, /123.46/);
    assert.match(summary, /09:00/);
    assert.ok(summary.length < full.length);
    assert.doesNotMatch(summary, /alertSummary|\{\w+\}/);
    assert.match(full, /19:00/);
  }
  assert.equal(reason.params.rate, '123.456789');
});
