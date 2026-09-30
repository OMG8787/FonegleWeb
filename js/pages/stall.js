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

    // 收支分類彙總可選欄位（type: in=收入 / out=支出）
    const SUMMARY_FIELDS = [
        { key: "CashIncome", label: "現金收款", type: "in" },
        { key: "ElectronicPay", label: "電子支付收款", type: "in" },
        { key: "BoothFee", label: "攤位費", type: "out" },
        { key: "TransportCost", label: "車資", type: "out" },
        { key: "StaffCost", label: "人手費用", type: "out" },
        { key: "OtherCost", label: "其他費用", type: "out" },
        { key: "PaymentFee", label: "手續費", type: "out" },
        { key: "FoodCost", label: "食材成本", type: "out" }
    ];

    let records = [];
    let listCache = [];
    let events = [];
    let current = null;
    let sumChart = null;

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();
        openCreate(false);
        initSummary();

        // 列表高度：從列表頂端到頁尾上方（電腦版）；手機版用 CSS 的 60vh
        fitList();
        window.addEventListener("resize", fitList);

        try {

            const data = await API.getMany(["StallRecords", "Calendar"]);

            renderEventOptions(data.Calendar);
            records = data.StallRecords;
            applySearch();
            refreshSummary();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        FIELDS.concat([
            "stallForm", "formTitle", "editHint", "stallList", "emptyHint", "listCount", "qMonth", "qKeyword",
            "btnSearch", "btnSearchAll", "btnNew", "btnCreate", "btnUpdate", "btnDelete", "btnClear",
            "btnImportPOS", "sumCount", "sumRevenue", "sumCost", "sumProfit", "sumAvgProfit",
            "resultProfit", "resultMargin", "resultCost", "resultPerStaff", "resultLowText",
            "resultLowBar", "resultTargetText", "resultTargetBar", "formCard",
            "sumPeriodType", "sumYear", "sumQuarter", "sumMonth", "sumFieldChecks",
            "sumFieldTable", "sumFieldFoot", "sumTrendBox", "sumTrendChart"
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

    function fitList() {
        const w = document.getElementById("listWrap");
        if (!w) return;
        if (window.innerWidth < 992) { w.style.maxHeight = ""; return; }
        const top = w.getBoundingClientRect().top + window.scrollY;
        const footer = document.getElementById("erp-footer")?.offsetHeight || 0;
        w.style.maxHeight = Math.max(280, window.innerHeight - top - footer - 24) + "px";
    }

    function renderList(list) {

        const esc = App.esc;

        dom.emptyHint.classList.toggle("d-none", list.length > 0);
        if (dom.listCount) dom.listCount.textContent = `${list.length} 筆`;

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
    // 收支分類彙總
    // =========================
    function initSummary() {

        let saved;
        try { saved = JSON.parse(localStorage.getItem("fonegle_stall_summary_fields") || "null"); } catch { saved = null; }
        const checked = new Set(Array.isArray(saved) ? saved : SUMMARY_FIELDS.map(f => f.key));

        dom.sumFieldChecks.innerHTML = SUMMARY_FIELDS.map(f => `
<div class="form-check form-check-inline">
    <input class="form-check-input" type="checkbox" id="sf_${f.key}" value="${f.key}" ${checked.has(f.key) ? "checked" : ""}>
    <label class="form-check-label small" for="sf_${f.key}">${f.type === "in" ? "🟢" : "🔴"} ${f.label}</label>
</div>`).join("");

        dom.sumFieldChecks.addEventListener("change", () => {
            const keys = SUMMARY_FIELDS.filter(f => document.getElementById("sf_" + f.key).checked).map(f => f.key);
            try { localStorage.setItem("fonegle_stall_summary_fields", JSON.stringify(keys)); } catch { }
            renderSummaryReport();
        });

        try { dom.sumPeriodType.value = localStorage.getItem("fonegle_stall_summary_period") || "y"; } catch { }

        dom.sumPeriodType.addEventListener("change", () => {
            try { localStorage.setItem("fonegle_stall_summary_period", dom.sumPeriodType.value); } catch { }
            onPeriodModeChange();
        });
        dom.sumYear.addEventListener("change", renderSummaryReport);
        dom.sumQuarter.addEventListener("change", renderSummaryReport);
        dom.sumMonth.addEventListener("change", renderSummaryReport);

        for (let m = 1; m <= 12; m++) dom.sumMonth.add(new Option(m + "月", String(m)));

        onPeriodModeChange();
    }

    function onPeriodModeChange() {
        const mode = dom.sumPeriodType.value;
        dom.sumQuarter.classList.toggle("d-none", mode !== "q");
        dom.sumMonth.classList.toggle("d-none", mode !== "m");
        dom.sumTrendBox.classList.toggle("d-none", mode !== "y");
        renderSummaryReport();
    }

    function refreshSummary() {
        renderYearOptions();
        renderSummaryReport();
    }

    function renderYearOptions() {

        const years = new Set(records.map(r => String(r.StallDate || "").slice(0, 4)).filter(Boolean));
        years.add(String(new Date().getFullYear()));

        const sorted = [...years].sort().reverse();
        const prev = dom.sumYear.value;

        dom.sumYear.innerHTML = sorted.map(y => `<option value="${y}">${y}年</option>`).join("");
        dom.sumYear.value = sorted.includes(prev) ? prev : sorted[0];
    }

    // 判斷一筆出攤日期是否落在目前選取的期間（年 / 季 / 月）內
    function inPeriod(dateStr) {

        const d = String(dateStr || "");
        if (!d || !dom.sumYear.value) return false;
        if (!d.startsWith(dom.sumYear.value)) return false;

        const mode = dom.sumPeriodType.value;
        if (mode === "y") return true;

        const month = Number(d.slice(5, 7));
        if (mode === "q") return Math.floor((month - 1) / 3) === Number(dom.sumQuarter.value);
        if (mode === "m") return month === Number(dom.sumMonth.value);
        return true;
    }

    function renderSummaryReport() {

        if (!dom.sumYear.value) renderYearOptions();

        const checkedKeys = SUMMARY_FIELDS.filter(f => document.getElementById("sf_" + f.key)?.checked).map(f => f.key);
        const list = records.filter(r => inPeriod(r.StallDate));

        let incomeTotal = 0, costTotal = 0;

        const rowsHtml = SUMMARY_FIELDS.filter(f => checkedKeys.includes(f.key)).map(f => {
            const v = list.reduce((s, r) => s + App.num(r[f.key]), 0);
            if (f.type === "in") incomeTotal += v; else costTotal += v;
            return `<tr><td>${f.type === "in" ? "🟢" : "🔴"} ${f.label}</td><td class="text-end">${money(v)}</td></tr>`;
        }).join("");

        dom.sumFieldTable.innerHTML = rowsHtml || `<tr><td colspan="2" class="text-muted small">請至少勾選一個欄位</td></tr>`;

        const net = incomeTotal - costTotal;
        dom.sumFieldFoot.innerHTML = `
<tr class="table-light"><td>收入合計</td><td class="text-end profit">${money(incomeTotal)}</td></tr>
<tr class="table-light"><td>支出合計</td><td class="text-end loss">${money(costTotal)}</td></tr>
<tr><td><b>淨額</b></td><td class="text-end fw-bold ${net >= 0 ? "profit" : "loss"}">${money(net)}</td></tr>
<tr><td colspan="2" class="text-muted small">共 ${list.length} 場出攤</td></tr>`;

        if (dom.sumPeriodType.value === "y") renderTrend(dom.sumYear.value, checkedKeys);
    }

    // 年度業績起伏：依月畫出收入 / 支出 / 淨額趨勢
    function renderTrend(year, checkedKeys) {

        const inKeys = checkedKeys.filter(k => SUMMARY_FIELDS.find(f => f.key === k)?.type === "in");
        const outKeys = checkedKeys.filter(k => SUMMARY_FIELDS.find(f => f.key === k)?.type === "out");

        const perMonth = Array.from({ length: 12 }, (_, i) => {
            const mm = String(i + 1).padStart(2, "0");
            const rows = records.filter(r => String(r.StallDate || "").startsWith(year + "-" + mm));
            const income = inKeys.reduce((s, k) => s + rows.reduce((s2, r) => s2 + App.num(r[k]), 0), 0);
            const cost = outKeys.reduce((s, k) => s + rows.reduce((s2, r) => s2 + App.num(r[k]), 0), 0);
            return { income, cost, net: income - cost };
        });

        drawTrendChart(perMonth.map((_, i) => (i + 1) + "月"), perMonth);
    }

    function drawTrendChart(labels, data) {

        if (typeof Chart === "undefined" || !dom.sumTrendChart) return;
        if (sumChart) sumChart.destroy();

        sumChart = new Chart(dom.sumTrendChart, {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "收入", data: data.map(d => d.income), borderColor: "#198754", backgroundColor: "#19875433", tension: .3 },
                    { label: "支出", data: data.map(d => d.cost), borderColor: "#dc3545", backgroundColor: "#dc354533", tension: .3 },
                    { label: "淨額", data: data.map(d => d.net), borderColor: "#0d6efd", backgroundColor: "#0d6efd33", tension: .3 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: { y: { ticks: { callback: v => "$" + Number(v).toLocaleString() } } }
            }
        });
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
            refreshSummary();
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
            refreshSummary();

            alert("🗑️ 已刪除");

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }

    return {
        init
    };

})();
