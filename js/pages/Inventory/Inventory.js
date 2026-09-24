window.Pages = window.Pages || {};
Pages.Inventory = (() => {
    "use strict";
    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let currentMode = "create";
    let productMap = {};
    function init() {
        cacheDom();
        bindEvents();
        clearForm();
        loadBasic();
    }
    function cacheDom() {
        // 快速盤點
        dom.ddlInventoryType =
            document.getElementById("ddlInventoryType");
        dom.ddlQuickProduct =
            document.getElementById("ddlQuickProduct");
        dom.QuickQty =
            document.getElementById("QuickQty");
        dom.btnGetInventoryList =
            document.getElementById("btnGetInventoryList");
        dom.btnQuickInventory =
            document.getElementById("btnQuickInventory");
        // 查詢
        dom.ddlProduct =
            document.getElementById("ddlProduct");
        dom.ddlBatchNo =
            document.getElementById("ddlBatchNo");
        dom.ddlWarehouse =
            document.getElementById("ddlWarehouse");
        dom.ddlReceiveDate =
            document.getElementById("ddlReceiveDate");
        dom.btnSearch =
            document.getElementById("btnSearch");
        dom.btnSearchReset =
            document.getElementById("btnSearchReset");
        // 列表
        dom.receiveList =
            document.getElementById("receiveList");
        dom.receiveEmpty =
            document.getElementById("receiveEmpty");
        dom.receiveCount =
            document.getElementById("receiveCount");
        // 表單
        dom.form =
            document.getElementById("inventoryForm");
        dom.InventoryID =
            document.getElementById("InventoryID");
        dom.ProductID =
            document.getElementById("ProductID");
        dom.BatchNo =
            document.getElementById("BatchNo");
        dom.Warehouse =
            document.getElementById("Warehouse");
        dom.Location =
            document.getElementById("Location");
        dom.StockQty =
            document.getElementById("StockQty");
        dom.MfgDate =
            document.getElementById("MfgDate");
        dom.ExpDate =
            document.getElementById("ExpDate");
        dom.Status =
            document.getElementById("Status");
        dom.IsActive =
            document.getElementById("IsActive");
        dom.Remark =
            document.getElementById("Remark");
        dom.CreatedAt =
            document.getElementById("CreatedAt");
        dom.UpdatedAt =
            document.getElementById("UpdatedAt");
        // 按鈕
        dom.btnCreate =
            document.getElementById("btnCreate");
        dom.btnUpdate =
            document.getElementById("btnUpdate");
        dom.btnDelete =
            document.getElementById("btnDelete");
        dom.btnCancel =
            document.getElementById("btnCancel");
        dom.btnNewInventory =
            document.getElementById("btnNewInventory");
    }
    function bindEvents() {
        // 取得快速盤點列表
        dom.btnGetInventoryList?.addEventListener(
            "click",
            loadQuickInventoryList
        );

        // 快速盤點
        dom.btnQuickInventory?.addEventListener(
            "click",
            quickInventory
        );

        // 查詢
        dom.btnSearch?.addEventListener(
            "click",
            searchInventory
        );

        dom.btnSearchReset?.addEventListener(
            "click",
            () => {
                dom.ddlProduct.value = "";
                dom.ddlBatchNo.value = "";
                dom.ddlWarehouse.value = "";
                dom.ddlReceiveDate.value = "";
                searchInventory();
            }
        );

        // 新增
        dom.btnCreate?.addEventListener(
            "click",
            submitReceive
        );

        // 修改
        dom.btnUpdate?.addEventListener(
            "click",
            submitReceive
        );

        // 刪除
        dom.btnDelete?.addEventListener(
            "click",
            removeReceive
        );
        // 新增按鈕
        dom.btnNewInventory?.addEventListener(
            "click",
            clearForm
        );
        // 列表點擊
        dom.receiveList?.addEventListener(
            "click",
            async e => {
                const card =
                    e.target.closest(".inventory-card");
                if (!card)
                    return;
                const item =
                    listCache[
                    card.dataset.index
                    ];
                document
                    .querySelectorAll(".inventory-card")
                    .forEach(x =>
                        x.classList.remove("active")
                    );
                card.classList.add("active");
                await loadDetail(item);
            }
        );
    }
    async function loadBasic() {
        try {
            const data =
                await API.getMany(["Inventory", "Products", "Material"]);
            loadProductOption(data.Products);
            fillQuickInventory(
                dom.ddlInventoryType.value === "material"
                    ? data.Material
                    : data.Products
            );
            applySearch(data.Inventory);
        }
        catch (err) {
            App.error(err, "初始化失敗");
        }
    }

    function loadProductOption(products) {
        productMap = Object.fromEntries(
            products.map(p => [String(p.ID), p.ProductName || String(p.ID)])
        );
        dom.ddlProduct.innerHTML =
            `<option value="">
                全部品項
            </option>`;
        dom.ProductID.innerHTML =
            `<option value="">
                請選擇品項
            </option>`;
        products.forEach(p => {
            const name = p.ProductName || String(p.ID);
            dom.ddlProduct.add(new Option(name, p.ID));
            dom.ProductID.add(new Option(name, p.ID));
        });
    }

    async function searchInventory() {
        try {
            applySearch(await API.list("Inventory"));
        }
        catch (err) {
            App.error(err, "查詢失敗");
        }
    }

    function applySearch(rows) {
        const q = {
            product: dom.ddlProduct.value,
            batch: dom.ddlBatchNo.value.trim(),
            warehouse: dom.ddlWarehouse.value.trim(),
            date: dom.ddlReceiveDate.value
        };
        const list = rows
            .filter(r =>
                (!q.product || String(r.ProductID) === q.product) &&
                App.like(r.BatchNo, q.batch) &&
                App.like(r.Warehouse, q.warehouse) &&
                (!q.date || App.toDateInput(r.CreatedAt) === q.date))
            .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)))
            .map(r => ({
                ...r,
                ProductName: productMap[String(r.ProductID)] || (r.ProductID ? `產品ID ${r.ProductID}` : "")
            }));
        listCache = list;
        renderReceiveList({
            count: list.length,
            list
        });
    }

    // ================================
    // 顯示進貨列表
    // ================================
    function renderReceiveList(result) {
        dom.receiveList.innerHTML =
            "";
        dom.receiveCount.textContent =
            result.count + " 筆";
        if (!result.list.length) {
            dom.receiveEmpty.classList
                .remove("d-none");
            return;
        }
        dom.receiveEmpty.classList
            .add("d-none");
        result.list.forEach(
            (item, index) => {
                const card =
                    document.createElement("div");
                card.className =
                    "inventory-card";
                card.dataset.index =
                    index;
                card.innerHTML = `
<div class="inventory-name">
${App.esc(item.ProductName || "未指定品項")}
</div>
<div class="inventory-info">
📦 進貨數量：
${item.StockQty ?? 0}
</div>
<div class="inventory-info">
🏷 批號：
${App.esc(item.BatchNo || "-")}
</div>
<div class="inventory-info">
🏠 倉庫：
${App.esc(item.Warehouse || "-")}
</div>
<div class="inventory-info">
📅 建立：
${App.esc(item.CreatedAt || "-")}
</div>
<div class="mt-2">
<span class="badge bg-primary">
${App.esc(item.Status || "正常")}
</span>
</div>
`;
                dom.receiveList.appendChild(card);
            }
        );
    }
    // ================================
    // 查詢單筆進貨
    // ================================
    function loadDetail(item) {
        currentDetail =
            item;
        fillForm(item);
        currentMode =
            "edit";
    }

    // ================================
    // 填入表單
    // ================================
    function fillForm(d) {
        dom.InventoryID.value =
            d.InventoryID ?? "";
        dom.ProductID.value =
            d.ProductID ?? "";
        dom.BatchNo.value =
            d.BatchNo || "";
        dom.Warehouse.value =
            d.Warehouse || "";
        dom.Location.value =
            d.Location || "";
        dom.StockQty.value =
            d.StockQty ?? 0;
        dom.MfgDate.value =
            App.toDateInput(d.MfgDate);
        dom.ExpDate.value =
            App.toDateInput(d.ExpDate);
        dom.Status.value =
            d.Status || "正常";
        dom.Remark.value =
            d.Remark || "";
        dom.IsActive.value =
            d.IsActive === false ? "false" : "true";
        dom.CreatedAt.value =
            d.CreatedAt || "";
        dom.UpdatedAt.value =
            d.UpdatedAt || "";
    }
    // ================================
    // 清空表單
    // ================================
    function clearForm() {
        currentMode =
            "create";
        currentDetail =
            null;
        dom.form?.reset();
        if (dom.InventoryID)
            dom.InventoryID.value = "";
        if (dom.StockQty)
            dom.StockQty.value = 0;
    }
    // ================================
    // 取得快速盤點列表
    // ================================
    async function loadQuickInventoryList() {
        try {
            const table =
                dom.ddlInventoryType.value === "material"
                    ? "Material"
                    : "Products";
            fillQuickInventory(
                await API.list(table)
            );
        }
        catch (err) {
            App.error(err, "取得盤點列表失敗");
        }
    }

    // ================================
    // 填入快速盤點下拉
    // ================================
    function fillQuickInventory(rows) {
        const selected =
            dom.ddlQuickProduct.value;
        dom.ddlQuickProduct.innerHTML =
            "";
        rows
            .filter(x => x.IsActive !== false)
            .forEach(x => {
                const name =
                    x.ProductName || x.MaterialName || String(x.ID);
                dom.ddlQuickProduct.add(
                    new Option(
                        `${name}（目前庫存：${x.CurrentStock ?? 0}）`,
                        x.ID
                    )
                );
            });
        if (selected)
            dom.ddlQuickProduct.value = selected;
    }
    // ==============================
    // 快速盤點
    // ================================
    async function quickInventory() {
        const id =
            dom.ddlQuickProduct.value;
        if (!id) {
            alert(
                "請先取得盤點列表"
            );
            return;
        }
        const qty =
            Number(
                dom.QuickQty.value
            );
        if (dom.QuickQty.value.trim() === "" || isNaN(qty)) {
            alert(
                "請輸入盤點數量"
            );
            return;
        }
        const isProduct =
            dom.ddlInventoryType.value !== "material";
        try {
            const row =
                await API.update(
                    isProduct ? "Products" : "Material",
                    id,
                    { CurrentStock: qty }
                );
            alert(`✅ ${isProduct ? "產品" : "原料"}盤點完成
${isProduct ? "🍦" : "🥛"} 品項：
${row.ProductName || row.MaterialName}
🆔 ID：
${row.ID}
📦 盤點數量：
${qty}`);
            // 重新取得列表
            await loadQuickInventoryList();
        }
        catch (err) {
            App.error(err, "盤點失敗");
        }
    }

    // ================================
    // 建立 / 修改 Payload
    // ================================
    function buildPayload() {
        return {
            ProductID: App.numOrNull(dom.ProductID.value),
            BatchNo: dom.BatchNo.value.trim(),
            Warehouse: dom.Warehouse.value.trim(),
            Location: dom.Location.value.trim(),
            StockQty: App.numOrNull(dom.StockQty.value) ?? 0,
            MfgDate: dom.MfgDate.value,
            ExpDate: dom.ExpDate.value,
            Status: dom.Status.value.trim(),
            IsActive: dom.IsActive.value === "true",
            Remark: dom.Remark.value
        };
    }
    // ================================
    // 建立 / 修改進貨
    // ================================
    async function submitReceive() {
        try {
            const data =
                buildPayload();
            if (!data.ProductID) {
                alert("請選擇品項");
                return;
            }
            if (currentMode === "create") {
                await API.insert("Inventory", data);
                alert("🎉 進貨資料建立成功");
            }
            else {
                await API.update("Inventory", dom.InventoryID.value, data);
                alert("✅ 進貨資料修改成功");
            }
            await loadReceiveList();
            clearForm();
        }
        catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    // ================================
    // 刪除進貨
    // ================================
    async function removeReceive() {
        if (!dom.InventoryID.value) {
            alert(
                "請先選擇進貨紀錄"
            );
            return;
        }
        if (
            !confirm(
                "確認刪除此筆進貨紀錄?"
            )
        )
            return;
        try {
            await API.remove("Inventory", dom.InventoryID.value);
            alert("🗑️ 刪除完成");
            clearForm();
            await loadReceiveList();
        }
        catch (err) {
            App.error(err, "刪除失敗");
        }
    }
    // ================================
    // 重新載入進貨列表
    // ================================
    function loadReceiveList() {
        return searchInventory();
    }
    return {
        init
    };
})();