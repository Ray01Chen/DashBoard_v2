import {
  modelOf,
  productionKey,
  productionLabel,
  productionIdentityMarkup,
  sameProduction,
  productionUnits,
  orderedStationRows,
  stationHasOutput,
} from './production-models.js';
import { lineDailyTarget, allocateDailyTarget } from './production-targets.js';
import { issuePresets, issueLabel } from './issue-presets.js';

/**
 * Production entry is deliberately separate from reporting. Only actual output
 * targets and issue notes are editable; staffing uses server-owned snapshots.
 * Every queue item captures its report date/shift so a later UI selection cannot
 * accidentally redirect an in-flight write into another report.
 */
const messages = {
  en: {
    bulkApplyIssue: 'Apply issues',
    wholeDay: 'Whole day',
    pasteHint:
      'Paste any number of rows: odd rows are Target, even rows are Actual. Values that exceed the remaining stations or time slots are ignored.',
    bulkDateInvalid: 'Choose a valid production date.',
    bulkApplyActual: 'Apply actuals',
    bulkApplyTarget: 'Apply targets',
    bulkProduct: 'Product',
    savedHistory: 'Saved production (read-only)',
    noOutput: 'No output · reporting not required',
    noOutputHint: 'This station stays visible. Saved production and issues are read-only.',
    bulkNoOutput:
      'No enabled output stations in this line/model. Choose another combination or ask a manager to update its configuration.',
    bulkChooseHint:
      'Choose a Line and Model. Entered values stay here when switching; closing returns to the selected line/model.',
    bulkOpen: 'Fill interval',
    bulkTitle: 'Edit production interval',
    bulkHint:
      'Entered columns replace previous individual values for this interval. Blank leaves a column unchanged. Issues, other intervals and the daily preset remain unchanged.',
    bulkRefresh: 'Refresh preview',
    bulkConflict:
      'Nothing was changed. Refresh preview, review the current values and apply again.',
    bulkReview:
      'Unable to confirm the result. Refresh preview to check saved values before applying again.',
    bulkPending: 'Save or resolve pending station edits first.',
    bulkNoInterval:
      'These stations do not all share this interval. Choose another interval or edit individually.',
    configurationRequired:
      'This line/model has no enabled station configuration yet. Targets, actuals and station issues can be saved after a manager enables its job/station pairs.',
    configureStations: 'Configure stations for this line/model',
    askManagerConfiguration:
      'Ask a manager to open Settings → Line configuration and enable the stations for this combination.',
    configurationPreview:
      'Preview of interval targets from the daily preset. Enable and save station configuration to enter Actual and Issue; these preview fields do not save reports.',
    allModels: 'All models',
    unifiedHint:
      'Each station saves independently. Blank is unreported; 0 is confirmed zero output.',
    dailyTotal: 'Day + night target',
    defaultTarget: 'Default daily target',
    title: 'Production entry',
    description:
      'Enter Target and Actual directly. Click Add issue or a note preview to edit; changes save automatically.',
    line: 'Line',
    station: 'Station',
    allLines: 'All lines',
    actual: 'Actual',
    issue: 'Issue',
    addIssue: 'Add issue',
    done: 'Done',
    issueDetails: 'What happened?',
    issueHelp:
      'Saves automatically. Done, Esc or a click outside closes and saves. Ctrl+Enter closes; Enter adds a new line.',
    quickReasons: 'Quick text',
    equipment: 'Equipment downtime',
    material: 'Material shortage',
    quality: 'Quality issue',
    clearIssue: 'Clear note',
    issueLimit: 'Maximum 2,000 characters.',
    excelTools: 'Excel import & templates',
    target: 'Target',
    job: 'Job',
    saving: 'Saving…',
    saved: 'Saved',
    waiting: 'Not entered',
    pending: 'Unsaved changes',
    error: 'Save failed',
    conflict: 'Data changed on another device. Review the latest data before saving.',
    retry: 'Retry save',
    review: 'Review latest',
    useLatest: 'Use latest data',
    saveMine: 'Save my changed cells',
    latest: 'Latest saved data',
    mine: 'Your changes',
    saveNow: 'Save now',
    autosave: 'Autosave',
    reportHint:
      'Targets follow the daily preset and production minutes. Changes affect only this station’s report.',
    noRows: 'No stations are available for this selection.',
    loading: 'Loading…',
    invalidActual: 'Enter a whole number from 0 to 99,999,999, or leave it blank.',
    importExcel: 'Import Excel',
    template: 'Download template',
    chooseFile: 'Choose an Excel or CSV file',
    importTitle: 'Preview imported production data',
    importDescription:
      'Check the mapped stations and values before importing. Existing records are protected against concurrent changes.',
    apply: 'Import data',
    close: 'Close',
    imported: 'Import completed.',
    noImportRows: 'No production changes were found in this file.',
    invalidImport: 'Fix the listed errors and upload the file again.',
    excelRow: 'Excel row',
    column: 'Column',
    message: 'Message',
    records: 'Records',
    cells: 'Cells',
    tooLarge: 'Choose a file smaller than 5 MB.',
    unsupported: 'Choose an .xlsx or .csv file.',
    network: 'The request failed. Your entered values have been retained.',
    unsavedImport: 'Save or resolve pending entries before importing.',
    overwrite: 'Only the cells you changed will be sent after this review.',
    emptyValue: '(blank)',
    loadLatestFailed: 'Unable to load the latest data. Your changes have been retained.',
    inputMode: 'Input mode',
    shiftMode: 'Whole-shift spreadsheet',
    sheetMode: 'Single-interval spreadsheet',
    interval: 'Time slot',
    noSlot: 'No production interval is configured.',
    noCurrentSlot: 'The selected production date has no active interval at the current Bangkok time.',
    discard: 'Discard my unsaved changes',
    dayMode: 'Whole-day spreadsheet',
    total: 'Total',
    productionDate: 'Production date',
    importScope:
      'Choose a whole-day or single-shift file. Night intervals after midnight belong to the selected production date.',
    pastePending: 'Pasted cells are pending autosave.',
    invalidPaste:
      'Nothing was pasted. Use a rectangle of valid whole numbers or blanks within Target or Actual cells.',
    currentSlot: 'Go to current time slot',
    importBusy: 'Wait for the current import to finish.',
    day: 'Day shift',
    night: 'Night shift',
    retryLoad: 'Try again',
    configChanged: 'Production settings changed. Refresh the report before loading both shifts.',
  },
  zh: {
    bulkApplyIssue: '套用異常',
    wholeDay: '一整天',
    pasteHint: '可貼任意列數：單數列是目標、雙數列是實績；超過剩餘站點或時段的值不貼上。',
    bulkDateInvalid: '請選擇有效的生產日期。',
    bulkApplyActual: '套用實績',
    bulkApplyTarget: '套用目標',
    bulkProduct: '機種',
    savedHistory: '已存生產資料（唯讀）',
    noOutput: '無產出・免填報',
    noOutputHint: '站點保留顯示，已存產量與異常僅供查閱。',
    bulkNoOutput: '這組產線／Model 沒有啟用的產出站點，請切換配對或請管理員調整配置。',
    bulkOpen: '同時段批次填寫',
    bulkTitle: '編輯時段目標與實績',
    bulkHint:
      '填入的欄位會覆蓋此時段各站原本的個別值；空白欄位保留原值。異常、其他時段與日目標預設不變。',
    bulkRefresh: '更新預覽',
    bulkConflict: '本次未變更資料。請更新預覽，核對最新值後再套用。',
    bulkReview: '無法確認結果。請先更新預覽，確認已存數值後再套用。',
    bulkPending: '請先儲存或處理尚未完成的站點修改。',
    bulkNoInterval: '部分站點沒有相同時段，請選其他時段或個別填寫。',
    configurationRequired:
      '這組產線／Model 尚無啟用的站點配置。管理員啟用職務／站點並儲存後，即可填寫目標、實績與各站異常。',
    configureStations: '設定這組產線／Model 的站點',
    askManagerConfiguration: '請管理員到「設定 → 產線配置」，啟用這組職務／站點並儲存。',
    configurationPreview:
      '下表預覽日目標分配到各時段的數值。先啟用並儲存站點配置，再填實績及異常；這些預覽欄位不會建立報表。',
    allModels: '全部 Model',
    unifiedHint: '各站獨立儲存；空白表示未填報，0 表示確認零產出。',
    dailyTotal: '全日目標',
    defaultTarget: '預設日目標',
    title: '生產填報',
    description: '直接填 Target、Actual；點「新增異常」或說明摘要編輯異常，修改會自動儲存。',
    line: '產線',
    station: '站點',
    allLines: '全部產線',
    actual: '實績',
    issue: '異常說明',
    addIssue: '新增異常',
    done: '完成',
    issueDetails: '發生什麼狀況？',
    issueHelp: '自動儲存；按完成、Esc 或點視窗外會關閉並儲存。Ctrl+Enter 完成，Enter 換行。',
    quickReasons: '快捷文字',
    equipment: '設備停機',
    material: '缺料',
    quality: '品質異常',
    clearIssue: '清除說明',
    issueLimit: '最多 2,000 字元。',
    excelTools: 'Excel 匯入與範本',
    target: '目標',
    job: '職務',
    saving: '儲存中…',
    saved: '已儲存',
    waiting: '尚未填寫',
    pending: '有尚未儲存的內容',
    error: '儲存失敗',
    conflict: '其他使用者已更新這筆資料，請先檢視最新內容再儲存。',
    retry: '重新儲存',
    review: '檢視最新資料',
    useLatest: '採用最新資料',
    saveMine: '儲存我修改的欄位',
    latest: '最新已儲存資料',
    mine: '我的修改',
    saveNow: '立即儲存',
    autosave: '自動儲存',
    reportHint: '目標依日目標預設與生產分鐘分配；修改只影響本站當日填報。',
    noRows: '此選項沒有可填報的站點。',
    loading: '載入中…',
    invalidActual: '請輸入 0～99,999,999 的整數，或留空。',
    importExcel: '匯入 Excel',
    template: '下載範本',
    chooseFile: '選擇 Excel 或 CSV 檔案',
    importTitle: '預覽生產資料匯入',
    importDescription: '請確認對應站點與數據後再匯入，系統會檢查多人同時修改的衝突。',
    apply: '確認匯入',
    close: '關閉',
    imported: '匯入完成。',
    noImportRows: '檔案中沒有可匯入的生產變更。',
    invalidImport: '請修正下列問題後重新上傳。',
    excelRow: 'Excel 列',
    column: '欄位',
    message: '說明',
    records: '筆數',
    cells: '欄位數',
    tooLarge: '請選擇小於 5 MB 的檔案。',
    unsupported: '請選擇 .xlsx 或 .csv 檔案。',
    network: '請求失敗，已保留您的填寫內容。',
    unsavedImport: '請先儲存或處理尚未完成的填報，再匯入檔案。',
    overwrite: '確認後只會送出您修改過的欄位。',
    emptyValue: '（空白）',
    loadLatestFailed: '無法取得最新資料，已保留您的修改。',
    inputMode: '填寫方式',
    shiftMode: '整班試算表',
    sheetMode: '單時段試算表',
    interval: '生產時段',
    noSlot: '尚未設定生產時段。',
    noCurrentSlot: '所選生產日期在目前曼谷時間沒有進行中的生產時段。',
    discard: '捨棄我的未儲存修改',
    dayMode: '整日雙班試算表',
    total: '合計',
    productionDate: '生產日期',
    importScope:
      '可選整日雙班或單班範本／匯入；午夜後的晚班時段仍屬於所選生產日期。',
    pastePending: '已貼上，等待自動儲存。',
    invalidPaste:
      '未貼上資料。請使用合法整數或空白的矩形範圍，且不得超出 Target 或 Actual 可填區。',
    currentSlot: '前往目前時段',
    importBusy: '請等待目前的匯入完成。',
    day: '早班',
    night: '晚班',
    retryLoad: '重新載入',
    configChanged: '生產設定已更新，請重新整理報表後再載入雙班資料。',
  },
  th: {
    bulkApplyIssue: 'ใช้ปัญหากับทุกสถานี',
    wholeDay: 'ทั้งวัน',
    pasteHint: 'วางกี่แถวก็ได้: แถวคี่เป็น Target แถวคู่เป็น Actual ค่าที่เกินสถานีหรือช่วงเวลาที่เหลือจะไม่ถูกวาง',
    bulkDateInvalid: 'เลือกวันที่ผลิตที่ถูกต้อง',
    bulkApplyActual: 'ใช้ผลจริง',
    bulkApplyTarget: 'ใช้เป้าหมาย',
    bulkProduct: 'ผลิตภัณฑ์',
    savedHistory: 'ข้อมูลการผลิตเดิม (อ่านอย่างเดียว)',
    noOutput: 'ไม่มีผลผลิต · ไม่ต้องบันทึก',
    noOutputHint: 'ยังแสดงสถานี ผลผลิตและปัญหาเดิมดูได้อย่างเดียว',
    bulkNoOutput: 'คู่นี้ไม่มีสถานีที่เปิดใช้และมีผลผลิต เลือกคู่อื่นหรือให้ผู้จัดการแก้การตั้งค่า',
    bulkChooseHint:
      'เลือกสายและ Model ตัวเลขที่ยังไม่ใช้จะคงอยู่เมื่อเปลี่ยนคู่ ปิดแล้วกลับไปคู่ที่เลือก',
    bulkOpen: 'กรอกทั้งสายตามช่วง',
    bulkTitle: 'แก้เป้าหมายและผลจริงตามช่วง',
    bulkHint:
      'คอลัมน์ที่กรอกจะทับค่ารายสถานีในช่วงนี้ ช่องว่างเก็บค่าเดิม ปัญหา ช่วงอื่นและเป้ารายวันเริ่มต้นไม่เปลี่ยน',
    bulkRefresh: 'โหลดตัวอย่างใหม่',
    bulkConflict: 'ยังไม่เปลี่ยนข้อมูล โหลดตัวอย่างใหม่ ตรวจค่าปัจจุบันแล้วใช้ค่าอีกครั้ง',
    bulkReview: 'ยังยืนยันผลไม่ได้ โหลดตัวอย่างเพื่อตรวจค่าที่บันทึกก่อนลองอีกครั้ง',
    bulkPending: 'บันทึกหรือแก้ไขรายการสถานีที่ค้างอยู่ก่อน',
    bulkNoInterval: 'บางสถานีไม่มีช่วงเวลาเดียวกัน เลือกช่วงอื่นหรือกรอกรายสถานี',
    configurationRequired:
      'คู่สาย/Model นี้ยังไม่มีสถานีที่เปิดใช้งาน ผู้ดูแลต้องเปิดใช้คู่หน้าที่/สถานีและบันทึกก่อนกรอกเป้าหมาย ผลจริง และปัญหา',
    configureStations: 'ตั้งค่าสถานีของสาย/Model นี้',
    askManagerConfiguration:
      'ให้ผู้ดูแลเปิดการตั้งค่า → การตั้งค่าสาย แล้วเปิดสถานีของคู่นี้และบันทึก',
    configurationPreview:
      'ตัวอย่างเป้าหมายแต่ละช่วงจากค่าเริ่มต้น เปิดใช้และบันทึกสถานีก่อนกรอกผลจริงและปัญหา ช่องตัวอย่างนี้ไม่สร้างรายงาน',
    allModels: 'ทุก Model',
    unifiedHint: 'แต่ละสถานีบันทึกแยกกัน ว่างคือยังไม่รายงาน 0 คือยืนยันผลผลิตเป็นศูนย์',
    dailyTotal: 'เป้าหมายรวมวัน',
    defaultTarget: 'เป้าหมายรายวันเริ่มต้น',
    title: 'บันทึกการผลิต',
    description:
      'กรอก Target และ Actual โดยตรง คลิกเพิ่มปัญหาหรือข้อความย่อเพื่อแก้ไข บันทึกอัตโนมัติ',
    line: 'สายการผลิต',
    station: 'สถานี',
    allLines: 'ทุกสายการผลิต',
    actual: 'ยอดจริง',
    issue: 'รายละเอียดปัญหา',
    addIssue: 'เพิ่มปัญหา',
    done: 'เสร็จสิ้น',
    issueDetails: 'เกิดอะไรขึ้น?',
    issueHelp:
      'บันทึกอัตโนมัติ กดเสร็จสิ้น Esc หรือคลิกนอกหน้าต่างเพื่อปิดและบันทึก Ctrl+Enter ปิด Enter ขึ้นบรรทัดใหม่',
    quickReasons: 'ข้อความด่วน',
    equipment: 'เครื่องจักรหยุด',
    material: 'ขาดวัสดุ',
    quality: 'ปัญหาคุณภาพ',
    clearIssue: 'ล้างข้อความ',
    issueLimit: 'สูงสุด 2,000 ตัวอักษร',
    excelTools: 'นำเข้า Excel และแม่แบบ',
    target: 'เป้าหมาย',
    job: 'งาน',
    saving: 'กำลังบันทึก…',
    saved: 'บันทึกแล้ว',
    waiting: 'ยังไม่กรอก',
    pending: 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก',
    error: 'บันทึกไม่สำเร็จ',
    conflict: 'ผู้ใช้อื่นแก้ไขข้อมูลนี้แล้ว โปรดตรวจสอบข้อมูลล่าสุดก่อนบันทึก',
    retry: 'บันทึกอีกครั้ง',
    review: 'ตรวจสอบข้อมูลล่าสุด',
    useLatest: 'ใช้ข้อมูลล่าสุด',
    saveMine: 'บันทึกเฉพาะช่องที่ฉันแก้ไข',
    latest: 'ข้อมูลที่บันทึกล่าสุด',
    mine: 'การแก้ไขของคุณ',
    saveNow: 'บันทึกตอนนี้',
    autosave: 'บันทึกอัตโนมัติ',
    reportHint: 'เป้าหมายแบ่งตามค่าเริ่มต้นรายวันและนาทีผลิต การแก้ไขมีผลเฉพาะรายงานของสถานีนี้',
    noRows: 'ไม่มีสถานีสำหรับตัวเลือกนี้',
    loading: 'กำลังโหลด…',
    invalidActual: 'กรอกจำนวนเต็มตั้งแต่ 0 ถึง 99,999,999 หรือเว้นว่าง',
    importExcel: 'นำเข้า Excel',
    template: 'ดาวน์โหลดแบบฟอร์ม',
    chooseFile: 'เลือกไฟล์ Excel หรือ CSV',
    importTitle: 'ตรวจสอบข้อมูลการผลิตก่อนนำเข้า',
    importDescription: 'ตรวจสอบสถานีและข้อมูลก่อนนำเข้า ระบบจะตรวจสอบการแก้ไขพร้อมกัน',
    apply: 'นำเข้าข้อมูล',
    close: 'ปิด',
    imported: 'นำเข้าสำเร็จ',
    noImportRows: 'ไม่มีข้อมูลการผลิตที่เปลี่ยนแปลงในไฟล์นี้',
    invalidImport: 'แก้ไขข้อผิดพลาดและอัปโหลดไฟล์อีกครั้ง',
    excelRow: 'แถว Excel',
    column: 'คอลัมน์',
    message: 'รายละเอียด',
    records: 'รายการ',
    cells: 'ช่องข้อมูล',
    tooLarge: 'เลือกไฟล์ที่มีขนาดเล็กกว่า 5 MB',
    unsupported: 'เลือกไฟล์ .xlsx หรือ .csv',
    network: 'คำขอไม่สำเร็จ ข้อมูลที่กรอกยังคงอยู่',
    unsavedImport: 'บันทึกหรือแก้ไขรายการที่ค้างอยู่ก่อนนำเข้า',
    overwrite: 'หลังตรวจสอบ ระบบจะส่งเฉพาะช่องที่คุณแก้ไข',
    emptyValue: '(ว่าง)',
    loadLatestFailed: 'โหลดข้อมูลล่าสุดไม่สำเร็จ การแก้ไขของคุณยังคงอยู่',
    inputMode: 'รูปแบบการกรอก',
    shiftMode: 'ตารางทั้งกะ',
    sheetMode: 'ตารางช่วงเวลาเดียว',
    interval: 'ช่วงเวลา',
    noSlot: 'ยังไม่ได้กำหนดช่วงเวลาการผลิต',
    noCurrentSlot: 'วันที่ผลิตที่เลือกไม่มีช่วงการผลิตที่กำลังทำงานตามเวลาปัจจุบันของกรุงเทพฯ',
    discard: 'ยกเลิกการแก้ไขที่ยังไม่บันทึก',
    dayMode: 'ตารางทั้งสองกะตลอดวัน',
    total: 'รวม',
    productionDate: 'วันที่ผลิต',
    importScope:
      'เลือกแม่แบบและนำเข้าทั้งวันหรือแยกกะได้ ช่วงกะดึกหลังเที่ยงคืนยังเป็นวันที่ผลิตที่เลือก',
    pastePending: 'วางแล้ว รอการบันทึกอัตโนมัติ',
    invalidPaste:
      'ไม่ได้วางข้อมูล ใช้สี่เหลี่ยมจำนวนเต็มหรือค่าว่างภายในช่อง Target หรือ Actual ที่กรอกได้',
    currentSlot: 'ไปช่วงเวลาปัจจุบัน',
    importBusy: 'โปรดรอการนำเข้าปัจจุบันให้เสร็จ',
    day: 'กะเช้า',
    night: 'กะดึก',
    retryLoad: 'โหลดอีกครั้ง',
    configChanged: 'การตั้งค่าการผลิตเปลี่ยนแล้ว โปรดรีเฟรชรายงานก่อนโหลดทั้งสองกะ',
  },
};

