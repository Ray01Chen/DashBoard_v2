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
        title: 'Save and apply schedule templates',
        paragraphs: [
          'Open Settings → Master data & shift times. Choose Default schedule template to edit the initial times, or select a saved template.',
          'Enter a name and choose Save as new template to keep another schedule. Adjust Day/Night production and break times, then Save settings. Rename and Remove manage saved templates.',
          'Tick the lines under Lines to apply, choose Apply to selected lines, confirm, then Save settings. Editing a template alone does not change existing lines; all models on a selected line share its applied schedule.',
          'The daily timeline separates production and breaks. Choose a line/model in Target preview and expand the table to see every start/end/type and preset target. Invalid times, overlaps across midnight and individual slots over 12 hours are flagged before saving.',
          'Use Schedule scope to inspect or adjust an individual line. Copy selected template copies the template currently selected above. Deleting a template retains the copies already applied to lines.',
          'Current and future entry and Excel use the selected line’s CONFIG only; removed slots disappear. Archived dates retain saved original slots and values, including original night-shift production dates.',
        ],
      },
      {
        managerOnly: true,
        title: 'One line + model preset, two shifts and editable reports',
        paragraphs: [
          'Daily targets shows read-only Planned UPH = target / productive hours, excluding breaks and gaps. Day/Night use their allocated targets instead of repeating the daily target. Changing a target updates the preview immediately; schedule changes update it too. The deadline is automatically the plan’s last production end, including overnight shifts.',
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
          'Use Fill interval at the left of the command bar. Choose date, Line, Model and interval. Apply Target, Actual or Issue to all stations, then edit individual cells; Apply keeps the window open. Applying a blank clears that field for every station; 0 writes zero.',
          'Fill interval uses the current CONFIG schedule directly, without matching saved historical intervals. Schedule changes do not block entry: new slots are saved on the selected date, while original slots, values and issues remain in SQLite and can be viewed on their original dates.',
          'Changing date, Line, Model or interval saves the current scope before loading the destination. Save now keeps the window open. X, Esc or clicking outside saves and closes, then returns entry to the selected destination.',
          'Invalid values or version conflicts keep drafts open; no part of a conflicting batch is saved. Refresh preview, review changed fields and save again.',
          'Click Add issue or its one-line preview to open the note editor for the displayed station/date/interval. English quick text comes from the Master data list; edit freely, use Enter for new lines, or Clear note to remove text. Done, Esc, a click outside or Ctrl+Enter closes and saves. Opening a note without changes does not write data; long notes never enlarge the table row.',
          'Click another numeric cell to autosave and confirm Saved. Blank is not reported; 0 is confirmed zero production. Day/Night switches to that whole shift; Go to current time slot selects the active Bangkok interval. Tab moves across intervals within the same field, Enter moves down stations, F2 opens the current cell’s issue, and Ctrl+Enter returns to that cell. Paste spreadsheet rectangles directly: each row is the next station and adjacent Target/Actual columns stay in one interval; following column pairs continue to following intervals. A single column alternates Target/Actual down the rows. Overflow is ignored without wrapping. Excel offers whole-day or single-shift templates and imports.',
          'Restore defaults asks for confirmation, then restores Target from the daily preset allocation and clears Actual and Issue for every station in the selected line/model across both shifts. Fill interval also has Restore default targets for the selected interval.',
          'Invalid values and unresolved saves prevent leaving the page. Review latest shows only the affected station. Use latest data or Save my changed cells merges changed cells against the latest version. Other stations are never overwritten.',
        ],
      },
      {
        title: 'Import an Excel report',
        paragraphs: [
          'Template columns are Date, Shift, Line, Model, Job, Station, Time slot, Target, Actual, Issue and Row ID. Fill the yellow Target/Actual/Issue cells; keep the identifiers. Headers and identity columns stay frozen, and filters cover every column. Rows follow configured line/model and station order, with Day then Night inside each station; preview uses the same grouping. Older column orders remain supported.',
          'For CSV, provide Row ID + Time slot, or an unambiguous Line + Model + Job/Station + Time slot. Line/model alone is rejected when it matches several stations. Blank cells keep saved values; 0 writes zero. Excel offers whole-day or single-shift templates and imports.',
          'Preview checks mappings, intervals, values and versions. Fix errors before importing. Any stale station or configuration version rejects the entire import. Saved historical station and interval identifiers remain supported.',
        ],
      },
      {
        title: 'Overview, details and full-screen board',
        paragraphs: [
          'Overview defaults to Whole day. Use Interval / Daily beside the title or in the fullscreen header; your choice persists after refresh. Interval shows the active target, actual and gap. Daily shows the complete two-shift target, reported actual and gap, regardless of the shift filter. Missing values stay —. Large per-line curves adapt to their containers. Alerts and output share retain their cumulative rules. Whole day / Day / Night is available above both Overview and Production details. Each line/model uses its selected output station; group totals never double-count every station.',
          'Normal line clicks open details. Full screen clicks open a station-detail dialog; X or Esc returns to the same group/page. Its header follows the active colour theme and keeps line, model, owner and the six interval/daily/cumulative metrics together. Each station labels Day and Night personnel separately.',
          'The group trend keeps every time label readable; dense schedules scroll horizontally inside the chart, including fullscreen. Hover or Tab to an interval to see its values. Refresh keeps the scroll position. Display options independently toggle group trend and output share. Missing output remains blank. The fullscreen board uses seven compact desktop rows per page, including with both charts enabled. Smaller screens scroll the list; additional units use pagination.',
        ],
      },
      {
        title: 'Read output status and alerts',
        paragraphs: [
          'Managers open Settings → Alerts & refresh, tick each production performance, completion risk, missing-report or existing shortfall/idle rule, adjust thresholds, then Save settings. New policies start disabled. Planned UPH and deadline are automatic. Read the all/day/night planned pace and productive hours in Daily targets; no capacity setup is needed here.',
          'Performance compares Actual/Target for ended, reported production intervals only (default green ≥95%, yellow ≥85%, red <85%). Blank Actual is missing; submitted 0 is a valid report. Missing-report alerts start after the 10-minute grace and escalate after another 30 minutes; filling the report clears them.',
          'Completion risk compares required UPH with Planned UPH (default green ≤100%, yellow ≤110%, red >110%); it indicates how much faster than the original plan is needed, not a physical capacity limit. The baseline is the last contiguous completed report, not recent output averages. The reason shows its data cutoff, deadline and productive hours excluding breaks. Missing plan targets or productive time show NO DATA; overdue reports mark the forecast STALE.',
          'The overall light uses red before yellow, green only when every enabled check can be evaluated and is normal. No data or all disabled is gray. Yellow flashes slowly, red quickly. Multiple reasons rotate every 5 seconds, red first, without changing the overall light. Open line details to read the full reason and all evaluations. Legacy blue/purple rules contribute yellow; optional frame flashing remains separate.',
          'Producing, Break, Upcoming and Completed describe the schedule, independently of the alert. Break shows its time range and pauses the idle timer; existing production risks remain visible. Breaks never require Actual. Automatic refresh reads saved reports at the configured interval; Refresh now retrieves them immediately.',
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
        title: '班表範本：儲存、修改與套用',
        paragraphs: [
          '開啟「設定 → 基礎資料與班別時間」。在「已儲存班表範本」選「預設班表範本」，即可修改原本的時段；也可選其他已存範本。',
          '輸入範本名稱，按「另存新範本」。調整早晚班的生產、休息時間後按「儲存設定」。可儲存多份，並使用修改名稱、刪除管理。',
          '在「選擇套用線體」勾選線體，按「套用至所選線體」，確認後再按「儲存設定」。只改範本不會自動改現有線體；同線所有 Model 共用套用結果。',
          '全天時間軸以主題色區分生產、灰色區分休息；在目標預覽選產線／Model，展開可核對各時段起訖、類型與預設目標。無效時間、跨午夜重疊或單段超過 12 小時會先提示，修正後再儲存。',
          '「班表範圍」可選某線查看或個別調整；「複製所選範本」會複製上方選中的範本。刪除範本不會刪除已套用的線體班表。',
          '目前及未來日期的填報與 Excel 只顯示該線 CONFIG，刪掉的時段不再出現。過去日期仍保留當天已存時段與數值；跨午夜夜班仍屬開班日。',
        ],
      },
      {
        managerOnly: true,
        title: '產線＋Model 預設、兩班分配與當日調整',
        paragraphs: [
          '「產線日目標」顯示唯讀計畫 UPH＝目標 ÷ 有效生產時數，排除休息與未排生產的時間。早晚班使用各自分配目標，不重複使用全日目標。修改目標即時更新預覽，班表調整後同步重算；截止自動採該計畫最後生產時段結束時間，支援跨日。',
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
          '工具列最左側「同時段批次填寫」可選日期、產線、Model 與時段，分別套用目標、實績、異常，再逐站修改；套用後視窗保持開啟。空白可清除所有站的該欄，「恢復預設目標」依日目標配置還原該時段；0 寫入零。',
          '批次時段直接使用目前 CONFIG 的班表，不比對各站舊時段。改班表後也可直接填報；新時段寫入所選日期，既有時段、數值與異常保留在 SQLite，查看原日期仍可查閱。',
          '切換日期、產線、Model 或時段前先儲存原範圍。立即儲存保留視窗；X、Esc 或點外面儲存後關閉，填報表回到所選日期與配對。',
          '無效值或版本衝突時保留視窗與修改，衝突整批不寫入。更新預覽後核對修改，再儲存。',
          '點「新增異常」或一行摘要，編輯窗會標明站點、日期、班別及時段。英文快捷文字來自基礎資料清單，可選取後再補充；Enter 換行，清除說明可清空。完成、Esc、點視窗外或 Ctrl+Enter 關閉並自動儲存；只開啟不改字不會寫入資料，長異常不會撐高表格。',
          '離開數字欄位自動儲存，確認 Saved。空白未填報，0 是確認零產出；早班／晚班切到該整班，前往目前時段依曼谷時間選取進行中的時段。Tab 同欄跨時段、Enter 往下一站、F2 開啟當格異常，Ctrl+Enter 完成後回到原數字欄。矩形直接照表貼：每列是下一站，相鄰目標／實績兩欄留在同一時段，後續欄位對再往後續時段；單欄才依上下列交錯目標／實績。超出容量忽略且不換行。Excel 可下載與匯入整日雙班或單班範本，包含 Target、Actual、Issue。',
          '「恢復預設」會先要求確認，再將所選日期、產線／Model 兩班所有站點的 Target 恢復為日目標預設配置，並清除 Actual 與異常。',
          '無效值、儲存失敗或衝突須先處理才能離開。檢視最新資料只顯示該站，選採用最新或儲存我修改的欄位；合併時保留別人改過而自己未改的欄位，不會覆寫其他站。',
        ],
      },
      {
        title: '使用 Excel 匯入',
        paragraphs: [
          '範本欄位依序為 Date、Shift、Line、Model、Job、Station、Time slot、Target、Actual、Issue、Row ID。淡黃色 Target／Actual／Issue 為填寫區，識別欄保留不改；表頭及識別欄固定，全欄可篩選。列依產線／Model、站點配置順序，每站先早班再晚班；預覽也採相同分組。舊欄位順序仍可匯入。',
          'CSV 請用 Row ID＋Time slot，或可唯一識別的 Line＋Model＋Job／Station＋Time slot。只填產線／Model 而有多站時會拒絕，避免猜站；空格保留原值，0 寫入零。Excel 可選整日雙班或單班範本與匯入。',
          '先預覽配置、時間、數值與版本，修正錯誤再匯入。任一站或設定版本衝突時整批拒絕；歷史站點與原時間識別仍可使用。',
        ],
      },
      {
        title: '總覽、細節與全螢幕看板',
        paragraphs: [
          '總覽預設「全天」。標題旁或全螢幕頂部可切「時段／每日」，重新整理保留選擇；時段顯示目前目標、實績、差額，每日顯示雙班完整目標、已填實績及差額，不受早晚班篩選影響。各產線大曲線隨容器調整；缺值顯示 —，警示與占比維持累計規則。生產總覽與生產細節上方都可切換全天／早班／晚班。每組產線／Model 仍只使用所選來源站，避免重複計產量。',
          '全螢幕明細頂部沿用目前主題配色，集中產線、機種、負責人及六項時段／全日／累計數字；各站人員分早班、晚班標示。X 或 Esc 關閉後保留分組與頁次。',
          '分組總產量趨勢保留每個時段名稱與間距；時段較多時在圖表內左右捲動，全螢幕也適用。滑鼠停留或 Tab 聚焦查看數值，刷新保留捲動位置。顯示選項可分別控制趨勢與占比；未填報保持空白。全螢幕固定每頁七組，桌面以單列精簡卡片顯示；較小螢幕可捲動，超過七組用頁次切換。',
        ],
      },
      {
        title: '讀懂產量狀態與警示',
        paragraphs: [
          '管理員進入「設定 → 警示與刷新」，勾選各項生產達成率、完工風險、資料未回報或既有缺口／停滯規則，調整門檻後按「儲存設定」。新增規則預設停用。計畫 UPH 與截止時間自動取得；全天及兩班的計畫 UPH、有效生產時數顯示於「產線日目標」，此頁不需再設定產能基準。',
          '生產達成率只計已結束且有實績的生產時段，預設綠 ≥95%、黃 ≥85%、紅 <85%。Actual 空白是未回報，已提交 0 是有效回報。未回報超過預設 10 分鐘寬限亮黃，再逾期 30 分鐘亮紅，補填即解除。',
          '完工風險比較需求 UPH／計畫 UPH，預設綠 ≤100%、黃 ≤110%、紅 >110%，表示需比原計畫加快多少，並非設備最大產能限制。以最後連續完整回報時段為基準，不使用最近平均產量；原因列出資料截止時間、完工截止及排除休息的有效工時。缺少基準顯示「無資料」，回報逾期會標示「資料過期」。',
          '總燈號紅優先於黃，全部啟用判斷都有資料且正常才亮綠；無資料或全部停用顯示灰色。黃燈慢閃、紅燈快閃，多個原因每 5 秒輪播，紅色原因優先，燈號不隨輪播改變。點產線細節可讀完整原因及所有判斷。既有藍／紫規則以黃燈整合，外框閃爍設定獨立保留。',
          '生產中、休息中、尚未開始、已結束表示班表狀態，與告警分開判讀。休息會顯示起訖並暫停停滯計時，不要求 Actual；既有生產風險不會因休息自動解除。自動刷新依設定讀取已儲存資料，也可按「立即刷新」。',
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
        title: 'บันทึก แก้ไข และใช้แม่แบบตารางเวลา',
        paragraphs: [
          'เปิด Settings → ข้อมูลหลัก เลือกแม่แบบเริ่มต้นเพื่อแก้เวลาเดิม หรือเลือกแม่แบบที่บันทึกไว้',
          'ใส่ชื่อแล้วบันทึกเป็นแม่แบบใหม่ ปรับช่วงผลิตและพักของทั้งสองกะ แล้วบันทึกการตั้งค่า เปลี่ยนชื่อหรือลบแม่แบบได้',
          'เลือกสายที่จะใช้ กดใช้แม่แบบ ยืนยัน แล้วบันทึกการตั้งค่า การแก้แม่แบบอย่างเดียวไม่เปลี่ยนสายเดิม ทุก Model ในสายใช้ตารางเดียวกัน',
          'ไทม์ไลน์แยกผลิตและพัก เลือกสาย/รุ่นในตัวอย่างเป้าหมายแล้วขยายตารางเพื่อดูเวลาเริ่ม จบ ประเภทและเป้าหมาย ระบบแจ้งเวลาผิด ช่วงซ้อนทับข้ามเที่ยงคืนและช่วงเดียวยาวเกิน 12 ชั่วโมงก่อนบันทึก',
          'เลือกสายในขอบเขตตารางเวลาเพื่อดูหรือแก้รายสาย คัดลอกแม่แบบที่เลือกจากรายการด้านบน ลบแม่แบบไม่ลบตารางที่ใช้กับสายแล้ว',
          'วันที่ปัจจุบันและอนาคตแสดงเฉพาะ CONFIG ของสาย ช่วงที่ลบไม่แสดงในกรอกและ Excel วันที่เก่าใช้ช่วงเวลาและค่าที่บันทึก กะข้ามเที่ยงคืนยังเป็นวันเริ่มผลิต',
        ],
      },
      {
        managerOnly: true,
        title: 'เป้าหมายต่อสาย + Model สองกะและรายงานที่ปรับได้',
        paragraphs: [
          'หน้าเป้าหมายรายวันแสดง UPH ตามแผนแบบอ่านอย่างเดียว = เป้าหมาย / ชั่วโมงผลิต ไม่นับพักและช่วงไม่มีการผลิต แต่ละกะใช้เป้าหมายที่จัดสรร ไม่ใช้เป้าทั้งวันซ้ำ แก้เป้าหมายหรือตารางแล้วคำนวณใหม่ กำหนดเสร็จคือจบช่วงผลิตสุดท้าย รองรับข้ามวัน',
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
          'ปุ่มกรอกช่วงเวลาอยู่ซ้ายสุด เลือกวันที่ สาย Model และช่วงเวลา ใช้เป้าหมาย ผลจริง หรือปัญหากับทุกสถานี แล้วแก้ไขรายสถานีได้ หน้าต่างยังเปิดอยู่ ใช้ช่องว่างเพื่อล้างช่องนั้น หรือคืนค่า Target จากเป้ารายวัน 0 คือศูนย์',
          'ช่วงเวลากรอกเป็นชุดใช้ตาราง CONFIG ปัจจุบันโดยตรง ไม่จับคู่กับช่วงเวลาเก่า เปลี่ยนตารางแล้วยังกรอกได้ ช่วงเวลา ค่าและปัญหาเดิมเก็บใน SQLite และดูย้อนหลังตามวันที่ได้',
          'เปลี่ยนวันที่ สาย Model หรือช่วงเวลาจะบันทึกขอบเขตเดิมก่อน ปุ่มบันทึกยังเปิดหน้าต่างไว้ X, Esc หรือคลิกด้านนอกจะบันทึกแล้วปิด กลับไปยังวันที่และคู่ที่เลือก',
          'ค่าผิดหรือข้อมูลขัดแย้งจะเก็บฉบับร่างและหน้าต่างไว้ ชุดที่ขัดแย้งไม่บันทึก ให้รีเฟรช ตรวจสอบ แล้วบันทึกอีกครั้ง',
          'คลิกเพิ่มปัญหาหรือข้อความย่อเพื่อเปิดหน้าต่างที่ระบุสถานี วันที่ กะและช่วงเวลา ข้อความด่วนภาษาอังกฤษมาจากรายการข้อมูลหลักและแก้ไขต่อได้ Enter ขึ้นบรรทัดใหม่ ล้างข้อความเพื่อลบ กดเสร็จสิ้น Esc คลิกนอกหน้าต่างหรือ Ctrl+Enter เพื่อปิดและบันทึก เปิดโดยไม่แก้ไขจะไม่เขียนข้อมูล ข้อความยาวไม่เพิ่มความสูงของแถว',
          'ออกจากช่องตัวเลขเพื่อบันทึกและตรวจ Saved ว่างคือยังไม่กรอก 0 คือยืนยันศูนย์ ปุ่มกะเช้า/กลางคืนเปิดทั้งกะ และปุ่มช่วงเวลาปัจจุบันเลือกช่วงที่กำลังผลิตตามเวลากรุงเทพฯ Tab ไปช่วงถัดไป Enter ลงสถานีถัดไป F2 เปิดปัญหา Ctrl+Enter กลับช่องเดิม วางตารางโดยแต่ละแถวเป็นสถานีถัดไป คอลัมน์ Target/Actual ที่อยู่ติดกันอยู่ในช่วงเวลาเดียว คู่คอลัมน์ถัดไปจึงไปช่วงเวลาถัดไป ถ้ามีคอลัมน์เดียวจึงสลับ Target/Actual ตามแถว ส่วนเกินจะถูกละเว้น เปิดเมนู Excel สำหรับแบบทั้งวันหรือแยกกะ',
          'ปุ่มคืนค่าเริ่มต้นขอการยืนยันก่อนคืน Target จากเป้ารายวัน และล้าง Actual กับปัญหาของทุกสถานีทั้งสองกะในวันที่และสาย/Model ที่เลือก',
          'แก้ค่าผิด การบันทึกไม่สำเร็จหรือรุ่นขัดแย้งก่อนออก ดูข้อมูลล่าสุดเฉพาะสถานีที่ขัดแย้ง เลือกข้อมูลล่าสุดหรือบันทึกเฉพาะช่องที่แก้ รักษาช่องอื่นที่ผู้อื่นแก้ไว้และไม่เขียนสถานีอื่น',
        ],
      },
      {
        title: 'นำเข้ารายงาน Excel',
        paragraphs: [
          'คอลัมน์แม่แบบเรียง Date, Shift, Line, Model, Job, Station, Time slot, Target, Actual, Issue, Row ID กรอกช่องสีเหลืองและเก็บรหัสเดิม ตรึงหัวตารางและคอลัมน์ระบุสถานี กรองได้ทุกคอลัมน์ เรียงตามสาย/Model และลำดับสถานี โดยกะเช้าต่อด้วยกะกลางคืนในแต่ละสถานี ตัวอย่างนำเข้าเรียงแบบเดียวกัน รองรับลำดับคอลัมน์เก่าด้วย',
          'CSV ใช้ Row ID + Time slot หรือ Line + Model + Job/Station + Time slot ที่ระบุได้หนึ่งสถานี ถ้าระบุแค่สาย/Model แล้วพบหลายสถานีจะปฏิเสธ ช่องว่างเก็บค่าเดิม 0 เขียนศูนย์ เลือกแม่แบบและนำเข้าทั้งวันหรือแยกกะได้',
          'ดูตัวอย่างเพื่อตรวจสถานี เวลา ค่าและรุ่น แก้ข้อผิดพลาดก่อนนำเข้า หากสถานีใดหรือการตั้งค่ารุ่นเปลี่ยนจะปฏิเสธทั้งชุด ประวัติใช้รหัสสถานีและเวลาเดิมได้',
        ],
      },
      {
        title: 'ภาพรวม รายละเอียด และกระดานเต็มหน้าจอ',
        paragraphs: [
          'ภาพรวมเริ่มต้นที่ทั้งวัน สลับช่วงเวลา/รายวันข้างชื่อหน้าหรือด้านบนเต็มจอ จำตัวเลือกหลังรีเฟรช ช่วงเวลาแสดงเป้า ผลจริงและผลต่างปัจจุบัน รายวันแสดงเป้าเต็มวัน ผลจริงและผลต่างรวมสองกะโดยไม่ขึ้นกับตัวกรองกะ กราฟแต่ละสายขยายตามพื้นที่ ไม่มีข้อมูลแสดง — การแจ้งเตือนและสัดส่วนยังใช้ข้อมูลสะสม ทั้งหน้าภาพรวมและรายละเอียดเลือกทั้งวัน/กะเช้า/กะกลางคืนได้ แต่ละสาย/Model ยังใช้สถานีแหล่งผลผลิตเดียวเพื่อไม่ให้นับซ้ำ',
          'หน้าต่างเต็มหน้าจอใช้สีตามธีมและรวมสาย Model ผู้รับผิดชอบ และหกค่าของช่วงปัจจุบัน รายวัน และสะสมไว้ด้านบน การ์ดแต่ละสถานีแยกบุคลากรกะเช้าและกะกลางคืน X หรือ Esc กลับกลุ่ม/หน้าเดิม',
          'กราฟรวมรักษาระยะห่างของป้ายเวลาทุกช่วง หากมีหลายช่วงให้เลื่อนแนวนอนในกราฟ รวมถึงเต็มหน้าจอ ชี้เมาส์หรือกด Tab เพื่อดูค่า รีเฟรชเก็บตำแหน่งเลื่อนเดิม ตัวเลือกเปิดแนวโน้มและสัดส่วนแยกกัน ไม่กรอกไม่ถือเป็นศูนย์ เต็มหน้าจอแสดงเจ็ดคู่ต่อหน้าด้วยการ์ดแถวเดียวบนเดสก์ท็อป หน้าจอเล็กเลื่อนรายการได้ ใช้ปุ่มเปลี่ยนหน้าเมื่อเกินเจ็ดคู่',
        ],
      },
      {
        title: 'อ่านสถานะผลผลิตและการแจ้งเตือน',
        paragraphs: [
          'ผู้จัดการเปิด Settings → การแจ้งเตือนและรีเฟรช เลือกเปิดแต่ละกฎการบรรลุการผลิต ความเสี่ยงผลิตไม่ทัน ข้อมูลไม่รายงาน หรือกฎเดิม ปรับเกณฑ์แล้วบันทึกการตั้งค่า กฎใหม่เริ่มปิดใช้ UPH ตามแผนและกำหนดเสร็จคำนวณอัตโนมัติ ดูความเร็วและชั่วโมงผลิตของทั้งวัน/แต่ละกะในหน้าเป้าหมายรายวัน ไม่ต้องตั้งกำลังผลิตที่หน้านี้',
          'อัตราบรรลุคำนวณ Actual/Target เฉพาะช่วงผลิตที่จบและรายงานแล้ว ค่าเริ่มต้นเขียว ≥95% เหลือง ≥85% แดง <85% Actual ว่างคือยังไม่รายงาน ค่า 0 ที่บันทึกแล้วใช้ได้ เมื่อเกินผ่อนผัน 10 นาทีเป็นเหลือง อีก 30 นาทีเป็นแดง รายงานแล้วปลดเตือนทันที',
          'ความเสี่ยงเทียบ UPH ที่ต้องการกับ UPH ตามแผน เขียว ≤100% เหลือง ≤110% แดง >110% บอกว่าต้องเร่งกว่าแผนเท่าใด ไม่ใช่ขีดจำกัดเครื่องจักร เริ่มจากรายงานช่วงสุดท้ายที่ครบต่อเนื่อง ไม่ใช้ค่าเฉลี่ยล่าสุด เหตุผลแสดงข้อมูลถึงเวลาใด กำหนดเสร็จและชั่วโมงผลิตไม่รวมพัก ไม่มีเป้าหมายแผนหรือชั่วโมงผลิตแสดงไม่มีข้อมูล รายงานเกินกำหนดระบุข้อมูลล้าสมัย',
          'ไฟรวมให้แดงสำคัญกว่าเหลือง เขียวเมื่อทุกกฎที่เปิดมีข้อมูลและปกติ ไม่มีข้อมูลหรือปิดทั้งหมดแสดงเทา เหลืองกะพริบช้า แดงเร็ว เหตุผลสลับทุก 5 วินาที เริ่มจากแดงโดยไม่เปลี่ยนไฟรวม เปิดรายละเอียดสายเพื่ออ่านเหตุผลเต็มและทุกผลประเมิน กฎเดิมน้ำเงิน/ม่วงรวมเป็นเหลือง การกะพริบกรอบยังแยกตั้งค่า',
          'กำลังผลิต พัก ยังไม่เริ่มและสิ้นสุดแล้วคือสถานะตารางแยกจากไฟเตือน ช่วงพักแสดงเวลาและหยุดตัวจับเวลาผลผลิตไม่เพิ่ม ไม่ต้องกรอก Actual และไม่ปลดความเสี่ยงเดิมอัตโนมัติ รีเฟรชอัตโนมัติอ่านรายงานที่บันทึกตามเวลาที่ตั้ง หรือกดรีเฟรชทันที',
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
  ['line-schedules', 'schedule-timeline'],
  [],
  [
    'production-entry',
    'production-entry-paste',
    'production-cell',
    'issue-editor',
    'interval-batch',
    'no-output-station',
  ],
  ['excel-preview'],
  ['production-overview', 'seven-line-board', 'group-trend-dense', 'line-details'],
  ['unified-alerts'],
  [],
];
const exampleLabels = {
  en: {
    note: 'Expand one operation below to see its screenshot. Examples use the English interface and DEMO data; click an image for full size.',
    captions: {
      'schedule-timeline': 'Daily timeline and per-model target preview',
      'unified-alerts': 'Enable alert policies and edit thresholds',
      'setup-order': 'Setup order',
      'models-and-lines': 'Line/model dropdown pairing',
      'issue-quick-text': 'English issue quick text in Master data',
      'daily-targets': 'One default target per line + model',
      'line-schedules': 'Save a named schedule template, select lines and apply',
      'people-by-job': 'People filtered by job',
      'line-people': 'Line teams and owners',
      'line-configuration': 'Integrated station configuration and output source',
      'production-entry': 'Unified whole-day table',
      'production-entry-paste': 'Adjacent Target/Actual columns stay in one interval',
      'production-cell': 'Station target, actual and issue',
      'issue-editor': 'Compact issue editor and quick text',
      'interval-batch': 'One-time interval fill with editable station values',
      'no-output-station': 'No-output stations stay visible with read-only history',
      'excel-preview': 'Excel import preview',
      'line-details':
        'Theme-aware fullscreen details with owner, totals and day/night personnel',
      'production-overview': 'Production overview with DELTA branding and theme controls',
      'seven-line-board': 'Seven lines with large trends and Interval/Daily switch',
      'group-trend-dense': 'Dense whole-day trend: scroll horizontally to view every interval',
    },
  },
  zh: {
    note: '依操作名稱展開對應圖片。截圖統一使用 English 介面與 DEMO 資料；Chinese／Thai 的操作位置相同，點圖可看原尺寸。',
    captions: {
      'schedule-timeline': '全天時間軸與 Model 目標預覽',
      'unified-alerts': '勾選告警並調整門檻',
      'setup-order': '設定順序',
      'models-and-lines': '下拉配對產線與 Model',
      'issue-quick-text': '基礎資料的英文異常快捷文字',
      'daily-targets': '每組產線＋Model 一個預設日目標',
      'line-schedules': '儲存班表範本，再勾選線體套用',
      'people-by-job': '依職務篩選人員',
      'line-people': '產線兩班與負責人',
      'line-configuration': '整合站點配置與產量來源',
      'production-entry': '整合式整日填報',
      'production-entry-paste': '相鄰目標／實績欄留在同一時段',
      'production-cell': '每站目標、實績與異常',
      'issue-editor': '異常編輯視窗與快捷文字',
      'interval-batch': '同時段批次填寫，之後仍可個別修改',
      'no-output-station': '無產出站保留顯示與歷史查閱',
      'excel-preview': 'Excel 匯入預覽',
      'line-details': '跟隨主題的全螢幕明細與各站早晚班人員',
      'production-overview': '台達品牌與主題配色的生產總覽',
      'seven-line-board': '七條產線大曲線與時段／每日切換',
      'group-trend-dense': '全天多時段趨勢：左右捲動查看所有時段',
    },
  },
  th: {
    note: 'ขยายหัวข้อการทำงานเพื่อดูภาพ ตัวอย่างใช้เมนู English และข้อมูล DEMO ตำแหน่งปุ่มเหมือน Chinese/Thai คลิกภาพเพื่อดูขนาดเต็ม',
    captions: {
      'schedule-timeline': 'ไทม์ไลน์ทั้งวันและตัวอย่างเป้าหมายรุ่น',
      'unified-alerts': 'เปิดกฎเตือนและปรับเกณฑ์',
      'setup-order': 'ลำดับตั้งค่า',
      'models-and-lines': 'จับคู่สาย / Model',
      'issue-quick-text': 'ข้อความปัญหาภาษาอังกฤษในข้อมูลหลัก',
      'daily-targets': 'เป้าหมายต่อสาย + Model',
      'line-schedules': 'บันทึกแม่แบบแล้วเลือกสายที่จะใช้',
      'people-by-job': 'บุคลากรตามหน้าที่',
      'line-people': 'ทีมและผู้รับผิดชอบ',
      'line-configuration': 'บุคลากรอัตโนมัติ',
      'production-entry': 'ตารางบันทึกรวม',
      'production-entry-paste': 'คอลัมน์ Target/Actual ที่ติดกันอยู่ช่วงเดียว',
      'production-cell': 'เป้าหมาย ผลจริงและปัญหาแยกตามสถานี',
      'issue-editor': 'หน้าต่างแก้ปัญหาและข้อความด่วน',
      'interval-batch': 'กรอกทุกสถานีตามช่วงและแก้รายสถานีภายหลัง',
      'no-output-station': 'สถานีไม่มีผลผลิตและประวัติแบบอ่านอย่างเดียว',
      'excel-preview': 'ตัวอย่างนำเข้า Excel',
      'line-details': 'รายละเอียดเต็มจอตามธีม พร้อมยอดรวมและบุคลากรแยกกะ',
      'production-overview': 'ภาพรวมการผลิตพร้อมสัญลักษณ์ DELTA และธีมสี',
      'seven-line-board': 'กราฟใหญ่เจ็ดสาย พร้อมสลับช่วงเวลา/รายวัน',
      'group-trend-dense': 'กราฟทั้งวันหลายช่วงเวลา เลื่อนแนวนอนเพื่อดูทุกช่วง',
    },
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
  const screenMarkup = (index) => {
    const names = exampleScreens[index];
    return names.length
      ? `<p class="help-example-note">${esc(examples.note)}</p><div class="help-screens">${names
          .map((name, index) => {
            const caption = examples.captions[name];
            return `<details class="help-example"><summary><span>${index + 1}</span>${esc(caption)}</summary><figure><a href="/guide-images/${name}.png" target="_blank" rel="noopener"><img src="/guide-images/${name}.png" alt="${esc(caption)}" loading="lazy"></a><figcaption>${esc(caption)}</figcaption></figure></details>`;
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
