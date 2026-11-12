import assert from 'node:assert/strict';
import path from 'node:path';

/** Use the real site/session/config/batch APIs; no DOM-injected production data. */
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
  const waitRows = () => page.locator('[data-overview-panel] tbody tr').first().waitFor();
  const cell = (id, field) =>
    page.locator(`[data-editor-row="${id}"][data-editor-field="${field}"]`);
  const report = (date, shift = 'day') =>
    send('get', `/api/records?date=${date}&shift=${shift}`).then(json);
  try {
    await page.goto(baseURL + '/overview');
    await page.locator('#login-username').fill('manager');
    await page.locator('#login-password').fill('manager');
    await page.locator('#login-submit').click();
    await page.locator('body.authenticated').waitFor();
    assert.equal(await page.locator('[data-nav-trigger]').count(), 5);
    const management = page.locator('[data-nav-trigger="management"]');
    await management.hover();
    await page.locator('#nav-management-menu:popover-open').waitFor();
    const before = await page.locator('[data-nav-trigger="help"]').boundingBox();
    await page.locator('#nav-management-menu').hover();
    assert.equal(await page.locator('[data-view="sites"]').isVisible(), true);
    assert.deepEqual(await page.locator('[data-nav-trigger="help"]').boundingBox(), before);
    await page.locator('[data-view="users"]').click();
    await page.waitForFunction(() => location.pathname === '/administration/users');
    assert.equal(await page.locator('#nav-management-menu:popover-open').count(), 0);
    assert.ok(
      await management.evaluate((node) =>
        node.closest('[data-nav-group]').classList.contains('active'),
      ),
    );
    await management.focus();
    await page.waitForTimeout(200);
    await management.press('ArrowRight');
    assert.equal(
      await page
        .locator('[data-view="sites"]')
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page.locator('[data-view="sites"]').press('Escape');
    assert.equal(await page.locator('#nav-management-menu:popover-open').count(), 0);
    await management.hover();
    await page.locator('#nav-management-menu:popover-open').waitFor();
    if (screenshots)
      await page.screenshot({
        path: path.join(root, 'docs/images/sidebar-management.png'),
        clip: { x: 0, y: 0, width: 530, height: 900 },
      });
    await page.goto(baseURL + '/overview');
    const site = (
      await json(
        await send('post', '/api/admin/sites', {
          site_code: 'OVERVIEW-QA',
          site_name: 'Overview editor QA',
        }),
        201,
      )
    ).site;
    await json(await send('post', '/api/auth/site', { siteId: site.id }));
    let config = await json(await send('get', '/api/config'));
    const lines = ['CD10', 'CD2', 'CD1'],
      stations = ['Input', 'Inspect', 'Test', 'Burn', 'Final', 'Pack'];
    Object.assign(config, {
      lines,
      models: ['Model-for-station-editor'],
      jobs: ['PD', 'IE'],
      stations,
      personnel: [],
      productionUnits: lines.map((line) => ({
        line,
        model: 'Model-for-station-editor',
        dailyTarget: 100,
        staffing: { day: [], night: [], owners: [] },
      })),
      rows: lines.flatMap((line) =>
        stations.map((station, index) => ({
          id: 'new-' + line + '-' + index,
          line,
          model: 'Model-for-station-editor',
          job: index % 2 ? 'IE' : 'PD',
          station,
          active: true,
          hasOutput: true,
        })),
      ),
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
    config.monitoring.unified = {
      performance: { enabled: false, green: 95, red: 85 },
      completion: { enabled: false, green: 100, red: 110 },
      reporting: { enabled: false, graceMinutes: 10, redAfterMinutes: 40 },
    };
    config = await json(await send('put', '/api/config', config));
    await page.reload();
    await page.locator('#line-cards .line-card').first().waitFor();
    const date = '2099-12-01';
    await page.locator('#report-date').fill(date);
    await page.locator('#report-date').dispatchEvent('change');
    await page.locator('#line-cards .line-card').first().waitFor();
    assert.equal(await page.locator('.topbar .personal-order-open').count(), 0);
    assert.equal(await page.locator('.filter-label[for="report-date"]').count(), 0);
    assert.equal(
      await page
        .locator('#metric-scope-controls')
        .evaluate((node) => !!node.closest('.filter-bar')),
      true,
    );
    assert.equal(await page.locator('#overview-operations #export').count(), 1);
    const controls = await page
      .locator('#overview-operations')
      .evaluate((node) =>
        [...node.querySelectorAll('.personal-order-open, #export, #enter-fullscreen')].map(
          (node) => ({ top: node.getBoundingClientRect().top, key: node.id || 'order' }),
        ),
      );
    assert.deepEqual(
      controls.map((item) => item.key),
      ['order', 'export', 'enter-fullscreen'],
    );
    assert.ok(controls.every((item) => Math.abs(item.top - controls[0].top) <= 1));
    await page.locator('#overview-operations .personal-order-open').click();
    await page.locator('#personal-order-panel:popover-open').waitFor();
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const orderRows = page.locator('.personal-order-items li'),
      first = await orderRows.first().locator('.order-handle').boundingBox(),
      last = await orderRows.last().boundingBox();
    await page.mouse.move(first.x + 12, first.y + 12);
    await page.mouse.down();
    await page.mouse.move(last.x + 55, last.y + last.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(
      () => !document.querySelector('.order-save-state').textContent.includes('…'),
    );
    await page.locator('[data-order-close]').click();
    await page.reload();
    assert.deepEqual(await page.locator('#line-cards .production-line').allTextContents(), [
      'CD2',
      'CD1',
      'CD10',
    ]);
    await page.locator('#report-date').fill(date);
    await page.locator('#report-date').dispatchEvent('change');
    await page.locator('#refresh-now:enabled').waitFor();
    record(
      'Five consistent navigation categories use unclipped pointer/keyboard flyouts without moving other items; toolbar rows align date/shift/metrics and line filters/order/export/fullscreen, and personal sorting still persists',
    );

    const card = page.locator('#line-cards .line-card').first();
    await card.locator('[data-line-expand]').click();
    await card.locator('.card-expanded-details:not([hidden])').waitFor();
    assert.match(await card.locator('.card-expanded-details').innerText(), /No current alerts/);
    assert.equal(
      await card
        .locator(
          '.card-expanded-details input, .card-expanded-details .line-trend, .card-expanded-details [data-metric]',
        )
        .count(),
      0,
    );
    await card.locator('[data-overview-edit]').click();
    await waitRows();
    assert.equal(await card.locator('.card-expanded-details').isVisible(), false);
    assert.equal(await card.locator('.line-card-values input').count(), 0);
    assert.equal(await card.locator('[data-overview-panel] tbody tr').count(), 6);
    assert.equal(
      await card
        .locator(
          '[data-inline-preset], [data-inline-field], [data-inline-actual], input[type="date"]',
        )
        .count(),
      0,
    );
    const unitRows = config.rows.filter((row) => row.line === 'CD2'),
      a = unitRows[0].id,
      b = unitRows[1].id,
      pack = unitRows.at(-1).id;
    await cell(a, 'actual').fill('12');
    await page.locator('[data-editor-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    assert.equal((await report(date)).records.length, 0);
    await card.locator('[data-overview-edit]').click();
    await waitRows();
    await page.locator('[data-editor-slot]').selectOption({ index: 0 });
    await waitRows();
    await cell(a, 'target').fill('17');
    await cell(a, 'actual').fill('12');
    await cell(a, 'issue').fill('Station input note');
    await cell(pack, 'target').fill('20');
    await cell(pack, 'actual').fill('19');
    const saveRequest = page.waitForRequest(
      (request) => request.url().endsWith('/api/entry/interval') && request.method() === 'PUT',
    );
    await page.locator('[data-editor-save]').click();
    const payload = (await saveRequest).postDataJSON();
    assert.equal(payload.date, date);
    assert.equal(payload.rows.length, 2);
    assert.deepEqual(
      Object.keys(payload.rows.find((row) => row.rowId === pack).values).sort(),
      ['actual', 'target'],
    );
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    const saved = await report(date),
      savedA = saved.records.find((row) => row.rowId === a),
      slot = savedA.slots.find((slot) => slot.start === '08:00');
    assert.equal(slot.actual, 12);
    assert.equal(slot.target, 17);
    assert.equal(slot.issue, 'Station input note');
    assert.equal(saved.records.length, 2);
    assert.equal(savedA.slots.find((slot) => slot.start === '09:00').actual, null);
    assert.equal(savedA.updatedBy, 'manager');
    await card.locator('[data-line-expand]').click();
    await card.locator('.card-expanded-details:not([hidden])').waitFor();
    assert.match(
      await card.locator('.card-expanded-details').innerText(),
      /Station input note/,
    );
    record(
      'Read-only cards retain metrics/trends while distinct alert-only and six-station editors open below; cancel writes nothing and batch save atomically submits only modified fields with existing audit metadata',
    );

    await card.locator('[data-overview-edit]').click();
    await waitRows();
    await cell(a, 'actual').fill('13');
    await cell(b, 'actual').fill('22');
    await json(
      await send('put', '/api/entry/records/' + b, {
        date,
        shift: 'day',
        configVersion: config.version,
        version: 0,
        stationEntry: true,
        slots: [{ id: slot.id, actual: 7 }],
      }),
    );
    const conflict = page.waitForResponse((response) =>
      response.url().endsWith('/api/entry/interval'),
    );
    await page.locator('[data-editor-save]').click();
    assert.equal((await conflict).status(), 409);
    await page.locator('[data-editor-save]:enabled').waitFor();
    assert.equal(await cell(a, 'actual').inputValue(), '13');
    assert.equal(
      (await report(date)).records
        .find((row) => row.rowId === a)
        .slots.find((item) => item.id === slot.id).actual,
      12,
    );
    await page.locator('[data-editor-slot]').selectOption({ index: 1 });
    await page.locator('#confirm-dialog[open]').waitFor();
    await page.locator('#confirm-no').click();
    assert.equal(await cell(a, 'actual').inputValue(), '13');
    await page.locator('[data-editor-slot]').selectOption({ index: 1 });
    await page.locator('#confirm-yes').click();
    await page.locator('[data-editor-save]:enabled').waitFor();
    assert.equal(await cell(a, 'actual').inputValue(), '');
    await cell(pack, 'actual').fill('0');
    await page.locator('[data-editor-save]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
    assert.equal(
      (await report(date)).records
        .find((row) => row.rowId === pack)
        .slots.find((slot) => slot.start === '09:00').actual,
      0,
    );
    record(
      'One changed station version rejects the entire multi-station transaction; inputs survive conflicts, slot changes require discard confirmation, zero is valid and other intervals remain untouched',
    );

    await card.locator('[data-overview-edit]').click();
    await waitRows();
    await cell(a, 'actual').fill('55');
    await page.locator('#enter-fullscreen').click();
    await page.locator('body.fullscreen-board').waitFor();
    for (const theme of await page
      .locator('#theme-select option')
      .evaluateAll((nodes) => nodes.map((node) => node.value))) {
      await page.locator('#theme-select').selectOption(theme);
      assert.equal(await cell(a, 'actual').inputValue(), '55');
    }
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1600, height: 900 },
      { width: 1366, height: 768 },
    ]) {
      await page.setViewportSize(size);
      for (const language of ['zh', 'en', 'th']) {
        await page.locator('#language-select').selectOption(language);
        assert.equal(await cell(a, 'actual').inputValue(), '55');
        assert.equal(
          await page.evaluate(
            () =>
              document.documentElement.scrollHeight > innerHeight + 1 ||
              document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
        assert.equal(
          await page
            .locator('[data-editor-save]')
            .evaluate((node) => node.getBoundingClientRect().bottom <= innerHeight),
          true,
        );
      }
    }
    await page.locator('#language-select').selectOption('en');
    await page.locator('#theme-select').selectOption(config.theme);
    await page
      .locator('[data-overview-panel]')
      .evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished)),
      );
    const panelGeometry = await page.locator('[data-overview-panel]').evaluate((node) => {
      const card = node.closest('.line-card'),
        box = card.getBoundingClientRect(),
        footer = node.querySelector('footer').getBoundingClientRect();
      return {
        footerInside: footer.bottom <= box.bottom + 1,
        belowCard:
          node.getBoundingClientRect().top >=
          Math.max(
            ...[
              ...card.querySelectorAll(
                '.line-card-top,.line-health,.line-card-values,.line-trend',
              ),
            ].map((part) => part.getBoundingClientRect().bottom),
          ),
      };
    });
    assert.deepEqual(panelGeometry, { footerInside: true, belowCard: true });
    if (screenshots)
      await page.screenshot({ path: path.join(root, 'docs/images/overview-inline-edit.png') });
    await page.locator('[data-editor-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
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
      await phone.locator('#report-date').fill('2099-12-02');
      await phone.locator('#report-date').dispatchEvent('change');
      await phone.locator('[data-report-scope="night"]').click();
      await phone.locator('[data-overview-edit]').first().tap();
      await phone.locator('[data-overview-panel] tbody tr').first().waitFor();
      const input = phone.locator(`[data-editor-row="${a}"][data-editor-field="actual"]`);
      await input.fill('18');
      await phone.route('**/api/entry/interval', (route) => route.abort('failed'), {
        times: 1,
      });
      await phone.locator('[data-editor-save]').tap();
      await phone.locator('[data-editor-save]:enabled').waitFor();
      assert.equal(await input.inputValue(), '18');
      await phone.locator('[data-editor-save]').tap();
      await phone.waitForFunction(() => !document.querySelector('[data-overview-panel]'));
      assert.equal(
        (await report('2099-12-02', 'night')).records.find((row) => row.rowId === a).slots[0]
          .actual,
        18,
      );
      assert.equal(
        await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
      );
    } finally {
      await touch.close();
    }
    record(
      'Fullscreen, five themes, three languages and common desktop sizes retain six-station drafts and reachable save controls without page scrolling; touch and network retry preserve captured date/shift/site',
    );
  } finally {
    await context.close();
  }
}
