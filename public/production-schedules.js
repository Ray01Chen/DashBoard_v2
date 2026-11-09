/** One editable template; a physical line may own a copied day/night schedule.
 * All models on a line share its breaks. Saved report snapshots stay authoritative. */
export function schedulesForLine(config, line) {
  return Object.hasOwn(config.lineSchedules || {}, line)
    ? config.lineSchedules[line]
    : config.schedules;
}

export function scheduleFor(config, line, shift) {
  const schedules = schedulesForLine(config, line);
  return shift === 'all'
    ? ['day', 'night'].flatMap((shift) =>
        (schedules?.[shift] || []).map((slot) => ({ ...slot, shift })),
      )
    : schedules?.[shift] || [];
}

/** Shared intervals retain their IDs when copied. Distinct line intervals and
 * saved historical intervals remain separate rather than guessing a mapping. */
export function scheduleCatalog(config, shift, lines = config.lines || []) {
  const slots = lines.length
    ? lines.flatMap((line) => scheduleFor(config, line, shift))
    : scheduleFor(config, null, shift);
  return [...new Map(slots.map((slot) => [slot.id, slot])).values()];
}
