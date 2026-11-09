# BP PULSE — BP9 Production Center

Node.js 24.11+、原生 JavaScript/CSS 與 SQLite 的產線管理及填報系統。

## 啟動

Windows 雙擊 [start.cmd](./start.cmd)，或執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

開啟 <http://localhost:43871/>。預設使用較少使用的 **43871**，也可透過環境變數 PORT 覆寫；啟動訊息會顯示實際位址。區網電腦使用伺服器 IP 與相同 Port。

啟動器優先使用 [.runtime/](./.runtime/) 的可攜 Node.js，找不到符合版本的執行環境時會下載官方 Node.js 24.11.0。已有 Node.js 可執行 npm start。

## 帳號與操作指南

| 帳號    | 初始密碼 | 功能                                 | 詳細教學                                  |
| ------- | -------- | ------------------------------------ | ----------------------------------------- |
| manager | manager  | 設定、人員配置、填報與查詢           | [管理員圖文教學](./docs/MANAGER_GUIDE.md) |
| member  | member   | 產線實績、當日目標、異常、匯入及查詢 | [填報員圖文教學](./docs/MEMBER_GUIDE.md)  |

也可直接在左側「User guide」查看目前帳號的教學；管理設定內容只會顯示給管理員。介面支援中文、英文、泰文，所有語言下拉選項統一標示 **Chinese / English / Thai**。新瀏覽器預設英文。

全新資料庫的初始密碼可用 BP_MANAGER_PASSWORD、BP_MEMBER_PASSWORD 覆寫。帳號與密碼雜湊保存在資料庫，重新啟動不會重設帳密。

## 設定與填報流程

1. 基礎資料與班別時間：產線、Model、職務、站點，下拉新增各線 Model 配對，設定兩班生產／休息時段。
2. 產線日目標：每組產線＋Model 一個預設值，依生產分鐘分配兩班時段，各站沿用相同目標。
3. 依職務建立人員：可選職務篩選名冊。
4. 產線人員分配：獨立頁選各線兩班 5-Tigers 及 OWNER；選職務後可勾選多人，一次新增，同職務可多人。
5. 產線配置：下拉選既有 Line／Model，同表新增、編輯及啟用職務／站點，自動帶入人員；同區選產量來源站。
6. 分組；7. 警示及刷新；8. 語言與外觀。

日目標只需要產線與有效時間，可在尚無人員或啟用站點時先儲存。配置不等待所有人員分配完成；完成標記僅提示進度。上方及底部 Save settings 發布共享設定；Save draft 只保留在目前瀏覽器及帳號。

人員分配的職務選單直接沿用完整基礎清單，空職務也可選。尚無人員或全數停用時，可從提示直接開啟該職務名冊；建立／啟用後回分配頁即可勾選。產線與 Model 分成主／次標題，長名稱換行，手機日目標表保留各欄標籤。

填報直接列出每站，不需站點篩選；每站、每時段獨立填 Target／Actual／Issue。預設目標依產線／Model 日目標及兩班生產分鐘分配，排除休息。修改時段目標只重算該站當日合計，不改其他站、其他日期或預設。支援整日、單班、單時段、鍵盤操作、數字矩形貼上及離格自動儲存；矩形每列對應下一站，相鄰 Target／Actual 欄留在同一時段，後續欄位對再對應下一時段。單欄資料才依上下列交錯 Target／Actual，超過剩餘容量的值直接忽略。

XLSX／CSV 依站點識別預覽後整批匯入，允許各站不同值；空格保留原值，0 寫入零。多站時只給產線／Model 會拒絕，避免猜站。任一版本衝突會整批回滾。新站實績預設空白，不會複製別站實績。

看板使用該組所選來源站，不加總產品經過的所有站。缺少配置時仍可選 Line／Model 並看目標預覽；manager 可直接前往該組配置，新增啟用站點並儲存再填。配置只列目前配對，不再推薦舊 Model。取消 Active 保留列供再啟用；Delete 從目前配置刪除，Save settings 後重整也不回來。重新新增使用新 ID，不帶回舊數值；歷史姓名、時段與填報保留。

