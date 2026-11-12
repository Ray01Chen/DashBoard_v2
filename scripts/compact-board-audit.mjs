/** Test the requested line counts against actual saved configuration. No test
 * data is injected into the app: production records go through the normal API. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { allocateDailyTarget } from '../public/production-targets.js';

export async function auditCompactBoard({
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
  // Saved retired units remain visible by design. Use a different production
  // date from the preceding history/stress scenes so counts are independent.
  const date = '2099-12-02',
    clock = Date.parse(date + 'T10:05:00+07:00');
  await page.clock.install({ time: clock });
  await page.route('**/api/records?*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), serverTime: await page.evaluate(() => Date.now()) },
    });
  });
  const sizes = [
    [1920, 1080],
    [1600, 900],
    [1366, 768],
  ];
  const model = 'ECD17020037-HPRV2-12KW';
  let lastLines;
  async function setLines(count) {
    const config = await readConfig(),
      lines = Array.from({ length: count }, (_, i) => 'CD' + (303 + i));
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
        dailyTarget: 600,
        staffing: { day: [], night: [], owners: [] },
      })),
      rows: lines.map((line, i) => ({
        id: `new-compact-${count}-${i}`,
        line,
        model,
        station: 'Pack',
        job: 'PD',
        active: true,
        hasOutput: true,
      })),
      schedules: {
        day: [
          { id: 'c1', kind: 'production', start: '07:40', end: '08:00' },
          { id: 'c2', kind: 'production', start: '08:00', end: '09:00' },
          { id: 'c3', kind: 'production', start: '09:00', end: '10:00' },
          { id: 'cb', kind: 'break', start: '10:00', end: '10:10' },
          { id: 'c4', kind: 'production', start: '10:10', end: '11:00' },
        ],
        night: [{ id: 'cn', kind: 'production', start: '19:00', end: '20:00' }],
      },
    });
    // Match the reference scene with line-specific breaks and one ended shift.
    for (const [index, line] of lines.entries()) {
      if ([2, 5, 6].includes(index))
        config.lineSchedules[line] = {
          day: [
            ...config.schedules.day.slice(0, 2),
            { id: 'cx', kind: 'production', start: '09:00', end: '11:00' },
            { id: 'cxb', kind: 'break', start: '11:00', end: '11:10' },
            { id: 'cx4', kind: 'production', start: '11:10', end: '12:00' },
          ],
          night: config.schedules.night,
        };
      if (index === 1)
        config.lineSchedules[line] = {
          day: config.schedules.day.slice(0, 1),
          night: config.schedules.night,
        };
    }
    const half = Math.ceil(count / 2);
    Object.assign(config.monitoring, {
      refreshSeconds: count === 7 ? 30 : 3600,
      pageRotateSeconds: 0,
      rules: [],
      groups: [
        { id: 'compact-first', name: '1F', lines: lines.slice(0, half) },
        ...(count > 1 ? [{ id: 'compact-second', name: '2F', lines: lines.slice(half) }] : []),
      ],
      unified: {
        performance: { enabled: true, green: 95, red: 85 },
        completion: { enabled: true, green: 105, red: 125 },
        reporting: { enabled: true, graceMinutes: 10, redAfterMinutes: 40 },
      },
    });
    const response = await context.request.put(baseURL + '/api/config', { data: config });
    assert.equal(response.status(), 200, await response.text());
    lastLines = lines;
    return response.json();
  }
  const displayed = () => page.locator('#line-cards .production-line').allTextContents();
  async function ready() {
    await page.waitForFunction(() => {
      const list = document.querySelector('#line-cards'),
        style = getComputedStyle(list);
      const gap = parseFloat(style.rowGap),
        height = parseFloat(style.getPropertyValue('--monitor-row-height'));
      const capacity = document.body.classList.contains('fullscreen-board')
        ? Math.min(7, Math.max(1, Math.floor((list.clientHeight + gap) / (height + gap))))
        : 7;
      return (
        list.querySelectorAll('.line-card').length ===
        Math.min(
          capacity,
          Number(
            document.querySelector('[data-alert-filter="all"] [data-status-count]').textContent,
          ),
        )
      );
    });
  }
  async function checkLayout(fullscreen) {
    const report = await page.evaluate(() => {
      const list = document.querySelector('#line-cards'),
        style = getComputedStyle(list),
        box = list.getBoundingClientRect();
      const gap = parseFloat(style.rowGap),
        row = parseFloat(style.getPropertyValue('--monitor-row-height'));
      return {
        capacity: Math.min(7, Math.max(1, Math.floor((list.clientHeight + gap) / (row + gap)))),
        filled:
          Math.abs(list.lastElementChild.getBoundingClientRect().bottom - box.bottom) <= 1,
        uniform: [...list.children].every(
          (card) =>
            Math.abs(
              card.getBoundingClientRect().height -
                list.firstElementChild.getBoundingClientRect().height,
            ) <= 1,
        ),
        vertical: document.documentElement.scrollHeight > innerHeight + 1,
        horizontal: document.documentElement.scrollWidth > innerWidth + 1,
        cards: [...list.querySelectorAll('.line-card')].map((card) => {
          const rect = card.getBoundingClientRect();
          const parts = [
            '.line-card-top',
            '.line-health',
            '.line-card-values',
            '.line-trend',
            '.health-period',
            '.line-card-status',
          ];
          return {
            height: rect.height,
            inside: rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
            bounds: parts.every((selector) => {
              const r = card.querySelector(selector).getBoundingClientRect();
              return (
                r.left >= rect.left &&
                r.right <= rect.right + 1 &&
                r.top >= rect.top &&
                r.bottom <= rect.bottom + 1
              );
            }),
            horizontal: parts.every((selector) => {
              const r = card.querySelector(selector).getBoundingClientRect();
              return r.top >= rect.top && r.bottom <= rect.bottom;
            }),
          };
        }),
      };
    });
    assert.equal(report.horizontal, false, JSON.stringify(report));
    assert.ok(
      report.cards.every((card) => card.bounds && card.height >= 92),
      JSON.stringify(report),
    );
    if (fullscreen) {
      assert.equal(report.vertical, false, JSON.stringify(report));
      assert.equal(report.filled, true, JSON.stringify(report));
      assert.equal(report.uniform, true, JSON.stringify(report));
      assert.ok(
        report.cards.every((card) => card.inside),
        JSON.stringify(report),
      );
    }
    return fullscreen ? report.capacity : 7;
  }
  const matrix = [];
  for (const count of [1, 3, 5, 7, 8, 15, 21]) {
    const saved = await setLines(count);
    if (count === 7) {
      for (const [index, line] of lastLines.entries()) {
        const row = saved.rows.find((r) => r.line === line && r.active),
          slots = allocateDailyTarget(saved, 600, line);
        const response = await context.request.put(baseURL + '/api/records/' + row.id, {
          data: {
            date,
            shift: 'day',
            version: 0,
            configVersion: saved.version,
            entryMode: true,
            editTargets: true,
            slots: slots
              .filter((s) => s.shift === 'day')
              .map((slot) => ({
                id: slot.id,
                target: slot.target,
                actual: [3, 4].includes(index)
                  ? null
                  : Math.round(slot.target * [0, 0.22, 0.9, 0, 0, 1, 1][index]),
                issue: '',
              })),
          },
        });
        assert.equal(response.status(), 200, await response.text());
      }
    }
    await page.goto(baseURL + '/overview');
    await page.locator('body.authenticated').waitFor();
    await page.locator('#report-date').fill(date);
    await page.locator('#report-date').dispatchEvent('change');
    await page.locator('[data-report-scope="day"]').click();
    for (const language of ['zh', 'en', 'th']) {
      await page.locator('#language-select').selectOption(language);
      for (const full of [false, true]) {
        if (full) await page.locator('#enter-fullscreen').click();
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          await page.locator('[data-group=""]').click();
          await ready();
          const capacity = await checkLayout(full);
          const seen = [];
          for (let i = 0; i < Math.ceil(count / capacity); i++) {
            assert.deepEqual(
              await displayed(),
              lastLines.slice(i * capacity, (i + 1) * capacity),
            );
            seen.push(...(await displayed()));
            if (i + 1 < Math.ceil(count / capacity))
              await page.locator('[data-page-next]').click();
          }
          assert.deepEqual(seen, lastLines);
          assert.equal(await page.locator('[data-page-next]').isDisabled(), true);
          if (full && width === 1920 && count >= 7) assert.equal(capacity, 7);
          matrix.push({ count, language, full, width, height, capacity });
          if (
            screenshots &&
            full &&
            [1, 3, 5].includes(count) &&
            language === 'zh' &&
            width === 1920
          ) {
            while (!(await page.locator('[data-page-prev]').isDisabled()))
              await page.locator('[data-page-prev]').click();
            await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
            await page.screenshot({
              path: path.join(root, `docs/images/fullscreen-adaptive-${count}.png`),
            });
          }
          if (screenshots && full && count === 7 && language === 'zh') {
            while (!(await page.locator('[data-page-prev]').isDisabled()))
              await page.locator('[data-page-prev]').click();
            await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
            await page.mouse.move(0, 0);
            await page.screenshot({
              path: path.join(root, `docs/images/fullscreen-${width}.png`),
            });
          }
        }
        if (full) await page.locator('#exit-fullscreen').click();
      }
    }
  }
  record(
    '126 real-browser cases cover 1/3/5/7/8/15/21 lines, three languages, ordinary/fullscreen and 1920×1080/1600×900/1366×768; adaptive pages preserve every line in order with no fullscreen scrolling',
  );
  // Test all saved themes using the real options, with both display modes.
  await page.setViewportSize({ width: 1920, height: 1080 });
  const themes = await page
    .locator('#theme-select option')
    .evaluateAll((nodes) => nodes.map((node) => node.value));
  for (const theme of themes) {
    await page.locator('#theme-select').selectOption(theme);
    for (const scope of ['interval', 'day']) {
      await page.locator(`.line-dashboard-heading [data-metric-scope="${scope}"]`).click();
      await page.locator('#enter-fullscreen').click();
      await page.locator('[data-group=""]').click();
      await ready();
      await checkLayout(true);
      await page.locator('#exit-fullscreen').click();
    }
  }
  const configured = await readConfig();
  configured.monitoring.pageRotateSeconds = 5;
  let response = await context.request.put(baseURL + '/api/config', { data: configured });
  assert.equal(response.status(), 200, await response.text());
  await page.reload();
  await page.locator('#enter-fullscreen').click();
  await page.locator('[data-group=""]').click();
  await ready();
  await page.evaluate(() => {
    window.__boardNodes = [
      '#line-dashboard',
      '#group-summary',
      '#monitor-status-filters',
      '#group-trend svg',
      '#board-pagination [data-page-next]',
    ].map((selector) => document.querySelector(selector));
  });
  await page.locator('[data-page-next]').click();
  const manual = await displayed();
  await page.clock.runFor(4000);
  assert.deepEqual(await displayed(), manual);
  await page.clock.runFor(2000);
  assert.notDeepEqual(await displayed(), manual);
  assert.equal(
    await page.evaluate(() =>
      window.__boardNodes.every(
        (node, i) =>
          node ===
          document.querySelector(
            [
              '#line-dashboard',
              '#group-summary',
              '#monitor-status-filters',
              '#group-trend svg',
              '#board-pagination [data-page-next]',
            ][i],
          ),
      ),
    ),
    true,
    'Page flips retain dashboard, charts, filters and focused pager nodes',
  );
  await page.locator('[data-board-rotation]').click();
  const paused = await displayed();
  await page.clock.runFor(15000);
  assert.deepEqual(await displayed(), paused);
  await page.locator('[data-page-prev]').click();
  const selected = await displayed();
  await page.clock.runFor(10000);
  assert.deepEqual(await displayed(), selected);
  await page.locator('[data-board-rotation]').click();
  await page.clock.runFor(4000);
  assert.deepEqual(await displayed(), selected);
  await page.clock.runFor(2000);
  assert.notDeepEqual(await displayed(), selected);
  await page.locator('[data-board-rotation]').click();
  await page.locator('#refresh-now').click();
  assert.equal(
    await page.locator('[data-board-rotation]').getAttribute('aria-pressed'),
    'true',
  );
  await page.locator('[data-group="compact-second"]').click();
  assert.deepEqual(await displayed(), lastLines.slice(11, 18));
  await page.locator('[data-alert-filter="green"]').click();
  assert.equal(await page.locator('#line-cards .line-card').count(), 0);
  await page.locator('[data-alert-filter="all"]').click();
  await page.locator('[data-report-scope="night"]').click();
  await ready();
  await page.locator('[data-report-scope="all"]').click();
  await ready();
  await page.locator('[data-group=""]').click();
  await page.locator('.board-display-options summary').click();
  await page.locator('#board-show-trend').check();
  await page.locator('#board-show-share').check();
  await page.locator('.board-display-options summary').click();
  await ready();
  await checkLayout(true);
  const plot = await page.locator('#group-trend').evaluate((node) => {
    const svg = node.querySelector('svg'),
      box = node.getBoundingClientRect();
    return {
      matches: Math.abs(svg.getBoundingClientRect().height - svg.viewBox.baseVal.height) <= 1,
      labelsFit: [...svg.querySelectorAll('text')].every((label) => {
        const rect = label.getBoundingClientRect();
        return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1;
      }),
    };
  });
  assert.equal(plot.matches, true);
  assert.equal(plot.labelsFit, true);
  await page.locator('#line-cards .line-card').first().locator('[data-line-expand]').click();
  assert.equal(await page.locator('#line-detail-dialog').isVisible(), true);
  assert.equal(
    await page.locator('#line-detail-dialog [data-detail-alert-list]').isVisible(),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    true,
  );
  await page.locator('[data-close-line-dialog]').click();
  record(
    'All five themes retain compact cards; auto/manual paging, explicit pause/resume, full manual dwell, stable dashboard nodes, filters, live refresh, optional charts and fullscreen alert details work without page scrolling',
  );
  await page.locator('.board-display-options summary').click();
  await page.locator('#board-show-trend').uncheck();
  await page.locator('#board-show-share').uncheck();
  await page.locator('.board-display-options summary').click();
  await page.locator('[data-group=""]').click();
  await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
  const viewport = page.locator('#monitor-card-viewport');
  let apiCalls = 0;
  const countRequests = (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls++;
  };
  page.on('request', countRequests);
  await page.locator('[data-page-next]').click();
  assert.equal(await viewport.getAttribute('data-page-direction'), 'next');
  assert.equal(await viewport.locator('.carousel-snapshot').count(), 1);
  assert.equal(
    await viewport
      .locator('.carousel-snapshot')
      .evaluate((node) => node.inert && node.getAttribute('aria-hidden') === 'true'),
    true,
  );
  const motion = await page.locator('#line-cards').evaluate((node) => {
    const animation = node.getAnimations()[0];
    window.__pageMotion = animation;
    return {
      duration: animation.effect.getTiming().duration,
      frames: animation.effect.getKeyframes().map((frame) => frame.transform),
    };
  });
  assert.equal(motion.duration, 600);
  assert.match(motion.frames[0], /100%/);
  await page.waitForTimeout(180);
  assert.equal(
    await page.locator('#line-cards').evaluate((node) => {
      const opacity = +getComputedStyle(node).opacity;
      return opacity > 0 && opacity < 1;
    }),
    true,
  );
  assert.equal(apiCalls, 0, 'A page flip never requests production data');
  // A real refresh during a slide must update values without replacing/replaying it.
  await page.locator('#refresh-now').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-now').disabled);
  assert.equal(
    await page
      .locator('#line-cards')
      .evaluate(
        (node) =>
          !node.getAnimations().length || node.getAnimations()[0] === window.__pageMotion,
      ),
    true,
  );
  await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
  assert.equal(await viewport.locator('.carousel-snapshot').count(), 0);
  await page.locator('[data-page-prev]').click();
  assert.equal(await viewport.getAttribute('data-page-direction'), 'previous');
  await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
  await page.locator('[data-page-next]').click();
  await page.locator('[data-page-next]').click();
  assert.equal(
    await viewport.locator('.carousel-snapshot').count(),
    1,
    'Rapid input cancels and replaces one motion layer',
  );
  await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
  // This is the final page: the next automatic wrap is still a leftward slide.
  await viewport.evaluate((node) => {
    window.__wrapDirections = [];
    window.__wrapObserver = new MutationObserver(() => {
      if (node.dataset.pageDirection) window.__wrapDirections.push(node.dataset.pageDirection);
    });
    window.__wrapObserver.observe(node, {
      attributes: true,
      attributeFilter: ['data-page-direction'],
    });
  });
  await page.locator('[data-board-rotation]').click();
  await page.clock.runFor(6000);
  assert.equal(await page.evaluate(() => window.__wrapDirections.includes('next')), true);
  await page.evaluate(() => window.__wrapObserver.disconnect());
  assert.deepEqual(await displayed(), lastLines.slice(0, 7));
  await page.locator('[data-board-rotation]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.is-page-moving'));
  await page.locator('[data-page-next]').click();
  assert.equal(await viewport.locator('.carousel-snapshot').count(), 0);
  assert.equal(
    await page.locator('#line-cards').evaluate((node) => node.getAnimations().length),
    0,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-page-prev]').click();
  await page.locator('[data-group="compact-second"]').click();
  assert.equal(
    await viewport.locator('.carousel-snapshot').count(),
    0,
    'Filtering cancels obsolete page motion',
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    true,
  );
  page.off('request', countRequests);
  record(
    '600ms directional slide/fade uses one inert snapshot, cleans up after rapid input, wraps forward, honors reduced motion, never fetches on page flips, and does not replay during data refresh',
  );
  // Drain any timer-triggered route before disposing its response context.
  await page.unrouteAll({ behavior: 'wait' });
  await session.close();
  return matrix;
}
