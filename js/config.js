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
                    page: "page/SystemSetting/Account.html"
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
                    page: "page/Formula/Formula.html"
                },
                {
                    id: 10,
                    Permission: [3, 6],
                    name: "📋 庫存盤點(未開放)",
                    page: "page/Inventory/Inventory.html"
                },
                {
                    id: 11,
                    Permission: [3, 6],
                    name: "📦 產品管理",
                    page: "page/Product/Product.html"
                },
                {
                    id: 12,
                    Permission: [3, 6],
                    name: "🛒 訂單管理",
                    page: "page/Order/Order.html"
                },
                {
                    id: 13,
                    Permission: [3, 6],
                    name: "🚚 出貨管理(未開放)",
                    page: "page/Shipment/Shipment.html"
                },
                {
                    id: 14,
                    Permission: [3, 6],
                    name: "💰 收帳紀錄(未開放)",
                    page: "page/Receivable/Receivable.html"
                },
                {
                    id: 15,
                    Permission: [3, 6],
                    name: "🏭 生產履歷(未開放)",
                    page: "page/ProductionLog/ProductionLog.html"
                },
                {
                    id: 16,
                    Permission: [3, 6],
                    name: "🥛 原料管理",
                    page: "page/Material/Material.html"
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
                    page: "page/Member/Member.html"
                },
                {
                    id: 21,
                    Permission: [3, 13],
                    name: "🏢 合作廠商資料管理",
                    page: "page/Business/Business.html"
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
                    page: "page/Order/OrderNow.html"
                },
                {
                    id: 31,
                    Permission: [3, 10, 13],
                    name: "📊 市集報表展示",
                    page: "page/Order/OrderReport.html"
                },
                {
                    id: 32,
                    Permission: [3, 10, 13],
                    name: "🏷️ 品牌資訊",
                    page: "page/Business/Brand.html"
                },
                {
                    id: 33,
                    Permission: [3, 6, 13],
                    name: "🔗 市集報名連結",
                    page: "page/LinkTree/LinkTree.html"
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
                    page: "page/Calendars/Calendar.html"
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
                    page: "page/DB_Date/AgentSetting.html"
                },
                {
                    id: 51,
                    name: "🧠 Agent工具應用",
                    Permission: [3, 6, 8, 9, 13],
                    page: "page/DB_Date/ToolAgent.html"
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
                    page: "page/DB_Date/Permission.html"
                }
                //,
                // {
                //     id: 82,
                //     Permission: [3],
                //     name: "✉️ 郵件專區(未開放)",
                //     page: "page/Mail/mail.html"
                // },
                // {
                //     id: 70,
                //     Permission: [3],
                //     name: "📊 報表生成(未開放)",
                //     page: "page/Report/Report.html"
                // },
                // {
                //     id: 72,
                //     Permission: [3],
                //     name: "📖 功能說明(未開放)",
                //     page: "page/Help/ReadFunction.html"
                // }
            ]
        }
    ]
};