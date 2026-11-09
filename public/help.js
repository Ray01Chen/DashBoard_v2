/** Role-specific setup and reporting instructions, kept aligned with the controls. */
const guides = {
  en: {
    manager: 'Manager guide',
    member: 'Member guide',
    managerIntro:
      'Set up the factory in order, then use the same production and monitoring pages as the reporting team.',
    memberIntro:
      'Enter Target and Actual in compact station rows. Open a one-line issue preview to edit notes; report changes do not change the daily preset.',
    quickTitle: 'Start here',
    managerSteps: [
      'Create master data and shift times.',
      'Set daily targets.',
      'Create people by job, assign teams and owners, then configure stations.',
      'Save settings, enter production and review the board.',
    ],
    memberSteps: [
      'Open Production entry and check production date, Line and Model. All configured stations appear below.',
      'Enter or adjust Target and enter Actual / Issue separately for each station and interval.',
      'Leave the cell to save and confirm Saved. Check station day/night and whole-day target totals.',
      'Review the output station’s totals, trends and fullscreen details.',
    ],
    sections: [
      {
        managerOnly: true,
        title: '1–8 · Configure the production workspace',
        paragraphs: [
          '1. Master data & shift times: maintain Lines, Models, Jobs, Stations and one English issue quick-text list. Choose Line and Model from dropdowns to add each allowed combination; a line may have several models. Define non-overlapping production and break intervals for both shifts.',
          '2. Daily targets: each line/model has one daily preset. Every station starts with that preset divided by production minutes across both shifts, excluding breaks. People and station mappings are not prerequisites for setting the preset.',
          '3. People by job: the complete master job list includes empty jobs. Add or activate people under the correct job. Removing a job deletes its directory people and assignments when settings are saved; captured historical names remain.',
          '4. Assign people to lines: choose Line and Model, then Job in Day, Night or Owners. Tick multiple names and Add selected. The same job may have several people in either shift. Clear selection only clears pending ticks; X removes an assigned person. Empty-job guidance opens that roster.',
          '5. Line configuration: choose an existing Line and one of its configured Models using dropdowns. The same table contains Job, Station, automatic day/night teams and owners, Active and actions. Select Job / Station in the last row and Add and enable. There is no second model selector inside rows. Editing Job immediately updates matching people.',
          'Only configurations for the selected Line/Model appear. Uncheck Active to pause a station and keep the row for later. Delete removes the row from the draft; Save settings publishes its removal. Reloading keeps it deleted. Old models are not suggested or copied. Adding the same job/station after deletion creates a new configuration; saved historical reports retain the old identity.',
          'Drag the grip in the far-left Order column to move a station before or after another station in the same Line/Model. Its sequence number follows the grip. Job and Station inputs are aligned; up/down buttons are in Actions for keyboard or phone use. Save settings publishes the order to entry, details and exports without changing station identities, people, targets or the selected output source.',
          'Produces output is separate from Active. Keep a station Active and uncheck Produces output to show it without production entry. Its captured reports remain read-only; batch fill and Excel templates skip it, and import rejects changes to it. Output station choices include only enabled output-producing stations. Re-enabling output restores entry without erasing prior values. Existing stations produce output by default.',
          'Select Output station in this same panel. Only enabled stations are offered. The selected station supplies this line/model’s dashboard Target, Actual, Gap and alerts; other stations retain independent reports. If no station is enabled, the control explains what to add first.',
          '6. Groups organize physical lines and their models. 7. Alerts & refresh configures rules. 8. Language & appearance sets shared defaults. Save settings at top/bottom publishes the draft; Save draft stays in this browser/account. Load saved settings confirms before discarding modified drafts. Version conflicts preserve the draft.',
        ],
      },
      {
        managerOnly: true,
        title: 'One line + model preset, two shifts and editable reports',
        paragraphs: [
          'Each enabled line/model has one default daily target. Every station receives its own interval targets using: daily target × interval production minutes ÷ total production minutes across day and night. Breaks are excluded; integer rounding preserves each station’s daily total.',
          'Example: daily preset 1,000, total production 500 minutes, 20-minute interval → 40 per station. Changing one station’s interval Target to 50 changes only that station’s report-day total to 1,010. Other stations, other dates and the 1,000 preset remain unchanged. Blank means unknown; zero is an explicit zero.',
          'Source selection affects monitoring, not station entry. Changing the output station for an enabled unit immediately changes its displayed source. Retired combinations use their captured historical source. Saved personnel, station identities and production intervals remain captured.',
        ],
      },
      {
        title: 'Enter production and confirm it saved',
        paragraphs: [
          'Choose production date, Line and Model; all stations are listed without a station selector. Each station row has Target, Actual and Issue for every interval. Counts and notes are independent across stations, models and shifts.',
          'If a configured combination has no enabled stations, the page retains its Line/Model choices and shows the daily-target allocation preview. Managers can open the exact Line configuration; members are told to contact a manager. Preview fields do not save production. Enable stations and Save settings before entering results.',
          'Whole-day spreadsheet shows both shifts. Each station has adjacent Target/Actual inputs and a one-line issue preview. The fixed left column includes station, job and day/night/whole-day totals; personnel are in production details.',
          'Use Fill interval at the left of the command bar. Choose date, Line, Model and interval. Apply Target, Actual or Issue to all stations, then edit individual cells; Apply keeps the window open. Blank shared fields preserve values; 0 writes zero.',
          'Changing date, Line, Model or interval saves the current scope before loading the destination. Save now keeps the window open. X, Esc or clicking outside saves and closes, then returns entry to the selected destination.',
          'Invalid values or version conflicts keep drafts open; no part of a conflicting batch is saved. Refresh preview, review changed fields and save again.',
          'Click Add issue or its one-line preview to open the note editor for the displayed station/date/interval. English quick text comes from the Master data list; edit freely, use Enter for new lines, or Clear note to remove text. Done, Esc, a click outside or Ctrl+Enter closes and saves. Opening a note without changes does not write data; long notes never enlarge the table row.',
          'Click another numeric cell to autosave and confirm Saved. Blank is not reported; 0 is confirmed zero production. Day/Night switches to that whole shift; Go to current time slot selects the active Bangkok interval. Tab moves across intervals within the same field, Enter moves down stations, F2 opens the current cell’s issue, and Ctrl+Enter returns to that cell. For multirow paste, odd rows are Target and even rows Actual for successive stations. Excel offers whole-day or single-shift templates and imports.',
          'Invalid values and unresolved saves prevent leaving the page. Review latest shows only the affected station. Use latest data or Save my changed cells merges changed cells against the latest version. Other stations are never overwritten.',
        ],
      },
      {
        title: 'Import an Excel report',
        paragraphs: [
          'Download the template for the production date and shift. Keep Row ID, Line, Model, Job, Station, interval, date and shift identifiers. Fill Target, Actual and Issue on each station’s own rows; different station counts are valid.',
          'For CSV, provide Row ID + Time slot, or an unambiguous Line + Model + Job/Station + Time slot. Line/model alone is rejected when it matches several stations. Blank cells keep saved values; 0 writes zero. Excel offers whole-day or single-shift templates and imports.',
          'Preview checks mappings, intervals, values and versions. Fix errors before importing. Any stale station or configuration version rejects the entire import. Saved historical station and interval identifiers remain supported.',
        ],
      },
      {
        title: 'Overview, details and full-screen board',
        paragraphs: [
          'Overview shows one row per line/model using its selected output station. Group totals add these unit results, not all station entries, so products passing several stations are not counted repeatedly. Source labels identify the station being monitored.',
          'Normal line clicks open details. Full screen clicks open a station-detail dialog; X or Esc returns to the same group/page. The board shows at most seven units per page and reserves space for wrapped model names and charts. Use paging to view the remaining units.',
          'Display options independently toggle group trend and output share. Missing output remains blank rather than invented as zero. Station issues and captured personnel are visible in details.',
        ],
      },
      {
        title: 'Read output status and alerts',
        paragraphs: [
          'Output status compares actual output with a comparable target. Monitoring status describes whether the selected shift is active, on break, historical, or outside production hours. A historical shift is not a live alarm.',
          'Shortfall rules check the configured target gap. No-increase rules check how long reported output has not increased. Their timer pauses during configured breaks and outside the shift. This is based on saved reports, not an automatic machine connection.',
          'Warning colours come from the enabled rules. When several rules match, the highest-priority matching colour is shown. Only the card border flashes when flashing is enabled; content stays steady.',
          'Refresh now retrieves the latest saved reports. Automatic refresh follows the seconds chosen by the manager. Keep in mind that an unsaved change on another person’s page is not yet available to the board.',
        ],
      },
      {
        title: 'Accounts, language and data',
        paragraphs: [
          'Managers configure shared presets and assignments. Members enter each station’s targets/actuals and issue notes, import and review reports; shared Settings are unavailable to members.',
          'Use the language control for English, Chinese or Thai and the theme control for your preferred colour. These browser preferences do not change another user’s view.',
          'Line/model headings omit the Model prefix. A name is split at its first hyphen: ECD16010094 appears on the first model line and (ORV3-PSU-3KW-AutoLine) on the second. Names without a hyphen use one line. The stored name and Excel identifiers are unchanged.',
          'Each page has its own address: /overview, /details, /entry and /guide. Managers also have a separate /settings/... address for every setup step. Direct links, refresh and browser Back/Forward work; settings steps share the same unsaved draft. Leaving Settings still checks unsaved work, and members cannot open shared settings.',
          'Data is stored by the server in SQLite. Several people may work at once; changes to the same record are checked by version so one person’s stale data cannot silently overwrite another person’s save.',
        ],
      },
    ],
  },
  zh: {
    manager: '管理員操作指南',
    member: '填報員操作指南',
    managerIntro: '依序完成現場設定，再使用生產填報、細節總覽及全螢幕看板管理產線。',
    memberIntro:
      '以精簡站點列填 Target、Actual，異常點一行摘要開啟編輯；修改填報不會改變預設日目標。',
    quickTitle: '快速開始',
    managerSteps: [
      '建立基礎清單及早晚班時間。',
      '設定日目標。',
      '依職務建立人員，再分配班員及負責人，最後配置站點。',
      '儲存設定，用整合表填報並查看看板。',
    ],
    memberSteps: [
      '開啟生產填報，確認生產日期、Line、Model，下方直接列出所有站點。',
      '每站、每時段分別調整 Target，填 Actual 與 Issue。',
      '離開儲存格後確認 Saved，核對該站早晚班合計及當日目標。',
      '查看所選產量來源站的看板、趨勢與全螢幕明細。',
    ],
    sections: [
      {
        managerOnly: true,
        title: '第 1～8 步：依現場順序設定',
        paragraphs: [
          '1. 基礎資料與班別時間：維護 Lines、Models、Jobs、Stations 及單一英文異常快捷文字清單。下拉選產線與 Model 新增配對，同線可有多個 Model；設定兩班生產及休息時段，時間不可重疊。',
          '2. 產線日目標：每組產線／Model 有一個日目標預設，各站依相同預設與生產分鐘分配自己的時段目標，排除休息。尚無人員或站點也可先設定。',
          '3. 依職務建立人員：完整職務清單包含空職務，新增或啟用正確職務的人員。刪職務會在儲存設定時刪除所屬名冊及分配，歷史填報保留當時姓名。',
          '4. 產線人員分配：選 Line、Model，再在早班、晚班或 OWNER 選職務，勾選多人並新增。同職務每班可多人；清除勾選只清待加入選擇，下方已分配者用 X 移除。空職務提示可直接開名冊。',
          '5. 產線配置：以下拉選既有產線及其已配對 Model。同一張表整合職務、站點、自動帶入的早晚班及 OWNER、啟用與操作；最後一列選職務／站點後按新增並啟用。列內不再重選 Model，改職務會立即更新對應人員。',
          '只顯示所選產線／Model 的配置，不推薦或自動複製舊 Model。取消啟用可暫停站點並保留此列；「刪除」從草稿移除此列，儲存設定後生效，重整不會再出現。同職務／站點刪除後重建使用新配置，不會帶回舊數值；歷史填報保留原身分。',
          '最左側先是拖曳把手、再是序號；拖曳可調整同組產線／Model 的站點順序。職務、站點欄位對齊，上下按鈕放在操作欄，支援鍵盤與手機。按儲存設定後，填報、明細與匯出依新順序，保留站點 ID、人員、目標與所選產量來源。',
          '「有產出」與「啟用配置」分開。維持啟用、取消有產出，站點仍顯示但免填報，已存產量與異常僅供查閱。批次填寫及 Excel 範本略過此站，匯入不接受它的修改；產量來源只可選啟用的產出站。重新勾選有產出可恢復填寫，既有值保留；舊配置預設都有產出。',
          '在同一區選「產量來源站點」，只列啟用站點。該站供應此組看板目標、實績、差額及警示，其他站保留獨立填報；沒有啟用站時會提示先新增。',
          '6. 分組管理實體產線及其 Model。7. 警示與刷新設定規則。8. 語言與外觀設定共用預設。上方／底部儲存設定發布草稿，儲存草稿只留目前瀏覽器與帳號；載入已儲存設定會先確認放棄變動。版本衝突保留草稿。',
        ],
      },
      {
        managerOnly: true,
        title: '產線＋Model 預設、兩班分配與當日調整',
        paragraphs: [
          '每組產線／Model 有一個日目標預設。每站各自依「日目標 × 本時段生產分鐘 ÷ 兩班總生產分鐘」取得時段目標；排除休息，整數分配保留該站全日總量。',
          '例如預設 1,000、總生產 500 分鐘，20 分鐘時段各站預設 40。把其中一站該段 Target 改成 50，只會讓該站當日合計變成 1,010；其他站、其他日期及 1,000 預設不變。空白未知，0 是明確零值。',
          '來源選站只影響看板，不會同步站點輸入。目前啟用配對切換來源站後立即改用該站；已移除的歷史配對沿用保存的來源。已存姓名、站點與時間仍保留快照。',
        ],
      },
      {
        title: '填寫生產資料與確認儲存',
        paragraphs: [
          '確認生產日期、Line、Model，不需選站點，下方直接列各站。每站每時段都有 Target、Actual、Issue；各站、各 Model、各班別的數值與異常獨立。',
          '若配對沒有啟用站點，產線／Model 選項仍保留，並顯示日目標分配預覽。管理員可直接前往該組配置，member 會看到聯繫管理員提示；預覽欄位不建立填報。先啟用站點並儲存設定，再填寫結果。',
          '整日雙班試算表、單班與單時段表格皆將 Target、Actual 並排，異常只顯示一行。固定左欄包含站點、職務及早晚班與整日合計；人員可到生產明細查看。',
          '工具列最左側「同時段批次填寫」可選日期、產線、Model 與時段，分別套用目標、實績、異常，再逐站修改；套用後視窗保持開啟。批次欄空白保留原值，0 寫入零。',
          '切換日期、產線、Model 或時段前先儲存原範圍。立即儲存保留視窗；X、Esc 或點外面儲存後關閉，填報表回到所選日期與配對。',
          '無效值或版本衝突時保留視窗與修改，衝突整批不寫入。更新預覽後核對修改，再儲存。',
          '點「新增異常」或一行摘要，編輯窗會標明站點、日期、班別及時段。英文快捷文字來自基礎資料清單，可選取後再補充；Enter 換行，清除說明可清空。完成、Esc、點視窗外或 Ctrl+Enter 關閉並自動儲存；只開啟不改字不會寫入資料，長異常不會撐高表格。',
          '離開數字欄位自動儲存，確認 Saved。空白未填報，0 是確認零產出；早班／晚班切到該整班，前往目前時段依曼谷時間選取進行中的時段。Tab 同欄跨時段、Enter 往下一站、F2 開啟當格異常，Ctrl+Enter 完成後回到原數字欄。矩形多列貼上依單數列目標、雙數列實績對應各站。Excel 可下載與匯入整日雙班或單班範本，包含 Target、Actual、Issue。',
          '無效值、儲存失敗或衝突須先處理才能離開。檢視最新資料只顯示該站，選採用最新或儲存我修改的欄位；合併時保留別人改過而自己未改的欄位，不會覆寫其他站。',
        ],
      },
      {
        title: '使用 Excel 匯入',
        paragraphs: [
          '依生產日期及班別下載範本，保留 Row ID、Line、Model、Job、Station、時段、日期與班別識別。各站自己的列分別填 Target、Actual、Issue，不同站可填不同產量。',
          'CSV 請用 Row ID＋Time slot，或可唯一識別的 Line＋Model＋Job／Station＋Time slot。只填產線／Model 而有多站時會拒絕，避免猜站；空格保留原值，0 寫入零。Excel 可選整日雙班或單班範本與匯入。',
          '先預覽配置、時間、數值與版本，修正錯誤再匯入。任一站或設定版本衝突時整批拒絕；歷史站點與原時間識別仍可使用。',
        ],
      },
      {
        title: '總覽、細節與全螢幕看板',
        paragraphs: [
          '總覽每組產線／Model 使用所選來源站的數值；分組合計加總各組結果，不加總同產品經過的所有站，避免重複計產量。來源標籤會顯示監控站點。',
          '一般模式點線開細節，全螢幕點線開各站明細彈窗；X 或 Esc 關閉後保留分組與頁次。每頁最多七組，實際列數依名稱、視窗高度與圖表空間調整，其他組用底部分頁查看。',
          '顯示選項分別控制產量趨勢與占比；未填報保持空白，不會當作零產出。明細可查看各站異常及保存的人員。',
        ],
      },
      {
        title: '讀懂產量狀態與警示',
        paragraphs: [
          '「產量」表示實績與可比較目標的達標情況；「監控」表示班別目前是否生產中、休息中、歷史班次或非生產時間。歷史班次的結果不代表現在有即時警報。',
          '未達標規則檢查設定的產量差距；未增加規則檢查已填報產量多久沒有增加，排除休息及班外時間。這是依已儲存的填報資料判斷，不是直接連接機台。',
          '顏色由已啟用的規則決定，多條同時符合時取優先度最高的顏色。啟用閃爍時只閃外框，內容不會跟著閃。',
          '「立即刷新」讀取最新已儲存的資料；自動刷新依管理員設定的秒數執行。其他人尚未儲存的修改不會出現在看板上。',
        ],
      },
      {
        title: '帳號、語言及資料保存',
        paragraphs: [
          'manager 管理共用預設及人員配置；member 可填每站當日目標／實績及異常、匯入與查詢，但不能修改共享 Settings。',
          '右上角可選英文、中文、泰文及配色。個人瀏覽器的偏好不會改變其他使用者的畫面。',
          '產線標題不再加 Model 字樣。型號以第一個 - 分成兩行，例如第一行 ECD16010094，第二行 (ORV3-PSU-3KW-AutoLine)；沒有 - 就顯示一行。只是顯示格式，保存名稱與 Excel 識別不變。',
          '每頁有獨立網址：/overview、/details、/entry、/guide；管理員的每個設定步驟也有 /settings/... 網址。可直接開啟、重整及使用瀏覽器上一頁／下一頁；設定步驟共用未存草稿，離開設定仍保護未儲存內容，member 不能進入共享設定。',
          '生產資料由伺服器儲存至 SQLite。多人可同時作業；同一筆紀錄採版本檢查，較舊的資料不能直接蓋掉其他人剛儲存的內容。',
        ],
      },
    ],
  },
  th: {
    manager: 'คู่มือผู้จัดการ',
    member: 'คู่มือผู้บันทึก',
    managerIntro:
      'ตั้งค่าโรงงานตามลำดับ จากนั้นใช้หน้าบันทึก รายละเอียด และกระดานเต็มหน้าจอเพื่อติดตามการผลิต',
    memberIntro:
      'กรอก Target และ Actual ในแถวสถานีแบบกระชับ คลิกข้อความปัญหาเพื่อแก้ไข การแก้รายงานไม่เปลี่ยนเป้าหมายเริ่มต้นรายวัน',
    quickTitle: 'เริ่มต้นใช้งาน',
    managerSteps: [
      'สร้างข้อมูลหลักและเวลากะ',
      'ตั้งเป้าหมายรายวัน',
      'สร้างบุคลากรตามหน้าที่ มอบหมายทีมและผู้รับผิดชอบ แล้วตั้งค่าสถานี',
      'บันทึกการตั้งค่า บันทึกผลิตและตรวจบอร์ด',
    ],
    memberSteps: [
      'เปิดหน้ารายงาน ตรวจวันที่ Line และ Model ทุกสถานีแสดงด้านล่าง',
      'กรอก Target, Actual และ Issue แยกแต่ละสถานีและช่วงเวลา',
      'ออกจากช่องแล้วตรวจ Saved และยอดรวมของสถานีนั้น',
      'ดูผลผลิตจากสถานีที่เลือกเป็นแหล่งข้อมูล กราฟและรายละเอียดเต็มหน้าจอ',
    ],
    sections: [
      {
        managerOnly: true,
        title: 'ขั้นตอนที่ 1–8 · ตั้งค่าตามลำดับงาน',
        paragraphs: [
          '1. ข้อมูลหลักและเวลากะ: สร้าง Lines, Models, Jobs, Stations และรายการข้อความปัญหาภาษาอังกฤษ เลือกสายและ Model เพื่อเพิ่มคู่ สายเดียวมีหลาย Model ได้ กำหนดเวลาผลิตและพักสองกะไม่ให้ซ้อนกัน',
          '2. เป้าหมายรายวัน: แต่ละคู่สาย/Model มีค่าเริ่มต้นหนึ่งค่า แต่ละสถานีแบ่งเป้าหมายของตนตามนาทีผลิตสองกะโดยไม่รวมพัก ตั้งได้ก่อนมีบุคลากรหรือสถานี',
          '3. บุคลากรตามหน้าที่: รายการหน้าที่ทั้งหมดรวมหน้าที่ว่าง เพิ่มหรือเปิดใช้คนในหน้าที่ถูกต้อง ลบหน้าที่จะลบคนและการมอบหมายเมื่อบันทึก รายงานเดิมคงชื่อเดิม',
          '4. มอบหมายบุคลากร: เลือก Line, Model และหน้าที่ในกะเช้า กลางคืนหรือผู้รับผิดชอบ ติ๊กหลายคนแล้วเพิ่ม หน้าที่เดียวมีหลายคนได้ ล้างที่เลือกไม่ลบคนที่เพิ่มแล้ว ใช้ X นำออก ปุ่มในรายการว่างเปิดหน้าบุคลากร',
          '5. ตั้งค่าสาย: เลือกสายและ Model ที่จับคู่แล้วจากรายการ ตารางเดียวมีหน้าที่ สถานี ทีมสองกะ ผู้รับผิดชอบ สถานะและปุ่ม แถวท้ายเลือกหน้าที่/สถานีแล้วเพิ่มและเปิดใช้ ไม่มีเลือก Model ซ้ำในแถว เปลี่ยนหน้าที่อัปเดตบุคลากรทันที',
          'แสดงเฉพาะการตั้งค่าของสาย/Model ที่เลือก ไม่แนะนำหรือคัดลอก Model เก่า ยกเลิกเปิดใช้เพื่อพักสถานีโดยเก็บแถวไว้ ลบจะนำแถวออกจากร่างและมีผลเมื่อบันทึก โหลดใหม่ไม่กลับมา เพิ่มคู่เดิมหลังลบจะสร้างการตั้งค่าใหม่ ไม่ดึงยอดเก่ากลับมา รายงานเก่ายังคงอยู่',
          'ด้านซ้ายสุดมีที่จับลาก ตามด้วยหมายเลขลำดับ ช่องหน้าที่กับสถานีอยู่แนวเดียวกัน ปุ่มขึ้นลงอยู่ในคอลัมน์การทำงาน ใช้แป้นพิมพ์หรือโทรศัพท์ได้ บันทึกการตั้งค่าเพื่อใช้ลำดับในหน้าบันทึก รายละเอียดและส่งออก รหัสสถานี บุคลากร เป้าหมายและแหล่งผลผลิตไม่เปลี่ยน',
          'มีผลผลิตแยกจากเปิดใช้ เก็บสถานีที่เปิดใช้แต่ยกเลิกมีผลผลิตเพื่อแสดงสถานีโดยไม่ต้องกรอก รายงานเดิมดูได้อย่างเดียว กรอกทั้งสายและแม่แบบ Excel ข้ามสถานีนี้ การนำเข้าปฏิเสธการเปลี่ยนแปลง เลือกแหล่งผลผลิตได้เฉพาะสถานีที่เปิดใช้และมีผลผลิต เปิดมีผลผลิตอีกครั้งเพื่อกรอกโดยรักษาข้อมูลเดิม สถานีเดิมถือว่ามีผลผลิตโดยค่าเริ่มต้น',
          'เลือกสถานีแหล่งผลผลิตในแผงเดียวกัน มีเฉพาะสถานีที่เปิดใช้ สถานีนั้นเป็นแหล่งเป้าหมาย ผลจริง ส่วนต่างและการเตือนของคู่ สถานีอื่นกรอกแยก หากไม่มีสถานีจะแจ้งให้เพิ่มก่อน',
          '6. กลุ่มรวมสายและ Model ของสาย 7. การเตือนและรีเฟรชตั้งกฎ 8. ภาษาและรูปแบบตั้งค่าเริ่มต้น บันทึกการตั้งค่าเพื่อเผยแพร่ บันทึกร่างเก็บเฉพาะเบราว์เซอร์/บัญชี โหลดการตั้งค่าจะยืนยันก่อนทิ้งร่างที่แก้ รุ่นขัดแย้งไม่ทับร่าง',
        ],
      },
      {
        managerOnly: true,
        title: 'เป้าหมายต่อสาย + Model สองกะและรายงานที่ปรับได้',
        paragraphs: [
          'แต่ละคู่สาย/Model มีเป้าหมายรายวันหนึ่งค่า ทุกสถานีแบ่งเป้าหมายของตนด้วย เป้ารายวัน × นาทีผลิตช่วงนี้ ÷ นาทีผลิตรวมสองกะ ไม่รวมพักและปัดจำนวนเต็มโดยรักษายอดวัน',
          'เช่น ค่าเริ่มต้น 1,000 ผลิต 500 นาที ช่วง 20 นาทีได้ 40 ต่อสถานี เปลี่ยน Target สถานีหนึ่งเป็น 50 จะเปลี่ยนยอดวันสถานีนั้นเป็น 1,010 สถานีอื่น วันอื่นและค่าเริ่มต้นไม่เปลี่ยน ว่างคือไม่ทราบ 0 คือศูนย์ที่ยืนยัน',
          'สถานีแหล่งผลผลิตใช้สำหรับกระดาน ไม่ซิงค์การกรอก เปลี่ยนแหล่งของคู่ที่เปิดใช้งานมีผลทันที คู่ที่เลิกใช้เก็บแหล่งเดิมสำหรับประวัติ ชื่อ สถานีและเวลาที่บันทึกไว้ยังอยู่',
        ],
      },
      {
        title: 'กรอกข้อมูลและตรวจสอบการบันทึก',
        paragraphs: [
          'เลือกวันที่ Line และ Model ทุกสถานีแสดงอัตโนมัติ ไม่ต้องเลือกสถานี แต่ละสถานีมี Target, Actual และ Issue ทุกช่วงเวลา ข้อมูลแยกตามสถานี Model และกะ',
          'หากคู่ยังไม่มีสถานีที่เปิดใช้ รายการสาย/Model ยังอยู่และแสดงตัวอย่างการแบ่งเป้าหมาย manager เปิดหน้าตั้งค่าคู่นั้นได้ member ติดต่อ manager ช่องตัวอย่างไม่บันทึก ต้องเปิดสถานีและบันทึกการตั้งค่าก่อน',
          'ตารางทั้งสองกะตลอดวันมีช่อง Target และ Actual อยู่คู่กัน ปัญหาแสดงบรรทัดเดียว ด้านซ้ายตรึงชื่อสถานี หน้าที่ และยอดรวมกะเช้า กะกลางคืน และทั้งวัน ดูบุคลากรในรายละเอียดการผลิต',
          'ปุ่มกรอกช่วงเวลาอยู่ซ้ายสุด เลือกวันที่ สาย Model และช่วงเวลา ใช้เป้าหมาย ผลจริง หรือปัญหากับทุกสถานี แล้วแก้ไขรายสถานีได้ หน้าต่างยังเปิดอยู่ ช่องว่างด้านบนไม่เปลี่ยนค่า 0 คือศูนย์',
          'เปลี่ยนวันที่ สาย Model หรือช่วงเวลาจะบันทึกขอบเขตเดิมก่อน ปุ่มบันทึกยังเปิดหน้าต่างไว้ X, Esc หรือคลิกด้านนอกจะบันทึกแล้วปิด กลับไปยังวันที่และคู่ที่เลือก',
          'ค่าผิดหรือข้อมูลขัดแย้งจะเก็บฉบับร่างและหน้าต่างไว้ ชุดที่ขัดแย้งไม่บันทึก ให้รีเฟรช ตรวจสอบ แล้วบันทึกอีกครั้ง',
          'คลิกเพิ่มปัญหาหรือข้อความย่อเพื่อเปิดหน้าต่างที่ระบุสถานี วันที่ กะและช่วงเวลา ข้อความด่วนภาษาอังกฤษมาจากรายการข้อมูลหลักและแก้ไขต่อได้ Enter ขึ้นบรรทัดใหม่ ล้างข้อความเพื่อลบ กดเสร็จสิ้น Esc คลิกนอกหน้าต่างหรือ Ctrl+Enter เพื่อปิดและบันทึก เปิดโดยไม่แก้ไขจะไม่เขียนข้อมูล ข้อความยาวไม่เพิ่มความสูงของแถว',
          'ออกจากช่องตัวเลขเพื่อบันทึกและตรวจ Saved ว่างคือยังไม่กรอก 0 คือยืนยันศูนย์ ปุ่มกะเช้า/กลางคืนเปิดทั้งกะ และปุ่มช่วงเวลาปัจจุบันเลือกช่วงที่กำลังผลิตตามเวลากรุงเทพฯ Tab ไปช่วงถัดไป Enter ลงสถานีถัดไป F2 เปิดปัญหา Ctrl+Enter กลับช่องเดิม การวางหลายแถวใช้แถวคี่เป็น Target และแถวคู่เป็น Actual เปิดเมนู Excel สำหรับแบบทั้งวันหรือแยกกะ',
          'แก้ค่าผิด การบันทึกไม่สำเร็จหรือรุ่นขัดแย้งก่อนออก ดูข้อมูลล่าสุดเฉพาะสถานีที่ขัดแย้ง เลือกข้อมูลล่าสุดหรือบันทึกเฉพาะช่องที่แก้ รักษาช่องอื่นที่ผู้อื่นแก้ไว้และไม่เขียนสถานีอื่น',
        ],
      },
      {
        title: 'นำเข้ารายงาน Excel',
        paragraphs: [
          'ดาวน์โหลดแม่แบบตามวันที่และกะ เก็บ Row ID, Line, Model, Job, Station, ช่วงเวลา วันที่และกะ กรอก Target, Actual, Issue แยกแถวสถานี สถานีต่างกันมีจำนวนต่างกันได้',
          'CSV ใช้ Row ID + Time slot หรือ Line + Model + Job/Station + Time slot ที่ระบุได้หนึ่งสถานี ถ้าระบุแค่สาย/Model แล้วพบหลายสถานีจะปฏิเสธ ช่องว่างเก็บค่าเดิม 0 เขียนศูนย์ เลือกแม่แบบและนำเข้าทั้งวันหรือแยกกะได้',
          'ดูตัวอย่างเพื่อตรวจสถานี เวลา ค่าและรุ่น แก้ข้อผิดพลาดก่อนนำเข้า หากสถานีใดหรือการตั้งค่ารุ่นเปลี่ยนจะปฏิเสธทั้งชุด ประวัติใช้รหัสสถานีและเวลาเดิมได้',
        ],
      },
      {
        title: 'ภาพรวม รายละเอียด และกระดานเต็มหน้าจอ',
        paragraphs: [
          'ภาพรวมแสดงแต่ละสาย/Model จากสถานีแหล่งผลผลิตที่เลือก กลุ่มรวมผลแต่ละคู่ ไม่รวมทุกสถานีที่สินค้าผ่านเพื่อหลีกเลี่ยงนับซ้ำ ป้ายแหล่งข้อมูลระบุสถานี',
          'โหมดปกติคลิกสายเปิดรายละเอียด เต็มหน้าจอคลิกเปิดหน้าต่างทุกสถานี X หรือ Esc กลับกลุ่ม/หน้าเดิม สูงสุดเจ็ดคู่ต่อหน้า จำนวนจริงขึ้นกับความสูง ชื่อยาวและกราฟ ใช้ปุ่มเปลี่ยนหน้า',
          'ตัวเลือกแสดงเปิดกราฟแนวโน้มและสัดส่วนแยกกัน ไม่กรอกไม่ถือเป็นศูนย์ รายละเอียดแสดงปัญหาและบุคลากรที่บันทึกไว้',
        ],
      },
      {
        title: 'อ่านสถานะผลผลิตและการแจ้งเตือน',
        paragraphs: [
          'สถานะผลผลิตเปรียบเทียบผลผลิตจริงกับเป้าหมายที่เปรียบเทียบได้ สถานะติดตามบอกว่ากะกำลังผลิต พัก เป็นกะที่ผ่านมา หรือนอกเวลาผลิต ผลของกะที่ผ่านมาไม่ใช่การแจ้งเตือนสด',
          'กฎต่ำกว่าเป้าหมายตรวจผลต่างที่ตั้งไว้ กฎผลผลิตไม่เพิ่มตรวจเวลาที่ผลผลิตที่รายงานไม่เพิ่ม โดยหยุดนับระหว่างพักและนอกกะ ระบบอ้างอิงรายงานที่บันทึก ไม่ใช่การเชื่อมต่อเครื่องจักรโดยตรง',
          'สีมาจากกฎที่เปิดใช้งาน หากตรงหลายกฎจะแสดงสีที่มีลำดับความสำคัญสูงสุด เมื่อเปิดกะพริบจะกะพริบเฉพาะกรอบ เนื้อหาไม่กะพริบ',
          'รีเฟรชทันทีใช้ดึงข้อมูลที่บันทึกล่าสุด การรีเฟรชอัตโนมัติใช้วินาทีที่ผู้จัดการตั้งไว้ ข้อมูลที่ผู้อื่นยังไม่บันทึกจะยังไม่ปรากฏบนกระดาน',
        ],
      },
      {
        title: 'บัญชี ภาษา และการเก็บข้อมูล',
        paragraphs: [
          'ผู้จัดการแก้ค่าเริ่มต้น การมอบหมายและลำดับสถานี ผู้บันทึกแก้ Target, Actual และปัญหารายสถานี ใช้กรอกทั้งสายตามช่วงและนำเข้าได้ แต่แก้ Settings ร่วมไม่ได้',
          'ส่วนหัวมีภาษาอังกฤษ จีน และไทย รวมถึงสีธีม ความชอบของเบราว์เซอร์หนึ่งไม่เปลี่ยนหน้าจอของผู้อื่น',
          'ชื่อผลิตภัณฑ์ไม่แสดงคำนำหน้า Model แบ่งที่ขีดแรก บรรทัดแรกเป็นรหัส บรรทัดที่สองเป็นข้อความส่วนที่เหลือในวงเล็บ ชื่อที่ไม่มีขีดใช้บรรทัดเดียว รหัสที่บันทึกและใน Excel ไม่เปลี่ยน',
          'แต่ละหน้ามีที่อยู่ /overview, /details, /entry และ /guide แต่ละขั้นตั้งค่ามี /settings/... เปิดลิงก์ตรง รีเฟรช ย้อนกลับและไปข้างหน้าได้ ขั้นตั้งค่าใช้ร่างร่วมกันและตรวจงานที่ยังไม่บันทึกก่อนออก member เข้า Settings ไม่ได้',
          'เซิร์ฟเวอร์เก็บข้อมูลใน SQLite หลายคนทำงานพร้อมกันได้ ระบบตรวจรุ่นของรายการเดียวกันเพื่อไม่ให้ข้อมูลเก่าทับการบันทึกล่าสุดของผู้อื่นโดยไม่แจ้ง',
        ],
      },
    ],
  },
};

