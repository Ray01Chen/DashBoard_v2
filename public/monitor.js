import { plannedProduction, lineDailyTarget } from './production-targets.js';
import { alertConfig, evaluateAlerts } from './alerts.js';
import {
  scheduleFor,
  schedulesForLine,
  reportSchedule,
  isArchivedProductionDate,
} from './production-schedules.js';
import {
  modelOf,
  productionKey,
  productionLabel,
  productionUnits,
  sameProduction,
  outputSourceFor,
  unitFor,
  stationHasOutput,
} from './production-models.js';
export const defaultPageRotateSeconds = 12;
export const lampColors = ['yellow', 'red', 'blue', 'purple'];
export function linesForGroup(config, groupId, extra = []) {
  const group = config.monitoring.groups.find((g) => g.id === groupId);
  return [...new Set([...config.lines, ...extra])].filter(
    (line) => !group || group.lines.includes(line),
  );
}
export function currentScheduleInterval(config, date, shift, now = Date.now()) {
  const slots = scheduleFor(config, null, shift),
    anchor = scheduleFor(config, null, 'all')[0]?.start || '00:00',
    base = Date.parse(date + 'T00:00:00+07:00');
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (
    slots.find((s) => {
      const start = base + (s.start < anchor ? 86400000 : 0) + minutes(s.start) * 60000,
        end = start + ((minutes(s.end) - minutes(s.start) + 1440) % 1440) * 60000;
      return now >= start && now < end;
    }) || null
  );
}
export function monitoringPeriodState(config, date, shift, now = Date.now()) {
  const slot = currentScheduleInterval(config, date, shift, now);
  if (slot) return slot.kind === 'break' ? 'breakMonitoring' : 'activeMonitoring';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
  const windows = productionWindows(config, date, shift);
  if (windows.length && now < Math.min(...windows.map((slot) => slot.startAt)))
    return 'futureShift';
  if (windows.length && now >= Math.max(...windows.map((slot) => slot.endAt)))
    return 'historicalShift';
  return date < today ? 'historicalShift' : date > today ? 'futureShift' : 'outsideShift';
}
export function boardPage(lines, page = 0, size = 7) {
  size = Math.max(1, Math.min(7, size));
  const pages = Math.max(1, Math.ceil(lines.length / size)),
    index = Math.max(0, Math.min(pages - 1, page));
  return {
    lines: lines.slice(index * size, index * size + size),
    page: index,
    pages,
    total: lines.length,
  };
}
export function defaultMonitoring(config) {
  const lines = config.lines || [...new Set(config.rows.map((r) => r.line))];
  const groups = [
    { id: 'cd', name: 'CD Production', lines: lines.filter((l) => /^CD\d/.test(l)) },
    { id: 'cds', name: 'CDS Production', lines: lines.filter((l) => /^CDS\d/.test(l)) },
  ].filter((g) => g.lines.length);
  const outputSources = Object.fromEntries(
    lines.map((line) => {
      const rows = config.rows.filter(
        (r) => r.line === line && r.active !== false && stationHasOutput(r),
      );
      return [
        line,
        (
          rows.find((r) => r.station === 'Pack') ||
          rows.filter((r) => r.station).at(-1) ||
          rows[0]
        )?.id ?? null,
      ];
    }),
  );
  return {
    groups,
    outputSources,
    uiVersion: 2,
    ruleControlsVersion: 1,
    refreshSeconds: 10,
    pageRotateSeconds: defaultPageRotateSeconds,
    alertMode: 'all',
    rules: [
      {
        id: 'gap-yellow',
        type: 'gap',
        threshold: 5,
        comparison: 'gt',
        color: 'yellow',
        blink: true,
        enabled: true,
      },
      {
        id: 'gap-red',
        type: 'gap',
        threshold: 10,
        comparison: 'gte',
        color: 'red',
        blink: true,
        enabled: true,
      },
      {
        id: 'idle-yellow',
        type: 'idle',
        threshold: 300,
        comparison: 'gte',
        color: 'yellow',
        blink: true,
        enabled: true,
      },
      {
        id: 'idle-red',
        type: 'idle',
        threshold: 600,
        comparison: 'gte',
        color: 'red',
        blink: true,
        enabled: true,
      },
    ],
  };
}
function intervalWindow(slot, date, anchor) {
  const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const base = Date.parse(date + 'T00:00:00+07:00');
  const startAt = base + (slot.start < anchor ? 86400000 : 0) + toMinutes(slot.start) * 60000;
  return {
    ...slot,
    startAt,
    endAt: startAt + ((toMinutes(slot.end) - toMinutes(slot.start) + 1440) % 1440) * 60000,
  };
}

