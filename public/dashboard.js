import { buildLineMonitor, boardPage, monitoringPeriodState } from './monitor.js';
import { productionLabel, productionIdentityMarkup } from './production-models.js';

/** Aggregate by stable interval ID, including intervals retired after a report was saved. */
export function aggregateMonitorSeries(lines, scheduledSlots) {
  const slots = new Map(scheduledSlots.map((slot) => [slot.id, slot]));
  for (const line of lines)
    for (const value of line.series) if (!slots.has(value.id)) slots.set(value.id, value);
  return [...slots.values()].map((slot) => {
    const values = lines.map((line) => line.series.find((value) => value.id === slot.id));
    return {
      slot,
      target: sum(values.map((value) => value?.target)),
      actual: sum(values.map((value) => value?.actual)),
    };
  });
}

export function renderMonitoring(ctx, { chart = true } = {}) {
  const { config, records, date, shift, activity, now, groupId, chartLine, t, esc, number } =
    ctx;
  const all = buildLineMonitor(config, records, date, shift, activity, now),
    group = config.monitoring.groups.find((g) => g.id === groupId),
    lines = all.filter((l) => !group || group.lines.includes(l.line));
  const cards = document.querySelector('#line-cards');
  document.querySelector('#alert-summary').textContent = t('alertCount', {
    count: lines.filter((l) => l.rule).length,
  });
  const page = boardPage(lines, ctx.boardPage, ctx.boardSize),
    cardLines = ctx.board ? page.lines : lines;
  const cardMarkup =
    cardLines
      .map((l) => {
        const period = monitoringPeriodState(config, date, shift, now),
          progress =
            l.actual === null
              ? t('waiting')
              : l.gap === null
                ? t('noComparableTarget')
                : t(l.gap < 0 ? 'belowTarget' : 'onTarget');
        const status = t('outputStatus') + ': ' + progress,
          monitor =
            t('monitoringStatus') +
            ': ' +
            (period === 'activeMonitoring'
              ? t('idleFor', { seconds: l.idleSeconds })
              : t(period));

        if (!chart) {
          const card = [...cards.children].find(
            (c) => c.dataset.monitorLine === (l.key || l.line),
          );
          if (card) {
            const classes =
              'line-card alarm-' +
              l.status +
              (l.blink ? ' blinking-frame' : '') +
              (chartLine === (l.key || l.line) ? ' selected' : '');
            if (card.className !== classes) card.className = classes;
            const lamp = card.querySelector('.signal-lamp');
            lamp.className = 'signal-lamp lamp-' + l.status;
            lamp.setAttribute('aria-label', status);
            const label = card.querySelector('.line-card-status>span');
            label.textContent = status;
            label.className = l.rule ? 'alert-text' : '';
            card.querySelector('.line-card-status>small').textContent = monitor;
          }
          return '';
        }
        return `<button class="line-card alarm-${l.status} ${l.blink ? 'blinking-frame' : ''} ${chartLine === (l.key || l.line) ? 'selected' : ''}" data-monitor-line="${esc(l.key || l.line)}" aria-label="${esc(productionLabel(l))}" aria-pressed="${chartLine === (l.key || l.line)}"><span class="line-card-top">${productionIdentityMarkup(l, esc)}<span class="signal-lamp lamp-${l.status} " role="img" aria-label="${esc(status)}"></span></span><span class="line-source">${esc(t('sourceLabel', { name: l.sourceLabel || t('noSource') }))}</span><span class="line-card-values"><span>${esc(t('target'))}<b title="${number(l.target)}">${number(l.target)}</b></span><span>${esc(t('actual'))}<b title="${number(l.actual)}">${number(l.actual)}</b></span><span>${esc(t('gap'))}<b class="${l.gap < 0 ? 'negative' : l.gap > 0 ? 'positive' : ''}">${l.gap > 0 ? '+' : ''}${number(l.gap)}</b></span></span>${trendSvg(
          l.series.map((v) => ({
            ...v,
            slot: v,
          })),
          ctx,
          true,
        )}<span class="line-card-status" title="${esc(t('achievementExplain') + ' / ' + monitor)}"><span class="${l.rule ? 'alert-text' : ''}">${esc(status)}</span><small>${esc(monitor)}</small></span></button>`;
      })
      .join('') || `<div class="empty-cell">${esc(t('emptyGroup'))}</div>`;
  if (!chart) return;
  cards.innerHTML = cardMarkup;
  document.querySelector('#board-pagination').innerHTML = ctx.board
    ? '<span>' +
      esc(t('boardPageCount', { page: page.page + 1, pages: page.pages, count: page.total })) +
      '</span><div><button class="icon-button" data-board-page="' +
      (page.page - 1) +
      '" ' +
      (page.page === 0 ? 'disabled' : '') +
      ' aria-label="' +
      esc(t('previous')) +
      '">' +
      ctx.icon('left') +
      '</button><button class="icon-button" data-board-page="' +
      (page.page + 1) +
      '" ' +
      (page.page === page.pages - 1 ? 'disabled' : '') +
      ' aria-label="' +
      esc(t('next')) +
      '">' +
      ctx.icon('right') +
      '</button></div>'
    : '';
  const totalOf = (key) => {
    const values = lines.map((l) => l[key]).filter((v) => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const actual = totalOf('actual'),
    target = totalOf('target');
  document.querySelector('#group-summary').innerHTML =
    '<div class="group-heading">' +
    ctx.icon('layers') +
    '<div><small>' +
    esc(t('groupTotals')) +
    '</small><h2>' +
    esc(group?.name || t('allGroups')) +
    '</h2></div></div><div class="group-summary-values">' +
    [
      ['target', target],
      ['actual', actual],
      ['gap', totalOf('gap')],
    ]
      .map(
        ([key, value]) =>
          '<div class="group-stat"><small>' +
          esc(t(key)) +
          '</small><strong title="' +
          number(value) +
          '">' +
          number(value) +
          '</strong></div>',
      )
      .join('') +
    '</div><span class="current-interval" id="current-interval"></span>';
  const production = config.schedules[shift].filter((s) => s.kind === 'production');
  const trend = document.querySelector('#group-trend');
  const trendStyle = getComputedStyle(trend);
  // Measure normal and fullscreen charts alike. Dense schedules can extend
  // inside the chart's own scroll area without shrinking their time labels.
  const trendSize = {
    width: Math.max(
      240,
      Math.round(
        trend.clientWidth -
          parseFloat(trendStyle.paddingLeft) -
          parseFloat(trendStyle.paddingRight),
      ),
    ),
    height: ctx.board ? (innerWidth <= 750 ? 95 : 130) : 230,
  };
  const scrollLeft = trend.scrollLeft;
  trend.innerHTML = trendSvg(aggregateMonitorSeries(lines, production), { ...ctx, trendSize });
  trend.scrollLeft = scrollLeft;
  document.querySelector('#output-share').innerHTML = shareMarkup(lines, ctx);
  document.querySelector('#refresh-interval').textContent = t('refreshEvery', {
    seconds: config.monitoring.refreshSeconds,
  });
  document.querySelector('#group-tabs').innerHTML =
    `<button role="tab" data-group="" class="${!group ? 'selected' : ''}" aria-selected="${!group}">${esc(t('allGroups'))}<small>${all.length}</small></button>` +
    config.monitoring.groups
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
  const values = aggregateMonitorSeries(displayed, production),
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
  return `<section class="panel monitor-settings-card"><div class="panel-heading"><div><h2>${esc(t('groupsTitle'))}</h2><p>${esc(t('groupsDesc'))}</p></div><button class="button" data-action="add-group">${icon('plus')}${esc(t('addGroup'))}</button></div><div class="group-settings-grid">${m.groups.map((g, i) => `<div class="group-settings"><div><input data-group-name="${i}" value="${esc(g.name)}" maxlength="60" aria-label="${esc(t('groupName'))}"><button class="icon-button" data-action="remove-group" data-index="${i}" aria-label="${esc(t('remove'))} ${esc(g.name)}">${icon('trash')}</button></div><details class="group-line-picker"><summary><span data-group-count="${i}">${esc(t('selectedLineCount', { count: g.lines.length }))}</span>${icon('down')}</summary><div class="group-line-options">${draft.lines.map((line) => `<label><input type="checkbox" data-group-member="${i}" value="${esc(line)}" ${g.lines.includes(line) ? 'checked' : ''}>${esc(line)}</label>`).join('')}</div></details></div>`).join('')}</div></section>`;
}

export function alertSettings(ctx) {
  const { draft, t, esc, icon } = ctx;
  return `${alertControls(ctx)}${['gap', 'idle']
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
    esc(t('actual')) +
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
export function trendSvg(values, { t, esc, number, trendSize }, mini = false) {
  const left = mini ? 14 : 48,
    right = mini ? 14 : 24,
    // HH:MM labels need 48 CSS pixels per interval, including a visible gap.
    // Keep every interval; expanding the plot is preferable to shrinking text.
    minimumWidth = left + right + Math.max(0, values.length - 1) * 48,
    w = mini ? 310 : Math.max(trendSize?.width || 700, minimumWidth),
    h = mini ? 82 : trendSize?.height || 230,
    top = 16,
    bottom = mini ? 12 : 30,
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
          '" r="4"/>') +
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
