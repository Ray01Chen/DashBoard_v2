import { scheduleFor } from './public/production-schedules.js';
import { randomUUID } from 'node:crypto';
import { allocateDailyTarget, lineDailyTarget } from './public/production-targets.js';
import {
  modelOf,
  staffingFor,
  productionKey,
  outputSourceFor,
  stationHasOutput,
} from './public/production-models.js';
export { allocateDailyTarget } from './public/production-targets.js';

/**
 * Personnel and staffing are configuration, while saved production records are
 * historical snapshots. Upgrade missing directory structures and derive each
 * line preset from its legacy output-station setting, without rewriting reports.
 */
export function upgradeProductionDefaults(config) {
  let changed = false;
  if (!Array.isArray(config.personnel)) {
    config.personnel = [];
    changed = true;
  }
  if (!config.lineStaffing || typeof config.lineStaffing !== 'object') {
    config.lineStaffing = {};
    changed = true;
  }
  for (const row of config.rows) {
    if (!Object.hasOwn(row, 'dailyTarget')) {
      row.dailyTarget = null;
      changed = true;
    }
  }
  if (!config.lineTargets) {
    config.lineTargets = Object.fromEntries(
      config.lines.map((line) => [line, lineDailyTarget(config, line)]),
    );
    changed = true;
  }
  return changed;
}

/** Validate references only after catalogs and row IDs have been normalized. */
export function validateProductionDefaults(data, next, previous, fail) {
  const targets = Object.hasOwn(data, 'lineTargets')
    ? data.lineTargets
    : (previous.lineTargets ?? {});
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) fail(400, 'errCount');
  next.lineTargets = Object.create(null);
  for (const line of next.lines) {
    const value = Object.hasOwn(targets, line) ? targets[line] : null;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 99999999))
      fail(400, 'errCount');
    next.lineTargets[line] = value;
  }
  const personnel = data.personnel ?? previous.personnel ?? [];
  if (!Array.isArray(personnel) || personnel.length > 5000) fail(400, 'errPersonnel');
  const ids = new Set();
  next.personnel = personnel.map((person) => {
    if (!person || typeof person !== 'object') fail(400, 'errPersonnel');
    const id = person.id == null ? `person-${randomUUID()}` : person.id;
    if (typeof id !== 'string' || !id.trim() || id.length > 80 || ids.has(id))
      fail(400, 'errPersonnel');
    if (typeof person.name !== 'string' || !person.name.trim() || person.name.length > 200)
      fail(400, 'errPersonnel');
    if (typeof person.job !== 'string' || !person.job.trim() || person.job.length > 60)
      fail(400, 'errPersonnel');
    const active = person.active !== false;
    if (!next.jobs.includes(person.job)) fail(400, 'errPersonnel');
    ids.add(id);
    return { id, name: person.name.trim(), job: person.job, active };
  });

  const staffing = data.lineStaffing ?? previous.lineStaffing ?? {};
  if (!staffing || typeof staffing !== 'object' || Array.isArray(staffing))
    fail(400, 'errStaffing');
  next.lineStaffing = Object.create(null);
  for (const line of next.lines) {
    const assignment = staffing[line] ?? {};
    if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment))
      fail(400, 'errStaffing');
    next.lineStaffing[line] = {};
    for (const role of ['day', 'night', 'owners']) {
      const people = assignment[role] ?? [];
      if (!Array.isArray(people) || people.length > 500 || people.some((id) => !ids.has(id)))
        fail(400, 'errStaffing');
      next.lineStaffing[line][role] = [...new Set(people)];
    }
  }
  const units = data.productionUnits ?? previous.productionUnits;
  if (units === undefined && !next.models) return;
  if (!Array.isArray(units) || units.length > 2000) fail(400, 'errMapping');
  const keys = new Set();
  next.productionUnits = units.map((unit) => {
    if (!unit || !next.lines.includes(unit.line) || !next.models.includes(unit.model))
      fail(400, 'errMapping');
    const key = productionKey(unit);
    if (keys.has(key)) fail(400, 'errDuplicateMapping');
    keys.add(key);
    let dailyTarget = unit.dailyTarget ?? null;
    // Older clients can still edit the migrated Default model's preset. An
    // explicit unit edit always wins and can never change another model.
    const before = previous.productionUnits?.find((item) => productionKey(item) === key);
    if (
      unit.model === 'Default' &&
      before &&
      dailyTarget === before.dailyTarget &&
      data.lineTargets?.[unit.line] !== previous.lineTargets?.[unit.line]
    )
      dailyTarget = data.lineTargets[unit.line];
    if (
      dailyTarget !== null &&
      (!Number.isSafeInteger(dailyTarget) || dailyTarget < 0 || dailyTarget > 99999999)
    )
      fail(400, 'errCount');
    let rawStaff = unit.staffing || {};
    if (typeof rawStaff !== 'object' || Array.isArray(rawStaff)) fail(400, 'errStaffing');
    if (
      unit.model === 'Default' &&
      before &&
      JSON.stringify(rawStaff) === JSON.stringify(before.staffing) &&
      JSON.stringify(data.lineStaffing?.[unit.line]) !==
        JSON.stringify(previous.lineStaffing?.[unit.line])
    )
      rawStaff = data.lineStaffing[unit.line] || {};
    const staffing = {};
    for (const role of ['day', 'night', 'owners']) {
      const assigned = rawStaff[role] ?? [];
      if (
        !Array.isArray(assigned) ||
        assigned.length > 500 ||
        assigned.some((id) => !ids.has(id))
      )
        fail(400, 'errStaffing');
      staffing[role] = [...new Set(assigned)];
    }
    return { line: unit.line, model: unit.model, dailyTarget, staffing };
  });
  if (next.rows.some((row) => row.active && !keys.has(productionKey(row))))
    fail(400, 'errMapping');
  // Compatibility view for older clients. Each other model remains independent.
  for (const line of next.lines) {
    const unit = next.productionUnits.find(
      (unit) => unit.line === line && unit.model === 'Default',
    );
    next.lineTargets[line] = unit?.dailyTarget ?? null;
    next.lineStaffing[line] = unit?.staffing || { day: [], night: [], owners: [] };
  }
}

