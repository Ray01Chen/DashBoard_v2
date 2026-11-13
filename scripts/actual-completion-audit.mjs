import assert from 'node:assert/strict';
import path from 'node:path';
import { navigateView } from './navigation-audit.mjs';

/** Real explicit saves, autosaves and a lost request use a separate site/date.
 * Quantities come only from the same authenticated APIs used by the product. */
export async function auditActualCompletion({
  browser,
  baseURL,
  root,
  screenshots,
  record,
  errors,
}) {
  screenshots ||= process.argv.includes('--restoration-screenshots');
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  if (screenshots)
    await page.route('**/__completion-capture.css', (route) =>
      route.fulfill({
        contentType: 'text/css',
        body: '.topbar, #toast { visibility: hidden !important; }',
      }),
    );
  async function capture(selector, file) {
    // The app permits same-origin styles only; an inline screenshot style is
    // blocked by CSP and would leave the sticky header covering the selector.
    const style = await page.addStyleTag({ url: baseURL + '/__completion-capture.css' });
    try {
      await page.locator(selector).screenshot({ path: path.join(root, file) });
    } finally {
      await style.evaluate((node) => node.remove());
    }
  }
  const json = async (response, status = 200) => {
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const send = (method, path, data) => context.request[method](baseURL + path, { data });
  const report = (date, shift = 'day') =>
    send('get', `/api/records?date=${date}&shift=${shift}`).then(json);
  const date = async (value) => {
    await page.locator('#report-date').fill(value);
    await page.locator('#report-date').dispatchEvent('change');
    await page.waitForFunction(() => !document.querySelector('#refresh-now').disabled);
    await page.waitForFunction(
      (date) =>
        document.body.dataset.page !== 'entry' ||
        [...document.querySelectorAll('[data-entry-field]')].some((input) =>
          input.dataset.rowKey.startsWith(date + '|'),
        ),
      value,
    );
  };
  try {
    await page.goto(baseURL + '/overview');
    await page.locator('#login-username').fill('manager');
    await page.locator('#login-password').fill('manager');
    await page.locator('#login-submit').click();
    await page.locator('body.authenticated').waitFor();
    const site = (
      await json(
        await send('post', '/api/admin/sites', {
          site_code: 'ZERO-QA',
          site_name: 'Auto zero QA',
        }),
        201,
      )
    ).site;
    await json(await send('post', '/api/auth/site', { siteId: site.id }));
    let config = await json(await send('get', '/api/config'));
    const stations = ['HI', 'CA', 'ATS1', 'BI', 'ATS2', 'Pack'];
    Object.assign(config, {
      lines: ['ZERO-A', 'ZERO-B'],
      models: ['ZERO-M'],
      jobs: ['TE'],
      stations,
      personnel: [],
      productionUnits: ['ZERO-A', 'ZERO-B'].map((line) => ({
        line,
        model: 'ZERO-M',
        dailyTarget: 300,
        staffing: { day: [], night: [], owners: [] },
      })),
      rows: ['ZERO-A', 'ZERO-B'].flatMap((line) =>
        stations.map((station, i) => ({
          id: 'new-' + line + '-' + i,
          line,
          model: 'ZERO-M',
          job: 'TE',
          station,
          active: true,
          hasOutput: true,
        })),
      ),
      schedules: {
        day: [
          { id: 'p1', start: '08:00', end: '09:00', kind: 'production' },
          { id: 'b', start: '09:00', end: '09:15', kind: 'break' },
          { id: 'p2', start: '09:15', end: '10:00', kind: 'production' },
        ],
        night: [{ id: 'n1', start: '23:15', end: '00:00', kind: 'production' }],
      },
      lineSchedules: {},
      scheduleTemplates: [],
    });
    config.monitoring.groups = [];
    config.monitoring.rules = [];
    config.monitoring.unitOutputSources = {};
    config.monitoring.outputSources = {};
    config = await json(await send('put', '/api/config', config));
    const rows = config.rows.filter((row) => row.line === 'ZERO-A'),
      first = config.schedules.day[0],
      second = config.schedules.day[2];
    const input = (row, slot = second, shift = 'day') =>
      page.locator(
        `[data-entry-field="actual"][data-slot-id="${slot.id}"][data-row-key$="|${shift}|${row.id}"]`,
      );
    await page.reload();
    await navigateView(page, 'entry');
    await page.locator('[data-entry-line]').selectOption('ZERO-A');
    await page.locator('[data-entry-model-filter]').selectOption('ZERO-M');
    await date('2099-12-14');
    await input(rows[0]).fill('20');
    await page.waitForFunction(
      () => document.querySelector('[data-entry-overall]')?.textContent === 'Saved',
    );
    assert.equal(
      (await report('2099-12-14')).records.length,
      1,
      'Autosave does not fill peers',
    );
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/api/entry/complete'),
    );
    await page.locator('[data-entry-action="save-all"]').click();
    assert.equal((await saved).status(), 200);
    await page.locator('[data-entry-action="save-all"]:enabled').waitFor();
    const day = await report('2099-12-14');
    assert.equal(day.records.length, 6);
    for (const row of day.records) {
      assert.equal(row.slots.find((slot) => slot.id === first.id).actual, 0);
      assert.equal(row.slots.find((slot) => slot.id === first.id).actualAutoFilled, undefined);
      assert.equal(
        row.slots.find((slot) => slot.id === second.id).actual,
        row.rowId === rows[0].id ? 20 : 0,
      );
    }
    assert.equal((await report('2099-12-14', 'night')).records.length, 0);
    assert.equal(await page.locator('[data-actual-auto-filled], .auto-zero-note').count(), 0);
    if (screenshots) {
      await page.setViewportSize({ width: 1600, height: 1440 });
      await capture('.entry-unified', 'docs/images/actual-completion.png');
      await page.setViewportSize({ width: 1600, height: 900 });
    }
    await page.reload();
    await page.locator('[data-entry-line]').selectOption('ZERO-A');
    await date('2099-12-14');
    await input(rows[1]).fill('0');
    await page.waitForFunction(
      () => document.querySelector('[data-entry-overall]')?.textContent === 'Saved',
    );
    assert.equal(
      (await report('2099-12-14')).records
        .find((row) => row.rowId === rows[1].id)
        .slots.find((slot) => slot.id === second.id).actualAutoFilled,
      undefined,
    );
    record(
      'Explicit entry Save fills all missing station actuals back through the last reported production interval, persists zeros after reload, excludes breaks/later shifts/other units and treats all zeros as completed reports',
    );

    await date('2099-12-15');
    const before = (await report('2099-12-15')).records;
    await page.route('**/api/entry/complete', (route) => route.abort('failed'), { times: 1 });
    await input(rows[0]).fill('25');
    const combined = page.waitForRequest((request) =>
      request.url().endsWith('/api/entry/complete'),
    );
    await page.locator('[data-entry-action="save-all"]').click();
    const payload = (await combined).postDataJSON();
    assert.equal(
      payload.scopes[0].rows.find((row) => row.rowId === rows[0].id).values.actual,
      25,
    );
    await page.locator('.entry-banner:not([hidden])').waitFor();
    await page.waitForTimeout(800);
    assert.deepEqual((await report('2099-12-15')).records, before);
    assert.equal(await input(rows[0]).inputValue(), '25');
    await page.locator('[data-entry-action="save-all"]').click();
    await page.waitForFunction(() => !document.querySelector('.entry-banner:not([hidden])'));
    assert.equal((await report('2099-12-15')).records.length, 6);
    record(
      'An interrupted full-scope save creates neither pending manual records nor peer zeros, retains entered values and enables a full atomic retry; autosave acknowledgements do not silently expand the completion range',
    );

    await navigateView(page, 'overview');
    await date('2099-12-16');
    await page.locator('[data-report-scope="night"]').click();
    const card = page.locator('#line-cards .line-card').first();
    const open = async () => {
      // Pointer/swipe animation is covered by overview-interaction-audit.
      // Keyboard activation keeps this data audit independent of hover flyouts.
      await card.locator('[data-overview-edit]').focus();
      await card.locator('[data-overview-edit]').press('Enter');
      await page.locator('[data-overview-panel] tbody tr').first().waitFor();
    };
    await open();
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="actual"]`)
      .fill('12');
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="target"]`)
      .fill('999');
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="issue"]`)
      .fill('Keep issue');
    await page.locator('[data-editor-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    assert.equal((await report('2099-12-16', 'night')).records.length, 0);
    await page.mouse.move(0, 0);
    await open();
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="actual"]`)
      .fill('12');
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="target"]`)
      .fill('999');
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="issue"]`)
      .fill('Keep issue');
    await page
      .locator(`[data-editor-row="${rows.at(-1).id}"][data-editor-field="actual"]`)
      .fill('8');
    await page.locator('[data-editor-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    const night = (await report('2099-12-16', 'night')).records;
    assert.equal(night.length, 6);
    assert.equal(night.filter((row) => row.slots[0].actual === 0).length, 4);
    assert.equal((await report('2099-12-16')).records.length, 0);
    await page.locator('#metric-scope-controls [data-metric-scope="day"]').click();
    assert.equal(await card.locator('[data-metric="dailyActual"] b').innerText(), '8');
    record(
      'Overview station-table Save fills only the chosen overnight interval, refreshes displayed daily output and treats zero as reported; Cancel writes neither numbers nor zeros',
    );

    const cell = (row, field) =>
      page.locator(`[data-editor-row="${row.id}"][data-editor-field="${field}"]`);
    await page.mouse.move(0, 0);
    await open();
    await cell(rows[0], 'actual').fill('888');
    await cell(rows[0], 'issue').fill('Unsaved issue');
    await page.locator('[data-editor-restore]').click();
    await page.locator('#confirm-dialog[open]').waitFor();
    assert.match(await page.locator('#confirm-description').innerText(), /saved immediately/);
    assert.equal(await page.locator('[data-editor-save]').isDisabled(), true);
    await page.locator('#confirm-no').click();
    await page.locator('[data-editor-restore]:enabled').waitFor();
    assert.equal(await cell(rows[0], 'actual').inputValue(), '888');
    assert.equal(await cell(rows[0], 'issue').inputValue(), 'Unsaved issue');
    assert.deepEqual((await report('2099-12-16', 'night')).records, night);
    await page.route('**/api/entry/interval/reset', (route) => route.abort('failed'), {
      times: 1,
    });
    await page.locator('[data-editor-restore]').click();
    await page.locator('#confirm-yes').click();
    await page.locator('[data-editor-restore]:enabled').waitFor();
    assert.equal(await cell(rows[0], 'actual').inputValue(), '888');
    assert.ok(await page.locator('.overview-editor-message').innerText());
    assert.deepEqual((await report('2099-12-16', 'night')).records, night);
    // Hold an old polling response across the committed reset. Its stale
    // quantities must never repaint the refreshed table or card statistics.
    let releaseOld;
    let pollingStarted;
    const pendingPoll = new Promise((resolve) => {
      pollingStarted = resolve;
    });
    await page.route(
      '**/api/records?*',
      async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => {
          releaseOld = resolve;
          pollingStarted();
        });
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page.locator('#refresh-now').click();
    await pendingPoll;
    const resetRequest = page.waitForRequest((request) =>
      request.url().endsWith('/api/entry/interval/reset'),
    );
    await page.locator('[data-editor-restore]').click();
    await page.locator('#confirm-yes').click();
    const resetPayload = (await resetRequest).postDataJSON();
    assert.equal(resetPayload.completeActuals, undefined);
    assert.equal(resetPayload.rows, undefined);
    assert.equal(resetPayload.values, undefined);
    assert.equal(resetPayload.expectedVersions.length, rows.length);
    await page.locator('[data-editor-restore]:enabled').waitFor();
    releaseOld();
    await page.waitForTimeout(250);
    assert.notEqual(await card.locator('[data-metric="dailyActual"] b').innerText(), '8');
    assert.equal(
      await page.locator('[data-overview-panel]').count(),
      1,
      'Reset updates the open editor without another Save',
    );
    for (const row of rows) {
      assert.equal(await cell(row, 'actual').inputValue(), '');
      assert.equal(
        await cell(row, 'target').inputValue(),
        String((await report('2099-12-16', 'night')).defaults[row.id].slots[0].target),
      );
    }
    assert.equal(await cell(rows[0], 'issue').inputValue(), 'Keep issue');
    const restored = (await report('2099-12-16', 'night')).records;
    assert.ok(restored.every((record) => record.slots[0].actual === null));
    assert.deepEqual(
      restored.map((record) => record.slots[0].issue),
      night.map((record) => record.slots[0].issue),
    );
    const geometry = await page.locator('[data-overview-panel]').evaluate((panel) => {
      const restore = panel.querySelector('[data-editor-restore]').getBoundingClientRect();
      const cancel = panel.querySelector('[data-editor-cancel]').getBoundingClientRect();
      const save = panel.querySelector('[data-editor-save]').getBoundingClientRect();
      const height = parseFloat(
        getComputedStyle(panel).getPropertyValue('--ui-control-height'),
      );
      return {
        ordered: restore.right < cancel.left && cancel.right < save.left,
        aligned: restore.top === cancel.top && cancel.top === save.top,
        borders: [...panel.querySelectorAll('input,textarea,select')].every(
          (node) => getComputedStyle(node).borderTopStyle === 'solid',
        ),
        heights: [...panel.querySelectorAll('input,textarea,select')].every(
          (node) => node.getBoundingClientRect().height === height,
        ),
        background: getComputedStyle(panel.querySelector('input')).backgroundColor,
        cardBackground: getComputedStyle(panel.closest('.line-card')).backgroundImage,
      };
    });
    assert.equal(
      geometry.ordered && geometry.aligned && geometry.borders && geometry.heights,
      true,
      JSON.stringify(geometry),
    );
    assert.ok(geometry.cardBackground.includes(geometry.background), JSON.stringify(geometry));
    if (screenshots)
      await capture('[data-overview-panel]', 'docs/images/overview-restore-defaults.png');
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(
      await cell(rows[0], 'actual').evaluate((node) => getComputedStyle(node).backgroundColor),
      geometry.background,
      'OS preference must not darken only the editor',
    );
    // An actual dark theme supplies shared tokens for both the card and editor.
    await page.route('**/__reset-theme-test.css', (route) =>
      route.fulfill({
        contentType: 'text/css',
        body: '[data-theme] { --surface: #192735; --canvas: #203142; --ink: #e4edf5; --muted: #afbfce; --soft: #20364b; --ui-border: #43596d; --line: #344759; color-scheme: dark; }',
      }),
    );
    const theme = await page.addStyleTag({ url: baseURL + '/__reset-theme-test.css' });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-editor-field="actual"]'))
          .backgroundColor === 'rgb(25, 39, 53)',
    );
    assert.equal(
      await card.evaluate((node) =>
        getComputedStyle(node).backgroundImage.includes('rgb(25, 39, 53)'),
      ),
      true,
    );
    if (screenshots)
      await capture('[data-overview-panel]', '.runtime/overview-restore-dark.png');
    await theme.evaluate((node) => node.remove());
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(700);
    assert.deepEqual(
      (await report('2099-12-16', 'night')).records,
      restored,
      'Old drafts never autosave after reset',
    );
    await page.reload();
    await date('2099-12-16');
    await page.locator('[data-report-scope="night"]').click();
    await open();
    for (const row of rows) assert.equal(await cell(row, 'actual').inputValue(), '');
    assert.equal(await cell(rows[0], 'issue').inputValue(), 'Keep issue');
    assert.equal((await report('2099-12-16')).records.length, 0);
    await page.locator('[data-editor-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    record(
      'Independent reset confirms and commits immediately without Save, derives Targets on the server, clears Actuals to NULL, preserves saved Issue and other shifts, replaces stale drafts, retries network failures and persists after reload; editor and cards share light/dark theme tokens',
    );

    await navigateView(page, 'entry');
    await date('2099-12-17');
    await page.locator('[data-entry-line]').selectOption('ZERO-A');
    await page.locator('[data-entry-action="bulk-open"]').first().click();
    await page.locator('[data-bulk-slot]').selectOption({ index: 0 });
    await page.locator('[data-entry-action="bulk-save"]:enabled').waitFor();
    const bulkCell = (row) =>
      page.locator(`[data-bulk-cell="actual"][data-bulk-row-id="${row.id}"]`);
    await bulkCell(rows[0]).fill('13');
    await page.locator('[data-entry-action="bulk-close"]').click();
    await page.waitForFunction(() => !document.querySelector('.entry-bulk-dialog[open]'));
    assert.equal(
      (await report('2099-12-17')).records.length,
      1,
      'Backdrop/close autosave does not complete peers',
    );
    await page.locator('[data-entry-action="bulk-open"]').first().click();
    await page.locator('[data-entry-action="bulk-save"]:enabled').waitFor();
    await page.locator('[data-entry-action="bulk-save"]').click();
    await page.locator('[data-entry-action="bulk-save"]:enabled').waitFor();
    let bulk = (await report('2099-12-17')).records;
    assert.equal(bulk.length, 6);
    assert.equal(bulk.find((row) => row.rowId === rows[0].id).slots[0].actual, 13);
    await bulkCell(rows[1]).fill('0');
    await page.locator('[data-entry-action="bulk-save"]').click();
    await page.locator('[data-entry-action="bulk-save"]:enabled').waitFor();
    bulk = (await report('2099-12-17')).records;
    assert.equal(
      bulk.find((row) => row.rowId === rows[1].id).slots[0].actualAutoFilled,
      undefined,
    );
    for (const language of ['zh', 'en', 'th']) {
      await page.locator('#language-select').selectOption(language);
      assert.equal(await page.locator('.entry-bulk-dialog .auto-zero-note').count(), 0);
      assert.doesNotMatch(
        await page.locator('.entry-bulk-dialog').innerText(),
        /autoFilledZero|autoZeroShort/,
      );
    }
    await page.locator('[data-entry-action="bulk-close"]').click();
    record(
      'Batch explicit Save fills selected-interval blanks only; closing and autosaving do not fill peers, existing numeric values survive, all zeros are reported without provenance labels in all three languages',
    );
  } finally {
    await context.close();
  }
}
