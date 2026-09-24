window.Pages = window.Pages || {};
Pages.Product = (() => {

    "use strict";
    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let mode = "view";

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
        dom.btnFormula = document.getElementById("btnFormula");
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
        if (dom.btnFormula) {
            dom.btnFormula.addEventListener(
                "click",
                selectFormula
            );
        }
    }

    async function loadInit() {

        try {

            // 分類與產品一次載入
            const data = await API.getMany(["ID_Category", "Products"]);

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

    async function selectFormula() {
        alert("之後會開啟配方選擇視窗");
    }

    function renderCategory(categories) {

        dom.qCategory.innerHTML =
            `<option value="">全部分類</option>`;

        dom.CategoryID.innerHTML =
            `<option value="">請選擇分類</option>`;

        categories
            // 只載入啟用（未設定也視為啟用）
            .filter(c => c.IsActive !== false && c.CategoryName)
            .forEach(c => {
                dom.qCategory.add(new Option(c.CategoryName, c.ID));
                dom.CategoryID.add(new Option(c.CategoryName, c.ID));
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