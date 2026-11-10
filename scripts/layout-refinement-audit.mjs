/** Regression scene for the reported CD303 threshold and shared pagination.
 * All settings/reports are written through the real API in the disposable DB. */
import assert from 'node:assert/strict';
export async function auditLayoutRefinement({
  browser,
  context,
  baseURL,
  readConfig,
  record,
  errors,
}) {
  const config = await readConfig(),
    lines = Array.from({ length: 10 }, (_, i) => 'CD' + (303 + i));
  const model = 'ECD17020037-HPRV2-12KW';
  Object.assign(config, {
    lines,
    models: [model],
    jobs: ['PD'],
    stations: ['Pack'],
    personnel: [],
    scheduleTemplates: [],
    lineSchedules: {},
    productionUnits: lines.map((line) => ({
      line,
      model,
      dailyTarget: 100,
      staffing: { day: [], night: [], owners: [] },
    })),
    rows: lines.map((line, i) => ({
      id: 'new-refinement-' + i,
      line,
      model,
      job: 'PD',
      station: 'Pack',
      active: true,
      hasOutput: true,
    })),
    schedules: {
      day: [
        { id: 'report-slot', kind: 'production', start: '12:40', end: '13:00' },
        { id: 'rest-slot', kind: 'break', start: '13:00', end: '14:00' },
      ],
      night: [{ id: 'night-slot', kind: 'production', start: '20:00', end: '21:00' }],
    },
  });
  Object.assign(config.monitoring, {
    pageRotateSeconds: 5,
    rules: [],
    groups: [
      { id: 'small', name: 'Three lines', lines: lines.slice(0, 3) },
      { id: 'seven', name: 'Seven lines', lines: lines.slice(3) },
    ],
    unified: {
      performance: { enabled: false, green: 95, red: 85 },
      completion: { enabled: false, green: 100, red: 110 },
      reporting: { enabled: true, graceMinutes: 30, redMinutes: 45 },
    },
  });
  let response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  const initial = await response.json();
  assert.equal(initial.monitoring.unified.reporting.redAfterMinutes, 75);
  const session = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await session.request.post(baseURL + '/api/auth/login', {
    data: { username: 'manager', password: 'manager' },
  });
  const page = await session.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const date = '2099-12-01',
    clock = Date.parse(date + 'T13:35:00+07:00');
  await page.clock.install({ time: clock });
  await page.route('**/api/records?*', async (route) => {
    const result = await route.fetch();
    await route.fulfill({
      response: result,
      json: { ...(await result.json()), serverTime: await page.evaluate(() => Date.now()) },
    });
  });
  await page.goto(baseURL + '/settings/alerts');
  await page.locator('#language-select').selectOption('en');
  const red = page.locator('[data-policy="reporting"][data-policy-field="redAfterMinutes"]');
  assert.equal(await red.inputValue(), '75');
  await red.fill('45');
  await red.press('Tab');
  await page.locator('#page-rotate-seconds').fill('15');
  await page.locator('#page-rotate-seconds').press('Tab');
  await page.locator('[data-save-settings]').first().click();
  await page.waitForFunction(
    () =>
      document.querySelector('#settings-save-status').textContent === 'All settings are saved.',
  );
  await page.reload();
  assert.equal(await red.inputValue(), '45');
  assert.equal(await page.locator('#page-rotate-seconds').inputValue(), '15');
  const saved = await readConfig();
  assert.equal(saved.monitoring.unified.reporting.redAfterMinutes, 45);
  assert.equal(Object.hasOwn(saved.monitoring.unified.reporting, 'redMinutes'), false);
  await page.locator('[data-view="overview"]').click();
  await page.locator('#report-date').fill(date);
  await page.locator('#report-date').dispatchEvent('change');
  await page.waitForFunction(
    () => document.querySelectorAll('#line-cards .line-card').length === 7,
  );
  await page.waitForFunction(() =>
    document.querySelector('#line-cards .line-card .lamp-yellow'),
  );
  assert.match(
    await page
      .locator('#line-cards .line-card')
      .first()
      .locator('[data-card-reason]')
      .getAttribute('title'),
    /red after 45 min/,
  );
  assert.doesNotMatch(
    await page
      .locator('#line-cards .line-card')
      .first()
      .locator('[data-card-reason]')
      .getAttribute('title'),
    /75 min/,
  );
  record(
    'The exact CD303 example persists an absolute red threshold of 45 minutes with grace 30; live reporting is yellow at 35 minutes and its full reason shows 45, not 75',
  );

  const ids = () => page.locator('#line-cards .production-line').allTextContents();
  assert.deepEqual(await ids(), lines.slice(0, 7));
  await page.locator('#board-pagination [data-board-page="1"]').click();
  assert.deepEqual(await ids(), lines.slice(7));
  await page.clock.runFor(5000);
  assert.deepEqual(await ids(), lines.slice(7));
  await page.clock.runFor(11000);
  await page.waitForFunction(
    () => document.querySelectorAll('#line-cards .line-card').length === 7,
  );
  assert.deepEqual(await ids(), lines.slice(0, 7));
  await page.locator('#board-pagination [data-board-page="1"]').click();
  await page.locator('#enter-fullscreen').click();
  // The shell animates its desktop sidebar offset. Measure only after the
  // fullscreen layout settles, otherwise the transition looks like a resize.
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.app-shell')).marginLeft === '0px',
  );
  assert.deepEqual(await ids(), lines.slice(7));
  const before = await page.locator('#line-cards').boundingBox();
  await page.locator('#toggle-navigation').click();
  assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'), 'false');
  const after = await page.locator('#line-cards').boundingBox();
  assert.equal(Math.round(before.width), Math.round(after.width));
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('body').evaluate((node) => node.classList.contains('fullscreen-board')),
    true,
  );
  await page.locator('#exit-fullscreen').click();
  assert.deepEqual(await ids(), lines.slice(7));
  await page.locator('[data-group="small"]').click();
  assert.equal(await page.locator('#line-cards .line-card').count(), 3);
  assert.equal(await page.locator('#board-pagination').isVisible(), false);
  await page.locator('[data-group="seven"]').click();
  assert.equal(await page.locator('#line-cards .line-card').count(), 7);
  assert.equal(await page.locator('#board-pagination').isVisible(), false);
  record(
    'Ten naturally ordered lines paginate 7+3 in ordinary/fullscreen views; auto rotation, a full manual dwell, preserved page on mode switch, filter recalculation and a non-resizing fullscreen drawer work',
  );

  await page.locator('[data-group="small"]').click();
  await page.clock.fastForward(11 * 60000);
  await page.waitForFunction(() => document.querySelector('#line-cards .line-card .lamp-red'));
  const latest = await readConfig(),
    row = latest.rows.find((row) => row.line === 'CD303' && row.active);
  response = await context.request.put(baseURL + '/api/records/' + row.id, {
    data: {
      date,
      shift: 'day',
      version: 0,
      configVersion: latest.version,
      entryMode: true,
      editTargets: true,
      slots: latest.schedules.day
        .filter((slot) => slot.kind === 'production')
        .map((slot) => ({ id: slot.id, target: 100, actual: 0, issue: '' })),
    },
  });
  assert.equal(response.status(), 200, await response.text());
  await page.locator('#refresh-now').click();
  await page.waitForFunction(() =>
    document.querySelector('#line-cards .line-card .lamp-green'),
  );
  const disabled = await readConfig();
  disabled.monitoring.pageRotateSeconds = 0;
  response = await context.request.put(baseURL + '/api/config', { data: disabled });
  assert.equal(response.status(), 200, await response.text());
  await page.locator('#refresh-now').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-now').disabled);
  await page.locator('[data-group=""]').click();
  await page.locator('#board-pagination [data-board-page="1"]').click();
  await page.clock.fastForward(60000);
  assert.deepEqual(await ids(), lines.slice(7));
  record(
    'Reporting turns red after the saved 45-minute threshold and clears after a submitted zero; saved zero-second rotation remains disabled across live refreshes',
  );
  // Drain any timer-triggered route before disposing its response context.
  await page.unrouteAll({ behavior: 'wait' });
  await session.close();
}
