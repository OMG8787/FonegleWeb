window.Pages = window.Pages || {};

// =========================================================
// 品牌攤提表（BrandCosts 工作表）
// - 支出：依「攤提月數」平均分攤到每個月（空白 / 0 = 當月一次認列）
// - 回收：手動記錄的收入，可選擇把出攤紀錄的盈虧一起計入
// =========================================================
Pages.Amortization = (() => {

    "use strict";

    const CATEGORIES = ["硬體", "包材", "食材", "人力", "其他"];
    const FIELDS = ["RecordDate", "Type", "Category", "ItemName", "Amount", "AmortizeMonths", "Vendor", "Note"];
    const STORAGE_KEY = "fonegle_amort_include_stall";

    const dom = {};

    let entries = [];
    let stalls = [];
    let current = null;

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        try {
            dom.includeStall.checked = localStorage.getItem(STORAGE_KEY) !== "false";
        } catch { }

        openCreate();

        try {

            const data = await API.getMany(["BrandCosts", "StallRecords"]);

            entries = data.BrandCosts;
            stalls = data.StallRecords;
            render();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "costForm", "formCard", "formTitle", "editHint", "monthlyPreview", "includeStall",
            "btnCreate", "btnUpdate", "btnDelete", "btnClear", "qType", "qCategory",
            "sumInvest", "sumRecovered", "sumRecoveredNote", "sumRemain", "sumMonthly", "sumPayback", "paybackBar",
            "categoryBody", "monthBody", "entryBody", "emptyHint"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);
        dom.btnClear.addEventListener("click", openCreate);

        dom.qType.addEventListener("change", renderEntries);
        dom.qCategory.addEventListener("change", renderEntries);

        dom.includeStall.addEventListener("change", () => {
            try {
                localStorage.setItem(STORAGE_KEY, String(dom.includeStall.checked));
            } catch { }
            render();
        });

        dom.Type.addEventListener("change", updateFormState);
        dom.Amount.addEventListener("input", updateFormState);
        dom.AmortizeMonths.addEventListener("input", updateFormState);

        dom.entryBody.addEventListener("click", e => {
            const btn = e.target.closest("[data-id]");
            if (btn) loadDetail(entries.find(x => x.ID === Number(btn.dataset.id)));
        });
    }

    // =========================
    // 攤提計算
    // =========================
    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    function monthIndex(dateText) {
        const m = String(dateText || "").match(/^(\d{4})-(\d{1,2})/);
        return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
    }

    function monthLabel(index) {
        return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
    }

    const NOW_INDEX = (() => {
        const d = new Date();
        return d.getFullYear() * 12 + d.getMonth();
    })();

    // 某筆支出在指定月份的攤提金額
    function amortOn(e, index) {

        const start = monthIndex(e.RecordDate);
        const amount = App.num(e.Amount);
        const months = Math.max(0, Math.floor(App.num(e.AmortizeMonths)));

        if (start === null) return 0;
        if (months <= 1) return index === start ? amount : 0;

        return index >= start && index < start + months ? amount / months : 0;
    }

    // 截至本月已攤提
    function amortized(e) {

        const start = monthIndex(e.RecordDate);
        const amount = App.num(e.Amount);
        const months = Math.max(0, Math.floor(App.num(e.AmortizeMonths)));

        if (start === null || NOW_INDEX < start) return 0;
        if (months <= 1) return amount;

        return amount / months * Math.min(months, NOW_INDEX - start + 1);
    }

    const isExpense = e => e.Type !== "回收";

    // =========================
    // 畫面
    // =========================
    function render() {

        renderSummary();
        renderCategories();
        renderMonths();
        renderEntries();
    }

    function stallProfit(filterFn = () => true) {
        return dom.includeStall.checked
            ? stalls.filter(filterFn).reduce((s, r) => s + App.num(r.ProfitLoss), 0)
            : 0;
    }

    function renderSummary() {

        const expenses = entries.filter(isExpense);
        const invest = expenses.reduce((s, e) => s + App.num(e.Amount), 0);
        const manual = entries.filter(e => !isExpense(e)).reduce((s, e) => s + App.num(e.Amount), 0);
        const stall = stallProfit();
        const recovered = manual + stall;
        const monthly = expenses.reduce((s, e) => s + amortOn(e, NOW_INDEX), 0);
        const rate = invest ? recovered / invest : 0;

        dom.sumInvest.textContent = money(invest);
        dom.sumRecovered.textContent = money(recovered);
        dom.sumRecoveredNote.textContent = dom.includeStall.checked
            ? `回收紀錄 ${money(manual)} ＋ 出攤盈虧 ${money(stall)}`
            : "僅計回收紀錄";
        dom.sumRemain.textContent = money(Math.max(0, invest - recovered));
        dom.sumMonthly.textContent = money(monthly);
        dom.sumPayback.textContent = invest ? (Math.max(0, rate) * 100).toFixed(1) + "%" : "-";
        dom.paybackBar.style.width = Math.min(100, Math.max(0, rate * 100)) + "%";
    }

    function renderCategories() {

        const invest = entries.filter(isExpense).reduce((s, e) => s + App.num(e.Amount), 0);

        const rows = CATEGORIES.map(cat => {

            const exp = entries.filter(e => isExpense(e) && e.Category === cat);
            const catInvest = exp.reduce((s, e) => s + App.num(e.Amount), 0);
            const done = exp.reduce((s, e) => s + amortized(e), 0);

            return {
                cat,
                invest: catInvest,
                share: invest ? catInvest / invest : 0,
                recovered: entries.filter(e => !isExpense(e) && e.Category === cat).reduce((s, e) => s + App.num(e.Amount), 0),
                done,
                remain: catInvest - done,
                monthly: exp.reduce((s, e) => s + amortOn(e, NOW_INDEX), 0)
            };
        });

        const total = k => rows.reduce((s, r) => s + r[k], 0);

        dom.categoryBody.innerHTML = rows.map(r => `
<tr>
    <td><b>${r.cat}</b></td>
    <td class="text-end">${money(r.invest)}</td>
    <td style="min-width:120px">
        <div class="progress" style="height:8px"><div class="progress-bar" style="width:${(r.share * 100).toFixed(1)}%"></div></div>
        <small class="text-muted">${(r.share * 100).toFixed(1)}%</small>
    </td>
    <td class="text-end profit">${money(r.recovered)}</td>
    <td class="text-end">${money(r.done)}</td>
    <td class="text-end">${money(r.remain)}</td>
    <td class="text-end">${money(r.monthly)}</td>
</tr>`).join("") + `
<tr class="table-light fw-bold">
    <td>合計</td>
    <td class="text-end">${money(total("invest"))}</td>
    <td></td>
    <td class="text-end profit">${money(total("recovered"))}</td>
    <td class="text-end">${money(total("done"))}</td>
    <td class="text-end">${money(total("remain"))}</td>
    <td class="text-end">${money(total("monthly"))}</td>
</tr>`;
    }

    function renderMonths() {

        const rows = [];

        for (let i = NOW_INDEX - 5; i <= NOW_INDEX + 6; i++) {

            const label = monthLabel(i);
            const amort = entries.filter(isExpense).reduce((s, e) => s + amortOn(e, i), 0);
            const recovered = entries.filter(e => !isExpense(e) && monthIndex(e.RecordDate) === i)
                .reduce((s, e) => s + App.num(e.Amount), 0);
            const stall = stallProfit(r => monthIndex(r.StallDate) === i);
            const net = recovered + stall - amort;

            rows.push(`
<tr class="${i === NOW_INDEX ? "table-warning" : ""}">
    <td>${label}${i === NOW_INDEX ? "（本月）" : ""}</td>
    <td class="text-end">${money(amort)}</td>
    <td class="text-end">${money(recovered)}</td>
    <td class="text-end">${dom.includeStall.checked ? money(stall) : "-"}</td>
    <td class="text-end fw-bold ${net >= 0 ? "profit" : "loss"}">${money(net)}</td>
</tr>`);
        }

        dom.monthBody.innerHTML = rows.join("");
    }

    function renderEntries() {

        const esc = App.esc;
        const type = dom.qType.value;
        const cat = dom.qCategory.value;

        const list = entries
            .filter(e => (!type || e.Type === type) && (!cat || e.Category === cat))
            .sort((a, b) => String(b.RecordDate).localeCompare(String(a.RecordDate)));

        dom.emptyHint.classList.toggle("d-none", list.length > 0);

        dom.entryBody.innerHTML = list.map(e => {

            const months = Math.floor(App.num(e.AmortizeMonths));
            const expense = isExpense(e);

            return `
<tr class="${current && current.ID === e.ID ? "table-primary" : ""}">
    <td>${esc(App.toDateInput(e.RecordDate))}</td>
    <td><span class="badge type-badge-${esc(e.Type || "支出")}">${esc(e.Type || "支出")}</span></td>
    <td>${esc(e.Category || "")}</td>
    <td>${esc(e.ItemName || "")}${e.Vendor ? `<div class="small text-muted">${esc(e.Vendor)}</div>` : ""}</td>
    <td class="text-end ${expense ? "" : "profit"}">${money(e.Amount)}</td>
    <td class="text-end">${expense ? (months > 1 ? `${money(App.num(e.Amount) / months)} × ${months}` : "一次") : "-"}</td>
    <td class="text-end">${expense ? money(App.num(e.Amount) - amortized(e)) : "-"}</td>
    <td><button class="btn btn-sm btn-outline-primary" data-id="${e.ID}">編輯</button></td>
</tr>`;
        }).join("");
    }

    // =========================
    // 表單
    // =========================
    function updateFormState() {

        const expense = dom.Type.value !== "回收";
        dom.AmortizeMonths.disabled = !expense;

        if (!expense) {
            dom.AmortizeMonths.value = "";
            dom.monthlyPreview.value = "不攤提";
            return;
        }

        const months = Math.floor(App.num(dom.AmortizeMonths.value));
        const amount = App.num(dom.Amount.value);

        dom.monthlyPreview.value = months > 1 ? money(amount / months) : "一次認列";
    }

    function setMode(mode) {

        const edit = mode === "edit";

        dom.formTitle.textContent = edit ? "✏️ 修改項目" : "➕ 新增項目";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate() {

        current = null;
        dom.costForm.reset();

        const d = new Date();
        dom.RecordDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        setMode("create");
        updateFormState();

        if (entries.length) renderEntries();
    }

    function loadDetail(e) {

        if (!e) return;

        current = e;

        FIELDS.forEach(f => {
            dom[f].value = f === "RecordDate" ? App.toDateInput(e[f]) : (e[f] ?? "");
        });

        dom.Type.value = e.Type === "回收" ? "回收" : "支出";

        setMode("edit");
        updateFormState();
        renderEntries();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function readForm() {

        return {
            RecordDate: dom.RecordDate.value,
            Type: dom.Type.value,
            Category: dom.Category.value,
            ItemName: dom.ItemName.value.trim(),
            Amount: App.numOrNull(dom.Amount.value),
            AmortizeMonths: dom.Type.value === "回收" ? null : App.numOrNull(dom.AmortizeMonths.value),
            Vendor: dom.Vendor.value.trim(),
            Note: dom.Note.value.trim()
        };
    }

    async function save(isCreate) {

        const data = readForm();

        if (!data.RecordDate || !data.ItemName || data.Amount === null) {
            alert("請輸入日期、項目名稱與金額");
            return;
        }

        try {

            if (isCreate)
                await API.insert("BrandCosts", data);
            else
                await API.update("BrandCosts", current.ID, data);

            entries = await API.list("BrandCosts");

            alert(isCreate ? "🎉 已新增" : "✅ 已更新");

            openCreate();
            render();

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除「${current.ItemName}」？`))
            return;

        try {

            await API.remove("BrandCosts", current.ID);

            entries = entries.filter(e => e.ID !== current.ID);

            openCreate();
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
