import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { accessError, userPermissions, validSiteId as validId } from './site-access.mjs';
import { defaultMonitoring } from './public/monitor.js';
import { upgradeProductionDefaults } from './production-defaults.mjs';
import { upgradeProductionModels } from './public/production-models.js';

export function emptySiteConfig(site, template) {
  const shiftTime = (time, hours) => {
    const [h, m] = time.split(':').map(Number);
    return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const schedules = Object.fromEntries(
    ['day', 'night'].map((shift) => {
      const offset = shift === 'night' ? 12 : 0;
      const slots = template.slots.map((label, index) => {
        const [start, end] = label.split('-');
        return {
          id: `${shift}-p${index + 1}`,
          kind: 'production',
          start: shiftTime(start, offset),
          end: shiftTime(end, offset),
        };
      });
      const [start, end] = template.break.split('-');
      slots.splice(3, 0, {
        id: `${shift}-b1`,
        kind: 'break',
        start: shiftTime(start, offset),
        end: shiftTime(end, offset),
      });
      return [shift, slots];
    }),
  );
  // Copy only generic schedule defaults, never another site's catalogs or people.
  const config = {
    plant: site.site_name,
    version: 1,
    nextRowId: 1,
    lines: [],
    jobs: [],
    stations: [],
    rows: [],
    models: ['Default'],
    productionUnits: [],
    schedules,
    theme: 'delta',
    language: 'en',
  };
  config.monitoring = defaultMonitoring(config);
  Object.assign(config.monitoring, { uiVersion: 2, ruleControlsVersion: 1 });
  upgradeProductionDefaults(config);
  upgradeProductionModels(config);
  return config;
}

function text(value, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw accessError(400, 'errManagementInput');
  return value.trim();
}
function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200)
    throw accessError(400, 'errManagementInput');
  return value;
}
function active(value) {
  if (typeof value !== 'boolean' && value !== 0 && value !== 1)
    throw accessError(400, 'errManagementInput');
  return Number(value);
}
function permissions(value) {
  if (
    !Array.isArray(value) ||
    value.some((item) => !userPermissions.includes(item)) ||
    !value.includes('production.read')
  )
    throw accessError(400, 'errManagementInput');
  if (value.includes('data.import') && !value.includes('production.write'))
    throw accessError(400, 'errManagementInput');
  return JSON.stringify(userPermissions.filter((item) => value.includes(item)));
}

