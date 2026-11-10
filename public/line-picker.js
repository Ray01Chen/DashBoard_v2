/** A bounded, searchable selector. Selection is UI state, not a CONFIG edit;
 * only the existing Apply action copies schedules into the settings draft. */
import { naturalOrder } from './list-order.js';

export function linePickerGroups(config, language) {
  const available = new Set(config.lines);
  const groups = naturalOrder(config.monitoring?.groups || [], language, (group) => group.name)
    .map((group) => ({
      id: 'group:' + group.id,
      name: group.name,
      lines: naturalOrder(
        [...new Set(group.lines.filter((line) => available.has(line)))],
        language,
      ),
    }))
    .filter((group) => group.lines.length);
  const assigned = new Set(groups.flatMap((group) => group.lines));
  const remaining = naturalOrder(
    config.lines.filter((line) => !assigned.has(line)),
    language,
  );
  if (remaining.length) groups.push({ id: 'ungrouped', name: null, lines: remaining });
  return groups;
}

export function linePickerMarkup(config, selected, { t, esc, language }) {
  return `<details class="line-multiselect" id="schedule-line-picker"><summary><span>${esc(t('chooseApplyLines'))}</span><b data-picker-count>${esc(t('selectedLineCount', { count: selected.length }))}</b></summary>
    <div class="line-picker-panel"><label class="line-picker-search">${esc(t('searchLines'))}<input type="search" data-line-picker-search placeholder="${esc(t('searchLines'))}" autocomplete="off"></label>
    <div class="line-picker-actions"><button type="button" class="button" data-action="schedule-select-all">${esc(t('selectAll'))}</button><button type="button" class="button" data-action="schedule-clear-lines">${esc(t('clearSelection'))}</button><span data-picker-results role="status"></span></div>
    <div class="line-picker-groups">${linePickerGroups(config, language)
      .map(
        (group) =>
          `<section data-picker-section><label class="line-picker-group"><input type="checkbox" data-schedule-apply-group="${esc(group.id)}"><strong>${esc(group.name ?? t('ungroupedLines'))}</strong><small data-picker-group-count></small></label><div>${group.lines.map((line) => `<label class="line-picker-option" data-picker-option="${esc(line)}"><input type="checkbox" data-schedule-apply-line="${esc(line)}" ${selected.includes(line) ? 'checked' : ''}><span>${esc(line)}</span></label>`).join('')}</div></section>`,
      )
      .join('')}</div>
    <p data-picker-empty hidden>${esc(t('noMatchingLinesSearch'))}</p><button type="button" class="button" data-action="close-line-picker">${esc(t('close'))}</button></div></details>`;
}

export function updateLinePicker(root, config, selected, { t, language }) {
  if (!root) return;
  const chosen = new Set(selected);
  const query = (root.querySelector('[data-line-picker-search]').value || '')
    .normalize('NFKC')
    .toLocaleLowerCase(language);
  root.querySelector('[data-picker-count]').textContent = t('selectedLineCount', {
    count: chosen.size,
  });
  const groups = new Map(linePickerGroups(config, language).map((group) => [group.id, group]));
  let matches = new Set();
  for (const section of root.querySelectorAll('[data-picker-section]')) {
    const checkbox = section.querySelector('[data-schedule-apply-group]');
    const group = groups.get(checkbox.dataset.scheduleApplyGroup);
    const count = group.lines.filter((line) => chosen.has(line)).length;
    checkbox.checked = count === group.lines.length;
    checkbox.indeterminate = count > 0 && count < group.lines.length;
    section.querySelector('[data-picker-group-count]').textContent =
      `${count} / ${group.lines.length}`;
    const groupMatches = (group.name || t('ungroupedLines'))
      .normalize('NFKC')
      .toLocaleLowerCase(language)
      .includes(query);
    let visible = 0;
    for (const option of section.querySelectorAll('[data-picker-option]')) {
      const line = option.dataset.pickerOption;
      option.querySelector('input').checked = chosen.has(line);
      option.hidden =
        !groupMatches && !line.normalize('NFKC').toLocaleLowerCase(language).includes(query);
      if (!option.hidden) {
        visible++;
        matches.add(line);
      }
    }
    section.hidden = !visible;
  }
  root.querySelector('[data-picker-empty]').hidden = matches.size > 0;
  root.querySelector('[data-picker-results]').textContent = t('matchingLinesCount', {
    count: matches.size,
    total: config.lines.length,
  });
  const apply = root
    .closest('.schedule-apply')
    ?.querySelector('[data-action="apply-schedule-template"]');
  if (apply) {
    apply.disabled = !chosen.size;
    apply.textContent = t('applySelectedTemplate', { count: chosen.size });
  }
}