export function productionWindows(config, date, shift) {
  const slots = scheduleFor(config, null, shift);
  const anchor = scheduleFor(config, null, 'all')[0]?.start || '00:00';
  return slots
    .filter((slot) => slot.kind === 'production')
    .map((slot) => intervalWindow(slot, date, anchor));
}

export function productiveSeconds(windows, since, now) {
  return Math.max(
    0,
    Math.floor(
      windows.reduce(
        (sum, w) => sum + Math.max(0, Math.min(now, w.endAt) - Math.max(since, w.startAt)),
        0,
      ) / 1000,
    ),
  );
}
const total = (values) => {
  const items = values.filter((v) => v !== null && v !== undefined);
  return items.length ? items.reduce((a, b) => a + b, 0) : null;
};
/** As-of-now counts include the current interval's full target, never future
 * intervals. No reported actual remains unknown; an explicit zero is retained. */
export function overviewMetrics(series, now) {
  const active = series.filter((slot) => now >= slot.startAt && now < slot.endAt);
  // An edited schedule can overlap captured history. Prefer the interval that
  // actually owns report values over an empty current-configuration placeholder.
  const current =
    active.find((slot) => slot.target != null || slot.actual != null) || active[0];
  const elapsed = series.filter((slot) => slot.startAt <= now);
  const cumulativeTarget = total(elapsed.map((slot) => slot.target));
  const cumulativeActual = total(elapsed.map((slot) => slot.actual));
  return {
    currentTarget: current?.target ?? null,
    currentActual: current?.actual ?? null,
    currentGap:
      current?.target == null || current?.actual == null
        ? null
        : current.actual - current.target,
    cumulativeTarget,
    cumulativeActual,
    cumulativeGap:
      cumulativeTarget == null || cumulativeActual == null
        ? null
        : cumulativeActual - cumulativeTarget,
  };
}

