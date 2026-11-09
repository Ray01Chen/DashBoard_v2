import { buildLineMonitor } from './monitor.js';
import { trendSvg, sum, overviewMetricsMarkup } from './dashboard.js';
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
  const stationRecord = (row) => recordMap.get(row.id) || context.defaults?.[row.id];
  // Monitor series already contains the union of saved and current intervals.
  // Pairing it with today's schedule by index mislabels historical intervals.
  const series = monitor.series.map((value) => ({ ...value, slot: value }));
  // De-duplicate directory names across stations; preserve legacy free-text names.
  const assignedNames = (role, legacyField) => [
    ...new Set(
      rows.flatMap((row) => {
        const record = stationRecord(row);
        return personnelNames(record, role, record?.[legacyField]);
      }),
    ),
  ];
  const owners = assignedNames('owners', 'owner');
  const owner = owners[0] || '';
  const dailyMonitor =
    shift !== 'all' && context.dailyRecords
      ? buildLineMonitor(
          config,
          context.dailyRecords,
          date,
          'all',
          context.activity,
          context.now,
        ).find((item) => (item.key || item.line) === line)
      : monitor;
  const trend = trendSvg(series, {
    ...context,
    trendSize: { width: 1040, height: 320 },
  });

  dialog.querySelector('#line-detail-content').innerHTML = `
    <header class="line-modal-header" data-detail-line="${esc(monitor.key || monitor.line)}">
      <div class="line-modal-identity">
        <span class="section-eyebrow">${esc(date)} · ${esc(t(shift === 'all' ? 'overviewAll' : shift))} · ${esc(t('details'))}</span>
        <h2 id="line-modal-title">${productionIdentityMarkup(monitor, esc, { singleLine: true })}</h2>
        <div class="line-modal-owner"><span>${esc(t('owner'))}</span><strong title="${esc(owners.join('\n'))}">${esc(owner || t('none'))}</strong>${owners.length > 1 ? `<small>+${owners.length - 1}</small>` : ''}</div>
      </div>
      <div class="line-modal-totals">${overviewMetricsMarkup({ ...monitor, dailyTarget: dailyMonitor?.target ?? null }, context)}</div>
      <button class="icon-button" data-close-line-dialog aria-label="${esc(t('close'))}">${icon('close')}</button>
    </header>
    <div class="line-modal-body">
      <section class="line-modal-trend"><h3>${esc(t('hourlyTrend'))}</h3>${trend}</section>
      <div class="line-modal-table-wrap"><table class="line-modal-table"><thead><tr><th>${esc(t('timeSlot'))}</th><th>${esc(t('target'))}</th><th>${esc(t('actual'))}</th><th>${esc(t('gap'))}</th></tr></thead><tbody>${series.map((value) => `<tr><td>${esc(value.slot.start)}–${esc(value.slot.end)}</td><td>${number(value.target)}</td><td>${number(value.actual)}</td><td>${number(value.target != null && value.actual != null ? value.actual - value.target : null)}</td></tr>`).join('')}</tbody></table></div>
      <div class="line-modal-stations">${rows
        .map((row) => {
          const record = stationRecord(row);
          const peopleByShift = (shift === 'all' ? ['day', 'night'] : [shift]).map(
            (workShift) => ({
              shift: workShift,
              names: personnelNames(
                record,
                workShift,
                record?.[workShift === 'day' ? 'dayTeam' : 'nightTeam'],
              ),
            }),
          );
          return `<section><div class="line-modal-station-heading"><h3>${esc(row.station || t('noStation'))}<small>${esc(row.job || t('noJob'))}</small></h3><div class="line-modal-station-people"><b>${esc(t('assignedStaff'))}</b><div>${peopleByShift.map(({ shift: workShift, names }) => `<span class="line-modal-shift-people"><small>${esc(t(workShift))}</small><span>${names.length ? names.map((name) => `<span class="person-name">${esc(name)}</span>`).join('') : esc(t('none'))}</span></span>`).join('')}</div></div></div>
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
