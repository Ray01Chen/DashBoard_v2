/** Pure alert evaluation. Missing values remain unknown; forecast time starts
 * at the last contiguous confirmed interval, not at the wall clock. This avoids
 * pretending that production awaiting a report was zero. */
// New policies are opt-in so an upgrade preserves existing alert choices.
// Historical payloads omitted this field expecting a 30-minute EXTRA delay.
const legacyReportingExtraMinutes = 30;
export const alertDefaults = {
  performance: { enabled: false, green: 95, red: 85 },
  completion: { enabled: false, green: 100, red: 110 },
  reporting: { enabled: false, graceMinutes: 10, redAfterMinutes: 40 },
};
export function alertConfig(monitoring = {}) {
  return Object.fromEntries(
    Object.entries(alertDefaults).map(([key, value]) => {
      const saved = monitoring.unified?.[key] || {};
      const rule = { ...value, ...saved };
      if (key === 'reporting') {
        // Legacy redMinutes was ADDITIONAL time after grace. Convert once to
        // an explicit end-of-slot threshold; never add grace to the new field.
        if (!Object.hasOwn(saved, 'redAfterMinutes'))
          rule.redAfterMinutes =
            rule.graceMinutes + (saved.redMinutes ?? legacyReportingExtraMinutes);
        delete rule.redMinutes;
      }
      return [key, rule];
    }),
  );
}
/** One validation contract for settings UI and the API. */
export function validAlertConfig(monitoring) {
  return Object.entries(alertConfig(monitoring)).every(([type, rule]) => {
    const fields =
      type === 'reporting' ? ['graceMinutes', 'redAfterMinutes'] : ['green', 'red'];
    return (
      typeof rule.enabled === 'boolean' &&
      fields.every(
        (field) =>
          Number.isFinite(rule[field]) &&
          rule[field] >= 0 &&
          rule[field] <= (field === 'redAfterMinutes' ? 199998 : 99999),
      ) &&
      (type !== 'performance' || (rule.green > rule.red && rule.green <= 100)) &&
      (type !== 'completion' || rule.red >= rule.green) &&
      (type !== 'reporting' || rule.redAfterMinutes >= rule.graceMinutes)
    );
  });
}
const sum = (slots, field) => slots.reduce((value, slot) => value + slot[field], 0);
export function evaluateAlerts({
  series,
  windows,
  now,
  legacy = [],
  legacyEnabled = false,
  legacyNeedsTarget = false,
  settings,
  plannedUPH,
  deadline,
  available = true,
}) {
  const results = [];
  const add = (id, severity, key, params = {}) => results.push({ id, severity, key, params });
  const ended = series
    .filter((slot) => slot.endAt <= now)
    .sort((a, b) => a.startAt - b.startAt);
  const configured = new Set(windows.map((slot) => slot.id));
  const completed = ended
    .filter((slot) => configured.has(slot.id))
    .map((slot) =>
      slot.reported === false || !Number.isFinite(slot.actual)
        ? { ...slot, actual: null }
        : slot,
    );
  const reporting = alertConfig({ unified: { reporting: settings.reporting } }).reporting;
  const missing = completed.filter((slot) => slot.actual == null);
  const overdue = missing.filter((slot) => now > slot.endAt + reporting.graceMinutes * 60000);
  if (settings.performance.enabled) {
    const reported = completed.filter((slot) => slot.actual != null);
    const target = reported.every(
      (slot) => slot.target != null && slot.targetComplete !== false,
    )
      ? sum(reported, 'target')
      : null;
    if (!available || !reported.length || !(target > 0))
      add('performance', 'noData', 'alertNoData', {
        name: 'performance',
        detail: !available
          ? 'alertMissingSource'
          : !reported.length
            ? 'alertMissingPrefix'
            : 'alertMissingTarget',
      });
    else {
      // Round only floating-point noise at threshold boundaries (e.g. 110%).
      const actual = sum(reported, 'actual'),
        rate = Number(((actual / target) * 100).toFixed(9));
      add(
        'performance',
        rate >= settings.performance.green
          ? 'green'
          : rate >= settings.performance.red
            ? 'yellow'
            : 'red',
        'alertPerformanceReason',
        {
          actual,
          target,
          rate: String(rate),
          green: settings.performance.green,
          red: settings.performance.red,
        },
      );
    }
  }
  if (reporting.enabled) {
    if (!available || !windows.length)
      add('reporting', 'noData', 'alertNoData', {
        name: 'reporting',
        detail: !available ? 'alertMissingSource' : 'alertMissingSchedule',
      });
    else if (overdue.length) {
      const first = overdue[0],
        minutes = Math.floor((now - first.endAt) / 60000);
      add(
        'reporting',
        now > first.endAt + reporting.redAfterMinutes * 60000 ? 'red' : 'yellow',
        'alertReportingReason',
        {
          start: first.start,
          end: first.end,
          minutes,
          grace: reporting.graceMinutes,
          red: reporting.redAfterMinutes,
          count: overdue.length,
        },
      );
    } else add('reporting', 'green', 'alertReportingOK', { grace: reporting.graceMinutes });
  }
  if (settings.completion.enabled) {
    const prefix = [];
    for (const slot of completed) {
      if (slot.actual == null) break;
      prefix.push(slot);
    }
    const cutoff = prefix.at(-1)?.endAt;
    const targetKnown =
      series.length &&
      series.every((slot) => slot.target != null && slot.targetComplete !== false);
    if (
      !available ||
      !cutoff ||
      !targetKnown ||
      !(plannedUPH > 0) ||
      !Number.isFinite(deadline)
    )
      add('completion', 'noData', 'alertNoData', {
        name: 'completion',
        stale: overdue.length > 0,
        detail: !available
          ? 'alertMissingSource'
          : !(plannedUPH > 0)
            ? 'alertMissingPlan'
            : !cutoff
              ? 'alertMissingPrefix'
              : !targetKnown
                ? 'alertMissingTarget'
                : 'alertMissingDeadline',
      });
    else {
      const actual = sum(prefix, 'actual'),
        remaining = Math.max(0, sum(series, 'target') - actual);
      const hours =
        windows.reduce(
          (hours, slot) =>
            hours +
            Math.max(0, Math.min(slot.endAt, deadline) - Math.max(slot.startAt, cutoff)),
          0,
        ) / 3600000;
      const required = remaining === 0 ? 0 : hours > 0 ? remaining / hours : Infinity;
      const rate = Number(((required / plannedUPH) * 100).toFixed(9));
      const severity =
        rate <= settings.completion.green
          ? 'green'
          : rate <= settings.completion.red
            ? 'yellow'
            : 'red';
      add('completion', severity, 'alertCompletionReason', {
        actual,
        remaining,
        hours: hours.toFixed(2),
        planned: plannedUPH,
        required: Number.isFinite(required) ? String(Number(required.toFixed(9))) : '∞',
        rate: Number.isFinite(rate) ? String(rate) : '∞',
        cutoff,
        deadline,
        stale: overdue.length > 0,
        green: settings.completion.green,
        red: settings.completion.red,
      });
      // Unknown overdue production can make an apparently feasible forecast
      // unreliable. Keep a gray data state unless a concrete warning dominates.
      if (overdue.length && severity === 'green') results.at(-1).severity = 'noData';
    }
  }
  // Different thresholds for the same legacy condition are one alert; show
  // the most severe matching rule rather than repeating the same shortfall.
  const distinct = new Map();
  for (const rule of [...legacy].sort(
    (a, b) =>
      Number(b.color === 'red') - Number(a.color === 'red') || b.threshold - a.threshold,
  ))
    if (!distinct.has(rule.type)) distinct.set(rule.type, rule);
  for (const rule of distinct.values())
    add(
      'legacy-' + rule.id,
      rule.color === 'red' ? 'red' : 'yellow',
      rule.type === 'gap' ? 'alertGapReason' : 'alertIdleReason',
      { value: rule.value, threshold: rule.threshold, comparison: rule.comparison },
    );
  const enabled = Object.values(settings).some((rule) => rule.enabled) || legacyEnabled;
  if (legacyEnabled && !legacy.length) {
    const known =
      available &&
      completed.some(
        (slot) =>
          slot.actual != null &&
          (!legacyNeedsTarget || (slot.target != null && slot.targetComplete !== false)),
      );
    add('legacy-normal', known ? 'green' : 'noData', known ? 'alertLegacyOK' : 'alertNoData', {
      name: 'legacy',
      detail: !available ? 'alertMissingSource' : 'alertMissingPrefix',
    });
  }
  const priority = { red: 4, yellow: 3, noData: 2, green: 1 };
  results.sort((a, b) => priority[b.severity] - priority[a.severity]);
  const severity = !enabled ? 'disabled' : results[0]?.severity || 'noData';
  const warnings = results.filter((result) => result.severity !== 'green');
  return {
    severity,
    results,
    reasons: warnings.length ? warnings : results,
    stale: results.some((result) => result.params.stale),
  };
}
