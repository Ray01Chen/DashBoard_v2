# 程式維護導覽

## 多廠區與 RBAC 入口

Phase 1 的 schema、API、Migration、權限與部署回復規則集中在 [MULTI_SITE](./MULTI_SITE.md)。先讀 `site-migration.mjs` → `site-access.mjs` → `auth.mjs` → `site-management.mjs` → `server.mjs`；前端由 `site-management.js` 與 app.js 整合。

新增業務 API 必須先經 Session 授權及廠區綁定，再用 `siteQuery` 將 SQL 顯式綁定 `:site_id`，不可從 Payload 選資料範圍。交易內重新驗權防止 await 期間撤權。設定保存在 AsyncLocalStorage 請求範圍，不能再建程序共用的 config。`site_settings` 是唯一正式設定來源；legacy `app_settings` 只相容預設廠區。

`users.system_role` 是全域角色，`user_sites.role` 是各廠角色；legacy role 不得作為新功能授權依據。System Admin 的全域管理 API 與一般廠區業務 API 分開。不同角色／同帳號多廠／失效 Session 及匯入 Token 隔離測試在 `tests/multi-site.test.mjs`，真實 UI 在 `scripts/site-management-audit.mjs`。

登入帳號 UUID 與 site ID 已可作未來個人清單 `user_id + site_id + list_id` 的範圍鍵；不要把個人排序塞入共用廠區設定。本階段不建立排序或進階報表。


## 從哪裡開始讀

先從 [README](../README.md) 啟動專案並完成一次設定、填報、總覽操作，再依功能往下追：

| 要理解的功能 | 建議閱讀順序 |
| --- | --- |
| 網址、頁殼及資料載入 | `public/pages.js` → `public/index.html` → `public/app.js` → `server.mjs` |
| 生產總覽 | `public/monitor.js` → `public/dashboard.js` → `public/monitor-ui.js` → `public/line-detail.js` |
| 告警 | `public/alerts.js` → `public/alert-display.js` → `tests/alerts.test.mjs` |
| 填報與儲存 | `public/entry.js` → `server.mjs` 的 API／writeRecord → `production-defaults.mjs`／`line-production.mjs` |
| 時段與計畫 UPH | `public/production-schedules.js`／`public/production-targets.js` → `schedule-config.mjs` |
| 匯入 | `production-import.mjs` → `spreadsheet.mjs` → `tests/entry-import.test.mjs` |
| 版面、語言與教學 | `public/index.html` → 各 CSS／`design-system.css` → `public/i18n.js`／`public/help.js` |

典型資料流是 **瀏覽器操作 → 已登入 API → 驗證與版本檢查 → SQLite 交易 → 回傳資料 → 共用業務模組 → UI**。`data/template.json` 是初始化來源，`temp.xlsx` 是原始解析測試樣本，兩者都不是生產資料庫的替代品。

`tests/*.test.mjs` 由 Node test runner 自動發現；`scripts/*-audit.mjs` 多由 browser-smoke 引入，不能以「沒有直接 import 某個測試檔」判斷它沒用。

## 模組責任

| 模組 | 責任 |
| --- | --- |
| `server.mjs`、`auth.mjs` | HTTP 路由、權限、SQLite 儲存、版本檢查與稽核 |
| `production-defaults.mjs`、`public/production-targets.js` | 伺服器預設、人員快照與兩班日目標分配 |
| `public/production-schedules.js`、`schedule-config.mjs` | 多份範本／產線班表解析、日期投影、時段 ID 保留及跨班重疊驗證 |
| `public/production-models.js` | Line／Model 識別、站點順序與人員名稱解析 |
| `public/entry.js` | 填報控制器、各站儲存佇列、矩形貼上、批次草稿與匯入操作 |
| `production-import.mjs`、`spreadsheet.mjs` | Excel／CSV 編解碼、預覽驗證及匯入 |
| `public/app.js` | 頁面切換、資料載入、範圍篩選與共用確認視窗 |
| `public/monitor.js`、`public/dashboard.js`、`public/line-detail.js` | 來源站計量、看板圖表與全螢幕明細 |
| `public/monitor-ui.js`、`public/board-display.js`、`public/monitor-paging.js`、`public/monitor-carousel.js` | 卡片呈現、瀏覽器顯示偏好、分頁狀態與動畫 |
| `public/list-order.js`、`public/line-picker.js` | 個人顯示順序與可搜尋分組選線，不改流程設定 |
| `public/*-settings.js`、`public/issue-presets.js` | 設定草稿、資料清單與英文異常快捷文字 |
| `public/i18n.js`、`public/help.js` | 共用翻譯與依角色顯示的教學 |

