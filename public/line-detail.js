import { buildLineMonitor } from './monitor.js';
import { trendSvg, sum } from './dashboard.js';
import {
  sameProduction,
  productionIdentityMarkup,
  orderedStationRows,
  stationHasOutput,
  personnelNames,
} from './production-models.js';

/** Read-only drill-down stays inside fullscreen; opening it never changes the board's group or page. */
export function showLineDetail(dialog, context) {
  const { config, records, line, date, shift, t, esc, number, icon } = context;
  const monitor = buildLineMonitor(
    config,
    records,
    date,
    shift,
    context.activity,
    context.now,
  ).find((item) => (item.key || item.line) === line);
  if (!monitor) return;

  // Prefer each saved row definition so a later station rename or reassignment
  // cannot silently change the historical details shown by this dialog.
  const rowMap = new Map(config.rows.map((row) => [row.id, row]));
  for (const record of records) {
    if (record.rowSnapshot) rowMap.set(record.rowId, record.rowSnapshot);
  }
  const rows = orderedStationRows(config, [...rowMap.values()]).filter(
    (row) =>
      sameProduction(row, monitor) &&
      (row.active !== false || records.some((record) => record.rowId === row.id)),
  );
  const recordMap = new Map(records.map((record) => [record.rowId, record]));
  // Monitor series already contains the union of saved and current intervals.
  // Pairing it with today's schedule by index mislabels historical intervals.
  const series = monitor.series.map((value) => ({ ...value, slot: value }));
  // De-duplicate directory names across stations; preserve legacy free-text names.
  const assignedNames = (role, legacyField) => [
    ...new Set(
      rows.flatMap((row) => {
        const record = recordMap.get(row.id);
        return personnelNames(record, role, record?.[legacyField]);
      }),
    ),
  ];
  const people = assignedNames(shift, shift === 'day' ? 'dayTeam' : 'nightTeam');
  const owners = assignedNames('owners', 'owner');

  dialog.querySelector('#line-detail-content').innerHTML = `
    <header class="line-modal-header">
      <div><span class="section-eyebrow">${esc(date)} · ${esc(t(shift))} · ${esc(t('details'))}</span><h2 id="line-modal-title">${productionIdentityMarkup(monitor, esc)}</h2></div>
      <button class="icon-button" data-close-line-dialog aria-label="${esc(t('close'))}">${icon('close')}</button>
    </header>
    <div class="line-modal-body">
      <div class="line-modal-totals">${[
        ['target', monitor.target],
        ['actual', monitor.actual],
        ['gap', monitor.gap],
      ]
        .map(
          ([key, value]) =>
            `<div><small>${esc(t(key))}</small><strong>${number(value)}</strong></div>`,
        )
        .join('')}</div>
      <div class="line-modal-people">${[
        ['assignedStaff', people],
        ['owner', owners],
      ]
        .map(
          ([label, names]) =>
            `<div><b>${esc(t(label))}</b><span>${names.length ? names.map((name) => `<span class="person-name">${esc(name)}</span>`).join('') : esc(t('none'))}</span></div>`,
        )
        .join('')}</div>
      <section class="line-modal-trend"><h3>${esc(t('hourlyTrend'))}</h3>${trendSvg(series, context)}</section>
      <table class="line-modal-table"><thead><tr><th>${esc(t('timeSlot'))}</th><th>${esc(t('target'))}</th><th>${esc(t('actual'))}</th><th>${esc(t('gap'))}</th></tr></thead><tbody>${series.map((value) => `<tr><td>${esc(value.slot.start)}–${esc(value.slot.end)}</td><td>${number(value.target)}</td><td>${number(value.actual)}</td><td>${number(value.target != null && value.actual != null ? value.actual - value.target : null)}</td></tr>`).join('')}</tbody></table>
      <div class="line-modal-stations">${rows
        .map((row) => {
          const record = recordMap.get(row.id);
          return `<section><h3>${esc(row.station || t('noStation'))} <small>${esc(row.job || t('noJob'))}</small></h3>
          ${stationHasOutput(row, config) ? '' : `<p class="muted">${esc(t('noOutput'))}</p>`}<dl><div><dt>${esc(t('target'))}</dt><dd>${number(sum(record?.slots.map((slot) => slot.target) || []))}</dd></div><div><dt>${esc(t('actual'))}</dt><dd>${number(sum(record?.slots.map((slot) => slot.actual) || []))}</dd></div></dl>
          ${
            (record?.slots || [])
              .filter((slot) => slot.issue)
              .map(
                (slot) =>
                  `<p class="line-modal-issue"><b>${esc(slot.start)}–${esc(slot.end)}</b> ${esc(slot.issue)}</p>`,
              )
              .join('') || `<p class="muted">${esc(t('noIssues'))}</p>`
          }</section>`;
        })
        .join('')}</div>
    </div>`;
  dialog.querySelector('[data-close-line-dialog]').onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
}
