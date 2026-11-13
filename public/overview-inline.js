import { createOverviewSwipe } from './overview-swipe.js';
import { parseBulkValue } from './entry.js';
import { reportSchedule } from './production-schedules.js';
import { sameProduction, stationHasOutput } from './production-models.js';
import { slotPresentation, closeMonitorAlerts } from './monitor-ui.js';

const fields = ['target', 'actual', 'issue'];
/** Update a whole-day projection without dropping the opposite shift. */
export function mergeOverviewReset(previous, saved, shift) {
  return {
    ...previous,
    ...saved,
    version: Math.max(previous?.version || 0, saved.version),
    slots: ['day', 'night'].flatMap((part) =>
      part === shift
        ? saved.slots.map((slot) => ({ ...slot, shift }))
        : (previous?.slots || []).filter((slot) => slot.shift === part),
    ),
  };
}
/** Compare normalized values, so unchanged blanks, zero and multiline notes
 * never become destructive patches. The existing batch API validates again. */
export function overviewChanges(rows) {
  let valid = true;
  const changes = rows.flatMap((item) => {
    const values = {};
    for (const field of fields) {
      const parsed = parseBulkValue(field, item.draft[field]);
      if (!parsed.valid) valid = false;
      else if (
        parsed.value !==
        (field === 'issue' ? item.slot?.issue || '' : (item.slot?.[field] ?? null))
      )
        values[field] = parsed.value;
    }
    return Object.keys(values).length ? [{ rowId: item.row.id, values }] : [];
  });
  return { valid, rows: changes };
}
export function overviewRows(config, report, unit, interval, date) {
  const saved = new Map(report.records.map((record) => [record.rowId, record]));
  return config.rows
    .filter(
      (row) =>
        row.active &&
        !row.deleted &&
        stationHasOutput(row) &&
        sameProduction(saved.get(row.id)?.rowSnapshot || row, unit) &&
        (!date ||
          reportSchedule(
            config,
            unit.line,
            interval.shift,
            date,
            saved.get(row.id)?.slots || report.defaults[row.id]?.slots || [],
          ).some((slot) => slot.start === interval.start && slot.end === interval.end)),
    )
    .map((row) => {
      const record = saved.get(row.id),
        defaults = report.defaults[row.id];
      const slot =
        record?.slots.find(
          (slot) => slot.start === interval.start && slot.end === interval.end,
        ) ||
        defaults?.slots.find(
          (slot) => slot.start === interval.start && slot.end === interval.end,
        );
      return {
        row: record?.rowSnapshot ? { ...record.rowSnapshot, id: row.id } : row,
        slot,
        version: record?.version ?? report.rowVersions?.[row.id] ?? 0,
        draft: {
          target: String(slot?.target ?? ''),
          actual: String(slot?.actual ?? ''),
          issue: slot?.issue || '',
        },
      };
    });
}

/** A single downward editor captures its unit/date/config and station revisions.
 * Quiet polling only updates the read-only card; drafts are never rebased or
 * copied to another interval without explicit confirmation. */
