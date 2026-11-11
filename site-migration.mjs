import { permissionCodes } from './public/site-messages.js';
import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const siteMigrationVersion = 'multi-site-v1';
const businessTables = [
  'production_records',
  'app_settings',
  'record_revisions',
  'audit_log',
  'production_activity',
  'import_previews',
];
const columns = (db, table) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => row.name),
  );
export function siteMigrationApplied(db) {
  return (
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'").get() &&
    !!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(siteMigrationVersion)
  );
}

/** SQLite's online backup includes committed WAL pages. A plain file copy does not. */
export async function backupBeforeSiteMigration(db, databasePath) {
  if (
    siteMigrationApplied(db) ||
    !db.prepare("SELECT 1 FROM sqlite_master WHERE name='production_records'").get()
  )
    return null;
  const directory = path.join(path.dirname(databasePath), 'backups');
  mkdirSync(directory, { recursive: true });
  const destination = path.join(
    directory,
    `before-multi-site-${Date.now()}-${randomUUID()}.sqlite`,
  );
  await backup(db, destination);
  return destination;
}

/** Add columns in place: old production tables, composite keys and snapshots
 * survive. Globally allocated station IDs retain the legacy composite keys. */
export function migrateSites(db, { plant = 'BP9', backupPath = null } = {}) {
  if (siteMigrationApplied(db)) return;
  // SQLite forbids adding a non-null REFERENCES column to populated tables
  // with FK enforcement on. Disable only on this startup connection, validate
  // every relation inside the transaction, then restore before serving requests.
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    if (siteMigrationApplied(db)) {
      db.exec('COMMIT');
      return;
    }
    const before = Object.fromEntries(
      businessTables.map((table) => [
        table,
        Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n),
      ]),
    );
    db.exec(`CREATE TABLE sites(
      id INTEGER PRIMARY KEY AUTOINCREMENT,site_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
      site_name TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TEXT NOT NULL,report_json TEXT NOT NULL,backup_path TEXT);
      CREATE TABLE site_rows(row_id INTEGER PRIMARY KEY AUTOINCREMENT,site_id INTEGER NOT NULL REFERENCES sites(id),UNIQUE(site_id,row_id));`);
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO sites(id,site_code,site_name,created_at,updated_at) VALUES(1,?,?,?,?)',
    ).run(plant, plant, now, now);
    for (const table of businessTables) {
      if (!columns(db, table).has('site_id'))
        db.exec(
          `ALTER TABLE ${table} ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1 REFERENCES sites(id)`,
        );
      db.exec(`CREATE INDEX ${table}_site ON ${table}(site_id)`);
    }
    db.exec(`CREATE UNIQUE INDEX legacy_settings_site ON app_settings(site_id);
      CREATE INDEX site_records_scope ON production_records(site_id,date,shift,row_id);
      CREATE INDEX site_revisions_scope ON record_revisions(site_id,date,shift,row_id);
      CREATE INDEX site_activity_scope ON production_activity(site_id,date,shift,row_id);
      CREATE INDEX site_previews_owner ON import_previews(site_id,username,token_hash);`);
    db.exec(`CREATE TABLE site_settings(site_id INTEGER NOT NULL PRIMARY KEY REFERENCES sites(id),value TEXT NOT NULL CHECK(json_valid(value)));
      INSERT INTO site_settings(site_id,value) SELECT 1,value FROM app_settings WHERE id=1;
      CREATE TRIGGER default_settings_insert AFTER INSERT ON site_settings WHEN NEW.site_id=1 BEGIN
        INSERT INTO app_settings(id,value,site_id) VALUES(1,NEW.value,1) ON CONFLICT(id) DO UPDATE SET value=excluded.value; END;
      CREATE TRIGGER default_settings_update AFTER UPDATE OF value ON site_settings WHEN NEW.site_id=1 BEGIN
        UPDATE app_settings SET value=NEW.value WHERE id=1 AND value<>NEW.value; END;
      CREATE TRIGGER legacy_settings_update AFTER UPDATE OF value ON app_settings WHEN NEW.id=1 BEGIN
        UPDATE site_settings SET value=NEW.value WHERE site_id=1 AND value<>NEW.value; END;
      CREATE TRIGGER legacy_settings_site BEFORE UPDATE OF site_id ON app_settings WHEN NEW.site_id<>1 BEGIN SELECT RAISE(ABORT,'legacy settings belong to default site'); END;`);
    const userColumns = {
      id: "TEXT NOT NULL DEFAULT ''",
      system_role: "TEXT NOT NULL DEFAULT 'user' CHECK(system_role IN('system_admin','user'))",
      display_name: "TEXT NOT NULL DEFAULT ''",
      is_active: 'INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1))',
      last_site_id: 'INTEGER REFERENCES sites(id)',
      created_at: "TEXT NOT NULL DEFAULT ''",
      updated_at: "TEXT NOT NULL DEFAULT ''",
    };
    for (const [name, definition] of Object.entries(userColumns))
      if (!columns(db, 'users').has(name))
        db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    for (const user of db.prepare('SELECT username FROM users').all())
      db.prepare(
        'UPDATE users SET id=?,display_name=username,last_site_id=1,created_at=?,updated_at=? WHERE username=?',
      ).run(randomUUID(), now, now, user.username);
    db.exec(`CREATE UNIQUE INDEX user_identity ON users(id);
      CREATE UNIQUE INDEX user_login ON users(username COLLATE NOCASE);
      CREATE TABLE user_sites(user_id TEXT NOT NULL REFERENCES users(id),site_id INTEGER NOT NULL REFERENCES sites(id),
        role TEXT NOT NULL CHECK(role IN('site_admin','user')),permissions TEXT NOT NULL CHECK(json_valid(permissions)),
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,site_id));
      CREATE INDEX site_memberships ON user_sites(site_id,user_id);
      ALTER TABLE sessions ADD COLUMN site_id INTEGER REFERENCES sites(id);
      ALTER TABLE sessions ADD COLUMN remember_me INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN site_version INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE security_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT REFERENCES users(id),site_id INTEGER REFERENCES sites(id),action TEXT NOT NULL,details TEXT NOT NULL CHECK(json_valid(details)),created_at TEXT NOT NULL);
      CREATE INDEX security_audit_site ON security_audit(site_id,created_at);`);
    const bootstrap =
      process.env.BP_SYSTEM_ADMIN_USERNAME ||
      (db.prepare("SELECT 1 FROM users WHERE username='manager' AND role='admin'").get()
        ? 'manager'
        : 'admin');
    const administrator = db
      .prepare("SELECT id FROM users WHERE username=? AND role='admin'")
      .get(bootstrap);
    if (!administrator)
      throw new Error(
        'Set BP_SYSTEM_ADMIN_USERNAME to an existing administrator before migration.',
      );
    db.prepare("UPDATE users SET system_role='system_admin' WHERE id=?").run(administrator.id);
    for (const user of db.prepare('SELECT id,role FROM users').all())
      db.prepare('INSERT INTO user_sites VALUES(?,1,?,?,?,?)').run(
        user.id,
        user.role === 'admin' ? 'site_admin' : 'user',
        JSON.stringify(permissionCodes),
        now,
        now,
      );
    // Existing sessions remain bound to the old default workspace.
    db.exec('UPDATE sessions SET site_id=1');
    const reserve = db.prepare('INSERT OR IGNORE INTO site_rows(row_id,site_id) VALUES(?,1)');
    for (const table of ['production_records', 'record_revisions', 'production_activity'])
      for (const row of db.prepare(`SELECT DISTINCT row_id FROM ${table}`).all())
        reserve.run(row.row_id);
    for (const row of db.prepare('SELECT value FROM app_settings').all())
      for (const station of JSON.parse(row.value).rows || []) reserve.run(station.id);
    for (const table of ['production_records', 'record_revisions', 'production_activity']) {
      for (const operation of ['INSERT', 'UPDATE'])
        db.exec(`CREATE TRIGGER ${table}_site_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table} WHEN NOT EXISTS(SELECT 1 FROM site_rows WHERE row_id=NEW.row_id AND site_id=NEW.site_id)
        BEGIN SELECT RAISE(ABORT,'station/site mismatch'); END;`);
    }
    db.exec(
      `CREATE TRIGGER users_require_id BEFORE INSERT ON users WHEN NEW.id='' BEGIN SELECT RAISE(ABORT,'user identity required'); END;`,
    );
    const after = Object.fromEntries(
      businessTables.map((table) => [
        table,
        Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n),
      ]),
    );
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Site migration changed business row counts.');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Site migration foreign-key validation failed.');
    db.prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)').run(
      siteMigrationVersion,
      now,
      JSON.stringify({ before, after, bootstrap }),
      backupPath,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
