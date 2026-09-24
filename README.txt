******************************************************************
【Google 試算表版】部署方式與資料表說明請看 README.md
本文件中的 API.send("指令") 寫法已改為：
    await API.list("資料表")、API.insert / API.update / API.remove
資料存放在 Google 試算表，由 gas/Code.gs（Apps Script）讀寫。
******************************************************************

==============================
鑫堡 ERP 前端系統 README
版本：v1.0
用途：內部 ERP / FAE / 業務 / 機器視覺整合平台
==============================

=========================
鑫堡 ERP 前端架構說明
=========================
一、專案架構概念

本專案採用「Layout + Core + API + Pages 模組化架構」

核心概念：

Layout：頁首 / 導覽列 / 頁尾（全站共用）
Core(App)：應用程式入口與工具函式
API：所有後端請求集中管理
Pages：每個功能頁面獨立模組
HTML：只負責結構，不放業務邏輯


━━━━━━━━━━━━━━━━━━━━━━
一、專案架構說明
━━━━━━━━━━━━━━━━━━━━━━

Cetus_Web/

│ home.html                     → 首頁
│ README.txt                    → 本說明文件

├─css/
│   layout.css                  → 共用版型樣式（頁首 / 側欄 / 主畫面）

├─js/
│   config.js                   → 全域設定檔
│   api.js                      → API 呼叫模組
│   layout.js                   → 頁首 / 頁尾 / 側欄模組
│   core.js                     → 主程式入口
│   utils.js                    → 共用工具（未來可新增）

│
├─js/pages/
│   CustomerAssessmentForm.js   → FAE 評估頁邏輯
│   Home.js                     → 首頁邏輯（未來可新增）
│   CustomerDemandForm.js       → 需求單頁（未來）
│   CustomerDemandAllList.js    → 查詢頁（未來）

│
├─page/
│   ├─FAE/
│   │   CustomerAssessmentForm.html
│   │
│   └─Business/
│       CustomerDemandForm.html
│       CustomerDemandAllList.html



━━━━━━━━━━━━━━━━━━━━━━
二、系統運作方式
━━━━━━━━━━━━━━━━━━━━━━

每個頁面載入流程：

1. HTML 開啟
2. App.init("頁面名稱")
3. 自動載入：
   - Header
   - Sidebar
   - Footer
