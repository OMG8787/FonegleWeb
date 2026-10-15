window.Pages = window.Pages || {};

Pages.Shipment = (() => {
    "use strict";
    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let mode = "create";
    let orders = [];        // 訂單（一列一個品項）：選訂單編號帶入收件資料，存檔後同步訂單的出貨狀態

    // 出貨單狀態 → 訂單的出貨狀態（只往前推，不會倒退）
    const ORDER_SHIP = { "出貨中": "配送中", "已送達": "已完成" };
    const SHIP_RANK = { "": 0, "未配送": 0, "配送中": 1, "已完成": 2 };

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
        loadOrders();
    }

    async function loadOrders() {
        try {
            orders = await API.list("Orders");
            const first = new Map();
            orders.forEach(o => { if (o.OrderNo && !first.has(o.OrderNo)) first.set(o.OrderNo, o); });
            dom.orderNoList.innerHTML = [...first.values()]
                .sort((a, b) => String(b.OrderDate).localeCompare(String(a.OrderDate))).slice(0, 300)
                .map(o => `<option value="${App.esc(o.OrderNo)}">${App.esc([o.MemberName, App.toDateInput(o.OrderDate), o.OrderStatus].filter(Boolean).join("・"))}</option>`).join("");
            if (dom.OrderID.value) showOrderHint();
        } catch (err) {
            console.warn("讀取訂單失敗（照常手動輸入訂單編號）", err);
        }
    }

    function orderRows(no) {
        const v = String(no || "").trim();
        return v ? orders.filter(o => String(o.OrderNo) === v) : [];
    }

    function showOrderHint() {
        const rows = orderRows(dom.OrderID.value);
        const v = dom.OrderID.value.trim();
        dom.orderHint.textContent = rows.length
            ? `🧾 ${rows[0].MemberName || ""}　${rows.map(r => (r.ProductName || "") + (r.Qty ? "×" + r.Qty : "")).join("、")}　訂單出貨狀態：${rows[0].ShippingStatus || "未配送"}`
            : v && orders.length ? "找不到這張訂單：存檔後不會同步訂單的出貨狀態" : "";
        return rows;
    }

    // 選了訂單 → 帶入收件人、電話、地址；只有一個品項時也帶入產品編號、數量、單位（只帶還沒填的欄位）
    function onOrderPicked() {
        const rows = showOrderHint();
        if (!rows.length) return;
        const o = rows[0];
        const fill = (el, v) => { if (el && !el.value && v !== undefined && v !== null && v !== "") el.value = v; };
        fill(dom.ReceiverName, o.ContactName || o.MemberName);
        fill(dom.ReceiverPhone, o.MemberPhone);
        fill(dom.ReceiverAddress, o.ShippingAddress);
        if (rows.length === 1) { fill(dom.ProductID, o.ProductID); fill(dom.ShippingQty, o.Qty); fill(dom.Unit, o.Unit); }
    }

    // 出貨單存檔後同步訂單的出貨狀態（出貨中 → 配送中、已送達 → 已完成；只往前推），訂單的「尚未出貨」提醒會跟著關閉
    async function syncOrder(payload) {
        const target = ORDER_SHIP[payload.ShippingStatus];
        const todo = orderRows(payload.OrderID).filter(r => (SHIP_RANK[r.ShippingStatus || ""] ?? 0) < (SHIP_RANK[target] ?? 0));
        if (!target || !todo.length) return "";
        try {
            await API.batch(todo.map(r => ({ action: "update", table: "Orders", id: r.OrderID, data: { ShippingStatus: target } })), { loadingText: "同步訂單中…" });
            todo.forEach(r => { r.ShippingStatus = target; });
            return `\n📦 已把訂單 ${payload.OrderID} 的出貨狀態改成「${target}」`;
        } catch (err) {
            return `\n⚠️ 訂單出貨狀態沒有同步（${err?.message || err}），請到訂單管理手動修改`;
        }
    }

    function cacheDom() {
        [
            "qShipmentNo", "qOrderNo", "qReceiverName", "qLogisticsCompany",
            "qTrackingNumber", "qShippingDate", "qShippingStatus", "btnSearch",
            "shippingList", "emptyHint", "searchTitle", "searchCount",
            "formCard", "editHint", "btnCreate", "btnUpdate", "btnDelete", "btnClear", "orderNoList", "orderHint"
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
        dom.OrderID?.addEventListener("change", onOrderPicked);
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

${x.ShippingStatus ? `<div class="mt-2"><span class="badge bg-primary">${esc(x.ShippingStatus)}</span></div>` : ""}
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
        showOrderHint();
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
            const payload = buildPayload();
            const created = await API.insert("Shipment", payload);
            alert(`🎉 出貨資料建立成功\n🚚 ${created.ShipmentNo}` + await syncOrder(payload));
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
            const payload = buildPayload();
            await API.update("Shipment", currentDetail.ShipmentID, payload);
            alert("✅ 出貨資料修改成功" + await syncOrder(payload));
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
        if (dom.orderHint) dom.orderHint.textContent = "";
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
