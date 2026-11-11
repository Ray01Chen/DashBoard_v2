/** Exercise real login cookies, administration forms and site-scoped APIs in the
 * disposable smoke database. No production data or browser storage is seeded. */
import assert from 'node:assert/strict';
import path from 'node:path';

export async function auditSiteManagement({
  browser,
  baseURL,
  root,
  screenshots,
  record,
  errors,
}) {
  const admin = await browser.newContext({ viewport: { width: 1366, height: 900 } }),
    page = await admin.newPage();
  const contexts = [admin];
  const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
  watch(page);
  const json = async (response, status = 200) => {
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const send = (context, method, url, data) => context.request[method](baseURL + url, { data });
  async function switchSite(page, id) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#site-select').selectOption(String(id)),
    ]);
    await page.locator('body.authenticated').waitFor();
    await page.waitForFunction(
      (id) => document.querySelector('#site-select').value === String(id),
      id,
    );
  }
  try {
    await page.goto(baseURL + '/administration/sites');
    await page.locator('#login-username').fill('manager');
    await page.locator('#login-password').fill('manager');
    await page.locator('#login-submit').click();
    await page.locator('body.authenticated').waitFor();
    const siteForm = page.locator('[data-access-form="site"]');
    await siteForm.waitFor();
    await siteForm.locator('[name="site_code"]').fill('QA-B');
    await siteForm.locator('[name="site_name"]').fill('Factory B · Phase 1 Access Validation');
    await siteForm.locator('button[type="submit"]').click();
    await page.locator('.access-table tr').filter({ hasText: 'QA-B' }).waitFor();
    const sites = (await json(await admin.request.get(baseURL + '/api/admin/sites'))).sites,
      siteB = sites.find((site) => site.site_code === 'QA-B'),
      siteA = sites.find((site) => site.id === 1);
    assert.ok(siteB);
    await page.locator(`button[data-access-action="edit-site"][data-id="${siteB.id}"]`).click();
    await siteForm.locator('[name="site_name"]').fill('Factory B · Access Validation');
    await siteForm.locator('button[type="submit"]').click();
    await page
      .locator('.access-table tr')
      .filter({ hasText: 'Factory B · Access Validation' })
      .waitFor();
    if (screenshots)
      await page
        .locator('#administration-content')
        .screenshot({ path: path.join(root, 'docs/images/site-management.png') });
    await page
      .locator(`button[data-access-action="site-users"][data-id="${siteB.id}"]`)
      .click();
    const create = page.locator('[data-access-form="create-user"]');
    await create.waitFor();
    for (const [name, role] of [
      ['phase1-site-admin', 'site_admin'],
      ['phase1-multi', 'user'],
    ]) {
      await create.locator('[name="username"]').fill(name);
      await create.locator('[name="password"]').fill('test-password-123');
      await create.locator('[name="site_role"]').selectOption(role);
      await create.locator('button[type="submit"]').click();
      await page.locator('.access-table tr').filter({ hasText: name }).waitFor();
    }
    const users = (await json(await admin.request.get(baseURL + '/api/admin/users'))).users,
      multi = users.find((user) => user.username === 'phase1-multi');
    await page.locator(`button[data-access-action="edit-user"][data-id="${multi.id}"]`).click();
    const membership = page.locator('[data-access-form="membership"]');
    await membership.locator('[name="site_id"]').selectOption('1');
    await membership.locator('[name="role"]').selectOption('site_admin');
    await membership.locator('button[type="submit"]').click();
    await page.waitForFunction(() => {
      const form = document.querySelector('[data-access-form="membership"]');
      return (
        form?.elements.site_id.value === '1' &&
        form.elements.role.value === 'site_admin' &&
        !form.querySelector('button[type="submit"]').disabled
      );
    });
    await membership.waitFor();
    if (screenshots)
      await membership.screenshot({
        path: path.join(root, 'docs/images/user-site-access.png'),
      });
    // Theme/language changes must keep both admin pages usable at phone widths.
    const themes = await page
      .locator('#theme-select option')
      .evaluateAll((options) => options.map((option) => option.value));
    for (const language of ['zh', 'en', 'th']) {
      await page.locator('#language-select').selectOption(language);
      for (const theme of themes) {
        await page.locator('#theme-select').selectOption(theme);
        for (const width of [1366, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.locator('[data-access-form="membership"]').waitFor();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `${language}/${theme}/${width}`,
          );
          if (width === 390) await page.locator('#toggle-navigation').click();
          await page.locator('[data-view="sites"]').click();
          await page.locator('[data-access-form="site"]').waitFor();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          if (width === 390) await page.locator('#toggle-navigation').click();
          await page.locator('[data-view="users"]').click();
          await page.locator('[data-access-form="membership"]').waitFor();
        }
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    record(
      'System Admin creates/edits sites and creates users/assigns per-site roles through real forms; administration remains usable in three languages, five themes and desktop/phone widths',
    );

    // Independent admin session seeds real, visibly distinct production data.
    const seed = await browser.newContext();
    contexts.push(seed);
    await json(
      await send(seed, 'post', '/api/auth/login', { username: 'manager', password: 'manager' }),
    );
    const date = '2099-12-04';
    async function configure(siteId, line, actual) {
      await json(await send(seed, 'post', '/api/auth/site', { siteId }));
      const config = await json(await seed.request.get(baseURL + '/api/config'));
      Object.assign(config, {
        lines: [line],
        models: ['Phase1'],
        jobs: ['PD'],
        stations: ['Pack'],
        personnel: [],
        productionUnits: [
          {
            line,
            model: 'Phase1',
            dailyTarget: 100,
            staffing: { day: [], night: [], owners: [] },
          },
        ],
        rows: [
          {
            id: 'new-ui-site',
            line,
            model: 'Phase1',
            job: 'PD',
            station: 'Pack',
            active: true,
            hasOutput: true,
          },
        ],
        lineSchedules: {},
        scheduleTemplates: [],
        schedules: {
          day: [{ id: 'ui-day', kind: 'production', start: '08:00', end: '09:00' }],
          night: [{ id: 'ui-night', kind: 'production', start: '20:00', end: '21:00' }],
        },
      });
      config.monitoring.groups = [];
      config.monitoring.rules = [];
      config.monitoring.unitOutputSources = {};
      config.monitoring.outputSources = {};
      const saved = await json(await send(seed, 'put', '/api/config', config)),
        row = saved.rows.find((row) => row.active);
      await json(
        await send(seed, 'put', `/api/records/${row.id}`, {
          date,
          shift: 'day',
          version: 0,
          configVersion: saved.version,
          entryMode: true,
          slots: [
            { id: saved.schedules.day[0].id, target: 100, actual, issue: line + ' private' },
          ],
        }),
      );
    }
    await configure(1, 'UI-A', 25);
    await configure(siteB.id, 'UI-B', 70);
    const user = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    contexts.push(user);
    const report = await user.newPage();
    watch(report);
    await report.goto(baseURL + '/overview');
    await report.locator('#login-username').fill('phase1-multi');
    await report.locator('#login-password').fill('test-password-123');
    await report.locator('#login-remember').check();
    await report.locator('#login-submit').click();
    await report.locator('#login-site-field:not([hidden])').waitFor();
    assert.equal(await report.locator('#login-site option').count(), 3);
    await report.locator('#login-site').selectOption(String(siteB.id));
    if (screenshots)
      await report
        .locator('#login-dialog')
        .screenshot({ path: path.join(root, 'docs/images/login-site-selection.png') });
    await report.locator('#login-submit').click();
    await report.locator('body.authenticated').waitFor();
    assert.equal(await report.locator('[data-view="settings"]').isVisible(), false);
    assert.equal(await report.locator('[data-view="users"]').isVisible(), false);
    assert.equal(await report.locator('[data-view="entry"]').isVisible(), false);
    assert.equal(await report.locator('#export').isVisible(), false);
    assert.equal(await report.locator('[data-view="sites"]').isVisible(), false);
    await report.locator('#report-date').fill(date);
    await report.locator('#report-date').dispatchEvent('change');
    await report.locator('#line-cards .production-line').filter({ hasText: 'UI-B' }).waitFor();
    assert.equal(
      await report
        .locator('#line-cards .production-line')
        .allTextContents()
        .then((values) => values.some((value) => value.includes('UI-A'))),
      false,
    );
    const cookie = (await user.cookies()).find((cookie) => cookie.name === 'bp_session');
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    await switchSite(report, 1);
    assert.equal(await report.locator('[data-view="users"]').isVisible(), true);
    assert.equal(await report.locator('[data-view="settings"]').isVisible(), true);
    assert.equal(await report.locator('[data-view="sites"]').isVisible(), false);
    assert.equal(await report.locator('#current-site-name').innerText(), siteA.site_name);
    const detail = await json(await user.request.get(baseURL + '/api/config'));
    assert.deepEqual(detail.lines, ['UI-A']);
    const second = await user.newPage();
    watch(second);
    await second.goto(baseURL + '/overview');
    await second.locator('body.authenticated').waitFor();
    const old = (await json(await user.request.get(baseURL + '/api/auth/me'))).user;
    await switchSite(report, siteB.id);
    const stale = await second.evaluate(
      async ({ siteId, version }) => {
        const response = await fetch('/api/config', {
          headers: { 'X-Site-ID': String(siteId), 'X-Site-Version': String(version) },
        });
        return { status: response.status, body: await response.json() };
      },
      { siteId: old.site.id, version: old.siteVersion },
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'errSiteChanged');
    await second.close();
    await report.locator('#logout').click();
    await report.locator('#login-dialog[open]').waitFor();
    await report.locator('#login-username').fill('phase1-multi');
    await report.locator('#login-password').fill('test-password-123');
    await report.locator('#login-submit').click();
    await report.locator('body.authenticated').waitFor();
    assert.equal(await report.locator('#site-select').inputValue(), String(siteB.id));
    assert.equal(
      (await user.cookies()).find((cookie) => cookie.name === 'bp_session').expires,
      -1,
    );
    record(
      'Login site selection, Remember Me, logout/relogin and last-site selection work; switching reloads distinct real site data and changes Site Admin/User menus, while another tab’s old site/epoch is rejected',
    );

    await json(await send(seed, 'delete', `/api/admin/users/${multi.id}/sites/1`, {}));
    assert.ok(
      (await json(await user.request.get(baseURL + '/api/sites'))).sites.every(
        (site) => site.id !== 1,
      ),
    );
    await json(await send(seed, 'patch', `/api/admin/sites/${siteB.id}`, { is_active: false }));
    assert.equal((await user.request.get(baseURL + '/api/config')).status(), 403);
    await report.reload();
    await report.locator('#login-no-sites:not([hidden])').waitFor();
    assert.equal(await report.locator('#login-site option').count(), 1);
    assert.equal(
      await report.locator('body').evaluate((body) => body.classList.contains('authenticated')),
      false,
    );
    await json(await send(seed, 'patch', `/api/admin/sites/${siteB.id}`, { is_active: true }));
    await json(await send(seed, 'post', '/api/auth/site', { siteId: siteB.id }));
    const retained = await json(
      await seed.request.get(baseURL + `/api/records?date=${date}&shift=day`),
    );
    assert.equal(retained.records[0].slots[0].actual, 70);
    record(
      'Revoked memberships disappear from active choices immediately; disabling a site blocks existing sessions and shows no authorized site, and re-enabling retains production history',
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
