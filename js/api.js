// =========================================================
// 資料存取（Google 試算表）
// 每張資料表 = 試算表中的一個工作表，由 gas/Code.gs 提供讀寫
// =========================================================
const API = {

    // 60 秒內讀過（或剛寫入更新過）的資料表直接使用暫存，不再向伺服器要
    //   按重新整理（F5 / 下拉更新）時一律向伺服器讀取最新資料
    FRESH_MS: 60 * 1000,

    get isReload() {
        if (this._isReload === undefined) {
            try { this._isReload = performance.getEntriesByType("navigation")[0]?.type === "reload"; } catch { this._isReload = false; }
        }
        return this._isReload;
    },

    // opts：{ silent: true } 背景動作不顯示遮罩；{ loadingText } 自訂遮罩文字
    async call(action, payload = {}, opts = {}) {

        const result = await Auth.request(action, payload, opts);

        // 帳號相關資料有變動：清掉登入者暫存
        if (/^(setFavorite|updateProfile|changePassword)$/.test(action)) {
            try { sessionStorage.removeItem("erp_me"); } catch { }
        }

        // 伺服器端會連帶修改其他資料表的動作：清掉那些表的暫存
        if (this.SIDE_EFFECTS[action]) this.cacheDrop(...this.SIDE_EFFECTS[action]);

        // 寫入成功：用伺服器回傳的結果直接更新暫存（不用整張表重讀）
        try {
            if (/^(insert|update|remove|removeWhere)$/.test(action)) this.applyWrite(action, payload, result);
            if (action === "batch") (payload.ops || []).forEach((op, i) => this.applyWrite(op.action, op, result[i]));
        } catch (e) {
            console.warn("更新暫存失敗", e);
        }

        return result;
    },

    // 取得整張表（可帶 where 做完全比對，例如 { FormulaID: 3 }）
    //   opts.fresh：強制向伺服器讀取
    async list(table, where = null, opts = {}) {

        if (!opts.fresh) {
            const hit = this.cacheGet(table, true);
            if (hit) return where ? hit.filter(r => this.matchWhere(r, where)) : hit;
        }

        const rows = await this.call("list", { table, where }, opts);
        if (!where) this.cachePut(table, rows);
        return rows;
    },

    matchWhere(row, where) {
        return Object.keys(where).every(k => String(row[k]) === String(where[k]));
    },

    // 一次取得多張表 → { Products: [...], ID_Category: [...] }
    //   每張表各自同時讀取：先回來的先處理，其中一張失敗不影響其他（該表回傳 null）
    //   opts.onTable(name, rows, { cached, denied })：每張表一回來就呼叫（有快取時會先用快取呼叫一次；沒有權限時 rows = null）
    //   opts.cache === false：不使用快取
    async getMany(tables, opts = {}) {

        const out = {};
        const useCache = opts.cache !== false;
        const emit = (name, rows, meta) => {
            if (!opts.onTable) return;
            try { opts.onTable(name, rows, meta); } catch (e) { console.error(e); }
        };

        // 1. 先用這個分頁暫存的資料立即顯示
        const fresh = {};

        if (useCache) {
            tables.forEach(name => {
                const rows = this.cacheGet(name);
                if (!rows) return;
                // 60 秒內的暫存直接當作最新資料，不再向伺服器讀取
                if (this.cacheGet(name, true)) { fresh[name] = true; out[name] = rows; }
                emit(name, rows, { cached: !fresh[name] });
            });
        }

        // 2. 其他表同時向伺服器讀取
        let denied = 0, failed = null;

        await Promise.all(tables.filter(n => !fresh[n]).map(async name => {
            try {
                const rows = await this.call("list", { table: name }, opts);
                out[name] = rows;
                this.cachePut(name, rows);
                emit(name, rows, { cached: false });
            } catch (err) {
                out[name] = null;
                if (/無權限/.test(err.message)) {
                    denied++;
                    this.cacheDrop(name);
                    emit(name, null, { denied: true });
                } else {
                    failed = failed || err;
                }
                if (err.code === "AUTH") throw err;
            }
        }));

        // 全部都讀不到（不是權限問題）才視為失敗
        if (failed && tables.every(n => out[n] === null) && denied < tables.length) throw failed;
        if (failed) console.warn("部分資料讀取失敗：", failed.message);

        return out;
    },

    // =========================
    // 分頁快取（sessionStorage：只在這個瀏覽器分頁、登出即清除）
    // =========================
    cacheKey(table) {
        return `erp_cache:${Auth.getUserId() || ""}:${table}`;
    },

    // freshOnly：只回傳 60 秒內的暫存
    cacheGet(table, freshOnly = false) {
        try {
            const v = sessionStorage.getItem(this.cacheKey(table));
            if (!v) return null;
            const c = JSON.parse(v);
            if (!c || !Array.isArray(c.rows)) return null;
            // 重新整理頁面時，頁面載入後 5 秒內的讀取都視為需要最新資料
            if (freshOnly && (Date.now() - c.t > this.FRESH_MS || (this.isReload && performance.now() < 5000 && c.t < this.loadedAt))) return null;
            return c.rows;
        } catch {
            return null;
        }
    },

    cachePut(table, rows) {
        if (!Array.isArray(rows)) return;
        try {
            sessionStorage.setItem(this.cacheKey(table), JSON.stringify({ t: Date.now(), rows }));
        } catch {
            // 超過容量就不快取
            this.cacheDrop(table);
        }
    },

    loadedAt: Date.now(),

    SIDE_EFFECTS: {
        approveUser: ["Users", "Memos"],
        resetUserPassword: ["Users", "Memos"],
        setUserAccess: ["Users"],
        updateProfile: ["Users"],
        setFavorite: ["Users"],
        register: ["Users", "Memos"],
        forgetPassword: ["Memos"]
    },

    // 資料表主鍵（與 gas/Code.gs 的 SCHEMA 相同）
    KEYS: {
        Users: "LineUserId", Calendar: "CalendarId", CalendarDays: "DayId", Inventory: "InventoryID", Orders: "OrderID",
        Shipment: "ShipmentID", Receivable: "ReceivableID", ProductionLog: "ProductionID", Formula: "FormulaID",
        FormulaDetail: "FormulaDetailID", AgentConfig: "Id", ID_AgentTool: "Id", AgentToolPermissions: "Id", MarketOrders: "OrderKey"
    },

    keyOf(table) {
        return this.KEYS[table] || "ID";
    },

    // 寫入成功後更新暫存（只更新已有暫存的表；無法判斷時直接清掉）
    applyWrite(action, op, result) {

        const table = op.table;
        const rows = this.cacheGet(table);
        if (!rows) return;

        const key = this.keyOf(table);
        const same = (r, id) => String(r[key]) === String(id);

        if (action === "insert" && result && typeof result === "object") {
            rows.push(result);
        } else if (action === "update" && result && typeof result === "object") {
            const id = result[key] ?? op.id;
            const i = rows.findIndex(r => same(r, id));
            if (i >= 0) rows[i] = { ...rows[i], ...result }; else rows.push(result);
        } else if (action === "remove" && !/^\$\d+\./.test(String(op.id))) {
            const i = rows.findIndex(r => same(r, op.id));
            if (i >= 0) rows.splice(i, 1);
        } else if (action === "removeWhere" && op.where) {
            for (let i = rows.length - 1; i >= 0; i--) if (this.matchWhere(rows[i], op.where)) rows.splice(i, 1);
        } else {
            return this.cacheDrop(table);
        }

        this.cachePut(table, rows);
    },

    cacheDrop(...tables) {
        try { tables.forEach(t => t && sessionStorage.removeItem(this.cacheKey(t))); } catch { }
    },

    cacheClear() {
        try {
            Object.keys(sessionStorage).filter(k => k.startsWith("erp_cache:")).forEach(k => sessionStorage.removeItem(k));
        } catch { }
    },

    get(table, id, opts = {}) {
        return this.call("get", { table, id }, opts);
    },

    insert(table, data, opts = {}) {
        return this.call("insert", { table, data }, opts);
    },

    update(table, id, data, opts = {}) {
        return this.call("update", { table, id, data }, opts);
    },

    remove(table, id, opts = {}) {
        return this.call("remove", { table, id }, opts);
    },

    removeWhere(table, where, opts = {}) {
        return this.call("removeWhere", { table, where }, opts);
    },

    // 多個操作一次送出（同一把鎖）
    // data 內可用 "$0.FormulaID" 參照第 0 個操作的結果
    batch(ops, opts = {}) {
        return this.call("batch", { ops }, opts);
    },

    // =========================
    // 個人帳號
    // =========================
    // 目前登入者（60 秒內用暫存，不重複向伺服器要）
    async me(opts = {}) {
        try {
            const c = JSON.parse(sessionStorage.getItem("erp_me") || "null");
            if (!opts.fresh && c && c.uid === Auth.getUserId() && Date.now() - c.t < this.FRESH_MS) return c.me;
        } catch { }

        const me = await this.call("me", {}, opts);
        try { sessionStorage.setItem("erp_me", JSON.stringify({ t: Date.now(), uid: Auth.getUserId(), me })); } catch { }
        return me;
    },

    // =========================
    // 讀取 <input type=file> 為 base64（寄信附件用）
    // =========================
    async readFiles(fileInputId, maxTotalMB = 20) {

        const input = document.getElementById(fileInputId);

        if (!input || !input.files.length)
            return [];

        const files = [...input.files];
        const total = files.reduce((s, f) => s + f.size, 0);

        if (total > maxTotalMB * 1024 * 1024)
            throw new Error(`附件總大小不可超過 ${maxTotalMB}MB`);

        return Promise.all(files.map(file => new Promise((resolve, reject) => {

            const reader = new FileReader();

            reader.onload = () => resolve({
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                base64: String(reader.result).split(",")[1] || ""
            });

            reader.onerror = () => reject(new Error(`讀取檔案失敗：${file.name}`));

            reader.readAsDataURL(file);
        })));
    }
};
