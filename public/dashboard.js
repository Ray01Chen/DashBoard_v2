import { replaceMonitorPage, isMonitorPageTurn } from './monitor-carousel.js';
import { listOrder, byProduction } from './list-order.js';
import {
  setMonitorNumber,
  fitMonitorNumbers,
  monitorCard,
  updateMonitorCard,
  rememberMonitorLines,
  updateStatusFilters,
} from './monitor-ui.js';
import { productionStatusText, updateAlertDisplay, updateAlertList } from './alert-display.js';
import { alertConfig } from './alerts.js';
import { scheduleCatalog } from './production-schedules.js';
import { buildLineMonitor, boardPage, defaultPageRotateSeconds } from './monitor.js';
import { productionIdentityMarkup } from './production-models.js';

/** Aggregate by stable interval ID, including intervals retired after a report was saved. */
export function aggregateMonitorSeries(lines, scheduledSlots) {
  const slots = new Map(scheduledSlots.map((slot) => [slot.id, slot]));
  for (const line of lines)
    for (const value of line.series) slots.set(value.id, { ...slots.get(value.id), ...value });
  // Different lines can introduce intervals between the template's intervals.
  // Use captured production timestamps so midnight remains after the evening.
  return [...slots.values()]
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0) || (a.endAt ?? 0) - (b.endAt ?? 0))
    .map((slot) => {
      const values = lines.map((line) => line.series.find((value) => value.id === slot.id));
      return {
        slot,
        target: sum(values.map((value) => value?.target)),
        actual: sum(values.map((value) => value?.actual)),
      };
    });
}

// Keep live row controls and lamp animation nodes stable across quiet polling.
const cardViews = new WeakMap();
const detailMetricKeys = [
  'dailyTarget',
  'currentTarget',
  'currentActual',
  'cumulativeTarget',
  'cumulativeActual',
  'cumulativeGap',
];

const intervalMetricKeys = ['currentTarget', 'currentActual', 'currentGap'];
const dailyMetricKeys = ['dailyTarget', 'dailyActual', 'dailyGap'];
const isGap = (key) => ['currentGap', 'dailyGap', 'cumulativeGap'].includes(key);

export function overviewMetricsMarkup(
  metrics,
  { t, esc, number, compactMetrics = false },
  keys = detailMetricKeys,
) {
  return keys
    .map((key) => {
      const value = metrics[key];
      const difference = isGap(key);
      const tone =
        difference && value != null
          ? value < 0
            ? 'negative'
            : value > 0
              ? 'positive'
              : ''
          : '';
      return `<span class="production-metric" data-metric="${key}" title="${esc(t(key + 'Help'))}"><small>${esc(t(compactMetrics ? { currentTarget: 'target', dailyTarget: 'target', currentActual: 'actual', dailyActual: 'actual', currentGap: 'gap', dailyGap: 'gap' }[key] || key : key))}</small><b class="${tone}" title="${esc(number(value))}">${difference && value > 0 ? '+' : ''}${number(value)}</b></span>`;
    })
    .join('');
}

function updateOverviewMetrics(element, metrics, ctx) {
  if (!element) return;
  const { number } = ctx;
  for (const metric of element.querySelectorAll('[data-metric]')) {
    const key = metric.dataset.metric;
    const value = metrics[key];
    const output = element.querySelector(`[data-metric="${key}"] b`);
    if (!output) continue;
    const prefix = isGap(key) && value > 0 ? '+' : '';
    if (element.classList.contains('line-card')) setMonitorNumber(output, value, ctx, prefix);
    else {
      output.textContent = prefix + number(value);
      output.title = prefix + number(value);
    }
    output.className =
      isGap(key) && value != null ? (value < 0 ? 'negative' : value > 0 ? 'positive' : '') : '';
  }
}

