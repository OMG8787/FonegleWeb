// =========================================================
// 公司資料與功能開關（Site）
//   資料存在 Google 試算表的 Settings 表（company / features / logo），
//   所有登入的人都讀得到，只有系統管理（權限 3 / 13）可以修改。
//   程式碼裡不放任何公司資料；尚未設定時使用 js/settings.js 的 COMPANY_DEFAULTS（中性預設）。
//   每頁載入時先用本機快取立即套用，再背景更新，所以選單與名稱不會閃動太久。
// =========================================================
window.Site = (() => {

    "use strict";

    const KEY = "fonegle_site_v1";
    const DEF = Object.assign({}, window.APP_SETTINGS?.COMPANY_DEFAULTS || {});
    const DEFAULT_FEATURES = { disabled: [], aiChat: true };

    let state = { company: {}, features: Object.assign({}, DEFAULT_FEATURES), logo: "", pub: null };

    try {
        const c = JSON.parse(localStorage.getItem(KEY) || "null");
        if (c && typeof c === "object") state = Object.assign(state, c);
    } catch { }

    const listeners = [];

    const safeLogo = v => {
        v = String(v || "");
        return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/[^\s"'<>()\\]+$/.test(v) ? v : "";
    };

    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { } };

    const parse = (text, fallback) => {
        try { const v = JSON.parse(text); return v && typeof v === "object" ? v : fallback; } catch { return fallback; }
    };

    // 已存的公司資料蓋過預設值（存成空字串也算「已設定」）
    const company = () => Object.assign({}, DEF, state.pub || {}, state.company || {});

    const api = {

        get company() { return company(); },
        get features() { return Object.assign({}, DEFAULT_FEATURES, state.features || {}); },
        get logo() { return safeLogo(state.logo || (state.pub && state.pub.logo)); },
        get defaults() { return Object.assign({}, DEF); },
        get appName() { return String(company().appName || "").trim() || "內部管理系統"; },
        // 手機版標題用的簡稱；沒設定簡稱就用系統名稱
        get shortTitle() { const s = String(company().brandShort || "").trim(); return s ? s + "管理" : this.appName; },

        isDisabled(id) {
            return (this.features.disabled || []).map(Number).includes(Number(id)) && !((typeof Config !== "undefined" && Config.lockedIds) || []).includes(Number(id));
        },

        onChange(fn) { listeners.push(fn); },

        // 瀏覽器分頁標題：「系統名稱｜頁面名稱」
        applyTitle() {
            const t = document.title || "";
            const i = t.indexOf("｜");
            if (i >= 0) document.title = this.appName + t.slice(i);
        },

        // 從伺服器更新（登入後讀 Settings 表；登入頁讀 publicConfig）
        async refresh(force) {

            const at = Number(sessionStorage.getItem("fonegle_site_at") || 0);
            if (!force && Date.now() - at < 30 * 1000) return false;

            const before = JSON.stringify([state.company, state.features, state.logo, state.pub]);

            try {

                // Auth 是 const 宣告，不在 window 上，要用 typeof 判斷
                if (typeof Auth !== "undefined" && Auth.getToken && Auth.getToken()) {

                    const rows = await Auth.request("list", { table: "Settings" }, { silent: true });
                    const get = k => (rows.find(r => r.Key === k) || {}).Value;

                    state.company = parse(get("company"), {});
                    state.features = Object.assign({}, DEFAULT_FEATURES, parse(get("features"), {}));
                    state.logo = safeLogo(get("logo"));
                    state.pub = null;

                } else {

                    const p = await Auth.request("publicConfig", {}, { silent: true });
                    const pub = {};
                    ["appName", "brandName", "brandShort", "companyName"].forEach(k => { if (p[k]) pub[k] = p[k]; });
                    state.pub = Object.assign(pub, { logo: safeLogo(p.logo) });
                }

                sessionStorage.setItem("fonegle_site_at", String(Date.now()));

            } catch (err) {

                console.warn("讀取公司設定失敗", err?.message || err);
                return false;
            }

            persist();

            const changed = before !== JSON.stringify([state.company, state.features, state.logo, state.pub]);
            if (changed) listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

            return changed;
        },

        // 管理員儲存（沒有這一列就新增）；儲存後立即套用
        async save(key, value) {

            const text = typeof value === "string" ? value : JSON.stringify(value);

            try {
                await API.update("Settings", key, { Value: text }, { silent: true });
            } catch (err) {
                if (!/找不到/.test(err?.message || "")) throw err;
                await API.insert("Settings", { Key: key, Value: text });
            }

            if (key === "company") state.company = typeof value === "string" ? parse(value, {}) : value;
            else if (key === "features") state.features = Object.assign({}, DEFAULT_FEATURES, typeof value === "string" ? parse(value, {}) : value);
            else if (key === "logo") state.logo = safeLogo(text);

            persist();
            listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
        }
    };

    return api;

})();
