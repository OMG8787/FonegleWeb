window.Pages = window.Pages || {};

Pages.Receivable = (() => {

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

        searchReceivable();
    }

    function cacheDom() {

        dom.formCard = document.getElementById("formCard");
        dom.form = document.getElementById("receivableForm");

        dom.editHint = document.getElementById("editHint");

        dom.receivableList = document.getElementById("receivableList");
        dom.emptyHint = document.getElementById("emptyHint");

        dom.searchTitle = document.getElementById("searchTitle");
        dom.searchCount = document.getElementById("searchCount");

        dom.qPayerName = document.getElementById("qPayerName");
        dom.qOrderID = document.getElementById("qOrderID");
        dom.qTransactionNo = document.getElementById("qTransactionNo");
        dom.qInvoiceNo = document.getElementById("qInvoiceNo");
        dom.qPaymentDate = document.getElementById("qPaymentDate");
        dom.qPaymentMethod = document.getElementById("qPaymentMethod");
        dom.qPaymentStatus = document.getElementById("qPaymentStatus");
        dom.qUnpaid = document.getElementById("qUnpaid");

        dom.btnSearch = document.getElementById("btnSearch");
        dom.btnCreate = document.getElementById("btnCreate");
        dom.btnUpdate = document.getElementById("btnUpdate");
        dom.btnDelete = document.getElementById("btnDelete");
        dom.btnClear = document.getElementById("btnClear");

        dom.ReceivableID = document.getElementById("ReceivableID");

        dom.OrderID = document.getElementById("OrderID");
        dom.MemberID = document.getElementById("MemberID");
        dom.PayerName = document.getElementById("PayerName");

        dom.Amount = document.getElementById("Amount");
        dom.DiscountAmount = document.getElementById("DiscountAmount");
        dom.TaxAmount = document.getElementById("TaxAmount");
        dom.RefundAmount = document.getElementById("RefundAmount");

        dom.PaymentMethod = document.getElementById("PaymentMethod");
        dom.PaymentStatus = document.getElementById("PaymentStatus");
        dom.PaymentDate = document.getElementById("PaymentDate");

        dom.TransactionNo = document.getElementById("TransactionNo");
        dom.InvoiceNo = document.getElementById("InvoiceNo");

        dom.RefundDate = document.getElementById("RefundDate");

        dom.Note = document.getElementById("Note");
    }

    function bindEvents() {

        dom.btnSearch?.addEventListener(
            "click",
            searchReceivable
        );

        dom.btnCreate?.addEventListener(
            "click",
            submitReceivable
        );

        dom.btnUpdate?.addEventListener(
            "click",
            submitReceivable
        );

        dom.btnDelete?.addEventListener(
            "click",
            removeReceivable
        );

        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );

        dom.receivableList?.addEventListener(
            "click",
            async e => {

                const card =
                    e.target.closest(".receivable-card");

                if (!card)
                    return;

                const item =
                    listCache[
                    card.dataset.index
                    ];

                await loadDetail(item);

            });

    }

    async function searchReceivable() {

        try {

            const q = {
                payer: dom.qPayerName.value.trim(),
                order: dom.qOrderID.value.trim(),
                txn: dom.qTransactionNo.value.trim(),
                invoice: dom.qInvoiceNo.value.trim(),
                date: dom.qPaymentDate.value,
                method: dom.qPaymentMethod.value,
                status: dom.qPaymentStatus.value
            };

            const list = (await API.list("Receivable"))
                .filter(x =>
                    App.like(x.PayerName, q.payer) &&
                    App.like(x.OrderID, q.order) &&
                    App.like(x.TransactionNo, q.txn) &&
                    App.like(x.InvoiceNo, q.invoice) &&
                    (!q.date || App.toDateInput(x.PaymentDate) === q.date) &&
                    (!q.method || x.PaymentMethod === q.method) &&
                    (!q.status || x.PaymentStatus === q.status) &&
                    (!dom.qUnpaid.checked || x.PaymentStatus !== "已付款"))
                .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));

            listCache = list;

            renderList({
                title: "💰 收帳查詢",
                count: list.length,
                list
            });

        } catch (err) {

            App.error(err, "查詢失敗");
        }

    }

    function renderList(result) {

        dom.searchTitle.textContent =
            result.title;

        dom.searchCount.textContent =
            `共 ${result.count} 筆`;

        dom.receivableList.innerHTML = "";

        if (!result.list.length) {

            dom.emptyHint.classList.remove(
                "d-none"
            );

            return;

        }

        dom.emptyHint.classList.add(
            "d-none"
        );

        result.list.forEach((x, index) => {

            const div =
                document.createElement("div");

            div.className =
                "receivable-card";

            div.dataset.index =
                index;

            const badge =
                x.PaymentStatus === "已付款"
                    ? "success"
                    : x.PaymentStatus === "退款"
                        ? "danger"
                        : x.PaymentStatus === "部分付款"
                            ? "warning"
                            : "secondary";

            const esc = App.esc;

            div.innerHTML = `

<div class="fw-bold fs-5">

${esc(x.PayerName || "未設定付款人")}

</div>

<div class="text-muted">

🧾 ${esc(x.OrderID || "-")}

</div>

<div class="text-muted">

💰 ${x.Amount ?? 0}

</div>

<div class="text-muted">

💳 ${esc(x.PaymentMethod || "-")}

</div>

<div class="d-flex justify-content-between align-items-center mt-2">

<span class="badge bg-${badge}">

${esc(x.PaymentStatus || "未付款")}

</span>

<small class="text-muted">

${esc(x.PaymentDate || "")}

</small>

</div>

`;

            dom.receivableList.appendChild(
                div
            );

        });

    }


    function loadDetail(item) {

        currentDetail = item;

        fillForm(currentDetail);

        showForm();

        setModeUI("edit");

        scrollToForm();

    }


    function fillForm(d) {

        dom.ReceivableID.value =
            d.ReceivableID || "";

        dom.OrderID.value =
            d.OrderID || "";

        dom.MemberID.value =
            d.MemberID || "";

        dom.PayerName.value =
            d.PayerName || "";

        dom.Amount.value =
            d.Amount ?? 0;

        dom.DiscountAmount.value =
            d.DiscountAmount ?? 0;

        dom.TaxAmount.value =
            d.TaxAmount ?? 0;

        dom.RefundAmount.value =
            d.RefundAmount ?? 0;

        dom.PaymentMethod.value =
            d.PaymentMethod || "現金";

        dom.PaymentStatus.value =
            d.PaymentStatus || "未付款";

        dom.TransactionNo.value =
            d.TransactionNo || "";

        dom.InvoiceNo.value =
            d.InvoiceNo || "";

        dom.PaymentDate.value =
            App.toDateInput(d.PaymentDate);

        dom.RefundDate.value =
            App.toDateInput(d.RefundDate);

        dom.Note.value =
            d.Note || "";

    }


    function buildPayload() {

        return {
            OrderID: dom.OrderID.value.trim(),
            MemberID: dom.MemberID.value.trim(),
            PayerName: dom.PayerName.value.trim(),
            Amount: App.numOrNull(dom.Amount.value),
            DiscountAmount: App.numOrNull(dom.DiscountAmount.value),
            TaxAmount: App.numOrNull(dom.TaxAmount.value),
            RefundAmount: App.numOrNull(dom.RefundAmount.value),
            PaymentMethod: dom.PaymentMethod.value,
            PaymentStatus: dom.PaymentStatus.value,
            TransactionNo: dom.TransactionNo.value.trim(),
            InvoiceNo: dom.InvoiceNo.value.trim(),
            PaymentDate: dom.PaymentDate.value,
            RefundDate: dom.RefundDate.value,
            Note: dom.Note.value
        };

    }


    async function submitReceivable() {

        const data = buildPayload();

        if (!data.PayerName && !data.OrderID) {
            alert("請輸入付款人或訂單");
            return;
        }

        try {

            if (mode === "create") {
                await API.insert("Receivable", data);
                alert("🎉 收帳紀錄建立成功");
            } else {
                await API.update("Receivable", dom.ReceivableID.value, data);
                alert("✅ 收帳紀錄修改成功");
            }

            openCreate(false);

            await searchReceivable();

        } catch (err) {

            App.error(err, "儲存失敗");
        }

    }


    async function removeReceivable() {

        if (!dom.ReceivableID.value)
            return;

        if (!confirm("確認刪除此收帳紀錄？"))
            return;

        try {

            await API.remove("Receivable", dom.ReceivableID.value);

            alert("🗑️ 刪除完成");

            openCreate(false);

            await searchReceivable();

        } catch (err) {

            App.error(err, "刪除失敗");
        }

    }

    function openCreate(scroll = true) {

        currentDetail = null;

        dom.form.reset();

        dom.ReceivableID.value = "";

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

        dom.formCard.classList.remove(
            "d-none"
        );

    }


    function hideForm() {

        dom.formCard.classList.add(
            "d-none"
        );

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

            dom.editHint.classList.add(
                "d-none"
            );

            dom.btnCreate.disabled = false;
            dom.btnUpdate.disabled = true;
            dom.btnDelete.disabled = true;

        }
        else if (mode === "edit") {

            dom.editHint.classList.remove(
                "d-none"
            );

            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = false;
            dom.btnDelete.disabled = false;

        }
        else {

            dom.editHint.classList.add(
                "d-none"
            );

            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = true;
            dom.btnDelete.disabled = true;

        }

    }


    return {

        init

    };

})();