function updateMonitorPager(page, ctx) {
  const pager = document.querySelector('#board-pagination');
  pager.hidden = !ctx.board && page.pages <= 1;
  pager.classList.toggle('single-page', page.pages <= 1);
  if (!pager.children.length)
    pager.innerHTML = `<span data-page-count role="status"></span>
    <button type="button" class="button" data-board-rotation></button><div>
    <button type="button" class="icon-button" data-page-prev>${ctx.icon('left')}</button>
    <button type="button" class="icon-button" data-page-next>${ctx.icon('right')}</button></div>`;
  pager.querySelector('[data-page-count]').textContent = ctx.t('boardPageCount', {
    page: page.page + 1,
    pages: page.pages,
    count: page.total,
  });
  for (const [selector, value, key] of [
    ['[data-page-prev]', page.page - 1, 'previous'],
    ['[data-page-next]', page.page + 1, 'next'],
  ]) {
    const button = pager.querySelector(selector);
    button.dataset.boardPage = value;
    button.disabled = value < 0 || value >= page.pages;
    button.setAttribute('aria-label', ctx.t(key));
  }
  const rotation = pager.querySelector('[data-board-rotation]');
  rotation.hidden = !ctx.paging?.interval || page.pages <= 1;
  rotation.textContent = ctx.t(ctx.paging?.paused ? 'resumePageRotation' : 'pausePageRotation');
  rotation.setAttribute('aria-pressed', String(!!ctx.paging?.paused));
}

