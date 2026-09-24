window.Pages = window.Pages || {};

// =========================================================
// 出攤紀錄（StallRecords 工作表）
// 盈虧 = 營業額 − 攤位費 − 車資 − 人手費用 − 其他費用 − 手續費 − 食材成本
// =========================================================
Pages.Stall = (() => {

    "use strict";

    const dom = {};

    const FIELDS = [
        "ID", "CalendarId", "StallDate", "EventName", "Location", "Organizer", "StaffCount",
        "BoothFee", "TransportCost", "StaffCost", "OtherCost", "CashIncome", "ElectronicPay",
        "PaymentFeeRate", "PaymentFee", "Revenue", "FoodCostRate", "FoodCost",
        "RevenueLow", "RevenueTarget", "Note"
    ];

    const NUMBER_FIELDS = [
        "StaffCount", "BoothFee", "TransportCost", "StaffCost", "OtherCost", "CashIncome", "ElectronicPay",
        "PaymentFeeRate", "PaymentFee", "Revenue", "FoodCostRate", "FoodCost", "RevenueLow", "RevenueTarget"
    ];

    let records = [];
    let listCache = [];
    let events = [];
    let current = null;

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();
        openCreate(false);

        try {

            const data = await API.getMany(["StallRecords", "Calendar"]);

            renderEventOptions(data.Calendar);
            records = data.StallRecords;
            applySearch();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "stallForm", "formTitle", "editHint", "stallList", "emptyHint", "qMonth", "qKeyword",
            "btnSearch", "btnSearchAll", "btnNew", "btnCreate", "btnUpdate", "btnDelete", "btnClear",
            "btnImportPOS", "sumCount", "sumRevenue", "sumCost", "sumProfit", "sumAvgProfit",
            "resultProfit", "resultMargin", "resultCost", "resultPerStaff", "resultLowText",
            "resultLowBar", "resultTargetText", "resultTargetBar", "formCard"
        ]).forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        dom.btnSearch.addEventListener("click", applySearch);
        dom.btnSearchAll.addEventListener("click", () => {
            dom.qMonth.value = "";
            dom.qKeyword.value = "";
            applySearch();
        });

        dom.btnNew.addEventListener("click", () => openCreate(true));
        dom.btnClear.addEventListener("click", () => openCreate(false));
        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);
        dom.btnImportPOS.addEventListener("click", importFromPOS);
        dom.CalendarId.addEventListener("change", onEventSelected);

        dom.stallForm.addEventListener("input", e => {

            // 手續費依費率自動計算（手動改手續費時不覆蓋）
            if ((e.target.id === "PaymentFeeRate" || e.target.id === "ElectronicPay") && dom.PaymentFeeRate.value !== "") {
                dom.PaymentFee.value = Math.round(num("ElectronicPay") * num("PaymentFeeRate") / 100);
            }

            if (e.target.classList.contains("calc"))
                calculate();
        });

        dom.stallList.addEventListener("click", e => {
            const card = e.target.closest(".stall-card");
            if (card) loadDetail(listCache[card.dataset.index]);
        });
    }

    // =========================
    // 計算
    // =========================
    function num(id) {
        return App.num(dom[id].value);
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    function pct(v) {
        return isFinite(v) ? (v * 100).toFixed(1) + "%" : "-";
    }

    function compute(r) {

        const revenue = App.num(r.CashIncome) + App.num(r.ElectronicPay);
        const foodCost = Math.round(revenue * App.num(r.FoodCostRate) / 100);
        const totalCost = App.num(r.BoothFee) + App.num(r.TransportCost) + App.num(r.StaffCost) +
            App.num(r.OtherCost) + App.num(r.PaymentFee) + foodCost;

        return {
            Revenue: revenue,
            FoodCost: foodCost,
            TotalCost: totalCost,
            ProfitLoss: revenue - totalCost
        };
    }

    function readForm() {

        const r = {};

        FIELDS.forEach(f => {
            r[f] = NUMBER_FIELDS.includes(f) || f === "CalendarId"
                ? App.numOrNull(dom[f].value)
                : dom[f].value.trim();
        });

        return Object.assign(r, compute(r));
    }

    function calculate() {

        const r = readForm();

        dom.Revenue.value = r.Revenue;
        dom.FoodCost.value = r.FoodCost;

        dom.resultProfit.textContent = money(r.ProfitLoss);
        dom.resultProfit.className = "big " + (r.ProfitLoss >= 0 ? "profit" : "loss");
        dom.resultMargin.textContent = "淨利率 " + (r.Revenue ? pct(r.ProfitLoss / r.Revenue) : "-");
        dom.resultCost.textContent = money(r.TotalCost);
        dom.resultPerStaff.textContent = r.StaffCount ? money(r.Revenue / r.StaffCount) : "-";

        const bar = (textEl, barEl, goal) => {
            if (!goal) {
                textEl.textContent = "未設定";
                barEl.style.width = "0%";
                return;
            }
            const rate = r.Revenue / goal;
            textEl.textContent = `${pct(rate)}（${money(r.Revenue)} / ${money(goal)}）`;
            barEl.style.width = Math.min(100, rate * 100) + "%";
        };

        bar(dom.resultLowText, dom.resultLowBar, r.RevenueLow);
        bar(dom.resultTargetText, dom.resultTargetBar, r.RevenueTarget);
    }

    // =========================
    // 行事曆活動
    // =========================
    function renderEventOptions(rows) {

        events = rows
            .filter(r => r.IsDeleted !== true)
            .map(r => ({
                id: r.CalendarId,
                name: r.EventName || "",
                address: r.EventAddress || "",
                date: App.toDateInput(r.StartEventDate)
            }))
            .sort((a, b) => b.date.localeCompare(a.date));

        dom.CalendarId.innerHTML = "";
        dom.CalendarId.add(new Option("（不指定）", ""));
        events.forEach(e => dom.CalendarId.add(new Option(`${e.date}　${e.name}`, e.id)));
    }

    function onEventSelected() {

        const e = events.find(x => String(x.id) === dom.CalendarId.value);
        if (!e) return;

        dom.EventName.value = e.name;
        dom.Location.value = e.address;
        if (!dom.StallDate.value) dom.StallDate.value = e.date;
    }

    // 以出攤日期彙總「現場點餐」的收款
    async function importFromPOS() {

        const date = dom.StallDate.value;

        if (!date) {
            alert("請先選擇出攤日期");
            return;
        }

        try {

            const orders = (await API.list("MarketOrders"))
                .filter(o => {
                    const d = new Date(o.Time);
                    return !isNaN(d) && ymd(d) === date;
                });

            if (!orders.length) {
                alert(`${date} 沒有現場點餐紀錄`);
                return;
            }

            const cash = orders.filter(o => o.Payment === "cash").reduce((s, o) => s + App.num(o.Total), 0);
            const online = orders.filter(o => o.Payment !== "cash").reduce((s, o) => s + App.num(o.Total), 0);

            dom.CashIncome.value = cash;
            dom.ElectronicPay.value = online;

            if (dom.PaymentFeeRate.value !== "")
                dom.PaymentFee.value = Math.round(online * num("PaymentFeeRate") / 100);

            calculate();

            alert(`已帶入 ${orders.length} 筆點餐\n現金：${money(cash)}\n電子支付：${money(online)}`);

        } catch (err) {

            App.error(err, "帶入失敗");
        }
    }

    function ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // =========================
    // 列表
    // =========================
    function applySearch() {

        const month = dom.qMonth.value;
        const keyword = dom.qKeyword.value.trim();

        listCache = records
            .filter(r =>
                (!month || String(r.StallDate || "").startsWith(month)) &&
                (App.like(r.EventName, keyword) || App.like(r.Location, keyword)))
            .sort((a, b) => String(b.StallDate).localeCompare(String(a.StallDate)));

        renderSummary(listCache);
        renderList(listCache);
    }

    function renderSummary(list) {

        const sum = f => list.reduce((s, r) => s + App.num(r[f]), 0);
        const profit = sum("ProfitLoss");

        dom.sumCount.textContent = list.length;
        dom.sumRevenue.textContent = money(sum("Revenue"));
        dom.sumCost.textContent = money(sum("TotalCost"));
        dom.sumProfit.textContent = money(profit);
        dom.sumProfit.className = "value " + (profit >= 0 ? "profit" : "loss");
        dom.sumAvgProfit.textContent = list.length ? money(profit / list.length) : "$0";
    }

    function renderList(list) {

        const esc = App.esc;

        dom.emptyHint.classList.toggle("d-none", list.length > 0);

        dom.stallList.innerHTML = list.map((r, i) => {

            const profit = App.num(r.ProfitLoss);
            const revenue = App.num(r.Revenue);

            let badge = "";
            if (r.RevenueTarget && revenue >= r.RevenueTarget) badge = `<span class="badge bg-success">達標</span>`;
            else if (r.RevenueLow && revenue >= r.RevenueLow) badge = `<span class="badge bg-info">過低標</span>`;
            else if (r.RevenueLow) badge = `<span class="badge bg-secondary">未達低標</span>`;

            return `
<div class="stall-card ${current && current.ID === r.ID ? "active" : ""}" data-index="${i}">
    <div class="d-flex justify-content-between">
        <b>${esc(r.EventName || "未命名")}</b>
        <span class="${profit >= 0 ? "profit" : "loss"} fw-bold">${money(profit)}</span>
    </div>
    <div class="small text-muted">📅 ${esc(r.StallDate || "-")}　📍 ${esc(r.Location || "-")}</div>
    <div class="small d-flex justify-content-between mt-1">
        <span>營業額 ${money(revenue)}　成本 ${money(r.TotalCost)}</span>
        ${badge}
    </div>
</div>`;
        }).join("");
    }

    // =========================
    // 表單
    // =========================
    function setMode(mode) {

        const edit = mode === "edit";

        dom.formTitle.textContent = edit ? "✏️ 修改出攤紀錄" : "➕ 新增出攤紀錄";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate(scroll) {

        current = null;
        dom.stallForm.reset();
        dom.ID.value = "";
        setMode("create");
        calculate();

        if (scroll) dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function loadDetail(r) {

        if (!r) return;

        current = r;

        FIELDS.forEach(f => {
            dom[f].value = f === "StallDate" ? App.toDateInput(r[f]) : (r[f] ?? "");
        });

        setMode("edit");
        calculate();
        renderList(listCache);

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function save(isCreate) {

        const data = readForm();

        if (!data.StallDate || !data.EventName) {
            alert("請輸入出攤日期與活動名稱");
            return;
        }

        delete data.ID;

        try {

            if (isCreate) {
                current = await API.insert("StallRecords", data);
                alert(`🎉 出攤紀錄已建立\n盈虧：${money(current.ProfitLoss)}`);
            } else {
                current = await API.update("StallRecords", current.ID, data);
                alert(`✅ 出攤紀錄已更新\n盈虧：${money(current.ProfitLoss)}`);
            }

            records = await API.list("StallRecords");
            applySearch();
            loadDetail(records.find(r => r.ID === current.ID));

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除「${current.StallDate} ${current.EventName}」的出攤紀錄？`))
            return;

        try {

            await API.remove("StallRecords", current.ID);

            records = records.filter(r => r.ID !== current.ID);
            openCreate(false);
            applySearch();

            alert("🗑️ 已刪除");

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }

    return {
        init
    };

})();
