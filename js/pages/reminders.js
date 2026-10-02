window.Pages = window.Pages || {};

// =========================================================
// 提醒中心：開發票、收帳、保證金（規則見 js/billing.js）
// =========================================================
Pages.Reminders = (() => {

    "use strict";

    const dom = {};
    const RANGE_KEY = "fonegle_reminder_range";

    let data = { Receivable: [], Companies: [], Deposits: [], Orders: null };
    let current = { invoice: [], collect: [], deposit: [] };

    async function init() {

        ["qRange", "qCompany", "companyNames", "btnClearSearch", "searchNote", "listInvoice", "listCollect", "listDeposit", "cntInvoice", "cntCollect", "cntDeposit",
            "sumInvoice", "sumCollect", "sumDeposit", "bulkInvoice", "bulkCollect"]
            .forEach(id => dom[id] = document.getElementById(id));

        try { dom.qRange.value = localStorage.getItem(RANGE_KEY) || "7"; } catch { }
        dom.qRange.addEventListener("change", () => {
            try { localStorage.setItem(RANGE_KEY, dom.qRange.value); } catch { }
            render();
        });

        ["listInvoice", "listCollect", "listDeposit"].forEach(id => dom[id].addEventListener("click", onAction));

        dom.qCompany.addEventListener("input", render);
        dom.btnClearSearch.addEventListener("click", () => { dom.qCompany.value = ""; render(); });
        ["bulkInvoice", "bulkCollect"].forEach(id => dom[id].addEventListener("click", onBulk));

        ["listInvoice", "listCollect", "listDeposit"].forEach(id => dom[id].innerHTML = `<div class="text-muted small">載入中…</div>`);

        await API.getMany(["Receivable", "Companies", "Deposits", "Orders"], {
            onTable(name, rows) {
                data[name] = rows || (name === "Orders" ? null : []);
                if (name !== "Orders") render();
            }
        }).catch(err => App.error(err, "讀取資料失敗"));
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    const query = () => dom.qCompany.value.trim().toLowerCase();

    // 搜尋時只列出名稱符合的（付款人或客戶名稱）
    const matches = (x, q) => !q || [x.name, x.company && x.company.CompanyName].some(v => String(v || "").toLowerCase().includes(q));

    function renderNames() {

        const names = new Set([...(data.Companies || []).map(c => c.CompanyName), ...(data.Receivable || []).map(r => r.PayerName)].map(v => String(v || "").trim()).filter(Boolean));
        dom.companyNames.innerHTML = [...names].sort().map(n => `<option value="${App.esc(n)}"></option>`).join("");
    }

    function render() {

        const range = dom.qRange.value;
        const q = query();

        // 搜尋公司時列出該公司全部帳款（不受到期天數限制），方便對總帳
        const all = Billing.build({
            receivables: data.Receivable || [],
            companies: data.Companies || [],
            deposits: data.Deposits || [],
            horizon: q || range === "all" ? null : Number(range)
        });

        current = { invoice: all.invoice.filter(x => matches(x, q)), collect: all.collect.filter(x => matches(x, q)), deposit: all.deposit.filter(x => matches(x, q)) };

        dom.btnClearSearch.classList.toggle("d-none", !q);
        dom.searchNote.classList.toggle("d-none", !q);
        dom.searchNote.textContent = q ? `🔍 搜尋「${dom.qCompany.value.trim()}」：列出符合的全部帳款（不受上方「顯示」天數限制）。` : "";

        renderNames();

        draw("invoice", dom.listInvoice, dom.cntInvoice, "✅ 已開發票", "目前沒有要開的發票 👍");
        draw("collect", dom.listCollect, dom.cntCollect, "💰 已收款", "目前沒有要收的帳 👍");
        draw("deposit", dom.listDeposit, dom.cntDeposit, "↩️ 已退還", "沒有待追回的保證金 👍");

        drawTotals(q);
    }

    const sum = list => list.reduce((t, x) => t + x.amount, 0);
    const countItems = list => list.reduce((t, x) => t + x.items.length, 0);

    // 各區塊的總金額；搜尋公司時多一個「一鍵」按鈕（只處理目前列出的這幾筆）
    function drawTotals(q) {

        const label = { invoice: "待開發票", collect: "未收款", deposit: "待退保證金" };
        const ids = { invoice: "sumInvoice", collect: "sumCollect", deposit: "sumDeposit" };

        Object.keys(label).forEach(k => {
            const list = current[k];
            dom[ids[k]].textContent = list.length ? `${label[k]}合計 ${money(sum(list))}（${countItems(list)} 筆）` : "";
        });

        const bulk = {
            invoice: ["bulkInvoice", `🧾 一鍵開發票（${countItems(current.invoice)} 筆，${money(sum(current.invoice))}）`],
            collect: ["bulkCollect", `💰 一鍵收帳（${countItems(current.collect)} 筆，${money(sum(current.collect))}）`]
        };

        Object.keys(bulk).forEach(k => {
            const box = dom[bulk[k][0]];
            const show = q && current[k].length;
            box.classList.toggle("d-none", !show);
            box.innerHTML = show ? `<button type="button" class="btn btn-sm btn-success w-100" data-bulk="${k}">${bulk[k][1]}</button>` : "";
        });
    }

    // 一鍵處理：只針對搜尋後列出的帳款，按下先跳出確認，避免誤按
    async function onBulk(e) {

        const btn = e.target.closest("[data-bulk]");
        if (!btn) return;

        const kind = btn.dataset.bulk;
        const list = current[kind];
        const q = dom.qCompany.value.trim();
        if (!q || !list.length) return;

        const rows = list.flatMap(x => x.items);
        const who = [...new Set(list.map(x => x.name))];
        const head = `搜尋「${q}」符合 ${who.length} 位：${who.slice(0, 5).join("、")}${who.length > 5 ? "…" : ""}\n共 ${rows.length} 筆，合計 ${money(sum(list))}`;
        const today = Billing.today();

        try {

            if (kind === "invoice") {
                const no = prompt(`⚠️ 確定要把以下全部標記為「已開發票」嗎？\n\n${head}\n\n可輸入發票號碼（可空白，會套用到這 ${rows.length} 筆）。按「取消」不處理：`, "");
                if (no === null) return;
                const out = await API.batch(rows.map(r => ({
                    action: "update", table: "Receivable", id: r.ReceivableID,
                    data: { InvoiceDate: today, InvoiceNo: no.trim() || r.InvoiceNo || "", InvoiceStatus: "已開" }
                })), { loadingText: "更新發票中…" });
                merge("Receivable", "ReceivableID", out);
            }

            if (kind === "collect") {
                if (!confirm(`⚠️ 確定要把以下全部標記為「已收款」（收齊未收餘額）嗎？\n\n${head}\n\n此操作會一次更新 ${rows.length} 筆帳款。`)) return;
                const out = await API.batch(rows.map(r => ({
                    action: "update", table: "Receivable", id: r.ReceivableID,
                    data: { PaidAmount: App.num(r.Amount), PaymentDate: today, PaymentStatus: "已付款" }
                })), { loadingText: "記錄收款中…" });
                merge("Receivable", "ReceivableID", out);
                [...new Set(rows.map(r => r.OrderID).filter(Boolean))].forEach(syncOrders);
            }

            render();

        } catch (err) {
            App.error(err, "更新失敗");
        }
    }

    function draw(kind, box, cnt, btnText, empty) {

        const list = current[kind];
        const esc = App.esc;
        const overdue = list.filter(x => x.level === "overdue").length;

        cnt.textContent = list.length;
        cnt.className = "badge rm-count " + (overdue ? "bg-danger" : list.length ? "bg-warning text-dark" : "bg-secondary");

        box.innerHTML = list.length ? list.map((x, i) => `
<div class="rm-item ${x.level}">
    <div class="d-flex justify-content-between gap-2">
        <b>${esc(x.name)}</b>
        <b class="text-nowrap">${money(x.amount)}</b>
    </div>
    <div class="small text-muted">${esc(x.sub)}</div>
    <div class="d-flex justify-content-between align-items-center mt-1">
        <span class="small ${x.level === "overdue" ? "text-danger fw-bold" : x.level === "today" ? "text-warning fw-bold" : ""}">
            ${x.kind === "invoice" ? "應開立" : x.kind === "collect" ? "應收款" : "應退還"} ${esc(x.date)}（${Billing.whenText(x)}）
        </span>
        <button type="button" class="btn btn-sm btn-outline-success text-nowrap" data-kind="${kind}" data-i="${i}">${btnText}</button>
    </div>
</div>`).join("") : `<div class="text-muted small">${empty}</div>`;
    }

    async function onAction(e) {

        const btn = e.target.closest("[data-kind]");
        if (!btn) return;

        const x = current[btn.dataset.kind][Number(btn.dataset.i)];
        if (!x) return;

        const today = Billing.today();

        try {

            if (x.kind === "invoice") {
                const no = prompt(`「${x.name}」${x.items.length} 筆共 ${money(x.amount)} 已開發票？\n可輸入發票號碼（可空白）：`, "");
                if (no === null) return;
                const rows = await API.batch(x.items.map(r => ({
                    action: "update", table: "Receivable", id: r.ReceivableID,
                    data: { InvoiceDate: today, InvoiceNo: no.trim() || r.InvoiceNo || "", InvoiceStatus: "已開" }
                })), { loadingText: "更新發票中…" });
                merge("Receivable", "ReceivableID", rows);
            }

            if (x.kind === "collect") {
                const r = x.items[0];
                const amount = prompt(`「${x.name}」收到多少？（未收 ${money(x.amount)}）`, String(x.amount));
                if (amount === null) return;
                const got = App.num(amount);
                if (got <= 0) return alert("請輸入收款金額");
                const paid = App.num(r.PaidAmount) + got;
                const status = paid >= App.num(r.Amount) ? "已付款" : "部分付款";
                const rows = await API.batch([{
                    action: "update", table: "Receivable", id: r.ReceivableID,
                    data: { PaidAmount: paid, PaymentDate: today, PaymentStatus: status }
                }], { loadingText: "記錄收款中…" });
                merge("Receivable", "ReceivableID", rows);
                if (status === "已付款") syncOrders(r.OrderID);
            }

            if (x.kind === "deposit") {
                const d = x.items[0];
                const amount = prompt(`「${x.name}」保證金退回多少？`, String(x.amount));
                if (amount === null) return;
                const rows = await API.batch([{
                    action: "update", table: "Deposits", id: d.ID,
                    data: { ReturnedDate: today, ReturnedAmount: App.num(amount), Status: "已退還" }
                }], { loadingText: "更新保證金中…" });
                merge("Deposits", "ID", rows);
            }

            render();

        } catch (err) {
            App.error(err, "更新失敗");
        }
    }

    function merge(table, key, rows) {
        (rows || []).forEach(row => {
            if (!row || typeof row !== "object") return;
            const i = data[table].findIndex(r => String(r[key]) === String(row[key]));
            if (i >= 0) data[table][i] = { ...data[table][i], ...row };
        });
    }

    // 帳款收齊：對應的訂單一併標記已付款（沒有訂單權限時略過）
    async function syncOrders(orderNo) {
        if (!orderNo || !Array.isArray(data.Orders)) return;
        const rows = data.Orders.filter(o => o.OrderNo === orderNo && o.PaymentStatus !== "已付款");
        if (!rows.length) return;
        try {
            await API.batch(rows.map(o => ({ action: "update", table: "Orders", id: o.OrderID, data: { PaymentStatus: "已付款" } })), { silent: true });
            rows.forEach(o => o.PaymentStatus = "已付款");
        } catch (err) {
            console.warn("同步訂單付款狀態失敗", err);
        }
    }

    return { init };
})();
