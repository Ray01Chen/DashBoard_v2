/** Boundary values are saved through the real APIs in the disposable database;
 * no DOM-only fake numbers can hide a formatting/layout regression. */
import assert from 'node:assert/strict';
export async function auditLayoutStress({ page, context, baseURL, readConfig, record }) {
  const config = await readConfig();
  const model = 'ECD99999999-' + 'LongProductName'.repeat(4).slice(0, 48);
  const line = 'CD-STRESS';
  Object.assign(config, {
    lines: [line],
    models: [model],
    jobs: ['PD'],
    stations: ['Pack'],
    personnel: [],
    productionUnits: [
      { line, model, dailyTarget: 99999999, staffing: { day: [], night: [], owners: [] } },
    ],
    rows: [
      {
        id: 'new-layout-stress',
        line,
        model,
        job: 'PD',
        station: 'Pack',
        active: true,
        hasOutput: true,
      },
    ],
    lineSchedules: {},
    scheduleTemplates: [],
    schedules: {
      day: [
        { id: 'stress-prefix', kind: 'production', start: '08:00', end: '09:00' },
        { id: 'stress-active', kind: 'production', start: '09:00', end: '11:00' },
      ],
      night: [{ id: 'stress-night', kind: 'production', start: '20:00', end: '21:00' }],
    },
  });
  config.monitoring.rules = [];
  config.monitoring.unified = {
    performance: { enabled: true, green: 95, red: 85 },
    completion: { enabled: true, green: 100, red: 110 },
    reporting: { enabled: true, graceMinutes: 10, redMinutes: 30 },
  };
  config.monitoring.groups = [
    { id: 'layout-stress', name: 'Layout boundary values', lines: [line] },
  ];
  let result = await context.request.put(baseURL + '/api/config', { data: config });
  assert.equal(result.status(), 200, await result.text());
  const saved = await result.json(),
    row = saved.rows.find((row) => row.line === line && row.active);
  const date = '2099-12-01';
  result = await context.request.put(baseURL + '/api/records/' + row.id, {
    data: {
      date,
      shift: 'day',
      version: 0,
      configVersion: saved.version,
      entryMode: true,
      editTargets: true,
      slots: saved.schedules.day.map((slot) => ({
        id: slot.id,
        target: 1,
        actual: 99999999,
        issue: '',
      })),
    },
  });
  assert.equal(result.status(), 200, await result.text());
  await page.goto(baseURL + '/overview');
  await page.locator('#report-date').fill(date);
  await page.locator('#report-date').dispatchEvent('change');
  await page.locator('[data-group="layout-stress"]').click();
  await page.locator('#line-cards .line-card').first().waitFor();
  for (const language of ['en', 'zh', 'th']) {
    await page.locator('#language-select').selectOption(language);
    for (const fullscreen of [false, true]) {
      if (fullscreen) await page.locator('#enter-fullscreen').click();
      for (const scope of ['interval', 'day']) {
        await page.locator(`#metric-scope-controls [data-metric-scope="${scope}"]`).click();
        if (scope === 'interval')
          await page.waitForFunction(
            () =>
              document
                .querySelector('.production-metric[data-metric="currentActual"] b')
                ?.getAttribute('title')
                .replace(/\D/g, '') === '99999999',
          );
        for (const [width, height] of [
          [1920, 1080],
          [1600, 900],
          [1366, 768],
          [1280, 720],
          [1024, 768],
          [390, 844],
        ]) {
          await page.setViewportSize({ width, height });
          // CSS adopts the new width before ResizeObserver formats its values.
          // Verify the settled result, retaining the overflow/font checks below.
          await page.waitForFunction(() =>
            [...document.querySelectorAll('#line-cards .line-card-values b')].every(
              (node) => node.scrollWidth <= node.clientWidth + 1,
            ),
          );
          const card = page.locator('#line-cards .line-card').first();
          const metrics = await card.locator('.line-card-values').evaluate((values) => {
            const box = values.getBoundingClientRect();
            return [...values.querySelectorAll('b')].map((node) => ({
              text: node.textContent,
              rect: node.getBoundingClientRect().toJSON(),
              font: parseFloat(getComputedStyle(node).fontSize),
              fits:
                node.scrollWidth <= node.clientWidth + 1 &&
                node.getBoundingClientRect().right <= box.right + 1,
            }));
          });
          assert.ok(
            metrics.every((item) => item.fits && item.font >= 18),
            JSON.stringify({ language, fullscreen, scope, width, metrics }),
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await card.locator('[data-line-expand]').click();
          assert.equal(await card.locator('.card-expanded-details').isVisible(), true);
          assert.ok(
            (await card.locator('.card-expanded-details').innerText()).trim().length > 0,
          );
          assert.equal(
            await card
              .locator(
                '.card-expanded-details input, .card-expanded-details [data-metric], .expanded-slot-info',
              )
              .count(),
            0,
          );
          assert.match(
            await card.locator('.line-card-top .production-identity').getAttribute('title'),
            new RegExp(model),
          );
          await card.locator('[data-line-expand]').click();
          await card.locator('.card-expanded-details').waitFor({ state: 'hidden' });
        }
      }
      if (fullscreen) await page.locator('#exit-fullscreen').click();
    }
  }
  record(
    'Real maximum Actual values, extreme achievement percentages and a 60-character Model remain readable in three languages, both display/metric modes and desktop/tablet/phone sizes, with complete expanded metadata',
  );
}