export function createSiteManagement({ db, auth, body, json, transaction, template }) {
  const readUser = (id) =>
    db
      .prepare(
        'SELECT id,username,display_name,is_active,system_role,created_at,updated_at FROM users WHERE id=?',
      )
      .get(id);
  const allSites = () =>
    db
      .prepare(
        "SELECT s.*,(SELECT count(*) FROM users u WHERE u.system_role='system_admin' OR EXISTS(SELECT 1 FROM user_sites m WHERE m.user_id=u.id AND m.site_id=s.id)) AS user_count FROM sites s ORDER BY site_code COLLATE NOCASE",
      )
      .all();
  function identity(req) {
    const user = auth.current(req);
    if (!user) throw accessError(401, 'errAuth');
    return user;
  }
  function system(req) {
    const user = identity(req);
    if (user.systemRole !== 'system_admin') throw accessError(403, 'errForbidden');
    return user;
  }
  function administrator(req, siteId) {
    const user = identity(req);
    if (user.systemRole === 'system_admin') return user;
    if (!user.site || user.site.id !== Number(siteId) || user.siteRole !== 'site_admin')
      throw accessError(403, 'errForbidden');
    return user;
  }
  function audit(actor, siteId, action, details) {
    db.prepare(
      'INSERT INTO security_audit(actor_id,site_id,action,details,created_at) VALUES(?,?,?,?,?)',
    ).run(actor.id, siteId, action, JSON.stringify(details), new Date().toISOString());
  }
  function target(id) {
    const user = readUser(id);
    if (!user) throw accessError(404, 'errNotFound');
    return user;
  }
  function memberships(id, siteId) {
    return db
      .prepare(
        'SELECT site_id,role,permissions FROM user_sites WHERE user_id=?' +
          (siteId ? ' AND site_id=?' : ''),
      )
      .all(id, ...(siteId ? [siteId] : []))
      .map((row) => ({ ...row, permissions: JSON.parse(row.permissions) }));
  }
  function changeMembership(req, id, siteId, data, remove = false, allowNew = false) {
    const actor = administrator(req, siteId);
    if (!validId(siteId) || !db.prepare('SELECT 1 FROM sites WHERE id=?').get(Number(siteId)))
      throw accessError(404, 'errNotFound');
    const existing = db
      .prepare('SELECT role FROM user_sites WHERE user_id=? AND site_id=?')
      .get(id, Number(siteId));
    if (actor.systemRole !== 'system_admin' && !existing && !allowNew)
      throw accessError(403, 'errForbidden');
    const user = target(id);
    if (user.system_role === 'system_admin')
      throw accessError(
        actor.systemRole === 'system_admin' ? 409 : 403,
        actor.systemRole === 'system_admin' ? 'errSystemAdminScope' : 'errForbidden',
      );
    if (
      actor.systemRole !== 'system_admin' &&
      (user.system_role === 'system_admin' ||
        existing?.role === 'site_admin' ||
        (!remove && data.role !== 'user'))
    )
      throw accessError(403, 'errForbidden');
    if (remove)
      db.prepare('DELETE FROM user_sites WHERE user_id=? AND site_id=?').run(
        id,
        Number(siteId),
      );
    else {
      if (!['site_admin', 'user'].includes(data.role))
        throw accessError(400, 'errManagementInput');
      const grants = permissions(
        data.role === 'site_admin' ? userPermissions : data.permissions || ['production.read'],
      );
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO user_sites(user_id,site_id,role,permissions,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,site_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions,updated_at=excluded.updated_at`,
      ).run(id, Number(siteId), data.role, grants, now, now);
    }
    // Every request re-reads grants. Epoch invalidation also rejects old tabs.
    db.prepare(
      'UPDATE sessions SET site_version=site_version+1 WHERE username=? AND site_id=?',
    ).run(user.username, Number(siteId));
    audit(actor, Number(siteId), remove ? 'membership.remove' : 'membership.save', {
      userId: id,
      role: remove ? null : data.role,
    });
  }
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    if (req.method === 'GET' && url.pathname === '/api/admin/sites') {
      const sites = transaction(() => {
        system(req);
        return allSites();
      }, 'DEFERRED');
      json(res, 200, { sites });
      return true;
    }
    const siteMatch = url.pathname.match(/^\/api\/admin\/sites\/(\d+)$/);
    if (
      (req.method === 'POST' && url.pathname === '/api/admin/sites') ||
      (req.method === 'PATCH' && siteMatch)
    ) {
      system(req);
      const data = await body(req);
      const result = transaction(() => {
        const actor = system(req),
          existing = siteMatch
            ? db.prepare('SELECT * FROM sites WHERE id=?').get(Number(siteMatch[1]))
            : null;
        if (siteMatch && !existing) throw accessError(404, 'errNotFound');
        const code = text(data.site_code ?? existing?.site_code, 32).toUpperCase(),
          name = text(data.site_name ?? existing?.site_name),
          enabled =
            data.is_active === undefined ? (existing?.is_active ?? 1) : active(data.is_active);
        if (!/^[A-Z0-9_-]+$/.test(code)) throw accessError(400, 'errManagementInput');
        if (
          db
            .prepare('SELECT 1 FROM sites WHERE site_code=? AND id<>?')
            .get(code, existing?.id || 0)
        )
          throw accessError(409, 'errSiteCode');
        const now = new Date().toISOString();
        let id = existing?.id;
        if (existing)
          db.prepare(
            'UPDATE sites SET site_code=?,site_name=?,is_active=?,updated_at=? WHERE id=?',
          ).run(code, name, enabled, now, id);
        else {
          id = Number(
            db
              .prepare(
                'INSERT INTO sites(site_code,site_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?)',
              )
              .run(code, name, enabled, now, now).lastInsertRowid,
          );
          db.prepare('INSERT INTO site_settings(site_id,value) VALUES(?,?)').run(
            id,
            JSON.stringify(emptySiteConfig({ site_name: name }, template)),
          );
        }
        if (!enabled)
          db.prepare('UPDATE sessions SET site_version=site_version+1 WHERE site_id=?').run(id);
        audit(actor, id, existing ? 'site.update' : 'site.create', {
          code,
          name,
          active: !!enabled,
        });
        return db.prepare('SELECT * FROM sites WHERE id=?').get(id);
      });
      json(res, siteMatch ? 200 : 201, { site: result });
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      const result = transaction(() => {
        const current = identity(req),
          siteId = url.searchParams.get('site_id') || current.site?.id;
        const actor = administrator(req, siteId);
        if (
          url.searchParams.has('site_id') &&
          (!validId(siteId) ||
            !db.prepare('SELECT 1 FROM sites WHERE id=?').get(Number(siteId)))
        )
          throw accessError(404, 'errNotFound');
        const all = actor.systemRole === 'system_admin' && !url.searchParams.has('site_id');
        const rows = all
          ? db.prepare('SELECT id FROM users ORDER BY username COLLATE NOCASE').all()
          : db
              .prepare(
                "SELECT u.id FROM users u WHERE u.system_role='system_admin' OR EXISTS(SELECT 1 FROM user_sites m WHERE m.user_id=u.id AND m.site_id=?) ORDER BY u.username COLLATE NOCASE",
              )
              .all(Number(siteId));
        return {
          users: rows.map((row) => ({
            ...readUser(row.id),
            memberships: memberships(
              row.id,
              actor.systemRole === 'system_admin' ? null : Number(siteId),
            ),
          })),
        };
      }, 'DEFERRED');
      json(res, 200, result);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/users') {
      const data = await body(req);
      const result = transaction(() => {
        if (Object.hasOwn(data, 'site_id') && !validId(data.site_id))
          throw accessError(400, 'errManagementInput');
        const actor = administrator(req, data.site_id || identity(req).site?.id);
        const username = text(data.username),
          displayName = text(data.display_name || username),
          password = passwordValue(data.password);
        if (!/^[A-Za-z0-9_.@-]+$/.test(username) || password.length < 8)
          throw accessError(400, 'errManagementInput');
        if (db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(username))
          throw accessError(409, 'errUsername');
        const systemRole = data.system_role || 'user';
        if (!['user', 'system_admin'].includes(systemRole))
          throw accessError(400, 'errManagementInput');
        if (actor.systemRole !== 'system_admin' && systemRole !== 'user')
          throw accessError(403, 'errForbidden');
        const id = randomUUID(),
          salt = randomBytes(16).toString('hex'),
          hash = scryptSync(password, salt, 64).toString('hex'),
          now = new Date().toISOString();
        db.prepare(
          "INSERT INTO users(id,username,role,salt,password_hash,system_role,display_name,created_at,updated_at) VALUES(?,?,'operator',?,?,?,?,?,?)",
        ).run(id, username, salt, hash, systemRole, displayName, now, now);
        if (systemRole !== 'system_admin' && (data.site_id || actor.site))
          changeMembership(
            req,
            id,
            data.site_id || actor.site.id,
            { role: data.site_role || 'user', permissions: data.permissions },
            false,
            true,
          );
        audit(actor, null, 'user.create', { userId: id, systemRole });
        return readUser(id);
      });
      json(res, 201, { user: result });
      return true;
    }
    const membership = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/sites\/(\d+)$/);
    if (membership && ['PUT', 'DELETE'].includes(req.method)) {
      const data = await body(req);
      transaction(() =>
        changeMembership(req, membership[1], membership[2], data, req.method === 'DELETE'),
      );
      json(res, 200, { ok: true });
      return true;
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userMatch && req.method === 'PATCH') {
      system(req);
      const data = await body(req);
      const result = transaction(() => {
        const actor = system(req),
          user = target(userMatch[1]);
        const role = data.system_role ?? user.system_role,
          enabled = data.is_active === undefined ? user.is_active : active(data.is_active);
        if (!['user', 'system_admin'].includes(role))
          throw accessError(400, 'errManagementInput');
        if (
          user.system_role === 'system_admin' &&
          user.is_active &&
          (!enabled || role !== 'system_admin') &&
          db
            .prepare(
              "SELECT count(*) AS n FROM users WHERE system_role='system_admin' AND is_active=1",
            )
            .get().n <= 1
        )
          throw accessError(409, 'errLastAdmin');
        db.prepare(
          'UPDATE users SET system_role=?,is_active=?,display_name=?,updated_at=? WHERE id=?',
        ).run(
          role,
          enabled,
          text(data.display_name ?? user.display_name),
          new Date().toISOString(),
          user.id,
        );
        if (data.password !== undefined) {
          const password = passwordValue(data.password);
          if (password.length < 8) throw accessError(400, 'errManagementInput');
          const salt = randomBytes(16).toString('hex');
          db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(
            salt,
            scryptSync(password, salt, 64).toString('hex'),
            user.id,
          );
        }
        if (!enabled || role !== user.system_role || data.password !== undefined)
          db.prepare('DELETE FROM sessions WHERE username=?').run(user.username);
        audit(actor, null, 'user.update', { userId: user.id, role, active: !!enabled });
        return readUser(user.id);
      });
      json(res, 200, { user: result });
      return true;
    }
    throw accessError(404, 'errNotFound');
  };
}
