/**
 * ============================================================
 * 瘋菓內部管理系統 — Google 試算表資料庫（Google Apps Script）
 * ============================================================
 * 部署步驟請見 瘋菓管理系統/README.md
 *
 * 前端以 POST（Content-Type: text/plain，內容為 JSON）呼叫：
 *   { "action": "list", "token": "...", "table": "Products" }
 * 回傳：
 *   { "success": true,  "data": ... }
 *   { "success": false, "message": "...", "code": "AUTH" }
 *
 * 每張資料表 = 試算表中的一個工作表，第一列為欄位名稱。
 * 工作表不存在或缺欄位時會自動建立 / 補上。
 */

// ============================================================
// 基本設定
// ============================================================
const CONFIG = {
    SESSION_HOURS: 6,                  // 登入有效時間（自登入起算；期間內除非登出或從 Sessions 分頁刪除，否則不會被登出）
    ACTIVE_UPDATE_MINUTES: 5,          // 最後活動時間的更新間隔（避免每次操作都寫入試算表）
    PASSWORD_SALT: 'ABC123',           // 與舊系統相同，舊資料的密碼雜湊可直接沿用
    RESET_PASSWORD: 'Fonegle',         // 忘記密碼時重設成的密碼
    ADMIN_PERMISSIONS: [3, 12, 13, 20, 21, 22, 23, 24, 25], // 第一位註冊者自動取得
    MAIL_PERMISSIONS: [3],
    AI_PERMISSIONS: [25],
    AI_MODEL_DEFAULT: 'gemini-2.5-flash',
    APP_NAME: '瘋菓內部管理系統'
};

// ============================================================
// 資料表結構
//   key    : 主鍵欄位
//   seq    : 自動遞增的數字欄位（新增時自動給號）
//   hidden : 永遠不回傳給前端的欄位
//   internal: 只能由本腳本存取，前端無法直接讀寫
//   cols   : 欄位清單，「名稱:型別」，型別 n=數字 b=布林 省略=文字
//   money  : setup 時設為千分位金額格式的欄位
//   owner  : 個人資料（只看得到自己建立的，或 IsShared = TRUE 的）
// ============================================================
const SCHEMA = {
    Users: {
        key: 'LineUserId', seq: 'ID', hidden: ['PassWord'],
        cols: 'ID:n LineUserId Name PhoneNumber Email IdCardNumber PassWord BirthdayYear:n BirthdayMonth:n BirthdayDay:n ' +
            'RoleId:n RoleList FavoriteFeaturesList AccountManager IsWeb:b IsMember:b IsBlocked:b IsActive:b ' +
            'IsMailActive:b IsPushMessage:b IsConverted:b OpenClaw OpenClawAgent ' +
            'CreatedAt UpdatedAt UpdateLineUserId ApprovalStatus ApprovedBy ApprovedAt'
    },
    // 目前登入中的裝置：刪除一列 = 讓該裝置立即登出
    Sessions: {
        key: 'Token', internal: true,
        cols: 'Token LineUserId ExpireAt:n CreatedAt SessionId UserName Device LoginAt LastActiveAt ExpireAtText'
    },
    // 登入歷程：每次登入（含失敗）一列，登出 / 逾時 / 被移除時補上結束時間與使用分鐘數
    LoginLog: {
        key: 'SessionId', internal: true,
        cols: 'SessionId LoginAt LineUserId UserName Account Result Device UserAgent LastActiveAt EndAt EndReason UsedMinutes:n'
    },
    ID_UserRoles: { key: 'ID', cols: 'ID:n RoleName' },
    ID_Permission: { key: 'ID', cols: 'ID:n Permission' },
    Calendar: {
        key: 'CalendarId', seq: 'CalendarId',
        cols: 'CalendarId:n EventName StartEventDate EndEventDate EventAddress Note CalendarType:n IsDeleted:b UserDB_ID Line_ID CreatedAt UpdatedAt'
    },
    // 活動每一天的營業時段
    CalendarDays: {
        key: 'DayId', seq: 'DayId',
        cols: 'DayId:n CalendarId:n EventDate StartTime EndTime Note CreatedAt UpdatedAt'
    },
    // 出攤紀錄
    StallRecords: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n CalendarId:n StallDate EventName Location Organizer StaffCount:n ' +
            'BoothFee:n TransportCost:n StaffCost:n OtherCost:n CashIncome:n ElectronicPay:n PaymentFeeRate:n PaymentFee:n ' +
            'Revenue:n FoodCostRate:n FoodCost:n TotalCost:n ProfitLoss:n RevenueLow:n RevenueTarget:n Note ' +
            'CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'BoothFee TransportCost StaffCost OtherCost CashIncome ElectronicPay PaymentFee Revenue FoodCost TotalCost ProfitLoss RevenueLow RevenueTarget'
    },
    // 品牌攤提表（支出 / 回收）
    BrandCosts: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n RecordDate Type Category ItemName Amount:n AmortizeMonths:n Vendor Note CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'Amount'
    },
    Companies: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n CompanyName CompanyID CompanyPhone CompanyURL CompanyAddress ContactName ContactPhone ContactEmail ' +
            'PaymentStstus:n IsMember:b IsConverted:b AccountManager TotalVisit:n TotalMail:n Source Note OpenClaw CreateLineID CreatedAt UpdateAt CustomerType'
    },
    CrawlerSources: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n SiteName BaseUrl Description IsDeleted:b LineUserId CreatedAt UpdatedAt'
    },
    ID_Category: { key: 'ID', seq: 'ID', cols: 'ID:n CategoryName CategoryCode Description IsActive:b' },
    Products: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n SKU Barcode ProductName ShortName CategoryID:n Brand Specification Flavor Capacity Weight:n Color Material Unit ' +
            'SalePrice:n MemberPrice:n CostPrice:n ShelfLifeDays:n FormulaID MinStock:n CurrentStock:n Status IsB2B:b IsB2C:b IsActive:b ' +
            'Description Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Material: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n MaterialName Category SupplierID:n Barcode Unit CostPrice:n CurrentStock:n MinStock:n Specification OriginCountry ' +
            'ExpireDays:n IsActive:b Description Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Inventory: {
        key: 'InventoryID', seq: 'InventoryID',
        cols: 'InventoryID:n ProductID:n MaterialID:n BatchNo Warehouse Location StockQty:n ReservedQty:n AvailableQty:n MinStock:n Unit ' +
            'MfgDate ExpDate LastInventoryDate Status IsActive:b Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Orders: {
        key: 'OrderID', seq: 'OrderID',
        cols: 'OrderID:n OrderNo MemberID MemberName MemberPhone MemberEmail ShippingAddress ProductID ProductName Qty:n Unit UnitPrice:n ' +
            'DiscountAmount:n ShippingFee:n TotalAmount:n PaymentMethod PaymentStatus OrderStatus ShippingStatus SalesChannel Note ' +
            'OrderDate CheckoutAt ExpectedShippingDate CreatedBy CreatedAt UpdatedBy UpdatedAt CompanyId:n ContactName'
    },
    Shipment: {
        key: 'ShipmentID', seq: 'ShipmentID',
        cols: 'ShipmentID:n ShipmentNo OrderID ProductID BatchNo LogisticsCompany TrackingNumber ReceiverName ReceiverPhone ReceiverAddress ' +
            'ShippingQty:n Unit ShippingDate ReceivedDate ShippingStatus Note CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    // 帳務（應收帳款）：哪家店家應付多少、付了沒
    Receivable: {
        key: 'ReceivableID', seq: 'ReceivableID',
        cols: 'ReceivableID:n CompanyId:n PayerName BillDate DueDate Item OrderID MemberID Amount:n PaidAmount:n ' +
            'DiscountAmount:n TaxAmount:n RefundAmount:n PaymentMethod PaymentStatus TransactionNo InvoiceNo PaymentDate RefundDate Note ' +
            'CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'Amount PaidAmount DiscountAmount TaxAmount RefundAmount'
    },
    // 支出表
    Expenses: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n ExpenseDate Category ItemName Vendor CompanyId:n Amount:n PaymentMethod InvoiceNo IsPaid:b Note ' +
            'CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'Amount'
    },
    // 備忘錄（個人）
    // Audience：系統通知的對象（例如 perm:3 = 有系統管理權限的人都看得到）；LinkType / LinkId：通知連到的資料
    Memos: {
        key: 'ID', seq: 'ID', owner: true,
        cols: 'ID:n Title Content DueDate Priority IsDone:b IsShared:b CreatedBy CreatedAt UpdatedBy UpdatedAt Audience LinkType LinkId'
    },
    // AI 助理對話紀錄（個人）
    AiChats: {
        key: 'ID', seq: 'ID', owner: true,
        cols: 'ID:n Role Text CreatedBy CreatedAt'
    },
    // AI 文案（個人）
    AiDrafts: {
        key: 'ID', seq: 'ID', owner: true,
        cols: 'ID:n Title DraftType Platform Tone CalendarId:n Outline Content IsShared:b CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    // 原物料進貨（每次購買一列；漲幅表依此計算）
    MaterialPurchases: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n PurchaseDate MaterialID:n MaterialName Category Supplier CompanyId:n Quantity:n Unit UnitPrice:n TotalPrice:n ' +
            'BatchNo MfgDate ExpDate InvoiceNo ExpenseId:n Note CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'UnitPrice TotalPrice'
    },
    // 原物料月盤點：期初 + 本月進貨 - 實盤 = 本月用量
    MaterialCounts: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n CountMonth MaterialID:n MaterialName Unit OpeningQty:n PurchasedQty:n PurchasedAmount:n CountedQty:n UsedQty:n ' +
            'AvgUnitPrice:n UsedCost:n StockValue:n NearestExpDate Note CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'PurchasedAmount AvgUnitPrice UsedCost StockValue'
    },
    // 產品月盤點：期初 + 製作 - 出貨 - 其他出庫 - 損耗 = 應有；實盤；本月使用量 = 期初 + 製作 - 實盤
    ProductCounts: {
        key: 'ID', seq: 'ID',
        cols: 'ID:n CountMonth ProductID:n ProductName Unit OpeningQty:n ProducedQty:n ShippedQty:n OtherOutQty:n WasteQty:n ' +
            'ExpectedQty:n CountedQty:n DiffQty:n UsedQty:n LatestMfgDate NearestExpDate Note CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    ProductionLog: {
        key: 'ProductionID', seq: 'ProductionID',
        cols: 'ProductionID:n ProductID FormulaID BatchNo ProductionNo Factory ProductionLine PlannedQty:n ProducedQty:n NGQty:n Unit ' +
            'OperatorName SupervisorName StartTime EndTime MfgDate ExpDate Status Description Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Formula: {
        key: 'FormulaID', seq: 'FormulaID',
        cols: 'FormulaID:n FormulaCode ProductID FormulaName VersionNo YieldQty:n YieldUnit IsActive:b Description Remark ' +
            'PackagingCost:n LaborCost:n OtherCost:n TargetPrice:n TargetCostRate:n MaterialCost:n TotalCost:n UnitCost:n ' +
            'CreatedBy CreatedAt UpdatedBy UpdatedAt',
        money: 'PackagingCost LaborCost OtherCost TargetPrice MaterialCost TotalCost UnitCost'
    },
    FormulaDetail: {
        key: 'FormulaDetailID', seq: 'FormulaDetailID',
        cols: 'FormulaDetailID:n FormulaID:n MaterialID MaterialCode MaterialName Quantity:n Unit UnitCost:n LineCost:n Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    AgentConfig: {
        key: 'Id', seq: 'Id',
        cols: 'Id:n TargetlineUserId AgentKey AgentToolsProfileName OpenClawAgentId WorkspacePath UserProFilePath ModelName SessionScope ' +
            'SandboxMode WorkspaceAccess IsEnable:b AllowMemory:b MaxMemoryCount:n MemoryExpireDays:n CreatedAt UpdatedAt'
    },
    ID_AgentTool: { key: 'Id', seq: 'Id', cols: 'Id:n ToolName AgentToolName IsEnable:b' },
    AgentToolPermissions: {
        key: 'Id', seq: 'Id',
        cols: 'Id:n TargetlineUserId ToolId:n IsAllow:b CreatedAt UpdatedAt'
    },
    MarketOrders: {
        key: 'OrderKey',
        cols: 'OrderKey Time Items Total:n Received:n Change:n Payment CreatedBy CreatedAt'
    },
    MailLog: { key: 'ID', seq: 'ID', internal: true, cols: 'ID:n Subject Recipients Attachments SentBy CreatedAt' }
};

