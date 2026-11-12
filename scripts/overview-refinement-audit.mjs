/** Shared-grid and display preferences checks use a unique production date,
 * leaving the preceding history/carousel fixtures intact. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function auditOverviewRefinement({
  browser,
  context,
  baseURL,
  readConfig,
  record,
  errors,
  root,
  screenshots,
}) {
  const session = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await session.request.post(baseURL + '/api/auth/login', {
    data: { username: 'manager', password: 'manager' },
  });
  const page = await session.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const date = '2099-12-03',
    clock = Date.parse(date + 'T09:30:00+07:00');
  await page.clock.install({ time: clock });
  await page.route('**/api/records?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), serverTime: await page.evaluate(() => Date.now()) },
    });
  });
  const config = await readConfig();
  const lines = Array.from({ length: 15 }, (_, i) => 'CD' + (303 + i));
  const models = [
    'ECD17020037-HPRV2-12KW',
    'MODEL',
    'ECD99999999-' + 'LongProductName'.repeat(4).slice(0, 48),
  ];
  Object.assign(config, {
    lines,
    models,
    jobs: ['PD'],
    stations: ['Pack'],
    personnel: [],
    scheduleTemplates: [],
    lineSchedules: {},
    productionUnits: lines.map((line, i) => ({
      line,
      model: models[i % models.length],
      dailyTarget: 600000,
      staffing: { day: [], night: [], owners: [] },
    })),
    rows: lines.map((line, i) => ({
      id: 'new-refined-' + i,
      line,
      model: models[i % models.length],
      job: 'PD',
      station: 'Pack',
      active: true,
      hasOutput: true,
    })),
    schedules: {
      day: [
        { id: 'grid-ended', kind: 'production', start: '08:00', end: '09:00' },
        { id: 'grid-active', kind: 'production', start: '09:00', end: '11:00' },
      ],
      night: [{ id: 'grid-night', kind: 'production', start: '20:00', end: '21:00' }],
    },
  });
  Object.assign(config.monitoring, {
    refreshSeconds: 3600,
    pageRotateSeconds: 0,
    rules: [],
    groups: [1, 5, 7].map((count) => ({
      id: 'refined-' + count,
      name: count + ' lines',
      lines: lines.slice(0, count),
    })),
    unified: {
      performance: { enabled: true, green: 95, red: 85 },
      completion: { enabled: true, green: 100, red: 110 },
      reporting: { enabled: true, graceMinutes: 10, redAfterMinutes: 40 },
    },
  });
  let response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  const saved = await response.json();
  const versions = new Map();
  async function saveValues(large) {
    for (const [index, line] of lines.entries()) {
      const row = saved.rows.find((row) => row.line === line && row.active);
      const pair = large
        ? [
            [1000, 0],
            [1234, 1234],
            [12345, 1234],
            [123456, 234567],
            [999999, 100000],
            [1000, 9999],
            [999999, 0],
          ][index % 7]
        : [200, 190];
      const result = await context.request.put(baseURL + '/api/records/' + row.id, {
        data: {
          date,
          shift: 'day',
          version: versions.get(row.id) || 0,
          configVersion: saved.version,
          entryMode: true,
          editTargets: true,
          slots: saved.schedules.day.map((slot) => ({
            id: slot.id,
            target: pair[0],
            actual: pair[1],
            issue: '',
          })),
        },
      });
      assert.equal(result.status(), 200, await result.text());
      versions.set(row.id, (await result.json()).version);
    }
  }
  async function settle() {
    // Compare resting shared columns; a restored hover reveal intentionally
    // offsets only the row under the pointer while its 200ms transition runs.
    await page.mouse.move(0, 0);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#line-cards .line-card')].every(
        (card) => getComputedStyle(card).transform === 'none',
      ),
    );
    await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
    await page.evaluate(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  }
  async function geometry() {
    return page.locator('#line-cards').evaluate((list) =>
      [...list.querySelectorAll('.line-card')].map((card) => {
        const row = card.getBoundingClientRect();
        const selectors = [
          '.production-line',
          '.line-health',
          '.line-severity',
          '.signal-lamp',
          '.severity-badge',
          '.production-state',
          '.line-card-values',
          '.line-trend',
          '.health-period',
          '.line-card-status',
        ];
        const boxes = Object.fromEntries(
          selectors.map((selector) => {
            const r = card.querySelector(selector).getBoundingClientRect();
            return [selector, { x: r.x, y: r.y - row.y, width: r.width, height: r.height }];
          }),
        );
        const values = [...card.querySelectorAll('.line-card-values b')].map((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect(),
            box = node.getBoundingClientRect();
          return {
            full: node.title,
            text: node.textContent,
            x: box.x,
            right: box.right,
            width: box.width,
            font: parseFloat(getComputedStyle(node).fontSize),
            tabular: getComputedStyle(node).fontVariantNumeric.includes('tabular-nums'),
            fits: rect.left >= box.left - 1 && rect.right <= box.right + 1,
          };
        });
        return {
          boxes,
          values,
          height: row.height,
          grid: getComputedStyle(card).gridTemplateColumns,
        };
      }),
    );
  }
  function verifyShared(rows) {
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.grid, rows[0].grid);
      assert.ok(Math.abs(row.height - rows[0].height) <= 1);
      for (const [key, box] of Object.entries(row.boxes)) {
        const first = rows[0].boxes[key];
        for (const dimension of [
          'x',
          'y',
          ...(['.line-severity', '.severity-badge', '.production-state'].includes(key)
            ? []
            : ['width']),
        ])
          assert.ok(
            Math.abs(box[dimension] - first[dimension]) <= 1,
            JSON.stringify({ key, dimension, box, first }),
          );
      }
      row.values.forEach((value, index) => {
        assert.ok(value.fits, JSON.stringify(row));
        assert.equal(value.font, 22);
        assert.equal(value.tabular, true);
        assert.ok(Math.abs(value.x - rows[0].values[index].x) <= 1);
        assert.ok(Math.abs(value.right - rows[0].values[index].right) <= 1);
      });
    }
  }
  await saveValues(false);
  await page.goto(baseURL + '/overview');
  await page.locator('body.authenticated').waitFor();
  await page.locator('#report-date').fill(date);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-report-scope="day"]').click();
  await page.locator('#language-select').selectOption('en');
  const baselines = new Map();
  const sizes = [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ];
  for (const full of [false, true]) {
    if (full) await page.locator('#enter-fullscreen').click();
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-group=""]').click();
      await settle();
      const rows = await geometry();
      verifyShared(rows);
      baselines.set(`${full}/${width}`, rows[0].boxes['.line-trend']);
    }
    if (full) await page.locator('#exit-fullscreen').click();
  }
  await saveValues(true);
  await page.locator('#refresh-now').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-now').disabled);
  for (const language of ['zh', 'en', 'th']) {
    await page.locator('#language-select').selectOption(language);
    for (const full of [false, true]) {
      if (full) await page.locator('#enter-fullscreen').click();
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.locator('[data-group=""]').click();
        await settle();
        const rows = await geometry();
        verifyShared(rows);
        const graph = rows[0].boxes['.line-trend'],
          baseline = baselines.get(`${full}/${width}`);
        assert.ok(
          Math.abs(graph.x - baseline.x) <= 1 &&
            graph.width >= baseline.width - 1 &&
            graph.height >= baseline.height - 1,
          JSON.stringify({ graph, baseline }),
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (full)
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
            false,
          );
        if (width === 1366)
          assert.ok(
            rows.some((row) =>
              row.values.some(
                (value) => /123,456/.test(value.full) && value.text === value.full,
              ),
            ),
          );
      }
      if (full) await page.locator('#exit-fullscreen').click();
    }
  }
  // Check the 999.9% boundary and the exact values behind compact text.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('[data-group="refined-7"]').click();
  await settle();
  assert.equal(
    (await page.locator('#line-cards [data-achievement][title="999.9%"]').count()) > 0,
    true,
  );
  const lamp = await page.locator('#line-cards .signal-lamp').first().boundingBox();
  assert.equal(lamp.width, 14);
  assert.equal(lamp.height, 14);
  record(
    'Shared columns, field positions, right-aligned tabular numbers and unchanged trend geometry hold for six-digit/signed values, 0–999.9% rates, long models/reasons, three languages and five desktop/phone sizes in both modes',
  );

  // UI preferences are browser-only: saving/hiding/restoring must not write CONFIG.
  await page.locator('#enter-fullscreen').click();
  await settle();
  const before = await readConfig();
  let writes = 0;
  const watch = (request) => {
    if (/\/api\//.test(request.url()) && !['GET', 'HEAD'].includes(request.method())) writes++;
  };
  page.on('request', watch);
  const menu = page.locator('.board-display-options');
  const toggle = (key) => menu.locator(`[data-board-display="${key}"]`);
  const beforeHeight = await page
    .locator('#monitor-card-viewport')
    .evaluate((node) => node.clientHeight);
  await menu.locator('summary').click();
  for (const key of ['group', 'alerts', 'filters', 'header', 'carousel'])
    await toggle(key).uncheck();
  await settle();
  for (const selector of [
    '#group-summary',
    '.monitor-summary',
    '.filter-bar',
    '#group-tabs',
    '.topbar',
    '#board-pagination',
  ])
    assert.equal(await page.locator(selector).isVisible(), false, selector);
  assert.equal(await menu.locator('summary').isVisible(), true);
  assert.equal(await page.locator('#exit-fullscreen').isVisible(), true);
  assert.ok(
    (await page.locator('#monitor-card-viewport').evaluate((node) => node.clientHeight)) >
      beforeHeight + 80,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
    false,
  );
  const persisted = await page.evaluate(() => localStorage.getItem('bp-board-display'));
  await page.locator('#exit-fullscreen').click();
  assert.equal(await page.locator('.topbar').isVisible(), true);
  assert.equal(await page.locator('.filter-bar').isVisible(), true);
  await page.locator('#enter-fullscreen').click();
  assert.equal(await page.locator('.topbar').isVisible(), false);
  await page.reload();
  await page.locator('body.authenticated').waitFor();
  await page.locator('#enter-fullscreen').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('bp-board-display')), persisted);
  assert.equal(await page.locator('#group-summary').isVisible(), false);
  await menu.locator('summary').click();
  assert.equal(await toggle('header').isChecked(), false);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('open'), null);
  assert.equal(
    await page.locator('body').evaluate((node) => node.classList.contains('fullscreen-board')),
    true,
  );
  await menu.locator('summary').click();
  await page.locator('[data-board-display-reset]').click();
  await settle();
  for (const key of ['group', 'alerts', 'filters', 'header', 'carousel'])
    assert.equal(await toggle(key).isChecked(), true);
  assert.equal(await toggle('trend').isChecked(), false);
  assert.equal(await page.locator('.topbar').isVisible(), true);
  assert.equal((await readConfig()).version, before.version);
  assert.equal(writes, 0);
  page.off('request', watch);
  await menu.locator('summary').click();
  for (const count of [1, 5, 7, 15]) {
    await page.locator(`[data-group="${count === 15 ? '' : 'refined-' + count}"]`).click();
    await settle();
    verifyShared(await geometry());
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
      false,
    );
  }
  const themes = await page
    .locator('#theme-select option')
    .evaluateAll((nodes) => nodes.map((node) => node.value));
  for (const theme of themes) {
    await page.locator('#theme-select').selectOption(theme);
    verifyShared(await geometry());
  }
  // Desktop zoom changes both the CSS viewport and pixel density. Keep the
  // shared-column assertions at each equivalent browser zoom level.
  const zoomSession = await session.newCDPSession(page);
  for (const zoom of [0.8, 1.25, 1.5]) {
    const viewport = { width: Math.round(1600 / zoom), height: Math.round(900 / zoom) };
    await page.setViewportSize(viewport);
    await zoomSession.send('Emulation.setDeviceMetricsOverride', {
      ...viewport,
      deviceScaleFactor: zoom,
      mobile: false,
    });
    await settle();
    verifyShared(await geometry());
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
      false,
    );
  }
  await zoomSession.send('Emulation.clearDeviceMetricsOverride');
  await zoomSession.detach();
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  await menu.locator('summary').click();
  const panel = await page.locator('.board-display-panel').boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 391, JSON.stringify(panel));
  assert.ok(panel.y >= 0 && panel.y + panel.height <= 845, JSON.stringify(panel));
  await page.locator('[data-board-display-reset]').click();
  await page.reload();
  await page.locator('body.authenticated').waitFor();
  await page.locator('#enter-fullscreen').click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await settle();
  await menu.locator('summary').click();
  for (const key of ['group', 'alerts', 'filters', 'header', 'carousel'])
    assert.equal(await toggle(key).isChecked(), true);
  await menu.locator('summary').click();
  if (screenshots) {
    await page.locator('#theme-select').selectOption('delta');
    await page.locator('#language-select').selectOption('zh');
    await page.locator('[data-group="refined-7"]').click();
    await settle();
    await page.screenshot({ path: path.join(root, 'docs/images/shared-grid-numbers.png') });
    await menu.locator('summary').click();
    await page.screenshot({
      path: path.join(root, 'docs/images/fullscreen-display-options.png'),
    });
  }
  record(
    'Fullscreen section toggles persist across exit/re-entry and reload, recover available card height, keep settings/exit reachable, restore defaults, preserve normal mode and never write production CONFIG',
  );
  await page.unrouteAll({ behavior: 'wait' });
  await session.close();
}
