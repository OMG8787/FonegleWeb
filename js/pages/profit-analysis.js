window.Pages = window.Pages || {};

// =========================================================
// 經營分析（不影響首頁的「收入 − 支出」總表）
//   原料流向：進貨、實際使用（月盤點的使用成本）、報廢損失、還沒用到的庫存
//   通路利潤：線上訂單、B2B、出攤各自扣掉成本後的實際利潤；B2B 另外列出每個客戶
//   報廢 / 呆料登記：登記後才算損失（MaterialWaste），可選擇同時扣掉原料庫存
// =========================================================
Pages.ProfitAnalysis = (() => {

    "use strict";

    const dom = {};
    const IDS = ["period", "periodText", "fPurchase", "fPurchaseNote", "fUsed", "fUsedNote", "fWaste", "fWasteNote", "fStock", "fStockNote", "flowNote",
        "stockBody", "channelBody", "missingHint", "b2bBody", "wasteMaterials", "wDate", "wMaterial", "wQty", "wUnit", "wCost", "wReason", "wAmount", "wNote", "wDeduct",
        "btnWasteAdd", "wasteBody"];

    let d = { orders: [], products: [], companies: [], stalls: [], purchases: [], counts: [], waste: [], materials: null, archive: [] };
    let range = { from: "", to: "" };

    const num = v => App.num(v);
    const esc = App.esc;
    const money = v => (Math.round(num(v)) < 0 ? "-$" : "$") + Math.abs(Math.round(num(v))).toLocaleString();
    const pct = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + "%" : "-");
    const day = v => App.toDateInput(v) || "";
    const cls = v => (v >= 0 ? "text-success" : "text-danger");
    const inRange = date => !!date && (!range.from || date >= range.from) && (!range.to || date <= range.to);
    const pad = n => String(n).padStart(2, "0");
    const ymd = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;

    async function init() {

        IDS.forEach(id => dom[id] = document.getElementById(id));
        dom.wDate.value = ymd(new Date());

        dom.period.addEventListener("change", render);
        dom.wMaterial.addEventListener("input", onMaterialInput);
        dom.wQty.addEventListener("input", refreshAmount);
        dom.wCost.addEventListener("input", refreshAmount);
        dom.btnWasteAdd.addEventListener("click", addWaste);
        dom.wasteBody.addEventListener("click", e => {
            const b = e.target.closest("[data-del]");
            if (b) removeWaste(b.dataset.del);
        });

        await load();
    }

    async function load() {

        try {
            const r = await API.getMany(["Orders", "Products", "Companies", "StallRecords", "MaterialPurchases", "MaterialCounts", "MaterialWaste", "Material", "ArchiveSummary"]);

            d = {
                orders: r.Orders || [], products: r.Products || [], companies: r.Companies || [], stalls: r.StallRecords || [],
                purchases: r.MaterialPurchases || [], counts: r.MaterialCounts || [], waste: r.MaterialWaste || [],
                materials: r.Material ? r.Material.filter(m => m.IsActive !== false) : null, archive: r.ArchiveSummary || []
            };

            dom.wasteMaterials.innerHTML = (d.materials || []).map(m => `<option value="${esc(m.MaterialName)}"></option>`).join("");
            render();

        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    function setRange() {

        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth();
        const p = dom.period.value;
        const first = (yy, mm) => ymd(new Date(yy, mm, 1));
        const last = (yy, mm) => ymd(new Date(yy, mm + 1, 0));

        if (p === "month") range = { from: first(y, m), to: last(y, m) };
        else if (p === "lastMonth") range = { from: first(y, m - 1), to: last(y, m - 1) };
        else if (p === "quarter") { const q = Math.floor(m / 3) * 3; range = { from: first(y, q), to: last(y, q + 2) }; }
        else if (p === "year") range = { from: `${y}-01-01`, to: `${y}-12-31` };
        else range = { from: "", to: "" };

        dom.periodText.textContent = range.from ? `${range.from.replace(/-/g, "/")} ～ ${range.to.replace(/-/g, "/")}` : "全部期間";
    }

    function render() {
        setRange();
        renderFlow();
        renderChannels();
        renderWaste();
        refreshAmount();
    }

    // =========================
    // 原料流向
    // =========================
    function lastPurchaseOf(material) {
        const list = d.purchases.filter(p => String(p.MaterialID) === String(material.ID) || (!p.MaterialID && p.MaterialName === material.MaterialName));
        return list.reduce((a, p) => (day(p.PurchaseDate) > a ? day(p.PurchaseDate) : a), "");
    }

    function renderFlow() {

        const buys = d.purchases.filter(p => inRange(day(p.PurchaseDate)));
        const purchase = buys.reduce((t, p) => t + num(p.TotalPrice), 0);
        dom.fPurchase.textContent = money(purchase);
        dom.fPurchaseNote.textContent = `${buys.length} 筆進貨`;

        const counts = d.counts.filter(c => inRange((c.CountMonth || "") + "-15"));
        const used = counts.reduce((t, c) => t + num(c.UsedCost), 0);
        const months = new Set(counts.map(c => c.CountMonth));
        dom.fUsed.textContent = money(used);
        dom.fUsedNote.textContent = months.size ? `${months.size} 個月有做盤點` : "這段期間還沒有月盤點";

        const wastes = d.waste.filter(w => inRange(day(w.WasteDate)));
        const waste = wastes.reduce((t, w) => t + num(w.Amount), 0);
        dom.fWaste.textContent = money(waste);
        dom.fWasteNote.textContent = `${wastes.length} 筆報廢`;

        if (!d.materials) {
            dom.fStock.textContent = "-";
            dom.fStockNote.textContent = "沒有讀取原料的權限";
            dom.stockBody.innerHTML = `<tr><td colspan="6" class="text-muted">沒有讀取原料的權限</td></tr>`;
        } else {
            const today = ymd(new Date());
            const old = ymd(new Date(Date.now() - 90 * 86400000));
            const rows = d.materials.map(m => {
                const stock = num(m.CurrentStock), price = num(m.CostPrice);
                return { m, stock, price, value: stock * price, last: lastPurchaseOf(m) };
            }).filter(r => r.stock > 0);
            const total = rows.reduce((t, r) => t + r.value, 0);

            dom.fStock.textContent = money(total);
            dom.fStockNote.textContent = `${rows.length} 項原料有庫存（時間點：${today.replace(/-/g, "/")}）`;

            dom.stockBody.innerHTML = rows.sort((a, b) => b.value - a.value).slice(0, 10).map(r => `<tr>
                <td>${esc(r.m.MaterialName)}</td>
                <td class="text-end">${Math.round(r.stock * 100) / 100} ${esc(r.m.Unit || "")}</td>
                <td class="text-end">${r.price ? "$" + (Math.round(r.price * 10000) / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "-"}</td>
                <td class="text-end fw-bold">${money(r.value)}</td>
                <td>${r.last ? esc(r.last) : "-"}</td>
                <td>${!r.last || r.last < old ? '<span class="badge bg-warning text-dark">久未進貨，可能是呆料</span>' : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="text-muted">目前沒有庫存紀錄</td></tr>`;
        }

        dom.flowNote.textContent = `進貨 ${money(purchase)}　→　實際使用 ${money(used)}　＋　報廢 ${money(waste)}　＋　留在庫存（沒用到的不算成本）`;
    }

    // =========================
    // 通路利潤
    // =========================
    function renderChannels() {

        const orders = OrderStats.group(d.orders, d.products).filter(o => inRange(o.date));
        const online = OrderStats.merge(OrderStats.summarize(orders.filter(o => !o.b2b)), OrderStats.archived(d.archive, "online", x => inRange(x)));
        const b2b = OrderStats.merge(OrderStats.summarize(orders.filter(o => o.b2b)), OrderStats.archived(d.archive, "b2b", x => inRange(x)));

        const stalls = d.stalls.filter(s => inRange(day(s.StallDate)));
        const st = { count: stalls.length, revenue: 0, cost: 0, profit: 0 };
        stalls.forEach(s => { st.revenue += num(s.Revenue); st.cost += num(s.TotalCost); st.profit += num(s.ProfitLoss); });
        d.archive.forEach(a => {
            if (!inRange(a.Period + "-15")) return;
            if (a.Label === "stall_income") { st.count += num(a.Count); st.revenue += num(a.Amount); }
            else if (a.Label === "stall_profit") st.profit += num(a.Amount);
        });
        st.cost = st.revenue - st.profit;

        const row = (name, s, note) => `<tr>
            <td class="fw-bold">${name}</td><td class="text-end">${s.count}</td><td class="text-end">${money(s.revenue)}</td>
            <td class="text-end">${money(s.cost)}</td><td class="text-end fw-bold ${cls(s.profit)}">${money(s.profit)}</td>
            <td class="text-end">${pct(s.profit, s.revenue)}</td><td class="small text-muted">${note}</td></tr>`;

        const sum = { count: online.count + b2b.count + st.count, revenue: online.revenue + b2b.revenue + st.revenue, cost: online.cost + b2b.cost + st.cost, profit: online.profit + b2b.profit + st.profit };

        dom.channelBody.innerHTML =
            row("🛒 線上訂單", online, online.missing ? `${online.missing} 個品項沒有成本，以 0 計` : "") +
            row("🏢 B2B", b2b, b2b.missing ? `${b2b.missing} 個品項沒有成本，以 0 計` : "") +
            row("🎪 出攤", st, "營業額、費用、損益取自出攤紀錄") +
            `<tr class="table-light"><td class="fw-bold">合計</td><td class="text-end">${sum.count}</td><td class="text-end">${money(sum.revenue)}</td>
                <td class="text-end">${money(sum.cost)}</td><td class="text-end fw-bold ${cls(sum.profit)}">${money(sum.profit)}</td><td class="text-end">${pct(sum.profit, sum.revenue)}</td><td></td></tr>`;

        const missing = online.missing + b2b.missing;
        dom.missingHint.classList.toggle("d-none", !missing);
        dom.missingHint.innerHTML = missing
            ? `⚠️ 有 <b>${missing}</b> 個訂單品項沒有連到產品或產品沒有成本價，成本以 0 計，利潤會偏高。請到「訂單管理」按 <a href="order.html?link=1">🔗 品項連到產品</a> 一次連好，並在「產品管理」用「成本確認」補上配方與成本。`
            : "";

        // B2B 各客戶
        const nameOf = id => (d.companies.find(c => String(c.ID) === String(id)) || {}).CompanyName || (id ? "客戶 " + id : "（未連到客戶）");
        const by = new Map();
        orders.filter(o => o.b2b).forEach(o => {
            const k = o.companyId || "";
            const s = by.get(k) || { count: 0, revenue: 0, cost: 0 };
            s.count++; s.revenue += o.revenue; s.cost += o.cost;
            by.set(k, s);
        });
        dom.b2bBody.innerHTML = [...by.entries()].map(([k, s]) => Object.assign({ k, profit: s.revenue - s.cost }, s)).sort((a, b) => b.profit - a.profit).map(s => `<tr>
            <td>${esc(nameOf(s.k))}</td><td class="text-end">${s.count}</td><td class="text-end">${money(s.revenue)}</td><td class="text-end">${money(s.cost)}</td>
            <td class="text-end fw-bold ${cls(s.profit)}">${money(s.profit)}</td><td class="text-end">${pct(s.profit, s.revenue)}</td></tr>`).join("")
            || `<tr><td colspan="6" class="text-muted">這段期間沒有 B2B 訂單（訂單的銷售通路選「B2B」才會列在這裡）</td></tr>`;
    }

    // =========================
    // 報廢登記
    // =========================
    function matByName(name) {
        const n = String(name || "").trim();
        return n && d.materials ? d.materials.find(m => String(m.MaterialName).trim() === n) : null;
    }

    function onMaterialInput() {
        const m = matByName(dom.wMaterial.value);
        if (m) {
            dom.wUnit.value = m.Unit || "";
            dom.wCost.value = m.CostPrice ?? "";
        }
        refreshAmount();
    }

    function refreshAmount() {
        dom.wAmount.textContent = money(num(dom.wQty.value) * num(dom.wCost.value));
    }

    function renderWaste() {
        const list = d.waste.filter(w => inRange(day(w.WasteDate))).sort((a, b) => day(b.WasteDate).localeCompare(day(a.WasteDate)) || b.ID - a.ID);
        dom.wasteBody.innerHTML = list.map(w => `<tr>
            <td>${esc(day(w.WasteDate))}</td><td>${esc(w.MaterialName || "")}</td><td class="text-end">${Math.round(num(w.Quantity) * 100) / 100} ${esc(w.Unit || "")}</td>
            <td class="text-end text-danger">${money(w.Amount)}</td><td>${esc(w.Reason || "")}</td><td class="small text-muted">${esc(w.Note || "")}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="${w.ID}">刪除</button></td></tr>`).join("")
            || `<tr><td colspan="7" class="text-muted">這段期間沒有報廢紀錄</td></tr>`;
    }

    async function addWaste() {

        const name = dom.wMaterial.value.trim();
        const qty = num(dom.wQty.value);
        const cost = num(dom.wCost.value);

        if (!name) return alert("請輸入或選擇原料");
        if (!(qty > 0)) return alert("請輸入報廢數量");
        if (!dom.wDate.value) return alert("請選擇報廢日期");

        const m = matByName(name);

        try {
            const row = await API.insert("MaterialWaste", {
                WasteDate: dom.wDate.value, MaterialID: m ? m.ID : null, MaterialName: m ? m.MaterialName : name, Quantity: qty, Unit: dom.wUnit.value.trim(),
                UnitCost: cost, Amount: Math.round(qty * cost * 100) / 100, Reason: dom.wReason.value, Note: dom.wNote.value.trim()
            });
            d.waste.push(row);

            let note = "";
            if (dom.wDeduct.checked && m) {
                try {
                    const left = Math.max(0, num(m.CurrentStock) - qty);
                    await API.update("Material", m.ID, { CurrentStock: left });
                    m.CurrentStock = left;
                    note = `\n已從「${m.MaterialName}」的庫存扣掉 ${qty}`;
                } catch (err) {
                    note = "\n（扣庫存失敗：沒有修改原料的權限，請另外調整庫存）";
                }
            }

            dom.wQty.value = "";
            dom.wNote.value = "";
            render();
            alert("✅ 已登記報廢，損失 " + money(row.Amount) + note);

        } catch (err) {
            App.error(err, "登記失敗");
        }
    }

    async function removeWaste(id) {

        const w = d.waste.find(x => String(x.ID) === String(id));
        if (!w || !confirm(`刪除這筆報廢紀錄？\n${w.MaterialName}　${money(w.Amount)}\n（不會把庫存加回去）`)) return;

        try {
            await API.remove("MaterialWaste", id);
            d.waste = d.waste.filter(x => String(x.ID) !== String(id));
            render();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    return { init };

})();