// ============================================================
// 試算表說明（setup 會依此排序分頁、上色、在表頭加中文註解，並產生「📖 資料字典」）
//   擴充方式：
//   1. 直接在工作表最右邊新增欄位（第一列填英文欄位名稱）→ 網頁讀取時就會帶出該欄位
//   2. 需要網頁表單使用、或需指定數字 / 布林型別時，再到 SCHEMA 的 cols 加上該欄位
// ============================================================
const MODULES = {
    system: { title: '系統', color: '#6c757d' },
    calendar: { title: '行事曆', color: '#0d6efd' },
    market: { title: '市集營運', color: '#fd7e14' },
    product: { title: '商品與生產', color: '#198754' },
    sales: { title: '銷售與客戶', color: '#6f42c1' },
    finance: { title: '財務', color: '#dc3545' },
    ai: { title: 'AI 行銷', color: '#d63384' },
    agent: { title: '代理人', color: '#20c997' }
};

const TABLE_INFO = {
    Users: ['system', '員工與會員帳號（密碼為雜湊，不可手動修改）'],
    ID_UserRoles: ['system', '角色代碼'],
    ID_Permission: ['system', '權限代碼'],
    Memos: ['system', '備忘錄（個人，可共享；系統通知例如新帳號申請也會出現在這裡）'],
    Sessions: ['system', '目前登入中的裝置（刪除一列 = 強制該裝置登出，其他欄位請勿修改）'],
    LoginLog: ['system', '登入歷程（帳號、裝置、登入 / 登出時間、使用分鐘數）'],
    MailLog: ['system', '寄信紀錄'],
    Calendar: ['calendar', '行事曆活動'],
    CalendarDays: ['calendar', '活動每一天的營業時段'],
    MarketOrders: ['market', '市集現場點餐（每筆一張單，Items 為品項明細 JSON）'],
    StallRecords: ['market', '出攤紀錄（費用、收款、盈虧）'],
    CrawlerSources: ['market', '市集報名連結'],
    Products: ['product', '產品'],
    ID_Category: ['product', '產品分類'],
    Material: ['product', '原料'],
    Formula: ['product', '配方與成本'],
    FormulaDetail: ['product', '配方原料明細'],
    Inventory: ['product', '進貨 / 庫存紀錄'],
    ProductCounts: ['product', '產品月盤點（製作、出貨、剩餘、使用量、製造 / 到期日）'],
    MaterialPurchases: ['product', '原物料進貨（數量、金額、單價、批號、製造 / 有效日期）'],
    MaterialCounts: ['product', '原物料月盤點（期初、進貨、實盤、用量、成本）'],
    ProductionLog: ['product', '生產履歷'],
    Companies: ['sales', '客戶與合作廠商（公司 / 個人），訂單與帳務都以 ID 連到這裡'],
    Orders: ['sales', '訂單（一列一個品項，同訂單共用 OrderNo；CompanyId 連到客戶）'],
    Shipment: ['sales', '出貨'],
    Receivable: ['finance', '帳務（應收帳款）'],
    Expenses: ['finance', '支出'],
    BrandCosts: ['finance', '品牌攤提（投入 / 回收）'],
    AiDrafts: ['ai', 'AI 文案（個人，可共享）'],
    AiChats: ['ai', 'AI 助理對話紀錄（個人）'],
    AgentConfig: ['agent', '代理人設定'],
    ID_AgentTool: ['agent', '代理人工具'],
    AgentToolPermissions: ['agent', '代理人工具權限']
};

