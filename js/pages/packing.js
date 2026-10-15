window.Pages = window.Pages || {};

// =========================================================
// 出攤備品清單（PackingItems）
//   每個出攤活動一份清單（ListKey = cal:行事曆活動編號；自訂清單 = c:時間戳記）
//   產品 / 物件兩類，想到就加；同樣的東西再加一次 → 數量加上去；出發前逐項打勾
// =========================================================
Pages.Packing = (() => {

    "use strict";

    const COMMON_ITEMS = ["帳篷", "桌子", "椅子", "桌巾", "價目表 / 立牌", "收銀機 / 平板", "零錢", "發票機 / 收據", "冰箱 / 冰桶", "保冷劑 / 乾冰",
        "延長線", "照明燈", "湯匙 / 杯子", "試吃杯", "紙巾", "垃圾袋", "手套", "清潔用品", "名片 / DM", "提袋"];

    const dom = {};
    let events = [], items = [], products = null;
    let cur = null;          // { key, name, date, calId }

    const esc = v => App.esc(v);
    const num = v => App.num(v);
    const pad = n => String(n).padStart(2, "0");
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const day = v => App.toDateInput(v) || "";
    const specOf = p => [p.Specification, p.Capacity ? p.Capacity + (p.Unit || "") : ""].filter(Boolean).join(" ");
    const productLabel = p => (p.ProductName || "") + (specOf(p) ? `（${specOf(p)}）` : "");

    async function init() {

        ["eventList", "pastList", "btnNewList", "noList", "listArea", "listTitle", "listDate", "btnCopyFrom", "btnUncheckAll", "btnPrint",
            "progressBar", "progressText", "pkName", "pkNames", "pkQty", "pkUnit", "pkNote", "btnAdd", "productRows", "itemRows"]
            .forEach(id => dom[id] = document.getElementById(id));

        dom.btnNewList.addEventListener("click", newList);
        dom.btnAdd.addEventListener("click", addItem);
        [dom.pkName, dom.pkQty, dom.pkUnit, dom.pkNote].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }));
        dom.pkName.addEventListener("change", onNamePicked);
        document.querySelectorAll("input[name=pkType]").forEach(r => r.addEventListener("change", renderNames));
        dom.btnCopyFrom.addEventListener("click", copyFrom);
        dom.btnUncheckAll.addEventListener("click", uncheckAll);
        dom.btnPrint.addEventListener("click", () => window.print());
        dom.eventList.addEventListener("click", onPickList);
        dom.pastList.addEventListener("click", onPickList);
        [dom.productRows, dom.itemRows].forEach(t => {
            t.addEventListener("change", onRowChange);
            t.addEventListener("click", onRowClick);
        });

        await load();
    }

    async function load() {
        try {
            const d = await API.getMany(["Calendar", "PackingItems", "Products"]);
            events = (d.Calendar || []).filter(e => e.IsDeleted !== true);
            items = d.PackingItems || [];
            products = d.Products ? d.Products.filter(p => p.IsActive !== false) : null;
            renderLists();
            if (cur) renderList();
        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    const type = () => document.querySelector("input[name=pkType]:checked").value;
    const listItems = key => items.filter(x => x.ListKey === key).sort((a, b) => num(a.SortOrder) - num(b.SortOrder) || a.ID - b.ID);

    // =========================
    // 左側：活動 / 清單
    // =========================
    function allLists() {

        const today = ymd(new Date());
        const until = ymd(new Date(Date.now() + 60 * 86400000));
        const out = new Map();

        events.forEach(e => {
            const start = day(e.StartEventDate), end = day(e.EndEventDate) || start;
            if (!start) return;
            out.set("cal:" + e.CalendarId, { key: "cal:" + e.CalendarId, name: e.EventName || "未命名活動", date: start, end, calId: e.CalendarId, upcoming: end >= today && start <= until, hasEvent: true });
        });

        items.forEach(x => {
            if (out.has(x.ListKey)) return;
            const date = day(x.EventDate);
            out.set(x.ListKey, { key: x.ListKey, name: x.ListName || "自訂清單", date, end: date, calId: x.CalendarId || null, upcoming: !date || date >= today, hasEvent: false });
        });

        return [...out.values()].map(l => {
            const li = listItems(l.key);
            return Object.assign(l, { total: li.length, packed: li.filter(x => x.IsPacked === true).length });
        });
    }

    function listCard(l) {
        const range = l.date ? (l.end && l.end !== l.date ? `${l.date} ～ ${l.end}` : l.date) : "未定日期";
        const prog = l.total ? `<span class="badge ${l.packed === l.total ? "bg-success" : "bg-warning text-dark"}">${l.packed} / ${l.total}</span>` : `<span class="badge bg-light text-muted border">還沒有項目</span>`;
        return `<div class="list-item border p-2 ${cur && cur.key === l.key ? "active" : ""}" data-key="${esc(l.key)}">
            <div class="d-flex justify-content-between gap-2"><b>${l.hasEvent ? "🎪" : "📝"} ${esc(l.name)}</b>${prog}</div>
            <div class="small text-muted">${esc(range)}</div></div>`;
    }

    function renderLists() {
        const lists = allLists();
        const up = lists.filter(l => l.upcoming && (l.hasEvent || l.total)).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
        const past = lists.filter(l => !l.upcoming && l.total).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        dom.eventList.innerHTML = up.map(listCard).join("") || `<div class="text-muted small">接下來 60 天行事曆沒有活動，可以按「＋ 自訂清單」</div>`;
        dom.pastList.innerHTML = past.map(listCard).join("") || `<div class="text-muted small">還沒有過去的清單</div>`;
    }

    function onPickList(e) {
        const el = e.target.closest("[data-key]");
        if (!el) return;
        const l = allLists().find(x => x.key === el.dataset.key);
        if (!l) return;
        cur = { key: l.key, name: l.name, date: l.date, end: l.end, calId: l.calId };
        renderLists();
        renderList();
        if (window.innerWidth < 992) dom.listArea.scrollIntoView({ behavior: "smooth", block: "start" });
        dom.pkName.focus({ preventScroll: true });
    }

    function newList() {
        const name = (prompt("清單名稱（例如：10/20 信義市集）") || "").trim();
        if (!name) return;
        const date = (prompt("出攤日期（yyyy-mm-dd，可留空）", ymd(new Date())) || "").trim();
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert("日期格式請用 2026-10-20");
        cur = { key: "c:" + Date.now(), name, date, end: date, calId: null, fresh: true };
        renderList();
        renderLists();
    }

    // =========================
    // 右側：清單內容
    // =========================
    function rowHtml(x) {
        return `<tr data-id="${x.ID}" class="${x.IsPacked === true ? "packed" : ""}">
            <td style="width:36px"><input type="checkbox" class="form-check-input" data-f="IsPacked" ${x.IsPacked === true ? "checked" : ""} title="已打包"></td>
            <td class="name">${esc(x.ItemName)}</td>
            <td style="width:150px"><div class="input-group input-group-sm"><input type="number" min="0" step="any" class="form-control text-end" data-f="Qty" value="${x.Qty ?? ""}"><span class="input-group-text">${esc(x.Unit || "")}</span></div></td>
            <td><input class="form-control form-control-sm" data-f="Note" value="${esc(x.Note || "")}" placeholder="備註"></td>
            <td class="text-end no-print" style="width:40px"><button type="button" class="btn btn-sm btn-link text-danger p-0" data-del="${x.ID}" title="移除">✕</button></td></tr>`;
    }

    function renderList() {

        dom.noList.classList.toggle("d-none", !!cur);
        dom.listArea.classList.toggle("d-none", !cur);
        if (!cur) return;

        const li = listItems(cur.key);
        const packed = li.filter(x => x.IsPacked === true).length;

        dom.listTitle.textContent = cur.name;
        dom.listDate.textContent = cur.date ? (cur.end && cur.end !== cur.date ? `${cur.date} ～ ${cur.end}` : cur.date) : "未定日期";
        dom.progressBar.style.width = li.length ? (packed / li.length * 100) + "%" : "0%";
        dom.progressText.textContent = li.length ? `已打包 ${packed} / ${li.length}` : "還沒有項目";

        const prod = li.filter(x => x.ItemType === "產品"), other = li.filter(x => x.ItemType !== "產品");
        dom.productRows.innerHTML = prod.map(rowHtml).join("") || `<tr><td class="text-muted small">還沒有產品</td></tr>`;
        dom.itemRows.innerHTML = other.map(rowHtml).join("") || `<tr><td class="text-muted small">還沒有物件（帳篷、零錢、冰桶…）</td></tr>`;

        renderNames();
    }

    function renderNames() {
        if (type() === "產品") {
            const names = products ? products.map(productLabel) : [];
            const past = items.filter(x => x.ItemType === "產品").map(x => x.ItemName);
            dom.pkNames.innerHTML = [...new Set(names.concat(past))].map(n => `<option value="${esc(n)}"></option>`).join("");
        } else {
            const past = items.filter(x => x.ItemType !== "產品").map(x => x.ItemName);
            dom.pkNames.innerHTML = [...new Set(past.concat(COMMON_ITEMS))].map(n => `<option value="${esc(n)}"></option>`).join("");
        }
    }

    function productByLabel(name) {
        return products ? products.find(p => productLabel(p) === name) || products.find(p => p.ProductName === name) : null;
    }

    function onNamePicked() {
        if (type() !== "產品") return;
        const p = productByLabel(dom.pkName.value.trim());
        if (p && !dom.pkUnit.value) dom.pkUnit.value = p.Unit || "";
    }

    async function addItem() {

        if (!cur) return;
        const name = dom.pkName.value.trim();
        if (!name) { dom.pkName.focus(); return; }

        const t = type();
        const qty = dom.pkQty.value === "" ? null : num(dom.pkQty.value);
        const p = t === "產品" ? productByLabel(name) : null;
        const unit = dom.pkUnit.value.trim() || (p && p.Unit) || "";
        const same = listItems(cur.key).find(x => x.ItemType === t && String(x.ItemName).trim() === name);

        try {
            if (same) {
                const patch = { Qty: qty === null ? same.Qty : num(same.Qty) + qty, IsPacked: false };
                if (dom.pkNote.value.trim()) patch.Note = [same.Note, dom.pkNote.value.trim()].filter(Boolean).join("；");
                Object.assign(same, await API.update("PackingItems", same.ID, patch));
            } else {
                const row = await API.insert("PackingItems", {
                    ListKey: cur.key, ListName: cur.name, EventDate: cur.date || "", CalendarId: cur.calId || null,
                    ItemType: t, ProductID: p ? p.ID : null, ItemName: name, Qty: qty, Unit: unit, Note: dom.pkNote.value.trim(),
                    IsPacked: false, SortOrder: listItems(cur.key).length + 1
                });
                items.push(row);
            }
            dom.pkName.value = ""; dom.pkQty.value = ""; dom.pkUnit.value = ""; dom.pkNote.value = "";
            renderList();
            renderLists();
            dom.pkName.focus();
        } catch (err) {
            App.error(err, "加入失敗");
        }
    }

    async function onRowChange(e) {
        const tr = e.target.closest("tr[data-id]");
        const f = e.target.dataset.f;
        if (!tr || !f) return;
        const x = items.find(i => String(i.ID) === tr.dataset.id);
        if (!x) return;
        const value = f === "IsPacked" ? e.target.checked : f === "Qty" ? (e.target.value === "" ? null : num(e.target.value)) : e.target.value.trim();
        try {
            Object.assign(x, await API.update("PackingItems", x.ID, { [f]: value }, { silent: true }));
            if (f === "IsPacked") { renderList(); renderLists(); }
        } catch (err) {
            App.error(err, "更新失敗");
        }
    }

    async function onRowClick(e) {
        const b = e.target.closest("[data-del]");
        if (!b) return;
        const x = items.find(i => String(i.ID) === b.dataset.del);
        if (!x || !confirm(`從清單移除「${x.ItemName}」？`)) return;
        try {
            await API.remove("PackingItems", x.ID);
            items = items.filter(i => i !== x);
            renderList();
            renderLists();
        } catch (err) {
            App.error(err, "移除失敗");
        }
    }

    async function uncheckAll() {
        const li = listItems(cur.key).filter(x => x.IsPacked === true);
        if (!li.length || !confirm(`把 ${li.length} 項取消勾選（重新核對）？`)) return;
        try {
            await API.batch(li.map(x => ({ action: "update", table: "PackingItems", id: x.ID, data: { IsPacked: false } })));
            li.forEach(x => { x.IsPacked = false; });
            renderList();
            renderLists();
        } catch (err) {
            App.error(err, "更新失敗");
        }
    }

    // 從其他清單複製（例如上次出攤的清單），已經有的不重複
    async function copyFrom() {

        const others = allLists().filter(l => l.key !== cur.key && l.total).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        if (!others.length) return alert("還沒有其他清單可以複製");

        const pick = prompt("要從哪一份清單複製？輸入編號：\n\n" + others.slice(0, 15).map((l, i) => `${i + 1}. ${l.name}（${l.date || "未定日期"}，${l.total} 項）`).join("\n"), "1");
        const src = others[Number(pick) - 1];
        if (!src) return;

        const have = new Set(listItems(cur.key).map(x => x.ItemType + "|" + String(x.ItemName).trim()));
        const add = listItems(src.key).filter(x => !have.has(x.ItemType + "|" + String(x.ItemName).trim()));
        if (!add.length) return alert("這份清單的項目都已經在目前清單裡了");

        const base = listItems(cur.key).length;
        try {
            const res = await API.batch(add.map((x, i) => ({
                action: "insert", table: "PackingItems", data: {
                    ListKey: cur.key, ListName: cur.name, EventDate: cur.date || "", CalendarId: cur.calId || null,
                    ItemType: x.ItemType, ProductID: x.ProductID, ItemName: x.ItemName, Qty: x.Qty, Unit: x.Unit, Note: x.Note, IsPacked: false, SortOrder: base + i + 1
                }
            })), { loadingText: "複製中…" });
            items.push(...(res || []));
            renderList();
            renderLists();
            alert(`✅ 已從「${src.name}」複製 ${add.length} 項`);
        } catch (err) {
            App.error(err, "複製失敗");
        }
    }

    return { init };

})();