export function renderMonitoring(ctx, { chart = true } = {}) {
  const { config, records, date, shift, activity, now, groupId, chartLine, t, esc, number } =
    ctx;
  const all = buildLineMonitor(config, records, date, shift, activity, now, ctx.dailyRecords);
  const daily =
    shift === 'all' || !ctx.dailyRecords
      ? all
      : buildLineMonitor(config, ctx.dailyRecords, date, 'all', activity, now);
  const dailyTotals = new Map(daily.map((line) => [line.key || line.line, line]));
  const cardMetricKeys = ctx.metricScope === 'day' ? dailyMetricKeys : intervalMetricKeys;
  const group = config.monitoring.groups.find((g) => g.id === groupId);
  const grouped = byProduction(all, ctx.language)
    .filter((line) => !group || group.lines.includes(line.line))
    .map((line) => {
      const daily = dailyTotals.get(line.key || line.line);
      return {
        ...line,
        dailyTarget: daily?.target ?? null,
        dailyActual: daily?.actual ?? null,
        dailyGap:
          daily?.target == null || daily?.actual == null ? null : daily.actual - daily.target,
      };
    });
  updateStatusFilters(document.querySelector('#monitor-status-filters'), grouped, ctx);
  const lines = grouped.filter(
    (line) =>
      !ctx.alertFilter ||
      ctx.alertFilter === 'all' ||
      line.unified.severity === ctx.alertFilter,
  );
  rememberMonitorLines(lines);
  const totals = Object.fromEntries(
    [...new Set([...detailMetricKeys, ...dailyMetricKeys, ...intervalMetricKeys])].map(
      (key) => [key, sum(lines.map((line) => line[key]))],
    ),
  );
  totals.cumulativeGap =
    totals.cumulativeTarget == null || totals.cumulativeActual == null
      ? null
      : totals.cumulativeActual - totals.cumulativeTarget;
  totals.currentGap =
    totals.currentTarget == null || totals.currentActual == null
      ? null
      : totals.currentActual - totals.currentTarget;
  totals.dailyGap =
    totals.dailyTarget == null || totals.dailyActual == null
      ? null
      : totals.dailyActual - totals.dailyTarget;
  const cards = document.querySelector('#line-cards');
  document.querySelector('#alert-summary').textContent = t('alertCount', {
    count: lines.filter((l) => ['red', 'yellow'].includes(l.unified.severity)).length,
  });
  ctx.paging?.update(
    lines.map((line) => line.key || line.line),
    [date, shift, groupId, ctx.alertFilter],
    config.monitoring.pageRotateSeconds ?? defaultPageRotateSeconds,
    ctx.now,
    ctx.boardSize,
  );
  // Keep the expanded unit on its page. Fullscreen dedicates the remaining
  // height to that unit; closing restores its page in the usual line order.
  const focusKey = ctx.expansionKey || ctx.focusKey;
  const editingIndex = focusKey
    ? lines.findIndex((line) => (line.key || line.line) === focusKey)
    : -1;
  const page = boardPage(
      lines,
      editingIndex >= 0
        ? Math.floor(editingIndex / ctx.boardSize)
        : (ctx.paging?.page ?? ctx.boardPage),
      ctx.boardSize,
    ),
    cardLines = page.lines;
  if (editingIndex >= 0 && ctx.paging) ctx.paging.page = page.page;
  const viewKey = JSON.stringify([
    cardLines.map((line) => line.key || line.line),
    date,
    ctx.metricScope,
    ctx.board,
    t('achievementRate'),
    ctx.alertFilter,
    grouped.length,
  ]);
  const previous = cardViews.get(cards);
  const view = {
    key: viewKey,
    revision: ctx.paging?.motionRevision,
    page: page.page,
    signature: ctx.paging?.signature,
    size: ctx.boardSize,
    board: ctx.board,
    metric: ctx.metricScope,
    language: ctx.language,
  };
  const changed = previous?.key !== viewKey;
  if (changed) {
    const markup =
      cardLines
        .map((line) =>
          monitorCard(
            line,
            ctx,
            overviewMetricsMarkup(line, { ...ctx, compactMetrics: true }, cardMetricKeys),
          ),
        )
        .join('') ||
      `<div class="empty-cell">${esc(t(grouped.length ? 'noMatchingLines' : 'emptyGroup'))}</div>`;
    replaceMonitorPage(cards, markup, {
      animate: isMonitorPageTurn(previous, view),
      direction: ctx.paging?.direction || 1,
    });
  }
  cardViews.set(cards, view);
  for (const [index, line] of cardLines.entries()) {
    updateOverviewMetrics(cards.children[index], line, ctx);
    updateMonitorCard(cards.children[index], line, ctx);
  }
  ctx.editor?.sync();
  fitMonitorNumbers(cards, ctx);
  // Batch text writes before measuring plots; hidden dashboards need no plot work.
  for (const [index, line] of cardLines.entries()) {
    const plot = cards.children[index]?.querySelector('.line-trend');
    const geometry = plot?.querySelector('svg')?.viewBox.baseVal;
    // Fewer fullscreen rows share more height. Re-measure only plots whose
    // actual geometry changed; quiet refreshes keep all other plot nodes.
    if (
      plot?.clientWidth > 0 &&
      plot.clientHeight > 0 &&
      (chart ||
        changed ||
        !geometry ||
        Math.abs(geometry.width - plot.clientWidth) > 1 ||
        Math.abs(geometry.height - plot.clientHeight) > 1)
    ) {
      renderTrend(
        plot,
        line.series.map((value) => ({ ...value, slot: value })),
        ctx,
        true,
      );
    }
  }
  updateMonitorPager(page, ctx);
  updatePageAlerts(lines, chartLine, ctx);
  if (!chart) {
    updateOverviewMetrics(document.querySelector('#group-summary'), totals, ctx);
    const dialog = document.querySelector('#line-detail-dialog[open]');
    const detailKey = dialog?.querySelector('[data-detail-line]')?.dataset.detailLine;
    const detail = lines.find((line) => (line.key || line.line) === detailKey);
    if (detail) {
      updateOverviewMetrics(dialog, detail, ctx);
      updateAlertDisplay(dialog.querySelector('[data-detail-alert]'), detail, t, now);
      updateAlertList(dialog.querySelector('[data-detail-alert-list]'), detail.unified, t);
      const state = dialog.querySelector('[data-detail-status]');
      if (state) state.textContent = productionStatusText(detail, t, now);
    }
    return;
  }
  document.querySelector('#group-summary').innerHTML =
    '<div class="group-heading">' +
    ctx.icon('layers') +
    '<div><small>' +
    esc(t('groupTotals')) +
    '</small><h2>' +
    esc(group?.name || t('allGroups')) +
    '</h2></div></div><div class="group-summary-values">' +
    overviewMetricsMarkup(totals, ctx, cardMetricKeys) +
    '</div><span class="current-interval" id="current-interval"></span>';
  const production = scheduleCatalog(config, shift, [
    ...new Set(lines.map((line) => line.line)),
  ]).filter((s) => s.kind === 'production');
  const trend = document.querySelector('#group-trend');
  renderTrend(trend, aggregateMonitorSeries(lines, production), ctx);
  document.querySelector('#output-share').innerHTML = shareMarkup(
    lines.map((line) => ({ ...line, actual: line.cumulativeActual })),
    ctx,
  );
  document.querySelector('#refresh-interval').textContent = t('refreshEvery', {
    seconds: config.monitoring.refreshSeconds,
  });
  document.querySelector('#group-tabs').innerHTML =
    `<button role="tab" data-group="" class="${!group ? 'selected' : ''}" aria-selected="${!group}">${esc(t('allGroups'))}<small>${all.length}</small></button>` +
    listOrder(config.monitoring.groups, ctx.language, (group) => group.name, 'groups')
      .map(
        (g) =>
          `<button role="tab" data-group="${esc(g.id)}" class="${group?.id === g.id ? 'selected' : ''}" aria-selected="${group?.id === g.id}">${esc(g.name)}<small>${g.lines.length}</small></button>`,
      )
      .join('');
  const selected = lines.some((l) => (l.key || l.line) === chartLine) ? chartLine : '';
  document.querySelector('#chart-line').innerHTML =
    `<option value="">${esc(t('allGroups'))}</option>` +
    lines
      .map((l) => `<option value="${esc(l.key || l.line)}">${esc(l.label || l.line)}</option>`)
      .join('');
  document.querySelector('#chart-line').value = selected;
  const displayed = lines.filter((l) => !selected || (l.key || l.line) === selected);
  // A single-line drill-down must not inherit other lines' time axes.
  const detailSlots = scheduleCatalog(config, shift, [
    ...new Set(displayed.map((line) => line.line)),
  ]).filter((slot) => slot.kind === 'production');
  const values = aggregateMonitorSeries(displayed, detailSlots),
    slots = values.map((value) => value.slot);
  const has = values.some((v) => v.actual !== null || v.target !== null),
    max = Math.max(10, ...values.flatMap((v) => [v.target || 0, v.actual || 0])),
    ceiling = Math.ceil(max / 40) * 40;
  const width = Math.max(240, Math.round(document.querySelector('#chart').clientWidth) || 700),
    layout = hourlyLabelLayout(width, values.length),
    height = layout.height,
    left = 47,
    right = 22,
    top = 20,
    bottom = layout.bottom,
    plotH = height - top - bottom,
    step = values.length > 1 ? (width - left - right) / (values.length - 1) : 0;
  const x = (i) => (values.length > 1 ? left + i * step : width / 2),
    y = (v) => top + plotH - (v / ceiling) * plotH;
  let svg = `<svg class="chart-svg ${slots.length > 6 ? 'dense' : ''}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t('hourlyTrend'))}">`;
  for (let i = 0; i <= 4; i++) {
    const point = top + (plotH * i) / 4;
    svg += `<line x1="${left}" x2="${width - right}" y1="${point}" y2="${point}" class="chart-grid"/><text x="${left - 10}" y="${point + 3}" text-anchor="end">${has ? number(ceiling * (1 - i / 4)) : i === 4 ? '0' : ''}</text>`;
  }
  for (const key of ['target', 'actual']) {
    let path = '',
      connected = false;
    values.forEach((v, i) => {
      if (v[key] === null) {
        connected = false;
        return;
      }
      path += `${connected ? 'L' : 'M'}${x(i)},${y(v[key])} `;
      connected = true;
    });
    svg += `<path d="${path}" fill="none" class="trend-${key}"/>`;
  }
  values.forEach((v, i) => {
    const labelY = height - bottom + 20;
    svg += `<text class="hour-label" data-slot-id="${esc(v.slot.id)}" x="${x(i)}" y="${labelY}" text-anchor="${layout.angle ? 'end' : 'middle'}" ${layout.angle ? `transform="rotate(${layout.angle} ${x(i)} ${labelY})"` : ''}>${layout.compact ? v.slot.start : v.slot.start + ' - ' + v.slot.end}</text>`;
    if (v.actual === null) return;
    const missed = v.target !== null && v.actual < v.target,
      status = v.target === null ? t('actual') : t(missed ? 'belowTarget' : 'onTarget'),
      description = `${v.slot.start}–${v.slot.end} · ${t('target')}: ${number(v.target)} · ${t('actual')}: ${number(v.actual)} · ${status}`;
    svg += `<g tabindex="0" role="img" data-trend-tip="${esc(description)}" aria-label="${esc(description)}"><title>${esc(description)}</title>${missed ? `<rect x="${x(i) - 4.5}" y="${y(v.actual) - 4.5}" width="9" height="9" transform="rotate(45 ${x(i)} ${y(v.actual)})" class="trend-point point-below"/>` : `<circle cx="${x(i)}" cy="${y(v.actual)}" r="5" class="trend-point ${v.target === null ? 'point-unknown' : 'point-met'}"/>`}</g>`;
  });
  document.querySelector('#interval-details').innerHTML = values
    .map((v) => {
      const gap = v.actual !== null && v.target !== null ? v.actual - v.target : null;
      return (
        '<tr><td>' +
        esc(v.slot.start + ' - ' + v.slot.end) +
        '</td><td>' +
        number(v.target) +
        '</td><td>' +
        number(v.actual) +
        '</td><td class="' +
        (gap < 0 ? 'negative' : gap > 0 ? 'positive' : '') +
        '">' +
        (gap > 0 ? '+' : '') +
        number(gap) +
        '</td><td>' +
        esc(
          t(
            v.actual === null
              ? 'waiting'
              : v.target === null
                ? 'actual'
                : gap < 0
                  ? 'belowTarget'
                  : 'onTarget',
          ),
        ) +
        '</td></tr>'
      );
    })
    .join('');
  document.querySelector('#chart').innerHTML =
    svg +
    '</svg>' +
    (has
      ? ''
      : `<div class="chart-empty"><strong>${esc(t('emptyChart'))}</strong><span>${esc(t('emptyChartDesc'))}</span></div>`);
}

