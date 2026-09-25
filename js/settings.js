// =========================================================
// 系統設定
// =========================================================
window.APP_SETTINGS = {

    // Apps Script「部署為網頁應用程式」後取得的網址（結尾是 /exec）
    // 所有使用者都會套用；管理員可在「系統權限資料管理 → 連線設定」
    // 對自己的瀏覽器暫時改用其他網址（例如測試新版部署）
    GAS_URL: "https://script.google.com/macros/s/AKfycbx2p0uqxtTvViYa7sSbdgc4Upo4RQvdxeSBa1orwd80FTlBjDoqUqa__Y2lV1d3l5ZHgg/exec",

    // 自動登出時間（小時）：實際以 Apps Script Code.gs 的 CONFIG.SESSION_HOURS 為準，這裡只是備用值
    SESSION_HOURS: 6
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