export function buildLineMonitor(
  config,
  records,
  date,
  shift,
  activity = {},
  now = Date.now(),
  dailyRecords = null,
) {
  // UI defaults have no saved revision or mapping snapshot. They may supply
  // current targets, but must never invent historical intervals or replace saves.
  const isDefault = (record) =>
    record.configVersion != null && !record.version && !record.updatedAt && !record.rowSnapshot;
  const map = new Map();
  for (const record of records)
    if (!map.has(record.rowId) || !isDefault(record)) map.set(record.rowId, record);
  const definitions = new Map(
    config.rows
      .filter((row) => row.active !== false || (map.has(row.id) && !isDefault(map.get(row.id))))
      .map((row) => [row.id, map.get(row.id)?.rowSnapshot || row]),
  );
  for (const record of map.values())
    if (!isDefault(record) && record.rowSnapshot)
      definitions.set(record.rowId, record.rowSnapshot);
  const monitoring = config.monitoring || defaultMonitoring(config),
    weights = { red: 4, yellow: 3, purple: 2, blue: 1 };
  const units = [
    ...new Map(
      [...productionUnits(config), ...definitions.values()].map((unit) => [
        productionKey(unit),
        unit,
      ]),
    ).values(),
  ];
  const daily =
    dailyRecords && shift !== 'all'
      ? new Map(
          buildLineMonitor(config, dailyRecords, date, 'all', activity, now).map((line) => [
            line.key,
            line,
          ]),
        )
      : null;
  return units.map((unit) => {
    const line = unit.line;
    const lineConfig = { ...config, schedules: schedulesForLine(config, line) };
    const windows = productionWindows(lineConfig, date, shift);
    const onBreak = currentScheduleInterval(lineConfig, date, shift, now)?.kind === 'break';
    const active = windows.some((window) => now >= window.startAt && now < window.endAt);
    const firstStart = Math.min(...windows.map((window) => window.startAt));
    const lineRows = [...definitions.values()].filter(
        (row) => sameProduction(row, unit) && stationHasOutput(row, config),
      ),
      history = lineRows
        .map((row) => map.get(row.id))
        .filter((record) => record && !isDefault(record)),
      captured = history.find((record) => record.defaultsSnapshot?.outputSource != null),
      configuredSource = outputSourceFor({ ...config, monitoring }, unit);
    const capturedSource = captured?.defaultsSnapshot.outputSource;
    const source =
      // An enabled unit follows its selected station immediately. A retired
      // line/model retains the captured source for historical drill-downs.
      (config.productionUnits &&
      unitFor(config, unit) &&
      lineRows.some((row) => row.id === configuredSource)
        ? configuredSource
        : null) ??
      (capturedSource === 'all' || lineRows.some((row) => row.id === capturedSource)
        ? capturedSource
        : null) ??
      (configuredSource === 'all' || lineRows.some((row) => row.id === configuredSource)
        ? configuredSource
        : defaultMonitoring({
            lines: [line],
            rows: lineRows.map((row) => ({ ...row, active: true })),
          }).outputSources[line]);
    // Replicated line actuals count once in the edited interval. Untouched
    // legacy intervals keep their original independent-station aggregation.
    const sharedOutput =
      source === 'all' &&
      lineRows.some((row) =>
        map.get(row.id)?.slots.some((slot) => slot.lineShared || slot.targetShared),
      );
    const sharedSource = sharedOutput
      ? defaultMonitoring({
          lines: [line],
          rows: lineRows.map((row) => ({ ...row, active: true })),
        }).outputSources[line]
      : null;
    const rows = lineRows.filter((row) => source === 'all' || row.id === source),
      saved = rows.map((row) => map.get(row.id)).filter(Boolean),
      slots = new Map(windows.map((slot) => [slot.id, slot]));
    const activeLine = config.rows.some(
      (row) => row.active !== false && !row.deleted && sameProduction(row, unit),
    );
    const visibleIds = new Set(
      reportSchedule(
        config,
        line,
        shift,
        date,
        saved.filter((record) => !isDefault(record)).flatMap((record) => record.slots),
        now,
      ).map((slot) => slot.id),
    );
    for (const record of saved.filter((record) => !isDefault(record))) {
      // Captured shifts may start earlier than today's edited schedule. Their
      // original first interval anchors midnight, preserving historical dates.
      const anchor =
        record.defaultsSnapshot?.productionDay?.day?.slots.find((slot) => slot.start)?.start ||
        record.slots.find((slot) => slot.start)?.start ||
        scheduleFor(config, line, shift)[0]?.start ||
        '00:00';
      for (const slot of record.slots)
        if (slot.kind !== 'break' && (!activeLine || visibleIds.has(slot.id))) {
          const current = slots.get(slot.id);
          const captured = { ...current, ...slot };
          // An after-midnight night shift still belongs to the production day
          // anchored by Day. Selecting Night must not move it back 24 hours.
          slots.set(
            slot.id,
            current && current.start === captured.start && current.end === captured.end
              ? { ...captured, startAt: current.startAt, endAt: current.endAt }
              : intervalWindow(captured, date, anchor),
          );
        }
    }
    const series = [...slots.values()].map((slot) => {
      let values = saved
        .map((record) => {
          if (isDefault(record) && !windows.some((window) => window.id === slot.id))
            return null;
          const value = record.slots.find((savedSlot) => savedSlot.id === slot.id);
          return value ? { ...value, rowId: record.rowId } : null;
        })
        .filter(Boolean);
      const sharedValues = values.filter((value) => value.rowId === sharedSource);
      const targets =
        sharedOutput && values.some((value) => value.targetShared) ? sharedValues : values;
      const actuals =
        sharedOutput && values.some((value) => value.lineShared) ? sharedValues : values;
      return {
        id: slot.id,
        start: slot.start,
        end: slot.end,
        startAt: slot.startAt,
        endAt: slot.endAt,
        target: total(targets.map((s) => s.target)),
        targetComplete:
          targets.length ===
            (sharedOutput && values.some((value) => value.targetShared) ? 1 : rows.length) &&
          targets.length > 0 &&
          targets.every((value) => value.target != null),
        actual: total(actuals.map((s) => s.actual)),
        // Aggregate output is confirmed only when every contributing station
        // reported. Display totals can still show a useful partial value.
        reported:
          actuals.length ===
            (sharedOutput && values.some((value) => value.lineShared) ? 1 : rows.length) &&
          actuals.length > 0 &&
          actuals.every((value) => value.actual != null),
      };
    });
    const metrics = overviewMetrics(series, now);
    const timestamps = rows
        .map((r) => activity[r.id]?.lastIncreaseAt)
        .filter(Boolean)
        .map((v) => Date.parse(v)),
      lastIncreaseAt = timestamps.length ? Math.max(...timestamps) : null;
    const idleSeconds = rows.length
      ? productiveSeconds(windows, Math.max(firstStart, lastIncreaseAt || firstStart), now)
      : 0;
    // A missing report cannot contribute zero to a target comparison. Legacy
    // gap rules retain their quantity thresholds, using comparable values only.
    const comparable = series.filter(
      (slot) =>
        slot.startAt <= now &&
        slot.actual != null &&
        slot.target != null &&
        slot.reported !== false &&
        slot.targetComplete !== false,
    );
    const shortfall = comparable.length
      ? Math.max(
          0,
          comparable.reduce((gap, slot) => gap + slot.target - slot.actual, 0),
        )
      : null;
    const matches = monitoring.rules
      .filter((rule) => {
        if (!rule.enabled || !rows.length) return false;
        const value = rule.type === 'gap' ? shortfall : active || onBreak ? idleSeconds : null;
        return (
          value !== null &&
          (rule.comparison === 'gt' ? value > rule.threshold : value >= rule.threshold)
        );
      })
      .sort((a, b) => weights[b.color] - weights[a.color] || b.threshold - a.threshold);
    const rule = matches[0] || null;
    let alertSeries = daily?.get(config.models ? productionKey(unit) : line)?.series || series;
    let alertWindows = daily ? productionWindows(lineConfig, date, 'all') : windows;
    // A past report owns its captured intervals. Today's template must not
    // introduce phantom missing reports or change a historical forecast.
    if (!daily && isArchivedProductionDate(config, line, date, now)) {
      const capturedIds = new Set(
        saved
          .filter((record) => !isDefault(record))
          .flatMap((record) => record.slots.map((slot) => slot.id)),
      );
      if (capturedIds.size) {
        alertSeries = alertSeries.filter((slot) => capturedIds.has(slot.id));
        alertWindows = alertSeries;
      }
    }
    const plan =
      daily?.get(config.models ? productionKey(unit) : line)?.plan ||
      monitoringPlan(config, unit, saved, date, shift, now);
    const deadline = alertWindows.length
      ? Math.max(...alertWindows.map((slot) => slot.endAt))
      : null;
    const unified =
      daily?.get(config.models ? productionKey(unit) : line)?.unified ||
      evaluateAlerts({
        series: alertSeries,
        windows: alertWindows,
        now,
        legacy: matches.map((rule) => ({
          ...rule,
          value: rule.type === 'gap' ? shortfall : idleSeconds,
        })),
        legacyEnabled: monitoring.rules.some((rule) => rule.enabled),
        legacyNeedsTarget: monitoring.rules.some((rule) => rule.enabled && rule.type === 'gap'),
        settings: alertConfig(monitoring),
        plannedUPH: plan.uph,
        deadline,
        available: rows.length > 0,
      });

    return {
      line,
      date,
      unified,
      plan,
      currentSlot: currentScheduleInterval(lineConfig, date, shift, now),
      periodState: monitoringPeriodState(lineConfig, date, shift, now),
      model: modelOf(unit),
      key: config.models ? productionKey(unit) : line,
      label: config.models ? productionLabel(unit) : line,
      source,
      sharedOutput,
      sourceRows: rows.map((r) => r.id),
      sourceLabel: source === 'all' ? 'all' : rows[0]?.station || rows[0]?.job || null,
      series,
      ...metrics,
      target: total(series.map((s) => s.target)),
      actual: total(series.map((s) => s.actual)),
      shortfall,
      lastIncreaseAt,
      idleSeconds,
      active,
      rule,
      matches,
      status: ['red', 'yellow', 'green'].includes(unified.severity)
        ? unified.severity
        : 'neutral',
      blink: rule
        ? rule.blink &&
          config.rows.some((row) => row.active !== false && sameProduction(row, unit))
        : ['red', 'yellow'].includes(unified.severity),
    };
  });
}

