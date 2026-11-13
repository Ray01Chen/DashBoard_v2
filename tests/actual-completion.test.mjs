import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { createTestClient, testAuthEnv } from './test-auth.mjs';
import { buildLineMonitor } from '../public/monitor.js';
import { alertConfig, evaluateAlerts } from '../public/alerts.js';
import { entryChanges, mergeEntryChanges } from '../public/entry.js';
import { overviewChanges, overviewRows } from '../public/overview-inline.js';

test('every numeric zero is reported and legacy provenance has no effect', () => {
  const slot = { id: 'p', actual: 0, actualAutoFilled: true };
  const base = { slots: [slot] };
  assert.deepEqual(entryChanges(base, structuredClone(base)), []);
  const draft = mergeEntryChanges(base, [{ id: 'p', actual: 0 }]);
  assert.deepEqual(entryChanges(base, draft), []);
  assert.equal(base.slots[0].actualAutoFilled, true);
  assert.deepEqual(
    overviewChanges([
      {
        row: { id: 1 },
        slot,
        draft: { target: '', actual: '0', issue: '' },
      },
    ]).rows,
    [],
  );
  const window = { id: 'p', startAt: 0, endAt: 3600000 };
  const settings = alertConfig({}).reporting;
  const rules = {
    performance: { enabled: false, green: 95, red: 85 },
    completion: { enabled: false, green: 100, red: 110 },
    reporting: { ...settings, enabled: true },
  };
  const input = {
    series: [{ ...window, target: 10, actual: 0, actualAutoFilled: true }],
    windows: [window],
    now: 7200000,
    settings: rules,
  };
  assert.equal(
    evaluateAlerts(input).results.find((item) => item.id === 'reporting').severity,
    'green',
  );
  input.series[0].actualAutoFilled = false;
  assert.equal(
    evaluateAlerts(input).results.find((item) => item.id === 'reporting').severity,
    'green',
  );
});

