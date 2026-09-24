# 瘋菓內部管理系統：Google 試算表版

純靜態網頁，可以直接放在 **GitHub Pages**。不需要自己架後端，資料全部存在一份 Google 試算表。

```
瀏覽器（WEB_GS 靜態網頁）
   │  POST（text/plain JSON）
   ▼
Google Apps Script（gas/Code.gs，綁在試算表上）
   │
   ▼
Google 試算表（每張資料表 = 一個工作表）
```

- 登入、權限、每一筆資料的讀寫都經過 Apps Script 檢查。試算表本身不需要公開分享。
- 工作表或欄位不存在時，Apps Script 會自動建立。

---

## 一、部署步驟（約 10 分鐘）

### 1. 建立試算表與 Apps Script

1. 到 Google 雲端硬碟，新增一份空白的 **Google 試算表**，例如命名為「瘋菓資料庫」。
2. 在試算表上方選單點「**擴充功能 → Apps Script**」。
3. 刪掉編輯器裡預設的程式碼，把 `gas/Code.gs` 的內容整份貼上，然後按儲存。
4. 左側點「**專案設定（齒輪）**」，勾選「在編輯器中顯示 appsscript.json 資訊清單檔案」。回到編輯器，把 `gas/appsscript.json` 的內容貼到 `appsscript.json`，這樣時區會是 Asia/Taipei。

### 2. 初始化資料表

1. 在編輯器上方的函式下拉選單選擇 **`setup`**，按「執行」。
2. 第一次執行會要求授權，依序按「審查權限 → 選擇帳號 → 進階 → 前往（不安全）→ 允許」。
3. 回到試算表，會看到 `Users`、`Products`、`Orders` 等工作表都已建立，角色與權限也已經有預設資料。

### 3. 部署成網頁應用程式

1. 右上角點「**部署 → 新增部署作業**」，類型選「**網頁應用程式**」。
2. 「執行身分」選 **我**，「誰可以存取」選 **所有人**。
3. 按「部署」，複製畫面上的「**網頁應用程式網址**」（結尾是 `/exec`）。

> 「所有人」只代表網址可以被呼叫。除了登入和註冊，其他操作都要先登入取得 token，而且會依帳號權限檢查。

### 4. 放上 GitHub Pages

1. 在 GitHub 建立一個新的 repository，例如 `fonegle-erp`。
2. 把本資料夾的所有檔案推上去（`index.html` 要在 repository 最外層）：

   ```bash
   git remote add origin https://github.com/你的帳號/fonegle-erp.git
   git push -u origin main
   ```

3. 到 repository 的「**Settings → Pages**」，Source 選「**Deploy from a branch**」，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
4. 等一到兩分鐘，網站會出現在 `https://你的帳號.github.io/fonegle-erp/`。

> 也可以放在任何靜態主機（原本的 IIS、Netlify、Cloudflare Pages），網站會自動判斷所在路徑。

### 5. 設定試算表連線

把第 3 步複製的 `/exec` 網址寫進 `js/settings.js`，再推上 GitHub：

```js
GAS_URL: "https://script.google.com/macros/s/AKfycb.../exec",
```

- 一般使用者看不到任何連線設定。網址沒設定時，登入頁只會提示「請聯絡系統管理員」。
- 管理員（權限 3 或 13）可以在「**系統權限資料管理 → 資料庫連線設定**」測試連線，或讓自己的瀏覽器暫時改用其他網址（例如測試新版部署）。這個設定只影響該台電腦的瀏覽器，隨時可以「改回預設網址」。

> Apps Script 網址本來就會出現在瀏覽器的網路請求中，寫在公開的 repository 裡沒有額外風險。資料的保護靠的是登入與權限檢查。

### 6. 建立第一個帳號

在登入頁按「建立帳號」。**第一位註冊的使用者會自動成為系統管理員**，擁有所有權限。
其他人註冊後預設沒有權限，由管理員到「系統權限資料管理」或「員工及會員管理」設定。

### 7. （選用）啟用 AI 助理

