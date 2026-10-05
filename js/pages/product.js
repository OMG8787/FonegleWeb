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
        ["FormulaUseMode", "FormulaUseQty", "formulaInfo", "packList", "packNames", "costBox", "btnAddPack", "btnApplyCost", "useQtyLabel", "btnRecalcAll"]
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
            "ShelfLifeDays",
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
        dom.productList.addEventListener(
            "click",
            async e => {
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
        dom.btnApplyCost.addEventListener("click", () => recalc(true));
        dom.btnAddPack.addEventListener("click", () => {
            packRows.push({ MaterialID: "", Name: "", Qty: 1, UnitCost: "" });
            renderPack();
            dom.packList.querySelector("tr:last-child [data-f=Name]")?.focus();
        });
        ["FormulaID", "FormulaUseMode", "FormulaUseQty"].forEach(id => {
            dom[id].addEventListener("input", () => recalc(true));
            dom[id].addEventListener("change", () => recalc(true));
        });
        dom.FormulaUseMode.addEventListener("change", updateUseLabel);
        dom.packList.addEventListener("input", onPackInput);
        dom.packList.addEventListener("change", onPackChange);
        dom.packList.addEventListener("click", onPackClick);
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

        listCache = list;

        renderList({
            title: "📦 產品列表",
            count: list.length,
            list
        });
    }

    function renderList(result) {
        dom.searchTitle.textContent =
            result.title;
        dom.searchCount.textContent =
            `共 ${result.count} 筆`;
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
        packRows = Cost.parsePackaging(d && d.PackagingJson).map(x => ({ MaterialID: x.MaterialID ?? "", Name: x.Name || "", Qty: x.Qty ?? "", UnitCost: x.UnitCost ?? "" }));
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
        const pack = materials.filter(m => /包/.test(m.Category || ""));
        dom.packNames.innerHTML = (pack.length ? pack : materials)
            .map(m => `<option value="${App.esc(m.MaterialName)}">${m.CostPrice !== null && m.CostPrice !== undefined ? `$${m.CostPrice}/${App.esc(m.Unit || "個")}` : ""}</option>`).join("");
    }

    function updateUseLabel() {
        dom.useQtyLabel.textContent = dom.FormulaUseMode.value === "weight" ? "用量（g）" : "用量（份）";
    }

    const matById = id => (id === "" || id === null || id === undefined ? null : materials.find(m => String(m.ID) === String(id)));
    const matByName = name => { const n = String(name || "").trim(); return n ? materials.find(m => String(m.MaterialName).trim() === n) : null; };

    function renderPack() {

        dom.packList.innerHTML = packRows.map((r, i) => {
            const m = matById(r.MaterialID);
            const price = m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? Number(m.CostPrice) : Number(r.UnitCost) || 0;
            const btn = m ? `<button type="button" class="btn btn-outline-secondary" data-act="edit" data-i="${i}" title="修改原料庫的名稱、單價">✏️</button>`
                : String(r.Name || "").trim() ? `<button type="button" class="btn btn-outline-primary" data-act="add" data-i="${i}" title="這個包材還沒登入原料庫，點這裡新增">＋ 新增</button>` : "";
            return `<tr data-i="${i}">
    <td><div class="input-group input-group-sm"><input class="form-control" list="packNames" data-f="Name" value="${App.esc(m ? m.MaterialName : r.Name || "")}" placeholder="包材名稱">${btn}</div></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm text-end" data-f="Qty" value="${App.esc(r.Qty ?? "")}"></td>
    <td class="text-end small">${m || r.UnitCost !== "" ? money(price, 4) + (m && m.Unit ? "/" + App.esc(m.Unit) : "") : `<span class="text-danger">無單價</span>`}</td>
    <td class="text-end small" data-c="sub">${money(price * (Number(r.Qty) || 0))}</td>
    <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0" data-act="remove" data-i="${i}" title="移除">✕</button></td>
</tr>`;
        }).join("") || `<tr><td colspan="5" class="text-muted small">還沒有包材</td></tr>`;
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
            name: r.Name, category: "包材", unit: "個",
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
<div>配方原料：<b>${money(c.formula)}</b>　配方人工 / 其他：<b>${money(c.extra)}</b>　包材：<b>${money(c.packaging)}</b></div>
<div class="mt-1">每個產品成本：<b class="text-success fs-6">${money(c.total)}</b></div>
${c.missing.length ? `<div class="text-danger mt-1">⚠️ 這些沒有單價，成本會偏低：${App.esc([...new Set(c.missing)].join("、"))}</div>` : ""}` : `<span class="text-muted">還沒選配方或包材：成本欄請手動填寫。</span>`;

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
            if (mode === "create") {
                const created = await API.insert("Products", data);
                currentDetail = created;
                alert(`🎉 產品建立成功\n🆔 ID：${created.ID}`);
            }
            else {
                currentDetail = await API.update("Products", currentDetail.ID, data);
                alert("✅ 產品資料修改成功");
            }
            // 重新整理左側清單
            await searchProducts();
            // 保持目前畫面，不要關閉
            showForm();
            if (mode === "create") {
                // 新增模式維持新增模式
                setModeUI("create");
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
            ShelfLifeDays: App.numOrNull(dom.ShelfLifeDays.value),
            FormulaID: dom.FormulaID.value.trim(),
            FormulaUseMode: dom.FormulaUseMode.value || "portion",
            FormulaUseQty: App.numOrNull(dom.FormulaUseQty.value),
            PackagingJson: JSON.stringify(packRows.filter(r => String(r.Name || "").trim() || r.MaterialID).map(r => ({
                MaterialID: r.MaterialID ? String(r.MaterialID) : "", Name: String(r.Name || "").trim(), Qty: Number(r.Qty) || 0, UnitCost: r.UnitCost === "" ? "" : Number(r.UnitCost) || 0
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

    function setModeUI(newMode) {
        mode = newMode;
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