import {
  actualWasReported,
  sameProduction,
  stationHasOutput,
} from './public/production-models.js';
import { intervalWindow } from './public/monitor.js';
import {
  reportSchedule,
  scheduleFor,
  isArchivedProductionDate,
} from './public/production-schedules.js';

const fields = ['target', 'actual', 'issue'];
export function validateStationValues(values, fail) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail(400, 'errCount');
  const names = Object.keys(values);
  if (!names.length || names.some((field) => !fields.includes(field))) fail(400, 'errCount');
  for (const [field, value] of Object.entries(values)) {
    if (field === 'issue') {
      if (typeof value !== 'string' || value.length > 2000) fail(400, 'errSlotData');
    } else if (
      value !== null &&
      (!Number.isSafeInteger(value) || value < 0 || value > 99999999)
    )
      fail(400, 'errCount');
  }
}

const scopeKey = (scope) =>
  JSON.stringify([
    scope.line,
    scope.model,
    scope.shift,
    scope.interval?.start,
    scope.interval?.end,
  ]);

/** The latest *human* actual anchors a production-day prefix. Automatic zeros
 * cannot extend that prefix themselves, and breaks never become report slots.
 * Pending numeric edits overlay the same transaction's fresh database snapshot. */
function expandThroughLatest(data, config, reports, fail) {
  const units = data.throughLatest || [];
  if (!Array.isArray(units) || units.length > config.rows.length) fail(400, 'errMapping');
  const scopes = (data.scopes || []).map((scope) => ({ ...scope, fillMissing: !units.length }));
  const scopeIndex = new Map(scopes.map((scope) => [scopeKey(scope), scope]));
  if (scopeIndex.size !== scopes.length) fail(400, 'errSlotData');
  const editsByScope = new Map(
    scopes.map((scope) => [
      scopeKey(scope),
      new Map(
        (Array.isArray(scope.rows) ? scope.rows : []).map((item) => [
          item?.rowId,
          item?.values,
        ]),
      ),
    ]),
  );
  const seenUnits = new Set();
  for (const unit of units) {
    if (
      !unit ||
      typeof unit.line !== 'string' ||
      typeof unit.model !== 'string' ||
      !Array.isArray(unit.shifts) ||
      !unit.shifts.length ||
      unit.shifts.length > 2 ||
      new Set(unit.shifts).size !== unit.shifts.length ||
      unit.shifts.some((shift) => !['day', 'night'].includes(shift))
    )
      fail(400, 'errMapping');
    const unitKey = JSON.stringify([unit.line, unit.model]);
    if (seenUnits.has(unitKey)) fail(400, 'errMapping');
    seenUnits.add(unitKey);
    const intervals = new Map();
    let cutoff = null,
      matched = false;
    const captured = Object.values(reports)
      .flatMap((report) => report.records)
      .filter((record) =>
        sameProduction(
          record.rowSnapshot || config.rows.find((row) => row.id === record.rowId),
          unit,
        ),
      );
    const capturedDay = captured
      .map((record) => record.defaultsSnapshot?.productionDay?.day?.slots?.[0]?.start)
      .find(Boolean);
    const dayRow = reports.day?.records.find((record) => captured.includes(record));
    const configuredAnchor = scheduleFor(config, unit.line, 'all')[0]?.start;
    const anchor = isArchivedProductionDate(config, unit.line, data.date)
      ? capturedDay ||
        dayRow?.slots[0]?.start ||
        configuredAnchor ||
        captured[0]?.slots[0]?.start ||
        '00:00'
      : configuredAnchor || '00:00';
    for (const shift of unit.shifts) {
      const report = reports[shift],
        saved = new Map(report.records.map((record) => [record.rowId, record]));
      for (const row of config.rows) {
        const record = saved.get(row.id);
        if (!stationHasOutput(row) || !sameProduction(record?.rowSnapshot || row, unit))
          continue;
        if ((row.active && !row.deleted) || record) matched = true;
        if (!row.active || row.deleted) continue;
        const values = record?.slots || report.defaults[row.id]?.slots || [];
        for (const slot of reportSchedule(config, unit.line, shift, data.date, values)) {
          const scope = {
            line: unit.line,
            model: unit.model,
            shift,
            interval: { start: slot.start, end: slot.end },
          };
          const window = intervalWindow(slot, data.date, anchor);
          intervals.set(scopeKey(scope), { ...scope, endAt: window.endAt });
          const previous = values.find(
            (value) => value.start === slot.start && value.end === slot.end,
          );
          const pending = editsByScope.get(scopeKey(scope))?.get(row.id);
          const manual =
            pending && Object.hasOwn(pending, 'actual')
              ? typeof pending.actual === 'number' &&
                Number.isSafeInteger(pending.actual) &&
                pending.actual >= 0
              : actualWasReported(previous);
          if (manual) cutoff = Math.max(cutoff ?? -Infinity, window.endAt);
        }
      }
    }
    if (!matched) fail(400, 'errMapping');
    for (const interval of [...intervals.values()].sort((a, b) => a.endAt - b.endAt)) {
      if (cutoff === null || interval.endAt > cutoff) continue;
      const existing = scopeIndex.get(scopeKey(interval));
      if (existing) existing.fillMissing = true;
      else {
        const added = { ...interval, rows: [], expectedVersions: [], fillMissing: true };
        scopes.push(added);
        scopeIndex.set(scopeKey(added), added);
      }
    }
  }
  if (
    units.length &&
    scopes.some(
      (scope) =>
        !units.some((unit) => sameProduction(unit, scope) && unit.shifts.includes(scope.shift)),
    )
  )
    fail(400, 'errMapping');
  return scopes;
}