export const entryMessages = messages;

const copy = (value) => structuredClone(value);
const slotValue = (slot, field) =>
  field === 'issue' ? (slot?.issue ?? '') : (slot?.[field] ?? null);

/** Return only edited writable fields, preserving the distinction between blank and zero. */
export function entryChanges(baseline, draft) {
  const originals = new Map((baseline.slots || []).map((slot) => [slot.id, slot]));
  return (draft.slots || []).flatMap((slot) => {
    const change = { id: slot.id };
    for (const field of ['target', 'actual', 'issue']) {
      if (
        slotValue(slot, field) !== slotValue(originals.get(slot.id), field) ||
        (['actual', 'target'].includes(field) &&
          slot[field === 'actual' ? 'syncActual' : 'syncTarget'] &&
          !originals.get(slot.id)?.[field === 'actual' ? 'syncActual' : 'syncTarget'])
      ) {
        change[field] = slotValue(slot, field);
      }
    }
    return Object.keys(change).length > 1 ? [change] : [];
  });
}

/** Merge a reviewed patch; fields untouched by this browser retain the latest server value. */
export function mergeEntryChanges(record, changes) {
  const result = copy(record);
  const slots = new Map((result.slots || []).map((slot) => [slot.id, slot]));
  for (const change of changes) {
    const slot = slots.get(change.id) || { id: change.id, actual: null, issue: '' };
    for (const field of ['target', 'actual', 'issue']) {
      if (Object.hasOwn(change, field)) slot[field] = change[field];
    }
    slots.set(slot.id, slot);
  }
  result.slots = [...slots.values()];
  return result;
}

export function parseEntryActual(value) {
  if (String(value).trim() === '') return { valid: true, value: null };
  if (!/^\d+$/.test(String(value).trim())) return { valid: false };
  const actual = Number(value);
  return Number.isSafeInteger(actual) && actual >= 0 && actual <= 99999999
    ? { valid: true, value: actual }
    : { valid: false };
}

// Numeric fields distinguish blank from zero. Notes keep their original text,
// including captured newlines, until the user explicitly changes them.
const bulkFields = ['target', 'actual', 'issue'];
const parseBulkValue = (field, value) =>
  field === 'issue'
    ? { valid: String(value).length <= 2000, value: String(value) }
    : parseEntryActual(value);

/** Preflight every cell before returning a patch; callers must not mutate on failure. */
export function planEntryPaste(tsv, grid, row, column, pairedGrids = null) {
  const lines = String(tsv).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const values = lines.map((line) => line.split('\t'));
  const width = values[0].length;
  if (values.some((line) => line.length !== width)) return { valid: false, reason: 'rectangle' };
  const field = grid[row]?.[column]?.field;
  if (!['actual', 'target'].includes(field)) return { valid: false, reason: 'destination' };
  const edits = [],
    destinations = new Set();
  for (let y = 0; y < values.length; y++) {
    for (let x = 0; x < width; x++) {
      const paired = Boolean(pairedGrids);
      const destinationField = paired ? (y % 2 === 0 ? 'target' : 'actual') : field;
      const destination = paired ? pairedGrids[destinationField] : grid;
      const destinationRow = row + (paired ? Math.floor(y / 2) : y);
      const destinationColumn = column + x;
      // The production grid follows spreadsheet edge behavior: paste the part
      // that fits from the selected cell and never wrap overflow into another
      // station or interval. Non-edge holes still reject the full paste.
      if (
        paired &&
        (destinationRow >= destination.length ||
          destinationColumn >= (destination[destinationRow]?.length ?? 0))
      )
        continue;
      const cell = destination[destinationRow]?.[destinationColumn];
      const parsed = parseEntryActual(values[y][x]);
      if (!parsed.valid) return { valid: false, reason: 'number' };
      if (!cell?.rowKey || !cell.slotId || cell.disabled || cell.field !== destinationField)
        return { valid: false, reason: 'destination' };
      const key = `${cell.rowKey}|${cell.slotId}|${destinationField}`;
      if (destinations.has(key)) return { valid: false, reason: 'destination' };
      destinations.add(key);
      edits.push({
        rowKey: cell.rowKey,
        slotId: cell.slotId,
        value: parsed.value,
        ...(pairedGrids ? { field: destinationField } : {}),
      });
    }
  }
  return edits.length ? { valid: true, edits } : { valid: false, reason: 'destination' };
}

/** Grid edges never wrap for arrows/Enter; Tab wraps rows and exits at the outer edge. */
export function entryGridDestination(grid, row, column, key, backwards = false) {
  let y = row,
    x = column;
  if (key === 'Enter' || key === 'ArrowDown' || key === 'ArrowUp')
    y += key === 'ArrowUp' || (key === 'Enter' && backwards) ? -1 : 1;
  else if (key === 'ArrowLeft' || key === 'ArrowRight') x += key === 'ArrowLeft' ? -1 : 1;
  else if (key === 'Tab') {
    x += backwards ? -1 : 1;
    if (x >= (grid[y]?.length || 0)) {
      y++;
      x = 0;
    } else if (x < 0) {
      y--;
      x = (grid[y]?.length || 0) - 1;
    }
  } else return null;
  // Skip unavailable historical station/shift cells, but never wrap an arrow.
  while (y >= 0 && y < grid.length && x >= 0 && x < grid[y].length) {
    if (grid[y][x] && !grid[y][x].disabled) return { row: y, column: x };
    if (key === 'Tab') return entryGridDestination(grid, y, x, key, backwards);
    if (key === 'ArrowLeft' || key === 'ArrowRight') x += key === 'ArrowLeft' ? -1 : 1;
    else y += key === 'ArrowUp' || (key === 'Enter' && backwards) ? -1 : 1;
  }
  return null;
}

