// =========================================================
// 成本確認精靈：把「食材 → 原料庫 → 配方 → 產品」的關係一項一項確認好
//   CostReview.open({ formulaId, onDone })
//     沒帶 formulaId：全部（重複原料 → 食材對應 → 配方 → 產品）；帶了：只確認這個配方的食材與配方本身
//   每一項都可以「選填」或按「核可」；不確定的按「略過」，下次還會再出現
//
//   1. 重複的原料        名稱寫法不同的同一種原料（匯入來源不同）→ 選一個保留，其他合併（配方改指向保留的、其餘停用）
//   2. 食材對應原料庫    配方裡的食材沒有連到原料庫，或原料沒有單價 → 選原料庫既有的 / 新增，填包裝重量與價格自動算每克單價
//   3. 配方確認          檢視每個食材成本、成品率、每份重量 → 核可
//   3.5 重複的配方       同一個配方有多個規格的產品：比對食材，選一個為主，其他併入（產品改連到主配方、刪除）或保留
//   4. 產品對上配方      選配方、用多少公克（預設用產品的重量）、包材 → 算出成本 → 核可
//   成本單價（每 g）= 包裝價格 ÷ 包裝重量；產品成本 = 用量 g × 配方每克成本 + 包材
// =========================================================
window.CostReview = (() => {

    "use strict";

    const E = App.esc;
    const num = v => Cost.num(v);
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const money = (v, d = 2) => "$" + (Math.round((Number(v) || 0) * 10 ** d) / 10 ** d).toLocaleString();
    const has = v => v !== null && v !== undefined && v !== "";

    let modal = null, el = null, data = null, queue = [], idx = 0, opts = {}, changed = false, approved = 0, busy = false, pendingOpen = null;

    // =========================
    // 名稱比對（不同來源寫法不同：全形半形、空白、括號品牌、大小寫…）
    // =========================
    const norm = s => String(s || "").normalize("NFKC").toLowerCase()
        .replace(/[(（\[【][^)）\]】]*[)）\]】]/g, "")
        .replace(/[\s·・,，.。、\-_\/\\*＊]/g, "");

    function dice(a, b) {
        if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
        const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
        const A = grams(a), B = grams(b);
        let hit = 0;
        A.forEach((n, g) => { hit += Math.min(n, B.get(g) || 0); });
        return 2 * hit / (a.length + b.length - 2);
    }

    function similarity(x, y) {
        const a = norm(x), b = norm(y);
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.includes(b) || b.includes(a)) return Math.min(.95, .6 + .35 * Math.min(a.length, b.length) / Math.max(a.length, b.length));
        return dice(a, b);
    }

    // =========================
    // 資料
    // =========================
    const mats = () => data.materials.filter(m => m.IsActive !== false);
    const matById = id => (has(id) ? data.materials.find(m => String(m.ID) === String(id)) : null);
    const priced = m => !!m && num(m.CostPrice) > 0;
    const detailsOf = fid => data.details.filter(d => String(d.FormulaID) === String(fid));
    const formulaName = f => f.FormulaName || f.FormulaCode || "配方 " + f.FormulaID;

    async function load() {
        API.cacheClear();
        const d = await API.getMany(["Material", "Formula", "FormulaDetail", "Products"]);
        data = { materials: d.Material || [], formulas: d.Formula || [], details: d.FormulaDetail || [], products: d.Products || [] };
    }

    function candidatesFor(name, limit = 5) {
        return mats().map(m => ({ m, s: similarity(name, m.MaterialName) })).filter(x => x.s >= .35)
            .sort((a, b) => b.s - a.s || (priced(b.m) - priced(a.m))).slice(0, limit);
    }

    // 配方裡「還有問題」的食材列數（給配方頁提醒用）
    function countIssues(formulaId, details, materials) {
        return (details || []).filter(d => String(d.FormulaID) === String(formulaId)).filter(d => {
            if (d.SubFormulaId) return !!d.Remark;          // 再製品：成本來自它的配方
            const m = has(d.MaterialID) ? (materials || []).find(x => String(x.ID) === String(d.MaterialID)) : null;
            return !m || !priced(m) || !!d.Remark;
        }).length;
    }

    // =========================
    // 建立確認清單
    // =========================
    function build() {

        const q = [];
        const fid = opts.formulaId;
        const scopeFormulas = data.formulas.filter(f => !fid || String(f.FormulaID) === String(fid));
        const scopeIds = new Set(scopeFormulas.map(f => String(f.FormulaID)));
        const scopeDetails = data.details.filter(d => scopeIds.has(String(d.FormulaID)));

        // 1) 重複的原料
        if (!fid) {
            const active = mats();
            const seen = new Set();
            active.forEach(a => {
                if (seen.has(a.ID)) return;
                const group = active.filter(b => b.ID === a.ID || (!seen.has(b.ID) && similarity(a.MaterialName, b.MaterialName) >= .9));
                if (group.length < 2) return;
                group.forEach(g => seen.add(g.ID));
                const keep = group.slice().sort((x, y) => (priced(y) - priced(x)) || (String(x.MaterialName).length - String(y.MaterialName).length))[0];
                q.push({ type: "dupes", title: "重複的原料", group, st: { keep: keep.ID } });
            });
        }

        // 2) 食材對應原料庫
        const groups = new Map();
        scopeDetails.forEach(d => {
            if (d.SubFormulaId && data.formulas.some(f => String(f.FormulaID) === String(d.SubFormulaId))) return;      // 再製品：成本來自它的配方
            const name = String(d.MaterialName || "").trim();
            const m = matById(d.MaterialID);
            let key;
            if (m && m.IsActive !== false) { if (priced(m) && !d.Remark) return; key = "m:" + m.ID; }
            else if (!name) return;
            else key = "n:" + name;
            const g = groups.get(key) || { key, name: m ? m.MaterialName : name, material: m && m.IsActive !== false ? m : null, rows: [], formulas: new Set() };
            g.rows.push(d);
            const f = data.formulas.find(x => String(x.FormulaID) === String(d.FormulaID));
            if (f) g.formulas.add(formulaName(f));
            groups.set(key, g);
        });

        const auto = [];
        groups.forEach(g => {
            if (!g.material) {
                const exact = mats().filter(m => similarity(g.name, m.MaterialName) === 1 && priced(m));
                if (exact.length === 1) { auto.push({ g, m: exact[0] }); return; }
            }
            q.push({ type: "ingredient", title: "食材：" + g.name, g, cands: candidatesFor(g.name), st: null });
        });
        if (auto.length) q.splice(q.filter(s => s.type === "dupes").length, 0, { type: "autolink", title: "名稱相同的食材", items: auto });

        // 3) 配方確認（還沒核可的）
        scopeFormulas.filter(f => f.IsVerified !== true).forEach(f => q.push({ type: "formula", title: "配方：" + formulaName(f), f, st: null }));

        // 3.5) 重複的配方（同一個配方有多個規格的產品：先整合，產品才能對上同一個配方）
        if (!fid) findFormulaGroups().forEach(g => q.push({ type: "fdupes", title: "重複的配方：" + g.slice(0, 3).map(formulaName).join("、") + (g.length > 3 ? "…" : ""), group: g, st: null }));

        // 4) 產品對上配方（還沒確認成本的）
        if (!fid) data.products.filter(p => p.IsActive !== false && p.CostVerified !== true).forEach(p => q.push({ type: "product", title: "產品：" + (p.ProductName || p.ID), p, st: null }));

        return q;
    }

    // =========================
    // 視窗框架
    // =========================
    function frame() {

        el = document.createElement("div");
        el.className = "modal fade";
        el.tabIndex = -1;
        el.setAttribute("data-bs-backdrop", "static");
        el.innerHTML = `
<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><div><h5 class="modal-title" id="crTitle"></h5><div class="small text-muted" id="crProg"></div></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body" id="crBody"></div>
    <div class="modal-footer justify-content-between">
        <button type="button" class="btn btn-outline-secondary" id="crPrev">← 上一項</button>
        <div class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary" id="crSkip">略過（下次再確認）</button><button type="button" class="btn btn-success" id="crOk">✅ 核可</button></div>
    </div>
</div></div>`;
        document.body.appendChild(el);
        modal = new bootstrap.Modal(el);
        el.querySelector("#crPrev").addEventListener("click", () => go(idx - 1));
        el.querySelector("#crSkip").addEventListener("click", () => go(idx + 1));
        el.querySelector("#crOk").addEventListener("click", approve);
        el.addEventListener("hidden.bs.modal", async () => {
            const open = pendingOpen;
            pendingOpen = null;
            try { if (changed && opts.onDone) await opts.onDone(); } catch (e) { console.warn(e); }
            changed = false;
            // 新增了再製品配方：到那個配方登入食材（在配方頁直接切換；其他頁開啟配方頁）
            if (open) { if (opts.openFormula) opts.openFormula(open); else location.href = "formula.html?f=" + encodeURIComponent(open); }
        });
    }

    const $ = s => el.querySelector(s);

    function go(i) {
        idx = Math.max(0, Math.min(queue.length, i));
        render();
    }

    function render() {

        const done = idx >= queue.length;
        $("#crPrev").disabled = idx === 0 || busy;
        $("#crSkip").classList.toggle("d-none", done);
        $("#crOk").classList.toggle("d-none", done);
        $("#crProg").textContent = done ? "" : `第 ${idx + 1} / ${queue.length} 項　已核可 ${approved} 項`;

        if (done) {
            $("#crTitle").textContent = "🎉 確認完成";
            $("#crBody").innerHTML = `<div class="py-4 text-center"><div class="fs-4 mb-2">本次共核可 ${approved} 項</div><div class="text-muted">略過的項目下次開啟精靈時還會再出現。</div><button type="button" class="btn btn-primary mt-3" data-bs-dismiss="modal">關閉</button></div>`;
            return;
        }

        const s = queue[idx];
        $("#crTitle").textContent = ({ dupes: "🧩 ", autolink: "🔗 ", ingredient: "🧂 ", formula: "🧪 ", fdupes: "🧬 ", product: "📦 " })[s.type] + s.title;
        $("#crOk").textContent = s.type === "autolink" ? "✅ 全部核可" : s.type === "dupes" ? "✅ 合併" : s.type === "fdupes" ? "✅ 確定" : "✅ 核可";
        ({ dupes: rDupes, autolink: rAuto, ingredient: rIngredient, formula: rFormula, fdupes: rFDupes, product: rProduct })[s.type](s);
    }

    async function approve() {

        const s = queue[idx];
        if (busy || !s) return;

        try {
            busy = true;
            $("#crOk").disabled = true;
            const ok = await ({ dupes: aDupes, autolink: aAuto, ingredient: aIngredient, formula: aFormula, fdupes: aFDupes, product: aProduct })[s.type](s);
            if (ok === false) return;
            approved++;
            changed = true;
            busy = false;

            // 合併原料後，食材能對上的原料變了：重新整理後面的項目（還沒處理的重複原料保留）
            if (s.type === "dupes") {
                const rest = build().filter(x => x.type !== "dupes");
                queue = queue.slice(0, idx + 1).concat(queue.slice(idx + 1).filter(x => x.type === "dupes"), rest);
            }

            go(idx + 1);
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            busy = false;
            $("#crOk").disabled = false;
        }
    }

    // =========================
    // 1. 重複的原料
    // =========================
    function rDupes(s) {
        $("#crBody").innerHTML = `
<p class="text-muted small">這幾個原料看起來是同一種（名稱寫法不同）。選一個要保留的，其他會合併進去：配方裡的食材改指向保留的原料，它們的規格 / 產地 / 供應商也會併進保留的原料成為選項，其餘原料停用（不刪除）。不是同一種請按「略過」。</p>
${s.group.map(m => `<label class="d-block border rounded p-2 mb-2"><input type="radio" name="keep" value="${m.ID}" ${String(s.st.keep) === String(m.ID) ? "checked" : ""}>
    <b>${E(m.MaterialName)}</b>　${priced(m) ? money(m.CostPrice, 4) + "/" + E(m.Unit || "g") : '<span class="text-danger">沒有單價</span>'}
    <span class="text-muted small">${[m.Category, m.OriginCountry, m.Specification].filter(Boolean).map(E).join("・")}　被 ${data.details.filter(d => String(d.MaterialID) === String(m.ID)).length} 個配方食材使用</span></label>`).join("")}`;
        el.querySelectorAll("[name=keep]").forEach(r => r.addEventListener("change", () => { s.st.keep = r.value; }));
    }

    async function aDupes(s) {

        const keep = matById(s.st.keep);
        const others = s.group.filter(m => String(m.ID) !== String(keep.ID));
        const ops = [];

        // 其他原料的規格 / 產地 / 供應商選項，一起併進保留的原料（相同的不重複加）
        // 保留的原料只有手動單價、沒有任何規格時，不動它的單價（避免合併後成本被悄悄改掉）
        let list = MaterialQuick.parsePackages(keep);
        const mergeOptions = list.length > 0 || !priced(keep);
        const addedIds = new Set();

        if (mergeOptions) {
            const same = (a, b) => num(a.weight) === num(b.weight) && num(a.price) === num(b.price) && String(a.origin || "") === String(b.origin || "") && String(a.supplier || "") === String(b.supplier || "");
            others.forEach(o => MaterialQuick.parsePackages(o).forEach(p => {
                const q = Object.assign({}, p, { origin: p.origin || o.OriginCountry || "", def: false });
                if (!list.some(x => same(x, q))) { if (list.some(x => String(x.id) === String(q.id))) q.id = MaterialQuick.newId(); list.push(q); addedIds.add(String(q.id)); }
            }));
        }

        others.forEach(o => {
            const oldOpts = MaterialQuick.parsePackages(o);
            data.details.filter(d => String(d.MaterialID) === String(o.ID)).forEach(d => {
                // 食材原本指定的規格選項：保留的原料裡有相同的就沿用，沒有就改為跟著原料預設
                const mine = d.PackageId ? oldOpts.find(p => String(p.id) === String(d.PackageId)) : null;
                const hit = mine && mergeOptions ? list.find(x => String(x.id) === String(mine.id) || (num(x.weight) === num(mine.weight) && num(x.price) === num(mine.price) && String(x.origin || "") === String(mine.origin || o.OriginCountry || ""))) : null;
                const pid = hit ? String(hit.id) : "";
                const price = hit ? num(hit.price) / num(hit.weight) : (has(keep.CostPrice) ? keep.CostPrice : d.UnitCost);
                ops.push({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { MaterialID: String(keep.ID), MaterialName: keep.MaterialName, UnitCost: price, PackageId: pid, Remark: "" } });
                Object.assign(d, { MaterialID: String(keep.ID), MaterialName: keep.MaterialName, UnitCost: price, PackageId: pid });
            });
            ops.push({ action: "update", table: "Material", id: o.ID, data: { IsActive: false, Remark: `已合併到「${keep.MaterialName}」（${keep.ID}）` } });
            o.IsActive = false;
        });

        if (addedIds.size) {
            const pf = MaterialQuick.packageFields(list);
            if (pf) {
                const patch = { PackagesJson: pf.PackagesJson };
                if (!priced(keep)) Object.assign(patch, { CostPrice: pf.CostPrice, PackageWeight: pf.PackageWeight, PackagePrice: pf.PackagePrice });
                ops.push({ action: "update", table: "Material", id: keep.ID, data: patch });
                Object.assign(keep, patch);
            }
        }

        if (ops.length) await API.batch(ops, { loadingText: "合併中…" });
    }

    // =========================
    // 2a. 名稱相同的食材：一次核可
    // =========================
    function rAuto(s) {
        $("#crBody").innerHTML = `
<p class="text-muted small">這些食材的名稱和原料庫的原料寫法一致（忽略空白、全形半形、括號），已有單價。核可後會把配方裡的食材連到對應的原料。</p>
<table class="table table-sm align-middle"><thead><tr><th>配方裡的食材</th><th>→ 原料庫</th><th class="text-end">單價</th><th class="text-end">配方數</th></tr></thead><tbody>
${s.items.map(x => `<tr><td>${E(x.g.name)}</td><td>${E(x.m.MaterialName)}</td><td class="text-end">${money(x.m.CostPrice, 4)}/${E(x.m.Unit || "g")}</td><td class="text-end">${x.g.formulas.size}</td></tr>`).join("")}</tbody></table>`;
    }

    async function aAuto(s) {
        const ops = [];
        s.items.forEach(({ g, m }) => g.rows.forEach(d => {
            ops.push({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { MaterialID: String(m.ID), MaterialName: m.MaterialName, UnitCost: m.CostPrice, Remark: "" } });
            Object.assign(d, { MaterialID: String(m.ID), MaterialName: m.MaterialName, UnitCost: m.CostPrice, Remark: "" });
        }));
        for (let i = 0; i < ops.length; i += 40) await API.batch(ops.slice(i, i + 40), { loadingText: "更新配方食材中…" });
    }

    // =========================
    // 2b. 單一食材：對上原料、填包裝與價格
    // =========================
    function initIngredient(s) {
        const best = s.g.material || (s.cands[0] && s.cands[0].s >= .6 ? s.cands[0].m : null);
        s.st = { pick: best ? String(best.ID) : "new" };
        fillIng(s);
    }

    function fillIng(s) {
        const m = s.st.pick === "new" ? null : matById(s.st.pick);
        Object.assign(s.st, m ? {
            name: m.MaterialName, unit: m.Unit || "g", price: m.CostPrice ?? "",
            origin: m.OriginCountry || "", spec: m.Specification || ""
        } : { name: s.g.name, unit: "g", price: "", origin: "", spec: "" });
        s.st.pkgs = m ? MaterialQuick.parsePackages(m) : [];
        // 這個食材目前指定的規格選項（配方裡已經選過的）
        const used = s.g.rows.map(d => d.PackageId).find(Boolean);
        s.st.pkgId = used && s.st.pkgs.some(p => String(p.id) === String(used)) ? String(used) : "";
        if (!s.st.pkgs.length) s.st.pkgs = [{ id: MaterialQuick.newId(), label: "", weight: "", price: "", origin: "", supplier: "", def: false }];
    }

    function rIngredient(s) {

        if (!s.st) initIngredient(s);
        const st = s.st;
        const others = mats().filter(m => !s.cands.some(c => String(c.m.ID) === String(m.ID)));

        $("#crBody").innerHTML = `
<div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2"><div class="small text-muted">用在 ${s.g.formulas.size} 個配方：${E([...s.g.formulas].slice(0, 6).join("、"))}${s.g.formulas.size > 6 ? "…" : ""}　${s.g.material ? `（原料「${E(s.g.material.MaterialName)}」還沒有單價）` : "（還沒對上原料庫）"}</div>
<button type="button" class="btn btn-sm btn-outline-warning" id="crSemi" title="自己泡製 / 熬煮的（例如伯爵茶、焦糖醬、濃縮咖啡）：新增成配方，在那個配方登入食材，成本自動寫回">🍳 這是自己做的（再製品）→ 新增成配方</button></div>
<div class="mb-2 fw-bold small">對應到哪個原料？</div>
${s.cands.map(c => `<label class="d-block border rounded px-2 py-1 mb-1"><input type="radio" name="pick" value="${c.m.ID}" ${String(st.pick) === String(c.m.ID) ? "checked" : ""}>
    ${E(c.m.MaterialName)}　<span class="small ${priced(c.m) ? "" : "text-danger"}">${priced(c.m) ? money(c.m.CostPrice, 4) + "/" + E(c.m.Unit || "g") : "沒有單價"}</span>
    <span class="small text-muted">相似 ${Math.round(c.s * 100)}%　${[c.m.OriginCountry, c.m.Specification].filter(Boolean).map(E).join("・")}</span></label>`).join("")}
<div class="d-flex gap-2 align-items-center mb-1"><label class="border rounded px-2 py-1 flex-shrink-0"><input type="radio" name="pick" value="other" ${st.pick === "other" ? "checked" : ""}> 從全部原料選</label>
    <select class="form-select form-select-sm" id="crOther"><option value="">選擇…</option>${others.map(m => `<option value="${m.ID}" data-cat="${E(m.Category || "")}" ${String(st.pick) === String(m.ID) && !s.cands.some(c => String(c.m.ID) === String(m.ID)) ? "selected" : ""}>${E(m.MaterialName)}</option>`).join("")}</select></div>
<label class="d-block border rounded px-2 py-1 mb-3"><input type="radio" name="pick" value="new" ${st.pick === "new" ? "checked" : ""}> ＋ 新增為新原料</label>
<div class="row g-2">
    <div class="col-md-6"><label class="form-label small mb-0">原料名稱</label><input class="form-control form-control-sm" data-k="name" value="${E(st.name)}"></div>
    <div class="col-md-3"><label class="form-label small mb-0">單位</label><input class="form-control form-control-sm" data-k="unit" value="${E(st.unit)}"></div>
    <div class="col-md-3"><label class="form-label small mb-0">產地（選填）</label><input class="form-control form-control-sm" data-k="origin" value="${E(st.origin)}"></div>
    <div class="col-md-6"><label class="form-label small mb-0">規格說明（選填）</label><input class="form-control form-control-sm" data-k="spec" value="${E(st.spec)}"></div>
    <div class="col-md-6"><label class="form-label small mb-0">單價（每 ${E(st.unit || "g")}；有填下方規格時自動算出）</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="price" value="${E(st.price)}"></div>
</div>
<div id="crPk" class="mt-3"></div>
<div id="crOpt" class="mt-3"></div>
<div class="small text-muted mt-2">同一個原料可以有好幾種包裝（例如 1L 瓶、4L 桶）：每種填內容量與價格，再選「計價用」的那一個（沒選就用最便宜的）。核可後，所有同名食材都會連到這個原料並套用單價。</div>`;

        const syncPrice = () => {
            const f = MaterialQuick.packageFields(st.pkgs);
            const input = el.querySelector("[data-k=price]");
            input.readOnly = !!f;
            if (f) { st.price = f.CostPrice; input.value = f.CostPrice; }
        };
        // 這個食材用哪一個規格 / 產地 / 供應商（選項來自上面的規格表，改了規格表會即時更新）
        const optBox = el.querySelector("#crOpt");
        const drawOptions = () => {
            const valid = st.pkgs.filter(p => MaterialQuick.unitOf(p) > 0);
            if (st.pkgId && !valid.some(p => String(p.id) === String(st.pkgId))) st.pkgId = "";
            if (valid.length < 2) { st.pkgId = ""; optBox.innerHTML = ""; return; }
            const def = MaterialQuick.chosen(st.pkgs);
            optBox.innerHTML = `<div class="small fw-bold mb-1">這個配方的食材用哪一種？</div>
<label class="d-block border rounded px-2 py-1 mb-1"><input type="radio" name="pkopt" value="" ${st.pkgId ? "" : "checked"}> 跟著原料的計價用規格${def ? `（${E(MaterialQuick.optionLabel(def, st.unit))}）` : ""}　<span class="small text-muted">原料改計價規格時，成本會跟著變</span></label>
${valid.map(p => `<label class="d-block border rounded px-2 py-1 mb-1"><input type="radio" name="pkopt" value="${E(p.id)}" ${String(st.pkgId) === String(p.id) ? "checked" : ""}> ${E(MaterialQuick.optionLabel(p, st.unit))}</label>`).join("")}`;
            optBox.querySelectorAll("[name=pkopt]").forEach(r => r.addEventListener("change", () => { st.pkgId = r.value; }));
        };

        const pk = el.querySelector("#crPk");
        pk.innerHTML = MaterialQuick.packagesHtml(st.pkgs, st.unit || "g");
        MaterialQuick.bindPackages(pk, st.pkgs, () => st.unit || "g", () => { syncPrice(); drawOptions(); });
        syncPrice();
        drawOptions();

        el.querySelector("#crSemi").addEventListener("click", () => makeSemi(s));

        el.querySelectorAll("[name=pick]").forEach(r => r.addEventListener("change", () => {
            st.pick = r.value === "other" ? (el.querySelector("#crOther").value || "other") : r.value;
            if (r.value !== "other") fillIng(s); else if (st.pick !== "other") fillIng(s);
            rIngredient(s);
        }));
        if (window.TomSelect) new TomSelect(el.querySelector("#crOther"), { refreshThrottle: 0, maxOptions: null, score: MaterialQuick.fuzzy.score, dropdownParent: "body", render: { no_results: (d, esc) => `<div class="no-results px-2 py-1 text-muted">原料庫沒有符合「${esc(d.input)}」的原料（可改選「＋ 新增為新原料」）</div>` }, placeholder: "輸入關鍵字搜尋原料…" });
        el.querySelector("#crOther").addEventListener("change", e => {
            if (!e.target.value) return;
            st.pick = e.target.value;
            fillIng(s);
            rIngredient(s);
        });
        el.querySelectorAll("[data-k]").forEach(i => i.addEventListener("input", () => {
            st[i.dataset.k] = i.value;
            if (i.dataset.k === "unit") pk.innerHTML = MaterialQuick.packagesHtml(st.pkgs, st.unit || "g");
        }));
    }

    // 這個食材是自己做的：新增成再製品配方（已有同名配方就沿用），食材改連到那個配方，然後到那個配方登入食材與用量
    async function makeSemi(s) {

        if (busy) return;

        const name = String(s.g.name || "").trim();
        let sub = data.formulas.find(f => String(f.FormulaName).trim() === name);

        if (!confirm(sub
            ? `已經有一個配方叫「${name}」，要把它當作這個食材的再製品，並開啟它登入食材嗎？`
            : `「${name}」是自己做的（泡製 / 熬煮）嗎？\n\n會新增一個配方「${name}」，接著帶你到那個配方登入食材與用量；儲存後成本會自動算出，並寫回用到它的配方。`)) return;

        try {
            busy = true;
            if (!sub) { sub = await API.insert("Formula", { FormulaName: name, YieldQty: 1, YieldUnit: "g", UnitWeight: 1000, YieldRate: 100, IsActive: true, IsSemi: true }); data.formulas.push(sub); }
            else if (sub.IsSemi !== true) Object.assign(sub, await API.update("Formula", sub.FormulaID, { IsSemi: true }));

            const gram = Cost.subGramCost(sub.FormulaID, data.formulas, data.details, data.materials).price;
            const ops = s.g.rows.map(d => ({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { SubFormulaId: String(sub.FormulaID), MaterialID: "", MaterialName: name, PackageId: "", UnitCost: Math.round(gram * 1e6) / 1e6, Remark: "" } }));
            for (let i = 0; i < ops.length; i += 40) await API.batch(ops.slice(i, i + 40), { loadingText: "更新配方食材中…" });
            s.g.rows.forEach(d => Object.assign(d, { SubFormulaId: String(sub.FormulaID), MaterialID: "", PackageId: "", UnitCost: gram, Remark: "" }));

            changed = true;
            pendingOpen = String(sub.FormulaID);
            busy = false;
            modal.hide();
        } catch (err) {
            App.error(err, "建立失敗");
        } finally {
            busy = false;
        }
    }

    async function aIngredient(s) {

        const st = s.st;
        const name = String(st.name || "").trim();
        if (st.pick === "other") { alert("請從下拉選單選一個原料（或改選「新增為新原料」）"); return false; }
        if (!name) { alert("請輸入原料名稱"); return false; }
        const pf = MaterialQuick.packageFields(st.pkgs);
        if (!pf && !(num(st.price) > 0)) { alert("請填單價，或填至少一個包裝規格的內容量與價格（自動計算）"); return false; }

        const body = Object.assign({
            MaterialName: name, Unit: String(st.unit || "g").trim() || "g", CostPrice: num(st.price), OriginCountry: String(st.origin || "").trim(),
            Specification: String(st.spec || "").trim()
        }, pf || { PackageWeight: null, PackagePrice: null, PackagesJson: "" });

        let m = st.pick === "new" || st.pick === "other" ? null : matById(st.pick);
        m = m ? Object.assign(m, await API.update("Material", m.ID, body)) : await API.insert("Material", Object.assign({ IsActive: true, Category: "" }, body));
        if (!data.materials.some(x => String(x.ID) === String(m.ID))) data.materials.push(m);

        // 這個食材（同名 / 同原料）在配方裡的每一列：連到原料、套用單價（指定了規格就用那個規格）、清掉 ⚠️ 待確認
        const pid = st.pkgId && Cost.optionPrice(m, st.pkgId) !== null ? String(st.pkgId) : "";
        const price = pid ? Cost.optionPrice(m, pid) : m.CostPrice;
        const ops = s.g.rows.map(d => ({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { MaterialID: String(m.ID), MaterialName: m.MaterialName, UnitCost: price, PackageId: pid, Remark: "" } }));
        // 同一個原料已連結的其他配方列：沒指定規格的跟著原料；指定規格的用那個規格的單價
        data.details.filter(d => String(d.MaterialID) === String(m.ID) && !s.g.rows.includes(d)).forEach(d => ops.push({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { UnitCost: Cost.detailPrice(d, m) } }));
        for (let i = 0; i < ops.length; i += 40) await API.batch(ops.slice(i, i + 40), { loadingText: "更新配方食材中…" });

        s.g.rows.forEach(d => Object.assign(d, { MaterialID: String(m.ID), MaterialName: m.MaterialName, UnitCost: price, PackageId: pid, Remark: "" }));
    }

    // =========================
    // 3. 配方
    // =========================
    function formulaCalc(f, st) {
        const details = (st.rows || detailsOf(f.FormulaID)).filter(d => String(d.MaterialName || "").trim() || d.SubFormulaId);
        const view = Object.assign({}, f, { YieldRate: has(st.yieldRate) ? st.yieldRate : f.YieldRate, UnitWeight: has(st.unitWeight) ? st.unitWeight : f.UnitWeight });
        const pg = Cost.perGram(view, details, data.materials, { formulas: data.formulas, allDetails: data.details, materials: data.materials, seen: new Set([String(f.FormulaID)]) });
        const uw = Cost.unitWeight(view, details);
        const extra = num(st.pack) + num(st.labor) + num(st.other);
        return { details, pg, uw, perPortion: pg.value * uw + extra, extra };
    }

    const normName = v => String(v || "").normalize("NFKC").trim().toLowerCase();

    // 食材這一列的單價 / 狀態欄
    function formulaRowStatus(d) {
        const m = matById(d.MaterialID);
        const subF = d.SubFormulaId ? data.formulas.find(f => String(f.FormulaID) === String(d.SubFormulaId)) : null;
        const price = subF ? Cost.subGramCost(subF.FormulaID, data.formulas, data.details, data.materials).price : Cost.detailPrice(d, m);
        const opt = m && d.PackageId ? Cost.options(m).find(o => String(o.id) === String(d.PackageId)) : null;
        return `<td class="text-end">${price ? money(price, 4) : "-"}</td>
            <td class="small">${!price ? '<span class="text-danger">沒有單價</span>' : subF ? '<span class="text-success">🍳 再製品</span>' : !m ? '<span class="text-warning">未連到原料庫</span>' : '<span class="text-success">已連結</span>'}${opt ? `<div class="text-muted">${E(MaterialQuick.optionLabel(opt, m.Unit))}</div>` : ""}${d.Remark ? ` <span class="text-danger">⚠️ ${E(d.Remark)}</span>` : ""}</td>`;
    }

    // 改了食材名稱：對得上原料庫就連結並帶入單價，對不上就當作還沒連結的食材
    function setFormulaRowName(d, name) {
        const prevMat = String(d.MaterialID || "");
        d.MaterialName = String(name || "").trim();
        const m = mats().find(x => normName(x.MaterialName) === normName(d.MaterialName));
        if (m) {
            if (String(m.ID) !== prevMat) d.PackageId = "";
            d.MaterialID = String(m.ID);
            d.MaterialName = m.MaterialName;
            d.UnitCost = Cost.detailPrice(d, m);
            d.Remark = "";
        } else {
            d.MaterialID = "";
            d.PackageId = "";
            d.UnitCost = 0;
        }
    }

    function rFormula(s) {

        const f = s.f;
        if (!s.st) s.st = { name: f.FormulaName || "", yieldRate: f.YieldRate ?? "", unitWeight: f.UnitWeight ?? "", pack: f.PackagingCost ?? "", labor: f.LaborCost ?? "", other: f.OtherCost ?? "", rows: detailsOf(f.FormulaID).map(d => Object.assign({}, d)) };
        const st = s.st;

        $("#crBody").innerHTML = `
<div class="mb-2"><label class="form-label small mb-0">配方名稱</label><input class="form-control form-control-sm" data-k="name" value="${E(st.name)}"></div>
<table class="table table-sm align-middle mb-1">
<thead><tr><th style="min-width:200px">食材（可打字搜尋原料庫）</th><th class="text-end" style="width:110px">基準 g</th><th class="text-end">單價/g</th><th>狀態</th><th style="width:36px"></th></tr></thead>
<tbody id="crRows">${st.rows.map((d, i) => `<tr data-i="${i}">
    <td>${d.SubFormulaId ? `${E(d.MaterialName || "")} <span class="badge text-bg-light border">🍳 再製品</span>` : `<select data-r="name"></select>`}</td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm text-end" data-r="qty" value="${E(d.Quantity ?? "")}"></td>
    ${formulaRowStatus(d).replace("<td class=\"text-end\">", "<td class=\"text-end\" data-pr>").replace("<td class=\"small\">", "<td class=\"small\" data-st>")}
    <td><button type="button" class="btn btn-sm btn-outline-danger py-0" data-r="del" title="刪除這個食材">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="text-muted">這個配方還沒有食材，請按下方「＋ 新增食材」</td></tr>`}</tbody></table>
<button type="button" class="btn btn-sm btn-outline-primary mb-3" id="crAddRow">＋ 新增食材</button>
<div class="row g-2 mb-2">
    <div class="col-md-3"><label class="form-label small mb-0">成品率 %（選填）</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="yieldRate" value="${E(st.yieldRate)}" placeholder="100"></div>
    <div class="col-md-3"><label class="form-label small mb-0">每份重量 g（選填）</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="unitWeight" value="${E(st.unitWeight)}"></div>
    <div class="col-md-2"><label class="form-label small mb-0">包材 / 份</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="pack" value="${E(st.pack)}"></div>
    <div class="col-md-2"><label class="form-label small mb-0">人工 / 份</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="labor" value="${E(st.labor)}"></div>
    <div class="col-md-2"><label class="form-label small mb-0">其他 / 份</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="other" value="${E(st.other)}"></div>
</div>
<div class="alert alert-light border small mb-0" id="crCalc"></div>`;

        const calc = () => {
            const k = formulaCalc(f, st);
            const base = k.details.reduce((t, d) => t + num(d.Quantity), 0);
            el.querySelector("#crCalc").innerHTML = `原料總重 ${Math.round(base * 10) / 10} g　每公克成本 <b>${money(k.pg.value, 4)}</b>　每份（${Math.round(k.uw * 10) / 10} g）成本 <b class="text-success">${money(k.perPortion)}</b>` +
                (k.pg.missing.length ? `<div class="text-danger mt-1">⚠️ 沒有單價（成本會偏低）：${E([...new Set(k.pg.missing)].join("、"))}。請先按「略過」，重新開啟精靈從食材開始確認。</div>` : "");
        };
        calc();

        // 食材名稱：可打字搜尋原料庫，也可以直接輸入新的名稱
        el.querySelectorAll("#crRows [data-r=name]").forEach(sel => {
            const tr = sel.closest("tr"), d = st.rows[Number(tr.dataset.i)];
            const names = mats().map(m => m.MaterialName);
            if (d.MaterialName && names.indexOf(d.MaterialName) < 0) names.unshift(d.MaterialName);
            sel.innerHTML = `<option value=""></option>` + names.map(n => `<option value="${E(n)}">${E(n)}</option>`).join("");
            sel.value = d.MaterialName || "";
            if (!window.TomSelect) { sel.addEventListener("change", () => { setFormulaRowName(d, sel.value); refreshRow(tr, d); calc(); }); return; }
            new TomSelect(sel, {
                refreshThrottle: 0, maxOptions: null, create: true, createOnBlur: true, persist: false, score: MaterialQuick.fuzzy.score, dropdownParent: "body", placeholder: "輸入關鍵字搜尋原料…",
                render: { option_create: (dd, esc) => `<div class="create">使用新名稱「${esc(dd.input)}」</div>`, no_results: () => `<div class="no-results px-2 py-1 text-muted">原料庫沒有符合的原料，可直接輸入新名稱</div>` },
                onChange: v => { setFormulaRowName(d, v); refreshRow(tr, d); calc(); }
            });
        });
        const refreshRow = (tr, d) => {
            const t = document.createElement("tr");
            t.innerHTML = formulaRowStatus(d);
            tr.querySelector("[data-pr]").innerHTML = t.children[0].innerHTML;
            tr.querySelector("[data-st]").innerHTML = t.children[1].innerHTML;
        };
        el.querySelectorAll("#crRows [data-r=qty]").forEach(inp => inp.addEventListener("input", () => { st.rows[Number(inp.closest("tr").dataset.i)].Quantity = inp.value; calc(); }));
        el.querySelectorAll("#crRows [data-r=del]").forEach(b => b.addEventListener("click", () => {
            const d = st.rows[Number(b.closest("tr").dataset.i)];
            if (!confirm(`從這個配方移除「${d.MaterialName || "（空白）"}」？（按「核可」後才會真正儲存）`)) return;
            st.rows.splice(st.rows.indexOf(d), 1);
            rFormula(s);
        }));
        el.querySelector("#crAddRow").addEventListener("click", () => {
            st.rows.push({ FormulaDetailID: null, FormulaID: f.FormulaID, MaterialID: "", MaterialName: "", Quantity: "", UnitCost: 0, PackageId: "", SubFormulaId: "", Remark: "" });
            rFormula(s);
            setTimeout(() => { const t = el.querySelectorAll("#crRows tr:last-child .ts-control input"); if (t.length) t[t.length - 1].focus(); }, 50);
        });
        el.querySelectorAll("[data-k]").forEach(i => i.addEventListener("input", () => { st[i.dataset.k] = i.value; calc(); }));
    }

    async function aFormula(s) {

        const f = s.f, st = s.st;
        const name = String(st.name || "").trim();
        if (!name) { alert("請輸入配方名稱"); return false; }

        // 空白的新食材不儲存
        st.rows = st.rows.filter(d => d.FormulaDetailID || d.SubFormulaId || String(d.MaterialName || "").trim() || has(d.Quantity));
        if (st.rows.some(d => !d.SubFormulaId && !String(d.MaterialName || "").trim())) { alert("有食材還沒有填名稱"); return false; }

        const c = formulaCalc(f, st);

        if (c.pg.missing.length && !confirm(`還有 ${new Set(c.pg.missing).size} 個食材沒有單價（${[...new Set(c.pg.missing)].slice(0, 5).join("、")}），成本會偏低。仍要核可這個配方嗎？`)) return false;

        let who = "";
        try { who = (await API.me({ silent: true }))?.user?.Name || ""; } catch { }

        // 食材：刪除、修改、新增（一起送出）
        const orig = detailsOf(f.FormulaID);
        const kept = new Set(st.rows.filter(d => d.FormulaDetailID).map(d => String(d.FormulaDetailID)));
        const ops = [];
        orig.filter(d => !kept.has(String(d.FormulaDetailID))).forEach(d => ops.push({ action: "remove", table: "FormulaDetail", id: d.FormulaDetailID }));
        st.rows.forEach((d, i) => {
            const patch = { MaterialID: String(d.MaterialID || ""), MaterialName: d.MaterialName || "", Quantity: num(d.Quantity), UnitCost: num(d.UnitCost), PackageId: d.PackageId || "", Remark: "", LineCost: r2(num(d.Quantity) * num(d.UnitCost)), SortOrder: i + 1 };
            const old = d.FormulaDetailID ? orig.find(x => String(x.FormulaDetailID) === String(d.FormulaDetailID)) : null;
            if (old) {
                if (Object.keys(patch).every(k => String(old[k] ?? "") === String(patch[k] ?? ""))) return;
                ops.push({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: patch });
            } else {
                ops.push({ action: "insert", table: "FormulaDetail", data: Object.assign({ FormulaID: f.FormulaID, SubFormulaId: "" }, patch) });
            }
        });

        if (ops.length) {
            const results = [];
            for (let i = 0; i < ops.length; i += 40) results.push(...(await API.batch(ops.slice(i, i + 40), { loadingText: "儲存配方食材中…" }) || []));
            ops.forEach((op, i) => {
                if (op.action === "remove") { const at = data.details.findIndex(x => String(x.FormulaDetailID) === String(op.id)); if (at >= 0) data.details.splice(at, 1); }
                else if (op.action === "insert") data.details.push(Object.assign({}, op.data, results[i] || {}));
                else { const x = data.details.find(y => String(y.FormulaDetailID) === String(op.id)); if (x) Object.assign(x, op.data); }
            });
        }

        const body = {
            FormulaName: name,
            IsVerified: true, VerifiedAt: new Date().toLocaleString("sv-SE").slice(0, 16), VerifiedBy: who,
            YieldRate: has(st.yieldRate) ? num(st.yieldRate) : null, UnitWeight: has(st.unitWeight) ? num(st.unitWeight) : null,
            PackagingCost: has(st.pack) ? num(st.pack) : null, LaborCost: has(st.labor) ? num(st.labor) : null, OtherCost: has(st.other) ? num(st.other) : null,
            MaterialCost: r2(c.pg.value * c.uw * (num(f.YieldQty) || 1)), UnitCost: r2(c.perPortion), TotalCost: r2(c.perPortion * (num(f.YieldQty) || 1))
        };

        Object.assign(f, await API.update("Formula", f.FormulaID, body));

        // 還有 ⚠️ 待確認備註的食材（沒改到的）一併清掉
        const rest = detailsOf(f.FormulaID).filter(d => d.Remark);
        if (rest.length) { await API.batch(rest.map(d => ({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { Remark: "" } })), { silent: true }); rest.forEach(d => { d.Remark = ""; }); }
    }

    // =========================
    // 3.5 重複的配方：同一個配方有多個規格的產品（名稱或食材相同）→ 比對、選一個為主，其他併入（產品改連到主配方）或保留
    // =========================
    const FKEEP = "cr_fkeep";
    const pairKey = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join("-");
    const loadKept = () => { try { return new Set(JSON.parse(localStorage.getItem(FKEEP) || "[]")); } catch { return new Set(); } };
    const saveKept = keys => { try { const s = loadKept(); keys.forEach(k => s.add(k)); localStorage.setItem(FKEEP, JSON.stringify([...s])); } catch { } };

    // 配方的食材：key（名稱 / 再製品）→ { label, qty }
    function formulaItems(f) {
        const map = new Map();
        detailsOf(f.FormulaID).forEach(d => {
            const m = matById(d.MaterialID);
            const label = d.SubFormulaId ? (d.MaterialName || "再製品") : (m ? m.MaterialName : d.MaterialName) || "";
            const key = d.SubFormulaId ? "f:" + d.SubFormulaId : "n:" + norm(label);
            const cur = map.get(key) || { label, qty: 0 };
            cur.qty += num(d.Quantity);
            map.set(key, cur);
        });
        return map;
    }

    const formulaProducts = f => data.products.filter(p => String(p.FormulaID) === String(f.FormulaID) || (has(f.ProductID) && String(p.ID) === String(f.ProductID)))
        .filter((p, i, a) => a.indexOf(p) === i);

    function findFormulaGroups() {
        const kept = loadKept();
        const fs = data.formulas.filter(f => f.IsActive !== false);
        const items = new Map(fs.map(f => [String(f.FormulaID), formulaItems(f)]));
        const parent = new Map(fs.map(f => [String(f.FormulaID), String(f.FormulaID)]));
        const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };

        for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
            const a = fs[i], b = fs[j];
            if (kept.has(pairKey(a.FormulaID, b.FormulaID))) continue;
            const A = items.get(String(a.FormulaID)), B = items.get(String(b.FormulaID));
            const both = [...A.keys()].filter(k => B.has(k)).length;
            const jacc = both / (A.size + B.size - both || 1);
            if (similarity(formulaName(a), formulaName(b)) >= .75 || (A.size >= 3 && B.size >= 3 && jacc >= .8))
                parent.set(find(String(a.FormulaID)), find(String(b.FormulaID)));
        }

        const groups = new Map();
        fs.forEach(f => { const r = find(String(f.FormulaID)); (groups.get(r) || groups.set(r, []).get(r)).push(f); });

        return [...groups.values()].filter(g => g.length >= 2).map(g => {
            const rank = f => [f.IsVerified === true ? 1 : 0, formulaProducts(f).length, detailsOf(f.FormulaID).length];
            const sorted = g.slice().sort((x, y) => { const a = rank(x), b = rank(y); return (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]) || (formulaName(x).length - formulaName(y).length); });
            return sorted;
        });
    }

    function rFDupes(s) {

        const group = s.group;
        if (!s.st) s.st = { primary: String(group[0].FormulaID), merge: {} };
        const st = s.st;
        group.forEach(f => { if (!(String(f.FormulaID) in st.merge)) st.merge[String(f.FormulaID)] = true; });

        const items = group.map(f => formulaItems(f));
        const totals = items.map(m => [...m.values()].reduce((t, x) => t + x.qty, 0));
        const keys = [];
        const labels = new Map();
        items.forEach(m => m.forEach((v, k) => { if (!labels.has(k)) { labels.set(k, v.label); keys.push(k); } }));
        keys.sort((a, b) => Math.max(...items.map(m => (m.get(b) || { qty: 0 }).qty)) - Math.max(...items.map(m => (m.get(a) || { qty: 0 }).qty)));

        const head = group.map((f, i) => {
            const pg = Cost.perGram(f, detailsOf(f.FormulaID), data.materials, { formulas: data.formulas, allDetails: data.details, materials: data.materials, seen: new Set([String(f.FormulaID)]) });
            const prods = formulaProducts(f);
            return `<th class="text-center" style="min-width:150px"><label class="d-block"><input type="radio" name="fdPrimary" value="${f.FormulaID}" ${st.primary === String(f.FormulaID) ? "checked" : ""}> <b>以此為主</b></label>
                <div class="fw-bold">${E(formulaName(f))}</div>
                <div class="text-muted fw-normal">${f.IsVerified === true ? "✅ 已核可" : "尚未核可"}　成品率 ${has(f.YieldRate) ? E(f.YieldRate) + "%" : "100%"}</div>
                <div class="text-muted fw-normal">每 g 成本 ${pg.value ? money(pg.value, 4) : "-"}</div>
                <div class="fw-normal mt-1">${prods.length ? prods.map(p => `<span class="badge text-bg-light border">${E(p.ProductName || p.ID)}</span>`).join(" ") : '<span class="text-muted">沒有連到產品</span>'}</div></th>`;
        }).join("");

        const rows = keys.map(k => {
            const pcts = items.map((m, i) => (m.has(k) && totals[i] > 0 ? m.get(k).qty / totals[i] * 100 : null));
            const present = pcts.filter(x => x !== null);
            const diff = present.length < pcts.length || Math.max(...present) - Math.min(...present) > 2;
            return `<tr class="${diff ? "table-warning" : ""}"><td>${E(labels.get(k))}</td>${items.map((m, i) => m.has(k)
                ? `<td class="text-center">${Math.round(m.get(k).qty * 10) / 10} g <span class="text-muted">(${(pcts[i] || 0).toFixed(1)}%)</span></td>`
                : `<td class="text-center text-danger">— 沒有</td>`).join("")}</tr>`;
        }).join("");

        const foot = group.map(f => String(f.FormulaID) === st.primary
            ? `<td class="text-center text-success fw-bold">✔ 保留（主配方）</td>`
            : `<td class="text-center"><label><input type="checkbox" data-fm="${f.FormulaID}" ${st.merge[String(f.FormulaID)] ? "checked" : ""}> 併入主配方並刪除</label><div class="text-muted small">不勾 = 保留這個配方</div></td>`).join("");

        $("#crBody").innerHTML = `
<div class="small text-muted mb-2">這幾個配方的名稱或食材很像，可能是同一個配方（例如同一種冰淇淋有不同規格的產品）。先比對下方的食材（黃色列 = 用量比例不同或缺少），再選<b>以哪一個為主</b>：打勾的配方會<b>併入主配方並刪除</b>，原本連到它的產品與再製品都會改連到主配方；不打勾就保留。</div>
<div class="table-responsive"><table class="table table-sm table-bordered align-middle small mb-2">
<thead><tr><th>食材</th>${head}</tr></thead>
<tbody>${rows || `<tr><td colspan="${group.length + 1}" class="text-muted">這些配方都還沒有食材</td></tr>`}</tbody>
<tfoot><tr><th>處理方式</th>${foot}</tfoot></table></div>
<div class="alert alert-light border small mb-0">要保留所有配方：把「併入」都取消勾選再按「確定」，之後就不會再提醒這幾個配方。還沒決定可以按「略過」。</div>`;

        el.querySelectorAll("[name=fdPrimary]").forEach(r => r.addEventListener("change", () => { st.primary = r.value; rFDupes(s); }));
        el.querySelectorAll("[data-fm]").forEach(c => c.addEventListener("change", () => { st.merge[c.dataset.fm] = c.checked; }));
    }

    async function aFDupes(s) {

        const st = s.st, group = s.group;
        const primary = group.find(f => String(f.FormulaID) === st.primary);
        const gone = group.filter(f => String(f.FormulaID) !== st.primary && st.merge[String(f.FormulaID)]);
        const stay = group.filter(f => !gone.includes(f));

        if (gone.length) {
            const nProd = gone.reduce((t, f) => t + formulaProducts(f).filter(p => String(p.FormulaID) === String(f.FormulaID)).length, 0);
            if (!confirm(`以「${formulaName(primary)}」為主，刪除 ${gone.length} 個配方（${gone.map(formulaName).join("、")}）？\n${nProd} 個產品會改連到主配方；被刪除配方的食材明細也會一併刪除，無法復原。`)) return false;

            const goneIds = new Set(gone.map(f => String(f.FormulaID)));
            const ops = [];

            data.products.filter(p => goneIds.has(String(p.FormulaID))).forEach(p => ops.push({ action: "update", table: "Products", id: p.ID, data: { FormulaID: String(primary.FormulaID) } }));

            // 別的配方裡把被刪除的配方當再製品用 → 改連到主配方（主配方自己用到的就移除，避免自己包含自己）
            data.details.filter(d => d.SubFormulaId && goneIds.has(String(d.SubFormulaId)) && !goneIds.has(String(d.FormulaID))).forEach(d => {
                if (String(d.FormulaID) === String(primary.FormulaID)) ops.push({ action: "remove", table: "FormulaDetail", id: d.FormulaDetailID });
                else ops.push({ action: "update", table: "FormulaDetail", id: d.FormulaDetailID, data: { SubFormulaId: String(primary.FormulaID) } });
            });

            gone.forEach(f => {
                ops.push({ action: "removeWhere", table: "FormulaDetail", where: { FormulaID: f.FormulaID } });
                ops.push({ action: "remove", table: "Formula", id: f.FormulaID });
            });

            for (let i = 0; i < ops.length; i += 40) await API.batch(ops.slice(i, i + 40), { loadingText: "整合配方中…" });

            // 更新本機資料
            data.products.forEach(p => { if (goneIds.has(String(p.FormulaID))) p.FormulaID = String(primary.FormulaID); });
            ops.filter(o => o.table === "FormulaDetail" && o.action !== "removeWhere").forEach(o => {
                const at = data.details.findIndex(d => String(d.FormulaDetailID) === String(o.id));
                if (at < 0) return;
                if (o.action === "remove") data.details.splice(at, 1); else Object.assign(data.details[at], o.data);
            });
            data.details = data.details.filter(d => !goneIds.has(String(d.FormulaID)));
            data.formulas = data.formulas.filter(f => !goneIds.has(String(f.FormulaID)));

            // 清單裡這些配方的確認項目不需要了
            const before = queue.slice(0, idx + 1).filter(x => x.type === "formula" && goneIds.has(String(x.f.FormulaID))).length;
            queue = queue.filter(x => !(x.type === "formula" && goneIds.has(String(x.f.FormulaID))));
            idx -= before;
        }

        // 選擇保留的配方：記住，不再提醒
        const keys = [];
        stay.forEach(a => stay.forEach(b => { if (String(a.FormulaID) < String(b.FormulaID)) keys.push(pairKey(a.FormulaID, b.FormulaID)); }));
        saveKept(keys);
    }

    // =========================
    // 4. 產品：對上配方、公克數、包材 → 成本
    // =========================
    function weightGuess(p) {
        if (num(p.Weight) > 0) return num(p.Weight);
        const m = String(`${p.Capacity || ""} ${p.Specification || ""}`).normalize("NFKC").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|公斤|g|公克|克|l|公升|ml|毫升|cc)/);
        if (!m) return 0;
        const n = Number(m[1]), u = m[2];
        return /kg|公斤|^l$|公升/.test(u) ? n * 1000 : n;       // 公升 ≈ 1000 g（冰品、液體以 1 ml ≈ 1 g 估算）
    }

    function initProduct(s) {

        const p = s.p;
        const cand = data.formulas.map(f => ({ f, s: String(f.ProductID) === String(p.ID) ? 2 : similarity(p.ProductName, f.FormulaName) }))
            .filter(x => x.s >= .4).sort((a, b) => b.s - a.s).slice(0, 5);

        const fid = p.FormulaID || (cand[0] && cand[0].s >= .6 ? String(cand[0].f.FormulaID) : "");
        const all = Cost.parsePackaging(p.PackagingJson);
        const pack = all.filter(x => x.Kind !== "decor").map(x => ({ MaterialID: String(x.MaterialID ?? ""), Qty: x.Qty ?? 1 }));
        const decor = all.filter(x => x.Kind === "decor");      // 裝飾 / 配料：在產品頁編輯，精靈只保留並計入成本

        s.cand = cand;
        s.st = {
            useFormula: !(p.CostVerified === true && !p.FormulaID && has(p.CostPrice)), formulaId: fid ? String(fid) : "",
            mode: p.FormulaUseMode === "portion" ? "portion" : "weight",
            qty: has(p.FormulaUseQty) ? p.FormulaUseQty : (weightGuess(p) || ""), pack, decor, manual: has(p.CostPrice) ? p.CostPrice : ""
        };
    }

    const packChoices = () => { const a = mats().filter(m => /包/.test(m.Category || "")); return a.length ? a : mats(); };

    function productCalc(s) {
        const st = s.st;
        return Cost.product({ FormulaID: st.useFormula ? st.formulaId : "", FormulaUseMode: st.mode, FormulaUseQty: st.qty,
            PackagingJson: JSON.stringify(st.useFormula ? st.pack.filter(x => x.MaterialID).concat((st.decor || []).map(x => Object.assign({}, x))) : []) }, data.formulas, data.details, data.materials);
    }

    function rProduct(s) {

        if (!s.st) initProduct(s);
        const p = s.p, st = s.st;
        const sel = new Set(s.cand.map(c => String(c.f.FormulaID)));

        $("#crBody").innerHTML = `
<div class="small text-muted mb-2">售價 ${has(p.SalePrice) ? money(p.SalePrice) : "未填"}　目前成本 ${has(p.CostPrice) && num(p.CostPrice) ? money(p.CostPrice) : "<span class='text-danger'>沒有</span>"}　重量 ${num(p.Weight) ? num(p.Weight) + " g" : "未填"}${p.Capacity ? "　容量 " + E(p.Capacity) : ""}${p.Specification ? "　規格 " + E(p.Specification) : ""}</div>
<div class="btn-group btn-group-sm mb-3" role="group">
    <input type="radio" class="btn-check" name="useF" id="uf1" value="1" ${st.useFormula ? "checked" : ""}><label class="btn btn-outline-primary" for="uf1">用配方計算成本</label>
    <input type="radio" class="btn-check" name="useF" id="uf0" value="0" ${st.useFormula ? "" : "checked"}><label class="btn btn-outline-primary" for="uf0">不用配方，直接填成本</label>
</div>
<div id="crF" class="${st.useFormula ? "" : "d-none"}">
    <div class="row g-2 mb-2">
        <div class="col-md-6"><label class="form-label small mb-0">配方${s.cand.length ? "（建議的排在前面）" : ""}</label>
            <select class="form-select form-select-sm" data-k="formulaId"><option value="">請選擇配方…</option>
            ${s.cand.map(c => `<option value="${c.f.FormulaID}" ${String(st.formulaId) === String(c.f.FormulaID) ? "selected" : ""}>★ ${E(formulaName(c.f))}${c.s >= 2 ? "（配方指定了此產品）" : `（相似 ${Math.round(c.s * 100)}%）`}</option>`).join("")}
            ${data.formulas.filter(f => !sel.has(String(f.FormulaID))).map(f => `<option value="${f.FormulaID}" ${String(st.formulaId) === String(f.FormulaID) ? "selected" : ""}>${E(formulaName(f))}</option>`).join("")}</select></div>
        <div class="col-md-3"><label class="form-label small mb-0">用量單位</label>
            <select class="form-select form-select-sm" data-k="mode"><option value="weight" ${st.mode === "weight" ? "selected" : ""}>重量（成品 g）</option><option value="portion" ${st.mode === "portion" ? "selected" : ""}>份數（配方幾份）</option></select></div>
        <div class="col-md-3"><label class="form-label small mb-0">此產品用量（${st.mode === "weight" ? "g" : "份"}）</label><input type="number" min="0" step="any" class="form-control form-control-sm" data-k="qty" value="${E(st.qty)}"></div>
    </div>
    <div class="small fw-bold mb-1">包材（選填）</div>
    <div id="crPack"></div>
    <button type="button" class="btn btn-sm btn-outline-primary mb-2" id="crAddPack">＋ 加入包材</button>
</div>
<div id="crM" class="${st.useFormula ? "d-none" : ""}"><label class="form-label small mb-0">成本（每個產品，$）</label><input type="number" min="0" step="any" class="form-control form-control-sm" style="max-width:200px" data-k="manual" value="${E(st.manual)}"></div>
<div class="alert alert-light border small mt-2 mb-0" id="crCalc"></div>`;

        const packHtml = () => {
            el.querySelector("#crPack").innerHTML = st.pack.map((x, i) => `<div class="d-flex gap-1 mb-1" data-i="${i}">
                <select class="form-select form-select-sm" data-pm><option value="">選擇包材…</option>${packChoices().map(m => `<option value="${m.ID}" ${String(x.MaterialID) === String(m.ID) ? "selected" : ""}>${E(m.MaterialName)}${priced(m) ? "（" + money(m.CostPrice, 4) + "/" + E(m.Unit || "個") + "）" : "（沒有單價）"}</option>`).join("")}</select>
                <input type="number" min="0" step="any" class="form-control form-control-sm" style="max-width:90px" data-pq value="${E(x.Qty)}"><button type="button" class="btn btn-sm btn-link text-danger p-0" data-pd>✕</button></div>`).join("");
        };

        const calc = () => {
            const box = el.querySelector("#crCalc");
            if (!st.useFormula) { const sp = num(p.SalePrice), c = num(st.manual); box.innerHTML = `成本 <b>${money(c)}</b>${sp > 0 ? `　毛利 ${money(sp - c)}（${((sp - c) / sp * 100).toFixed(1)}%）` : ""}`; return; }
            const c = productCalc(s), sp = num(p.SalePrice);
            box.innerHTML = c.hasFormula
                ? `用量 ${Math.round(c.grams * 10) / 10} g　配方原料 ${money(c.formula)}　人工/其他 ${money(c.extra)}　包材 ${money(c.packaging)}<br>每個產品成本 <b class="text-success">${money(c.total)}</b>${sp > 0 ? `　毛利 ${money(sp - c.total)}（${((sp - c.total) / sp * 100).toFixed(1)}%）` : ""}` +
                (c.missing.length ? `<div class="text-danger mt-1">⚠️ 沒有單價：${E([...new Set(c.missing)].join("、"))}</div>` : "") + (!c.grams ? `<div class="text-danger mt-1">請填此產品的用量</div>` : "")
                : "請選擇配方";
        };

        packHtml();
        calc();

        el.querySelectorAll("[name=useF]").forEach(r => r.addEventListener("change", () => { st.useFormula = r.value === "1"; rProduct(s); }));
        el.querySelectorAll("[data-k]").forEach(i => i.addEventListener(i.tagName === "SELECT" ? "change" : "input", () => {
            st[i.dataset.k] = i.value;
            if (i.tagName === "SELECT") rProduct(s); else calc();
        }));
        const addBtn = el.querySelector("#crAddPack");
        if (addBtn) addBtn.addEventListener("click", () => { st.pack.push({ MaterialID: "", Qty: 1 }); packHtml(); });
        el.querySelector("#crPack").addEventListener("change", e => { const i = Number(e.target.closest("[data-i]").dataset.i); if (e.target.matches("[data-pm]")) st.pack[i].MaterialID = e.target.value; calc(); });
        el.querySelector("#crPack").addEventListener("input", e => { if (e.target.matches("[data-pq]")) { st.pack[Number(e.target.closest("[data-i]").dataset.i)].Qty = e.target.value; calc(); } });
        el.querySelector("#crPack").addEventListener("click", e => { if (e.target.matches("[data-pd]")) { st.pack.splice(Number(e.target.closest("[data-i]").dataset.i), 1); packHtml(); calc(); } });
    }

    async function aProduct(s) {

        const p = s.p, st = s.st;
        let body;

        if (!st.useFormula) {
            if (!has(st.manual)) { alert("請填成本"); return false; }
            body = { FormulaID: "", FormulaUseMode: "", FormulaUseQty: null, PackagingJson: "[]", CostPrice: r2(num(st.manual)), CostVerified: true };
        } else {
            if (!st.formulaId) { alert("請選擇配方，或改選「不用配方，直接填成本」"); return false; }
            if (!(num(st.qty) > 0)) { alert("請填此產品的用量（公克或份數）"); return false; }
            const c = productCalc(s);
            if (c.missing.length && !confirm(`這些項目沒有單價，成本會偏低：${[...new Set(c.missing)].slice(0, 6).join("、")}。仍要核可嗎？`)) return false;
            const pack = st.pack.filter(x => x.MaterialID).map(x => { const m = matById(x.MaterialID); return { MaterialID: String(x.MaterialID), Name: m ? m.MaterialName : "", Qty: num(x.Qty), UnitCost: m && has(m.CostPrice) ? num(m.CostPrice) : "" }; });
            body = { FormulaID: String(st.formulaId), FormulaUseMode: st.mode, FormulaUseQty: num(st.qty), PackagingJson: JSON.stringify(pack.concat(st.decor || [])), CostPrice: r2(c.total), CostVerified: true };
        }

        Object.assign(p, await API.update("Products", p.ID, body));
    }

    // =========================
    // 入口
    // =========================
    async function open(o = {}) {

        opts = o;
        approved = 0;
        changed = false;

        try {
            await load();
        } catch (err) {
            App.error(err, "讀取資料失敗");
            return;
        }

        queue = build();

        if (!queue.length) {
            alert(o.formulaId ? "這個配方的食材都已確認 👍" : "目前沒有需要確認的項目 👍");
            return;
        }

        if (!el) frame();
        idx = 0;
        render();
        modal.show();
    }

    return { open, countIssues, norm, similarity };

})();
