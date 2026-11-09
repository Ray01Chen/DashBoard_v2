import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { createTestClient, testAuthEnv } from './test-auth.mjs';
import {
  allocateDailyTarget,
  buildProductionDefaults,
  resolveEntryData,
} from '../production-defaults.mjs';
import { readSpreadsheet, writeSpreadsheet } from '../spreadsheet.mjs';
import { previewImport } from '../production-import.mjs';
import { crc32 } from 'node:zlib';

// Legacy column-order fixtures ensure older workbooks still import by header name.
const legacyHeader = [
  'Row ID',
  'Line',
  'Job',
  'Station',
  'Time slot',
  'Actual',
  'Issue',
  'Date',
  'Shift',
  'Target',
  'Model',
];

// Produce malformed/sparse OOXML fixtures without weakening the reader's CRC
// checks. The production writer uses stored ZIP members, so fixture edits can
// preserve byte lengths and update both header checksums independently.
function rewriteWorksheet(workbook, change) {
  const result = Buffer.from(workbook),
    end = result.length - 22;
  let cursor = result.readUInt32LE(end + 16);
  while (cursor < end) {
    const length = result.readUInt16LE(cursor + 28),
      extra = result.readUInt16LE(cursor + 30),
      comment = result.readUInt16LE(cursor + 32),
      name = result.subarray(cursor + 46, cursor + 46 + length).toString();
    if (name === 'xl/worksheets/sheet1.xml') {
      const offset = result.readUInt32LE(cursor + 42),
        start =
          offset + 30 + result.readUInt16LE(offset + 26) + result.readUInt16LE(offset + 28),
        size = result.readUInt32LE(cursor + 24),
        before = result.subarray(start, start + size).toString(),
        after = change(before);
      assert.equal(Buffer.byteLength(after), size, 'Fixture edit must retain the member size');
      Buffer.from(after).copy(result, start);
      const checksum = crc32(result.subarray(start, start + size));
      result.writeUInt32LE(checksum, cursor + 16);
      result.writeUInt32LE(checksum, offset + 14);
      return result;
    }
    cursor += 46 + length + extra + comment;
  }
  throw new Error('Missing fixture worksheet');
}

test('daily target allocation covers both shifts, excludes breaks, and preserves every unit', () => {
  const config = {
    schedules: {
      day: [
        { id: 'd1', kind: 'production', start: '08:00', end: '08:20' },
        { id: 'b1', kind: 'break', start: '08:20', end: '09:00' },
        { id: 'd2', kind: 'production', start: '09:00', end: '10:00' },
      ],
      night: [{ id: 'n1', kind: 'production', start: '23:20', end: '00:00' }],
    },
  };
  assert.deepEqual(
    allocateDailyTarget(config, 12).map((slot) => [slot.id, slot.target]),
    [
      ['d1', 2],
      ['d2', 6],
      ['n1', 4],
    ],
  );
  assert.deepEqual(
    allocateDailyTarget(config, 1).map((slot) => slot.target),
    [0, 1, 0],
  );
  for (const target of [0, 1, 2, 7, 101, 99999999]) {
    const slots = allocateDailyTarget(config, target);
    assert.equal(
      slots.reduce((sum, slot) => sum + slot.target, 0),
      target,
    );
    assert.ok(slots.every((slot) => Number.isSafeInteger(slot.target) && slot.target >= 0));
  }
  assert.deepEqual(
    allocateDailyTarget(config, 0).map((slot) => slot.target),
    [0, 0, 0],
  );
  assert.deepEqual(
    allocateDailyTarget(config, null).map((slot) => slot.target),
    [null, null, null],
  );
  const slots = allocateDailyTarget(config, 120);
  assert.equal(
    slots.reduce((sum, slot) => sum + slot.minutes, 0),
    120,
  );
  assert.equal(slots.find((slot) => slot.id === 'd1').target, (120 * 20) / 120);
  assert.equal(
    slots.some((slot) => slot.id === 'b1'),
    false,
  );
  config.rows = [{ id: 3, line: 'CD303', active: true, dailyTarget: 120 }];
  assert.equal(buildProductionDefaults(config, 'day')[3].dailyTarget, 80);
  assert.equal(buildProductionDefaults(config, 'night')[3].dailyTarget, 40);
  config.schedules.night[0].end = '23:40';
  assert.deepEqual(
    allocateDailyTarget(config, 2).map((slot) => slot.target),
    [1, 1, 0],
  );
});

