# 程式維護導覽

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

`monitor-paging.js` 的純狀態機共用於一般／全螢幕，`pageSize` 為 7；保留已排序陣列，按範圍／成員變化重設頁次。`monitoring.pageRotateSeconds` 預設 20、0 停用；手動換頁重新給完整停留，彈窗／側欄／展開／卡片內焦點／背景分頁暫停。桌面卡片依容器寬度排欄；長文字、大數字及窄視窗換行增高，不能以固定高度裁切或硬縮字級塞七張。瀏覽器測試量測各區邊界、曲線比例及可捲動性，不要求七張同時在視窗內。告警評估不受分頁及數字模式影響。

`renderTrend` 共用於產線、分組及明細圖，從 CSS 容器量測像素尺寸。產線曲線不再使用固定 310×82 viewBox，也不再擠進 90px 欄。`trendSvg` 的完整時間軸每個標籤至少保留 48px；密集時段只在圖內捲動。ResizeObserver 處理側欄／視窗／全螢幕變更，用尺寸鍵避免重畫迴圈；明細關閉時解除觀察。保留圖表捲動位置。

圖表使用 SVG `width` 屬性及共用 CSS 的最小寬度，不能在產生的 HTML 內加入 `style` 屬性；頁面的 CSP 不接受行內樣式。瀏覽器驗證須量測實際文字邊界，僅測 SVG 字串的座標不足以發現文字被縮小的問題。

函式名稱描述使用者操作或資料轉換；DOM 的 `data-*` 操作名稱、事件分派及測試選擇器須同步。翻譯字典維持三語對應。註解說明日期／版本／歷史相容等限制及原因，避免逐行重述程式。

移除函式、匯出、翻譯或樣式前，搜尋呼叫處、動態鍵值、HTML 產生器及測試。通用輔助函式只有在多處需要同一語意時才抽出。

共用版面集中在 `public/style.css`，主題透過既有 `--primary`、`--soft`、`--tint` 等變數傳遞，不另建立按主題分岔的版面。`public/delta-logo.svg` 為依提供畫面重繪的本地向量識別，以 SVG view 分別顯示圖標及字標，可在此集中替換品牌標準素材；品牌藍不隨主題改色。教學截圖說明改以圖片名稱作鍵，避免增刪圖片時錯配另一張圖的文字。

執行 `npm test`，以及 `BP_BROWSER_PATH=/usr/bin/chromium node scripts/browser-smoke.mjs --screenshots`。瀏覽器測試使用隔離資料庫；`--screenshots` 更新教學圖。瀏覽器路徑可依本機安裝調整，Playwright 設定見腳本開頭。

本次另用 ESLint 檢查前端、伺服器、測試及腳本的未使用變數、不可達程式、重複參數／鍵值與固定條件。這些檢查輔助清理，功能是否必要仍須依呼叫流程與歷史資料用途判斷。


教學採每項操作一張圖、依步驟展開。`screenshot` 測試輔助函式會固定寬度、關閉並還原臨時選單、重置並還原內部捲動、移開滑鼠，再以同源 CSS 排除畫面外的固定導覽。不可為截圖關掉 CSP，也不可直接拍長篇 `#settings-body` 作為班表說明。範本區域使用 `#structure-schedule`；總覽使用 `#line-dashboard`，一般總覽截圖擷取前三張作閱讀示例；全螢幕截圖使用整頁保留七張自然高度卡片。圖片與程式一併由 `--screenshots` 更新。

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

- `list-order.js` 提供 locale-aware `Intl.Collator` 自然排序，排序副本並尊重數字型 `displayOrder`／`sequence`／`configOrder`／`order`。目錄、人員、群組畫面以原始索引或 ID 綁定編輯，不能用排序後位置更新 CONFIG。`byProduction` 只排列產線／Model 群組，同組站點先經 `orderedStationRows`，不改流程。時段及明確業務序列不套一般字母排序。
- `line-picker.js` 由目前草稿的線體、既有分組產生搜尋面板；搜尋及勾選只更新 UI，不寫設定。群組可包含重疊線體，選取以 Set 去重；全選／取消作用於全部線體，搜尋不丟掉隱藏選擇。套用與保存仍走原有確認、版本檢查及 API。
- 所有原路由及權限保留於分組 Sidebar；桌面 `bp-collapsed` 儲存圖示模式。`overlayNavigation` 於小螢幕或全螢幕開 Drawer，關閉時 inert 排除鍵盤焦點；Escape／遮罩關閉並返回按鈕，Tab 在 Drawer 內循環，不寫桌面收合偏好。
- `design-system.css` 共用同一份資訊順序及 Grid 元件；依卡片容器寬度切換完整橫列、雙列與行動堆疊，來源及下一時段保持可見。主要文字維持可讀字級，大數字增加列高；額外圖表排在卡片之後，不再以短螢幕字級縮小維持版面。
- `alertReasonText` 的 `compact` 只選用本地化摘要鍵；完整原因及原始計算精度保留。整體嚴重程度、輪播及資料來源仍由既有告警模組管理。


## 回報告警時間相容

`monitoring.unified.reporting.redAfterMinutes` 是時段結束後的總分鐘數，須大於等於 `graceMinutes`。計算層只比較 `endAt + redAfterMinutes`，不再把寬限加第二次。`alertConfig` 在讀取／保存時將舊 `redMinutes`（額外等待）轉為 `graceMinutes + redMinutes` 並刪舊鍵；以 own-property 判斷新格式，確保重複正規化不累加。舊欄缺省的額外等待仍為 30，避免更動既有門檻。新設定預設寬限 10／總共 40；升紅燈使用嚴格超過。UI 即時顯示共同起點及舊設定換算提示。`reporting-time.test.mjs` 與實際 API／瀏覽器驗證涵蓋 CD303 的 30／45、舊 30＋45＝75、跨日、45／75 分鐘時段及已提交零產出解除。
