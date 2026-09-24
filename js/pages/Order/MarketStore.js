// =========================================================
// 市集訂單存取（Google 試算表 MarketOrders 工作表）
// - 送出訂單時先存本機，再上傳雲端
// - 市集現場斷網時訂單保留在本機，下次連線自動補傳
// - 舊版只存在瀏覽器的訂單（icecream_orders）也會自動上傳
// =========================================================
window.MarketStore = (() => {

    "use strict";

    const TABLE = "MarketOrders";
    const CACHE_KEY = "icecream_orders";            // 本機快取（沿用舊鍵名）
    const PENDING_KEY = "icecream_orders_pending";  // 尚未上傳

    function readLocal(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || "[]");
        } catch {
            return [];
        }
    }

    function writeLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
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

    // 舊版本機訂單（沒有 id）→ 加入待上傳
    function migrateLegacy() {

        const cache = readLocal(CACHE_KEY);
        const legacy = cache.filter(o => !o.id);

        if (!legacy.length)
            return;

        legacy.forEach(o => o.id = newId(o.time));

        writeLocal(CACHE_KEY, cache);
        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).concat(legacy));
    }

    // 上傳待傳訂單，回傳成功筆數
    async function syncPending() {

        const pending = readLocal(PENDING_KEY);

        if (!pending.length)
            return 0;

        const existing = new Set((await API.list(TABLE)).map(r => r.OrderKey));
        const toUpload = pending.filter(o => !existing.has(o.id));

        if (toUpload.length) {
            await API.batch(toUpload.map(o => ({
                action: "insert",
                table: TABLE,
                data: toRow(o)
            })));
        }

        writeLocal(PENDING_KEY, []);

        return toUpload.length;
    }

    // 載入全部訂單（雲端 + 未上傳）
    async function load() {

        migrateLegacy();

        try {

            const uploaded = await syncPending();

            const cloud = (await API.list(TABLE)).map(fromRow);
            const ids = new Set(cloud.map(o => o.id));
            const pending = readLocal(PENDING_KEY).filter(o => !ids.has(o.id));
            const orders = cloud.concat(pending).sort(byTime);

            writeLocal(CACHE_KEY, orders);

            return { orders, online: true, uploaded, pending: pending.length };

        } catch (err) {

            console.error(err);

            const cache = readLocal(CACHE_KEY);
            const ids = new Set(cache.map(o => o.id));
            const orders = cache
                .concat(readLocal(PENDING_KEY).filter(o => !ids.has(o.id)))
                .sort(byTime);

            return { orders, online: false, error: err, pending: readLocal(PENDING_KEY).length };
        }
    }

    // 新增一筆訂單，回傳是否已上傳雲端
    async function add(order) {

        order.id = order.id || newId(order.time);

        writeLocal(CACHE_KEY, readLocal(CACHE_KEY).concat(order));
        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).concat(order));

        try {

            await syncPending();

            return true;

        } catch (err) {

            console.error(err);

            return false;
        }
    }

    // 刪除訂單（本機 + 雲端）
    async function remove(ids) {

        const set = new Set(ids);

        writeLocal(CACHE_KEY, readLocal(CACHE_KEY).filter(o => !set.has(o.id)));
        writeLocal(PENDING_KEY, readLocal(PENDING_KEY).filter(o => !set.has(o.id)));

        if (!ids.length)
            return;

        await API.batch(ids.map(id => ({
            action: "removeWhere",
            table: TABLE,
            where: { OrderKey: id }
        })));
    }

    return {
        load,
        add,
        remove
    };

})();