1. 到 [Google AI Studio](https://aistudio.google.com/apikey) 申請 Gemini API Key。
2. Apps Script →「專案設定 → 指令碼屬性」，新增：
   - `GEMINI_API_KEY`：你的金鑰
   - `GEMINI_MODEL`（可省略）：預設為 `gemini-2.5-flash`

---

## 二、更新 Apps Script 程式後

修改 `Code.gs` 後，要到「**部署 → 管理部署作業 → 編輯（鉛筆）→ 版本：新版本 → 部署**」。
這樣網址不會變，不需要重新設定連線。

網頁程式修改後，推上 GitHub 即可，GitHub Pages 會自動更新。

---

## 三、系統功能（一人公司也能完整運作）

| 模組 | 頁面 | 重點 |
|---|---|---|
| 🏠 首頁 | 首頁 | 今天起 14 天的**行事曆提醒**（含每日時段）、**備忘錄**（到期提醒、可共享）、待收款提醒、本月收支、我的最愛 |
| 📅 行事曆 | 行事曆 | 多日活動，每天各自設定開始／結束時間與當日備註；公開／私人活動；活動總覽可複製成文字 |
| 🎪 市集營運 | 現場點餐、市集報表、出攤紀錄、報名連結、品牌資訊 | 點餐**直接寫入雲端**，手機電腦同步；出攤紀錄自動算營業額、手續費、食材成本、盈虧與目標達成率 |
| 📦 商品與生產 | 產品、**配方與成本試算**、原料、庫存、生產履歷 | 配方從原料帶入成本，算出單位成本、毛利率、建議售價，並可依預計產量算原料需求 |
| 🛒 銷售與客戶 | 訂單、出貨、合作廠商／店家 | 訂單可多品項 |
| 💰 財務 | **帳務管理（應收）**、**支出表**、品牌攤提表 | 各店家應收／已收／未收／逾期一目了然；支出依分類統計；投資攤提與回本進度 |
| ✨ AI 行銷 | **AI 文案發想** | 自行輸入大綱或選行事曆活動，產生預告、當日、感謝、新品貼文，或出攤日誌、行前須知；可存文案庫 |
| 🛠️ 系統 | 帳號、員工及會員、權限管理、郵件寄送 | 角色範本一鍵套用權限 |

所有資料都存在 Google 試算表，**沒有單機資料**。右下角的 AI 助理，對話紀錄也存在試算表。
現場點餐只有在市集斷網時會暫存「待上傳」，畫面會提醒，恢復網路後自動補傳。

---

## 四、權限規劃（多人使用）

權限以「**模組**」授權。畫面和伺服器（Apps Script）兩邊都會檢查，就算有人直接呼叫網址也無法越權。

| 代碼 | 名稱 | 可使用 |
|---|---|---|
| 13 | 最高系統管理員 | 全部功能（老闆） |
| 3 | 系統管理 | 員工及會員、權限管理、郵件寄送 |
| 20 | 行事曆 | 行事曆（查看、新增、修改） |
| 21 | 市集營運 | 現場點餐、市集報表、出攤紀錄、報名連結 |
| 22 | 商品與生產 | 產品、配方與成本、原料、庫存、生產履歷 |
| 23 | 銷售與客戶 | 訂單、出貨、合作廠商 |
| 24 | 財務 | 帳務、支出、品牌攤提、首頁收支；可查看出攤與訂單 |
| 25 | AI 行銷 | AI 文案發想 |
| 12 | 刪除資料 | 刪除任何資料都需要這個權限（個人的備忘錄、AI 文案除外） |
| 16 | 唯讀 | 只能查看，不能新增、修改、刪除 |

- 每個人登入後都能用首頁、備忘錄、帳號設定和 AI 助理。
- **備忘錄與 AI 文案是個人的**，只有本人看得到；勾選「共享」後，同事才看得到。
- 舊版代碼相容：10（基本功能）＝行事曆＋市集營運；11＝行事曆；6、8、9＝代理人。
- 在「權限管理 → 權限批次修改」可以用**角色範本**一鍵套用：老闆、店長／營運、市集人員、生產人員、會計、行銷、唯讀。
- 要調整哪些權限可以做什麼，改 `gas/Code.gs` 的 `TABLE_PERMS`（資料權限）和 `js/config.js` 的 `Permission`（選單顯示）。

---

## 五、試算表格式（方便擴充與修改）

執行 `setup` 後，試算表會自動整理成：

- **📖 資料字典**分頁排在第一個，列出每張表、每個欄位的中文名稱、型別，以及哪個欄位是主鍵。
- 分頁依模組排序並上色：系統灰、行事曆藍、市集橘、商品綠、銷售紫、財務紅、AI 粉、代理人青。
- 每個表頭都有中文註解，滑鼠移過去就看得到；第一列凍結；金額欄位顯示千分位。
- 第一列是英文欄位名稱（程式使用），**請不要修改**。

**擴充方式：**
1. **只是要多記一個欄位**：直接在該分頁最右邊加一欄，第一列填英文名稱，例如 `Supplier2`。網頁讀取時就會帶出這個欄位，不用改程式。
2. **要讓網頁表單能輸入、或要指定為數字／是否型別**：在 `gas/Code.gs` 的 `SCHEMA` 加上欄位（`名稱:n` 為數字，`名稱:b` 為是否），在 `COLUMN_LABELS` 加上中文名稱，再重新執行 `setup`。
3. **新增一整張表**：在 `SCHEMA`、`TABLE_INFO`、`TABLE_PERMS` 各加一行，執行 `setup` 就會自動建立。

| 工作表 | 用途 | 主鍵 |
|---|---|---|
| Users | 員工與會員帳號（密碼為雜湊，不會回傳給網頁） | LineUserId |
| ID_UserRoles / ID_Permission | 角色、權限代碼 | ID |
| Memos | 備忘錄（個人） | ID |
| Sessions / MailLog | 登入紀錄、寄信紀錄（系統自動維護） | Token / ID |
| Calendar / CalendarDays | 行事曆活動、每日時段 | CalendarId / DayId |
| MarketOrders | 現場點餐 | OrderKey |
| StallRecords | 出攤紀錄 | ID |
| CrawlerSources | 市集報名連結 | ID |
| Products / ID_Category | 產品、產品分類 | ID |
| Material | 原料（成本價供配方試算使用） | ID |
| Formula / FormulaDetail | 配方與成本、配方原料明細 | FormulaID / FormulaDetailID |
| Inventory / ProductionLog | 進貨庫存、生產履歷 | InventoryID / ProductionID |
| Companies | 合作廠商／店家 | ID |
| Orders / Shipment | 訂單（一列一品項）、出貨 | OrderID / ShipmentID |
| Receivable | 帳務（應收帳款） | ReceivableID |
| Expenses | 支出 | ID |
| BrandCosts | 品牌攤提 | ID |
| AiDrafts / AiChats | AI 文案庫、AI 助理對話紀錄（個人） | ID |
| AgentConfig / ID_AgentTool / AgentToolPermissions | 代理人 | Id |

- **產品分類**沒有管理畫面，請直接在 `ID_Category` 分頁新增，`IsActive` 填 `TRUE`。
- 布林欄位填 `TRUE` / `FALSE`。

---

## 六、從舊 SQL Server 匯入資料

專案外的 `試算表匯入` 資料夾有轉換工具，會唯讀讀取本機 SQL Server（FonegleData）。有兩種匯入方式，擇一即可：

**方式 A：在 Apps Script 執行（不需部署）**
1. 執行 `python build_xlsx.py` 產生 `ImportData.gs`。
2. 在 Apps Script 新增 `ImportData` 檔，貼上內容，執行 `importAll`，完成後刪除該檔。

**方式 B：一次性金鑰遠端寫入**
1. Apps Script 執行 `openImportWindow`，取得 30 分鐘內有效的金鑰。金鑰只能用一次。
2. 執行 `python build_xlsx.py`，再執行 `python push_import.py 金鑰`。

兩種方式都只會覆蓋舊系統有的 20 張表。新系統的資料（支出、備忘錄、AI 文案、出攤紀錄、品牌攤提、現場點餐）不會被動到。
密碼雜湊與舊系統相同，**舊帳號匯入後可以用原密碼登入**。舊行事曆會依起訖時間自動拆成每日時段。
匯入檔內含會員個資，**不要上傳到 GitHub**。

---

## 七、使用限制

- Apps Script 每次請求約 0.5～2 秒。頁面已盡量把多次讀取合併成一次。
- 一般 Gmail 帳號每天可寄約 100 封信，Google Workspace 帳號約 1500 封。
- 單張工作表建議在數萬列以內。資料量很大時，請定期把舊資料搬到另一份試算表封存。
- 公開的 GitHub repository 任何人都看得到原始碼，包含「品牌資訊」頁上的聯絡資料。不想公開請設為 Private；免費帳號的 Private repository 無法使用 GitHub Pages，可改用 Netlify 或 Cloudflare Pages。
- 已移除 LINE 專屬功能（LINE Bot、綁定 LINE、真人模式等）。代理人（OpenClaw）設定頁可以管理資料，但代理人本身的執行需要另外的伺服器。

---

## 八、檔案結構

```
index.html                入口（自動導向首頁）
login.html                登入／註冊／忘記密碼
home.html                 首頁（行事曆提醒、備忘錄、待收款、本月收支）

page/                     功能頁面（程式在 js/pages/ 同名 .js）
  calendar.html           行事曆
  market-order.html       現場點餐          market-report.html  市集報表
  stall.html              出攤紀錄          market-link.html    市集報名連結
  brand.html              品牌資訊
  product.html            產品              formula.html        配方與成本試算
  material.html           原料              inventory.html      庫存盤點
  production.html         生產履歷
  order.html              訂單              shipment.html       出貨
  company.html            合作廠商／店家
  receivable.html         帳務管理（應收）  expense.html        支出表
  amortization.html       品牌攤提表
  ai-writer.html          AI 文案發想
  account.html            帳號設定          member.html         員工及會員
  permission.html         權限管理（含角色範本、資料庫連線設定）
  mail.html               郵件寄送          agent.html          代理人

js/
  settings.js             連線設定（GAS_URL）
  auth.js                 登入、Session、權限判斷、與 Apps Script 連線
  api.js                  資料存取（list / insert / update / remove / batch）
  config.js               左側選單與頁面權限
  core.js / layout.js     共用工具、頁首選單頁尾
  favorite.js             我的最愛
  ai-chat.js              AI 助理（對話紀錄存試算表）
  pages/                  各頁面程式；market-store.js 為市集點餐的雲端存取

gas/Code.gs               Google Apps Script 後端（資料表、權限、資料字典、AI）
gas/appsscript.json       Apps Script 設定（時區等）
```
