/** Shared multilingual quick text. Editing a translation invalidates review;
 * only complete, explicitly confirmed entries may be published. */
export const defaultIssuePresets = [
  {
    id: 'equipment',
    labels: { en: 'Equipment downtime', zh: '設備停機', th: 'เครื่องจักรหยุด' },
    active: true,
    confirmed: true,
  },
  {
    id: 'material',
    labels: { en: 'Material shortage', zh: '缺料', th: 'ขาดวัสดุ' },
    active: true,
    confirmed: true,
  },
  {
    id: 'quality',
    labels: { en: 'Quality issue', zh: '品質異常', th: 'ปัญหาคุณภาพ' },
    active: true,
    confirmed: true,
  },
];
const common = [
  ...defaultIssuePresets.map((item) => item.labels),
  { en: 'Changeover', zh: '換線', th: 'เปลี่ยนรุ่นการผลิต' },
  { en: 'Power outage', zh: '停電', th: 'ไฟฟ้าดับ' },
  { en: 'Staff shortage', zh: '人力不足', th: 'พนักงานไม่เพียงพอ' },
  { en: 'Waiting for inspection', zh: '等待檢驗', th: 'รอการตรวจสอบ' },
  { en: 'Machine adjustment', zh: '機台調整', th: 'ปรับตั้งเครื่องจักร' },
  { en: 'Tool change', zh: '更換治具', th: 'เปลี่ยนเครื่องมือ' },
  { en: 'Rework', zh: '重工', th: 'แก้ไขงาน' },
  { en: 'No production plan', zh: '無生產計畫', th: 'ไม่มีแผนการผลิต' },
  { en: 'System failure', zh: '系統故障', th: 'ระบบขัดข้อง' },
  { en: 'Planned maintenance', zh: '計畫保養', th: 'บำรุงรักษาตามแผน' },
  { en: 'Test failure', zh: '測試失敗', th: 'ทดสอบไม่ผ่าน' },
  { en: 'Waiting for approval', zh: '等待核准', th: 'รอการอนุมัติ' },
];
export const issuePresets = (config) => config?.issuePresets ?? defaultIssuePresets;
export const issueLabel = (item, language) => item.labels[language] || item.labels.en;
export function suggestIssueTranslations(value) {
  const text = String(value).trim().toLocaleLowerCase();
  return common.find((labels) =>
    Object.values(labels).some((label) => label.toLocaleLowerCase() === text),
  );
}
export function validateIssuePresets(items) {
  return (
    Array.isArray(items) &&
    items.length <= 50 &&
    new Set(items.map((item) => item?.id)).size === items.length &&
    items.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 80 &&
        typeof item.active === 'boolean' &&
        item.confirmed === true &&
        ['en', 'zh', 'th'].every(
          (language) =>
            typeof item.labels?.[language] === 'string' &&
            item.labels[language].trim().length > 0 &&
            item.labels[language].length <= 120,
        ),
    )
  );
}
const copy = {
  en: {
    title: 'Issue quick text',
    add: 'Add quick text',
    remove: 'Remove',
    suggest: 'Suggest common translations',
    confirm: 'I checked all three translations',
    active: 'Enabled',
    pending: 'Complete all languages and confirm the translations before saving.',
    manual: 'No common translation found. Enter and review the three versions.',
    preview: 'Preview',
  },
  zh: {
    title: '異常快捷文字',
    add: '新增快捷文字',
    remove: '刪除',
    suggest: '帶入常用翻譯建議',
    confirm: '我已核對三種語言的翻譯',
    active: '啟用',
    pending: '請填妥三種語言並確認翻譯，再儲存設定。',
    manual: '沒有對應的常用翻譯，請填寫並核對三種語言。',
    preview: '預覽',
  },
  th: {
    title: 'ข้อความปัญหาด่วน',
    add: 'เพิ่มข้อความ',
    remove: 'ลบ',
    suggest: 'แนะนำคำแปลที่ใช้บ่อย',
    confirm: 'ตรวจคำแปลทั้งสามภาษาแล้ว',
    active: 'เปิดใช้',
    pending: 'กรอกสามภาษาและยืนยันคำแปลก่อนบันทึก',
    manual: 'ไม่พบคำแปลที่ใช้บ่อย กรุณากรอกและตรวจสามภาษา',
    preview: 'ตัวอย่าง',
  },
};
export const issuePresetMessages = copy;
export function issueSettingsMarkup({ draft, language, esc }) {
  const text = copy[language] || copy.en;
  return `<section class="panel issue-preset-settings"><div class="panel-heading"><h3>${esc(text.title)}</h3><button type="button" class="button" data-issue-action="add">${esc(text.add)}</button></div>${issuePresets(
    draft,
  )
    .map(
      (item, index) =>
        `<div class="issue-preset-row" data-issue-preset-index="${index}"><div class="issue-preset-languages">${['en', 'zh', 'th'].map((lang) => `<label>${{ en: 'English', zh: 'Chinese', th: 'Thai' }[lang]}<input maxlength="120" value="${esc(item.labels[lang])}" data-issue-language="${lang}" data-issue-index="${index}"></label>`).join('')}</div><div class="issue-preset-actions"><label><input type="checkbox" data-issue-enabled="${index}" ${item.active ? 'checked' : ''}>${esc(text.active)}</label><label><input type="checkbox" data-issue-confirmed="${index}" ${item.confirmed ? 'checked' : ''}>${esc(text.confirm)}</label><button type="button" class="button" data-issue-action="suggest" data-issue-index="${index}">${esc(text.suggest)}</button><button type="button" class="button" data-issue-action="remove" data-issue-index="${index}">${esc(text.remove)}</button></div><div class="issue-preset-preview" data-issue-preview="${index}">${Object.values(
          item.labels,
        )
          .map((label) => `<span>${esc(label)}</span>`)
          .join('')}</div></div>`,
    )
    .join('')}<p class="form-hint" data-issue-settings-error role="status"></p></section>`;
}
