window.Pages = window.Pages || {};
Pages.Material = (() => {
    "use strict";
    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let mode = "view";

    async function init() {
        cacheDom();
        bindEvents();

        hideForm();
        setModeUI("view");

        try {

            // 供應商與原料一次載入
            const data = await API.getMany(["Companies", "Material"]);

            renderCompanyOptions(data.Companies);
            applySearch(data.Material);

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {
        // 表單區
        dom.formCard =
            document.getElementById("formCard");
        dom.form =
            document.getElementById("materialForm");
        dom.editHint =
            document.getElementById("editHint");
        // 列表
        dom.materialList =
            document.getElementById("materialList");
        dom.emptyHint =
            document.getElementById("emptyHint");
        dom.searchTitle =
            document.getElementById("searchTitle");
        dom.searchCount =
            document.getElementById("searchCount");

        dom.btnNew =
            document.getElementById("btnNew");
        dom.qSpecification =
            document.getElementById("qSpecification");
        dom.qOriginCountry =
            document.getElementById("qOriginCountry");
        dom.qIsActive =
            document.getElementById("qIsActive");

        // 搜尋條件
        dom.qMaterialName =
            document.getElementById("qMaterialName");
        dom.qCategory =
            document.getElementById("qCategory");
        dom.qSupplierID =
            document.getElementById("qSupplierID");
        dom.qBarcode =
            document.getElementById("qBarcode");
        dom.qLowStock =
            document.getElementById("qLowStock");
        dom.btnSearch =
            document.getElementById("btnSearch");
        // CRUD
        dom.btnCreate =
            document.getElementById("btnCreate");
        dom.btnUpdate =
            document.getElementById("btnUpdate");
        dom.btnDelete =
            document.getElementById("btnDelete");
        dom.btnClear =
            document.getElementById("btnClear");

        // 欄位
        dom.ID =
            document.getElementById("ID");
        dom.MaterialName =
            document.getElementById("MaterialName");
        dom.Category =
            document.getElementById("Category");
        dom.SupplierID =
            document.getElementById("SupplierID");
        dom.Barcode =
            document.getElementById("Barcode");
        dom.Unit =
            document.getElementById("Unit");
        dom.CostPrice =
            document.getElementById("CostPrice");
        dom.CurrentStock =
            document.getElementById("CurrentStock");
        dom.MinStock =
            document.getElementById("MinStock");
        dom.Specification =
            document.getElementById("Specification");
        dom.OriginCountry =
            document.getElementById("OriginCountry");
        dom.ExpireDays =
            document.getElementById("ExpireDays");
        dom.IsActive =
            document.getElementById("IsActive");
        dom.Description =
            document.getElementById("Description");
        dom.Remark =
            document.getElementById("Remark");
    }

    function bindEvents() {
        dom.btnNew?.addEventListener(
            "click",
            openCreate
        );
        dom.btnSearch?.addEventListener(
            "click",
            searchMaterial
        );
        dom.btnCreate?.addEventListener(
            "click",
            submitMaterial
        );
        dom.btnUpdate?.addEventListener(
            "click",
            submitMaterial
        );
        dom.btnDelete?.addEventListener(
            "click",
            removeMaterial
        );
        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );
        dom.materialList?.addEventListener(
            "click",
            async e => {
                const card =
                    e.target.closest(
                        ".material-card"
                    );
                if (!card)
                    return;
                const item =
                    listCache[
                    card.dataset.index
                    ];
                dom.materialList
                    .querySelectorAll(".material-card")
                    .forEach(c => c.classList.remove("active"));

                card.classList.add("active");

                await loadDetail(item);
            }
        );
    }

    function renderCompanyOptions(companies) {

        // 編輯區
        dom.SupplierID.innerHTML =
            `<option value="">請選擇供應商</option>`;

        // 搜尋區
        dom.qSupplierID.innerHTML =
            `<option value="">全部供應商</option>`;

        companies
            .filter(c => c.CompanyName)
            .forEach(c => {
                dom.SupplierID.add(new Option(c.CompanyName, c.ID));
                dom.qSupplierID.add(new Option(c.CompanyName, c.ID));
            });
    }

    async function searchMaterial() {

        try {

            applySearch(await API.list("Material"));

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    function applySearch(all) {

        const q = {
            name: dom.qMaterialName.value.trim(),
            category: dom.qCategory.value.trim(),
            supplier: dom.qSupplierID.value,
            barcode: dom.qBarcode.value.trim(),
            spec: dom.qSpecification.value.trim(),
            origin: dom.qOriginCountry.value.trim()
        };

        listCache = all
            .filter(m =>
                App.like(m.MaterialName, q.name) &&
                App.like(m.Category, q.category) &&
                (!q.supplier || String(m.SupplierID) === q.supplier) &&
                App.like(m.Barcode, q.barcode) &&
                App.like(m.Specification, q.spec) &&
                App.like(m.OriginCountry, q.origin) &&
                (!dom.qLowStock.checked || App.num(m.CurrentStock) <= App.num(m.MinStock)) &&
                (!dom.qIsActive.checked || m.IsActive !== false))
            .sort((a, b) => a.ID - b.ID);

        renderMaterialList(listCache);
    }

    function renderMaterialList(list) {
        dom.materialList.innerHTML = "";
        dom.searchCount.textContent = `共 ${list.length} 筆`;
        dom.searchTitle.textContent = "原料查詢結果";
        if (list.length === 0) {
            dom.emptyHint.classList.remove("d-none");
            return;
        }
        dom.emptyHint.classList.add("d-none");
        list.forEach((m, index) => {
            const div = document.createElement("div");
            div.className = "material-card";
            div.dataset.index = index;
            div.innerHTML = `
            <div class="material-name">
                ${App.esc(m.MaterialName)}
            </div>
            <div class="material-id">
                ID：${m.ID}
            </div>
            <div class="material-info">
                <span>分類：${App.esc(m.Category || "-")}</span>
                <span>庫存：${m.CurrentStock ?? 0} ${App.esc(m.Unit || "")}</span>
                <span>成本：${m.CostPrice ?? 0}</span>
            </div>
        `;
            dom.materialList.appendChild(div);
        });
    }

    function loadDetail(item) {

        if (!item || !item.ID)
            return;

        currentDetail = item;
        fillForm(item);
        showForm();
        setModeUI("edit");
        scrollToForm();
    }

    function fillForm(d) {
        const v = x => (x === null || x === undefined ? "" : String(x));
        dom.ID.value = v(d.ID);
        dom.MaterialName.value = v(d.MaterialName);
        dom.Category.value = v(d.Category);
        dom.SupplierID.value = v(d.SupplierID);
        dom.Barcode.value = v(d.Barcode);
        dom.Unit.value = v(d.Unit);
        dom.CostPrice.value = v(d.CostPrice);
        dom.CurrentStock.value = v(d.CurrentStock);
        dom.MinStock.value = v(d.MinStock);
        dom.Specification.value = v(d.Specification);
        dom.OriginCountry.value = v(d.OriginCountry);
        dom.ExpireDays.value = v(d.ExpireDays);
        dom.IsActive.value = d.IsActive === false ? "false" : "true";
        dom.Description.value = v(d.Description);
        dom.Remark.value = v(d.Remark);
    }

    function showForm() {
        dom.formCard.classList.remove("d-none");
    }

    function hideForm() {
        dom.formCard.classList.add("d-none");
    }

    function scrollToForm() {
        setTimeout(() => {
            dom.formCard.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 100);
    }

    function buildPayload() {
        return {
            MaterialName: dom.MaterialName.value.trim(),
            Category: dom.Category.value.trim(),
            SupplierID: App.numOrNull(dom.SupplierID.value),
            Barcode: dom.Barcode.value.trim(),
            Unit: dom.Unit.value.trim(),
            CostPrice: App.numOrNull(dom.CostPrice.value),
            CurrentStock: App.numOrNull(dom.CurrentStock.value) ?? 0,
            MinStock: App.numOrNull(dom.MinStock.value),
            Specification: dom.Specification.value.trim(),
            OriginCountry: dom.OriginCountry.value.trim(),
            ExpireDays: App.numOrNull(dom.ExpireDays.value),
            IsActive: dom.IsActive.value === "true",
            Description: dom.Description.value,
            Remark: dom.Remark.value
        };
    }

    async function submitMaterial() {
        const data = buildPayload();
        if (!data.MaterialName) {
            alert("請輸入原料名稱");
            return;
        }
        try {
            if (mode === "create") {
                const created = await API.insert("Material", data);
                alert(`🎉 原料建立成功\n🆔 ID：${created.ID}\n📦 目前庫存：${created.CurrentStock ?? 0} ${created.Unit || ""}`);
            }
            else {
                await API.update("Material", dom.ID.value, data);
                alert("✅ 原料資料修改成功");
            }
            currentDetail = null;
            hideForm();
            setModeUI("view");
            await searchMaterial();
        }
        catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function removeMaterial() {
        if (
            !dom.ID.value
        )
            return;
        if (
            !confirm("確認刪除此原料資料？")
        )
            return;
        try {
            await API.remove("Material", dom.ID.value);
            alert("🗑️ 刪除完成");
            hideForm();
            currentDetail = null;
            setModeUI("view");
            await searchMaterial();
        }
        catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function openCreate() {
        currentDetail = null;
        dom.form.reset();
        dom.ID.value = "";
        dom.IsActive.value = "true";
        showForm();
        setModeUI("create");
        scrollToForm();
    }

    function clearForm() {
        if (
            mode === "edit" && currentDetail
        ) {
            fillForm(currentDetail);
        }
        else {
            dom.form.reset();
            dom.ID.value = "";
            dom.IsActive.value = "true";
        }
    }
    function setModeUI(newMode) {
        mode = newMode;
        if (
            mode === "create"
        ) {
            dom.editHint.classList.add("d-none");
            dom.btnCreate.disabled = false;
            dom.btnUpdate.disabled = true;
            dom.btnDelete.disabled = true;
        }
        else if (
            mode === "edit"
        ) {
            dom.editHint.classList.remove("d-none");
            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = false;
            dom.btnDelete.disabled = false;
        }
        else {
            dom.editHint.classList.add("d-none");
            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = true;
            dom.btnDelete.disabled = true;
        }
    }

    return {
        init,
        openCreate
    };
})();