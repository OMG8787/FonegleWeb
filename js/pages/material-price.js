window.Pages = window.Pages || {};

// =========================================================
// 原物料漲幅表：依 MaterialPurchases 的單價計算
// =========================================================
Pages.MaterialPrice = (() => {

    "use strict";

    const U = StockUtil;
    const dom = {};

    let materials = [];
    let purchases = [];
    let stats = [];
    let selected = null;

    async function init() {

        ["sumTracked", "sumUp", "sumYearAvg", "sumTop", "qKeyword", "qCategory", "qSort", "btnCsv",
            "priceBody", "detailCard", "detailTitle", "chartBox", "historyBody"]
            .forEach(id => dom[id] = document.getElementById(id));

        dom.qKeyword.addEventListener("input", renderTable);
        dom.qCategory.addEventListener("change", renderTable);
        dom.qSort.addEventListener("change", renderTable);
        dom.btnCsv.addEventListener("click", exportCsv);
        dom.priceBody.addEventListener("click", e => {
            const tr = e.target.closest("tr[data-mid]");
            if (tr) showDetail(tr.dataset.mid);
        });

        dom.priceBody.innerHTML = `<tr><td colspan="11" class="text-muted">載入中…</td></tr>`;

        try {
            const data = await API.getMany(["Material", "MaterialPurchases"]);
            materials = data.Material || [];
            purchases = (data.MaterialPurchases || []).filter(p => Number(p.UnitPrice) > 0 && U.date(p.PurchaseDate));
            build();
            renderCategories();
            renderTable();
        } catch (err) {
            App.error(err, "載入資料失敗");
        }
    }

    // =========================
    // 計算
    // =========================
    const change = (now, before) => (before ? (now - before) / before : null);

    // 指定日期（含）以前最後一次的進貨；沒有則為 null
    function priceAt(history, date) {
        const before = history.filter(h => h.date <= date);
        return (before.length ? before[before.length - 1] : null);
    }

    function build() {

        const byMaterial = new Map();

        purchases.forEach(p => {
            const key = String(p.MaterialID || p.MaterialName);
            if (!byMaterial.has(key)) byMaterial.set(key, []);
            byMaterial.get(key).push({
                date: U.date(p.PurchaseDate),
                price: Number(p.UnitPrice),
                p
            });
        });

        stats = [...byMaterial.entries()].map(([mid, history]) => {

            history.sort((a, b) => a.date.localeCompare(b.date) || a.p.ID - b.p.ID);

            const m = materials.find(x => String(x.ID) === mid);
            const last = history[history.length - 1];
            const prev = history[history.length - 2] || null;
            const d3 = priceAt(history.slice(0, -1), shiftMonths(last.date, -3));
            const d12 = priceAt(history.slice(0, -1), shiftMonths(last.date, -12));
            const prices = history.map(h => h.price);

            return {
                mid,
                name: m?.MaterialName || last.p.MaterialName || mid,
                unit: last.p.Unit || m?.Unit || "",
                category: m?.Category || last.p.Category || "",
                suppliers: [...new Set(history.map(h => h.p.Supplier).filter(Boolean))].join("、"),
                history,
                last,
                prev,
                lastChange: prev ? change(last.price, prev.price) : null,
                change3: d3 ? change(last.price, d3.price) : null,
                change12: d12 ? change(last.price, d12.price) : null,
                min: Math.min(...prices),
                max: Math.max(...prices)
            };
        });

        // 統計卡
        const year = stats.filter(s => s.change12 !== null);
        const top = year.slice().sort((a, b) => b.change12 - a.change12)[0];

        dom.sumTracked.textContent = stats.length;
        dom.sumUp.textContent = stats.filter(s => s.lastChange > 0).length;
        dom.sumYearAvg.innerHTML = year.length ? pctHtml(year.reduce((s, x) => s + x.change12, 0) / year.length) : "-";
        dom.sumTop.innerHTML = top && top.change12 > 0 ? `${App.esc(top.name)} ${pctHtml(top.change12)}` : "-";
    }

    function shiftMonths(date, n) {
        const d = new Date(date + "T00:00:00");
        d.setMonth(d.getMonth() + n);
        return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
    }

    function pctHtml(v) {
        if (v === null || v === undefined || !isFinite(v)) return `<span class="text-muted">-</span>`;
        const cls = v > 0 ? "up" : v < 0 ? "down" : "text-muted";
        return `<span class="${cls}">${v > 0 ? "▲" : v < 0 ? "▼" : ""}${U.pct(v)}</span>`;
    }

    // =========================
    // 畫面
    // =========================
    function renderCategories() {
        const cats = [...new Set(stats.map(s => s.category).filter(Boolean))].sort();
        dom.qCategory.innerHTML = `<option value="">全部分類</option>` + cats.map(c => `<option>${App.esc(c)}</option>`).join("");
    }

    function filtered() {

        const kw = dom.qKeyword.value.trim();
        const cat = dom.qCategory.value;
        const sort = dom.qSort.value;
        const val = v => (v === null ? -Infinity : v);

        return stats
            .filter(s => (!kw || App.like(s.name, kw) || App.like(s.suppliers, kw)) && (!cat || s.category === cat))
            .sort((a, b) =>
                sort === "yearDesc" ? val(b.change12) - val(a.change12) || val(b.lastChange) - val(a.lastChange) :
                    sort === "lastDesc" ? val(b.lastChange) - val(a.lastChange) :
                        sort === "date" ? b.last.date.localeCompare(a.last.date) :
                            a.name.localeCompare(b.name, "zh-Hant"));
    }

    function renderTable() {

        const esc = App.esc;
        const list = filtered();

        dom.priceBody.innerHTML = list.length ? list.map(s => `
<tr class="clickable ${selected === s.mid ? "table-primary" : ""}" data-mid="${esc(s.mid)}">
    <td>${esc(s.name)} <span class="small text-muted">${esc(s.unit ? "/ " + s.unit : "")}</span></td>
    <td class="text-end fw-bold">${U.money(s.last.price, 2)}</td>
    <td>${esc(s.last.date)}</td>
    <td class="text-end">${s.prev ? U.money(s.prev.price, 2) : ""}</td>
    <td class="text-end">${pctHtml(s.lastChange)}</td>
    <td class="text-end">${pctHtml(s.change3)}</td>
    <td class="text-end">${pctHtml(s.change12)}</td>
    <td class="text-end">${U.money(s.min, 2)}</td>
    <td class="text-end">${U.money(s.max, 2)}</td>
    <td class="text-end">${s.history.length}</td>
    <td>${sparkline(s.history)}</td>
</tr>`).join("") : `<tr><td colspan="11" class="text-muted">還沒有進貨紀錄，請先到「原物料進貨 / 盤點」新增</td></tr>`;
    }

    function sparkline(history) {

        if (history.length < 2) return "";

        const w = 90, h = 24;
        const prices = history.map(x => x.price);
        const min = Math.min(...prices), max = Math.max(...prices);
        const y = v => (max === min ? h / 2 : h - 2 - (v - min) / (max - min) * (h - 4));
        const pts = prices.map((v, i) => `${(i / (prices.length - 1) * (w - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const color = prices[prices.length - 1] > prices[0] ? "#dc3545" : prices[prices.length - 1] < prices[0] ? "#198754" : "#6c757d";

        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.8" points="${pts}"/></svg>`;
    }

    function showDetail(mid) {

        const s = stats.find(x => x.mid === mid);
        if (!s) return;

        selected = mid;
        renderTable();

        const esc = App.esc;

        dom.detailCard.classList.remove("d-none");
        dom.detailTitle.innerHTML = `${esc(s.name)} 價格歷史 <span class="small text-muted">（每 ${esc(s.unit || "單位")}，供應商：${esc(s.suppliers || "-")}）</span>`;
        dom.chartBox.innerHTML = chart(s.history);

        dom.historyBody.innerHTML = s.history.slice().reverse().map((hh, i, arr) => {
            const older = arr[i + 1];
            return `
<tr>
    <td>${esc(hh.date)}</td>
    <td>${esc(hh.p.Supplier || "")}</td>
    <td class="text-end">${U.qty(hh.p.Quantity)} ${esc(hh.p.Unit || "")}</td>
    <td class="text-end">${U.money(hh.p.TotalPrice)}</td>
    <td class="text-end fw-bold">${U.money(hh.price, 2)}</td>
    <td class="text-end">${older ? pctHtml(change(hh.price, older.price)) : ""}</td>
    <td>${esc(hh.p.BatchNo || "")}</td>
</tr>`;
        }).join("");

        dom.detailCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // 折線圖（依日期比例配置 X 軸）
    function chart(history) {

        const W = 800, H = 240, L = 60, R = 20, T = 20, B = 30;
        const times = history.map(x => new Date(x.date + "T00:00:00").getTime());
        const prices = history.map(x => x.price);
        const tMin = Math.min(...times), tMax = Math.max(...times);
        let pMin = Math.min(...prices), pMax = Math.max(...prices);

        if (pMin === pMax) { pMin *= 0.9; pMax *= 1.1; }
        if (pMin === pMax) { pMin -= 1; pMax += 1; }

        const x = t => L + (tMax === tMin ? (W - L - R) / 2 : (t - tMin) / (tMax - tMin) * (W - L - R));
        const y = p => T + (1 - (p - pMin) / (pMax - pMin)) * (H - T - B);

        const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
            const p = pMin + (pMax - pMin) * f;
            return `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${U.money(p, 2)}</text>`;
        }).join("");

        const pts = history.map((h, i) => `${x(times[i]).toFixed(1)},${y(h.price).toFixed(1)}`).join(" ");
        const dots = history.map((h, i) => `<circle cx="${x(times[i]).toFixed(1)}" cy="${y(h.price).toFixed(1)}" r="4" fill="#d63384"><title>${h.date}　${U.money(h.price, 2)}</title></circle>`).join("");

        const labelIdx = [...new Set([0, Math.floor((history.length - 1) / 2), history.length - 1])];
        const labels = labelIdx.map(i => `<text x="${x(times[i])}" y="${H - 8}" text-anchor="middle">${history[i].date}</text>`).join("");

        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}<polyline fill="none" stroke="#d63384" stroke-width="2.5" points="${pts}"/>${dots}${labels}</svg>`;
    }

    function exportCsv() {

        const head = ["原料", "單位", "分類", "最新單價", "最近進貨", "上次單價", "比上次", "比3個月前", "比1年前", "最低", "最高", "進貨次數", "供應商"];
        const p = v => (v === null ? "" : (v * 100).toFixed(1) + "%");

        const body = filtered().map(s => [s.name, s.unit, s.category, s.last.price, s.last.date, s.prev?.price ?? "",
            p(s.lastChange), p(s.change3), p(s.change12), s.min, s.max, s.history.length, s.suppliers]);

        U.downloadCsv(`原物料漲幅表_${U.today()}.csv`, [head].concat(body));
    }

    return { init };
})();