## 修改時保留的行為

- `monitor.js` 的 `overviewMetrics` 統一計算目前時段及累計值，依曼谷生產日期、原始班表起點處理跨午夜。累計包含目前時段的完整目標，排除尚未開始的時段。總覽及缺口警示共用 `cumulativeGap`；已移除舊式只比較已填時段的差額計算。
- `app.js` 在總覽／明細載入雙班資料，以提供不隨班別篩選改變的全日目標與實績；填報仍以各班獨立版本寫入。`overviewMetricsMarkup` 依傳入鍵值呈現三項時段或每日數字；明細預設保留六項完整數字。`metricScope` 只改呈現，不改班別範圍、來源站或警示，定時更新只更換數值，不重建已開啟明細或破壞其捲動位置。

- 填報儲存鍵包含日期、班別、站點。切換畫面不能改變已排入佇列的寫入目的。
- 各站獨立儲存，使用伺服器版本檢查；批次時段與 Excel 匯入使用整批驗證，遇到衝突保留草稿供使用者處理。
- 全天報表是兩班的唯讀合併結果，不能把合併版本當作任一班的寫入版本。
- 「恢復預設」使用伺服器提供的時段 Target，清空所選日期及 Line／Model 兩班的 Actual／Issue，須由使用者確認。人員快照與日目標設定不變。
- 班表存於 `schedules`（預設）、`scheduleTemplates[]`（具名範本）與 `lineSchedules[line]`（套用後的獨立複本）。範本修改不隱式套用；編輯預設時先保留既有沿用線體的原班表。明確套用後才取代所選線體，刪除範本不刪線體複本。
- `normalizeSchedules` 共用跨班重疊驗證；未改時段先沿用原 ID，同次儲存範本與多線體時，經已驗證範本映射共用新 ID，避免同一時段在分組圖變成多個時間點。這是設定複本的身份維護，不比對歷史填報來阻擋批次。
- `reportSchedule` 統一目前／未來只顯示 CONFIG、已結束歷史日讀已存時段的規則；夜班跨午夜未結束時仍屬目前生產日。填報儲存佇列保留完整 record，僅過濾欄位與合計，不能為了隱藏舊欄直接刪掉資料。Excel／CSV 與啟用線體監控共用投影。
- `monitor.js` 在每條線內建立生產 windows，休息判定、停滯計時與目前目標各自計算。範本變動不改自訂線或歷史快照；產線改名、刪除同步維護 override。
- 批次選項與 `planStationInterval` 只以所選產線目前 CONFIG 的生產時段 ID 為寫入目的；不讀舊時段來比對或阻擋。`writeRecord` 合併新時段並保留原快照。前端「恢復預設目標」依目前 CONFIG 重新分配日目標，不能使用歷史快照的預設。
- 批次「恢復預設目標」只修改目前時段草稿的 Target，並清空尚未套用的共用 Target，避免儲存時再次覆蓋預設；Actual／Issue 草稿保留。
- 缺值 `null` 與明確的 `0` 不同。Excel 空白保留舊值，畫面明確套用空白則清除該欄。
- Excel 的欄位、標題及欄寬集中在 `production-import.mjs` 的 `templateColumns`；範本與預覽共用產線／Model、站點、班別排序。歷史時段依保存的順序，不能直接用時鐘字串排序。匯入依表頭名稱解析，因此新舊欄位排列皆可使用。
- `spreadsheet.mjs` 的寫入器接受欄寬、填寫欄索引與固定欄數；篩選範圍依實際欄數產生。文字保持文字，不把使用者內容轉成公式。整批匯入仍由伺服器驗證及版本檢查。
- 歷史快照、舊資料轉換及已刪站點識別仍用於讀取既有報表，不能僅因目前設定沒有該站而移除相關邏輯。

