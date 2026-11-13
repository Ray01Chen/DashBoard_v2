import { validateStationValues } from './actual-completion.mjs';
import {
  scheduleFor,
  reportSchedule,
  isArchivedProductionDate,
} from './public/production-schedules.js';
import { reportDefaultTarget } from './public/production-targets.js';
import { sameProduction, unitFor, stationHasOutput } from './public/production-models.js';
/**
 * Match a production interval by its captured boundaries. IDs may change when
 * a schedule is rebuilt, so an ID alone must never redirect historical output.
 */
export function matchingInterval(slots, interval) {
  return slots.find((slot) => slot.start === interval.start && slot.end === interval.end);
}

/** Reset is independent of completion: derive targets on the server, always
 * clear actuals and omit issues. Validate every eligible station before writes. */
export function planStationReset(data, config, report, fail) {
  if (
    typeof data.line !== 'string' ||
    typeof data.model !== 'string' ||
    !data.interval ||
    typeof data.interval.start !== 'string' ||
    typeof data.interval.end !== 'string' ||
    ['rows', 'values', 'completeActuals', 'throughLatest', 'operation'].some((key) =>
      Object.hasOwn(data, key),
    )
  )
    fail(400, 'errSlotData');
  const saved = new Map(report.records.map((record) => [record.rowId, record]));
  const eligible = config.rows.flatMap((row) => {
    const record = saved.get(row.id);
    if (
      !row.active ||
      row.deleted ||
      !stationHasOutput(row) ||
      !sameProduction(record?.rowSnapshot || row, data)
    )
      return [];
    const defaults = report.defaults[row.id];
    const interval = matchingInterval(
      reportSchedule(
        config,
        data.line,
        data.shift,
        data.date,
        record?.slots || defaults?.slots || [],
      ),
      data.interval,
    );
    return interval ? [{ row, record, defaults, interval }] : [];
  });
  if (!eligible.length) fail(400, 'errSlotData');
  if (!Array.isArray(data.expectedVersions) || data.expectedVersions.length !== eligible.length)
    fail(409, 'errConflict');
  const expected = new Map(data.expectedVersions.map((item) => [item?.rowId, item?.version]));
  if (expected.size !== eligible.length) fail(409, 'errConflict');
  return eligible.map(({ row, record, defaults, interval }) => {
    const version = record?.version ?? report.rowVersions[row.id] ?? 0;
    if (!Number.isSafeInteger(expected.get(row.id)) || expected.get(row.id) !== version)
      fail(409, 'errConflict');
    return {
      rowId: row.id,
      version,
      preserveSchedule: isArchivedProductionDate(config, data.line, data.date),
      slots: [
        {
          id: interval.id,
          target: reportDefaultTarget(
            config,
            record?.rowSnapshot || row,
            data.date,
            data.shift,
            interval,
            record,
            defaults,
          ),
          actual: null,
        },
      ],
    };
  });
}

/** Explicit interval fill is a one-time atomic replacement, not shared state.
 * Individual edits made before this preview may differ and are overwritten.
 * Revisions protect changes made after preview; all checks precede all writes. */
export function planStationInterval(data, config, versions, fail) {
  if (!unitFor(config, data)) fail(400, 'errMapping');
  const rows = config.rows.filter(
    (row) => row.active && !row.deleted && stationHasOutput(row) && sameProduction(row, data),
  );
  if (!rows.length) fail(400, 'errMapping');
  // Older clients send one value set for the unit. The editable interval sheet
  // sends a distinct patch per changed station; never write untouched stations.
  const individual = Object.hasOwn(data, 'rows');
  if (individual && (Object.hasOwn(data, 'values') || !Array.isArray(data.rows)))
    fail(400, 'errCount');
  const changes = individual
    ? data.rows
    : rows.map((row) => ({ rowId: row.id, values: data.values }));
  if (!changes.length || new Set(changes.map((item) => item?.rowId)).size !== changes.length)
    fail(400, 'errCount');
  for (const change of changes) {
    if (!rows.some((row) => row.id === change?.rowId)) fail(400, 'errMapping');
    validateStationValues(change.values, fail);
  }
  if (
    !data.interval ||
    typeof data.interval.start !== 'string' ||
    typeof data.interval.end !== 'string'
  )
    fail(400, 'errSlotData');
  if (!Array.isArray(data.expectedVersions) || data.expectedVersions.length !== changes.length)
    fail(409, 'errConflict');
  const expected = new Map(data.expectedVersions.map((item) => [item?.rowId, item?.version]));
  if (expected.size !== changes.length) fail(409, 'errConflict');
  // Batch entry always addresses the configured interval. Saved history is
  // preserved by writeRecord; it is neither a prerequisite nor a mapping source.
  const configured = scheduleFor(config, data.line, data.shift).filter(
    (slot) =>
      slot.kind === 'production' &&
      slot.start === data.interval.start &&
      slot.end === data.interval.end,
  );
  if (configured.length !== 1) fail(400, 'errSlotData');
  return changes.map(({ rowId, values }) => {
    const version = expected.get(rowId);
    if (!Number.isSafeInteger(version) || version < 0 || version !== (versions.get(rowId) || 0))
      fail(409, 'errConflict');
    return { rowId, version, slots: [{ id: configured[0].id, ...values }] };
  });
}

/**
 * Expand a line output edit into station patches before any writes occur.
 * Compare only the edited shared fields, allowing unrelated notes to coexist. Every
 * participating station and expected value is checked inside the transaction;
 * a missing station, changed count or invalid interval rejects the whole edit.
 */
export function planLineOutput(sourceId, changes, expected, rows, records, defaults, fail) {
  const saved = new Map(records.map((record) => [record.rowId, record]));
  const mappings = rows
    .filter((row) => (row.active || saved.has(row.id)) && stationHasOutput(row))
    .map((row) => saved.get(row.id)?.rowSnapshot || row);
  const source = mappings.find((row) => row.id === sourceId);
  if (!source) fail(404, 'errNotFound');
  const peers = mappings.filter((row) => sameProduction(row, source));
  if (
    !Array.isArray(expected) ||
    expected.length !== peers.length ||
    expected.some((row) => !row || typeof row !== 'object')
  )
    fail(409, 'errConflict');
  const expectations = new Map(expected.map((row) => [row.rowId, row]));
  if (expectations.size !== peers.length) fail(409, 'errConflict');
  const sourceSlots = (saved.get(sourceId) || defaults[sourceId])?.slots || [];
  const shared = changes.filter((slot) =>
    ['target', 'actual'].some((field) => Object.hasOwn(slot, field)),
  );
  return peers.map((row) => {
    const slots = (saved.get(row.id) || defaults[row.id])?.slots || [];
    const previous = expectations.get(row.id);
    if (!previous || !Array.isArray(previous.slots)) fail(409, 'errConflict');
    return {
      rowId: row.id,
      slots: shared.map((change) => {
        const interval = sourceSlots.find((slot) => slot.id === change.id);
        const slot = interval && matchingInterval(slots, interval);
        if (!slot) fail(400, 'errSlotData');
        const before = previous.slots.find((value) => value && value.id === slot.id);
        if (!before) fail(409, 'errConflict');
        const patch = { id: slot.id };
        for (const field of ['target', 'actual']) {
          if (!Object.hasOwn(change, field)) continue;
          if (
            !Object.hasOwn(before, field) ||
            (before[field] ?? null) !== (slot[field] ?? null)
          )
            fail(409, 'errConflict');
          patch[field] = change[field];
        }
        return patch;
      }),
    };
  });
}