// Each settings page renders only the data it owns. Keeping these templates
// independent avoids coupling navigation to the text or order of HTML sections.
export function groupSettings(ctx) {
  const { draft, t, esc, icon } = ctx,
    m = draft.monitoring;
  return `<section class="panel monitor-settings-card"><div class="panel-heading"><div><h2>${esc(t('groupsTitle'))}</h2><p>${esc(t('groupsDesc'))}</p></div><button class="button" data-action="add-group">${icon('plus')}${esc(t('addGroup'))}</button></div><div class="group-settings-grid">${listOrder(
    m.groups,
    ctx.language,
    (group) => group.name,
    'groups',
  )
    .map((g) => {
      const i = m.groups.indexOf(g);
      return `<div class="group-settings"><div><input data-group-name="${i}" value="${esc(g.name)}" maxlength="60" aria-label="${esc(t('groupName'))}"><button class="icon-button" data-action="remove-group" data-index="${i}" aria-label="${esc(t('remove'))} ${esc(g.name)}">${icon('trash')}</button></div><details class="group-line-picker"><summary><span data-group-count="${i}">${esc(t('selectedLineCount', { count: g.lines.length }))}</span>${icon('down')}</summary><div class="group-line-options">${listOrder(
        draft.lines,
        ctx.language,
        undefined,
        'lines',
      )
        .map(
          (line) =>
            `<label><input type="checkbox" data-group-member="${i}" value="${esc(line)}" ${g.lines.includes(line) ? 'checked' : ''}>${esc(line)}</label>`,
        )
        .join('')}</div></details></div>`;
    })
    .join('')}</div></section>`;
}

