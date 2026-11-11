# BP PULSE — BP9 Production Center

以 Node.js 24.11+、原生 JavaScript／CSS 與 SQLite 建立的生產填報及監控系統。支援中文、英文、泰文及五種顏色主題，前後端共用生產時段、目標與告警規則。

## 多廠區與權限（Phase 1）

已支援 System Admin、Site Admin、User 與廠區資料隔離。既有 `manager` 管理員是預設 System Admin，其他舊帳號只取得原廠區權限；自訂管理員可於首次升級前設 `BP_SYSTEM_ADMIN_USERNAME`。新廠區由管理介面建立，不需另一套服務。

**升級前先停止舊版 worker 並備份。** 首次新版本啟動會先做 SQLite 一致性備份，再執行有驗證、可回滾的 Migration。不要只退回舊程式而保留多廠區資料庫。操作、資料表、API、備份／回復與限制見 [多廠區交付與部署指南](./docs/MULTI_SITE.md)。

登入後由「目前廠區」切換。新使用者預設唯讀，填報／匯入／匯出須授權；所有驗證均在後端執行。登入帳號與現場人員名冊分開管理。

## 第一次接手，先看什麼？

1. 先依下面的「啟動」把網站開起來，實際走過 **設定 → 生產填報 → 生產總覽**。
2. 閱讀 [使用教學](./docs/USER_GUIDE.md)，理解班表、Target／Actual、來源站、告警與歷史資料。
3. 閱讀 [程式維護導覽](./docs/CODE_GUIDE.md)，依正在修改的功能找模組；不用先從頭讀完 `app.js`。
4. 執行 `npm ci`、`npm run check`，建立修改前的基準；畫面或操作變更再執行瀏覽器測試。

## 啟動

需要 **Node.js 24.11 或更新版本**。

```sh
npm start
```

開啟 <http://localhost:43871/>。Windows 也可雙擊 [start.cmd](./start.cmd)；它會呼叫 [start.ps1](./start.ps1)，優先使用本機或 `.runtime/` 的 Node.js，必要時下載官方可攜版本。

服務沒有第三方執行期依賴；`npm ci` 安裝的是開發檢查工具。全新資料庫由 `data/template.json` 初始化預設廠區；後續新廠區使用獨立空白清單與通用班表，不複製別廠人員或生產資料。

| 環境變數                             | 用途                                                           |
| ------------------------------------ | -------------------------------------------------------------- |
| `PORT`                               | 服務 Port，預設 `43871`                                        |
| `DB_PATH`                            | SQLite 路徑，預設 `data/production.sqlite`                     |
| `BP_MANAGER_PASSWORD`                | 全新資料庫的 manager 初始密碼，預設 `manager`                  |
| `BP_SYSTEM_ADMIN_USERNAME`           | 首次遷移指定既有管理員為唯一 bootstrap System Admin            |
| `BP_COOKIE_SECURE`／`BP_TRUST_PROXY` | 正式 TLS／可信任反向代理的 Cookie 及 Origin 設定，詳見部署指南 |
| `BP_MEMBER_PASSWORD`                 | 全新資料庫的 member 初始密碼，預設 `member`                    |

預設 manager 可管理廠區及帳號；member 保留預設廠區的原填報能力。新帳號依廠區角色與勾選功能授權。帳密雜湊保存在資料庫，重啟不會重設。環境變數由啟動命令或部署環境提供，專案不會自動讀取 `.env`。

## 文件各自做什麼？

| 文件                                        | 何時閱讀                                            |
| ------------------------------------------- | --------------------------------------------------- |
| [USER_GUIDE.md](./docs/USER_GUIDE.md)       | 一般操作入口：設定流程、填報、總覽、告警與時段      |
| [USER_GUIDE.en.md](./docs/USER_GUIDE.en.md) | 對應的英文操作說明                                  |
| [MANAGER_GUIDE.md](./docs/MANAGER_GUIDE.md) | 管理員設定、人員、配置與班表操作                    |
| [MEMBER_GUIDE.md](./docs/MEMBER_GUIDE.md)   | 填報、貼上、異常、匯入與儲存衝突                    |
| [MULTI_SITE.md](./docs/MULTI_SITE.md)       | 多廠區操作、RBAC、API／資料表、Migration 與部署回復 |
| [CODE_GUIDE.md](./docs/CODE_GUIDE.md)       | 工程師入口：模組責任、資料流程、相容限制與寫法      |
| [VALIDATION.md](./docs/VALIDATION.md)       | 各版本實際檢查結果；由上往下是新到舊，不是操作教學  |

網站內的 `/guide` 由 `public/help.js` 依帳號角色與語言顯示精簡教學；它不是直接讀取 Markdown。功能修改時應同步維護兩者。`docs/images/` 是實際瀏覽器操作截圖；`docs/examples/production-import-template.xlsx` 是 DEMO 格式範例，實際填報請下載網站依目前設定產生的範本。