test('complete-station saves use latest site data and one atomic transaction', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp-auto-zero-'));
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      ...testAuthEnv,
      PORT: String(port),
      DB_PATH: path.join(folder, 'db.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`,
    manager = createTestClient(base),
    member = createTestClient(base, 'member');
  const request = (url, data, client = member) =>
    client(base + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const json = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  };
  try {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await manager(base + '/api/config')).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    let config = await json(await manager(base + '/api/config'));
    const stations = ['HI', 'CA', 'ATS1', 'BI', 'ATS2', 'Pack', 'No output', 'Inactive'];
    Object.assign(config, {
      lines: ['ZERO-A', 'ZERO-B'],
      models: ['MODEL-A', 'MODEL-B'],
      jobs: ['TE'],
      stations,
      personnel: [],
      productionUnits: [
        ['ZERO-A', 'MODEL-A'],
        ['ZERO-A', 'MODEL-B'],
        ['ZERO-B', 'MODEL-A'],
      ].map(([line, model]) => ({
        line,
        model,
        dailyTarget: 300,
        staffing: { day: [], night: [], owners: [] },
      })),
      rows: [
        ...stations.map((station, i) => ({
          id: 'new-zero-' + i,
          line: 'ZERO-A',
          model: 'MODEL-A',
          job: 'TE',
          station,
          active: i !== 7,
          hasOutput: i !== 6,
        })),
        {
          id: 'new-other-model',
          line: 'ZERO-A',
          model: 'MODEL-B',
          job: 'TE',
          station: 'Pack',
          active: true,
          hasOutput: true,
        },
        {
          id: 'new-other-line',
          line: 'ZERO-B',
          model: 'MODEL-A',
          job: 'TE',
          station: 'Pack',
          active: true,
          hasOutput: true,
        },
      ],
      schedules: {
        day: [
          { id: 'day-one', start: '08:00', end: '09:00', kind: 'production' },
          { id: 'break', start: '09:00', end: '09:15', kind: 'break' },
          { id: 'day-two', start: '09:15', end: '10:00', kind: 'production' },
        ],
        night: [
          { id: 'night-one', start: '23:15', end: '00:00', kind: 'production' },
          { id: 'night-two', start: '00:15', end: '01:00', kind: 'production' },
        ],
      },
      lineSchedules: {},
      scheduleTemplates: [],
    });
    config.monitoring.groups = [];
    config.monitoring.rules = [];
    config.monitoring.outputSources = {};
    config.monitoring.unitOutputSources = {};
    config = await json(await request('/api/config', config, manager));
    const rows = config.rows.filter(
        (row) =>
          row.line === 'ZERO-A' && row.model === 'MODEL-A' && row.active && row.hasOutput,
      ),
      first = config.schedules.day[0],
      second = config.schedules.day[2];
    assert.equal(rows.length, 6);
    const scope = (changes = [], interval = first, shift = 'day') => ({
      line: 'ZERO-A',
      model: 'MODEL-A',
      shift,
      interval: { start: interval.start, end: interval.end },
      rows: changes.map(([row, values]) => ({ rowId: row.id, values })),
      expectedVersions: changes.map(([row, , version = 0]) => ({ rowId: row.id, version })),
    });
    const complete = (date, scopes, throughLatest) =>
      request('/api/entry/complete', {
        date,
        configVersion: config.version,
        scopes,
        throughLatest,
      });
    const report = async (date, shift = 'day') =>
      json(await member(`${base}/api/records?date=${date}&shift=${shift}`));
    const write = (date, row, version, slots, extra = {}, client = member) =>
      request(
        '/api/entry/records/' + row.id,
        {
          date,
          shift: 'day',
          configVersion: config.version,
          version,
          stationEntry: true,
          slots,
          ...extra,
        },
        client,
      );

    await t.test(
      'partial values complete only reportable peers, preserving targets/issues/other intervals and units',
      async () => {
        const date = '2099-12-01',
          before = await report(date);
        const values = [20, null, 15, null, 0, 30];
        const result = await json(
          await complete(date, [scope(rows.map((row, i) => [row, { actual: values[i] }]))]),
        );
        assert.equal(result.autoFilledCount, 2);
        const saved = await report(date);
        assert.equal(saved.records.length, 6);
        for (let i = 0; i < rows.length; i++) {
          const record = saved.records.find((record) => record.rowId === rows[i].id),
            slot = record.slots.find((slot) => slot.id === first.id);
          assert.equal(slot.actual, values[i] ?? 0);
          assert.equal(slot.actualAutoFilled, undefined);
          assert.equal(
            slot.target,
            before.defaults[rows[i].id].slots.find((slot) => slot.id === first.id).target,
          );
          assert.equal(slot.issue, '');
          assert.equal(record.updatedBy, 'member');
          assert.equal(record.slots.find((slot) => slot.id === second.id).actual, null);
        }
        const monitor = buildLineMonitor(config, saved.records, date, 'day').find(
          (unit) => unit.line === 'ZERO-A' && unit.model === 'MODEL-A',
        );
        assert.equal(monitor.series.find((slot) => slot.id === first.id).actual, 30);
        assert.equal((await report(date, 'night')).records.length, 0);
      },
    );
    await t.test(
      'fresh peer values survive stale previews; auto-only rows never require a stale client revision',
      async () => {
        const date = '2099-12-02';
        await json(
          await write(
            date,
            rows[2],
            0,
            [{ id: first.id, actual: 42, target: 19, issue: 'Peer report' }],
            {},
            manager,
          ),
        );
        const peerBefore = (await report(date)).records.find(
          (record) => record.rowId === rows[2].id,
        );
        assert.equal(peerBefore.updatedBy, 'manager');
        await json(await complete(date, [scope([[rows[0], { actual: 20 }]])]));
        let saved = await report(date);
        assert.deepEqual(
          saved.records.find((record) => record.rowId === rows[2].id),
          peerBefore,
        );
        const before = structuredClone(saved.records);
        const repeated = await json(await complete(date, [scope()]));
        assert.equal(repeated.records.length, 0);

        saved = await report(date);
        assert.deepEqual(saved.records, before);
        const auto = saved.records.find((record) => record.rowId === rows[1].id);
        await json(
          await write(date, rows[1], auto.version, [{ id: first.id, issue: 'Only a note' }]),
        );
        assert.equal(
          (await report(date)).records.find((record) => record.rowId === rows[1].id).slots[0]
            .actualAutoFilled,
          undefined,
        );
      },
    );
    await t.test(
      'saved zeros complete reports without confirmation and legacy flags are ignored',
      async () => {
        const date = '2099-12-03';
        await json(await complete(date, [scope()]));
        let saved = await report(date);
        const auto = saved.records.find((record) => record.rowId === rows[5].id);
        let monitor = buildLineMonitor(config, saved.records, date, 'day').find(
          (unit) => unit.line === 'ZERO-A' && unit.model === 'MODEL-A',
        );
        assert.equal(monitor.series.find((slot) => slot.id === first.id).actual, 0);
        assert.equal(monitor.series.find((slot) => slot.id === first.id).reported, true);
        await json(
          await write(date, rows[5], auto.version, [
            { id: first.id, actual: 0, actualAutoFilled: true },
          ]),
        );
        saved = await report(date);
        assert.equal(
          saved.records.find((record) => record.rowId === rows[5].id).slots[0].actualAutoFilled,
          undefined,
        );
        monitor = buildLineMonitor(config, saved.records, date, 'day').find(
          (unit) => unit.line === 'ZERO-A' && unit.model === 'MODEL-A',
        );
        assert.equal(monitor.series.find((slot) => slot.id === first.id).reported, true);
      },
    );
    await t.test(
      'legacy persisted zeros anchor completion, reports and export without migration',
      async () => {
        const date = '2099-12-26';
        const overnight = config.schedules.night[0];
        await json(
          await write(date, rows[0], 0, [{ id: overnight.id, actual: 0 }], { shift: 'night' }),
        );
        await json(
          await write(date, rows[1], 0, [{ id: overnight.id, actual: null }], {
            shift: 'night',
          }),
        );
        const db = new DatabaseSync(path.join(folder, 'db.sqlite'));
        try {
          const raw = db
            .prepare(
              'SELECT slots FROM production_records WHERE date=? AND shift=? AND row_id=?',
            )
            .get(date, 'night', rows[0].id);
          const slots = JSON.parse(raw.slots).map((slot) =>
            slot.id === overnight.id ? { ...slot, actualAutoFilled: true } : slot,
          );
          db.prepare(
            'UPDATE production_records SET slots=? WHERE date=? AND shift=? AND row_id=?',
          ).run(JSON.stringify(slots), date, 'night', rows[0].id);
          const blank = db
            .prepare(
              'SELECT slots FROM production_records WHERE date=? AND shift=? AND row_id=?',
            )
            .get(date, 'night', rows[1].id);
          const blankSlots = JSON.parse(blank.slots).map((slot) =>
            slot.id === overnight.id ? { ...slot, actual: '' } : slot,
          );
          db.prepare(
            'UPDATE production_records SET slots=? WHERE date=? AND shift=? AND row_id=?',
          ).run(JSON.stringify(blankSlots), date, 'night', rows[1].id);
        } finally {
          db.close();
        }
        const result = await json(
          await complete(
            date,
            [],
            [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }],
          ),
        );
        assert.equal(result.autoFilledCount, 17);
        const night = await report(date, 'night');
        const monitor = buildLineMonitor(config, night.records, date, 'night').find(
          (unit) => unit.line === 'ZERO-A' && unit.model === 'MODEL-A',
        );
        assert.equal(monitor.series[0].reported, true);
        assert.equal(monitor.series[0].actual, 0);
        const exported = await member(`${base}/api/export?date=${date}&shift=night&lang=en`);
        assert.equal(exported.status, 200);
        assert.doesNotMatch(
          await exported.text(),
          /actualAutoFilled|Auto 0|not manually reported/,
        );
      },
    );
    await t.test(
      'explicit clearing is completed as automatic zero without touching valid peers',
      async () => {
        const date = '2099-12-18';
        const a = await json(await write(date, rows[0], 0, [{ id: first.id, actual: 42 }]));
        const b = await json(await write(date, rows[1], 0, [{ id: first.id, actual: 21 }]));
        await json(await complete(date, [scope([[rows[0], { actual: null }, a.version]])]));
        const saved = (await report(date)).records;
        assert.equal(saved.find((row) => row.rowId === rows[0].id).slots[0].actual, 0);
        assert.equal(
          saved.find((row) => row.rowId === rows[0].id).slots[0].actualAutoFilled,
          undefined,
        );
        assert.equal(saved.find((row) => row.rowId === rows[1].id).slots[0].actual, 21);
        assert.equal(saved.find((row) => row.rowId === rows[1].id).version, b.version);
      },
    );
    await t.test(
      'late conflicts and invalid values roll back every zero and edit across intervals/shifts',
      async () => {
        const date = '2099-12-04';
        const before = await report(date);
        await json(
          await complete(date, [
            scope([[rows[0], { actual: 12 }]]),
            scope([[rows[0], { actual: 9 }, 99]], second),
          ]),
          409,
        );
        assert.deepEqual((await report(date)).records, before.records);
        for (const actual of [-1, 1.5, '0', 100000000]) {
          await json(await complete(date, [scope([[rows[0], { actual }]])]), 400);
          assert.deepEqual((await report(date)).records, before.records);
        }
        await json(await complete(date, [scope([], { start: '09:00', end: '09:15' })]), 400);
        await json(
          await complete(date, [
            scope([[config.rows.find((row) => row.model === 'MODEL-B'), { actual: 7 }]]),
          ]),
          400,
        );
        assert.equal((await report(date)).records.length, 0);
      },
    );
    await t.test(
      'one explicit scope batch writes multiple periods once per station and supports overnight production dates',
      async () => {
        const date = '2099-12-05';
        const result = await json(
          await complete(date, [
            scope([[rows[0], { actual: 12 }]]),
            scope([[rows[0], { actual: 9 }]], second),
            scope([], config.schedules.night[0], 'night'),
          ]),
        );
        assert.equal(result.records.length, 12);
        assert.equal(result.autoFilledCount, 16);
        const day = await report(date),
          night = await report(date, 'night');
        assert.ok(day.records.every((record) => record.version === 1));
        assert.equal(
          day.records
            .find((record) => record.rowId === rows[0].id)
            .slots.find((slot) => slot.id === second.id).actual,
          9,
        );
        assert.equal(night.records.length, 6);
        assert.ok(night.records.every((record) => record.slots[0].actual === 0));
        assert.equal((await report('2099-12-06')).records.length, 0);
      },
    );
    await t.test(
      'whole-day completion fills through the last numeric actual including zeros, never later periods',
      async () => {
        const date = '2099-12-08',
          through = [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }];
        const result = await json(
          await complete(date, [scope([[rows[0], { actual: 20 }]], second)], through),
        );
        assert.equal(result.autoFilledCount, 11);
        const day = await report(date);
        assert.equal(day.records.length, 6);
        assert.ok(
          day.records.every(
            (record) => record.slots.find((slot) => slot.id === first.id).actual === 0,
          ),
        );
        assert.equal(
          day.records
            .find((record) => record.rowId === rows[0].id)
            .slots.find((slot) => slot.id === second.id).actual,
          20,
        );
        assert.equal((await report(date, 'night')).records.length, 0);
        await json(
          await request('/api/entry/interval', {
            date,
            configVersion: config.version,
            ...scope([], config.schedules.night[0], 'night'),
            completeActuals: true,
          }),
        );
        const night = (await report(date, 'night')).records;
        const repeat = await json(await complete(date, [], through));
        assert.equal(repeat.records.length, 0);
        assert.deepEqual((await report(date, 'night')).records, night);
        assert.deepEqual((await report(date)).records, day.records);
      },
    );
    await t.test(
      'a submitted overnight zero anchors the whole production-day prefix; a shift-only save excludes the other shift',
      async () => {
        const date = '2099-12-09';
        await json(
          await write(date, rows[0], 0, [{ id: config.schedules.night[0].id, actual: 0 }], {
            shift: 'night',
          }),
        );
        const through = [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }];
        const result = await json(await complete(date, [], through));
        assert.equal(result.autoFilledCount, 17);
        assert.equal((await report(date)).records.length, 6);
        const night = (await report(date, 'night')).records;
        assert.equal(
          night.find((record) => record.rowId === rows[0].id).slots[0].actualAutoFilled,
          undefined,
        );
        assert.equal((await report('2099-12-10')).records.length, 0);
        const shiftDate = '2099-12-11';
        await json(
          await write(
            shiftDate,
            rows[0],
            0,
            [{ id: config.schedules.night[0].id, actual: 0 }],
            { shift: 'night' },
          ),
        );
        const original = (await report(shiftDate, 'night')).records;
        await json(
          await complete(
            shiftDate,
            [scope([[rows[0], { actual: 5 }]])],
            [{ ...through[0], shifts: ['day'] }],
          ),
        );
        assert.deepEqual((await report(shiftDate, 'night')).records, original);
        assert.ok(
          (await report(shiftDate)).records.every(
            (record) => record.slots.find((slot) => slot.id === second.id).actual === null,
          ),
        );
      },
    );
    await t.test(
      'targets and notes without any actual do not create a completion prefix',
      async () => {
        const date = '2099-12-12';
        const result = await json(
          await complete(
            date,
            [
              scope([[rows[0], { target: 9 }]]),
              scope([[rows[0], { issue: 'Not a quantity' }]], second),
            ],
            [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }],
          ),
        );
        assert.equal(result.autoFilledCount, 0);
        assert.equal(result.records.length, 1);
        assert.ok(result.records[0].slots.every((slot) => slot.actual === null));
        const again = await json(
          await complete(
            date,
            [],
            [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }],
          ),
        );
        assert.equal(again.records.length, 0);
      },
    );
    await t.test(
      'alert checkboxes do not control completion or change thresholds',
      async () => {
        for (const [index, enabled] of [false, true].entries()) {
          const changed = structuredClone(config);
          for (const rule of Object.values(changed.monitoring.unified)) rule.enabled = enabled;
          config = await json(await request('/api/config', changed, manager));
          const before = structuredClone(config.monitoring);
          const result = await json(await complete(`2099-12-${20 + index}`, [scope()]));
          assert.equal(result.autoFilledCount, 6);
          assert.deepEqual(
            (await json(await manager(base + '/api/config'))).monitoring,
            before,
          );
        }
      },
    );
    await t.test(
      'explicit interval save completes without changing automatic/legacy interval saves or alert settings',
      async () => {
        const date = '2099-12-07',
          original = structuredClone(config.monitoring.unified);
        await json(
          await request('/api/entry/interval', {
            date,
            configVersion: config.version,
            ...scope([[rows[0], { target: 40 }]]),
          }),
        );
        assert.equal((await report(date)).records.length, 1);
        assert.equal((await report(date)).records[0].slots[0].actual, null);
        await json(
          await request('/api/entry/interval', {
            date,
            configVersion: config.version,
            ...scope(),
            completeActuals: true,
          }),
        );
        assert.equal((await report(date)).records.length, 6);
        assert.deepEqual(
          (await json(await manager(base + '/api/config'))).monitoring.unified,
          original,
        );
        assert.equal(
          (
            await fetch(base + '/api/entry/complete', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      'independent reset derives defaults, clears all actuals and persists without completion',
      async () => {
        const date = '2099-12-24';
        const otherRow = config.rows.find((row) => row.model === 'MODEL-B');
        await json(
          await write(date, otherRow, 0, [{ id: first.id, actual: 77, issue: 'Other device' }]),
        );
        await json(
          await complete(date, [
            scope([[rows[0], { target: 999, actual: 23, issue: 'Keep this issue' }]]),
          ]),
        );
        await json(await complete(date, [scope([[rows[0], { actual: 8 }, 1]], second)]));
        const before = await report(date);
        const draft = overviewRows(
          config,
          before,
          { line: 'ZERO-A', model: 'MODEL-A' },
          { ...first, shift: 'day' },
          date,
        );
        const restoring = {
          date,
          configVersion: config.version,
          line: 'ZERO-A',
          model: 'MODEL-A',
          shift: 'day',
          interval: { start: first.start, end: first.end },
          expectedVersions: draft.map((item) => ({
            rowId: item.row.id,
            version: item.version,
          })),
        };
        const result = await json(await request('/api/entry/interval/reset', restoring));
        assert.equal(result.autoFilledCount, undefined);
        const reloaded = await report(date);
        for (const item of draft) {
          const after = reloaded.records.find((record) => record.rowId === item.row.id);
          const previous = before.records.find((record) => record.rowId === item.row.id);
          assert.equal(after.slots[0].actual, null);
          assert.equal(after.slots[0].target, before.defaults[item.row.id].slots[0].target);
          assert.equal(after.slots[0].issue, previous.slots[0].issue);
          assert.deepEqual(after.slots[1], previous.slots[1]);
        }
        assert.equal((await report(date, 'night')).records.length, 0);
        assert.deepEqual(
          reloaded.records.find((record) => record.rowId === otherRow.id),
          before.records.find((record) => record.rowId === otherRow.id),
        );
        assert.deepEqual((await report(date)).records, reloaded.records);
        const resetMonitor = buildLineMonitor(config, reloaded.records, date, 'day').find(
          (unit) => unit.line === 'ZERO-A' && unit.model === 'MODEL-A',
        );
        assert.equal(resetMonitor.series[0].actual, null);
        assert.equal(resetMonitor.series[0].reported, false);
        const resetAlerts = evaluateAlerts({
          series: resetMonitor.series,
          windows: resetMonitor.series,
          now: resetMonitor.series[0].endAt + 120 * 60000,
          settings: {
            performance: { enabled: false },
            completion: { enabled: false },
            reporting: { enabled: true, graceMinutes: 10, redAfterMinutes: 40 },
          },
        });
        assert.equal(
          resetAlerts.results.find((item) => item.id === 'reporting').severity,
          'red',
        );
        // Stale restoration rejects the entire batch and preserves all data.
        await json(await request('/api/entry/interval/reset', restoring), 409);
        assert.deepEqual((await report(date)).records, reloaded.records);
        await json(
          await request('/api/entry/interval/reset', {
            ...restoring,
            expectedVersions: restoring.expectedVersions.slice(1),
          }),
          409,
        );
        assert.deepEqual((await report(date)).records, reloaded.records);
        const peer = rows.at(-1);
        const freshRestoring = {
          ...restoring,
          expectedVersions: rows.map((row) => ({
            rowId: row.id,
            version: reloaded.records.find((record) => record.rowId === row.id).version,
          })),
        };
        await json(
          await write(date, peer, freshRestoring.expectedVersions.at(-1).version, [
            { id: first.id, actual: 55 },
          ]),
        );
        const concurrent = await report(date);
        await json(await request('/api/entry/interval/reset', freshRestoring), 409);
        assert.deepEqual((await report(date)).records, concurrent.records);
        // A subsequent ordinary Save resumes completion for just this interval.
        await json(
          await request('/api/entry/interval', {
            date,
            configVersion: config.version,
            ...scope(),
            completeActuals: true,
          }),
        );
        assert.ok(
          (await report(date)).records
            .filter((record) => record.rowId !== otherRow.id)
            .every((record) => record.slots[0].actual === (record.rowId === peer.id ? 55 : 0)),
        );
      },
    );
    await t.test(
      'historical post-midnight prefixes retain the captured production-day anchor after CONFIG is replaced',
      async () => {
        const date = '2020-12-01';
        const overnight = config.schedules.night.at(-1);
        assert.equal(overnight.start, '00:15');
        await json(
          await write(date, rows[0], 0, [{ id: overnight.id, actual: 0 }], { shift: 'night' }),
        );
        const changed = structuredClone(config);
        changed.schedules = {
          day: [{ id: 'replacement-day', start: '00:00', end: '01:00', kind: 'production' }],
          night: [
            { id: 'replacement-night', start: '08:00', end: '09:00', kind: 'production' },
          ],
        };
        config = await json(await request('/api/config', changed, manager));
        await json(
          await complete(
            date,
            [],
            [{ line: 'ZERO-A', model: 'MODEL-A', shifts: ['day', 'night'] }],
          ),
        );
        const day = (await report(date)).records.find((record) => record.rowId === rows[0].id);
        assert.ok(day);
        assert.ok(day.slots.every((slot) => slot.actual === 0));
        const night = (await report(date, 'night')).records.find(
          (record) => record.rowId === rows[0].id,
        );
        assert.equal(night.slots[0].actual, 0);
        assert.equal(
          night.slots.find((slot) => slot.id === overnight.id).actualAutoFilled,
          undefined,
        );
        const historical = await report(date, 'night');
        const draft = overviewRows(
          config,
          historical,
          { line: 'ZERO-A', model: 'MODEL-A' },
          { ...overnight, shift: 'night' },
          date,
        );
        assert.equal(draft.length, 1);
        const originalTarget = night.defaultsSnapshot.productionDay.night.slots.find(
          (slot) => slot.id === overnight.id,
        ).target;
        const dayBefore = (await report(date)).records;
        await json(
          await request('/api/entry/interval/reset', {
            date,
            configVersion: config.version,
            line: 'ZERO-A',
            model: 'MODEL-A',
            shift: 'night',
            interval: { start: overnight.start, end: overnight.end },
            expectedVersions: draft.map((item) => ({
              rowId: item.row.id,
              version: item.version,
            })),
          }),
        );
        const restored = (await report(date, 'night')).records;
        assert.ok(
          restored.every(
            (record) => record.slots.find((slot) => slot.id === overnight.id)?.actual == null,
          ),
        );
        assert.equal(
          restored
            .find((record) => record.rowId === rows[0].id)
            .slots.find((slot) => slot.id === overnight.id).target,
          originalTarget,
        );
        assert.deepEqual((await report(date)).records, dayBefore);
      },
    );
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    await rm(folder, { recursive: true, force: true });
  }
});
