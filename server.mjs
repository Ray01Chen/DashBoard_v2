import http from 'node:http';
import { resolvePage } from './public/pages.js';
import { issuePresets, validateIssuePresets } from './public/issue-presets.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { translate, locales } from './public/i18n.js';
import { createAuth } from './auth.mjs';
import { defaultMonitoring, lampColors, migrateRuleControls } from './public/monitor.js';
import {
  upgradeProductionDefaults,
  validateProductionDefaults,
  buildProductionDefaults,
  resolveEntryData,
} from './production-defaults.mjs';
import { importTemplate, previewImport } from './production-import.mjs';
import { planLineOutput, planStationInterval } from './line-production.mjs';
import {
  upgradeProductionModels,
  modelOf,
  productionKey,
  sameProduction,
  outputSourceFor,
  stationHasOutput,
} from './public/production-models.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(readFileSync(path.join(root, 'data/template.json'), 'utf8'));
const databasePath = process.env.DB_PATH || path.join(root, 'data/production.sqlite');
mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
// WAL conversion can report BUSY before SQLite's busy handler waits. Retry this
// idempotent initialization so two fresh workers can start on the same file.
db.exec('PRAGMA busy_timeout=5000');
const initialSchema = `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS production_records (
 date TEXT NOT NULL,shift TEXT NOT NULL CHECK(shift IN ('day','night')),row_id INTEGER NOT NULL,
 day_team TEXT NOT NULL,night_team TEXT NOT NULL,daily_target INTEGER,owner TEXT NOT NULL,
 slots TEXT NOT NULL CHECK(json_valid(slots)),version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,
 row_snapshot TEXT,PRIMARY KEY(date,shift,row_id));
CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL CHECK(json_valid(value)));`;
const startupDeadline = Date.now() + 5000;
for (;;) {
  try {
    db.exec(initialSchema);
    break;
  } catch (error) {
    if (![5, 6].includes(error.errcode) || Date.now() >= startupDeadline) throw error;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
transaction(() => {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(production_records)')
      .all()
      .map((column) => column.name),
  );
  if (!columns.has('row_snapshot'))
    db.exec('ALTER TABLE production_records ADD COLUMN row_snapshot TEXT');
  if (!columns.has('updated_by'))
    db.exec("ALTER TABLE production_records ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''");
  if (!columns.has('defaults_snapshot'))
    db.exec('ALTER TABLE production_records ADD COLUMN defaults_snapshot TEXT');
});
const auth = createAuth(db);
db.exec(`CREATE TABLE IF NOT EXISTS record_revisions(date TEXT NOT NULL,shift TEXT NOT NULL,row_id INTEGER NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(date,shift,row_id));
INSERT OR IGNORE INTO record_revisions(date,shift,row_id,version) SELECT date,shift,row_id,version FROM production_records;
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,action TEXT NOT NULL,date TEXT,shift TEXT,row_id INTEGER,version INTEGER NOT NULL,created_at TEXT NOT NULL);`);
db.exec(
  'CREATE TABLE IF NOT EXISTS production_activity(date TEXT NOT NULL,shift TEXT NOT NULL,row_id INTEGER NOT NULL,total_actual INTEGER NOT NULL,last_increase_at TEXT,PRIMARY KEY(date,shift,row_id))',
);
db.exec(`CREATE TABLE IF NOT EXISTS import_previews(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE INDEX IF NOT EXISTS import_preview_expiration ON import_previews(expires_at);`);
const getActivity = db.prepare(
  'SELECT * FROM production_activity WHERE date=? AND shift=? AND row_id=?',
);
const setActivity = db.prepare(
  'INSERT INTO production_activity(date,shift,row_id,total_actual,last_increase_at) VALUES(?,?,?,?,?) ON CONFLICT(date,shift,row_id) DO UPDATE SET total_actual=excluded.total_actual,last_increase_at=excluded.last_increase_at',
);
// All mutations reserve the writer lock before reading versions. A later worker must
// compare against the committed winner, rather than overwriting a stale snapshot.
function transaction(work, mode = 'IMMEDIATE') {
  db.exec(`BEGIN ${mode}`);
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function refreshConfig() {
  config = JSON.parse(db.prepare('SELECT value FROM app_settings WHERE id=1').get().value);
}
const revision = db.prepare(
  'SELECT version FROM record_revisions WHERE date=? AND shift=? AND row_id=?',
);
const setRevision = db.prepare(
  'INSERT INTO record_revisions(date,shift,row_id,version) VALUES(?,?,?,?) ON CONFLICT(date,shift,row_id) DO UPDATE SET version=excluded.version',
);
const audit = db.prepare(
  'INSERT INTO audit_log(username,action,date,shift,row_id,version,created_at) VALUES(?,?,?,?,?,?,?)',
);
const unique = (items) => [...new Set(items.filter(Boolean))];
const shiftTime = (time, offset) => {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + offset) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
function defaultSchedule(shift) {
  const offset =
    shift === 'night' &&
    !db.prepare("SELECT 1 FROM production_records WHERE shift='night' LIMIT 1").get()
      ? 12
      : 0;
  const schedule = template.slots.map((label, i) => {
    const [start, end] = label.split('-');
    return {
      id: `${shift}-p${i + 1}`,
      kind: 'production',
      start: shiftTime(start, offset),
      end: shiftTime(end, offset),
    };
  });
  const [start, end] = template.break.split('-');
  schedule.splice(3, 0, {
    id: `${shift}-b1`,
    kind: 'break',
    start: shiftTime(start, offset),
    end: shiftTime(end, offset),
  });
  return schedule;
}
let config;
// Read and seed under the same lock: two new workers may start against an empty DB.
transaction(() => {
  const saved = db.prepare('SELECT value FROM app_settings WHERE id=1').get();
  if (saved) config = JSON.parse(saved.value);
  else {
    config = {
      source: template.source,
      sheet: template.sheet,
      plant: template.plant,
      version: 1,
      nextRowId: Math.max(...template.rows.map((r) => r.id)) + 1,
      lines: unique(template.rows.map((r) => r.line)),
      jobs: unique(template.rows.map((r) => r.job)),
      stations: unique(template.rows.map((r) => r.station)),
      rows: template.rows.map((r) => ({ ...r, active: true })),
      schedules: { day: defaultSchedule('day'), night: defaultSchedule('night') },
      theme: 'delta',
      language: 'en',
    };
    config.monitoring = defaultMonitoring(config);
    upgradeProductionDefaults(config);
    upgradeProductionModels(config);
    db.prepare('INSERT INTO app_settings(id,value) VALUES(1,?)').run(JSON.stringify(config));
  }
});
if (!config.monitoring)
  transaction(() => {
    refreshConfig();
    if (!config.monitoring) {
      config.monitoring = defaultMonitoring(config);
      config.language = 'en';
      config.version++;
      db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(config));
    }
  });
if (config.monitoring.uiVersion !== 2)
  transaction(() => {
    refreshConfig();
    if (config.monitoring.uiVersion !== 2) {
      Object.assign(config.monitoring, { uiVersion: 2, refreshSeconds: 10, alertMode: 'all' });
      config.version++;
      db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(config));
    }
  });
