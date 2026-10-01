// =========================================================
// 系統設定
// =========================================================
window.APP_SETTINGS = {

    // Apps Script「部署為網頁應用程式」後取得的網址（結尾是 /exec）
    // 所有使用者都會套用；管理員可在「系統權限資料管理 → 連線設定」
    // 對自己的瀏覽器暫時改用其他網址（例如測試新版部署）
    GAS_URL: "https://script.google.com/macros/s/AKfycbx2p0uqxtTvViYa7sSbdgc4Upo4RQvdxeSBa1orwd80FTlBjDoqUqa__Y2lV1d3l5ZHgg/exec",

    // 公司資料的預設值（中性，不含任何公司資料）：還沒到「系統 → 公司與功能設定」填寫時使用。
    // 實際的公司名稱、統編、聯絡方式請登入後在設定頁填寫，會存在你自己的 Google 試算表（Settings 分頁）。
    COMPANY_DEFAULTS: {
        appName: "內部管理系統",
        brandShort: "",
        brandName: "",
        brandSub: "",
        companyName: "",
        taxId: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        lineId: "",
        lineUrl: "",
        instagramUrl: "",
        website: "",
        linkTreeUrl: "",
        bannerUrl: "",
        reportFooter: "",
        aiBrandIntro: ""
    },

    // 登入不會自動過期（登出或管理員強制登出才結束）；登入 cookie 每次使用時延長
    SESSION_DAYS: 400
};

// 網站根目錄（自動由本檔位置推算，網站放在任何路徑下都能運作）
window.APP_SETTINGS.ROOT = (() => {

    const src = document.currentScript?.src || "";

    return src.replace(/js\/settings\.js(\?.*)?$/, "");
})();

// 管理員在「連線設定」為此瀏覽器指定的網址（優先使用）
(() => {

    const s = window.APP_SETTINGS;

    s.GAS_URL_DEFAULT = s.GAS_URL;
    s.GAS_SOURCE = s.GAS_URL ? "settings" : "none";

    try {
        const override = localStorage.getItem("fonegle_gas_url") || "";

        if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(override)) {
            s.GAS_URL = override;
            s.GAS_SOURCE = "override";
        }
    } catch { }
})();
