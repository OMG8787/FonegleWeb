window.Pages = window.Pages || {};

Pages.ProductionLog = (() => {

    "use strict";

    const dom = {};

    let listCache = [];
    let currentDetail = null;
    let mode = "view";

    function init() {

        cacheDom();
        bindEvents();

        // 頁面沒有「新增」按鈕，預設顯示新增表單
        openCreate(false);

        searchProduction();

    }

    function cacheDom() {

        dom.formCard = document.getElementById("formCard");
        dom.form = document.getElementById("productionForm");

        dom.editHint = document.getElementById("editHint");

        dom.productionList = document.getElementById("productionList");
        dom.emptyHint = document.getElementById("emptyHint");

        dom.searchTitle = document.getElementById("searchTitle");
        dom.searchCount = document.getElementById("searchCount");

        dom.qProductionNo = document.getElementById("qProductionNo");
        dom.qBatchNo = document.getElementById("qBatchNo");
        dom.qProductName = document.getElementById("qProductName");
        dom.qFormulaID = document.getElementById("qFormulaID");
        dom.qFactory = document.getElementById("qFactory");
        dom.qProductionLine = document.getElementById("qProductionLine");
        dom.qOperatorName = document.getElementById("qOperatorName");
        dom.qMfgDate = document.getElementById("qMfgDate");
        dom.qExpDate = document.getElementById("qExpDate");
        dom.qStatus = document.getElementById("qStatus");

        dom.btnSearch = document.getElementById("btnSearch");
        dom.btnCreate = document.getElementById("btnCreate");
        dom.btnUpdate = document.getElementById("btnUpdate");
        dom.btnDelete = document.getElementById("btnDelete");
        dom.btnClear = document.getElementById("btnClear");

        dom.ProductionID = document.getElementById("ProductionID");
        dom.ProductID = document.getElementById("ProductID");
        dom.FormulaID = document.getElementById("FormulaID");

        dom.BatchNo = document.getElementById("BatchNo");
        dom.ProductionNo = document.getElementById("ProductionNo");

        dom.Factory = document.getElementById("Factory");
        dom.ProductionLine = document.getElementById("ProductionLine");

        dom.PlannedQty = document.getElementById("PlannedQty");
        dom.ProducedQty = document.getElementById("ProducedQty");
        dom.NGQty = document.getElementById("NGQty");
        dom.Unit = document.getElementById("Unit");

        dom.OperatorName = document.getElementById("OperatorName");
        dom.SupervisorName = document.getElementById("SupervisorName");

        dom.StartTime = document.getElementById("StartTime");
        dom.EndTime = document.getElementById("EndTime");

        dom.MfgDate = document.getElementById("MfgDate");
        dom.ExpDate = document.getElementById("ExpDate");

        dom.Status = document.getElementById("Status");

        dom.Description = document.getElementById("Description");
        dom.Remark = document.getElementById("Remark");

    }

    function bindEvents() {

        dom.btnSearch?.addEventListener(
            "click",
            searchProduction
        );

        dom.btnCreate?.addEventListener(
            "click",
            submitProduction
        );

        dom.btnUpdate?.addEventListener(
            "click",
            submitProduction
        );

        dom.btnDelete?.addEventListener(
            "click",
            removeProduction
        );

        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );

        dom.productionList?.addEventListener(
            "click",
            async e => {

                const card = e.target.closest(".production-card");

                if (!card) return;

                const item = listCache[card.dataset.index];

                await loadDetail(item);

            });

    }

    async function searchProduction() {

        try {

            const { ProductionLog: rows, Products: products } =
                await API.getMany(["ProductionLog", "Products"]);

            const productMap =
                Object.fromEntries(products.map(x => [String(x.ID), x.ProductName]));

            const q = {
                no: dom.qProductionNo.value.trim(),
                batch: dom.qBatchNo.value.trim(),
                product: dom.qProductName.value.trim(),
                formula: dom.qFormulaID.value.trim(),
                factory: dom.qFactory.value.trim(),
                line: dom.qProductionLine.value.trim(),
                operator: dom.qOperatorName.value.trim(),
                mfg: dom.qMfgDate.value,
                exp: dom.qExpDate.value,
                status: dom.qStatus.value
            };

            const list = rows
                .map(r => ({ ...r, ProductName: productMap[String(r.ProductID)] || "" }))
                .filter(r =>
                    App.like(r.ProductionNo, q.no) &&
                    App.like(r.BatchNo, q.batch) &&
                    (App.like(r.ProductName, q.product) || App.like(r.ProductID, q.product)) &&
                    App.like(r.FormulaID, q.formula) &&
                    App.like(r.Factory, q.factory) &&
                    App.like(r.ProductionLine, q.line) &&
                    App.like(r.OperatorName, q.operator) &&
                    (!q.mfg || App.toDateInput(r.MfgDate) === q.mfg) &&
                    (!q.exp || App.toDateInput(r.ExpDate) === q.exp) &&
                    (!q.status || r.Status === q.status))
                .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));

            listCache = list;

            renderList({
                title: "🏭 生產紀錄",
                list
            });

        } catch (err) {

            App.error(err, "查詢失敗");
        }

    }
    function renderList(result) {

        const list = result.list || [];

        dom.searchTitle.textContent =
            result.title || "生產紀錄";

        dom.searchCount.textContent =
            `${list.length} 筆`;

        dom.productionList.innerHTML = "";

        if (!list.length) {

            dom.emptyHint.classList.remove("d-none");
            return;

        }

        dom.emptyHint.classList.add("d-none");

        list.forEach((item, index) => {

            const card = document.createElement("div");

            card.className = "production-card";

            card.dataset.index = index;

            const esc = App.esc;

            card.innerHTML = `
                <div class="production-title">
                    ${esc(item.ProductionNo || "")}
                </div>

                <div class="production-info">

                    <div>
                        🍦 ${esc(item.ProductName || item.ProductID || "")}
                    </div>

                    <div>
                        📦 ${esc(item.BatchNo || "")}
                    </div>

                    <div>
                        🏭 ${esc(item.Factory || "")}
                    </div>

                    <div>
                        👨‍🔧 ${esc(item.OperatorName || "")}
                    </div>

                    <div>
                        📅 ${esc(item.MfgDate || "")}
                    </div>

                    <div>
                        ✔ ${esc(item.Status || "")}
                    </div>

                </div>
            `;

            dom.productionList.appendChild(card);

        });

    }

    function loadDetail(item) {

        if (!item)
            return;

        currentDetail = item;

        fillForm(item);

        showForm();

        setModeUI("edit");

        scrollToForm();

    }

    function fillForm(d) {

        dom.ProductionID.value =
            d.ProductionID || "";

        dom.ProductID.value =
            d.ProductID || "";

        dom.FormulaID.value =
            d.FormulaID || "";

        dom.BatchNo.value =
            d.BatchNo || "";

        dom.ProductionNo.value =
            d.ProductionNo || "";

        dom.Factory.value =
            d.Factory || "";

        dom.ProductionLine.value =
            d.ProductionLine || "";

        dom.PlannedQty.value =
            d.PlannedQty ?? 0;

        dom.ProducedQty.value =
            d.ProducedQty ?? 0;

        dom.NGQty.value =
            d.NGQty ?? 0;

        dom.Unit.value =
            d.Unit || "";

        dom.OperatorName.value =
            d.OperatorName || "";

        dom.SupervisorName.value =
            d.SupervisorName || "";

        dom.StartTime.value =
            formatDateTimeLocal(d.StartTime);

        dom.EndTime.value =
            formatDateTimeLocal(d.EndTime);

        dom.MfgDate.value =
            formatDate(d.MfgDate);

        dom.ExpDate.value =
            formatDate(d.ExpDate);

        dom.Status.value =
            d.Status || "待生產";

        dom.Description.value =
            d.Description || "";

        dom.Remark.value =
            d.Remark || "";

    }

    function formatDate(value) {

        return App.toDateInput(value);

    }

    function formatDateTimeLocal(value) {

        return App.toDateTimeInput(value);

    }
    function buildPayload() {

        return {
            ProductID: dom.ProductID.value.trim(),
            FormulaID: dom.FormulaID.value.trim(),
            BatchNo: dom.BatchNo.value.trim(),
            ProductionNo: dom.ProductionNo.value.trim(),
            Factory: dom.Factory.value.trim(),
            ProductionLine: dom.ProductionLine.value.trim(),
            PlannedQty: App.numOrNull(dom.PlannedQty.value),
            ProducedQty: App.numOrNull(dom.ProducedQty.value),
            NGQty: App.numOrNull(dom.NGQty.value),
            Unit: dom.Unit.value.trim(),
            OperatorName: dom.OperatorName.value.trim(),
            SupervisorName: dom.SupervisorName.value.trim(),
            StartTime: App.showDateTime(dom.StartTime.value),
            EndTime: App.showDateTime(dom.EndTime.value),
            MfgDate: dom.MfgDate.value,
            ExpDate: dom.ExpDate.value,
            Status: dom.Status.value,
            Description: dom.Description.value,
            Remark: dom.Remark.value
        };

    }

    async function submitProduction() {

        const data = buildPayload();

        if (!data.ProductionNo && !data.BatchNo) {
            alert("請輸入生產單號或批號");
            return;
        }

        try {

            if (mode === "create") {
                await API.insert("ProductionLog", data);
                alert("🎉 生產紀錄建立成功");
            } else {
                await API.update("ProductionLog", dom.ProductionID.value, data);
                alert("✅ 生產紀錄修改成功");
            }

            openCreate(false);

            await searchProduction();

        } catch (err) {

            App.error(err, "儲存失敗");
        }

    }

    async function removeProduction() {

        if (!dom.ProductionID.value)
            return;

        if (!confirm("確認刪除此生產紀錄？"))
            return;

        try {

            await API.remove("ProductionLog", dom.ProductionID.value);

            alert("🗑️ 刪除完成");

            openCreate(false);

            await searchProduction();

        } catch (err) {

            App.error(err, "刪除失敗");
        }

    }

    function openCreate(scroll = true) {

        currentDetail = null;

        dom.form.reset();

        dom.ProductionID.value = "";

        showForm();

        setModeUI("create");

        if (scroll)
            scrollToForm();

    }

    // 清除：回到新增模式
    function clearForm() {

        openCreate(false);

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