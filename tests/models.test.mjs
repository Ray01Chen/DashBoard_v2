import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createTestClient, testAuthEnv } from './test-auth.mjs';
import {
  upgradeProductionModels,
  productionKey,
  productionUnits,
  setProductionUnit,
  modelOf,
  productionIdentityMarkup,
  productionLabel,
} from '../public/production-models.js';
import {
  renameCatalogItem,
  removeCatalogItem,
  catalogImpact,
} from '../public/catalog-settings.js';
import {
  addBatchMappings,
  updateMapping,
  mappingStaff,
  handleWorkforceChange,
} from '../public/workforce-settings.js';
import { buildProductionDefaults } from '../production-defaults.mjs';
import { buildLineMonitor } from '../public/monitor.js';
import { previewImport, importTemplate } from '../production-import.mjs';
import { readSpreadsheet } from '../spreadsheet.mjs';

test('visible line/model identities preserve full escaped values separately from plain labels', () => {
  const row = {
    line: '<Line>',
    model: 'ECD16010094-ORV3-PSU-3KW-AutoLine & test',
  };
  const esc = (value) =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const html = productionIdentityMarkup(row, esc);
  assert.ok(html.includes('<span class="production-line">&lt;Line&gt;</span>'));
  assert.ok(html.includes('production-model-main">ECD16010094</span>'));
  assert.ok(html.includes('(ORV3-PSU-3KW-AutoLine &amp; test)</span>'));
  assert.ok(!html.includes('Model ·'));
  assert.ok(
    !productionIdentityMarkup({ line: 'A', model: 'NoHyphen' }, esc).includes(
      'production-model-suffix',
    ),
  );
  assert.equal(productionLabel(row), '<Line> · ECD16010094-ORV3-PSU-3KW-AutoLine & test');
  assert.ok(!html.includes('<Line>'));
});

function fixture() {
  return {
    plant: 'BP9',
    version: 1,
    lines: ['L'],
    models: ['A', 'B'],
    jobs: ['QA'],
    stations: ['Pack', 'Test'],
    personnel: [
      { id: 'a', name: 'Team A', job: 'QA', active: true },
      { id: 'b', name: 'Team B', job: 'QA', active: true },
    ],
    productionUnits: ['A', 'B'].map((model, index) => ({
      line: 'L',
      model,
      dailyTarget: 1000 * (index + 1),
      staffing: {
        day: [model.toLowerCase()],
        night: [],
        owners: [model.toLowerCase()],
      },
    })),
    rows: ['A', 'B'].flatMap((model, index) =>
      ['Pack', 'Test'].map((station, i) => ({
        id: index * 2 + i + 1,
        line: 'L',
        model,
        job: 'QA',
        station,
        active: true,
      })),
    ),
    schedules: {
      day: [{ id: 'd', start: '08:00', end: '09:00', kind: 'production' }],
      night: [{ id: 'n', start: '20:00', end: '21:00', kind: 'production' }],
    },
    monitoring: {
      outputSources: { L: 1 },
      groups: [{ id: 'all', name: 'All', lines: ['L'] }],
      rules: [],
    },
  };
}

test('model migration preserves preset zero/null, teams, old snapshots and is idempotent', () => {
  const cfg = {
    lines: ['L', 'N'],
    rows: [{ id: 1, line: 'L' }],
    lineTargets: { L: 0, N: null },
    lineStaffing: { L: { day: ['x'] } },
  };
  const oldSnapshot = structuredClone(cfg.rows[0]);
  assert.equal(upgradeProductionModels(cfg), true);
  assert.equal(modelOf(oldSnapshot), 'Default');
  assert.equal(cfg.productionUnits[0].dailyTarget, 0);
  assert.equal(cfg.productionUnits[1].dailyTarget, null);
  assert.deepEqual(cfg.productionUnits[0].staffing.day, ['x']);
  assert.equal(upgradeProductionModels(cfg), false);
  cfg.productionUnits[0].staffing.day.push('y');
  assert.deepEqual(cfg.lineStaffing.L.day, ['x']);
  assert.equal(productionKey({ line: 'L · A', model: 'B' }), JSON.stringify(['L · A', 'B']));
  assert.notEqual(
    productionKey({ line: 'L · A', model: 'B' }),
    productionKey({ line: 'L', model: 'A · B' }),
  );
});

