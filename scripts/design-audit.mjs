/** A reproducible, isolated reference scene plus cross-page design checks.
 * Uses the smoke test's temporary server/session; no second setup or real data. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { allocateDailyTarget } from '../public/production-targets.js';

export async function auditDesign({
  browser,
  context,
  baseURL,
  readConfig,
  record,
  root,
  screenshots,
  errors,
}) {
  const config = await readConfig();
  const lines = Array.from({ length: 7 }, (_, index) => 'CD' + (303 + index));
  const models = [
    'ECD17020037-HPRV2-12KW',
    'ECD16010094-ORV3-PSU-3KW',
    'ECD16010094-ORV3-PSU-3KW-AutoLine',
    'ECD16010094-ORV3-PSU-3KW-AutoLine',
    'ECD27010006-CBU',
    'ECD27010007-CBU',
    'ECD27010008-CBU',
  ];
  Object.assign(config, {
    lines,
    models: [...new Set(models)],
    jobs: ['PD'],
    stations: ['Pack'],
    personnel: [],
    scheduleTemplates: [],
    lineSchedules: {},
    productionUnits: lines.map((line, index) => ({
      line,
      model: models[index],
      dailyTarget: 600,
      staffing: { day: [], night: [], owners: [] },
    })),
    rows: lines.map((line, index) => ({
      id: 'new-design-' + index,
      line,
      model: models[index],
      station: 'Pack',
      job: 'PD',
      active: true,
      hasOutput: true,
    })),
    schedules: {
      day: [
        { id: 'p1', kind: 'production', start: '07:40', end: '08:00' },
        { id: 'p2', kind: 'production', start: '08:00', end: '09:00' },
        { id: 'p3', kind: 'production', start: '09:00', end: '10:00' },
        { id: 'b1', kind: 'break', start: '10:00', end: '10:10' },
        { id: 'p4', kind: 'production', start: '10:10', end: '11:00' },
        { id: 'p5', kind: 'production', start: '11:00', end: '12:00' },
      ],
      night: [{ id: 'n1', kind: 'production', start: '19:00', end: '20:00' }],
    },
  });
  for (const index of [2, 5, 6])
    config.lineSchedules[lines[index]] = {
      day: [
        { id: 'a1', kind: 'production', start: '07:40', end: '08:00' },
        { id: 'a2', kind: 'production', start: '08:00', end: '09:00' },
        { id: 'a3', kind: 'production', start: '09:00', end: '11:00' },
        { id: 'ab', kind: 'break', start: '11:00', end: '11:10' },
        { id: 'a4', kind: 'production', start: '11:10', end: '12:00' },
      ],
      night: config.schedules.night,
    };
  config.lineSchedules[lines[1]] = {
    day: [{ id: 'c1', kind: 'production', start: '07:40', end: '08:00' }],
    night: config.schedules.night,
  };
  config.monitoring.groups = [
    { id: 'design-floor-1', name: '1F', lines: lines.slice(0, 3) },
    { id: 'design-floor-2', name: '2F', lines: lines.slice(3) },
  ];
  config.monitoring.rules = [];
  config.monitoring.unified = {
    performance: { enabled: true, green: 95, red: 85 },
    completion: { enabled: true, green: 100, red: 110 },
    reporting: { enabled: true, graceMinutes: 10, redMinutes: 30 },
  };
  const response = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(response.status(), 200, await response.text());
  const saved = await response.json(),
    date = '2099-12-01',
    clock = Date.parse(date + 'T10:05:00+07:00');
  for (const [index, line] of lines.entries()) {
    const row = saved.rows.find((row) => row.line === line && row.active);
    const slots = allocateDailyTarget(saved, 600, line);
    for (const shift of ['day', 'night']) {
      const result = await context.request.put(baseURL + '/api/records/' + row.id, {
        data: {
          date,
          shift,
          version: 0,
          configVersion: saved.version,
          entryMode: true,
          editTargets: true,
          slots: slots
            .filter((slot) => slot.shift === shift)
            .map((slot) => {
              const end = Date.parse(date + 'T' + slot.end + ':00+07:00');
              const current = slot.start <= '10:05' && slot.end > '10:05';
              const factor =
                index === 5 && current
                  ? 0.99
                  : index === 2 && current
                    ? 0.6
                    : [0, 0.22, 0.9, 0, 0, 1.01, 1][index];
              return {
                id: slot.id,
                target: slot.target,
                actual:
                  [3, 4].includes(index) || shift === 'night' || (end > clock && !current)
                    ? null
                    : Math.round(slot.target * factor),
                issue: '',
              };
            }),
        },
      });
      assert.equal(result.status(), 200, await result.text());
    }
  }
  const design = await browser.newContext({ viewport: { width: 1672, height: 941 } });
  await design.request.post(baseURL + '/api/auth/login', {
    data: { username: 'manager', password: 'manager' },
  });
  const page = await design.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: clock });
  await page.route('**/api/records?*', async (route) => {
    const result = await route.fetch();
    await route.fulfill({
      response: result,
      json: { ...(await result.json()), serverTime: clock },
    });
  });
  await page.goto(baseURL + '/overview');
  await page.locator('#language-select').selectOption('en');
  await page.locator('[data-report-scope="day"]').click();
  await page.locator('#line-cards .line-card').last().waitFor();
  for (const [severity, count] of [
    ['red', 4],
    ['yellow', 1],
    ['green', 2],
  ])
    assert.equal(
      await page.locator(`[data-alert-filter="${severity}"] [data-status-count]`).textContent(),
      String(count),
    );
  await page.locator('[data-group="design-floor-1"]').click();
  assert.equal(await page.locator('#line-cards .line-card').count(), 3);
  await page.locator('[data-alert-filter="red"]').click();
  assert.equal(await page.locator('#line-cards .line-card').count(), 2);
  await page.locator('[data-alert-filter="all"]').click();
  await page.locator('[data-group=""]').click();
  const first = page.locator('#line-cards .line-card').first();
  await first.locator('[data-line-expand]').click();
  assert.equal(await first.locator('.card-expanded-details').isVisible(), true);
  assert.equal(await first.locator('[data-card-alert-list] li').count(), 3);
  assert.equal(new URL(page.url()).pathname, '/overview');
  await first.locator('[data-line-expand]').click();
  const before = await first.locator('[data-reason-count]').textContent();
  await first.locator('[data-reason-step="1"]').click();
  assert.notEqual(await first.locator('[data-reason-count]').textContent(), before);
  assert.match(await first.locator('.signal-lamp').getAttribute('class'), /lamp-red/);
  await first.locator('[data-reason-step="-1"]').click();
  await first.evaluate((node) => {
    node.dataset.auditIdentity = 'stable';
  });
  await page.locator('#refresh-now').click();
  await page.waitForFunction(() => !document.querySelector('#refresh-now').disabled);
  assert.equal(await first.getAttribute('data-audit-identity'), 'stable');
  record(
    'Reference scene shows four critical, one warning and two normal lines; floor/status filters, full reasons, manual paging and stable live row controls work',
  );

  for (const language of ['zh', 'en', 'th']) {
    await page.locator('#language-select').selectOption(language);
    for (const [width, height] of [
      [1920, 1080],
      [1672, 941],
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1280, 720],
    ]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.locator('#line-cards').evaluate((list) =>
        [...list.children].map((card) => ({
          rect: card.getBoundingClientRect().toJSON(),
          bad: [
            ...card.querySelectorAll(
              '.line-card-top,.line-health,.line-slot,.line-card-values,.line-card-status,.line-trend,.production-model,.line-card-values b',
            ),
          ]
            .filter((node) => {
              const rect = node.getBoundingClientRect(),
                box = card.getBoundingClientRect();
              return (
                rect.left < box.left - 1 ||
                rect.right > box.right + 1 ||
                rect.top < box.top - 1 ||
                rect.bottom > box.bottom + 1
              );
            })
            .map((node) => node.className),
        })),
      );
      assert.equal(geometry.length, 7);
      assert.ok(
        geometry.every(
          (item) => !item.bad.length && item.rect.top >= 64 && item.rect.bottom <= height,
        ),
        JSON.stringify({ language, width, height, geometry }),
      );
    }
  }
  record(
    'Seven reference-style horizontal rows and all information bands fit ordinary desktop views from 1280×720 to 1920×1080 in every language',
  );

  if (screenshots) {
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.locator('#language-select').selectOption('en');
    await page.evaluate(() => scrollTo(0, 0));
    const last = await page.locator('#line-cards .line-card').last().boundingBox();
    await page.screenshot({
      path: path.join(root, 'docs/images/production-overview.png'),
      clip: { x: 0, y: 0, width: 1672, height: Math.ceil(last.y + last.height + 12) },
    });
    await page.locator('#enter-fullscreen').click();
    await page.locator('.board-display-options summary').click();
    await page.locator('#board-show-trend').uncheck();
    await page.locator('#board-show-share').uncheck();
    await page.locator('.board-display-options summary').click();
    await page.screenshot({ path: path.join(root, 'docs/images/seven-line-board.png') });
    await page.locator('#exit-fullscreen').click();
  }
  const pages = [
    ['/overview', '#line-cards .line-card'],
    ['/entry', '.entry-unified'],
    ['/settings/master-data', '.schedule-settings'],
    ['/settings/daily-targets', '.targets-panel'],
    ['/settings/alerts', '.unified-policies'],
    ['/guide', '.help-topic'],
  ];
  for (const theme of ['delta', 'green', 'indigo', 'amber', 'rose']) {
    await page.locator('#theme-select').selectOption(theme);
    for (const language of ['zh', 'en', 'th']) {
      await page.locator('#language-select').selectOption(language);
      for (const [route, selector] of pages) {
        await page.goto(baseURL + route);
        await page.locator(selector).first().waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `${theme}/${language}/${route}/${width}`,
          );
          const navigationFits = await page.locator('.sidebar nav').evaluate((nav) => {
            const links = [...nav.querySelectorAll('a')].filter(
              (node) => node.getClientRects().length,
            );
            return links.every((node, index) => {
              const box = node.getBoundingClientRect();
              const label = node.querySelector('.nav-label');
              return (
                (!index || box.left >= links[index - 1].getBoundingClientRect().right) &&
                (getComputedStyle(label).display === 'none' ||
                  label.getBoundingClientRect().right <= box.right + 1)
              );
            });
          });
          assert.ok(navigationFits, `Navigation labels overlap: ${theme}/${language}/${width}`);
          const colors = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            const luminance = (color) => {
              context.fillStyle = color;
              context.fillRect(0, 0, 1, 1);
              const values = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              });
              return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
            };
            const ratio = (a, b) => {
              const x = luminance(a),
                y = luminance(b);
              return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            const muted = getComputedStyle(
              document.querySelector('.form-hint') || document.body,
            ).color;
            const primary = getComputedStyle(document.querySelector('.button.primary'));
            return {
              text: ratio(
                getComputedStyle(document.body).color,
                getComputedStyle(document.body).backgroundColor,
              ),
              muted: ratio(muted, '#fff'),
              primary: ratio(primary.color, primary.backgroundColor),
            };
          });
          assert.ok(
            colors.text >= 4.5 && colors.muted >= 4.5 && colors.primary >= 4.5,
            JSON.stringify({ theme, language, route, colors }),
          );
        }
        assert.doesNotMatch(
          await page.locator(selector).first().innerText(),
          /undefined|\{\w+\}|openProductionDetails|achievementRate|allStatuses/,
        );
      }
    }
  }
  record(
    'All five themes and three languages retain shared readable surfaces across overview, entry, schedules, targets, alerts and guide at desktop and phone widths; primary and secondary text contrast meets 4.5:1',
  );
  await design.close();
}
