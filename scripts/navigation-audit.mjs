/** Exercise UI ordering against real versioned settings in the smoke database.
 * Deliberately unsorted catalogs catch accidental edits by display index. */
import assert from 'node:assert/strict';

export async function auditNavigation({
  browser,
  context,
  baseURL,
  readConfig,
  record,
  errors,
}) {
  const config = await readConfig();
  const lines = ['CD10', 'CD2', 'CD1'];
  Object.assign(config, {
    lines,
    models: ['Model10', 'Model2'],
    jobs: ['Job10', 'Job2'],
    stations: ['Station10', 'Station2'],
    productionUnits: lines.map((line) => ({
      line,
      model: 'Model2',
      dailyTarget: 600,
      staffing: { day: [], night: [], owners: [] },
    })),
    personnel: [
      { id: 'order-person-10', name: 'Person10', job: 'Job2', active: true },
      { id: 'order-person-2', name: 'Person2', job: 'Job2', active: true },
    ],
    rows: [
      {
        id: 'new-order-station-10',
        line: 'CD2',
        model: 'Model2',
        job: 'Job2',
        station: 'Station10',
        active: true,
        hasOutput: true,
      },
      {
        id: 'new-order-station-2',
        line: 'CD2',
        model: 'Model2',
        job: 'Job2',
        station: 'Station2',
        active: true,
        hasOutput: true,
      },
    ],
    lineSchedules: {},
    scheduleTemplates: [],
  });
  config.monitoring.groups = [
    { id: 'order-floor-10', name: '10F', lines: ['CD10'] },
    { id: 'order-floor-2', name: '2F', lines: ['CD2'] },
  ];
  const response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  const initial = await response.json();
  const session = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await session.request.post(baseURL + '/api/auth/login', {
    data: { username: 'manager', password: 'manager' },
  });
  const page = await session.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/settings/master-data');
  await page.locator('#language-select').selectOption('en');
  const options = async (selector) =>
    page
      .locator(selector + ' option')
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  assert.deepEqual(await options('[data-unit-add-line]'), ['CD10', 'CD2', 'CD1']);
  assert.deepEqual(await options('[data-unit-add-model]'), ['Model10', 'Model2']);
  assert.deepEqual(await options('#schedule-line-select'), ['CD10', 'CD2', 'CD1']);
  const picker = page.locator('#schedule-line-picker');
  assert.equal(await picker.getAttribute('open'), null);
  await picker.locator('summary').click();
  assert.deepEqual(await picker.locator('.line-picker-group strong').allTextContents(), [
    '10F',
    '2F',
    'Ungrouped lines',
  ]);
  await picker.locator('[data-schedule-apply-line="CD10"]').check();
  await picker.locator('[data-line-picker-search]').fill('CD2');
  assert.deepEqual(
    await picker.locator('[data-picker-option]:visible').getAttribute('data-picker-option'),
    'CD2',
  );
  await picker.locator('[data-schedule-apply-group="group:order-floor-2"]').check();
  assert.match(await picker.locator('[data-picker-count]').textContent(), /2/);
  assert.equal(await picker.locator('[data-schedule-apply-line="CD10"]').isChecked(), true);
  await picker.locator('[data-line-picker-search]').fill('no-such-line');
  assert.equal(await picker.locator('[data-picker-empty]').isVisible(), true);
  await picker.locator('[data-action="schedule-select-all"]').click();
  assert.match(await picker.locator('[data-picker-count]').textContent(), /3/);
  await picker.locator('[data-action="schedule-clear-lines"]').click();
  assert.match(await picker.locator('[data-picker-count]').textContent(), /0/);
  await picker.locator('[data-line-picker-search]').fill('');
  await picker.locator('[data-schedule-apply-line="CD2"]').check();
  assert.equal((await readConfig()).version, initial.version);
  assert.match(
    await page.locator('[data-schedule-save-state]').textContent(),
    /All settings are saved/,
  );
  await page.locator('[data-action="apply-schedule-template"]').click();
  await page.locator('#confirm-no').click();
  assert.deepEqual((await readConfig()).lineSchedules, {});
  await page.locator('[data-action="apply-schedule-template"]').click();
  await page.locator('#confirm-yes').click();
  assert.match(await page.locator('[data-schedule-save-state]').textContent(), /unsaved/i);
  assert.equal((await readConfig()).version, initial.version);
  await page.locator('.schedule-apply [data-save-settings]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-schedule-save-state]').textContent ===
      'All settings are saved.',
  );
  assert.deepEqual(Object.keys((await readConfig()).lineSchedules), ['CD2']);
  await page.reload();
  assert.match(
    await page.locator('[data-schedule-save-state]').textContent(),
    /All settings are saved/,
  );
  record(
    'Searchable grouped line selection retains hidden choices; all/clear, cancel, draft-only apply and explicit save use real configuration without extra writes',
  );

  await picker.locator('summary').click();
  await picker.locator('[data-schedule-apply-line="CD2"]').check();
  await picker.locator('summary').click();
  await page.locator('[data-unit-add-line]').selectOption('CD2');
  const lineInput = page.locator('[data-catalog-name="lines"][value="CD2"]');
  assert.equal(await lineInput.getAttribute('data-index'), '1');
  await lineInput.fill('CD3');
  await lineInput.press('Tab');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#schedule-line-select option')].some(
      (node) => node.value === 'CD3',
    ),
  );
  assert.deepEqual(await options('[data-unit-add-line]'), ['CD10', 'CD3', 'CD1']);
  assert.equal(await page.locator('[data-unit-add-line]').inputValue(), 'CD3');
  assert.match(await picker.locator('[data-picker-count]').textContent(), /1/);
  assert.equal(await picker.locator('[data-schedule-apply-line="CD3"]').isChecked(), true);
  await page.locator('#new-lines').fill('CD4');
  await page.locator('[data-action="add-catalog"][data-catalog="lines"]').click();
  assert.deepEqual(await options('[data-unit-add-line]'), ['CD10', 'CD3', 'CD1', 'CD4']);
  const added = page
    .locator('.catalog-item')
    .filter({ has: page.locator('[data-catalog-name="lines"][value="CD4"]') });
  await added.locator('[data-action="remove-catalog"]').click();
  if (await page.locator('#confirm-dialog').isVisible())
    await page.locator('#confirm-yes').click();
  assert.deepEqual(await options('[data-unit-add-line]'), ['CD10', 'CD3', 'CD1']);
  await page.locator('[data-save-settings]').first().click();
  await page.waitForFunction(
    () =>
      document.querySelector('#settings-save-status').textContent === 'All settings are saved.',
  );
  const saved = await readConfig();
  assert.deepEqual(saved.lines, ['CD10', 'CD3', 'CD1']);
  assert.deepEqual(
    saved.rows.map((row) => row.id),
    initial.rows.map((row) => row.id),
  );
  await page.locator('[data-settings-tab="targets"]').click();
  await page.locator('[data-target-line]').selectOption('');
  assert.deepEqual(await page.locator('.target-line-name').allTextContents(), [
    'CD10',
    'CD3',
    'CD1',
  ]);
  await page.locator('[data-settings-tab="personnel"]').click();
  await page.locator('[data-person-job-filter]').selectOption('Job2');
  assert.deepEqual(
    await page
      .locator('[data-person-field="name"]')
      .evaluateAll((nodes) => nodes.map((node) => node.value)),
    ['Person10', 'Person2'],
  );
  assert.equal(
    await page.locator('[data-person-field="name"]').first().getAttribute('data-person-index'),
    '0',
  );
  await page.locator('[data-settings-tab="workforce"]').click();
  await page.locator('[data-mapping-line-filter]').selectOption('CD3');
  assert.deepEqual(
    await page
      .locator('[data-configured-mapping]')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.configuredMapping))),
    initial.rows
      .filter((row) => row.line === 'CD2' && row.active && !row.deleted)
      .map((row) => row.id),
  );
  assert.deepEqual(await options('[data-row-field="station"]'), [
    'Station10',
    'Station2',
    'Station10',
    'Station2',
  ]);
  record(
    'Source line/model/job/station/person ordering refreshes without alphabetic overrides after add, rename and delete; original indexes, configured station sequence and saved array order remain intact',
  );

  await page.locator('[data-view="overview"]').click();
  await page.waitForFunction(() => location.pathname === '/overview');
  assert.equal(await page.title(), 'BP9 · Production Overview');
  await page.locator('#collapse-sidebar').click();
  assert.equal(await page.locator('#collapse-sidebar').getAttribute('aria-expanded'), 'false');
  await page.reload();
  assert.equal(
    await page.locator('body').evaluate((node) => node.classList.contains('sidebar-collapsed')),
    true,
  );
  await page.locator('#toggle-navigation').click();
  assert.equal(await page.locator('#collapse-sidebar').getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#sidebar').inert);
  assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'true');
  await page.locator('#toggle-navigation').click();
  assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'false');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'true');
  await page.locator('#toggle-navigation').click();
  await page.locator('#navigation-scrim').click({ position: { x: 380, y: 300 } });
  assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'true');
  await page.locator('#toggle-navigation').click();
  await page.locator('[data-view="details"]').click();
  await page.waitForFunction(
    () => location.pathname === '/details' && document.querySelector('#sidebar').inert,
  );
  await page.goBack();
  await page.waitForFunction(() => location.pathname === '/overview');
  record(
    'Grouped sidebar navigation preserves direct routes, permissions, saved collapse state and browser history; the mobile drawer closes on Escape, backdrop and navigation',
  );
  await session.close();
}
