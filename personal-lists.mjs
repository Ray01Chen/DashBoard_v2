import { personalLists, reconcileOrder } from './public/personal-lists.js';
import { accessError, requestSiteId } from './site-access.mjs';

/** Additive, idempotent migration: no production/settings tables are rewritten. */
export function migratePersonalLists(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_list_orders (
    user_id TEXT NOT NULL REFERENCES users(id), site_id INTEGER NOT NULL REFERENCES sites(id),
    list_id TEXT NOT NULL, items TEXT NOT NULL CHECK(json_valid(items)),
    version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,site_id,list_id));
    CREATE INDEX IF NOT EXISTS user_list_orders_site ON user_list_orders(site_id,user_id);`);
}

export function listPreferences(db, user, config, listId, data) {
  const siteId = requestSiteId();
  const lists = personalLists(config);
  if (listId && !Object.hasOwn(lists, listId)) throw accessError(400, 'errPersonalList');
  const select = db.prepare(
    'SELECT items,version FROM user_list_orders WHERE user_id=? AND site_id=? AND list_id=?',
  );
  const save =
    db.prepare(`INSERT INTO user_list_orders(user_id,site_id,list_id,items,version,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,site_id,list_id) DO UPDATE SET
    items=excluded.items,version=excluded.version,updated_at=excluded.updated_at`);
  const read = (id) => {
    const row = select.get(user.id, siteId, id);
    const items = reconcileOrder(
      row ? JSON.parse(row.items) : [],
      lists[id].map((item) => item.id),
    );
    const changed = row && row.items !== JSON.stringify(items);
    const version = (row?.version || 0) + (changed ? 1 : 0);
    // Reconcile persisted identities too: a deleted catalog item must not
    // regain an old position when an item with the same name is added later.
    if (changed)
      save.run(user.id, siteId, id, JSON.stringify(items), version, new Date().toISOString());
    return { items, version };
  };
  if (data) {
    const current = read(listId);
    if (!Number.isSafeInteger(data.version) || data.version !== current.version)
      throw accessError(409, 'errPersonalOrderConflict');
    if (
      !Array.isArray(data.items) ||
      data.items.length !== lists[listId].length ||
      new Set(data.items).size !== data.items.length ||
      data.items.some(
        (id) => typeof id !== 'string' || !lists[listId].some((item) => item.id === id),
      )
    )
      throw accessError(400, 'errPersonalList');
    save.run(
      user.id,
      siteId,
      listId,
      JSON.stringify(data.items),
      current.version + 1,
      new Date().toISOString(),
    );
    return { items: data.items, version: current.version + 1 };
  }
  return { lists, orders: Object.fromEntries(Object.keys(lists).map((id) => [id, read(id)])) };
}
