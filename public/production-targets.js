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
export function allocateDailyTarget(config, dailyTarget) {
  const slots = ['day', 'night'].flatMap((shift) =>
    config.schedules[shift]
      .filter((slot) => slot.kind === 'production')
      .map((slot) => ({
        ...slot,
        shift,
        minutes: (minutes(slot.end) - minutes(slot.start) + 1440) % 1440,
      })),
  );
  const totalMinutes = slots.reduce((sum, slot) => sum + slot.minutes, 0);
  if (dailyTarget == null || !totalMinutes) return slots.map((slot) => ({ ...slot, target: null }));
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
