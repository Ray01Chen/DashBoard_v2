import { naturalOrder, byProduction } from './list-order.js';
/**
 * Manager-only settings renderers and pure draft helpers.
 * No API or production-record writes belong here. The host saves one versioned
 * configuration; saved records retain their own personnel/target snapshots.
 */
import {
  allocateDailyTarget,
  lineDailyTarget,
  plannedProduction,
} from './production-targets.js';
import { removePersonnel } from './catalog-settings.js';
import {
  modelOf,
  productionKey,
  productionLabel,
  productionIdentityMarkup,
  productionUnits,
  unitFor,
  staffingFor,
  outputSourceFor,
  stationHasOutput,
} from './production-models.js';

export const workforceMessages = {
  en: {
    plannedUPH: 'Planned UPH',
    effectiveHours: 'Productive hours',
    mappingOrder: 'Order',
    hasOutput: 'Produces output',
    outputRequired: 'Production reporting required',
    noOutputRequired: 'Visible station · no production entry',
    mappingOrderHint:
      'Drag the grip or use ↑ / ↓ to reorder this pair. Save settings applies the order to entry, details and exports.',
    dragMapping: 'Drag to reorder station',
    moveUp: 'Move up',
    moveDown: 'Move down',
    jobFilter: 'Filter by job',
    jobLinkHint:
      'The filter changes which people are shown. Change a person’s Job in their row; choices follow the current master job list. Removing a job deletes its directory people and clears their team/owner assignments when settings are saved. Historical reports keep their saved names.',
    lineModelsTitle: 'Assign models to lines',
    lineModelsDescription:
      'Choose a Line and Model, then Add combination. Add another row to run several models on the same line. Existing combinations keep their targets, teams and owners.',
    chooseLine: 'Choose line',
    chooseModel: 'Choose model',
    addCombination: 'Add combination',
    removeCombination: 'Remove combination',
    combinationExists: 'This line and model are already configured.',
    noCombinations: 'No combinations shown. Choose a line and model above to add one.',
    ownerNotAssigned: 'Owner not assigned',
    assignOwner: 'Assign owner',
    combinationOwnerHint:
      'Owners belong to each line/model combination. Assign owner opens that combination’s personnel page. Save settings publishes your changes.',
    chooseJob: 'Choose job',
    choosePeople: 'Choose people',
    chooseJobFirst: 'Choose a job to see available people.',
    selectedPeopleCount: 'Select people · {count} selected',
    selectAllPeople: 'Select all',
    clearPeople: 'Clear selection',
    addStaffSelected: 'Add selected ({count})',
    noAssignedPeople: 'No people assigned yet.',
    staffAddHint:
      'Choose a job, tick one or more people, then Add selected. The same job can have several people in each team. Save settings publishes assignments.',
    noMorePeople: 'All active people in this job are already assigned here.',
    noPeopleForJob: 'No people in this job yet. Create them in People by job.',
    noActivePeopleForJob: 'People in this job are inactive. Enable them in People by job.',
    manageJobPeople: 'Open people for this job',
    model: 'Model',
    allModels: 'All models',
    noUnits: 'Enable a line + model combination in step 1 first.',
    allJobs: 'All jobs',
    peopleTitle: 'People by job',
    peopleDescription:
      'Select a job to create and maintain people. Next, open step 4 to assign them to lines.',
    addPerson: 'Add person',
    personName: 'Person name',
    personJob: 'Job',
    activePerson: 'Active',
    inactivePerson: 'Inactive',
    removePerson: 'Remove person',
    noPeople: 'No people in this job yet.',
    noJobs: 'Create jobs in step 1 before adding people.',
    mappingIntegratedHint:
      'Choose Job and Station in the last row, then Add and enable. Existing rows can be edited or enabled here. Save settings publishes enabled stations to Production entry.',
    duplicateMapping:
      'This job/station pair already exists above. Edit it or check Active to enable it.',
    outputStation: 'Output station',
    configureOutputStation: 'Enable a station and check Produces output below',
    outputStationHint:
      'Choose an enabled output-producing station for this line’s dashboard output, target and alerts. Other reporting stations keep their own entries.',
    noConfiguredStations:
      'No stations configured for this line/model. Add Job and Station below.',
    mappingDeletionHint:
      'Uncheck Active to pause a station and keep it here. Delete removes it from this configuration after Save settings; historical reports remain. Check the output station again if you disable or delete its source.',
    newMappingJob: 'Job for new station mapping',
    newMappingStation: 'Station for new mapping',
    addActiveMapping: 'Add and enable',
    workforceTitle: 'Line configuration',
    workforceDescription:
      'Select a line and its configured Model from master data. Add, edit and enable job/station pairs in the same table; people and the daily target come from that exact combination.',
    staffingTitle: 'Assign people to lines',
    staffingDescription:
      'Select Line and Model, then choose a job and tick multiple people for each day/night team or owner list. Each combination has independent assignments.',
    dayStaff: 'Day 5-Tigers team',
    nightStaff: 'Night 5-Tigers team',
    lineOwners: 'Owners',
    noAvailablePeople: 'Create active people in step 3 before assigning them.',
    noLines: 'Create lines in step 1 first.',
    targetTitle: 'Daily targets by line + model',
    targetDescription:
      'Set one daily preset for each enabled line + model. It applies to every station and both shifts, distributed by production minutes excluding breaks. Enable line/model combinations in step 1; no people or mappings are required yet.',
    targetLabel: 'Whole-day target',
    targetUnset: 'Not set',
    allLines: 'All lines',
    targetCount: '{count} lines shown · {total} total',
    dayTarget: 'Day allocation',
    nightTarget: 'Night allocation',
    allocationFormula:
      'Interval target = whole-day target × interval production minutes ÷ total production minutes of both shifts. Breaks are excluded; rounding preserves the daily total.',
    noMappings: 'No active job/station mappings. Add them in step 5.',
    inactiveHint:
      'Previously selected inactive people remain visible for review, but are excluded from defaults for new records.',
    defaultSnapshotHint:
      'Saved production records keep their personnel, targets and mapping IDs. These settings provide defaults for new records.',
    noStation: 'No station',
    noJob: 'No job',
    selectLines: 'Select lines from the master list',
    selectedLines: '{count} lines selected',
    noSelectedLines: 'Select one or more lines to configure them below.',
    batchTitle: 'Add job / station pairs to selected lines',
    addPair: 'Add another pair',
    removePair: 'Remove pair',
    applyMappings: 'Add mappings to selected lines',
    automaticStaff: 'Automatic staff · read-only',
    automaticStaffHint:
      'Day/night teams are matched by job; owners come from this line + model. A dash means nobody is assigned for that job/shift yet; update Assign people to lines.',
    mappingStatus: 'Active mapping',
    removeMapping: 'Delete',
    mappingJob: 'Job',
    mappingStation: 'Station',
    none: 'None',
    actions: 'Actions',
    status: 'Status',
    line: 'Line',
  },
  zh: {
    plannedUPH: '計畫 UPH',
    effectiveHours: '有效生產時數',
    mappingOrder: '順序',
    hasOutput: '有產出',
    outputRequired: '需填寫生產填報',
    noOutputRequired: '保留顯示，免填生產資料',
    mappingOrderHint: '拖曳把手或用 ↑／↓ 排列此配對站點，儲存設定後套用至填報、明細與匯出。',
    dragMapping: '拖曳排列站點',
    moveUp: '上移',
    moveDown: '下移',
    jobFilter: '職務篩選',
    jobLinkHint:
      '上方篩選只切換顯示人員。請在個人列修改「所屬職務」，選項與目前基礎職務清單同步。刪除職務時，儲存設定會一併刪除該職務人員及早晚班／OWNER 分配；歷史填報保留當時姓名。',
    lineModelsTitle: '設定各產線使用的 Model',
    lineModelsDescription:
      '下拉選擇產線與 Model，按「新增配對」。同一條線可逐筆加入多個 Model，原有配對的目標、人員及 OWNER 都會保留。',
    chooseLine: '選擇產線',
    chooseModel: '選擇 Model',
    addCombination: '新增配對',
    removeCombination: '移除配對',
    combinationExists: '這組產線與 Model 已經配置。',
    noCombinations: '目前沒有符合的配對；可在上方選產線與 Model 新增。',
    ownerNotAssigned: '尚未分配 OWNER',
    assignOwner: '分配 OWNER',
    combinationOwnerHint:
      'OWNER 依各組產線＋Model 設定。「分配 OWNER」會開啟該組人員分配頁；按儲存設定後才發布。',
    chooseJob: '選擇職務',
    choosePeople: '選擇人員',
    chooseJobFirst: '先選職務，下方列出可加入的人員。',
    selectedPeopleCount: '選擇人員 · 已選 {count} 位',
    selectAllPeople: '全選',
    clearPeople: '清除勾選',
    addStaffSelected: '新增已選人員（{count}）',
    noAssignedPeople: '尚未分配人員。',
    staffAddHint:
      '先選職務，勾選一位或多位人員，再按新增。同職務每班可分配多人；最後儲存設定才會發布。',
    noMorePeople: '此職務的啟用人員都已加入這個班組。',
    noPeopleForJob: '此職務尚未建立人員，請前往「依職務建立人員」新增。',
    noActivePeopleForJob: '此職務的人員目前均停用，請前往人員頁啟用。',
    manageJobPeople: '開啟此職務人員頁',
    model: 'Model',
    allModels: '全部 Model',
    noUnits: '請先在第 1 步勾選產線使用的 Model。',
    allJobs: '全部職務',
    peopleTitle: '依職務建立人員',
    peopleDescription: '先選職務，再建立與維護人員；建立後至第 4 步分配各線兩班與負責人。',
    addPerson: '新增人員',
    personName: '人員姓名',
    personJob: '所屬職務',
    activePerson: '啟用',
    inactivePerson: '已停用',
    removePerson: '移除人員',
    noPeople: '這個職務尚未建立人員。',
    noJobs: '請先在第 1 步建立職務，再新增人員。',
    mappingIntegratedHint:
      '最後一列選職務與站點，再按「新增並啟用」。既有列可直接編輯或啟用；儲存設定後，啟用站點才會出現在生產填報。',
    duplicateMapping: '這組職務／站點已在上表，請直接編輯或勾選啟用，不需重複新增。',
    outputStation: '產量來源站點',
    configureOutputStation: '請在下表啟用站點並勾選「有產出」',
    outputStationHint:
      '請選啟用的產出站，供應此產線看板產量、目標及警示；其他產出站各自保留填報值。',
    noConfiguredStations: '這組產線／Model 尚未設定站點，請在下方選職務及站點新增。',
    mappingDeletionHint:
      '取消啟用只暫停站點並保留此列。「刪除」會在儲存設定後從配置清單移除，歷史填報保留。停用或刪除來源站後，請重新確認產量來源。',
    newMappingJob: '新增站點的職務',
    newMappingStation: '新增配置的站點',
    addActiveMapping: '新增並啟用',
    workforceTitle: '產線配置',
    workforceDescription:
      '下拉選擇基礎資料已配好的產線與 Model，在同一張表新增、編輯、啟用職務／站點。人員與日目標自動沿用這個組合。',
    staffingTitle: '產線人員分配',
    staffingDescription:
      '先選產線與 Model，再在早班、晚班及 OWNER 選職務並勾選多人新增。各組合獨立分配，可逐人移除。',
    dayStaff: '早班 5-Tigers 人員',
    nightStaff: '晚班 5-Tigers 人員',
    lineOwners: '負責人',
    noAvailablePeople: '請先在第 3 步建立啟用人員，再進行分配。',
    noLines: '請先在第 1 步建立產線。',
    targetTitle: '產線＋Model 預設日目標',
    targetDescription:
      '每組啟用的產線＋Model 各設一個預設日目標，依兩班生產分鐘數分配、排除休息並同步各站。先在第 1 步啟用組合，不必等待人員與站點配置。',
    targetLabel: '整個生產日目標',
    targetUnset: '未設定',
    allLines: '全部產線',
    targetCount: '顯示 {count} 條產線，共 {total} 條',
    dayTarget: '早班分配目標',
    nightTarget: '晚班分配目標',
    allocationFormula:
      '時段目標＝全日目標 × 本時段生產分鐘 ÷ 早晚班總生產分鐘。排除休息；整數分配後仍保留全日總量。',
    noMappings: '尚無啟用的職務／站點配置，請在第 5 步建立。',
    inactiveHint: '已選取的停用人員仍顯示供確認，但新紀錄的預設人員不會帶入停用人員。',
    defaultSnapshotHint:
      '已儲存的生產紀錄保留當時的人員、目標與配置識別碼；這些設定用於新紀錄的預設值。',
    noStation: '未指定站點',
    noJob: '未指定職務',
    selectLines: '從基礎資料選取產線',
    selectedLines: '已選 {count} 條產線',
    noSelectedLines: '請勾選一條或多條產線，下方顯示所選產線配置。',
    batchTitle: '將職務／站點組合加入所選產線',
    addPair: '新增一組對應',
    removePair: '移除組合',
    applyMappings: '批次新增所選產線配置',
    automaticStaff: '自動帶入人員 · 唯讀',
    automaticStaffHint:
      '早晚班依職務帶入班員，OWNER 沿用此產線＋Model。顯示「—」表示該職務／班別尚未分配人員，請到產線人員分配補齊。',
    mappingStatus: '啟用配置',
    removeMapping: '刪除',
    mappingJob: '職務',
    mappingStation: '站點',
    none: '無',
    actions: '操作',
    status: '狀態',
    line: '產線',
  },
  th: {
    plannedUPH: 'UPH ตามแผน',
    effectiveHours: 'ชั่วโมงผลิต',
    mappingOrder: 'ลำดับ',
    hasOutput: 'มีผลผลิต',
    outputRequired: 'ต้องบันทึกการผลิต',
    noOutputRequired: 'แสดงสถานีโดยไม่ต้องบันทึกผลผลิต',
    mappingOrderHint:
      'ลากที่จับหรือใช้ ↑ / ↓ จัดสถานีของคู่นี้ บันทึกการตั้งค่าเพื่อใช้ลำดับในหน้ากรอก รายละเอียดและส่งออก',
    dragMapping: 'ลากเพื่อจัดลำดับสถานี',
    moveUp: 'เลื่อนขึ้น',
    moveDown: 'เลื่อนลง',
    jobFilter: 'กรองตามหน้าที่',
    jobLinkHint:
      'ตัวกรองเปลี่ยนเฉพาะคนที่แสดง เปลี่ยนหน้าที่ในแถวของแต่ละคนตามรายการปัจจุบัน เมื่อลบหน้าที่และบันทึก จะลบบุคลากรของหน้าที่นั้นพร้อมการมอบหมายทีมและผู้รับผิดชอบ รายงานเดิมเก็บชื่อเดิม',
    lineModelsTitle: 'จับคู่สายและ Model',
    lineModelsDescription:
      'เลือก Line และ Model แล้วกดเพิ่มคู่ เพิ่มหลาย Model ให้สายเดียวได้ เป้าหมาย ทีมและผู้รับผิดชอบของคู่เดิมยังคงอยู่',
    chooseLine: 'เลือกสาย',
    chooseModel: 'เลือก Model',
    addCombination: 'เพิ่มคู่',
    removeCombination: 'นำคู่ออก',
    combinationExists: 'คู่นี้มีการตั้งค่าแล้ว',
    noCombinations: 'ยังไม่มีคู่ที่ตรง เลือกสายและ Model ด้านบนเพื่อเพิ่ม',
    ownerNotAssigned: 'ยังไม่มอบหมายผู้รับผิดชอบ',
    assignOwner: 'มอบหมายผู้รับผิดชอบ',
    combinationOwnerHint:
      'ผู้รับผิดชอบแยกตามคู่สาย/Model ปุ่มมอบหมายเปิดหน้าบุคลากรของคู่นั้น กดบันทึกการตั้งค่าเพื่อเผยแพร่',
    chooseJob: 'เลือกหน้าที่',
    choosePeople: 'เลือกบุคลากร',
    chooseJobFirst: 'เลือกหน้าที่เพื่อแสดงคนที่เพิ่มได้',
    selectedPeopleCount: 'เลือกบุคลากร · เลือกแล้ว {count} คน',
    selectAllPeople: 'เลือกทั้งหมด',
    clearPeople: 'ล้างที่เลือก',
    addStaffSelected: 'เพิ่มที่เลือก ({count})',
    noAssignedPeople: 'ยังไม่มีผู้ได้รับมอบหมาย',
    staffAddHint:
      'เลือกหน้าที่ ติ๊กหนึ่งคนหรือหลายคน แล้วกดเพิ่มที่เลือก แต่ละกะมีหลายคนในหน้าที่เดียวกันได้ กดบันทึกการตั้งค่าเพื่อเผยแพร่',
    noMorePeople: 'บุคลากรที่เปิดใช้งานในหน้าที่นี้ถูกเพิ่มในทีมนี้ครบแล้ว',
    noPeopleForJob: 'ยังไม่มีคนในหน้าที่นี้ สร้างคนในหน้าบุคลากรตามหน้าที่',
    noActivePeopleForJob: 'คนในหน้าที่นี้ปิดใช้งานอยู่ เปิดใช้งานในหน้าบุคลากรตามหน้าที่',
    manageJobPeople: 'เปิดบุคลากรในหน้าที่นี้',
    model: 'Model',
    allModels: 'ทุก Model',
    noUnits: 'เปิดคู่สาย + Model ในขั้นตอน 1 ก่อน',
    allJobs: 'ทุกหน้าที่',
    peopleTitle: 'บุคลากรตามหน้าที่',
    peopleDescription:
      'เลือกหน้าที่เพื่อสร้างและดูแลบุคลากร แล้วไปขั้นตอนที่ 4 เพื่อมอบหมายให้สาย',
    addPerson: 'เพิ่มบุคลากร',
    personName: 'ชื่อบุคลากร',
    personJob: 'หน้าที่',
    activePerson: 'เปิดใช้งาน',
    inactivePerson: 'ปิดใช้งานแล้ว',
    removePerson: 'ลบบุคลากร',
    noPeople: 'ยังไม่มีบุคลากรในหน้าที่นี้',
    noJobs: 'สร้างหน้าที่ในขั้นตอนที่ 1 ก่อนเพิ่มบุคลากร',
    mappingIntegratedHint:
      'เลือกหน้าที่และสถานีในแถวสุดท้ายแล้วกดเพิ่มและเปิดใช้ แก้ไขหรือเปิดใช้แถวเดิมได้ที่นี่ บันทึกการตั้งค่าเพื่อให้สถานีปรากฏในหน้ารายงาน',
    duplicateMapping: 'คู่หน้าที่/สถานีนี้อยู่ในตารางแล้ว แก้ไขหรือติ๊กเปิดใช้ที่แถวเดิม',
    outputStation: 'สถานีแหล่งผลผลิต',
    configureOutputStation: 'เปิดสถานีและเลือกมีผลผลิตในตารางด้านล่าง',
    outputStationHint:
      'ผลผลิต เป้าหมายและการเตือนของสาย/Model ใช้สถานีที่เลือก สถานีอื่นเก็บข้อมูลของตนเอง',
    noConfiguredStations: 'คู่นี้ยังไม่มีสถานี เลือกหน้าที่และสถานีเพื่อเพิ่มด้านล่าง',
    mappingDeletionHint:
      'ยกเลิกเปิดใช้เพื่อพักสถานีโดยเก็บแถวไว้ ลบจะนำออกจากการตั้งค่าหลังบันทึก โดยรักษารายงานเก่า ตรวจแหล่งผลผลิตอีกครั้งเมื่อปิดหรือลบสถานีต้นทาง',
    newMappingJob: 'หน้าที่ของสถานีใหม่',
    newMappingStation: 'สถานีของคู่ใหม่',
    addActiveMapping: 'เพิ่มและเปิดใช้',
    workforceTitle: 'การตั้งค่าสาย',
    workforceDescription:
      'เลือกสายและ Model ที่จับคู่ในข้อมูลหลัก เพิ่ม แก้ไข และเปิดใช้คู่หน้าที่/สถานีในตารางเดียว ทีมและเป้าหมายมาจากคู่นี้โดยอัตโนมัติ',
    staffingTitle: 'มอบหมายบุคลากรให้สาย',
    staffingDescription:
      'เลือก Line และ Model แล้วเลือกหน้าที่และติ๊กหลายคนเพื่อเพิ่มในทีมแต่ละกะหรือผู้รับผิดชอบ แต่ละคู่แยกการมอบหมายและนำคนออกทีละคนได้',
    dayStaff: 'ทีม 5-Tigers กะเช้า',
    nightStaff: 'ทีม 5-Tigers กะกลางคืน',
    lineOwners: 'ผู้รับผิดชอบ',
    noAvailablePeople: 'สร้างบุคลากรที่เปิดใช้งานในขั้นตอนที่ 3 ก่อนมอบหมาย',
    noLines: 'สร้างสายการผลิตในขั้นตอนที่ 1 ก่อน',
    targetTitle: 'เป้าหมายรายวันตามสาย + Model',
    targetDescription:
      'ตั้งเป้าหมายต่อคู่สาย + Model ที่เปิดใช้งาน แบ่งตามนาทีผลิตของสองกะไม่รวมพักและใช้ร่วมทุกสถานี เปิดคู่ในขั้นตอน 1 ได้ก่อนเพิ่มบุคลากรหรือสถานี',
    targetLabel: 'เป้าหมายทั้งวันผลิต',
    targetUnset: 'ยังไม่กำหนด',
    allLines: 'ทุกสายการผลิต',
    targetCount: 'แสดง {count} สาย จากทั้งหมด {total}',
    dayTarget: 'เป้าหมายกะเช้า',
    nightTarget: 'เป้าหมายกะกลางคืน',
    allocationFormula:
      'เป้าหมายช่วง = เป้าหมายทั้งวัน × นาทีผลิตช่วงนี้ ÷ นาทีผลิตรวมสองกะ ไม่รวมเวลาพัก และผลรวมหลังปัดยังเท่ากับทั้งวัน',
    noMappings: 'ยังไม่มีคู่หน้าที่ / สถานีที่เปิดใช้งาน โปรดเพิ่มในขั้นตอนที่ 3',
    inactiveHint:
      'บุคลากรที่ปิดใช้งานแต่เลือกไว้แล้วยังแสดงให้ตรวจสอบ แต่จะไม่เป็นค่าเริ่มต้นของบันทึกใหม่',
    defaultSnapshotHint:
      'บันทึกเดิมเก็บบุคลากร เป้าหมาย และรหัสการจับคู่เดิม การตั้งค่านี้ใช้เป็นค่าเริ่มต้นของบันทึกใหม่',
    noStation: 'ไม่ระบุสถานี',
    noJob: 'ไม่ระบุหน้าที่',
    selectLines: 'เลือกสายการผลิตจากข้อมูลหลัก',
    selectedLines: 'เลือกแล้ว {count} สาย',
    noSelectedLines: 'เลือกอย่างน้อยหนึ่งสาย เพื่อแสดงการตั้งค่าของสายที่เลือกด้านล่าง',
    batchTitle: 'เพิ่มคู่หน้าที่ / สถานีให้สายที่เลือก',
    addPair: 'เพิ่มอีกคู่',
    removePair: 'ลบคู่',
    applyMappings: 'เพิ่มการจับคู่ให้สายที่เลือก',
    automaticStaff: 'บุคลากรอัตโนมัติ · อ่านอย่างเดียว',
    automaticStaffHint:
      'ทีมสองกะกรองตามหน้าที่ ผู้รับผิดชอบมาจากคู่สาย/Model นี้ หากแสดง — ให้เพิ่มคนในหน้ามอบหมายบุคลากร',
    mappingStatus: 'การจับคู่ที่เปิดใช้งาน',
    removeMapping: 'ลบ',
    mappingJob: 'หน้าที่',
    mappingStation: 'สถานี',
    none: 'ไม่มี',
    actions: 'จัดการ',
    status: 'สถานะ',
    line: 'สายการผลิต',
  },
};

