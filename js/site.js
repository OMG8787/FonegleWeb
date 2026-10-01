// =========================================================
// 公司資料與功能開關（Site）
//   資料存在 Google 試算表的 Settings 表（company / features / logo），
//   所有登入的人都讀得到，只有系統管理（權限 3 / 13）可以修改。
//   尚未設定時使用 js/settings.js 的 COMPANY_DEFAULTS。
//   每頁載入時先用本機快取立即套用，再背景更新，所以選單與名稱不會閃動太久。
// =========================================================
window.Site = (() => {

    "use strict";

    const KEY = "fonegle_site_v1";
    const DEF = Object.assign({}, window.APP_SETTINGS?.COMPANY_DEFAULTS || {});
    const DEFAULT_FEATURES = { disabled: [], aiChat: true, brandTemplates: true };

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

    // 登入與否都可以用的組合：已存的公司資料蓋過預設值（存成空字串也算「已設定」）
    const company = () => Object.assign({}, DEF, state.pub || {}, state.company || {});

    // 網址最後一段（例如 Instagram 帳號）
    const lastSeg = u => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() || "";

    // 預設文字 → 目前設定（長的先換，避免被短的拆掉）
    function brandMap() {

        const c = company();
        const pairs = [
            [DEF.lineUrl, c.lineUrl], [DEF.instagramUrl, c.instagramUrl], [DEF.linkTreeUrl, c.linkTreeUrl], [DEF.website, c.website],
            [DEF.bannerUrl, c.bannerUrl], [DEF.email, c.email], [DEF.brandName, c.brandName], [DEF.companyName, c.companyName],
            [DEF.brandSub, c.brandSub], [DEF.taxId, c.taxId], [DEF.contactName, c.contactName], [DEF.phone, c.phone],
            [DEF.lineId, c.lineId], [lastSeg(DEF.instagramUrl), lastSeg(c.instagramUrl)], [DEF.brandShort, c.brandShort]
        ];

        return pairs
            .filter(([from, to]) => from && to !== undefined && to !== null && String(from) !== String(to))
            .map(([from, to]) => [String(from), String(to)])
            .sort((a, b) => b[0].length - a[0].length);
    }

    const api = {

        get company() { return company(); },
        get features() { return Object.assign({}, DEFAULT_FEATURES, state.features || {}); },
        get logo() { return safeLogo(state.logo || (state.pub && state.pub.logo)); },
        get defaults() { return Object.assign({}, DEF); },
        get appName() { return String(company().appName || "").trim() || "內部管理系統"; },
        get brandShort() { return String(company().brandShort || "").trim() || this.appName; },

        isDisabled(id) {
            return (this.features.disabled || []).map(Number).includes(Number(id)) && !((typeof Config !== "undefined" && Config.lockedIds) || []).includes(Number(id));
        },

        onChange(fn) { listeners.push(fn); },

        // 把物件 / 字串裡的「預設公司資料」換成目前設定（內建範本、品牌資訊頁使用）
        replaceBrand(value) {
            const map = brandMap();
            if (!map.length) return value;
            let text = JSON.stringify(value);
            map.forEach(([from, to]) => {
                const f = JSON.stringify(from).slice(1, -1);
                const t = JSON.stringify(to).slice(1, -1);
                text = text.split(f).join(t);
            });
            return JSON.parse(text);
        },

        // 頁面上的文字節點與 onclick 屬性（品牌資訊頁）
        applyToDom(root) {
            const map = brandMap();
            if (!root || !map.length) return;
            const sub = s => map.reduce((t, [f, to]) => t.split(f).join(to), s);
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(n => { const v = sub(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
            // onclick 裡的文字放在 JS 字串中，要跳脫反斜線與單引號
            const subJs = str => map.reduce((t, [f, to]) => t.split(f).join(to.replace(/\\/g, "\\\\").replace(/'/g, "\\'")), str);
            root.querySelectorAll("[onclick]").forEach(e => {
                const v = subJs(e.getAttribute("onclick"));
                if (v !== e.getAttribute("onclick")) e.setAttribute("onclick", v);
            });
        },

        // 瀏覽器分頁標題：「系統名稱｜頁面名稱」
        applyTitle() {
            const t = document.title || "";
            const i = t.indexOf("｜");
            document.title = i >= 0 ? this.appName + t.slice(i) : (t === DEF.appName ? this.appName : t);
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
