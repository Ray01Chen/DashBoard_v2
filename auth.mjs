import { userPermissions, accessError, validSiteId } from './site-access.mjs';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const lifetime = 8 * 60 * 60 * 1000;
const attemptWindow = 15 * 60 * 1000;
const digest = (token) => createHash('sha256').update(token).digest('hex');
export function createAuth(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('admin','operator')),salt TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES users(username),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,started_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS session_expiration ON sessions(expires_at);
 CREATE INDEX IF NOT EXISTS login_attempt_expiration ON login_attempts(started_at);`);
  // The emptiness check belongs inside the write transaction. Multiple HTTP workers
  // can initialize the same fresh database without both trying to seed its accounts.
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
      const passwords = {
        manager: process.env.BP_MANAGER_PASSWORD || 'manager',
        member: process.env.BP_MEMBER_PASSWORD || 'member',
      };
      for (const [username, password] of Object.entries(passwords)) {
        const salt = randomBytes(16).toString('hex'),
          hash = scryptSync(password, salt, 64).toString('hex');
        db.prepare('INSERT INTO users(username,role,salt,password_hash) VALUES(?,?,?,?)').run(
          username,
          username === 'manager' ? 'admin' : 'operator',
          salt,
          hash,
        );
      }
    }
    // Existing usernames and password hashes are identities, not seed data.
    // In particular, accounts named admin/operator must never be renamed here.
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const dummySalt = randomBytes(16).toString('hex'),
    dummyHash = scryptSync(randomBytes(32), dummySalt, 64);
  function tokenOf(req) {
    return req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('bp_session='))
      ?.slice(11);
  }
  function sitesFor(user) {
    const rows =
      user.system_role === 'system_admin'
        ? db
            .prepare('SELECT * FROM sites WHERE is_active=1 ORDER BY site_code COLLATE NOCASE')
            .all()
        : db
            .prepare(
              `SELECT s.*,m.role AS site_role,m.permissions FROM sites s JOIN user_sites m ON m.site_id=s.id WHERE m.user_id=? AND s.is_active=1 ORDER BY s.site_code COLLATE NOCASE`,
            )
            .all(user.id);
    return rows.map((site) => ({
      id: site.id,
      site_code: site.site_code,
      site_name: site.site_name,
      role: user.system_role === 'system_admin' ? 'site_admin' : site.site_role,
      permissions:
        user.system_role === 'system_admin' || site.site_role === 'site_admin'
          ? [...userPermissions]
          : JSON.parse(site.permissions),
    }));
  }
  function current(req) {
    const token = tokenOf(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare(
        `SELECT u.*,s.expires_at,s.site_id,s.site_version FROM sessions s JOIN users u ON u.username=s.username WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1`,
      )
      .get(digest(token), Date.now());
    if (!row) return null;
    const sites = sitesFor(row),
      site = sites.find((item) => item.id === row.site_id) || null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      systemRole: row.system_role,
      siteRole: site?.role || null,
      role:
        row.system_role === 'system_admin' || site?.role === 'site_admin'
          ? 'admin'
          : 'operator',
      permissions: site?.permissions || [],
      site,
      sites,
      siteVersion: row.site_version,
      needsSiteSelection: !site,
      expiresAt: row.expires_at,
    };
  }
  function login(req, username, password, { rememberMe = false, siteId } = {}) {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.length > 100 ||
      password.length > 200 ||
      typeof rememberMe !== 'boolean'
    )
      return { code: 'errLogin', status: 401 };
    const key = `${req.socket.remoteAddress}|${username.toLowerCase()}`,
      now = Date.now();
    db.prepare('DELETE FROM login_attempts WHERE started_at<=?').run(now - attemptWindow);
    const attempt = db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
    if (attempt && attempt.attempts >= 8) return { code: 'errLoginLimit', status: 429 };
    const user = db
      .prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE')
      .get(username);
    const candidate = scryptSync(password, user?.salt || dummySalt, 64),
      expected = user ? Buffer.from(user.password_hash, 'hex') : dummyHash;
    if (!timingSafeEqual(candidate, expected) || !user || !user.is_active) {
      db.prepare(
        `INSERT INTO login_attempts(key,attempts,started_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1`,
      ).run(key, now);
      return { code: 'errLogin', status: 401 };
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      if (!fresh?.is_active || fresh.password_hash !== user.password_hash)
        throw accessError(401, 'errLogin');
      if (siteId !== undefined && !validSiteId(siteId)) throw accessError(403, 'errSiteAccess');
      const sites = sitesFor(fresh);
      let selected =
        siteId === undefined
          ? sites.find((site) => site.id === fresh.last_site_id)
          : sites.find((site) => String(site.id) === String(siteId));
      if (siteId !== undefined && !selected) throw accessError(403, 'errSiteAccess');
      if (!selected && !fresh.last_site_id && sites.length === 1) selected = sites[0];
      db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      const token = randomBytes(32).toString('hex'),
        expiresAt = now + (rememberMe ? 30 * 24 * 60 * 60 * 1000 : lifetime);
      db.prepare(
        'INSERT INTO sessions(token_hash,username,expires_at,site_id,remember_me) VALUES(?,?,?,?,?)',
      ).run(digest(token), fresh.username, expiresAt, selected?.id || null, Number(rememberMe));
      if (selected)
        db.prepare('UPDATE users SET last_site_id=? WHERE id=?').run(selected.id, fresh.id);
      const userRequest = {
        ...req,
        headers: { ...req.headers, cookie: `bp_session=${token}` },
      };
      const authenticated = current(userRequest);
      db.exec('COMMIT');
      return { token, rememberMe, user: authenticated };
    } catch (error) {
      db.exec('ROLLBACK');
      if (error.status) return { code: error.code, status: error.status };
      throw error;
    }
  }

  function cookie(req, token, rememberMe = false) {
    const secure =
      req.socket.encrypted ||
      process.env.BP_COOKIE_SECURE === 'true' ||
      (process.env.BP_TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https');
    const age = !token ? '; Max-Age=0' : rememberMe ? '; Max-Age=2592000' : '';
    return `bp_session=${token}; Path=/; HttpOnly; SameSite=Strict${age}${secure ? '; Secure' : ''}`;
  }
  function selectSite(req, siteId) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const user = current(req);
      if (!user) throw accessError(401, 'errAuth');
      if (!validSiteId(siteId)) throw accessError(403, 'errSiteAccess');
      const site = user.sites.find((item) => String(item.id) === String(siteId));
      if (!site) throw accessError(403, 'errSiteAccess');
      db.prepare(
        'UPDATE sessions SET site_id=?,site_version=site_version+1 WHERE token_hash=?',
      ).run(site.id, digest(tokenOf(req)));
      db.prepare('UPDATE users SET last_site_id=? WHERE id=?').run(site.id, user.id);
      db.exec('COMMIT');
      return current(req);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function logout(req) {
    const token = tokenOf(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
  }
  return { current, login, cookie, logout, selectSite };
}