test('targets, personnel, mapping duplicates and model reassignment use the same production identity', () => {
  const cfg = fixture(),
    d = buildProductionDefaults(cfg, 'day');
  assert.equal(d[1].dailyTarget, 500);
  assert.equal(d[3].dailyTarget, 1000);
  assert.deepEqual(d[1].slots, d[2].slots);
  assert.equal(d[1].dayTeam, 'Team A');
  assert.equal(d[3].owner, 'Team B');
  assert.equal(mappingStaff(cfg, cfg.rows[3]).day[0].id, 'b');
  const result = addBatchMappings(cfg, ['L'], [{ job: 'QA', station: 'Pack' }], undefined, 'B');
  assert.equal(result.skipped, 1);
  cfg.rows[2].active = false;
  const id = cfg.rows[0].id;
  assert.equal(updateMapping(cfg, 0, { model: 'B' }).ok, true);
  assert.equal(cfg.rows[0].active, false);
  assert.notEqual(cfg.rows.at(-1).id, id);
  assert.equal(cfg.rows.at(-1).model, 'B');
  handleWorkforceChange(cfg, {
    dataset: { lineTarget: 'L', targetModel: 'B' },
    value: '2500',
  });
  assert.equal(cfg.productionUnits[0].dailyTarget, 1000);
  assert.equal(cfg.productionUnits[1].dailyTarget, 2500);
});

test('catalog rename updates targets, teams and references; retirement is a single draft action', () => {
  const cfg = fixture(),
    history = structuredClone(cfg.rows);
  assert.equal(renameCatalogItem(cfg, 'models', 'A', 'Model A'), true);
  assert.equal(cfg.rows[0].model, 'Model A');
  assert.equal(cfg.productionUnits[0].dailyTarget, 1000);
  assert.deepEqual(cfg.productionUnits[0].staffing.day, ['a']);
  assert.equal(renameCatalogItem(cfg, 'models', 'Model A', 'b'), false);
  assert.deepEqual(catalogImpact(cfg, 'models', 'Model A'), {
    mappings: 2,
    people: 0,
    units: 1,
  });
  assert.equal(removeCatalogItem(cfg, 'models', 'Model A'), true);
  assert.equal(cfg.rows.filter((r) => r.active).length, 2);
  assert.deepEqual(cfg.models, ['B']);
  assert.deepEqual(
    history.map((r) => r.model),
    ['A', 'A', 'B', 'B'],
  );
  assert.equal(removeCatalogItem(cfg, 'jobs', 'QA'), true);
  assert.deepEqual(cfg.personnel, []);
  assert.ok(cfg.rows.every((r) => !r.active));
  assert.deepEqual(cfg.productionUnits[0].staffing.day, []);
  assert.equal(renameCatalogItem(cfg, 'lines', 'L', 'Renamed'), true);
  assert.deepEqual(cfg.monitoring.groups[0].lines, ['Renamed']);
  assert.equal(cfg.productionUnits[0].line, 'Renamed');
  assert.equal(removeCatalogItem(cfg, 'lines', 'Renamed'), true);
  assert.deepEqual(cfg.productionUnits, []);
});

test('enabling models starts independent empty settings and disabling preserves mapping IDs', () => {
  const cfg = fixture();
  cfg.models.push('C');
  assert.equal(setProductionUnit(cfg, 'L', 'C', true), true);
  assert.equal(productionUnits(cfg).at(-1).dailyTarget, null);
  assert.deepEqual(productionUnits(cfg).at(-1).staffing, {
    day: [],
    night: [],
    owners: [],
  });
  setProductionUnit(cfg, 'L', 'A', false);
  assert.equal(cfg.rows[0].id, 1);
  assert.equal(cfg.rows[0].active, false);
  assert.equal(cfg.rows[2].active, true);
  assert.equal(cfg.rows[0].deleted, true);
  setProductionUnit(cfg, 'L', 'A', true);
  addBatchMappings(
    cfg,
    ['L'],
    [{ job: 'QA', station: 'Pack' }],
    () => 'new-after-removal',
    'A',
  );
  assert.equal(cfg.rows.at(-1).id, 'new-after-removal');
  assert.equal(cfg.rows[0].active, false);
});

