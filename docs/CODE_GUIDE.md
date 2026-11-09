# 程式維護導覽

## 模組責任

| 模組 | 責任 |
| --- | --- |
| `server.mjs`、`auth.mjs` | HTTP 路由、權限、SQLite 儲存、版本檢查與稽核 |
| `production-defaults.mjs`、`public/production-targets.js` | 伺服器預設、人員快照與兩班日目標分配 |
| `public/production-models.js` | Line／Model 識別、站點順序與人員名稱解析 |
| `public/entry.js` | 填報控制器、各站儲存佇列、矩形貼上、批次草稿與匯入操作 |
| `production-import.mjs`、`spreadsheet.mjs` | Excel／CSV 編解碼、預覽驗證及匯入 |
| `public/app.js` | 頁面切換、資料載入、範圍篩選與共用確認視窗 |
| `public/monitor.js`、`public/dashboard.js`、`public/line-detail.js` | 來源站計量、看板圖表與全螢幕明細 |
| `public/*-settings.js`、`public/issue-presets.js` | 設定草稿、資料清單與英文異常快捷文字 |
| `public/i18n.js`、`public/help.js` | 共用翻譯與依角色顯示的教學 |

## 修改時保留的行為

- 填報儲存鍵包含日期、班別、站點。切換畫面不能改變已排入佇列的寫入目的。
- 各站獨立儲存，使用伺服器版本檢查；批次時段與 Excel 匯入使用整批驗證，遇到衝突保留草稿供使用者處理。
- 全天報表是兩班的唯讀合併結果，不能把合併版本當作任一班的寫入版本。
- 「恢復預設」使用伺服器提供的時段 Target，清空所選日期及 Line／Model 兩班的 Actual／Issue，須由使用者確認。人員快照與日目標設定不變。
- 批次「恢復預設目標」只修改目前時段草稿的 Target，並清空尚未套用的共用 Target，避免儲存時再次覆蓋預設；Actual／Issue 草稿保留。
- 缺值 `null` 與明確的 `0` 不同。Excel 空白保留舊值，畫面明確套用空白則清除該欄。
- Excel 的欄位、標題及欄寬集中在 `production-import.mjs` 的 `templateColumns`；範本與預覽共用產線／Model、站點、班別排序。歷史時段依保存的順序，不能直接用時鐘字串排序。匯入依表頭名稱解析，因此新舊欄位排列皆可使用。
- `spreadsheet.mjs` 的寫入器接受欄寬、填寫欄索引與固定欄數；篩選範圍依實際欄數產生。文字保持文字，不把使用者內容轉成公式。整批匯入仍由伺服器驗證及版本檢查。
- 歷史快照、舊資料轉換及已刪站點識別仍用於讀取既有報表，不能僅因目前設定沒有該站而移除相關邏輯。

## 寫法與驗證

分組趨勢的座標寬度由實際容器量測。`trendSvg` 依每個 `HH:MM` 標籤至少 48px 的間距決定最小寬度；時段多時由圖表容器捲動，不能讓 SVG 壓縮所有時間標籤。迷你圖不顯示時間軸，維持精簡尺寸。分組趨勢的 ResizeObserver 同時處理普通與全螢幕，刷新需保留圖表捲動位置。

圖表使用 SVG `width` 屬性及共用 CSS 的最小寬度，不能在產生的 HTML 內加入 `style` 屬性；頁面的 CSP 不接受行內樣式。瀏覽器驗證須量測實際文字邊界，僅測 SVG 字串的座標不足以發現文字被縮小的問題。

函式名稱描述使用者操作或資料轉換；DOM 的 `data-*` 操作名稱、事件分派及測試選擇器須同步。翻譯字典維持三語對應。註解說明日期／版本／歷史相容等限制及原因，避免逐行重述程式。

移除函式、匯出、翻譯或樣式前，搜尋呼叫處、動態鍵值、HTML 產生器及測試。通用輔助函式只有在多處需要同一語意時才抽出。

共用版面集中在 `public/style.css`，主題透過既有 `--primary`、`--soft`、`--tint` 等變數傳遞，不另建立按主題分岔的版面。`public/delta-logo.svg` 為依提供畫面重繪的本地向量識別，以 SVG view 分別顯示圖標及字標，可在此集中替換品牌標準素材；品牌藍不隨主題改色。教學截圖說明改以圖片名稱作鍵，避免增刪圖片時錯配另一張圖的文字。

執行 `npm test`，以及 `BP_BROWSER_PATH=/usr/bin/chromium node scripts/browser-smoke.mjs --screenshots`。瀏覽器測試使用隔離資料庫；`--screenshots` 更新教學圖。瀏覽器路徑可依本機安裝調整，Playwright 設定見腳本開頭。

本次另用 ESLint 檢查前端、伺服器、測試及腳本的未使用變數、不可達程式、重複參數／鍵值與固定條件。這些檢查輔助清理，功能是否必要仍須依呼叫流程與歷史資料用途判斷。
