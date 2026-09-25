// =========================================================
// 市集訂單存取（Google 試算表 MarketOrders 工作表）
// - 資料一律以 Google 試算表為準，手機、電腦看到的都一樣
// - 點餐時先存在本機（立即完成，不用等網路），累積 5 筆再一次在背景上傳
//   不滿 5 筆超過 3 分鐘、恢復連線、離開頁面時也會自動上傳
// - 舊版只存在瀏覽器的訂單（icecream_orders）會自動上傳一次
// =========================================================
window.MarketStore = (() => {

    "use strict";

    const TABLE = "MarketOrders";
    const LEGACY_KEY = "icecream_orders";           // 舊版單機資料
    const PENDING_KEY = "icecream_orders_pending";  // 本機暫存、待上傳

    const BATCH_SIZE = 5;               // 累積幾筆上傳一次
    const FLUSH_MS = 3 * 60 * 1000;     // 不滿一批時，最久等多久就上傳

    const listeners = [];

    let syncing = null;     // 上傳中的 Promise（同時間只跑一個）
    let again = false;      // 上傳中又有新訂單 → 結束後再傳一次
    let flushTimer = null;
    let lastError = null;   // 最近一次上傳失敗的原因（成功後清除）

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
            try { fn(n, { failed: !!lastError, syncing: !!syncing }); } catch { }
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
    // 預設在背景執行（不擋畫面）；使用者手動按「立即上傳」時傳 {} 顯示遮罩
    // 同時間只會有一個上傳在跑；上傳中新增的訂單會在結束後接著上傳
    //   batchOnly：只有滿一批才接著傳（點餐時觸發用）
    function syncPending(opts = { silent: true }, batchOnly = false) {

        if (syncing) {
            if (!batchOnly) again = true;
            return syncing;
        }

        syncing = (async () => {
            let total = 0;
            try {
                do {
                    again = false;
                    total += await uploadOnce(opts);
                } while (pendingCount() && (again || pendingCount() >= BATCH_SIZE));
                lastError = null;
                return total;
            } catch (err) {
                lastError = err;
                throw err;
            } finally {
                syncing = null;
                notify();
                schedule();
            }
        })();

        notify();
        return syncing;
    }

    async function uploadOnce(opts) {

        migrateLegacy();

        const pending = readLocal(PENDING_KEY);

        if (!pending.length) return 0;

        const ops = list => list.map(o => ({ action: "insert", table: TABLE, data: toRow(o) }));
        let uploaded = pending;

        try {
            await API.batch(ops(pending), { noRetry: false, ...opts });
        } catch (err) {
            // 上次其實已寫入（例如回應途中斷線）→ 比對雲端，只補傳還沒有的
            if (!/已存在/.test(err?.message || "")) throw err;
            const existing = new Set((await API.list(TABLE, null, { ...opts, fresh: true })).map(r => r.OrderKey));
            uploaded = pending.filter(o => !existing.has(o.id));
            if (uploaded.length) await API.batch(ops(uploaded), opts);
        }

        // 只移除這次上傳的訂單（上傳期間新增的保留）
        const done = new Set(pending.map(o => o.id));
        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).filter(o => !done.has(o.id)));

        return uploaded.length;
    }

    // 背景上傳（失敗不打擾點餐，保留在本機下次再傳）
    function syncQuiet(batchOnly = false) {
        if (!pendingCount()) return;
        syncPending(undefined, batchOnly === true).catch(err => {
            if (err?.code === "AUTH") App.error?.(err, "登入已過期，訂單仍保存在本機");
            else console.warn("訂單背景上傳失敗，稍後再試", err);
        });
    }

    // 不滿一批時，最舊的一筆放超過 FLUSH_MS 就上傳
    function schedule() {
        clearTimeout(flushTimer);
        const pending = readLocal(PENDING_KEY);
        if (!pending.length) return;
        const oldest = Math.min(...pending.map(o => o.savedAt || Date.now()));
        flushTimer = setTimeout(syncQuiet, Math.max(5000, oldest + FLUSH_MS - Date.now()));
    }

    // 讀取全部訂單：雲端 + 本機還沒上傳的（會先試著補傳）
    async function load() {

        let uploaded = 0;

        try {
            uploaded = await syncPending();
        } catch (err) {
            console.warn("補傳失敗", err);
        }

        const orders = (await API.list(TABLE)).map(fromRow);
        const ids = new Set(orders.map(o => o.id));
        readLocal(PENDING_KEY).forEach(o => { if (!ids.has(o.id)) orders.push(o); });

        return { orders: orders.sort(byTime), uploaded, pending: pendingCount() };
    }

    // 新增訂單：先存在本機（立即完成），滿 5 筆再背景上傳
    function add(order) {

        order.id = order.id || newId(order.time);

        const pending = readLocal(PENDING_KEY);
        pending.push({ ...order, savedAt: Date.now() });
        writeLocal(PENDING_KEY, pending);

        if (pending.length >= BATCH_SIZE) syncQuiet(true);
        else schedule();

        notify();
        return order.id;
    }

    // 刪除訂單（雲端）
    async function remove(ids) {

        const set = new Set(ids);

        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).filter(o => !set.has(o.id)));
        notify();

        if (!ids.length) return;

        await API.batch(ids.map(id => ({ action: "removeWhere", table: TABLE, where: { OrderKey: id } })));
    }

    // 恢復連線、切到背景、離開頁面時自動上傳
    window.addEventListener("online", syncQuiet);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncQuiet(); });
    schedule();

    return {
        BATCH_SIZE,
        load,
        add,
        remove,
        syncPending,
        pendingCount,
        get lastError() { return lastError; },
        onPendingChange: fn => listeners.push(fn)
    };

})();
