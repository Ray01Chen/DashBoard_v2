/** Monitoring presentation only. Alert evaluation and report values stay in
 * their existing modules; temporary expansion/filter state never enters CONFIG. */
import { localeTags } from './i18n.js';
import { alertConfig } from './alerts.js';
import { productionIdentityMarkup, productionLabel } from './production-models.js';
import { schedulesForLine } from './production-schedules.js';
import { productionWindows } from './monitor.js';
import {
  alertReasonText,
  rotatedReason,
  cycleReason,
  productionState,
  productionStatusText,
  updateAlertList,
} from './alert-display.js';
const expanded = new Set();
const filterLabels = new WeakMap();
let rendered = new Map();
export const severityFilters = ['all', 'red', 'yellow', 'green', 'noData', 'disabled'];

/** Compact only unusually large values; exact values remain in the native
 * title and details. This keeps one row readable without clipping digits. */
export function monitorNumber(value, ctx) {
  const exact = ctx.number(value);
  if (!Number.isFinite(value) || exact.length <= 5) return exact;
  const locale = localeTags[ctx.language] || localeTags.en;
  const compact = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
  return compact.length <= 6
    ? compact
    : new Intl.NumberFormat(locale, {
        notation: 'scientific',
        maximumFractionDigits: 1,
      }).format(value);
}
export function achievement(actual, target) {
  return actual == null || !(target > 0) ? null : (actual / target) * 100;
}
export function slotPresentation(line, { config, date, shift, now }) {
  const windows = productionWindows(
    { ...config, schedules: schedulesForLine(config, line.line) },
    date,
    shift,
  ).sort((a, b) => a.startAt - b.startAt);
  const next = windows.find((slot) => slot.startAt > now);
  const reported = line.series.filter((slot) => slot.target != null || slot.actual != null);
  const previous = [...(reported.length ? reported : line.series)]
    .filter((slot) => slot.endAt <= now)
    .sort((a, b) => b.endAt - a.endAt)[0];
  const state = productionState(line, now);
  return {
    state,
    slot: line.currentSlot || (state === 'upcoming' ? next : previous),
    label: line.currentSlot
      ? 'currentInterval'
      : state === 'upcoming'
        ? 'nextSlot'
        : 'previousSlot',
    next,
  };
}
const range = (slot) => (slot ? slot.start + '–' + slot.end : '—');
function reasonView(line, ctx) {
  const reason = rotatedReason(line.unified, ctx.now, line.key, ctx.date);
  return {
    text: alertReasonText(reason, ctx.t, { compact: true }),
    full: alertReasonText(reason, ctx.t),
    index: reason ? line.unified.reasons.indexOf(reason) + 1 : 0,
    count: line.unified.reasons.length,
  };
}
function achievementView(line, ctx) {
  const daily = ctx.metricScope === 'day';
  const value = achievement(
    daily ? line.dailyActual : line.currentActual,
    daily ? line.dailyTarget : line.currentTarget,
  );
  const policy = alertConfig(ctx.config.monitoring).performance;
  return {
    text: value == null ? '—' : monitorNumber(Number(value.toFixed(1)), ctx) + '%',
    full: value == null ? '—' : ctx.number(Number(value.toFixed(1))) + '%',
    tone:
      value == null
        ? 'unknown'
        : value >= policy.green
          ? 'positive'
          : value >= policy.red
            ? 'warning-value'
            : 'negative',
  };
}
function wideMetrics(line, ctx) {
  const fields =
    ctx.metricScope === 'day'
      ? ['dailyTarget', 'dailyActual', 'dailyGap']
      : ['currentTarget', 'currentActual', 'currentGap'];
  return (
    fields.some((key) => ctx.number(line[key]).length > 4) ||
    achievementView(line, ctx).text.length > 6
  );
}
export function rememberMonitorLines(lines) {
  rendered = new Map(lines.map((line) => [line.key || line.line, line]));
}
export function monitorCard(line, ctx, metrics) {
  const { t, esc, icon } = ctx,
    key = line.key || line.line;
  const period = slotPresentation(line, ctx),
    reason = reasonView(line, ctx),
    rate = achievementView(line, ctx);
  const open = !ctx.board && expanded.has(ctx.date + key);
  return `<article class="line-card alarm-${line.status}${line.blink ? ' blinking-frame' : ''}${open ? ' is-expanded' : ''}${wideMetrics(line, ctx) ? ' has-wide-metrics' : ''}" data-monitor-line="${esc(key)}" role="group" aria-label="${esc(productionLabel(line))}">
    <span class="line-card-top"><button type="button" class="line-identity-open" title="${esc(t('details'))}">${productionIdentityMarkup(line, esc)}</button><span class="line-source">${esc(t('sourceLabel', { name: line.sourceLabel === 'all' ? t('allStations') : line.sourceLabel || t('noSource') }))}</span></span>
    <span class="line-health"><span class="line-severity"><span class="signal-lamp lamp-${line.status}" role="img" aria-label="${esc(t('alertState_' + line.unified.severity))}"></span><span class="severity-badge severity-${line.unified.severity}">${esc(t('alertState_' + line.unified.severity))}</span></span><span class="production-state state-${period.state}">${esc(t(period.state === 'completed' ? 'slotCompleted' : period.state))}</span><small class="health-period">${esc(range(period.slot))}</small></span>
    <span class="line-card-values">${metrics}<span class="achievement-metric"><small title="${esc(t('achievementRate'))}">${esc(t('achievementRate'))}</small><b class="${rate.tone}" data-achievement title="${esc(rate.full)}">${esc(rate.text)}</b></span></span>
    <span class="line-trend"></span>
    <span class="line-slot"><small data-slot-label>${esc(t(period.label))}</small><span class="time-pill state-${period.state}" data-slot-range>${esc(range(period.slot))}</span><small class="next-slot" data-next-slot title="${esc(period.next ? t('nextSlot') + ': ' + range(period.next) : t('noNextSlot'))}">${esc(period.next ? t('nextSlot') + ': ' + range(period.next) : t('noNextSlot'))}</small></span>
    <div class="line-card-status"><span class="${['red', 'yellow'].includes(line.unified.severity) ? 'alert-text' : ''}" data-card-reason title="${esc(reason.full)}">${esc(reason.text)}</span><small class="card-period-summary">${esc(productionStatusText(line, t, ctx.now))}</small><div class="reason-controls" ${reason.count > 1 ? '' : 'hidden'}><button type="button" class="reason-step" data-reason-step="-1" aria-label="${esc(t('previous'))}">${icon('left')}</button><output data-reason-count aria-label="${esc(t('alertReasons'))}">${reason.index} / ${reason.count}</output><button type="button" class="reason-step" data-reason-step="1" aria-label="${esc(t('next'))}">${icon('right')}</button></div></div>
    <button type="button" class="card-reason-toggle icon-button" data-line-expand aria-expanded="${open}" aria-label="${esc(t('alertDetails'))}" title="${esc(t('alertDetails'))}">${icon('down')}</button>
    <section class="card-expanded-details" ${open ? '' : 'hidden'}><div class="expanded-slot-info"><strong>${esc(productionLabel(line))}</strong><p data-expanded-source></p><p data-expanded-period></p><p data-expanded-next></p><dl data-expanded-metrics></dl></div><div><strong>${esc(t('alertDetails'))}</strong><ul data-card-alert-list></ul></div><button type="button" class="button card-open-detail">${esc(t('openProductionDetails'))}${icon('right')}</button></section>
  </article>`;
}
export function updateMonitorCard(card, line, ctx) {
  const { t } = ctx;
  const period = slotPresentation(line, ctx),
    reason = reasonView(line, ctx),
    rate = achievementView(line, ctx);
  const open = !ctx.board && expanded.has(ctx.date + (line.key || line.line));
  const classes =
    'line-card alarm-' +
    line.status +
    (line.blink ? ' blinking-frame' : '') +
    (open ? ' is-expanded' : '') +
    (wideMetrics(line, ctx) ? ' has-wide-metrics' : '');
  if (card.className !== classes) card.className = classes;
  const lamp = card.querySelector('.signal-lamp');
  const lampClass = 'signal-lamp lamp-' + line.status;
  if (lamp.className !== lampClass) lamp.className = lampClass;
  lamp.setAttribute('aria-label', t('alertState_' + line.unified.severity));
  card.querySelector('.line-source').textContent = t('sourceLabel', {
    name: line.sourceLabel === 'all' ? t('allStations') : line.sourceLabel || t('noSource'),
  });
  card.querySelector('.line-source').title = card.querySelector('.line-source').textContent;
  const badge = card.querySelector('.severity-badge');
  badge.className = 'severity-badge severity-' + line.unified.severity;
  badge.textContent = t('alertState_' + line.unified.severity);
  const state = card.querySelector('.production-state');
  state.className = 'production-state state-' + period.state;
  state.textContent = t(period.state === 'completed' ? 'slotCompleted' : period.state);
  card.querySelector('.health-period').textContent = range(period.slot);
  card.querySelector('[data-achievement]').textContent = rate.text;
  card.querySelector('[data-achievement]').title = rate.full;
  card.querySelector('[data-achievement]').className = rate.tone;
  card.querySelector('[data-slot-label]').textContent = t(period.label);
  const time = card.querySelector('[data-slot-range]');
  time.className = 'time-pill state-' + period.state;
  time.textContent = range(period.slot);
  const next = card.querySelector('[data-next-slot]');
  next.textContent = period.next ? t('nextSlot') + ': ' + range(period.next) : t('noNextSlot');
  next.title = next.textContent;
  const label = card.querySelector('[data-card-reason]');
  label.textContent = reason.text;
  label.title = reason.full;
  label.className = ['red', 'yellow'].includes(line.unified.severity) ? 'alert-text' : '';
  card.querySelector('.card-period-summary').textContent = productionStatusText(
    line,
    t,
    ctx.now,
  );
  card.querySelector('.reason-controls').hidden = reason.count < 2;
  card.querySelector('[data-reason-count]').textContent = reason.index + ' / ' + reason.count;
  if (open) {
    card.querySelector('[data-expanded-source]').textContent =
      card.querySelector('.line-source').textContent;
    card.querySelector('[data-expanded-period]').textContent =
      t(period.label) + ': ' + range(period.slot);
    card.querySelector('[data-expanded-next]').textContent = next.textContent;
    const fields =
      ctx.metricScope === 'day'
        ? ['dailyTarget', 'dailyActual', 'dailyGap']
        : ['currentTarget', 'currentActual', 'currentGap'];
    card.querySelector('[data-expanded-metrics]').innerHTML =
      fields
        .map(
          (key) => `<dt>${ctx.esc(ctx.t(key))}</dt><dd>${ctx.esc(ctx.number(line[key]))}</dd>`,
        )
        .join('') + `<dt>${ctx.esc(t('achievementRate'))}</dt><dd>${ctx.esc(rate.full)}</dd>`;
  }
  if (open) updateAlertList(card.querySelector('[data-card-alert-list]'), line.unified, t);
}
export function handleMonitorAction(event, ctx) {
  const card = event.target.closest('.line-card');
  const line = card && rendered.get(card.dataset.monitorLine);
  if (!line) return false;
  const step = event.target.closest('[data-reason-step]');
  if (step) {
    event.preventDefault();
    cycleReason(line.unified, ctx.now, line.key, ctx.date, Number(step.dataset.reasonStep));
    updateMonitorCard(card, line, ctx);
    return true;
  }
  const toggle = event.target.closest('[data-line-expand]');
  if (!toggle) return false;
  event.preventDefault();
  const id = ctx.date + (line.key || line.line),
    open = !expanded.has(id);
  if (open) expanded.add(id);
  else expanded.delete(id);
  card.querySelector('.card-expanded-details').hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  updateMonitorCard(card, line, ctx);
  if (open) card.querySelector('.card-expanded-details').scrollIntoView({ block: 'nearest' });
  return true;
}
export function updateStatusFilters(element, lines, ctx) {
  if (!element) return;
  const counts = Object.fromEntries(
    severityFilters.map((severity) => [
      severity,
      severity === 'all'
        ? lines.length
        : lines.filter((line) => line.unified.severity === severity).length,
    ]),
  );
  const label = (key) => ctx.t(key === 'all' ? 'allStatuses' : 'alertState_' + key);
  const labels = severityFilters.map(label).join('|');
  if (filterLabels.get(element) !== labels || !element.children.length) {
    filterLabels.set(element, labels);
    element.innerHTML = severityFilters
      .map(
        (key) =>
          `<button type="button" data-alert-filter="${key}" class="status-filter filter-${key}" aria-pressed="${(ctx.alertFilter || 'all') === key}"><span>${ctx.esc(label(key))}</span><b data-status-count>${counts[key]}</b></button>`,
      )
      .join('');
  }
  for (const button of element.children) {
    const key = button.dataset.alertFilter;
    button.querySelector('[data-status-count]').textContent = counts[key];
    button.hidden =
      ['noData', 'disabled'].includes(key) && !counts[key] && ctx.alertFilter !== key;
    button.setAttribute('aria-pressed', String((ctx.alertFilter || 'all') === key));
  }
}