const COLUMN_LABELS = {
    ID: '編號', Id: '編號', Name: '姓名', Note: '備註', Remark: '備註', Description: '說明', Status: '狀態',
    CreatedAt: '建立時間', CreatedBy: '建立人（使用者ID）', UpdatedAt: '修改時間', UpdateAt: '修改時間',
    UpdatedBy: '修改人（使用者ID）', UpdateLineUserId: '修改人（使用者ID）', CreateLineID: '建立人',
    IsActive: '啟用', IsDeleted: '已取消 / 停用', IsShared: '共享給其他人', IsEnable: '啟用', Unit: '單位', Amount: '金額',
    // 帳號
    LineUserId: '使用者ID（主鍵）', PhoneNumber: '電話（登入帳號）', Email: 'Email', IdCardNumber: '身分證字號',
    PassWord: '密碼雜湊（請勿修改）', BirthdayYear: '生日-年', BirthdayMonth: '生日-月', BirthdayDay: '生日-日',
    RoleId: '角色代碼', RoleList: '權限代碼（以 | 分隔）', FavoriteFeaturesList: '我的最愛（選單編號）',
    AccountManager: '負責專員', IsWeb: '可登入網站', IsMember: '會員', IsBlocked: '黑名單', IsMailActive: '可收發信',
    IsPushMessage: '接受推播', IsConverted: '曾交易', OpenClaw: 'OpenClaw 聊天室ID', OpenClawAgent: '代理人編號',
    RoleName: '角色名稱', Permission: '權限名稱', Token: '登入權杖', ExpireAt: '到期時間（毫秒）',
    SessionId: '登入編號', UserName: '姓名', Device: '裝置', LoginAt: '登入時間', LastActiveAt: '最後活動時間',
    ExpireAtText: '到期時間', Account: '登入帳號', Result: '結果', UserAgent: '瀏覽器資訊',
    EndAt: '結束時間', EndReason: '結束原因', UsedMinutes: '使用分鐘數',
    Subject: '主旨', Recipients: '收件人', Attachments: '附件', SentBy: '寄件人',
    Title: '標題', Content: '內容', DueDate: '到期日', Priority: '優先順序', IsDone: '已完成',
    Audience: '通知對象（perm:權限代碼）', LinkType: '通知類型', LinkId: '通知連結的資料',
    ApprovalStatus: '審核狀態（待審核 / 已核准 / 已拒絕，空白 = 已核准）', ApprovedBy: '審核人', ApprovedAt: '審核時間',
    // 行事曆
    CalendarId: '行事曆活動編號', EventName: '活動名稱', StartEventDate: '開始時間', EndEventDate: '結束時間',
    EventAddress: '地址', CalendarType: '類型（1公開 2會議 3私人 4其他）', UserDB_ID: '私人活動代號', Line_ID: '建立人',
    DayId: '編號', EventDate: '日期', StartTime: '開始時間', EndTime: '結束時間',
    // 市集
    OrderKey: '點餐單號', Time: '點餐時間', Items: '品項明細（JSON）', Total: '應收', Received: '實收', Change: '找零',
    Payment: '付款方式（cash 現金 / online 電子）', StallDate: '出攤日期', Location: '地點', Organizer: '主辦單位',
    StaffCount: '人數', BoothFee: '攤位費', TransportCost: '車資', StaffCost: '人手費用', OtherCost: '其他費用',
    CashIncome: '現金收款', ElectronicPay: '電子支付收款', PaymentFeeRate: '手續費率 %', PaymentFee: '手續費',
    Revenue: '營業額', FoodCostRate: '食材成本 %', FoodCost: '食材成本', TotalCost: '總成本', ProfitLoss: '盈虧',
    RevenueLow: '營業額低標', RevenueTarget: '營業額目標', SiteName: '主辦 / 廠商', BaseUrl: '連結網址',
    // 商品與生產
    SKU: 'SKU', Barcode: '條碼', ProductName: '產品名稱', ShortName: '簡稱', CategoryID: '分類編號', Brand: '品牌',
    Specification: '規格', Flavor: '口味', Capacity: '容量', Weight: '重量', Color: '顏色', Material: '材質',
    SalePrice: '售價', MemberPrice: '會員價', CostPrice: '成本價（每單位）', ShelfLifeDays: '保存天數', FormulaID: '配方編號',
    MinStock: '安全庫存', CurrentStock: '目前庫存', IsB2B: 'B2B', IsB2C: 'B2C', CategoryName: '分類名稱',
    CategoryCode: '分類代碼', MaterialName: '原料名稱', Category: '分類', SupplierID: '供應商（廠商編號）',
    OriginCountry: '原產地', ExpireDays: '保存天數', InventoryID: '編號', ProductID: '產品編號', MaterialID: '原料編號',
    BatchNo: '批號', Warehouse: '倉庫', StockQty: '數量', ReservedQty: '保留量', AvailableQty: '可用量',
    MfgDate: '製造日期', ExpDate: '有效日期', LastInventoryDate: '最後盤點日', FormulaCode: '配方代碼',
    FormulaName: '配方名稱', VersionNo: '版本', YieldQty: '產量', YieldUnit: '產量單位', PackagingCost: '包材成本',
    LaborCost: '人工成本', TargetPrice: '預計售價', TargetCostRate: '目標成本率 %', MaterialCost: '原料成本',
    UnitCost: '單位成本', FormulaDetailID: '編號', MaterialCode: '原料代碼', Quantity: '用量', LineCost: '小計成本',
    ProductionID: '編號', ProductionNo: '生產單號', Factory: '工廠', ProductionLine: '產線', PlannedQty: '計畫數量',
    ProducedQty: '生產數量', NGQty: '不良數量', OperatorName: '作業員', SupervisorName: '主管',
    PurchaseDate: '進貨日期', Supplier: '供應商', ExpenseId: '支出表編號', CountMonth: '盤點月份（yyyy-MM）',
    OpeningQty: '期初數量', PurchasedQty: '本月進貨量', PurchasedAmount: '本月進貨金額', CountedQty: '實盤數量',
    UsedQty: '本月使用量', AvgUnitPrice: '平均單價', UsedCost: '使用成本', StockValue: '庫存價值',
    NearestExpDate: '最近到期日', LatestMfgDate: '最近製造日', ShippedQty: '本月出貨', OtherOutQty: '其他出庫（市集 / 試吃 / 贈送）',
    WasteQty: '損耗', ExpectedQty: '應有庫存', DiffQty: '盤差（實盤 - 應有）', TotalPrice: '總價',
    // 銷售
    CompanyName: '客戶 / 公司名稱', CustomerType: '客戶類型（公司 / 個人，空白 = 公司）', CompanyID: '統一編號', CompanyPhone: '公司電話', CompanyURL: '網站',
    CompanyAddress: '地址', ContactName: '聯絡人', ContactPhone: '聯絡電話', ContactEmail: '聯絡 Email',
    PaymentStstus: '付款評分（0-5）', TotalVisit: '拜訪次數', TotalMail: '寄信次數', Source: '資料來源',
    OrderID: '訂單編號', OrderNo: '訂單號碼', MemberID: '會員編號（舊資料，Users 的 ID）', MemberName: '會員姓名', MemberPhone: '會員電話',
    MemberEmail: '會員 Email', ShippingAddress: '收件地址', Qty: '數量', UnitPrice: '單價', DiscountAmount: '折扣',
    ShippingFee: '運費', TotalAmount: '訂單總額', PaymentMethod: '付款方式', PaymentStatus: '付款狀態',
    OrderStatus: '訂單狀態', ShippingStatus: '出貨狀態', SalesChannel: '銷售通路', OrderDate: '下單時間',
    CheckoutAt: '結帳時間', ExpectedShippingDate: '預計出貨日', ShipmentID: '編號', ShipmentNo: '出貨單號',
    LogisticsCompany: '物流公司', TrackingNumber: '物流單號', ReceiverName: '收件人', ReceiverPhone: '收件電話',
    ReceiverAddress: '收件地址', ShippingQty: '出貨數量', ShippingDate: '出貨日期', ReceivedDate: '收貨日期',
    // 財務
    ReceivableID: '編號', CompanyId: '客戶編號（Companies 的 ID）', PayerName: '付款對象', BillDate: '帳單日期', Item: '項目',
    PaidAmount: '已收金額', TaxAmount: '稅額', RefundAmount: '退款', TransactionNo: '交易序號', InvoiceNo: '發票號碼',
    PaymentDate: '付款日期', RefundDate: '退款日期', ExpenseDate: '支出日期', ItemName: '項目名稱', Vendor: '廠商 / 對象',
    IsPaid: '已付款', RecordDate: '日期', Type: '類型（支出 / 回收）', AmortizeMonths: '攤提月數',
    // AI
    Role: '角色（user 使用者 / model AI）', Text: '訊息內容',
    DraftType: '文案類型', Platform: '平台', Tone: '語氣', Outline: '大綱 / 需求',
    // 代理人
    TargetlineUserId: '目標使用者ID', AgentKey: 'Agent Key', AgentToolsProfileName: '工具權限等級',
    OpenClawAgentId: 'OpenClaw Agent ID', WorkspacePath: '工作區路徑', UserProFilePath: '使用者設定路徑',
    ModelName: '模型', SessionScope: 'Session 範圍', SandboxMode: '沙盒模式', WorkspaceAccess: '工作區權限',
    AllowMemory: '允許記憶', MaxMemoryCount: '最大記憶數', MemoryExpireDays: '記憶保存天數',
    ToolName: '工具名稱', AgentToolName: '官方工具名稱', ToolId: '工具編號', IsAllow: '允許'
};

const TYPE_LABELS = { s: '文字', n: '數字', b: '是否（TRUE/FALSE）' };

// ============================================================
// 權限（模組制）
//   13 最高系統管理員：全部
//   3  系統管理（帳號、會員、權限、郵件）
//   12 刪除資料：刪除需要此權限（備忘錄、AI 文案刪除自己的除外）
//   16 唯讀：只能查看，不能新增、修改、刪除
//   20 行事曆  21 市集營運  22 商品與生產  23 銷售與客戶  24 財務  25 AI 行銷
//   6/8/9 代理人；10、11 為舊版權限（相容：行事曆、市集營運）
//
// read：可讀取的權限（'all' = 登入即可）；write：可新增 / 修改的權限
// ============================================================
const PERM = { ADMIN: 13, SYSTEM: 3, DELETE: 12, READONLY: 16 };

const PERMISSION_CODES = [
    { ID: 3, Permission: '系統管理（帳號、會員、權限、郵件）' },
    { ID: 12, Permission: '刪除資料' },
    { ID: 13, Permission: '最高系統管理員（全部功能）' },
    { ID: 16, Permission: '唯讀（只能查看）' },
    { ID: 20, Permission: '行事曆' },
    { ID: 21, Permission: '市集營運（點餐、報表、出攤、報名連結）' },
    { ID: 22, Permission: '商品與生產（產品、配方成本、原料、庫存、生產）' },
    { ID: 23, Permission: '銷售與客戶（訂單、出貨、合作廠商）' },
    { ID: 24, Permission: '財務（帳務、支出、攤提）' },
    { ID: 25, Permission: 'AI 行銷（文案發想）' }
];

const CAL = [20, 10, 11], MARKET = [21, 10], PRODUCT = [22], SALES = [23], FINANCE = [24], AI = [25], AGENT = [6, 8, 9];

const TABLE_PERMS = {
    Users: { read: [3].concat(AGENT), write: [3] },
    ID_UserRoles: { read: 'all', write: [3] },
    ID_Permission: { read: 'all', write: [3] },
    Calendar: { read: CAL.concat(MARKET, AI), write: CAL },
    CalendarDays: { read: CAL.concat(MARKET, AI), write: CAL },
    Memos: { read: 'all', write: 'all' },
    AiDrafts: { read: [25], write: [25] },
    AiChats: { read: 'all', write: 'all' },
    StallRecords: { read: MARKET.concat(FINANCE), write: MARKET },
    MarketOrders: { read: MARKET.concat(FINANCE), write: MARKET },
    CrawlerSources: { read: MARKET, write: MARKET },
    ID_Category: { read: PRODUCT.concat(SALES, FINANCE), write: PRODUCT },
    Products: { read: PRODUCT.concat(SALES, FINANCE), write: PRODUCT },
    Material: { read: PRODUCT, write: PRODUCT },
    Inventory: { read: PRODUCT, write: PRODUCT },
    ProductionLog: { read: PRODUCT, write: PRODUCT },
    ProductCounts: { read: PRODUCT.concat(FINANCE), write: PRODUCT },
    MaterialPurchases: { read: PRODUCT.concat(FINANCE), write: PRODUCT.concat(FINANCE) },
    MaterialCounts: { read: PRODUCT.concat(FINANCE), write: PRODUCT },
    Formula: { read: PRODUCT, write: PRODUCT },
    FormulaDetail: { read: PRODUCT, write: PRODUCT },
    Companies: { read: SALES.concat(FINANCE, PRODUCT), write: SALES.concat(FINANCE) },
    Orders: { read: SALES.concat(FINANCE), write: SALES },
    Shipment: { read: SALES, write: SALES },
    Receivable: { read: FINANCE, write: FINANCE },
    Expenses: { read: FINANCE, write: FINANCE },
    BrandCosts: { read: FINANCE, write: FINANCE },
    AgentConfig: { read: [3].concat(AGENT), write: [3].concat(AGENT) },
    ID_AgentTool: { read: [3].concat(AGENT), write: [3].concat(AGENT) },
    AgentToolPermissions: { read: [3].concat(AGENT), write: [3].concat(AGENT) }
};

const CREATED_AT_COLS = ['CreatedAt'];
const UPDATED_AT_COLS = ['UpdatedAt', 'UpdateAt'];
const CREATED_BY_COLS = ['CreatedBy', 'CreateLineID'];
const UPDATED_BY_COLS = ['UpdatedBy', 'UpdateLineUserId'];

// ============================================================
// 進入點
// ============================================================
function doGet() {
    return json_({ success: true, data: CONFIG.APP_NAME + ' API 運作中' });
}

function doPost(e) {
    let req;

    try {
        req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
        return json_({ success: false, message: '請求格式錯誤' });
    }

    try {
        return json_({ success: true, data: handle_(req) });
    } catch (err) {
        const known = err && err.userMessage;

        if (!known) console.error(err && err.stack ? err.stack : err);

        return json_({
            success: false,
            message: known ? err.message : '系統錯誤：' + (err && err.message ? err.message : err),
            code: (err && err.code) || ''
        });
    }
}

const PUBLIC_ACTIONS = {
    ping: () => 'pong',
    importData: importData_,
    login: login_,
    register: register_,
    forgetPassword: forgetPassword_
};