## 程式與資料放哪裡？

| 路徑                                                                 | 用途                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `site-migration.mjs`、`site-access.mjs`、`site-management.mjs`       | 廠區遷移、請求範圍、後端 RBAC 與廠區／使用者管理                        |
| `server.mjs`、`auth.mjs`                                             | HTTP、SQLite、登入、權限、交易、版本檢查與稽核                          |
| 根目錄其他 `.mjs`                                                    | 預設目標、班表驗證、批次填報、匯入與 Excel／CSV 編解碼                  |
| `public/app.js`、`public/pages.js`                                   | 前端組裝、頁面路由、載入資料及事件協調                                  |
| `public/entry.js`                                                    | 填報、儲存佇列、矩形貼上、批次與匯入操作                                |
| `public/monitor*.js`、`public/dashboard.js`、`public/line-detail.js` | 總覽、數字呈現、圖表、分頁動畫與明細                                    |
| `public/alerts.js`、`public/alert-display.js`                        | 告警計算與多語言原因／燈號顯示                                          |
| `public/*-settings.js`、`public/site-management.js`、其他共用 `.js`  | 設定 UI、班表／目標／機種識別、排序與多選                               |
| `public/*.css`、`public/index.html`                                  | 共用頁殼、主題、版面與功能區樣式；`design-system.css` 最後載入          |
| `public/i18n.js`、`public/help.js`                                   | 中英泰翻譯及站內教學                                                    |
| `public/*.svg`                                                       | 品牌及網站圖示                                                          |
| `data/template.json`                                                 | 新資料庫初始化需要的原始設定；服務啟動仍會讀取，必須保留                |
| `temp.xlsx`                                                          | 原始 Excel 解析回歸測試樣本；不是可隨意刪除的暫存檔，服務啟動不直接讀它 |
| `tests/`                                                             | `npm test` 自動發現 `*.test.mjs`；`test-auth.mjs` 是共用測試輔助        |
| `scripts/`                                                           | 真實瀏覽器驗證與程式／Git 檢查；各 audit 由 browser-smoke 組合執行      |

目前與歷史生產資料存於 SQLite，不在 Excel 或 Git 裡。備份 SQLite 前應停止服務或使用一致性備份工具，避免只複製主檔而漏掉 WAL。

## Coding Style 與驗證

```sh
npm ci
npm run check
```

`npm run check` 依序執行 Git 檔案檢查、ESLint、Prettier、JavaScript 語法檢查及現有自動測試。工具版本由 `package-lock.json` 固定。

| 指令                                           | 用途                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `npm run lint`                                 | 未使用變數、未宣告識別字、不可達程式、重複參數／鍵值及固定條件 |
| `npm run format:check`                         | 檢查原始碼與 README 格式                                       |
| `npm run format`                               | 套用共用格式；不重排 seed 資料、操作文件或截圖                 |
| `npm run syntax:check`                         | 解析 JavaScript，不執行或啟動服務                              |
| `npm run repository:check`                     | 檢查 Git 索引未混入本機產物，並驗證忽略規則                    |
| `npm test`                                     | 使用獨立測試資料庫的功能與 API 測試                            |
| `npm run db:backup`／`db:verify`／`db:restore` | SQLite 一致性備份、驗證與明確停機回復；操作前讀部署指南        |
| `npm run test:browser`                         | 實際 Chromium 操作回歸，使用臨時資料庫與 Port                  |

瀏覽器測試另需 Chrome／Edge 及測試工具；它們不屬於服務依賴：

```sh
npm install --no-save --prefix .runtime/browser-audit playwright-core@1.56.1
npm run test:browser
```

Linux 可用 `BP_BROWSER_PATH=/usr/bin/chromium npm run test:browser` 指定瀏覽器；Windows 腳本會搜尋 Chrome／Edge。重拍教學截圖使用 `npm run test:browser -- --screenshots`。目前沒有 TypeScript 或編譯／打包流程，因此沒有 Type Check／Build 指令。

## 哪些應提交 Git？

**應提交：**原始碼、測試、啟動器、工具設定、`package.json`／`package-lock.json`、現行文件與必要教學圖片、初始化 JSON 及測試／DEMO Excel。

**不提交：**`.env`、生產資料庫及 WAL／SHM、備份與匯出、`.runtime/`、`node_modules/`、log、測試輸出、OS／編輯器／Excel 暫存檔。`.env.example` 類樣本可以提交，但只能放範例值。Git 忽略規則不會自動移除已追蹤檔案，因此另用 `repository:check` 檢查索引。

一次性邀請郵件及指定日期的舊模擬指南已移除；需要查當時內容可從 Git 歷史取得。現行測試、來源範本與歷史資料相容程式仍有用途，不能因檔名像舊檔或沒有直接 import 就刪除。