export function entryTotal(slots, field) {
  const values = slots.map((slot) => slot[field]).filter((value) => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/** Production-date times use the application's Bangkok clock, including overnight slots. */
export function currentEntrySlot(context, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const days = (Date.parse(date) - Date.parse(context.date)) / 86400000;
  if (days < 0 || days > 1) return null;
  const minute = days * 1440 + Number(parts.hour) * 60 + Number(parts.minute);
  const time = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const anchor = time(context.config.schedules.day[0]?.start || '00:00');
  for (const shift of ['day', 'night']) {
    let previous = -1,
      offset = 0;
    for (const slot of context.config.schedules[shift]) {
      const clock = time(slot.start);
      if (previous < 0 && shift === 'night' && clock < anchor) offset = 1440;
      else if (clock < previous) offset += 1440;
      previous = clock;
      const start = clock + offset;
      let end = time(slot.end) + offset;
      if (end <= start) end += 1440;
      if (slot.kind === 'production' && minute >= start && minute < end)
        return { shift, id: slot.id };
    }
  }
  return null;
}

/**
 * Load the other shift once per production date/configuration. Request IDs keep
 * a slow response from a previous date from replacing the current full-day view.
 */
export function createEntryDayContextCache({ load, onChange = () => {} }) {
  let requestId = 0;
  let state = { key: '', context: null, loading: false, error: null };
  return {
    get: () => state,
    ensure(context) {
      const shift = context.shift === 'day' ? 'night' : 'day';
      const key = `${context.date}|${shift}|${context.config.version}`;
      if (state.key === key) return state;
      const request = ++requestId;
      state = { key, context: null, loading: true, error: null };
      Promise.resolve()
        .then(() => load(context.date, shift))
        .then((data) => {
          if (request !== requestId) return;
          if (data.configVersion !== context.config.version) {
            throw Object.assign(new Error('Production settings changed.'), {
              code: 'errConfigConflict',
            });
          }
          state = {
            key,
            loading: false,
            error: null,
            context: {
              ...context,
              shift,
              records: new Map(data.records.map((record) => [record.rowId, record])),
              defaults: data.defaults || {},
              rowVersions: data.rowVersions || {},
              loading: false,
            },
          };
          onChange();
        })
        .catch((error) => {
          if (request !== requestId) return;
          state = { key, context: null, loading: false, error };
          onChange();
        });
      return state;
    },
    clear() {
      requestId++;
      state = { key: '', context: null, loading: false, error: null };
    },
  };
}

const conflictCodes = new Set(['errConflict', 'errConfigConflict', 'errConfigChanged']);

/**
 * Writes are serialized per station, while different stations can save in parallel.
 * The acknowledged version feeds the next request. Edits made during a request
 * are rebased only against that same request's success, never against a conflict.
 * A conflict/network failure stops automatic retries and keeps the local draft.
 */
export function createEntryAutosaveQueue({
  save,
  onState = () => {},
  onSaved = () => {},
  delay = 650,
}) {
  const entries = new Map();
  let disposed = false;
  const dirty = (entry) => entryChanges(entry.baseline, entry.latest).length > 0;
  const notify = (entry) => onState(entry.key, entry);
  const clearTimer = (entry) => {
    clearTimeout(entry.timer);
    entry.timer = null;
  };
  const schedule = (entry) => {
    clearTimer(entry);
    if (disposed || entry.running || entry.error || entry.paused || !dirty(entry)) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void attempt(entry);
    }, delay);
  };

  async function attempt(entry) {
    clearTimer(entry);
    if (entry.running) return entry.running;
    if (disposed || entry.error || entry.paused || !dirty(entry)) return false;
    const sent = copy(entry.latest);
    const payload = {
      rowId: sent.rowId,
      date: sent.date,
      shift: sent.shift,
      version: sent.version,
      configVersion: sent.configVersion,
      entryMode: true,
      slots: entryChanges(entry.baseline, sent),
      editTargets: true,
    };
    entry.status = 'saving';
    entry.running = (async () => {
      try {
        // Defer the callback by a microtask: even a synchronous throw must happen
        // after entry.running has been assigned, otherwise flush could wait on a
        // completed promise that was accidentally left registered as in flight.
        const saved = await Promise.resolve().then(() => save(payload, entry.key));
        // Only edits made after dispatch remain pending after this acknowledgement.
        const newerChanges = entryChanges(sent, entry.latest);
        const acknowledged = {
          ...sent,
          ...copy(saved),
          date: sent.date,
          shift: sent.shift,
          configVersion: sent.configVersion,
        };
        entry.baseline = acknowledged;
        entry.latest = mergeEntryChanges(acknowledged, newerChanges);
        entry.error = null;
        entry.status = dirty(entry) ? 'pending' : 'saved';
        onSaved(saved, { key: entry.key, payload, hasNewerEdits: dirty(entry) });
        return true;
      } catch (error) {
        entry.error = error;
        entry.status = conflictCodes.has(error.code) || error.status === 409 ? 'conflict' : 'error';
        return false;
      } finally {
        entry.running = null;
        notify(entry);
        schedule(entry);
      }
    })();
    notify(entry);
    return entry.running;
  }

  return {
    ensure(key, payload) {
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          key,
          baseline: copy(payload),
          latest: copy(payload),
          status: payload.version ? 'saved' : 'waiting',
          error: null,
          timer: null,
          running: null,
          paused: false,
        };
        entries.set(key, entry);
      } else if (!dirty(entry) && !entry.running && !entry.error && !entry.paused) {
        entry.baseline = copy(payload);
        entry.latest = copy(payload);
        entry.status = payload.version ? 'saved' : 'waiting';
      }
      return entry;
    },
    get: (key) => entries.get(key),
    values: () => [...entries.values()],
    update(key, payload) {
      const entry = entries.get(key);
      if (!entry) throw new Error('Entry must be initialized before editing.');
      entry.latest = { ...copy(payload), version: entry.latest.version };
      if (!entry.error)
        entry.status = entry.running
          ? 'saving'
          : dirty(entry)
            ? 'pending'
            : entry.baseline.version
              ? 'saved'
              : 'waiting';
      notify(entry);
      schedule(entry);
    },
    pause(key, value) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.paused = value;
      if (value) clearTimer(entry);
      else schedule(entry);
      notify(entry);
    },
    retry(key) {
      const entry = entries.get(key);
      // A conflict needs an explicit review/rebase; a plain Retry may not overwrite it.
      if (!entry || entry.status === 'conflict') return false;
      entry.error = null;
      entry.status = 'pending';
      notify(entry);
      void attempt(entry);
      return true;
    },
    rebase(key, latest, keepChanges) {
      const entry = entries.get(key);
      if (!entry || entry.running) return false;
      const changes = keepChanges ? entryChanges(entry.baseline, entry.latest) : [];
      entry.baseline = copy(latest);
      entry.latest = mergeEntryChanges(latest, changes);
      entry.error = null;
      entry.status = dirty(entry) ? 'pending' : latest.version ? 'saved' : 'waiting';
      clearTimer(entry);
      notify(entry);
      return true;
    },
    async flush(key) {
      const selected =
        key === undefined ? [...entries.values()] : [entries.get(key)].filter(Boolean);
      await Promise.all(
        selected.map(async (entry) => {
          clearTimer(entry);
          // A user may continue typing during a request; drain those edits as well.
          while (entry.running || (!entry.error && !entry.paused && dirty(entry))) {
            await (entry.running || attempt(entry));
            clearTimer(entry);
          }
        }),
      );
      return selected.every((entry) => !entry.error && !entry.paused && !dirty(entry));
    },
    hasPendingChanges() {
      return [...entries.values()].some(
        (entry) => entry.running || entry.error || entry.paused || dirty(entry),
      );
    },
    destroy() {
      disposed = true;
      for (const entry of entries.values()) clearTimer(entry);
    },
  };
}

const htmlEscape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

/**
 * Mount an independent entry view. The host owns navigation and must await
 * canLeave() before changing report scope or discarding the view. render() is
 * safe during polling: dirty queue payloads and focused cell selections survive.
 */
/** Master-data pairs remain selectable even before their first station is
 * enabled. Saved historical row snapshots add their former pairs separately. */
export function entryProductionUnits(config, rows = []) {
  const units = new Map(productionUnits(config).map((unit) => [productionKey(unit), unit]));
  for (const row of rows)
    if (!units.has(productionKey(row)))
      units.set(productionKey(row), { line: row.line, model: modelOf(row) });
  return [...units.values()];
}

/** Explain an incomplete setup with a read-only interval preview. These fields
 * carry no queue IDs, so a missing station can never produce a phantom record. */
export function missingConfigurationMarkup({ config, units, esc, text, canConfigure = false }) {
  return units
    .map((unit) => {
      const slots = allocateDailyTarget(config, lineDailyTarget(config, unit.line, modelOf(unit)));
      return (
        '<section class="panel entry-setup-required" data-entry-setup-unit="' +
        esc(productionKey(unit)) +
        '"><h3>' +
        productionIdentityMarkup(unit, esc) +
        '</h3><p role="status">' +
        esc(text('configurationRequired')) +
        '</p>' +
        (canConfigure
          ? '<button type="button" class="button primary" data-entry-action="configure-unit" data-production-unit="' +
            esc(productionKey(unit)) +
            '">' +
            esc(text('configureStations')) +
            '</button>'
          : '<p>' + esc(text('askManagerConfiguration')) + '</p>') +
        '<p class="form-hint">' +
        esc(text('configurationPreview')) +
        '</p><div class="entry-setup-scroll"><table><thead><tr>' +
        ['interval', 'target', 'actual', 'issue']
          .map((key) => '<th>' + esc(text(key)) + '</th>')
          .join('') +
        '</tr></thead><tbody>' +
        slots
          .map(
            (slot) =>
              '<tr><th>' +
              esc(text(slot.shift)) +
              ' · ' +
              esc(slot.start) +
              '–' +
              esc(slot.end) +
              '</th><td>' +
              esc(slot.target ?? '—') +
              '</td><td><input type="number" disabled aria-label="' +
              esc(text('actual')) +
              '" placeholder="—"></td><td><textarea disabled rows="1" aria-label="' +
              esc(text('issue')) +
              '" placeholder="' +
              esc(text('configureStations')) +
              '"></textarea></td></tr>',
          )
          .join('') +
        '</tbody></table></div></section>'
      );
    })
    .join('');
}