const PRIVATE_ACTIONS = {
    me: me_,
    logout: logout_,
    list: list_,
    getMany: getMany_,
    get: get_,
    insert: insert_,
    update: update_,
    remove: remove_,
    removeWhere: removeWhere_,
    batch: batch_,
    updateProfile: updateProfile_,
    changePassword: changePassword_,
    setFavorite: setFavorite_,
    sendMail: sendMail_,
    aiChat: aiChat_,
    aiGenerate: aiGenerate_,
    loginSessions: loginSessions_,
    kickSession: kickSession_,
    loginLog: loginLog_,
    accessList: accessList_,
    setUserAccess: setUserAccess_,
    approveUser: approveUser_
};

function handle_(req) {
    const action = String(req.action || '');

    if (PUBLIC_ACTIONS[action])
        return PUBLIC_ACTIONS[action](req);

    if (!PRIVATE_ACTIONS[action])
        fail_('未知的操作：' + action);

    const ctx = auth_(req.token);

    return PRIVATE_ACTIONS[action](req, ctx);
}

// ============================================================
// 初始化（第一次部署時，在編輯器選擇 setup 執行一次）
// ============================================================
function setup() {
    Object.keys(SCHEMA).forEach(name => tbl_(name));

    const seed = (name, rows) => {
        const t = tbl_(name);
        if (readRows_(t).length) return;
        rows.forEach(r => appendRow_(t, r));
    };

    // 預設資料與原 SQL Server（FonegleData）相同
    seed('ID_UserRoles', [
        { ID: 1, RoleName: '一般客戶' },
        { ID: 2, RoleName: '會員' },
        { ID: 3, RoleName: 'B2C 商家' },
        { ID: 4, RoleName: 'B2B 合作商' },
        { ID: 5, RoleName: '員工' },
        { ID: 6, RoleName: '系統管理員' },
        { ID: 7, RoleName: 'FAE' },
        { ID: 8, RoleName: '業務' },
        { ID: 9, RoleName: '負責人' }
    ]);

    seed('ID_Permission', [
        { ID: 1, Permission: 'FAE建立' },
        { ID: 2, Permission: '業務單建立' },
        { ID: 3, Permission: '權限修改' },
        { ID: 5, Permission: '建立配方' },
        { ID: 6, Permission: '個人代理人權限控制' },
        { ID: 8, Permission: '代理人工具總開關建立' },
        { ID: 9, Permission: '建立代理人' },
        { ID: 10, Permission: '基本功能' },
        { ID: 11, Permission: '建立更新行事曆' },
        { ID: 12, Permission: '刪除資料' },
        { ID: 13, Permission: '最高系統管理員' },
        { ID: 14, Permission: '修改資料' },
        { ID: 15, Permission: '建立資料' }
    ].filter(r => !PERMISSION_CODES.some(c => c.ID === r.ID)).concat(PERMISSION_CODES));

    // 補上新版模組權限代碼（已存在的不覆蓋）
    const permTable = tbl_('ID_Permission');
    const existing = readRows_(permTable).map(x => Number(x.obj.ID));
    PERMISSION_CODES
        .filter(c => existing.indexOf(c.ID) < 0)
        .forEach(c => appendRow_(permTable, c));

    // 美化：表頭樣式、凍結首列、欄寬、金額格式、中文註解
    Object.keys(SCHEMA).forEach(name => styleSheet_(tbl_(name)));

    buildDictionary_();
    arrangeSheets_();

    // 移除預設的空白工作表
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheets().forEach(sh => {
        if (!SCHEMA[sh.getName()] && sh.getName() !== '📖 資料字典' && sh.getLastRow() === 0 && ss.getSheets().length > 1)
            ss.deleteSheet(sh);
    });

    return '初始化完成';
}

function styleSheet_(t) {
    const sh = t.sh;
    const width = t.headers.length;
    const info = TABLE_INFO[t.name] || ['system', ''];
    const color = (MODULES[info[0]] || MODULES.system).color;

    sh.getRange(1, 1, 1, width)
        .setFontWeight('bold')
        .setFontColor('#ffffff')
        .setBackground('#4d341c')
        .setNotes([t.headers.map(h => (COLUMN_LABELS[h] || '') + (t.types[h] && t.types[h] !== 's' ? '（' + TYPE_LABELS[t.types[h]] + '）' : ''))]);

    sh.setTabColor(color);

    sh.setFrozenRows(1);

    t.headers.forEach((h, i) => {
        const type = t.types[h] || 's';
        sh.setColumnWidth(i + 1, type === 'b' ? 90 : type === 'n' ? 100 : Math.min(260, Math.max(110, h.length * 11)));
    });

    const rows = sh.getMaxRows() - 1;

    String(t.def.money || '').split(/\s+/).filter(String).forEach(col => {
        const j = t.headers.indexOf(col);
        if (j >= 0 && rows > 0) sh.getRange(2, j + 1, rows, 1).setNumberFormat('#,##0');
    });
}

// ============================================================
// 遠端資料匯入（一次性金鑰）
//   1. 在編輯器執行 openImportWindow → 執行記錄會顯示金鑰（30 分鐘內有效）
//   2. 匯入程式以該金鑰呼叫 importData，成功後金鑰立即作廢
// ============================================================
const IMPORT_TABLES = [
    'Users', 'ID_UserRoles', 'ID_Permission', 'Calendar', 'CalendarDays', 'Companies', 'CrawlerSources',
    'ID_Category', 'Products', 'Material', 'Inventory', 'Orders', 'Shipment', 'Receivable', 'ProductionLog',
    'Formula', 'FormulaDetail', 'AgentConfig', 'ID_AgentTool', 'AgentToolPermissions'
];

function openImportWindow() {
    const key = Utilities.getUuid().replace(/-/g, '');
    const props = PropertiesService.getScriptProperties();

    props.setProperty('IMPORT_KEY', key);
    props.setProperty('IMPORT_KEY_EXPIRE', String(Date.now() + 30 * 60 * 1000));

    Logger.log('匯入金鑰（30 分鐘內有效，使用一次後作廢）：' + key);
    return key;
}

function importData_(req) {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('IMPORT_KEY');
    const expire = Number(props.getProperty('IMPORT_KEY_EXPIRE') || 0);

    if (!key || !req.key || req.key !== key) fail_('匯入金鑰錯誤或未開啟匯入');
    if (Date.now() > expire) {
        props.deleteProperty('IMPORT_KEY');
        fail_('匯入金鑰已過期，請重新執行 openImportWindow');
    }

    const tables = req.tables || {};
    const names = Object.keys(tables);

    if (!names.length) fail_('沒有資料');

    names.forEach(n => {
        if (IMPORT_TABLES.indexOf(n) < 0) fail_('不允許匯入的資料表：' + n);
        if (!Array.isArray(tables[n])) fail_('資料格式錯誤：' + n);
    });

    // 金鑰只能用一次
    props.deleteProperty('IMPORT_KEY');
    props.deleteProperty('IMPORT_KEY_EXPIRE');

    setup();

    return withLock_(() => {
        const report = {};

        names.forEach(n => {
            replaceTableRows_(tbl_(n), tables[n]);
            report[n] = tables[n].length;
        });

        return report;
    });
}

// 清空資料（保留表頭）後整批寫入
function replaceTableRows_(t, rows) {
    const sh = t.sh;
    const last = sh.getLastRow();

    if (last > 1) sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clearContent();
    if (!rows.length) return;

    if (sh.getMaxRows() < rows.length + 1)
        sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());

    t.headers.forEach((h, i) => {
        if ((t.types[h] || 's') === 's')
            sh.getRange(2, i + 1, rows.length, 1).setNumberFormat('@');
    });

    const values = rows.map(r => t.headers.map(h => (h in r ? toCell_(r[h], t.types[h] || 's') : '')));
    sh.getRange(2, 1, rows.length, t.headers.length).setValues(values);
}

// 「📖 資料字典」：每張表、每個欄位的中文說明
function buildDictionary_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const name = '📖 資料字典';
    const sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);

    const rows = [['模組', '工作表', '用途', '欄位', '中文名稱', '型別', '主鍵']];

    Object.keys(SCHEMA).forEach(tableName => {
        const t = tbl_(tableName);
        const info = TABLE_INFO[tableName] || ['system', ''];
        const module = (MODULES[info[0]] || MODULES.system).title;

        t.headers.forEach((h, i) => rows.push([
            i === 0 ? module : '',
            i === 0 ? tableName : '',
            i === 0 ? info[1] : '',
            h,
            COLUMN_LABELS[h] || '（自訂欄位）',
            TYPE_LABELS[t.types[h] || 's'],
            h === t.key ? '主鍵' : (h === t.seq ? '自動編號' : '')
        ]));
    });

    sh.clear();
    if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
    if (sh.getMaxColumns() < 7) sh.insertColumnsAfter(sh.getMaxColumns(), 7 - sh.getMaxColumns());

    sh.getRange(1, 1, rows.length, 7).setValues(rows);
    sh.getRange(1, 1, 1, 7).setFontWeight('bold').setFontColor('#ffffff').setBackground('#4d341c');
    sh.setFrozenRows(1);
    sh.setTabColor('#212529');
    [90, 150, 280, 170, 200, 130, 80].forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

// 依模組排序分頁：資料字典 → 各模組
function arrangeSheets_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const order = ['📖 資料字典'].concat(
        Object.keys(MODULES).reduce((list, m) =>
            list.concat(Object.keys(TABLE_INFO).filter(n => TABLE_INFO[n][0] === m)), []));

    order.forEach((name, i) => {
        const sh = ss.getSheetByName(name);
        if (!sh) return;
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(i + 1);
    });

    const dict = ss.getSheetByName('📖 資料字典');
    if (dict) ss.setActiveSheet(dict);
}