/** Derived values are safe for member accounts and never write production data. */
export function buildProductionDefaults(config, shift) {
  const people = new Map(
    (config.personnel || [])
      .filter((person) => person.active)
      .map((person) => [person.id, person]),
  );
  return Object.fromEntries(
    config.rows
      .filter((row) => row.active)
      .map((row) => {
        const staffing = staffingFor(config, row);
        const assigned = (role) =>
          (staffing[role] || []).map((id) => people.get(id)).filter(Boolean);
        const team = (role) =>
          assigned(role).filter((person) => !row.job || person.job === row.job);
        const snapshot = { day: team('day'), night: team('night'), owners: assigned('owners') };
        const dailyTarget = stationHasOutput(row)
          ? lineDailyTarget(config, row.line, modelOf(row))
          : null;
        const slots = allocateDailyTarget(config, dailyTarget, row.line)
          .filter((slot) => slot.shift === shift)
          .map(({ id, start, end, target }) => ({
            id,
            start,
            end,
            kind: 'production',
            target,
            actual: null,
            issue: '',
          }));
        return [
          row.id,
          {
            rowId: row.id,
            dayTeam: snapshot.day.map((person) => person.name).join(', '),
            nightTeam: snapshot.night.map((person) => person.name).join(', '),
            owner: snapshot.owners.map((person) => person.name).join(', '),
            sourceDailyTarget: dailyTarget,
            dailyTarget:
              dailyTarget == null ? null : slots.reduce((sum, slot) => sum + slot.target, 0),
            slots,
            personnel: snapshot,
            configVersion: config.version,
          },
        ];
      }),
  );
}

export function hasConfiguredDefaults(config, row) {
  const staffing = staffingFor(config, row);
  return (
    lineDailyTarget(config, row.line, modelOf(row)) != null ||
    ['day', 'night', 'owners'].some((role) => staffing?.[role]?.length)
  );
}