填報採精簡表格：左欄只顯示職務／站點，Target、Actual 並排，早晚班與整日目標／實績合計固定在左側職務／站點旁。異常只佔一行摘要，點開或 F2 編輯，支援快捷原因、多行、清除與自動儲存；關閉不撐高表格。人員與 OWNER 仍自動保存並於明細查看。Excel 與班別切換放在同一工具列，可下載及匯入整日雙班或單班範本，皆含 Target、Actual、Issue。

產線配置可拖曳職務旁把手或用上下按鈕排序，儲存後填報、站點明細與匯出沿用同組 Line／Model 的順序，來源站不變。工具列最左的「同時段批次填寫」可選日期、產線、機種與時段，分別套用 Target／Actual／Issue，再逐站修改與矩形貼上；空白套用會清除該欄，0 寫入零，也可將該時段 Target 恢復為日目標配置。填報 Reset 經確認後恢復所選日期與產線／Model 兩班所有站點的預設 Target，並清除 Actual 與異常。異常快捷文字在基礎資料建立單一英文清單。

生產總覽與生產細節皆可切換全天／早班／晚班，總覽預設全天；全天目標、實績與差異合併兩班。全螢幕明細頂部沿用目前主題配色，集中產線、機種、負責人與三項數字；各站人員分早班、晚班標示，每小時產量圖使用完整彈窗寬度。

## 資料與維護

資料庫預設為 [data/production.sqlite](./data/production.sqlite)，可用 DB_PATH 覆寫。[temp.xlsx](./temp.xlsx) 與 [data/template.json](./data/template.json) 用於初始樣板；實際填報保存在 SQLite。資料庫與試算表中的識別碼是必要的歷史關聯。

SQLite 使用 WAL、版本檢查、交易與稽核紀錄，支援多使用者同時填報。同一版本的衝突會顯示給使用者，匯入任一列衝突會整批回滾。備份可用 SQLite 備份工具；直接複製資料夾前應停止服務，避免漏掉 WAL 中尚未合併的資料。

## 驗證

```powershell
.\.runtime\node.exe --test tests/*.test.mjs
```

另提供 [真實瀏覽器驗證](./scripts/browser-smoke.mjs)，會建立臨時資料庫與獨立 Port，完成後清除。需要本機 Chrome／Edge 與測試工具 playwright-core：

```powershell
npm install --no-save --prefix .runtime/browser-audit playwright-core@1.56.1
.\.runtime\node.exe scripts/browser-smoke.mjs
```

加 --screenshots 會更新教學中的示範截圖。詳見 [測試紀錄](./docs/VALIDATION.md) 與 [English guide](./docs/USER_GUIDE.en.md)。

## Production models

### Page routes and API boundary

The browser and HTTP server share the route catalog in [public/pages.js](./public/pages.js). `/overview`, `/details`, `/entry`, `/guide` and the eight `/settings/...` pages support direct requests and browser history. Unknown paths remain 404; assets use absolute paths. The server currently serves the app shell for known pages, and each page loads data through the authenticated `/api/...` endpoints. This prepares stable page addresses and API contracts for later backend rendering or external production integration; automatic collection is not connected yet.

Station mappings support optional `hasOutput` (default `true` for existing data). A false value keeps enabled stations visible with read-only history, prevents production writes and excludes them from batch fill and Excel templates. Current configuration governs editability without rewriting saved snapshots. The batch dialog edits the production date, line/model and interval, saving the original scope before switching. Apply and Save stay open; closing saves and returns entry to the destination. Display-only model formatting splits the first hyphen and never changes IDs or import values.

Settings now use enabled `productionUnits` (`line`, `model`, `dailyTarget`, `staffing`) and a `models` catalog. Every active mapping references an enabled line/model. Station targets, actuals and issues are independent within each enabled line/model. Personnel defaults and imports respect both unit and station identities. Monitoring uses one selected output station per unit. Legacy settings migrate into `Default`; saved production snapshots remain unchanged. `lineTargets` and `lineStaffing` are compatibility views of Default for older clients.

Catalog renames cascade current settings. Removal previews its impact; deleting a job removes its people and assignments in one draft action. Removing a line/model clears its preset and staffing; historical report rows are never removed. The XLSX template includes Model, and ambiguous line-only imports are rejected.
