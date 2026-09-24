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

## 三、資料表對照

| 工作表 | 用途 | 主鍵 |
|---|---|---|
| Users | 員工／會員帳號（密碼為 SHA512 雜湊，不會回傳給網頁） | LineUserId |
| Sessions | 登入 token（系統內部使用） | Token |
| ID_UserRoles / ID_Permission | 角色、權限代碼 | ID |
| Products / ID_Category | 產品、產品分類 | ID |
| Material | 原料 | ID |
| Inventory | 進貨紀錄 | InventoryID |
| Orders | 訂單（一列 = 一個品項，同一張訂單共用 OrderNo） | OrderID |
| Shipment / Receivable / ProductionLog | 出貨、收帳、生產履歷 | 各自的 ID |
| Formula / FormulaDetail | 配方主檔、配方明細 | FormulaID / FormulaDetailID |
| Companies | 合作廠商 | ID |
| CrawlerSources | 市集報名連結 | ID |
| Calendar | 行事曆活動（UserDB_ID 空白 = 公開活動） | CalendarId |
| CalendarDays | 活動每一天的開始／結束時間與當日備註 | DayId |
| StallRecords | 出攤紀錄（費用、收款、食材%、目標、盈虧） | ID |
| BrandCosts | 品牌攤提表（支出／回收、攤提月數） | ID |
| AgentConfig / ID_AgentTool / AgentToolPermissions | 代理人設定 | Id |
| MarketOrders | 市集現場點餐 | OrderKey |
| MailLog | 寄信紀錄 | ID |

- **產品分類**沒有管理畫面，請直接在 `ID_Category` 工作表新增，`IsActive` 填 `TRUE`。
- 可以直接在試算表裡新增或修改資料，但**第一列欄位名稱不要改**，數字主鍵不要重複。
- 布林欄位填 `TRUE` / `FALSE`。

### 從舊 SQL Server 匯入資料

專案外的 `試算表匯入` 資料夾有轉換工具，會從本機 SQL Server（FonegleData）產生 `FonegleData_試算表匯入.xlsx`，欄位已經對應成新版格式。

1. 在新的 Google 試算表選「**檔案 → 匯入 → 上傳**」，選這個 xlsx，匯入位置選「**取代試算表**」。
2. 接著照「部署步驟」加入 Apps Script，並執行一次 `setup`（只會補上缺少的工作表，不會覆蓋匯入的資料）。

密碼雜湊演算法與舊系統相同（SHA512 + 相同 salt），**舊帳號匯入後可以用原密碼登入**。
這份 xlsx 含有會員個資與密碼雜湊，**不要上傳到 GitHub**。

---

## 四、權限對照

網頁選單的 `Permission`（`js/config.js`）決定能不能開頁面。
Apps Script 的 `WRITE_PERMS` / `READ_PERMS`（`gas/Code.gs` 上方）決定能不能讀寫資料。
兩邊預設相同，沿用原系統選單的設定。

權限代碼的名稱（`ID_Permission` 工作表）：1 FAE建立、2 業務單建立、3 權限修改、5 建立配方、6 個人代理人權限控制、8 代理人工具總開關建立、9 建立代理人、10 基本功能、11 建立更新行事曆、12 刪除資料、13 最高系統管理員、14 修改資料、15 建立資料。

| 權限代碼（任一即可） | 可修改的資料 |
|---|---|
| 3、13 | 帳號、會員、權限、合作廠商 |
| 3、6 | 產品、原料、庫存、訂單、出貨、收帳、生產、配方 |
| 10、11、13 | 行事曆（含每日時段） |
| 3、10、13 | 市集點餐、出攤紀錄、品牌攤提表 |
| 3、6、8、9、13 | 代理人設定 |
| 3 | 寄信 |

---

## 五、與舊版的差異

**保留的功能**：全部頁面的查詢、新增、修改、刪除，登入、註冊、忘記密碼、修改密碼、我的最愛、自動登出、頁面權限。

**改善與修正**

- 市集點餐（OrderNow）原本只存在瀏覽器，現在會寫進試算表 `MarketOrders`。斷網時先暫存在本機，恢復連線後自動補傳。舊版留在瀏覽器裡的訂單也會自動上傳。
- 生產履歷、出貨管理原本頁面初始化名稱錯誤，頁面不會運作，已修正。
- 寄信頁原本沒有載入程式，已修正。附件改由 Gmail 直接寄出。
- 市集報名連結原本「修改」時會把爬蟲狀態反轉，已修正。
- 配方、生產、收帳、出貨頁原本沒有「新增」按鈕，現在預設顯示新增表單，按「清除」會回到新增模式。
- 訂單日期原本用 UTC 時間，會差 8 小時，已改用本地時間。
- 帳號被取消「啟用」後無法登入。會員管理新增帳號時，預設會勾選「啟用」「會員」。
- 畫面顯示的資料一律做 HTML 跳脫，避免內容破壞頁面。