## 寫法與驗證

`monitor-paging.js` 共用一般／全螢幕狀態機，`pageSize` 上限為 7；`fitMonitorPage` 以卡片軌道實際高度、CSS `--monitor-row-height` 及間距計算完整列數。全螢幕使用視窗高度 Grid，為控制區、分組、篩選、分頁與選用圖表保留空間，較矮時減少每頁筆數；當頁實際卡片以 flex 均分高度，但容量始終使用不變的 CSS 最小列高計算，避免 7／7／1 切頁後產生容量回饋循環。字級保持不變，主曲線最高 104px；頁面禁止垂直捲動。桌面維持單列橫向，窄容器才改堆疊。長名稱提供 Tooltip／完整明細；`setMonitorNumber` 保留精確值，`fitMonitorNumbers` 依 DOM Range 實測可用寬度，再批次嘗試本地化短格式；完整值仍在 title 與明細中，不修改計算。寬度、字型、語言與數值快取於 WeakMap，避免每秒重排穩定資料。

`monitoring.pageRotateSeconds` 沿用原保存方式；暫停是瀏覽器內狀態，恢復及手動切頁重新給完整停留。篩選重設頁次，容量變動保留原首條產線所在頁。輪播走 quiet render，只更換卡片清單；Pager、分組、篩選及其他圖表節點保留。ResizeObserver 只在寬度影響曲線時重畫圖；全螢幕卡片軌道高度變動只更新容量，避免因切頁清單高度變動重建整個看板。彈窗、暫時側欄、一般模式展開及卡片焦點暫停輪播。全螢幕箭頭沿用 `line-detail-dialog` 查看完整原因，不能將列增高。

`renderTrend` 共用於產線、分組及明細圖，從 CSS 容器量測像素尺寸。產線曲線不再使用固定 310×82 viewBox，也不再擠進 90px 欄。`trendSvg` 的完整時間軸每個標籤至少保留 48px；密集時段只在圖內捲動。ResizeObserver 處理側欄／視窗／全螢幕變更，用尺寸鍵避免重畫迴圈；明細關閉時解除觀察。保留圖表捲動位置。

圖表使用 SVG `width` 屬性及共用 CSS 的最小寬度，不能在產生的 HTML 內加入 `style` 屬性；頁面的 CSP 不接受行內樣式。瀏覽器驗證須量測實際文字邊界，僅測 SVG 字串的座標不足以發現文字被縮小的問題。

函式名稱描述使用者操作或資料轉換；DOM 的 `data-*` 操作名稱、事件分派及測試選擇器須同步。翻譯字典維持三語對應。註解說明日期／版本／歷史相容等限制及原因，避免逐行重述程式。

移除函式、匯出、翻譯或樣式前，搜尋呼叫處、動態鍵值、HTML 產生器及測試。通用輔助函式只有在多處需要同一語意時才抽出。

基礎版面在 `public/style.css`，目前共用卡片與響應式規則集中在最後載入的 `public/design-system.css`，主題透過既有 `--primary`、`--soft`、`--tint` 等變數傳遞，不另建立按主題分岔的版面。`public/delta-logo.svg` 為依提供畫面重繪的本地向量識別，以 SVG view 分別顯示圖標及字標，可在此集中替換品牌標準素材；品牌藍不隨主題改色。教學截圖說明改以圖片名稱作鍵，避免增刪圖片時錯配另一張圖的文字。

