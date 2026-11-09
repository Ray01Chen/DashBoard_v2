import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { testPasswords, testAuthEnv } from './test-auth.mjs';

test('authenticated roles and concurrent writes across two server processes', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bp9-concurrency-')),
    dbPath = path.join(folder, 'test.sqlite');
  const children = [];
  async function start() {
    const socket = createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...testAuthEnv, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let errors = '';
    child.stderr.on('data', (d) => (errors += d));
    child.stdout.on('data', () => {});
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        if ((await fetch(base)).ok) return base;
      } catch {}
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(errors);
  }
  async function login(base, username, password = testPasswords[username]) {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    return cookie.split(';')[0];
  }
  const request = (base, cookie, method, url, data, extra = {}) =>
    fetch(base + url, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extra },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  const get = async (base, cookie, url) => (await request(base, cookie, 'GET', url)).json();
  let config;
  const payload = (actual = 90, version = 0) => ({
    date: '2099-01-01',
    shift: 'day',
    version,
    configVersion: config.version,
    dayTeam: 'Team',
    nightTeam: '',
    owner: 'Writer',
    dailyTarget: 500,
    slots: config.schedules.day
      .filter((s) => s.kind === 'production')
      .map((s, i) => ({
        id: s.id,
        target: i === 0 ? 100 : null,
        actual: i === 0 ? actual : null,
        issue: '',
      })),
  });
  try {
    const [a, b] = await Promise.all([start(), start()]);
    let adminA, adminB, opA, opB;
    await t.test('requires authentication for every data API', async () => {
      for (const url of [
        '/api/config',
        '/api/records?date=2099-01-01&shift=day',
        '/api/export?date=2099-01-01&shift=day',
        '/api/auth/me',
      ])
        assert.equal((await fetch(a + url)).status, 401);
      assert.equal((await request(a, '', 'PUT', '/api/config', {})).status, 401);
    });
    await t.test(
      'creates exactly two hashed accounts and independent cookie sessions',
      async () => {
        adminA = await login(a, 'manager');
        adminB = await login(b, 'manager');
        opA = await login(a, 'member');
        opB = await login(b, 'member');
        assert.notEqual(opA, opB);
        assert.equal((await get(a, opA, '/api/auth/me')).user.role, 'operator');
        assert.equal((await get(b, adminB, '/api/auth/me')).user.role, 'admin');
        const db = new DatabaseSync(dbPath, { readOnly: true }),
          users = db.prepare('SELECT * FROM users').all();
        assert.equal(users.length, 2);
        for (const user of users) {
          assert.match(user.password_hash, /^[a-f0-9]{128}$/);
          assert.notEqual(user.password_hash, testPasswords[user.username]);
        }
        assert.notEqual(users[0].salt, users[1].salt);
        db.close();
        config = await get(a, adminA, '/api/config');
      },
    );
    await t.test(
      'operator can read production metadata but cannot manage settings or delete',
      async () => {
        const operatorConfig = await get(a, opA, '/api/config');
        assert.ok(operatorConfig.rows.length);
        assert.ok(!Object.hasOwn(operatorConfig, 'jobs'));
        assert.equal((await request(a, opA, 'PUT', '/api/config', config)).status, 403);
        assert.equal(
          (
            await request(a, opA, 'DELETE', '/api/records/3', {
              date: '2099-01-01',
              shift: 'day',
              version: 0,
            })
          ).status,
          403,
        );
        assert.equal(
          (await request(a, opA, 'PUT', '/api/config', config, { 'X-Role': 'admin' })).status,
          403,
        );
      },
    );
    await t.test('rejects forged sessions and cross-origin writes', async () => {
      assert.equal(
        (await request(a, 'bp_session=' + 'f'.repeat(64), 'GET', '/api/config')).status,
        401,
      );
      assert.equal(
        (
          await request(a, opA, 'PUT', '/api/records/3', payload(), {
            Origin: 'http://untrusted.example',
          })
        ).status,
        403,
      );
    });
    await t.test('40 simultaneous writes to different rows all persist', async () => {
      const responses = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          request(i % 2 ? a : b, i % 2 ? opA : opB, 'PUT', `/api/records/${i + 10}`, payload(i)),
        ),
      );
      assert.ok(
        responses.every((r) => r.status === 200),
        responses.map((r) => r.status).join(','),
      );
      const data = await get(b, opB, '/api/records?date=2099-01-01&shift=day');
      assert.equal(data.records.length, 40);
      for (let i = 0; i < 40; i++) {
        const row = data.records.find((r) => r.rowId === i + 10);
        assert.equal(row.slots[0].actual, i);
        assert.equal(row.updatedBy, 'member');
      }
    });
    await t.test(
      'simultaneous creation of the same row accepts one and rejects the other',
      async () => {
        const responses = await Promise.all([
          request(a, opA, 'PUT', '/api/records/3', payload(71)),
          request(b, opB, 'PUT', '/api/records/3', payload(82)),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const winner = await responses.find((r) => r.status === 200).json(),
          saved = (await get(a, opA, '/api/records?date=2099-01-01&shift=day')).records.find(
            (r) => r.rowId === 3,
          );
        assert.equal(saved.slots[0].actual, winner.slots[0].actual);
        assert.equal(saved.version, 1);
      },
    );
    await t.test('simultaneous edits to the same version cannot overwrite the winner', async () => {
      const responses = await Promise.all([
        request(a, opA, 'PUT', '/api/records/3', payload(91, 1)),
        request(b, opB, 'PUT', '/api/records/3', payload(92, 1)),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const winner = await responses.find((r) => r.status === 200).json(),
        saved = (await get(b, opB, '/api/records?date=2099-01-01&shift=day')).records.find(
          (r) => r.rowId === 3,
        );
      assert.equal(saved.version, 2);
      assert.equal(saved.slots[0].actual, winner.slots[0].actual);
    });
    await t.test('simultaneous delete and update serialize with one conflict', async () => {
      const responses = await Promise.all([
        request(a, adminA, 'DELETE', '/api/records/3', {
          date: '2099-01-01',
          shift: 'day',
          version: 2,
        }),
        request(b, opB, 'PUT', '/api/records/3', payload(99, 2)),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const data = await get(a, adminA, '/api/records?date=2099-01-01&shift=day');
      assert.equal(data.rowVersions[3], 3);
      assert.equal(!!data.records.find((r) => r.rowId === 3), responses[1].status === 200);
    });
    await t.test('delete and recreate cannot reset versions or admit stale edits', async () => {
      assert.equal((await request(a, opA, 'PUT', '/api/records/4', payload(40))).status, 200);
      const removed = await request(a, adminA, 'DELETE', '/api/records/4', {
        date: '2099-01-01',
        shift: 'day',
        version: 1,
      });
      assert.equal(removed.status, 200);
      assert.equal((await removed.json()).version, 2);
      assert.equal((await request(b, opB, 'PUT', '/api/records/4', payload(1, 0))).status, 409);
      const recreated = await request(b, opB, 'PUT', '/api/records/4', payload(44, 2));
      assert.equal(recreated.status, 200);
      assert.equal((await recreated.json()).version, 3);
      assert.equal((await request(a, opA, 'PUT', '/api/records/4', payload(2, 1))).status, 409);
      assert.equal(
        (
          await request(a, adminA, 'DELETE', '/api/records/4', {
            date: '2099-01-01',
            shift: 'day',
            version: 1,
          })
        ).status,
        409,
      );
    });
    await t.test(
      'deleting a record removes its activity and a blank recreation starts cleanly',
      async () => {
        assert.equal((await request(a, opA, 'PUT', '/api/records/9', payload(40))).status, 200);
        assert.equal(
          (
            await request(a, adminA, 'DELETE', '/api/records/9', {
              date: '2099-01-01',
              shift: 'day',
              version: 1,
            })
          ).status,
          200,
        );
        const removed = await get(b, opB, '/api/records?date=2099-01-01&shift=day');
        assert.equal(removed.activity[9], undefined);
        assert.equal(removed.rowVersions[9], 2);
        const recreated = await (
          await request(b, opB, 'PUT', '/api/records/9', payload(null, 2))
        ).json();
        assert.equal(recreated.version, 3);
        assert.equal(recreated.activity.totalActual, 0);
        assert.equal(recreated.activity.lastIncreaseAt, null);
      },
    );
    await t.test(
      'concurrent settings writes check the latest database version across workers',
      async () => {
        const responses = await Promise.all([
          request(a, adminA, 'PUT', '/api/config', { ...config, theme: 'green' }),
          request(b, adminB, 'PUT', '/api/config', { ...config, theme: 'indigo' }),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        config = await get(a, adminA, '/api/config');
        const other = await get(b, adminB, '/api/config');
        assert.equal(config.version, 2);
        assert.equal(other.version, 2);
        assert.equal(other.theme, config.theme);
      },
    );
    await t.test('stale or missing configuration version cannot save production data', async () => {
      assert.equal(
        (await request(a, opA, 'PUT', '/api/records/5', { ...payload(), configVersion: 1 })).status,
        409,
      );
      const data = payload();
      delete data.configVersion;
      assert.equal((await request(b, opB, 'PUT', '/api/records/5', data)).status, 409);
      assert.equal((await request(b, opB, 'PUT', '/api/records/5', payload(50))).status, 200);
    });
    await t.test('invalid writes roll back revision and production changes together', async () => {
      const bad = payload();
      bad.slots[0].actual = -1;
      assert.equal((await request(a, opA, 'PUT', '/api/records/6', bad)).status, 400);
      const snapshot = await get(a, opA, '/api/records?date=2099-01-01&shift=day');
      assert.equal(snapshot.rowVersions[6], undefined);
      const good = await request(b, opB, 'PUT', '/api/records/6', payload());
      assert.equal(good.status, 200);
      assert.equal((await good.json()).version, 1);
    });
    await t.test(
      'a temporary external SQLite writer lock queues instead of losing a save',
      async () => {
        const lock = new DatabaseSync(dbPath);
        lock.exec('BEGIN IMMEDIATE');
        let released = false;
        const timer = setTimeout(() => {
          lock.exec('COMMIT');
          released = true;
        }, 250);
        try {
          const response = await request(a, opA, 'PUT', '/api/records/7', payload(77));
          assert.equal(response.status, 200);
          assert.equal((await response.json()).slots[0].actual, 77);
        } finally {
          clearTimeout(timer);
          if (!released) lock.exec('ROLLBACK');
          lock.close();
        }
      },
    );
    await t.test('audit trail and SQLite integrity remain consistent', async () => {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.ok(
        db
          .prepare(
            "SELECT count(*) AS n FROM audit_log WHERE username='member' AND action IN ('create','update')",
          )
          .get().n >= 40,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM audit_log WHERE action='settings'").get().n,
        1,
      );
      assert.equal(
        db
          .prepare(
            'SELECT count(*) AS n FROM production_records p JOIN record_revisions v USING(date,shift,row_id) WHERE p.version!=v.version',
          )
          .get().n,
        0,
      );
      db.close();
    });
    await t.test('logout invalidates one session without logging out another browser', async () => {
      assert.equal((await request(a, opA, 'POST', '/api/auth/logout', {})).status, 200);
      assert.equal((await request(a, opA, 'GET', '/api/auth/me')).status, 401);
      assert.equal((await request(b, opB, 'GET', '/api/auth/me')).status, 200);
    });
    await t.test('idle activity changes only when actual output increases', async () => {
      const created = await (await request(b, opB, 'PUT', '/api/records/8', payload(80))).json();
      assert.ok(created.activity.lastIncreaseAt);
      await new Promise((r) => setTimeout(r, 20));
      const edited = await (
        await request(b, opB, 'PUT', '/api/records/8', {
          ...payload(80, 1),
          owner: 'Updated owner',
        })
      ).json();
      assert.equal(edited.activity.lastIncreaseAt, created.activity.lastIncreaseAt);
      const increased = await (
        await request(b, opB, 'PUT', '/api/records/8', payload(81, 2))
      ).json();
      assert.notEqual(increased.activity.lastIncreaseAt, created.activity.lastIncreaseAt);
      const reduced = await (await request(b, opB, 'PUT', '/api/records/8', payload(79, 3))).json();
      assert.equal(reduced.activity.lastIncreaseAt, increased.activity.lastIncreaseAt);
    });
    await t.test('expired cookies cannot access or write data', async () => {
      const db = new DatabaseSync(dbPath);
      db.prepare("UPDATE sessions SET expires_at=0 WHERE username='member'").run();
      db.close();
      assert.equal((await request(b, opB, 'GET', '/api/config')).status, 401);
      assert.equal((await request(b, opB, 'PUT', '/api/records/8', payload())).status, 401);
    });
    await t.test(
      'rate limits repeated failed logins without exposing account existence',
      async () => {
        for (let i = 0; i < 8; i++) {
          const response = await request(a, '', 'POST', '/api/auth/login', {
            username: 'not-a-user',
            password: 'wrong',
          });
          assert.equal(response.status, 401);
        }
        const response = await request(a, '', 'POST', '/api/auth/login', {
          username: 'not-a-user',
          password: 'wrong',
        });
        assert.equal(response.status, 429);
      },
    );
    await t.test(
      'failed login counters are atomic across workers and old counters expire',
      async () => {
        const responses = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            request(i % 2 ? a : b, '', 'POST', '/api/auth/login', {
              username: 'parallel-missing-user',
              password: 'wrong',
            }),
          ),
        );
        assert.ok(responses.every((response) => response.status === 401));
        const db = new DatabaseSync(dbPath);
        assert.equal(
          db
            .prepare('SELECT attempts FROM login_attempts WHERE key LIKE ?')
            .get('%|parallel-missing-user').attempts,
          8,
        );
        assert.equal(
          (
            await request(a, '', 'POST', '/api/auth/login', {
              username: 'parallel-missing-user',
              password: 'wrong',
            })
          ).status,
          429,
        );
        db.prepare('UPDATE login_attempts SET started_at=? WHERE key LIKE ?').run(
          Date.now() - 16 * 60 * 1000,
          '%|parallel-missing-user',
        );
        db.close();
        assert.equal(
          (
            await request(b, '', 'POST', '/api/auth/login', {
              username: 'parallel-missing-user',
              password: 'wrong',
            })
          ).status,
          401,
        );
      },
    );
  } finally {
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode === null) {
          const closed = once(child, 'exit');
          child.kill();
          await closed;
        }
      }),
    );
    await rm(folder, { recursive: true, force: true });
  }
});
