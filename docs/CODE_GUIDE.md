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

全螢幕 `boardSize` 固定為 7，桌面卡片以大曲線及三項數字為主。短筆電縮減上方選用圖表高度，保留七列；小螢幕讓曲線獨佔一列並捲動清單。瀏覽器測試三語、兩種數字模式及 1280×720 到 2560×1440，量測七張卡完整可見、曲線寬至少 260px，且 SVG 座標和容器寬高一致。卡片狀態文字依所選數字模式判斷，告警由共用評估層決定，不受數字顯示模式影響。

`renderTrend` 共用於產線、分組及明細圖，從 CSS 容器量測像素尺寸。產線曲線不再使用固定 310×82 viewBox，也不再擠進 90px 欄。`trendSvg` 的完整時間軸每個標籤至少保留 48px；密集時段只在圖內捲動。ResizeObserver 處理側欄／視窗／全螢幕變更，用尺寸鍵避免重畫迴圈；明細關閉時解除觀察。保留圖表捲動位置。

圖表使用 SVG `width` 屬性及共用 CSS 的最小寬度，不能在產生的 HTML 內加入 `style` 屬性；頁面的 CSP 不接受行內樣式。瀏覽器驗證須量測實際文字邊界，僅測 SVG 字串的座標不足以發現文字被縮小的問題。

函式名稱描述使用者操作或資料轉換；DOM 的 `data-*` 操作名稱、事件分派及測試選擇器須同步。翻譯字典維持三語對應。註解說明日期／版本／歷史相容等限制及原因，避免逐行重述程式。

移除函式、匯出、翻譯或樣式前，搜尋呼叫處、動態鍵值、HTML 產生器及測試。通用輔助函式只有在多處需要同一語意時才抽出。

共用版面集中在 `public/style.css`，主題透過既有 `--primary`、`--soft`、`--tint` 等變數傳遞，不另建立按主題分岔的版面。`public/delta-logo.svg` 為依提供畫面重繪的本地向量識別，以 SVG view 分別顯示圖標及字標，可在此集中替換品牌標準素材；品牌藍不隨主題改色。教學截圖說明改以圖片名稱作鍵，避免增刪圖片時錯配另一張圖的文字。

執行 `npm test`，以及 `BP_BROWSER_PATH=/usr/bin/chromium node scripts/browser-smoke.mjs --screenshots`。瀏覽器測試使用隔離資料庫；`--screenshots` 更新教學圖。瀏覽器路徑可依本機安裝調整，Playwright 設定見腳本開頭。

本次另用 ESLint 檢查前端、伺服器、測試及腳本的未使用變數、不可達程式、重複參數／鍵值與固定條件。這些檢查輔助清理，功能是否必要仍須依呼叫流程與歷史資料用途判斷。


教學採每項操作一張圖、依步驟展開。`screenshot` 測試輔助函式會固定寬度、關閉並還原臨時選單、重置並還原內部捲動、移開滑鼠，再以同源 CSS 排除畫面外的固定導覽。不可為截圖關掉 CSP，也不可直接拍長篇 `#settings-body` 作為班表說明。範本區域使用 `#structure-schedule`；總覽使用 `#line-dashboard`，截圖尺寸上限 1440×1200。圖片與程式一併由 `--screenshots` 更新。

## 統一告警與時段預覽

- `public/alerts.js` 是純計算：接收已組好的來源站 series、有效生產 windows、現在時間、門檻及產能基準；回傳 severity 與 translation key/params，不操作 DOM。NULL 與 0、連續回報 cutoff、休息排除及 STALE 都集中在此。
- `public/alert-display.js` 管理原因翻譯、每組線體的五秒輪播及 DOM 更新。輪播狀態只因原因識別／嚴重度改變而重設，不隨每秒的實際數字重設；總燈號與輪播無關。
- `monitoring.unified` 儲存三項門檻，`monitoring.capacity[productionKey(unit)]` 儲存標準 UPH／可選截止時間。沿用設定版本檢查、SQLite 原子保存、既有產量來源與多語言字典。重新命名產線／Model 會遷移產能鍵，移除配對時清除不用的基準。
- `public/schedule-preview.js` 只顯示既有班表的視覺化與目標分配，不建立另一份排程；伺服器 `schedule-config.mjs` 仍是儲存驗證的權威。時間軸 SVG 使用屬性而非行內 style，符合既有 CSP。
- `tests/alerts.test.mjs` 覆蓋門檻邊界、未填與 0、連續回報缺口、截止、休息、無基準、三語與輪播。API 測試驗證非法設定不寫入與重啟後保存；Chromium 實際驗證設定及不同告警狀態。
