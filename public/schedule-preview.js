import { allocateDailyTarget } from './production-targets.js';
import { productionUnits, productionLabel, productionKey } from './production-models.js';
const minute = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
/** Validate the same circular clock ranges used by the server. Splitting at
 * midnight catches overlaps between the night shift and next day's day shift. */
export function scheduleIssues(schedules) {
  const ranges = [],
    issues = new Set();
  for (const shift of ['day', 'night']) {
    const slots = schedules?.[shift];
    if (
      !Array.isArray(slots) ||
      !slots.length ||
      slots.length > 48 ||
      !slots.some((slot) => slot.kind === 'production')
    ) {
      issues.add('errSchedule');
      continue;
    }
    for (const slot of slots) {
      if (
        !['production', 'break'].includes(slot.kind) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.start) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.end)
      ) {
        issues.add('errTime');
        continue;
      }
      const start = minute(slot.start),
        end = minute(slot.end),
        duration = (end - start + 1440) % 1440;
      if (!duration) issues.add('errTime');
      if (duration > 720) issues.add('errDuration');
      if (end >= start) ranges.push([start, end]);
      else ranges.push([start, 1440], [0, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i][0] < ranges[i - 1][1]) issues.add('errOverlap');
  return [...issues];
}
export function schedulePreview(config, schedules, line, { t, esc, previewKey }) {
  const slots = ['day', 'night'].flatMap((shift) => schedules[shift] || []);
  const anchor = minute(slots[0]?.start || '00:00');
  const ranges = slots.map((slot) => ({
    ...slot,
    offset: (minute(slot.start) - anchor + 1440) % 1440,
    duration: (minute(slot.end) - minute(slot.start) + 1440) % 1440,
  }));
  const extent = Math.max(1, ...ranges.map((slot) => slot.offset + slot.duration));
  const issues = scheduleIssues(schedules);
  const units = productionUnits(config).filter((unit) => !line || unit.line === line);
  // A template does not own a numeric target. Preview the first applicable
  // model using its real daily preset, and show that identity explicitly.
  const unit = units.find((unit) => productionKey(unit) === previewKey) || units[0];
  const targets = unit
    ? allocateDailyTarget({ ...config, schedules, lineSchedules: {} }, unit.dailyTarget)
    : [];
  return `<section class="panel schedule-preview"><div class="schedule-preview-heading"><h3>${esc(t('scheduleTimeline'))}</h3>${unit ? `<label>${esc(t('schedulePreviewTarget'))}<select data-schedule-preview-unit>${units.map((value) => `<option value="${esc(productionKey(value))}" ${productionKey(value) === productionKey(unit) ? 'selected' : ''}>${esc(productionLabel(value))}</option>`).join('')}</select></label>` : ''}</div><div class="schedule-timeline-scroll"><svg class="schedule-timeline" viewBox="0 0 1000 76" preserveAspectRatio="none" role="img" aria-label="${esc(t('scheduleTimeline'))}">${ranges
    .filter((slot) => Number.isFinite(slot.offset + slot.duration) && slot.duration > 0)
    .map((slot) => {
      const x = (slot.offset / extent) * 1000,
        width = (slot.duration / extent) * 1000;
      return `<g><title>${esc(t(slot.kind))} ${esc(slot.start)}–${esc(slot.end)}</title><rect x="${x}" y="18" width="${Math.max(1, width - 1)}" height="30" rx="3" class="${slot.kind === 'break' ? 'timeline-break' : ''}"/>${width > 55 ? `<text x="${x + width / 2}" y="37" text-anchor="middle" class="slot-caption">${esc(t(slot.kind))}</text>` : ''}${width > 35 ? `<text x="${x + 1}" y="65">${esc(slot.start)}</text>` : ''}</g>`;
    })
    .join(
      '',
    )}</svg></div><p class="${issues.length ? 'negative' : 'muted'}" role="status">${esc(t(issues.length ? 'scheduleInvalid' : 'scheduleValid'))}</p><p>${esc(t('production'))} ▰ · ${esc(t('break'))} ▱ · ${esc(t('scheduleTargetHelp'))}</p>${unit ? `<details><summary>${esc(t('schedulePreviewTarget'))} · ${esc(productionLabel(unit))}</summary><div class="table-scroll"><table><thead><tr><th>${esc(t('timeSlot'))}</th><th>${esc(t('type'))}</th><th>${esc(t('target'))}</th></tr></thead><tbody>${slots.map((slot) => `<tr><td>${esc(slot.start)}–${esc(slot.end)}</td><td>${esc(t(slot.kind))}</td><td>${slot.kind === 'break' ? '—' : (targets.find((value) => value.id === slot.id)?.target ?? '—')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</section>`;
}
