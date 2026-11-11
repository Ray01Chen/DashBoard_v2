import { permissionCodes as userPermissions } from './public/site-messages.js';
import { AsyncLocalStorage } from 'node:async_hooks';

export const siteContext = new AsyncLocalStorage();
export { userPermissions };
export const validSiteId = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && /^[1-9]\d*$/.test(value))) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;
export function accessError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
export function requirePermission(user, permission) {
  if (!user?.site) throw accessError(403, 'errSiteAccess');
  if (![...userPermissions, 'settings.manage'].includes(permission))
    throw accessError(403, 'errForbidden');
  if (user.systemRole === 'system_admin' || user.siteRole === 'site_admin') return;
  if (!user.permissions.includes(permission)) throw accessError(403, 'errForbidden');
}
export function requestSiteId() {
  const context = siteContext.getStore();
  if (!context) return 1; // Legacy initialization only, before HTTP is listening.
  if (!context.siteId) throw accessError(403, 'errSiteAccess');
  return context.siteId;
}
/** Named binding makes site ownership visible in SQL without changing the
 * existing date/shift/row arguments. Never infer a site from a request payload. */
export function siteQuery(db, sql) {
  if (!sql.includes(':site_id'))
    throw new Error('Site query is missing its ownership binding.');
  const statement = db.prepare(sql);
  return Object.fromEntries(
    ['get', 'all', 'run'].map((method) => [
      method,
      (...args) => statement[method]({ site_id: requestSiteId() }, ...args),
    ]),
  );
}
export function assertSiteInput(value, siteId, depth = 0) {
  if (depth > 64) throw accessError(400, 'errJson');
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (
      ['site_id', 'siteId'].includes(key) &&
      (!validSiteId(item) || String(item) !== String(siteId))
    )
      throw accessError(403, 'errSiteAccess');
    if (item && typeof item === 'object') assertSiteInput(item, siteId, depth + 1);
  }
}
export function bindRequestSite(req, url, user) {
  if (!user.site) throw accessError(403, 'errSiteAccess');
  const context = siteContext.getStore();
  if (context.siteId && context.siteId !== user.site.id)
    throw accessError(409, 'errSiteChanged');
  context.siteId = user.site.id;
  if (
    (req.headers['x-site-id'] && req.headers['x-site-id'] !== String(user.site.id)) ||
    (req.headers['x-site-version'] &&
      req.headers['x-site-version'] !== String(user.siteVersion))
  )
    throw accessError(409, 'errSiteChanged');
  assertSiteInput(Object.fromEntries(url.searchParams), user.site.id);
}