4. 執行 pages/*.js 對應功能


範例：

App.init("CustomerAssessmentForm");

會執行：

Pages.CustomerAssessmentForm.init();



━━━━━━━━━━━━━━━━━━━━━━
三、新增功能標準流程（重要）
━━━━━━━━━━━━━━━━━━━━━━

假設新增「客戶管理」功能：

STEP 1：
建立 HTML

page/CRM/CustomerList.html


STEP 2：
建立 JS

js/pages/CustomerList.js


STEP 3：
註冊頁面模組

window.Pages = window.Pages || {};

Pages.CustomerList = {

    async init() {
        await this.loadData();
        this.bindEvents();
    },

    bindEvents() {

    },

    async loadData() {

    }
};


STEP 4：
HTML 啟動

document.addEventListener("DOMContentLoaded",()=>{
    App.init("CustomerList");
});


STEP 5：
加入左側選單

config.js

menuData: [
   {
      icon:"👤",
      name:"客戶管理",
      page:"/Cetus_Web/page/CRM/CustomerList.html"
   }
]



━━━━━━━━━━━━━━━━━━━━━━
四、共用模組使用方式
━━━━━━━━━━━━━━━━━━━━━━

【1】API 呼叫

const res = await API.send("取得FAE工作任務");


可帶參數：

await API.send("新增客戶",{
    Name:"ABC",
    Tel:"0912345678"
});



【2】提示訊息

App.toast("儲存成功");


【3】解析後端文字格式

const rows = App.parseFAEText(text);



━━━━━━━━━━━━━━━━━━━━━━
五、JS 撰寫規範（重要）
━━━━━━━━━━━━━━━━━━━━━━

每頁 JS 使用以下格式：

Pages.PageName = {

    async init() {

    },

    bindEvents() {

    },

    async loadData() {

    },

    save() {

    },

    delete() {

    }
};


好處：

1. 易維護
2. 易找功能
3. 易擴充
4. 不會全部寫在 HTML

━━━━━━━━━━━━━━━━━━━━━━
六、禁止事項（重要）
━━━━━━━━━━━━━━━━━━━━━━

【禁止】大量 JS 寫在 html 內

<script>
500行程式...
</script>


【禁止】每頁自己寫 Header / Sidebar

請統一由 Layout.init() 處理


【禁止】API URL 寫死在頁面內

請統一由 config.js 管理



━━━━━━━━━━━━━━━━━━━━━━
七、未來建議擴充
━━━━━━━━━━━━━━━━━━━━━━

1. utils.js

可放：

- 日期格式化
- 金額格式化
- localStorage
- querystring
- debounce


2. toast 提示框

取代 alert()


3. 權限管理

不同帳號看到不同選單


4. Token 登入


5. 共用表單元件


6. 動態載入頁面（SPA）


7. AI 助理整合



━━━━━━━━━━━━━━━━━━━━━━
八、命名規則
━━━━━━━━━━━━━━━━━━━━━━

HTML：

CustomerList.html


JS：

CustomerList.js


Page Name：

CustomerList


啟動：

App.init("CustomerList");



━━━━━━━━━━━━━━━━━━━━━━
九、目前已完成頁面
━━━━━━━━━━━━━━━━━━━━━━

✔ 首頁
✔ FAE 評估頁
□ 需求單
□ 查詢頁
□ 客戶管理
□ 庫存管理
□ 採購系統
□ AI客服



━━━━━━━━━━━━━━━━━━━━━━
十、維護者注意事項
━━━━━━━━━━━━━━━━━━━━━━

若新增頁面失敗，請先檢查：

1. js 是否有載入
2. App.init("名稱") 是否一致
3. Pages.xxx 是否存在
4. menuData 是否設定正確
5. console 是否報錯



━━━━━━━━━━━━━━━━━━━━━━
十一、系統核心觀念
━━━━━━━━━━━━━━━━━━━━━━

HTML 負責畫面
CSS 負責樣式
pages/*.js 負責功能
API.js 負責後端溝通
Layout.js 負責共用版型
Core.js 負責啟動系統


━━━━━━━━━━━━━━━━━━━━━━
十二、作者備註
━━━━━━━━━━━━━━━━━━━━━━

此架構設計目的：

讓 ERP 系統可持續擴充 10~50 頁以上，
仍保持乾淨、可維護、可交接。

建議後續所有功能皆遵守此架構開發。

=========================
十三、新功能開發實戰範例（必讀）
=========================
🎯 範例目標

建立一個新頁面：

👉 按鈕點擊後
👉 發送 "HI" 到後端 API
👉 顯示回傳結果

=========================
Step 1：建立 HTML
=========================

📄 路徑：

/page/Demo/SendHi.html
HTML 內容（最小版）
<!DOCTYPE html>
<html lang="zh-Hant">

<head>
    <meta charset="UTF-8">
    <title>HI 測試頁</title>
    <link href="../../css/layout.css" rel="stylesheet">
</head>

<body>

<div id="headerArea"></div>
<div id="sidebarArea"></div>

<div id="erp-layout">
    <div id="erp-main">

        <div class="container p-3">

            <button id="sendBtn" class="btn btn-primary">
                發送 HI
            </button>

            <hr>

            <div id="result"></div>

        </div>

    </div>
</div>

<div id="footerArea"></div>

<!-- 共用 -->
<script src="../../js/config.js"></script>
<script src="../../js/layout.js"></script>
<script src="../../js/core.js"></script>
<script src="../../js/api.js"></script>

<!-- 頁面JS -->
<script src="../../js/pages/SendHi.js"></script>

<script>
document.addEventListener("DOMContentLoaded", () => {
    App.init("SendHi");
});
</script>

</body>
</html>
=========================
Step 2：建立 JS
=========================

📄 路徑：

/js/pages/SendHi.js
window.Pages = window.Pages || {};

Pages.SendHi = {

    async init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById("sendBtn")
            .addEventListener("click", () => this.sendHI());
    },

    async sendHI() {

        try {

            // 呼叫後端 API
            const res = await API.send("HI");

            // 顯示結果
            document.getElementById("result").innerText =
                JSON.stringify(res, null, 2);

        } catch (err) {
            console.error(err);
            App.toast("發送失敗");
        }
    }
};
=========================
Step 3：加入選單（Sidebar）
=========================

📄 config.js

menuData: [
    ...
    {
        icon: "👋",
        name: "HI測試",
        page: "/Cetus_Web/page/Demo/SendHi.html"
    }
]
=========================
Step 4：後端 API（不用改框架）
=========================

前端只會做：

API.send("HI")

對應後端收到：

{
  "RawText": "HI",
  "UserId": "xxx"
}
=========================
開發流程總結（新人必記）
=========================
一個新功能 = 4 步驟
① 建 HTML（只做畫面）
page/xxx/xxx.html
② 建 JS（所有邏輯）
js/pages/xxx.js
③ 註冊頁面
App.init("xxx");
④ 加入 menu（如果需要）
config.js
=========================
核心觀念（非常重要）
=========================
❌ 不可以這樣做
<script>
fetch(...)
document.getElementById(...)
alert(...)
</script>
✅ 正確做法
層級	負責內容
HTML	畫面
Pages.js	行為
API.js	後端
Layout.js	框架
Core.js	啟動
=========================
一句話記憶
=========================

👉 HTML 不寫邏輯
👉 JS 不寫 UI 架構
👉 API 不寫業務邏輯
👉 Layout 不管頁面功能