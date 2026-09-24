window.Pages = window.Pages || {};

Pages.Shipment = (() => {
    "use strict";
    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let mode = "create";

    const FIELDS = [
        "ShipmentID", "ShipmentNo", "OrderID", "ProductID", "BatchNo",
        "LogisticsCompany", "TrackingNumber", "ReceiverName", "ReceiverPhone",
        "ReceiverAddress", "ShippingQty", "Unit", "ShippingDate", "ReceivedDate",
        "ShippingStatus", "Note"
    ];

    function init() {
        cacheDom();
        bindEvents();
        // 頁面沒有「新增」按鈕，預設顯示新增表單
        openCreate();
        searchShipping();
    }

    function cacheDom() {
        [
            "qShipmentNo", "qOrderNo", "qReceiverName", "qLogisticsCompany",
            "qTrackingNumber", "qShippingDate", "qShippingStatus", "btnSearch",
            "shippingList", "emptyHint", "searchTitle", "searchCount",
            "formCard", "editHint", "btnCreate", "btnUpdate", "btnDelete", "btnClear"
        ].concat(FIELDS).forEach(id => {
            dom[id] = document.getElementById(id);
        });
        dom.form = document.getElementById("shippingForm");
    }

    function bindEvents() {
        dom.btnSearch?.addEventListener("click", searchShipping);
        dom.btnCreate?.addEventListener("click", submitCreate);
        dom.btnUpdate?.addEventListener("click", submitUpdate);
        dom.btnDelete?.addEventListener("click", deleteShipping);
        dom.btnClear?.addEventListener("click", openCreate);
        dom.shippingList?.addEventListener("click", e => {
            const card = e.target.closest(".shipping-card");
            if (!card)
                return;
            loadDetail(listCache[card.dataset.index]);
        });
    }

    async function searchShipping() {

        try {

            const q = {
                no: dom.qShipmentNo.value.trim(),
                order: dom.qOrderNo.value.trim(),
                receiver: dom.qReceiverName.value.trim(),
                logistics: dom.qLogisticsCompany.value.trim(),
                tracking: dom.qTrackingNumber.value.trim(),
                date: dom.qShippingDate.value,
                status: dom.qShippingStatus.value
            };

            const list = (await API.list("Shipment"))
                .filter(x =>
                    App.like(x.ShipmentNo, q.no) &&
                    App.like(x.OrderID, q.order) &&
                    App.like(x.ReceiverName, q.receiver) &&
                    App.like(x.LogisticsCompany, q.logistics) &&
                    App.like(x.TrackingNumber, q.tracking) &&
                    (!q.date || App.toDateInput(x.ShippingDate) === q.date) &&
                    (!q.status || x.ShippingStatus === q.status))
                .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));

            listCache = list;

            renderList({
                title: "🚚 出貨資料",
                count: list.length,
                list
            });

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    function renderList(result) {
        dom.searchTitle.innerText = result.title;
        dom.searchCount.innerText = `共 ${result.count} 筆`;
        dom.shippingList.innerHTML = "";
        if (!result.list.length) {
            dom.emptyHint.classList.remove("d-none");
            return;
        }
        dom.emptyHint.classList.add("d-none");

        const esc = App.esc;

        result.list.forEach((x, i) => {
            const div = document.createElement("div");
            div.className = "shipping-card";
            div.dataset.index = i;
            div.innerHTML = `
<div class="fw-bold">
🚚 ${esc(x.ShipmentNo || "未設定")}
</div>
<div class="text-muted">
訂單：${esc(x.OrderID || "")}
</div>

<div class="text-muted">
物流：${esc(x.LogisticsCompany || "")}
</div>
<div class="text-muted">
收件人：${esc(x.ReceiverName || "")}
</div>

<div class="mt-2">
<span class="badge bg-primary">
${esc(x.ShippingStatus || "未知")}
</span>
</div>
`;
            dom.shippingList.appendChild(div);
        });
    }

    function loadDetail(item) {
        if (!item)
            return;
        currentDetail = item;
        fillForm(item);
        setMode("edit");
        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function fillForm(d) {
        FIELDS.forEach(k => {
            if (!dom[k])
                return;
            if (k === "ShippingDate" || k === "ReceivedDate")
                dom[k].value = App.toDateInput(d[k]);
            else
                dom[k].value = d[k] ?? "";
        });
    }

    function buildPayload() {
        return {
            ShipmentNo: dom.ShipmentNo.value.trim() || generateShipmentNo(),
            OrderID: dom.OrderID.value.trim(),
            ProductID: dom.ProductID.value.trim(),
            BatchNo: dom.BatchNo.value.trim(),
            LogisticsCompany: dom.LogisticsCompany.value.trim(),
            TrackingNumber: dom.TrackingNumber.value.trim(),
            ReceiverName: dom.ReceiverName.value.trim(),
            ReceiverPhone: dom.ReceiverPhone.value.trim(),
            ReceiverAddress: dom.ReceiverAddress.value.trim(),
            ShippingQty: App.numOrNull(dom.ShippingQty.value),
            Unit: dom.Unit.value.trim(),
            ShippingDate: dom.ShippingDate.value,
            ReceivedDate: dom.ReceivedDate.value,
            ShippingStatus: dom.ShippingStatus.value,
            Note: dom.Note.value
        };
    }

    function generateShipmentNo() {
        const d = new Date();
        const p = n => String(n).padStart(2, "0");
        return `SH${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    async function submitCreate() {
        try {
            const created = await API.insert("Shipment", buildPayload());
            alert(`🎉 出貨資料建立成功\n🚚 ${created.ShipmentNo}`);
            openCreate();
            await searchShipping();
        } catch (err) {
            App.error(err, "建立失敗");
        }
    }

    async function submitUpdate() {
        if (!currentDetail)
            return;
        try {
            await API.update("Shipment", currentDetail.ShipmentID, buildPayload());
            alert("✅ 出貨資料修改成功");
            await searchShipping();
        } catch (err) {
            App.error(err, "修改失敗");
        }
    }

    async function deleteShipping() {
        if (!currentDetail)
            return;
        if (!confirm("確認刪除出貨資料？"))
            return;
        try {
            await API.remove("Shipment", currentDetail.ShipmentID);
            alert("🗑️ 刪除完成");
            openCreate();
            await searchShipping();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function openCreate() {
        currentDetail = null;
        dom.form?.reset();
        dom.ShipmentID.value = "";
        setMode("create");
    }

    function setMode(newMode) {
        mode = newMode;
        dom.formCard.classList.remove("d-none");
        dom.editHint.classList.toggle("d-none", mode !== "edit");
        dom.btnCreate.disabled = mode === "edit";
        dom.btnUpdate.disabled = mode !== "edit";
        dom.btnDelete.disabled = mode !== "edit";
    }

    return {
        init
    };
})();
