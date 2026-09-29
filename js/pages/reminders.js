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

        ["qRange", "listInvoice", "listCollect", "listDeposit", "cntInvoice", "cntCollect", "cntDeposit"]
            .forEach(id => dom[id] = document.getElementById(id));

        try { dom.qRange.value = localStorage.getItem(RANGE_KEY) || "7"; } catch { }
        dom.qRange.addEventListener("change", () => {
            try { localStorage.setItem(RANGE_KEY, dom.qRange.value); } catch { }
            render();
        });

        ["listInvoice", "listCollect", "listDeposit"].forEach(id => dom[id].addEventListener("click", onAction));

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

    function render() {

        const range = dom.qRange.value;

        current = Billing.build({
            receivables: data.Receivable || [],
            companies: data.Companies || [],
            deposits: data.Deposits || [],
            horizon: range === "all" ? null : Number(range)
        });

        draw("invoice", dom.listInvoice, dom.cntInvoice, "✅ 已開發票", "目前沒有要開的發票 👍");
        draw("collect", dom.listCollect, dom.cntCollect, "💰 已收款", "目前沒有要收的帳 👍");
        draw("deposit", dom.listDeposit, dom.cntDeposit, "↩️ 已退還", "沒有待追回的保證金 👍");
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
