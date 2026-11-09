/** Named, editable templates; a physical line owns its applied day/night copy.
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

export function productionDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/** Current/future entry uses CONFIG only; archived dates use captured slots.
 * This is a display rule. Retired values remain in SQLite and write queues. */
export function isArchivedProductionDate(config, line, date, now = Date.now()) {
  const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const all = scheduleFor(config, line, 'all');
  const anchor = all[0]?.start || '00:00';
  const base = Date.parse(date + 'T00:00:00+07:00');
  const endAt = Math.max(
    ...all.map(
      (slot) =>
        base +
        (slot.start < anchor ? 86400000 : 0) +
        minute(slot.start) * 60000 +
        ((minute(slot.end) - minute(slot.start) + 1440) % 1440) * 60000,
    ),
  );
  return date < productionDate(now) && now >= endAt;
}

export function reportSchedule(config, line, shift, date, savedSlots = [], now = Date.now()) {
  // A night shift can still own yesterday's production date after midnight.
  return isArchivedProductionDate(config, line, date, now) && savedSlots.length
    ? [
        ...new Map(
          savedSlots.filter((slot) => slot.kind !== 'break').map((slot) => [slot.id, slot]),
        ).values(),
      ]
    : scheduleFor(config, line, shift).filter((slot) => slot.kind === 'production');
}

export function scheduleTemplate(config, id = 'default') {
  return id === 'default'
    ? { id, schedules: config.schedules }
    : config.scheduleTemplates?.find((template) => template.id === id);
}

/** Template edits never implicitly publish to existing lines. Legacy lines that
 * followed the default receive an unchanged copy before that template is edited. */
export function editScheduleTemplate(config, id = 'default') {
  const template = scheduleTemplate(config, id);
  if (!template) return null;
  if (id === 'default') {
    config.lineSchedules ||= Object.create(null);
    for (const line of config.lines)
      if (!Object.hasOwn(config.lineSchedules, line))
        Object.defineProperty(config.lineSchedules, line, {
          value: structuredClone(config.schedules),
          enumerable: true,
          writable: true,
          configurable: true,
        });
  }
  return template.schedules;
}

export function applyScheduleTemplate(config, id, lines) {
  const template = scheduleTemplate(config, id);
  if (!template || !lines.length || lines.some((line) => !config.lines.includes(line)))
    return false;
  config.lineSchedules ||= Object.create(null);
  for (const line of new Set(lines))
    Object.defineProperty(config.lineSchedules, line, {
      value: structuredClone(template.schedules),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return true;
}
