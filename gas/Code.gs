/**
 * ============================================================
 * 瘋菓內部管理系統 — Google 試算表資料庫（Google Apps Script）
 * ============================================================
 * 部署步驟請見 WEB_GS/README.md
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
    SESSION_HOURS: 10,                 // 登入有效時間（有操作會自動延長）
    PASSWORD_SALT: 'ABC123',           // 與舊系統相同，舊資料的密碼雜湊可直接沿用
    RESET_PASSWORD: 'Fonegle',         // 忘記密碼時重設成的密碼
    ADMIN_PERMISSIONS: [1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15], // 第一位註冊者自動取得
    MAIL_PERMISSIONS: [3],
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
// ============================================================
const SCHEMA = {
    Users: {
        key: 'LineUserId', seq: 'ID', hidden: ['PassWord'],
        cols: 'ID:n LineUserId Name PhoneNumber Email IdCardNumber PassWord BirthdayYear:n BirthdayMonth:n BirthdayDay:n ' +
            'RoleId:n RoleList FavoriteFeaturesList AccountManager IsWeb:b IsMember:b IsBlocked:b IsActive:b ' +
            'IsMailActive:b IsPushMessage:b IsConverted:b OpenClaw OpenClawAgent ' +
            'CreatedAt UpdatedAt UpdateLineUserId'
    },
    Sessions: { key: 'Token', internal: true, cols: 'Token LineUserId ExpireAt:n CreatedAt' },
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
            'PaymentStstus:n IsMember:b IsConverted:b AccountManager TotalVisit:n TotalMail:n Source Note OpenClaw CreateLineID CreatedAt UpdateAt'
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
            'OrderDate CheckoutAt ExpectedShippingDate CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Shipment: {
        key: 'ShipmentID', seq: 'ShipmentID',
        cols: 'ShipmentID:n ShipmentNo OrderID ProductID BatchNo LogisticsCompany TrackingNumber ReceiverName ReceiverPhone ReceiverAddress ' +
            'ShippingQty:n Unit ShippingDate ReceivedDate ShippingStatus Note CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Receivable: {
        key: 'ReceivableID', seq: 'ReceivableID',
        cols: 'ReceivableID:n OrderID MemberID PayerName PaymentMethod PaymentStatus TransactionNo InvoiceNo Amount:n DiscountAmount:n ' +
            'TaxAmount:n RefundAmount:n PaymentDate RefundDate Note CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    ProductionLog: {
        key: 'ProductionID', seq: 'ProductionID',
        cols: 'ProductionID:n ProductID FormulaID BatchNo ProductionNo Factory ProductionLine PlannedQty:n ProducedQty:n NGQty:n Unit ' +
            'OperatorName SupervisorName StartTime EndTime MfgDate ExpDate Status Description Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    Formula: {
        key: 'FormulaID', seq: 'FormulaID',
        cols: 'FormulaID:n FormulaCode ProductID FormulaName VersionNo YieldQty:n YieldUnit IsActive:b Description Remark ' +
            'CreatedBy CreatedAt UpdatedBy UpdatedAt'
    },
    FormulaDetail: {
        key: 'FormulaDetailID', seq: 'FormulaDetailID',
        cols: 'FormulaDetailID:n FormulaID:n MaterialID MaterialCode MaterialName Quantity:n Unit Remark CreatedBy CreatedAt UpdatedBy UpdatedAt'
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

// 修改（新增/修改/刪除）需要的權限，沒列出的資料表不可修改
const WRITE_PERMS = {
    Users: [3, 13],
    ID_UserRoles: [3, 13],
    ID_Permission: [3, 13],
    Calendar: [10, 11, 13],
    CalendarDays: [10, 11, 13],
    StallRecords: [3, 10, 13],
    BrandCosts: [3, 10, 13],
    Companies: [3, 13],
    CrawlerSources: [3, 6, 13],
    ID_Category: [3, 6],
    Products: [3, 6],
    Material: [3, 6],
    Inventory: [3, 6],
    Orders: [3, 6],
    Shipment: [3, 6],
    Receivable: [3, 6],
    ProductionLog: [3, 6],
    Formula: [3, 6],
    FormulaDetail: [3, 6],
    AgentConfig: [3, 6, 8, 9, 13],
    ID_AgentTool: [3, 6, 8, 9, 13],
    AgentToolPermissions: [3, 6, 8, 9, 13],
    MarketOrders: [3, 10, 13]
};

// 讀取需要的權限（沒列出 = 登入即可讀取）
const READ_PERMS = {
    Users: [3, 6, 8, 9, 13]
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
    aiChat: aiChat_
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
    ]);

    // 美化：表頭樣式、凍結首列、欄寬、金額格式
    Object.keys(SCHEMA).forEach(name => styleSheet_(tbl_(name)));

    // 移除預設的空白工作表
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheets().forEach(sh => {
        if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1)
            ss.deleteSheet(sh);
    });

    return '初始化完成';
}

function styleSheet_(t) {
    const sh = t.sh;
    const width = t.headers.length;

    sh.getRange(1, 1, 1, width)
        .setFontWeight('bold')
        .setFontColor('#ffffff')
        .setBackground('#4d341c');

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

// ============================================================
// 登入 / 註冊 / 忘記密碼
// ============================================================
function login_(req) {
    const phone = String(req.phone || '').trim();
    const password = String(req.password || '');

    if (!phone || !password)
        fail_('請輸入電話與密碼');

    return withLock_(() => {
        const users = tbl_('Users');
        const found = readRows_(users).find(x => String(x.obj.PhoneNumber).trim() === phone);

        if (!found) fail_('帳號不存在');

        const u = found.obj;

        if (!u.PassWord) fail_('帳號資料異常');
        if (u.PassWord !== hash_(password)) fail_('密碼錯誤');
        if (u.IsActive === false) fail_('帳號已停用');

        purgeSessions_();

        const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
        const expireAt = Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000;

        appendRow_(tbl_('Sessions'), {
            Token: token,
            LineUserId: u.LineUserId,
            ExpireAt: expireAt,
            CreatedAt: now_()
        });

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
            IsActive: true,
            IsMailActive: false,
            IsPushMessage: toBool_(d.IsPushMessage),
            IsConverted: false,
            CreatedAt: now_(),
            UpdatedAt: now_()
        };

        appendRow_(users, obj);

        return isFirst
            ? '🎉 建立成功，歡迎加入！（第一位使用者已自動設為系統管理員）'
            : '🎉 建立成功，歡迎加入！';
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

    const sessionMs = CONFIG.SESSION_HOURS * 3600 * 1000;
    let sess = cacheGet_('s:' + token);

    if (!sess) {
        const found = findRow_(tbl_('Sessions'), token);

        if (!found) fail_('登入已失效，請重新登入', 'AUTH');

        sess = { userId: found.obj.LineUserId, exp: Number(found.obj.ExpireAt) || 0 };
    }

    if (sess.exp < Date.now())
        fail_('登入已逾時，請重新登入', 'AUTH');

    // 滑動延長
    if (sess.exp - Date.now() < sessionMs / 2) {
        sess.exp = Date.now() + sessionMs;

        withLock_(() => {
            const t = tbl_('Sessions');
            const found = findRow_(t, token);
            if (found) writeRow_(t, found, { ExpireAt: sess.exp });
        });
    }

    cachePut_('s:' + token, sess, 600);

    const user = getUser_(sess.userId);

    if (!user) fail_('查無使用者，請重新登入', 'AUTH');
    if (user.IsActive === false) fail_('帳號已停用', 'AUTH');

    return {
        token,
        userId: user.LineUserId,
        user,
        perms: parsePerms_(user.RoleList)
    };
}

function purgeSessions_() {
    const t = tbl_('Sessions');
    const now = Date.now();

    readRows_(t)
        .filter(x => (Number(x.obj.ExpireAt) || 0) < now)
        .reverse()
        .slice(0, 100)
        .forEach(x => t.sh.deleteRow(x.row));
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
    return { user: ctx.user, roleList: ctx.perms };
}

function logout_(req, ctx) {
    withLock_(() => {
        const t = tbl_('Sessions');
        const found = findRow_(t, ctx.token);
        if (found) t.sh.deleteRow(found.row);
    });

    try {
        CacheService.getScriptCache().remove('s:' + ctx.token);
    } catch (e) { }

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
        .filter(o => matchWhere_(o, where));
}

function getMany_(req, ctx) {
    const out = {};

    (req.tables || []).forEach(name => {
        out[name] = list_({ table: name }, ctx);
    });

    return out;
}

function get_(req, ctx) {
    const t = access_(req.table, ctx, 'read');
    const found = findRow_(t, req.id);

    return found ? publicObj_(t, found.obj) : null;
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
    return withLock_(() => doRemoveWhere_(req.table, req.where, ctx));
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
                case 'removeWhere': results.push(doRemoveWhere_(op.table, op.where, ctx)); break;
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
    const t = access_(name, ctx, 'write');
    const found = findRow_(t, id);

    if (!found) fail_('找不到資料：' + id);

    if (HOOKS[name] && HOOKS[name].beforeRemove)
        HOOKS[name].beforeRemove(found.obj, ctx);

    t.sh.deleteRow(found.row);

    if (HOOKS[name] && HOOKS[name].afterWrite)
        HOOKS[name].afterWrite(found.obj, ctx);

    return true;
}

function doRemoveWhere_(name, where, ctx) {
    const t = access_(name, ctx, 'write');

    if (!where || !Object.keys(where).length)
        fail_('removeWhere 必須指定條件');

    const rows = readRows_(t).filter(x => matchWhere_(x.obj, where));

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

            const defaults = {
                RoleId: 1, RoleList: '', FavoriteFeaturesList: '', IsWeb: true, IsMember: true, IsBlocked: false,
                IsActive: true, IsMailActive: false, IsPushMessage: false, IsConverted: false
            };

            Object.keys(defaults).forEach(k => {
                if (obj[k] === undefined || obj[k] === '') obj[k] = defaults[k];
            });
        },

        beforeUpdate(patch, old, ctx) {
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
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('GEMINI_API_KEY');

    if (!key) fail_('尚未設定 GEMINI_API_KEY（Apps Script 專案設定 → 指令碼屬性）');

    const model = props.getProperty('GEMINI_MODEL') || CONFIG.AI_MODEL_DEFAULT;

    const contents = (req.messages || [])
        .slice(-20)
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(m.text || '').slice(0, 5000) }]
        }))
        .filter(m => m.parts[0].text);

    if (!contents.length) fail_('請輸入訊息');

    const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
        {
            method: 'post',
            contentType: 'application/json',
            headers: { 'x-goog-api-key': key },
            muteHttpExceptions: true,
            payload: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: '你是「' + CONFIG.APP_NAME + '」的智能助理，使用繁體中文回答，回答要簡潔實用。' }]
                },
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

    if (mode === 'read' && READ_PERMS[name] && !hasPerm_(ctx, READ_PERMS[name]))
        fail_('🔐 無權限讀取：' + name);

    if (mode === 'write' && !(WRITE_PERMS[name] && hasPerm_(ctx, WRITE_PERMS[name])))
        fail_('🔐 無權限修改：' + name);

    return tbl_(name);
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
    return list.some(p => ctx.perms.indexOf(p) >= 0);
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