/** Plan against the database snapshot inside the caller's transaction. Only
 * explicit edits require the client's revision; untouched peers are inspected
 * afresh so another user's submitted value can never become an automatic zero.
 * Grouping by station/shift lets multiple intervals commit one revision each. */
export function planActualCompletion(data, config, reports, fail) {
  const { date } = data;
  if (
    !Array.isArray(data.scopes) ||
    data.scopes.length > 4096 ||
    (!data.scopes.length && !data.throughLatest?.length)
  )
    fail(400, 'errSlotData');
  const scopes = expandThroughLatest(data, config, reports, fail);
  if (scopes.length > 4096) fail(400, 'errSlotData');
  const patches = new Map(),
    seen = new Set();
  const patchFor = (row, shift, version) => {
    const key = `${shift}|${row.id}`;
    if (!patches.has(key))
      patches.set(key, {
        rowId: row.id,
        shift,
        version,
        slots: new Map(),
        autoFilled: new Set(),
      });
    return patches.get(key);
  };
  for (const scope of scopes) {
    if (
      !scope ||
      !['day', 'night'].includes(scope.shift) ||
      !scope.interval ||
      typeof scope.line !== 'string' ||
      typeof scope.model !== 'string' ||
      typeof scope.interval.start !== 'string' ||
      typeof scope.interval.end !== 'string'
    )
      fail(400, 'errSlotData');
    const identity = JSON.stringify([
      scope.line,
      scope.model,
      scope.shift,
      scope.interval.start,
      scope.interval.end,
    ]);
    if (seen.has(identity)) fail(400, 'errSlotData');
    seen.add(identity);
    const report = reports[scope.shift];
    const saved = new Map(report.records.map((record) => [record.rowId, record]));
    const rows = config.rows.filter((row) => {
      const record = saved.get(row.id);
      return (
        ((row.active && !row.deleted) || record) &&
        stationHasOutput(row) &&
        sameProduction(record?.rowSnapshot || row, scope)
      );
    });
    if (!rows.length) fail(400, 'errMapping');
    if (
      !Array.isArray(scope.rows) ||
      !Array.isArray(scope.expectedVersions) ||
      scope.expectedVersions.length !== scope.rows.length
    )
      fail(409, 'errConflict');
    const expected = new Map(
      scope.expectedVersions.map((item) => [item?.rowId, item?.version]),
    );
    const changes = new Map(scope.rows.map((item) => [item?.rowId, item?.values]));
    if (changes.size !== scope.rows.length || expected.size !== changes.size)
      fail(400, 'errCount');
    if ([...changes.keys()].some((id) => !rows.some((row) => row.id === id)))
      fail(400, 'errMapping');
    let eligible = false;
    for (const row of rows) {
      const record = saved.get(row.id),
        defaults = report.defaults[row.id];
      const captured = record?.slots || defaults?.slots || [];
      const interval = reportSchedule(config, scope.line, scope.shift, date, captured).find(
        (slot) => slot.start === scope.interval.start && slot.end === scope.interval.end,
      );
      const edited = changes.has(row.id);
      if (!interval) {
        if (edited) fail(400, 'errSlotData');
        else continue;
      }
      eligible = true;
      const version = record?.version ?? report.rowVersions[row.id] ?? 0;
      const previous = captured.find(
        (slot) => slot.start === interval.start && slot.end === interval.end,
      );
      let values = {};
      if (edited) {
        validateStationValues(changes.get(row.id), fail);
        if (!Number.isSafeInteger(expected.get(row.id)) || expected.get(row.id) !== version)
          fail(409, 'errConflict');
        values = { ...changes.get(row.id) };
      }
      // Apply explicit, revision-checked edits first. An intentional clearing
      // becomes an automatic zero, while untouched current quantities survive.
      const missing = Object.hasOwn(values, 'actual')
        ? values.actual === null
        : previous?.actual == null;
      const auto = scope.fillMissing && row.active && !row.deleted && missing;
      if (auto) values.actual = 0;
      if (!Object.keys(values).length) continue;
      const patch = patchFor(row, scope.shift, version);
      patch.preserveSchedule = isArchivedProductionDate(config, scope.line, date);
      patch.slots.set(interval.id, { id: interval.id, ...values });
      if (auto) patch.autoFilled.add(interval.id);
    }
    if (!eligible) fail(400, 'errSlotData');
  }
  return [...patches.values()].map((patch) => ({ ...patch, slots: [...patch.slots.values()] }));
}