test('entry resolver is server-owned by default even with no configured staffing or target', () => {
  const row = { id: 3, line: 'CD303', active: true, dailyTarget: null },
    config = {
      rows: [row],
      schedules: {
        day: [{ id: 'd1', kind: 'production', start: '08:00', end: '08:20' }],
        night: [{ id: 'n1', kind: 'production', start: '20:00', end: '20:20' }],
      },
    },
    fail = (_status, code) => {
      throw new Error(code);
    };
  for (const entryMode of [undefined, false, true]) {
    const result = resolveEntryData(
      config,
      row,
      {
        shift: 'day',
        entryMode,
        dayTeam: 'forged',
        nightTeam: 'forged',
        owner: 'forged',
        dailyTarget: 999,
        slots: [{ id: 'd1', target: 999, actual: 0, issue: 'kept' }],
      },
      null,
      fail,
    );
    assert.equal(result.data.dayTeam, '');
    assert.equal(result.data.nightTeam, '');
    assert.equal(result.data.owner, '');
    assert.equal(result.data.dailyTarget, null);
    assert.equal(result.data.slots[0].target, null);
    assert.equal(result.data.slots[0].actual, 0);
    assert.equal(result.data.slots[0].issue, 'kept');
    assert.ok(result.defaultsSnapshot);
  }
});

test('spreadsheet codec preserves Unicode/escaped/newline text and rejects malformed input', async () => {
  const values = [
    ['Row ID', 'Actual', 'Issue'],
    [3, 0, '中文 ทีมเช้า & <tag>\nsecond line'],
  ];
  const workbook = writeSpreadsheet(values);
  assert.equal(workbook.readUInt32LE(), 0x04034b50);
  assert.deepEqual(
    readSpreadsheet('test.xlsx', workbook.toString('base64')).map((row) =>
      row.map((cell) => cell.value),
    ),
    values.map((row) => row.map(String)),
  );
  assert.deepEqual(
    readSpreadsheet(
      'test.csv',
      Buffer.from('Actual,Issue\r\n0,"line 1\nline ""2"""\r\n').toString('base64'),
    ).map((row) => row.map((cell) => cell.value)),
    [
      ['Actual', 'Issue'],
      ['0', 'line 1\nline "2"'],
    ],
  );
  assert.throws(
    () => readSpreadsheet('test.xlsx', Buffer.from('not a zip').toString('base64')),
    /valid XLSX/,
  );
  assert.throws(() => readSpreadsheet('test.exe', workbook.toString('base64')), /xlsx or .csv/);
  assert.throws(() => readSpreadsheet('test.csv', '%%invalid%%'), /Invalid or oversized/);
  assert.throws(
    () =>
      readSpreadsheet(
        'test.csv',
        Buffer.from('Actual,Issue\n1,"unfinished').toString('base64'),
      ),
    /not closed/,
  );
  const corrupted = Buffer.from(workbook);
  corrupted[100] ^= 1;
  assert.throws(() => readSpreadsheet('test.xlsx', corrupted.toString('base64')), /checksum/);
  assert.throws(
    () => readSpreadsheet('test.xlsx', workbook.subarray(0, 100).toString('base64')),
    /valid XLSX/,
  );
  const oversized = Buffer.from(workbook),
    directory = oversized.readUInt32LE(oversized.length - 22 + 16);
  oversized.writeUInt32LE(33 * 1024 * 1024, directory + 24);
  assert.throws(
    () => readSpreadsheet('test.xlsx', oversized.toString('base64')),
    /expanded workbook is too large/,
  );
  const duplicate = rewriteWorksheet(workbook, (xml) => xml.replace('r="B2"', 'r="A2"'));
  assert.throws(
    () => readSpreadsheet('test.xlsx', duplicate.toString('base64')),
    /duplicate cells/,
  );
  const sparse = rewriteWorksheet(workbook, (xml) =>
    xml
      .replaceAll('r="2"', 'r="9"')
      .replaceAll('A2', 'A9')
      .replaceAll('B2', 'B9')
      .replaceAll('C2', 'C9'),
  );
  assert.equal(readSpreadsheet('test.xlsx', sparse.toString('base64'))[1].sourceRow, 9);
  // The original supplied workbook exercises deflated OOXML/shared strings too.
  const original = await readFile(new URL('../temp.xlsx', import.meta.url));
  assert.ok(readSpreadsheet('temp.xlsx', original.toString('base64')).length > 70);
});