const exampleScreens = [
  [
    'setup-order',
    'models-and-lines',
    'issue-quick-text',
    'daily-targets',
    'people-by-job',
    'line-people',
    'line-configuration',
  ],
  [],
  ['production-entry', 'production-cell', 'issue-editor', 'interval-batch', 'no-output-station'],
  ['excel-preview'],
  ['line-details'],
  [],
  [],
];
const exampleLabels = {
  en: {
    note: 'Training screenshots use isolated DEMO lines and sample personnel. Select an image to open it at full size.',
    captions: [
      'Setup order',
      'Line/model dropdown pairing',
      'English issue quick text in Master data',
      'One default target per line + model',
      'People filtered by job',
      'Line teams and owners',
      'Integrated station configuration and output source',
      'Unified whole-day table',
      'Station target, actual and issue',
      'Compact issue editor and quick text',
      'One-time interval fill with editable station values',
      'No-output stations stay visible with read-only history',
      'Excel import preview',
      'Fullscreen line details',
    ],
  },
  zh: {
    note: '以下截圖使用獨立測試環境的 DEMO 產線與示範人名。點圖可開啟完整尺寸。',
    captions: [
      '設定順序',
      '下拉配對產線與 Model',
      '基礎資料的英文異常快捷文字',
      '每組產線＋Model 一個預設日目標',
      '依職務篩選人員',
      '產線兩班與負責人',
      '整合站點配置與產量來源',
      '整合式整日填報',
      '每站目標、實績與異常',
      '異常編輯視窗與快捷文字',
      '同時段批次填寫，之後仍可個別修改',
      '無產出站保留顯示與歷史查閱',
      'Excel 匯入預覽',
      '全螢幕產線明細',
    ],
  },
  th: {
    note: 'ภาพตัวอย่างใช้สาย DEMO และบุคลากรจากฐานทดสอบแยก คลิกภาพเพื่อเปิดขนาดเต็ม',
    captions: [
      'ลำดับตั้งค่า',
      'จับคู่สาย / Model',
      'ข้อความปัญหาภาษาอังกฤษในข้อมูลหลัก',
      'เป้าหมายต่อสาย + Model',
      'บุคลากรตามหน้าที่',
      'ทีมและผู้รับผิดชอบ',
      'บุคลากรอัตโนมัติ',
      'ตารางบันทึกรวม',
      'เป้าหมาย ผลจริงและปัญหาแยกตามสถานี',
      'หน้าต่างแก้ปัญหาและข้อความด่วน',
      'กรอกทุกสถานีตามช่วงและแก้รายสถานีภายหลัง',
      'สถานีไม่มีผลผลิตและประวัติแบบอ่านอย่างเดียว',
      'ตัวอย่างนำเข้า Excel',
      'รายละเอียดเต็มจอ',
    ],
  },
};

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

