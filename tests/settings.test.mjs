import { createTestClient, testAuthEnv } from './test-auth.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { messages, translate } from '../public/i18n.js';

test('all three dictionaries cover the same UI, validation and export keys', async () => {
  const keys = Object.keys(messages.zh).sort();
  for (const lang of ['en', 'th']) assert.deepEqual(Object.keys(messages[lang]).sort(), keys);
  for (const [lang, dictionary] of Object.entries(messages))
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(typeof value === 'string' && value.trim(), `${lang}.${key}`);
      const placeholders = [...messages.zh[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(
        [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        placeholders,
        `${lang}.${key} placeholders`,
      );
    }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/g))
    assert.ok(messages.zh[match[1]], `HTML key ${match[1]}`);
  assert.equal(translate('th', 'minutes', { count: 30 }), '30 นาที');
});

test('config persistence, validation, stable history, migration and localization', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-settings-test-')),
    dbPath = path.join(folder, 'test.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(
    `CREATE TABLE production_records(date TEXT NOT NULL,shift TEXT NOT NULL,row_id INTEGER NOT NULL,day_team TEXT NOT NULL,night_team TEXT NOT NULL,daily_target INTEGER,owner TEXT NOT NULL,slots TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(date,shift,row_id))`,
  );
  legacy.prepare('INSERT INTO production_records VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    '2026-11-03',
    'day',
    3,
    'ทีมเช้า',
    '',
    '500',
    '陳小明',
    JSON.stringify(
      Array.from({ length: 5 }, (_, i) => ({
        target: i === 0 ? 100 : null,
        actual: i === 0 ? 80 : null,
        issue: i === 0 ? 'Motor check' : '',
      })),
    ),
    1,
    new Date().toISOString(),
  );
  legacy.close();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child, config;
  const client = createTestClient(base),
    operator = createTestClient(base, 'member');
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...testAuthEnv, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stderr.on('data', (d) => (logs += d));
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        if ((await client(base + '/api/config')).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(logs);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
  }
  const getConfig = async () => (await client(base + '/api/config')).json();
  const put = (url, data, lang = 'en') =>
    client(base + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
      body: JSON.stringify(data),
    });
  const records = async (date = '2026-11-03', shift = 'day') =>
    (await (await client(`${base}/api/records?date=${date}&shift=${shift}`)).json()).records;
  try {
    await start();
    config = await getConfig();
    await t.test('migrates old data with stable IDs and row snapshots', async () => {
      const r = (await records())[0];
      assert.equal(r.slots[0].id, 'day-p1');
      assert.equal(r.slots[0].start, '07:40');
      assert.equal(r.slots[0].actual, 80);
      assert.equal(r.rowSnapshot.line, 'CD303');
      assert.equal(r.dayTeam, 'ทีมเช้า');
      assert.equal(config.theme, 'delta');
      assert.equal(config.schedules.night.at(-1).end, '00:00');
    });
    await t.test(
      'adds custom catalogs, mapping, day interval, break and overnight night interval',
      async () => {
        const next = structuredClone(config);
        next.lines.push('CUSTOM-01');
        next.productionUnits.push({
          line: 'CUSTOM-01',
          model: 'Default',
          dailyTarget: null,
          staffing: {},
        });
        next.jobs.push('LEAD');
        next.stations.push('TEST');
        next.rows.push({
          id: 'new-row',
          plant: 'BP9',
          line: 'CUSTOM-01',
          job: 'LEAD',
          station: 'TEST',
          active: true,
        });
        next.schedules.day.push(
          { id: 'new-break', kind: 'break', start: '12:00', end: '12:30' },
          { id: 'new-slot', kind: 'production', start: '12:30', end: '13:30' },
        );
        next.schedules.night.push({
          id: 'new-night',
          kind: 'production',
          start: '00:00',
          end: '01:00',
        });
        next.language = 'th';
        next.theme = 'indigo';
        const response = await put('/api/config', next);
        assert.equal(response.status, 200);
        config = await response.json();
        assert.equal(config.version, 2);
        assert.equal(config.rows.length, 78);
        assert.equal(config.schedules.day.filter((s) => s.kind === 'production').length, 6);
        assert.equal(config.schedules.day.filter((s) => s.kind === 'break').length, 2);
        assert.ok(Number.isSafeInteger(config.rows.at(-1).id));
      },
    );
    await t.test('saves data for custom mapping and variable interval count', async () => {
      const row = config.rows.at(-1),
        slots = config.schedules.day
          .filter((s) => s.kind === 'production')
          .map((s) => ({ ...s, target: 10, actual: 9, issue: '' }));
      const response = await put(`/api/records/${row.id}`, {
        date: '2026-11-04',
        shift: 'day',
        version: 0,
        configVersion: config.version,
        dayTeam: 'ทดสอบ',
        nightTeam: '',
        owner: 'Owner',
        dailyTarget: 100,
        slots,
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).slots.length, 6);
    });
    await t.test('rejects stale configuration updates', async () => {
      const response = await put('/api/config', { ...config, version: 1 });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'errConfigConflict');
    });
    await t.test('rejects duplicate catalog names', async () => {
      const draft = structuredClone(config);
      draft.lines.push('cd303');
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test('rejects duplicate active mappings', async () => {
      const draft = structuredClone(config);
      draft.rows.push({ ...draft.rows[0], id: 'new-duplicate' });
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test('rejects invalid mapping references', async () => {
      const draft = structuredClone(config);
      draft.rows[0].line = 'missing';
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test('rejects production/break overlap and cross-midnight overlap', async () => {
      let draft = structuredClone(config);
      draft.schedules.day.push({ kind: 'break', start: '08:30', end: '08:40' });
      let response = await put('/api/config', draft, 'th');
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, messages.th.errOverlap);
      draft = structuredClone(config);
      draft.schedules.night.push({ kind: 'break', start: '23:30', end: '00:30' });
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test(
      'rejects cross-shift clock overlaps including the next-day part of an overnight shift',
      async () => {
        for (const [shift, start, end] of [
          ['night', '08:30', '08:40'],
          ['day', '00:15', '00:30'],
        ]) {
          const draft = structuredClone(config);
          draft.schedules[shift].push({ kind: 'production', start, end });
          const response = await put('/api/config', draft);
          assert.equal(response.status, 400);
          assert.equal((await response.json()).code, 'errOverlap');
        }
      },
    );
    await t.test(
      'rejects empty/equal/oversized times and shifts without production',
      async () => {
        for (const replacement of [
          [{ kind: 'production', start: '', end: '10:00' }],
          [{ kind: 'production', start: '10:00', end: '10:00' }],
          [{ kind: 'production', start: '00:00', end: '13:00' }],
          [{ kind: 'break', start: '08:00', end: '09:00' }],
        ]) {
          const draft = structuredClone(config);
          draft.schedules.day = replacement;
          assert.equal((await put('/api/config', draft)).status, 400);
        }
      },
    );
    await t.test('changes slot identity and keeps original values and names', async () => {
      const draft = structuredClone(config);
      draft.schedules.day[0].start = '07:30';
      draft.rows[0].line = 'CD304';
      draft.rows[0].job = 'LEAD';
      const response = await put('/api/config', draft);
      assert.equal(response.status, 200);
      config = await response.json();
      assert.notEqual(config.schedules.day[0].id, 'day-p1');
      const old = (await records())[0];
      assert.equal(old.slots[0].id, 'day-p1');
      assert.equal(old.slots[0].start, '07:40');
      assert.equal(old.slots[0].actual, 80);
      assert.equal(old.rowSnapshot.line, 'CD303');
    });
    await t.test(
      'updating after a schedule change preserves omitted historical intervals',
      async () => {
        const old = (await records())[0],
          slots = config.schedules.day
            .filter((s) => s.kind === 'production')
            .map((s) => ({ ...s, target: 20, actual: 10, issue: '' }));
        const response = await operator(base + '/api/records/3', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...old,
            date: '2026-11-03',
            shift: 'day',
            configVersion: config.version,
            entryMode: false,
            dayTeam: 'forged',
            nightTeam: 'forged',
            owner: 'forged',
            dailyTarget: 999,
            slots,
          }),
        });
        assert.equal(response.status, 200);
        const saved = await response.json();
        assert.equal(saved.slots.find((s) => s.id === 'day-p1').actual, 80);
        assert.equal(saved.slots.find((s) => s.id === 'day-p1').target, 100);
        assert.equal(saved.slots.find((s) => s.id === config.schedules.day[0].id).target, null);
        assert.equal(saved.dayTeam, old.dayTeam);
        assert.equal(saved.nightTeam, old.nightTeam);
        assert.equal(saved.owner, old.owner);
        assert.equal(saved.dailyTarget, old.dailyTarget);
        assert.deepEqual(saved.defaultsSnapshot.personnel, { day: [], night: [], owners: [] });
        assert.equal(saved.rowSnapshot.line, 'CD303');
      },
    );
    await t.test('deactivation retains history and blocks new records', async () => {
      const draft = structuredClone(config);
      draft.rows[0].active = false;
      const response = await put('/api/config', draft);
      assert.equal(response.status, 200);
      config = await response.json();
      assert.ok((await records()).length);
      const old = (await records())[0];
      assert.equal(
        (
          await put('/api/records/3', {
            ...old,
            date: '2026-11-05',
            shift: 'day',
            version: 0,
            configVersion: config.version,
          })
        ).status,
        400,
      );
    });
    await t.test('localizes validation and CSV headers in all languages', async () => {
      for (const lang of ['zh', 'en', 'th']) {
        const response = await put('/api/records/4', { date: 'bad', shift: 'day' }, lang);
        assert.equal((await response.json()).error, messages[lang].errDate);
        const csv = await (
          await client(`${base}/api/export?date=2026-11-03&shift=day&lang=${lang}`)
        ).text();
        assert.ok(csv.startsWith('"' + messages[lang].reportDate + '"'));
        assert.ok(csv.includes('07:40-08:00'));
        assert.ok(csv.includes('07:30-08:00'));
      }
    });
    await t.test(
      'saves custom line groups, sources and multiple alert thresholds',
      async () => {
        const draft = structuredClone(config);
        draft.monitoring.groups.push({
          id: 'custom-group',
          name: 'Custom Group',
          lines: ['CUSTOM-01'],
        });
        draft.monitoring.outputSources['CUSTOM-01'] = 'all';
        draft.monitoring.rules.push({
          id: 'extra-rule',
          type: 'idle',
          threshold: 900,
          comparison: 'gte',
          color: 'purple',
          blink: false,
          enabled: true,
        });
        const response = await put('/api/config', draft);
        assert.equal(response.status, 200);
        config = await response.json();
        assert.equal(config.monitoring.groups.at(-1).name, 'Custom Group');
        assert.equal(config.monitoring.outputSources['CUSTOM-01'], 'all');
        assert.equal(config.monitoring.rules.at(-1).threshold, 900);
      },
    );
    await t.test('refresh interval and alert type validation and persistence', async () => {
      for (const seconds of [0, -1, 1.5, 3601, '10']) {
        const draft = structuredClone(config);
        draft.monitoring.refreshSeconds = seconds;
        assert.equal((await put('/api/config', draft)).status, 400);
      }
      const invalid = structuredClone(config);
      invalid.monitoring.alertMode = 'unknown';
      assert.equal((await put('/api/config', invalid)).status, 400);
      const draft = structuredClone(config);
      draft.monitoring.refreshSeconds = 3;
      draft.monitoring.alertMode = 'idle';
      const response = await put('/api/config', draft);
      assert.equal(response.status, 200);
      config = await response.json();
      await stop();
      await start();
      const saved = await getConfig();
      assert.equal(saved.monitoring.refreshSeconds, 3);
      assert.equal(saved.monitoring.alertMode, 'all');
      assert.ok(
        saved.monitoring.rules.filter((r) => r.type === 'gap').every((r) => !r.enabled),
      );
      assert.ok(saved.monitoring.rules.filter((r) => r.type === 'idle').some((r) => r.enabled));
    });
    await t.test('rejects unknown group lines and invalid warning thresholds', async () => {
      let draft = structuredClone(config);
      draft.monitoring.groups[0].lines.push('MISSING');
      assert.equal((await put('/api/config', draft)).status, 400);
      draft = structuredClone(config);
      draft.monitoring.rules[0].threshold = -1;
      assert.equal((await put('/api/config', draft)).status, 400);
      draft = structuredClone(config);
      draft.monitoring.rules[0].threshold = 1.5;
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test('rejects empty or duplicate group and alert identifiers', async () => {
      for (const value of ['', '   ']) {
        let draft = structuredClone(config);
        draft.monitoring.groups[0].id = value;
        assert.equal((await put('/api/config', draft)).status, 400);
        draft = structuredClone(config);
        draft.monitoring.rules[0].id = value;
        assert.equal((await put('/api/config', draft)).status, 400);
      }
      const draft = structuredClone(config);
      draft.monitoring.groups[1].id = ' ' + draft.monitoring.groups[0].id + ' ';
      assert.equal((await put('/api/config', draft)).status, 400);
    });
    await t.test(
      'resolves a newly-added mapping as the selected line output source',
      async () => {
        const draft = structuredClone(config);
        draft.rows.push({
          id: 'new-monitor-source',
          plant: 'BP9',
          line: 'CUSTOM-01',
          job: 'LEAD',
          station: 'HI',
          active: true,
        });
        draft.monitoring.outputSources['CUSTOM-01'] = 'new-monitor-source';
        const response = await put('/api/config', draft);
        assert.equal(response.status, 200);
        config = await response.json();
        const row = config.rows.find((r) => r.line === 'CUSTOM-01' && r.station === 'HI');
        assert.equal(config.monitoring.outputSources['CUSTOM-01'], row.id);
      },
    );
    await t.test(
      'deleted configuration stays deleted and preserves editable historical reports',
      async () => {
        const history = await records('2026-11-04');
        const row = config.rows.find((item) => item.id === history[0].rowId);
        const draft = structuredClone(config);
        // Omitting a saved mapping means delete, not a temporary disable.
        draft.rows = draft.rows.filter((item) => item.id !== row.id);
        let response = await put('/api/config', draft);
        assert.equal(response.status, 200);
        config = await response.json();
        assert.equal(config.rows.find((item) => item.id === row.id).deleted, true);
        assert.equal(config.rows.find((item) => item.id === row.id).active, false);
        assert.deepEqual(await records('2026-11-04'), history);
        const stale = structuredClone(config);
        Object.assign(
          stale.rows.find((item) => item.id === row.id),
          { deleted: false, active: true },
        );
        response = await put('/api/config', stale);
        assert.equal(response.status, 200);
        config = await response.json();
        assert.equal(config.rows.find((item) => item.id === row.id).deleted, true);
        assert.equal(config.rows.find((item) => item.id === row.id).active, false);
        response = await put(`/api/entry/records/${row.id}`, {
          date: '2026-11-04',
          shift: 'day',
          version: history[0].version,
          configVersion: config.version,
          stationEntry: true,
          slots: [{ id: history[0].slots[0].id, issue: 'Retained historical station' }],
        });
        assert.equal(response.status, 200);
        assert.equal(
          (await records('2026-11-04'))[0].slots[0].issue,
          'Retained historical station',
        );
        assert.equal((await records('2026-11-04'))[0].slots.length, history[0].slots.length);
        response = await put(`/api/entry/records/${row.id}`, {
          date: '2026-11-05',
          shift: 'day',
          version: 0,
          configVersion: config.version,
          stationEntry: true,
          slots: [{ id: history[0].slots[0].id, actual: 1 }],
        });
        assert.equal(response.status, 400);
      },
    );
    await t.test('settings and custom records survive restart', async () => {
      await stop();
      await start();
      const saved = await getConfig();
      assert.equal(saved.version, config.version);
      assert.equal(saved.theme, 'indigo');
      assert.equal(saved.language, 'th');
      assert.ok(saved.lines.includes('CUSTOM-01'));
      assert.equal(saved.monitoring.groups.at(-1).id, 'custom-group');
      assert.equal(saved.monitoring.rules.at(-1).threshold, 900);
      assert.equal((await records('2026-11-04'))[0].slots.length, 6);
      assert.ok(saved.rows.some((row) => row.deleted && row.active === false));
    });
  } finally {
    await stop();
    await rm(folder, { recursive: true, force: true });
  }
});