/**
 * Entry mode is a cell patch: omitted fields are preserved and explicit null
 * clears a count. Personnel and initial targets come from captured defaults.
 * Explicit report target edits change this report only, never the configuration
 * or the original defaults snapshot shared with the opposite shift.
 */
export function resolveEntryData(
  config,
  row,
  data,
  current,
  fail,
  {
    allowLegacyMetadata = false,
    opposite = null,
    lineDefaults = null,
    preserveSchedule = false,
  } = {},
) {
  const managed =
    !allowLegacyMetadata ||
    data.entryMode === true ||
    !!current?.defaultsSnapshot ||
    (!current && hasConfiguredDefaults(config, row));
  if (!managed) return { data, defaultsSnapshot: null };
  const productionDay = opposite?.defaultsSnapshot?.productionDay;
  const defaults =
    productionDay?.[data.shift] || buildProductionDefaults(config, data.shift)[row.id];
  const base = current || lineDefaults || defaults;
  const source = new Map((base?.slots || []).map((slot) => [slot.id, slot]));
  // A deleted configuration can only edit its saved history. Today's schedule
  // must not append new slots to that history. Existing live mappings retain
  // support for explicitly reporting newly configured intervals.
  // Completing a historical report follows its captured plan, not newly
  // configured slots outside the explicitly selected completion range.
  if (!row.deleted && !preserveSchedule)
    for (const slot of scheduleFor(config, row.line, data.shift).filter(
      (slot) => slot.kind === 'production',
    )) {
      if (!source.has(slot.id))
        source.set(slot.id, { ...slot, target: null, actual: null, issue: '' });
    }
  const supplied = data.slots;
  if (!Array.isArray(supplied) || !supplied.length || supplied.length > 96)
    fail(400, 'errSlotData');
  if (Array.isArray(supplied)) {
    const seen = new Set();
    for (const slot of supplied) {
      if (!slot || typeof slot !== 'object' || !source.has(slot.id) || seen.has(slot.id))
        fail(400, 'errSlotData');
      seen.add(slot.id);
      const existing = source.get(slot.id);
      source.set(slot.id, {
        ...existing,
        ...(data.editTargets === true && Object.hasOwn(slot, 'target')
          ? { target: slot.target, targetShared: data.sharedLineTargets === true }
          : {}),
        ...(Object.hasOwn(slot, 'actual')
          ? {
              actual: slot.actual,
              actualAutoFilled: slot.actualAutoFilled === true,
              lineShared: data.sharedLineActual === true,
            }
          : {}),
        ...(Object.hasOwn(slot, 'issue') ? { issue: slot.issue } : {}),
      });
    }
  }
  return {
    data: {
      ...data,
      dayTeam: base.dayTeam,
      nightTeam: base.nightTeam,
      owner: base.owner,
      dailyTarget:
        data.editTargets === true && supplied.some((slot) => Object.hasOwn(slot, 'target'))
          ? [...source.values()].every((slot) => slot.target == null)
            ? null
            : [...source.values()].reduce((sum, slot) => sum + (slot.target ?? 0), 0)
          : base.dailyTarget,
      slots: Array.isArray(supplied) ? [...source.values()] : supplied,
    },
    // Free-text legacy staffing has no reliable personnel-ID association. Keep its
    // saved labels without attributing them to today's newly configured people.
    defaultsSnapshot: current?.defaultsSnapshot || {
      ...defaults,
      ...(current
        ? {
            sourceDailyTarget: null,
            personnel: { day: [], night: [], owners: [] },
            dayTeam: current.dayTeam,
            nightTeam: current.nightTeam,
            owner: current.owner,
            dailyTarget: current.dailyTarget,
            slots: current.slots,
          }
        : {
            productionDay: productionDay || {
              day: buildProductionDefaults(config, 'day')[row.id],
              night: buildProductionDefaults(config, 'night')[row.id],
            },
          }),
      outputSource: productionDay
        ? opposite.defaultsSnapshot.outputSource
        : outputSourceFor(config, current?.rowSnapshot || row),
      capturedAt: productionDay
        ? opposite.defaultsSnapshot.capturedAt
        : new Date().toISOString(),
    },
  };
}
