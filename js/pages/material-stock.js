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
            "createOptions", "btnUpdate", "btnDelete", "btnClear",
            "btnInvOpen", "invoiceCard", "btnInvClose", "invCount", "invSupplier", "invDate", "invNo", "invSupplierHint", "invMatList", "invRows", "btnInvAddRow",
            "invTaxRate", "invNote", "invSub", "invTax", "invTotal", "invOptExpense", "invExpenseWrap", "invOptStock", "invStockWrap", "btnInvSubmit", "btnInvClear", "invMsg",
            "cKeyword", "cActiveOnly", "countSavedHint", "cSyncStock", "btnCountCsv", "btnCountSave", "countBody"
        ]).forEach(id => dom[id] = document.getElementById(id));

        dom.qMonth.value = U.thisMonth();

        if (!canFinance()) { dom.invExpenseWrap.classList.add("d-none"); dom.invOptExpense.checked = false; }
        if (!canProduct()) {
            dom.invStockWrap.classList.add("d-none");
            dom.invOptStock.checked = false;
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
            renderInvMatList();
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

        dom.btnUpdate.addEventListener("click", save);

        // 整張發票進貨
        dom.btnInvOpen.addEventListener("click", openInvoice);
        dom.btnInvClose.addEventListener("click", () => dom.invoiceCard.classList.add("d-none"));
        dom.btnInvAddRow.addEventListener("click", () => addInvRow(true));
        dom.btnInvClear.addEventListener("click", () => { if (confirm("清空這一家的內容重填？")) resetInvoice(); });
        dom.btnInvSubmit.addEventListener("click", submitInvoice);
        dom.invSupplier.addEventListener("input", onSupplierChange);
        dom.invSupplier.addEventListener("change", onSupplierChange);
        dom.invTaxRate.addEventListener("input", refreshInvTotals);
        dom.invRows.addEventListener("input", onInvInput);
        dom.invRows.addEventListener("change", onInvInput);
        dom.invRows.addEventListener("click", onInvClick);
        dom.invRows.addEventListener("keydown", e => {
            // 最後一列最後一格按 Enter → 新增一列繼續輸入
            if (e.key === "Enter" && e.target.dataset.f === "exp" && Number(e.target.closest("tr").dataset.i) === inv.length - 1) { e.preventDefault(); addInvRow(true); }
        });
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

        // 下拉選單加上打字搜尋（TomSelect）
        [dom.MaterialID, dom.qMaterial].forEach(sel => {
            if (!window.TomSelect) return;
            if (!sel.tomselect) new TomSelect(sel, { maxOptions: 2000, score: MaterialQuick.fuzzy.score, allowEmptyOption: true, placeholder: "打字搜尋原料" });
            else { sel.tomselect.sync(); sel.tomselect.setValue(sel.value, true); }
        });
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
        dom.formTitle.textContent = edit ? "✏️ 修改進貨" : "✏️ 修改進貨（先點選左側明細）";
        dom.editHint.classList.toggle("d-none", !edit);
        dom.createOptions.classList.toggle("d-none", edit);
        dom.btnUpdate.disabled = !edit;
        dom.btnDelete.disabled = !edit;
    }

    // 清除表單（新增請用上方的整張發票進貨）
    function openCreate() {
        current = null;
        dom.purchaseForm.reset();
        dom.MaterialID.tomselect?.clear(true);
        delete dom.ExpDate.dataset.manual;
        dom.PurchaseDate.value = U.today();
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
        dom.MaterialID.tomselect?.setValue(dom.MaterialID.value, true);

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

    // 同一張發票（共用一筆支出）的其他進貨
    const siblingsOf = p => (p.ExpenseId ? purchases.filter(x => String(x.ExpenseId) === String(p.ExpenseId) && x.ID !== p.ID) : []);
    const withTax = x => (num(x.TotalPrice) || 0) * (1 + (num(x.TaxRate) || 0) / 100);

    async function save() {

        if (!current) return alert("請先點選左側的進貨明細（新增請按上方「🧾 新增進貨」）");

        const d = formData();

        if (!d.PurchaseDate || !d.MaterialID || !d.Quantity || d.TotalPrice === null) {
            alert("請輸入進貨日期、原料、數量與總價");
            return;
        }

        if (d.UnitPrice === null) d.UnitPrice = round(d.TotalPrice / d.Quantity, 4);

        const ops = [{ action: "update", table: "MaterialPurchases", id: current.ID, data: d }];

        // 連動的支出一併修改：整張發票共用一筆支出時，金額 = 這張發票所有品項（含稅）的合計
        if (current.ExpenseId && canFinance()) {
            const sibs = siblingsOf(current);
            const rate = num(current.TaxRate) || 0;

            ops.push({
                action: "update", table: "Expenses", id: current.ExpenseId,
                data: sibs.length
                    ? { Amount: round(sibs.reduce((s, x) => s + withTax(x), 0) + d.TotalPrice * (1 + rate / 100)) }
                    : { ...expenseData(d), Amount: round(d.TotalPrice * (1 + rate / 100)) }
            });
        }

        try {
            await API.batch(ops);

            alert("✅ 進貨已更新");

            await reload();
            loadDetail(purchases.find(p => p.ID === current.ID));

        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function remove() {

        if (!current) return;

        const sibs = siblingsOf(current);

        if (!confirm(`確定刪除 ${U.date(current.PurchaseDate)}「${materialName(current)}」${U.money(current.TotalPrice)} 的進貨紀錄？${sibs.length && canFinance() ? "\n\n這張發票還有其他品項，支出表的金額會一併減少這一項。" : ""}`)) return;

        const ops = [{ action: "remove", table: "MaterialPurchases", id: current.ID }];

        if (current.ExpenseId && canFinance()) {
            if (sibs.length) ops.push({ action: "update", table: "Expenses", id: current.ExpenseId, data: { Amount: round(sibs.reduce((s, x) => s + withTax(x), 0)) } });
            else if (confirm("這筆進貨有記入支出表，要一併刪除支出紀錄嗎？")) ops.push({ action: "remove", table: "Expenses", id: current.ExpenseId });
        }

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
        renderInvMatList();
        renderAll();
    }


    // =========================
    // 整張發票進貨：先選供應商 → 逐項輸入原料（自動帶入上次價格、顯示漲跌）→ 稅金 / 發票號碼 / 備註 → 一次送出
    // =========================
    let inv = [];

    const blankRow = () => ({ mid: "", name: "", qty: "", unit: "", unitPrice: "", total: "", batch: "", mfg: "", exp: "", expManual: false, totalManual: false, priceTouched: false, updateCost: false, costTouched: false });

    const packagesOf = m => { try { const a = JSON.parse((m && m.PackagesJson) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
    // 有多種包裝規格的原料，單價由「計價用規格」決定，不能直接被進貨價蓋掉
    const hasPackages = m => !!m && (packagesOf(m).length > 0 || (num(m.PackageWeight) > 0 && num(m.PackagePrice) > 0));

    const matByName = name => {
        const n = String(name || "").trim();
        return n ? (materials.find(m => String(m.MaterialName).trim() === n && m.IsActive !== false) || materials.find(m => String(m.MaterialName).trim() === n)) : null;
    };

    const invSupplier = () => dom.invSupplier.value.trim();

    // 這個原料最近一次進貨：優先同一家供應商，沒有再用任何供應商
    function lastBuy(mid, supplier) {
        const mine = purchases.filter(p => String(p.MaterialID) === String(mid) && num(p.UnitPrice) !== null);
        const same = supplier ? mine.filter(p => String(p.Supplier || "").trim() === supplier) : [];
        return (same.length ? same : mine).sort((a, b) => U.date(b.PurchaseDate).localeCompare(U.date(a.PurchaseDate)) || b.ID - a.ID)[0];
    }

    function defaultPrice(m) {
        const last = lastBuy(m.ID, invSupplier());
        return last ? num(last.UnitPrice) : num(m.CostPrice);
    }

    function renderInvMatList() {
        dom.invMatList.innerHTML = materials
            .filter(m => m.IsActive !== false)
            .sort((a, b) => String(a.MaterialName).localeCompare(String(b.MaterialName), "zh-Hant"))
            .map(m => `<option value="${App.esc(m.MaterialName)}">${App.esc([m.Category, m.Unit, m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? "成本 $" + m.CostPrice : ""].filter(Boolean).join("　"))}</option>`)
            .join("");
    }

    function invRowHtml(r, i) {
        return `<tr data-i="${i}">
    <td><div class="input-group input-group-sm"><input class="form-control inv-name" list="invMatList" data-f="name" value="${App.esc(r.name)}" placeholder="打字搜尋原料" autocomplete="off">
        <button type="button" class="btn btn-outline-primary d-none" data-act="matadd" title="這個原料還沒登入原料庫，點這裡新增">＋ 新增</button></div></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm inv-num" data-f="qty" value="${App.esc(r.qty)}"></td>
    <td><input class="form-control form-control-sm" style="width:60px" data-f="unit" value="${App.esc(r.unit)}"></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm inv-num" data-f="unitPrice" value="${App.esc(r.unitPrice)}"></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm inv-num" data-f="total" value="${App.esc(r.total)}"></td>
    <td class="small" data-c="cmp"></td>
    <td><input class="form-control form-control-sm" style="width:90px" data-f="batch" value="${App.esc(r.batch)}"></td>
    <td><input type="date" class="form-control form-control-sm inv-date" data-f="mfg" value="${App.esc(r.mfg)}"></td>
    <td><input type="date" class="form-control form-control-sm inv-date" data-f="exp" value="${App.esc(r.exp)}"><div class="small text-muted" data-c="expHint"></div></td>
    <td class="text-center"><input type="checkbox" class="form-check-input" data-f="updateCost" ${r.updateCost ? "checked" : ""}><div class="small text-muted" data-c="costHint"></div></td>
    <td><button type="button" class="btn btn-sm btn-link text-danger p-0" data-act="del" title="刪除這一列">✕</button></td>
</tr>`;
    }

    function renderInvRows() {
        if (!inv.length) inv.push(blankRow());
        dom.invRows.innerHTML = inv.map(invRowHtml).join("");
        inv.forEach((_, i) => refreshInvRow(i));
        refreshInvTotals();
    }

    function addInvRow(focus) {
        inv.push(blankRow());
        dom.invRows.insertAdjacentHTML("beforeend", invRowHtml(inv[inv.length - 1], inv.length - 1));
        refreshInvRow(inv.length - 1);
        if (focus) dom.invRows.querySelector(`tr[data-i="${inv.length - 1}"] [data-f=name]`)?.focus();
    }

    const invCell = (i, f) => dom.invRows.querySelector(`tr[data-i="${i}"] [data-f="${f}"]`);

    // 把狀態寫回畫面（正在輸入的那一格不動）
    function setInvCell(i, f, v) {
        const el = invCell(i, f);
        if (el && document.activeElement !== el) el.value = v;
    }

    function refreshInvRow(i) {

        const r = inv[i];
        const tr = dom.invRows.querySelector(`tr[data-i="${i}"]`);
        if (!tr) return;

        const m = r.mid ? findMaterial(r.mid) : null;

        setInvCell(i, "unit", r.unit);
        setInvCell(i, "unitPrice", r.unitPrice);
        setInvCell(i, "total", r.total);
        setInvCell(i, "exp", r.exp);

        tr.querySelector('[data-act="matadd"]').classList.toggle("d-none", !(r.name.trim() && !m));

        // 與上次比較：同一家供應商上次的價格（沒有就用任何一家），都沒有就跟成本表比
        const u = num(r.unitPrice);
        let cmp = "";

        if (m && u !== null) {
            const last = lastBuy(m.ID, invSupplier());
            const base = last ? num(last.UnitPrice) : num(m.CostPrice);

            if (base) {
                const diff = (u - base) / base;
                const cls = Math.abs(diff) < 0.0005 ? "text-muted" : diff > 0 ? "text-danger" : "text-success";
                cmp = `<span class="text-muted">${last ? "上次" : "成本表"} ${U.money(base, 2)}${last ? `（${App.esc(U.date(last.PurchaseDate).slice(5))}${last.Supplier ? " " + App.esc(last.Supplier) : ""}）` : ""}</span> <b class="${cls}">${Math.abs(diff) < 0.0005 ? "持平" : (diff > 0 ? "▲ " : "▼ ") + U.pct(Math.abs(diff)).replace("+", "")}</b>`;
            } else cmp = `<span class="text-muted">第一次進貨</span>`;
        }

        tr.querySelector('[data-c="cmp"]').innerHTML = cmp;

        // 保存期限提示
        const days = num(m?.ExpireDays);
        tr.querySelector('[data-c="expHint"]').textContent = days ? `保存 ${days} 天` : "";

        // 更新成本：價格跟成本表不同才預設勾選；有多種包裝規格的原料不能直接蓋掉
        const cb = tr.querySelector('[data-f="updateCost"]');
        const costDiff = m && u !== null && !(Math.abs((num(m.CostPrice) ?? -1) - u) < 1e-9);

        if (!r.costTouched) r.updateCost = !!(costDiff && !hasPackages(m) && canProduct());

        cb.checked = r.updateCost;
        cb.disabled = !m || hasPackages(m) || !canProduct();
        tr.querySelector('[data-c="costHint"]').textContent = !m ? "" : hasPackages(m) ? "多規格，請到原料管理" : costDiff ? `成本表 ${U.money(m.CostPrice, 2) || "無"}` : "";
    }

    function refreshInvTotals() {

        const rows = inv.filter(r => r.mid && num(r.qty) > 0 && num(r.total) !== null);
        const sub = round(rows.reduce((s, r) => s + num(r.total), 0));
        const rate = num(dom.invTaxRate.value) || 0;
        const tax = round(sub * rate / 100);

        dom.invSub.textContent = U.money(sub, 2);
        dom.invTax.textContent = U.money(tax, 2);
        dom.invTotal.textContent = U.money(round(sub + tax), 2);
        dom.invCount.textContent = rows.length ? `${rows.length} 項` : "";
    }

    // 選好原料：帶入單位、上次價格、有效期限
    function pickInvMaterial(i, m) {

        const r = inv[i];
        r.mid = m.ID;
        r.name = m.MaterialName;
        if (!r.unit) r.unit = m.Unit || "";

        if (!r.priceTouched) {
            const p = defaultPrice(m);
            r.unitPrice = p === null ? "" : p;
            if (num(r.qty) && p !== null && !r.totalManual) r.total = round(num(r.qty) * p, 2);
        }

        autoInvExpire(i);

        // 最後一列選好原料 → 自動多一列空白，可以接著輸入
        if (i === inv.length - 1) addInvRow(false);
    }

    function autoInvExpire(i) {
        const r = inv[i];
        const days = num(findMaterial(r.mid)?.ExpireDays);
        if (days && r.mfg && !r.expManual) r.exp = U.addDays(r.mfg, days);
    }

    function onInvInput(e) {

        const el = e.target;
        const tr = el.closest("tr[data-i]");
        const f = el.dataset.f;
        if (!tr || !f) return;

        const i = Number(tr.dataset.i);
        const r = inv[i];

        if (f === "updateCost") { r.updateCost = el.checked; r.costTouched = true; refreshInvRow(i); return; }

        r[f] = el.value;

        if (f === "name") {
            const m = matByName(r.name);
            if (m) pickInvMaterial(i, m); else r.mid = "";
        } else if (f === "qty") {
            const q = num(r.qty), p = num(r.unitPrice), t = num(r.total);
            if (!r.totalManual && q && p !== null) r.total = round(q * p, 2);
            else if (q && t !== null) r.unitPrice = round(t / q, 4);
        } else if (f === "unitPrice") {
            r.priceTouched = true;
            r.totalManual = false;
            const q = num(r.qty), p = num(r.unitPrice);
            r.total = q && p !== null ? round(q * p, 2) : r.total;
        } else if (f === "total") {
            r.priceTouched = true;
            r.totalManual = true;
            const q = num(r.qty), t = num(r.total);
            if (q && t !== null) r.unitPrice = round(t / q, 4);
        } else if (f === "mfg") autoInvExpire(i);
        else if (f === "exp") r.expManual = true;

        refreshInvRow(i);
        refreshInvTotals();
    }

    function onInvClick(e) {

        const b = e.target.closest("[data-act]");
        if (!b) return;

        const i = Number(b.closest("tr").dataset.i);

        if (b.dataset.act === "del") {
            inv.splice(i, 1);
            renderInvRows();
        } else if (b.dataset.act === "matadd") {
            MaterialQuick.open({
                name: inv[i].name.trim(), unit: inv[i].unit || "g",
                onSaved(m) {
                    const k = materials.findIndex(x => String(x.ID) === String(m.ID));
                    if (k >= 0) materials[k] = m; else materials.push(m);
                    renderInvMatList();
                    renderMaterialOptions();
                    pickInvMaterial(i, m);
                    renderInvRows();
                }
            });
        }
    }

    // 供應商改了：還沒手動改過價格的列，改用這家供應商上次的價格
    function onSupplierChange() {

        const s = invSupplier();
        const known = companies.some(c => c.CompanyName === s);
        dom.invSupplierHint.textContent = !s ? "" : known ? "✓ 已在客戶 / 廠商建檔" : "新供應商（只記名稱）";

        inv.forEach((r, i) => {
            const m = r.mid ? findMaterial(r.mid) : null;
            if (m && !r.priceTouched) {
                const p = defaultPrice(m);
                r.unitPrice = p === null ? "" : p;
                if (num(r.qty) && p !== null && !r.totalManual) r.total = round(num(r.qty) * p, 2);
            }
            refreshInvRow(i);
        });

        refreshInvTotals();
    }

    function openInvoice() {
        dom.invoiceCard.classList.remove("d-none");
        if (!dom.invDate.value) dom.invDate.value = U.today();
        if (!inv.length) renderInvRows();
        dom.invSupplier.focus();
        dom.invoiceCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // 清空，準備輸入下一家（日期保留）
    function resetInvoice() {
        inv = [blankRow()];
        dom.invSupplier.value = "";
        dom.invNo.value = "";
        dom.invNote.value = "";
        dom.invTaxRate.value = "0";
        dom.invSupplierHint.textContent = "";
        renderInvRows();
    }

    async function submitInvoice() {

        const supplier = invSupplier();
        const date = dom.invDate.value;
        const rate = num(dom.invTaxRate.value) || 0;

        if (!supplier) return alert("請先輸入供應商（商店）");
        if (!date) return alert("請輸入進貨日期");
        if (rate < 0) return alert("稅金不能是負數");

        const filled = inv.filter(r => r.name.trim() || num(r.qty) || num(r.total) !== null);
        const bad = filled.find(r => !r.mid);
        if (bad) return alert(`「${bad.name.trim() || "（沒有名稱）"}」還沒有對到原料庫的原料，請從清單選擇，或按該列的「＋ 新增」。`);

        const rows = filled.filter(r => r.mid);
        const incomplete = rows.find(r => !(num(r.qty) > 0) || num(r.total) === null);
        if (incomplete) return alert(`「${incomplete.name}」請輸入數量與價格`);
        if (!rows.length) return alert("請至少輸入一項原料");

        const company = companies.find(c => c.CompanyName === supplier);
        const invNo = dom.invNo.value.trim();
        const note = dom.invNote.value.trim();
        const sub = round(rows.reduce((s, r) => s + num(r.total), 0));
        const grand = round(sub * (1 + rate / 100));
        const group = "INV" + Date.now().toString(36).toUpperCase();
        const useExpense = dom.invOptExpense.checked && canFinance();
        const useStock = dom.invOptStock.checked && canProduct();
        const priceUps = rows.filter(r => r.updateCost && canProduct());

        if (!confirm(`送出「${supplier}」的進貨？\n\n${rows.length} 項，未稅 ${U.money(sub, 2)}${rate ? `，稅金 ${rate}%，含稅 ${U.money(grand, 2)}` : ""}${priceUps.length ? `\n會更新 ${priceUps.length} 項原料的成本價` : ""}`)) return;

        const ops = [];

        if (useExpense) {
            ops.push({
                action: "insert", table: "Expenses",
                data: {
                    ExpenseDate: date, Category: "食材", ItemName: `進貨 ${supplier}${invNo ? " 發票 " + invNo : ""}（${rows.length} 項${rate ? "，含稅 " + rate + "%" : ""}）`,
                    Amount: grand, Vendor: supplier, CompanyId: company ? company.ID : "", InvoiceNo: invNo, IsPaid: true, Note: "原物料進貨自動建立"
                }
            });
        }

        rows.forEach(r => {
            const m = findMaterial(r.mid);
            ops.push({
                action: "insert", table: "MaterialPurchases",
                data: {
                    PurchaseDate: date, MaterialID: num(r.mid), MaterialName: m?.MaterialName || r.name, Category: m?.Category || "", Supplier: supplier,
                    CompanyId: company ? company.ID : "", Quantity: num(r.qty), Unit: r.unit.trim(), TotalPrice: num(r.total), UnitPrice: num(r.unitPrice) ?? round(num(r.total) / num(r.qty), 4),
                    BatchNo: r.batch.trim(), MfgDate: r.mfg, ExpDate: r.exp, InvoiceNo: invNo, Note: note, InvoiceGroup: group, TaxRate: rate,
                    ExpenseId: useExpense ? "$0.ID" : ""
                }
            });
        });

        // 原料：庫存加總（同一個原料出現多列也只更新一次）、成本價（有勾選「更新成本」的列，取最後一列的單價）
        if (canProduct()) {
            const byMat = new Map();
            rows.forEach(r => {
                const x = byMat.get(String(r.mid)) || { qty: 0, price: null };
                x.qty += num(r.qty);
                if (r.updateCost) x.price = num(r.unitPrice);
                byMat.set(String(r.mid), x);
            });

            byMat.forEach((x, mid) => {
                const m = findMaterial(mid);
                const data = {};
                if (useStock) data.CurrentStock = round((num(m.CurrentStock) || 0) + x.qty);
                if (x.price !== null && !hasPackages(m)) data.CostPrice = x.price;
                if (Object.keys(data).length) ops.push({ action: "update", table: "Material", id: m.ID, data });
            });
        }

        dom.btnInvSubmit.disabled = true;

        try {
            await API.batch(ops);
            await reload();
            resetInvoice();
            dom.invMsg.className = "small align-self-center text-success";
            dom.invMsg.textContent = `✅ 已送出「${supplier}」${rows.length} 項（${U.money(grand, 2)}）${useExpense ? "，已記入支出表" : ""}。請輸入下一家。`;
            dom.invSupplier.focus();
        } catch (err) {
            App.error(err, "送出失敗");
        } finally {
            dom.btnInvSubmit.disabled = false;
        }
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