function resolveLanguage(language) {
  const value = language || globalThis.document?.documentElement.lang || 'en';
  return value.startsWith('zh') ? 'zh' : value.startsWith('th') ? 'th' : 'en';
}

function labels(language) {
  const dictionary = workforceMessages[resolveLanguage(language)];
  return (key, params = {}) =>
    dictionary[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}

/** IDs are draft identifiers, not secrets; HTTP LAN browsers may lack randomUUID. */
export function createSettingsId(prefix = 'new', cryptoProvider = globalThis.crypto) {
  const suffix =
    cryptoProvider?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export const setupSteps = [
  'structure',
  'targets',
  'personnel',
  'staffing',
  'workforce',
  'groups',
  'alerts',
  'appearance',
];
export const setupTitleKeys = {
  groups: 'groupSettings',
  alerts: 'alertSettings',
};

function validCatalog(values) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.length <= 200 &&
    values.every((value) => typeof value === 'string' && value.trim() && value.length <= 60) &&
    new Set(values.map((value) => value.trim().toLocaleLowerCase())).size === values.length
  );
}

/** Readiness is guidance, never a replacement for server configuration validation. */
export function scheduleReadiness(schedules) {
  const ranges = [];
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  for (const shift of ['day', 'night']) {
    const slots = schedules?.[shift];
    if (
      !Array.isArray(slots) ||
      !slots.length ||
      slots.length > 48 ||
      !slots.some((slot) => slot?.kind === 'production')
    )
      return false;
    for (const slot of slots) {
      if (
        !slot ||
        !['production', 'break'].includes(slot.kind) ||
        !timePattern.test(slot.start) ||
        !timePattern.test(slot.end)
      )
        return false;
      const start = minutes(slot.start),
        end = minutes(slot.end);
      const duration = (end - start + 1440) % 1440;
      if (!duration || duration > 720) return false;
      if (end > start) ranges.push([start, end]);
      else ranges.push([start, 1440], [0, end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return ranges.every((range, index) => index === 0 || range[0] >= ranges[index - 1][1]);
}

/** Matches production defaults: job-filtered active teams, line-level owners. */
export function mappingStaff(draft, row) {
  const people = new Map(
    (draft.personnel || [])
      .filter((person) => person.active)
      .map((person) => [person.id, person]),
  );
  const staffing = staffingFor(draft, row);
  return Object.fromEntries(
    ['day', 'night', 'owners'].map((field) => [
      field,
      [...new Set(staffing[field] || [])]
        .map((id) => people.get(id))
        .filter(
          (person) => person && (field === 'owners' || !row.job || person.job === row.job),
        ),
    ]),
  );
}

/** Add/remove one existing directory person without rebuilding any other team's
 * assignments. Inactive selections remain removable but cannot be added anew. */
export function changeStaffAssignment(draft, unit, field, personId, add = true) {
  if (!['day', 'night', 'owners'].includes(field)) return false;
  const configured = unitFor(draft, unit);
  if (!configured) return false;
  const person = (draft.personnel || []).find((person) => person.id === personId);
  if (add && (!person?.active || !draft.jobs.includes(person.job))) return false;
  const staffing = configured.staffing || {};
  const selected = staffing[field] || [];
  if (add ? selected.includes(personId) : !selected.includes(personId)) return false;
  configured.staffing = staffing;
  staffing[field] = add ? [...selected, personId] : selected.filter((id) => id !== personId);
  return true;
}

/** Candidates are limited to one job and exclude people already in this role. */
export function staffCandidates(draft, unit, field, job) {
  if (
    !unitFor(draft, unit) ||
    !['day', 'night', 'owners'].includes(field) ||
    !draft.jobs.includes(job)
  )
    return [];
  const selected = staffingFor(draft, unit)[field] || [];
  return (draft.personnel || []).filter(
    (person) => person.active && person.job === job && !selected.includes(person.id),
  );
}

/** Validate the entire checkbox batch before changing the draft. This prevents
 * a stale/invalid selection from adding only part of a team. Other jobs, roles
 * and line/model combinations retain their existing assignments. */
export function addStaffAssignments(draft, unit, field, job, personIds) {
  if (!Array.isArray(personIds) || !personIds.length) return false;
  const available = new Set(
    staffCandidates(draft, unit, field, job).map((person) => person.id),
  );
  const ids = [...new Set(personIds)];
  if (ids.some((id) => !available.has(id))) return false;
  const configured = unitFor(draft, unit);
  configured.staffing ||= {};
  configured.staffing[field] = [...(configured.staffing[field] || []), ...ids];
  return true;
}

/** Only show the chosen job's unassigned people in a bounded checkbox list.
 * Checkboxes work with touch and keyboard without modifier keys. Rendering
 * filters pending selections against current candidates without mutating data. */
export function staffPickerMarkup({ draft, unit, field, job, personIds = [], esc, language }) {
  const text = labels(language);
  const candidates = naturalOrder(
    staffCandidates(draft, unit, field, job),
    language,
    (person) => person.name,
  );
  const selected = new Set(Array.isArray(personIds) ? personIds : []);
  const count = candidates.filter((person) => selected.has(person.id)).length;
  const jobPeople = (draft.personnel || []).filter((person) => person.job === job);
  const needsPeople = draft.jobs.includes(job) && !jobPeople.some((person) => person.active);
  const emptyMessage = !draft.jobs.includes(job)
    ? 'chooseJobFirst'
    : !jobPeople.length
      ? 'noPeopleForJob'
      : needsPeople
        ? 'noActivePeopleForJob'
        : 'noMorePeople';
  return `<div class="staff-picker-heading"><span data-staff-selection-count aria-live="polite">${esc(text('selectedPeopleCount', { count }))}</span></div>
    <div class="staff-picker-tools">
      <button type="button" class="button ghost" data-action="staff-select-all" ${count === candidates.length ? 'disabled' : ''}>${esc(text('selectAllPeople'))}</button>
      <button type="button" class="button ghost" data-action="staff-clear-selection" ${count ? '' : 'disabled'}>${esc(text('clearPeople'))}</button>
    </div>
    <div class="staff-candidates" role="group" aria-label="${esc(text('choosePeople'))}">${
      candidates
        .map(
          (person) =>
            `<label class="staff-candidate"><input type="checkbox" data-staff-person value="${esc(person.id)}" ${selected.has(person.id) ? 'checked' : ''}><span>${esc(person.name)}</span></label>`,
        )
        .join('') ||
      `<p class="settings-empty">${esc(text(emptyMessage))}</p>${needsPeople ? `<button type="button" class="button staff-manage-people" data-action="staff-manage-people">${esc(text('manageJobPeople'))}</button>` : ''}`
    }</div>`;
}

/** Explicit pair creation prevents a large lines × models checkbox matrix.
 * Existing pairs, targets and assignments are only read while rendering. */
export function lineModelsMarkup({
  draft,
  esc,
  icon,
  language,
  selectedLine = '',
  addLine = '',
  addModel = '',
}) {
  const text = labels(language);
  const units = byProduction(productionUnits(draft), language);
  const line = draft.lines.includes(selectedLine) ? selectedLine : '';
  const people = new Map((draft.personnel || []).map((person) => [person.id, person]));
  const access = setupAccess(draft).staffing;
  const chosenLine = draft.lines.includes(addLine) ? addLine : '';
  const chosenModel = draft.models?.includes(addModel) ? addModel : '';
  const duplicate =
    chosenLine && chosenModel && !!unitFor(draft, { line: chosenLine, model: chosenModel });
  return `<section class="panel model-assignment-panel"><h3>${esc(text('lineModelsTitle'))}</h3><p>${esc(text('lineModelsDescription'))}</p>
    <div class="unit-add-form">
      <label>${esc(text('line'))}<select data-unit-add-line><option value="">${esc(text('chooseLine'))}</option>${naturalOrder(
        draft.lines,
        language,
      )
        .map(
          (value) =>
            `<option value="${esc(value)}" ${value === chosenLine ? 'selected' : ''}>${esc(value)}</option>`,
        )
        .join('')}</select></label>
      <label>Model<select data-unit-add-model><option value="">${esc(text('chooseModel'))}</option>${naturalOrder(
        draft.models || [],
        language,
      )
        .map(
          (value) =>
            `<option value="${esc(value)}" ${value === chosenModel ? 'selected' : ''}>${esc(value)}</option>`,
        )
        .join('')}</select></label>
      <button type="button" class="button primary" data-action="add-unit" ${chosenLine && chosenModel && !duplicate ? '' : 'disabled'}>${icon('plus')}${esc(text('addCombination'))}</button>
      <span data-unit-add-status role="status">${duplicate ? esc(text('combinationExists')) : ''}</span>
    </div>
    <div class="unit-list-filter"><label>${esc(text('line'))}<select data-unit-filter-line><option value="">${esc(text('allLines'))}</option>${naturalOrder(
      draft.lines,
      language,
    )
      .map(
        (value) =>
          `<option value="${esc(value)}" ${value === line ? 'selected' : ''}>${esc(value)}</option>`,
      )
      .join('')}</select></label></div>
    <div class="table-scroll"><table class="unit-assignment-table"><thead><tr><th>${esc(text('line'))}</th><th>Model</th><th>${esc(text('lineOwners'))}</th><th>${esc(text('actions'))}</th></tr></thead><tbody>${
      units
        .filter((unit) => !line || unit.line === line)
        .map((unit) => {
          const owners = (unit.staffing?.owners || [])
            .map((id) => people.get(id))
            .filter(Boolean);
          return `<tr data-configured-unit="${esc(productionKey(unit))}"><th scope="row">${esc(unit.line)}</th><td>${esc(modelOf(unit))}</td><td>${owners.length ? owners.map((person) => `<span class="unit-owner-name">${esc(person.name)}${person.active ? '' : ` (${esc(text('inactivePerson'))})`}</span>`).join('') : `<span class="muted">${esc(text('ownerNotAssigned'))}</span>`}</td><td><div class="unit-row-actions"><button type="button" class="button" data-action="unit-owner" data-unit-key="${esc(productionKey(unit))}" ${access.enabled ? '' : 'disabled'}>${esc(text('assignOwner'))}</button><button type="button" class="icon-button" data-action="remove-unit" data-unit-key="${esc(productionKey(unit))}" aria-label="${esc(text('removeCombination') + ' · ' + productionLabel(unit))}">${icon('trash')}</button></div></td></tr>`;
        })
        .join('') ||
      `<tr><td colspan="4" class="settings-empty">${esc(text('noCombinations'))}</td></tr>`
    }</tbody></table></div>
    <p class="form-hint">${esc(text('combinationOwnerHint'))}</p></section>`;
}

const mappingKey = (row) =>
  JSON.stringify([productionKey(row), row.job || null, row.station || null]);
function validMapping(draft, row) {
  return (
    draft.lines.includes(row.line) &&
    (!draft.models || (draft.models.includes(modelOf(row)) && !!unitFor(draft, row))) &&
    !!(row.job || row.station) &&
    (!row.job || draft.jobs.includes(row.job)) &&
    (!row.station || draft.stations.includes(row.station))
  );
}

export function setupReadiness(draft) {
  const structure =
    ['lines', 'jobs', 'stations', ...(draft.models ? ['models'] : [])].every((key) =>
      validCatalog(draft[key]),
    ) &&
    (!draft.productionUnits ||
      (draft.productionUnits.length > 0 &&
        draft.productionUnits.every(
          (unit) => draft.lines.includes(unit.line) && draft.models.includes(unit.model),
        ))) &&
    scheduleReadiness(draft.schedules) &&
    Object.values(draft.lineSchedules || {}).every(scheduleReadiness) &&
    (draft.scheduleTemplates || []).every((template) => scheduleReadiness(template.schedules));
  const people = draft.personnel || [];
  const validPeople =
    people.length > 0 &&
    people.every(
      (person) =>
        person.id &&
        typeof person.name === 'string' &&
        person.name.trim() &&
        person.name.length <= 200 &&
        (!person.active || draft.jobs.includes(person.job)),
    ) &&
    new Set(people.map((person) => person.id)).size === people.length;
  const activeIds = new Set(
    people.filter((person) => person.active).map((person) => person.id),
  );
  const staffing =
    validPeople &&
    productionUnits(draft).length > 0 &&
    draft.lines.length > 0 &&
    productionUnits(draft).every((unit) =>
      ['day', 'night', 'owners'].every((field) => {
        const assigned = unit.staffing?.[field] || [];
        return (
          assigned.some((id) => activeIds.has(id)) &&
          assigned.every((id) => people.some((person) => person.id === id))
        );
      }),
    );
  const rows = (draft.rows || []).filter((row) => row.active);
  const workforce =
    rows.length > 0 &&
    rows.every((row) => validMapping(draft, row)) &&
    new Set(rows.map(mappingKey)).size === rows.length &&
    productionUnits(draft).every((unit) =>
      rows.some((row) => productionKey(row) === productionKey(unit)),
    );
  const targets =
    productionUnits(draft).length > 0 &&
    productionUnits(draft).every((unit) => {
      const target = lineDailyTarget(draft, unit.line, unit.model);
      return Number.isSafeInteger(target) && target >= 0 && target <= 99999999;
    });
  return {
    structure,
    personnel: !!validPeople && people.some((person) => person.active),
    staffing,
    workforce,
    targets,
    groups: !!draft.monitoring?.groups?.length,
    alerts: !!draft.monitoring?.rules?.length,
    appearance: true,
  };
}

/** Navigation depends only on data a page actually needs, never all earlier
 * completion badges. In particular targets need no people or station mappings. */
export function setupAccess(draft) {
  const lines = validCatalog(draft.lines) && (!draft.models || validCatalog(draft.models));
  const jobs = validCatalog(draft.jobs);
  const people = (draft.personnel || []).some(
    (person) => person.active && person.name.trim() && draft.jobs.includes(person.job),
  );
  const needed = {
    structure: [],
    targets:
      lines &&
      scheduleReadiness(draft.schedules) &&
      Object.values(draft.lineSchedules || {}).every(scheduleReadiness) &&
      (draft.scheduleTemplates || []).every((template) => scheduleReadiness(template.schedules))
        ? []
        : ['structure'],
    personnel: jobs ? [] : ['structure'],
    staffing: [...(!lines ? ['structure'] : []), ...(!people ? ['personnel'] : [])],
    workforce: lines && jobs && validCatalog(draft.stations) ? [] : ['structure'],
    groups: [],
    alerts: [],
    appearance: [],
  };
  return Object.fromEntries(
    setupSteps.map((key) => [key, { enabled: needed[key].length === 0, missing: needed[key] }]),
  );
}

/** Change a mapping atomically; a failed edit leaves both the row and its ID intact. */
export function updateMapping(draft, index, patch) {
  const row = draft.rows[index];
  if (
    !row ||
    row.deleted ||
    !Object.keys(patch).every((key) =>
      ['model', 'job', 'station', 'active', 'hasOutput'].includes(key),
    ) ||
    (Object.hasOwn(patch, 'hasOutput') && typeof patch.hasOutput !== 'boolean')
  )
    return { ok: false, code: 'errMapping' };
  const next = { ...row, ...patch };
  if (next.active) {
    if (!validMapping(draft, next)) return { ok: false, code: 'errMapping' };
    if (
      draft.rows.some(
        (other, otherIndex) =>
          otherIndex !== index && other.active && mappingKey(other) === mappingKey(next),
      )
    )
      return { ok: false, code: 'errDuplicateMapping' };
  }
  if (patch.model && modelOf(row) !== patch.model) {
    // Preserve the old ID and opposite-shift snapshots when changing model.
    row.active = false;
    draft.rows.push({ ...next, id: createSettingsId(), model: patch.model });
  } else Object.assign(row, patch);
  if (
    (!row.active || !stationHasOutput(row)) &&
    draft.monitoring?.outputSources?.[row.line] === row.id
  )
    draft.monitoring.outputSources[row.line] = 'all';
  if (
    (!row.active || !stationHasOutput(row)) &&
    draft.monitoring?.unitOutputSources?.[productionKey(row)] === row.id
  )
    draft.monitoring.unitOutputSources[productionKey(row)] = 'all';
  return { ok: true };
}

/** Delete current configuration separately from temporarily disabling it.
 * Saved IDs remain internal tombstones so reports keep their original identity;
 * adding the same station later creates a new ID and fresh reporting defaults. */
export function removeMapping(draft, index) {
  if (!Number.isInteger(index) || index < 0) return { ok: false, code: 'errMapping' };
  const row = draft.rows[index];
  const result = updateMapping(draft, index, { active: false });
  if (!result.ok) return result;
  if (typeof row.id === 'string') draft.rows.splice(index, 1);
  else row.deleted = true;
  return { ok: true };
}

/** Reorder only this line/model's visible identities. Other units and historical
 * tombstones keep their array positions; IDs, presets and people never change. */
export function reorderMapping(draft, sourceId, targetId, after = false) {
  const source = draft.rows.find((row) => row.id === sourceId && !row.deleted);
  const target = draft.rows.find((row) => row.id === targetId && !row.deleted);
  if (!source || !target || productionKey(source) !== productionKey(target))
    return { ok: false, code: 'errMapping' };
  if (sourceId === targetId) return { ok: true, changed: false };
  const indexes = draft.rows.flatMap((row, index) =>
    !row.deleted && productionKey(row) === productionKey(source) ? [index] : [],
  );
  const rows = indexes.map((index) => draft.rows[index]);
  const previous = [...rows];
  rows.splice(rows.indexOf(source), 1);
  rows.splice(rows.indexOf(target) + (after ? 1 : 0), 0, source);
  if (rows.every((row, index) => row === previous[index])) return { ok: true, changed: false };
  // Source selection must not depend on the last row after a reorder.
  const output = outputSourceFor(draft, source);
  if (output != null && draft.monitoring) {
    draft.monitoring.unitOutputSources ||= {};
    draft.monitoring.unitOutputSources[productionKey(source)] = output;
  }
  indexes.forEach((index, position) => (draft.rows[index] = rows[position]));
  return { ok: true, changed: true };
}

/** Batch pairs apply to selected catalog lines only. Existing inactive IDs are reused. */
export function addBatchMappings(
  draft,
  selectedLines,
  pairs,
  idFactory = createSettingsId,
  selectedModel = null,
) {
  const lines = [...new Set(selectedLines)].filter((line) => draft.lines.includes(line));
  if (!lines.length || !pairs.length) return { ok: false, code: 'errMapping' };
  const units = productionUnits(draft).filter(
    (unit) => lines.includes(unit.line) && (!selectedModel || unit.model === selectedModel),
  );
  if (!units.length) return { ok: false, code: 'errMapping' };
  const combinations = units.flatMap(({ line, model }) =>
    pairs.map((pair) => ({
      line,
      ...(draft.models ? { model } : {}),
      job: pair.job || null,
      station: pair.station || null,
    })),
  );
  if (combinations.some((row) => !validMapping(draft, row)))
    return { ok: false, code: 'errMapping' };
  const active = new Set(draft.rows.filter((row) => row.active).map(mappingKey));
  const pending = [];
  let skipped = 0;
  for (const row of combinations) {
    const key = mappingKey(row);
    if (active.has(key)) {
      skipped++;
      continue;
    }
    active.add(key);
    pending.push({
      row,
      archived: draft.rows.find(
        (other) => !other.active && !other.deleted && mappingKey(other) === key,
      ),
    });
  }
  if (draft.rows.length + pending.filter((item) => !item.archived).length > 2000)
    return { ok: false, code: 'errRows' };
  for (const { row, archived } of pending) {
    if (archived) archived.active = true;
    else
      draft.rows.push({
        ...row,
        id: idFactory(),
        plant: draft.plant,
        active: true,
        dailyTarget: null,
      });
  }
  if (draft.monitoring) {
    draft.monitoring.unitOutputSources ||= {};
    for (const unit of units) {
      const key = productionKey(unit);
      const chosen = draft.monitoring.unitOutputSources[key];
      if (
        !draft.rows.some((row) => row.active && productionKey(row) === key && row.id === chosen)
      )
        draft.monitoring.unitOutputSources[key] = outputSourceFor(draft, unit);
    }
  }
  return { ok: true, added: pending.length, skipped };
}

function selectOptions(values, selected, text, esc, language) {
  const available = [...values, ...(selected && !values.includes(selected) ? [selected] : [])];
  return (
    `<option value="">${esc(text('none'))}</option>` +
    naturalOrder(available, language)
      .map(
        (value) =>
          `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`,
      )
      .join('')
  );
}

/** Both the directory and its filters use current job catalogs only. */
export function workforceSettingsMarkup({ draft, esc, icon, language, selectedJob = null }) {
  const text = labels(language);
  const people = draft.personnel || [];
  const jobs = naturalOrder(draft.jobs, language);
  const job = selectedJob === '' || jobs.includes(selectedJob) ? selectedJob : jobs[0] || '';
  const panels = jobs
    .filter((value) => !job || value === job)
    .map((job) => {
      const members = people
        .map((person, index) => ({ person, index }))
        .filter(({ person }) => person.job === job);
      const sortedMembers = naturalOrder(members, language, ({ person }) => person.name);
      return `<section class="panel personnel-panel">
      <div class="panel-heading">
        <h3>${esc(job)}</h3>
        <button type="button" class="button" data-workforce-action="add-person" data-person-job="${esc(job)}">${icon('plus')}${esc(text('addPerson'))}</button>
      </div>
      <div class="personnel-list">${
        sortedMembers
          .map(
            ({ person, index }) => `<div class="personnel-row">
        <label><span>${esc(text('personName'))}</span><input id="person-name-${index}" data-person-field="name" data-person-index="${index}" value="${esc(person.name)}" maxlength="200" required></label>
        <label><span>${esc(text('personJob'))}</span><select data-person-field="job" data-person-index="${index}" aria-label="${esc(text('personJob') + ' · ' + person.name)}">${naturalOrder(
          draft.jobs,
          language,
        )
          .map(
            (value) =>
              `<option value="${esc(value)}" ${value === person.job ? 'selected' : ''}>${esc(value)}</option>`,
          )
          .join('')}</select></label>
        <label class="switch-label"><input type="checkbox" data-person-field="active" data-person-index="${index}" ${person.active ? 'checked' : ''}><span>${esc(text('activePerson'))}</span></label>
        <button type="button" class="icon-button" data-workforce-action="remove-person" data-person-index="${index}" aria-label="${esc(text('removePerson'))}: ${esc(person.name)}">${icon('trash')}</button>
      </div>`,
          )
          .join('') || `<p class="settings-empty">${esc(text('noPeople'))}</p>`
      }</div>
    </section>`;
    })
    .join('');
  return `<div class="settings-section-heading"><div><h2>${esc(text('peopleTitle'))}</h2><p>${esc(text('peopleDescription'))}</p></div></div>
    <div class="panel target-filter"><label for="person-job-filter">${esc(text('jobFilter'))}</label><select id="person-job-filter" data-person-job-filter><option value="" ${job === '' ? 'selected' : ''}>${esc(text('allJobs'))}</option>${naturalOrder(
      draft.jobs,
      language,
    )
      .map(
        (value) =>
          `<option value="${esc(value)}" ${value === job ? 'selected' : ''}>${esc(value)}</option>`,
      )
      .join('')}</select></div>
    <p class="form-hint">${esc(text('jobLinkHint'))}</p>
    ${panels || `<div class="calculation-note">${icon('info')}<span>${esc(text('noJobs'))}</span></div>`}
    <p class="form-hint">${esc(text('defaultSnapshotHint'))}</p>`;
}

/** Line/model filtering changes only visibility. Team edits are explicit adds
 * and removals; no unselected directory people are rendered as a long list. */
export function lineStaffingMarkup({
  draft,
  esc,
  icon,
  language,
  selectedLine = null,
  selectedModel = '',
  choices = {},
}) {
  const text = labels(language);
  const units = byProduction(productionUnits(draft), language);
  const lines = [...new Set(units.map((unit) => unit.line))];
  const line =
    selectedLine === '' || lines.includes(selectedLine) ? selectedLine : lines[0] || '';
  const models = naturalOrder(
    [...new Set(units.filter((unit) => !line || unit.line === line).map(modelOf))],
    language,
  );
  const model = models.includes(selectedModel) ? selectedModel : '';
  const people = new Map((draft.personnel || []).map((person) => [person.id, person]));
  const fields = { day: 'dayStaff', night: 'nightStaff', owners: 'lineOwners' };
  const cards = units
    .filter((unit) => (!line || unit.line === line) && (!model || modelOf(unit) === model))
    .map((unit) => {
      const key = productionKey(unit);
      const staffing = unit.staffing || {};
      const roles = Object.entries(fields)
        .map(([field, label]) => {
          const choice = choices[JSON.stringify([key, field])] || {};
          // Use the master list directly: a new/empty job must remain selectable
          // so managers can see why no names are available and open its roster.
          const jobs = naturalOrder(draft.jobs, language);
          const job = jobs.includes(choice.job) ? choice.job : '';
          const candidates = naturalOrder(
            staffCandidates(draft, unit, field, job),
            language,
            (person) => person.name,
          );
          const allAssigned =
            job &&
            !candidates.length &&
            (draft.personnel || []).some((person) => person.job === job && person.active);
          const selectedIds = candidates
            .filter((person) => (choice.people || []).includes(person.id))
            .map((person) => person.id);
          return (
            '<fieldset class="staff-assignment" data-staff-unit="' +
            esc(key) +
            '" data-staff-role="' +
            field +
            '"><legend>' +
            esc(text(label)) +
            '</legend>' +
            '<div class="staff-add-controls"><label>' +
            esc(text('personJob')) +
            '<select data-staff-job><option value="">' +
            esc(text('chooseJob')) +
            '</option>' +
            jobs
              .map(
                (value) =>
                  '<option value="' +
                  esc(value) +
                  '" ' +
                  (value === job ? 'selected' : '') +
                  '>' +
                  esc(value) +
                  '</option>',
              )
              .join('') +
            '</select></label>' +
            '<div class="staff-person-picker">' +
            staffPickerMarkup({
              draft,
              unit,
              field,
              job,
              personIds: selectedIds,
              esc,
              language,
            }) +
            '</div>' +
            '<button type="button" class="button" data-action="add-staff-person" ' +
            (selectedIds.length ? '' : 'disabled') +
            '>' +
            icon('plus') +
            '<span data-staff-add-label>' +
            esc(text('addStaffSelected', { count: selectedIds.length })) +
            '</span>' +
            '</button></div>' +
            '<p class="staff-add-hint" data-staff-add-hint>' +
            esc(text(allAssigned ? 'noMorePeople' : 'staffAddHint')) +
            '</p>' +
            '<ul class="staff-assigned-list">' +
            (staffing[field] || [])
              .map((id) => {
                const person = people.get(id);
                return (
                  '<li><span><strong>' +
                  esc(person?.name || id) +
                  '</strong><small>' +
                  esc(person?.job || text('noJob')) +
                  (!person?.active ? ' · ' + esc(text('inactivePerson')) : '') +
                  '</small></span><button type="button" class="icon-button" data-action="remove-staff-person" data-person-id="' +
                  esc(id) +
                  '" aria-label="' +
                  esc(text('removePerson') + ' · ' + (person?.name || id)) +
                  '">' +
                  icon('close') +
                  '</button></li>'
                );
              })
              .join('') +
            '</ul>' +
            (!(staffing[field] || []).length
              ? '<p class="settings-empty">' + esc(text('noAssignedPeople')) + '</p>'
              : '') +
            '</fieldset>'
          );
        })
        .join('');
      return (
        '<section class="panel staff-line-panel" data-staffing-unit="' +
        esc(key) +
        '"><div class="panel-heading"><h3>' +
        (draft.models ? productionIdentityMarkup(unit, esc) : esc(unit.line)) +
        '</h3></div><div class="line-staffing-grid">' +
        roles +
        '</div>' +
        '</section>'
      );
    })
    .join('');
  return (
    '<div class="settings-section-heading"><div><h2>' +
    esc(text('staffingTitle')) +
    '</h2><p>' +
    esc(text('staffingDescription')) +
    '</p></div></div>' +
    '<div class="panel staffing-filters"><label>' +
    esc(text('line')) +
    '<select data-staffing-line-filter><option value="">' +
    esc(text('allLines')) +
    '</option>' +
    lines
      .map(
        (value) =>
          '<option value="' +
          esc(value) +
          '" ' +
          (value === line ? 'selected' : '') +
          '>' +
          esc(value) +
          '</option>',
      )
      .join('') +
    '</select></label><label>Model<select data-staffing-model-filter><option value="">' +
    esc(text('allModels')) +
    '</option>' +
    models
      .map(
        (value) =>
          '<option value="' +
          esc(value) +
          '" ' +
          (value === model ? 'selected' : '') +
          '>' +
          esc(value) +
          '</option>',
      )
      .join('') +
    '</select></label></div>' +
    (cards ||
      '<div class="calculation-note">' +
        icon('info') +
        '<span>' +
        esc(text('noUnits')) +
        '</span></div>') +
    '<p class="form-hint">' +
    esc(text('inactiveHint')) +
    '</p>'
  );
}

function automaticStaffMarkup(draft, row, text, esc, requireJob = false) {
  const staff = mappingStaff(draft, row);
  return `<div class="automatic-staff" data-auto-staff-line="${esc(row.line)}" data-auto-staff-model="${esc(modelOf(row))}">
    ${Object.entries({
      day: 'dayStaff',
      night: 'nightStaff',
      owners: 'lineOwners',
    })
      .map(
        ([field, key]) =>
          `<span><b>${esc(text(key))}</b><output data-auto-staff="${field}">${esc(requireJob && !row.job && field !== 'owners' ? text('chooseJob') : staff[field].map((person) => person.name).join(', ') || '—')}</output></span>`,
      )
      .join('')}
  </div>`;
}

/** Resolve only a line/model pair already enabled in master data. Native
 * dropdowns select one configured unit; no secondary model edits live in rows. */
export function mappingSelection(draft, line = null, model = null) {
  const units = byProduction(productionUnits(draft));
  const lines = [...new Set(units.map((unit) => unit.line))];
  const selectedLine = lines.includes(line) ? line : lines[0] || '';
  const models = units.filter((unit) => unit.line === selectedLine).map(modelOf);
  const selectedModel = models.includes(model) ? model : models[0] || '';
  return unitFor(draft, { line: selectedLine, model: selectedModel }) || null;
}

/** One integrated table owns add/edit/enable actions and job-matched staff.
 * Only the selected pair's nondeleted rows belong in current configuration. */
export function staffSettingsMarkup({
  draft,
  esc,
  icon,
  language,
  selectedLine = null,
  selectedModel = null,
  batchPairs = [{}],
}) {
  const text = labels(language);
  const unit = mappingSelection(draft, selectedLine, selectedModel);
  const units = byProduction(productionUnits(draft), language);
  const lines = [...new Set(units.map((item) => item.line))];
  const models = units.filter((item) => item.line === unit?.line).map(modelOf);
  const pair = batchPairs[0] || {};
  const heading =
    '<div class="settings-section-heading"><div><h2>' +
    esc(text('workforceTitle')) +
    '</h2><p>' +
    esc(text('workforceDescription')) +
    '</p></div></div>';
  if (!unit) return heading + '<p class="settings-empty">' + esc(text('noUnits')) + '</p>';
  const mappings = draft.rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !row.deleted &&
        productionKey(row) === productionKey(unit) &&
        (!row.job || draft.jobs.includes(row.job)) &&
        (!row.station || draft.stations.includes(row.station)),
    );
  const duplicate = mappings.some(
    ({ row }) => row.job === pair.job && row.station === pair.station,
  );
  return (
    heading +
    '<div class="panel staffing-filters mapping-unit-filter"><label>' +
    esc(text('line')) +
    '<select data-mapping-line-filter>' +
    lines
      .map(
        (line) =>
          '<option value="' +
          esc(line) +
          '" ' +
          (line === unit.line ? 'selected' : '') +
          '>' +
          esc(line) +
          '</option>',
      )
      .join('') +
    '</select></label><label>Model<select data-mapping-model>' +
    models
      .map(
        (model) =>
          '<option value="' +
          esc(model) +
          '" ' +
          (model === modelOf(unit) ? 'selected' : '') +
          '>' +
          esc(model) +
          '</option>',
      )
      .join('') +
    '</select></label></div>' +
    '<section class="panel mapping-panel staff-line-panel" data-mapping-unit="' +
    esc(productionKey(unit)) +
    '"><div class="panel-heading"><h3>' +
    productionIdentityMarkup(unit, esc) +
    '</h3><span>' +
    esc(text('targetLabel')) +
    ': ' +
    esc(
      unit.dailyTarget ?? lineDailyTarget(draft, unit.line, unit.model) ?? text('targetUnset'),
    ) +
    '</span></div>' +
    '<div class="mapping-output-source"><label>' +
    esc(text('outputStation')) +
    '<select data-unit-output-source="' +
    esc(productionKey(unit)) +
    '" ' +
    (mappings.some(({ row }) => row.active && stationHasOutput(row)) ? '' : 'disabled') +
    '>' +
    (mappings
      .filter(({ row }) => row.active && stationHasOutput(row))
      .map(
        ({ row }) =>
          '<option value="' +
          esc(row.id) +
          '" ' +
          (outputSourceFor(draft, unit) === row.id ? 'selected' : '') +
          '>' +
          esc((row.station || text('noStation')) + ' · ' + (row.job || text('noJob'))) +
          '</option>',
      )
      .join('') || '<option value="">' + esc(text('configureOutputStation')) + '</option>') +
    '</select></label><p>' +
    esc(text('outputStationHint')) +
    '</p></div>' +
    '<p class="mapping-inline-hint">' +
    esc(text('mappingIntegratedHint')) +
    ' ' +
    esc(text('mappingOrderHint')) +
    '</p><div class="table-scroll"><table class="mapping-table multi-line-mappings integrated-mappings"><thead><tr>' +
    ['mappingOrder', 'mappingJob', 'mappingStation', 'automaticStaff', 'status', 'actions']
      .map((key) => '<th>' + esc(text(key)) + '</th>')
      .join('') +
    '</tr></thead><tbody>' +
    mappings
      .map(
        ({ row, index }, position) =>
          '<tr class="' +
          (row.active ? '' : 'disabled-row') +
          '" data-configured-mapping="' +
          esc(row.id) +
          '"><td data-label="' +
          esc(text('mappingOrder')) +
          '"><div class="mapping-position"><button type="button" class="mapping-drag-handle" draggable="true" data-mapping-drag="' +
          esc(row.id) +
          '" aria-label="' +
          esc(text('dragMapping') + ' · ' + (position + 1)) +
          '"><span aria-hidden="true">⠿</span></button><span class="mapping-order-number">' +
          (position + 1) +
          '</span></div></td><td data-label="' +
          esc(text('mappingJob')) +
          '"><select data-row-field="job" data-index="' +
          index +
          '" aria-label="' +
          esc(text('mappingJob')) +
          '">' +
          selectOptions(draft.jobs, row.job, text, esc, language) +
          '</select></td><td data-label="' +
          esc(text('mappingStation')) +
          '"><select data-row-field="station" data-index="' +
          index +
          '" aria-label="' +
          esc(text('mappingStation')) +
          '">' +
          selectOptions(draft.stations, row.station, text, esc, language) +
          '</select></td><td data-label="' +
          esc(text('automaticStaff')) +
          '">' +
          automaticStaffMarkup(draft, row, text, esc) +
          '</td><td data-label="' +
          esc(text('status')) +
          '"><label class="switch-label"><input type="checkbox" data-row-active="' +
          index +
          '" ' +
          (row.active ? 'checked' : '') +
          '><span>' +
          esc(text('mappingStatus')) +
          '</span></label><label class="switch-label mapping-output-toggle"><input type="checkbox" data-row-output="' +
          index +
          '" ' +
          (stationHasOutput(row) ? 'checked' : '') +
          '><span>' +
          esc(text('hasOutput')) +
          '</span></label><small class="mapping-output-note">' +
          esc(text(stationHasOutput(row) ? 'outputRequired' : 'noOutputRequired')) +
          '</small></td><td data-label="' +
          esc(text('actions')) +
          '"><div class="mapping-order-controls"><button type="button" class="icon-button" data-action="mapping-up" data-index="' +
          index +
          '" aria-label="' +
          esc(text('moveUp')) +
          '" ' +
          (position === 0 ? 'disabled' : '') +
          '>↑</button><button type="button" class="icon-button" data-action="mapping-down" data-index="' +
          index +
          '" aria-label="' +
          esc(text('moveDown')) +
          '" ' +
          (position === mappings.length - 1 ? 'disabled' : '') +
          '>↓</button><button type="button" class="button mapping-delete-button" data-action="remove-mapping" data-index="' +
          index +
          '" aria-label="' +
          esc(text('removeMapping')) +
          '">' +
          icon('trash') +
          esc(text('removeMapping')) +
          '</button></div></td></tr>',
      )
      .join('') +
    (mappings.length
      ? ''
      : '<tr class="mapping-empty"><td colspan="6">' +
        esc(text('noConfiguredStations')) +
        '</td></tr>') +
    '<tr class="mapping-new-row"><td class="mapping-new-position" aria-hidden="true">—</td><td data-label="' +
    esc(text('mappingJob')) +
    '"><select data-batch-field="job" data-batch-index="0" aria-label="' +
    esc(text('newMappingJob')) +
    '">' +
    selectOptions(draft.jobs, pair.job, text, esc, language) +
    '</select></td><td data-label="' +
    esc(text('mappingStation')) +
    '"><select data-batch-field="station" data-batch-index="0" aria-label="' +
    esc(text('newMappingStation')) +
    '">' +
    selectOptions(draft.stations, pair.station, text, esc, language) +
    '</select></td><td data-label="' +
    esc(text('automaticStaff')) +
    '">' +
    automaticStaffMarkup(draft, { ...unit, job: pair.job || null }, text, esc, true) +
    '</td><td colspan="2"><button type="button" class="button primary" data-action="add-batch-mappings" ' +
    (draft.jobs.includes(pair.job) && draft.stations.includes(pair.station) && !duplicate
      ? ''
      : 'disabled') +
    '>' +
    icon('plus') +
    esc(text('addActiveMapping')) +
    '</button>' +
    (duplicate ? '<p class="form-hint">' + esc(text('duplicateMapping')) + '</p>' : '') +
    '</td></tr>' +
    '</tbody></table></div><p class="mapping-inline-hint">' +
    esc(text('mappingDeletionHint')) +
    '</p><p class="mapping-inline-hint">' +
    esc(text('automaticStaffHint')) +
    '</p></section><p class="form-hint">' +
    esc(text('defaultSnapshotHint')) +
    '</p>'
  );
}

/** Catalog lines own targets even before any job/station mappings exist. */
export function targetsSettingsMarkup({ draft, esc, language, selectedLine = null }) {
  const text = labels(language);
  const line =
    selectedLine === '' || draft.lines.includes(selectedLine)
      ? selectedLine
      : byProduction(productionUnits(draft), language)[0]?.line || draft.lines[0] || '';
  const lines = draft.lines.filter((value) => !line || value === line);
  return `<div class="settings-section-heading"><div><h2>${esc(text('targetTitle'))}</h2><p>${esc(text('targetDescription'))}</p></div></div>
    <div class="panel target-filter"><label for="target-line">${esc(text('line'))}</label><select id="target-line" data-target-line><option value="">${esc(text('allLines'))}</option>${naturalOrder(
      draft.lines,
      language,
    )
      .map(
        (value) =>
          `<option value="${esc(value)}" ${line === value ? 'selected' : ''}>${esc(value)}</option>`,
      )
      .join(
        '',
      )}</select><span role="status">${esc(text('targetCount', { count: lines.length, total: draft.lines.length }))}</span></div>
    <section class="panel targets-panel"><div class="table-scroll"><table class="targets-table"><thead><tr>${['line', ...(draft.models ? ['model'] : []), 'targetLabel', 'dayTarget', 'nightTarget', 'plannedUPH'].map((key) => `<th>${esc(text(key))}</th>`).join('')}</tr></thead><tbody>${
      byProduction(productionUnits(draft), language)
        .filter((unit) => lines.includes(unit.line))
        .map(
          (unit) =>
            `<tr><th scope="row" class="target-line-name">${esc(unit.line)}</th>${draft.models ? `<td class="target-model-name" data-label="Model">${esc(unit.model)}</td>` : ''}<td class="target-daily-value" data-label="${esc(text('targetLabel'))}"><input type="number" min="0" max="99999999" step="1" inputmode="numeric" data-line-target="${esc(unit.line)}" ${draft.models ? `data-target-model="${esc(unit.model)}"` : ''} value="${lineDailyTarget(draft, unit.line, unit.model) ?? ''}" placeholder="${esc(text('targetUnset'))}" aria-label="${esc(productionLabel(unit) + ' ' + text('targetLabel'))}"></td>${['day', 'night'].map((shift) => `<td class="target-shift-value" data-label="${esc(text(shift === 'day' ? 'dayTarget' : 'nightTarget'))}"><output data-target-preview="${shift}">${esc(shiftTarget(draft, unit.line, shift, unit.model))}</output>${plannedSummary(draft, unit, shift, text, esc)}</td>`).join('')}<td class="target-plan-value" data-label="${esc(text('plannedUPH'))}">${plannedSummary(draft, unit, 'all', text, esc)}</td></tr>`,
        )
        .join('') ||
      `<tr><td colspan="${draft.models ? 6 : 5}">${esc(text('noUnits'))}</td></tr>`
    }</tbody></table></div></section><p class="form-hint">${esc(text('allocationFormula'))}</p><p class="form-hint">${esc(text('defaultSnapshotHint'))}</p>`;
}

const planNumber = (value) =>
  value == null || !Number.isFinite(value) ? '—' : String(Number(value.toFixed(2)));
function plannedSummary(draft, unit, shift, text, esc) {
  const plan = plannedProduction(
    draft,
    lineDailyTarget(draft, unit.line, unit.model),
    unit.line,
    shift,
  );
  return `<span class="planned-summary"><span>${shift === 'all' ? '' : esc(text('plannedUPH')) + ' '}<output data-planned-scope="${shift}" data-planned-field="uph">${planNumber(plan.uph)}</output></span><small>${esc(text('effectiveHours'))} <output data-planned-scope="${shift}" data-planned-field="hours">${planNumber(plan.hours)}</output></small></span>`;
}
function updatePlannedPreview(draft, element) {
  const { lineTarget, targetModel } = element.dataset;
  for (const output of element.closest?.('tr')?.querySelectorAll('[data-planned-scope]') ||
    []) {
    const plan = plannedProduction(
      draft,
      lineDailyTarget(draft, lineTarget, targetModel),
      lineTarget,
      output.dataset.plannedScope,
    );
    output.textContent = planNumber(plan[output.dataset.plannedField]);
  }
}

function shiftTarget(draft, line, shift, model) {
  const target = lineDailyTarget(draft, line, model);
  if (!Number.isInteger(target) || target < 0 || target > 99999999) return '—';
  return allocateDailyTarget(draft, target, line)
    .filter((slot) => slot.shift === shift)
    .reduce((sum, slot) => sum + slot.target, 0);
}

/** Numbers remain unrounded; invalid fractions must fail normal config validation. */
export function handleWorkforceChange(draft, element) {
  if (!element?.dataset) return false;
  const data = element.dataset;
  if (data.personField !== undefined) {
    const index = Number(data.personIndex);
    if (!Number.isInteger(index) || index < 0 || data.personIndex === '') return false;
    const person = draft.personnel?.[index];
    if (!person || !['name', 'job', 'active'].includes(data.personField)) return false;
    if (data.personField === 'job' && !draft.jobs.includes(element.value)) return false;
    if (data.personField === 'active' && element.checked && !draft.jobs.includes(person.job))
      return false;
    person[data.personField] =
      data.personField === 'active' ? element.checked : element.value.trim();
    return true;
  }
  if (data.lineTarget !== undefined) {
    if (!draft.lines.includes(data.lineTarget)) return false;
    if (data.targetModel !== undefined) {
      const unit = unitFor(draft, { line: data.lineTarget, model: data.targetModel });
      if (!unit) return false;
      unit.dailyTarget = element.value.trim() === '' ? null : Number(element.value);
      updatePlannedPreview(draft, element);
      for (const output of element.closest?.('tr')?.querySelectorAll('[data-target-preview]') ||
        [])
        output.textContent = shiftTarget(
          draft,
          data.lineTarget,
          output.dataset.targetPreview,
          data.targetModel,
        );
      return true;
    }
    draft.lineTargets ||= Object.fromEntries(
      draft.lines.map((line) => [line, lineDailyTarget(draft, line)]),
    );
    Object.defineProperty(draft.lineTargets, data.lineTarget, {
      value: element.value.trim() === '' ? null : Number(element.value),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    updatePlannedPreview(draft, element);
    for (const output of element.closest?.('tr')?.querySelectorAll('[data-target-preview]') ||
      [])
      output.textContent = shiftTarget(draft, data.lineTarget, output.dataset.targetPreview);
    return true;
  }
  return false;
}

/** Removing a person clears current assignments, never saved production snapshots. */
export function handleWorkforceAction(draft, button) {
  const data = button?.dataset;
  if (!data?.workforceAction) return { handled: false };
  if (data.workforceAction === 'add-person') {
    const job = data.personJob || draft.jobs[0];
    if (!draft.jobs.includes(job)) return { handled: true, rerender: false };
    draft.personnel ||= [];
    const index = draft.personnel.length;
    draft.personnel.push({
      id: createSettingsId('person'),
      name: '',
      job,
      active: true,
    });
    return { handled: true, rerender: true, focusId: `person-name-${index}` };
  }
  if (data.workforceAction === 'remove-person') {
    const index = Number(data.personIndex);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      data.personIndex === '' ||
      index >= (draft.personnel?.length || 0)
    )
      return { handled: true, rerender: false };
    removePersonnel(draft, [draft.personnel[index].id]);
    return { handled: true, rerender: true };
  }
  return { handled: false };
}
