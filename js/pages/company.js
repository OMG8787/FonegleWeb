window.Pages = window.Pages || {};

Pages.Business = (() => {

    "use strict";

    const dom = {};

    let listCache = [];
    let orderStats = new Map();   // CompanyId → { count, total, last }
    let currentDetail = null;
    let mode = "view";

    function init() {

        cacheDom();
        bindEvents();

        hideForm();
        setModeUI("view");

        // 進入頁面直接列出全部客戶
        searchBusiness();
    }

    function cacheDom() {

        dom.editHint = document.getElementById("editHint");
        dom.targetCompanyArea = document.getElementById("targetCompanyArea");
        dom.qCompanyName = document.getElementById("qCompanyName");
        dom.qCompanyID = document.getElementById("qCompanyID");
        dom.qCompanyAddress = document.getElementById("qCompanyAddress");

        dom.btnSearch = document.getElementById("btnSearch");
        dom.btnCreateTop = document.getElementById("btnCreateTop");

        dom.btnCreate = document.getElementById("btnCreate");
        dom.btnUpdate = document.getElementById("btnUpdate");
        dom.btnClear = document.getElementById("btnClear");

        dom.businessList = document.getElementById("businessList");
        dom.emptyHint = document.getElementById("emptyHint");

        dom.form = document.getElementById("businessForm");
        dom.formSection = dom.form?.closest(".card");


        dom.searchTitle =
            document.getElementById("searchTitle");

        dom.searchCount =
            document.getElementById("searchCount");

        dom.TargetCompanyName = document.getElementById("TargetCompanyName");
        dom.TargetCompanyID = document.getElementById("TargetCompanyID");

        dom.CompanyNameEdit = document.getElementById("CompanyNameEdit");
        dom.CustomerType = document.getElementById("CustomerType");
        dom.CompanyIDEdit = document.getElementById("CompanyIDEdit");

        dom.CompanyPhone = document.getElementById("CompanyPhone");
        dom.CompanyURL = document.getElementById("CompanyURL");
        dom.CompanyAddress = document.getElementById("CompanyAddress");

        dom.ContactName = document.getElementById("ContactName");
        dom.ContactPhone = document.getElementById("ContactPhone");
        dom.ContactEmail = document.getElementById("ContactEmail");

        dom.PaymentStstus = document.getElementById("PaymentStstus");

        dom.IsMember = document.getElementById("IsMember");
        dom.IsConverted = document.getElementById("IsConverted");

        dom.AccountManager = document.getElementById("AccountManager");

        dom.TotalVisit = document.getElementById("TotalVisit");
        dom.TotalMail = document.getElementById("TotalMail");

        dom.Source = document.getElementById("Source");

        dom.Note = document.getElementById("Note");

    }

    function bindEvents() {

        dom.btnSearch?.addEventListener(
            "click",
            searchBusiness
        );

        dom.btnCreateTop?.addEventListener(
            "click",
            openCreate
        );

        dom.btnCreate?.addEventListener(
            "click",
            submitBusiness
        );

        dom.btnUpdate?.addEventListener(
            "click",
            submitBusiness
        );

        dom.btnClear?.addEventListener(
            "click",
            clearForm
        );

        dom.businessList?.addEventListener("click", async e => {

            const card = e.target.closest(".business-card");

            if (!card)
                return;

            const item = listCache[card.dataset.index];

            if (e.target.closest(".edit-btn")) {

                loadDetail(item);
                return;
            }

            if (e.target.closest(".delete-btn")) {

                await removeCompany(item);
                return;
            }

        });
    }


    async function removeCompany(item) {

        const target =
            item.CompanyID
                ? `統編：${item.CompanyID}`
                : `公司名稱：${item.CompanyName}`;

        const ok = confirm(
            `⚠️ 確認刪除公司？

${target}

公司：
${item.CompanyName}

此操作將永久刪除資料，
刪除後將無法復原！

按下「確定」繼續刪除。`
        );

        if (!ok)
            return;

        try {

            await API.remove("Companies", item.ID);

            alert("🗑️ 刪除成功");

            hideForm();
            setModeUI("view");

            await searchBusiness();

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }


    async function searchBusiness() {

        try {

            const q = {
                name: dom.qCompanyName.value.trim(),
                id: dom.qCompanyID.value.trim(),
                address: dom.qCompanyAddress.value.trim()
            };

            // 訂單沒有讀取權限時（null）只顯示客戶
            const data = await API.getMany(["Companies", "Orders"]);

            buildOrderStats(data.Orders || []);

            const list = (data.Companies || [])
                .filter(c =>
                    [c.CompanyName, c.ContactName, c.ContactPhone, c.CompanyPhone].some(v => App.like(v, q.name)) &&
                    App.like(c.CompanyID, q.id) &&
                    App.like(c.CompanyAddress, q.address))
                .sort((a, b) => String(a.CompanyName).localeCompare(String(b.CompanyName), "zh-Hant"));

            listCache = list;

            renderList({
                title: "📌 公司查詢結果",
                count: list.length,
                list
            });

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    // 每個客戶的訂單數、金額、最近下單日（同一 OrderNo 算一張）
    function buildOrderStats(orders) {

        orderStats = new Map();

        const seen = new Set();

        orders.forEach(o => {

            if (o.CompanyId === null || o.CompanyId === undefined || o.CompanyId === "") return;

            const key = String(o.CompanyId);
            const st = orderStats.get(key) || { count: 0, total: 0, last: "" };

            if (!seen.has(o.OrderNo)) {
                seen.add(o.OrderNo);
                st.count++;
                st.total += App.num(o.TotalAmount);
            }

            const d = App.toDateInput(o.OrderDate);
            if (d > st.last) st.last = d;

            orderStats.set(key, st);
        });
    }

    function getPaymentText(score) {

        switch (String(score)) {

            case "0":
                return "0 - 未評分";

            case "1":
                return "1 - 極差";

            case "2":
                return "2 - 偏差";

            case "3":
                return "3 - 普通";

            case "4":
                return "4 - 良好";

            case "5":
                return "5 - 優良";

            default:
                return score || "未設定";
        }
    }
    function renderList(result) {

        const list = result.list;
        dom.searchTitle.textContent = result.title;

        dom.searchCount.textContent =
            `符合條件共 ${result.count} 家，目前顯示 ${list.length} 家`;

        dom.businessList.innerHTML = "";

        if (!list.length) {

            dom.businessList.innerHTML = "";

            dom.emptyHint.classList.remove("d-none");

            return;
        }

        dom.emptyHint.classList.add("d-none");

        list.forEach((x, index) => {
            const displayNo = index + 1;

            const div = document.createElement("div");

            div.className = "business-card";

            div.dataset.index = index;



            const isPerson = x.CustomerType === "個人";
            const companyIdText = isPerson ? "" : (x.CompanyID
                ? `(統編：${x.CompanyID})`
                : `(無統編)`);
            const st = orderStats.get(String(x.ID));
            const contact = [x.ContactName, x.ContactPhone || x.CompanyPhone].filter(Boolean).join(" · ");

            div.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">

    <div class="member-name">
        ${isPerson ? "👤" : "🏢"} ${App.esc(x.CompanyName)} <span class="small text-muted">${App.esc(companyIdText)}</span>
    </div>

    <span class="badge bg-secondary">
        #${displayNo}
    </span>

</div>

    ${contact ? `<div class="member-info">📞 ${App.esc(contact)}</div>` : ""}

    <div class="member-info">
        📍 ${App.esc(x.CompanyAddress || "無地址")}
    </div>

    <div class="member-info">
        🧾 ${st ? `訂單 ${st.count} 張 · $${st.total.toLocaleString()} · 最近 ${App.esc(st.last || "-")}` : "尚無訂單"}
    </div>

    <div class="member-info">
        💰 付款狀態：${getPaymentText(x.PaymentStstus)}
    </div>

    <div class="mt-2 d-flex gap-2">

    <button class="btn btn-sm btn-outline-primary edit-btn">
        ✏️ 編輯
    </button>

    <button class="btn btn-sm btn-outline-danger delete-btn">
        🗑️ 刪除
    </button>

</div>
`;

            dom.businessList.appendChild(div);
        });
    }

    function setModeUI(newMode) {

        mode = newMode;

        const title =
            dom.formSection.querySelector(
                ".section-header"
            );

        if (mode === "create") {

            title.innerText =
                "📝 新增公司";

            dom.editHint.classList.add("d-none");
            dom.targetCompanyArea.classList.add("d-none");

            dom.TargetCompanyName.value = "";
            dom.TargetCompanyID.value = "";

            dom.btnCreate.disabled = false;
            dom.btnUpdate.disabled = true;
        }
        else if (mode === "edit") {

            title.innerText =
                "📝 編輯公司";

            dom.editHint.classList.remove("d-none");
            dom.targetCompanyArea.classList.remove("d-none");

            dom.TargetCompanyName.readOnly = true;
            dom.TargetCompanyID.readOnly = true;

            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = false;
        }
        else {

            title.innerText =
                "📝 公司資料編輯";

            dom.editHint.classList.add("d-none");
            dom.targetCompanyArea.classList.remove("d-none");

            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = true;
        }
    }

    function loadDetail(item) {

        currentDetail = item;
        fillForm(item);
        showForm();
        setModeUI("edit");
        scrollToForm();
    }

    function fillForm(d) {

        dom.TargetCompanyName.value =
            d.CompanyName || "";

        dom.TargetCompanyID.value =
            d.CompanyID || "";

        dom.CompanyNameEdit.value =
            d.CompanyName || "";

        dom.CustomerType.value =
            d.CustomerType === "個人" ? "個人" : "公司";

        dom.CompanyIDEdit.value =
            d.CompanyID || "";

        dom.CompanyPhone.value =
            d.CompanyPhone || "";

        dom.CompanyURL.value =
            d.CompanyURL || "";

        dom.CompanyAddress.value =
            d.CompanyAddress || "";

        dom.ContactName.value =
            d.ContactName || "";

        dom.ContactPhone.value =
            d.ContactPhone || "";

        dom.ContactEmail.value =
            d.ContactEmail || "";

        dom.PaymentStstus.value =
            d.PaymentStstus ?? "0";

        dom.IsMember.checked =
            d.IsMember === true;

        dom.IsConverted.checked =
            d.IsConverted === true;

        dom.AccountManager.value =
            d.AccountManager || "";

        dom.TotalVisit.value =
            d.TotalVisit ?? 0;

        dom.TotalMail.value =
            d.TotalMail ?? 0;

        dom.Source.value =
            d.Source || "";

        dom.Note.value = d.Note || "";

        dom.TargetCompanyName.readOnly = true;
        dom.TargetCompanyID.readOnly = true;
    }

    function openCreate() {
        currentDetail = null;
        dom.form.reset();
        dom.targetCompanyArea.classList.add("d-none");
        showForm();
        setModeUI("create");
        scrollToForm();

    }

    function clearForm() {

        dom.form.reset();

        if (mode === "edit") {

            fillForm(currentDetail);

        }
        else {

            dom.targetCompanyArea.classList.add("d-none");

        }

    }

    function showForm() {
        dom.formSection.classList.remove(
            "d-none"
        );
    }

    function scrollToForm() {
        setTimeout(() => {
            dom.formSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 100);
    }

    function hideForm() {
        dom.formSection.classList.add(
            "d-none"
        );
    }

    async function submitBusiness() {

        const data = buildPayload();

        if (!data.CompanyName) {
            alert("請輸入客戶 / 公司名稱");
            return;
        }

        try {

            if (mode === "create") {

                const exists = (await API.list("Companies")).some(c =>
                    (data.CompanyID && String(c.CompanyID) === data.CompanyID) ||
                    c.CompanyName === data.CompanyName);

                if (exists) {
                    alert("⚠️ 相同名稱或統編已經建立過");
                    return;
                }

                await API.insert("Companies", data);

                alert("🎉 客戶資料建立成功");

            } else {

                await API.update("Companies", currentDetail.ID, data);

                alert("✅ 客戶資料修改成功");
            }

            hideForm();

            setModeUI("view");

            await searchBusiness();

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    function buildPayload() {

        return {
            CompanyName: dom.CompanyNameEdit.value.trim(),
            CustomerType: dom.CustomerType.value,
            CompanyID: dom.CompanyIDEdit.value.trim(),

            CompanyPhone: dom.CompanyPhone.value.trim(),
            CompanyURL: dom.CompanyURL.value.trim(),
            CompanyAddress: dom.CompanyAddress.value.trim(),

            ContactName: dom.ContactName.value.trim(),
            ContactPhone: dom.ContactPhone.value.trim(),
            ContactEmail: dom.ContactEmail.value.trim(),

            PaymentStstus: App.numOrNull(dom.PaymentStstus.value),

            IsMember: dom.IsMember.checked,
            IsConverted: dom.IsConverted.checked,

            AccountManager: dom.AccountManager.value.trim(),

            TotalVisit: App.numOrNull(dom.TotalVisit.value),
            TotalMail: App.numOrNull(dom.TotalMail.value),

            Source: dom.Source.value.trim(),

            Note: dom.Note.value
        };
    }

    return {
        init,
        removeCompany
    };

})();