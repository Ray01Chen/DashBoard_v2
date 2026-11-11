import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createTestClient, testAuthEnv } from './test-auth.mjs';
import { previewImport } from '../production-import.mjs';
import { upgradeProductionDefaults, buildProductionDefaults } from '../production-defaults.mjs';
import { lineDailyTarget } from '../public/production-targets.js';
import { productionKey } from '../public/production-models.js';
import { planStationInterval } from '../line-production.mjs';
import { buildLineMonitor } from '../public/monitor.js';
import { readSpreadsheet } from '../spreadsheet.mjs';
import { pagePaths, settingsPaths } from '../public/pages.js';

test('interval fill uses CONFIG slot IDs and only active stations of the exact model', () => {
  const config = {
    schedules: {
      day: [{ id: 'configured', start: '08:00', end: '09:00', kind: 'production' }],
    },
    productionUnits: [
      { line: 'L', model: 'A' },
      { line: 'L', model: 'B' },
    ],
    rows: [
      { id: 1, line: 'L', model: 'A', active: true },
      { id: 2, line: 'L', model: 'A', active: true },
      { id: 3, line: 'L', model: 'A', active: false },
      { id: 4, line: 'L', model: 'B', active: true },
    ],
  };
  const data = {
    line: 'L',
    model: 'A',
    shift: 'day',
    interval: { start: '08:00', end: '09:00' },
    values: { target: 30, actual: 0 },
    expectedVersions: [
      { rowId: 1, version: 0 },
      { rowId: 2, version: 0 },
    ],
  };
  const fail = (status, code) => {
    throw Object.assign(new Error(code), { status });
  };
  assert.deepEqual(planStationInterval(data, config, new Map(), fail), [
    { rowId: 1, version: 0, slots: [{ id: 'configured', target: 30, actual: 0 }] },
    { rowId: 2, version: 0, slots: [{ id: 'configured', target: 30, actual: 0 }] },
  ]);
  data.interval = { start: '07:00', end: '08:00' };
  assert.throws(() => planStationInterval(data, config, new Map(), fail), {
    message: 'errSlotData',
  });
});

test('legacy line presets migrate from the output station without rewriting mapping defaults', () => {
  const config = {
    lines: ['A', 'B', 'C'],
    rows: [
      { id: 1, line: 'A', station: 'Test', active: true, dailyTarget: 100 },
      { id: 2, line: 'A', station: 'Pack', active: true, dailyTarget: 200 },
      { id: 3, line: 'B', station: 'Pack', active: true, dailyTarget: 300 },
    ],
    monitoring: { outputSources: { A: 2 } },
  };
  const before = structuredClone(config.rows);
  assert.equal(upgradeProductionDefaults(config), true);
  assert.deepEqual(config.lineTargets, { A: 200, B: 300, C: null });
  assert.deepEqual(config.rows, before);
  config.lineTargets.A = 0;
  assert.equal(upgradeProductionDefaults(config), false);
  assert.equal(lineDailyTarget(config, 'A'), 0);
});

test('one line preset allocates identical station targets and preserves the whole-day total', () => {
  const config = {
    lines: ['A'],
    lineTargets: { A: 1001 },
    personnel: [],
    lineStaffing: {},
    version: 1,
    rows: [
      { id: 1, line: 'A', active: true, dailyTarget: 99 },
      { id: 2, line: 'A', active: true, dailyTarget: 999 },
    ],
    schedules: {
      day: [{ id: 'd', kind: 'production', start: '08:00', end: '08:20' }],
      night: [{ id: 'n', kind: 'production', start: '23:00', end: '00:00' }],
    },
  };
  const day = buildProductionDefaults(config, 'day'),
    night = buildProductionDefaults(config, 'night');
  assert.deepEqual(day[1].slots, day[2].slots);
  assert.deepEqual(night[1].slots, night[2].slots);
  assert.equal(day[1].dailyTarget + night[1].dailyTarget, 1001);
  assert.equal(day[1].slots[0].targetShared, undefined);
  config.lineTargets.A = null;
  assert.equal(buildProductionDefaults(config, 'day')[1].dailyTarget, null);
});