執行 `npm test`，以及 `BP_BROWSER_PATH=/usr/bin/chromium node scripts/browser-smoke.mjs --screenshots`。瀏覽器測試使用隔離資料庫；`--screenshots` 更新教學圖。瀏覽器路徑可依本機安裝調整，Playwright 設定見腳本開頭。

正式工具設定在 `eslint.config.mjs`、`.prettierrc.json`、`.prettierignore` 與 `.editorconfig`，版本由 `package-lock.json` 固定。先 `npm ci`，再 `npm run check`；它包含 Git 檔案規則、ESLint、格式、語法及自動測試。ESLint 額外檢查未宣告識別字，Node 與前端分開使用對應全域變數；瀏覽器測試允許頁面 evaluate 內的 DOM 全域。格式為兩空格、單引號、96 欄、LF，由 Prettier 統一；Windows 啟動器維持四空格。

`npm run format` 只處理支援的原始碼／設定與 README，操作文件、seed 資料及 SVG 保持人工維護。瀏覽器驗證使用 `npm run test:browser`，可加 `-- --screenshots` 更新截圖。服務本身沒有第三方執行期依賴，ESLint／Prettier／globals 都是 devDependencies；不要把 node_modules 或 .runtime 提交。

靜態檢查不等於證明沒有未用的跨模組匯出、動態 CSS 或邏輯問題。`app.js`、`entry.js`、`server.mjs` 仍較大，`style.css` 有歷史疊加樣式；未來修改相關功能時逐步拆分或整理，不為了格式檢查大規模改動業務流程。移除前仍須追蹤呼叫、動態識別與歷史用途。

教學採每項操作一張圖、依步驟展開。`screenshot` 測試輔助函式會固定寬度、關閉並還原臨時選單、重置並還原內部捲動、移開滑鼠，再以同源 CSS 排除畫面外的固定導覽。不可為截圖關掉 CSP，也不可直接拍長篇 `#settings-body` 作為班表說明。範本區域使用 `#structure-schedule`；總覽使用 `#line-dashboard`，一般總覽截圖擷取前三張作閱讀示例；全螢幕截圖使用實際 viewport，禁止 fullPage 掩蓋垂直溢出。圖片與程式一併由 `--screenshots` 更新。

## 統一告警與時段預覽

- `public/alerts.js` 是純計算：接收已組好的來源站 series、有效生產 windows、現在時間、門檻及產能基準；回傳 severity 與 translation key/params，不操作 DOM。NULL 與 0、連續回報 cutoff、休息排除及 STALE 都集中在此。
- `public/alert-display.js` 管理原因翻譯、每組線體的五秒輪播及 DOM 更新。輪播狀態只因原因識別／嚴重度改變而重設，不隨每秒的實際數字重設；總燈號與輪播無關。
- `monitoring.unified` 儲存三項門檻。`production-targets.js` 的 `plannedProduction` 沿用日目標整數分配，回傳對應範圍的 target、hours、uph；設定預覽與告警共用計算，派生值不另存。`monitor.js` 負責選當日 CONFIG 或歷史 productionDay 快照，並取最後生產段結束作截止。
- 舊 `monitoring.capacity` 在啟動時只清理該設定鍵並更新設定版本，正常儲存也不接收舊鍵。保留生產記錄、目標、實績、快照與其他告警設定。
- `public/schedule-preview.js` 只顯示既有班表的視覺化與目標分配，不建立另一份排程；伺服器 `schedule-config.mjs` 仍是儲存驗證的權威。時間軸 SVG 使用屬性而非行內 style，符合既有 CSP。
- `tests/alerts.test.mjs` 覆蓋門檻邊界、未填與 0、連續回報缺口、截止、休息、無基準、三語與輪播。API 測試驗證非法設定不寫入與重啟後保存；Chromium 實際驗證設定及不同告警狀態。

## 共用設計系統與監控呈現

