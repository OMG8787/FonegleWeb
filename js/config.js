const Config = {
    // 網站根目錄（由 settings.js 自動推算）
    root: Auth.root,
    userId: Auth.getUserId(),
    menuData: [
        {
            group: "系統設定",
            icon: "🛠️", // 比 ⚙ 更現代
            items: [
                {
                    id: 1,
                    Permission: [10, 13],
                    name: "🏠 回首頁",
                    page: "home.html"
                },
                {
                    id: 2,
                    Permission: [10, 13],
                    name: "⚙️ 帳號管理",
                    page: "page/account.html"
                }
            ]
        },
        {
            group: "資料管理",
            icon: "🗄️", // 比 📦 更貼近資料
            items: [
                {
                    id: 17,
                    Permission: [3, 6],
                    name: "🧪 產品配方(未開放)",
                    page: "page/formula.html"
                },
                {
                    id: 10,
                    Permission: [3, 6],
                    name: "📋 庫存盤點(未開放)",
                    page: "page/inventory.html"
                },
                {
                    id: 11,
                    Permission: [3, 6],
                    name: "📦 產品管理",
                    page: "page/product.html"
                },
                {
                    id: 12,
                    Permission: [3, 6],
                    name: "🛒 訂單管理",
                    page: "page/order.html"
                },
                {
                    id: 13,
                    Permission: [3, 6],
                    name: "🚚 出貨管理(未開放)",
                    page: "page/shipment.html"
                },
                {
                    id: 14,
                    Permission: [3, 6],
                    name: "💰 收帳紀錄(未開放)",
                    page: "page/receivable.html"
                },
                {
                    id: 15,
                    Permission: [3, 6],
                    name: "🏭 生產履歷(未開放)",
                    page: "page/production.html"
                },
                {
                    id: 16,
                    Permission: [3, 6],
                    name: "🥛 原料管理",
                    page: "page/material.html"
                },
            ]
        },
        {
            group: "員工及合作廠商",
            icon: "🧑🏻‍💼",
            items: [
                {
                    id: 20,
                    Permission: [3, 13],
                    name: "👨‍👩‍👧‍👦 員工及會員管理",
                    page: "page/member.html"
                },
                {
                    id: 21,
                    Permission: [3, 13],
                    name: "🏢 合作廠商資料管理",
                    page: "page/company.html"
                }
            ]
        },
        {
            group: "市集活動專區",
            icon: "🎪",
            items: [
                {
                    id: 30,
                    Permission: [3, 10, 13],
                    name: "🛒  現場點餐系統",
                    page: "page/market-order.html"
                },
                {
                    id: 31,
                    Permission: [3, 10, 13],
                    name: "📊 市集報表展示",
                    page: "page/market-report.html"
                },
                {
                    id: 32,
                    Permission: [3, 10, 13],
                    name: "🏷️ 品牌資訊",
                    page: "page/brand.html"
                },
                {
                    id: 33,
                    Permission: [3, 6, 13],
                    name: "🔗 市集報名連結",
                    page: "page/market-link.html"
                }
            ]
        },
        {
            group: "行事曆",
            icon: "🗓️",
            items: [
                {
                    id: 40,
                    Permission: [10, 11, 13],
                    name: "📅 行事曆",
                    page: "page/calendar.html"
                }
            ]
        },
        {
            group: "代理人專區",
            icon: "🤖",
            items: [

                {
                    id: 50,
                    name: "🛡️ OpenClaw-Agent管理",
                    Permission: [3, 6, 8, 9, 13],
                    page: "page/agent.html"
                }
            ]
        },
        {
            group: "其他工具",
            icon: "🧰",
            items: [
                {
                    id: 60,
                    Permission: [3, 13],
                    name: "🔐 系統權限資料管理",
                    page: "page/permission.html"
                },
                {
                    id: 61,
                    Permission: [3],
                    name: "✉️ 郵件寄送",
                    page: "page/mail.html"
                }
            ]
        }
    ]
};