import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEntryAutosaveQueue,
  createEntryDayContextCache,
  entryChanges,
  mergeEntryChanges,
  parseEntryActual,
} from '../public/entry.js';

const payload = (rowId = 1) => ({
  rowId,
  date: '2026-11-04',
  shift: 'day',
  version: 1,
  configVersion: 4,
  dayTeam: 'Configured team',
  owner: 'Configured owner',
  slots: [
    { id: 'p1', start: '08:00', end: '09:00', target: 100, actual: null, issue: '' },
    { id: 'p2', start: '09:00', end: '10:00', target: 100, actual: null, issue: '' },
  ],
});
const changed = (record, actual) => mergeEntryChanges(record, [{ id: 'p1', actual }]);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

function queueFor(t, save, options = {}) {
  const queue = createEntryAutosaveQueue({ save, delay: 60000, ...options });
  t.after(() => queue.destroy());
  return queue;
}

test('entry patches include edited report targets, actuals and issues and distinguish blank from zero', () => {
  const original = payload(),
    draft = changed(original, 0);
  draft.dayTeam = 'Ignored caller value';
  draft.slots[0].target = 999;
  assert.deepEqual(entryChanges(original, draft), [{ id: 'p1', target: 999, actual: 0 }]);
  assert.deepEqual(entryChanges(draft, original), [{ id: 'p1', target: 100, actual: null }]);
  assert.deepEqual(
    entryChanges(original, mergeEntryChanges(original, [{ id: 'p2', issue: 'Stopped' }])),
    [{ id: 'p2', issue: 'Stopped' }],
  );
  assert.deepEqual(entryChanges(original, structuredClone(original)), []);
});

test('reviewed merge preserves remote fields that this browser did not change', () => {
  const remote = payload();
  remote.slots[0].actual = 40;
  remote.slots[0].issue = 'Added by another operator';
  remote.slots[1].actual = 90;
  const merged = mergeEntryChanges(remote, [{ id: 'p1', actual: 50 }]);
  assert.equal(merged.slots[0].actual, 50);
  assert.equal(merged.slots[0].issue, remote.slots[0].issue);
  assert.equal(merged.slots[1].actual, 90);
  assert.equal(merged.slots[0].target, 100);
  assert.equal(remote.slots[0].actual, 40);
});

test('entry numeric validation rejects fractions, exponent syntax, negatives and overflow', () => {
  for (const raw of ['', ' ', '0', '00012', '99999999'])
    assert.equal(parseEntryActual(raw).valid, true, raw);
  assert.deepEqual(parseEntryActual(''), { valid: true, value: null });
  assert.deepEqual(parseEntryActual('0'), { valid: true, value: 0 });
  for (const raw of ['-1', '1.2', '1e3', 'Infinity', 'NaN', '100000000', '1,000', '１２'])
    assert.equal(parseEntryActual(raw).valid, false, raw);
});

test('autosave serializes each station and carries acknowledged versions into later writes', async (t) => {
  const first = deferred(),
    calls = [],
    acknowledgements = [];
  const queue = queueFor(
    t,
    async (request) => {
      calls.push(structuredClone(request));
      if (calls.length === 1) await first.promise;
      return {
        ...mergeEntryChanges(payload(request.rowId), request.slots),
        version: request.version + 1,
      };
    },
    { onSaved: (_saved, meta) => acknowledgements.push(meta) },
  );
  queue.ensure('a', payload());
  queue.update('a', changed(payload(), 10));
  const draining = queue.flush('a');
  await nextTurn();
  queue.update('a', changed(payload(), 20));
  assert.equal(calls.length, 1);
  first.resolve();
  assert.equal(await draining, true);
  assert.deepEqual(
    calls.map((request) => [request.version, request.slots[0].actual]),
    [
      [1, 10],
      [2, 20],
    ],
  );
  assert.equal(queue.get('a').latest.version, 3);
  assert.equal(queue.get('a').latest.slots[0].actual, 20);
  assert.equal(queue.get('a').status, 'saved');
  assert.equal(queue.hasPendingChanges(), false);
  assert.equal(acknowledgements[0].hasNewerEdits, true);
  assert.equal(acknowledgements[1].hasNewerEdits, false);
});

test('a slow station does not block an independent station', async (t) => {
  const first = deferred(),
    calls = [];
  const queue = queueFor(t, async (request) => {
    calls.push(request.rowId);
    if (request.rowId === 1) await first.promise;
    return { ...mergeEntryChanges(payload(request.rowId), request.slots), version: 2 };
  });
  queue.ensure('a', payload(1));
  queue.ensure('b', payload(2));
  queue.update('a', changed(payload(1), 10));
  queue.update('b', changed(payload(2), 20));
  const a = queue.flush('a');
  assert.equal(await queue.flush('b'), true);
  assert.equal(queue.get('b').status, 'saved');
  assert.equal(queue.get('a').status, 'saving');
  first.resolve();
  assert.equal(await a, true);
  assert.deepEqual(calls.sort(), [1, 2]);
});

