window.Pages = window.Pages || {};

// =========================================================
// 原物料進貨（MaterialPurchases）與月盤點（MaterialCounts）
//   進貨：可同時記入支出表、更新原料成本價與庫存
//   月盤點：本月用量 = 期初 + 本月進貨 - 實盤
// =========================================================
Pages.MaterialStock = (() => {

    "use strict";

    const U = StockUtil;
    const dom = {};
    const FIELDS = ["PurchaseDate", "MaterialID", "Supplier", "Quantity", "Unit", "TotalPrice", "UnitPrice",
        "BatchNo", "MfgDate", "ExpDate", "InvoiceNo", "Note"];

    let materials = [];
    let purchases = [];
    let counts = [];
    let companies = [];
    let current = null;
    let listCache = [];
    let countRows = [];
    let countEdits = new Map();

    const canProduct = () => Auth.hasPermission(22);
    const canFinance = () => Auth.hasPermission(24);

    async function init() {

        FIELDS.concat([
            "qMonth", "qMaterial", "qKeyword", "qAllMonths", "listBody", "listSummary",
            "sumAmount", "sumCount", "sumUsedCost", "sumExpiring",
            "purchaseForm", "formCard", "formTitle", "editHint", "priceChange", "expHint", "supplierList",
            "createOptions", "optUpdateMaterial", "optExpense", "optExpenseWrap",
            "btnCreate", "btnUpdate", "btnDelete", "btnClear",
            "cKeyword", "cActiveOnly", "countSavedHint", "cSyncStock", "btnCountCsv", "btnCountSave", "countBody"
        ]).forEach(id => dom[id] = document.getElementById(id));

        dom.qMonth.value = U.thisMonth();

        if (!canFinance()) dom.optExpenseWrap.classList.add("d-none");
        if (!canProduct()) {
            dom.optUpdateMaterial.checked = false;
            dom.optUpdateMaterial.disabled = true;
            dom.cSyncStock.checked = false;
            dom.cSyncStock.disabled = true;
        }

        bindEvents();
        openCreate();

        dom.listBody.innerHTML = `<tr><td colspan="9" class="text-muted">載入中…</td></tr>`;

        try {
            const data = await API.getMany(["Material", "MaterialPurchases", "MaterialCounts", "Companies"]);

            materials = data.Material || [];
            purchases = data.MaterialPurchases || [];
            counts = data.MaterialCounts || [];
            companies = data.Companies || [];

            renderMaterialOptions();
            dom.supplierList.innerHTML = companies.map(c => `<option value="${App.esc(c.CompanyName)}">`).join("");

            renderAll();

        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    function bindEvents() {

        dom.qMonth.addEventListener("change", () => { countEdits.clear(); renderAll(); });
        ["qMaterial", "qAllMonths"].forEach(id => dom[id].addEventListener("change", renderPurchases));
        dom.qKeyword.addEventListener("input", renderPurchases);

        dom.listBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-index]");
            if (tr) loadDetail(listCache[tr.dataset.index]);
        });

        dom.MaterialID.addEventListener("change", onMaterialChange);
        dom.Quantity.addEventListener("input", () => calcPrice("total"));
        dom.TotalPrice.addEventListener("input", () => calcPrice("total"));
        dom.UnitPrice.addEventListener("input", () => calcPrice("unit"));
        dom.MfgDate.addEventListener("change", autoExpire);
        dom.ExpDate.addEventListener("input", () => dom.ExpDate.dataset.manual = "1");
        dom.PurchaseDate.addEventListener("change", showPriceChange);

        dom.btnCreate.addEventListener("click", () => save(true));
        dom.btnUpdate.addEventListener("click", () => save(false));
        dom.btnDelete.addEventListener("click", remove);
        dom.btnClear.addEventListener("click", openCreate);

        // 盤點
        dom.cKeyword.addEventListener("input", renderCounts);
        dom.cActiveOnly.addEventListener("change", renderCounts);
        dom.btnCountSave.addEventListener("click", saveCounts);
        dom.btnCountCsv.addEventListener("click", exportCounts);
        dom.countBody.addEventListener("input", e => {
            const input = e.target.closest("input[data-f]");
            if (!input) return;
            const id = input.closest("tr").dataset.mid;
            const edit = countEdits.get(id) || {};
            edit[input.dataset.f] = input.value;
            countEdits.set(id, edit);
            recalcCount(id);
        });
    }

    // =========================
    // 共用
    // =========================
    const num = v => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
    const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

    function findMaterial(id) {
        return materials.find(m => String(m.ID) === String(id));
    }

    function materialName(p) {
        return findMaterial(p.MaterialID)?.MaterialName || p.MaterialName || "（已刪除原料）";
    }

    // 某原料在某日（含）之前最近一次進貨
    function lastPurchase(materialId, beforeDate, exceptId) {
        return purchases
            .filter(p => String(p.MaterialID) === String(materialId) && p.ID !== exceptId &&
                (!beforeDate || U.date(p.PurchaseDate) <= beforeDate) && num(p.UnitPrice) !== null)
            .sort((a, b) => U.date(b.PurchaseDate).localeCompare(U.date(a.PurchaseDate)) || b.ID - a.ID)[0];
    }

    function renderMaterialOptions() {

        const active = materials.filter(m => m.IsActive !== false || (current && String(current.MaterialID) === String(m.ID)));
        const opts = active
            .sort((a, b) => String(a.MaterialName).localeCompare(String(b.MaterialName), "zh-Hant"))
            .map(m => `<option value="${m.ID}">${App.esc(m.MaterialName)}${m.Unit ? `（${App.esc(m.Unit)}）` : ""}</option>`).join("");

        const keep = dom.MaterialID.value;
        dom.MaterialID.innerHTML = `<option value="">${materials.length ? "請選擇原料" : "請先到「原料管理」新增原料"}</option>` + opts;
        dom.MaterialID.value = keep;

        const keepQ = dom.qMaterial.value;
        dom.qMaterial.innerHTML = `<option value="">全部原料</option>` + opts;
        dom.qMaterial.value = keepQ;
    }

    function renderAll() {
        renderPurchases();
        buildCounts();
        renderCounts();
    }

    // =========================
    // 進貨紀錄
    // =========================
    function renderPurchases() {

        const esc = App.esc;
        const month = dom.qMonth.value;
        const mid = dom.qMaterial.value;
        const kw = dom.qKeyword.value.trim();

        const monthList = purchases.filter(p => U.date(p.PurchaseDate).startsWith(month));
        dom.sumAmount.textContent = U.money(monthList.reduce((s, p) => s + (num(p.TotalPrice) || 0), 0));
        dom.sumCount.textContent = monthList.length;

        listCache = purchases
            .filter(p =>
                (dom.qAllMonths.checked || U.date(p.PurchaseDate).startsWith(month)) &&
                (!mid || String(p.MaterialID) === mid) &&
                (!kw || [p.Supplier, p.BatchNo, p.Note, p.InvoiceNo, materialName(p)].some(v => App.like(v, kw))))
            .sort((a, b) => U.date(b.PurchaseDate).localeCompare(U.date(a.PurchaseDate)) || b.ID - a.ID);

        const total = listCache.reduce((s, p) => s + (num(p.TotalPrice) || 0), 0);
        dom.listSummary.textContent = `${listCache.length} 筆，合計 ${U.money(total)}`;

        dom.listBody.innerHTML = listCache.length ? listCache.map((p, i) => `
<tr class="clickable ${current && current.ID === p.ID ? "table-primary" : ""}" data-index="${i}">
    <td>${esc(U.date(p.PurchaseDate))}</td>
    <td>${esc(materialName(p))}</td>
    <td>${esc(p.Supplier || "")}</td>
    <td class="text-end">${U.qty(p.Quantity)} ${esc(p.Unit || "")}</td>
    <td class="text-end">${U.money(p.UnitPrice, 2)}</td>
    <td class="text-end">${U.money(p.TotalPrice)}</td>
    <td>${esc(p.BatchNo || "")}</td>
    <td>${esc(U.date(p.MfgDate))}</td>
    <td>${U.expireBadge(U.date(p.ExpDate))}</td>
</tr>`).join("") : `<tr><td colspan="9" class="text-muted">沒有進貨紀錄</td></tr>`;
    }

    function onMaterialChange() {

        const m = findMaterial(dom.MaterialID.value);

        if (m && (!dom.Unit.value || !current)) dom.Unit.value = m.Unit || "";

        autoExpire();
        showPriceChange();
    }

    // 有製造日與原料保存天數 → 自動推算有效期限
    function autoExpire() {

        const m = findMaterial(dom.MaterialID.value);
        const days = num(m?.ExpireDays);

        dom.expHint.textContent = days ? `保存 ${days} 天` : "";

        if (days && dom.MfgDate.value && !dom.ExpDate.dataset.manual)
            dom.ExpDate.value = U.addDays(dom.MfgDate.value, days);
    }

    function calcPrice(from) {

        const q = num(dom.Quantity.value);

        if (from === "total") {
            const t = num(dom.TotalPrice.value);
            dom.UnitPrice.value = q && t !== null ? round(t / q, 4) : "";
        } else {
            const u = num(dom.UnitPrice.value);
            if (q && u !== null) dom.TotalPrice.value = round(u * q, 2);
        }

        showPriceChange();
    }

    // 與上一次進貨單價比較
    function showPriceChange() {

        const u = num(dom.UnitPrice.value);
        const last = dom.MaterialID.value && lastPurchase(dom.MaterialID.value, dom.PurchaseDate.value || null, current?.ID);

        if (!last || u === null) {
            dom.priceChange.innerHTML = last ? `上次 ${U.money(last.UnitPrice, 2)}` : "";
            return;
        }

        const r = (u - num(last.UnitPrice)) / num(last.UnitPrice);
        const cls = r > 0 ? "text-danger" : r < 0 ? "text-success" : "text-muted";

        dom.priceChange.innerHTML = `上次 ${U.money(last.UnitPrice, 2)}（${App.esc(U.date(last.PurchaseDate))}）<br><span class="${cls} fw-bold">${r > 0 ? "▲" : r < 0 ? "▼" : ""} ${U.pct(r)}</span>`;
    }

    function setMode(edit) {
        dom.formTitle.textContent = edit ? "✏️ 修改進貨" : "➕ 新增進貨";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.createOptions.classList.toggle("d-none", edit);
        dom.btnCreate.disabled = edit;
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    function openCreate() {
        current = null;
        dom.purchaseForm.reset();
        delete dom.ExpDate.dataset.manual;
        dom.PurchaseDate.value = U.today();
        dom.optUpdateMaterial.checked = canProduct();
        dom.optExpense.checked = canFinance();
        dom.priceChange.innerHTML = "";
        dom.expHint.textContent = "";
        setMode(false);
        renderPurchases();
    }

    function loadDetail(p) {

        if (!p) return;

        current = p;
        renderMaterialOptions();

        FIELDS.forEach(f => {
            dom[f].value = ["PurchaseDate", "MfgDate", "ExpDate"].includes(f) ? U.date(p[f]) : (p[f] ?? "");
        });
        dom.ExpDate.dataset.manual = "1";

        setMode(true);
        showPriceChange();
        renderPurchases();

        dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function formData() {

        const m = findMaterial(dom.MaterialID.value);
        const supplier = dom.Supplier.value.trim();
        const company = companies.find(c => c.CompanyName === supplier);

        return {
            PurchaseDate: dom.PurchaseDate.value,
            MaterialID: num(dom.MaterialID.value),
            MaterialName: m?.MaterialName || "",
            Category: m?.Category || "",
            Supplier: supplier,
            CompanyId: company ? company.ID : "",
            Quantity: num(dom.Quantity.value),
            Unit: dom.Unit.value.trim(),
            TotalPrice: num(dom.TotalPrice.value),
            UnitPrice: num(dom.UnitPrice.value),
            BatchNo: dom.BatchNo.value.trim(),
            MfgDate: dom.MfgDate.value,
            ExpDate: dom.ExpDate.value,
            InvoiceNo: dom.InvoiceNo.value.trim(),
            Note: dom.Note.value.trim()
        };
    }

    function expenseData(d) {
        return {
            ExpenseDate: d.PurchaseDate,
            Category: "食材",
            ItemName: `${d.MaterialName} ${U.qty(d.Quantity)}${d.Unit}`,
            Amount: d.TotalPrice,
            Vendor: d.Supplier,
            CompanyId: d.CompanyId,
            InvoiceNo: d.InvoiceNo
        };
    }

    async function save(isCreate) {

        const d = formData();

        if (!d.PurchaseDate || !d.MaterialID || !d.Quantity || d.TotalPrice === null) {
            alert("請輸入進貨日期、原料、數量與總價");
            return;
        }

        if (d.UnitPrice === null) d.UnitPrice = round(d.TotalPrice / d.Quantity, 4);

        const ops = [];

        if (isCreate) {

            if (dom.optExpense.checked && canFinance()) {
                ops.push({ action: "insert", table: "Expenses", data: { ...expenseData(d), IsPaid: true, Note: "原物料進貨自動建立" } });
                d.ExpenseId = "$0.ID";
            }

            ops.push({ action: "insert", table: "MaterialPurchases", data: d });

            const m = findMaterial(d.MaterialID);
            if (dom.optUpdateMaterial.checked && canProduct() && m) {
                ops.push({
                    action: "update", table: "Material", id: m.ID,
                    data: { CostPrice: d.UnitPrice, CurrentStock: round((num(m.CurrentStock) || 0) + d.Quantity) }
                });
            }

        } else {

            ops.push({ action: "update", table: "MaterialPurchases", id: current.ID, data: d });

            // 連動的支出一併修改
            if (current.ExpenseId && canFinance())
                ops.push({ action: "update", table: "Expenses", id: current.ExpenseId, data: expenseData(d) });
        }

        try {
            await API.batch(ops);

            alert(isCreate
                ? "🎉 進貨已新增" + (d.ExpenseId ? "，並記入支出表" : "")
                : "✅ 進貨已更新");

            await reload();

            if (isCreate) openCreate();
            else loadDetail(purchases.find(p => p.ID === current.ID));

        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        if (!confirm(`確定刪除 ${U.date(current.PurchaseDate)}「${materialName(current)}」${U.money(current.TotalPrice)} 的進貨紀錄？`)) return;

        const ops = [{ action: "remove", table: "MaterialPurchases", id: current.ID }];

        if (current.ExpenseId && canFinance() && confirm("這筆進貨有記入支出表，要一併刪除支出紀錄嗎？"))
            ops.push({ action: "remove", table: "Expenses", id: current.ExpenseId });

        try {
            await API.batch(ops);
            alert("🗑️ 已刪除（原料庫存請於月盤點時更正）");
            await reload();
            openCreate();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    // 背景重新讀取
    async function reload() {
        const data = await API.getMany(["Material", "MaterialPurchases", "MaterialCounts"]);
        materials = data.Material || materials;
        purchases = data.MaterialPurchases || purchases;
        counts = data.MaterialCounts || counts;
        renderMaterialOptions();
        renderAll();
    }

    // =========================
    // 月盤點
    // =========================
    function savedCount(month, mid) {
        return counts.find(c => c.CountMonth === month && String(c.MaterialID) === mid);
    }

    function buildCounts() {

        const month = dom.qMonth.value || U.thisMonth();
        const prev = U.addMonth(month, -1);
        const start = month + "-01";
        const end = U.monthEnd(month);

        dom.countSavedHint.classList.toggle("d-none", !counts.some(c => c.CountMonth === month));

        countRows = materials.map(m => {

            const mid = String(m.ID);
            const saved = savedCount(month, mid);
            const prevSaved = savedCount(prev, mid);
            const mine = purchases.filter(p => String(p.MaterialID) === mid);
            const monthBuys = mine.filter(p => { const d = U.date(p.PurchaseDate); return d >= start && d <= end; });

            const qty = monthBuys.reduce((s, p) => s + (num(p.Quantity) || 0), 0);
            const amount = monthBuys.reduce((s, p) => s + (num(p.TotalPrice) || 0), 0);
            const last = lastPurchase(mid, end);
            const latestPrice = num(last?.UnitPrice) ?? num(m.CostPrice) ?? 0;
            const avgPrice = qty ? amount / qty : latestPrice;

            const exps = mine.filter(p => U.date(p.PurchaseDate) <= end).map(p => U.date(p.ExpDate)).filter(d => d && d >= start).sort();

            return {
                mid,
                material: m,
                saved,
                PurchasedQty: round(qty),
                PurchasedAmount: round(amount),
                AvgUnitPrice: round(avgPrice, 4),
                LatestPrice: latestPrice,
                NearestExpDate: exps[0] || "",
                auto: {
                    OpeningQty: saved?.OpeningQty ?? prevSaved?.CountedQty ?? Math.max(0, round((num(m.CurrentStock) || 0) - qty)),
                    CountedQty: saved?.CountedQty ?? ""
                }
            };
        });
    }

    function countValues(r) {

        const e = countEdits.get(r.mid) || {};
        const pick = f => (f in e ? e[f] : r.auto[f]);

        const opening = num(pick("OpeningQty")) ?? 0;
        const counted = num(pick("CountedQty"));
        const used = counted === null ? null : round(opening + r.PurchasedQty - counted);

        return {
            OpeningQty: opening,
            PurchasedQty: r.PurchasedQty,
            PurchasedAmount: r.PurchasedAmount,
            CountedQty: counted,
            UsedQty: used,
            AvgUnitPrice: r.AvgUnitPrice,
            UsedCost: used === null ? null : round(used * r.AvgUnitPrice),
            StockValue: counted === null ? null : round(counted * r.LatestPrice),
            NearestExpDate: r.NearestExpDate
        };
    }

    function countActive(r) {
        const v = countValues(r);
        return r.material.IsActive !== false && (v.OpeningQty || v.PurchasedQty || v.CountedQty || r.saved);
    }

    function visibleCounts() {
        const kw = dom.cKeyword.value.trim();
        return countRows.filter(r =>
            (!kw || App.like(r.material.MaterialName, kw) || App.like(r.material.Category, kw)) &&
            (!dom.cActiveOnly.checked || countActive(r) || countEdits.has(r.mid)));
    }

    function renderCounts() {

        const esc = App.esc;
        const list = visibleCounts();

        dom.countBody.innerHTML = list.length ? list.map(r => {
            const e = countEdits.get(r.mid) || {};
            const val = f => esc(f in e ? e[f] : (r.auto[f] ?? ""));
            const input = f => `<input type="number" step="any" class="form-control form-control-sm" data-f="${f}" value="${val(f)}">`;
            return `
<tr data-mid="${esc(r.mid)}">
    <td>${esc(r.material.MaterialName)}</td>
    <td>${esc(r.material.Unit || "")}</td>
    <td class="text-end">${input("OpeningQty")}</td>
    <td class="text-end">${U.qty(r.PurchasedQty)}</td>
    <td class="text-end">${U.money(r.PurchasedAmount)}</td>
    <td class="text-end">${input("CountedQty")}</td>
    <td class="text-end used" data-c="UsedQty"></td>
    <td class="text-end">${U.money(r.AvgUnitPrice, 2)}</td>
    <td class="text-end calc" data-c="UsedCost"></td>
    <td class="text-end" data-c="StockValue"></td>
    <td>${U.expireBadge(r.NearestExpDate)}</td>
</tr>`;
        }).join("") : `<tr><td colspan="11" class="text-muted">沒有符合的原料</td></tr>`;

        list.forEach(r => recalcCount(r.mid, true));
        renderCountSummary();
    }

    function recalcCount(mid, skipSummary) {

        const r = countRows.find(x => x.mid === mid);
        const tr = dom.countBody.querySelector(`tr[data-mid="${CSS.escape(mid)}"]`);
        if (!r || !tr) return;

        const v = countValues(r);
        tr.querySelector('[data-c="UsedQty"]').textContent = U.qty(v.UsedQty);
        tr.querySelector('[data-c="UsedCost"]').textContent = U.money(v.UsedCost);
        tr.querySelector('[data-c="StockValue"]').textContent = U.money(v.StockValue);

        if (!skipSummary) renderCountSummary();
    }

    function renderCountSummary() {
        const vs = countRows.map(countValues);
        dom.sumUsedCost.textContent = U.money(vs.reduce((s, v) => s + (v.UsedCost || 0), 0));
        dom.sumExpiring.textContent = countRows.filter(r => ["soon", "expired"].includes(U.expireState(r.NearestExpDate))).length;
    }

    async function saveCounts() {

        const month = dom.qMonth.value;
        if (!month) return alert("請選擇月份");

        const targets = countRows.filter(r => countActive(r) || countEdits.has(r.mid));
        if (!targets.length) return alert("本月沒有需要盤點的原料");

        const uncounted = targets.filter(r => countValues(r).CountedQty === null).length;
        if (uncounted && !confirm(`還有 ${uncounted} 項原料沒有填實盤數量，仍要儲存嗎？`)) return;

        const ops = [];

        targets.forEach(r => {
            const v = countValues(r);
            const data = {
                CountMonth: month,
                MaterialID: Number(r.mid),
                MaterialName: r.material.MaterialName,
                Unit: r.material.Unit || "",
                ...v,
                CountedQty: v.CountedQty ?? ""
            };

            ops.push(r.saved
                ? { action: "update", table: "MaterialCounts", id: r.saved.ID, data }
                : { action: "insert", table: "MaterialCounts", data });

            if (dom.cSyncStock.checked && v.CountedQty !== null)
                ops.push({ action: "update", table: "Material", id: r.material.ID, data: { CurrentStock: v.CountedQty } });
        });

        try {
            await API.batch(ops);
            alert(`✅ ${month} 原物料盤點已儲存（${targets.length} 項）`);
            countEdits.clear();
            await reload();
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    function exportCounts() {

        const month = dom.qMonth.value;
        const head = ["月份", "原料", "單位", "期初", "本月進貨", "進貨金額", "實盤", "本月用量", "平均單價", "用量成本", "庫存價值", "最近到期日"];

        const body = visibleCounts().map(r => {
            const v = countValues(r);
            return [month, r.material.MaterialName, r.material.Unit, v.OpeningQty, v.PurchasedQty, v.PurchasedAmount,
                v.CountedQty ?? "", v.UsedQty ?? "", v.AvgUnitPrice, v.UsedCost ?? "", v.StockValue ?? "", v.NearestExpDate];
        });

        U.downloadCsv(`原物料盤點_${month}.csv`, [head].concat(body));
    }

    return { init };
})();
