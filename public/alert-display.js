/** Presentation, translation and carousel state stay separate from evaluation. */
// A stable identity resets the carousel when an alert is added/cleared, not
// when its live numeric parameters change. Severity remains independent.
const rotations = new Map();
export function rotatedReason(alert, now, identity = 'default', date = '') {
  const signature =
    date + '|' + alert.reasons.map((reason) => reason.id + ':' + reason.severity).join('|');
  let rotation = rotations.get(identity);
  if (!rotation || rotation.signature !== signature || now < rotation.start) {
    rotation = { signature, start: now };
    rotations.set(identity, rotation);
  }
  return alert.reasons.length
    ? alert.reasons[Math.floor((now - rotation.start) / 5000) % alert.reasons.length]
    : null;
}
export function productionStatusText(line, t) {
  const status = {
    activeMonitoring: 'producing',
    breakMonitoring: 'onBreak',
    futureShift: 'upcoming',
    historicalShift: 'completed',
    outsideShift: 'outsideShift',
  };
  const label = t(status[line.periodState] || 'outsideShift');
  return line.currentSlot?.kind === 'break'
    ? label + ' · ' + line.currentSlot.start + '–' + line.currentSlot.end
    : label;
}
export function updateAlertDisplay(element, line, t, now) {
  if (!element) return;
  element.dataset.severity = line.unified.severity;
  element.textContent =
    t('alertOverall', { state: t('alertState_' + line.unified.severity) }) +
    ' · ' +
    alertReasonText(rotatedReason(line.unified, now, line.key, line.date), t);
  element.title = line.unified.results.map((reason) => alertReasonText(reason, t)).join('\n');
}
export function alertReasonText(reason, t) {
  if (!reason) return t('alertDisabled');
  const params = { ...reason.params };
  if (params.comparison)
    params.comparison = t(params.comparison === 'gt' ? 'above' : 'atLeast');
  if (params.detail) params.detail = t(params.detail);
  if (params.name) params.name = t('alertName_' + params.name);
  const time = (value) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value)) +
    ' ' +
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  if (params.cutoff) params.cutoff = time(params.cutoff);
  if (params.deadline) params.deadline = time(params.deadline);
  return (params.stale ? t('alertStale') + ' · ' : '') + t(reason.key, params);
}

export function updateAlertList(element, alert, t) {
  if (!element) return;
  const text = alert.results.map(
    (reason) => t('alertState_' + reason.severity) + ' · ' + alertReasonText(reason, t),
  );
  if (element.dataset.content === JSON.stringify(text)) return;
  element.dataset.content = JSON.stringify(text);
  element.replaceChildren(
    ...text.map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }),
  );
}
