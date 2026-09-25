window.Pages = window.Pages || {};
Pages.Order = (() => {
    "use strict";

    const dom = {};
    let orderCache = [];
    let currentOrder = null;
    let customers = [];     // Companies：客戶與合作廠商
    let members = [];       // Users：舊訂單使用的會員
    let productOptions = [];
    let mode = "view";

    async function init() {
        cacheDom();
        bindEvents();
        hideForm();

        initCustomerSelect();

        // 一進頁面就顯示新增表單（資料讀到後自動補上客戶、產品選單）
        createMode();

        try {

            // 客戶、會員、產品、訂單各自讀取，先回來的先顯示
            await API.getMany(["Companies", "Users", "Products", "Orders"], {
                onTable(name, rows) {
                    if (name === "Companies") { customers = rows || []; renderCustomerOptions(); }
                    if (name === "Users") { members = rows || []; renderCustomerOptions(); }
                    if (name === "Products") renderProductOptions(rows || []);
                    if (name === "Orders") applySearch(rows || []);
                }
            });

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
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
        dom.CompanyId =
            document.getElementById("CompanyId");
        dom.CustomerSelect =
            document.getElementById("CustomerSelect");
        dom.ContactName =
            document.getElementById("ContactName");
        dom.newCustomerBox =
            document.getElementById("newCustomerBox");
        dom.saveNewCustomer =
            document.getElementById("saveNewCustomer");
        dom.syncCustomerBox =
            document.getElementById("syncCustomerBox");
        dom.syncCustomer =
            document.getElementById("syncCustomer");
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
        dom.CustomerSelect?.addEventListener("change", () => applyCustomer(dom.CustomerSelect.value));

        // 手動改了名稱 / 聯絡資料：新客戶提示、既有客戶可同步更新
        ["MemberName", "MemberPhone", "MemberEmail", "ShippingAddress", "ContactName"].forEach(k =>
            dom[k]?.addEventListener("input", refreshCustomerHint));

        dom.SalesChannel?.addEventListener("change", () => {
            if (dom.SalesChannel.value === "B2B") setNewCustomerType("公司");
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
            matchCustomerFilter(r, q.member) &&
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
                    CompanyId: r.CompanyId,
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

    // =========================
    // 客戶選擇
    //   c:ID = 客戶（Companies）、u:ID = 會員（Users，舊訂單）、new:名稱 = 新客戶
    // =========================
    function initCustomerSelect() {

        const render = {
            option: (d, esc) => `<div>${esc(d.text)}${d.sub ? `<div class="small text-muted">${esc(d.sub)}</div>` : ""}</div>`,
            item: (d, esc) => `<div>${esc(d.text)}</div>`,
            option_create: (d, esc) => `<div class="create">🆕 新客戶：<strong>${esc(d.input)}</strong></div>`,
            no_results: () => `<div class="no-results">找不到，直接輸入名稱可建立新客戶</div>`
        };

        new TomSelect("#CustomerSelect", {
            valueField: "value",
            labelField: "text",
            searchField: ["text", "sub"],
            sortField: [{ field: "$score" }, { field: "text" }],
            create: input => ({ value: "new:" + input.trim(), text: input.trim() + "（新客戶）", sub: "" }),
            createOnBlur: true,
            maxOptions: 200,
            placeholder: "搜尋或輸入客戶名稱",
            render
        });

        new TomSelect("#qMemberID", {
            valueField: "value",
            labelField: "text",
            searchField: ["text", "sub"],
            sortField: [{ field: "$score" }, { field: "text" }],
            placeholder: "全部客戶",
            render
        });
    }

    function customerOption(c) {
        const type = c.CustomerType === "個人" ? "👤" : "🏢";
        const phone = c.ContactPhone || c.CompanyPhone || "";
        return {
            value: "c:" + c.ID,
            text: `${type} ${c.CompanyName || "（未命名）"}`,
            sub: [c.ContactName, phone, c.CompanyID ? "統編 " + c.CompanyID : ""].filter(Boolean).join(" · ")
        };
    }

    function renderCustomerOptions() {

        const options = customers
            .filter(c => c.CompanyName)
            .map(customerOption)
            .concat(members.map(u => ({
                value: "u:" + u.ID,
                text: `👥 ${u.Name || u.ID}（會員）`,
                sub: [u.PhoneNumber, u.Email].filter(Boolean).join(" · ")
            })));

        [dom.CustomerSelect.tomselect, dom.qMemberID.tomselect].forEach(ts => {
            const keep = ts.getValue();
            ts.clearOptions();
            ts.addOptions(options);
            if (keep && ts.options[keep]) ts.setValue(keep, true);
        });
    }

    function findCustomer(id) {
        return id === "" || id === null || id === undefined
            ? null
            : customers.find(c => String(c.ID) === String(id));
    }

    // 選了客戶 → 自動帶入聯絡資料
    function applyCustomer(value) {

        dom.CompanyId.value = "";
        dom.MemberID.value = "";

        if (value.startsWith("c:")) {

            const c = findCustomer(value.slice(2));

            if (c) {
                dom.CompanyId.value = c.ID;
                dom.MemberName.value = c.CompanyName || "";
                dom.ContactName.value = c.ContactName || "";
                dom.MemberPhone.value = c.ContactPhone || c.CompanyPhone || "";
                dom.MemberEmail.value = c.ContactEmail || "";
                dom.ShippingAddress.value = c.CompanyAddress || "";
                dom.syncCustomer.checked = false;
            }

        } else if (value.startsWith("u:")) {

            const u = members.find(x => String(x.ID) === value.slice(2));

            if (u) {
                dom.MemberID.value = u.ID;
                dom.MemberName.value = u.Name || "";
                dom.MemberPhone.value = u.PhoneNumber || "";
                dom.MemberEmail.value = u.Email || "";
            }

        } else if (value.startsWith("new:")) {

            const name = value.slice(4);
            const same = customers.find(c => c.CompanyName === name);

            // 輸入的名稱剛好是既有客戶 → 直接選它
            if (same) {
                dom.CustomerSelect.tomselect.removeOption(value);
                dom.CustomerSelect.tomselect.setValue("c:" + same.ID);
                return;
            }

            dom.MemberName.value = name;
            dom.saveNewCustomer.checked = true;
            if (dom.SalesChannel.value === "B2B") setNewCustomerType("公司");
        }

        refreshCustomerHint();
    }

    function setNewCustomerType(type) {
        const radio = document.querySelector(`input[name="newCustomerType"][value="${type}"]`);
        if (radio) radio.checked = true;
    }

    // 既有客戶：這次輸入的聯絡資料與客戶檔不同的欄位
    function customerChanges() {

        const c = findCustomer(dom.CompanyId.value);
        if (!c) return null;

        const patch = {};
        const cmp = (field, value) => {
            if (value && value !== (c[field] || "")) patch[field] = value;
        };

        cmp("ContactName", dom.ContactName.value.trim());
        // 客戶只有公司電話時，比對公司電話
        cmp(!c.ContactPhone && c.CompanyPhone ? "CompanyPhone" : "ContactPhone", dom.MemberPhone.value.trim());
        cmp("ContactEmail", dom.MemberEmail.value.trim());
        cmp("CompanyAddress", dom.ShippingAddress.value.trim());

        return Object.keys(patch).length ? { id: c.ID, patch } : null;
    }

    function isNewCustomer() {
        return !dom.CompanyId.value && !dom.MemberID.value && !!dom.MemberName.value.trim();
    }

    function refreshCustomerHint() {
        dom.newCustomerBox.classList.toggle("d-none", !isNewCustomer());
        dom.syncCustomerBox.classList.toggle("d-none", !customerChanges());
    }

    // 建立 / 修改訂單時要一起執行的客戶操作（放在 batch 最前面）
    // 回傳 { ops, ref }，ref 為訂單 CompanyId 的值（新客戶為 "$0.ID"）
    function customerOps() {

        if (isNewCustomer()) {

            const name = dom.MemberName.value.trim();
            const same = customers.find(c => c.CompanyName === name);

            if (same) return { ops: [], ref: same.ID };
            if (!dom.saveNewCustomer.checked) return { ops: [], ref: "" };

            const type = document.querySelector('input[name="newCustomerType"]:checked')?.value || "公司";

            return {
                ops: [{
                    action: "insert",
                    table: "Companies",
                    data: {
                        CompanyName: name,
                        CustomerType: type,
                        ContactName: dom.ContactName.value.trim() || (type === "個人" ? name : ""),
                        ContactPhone: dom.MemberPhone.value.trim(),
                        ContactEmail: dom.MemberEmail.value.trim(),
                        CompanyAddress: dom.ShippingAddress.value.trim(),
                        IsConverted: true,
                        Source: "訂單建立"
                    }
                }],
                ref: "$0.ID"
            };
        }

        const change = dom.syncCustomer.checked ? customerChanges() : null;

        return {
            ops: change ? [{ action: "update", table: "Companies", id: change.id, data: change.patch }] : [],
            ref: dom.CompanyId.value
        };
    }

    async function reloadCustomers() {
        try {
            customers = await API.list("Companies");
            renderCustomerOptions();
        } catch (err) {
            console.warn("重新載入客戶失敗", err);
        }
    }

    function matchCustomerFilter(r, value) {
        if (!value) return true;
        if (value.startsWith("c:")) return String(r.CompanyId ?? "") === value.slice(2);
        if (value.startsWith("u:")) return String(r.MemberID ?? "") === value.slice(2);
        return true;
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

        // 已經加入的商品列補上產品選項
        document.querySelectorAll("#orderDetailList .productSelect").forEach(sel => {
            const ts = sel.tomselect;
            if (!ts) return;
            productOptions.forEach(p => { if (!ts.options[p.id]) ts.addOption({ value: p.id, text: p.name }); });
            ts.refreshOptions(false);
        });
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
${x.CompanyId ? "🏢" : "👤"} ${App.esc(x.MemberName || "未知")}
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

        const ts = dom.CustomerSelect.tomselect;
        const value = d.CompanyId ? "c:" + d.CompanyId : (d.MemberID ? "u:" + d.MemberID : "");

        if (value && ts.options[value]) {
            ts.setValue(value, true);
        } else if (d.MemberName) {
            // 找不到對應客戶（舊資料）：顯示名稱，可再選擇或存為新客戶
            ts.addOption({ value: "new:" + d.MemberName, text: d.MemberName + "（未建檔）", sub: "" });
            ts.setValue("new:" + d.MemberName, true);
            if (d.MemberID) dom.MemberID.value = d.MemberID;
        }

        refreshCustomerHint();

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
            const cust = customerOps();
            await API.batch([
                ...cust.ops,
                ...rows.map(tr => ({
                    action: "insert",
                    table: "Orders",
                    data: { ...buildPayload(tr), CompanyId: cust.ref }
                }))
            ]);
            alert(`🎉 訂單建立成功\n🧾 ${dom.OrderNo.value}` + (cust.ref === "$0.ID" ? "\n🆕 已建立客戶資料" : ""));
            if (cust.ops.length) await reloadCustomers();
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
            const cust = customerOps();
            await API.batch([
                ...cust.ops,
                {
                    action: "removeWhere",
                    table: "Orders",
                    where: { OrderNo: currentOrder.OrderNo },
                    replace: true
                },
                ...rows.map(tr => ({
                    action: "insert",
                    table: "Orders",
                    data: { ...buildPayload(tr), ...keep, CompanyId: cust.ref }
                }))
            ]);
            alert("✅ 訂單修改成功");
            if (cust.ops.length) await reloadCustomers();
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
            ContactName: dom.ContactName.value.trim(),
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
        dom.CustomerSelect.tomselect?.clear(true);
        dom.CompanyId.value = "";
        dom.MemberID.value = "";
        dom.syncCustomer.checked = false;
        dom.saveNewCustomer.checked = true;
        refreshCustomerHint();
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