- `design-system.css` 最後載入，以現有 Theme Variables 推導共用表面、字色、圓角、間距與陰影；固定語意色只用於告警及班表狀態。桌面橫向七區卡片、短螢幕全螢幕與手機堆疊均在此維護，避免再於各功能樣式末端追加不同版本。
- `monitor-ui.js` 專責卡片標記、時段摘要、達成率呈現、狀態篩選及暫時展開狀態。數值仍由 `monitor.js` 提供，告警仍由 `alerts.js` 計算，篩選及手動輪播不寫入 CONFIG。
- `dashboard.js` 保留卡片節點，只有範圍、語言或成員變更才重建；背景刷新更新值及圖表，避免燈號重啟、焦點及展開內容丟失。`alert-display.js` 的手動切換重設五秒停留，燈號仍由固定最高嚴重程度控制。顯示參數最多兩位小數，不改原始計算精度。
- `body[data-page]` 用於頁面樣式；不得使用 `data-view`，後者是現有導覽查詢與事件的識別屬性。
- `scripts/design-audit.mjs` 沿用 smoke 的臨時伺服器及 SQLite，建立七線可重現場景，驗證視窗、主題、語言、篩選、原因展開及更新節點。正式資料不參與寫入測試。

## 導覽、排序與選線面板

- `list-order.js` 使用資料庫載入的個人排序，沒有偏好時維持來源與明確設定順序，不再依字母或語言排序；詳見下方個人排序章節。畫面仍以原索引／穩定 ID 更新設定，不能用顯示位置當成資料索引。
- `line-picker.js` 由目前草稿的線體、既有分組產生搜尋面板；搜尋及勾選只更新 UI，不寫設定。群組可包含重疊線體，選取以 Set 去重；全選／取消作用於全部線體，搜尋不丟掉隱藏選擇。套用與保存仍走原有確認、版本檢查及 API。
- 所有原路由及權限保留於分組 Sidebar；桌面 `bp-collapsed` 儲存圖示模式。`overlayNavigation` 於小螢幕或全螢幕開 Drawer，關閉時 inert 排除鍵盤焦點；Escape／遮罩關閉並返回按鈕，Tab 在 Drawer 內循環，不寫桌面收合偏好。
- `design-system.css` 共用同一份資訊順序及 Grid 元件；桌面使用緊湊橫列，行動寬度才調整排列；來源及下一時段保留。卡片從清單繼承同一份 `--monitor-card-columns`；不得按單條資料新增可變欄寬。數值用四欄或一致的 2×2 Grid，22px 與 tabular-nums 不因資料變長而縮小；曲線 track 不借給數值欄。停留與明細保留精確值；額外圖表排在卡片之後，不再以短螢幕字級縮小維持版面。
- `alertReasonText` 的 `compact` 只選用本地化摘要鍵；完整原因及原始計算精度保留。整體嚴重程度、輪播及資料來源仍由既有告警模組管理。

## 回報告警時間相容

`monitoring.unified.reporting.redAfterMinutes` 是時段結束後的總分鐘數，須大於等於 `graceMinutes`。計算層只比較 `endAt + redAfterMinutes`，不再把寬限加第二次。`alertConfig` 在讀取／保存時將舊 `redMinutes`（額外等待）轉為 `graceMinutes + redMinutes` 並刪舊鍵；以 own-property 判斷新格式，確保重複正規化不累加。舊欄缺省的額外等待仍為 30，避免更動既有門檻。新設定預設寬限 10／總共 40；升紅燈使用嚴格超過。UI 即時顯示共同起點及舊設定換算提示。`reporting-time.test.mjs` 與實際 API／瀏覽器驗證涵蓋 CD303 的 30／45、舊 30＋45＝75、跨日、45／75 分鐘時段及已提交零產出解除。

## 分頁動畫

`monitor-carousel.js` 專責 600ms 的 Transform／Opacity 動畫。穩定的 `monitor-card-viewport` 只含目前資料層與至多一層 inert／aria-hidden 的舊頁快照；快照移除所有 ID，不參與事件、資料更新或輔助閱讀。前後頁各自計算最終列高，以水平交接避免對文字做 scale 或在不同最小高度間插值造成互相擠壓。一般模式另外過渡外框高度，全螢幕外框高度不變。完成、快速再次切頁、切篩選或啟用 reduced motion 時會清除動畫及快照；不新增計時器。

