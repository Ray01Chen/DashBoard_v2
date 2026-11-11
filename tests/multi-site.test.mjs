import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as streamRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createAuth } from '../auth.mjs';
import { migrateSites, backupBeforeSiteMigration } from '../site-migration.mjs';
import { emptySiteConfig } from '../site-management.mjs';

async function start(t, dbPath) {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-sites-'));
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath || path.join(folder, 'test.sqlite'),
      BP_MANAGER_PASSWORD: 'manager',
      BP_MEMBER_PASSWORD: 'member',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => (errors += data));
  child.stdout.on('data', () => {});
  t.after(async () => {
    if (child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
    await rm(folder, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null) throw new Error(errors);
    try {
      if ((await fetch(base)).ok)
        return { base, dbPath: dbPath || path.join(folder, 'test.sqlite') };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Server startup failed: ' + errors);
}
const request = (base, cookie, method, url, data, headers = {}) =>
  fetch(base + url, {
    method,
    headers: { Cookie: cookie || '', 'Content-Type': 'application/json', ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
async function result(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function login(base, username = 'manager', password = username, extra = {}) {
  const response = await request(base, '', 'POST', '/api/auth/login', {
    username,
    password,
    ...extra,
  });
  const data = await result(response);
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    header: response.headers.get('set-cookie'),
    user: data.user,
  };
}
const grants = ['production.read', 'production.write', 'data.import', 'data.export'];
async function addUser(base, admin, username, siteId, siteRole = 'user') {
  return (
    await result(
      await request(base, admin, 'POST', '/api/admin/users', {
        username,
        password: 'initial-password!',
        site_id: siteId,
        site_role: siteRole,
        permissions: grants,
      }),
      201,
    )
  ).user;
}
async function configure(base, cookie, line) {
  const config = await result(await request(base, cookie, 'GET', '/api/config'));
  Object.assign(config, {
    lines: [line],
    models: ['Model'],
    jobs: ['PD'],
    stations: ['Pack'],
    personnel: [],
    productionUnits: [
      { line, model: 'Model', dailyTarget: 100, staffing: { day: [], night: [], owners: [] } },
    ],
    rows: [
      {
        id: 'new-site-station',
        line,
        model: 'Model',
        job: 'PD',
        station: 'Pack',
        active: true,
        hasOutput: true,
      },
    ],
    lineSchedules: {},
    scheduleTemplates: [],
    schedules: {
      day: [{ id: 'day-slot', kind: 'production', start: '08:00', end: '09:00' }],
      night: [{ id: 'night-slot', kind: 'production', start: '20:00', end: '21:00' }],
    },
  });
  config.monitoring.groups = [];
  config.monitoring.rules = [];
  config.monitoring.unitOutputSources = {};
  config.monitoring.outputSources = {};
  return result(await request(base, cookie, 'PUT', '/api/config', config));
}

test('multi-site RBAC enforces session ownership, per-site roles, feature grants and revocation', async (t) => {
  const { base, dbPath } = await start(t),
    admin = await login(base);
  assert.equal(admin.user.systemRole, 'system_admin');
  assert.equal(admin.user.site.id, 1);
  assert.doesNotMatch(admin.header, /Max-Age=/);
  const siteB = (
    await result(
      await request(base, admin.cookie, 'POST', '/api/admin/sites', {
        site_code: 'factory_b',
        site_name: 'Factory B',
      }),
      201,
    )
  ).site;
  assert.equal(siteB.site_code, 'FACTORY_B');
  await result(
    await request(base, admin.cookie, 'PATCH', `/api/admin/sites/${siteB.id}`, {
      site_code: 'B2',
      site_name: 'Factory B revised',
    }),
  );
  await result(
    await request(base, admin.cookie, 'POST', '/api/admin/sites', {
      site_code: 'b2',
      site_name: 'Duplicate',
    }),
    409,
  );
  const localAdmin = await addUser(base, admin.cookie, 'local-admin', 1, 'site_admin');
  const userA = await addUser(base, admin.cookie, 'user-a', 1);
  await result(
    await request(
      base,
      admin.cookie,
      'PUT',
      `/api/admin/users/${localAdmin.id}/sites/${siteB.id}`,
      { role: 'user', permissions: grants },
    ),
  );
  const local = await login(base, 'local-admin', 'initial-password!');
  assert.equal(local.user.needsSiteSelection, true);
  let localUser = (
    await result(await request(base, local.cookie, 'POST', '/api/auth/site', { siteId: 1 }))
  ).user;
  assert.equal(localUser.siteRole, 'site_admin');
  for (const [method, url, data] of [
    ['POST', '/api/admin/sites', { site_code: 'EVIL', site_name: 'No' }],
    ['PATCH', `/api/admin/sites/${siteB.id}`, { is_active: false }],
    ['PATCH', `/api/admin/users/${userA.id}`, { system_role: 'system_admin' }],
    ['PUT', `/api/admin/users/${userA.id}/sites/${siteB.id}`, { role: 'site_admin' }],
    ['PUT', `/api/admin/users/${userA.id}/sites/1`, { role: 'site_admin' }],
  ])
    await result(await request(base, local.cookie, method, url, data), 403);
  await result(
    await request(base, local.cookie, 'PUT', '/api/admin/users/not-an-id/sites/999999', {
      role: 'user',
    }),
    403,
  );
  await result(
    await request(base, local.cookie, 'PUT', '/api/admin/users/not-an-id/sites/1', {
      role: 'user',
    }),
    403,
  );
  const created = await addUser(base, local.cookie, 'local-created', 1);
  assert.equal(created.system_role, 'user');
  await result(
    await request(base, local.cookie, 'POST', '/api/admin/users', {
      username: 'escalation',
      password: 'initial-password!',
      site_id: 1,
      system_role: 'system_admin',
    }),
    403,
  );
  const configA = await configure(base, local.cookie, 'LINE-A'),
    rowA = configA.rows.find((row) => row.active).id;
  await result(
    await request(base, local.cookie, 'PUT', `/api/records/${rowA}`, {
      date: '2099-05-01',
      shift: 'day',
      version: 0,
      configVersion: configA.version,
      entryMode: true,
      slots: [{ id: configA.schedules.day[0].id, target: 100, actual: 25, issue: 'A only' }],
    }),
  );
  // A different session selects B; neither selection can change the other's site.
  const adminB = await login(base);
  await result(
    await request(base, adminB.cookie, 'POST', '/api/auth/site', { siteId: siteB.id }),
  );
  const configB = await configure(base, adminB.cookie, 'LINE-B'),
    rowB = configB.rows.find((row) => row.active).id;
  assert.notEqual(rowA, rowB, 'legacy station IDs must be globally owned');
  await result(
    await request(base, adminB.cookie, 'PUT', `/api/records/${rowB}`, {
      date: '2099-05-01',
      shift: 'day',
      version: 0,
      configVersion: configB.version,
      entryMode: true,
      slots: [{ id: configB.schedules.day[0].id, target: 100, actual: 70, issue: 'B only' }],
    }),
  );
  const csv =
    'Row ID,Time slot,Target,Actual,Issue\n' + rowA + ',08:00-09:00,100,33,A imported';
  const preview = await result(
    await request(base, local.cookie, 'POST', '/api/import/preview', {
      date: '2099-05-01',
      shift: 'day',
      fileName: 'site.csv',
      base64: Buffer.from(csv).toString('base64'),
    }),
  );
  assert.deepEqual(preview.errors, []);
  assert.ok(preview.token);
  const a = await login(base, 'user-a', 'initial-password!', { rememberMe: true });
  assert.match(a.header, /Max-Age=2592000/);
  assert.equal(a.user.sites.length, 1);
  for (const url of [
    '/api/records?date=2099-05-01&shift=day&site_id=' + siteB.id,
    '/api/config?siteId=' + siteB.id,
    '/api/export?date=2099-05-01&shift=day&site_id=' + siteB.id,
    '/api/import/template?date=2099-05-01&shift=day&siteId=' + siteB.id,
  ])
    await result(await request(base, a.cookie, 'GET', url), 403);
  for (const method of ['PUT', 'DELETE'])
    await result(
      await request(base, a.cookie, method, `/api/records/${rowB}`, {
        date: '2099-05-01',
        shift: 'day',
        version: 1,
        configVersion: configA.version,
        slots: [],
      }),
      method === 'DELETE' ? 403 : 404,
    );
  await result(
    await request(base, a.cookie, 'PUT', `/api/records/${rowA}`, {
      site_id: siteB.id,
      date: '2099-05-01',
      shift: 'day',
      version: 1,
      configVersion: configA.version,
      slots: [],
    }),
    403,
  );
  await result(
    await request(base, a.cookie, 'POST', '/api/auth/site', { siteId: siteB.id }),
    403,
  );
  await result(await request(base, a.cookie, 'GET', '/api/admin/users'), 403);
  const reportA = await result(
    await request(base, a.cookie, 'GET', '/api/records?date=2099-05-01&shift=day'),
  );
  assert.equal(reportA.records.length, 1);
  assert.equal(reportA.records[0].slots[0].actual, 25);
  assert.doesNotMatch(JSON.stringify(reportA), /B only|LINE-B/);
  const db = new DatabaseSync(dbPath);
  t.after(() => db.close());
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  // Same account is an admin in A and a normal user in B.
  localUser = (
    await result(
      await request(base, local.cookie, 'POST', '/api/auth/site', { siteId: siteB.id }),
    )
  ).user;
  assert.equal(localUser.siteRole, 'user');
  assert.equal(localUser.role, 'operator');
  await result(
    await request(base, local.cookie, 'POST', '/api/import/apply', { token: preview.token }),
    410,
  );
  await result(
    await request(base, a.cookie, 'POST', '/api/import/apply', { token: preview.token }),
    410,
  );
  await result(await request(base, local.cookie, 'PUT', '/api/config', configB), 403);
  const reportB = await result(
    await request(base, local.cookie, 'GET', '/api/records?date=2099-05-01&shift=day'),
  );
  assert.equal(reportB.records[0].slots[0].actual, 70);
  assert.doesNotMatch(JSON.stringify(reportB), /A only|LINE-A/);
  await result(
    await request(base, local.cookie, 'GET', '/api/config', undefined, {
      'X-Site-ID': '1',
      'X-Site-Version': '0',
    }),
    409,
  );
  await result(await request(base, local.cookie, 'POST', '/api/auth/site', { siteId: 1 }));
  await result(
    await request(base, local.cookie, 'POST', '/api/import/apply', { token: preview.token }),
  );
  assert.equal(
    (
      await result(
        await request(base, adminB.cookie, 'GET', '/api/records?date=2099-05-01&shift=day'),
      )
    ).records[0].slots[0].actual,
    70,
  );
  const paired = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const [a, b] = await Promise.all([
        request(base, admin.cookie, 'GET', '/api/config').then((response) => result(response)),
        request(base, adminB.cookie, 'GET', '/api/config').then((response) => result(response)),
      ]);
      assert.deepEqual(a.lines, ['LINE-A']);
      assert.deepEqual(b.lines, ['LINE-B']);
    }),
  );
  assert.equal(paired.length, 10);
  // Feature grants take effect immediately for the existing login.
  await result(
    await request(base, admin.cookie, 'PUT', `/api/admin/users/${userA.id}/sites/1`, {
      role: 'user',
      permissions: ['production.read'],
    }),
  );
  await result(
    await request(base, a.cookie, 'PUT', `/api/records/${rowA}`, {
      date: '2099-05-01',
      shift: 'day',
      version: 1,
      configVersion: configA.version,
      slots: [],
    }),
    403,
  );
  await result(
    await request(base, a.cookie, 'GET', '/api/export?date=2099-05-01&shift=day'),
    403,
  );
  await result(await request(base, a.cookie, 'POST', '/api/import/preview', {}), 403);
  await result(
    await request(base, admin.cookie, 'DELETE', `/api/admin/users/${userA.id}/sites/1`, {}),
  );
  await result(
    await request(base, a.cookie, 'GET', '/api/records?date=2099-05-01&shift=day'),
    403,
  );
  const before = db
    .prepare('SELECT count(*) AS n FROM production_records WHERE site_id=?')
    .get(siteB.id).n;
  await result(
    await request(base, local.cookie, 'POST', '/api/auth/site', { siteId: siteB.id }),
  );
  await result(
    await request(base, admin.cookie, 'PATCH', `/api/admin/sites/${siteB.id}`, {
      is_active: false,
    }),
  );
  await result(await request(base, local.cookie, 'GET', '/api/config'), 403);
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM production_records WHERE site_id=?').get(siteB.id).n,
    before,
  );
  const relogin = await login(base, 'local-admin', 'initial-password!');
  assert.equal(relogin.user.site, null, 'an invalid last site must be explicitly reselected');
  assert.ok(relogin.user.sites.every((site) => site.id !== siteB.id));
  await result(
    await request(base, admin.cookie, 'PATCH', `/api/admin/users/${admin.user.id}`, {
      is_active: false,
    }),
    409,
  );
  await result(await request(base, a.cookie, 'POST', '/api/auth/logout', {}));
  await result(await request(base, a.cookie, 'GET', '/api/auth/me'), 401);
  assert.ok(db.prepare('SELECT count(*) AS n FROM security_audit').get().n > 0);
});

function legacyDatabase() {
  const db = new DatabaseSync(':memory:');
  createAuth(db);
  db.exec(`CREATE TABLE production_records(date TEXT NOT NULL,shift TEXT NOT NULL,row_id INTEGER NOT NULL,slots TEXT,row_snapshot TEXT,PRIMARY KEY(date,shift,row_id));
    CREATE TABLE app_settings(id INTEGER PRIMARY KEY,value TEXT);
    CREATE TABLE record_revisions(date TEXT,shift TEXT,row_id INTEGER,version INTEGER,PRIMARY KEY(date,shift,row_id));
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,username TEXT);
    CREATE TABLE production_activity(date TEXT,shift TEXT,row_id INTEGER,total_actual INTEGER,PRIMARY KEY(date,shift,row_id));
    CREATE TABLE import_previews(token_hash TEXT PRIMARY KEY,username TEXT,expires_at INTEGER,payload TEXT);`);
  const template = JSON.parse(
    readFileSync(new URL('../data/template.json', import.meta.url), 'utf8'),
  );
  const config = emptySiteConfig({ site_name: 'Legacy' }, template);
  config.rows = [{ id: 77, line: 'Legacy line', model: 'Default' }];
  db.prepare('INSERT INTO app_settings VALUES(1,?)').run(JSON.stringify(config));
  db.prepare('INSERT INTO production_records VALUES(?,?,?,?,?)').run(
    '2026-11-03',
    'day',
    77,
    JSON.stringify([
      { id: 'original', target: 45, actual: 0 },
      { id: 'missing', actual: null },
    ]),
    JSON.stringify({ id: 77, owner: 'Historical owner' }),
  );
  db.prepare('INSERT INTO record_revisions VALUES(?,?,?,?)').run('2026-11-03', 'day', 77, 9);
  const salt = 'preserved-salt',
    hash = scryptSync('original-password!', salt, 64).toString('hex');
  db.prepare('UPDATE users SET salt=?,password_hash=? WHERE username=?').run(
    salt,
    hash,
    'manager',
  );
  db.prepare('UPDATE users SET salt=?,password_hash=? WHERE username=?').run(
    salt,
    scryptSync('member', salt, 64).toString('hex'),
    'member',
  );
  return db;
}
test('site migration preserves business bytes, account hashes, row counts and IDs; is idempotent', () => {
  const db = legacyDatabase();
  const records = db
      .prepare('SELECT * FROM production_records')
      .all()
      .map((row) => ({ ...row })),
    config = db.prepare('SELECT value FROM app_settings').get().value,
    hash = db
      .prepare("SELECT password_hash FROM users WHERE username='manager'")
      .get().password_hash;
  migrateSites(db);
  const migrated = db
    .prepare('SELECT * FROM production_records')
    .all()
    .map(({ site_id, ...row }) => {
      assert.equal(site_id, 1);
      return row;
    });
  assert.deepEqual(migrated, records);
  assert.equal(db.prepare('SELECT value FROM app_settings').get().value, config);
  assert.equal(
    db.prepare("SELECT password_hash FROM users WHERE username='manager'").get().password_hash,
    hash,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM users WHERE system_role='system_admin'").get().n,
    1,
  );
  assert.equal(
    db
      .prepare(
        "SELECT m.role FROM user_sites m JOIN users u ON u.id=m.user_id WHERE u.username='member'",
      )
      .get().role,
    'user',
  );
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  for (const table of [
    'production_records',
    'app_settings',
    'record_revisions',
    'production_activity',
    'audit_log',
    'import_previews',
  ])
    assert.equal(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .find((column) => column.name === 'site_id').notnull,
      1,
    );
  const snapshot = db.prepare('SELECT * FROM users').all();
  migrateSites(db);
  assert.deepEqual(db.prepare('SELECT * FROM users').all(), snapshot);
  assert.throws(() =>
    db
      .prepare('INSERT INTO production_records VALUES(?,?,?,?,?,?)')
      .run('2026-11-04', 'day', 77, '[]', '{}', 999),
  );
  const auth = createAuth(db),
    req = { socket: { remoteAddress: 'test' }, headers: {} };
  assert.equal(
    auth.login(req, 'manager', 'original-password!').user.systemRole,
    'system_admin',
  );
  db.close();
});
test('failed site migration rolls back schema and data before enforcement', () => {
  const db = legacyDatabase(),
    before = db.prepare('SELECT * FROM production_records').all();
  db.prepare("UPDATE users SET role='operator' WHERE username='manager'").run();
  assert.throws(() => migrateSites(db), /BP_SYSTEM_ADMIN_USERNAME/);
  assert.deepEqual(db.prepare('SELECT * FROM production_records').all(), before);
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE name='sites'").get(),
    undefined,
  );
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  db.close();
});
test('online pre-migration backup contains committed WAL data and can be opened independently', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-backup-')),
    filename = path.join(folder, 'production.sqlite');
  const db = new DatabaseSync(filename);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE production_records(value TEXT); INSERT INTO production_records VALUES('committed WAL data');",
    );
    const destination = await backupBeforeSiteMigration(db, filename),
      copy = new DatabaseSync(destination, { readOnly: true });
    assert.equal(
      copy.prepare('SELECT value FROM production_records').get().value,
      'committed WAL data',
    );
    copy.close();
  } finally {
    db.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('session cookies are transient by default, persistent only when requested and Secure under TLS', () => {
  const db = legacyDatabase();
  migrateSites(db);
  const auth = createAuth(db);
  const plain = { socket: { remoteAddress: '127.0.0.1' }, headers: {} },
    tls = { socket: { remoteAddress: '127.0.0.1', encrypted: true }, headers: {} };
  assert.doesNotMatch(auth.cookie(plain, 'token'), /Max-Age|Secure/);
  assert.match(auth.cookie(tls, 'token'), /HttpOnly; SameSite=Strict; Secure/);
  assert.match(auth.cookie(tls, 'token', true), /Max-Age=2592000; Secure/);
  assert.match(auth.cookie(tls, ''), /Max-Age=0; Secure/);
  const login = auth.login(plain, 'manager', 'original-password!');
  const tokenHash = db.prepare('SELECT token_hash FROM sessions').get().token_hash;
  assert.notEqual(tokenHash, login.token);
  assert.equal(db.prepare('SELECT remember_me FROM sessions').get().remember_me, 0);
  db.close();
});

test('offline restore refuses an implicit overwrite and rescues the destination before rollback', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-restore-')),
    source = path.join(folder, 'before.sqlite'),
    destination = path.join(folder, 'production.sqlite');
  try {
    const before = new DatabaseSync(source);
    before.exec('CREATE TABLE sample(value INTEGER); INSERT INTO sample VALUES(45)');
    before.close();
    const current = new DatabaseSync(destination);
    current.exec('CREATE TABLE sample(value INTEGER); INSERT INTO sample VALUES(75)');
    current.close();
    const cli = fileURLToPath(new URL('../scripts/database-maintenance.mjs', import.meta.url));
    assert.equal(
      spawnSync(process.execPath, [cli, 'restore', source, destination], { encoding: 'utf8' })
        .status,
      1,
    );
    const restored = spawnSync(
      process.execPath,
      [cli, 'restore', source, destination, '--offline'],
      { encoding: 'utf8' },
    );
    assert.equal(restored.status, 0, restored.stderr);
    const report = JSON.parse(restored.stdout),
      result = new DatabaseSync(destination, { readOnly: true });
    assert.equal(result.prepare('SELECT value FROM sample').get().value, 45);
    result.close();
    const rescue = new DatabaseSync(report.rescuedPreviousDatabase, { readOnly: true });
    assert.equal(rescue.prepare('SELECT value FROM sample').get().value, 75);
    rescue.close();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('older admin/operator account names keep their passwords and receive only the planned roles', () => {
  const db = legacyDatabase();
  db.prepare("UPDATE users SET username='admin' WHERE username='manager'").run();
  db.prepare("UPDATE users SET username='operator' WHERE username='member'").run();
  migrateSites(db);
  const auth = createAuth(db),
    req = { socket: { remoteAddress: 'test' }, headers: {} };
  assert.equal(auth.login(req, 'admin', 'original-password!').user.systemRole, 'system_admin');
  assert.equal(auth.login(req, 'operator', 'member').user.systemRole, 'user');
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM users WHERE username IN('manager','member')").get().n,
    0,
  );
  db.close();
});

test('global user lifecycle and newly created System Admin access do not depend on legacy roles', async (t) => {
  const { base } = await start(t),
    root = await login(base),
    member = await login(base, 'member');
  await result(
    await request(base, root.cookie, 'POST', '/api/admin/sites', {
      site_code: 'EXTRA',
      site_name: 'Extra factory',
    }),
    201,
  );
  const second = (
    await result(
      await request(base, root.cookie, 'POST', '/api/admin/users', {
        username: 'new-system-admin',
        password: 'new-admin-password!',
        system_role: 'system_admin',
      }),
      201,
    )
  ).user;
  const sys = await login(base, 'new-system-admin', 'new-admin-password!');
  assert.equal(sys.user.systemRole, 'system_admin');
  assert.equal(sys.user.sites.length, 2);
  assert.equal(
    (await result(await request(base, sys.cookie, 'GET', '/api/admin/sites'))).sites.length,
    2,
  );
  const roster = (await result(await request(base, root.cookie, 'GET', '/api/admin/users')))
    .users;
  const memberId = roster.find((user) => user.username === 'member').id;
  await result(
    await request(base, root.cookie, 'PATCH', `/api/admin/users/${memberId}`, {
      display_name: 'Updated name',
      password: ' spaced password! ',
    }),
  );
  await result(await request(base, member.cookie, 'GET', '/api/auth/me'), 401);
  await result(
    await request(base, '', 'POST', '/api/auth/login', {
      username: 'member',
      password: 'member',
    }),
    401,
  );
  const reset = await login(base, 'member', ' spaced password! ');
  assert.equal(reset.user.displayName, 'Updated name');
  await result(
    await request(base, root.cookie, 'PATCH', `/api/admin/users/${memberId}`, {
      is_active: false,
    }),
  );
  await result(await request(base, reset.cookie, 'GET', '/api/config'), 401);
  await result(
    await request(base, '', 'POST', '/api/auth/login', {
      username: 'member',
      password: ' spaced password! ',
    }),
    401,
  );
  await result(
    await request(base, root.cookie, 'PATCH', `/api/admin/users/${memberId}`, {
      is_active: true,
    }),
  );
  assert.equal((await login(base, 'member', ' spaced password! ')).user.site.id, 1);
  const normal = (
    await result(
      await request(base, root.cookie, 'POST', '/api/admin/users', {
        username: 'view-only',
        password: 'initial-password!',
        site_id: 1,
      }),
      201,
    )
  ).user;
  assert.deepEqual((await login(base, normal.username, 'initial-password!')).user.permissions, [
    'production.read',
  ]);
  await result(
    await request(base, root.cookie, 'PATCH', `/api/admin/users/${second.id}`, {
      system_role: 'user',
    }),
  );
  await result(await request(base, sys.cookie, 'GET', '/api/admin/sites'), 401);
  await result(
    await request(base, root.cookie, 'PATCH', `/api/admin/users/${root.user.id}`, {
      system_role: 'user',
    }),
    409,
  );
});

test('malformed site selectors and feature grants fail closed without coercion or internal errors', async (t) => {
  const { base } = await start(t),
    root = await login(base);
  for (const siteId of [true, 0, -1, 1.5, [1], { toString: null }, '01', '1x']) {
    await result(await request(base, root.cookie, 'POST', '/api/auth/site', { siteId }), 403);
    await result(
      await request(base, '', 'POST', '/api/auth/login', {
        username: 'manager',
        password: 'manager',
        siteId,
      }),
      403,
    );
    await result(
      await request(base, root.cookie, 'PUT', '/api/config', { site_id: siteId }),
      403,
    );
  }
  const member = (
    await result(await request(base, root.cookie, 'GET', '/api/admin/users'))
  ).users.find((user) => user.username === 'member');
  await result(
    await request(base, root.cookie, 'PUT', `/api/admin/users/${member.id}/sites/1`, {
      role: 'user',
      permissions: ['production.read', 'unknown.admin'],
    }),
    400,
  );
  await result(
    await request(base, root.cookie, 'POST', '/api/admin/users', {
      username: 'bad-site',
      password: 'initial-password!',
      site_id: [1],
    }),
    400,
  );
  assert.equal(
    (await result(await request(base, root.cookie, 'GET', '/api/auth/me'))).user.site.id,
    1,
  );
});

test('revocation while an authorized request body is streaming prevents the eventual settings write', async (t) => {
  const { base } = await start(t),
    root = await login(base),
    person = await addUser(base, root.cookie, 'stream-admin', 1, 'site_admin');
  const actor = await login(base, person.username, 'initial-password!');
  const config = await result(await request(base, actor.cookie, 'GET', '/api/config'));
  const payload = JSON.stringify({ ...config, theme: 'rose' }),
    middle = Math.floor(payload.length / 2);
  const req = streamRequest(base + '/api/config', {
    method: 'PUT',
    headers: { Cookie: actor.cookie, 'Content-Type': 'application/json' },
  });
  const response = new Promise((resolve, reject) => {
    req.on('error', reject);
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
  });
  // Ensure cleanup never waits on an unfinished body, even when an assertion fails.
  response.catch(() => {});
  try {
    req.write(payload.slice(0, middle));
    await new Promise((resolve) => setTimeout(resolve, 40));
    await result(
      await request(base, root.cookie, 'PUT', `/api/admin/users/${person.id}/sites/1`, {
        role: 'user',
        permissions: ['production.read'],
      }),
    );
    req.end(payload.slice(middle));
    assert.ok([403, 409].includes(await response));
    const after = await result(await request(base, root.cookie, 'GET', '/api/config'));
    assert.equal(after.version, config.version);
    assert.equal(after.theme, config.theme);
  } finally {
    req.destroy();
  }
});

test('a header-free streaming write cannot be retargeted when its session switches sites', async (t) => {
  const { base } = await start(t),
    actor = await login(base);
  const site = (
    await result(
      await request(base, actor.cookie, 'POST', '/api/admin/sites', {
        site_code: 'STREAM-B',
        site_name: 'Stream factory B',
      }),
      201,
    )
  ).site;
  await result(
    await request(base, actor.cookie, 'POST', '/api/auth/site', { siteId: site.id }),
  );
  const config = await result(await request(base, actor.cookie, 'GET', '/api/config'));
  await result(await request(base, actor.cookie, 'POST', '/api/auth/site', { siteId: 1 }));
  const { siteId, ...data } = config;
  assert.equal(siteId, site.id);
  const payload = JSON.stringify({ ...data, theme: 'rose' }),
    middle = Math.floor(payload.length / 2);
  const req = streamRequest(base + '/api/config', {
    method: 'PUT',
    headers: { Cookie: actor.cookie, 'Content-Type': 'application/json' },
  });
  const response = new Promise((resolve, reject) => {
    req.on('error', reject);
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
  });
  response.catch(() => {});
  try {
    req.write(payload.slice(0, middle));
    await new Promise((resolve) => setTimeout(resolve, 40));
    await result(
      await request(base, actor.cookie, 'POST', '/api/auth/site', { siteId: site.id }),
    );
    req.end(payload.slice(middle));
    assert.equal(await response, 409);
    const after = await result(await request(base, actor.cookie, 'GET', '/api/config'));
    assert.equal(after.version, config.version);
    assert.equal(after.theme, config.theme);
  } finally {
    req.destroy();
  }
});

test('personal list orders persist by user and site, reject stale/foreign keys and retain new-item order', async (t) => {
  const { base, dbPath } = await start(t),
    admin = await login(base);
  let config = await configure(base, admin.cookie, 'CD10');
  config.lines = ['CD10', 'CD2', 'CD1'];
  config.productionUnits = config.lines.map((line) => ({ ...config.productionUnits[0], line }));
  config = await result(await request(base, admin.cookie, 'PUT', '/api/config', config));
  const url = '/api/preferences/lists';
  const initial = await result(await request(base, admin.cookie, 'GET', url));
  assert.deepEqual(initial.orders.lines.items, ['CD10', 'CD2', 'CD1']);
  assert.equal(initial.orders.lines.version, 0);
  const saved = await result(
    await request(base, admin.cookie, 'PUT', url + '/lines', {
      items: ['CD1', 'CD10', 'CD2'],
      version: 0,
    }),
  );
  assert.equal(saved.version, 1);
  await result(
    await request(base, admin.cookie, 'PUT', url + '/lines', {
      items: ['CD1', 'CD2', 'CD10'],
      version: 0,
    }),
    409,
  );
  await result(
    await request(base, admin.cookie, 'PUT', url + '/lines', {
      items: ['foreign', 'CD2', 'CD10'],
      version: 1,
    }),
    400,
  );
  await result(
    await request(base, admin.cookie, 'PUT', url + '/lines', {
      items: ['CD1', 'CD1', 'CD10'],
      version: 1,
    }),
    400,
  );
  const loginAgain = await login(base);
  assert.deepEqual(
    (await result(await request(base, loginAgain.cookie, 'GET', url))).orders.lines.items,
    saved.items,
  );
  const member = await login(base, 'member');
  const other = await result(await request(base, member.cookie, 'GET', url));
  assert.deepEqual(other.orders.lines.items, initial.orders.lines.items);
  await result(
    await request(base, member.cookie, 'PUT', url + '/lines', {
      items: ['CD2', 'CD1', 'CD10'],
      version: 0,
    }),
  );
  assert.deepEqual(
    (await result(await request(base, admin.cookie, 'GET', url))).orders.lines.items,
    saved.items,
  );
  config.lines = ['CD10', 'CD1', 'CD20'];
  config.productionUnits = config.lines.map((line) => ({ ...config.productionUnits[0], line }));
  config = await result(await request(base, admin.cookie, 'PUT', '/api/config', config));
  const changed = await result(await request(base, admin.cookie, 'GET', url));
  assert.deepEqual(changed.orders.lines.items, ['CD1', 'CD10', 'CD20']);
  assert.deepEqual(
    (await result(await request(base, admin.cookie, 'GET', '/api/config'))).lines,
    config.lines,
  );
  const site = (
    await result(
      await request(base, admin.cookie, 'POST', '/api/admin/sites', {
        site_code: 'ORDER-B',
        site_name: 'Order B',
      }),
      201,
    )
  ).site;
  await result(await request(base, admin.cookie, 'GET', url + '?site_id=' + site.id), 403);
  await result(
    await request(base, admin.cookie, 'PUT', url + '/lines', {
      items: changed.orders.lines.items,
      version: 1,
      site_id: site.id,
    }),
    403,
  );
  await result(
    await request(base, admin.cookie, 'POST', '/api/auth/site', { siteId: site.id }),
  );
  await configure(base, admin.cookie, 'B-ONLY');
  assert.deepEqual(
    (await result(await request(base, admin.cookie, 'GET', url))).orders.lines.items,
    ['B-ONLY'],
  );
  await result(
    await request(base, member.cookie, 'POST', '/api/auth/site', { siteId: site.id }),
    403,
  );
  await result(await request(base, '', 'GET', url), 401);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT count(*) AS count FROM user_list_orders').get().count, 2);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});
