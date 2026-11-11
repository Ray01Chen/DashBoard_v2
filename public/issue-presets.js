import { listOrder } from './list-order.js';
/** English quick text shared by station and interval issue editors. */
export const defaultIssuePresets = [
  { id: 'equipment', label: 'Equipment downtime', active: true },
  { id: 'material', label: 'Material shortage', active: true },
  { id: 'quality', label: 'Quality issue', active: true },
];

const normalizePreset = (item) => ({
  id: String(item?.id || ''),
  // Preserve existing installations that stored three translated labels.
  label: String(item?.label ?? item?.labels?.en ?? item?.labels?.zh ?? item?.labels?.th ?? ''),
  active: item?.active !== false,
});

export const issuePresets = (config) =>
  (config?.issuePresets ?? defaultIssuePresets).map(normalizePreset);

export const issueLabel = (item) => normalizePreset(item).label;

export function validateIssuePresets(items) {
  return (
    Array.isArray(items) &&
    items.length <= 50 &&
    new Set(items.map((item) => item?.id)).size === items.length &&
    new Set(items.map((item) => item?.label?.trim().toLocaleLowerCase())).size ===
      items.length &&
    items.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 80 &&
        typeof item.label === 'string' &&
        item.label.trim().length > 0 &&
        item.label.length <= 120 &&
        typeof item.active === 'boolean',
    )
  );
}

const copy = {
  en: {
    title: 'Issue quick text (English)',
    description: 'Create the English reasons shown in production entry and interval fill.',
    add: 'Add reason',
    remove: 'Remove',
    active: 'Enabled',
    label: 'English reason',
  },
  zh: {
    title: '異常快捷文字（英文）',
    description: '建立生產填報與批次填寫使用的英文異常原因。',
    add: '新增原因',
    remove: '刪除',
    active: '啟用',
    label: '英文原因',
  },
  th: {
    title: 'ข้อความปัญหาด่วน (ภาษาอังกฤษ)',
    description: 'สร้างเหตุผลภาษาอังกฤษสำหรับการกรอกผลผลิตและการกรอกเป็นชุด',
    add: 'เพิ่มเหตุผล',
    remove: 'ลบ',
    active: 'เปิดใช้',
    label: 'เหตุผลภาษาอังกฤษ',
  },
};

export function issueSettingsMarkup({ draft, language, esc }) {
  const text = copy[language] || copy.en;
  return `<section class="panel issue-preset-settings"><div class="panel-heading"><div><h3>${esc(text.title)}</h3><p>${esc(text.description)}</p></div><button type="button" class="button" data-issue-action="add">${esc(text.add)}</button></div><div class="issue-preset-list">${listOrder(
    issuePresets(draft).map((item, index) => ({ item, index })),
    language,
    ({ item }) => item.label,
    'issues',
  )
    .map(
      ({ item, index }) =>
        `<div class="issue-preset-row" data-issue-preset-index="${index}"><label class="issue-preset-label">${esc(text.label)}<input maxlength="120" value="${esc(item.label)}" data-issue-label data-issue-index="${index}"></label><div class="issue-preset-actions"><label><input type="checkbox" data-issue-enabled="${index}" ${item.active ? 'checked' : ''}>${esc(text.active)}</label><button type="button" class="button" data-issue-action="remove" data-issue-index="${index}">${esc(text.remove)}</button></div></div>`,
    )
    .join('')}</div></section>`;
}
