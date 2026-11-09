import { randomUUID } from 'node:crypto';

/** Validate template and line copies identically; unchanged slots keep their
 * IDs so changing another break never redirects saved production values. */
export function normalizeSchedules(input, previous, fail, references = []) {
  const next = { day: [], night: [] };
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const allIds = new Set();
  const shiftRanges = {};
  for (const shift of ['day', 'night']) {
    const schedule = input?.[shift];
    if (
      !Array.isArray(schedule) ||
      !schedule.length ||
      schedule.length > 48 ||
      !schedule.some((s) => s?.kind === 'production')
    )
      fail(400, 'errSchedule');
    const ranges = [];
    next[shift] = schedule.map((s) => {
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
      const old = previous[shift].find((v) => v.id === s.id);
      // Applied lines share validated template IDs even when both are saved
      // together; unchanged line slots retain their own saved identity first.
      const reference = references
        .map(({ input, output }) => {
          const index = input?.[shift]?.findIndex(
            (slot) =>
              slot.id === s.id &&
              slot.start === s.start &&
              slot.end === s.end &&
              slot.kind === s.kind,
          );
          return index >= 0 ? output[shift][index] : null;
        })
        .find(Boolean);
      const id =
        old && old.start === s.start && old.end === s.end && old.kind === s.kind
          ? old.id
          : reference?.id || `${shift}-${randomUUID()}`;
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
    scheduleSignature(next) !== scheduleSignature(previous) &&
    shiftRanges.day.some((day) =>
      shiftRanges.night.some((night) => day[0] < night[1] && night[0] < day[1]),
    )
  )
    fail(400, 'errOverlap', { shift: 'day/night' });
  return next;
}
