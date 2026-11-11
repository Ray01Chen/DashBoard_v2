import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPersonalOrders, listOrder, byProduction } from '../public/list-order.js';
import { personalLists, reconcileOrder } from '../public/personal-lists.js';
import { interactionMessages } from '../public/interaction-messages.js';

test('personal order wins on refresh and appends new items without mutating config or station sequence', () => {
  const config = {
    lines: ['CD10', 'CD2', 'CD1'],
    models: ['M'],
    jobs: [],
    stations: [],
    productionUnits: [
      { line: 'CD10', model: 'M' },
      { line: 'CD2', model: 'M' },
    ],
    monitoring: {
      groups: [
        { id: 'group-z', name: 'Z' },
        { id: 'group-a', name: 'A' },
      ],
    },
  };
  const lists = personalLists(config);
  setPersonalOrders(lists, {
    lines: { items: ['CD1', 'CD10', 'CD2'] },
    units: { items: ['["CD2","M"]', '["CD10","M"]'] },
    groups: { items: ['group-z', 'group-a'] },
  });
  try {
    assert.deepEqual(listOrder(config.lines, 'th', undefined, 'lines'), ['CD1', 'CD10', 'CD2']);
    assert.deepEqual(config.lines, ['CD10', 'CD2', 'CD1']);
    assert.deepEqual(listOrder([...config.lines, 'CD20'], undefined, undefined, 'lines'), [
      'CD1',
      'CD10',
      'CD2',
      'CD20',
    ]);
    assert.deepEqual(
      byProduction(config.productionUnits).map((row) => row.line),
      ['CD2', 'CD10'],
    );
    const refreshed = structuredClone(config);
    assert.deepEqual(listOrder(refreshed.lines, 'en', undefined, 'lines'), [
      'CD1',
      'CD10',
      'CD2',
    ]);
    assert.deepEqual(
      listOrder(config.monitoring.groups, 'zh', (group) => group.name, 'groups').map(
        (group) => group.id,
      ),
      ['group-z', 'group-a'],
    );
    assert.deepEqual(reconcileOrder(['CD1', 'CD10', 'CD2'], ['CD10', 'CD1', 'CD20']), [
      'CD1',
      'CD10',
      'CD20',
    ]);
    assert.deepEqual(reconcileOrder([], ['CD10', 'CD2']), ['CD10', 'CD2']);
  } finally {
    setPersonalOrders();
  }
});

test('all interaction translations use the same keys in all supported languages', () => {
  for (const language of ['zh', 'th'])
    assert.deepEqual(
      Object.keys(interactionMessages[language]).sort(),
      Object.keys(interactionMessages.en).sort(),
    );
});

test('identical names in different list types never share personal order', () => {
  const items = [
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
  ];
  setPersonalOrders(
    { jobs: items, stations: items },
    { jobs: { items: ['B', 'A'], version: 1 }, stations: { items: ['A', 'B'], version: 1 } },
  );
  try {
    assert.deepEqual(listOrder(['A', 'B'], 'en', undefined, 'jobs'), ['B', 'A']);
    assert.deepEqual(listOrder(['A', 'B'], 'en', undefined, 'stations'), ['A', 'B']);
  } finally {
    setPersonalOrders();
  }
});
