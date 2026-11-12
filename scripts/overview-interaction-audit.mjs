import assert from 'node:assert/strict';
import path from 'node:path';

/** Real API data, pointer dragging, optimistic conflicts and fullscreen drafts. */
export async function auditOverviewInteractions({
  browser,
  baseURL,
  record,
  errors,
  root,
  screenshots,
}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const json = async (response, status = 200) => {
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const send = (method, url, data) => context.request[method](baseURL + url, { data });
  const login = async (navigate = true) => {
    if (navigate) await page.goto(baseURL + '/overview');
    await page.locator('#login-username').fill('manager');
    await page.locator('#login-password').fill('manager');
    await page.locator('#login-submit').click();
    await page.locator('body.authenticated').waitFor();
  };
  try {
    await login();
    const management = page.locator('#management-nav');
    assert.equal(await management.getAttribute('open'), null);
    await management.locator('summary').click();
    assert.equal(await page.locator('[data-view="sites"]').isVisible(), true);
    await management.locator('summary').click();
    assert.equal(await page.locator('[data-view="sites"]').isVisible(), false);
    await page.goto(baseURL + '/administration/sites');
    await page.locator('#management-nav[open] [data-view="sites"].active').waitFor();
    await page.locator('[data-view="users"]').click();
    await page.locator('#management-nav[open] [data-view="users"].active').waitFor();
    if (screenshots)
      await page
        .locator('#sidebar')
        .screenshot({ path: path.join(root, 'docs/images/sidebar-management.png') });
    await page.locator('#collapse-sidebar').click();
    await management.locator('summary').click();
    assert.equal(
      await page
        .locator('body')
        .evaluate((node) => node.classList.contains('sidebar-collapsed')),
      false,
    );
    assert.equal(await page.locator('[data-view="users"].active').isVisible(), true);
    await page.goto(baseURL + '/overview');
    const site = (
      await json(
        await send('post', '/api/admin/sites', {
          site_code: 'INLINE-QA',
          site_name: 'Inline and order QA',
        }),
        201,
      )
    ).site;
    await json(await send('post', '/api/auth/site', { siteId: site.id }));
    let config = await json(await send('get', '/api/config'));
    Object.assign(config, {
      lines: ['CD10', 'CD2', 'CD1'],
      models: ['Long-model-for-inline-editing'],
      jobs: ['PD'],
      stations: ['Pack'],
      personnel: [],
      productionUnits: ['CD10', 'CD2', 'CD1'].map((line) => ({
        line,
        model: 'Long-model-for-inline-editing',
        dailyTarget: 100,
        staffing: { day: [], night: [], owners: [] },
      })),
      rows: ['CD10', 'CD2', 'CD1'].map((line) => ({
        id: 'new-' + line,
        line,
        model: 'Long-model-for-inline-editing',
        job: 'PD',
        station: 'Pack',
        active: true,
        hasOutput: true,
      })),
      schedules: {
        day: [
          { id: 'p1', kind: 'production', start: '08:00', end: '09:00' },
          { id: 'p2', kind: 'production', start: '09:00', end: '10:00' },
        ],
        night: [{ id: 'n1', kind: 'production', start: '20:00', end: '21:00' }],
      },
      lineSchedules: {},
      scheduleTemplates: [],
    });
    config.monitoring.groups = [];
    config.monitoring.rules = [];
    config.monitoring.unitOutputSources = {};
    config.monitoring.outputSources = {};
    config = await json(await send('put', '/api/config', config));
    await page.reload();
    await page.locator('#line-cards .line-card').first().waitFor();
    const names = () => page.locator('#line-cards .production-line').allTextContents();
    assert.deepEqual(await names(), ['CD10', 'CD2', 'CD1']);
    await page
      .locator('.topbar .personal-order-open, .topbar-right .personal-order-open')
      .first()
      .click();
    await page.locator('#personal-order-panel:popover-open').waitFor();
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const rows = page.locator('.personal-order-items li');
    const first = await rows.first().locator('.order-handle').boundingBox(),
      last = await rows.last().boundingBox();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + 55, last.y + last.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(
      () => !document.querySelector('.order-save-state').textContent.includes('…'),
    );
    await page.locator('[data-order-close]').click();
    assert.deepEqual(await names(), ['CD2', 'CD1', 'CD10']);
    await page.reload();
    await page.locator('#line-cards .line-card').first().waitFor();
    assert.deepEqual(await names(), ['CD2', 'CD1', 'CD10']);
    await page.locator('#logout').click();
    await page.locator('#login-dialog[open]').waitFor();
    await login(false);
    assert.deepEqual(await names(), ['CD2', 'CD1', 'CD10']);
    record(
      'Pointer drag saves personal line/model order to SQLite; refresh and logout/relogin preserve it without changing CONFIG',
    );

    const card = page.locator('#line-cards .line-card').first();
    await card.hover();
    await page.waitForTimeout(240);
    assert.equal(
      await card.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41),
      45,
    );
    const open = async () => {
      await card.hover();
      await card.locator('[data-inline-open]').click();
    };
    await open();
    await page.locator('[data-inline-actual]:enabled').waitFor();
    assert.equal(
      await card
        .locator(
          '[data-inline-field="date"], [data-inline-field="shift"], [data-inline-field="rowId"]',
        )
        .count(),
      0,
    );
    assert.equal(await card.locator('.health-period').isVisible(), false);
    assert.equal(await card.locator('[data-next-slot], .line-slot').count(), 0);
    await page.locator('[data-inline-actual]').fill('37');
    await page.locator('[data-inline-preset]').selectOption({ index: 1 });
    assert.ok((await page.locator('[data-inline-issue]').inputValue()).length > 0);
    await page.locator('[data-inline-cancel]').click();
    assert.equal(await page.locator('[data-inline-actual]').count(), 0);
    const date = await page.locator('#report-date').inputValue();
    assert.equal(
      (await json(await send('get', `/api/records?date=${date}&shift=day`))).records.length,
      0,
    );
    await open();
    await page.locator('[data-inline-actual]:enabled').waitFor();
    await page.locator('[data-inline-actual]').fill('37');
    await page.locator('[data-inline-issue]').fill('Equipment downtime\nOperator note');
    const chosen = await page.locator('[data-inline-field="slotId"]').inputValue();
    const rowId = config.rows.find((row) => row.line === 'CD2').id;
    await page.locator('[data-inline-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-inline-editing]'));
    const report = await json(await send('get', `/api/records?date=${date}&shift=day`));
    const saved = report.records.find((record) => record.rowId === rowId);
    assert.equal(saved.slots.find((slot) => slot.id === chosen).actual, 37);
    assert.match(saved.slots.find((slot) => slot.id === chosen).issue, /Operator note/);
    assert.equal(saved.slots.find((slot) => slot.id !== chosen).actual, null);
    assert.equal(saved.updatedBy, 'manager');
    assert.ok(saved.updatedAt);
    assert.equal(report.records.length, 1);
    record(
      'Inline hover slides exactly 45px; Cancel writes nothing and Save updates only the selected station/slot with existing issue and audit metadata',
    );

    await open();
    await page.locator('[data-inline-actual]:enabled').waitFor();
    await page.locator('[data-inline-actual]').fill('42');
    await json(
      await send('put', '/api/entry/records/' + rowId, {
        date,
        shift: 'day',
        configVersion: config.version,
        version: saved.version,
        stationEntry: true,
        slots: [{ id: chosen, actual: 39 }],
      }),
    );
    await page.locator('#refresh-now').click();
    assert.equal(await page.locator('[data-inline-actual]').inputValue(), '42');
    const conflictResponse = page.waitForResponse((response) =>
      response.url().includes('/api/entry/records/'),
    );
    await page.locator('[data-inline-save]').click();
    assert.equal((await conflictResponse).status(), 409);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-inline-save]')?.disabled === false &&
        document.querySelector('.inline-feedback')?.textContent !== '',
    );
    assert.equal(await page.locator('[data-inline-actual]').inputValue(), '42');
    assert.ok(await page.locator('[data-inline-editing]').count());
    await page.locator('[data-inline-cancel]').click();
    await open();
    await page.locator('[data-inline-actual]:enabled').waitFor();
    await page.locator('[data-inline-actual]').fill('0');
    await page.locator('#enter-fullscreen').click();
    await page.locator('body.fullscreen-board').waitFor();
    assert.equal(await page.locator('[data-inline-actual]').inputValue(), '0');
    for (const theme of await page
      .locator('#theme-select option')
      .evaluateAll((options) => options.map((option) => option.value))) {
      await page.locator('#theme-select').selectOption(theme);
      assert.equal(await page.locator('[data-inline-actual]').inputValue(), '0');
    }
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1600, height: 900 },
      { width: 1366, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      for (const language of ['zh', 'en', 'th']) {
        await page.locator('#language-select').selectOption(language);
        assert.equal(await page.locator('[data-inline-actual]').inputValue(), '0');
        await page.waitForFunction(() => {
          const button = document.querySelector('[data-inline-save]');
          return button && button.getBoundingClientRect().left >= 0;
        });
        const geometry = await page.locator('[data-inline-editing]').evaluate((node) => {
          const rect = node.getBoundingClientRect(),
            save = node.querySelector('[data-inline-save]').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollHeight > innerHeight + 1,
            bottom: rect.bottom <= innerHeight,
            children: [...node.querySelectorAll('[data-inline-control]')].every((child) => {
              const box = child.getBoundingClientRect();
              return box.top >= rect.top && box.bottom <= rect.bottom;
            }),
            save: save.left >= 0 && save.bottom <= innerHeight,
          };
        });
        assert.deepEqual(geometry, {
          overflow: false,
          bottom: true,
          children: true,
          save: true,
        });
      }
    }
    if (screenshots) {
      await page.locator('#language-select').selectOption('en');
      await page.locator('#theme-select').selectOption(config.theme);
      await page.waitForFunction(
        () => document.querySelector('[data-inline-save]')?.getBoundingClientRect().left >= 0,
      );
      await page.screenshot({ path: path.join(root, 'docs/images/overview-inline-edit.png') });
    }
    await page.locator('[data-inline-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-inline-editing]'));
    assert.equal(
      (
        await json(await send('get', `/api/records?date=${date}&shift=day`))
      ).records[0].slots.find((slot) => slot.id === chosen).actual,
      0,
    );
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      storageState: await context.storageState(),
    });
    try {
      const phone = await touch.newPage();
      phone.on('pageerror', (error) => errors.push(error.message));
      await phone.goto(baseURL + '/overview');
      const otherDate = '2099-12-02';
      await phone.locator('#report-date').fill(otherDate);
      await phone.locator('#report-date').dispatchEvent('change');
      await phone.locator('[data-report-scope="night"]').click();
      const edit = phone.locator('[data-inline-open]').first();
      await edit.waitFor();
      await edit.tap();
      await phone.locator('[data-inline-actual]:enabled').waitFor();
      await phone.locator('[data-inline-actual]').fill('18');
      await phone.route('**/api/entry/records/*', (route) => route.abort('failed'), {
        times: 1,
      });
      await phone.locator('[data-inline-save]').tap();
      await phone.waitForFunction(
        () => document.querySelector('[data-inline-save]')?.disabled === false,
      );
      assert.equal(await phone.locator('[data-inline-actual]').inputValue(), '18');
      await phone.locator('[data-inline-save]').tap();
      await phone.waitForFunction(() => !document.querySelector('[data-inline-editing]'));
      const night = await json(await send('get', `/api/records?date=${otherDate}&shift=night`));
      assert.equal(night.records[0].slots[0].actual, 18);
      assert.equal(
        (
          await json(await send('get', `/api/records?date=${date}&shift=day`))
        ).records[0].slots.find((slot) => slot.id === chosen).actual,
        0,
      );
      record(
        'Touch entry works without hover; global date/night-shift filters provide the fixed editing context; retry preserves the original production date and shift',
      );
    } finally {
      await touch.close();
    }
    record(
      'Conflicting concurrent edits retain input; fullscreen and language changes retain the draft, zero is valid, and controls stay visible without desktop page scrolling',
    );
  } finally {
    await context.close();
  }
}
