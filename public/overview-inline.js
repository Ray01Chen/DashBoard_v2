import { scheduleFor } from './production-schedules.js';
import { issuePresets, issueLabel } from './issue-presets.js';
import { sameProduction, stationHasOutput } from './production-models.js';
import { slotPresentation } from './monitor-ui.js';
import { cancelMonitorPageMotion } from './monitor-carousel.js';

/** One captured station/report revision owns a draft. Polling and fullscreen
 * changes may redraw cards, but never replace the draft's values or version. */
export function createOverviewInline({
  api,
  getContext,
  canEdit,
  refresh,
  redraw,
  toast,
  confirm,
}) {
  const root = document.querySelector('#line-cards');
  let draft = null,
    serial = 0;
  const context = () => getContext();
  const dirty = () =>
    draft?.loaded &&
    (draft.actual !== draft.originalActual || draft.issue !== draft.originalIssue);
  const rows = () =>
    context().config.rows.filter(
      (row) =>
        row.active &&
        !row.deleted &&
        stationHasOutput(row) &&
        sameProduction(row, draft.line) &&
        draft.line.sourceRows.includes(row.id),
    );
  function options() {
    if (!draft?.loaded) return [];
    const record = draft.report.records.find((item) => item.rowId === draft.rowId);
    const defaults = draft.report.defaults[draft.rowId];
    // Saved records own their historical slot IDs and boundaries. Never map a
    // retired interval onto a different current interval with the same ID.
    return (record?.slots || defaults?.slots || []).filter((slot) => slot.kind !== 'break');
  }
  function selectSlot(id) {
    const slot = options().find((item) => item.id === id) || options()[0];
    draft.slotId = slot?.id || '';
    draft.actual = draft.originalActual = slot?.actual == null ? '' : String(slot.actual);
    draft.issue = draft.originalIssue = slot?.issue || '';
  }
  async function load(preferred) {
    const current = draft,
      sequence = ++serial;
    current.loading = true;
    current.error = '';
    current.loaded = false;
    sync();
    try {
      const report = await api(
        `/api/records?${new URLSearchParams({ date: current.date, shift: current.shift })}`,
      );
      if (draft !== current || sequence !== serial) return;
      if (report.configVersion !== context().config.version)
        throw new Error(context().t('configChanged'));
      current.report = report;
      current.loaded = true;
      const match = options().find(
        (item) => preferred && item.start === preferred.start && item.end === preferred.end,
      );
      selectSlot(match?.id);
    } catch (error) {
      if (draft === current) current.error = error.message;
    } finally {
      if (draft === current && sequence === serial) {
        current.loading = false;
        sync();
      }
    }
  }
  async function open(line) {
    const ctx = context();
    if (!canEdit()) return;
    if (draft) {
      toast(ctx.t('inlineBusy'));
      return;
    }
    cancelMonitorPageMotion(root);
    const period = slotPresentation(line, ctx).slot;
    const preferredShift = ['day', 'night'].find((shift) =>
      scheduleFor(ctx.config, line.line, shift).some(
        (slot) => slot.start === period?.start && slot.end === period?.end,
      ),
    );
    draft = {
      key: line.key || line.line,
      line,
      date: ctx.date,
      shift: preferredShift || (ctx.shift === 'night' ? 'night' : 'day'),
      rowId: line.sourceRows[0],
      loading: true,
    };
    if (!rows().length) {
      draft = null;
      toast(ctx.t('inlineUnavailable'));
      return;
    }
    draft.rowId = rows()[0].id;
    redraw();
    await load(period);
    root.querySelector('[data-inline-actual]')?.focus({ preventScroll: true });
  }
  function clear() {
    serial++;
    draft = null;
    for (const card of root.children) restore(card);
    redraw();
  }
  function restore(card) {
    card.removeAttribute('data-inline-editing');
    card.querySelectorAll('[data-inline-control]').forEach((node) => node.remove());
    card.querySelectorAll('[data-inline-hidden]').forEach((node) => {
      node.hidden = false;
      node.removeAttribute('data-inline-hidden');
    });
    card.querySelector('.line-edit-rail')?.remove();
    card.removeAttribute('data-inline-view');
  }
  function hide(node) {
    if (node) {
      node.dataset.inlineHidden = '';
      node.hidden = true;
    }
  }
  function sync() {
    const { t, esc, icon } = context();
    root.dataset.inlineActive = String(!!draft);
    root.dataset.inlineAvailable = String(canEdit());
    for (const card of root.querySelectorAll('.line-card')) {
      const active = draft?.key === card.dataset.monitorLine;
      if (!canEdit() && !active) {
        restore(card);
        continue;
      }
      let rail = card.querySelector('.line-edit-rail');
      if (!rail) {
        rail = document.createElement('div');
        rail.className = 'line-edit-rail';
        card.append(rail);
      }
      const state = active
        ? `${draft.loading}|${draft.saving}|${draft.loaded}|${draft.slotId}`
        : 'closed';
      if (rail.dataset.state !== state || rail.dataset.language !== context().language) {
        rail.dataset.state = state;
        rail.dataset.language = context().language;
        rail.innerHTML = active
          ? `<button type="button" data-inline-save title="${esc(t('inlineSave'))}" ${draft.loading || draft.saving || !draft.loaded || !draft.slotId ? 'disabled' : ''}>${icon('check')}<small>${esc(t('inlineSave'))}</small></button><button type="button" data-inline-cancel title="${esc(t('inlineCancel'))}" ${draft.saving ? 'disabled' : ''}>${icon('close')}<small>${esc(t('inlineCancel'))}</small></button>`
          : `<button type="button" data-inline-open title="${esc(t('inlineEdit'))}">${icon('edit')}<small>${esc(t('inlineEdit'))}</small></button>`;
      }
      if (!active) continue;
      card.dataset.inlineEditing = '';
      const view = JSON.stringify([
        draft.date,
        draft.shift,
        draft.rowId,
        draft.slotId,
        draft.loading,
        draft.saving,
        draft.error,
        context().language,
        context().metricScope,
      ]);
      if (card.dataset.inlineView === view) continue;
      card.dataset.inlineView = view;
      card.querySelectorAll('[data-inline-control]').forEach((node) => node.remove());
      for (const node of card.querySelectorAll('[data-inline-hidden]')) {
        node.hidden = false;
        node.removeAttribute('data-inline-hidden');
      }
      const metric = card.querySelector(
        '[data-metric="currentActual"], [data-metric="dailyActual"]',
      );
      hide(metric?.querySelector('b'));
      if (metric)
        metric.insertAdjacentHTML(
          'beforeend',
          `<input data-inline-control data-inline-actual type="number" inputmode="numeric" min="0" max="99999999" step="1" aria-label="${esc(t('inlineActual'))}" value="${esc(draft.actual || '')}" ${draft.loading || draft.saving ? 'disabled' : ''}>`,
        );
      const area = card.querySelector('.line-slot');
      [...area.children].forEach(hide);
      area.insertAdjacentHTML(
        'beforeend',
        `<div data-inline-control class="inline-selectors"><label>${esc(t('inlineDate'))}<input type="date" data-inline-field="date" value="${esc(draft.date)}"></label><label>${esc(t('inlineShift'))}<select data-inline-field="shift">${['day', 'night'].map((shift) => `<option value="${shift}" ${shift === draft.shift ? 'selected' : ''}>${esc(t(shift))}</option>`).join('')}</select></label><label>${esc(t('inlineStation'))}<select data-inline-field="rowId">${rows()
          .map(
            (row) =>
              `<option value="${row.id}" ${row.id === draft.rowId ? 'selected' : ''}>${esc([row.job, row.station].filter(Boolean).join(' / '))}</option>`,
          )
          .join(
            '',
          )}</select></label><label>${esc(t('inlineSlot'))}<select data-inline-field="slotId">${options()
          .map(
            (slot) =>
              `<option value="${esc(slot.id)}" ${slot.id === draft.slotId ? 'selected' : ''}>${esc(slot.start + '–' + slot.end)}</option>`,
          )
          .join('')}</select></label></div>`,
      );
      const status = card.querySelector('.line-card-status');
      status.insertAdjacentHTML(
        'beforeend',
        `<div data-inline-control class="inline-issue"><label>${esc(t('inlineIssue'))}<select data-inline-preset aria-label="${esc(t('inlineQuickIssue'))}"><option value="">${esc(t('inlineQuickIssue'))}</option>${issuePresets(
          context().config,
        )
          .filter((item) => item.active)
          .map((item) => `<option value="${esc(item.id)}">${esc(issueLabel(item))}</option>`)
          .join(
            '',
          )}</select><textarea data-inline-issue rows="2" maxlength="2000">${esc(draft.issue || '')}</textarea></label><small role="status" class="inline-feedback">${esc(draft.error || t(draft.loading ? 'inlineLoading' : !draft.slotId ? 'inlineNoSlot' : 'inlineScope'))}</small></div>`,
      );
      card
        .querySelectorAll('[data-inline-field], [data-inline-preset], [data-inline-issue]')
        .forEach((node) => {
          node.disabled = !!(draft.loading || draft.saving);
        });
    }
  }
  async function save() {
    if (!draft || draft.saving || draft.loading || !draft.loaded || !draft.slotId || !canEdit())
      return;
    const current = draft,
      { t } = context();
    const inputInvalid = root.querySelector('[data-inline-actual]')?.validity.badInput;
    const actual = current.actual === '' ? null : Number(current.actual);
    if (
      inputInvalid ||
      (actual !== null && (!Number.isSafeInteger(actual) || actual < 0 || actual > 99999999)) ||
      current.issue.length > 2000
    ) {
      current.error = t('inlineInvalid');
      sync();
      return;
    }
    const record = current.report.records.find((item) => item.rowId === current.rowId);
    current.saving = true;
    current.error = '';
    sync();
    try {
      await api('/api/entry/records/' + current.rowId, {
        method: 'PUT',
        body: JSON.stringify({
          date: current.date,
          shift: current.shift,
          configVersion: current.report.configVersion,
          version: record?.version ?? current.report.rowVersions[current.rowId] ?? 0,
          stationEntry: true,
          slots: [{ id: current.slotId, actual, issue: current.issue }],
        }),
      });
      clear();
      toast(t('inlineSaved'));
      await refresh();
    } catch (error) {
      if (draft === current) {
        current.error = error.message;
        current.saving = false;
        sync();
      }
    }
  }
  root.addEventListener('input', (event) => {
    if (!draft) return;
    if (event.target.matches('[data-inline-actual]')) draft.actual = event.target.value;
    if (event.target.matches('[data-inline-issue]')) draft.issue = event.target.value;
  });
  root.addEventListener('change', async (event) => {
    if (!draft) return;
    if (event.target.matches('[data-inline-preset]')) {
      const preset = issuePresets(context().config).find(
        (item) => item.id === event.target.value,
      );
      if (preset) {
        draft.issue = [draft.issue, issueLabel(preset)]
          .filter(Boolean)
          .join('\n')
          .slice(0, 2000);
        root.querySelector('[data-inline-issue]').value = draft.issue;
      }
      event.target.value = '';
      return;
    }
    const key = event.target.dataset.inlineField;
    if (!key || draft.loading || draft.saving) return;
    if (dirty() && !(await confirm(context().t('inlineLeave')))) {
      delete root.querySelector('[data-inline-editing]')?.dataset.inlineView;
      sync();
      return;
    }
    draft[key] = key === 'rowId' ? Number(event.target.value) : event.target.value;
    if (key === 'slotId') {
      selectSlot(draft.slotId);
      sync();
    } else await load();
  });
  return {
    sync,
    get active() {
      return !!draft;
    },
    get key() {
      return draft?.key;
    },
    async guard() {
      if (!draft) return true;
      if (draft.saving || draft.loading) return false;
      if (dirty() && !(await confirm(context().t('inlineLeave')))) return false;
      clear();
      return true;
    },
    handle(event, lines) {
      if (!event.target.closest('.line-edit-rail, [data-inline-control]')) return false;
      event.stopPropagation();
      if (event.target.closest('[data-inline-open]')) {
        const key = event.target.closest('.line-card').dataset.monitorLine;
        const line = lines.find((item) => (item.key || item.line) === key);
        if (line) void open(line);
      }
      if (event.target.closest('[data-inline-cancel]') && !draft?.saving) clear();
      if (event.target.closest('[data-inline-save]')) void save();
      return true;
    },
  };
}
