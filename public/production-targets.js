import { scheduleFor, isArchivedProductionDate } from './production-schedules.js';
import { DEFAULT_MODEL, unitFor } from './production-models.js';
const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** Migrate a line default from its output station, then Pack, then its first
 * active mapping. A configured null stays unknown; saved reports are untouched. */
export function lineDailyTarget(config, line, model = DEFAULT_MODEL) {
  if (config.productionUnits) return unitFor(config, { line, model })?.dailyTarget ?? null;
  if (config.lineTargets && Object.hasOwn(config.lineTargets, line))
    return config.lineTargets[line];
  const rows = (config.rows || []).filter((row) => row.active !== false && row.line === line);
  const row =
    rows.find((row) => row.id === config.monitoring?.outputSources?.[line]) ||
    rows.find((row) => /pack/i.test(row.station || '')) ||
    rows[0];
  return row?.dailyTarget ?? null;
}

/**
 * A target covers one production day across both shifts. Breaks receive no
 * allocation. Largest remainders get spare units in stable schedule order, so
 * integer rounding preserves the exact daily total, even for targets of 0 or 1.
 * Shared by the server and settings preview to keep displayed totals consistent.
 */
export function allocateDailyTarget(config, dailyTarget, line) {
  const slots = ['day', 'night'].flatMap((shift) =>
    scheduleFor(config, line, shift)
      .filter((slot) => slot.kind === 'production')
      .map((slot) => ({
        ...slot,
        shift,
        minutes: (minutes(slot.end) - minutes(slot.start) + 1440) % 1440,
      })),
  );
  const totalMinutes = slots.reduce((sum, slot) => sum + slot.minutes, 0);
  if (dailyTarget == null || !totalMinutes)
    return slots.map((slot) => ({ ...slot, target: null }));
  const allocated = slots.map((slot, index) => ({
    ...slot,
    index,
    target: Math.floor((dailyTarget * slot.minutes) / totalMinutes),
    remainder: (dailyTarget * slot.minutes) % totalMinutes,
  }));
  const remaining = dailyTarget - allocated.reduce((sum, slot) => sum + slot.target, 0);
  const ranked = [...allocated].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index++) ranked[index].target++;
  return allocated;
}

/** Restore with the same daily allocation as batch entry. Archived reports use
 * their captured plan; a later CONFIG must never supply a historical target. */
export function reportDefaultTarget(config, row, date, shift, interval, record, defaults) {
  const slots = isArchivedProductionDate(config, row.line, date)
    ? record?.defaultsSnapshot?.productionDay?.[shift]?.slots ||
      record?.defaultsSnapshot?.slots ||
      (record ? record.slots : defaults?.slots) ||
      []
    : allocateDailyTarget(
        config,
        lineDailyTarget(config, row.line, row.model),
        row.line,
      ).filter((slot) => slot.shift === shift);
  return (
    slots.find((slot) => slot.start === interval.start && slot.end === interval.end)?.target ??
    null
  );
}

/** A plan is a pace derived from the preset, not a machine capacity limit.
 * Shift targets use the same integer allocation as entry; dividing the full
 * daily target by just one shift would count the daily requirement twice. */
export function plannedProduction(config, dailyTarget, line, shift = 'all') {
  const schedule = scheduleFor(config, line, 'all');
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (
    schedule.some(
      (slot) =>
        !clock.test(slot.start) ||
        !clock.test(slot.end) ||
        (minutes(slot.end) - minutes(slot.start) + 1440) % 1440 === 0,
    )
  )
    return { target: null, hours: null, uph: null };
  // Legacy schedules can predate overlap validation. Ambiguous productive or
  // break ranges must not turn into a plausible-looking pace by double counting.
  const ranges = schedule
    .flatMap((slot) => {
      const start = minutes(slot.start),
        end = minutes(slot.end);
      return end > start
        ? [[start, end]]
        : [
            [start, 1440],
            [0, end],
          ];
    })
    .sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1]))
    return { target: null, hours: null, uph: null };
  const validTarget =
    Number.isSafeInteger(dailyTarget) && dailyTarget >= 0 && dailyTarget <= 99999999;
  const slots = allocateDailyTarget(config, validTarget ? dailyTarget : null, line).filter(
    (slot) => shift === 'all' || slot.shift === shift,
  );
  const hours = slots.reduce((sum, slot) => sum + slot.minutes, 0) / 60;
  const target =
    validTarget && slots.length ? slots.reduce((sum, slot) => sum + slot.target, 0) : null;
  return { target, hours, uph: target != null && hours > 0 ? target / hours : null };
}
