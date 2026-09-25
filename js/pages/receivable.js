window.Pages = window.Pages || {};

// =========================================================
// 帳務管理（Receivable 工作表）
//   狀態：已收 ≥ 應收 → 已付款；已收 > 0 → 部分付款；否則未付款
//   逾期：未付清且到期日早於今天
// =========================================================
Pages.Receivable = (() => {

    "use strict";

    const dom = {};
    const FIELDS = ["Item", "BillDate", "DueDate", "Amount", "PaidAmount", "PaymentMethod", "PaymentDate", "InvoiceNo", "Note", "PayerName"];

    let records = [];
    let companies = [];
    let current = null;
    let listCache = [];

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        try {

            const data = await API.getMany(["Receivable", "Companies"]);

            records = data.Receivable || [];
            companies = (data.Companies || []).sort((a, b) => String(a.CompanyName).localeCompare(String(b.CompanyName), "zh-Hant"));

            renderCompanyOptions();
            openCreate(false);
            render();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "arForm", "formCard", "formTitle", "editHint", "CompanyId", "statusPreview", "btnPaidFull",
            "btnNew", "btnCreate", "btnUpdate", "btnDelete", "btnClear", "qStatus", "qStore", "qMonth", "qKeyword",
            "sumAmount", "sumPaid", "sumUnpaid", "sumOverdue", "sumOverdueCount", "storeBody", "listBody", "emptyHint"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        ["qStatus", "qStore", "qMonth"].forEach(id => dom[id].addEventListener("change", render));
        dom.qKeyword.addEventListener("input", render);

        dom.btnNew.addEventListener("click", () => openCreate(true));
        dom.btnClear.addEventListener("click", () => openCreate(false));
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);

        dom.btnPaidFull.addEventListener("click", () => {
            dom.PaidAmount.value = dom.Amount.value;
            if (!dom.PaymentDate.value) dom.PaymentDate.value = today();
            updateStatusPreview();
        });

        dom.CompanyId.addEventListener("change", () => {
            dom.PayerName.classList.toggle("d-none", dom.CompanyId.value !== "other");
        });

        ["Amount", "PaidAmount", "DueDate"].forEach(id => dom[id].addEventListener("input", updateStatusPreview));

        dom.listBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-index]");
            if (tr) loadDetail(listCache[tr.dataset.index]);
        });

        dom.storeBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-store]");
            if (!tr) return;
            dom.qStore.value = dom.qStore.value === tr.dataset.store ? "" : tr.dataset.store;
            render();
        });
    }

    // =========================
    // 工具
    // =========================
    function today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    function statusOf(amount, paid) {
        amount = App.num(amount);
        paid = App.num(paid);
        if (amount > 0 && paid >= amount) return "已付款";
        if (paid > 0) return "部分付款";
        return "未付款";
    }

    function isOverdue(r) {
        const due = App.toDateInput(r.DueDate);
        return !!due && due < today() && statusOf(r.Amount, r.PaidAmount) !== "已付款";
    }

    function storeName(r) {
        const c = companies.find(x => String(x.ID) === String(r.CompanyId));
        return c ? c.CompanyName : (r.PayerName || "（未指定）");
    }

    function storeKey(r) {
        return r.CompanyId ? "c" + r.CompanyId : "n" + (r.PayerName || "");
    }

    function badge(r) {
        if (isOverdue(r)) return `<span class="badge bg-danger">逾期</span>`;
        const s = statusOf(r.Amount, r.PaidAmount);
        return `<span class="badge ${s === "已付款" ? "bg-success" : s === "部分付款" ? "bg-warning text-dark" : "bg-secondary"}">${s}</span>`;
    }

    // =========================
    // 畫面
    // =========================
    function renderCompanyOptions() {

        dom.CompanyId.innerHTML = "";
        dom.CompanyId.add(new Option("請選擇店家", ""));
        companies.forEach(c => dom.CompanyId.add(new Option(c.CompanyName, c.ID)));
        dom.CompanyId.add(new Option("其他（手動輸入）", "other"));
    }

    function render() {

        renderSummary();
        renderStores();
        renderList();
    }

    function renderSummary() {

        const sum = (list, f) => list.reduce((s, r) => s + App.num(r[f]), 0);
        const overdue = records.filter(isOverdue);
        const amount = sum(records, "Amount");
        const paid = sum(records, "PaidAmount");

        dom.sumAmount.textContent = money(amount);
        dom.sumPaid.textContent = money(paid);
        dom.sumUnpaid.textContent = money(amount - paid);
        dom.sumOverdue.textContent = money(sum(overdue, "Amount") - sum(overdue, "PaidAmount"));
        dom.sumOverdueCount.textContent = overdue.length ? `${overdue.length} 筆` : "";
    }

    function renderStores() {

        const groups = {};

        records.forEach(r => {
            const k = storeKey(r);
            const g = groups[k] = groups[k] || { key: k, name: storeName(r), count: 0, amount: 0, paid: 0, overdue: 0 };
            g.count++;
            g.amount += App.num(r.Amount);
            g.paid += App.num(r.PaidAmount);
            if (isOverdue(r)) g.overdue += App.num(r.Amount) - App.num(r.PaidAmount);
        });

        const list = Object.values(groups).sort((a, b) => (b.amount - b.paid) - (a.amount - a.paid));
        const esc = App.esc;
        const selected = dom.qStore.value;

        // 篩選下拉
        dom.qStore.innerHTML = "";
        dom.qStore.add(new Option("全部店家", ""));
        list.forEach(g => dom.qStore.add(new Option(g.name, g.key)));
        dom.qStore.value = selected;

        dom.storeBody.innerHTML = list.map(g => `
<tr class="clickable ${selected === g.key ? "table-primary" : ""}" data-store="${esc(g.key)}">
    <td><b>${esc(g.name)}</b></td>
    <td class="text-end">${g.count}</td>
    <td class="text-end">${money(g.amount)}</td>
    <td class="text-end text-success">${money(g.paid)}</td>
    <td class="text-end ${g.amount - g.paid > 0 ? "text-warning fw-bold" : ""}">${money(g.amount - g.paid)}</td>
    <td class="text-end ${g.overdue > 0 ? "text-danger fw-bold" : "text-muted"}">${money(g.overdue)}</td>
</tr>`).join("") || `<tr><td colspan="6" class="text-muted small">尚無帳款</td></tr>`;
    }

    function renderList() {

        const status = dom.qStatus.value;
        const store = dom.qStore.value;
        const month = dom.qMonth.value;
        const kw = dom.qKeyword.value.trim();
        const esc = App.esc;

        listCache = records
            .filter(r =>
                (!store || storeKey(r) === store) &&
                (!month || App.toDateInput(r.BillDate).startsWith(month)) &&
                (!kw || App.like(r.Item, kw) || App.like(r.InvoiceNo, kw) || App.like(r.Note, kw) || App.like(storeName(r), kw)) &&
                (!status ||
                    (status === "unpaid" && statusOf(r.Amount, r.PaidAmount) !== "已付款") ||
                    (status === "overdue" && isOverdue(r)) ||
                    (status === "已付款" && statusOf(r.Amount, r.PaidAmount) === "已付款")))
            .sort((a, b) => String(b.BillDate).localeCompare(String(a.BillDate)));

        dom.emptyHint.classList.toggle("d-none", listCache.length > 0);

        dom.listBody.innerHTML = listCache.map((r, i) => `
<tr class="clickable ${current && current.ReceivableID === r.ReceivableID ? "table-primary" : ""}" data-index="${i}">
    <td>${esc(App.toDateInput(r.BillDate))}</td>
    <td>${esc(storeName(r))}</td>
    <td>${esc(r.Item || "")}</td>
    <td class="text-end">${money(r.Amount)}</td>
    <td class="text-end">${money(r.PaidAmount)}</td>
    <td class="${isOverdue(r) ? "text-danger fw-bold" : ""}">${esc(App.toDateInput(r.DueDate) || "-")}</td>
    <td>${badge(r)}</td>
</tr>`).join("");
    }

    // =========================
    // 表單
    // =========================
    function updateStatusPreview() {

        const r = { Amount: dom.Amount.value, PaidAmount: dom.PaidAmount.value, DueDate: dom.DueDate.value };
        dom.statusPreview.value = isOverdue(r) ? "逾期" : statusOf(r.Amount, r.PaidAmount);
    }

    function setMode(edit) {

        dom.formTitle.textContent = edit ? "✏️ 修改帳款" : "➕ 新增帳款";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate(scroll) {

        current = null;
        dom.arForm.reset();
        dom.BillDate.value = today();
        dom.PayerName.classList.add("d-none");
        setMode(false);
        updateStatusPreview();
        renderList();

        if (scroll) dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function loadDetail(r) {

        if (!r) return;

        current = r;

        FIELDS.forEach(f => {
            dom[f].value = ["BillDate", "DueDate", "PaymentDate"].includes(f) ? App.toDateInput(r[f]) : (r[f] ?? "");
        });

        const known = companies.some(c => String(c.ID) === String(r.CompanyId));
        dom.CompanyId.value = known ? String(r.CompanyId) : (r.PayerName ? "other" : "");
        dom.PayerName.classList.toggle("d-none", dom.CompanyId.value !== "other");

        setMode(true);
        updateStatusPreview();
        renderList();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function readForm() {

        const companyId = dom.CompanyId.value;
        const company = companies.find(c => String(c.ID) === companyId);

        return {
            CompanyId: company ? company.ID : null,
            PayerName: company ? company.CompanyName : dom.PayerName.value.trim(),
            Item: dom.Item.value.trim(),
            BillDate: dom.BillDate.value,
            DueDate: dom.DueDate.value,
            Amount: App.numOrNull(dom.Amount.value),
            PaidAmount: App.numOrNull(dom.PaidAmount.value) ?? 0,
            PaymentMethod: dom.PaymentMethod.value,
            PaymentDate: dom.PaymentDate.value,
            InvoiceNo: dom.InvoiceNo.value.trim(),
            PaymentStatus: statusOf(dom.Amount.value, dom.PaidAmount.value),
            Note: dom.Note.value.trim()
        };
    }

    async function save(isCreate) {

        const data = readForm();

        if (!data.PayerName) {
            alert("請選擇店家");
            return;
        }

        if (!data.Item || !data.BillDate || data.Amount === null) {
            alert("請輸入項目、帳單日期與應收金額");
            return;
        }

        try {

            current = isCreate
                ? await API.insert("Receivable", data)
                : await API.update("Receivable", current.ReceivableID, data);

            records = await API.list("Receivable");

            alert(isCreate ? "🎉 帳款已新增" : "✅ 帳款已更新");

            render();
            loadDetail(records.find(r => r.ReceivableID === current.ReceivableID));

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除「${storeName(current)}｜${current.Item}」這筆帳款？`)) return;

        try {

            await API.remove("Receivable", current.ReceivableID);

            records = records.filter(r => r.ReceivableID !== current.ReceivableID);
            openCreate(false);
            render();

            alert("🗑️ 已刪除");

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }

    return {
        init
    };

})();
