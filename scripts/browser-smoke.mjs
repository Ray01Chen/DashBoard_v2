/**
 * Real Chromium workflow checks against a fresh, temporary SQLite database.
 * Requires playwright-core (test-only) and installed Chrome/Edge. No production
 * server, settings or accounts are touched. --screenshots refreshes guide images.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readSpreadsheet, writeSpreadsheet } from '../spreadsheet.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const playwrightPath =
  process.env.BP_PLAYWRIGHT_PATH ||
  [
    '.runtime/browser-audit/node_modules/playwright-core/index.mjs',
    '.runtime/browser-audit/package/index.mjs',
  ]
    .map((file) => path.join(root, file))
    .find(existsSync);
if (!playwrightPath)
  throw new Error(
    'Install test tools: npm install --no-save --prefix .runtime/browser-audit playwright-core@1.56.1',
  );
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const executablePath =
  process.env.BP_BROWSER_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
const folder = await mkdtemp(path.join(tmpdir(), 'bp9-browser-'));
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DB_PATH: path.join(folder, 'test.sqlite'),
    BP_MANAGER_PASSWORD: 'manager',
    BP_MEMBER_PASSWORD: 'member',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLogs = '';
child.stdout.on('data', (value) => {
  serverLogs += value;
});
child.stderr.on('data', (value) => {
  serverLogs += value;
});
const checks = [];
const record = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const screenshots = process.argv.includes('--screenshots');
const secondModel = 'ECD16010094-ORV3-PSU-3KW-AutoLine';
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(serverLogs);
    try {
      if ((await fetch(baseURL)).ok) break;
    } catch {}
    if (attempt === 99) throw new Error('Test server failed to start: ' + serverLogs);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('BROWSER:', error.message);
  });
  await page.goto(baseURL);
  await page.locator('#login-username').fill('manager');
  await page.locator('#login-password').fill('manager');
  await page.locator('#login-submit').click();
  await page.locator('#login-dialog').waitFor({ state: 'hidden' });
  await mkdir(path.join(root, 'docs/images'), { recursive: true });
  const readConfig = async () => (await context.request.get(baseURL + '/api/config')).json();
  const readReport = async (date, shift = 'day') =>
    (await context.request.get(baseURL + `/api/records?date=${date}&shift=${shift}`)).json();
  const saveSettings = async () => {
    await page.locator('[data-save-settings]').first().click();
    await page.waitForFunction(
      () =>
        document.querySelector('#settings-save-status').textContent === 'All settings are saved.',
    );
  };
  const saved = async () =>
    page.waitForFunction(
      () => document.querySelector('[data-entry-overall]')?.textContent === 'Saved',
    );
  const screenshot = async (selector, name) => {
    if (!screenshots) return;
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page
      .locator(selector)
      .first()
      .screenshot({ path: path.join(root, 'docs/images/' + name + '.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  const model = secondModel,
    otherModel = 'SECOND-MODEL';
  const team = {
    day: ['pd-a', 'pd-b', 'qa-day'],
    night: ['pd-night', 'qa-night'],
    owners: ['owner'],
  };
  let config = await readConfig();
  Object.assign(config, {
    lines: ['DEMO-A', 'DEMO-B'],
    models: ['Default'],
    jobs: ['PD', 'QA', 'Line Owner', 'Empty job'],
    stations: ['Pack', 'Test'],
    personnel: [
      { id: 'pd-a', name: 'Alex Day', job: 'PD', active: true },
      { id: 'pd-b', name: 'Bea Day', job: 'PD', active: true },
      { id: 'pd-night', name: 'Blake Night', job: 'PD', active: true },
      { id: 'qa-day', name: 'Casey Day', job: 'QA', active: true },
      { id: 'qa-night', name: 'Dana Night', job: 'QA', active: true },
      { id: 'owner', name: 'Morgan Owner', job: 'Line Owner', active: true },
    ],
    schedules: {
      day: [
        { id: 'd1', start: '08:00', end: '08:20', kind: 'production' },
        { id: 'break', start: '08:20', end: '08:40', kind: 'break' },
        { id: 'd2', start: '08:40', end: '09:40', kind: 'production' },
      ],
      night: [{ id: 'n1', start: '20:00', end: '21:20', kind: 'production' }],
    },
    productionUnits: [
      { line: 'DEMO-A', model: 'Default', dailyTarget: 1000, staffing: structuredClone(team) },
      { line: 'DEMO-B', model: 'Default', dailyTarget: 300, staffing: structuredClone(team) },
    ],
    lineStaffing: {},
    lineTargets: {},
  });
  config.rows = config.rows.map((row) => ({ ...row, active: false }));
  for (const [id, line, job, station] of [
    [3, 'DEMO-A', 'PD', 'Pack'],
    [4, 'DEMO-A', 'QA', 'Test'],
    [5, 'DEMO-B', 'PD', 'Pack'],
  ])
    Object.assign(
      config.rows.find((row) => row.id === id),
      { line, model: 'Default', job, station, active: true },
    );
  config.monitoring.groups = [{ id: 'training', name: 'Training example', lines: config.lines }];
  config.monitoring.outputSources = {};
  config.monitoring.unitOutputSources = {};
  let response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  config = await response.json();
  const historyDate = '2026-11-03',
    reportDate = '2026-11-10';
  const historicalDefault = (await readReport(historyDate)).defaults[3];
  response = await context.request.put(baseURL + '/api/entry/records/3', {
    data: {
      date: historyDate,
      shift: 'day',
      version: 0,
      configVersion: config.version,
      stationEntry: true,
      slots: [{ id: historicalDefault.slots[0].id, actual: 17, issue: 'Historical entry' }],
    },
  });
  assert.equal(response.status(), 200);
  const historical = (await readReport(historyDate)).records;
  config.models = [model, otherModel];
  config.productionUnits = [
    { line: 'DEMO-A', model, dailyTarget: 1000, staffing: structuredClone(team) },
    {
      line: 'DEMO-A',
      model: otherModel,
      dailyTarget: 600,
      staffing: { day: ['pd-b'], night: ['pd-night'], owners: ['owner'] },
    },
    { line: 'DEMO-B', model, dailyTarget: 300, staffing: structuredClone(team) },
  ];
  config.rows = config.rows.map((row) => ({ ...row, active: false }));
  response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  config = await response.json();
  await page.reload();
  await page.locator('#language-select').selectOption('en');
  await page.locator('[data-shift="day"]').click();
  await page.locator('#report-date').fill(reportDate);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-view="entry"]').click();
  assert.equal(await page.locator('[data-entry-line] option').count(), 3);
  assert.equal(await page.locator('[data-entry-model-filter] option').count(), 3);
  assert.equal(await page.locator('[data-entry-station]').count(), 0);
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  assert.equal(await page.locator('[data-entry-setup-unit]').count(), 1);
  assert.match(await page.locator('[data-entry-setup-unit]').innerText(), /125/);
  assert.equal(await page.locator('[data-entry-field="actual"]').count(), 0);
  record(
    'Configured line/model choices and target preview remain visible before stations are enabled',
  );
  await page.locator('[data-entry-action="configure-unit"]').click();
  assert.equal(await page.locator('[data-mapping-line-filter]').inputValue(), 'DEMO-A');
  assert.equal(await page.locator('[data-mapping-model]').inputValue(), model);
  assert.equal(await page.locator('[data-row-field="model"]').count(), 0);
  assert.equal(await page.locator('[data-mapping-line-select]').count(), 0);
  assert.equal(await page.locator('[data-mapping-suggestion], [data-mapping-template]').count(), 0);
  assert.equal(await page.locator('[data-configured-mapping]').count(), 0);
  assert.match(await page.locator('.mapping-empty').innerText(), /No stations configured/);
  assert.equal(await page.locator('[data-unit-output-source]').isDisabled(), true);
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-B');
  assert.deepEqual(
    await page
      .locator('[data-mapping-model] option')
      .evaluateAll((options) => options.map((option) => option.value)),
    [model],
  );
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  record(
    'Missing configuration opens the exact unit; dropdowns follow enabled master pairs without row-level models',
  );
  await page.locator('[data-batch-field="job"]').selectOption('QA');
  await page.locator('[data-batch-field="station"]').selectOption('Test');
  const preview = await page.locator('.mapping-new-row .automatic-staff').innerText();
  assert.match(preview, /Casey Day/);
  assert.match(preview, /Dana Night/);
  assert.match(preview, /Morgan Owner/);
  assert.doesNotMatch(preview, /Alex Day/);
  assert.equal(await page.locator('[data-action="add-batch-mappings"]').isDisabled(), false);
  record(
    'The integrated add row previews job-matched day/night staff and owners before activation',
  );
  await page.locator('[data-batch-field="job"]').selectOption('PD');
  await page.locator('[data-batch-field="station"]').selectOption('Pack');
  await page.locator('[data-action="add-batch-mappings"]').click();
  await page.locator('[data-batch-field="job"]').selectOption('QA');
  await page.locator('[data-batch-field="station"]').selectOption('Test');
  await page.locator('[data-action="add-batch-mappings"]').click();
  assert.equal(await page.locator('[data-configured-mapping]').count(), 2);
  assert.equal((await readConfig()).rows.filter((row) => row.active).length, 0);
  await saveSettings();
  config = await readConfig();
  let rows = config.rows.filter(
    (row) => row.active && row.line === 'DEMO-A' && row.model === model,
  );
  const pack = rows.find((row) => row.station === 'Pack'),
    test = rows.find((row) => row.station === 'Test');
  assert.ok(pack && test);
  assert.ok(pack.id !== 3 && test.id !== 4);
  assert.deepEqual((await readReport(historyDate)).records, historical);
  record(
    'Only explicit inline additions create stations for the chosen model; old mappings stay out of configuration and history remains intact',
  );
  await page.locator('[data-unit-output-source]').selectOption(String(test.id));
  await saveSettings();
  config = await readConfig();
  assert.equal(config.monitoring.unitOutputSources[JSON.stringify(['DEMO-A', model])], test.id);
  assert.equal(await page.locator('[data-unit-output-source] option[value="all"]').count(), 0);
  await screenshot('.mapping-panel', 'line-configuration');
  record(
    'Each unit chooses one enabled station as its output source in the same configuration panel',
  );
  const beforeOrder = await readConfig();
  const packRow = page.locator(`[data-configured-mapping="${pack.id}"]`);
  const testRow = page.locator(`[data-configured-mapping="${test.id}"]`);
  const targetBounds = await testRow.boundingBox();
  await packRow
    .locator('[data-mapping-drag]')
    .dragTo(testRow, { targetPosition: { x: 20, y: targetBounds.height - 5 } });
  const mappingOrder = () =>
    page
      .locator('[data-configured-mapping]')
      .evaluateAll((rows) => rows.map((row) => Number(row.dataset.configuredMapping)));
  assert.deepEqual(await mappingOrder(), [test.id, pack.id]);
  assert.deepEqual(
    (await readConfig()).rows,
    beforeOrder.rows,
    'Drag changes only the draft until saved',
  );
  assert.equal(await page.locator('[data-unit-output-source]').inputValue(), String(test.id));
  await saveSettings();
  config = await readConfig();
  for (const row of beforeOrder.rows)
    assert.deepEqual(
      config.rows.find((item) => item.id === row.id),
      row,
    );
  assert.deepEqual(
    config.rows
      .filter((row) => row.active && row.model === model && row.line === 'DEMO-A')
      .map((row) => row.id),
    [test.id, pack.id],
  );
  await page.reload();
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(model);
  assert.deepEqual(await mappingOrder(), [test.id, pack.id]);
  await page.locator('[data-view="entry"]').click();
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  assert.deepEqual(
    await page
      .locator('[data-entry-station-row]')
      .evaluateAll((rows) => rows.map((row) => Number(row.dataset.entryStationRow))),
    [test.id, pack.id],
  );
  await page.locator('[data-view="overview"]').click();
  await page.locator('#enter-fullscreen').click();
  await page
    .locator('[data-monitor-line]')
    .filter({ hasText: model.split('-')[0] })
    .filter({ hasText: 'DEMO-A' })
    .first()
    .click();
  assert.deepEqual(await page.locator('.line-modal-stations section h3').allTextContents(), [
    'Test QA',
    'Pack PD',
  ]);
  await page.locator('[data-close-line-dialog]').click();
  await page.locator('#exit-fullscreen').click();
  const orderedTemplate = await context.request.get(
    `${baseURL}/api/import/template?date=${reportDate}&shift=day`,
  );
  assert.equal(orderedTemplate.status(), 200);
  const templateRows = readSpreadsheet(
    'order.xlsx',
    (await orderedTemplate.body()).toString('base64'),
  ).map((row) => row.map((cell) => cell.value));
  assert.deepEqual(
    [
      ...new Set(
        templateRows
          .slice(1)
          .filter((row) => row[1] === 'DEMO-A' && row[10] === model)
          .map((row) => Number(row[0])),
      ),
    ],
    [test.id, pack.id],
  );
  const orderedExport = await context.request.get(
    `${baseURL}/api/export?date=${reportDate}&shift=day&lang=en`,
  );
  assert.equal(orderedExport.status(), 200);
  const exportedRows = readSpreadsheet(
    'order.csv',
    (await orderedExport.body()).toString('base64'),
  ).map((row) => row.map((cell) => cell.value));
  assert.deepEqual(
    [
      ...new Set(
        exportedRows
          .slice(1)
          .filter((row) => row[3] === 'DEMO-A' && row[17] === model)
          .map((row) => row[5]),
      ),
    ],
    ['Test', 'Pack'],
  );
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(model);
  await packRow.locator('[data-action="mapping-up"]').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await mappingOrder(), [pack.id, test.id]);
  await saveSettings();
  config = await readConfig();
  assert.deepEqual((await readReport(historyDate)).records, historical);
  record(
    'Actual drag, save and reload preserve station order in entry/details; keyboard move works without changing IDs, source, people or history',
  );
  await page.locator(`[data-configured-mapping="${test.id}"] [data-row-active]`).uncheck();
  await page.locator('[data-batch-field="job"]').selectOption('QA');
  await page.locator('[data-batch-field="station"]').selectOption('Test');
  assert.equal(await page.locator('[data-action="add-batch-mappings"]').isDisabled(), true);
  assert.match(await page.locator('.mapping-new-row').innerText(), /already exists above/);
  await saveSettings();
  await page.locator('[data-view="entry"]').click();
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  assert.equal(await page.locator('[data-entry-station-row]').count(), 1);
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(model);
  await page.locator(`[data-configured-mapping="${test.id}"] [data-row-active]`).check();
  await saveSettings();
  await page.locator('[data-unit-output-source]').selectOption(String(test.id));
  await saveSettings();
  record(
    'Enabled stations appear in entry; disabling and re-enabling works without changing model or mapping identity',
  );
  await page.locator('[data-mapping-model]').selectOption(otherModel);
  await page.locator('[data-batch-field="job"]').selectOption('PD');
  await page.locator('[data-batch-field="station"]').selectOption('Test');
  assert.match(await page.locator('.mapping-new-row .automatic-staff').innerText(), /Bea Day/);
  await page.locator('[data-action="add-batch-mappings"]').click();
  await saveSettings();
  config = await readConfig();
  assert.equal(config.rows.filter((row) => row.active && row.model === otherModel).length, 1);
  assert.equal(config.rows.filter((row) => row.active && row.model === model).length, 2);
  record(
    'Inline add-and-enable creates a station only in the selected line/model with that model’s people',
  );
  const otherStation = config.rows.find((row) => row.active && row.model === otherModel);
  const addDisposable = async () => {
    await page.locator('[data-batch-field="job"]').selectOption('QA');
    await page.locator('[data-batch-field="station"]').selectOption('Pack');
    await page.locator('[data-action="add-batch-mappings"]').click();
  };
  await addDisposable();
  const unsavedRow = page.locator('[data-configured-mapping^="new-"]');
  assert.equal(await unsavedRow.count(), 1);
  await unsavedRow.locator('[data-action="remove-mapping"]').click();
  assert.equal(await page.locator('[data-configured-mapping]').count(), 1);
  assert.equal(
    (await readConfig()).rows.filter((row) => row.active && row.model === otherModel).length,
    1,
  );
  await addDisposable();
  await saveSettings();
  config = await readConfig();
  const disposable = config.rows.find(
    (row) => row.active && row.model === otherModel && row.station === 'Pack',
  );
  await page.locator('[data-unit-output-source]').selectOption(String(disposable.id));
  await saveSettings();
  config = await readConfig();
  const deletionDate = '2026-11-12';
  const deletionDefault = (await readReport(deletionDate)).defaults[disposable.id];
  response = await context.request.put(baseURL + `/api/entry/records/${disposable.id}`, {
    data: {
      date: deletionDate,
      shift: 'day',
      version: 0,
      configVersion: config.version,
      stationEntry: true,
      slots: [
        {
          id: deletionDefault.slots[0].id,
          actual: 7,
          issue: 'Saved before deleting configuration',
        },
      ],
    },
  });
  assert.equal(response.status(), 200, await response.text());
  const deletionHistory = (await readReport(deletionDate)).records;
  await page
    .locator(`[data-configured-mapping="${disposable.id}"] [data-action="remove-mapping"]`)
    .click();
  assert.equal(await page.locator(`[data-configured-mapping="${disposable.id}"]`).count(), 0);
  assert.equal(
    await page.locator('[data-unit-output-source]').inputValue(),
    String(otherStation.id),
  );
  assert.equal(
    (await readConfig()).rows.find((row) => row.id === disposable.id).active,
    true,
    'Delete is a draft until saved',
  );
  await saveSettings();
  config = await readConfig();
  assert.equal(config.rows.find((row) => row.id === disposable.id).deleted, true);
  assert.equal(config.rows.find((row) => row.id === disposable.id).active, false);
  assert.equal(
    config.monitoring.unitOutputSources[JSON.stringify(['DEMO-A', otherModel])],
    otherStation.id,
  );
  await page.reload();
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(otherModel);
  assert.equal(await page.locator(`[data-configured-mapping="${disposable.id}"]`).count(), 0);
  assert.equal(await page.locator('[data-mapping-suggestion], [data-mapping-template]').count(), 0);
  assert.deepEqual((await readReport(deletionDate)).records, deletionHistory);
  record(
    'Delete removes saved and unsaved rows; saved deletion stays absent after reload, selects a valid source and preserves reports',
  );
  await addDisposable();
  await saveSettings();
  config = await readConfig();
  const replacement = config.rows.find(
    (row) => row.active && row.model === otherModel && row.station === 'Pack',
  );
  assert.notEqual(replacement.id, disposable.id);
  assert.ok(!(await readReport(reportDate)).records.some((row) => row.rowId === replacement.id));
  assert.deepEqual((await readReport(deletionDate)).records, deletionHistory);
  await page
    .locator(`[data-configured-mapping="${replacement.id}"] [data-action="remove-mapping"]`)
    .click();
  await saveSettings();
  assert.equal(await page.locator('[data-configured-mapping]').count(), 1);
  record(
    'Re-adding the same job/station after deletion creates a new identity without reviving counts or deleted rows',
  );
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-B');
  await page.locator('[data-batch-field="job"]').selectOption('PD');
  await page.locator('[data-batch-field="station"]').selectOption('Test');
  await page.locator('[data-action="add-batch-mappings"]').click();
  await saveSettings();
  const onlyStation = (await readConfig()).rows.find(
    (row) => row.line === 'DEMO-B' && row.model === model && row.active,
  );
  await page
    .locator(`[data-configured-mapping="${onlyStation.id}"] [data-action="remove-mapping"]`)
    .click();
  assert.equal(await page.locator('[data-configured-mapping]').count(), 0);
  assert.equal(await page.locator('[data-unit-output-source]').isDisabled(), true);
  assert.equal(await page.locator('.mapping-empty').isVisible(), true);
  await saveSettings();
  await page.reload();
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-B');
  assert.equal(await page.locator('[data-configured-mapping]').count(), 0);
  assert.equal(await page.locator('[data-unit-output-source]').isDisabled(), true);
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(otherModel);
  record(
    'Deleting the final station leaves a clear empty configuration and disabled source after save/reload',
  );
  await page.locator('[data-settings-tab="targets"]').click();
  await page.locator('[data-target-line]').selectOption('DEMO-A');
  await screenshot('#settings-body', 'daily-targets');
  await page.locator('[data-settings-tab="personnel"]').click();
  await page.locator('[data-person-job-filter]').selectOption('PD');
  await screenshot('#settings-body', 'people-by-job');
  await page.locator('[data-settings-tab="staffing"]').click();
  await page.locator('[data-staffing-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-staffing-model-filter]').selectOption(model);
  const day = page.locator('[data-staff-role="day"]');
  assert.equal(await day.locator('.staff-assigned-list li').count(), 3);
  assert.ok((await day.locator('[data-staff-job] option').allTextContents()).includes('Empty job'));
  await day.locator('[data-staff-job]').selectOption('Empty job');
  assert.match(await day.innerText(), /No people in this job yet/);
  await day.locator('[data-action="staff-manage-people"]').click();
  assert.equal(await page.locator('[data-person-job-filter]').inputValue(), 'Empty job');
  await page.locator('[data-settings-tab="staffing"]').click();
  await screenshot('.staff-line-panel', 'line-people');
  await screenshot('.settings-tabs', 'setup-order');
  await page.locator('[data-settings-tab="structure"]').click();
  await screenshot('.model-assignment-panel', 'models-and-lines');
  assert.equal(await page.locator('.issue-preset-settings').count(), 1);
  await screenshot('.issue-preset-settings', 'issue-quick-text');
  await page.locator('[data-issue-action="add"]').click();
  assert.equal(await page.locator('[data-save-settings]').first().isDisabled(), true);
  await page.locator('[data-issue-label]').last().fill('Safety stop');
  assert.equal(await page.locator('[data-save-settings]').first().isDisabled(), false);
  await saveSettings();
  await page.locator('[data-settings-tab="alerts"]').click();
  assert.equal(await page.locator('.issue-preset-settings').count(), 0);
  await page.locator('[data-settings-tab="structure"]').click();
  assert.ok(
    await page.locator('[data-issue-label]').evaluateAll((inputs) =>
      inputs.some((input) => input.value === 'Safety stop'),
    ),
  );
  record(
    'People-by-job linkage, same-job teams and the English issue list in Master data remain available',
  );
  await page.locator('[data-view="overview"]').click();
  await page.locator('[data-shift="day"]').click();
  await page.locator('#report-date').fill(reportDate);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-view="entry"]').click();
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  const station = (id) => page.locator(`[data-entry-station-row="${id}"]`);
  const field = (id, name, index = 0) =>
    station(id).locator(`[data-entry-field="${name}"]`).nth(index);
  const issueButton = (id, index = 0) => station(id).locator('[data-issue-cell]').nth(index);
  const issueEditor = page.locator('.entry-issue-dialog textarea');
  const editIssue = async (id, note, index = 0) => {
    await issueButton(id, index).click();
    await issueEditor.fill(note);
    await page.locator('.entry-issue-footer [data-entry-action="close-issue"]').click();
    await page.locator('.entry-issue-dialog').waitFor({ state: 'hidden' });
    await saved();
  };
  await page.waitForFunction(
    () => document.querySelectorAll('[data-entry-field="actual"]').length === 6,
  );
  assert.equal(await field(pack.id, 'target').inputValue(), '125');
  assert.equal(await field(test.id, 'target').inputValue(), '125');
  assert.equal(await field(pack.id, 'target', 2).inputValue(), '500');
  assert.equal(await station(pack.id).locator('th > strong').innerText(), 'Pack');
  assert.equal(await station(pack.id).locator('th > small').innerText(), 'PD');
  assert.equal(await station(pack.id).locator('.entry-station-totals').count(), 1);
  assert.doesNotMatch(await station(pack.id).innerText(), /Alex Day|Bea Day|Morgan Owner/);
  assert.equal(await page.locator('.entry-matrix textarea, .entry-matrix-people').count(), 0);
  const compactHeight = await station(pack.id).evaluate(
    (row) => row.getBoundingClientRect().height,
  );
  assert.ok(compactHeight <= 140, 'Compact station row height: ' + compactHeight);
  await issueButton(pack.id).click();
  assert.match(await page.locator('.entry-issue-context').innerText(), /PD \/ Pack/);
  assert.match(await page.locator('.entry-issue-context').innerText(), /Day shift.*08:00–08:20/);
  assert.ok((await page.locator('[data-issue-preset]').allTextContents()).includes('Safety stop'));
  await page.keyboard.press('Escape');
  assert.equal(
    (await readReport(reportDate)).records.length,
    0,
    'Opening an empty note does not write a report',
  );
  record(
    'Compact rows show only Job/Station identities with adjacent counts and one-line issue triggers; opening a note never creates data',
  );
  await field(pack.id, 'target').fill('130');
  await field(pack.id, 'actual').fill('11');
  await editIssue(pack.id, 'Pack note');
  await saved();
  let report = await readReport(reportDate);
  assert.deepEqual(
    report.records.map((row) => row.rowId),
    [pack.id],
  );
  assert.equal(report.records[0].slots[0].target, 130);
  assert.equal(report.records[0].slots[0].actual, 11);
  assert.equal(await field(test.id, 'actual').inputValue(), '');
  assert.equal(await field(test.id, 'target').inputValue(), '125');
  await field(test.id, 'target').fill('140');
  await field(test.id, 'actual').fill('7');
  await editIssue(test.id, 'Test note');
  await saved();
  report = await readReport(reportDate);
  assert.equal(report.records.find((row) => row.rowId === pack.id).slots[0].actual, 11);
  assert.equal(report.records.find((row) => row.rowId === test.id).slots[0].actual, 7);
  assert.match(await station(pack.id).locator('[data-entry-day-field="target"]').innerText(), /1,?005/);
  assert.match(await station(test.id).locator('[data-entry-day-field="target"]').innerText(), /1,?015/);
  assert.equal(
    (await readConfig()).productionUnits.find(
      (unit) => unit.line === 'DEMO-A' && unit.model === model,
    ).dailyTarget,
    1000,
  );
  record(
    'Station edits and daily totals stay independent and never change another station or daily preset',
  );
  await issueButton(pack.id).click();
  await issueEditor.fill('Equipment stopped');
  await issueEditor.evaluate((input) => input.setSelectionRange(7, 7));
  await page.evaluate(() => document.querySelector('#refresh-now').onclick());
  assert.equal(await issueEditor.inputValue(), 'Equipment stopped');
  assert.equal(await issueEditor.evaluate((input) => input.selectionStart), 7);
  assert.equal(await issueEditor.evaluate((input) => input === document.activeElement), true);
  await issueEditor.press('End');
  await issueEditor.press('Enter');
  await issueEditor.pressSequentially('Waiting for repair');
  await screenshot('.entry-issue-dialog', 'issue-editor');
  await issueEditor.press('Control+Enter');
  await page.locator('.entry-issue-dialog').waitFor({ state: 'hidden' });
  await saved();
  report = await readReport(reportDate);
  assert.equal(
    report.records.find((row) => row.rowId === pack.id).slots[0].issue,
    'Equipment stopped\nWaiting for repair',
  );
  assert.equal(report.records.find((row) => row.rowId === test.id).slots[0].issue, 'Test note');
  assert.match(await issueButton(pack.id).innerText(), /Waiting for repair/);
  assert.equal(
    await station(pack.id).evaluate((row) => row.getBoundingClientRect().height),
    compactHeight,
  );
  await issueButton(pack.id).click();
  assert.equal(await issueEditor.inputValue(), 'Equipment stopped\nWaiting for repair');
  await page.locator('[data-entry-action="clear-issue"]').click();
  await page.locator('[data-issue-preset="material"]').click();
  assert.equal(await issueEditor.inputValue(), 'Material shortage: ');
  await page.mouse.click(5, 5);
  await page.locator('.entry-issue-dialog').waitFor({ state: 'hidden' });
  await saved();
  assert.equal(
    (await readReport(reportDate)).records.find((row) => row.rowId === pack.id).slots[0].issue,
    'Material shortage:',
  );
  await issueButton(pack.id).click();
  await issueEditor.fill('x'.repeat(2000));
  await page.locator('[data-issue-preset="equipment"]').click();
  assert.equal((await issueEditor.inputValue()).length, 2000);
  assert.match(await page.locator('[data-issue-count]').innerText(), /2,000/);
  await page.locator('[data-entry-action="clear-issue"]').click();
  await page.keyboard.press('Escape');
  await saved();
  assert.equal(
    (await readReport(reportDate)).records.find((row) => row.rowId === pack.id).slots[0].issue,
    '',
  );
  assert.match(await issueButton(pack.id).innerText(), /Add issue/);
  await editIssue(pack.id, 'Pack note');
  await editIssue(pack.id, 'Night station note', 2);
  const nightEntry = (await readReport(reportDate, 'night')).records.find(
    (row) => row.rowId === pack.id,
  );
  assert.equal(nightEntry.slots[0].issue, 'Night station note');
  assert.equal(
    (await readReport(reportDate)).records.find((row) => row.rowId === pack.id).slots[0].issue,
    'Pack note',
  );
  await field(pack.id, 'actual').focus();
  await page.keyboard.press('F2');
  assert.equal(await issueEditor.inputValue(), 'Pack note');
  await page.keyboard.press('Control+Enter');
  assert.equal(
    await field(pack.id, 'actual').evaluate((input) => input === document.activeElement),
    true,
  );
  record(
    'Issue editor supports multiline text, quick reasons, clearing, limits, Esc/outside/Ctrl+Enter saving and correct day/night isolation without growing rows',
  );
  let failNoteOnce = true;
  const noteRoute = '**/api/entry/records/' + test.id;
  await page.route(noteRoute, (route) => {
    if (failNoteOnce) {
      failNoteOnce = false;
      return route.abort('failed');
    }
    return route.continue();
  });
  await issueButton(test.id).click();
  await issueEditor.fill('Retain this note if the network fails');
  await page.locator('.entry-issue-footer [data-entry-action="close-issue"]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-entry-overall]').textContent.includes('Save failed'),
  );
  assert.match(await issueButton(test.id).innerText(), /Retain this note/);
  await station(test.id).locator('[data-entry-action="retry"]').first().click();
  await saved();
  assert.equal(
    (await readReport(reportDate)).records.find((row) => row.rowId === test.id).slots[0].issue,
    'Retain this note if the network fails',
  );
  await page.unroute(noteRoute);
  await editIssue(test.id, 'Test note');
  record(
    'Issue text and cursor survive background refresh; failed autosaves retain notes with a visible working retry',
  );
  await field(pack.id, 'actual').focus();
  await field(pack.id, 'actual').evaluate((input) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '121\t122\n21\t22\n131\t132\n31\t32');
    input.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  });
  await field(pack.id, 'actual').blur();
  await page.locator('[data-entry-action="save-all"]').click();
  await saved();
  report = await readReport(reportDate);
  assert.deepEqual(
    report.records.find((row) => row.rowId === pack.id).slots.map((slot) => slot.target),
    [121, 122],
  );
  assert.deepEqual(
    report.records.find((row) => row.rowId === pack.id).slots.map((slot) => slot.actual),
    [21, 22],
  );
  assert.deepEqual(
    report.records.find((row) => row.rowId === test.id).slots.map((slot) => slot.target),
    [131, 132],
  );
  assert.deepEqual(
    report.records.find((row) => row.rowId === test.id).slots.map((slot) => slot.actual),
    [31, 32],
  );
  await field(pack.id, 'actual').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.rowKey.split('|').at(-1)),
    String(test.id),
  );
  record(
    'Main-grid paired paste maps odd rows to Target and even rows to Actual across stations; keyboard navigation remains independent',
  );
  for (const [mode, count] of [
    ['sheet', 2],
    ['shift', 4],
    ['day', 6],
  ]) {
    await page.locator('[data-entry-mode]').selectOption(mode);
    assert.equal(await page.locator('[data-entry-field="actual"]').count(), count);
    assert.equal(await page.locator('[data-entry-field="target"]').count(), count);
    assert.equal(await page.locator('[data-issue-cell]').count(), count);
  }
  await page.locator('[data-entry-select-shift="night"]').click();
  assert.equal(await page.locator('[data-entry-mode]').inputValue(), 'shift');
  assert.ok(
    await page.locator('[data-entry-select-shift="night"]').evaluate((button) =>
      button.classList.contains('selected'),
    ),
  );
  assert.ok(
    await page.locator('[data-entry-field="actual"]').evaluateAll((inputs) =>
      inputs.every((input) => input.dataset.rowKey.includes('|night|')),
    ),
  );
  await page.locator('[data-entry-select-shift="day"]').click();
  assert.ok(
    await page.locator('[data-entry-field="actual"]').evaluateAll((inputs) =>
      inputs.every((input) => input.dataset.rowKey.includes('|day|')),
    ),
  );
  await page.evaluate(() => {
    window.__bpNativeDate = Date;
    const NativeDate = Date;
    const fixed = '2026-11-10T01:10:00.000Z';
    window.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed]));
      }
      static now() {
        return new NativeDate(fixed).valueOf();
      }
    };
  });
  await page.locator('[data-entry-action="current-slot"]').click();
  assert.equal(await page.locator('[data-entry-mode]').inputValue(), 'sheet');
  assert.match(
    await page.locator('[data-entry-shift-slot].selected').innerText(),
    /Day shift.*08:00–08:20/,
  );
  assert.equal(await page.locator('[data-entry-field="actual"]').count(), 2);
  await page.evaluate(() => {
    window.Date = window.__bpNativeDate;
    delete window.__bpNativeDate;
  });
  await page.locator('[data-entry-mode]').selectOption('day');
  record('Day, night and current-interval controls switch to the requested production scope');
  await page.locator('[data-entry-model-filter]').selectOption(otherModel);
  assert.equal(await page.locator('[data-entry-station-row]').count(), 1);
  assert.equal(await page.locator('[data-entry-field="actual"]').first().inputValue(), '');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  record(
    'Whole-day, shift and interval modes retain station fields; different models never share actuals',
  );
  let remote = (await readReport(reportDate)).records.find((row) => row.rowId === pack.id);
  response = await context.request.put(baseURL + '/api/entry/records/' + pack.id, {
    data: {
      date: reportDate,
      shift: 'day',
      version: remote.version,
      configVersion: (await readConfig()).version,
      stationEntry: true,
      slots: [{ id: remote.slots[0].id, actual: 99, issue: 'Remote note' }],
    },
  });
  assert.equal(response.status(), 200);
  await field(pack.id, 'actual').fill('88');
  await field(pack.id, 'actual').blur();
  await page.locator('[data-entry-action="review"]').first().waitFor({ state: 'visible' });
  await page.locator('[data-entry-action="review"]').first().click();
  assert.doesNotMatch(await page.locator('.entry-conflict-review').innerText(), /Test note/);
  await page.locator('[data-entry-action="save-mine"]').click();
  await saved();
  report = await readReport(reportDate);
  remote = report.records.find((row) => row.rowId === pack.id);
  assert.equal(remote.slots[0].actual, 88);
  assert.equal(remote.slots[0].issue, 'Remote note');
  assert.equal(report.records.find((row) => row.rowId === test.id).slots[0].actual, 31);
  record(
    'Station version conflicts require review, merge only changed cells and preserve other stations',
  );
  const workbook = writeSpreadsheet([
    ['Row ID', 'Time slot', 'Actual', 'Target', 'Issue', 'Date', 'Shift'],
    [pack.id, '08:00-08:20', 55, 155, 'Excel Pack', reportDate, 'day'],
    [test.id, '08:00-08:20', 44, 144, 'Excel Test', reportDate, 'day'],
  ]);
  await page.locator('.entry-import-scope > summary').click();
  await page.locator('[data-entry-action="open-import"][data-import-shift="day"]').click();
  await page.locator('[data-entry-file]').setInputFiles({
    name: 'stations.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook,
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-entry-action="apply-import"]').disabled,
  );
  assert.equal(await page.locator('.entry-import-preview section').count(), 2);
  await screenshot('.entry-import-dialog', 'excel-preview');
  await page.locator('[data-entry-action="apply-import"]').click();
  await page.locator('.entry-import-result .entry-success').waitFor();
  await page.locator('[data-entry-action="close-import"]').click();
  report = await readReport(reportDate);
  assert.equal(report.records.find((row) => row.rowId === pack.id).slots[0].target, 155);
  assert.equal(report.records.find((row) => row.rowId === test.id).slots[0].target, 144);
  assert.equal(report.records.find((row) => row.rowId === pack.id).slots[0].actual, 55);
  assert.equal(report.records.find((row) => row.rowId === test.id).slots[0].actual, 44);
  await screenshot('.entry-unified', 'production-entry');
  await screenshot('.entry-station-values', 'production-cell');
  record('Real XLSX preview and import preserve different station targets, actuals and issues');
  await page.locator('[data-view="overview"]').click();
  const card = page
    .locator('[data-monitor-line]')
    .filter({ hasText: model.split('-')[0] })
    .filter({ hasText: 'DEMO-A' })
    .first();
  if (!(await card.count()))
    console.log(
      JSON.stringify({
        monitorCards: await page.locator('[data-monitor-line]').allTextContents(),
        errors,
      }),
    );
  assert.match(await card.locator('.line-source').innerText(), /Test/);
  assert.equal(
    (await card.locator('.line-card-values > span').nth(1).locator('b').innerText()).replaceAll(
      ',',
      '',
    ),
    '76',
  );
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(model);
  await page.locator('[data-unit-output-source]').selectOption(String(pack.id));
  await saveSettings();
  await page.locator('[data-view="overview"]').click();
  assert.match(await card.locator('.line-source').innerText(), /Pack/);
  assert.equal(
    (await card.locator('.line-card-values > span').nth(1).locator('b').innerText()).replaceAll(
      ',',
      '',
    ),
    '77',
  );
  record(
    'Dashboard output and target use only the chosen station; changing the source takes effect on existing entries',
  );
  await page.locator('#enter-fullscreen').click();
  await page.locator('.board-display-options summary').click();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [trend, share] of [
      [true, false],
      [false, true],
      [true, true],
      [false, false],
    ]) {
      await page.locator('#board-show-trend').setChecked(trend);
      await page.locator('#board-show-share').setChecked(share);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
        false,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.board-display-options summary').click();
  await card.click();
  assert.equal(await page.locator('.line-modal-stations section').count(), 2);
  assert.match(await page.locator('.line-modal-body').innerText(), /Excel Pack/);
  assert.match(await page.locator('.line-modal-body').innerText(), /Alex Day/);
  await screenshot('#line-detail-dialog', 'line-details');
  await page.locator('[data-close-line-dialog]').click();
  await page.locator('#exit-fullscreen').click();
  record('Fullscreen chart modes and station detail dialogs fit desktop, tablet and phone');
  await page.locator('[data-view="settings"]').click();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const step of ['structure', 'targets', 'staffing', 'workforce', 'groups']) {
      await page.locator(`[data-settings-tab="${step}"]`).click();
      if (step === 'workforce') {
        const broken = await page.locator('.mapping-delete-button').evaluateAll(
          (buttons) =>
            buttons.filter((button) => {
              const bounds = button.getBoundingClientRect();
              const cell = button.closest('td').getBoundingClientRect();
              const text = [...button.childNodes].find(
                (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
              );
              const range = document.createRange();
              range.selectNode(text);
              return range.getClientRects().length !== 1 || bounds.right > cell.right + 1;
            }).length,
        );
        assert.equal(broken, 0, 'Delete action must fit without splitting its label at ' + width);
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
        false,
        step + ' overflow at ' + width,
      );
    }
  }
  await page.locator('[data-view="entry"]').click();
  for (const language of ['en', 'zh', 'th']) {
    await page.locator('#language-select').selectOption(language);
    assert.deepEqual(await page.locator('#language-select option').allTextContents(), [
      'Chinese',
      'English',
      'Thai',
    ]);
    assert.equal(await page.locator('[data-entry-station]').count(), 0);
    assert.doesNotMatch(await page.locator('.entry-grid-help').innerText(), /undefined/);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
      false,
    );
  }
  await page.locator('#language-select').selectOption('en');
  await page.setViewportSize({ width: 1440, height: 1000 });
  record(
    'All settings, station entry and three languages remain responsive with readable long-model labels',
  );
  for (const language of ['en', 'zh', 'th']) {
    await page.locator('#language-select').selectOption(language);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 760 });
      await issueButton(pack.id).click();
      const bounds = await page.locator('.entry-issue-dialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 761);
      assert.doesNotMatch(await page.locator('.entry-issue-dialog').innerText(), /undefined/);
      await page.keyboard.press('Escape');
    }
  }
  await page.locator('#language-select').selectOption('en');
  await page.setViewportSize({ width: 1440, height: 1000 });
  record(
    'Issue dialog, actions and note previews fit phone/tablet/desktop in all three languages; personnel remain in production details',
  );
  const batchDate = '2026-11-14';
  await page.locator('#report-date').fill(batchDate);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-entry-field="actual"]').length === 6,
  );
  await field(pack.id, 'target').fill('10');
  await field(pack.id, 'actual').fill('11');
  await editIssue(pack.id, 'Keep Pack issue');
  await field(test.id, 'target').fill('20');
  await field(test.id, 'actual').fill('22');
  await editIssue(test.id, 'Keep Test issue');
  const bulkOpen = async () => {
    await page.locator('[data-entry-action="bulk-open"]').first().click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-bulk-row]').length === 2 &&
        !document.querySelector('[data-entry-action="bulk-refresh"]').disabled,
    );
  };
  const bulkApply = async () => {
    await page.locator('[data-entry-action="bulk-save"]').click();
    await page.waitForFunction(() => document.querySelector('[data-bulk-status]').textContent === 'Saved');
    assert.equal(await page.locator('.entry-bulk-dialog').isVisible(), true);
    await page.locator('[data-entry-action="bulk-close"]').click();
    await page.locator('.entry-bulk-dialog').waitFor({ state: 'hidden' });
    await saved();
  };
  await bulkOpen();
  assert.equal(await page.locator('[data-bulk-line]').inputValue(), 'DEMO-A');
  assert.equal(await page.locator('[data-bulk-model]').inputValue(), model);
  assert.equal(await page.locator('[data-bulk-row]').count(), 2);
  assert.equal(await page.locator('[data-bulk-apply-field="target"]').isDisabled(), true);
  await page.locator('[data-bulk-field="target"]').fill('33');
  await page.locator('[data-bulk-field="actual"]').fill('44');
  await screenshot('.entry-bulk-dialog', 'interval-batch');
  await bulkApply();
  let batchReport = await readReport(batchDate);
  assert.deepEqual(
    batchReport.records.map((row) => row.rowId).sort((a, b) => a - b),
    [pack.id, test.id].sort((a, b) => a - b),
  );
  for (const id of [pack.id, test.id]) {
    assert.equal(await field(id, 'target').inputValue(), '33');
    assert.equal(await field(id, 'actual').inputValue(), '44');
  }
  assert.equal(
    batchReport.records.find((row) => row.rowId === pack.id).slots[0].issue,
    'Keep Pack issue',
  );
  assert.equal(
    batchReport.records.find((row) => row.rowId === test.id).slots[0].issue,
    'Keep Test issue',
  );
  assert.equal(
    (await readConfig()).productionUnits.find(
      (unit) => unit.line === 'DEMO-A' && unit.model === model,
    ).dailyTarget,
    1000,
  );
  assert.equal((await readReport(batchDate, 'night')).records.length, 0);
  record(
    'Interval fill replaces different individual Target/Actual values together for the exact line/model, preserving issues, other shifts and presets',
  );
  await field(pack.id, 'target').fill('66');
  await field(pack.id, 'actual').fill('77');
  await field(pack.id, 'actual').blur();
  await saved();
  assert.equal(await field(test.id, 'actual').inputValue(), '44');
  await bulkOpen();
  await page.locator('[data-bulk-field="actual"]').fill('0');
  await bulkApply();
  assert.equal(await field(pack.id, 'target').inputValue(), '66');
  assert.equal(await field(test.id, 'target').inputValue(), '33');
  assert.equal(await field(pack.id, 'actual').inputValue(), '0');
  assert.equal(await field(test.id, 'actual').inputValue(), '0');
  await bulkOpen();
  await page.locator('[data-bulk-field="target"]').fill('99');
  await bulkApply();
  assert.equal(await field(pack.id, 'target').inputValue(), '99');
  assert.equal(await field(test.id, 'target').inputValue(), '99');
  assert.equal(await field(pack.id, 'actual').inputValue(), '0');
  record(
    'Individual edits after interval fill remain independent; target-only, actual-only and explicit zero work without sticky synchronization',
  );
  await bulkOpen();
  await page.locator('[data-bulk-field="target"]').fill('-1');
  assert.equal(await page.locator('[data-bulk-apply-field="target"]').isDisabled(), true);
  await page.locator('[data-bulk-field="target"]').fill('500');
  await page.locator('[data-bulk-field="actual"]').fill('500');
  batchReport = await readReport(batchDate);
  const batchConfig = await readConfig();
  const remoteBatch = batchReport.records.find((row) => row.rowId === test.id);
  response = await context.request.put(baseURL + `/api/entry/records/${test.id}`, {
    data: {
      date: batchDate,
      shift: 'day',
      stationEntry: true,
      configVersion: batchConfig.version,
      version: remoteBatch.version,
      slots: [{ id: remoteBatch.slots[0].id, actual: 909, issue: 'Concurrent issue' }],
    },
  });
  assert.equal(response.status(), 200);
  const afterRemote = (await readReport(batchDate)).records;
  await page.locator('[data-entry-action="bulk-save"]').click();
  await page.locator('[data-bulk-error]').filter({ hasText: 'Nothing was changed' }).waitFor();
  assert.deepEqual((await readReport(batchDate)).records, afterRemote);
  assert.equal(await page.locator('[data-bulk-cell="actual"]').first().inputValue(), '500');
  await page.locator('[data-entry-action="bulk-refresh"]').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-entry-action="bulk-save"]').disabled,
  );
  await bulkApply();
  batchReport = await readReport(batchDate);
  assert.ok(
    batchReport.records.every(
      (record) => record.slots[0].target === 500 && record.slots[0].actual === 500,
    ),
  );
  assert.equal(
    batchReport.records.find((record) => record.rowId === test.id).slots[0].issue,
    'Concurrent issue',
  );
  record(
    'A concurrent station edit rejects the whole interval fill; refresh keeps typed values and permits an explicit overwrite without losing issue text',
  );
  for (const language of ['en', 'zh', 'th']) {
    await page.locator('#language-select').selectOption(language);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 760 });
      await bulkOpen();
      const bounds = await page.locator('.entry-bulk-dialog').boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.x + bounds.width <= width + 1 &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= 761,
      );
      assert.doesNotMatch(await page.locator('.entry-bulk-dialog').innerText(), /undefined/);
      await page.keyboard.press('Escape');
    }
  }
  await page.locator('#language-select').selectOption('en');
  await page.setViewportSize({ width: 1440, height: 1000 });
  record('Interval-fill controls and preview fit all three languages and four viewport widths');
  // Switching the modal destination must never reuse another unit's revisions.
  const mainBeforeSwitch = (await readReport(batchDate)).records.filter(
    (row) => row.rowSnapshot.model === model,
  );
  await bulkOpen();
  await page.locator('[data-bulk-model]').selectOption(otherModel);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-bulk-row]').length === 1 &&
      !document.querySelector('[data-entry-action="bulk-refresh"]').disabled,
  );
  await page.locator('[data-bulk-field="target"]').fill('70');
  await page.locator('[data-bulk-field="actual"]').fill('80');
  await bulkApply();
  assert.equal(await page.locator('[data-entry-model-filter]').inputValue(), otherModel);
  assert.equal(await page.locator('[data-entry-line]').inputValue(), 'DEMO-A');
  let switched = await readReport(batchDate);
  assert.deepEqual(
    switched.records.filter((row) => row.rowSnapshot.model === model),
    mainBeforeSwitch,
  );
  assert.equal(
    switched.records.find((row) => row.rowSnapshot.model === otherModel).slots[0].actual,
    80,
  );
  await page.locator('[data-bulk-global]').click();
  await page.locator('[data-bulk-line]').selectOption('DEMO-B');
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-entry-action="bulk-refresh"]').disabled &&
      document.querySelector('[data-bulk-error]').textContent.length > 0,
  );
  assert.equal(await page.locator('[data-bulk-apply-field="target"]').isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-entry-line]').inputValue(), 'DEMO-B');
  await page.locator('[data-bulk-global]').click();
  await page.locator('[data-bulk-line]').selectOption('DEMO-A');
  await page.locator('[data-bulk-model]').selectOption(model);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-bulk-row]').length === 2 &&
      !document.querySelector('[data-entry-action="bulk-refresh"]').disabled,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-entry-model-filter]').inputValue(), model);
  record(
    'Batch Line/Model switching preserves drafts, validates the destination and returns entry to the chosen unit, including cancel',
  );

  await bulkOpen();
  await page.locator('[data-bulk-date]').fill('2026-11-15');
  await page.locator('[data-bulk-date]').dispatchEvent('change');
  await page.waitForFunction(() => !document.querySelector('[data-entry-action="bulk-save"]').disabled);
  await page.locator('[data-bulk-field="target"]').fill('41');
  await page.locator('[data-bulk-apply-field="target"]').click();
  assert.equal(await page.locator('.entry-bulk-dialog').isVisible(), true);
  await page.locator('[data-entry-action="bulk-issue-preset"]').first().click();
  await page.locator('[data-bulk-apply-field="issue"]').click();
  const firstBulkActual = page.locator('[data-bulk-cell="actual"]').first();
  await firstBulkActual.evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '51\n61\n52\n62');
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
  });
  assert.deepEqual(await page.locator('[data-bulk-cell="target"]').evaluateAll((inputs) => inputs.map((input) => input.value)), ['51', '52']);
  assert.deepEqual(await page.locator('[data-bulk-cell="actual"]').evaluateAll((inputs) => inputs.map((input) => input.value)), ['61', '62']);
  await page.locator('[data-bulk-cell="issue"]').last().fill('Individual issue');
  // Click the backdrop: save before closing and navigate to the edited date.
  await page.mouse.click(2, 2);
  await page.locator('.entry-bulk-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#report-date').value === '2026-11-15');
  const dated = (await readReport('2026-11-15')).records;
  assert.deepEqual(dated.map((row) => [row.slots[0].target, row.slots[0].actual]).sort(), [[51, 61], [52, 62]]);
  assert.ok(dated.some((row) => row.slots[0].issue === 'Individual issue'));
  assert.ok(dated.some((row) => row.slots[0].issue === 'Equipment downtime'));
  await page.locator('#report-date').fill(batchDate);
  await page.locator('#report-date').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelectorAll('[data-entry-field="actual"]').length === 6);
  record('Batch applies stay open; paired paste, quick text, individual issues, editable dates and backdrop autosave persist exact station values');

  const retainedTest = (await readReport(batchDate)).records.find((row) => row.rowId === test.id);
  await page.locator('[data-view="settings"]').click();
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('DEMO-A');
  await page.locator('[data-mapping-model]').selectOption(model);
  await page.locator(`[data-configured-mapping="${test.id}"] [data-row-output]`).uncheck();
  assert.equal(await page.locator('[data-unit-output-source]').inputValue(), String(pack.id));
  const jobBounds = await page
    .locator(`[data-configured-mapping="${pack.id}"] [data-row-field="job"]`)
    .boundingBox();
  const stationBounds = await page
    .locator(`[data-configured-mapping="${pack.id}"] [data-row-field="station"]`)
    .boundingBox();
  assert.ok(Math.abs(jobBounds.y - stationBounds.y) < 1, 'Job and Station controls align');
  assert.ok(
    await page
      .locator(`[data-configured-mapping="${pack.id}"] td`)
      .first()
      .locator('[data-mapping-drag]')
      .count(),
  );
  await saveSettings();
  await screenshot('[data-mapping-unit]', 'line-configuration');
  await page.locator('[data-view="entry"]').click();
  const noOutputRow = page.locator(`[data-entry-station-row="${test.id}"]`);
  assert.equal(await noOutputRow.locator('[data-entry-field], [data-issue-cell]').count(), 0);
  assert.equal(await noOutputRow.getAttribute('data-entry-no-output'), '');
  await noOutputRow.locator('summary').click();
  assert.match(await noOutputRow.innerText(), /Concurrent issue/);
  for (const mode of ['shift', 'sheet', 'day']) {
    await page.locator('[data-entry-mode]').selectOption(mode);
    assert.equal(await noOutputRow.locator('input, textarea').count(), 0);
  }
  await screenshot('.entry-unified', 'no-output-station');
  await page.locator('[data-bulk-global]').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[data-bulk-row]').length === 1 &&
      !document.querySelector('[data-entry-action="bulk-refresh"]').disabled,
  );
  assert.equal(await page.locator('[data-bulk-row]').count(), 1);
  await page.locator('[data-bulk-field="target"]').fill('123');
  await page.locator('[data-bulk-field="actual"]').fill('234');
  await bulkApply();
  assert.deepEqual(
    (await readReport(batchDate)).records.find((row) => row.rowId === test.id),
    retainedTest,
  );
  assert.equal(
    (await readReport(batchDate)).records.find((row) => row.rowId === pack.id).slots[0].actual,
    234,
  );
  record(
    'No-output stations stay ordered and visible without writable fields in all modes; history survives and batch skips them',
  );

  // Reproduce the exact vertical paste reported by users: six clipboard rows,
  // three output stations and one interval. No value may spill into slot 2.
  const beforeSixRowConfig = await readConfig();
  const sixRowDraft = structuredClone(beforeSixRowConfig);
  for (const row of sixRowDraft.rows)
    if (row.id === test.id || row.id === pack.id) row.hasOutput = true;
  sixRowDraft.rows.push({
    id: 'new-browser-six-row-paste',
    line: 'DEMO-A',
    model,
    job: 'PD',
    station: 'Test',
    active: true,
    hasOutput: true,
  });
  response = await context.request.put(baseURL + '/api/config', { data: sixRowDraft });
  assert.equal(response.status(), 200, await response.text());
  const sixRowConfig = await response.json();
  const thirdPasteRow = sixRowConfig.rows.find(
    (row) =>
      row.active &&
      row.line === 'DEMO-A' &&
      row.model === model &&
      row.job === 'PD' &&
      row.station === 'Test',
  );
  assert.ok(thirdPasteRow);
  const sixRowDate = '2026-11-16';
  await page.goto(baseURL + '/entry');
  await page.locator('[data-entry-line]').selectOption('DEMO-A');
  await page.locator('[data-entry-model-filter]').selectOption(model);
  await page.locator('#report-date').fill(sixRowDate);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-entry-mode]').selectOption('shift');
  await page.locator('[data-entry-select-shift="day"]').click();
  await page.locator('[data-entry-mode]').selectOption('sheet');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-entry-field="actual"]').length === 3,
  );
  const sixRowOrder = await page
    .locator('[data-entry-station-row]:not([data-entry-no-output])')
    .evaluateAll((rows) => rows.map((row) => Number(row.dataset.entryStationRow)));
  assert.equal(sixRowOrder.length, 3);
  await page.locator('[data-entry-field="actual"]').first().evaluate((input) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '301\n31\n302\n32\n303\n33');
    input.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  });
  await page.locator('[data-entry-action="save-all"]').click();
  await saved();
  const sixRowReport = await readReport(sixRowDate);
  for (const [index, rowId] of sixRowOrder.entries()) {
    const row = sixRowReport.records.find((record) => record.rowId === rowId);
    assert.equal(row.slots[0].target, 301 + index);
    assert.equal(row.slots[0].actual, 31 + index);
    assert.notEqual(row.slots[1]?.target, 301 + index);
    assert.notEqual(row.slots[1]?.actual, 31 + index);
  }
  await screenshot('.entry-unified', 'production-entry-paste');
  record(
    'Six vertical clipboard rows fill three station Target/Actual pairs in one interval without spilling into the next interval',
  );
  response = await context.request.put(baseURL + '/api/config', {
    data: { ...beforeSixRowConfig, version: sixRowConfig.version },
  });
  assert.equal(response.status(), 200, await response.text());

  // Real page URLs work after refresh and with Back/Forward; cancelling a dirty
  // draft navigation restores both the original address and the draft.
  assert.equal(new URL(page.url()).pathname, '/entry');
  await page.locator('[data-view="help"]').click();
  assert.equal(new URL(page.url()).pathname, '/guide');
  await page.goBack();
  await page.locator('#entry-content').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/entry');
  await page.goForward();
  await page.locator('#help-content').waitFor({ state: 'visible' });
  await page.goto(baseURL + '/settings/line-configuration');
  await page.locator('[data-settings-tab="workforce"].selected').waitFor();
  await page.reload();
  await page.locator('[data-settings-tab="workforce"].selected').waitFor();
  await page.locator('[data-settings-tab="structure"]').click();
  await page.locator('#new-lines').fill('UNSAVED-LINE');
  await page.locator('[data-action="add-catalog"][data-catalog="lines"]').click();
  await page.goBack();
  // Settings steps share their draft, so moving back within settings is allowed.
  await page.locator('[data-settings-tab="workforce"].selected').waitFor();
  await page.locator('[data-view="entry"]').click();
  await page.locator('#confirm-no').click();
  assert.equal(new URL(page.url()).pathname, '/settings/line-configuration');
  await page.locator('[data-settings-tab="structure"]').click();
  assert.match(await page.locator('#settings-body').innerText(), /UNSAVED-LINE/);
  await page.locator('[data-view="entry"]').click();
  await page.locator('#confirm-yes').click();
  await page.locator('#entry-content').waitFor({ state: 'visible' });
  await page.goto(baseURL + '/entry');
  await page.locator('[data-bulk-global]').waitFor();
  await page.locator('[data-view="settings"]').click();
  await page.locator('#new-lines').fill('BACK-DRAFT');
  await page.locator('[data-action="add-catalog"][data-catalog="lines"]').click();
  await page.goBack();
  await page.locator('#confirm-no').click();
  await page.waitForURL(baseURL + '/settings/master-data');
  assert.match(await page.locator('#settings-body').innerText(), /BACK-DRAFT/);
  await page.locator('[data-view="entry"]').click();
  await page.locator('#confirm-yes').click();
  await page.locator('#entry-content').waitFor({ state: 'visible' });
  record(
    'Independent page URLs support direct loading, refresh, Back/Forward and shared settings drafts with guarded navigation',
  );
  await page.locator('[data-view="help"]').click();
  assert.match(await page.locator('#help-content').innerText(), /station/i);
  assert.equal(await page.locator('#help-content .help-topic').count(), 7);
  for (const path of await page
    .locator('#help-content img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')))) {
    const result = await context.request.get(baseURL + path);
    assert.equal(result.status(), 200, 'Guide image: ' + path);
  }
  const memberContext = await browser.newContext({ viewport: { width: 1024, height: 1000 } });
  await memberContext.request.post(baseURL + '/api/auth/login', {
    data: { username: 'member', password: 'member' },
  });
  const member = await memberContext.newPage();
  await member.goto(baseURL + '/settings/line-configuration');
  await member.locator('[data-view="overview"].active').waitFor();
  await member.waitForURL(baseURL + '/overview');
  assert.equal(new URL(member.url()).pathname, '/overview');
  await member.locator('[data-view="help"]').click();
  assert.equal(await member.locator('#help-content .help-topic').count(), 5);
  assert.equal(
    await member.locator('#help-content img[src="/guide-images/setup-order.png"]').count(),
    0,
  );
  assert.equal(
    await member.locator('#help-content img[src="/guide-images/interval-batch.png"]').count(),
    1,
  );
  assert.equal(
    (
      await memberContext.request.put(baseURL + '/api/config', { data: await readConfig() })
    ).status(),
    403,
  );
  await member.locator('[data-view="entry"]').click();
  await member.locator('[data-entry-line]').selectOption('DEMO-B');
  assert.equal(await member.locator('[data-entry-action="configure-unit"]').count(), 0);
  assert.match(await member.locator('[data-entry-setup-unit]').innerText(), /Ask a manager/);
  await memberContext.close();
  record(
    'Account-specific help and permissions explain missing setup; members cannot modify shared configuration',
  );
  assert.deepEqual((await readReport(historyDate)).records, historical);
  record(
    'All new configuration, source and station reporting operations preserve the saved historical report',
  );

  assert.deepEqual(errors, []);
  record('No uncaught browser errors');
  console.log(
    `${checks.length} browser workflow checks passed. Temporary database: isolated and removed on exit.`,
  );
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    const closed = once(child, 'exit');
    child.kill();
    await closed;
  }
  const resolvedFolder = path.resolve(folder);
  if (
    !resolvedFolder.startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(resolvedFolder).startsWith('bp9-browser-')
  )
    throw new Error('Refusing to remove a directory outside the browser test area');
  await rm(resolvedFolder, { recursive: true, force: true });
}