export function alertSettings(ctx) {
  const { draft, t, esc, icon } = ctx;
  return `${alertControls(ctx)}${unifiedSettings(ctx)}${['gap', 'idle']
    .map(
      (type) =>
        `<section class="panel monitor-settings-card"><div class="panel-heading"><div><h2>${esc(t(type === 'gap' ? 'gapAlert' : 'idleAlert'))}</h2><p>${esc(t('alertDesc'))}</p></div><button class="button" data-action="add-alert" data-rule-type="${type}">${icon('plus')}${esc(t('addRule'))}</button></div><div class="table-scroll"><table class="alert-settings-table"><thead><tr><th>${esc(t('enabled'))}</th><th>${esc(t('comparison'))}</th><th>${esc(t('threshold'))} (${esc(t(type === 'gap' ? 'unit' : 'seconds'))})</th><th>${esc(t('lampColor'))}</th><th>${esc(t('flashing'))}</th><th>${esc(t('actions'))}</th></tr></thead><tbody>${draft.monitoring.rules
          .map((r, i) => ({ r, i }))
          .filter((v) => v.r.type === type)
          .map(
            ({ r, i }) =>
              `<tr><td><input type="checkbox" data-alert-field="enabled" data-index="${i}" ${r.enabled ? 'checked' : ''} aria-label="${esc(t('enabled'))}"></td><td><select data-alert-field="comparison" data-index="${i}" aria-label="${esc(t('comparison'))}"><option value="gt" ${r.comparison === 'gt' ? 'selected' : ''}>${esc(t('above'))}</option><option value="gte" ${r.comparison === 'gte' ? 'selected' : ''}>${esc(t('atLeast'))}</option></select></td><td><input type="number" min="1" max="99999999" step="1" value="${r.threshold}" data-alert-field="threshold" data-index="${i}" aria-label="${esc(t('threshold'))}"></td><td><select data-alert-field="color" data-index="${i}" aria-label="${esc(t('lampColor'))}">${['yellow', 'red', 'blue', 'purple'].map((c) => `<option value="${c}" ${r.color === c ? 'selected' : ''}>${esc(t(c))}</option>`).join('')}</select></td><td><input type="checkbox" data-alert-field="blink" data-index="${i}" ${r.blink ? 'checked' : ''} aria-label="${esc(t('flashing'))}"></td><td><button class="icon-button" data-action="remove-alert" data-index="${i}" aria-label="${esc(t('remove'))}">${icon('trash')}</button></td></tr>`,
          )
          .join('')}</tbody></table></div></section>`,
    )
    .join(
      '',
    )}<div class="calculation-note">${icon('info')}<span>${esc(t('monitorHint'))}</span></div>`;
}
function alertControls({ draft, t, esc }) {
  const m = draft.monitoring;
  return (
    '<section class="panel monitor-settings-card refresh-settings"><label>' +
    esc(t('refreshSeconds')) +
    '<input id="refresh-seconds" type="number" min="1" max="3600" step="1" value="' +
    m.refreshSeconds +
    '"></label><p>' +
    esc(t('refreshDesc')) +
    '</p><label>' +
    esc(t('pageRotateSeconds')) +
    '<input id="page-rotate-seconds" type="number" min="0" max="3600" step="1" value="' +
    (m.pageRotateSeconds ?? defaultPageRotateSeconds) +
    '"></label><p>' +
    esc(t('pageRotateHelp')) +
    '</p><p>' +
    esc(t('ruleEnabledHint')) +
    '</p></section>'
  );
}