test('monitor and spreadsheet import never aggregate or synchronize across models', () => {
  const cfg = fixture(),
    defaults = buildProductionDefaults(cfg, 'day');
  const records = cfg.rows.map((row) => ({
    rowId: row.id,
    rowSnapshot: row,
    version: 1,
    slots: [
      {
        ...defaults[row.id].slots[0],
        actual: row.model === 'A' ? 12 : 23,
        lineShared: true,
      },
    ],
  }));
  cfg.monitoring.outputSources.L = 'all';
  const monitor = buildLineMonitor(cfg, records, '2026-11-06', 'day');
  assert.equal(monitor.length, 2);
  assert.deepEqual(
    monitor.map((m) => m.actual),
    [12, 23],
  );
  assert.deepEqual(
    monitor.map((m) => m.target),
    [500, 1000],
  );
  const preview = (csv) =>
    previewImport(
      'models.csv',
      Buffer.from(csv).toString('base64'),
      cfg,
      '2026-11-06',
      'day',
      records,
      'en',
      defaults,
    );
  assert.equal(preview('Line,Time slot,Actual\nL,08:00,20').errors[0].code, 'ambiguous');
  const plan = preview(
    'Line,Model,Station,Time slot,Target,Actual\nL,A,Pack,08:00,555,40\nL,A,Test,08:00,556,41\nL,B,Pack,08:00,999,80\nL,B,Test,08:00,998,81',
  );
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(
    plan.rows.filter((r) => r.model === 'A').map((r) => r.changes[0].actual),
    [40, 41],
  );
  assert.deepEqual(
    plan.rows.filter((r) => r.model === 'B').map((r) => r.changes[0].target),
    [999, 998],
  );
});

test('output station settings belong to a model and follow catalog renames', () => {
  const cfg = fixture();
  cfg.monitoring.unitOutputSources = {
    [productionKey({ line: 'L', model: 'A' })]: 1,
    [productionKey({ line: 'L', model: 'B' })]: 4,
  };
  let result = buildLineMonitor(cfg, [], '2026-11-06', 'day');
  assert.deepEqual(
    result.map((value) => value.sourceRows),
    [[1], [4]],
  );
  renameCatalogItem(cfg, 'models', 'B', 'B renamed');
  assert.equal(cfg.monitoring.unitOutputSources[JSON.stringify(['L', 'B renamed'])], 4);
  result = buildLineMonitor(cfg, [], '2026-11-06', 'day');
  assert.equal(result.find((value) => value.model === 'B renamed').source, 4);
  removeCatalogItem(cfg, 'models', 'B renamed');
  assert.equal(Object.keys(cfg.monitoring.unitOutputSources).length, 1);
});

test('historical templates preserve model, retired station and interval identities for round-trip import', () => {
  const cfg = fixture();
  const snapshots = structuredClone(cfg.rows.slice(0, 2));
  const records = snapshots.map((row) => ({
    rowId: row.id,
    rowSnapshot: row,
    slots: [
      {
        id: 'retired',
        start: '06:30',
        end: '07:00',
        target: 20,
        actual: 15,
        issue: '',
      },
    ],
  }));
  renameCatalogItem(cfg, 'models', 'A', 'New name');
  cfg.rows[0].active = false;
  const matrix = readSpreadsheet(
    'template.xlsx',
    importTemplate(cfg, 'day', '2026-11-06', {}, records).toString('base64'),
  ).map((row) => row.map((cell) => cell.value));
  const column = (name) => matrix[0].indexOf(name);
  const historical = matrix.find((row) => Number(row[column('Row ID')]) === 1);
  assert.equal(historical[column('Model')], 'A');
  assert.equal(historical[column('Time slot')], '06:30-07:00');
  historical[column('Actual')] = 55;
  const csv = [matrix[0], historical].map((row) => row.join(',')).join('\n');
  const preview = previewImport(
    'history.csv',
    Buffer.from(csv).toString('base64'),
    cfg,
    '2026-11-06',
    'day',
    records,
    'en',
  );
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(
    preview.rows.map((row) => row.model),
    ['A'],
  );
  assert.ok(preview.rows.every((row) => row.changes[0].actual === 55));
});

