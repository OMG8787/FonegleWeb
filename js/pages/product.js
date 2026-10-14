window.Pages = window.Pages || {};
Pages.Product = (() => {

    "use strict";
    const dom = {};
    let listCache = [];
    let allProducts = [];       // 全部產品（分類管理用來計算每個分類的產品數）
    let currentDetail = null;
    let mode = "view";
    let formulas = [], details = [], materials = [];     // 計算成本用（沒有讀取權限就是空的）
    let packRows = [];                                    // 目前產品的包材 [{ MaterialID, Name, Qty, UnitCost }]
    let specBase = null;                                  // 正在「新增規格」：以哪個產品為範本
    let groupsCache = [];                                 // 清單分組（同名產品 = 同一個產品的不同規格）

    // 同名 = 同一個產品、不同規格（每個規格仍是一筆獨立的產品資料：各自的 SKU、售價、成本、庫存、配方用量）
    const keyOf = p => { const n = String(p.ProductName || "").trim().toLowerCase(); return n || "#" + p.ID; };
    const siblingsOf = p => (p ? allProducts.filter(x => keyOf(x) === keyOf(p)).sort((a, b) => a.ID - b.ID) : []);
    const specLabel = (p, i) => [p.Specification, p.Capacity ? p.Capacity + (p.Unit || "") : ""].filter(Boolean).join(" ") || p.SKU || `規格 ${i + 1}`;
    const SHARED_FIELDS = ["ProductName", "ShortName", "Brand", "CategoryID", "Description"];     // 改了會同步到其他規格

    function init() {
        cacheDom();
        bindEvents();
        hideForm();
        setModeUI("view");
        loadInit();
    }

    function cacheDom() {
        dom.formCard = document.getElementById("formCard");
        dom.form = document.getElementById("productForm");
        dom.editHint = document.getElementById("editHint");
        dom.productList = document.getElementById("productList");
        dom.emptyHint = document.getElementById("emptyHint");
        dom.specBar = document.getElementById("specBar");
        dom.searchTitle = document.getElementById("searchTitle");
        dom.searchCount = document.getElementById("searchCount");
        dom.btnSearch = document.getElementById("btnSearch");
        dom.btnCreateTop = document.getElementById("btnCreateTop");
        dom.btnCreate = document.getElementById("btnCreate");
        dom.btnUpdate = document.getElementById("btnUpdate");
        dom.btnDelete = document.getElementById("btnDelete");
        dom.btnClear = document.getElementById("btnClear");
        dom.qSKU = document.getElementById("qSKU");
        dom.qBarcode = document.getElementById("qBarcode");
        dom.qProductName = document.getElementById("qProductName");
        dom.qBrand = document.getElementById("qBrand");
        dom.qCategory = document.getElementById("qCategory");
        dom.qStatus = document.getElementById("qStatus");
        ["FormulaUseMode", "FormulaUseQty", "formulaInfo", "packList", "packNames", "decorList", "decorNames", "btnAddDecor", "costBox", "btnAddPack", "btnApplyCost", "useQtyLabel", "btnRecalcAll"]
            .forEach(id => dom[id] = document.getElementById(id));
        dom.qBrand = document.getElementById("qBrand");
        dom.qCategory = document.getElementById("qCategory");
        dom.qStatus = document.getElementById("qStatus");

        [
            "ID",
            "SKU",
            "Barcode",
            "ProductName",
            "ShortName",
            "CategoryID",
            "Brand",
            "Specification",
            "Flavor",
            "Capacity",
            "Weight",
            "Color",
            "Material",
            "Unit",
            "SalePrice",
            "MemberPrice",
            "CostPrice",
            "ExpDate",
            "FormulaID",
            "MinStock",
            "CurrentStock",
            "Status",
            "Description",
            "Remark",
            "CreatedBy",
            "CreatedAt",
            "UpdatedBy",
            "UpdatedAt"
        ].forEach(id => {
            dom[id] = document.getElementById(id);
        });
        dom.IsB2B = document.getElementById("IsB2B");
        dom.IsB2C = document.getElementById("IsB2C");
        dom.IsActive = document.getElementById("IsActive");
        dom.stockWarning = document.getElementById("stockWarning");
        dom.profitValue = document.getElementById("profitValue");
        dom.profitRate = document.getElementById("profitRate");
    }

    function bindEvents() {

        document.querySelectorAll(".btn-manage-category")
            .forEach(b => b.addEventListener("click", openCategoryManager));
        dom.btnSearch.addEventListener(
            "click",
            searchProducts
        );
        dom.btnCreateTop.addEventListener(
            "click",
            openCreate
        );
        dom.btnCreate.addEventListener(
            "click",
            submitProduct
        );
        dom.btnUpdate.addEventListener(
            "click",
            submitProduct
        );
        dom.btnDelete.addEventListener(
            "click",
            removeProduct
        );
        dom.btnClear.addEventListener(
            "click",
            clearForm
        );
        dom.specBar.addEventListener("click", e => {
            const b = e.target.closest("button");
            if (!b) return;
            if (b.dataset.addspec !== undefined) return openAddSpec();
            if (b.dataset.spec) {
                const p = allProducts.find(x => String(x.ID) === b.dataset.spec);
                if (p) loadDetail(p);
            }
        });
        dom.productList.addEventListener(
            "click",
            async e => {
                const chip = e.target.closest("[data-spec-id]");
                if (chip) {
                    const p = allProducts.find(x => String(x.ID) === chip.dataset.specId);
                    if (p) await loadDetail(p);
                    return;
                }
                const card =
                    e.target.closest(".product-card");
                if (!card)
                    return;
                const item =
                    listCache[
                    card.dataset.index
                    ];
                await loadDetail(item);
            });
        dom.SalePrice.addEventListener(
            "input",
            calculateProfit
        );
        dom.CostPrice.addEventListener(
            "input",
            calculateProfit
        );
        dom.CurrentStock.addEventListener(
            "input",
            updateStockWarning
        );
        dom.MinStock.addEventListener(
            "input",
            updateStockWarning
        );

        dom.btnRecalcAll.addEventListener("click", recalcAll);
        document.getElementById("btnReview").addEventListener("click", () => CostReview.open({ onDone: async () => { await loadInit(); if (currentDetail) { const f = allProducts.find(p => p.ID === currentDetail.ID); if (f) { currentDetail = f; fillForm(f); } } } }));
        dom.btnApplyCost.addEventListener("click", () => recalc(true));
        dom.btnAddPack.addEventListener("click", () => {
            packRows.push({ MaterialID: "", Name: "", Qty: 1, UnitCost: "", Kind: "" });
            renderPack();
            dom.packList.querySelector("tr:last-child [data-f=Name]")?.focus();
        });
        dom.btnAddDecor.addEventListener("click", () => {
            packRows.push({ MaterialID: "", Name: "", Qty: 1, UnitCost: "", Kind: "decor" });
            renderPack();
            dom.decorList.querySelector("tr:last-child [data-f=Name]")?.focus();
        });
        ["FormulaID", "FormulaUseMode", "FormulaUseQty"].forEach(id => {
            dom[id].addEventListener("input", () => recalc(true));
            dom[id].addEventListener("change", () => recalc(true));
        });
        dom.FormulaUseMode.addEventListener("change", updateUseLabel);
        dom.packList.addEventListener("input", onPackInput);
        dom.packList.addEventListener("change", onPackChange);
        dom.packList.addEventListener("click", onPackClick);
        dom.decorList.addEventListener("input", onPackInput);
        dom.decorList.addEventListener("change", onPackChange);
        dom.decorList.addEventListener("click", onPackClick);
    }

    async function loadInit() {

        try {

            // 分類與產品一次載入
            const data = await API.getMany(["ID_Category", "Products", "Formula", "FormulaDetail", "Material"]);

            formulas = data.Formula || [];
            details = data.FormulaDetail || [];
            materials = (data.Material || []).filter(m => m.IsActive !== false);
            renderFormulaOptions();
            renderPackNames();

            renderCategory(data.ID_Category);
            applySearch(data.Products);

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function openCreate() {
        currentDetail = null;
        specBase = null;
        mode = "create";
        dom.form.reset();
        dom.ID.value = "";
        currentDetail = null;
        packRows = [];
        renderPack();
        updateUseLabel();
        calculateProfit();
        updateStockWarning();
        showForm();
        setModeUI("create");
    }

    async function searchProducts() {

        try {

            applySearch(await API.list("Products"));

        } catch (err) {

            App.error(err, "查詢產品失敗");
        }
    }

    function applySearch(all) {

        allProducts = all || [];

        const q = {
            sku: dom.qSKU.value.trim(),
            barcode: dom.qBarcode.value.trim(),
            name: dom.qProductName.value.trim(),
            brand: dom.qBrand.value.trim(),
            category: dom.qCategory.value.trim(),
            status: dom.qStatus.value.trim()
        };

        const list = all
            .filter(x =>
                App.like(x.SKU, q.sku) &&
                App.like(x.Barcode, q.barcode) &&
                (App.like(x.ProductName, q.name) || App.like(x.ShortName, q.name)) &&
                App.like(x.Brand, q.brand) &&
                (!q.category || String(x.CategoryID) === q.category) &&
                App.like(x.Status, q.status))
            .sort((a, b) => a.ID - b.ID);

        // 同名的規格歸成一張卡片
        const groups = new Map();
        list.forEach(x => { const k = keyOf(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
        groupsCache = [...groups.values()];
        listCache = groupsCache.map(g => g[0]);

        renderList({
            title: "📦 產品列表",
            count: groupsCache.length,
            specs: list.length,
            list: listCache
        });
        renderSpecBar();
    }

    function renderList(result) {
        dom.searchTitle.textContent =
            result.title;
        dom.searchCount.textContent =
            `共 ${result.count} 筆` + (result.specs && result.specs !== result.count ? `（${result.specs} 種規格）` : "");
        dom.productList.innerHTML =
            "";
        if (!result.list.length) {
            dom.emptyHint.classList
                .remove("d-none");
            return;
        }
        dom.emptyHint.classList
            .add("d-none");
        result.list.forEach(
            (x, index) => {
                const div =
                    document.createElement(
                        "div"
                    );
                div.className =
                    "product-card";
                div.dataset.index =
                    index;
                const group = groupsCache[index] || [x];
                if (group.length > 1) {
                    const money2 = v => "$" + Math.round((Number(v) || 0) * 100) / 100;
                    const low = group.some(p => Number(p.CurrentStock) <= Number(p.MinStock));
                    div.innerHTML = `
<div class="product-name">${App.esc(x.ProductName || "未命名產品")} <span class="badge bg-info text-dark">${group.length} 種規格</span></div>
<div class="product-info">🏷品牌：${App.esc(x.Brand || "-")}　📦 庫存合計：${group.reduce((t, p) => t + (Number(p.CurrentStock) || 0), 0)}</div>
${group.map((p, i) => {
                        const sale = Number(p.SalePrice) || 0, hasCost = p.CostPrice !== null && p.CostPrice !== undefined && p.CostPrice !== "", cost = Number(p.CostPrice) || 0;
                        const profit = sale - cost;
                        return `<div class="d-flex flex-wrap align-items-center gap-2 small mt-1"><button type="button" class="btn btn-sm btn-outline-secondary py-0" data-spec-id="${p.ID}">${App.esc(specLabel(p, i))}</button>
<span>💰 ${money2(sale)}</span><span>🧾 ${hasCost ? money2(cost) : "-"}</span>${hasCost && sale > 0 ? `<span class="${profit >= 0 ? "text-success" : "text-danger"}">📈 ${money2(profit)}（${(profit / sale * 100).toFixed(1)}%）</span>` : ""}<span>📦 ${p.CurrentStock ?? 0}</span></div>`;
                    }).join("")}
<div class="mt-2"><span class="badge bg-light text-dark">${low ? "🔴 有規格庫存不足" : "🟢 正常"}</span></div>`;
                    dom.productList.appendChild(div);
                    return;
                }
                let stockStatus =
                    "🟢 正常";
                if (
                    Number(x.CurrentStock)
                    <=
                    Number(x.MinStock)
                ) {
                    stockStatus =
                        "🔴 庫存不足";
                }
                div.innerHTML = `
<div class="product-name">
${App.esc(x.ProductName || "未命名產品")}
</div>
<div class="product-info">
SKU：
${App.esc(x.SKU || "-")}
</div>
<div class="product-info">
🏷品牌：
${App.esc(x.Brand || "-")}
</div>
<div class="product-info">
📦 庫存：
${x.CurrentStock ?? 0}
</div>
<div class="product-info">
💰 售價：
${x.SalePrice ?? 0}
</div>
${(() => {
                    const sale = Number(x.SalePrice) || 0, hasCost = x.CostPrice !== null && x.CostPrice !== undefined && x.CostPrice !== "", cost = Number(x.CostPrice) || 0;
                    const profit = sale - cost, rate = sale > 0 && hasCost ? profit / sale * 100 : null;
                    return `<div class="product-info">🧾 成本：${hasCost ? "$" + Math.round(cost * 100) / 100 : "-"}</div>
<div class="product-info">📈 利潤：${hasCost && sale > 0 ? `<b class="${profit >= 0 ? "text-success" : "text-danger"}">$${Math.round(profit * 100) / 100}（${rate.toFixed(1)}%）</b>` : "-"}</div>${x.ExpDate ? `<div class="product-info">⏳ 保存期限：${window.StockUtil ? StockUtil.expireBadge(String(x.ExpDate).slice(0, 10)) : App.esc(String(x.ExpDate).slice(0, 10))}</div>` : ""}`;
                })()}
<div class="mt-2">
<span class="badge bg-light text-dark">
${stockStatus}
</span>
<span class="badge bg-secondary">
${App.esc(x.Status || "未知")}
</span>
</div>
`;
                dom.productList
                    .appendChild(div);
            });
    }
    function loadDetail(item) {
        if (!item?.ID)
            return;
        currentDetail = item;
        specBase = null;
        fillForm(item);
        showForm();
        setModeUI("edit");
        scrollToForm();
    }

    function fillForm(d) {

        // 產品使用的分類已停用：選單補上，才不會顯示成空白
        if (d && d.CategoryID && ![...dom.CategoryID.options].some(o => o.value === String(d.CategoryID))) {
            const c = categoryList.find(x => String(x.ID) === String(d.CategoryID));
            dom.CategoryID.add(new Option((c ? c.CategoryName : "分類 " + d.CategoryID) + "（已停用）", String(d.CategoryID)));
        }
        ensureFormulaOption(d && d.FormulaID);
        Object.keys(dom)
            .forEach(key => {
                if (!dom[key])
                    return;
                if (
                    dom[key].tagName ===
                    "INPUT"
                    ||
                    dom[key].tagName ===
                    "TEXTAREA"
                    ||
                    dom[key].tagName ===
                    "SELECT"
                ) {

                    if (
                        dom[key].type ===
                        "checkbox"
                    ) {
                        dom[key].checked =
                            d[key] === true
                            ||
                            d[key] === "true"
                            ||
                            d[key] === "是";
                    }
                    else {
                        dom[key].value =
                            d[key] ?? "";
                    }
                }
            });
        packRows = Cost.parsePackaging(d && d.PackagingJson).map(x => ({ MaterialID: x.MaterialID ?? "", Name: x.Name || "", Qty: x.Qty ?? "", UnitCost: x.UnitCost ?? "", Kind: x.Kind === "decor" ? "decor" : "" }));
        if (!dom.FormulaUseMode.value) dom.FormulaUseMode.value = "portion";
        renderPack();
        updateUseLabel();
        recalc(false);
        calculateProfit();
        updateStockWarning();
    }

    function calculateProfit() {
        const sale =
            Number(
                dom.SalePrice.value
            )
            ||
            0;
        const cost =
            Number(
                dom.CostPrice.value
            )
            ||
            0;
        const profit =
            sale - cost;
        let rate = 0;
        if (sale > 0) {
            rate =
                (
                    profit / sale
                )
                *
                100;
        }
        dom.profitValue.textContent =
            profit.toFixed(2);
        dom.profitRate.textContent =
            rate.toFixed(2)
            +
            "%";
    }

    function updateStockWarning() {
        const stock =
            Number(
                dom.CurrentStock.value
            )
            ||
            0;

        const min =
            Number(
                dom.MinStock.value
            )
            ||
            0;

        if (stock <= min && min > 0) {
            dom.stockWarning
                .classList
                .remove(
                    "d-none"
                );
        }
        else {
            dom.stockWarning
                .classList
                .add(
                    "d-none"
                );
        }
    }

    // =========================
    // 成本計算：配方（份數或重量）+ 包材
    // =========================
    const money = (v, d = 2) => "$" + (Math.round((Number(v) || 0) * 10 ** d) / 10 ** d).toLocaleString();

    function renderFormulaOptions() {
        const keep = dom.FormulaID.value;
        dom.FormulaID.innerHTML = `<option value="">不使用配方（手動填成本）</option>` + formulas
            .slice().sort((a, b) => String(a.FormulaName || "").localeCompare(String(b.FormulaName || ""), "zh-Hant"))
            .map(f => `<option value="${App.esc(f.FormulaID)}">${App.esc(f.FormulaName || f.FormulaCode || f.FormulaID)}${f.VersionNo ? " " + App.esc(f.VersionNo) : ""}${f.IsActive === false ? "（停用）" : ""}</option>`).join("");
        ensureFormulaOption(keep);
        dom.FormulaID.value = keep;
    }

    // 產品記的配方已經不在清單（刪除 / 沒有讀取權限）：補一個選項，避免儲存時被清掉
    function ensureFormulaOption(id) {
        id = String(id ?? "");
        if (id && ![...dom.FormulaID.options].some(o => o.value === id))
            dom.FormulaID.add(new Option(`（配方 ${id}，找不到）`, id));
    }

    function renderPackNames() {
        const opt = m => `<option value="${App.esc(m.MaterialName)}">${m.CostPrice !== null && m.CostPrice !== undefined ? `$${m.CostPrice}/${App.esc(m.Unit || "個")}` : ""}</option>`;
        const pack = materials.filter(m => /包/.test(m.Category || ""));
        dom.packNames.innerHTML = (pack.length ? pack : materials).map(opt).join("");
        const food = materials.filter(m => !/包/.test(m.Category || ""));
        dom.decorNames.innerHTML = (food.length ? food : materials).map(opt).join("");
    }

    function updateUseLabel() {
        dom.useQtyLabel.textContent = dom.FormulaUseMode.value === "weight" ? "用量（g）" : "用量（份）";
    }

    const matById = id => (id === "" || id === null || id === undefined ? null : materials.find(m => String(m.ID) === String(id)));
    const matByName = name => { const n = String(name || "").trim(); return n ? materials.find(m => String(m.MaterialName).trim() === n) : null; };

    function renderPack() {

        const rowHtml = (r, i) => {
            const decor = r.Kind === "decor";
            const m = matById(r.MaterialID);
            const price = m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? Number(m.CostPrice) : Number(r.UnitCost) || 0;
            const btn = m ? `<button type="button" class="btn btn-outline-secondary" data-act="edit" data-i="${i}" title="修改原料庫的名稱、單價">✏️</button>`
                : String(r.Name || "").trim() ? `<button type="button" class="btn btn-outline-primary" data-act="add" data-i="${i}" title="這個${decor ? "裝飾 / 配料" : "包材"}還沒登入原料庫，點這裡新增">＋ 新增</button>` : "";
            return `<tr data-i="${i}">
    <td><div class="input-group input-group-sm"><input class="form-control" list="${decor ? "decorNames" : "packNames"}" data-f="Name" value="${App.esc(m ? m.MaterialName : r.Name || "")}" placeholder="${decor ? "裝飾 / 配料名稱" : "包材名稱"}">${btn}</div></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm text-end" data-f="Qty" value="${App.esc(r.Qty ?? "")}"></td>
    <td class="text-end small">${m || r.UnitCost !== "" ? money(price, 4) + (m && m.Unit ? "/" + App.esc(m.Unit) : "") : `<span class="text-danger">無單價</span>`}</td>
    <td class="text-end small" data-c="sub">${money(price * (Number(r.Qty) || 0))}</td>
    <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0" data-act="remove" data-i="${i}" title="移除">✕</button></td>
</tr>`;
        };

        const html = decor => packRows.map((r, i) => ((r.Kind === "decor") === decor ? rowHtml(r, i) : "")).join("");
        dom.packList.innerHTML = html(false) || `<tr><td colspan="5" class="text-muted small">還沒有包材</td></tr>`;
        dom.decorList.innerHTML = html(true) || `<tr><td colspan="5" class="text-muted small">還沒有裝飾 / 配料</td></tr>`;
    }

    function onPackInput(e) {
        const tr = e.target.closest("tr[data-i]");
        if (!tr || e.target.dataset.f !== "Qty") return;
        packRows[Number(tr.dataset.i)].Qty = e.target.value;
        const r = packRows[Number(tr.dataset.i)];
        const m = matById(r.MaterialID);
        const price = m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? Number(m.CostPrice) : Number(r.UnitCost) || 0;
        tr.querySelector("[data-c=sub]").textContent = money(price * (Number(r.Qty) || 0));
        recalc(true);
    }

    function onPackChange(e) {
        if (e.target.dataset.f !== "Name") return;
        const i = Number(e.target.closest("tr").dataset.i);
        const r = packRows[i];
        const name = e.target.value.trim();
        const m = matByName(name);
        r.Name = name;
        r.MaterialID = m ? m.ID : "";
        r.UnitCost = m && m.CostPrice !== null && m.CostPrice !== undefined ? m.CostPrice : "";
        renderPack();
        recalc(true);
    }

    function onPackClick(e) {

        const b = e.target.closest("[data-act]");
        if (!b) return;

        const i = Number(b.dataset.i);
        const r = packRows[i];

        if (b.dataset.act === "remove") {
            packRows.splice(i, 1);
            renderPack();
            recalc(true);
            return;
        }

        MaterialQuick.open({
            material: b.dataset.act === "edit" ? matById(r.MaterialID) : null,
            name: r.Name, category: r.Kind === "decor" ? "裝飾配料" : "包材", unit: r.Kind === "decor" ? "g" : "個",
            onSaved(m) {
                const k = materials.findIndex(x => String(x.ID) === String(m.ID));
                if (k >= 0) materials[k] = m; else materials.push(m);
                packRows.forEach(x => { if (String(x.MaterialID) === String(m.ID) || x === r) { x.MaterialID = m.ID; x.Name = m.MaterialName; x.UnitCost = m.CostPrice ?? ""; } });
                renderPackNames();
                renderPack();
                recalc(true);
            }
        });
    }

    function costInput() {
        return {
            FormulaID: dom.FormulaID.value,
            FormulaUseMode: dom.FormulaUseMode.value || "portion",
            FormulaUseQty: dom.FormulaUseQty.value,
            PackagingJson: JSON.stringify(packRows)
        };
    }

    // apply = true：把算出的成本填進「成本」欄（只有設定了配方或包材才會填，沒設定就維持手動填的成本）
    function recalc(apply) {

        const input = costInput();
        const c = Cost.product(input, formulas, details, materials);
        const used = c.hasFormula || packRows.length > 0;

        if (input.FormulaID && !c.hasFormula) dom.formulaInfo.textContent = "找不到這個配方（可能已刪除，或沒有讀取配方的權限）";
        else if (c.hasFormula) {
            const f = formulas.find(x => String(x.FormulaID) === String(input.FormulaID));
            const fd = details.filter(d => String(d.FormulaID) === String(input.FormulaID));
            const uw = Cost.unitWeight(f, fd);
            dom.formulaInfo.textContent = `配方一份約 ${Math.round(uw * 10) / 10} g；` + (c.grams ? `本產品用 ${Math.round(c.grams * 10) / 10} g（約 ${uw > 0 ? Math.round(c.grams / uw * 1000) / 1000 : 0} 份）` : "請填用量");
        } else dom.formulaInfo.textContent = "";

        dom.costBox.innerHTML = used ? `
<div>配方原料：<b>${money(c.formula)}</b>　配方人工 / 其他：<b>${money(c.extra)}</b>　包材：<b>${money(c.packaging)}</b>${c.decor || packRows.some(r => r.Kind === "decor") ? `　裝飾 / 配料：<b>${money(c.decor)}</b>` : ""}</div>
<div class="mt-1">每個產品成本：<b class="text-success fs-6">${money(c.total)}</b></div>
${c.missing.length ? `<div class="text-danger mt-1">⚠️ 這些沒有單價，成本會偏低：${App.esc([...new Set(c.missing)].join("、"))}</div>` : ""}` : `<span class="text-muted">還沒選配方、包材或裝飾：成本欄請手動填寫。</span>`;

        if (apply && used) {
            dom.CostPrice.value = Math.round(c.total * 100) / 100;
            calculateProfit();
        }

        return c;
    }

    // 全部產品：依配方與包材目前的價格重算成本（原料或包材調價後使用）
    async function recalcAll() {

        const targets = allProducts.filter(p => p.FormulaID || Cost.parsePackaging(p.PackagingJson).length);

        if (!targets.length) { alert("還沒有產品設定配方或包材"); return; }

        const ops = [];
        const lines = [];

        targets.forEach(p => {
            const c = Cost.product(p, formulas, details, materials);
            const now = Math.round(c.total * 100) / 100;
            const old = Number(p.CostPrice) || 0;
            if (Math.abs(now - old) < 0.005) return;
            ops.push({ action: "update", table: "Products", id: p.ID, data: { CostPrice: now } });
            lines.push(`${p.ProductName}：${money(old)} → ${money(now)}`);
        });

        if (!ops.length) { alert("所有產品的成本都已是最新"); return; }

        if (!confirm(`以下 ${ops.length} 個產品的成本會更新：\n\n${lines.slice(0, 15).join("\n")}${lines.length > 15 ? "\n…" : ""}\n\n確定更新嗎？`)) return;

        try {
            await API.batch(ops, { loadingText: "更新成本中…" });
            await searchProducts();
            if (currentDetail) {
                const fresh = allProducts.find(p => p.ID === currentDetail.ID);
                if (fresh) { currentDetail = fresh; fillForm(fresh); }
            }
            alert(`✅ 已更新 ${ops.length} 個產品的成本`);
        } catch (err) {
            App.error(err, "更新失敗");
        }
    }

    function renderCategory(categories) {

        // 重畫時保留目前選擇
        const q = dom.qCategory.value;
        const f = dom.CategoryID.value;

        dom.qCategory.innerHTML =
            `<option value="">全部分類</option>`;

        dom.CategoryID.innerHTML =
            `<option value="">請選擇分類</option>`;

        (categories || [])
            // 只載入啟用（未設定也視為啟用）
            .filter(c => c.IsActive !== false && c.CategoryName)
            .forEach(c => {
                dom.qCategory.add(new Option(c.CategoryName, c.ID));
                dom.CategoryID.add(new Option(c.CategoryName, c.ID));
            });

        // 編輯中的產品使用已停用的分類：仍顯示該分類，避免儲存時被清掉
        if (f && ![...dom.CategoryID.options].some(o => o.value === f)) {
            const c = (categories || []).find(x => String(x.ID) === f);
            dom.CategoryID.add(new Option((c ? c.CategoryName : "分類 " + f) + "（已停用）", f));
        }

        dom.qCategory.value = [...dom.qCategory.options].some(o => o.value === q) ? q : "";
        dom.CategoryID.value = f;
        categoryList = categories || [];
    }

    let categoryList = [];

    function openCategoryManager() {
        CategoryManager.open({
            products: () => allProducts,
            onChange: list => {
                renderCategory(list);

            }
        });
    }

    async function submitProduct() {
        const data =
            buildPayload();
        if (!data.ProductName) {
            alert("請輸入產品名稱");
            return;
        }
        try {
            let synced = 0;
            if (mode === "create") {
                const created = await API.insert("Products", data);
                currentDetail = created;
                specBase = null;
                alert(`🎉 產品建立成功\n🆔 ID：${created.ID}`);
            }
            else {
                // 改了名稱 / 品牌 / 分類 / 說明 → 同名的其他規格一起改（不然會被拆成不同產品）
                const old = currentDetail;
                const others = siblingsOf(old).filter(x => x.ID !== old.ID);
                const patch = {};
                SHARED_FIELDS.forEach(k => { if (String(old[k] ?? "") !== String(data[k] ?? "")) patch[k] = data[k]; });
                currentDetail = await API.update("Products", old.ID, data);
                if (others.length && Object.keys(patch).length) {
                    await API.batch(others.map(x => ({ action: "update", table: "Products", id: x.ID, data: patch })), { loadingText: "同步其他規格…" });
                    synced = others.length;
                }
                alert("✅ 產品資料修改成功" + (synced ? `\n已同步 ${synced} 個其他規格的名稱 / 品牌 / 分類 / 說明` : ""));
            }
            // 重新整理左側清單
            await searchProducts();
            // 保持目前畫面，不要關閉
            showForm();
            if (mode === "create") {
                // 新增完成 → 切換成修改這一筆（規格列會多出新的規格）
                currentDetail = allProducts.find(x => x.ID === currentDetail.ID) || currentDetail;
                fillForm(currentDetail);
                setModeUI("edit");
            }
            else {
                // 修改模式維持修改模式
                fillForm(currentDetail);
                setModeUI("edit");
            }
        }
        catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    function buildPayload() {
        return {
            SKU: dom.SKU.value.trim(),
            Barcode: dom.Barcode.value.trim(),
            ProductName: dom.ProductName.value.trim(),
            ShortName: dom.ShortName.value.trim(),
            CategoryID: App.numOrNull(dom.CategoryID.value),
            Brand: dom.Brand.value.trim(),
            Specification: dom.Specification.value.trim(),
            Flavor: dom.Flavor.value.trim(),
            Capacity: dom.Capacity.value.trim(),
            Weight: App.numOrNull(dom.Weight.value),
            Color: dom.Color.value.trim(),
            Material: dom.Material.value.trim(),
            Unit: dom.Unit.value.trim(),
            SalePrice: App.numOrNull(dom.SalePrice.value),
            MemberPrice: App.numOrNull(dom.MemberPrice.value),
            CostPrice: App.numOrNull(dom.CostPrice.value),
            ExpDate: dom.ExpDate.value || "",
            FormulaID: dom.FormulaID.value.trim(),
            FormulaUseMode: dom.FormulaUseMode.value || "portion",
            FormulaUseQty: App.numOrNull(dom.FormulaUseQty.value),
            PackagingJson: JSON.stringify(packRows.filter(r => String(r.Name || "").trim() || r.MaterialID).map(r => ({
                MaterialID: r.MaterialID ? String(r.MaterialID) : "", Name: String(r.Name || "").trim(), Qty: Number(r.Qty) || 0, UnitCost: r.UnitCost === "" ? "" : Number(r.UnitCost) || 0,
                ...(r.Kind === "decor" ? { Kind: "decor" } : {})
            }))),
            MinStock: App.numOrNull(dom.MinStock.value),
            CurrentStock: App.numOrNull(dom.CurrentStock.value),
            Status: dom.Status.value.trim(),
            IsB2B: dom.IsB2B.checked,
            IsB2C: dom.IsB2C.checked,
            IsActive: dom.IsActive.checked,
            Description: dom.Description.value,
            Remark: dom.Remark.value
        };
    }

    async function removeProduct() {
        if (!currentDetail) {
            alert(
                "請先選擇產品"
            );
            return;
        }
        const ok =
            confirm(
                `確認刪除產品？
SKU：
${currentDetail.SKU}
產品：
${currentDetail.ProductName}
刪除後無法復原。`
            );

        if (!ok)
            return;
        try {
            await API.remove("Products", currentDetail.ID);
            alert("🗑️ 刪除完成");
            currentDetail = null;
            hideForm();
            setModeUI(
                "view"
            );
            await searchProducts();
        }
        catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function clearForm() {
        if (mode === "edit" && currentDetail) {
            fillForm(currentDetail);
        }
        else {
            dom.form.reset();
            dom.ID.value = "";
            currentDetail = null;
            packRows = [];
            renderPack();
            updateUseLabel();
            recalc(false);
            calculateProfit();
            updateStockWarning();
        }
    }

    // 規格列：同一個產品的各個規格（切換、新增規格）
    function renderSpecBar() {
        const base = specBase || currentDetail;
        const show = !!base && (mode === "edit" || (mode === "create" && specBase));
        dom.specBar.classList.toggle("d-none", !show);
        if (!show) { dom.specBar.innerHTML = ""; return; }
        const sibs = siblingsOf(base);
        dom.specBar.innerHTML = `<span class="small text-muted me-1">📐 規格：</span>` +
            sibs.map((p, i) => `<button type="button" class="btn btn-sm ${mode === "edit" && currentDetail && currentDetail.ID === p.ID ? "btn-primary" : "btn-outline-primary"}" data-spec="${p.ID}">${App.esc(specLabel(p, i))}</button>`).join("") +
            (mode === "create" ? `<span class="btn btn-sm btn-success disabled">新規格（尚未儲存）</span>` : `<button type="button" class="btn btn-sm btn-outline-success" data-addspec>＋ 新增規格</button>`);
    }

    // 新增規格：複製目前產品的名稱、品牌、分類、配方、包材，規格 / 售價 / 成本 / 庫存留白重填
    function openAddSpec() {
        const base = currentDetail;
        if (!base) return;
        fillForm(base);
        ["ID", "SKU", "Barcode", "Specification", "Capacity", "Weight", "SalePrice", "MemberPrice", "CostPrice", "ExpDate", "FormulaUseQty", "MinStock", "CurrentStock", "Remark", "CreatedBy", "CreatedAt", "UpdatedBy", "UpdatedAt"]
            .forEach(k => { if (dom[k]) dom[k].value = ""; });
        currentDetail = null;
        specBase = base;
        recalc(false);
        calculateProfit();
        updateStockWarning();
        showForm();
        setModeUI("create");
        dom.Specification.focus();
    }

    function setModeUI(newMode) {
        mode = newMode;
        renderSpecBar();
        if (mode === "create") {
            dom.editHint.classList.add("d-none");
            dom.btnCreate.disabled = false;
            dom.btnUpdate.disabled = true;
            dom.btnDelete.disabled = true;
        }
        else if (mode === "edit") {
            dom.editHint.classList.remove("d-none");
            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = false;
            dom.btnDelete.disabled = false;
        }
        else {
            dom.editHint.classList
                .add(
                    "d-none"
                );
        }
    }

    function showForm() {
        dom.formCard
            .classList
            .remove(
                "d-none"
            );
    }

    function hideForm() {
        dom.formCard
            .classList
            .add(
                "d-none"
            );
    }

    function scrollToForm() {
        setTimeout(() => {
            dom.formCard
                .scrollIntoView({
                    behavior:
                        "smooth",
                    block:
                        "start"
                });
        }, 100);
    }

    return {
        init,
        removeProduct
    };
})();