test('an edit made during a save can intentionally restore the original value', async (t) => {
  const first = deferred(),
    calls = [];
  const original = payload();
  original.slots[0].actual = 0;
  const queue = queueFor(t, async (request) => {
    calls.push(request.slots[0].actual);
    if (calls.length === 1) await first.promise;
    return { ...mergeEntryChanges(original, request.slots), version: request.version + 1 };
  });
  queue.ensure('a', original);
  queue.update('a', changed(original, 10));
  const drain = queue.flush('a');
  await nextTurn();
  queue.update('a', original);
  first.resolve();
  assert.equal(await drain, true);
  assert.deepEqual(calls, [10, 0]);
  assert.equal(queue.get('a').latest.slots[0].actual, 0);
});

test('network failures retain drafts, stop automatic retries and allow explicit Retry', async (t) => {
  let calls = 0;
  const queue = queueFor(t, (request) => {
    calls++;
    if (calls === 1) throw new Error('Network unavailable');
    return { ...mergeEntryChanges(payload(), request.slots), version: 2 };
  });
  queue.ensure('a', payload());
  queue.update('a', changed(payload(), 25));
  assert.equal(await queue.flush(), false);
  assert.equal(queue.get('a').status, 'error');
  assert.equal(queue.get('a').latest.slots[0].actual, 25);
  assert.equal(queue.hasPendingChanges(), true);
  await nextTurn();
  assert.equal(calls, 1);
  assert.equal(queue.retry('a'), true);
  assert.equal(await queue.flush(), true);
  assert.equal(calls, 2);
});

test('conflicts require explicit review and preserve unedited latest server fields', async (t) => {
  let calls = 0;
  const remote = payload();
  remote.version = 8;
  remote.slots[0].issue = 'Remote issue';
  const queue = queueFor(t, async (request) => {
    calls++;
    if (calls === 1)
      throw Object.assign(new Error('Changed elsewhere'), { code: 'errConflict' });
    assert.equal(request.version, 8);
    assert.deepEqual(request.slots, [{ id: 'p1', actual: 75 }]);
    return { ...mergeEntryChanges(remote, request.slots), version: 9 };
  });
  queue.ensure('a', payload());
  queue.update('a', changed(payload(), 75));
  assert.equal(await queue.flush(), false);
  assert.equal(queue.get('a').status, 'conflict');
  assert.equal(queue.retry('a'), false);
  assert.equal(calls, 1);
  queue.rebase('a', remote, true);
  assert.equal(queue.get('a').latest.slots[0].issue, 'Remote issue');
  assert.equal(await queue.flush(), true);
  assert.equal(queue.get('a').latest.slots[0].actual, 75);
  assert.equal(queue.get('a').latest.slots[0].issue, 'Remote issue');
});

test('choosing latest data discards only the reviewed row draft without another write', async (t) => {
  const queue = queueFor(t, async () => {
    throw Object.assign(new Error('Conflict'), { code: 'errConfigConflict' });
  });
  queue.ensure('a', payload());
  queue.update('a', changed(payload(), 55));
  assert.equal(await queue.flush(), false);
  const latest = changed(payload(), 99);
  latest.version = 5;
  queue.rebase('a', latest, false);
  assert.equal(await queue.flush(), true);
  assert.equal(queue.get('a').latest.slots[0].actual, 99);
  assert.equal(queue.hasPendingChanges(), false);
});

test('invalid cells pause writes until corrected and report scope stays captured', async (t) => {
  const calls = [];
  const original = payload();
  const queue = queueFor(t, async (request) => {
    calls.push(request);
    return { ...mergeEntryChanges(original, request.slots), version: 2 };
  });
  queue.ensure('2026-11-04|day|1', original);
  queue.update('2026-11-04|day|1', changed(original, 12));
  queue.pause('2026-11-04|day|1', true);
  assert.equal(await queue.flush(), false);
  assert.equal(calls.length, 0);
  assert.equal(queue.hasPendingChanges(), true);
  queue.pause('2026-11-04|day|1', false);
  assert.equal(await queue.flush(), true);
  assert.equal(calls[0].date, '2026-11-04');
  assert.equal(calls[0].shift, 'day');
  assert.equal(calls[0].entryMode, true);
  assert.equal(Object.hasOwn(calls[0], 'dayTeam'), false);
  assert.equal(Object.hasOwn(calls[0].slots[0], 'target'), false);
});

test('clean refreshes accept newer records while dirty refreshes retain unsaved input', (t) => {
  const queue = queueFor(t, async () => {});
  queue.ensure('a', payload());
  const newer = changed(payload(), 40);
  newer.version = 2;
  queue.ensure('a', newer);
  assert.equal(queue.get('a').latest.version, 2);
  queue.update('a', changed(newer, 50));
  const remote = changed(newer, 60);
  remote.version = 3;
  queue.ensure('a', remote);
  assert.equal(queue.get('a').latest.version, 2);
  assert.equal(queue.get('a').latest.slots[0].actual, 50);
});