export function sum(values) {
  const present = values.filter((v) => v !== null && v !== undefined);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}
export function outputShares(lines) {
  const total = lines.reduce((a, l) => a + Math.max(0, l.actual || 0), 0);
  return lines.map((l) => ({
    line: l.label || l.line,
    actual: l.actual,
    percent: total ? (Math.max(0, l.actual || 0) / total) * 100 : 0,
  }));
}
function shareMarkup(lines, { t, esc, number }) {
  const shares = outputShares(lines),
    total = sum(lines.map((l) => l.actual)),
    palette = [
      '#0087c9',
      '#17aaa1',
      '#7269d9',
      '#f3ab34',
      '#ed7188',
      '#4678ab',
      '#87b640',
      '#b47bd3',
      '#c77740',
      '#51bdd6',
      '#b4a42c',
      '#73909f',
    ];
  let offset = 0;
  const arcs = shares
    .map((l, i) => {
      const arc =
        '<circle cx="80" cy="80" r="59" fill="none" stroke="' +
        palette[i % palette.length] +
        '" stroke-width="24" pathLength="100" stroke-dasharray="' +
        l.percent +
        ' ' +
        (100 - l.percent) +
        '" stroke-dashoffset="' +
        -offset +
        '" transform="rotate(-90 80 80)"><title>' +
        esc(l.label || l.line) +
        ': ' +
        number(l.percent.toFixed(1)) +
        '%</title></circle>';
      offset += l.percent;
      return arc;
    })
    .join('');
  return (
    '<div class="share-layout"><svg viewBox="0 0 160 160" role="img" aria-label="' +
    esc(t('outputShare')) +
    '"><circle cx="80" cy="80" r="59" fill="none" stroke="#e8edf3" stroke-width="24"/>' +
    arcs +
    '<text x="80" y="77" text-anchor="middle" class="donut-total">' +
    number(total) +
    '</text><text x="80" y="97" text-anchor="middle">' +
    esc(t('cumulativeActual')) +
    '</text></svg><div class="share-legend">' +
    shares
      .map(
        (l, i) =>
          '<div><svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="' +
          palette[i % palette.length] +
          '"/></svg>' +
          productionIdentityMarkup(lines[i], esc) +
          '<strong>' +
          number(l.percent.toFixed(1)) +
          '%</strong><small>' +
          number(l.actual) +
          '</small></div>',
      )
      .join('') +
    '</div></div>' +
    (!total ? '<p class="share-empty">' + esc(t('shareEmpty')) + '</p>' : '')
  );
}
/** Render from CSS container geometry, preserving dense-chart scroll position.
 * SVG coordinates match CSS pixels so resizing never shrinks text or curves. */