export function createEntryController({
  mount,
  api,
  getContext,
  onSaved = () => {},
  onImported = () => {},
  onConfigure = () => {},
  onNavigate = async () => {},
  language = () => 'en',
  esc = htmlEscape,
  number = (value) => (value == null ? '—' : String(value)),
}) {
  if (typeof mount === 'string') mount = document.querySelector(mount);
  if (!mount) throw new Error('Production entry mount is missing.');
  const text = (key) => (messages[language()] || messages.en)[key] || messages.en[key] || key;
  const invalid = new Map();
  const reviewed = new Map();
  const localSaved = new Map();
  // Keep this editor outside the rerendered matrix. Background refreshes must
  // not destroy a note, reset its cursor or shift the table underneath it.
  const issueDialog = document.createElement('dialog');
  issueDialog.className = 'entry-issue-dialog';
  issueDialog.setAttribute('aria-labelledby', 'entry-issue-title');
  document.body.append(issueDialog);
  let issueEditor = null;
  const bulkDialog = document.createElement('dialog');
  bulkDialog.className = 'entry-bulk-dialog';
  bulkDialog.setAttribute('aria-labelledby', 'entry-bulk-title');
  document.body.append(bulkDialog);
  let bulkEditor = null;
  let bulkRequest = 0;
  let line = null,
    model = null,
    scope = '',
    banner = '',
    mode = 'day',
    selectedShift = '',
    selectedSlot = '',
    importRequest = 0,
    destroyed = false;
  let importState = {
    open: false,
    busy: false,
    preview: null,
    error: '',
    fileName: '',
    success: false,
    scope: null,
  };
  const keyFor = (context, rowId) => `${context.date}|${context.shift}|${rowId}`;
  const recordsFor = (context) =>
    context.records instanceof Map
      ? context.records
      : new Map((context.records || []).map((record) => [record.rowId, record]));
  const contextScope = (context) => `${context.date}|${context.shift}`;
  const savedFor = (context, rowId) => {
    const key = keyFor(context, rowId),
      local = localSaved.get(key),
      remote = recordsFor(context).get(rowId);
    // The local acknowledgement bridges a host rerender before its Map updates.
    // It must never hide a newer remote edit or a deletion tombstone afterwards.
    if (remote && (!local || remote.version >= local.version)) {
      localSaved.delete(key);
      return remote;
    }
    if (local && !remote && context.rowVersions?.[rowId] > local.version) {
      localSaved.delete(key);
      return undefined;
    }
    return local || remote;
  };

  function rowPayload(context, row) {
    const record = savedFor(context, row.id);
    const defaults = context.defaults?.[row.id] || {};
    const slots = new Map(
      (defaults.slots || []).map((slot) => [
        slot.id,
        { ...slot, actual: slot.actual ?? null, issue: '' },
      ]),
    );
    for (const slot of record?.slots || []) slots.set(slot.id, { ...slot });
    // A slow defaults request must not prevent entering the configured shift.
    for (const slot of context.config.schedules[context.shift].filter(
      (slot) => slot.kind === 'production',
    )) {
      if (!slots.has(slot.id))
        slots.set(slot.id, { ...slot, target: null, actual: null, issue: '' });
    }
    return {
      // A saved record owns its metadata. Inheriting today's directory here
      // could replace historical free-text staff with unrelated current people.
      ...copy(record || defaults),
      rowId: row.id,
      date: context.date,
      shift: context.shift,
      version: record?.version ?? context.rowVersions?.[row.id] ?? 0,
      configVersion: context.config.version,
      slots: [...slots.values()],
    };
  }

  function rowsFor(context) {
    const records = recordsFor(context);
    const rows = context.config.rows
      .filter((row) => row.active || records.has(row.id))
      .map((row) => records.get(row.id)?.rowSnapshot || row);
    for (const record of records.values()) {
      if (record.rowSnapshot && !rows.some((row) => row.id === record.rowId))
        rows.push(record.rowSnapshot);
    }
    return rows;
  }

  // The queue serializes each station independently and checks its revision.
  // A station edit never creates or changes a neighboring station's record.
  const queue = createEntryAutosaveQueue({
    save: (payload) =>
      api('/api/entry/records/' + payload.rowId, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, stationEntry: true }),
      }),
    onState: () => {
      if (!destroyed) updateStatuses();
    },
    onSaved: (saved, meta) => {
      const record = saved;
      localSaved.set(meta.key, record);
      reviewed.delete(meta.key);
      onSaved(record, meta);
      updateStatuses();
    },
  });
  const dayContext = createEntryDayContextCache({
    load: (date, shift) => api(`/api/records?${new URLSearchParams({ date, shift })}`),
    onChange: () => {
      if (!destroyed) render();
    },
  });

  function status(entry) {
    if (entry.paused) return { kind: 'invalid', label: text('invalidActual') };
    return { kind: entry.status, label: text(entry.status) };
  }

  function updateStatuses() {
    if (!mount.isConnected) return;
    for (const element of [
      ...mount.querySelectorAll('[data-entry-status]'),
      ...issueDialog.querySelectorAll('[data-entry-status]'),
    ]) {
      const entry = queue.get(element.dataset.entryStatus);
      if (!entry) continue;
      const value = status(entry);
      element.className = `entry-save-status entry-save-${value.kind}`;
      element.textContent = value.label;
      element.title = entry.error?.message || value.label;
    }
    // Include hidden rows/dates too: filtering must never conceal a blocked draft.
    const entries = queue.values();
    const pending = entries.filter(
      (entry) =>
        entry.running ||
        entry.error ||
        entry.paused ||
        entryChanges(entry.baseline, entry.latest).length,
    );
    const overall = mount.querySelector('[data-entry-overall]');
    if (overall)
      overall.textContent = pending.length
        ? `${text(entries.some((entry) => entry.paused) ? 'invalidActual' : entries.some((entry) => entry.status === 'conflict') ? 'conflict' : entries.some((entry) => entry.error) ? 'error' : entries.some((entry) => entry.running) ? 'saving' : 'pending')} (${pending.length})`
        : text(entries.length ? 'saved' : 'autosave');
    const saveButton = mount.querySelector('[data-entry-action="save-all"]');
    if (saveButton) saveButton.disabled = !pending.length;
    for (const input of [
      ...mount.querySelectorAll('[data-entry-field], [data-issue-cell]'),
      ...issueDialog.querySelectorAll('[data-entry-field]'),
    ]) {
      const entry = queue.get(input.dataset.rowKey);
      if (!entry) continue;
      const field = input.dataset.entryField || 'issue';
      const latest = entry.latest.slots.find((slot) => slot.id === input.dataset.slotId);
      const baseline = entry.baseline.slots.find((slot) => slot.id === input.dataset.slotId);
      const changed = slotValue(latest, field) !== slotValue(baseline, field);
      input.dataset.cellState = invalid.has(`${entry.key}|${input.dataset.slotId}|${field}`)
        ? 'invalid'
        : changed
          ? entry.status
          : 'saved';
      if (input.hasAttribute('data-issue-cell')) {
        const note = latest?.issue || '';
        input.classList.toggle('has-issue', !!note.trim());
        input.querySelector('[data-issue-preview]').textContent = note.trim()
          ? note.replace(/\s+/g, ' ').trim()
          : text('addIssue');
        input.title = note || text('addIssue');
      }
    }
    for (const element of mount.querySelectorAll('[data-entry-total]')) {
      const entry = queue.get(element.dataset.rowKey);
      if (entry)
        element.textContent = number(entryTotal(entry.latest.slots, element.dataset.entryTotal));
    }
    for (const element of mount.querySelectorAll('[data-entry-day-total]')) {
      if (Object.keys(contextsFor(getContext())).length < 2) {
        element.textContent = dayContext.get().error ? number(null) : text('loading');
        continue;
      }
      const slots = [element.dataset.dayKey, element.dataset.nightKey].flatMap(
        (key) => queue.get(key)?.latest.slots || [],
      );
      element.textContent = number(entryTotal(slots, element.dataset.entryDayField || 'target'));
    }
    // Errors can arise after the row was rendered, so expose recovery controls
    // without replacing inputs under a user's cursor.
    for (const row of mount.querySelectorAll('[data-entry-recovery-key]')) {
      const entry = queue.get(row.dataset.entryRecoveryKey);
      const actions = row.querySelector('.entry-recovery');
      if (!entry || !actions) continue;
      actions.hidden = !entry.error;
      const retry = actions.querySelector('[data-entry-action="retry"]');
      const review = actions.querySelector('[data-entry-action="review"]');
      retry.hidden = entry.status === 'conflict';
      review.hidden = false;
    }
    const editor = issueDialog.querySelector('textarea');
    const counter = issueDialog.querySelector('[data-issue-count]');
    if (editor && counter)
      counter.textContent = issueEditor?.limitReached
        ? text('issueLimit')
        : `${editor.value.length} / 2000`;
  }

  function currentFocus() {
    const element = document.activeElement;
    if (!mount.contains(element) || !element.dataset.entryField) return null;
    return {
      row: element.dataset.rowKey,
      slot: element.dataset.slotId,
      field: element.dataset.entryField,
      start: element.selectionStart,
      end: element.selectionEnd,
    };
  }

  function restoreFocus(focus) {
    if (!focus) return;
    const element = [...mount.querySelectorAll('[data-entry-field]')].find(
      (input) =>
        input.dataset.rowKey === focus.row &&
        input.dataset.slotId === focus.slot &&
        input.dataset.entryField === focus.field,
    );
    if (!element) return;
    element.focus({ preventScroll: true });
    if (focus.start !== null && typeof element.setSelectionRange === 'function')
      element.setSelectionRange(focus.start, focus.end);
  }

  function openIssue(button, returnField = null) {
    const key = button.dataset.rowKey;
    const entry = queue.get(key);
    const slot = entry?.latest.slots.find((item) => item.id === button.dataset.slotId);
    const row =
      entry?.latest.rowSnapshot ||
      getContext().config.rows.find((item) => item.id === entry?.latest.rowId);
    if (!entry || !slot || !row) return;
    issueEditor = { key, slotId: slot.id, returnField };
    issueDialog.innerHTML = `<div class="entry-issue-heading"><h2 id="entry-issue-title">${esc(text('issue'))}</h2><button type="button" class="icon-button" data-entry-action="close-issue" aria-label="${esc(text('close'))}"><span aria-hidden="true">×</span></button></div>
      <p class="entry-issue-context">${productionIdentityMarkup(row, esc)}<span>${esc(row.job || '—')} / ${esc(row.station || '—')}</span><span>${esc(entry.latest.date)} · ${esc(text(entry.latest.shift))} · ${esc(slot.start)}–${esc(slot.end)}</span></p>
      <div class="entry-issue-presets" aria-label="${esc(text('quickReasons'))}">${issuePresets(
        getContext().config,
      )
        .filter((item) => item.active)
        .map(
          (item) =>
            `<button type="button" class="button" data-entry-action="issue-preset" data-issue-preset="${esc(item.id)}">${esc(issueLabel(item))}</button>`,
        )
        .join('')}</div>
      <label class="entry-issue-field"><span>${esc(text('issueDetails'))}</span><textarea rows="4" maxlength="2000" data-entry-field="issue" data-row-key="${esc(key)}" data-slot-id="${esc(slot.id)}" aria-describedby="entry-issue-help">${esc(slot.issue || '')}</textarea></label>
      <div class="entry-issue-meta"><span data-entry-status="${esc(key)}" role="status"></span><span data-issue-count role="status"></span></div>
      <p id="entry-issue-help">${esc(text('issueHelp'))}</p><div class="entry-issue-footer"><button type="button" class="button" data-entry-action="clear-issue">${esc(text('clearIssue'))}</button><button type="button" class="button primary" data-entry-action="close-issue">${esc(text('done'))}</button></div>`;
    updateStatuses();
    issueDialog.showModal();
    const input = issueDialog.querySelector('textarea');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function closeIssue() {
    if (!issueEditor) return;
    const { key, slotId, returnField } = issueEditor;
    issueEditor = null;
    issueDialog.close();
    // Use the captured queue key, never a later selected line/date/shift.
    void queue.flush(key);
    const trigger = [
      ...mount.querySelectorAll(
        returnField ? `[data-entry-field="${returnField}"]` : '[data-issue-cell]',
      ),
    ].find((button) => button.dataset.rowKey === key && button.dataset.slotId === slotId);
    trigger?.focus({ preventScroll: true });
  }

  /** Drafts belong to a captured date/unit/interval. Applying fills the sheet;
   * saving commits only changed station cells in one version-checked request. */
  function bulkChanges(editor = bulkEditor) {
    let valid = true;
    const rows = (editor?.rows || []).flatMap((item) => {
      const values = {};
      for (const field of bulkFields) {
        const parsed = parseBulkValue(field, item.draft[field]);
        if (!parsed.valid) valid = false;
        else if (parsed.value !== slotValue(item.slot, field)) values[field] = parsed.value;
      }
      return Object.keys(values).length ? [{ rowId: item.row.id, values }] : [];
    });
    return { valid, rows };
  }

  function bulkHasChanges() {
    if (!bulkEditor) return false;
    return (
      !bulkChanges().valid ||
      bulkChanges().rows.length > 0 ||
      [...bulkDialog.querySelectorAll('[data-bulk-field]')].some(
        (input) => input.value.trim() !== '',
      )
    );
  }

  function renderBulkRows() {
    const editor = bulkEditor;
    bulkDialog.querySelector('[data-bulk-preview]').innerHTML = editor.rows.length
      ? `<table><thead><tr><th>${esc(text('job'))} / ${esc(text('station'))}</th>${bulkFields.map((field) => `<th>${esc(text(field))}</th>`).join('')}</tr></thead><tbody>${editor.rows.map((item) => `<tr data-bulk-row="${esc(item.row.id)}"><th scope="row"><strong>${esc(item.row.station || '—')}</strong><small>${esc(item.row.job || '—')}</small></th>${bulkFields.map((field) => `<td><input type="text" ${field === 'issue' ? '' : 'inputmode="numeric"'} autocomplete="off" maxlength="${field === 'issue' ? 2000 : 12}" data-bulk-cell="${field}" data-bulk-row-id="${esc(item.row.id)}" aria-label="${esc((item.row.station || item.row.job || '') + ' · ' + text(field))}" title="${esc(item.draft[field])}" value="${esc(item.draft[field])}"></td>`).join('')}</tr>`).join('')}</tbody></table>`
      : '';
  }

  function updateBulkControls() {
    const editor = bulkEditor;
    if (!editor) return;
    const locked = editor.busy || editor.loading;
    for (const input of bulkDialog.querySelectorAll('input, select')) input.disabled = locked;
    for (const input of bulkDialog.querySelectorAll('[data-bulk-field], [data-bulk-cell]')) {
      const parsed = parseBulkValue(input.dataset.bulkCell || input.dataset.bulkField, input.value);
      input.toggleAttribute('aria-invalid', !parsed.valid);
      if (!parsed.valid) input.setAttribute('aria-invalid', 'true');
    }
    for (const button of bulkDialog.querySelectorAll('[data-entry-action="bulk-apply"]')) {
      const input = bulkDialog.querySelector(
        `[data-bulk-field="${button.dataset.bulkApplyField}"]`,
      );
      button.disabled =
        locked ||
        !editor.rows.length ||
        !parseBulkValue(input.dataset.bulkField, input.value).valid ||
        input.value.trim() === '';
    }
    const save = bulkDialog.querySelector('[data-entry-action="bulk-save"]');
    const validBars = [...bulkDialog.querySelectorAll('[data-bulk-field]')].every(
      (input) => parseBulkValue(input.dataset.bulkField, input.value).valid,
    );
    save.disabled =
      locked || editor.needsRefresh || !editor.rows.length || !bulkChanges().valid || !validBars;
    save.textContent = text(editor.busy ? 'saving' : 'saveNow');
    bulkDialog.querySelector('[data-bulk-status]').textContent = text(
      editor.busy ? 'saving' : editor.loading ? 'loading' : bulkHasChanges() ? 'pending' : 'saved',
    );
    bulkDialog.querySelector('[data-entry-action="bulk-close"]').disabled = editor.busy;
    const refresh = bulkDialog.querySelector('[data-entry-action="bulk-refresh"]');
    refresh.disabled = locked;
    refresh.hidden = !editor.needsRefresh;
  }

  function bulkIntervals(unit, reports) {
    const config = getContext().config;
    return ['day', 'night']
      .flatMap((shift) => {
        const slots = config.schedules[shift].filter((slot) => slot.kind === 'production');
        for (const record of reports?.[shift]?.records || []) {
          const row = record.rowSnapshot || config.rows.find((row) => row.id === record.rowId);
          if (!row || !sameProduction(row, unit) || !stationHasOutput(row, config)) continue;
          slots.push(...record.slots.filter((slot) => slot.kind !== 'break'));
        }
        return slots.map((slot) => ({ ...slot, shift }));
      })
      .filter(
        (slot, index, all) =>
          all.findIndex(
            (other) =>
              other.shift === slot.shift && other.start === slot.start && other.end === slot.end,
          ) === index,
      );
  }

  function bulkScopeControls() {
    const editor = bulkEditor;
    const units = productionUnits(getContext().config);
    bulkDialog.querySelector('[data-bulk-date]').value = editor.date;
    bulkDialog.querySelector('[data-bulk-line]').value = editor.unit.line;
    bulkDialog.querySelector('[data-bulk-model]').innerHTML = units
      .filter((unit) => unit.line === editor.unit.line)
      .map(
        (unit) =>
          `<option value="${esc(unit.model)}" ${unit.model === editor.unit.model ? 'selected' : ''}>${esc(unit.model)}</option>`,
      )
      .join('');
  }

  function loadBulkPreview() {
    const editor = bulkEditor;
    if (!editor || editor.busy) return Promise.resolve(false);
    const request = ++bulkRequest;
    // A refreshed baseline retains only cells changed in this dialog, allowing
    // concurrent edits to untouched fields (including issues) to survive.
    const drafts = new Map(
      (editor.rows || []).map((item) => [
        item.row.id,
        Object.fromEntries(
          bulkFields
            .filter((field) => {
              const parsed = parseBulkValue(field, item.draft[field]);
              return !parsed.valid || parsed.value !== slotValue(item.slot, field);
            })
            .map((field) => [field, item.draft[field]]),
        ),
      ]),
    );
    editor.loading = true;
    bulkDialog.querySelector('[data-bulk-error]').textContent = '';
    updateBulkControls();
    const work = (async () => {
      try {
        const responses = await Promise.all(
          ['day', 'night'].map(async (shift) => [
            shift,
            await api(`/api/records?${new URLSearchParams({ date: editor.date, shift })}`),
          ]),
        );
        if (bulkEditor !== editor || request !== bulkRequest) return false;
        const reports = Object.fromEntries(responses);
        const config = getContext().config;
        if (responses.some(([, data]) => data.configVersion !== config.version))
          throw new Error(text('configChanged'));
        editor.configVersion = config.version;
        const options = bulkIntervals(editor.unit, reports);
        const selected =
          options.find(
            (slot) =>
              slot.shift === editor.shift &&
              slot.start === editor.interval?.start &&
              slot.end === editor.interval?.end,
          ) ||
          options.find((slot) => slot.shift === editor.shift) ||
          options[0];
        bulkDialog.querySelector('[data-bulk-slot]').innerHTML = options
          .map(
            (slot) =>
              `<option value="${esc(JSON.stringify([slot.shift, slot.start, slot.end]))}" ${slot === selected ? 'selected' : ''}>${esc(text(slot.shift))} · ${esc(slot.start)}–${esc(slot.end)}</option>`,
          )
          .join('');
        if (!selected) throw new Error(text('noSlot'));
        editor.shift = selected.shift;
        editor.interval = { start: selected.start, end: selected.end };
        editor.slotId = selected.id;
        const data = reports[editor.shift];
        const saved = new Map(data.records.map((record) => [record.rowId, record]));
        const rows = config.rows.filter(
          (row) =>
            row.active && !row.deleted && stationHasOutput(row) && sameProduction(row, editor.unit),
        );
        if (!rows.length) throw new Error(text('bulkNoOutput'));
        const next = rows.map((row) => {
          const record = saved.get(row.id) || data.defaults?.[row.id];
          const matches = (record?.slots || []).filter(
            (slot) => slot.start === editor.interval.start && slot.end === editor.interval.end,
          );
          const slot = matches.length === 1 ? matches[0] : null;
          return {
            row,
            slot,
            version: saved.get(row.id)?.version ?? data.rowVersions?.[row.id] ?? 0,
            draft: {
              target: String(slot?.target ?? ''),
              actual: String(slot?.actual ?? ''),
              issue: slot?.issue || '',
              ...drafts.get(row.id),
            },
          };
        });
        if (next.some((item) => !item.slot)) throw new Error(text('bulkNoInterval'));
        editor.rows = next;
        editor.needsRefresh = false;
        renderBulkRows();
        return true;
      } catch (error) {
        if (bulkEditor === editor && request === bulkRequest) {
          editor.needsRefresh = true;
          bulkDialog.querySelector('[data-bulk-error]').textContent =
            error.message || text('network');
          if (!editor.rows.length) renderBulkRows();
        }
        return false;
      } finally {
        if (bulkEditor === editor && request === bulkRequest) {
          editor.loading = false;
          updateBulkControls();
        }
      }
    })();
    editor.loadPromise = work;
    return work;
  }

  function applyBulk(field) {
    const editor = bulkEditor;
    if (!editor || editor.busy || editor.loading || !editor.rows.length) return false;
    const fields = field ? [field] : bulkFields;
    const inputs = fields.map((name) => bulkDialog.querySelector(`[data-bulk-field="${name}"]`));
    if (inputs.some((input) => !parseBulkValue(input.dataset.bulkField, input.value).valid)) {
      updateBulkControls();
      return false;
    }
    for (const input of inputs) {
      if (input.value.trim() === '') continue;
      for (const row of editor.rows) row.draft[input.dataset.bulkField] = input.value.trim();
      input.value = '';
    }
    renderBulkRows();
    updateBulkControls();
    return true;
  }

  function saveBulk() {
    const editor = bulkEditor;
    if (!editor) return Promise.resolve(true);
    if (editor.savePromise) return editor.savePromise;
    const work = (async () => {
      if (editor.loading) await editor.loadPromise;
      if (bulkEditor !== editor) return false;
      if (!bulkHasChanges()) return true;
      if (editor.needsRefresh || !applyBulk()) return false;
      const changes = bulkChanges(editor);
      if (!changes.valid) {
        updateBulkControls();
        return false;
      }
      if (!changes.rows.length) return true;
      editor.busy = true;
      bulkDialog.querySelector('[data-bulk-error]').textContent = '';
      updateBulkControls();
      try {
        const result = await api('/api/entry/interval', {
          method: 'PUT',
          body: JSON.stringify({
            ...editor.unit,
            date: editor.date,
            shift: editor.shift,
            interval: editor.interval,
            configVersion: editor.configVersion,
            rows: changes.rows,
            expectedVersions: changes.rows.map((change) => ({
              rowId: change.rowId,
              version: editor.rows.find((row) => row.row.id === change.rowId).version,
            })),
          }),
        });
        if (destroyed || bulkEditor !== editor) return false;
        for (const record of result.records) {
          const key = `${editor.date}|${editor.shift}|${record.rowId}`;
          const saved = {
            ...record,
            date: editor.date,
            shift: editor.shift,
            configVersion: result.configVersion,
          };
          localSaved.set(key, saved);
          queue.ensure(key, saved);
          queue.rebase(key, saved, false);
          reviewed.delete(key);
          onSaved(saved, { key, bulk: true });
          const row = editor.rows.find((item) => item.row.id === record.rowId);
          row.slot = record.slots.find(
            (slot) => slot.start === editor.interval.start && slot.end === editor.interval.end,
          );
          row.version = record.version;
          row.draft = {
            target: String(row.slot.target ?? ''),
            actual: String(row.slot.actual ?? ''),
            issue: row.slot.issue || '',
          };
        }
        renderBulkRows();
        render();
        return true;
      } catch (error) {
        editor.needsRefresh = true;
        bulkDialog.querySelector('[data-bulk-error]').textContent = text(
          conflictCodes.has(error.code) ? 'bulkConflict' : 'bulkReview',
        );
        return false;
      } finally {
        editor.busy = false;
        updateBulkControls();
      }
    })();
    editor.savePromise = work;
    void work.finally(() => {
      if (editor.savePromise === work) editor.savePromise = null;
    });
    return work;
  }

  /** Bulk sheets accept adjacent Target/Actual columns, or a one-column list
   * alternating Target then Actual. Validate the full paste before any edit. */
  function pasteBulk(event) {
    const input = event.target.closest('[data-bulk-cell]');
    const editor = bulkEditor;
    if (
      !input ||
      input.dataset.bulkCell === 'issue' ||
      !editor ||
      editor.busy ||
      editor.loading ||
      !event.clipboardData
    )
      return;
    event.preventDefault();
    const cells = event.clipboardData
      .getData('text/plain')
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .split('\n')
      .map((row) => row.split('\t'));
    const width = cells[0].length;
    const start = editor.rows.findIndex((row) => String(row.row.id) === input.dataset.bulkRowId);
    const edits = [];
    if (width > 2 || cells.some((row) => row.length !== width)) {
      bulkDialog.querySelector('[data-bulk-error]').textContent = text('invalidPaste');
      return;
    }
    for (let y = 0; y < cells.length; y++)
      for (let x = 0; x < width; x++) {
        const index = start + (width === 1 && cells.length > 1 ? Math.floor(y / 2) : y);
        const field =
          width === 2
            ? ['target', 'actual'][x]
            : cells.length > 1
              ? y % 2
                ? 'actual'
                : 'target'
              : input.dataset.bulkCell;
        const parsed = parseEntryActual(cells[y][x]);
        if (!editor.rows[index] || !parsed.valid) {
          bulkDialog.querySelector('[data-bulk-error]').textContent = text('invalidPaste');
          return;
        }
        edits.push({ index, field, value: cells[y][x].trim() });
      }
    for (const edit of edits) editor.rows[edit.index].draft[edit.field] = edit.value;
    bulkDialog.querySelector('[data-bulk-error]').textContent = '';
    renderBulkRows();
    updateBulkControls();
    bulkDialog
      .querySelector(
        `[data-bulk-row-id="${input.dataset.bulkRowId}"][data-bulk-cell="${input.dataset.bulkCell}"]`,
      )
      ?.focus();
  }

  async function updateBulkScope() {
    const editor = bulkEditor;
    if (!editor || editor.busy || editor.loading || editor.changing) return;
    const date = bulkDialog.querySelector('[data-bulk-date]').value;
    const nextLine = bulkDialog.querySelector('[data-bulk-line]').value;
    const models = productionUnits(getContext().config)
      .filter((unit) => unit.line === nextLine)
      .map(modelOf);
    const chosen = bulkDialog.querySelector('[data-bulk-model]').value;
    const model = models.includes(chosen) ? chosen : models[0];
    const interval = JSON.parse(bulkDialog.querySelector('[data-bulk-slot]').value || 'null');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    ) {
      bulkScopeControls();
      bulkDialog.querySelector('[data-bulk-error]').textContent = text('bulkDateInvalid');
      return;
    }
    editor.changing = true;
    if (!(await saveBulk())) {
      bulkScopeControls();
      bulkDialog.querySelector('[data-bulk-slot]').value = JSON.stringify([
        editor.shift,
        editor.interval.start,
        editor.interval.end,
      ]);
      editor.changing = false;
      return;
    }
    editor.date = date;
    editor.unit = { line: nextLine, model };
    if (interval) {
      editor.shift = interval[0];
      editor.interval = { start: interval[1], end: interval[2] };
    }
    editor.rows = [];
    editor.needsRefresh = false;
    bulkScopeControls();
    renderBulkRows();
    await loadBulkPreview();
    editor.changing = false;
  }

  async function openBulk(button) {
    const context = getContext();
    const capturedScope = contextScope(context);
    const [line, model] = JSON.parse(button.dataset.bulkUnit);
    if (!(await queue.flush()) || invalid.size) return setBanner(text('bulkPending'));
    if (destroyed || capturedScope !== contextScope(getContext()) || bulkEditor) return;
    bulkEditor = {
      unit: { line, model },
      date: context.date,
      openingDate: context.date,
      configVersion: context.config.version,
      shift: selectedShift || context.shift,
      interval: null,
      busy: false,
      loading: false,
      needsRefresh: false,
      rows: [],
    };
    const units = productionUnits(context.config);
    const lines = [...new Set(units.map((unit) => unit.line))];
    bulkDialog.innerHTML = `<div class="entry-issue-heading"><h2 id="entry-bulk-title">${esc(text('bulkTitle'))}</h2><button type="button" class="icon-button" data-entry-action="bulk-close" aria-label="${esc(text('close'))}">×</button></div>
      <div class="entry-bulk-selectors"><label>${esc(text('productionDate'))}<input type="date" data-bulk-date value="${esc(context.date)}"></label><label>${esc(text('line'))}<select data-bulk-line>${lines.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select></label><label>${esc(text('bulkProduct'))}<select data-bulk-model></select></label><label>${esc(text('interval'))}<select data-bulk-slot></select></label></div>
      <div class="entry-bulk-values">${bulkFields.map((field) => `<div><label>${esc(text(field))}<input type="text" ${field === 'issue' ? '' : 'inputmode="numeric"'} maxlength="${field === 'issue' ? 2000 : 12}" autocomplete="off" data-bulk-field="${field}" aria-label="${esc(text(field))}"></label><button type="button" class="button" data-entry-action="bulk-apply" data-bulk-apply-field="${field}">${esc(text(field === 'target' ? 'bulkApplyTarget' : field === 'actual' ? 'bulkApplyActual' : 'bulkApplyIssue'))}</button></div>`).join('')}</div>
      <div class="entry-bulk-quick-text">${issuePresets(context.config).filter((item) => item.active).map((item) => `<button type="button" class="button" data-entry-action="bulk-issue-preset" data-issue-preset="${esc(item.id)}">${esc(issueLabel(item))}</button>`).join('')}</div>
      <div class="entry-bulk-preview" data-bulk-preview></div><p class="entry-error" data-bulk-error role="alert"></p><div class="entry-bulk-actions"><span data-bulk-status role="status"></span><div><button type="button" class="button" data-entry-action="bulk-refresh" hidden>${esc(text('bulkRefresh'))}</button><button type="button" class="button primary" data-entry-action="bulk-save">${esc(text('saveNow'))}</button></div></div>`;
    bulkScopeControls();
    bulkDialog.showModal();
    void loadBulkPreview();
  }

  async function closeBulk(navigate = true) {
    const editor = bulkEditor;
    if (!editor) return true;
    if (editor.closing) return false;
    editor.closing = true;
    if (!(await saveBulk())) {
      editor.closing = false;
      return false;
    }
    const destination = { ...editor.unit, date: editor.date, shift: editor.shift };
    bulkEditor = null;
    bulkRequest++;
    bulkDialog.close();
    // Change the host date first, then select the destination after its contexts
    // have loaded; a new-date render must not reset the chosen line/model.
    if (navigate && getContext().date === editor.openingDate) {
      await onNavigate(destination);
      line = editor.unit.line;
      model = editor.unit.model;
      selectedShift = editor.shift;
      selectedSlot = editor.slotId || '';
      render();
      const scroller = mount.querySelector('.entry-matrix-scroll');
      if (scroller) scroller.scrollLeft = 0;
    }
    [...mount.querySelectorAll('[data-bulk-unit]')]
      .find((button) => button.dataset.bulkUnit === productionKey(editor.unit))
      ?.focus({ preventScroll: true });
    return true;
  }

  function editIssue(action, preset) {
    const input = issueDialog.querySelector('textarea');
    if (!issueEditor || !input) return;
    if (action === 'clear-issue') input.value = '';
    else {
      const item = issuePresets(getContext().config).find(
        (item) => item.id === preset && item.active,
      );
      if (!item) return;
      const prefix =
        input.selectionStart && !/\s$/.test(input.value.slice(0, input.selectionStart)) ? '\n' : '';
      const insertion = prefix + issueLabel(item) + ': ';
      if (
        input.value.length - (input.selectionEnd - input.selectionStart) + insertion.length >
        2000
      ) {
        issueEditor.limitReached = true;
        issueDialog.querySelector('[data-issue-count]').textContent = text('issueLimit');
        input.focus();
        return;
      }
      input.setRangeText(insertion, input.selectionStart, input.selectionEnd, 'end');
    }
    onInput({ target: input });
    input.focus();
  }

  function reviewMarkup(key) {
    const latest = reviewed.get(key),
      entry = queue.get(key);
    if (!latest || !entry) return '';
    const byId = new Map(latest.slots.map((slot) => [slot.id, slot]));
    const changes = entryChanges(entry.baseline, entry.latest);
    return `<section class="entry-conflict-review"><h4>${esc(text('latest'))}</h4><p>${esc(text('overwrite'))}</p><ul>${changes
      .flatMap((change) =>
        Object.keys(change)
          .filter((field) => field !== 'id')
          .map((field) => {
            const slot = byId.get(change.id);
            return `<li><strong>${esc(slot?.start || change.id)} · ${esc(text(field))}</strong><span>${esc(text('latest'))}: ${esc(slotValue(slot, field) ?? text('emptyValue'))}</span><span>${esc(text('mine'))}: ${esc(change[field] ?? text('emptyValue'))}</span></li>`;
          }),
      )
      .join(
        '',
      )}</ul><div class="entry-recovery-actions"><button class="button" data-entry-action="use-latest" data-row-key="${esc(key)}">${esc(text('useLatest'))}</button><button class="button primary" data-entry-action="save-mine" data-row-key="${esc(key)}">${esc(text('saveMine'))}</button></div></section>`;
  }

  function contextsFor(context) {
    const extra = dayContext.get().context;
    return { [context.shift]: context, ...(extra ? { [extra.shift]: extra } : {}) };
  }

  function intervalsFor(context, rows) {
    const slots = new Map(
      context.config.schedules[context.shift]
        .filter((slot) => slot.kind === 'production')
        .map((slot) => [slot.id, slot]),
    );
    for (const row of rows) {
      const record = queue.get(keyFor(context, row.id))?.latest || rowPayload(context, row);
      for (const slot of record.slots) if (!slots.has(slot.id)) slots.set(slot.id, slot);
    }
    return [...slots.values()];
  }

  function shiftPicker(context) {
    const contexts = contextsFor(context);
    return `<div class="entry-interval-picker" aria-label="${esc(text('interval'))}">${[
      'day',
      'night',
    ]
      .map((shift) => {
        if (!contexts[shift])
          return `<span role="status">${esc(text(shift))} · ${esc(text('loading'))}</span>`;
        if (mode !== 'sheet')
          return `<button type="button" class="button ${mode === 'shift' && selectedShift === shift ? 'selected' : ''}" data-entry-select-shift="${shift}">${esc(text(shift))}</button>`;
        return intervalsFor(contexts[shift], rowsFor(contexts[shift]))
          .map(
            (slot) =>
              `<button type="button" class="button ${selectedShift === shift && selectedSlot === slot.id ? 'selected' : ''}" data-entry-shift-slot="${esc(slot.id)}" data-slot-shift="${shift}">${esc(text(shift))} · ${esc(slot.start)}–${esc(slot.end)}</button>`,
          )
          .join('');
      })
      .join('')}</div>`;
  }

  function recoveryMarkup(key) {
    return `<span data-entry-status="${esc(key)}" role="status"></span><div data-entry-recovery-key="${esc(key)}"><div class="entry-recovery" hidden><button class="button" data-entry-action="retry" data-row-key="${esc(key)}">${esc(text('retry'))}</button><button class="button" data-entry-action="review" data-row-key="${esc(key)}">${esc(text('review'))}</button><button class="button" data-entry-action="discard" data-row-key="${esc(key)}">${esc(text('discard'))}</button></div></div>`;
  }

  /** Non-output stations remain in their saved order without writable cells or
   * autosave queues. Existing reports are expandable, never cleared or reseeded. */
  function noOutputRow(row, columns, contexts) {
    const history = Object.entries(contexts)
      .flatMap(([shift, ctx]) => {
        const record = savedFor(ctx, row.id);
        return (record?.slots || [])
          .filter((slot) => slot.target != null || slot.actual != null || slot.issue)
          .map(
            (slot) =>
              `<p><strong>${esc(text(shift))} · ${esc(slot.start)}–${esc(slot.end)}</strong><span>${esc(text('target'))}: ${esc(number(slot.target))} · ${esc(text('actual'))}: ${esc(number(slot.actual))}</span>${slot.issue ? `<span class="entry-history-issue">${esc(slot.issue)}</span>` : ''}</p>`,
          );
      })
      .join('');
    return `<tr data-entry-row="${esc(row.id)}" data-entry-station-row="${esc(row.id)}" data-entry-no-output><th scope="row" class="entry-matrix-station"><strong>${esc(row.station || row.job || '—')}</strong><small>${esc(row.job || '')}</small></th><td colspan="${Math.max(1, columns.length)}" class="entry-no-output-cell"><div class="entry-no-output-content"><strong>${esc(text('noOutput'))}</strong><span>${esc(text('noOutputHint'))}</span>${history ? `<details class="entry-no-output-history"><summary>${esc(text('savedHistory'))}</summary>${history}</details>` : ''}</div></td></tr>`;
  }

  function stationSummary(entries, preset) {
    return `<div class="entry-station-totals entry-matrix-summary" title="${esc(text('defaultTarget') + ': ' + number(preset))}"><div class="entry-summary-labels"><span></span><span>${esc(text('target'))}</span><span>${esc(text('actual'))}</span></div>${['day', 'night'].map((shift) => `<div><span>${esc(text(shift))}</span>${['target', 'actual'].map((field) => `<b data-entry-total="${field}" data-row-key="${esc(entries[shift]?.key || '')}">—</b>`).join('')}</div>`).join('')}<div class="entry-summary-day"><span>${esc(text('total'))}</span>${['target', 'actual'].map((field) => `<b data-entry-day-total data-entry-day-field="${field}" data-day-key="${esc(entries.day?.key || '')}" data-night-key="${esc(entries.night?.key || '')}">—</b>`).join('')}</div></div><div class="entry-station-recovery">${['day', 'night'].map((shift) => (entries[shift] ? recoveryMarkup(entries[shift].key) : '')).join('')}</div>`;
  }

  function bulkLaunch(unit) {
    return unit
      ? `<button type="button" class="button primary entry-bulk-launch" data-bulk-global data-entry-action="bulk-open" data-bulk-unit="${esc(productionKey(unit))}"><span aria-hidden="true">▦</span>${esc(text('bulkOpen'))}</button>`
      : '';
  }

  /** One stationary command area for shifts, entry, templates and imports.
   * The wide station grid scrolls independently below these controls. */
  function sheetTools(context, unit) {
    const contexts = contextsFor(context);
    const currentUnit =
      unit ||
      productionUnits(context.config).find(
        (unit) => (!line || unit.line === line) && (!model || modelOf(unit) === model),
      ) ||
      productionUnits(context.config)[0];
    const excel = `<details class="entry-import-scope"><summary class="button">Excel</summary><div class="entry-excel-menu">${[
      'all',
      'day',
      'night',
    ]
      .map((shift) => {
        const ready =
          (shift === 'all' ? contexts.day && contexts.night : contexts[shift]) &&
          Object.values(contexts).some((ctx) =>
            rowsFor(ctx).some((row) => stationHasOutput(row, context.config)),
          );
        return `<div><strong>${esc(text(shift === 'all' ? 'wholeDay' : shift))}</strong><button type="button" class="button" data-entry-action="template" data-import-shift="${shift}" ${!ready || importState.busy ? 'disabled' : ''}>${esc(text('template'))}</button><button type="button" class="button" data-entry-action="open-import" data-import-shift="${shift}" ${!ready || importState.busy ? 'disabled' : ''}>${esc(text('importExcel'))}</button></div>`;
      })
      .join('')}</div></details>`;
    return `<div class="entry-sheet-tools"><div class="entry-sheet-primary">${bulkLaunch(currentUnit)}<div class="entry-sheet-identity">${unit ? productionIdentityMarkup(unit, esc, { singleLine: true }) : `<strong>${esc(line || text('allLines'))}</strong><span>${esc(model || text('allModels'))}</span>`}</div></div><div class="entry-sheet-actions">${shiftPicker(context)}<button type="button" class="button" data-entry-action="current-slot">${esc(text('currentSlot'))}</button>${excel}<button type="button" class="button" data-entry-action="save-all">${esc(text('saveNow'))}</button><span data-entry-overall role="status"></span></div></div>`;
  }

  /** One row per station across the full production day. The line daily preset
   * seeds every station; edits and totals belong only to that station and date. */
  function unifiedMarkup(context, visible) {
    const contexts = contextsFor(context);
    const shifts = mode === 'day' ? ['day', 'night'] : [selectedShift];
    if (mode === 'sheet' && contexts[selectedShift]) {
      const available = intervalsFor(contexts[selectedShift], rowsFor(contexts[selectedShift]));
      if (!available.some((slot) => slot.id === selectedSlot))
        selectedSlot = available[0]?.id || '';
    }
    const columns = shifts.flatMap((shift) =>
      contexts[shift]
        ? intervalsFor(contexts[shift], rowsFor(contexts[shift]))
            .filter((slot) => mode !== 'sheet' || slot.id === selectedSlot)
            .map((slot) => ({ shift, slot }))
        : [],
    );
    const units = [...new Map(visible.map((row) => [productionKey(row), row])).values()];
    const current = currentEntrySlot(context);
    const body = units
      .map((unit) => {
        const stations = visible.filter((row) => sameProduction(row, unit));
        const rows = stations
          .map((row) => {
            if (!stationHasOutput(row, context.config)) return noOutputRow(row, columns, contexts);
            const rowIndex = visible
              .filter((row) => stationHasOutput(row, context.config))
              .indexOf(row);
            const entries = Object.fromEntries(
              ['day', 'night'].map((shift) => {
                const ctx = contexts[shift];
                if (!ctx || !rowsFor(ctx).some((item) => item.id === row.id)) return [shift, null];
                const key = keyFor(ctx, row.id);
                return [shift, { key, entry: queue.ensure(key, rowPayload(ctx, row)) }];
              }),
            );
            const captured =
              entries.day?.entry.latest.defaultsSnapshot ||
              entries.night?.entry.latest.defaultsSnapshot;
            const original =
              captured || entries.day?.entry.latest || entries.night?.entry.latest || {};
            const preset = Object.hasOwn(original, 'sourceDailyTarget')
              ? original.sourceDailyTarget
              : lineDailyTarget(context.config, row.line, modelOf(row));
            const cells = columns
              .map(({ shift, slot: header }, columnIndex) => {
                const item = entries[shift];
                const slot = item?.entry.latest.slots.find((slot) => slot.id === header.id);
                if (!slot) return '<td class="entry-matrix-unavailable">—</td>';
                const fields = ['target', 'actual']
                  .map((field) => {
                    const label =
                      productionLabel(row) +
                      ' · ' +
                      (row.station || row.job) +
                      ' · ' +
                      text(shift) +
                      ' ' +
                      slot.start +
                      '–' +
                      slot.end +
                      ' ' +
                      text(field);
                    const attributes =
                      ' data-entry-field="' +
                      field +
                      '" data-row-key="' +
                      esc(item.key) +
                      '" data-slot-id="' +
                      esc(slot.id) +
                      '" data-grid-row="' +
                      rowIndex +
                      '" data-grid-column="' +
                      columnIndex +
                      '" aria-label="' +
                      esc(label) +
                      '"';
                    const raw = invalid.get(item.key + '|' + slot.id + '|' + field);
                    return (
                      '<label><span>' +
                      esc(text(field)) +
                      '</span><input type="text" inputmode="numeric" autocomplete="off" maxlength="12"' +
                      attributes +
                      ' value="' +
                      esc(raw ?? slot[field] ?? '') +
                      '" ' +
                      (raw === undefined ? '' : 'aria-invalid="true"') +
                      '></label>'
                    );
                  })
                  .join('');
                return (
                  '<td class="entry-matrix-cell entry-station-values ' +
                  (current?.shift === shift && current.id === slot.id ? 'entry-current-slot' : '') +
                  '">' +
                  '<div class="entry-count-pair">' +
                  fields +
                  '</div>' +
                  '<button type="button" class="entry-issue-button" data-entry-action="edit-issue" data-issue-cell data-row-key="' +
                  esc(item.key) +
                  '" data-slot-id="' +
                  esc(slot.id) +
                  '" aria-label="' +
                  esc(
                    productionLabel(row) +
                      ' · ' +
                      (row.job || '') +
                      ' / ' +
                      (row.station || '') +
                      ' · ' +
                      text(shift) +
                      ' ' +
                      slot.start +
                      '–' +
                      slot.end +
                      ' · ' +
                      text('issue'),
                  ) +
                  '"><span aria-hidden="true">＋</span><span data-issue-preview></span></button>' +
                  '</td>'
                );
              })
              .join('');
            return (
              '<tr data-entry-row="' +
              esc(row.id) +
              '" data-entry-station-row="' +
              esc(row.id) +
              '"><th scope="row" class="entry-matrix-station"><strong>' +
              esc(row.station || row.job || '—') +
              '</strong><small>' +
              esc(row.job || '') +
              '</small>' +
              stationSummary(entries, preset) +
              '</th>' +
              cells +
              '</tr>'
            );
          })
          .join('');
        return (
          '<tbody data-entry-line-group="' +
          esc(unit.line) +
          '" data-entry-model="' +
          esc(modelOf(unit)) +
          '">' +
          (units.length > 1
            ? '<tr class="entry-line-row" data-line-summary-row="' +
              esc(unit.line) +
              '"><th colspan="' +
              (columns.length + 1) +
              '">' +
              '<div class="entry-unit-heading">' +
              productionIdentityMarkup(unit, esc, { singleLine: true }) +
              '</div>' +
              '</th></tr>'
            : '') +
          rows +
          '</tbody>'
        );
      })
      .join('');
    const extra = dayContext.get();
    const notice = extra.error
      ? '<div class="entry-day-load-error"><p>' +
        esc(extra.error.message || text('network')) +
        '</p><button class="button" data-entry-action="reload-day">' +
        esc(text('retryLoad')) +
        '</button></div>'
      : !extra.context
        ? '<p role="status">' + esc(text('loading')) + '</p>'
        : '';
    return (
      '<section class="panel entry-day-sheet entry-unified">' +
      sheetTools(context, units.length === 1 ? units[0] : null) +
      notice +
      '<p class="entry-grid-help">' +
      esc(text('pasteHint')) +
      '</p><div class="entry-matrix-scroll" tabindex="0" role="region" aria-label="' +
      esc(text('dayMode')) +
      '"><table class="entry-matrix" data-entry-grid data-grid-width="' +
      columns.length +
      '" data-grid-height="' +
      visible.filter((row) => stationHasOutput(row, context.config)).length +
      '"><thead><tr><th rowspan="2" scope="col" class="entry-matrix-station">' +
      esc(text('station')) +
      '</th>' +
      shifts
        .filter((shift) => columns.some((col) => col.shift === shift))
        .map(
          (shift) =>
            '<th colspan="' +
            columns.filter((col) => col.shift === shift).length +
            '" scope="colgroup" class="entry-shift-' +
            shift +
            '">' +
            esc(text(shift)) +
            ' · ' +
            esc(context.date) +
            '</th>',
        )
        .join('') +
      '</tr><tr>' +
      columns
        .map(
          ({ shift, slot }) =>
            '<th scope="col" class="' +
            (current?.shift === shift && current.id === slot.id ? 'entry-current-slot' : '') +
            '">' +
            esc(slot.start) +
            '–' +
            esc(slot.end) +
            '</th>',
        )
        .join('') +
      '</tr></thead>' +
      body +
      '</table></div></section>'
    );
  }

  function importMarkup() {
    const preview = importState.preview,
      errors = preview?.errors || [],
      ready = preview?.rows?.length && !errors.length && preview?.token;
    return `<dialog class="entry-import-dialog" aria-labelledby="entry-import-title"><div class="entry-import-heading"><h2 id="entry-import-title">${esc(text('importTitle'))}</h2><button class="button" data-entry-action="close-import" ${importState.busy ? 'disabled' : ''}>${esc(text('close'))}</button></div><p class="entry-import-scope-label"><strong>${esc(text('productionDate'))}: ${esc(importState.scope?.date || '')} · ${esc(text(importState.scope?.shift === 'all' ? 'wholeDay' : importState.scope?.shift || 'day'))}</strong></p><p>${esc(text('importScope'))}</p><p>${esc(text('importDescription'))}</p><label class="entry-file-label">${esc(text('chooseFile'))}<input type="file" accept=".xlsx,.csv" data-entry-file ${importState.busy ? 'disabled' : ''}></label>${importState.fileName ? `<p class="entry-file-name">${esc(importState.fileName)}</p>` : ''}<div class="entry-import-result" role="status">${importState.busy ? esc(text('loading')) : ''}${importState.error ? `<p class="entry-error">${esc(importState.error)}</p>` : ''}${importState.success ? `<p class="entry-success">${esc(text('imported'))}</p>` : ''}</div>${preview ? `<p>${esc(text('records'))}: ${esc(preview.summary?.records ?? preview.rows?.length ?? 0)} · ${esc(text('cells'))}: ${esc(preview.summary?.cells ?? 0)}</p>${errors.length ? `<p class="entry-error">${esc(text('invalidImport'))}</p><div class="entry-import-errors"><table><thead><tr><th scope="col">${esc(text('excelRow'))}</th><th scope="col">${esc(text('column'))}</th><th scope="col">${esc(text('message'))}</th></tr></thead><tbody>${errors.map((error) => `<tr><td>${esc(error.row ?? '—')}</td><td>${esc(error.column ?? '—')}</td><td>${esc(error.message || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}<div class="entry-import-preview">${(preview.rows || []).map((row) => `<section><h3>${esc(productionLabel(row))} · ${esc(row.station || row.job || row.rowId)}${row.shift ? ' · ' + esc(text(row.shift)) : ''}</h3>${(row.changes || []).map((change) => `<p><strong>${esc(change.start || change.slotId)}${change.end ? '–' + esc(change.end) : ''}</strong>${Object.hasOwn(change, 'target') ? `<span>${esc(text('target'))}: ${esc(number(change.target))}</span>` : ''}${Object.hasOwn(change, 'actual') ? `<span>${esc(text('actual'))}: ${esc(number(change.actual))}</span>` : ''}${Object.hasOwn(change, 'issue') ? `<span>${esc(text('issue'))}: ${esc(change.issue || text('emptyValue'))}</span>` : ''}</p>`).join('')}</section>`).join('')}</div>${!preview.rows?.length && !errors.length ? `<p>${esc(text('noImportRows'))}</p>` : ''}` : ''}<div class="entry-import-actions"><button class="button primary" data-entry-action="apply-import" ${ready && !importState.busy ? '' : 'disabled'}>${esc(text('apply'))}</button></div></dialog>`;
  }

  function render() {
    if (destroyed) return;
    const context = getContext();
    if (!context?.config) {
      mount.innerHTML = '';
      return;
    }
    if (!context.loading) dayContext.ensure(context);
    const nextScope = contextScope(context);
    if (scope && scope !== nextScope) {
      closeIssue();
      // An external refresh must not discard an open interval draft. User
      // navigation calls canLeave(), which saves and closes it first.
      line = null;
      model = null;
      selectedSlot = '';
      selectedShift = '';
      importRequest++;
      importState = {
        open: false,
        busy: false,
        preview: null,
        error: '',
        fileName: '',
        success: false,
      };
    }
    scope = nextScope;
    if (!selectedShift) {
      const current = currentEntrySlot(context);
      selectedShift = current?.shift || context.shift;
      selectedSlot = current?.id || '';
    }
    const focus = currentFocus();
    const excelExpanded = mount.querySelector('.entry-import-scope')?.open || false;
    const scroll = mount.querySelector('.entry-matrix-scroll');
    const scrollPosition = scroll ? { left: scroll.scrollLeft, top: scroll.scrollTop } : null;
    const contexts = contextsFor(context);
    const inputContext = contexts[selectedShift];
    const rows = rowsFor(mode === 'day' ? context : inputContext || context);
    if (mode === 'day' && dayContext.get().context) {
      for (const row of rowsFor(dayContext.get().context))
        if (!rows.some((existing) => existing.id === row.id)) rows.push(row);
    }
    const units = entryProductionUnits(context.config, rows);
    const lines = [...new Set(units.map((unit) => unit.line))];
    if (line === null || (line && !lines.includes(line)))
      line =
        units.find((unit) => rows.some((row) => sameProduction(row, unit)))?.line || lines[0] || '';
    const models = [...new Set(units.filter((unit) => !line || unit.line === line).map(modelOf))];
    if (model === null || (model && !models.includes(model)))
      model =
        models.find((value) =>
          rows.some((row) => (!line || row.line === line) && modelOf(row) === value),
        ) ||
        models[0] ||
        '';
    const visible = orderedStationRows(context.config, rows).filter(
      (row) => (!line || row.line === line) && (!model || modelOf(row) === model),
    );
    const missingUnits = units.filter(
      (unit) =>
        (!line || unit.line === line) &&
        (!model || modelOf(unit) === model) &&
        !rows.some((row) => sameProduction(row, unit)),
    );
    const content = context.loading
      ? `<div class="panel entry-empty">${esc(text('loading'))}</div>`
      : (visible.length ? unifiedMarkup(context, visible) : '') +
          missingConfigurationMarkup({
            config: context.config,
            units: missingUnits,
            esc,
            text,
            canConfigure: context.canManage,
          }) || `<div class="panel entry-empty">${esc(text('noRows'))}</div>`;
    const bulkUnit =
      productionUnits(context.config).find(
        (unit) => (!line || unit.line === line) && (!model || modelOf(unit) === model),
      ) || productionUnits(context.config)[0];
    mount.innerHTML = `<div class="entry-view"><div class="entry-filters panel"><label>${esc(text('line'))}<select data-entry-line><option value="">${esc(text('allLines'))}</option>${lines.map((value) => `<option value="${esc(value)}" ${value === line ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>${esc(text('bulkProduct'))}<select data-entry-model-filter><option value="">${esc(text('allModels'))}</option>${models.map((value) => `<option value="${esc(value)}" ${value === model ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label><label>${esc(text('inputMode'))}<select data-entry-mode><option value="sheet" ${mode === 'sheet' ? 'selected' : ''}>${esc(text('sheetMode'))}</option><option value="shift" ${mode === 'shift' ? 'selected' : ''}>${esc(text('shiftMode'))}</option><option value="day" ${mode === 'day' ? 'selected' : ''}>${esc(text('dayMode'))}</option></select></label></div><div class="entry-banner" role="alert" ${banner ? '' : 'hidden'}>${esc(banner)}</div><div class="entry-rows">${visible.length && !context.loading ? '' : sheetTools(context, bulkUnit)}${content}<div class="entry-reviews">${queue
      .values()
      .filter((entry) => reviewed.has(entry.key))
      .map((entry) => reviewMarkup(entry.key))
      .join('')}</div></div>${importMarkup()}</div>`;
    mount.querySelector('.entry-import-scope').open = excelExpanded;
    updateStatuses();
    restoreFocus(focus);
    const nextScroll = mount.querySelector('.entry-matrix-scroll');
    updateUnitHeadings();
    if (nextScroll && scrollPosition) {
      nextScroll.scrollLeft = scrollPosition.left;
      nextScroll.scrollTop = scrollPosition.top;
    }
    const dialog = mount.querySelector('dialog');
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!importState.busy) closeImport();
    });
    if (importState.open) dialog.showModal();
  }

  function updateUnitHeadings() {
    const scroller = mount.querySelector('.entry-matrix-scroll');
    if (!scroller) return;
    // Measure the actual report viewport, including sidebar and scrollbar,
    // instead of guessing its width from the browser viewport.
    mount.style.setProperty('--entry-heading-width', `${Math.max(0, scroller.clientWidth - 22)}px`);
  }
  const sizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(updateUnitHeadings) : null;
  sizeObserver?.observe(mount);

  function setBanner(message) {
    banner = message;
    const element = mount.querySelector('.entry-banner');
    if (element) {
      element.textContent = message;
      element.hidden = !message;
    }
  }

  function closeImport() {
    if (importState.busy) return;
    importState.open = false;
    mount.querySelector('dialog')?.close();
  }

  async function previewFile(file) {
    if (!file || importState.busy || !importState.scope) return;
    const capturedScope = { ...importState.scope },
      request = ++importRequest;
    // Selecting another file invalidates the previous preview immediately. Its
    // token must never remain importable underneath an invalid-file message.
    importState = {
      open: true,
      busy: false,
      preview: null,
      error: '',
      fileName: file.name,
      success: false,
      scope: capturedScope,
    };
    if (file.size > 5 * 1024 * 1024) {
      importState.error = text('tooLarge');
      render();
      if (mode === 'day') {
        const scroll = mount.querySelector('.entry-matrix-scroll');
        const header = scroll?.querySelector(`.entry-shift-${selectedShift}`);
        if (header)
          scroll.scrollLeft = Math.max(
            0,
            header.offsetLeft - scroll.querySelector('.entry-matrix-station').offsetWidth,
          );
      }
      return;
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      importState.error = text('unsupported');
      render();
      return;
    }
    const selectedScope = contextScope(getContext());
    importState = {
      open: true,
      busy: true,
      preview: null,
      error: '',
      fileName: file.name,
      success: false,
      scope: capturedScope,
    };
    render();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let start = 0; start < bytes.length; start += 16384)
        binary += String.fromCharCode(...bytes.subarray(start, start + 16384));
      const preview = await api('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          date: capturedScope.date,
          shift: capturedScope.shift,
          fileName: file.name,
          base64: btoa(binary),
        }),
      });
      if (request !== importRequest || selectedScope !== contextScope(getContext()) || destroyed)
        return;
      importState.preview = preview;
    } catch (error) {
      if (request !== importRequest || destroyed) return;
      importState.error = error.message || text('network');
      if (
        ['errImport', 'errImportExpired', 'errConflict', 'errConfigConflict'].includes(error.code)
      )
        importState.preview = null;
    } finally {
      if (request === importRequest && !destroyed) {
        importState.busy = false;
        render();
      }
    }
  }

  async function applyImport() {
    if (
      importState.busy ||
      !importState.scope ||
      !importState.preview?.token ||
      importState.preview.errors?.length
    )
      return;
    const capturedScope = { ...importState.scope },
      token = importState.preview.token;
    const request = ++importRequest;
    importState.busy = true;
    if (!(await queue.flush()) || invalid.size) {
      importState.busy = false;
      importState.error = text('unsavedImport');
      render();
      return;
    }
    importState.busy = true;
    importState.error = '';
    render();
    try {
      const result = await api('/api/import/apply', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      const host = getContext();
      for (const saved of result.records || []) {
        const recordScope = { date: capturedScope.date, shift: saved.shift || capturedScope.shift };
        const context =
          host.date === recordScope.date ? contextsFor(host)[recordScope.shift] : null;
        const key = keyFor(recordScope, saved.rowId);
        localSaved.set(key, saved);
        const row = context && rowsFor(context).find((value) => value.id === saved.rowId);
        if (row) queue.rebase(key, rowPayload(context, row), false);
        onSaved(saved, { key, imported: true, payload: { ...recordScope, rowId: saved.rowId } });
      }
      if (request !== importRequest || destroyed) return;
      importState.preview = null;
      importState.success = true;
      dayContext.clear();
      await onImported(result);
    } catch (error) {
      if (request !== importRequest || destroyed) return;
      importState.error = error.message || text('network');
      // A rejected/version-stale token needs a fresh preview, not another Apply.
      if (
        ['errImport', 'errImportExpired', 'errConflict', 'errConfigConflict'].includes(error.code)
      )
        importState.preview = null;
    } finally {
      if (request === importRequest && !destroyed) {
        importState.busy = false;
        render();
      }
    }
  }

  async function downloadTemplate(shift) {
    if (!['day', 'night', 'all'].includes(shift)) return;
    if (importState.busy) return setBanner(text('importBusy'));
    const context = { date: getContext().date, shift };
    if (!(await queue.flush()) || invalid.size) return setBanner(text('unsavedImport'));
    try {
      const query = new URLSearchParams({
        date: context.date,
        shift: context.shift,
        lang: language(),
      });
      const response = await fetch(`/api/import/template?${query}`, { credentials: 'same-origin' });
      if (!response.ok) {
        if (response.status === 401) await api('/api/auth/me');
        throw new Error(text('network'));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      const disposition = response.headers.get('Content-Disposition') || '';
      anchor.download =
        /filename="([^"]+)"/i.exec(disposition)?.[1] ||
        `BP9-entry-${context.date}-${context.shift}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setBanner(error.message || text('network'));
    }
  }

  async function reviewLatest(key) {
    const entry = queue.get(key);
    if (!entry || entry.running) return;
    try {
      const data = await api(
        `/api/records?${new URLSearchParams({ date: entry.latest.date, shift: entry.latest.shift })}`,
      );
      const record = data.records.find((value) => value.rowId === entry.latest.rowId);
      const latest = {
        ...copy(record || data.defaults?.[entry.latest.rowId] || {}),
        rowId: entry.latest.rowId,
        date: entry.latest.date,
        shift: entry.latest.shift,
        version: record?.version ?? data.rowVersions?.[entry.latest.rowId] ?? 0,
        configVersion: data.configVersion,
      };
      latest.slots = (latest.slots || []).map((slot) => ({
        ...slot,
        actual: slot.actual ?? null,
        issue: slot.issue || '',
      }));
      reviewed.set(key, latest);
      render();
    } catch (error) {
      setBanner(error.message || text('loadLatestFailed'));
    }
  }

  function onInput(event) {
    const input = event.target.closest('[data-entry-field]');
    if (!input) return;
    const key = input.dataset.rowKey,
      entry = queue.get(key);
    if (!entry) return;
    const next = copy(entry.latest);
    const slot = next.slots.find((value) => value.id === input.dataset.slotId);
    if (!slot) return;
    if (['actual', 'target'].includes(input.dataset.entryField)) {
      const parsed = parseEntryActual(input.value),
        invalidKey = `${key}|${slot.id}|${input.dataset.entryField}`;
      if (!parsed.valid) {
        invalid.set(invalidKey, input.value);
        input.setAttribute('aria-invalid', 'true');
        input.title = text('invalidActual');
        queue.pause(key, true);
        return;
      }
      invalid.delete(invalidKey);
      input.removeAttribute('aria-invalid');
      input.removeAttribute('title');
      slot[input.dataset.entryField] = parsed.value;
    } else {
      slot.issue = input.value;
      if (issueEditor?.key === key) issueEditor.limitReached = false;
    }
    queue.pause(
      key,
      [...invalid.keys()].some((value) => value.startsWith(key + '|')),
    );
    queue.update(key, next);
    setBanner('');
  }

  function countGrid(field = 'actual') {
    const table = mount.querySelector('[data-entry-grid]');
    if (!table) return [];
    const grid = Array.from({ length: Number(table.dataset.gridHeight) }, () =>
      Array(Number(table.dataset.gridWidth)).fill(null),
    );
    for (const input of mount.querySelectorAll(`[data-entry-field="${field}"][data-grid-row]`))
      grid[Number(input.dataset.gridRow)][Number(input.dataset.gridColumn)] = input;
    return grid;
  }

  function onPaste(event) {
    const input = event.target.closest('[data-entry-field][data-grid-row]');
    if (!input || !event.clipboardData || input.dataset.entryField === 'issue') return;
    event.preventDefault();
    const field = input.dataset.entryField;
    const grid = countGrid(field);
    const describe = (grid) =>
      grid.map((row) =>
        row.map(
          (cell) =>
            cell && {
              rowKey: cell.dataset.rowKey,
              slotId: cell.dataset.slotId,
              field: cell.dataset.entryField,
              disabled: cell.disabled,
            },
        ),
      );
    const plan = planEntryPaste(
      event.clipboardData.getData('text/plain'),
      describe(grid),
      Number(input.dataset.gridRow),
      Number(input.dataset.gridColumn),
      { target: describe(countGrid('target')), actual: describe(countGrid('actual')) },
    );
    if (!plan.valid) return setBanner(text('invalidPaste'));
    const drafts = new Map();
    for (const edit of plan.edits) {
      const entry = queue.get(edit.rowKey);
      if (!entry || !entry.latest.slots.some((slot) => slot.id === edit.slotId))
        return setBanner(text('invalidPaste'));
      if (!drafts.has(edit.rowKey)) drafts.set(edit.rowKey, copy(entry.latest));
      const slot = drafts.get(edit.rowKey).slots.find((slot) => slot.id === edit.slotId);
      slot[edit.field] = edit.value;
    }
    // No DOM/queue/invalid mutation occurs until the entire destination rectangle is checked.
    for (const edit of plan.edits) invalid.delete(`${edit.rowKey}|${edit.slotId}|${edit.field}`);
    for (const [key, draft] of drafts) {
      queue.update(key, draft);
      queue.pause(
        key,
        [...invalid.keys()].some((value) => value.startsWith(key + '|')),
      );
    }
    for (const row of [...countGrid('target'), ...countGrid('actual')])
      for (const cell of row) {
        if (!cell) continue;
        const edit = plan.edits.find(
          (value) =>
            value.rowKey === cell.dataset.rowKey &&
            value.slotId === cell.dataset.slotId &&
            value.field === cell.dataset.entryField,
        );
        if (!edit) continue;
        cell.value = edit.value ?? '';
        cell.removeAttribute('aria-invalid');
        cell.removeAttribute('title');
      }
    updateStatuses();
    setBanner(`${text('pastePending')} (${plan.edits.length})`);
  }

  async function onClick(event) {
    if (event.target === bulkDialog) {
      const bounds = bulkDialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        closeBulk();
      return;
    }
    if (event.target === issueDialog) {
      const bounds = issueDialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        closeIssue();
      return;
    }
    const slotButton = event.target.closest('[data-entry-shift-slot], [data-entry-select-shift]');
    if (slotButton) {
      selectedShift = slotButton.dataset.slotShift || slotButton.dataset.entrySelectShift;
      selectedSlot = slotButton.dataset.entryShiftSlot || '';
      if (slotButton.dataset.entrySelectShift && mode === 'day') mode = 'shift';
      void queue.flush();
      render();
      return;
    }
    const button = event.target.closest('[data-entry-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.entryAction,
      key = button.dataset.rowKey;
    if (action === 'bulk-open') return openBulk(button);
    if (action === 'bulk-close') return closeBulk();
    if (action === 'bulk-refresh') return loadBulkPreview();
    if (action === 'bulk-apply') return applyBulk(button.dataset.bulkApplyField);
    if (action === 'bulk-save') return saveBulk();
    if (action === 'bulk-issue-preset') {
      if (!bulkEditor || bulkEditor.busy || bulkEditor.loading) return;
      const preset = issuePresets(getContext().config).find((item) =>
        item.id === button.dataset.issuePreset && item.active);
      if (preset) {
        const input = bulkDialog.querySelector('[data-bulk-field="issue"]');
        input.value = issueLabel(preset);
        updateBulkControls();
        input.focus();
      }
      return;
    }
    if (action === 'edit-issue') return openIssue(button);
    if (action === 'close-issue') return closeIssue();
    if (action === 'clear-issue' || action === 'issue-preset')
      return editIssue(action, button.dataset.issuePreset);
    if (action === 'configure-unit') {
      const [line, model] = JSON.parse(button.dataset.productionUnit);
      await onConfigure({ line, model });
      return;
    }
    if (action === 'reload-day') {
      dayContext.clear();
      render();
      return;
    }
    if (action === 'current-slot') {
      const current = currentEntrySlot(getContext());
      if (!current) return setBanner(text('noCurrentSlot'));
      selectedShift = current.shift;
      selectedSlot = current.id;
      mode = 'sheet';
      render();
      const input = [...mount.querySelectorAll('[data-entry-field="actual"]')].find(
        (cell) =>
          cell.dataset.slotId === current.id &&
          cell.dataset.rowKey.startsWith(`${getContext().date}|${current.shift}|`),
      );
      input?.scrollIntoView({ block: 'nearest', inline: 'center' });
      input?.focus({ preventScroll: true });
      input?.select();
      return;
    }
    if (action === 'save-all') {
      if (!(await queue.flush()) || invalid.size) setBanner(text('pending'));
    } else if (action === 'retry') queue.retry(key);
    else if (action === 'discard') {
      const entry = queue.get(key);
      if (!entry || entry.running) return;
      queue.rebase(key, entry.baseline, false);
      for (const invalidKey of invalid.keys())
        if (invalidKey.startsWith(key + '|')) invalid.delete(invalidKey);
      queue.pause(key, false);
      reviewed.delete(key);
      render();
    } else if (action === 'review') await reviewLatest(key);
    else if (action === 'use-latest' || action === 'save-mine') {
      const latest = reviewed.get(key);
      if (!latest) return;
      queue.rebase(key, latest, action === 'save-mine');
      if (action === 'use-latest') {
        for (const invalidKey of invalid.keys())
          if (invalidKey.startsWith(key + '|')) invalid.delete(invalidKey);
        queue.pause(key, false);
        localSaved.set(key, latest);
        onSaved(latest, { key, reloaded: true });
      }
      reviewed.delete(key);
      render();
      if (action === 'save-mine') await queue.flush(key);
    } else if (action === 'template') await downloadTemplate(button.dataset.importShift);
    else if (action === 'open-import') {
      const shift = button.dataset.importShift;
      if (!['day', 'night', 'all'].includes(shift) || importState.busy) return;
      const date = getContext().date,
        hostScope = contextScope(getContext());
      if (!(await queue.flush()) || invalid.size) return setBanner(text('unsavedImport'));
      if (hostScope !== contextScope(getContext()) || destroyed) return;
      importRequest++;
      importState = {
        open: true,
        busy: false,
        preview: null,
        error: '',
        fileName: '',
        success: false,
        scope: { date, shift },
      };
      render();
    } else if (action === 'close-import') closeImport();
    else if (action === 'apply-import') await applyImport();
  }

  function onChange(event) {
    if (event.target.matches('[data-entry-line], [data-entry-model-filter], [data-entry-mode]'))
      void queue.flush();
    if (event.target.matches('[data-entry-line]')) {
      line = event.target.value;
      render();
    } else if (event.target.matches('[data-entry-model-filter]')) {
      model = event.target.value;
      render();
    } else if (event.target.matches('[data-entry-mode]')) {
      mode = event.target.value;
      render();
    } else if (event.target.matches('[data-entry-file]')) void previewFile(event.target.files[0]);
  }

  function onFocusOut(event) {
    const input = event.target.closest('[data-entry-field]');
    if (input) void queue.flush(input.dataset.rowKey);
  }

  function onKeyDown(event) {
    if (!event.isComposing && event.key === 'F2') {
      const input = event.target.closest('[data-entry-field][data-grid-row]');
      if (input) {
        const trigger = [...mount.querySelectorAll('[data-issue-cell]')].find(
          (button) =>
            button.dataset.rowKey === input.dataset.rowKey &&
            button.dataset.slotId === input.dataset.slotId,
        );
        if (trigger) {
          event.preventDefault();
          openIssue(trigger, input.dataset.entryField);
        }
      }
      return;
    }
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const input = event.target.closest('[data-entry-field][data-grid-row]');
    if (
      !input ||
      !['Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return;
    const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (event.key === 'ArrowLeft' && !allSelected && input.selectionStart !== 0) return;
    if (event.key === 'ArrowRight' && !allSelected && input.selectionEnd !== input.value.length)
      return;
    const field = input.dataset.entryField;
    const grid = countGrid(field);
    const destination = entryGridDestination(
      grid,
      Number(input.dataset.gridRow),
      Number(input.dataset.gridColumn),
      event.key,
      event.shiftKey,
    );
    if (event.key === 'Tab' && !destination) {
      void queue.flush(input.dataset.rowKey);
      return; // Leave the grid using the browser's native focus order.
    }
    event.preventDefault();
    if (destination) {
      const next = grid[destination.row][destination.column];
      next.focus();
      next.select();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    void queue.flush(input.dataset.rowKey);
  }

  mount.addEventListener('input', onInput);
  mount.addEventListener('change', onChange);
  mount.addEventListener('click', onClick);
  mount.addEventListener('focusout', onFocusOut);
  mount.addEventListener('keydown', onKeyDown);
  mount.addEventListener('paste', onPaste);
  issueDialog.addEventListener('input', onInput);
  issueDialog.addEventListener('click', onClick);
  issueDialog.addEventListener('focusout', onFocusOut);
  issueDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeIssue();
  });
  issueDialog.addEventListener('keydown', (event) => {
    if (!event.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      closeIssue();
    }
  });
  bulkDialog.addEventListener('click', onClick);
  bulkDialog.addEventListener('paste', pasteBulk);
  bulkDialog.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveBulk();
    } else if (event.key === 'Enter' && event.target.matches('[data-bulk-cell]')) {
      const cells = [
        ...bulkDialog.querySelectorAll(`[data-bulk-cell="${event.target.dataset.bulkCell}"]`),
      ];
      const next = cells[cells.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
      event.preventDefault();
      next?.focus();
      next?.select();
    }
  });
  bulkDialog.addEventListener('input', (event) => {
    const input = event.target;
    if (input.matches('[data-bulk-cell]')) {
      const row = bulkEditor?.rows.find((item) => String(item.row.id) === input.dataset.bulkRowId);
      if (row) row.draft[input.dataset.bulkCell] = input.value;
    }
    updateBulkControls();
  });
  bulkDialog.addEventListener('change', (event) => {
    if (
      event.target.matches(
        '[data-bulk-date], [data-bulk-slot], [data-bulk-line], [data-bulk-model]',
      )
    )
      void updateBulkScope();
  });
  bulkDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeBulk();
  });

  return {
    render,
    refresh: render,
    flush: () => queue.flush(),
    hasPendingChanges: () =>
      importState.busy ||
      bulkEditor?.busy ||
      bulkHasChanges() ||
      invalid.size > 0 ||
      queue.hasPendingChanges(),
    async canLeave() {
      closeIssue();
      if (!(await closeBulk(false))) return false;
      return !importState.busy && !invalid.size && (await queue.flush());
    },
    openRow(id) {
      const context = getContext(),
        row = rowsFor(context).find((value) => value.id === Number(id));
      if (!row) return false;
      line = row.line;
      model = modelOf(row);
      mode = 'shift';
      selectedShift = currentEntrySlot(context)?.shift || context.shift;
      scope = contextScope(context);
      render();
      mount
        .querySelector('[data-entry-row]')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      mount.querySelector('[data-entry-field="actual"]')?.focus({ preventScroll: true });
      return true;
    },
    destroy() {
      destroyed = true;
      sizeObserver?.disconnect();
      queue.destroy();
      dayContext.clear();
      mount.removeEventListener('input', onInput);
      mount.removeEventListener('change', onChange);
      mount.removeEventListener('click', onClick);
      mount.removeEventListener('focusout', onFocusOut);
      mount.removeEventListener('keydown', onKeyDown);
      mount.removeEventListener('paste', onPaste);
      mount.querySelector('dialog')?.close();
      issueDialog.close();
      issueDialog.remove();
      bulkDialog.close();
      bulkDialog.remove();
    },
  };
}