test('whole-day templates group models and configured stations, with overnight slots in shift order', () => {
  const cfg = fixture();
  cfg.rows = [cfg.rows[1], cfg.rows[3], cfg.rows[0], cfg.rows[2]];
  cfg.schedules.night = [
    { id: 'n1', start: '23:00', end: '00:00', kind: 'production' },
    { id: 'n2', start: '00:00', end: '01:00', kind: 'production' },
  ];
  const workbook = importTemplate(cfg, 'all', '2026-11-10');
  const matrix = readSpreadsheet('all.xlsx', workbook.toString('base64')).map((row) =>
    row.map((cell) => cell.value),
  );
  const header = matrix.shift();
  const column = (name) => header.indexOf(name);
  assert.deepEqual(
    matrix.map((row) => [row[column('Model')], row[column('Row ID')], row[column('Shift')]]),
    ['A:2', 'A:1', 'B:4', 'B:3'].flatMap((key) => {
      const [model, id] = key.split(':');
      return [
        [model, id, 'day'],
        [model, id, 'night'],
        [model, id, 'night'],
      ];
    }),
  );
  assert.deepEqual(
    matrix.slice(0, 3).map((row) => row[column('Time slot')]),
    ['08:00-09:00', '23:00-00:00', '00:00-01:00'],
  );
  // Stored ZIP members let us check the actual workbook layout and relationships.
  const xml = workbook.toString('utf8');
  assert.match(xml, /autoFilter ref="A1:K13"/);
  assert.match(xml, /xSplit="6" ySplit="1" topLeftCell="G2"/);
  assert.match(xml, /PartName="\/xl\/styles.xml"/);
  assert.match(xml, /Target="styles.xml"/);
  assert.match(xml, /r="H2" s="3"/);
  assert.match(xml, /min="4" max="4" width="40"/);

  // Reverse worksheet order; the preview still follows configured station and
  // captured overnight order while keeping original worksheet diagnostics.
  const input = matrix
    .slice()
    .reverse()
    .map((row) => {
      const filled = [...row];
      filled[column('Target')] = 12;
      filled[column('Actual')] = 0;
      return filled;
    });
  const preview = previewImport(
    'all.csv',
    Buffer.from([header, ...input].map((row) => row.join(',')).join('\n')).toString('base64'),
    cfg,
    '2026-11-10',
    'all',
  );
  assert.deepEqual(preview.errors, []);
  assert.deepEqual(
    preview.rows.map((row) => [row.rowId, row.shift]),
    [2, 1, 4, 3].flatMap((id) => [
      [id, 'day'],
      [id, 'night'],
    ]),
  );
  assert.deepEqual(
    preview.rows[1].changes.map((change) => change.slotId),
    ['n1', 'n2'],
  );
  assert.ok(preview.rows.every((row) => row.changes.every((change) => change.actual === 0)));
});