export function migrateRuleControls(monitoring) {
  if (monitoring.ruleControlsVersion === 1) return false;
  for (const rule of monitoring.rules)
    if (
      monitoring.alertMode &&
      monitoring.alertMode !== 'all' &&
      monitoring.alertMode !== rule.type
    )
      rule.enabled = false;
  monitoring.alertMode = 'all';
  monitoring.ruleControlsVersion = 1;
  return true;
}

/** Archived plans must not borrow today's edited preset or timetable. Modern
 * snapshots contain both shifts, including productive intervals with no report. */
function monitoringPlan(config, unit, records, date, shift, now) {
  let basis = config;
  let target = lineDailyTarget(config, unit.line, modelOf(unit));
  if (isArchivedProductionDate(config, unit.line, date, now)) {
    const snapshot = records.find(
      (record) => record.defaultsSnapshot?.productionDay,
    )?.defaultsSnapshot;
    const day = snapshot?.productionDay;
    if (!Array.isArray(day?.day?.slots) || !Array.isArray(day?.night?.slots))
      return { target: null, hours: null, uph: null };
    basis = { schedules: { day: day?.day?.slots || [], night: day?.night?.slots || [] } };
    target =
      snapshot?.sourceDailyTarget ??
      day?.day?.sourceDailyTarget ??
      day?.night?.sourceDailyTarget ??
      null;
  }
  return plannedProduction(basis, target, unit.line, shift);
}
