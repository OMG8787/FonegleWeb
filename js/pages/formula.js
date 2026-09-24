window.Pages = window.Pages || {};

// =========================================================
// 配方與成本試算（Formula + FormulaDetail）
//   原料成本 = Σ 用量 × 單價
//   總成本   = 原料成本 + 包材 + 人工 + 其他（皆為一批）
//   單位成本 = 總成本 ÷ 一批產量
// =========================================================
Pages.Formula = (() => {

    "use strict";

    const dom = {};
    const FIELDS = ["FormulaName", "FormulaCode", "VersionNo", "ProductID", "YieldQty", "YieldUnit",
        "PackagingCost", "LaborCost", "OtherCost", "TargetPrice", "TargetCostRate", "Description"];

    let formulas = [];
    let allDetails = [];
    let materials = [];
    let products = [];
    let rows = [];          // 編輯中的原料明細
    let current = null;
    let listCache = [];

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        try {

            const data = await API.getMany(["Formula", "FormulaDetail", "Material", "Products"]);

            formulas = data.Formula || [];
            allDetails = data.FormulaDetail || [];
            materials = (data.Material || []).filter(m => m.IsActive !== false);
            products = data.Products || [];

            renderProductOptions();
            openCreate(false);
            renderList();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "formulaForm", "formCard", "formTitle", "editHint", "IsActive", "qKeyword", "qInactive",
            "formulaList", "emptyHint", "listCount", "detailList", "btnAddMaterial", "btnNew", "btnCreate",
            "btnUpdate", "btnCopy", "btnDelete", "btnClear", "rUnitCost", "rUnitHint", "rMaterialCost",
            "rTotalCost", "rProfit", "rMargin", "rSuggest", "planQty", "planSummary", "planList"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        dom.qKeyword.addEventListener("input", renderList);
        dom.qInactive.addEventListener("change", renderList);

        dom.btnNew.addEventListener("click", () => openCreate(true));
        dom.btnClear.addEventListener("click", () => openCreate(false));
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnCopy.addEventListener("click", copyAsNew);
        dom.btnDelete.addEventListener("click", remove);
        dom.btnAddMaterial.addEventListener("click", () => {
            rows.push({ MaterialID: "", MaterialName: "", Quantity: "", Unit: "", UnitCost: "" });
            renderRows();
        });

        dom.ProductID.addEventListener("change", () => {
            const p = products.find(x => String(x.ID) === dom.ProductID.value);
            if (p && p.SalePrice !== null && p.SalePrice !== undefined) dom.TargetPrice.value = p.SalePrice;
            calculate();
        });

        dom.formulaForm.addEventListener("input", e => {
            if (e.target.classList.contains("calc")) calculate();
        });

        dom.planQty.addEventListener("input", renderPlan);

        dom.detailList.addEventListener("change", onDetailChange);
        dom.detailList.addEventListener("input", onDetailChange);
        dom.detailList.addEventListener("click", e => {
            const btn = e.target.closest("[data-remove]");
            if (!btn) return;
            rows.splice(Number(btn.dataset.remove), 1);
            renderRows();
        });

        dom.formulaList.addEventListener("click", e => {
            const card = e.target.closest(".formula-card");
            if (card) loadDetail(listCache[card.dataset.index]);
        });
    }

    // =========================
    // 計算
    // =========================
    function money(v, digits = 0) {
        const n = Number(v) || 0;
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function lineCost(r) {
        return App.num(r.Quantity) * App.num(r.UnitCost);
    }

    function compute() {

        const materialCost = rows.reduce((s, r) => s + lineCost(r), 0);
        const totalCost = materialCost + App.num(dom.PackagingCost.value) + App.num(dom.LaborCost.value) + App.num(dom.OtherCost.value);
        const yieldQty = App.num(dom.YieldQty.value);
        const unitCost = yieldQty > 0 ? totalCost / yieldQty : 0;

        return { materialCost, totalCost, yieldQty, unitCost };
    }

    function calculate() {

        const c = compute();
        const price = App.num(dom.TargetPrice.value);
        const rate = App.num(dom.TargetCostRate.value);

        dom.rUnitCost.textContent = c.yieldQty > 0 ? money(c.unitCost, 2) : "-";
        dom.rUnitHint.textContent = c.yieldQty > 0 ? `每${dom.YieldUnit.value || "單位"}` : "請輸入一批產量";
        dom.rMaterialCost.textContent = money(c.materialCost, 1);
        dom.rTotalCost.textContent = money(c.totalCost, 1);

        if (price > 0 && c.yieldQty > 0) {
            const profit = price - c.unitCost;
            dom.rProfit.textContent = money(profit, 2);
            dom.rProfit.className = profit >= 0 ? "good" : "bad";
            dom.rMargin.textContent = `${(profit / price * 100).toFixed(1)}% / ${(c.unitCost / price * 100).toFixed(1)}%`;
        } else {
            dom.rProfit.textContent = "-";
            dom.rProfit.className = "";
            dom.rMargin.textContent = "-";
        }

        dom.rSuggest.textContent = rate > 0 && c.yieldQty > 0 ? money(c.unitCost / (rate / 100), 0) : "-";

        // 更新明細小計
        rows.forEach((r, i) => {
            const el = dom.detailList.querySelector(`[data-subtotal="${i}"]`);
            if (el) el.textContent = money(lineCost(r), 1);
        });

        renderPlan();
    }

    function renderPlan() {

        const plan = App.num(dom.planQty.value);
        const c = compute();

        if (!plan || !c.yieldQty) {
            dom.planSummary.textContent = "輸入數量後自動計算所需原料";
            dom.planList.innerHTML = "";
            return;
        }

        const factor = plan / c.yieldQty;
        const esc = App.esc;

        dom.planSummary.innerHTML = `約 <b>${factor.toFixed(2)}</b> 批，預估總成本 <b>${money(c.totalCost * factor)}</b>`;

        dom.planList.innerHTML = rows
            .filter(r => r.MaterialName || r.MaterialID)
            .map(r => `
<tr>
    <td>${esc(r.MaterialName || materialName(r.MaterialID))}</td>
    <td class="text-end">${(App.num(r.Quantity) * factor).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${esc(r.Unit || "")}</td>
    <td class="text-end text-muted">${money(lineCost(r) * factor)}</td>
</tr>`).join("");
    }

    // =========================
    // 原料明細
    // =========================
    function materialName(id) {
        return materials.find(m => String(m.ID) === String(id))?.MaterialName || "";
    }

    function renderRows() {

        const esc = App.esc;
        const options = materials.map(m => `<option value="${m.ID}">${esc(m.MaterialName)}</option>`).join("");

        dom.detailList.innerHTML = rows.map((r, i) => {

            const known = r.MaterialID && materials.some(m => String(m.ID) === String(r.MaterialID));

            return `
<tr>
    <td>
        <select class="form-select form-select-sm" data-i="${i}" data-f="MaterialID">
            <option value="">自訂原料</option>
            ${options}
        </select>
        <input class="form-control form-control-sm mt-1 ${known ? "d-none" : ""}" data-i="${i}" data-f="MaterialName"
            value="${esc(r.MaterialName || "")}" placeholder="原料名稱">
    </td>
    <td><input type="number" min="0" step="0.001" class="form-control form-control-sm" data-i="${i}" data-f="Quantity" value="${esc(r.Quantity ?? "")}"></td>
    <td><input class="form-control form-control-sm" data-i="${i}" data-f="Unit" value="${esc(r.Unit || "")}" style="width:70px"></td>
    <td><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-i="${i}" data-f="UnitCost" value="${esc(r.UnitCost ?? "")}"></td>
    <td class="text-end" data-subtotal="${i}">${money(lineCost(r), 1)}</td>
    <td><button type="button" class="btn btn-sm btn-outline-danger" data-remove="${i}">✕</button></td>
</tr>`;
        }).join("") || `<tr><td colspan="6" class="text-muted small">尚未加入原料</td></tr>`;

        rows.forEach((r, i) => {
            const sel = dom.detailList.querySelector(`select[data-i="${i}"]`);
            if (sel) sel.value = materials.some(m => String(m.ID) === String(r.MaterialID)) ? String(r.MaterialID) : "";
        });

        calculate();
    }

    function onDetailChange(e) {

        const i = Number(e.target.dataset.i);
        const f = e.target.dataset.f;

        if (isNaN(i) || !f) return;

        const r = rows[i];

        if (f === "MaterialID") {

            const m = materials.find(x => String(x.ID) === e.target.value);

            r.MaterialID = m ? m.ID : "";
            r.MaterialName = m ? m.MaterialName : "";

            if (m) {
                r.Unit = m.Unit || r.Unit;
                r.UnitCost = m.CostPrice ?? r.UnitCost;
            }

            if (e.type === "change") renderRows();
            return;
        }

        r[f] = e.target.value;
        calculate();
    }

    // =========================
    // 列表
    // =========================
    function renderProductOptions() {

        dom.ProductID.innerHTML = "";
        dom.ProductID.add(new Option("（不指定）", ""));
        products.forEach(p => dom.ProductID.add(new Option(`${p.ProductName}${p.SalePrice ? `（售價 $${p.SalePrice}）` : ""}`, p.ID)));
    }

    function renderList() {

        const kw = dom.qKeyword.value.trim();
        const esc = App.esc;

        listCache = formulas
            .filter(f => dom.qInactive.checked || f.IsActive !== false)
            .filter(f => !kw ||
                App.like(f.FormulaName, kw) || App.like(f.FormulaCode, kw) ||
                allDetails.some(d => d.FormulaID === f.FormulaID && App.like(d.MaterialName, kw)))
            .sort((a, b) => String(a.FormulaName).localeCompare(String(b.FormulaName), "zh-Hant"));

        dom.listCount.textContent = `${listCache.length} 筆`;
        dom.emptyHint.classList.toggle("d-none", listCache.length > 0);

        dom.formulaList.innerHTML = listCache.map((f, i) => {

            const price = App.num(f.TargetPrice);
            const unit = App.num(f.UnitCost);
            const rate = price > 0 && unit > 0 ? unit / price : null;

            return `
<div class="formula-card ${current && current.FormulaID === f.FormulaID ? "active" : ""}" data-index="${i}">
    <div class="d-flex justify-content-between">
        <b>🧪 ${esc(f.FormulaName || "")}</b>
        ${f.IsActive === false ? `<span class="badge bg-secondary">停用</span>` : ""}
    </div>
    <div class="small text-muted">${esc(f.FormulaCode || "")} ${esc(f.VersionNo || "")}　產量 ${f.YieldQty ?? "-"} ${esc(f.YieldUnit || "")}</div>
    <div class="small">單位成本 <b>${unit ? money(unit, 2) : "-"}</b>
        ${rate !== null ? `　成本率 <b class="${rate <= 0.35 ? "good" : "bad"}">${(rate * 100).toFixed(1)}%</b>` : ""}</div>
</div>`;
        }).join("");
    }

    // =========================
    // 表單
    // =========================
    function setMode(edit) {

        dom.formTitle.textContent = edit ? "✏️ 修改配方" : "➕ 新增配方";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnCopy.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate(scroll) {

        current = null;
        dom.formulaForm.reset();
        dom.IsActive.checked = true;
        dom.planQty.value = "";
        rows = [];
        setMode(false);
        renderRows();
        renderList();

        if (scroll) dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function loadDetail(f) {

        if (!f) return;

        current = f;

        FIELDS.forEach(k => dom[k].value = f[k] ?? "");
        dom.ProductID.value = f.ProductID ? String(f.ProductID) : "";
        dom.IsActive.checked = f.IsActive !== false;

        rows = allDetails
            .filter(d => d.FormulaID === f.FormulaID)
            .sort((a, b) => a.FormulaDetailID - b.FormulaDetailID)
            .map(d => ({
                MaterialID: d.MaterialID ?? "",
                MaterialName: d.MaterialName || materialName(d.MaterialID),
                Quantity: d.Quantity ?? "",
                Unit: d.Unit || "",
                UnitCost: d.UnitCost ?? materials.find(m => String(m.ID) === String(d.MaterialID))?.CostPrice ?? ""
            }));

        setMode(true);
        renderRows();
        renderList();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function buildData() {

        const c = compute();

        return {
            formula: {
                FormulaName: dom.FormulaName.value.trim(),
                FormulaCode: dom.FormulaCode.value.trim(),
                VersionNo: dom.VersionNo.value.trim(),
                ProductID: dom.ProductID.value,
                YieldQty: App.numOrNull(dom.YieldQty.value),
                YieldUnit: dom.YieldUnit.value.trim(),
                PackagingCost: App.numOrNull(dom.PackagingCost.value),
                LaborCost: App.numOrNull(dom.LaborCost.value),
                OtherCost: App.numOrNull(dom.OtherCost.value),
                TargetPrice: App.numOrNull(dom.TargetPrice.value),
                TargetCostRate: App.numOrNull(dom.TargetCostRate.value),
                MaterialCost: Math.round(c.materialCost * 100) / 100,
                TotalCost: Math.round(c.totalCost * 100) / 100,
                UnitCost: Math.round(c.unitCost * 100) / 100,
                Description: dom.Description.value.trim(),
                IsActive: dom.IsActive.checked
            },
            details: rows
                .filter(r => r.MaterialID || String(r.MaterialName || "").trim())
                .map(r => ({
                    MaterialID: r.MaterialID ? String(r.MaterialID) : "",
                    MaterialName: r.MaterialName || materialName(r.MaterialID),
                    Quantity: App.numOrNull(r.Quantity),
                    Unit: r.Unit || "",
                    UnitCost: App.numOrNull(r.UnitCost),
                    LineCost: Math.round(lineCost(r) * 100) / 100
                }))
        };
    }

    async function reload() {

        const data = await API.getMany(["Formula", "FormulaDetail"]);
        formulas = data.Formula || [];
        allDetails = data.FormulaDetail || [];
    }

    async function save(isCreate, overrideName) {

        const { formula, details } = buildData();

        if (overrideName) {
            formula.FormulaName = overrideName;
            formula.FormulaCode = "";
        }

        if (!formula.FormulaName) {
            alert("請輸入配方名稱");
            return;
        }

        if (!formula.YieldQty) {
            alert("請輸入一批產量（用來計算單位成本）");
            return;
        }

        if (isCreate && formula.FormulaCode && formulas.some(f => f.FormulaCode === formula.FormulaCode)) {
            alert("⚠️ 配方代碼已存在");
            return;
        }

        try {

            let id;

            if (isCreate) {

                const res = await API.batch([
                    { action: "insert", table: "Formula", data: formula },
                    ...details.map(d => ({ action: "insert", table: "FormulaDetail", data: { ...d, FormulaID: "$0.FormulaID" } }))
                ]);

                id = res[0].FormulaID;

            } else {

                id = current.FormulaID;

                await API.batch([
                    { action: "update", table: "Formula", id, data: formula },
                    { action: "removeWhere", table: "FormulaDetail", where: { FormulaID: id }, replace: true },
                    ...details.map(d => ({ action: "insert", table: "FormulaDetail", data: { ...d, FormulaID: id } }))
                ]);
            }

            await reload();

            alert(`${isCreate ? "🎉 配方已建立" : "✅ 配方已更新"}\n單位成本：${money(formula.UnitCost, 2)}`);

            loadDetail(formulas.find(f => f.FormulaID === id));

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    function copyAsNew() {

        if (!current) return;

        const name = prompt("新配方名稱", `${current.FormulaName}（複製）`);

        if (name) save(true, name.trim());
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除配方「${current.FormulaName}」？`)) return;

        try {

            await API.batch([
                { action: "removeWhere", table: "FormulaDetail", where: { FormulaID: current.FormulaID } },
                { action: "remove", table: "Formula", id: current.FormulaID }
            ]);

            await reload();
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
