// =========================================================
// 資料存取（Google 試算表）
// 每張資料表 = 試算表中的一個工作表，由 gas/Code.gs 提供讀寫
// =========================================================
const API = {

    // opts：{ silent: true } 背景動作不顯示遮罩；{ loadingText } 自訂遮罩文字
    call(action, payload = {}, opts = {}) {
        return Auth.request(action, payload, opts);
    },

    // 取得整張表（可帶 where 做完全比對，例如 { FormulaID: 3 }）
    list(table, where = null, opts = {}) {
        return this.call("list", { table, where }, opts);
    },

    // 一次取得多張表 → { Products: [...], ID_Category: [...] }
    getMany(tables, opts = {}) {
        return this.call("getMany", { tables }, opts);
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