**已移除的 LINE 專屬功能**

新版不含 LINE Bot，所以以下 LINE 專用的介面已經拿掉：

- 帳號設定的「綁定 LINE」。
- 系統權限頁的「資料庫 AI 總開關」「解鎖真人模式」「LINE 自動回應」。
- 會員資料的「AI模式」「真人模式」「綁定ID」欄位。

代理人（OpenClaw）設定頁仍可管理資料，但代理人本身的執行需要另外的伺服器，新版不包含。網頁右下角的 AI 助理使用 Gemini。

**使用限制**

- Apps Script 每次請求約 0.5～2 秒，比原本的 API 慢。頁面已盡量把多次讀取合併成一次。
- 一般 Gmail 帳號每天可寄約 100 封信，Google Workspace 帳號約 1500 封。
- 單張工作表建議在數萬列以內。資料量很大時，請定期把舊資料搬到另一份試算表封存。
- 公開的 GitHub repository 任何人都看得到原始碼，包含「品牌資訊」頁上的聯絡電話、Email 等內容。如果不想公開，請把 repository 設為 Private。免費帳號的 Private repository 無法使用 GitHub Pages，需要 GitHub Pro，或改用 Netlify、Cloudflare Pages。

---

## 六、出攤紀錄與品牌攤提

**出攤紀錄**（市集活動專區 → 出攤紀錄）

- 可以從行事曆選活動，自動帶入名稱和地點；按「從現場點餐帶入當日收款」會加總當天的現金和電子支付收款。
- 營業額 = 現金收款 + 電子支付收款；手續費 = 電子支付收款 × 手續費率（也可以手動改）。
- 食材成本 = 營業額 × 食材 %。
- **盈虧 = 營業額 − 攤位費 − 車資 − 人手費用 − 其他費用 − 手續費 − 食材成本**。
- 會顯示低標、目標的達成率和每人產值；列表上方有出攤次數、總營業額、總成本、總盈虧、平均每場盈虧。

**品牌攤提表**（市集活動專區 → 品牌攤提表）

- 每筆記錄選「支出」或「回收」，分類有硬體、包材、食材、人力、其他。
- 支出可以填「攤提月數」，例如冰櫃 36,000 元分 12 個月攤提，每月就是 3,000 元；空白代表當月一次認列。
- 開啟「出攤盈虧計入回收」後，出攤紀錄的盈虧會算進已回收金額。
- 會顯示總投入、已回收、尚待回收、本月攤提和回本進度，以及分類彙總和前後一年的每月攤提表。

---

## 七、檔案結構

```
index.html                入口（自動導向首頁）
login.html                登入／註冊／忘記密碼
home.html                 首頁（我的最愛）

page/                     功能頁面（對應的程式在 js/pages/ 同名 .js）
  account.html            帳號設定（修改密碼、個人資料）
  member.html             員工及會員管理
  permission.html         系統權限資料管理（含管理員專用的資料庫連線設定）
  company.html            合作廠商資料管理
  product.html            產品管理
  material.html           原料管理
  inventory.html          庫存盤點／進貨紀錄
  formula.html            產品配方
  order.html              訂單管理
  shipment.html           出貨管理
  receivable.html         收帳紀錄
  production.html         生產履歷
  market-order.html       市集現場點餐
  market-report.html      市集報表
  market-link.html        市集報名連結
  stall.html              出攤紀錄（費用、收款、盈虧）
  amortization.html       品牌攤提表（投入、回收、回本進度）
  brand.html              品牌資訊
  calendar.html           行事曆
  agent.html              代理人（OpenClaw）設定
  mail.html               郵件寄送

js/
  settings.js             連線設定（GAS_URL）
  auth.js                 登入、Session、與 Apps Script 連線
  api.js                  資料存取（list / insert / update / remove / batch）
  config.js               左側選單與頁面權限
  core.js                 共用工具
  layout.js               頁首、選單、頁尾
  favorite.js             我的最愛
  ai-chat.js              AI 助理（Gemini）
  pages/                  各頁面程式；market-store.js 為市集訂單的雲端／離線同步

css/layout.css            共用樣式
img/logo.png              Logo

gas/Code.gs               Google Apps Script 後端（貼到試算表的 Apps Script）
gas/appsscript.json       Apps Script 設定（時區等）
```
