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
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
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
      assert.equal(row.slots.find((slot) => slot.id === first.id).actualAutoFilled, true);
      assert.equal(
        row.slots.find((slot) => slot.id === second.id).actual,
        row.rowId === rows[0].id ? 20 : 0,
      );
    }
    assert.equal((await report('2099-12-14', 'night')).records.length, 0);
    assert.equal(
      await page.locator('[data-entry-field="actual"][data-actual-auto-filled="true"]').count(),
      11,
    );
    if (screenshots) {
      await page.setViewportSize({ width: 1600, height: 1440 });
      await page.locator('.entry-unified').screenshot({
        path: path.join(root, 'docs/images/actual-completion.png'),
      });
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
      'Explicit entry Save fills all missing station actuals back through the last human production interval, persists zeros after reload, excludes breaks/later shifts/other units and confirms a typed zero without confirming untouched automatic zeros',
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
      await card.locator('.line-trend').hover();
      await card.locator('[data-overview-edit]').click();
      await page.locator('[data-overview-panel] tbody tr').first().waitFor();
    };
    await open();
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="actual"]`)
      .fill('12');
    await page.locator('[data-editor-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    assert.equal((await report('2099-12-16', 'night')).records.length, 0);
    await page.mouse.move(0, 0);
    await open();
    await page
      .locator(`[data-editor-row="${rows[0].id}"][data-editor-field="actual"]`)
      .fill('12');
    await page.locator('[data-editor-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    const night = (await report('2099-12-16', 'night')).records;
    assert.equal(night.length, 6);
    assert.equal(night.filter((row) => row.slots[0].actualAutoFilled).length, 5);
    assert.equal((await report('2099-12-16')).records.length, 0);
    await page.locator('#metric-scope-controls [data-metric-scope="day"]').click();
    assert.equal(await card.locator('[data-metric="dailyActual"] b').innerText(), '0');
    record(
      'Overview station-table Save fills only the chosen overnight interval, refreshes displayed daily output and preserves the separate human/automatic state; Cancel writes neither numbers nor zeros',
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
      assert.equal(await page.locator('.entry-bulk-dialog .auto-zero-note').count(), 4);
      assert.doesNotMatch(
        await page.locator('.entry-bulk-dialog').innerText(),
        /autoFilledZero|autoZeroShort/,
      );
    }
    await page.locator('[data-entry-action="bulk-close"]').click();
    record(
      'Batch explicit Save fills selected-interval blanks only; closing and autosaving do not fill peers, existing numeric values survive, manual zero confirms one station and provenance labels translate in all three languages',
    );
  } finally {
    await context.close();
  }
}