test('line/model API saves isolate records, targets, imports and historical identities', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-models-'));
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
  const base = `http://127.0.0.1:${port}`,
    client = createTestClient(base);
  const put = (url, data) =>
    client(base + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  const date = '2026-11-06';
  const report = async () =>
    (await client(`${base}/api/records?date=${date}&shift=day`)).json();
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await client(base + '/api/config')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(ready);
    let cfg = await (await client(base + '/api/config')).json();
    // Use the existing server's numeric mapping IDs; helper fixtures start at 1.
    const ids = cfg.rows.slice(0, 4).map((row) => row.id);
    const modelIds = Object.fromEntries(ids.map((id, index) => [index + 1, id]));
    const f = fixture();
    cfg = {
      ...cfg,
      ...f,
      version: cfg.version,
      rows: cfg.rows.map((row) => ({ ...row, active: false })),
    };
    for (const row of f.rows)
      Object.assign(
        cfg.rows.find((r) => r.id === modelIds[row.id]),
        { ...row, id: modelIds[row.id] },
      );
    cfg.monitoring = {
      ...(await (await client(base + '/api/config')).json()).monitoring,
      ...f.monitoring,
    };
    let res = await put('/api/config', cfg);
    assert.equal(res.status, 200, await res.clone().text());
    cfg = await res.json();
    let snapshot = await report();
    const save = async (fixtureId, slots, expectedExtra = []) => {
      const id = modelIds[fixtureId];
      const row = cfg.rows.find((r) => r.id === id);
      return put('/api/entry/records/' + id, {
        date,
        shift: 'day',
        version: snapshot.records.find((r) => r.rowId === id)?.version || 0,
        configVersion: cfg.version,
        slots,
        expectedValues: [
          ...cfg.rows
            .filter((r) => r.active && productionKey(r) === productionKey(row))
            .map((r) => ({
              rowId: r.id,
              slots: (snapshot.records.find((v) => v.rowId === r.id) || snapshot.defaults[r.id])
                .slots,
            })),
          ...expectedExtra,
        ],
      });
    };
    await t.test(
      'shared save writes only the selected model and leaves presets alone',
      async () => {
        res = await save(1, [{ id: cfg.schedules.day[0].id, target: 550, actual: 30 }]);
        assert.equal(res.status, 200, await res.clone().text());
        assert.equal((await res.json()).syncedRecords.length, 1);
        snapshot = await report();
        assert.deepEqual(
          snapshot.records.map((r) => r.rowId),
          ids.slice(0, 2),
        );
        assert.equal(snapshot.defaults[modelIds[3]].slots[0].actual, null);
        const stored = await (await client(base + '/api/config')).json();
        assert.equal(stored.productionUnits[0].dailyTarget, 1000);
      },
    );
    await t.test('cross-model expected membership rejects atomically', async () => {
      res = await save(
        1,
        [{ id: cfg.schedules.day[0].id, actual: 99 }],
        [{ rowId: modelIds[3], slots: snapshot.defaults[modelIds[3]].slots }],
      );
      assert.equal(res.status, 409);
      assert.deepEqual((await report()).records, snapshot.records);
    });
    await t.test(
      'a station note in another model never inherits the first models output',
      async () => {
        res = await save(3, [{ id: cfg.schedules.day[0].id, issue: 'Model B only' }]);
        assert.equal(res.status, 200);
        const saved = await res.json();
        assert.equal(saved.slots[0].actual, null);
        assert.equal(saved.slots[0].target, 1000);
        snapshot = await report();
      },
    );
    await t.test('invalid model references and duplicate units are rejected', async () => {
      const invalid = structuredClone(cfg);
      invalid.productionUnits.push({ ...invalid.productionUnits[0] });
      assert.equal((await put('/api/config', invalid)).status, 400);
      invalid.productionUnits.pop();
      invalid.rows[0].model = 'Missing';
      assert.equal((await put('/api/config', invalid)).status, 400);
      invalid.rows[0].model = 'B';
      assert.equal((await put('/api/config', invalid)).status, 400);
      const orphan = structuredClone(cfg);
      orphan.personnel.push({
        id: 'obsolete',
        name: 'Removed job person',
        job: 'Removed job',
        active: false,
      });
      assert.equal(
        (await put('/api/config', orphan)).status,
        400,
        'Inactive entries cannot recreate a removed job',
      );
    });
    await t.test(
      'retiring a model saves without visiting mappings and keeps reports intact',
      async () => {
        removeCatalogItem(cfg, 'models', 'A');
        res = await put('/api/config', cfg);
        assert.equal(res.status, 200, await res.clone().text());
        cfg = await res.json();
        assert.deepEqual((await report()).records, snapshot.records);
        assert.ok(cfg.rows.filter((row) => row.model === 'A').every((row) => !row.active));
        const csv = await (
          await client(
            `${base}/api/export?date=${date}&shift=day&line=${encodeURIComponent(JSON.stringify(['L', 'A']))}`,
          )
        ).text();
        assert.ok(csv.includes('Model'));
        assert.ok(csv.includes(',"A"'));
      },
    );
    await t.test(
      'empty catalogs can be saved incrementally after dependent rows are archived',
      async () => {
        for (const name of ['lines', 'models', 'jobs', 'stations'])
          for (const value of [...cfg[name]]) removeCatalogItem(cfg, name, value);
        res = await put('/api/config', cfg);
        assert.equal(res.status, 200, await res.clone().text());
        assert.deepEqual((await res.json()).productionUnits, []);
        assert.deepEqual((await report()).records, snapshot.records);
      },
    );
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    const resolved = path.resolve(folder);
    assert.ok(
      resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(resolved).startsWith('bp9-models-'),
    );
    await rm(resolved, { recursive: true, force: true });
  }
});
