// =========================================================
// 左側選單與頁面權限
//   Permission：擁有其中任一權限代碼即可使用；空陣列 = 登入即可
//   13 最高系統管理員不受限制（見 auth.js）
//   權限代碼：3 系統管理、20 行事曆、21 市集營運、22 商品與生產、
//            23 銷售與客戶、24 財務、25 AI 行銷；10、11 為舊版相容
//   id 用於「我的最愛」，請勿更改既有 id
// =========================================================
const Config = {
    // 網站根目錄（由 settings.js 自動推算）
    root: Auth.root,
    userId: Auth.getUserId(),
    menuData: [
        {
            group: "首頁",
            icon: "🏠",
            items: [
                { id: 1, Permission: [], name: "🏠 首頁（提醒、備忘錄）", page: "home.html" }
            ]
        },
        {
            group: "行事曆",
            icon: "🗓️",
            items: [
                { id: 40, Permission: [20, 10, 11], name: "📅 行事曆", page: "page/calendar.html" }
            ]
        },
        {
            group: "市集營運",
            icon: "🎪",
            items: [
                { id: 30, Permission: [21, 10], name: "🛒 現場點餐", page: "page/market-order.html" },
                { id: 31, Permission: [21, 10, 24], name: "📊 市集報表", page: "page/market-report.html" },
                { id: 34, Permission: [21, 10, 24], name: "🧾 出攤紀錄", page: "page/stall.html" },
                { id: 33, Permission: [21, 10], name: "🔗 市集報名連結", page: "page/market-link.html" },
                { id: 32, Permission: [], name: "🏷️ 品牌資訊", page: "page/brand.html" }
            ]
        },
        {
            group: "商品與生產",
            icon: "📦",
            items: [
                { id: 11, Permission: [22], name: "📦 產品管理", page: "page/product.html" },
                { id: 17, Permission: [22], name: "🧪 配方與成本試算", page: "page/formula.html" },
                { id: 16, Permission: [22], name: "🥛 原料管理", page: "page/material.html" },
                { id: 18, Permission: [22, 24], name: "📅 產品月盤點", page: "page/product-count.html" },
                { id: 19, Permission: [22, 24], name: "🛒 原物料進貨 / 盤點", page: "page/material-stock.html" },
                { id: 38, Permission: [22, 24], name: "📈 原物料漲幅表", page: "page/material-price.html" },
                { id: 10, Permission: [22], name: "📋 庫存盤點", page: "page/inventory.html" },
                { id: 15, Permission: [22], name: "🏭 生產履歷", page: "page/production.html" }
            ]
        },
        {
            group: "銷售與客戶",
            icon: "🛒",
            items: [
                { id: 12, Permission: [23], name: "🧾 訂單管理", page: "page/order.html" },
                { id: 13, Permission: [23], name: "🚚 出貨管理", page: "page/shipment.html" },
                { id: 21, Permission: [23, 24], name: "🏢 客戶 / 合作廠商", page: "page/company.html" }
            ]
        },
        {
            group: "財務",
            icon: "💰",
            items: [
                { id: 14, Permission: [24], name: "💰 帳務管理（應收）", page: "page/receivable.html" },
                { id: 36, Permission: [24], name: "💸 支出表", page: "page/expense.html" },
                { id: 35, Permission: [24], name: "📒 品牌攤提表", page: "page/amortization.html" }
            ]
        },
        {
            group: "AI 行銷",
            icon: "✨",
            items: [
                { id: 37, Permission: [25], name: "✨ AI 文案發想", page: "page/ai-writer.html" }
            ]
        },
        {
            group: "系統",
            icon: "🛠️",
            items: [
                { id: 2, Permission: [], name: "⚙️ 帳號設定", page: "page/account.html" },
                { id: 63, Permission: [3], name: "👥 帳號審核與權限", page: "page/access.html" },
                { id: 20, Permission: [3], name: "👨‍👩‍👧‍👦 員工及會員", page: "page/member.html" },
                { id: 60, Permission: [3], name: "🔐 權限管理", page: "page/permission.html" },
                { id: 61, Permission: [3], name: "✉️ 郵件寄送", page: "page/mail.html" },
                { id: 62, Permission: [3], name: "🕒 登入紀錄", page: "page/login-log.html" }
            ]
        },
        {
            group: "代理人",
            icon: "🤖",
            items: [
                { id: 50, Permission: [3, 6, 8, 9], name: "🛡️ OpenClaw 代理人管理", page: "page/agent.html" }
            ]
        }
    ]
};