/**
 * Return a guide for internal roles (`admin` / `operator`) or account roles
 * (`manager` / `member`). All prose is escaped before insertion into the page.
 */
export function helpMarkup({ role, language, esc = escapeHtml } = {}) {
  const requestedLanguage = language || globalThis.document?.documentElement.lang || 'en';
  const locale = requestedLanguage.startsWith('zh')
    ? 'zh'
    : requestedLanguage.startsWith('th')
      ? 'th'
      : 'en';
  const guide = guides[locale];
  const manager = ['admin', 'manager'].includes(role);
  const steps = manager ? guide.managerSteps : guide.memberSteps;
  const examples = exampleLabels[locale];
  const allScreens = exampleScreens.flat();
  const screenMarkup = (index) => {
    const names = exampleScreens[index];
    return names.length
      ? `<p class="help-example-note">${esc(examples.note)}</p><div class="help-screens">${names
          .map((name) => {
            const caption = examples.captions[allScreens.indexOf(name)];
            return `<figure><a href="/guide-images/${name}.png" target="_blank" rel="noopener"><img src="/guide-images/${name}.png" alt="${esc(caption)}" loading="lazy"></a><figcaption>${esc(caption)}</figcaption></figure>`;
          })
          .join('')}</div>`
      : '';
  };
  return `<div class="help-intro"><span class="help-role">${esc(manager ? guide.manager : guide.member)}</span><p>${esc(manager ? guide.managerIntro : guide.memberIntro)}</p></div>
    <section class="panel help-quick-start"><h2>${esc(guide.quickTitle)}</h2><ol>${steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section>
    <div class="help-topics">${guide.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => manager || !section.managerOnly)
      .map(
        ({ section, index }, visibleIndex) =>
          `<details class="panel help-topic" ${visibleIndex === 0 ? 'open' : ''}><summary>${esc(section.title)}</summary><div>${section.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}${screenMarkup(index)}</div></details>`,
      )
      .join('')}</div>`;
}
