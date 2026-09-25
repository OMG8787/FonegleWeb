// =========================================================
// 庫存助手（庫存盤點頁最上方）
//   ⏰ 30 日內過期：進貨批次（Inventory，數量 > 0）與生產批次（ProductionLog，產品目前有庫存）
//   📦 追蹤清單無庫存：ProductWatch 中，產品目前庫存 ≤ 提醒數量（預設 0）
//   目前庫存以 Products.CurrentStock 為準（快速盤點、產品月盤點會更新）
// =========================================================
const StockAlert = (() => {

    "use strict";

    const DAYS = 30;
    const dom = {};

    let products = [];
    let inventory = [];
    let productions = [];
    let watch = [];

    function init() {

        ["saUpdated", "saRefresh", "saToggleWatch", "saExpireCount", "saExpireList", "saEmptyCount", "saEmptyList",
            "saWatchPanel", "saWatchCount", "saAddProduct", "saAddQty", "saAdd", "saWatchBody"]
            .forEach(id => dom[id] = document.getElementById(id));

        if (!dom.saExpireList) return;

        dom.saRefresh.addEventListener("click", () => load());
        dom.saToggleWatch.addEventListener("click", () => dom.saWatchPanel.classList.toggle("d-none"));
        dom.saAdd.addEventListener("click", addWatch);
        dom.saWatchBody.addEventListener("click", onWatchClick);
        dom.saWatchBody.addEventListener("change", onWatchChange);

        load();
    }

    // =========================
    // 讀取（各表分開讀取，先回來先顯示）
    // =========================
    async function load() {
        try {
            await API.getMany(["Products", "Inventory", "ProductionLog", "ProductWatch"], {
                onTable(name, rows) {
                    if (name === "Products") products = rows || [];
                    if (name === "Inventory") inventory = rows || [];
                    if (name === "ProductionLog") productions = rows || [];
                    if (name === "ProductWatch") watch = rows || [];
                    render();
                }
            });
            const t = new Date();
            dom.saUpdated.textContent = `（${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")} 檢查）`;
        } catch (err) {
            dom.saExpireList.innerHTML = dom.saEmptyList.innerHTML = `<div class="text-danger small">⚠️ ${App.esc(err.message)}</div>`;
        }
    }

    // =========================
    // 計算
    // =========================
    const pad = n => String(n).padStart(2, "0");
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const num = v => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

    function productOf(id) {
        return products.find(p => String(p.ID) === String(id));
    }

    function stockOf(id) {
        return num(productOf(id)?.CurrentStock) ?? 0;
    }

    function daysLeft(date) {
        const a = new Date(ymd(new Date()) + "T00:00:00");
        const b = new Date(date + "T00:00:00");
        return Math.round((b - a) / 86400000);
    }

    // 30 日內過期（含已過期）的批次
    function expiring() {

        const until = new Date();
        until.setDate(until.getDate() + DAYS);
        const limit = ymd(until);
        const list = [];

        inventory.forEach(x => {
            const date = App.toDateInput(x.ExpDate);
            if (!x.ProductID || !date || date > limit || (num(x.StockQty) ?? 0) <= 0) return;
            list.push({ pid: x.ProductID, date, qty: num(x.StockQty), batch: x.BatchNo || "", source: "進貨批次" });
        });

        productions.forEach(x => {
            const date = App.toDateInput(x.ExpDate);
            if (!x.ProductID || !date || date > limit || stockOf(x.ProductID) <= 0) return;
            // 同一產品同一批號已在進貨批次列出就不重複
            if (list.some(y => String(y.pid) === String(x.ProductID) && y.batch && y.batch === x.BatchNo)) return;
            list.push({ pid: x.ProductID, date, qty: num(x.ProducedQty), batch: x.BatchNo || "", source: "生產批次" });
        });

        return list
            .map(x => ({ ...x, name: productOf(x.pid)?.ProductName || `產品 ${x.pid}`, unit: productOf(x.pid)?.Unit || "", left: daysLeft(x.date) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    // 追蹤清單中低於提醒數量的產品
    function shortage() {
        return watch
            .map(w => {
                const p = productOf(w.ProductID);
                const stock = stockOf(w.ProductID);
                const alert = num(w.AlertQty) ?? 0;
                return { w, name: p?.ProductName || w.ProductName || `產品 ${w.ProductID}`, unit: p?.Unit || "", stock, alert, missing: !p };
            })
            .filter(x => x.stock <= x.alert)
            .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "zh-Hant"));
    }

    // =========================
    // 畫面
    // =========================
    function render() {

        const esc = App.esc;

        // ⏰ 快過期
        const exp = expiring();
        dom.saExpireCount.textContent = exp.length;
        dom.saExpireList.innerHTML = exp.length ? exp.map(x => {
            const badge = x.left < 0 ? `<span class="badge bg-danger">已過期 ${-x.left} 天</span>`
                : x.left === 0 ? `<span class="badge bg-danger">今天到期</span>`
                    : x.left <= 7 ? `<span class="badge" style="background:#fd7e14">剩 ${x.left} 天</span>`
                        : `<span class="badge bg-warning text-dark">剩 ${x.left} 天</span>`;
            return `<div class="sa-item" data-expire="${esc(x.pid)}">
    <div><b>${esc(x.name)}</b>
        <div class="meta">${esc(x.date)} 到期・${esc(x.source)}${x.batch ? `・批號 ${esc(x.batch)}` : ""}${x.qty !== null ? `・${esc(x.qty)} ${esc(x.unit)}` : ""}</div></div>
    ${badge}</div>`;
        }).join("") : `<div class="text-success small">✅ 30 日內沒有即將過期的產品</div>`;

        // 📦 追蹤清單無庫存
        const short = shortage();
        const empty = short.filter(x => x.stock <= 0).length;
        dom.saEmptyCount.textContent = empty;
        dom.saEmptyList.innerHTML = !watch.length
            ? `<div class="text-muted small">追蹤清單還是空的，按「⚙️ 管理追蹤清單」加入要追蹤的產品</div>`
            : short.length ? short.map(x => `<div class="sa-item" data-short="${esc(x.w.ProductID)}">
    <div><b>${esc(x.name)}</b>
        <div class="meta">目前庫存 ${esc(x.stock)} ${esc(x.unit)}${x.alert > 0 ? `・提醒數量 ${esc(x.alert)}` : ""}${x.w.Note ? `・${esc(x.w.Note)}` : ""}</div></div>
    ${x.stock <= 0 ? `<span class="badge bg-danger">無庫存</span>` : `<span class="badge bg-warning text-dark">庫存偏低</span>`}</div>`).join("")
                : `<div class="text-success small">✅ 追蹤的 ${watch.length} 項產品目前都有庫存</div>`;

        renderWatch();
    }

    function renderWatch() {

        const esc = App.esc;
        const watched = new Set(watch.map(w => String(w.ProductID)));

        dom.saWatchCount.textContent = watch.length;

        const keep = dom.saAddProduct.value;
        dom.saAddProduct.innerHTML = `<option value="">選擇要追蹤的產品</option>` + products
            .filter(p => p.IsActive !== false && !watched.has(String(p.ID)))
            .sort((a, b) => String(a.ProductName).localeCompare(String(b.ProductName), "zh-Hant"))
            .map(p => `<option value="${p.ID}">${esc(p.ProductName)}（庫存 ${esc(p.CurrentStock ?? 0)}）</option>`).join("");
        dom.saAddProduct.value = keep;

        dom.saWatchBody.innerHTML = watch.length ? watch
            .slice()
            .sort((a, b) => String(productOf(a.ProductID)?.ProductName || a.ProductName).localeCompare(String(productOf(b.ProductID)?.ProductName || b.ProductName), "zh-Hant"))
            .map(w => {
                const p = productOf(w.ProductID);
                const stock = stockOf(w.ProductID);
                return `<tr data-wid="${w.ID}">
    <td>${esc(p?.ProductName || w.ProductName || "")}${p ? "" : ` <span class="badge bg-secondary">產品已刪除</span>`}</td>
    <td class="text-end ${stock <= (num(w.AlertQty) ?? 0) ? "text-danger fw-bold" : ""}">${esc(stock)} ${esc(p?.Unit || "")}</td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm" data-f="AlertQty" value="${esc(w.AlertQty ?? 0)}"></td>
    <td><input class="form-control form-control-sm" data-f="Note" value="${esc(w.Note || "")}" placeholder="例如：B2B 常用"></td>
    <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-remove>移除</button></td>
</tr>`;
            }).join("") : `<tr><td colspan="5" class="text-muted small">尚未追蹤任何產品</td></tr>`;
    }

    // =========================
    // 追蹤清單：新增 / 修改 / 移除
    // =========================
    async function addWatch() {

        const p = productOf(dom.saAddProduct.value);
        if (!p) return alert("請選擇產品");

        try {
            const row = await API.insert("ProductWatch", {
                ProductID: p.ID,
                ProductName: p.ProductName,
                AlertQty: num(dom.saAddQty.value) ?? 0
            });
            watch.push(row);
            dom.saAddProduct.value = "";
            dom.saAddQty.value = "";
            render();
        } catch (err) {
            App.error(err, "加入失敗");
        }
    }

    async function onWatchChange(e) {

        const tr = e.target.closest("tr[data-wid]");
        const f = e.target.dataset.f;
        if (!tr || !f) return;

        const w = watch.find(x => String(x.ID) === tr.dataset.wid);
        const value = f === "AlertQty" ? (num(e.target.value) ?? 0) : e.target.value.trim();

        try {
            await API.update("ProductWatch", w.ID, { [f]: value });
            w[f] = value;
            render();
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function onWatchClick(e) {

        if (!e.target.closest("[data-remove]")) return;

        const tr = e.target.closest("tr[data-wid]");
        const w = watch.find(x => String(x.ID) === tr.dataset.wid);
        const name = productOf(w.ProductID)?.ProductName || w.ProductName;

        if (!confirm(`從追蹤清單移除「${name}」？`)) return;

        try {
            await API.remove("ProductWatch", w.ID);
            watch = watch.filter(x => x !== w);
            render();
        } catch (err) {
            App.error(err, "移除失敗");
        }
    }

    return { init, reload: load };
})();
