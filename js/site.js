// =========================================================
// 公司資料與功能開關（Site）
//   資料來源（依序）：
//     1. 網站根目錄的 site-config.json（靜態檔，最快；在「公司與功能設定」按「匯出設定」取得，放進發布資料夾）
//     2. 找不到那個檔案，才向 Google 試算表的 Settings 表讀取（company / features / logo）
//   site-config.json 也包含品牌資訊頁的內容（brandPage）；試算表裡存在 BrandBlocks 表。
//   試算表是「編輯用的原始資料」：所有登入的人都讀得到，只有系統管理（權限 3 / 13）可以修改。
//   程式碼裡不放任何公司資料；尚未設定時使用 js/settings.js 的 COMPANY_DEFAULTS（中性預設）。
//   每頁載入時先用本機快取立即套用，再背景更新，所以選單與名稱不會閃動太久。
// =========================================================
window.Site = (() => {

    "use strict";

    const KEY = "fonegle_site_v1";
    const DEF = Object.assign({}, window.APP_SETTINGS?.COMPANY_DEFAULTS || {});
    const DEFAULT_FEATURES = { disabled: [], aiChat: true };

    let state = { company: {}, features: Object.assign({}, DEFAULT_FEATURES), logo: "", pub: null, brand: null, source: "", localSavedAt: 0 };

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

    // 靜態設定檔：和網站放在同一個資料夾（網站根目錄）
    const FILE_URL = () => (window.APP_SETTINGS?.ROOT || "") + "site-config.json";

    async function readFile() {
        try {
            const res = await fetch(FILE_URL(), { cache: "no-cache" });     // 每次向伺服器確認有沒有更新（沒變動時只回 304，很輕）
            if (!res.ok) return null;
            const d = await res.json();
            return d && d.fonegleSettings === 1 && d.company && typeof d.company === "object" ? d : null;
        } catch {
            return null;
        }
    }

    // BrandBlocks 表的列 → [{ id, type, data, order }]（依排序）
    const blocksFromRows = rows => (Array.isArray(rows) ? rows : [])
        .slice().sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0) || a.ID - b.ID)
        .map(r => {
            let data = null;
            try { data = JSON.parse(r.Data || "{}"); } catch { }
            return data && typeof data === "object" ? { id: r.ID, type: String(r.Type || ""), data, order: Number(r.SortOrder) || 0 } : null;
        })
        .filter(Boolean);

    const blocksFromFile = list => (Array.isArray(list) ? list : [])
        .filter(b => b && typeof b.type === "string" && b.data && typeof b.data === "object")
        .slice(0, 300).map((b, i) => ({ id: null, type: b.type, data: b.data, order: i + 1 }));

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

        // 品牌資訊頁的區塊：[{ id, type, data, order }]（來自檔案時沒有 id）
        get brand() { return Array.isArray(state.brand) ? state.brand : []; },
        get source() { return state.source; },

        // 管理員剛改完品牌資訊或其他設定：這個瀏覽器先用剛存的資料
        touch() {
            state.localSavedAt = Date.now();
            persist();
            listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
        },
        readFile,

        // 目前網站實際使用的設定來源：先讀 site-config.json，沒有才讀試算表
        //   mode = "sheet"：略過檔案、直接讀試算表（設定頁編輯用，永遠以試算表為準）
        async refresh(force, mode) {

            const at = Number(sessionStorage.getItem("fonegle_site_at") || 0);
            if (!force && Date.now() - at < 30 * 1000) return false;

            const before = JSON.stringify([state.company, state.features, state.logo, state.pub, state.brand]);
            let applied = false;

            try {

                if (mode !== "sheet") {

                    const f = await readFile();

                    // 這個瀏覽器的管理員剛在設定頁存過、而且比檔案新 → 先不用檔案（避免剛改完卻看到舊資料）
                    const fileTime = f ? Date.parse(f.exportedAt) || 0 : 0;

                    if (f && !(state.localSavedAt && state.localSavedAt > fileTime)) {
                        state.company = Object.assign({}, f.company);
                        state.features = Object.assign({}, DEFAULT_FEATURES, f.features && typeof f.features === "object" ? f.features : {});
                        state.logo = safeLogo(f.logo);
                        state.pub = null;
                        state.brand = blocksFromFile(f.brandPage);
                        state.source = "file";
                        applied = true;
                    }
                }

                if (!applied) {

                    // Auth 是 const 宣告，不在 window 上，要用 typeof 判斷
                    if (typeof Auth !== "undefined" && Auth.getToken && Auth.getToken()) {

                        const rows = await Auth.request("list", { table: "Settings" }, { silent: true });
                        const get = k => (rows.find(r => r.Key === k) || {}).Value;

                        state.company = parse(get("company"), {});
                        state.features = Object.assign({}, DEFAULT_FEATURES, parse(get("features"), {}));
                        state.logo = safeLogo(get("logo"));
                        state.pub = null;

                        try {
                            state.brand = blocksFromRows(await Auth.request("list", { table: "BrandBlocks" }, { silent: true }));
                        } catch { }

                    } else {

                        const p = await Auth.request("publicConfig", {}, { silent: true });
                        const pub = {};
                        ["appName", "brandName", "brandShort", "companyName"].forEach(k => { if (p[k]) pub[k] = p[k]; });
                        state.pub = Object.assign(pub, { logo: safeLogo(p.logo) });
                    }

                    state.source = "sheet";
                }

                sessionStorage.setItem("fonegle_site_at", String(Date.now()));

            } catch (err) {

                console.warn("讀取公司設定失敗", err?.message || err);
                return false;
            }

            persist();

            const changed = before !== JSON.stringify([state.company, state.features, state.logo, state.pub, state.brand]);
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

            state.localSavedAt = Date.now();     // 比 site-config.json 新，這個瀏覽器先用剛存的資料，直到你重新匯出並更新檔案
            persist();
            listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
        }
    };

    return api;

})();
