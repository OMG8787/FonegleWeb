window.Pages = window.Pages || {};

// =========================================================
// 保證金追蹤（Deposits 工作表）
// 狀態：有退還日 → 已退還；否則未退還（過了應退日 = 逾期，會出現在提醒）
// =========================================================
Pages.Deposit = (() => {

    "use strict";

    const FIELDS = ["EventDate", "Amount", "EventName", "Payee", "PaidDate", "ExpectReturnDate", "ReturnedDate", "ReturnedAmount", "Note"];
    const DATE_FIELDS = ["EventDate", "PaidDate", "ExpectReturnDate", "ReturnedDate"];

    const dom = {};

    let rows = [];
    let stalls = [];
    let current = null;

    async function init() {

        ["qStatus", "qKeyword", "listCount", "listBody", "formTitle", "depForm", "StallId", "btnNew", "btnCreate", "btnUpdate",
            "btnReturned", "btnDelete", "sumOpen", "sumOpenNote", "sumOverdue", "sumOverdueNote", "sumBack", "sumLost", "formCard"]
            .concat(FIELDS).forEach(id => dom[id] = document.getElementById(id));

        dom.qStatus.addEventListener("change", render);
        dom.qKeyword.addEventListener("input", render);
        dom.btnNew.addEventListener("click", () => { openCreate(); dom.formCard.scrollIntoView({ behavior: "smooth" }); });
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);
        dom.btnReturned.addEventListener("click", () => {
            dom.ReturnedDate.value = Billing.today();
            if (!dom.ReturnedAmount.value) dom.ReturnedAmount.value = dom.Amount.value;
            save(!current);
        });
        dom.StallId.addEventListener("change", fillFromStall);
        dom.listBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-id]");
            if (tr) loadDetail(rows.find(r => String(r.ID) === tr.dataset.id));
        });

        openCreate();

        await API.getMany(["Deposits", "StallRecords"], {
            onTable(name, list) {
                if (name === "Deposits") { rows = list || []; render(); }
                if (name === "StallRecords") { stalls = list || []; renderStallOptions(); }
            }
        }).catch(err => App.error(err, "讀取資料失敗"));
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    const date = v => App.toDateInput(v) || "";
    const returned = r => !!date(r.ReturnedDate) || r.Status === "已退還";

    function dueOf(r) {
        return date(r.ExpectReturnDate) || Billing.addDays(date(r.EventDate) || date(r.PaidDate) || Billing.today(), Billing.DEPOSIT_RETURN_DAYS);
    }

    function render() {

        const esc = App.esc;
        const today = Billing.today();
        const st = dom.qStatus.value;
        const kw = dom.qKeyword.value.trim();

        const open = rows.filter(r => !returned(r));
        const overdue = open.filter(r => dueOf(r) < today);
        const back = rows.filter(returned);
        const lost = back.reduce((s, r) => s + Math.max(0, App.num(r.Amount) - App.num(r.ReturnedAmount)), 0);
        const sum = list => list.reduce((s, r) => s + App.num(r.Amount), 0);

        dom.sumOpen.textContent = money(sum(open));
        dom.sumOpenNote.textContent = `${open.length} 筆`;
        dom.sumOverdue.textContent = money(sum(overdue));
        dom.sumOverdueNote.textContent = `${overdue.length} 筆`;
        dom.sumBack.textContent = money(back.reduce((s, r) => s + App.num(r.ReturnedAmount), 0));
        dom.sumLost.textContent = money(lost);

        const list = rows
            .filter(r => !st || (st === "open") === !returned(r))
            .filter(r => !kw || [r.EventName, r.Payee, r.Note].some(v => App.like(v, kw)))
            .sort((a, b) => date(b.EventDate).localeCompare(date(a.EventDate)));

        dom.listCount.textContent = `共 ${list.length} 筆`;

        dom.listBody.innerHTML = list.length ? list.map(r => {
            const due = dueOf(r);
            const badge = returned(r)
                ? `<span class="badge bg-success">已退還${App.num(r.ReturnedAmount) < App.num(r.Amount) ? `（少 ${money(App.num(r.Amount) - App.num(r.ReturnedAmount))}）` : ""}</span>`
                : due < today ? `<span class="badge bg-danger">逾期 ${Billing.diff(due, today)} 天</span>`
                    : `<span class="badge bg-warning text-dark">未退還</span>`;
            return `
<tr class="clickable ${current && current.ID === r.ID ? "active" : ""}" data-id="${esc(r.ID)}">
    <td>${esc(date(r.EventDate))}</td>
    <td><div class="fw-bold">${esc(r.EventName || "")}</div><div class="small text-muted">${esc(r.Payee || "")}</div></td>
    <td class="text-end">${money(r.Amount)}</td>
    <td>${returned(r) ? esc(date(r.ReturnedDate)) : esc(due)}</td>
    <td>${badge}</td>
</tr>`;
        }).join("") : `<tr><td colspan="5" class="text-muted">沒有資料</td></tr>`;
    }

    function renderStallOptions() {
        const keep = dom.StallId.value;
        dom.StallId.innerHTML = `<option value="">（不指定）</option>` + stalls
            .slice().sort((a, b) => date(b.StallDate).localeCompare(date(a.StallDate)))
            .map(s => `<option value="${App.esc(s.ID)}">${App.esc(date(s.StallDate))}　${App.esc(s.EventName || "")}${s.Organizer ? `（${App.esc(s.Organizer)}）` : ""}</option>`).join("");
        dom.StallId.value = keep;
    }

    function fillFromStall() {
        const s = stalls.find(x => String(x.ID) === dom.StallId.value);
        if (!s) return;
        dom.EventDate.value = date(s.StallDate);
        dom.EventName.value = s.EventName || "";
        if (!dom.Payee.value) dom.Payee.value = s.Organizer || s.EventName || "";
        if (!dom.PaidDate.value) dom.PaidDate.value = date(s.StallDate);
    }

    function openCreate() {
        current = null;
        dom.depForm.reset();
        dom.formTitle.textContent = "➕ 新增保證金";
        dom.btnCreate.disabled = false;
        dom.btnUpdate.disabled = true;
        dom.btnDelete.disabled = true;
        render();
    }

    function loadDetail(r) {
        if (!r) return;
        current = r;
        FIELDS.forEach(f => dom[f].value = DATE_FIELDS.includes(f) ? date(r[f]) : (r[f] ?? ""));
        dom.StallId.value = r.StallId ? String(r.StallId) : "";
        dom.formTitle.textContent = "✏️ 修改保證金";
        dom.btnCreate.disabled = true;
        dom.btnUpdate.disabled = false;
        dom.btnDelete.disabled = false;
        render();
        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function readForm() {
        const d = {};
        FIELDS.forEach(f => d[f] = ["Amount", "ReturnedAmount"].includes(f) ? App.numOrNull(dom[f].value) : dom[f].value.trim());
        d.StallId = App.numOrNull(dom.StallId.value);
        d.Status = d.ReturnedDate ? "已退還" : "未退還";
        if (d.ReturnedDate && d.ReturnedAmount === null) d.ReturnedAmount = d.Amount;
        return d;
    }

    async function save(isCreate) {

        const d = readForm();
        if (!d.Amount) return alert("請輸入保證金金額");
        if (!d.Payee && !d.EventName) return alert("請輸入付款對象或活動名稱");

        try {
            const row = isCreate
                ? await API.insert("Deposits", d, { loadingText: "新增中…" })
                : await API.update("Deposits", current.ID, d, { loadingText: "儲存中…" });
            const i = rows.findIndex(r => r.ID === row.ID);
            if (i >= 0) rows[i] = row; else rows.push(row);
            alert(isCreate ? "🎉 已新增保證金" : "✅ 已儲存");
            loadDetail(row);
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function remove() {
        if (!current || !confirm(`確定刪除「${current.EventName || current.Payee}」這筆保證金？`)) return;
        try {
            await API.remove("Deposits", current.ID, { loadingText: "刪除中…" });
            rows = rows.filter(r => r.ID !== current.ID);
            openCreate();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    return { init };
})();
