window.Pages = window.Pages || {};

// =========================================================
// 生產履歷：每一批生產一筆
//   - 只能選已建立的產品（打字模糊搜尋）；產品編號、配方、單位、保存天數由產品帶入
//   - 工廠、生產線、作業員、主管：下拉選單，選項 = 以前填過的；打新的就直接用，存檔後下次會出現在選單
//   - 有效日期 = 製造日期 + 保存天數（產品設定的或自己填）；直接改日期會反算天數
//   - 批號：P + 製造日期 yyMMdd + 當天序號 2 碼（例如 P26102701），可以手動修改
//   - 舊資料的生產單號（ProductionNo）不再使用，但保留在試算表
// =========================================================
Pages.ProductionLog = (() => {

    "use strict";

    const dom = {};
    const PICKERS = ["Factory", "ProductionLine", "OperatorName", "SupervisorName"];

    let rows = [];              // 全部生產紀錄
    let products = [];
    let formulas = [];
    let listCache = [];
    let currentDetail = null;
    let mode = "view";
    let batchAuto = true;       // 批號是系統產生的（還沒被手動修改）：製造日期改了就跟著重新產生
    let unitAuto = true;        // 單位是產品帶入的
    let productTs = null;
    const pickers = {};

    async function init() {

        cacheDom();
        bindEvents();
        initProductSelect();
        PICKERS.forEach(initPicker);

        // 頁面沒有「新增」按鈕，預設顯示新增表單（資料讀到後再補上批號流水號）
        openCreate(false);
        await searchProduction();
    }

    function cacheDom() {

        ["formCard", "editHint", "productionList", "emptyHint", "searchTitle", "searchCount",
            "qBatchNo", "qProductName", "qFormulaID", "qFactory", "qProductionLine", "qOperatorName", "qMfgDate", "qExpDate", "qStatus",
            "btnSearch", "btnCreate", "btnUpdate", "btnDelete", "btnClear", "btnBatchNo", "batchHint",
            "ProductionID", "ProductSelect", "ProductID", "FormulaID", "FormulaName", "BatchNo",
            "PlannedQty", "ProducedQty", "NGQty", "Unit", "StartTime", "EndTime", "MfgDate", "ShelfDays", "shelfHint", "ExpDate",
            "Status", "Description", "Remark"]
            .concat(PICKERS)
            .forEach(id => dom[id] = document.getElementById(id));

        dom.form = document.getElementById("productionForm");
    }

    function bindEvents() {

        dom.btnSearch.addEventListener("click", searchProduction);
        dom.btnCreate.addEventListener("click", submitProduction);
        dom.btnUpdate.addEventListener("click", submitProduction);
        dom.btnDelete.addEventListener("click", removeProduction);
        dom.btnClear.addEventListener("click", () => openCreate(false));

        dom.productionList.addEventListener("click", e => {
            const card = e.target.closest(".production-card");
            if (card) loadDetail(listCache[card.dataset.index]);
        });

        dom.BatchNo.addEventListener("input", () => { batchAuto = false; renderBatchHint(); });
        dom.btnBatchNo.addEventListener("click", () => { batchAuto = true; refreshBatchNo(); });

        dom.Unit.addEventListener("input", () => { unitAuto = false; });

        dom.MfgDate.addEventListener("change", () => {
            if (batchAuto) refreshBatchNo();
            calcExpDate();
        });
        dom.ShelfDays.addEventListener("input", () => { calcExpDate(); renderShelfHint(); });
        dom.ExpDate.addEventListener("change", () => { calcShelfDays(); renderShelfHint(); });
        dom.shelfHint.addEventListener("click", e => {
            if (!e.target.closest("[data-use-shelf]")) return;
            const p = selectedProduct();
            if (!p) return;
            dom.ShelfDays.value = App.num(p.ShelfLifeDays);
            calcExpDate();
            renderShelfHint();
        });
    }

    async function loadData(opts = {}) {
        const d = await API.getMany(["ProductionLog", "Products", "Formula"], opts);
        rows = d.ProductionLog || [];
        products = d.Products || [];
        formulas = d.Formula || [];
        refreshProductOptions();
        PICKERS.forEach(refreshPickerOptions);
    }

    // =========================
    // 產品（只能選已建立的產品）
    // =========================
    const productById = id => products.find(p => String(p.ID) === String(id));
    const formulaById = id => (id ? formulas.find(f => String(f.FormulaID) === String(id)) : null);
    const selectedProduct = () => productById(dom.ProductID.value);

    function specOf(p) {
        return [p.Specification, p.Flavor, p.Capacity ? p.Capacity + (p.Unit || "") : "", p.Weight ? p.Weight + "g" : "", p.Color].filter(Boolean).join(" ");
    }

    function initProductSelect() {
        productTs = new TomSelect(dom.ProductSelect, {
            maxItems: 1,
            valueField: "value",
            labelField: "text",
            searchField: ["text", "spec", "sku"],
            placeholder: "打字搜尋產品名稱",
            dropdownParent: "body",
            dropdownClass: "ts-dropdown product-dd",
            refreshThrottle: 0,
            // 打字模糊比對（例如「芒冰」找得到「芒果冰淇淋」），符合度高的排前面
            score: search => App.fuzzy(search, ["text", "spec", "sku"]),
            sortField: [{ field: "$score", direction: "desc" }, { field: "text" }],
            render: {
                option: (d, esc) => `<div>${esc(d.text)}${d.spec ? ` <span class="text-primary small">【${esc(d.spec)}】</span>` : ""}<span class="text-muted small">　#${esc(d.value)}${d.sku ? "　" + esc(d.sku) : ""}${d.inactive ? "　（停用）" : ""}</span></div>`,
                item: (d, esc) => `<div>${esc(d.text)}${d.spec ? ` <span class="text-primary small">【${esc(d.spec)}】</span>` : ""}</div>`,
                no_results: () => `<div class="no-results">找不到產品：生產的品項要先到「產品管理」建立</div>`
            },
            onChange: onProductChange
        });
    }

    function productOption(p) {
        return { value: String(p.ID), text: p.ProductName || "產品 #" + p.ID, spec: specOf(p), sku: p.SKU || p.Barcode || "", inactive: p.IsActive === false };
    }

    function refreshProductOptions() {
        const keep = productTs.getValue();
        productTs.clearOptions();
        productTs.addOptions(products.filter(p => p.IsActive !== false).map(productOption));
        if (keep) setProduct(keep, true);
    }

    // 編輯舊資料：停用的產品也要能顯示；已刪除的產品顯示編號
    function setProduct(id, silent) {
        id = String(id || "");
        if (!id) return productTs.clear(silent);
        if (!productTs.options[id]) {
            const p = productById(id);
            productTs.addOption(p ? productOption(p) : { value: id, text: `（已刪除的產品 #${id}）`, spec: "", sku: "" });
        }
        productTs.setValue(id, silent);
    }

    function onProductChange(value) {
        const p = productById(value);
        dom.ProductID.value = p ? p.ID : "";
        dom.FormulaID.value = p && p.FormulaID ? p.FormulaID : "";
        renderFormula();
        if (p && (unitAuto || !dom.Unit.value.trim())) {
            dom.Unit.value = p.Unit || "";
            unitAuto = true;
        }
        if (p && p.ShelfLifeDays) {
            dom.ShelfDays.value = App.num(p.ShelfLifeDays);
            calcExpDate();
        }
        renderShelfHint();
    }

    function renderFormula() {
        const id = dom.FormulaID.value;
        const f = formulaById(id);
        dom.FormulaName.value = !dom.ProductID.value ? ""
            : !id ? "這個產品還沒有設定配方（到「產品管理」選配方）"
                : f ? `#${f.FormulaID} ${f.FormulaName}` : `#${id}（配方已刪除）`;
    }

    // =========================
    // 工廠 / 生產線 / 作業員 / 主管：選以前填過的，或直接輸入新的
    // =========================
    function initPicker(field) {
        pickers[field] = new TomSelect(dom[field], {
            maxItems: 1,
            create: input => ({ value: input.trim(), text: input.trim() }),
            createOnBlur: true,
            createFilter: input => input.trim().length > 0,
            persist: false,
            placeholder: "選擇，或直接輸入新的",
            dropdownParent: "body",
            refreshThrottle: 0,
            // 名稱很短（一廠 / 二廠、人名），只比對「包含輸入的文字」；打新的名稱按 Enter 就是新增
            score: search => {
                const q = search.trim().toLowerCase();
                return item => {
                    const t = String(item.text || "").toLowerCase();
                    return !q ? 1 : t.startsWith(q) ? 2 : t.includes(q) ? 1 : 0;
                };
            },
            sortField: [{ field: "$score", direction: "desc" }, { field: "count", direction: "desc" }, { field: "text" }],
            render: {
                option: (d, esc) => `<div>${esc(d.text)}${d.count ? `<span class="text-muted small">　用過 ${d.count} 次</span>` : ""}</div>`,
                option_create: (d, esc) => `<div class="create">＋ 新增「<b>${esc(d.input)}</b>」</div>`
            }
        });
    }

    // 選項 = 生產紀錄裡出現過的值（用得多的排前面）
    function refreshPickerOptions(field) {
        const ts = pickers[field];
        const keep = ts.getValue();
        const count = new Map();
        rows.forEach(r => {
            const v = String(r[field] || "").trim();
            if (v) count.set(v, (count.get(v) || 0) + 1);
        });
        ts.clearOptions();
        ts.addOptions([...count].map(([v, n]) => ({ value: v, text: v, count: n })));
        setPicker(field, keep, true);
    }

    function setPicker(field, value, silent) {
        const ts = pickers[field];
        value = String(value || "").trim();
        if (!value) return ts.clear(silent);
        if (!ts.options[value]) ts.addOption({ value, text: value, count: 0 });
        ts.setValue(value, silent);
    }

    // =========================
    // 批號：P + 製造日期 yyMMdd + 當天序號
    // =========================
    function todayStr() {
        const d = new Date();
        const p = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    function nextBatchNo(mfg) {
        const prefix = "P" + (mfg || todayStr()).replace(/-/g, "").slice(2, 8);
        const re = new RegExp("^" + prefix + "(\\d{2,})$", "i");
        const self = String(dom.ProductionID.value || "");
        let max = 0;
        rows.forEach(r => {
            if (self && String(r.ProductionID) === self) return;
            const m = String(r.BatchNo || "").trim().match(re);
            if (m) max = Math.max(max, Number(m[1]));
        });
        return prefix + String(max + 1).padStart(2, "0");
    }

    function refreshBatchNo() {
        dom.BatchNo.value = nextBatchNo(dom.MfgDate.value);
        renderBatchHint();
    }

    function duplicateBatch(no) {
        const self = String(dom.ProductionID.value || "");
        const key = String(no || "").trim().toUpperCase();
        return key && rows.find(r => String(r.ProductionID) !== self && String(r.BatchNo || "").trim().toUpperCase() === key);
    }

    function renderBatchHint() {
        const dup = duplicateBatch(dom.BatchNo.value);
        dom.batchHint.className = "form-text" + (dup ? " text-danger" : "");
        dom.batchHint.textContent = dup
            ? `⚠️ 這個批號已經用過（${productById(dup.ProductID)?.ProductName || "生產編號 " + dup.ProductionID}），請按「重新產生」`
            : "格式：P + 製造日期（年月日）+ 當天序號，例如 P26102701";
    }

    // =========================
    // 有效日期 = 製造日期 + 保存天數
    // =========================
    function addDays(ymd, days) {
        const [y, m, d] = ymd.split("-").map(Number);
        const t = new Date(Date.UTC(y, m - 1, d + days));
        return t.toISOString().slice(0, 10);
    }

    function diffDays(from, to) {
        const t = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
        return Math.round((t(to) - t(from)) / 86400000);
    }

    function calcExpDate() {
        const days = App.numOrNull(dom.ShelfDays.value);
        if (dom.MfgDate.value && days !== null && days >= 0) dom.ExpDate.value = addDays(dom.MfgDate.value, Math.round(days));
    }

    function calcShelfDays() {
        if (dom.MfgDate.value && dom.ExpDate.value) dom.ShelfDays.value = diffDays(dom.MfgDate.value, dom.ExpDate.value);
    }

    function renderShelfHint() {
        const p = selectedProduct();
        const def = p ? App.numOrNull(p.ShelfLifeDays) : null;
        const cur = App.numOrNull(dom.ShelfDays.value);
        dom.shelfHint.innerHTML = !p ? "選產品後自動帶入產品設定的保存天數"
            : def === null ? "這個產品沒有設定保存天數，請自己填（也可以到「產品管理」設定）"
                : cur === def ? `依產品設定：保存 ${def} 天`
                    : `產品設定保存 ${def} 天　<a href="#" data-use-shelf>改用產品設定</a>`;
    }

    // =========================
    // 列表
    // =========================
    async function searchProduction() {

        try {
            await loadData();
            if (mode === "create" && batchAuto) refreshBatchNo();

            const q = {
                batch: dom.qBatchNo.value.trim(),
                product: dom.qProductName.value.trim(),
                formula: dom.qFormulaID.value.trim(),
                factory: dom.qFactory.value.trim(),
                line: dom.qProductionLine.value.trim(),
                operator: dom.qOperatorName.value.trim(),
                mfg: dom.qMfgDate.value,
                exp: dom.qExpDate.value,
                status: dom.qStatus.value
            };

            listCache = rows
                .map(r => ({ ...r, ProductName: productById(r.ProductID)?.ProductName || "", FormulaName: formulaById(r.FormulaID)?.FormulaName || "" }))
                .filter(r =>
                    (App.like(r.BatchNo, q.batch) || App.like(r.ProductionNo, q.batch)) &&
                    (App.like(r.ProductName, q.product) || App.like(r.ProductID, q.product)) &&
                    (App.like(r.FormulaID, q.formula) || App.like(r.FormulaName, q.formula)) &&
                    App.like(r.Factory, q.factory) &&
                    App.like(r.ProductionLine, q.line) &&
                    App.like(r.OperatorName, q.operator) &&
                    (!q.mfg || App.toDateInput(r.MfgDate) === q.mfg) &&
                    (!q.exp || App.toDateInput(r.ExpDate) === q.exp) &&
                    (!q.status || r.Status === q.status))
                .sort((a, b) => String(App.toDateInput(b.MfgDate)).localeCompare(String(App.toDateInput(a.MfgDate))) || String(b.CreatedAt).localeCompare(String(a.CreatedAt)));

            renderList();

        } catch (err) {
            App.error(err, "查詢失敗");
        }
    }

    function renderList() {

        const esc = App.esc;
        const list = listCache;

        dom.searchTitle.textContent = "🏭 生產紀錄";
        dom.searchCount.textContent = `${list.length} 筆`;
        dom.emptyHint.classList.toggle("d-none", !!list.length);

        const statusColor = { "待生產": "bg-secondary", "生產中": "bg-warning text-dark", "已完成": "bg-success", "已取消": "bg-dark" };
        const qty = r => r.ProducedQty !== null && r.ProducedQty !== undefined && r.ProducedQty !== ""
            ? `完成 ${App.num(r.ProducedQty)}${r.Unit || ""}`
            : r.PlannedQty ? `預計 ${App.num(r.PlannedQty)}${r.Unit || ""}` : "";

        dom.productionList.innerHTML = list.map((r, i) => `
<div class="production-card${currentDetail && String(currentDetail.ProductionID) === String(r.ProductionID) ? " active" : ""}" data-index="${i}">
    <div class="production-title d-flex justify-content-between gap-2">
        <span>${esc(r.ProductName || (r.ProductID ? "產品 #" + r.ProductID : r.ProductionNo || "（未選產品）"))}</span>
        ${r.Status ? `<span class="badge ${statusColor[r.Status] || "bg-secondary"} align-self-start">${esc(r.Status)}</span>` : ""}
    </div>
    <div class="production-info">
        <span>📦 ${esc(r.BatchNo || r.ProductionNo || "-")}</span>
        ${qty(r) ? `<span>🔢 ${esc(qty(r))}</span>` : ""}
        ${r.Factory || r.ProductionLine ? `<span>🏭 ${esc([r.Factory, r.ProductionLine].filter(Boolean).join(" / "))}</span>` : ""}
        ${r.OperatorName ? `<span>👨‍🔧 ${esc(r.OperatorName)}</span>` : ""}
        <div>📅 製造 ${esc(App.toDateInput(r.MfgDate) || "-")}${r.ExpDate ? `　⏰ 有效 ${esc(App.toDateInput(r.ExpDate))}` : ""}</div>
    </div>
</div>`).join("");
    }

    // =========================
    // 表單
    // =========================
    function loadDetail(item) {

        if (!item) return;

        currentDetail = item;
        fillForm(item);
        showForm();
        setModeUI("edit");
        renderList();
        scrollToForm();
    }

    function fillForm(d) {

        dom.ProductionID.value = d.ProductionID || "";
        setProduct(d.ProductID, true);
        dom.ProductID.value = d.ProductID || "";
        // 保留當時記錄的配方（產品之後換配方也不影響舊紀錄）
        dom.FormulaID.value = d.FormulaID || "";
        renderFormula();

        dom.BatchNo.value = d.BatchNo || "";
        batchAuto = false;

        PICKERS.forEach(f => setPicker(f, d[f], true));

        dom.PlannedQty.value = d.PlannedQty ?? "";
        dom.ProducedQty.value = d.ProducedQty ?? "";
        dom.NGQty.value = d.NGQty ?? "";
        dom.Unit.value = d.Unit || "";
        unitAuto = false;

        dom.StartTime.value = App.toDateTimeInput(d.StartTime);
        dom.EndTime.value = App.toDateTimeInput(d.EndTime);
        dom.MfgDate.value = App.toDateInput(d.MfgDate);
        dom.ExpDate.value = App.toDateInput(d.ExpDate);
        dom.ShelfDays.value = "";
        calcShelfDays();
        renderShelfHint();
        renderBatchHint();

        dom.Status.value = d.Status || "待生產";
        dom.Description.value = d.Description || "";
        dom.Remark.value = d.Remark || "";
    }

    function buildPayload() {

        return {
            ProductID: dom.ProductID.value.trim(),
            FormulaID: dom.FormulaID.value.trim(),
            BatchNo: dom.BatchNo.value.trim(),
            Factory: pickers.Factory.getValue().trim(),
            ProductionLine: pickers.ProductionLine.getValue().trim(),
            PlannedQty: App.numOrNull(dom.PlannedQty.value),
            ProducedQty: App.numOrNull(dom.ProducedQty.value),
            NGQty: App.numOrNull(dom.NGQty.value),
            Unit: dom.Unit.value.trim(),
            OperatorName: pickers.OperatorName.getValue().trim(),
            SupervisorName: pickers.SupervisorName.getValue().trim(),
            StartTime: App.showDateTime(dom.StartTime.value),
            EndTime: App.showDateTime(dom.EndTime.value),
            MfgDate: dom.MfgDate.value,
            ExpDate: dom.ExpDate.value,
            Status: dom.Status.value,
            Description: dom.Description.value,
            Remark: dom.Remark.value
        };
    }

    async function submitProduction() {

        if (!selectedProduct()) {
            alert("請選擇產品（只能選已建立的產品）");
            productTs.focus();
            return;
        }

        try {
            // 存檔前用最新資料再檢查一次批號（避免兩個人同時新增用到同一個流水號）
            await loadData({ cache: false });
            if (mode === "create" && batchAuto) refreshBatchNo();
            if (!dom.BatchNo.value.trim()) refreshBatchNo();

            const dup = duplicateBatch(dom.BatchNo.value);
            if (dup) {
                renderBatchHint();
                alert(`批號「${dom.BatchNo.value.trim()}」已經用過，請按「重新產生」或改一個`);
                return;
            }

            const data = buildPayload();

            if (data.MfgDate && data.ExpDate && data.ExpDate < data.MfgDate && !confirm("有效日期比製造日期早，確定要存檔嗎？")) return;

            if (mode === "create") {
                await API.insert("ProductionLog", data);
                alert(`🎉 生產紀錄建立成功（批號 ${data.BatchNo}）`);
            } else {
                await API.update("ProductionLog", dom.ProductionID.value, data);
                alert("✅ 生產紀錄修改成功");
            }

            openCreate(false);
            await searchProduction();

        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function removeProduction() {

        if (!dom.ProductionID.value) return;

        if (!confirm("確認刪除此生產紀錄？")) return;

        try {
            await API.remove("ProductionLog", dom.ProductionID.value);
            alert("🗑️ 刪除完成");
            openCreate(false);
            await searchProduction();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function openCreate(scroll = true) {

        currentDetail = null;
        dom.form.reset();
        dom.ProductionID.value = "";
        dom.ProductID.value = "";
        dom.FormulaID.value = "";
        productTs.clear(true);
        PICKERS.forEach(f => pickers[f].clear(true));
        renderFormula();

        dom.MfgDate.value = todayStr();
        dom.Status.value = "待生產";
        unitAuto = true;
        batchAuto = true;
        refreshBatchNo();
        renderShelfHint();

        showForm();
        setModeUI("create");
        if (listCache.length) renderList();

        if (scroll) scrollToForm();
    }

    function showForm() {
        dom.formCard.classList.remove("d-none");
    }

    function scrollToForm() {
        setTimeout(() => dom.formCard.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }

    function setModeUI(newMode) {

        mode = newMode;

        dom.editHint.classList.toggle("d-none", mode !== "edit");
        dom.btnCreate.disabled = mode !== "create";
        dom.btnUpdate.disabled = mode !== "edit";
        dom.btnDelete.disabled = mode !== "edit";
    }

    return {
        init,
        openCreate
    };

})();