// ============================================================
// 登入 / 註冊 / 忘記密碼
// ============================================================
function login_(req) {
    const phone = String(req.phone || '').trim();
    const password = String(req.password || '');
    const device = clip_(req.device, 120);
    const userAgent = clip_(req.userAgent, 300);

    if (!phone || !password)
        fail_('請輸入電話與密碼');

    return withLock_(() => {
        const users = tbl_('Users');
        const found = readRows_(users).find(x => String(x.obj.PhoneNumber).trim() === phone);
        const u = found ? found.obj : {};

        // 失敗也記錄，方便發現有人亂試密碼
        const reject = message => {
            appendRow_(tbl_('LoginLog'), {
                SessionId: newSessionId_(), LoginAt: now_(), LineUserId: u.LineUserId || '', UserName: u.Name || '',
                Account: phone, Result: '失敗：' + message, Device: device, UserAgent: userAgent
            });
            fail_(message);
        };

        if (!found) reject('帳號不存在');
        if (!u.PassWord) reject('帳號資料異常');
        if (u.PassWord !== hash_(password)) reject('密碼錯誤');
        if (u.ApprovalStatus === '待審核') reject('帳號審核中，請等候系統管理員核准');
        if (u.ApprovalStatus === '已拒絕') reject('帳號申請未通過，請聯絡系統管理員');
        if (u.IsActive === false) reject('帳號已停用');

        purgeSessions_();

        const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
        const expireAt = Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000;
        const sessionId = newSessionId_();
        const loginAt = now_();

        appendRow_(tbl_('Sessions'), {
            Token: token,
            LineUserId: u.LineUserId,
            ExpireAt: expireAt,
            CreatedAt: loginAt,
            SessionId: sessionId,
            UserName: u.Name,
            Device: device,
            LoginAt: loginAt,
            LastActiveAt: loginAt,
            ExpireAtText: fmtMs_(expireAt)
        });

        appendRow_(tbl_('LoginLog'), {
            SessionId: sessionId, LoginAt: loginAt, LineUserId: u.LineUserId, UserName: u.Name,
            Account: phone, Result: '成功', Device: device, UserAgent: userAgent, LastActiveAt: loginAt
        });

        // Session 被從試算表刪除時，仍能找到對應的登入歷程
        cachePut_('sid:' + token, sessionId, 21600);

        return {
            token,
            userId: u.LineUserId,
            name: u.Name,
            roleList: parsePerms_(u.RoleList),
            expireAt
        };
    });
}

function register_(req) {
    const d = req.data || {};
    const name = String(d.Name || '').trim();
    const phone = String(d.PhoneNumber || '').trim();
    const email = String(d.Email || '').trim();
    const password = String(d.PassWord || '');

    if (!name || !phone || !email || !password)
        fail_('[姓名、電子郵件、電話、密碼]必須填寫');

    return withLock_(() => {
        const users = tbl_('Users');
        const rows = readRows_(users);

        if (rows.some(x => String(x.obj.PhoneNumber).trim() === phone))
            fail_('⚠️ 此帳號已經有人建立過囉，如需修改請聯絡系統管理員');

        const isFirst = rows.length === 0;
        const birth = parseBirthday_(d.Birthday);

        const obj = {
            ID: nextSeq_(users),
            LineUserId: 'Web' + Utilities.getUuid().replace(/-/g, ''),
            Name: name,
            PhoneNumber: phone,
            Email: email,
            IdCardNumber: String(d.IdCardNumber || '').trim(),
            PassWord: hash_(password),
            BirthdayYear: birth.y,
            BirthdayMonth: birth.m,
            BirthdayDay: birth.d,
            RoleId: isFirst ? 6 : 1,
            RoleList: isFirst ? CONFIG.ADMIN_PERMISSIONS.join('|') : '',
            FavoriteFeaturesList: '',
            IsWeb: true,
            IsMember: true,
            IsBlocked: false,
            // 第一位使用者直接成為管理員；其他人需要系統管理員核准
            IsActive: isFirst,
            ApprovalStatus: isFirst ? '已核准' : '待審核',
            IsMailActive: false,
            IsPushMessage: toBool_(d.IsPushMessage),
            IsConverted: false,
            CreatedAt: now_(),
            UpdatedAt: now_()
        };

        appendRow_(users, obj);

        if (isFirst)
            return '🎉 建立成功，歡迎加入！（第一位使用者已自動設為系統管理員）';

        // 通知系統管理員（出現在首頁備忘錄）
        const memos = tbl_('Memos');
        appendRow_(memos, {
            ID: nextSeq_(memos),
            Title: '🆕 新帳號申請：' + name,
            Content: '電話 ' + phone + '　Email ' + email + '，請到「帳號審核與權限」核准並設定權限',
            Priority: '高',
            IsDone: false,
            IsShared: false,
            Audience: 'perm:' + PERM.SYSTEM,
            LinkType: 'approveUser',
            LinkId: obj.LineUserId,
            CreatedBy: 'SYSTEM',
            CreatedAt: now_()
        });

        return '📨 申請已送出，系統管理員核准後即可登入';
    });
}

function forgetPassword_(req) {
    const type = String(req.type || '');
    const v1 = String(req.value1 || '').trim();
    const v2 = String(req.value2 || '').trim();

    if (!v1 || !v2) fail_('請完整填寫驗證資料');

    const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

    const match = {
        phone_mail: u => eq(u.PhoneNumber, v1) && eq(u.Email, v2),
        phone_idcard: u => eq(u.PhoneNumber, v1) && eq(u.IdCardNumber, v2),
        idcard_mail: u => eq(u.IdCardNumber, v1) && eq(u.Email, v2)
    }[type];

    if (!match) fail_('驗證方式錯誤');

    return withLock_(() => {
        const users = tbl_('Users');
        const found = readRows_(users).find(x => match(x.obj));

        if (!found) fail_('查無符合資料');

        writeRow_(users, found, { PassWord: hash_(CONFIG.RESET_PASSWORD), UpdatedAt: now_() });
        uncacheUser_(found.obj.LineUserId);

        return "密碼已重設為 '" + CONFIG.RESET_PASSWORD + "' 請進入後更新密碼";
    });
}

// ============================================================
// Session
// ============================================================
function auth_(token) {
    if (!token) fail_('未登入', 'AUTH');

    // 每次都讀試算表（不快取），從 Sessions 分頁刪除後立即生效
    const t = tbl_('Sessions');
    const found = findRow_(t, token);

    if (!found) {
        const sid = cacheGet_('sid:' + token);

        if (sid) {
            cacheRemove_(['sid:' + token]);
            withLock_(() => endLoginLog_(sid, '管理員移除'));
        }

        fail_('登入已失效，請重新登入', 'AUTH');
    }

    const s = found.obj;
    const exp = Number(s.ExpireAt) || 0;

    if (exp < Date.now()) {
        withLock_(() => {
            const again = findRow_(t, token);
            if (again) {
                endLoginLog_(again.obj.SessionId, '逾時');
                t.sh.deleteRow(again.row);
            }
        });
        fail_('登入已超過 ' + CONFIG.SESSION_HOURS + ' 小時，請重新登入', 'AUTH');
    }

    touchSession_(t, token, s);

    const user = getUser_(s.LineUserId);

    if (!user) fail_('查無使用者，請重新登入', 'AUTH');
    if (user.IsActive === false) fail_('帳號已停用', 'AUTH');

    return {
        token,
        userId: user.LineUserId,
        user,
        perms: parsePerms_(user.RoleList),
        expireAt: exp
    };
}

// 更新最後活動時間（每 ACTIVE_UPDATE_MINUTES 分鐘最多寫一次）
function touchSession_(t, token, s) {
    if (cacheGet_('act:' + token)) return;

    cachePut_('act:' + token, 1, CONFIG.ACTIVE_UPDATE_MINUTES * 60);

    try {
        withLock_(() => {
            const found = findRow_(t, token);
            if (!found) return;

            const now = now_();
            const patch = { LastActiveAt: now };

            // 舊版登入沒有登入編號，補上
            if (!found.obj.SessionId) {
                patch.SessionId = newSessionId_();
                patch.LoginAt = found.obj.CreatedAt;
                patch.ExpireAtText = fmtMs_(Number(found.obj.ExpireAt) || 0);
                patch.UserName = (getUser_(found.obj.LineUserId) || {}).Name || '';
            }

            writeRow_(t, found, patch);

            const sid = found.obj.SessionId;
            const log = tbl_('LoginLog');
            const row = findRow_(log, sid);

            if (row && !row.obj.EndAt) writeRow_(log, row, { LastActiveAt: now });

            cachePut_('sid:' + token, sid, 21600);
        });
    } catch (e) {
        console.warn('更新最後活動時間失敗', e);
    }
}

// 登入結束：寫入結束時間、原因與使用分鐘數（登出以登出時間計，其他以最後活動時間計）
function endLoginLog_(sessionId, reason) {
    if (!sessionId) return;

    const log = tbl_('LoginLog');
    const row = findRow_(log, sessionId);

    if (!row || row.obj.EndAt) return;

    const now = now_();
    const last = reason === '登出' ? now : (row.obj.LastActiveAt || row.obj.LoginAt);
    const minutes = Math.round((parseTime_(last) - parseTime_(row.obj.LoginAt)) / 60000);

    writeRow_(log, row, {
        EndAt: now,
        EndReason: reason,
        LastActiveAt: last,
        UsedMinutes: isNaN(minutes) ? '' : Math.max(0, minutes)
    });
}

function purgeSessions_() {
    const t = tbl_('Sessions');
    const now = Date.now();

    readRows_(t)
        .filter(x => (Number(x.obj.ExpireAt) || 0) < now)
        .reverse()
        .slice(0, 100)
        .forEach(x => {
            endLoginLog_(x.obj.SessionId, '逾時');
            t.sh.deleteRow(x.row);
        });
}

// ---------- 登入紀錄（系統管理權限） ----------
function loginSessions_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    const now = Date.now();

    return readRows_(tbl_('Sessions'))
        .filter(x => (Number(x.obj.ExpireAt) || 0) >= now)
        .map(x => ({
            SessionId: x.obj.SessionId,
            LineUserId: x.obj.LineUserId,
            UserName: x.obj.UserName || (getUser_(x.obj.LineUserId) || {}).Name || '',
            Device: x.obj.Device,
            LoginAt: x.obj.LoginAt || x.obj.CreatedAt,
            LastActiveAt: x.obj.LastActiveAt,
            ExpireAt: Number(x.obj.ExpireAt) || 0,
            IsMe: x.obj.Token === ctx.token
        }))
        .sort((a, b) => String(b.LoginAt).localeCompare(String(a.LoginAt)));
}