test('full-day context loads the other shift once and reloads after configuration changes', async () => {
  const calls = [];
  const context = { date: '2026-11-05', shift: 'day', config: { version: 4 } };
  const cache = createEntryDayContextCache({
    load: async (date, shift) => {
      calls.push({ date, shift });
      return {
        configVersion: context.config.version,
        records: [{ rowId: 3, nightTeam: 'Night staff' }],
        defaults: { 3: { nightTeam: 'Configured night staff' } },
        rowVersions: { 3: 2 },
      };
    },
  });
  assert.equal(cache.ensure(context).loading, true);
  await nextTurn();
  assert.equal(cache.get().context.shift, 'night');
  assert.equal(cache.get().context.records.get(3).nightTeam, 'Night staff');
  assert.equal(cache.get().context.defaults[3].nightTeam, 'Configured night staff');
  cache.ensure(context);
  await nextTurn();
  assert.deepEqual(calls, [{ date: '2026-11-05', shift: 'night' }]);
  context.config = { version: 5 };
  cache.ensure(context);
  await nextTurn();
  assert.equal(calls.length, 2);
  assert.equal(cache.get().context.config.version, 5);
});

test('full-day context ignores late responses from a previously selected date', async () => {
  const pending = [],
    changes = [];
  const cache = createEntryDayContextCache({
    load: (date, shift) => {
      const request = deferred();
      pending.push({ date, shift, ...request });
      return request.promise;
    },
    onChange: () => changes.push(cache.get().context?.date),
  });
  const context = { date: '2026-11-04', shift: 'day', config: { version: 4 } };
  cache.ensure(context);
  cache.ensure({ ...context, date: '2026-11-05', shift: 'night' });
  await nextTurn();
  assert.deepEqual(
    pending.map((request) => request.shift),
    ['night', 'day'],
  );
  pending[1].resolve({ configVersion: 4, records: [{ rowId: 5 }] });
  await nextTurn();
  pending[0].resolve({ configVersion: 4, records: [{ rowId: 4 }] });
  await nextTurn();
  assert.equal(cache.get().context.date, '2026-11-05');
  assert.equal(cache.get().context.shift, 'day');
  assert.equal(cache.get().context.records.has(5), true);
  assert.deepEqual(changes, ['2026-11-05']);
});

test('clearing the full-day cache invalidates in-flight data before an import reload', async () => {
  const requests = [];
  const cache = createEntryDayContextCache({
    load: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
  });
  const context = { date: '2026-11-05', shift: 'day', config: { version: 4 } };
  cache.ensure(context);
  await nextTurn();
  cache.clear();
  cache.ensure(context);
  await nextTurn();
  requests[0].resolve({ configVersion: 4, records: [{ rowId: 1 }] });
  await nextTurn();
  assert.equal(cache.get().context, null);
  assert.equal(cache.get().loading, true);
  requests[1].resolve({ configVersion: 4, records: [{ rowId: 2 }] });
  await nextTurn();
  assert.equal(cache.get().context.records.has(2), true);
});

test('full-day loading refuses to mix different configuration versions', async () => {
  const cache = createEntryDayContextCache({
    load: async () => ({ configVersion: 8, records: [] }),
  });
  cache.ensure({ date: '2026-11-05', shift: 'night', config: { version: 4 } });
  await nextTurn();
  assert.equal(cache.get().context, null);
  assert.equal(cache.get().loading, false);
  assert.equal(cache.get().error.code, 'errConfigConflict');
});

test('full-day autosave keeps day and night writes independent for the same station', async (t) => {
  const day = payload(),
    night = {
      ...payload(),
      shift: 'night',
      slots: [{ id: 'n1', target: 80, actual: null, issue: '' }],
    };
  const calls = [];
  const queue = queueFor(t, async (request) => {
    calls.push(request);
    return {
      ...mergeEntryChanges(request.shift === 'day' ? day : night, request.slots),
      version: 2,
    };
  });
  queue.ensure('2026-11-04|day|1', day);
  queue.ensure('2026-11-04|night|1', night);
  queue.update('2026-11-04|day|1', changed(day, 42));
  queue.update('2026-11-04|night|1', mergeEntryChanges(night, [{ id: 'n1', actual: 64 }]));
  assert.equal(queue.hasPendingChanges(), true);
  assert.equal(await queue.flush(), true);
  assert.deepEqual(
    calls
      .map((request) => [request.shift, request.slots[0].id, request.slots[0].actual])
      .sort(),
    [
      ['day', 'p1', 42],
      ['night', 'n1', 64],
    ],
  );
  assert.equal(queue.hasPendingChanges(), false);
});