export function renderTrend(container, values, context, mini = false) {
  const style = getComputedStyle(container);
  const width = Math.max(
    1,
    container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
  );
  const height = mini
    ? container.clientHeight
    : parseFloat(style.getPropertyValue('--trend-height')) || container.clientHeight;
  const scrollLeft = container.scrollLeft;
  container.innerHTML = trendSvg(values, { ...context, trendSize: { width, height } }, mini);
  container.scrollLeft = scrollLeft;
}

export function trendSvg(values, { t, esc, number, trendSize }, mini = false) {
  const left = mini ? 14 : 48,
    right = mini ? 14 : 24,
    // HH:MM labels need 48 CSS pixels per interval, including a visible gap.
    // Keep every interval; expanding the plot is preferable to shrinking text.
    minimumWidth = left + right + Math.max(0, values.length - 1) * 48,
    w = mini ? trendSize?.width || 310 : Math.max(trendSize?.width || 700, minimumWidth),
    h = trendSize?.height || (mini ? 82 : 230),
    top = mini ? 6 : 16,
    bottom = mini ? 6 : 30,
    max =
      Math.ceil(
        (Math.max(1, ...values.flatMap((v) => [v.target || 0, v.actual || 0])) * 1.15) / 4,
      ) * 4;
  const x = (i) =>
      values.length > 1 ? left + (i * (w - left - right)) / (values.length - 1) : w / 2,
    y = (v) => top + (h - top - bottom) * (1 - v / max),
    has = values.some((v) => v.actual != null || v.target != null);
  let svg =
    '<svg class="' +
    (mini ? 'mini-trend' : 'group-trend-svg') +
    '" ' +
    // Width attributes work under the app's CSP; inline style attributes do not.
    (mini ? '' : `width="${minimumWidth}" `) +
    'viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '" role="img" aria-label="' +
    esc(t('hourlyTrend')) +
    '">';
  for (let i = 0; !mini && i < 3; i++) {
    const yy = top + (i * (h - top - bottom)) / 2;
    svg +=
      '<line class="chart-grid" x1="' +
      left +
      '" x2="' +
      (w - right) +
      '" y1="' +
      yy +
      '" y2="' +
      yy +
      '"/>';
    svg +=
      '<text x="' +
      (left - 6) +
      '" y="' +
      (yy + 4) +
      '" text-anchor="end">' +
      number(Math.round(max * (1 - i / 2))) +
      '</text>';
  }
  for (const key of ['target', 'actual']) {
    let path = '',
      connected = false;
    values.forEach((v, i) => {
      if (v[key] == null) {
        connected = false;
        return;
      }
      path += (connected ? 'L' : 'M') + x(i) + ',' + y(v[key]) + ' ';
      connected = true;
    });
    svg += '<path class="trend-' + key + '" fill="none" d="' + path + '"/>';
  }
  values.forEach((v, i) => {
    if (!mini) {
      svg += `<text class="trend-time-label" x="${x(i)}" y="${h - 5}" text-anchor="middle">${esc(v.slot?.start || '')}</text>`;
    }
    if (v.actual == null) return;
    const below = v.target != null && v.actual < v.target,
      description =
        (v.slot?.start || '') +
        ' | ' +
        t('target') +
        ': ' +
        number(v.target) +
        ' | ' +
        t('actual') +
        ': ' +
        number(v.actual) +
        ' | ' +
        t(v.target == null ? 'actual' : below ? 'belowTarget' : 'onTarget');
    svg +=
      '<g><title>' +
      esc(description) +
      '</title>' +
      (below
        ? '<rect class="trend-point point-below" x="' +
          (x(i) - 3.5) +
          '" y="' +
          (y(v.actual) - 3.5) +
          '" width="7" height="7" transform="rotate(45 ' +
          x(i) +
          ' ' +
          y(v.actual) +
          ')"/>'
        : '<circle class="trend-point ' +
          (v.target == null ? 'point-unknown' : 'point-met') +
          '" cx="' +
          x(i) +
          '" cy="' +
          y(v.actual) +
          '" r="' +
          (mini ? 2.5 : 4) +
          '"/>') +
      '</g>';
  });
  values.forEach((v, i) => {
    const step = (w - left - right) / Math.max(1, values.length - 1),
      start = values.length === 1 ? left : Math.max(left, x(i) - step / 2),
      end = values.length === 1 ? w - right : Math.min(w - right, x(i) + step / 2),
      tip =
        (v.slot?.start || '') +
        ' - ' +
        (v.slot?.end || '') +
        '\n' +
        t('target') +
        ': ' +
        number(v.target) +
        '\n' +
        t('actual') +
        ': ' +
        number(v.actual) +
        '\n' +
        t(
          v.actual == null
            ? 'waiting'
            : v.target == null
              ? 'actual'
              : v.actual < v.target
                ? 'belowTarget'
                : 'onTarget',
        );
    svg +=
      '<rect class="trend-hit" x="' +
      start +
      '" y="0" width="' +
      (end - start) +
      '" height="' +
      h +
      '" fill="transparent" data-trend-tip="' +
      esc(tip) +
      '" aria-label="' +
      esc(tip) +
      '" ' +
      (mini ? '' : 'tabindex="0" role="img"') +
      '><title>' +
      esc(tip) +
      '</title></rect>';
  });
  if (!has)
    svg +=
      '<text pointer-events="none" x="' +
      w / 2 +
      '" y="' +
      h / 2 +
      '" text-anchor="middle">' +
      esc(t('emptyChart')) +
      '</text>';
  return svg + '</svg>';
}

