import { DatabaseSync } from 'node:sqlite';
import { createTestClient, testAuthEnv } from './test-auth.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { readSpreadsheet } from '../spreadsheet.mjs';

test('production API and SQLite persistence', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-api-test-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  const client = createTestClient(base),
    operator = createTestClient(base, 'member');
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        ...testAuthEnv,
        PORT: String(port),
        DB_PATH: path.join(folder, 'test.sqlite'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stderr.on('data', (d) => (logs += d));
    child.stdout.on('data', (d) => (logs += d));
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        const res = await client(`${base}/api/config`);
        if (res.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Server failed to start: ' + logs);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
  }
  const request = (method, url, data) =>
    client(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  const get = async (date) =>
    (await client(`${base}/api/records?date=${date || '2026-11-04'}&shift=day`)).json();
  let record = {
    date: '2026-11-04',
    shift: 'day',
    version: 0,
    dayTeam: '陳小明',
    nightTeam: '王小華',
    owner: '=SUM(1,2)',
    dailyTarget: 500,
    slots: Array.from({ length: 5 }, () => ({ target: null, actual: null, issue: '' })),
  };
  record.slots[0] = { target: 100, actual: 0, issue: '停線測試，含逗號\n第二行' };
  try {
    await start();
    await t.test('workbook metadata and static content', async () => {
      const config = await (await client(base + '/api/config')).json();
      assert.equal(config.rows.length, 77);
      assert.equal(new Set(config.rows.map((r) => r.line)).size, 12);
      assert.equal(config.slots.length, 5);
      assert.equal(
        config.rows.find((r) => r.line === 'CDS301' && r.job === 'AE').station,
        null,
      );
      assert.match(
        await (await client(base)).text(),
        /<title>BP9 - Production Center<\/title>/,
      );
    });
    await t.test('create preserves explicit zero and blanks', async () => {
      const res = await request('PUT', '/api/records/3', record);
      assert.equal(res.status, 200);
      const saved = await res.json();
      assert.equal(saved.version, 1);
      assert.equal(saved.slots[0].actual, 0);
      assert.equal(saved.slots[1].actual, null);
      assert.equal((await get()).records.length, 1);
    });
    await t.test(
      'operator direct API never writes metadata, including legacy-style payloads',
      async () => {
        const config = await (await client(base + '/api/config')).json();
        for (const [index, entryMode] of [undefined, false, true].entries()) {
          const response = await operator(base + '/api/records/10', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Role': 'admin' },
            body: JSON.stringify({
              date: `2099-05-0${index + 1}`,
              shift: 'day',
              version: 0,
              configVersion: config.version,
              entryMode,
              dayTeam: 'forged',
              nightTeam: 'forged',
              owner: 'forged',
              dailyTarget: 999,
              rowSnapshot: { line: 'forged' },
              defaultsSnapshot: { sourceDailyTarget: 999 },
              slots: [
                {
                  id: config.schedules.day[0].id,
                  start: '00:00',
                  end: '00:01',
                  target: 999,
                  actual: 0,
                  issue: 'accepted',
                },
              ],
            }),
          });
          assert.equal(response.status, 200);
          const saved = await response.json();
          assert.equal(saved.dayTeam, '');
          assert.equal(saved.nightTeam, '');
          assert.equal(saved.owner, '');
          assert.equal(saved.dailyTarget, null);
          assert.equal(saved.slots[0].target, null);
          assert.equal(saved.slots[0].actual, 0);
          assert.equal(saved.slots[0].issue, 'accepted');
          assert.equal(saved.slots[0].start, config.schedules.day[0].start);
          assert.equal(saved.rowSnapshot.line, config.rows.find((row) => row.id === 10).line);
          assert.equal(saved.defaultsSnapshot.sourceDailyTarget, null);
          assert.equal(saved.updatedBy, 'member');
        }
        const current = (
          await (await operator(base + '/api/records?date=2099-05-01&shift=day')).json()
        ).records[0];
        const response = await operator(base + '/api/records/10', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: '2099-05-01',
            shift: 'day',
            version: current.version,
            configVersion: config.version,
            entryMode: false,
            owner: 'forged',
            dailyTarget: 999,
            slots: [{ id: current.slots[0].id, target: 999, actual: null }],
          }),
        });
        assert.equal(response.status, 200);
        const patched = await response.json();
        assert.equal(patched.slots[0].actual, null);
        assert.equal(patched.slots[0].issue, 'accepted');
        assert.equal(patched.slots[0].target, null);
        assert.deepEqual(patched.defaultsSnapshot, current.defaultsSnapshot);
      },
    );
    await t.test('date and shift isolation', async () => {
      assert.equal((await get('2026-11-05')).records.length, 0);
      assert.equal(
        (await (await client(base + '/api/records?date=2026-11-04&shift=night')).json()).records
          .length,
        0,
      );
    });
    await t.test('reject stale writes and invalid input', async () => {
      assert.equal((await request('PUT', '/api/records/3', record)).status, 409);
      assert.equal((await request('PUT', '/api/records/999', record)).status, 404);
      assert.equal(
        (await request('PUT', '/api/records/4', { ...record, date: '2026-02-30' })).status,
        400,
      );
      assert.equal(
        (await request('PUT', '/api/records/4', { ...record, slots: [] })).status,
        400,
      );
      assert.equal(
        (
          await request('PUT', '/api/records/4', {
            ...record,
            slots: [null, ...record.slots.slice(1)],
          })
        ).status,
        400,
      );
      assert.equal((await request('PUT', '/api/records/4', null)).status, 400);
      assert.equal(
        (
          await request('PUT', '/api/records/4', {
            ...record,
            slots: [{ target: -1, actual: 1, issue: '' }, ...record.slots.slice(1)],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request('PUT', '/api/records/4', {
            ...record,
            slots: [{ target: 1.5, actual: 1, issue: '' }, ...record.slots.slice(1)],
          })
        ).status,
        400,
      );
    });
    await t.test('update and version increment', async () => {
      record = { ...record, version: 1 };
      record.slots[0].actual = 90;
      const res = await request('PUT', '/api/records/3', record);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).version, 2);
      assert.equal((await get()).records[0].slots[0].actual, 90);
    });
    await t.test('CSV includes all slots, escaped text and formula protection', async () => {
      const res = await client(base + '/api/export?date=2026-11-04&shift=day&line=CD303');
      const csv = await res.text();
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/csv/);
      assert.match(csv, /07:40-08:00/);
      assert.match(csv, /11:00-12:00/);
      assert.match(csv, /"'\=SUM\(1,2\)"/);
      assert.match(csv, /"停線測試，含逗號\n第二行"/);
      assert.ok(!csv.includes('CD304'));
      assert.match(csv, /"100","90","'-10"/);
    });
    await t.test('CSV follows the selected group and line intersection', async () => {
      const config = await (await client(base + '/api/config')).json(),
        group = config.monitoring.groups.find((g) => g.lines.includes('CD303'));
      const response = await client(
        base + '/api/export?date=2026-11-04&shift=day&group=' + group.id,
      );
      assert.equal(response.status, 200);
      const csv = await response.text();
      assert.ok(csv.includes('CD303'));
      assert.ok(!csv.includes('CDS301'));
      const empty = await (
        await client(
          base + '/api/export?date=2026-11-04&shift=day&group=' + group.id + '&line=CDS301',
        )
      ).text();
      assert.ok(!empty.includes('CDS301'));
      assert.equal(empty.trim().split('\r\n').length, 1);
      assert.equal(
        (await client(base + '/api/export?date=2026-11-04&shift=day&group=missing')).status,
        400,
      );
    });
    await t.test(
      'unified thresholds persist and retired manual capacity settings are discarded',
      async () => {
        const config = await (await client(base + '/api/config')).json();
        const key = JSON.stringify([
          config.productionUnits[0].line,
          config.productionUnits[0].model,
        ]);
        config.monitoring.unified = {
          performance: { enabled: true, green: 96, red: 86 },
          completion: { enabled: true, green: 100, red: 112 },
          reporting: { enabled: true, graceMinutes: 12, redMinutes: 25 },
        };
        config.monitoring.capacity = { [key]: { standardUPH: 123, deadline: '01:30' } };
        const invalid = structuredClone(config);
        invalid.monitoring.unified.performance.red = 97;
        assert.equal((await request('PUT', '/api/config', invalid)).status, 400);
        assert.equal(
          (await (await client(base + '/api/config')).json()).version,
          config.version,
        );
        invalid.monitoring.unified.performance.red = 86;
        const response = await request('PUT', '/api/config', config);
        assert.equal(response.status, 200);
        const saved = await response.json();
        assert.equal(saved.monitoring.unified.reporting.graceMinutes, 12);
        assert.equal(Object.hasOwn(saved.monitoring, 'capacity'), false);
      },
    );
    await t.test(
      'persists after server restart and safely retires old manual capacity',
      async () => {
        await stop();
        const database = new DatabaseSync(path.join(folder, 'test.sqlite'));
        const prior = JSON.parse(
          database.prepare('SELECT value FROM app_settings WHERE id=1').get().value,
        );
        prior.monitoring.capacity = { obsolete: { standardUPH: 123, deadline: '01:30' } };
        database
          .prepare('UPDATE app_settings SET value=? WHERE id=1')
          .run(JSON.stringify(prior));
        database.close();
        await start();
        const saved = (await get()).records[0];
        assert.equal(saved.version, 2);
        assert.equal(saved.slots[0].actual, 90);
        assert.equal(saved.dayTeam, '陳小明');
        const config = await (await client(base + '/api/config')).json();
        assert.equal(config.monitoring.unified.performance.green, 96);
        assert.equal(Object.hasOwn(config.monitoring, 'capacity'), false);
      },
    );
    await t.test('delete checks version and only removes selected record', async () => {
      assert.equal(
        (
          await request('DELETE', '/api/records/3', {
            date: record.date,
            shift: 'day',
            version: 1,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request('DELETE', '/api/records/3', {
            date: record.date,
            shift: 'day',
            version: 2,
          })
        ).status,
        200,
      );
      assert.equal((await get()).records.length, 0);
    });
    await t.test(
      'preserves Chinese and Thai when a UTF-8 character spans request chunks',
      async () => {
        const login = await fetch(base + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'member', password: 'member' }),
        });
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const issue = '中文 ทีมเช้า',
          config = await (await client(base + '/api/config')).json(),
          payload = {
            ...record,
            date: '2026-11-06',
            version: 0,
            configVersion: config.version,
            dayTeam: 'forged',
            slots: [{ id: config.schedules.day[0].id, actual: 0, issue }],
          };
        const encoded = Buffer.from(JSON.stringify(payload)),
          split = encoded.lastIndexOf(Buffer.from('中')) + 1;
        const result = await new Promise((resolve, reject) => {
          const req = httpRequest(
            base + '/api/records/4',
            { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie } },
            (res) => {
              const chunks = [];
              res.on('data', (chunk) => chunks.push(chunk));
              res.on('end', () =>
                resolve({
                  status: res.statusCode,
                  data: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                }),
              );
              res.on('error', reject);
            },
          );
          req.on('error', reject);
          req.write(encoded.subarray(0, split));
          setTimeout(() => req.end(encoded.subarray(split)), 30);
        });
        assert.equal(result.status, 200);
        assert.equal(result.data.dayTeam, '');
        assert.equal(result.data.slots[0].issue, issue);
        assert.equal((await get('2026-11-06')).records[0].slots[0].issue, issue);
      },
    );
    await t.test(
      'request body limit counts UTF-8 bytes rather than decoded characters',
      async () => {
        const response = await fetch(base + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '中'.repeat(400000), password: 'wrong' }),
        });
        assert.equal(response.status, 413);
        assert.equal((await response.json()).code, 'errSize');
      },
    );
    await t.test(
      'empty CSV records use server defaults while saved snapshots and missing actuals win',
      async () => {
        let config = await (await client(base + '/api/config')).json();
        config.personnel = [{ id: 'person', name: 'Default Team', job: 'PD', active: true }];
        config.lineStaffing.CD303 = { day: ['person'], night: ['person'], owners: ['person'] };
        config.lineTargets.CD303 = 120;
        config.lineTargets.CD304 = 0;
        const changed = await request('PUT', '/api/config', config);
        assert.equal(changed.status, 200);
        config = await changed.json();
        const pendingDate = '2099-06-01',
          before = await get(pendingDate),
          csv = await (
            await client(base + `/api/export?date=${pendingDate}&shift=day&line=CD303&lang=en`)
          ).text(),
          matrix = readSpreadsheet('export.csv', Buffer.from(csv).toString('base64')).map(
            (row) => row.map((cell) => cell.value),
          );
        for (const id of [3, 4]) {
          const row = config.rows.find((row) => row.id === id),
            defaults = before.defaults[id],
            exported = matrix.filter(
              (cells) =>
                cells[3] === row.line &&
                cells[4] === (row.job || '') &&
                cells[5] === (row.station || ''),
            );
          assert.equal(exported.length, defaults.slots.length);
          for (const [index, cells] of exported.entries()) {
            assert.equal(cells[6], defaults.dayTeam);
            assert.equal(cells[7], defaults.nightTeam);
            assert.equal(cells[8], String(defaults.dailyTarget));
            assert.equal(cells[11], defaults.owner);
            assert.equal(cells[13], String(defaults.slots[index].target));
            for (const column of [9, 10, 14, 15]) assert.equal(cells[column], '');
          }
        }
        const after = await get(pendingDate);
        assert.deepEqual(after.records, before.records);
        assert.deepEqual(after.rowVersions, before.rowVersions);
        assert.deepEqual(after.activity, before.activity);
        assert.deepEqual(after.defaults, before.defaults);
        const savedCsv = await (
            await client(base + '/api/export?date=2026-11-06&shift=day&line=CD303&lang=en')
          ).text(),
          savedRows = readSpreadsheet(
            'export.csv',
            Buffer.from(savedCsv).toString('base64'),
          ).map((row) => row.map((cell) => cell.value)),
          savedRow = config.rows.find((row) => row.id === 4),
          exported = savedRows.find(
            (cells) => cells[4] === savedRow.job && cells[5] === savedRow.station,
          );
        assert.equal(exported[6], '');
        assert.equal(exported[11], '');
        assert.equal(exported[8], '');
        assert.equal(exported[13], '');
        assert.equal(exported[14], '0');
      },
    );
  } finally {
    await stop();
    await rm(folder, { recursive: true, force: true });
  }
});
