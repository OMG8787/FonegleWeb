// =========================================================
// 系統設定
// =========================================================
window.APP_SETTINGS = {

    // Apps Script「部署為網頁應用程式」後取得的網址（結尾是 /exec）
    // 填在這裡 → 所有使用者都會套用
    // 留空 → 第一次開啟登入頁時可在「連線設定」貼上（只存在該瀏覽器）
    GAS_URL: "https://script.google.com/macros/s/AKfycbx2p0uqxtTvViYa7sSbdgc4Upo4RQvdxeSBa1orwd80FTlBjDoqUqa__Y2lV1d3l5ZHgg/exec",

    // 自動登出時間（小時）
    SESSION_HOURS: 10
};

// 網站根目錄（自動由本檔位置推算，網站放在任何路徑下都能運作）
window.APP_SETTINGS.ROOT = (() => {

    const src = document.currentScript?.src || "";

    return src.replace(/js\/settings\.js(\?.*)?$/, "");
})();

// 未寫在程式裡時，使用登入頁「連線設定」儲存的網址
(() => {

    const s = window.APP_SETTINGS;

    if (!s.GAS_URL) {
        try {
            s.GAS_URL = localStorage.getItem("fonegle_gas_url") || "";
        } catch {
            s.GAS_URL = "";
        }
    }
})();