export function hourlyLabelLayout(width, count) {
  const spacing = (width - 69) / Math.max(1, count - 1),
    compact = spacing < 115,
    angle = spacing < 44 ? -55 : spacing < 75 ? -35 : 0,
    bottom = angle ? 76 : 38;
  return { compact, angle, bottom, height: 182 + bottom };
}

/** New policies share the existing settings draft and publication workflow. */
function unifiedSettings({ draft, t, esc }) {
  const policies = alertConfig(draft.monitoring);
  const policyMarkup = Object.entries(policies)
    .map(([type, rule]) => {
      const fields =
        type === 'reporting' ? ['graceMinutes', 'redAfterMinutes'] : ['green', 'red'];
      const inputs = fields
        .map((field) => {
          const max =
            type === 'performance' ? 100 : field === 'redAfterMinutes' ? 199998 : 99999;
          return `<label>${esc(t('alertField_' + type + '_' + field))}
          <input type="number" min="0" max="${max}" step="any" data-policy="${type}"
            data-policy-field="${field}" value="${rule[field]}" required></label>`;
        })
        .join('');
      let reportingHint = '';
      if (type === 'reporting') {
        reportingHint = `<p data-reporting-timeline>${esc(
          t('reportingTimeline', {
            grace: rule.graceMinutes,
            red: rule.redAfterMinutes,
          }),
        )}</p>`;
        const saved = draft.monitoring.unified?.reporting;
        if (saved?.redMinutes != null && saved.redAfterMinutes == null)
          reportingHint += `<p class="form-hint">${esc(
            t('reportingLegacyHint', {
              grace: rule.graceMinutes,
              extra: saved.redMinutes,
              red: rule.redAfterMinutes,
            }),
          )}</p>`;
      }
      return `<section class="panel monitor-settings-card unified-policy">
        <h2><label><input type="checkbox" data-policy="${type}" data-policy-field="enabled"
          ${rule.enabled ? 'checked' : ''}>${esc(t('alertName_' + type))}</label></h2>
        <p>${esc(t('alertHelp_' + type))}</p><div class="policy-fields">${inputs}</div>
        ${reportingHint}</section>`;
    })
    .join('');
  return `<div class="unified-policies">${policyMarkup}</div><p class="form-hint">${esc(t('unifiedLightHelp'))}</p>`;
}

function updatePageAlerts(lines, key, { t, now, detail }) {
  const line = lines.find((line) => (line.key || line.line) === key);
  const panel = document.querySelector('[data-page-alert-panel]');
  if (!panel) return;
  panel.hidden = !line || !detail;
  if (!line) return;
  updateAlertDisplay(panel.querySelector('[data-page-alert]'), line, t, now);
  updateAlertList(panel.querySelector('[data-page-alert-list]'), line.unified, t);
  panel.querySelector('[data-page-status]').textContent = productionStatusText(line, t, now);
}