function kickSession_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    const sid = String(req.sessionId || '');
    if (!sid) fail_('缺少登入編號');

    return withLock_(() => {
        const t = tbl_('Sessions');
        const found = readRows_(t).find(x => String(x.obj.SessionId) === sid);

        if (!found) fail_('此登入已經結束');
        if (found.obj.Token === ctx.token) fail_('不能強制登出自己，請直接按登出');

        endLoginLog_(sid, '強制登出（' + (ctx.user.Name || '') + '）');
        t.sh.deleteRow(found.row);
        cacheRemove_(['sid:' + found.obj.Token, 'act:' + found.obj.Token]);

        return true;
    });
}

function loginLog_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    const from = String(req.from || '');
    const to = req.to ? String(req.to) + ' 99' : '9999';

    return readRows_(tbl_('LoginLog'))
        .map(x => {
            const o = x.obj;
            delete o.UserAgent;
            return o;
        })
        .filter(o => (!from || String(o.LoginAt) >= from) && String(o.LoginAt) <= to)
        .sort((a, b) => String(b.LoginAt).localeCompare(String(a.LoginAt)))
        .slice(0, 3000);
}

function getUser_(userId) {
    const cached = cacheGet_('u:' + userId);
    if (cached) return cached;

    const found = findRow_(tbl_('Users'), userId);
    if (!found) return null;

    const u = publicObj_(tbl_('Users'), found.obj);
    cachePut_('u:' + userId, u, 30);

    return u;
}

function uncacheUser_(userId) {
    try {
        CacheService.getScriptCache().remove('u:' + userId);
    } catch (e) { }
}

function me_(req, ctx) {
    return { user: ctx.user, roleList: ctx.perms, expireAt: ctx.expireAt };
}

function logout_(req, ctx) {
    withLock_(() => {
        const t = tbl_('Sessions');
        const found = findRow_(t, ctx.token);
        if (found) {
            endLoginLog_(found.obj.SessionId, '登出');
            t.sh.deleteRow(found.row);
        }
    });

    cacheRemove_(['sid:' + ctx.token, 'act:' + ctx.token]);

    return true;
}

// ============================================================
// 通用 CRUD
// ============================================================
function list_(req, ctx) {
    const t = access_(req.table, ctx, 'read');
    const where = req.where || null;

    return readRows_(t)
        .map(x => publicObj_(t, x.obj))
        .filter(o => canSeeRow_(t, o, ctx))
        .filter(o => matchWhere_(o, where));
}

// 個人資料：本人、共享、通知對象或最高管理員才看得到
function canSeeRow_(t, o, ctx) {
    return !t.def.owner || isAdmin_(ctx) || o.CreatedBy === ctx.userId || o.IsShared === true || isAudience_(o, ctx);
}

function assertOwner_(t, o, ctx) {
    if (t.def.owner && !isAdmin_(ctx) && o.CreatedBy !== ctx.userId && !isAudience_(o, ctx))
        fail_('🔐 只能修改或刪除自己建立的資料');
}

// 系統通知：Audience = 'perm:3' → 有該權限的人
function isAudience_(o, ctx) {
    const m = String(o.Audience || '').match(/^perm:(\d+)$/);
    return !!m && hasPerm_(ctx, [Number(m[1])]);
}

function getMany_(req, ctx) {
    const out = {};

    // 沒有權限的資料表回傳 null，其餘照常回傳
    (req.tables || []).forEach(name => {
        try {
            out[name] = list_({ table: name }, ctx);
        } catch (e) {
            if (!e.userMessage) throw e;
            out[name] = null;
        }
    });

    return out;
}

function get_(req, ctx) {
    const t = access_(req.table, ctx, 'read');
    const found = findRow_(t, req.id);

    if (!found || !canSeeRow_(t, found.obj, ctx)) return null;

    return publicObj_(t, found.obj);
}

function insert_(req, ctx) {
    return withLock_(() => doInsert_(req.table, req.data || {}, ctx));
}

function update_(req, ctx) {
    return withLock_(() => doUpdate_(req.table, req.id, req.data || {}, ctx));
}

function remove_(req, ctx) {
    return withLock_(() => doRemove_(req.table, req.id, ctx));
}

function removeWhere_(req, ctx) {
    return withLock_(() => doRemoveWhere_(req.table, req.where, ctx, false));
}

/**
 * 一次執行多個操作（同一把鎖）
 * ops: [{ action: 'insert'|'update'|'remove'|'removeWhere', table, id, data, where }]
 * data / id 內可用 "$0.FormulaID" 取得第 0 個操作結果的欄位
 */
function batch_(req, ctx) {
    const ops = req.ops || [];

    return withLock_(() => {
        const results = [];

        ops.forEach(op => {
            const data = resolveRefs_(op.data || {}, results);
            const id = resolveRefs_(op.id, results);

            switch (op.action) {
                case 'insert': results.push(doInsert_(op.table, data, ctx)); break;
                case 'update': results.push(doUpdate_(op.table, id, data, ctx)); break;
                case 'remove': results.push(doRemove_(op.table, id, ctx)); break;
                // replace: true → 修改時整批替換明細，視為「修改」而非「刪除」
                case 'removeWhere': results.push(doRemoveWhere_(op.table, op.where, ctx, op.replace === true)); break;
                default: fail_('batch 不支援的操作：' + op.action);
            }
        });

        return results;
    });
}

function resolveRefs_(value, results) {
    if (typeof value === 'string') {
        const m = value.match(/^\$(\d+)\.(\w+)$/);
        if (m) {
            const r = results[Number(m[1])];
            return r ? r[m[2]] : null;
        }
        return value;
    }

    if (Array.isArray(value))
        return value.map(v => resolveRefs_(v, results));

    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach(k => out[k] = resolveRefs_(value[k], results));
        return out;
    }

    return value;
}

function doInsert_(name, data, ctx) {
    const t = access_(name, ctx, 'write');
    const obj = pickKnown_(t, data);

    if (HOOKS[name] && HOOKS[name].beforeInsert)
        HOOKS[name].beforeInsert(obj, ctx, t);

    if (t.seq)
        obj[t.seq] = nextSeq_(t);

    if (t.key && (obj[t.key] === undefined || obj[t.key] === null || obj[t.key] === ''))
        fail_('缺少主鍵：' + t.key);

    if (t.key !== t.seq && findRow_(t, obj[t.key]))
        fail_('資料已存在：' + obj[t.key]);

    stamp_(t, obj, ctx, true);
    appendRow_(t, obj);

    if (HOOKS[name] && HOOKS[name].afterWrite)
        HOOKS[name].afterWrite(obj, ctx);

    return publicObj_(t, obj);
}

function doUpdate_(name, id, data, ctx) {
    const t = access_(name, ctx, 'write');
    const found = findRow_(t, id);

    if (!found) fail_('找不到資料：' + id);

    assertOwner_(t, found.obj, ctx);

    const patch = pickKnown_(t, data);
    delete patch[t.key];
    if (t.seq) delete patch[t.seq];

    if (HOOKS[name] && HOOKS[name].beforeUpdate)
        HOOKS[name].beforeUpdate(patch, found.obj, ctx, t);

    stamp_(t, patch, ctx, false);
    writeRow_(t, found, patch);

    const merged = Object.assign({}, found.obj, patch);

    if (HOOKS[name] && HOOKS[name].afterWrite)
        HOOKS[name].afterWrite(merged, ctx);

    return publicObj_(t, normalizeObj_(t, merged));
}

function doRemove_(name, id, ctx) {
    const t = access_(name, ctx, 'delete');
    const found = findRow_(t, id);

    if (!found) fail_('找不到資料：' + id);

    assertOwner_(t, found.obj, ctx);

    if (HOOKS[name] && HOOKS[name].beforeRemove)
        HOOKS[name].beforeRemove(found.obj, ctx);

    t.sh.deleteRow(found.row);

    if (HOOKS[name] && HOOKS[name].afterWrite)
        HOOKS[name].afterWrite(found.obj, ctx);

    return true;
}

function doRemoveWhere_(name, where, ctx, isReplace) {
    const t = access_(name, ctx, isReplace ? 'write' : 'delete');

    if (!where || !Object.keys(where).length)
        fail_('removeWhere 必須指定條件');

    const rows = readRows_(t).filter(x => matchWhere_(x.obj, where));

    rows.forEach(x => assertOwner_(t, x.obj, ctx));

    rows.reverse().forEach(x => t.sh.deleteRow(x.row));

    return rows.length;
}

// ============================================================
// 資料表特殊邏輯
// ============================================================
const HOOKS = {
    Users: {
        beforeInsert(obj, ctx, t) {
            if (!obj.LineUserId)
                obj.LineUserId = 'Web' + Utilities.getUuid().replace(/-/g, '');

            assertPhoneUnique_(obj.PhoneNumber, null);

            obj.PassWord = obj.PassWord ? hash_(String(obj.PassWord)) : '';

            assertRoleChange_(ctx, '', obj.RoleList);

            // 管理員新增的帳號直接核准
            if (!obj.ApprovalStatus) obj.ApprovalStatus = '已核准';

            const defaults = {
                RoleId: 1, RoleList: '', FavoriteFeaturesList: '', IsWeb: true, IsMember: true, IsBlocked: false,
                IsActive: true, IsMailActive: false, IsPushMessage: false, IsConverted: false
            };

            Object.keys(defaults).forEach(k => {
                if (obj[k] === undefined || obj[k] === '') obj[k] = defaults[k];
            });
        },

        beforeUpdate(patch, old, ctx) {
            if (patch.RoleList !== undefined) assertRoleChange_(ctx, old.RoleList, patch.RoleList, old.LineUserId);

            if (patch.PassWord)
                patch.PassWord = hash_(String(patch.PassWord));
            else
                delete patch.PassWord;

            if (patch.PhoneNumber !== undefined && String(patch.PhoneNumber).trim() !== String(old.PhoneNumber).trim())
                assertPhoneUnique_(patch.PhoneNumber, old.LineUserId);
        },

        afterWrite(obj) {
            uncacheUser_(obj.LineUserId);
        }
    }
};

// 權限變更檢查：
//   - 只有最高管理員（13）可以授予或移除「最高管理員」
//   - 不能移除自己的系統管理 / 最高管理員權限（避免把自己鎖在外面）
function assertRoleChange_(ctx, oldList, newList, targetUserId) {
    const before = parsePerms_(oldList);
    const after = parsePerms_(newList);
    const changed13 = (before.indexOf(PERM.ADMIN) >= 0) !== (after.indexOf(PERM.ADMIN) >= 0);

    if (changed13 && !isAdmin_(ctx))
        fail_('🔐 只有最高系統管理員可以授予或移除「最高系統管理員」權限');

    if (ctx && targetUserId === ctx.userId) {
        const lost = [PERM.ADMIN, PERM.SYSTEM].filter(p => before.indexOf(p) >= 0 && after.indexOf(p) < 0);
        if (lost.length) fail_('不能移除自己的管理權限，請由其他管理員操作');
    }
}