test('report target overrides and atomic shared line output', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-line-output-'));
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
      DB_PATH: path.join(folder, 'test.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  const manager = createTestClient(base),
    member = createTestClient(base, 'member');
  const request = (method, url, body) =>
    member(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const date = '2026-11-06';
  const report = async (shift = 'day') =>
    (await member(`${base}/api/records?date=${date}&shift=${shift}`)).json();
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await manager(base + '/api/config')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, 'Test server started');
    let config = await (await manager(base + '/api/config')).json();
    config.rows.forEach((row) => {
      row.active = row.id === 3 || row.id === 4 || row.id === 10;
      row.dailyTarget = 1000;
    });
    config.lineTargets = Object.fromEntries(config.lines.map((line) => [line, 1000]));
    const response = await manager(base + '/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    assert.equal(response.status, 200, await response.clone().text());
    config = await response.json();
    const line = config.rows.find((row) => row.id === 3).line;
    const peers = config.rows.filter((row) => row.active && row.line === line);
    assert.equal(peers.length, 2);
    let snapshot = await report();
    const defaults = structuredClone(snapshot.defaults[3]);
    const slot = defaults.slots[0];
    const expected = (snapshot) =>
      peers.map((row) => ({
        rowId: row.id,
        slots: (
          snapshot.records.find((record) => record.rowId === row.id) ||
          snapshot.defaults[row.id]
        ).slots,
      }));
    const save = async (rowId, slots, extra = {}) =>
      request('PUT', `/api/entry/records/${rowId}`, {
        date,
        shift: 'day',
        version: snapshot.records.find((record) => record.rowId === rowId)?.version || 0,
        configVersion: config.version,
        slots,
        expectedValues: structuredClone(expected(snapshot)),
        ...extra,
      });
    await t.test(
      'an interval target edits this report total, keeps default and opposite shift intact',
      async () => {
        const response = await save(3, [{ id: slot.id, target: slot.target + 7 }]);
        assert.equal(response.status, 200, await response.clone().text());
        const record = await response.json();
        assert.equal(record.dailyTarget, defaults.dailyTarget + 7);
        assert.equal(record.defaultsSnapshot.sourceDailyTarget, 1000);
        assert.equal(record.defaultsSnapshot.slots[0].target, slot.target);
        assert.equal(
          (await (await manager(base + '/api/config')).json()).rows.find((row) => row.id === 3)
            .dailyTarget,
          1000,
        );
        assert.deepEqual(
          (await report('night')).defaults[3].slots,
          record.defaultsSnapshot.productionDay.night.slots,
        );
        snapshot = await report();
      },
    );
    await t.test(
      'one actual writes every station atomically without changing station targets or notes',
      async () => {
        let response = await save(4, [{ id: slot.id, issue: 'Station-specific' }]);
        assert.equal(response.status, 200);
        snapshot = await report();
        response = await save(3, [{ id: slot.id, actual: 45 }], {
          expectedValues: expected(snapshot),
        });
        assert.equal(response.status, 200, await response.clone().text());
        const saved = await response.json();
        assert.equal(saved.syncedRecords.length, 1);
        snapshot = await report();
        assert.deepEqual(
          snapshot.records.map((record) => record.slots[0].actual),
          [45, 45],
        );
        assert.equal(
          snapshot.records.find((record) => record.rowId === 3).slots[0].target,
          slot.target + 7,
        );
        assert.equal(
          snapshot.records.find((record) => record.rowId === 4).slots[0].issue,
          'Station-specific',
        );
        assert.equal(
          snapshot.records.some((record) => record.rowId === 10),
          false,
        );
      },
    );
    await t.test(
      'stale peer actual rolls back source target, actual and every station',
      async () => {
        const stale = structuredClone(expected(snapshot));
        stale[1].slots[0].actual = 9;
        const before = structuredClone(snapshot.records);
        const response = await save(3, [{ id: slot.id, actual: 60, target: 555 }], {
          expectedValues: stale,
        });
        assert.equal(response.status, 409);
        assert.deepEqual((await report()).records, before);
      },
    );
    await t.test(
      'zero, clear, negative and oversized targets preserve count semantics',
      async () => {
        for (const actual of [0, null]) {
          const response = await save(3, [{ id: slot.id, actual }], {
            expectedValues: expected(snapshot),
          });
          assert.equal(response.status, 200);
          snapshot = await report();
          assert.ok(snapshot.records.every((record) => record.slots[0].actual === actual));
        }
        const before = structuredClone(snapshot.records);
        for (const target of [-1, 2.5, 100000000]) {
          assert.equal((await save(3, [{ id: slot.id, target }])).status, 400);
        }
        assert.deepEqual((await report()).records, before);
      },
    );
    await t.test(
      'a stale peer target rejects a line target edit and leaves notes and defaults intact',
      async () => {
        const before = structuredClone(snapshot.records);
        const stale = structuredClone(expected(snapshot));
        stale[1].slots[0].target = 999;
        assert.equal(
          (await save(3, [{ id: slot.id, target: 400 }], { expectedValues: stale })).status,
          409,
        );
        assert.deepEqual((await report()).records, before);
        assert.equal(
          (await (await manager(base + '/api/config')).json()).lineTargets[line],
          1000,
        );
      },
    );
    await t.test(
      'Excel requires a station identity and accepts independent station targets and actuals',
      async () => {
        const csv = `Line,Time slot,Actual\n${line},${slot.start}-${slot.end},88`;
        const preview = previewImport(
          'line.csv',
          Buffer.from(csv).toString('base64'),
          config,
          date,
          'day',
          snapshot.records,
          'en',
          snapshot.defaults,
        );
        assert.ok(preview.errors.some((error) => error.code === 'ambiguous'));
        const conflict = `Row ID,Time slot,Actual\n3,${slot.id},10\n4,${slot.id},20`;
        const rejected = previewImport(
          'bad.csv',
          Buffer.from(conflict).toString('base64'),
          config,
          date,
          'day',
          snapshot.records,
          'en',
          snapshot.defaults,
        );
        assert.deepEqual(rejected.errors, []);
        assert.deepEqual(
          rejected.rows.map((row) => row.changes[0].actual),
          [10, 20],
        );
        const target = `Row ID,Time slot,Target\n4,${slot.id},123`;
        const planned = previewImport(
          'target.csv',
          Buffer.from(target).toString('base64'),
          config,
          date,
          'day',
          snapshot.records,
          'en',
          snapshot.defaults,
        );
        assert.deepEqual(planned.errors, []);
        assert.equal(planned.rows.length, 1);
        assert.equal(planned.rows[0].rowId, 4);
        assert.ok(planned.rows.every((row) => row.changes[0].target === 123));
      },
    );
    await t.test(
      'Excel applies one station’s targets and actuals without changing peers or presets',
      async () => {
        const csv = `Row ID,Time slot,Actual,Target\n4,${slot.id},88,123`;
        const response = await request('POST', '/api/import/preview', {
          date,
          shift: 'day',
          fileName: 'line.csv',
          base64: Buffer.from(csv).toString('base64'),
        });
        const preview = await response.json();
        assert.deepEqual(preview.errors, []);
        const applied = await request('POST', '/api/import/apply', { token: preview.token });
        assert.equal(applied.status, 200, await applied.clone().text());
        const beforePeer = snapshot.records.find((record) => record.rowId === 3);
        snapshot = await report();
        const edited = snapshot.records.find((record) => record.rowId === 4);
        assert.equal(edited.dailyTarget, defaults.dailyTarget - slot.target + 123);
        assert.equal(edited.defaultsSnapshot.sourceDailyTarget, 1000);
        assert.equal(edited.slots[0].actual, 88);
        assert.equal(edited.slots[0].target, 123);
        assert.equal(edited.slots[0].lineShared, undefined);
        assert.deepEqual(
          snapshot.records.find((record) => record.rowId === 3),
          beforePeer,
        );
      },
    );
    await t.test('malformed shared edits reject cleanly without changing data', async () => {
      const before = structuredClone(snapshot.records);
      assert.equal((await save(3, [null])).status, 400);
      assert.equal(
        (await save(3, [{ id: slot.id, actual: 1 }], { expectedValues: [null, null] })).status,
        409,
      );
      assert.deepEqual((await report()).records, before);
    });
    await t.test(
      'a station added mid-day starts with its own default target and empty actual',
      async () => {
        config.rows.find((row) => row.id === 5).active = true;
        const response = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        assert.equal(response.status, 200);
        config = await response.json();
        const pending = await report();
        assert.equal(pending.defaults[5].slots[0].actual, null);
        assert.equal(pending.defaults[5].slots[0].target, slot.target);
        const saved = await request('PUT', '/api/entry/records/5', {
          date,
          shift: 'day',
          version: 0,
          configVersion: config.version,
          stationEntry: true,
          slots: [{ id: slot.id, issue: 'New station note' }],
        });
        assert.equal(saved.status, 200);
        const record = await saved.json();
        assert.equal(record.slots[0].target, slot.target);
        assert.equal(record.slots[0].actual, null);
        assert.equal(record.slots[0].issue, 'New station note');
        assert.equal(record.defaultsSnapshot.sourceDailyTarget, 1000);
        assert.equal(record.activity.lastIncreaseAt, null);
      },
    );
    await t.test(
      'station entry isolates values and revisions, preserves presets and monitors the selected station',
      async () => {
        config.monitoring.unitOutputSources[
          productionKey(config.rows.find((row) => row.id === 3))
        ] = 4;
        const settings = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        assert.equal(settings.status, 200);
        config = await settings.json();
        const entryDate = '2026-11-09';
        const getDay = async () =>
          (await member(base + '/api/records?date=' + entryDate + '&shift=day')).json();
        const initial = await getDay(),
          defaultsA = initial.defaults[3];
        const saveStation = (rowId, version, values) =>
          request('PUT', '/api/entry/records/' + rowId, {
            date: entryDate,
            shift: 'day',
            version,
            configVersion: config.version,
            stationEntry: true,
            slots: [{ id: slot.id, ...values }],
          });
        const first = await saveStation(3, 0, {
          target: 111,
          actual: 23,
          issue: 'Station A only',
        });
        assert.equal(first.status, 200, await first.clone().text());
        const a = await first.json();
        const persistedA = { ...a };
        delete persistedA.activity;
        assert.equal(a.dailyTarget, defaultsA.dailyTarget - defaultsA.slots[0].target + 111);
        assert.equal(a.slots[0].lineShared, undefined);
        assert.equal(a.slots[0].targetShared, undefined);
        let current = await getDay();
        assert.deepEqual(
          current.records.map((record) => record.rowId),
          [3],
        );
        assert.equal(current.defaults[4].slots[0].actual, null);
        assert.equal(current.rowVersions[4], undefined);
        const second = await saveStation(4, 0, {
          target: 222,
          actual: 7,
          issue: 'Station B only',
        });
        assert.equal(second.status, 200);
        current = await getDay();
        assert.deepEqual(
          current.records.find((record) => record.rowId === 3),
          persistedA,
        );
        assert.equal(current.records.find((record) => record.rowId === 4).slots[0].actual, 7);
        assert.equal((await saveStation(3, 0, { actual: 999 })).status, 409);
        assert.deepEqual((await getDay()).records, current.records);
        const monitor = buildLineMonitor(config, current.records, entryDate, 'day').find(
          (unit) => unit.source === 4,
        );
        assert.deepEqual(monitor.sourceRows, [4]);
        assert.equal(monitor.series.find((value) => value.id === slot.id).actual, 7);
        assert.equal(monitor.series.find((value) => value.id === slot.id).target, 222);
        assert.equal(
          (await (await manager(base + '/api/config')).json()).lineTargets[line],
          1000,
        );
      },
    );
    await t.test(
      'one-time interval fill overwrites individual values atomically and stays independently editable',
      async () => {
        const prepared = structuredClone(config);
        prepared.rows.forEach((row) => (row.active = [3, 4, 10].includes(row.id)));
        const configured = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prepared),
        });
        assert.equal(configured.status, 200);
        config = await configured.json();
        const batchDate = '2026-11-13';
        const getDay = async () =>
          (await member(base + `/api/records?date=${batchDate}&shift=day`)).json();
        const initial = await getDay();
        for (const [rowId, target, actual] of [
          [3, 111, 11],
          [4, 222, 22],
        ]) {
          const response = await request('PUT', '/api/entry/records/' + rowId, {
            date: batchDate,
            shift: 'day',
            configVersion: config.version,
            version: 0,
            stationEntry: true,
            slots: [{ id: slot.id, target, actual, issue: 'Keep station ' + rowId }],
          });
          assert.equal(response.status, 200, await response.clone().text());
        }
        const payload = (snapshot, values) => ({
          date: batchDate,
          shift: 'day',
          line,
          model: 'Default',
          configVersion: config.version,
          interval: { start: slot.start, end: slot.end },
          values,
          expectedVersions: peers.map((row) => ({
            rowId: row.id,
            version:
              snapshot.records.find((record) => record.rowId === row.id)?.version ||
              snapshot.rowVersions[row.id] ||
              0,
          })),
        });
        let before = await getDay();
        let response = await request(
          'PUT',
          '/api/entry/interval',
          payload(before, { target: 300, actual: 55 }),
        );
        assert.equal(response.status, 200, await response.clone().text());
        assert.equal((await response.json()).records.length, 2);
        let current = await getDay();
        for (const record of current.records) {
          assert.equal(record.slots[0].target, 300);
          assert.equal(record.slots[0].actual, 55);
          assert.equal(record.slots[0].issue, 'Keep station ' + record.rowId);
          assert.equal(
            record.dailyTarget,
            initial.defaults[record.rowId].dailyTarget -
              initial.defaults[record.rowId].slots[0].target +
              300,
          );
          assert.notEqual(record.slots[0].lineShared, true);
          assert.notEqual(record.slots[0].targetShared, true);
        }
        const a = current.records.find((record) => record.rowId === 3);
        response = await request('PUT', '/api/entry/records/3', {
          date: batchDate,
          shift: 'day',
          configVersion: config.version,
          version: a.version,
          stationEntry: true,
          slots: [{ id: slot.id, target: 444, actual: 99 }],
        });
        assert.equal(response.status, 200);
        current = await getDay();
        assert.equal(current.records.find((record) => record.rowId === 4).slots[0].actual, 55);
        response = await request('PUT', '/api/entry/interval', payload(current, { actual: 0 }));
        assert.equal(response.status, 200);
        current = await getDay();
        assert.deepEqual(
          current.records.map((record) => record.slots[0].target),
          [444, 300],
        );
        assert.ok(current.records.every((record) => record.slots[0].actual === 0));
        before = structuredClone(current);
        for (const invalid of [
          {
            ...payload(current, { actual: 9 }),
            expectedVersions: [
              { rowId: 3, version: 0 },
              { rowId: 4, version: 0 },
            ],
          },
          { ...payload(current, { target: 9 }), interval: { start: '01:01', end: '02:02' } },
          payload(current, { target: -1 }),
          payload(current, {}),
          { ...payload(current, { actual: 9 }), configVersion: config.version - 1 },
        ]) {
          const response = await request('PUT', '/api/entry/interval', invalid);
          assert.ok([400, 409].includes(response.status));
          assert.deepEqual(
            (await getDay()).records,
            before.records,
            'Rejected batch must not partially write',
          );
        }
        assert.equal(
          (await (await member(base + `/api/records?date=${batchDate}&shift=night`)).json())
            .records.length,
          0,
        );
        assert.equal(
          (await (await manager(base + '/api/config')).json()).lineTargets[line],
          1000,
        );
        assert.equal(
          current.records.some((record) => record.rowId === 10),
          false,
        );
      },
    );
    await t.test(
      'non-output stations retain history, reject writes and are skipped by batch and Excel',
      async () => {
        const savedDate = '2026-11-13';
        const readSaved = async () =>
          (await member(`${base}/api/records?date=${savedDate}&shift=day`)).json();
        const before = await readSaved();
        const retained = before.records.find((record) => record.rowId === 4);
        config.rows.find((row) => row.id === 4).hasOutput = false;
        let response = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        assert.equal(response.status, 200, await response.clone().text());
        config = await response.json();
        assert.equal(config.rows.find((row) => row.id === 4).active, true);
        assert.equal(config.rows.find((row) => row.id === 4).hasOutput, false);
        assert.deepEqual((await readSaved()).records, before.records);
        const fresh = await (
          await member(`${base}/api/records?date=2026-11-19&shift=day`)
        ).json();
        assert.ok(
          fresh.defaults[4].slots.every((slot) => slot.target === null && slot.actual === null),
        );
        for (const url of ['/api/entry/records/4', '/api/records/4']) {
          response = await request('PUT', url, {
            date: savedDate,
            shift: 'day',
            configVersion: config.version,
            version: retained.version,
            stationEntry: true,
            slots: [{ id: slot.id, actual: 999 }],
          });
          assert.equal(response.status, 400);
          assert.equal((await response.json()).code, 'errNoOutput');
        }
        response = await request('PUT', '/api/entry/interval', {
          date: savedDate,
          shift: 'day',
          line,
          model: 'Default',
          configVersion: config.version,
          interval: { start: slot.start, end: slot.end },
          values: { target: 123, actual: 234 },
          expectedVersions: [
            { rowId: 3, version: before.records.find((record) => record.rowId === 3).version },
          ],
        });
        assert.equal(response.status, 200, await response.clone().text());
        assert.deepEqual(
          (await response.json()).records.map((record) => record.rowId),
          [3],
        );
        assert.deepEqual(
          (await readSaved()).records.find((record) => record.rowId === 4),
          retained,
        );
        response = await member(`${base}/api/import/template?date=${savedDate}&shift=day`);
        const template = readSpreadsheet(
          'stations.xlsx',
          Buffer.from(await response.arrayBuffer()).toString('base64'),
        );
        assert.ok(!template.slice(1).some((row) => Number(row[0].value) === 4));
        const importRows = Buffer.from(
          `Row ID,Time slot,Actual\n4,${slot.start}-${slot.end},777`,
        );
        const preview = previewImport(
          'non-output.csv',
          importRows.toString('base64'),
          config,
          savedDate,
          'day',
          (await readSaved()).records,
          'en',
          fresh.defaults,
        );
        assert.equal(preview.errors.length, 1);
        assert.match(preview.errors[0].message, /no output/i);
        const invalid = structuredClone(config);
        invalid.rows.find((row) => row.id === 4).hasOutput = 'false';
        response = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalid),
        });
        assert.equal(response.status, 400);
        config.rows.find((row) => row.id === 3).hasOutput = false;
        response = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        assert.equal(response.status, 200, await response.clone().text());
        config = await response.json();
        const noOutput = buildLineMonitor(
          config,
          (await readSaved()).records,
          savedDate,
          'day',
        ).find((unit) => unit.line === line);
        assert.deepEqual(noOutput.sourceRows, []);
        assert.equal(noOutput.actual, null);
        assert.equal(noOutput.target, null);
        response = await request('PUT', '/api/entry/interval', {
          date: savedDate,
          shift: 'day',
          line,
          model: 'Default',
          configVersion: config.version,
          interval: { start: slot.start, end: slot.end },
          values: { actual: 0 },
          expectedVersions: [],
        });
        assert.equal(response.status, 400);
        config.rows.find((row) => row.id === 3).hasOutput = true;
        config.rows.find((row) => row.id === 4).hasOutput = true;
        response = await manager(base + '/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        assert.equal(response.status, 200);
        config = await response.json();
        assert.deepEqual(
          (await readSaved()).records.find((record) => record.rowId === 4),
          retained,
        );
      },
    );
    await t.test(
      'every page has an HTTP route, unknown pages remain 404 and API permissions remain enforced',
      async () => {
        for (const path of [
          '/',
          '/settings',
          ...Object.values(pagePaths),
          ...Object.values(settingsPaths),
        ]) {
          const response = await fetch(base + path);
          assert.equal(response.status, 200, path);
          assert.match(response.headers.get('content-type'), /text\/html/);
          assert.match(await response.text(), /src="\/app.js"/);
        }
        assert.equal((await fetch(base + '/settings/unknown')).status, 404);
        assert.equal((await fetch(base + '/api/config')).status, 401);
        assert.equal((await request('PUT', '/api/config', config)).status, 403);
      },
    );
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(folder, { recursive: true, force: true });
  }
});
