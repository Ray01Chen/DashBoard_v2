import { cancelMonitorPageMotion } from './monitor-carousel.js';
/** Monitoring presentation only. Alert evaluation and report values stay in
 * their existing modules; temporary expansion/filter state never enters CONFIG. */
import { localeTags } from './i18n.js';
import { alertConfig } from './alerts.js';
import {
  productionIdentityMarkup,
  productionLabel,
  sameProduction,
} from './production-models.js';
import { schedulesForLine } from './production-schedules.js';
import { productionWindows } from './monitor.js';
import {
  alertReasonText,
  rotatedReason,
  cycleReason,
  productionState,
  updateAlertList,
} from './alert-display.js';
const expanded = new Set();
export const closeMonitorAlerts = () => expanded.clear();
export const expandedMonitorKey = (date) =>
  [...expanded].find((key) => key.startsWith(date))?.slice(date.length);
const filterLabels = new WeakMap();
let rendered = new Map();
export const severityFilters = ['all', 'red', 'yellow', 'green', 'noData', 'disabled'];

/** Localized compact candidate; the card fitter first tries the exact value.
 * Full precision remains in native titles and production details. */
export function monitorNumber(value, ctx, { forceCompact = false } = {}) {
  const exact = ctx.number(value);
  if (!Number.isFinite(value) || (!forceCompact && exact.length <= 5)) return exact;
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
// Keep exact values separate from the fitted text. Geometry is measured in
// batches and cached so quiet polling does not repeatedly reformat stable data.
const numericViews = new WeakMap();
export function setMonitorNumber(node, value, ctx, prefix = '', suffix = '') {
  const valid = Number.isFinite(value);
  const full = valid ? prefix + ctx.number(value) + suffix : ctx.number(value);
  const previous = numericViews.get(node);
  if (previous?.full === full && previous.value === value && previous.language === ctx.language)
    return;
  node.title = full;
  node.textContent = full;
  numericViews.set(node, { value, prefix, suffix, valid, full, language: ctx.language });
}
export function fitMonitorNumbers(cards, ctx) {
  const entries = [...cards.querySelectorAll('.line-card-values b')]
    .map((node) => {
      const view = numericViews.get(node),
        width = node.clientWidth;
      if (!view || width <= 0) return null;
      const style = getComputedStyle(node);
      const key = `${view.full}|${width}|${style.font}|${style.fontSize}|${style.fontFamily}|${style.fontWeight}|${style.fontVariantNumeric}`;
      if (view.fittedKey === key && node.scrollWidth <= width) return null;
      return { node, view, width, key };
    })
    .filter(Boolean);
  entries.forEach(({ node, view }) => {
    if (node.textContent !== view.full) node.textContent = view.full;
  });
  const textWidth = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  };
  // Read all ranges before writing the next candidates: at most four layout
  // passes, rather than forcing a reflow separately for each numeric field.
  for (let pass = 0; pass < 4; pass++) {
    const overflowing = entries.filter(
      (item) =>
        item.view.valid &&
        (textWidth(item.node) > item.width - 1 || item.node.scrollWidth > item.width),
    );
    if (!overflowing.length) break;
    for (const { node, view } of overflowing) {
      const number =
        pass === 0
          ? monitorNumber(view.value, ctx, { forceCompact: true })
          : new Intl.NumberFormat(localeTags[ctx.language] || localeTags.en, {
              notation: pass === 1 ? 'compact' : 'scientific',
              maximumFractionDigits: pass === 2 ? 1 : 0,
            }).format(view.value);
      node.textContent = view.prefix + number + view.suffix;
    }
  }
  entries.forEach(({ view, key }) => {
    view.fittedKey = key;
  });
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
    value: value == null ? null : Number(value.toFixed(1)),
    text: value == null ? '—' : ctx.number(Number(value.toFixed(1))) + '%',
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
export const renderedMonitorLines = () => [...rendered.values()];
export function rememberMonitorLines(lines) {
  rendered = new Map(lines.map((line) => [line.key || line.line, line]));
}
export function monitorCard(line, ctx, metrics) {
  const { t, esc, icon } = ctx,
    key = line.key || line.line;
  const period = slotPresentation(line, ctx),
    reason = reasonView(line, ctx),
    rate = achievementView(line, ctx);
  const open = expanded.has(ctx.date + key);
  return `<article class="line-card alarm-${line.status}${line.blink ? ' blinking-frame' : ''}${open ? ' is-expanded' : ''}" data-monitor-line="${esc(key)}" role="group" aria-label="${esc(productionLabel(line))}">
    <span class="line-card-top"><button type="button" class="line-identity-open" title="${esc(t('details'))}">${productionIdentityMarkup(line, esc)}</button><span class="line-source">${esc(t('sourceLabel', { name: line.sourceLabel === 'all' ? t('allStations') : line.sourceLabel || t('noSource') }))}</span></span>
    <span class="line-health"><span class="line-severity"><span class="signal-lamp lamp-${line.status}" role="img" aria-label="${esc(t('alertState_' + line.unified.severity))}"></span><span class="severity-badge severity-${line.unified.severity}">${esc(t('alertState_' + line.unified.severity))}</span></span><span class="production-state state-${period.state}">${esc(t(period.state === 'completed' ? 'slotCompleted' : period.state))}</span><small class="health-period">${esc(range(period.slot))}</small></span>
    <span class="line-card-values">${metrics}<span class="achievement-metric"><small title="${esc(t('achievementRate'))}">${esc(t('achievementRate'))}</small><b class="${rate.tone}" data-achievement title="${esc(rate.full)}">${esc(rate.text)}</b></span></span>
    <span class="line-trend"></span>

    <div class="line-card-status"><span class="${['red', 'yellow'].includes(line.unified.severity) ? 'alert-text' : ''}" data-card-reason title="${esc(reason.full)}">${esc(reason.text)}</span><div class="reason-controls" ${reason.count > 1 ? '' : 'hidden'}><button type="button" class="reason-step" data-reason-step="-1" aria-label="${esc(t('previous'))}">${icon('left')}</button><output data-reason-count aria-label="${esc(t('alertReasons'))}">${reason.index} / ${reason.count}</output><button type="button" class="reason-step" data-reason-step="1" aria-label="${esc(t('next'))}">${icon('right')}</button></div></div>
    <div class="line-card-actions"><button type="button" class="card-reason-toggle icon-button" data-line-expand aria-expanded="${open}" aria-label="${esc(t('alertDetails'))}" title="${esc(t('alertDetails'))}">${icon('down')}</button></div>
    <section class="card-expanded-details row-expansion" ${open ? '' : 'hidden'}><strong>${esc(t('alertDetails'))}</strong><ul data-card-alert-list></ul><div data-card-issues></div></section>
  </article>`;
}
export function updateMonitorCard(card, line, ctx) {
  const { t } = ctx;
  const period = slotPresentation(line, ctx),
    reason = reasonView(line, ctx),
    rate = achievementView(line, ctx);
  const open = expanded.has(ctx.date + (line.key || line.line));
  const classes =
    'line-card alarm-' +
    line.status +
    (line.blink ? ' blinking-frame' : '') +
    (open ? ' is-expanded' : '');
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
  state.title = state.textContent;
  card.querySelector('.health-period').textContent = range(period.slot);
  setMonitorNumber(card.querySelector('[data-achievement]'), rate.value, ctx, '', '%');
  card.querySelector('[data-achievement]').className = rate.tone;
  const label = card.querySelector('[data-card-reason]');
  label.textContent = reason.text;
  label.title = reason.full;
  label.className = ['red', 'yellow'].includes(line.unified.severity) ? 'alert-text' : '';
  card.querySelector('.reason-controls').hidden = reason.count < 2;
  card.querySelector('[data-reason-count]').textContent = reason.index + ' / ' + reason.count;
  card.querySelector('.card-expanded-details').hidden = !open;
  card.querySelector('[data-line-expand]').setAttribute('aria-expanded', String(open));
  if (open) {
    const reasons = line.unified.reasons || [];
    updateAlertList(
      card.querySelector('[data-card-alert-list]'),
      { ...line.unified, results: reasons },
      t,
    );
    const rows = new Map(ctx.config.rows.map((row) => [row.id, row]));
    const notes = (ctx.records || []).flatMap((record) => {
      const row = record.rowSnapshot || rows.get(record.rowId);
      if (!row || !sameProduction(row, line)) return [];
      return (record.slots || [])
        .filter((slot) => slot.issue)
        .map((slot) => ({ row, record, slot }));
    });
    const details = card.querySelector('[data-card-issues]');
    const content = JSON.stringify([notes, reasons.length, t('noCurrentAlerts')]);
    if (details.dataset.content !== content) {
      details.dataset.content = content;
      details.innerHTML =
        notes
          .map(
            ({ row, record, slot }) =>
              `<div class="reported-issue"><strong>${ctx.esc([row.job, row.station].filter(Boolean).join(' / '))}</strong><span>${ctx.esc(slot.start + '–' + slot.end)}</span><p>${ctx.esc(slot.issue)}</p>${record.updatedAt ? `<small>${ctx.esc(new Intl.DateTimeFormat(localeTags[ctx.language], { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.updatedAt)))}${record.updatedBy ? ' · ' + ctx.esc(record.updatedBy) : ''}</small>` : ''}</div>`,
          )
          .join('') ||
        (reasons.length
          ? ''
          : `<p class="no-current-alerts">${ctx.esc(t('noCurrentAlerts'))}</p>`);
    }
  }
}
export async function handleMonitorAction(event, ctx) {
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
  if (!toggle) return !!event.target.closest('.card-expanded-details');
  cancelMonitorPageMotion(card.parentElement);
  event.preventDefault();
  const id = ctx.date + (line.key || line.line),
    open = !expanded.has(id);
  if (!open) {
    const panel = card.querySelector('.card-expanded-details');
    if (panel.dataset.closing) return true;
    panel.dataset.closing = 'true';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      await panel
        .animate(
          [
            { height: panel.offsetHeight + 'px', opacity: 1 },
            { height: '0px', opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out' },
        )
        .finished.catch(() => {});
    delete panel.dataset.closing;
    expanded.delete(id);
  } else {
    expanded.clear();
    expanded.add(id);
  }
  card.querySelector('.card-expanded-details').hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  updateMonitorCard(card, line, ctx);
  if (open && !ctx.board)
    card.querySelector('.card-expanded-details').scrollIntoView({ block: 'nearest' });
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
