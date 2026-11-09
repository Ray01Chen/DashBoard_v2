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
    // Requested account migration runs once; existing manager/member passwords are retained on later startups.
    if (db.prepare("SELECT 1 FROM users WHERE username IN ('admin','operator')").get()) {
      db.prepare('DELETE FROM sessions').run();
      db.prepare('DELETE FROM login_attempts').run();
      for (const [oldName, username] of [
        ['admin', 'manager'],
        ['operator', 'member'],
      ]) {
        const old = db.prepare('SELECT * FROM users WHERE username=?').get(oldName);
        if (!old) continue;
        if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username))
          db.prepare('DELETE FROM users WHERE username=?').run(oldName);
        else {
          const salt = randomBytes(16).toString('hex'),
            hash = scryptSync(username, salt, 64).toString('hex');
          db.prepare('UPDATE users SET username=?,salt=?,password_hash=? WHERE username=?').run(
            username,
            salt,
            hash,
            oldName,
          );
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const dummySalt = randomBytes(16).toString('hex'),
    dummyHash = scryptSync(randomBytes(32), dummySalt, 64);
  function current(req) {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('bp_session='))
      ?.slice(11);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      db
        .prepare(
          'SELECT u.username,u.role,s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.username=s.username WHERE s.token_hash=? AND s.expires_at>?',
        )
        .get(digest(token), Date.now()) || null
    );
  }
  function login(req, username, password) {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      username.length > 100 ||
      password.length > 200
    )
      return { code: 'errLogin', status: 401 };
    const key = `${req.socket.remoteAddress}|${username.toLowerCase()}`,
      now = Date.now();
    db.prepare('DELETE FROM login_attempts WHERE started_at<=?').run(now - attemptWindow);
    const attempt = db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
    if (attempt && attempt.attempts >= 8) return { code: 'errLoginLimit', status: 429 };
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const candidate = scryptSync(password, user?.salt || dummySalt, 64),
      expected = user ? Buffer.from(user.password_hash, 'hex') : dummyHash;
    if (!timingSafeEqual(candidate, expected) || !user) {
      // Increment in SQL rather than copying a previously read counter; otherwise two
      // workers can both write the same count and weaken the failed-login limit.
      db.prepare(
        `INSERT INTO login_attempts(key,attempts,started_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1`,
      ).run(key, now);
      return { code: 'errLogin', status: 401 };
    }
    db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    const token = randomBytes(32).toString('hex'),
      expiresAt = now + lifetime;
    db.prepare('INSERT INTO sessions(token_hash,username,expires_at) VALUES(?,?,?)').run(
      digest(token),
      user.username,
      expiresAt,
    );
    return { token, user: { username: user.username, role: user.role, expiresAt } };
  }
  function cookie(req, token) {
    return `bp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? lifetime / 1000 : 0}${req.socket.encrypted ? '; Secure' : ''}`;
  }
  function logout(req) {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('bp_session='))
      ?.slice(11);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
  }
  return { current, login, cookie, logout };
}
