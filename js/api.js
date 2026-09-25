// =========================================================
// 資料存取（Google 試算表）
// 每張資料表 = 試算表中的一個工作表，由 gas/Code.gs 提供讀寫
// =========================================================
const API = {

    // opts：{ silent: true } 背景動作不顯示遮罩；{ loadingText } 自訂遮罩文字
    call(action, payload = {}, opts = {}) {

        // 寫入後清掉相關資料表的快取
        if (/^(insert|update|remove|removeWhere)$/.test(action)) this.cacheDrop(payload.table);
        if (action === "batch") this.cacheDrop(...new Set((payload.ops || []).map(o => o.table)));

        return Auth.request(action, payload, opts);
    },

    // 取得整張表（可帶 where 做完全比對，例如 { FormulaID: 3 }）
    list(table, where = null, opts = {}) {
        return this.call("list", { table, where }, opts).then(rows => {
            if (!where) this.cachePut(table, rows);
            return rows;
        });
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
        if (useCache && opts.onTable) {
            tables.forEach(name => {
                const rows = this.cacheGet(name);
                if (rows) emit(name, rows, { cached: true });
            });
        }

        // 2. 每張表同時向伺服器讀取
        let denied = 0, failed = null;

        await Promise.all(tables.map(async name => {
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

    cacheGet(table) {
        try {
            const v = sessionStorage.getItem(this.cacheKey(table));
            return v ? JSON.parse(v) : null;
        } catch {
            return null;
        }
    },

    cachePut(table, rows) {
        try {
            sessionStorage.setItem(this.cacheKey(table), JSON.stringify(rows));
        } catch {
            // 超過容量就不快取
            this.cacheDrop(table);
        }
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
    me(opts = {}) {
        return this.call("me", {}, opts);
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
