window.Pages = window.Pages || {};

// =========================================================
// 財務總表：整合帳款收款、出攤紀錄、支出表、品牌攤提表
// 總損益公式與首頁「品牌損益」一致（見 js/pages/home.js renderFinance）：
//   營收 = 收款（依付款日）＋ 出攤營業額（＋ 品牌攤提表「回收」）
//   支出 = 支出表 ＋ 出攤費用（不含食材估算，避免與支出表重複）（＋ 品牌攤提表「支出」）
// 各通路損益（出攤 / 線上 / B2B）為獨立統計，不併入上方總損益
// （線上 / B2B 訂單已透過 syncOrderReceivable_ 併入帳款收款，避免重複計算）
// =========================================================
Pages.FinanceReport = (() => {

    "use strict";

    const dom = {};

    let receivables = [], expenses = [], stalls = [], brand = [], orderRows = [], products = [];
    let trendChart = null;

    async function init() {

        cacheDom();
        bindEvents();

        try { dom.includeBrand.checked = localStorage.getItem("fonegle_pl_include_brand") !== "0"; } catch { }

        try { dom.periodType.value = localStorage.getItem("fonegle_fr_period") || "a"; } catch { }
        onPeriodTypeChange();

        for (let m = 1; m <= 12; m++) dom.month.add(new Option(m + "月", String(m)));

        try {

            const data = await API.getMany(["Receivable", "Expenses", "StallRecords", "BrandCosts", "Orders", "Products"]);

            receivables = data.Receivable || [];
            expenses = data.Expenses || [];
            stalls = data.StallRecords || [];
            brand = data.BrandCosts || [];
            orderRows = data.Orders || [];
            products = data.Products || [];

            renderYearOptions();
            renderReport();

        } catch (err) {

            App.error(err, "財務資料載入失敗");
        }
    }

    function cacheDom() {
        [
            "periodType", "year", "quarter", "month", "includeBrand",
            "frSince", "frTotal", "frIncome", "frExpense", "frDetailTable", "frDupNote",
            "chStall", "chStallSub", "chOnline", "chOnlineSub", "chB2b", "chB2bSub",
            "frTrendBox", "frTrendTitle", "frTrendChart"
        ].forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        dom.periodType.addEventListener("change", () => {
            try { localStorage.setItem("fonegle_fr_period", dom.periodType.value); } catch { }
            onPeriodTypeChange();
        });
        dom.year.addEventListener("change", renderReport);
        dom.quarter.addEventListener("change", renderReport);
        dom.month.addEventListener("change", renderReport);

        dom.includeBrand.addEventListener("change", () => {
            try { localStorage.setItem("fonegle_pl_include_brand", dom.includeBrand.checked ? "1" : "0"); } catch { }
            renderReport();
        });
    }

    function onPeriodTypeChange() {
        const mode = dom.periodType.value;
        dom.year.classList.toggle("d-none", mode === "a");
        dom.quarter.classList.toggle("d-none", mode !== "q");
        dom.month.classList.toggle("d-none", mode !== "m");
        renderReport();
    }

    // =========================
    // 工具
    // =========================
    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    function allYears() {

        const set = new Set();
        const add = d => { if (d) set.add(d.slice(0, 4)); };

        receivables.forEach(r => add(App.toDateInput(r.PaymentDate)));
        stalls.forEach(r => add(App.toDateInput(r.StallDate)));
        expenses.forEach(r => add(App.toDateInput(r.ExpenseDate)));
        brand.forEach(r => add(App.toDateInput(r.RecordDate)));
        set.add(String(new Date().getFullYear()));

        return [...set].sort();
    }

    function renderYearOptions() {

        const years = allYears();
        const prev = dom.year.value;

        dom.year.innerHTML = years.slice().reverse().map(y => `<option value="${y}">${y}年</option>`).join("");
        dom.year.value = years.includes(prev) ? prev : years[years.length - 1];
    }

    // 目前選取期間的日期比對函式
    function currentMatch() {

        const mode = dom.periodType.value;
        if (mode === "a") return () => true;

        const year = dom.year.value;
        if (mode === "y") return d => d.startsWith(year);

        if (mode === "q") {
            const q = Number(dom.quarter.value);
            return d => d.startsWith(year) && Math.floor((Number(d.slice(5, 7)) - 1) / 3) === q;
        }

        if (mode === "m") {
            const m = Number(dom.month.value);
            return d => d.startsWith(year) && Number(d.slice(5, 7)) === m;
        }

        return () => true;
    }

    function sum(rows, dateKey, fn, matchFn) {
        return rows.reduce((t, r) => {
            const d = App.toDateInput(r[dateKey]) || "";
            return d && matchFn(d) ? t + fn(r) : t;
        }, 0);
    }

    // 品牌損益總損益計算（沿用首頁 renderFinance() 的公式，matchFn 決定要算哪個期間）
    // includeNoDateAR：已收款但沒填付款日的帳款，只在「累計」模式下計入
    function calcTotals(matchFn, includeNoDateAR) {

        const useBrand = dom.includeBrand.checked;
        const expKey = new Set(expenses.map(r => (App.toDateInput(r.ExpenseDate) || "") + "|" + Math.round(App.num(r.Amount))));
        const brandOut = useBrand ? brand.filter(e => e.Type !== "回收") : [];
        const brandIn = useBrand ? brand.filter(e => e.Type === "回收") : [];
        const brandOutOnly = brandOut.filter(e => !expKey.has((App.toDateInput(e.RecordDate) || "") + "|" + Math.round(App.num(e.Amount))));
        const dupCount = brandOut.length - brandOutOnly.length;

        const shipOf = OrderStats.shipMap(orderRows);     // 運費不算營收
        const arIncome = receivables.reduce((t, r) => {
            const paid = OrderStats.netPaid(r, shipOf);
            if (!paid) return t;
            const d = App.toDateInput(r.PaymentDate) || "";
            if (d) return matchFn(d) ? t + paid : t;
            return includeNoDateAR ? t + paid : t;
        }, 0);

        const stallIncome = sum(stalls, "StallDate", r => App.num(r.Revenue), matchFn);
        // 出攤費用不含「食材成本估算」，實際食材採購記在支出表，避免重複計算
        const stallCost = sum(stalls, "StallDate", r => App.num(r.TotalCost) - App.num(r.FoodCost), matchFn);
        const expense = sum(expenses, "ExpenseDate", r => App.num(r.Amount), matchFn);
        const brandCost = sum(brandOutOnly, "RecordDate", r => App.num(r.Amount), matchFn);
        const brandIncome = sum(brandIn, "RecordDate", r => App.num(r.Amount), matchFn);

        return {
            arIncome, stallIncome, stallCost, expense, brandCost, brandIncome, dupCount, useBrand,
            income: arIncome + stallIncome + brandIncome,
            out: expense + stallCost + brandCost
        };
    }

    // =========================
    // 主畫面
    // =========================
    function renderReport() {

        const mode = dom.periodType.value;
        const t = calcTotals(currentMatch(), mode === "a");
        const net = t.income - t.out;

        const label = mode === "a" ? "總損益（成立至今）"
            : mode === "y" ? `總損益（${dom.year.value} 年）`
                : mode === "q" ? `總損益（${dom.year.value} 年第 ${Number(dom.quarter.value) + 1} 季）`
                    : `總損益（${dom.year.value} 年 ${dom.month.value} 月）`;

        dom.frSince.textContent = label;
        dom.frTotal.textContent = money(net);
        dom.frTotal.className = "pl-big " + (net >= 0 ? "text-success" : "text-danger");
        dom.frIncome.textContent = money(t.income);
        dom.frExpense.textContent = money(t.out);

        dom.frDetailTable.innerHTML = `
<tr><td>🟢 帳款收款（依付款日）</td><td class="text-end">${money(t.arIncome)}</td></tr>
<tr><td>🟢 出攤營業額</td><td class="text-end">${money(t.stallIncome)}</td></tr>
${t.useBrand ? `<tr><td>🟢 品牌攤提表「回收」</td><td class="text-end">${money(t.brandIncome)}</td></tr>` : ""}
<tr><td>🔴 支出表</td><td class="text-end">${money(t.expense)}</td></tr>
<tr><td>🔴 出攤費用（不含食材估算）</td><td class="text-end">${money(t.stallCost)}</td></tr>
${t.useBrand ? `<tr><td>🔴 品牌攤提表「支出」</td><td class="text-end">${money(t.brandCost)}</td></tr>` : ""}`;

        dom.frDupNote.textContent = t.useBrand && t.dupCount
            ? `※ 品牌攤提表有 ${t.dupCount} 筆與支出表同日同金額，視為同一筆只算一次`
            : (t.useBrand ? "" : "※ 目前未計入品牌攤提表（上方可切換）");

        renderChannels(currentMatch());

        dom.frTrendBox.classList.toggle("d-none", mode === "q" || mode === "m");
        if (mode === "y") renderTrendMonthly(dom.year.value);
        if (mode === "a") renderTrendYearly();
    }

    // 各通路損益：出攤 = 出攤紀錄盈虧；訂單 = 訂單總額 − 產品成本（獨立統計，資訊用途）
    function renderChannels(matchFn) {

        const set = (el, sub, v, text) => {
            el.textContent = money(v);
            el.className = "fw-bold fs-5 " + (v >= 0 ? "text-success" : "text-danger");
            sub.textContent = text;
        };

        const stallList = stalls.filter(r => {
            const d = App.toDateInput(r.StallDate);
            return d && matchFn(d);
        });
        const st = stallList.reduce((t, r) => ({ n: t.n + 1, p: t.p + App.num(r.ProfitLoss), r: t.r + App.num(r.Revenue) }), { n: 0, p: 0, r: 0 });
        set(dom.chStall, dom.chStallSub, st.p, `${st.n} 場 · 營業額 ${money(st.r)}`);

        const orders = OrderStats.group(orderRows, products).filter(o => o.date && matchFn(o.date));
        const on = OrderStats.summarize(orders.filter(o => !o.b2b));
        const b2b = OrderStats.summarize(orders.filter(o => o.b2b));
        const sub = s => `${s.count} 筆 · 營收 ${money(s.revenue)} · 成本 ${money(s.cost)}`;
        set(dom.chOnline, dom.chOnlineSub, on.profit, sub(on));
        set(dom.chB2b, dom.chB2bSub, b2b.profit, sub(b2b));

        const missing = on.missing + b2b.missing;
        dom.chB2bSub.title = dom.chOnlineSub.title = missing ? `${missing} 個品項沒有產品成本價，以 0 計` : "";
    }

    // =========================
    // 趨勢圖
    // =========================
    function renderTrendMonthly(year) {

        dom.frTrendTitle.textContent = `📈 ${year} 年業績起伏（依月）`;

        const perMonth = Array.from({ length: 12 }, (_, i) => {
            const mm = String(i + 1).padStart(2, "0");
            const t = calcTotals(d => d.startsWith(year + "-" + mm), false);
            return { income: t.income, out: t.out, net: t.income - t.out };
        });

        drawTrendChart(perMonth.map((_, i) => (i + 1) + "月"), perMonth);
    }

    function renderTrendYearly() {

        const years = allYears();
        dom.frTrendTitle.textContent = "📈 歷年業績起伏";

        const perYear = years.map(y => {
            const t = calcTotals(d => d.startsWith(y), false);
            return { income: t.income, out: t.out, net: t.income - t.out };
        });

        drawTrendChart(years.map(y => y + "年"), perYear);
    }

    function drawTrendChart(labels, data) {

        if (typeof Chart === "undefined" || !dom.frTrendChart) return;
        if (trendChart) trendChart.destroy();

        trendChart = new Chart(dom.frTrendChart, {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "營收", data: data.map(d => d.income), borderColor: "#198754", backgroundColor: "#19875433", tension: .3 },
                    { label: "支出", data: data.map(d => d.out), borderColor: "#dc3545", backgroundColor: "#dc354533", tension: .3 },
                    { label: "淨損益", data: data.map(d => d.net), borderColor: "#0d6efd", backgroundColor: "#0d6efd33", tension: .3 }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: { y: { ticks: { callback: v => "$" + Number(v).toLocaleString() } } }
            }
        });
    }

    return {
        init
    };

})();