if (config.monitoring.ruleControlsVersion !== 1)
  transaction(() => {
    refreshConfig();
    if (migrateRuleControls(config.monitoring)) {
      config.version++;
      db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(config));
    }
  });
if (
  !Array.isArray(config.personnel) ||
  !config.lineStaffing ||
  !config.lineTargets ||
  !config.models ||
  !config.productionUnits ||
  config.rows.some((row) => !Object.hasOwn(row, 'dailyTarget'))
)
  transaction(() => {
    refreshConfig();
    const defaultsChanged = upgradeProductionDefaults(config);
    if (upgradeProductionModels(config) || defaultsChanged) {
      config.version++;
      db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(config));
    }
  });
// Give legacy array positions stable time IDs and retain their original row definitions.
const migrate = db.prepare(
  'UPDATE production_records SET slots=?,row_snapshot=? WHERE date=? AND shift=? AND row_id=?',
);
transaction(() => {
  refreshConfig();
  for (const r of db.prepare('SELECT * FROM production_records').all()) {
    const values = JSON.parse(r.slots),
      schedule = config.schedules[r.shift].filter((s) => s.kind === 'production');
    if (!getActivity.get(r.date, r.shift, r.row_id)) {
      const actual = values.reduce((sum, s) => sum + (s.actual || 0), 0);
      setActivity.run(r.date, r.shift, r.row_id, actual, actual > 0 ? r.updated_at : null);
    }
    if (values.some((s) => !s.id) || !r.row_snapshot) {
      const slots = values.map((s, i) => (s.id ? s : { ...s, ...schedule[i] }));
      migrate.run(
        JSON.stringify(slots),
        r.row_snapshot ||
          JSON.stringify(
            template.rows.find((t) => t.id === r.row_id) ||
              config.rows.find((t) => t.id === r.row_id),
          ),
        r.date,
        r.shift,
        r.row_id,
      );
    }
  }
});
const selectAll = db.prepare(
  'SELECT * FROM production_records WHERE date=? AND shift=? ORDER BY row_id',
);
const selectOne = db.prepare(
  'SELECT * FROM production_records WHERE date=? AND shift=? AND row_id=?',
);
const upsert =
  db.prepare(`INSERT INTO production_records(date,shift,row_id,day_team,night_team,daily_target,owner,slots,version,updated_at,row_snapshot,updated_by,defaults_snapshot)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date,shift,row_id) DO UPDATE SET day_team=excluded.day_team,night_team=excluded.night_team,daily_target=excluded.daily_target,owner=excluded.owner,slots=excluded.slots,version=excluded.version,updated_at=excluded.updated_at,row_snapshot=excluded.row_snapshot,updated_by=excluded.updated_by,defaults_snapshot=excluded.defaults_snapshot`);
function unpack(r) {
  return {
    rowId: r.row_id,
    dayTeam: r.day_team,
    nightTeam: r.night_team,
    dailyTarget: r.daily_target,
    owner: r.owner,
    slots: JSON.parse(r.slots),
    rowSnapshot: r.row_snapshot ? JSON.parse(r.row_snapshot) : null,
    defaultsSnapshot: r.defaults_snapshot ? JSON.parse(r.defaults_snapshot) : null,
    version: r.version,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}
function fail(status, code, params = {}) {
  const error = new Error(code);
  Object.assign(error, { status, code, params });
  throw error;
}
function scope(date, shift) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    fail(400, 'errDate');
  if (!['day', 'night'].includes(shift)) fail(400, 'errShift');
}
/** An import may span both shifts, but each record keeps its own shift key.
 * Capture both baselines together and commit them in the same transaction. */
