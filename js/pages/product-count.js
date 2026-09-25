window.Pages = window.Pages || {};

// =========================================================
// 產品月盤點（ProductCounts）
//   製作：ProductionLog.ProducedQty（依製造日 MfgDate）
//   出貨：Shipment.ShippingQty（依出貨日 ShippingDate）
//   應有庫存 = 期初 + 製作 - 出貨 - 其他出庫 - 損耗
//   本月使用量 = 期初 + 製作 - 實盤（未盤點時 = 出貨 + 其他出庫 + 損耗）
// =========================================================
Pages.ProductCount = (() => {

    "use strict";

    const U = StockUtil;
    const dom = {};

    let products = [];
    let productions = [];
    let shipments = [];
    let counts = [];
    let rows = [];          // 目前月份的計算結果
    let edits = new Map();  // ProductID → 使用者輸入 { OpeningQty, OtherOutQty, WasteQty, CountedQty }

    async function init() {

        ["qMonth", "btnCsv", "qKeyword", "qActiveOnly", "savedHint", "syncStock", "btnSave", "countBody",
            "sumProduced", "sumShipped", "sumUsed", "sumExpiring", "sumCounted", "trendMetric", "trendHead", "trendBody"]
            .forEach(id => dom[id] = document.getElementById(id));

        dom.qMonth.value = U.thisMonth();

        // 沒有產品管理權限時不能寫回產品庫存
        if (!Auth.hasPermission(22)) {
            dom.syncStock.checked = false;
            dom.syncStock.disabled = true;
        }

        dom.qMonth.addEventListener("change", () => { edits.clear(); render(); });
        dom.qKeyword.addEventListener("input", renderTable);
        dom.qActiveOnly.addEventListener("change", renderTable);
        dom.trendMetric.addEventListener("change", renderTrend);
        dom.btnSave.addEventListener("click", save);
        dom.btnCsv.addEventListener("click", exportCsv);

        dom.countBody.addEventListener("input", e => {
            const input = e.target.closest("input[data-f]");
            if (!input) return;
            const pid = input.closest("tr").dataset.pid;
            const edit = edits.get(pid) || {};
            edit[input.dataset.f] = input.value;
            edits.set(pid, edit);
            recalcRow(pid);
        });

        dom.countBody.innerHTML = `<tr><td colspan="13" class="text-muted">載入中…</td></tr>`;

        try {
            const data = await API.getMany(["Products", "ProductionLog", "Shipment", "ProductCounts"]);

            products = data.Products || [];
            productions = data.ProductionLog || [];
            shipments = data.Shipment || [];
            counts = data.ProductCounts || [];

            render();

        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    // =========================
    // 計算
    // =========================
    const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
    const sum = (list, f) => list.reduce((s, x) => s + (Number(x[f]) || 0), 0);

    function savedOf(month, pid) {
        return counts.find(c => c.CountMonth === month && String(c.ProductID) === pid);
    }

    function buildRows() {

        const month = dom.qMonth.value || U.thisMonth();
        const prev = U.addMonth(month, -1);
        const start = month + "-01";
        const end = U.monthEnd(month);

        const inMonth = d => d && d >= start && d <= end;

        return products.map(p => {

            const pid = String(p.ID);
            const saved = savedOf(month, pid);
            const prevSaved = savedOf(prev, pid);

            const prods = productions.filter(x => String(x.ProductID) === pid);
            const prodDate = x => U.date(x.MfgDate || x.StartTime || x.CreatedAt);
            const monthProds = prods.filter(x => inMonth(prodDate(x)));
            const monthShips = shipments.filter(x => String(x.ProductID) === pid && inMonth(U.date(x.ShippingDate || x.CreatedAt)));

            // 最近製造日（月底前）、最近到期日（月初後仍有效的批次）
            const mfgDates = prods.map(prodDate).filter(d => d && d <= end).sort();
            const expDates = prods.filter(x => prodDate(x) <= end).map(x => U.date(x.ExpDate)).filter(d => d && d >= start).sort();

            const auto = {
                OpeningQty: saved?.OpeningQty ?? prevSaved?.CountedQty ?? prevSaved?.ExpectedQty ?? 0,
                OtherOutQty: saved?.OtherOutQty ?? 0,
                WasteQty: saved?.WasteQty ?? sum(monthProds, "NGQty"),
                CountedQty: saved?.CountedQty ?? ""
            };

            return {
                pid,
                product: p,
                saved,
                auto,
                ProducedQty: sum(monthProds, "ProducedQty"),
                ShippedQty: sum(monthShips, "ShippingQty"),
                LatestMfgDate: mfgDates[mfgDates.length - 1] || "",
                NearestExpDate: expDates[0] || ""
            };
        });
    }

    // 套用使用者輸入後的完整數值
    function values(r) {

        const e = edits.get(r.pid) || {};
        const pick = f => (f in e ? e[f] : r.auto[f]);

        const opening = num(pick("OpeningQty")) ?? 0;
        const otherOut = num(pick("OtherOutQty")) ?? 0;
        const waste = num(pick("WasteQty")) ?? 0;
        const counted = num(pick("CountedQty"));
        const expected = opening + r.ProducedQty - r.ShippedQty - otherOut - waste;

        return {
            OpeningQty: opening,
            ProducedQty: r.ProducedQty,
            ShippedQty: r.ShippedQty,
            OtherOutQty: otherOut,
            WasteQty: waste,
            ExpectedQty: round(expected),
            CountedQty: counted,
            DiffQty: counted === null ? null : round(counted - expected),
            UsedQty: round(counted === null ? r.ShippedQty + otherOut + waste : opening + r.ProducedQty - counted),
            LatestMfgDate: r.LatestMfgDate,
            NearestExpDate: r.NearestExpDate
        };
    }

    function round(v) {
        return Math.round(v * 100) / 100;
    }

    function isActive(r) {
        const v = values(r);
        return r.product.IsActive !== false && (v.OpeningQty || v.ProducedQty || v.ShippedQty || v.CountedQty || r.saved);
    }

    // =========================
    // 畫面
    // =========================
    function render() {
        rows = buildRows();
        dom.savedHint.classList.toggle("d-none", !counts.some(c => c.CountMonth === dom.qMonth.value));
        renderTable();
        renderTrend();
    }

    function visibleRows() {
        const kw = dom.qKeyword.value.trim();
        return rows.filter(r =>
            (!kw || App.like(r.product.ProductName, kw) || App.like(r.product.SKU, kw)) &&
            (!dom.qActiveOnly.checked || isActive(r) || edits.has(r.pid)));
    }

    function renderTable() {

        const esc = App.esc;
        const list = visibleRows();

        dom.countBody.innerHTML = list.length ? list.map(r => {

            const e = edits.get(r.pid) || {};
            const val = f => esc(f in e ? e[f] : (r.auto[f] ?? ""));
            const input = f => `<input type="number" step="any" class="form-control form-control-sm" data-f="${f}" value="${val(f)}">`;

            return `
<tr data-pid="${esc(r.pid)}">
    <td>${esc(r.product.ProductName || r.pid)}${r.product.IsActive === false ? ` <span class="badge bg-secondary">停用</span>` : ""}</td>
    <td>${esc(r.product.Unit || "")}</td>
    <td class="text-end">${input("OpeningQty")}</td>
    <td class="text-end">${U.qty(r.ProducedQty)}</td>
    <td class="text-end">${U.qty(r.ShippedQty)}</td>
    <td class="text-end">${input("OtherOutQty")}</td>
    <td class="text-end">${input("WasteQty")}</td>
    <td class="text-end calc" data-c="ExpectedQty"></td>
    <td class="text-end">${input("CountedQty")}</td>
    <td class="text-end" data-c="DiffQty"></td>
    <td class="text-end used" data-c="UsedQty"></td>
    <td>${esc(r.LatestMfgDate)}</td>
    <td>${U.expireBadge(r.NearestExpDate)}</td>
</tr>`;
        }).join("") : `<tr><td colspan="13" class="text-muted">沒有符合的產品（可關閉「只顯示有庫存或本月有異動」）</td></tr>`;

        list.forEach(r => recalcRow(r.pid, true));
        renderSummary();
    }

    function recalcRow(pid, skipSummary) {

        const r = rows.find(x => x.pid === pid);
        const tr = dom.countBody.querySelector(`tr[data-pid="${CSS.escape(pid)}"]`);
        if (!r || !tr) return;

        const v = values(r);

        tr.querySelector('[data-c="ExpectedQty"]').textContent = U.qty(v.ExpectedQty);
        tr.querySelector('[data-c="UsedQty"]').textContent = U.qty(v.UsedQty);

        const diff = tr.querySelector('[data-c="DiffQty"]');
        diff.textContent = v.DiffQty === null ? "" : (v.DiffQty > 0 ? "+" : "") + U.qty(v.DiffQty);
        diff.className = "text-end " + (v.DiffQty < 0 ? "text-danger fw-bold" : v.DiffQty > 0 ? "text-primary" : "");

        if (!skipSummary) renderSummary();
    }

    function renderSummary() {

        const vs = rows.map(values);
        const active = rows.filter(isActive);

        dom.sumProduced.textContent = U.qty(sum(vs, "ProducedQty"));
        dom.sumShipped.textContent = U.qty(sum(vs, "ShippedQty"));
        dom.sumUsed.textContent = U.qty(sum(vs, "UsedQty"));
        dom.sumExpiring.textContent = rows.filter(r => ["soon", "expired"].includes(U.expireState(r.NearestExpDate))).length;
        dom.sumCounted.textContent = `${active.filter(r => values(r).CountedQty !== null).length} / ${active.length}`;
    }

    function renderTrend() {

        const esc = App.esc;
        const metric = dom.trendMetric.value;
        const end = dom.qMonth.value || U.thisMonth();
        const months = Array.from({ length: 12 }, (_, i) => U.addMonth(end, i - 11));
        const ids = [...new Set(counts.filter(c => months.includes(c.CountMonth)).map(c => String(c.ProductID)))];

        dom.trendHead.innerHTML = `<tr><th>產品</th>${months.map(m => `<th class="text-end">${m.slice(2).replace("-", "/")}</th>`).join("")}<th class="text-end">月平均</th></tr>`;

        if (!ids.length) {
            dom.trendBody.innerHTML = `<tr><td colspan="14" class="text-muted">尚未儲存任何月盤點</td></tr>`;
            return;
        }

        dom.trendBody.innerHTML = ids.map(pid => {
            const p = products.find(x => String(x.ID) === pid);
            const cells = months.map(m => savedOf(m, pid)?.[metric]);
            const nums = cells.filter(v => v !== null && v !== undefined && v !== "");
            const avg = nums.length ? nums.reduce((s, v) => s + Number(v), 0) / nums.length : null;
            return `<tr><td>${esc(p?.ProductName || pid)}</td>${cells.map(v => `<td class="text-end">${U.qty(v)}</td>`).join("")}<td class="text-end fw-bold">${U.qty(avg)}</td></tr>`;
        }).join("");
    }

    // =========================
    // 儲存
    // =========================
    async function save() {

        const month = dom.qMonth.value;
        if (!month) return alert("請選擇月份");

        const targets = rows.filter(r => isActive(r) || edits.has(r.pid));
        if (!targets.length) return alert("本月沒有需要盤點的產品");

        const uncounted = targets.filter(r => values(r).CountedQty === null).length;
        if (uncounted && !confirm(`還有 ${uncounted} 項產品沒有填實盤數量，仍要儲存嗎？`)) return;

        const ops = [];

        targets.forEach(r => {

            const data = {
                CountMonth: month,
                ProductID: Number(r.pid),
                ProductName: r.product.ProductName || "",
                Unit: r.product.Unit || "",
                ...values(r),
                CountedQty: values(r).CountedQty ?? ""
            };

            ops.push(r.saved
                ? { action: "update", table: "ProductCounts", id: r.saved.ID, data }
                : { action: "insert", table: "ProductCounts", data });

            if (dom.syncStock.checked && data.CountedQty !== "")
                ops.push({ action: "update", table: "Products", id: r.product.ID, data: { CurrentStock: data.CountedQty } });
        });

        try {
            await API.batch(ops);
            alert(`✅ ${month} 盤點已儲存（${targets.length} 項產品）`);

            edits.clear();

            // 背景重新讀取
            const data = await API.getMany(["ProductCounts", "Products"]);
            counts = data.ProductCounts || counts;
            products = data.Products || products;
            render();

        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    function exportCsv() {

        const head = ["月份", "產品", "單位", "期初", "本月製作", "本月出貨", "其他出庫", "損耗", "應有庫存", "實盤", "盤差", "本月使用量", "最近製造日", "最近到期日"];
        const month = dom.qMonth.value;

        const body = visibleRows().map(r => {
            const v = values(r);
            return [month, r.product.ProductName, r.product.Unit, v.OpeningQty, v.ProducedQty, v.ShippedQty, v.OtherOutQty, v.WasteQty,
                v.ExpectedQty, v.CountedQty ?? "", v.DiffQty ?? "", v.UsedQty, v.LatestMfgDate, v.NearestExpDate];
        });

        U.downloadCsv(`產品月盤點_${month}.csv`, [head].concat(body));
    }

    return { init };
})();