export function createOverviewEditor({
  api,
  getContext,
  canEdit,
  refresh,
  redraw,
  toast,
  confirm,
  confirmReset,
  onReset,
}) {
  const root = document.querySelector('#line-cards');
  const swipe = createOverviewSwipe(root);
  let draft = null,
    serial = 0,
    restoreKey = null;
  const dirty = () =>
    draft?.loaded &&
    (!overviewChanges(draft.rows).valid || overviewChanges(draft.rows).rows.length > 0);
  async function load() {
    const current = draft,
      generation = ++serial;
    current.loading = true;
    current.loaded = false;
    current.rows = [];
    current.error = '';
    sync();
    try {
      const reports = await Promise.all(
        current.shifts.map(async (shift) => [
          shift,
          await api(`/api/records?${new URLSearchParams({ date: current.date, shift })}`),
        ]),
      );
      if (draft !== current || generation !== serial) return;
      if (reports.some(([, report]) => report.configVersion !== current.config.version))
        throw new Error(getContext().t('configChanged'));
      current.choices = reports.flatMap(([shift, report]) => {
        const saved = new Map(report.records.map((record) => [record.rowId, record]));
        const slots = current.config.rows
          .filter(
            (row) =>
              row.active &&
              !row.deleted &&
              stationHasOutput(row) &&
              sameProduction(saved.get(row.id)?.rowSnapshot || row, current.unit),
          )
          .flatMap((row) =>
            reportSchedule(
              current.config,
              current.unit.line,
              shift,
              current.date,
              saved.get(row.id)?.slots || report.defaults[row.id]?.slots || [],
            ),
          );
        return [
          ...new Map(
            slots.map((slot) => [
              JSON.stringify([shift, slot.start, slot.end]),
              {
                ...slot,
                shift,
                key: JSON.stringify([shift, slot.start, slot.end]),
              },
            ]),
          ).values(),
        ];
      });
      const selected =
        current.choices.find((slot) => slot.key === current.selected) ||
        current.choices.find(
          (slot) => slot.start === current.period?.start && slot.end === current.period?.end,
        ) ||
        current.choices[0];
      if (!selected) throw new Error(getContext().t('inlineNoSlot'));
      current.selected = selected.key;
      current.rows = overviewRows(
        current.config,
        Object.fromEntries(reports)[selected.shift],
        current.unit,
        selected,
        current.date,
      );
      current.loaded = true;
    } catch (error) {
      if (draft === current) current.error = error.message;
    } finally {
      if (draft === current && generation === serial) {
        current.loading = false;
        sync();
      }
    }
  }
  async function open(line) {
    if (!canEdit()) return;
    if (draft) {
      toast(getContext().t('inlineBusy'));
      return;
    }
    const ctx = getContext();
    closeMonitorAlerts();
    const shifts = ctx.shift === 'all' ? ['day', 'night'] : [ctx.shift];
    const period = slotPresentation(line, ctx).slot;
    draft = {
      key: line.key || line.line,
      date: ctx.date,
      unit: { line: line.line, model: line.model },
      config: structuredClone(ctx.config),
      choices: [],
      shifts,
      period,
      selected: null,
      rows: [],
      loading: true,
    };
    redraw();
    await load();
    root.querySelector('[data-overview-panel] input')?.focus({ preventScroll: true });
  }
  async function clear() {
    if (!draft || draft.closing) return;
    draft.closing = true;
    const panel = root.querySelector('[data-overview-panel]');
    if (panel) panel.inert = true;
    if (panel && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      await panel
        .animate(
          [
            { height: panel.offsetHeight + 'px', opacity: 1 },
            { height: '0px', opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out' },
        )
        .finished.catch(() => {});
    restoreKey = draft?.key || null;
    serial++;
    draft = null;
    swipe.reset();
    root.querySelectorAll('[data-overview-panel]').forEach((node) => node.remove());
    root
      .querySelectorAll('[data-editor-open]')
      .forEach((card) => card.removeAttribute('data-editor-open'));
    redraw();
  }
  function sync() {
    const { t, esc, icon, language } = getContext();
    swipe.sync(canEdit());
    for (const card of root.querySelectorAll('.line-card')) {
      const active = draft?.key === card.dataset.monitorLine;
      let trigger = card.querySelector('[data-overview-edit]');
      if (canEdit() && !trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'overview-edit-button';
        trigger.dataset.overviewEdit = '';
        const rail = document.createElement('div');
        rail.className = 'line-edit-rail';
        rail.append(trigger);
        card.prepend(rail);
      }
      if (trigger) {
        trigger.hidden = !canEdit();
        trigger.innerHTML = `${icon('edit')}<span>${esc(t('inlineEdit'))}</span>`;
        trigger.setAttribute('aria-expanded', String(active));
      }
      card.toggleAttribute('data-editor-open', active);
      if (active) card.setAttribute('data-edit-revealed', '');
      if (!active) {
        card.querySelector('[data-overview-panel]')?.remove();
        continue;
      }
      let panel = card.querySelector('[data-overview-panel]');
      if (!panel) {
        panel = document.createElement('section');
        panel.dataset.overviewPanel = '';
        panel.className = 'overview-editor row-expansion';
        card.append(panel);
      }
      const view = JSON.stringify([
        draft.selected,
        draft.loading,
        draft.saving,
        draft.error,
        draft.resetting,
        language,
      ]);
      if (panel.dataset.view === view) continue;
      const focus = panel.contains(document.activeElement)
        ? {
            row: document.activeElement.dataset.editorRow,
            field: document.activeElement.dataset.editorField,
            start: document.activeElement.selectionStart,
          }
        : null;
      panel.dataset.view = view;
      panel.innerHTML = `<header class="overview-editor-heading"><label>${esc(t('inlineSlot'))}<select data-editor-slot aria-label="${esc(t('inlineSlot'))}" ${draft.loading || draft.saving || draft.resetting ? 'disabled' : ''}>${draft.choices.map((slot) => `<option value="${esc(slot.key)}" ${slot.key === draft.selected ? 'selected' : ''}>${esc(t(slot.shift) + ' · ' + slot.start + '–' + slot.end)}</option>`).join('')}</select></label></header>
        <div class="overview-editor-body"><table><thead><tr><th>${esc(t('job'))} / ${esc(t('station'))}</th>${fields.map((field) => `<th>${esc(t(field))}</th>`).join('')}</tr></thead><tbody>${draft.rows.map((item) => `<tr><th scope="row"><strong>${esc(item.row.station || '—')}</strong><span>${esc(item.row.job || '—')}</span></th>${fields.map((field) => `<td>${field === 'issue' ? `<textarea rows="1" maxlength="2000"` : '<input type="text" inputmode="numeric" maxlength="12"'} data-editor-row="${item.row.id}" data-editor-field="${field}" aria-label="${esc([item.row.job, item.row.station, t(field)].join(' · '))}" ${draft.loading || draft.saving || draft.resetting ? 'disabled' : ''}${field === 'issue' ? `>${esc(item.draft[field])}</textarea>` : ` value="${esc(item.draft[field])}">`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <footer class="overview-editor-footer"><button type="button" class="button overview-editor-restore" data-editor-restore ${draft.loading || draft.saving || draft.resetting || !draft.loaded || !draft.rows.length ? 'disabled' : ''}>${esc(t(draft.resetting ? 'inlineResetting' : 'inlineRestore'))}</button><div class="overview-editor-actions"><button type="button" class="button" data-editor-cancel ${draft.saving || draft.resetting ? 'disabled' : ''}>${esc(t('inlineCancel'))}</button><button type="button" class="button primary" data-editor-save ${draft.loading || draft.saving || draft.resetting || !draft.loaded || !draft.rows.length ? 'disabled' : ''}>${esc(t(draft.saving ? 'saving' : 'inlineSave'))}</button></div><span role="status" class="overview-editor-message">${esc(draft.error || (draft.loading ? t('inlineLoading') : !draft.rows.length ? t('inlineUnavailable') : ''))}</span></footer>`;
      if (focus) {
        const input = [...panel.querySelectorAll('[data-editor-field]')].find(
          (node) =>
            node.dataset.editorRow === focus.row && node.dataset.editorField === focus.field,
        );
        input?.focus({ preventScroll: true });
        if (input && focus.start != null) input.setSelectionRange(focus.start, focus.start);
      }
    }
    if (!draft) restoreKey = null;
  }
  async function save() {
    if (
      !draft?.loaded ||
      draft.loading ||
      draft.saving ||
      draft.resetting ||
      draft.closing ||
      !canEdit()
    )
      return;
    const current = draft,
      changes = overviewChanges(current.rows),
      { t } = getContext();
    if (!changes.valid) {
      current.error = t('inlineInvalid');
      sync();
      return;
    }
    current.saving = true;
    current.error = '';
    sync();
    const interval = current.choices.find((slot) => slot.key === current.selected);
    try {
      await api('/api/entry/interval', {
        method: 'PUT',
        body: JSON.stringify({
          ...current.unit,
          date: current.date,
          shift: interval.shift,
          interval: { start: interval.start, end: interval.end },
          configVersion: current.config.version,
          completeActuals: true,
          rows: changes.rows,
          expectedVersions: changes.rows.map((change) => ({
            rowId: change.rowId,
            version: current.rows.find((item) => item.row.id === change.rowId).version,
          })),
        }),
      });
      await clear();
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
  async function reset() {
    if (
      !draft?.loaded ||
      draft.loading ||
      draft.saving ||
      draft.resetting ||
      draft.closing ||
      !canEdit()
    )
      return;
    const current = draft;
    const interval = current.choices.find((slot) => slot.key === current.selected);
    current.resetting = true;
    current.error = '';
    sync();
    try {
      if (!(await confirmReset()) || draft !== current || !canEdit()) return;
      const result = await api('/api/entry/interval/reset', {
        method: 'PUT',
        body: JSON.stringify({
          ...current.unit,
          date: current.date,
          shift: interval.shift,
          interval: { start: interval.start, end: interval.end },
          configVersion: current.config.version,
          expectedVersions: current.rows.map((item) => ({
            rowId: item.row.id,
            version: item.version,
          })),
        }),
      });
      if (draft !== current) return;
      // Replace both the baseline and draft immediately with committed records.
      // No draft fields or autosave callbacks participate in a reset.
      current.rows = overviewRows(
        current.config,
        {
          records: result.records,
          defaults: {},
          rowVersions: {},
        },
        current.unit,
        interval,
        current.date,
      );
      root.querySelector('[data-overview-panel]')?.removeAttribute('data-view');
      onReset(result, { date: current.date, shift: interval.shift });
      sync();
      toast(getContext().t('inlineRestored'));
      try {
        await refresh();
      } catch {
        current.error = getContext().t('inlineResetRefreshFailed');
      }
    } catch (error) {
      if (draft === current) current.error = error.message;
    } finally {
      if (draft === current) {
        current.resetting = false;
        sync();
      }
    }
  }
  root.addEventListener('input', (event) => {
    const field = event.target.dataset.editorField;
    if (!draft || draft.resetting || draft.saving || !fields.includes(field)) return;
    const item = draft.rows.find(
      (item) => String(item.row.id) === event.target.dataset.editorRow,
    );
    if (item) {
      item.draft[field] = event.target.value;
      event.target.setAttribute(
        'aria-invalid',
        String(!parseBulkValue(field, event.target.value).valid),
      );
    }
  });
  root.addEventListener('change', async (event) => {
    if (
      !event.target.matches('[data-editor-slot]') ||
      !draft ||
      draft.loading ||
      draft.saving ||
      draft.resetting
    )
      return;
    const current = draft,
      selected = event.target.value;
    if (dirty() && !(await confirm(getContext().t('inlineLeave')))) {
      if (draft === current) {
        event.target.value = current.selected;
      }
      return;
    }
    if (draft !== current) return;
    current.selected = selected;
    await load();
  });
  return {
    sync,
    get active() {
      return !!draft;
    },
    get key() {
      return draft?.key;
    },
    get focusKey() {
      return draft?.key || restoreKey;
    },
    async guard() {
      if (!draft) return true;
      if (draft.saving || draft.loading || draft.resetting || draft.closing) return false;
      if (dirty() && !(await confirm(getContext().t('inlineLeave')))) return false;
      await clear();
      return true;
    },
    handle(event, lines) {
      if (!event.target.closest('[data-overview-edit], [data-overview-panel]')) return false;
      event.stopPropagation();
      if (event.target.closest('[data-overview-edit]')) {
        const key = event.target.closest('.line-card').dataset.monitorLine;
        const line = lines.find((line) => (line.key || line.line) === key);
        if (line) void open(line);
      }
      if (event.target.closest('[data-editor-cancel]') && !draft?.saving && !draft?.resetting)
        clear();
      if (event.target.closest('[data-editor-restore]')) void reset();
      if (event.target.closest('[data-editor-save]')) void save();
      return true;
    },
  };
}
