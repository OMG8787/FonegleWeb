window.Pages = window.Pages || {};

// =========================================================
// 配方與成本試算（Formula + FormulaDetail）
//   基準重量：每個原料的配方重量（FormulaDetail.Quantity，g），合計 = 基準總重
//   目標總重 = 倍數 × 單位重量 ÷ 成品率
//   製作重量 = 基準重量 × 目標總重 ÷ 基準總重
//   原料成本 = Σ 製作重量 × 單價（每 g）
//   單位成本 = 原料成本 ÷ 倍數 + 包材 + 人工 + 其他（每單位）
//
//   Formula 欄位：YieldQty = 預設倍數、YieldUnit = 單位名稱、UnitWeight = 單位重量、YieldRate = 成品率 %
//   舊資料沒有單位重量時：單位重量 = 基準總重 ÷ 預設倍數（預設倍數 = 原本的一批產量）
// =========================================================
Pages.Formula = (() => {

    "use strict";

    const dom = {};
    const FIELDS = ["FormulaName", "FormulaCode", "VersionNo", "ProductID", "YieldQty", "YieldUnit", "UnitWeight", "YieldRate",
        "PackagingCost", "LaborCost", "OtherCost", "TargetPrice", "TargetCostRate", "Description"];

    let formulas = [];
    let allDetails = [];
    let materials = [];
    let products = [];
    let rows = [];          // 編輯中的原料 { MaterialID, MaterialName, Quantity, UnitCost, Remark }
    let current = null;
    let listCache = [];
    let tryMult = null;     // 目前試算倍數（不一定等於預設倍數）

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();
        openCreate(false);

        // 每張表各自讀取，先回來的先顯示（有快取時先顯示上次的資料）
        dom.formulaList.innerHTML = `<div class="text-muted small">載入中…</div>`;

        try {
            await API.getMany(["Formula", "FormulaDetail", "Material", "Products"], {
                onTable(name, rows) {
                    if (name === "Formula") formulas = rows || [];
                    if (name === "FormulaDetail") allDetails = rows || [];
                    if (name === "Material") { materials = (rows || []).filter(m => m.IsActive !== false); renderMaterialNames(); }
                    if (name === "Products") {
                        const keep = dom.ProductID.value;
                        products = rows || [];
                        renderProductOptions();
                        dom.ProductID.value = keep;
                    }
                    if (name === "Formula" || name === "FormulaDetail") renderList();
                }
            });
        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {
        FIELDS.concat([
            "formulaForm", "formCard", "formTitle", "editHint", "IsActive", "qKeyword", "qInactive", "qWarn",
            "formulaList", "emptyHint", "listCount", "detailList", "materialNames", "btnAddMaterial", "btnNormalize",
            "btnRefreshCost", "btnNew", "btnExportAll", "btnCreate", "btnUpdate", "btnCopy", "btnDelete", "btnClear",
            "btnPrint", "btnExcel", "printCost", "tryMult", "tryTotal", "tryUnitLabel", "factorText", "btnSetDefault",
            "sumBase", "sumPct", "sumScaled", "sumCost",
            "rUnitCost", "rUnitHint", "rMaterialCost", "rProfit", "rMargin", "rSuggest"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        dom.qKeyword.addEventListener("input", renderList);
        dom.qInactive.addEventListener("change", renderList);
        dom.qWarn.addEventListener("change", renderList);

        dom.btnNew.addEventListener("click", () => openCreate(true));
        dom.btnClear.addEventListener("click", () => openCreate(false));
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnCopy.addEventListener("click", copyAsNew);
        dom.btnDelete.addEventListener("click", remove);
        dom.btnPrint.addEventListener("click", printSheet);
        dom.btnExcel.addEventListener("click", () => exportExcel([currentSnapshot()]));
        dom.btnExportAll.addEventListener("click", exportAll);

        dom.btnAddMaterial.addEventListener("click", () => {
            rows.push({ MaterialID: "", MaterialName: "", Quantity: "", UnitCost: "", Remark: "" });
            renderRows();
            dom.detailList.querySelector("tr:last-child [data-f=MaterialName]")?.focus();
        });
        dom.btnNormalize.addEventListener("click", normalize);
        dom.btnRefreshCost.addEventListener("click", refreshCosts);

        dom.ProductID.addEventListener("change", () => {
            const p = products.find(x => String(x.ID) === dom.ProductID.value);
            if (p && p.SalePrice !== null && p.SalePrice !== undefined) dom.TargetPrice.value = p.SalePrice;
            calculate();
        });

        dom.formulaForm.addEventListener("input", e => {
            if (!e.target.classList.contains("calc")) return;
            // 改預設倍數時，試算倍數跟著走
            if (e.target === dom.YieldQty) tryMult = App.numOrNull(dom.YieldQty.value);
            calculate();
        });

        // 試算列
        dom.tryMult.addEventListener("input", () => {
            tryMult = App.numOrNull(dom.tryMult.value);
            calculate({ keep: "mult" });
        });
        dom.tryTotal.addEventListener("input", () => {
            const t = App.numOrNull(dom.tryTotal.value);
            const s = spec();
            if (t !== null && s.unitWeight > 0) tryMult = round(t * s.yieldRate / s.unitWeight, 4);
            calculate({ keep: "total" });
        });
        document.querySelector(".scale-bar").addEventListener("click", e => {
            const b = e.target.closest("[data-mult],[data-step]");
            if (!b) return;
            const m = mult();
            tryMult = b.dataset.mult ? round(m * Number(b.dataset.mult), 4) : Math.max(0, round(m + Number(b.dataset.step), 4));
            calculate();
        });
        dom.btnSetDefault.addEventListener("click", () => {
            dom.YieldQty.value = mult();
            calculate();
        });

        // 原料表
        dom.detailList.addEventListener("input", onDetailInput);
        dom.detailList.addEventListener("change", onDetailChange);
        dom.detailList.addEventListener("click", e => {
            const b = e.target.closest("[data-act]");
            if (!b) return;
            const i = Number(b.dataset.i);
            if (b.dataset.act === "remove") rows.splice(i, 1);
            if (b.dataset.act === "up" && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
            if (b.dataset.act === "down" && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
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
    const round = (v, d = 2) => Math.round((Number(v) || 0) * 10 ** d) / 10 ** d;
    const num = v => App.num(v);

    function money(v, digits = 0) {
        const n = Number(v) || 0;
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function g(v, digits = 1) {
        return (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
    }

    function baseTotal() {
        return rows.reduce((s, r) => s + num(r.Quantity), 0);
    }

    // 規格：單位重量、成品率、預設倍數
    function spec() {
        const base = baseTotal();
        const def = App.numOrNull(dom.YieldQty.value);
        let unitWeight = App.numOrNull(dom.UnitWeight.value);
        // 舊資料：沒有單位重量 → 預設倍數 = 一批產量
        if (!unitWeight) unitWeight = def > 0 ? base / def : base;
        const yieldRate = (App.numOrNull(dom.YieldRate.value) || 100) / 100;
        return { base, unitWeight, yieldRate, defMult: def };
    }

    function mult() {
        const s = spec();
        return tryMult ?? s.defMult ?? 1;
    }

    function compute(m = mult()) {

        const s = spec();
        const target = s.unitWeight > 0 ? m * s.unitWeight / s.yieldRate : 0;
        const factor = s.base > 0 ? target / s.base : 0;

        const lines = rows.map(r => {
            const scaled = num(r.Quantity) * factor;
            return { scaled, cost: scaled * num(r.UnitCost), pct: s.base ? num(r.Quantity) / s.base : 0 };
        });

        const materialCost = lines.reduce((t, l) => t + l.cost, 0);
        const extra = num(dom.PackagingCost.value) + num(dom.LaborCost.value) + num(dom.OtherCost.value);
        const unitCost = m > 0 ? materialCost / m + extra : 0;

        return { ...s, mult: m, target, factor, lines, materialCost, unitCost, totalCost: unitCost * m };
    }

    function calculate(opt = {}) {

        const c = compute();
        const unit = dom.YieldUnit.value.trim() || "單位";

        if (opt.keep !== "mult") dom.tryMult.value = c.mult ? round(c.mult, 4) : "";
        if (opt.keep !== "total") dom.tryTotal.value = c.target ? round(c.target, 1) : "";
        dom.tryUnitLabel.textContent = `× ${unit}${dom.UnitWeight.value ? `（${g(c.unitWeight)} g）` : ""}`;
        dom.factorText.textContent = c.base
            ? `放大係數 ${round(c.factor, 4)}${c.defMult && round(c.mult, 4) !== round(c.defMult, 4) ? `｜預設 ${c.defMult}` : ""}${c.yieldRate !== 1 ? `｜含損耗 ${round(c.yieldRate * 100, 1)}%` : ""}`
            : "";
        dom.btnSetDefault.disabled = !c.mult || round(c.mult, 4) === round(c.defMult, 4);

        // 明細
        c.lines.forEach((l, i) => {
            const tr = dom.detailList.querySelector(`tr[data-i="${i}"]`);
            if (!tr) return;
            tr.querySelector("[data-c=pct]").textContent = (l.pct * 100).toFixed(2) + "%";
            const sc = tr.querySelector("[data-f=Scaled]");
            if (document.activeElement !== sc) sc.value = rows[i].Quantity === "" ? "" : round(l.scaled, 1);
            tr.querySelector("[data-c=cost]").textContent = money(l.cost, 2);
        });

        dom.sumBase.textContent = g(c.base, 2);
        dom.sumPct.textContent = c.base ? "100%" : "0%";
        dom.sumScaled.textContent = g(c.target, 1);
        dom.sumCost.textContent = money(c.materialCost, 2);

        // 結果
        const price = num(dom.TargetPrice.value);
        const rate = num(dom.TargetCostRate.value);

        dom.rMaterialCost.textContent = money(c.materialCost, 1);
        dom.rUnitCost.textContent = c.mult > 0 ? money(c.unitCost, 2) : "-";
        dom.rUnitHint.textContent = `每${unit}`;

        if (price > 0 && c.mult > 0) {
            const profit = price - c.unitCost;
            dom.rProfit.textContent = money(profit, 2);
            dom.rProfit.className = "big " + (profit >= 0 ? "good" : "bad");
            dom.rMargin.textContent = `毛利率 ${(profit / price * 100).toFixed(1)}%　成本率 ${(c.unitCost / price * 100).toFixed(1)}%`;
        } else {
            dom.rProfit.textContent = "-";
            dom.rProfit.className = "big";
            dom.rMargin.textContent = "輸入售價後計算";
        }

        dom.rSuggest.textContent = rate > 0 && c.mult > 0 ? money(c.unitCost / (rate / 100), 0) : "-";
    }

    // 等比例調整基準重量，讓基準總重 = 1000 g
    function normalize() {
        const base = baseTotal();
        if (!base) return;
        rows.forEach(r => { if (r.Quantity !== "") r.Quantity = round(num(r.Quantity) * 1000 / base, 2); });
        renderRows();
    }

    function refreshCosts() {
        let n = 0;
        rows.forEach(r => {
            const m = materialById(r.MaterialID);
            if (m && m.CostPrice !== null && m.CostPrice !== undefined && num(m.CostPrice) !== num(r.UnitCost)) {
                r.UnitCost = m.CostPrice;
                r.Remark = "";
                n++;
            }
        });
        renderRows();
        alert(n ? `🔄 已更新 ${n} 項原料單價（記得按「儲存修改」）` : "有連結的原料單價都已是最新");
    }

    // =========================
    // 原料表
    // =========================
    function materialById(id) {
        return id === "" || id === null || id === undefined ? null : materials.find(m => String(m.ID) === String(id));
    }

    function materialByName(name) {
        const n = String(name || "").trim();
        return n ? materials.find(m => String(m.MaterialName).trim() === n) : null;
    }

    function renderMaterialNames() {
        dom.materialNames.innerHTML = materials
            .map(m => `<option value="${App.esc(m.MaterialName)}">${m.CostPrice !== null && m.CostPrice !== undefined ? `$${m.CostPrice}/${App.esc(m.Unit || "g")}` : ""}</option>`)
            .join("");
    }

    function renderRows() {

        const esc = App.esc;

        dom.detailList.innerHTML = rows.map((r, i) => {
            const linked = materialById(r.MaterialID);
            return `
<tr data-i="${i}">
    <td class="text-muted small">${i + 1}</td>
    <td class="ing">
        <div class="input-group input-group-sm">
            <input class="form-control" list="materialNames" data-f="MaterialName" value="${esc(r.MaterialName || "")}" placeholder="原料名稱">
            ${linked ? `<span class="input-group-text link-badge" title="已連結原料庫：${esc(linked.MaterialName)}（$${esc(linked.CostPrice ?? "-")}/g）">🔗</span>` : ""}
            ${r.Remark ? `<span class="input-group-text link-badge text-danger" title="${esc(r.Remark)}">⚠️</span>` : ""}
        </div>
    </td>
    <td class="text-end"><input type="number" min="0" step="any" class="form-control form-control-sm num" data-f="Quantity" value="${esc(r.Quantity ?? "")}"></td>
    <td class="text-end small" data-c="pct"></td>
    <td class="text-end scaled"><input type="number" min="0" step="any" class="form-control form-control-sm num" data-f="Scaled"></td>
    <td class="text-end"><input type="number" min="0" step="any" class="form-control form-control-sm num" data-f="UnitCost" value="${esc(r.UnitCost ?? "")}"></td>
    <td class="text-end" data-c="cost"></td>
    <td class="text-nowrap">
        <button type="button" class="btn btn-sm btn-link p-0" data-act="up" data-i="${i}" title="上移">↑</button>
        <button type="button" class="btn btn-sm btn-link p-0" data-act="down" data-i="${i}" title="下移">↓</button>
        <button type="button" class="btn btn-sm btn-link text-danger p-0 ms-1" data-act="remove" data-i="${i}" title="刪除">✕</button>
    </td>
</tr>`;
        }).join("") || `<tr><td colspan="8" class="text-muted small">尚未加入原料</td></tr>`;

        calculate();
    }

    function onDetailInput(e) {

        const tr = e.target.closest("tr[data-i]");
        const f = e.target.dataset.f;
        if (!tr || !f) return;

        const r = rows[Number(tr.dataset.i)];

        if (f === "Scaled") {
            // 直接改製作重量 → 換算回基準重量
            const c = compute();
            const v = App.numOrNull(e.target.value);
            if (v !== null && c.factor > 0) {
                r.Quantity = round(v / c.factor, 3);
                tr.querySelector("[data-f=Quantity]").value = r.Quantity;
            }
        } else if (f !== "MaterialName") {
            r[f] = e.target.value;
            if (f === "UnitCost") r.Remark = "";
        }

        calculate();
    }

    function onDetailChange(e) {

        if (e.target.dataset.f !== "MaterialName") return;

        const r = rows[Number(e.target.closest("tr").dataset.i)];
        const name = e.target.value.trim();
        const m = materialByName(name);

        r.MaterialName = name;

        if (m) {
            if (String(r.MaterialID) !== String(m.ID)) {
                r.MaterialID = m.ID;
                r.UnitCost = m.CostPrice ?? r.UnitCost;
                r.Remark = "";
            }
        } else {
            r.MaterialID = "";
        }

        renderRows();
    }

    // =========================
    // 列表
    // =========================
    function renderProductOptions() {
        dom.ProductID.innerHTML = "";
        dom.ProductID.add(new Option("（不指定）", ""));
        products.forEach(p => dom.ProductID.add(new Option(`${p.ProductName}${p.SalePrice ? `（售價 $${p.SalePrice}）` : ""}`, p.ID)));
    }

    function detailsOf(id) {
        return allDetails
            .filter(d => d.FormulaID === id)
            .sort((a, b) => (num(a.SortOrder) || a.FormulaDetailID) - (num(b.SortOrder) || b.FormulaDetailID) || a.FormulaDetailID - b.FormulaDetailID);
    }

    function hasWarning(f) {
        return allDetails.some(d => d.FormulaID === f.FormulaID && d.Remark);
    }

    function renderList() {

        const kw = dom.qKeyword.value.trim();
        const esc = App.esc;

        listCache = formulas
            .filter(f => dom.qInactive.checked || f.IsActive !== false)
            .filter(f => !dom.qWarn.checked || hasWarning(f))
            .filter(f => !kw ||
                App.like(f.FormulaName, kw) || App.like(f.FormulaCode, kw) ||
                allDetails.some(d => d.FormulaID === f.FormulaID && App.like(d.MaterialName, kw)))
            .sort((a, b) => String(a.FormulaName).localeCompare(String(b.FormulaName), "zh-Hant"));

        dom.listCount.textContent = `${listCache.length} 筆`;
        dom.emptyHint.classList.toggle("d-none", listCache.length > 0);

        dom.formulaList.innerHTML = listCache.map((f, i) => {

            const price = num(f.TargetPrice);
            const unit = num(f.UnitCost);
            const rate = price > 0 && unit > 0 ? unit / price : null;

            return `
<div class="formula-card ${current && current.FormulaID === f.FormulaID ? "active" : ""}" data-index="${i}">
    <div class="d-flex justify-content-between gap-1">
        <b>🧪 ${esc(f.FormulaName || "")}</b>
        <span>${hasWarning(f) ? `<span class="badge bg-warning text-dark" title="有原料單價待確認">⚠️</span>` : ""}${f.IsActive === false ? ` <span class="badge bg-secondary">停用</span>` : ""}</span>
    </div>
    <div class="small text-muted">${esc(f.YieldUnit || "")}${f.UnitWeight ? `（${g(f.UnitWeight)}g）` : ""} × ${f.YieldQty ?? "-"}</div>
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
        tryMult = null;
        dom.formulaForm.reset();
        dom.IsActive.checked = true;
        dom.YieldUnit.value = "1L";
        dom.UnitWeight.value = 1000;
        dom.YieldQty.value = 1;
        rows = [];
        setMode(false);
        renderRows();
        renderList();

        if (scroll) dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function loadDetail(f) {

        if (!f) return;

        current = f;
        tryMult = null;

        FIELDS.forEach(k => dom[k].value = f[k] ?? "");
        dom.ProductID.value = f.ProductID ? String(f.ProductID) : "";
        dom.IsActive.checked = f.IsActive !== false;

        rows = detailsOf(f.FormulaID).map(d => ({
            MaterialID: d.MaterialID ?? "",
            MaterialName: d.MaterialName || materialById(d.MaterialID)?.MaterialName || "",
            Quantity: d.Quantity ?? "",
            UnitCost: d.UnitCost ?? materialById(d.MaterialID)?.CostPrice ?? "",
            Remark: d.Remark || ""
        }));

        setMode(true);
        renderRows();
        renderList();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function buildData() {

        // 儲存的成本以「預設倍數」計算
        const s = spec();
        const c = compute(s.defMult || 1);

        return {
            formula: {
                FormulaName: dom.FormulaName.value.trim(),
                FormulaCode: dom.FormulaCode.value.trim(),
                VersionNo: dom.VersionNo.value.trim(),
                ProductID: dom.ProductID.value,
                YieldQty: App.numOrNull(dom.YieldQty.value),
                YieldUnit: dom.YieldUnit.value.trim(),
                UnitWeight: App.numOrNull(dom.UnitWeight.value),
                YieldRate: App.numOrNull(dom.YieldRate.value),
                BaseWeight: round(c.base, 2),
                PackagingCost: App.numOrNull(dom.PackagingCost.value),
                LaborCost: App.numOrNull(dom.LaborCost.value),
                OtherCost: App.numOrNull(dom.OtherCost.value),
                TargetPrice: App.numOrNull(dom.TargetPrice.value),
                TargetCostRate: App.numOrNull(dom.TargetCostRate.value),
                MaterialCost: round(c.materialCost, 2),
                TotalCost: round(c.totalCost, 2),
                UnitCost: round(c.unitCost, 2),
                Description: dom.Description.value.trim(),
                IsActive: dom.IsActive.checked
            },
            details: rows
                .filter(r => String(r.MaterialName || "").trim() || r.MaterialID)
                .map((r, i) => ({
                    MaterialID: r.MaterialID ? String(r.MaterialID) : "",
                    MaterialName: String(r.MaterialName || "").trim() || materialById(r.MaterialID)?.MaterialName || "",
                    Quantity: App.numOrNull(r.Quantity),
                    Unit: "g",
                    UnitCost: App.numOrNull(r.UnitCost),
                    LineCost: round(c.lines[rows.indexOf(r)]?.cost, 3),
                    Remark: r.Remark || "",
                    SortOrder: i + 1
                }))
        };
    }

    async function reload() {
        const data = await API.getMany(["Formula", "FormulaDetail"]);
        formulas = data.Formula || formulas;
        allDetails = data.FormulaDetail || allDetails;
    }

    async function save(isCreate, overrideName) {

        const { formula, details } = buildData();

        if (overrideName) {
            formula.FormulaName = overrideName;
            formula.FormulaCode = "";
        }

        if (!formula.FormulaName) return alert("請輸入配方名稱");
        if (!details.length) return alert("請至少加入一項原料");
        if (!formula.YieldQty) return alert("請輸入預設倍數");

        if (isCreate && formulas.some(f => f.FormulaName === formula.FormulaName))
            return alert("⚠️ 已有同名配方，請換一個名稱");

        if (isCreate && formula.FormulaCode && formulas.some(f => f.FormulaCode === formula.FormulaCode))
            return alert("⚠️ 配方代碼已存在");

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

            alert(`${isCreate ? "🎉 配方已建立" : "✅ 配方已更新"}\n預設 ${formula.YieldQty} × ${formula.YieldUnit || "單位"}，單位成本 ${money(formula.UnitCost, 2)}`);

            await reload();
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

    // =========================
    // 輸出配方表
    // =========================

    // 目前畫面上的配方（依試算倍數）
    function currentSnapshot() {
        const c = compute();
        return {
            name: dom.FormulaName.value.trim() || "未命名配方",
            code: dom.FormulaCode.value.trim(),
            version: dom.VersionNo.value.trim(),
            unit: dom.YieldUnit.value.trim() || "單位",
            unitWeight: c.unitWeight,
            mult: c.mult,
            yieldRate: c.yieldRate,
            price: App.numOrNull(dom.TargetPrice.value),
            note: dom.Description.value.trim(),
            c,
            items: rows.map((r, i) => ({
                name: r.MaterialName || materialById(r.MaterialID)?.MaterialName || "",
                base: num(r.Quantity),
                pct: c.lines[i].pct,
                scaled: c.lines[i].scaled,
                unitCost: num(r.UnitCost),
                cost: c.lines[i].cost
            })).filter(x => x.name || x.base)
        };
    }

    // 已儲存的配方（依預設倍數），給「匯出全部」用
    function savedSnapshot(f) {

        const items = detailsOf(f.FormulaID);
        const base = items.reduce((s, d) => s + num(d.Quantity), 0);
        const m = num(f.YieldQty) || 1;
        const unitWeight = num(f.UnitWeight) || (m ? base / m : base);
        const yieldRate = (num(f.YieldRate) || 100) / 100;
        const target = m * unitWeight / yieldRate;
        const factor = base ? target / base : 0;

        const list = items.map(d => {
            const scaled = num(d.Quantity) * factor;
            return {
                name: d.MaterialName || materialById(d.MaterialID)?.MaterialName || "",
                base: num(d.Quantity),
                pct: base ? num(d.Quantity) / base : 0,
                scaled,
                unitCost: num(d.UnitCost),
                cost: scaled * num(d.UnitCost)
            };
        });

        const materialCost = list.reduce((s, x) => s + x.cost, 0);
        const extra = num(f.PackagingCost) + num(f.LaborCost) + num(f.OtherCost);

        return {
            name: f.FormulaName, code: f.FormulaCode || "", version: f.VersionNo || "",
            unit: f.YieldUnit || "單位", unitWeight, mult: m, yieldRate, price: App.numOrNull(f.TargetPrice), note: f.Description || "",
            c: { base, target, factor, materialCost, unitCost: m ? materialCost / m + extra : 0 },
            items: list
        };
    }

    function printSheet() {

        const s = currentSnapshot();
        if (!s.items.length) return alert("沒有原料可以輸出");

        const withCost = dom.printCost.checked;
        const esc = App.esc;
        const today = new Date().toLocaleDateString("zh-TW");

        const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>${esc(s.name)} 配方表</title>
<style>
    body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;margin:24px;color:#111}
    h1{font-size:22px;margin:0 0 4px}
    .meta{color:#444;font-size:13px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:18px}
    .meta b{color:#111}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{border:1px solid #999;padding:6px 8px}
    th{background:#f1f5f9}
    td.n,th.n{text-align:right}
    td.big{font-size:16px;font-weight:bold}
    tfoot td{font-weight:bold;background:#f8fafc}
    .check{width:36px}
    .note{margin-top:12px;font-size:13px;white-space:pre-wrap}
    .sign{margin-top:28px;display:flex;gap:40px;font-size:13px}
    .sign span{display:inline-block;border-bottom:1px solid #333;min-width:140px}
    @media print{body{margin:10mm}.noprint{display:none}}
</style></head><body>
<div class="noprint" style="margin-bottom:12px"><button onclick="print()">🖨 列印 / 另存 PDF</button></div>
<h1>🧪 ${esc(s.name)}</h1>
<div class="meta">
    ${s.code ? `<span>代碼 <b>${esc(s.code)}</b></span>` : ""}${s.version ? `<span>版本 <b>${esc(s.version)}</b></span>` : ""}
    <span>製作 <b>${round(s.mult, 4)} × ${esc(s.unit)}</b>（每${esc(s.unit)} ${g(s.unitWeight)} g）</span>
    <span>總重 <b>${g(s.c.target, 1)} g</b></span>
    ${s.yieldRate !== 1 ? `<span>成品率 <b>${round(s.yieldRate * 100, 1)}%</b></span>` : ""}
    <span>輸出日期 ${esc(today)}</span>
</div>
<table>
<thead><tr><th class="check">✔</th><th>#</th><th>原料</th><th class="n">製作重量 (g)</th><th class="n">百分比</th><th class="n">基準重量 (g)</th>
${withCost ? `<th class="n">單價/g</th><th class="n">成本</th>` : ""}</tr></thead>
<tbody>
${s.items.map((x, i) => `<tr><td></td><td>${i + 1}</td><td>${esc(x.name)}</td><td class="n big">${g(x.scaled, 1)}</td>
<td class="n">${(x.pct * 100).toFixed(2)}%</td><td class="n">${g(x.base, 2)}</td>
${withCost ? `<td class="n">${round(x.unitCost, 4)}</td><td class="n">${money(x.cost, 2)}</td>` : ""}</tr>`).join("")}
</tbody>
<tfoot><tr><td></td><td></td><td>合計</td><td class="n">${g(s.c.target, 1)}</td><td class="n">100%</td><td class="n">${g(s.c.base, 2)}</td>
${withCost ? `<td></td><td class="n">${money(s.c.materialCost, 2)}</td>` : ""}</tr></tfoot>
</table>
${withCost ? `<div class="meta" style="margin-top:10px"><span>單位成本 <b>${money(s.c.unitCost, 2)}</b> / ${esc(s.unit)}</span>
${s.price ? `<span>售價 <b>${money(s.price)}</b>　成本率 <b>${(s.c.unitCost / s.price * 100).toFixed(1)}%</b></span>` : ""}</div>` : ""}
${s.note ? `<div class="note"><b>備註：</b>${esc(s.note)}</div>` : ""}
<div class="sign"><div>製作人 <span></span></div><div>日期 <span></span></div><div>覆核 <span></span></div></div>
</body></html>`;

        const w = window.open("", "_blank");
        if (!w) return alert("瀏覽器擋住了新視窗，請允許此網站開啟彈出視窗");
        w.document.write(html);
        w.document.close();
    }

    // 需要時才載入 Excel 套件
    function loadXlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
            s.onload = () => resolve(window.XLSX);
            s.onerror = () => reject(new Error("Excel 套件載入失敗，請檢查網路"));
            document.head.appendChild(s);
        });
    }

    function sheetOf(XLSX, s, withCost) {

        const aoa = [
            ["品名", s.name],
            ["代碼 / 版本", [s.code, s.version].filter(Boolean).join(" / ")],
            ["單位", s.unit, "單位重量 (g)", round(s.unitWeight, 2)],
            ["倍數", round(s.mult, 4), "總重 (g)", round(s.c.target, 1)],
            ["成品率", round(s.yieldRate * 100, 2) + "%", "放大係數", round(s.c.factor, 4)],
            [],
            ["#", "原料", "基準重量 (g)", "百分比", "製作重量 (g)"].concat(withCost ? ["單價 (每 g)", "成本"] : [])
        ];

        s.items.forEach((x, i) => aoa.push([i + 1, x.name, round(x.base, 3), round(x.pct * 100, 2) + "%", round(x.scaled, 1)]
            .concat(withCost ? [round(x.unitCost, 6), round(x.cost, 2)] : [])));

        aoa.push(["", "合計", round(s.c.base, 2), "100%", round(s.c.target, 1)].concat(withCost ? ["", round(s.c.materialCost, 2)] : []));

        if (withCost) {
            aoa.push([]);
            aoa.push(["單位成本", round(s.c.unitCost, 2), "售價", s.price ?? ""]);
            if (s.price) aoa.push(["成本率", (s.c.unitCost / s.price * 100).toFixed(1) + "%"]);
        }
        if (s.note) { aoa.push([]); aoa.push(["備註", s.note]); }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [{ wch: 10 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
        return ws;
    }

    function safeSheetName(name, used) {
        let n = String(name || "配方").replace(/[\\/?*[\]:]/g, "_").slice(0, 28) || "配方";
        let k = n, i = 2;
        while (used.has(k)) k = `${n.slice(0, 25)}_${i++}`;
        used.add(k);
        return k;
    }

    async function exportExcel(list, filename) {

        list = list.filter(s => s.items.length);
        if (!list.length) return alert("沒有原料可以輸出");

        try {
            const XLSX = await loadXlsx();
            const wb = XLSX.utils.book_new();
            const used = new Set();
            const withCost = dom.printCost.checked;

            list.forEach(s => XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, s, withCost), safeSheetName(s.name, used)));

            const date = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, filename || `${list[0].name}_${round(list[0].mult, 2)}倍_${date}.xlsx`);
        } catch (err) {
            App.error(err, "匯出失敗");
        }
    }

    function exportAll() {
        const list = formulas
            .filter(f => f.IsActive !== false)
            .sort((a, b) => String(a.FormulaName).localeCompare(String(b.FormulaName), "zh-Hant"))
            .map(savedSnapshot);
        if (!list.length) return alert("沒有配方可以匯出");
        exportExcel(list, `瘋菓配方表_全部_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    return { init };
})();
