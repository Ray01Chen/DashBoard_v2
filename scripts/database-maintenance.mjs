/** Offline restoration is explicit. Backups and verification are safe against
 * a running WAL database; restoring requires the operator to stop all workers. */
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteMigrationApplied } from '../site-migration.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const [command, ...args] = process.argv.slice(2);
function verify(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (
      db
        .prepare('PRAGMA quick_check')
        .all()
        .some((row) => row.quick_check !== 'ok')
    )
      throw new Error('SQLite integrity check failed.');
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error('Foreign-key validation failed.');
    return { integrity: 'ok', foreignKeyViolations: 0, multiSite: siteMigrationApplied(db) };
  } finally {
    db.close();
  }
}
async function snapshot(source, destination) {
  if (existsSync(destination))
    throw new Error('Backup destination already exists; refusing to overwrite.');
  mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, destination);
  } finally {
    db.close();
  }
  verify(destination);
}
const defaultPath = path.join(root, 'data/production.sqlite');
try {
  if (command === 'verify') {
    const source = path.resolve(args[0] || process.env.DB_PATH || defaultPath);
    console.log(JSON.stringify(verify(source)));
  } else if (command === 'backup') {
    const source = path.resolve(args[0] || process.env.DB_PATH || defaultPath);
    const destination = path.resolve(
      args[1] ||
        path.join(
          path.dirname(source),
          'backups',
          `manual-${Date.now()}-${randomUUID()}.sqlite`,
        ),
    );
    await snapshot(source, destination);
    console.log(`Verified backup: ${destination}`);
  } else if (command === 'restore') {
    if (args.length !== 3 || args[2] !== '--offline')
      throw new Error(
        'Stop every application worker, then use: restore <backup> <database> --offline',
      );
    const source = path.resolve(args[0]),
      target = path.resolve(args[1]);
    if (source === target) throw new Error('Backup and destination must be different files.');
    verify(source);
    const rescue = path.join(
      path.dirname(target),
      'backups',
      `before-restore-${Date.now()}-${randomUUID()}.sqlite`,
    );
    if (existsSync(target)) await snapshot(target, rescue);
    mkdirSync(path.dirname(target), { recursive: true });
    const staging = target + '.restore-' + randomUUID() + '.tmp';
    try {
      await snapshot(source, staging);
      renameSync(staging, target);
      // Only after the replacement succeeds, remove journals from the stopped
      // destination. Replaying them against restored pages would corrupt data.
      for (const suffix of ['-wal', '-shm', '-journal'])
        rmSync(target + suffix, { force: true });
    } finally {
      for (const suffix of ['', '-wal', '-shm', '-journal'])
        rmSync(staging + suffix, { force: true });
    }
    console.log(
      JSON.stringify({
        ...verify(target),
        rescuedPreviousDatabase: existsSync(rescue) ? rescue : null,
      }),
    );
  } else
    throw new Error(
      'Usage: database-maintenance.mjs backup [database] [destination] | verify [database] | restore <backup> <database> --offline',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