function importSnapshot(date, shift) {
  scope(date, shift === 'all' ? 'day' : shift);
  const shifts = shift === 'all' ? ['day', 'night'] : [shift];
  const defaults = Object.fromEntries(
    shifts.map((value) => [value, productionDayDefaults(date, value)]),
  );
  return {
    config: structuredClone(config),
    defaults: shift === 'all' ? defaults : defaults[shift],
    records: shifts.flatMap((value) =>
      selectAll.all(date, value).map((row) => ({ ...unpack(row), shift: value })),
    ),
    versions: Object.fromEntries(
      shifts.flatMap((value) =>
        db
          .prepare('SELECT row_id,version FROM record_revisions WHERE date=? AND shift=?')
          .all(date, value)
          .map((row) => [`${value}|${row.row_id}`, row.version]),
      ),
    ),
  };
}
function string(value, max = 200) {
  if (typeof value !== 'string' || value.length > max) fail(400, 'errText', { max });
  return value.trim();
}
function count(value) {
  if (value === null || value === '') return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 99999999) fail(400, 'errCount');
  return value;
}
async function body(req, maxBytes = 1024 * 1024) {
  // A UTF-8 character may span network chunks. Decode once after enforcing a byte
  // limit, otherwise Chinese/Thai text can acquire replacement characters on save.
  const chunks = [];
  let bytes = 0;
  // Drain oversized bodies without retaining their bytes. Abandoning the request
  // iterator destroys or leaves unread data on the keep-alive connection, causing
  // the next legitimate save to hang or fail with ECONNRESET.
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) chunks.length = 0;
    else chunks.push(chunk);
  }
  if (bytes > maxBytes) fail(413, 'errSize');
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'errJson');
    return parsed;
  } catch {
    fail(400, 'errJson');
  }
}
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}
function publicConfig(role = 'admin') {
  const result = {
    ...config,
    issuePresets: issuePresets(config),
    slots: config.schedules.day
      .filter((s) => s.kind === 'production')
      .map((s) => `${s.start}-${s.end}`),
    break: config.schedules.day
      .filter((s) => s.kind === 'break')
      .map((s) => `${s.start}-${s.end}`)
      .join(', '),
  };
  if (role !== 'admin') {
    delete result.jobs;
    delete result.stations;
    delete result.nextRowId;
  }
  return result;
}
function validateConfig(data) {
  if (data.version !== config.version) fail(409, 'errConfigConflict');
  const next = structuredClone(config);
  if (Object.hasOwn(data, 'issuePresets')) {
    if (!validateIssuePresets(data.issuePresets)) fail(400, 'errIssuePresets');
    next.issuePresets = structuredClone(data.issuePresets);
  }
  for (const name of ['lines', 'models', 'jobs', 'stations']) {
    if (!Array.isArray(data[name]) || data[name].length > 200) fail(400, 'errCatalog');
    next[name] = data[name].map((s) => string(s, 60));
    if (
      next[name].some((s) => !s) ||
      new Set(next[name].map((s) => s.toLocaleLowerCase())).size !== next[name].length
    )
      fail(400, 'errDuplicate');
  }
  if (!Array.isArray(data.rows) || data.rows.length > 2000) fail(400, 'errRows');
  const ids = new Set(),
    combinations = new Set(),
    newRowIds = new Map();
  next.rows = data.rows.map((r) => {
    if (!r || typeof r !== 'object') fail(400, 'errRows');
    let id = r.id;
    if (id == null || (typeof id === 'string' && id.startsWith('new-'))) {
      id = next.nextRowId++;
      if (r.id) newRowIds.set(r.id, id);
    } else if (!Number.isSafeInteger(id) || !config.rows.some((row) => row.id === id))
      fail(400, 'errRows');
    if (ids.has(id)) fail(400, 'errDuplicate');
    ids.add(id);
    const previous = config.rows.find((old) => old.id === id);
    if (Object.hasOwn(r, 'hasOutput') && typeof r.hasOutput !== 'boolean') fail(400, 'errRows');
    if (previous && (previous.deleted || r.deleted === true))
      return { ...previous, deleted: true, active: false };
    const row = {
      id,
      plant: config.plant,
      line: string(r.line, 60),
      model: string(modelOf(r), 60),
      job: r.job ? string(r.job, 60) : null,
      station: r.station ? string(r.station, 60) : null,
      active: r.active !== false,
      hasOutput: r.hasOutput ?? previous?.hasOutput ?? true,
      ...(r.deleted === true ? { deleted: true, active: false } : {}),
      dailyTarget: count(
        Object.hasOwn(r, 'dailyTarget')
          ? r.dailyTarget
          : (config.rows.find((row) => row.id === id)?.dailyTarget ?? null),
      ),
    };
    if (row.active) {
      const existing = config.rows.find((old) => old.id === id);
      // A catalog rename keeps the identity; a model reassignment needs a new ID.
      if (existing && modelOf(existing) !== row.model && next.models.includes(modelOf(existing)))
        fail(400, 'errMapping');
      if (
        !next.lines.includes(row.line) ||
        !next.models.includes(row.model) ||
        (row.job && !next.jobs.includes(row.job)) ||
        (row.station && !next.stations.includes(row.station)) ||
        (!row.job && !row.station)
      )
        fail(400, 'errMapping');
      const key = JSON.stringify([row.line, row.model, row.job, row.station]);
      if (combinations.has(key)) fail(400, 'errDuplicateMapping');
      combinations.add(key);
    }
    return row;
  });
  for (const row of config.rows)
    if (!ids.has(row.id)) next.rows.push({ ...row, active: false, deleted: true });
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const allIds = new Set();
  const shiftRanges = {};
  for (const shift of ['day', 'night']) {
    const schedule = data.schedules?.[shift];
    if (
      !Array.isArray(schedule) ||
      !schedule.length ||
      schedule.length > 48 ||
      !schedule.some((s) => s?.kind === 'production')
    )
      fail(400, 'errSchedule');
    const ranges = [];
    next.schedules[shift] = schedule.map((s) => {
      if (
        !s ||
        !['production', 'break'].includes(s.kind) ||
        !timePattern.test(s.start) ||
        !timePattern.test(s.end)
      )
        fail(400, 'errTime');
      const start = minutes(s.start),
        end = minutes(s.end);
      if (start === end) fail(400, 'errTime');
      const duration = (end - start + 1440) % 1440;
      if (duration > 720) fail(400, 'errDuration');
      if (end > start) ranges.push([start, end]);
      else ranges.push([start, 1440], [0, end]);
      const old = config.schedules[shift].find((v) => v.id === s.id);
      const id =
        old && old.start === s.start && old.end === s.end && old.kind === s.kind
          ? old.id
          : `${shift}-${randomUUID()}`;
      if (allIds.has(id)) fail(400, 'errDuplicate');
      allIds.add(id);
      return { id, kind: s.kind, start: s.start, end: s.end };
    });
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++)
      if (ranges[i][0] < ranges[i - 1][1]) fail(400, 'errOverlap', { shift });
    shiftRanges[shift] = ranges;
  }
  // A clock interval must belong to one shift. Legacy installations with unchanged
  // overlapping schedules can still edit other settings until their times are fixed.
  const scheduleSignature = (schedules) =>
    JSON.stringify(
      ['day', 'night'].map((shift) =>
        schedules[shift].map(({ kind, start, end }) => ({ kind, start, end })),
      ),
    );
  if (
    scheduleSignature(next.schedules) !== scheduleSignature(config.schedules) &&
    shiftRanges.day.some((day) =>
      shiftRanges.night.some((night) => day[0] < night[1] && night[0] < day[1]),
    )
  )
    fail(400, 'errOverlap', { shift: 'day/night' });
  if (
    !['delta', 'green', 'indigo', 'amber', 'rose'].includes(data.theme) ||
    !locales.includes(data.language)
  )
    fail(400, 'errPreferences');
  const monitoring = data.monitoring || config.monitoring;
  if (
    !monitoring ||
    !Array.isArray(monitoring.groups) ||
    monitoring.groups.length > 50 ||
    !Array.isArray(monitoring.rules) ||
    monitoring.rules.length > 50 ||
    !Number.isSafeInteger(monitoring.refreshSeconds) ||
    monitoring.refreshSeconds < 1 ||
    monitoring.refreshSeconds > 3600 ||
    !['all', 'gap', 'idle'].includes(monitoring.alertMode)
  )
    fail(400, 'errMonitoring');
  const groupNames = new Set(),
    groupIds = new Set();
  next.monitoring = {
    groups: monitoring.groups.map((g) => {
      if (!g || typeof g !== 'object') fail(400, 'errMonitoring');
      const name = string(g.name, 60);
      if (
        !name ||
        groupNames.has(name.toLowerCase()) ||
        !Array.isArray(g.lines) ||
        g.lines.some((l) => !next.lines.includes(l))
      )
        fail(400, 'errMonitoring');
      groupNames.add(name.toLowerCase());
      const id = g.id == null ? randomUUID() : string(g.id, 80);
      if (!id || groupIds.has(id)) fail(400, 'errMonitoring');
      groupIds.add(id);
      return { id, name, lines: [...new Set(g.lines)] };
    }),
    outputSources: Object.create(null),
    rules: [],
  };
  for (const line of next.lines) {
    const rawSource = monitoring.outputSources?.[line],
      source = newRowIds.get(rawSource) || rawSource,
      rows = next.rows.filter((r) => r.active && stationHasOutput(r) && r.line === line);
    next.monitoring.outputSources[line] =
      source === 'all'
        ? 'all'
        : rows.find((r) => r.id === source)?.id ||
          (
            rows.find((r) => r.station === 'Pack') ||
            rows.filter((r) => r.station).at(-1) ||
            rows[0]
          )?.id ||
          null;
  }
  const ruleIds = new Set();
  next.monitoring.rules = monitoring.rules.map((r) => {
    if (
      !r ||
      !['gap', 'idle'].includes(r.type) ||
      !Number.isSafeInteger(r.threshold) ||
      r.threshold < 1 ||
      r.threshold > 99999999 ||
      !['gt', 'gte'].includes(r.comparison) ||
      !lampColors.includes(r.color) ||
      typeof r.blink !== 'boolean' ||
      typeof r.enabled !== 'boolean' ||
      typeof r.id !== 'string' ||
      !r.id.trim() ||
      r.id.length > 80 ||
      ruleIds.has(r.id)
    )
      fail(400, 'errMonitoring');
    ruleIds.add(r.id);
    return {
      id: r.id,
      type: r.type,
      threshold: r.threshold,
      comparison: r.comparison,
      color: r.color,
      blink: r.blink,
      enabled: r.enabled,
    };
  });
  Object.assign(next.monitoring, {
    uiVersion: 2,
    refreshSeconds: monitoring.refreshSeconds,
    alertMode: monitoring.alertMode,
  });
  migrateRuleControls(next.monitoring);
  validateProductionDefaults(data, next, config, fail);
  const unitSources = monitoring.unitOutputSources ?? config.monitoring.unitOutputSources ?? {};
  if (!unitSources || typeof unitSources !== 'object' || Array.isArray(unitSources))
    fail(400, 'errMonitoring');
  next.monitoring.unitOutputSources = Object.fromEntries(
    next.productionUnits.map((unit) => {
      let raw = unitSources[productionKey(unit)];
      if (
        unit.model === 'Default' &&
        raw === config.monitoring.unitOutputSources?.[productionKey(unit)] &&
        monitoring.outputSources?.[unit.line] !== config.monitoring.outputSources?.[unit.line]
      )
        raw = monitoring.outputSources?.[unit.line];
      const source = newRowIds.get(raw) || raw;
      return [
        productionKey(unit),
        outputSourceFor(
          {
            ...next,
            monitoring: {
              ...next.monitoring,
              unitOutputSources: source === undefined ? {} : { [productionKey(unit)]: source },
            },
          },
          unit,
        ),
      ];
    }),
  );
  next.theme = data.theme;
  next.language = data.language;
  next.version++;
  return next;
}
// Only unsaved rows may inherit the opposite shift's captured production-day defaults.
function productionDayDefaults(date, shift, { sharedCounts = false } = {}) {
  const defaults = buildProductionDefaults(config, shift),
    records = selectAll.all(date, shift).map(unpack),
    saved = new Set(records.map((record) => record.rowId)),
    opposite = shift === 'day' ? 'night' : 'day';
  for (const raw of selectAll.all(date, opposite)) {
    const record = unpack(raw),
      captured = record.defaultsSnapshot?.productionDay?.[shift];
    if (captured && defaults[record.rowId] && !saved.has(record.rowId))
      defaults[record.rowId] = captured;
  }
  // Current station entries inherit only their own captured defaults. The
  // legacy shared endpoint can still complete old clients' atomic line writes.
  if (!sharedCounts) return defaults;
  // A station configured mid-day inherits the line's already reported shared
  // counts. Creating its first issue note must not create a blank output row.
  for (const row of config.rows.filter((row) => row.active && !saved.has(row.id))) {
    const base = defaults[row.id];
    if (!base) continue;
    const peers = records.filter((record) =>
      sameProduction(
        record.rowSnapshot || config.rows.find((mapping) => mapping.id === record.rowId),
        row,
      ),
    );
    base.slots = base.slots.map((slot) => {
      const values = peers.flatMap((record) =>
        record.slots.filter((value) => value.start === slot.start && value.end === slot.end),
      );
      const target = values.find((value) => value.targetShared);
      const actual = values.find((value) => value.lineShared);
      return {
        ...slot,
        ...(target ? { target: target.target, targetShared: true } : {}),
        ...(actual ? { actual: actual.actual, lineShared: true } : {}),
      };
    });
    base.dailyTarget = base.slots.some((slot) => slot.target != null)
      ? base.slots.reduce((sum, slot) => sum + (slot.target ?? 0), 0)
      : null;
  }
  return defaults;
}