// ============================================================
// 帳號審核與權限（系統管理權限）
// ============================================================
function accessList_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    return readRows_(tbl_('Users')).map(x => {
        const u = x.obj;
        return {
            LineUserId: u.LineUserId,
            ID: u.ID,
            Name: u.Name,
            PhoneNumber: u.PhoneNumber,
            Email: u.Email,
            RoleList: parsePerms_(u.RoleList),
            IsActive: u.IsActive !== false,
            ApprovalStatus: u.ApprovalStatus || '已核准',
            ApprovedBy: u.ApprovedBy,
            ApprovedAt: u.ApprovedAt,
            CreatedAt: u.CreatedAt,
            IsMe: u.LineUserId === ctx.userId
        };
    });
}

// changes: [{ userId, roleList: [..], isActive }]
function setUserAccess_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    const changes = req.changes || [];
    if (!changes.length) fail_('沒有要儲存的變更');

    return withLock_(() => {
        const t = tbl_('Users');
        let count = 0;

        changes.forEach(c => {
            const found = findRow_(t, c.userId);
            if (!found) fail_('找不到帳號：' + c.userId);

            const patch = {};

            if (Array.isArray(c.roleList)) {
                const list = c.roleList.map(Number).filter(n => !isNaN(n) && n > 0);
                const text = list.filter((n, i) => list.indexOf(n) === i).sort((a, b) => a - b).join('|');
                assertRoleChange_(ctx, found.obj.RoleList, text, found.obj.LineUserId);
                patch.RoleList = text;
            }

            if (typeof c.isActive === 'boolean') {
                if (!c.isActive && found.obj.LineUserId === ctx.userId) fail_('不能停用自己的帳號');
                patch.IsActive = c.isActive;
            }

            patch.UpdatedAt = now_();
            patch.UpdateLineUserId = ctx.userId;

            writeRow_(t, found, patch);
            uncacheUser_(found.obj.LineUserId);
            count++;
        });

        return count;
    });
}

// 核准 / 拒絕新帳號：{ userId, approve: true/false, roleList: [...] }
function approveUser_(req, ctx) {
    requirePerm_(ctx, [PERM.SYSTEM]);

    return withLock_(() => {
        const t = tbl_('Users');
        const found = findRow_(t, req.userId);

        if (!found) fail_('找不到帳號');

        const approve = req.approve !== false;
        const patch = {
            ApprovalStatus: approve ? '已核准' : '已拒絕',
            IsActive: approve,
            ApprovedBy: ctx.user.Name || ctx.userId,
            ApprovedAt: now_(),
            UpdatedAt: now_(),
            UpdateLineUserId: ctx.userId
        };

        if (approve && Array.isArray(req.roleList)) {
            const text = req.roleList.map(Number).filter(n => n > 0).join('|');
            assertRoleChange_(ctx, found.obj.RoleList, text, found.obj.LineUserId);
            patch.RoleList = text;
        }

        writeRow_(t, found, patch);
        uncacheUser_(found.obj.LineUserId);

        // 相關通知標記為已完成
        const memos = tbl_('Memos');
        readRows_(memos)
            .filter(x => x.obj.LinkType === 'approveUser' && x.obj.LinkId === found.obj.LineUserId && x.obj.IsDone !== true)
            .forEach(x => writeRow_(memos, x, {
                IsDone: true,
                Content: (x.obj.Content || '') + '\n→ ' + patch.ApprovalStatus + '（' + patch.ApprovedBy + '，' + patch.ApprovedAt + '）',
                UpdatedAt: now_(),
                UpdatedBy: ctx.userId
            }));

        return patch.ApprovalStatus;
    });
}

function assertPhoneUnique_(phone, exceptUserId) {
    phone = String(phone || '').trim();
    if (!phone) return;

    const dup = readRows_(tbl_('Users')).some(x =>
        String(x.obj.PhoneNumber).trim() === phone && x.obj.LineUserId !== exceptUserId);

    if (dup) fail_('此電話已被其他帳號使用：' + phone);
}

// ============================================================
// 個人帳號功能
// ============================================================
function updateProfile_(req, ctx) {
    const d = req.data || {};
    const allowed = ['Name', 'PhoneNumber', 'Email', 'IdCardNumber', 'BirthdayYear', 'BirthdayMonth', 'BirthdayDay', 'IsPushMessage'];
    const patch = {};

    allowed.forEach(k => {
        if (d[k] !== undefined) patch[k] = d[k];
    });

    return withLock_(() => {
        const t = tbl_('Users');
        const found = findRow_(t, ctx.userId);

        if (!found) fail_('查無使用者');

        if (patch.PhoneNumber !== undefined && String(patch.PhoneNumber).trim() !== String(found.obj.PhoneNumber).trim())
            assertPhoneUnique_(patch.PhoneNumber, ctx.userId);

        stamp_(t, patch, ctx, false);
        writeRow_(t, found, patch);
        uncacheUser_(ctx.userId);

        return '會員資料修改成功';
    });
}

function changePassword_(req, ctx) {
    const oldPw = String(req.oldPassword || '');
    const newPw = String(req.newPassword || '');

    if (!oldPw || !newPw) fail_('請完整輸入');
    if (newPw.length < 4) fail_('密碼至少需要4碼');

    return withLock_(() => {
        const t = tbl_('Users');
        const found = findRow_(t, ctx.userId);

        if (!found) fail_('查無使用者');
        if (found.obj.PassWord !== hash_(oldPw)) fail_('❌ 目前密碼錯誤');

        writeRow_(t, found, { PassWord: hash_(newPw), UpdatedAt: now_(), UpdateLineUserId: ctx.userId });

        return '密碼修改成功';
    });
}

function setFavorite_(req, ctx) {
    const id = String(req.id || '').trim();
    const add = req.add !== false;

    if (!id) fail_('缺少功能ID');

    return withLock_(() => {
        const t = tbl_('Users');
        const found = findRow_(t, ctx.userId);

        if (!found) fail_('查無使用者');

        let list = String(found.obj.FavoriteFeaturesList || '')
            .split('|').map(x => x.trim()).filter(Boolean);

        list = list.filter(x => x !== id);
        if (add) list.push(id);

        writeRow_(t, found, { FavoriteFeaturesList: list.join('|') });
        uncacheUser_(ctx.userId);

        return list.map(Number).filter(x => !isNaN(x));
    });
}

// ============================================================
// 寄信（Gmail / MailApp）
// ============================================================
function sendMail_(req, ctx) {
    requirePerm_(ctx, CONFIG.MAIL_PERMISSIONS);

    const to = (req.to || []).map(x => String(x).trim()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    const subject = String(req.subject || '').trim();
    const body = String(req.body || '');

    if (!to.length) fail_('請新增收件人');
    if (!subject) fail_('請輸入主旨');
    if (!body) fail_('請輸入內容');

    const attachments = (req.attachments || []).map(a =>
        Utilities.newBlob(Utilities.base64Decode(a.base64), a.mimeType || 'application/octet-stream', a.name || 'file'));

    MailApp.sendEmail({
        to: to.join(','),
        subject,
        body,
        name: CONFIG.APP_NAME,
        attachments
    });

    withLock_(() => appendRow_(tbl_('MailLog'), {
        ID: nextSeq_(tbl_('MailLog')),
        Subject: subject,
        Recipients: to.join('|'),
        Attachments: (req.attachments || []).map(a => a.name).join('|'),
        SentBy: ctx.userId,
        CreatedAt: now_()
    }));

    return { remainingQuota: MailApp.getRemainingDailyQuota() };
}

// ============================================================
// AI 助理（Gemini）
// 在「專案設定 → 指令碼屬性」新增 GEMINI_API_KEY（可選 GEMINI_MODEL）
// ============================================================
function aiChat_(req, ctx) {
    const contents = (req.messages || [])
        .slice(-20)
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(m.text || '').slice(0, 5000) }]
        }))
        .filter(m => m.parts[0].text);

    if (!contents.length) fail_('請輸入訊息');

    return callGemini_('你是「' + CONFIG.APP_NAME + '」的智能助理，使用繁體中文回答，回答要簡潔實用。', contents);
}

// AI 文案：前端組好需求，伺服器加上品牌設定後呼叫 Gemini
function aiGenerate_(req, ctx) {
    requirePerm_(ctx, CONFIG.AI_PERMISSIONS);

    const prompt = String(req.prompt || '').trim().slice(0, 8000);
    if (!prompt) fail_('請輸入文案需求');

    const system = [
        '你是台灣甜點品牌「瘋菓」的社群小編與文案企劃，使用繁體中文（台灣用語）。',
        '瘋菓主打手作冰淇淋、機能冰品與鯛魚燒，常在各地市集擺攤。',
        '寫作要自然、有溫度、具體，不要空泛形容詞堆疊；不要捏造未提供的價格、日期或優惠。',
        String(req.system || '').slice(0, 2000)
    ].join('\n');

    return callGemini_(system, [{ role: 'user', parts: [{ text: prompt }] }]);
}

function callGemini_(system, contents) {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('GEMINI_API_KEY');

    if (!key) fail_('尚未設定 GEMINI_API_KEY（Apps Script 專案設定 → 指令碼屬性）');

    const model = props.getProperty('GEMINI_MODEL') || CONFIG.AI_MODEL_DEFAULT;

    const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
        {
            method: 'post',
            contentType: 'application/json',
            headers: { 'x-goog-api-key': key },
            muteHttpExceptions: true,
            payload: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents
            })
        });

    const body = JSON.parse(res.getContentText() || '{}');

    if (res.getResponseCode() !== 200)
        fail_('AI 服務錯誤：' + ((body.error && body.error.message) || res.getResponseCode()));

    const parts = (((body.candidates || [])[0] || {}).content || {}).parts || [];

    return parts.map(p => p.text || '').join('').trim() || '（AI 沒有回應內容）';
}