test('inline entry defaults, staffing snapshots and atomic Excel import', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-entry-import-')),
    dbPath = path.join(folder, 'test.sqlite');
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      ...testAuthEnv,
      PORT: String(port),
      DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (data) => (logs += data));
  child.stderr.on('data', (data) => (logs += data));
  const manager = createTestClient(base),
    member = createTestClient(base, 'member');
  const getConfig = async () => (await manager(base + '/api/config')).json();
  const send = (client, method, route, data) =>
    client(base + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const snapshot = async (date) =>
    (await member(base + `/api/records?date=${date}&shift=day`)).json();
  // Captured schedule/import cases deliberately use an archived production date.
  const date = '2001-04-01';
  let config, defaultDay;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        if ((await manager(base + '/api/config')).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    config = await getConfig();
    await t.test(
      'configures personnel by existing jobs, staffing and a daily mapping target',
      async () => {
        config.personnel = [
          { id: 'day-person', name: '中文 Day', job: 'PD', active: true },
          {
            id: 'night-person',
            name: 'ทีมกลางคืน Night',
            job: 'PD',
            active: true,
          },
          { id: 'other-job', name: 'Other Job', job: 'IE', active: true },
          { id: 'inactive-person', name: 'Inactive', job: 'PD', active: false },
        ];
        config.lineStaffing.CD303 = {
          day: ['day-person', 'other-job', 'inactive-person'],
          night: ['night-person'],
          owners: ['day-person'],
        };
        config.lineTargets.CD303 = 101;
        const response = await send(manager, 'PUT', '/api/config', config);
        assert.equal(response.status, 200);
        config = await response.json();
        const responseDefaults = await member(base + `/api/defaults?date=${date}&shift=day`);
        assert.equal(responseDefaults.status, 200);
        defaultDay = (await responseDefaults.json()).rows[3];
        const defaultNight = (
          await (await member(base + `/api/defaults?date=${date}&shift=night`)).json()
        ).rows[3];
        assert.equal(defaultDay.dayTeam, '中文 Day');
        assert.equal(defaultDay.nightTeam, 'ทีมกลางคืน Night');
        assert.equal(defaultDay.owner, '中文 Day');
        assert.equal(defaultDay.dailyTarget + defaultNight.dailyTarget, 101);
        assert.equal(
          defaultDay.slots.reduce((sum, slot) => sum + slot.target, 0),
          defaultDay.dailyTarget,
        );
        assert.equal((await snapshot(date)).defaults[3].dailyTarget, defaultDay.dailyTarget);
        assert.equal((await (await member(base + '/api/config')).json()).personnel.length, 4);
      },
    );
    await t.test(
      'validates personnel IDs, roles and staffing references without partial settings writes',
      async () => {
        for (const update of [
          (draft) => (draft.personnel[0].job = 'MISSING'),
          (draft) => (draft.personnel[0].id = ''),
          (draft) => (draft.personnel[1].id = draft.personnel[0].id),
          (draft) => draft.lineStaffing.CD303.day.push('unknown'),
        ]) {
          const draft = structuredClone(config);
          update(draft);
          assert.equal((await send(manager, 'PUT', '/api/config', draft)).status, 400);
        }
        assert.equal((await getConfig()).version, config.version);
      },
    );
    await t.test(
      'legacy free-text staffing stays historical without invented personnel associations',
      async () => {
        const legacyDate = '2099-04-02',
          slots = config.schedules.day
            .filter((slot) => slot.kind === 'production')
            .map((slot) => ({ id: slot.id, target: 7, actual: 1, issue: '' }));
        // An administrator seeds a legacy record; operators cannot create this metadata.
        const created = await send(manager, 'PUT', '/api/records/10', {
          date: legacyDate,
          shift: 'day',
          version: 0,
          configVersion: config.version,
          dayTeam: 'Legacy Team',
          nightTeam: 'Legacy Night',
          owner: 'Legacy Owner',
          dailyTarget: 500,
          slots,
        });
        assert.equal(created.status, 200);
        const edited = await send(member, 'PUT', '/api/records/10', {
          date: legacyDate,
          shift: 'day',
          version: 1,
          configVersion: config.version,
          entryMode: false,
          dayTeam: 'forged',
          nightTeam: 'forged',
          dailyTarget: 999,
          owner: 'forged',
          slots: [{ id: slots[0].id, target: 999, actual: 2 }],
        });
        assert.equal(edited.status, 200);
        const saved = await edited.json();
        assert.equal(saved.dayTeam, 'Legacy Team');
        assert.equal(saved.owner, 'Legacy Owner');
        assert.equal(saved.dailyTarget, 500);
        assert.deepEqual(saved.defaultsSnapshot.personnel, {
          day: [],
          night: [],
          owners: [],
        });
        assert.equal(saved.slots[0].target, 7);
      },
    );
    await t.test(
      'first inline save derives all readonly values and preserves explicit zero',
      async () => {
        const response = await send(member, 'PUT', '/api/records/3', {
          date,
          shift: 'day',
          version: 0,
          configVersion: config.version,
          entryMode: true,
          dayTeam: 'forged',
          nightTeam: 'forged',
          owner: 'forged',
          rowSnapshot: { line: 'forged' },
          defaultsSnapshot: { dailyTarget: 999 },
          dailyTarget: 999,
          slots: [
            {
              id: defaultDay.slots[0].id,
              target: 999,
              start: '00:00',
              end: '00:01',
              actual: 0,
              issue: 'First issue',
            },
          ],
        });
        assert.equal(response.status, 200);
        const saved = await response.json();
        assert.equal(saved.dayTeam, defaultDay.dayTeam);
        assert.equal(saved.dailyTarget, defaultDay.dailyTarget);
        assert.equal(saved.slots.length, defaultDay.slots.length);
        assert.equal(saved.slots[0].target, defaultDay.slots[0].target);
        assert.equal(saved.slots[0].actual, 0);
        assert.equal(saved.slots[1].actual, null);
        assert.ok(saved.defaultsSnapshot);
        assert.equal(saved.nightTeam, defaultDay.nightTeam);
        assert.equal(saved.owner, defaultDay.owner);
        assert.equal(saved.rowSnapshot.line, 'CD303');
        assert.equal(saved.defaultsSnapshot.dailyTarget, defaultDay.dailyTarget);
        assert.equal(saved.slots[0].start, defaultDay.slots[0].start);
      },
    );
    await t.test(
      'existing staffing/targets remain immutable after configuration changes; cell patches preserve other fields',
      async () => {
        const draft = structuredClone(config);
        draft.personnel[0].name = 'Renamed';
        draft.lineTargets.CD303 = 9999;
        const response = await send(manager, 'PUT', '/api/config', draft);
        assert.equal(response.status, 200);
        config = await response.json();
        const edit = await send(member, 'PUT', '/api/records/3', {
          date,
          shift: 'day',
          version: 1,
          configVersion: config.version,
          entryMode: false,
          owner: 'forged',
          dailyTarget: 1234,
          slots: [{ id: defaultDay.slots[0].id, target: 1234, actual: 5 }],
        });
        assert.equal(edit.status, 200);
        const saved = await edit.json();
        assert.equal(saved.dayTeam, '中文 Day');
        assert.equal(saved.dailyTarget, defaultDay.dailyTarget);
        assert.equal(saved.slots[0].target, defaultDay.slots[0].target);
        assert.equal(saved.slots[0].issue, 'First issue');
        assert.equal(saved.slots[0].actual, 5);
        const next = (
          await (await member(base + `/api/defaults?date=${date}&shift=day`)).json()
        ).rows[3];
        assert.equal(next.dayTeam, 'Renamed');
        assert.notEqual(next.dailyTarget, defaultDay.dailyTarget);
      },
    );
    await t.test(
      'opposite shift reuses the production-day snapshot after settings change without rewriting saves',
      async () => {
        const before = (await snapshot(date)).records.find((record) => record.rowId === 3),
          capturedNight = before.defaultsSnapshot.productionDay.night;
        const pending = await (
          await member(base + `/api/records?date=${date}&shift=night`)
        ).json();
        assert.deepEqual(pending.defaults[3], capturedNight);
        const draft = structuredClone(config);
        draft.schedules.night[0].start = '19:30';
        const updated = await send(manager, 'PUT', '/api/config', draft);
        assert.equal(updated.status, 200);
        config = await updated.json();
        assert.notEqual(config.schedules.night[0].id, capturedNight.slots[0].id);
        const template = readSpreadsheet(
          'night.xlsx',
          Buffer.from(
            await (
              await member(base + `/api/import/template?date=${date}&shift=night`)
            ).arrayBuffer(),
          ).toString('base64'),
        ).map((row) => row.map((cell) => cell.value));
        assert.equal(
          template.find((row) => row[template[0].indexOf('Row ID')] === '3')[
            template[0].indexOf('Time slot')
          ],
          `${capturedNight.slots[0].start}-${capturedNight.slots[0].end}`,
        );
        const planResponse = await send(member, 'POST', '/api/import/preview', {
          date,
          shift: 'night',
          fileName: 'night.xlsx',
          base64: writeSpreadsheet([
            legacyHeader,
            [
              3,
              'CD303',
              'PD',
              'HI',
              template.find((row) => row[template[0].indexOf('Row ID')] === '3')[
                template[0].indexOf('Time slot')
              ],
              6,
            ],
          ]).toString('base64'),
        });
        const plan = await planResponse.json();
        assert.equal(planResponse.status, 200);
        assert.deepEqual(plan.errors, []);
        assert.ok(plan.token);
        // Each station import uses that station's captured intervals, even when
        // another station has different historical boundaries.
        const response = await send(member, 'PUT', '/api/records/3', {
          date,
          shift: 'night',
          version: 0,
          configVersion: config.version,
          slots: [{ id: capturedNight.slots[0].id, actual: 6 }],
        });
        assert.equal(response.status, 200);
        const night = await response.json();
        assert.equal(night.dayTeam, defaultDay.dayTeam);
        assert.equal(night.dailyTarget + before.dailyTarget, 101);
        assert.equal(
          night.defaultsSnapshot.configVersion,
          before.defaultsSnapshot.configVersion,
        );
        assert.deepEqual(
          night.defaultsSnapshot.productionDay,
          before.defaultsSnapshot.productionDay,
        );
        assert.equal(night.defaultsSnapshot.capturedAt, before.defaultsSnapshot.capturedAt);
        assert.deepEqual(night.rowSnapshot, before.rowSnapshot);
        assert.equal(
          night.slots.find((slot) => slot.id === capturedNight.slots[0].id).actual,
          6,
        );
        assert.equal(
          night.slots.find((slot) => slot.id === config.schedules.night[0].id).target,
          null,
        );
        assert.deepEqual(
          (await snapshot(date)).records.find((record) => record.rowId === 3),
          before,
        );
        const nextDay = (
          await (await member(base + '/api/defaults?date=2099-04-03&shift=night')).json()
        ).rows[3];
        assert.equal(nextDay.sourceDailyTarget, 9999);
        const existingNight = structuredClone(night);
        const edited = await send(member, 'PUT', '/api/records/3', {
          date,
          shift: 'night',
          version: night.version,
          configVersion: config.version,
          owner: 'forged',
          dailyTarget: 999,
          slots: [{ id: capturedNight.slots[0].id, actual: null, issue: 'cleared' }],
        });
        assert.equal(edited.status, 200);
        const saved = await edited.json();
        assert.deepEqual(saved.defaultsSnapshot, existingNight.defaultsSnapshot);
        assert.equal(saved.dailyTarget, existingNight.dailyTarget);
        assert.equal(
          saved.slots.find((slot) => slot.id === capturedNight.slots[0].id).actual,
          null,
        );
        assert.deepEqual(
          (await snapshot(date)).records.find((record) => record.rowId === 3),
          before,
        );
      },
    );
    let templateRows;
    await t.test('downloads a real XLSX template with all active row/time IDs', async () => {
      const response = await member(base + `/api/import/template?date=${date}&shift=day`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /spreadsheetml/);
      templateRows = readSpreadsheet(
        'template.xlsx',
        Buffer.from(await response.arrayBuffer()).toString('base64'),
      ).map((row) => row.map((cell) => cell.value));
      assert.equal(
        templateRows.length,
        1 +
          config.rows.filter((row) => row.active).length *
            config.schedules.day.filter((slot) => slot.kind === 'production').length,
      );
      assert.deepEqual(templateRows[0], [
        'Date',
        'Shift',
        'Line',
        'Model',
        'Job',
        'Station',
        'Time slot',
        'Target',
        'Actual',
        'Issue',
        'Row ID',
      ]);
      assert.equal(templateRows[1][0], date);
      assert.equal(templateRows[1][1], 'day');
      // Other cases below intentionally exercise the original workbook layout.
      const header = templateRows[0];
      templateRows = [
        legacyHeader,
        ...templateRows
          .slice(1)
          .map((row) => legacyHeader.map((label) => row[header.indexOf(label)])),
      ];
    });
    let token;
    await t.test(
      'preview performs no writes and applying blank cells preserves saved values',
      async () => {
        const row = [...templateRows.find((row) => row[0] === '3')];
        row[5] = '';
        row[6] = 'Imported issue';
        const second = [...templateRows.find((row) => row[0] === '4')];
        second[5] = 0;
        second[6] = '';
        const base64 = writeSpreadsheet([templateRows[0], row, second]).toString('base64');
        const before = await snapshot(date);
        const preview = await send(member, 'POST', '/api/import/preview', {
          date,
          shift: 'day',
          fileName: 'entry.xlsx',
          base64,
        });
        assert.equal(preview.status, 200);
        const plan = await preview.json();
        assert.deepEqual(plan.errors, []);
        assert.equal(plan.summary.records, 2);
        assert.equal(plan.summary.cells, 2);
        assert.ok(plan.token);
        token = plan.token;
        assert.deepEqual((await snapshot(date)).records, before.records);
        const applied = await send(member, 'POST', '/api/import/apply', {
          token,
        });
        assert.equal(applied.status, 200);
        const result = await applied.json();
        const saved = result.records.find((record) => record.rowId === 3);
        assert.equal(
          saved.slots[0].actual,
          before.records.find((record) => record.rowId === 3).slots[0].actual,
        );
        assert.equal(saved.slots[0].issue, 'Imported issue');
        assert.equal(saved.dailyTarget, defaultDay.dailyTarget);
        assert.equal(result.records.find((record) => record.rowId === 4).slots[0].actual, 0);
        assert.equal((await send(member, 'POST', '/api/import/apply', { token })).status, 410);
      },
    );
    await t.test(
      'invalid/ambiguous rows and duplicate cells cannot produce an applicable plan',
      async () => {
        const files = [
          [
            ['Line', 'Time slot', 'Issue'],
            ['CD303', '07:40-08:00', 7],
          ],
          [templateRows[0], ['3', 'CD303', 'PD', 'HI', '07:40-08:00', -1, '']],
          [
            templateRows[0],
            ['3', 'CD303', 'PD', 'HI', '07:40-08:00', 1, ''],
            ['3', 'CD303', 'PD', 'HI', '07:40-08:00', 2, ''],
          ],
          [templateRows[0], ['3', 'CD303', 'PD', 'HI', '00:10-00:20', 1, '']],
        ];
        for (const file of files) {
          const response = await send(member, 'POST', '/api/import/preview', {
            date,
            shift: 'day',
            fileName: 'bad.xlsx',
            base64: writeSpreadsheet(file).toString('base64'),
          });
          assert.equal(response.status, 200);
          const plan = await response.json();
          assert.ok(plan.errors.length);
          assert.equal(plan.token, null);
        }
      },
    );
    await t.test(
      'import diagnostics honor the request language and original worksheet row addresses',
      async () => {
        const workbook = writeSpreadsheet([
          templateRows[0],
          ['3', 'CD303', 'PD', 'HI', '07:40-08:00', '-1', ''],
        ]);
        const sparse = rewriteWorksheet(workbook, (xml) =>
          xml.replaceAll('r="2"', 'r="9"').replace(/([A-I])2"/g, '$19"'),
        );
        const messages = [];
        for (const language of ['en', 'zh', 'th']) {
          const response = await member(base + '/api/import/preview?lang=' + language, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date,
              shift: 'day',
              fileName: 'bad.xlsx',
              base64: sparse.toString('base64'),
            }),
          });
          const plan = await response.json();
          assert.equal(plan.token, null);
          assert.equal(plan.errors[0].row, 9);
          assert.equal(plan.errors[0].code, 'invalidActual');
          messages.push(plan.errors[0].message);
        }
        assert.equal(new Set(messages).size, 3);
        assert.match(messages[1], /實績/);
        assert.match(messages[2], /ผลจริง/);
      },
    );
    await t.test('row version conflicts roll back an entire multi-record import', async () => {
      const rows = [
        templateRows[0],
        ['3', 'CD303', 'PD', 'HI', '07:40-08:00', 111, ''],
        ['4', 'CD303', 'IE', 'TU', '07:40-08:00', 111, ''],
      ];
      const plan = await (
        await send(member, 'POST', '/api/import/preview', {
          date,
          shift: 'day',
          fileName: 'conflict.xlsx',
          base64: writeSpreadsheet(rows).toString('base64'),
        })
      ).json();
      const before = await snapshot(date),
        row4 = before.records.find((record) => record.rowId === 4);
      assert.equal(
        (
          await send(member, 'PUT', '/api/records/4', {
            date,
            shift: 'day',
            version: row4.version,
            configVersion: config.version,
            entryMode: true,
            slots: [{ id: defaultDay.slots[0].id, actual: 9 }],
          })
        ).status,
        200,
      );
      const rejected = await send(member, 'POST', '/api/import/apply', {
        token: plan.token,
      });
      assert.equal(rejected.status, 409);
      const after = await snapshot(date);
      assert.deepEqual(
        after.records.find((record) => record.rowId === 3),
        before.records.find((record) => record.rowId === 3),
      );
      assert.equal(after.records.find((record) => record.rowId === 4).slots[0].actual, 9);
    });
    await t.test('preview is bound to its user, configuration and expiration', async () => {
      const rows = [templateRows[0], ['3', 'CD303', 'PD', 'HI', '07:40-08:00', 8, '']];
      const preview = async () =>
        (
          await send(member, 'POST', '/api/import/preview', {
            date,
            shift: 'day',
            fileName: 'scope.xlsx',
            base64: writeSpreadsheet(rows).toString('base64'),
          })
        ).json();
      let plan = await preview();
      assert.equal(
        (
          await send(manager, 'POST', '/api/import/apply', {
            token: plan.token,
          })
        ).status,
        410,
      );
      const changed = await send(manager, 'PUT', '/api/config', {
        ...config,
        theme: 'green',
      });
      assert.equal(changed.status, 200);
      config = await changed.json();
      assert.equal(
        (
          await send(member, 'POST', '/api/import/apply', {
            token: plan.token,
          })
        ).status,
        409,
      );
      plan = await preview();
      const db = new DatabaseSync(dbPath);
      db.prepare('UPDATE import_previews SET expires_at=0').run();
      db.close();
      assert.equal(
        (
          await send(member, 'POST', '/api/import/apply', {
            token: plan.token,
          })
        ).status,
        410,
      );
    });
    await t.test(
      'CSV mapping accepts line/job/station plus time and preserves multiline issues',
      () => {
        const csv =
          'Line,Job,Station,Time slot,Actual,Issue\r\nCD303,PD,HI,07:40-08:00,0,"中文\nทีม"\r\n';
        const result = previewImport(
          'file.csv',
          Buffer.from(csv).toString('base64'),
          config,
          date,
          'day',
        );
        assert.deepEqual(result.errors, []);
        assert.equal(result.rows[0].rowId, 3);
        assert.equal(result.rows[0].changes[0].actual, 0);
        assert.equal(result.rows[0].changes[0].issue, '中文\nทีม');
        const splitTime = previewImport(
          'file.csv',
          Buffer.from('Row ID,Start,End,Actual\n3,07:40,08:00,2').toString('base64'),
          config,
          date,
          'day',
        );
        assert.deepEqual(splitTime.errors, []);
        assert.equal(splitTime.rows[0].changes[0].actual, 2);
      },
    );
    await t.test(
      'historical import matches archived mapping snapshots and original slot times',
      async () => {
        const before = (await snapshot(date)).records.find((record) => record.rowId === 3),
          draft = structuredClone(config);
        const mapping = draft.rows.find((row) => row.id === 3);
        mapping.line = 'CD304';
        mapping.active = false;
        draft.schedules.day[0].start = '07:30';
        const updated = await send(manager, 'PUT', '/api/config', draft);
        assert.equal(updated.status, 200);
        config = await updated.json();
        const file = writeSpreadsheet([
          templateRows[0],
          ['3', 'CD303', 'PD', 'HI', '07:40-08:00', 12, 'Correction', date, 'day'],
        ]);
        const response = await send(member, 'POST', '/api/import/preview', {
          date,
          shift: 'day',
          fileName: 'history.xlsx',
          base64: file.toString('base64'),
        });
        assert.equal(response.status, 200);
        const plan = await response.json();
        assert.deepEqual(plan.errors, []);
        const applied = await send(member, 'POST', '/api/import/apply', {
          token: plan.token,
        });
        assert.equal(applied.status, 200);
        const record = (await applied.json()).records[0];
        assert.equal(record.rowSnapshot.line, 'CD303');
        assert.equal(record.slots.find((slot) => slot.id === before.slots[0].id).actual, 12);
        assert.equal(
          record.slots.find((slot) => slot.id === before.slots[0].id).target,
          before.slots[0].target,
        );
        assert.equal(record.dayTeam, before.dayTeam);
      },
    );
    await t.test('whole-day XLSX imports Target and Actual for both shifts', async () => {
      const wholeDate = '2026-12-01';
      const response = await member(base + `/api/import/template?date=${wholeDate}&shift=all`);
      assert.equal(response.status, 200);
      const rows = readSpreadsheet(
        'whole.xlsx',
        Buffer.from(await response.arrayBuffer()).toString('base64'),
      ).map((row) => row.map((cell) => cell.value));
      const header = rows[0];
      const shiftColumn = header.indexOf('Shift');
      const targetColumn = header.indexOf('Target');
      const actualColumn = header.indexOf('Actual');
      assert.equal(actualColumn, targetColumn + 1);
      const rowIdColumn = header.indexOf('Row ID');
      const rowIds = [...new Set(rows.slice(1).map((row) => row[rowIdColumn]))];
      for (const id of rowIds) {
        const indexes = rows.flatMap((row, index) => (row[rowIdColumn] === id ? [index] : []));
        assert.equal(indexes.at(-1) - indexes[0] + 1, indexes.length);
        const shifts = rows
          .filter((row) => row[rowIdColumn] === id)
          .map((row) => row[shiftColumn]);
        assert.ok(shifts.indexOf('night') > shifts.lastIndexOf('day'));
      }
      const day = [...rows.find((row, i) => i && row[shiftColumn] === 'day')];
      const night = [
        ...rows.find(
          (row, i) =>
            i &&
            row[shiftColumn] === 'night' &&
            row[header.indexOf('Row ID')] === day[header.indexOf('Row ID')],
        ),
      ];
      day[targetColumn] = 123;
      day[actualColumn] = 0;
      night[targetColumn] = 456;
      night[actualColumn] = 78;
      const preview = await send(member, 'POST', '/api/import/preview', {
        date: wholeDate,
        shift: 'all',
        fileName: 'whole.xlsx',
        base64: writeSpreadsheet([header, day, night]).toString('base64'),
      });
      assert.equal(preview.status, 200);
      const plan = await preview.json();
      assert.deepEqual(plan.errors, []);
      assert.equal(plan.rows.length, 2);
      const applied = await send(member, 'POST', '/api/import/apply', {
        token: plan.token,
      });
      assert.equal(applied.status, 200);
      const saved = (await applied.json()).records;
      assert.deepEqual(
        saved
          .map((record) => [
            record.shift,
            record.slots.find((slot) => slot.actual !== null)?.target,
            record.slots.find((slot) => slot.actual !== null)?.actual,
          ])
          .sort(),
        [
          ['day', 123, 0],
          ['night', 456, 78],
        ],
      );
    });
  } finally {
    if (child.exitCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
    await rm(folder, { recursive: true, force: true });
  }
});