/** Save one versioned record inside the caller's write transaction (also used by imports). */
function writeRecord(rowId, data, user, method = 'PUT') {
  refreshConfig();
  const row = config.rows.find((r) => r.id === rowId);
  if (!row) fail(404, 'errNotFound');
  scope(data.date, data.shift);
  if (!Number.isSafeInteger(data.version) || data.version < 0) fail(400, 'errVersion');
  const raw = selectOne.get(data.date, data.shift, rowId),
    current = raw ? unpack(raw) : null;
  const currentVersion = revision.get(data.date, data.shift, rowId)?.version || 0;
  if (currentVersion !== data.version) fail(409, 'errConflict');
  const nextVersion = currentVersion + 1,
    now = new Date().toISOString();
  if (method === 'DELETE') {
    if (!current) fail(404, 'errNotFound');
    db.prepare('DELETE FROM production_records WHERE date=? AND shift=? AND row_id=?').run(
      data.date,
      data.shift,
      rowId,
    );
    db.prepare('DELETE FROM production_activity WHERE date=? AND shift=? AND row_id=?').run(
      data.date,
      data.shift,
      rowId,
    );
    // Retain the revision tombstone so deleting and recreating cannot admit stale edits.
    setRevision.run(data.date, data.shift, rowId, nextVersion);
    audit.run(user.username, 'delete', data.date, data.shift, rowId, nextVersion, now);
    return { ok: true, version: nextVersion };
  }
  if (data.configVersion !== config.version) fail(409, 'errConfigConflict');
  if (!row.active && !current) fail(400, 'errArchived');
  if (!stationHasOutput(row)) fail(400, 'errNoOutput');
  const oppositeRaw =
    !current && selectOne.get(data.date, data.shift === 'day' ? 'night' : 'day', rowId);
  const opposite = oppositeRaw ? unpack(oppositeRaw) : null;
  const lineDefaults = !current
    ? productionDayDefaults(data.date, data.shift, {
        sharedCounts: data.sharedLineActual === true || data.sharedLineTargets === true,
      })[rowId]
    : null;
  const resolved = resolveEntryData(config, row, data, current, fail, {
    allowLegacyMetadata: user.role === 'admin',
    opposite,
    lineDefaults,
  });
  data = resolved.data;
  if (!Array.isArray(data.slots) || !data.slots.length || data.slots.length > 96)
    fail(400, 'errSlotData');
  const schedule = config.schedules[data.shift].filter((s) => s.kind === 'production');
  const allowed = new Map(
    [...schedule, ...(resolved.defaultsSnapshot ? data.slots : []), ...(current?.slots || [])].map(
      (s) => [s.id, s],
    ),
  );
  const suppliedIds = new Set();
  if (data.slots.some((s) => s && !s.id) && data.slots.length !== schedule.length)
    fail(400, 'errSlotData');
  const slots = data.slots.map((s, i) => {
    if (!s || typeof s !== 'object') fail(400, 'errSlotData');
    const slot = allowed.get(s.id || schedule[i]?.id);
    if (!slot || suppliedIds.has(slot.id)) fail(400, 'errSlotData');
    suppliedIds.add(slot.id);
    return {
      id: slot.id,
      start: slot.start,
      end: slot.end,
      kind: 'production',
      target: count(s.target),
      actual: count(s.actual),
      ...(s.lineShared ? { lineShared: true } : {}),
      ...(s.targetShared ? { targetShared: true } : {}),
      issue: string(s.issue, 2000),
    };
  });
  for (const s of current?.slots || []) if (!suppliedIds.has(s.id)) slots.push(s);
  const dayTeam = string(data.dayTeam, 100000),
    nightTeam = string(data.nightTeam, 100000),
    owner = string(data.owner, 100000),
    dailyTarget = count(data.dailyTarget);
  if (
    !current &&
    currentVersion === 0 &&
    !dayTeam &&
    !nightTeam &&
    !owner &&
    dailyTarget === null &&
    slots.every((s) => s.target === null && s.actual === null && !s.issue)
  )
    fail(400, 'errEmpty');
  upsert.run(
    data.date,
    data.shift,
    rowId,
    dayTeam,
    nightTeam,
    dailyTarget,
    owner,
    JSON.stringify(slots),
    nextVersion,
    now,
    JSON.stringify(
      current?.rowSnapshot ||
        (resolved.defaultsSnapshot?.productionDay && opposite?.rowSnapshot) ||
        row,
    ),
    user.username,
    resolved.defaultsSnapshot ? JSON.stringify(resolved.defaultsSnapshot) : null,
  );
  const actual = slots.reduce((sum, s) => sum + (s.actual || 0), 0),
    previousActual = (
      current?.slots ||
      (resolved.defaultsSnapshot ? lineDefaults?.slots : null) ||
      []
    ).reduce((sum, slot) => sum + (slot.actual || 0), 0),
    previousActivity = getActivity.get(data.date, data.shift, rowId);
  // Inheriting already reported line output is not a fresh production increase.
  // Carry its activity clock so a new station note cannot reset an idle alarm.
  const inheritedIncrease =
    !current && resolved.defaultsSnapshot && lineDefaults?.slots.some((slot) => slot.lineShared)
      ? selectAll
          .all(data.date, data.shift)
          .map(unpack)
          .filter((record) =>
            sameProduction(
              record.rowSnapshot || config.rows.find((mapping) => mapping.id === record.rowId),
              row,
            ),
          )
          .map((record) => getActivity.get(data.date, data.shift, record.rowId)?.last_increase_at)
          .filter(Boolean)
          .sort()
          .at(-1)
      : null;
  const lastIncrease =
    actual > previousActual ? now : previousActivity?.last_increase_at || inheritedIncrease || null;
  setActivity.run(data.date, data.shift, rowId, actual, lastIncrease);
  setRevision.run(data.date, data.shift, rowId, nextVersion);
  audit.run(
    user.username,
    current ? 'update' : 'create',
    data.date,
    data.shift,
    rowId,
    nextVersion,
    now,
  );
  return {
    ...unpack(selectOne.get(data.date, data.shift, rowId)),
    activity: { lastIncreaseAt: lastIncrease, totalActual: actual },
  };
}
const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
const files = {
  // Explicit guide assets only; no general filesystem or documentation access.
  ...Object.fromEntries(
    [
      'setup-order',
      'models-and-lines',
      'issue-quick-text',
      'line-people',
      'people-by-job',
      'line-configuration',
      'daily-targets',
      'production-entry',
      'production-entry-paste',
      'production-cell',
      'issue-editor',
      'interval-batch',
      'no-output-station',
      'excel-preview',
      'line-details',
    ].map((name) => [`/guide-images/${name}.png`, [`../docs/images/${name}.png`, 'image/png']]),
  ),
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/pages.js': ['pages.js', 'text/javascript'],
  '/issue-presets.js': ['issue-presets.js', 'text/javascript'],
  '/i18n.js': ['i18n.js', 'text/javascript'],
  '/monitor.js': ['monitor.js', 'text/javascript'],
  '/dashboard.js': ['dashboard.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/entry.js': ['entry.js', 'text/javascript'],
  '/entry.css': ['entry.css', 'text/css'],
  '/workforce-settings.js': ['workforce-settings.js', 'text/javascript'],
  '/production-targets.js': ['production-targets.js', 'text/javascript'],
  '/production-models.js': ['production-models.js', 'text/javascript'],
  '/catalog-settings.js': ['catalog-settings.js', 'text/javascript'],
  '/workforce.css': ['workforce.css', 'text/css'],
  '/help.js': ['help.js', 'text/javascript'],
  '/line-detail.js': ['line-detail.js', 'text/javascript'],
  '/workflow.css': ['workflow.css', 'text/css'],
};
const server = http.createServer(async (req, res) => {
  let lang = 'zh';
  try {
    const url = new URL(req.url, 'http://localhost');
    lang =
      url.searchParams.get('lang') ||
      req.headers['accept-language']?.split(',')[0]?.split('-')[0] ||
      'zh';
    if (!locales.includes(lang)) lang = 'zh';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (['PUT', 'DELETE', 'POST'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
        fail(403, 'errOrigin');
      if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'errJson');
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const data = await body(req),
        result = auth.login(req, data.username, data.password);
      if (result.code) fail(result.status, result.code);
      res.setHeader('Set-Cookie', auth.cookie(req, result.token));
      return json(res, 200, { user: result.user });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      auth.logout(req);
      res.setHeader('Set-Cookie', auth.cookie(req, ''));
      return json(res, 200, { ok: true });
    }
    const user = auth.current(req);
    if (url.pathname.startsWith('/api/') && !user) fail(401, 'errAuth');
    if (req.method === 'GET' && url.pathname === '/api/auth/me') return json(res, 200, { user });
    if (req.method === 'GET' && url.pathname === '/api/config') {
      refreshConfig();
      return json(res, 200, publicConfig(user.role));
    }
    if (req.method === 'GET' && url.pathname === '/api/defaults') {
      const date = url.searchParams.get('date'),
        shift = url.searchParams.get('shift');
      scope(date, shift);
      const result = transaction(() => {
        refreshConfig();
        return {
          date,
          shift,
          configVersion: config.version,
          rows: productionDayDefaults(date, shift),
        };
      }, 'DEFERRED');
      return json(res, 200, result);
    }
    if (req.method === 'PUT' && url.pathname === '/api/config') {
      if (user.role !== 'admin') fail(403, 'errForbidden');
      const data = await body(req);
      const result = transaction(() => {
        refreshConfig();
        const next = validateConfig(data);
        db.prepare('UPDATE app_settings SET value=? WHERE id=1').run(JSON.stringify(next));
        config = next;
        audit.run(
          user.username,
          'settings',
          null,
          null,
          null,
          config.version,
          new Date().toISOString(),
        );
        return publicConfig();
      });
      return json(res, 200, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/import/template') {
      const date = url.searchParams.get('date'),
        shift = url.searchParams.get('shift');
      scope(date, shift === 'all' ? 'day' : shift);
      const spreadsheet = transaction(() => {
        refreshConfig();
        const captured = importSnapshot(date, shift);
        return importTemplate(config, shift, date, captured.defaults, captured.records);
      }, 'DEFERRED');
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="BP9-import-${date}-${shift}.xlsx"`,
        'Cache-Control': 'no-store',
      });
      return res.end(spreadsheet);
    }
    if (req.method === 'POST' && url.pathname === '/api/import/preview') {
      const data = await body(req, 12 * 1024 * 1024);
      scope(data.date, data.shift === 'all' ? 'day' : data.shift);
      // Parse before taking the write lock, then verify the captured configuration.
      // The preview persists only a short-lived plan; no production row is changed.
      const captured = transaction(() => {
        refreshConfig();
        return importSnapshot(data.date, data.shift);
      }, 'DEFERRED');
      const preview = previewImport(
        data.fileName,
        data.base64,
        captured.config,
        data.date,
        data.shift,
        captured.records,
        lang,
        captured.defaults,
      );
      const result = transaction(() => {
        refreshConfig();
        if (config.version !== captured.config.version) fail(409, 'errConfigConflict');
        const now = Date.now();
        db.prepare('DELETE FROM import_previews WHERE expires_at<=?').run(now);
        for (const row of preview.rows) {
          const shift = row.shift || data.shift;
          row.version = captured.versions[`${shift}|${row.rowId}`] || 0;
          if ((revision.get(data.date, shift, row.rowId)?.version || 0) !== row.version)
            fail(409, 'errConflict');
        }
        const token = preview.errors.length ? null : randomBytes(32).toString('hex');
        if (token) {
          const plan = {
            date: data.date,
            shift: data.shift,
            configVersion: config.version,
            rows: preview.rows,
          };
          db.prepare(
            'INSERT INTO import_previews(token_hash,username,expires_at,payload) VALUES(?,?,?,?)',
          ).run(
            createHash('sha256').update(token).digest('hex'),
            user.username,
            now + 15 * 60 * 1000,
            JSON.stringify(plan),
          );
        }
        return {
          ...preview,
          token,
          date: data.date,
          shift: data.shift,
          configVersion: config.version,
        };
      });
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/import/apply') {
      const data = await body(req);
      if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token))
        fail(400, 'errImportExpired');
      const result = transaction(() => {
        const tokenHash = createHash('sha256').update(data.token).digest('hex'),
          saved = db
            .prepare(
              'SELECT * FROM import_previews WHERE token_hash=? AND username=? AND expires_at>?',
            )
            .get(tokenHash, user.username, Date.now());
        if (!saved) fail(410, 'errImportExpired');
        const plan = JSON.parse(saved.payload);
        refreshConfig();
        if (config.version !== plan.configVersion) fail(409, 'errConfigConflict');
        // All rows share this transaction: any stale record/config version rolls back
        // every preceding save, its activity, audit event, and revision together.
        const records = plan.rows.map((row) => ({
          ...writeRecord(
            row.rowId,
            {
              date: plan.date,
              shift: row.shift || plan.shift,
              version: row.version,
              configVersion: plan.configVersion,
              entryMode: true,
              editTargets: true,
              sharedLineActual: false,
              sharedLineTargets: false,
              slots: row.changes.map((change) => ({
                id: change.slotId,
                ...(Object.hasOwn(change, 'target') ? { target: change.target } : {}),
                ...(Object.hasOwn(change, 'actual') ? { actual: change.actual } : {}),
                ...(Object.hasOwn(change, 'issue') ? { issue: change.issue } : {}),
              })),
            },
            user,
          ),
          date: plan.date,
          shift: row.shift || plan.shift,
        }));
        db.prepare('DELETE FROM import_previews WHERE token_hash=?').run(tokenHash);
        return {
          records,
          date: plan.date,
          shift: plan.shift,
          configVersion: plan.configVersion,
          summary: {
            records: records.length,
            cells: plan.rows.reduce(
              (sum, row) =>
                sum +
                row.changes.reduce(
                  (count, change) =>
                    count +
                    Number(Object.hasOwn(change, 'target')) +
                    Number(Object.hasOwn(change, 'actual')) +
                    Number(Object.hasOwn(change, 'issue')),
                  0,
                ),
              0,
            ),
          },
        };
      });
      return json(res, 200, result);
    }
    if (req.method === 'GET' && ['/api/records', '/api/export'].includes(url.pathname)) {
      const date = url.searchParams.get('date'),
        shift = url.searchParams.get('shift');
      scope(date, shift);
      const snapshot = transaction(() => {
        refreshConfig();
        return {
          records: selectAll.all(date, shift).map(unpack),
          defaults: productionDayDefaults(date, shift),
          activity: Object.fromEntries(
            db
              .prepare(
                'SELECT row_id,last_increase_at,total_actual FROM production_activity WHERE date=? AND shift=?',
              )
              .all(date, shift)
              .map((r) => [
                r.row_id,
                { lastIncreaseAt: r.last_increase_at, totalActual: r.total_actual },
              ]),
          ),
          rowVersions: Object.fromEntries(
            db
              .prepare('SELECT row_id,version FROM record_revisions WHERE date=? AND shift=?')
              .all(date, shift)
              .map((r) => [r.row_id, r.version]),
          ),
        };
      }, 'DEFERRED');
      const { records, rowVersions } = snapshot;
      if (url.pathname === '/api/records')
        return json(res, 200, {
          records,
          rowVersions,
          activity: snapshot.activity,
          defaults: snapshot.defaults,
          serverTime: Date.now(),
          configVersion: config.version,
        });
      const t = (key, params) => translate(lang, key, params),
        line = url.searchParams.get('line'),
        groupId = url.searchParams.get('group'),
        group = config.monitoring.groups.find((g) => g.id === groupId);
      if (groupId && !group) fail(400, 'errMonitoring');
      const exportRows = config.rows
        .filter((r) => r.active || records.some((v) => v.rowId === r.id))
        .map((r) => records.find((v) => v.rowId === r.id)?.rowSnapshot || r)
        .filter(
          (r) =>
            (!line || r.line === line || productionKey(r) === line) &&
            (!group || group.lines.includes(r.line)),
        );
      const rows = [
        [
          t('reportDate'),
          t('shift'),
          t('plant'),
          t('line'),
          t('job'),
          t('station'),
          t('dayTeam'),
          t('nightTeam'),
          t('dailyTarget'),
          t('dailyActual'),
          t('dailyGap'),
          t('owner'),
          t('timeSlot'),
          t('target'),
          t('actual'),
          t('gap'),
          t('issue'),
          'Model',
        ],
      ];
      for (const row of exportRows) {
        const r = records.find((r) => r.rowId === row.id) || snapshot.defaults[row.id],
          actuals = r?.slots.filter((s) => s.actual !== null).map((s) => s.actual) || [],
          actual = actuals.length ? actuals.reduce((a, b) => a + b, 0) : null;
        const slots = [...(r?.slots || [])];
        for (const s of config.schedules[shift].filter((s) => s.kind === 'production'))
          if (!slots.some((v) => v.id === s.id)) slots.push(s);
        for (const slot of slots) {
          const m = r?.slots.find((s) => s.id === slot.id);
          rows.push([
            date,
            t(shift),
            row.plant,
            row.line,
            row.job,
            row.station,
            r?.dayTeam,
            r?.nightTeam,
            r?.dailyTarget,
            actual,
            actual !== null && r?.dailyTarget != null ? actual - r.dailyTarget : null,
            r?.owner,
            `${slot.start}-${slot.end}`,
            m?.target,
            m?.actual,
            m?.actual != null && m?.target != null ? m.actual - m.target : null,
            m?.issue,
            modelOf(row),
          ]);
        }
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="BP9-${date}-${shift}-${lang}.csv"`,
        'Cache-Control': 'no-store',
      });
      return res.end('\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'));
    }
    if (url.pathname === '/api/entry/interval' && req.method === 'PUT') {
      const data = await body(req);
      const result = transaction(() => {
        refreshConfig();
        scope(data.date, data.shift);
        if (data.configVersion !== config.version) fail(409, 'errConfigConflict');
        const records = selectAll.all(data.date, data.shift).map(unpack);
        const versions = new Map(
          config.rows.map((row) => [
            row.id,
            revision.get(data.date, data.shift, row.id)?.version || 0,
          ]),
        );
        const patches = planStationInterval(
          data,
          config,
          records,
          productionDayDefaults(data.date, data.shift),
          versions,
          fail,
        );
        const saved = patches.map((patch) =>
          writeRecord(
            patch.rowId,
            {
              date: data.date,
              shift: data.shift,
              configVersion: config.version,
              version: patch.version,
              slots: patch.slots,
              entryMode: true,
              editTargets: true,
              sharedLineActual: false,
              sharedLineTargets: false,
            },
            user,
          ),
        );
        return { records: saved, configVersion: config.version };
      });
      return json(res, 200, result);
    }
    const entryMatch = url.pathname.match(/^\/api\/entry\/records\/(\d+)$/);
    if (entryMatch && req.method === 'PUT') {
      const data = await body(req),
        rowId = Number(entryMatch[1]);
      const result = transaction(() => {
        refreshConfig();
        scope(data.date, data.shift);
        if (data.configVersion !== config.version) fail(409, 'errConfigConflict');
        // The current worksheet owns a row per station. Keep the old shared
        // API path available for older clients, with an explicit independent
        // mode that cannot advance any peer station's revision or values.
        if (data.stationEntry === true)
          return writeRecord(
            rowId,
            {
              ...data,
              entryMode: true,
              editTargets: true,
              sharedLineActual: false,
              sharedLineTargets: false,
            },
            user,
          );
        if (
          !Array.isArray(data.slots) ||
          !data.slots.length ||
          data.slots.length > 96 ||
          data.slots.some((slot) => !slot || typeof slot !== 'object')
        )
          fail(400, 'errSlotData');
        const patches = data.slots.some((slot) =>
          ['target', 'actual'].some((field) => Object.hasOwn(slot, field)),
        )
          ? planLineOutput(
              rowId,
              data.slots,
              data.expectedValues || data.expectedActuals,
              config.rows,
              selectAll.all(data.date, data.shift).map(unpack),
              productionDayDefaults(data.date, data.shift),
              fail,
            )
          : [];
        const saved = writeRecord(
          rowId,
          {
            ...data,
            entryMode: true,
            editTargets: true,
            sharedLineActual: true,
            sharedLineTargets: true,
          },
          user,
        );
        const syncedRecords = patches
          .filter((patch) => patch.rowId !== rowId)
          .map((patch) =>
            writeRecord(
              patch.rowId,
              {
                date: data.date,
                shift: data.shift,
                configVersion: config.version,
                version: revision.get(data.date, data.shift, patch.rowId)?.version || 0,
                entryMode: true,
                sharedLineActual: true,
                editTargets: true,
                sharedLineTargets: true,
                slots: patch.slots,
              },
              user,
            ),
          );
        return { ...saved, syncedRecords };
      });
      return json(res, 200, result);
    }
    const match = url.pathname.match(/^\/api\/records\/(\d+)$/);
    if (match && ['PUT', 'DELETE'].includes(req.method)) {
      if (req.method === 'DELETE' && user.role !== 'admin') fail(403, 'errForbidden');
      const data = await body(req),
        rowId = Number(match[1]);
      const result = transaction(() => {
        return writeRecord(rowId, data, user, req.method);
      });
      return json(res, 200, result);
    }
    const staticFile = files[url.pathname] || (resolvePage(url.pathname) ? files['/'] : null);
    if (req.method === 'GET' && staticFile) {
      const [file, type] = staticFile;
      res.writeHead(200, {
        'Content-Type': type.startsWith('image/') ? type : `${type}; charset=utf-8`,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      return res.end(readFileSync(path.join(root, 'public', file)));
    }
    fail(404, 'errNotFound');
  } catch (error) {
    if (error.errcode === 5 || error.errcode === 6) {
      error.status = 503;
      error.code = 'errBusy';
    }
    if (!error.status) console.error(error);
    json(res, error.status || 500, {
      error: translate(lang, error.code || 'errServer', error.params),
      code: error.code || 'errServer',
      params: error.params || {},
    });
  }
});
// Use an uncommon application port; PORT still supports site-specific deployment.
const port = Number(process.env.PORT || 43871);
server.listen(port, '0.0.0.0', () =>
  console.log(`BP PULSE running at http://localhost:${port}\nSQLite: ${databasePath}`),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  db.close();
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
