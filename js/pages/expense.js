window.Pages = window.Pages || {};

// =========================================================
// 支出表（Expenses 工作表）
// =========================================================
Pages.Expense = (() => {

    "use strict";

    // 分類可自行增減
    const CATEGORIES = ["食材", "包材", "設備", "市集攤位", "交通運輸", "人事", "租金", "水電瓦斯", "行銷廣告", "手續費", "稅務", "雜支"];
    const FIELDS = ["ExpenseDate", "Category", "ItemName", "Amount", "PaymentMethod", "Vendor", "InvoiceNo", "Note"];

    const dom = {};

    let records = [];
    let current = null;
    let listCache = [];

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        dom.qMonth.value = today().slice(0, 7);

        try {

            const data = await API.getMany(["Expenses", "Companies"]);

            records = data.Expenses || [];

            dom.vendorList.innerHTML = (data.Companies || [])
                .map(c => `<option value="${App.esc(c.CompanyName)}">`).join("");

            renderCategoryOptions();
            openCreate(false);
            render();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "expenseForm", "formCard", "formTitle", "editHint", "IsPaid", "vendorList",
            "btnNew", "btnCreate", "btnUpdate", "btnDelete", "btnClear",
            "qMonth", "qCategory", "qPaid", "qKeyword",
            "sumPeriod", "sumPeriodLabel", "sumYear", "sumUnpaid", "sumTop",
            "categoryBars", "listBody", "listSummary", "emptyHint"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        ["qMonth", "qCategory", "qPaid"].forEach(id => dom[id].addEventListener("change", render));
        dom.qKeyword.addEventListener("input", render);

        dom.btnNew.addEventListener("click", () => openCreate(true));
        dom.btnClear.addEventListener("click", () => openCreate(false));
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);

        dom.listBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-index]");
            if (tr) loadDetail(listCache[tr.dataset.index]);
        });
    }

    function today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    function allCategories() {
        const extra = records.map(r => r.Category).filter(c => c && !CATEGORIES.includes(c));
        return CATEGORIES.concat([...new Set(extra)]);
    }

    function renderCategoryOptions() {

        const cats = allCategories();

        dom.qCategory.innerHTML = "";
        dom.qCategory.add(new Option("全部分類", ""));
        cats.forEach(c => dom.qCategory.add(new Option(c, c)));

        const selected = dom.Category.value;
        dom.Category.innerHTML = "";
        cats.forEach(c => dom.Category.add(new Option(c, c)));
        if (selected) dom.Category.value = selected;
    }

    // =========================
    // 畫面
    // =========================
    function render() {

        const month = dom.qMonth.value;
        const cat = dom.qCategory.value;
        const paid = dom.qPaid.value;
        const kw = dom.qKeyword.value.trim();
        const year = today().slice(0, 4);
        const date = r => App.toDateInput(r.ExpenseDate);
        const sum = list => list.reduce((s, r) => s + App.num(r.Amount), 0);

        const periodList = records.filter(r => !month || date(r).startsWith(month));

        dom.sumPeriodLabel.textContent = month ? `${month} 支出` : "全部支出";
        dom.sumPeriod.textContent = money(sum(periodList));
        dom.sumYear.textContent = money(sum(records.filter(r => date(r).startsWith(year))));
        dom.sumUnpaid.textContent = money(sum(records.filter(r => r.IsPaid === false)));

        // 分類統計（依目前月份）
        const byCat = {};
        periodList.forEach(r => byCat[r.Category || "未分類"] = (byCat[r.Category || "未分類"] || 0) + App.num(r.Amount));
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const total = sum(periodList) || 1;

        dom.sumTop.textContent = cats[0] ? cats[0][0] : "-";

        dom.categoryBars.innerHTML = cats.map(([c, v]) => `
<div class="d-flex align-items-center gap-2 small mb-1">
    <div style="width:80px">${App.esc(c)}</div>
    <div class="progress flex-fill" style="height:10px"><div class="progress-bar bg-danger" style="width:${(v / total * 100).toFixed(1)}%"></div></div>
    <div style="width:130px" class="text-end">${money(v)}（${(v / total * 100).toFixed(0)}%）</div>
</div>`).join("") || `<div class="text-muted small">此期間沒有支出</div>`;

        // 明細
        listCache = periodList
            .filter(r =>
                (!cat || r.Category === cat) &&
                (!paid || (paid === "paid") === (r.IsPaid !== false)) &&
                (!kw || App.like(r.ItemName, kw) || App.like(r.Vendor, kw) || App.like(r.Note, kw)))
            .sort((a, b) => date(b).localeCompare(date(a)) || b.ID - a.ID);

        dom.listSummary.textContent = `${listCache.length} 筆，合計 ${money(sum(listCache))}`;
        dom.emptyHint.classList.toggle("d-none", listCache.length > 0);

        const esc = App.esc;

        dom.listBody.innerHTML = listCache.map((r, i) => `
<tr class="clickable ${current && current.ID === r.ID ? "table-primary" : ""}" data-index="${i}">
    <td>${esc(date(r))}</td>
    <td><span class="badge bg-light text-dark border">${esc(r.Category || "")}</span></td>
    <td>${esc(r.ItemName || "")}</td>
    <td>${esc(r.Vendor || "")}</td>
    <td class="text-end">${money(r.Amount)}</td>
    <td>${r.IsPaid === false ? `<span class="badge bg-danger">未付</span>` : `<span class="badge bg-success">已付</span>`}</td>
</tr>`).join("");
    }

    // =========================
    // 表單
    // =========================
    function setMode(edit) {

        dom.formTitle.textContent = edit ? "✏️ 修改支出" : "➕ 新增支出";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate(scroll) {

        current = null;
        dom.expenseForm.reset();
        dom.ExpenseDate.value = today();
        dom.IsPaid.checked = true;
        setMode(false);
        render();

        if (scroll) dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function loadDetail(r) {

        if (!r) return;

        current = r;

        FIELDS.forEach(f => dom[f].value = f === "ExpenseDate" ? App.toDateInput(r[f]) : (r[f] ?? ""));
        dom.IsPaid.checked = r.IsPaid !== false;

        setMode(true);
        render();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function save(isCreate) {

        const data = {
            ExpenseDate: dom.ExpenseDate.value,
            Category: dom.Category.value,
            ItemName: dom.ItemName.value.trim(),
            Amount: App.numOrNull(dom.Amount.value),
            PaymentMethod: dom.PaymentMethod.value,
            Vendor: dom.Vendor.value.trim(),
            InvoiceNo: dom.InvoiceNo.value.trim(),
            IsPaid: dom.IsPaid.checked,
            Note: dom.Note.value.trim()
        };

        if (!data.ExpenseDate || !data.ItemName || data.Amount === null) {
            alert("請輸入日期、項目與金額");
            return;
        }

        try {

            current = isCreate
                ? await API.insert("Expenses", data)
                : await API.update("Expenses", current.ID, data);

            records = await API.list("Expenses");

            alert(isCreate ? "🎉 支出已新增" : "✅ 支出已更新");

            if (isCreate) openCreate(false);
            else loadDetail(records.find(r => r.ID === current.ID));

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除「${current.ItemName}」${money(current.Amount)}？`)) return;

        try {

            await API.remove("Expenses", current.ID);

            records = records.filter(r => r.ID !== current.ID);
            openCreate(false);

            alert("🗑️ 已刪除");

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }

    return {
        init
    };

})();
