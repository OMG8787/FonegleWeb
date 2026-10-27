window.Pages = window.Pages || {};
Pages.Order = (() => {
    "use strict";

    const dom = {};
    let orderCache = [];
    let currentOrder = null;
    let customers = [];     // Companies：客戶與合作廠商
    let members = [];       // Users：舊訂單使用的會員
    let productOptions = [];
    let allProducts = null;     // 全部產品（含停用；判斷訂單品項連到的產品還在不在）
    let lastOrders = [];
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
                    if (name === "Products") { allProducts = rows || []; renderProductOptions(allProducts); updateLinkBadge(); }
                    if (name === "Orders") applySearch(rows || []);
                }
            });

            // 從其他頁面帶參數進來：?link=1 → 打開「品項連到產品」（經營分析）；?no=訂單號碼 → 直接打開那張訂單（首頁的訂單提醒）
            const params = new URLSearchParams(location.search);
            if (params.get("link")) openLinkProducts();
            const no = params.get("no");
            const target = no && orderCache.find(o => String(o.OrderNo) === no);
            if (target) loadDetail(target);
            else if (no) alert(`找不到訂單 ${no}（可能已經刪除）`);

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    // =========================
    // 確認訂單：把「待確認」的訂單依產品整理，批次確認
    // =========================
    let confirmModal = null, confirmEl = null, confirmGroups = [], confirmSelected = new Set();

    function pendingRows(rows) {
        return (rows || []).filter(r => r.OrderNo && r.OrderStatus === "待確認");
    }

    function updateConfirmBadge(rows) {
        const badge = document.getElementById("confirmBadge");
        if (!badge) return;
        const n = new Set(pendingRows(rows).map(r => r.OrderNo)).size;
        badge.textContent = n;
        badge.classList.toggle("d-none", !n);
    }

    function ensureConfirmModal() {

        if (confirmEl) return;

        confirmEl = document.createElement("div");
        confirmEl.className = "modal fade";
        confirmEl.tabIndex = -1;
        confirmEl.innerHTML = `
<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><div><h5 class="modal-title">✅ 確認訂單</h5><div class="small text-muted">狀態是「待確認」的訂單，依產品整理；勾選後一次確認</div></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="cfBody"></div>
    <div class="modal-footer justify-content-between">
        <div class="d-flex align-items-center gap-2">
            <label class="small mb-0" for="cfTarget">確認後狀態</label>
            <select id="cfTarget" class="form-select form-select-sm" style="width:auto"><option>製作中</option><option>待出貨</option><option>已出貨</option></select>
        </div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">關閉</button><button type="button" class="btn btn-success" id="cfOk">✅ 確認選取的訂單</button></div>
    </div>
</div></div>`;
        document.body.appendChild(confirmEl);
        confirmModal = new bootstrap.Modal(confirmEl);

        confirmEl.addEventListener("change", e => {
            const t = e.target;
            if (t.matches("[data-cf-order]")) {
                if (t.checked) confirmSelected.add(t.dataset.cfOrder); else confirmSelected.delete(t.dataset.cfOrder);
                renderConfirm();
            } else if (t.matches("[data-cf-group]")) {
                const g = confirmGroups[Number(t.dataset.cfGroup)];
                g.orders.forEach(o => { if (t.checked) confirmSelected.add(o.no); else confirmSelected.delete(o.no); });
                renderConfirm();
            } else if (t.matches("#cfAll")) {
                confirmGroups.forEach(g => g.orders.forEach(o => { if (t.checked) confirmSelected.add(o.no); else confirmSelected.delete(o.no); }));
                renderConfirm();
            }
        });
        confirmEl.querySelector("#cfOk").addEventListener("click", submitConfirm);
    }

    function buildConfirmGroups(rows) {

        const pend = pendingRows(rows);
        const lines = new Map();     // OrderNo → 這張訂單的品項數
        pend.forEach(r => lines.set(r.OrderNo, (lines.get(r.OrderNo) || 0) + 1));

        const map = new Map();
        pend.forEach(r => {
            const key = r.ProductID ? "p:" + r.ProductID : "n:" + String(r.ProductName || "").trim();
            const g = map.get(key) || { name: r.ProductName || "（未填品名）", unit: r.Unit || "", qty: 0, orders: [] };
            g.qty += Number(r.Qty) || 0;
            g.orders.push({
                no: r.OrderNo, customer: r.MemberName || "", qty: Number(r.Qty) || 0, unit: r.Unit || "", date: App.toDateInput(r.OrderDate) || "",
                ship: App.toDateInput(r.ExpectedShippingDate) || "", note: r.Note || "", otherLines: lines.get(r.OrderNo) - 1
            });
            map.set(key, g);
        });

        return [...map.values()].sort((a, b) => b.orders.length - a.orders.length || String(a.name).localeCompare(String(b.name), "zh-Hant"));
    }

    function renderConfirm() {

        const esc = App.esc;
        const all = new Set(confirmGroups.flatMap(g => g.orders.map(o => o.no)));
        const body = confirmEl.querySelector("#cfBody");

        if (!confirmGroups.length) {
            body.innerHTML = `<div class="text-center text-muted py-5">🎉 沒有待確認的訂單</div>`;
            confirmEl.querySelector("#cfOk").disabled = true;
            confirmEl.querySelector("#cfOk").textContent = "✅ 確認選取的訂單";
            return;
        }

        body.innerHTML = `
<div class="d-flex flex-wrap align-items-center gap-3 mb-3">
    <label class="mb-0"><input type="checkbox" class="form-check-input me-1" id="cfAll" ${confirmSelected.size === all.size && all.size ? "checked" : ""}>全選（${all.size} 張訂單、${confirmGroups.length} 種產品）</label>
    <span class="text-muted small">已選 ${confirmSelected.size} 張</span>
</div>` + confirmGroups.map((g, gi) => {
            const sel = g.orders.filter(o => confirmSelected.has(o.no)).length;
            return `<div class="border rounded mb-3">
    <div class="d-flex flex-wrap justify-content-between align-items-center px-3 py-2 bg-body-tertiary rounded-top">
        <label class="mb-0 fw-bold"><input type="checkbox" class="form-check-input me-2" data-cf-group="${gi}" ${sel === g.orders.length ? "checked" : ""}>${esc(g.name)}</label>
        <span class="small text-muted">${g.orders.length} 張訂單 ・ 數量合計 <b class="text-body">${Math.round(g.qty * 100) / 100}</b> ${esc(g.unit)}</span>
    </div>
    <div class="table-responsive"><table class="table table-sm align-middle mb-0">
        <thead><tr><th style="width:36px"></th><th>訂單編號</th><th>客戶</th><th class="text-end">數量</th><th>下單日</th><th>預計出貨</th><th>備註</th></tr></thead>
        <tbody>${g.orders.map(o => `<tr>
            <td><input type="checkbox" class="form-check-input" data-cf-order="${esc(o.no)}" ${confirmSelected.has(o.no) ? "checked" : ""}></td>
            <td class="text-nowrap">${esc(o.no)}${o.otherLines ? ` <span class="badge text-bg-light border" title="這張訂單還有其他品項，確認時整張一起確認">另 ${o.otherLines} 項</span>` : ""}</td>
            <td>${esc(o.customer)}</td><td class="text-end">${o.qty} ${esc(o.unit)}</td><td class="text-nowrap">${esc(o.date)}</td><td class="text-nowrap">${esc(o.ship)}</td><td class="small text-muted">${esc(o.note)}</td></tr>`).join("")}</tbody>
    </table></div>
</div>`;
        }).join("");

        const ok = confirmEl.querySelector("#cfOk");
        ok.disabled = !confirmSelected.size;
        ok.textContent = `✅ 確認選取的訂單（${confirmSelected.size}）`;
    }

    async function openConfirmOrders() {

        ensureConfirmModal();

        let rows;
        try {
            API.cacheClear();
            rows = await API.list("Orders");
        } catch (err) {
            App.error(err, "讀取訂單失敗");
            return;
        }

        confirmRows = rows;
        confirmGroups = buildConfirmGroups(rows);
        confirmSelected = new Set();
        renderConfirm();
        confirmModal.show();
    }

    let confirmRows = [];

    async function submitConfirm() {

        if (!confirmSelected.size) return;

        const target = confirmEl.querySelector("#cfTarget").value;
        const ops = pendingRows(confirmRows).filter(r => confirmSelected.has(r.OrderNo))
            .map(r => ({ action: "update", table: "Orders", id: r.OrderID, data: { OrderStatus: target } }));

        if (!confirm(`確認這 ${confirmSelected.size} 張訂單（${ops.length} 個品項），狀態改為「${target}」？`)) return;

        const btn = confirmEl.querySelector("#cfOk");
        btn.disabled = true;

        try {
            for (let i = 0; i < ops.length; i += 40)
                await API.batch(ops.slice(i, i + 40), { loadingText: "確認訂單中…" });

            alert(`✅ 已確認 ${confirmSelected.size} 張訂單，狀態：${target}`);

            API.cacheClear();
            confirmRows = await API.list("Orders");
            confirmGroups = buildConfirmGroups(confirmRows);
            confirmSelected = new Set();
            renderConfirm();
            updateConfirmBadge(confirmRows);
            if (typeof searchOrder === "function") await searchOrder();

        } catch (err) {
            App.error(err, "確認失敗");
        } finally {
            btn.disabled = false;
        }
    }

    // =========================
    // 品項連到產品：以前手打品名、沒有連到產品（或連到的產品已被刪除）的訂單品項，依品名整理後一次連到產品
    //   連好後才算得出成本與利潤；已確認成交 / 已付款的品項，後端會順便用產品目前的成本鎖定
    // =========================
    let linkModal = null, linkEl = null, linkGroups = [], linkProducts = [];

    const normName = s => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const nameKey = s => normName(s).toLowerCase().replace(/[\s\p{P}]/gu, "");

    function specOf(p) {
        return [p.Specification, p.Flavor, p.Capacity ? p.Capacity + (p.Unit || "") : "", p.Weight ? p.Weight + "g" : "", p.Color].filter(Boolean).join(" ");
    }

    // ids：現有產品的編號（有給才檢查「連到的產品已被刪除」）
    function unlinkedRows(rows, ids) {
        return (rows || []).filter(r => {
            if (!r.OrderNo || !normName(r.ProductName)) return false;
            const pid = String(r.ProductID ?? "").trim();
            return !pid || (!!ids && !ids.has(pid));
        });
    }

    function updateLinkBadge() {
        const badge = document.getElementById("linkBadge");
        if (!badge) return;
        const n = unlinkedRows(lastOrders, allProducts ? new Set(allProducts.map(p => String(p.ID))) : null).length;
        badge.textContent = n;
        badge.classList.toggle("d-none", !n);
    }

    // 相似度 0~1：最長共同子序列（適合中文品名，例如「芒果冰淇淋大杯」與「芒果冰淇淋」）
    function similarity(a, b) {
        const s = [...a], t = [...b];
        if (!s.length || !t.length) return 0;
        const dp = new Array(t.length + 1).fill(0);
        for (let i = 1; i <= s.length; i++) {
            let prev = 0;
            for (let j = 1; j <= t.length; j++) {
                const keep = dp[j];
                dp[j] = s[i - 1] === t[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
                prev = keep;
            }
        }
        return 2 * dp[t.length] / (s.length + t.length);
    }

    // 建議連到哪個產品：品名＋規格相同 > 品名相同 > 互相包含 > 名稱相似；同名多規格用訂單單價對產品售價分辨
    //   sure = 很有把握（預先選好、打勾）；沒把握的只顯示「可能是」，按「套用」才選
    function suggestProduct(g) {
        const n = nameKey(g.name);
        const list = linkProducts.map(p => {
            const pn = nameKey(p.ProductName);
            if (!pn) return null;
            const full = nameKey(p.ProductName + specOf(p));
            let score = 0, why = "";
            if (full !== pn && n === full) { score = 100; why = "品名＋規格相同"; }
            else if (n === pn) { score = 95; why = "品名相同"; }
            else if (pn.length >= 2 && n.includes(pn)) { score = 60 + Math.round(30 * pn.length / n.length); why = `品名包含「${p.ProductName}」`; }
            else if (n.length >= 2 && pn.includes(n)) { score = 60 + Math.round(30 * n.length / pn.length); why = "產品名稱包含這個品名"; }
            else { const sim = similarity(n, pn); if (sim >= 0.6) { score = Math.round(sim * 70); why = "名稱相似"; } }
            if (!score) return null;
            if (g.prices.size && g.prices.has(App.num(p.SalePrice))) { score += 4; why += "、售價相同"; }
            return { p, score, why };
        }).filter(Boolean).sort((a, b) => b.score - a.score);

        if (!list.length) return null;
        const ties = list.filter(x => x.score === list[0].score).length;
        return { id: String(list[0].p.ID), why: list[0].why, sure: list[0].score >= 75 && ties === 1, ties };
    }

    function buildLinkGroups(rows) {
        const ids = new Set(linkProducts.map(p => String(p.ID)));
        const map = new Map();
        unlinkedRows(rows, ids).forEach(r => {
            const key = nameKey(r.ProductName);
            const g = map.get(key) || { name: normName(r.ProductName), rows: [], orders: new Set(), qty: 0, prices: new Set(), dates: [], b2b: new Set() };
            g.rows.push(r);
            g.orders.add(r.OrderNo);
            g.qty += App.num(r.Qty);
            if (App.num(r.UnitPrice) > 0) g.prices.add(App.num(r.UnitPrice));
            const d = App.toDateInput(r.OrderDate);
            if (d) g.dates.push(d);
            if (r.SalesChannel === "B2B") g.b2b.add(r.OrderNo);
            map.set(key, g);
        });
        return [...map.values()].map(g => {
            g.dates.sort();
            const s = suggestProduct(g);
            return Object.assign(g, { suggest: s, pick: s && s.sure ? s.id : "", on: !!(s && s.sure) });
        }).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, "zh-Hant"));
    }

    function ensureLinkModal() {

        if (linkEl) return;

        linkEl = document.createElement("div");
        linkEl.className = "modal fade";
        linkEl.tabIndex = -1;
        linkEl.innerHTML = `
<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><div><h5 class="modal-title">🔗 品項連到產品</h5><div class="small text-muted">以前手打品名、沒有連到產品的訂單品項，依品名整理；連到產品後才算得出成本與利潤</div></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="lkBody"></div>
    <div class="modal-footer justify-content-between">
        <div class="form-check mb-0"><input class="form-check-input" type="checkbox" id="lkRename"><label class="form-check-label small" for="lkRename">訂單上的品名一併改成產品名稱</label></div>
        <div class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">關閉</button><button type="button" class="btn btn-primary" id="lkOk">🔗 連結選取的品項</button></div>
    </div>
</div></div>`;
        document.body.appendChild(linkEl);
        linkModal = new bootstrap.Modal(linkEl);

        linkEl.addEventListener("change", e => {
            const t = e.target;
            if (t.matches("[data-lk]")) {
                const g = linkGroups[Number(t.dataset.lk)];
                if (t.checked && !g.pick) { t.checked = false; alert("請先在右邊選擇要連到哪個產品"); return; }
                g.on = t.checked;
                updateLinkStat();
            } else if (t.matches("#lkAll")) {
                linkGroups.forEach((g, i) => {
                    const tr = linkEl.querySelector(`[data-lk-row="${i}"]`);
                    if (!g.pick || (tr && tr.classList.contains("d-none"))) return;
                    g.on = t.checked;
                    const cb = linkEl.querySelector(`[data-lk="${i}"]`);
                    if (cb) cb.checked = t.checked;
                });
                updateLinkStat();
            }
        });
        linkEl.addEventListener("click", e => {
            const a = e.target.closest("[data-lk-apply]");
            if (!a) return;
            e.preventDefault();
            const i = Number(a.dataset.lkApply);
            linkEl.querySelector(`[data-lk-sel="${i}"]`).tomselect?.setValue(linkGroups[i].suggest.id);
        });
        linkEl.addEventListener("input", e => {
            if (!e.target.matches("#lkSearch")) return;
            const q = e.target.value.trim();
            const score = App.fuzzy(q, ["name"]);
            linkGroups.forEach((g, i) => linkEl.querySelector(`[data-lk-row="${i}"]`)?.classList.toggle("d-none", !!q && !score(g)));
        });
        linkEl.querySelector("#lkOk").addEventListener("click", submitLinks);
    }

    function renderLinkWhy(i) {
        const g = linkGroups[i], s = g.suggest;
        const el = linkEl.querySelector(`[data-lk-why="${i}"]`);
        if (!el) return;
        if (!s) { el.innerHTML = g.pick ? "" : `<span class="text-muted">找不到相近的產品，請自己選（沒有的話先到「產品管理」新增）</span>`; return; }
        if (g.pick === s.id) { el.innerHTML = `<span class="text-success">✨ 建議：${App.esc(s.why)}</span>`; return; }
        const p = linkProducts.find(x => String(x.ID) === s.id);
        const label = p ? p.ProductName + (specOf(p) ? "【" + specOf(p) + "】" : "") : "";
        el.innerHTML = `<span class="text-muted">${s.ties > 1 ? `⚠️ 有 ${s.ties} 個一樣相近的產品，請確認是哪一個。` : ""}可能是「${App.esc(label)}」（${App.esc(s.why)}）</span> <a href="#" data-lk-apply="${i}">套用</a>`;
    }

    function updateLinkStat() {
        const on = linkGroups.filter(g => g.on && g.pick);
        const items = on.reduce((t, g) => t + g.rows.length, 0);
        const total = linkGroups.reduce((t, g) => t + g.rows.length, 0);
        const stat = linkEl.querySelector("#lkStat");
        if (stat) stat.textContent = `共 ${linkGroups.length} 種品名（${total} 個品項）・已選 ${on.length} 種（${items} 個品項）`;
        const ok = linkEl.querySelector("#lkOk");
        ok.disabled = !on.length;
        ok.textContent = `🔗 連結選取的品項（${items}）`;
    }

    function renderLink() {

        const esc = App.esc;
        const body = linkEl.querySelector("#lkBody");
        body.querySelectorAll("select").forEach(s => s.tomselect?.destroy());

        if (!linkGroups.length) {
            body.innerHTML = `<div class="text-center text-muted py-5">🎉 所有訂單品項都已經連到產品了</div>`;
            const ok = linkEl.querySelector("#lkOk");
            ok.disabled = true;
            ok.textContent = "🔗 連結選取的品項";
            return;
        }

        const money = v => "$" + (Math.round(v * 100) / 100).toLocaleString();
        body.innerHTML = `
<div class="d-flex flex-wrap align-items-center gap-3 mb-2">
    <input id="lkSearch" class="form-control form-control-sm" style="max-width:240px" placeholder="🔍 搜尋品名" autocomplete="off">
    <label class="small mb-0"><input type="checkbox" class="form-check-input me-1" id="lkAll">全選（已選好產品的）</label>
    <span class="small text-muted" id="lkStat"></span>
</div>
<div class="alert alert-light border small py-2 mb-2">💡 已依品名、規格、售價先猜好要連的產品，有把握的已經選好並打勾（✨），請確認。找不到對應的產品，先到「產品管理」新增，再回來連結。<br>已確認成交 / 已付款的訂單，連結後會用產品<b>目前</b>的成本鎖定。</div>
<div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th style="width:36px"></th><th>訂單上的品名</th><th style="min-width:300px">連到產品</th></tr></thead>
    <tbody>${linkGroups.map((g, i) => {
        const prices = [...g.prices].sort((a, b) => a - b);
        const price = prices.length ? "・單價 " + (prices.length > 1 ? money(prices[0]) + " ~ " + money(prices[prices.length - 1]) : money(prices[0])) : "";
        const first = g.dates[0], last = g.dates[g.dates.length - 1];
        const dates = first ? "・" + (first === last ? first : first + " ~ " + last) : "";
        return `<tr data-lk-row="${i}">
        <td><input type="checkbox" class="form-check-input" data-lk="${i}" ${g.on ? "checked" : ""}></td>
        <td><div class="fw-semibold">${esc(g.name)}</div><div class="small text-muted">${g.rows.length} 個品項・${g.orders.size} 張訂單・數量 ${Math.round(g.qty * 100) / 100}${price}${dates}${g.b2b.size ? `・B2B ${g.b2b.size} 張` : ""}</div></td>
        <td><select data-lk-sel="${i}"></select><div class="small mt-1" data-lk-why="${i}"></div></td>
    </tr>`;
    }).join("")}</tbody>
</table></div>`;

        const options = linkProducts.map(p => ({
            value: String(p.ID), text: p.ProductName || "產品 " + p.ID,
            spec: [specOf(p), p.IsActive === false ? "已停用" : ""].filter(Boolean).join("・"), sku: p.SKU || p.Barcode || "", price: p.SalePrice ?? ""
        }));

        linkGroups.forEach((g, i) => {
            new TomSelect(body.querySelector(`[data-lk-sel="${i}"]`), {
                options, items: g.pick ? [g.pick] : [], maxItems: 1, valueField: "value", labelField: "text", searchField: ["text", "spec", "sku"],
                placeholder: "選擇產品（可打字搜尋）", refreshThrottle: 0, dropdownParent: "body", dropdownClass: "ts-dropdown product-dd",
                score: search => App.fuzzy(search, ["text", "spec", "sku"]),
                sortField: [{ field: "$score", direction: "desc" }, { field: "text" }, { field: "spec" }],
                render: { option: productOptionHtml, item: productItemHtml, no_results: () => `<div class="no-results">找不到產品：先到「產品管理」新增</div>` },
                onChange: v => {
                    g.pick = v || "";
                    g.on = !!g.pick;
                    const cb = body.querySelector(`[data-lk="${i}"]`);
                    if (cb) cb.checked = g.on;
                    renderLinkWhy(i);
                    updateLinkStat();
                }
            });
            renderLinkWhy(i);
        });

        updateLinkStat();
    }

    async function loadLinkData() {
        API.cacheClear();
        const d = await API.getMany(["Orders", "Products"]);
        linkProducts = (d.Products || []).slice().sort((a, b) => String(a.ProductName || "").localeCompare(String(b.ProductName || ""), "zh-Hant"));
        linkGroups = buildLinkGroups(d.Orders || []);
        allProducts = d.Products || [];
        return d;
    }

    async function openLinkProducts() {

        ensureLinkModal();

        try {
            await loadLinkData();
        } catch (err) {
            App.error(err, "讀取資料失敗");
            return;
        }

        linkEl.querySelector("#lkRename").checked = false;
        renderLink();
        linkModal.show();
    }

    async function submitLinks() {

        const chosen = linkGroups.filter(g => g.on && g.pick);
        if (!chosen.length) return;

        const rename = linkEl.querySelector("#lkRename").checked;
        const links = chosen.flatMap(g => g.rows.map(r => ({ OrderID: r.OrderID, ProductID: g.pick, rename })));
        const orders = new Set(chosen.flatMap(g => g.rows.map(r => r.OrderNo))).size;

        if (!confirm(`要把 ${chosen.length} 種品名（${links.length} 個品項、${orders} 張訂單）連到選好的產品嗎？` +
            (rename ? "\n\n訂單上的品名會一併改成產品名稱。" : "") +
            "\n\n已確認成交 / 已付款、還沒記成本的品項，會同時用產品目前的成本鎖定。")) return;

        const btn = linkEl.querySelector("#lkOk");
        btn.disabled = true;
        const sum = { linked: 0, locked: 0, skipped: 0 };

        try {
            for (let i = 0; i < links.length; i += 150) {
                const r = await API.call("linkOrderProducts", { links: links.slice(i, i + 150) }, { loadingText: `連結中…（${Math.min(i + 150, links.length)} / ${links.length}）` });
                sum.linked += r.linked || 0;
                sum.locked += r.locked || 0;
                sum.skipped += r.skipped || 0;
            }
            alert(`✅ 已連結 ${sum.linked} 個品項` +
                (sum.locked ? `\n🔒 其中 ${sum.locked} 個已確認成交 / 已付款的品項，已用產品目前的成本鎖定` : "") +
                (sum.skipped ? `\n（${sum.skipped} 個品項已經被連過或找不到，略過）` : ""));
        } catch (err) {
            if (/未知的操作/.test(err?.message || "")) alert("後端還沒更新：請先把 gas/Code.gs 重新部署成新版本，再使用這個功能。");
            else App.error(err, "連結失敗");
        } finally {
            btn.disabled = false;
        }

        // 不論成功或部分成功，都重新整理清單與訂單列表
        try {
            const d = await loadLinkData();
            renderLink();
            applySearch(d.Orders || []);
        } catch (err) {
            console.warn("重新整理失敗", err);
        }
    }

    // 產品選項的顯示：同名多規格要分得出來；滑鼠移上去顯示規格、SKU、售價
    function productOptionHtml(d, esc) {
        const tip = [d.text, d.spec && "規格：" + d.spec, d.sku && "SKU：" + d.sku, d.price !== undefined && d.price !== "" && d.price !== null && "售價：$" + d.price].filter(Boolean).join("\n");
        return `<div title="${esc(tip)}">${esc(d.text)}${d.spec ? ` <span class="text-primary small">【${esc(d.spec)}】</span>` : ""}<span class="text-muted small">${d.sku ? "　" + esc(d.sku) : ""}${d.price !== undefined && d.price !== "" && d.price !== null ? "　$" + esc(d.price) : ""}</span></div>`;
    }

    function productItemHtml(d, esc) {
        return `<div title="${esc([d.text, d.spec && "規格：" + d.spec, d.sku && "SKU：" + d.sku].filter(Boolean).join("\n"))}">${esc(d.text)}${d.spec ? ` <span class="text-primary small">【${esc(d.spec)}】</span>` : ""}</div>`;
    }

    // 成本要鎖定的訂單：已確認成交（訂單狀態不是待確認 / 取消）或已付款；退款不算（與後端 orderCostLocked_ 相同）
    const costLocked = (orderStatus, payStatus) => payStatus !== "退款" && (payStatus === "已付款" || (!!orderStatus && orderStatus !== "待確認" && orderStatus !== "取消"));
    const noCost = o => o.UnitCost === null || o.UnitCost === undefined || o.UnitCost === "";

    // 已確認成交 / 已付款、但還沒記成本的舊訂單（例如以前的 B2B 訂單）：用產品目前的成本補上並鎖定（只處理一次，之後食材漲跌不再影響）
    async function lockOldOrders() {

        let orders, products;

        try {
            API.cacheClear();
            const d = await API.getMany(["Orders", "Products"]);
            orders = d.Orders || [];
            products = d.Products || [];
        } catch (err) {
            App.error(err, "讀取資料失敗");
            return;
        }

        const costOf = new Map(products.filter(p => p.CostPrice !== null && p.CostPrice !== undefined && p.CostPrice !== "" && Number(p.CostPrice) > 0).map(p => [String(p.ID), Number(p.CostPrice)]));
        const pending = orders.filter(o => costLocked(o.OrderStatus, o.PaymentStatus) && noCost(o));
        const todo = pending.filter(o => costOf.has(String(o.ProductID ?? "")));
        const skip = pending.length - todo.length;
        const b2b = new Set(todo.filter(o => o.SalesChannel === "B2B").map(o => o.OrderNo)).size;

        if (!todo.length) { alert(skip ? `沒有可以鎖定的訂單。
有 ${skip} 個已確認 / 已付款的訂單品項沒有連到產品，或產品還沒有成本，無法記錄成本（請先用「🔗 品項連到產品」把品項連到產品，並在產品頁設定成本）。` : "所有已確認 / 已付款訂單的成本都已經鎖定了 👍"); return; }

        const orderCount = new Set(todo.map(o => o.OrderNo)).size;
        if (!confirm(`要把 ${orderCount} 張已確認成交 / 已付款的訂單（${todo.length} 個品項${b2b ? `，其中 B2B ${b2b} 張` : ""}）的成本，用「產品目前的成本」補上並鎖定嗎？

之後食材價格變動，這些訂單的利潤都不會再改變。${skip ? `
（另有 ${skip} 個品項沒有連產品或產品沒有成本，會略過）` : ""}

要改某張訂單的成本，開啟那張訂單按「用目前成本重算」即可。`)) return;

        try {
            for (let i = 0; i < todo.length; i += 40)
                await API.batch(todo.slice(i, i + 40).map(o => ({ action: "update", table: "Orders", id: o.OrderID, data: { UnitCost: costOf.get(String(o.ProductID)) } })), { loadingText: "鎖定成本中…" });
            alert(`✅ 已鎖定 ${orderCount} 張訂單的成本`);
        } catch (err) {
            App.error(err, "鎖定失敗");
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
        document.getElementById("btnLockOld")?.addEventListener("click", lockOldOrders);
        document.getElementById("btnLinkProducts")?.addEventListener("click", openLinkProducts);
        document.getElementById("btnConfirmOrders")?.addEventListener("click", openConfirmOrders);
        document.getElementById("orderCostInfo")?.addEventListener("click", e => {
            if (!e.target.closest("#btnUnlockCost")) return;
            document.querySelectorAll("#orderDetailList tr").forEach(tr => { tr.dataset.unitCost = ""; });
            calculateTotal();
            alert("已解除鎖定：按「儲存」後，這張訂單會改用產品「目前」的成本並重新鎖定。");
        });
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

        lastOrders = rows || [];
        updateConfirmBadge(rows);
        updateLinkBadge();

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
            sortField: [{ field: "$score", direction: "desc" }, { field: "text" }],
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
            sortField: [{ field: "$score", direction: "desc" }, { field: "text" }],
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
                price: p.SalePrice ?? "",
                cost: p.CostPrice,
                // 同名產品的不同規格：選單要看得出是哪一個
                spec: specOf(p) || (p.SKU || p.Barcode ? "" : "編號 " + p.ID),     // 什麼規格資料都沒填：至少顯示產品編號，才分得出同名的是哪一個
                sku: p.SKU || p.Barcode || ""
            }));

        // 已經加入的商品列補上產品選項
        document.querySelectorAll("#orderDetailList .productSelect").forEach(sel => {
            const ts = sel.tomselect;
            if (!ts) return;
            productOptions.forEach(p => { if (!ts.options[p.id]) ts.addOption({ value: p.id, text: p.name, spec: p.spec, sku: p.sku, price: p.price }); });
            ts.refreshOptions(false);
        });
    }

    function renderList(result) {
        dom.searchTitle.textContent =
            result.title;
        const dead = o => o.Rows.every(r => r.OrderStatus === "取消") || o.Rows.some(r => r.PaymentStatus === "退款");
        const sum = result.list.reduce((t, o) => t + (dead(o) ? 0 : App.num(o.TotalAmount)), 0);
        const skipped = result.list.filter(dead).length;
        dom.searchCount.textContent =
            `共 ${result.count} 筆，共計 $${Math.round(sum).toLocaleString()} 元` + (skipped ? `（不含取消 / 退款 ${skipped} 筆）` : "");
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
                Price: r.UnitPrice ?? "",
                UnitCost: r.UnitCost ?? ""
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
            const value = p.ProductID ? String(p.ProductID) : CUSTOM + (p.ProductName || "");
            tr.querySelector(".productID").value = p.ProductID || "";
            tr.querySelector(".productID").placeholder = p.ProductID ? "" : "自訂品項";
            const ts =
                tr.querySelector(".productSelect").tomselect;
            // 已刪除的產品、自訂品項也要能顯示
            if (!ts.options[value])
                ts.addOption({ value, text: p.ProductName || p.ProductID });
            ts.setValue(value, true);
            tr.querySelector(".qty").value =
                p.Qty;
            tr.querySelector(".unit").value =
                p.Unit;
            tr.querySelector(".price").value =
                p.Price;
            tr.dataset.unitCost = p.UnitCost ?? "";     // 已結清訂單的成本單價（後端鎖定，這裡只是原樣帶回）
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
                `<option value="${App.esc(p.id)}" data-spec="${App.esc(p.spec)}" data-sku="${App.esc(p.sku)}" data-price="${App.esc(p.price)}">${App.esc(p.name)}</option>`;
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
                const custom = isCustom(this.value);
                tr.dataset.unitCost = "";          // 換了產品：舊的成本單價不能沿用
                tr.querySelector(".productID").value = custom ? "" : this.value;
                tr.querySelector(".productID").placeholder = custom ? "自訂品項" : "";
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
                // 清單沒有的產品（客製化）：直接輸入品名
                create: input => ({ value: CUSTOM + input.trim(), text: input.trim() }),
                createOnBlur: true,
                createFilter: input => input.trim().length > 0,
                refreshThrottle: 0,
                dropdownParent: "body",
                dropdownClass: "ts-dropdown product-dd",
                placeholder: "搜尋產品，或直接輸入自訂品名",
                searchField: ["text", "spec", "sku"],
                valueField: "value",
                labelField: "text",
                // 打字模糊比對（例如「芒冰」找得到「芒果冰淇淋」），符合度高的排前面
                score: search => App.fuzzy(search, ["text", "spec", "sku"]),
                sortField: [{ field: "$score", direction: "desc" }, { field: "text" }, { field: "spec" }],
                render: {
                    // 滑鼠移上去顯示規格、SKU、售價（同名多規格才分得出來）
                    option: productOptionHtml,
                    item: productItemHtml,
                    option_create: (data, escape) => `<div class="create">＋ 使用自訂品名「<b>${escape(data.input)}</b>」</div>`,
                    no_results: () => `<div class="no-results">找不到產品，輸入完整品名後按 Enter 加入自訂品項</div>`
                }
            }
        );
        tr.querySelector(".qty")
            .addEventListener("input", calculateTotal);

        tr.querySelector(".price")
            .addEventListener("input", calculateTotal);

        calculateTotal();
    }

    // 自訂品項（不在產品清單）：選單值以 custom: 開頭，存檔時 ProductID 留空
    const CUSTOM = "custom:";

    function isCustom(v) {
        return String(v || "").startsWith(CUSTOM);
    }

    function productNameOf(tr) {
        const ts = tr.querySelector(".productSelect").tomselect;
        const v = ts ? ts.getValue() : tr.querySelector(".productSelect").value;
        return (ts && ts.options[v] && ts.options[v].text) || tr.querySelector(".productSelect").selectedOptions[0]?.text || "";
    }

    // 沒選產品、也沒輸入品名的空白列不算（新增表單預設會有一列空白）
    function getRows() {
        return [...document.querySelectorAll("#orderDetailList tr")]
            .filter(tr => tr.querySelector(".productSelect").value);
    }

    function validateRows(rows) {
        if (!rows.length) {
            alert("請至少加入一項商品");
            return false;
        }
        if (rows.some(tr => !tr.querySelector(".productSelect").value)) {
            alert("請選擇或輸入每一列的產品");
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
            // 沒有連到客戶：不會建立應收帳款，也就不會有「開發票」「收帳」提醒
            if (!cust.ref && !confirm("這張訂單沒有連到客戶資料（沒有選擇客戶，或沒勾「存成新客戶」）。\n\n沒有連到客戶的訂單不會建立應收帳款，也不會出現在待辦的「開發票」「收帳」提醒。\n\n仍要這樣建立嗎？\n（按「取消」回去選擇或建立客戶）"))
                return;
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
        addDetailRow();
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
        showCost(total - shipping);
    }

    // 預估成本與毛利：成本 = 數量 × 產品成本（產品頁用配方與包材算出）；運費是支出，不算營收
    function showCost(revenue) {

        const box = document.getElementById("orderCostInfo");
        if (!box) return;

        let cost = 0, missing = 0, lines = 0, locked = 0;

        document.querySelectorAll("#orderDetailList tr").forEach(tr => {
            const pid = tr.querySelector(".productID")?.value;
            const qty = parseFloat(tr.querySelector(".qty")?.value || 0);
            if (!qty) return;
            lines++;
            const p = pid ? productOptions.find(x => x.id === String(pid)) : null;
            if (tr.dataset.unitCost !== undefined && tr.dataset.unitCost !== "" && costLocked(dom.OrderStatus.value, dom.PaymentStatus.value)) { cost += qty * Number(tr.dataset.unitCost); locked++; }   // 已確認成交：用當時記下的成本
            else if (p && p.cost !== null && p.cost !== undefined && p.cost !== "") cost += qty * Number(p.cost);
            else missing++;
        });

        if (!lines) { box.textContent = ""; return; }

        const profit = revenue - cost;
        box.innerHTML = `預估成本 $${Math.round(cost).toLocaleString()}　毛利 $${Math.round(profit).toLocaleString()}${revenue > 0 ? `（${(profit / revenue * 100).toFixed(1)}%）` : ""}　<span class="text-muted">（不含運費）</span>` +
            (locked ? `<br><span class="text-success">🔒 已確認成交，成本鎖定在當時的數字</span> <a href="#" id="btnUnlockCost" onclick="return false">用目前成本重算</a>` : "") +
            (missing ? `<br><span class="text-danger">⚠️ ${missing} 個品項沒有成本（到產品頁設定配方或成本）</span>` : "");
    }

    function buildPayload(tr) {


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
            ProductName: productNameOf(tr),
            Qty: App.numOrNull(tr.querySelector(".qty").value),
            Unit: tr.querySelector(".unit").value.trim(),
            UnitPrice: App.numOrNull(tr.querySelector(".price").value),
            UnitCost: currentOrder && costLocked(currentOrder.OrderStatus, currentOrder.PaymentStatus) && costLocked(dom.OrderStatus.value, dom.PaymentStatus.value) ? App.numOrNull(tr.dataset.unitCost) : null,

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