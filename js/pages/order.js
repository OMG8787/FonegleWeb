window.Pages = window.Pages || {};
Pages.Order = (() => {
    "use strict";

    const dom = {};
    let orderCache = [];
    let currentOrder = null;
    let memberOptions = [];
    let productOptions = [];
    let mode = "view";

    async function init() {
        cacheDom();
        bindEvents();
        hideForm();

        initMemberSelect();

        try {

            // 會員、產品、訂單一次載入
            const data = await API.getMany(["Users", "Products", "Orders"]);

            renderMemberOptions(data.Users);
            renderProductOptions(data.Products);
            applySearch(data.Orders);

        } catch (err) {

            App.error(err, "載入資料失敗");
        }

        createMode();
    }

    function cacheDom() {
        dom.qExpectedShippingDate =
            document.getElementById("qExpectedShippingDate");
        dom.qOrderDate =
            document.getElementById("qOrderDate");
        dom.qOrderNo =
            document.getElementById("qOrderNo");
        dom.qShippingStatus =
            document.getElementById("qShippingStatus");
        dom.btnSearch =
            document.getElementById("btnSearch");
        dom.orderList =
            document.getElementById("orderList");
        dom.searchTitle =
            document.getElementById("searchTitle");
        dom.searchCount =
            document.getElementById("searchCount");
        dom.emptyHint =
            document.getElementById("emptyHint");
        dom.formCard =
            document.getElementById("formCard");
        dom.editHint =
            document.getElementById("editHint");
        dom.form =
            document.getElementById("orderForm");
        dom.OrderID =
            document.getElementById("OrderID");
        dom.OrderNo =
            document.getElementById("OrderNo");
        dom.OrderDate =
            document.getElementById("OrderDate");
        dom.CreatedAt =
            document.getElementById("CreatedAt");
        dom.UpdatedAt =
            document.getElementById("UpdatedAt");
        dom.SalesChannel =
            document.getElementById("SalesChannel");
        dom.MemberID =
            document.getElementById("MemberID");
        dom.qMemberID =
            document.getElementById("qMemberID");
        dom.MemberName =
            document.getElementById("MemberName");
        dom.MemberPhone =
            document.getElementById("MemberPhone");
        dom.MemberEmail =
            document.getElementById("MemberEmail");
        dom.ShippingAddress =
            document.getElementById("ShippingAddress");
        dom.orderDetailList =
            document.getElementById("orderDetailList");
        dom.btnAddDetail =
            document.getElementById("btnAddDetail");
        dom.DiscountAmount =
            document.getElementById("DiscountAmount");
        dom.ShippingFee =
            document.getElementById("ShippingFee");
        dom.TotalAmount =
            document.getElementById("TotalAmount");
        dom.PaymentMethod =
            document.getElementById("PaymentMethod");
        dom.PaymentStatus =
            document.getElementById("PaymentStatus");
        dom.OrderStatus =
            document.getElementById("OrderStatus");
        dom.ShippingStatus =
            document.getElementById("ShippingStatus");
        dom.ExpectedShippingDate =
            document.getElementById("ExpectedShippingDate");
        dom.Note =
            document.getElementById("Note");
        dom.btnNew =
            document.getElementById("btnNew");
        dom.btnCreate =
            document.getElementById("btnCreate");
        dom.btnUpdate =
            document.getElementById("btnUpdate");
        dom.btnDelete =
            document.getElementById("btnDelete");
        dom.btnClear =
            document.getElementById("btnClear");
    }

    function bindEvents() {
        dom.btnSearch?.addEventListener(
            "click",
            searchOrder
        );
        dom.btnAddDetail?.addEventListener(
            "click",
            addDetailRow
        );
        dom.btnNew?.addEventListener(
            "click",
            createMode
        );
        dom.btnCreate?.addEventListener(
            "click",
            createOrder
        );
        dom.btnUpdate?.addEventListener(
            "click",
            updateOrder
        );
        dom.btnDelete?.addEventListener(
            "click",
            deleteOrder
        );
        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );
        dom.orderList?.addEventListener(
            "click",
            e => {
                const card =
                    e.target.closest(".order-card");
                if (!card)
                    return;
                const item =
                    orderCache[
                    card.dataset.index
                    ];
                loadDetail(item);
            }
        );
        dom.MemberID?.addEventListener("change", () => {
            const value = dom.MemberID.value;
            const member = memberOptions.find(x => x.id == value);
            if (!member)
                return;
            dom.MemberName.value = member.name;
            if (!dom.MemberPhone.value)
                dom.MemberPhone.value = member.phone;
            if (!dom.MemberEmail.value)
                dom.MemberEmail.value = member.email;
        });
        dom.DiscountAmount?.addEventListener(
            "input",
            calculateTotal
        );

        dom.ShippingFee?.addEventListener(
            "input",
            calculateTotal
        );
    }

    async function searchOrder() {

        try {

            applySearch(await API.list("Orders"));

        } catch (err) {

            App.error(err, "查詢訂單失敗");
        }
    }

    function applySearch(rows) {

        const q = {
            member: dom.qMemberID.value,
            shipDate: dom.qExpectedShippingDate.value,
            orderDate: dom.qOrderDate.value,
            orderNo: dom.qOrderNo.value.trim(),
            shipStatus: dom.qShippingStatus.value
        };

        const matched = rows.filter(r =>
            (!q.member || String(r.MemberID) === q.member) &&
            (!q.shipDate || App.toDateInput(r.ExpectedShippingDate) === q.shipDate) &&
            (!q.orderDate || App.toDateInput(r.OrderDate) === q.orderDate) &&
            App.like(r.OrderNo, q.orderNo) &&
            (!q.shipStatus || r.ShippingStatus === q.shipStatus));

        // 同一訂單編號的多列商品合併成一張訂單
        const map = new Map();

        matched.forEach(r => {

            if (!map.has(r.OrderNo)) {
                map.set(r.OrderNo, {
                    OrderID: r.OrderID,
                    OrderNo: r.OrderNo,
                    MemberName: r.MemberName,
                    TotalAmount: r.TotalAmount,
                    OrderStatus: r.OrderStatus,
                    OrderDate: r.OrderDate,
                    Qty: 0,
                    Products: [],
                    Rows: []
                });
            }

            const o = map.get(r.OrderNo);

            o.Qty += App.num(r.Qty);
            o.Rows.push(r);

            if (r.ProductName && !o.Products.includes(r.ProductName))
                o.Products.push(r.ProductName);
        });

        const list = [...map.values()]
            .sort((a, b) => String(b.OrderDate).localeCompare(String(a.OrderDate)));

        orderCache = list;

        renderList({
            title: "🛒 訂單列表",
            count: list.length,
            list
        });
    }

    function initMemberSelect() {
        new TomSelect("#MemberID", {
            create: false,
            searchField: ["text"],
            valueField: "value",
            labelField: "text",
            sortField: "text"
        });
        new TomSelect("#qMemberID", {
            create: false,
            searchField: ["text"],
            valueField: "value",
            labelField: "text",
            sortField: "text"
        });
    }

    function renderMemberOptions(users) {
        memberOptions = [];
        if (dom.MemberID.tomselect)
            dom.MemberID.tomselect.clearOptions();
        else
            dom.MemberID.innerHTML = "";
        if (dom.qMemberID.tomselect)
            dom.qMemberID.tomselect.clearOptions();
        else
            dom.qMemberID.innerHTML = "";
        dom.MemberID.add(new Option("請選擇會員", ""));
        dom.qMemberID.add(new Option("全部會員", ""));
        users.forEach(u => {
            const id = String(u.ID ?? "");
            if (!id)
                return;
            memberOptions.push({
                id,
                name: u.Name || "",
                phone: u.PhoneNumber || "",
                email: u.Email || ""
            });
            const option = new Option(u.Name || id, id);
            dom.MemberID.add(option);
            dom.qMemberID.add(option.cloneNode(true));
        });
        // 全部加入完成後再同步一次
        if (dom.MemberID.tomselect)
            dom.MemberID.tomselect.sync();
        if (dom.qMemberID.tomselect)
            dom.qMemberID.tomselect.sync();
    }

    function renderProductOptions(products) {
        productOptions = products
            .filter(p => p.IsActive !== false)
            .map(p => ({
                id: String(p.ID),
                name: p.ProductName || String(p.ID),
                unit: p.Unit || "",
                price: p.SalePrice ?? ""
            }));
    }

    function renderList(result) {
        dom.searchTitle.textContent =
            result.title;
        dom.searchCount.textContent =
            `共 ${result.count} 筆`;
        dom.orderList.innerHTML = "";
        if (!result.list.length) {
            dom.emptyHint.classList.remove("d-none");
            return;
        }
        dom.emptyHint.classList.add("d-none");
        result.list.forEach((x, index) => {
            const div = document.createElement("div");

            div.className = "order-card";
            div.dataset.index = index;
            const productText =
                x.Products.length <= 1
                    ? (x.Products[0] || "")
                    : `${x.Products[0]} 等${x.Products.length}項`;
            div.innerHTML = `
<div class="member-name">
🧾 ${App.esc(x.OrderNo)}
</div>

<div class="member-info">
👤 ${App.esc(x.MemberName || "未知")}
</div>

<div class="member-info">
📦 ${App.esc(productText || "-")}
</div>

<div class="member-info">
🔢 ${x.Qty}
</div>

<div class="member-info">
💰 ${x.TotalAmount ?? 0}
</div>

<div class="member-info">
🚚 ${App.esc(x.OrderStatus || "")}
</div>
`;
            dom.orderList.appendChild(div);
        });
    }

    function loadDetail(item) {
        const first = item.Rows[0] || {};
        const data = {
            ...first,
            Products: item.Rows.map(r => ({
                ProductID: String(r.ProductID ?? ""),
                ProductName: r.ProductName || "",
                Qty: r.Qty ?? "",
                Unit: r.Unit || "",
                Price: r.UnitPrice ?? ""
            }))
        };
        currentOrder = data;
        fillForm(data);
        showForm();
        mode = "edit";

        dom.editHint.classList.remove("d-none");
        dom.btnCreate.classList.add("d-none");
        dom.btnUpdate.classList.remove("d-none");
        dom.btnDelete.classList.remove("d-none");

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }


    function fillForm(d) {
        clearForm();
        Object.keys(d).forEach(k => {
            if (k === "Products")
                return;
            const el = dom[k];
            if (!el)
                return;
            if (k === "OrderDate") {
                el.value = App.toDateTimeInput(d[k]);
                return;
            }
            if (k === "ExpectedShippingDate") {
                el.value = App.toDateInput(d[k]);
                return;
            }
            if (el.tomselect)
                el.tomselect.setValue(d[k] ?? "", true);
            else
                el.value = d[k] ?? "";
        });

        d.Products.forEach(p => {
            addDetailRow();
            const tr =
                dom.orderDetailList.lastElementChild;
            tr.querySelector(".productID").value =
                p.ProductID;
            const ts =
                tr.querySelector(".productSelect").tomselect;
            // 已刪除的產品也要能顯示
            if (!ts.options[p.ProductID])
                ts.addOption({ value: p.ProductID, text: p.ProductName || p.ProductID });
            ts.setValue(p.ProductID, true);
            tr.querySelector(".qty").value =
                p.Qty;
            tr.querySelector(".unit").value =
                p.Unit;
            tr.querySelector(".price").value =
                p.Price;
        });
        calculateTotal();
    }

    function addDetailRow() {
        const tr =
            document.createElement("tr");
        let html =
            `<option value="">請選擇產品</option>`;
        productOptions.forEach(p => {
            html +=
                `<option value="${App.esc(p.id)}">${App.esc(p.name)}</option>`;
        });
        tr.innerHTML = `
<td>
<select class="productSelect form-select">
${html}
</select>
</td>
<td>
<input class="form-control productID" readonly>
</td>
<td>
<input class="form-control qty" type="number" value="1">
</td>
<td>
<input class="form-control unit">
</td>
<td>
<input class="form-control price" type="number">
</td>
<td class="subtotal">
0
</td>
<td>
<button
type="button"
class="btn btn-danger btn-sm">
刪除
</button>
</td>
`;
        tr.querySelector(".productSelect")
            .addEventListener("change", function () {
                tr.querySelector(".productID").value =
                    this.value;
                // 自動帶入單位與售價
                const product = productOptions.find(x => x.id === this.value);
                if (product) {
                    if (!tr.querySelector(".unit").value)
                        tr.querySelector(".unit").value = product.unit;
                    if (!tr.querySelector(".price").value)
                        tr.querySelector(".price").value = product.price;
                    calculateTotal();
                }
            });
        tr.querySelector("button")
            .onclick = () => {
                tr.remove();
                calculateTotal();
            };
        dom.orderDetailList.appendChild(tr);

        new TomSelect(
            tr.querySelector(".productSelect"),
            {
                create: false,
                searchField: ["text"],
                valueField: "value",
                labelField: "text",
                sortField: "text"
            }
        );
        tr.querySelector(".qty")
            .addEventListener("input", calculateTotal);

        tr.querySelector(".price")
            .addEventListener("input", calculateTotal);

        calculateTotal();
    }

    function getRows() {
        return [...document.querySelectorAll("#orderDetailList tr")];
    }

    function validateRows(rows) {
        if (!rows.length) {
            alert("請至少加入一項商品");
            return false;
        }
        if (rows.some(tr => !tr.querySelector(".productID").value)) {
            alert("請選擇每一列的產品");
            return false;
        }
        return true;
    }

    async function createOrder() {
        const rows = getRows();
        if (!validateRows(rows))
            return;
        if (!dom.OrderNo.value)
            dom.OrderNo.value = generateOrderNo();
        try {
            await API.batch(rows.map(tr => ({
                action: "insert",
                table: "Orders",
                data: buildPayload(tr)
            })));
            alert(`🎉 訂單建立成功\n🧾 ${dom.OrderNo.value}`);
            await searchOrder();
            createMode();
        }
        catch (err) {
            App.error(err, "建立失敗");
        }
    }

    async function updateOrder() {
        if (!currentOrder) {
            alert("沒有選取訂單");
            return;
        }
        const rows = getRows();
        if (!validateRows(rows))
            return;
        if (!confirm(
            "修改訂單將重新建立商品資料，是否繼續？"
        )) {
            return;
        }
        try {
            // 保留建立資訊，整張訂單重新寫入
            const keep = {
                OrderNo: currentOrder.OrderNo,
                CreatedAt: currentOrder.CreatedAt,
                CreatedBy: currentOrder.CreatedBy
            };
            await API.batch([
                {
                    action: "removeWhere",
                    table: "Orders",
                    where: { OrderNo: currentOrder.OrderNo },
                    replace: true
                },
                ...rows.map(tr => ({
                    action: "insert",
                    table: "Orders",
                    data: { ...buildPayload(tr), ...keep }
                }))
            ]);
            alert("✅ 訂單修改成功");
            await searchOrder();
        }
        catch (error) {
            App.error(error, "修改失敗");
        }
    }

    async function deleteOrder() {
        if (!currentOrder)
            return;
        if (!confirm("確定刪除此訂單？"))
            return;
        try {
            const count = await API.removeWhere("Orders", { OrderNo: currentOrder.OrderNo });
            alert(`🗑️ 已刪除訂單（${count} 項商品）`);
            clearForm();
            currentOrder = null;
            await searchOrder();
            createMode();
        }
        catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function createMode() {
        mode = "create";
        currentOrder = null;
        clearForm();
        if (!dom.OrderNo.value) {
            dom.OrderNo.value = generateOrderNo();
        }
        dom.OrderNo.readOnly = true;
        dom.OrderDate.value = formatDateTime(new Date());
        showForm();
        dom.editHint.classList.add("d-none");
        dom.btnCreate.classList.remove("d-none");
        dom.btnUpdate.classList.add("d-none");
        dom.btnDelete.classList.add("d-none");
    }

    function calculateTotal() {
        let total = 0;
        document.querySelectorAll("#orderDetailList tr")
            .forEach(tr => {
                const qty =
                    parseFloat(
                        tr.querySelector(".qty").value || 0
                    );
                const price =
                    parseFloat(
                        tr.querySelector(".price").value || 0
                    );
                const subtotal =
                    qty * price;
                tr.querySelector(".subtotal").innerText =
                    subtotal.toLocaleString();
                total += subtotal;
            });
        const discount = parseFloat(dom.DiscountAmount.value || 0);
        const shipping = parseFloat(dom.ShippingFee.value || 0);
        total = total - discount + shipping;
        dom.TotalAmount.value = total;
    }

    function buildPayload(tr) {

        const select = tr.querySelector(".productSelect");

        return {
            // ===== 訂單資料 =====
            OrderNo: dom.OrderNo.value,
            MemberID: dom.MemberID.value,
            MemberName: dom.MemberName.value.trim(),
            MemberPhone: dom.MemberPhone.value.trim(),
            MemberEmail: dom.MemberEmail.value.trim(),
            ShippingAddress: dom.ShippingAddress.value.trim(),

            // ===== 只有目前這一筆商品 =====
            ProductID: tr.querySelector(".productID").value,
            ProductName: select.selectedOptions[0]?.text || "",
            Qty: App.numOrNull(tr.querySelector(".qty").value),
            Unit: tr.querySelector(".unit").value.trim(),
            UnitPrice: App.numOrNull(tr.querySelector(".price").value),

            // ===== 其它資料 =====
            DiscountAmount: App.numOrNull(dom.DiscountAmount.value),
            ShippingFee: App.numOrNull(dom.ShippingFee.value),
            TotalAmount: App.numOrNull(dom.TotalAmount.value),
            PaymentMethod: dom.PaymentMethod.value,
            PaymentStatus: dom.PaymentStatus.value,
            OrderStatus: dom.OrderStatus.value,
            ShippingStatus: dom.ShippingStatus.value,
            SalesChannel: dom.SalesChannel.value,
            ExpectedShippingDate: dom.ExpectedShippingDate.value,
            Note: dom.Note.value,
            OrderDate: App.showDateTime(dom.OrderDate.value || formatDateTime(new Date()))
        };
    }

    function generateOrderNo() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let random = "";
        for (let i = 0; i < 8; i++) {
            random += chars.charAt(
                Math.floor(Math.random() * chars.length)
            );
        }
        // Unix Timestamp (毫秒)
        const timestamp = Date.now();
        return `${random}${timestamp}`;
    }

    function clearForm() {
        dom.form.reset();
        dom.orderDetailList.innerHTML = "";
        if (dom.MemberID.tomselect)
            dom.MemberID.tomselect.clear();
        dom.qMemberID.tomselect?.clear();
        calculateTotal();
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
    return {
        init
    };
})();