`MonitorPaging.motionRevision` 只在手動或自動換頁時增加，`direction` 在自動回第一頁仍為 forward。`isMonitorPageTurn` 同時比對範圍、容量、語言與顯示模式，只有真正的同範圍頁次切換會播放動畫。刷新不重設頁碼、停留或動畫。新預設間隔集中在 `monitor.js` 的 `defaultPageRotateSeconds`（12），前後端共用；已存自訂值不遷移覆蓋。

## 全螢幕顯示偏好

`board-display.js` 集中預設及白名單正規化。`bp-board-display` 僅保存布林顯示偏好，讀取時忽略非法／未知欄位並相容舊 `bp-board-trend`／`bp-board-share`；不寫 CONFIG 或 API。`applyBoardDisplay` 以 body data attributes 控制全螢幕區塊，一般模式不受影響；既有 ResizeObserver 重算剩餘高度和分頁容量。顯示選單與離開全螢幕始終位於保留的 actions 區。Esc 優先關閉顯示選單，避免使用鍵盤調整時意外退出看板。

`overview-refinement-audit.mjs` 使用獨立日期與真實 API，對比小數值／六位數的圖表位置尺寸、每張卡片各欄座標、22px 數字實測邊界、三語與不同解析度／縮放；另確認顯示設定保存、重設及沒有生產設定寫入。選單圖與大數字圖由此測試產生。

## 個人排序與總覽 Inline Editing

- `personal-lists.mjs`：啟動時以 `CREATE TABLE IF NOT EXISTS` 增加 `user_list_orders`（`user_id + site_id + list_id` 複合主鍵、FK、JSON items、version、updated_at），不改既有業務表。GET `/api/preferences/lists` 回傳目前廠區的實際清單與本人的排序；PUT `/api/preferences/lists/:listId` 以版本更新本人排序。Session 廠區、當下授權與交易重驗沿用 Phase 1。
- `public/personal-lists.js` 定義清單的穩定身份與實際資料來源；`list-order.js` 只排列畫面副本，`setPersonalOrders` 的狀態由登入／廠區載入，設定更新後重載。沒有偏好時保留來源順序，新增身份附加末尾。`personal-order-ui.js` 負責 Pointer Events、鍵盤按鈕、位移動畫及序列化自動儲存；失敗保留未儲存順序並提供重試／重載。站點流程、時間與歷史資料不套個人排序。
- `public/overview-inline.js`：草稿固定在目前報表日期／班別／產出站點，只有時段可在狀態旁選擇；同一時段不再於卡片其他位置重複。保存讀取時的 record/config version，避免草稿被刷新或其他使用者的修改覆蓋。沿用 `/api/entry/records/:rowId` 的 `stationEntry:true`，只提交實績與原有純文字 issue，不重建異常資料模型。`writeRecord` 既有版本驗證、RBAC、site_id、updated_by／updated_at 及 audit 保持有效。
- `dashboard.js` 在原有卡片更新後掛接相同編輯器；安靜刷新不覆蓋草稿。全螢幕依編輯列需要的高度減少頁面容量，保留鄰列，停止自動換頁；退出全螢幕仍沿用原草稿。動畫與版面集中於 `overview-interactions.css`，使用現有主題 tokens，支援 reduced motion。
- 測試：`tests/personal-lists.test.mjs`、`tests/multi-site.test.mjs`、`scripts/overview-interaction-audit.mjs`；後者已接入完整 browser smoke，使用獨立測試廠區／資料庫。

管理導覽使用原側欄內的 `#management-nav` 原生 details／summary，保留舊路由及權限。`data-active-view` 只追蹤展開狀態，不能使用保留給頁面連結的 `data-view`，以免被共用路由事件當成導覽連結。
