// =========================================================
// 系統設定
// =========================================================
window.APP_SETTINGS = {

    // Apps Script「部署為網頁應用程式」後取得的網址（結尾是 /exec）
    // 所有使用者都會套用；管理員可在「系統權限資料管理 → 連線設定」
    // 對自己的瀏覽器暫時改用其他網址（例如測試新版部署）
    GAS_URL: "https://script.google.com/macros/s/AKfycbx2p0uqxtTvViYa7sSbdgc4Upo4RQvdxeSBa1orwd80FTlBjDoqUqa__Y2lV1d3l5ZHgg/exec",

    // 公司資料的預設值：還沒到「系統 → 公司與功能設定」填寫時使用。
    // 把這套系統給其他公司使用時，可以直接改這裡，或登入後到設定頁線上修改（設定頁的內容優先）。
    COMPANY_DEFAULTS: {
        appName: "瘋菓內部管理系統",
        brandShort: "瘋菓",
        brandName: "瘋菓冰品研究室",
        brandSub: "Fonegle Dessert Lab",
        companyName: "瘋菓貿易社",
        taxId: "60005166",
        contactName: "董峻宏",
        phone: "0923-212-212",
        email: "austin.fonegle@gmail.com",
        address: "",
        lineId: "@764zeuav",
        lineUrl: "https://line.me/R/ti/p/@764zeuav?ts=07251231&oat_content=url",
        instagramUrl: "https://www.instagram.com/fonegle_dessert/",
        website: "https://fonegle.waca.store/",
        linkTreeUrl: "https://linktr.ee/fonegle_dessert",
        bannerUrl: "https://img.cloudimg.in/uploads/shops/39971/theme/31/3121fab139bb6a962ea668a4cfab9cd0.png?v=202601270250",
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