// ============================================================
// 工作表存取
// ============================================================
const TABLES_ = {};

function tbl_(name) {
    if (TABLES_[name]) return TABLES_[name];

    const def = SCHEMA[name];
    if (!def) fail_('未知的資料表：' + name);

    const cols = def.cols.split(/\s+/).filter(String).map(s => {
        const p = s.split(':');
        return { name: p[0], type: p[1] || 's' };
    });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);

    const lastCol = sh.getLastColumn();
    let headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim()) : [];

    const missing = cols.filter(c => headers.indexOf(c.name) < 0);

    if (missing.length) {
        const need = headers.length + missing.length;

        if (sh.getMaxColumns() < need)
            sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());

        const start = headers.length + 1;

        sh.getRange(1, start, 1, missing.length)
            .setValues([missing.map(c => c.name)])
            .setFontWeight('bold');

        missing.forEach((c, i) => {
            if (c.type === 's' && sh.getMaxRows() > 1)
                sh.getRange(2, start + i, sh.getMaxRows() - 1, 1).setNumberFormat('@');
        });

        headers = headers.concat(missing.map(c => c.name));

        if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
    }

    const types = {};
    cols.forEach(c => types[c.name] = c.type);

    const textCols = headers
        .map((h, i) => ((types[h] || 's') === 's' ? colLetter_(i + 1) : null))
        .filter(Boolean);

    const t = { name, def, sh, headers, types, textCols, key: def.key, seq: def.seq };
    TABLES_[name] = t;

    return t;
}

function readRows_(t) {
    const last = t.sh.getLastRow();
    if (last < 2) return [];

    const values = t.sh.getRange(2, 1, last - 1, t.headers.length).getValues();
    const out = [];

    for (let i = 0; i < values.length; i++) {
        const r = values[i];
        if (r.every(v => v === '' || v === null)) continue;
        out.push({ row: i + 2, raw: r, obj: rowToObj_(t, r) });
    }

    return out;
}

function findRow_(t, id) {
    if (id === undefined || id === null || id === '') return null;

    const last = t.sh.getLastRow();
    if (last < 2) return null;

    const kc = t.headers.indexOf(t.key) + 1;
    const keys = t.sh.getRange(2, kc, last - 1, 1).getValues();
    const sid = String(id).trim();

    for (let i = 0; i < keys.length; i++) {
        const v = keys[i][0];
        const s = v instanceof Date ? fmtDate_(v) : String(v).trim();

        if (s === sid) {
            const row = i + 2;
            const raw = t.sh.getRange(row, 1, 1, t.headers.length).getValues()[0];
            return { row, raw, obj: rowToObj_(t, raw) };
        }
    }

    return null;
}

function appendRow_(t, obj) {
    const sh = t.sh;
    const row = sh.getLastRow() + 1;

    if (row > sh.getMaxRows()) {
        sh.insertRowsAfter(sh.getMaxRows(), 100);
        t.headers.forEach((h, i) => {
            if ((t.types[h] || 's') === 's')
                sh.getRange(row, i + 1, 100, 1).setNumberFormat('@');
        });
    }

    const cells = t.headers.map(h => (h in obj ? toCell_(obj[h], t.types[h] || 's') : ''));

    formatTextCells_(t, row);
    sh.getRange(row, 1, 1, cells.length).setValues([cells]);

    return row;
}

function writeRow_(t, found, patch) {
    const raw = found.raw.slice();

    Object.keys(patch).forEach(k => {
        const j = t.headers.indexOf(k);
        if (j >= 0) raw[j] = toCell_(patch[k], t.types[k] || 's');
    });

    formatTextCells_(t, found.row);
    t.sh.getRange(found.row, 1, 1, raw.length).setValues([raw]);

    found.raw = raw;
    found.obj = rowToObj_(t, raw);
}

function formatTextCells_(t, row) {
    if (!t.textCols.length) return;
    t.sh.getRangeList(t.textCols.map(c => c + row)).setNumberFormat('@');
}

function nextSeq_(t) {
    const last = t.sh.getLastRow();
    if (last < 2) return 1;

    const c = t.headers.indexOf(t.seq) + 1;
    const max = t.sh.getRange(2, c, last - 1, 1).getValues()
        .reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);

    return max + 1;
}

function rowToObj_(t, r) {
    const o = {};

    t.headers.forEach((h, j) => {
        if (h) o[h] = fromCell_(r[j], t.types[h] || 's');
    });

    return o;
}

function normalizeObj_(t, o) {
    const out = {};

    Object.keys(o).forEach(k => {
        out[k] = fromCell_(toCell_(o[k], t.types[k] || 's'), t.types[k] || 's');
    });

    return out;
}

function pickKnown_(t, data) {
    const o = {};

    Object.keys(data || {}).forEach(k => {
        if (t.headers.indexOf(k) >= 0 && data[k] !== undefined) o[k] = data[k];
    });

    return o;
}

function publicObj_(t, o) {
    const out = Object.assign({}, o);
    (t.def.hidden || []).forEach(h => delete out[h]);
    return out;
}

function stamp_(t, obj, ctx, isInsert) {
    const has = c => t.headers.indexOf(c) >= 0;
    const ts = now_();
    const uid = ctx ? ctx.userId : '';

    if (isInsert) {
        CREATED_AT_COLS.forEach(c => { if (has(c) && !obj[c]) obj[c] = ts; });
        CREATED_BY_COLS.forEach(c => { if (has(c) && !obj[c]) obj[c] = uid; });
    }

    UPDATED_AT_COLS.forEach(c => { if (has(c)) obj[c] = ts; });
    UPDATED_BY_COLS.forEach(c => { if (has(c)) obj[c] = uid; });
}

function access_(name, ctx, mode) {
    const def = SCHEMA[name];

    if (!def || def.internal) fail_('無法存取資料表：' + name);

    const t = tbl_(name);

    if (isAdmin_(ctx)) return t;

    const rule = TABLE_PERMS[name] || {};
    const allowed = list => list === 'all' || (Array.isArray(list) && hasPerm_(ctx, list));

    if (mode === 'read') {
        if (!allowed(rule.read === undefined ? 'all' : rule.read))
            fail_('🔐 無權限讀取：' + name);
        return t;
    }

    // 以下為新增 / 修改 / 刪除
    if (ctx.perms.indexOf(PERM.READONLY) >= 0 && !def.owner)
        fail_('🔐 唯讀帳號無法修改資料');

    if (!allowed(rule.write))
        fail_('🔐 無權限修改：' + name);

    // 刪除需要「刪除資料」權限（個人資料刪除自己的除外）
    if (mode === 'delete' && !def.owner && ctx.perms.indexOf(PERM.DELETE) < 0)
        fail_('🔐 刪除資料需要「刪除資料」權限');

    return t;
}

function isAdmin_(ctx) {
    return !!ctx && ctx.perms.indexOf(PERM.ADMIN) >= 0;
}

// ============================================================
// 工具
// ============================================================
function fromCell_(v, type) {
    if (v instanceof Date) v = fmtDate_(v);

    if (type === 'n') {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
    }

    // 布林空白 = null（未設定），避免把未填寫的「啟用」誤判為停用
    if (type === 'b') return v === '' || v === null || v === undefined ? null : toBool_(v);

    return v === null || v === undefined ? '' : String(v);
}

function toCell_(v, type) {
    if (v === undefined || v === null) return '';

    if (type === 'n') {
        if (v === '') return '';
        const n = Number(String(v).replace(/,/g, ''));
        return isNaN(n) ? '' : n;
    }

    if (type === 'b') return v === '' ? '' : toBool_(v);

    return String(v);
}

function toBool_(v) {
    if (v === true) return true;
    if (v === false || v === null || v === undefined) return false;
    return /^(true|1|是|y|yes|啟用|開啟|✔)$/i.test(String(v).trim());
}

function matchWhere_(o, where) {
    if (!where) return true;
    return Object.keys(where).every(k => String(o[k]) === String(where[k]));
}

function parsePerms_(text) {
    return String(text || '')
        .split(/[|,、]/)
        .map(x => Number(String(x).trim()))
        .filter(x => !isNaN(x) && String(x) !== '0');
}

function hasPerm_(ctx, list) {
    return isAdmin_(ctx) || list.some(p => ctx.perms.indexOf(p) >= 0);
}

function requirePerm_(ctx, list) {
    if (!hasPerm_(ctx, list)) fail_('🔐 無網站權限，請聯繫系統管理員');
}

function parseBirthday_(text) {
    const p = String(text || '').split(/[-/]/).map(x => parseInt(x, 10));
    return {
        y: p[0] > 0 ? p[0] : '',
        m: p[1] > 0 ? p[1] : '',
        d: p[2] > 0 ? p[2] : ''
    };
}

function hash_(text) {
    const bytes = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_512,
        text + CONFIG.PASSWORD_SALT,
        Utilities.Charset.UTF_8);

    return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function newSessionId_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss') + '-' +
        Utilities.getUuid().slice(0, 4).toUpperCase();
}

function fmtMs_(ms) {
    return ms ? Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : '';
}

// 'yyyy-MM-dd HH:mm(:ss)' → 毫秒
function parseTime_(text) {
    const s = String(text || '').trim();
    if (!s) return NaN;

    try {
        return Utilities.parseDate(s, Session.getScriptTimeZone(),
            s.length > 16 ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm').getTime();
    } catch (e) {
        return NaN;
    }
}

function clip_(v, n) {
    return String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

function now_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function fmtDate_(d) {
    const tz = Session.getScriptTimeZone();
    const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
    return Utilities.formatDate(d, tz, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
}

function colLetter_(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function withLock_(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
        return fn();
    } finally {
        SpreadsheetApp.flush();
        lock.releaseLock();
    }
}

function cacheGet_(key) {
    try {
        const v = CacheService.getScriptCache().get(key);
        return v ? JSON.parse(v) : null;
    } catch (e) {
        return null;
    }
}

function cachePut_(key, value, seconds) {
    try {
        CacheService.getScriptCache().put(key, JSON.stringify(value), seconds);
    } catch (e) { }
}

function cacheRemove_(keys) {
    try {
        CacheService.getScriptCache().removeAll(keys);
    } catch (e) { }
}

function fail_(message, code) {
    const e = new Error(message);
    e.userMessage = true;
    e.code = code || '';
    throw e;
}

function json_(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
