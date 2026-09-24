// =========================================================
// 市集訂單存取（Google 試算表 MarketOrders 工作表）
// - 資料一律以 Google 試算表為準，手機、電腦看到的都一樣
// - 送出時直接寫入雲端；只有在斷線時才暫存「待上傳」，恢復連線自動補傳
// - 舊版只存在瀏覽器的訂單（icecream_orders）會自動上傳一次
// =========================================================
window.MarketStore = (() => {

    "use strict";

    const TABLE = "MarketOrders";
    const LEGACY_KEY = "icecream_orders";           // 舊版單機資料
    const PENDING_KEY = "icecream_orders_pending";  // 斷線時待上傳

    const listeners = [];

    function readLocal(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "[]");
        } catch {
            return [];
        }
    }

    function writeLocal(key, value) {
        try {
            if (value.length) localStorage.setItem(key, JSON.stringify(value));
            else localStorage.removeItem(key);
        } catch { }
    }

    function newId(time) {
        return `${time}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function toRow(o) {
        return {
            OrderKey: o.id,
            Time: o.time,
            Items: JSON.stringify(o.items || []),
            Total: o.total,
            Received: o.received,
            Change: o.change,
            Payment: o.payment
        };
    }

    function fromRow(r) {

        let items = [];

        try {
            items = JSON.parse(r.Items || "[]");
        } catch { }

        return {
            id: r.OrderKey,
            time: r.Time,
            items,
            total: Number(r.Total) || 0,
            received: Number(r.Received) || 0,
            change: Number(r.Change) || 0,
            payment: r.Payment || "cash"
        };
    }

    function byTime(a, b) {
        return new Date(a.time) - new Date(b.time);
    }

    function notify() {
        const n = pendingCount();
        listeners.forEach(fn => {
            try { fn(n); } catch { }
        });
    }

    // 舊版單機訂單 → 加入待上傳，並清除舊資料
    function migrateLegacy() {

        const legacy = readLocal(LEGACY_KEY);

        if (!legacy.length) return;

        legacy.forEach(o => o.id = o.id || newId(o.time));

        const pending = readLocal(PENDING_KEY);
        const ids = new Set(pending.map(o => o.id));

        writeLocal(PENDING_KEY, pending.concat(legacy.filter(o => !ids.has(o.id))));
        writeLocal(LEGACY_KEY, []);
    }

    function pendingCount() {
        return readLocal(PENDING_KEY).length;
    }

    // 上傳待上傳訂單，回傳上傳筆數（失敗會拋出錯誤）
    async function syncPending() {

        migrateLegacy();

        const pending = readLocal(PENDING_KEY);

        if (!pending.length) return 0;

        const existing = new Set((await API.list(TABLE)).map(r => r.OrderKey));
        const toUpload = pending.filter(o => !existing.has(o.id));

        if (toUpload.length) {
            await API.batch(toUpload.map(o => ({ action: "insert", table: TABLE, data: toRow(o) })));
        }

        writeLocal(PENDING_KEY, []);
        notify();

        return toUpload.length;
    }

    // 讀取雲端全部訂單（會先補傳待上傳訂單）
    async function load() {

        let uploaded = 0;

        try {
            uploaded = await syncPending();
        } catch (err) {
            console.warn("補傳失敗", err);
        }

        const orders = (await API.list(TABLE)).map(fromRow).sort(byTime);

        return { orders, uploaded, pending: pendingCount() };
    }

    // 新增訂單：直接寫入雲端；失敗時暫存待上傳，回傳是否已寫入雲端
    async function add(order) {

        order.id = order.id || newId(order.time);

        try {

            await API.insert(TABLE, toRow(order));

            // 順便補傳之前斷線的訂單
            if (pendingCount()) syncPending().catch(() => { });

            return true;

        } catch (err) {

            if (err?.code === "AUTH") throw err;

            console.error(err);

            writeLocal(PENDING_KEY, readLocal(PENDING_KEY).concat(order));
            notify();

            return false;
        }
    }

    // 刪除訂單（雲端）
    async function remove(ids) {

        const set = new Set(ids);

        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).filter(o => !set.has(o.id)));
        notify();

        if (!ids.length) return;

        await API.batch(ids.map(id => ({ action: "removeWhere", table: TABLE, where: { OrderKey: id } })));
    }

    // 恢復連線時自動補傳
    window.addEventListener("online", () => syncPending().catch(() => { }));

    return {
        load,
        add,
        remove,
        syncPending,
        pendingCount,
        onPendingChange: fn => listeners.push(fn)
    };

})();
