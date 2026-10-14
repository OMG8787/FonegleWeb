// =========================================================
// 快速新增 / 修改原料與包材（配方頁、產品頁、成本確認精靈、原料頁共用）
//   MaterialQuick.open({ material, name, category, unit, onSaved })
//     material：要修改的原料（沒有 = 新增）；name / category / unit：新增時的預設值
//     onSaved(row)：儲存成功後回傳完整的原料資料
//   需要 Bootstrap JS（modal）與 API；寫入權限同「原料」頁（商品與生產）
//
//   同一個原料可以有多種包裝規格與價格（例如鮮奶 1L 瓶 $85、4L 桶 $280）：
//     packages：[{ label, weight, price, def }]；每單位單價 = 價格 ÷ 內容量
//     「計價用」那一個的單價 = 原料單價（CostPrice），配方與產品成本都用它；沒指定就用最便宜的
// =========================================================
window.MaterialQuick = (() => {

    "use strict";

    const E = App.esc;
    const n = v => { const x = Number(String(v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };
    const unitOf = p => (n(p.weight) > 0 && n(p.price) > 0 ? n(p.price) / n(p.weight) : 0);
    const money4 = v => "$" + (Math.round(v * 10000) / 10000).toLocaleString();
    const newId = () => "p" + Math.random().toString(36).slice(2, 8);

    // =========================
    // 包裝規格與價格（共用工具）
    // =========================
    function parsePackages(m) {
        let list = [];
        try { const a = JSON.parse((m && m.PackagesJson) || "[]"); if (Array.isArray(a)) list = a.filter(x => x && typeof x === "object"); } catch { }
        list = list.map(x => ({ id: String(x.id || newId()), label: String(x.label || ""), weight: x.weight ?? "", price: x.price ?? "", origin: String(x.origin || ""), supplier: String(x.supplier || ""), def: x.def === true }));
        // 舊資料只有單一包裝重量 / 價格
        if (!list.length && m && n(m.PackageWeight) > 0 && n(m.PackagePrice) > 0) list = [{ id: newId(), label: m.Specification || "", weight: m.PackageWeight, price: m.PackagePrice, origin: m.OriginCountry || "", supplier: "", def: true }];
        return list;
    }

    // 計價用的規格：標記為計價用的；沒標記就用最便宜的
    function chosen(list) {
        const ok = list.filter(p => unitOf(p) > 0);
        return ok.find(p => p.def) || ok.slice().sort((a, b) => unitOf(a) - unitOf(b))[0] || null;
    }

    // 要寫回原料的欄位（沒有任何有效規格 → null，由呼叫端用手動單價）
    function packageFields(list) {
        const c = chosen(list);
        if (!c) return null;
        const keep = list.filter(p => unitOf(p) > 0 || String(p.label || "").trim());
        return Object.assign({
            CostPrice: Math.round(unitOf(c) * 1e6) / 1e6, PackageWeight: n(c.weight), PackagePrice: n(c.price),
            PackagesJson: JSON.stringify(keep.map(p => ({
                id: p.id || newId(), label: String(p.label || "").trim(), weight: n(p.weight), price: n(p.price),
                origin: String(p.origin || "").trim(), supplier: String(p.supplier || "").trim(), def: p === c
            })))
        }, String(c.origin || "").trim() ? { OriginCountry: String(c.origin).trim() } : {});
    }

    // 一個選項的文字說明：1000g｜紐西蘭｜ABC｜$200（$0.2/g）
    function optionLabel(p, unit) {
        const u = unit || "g";
        return [p.label || (n(p.weight) ? n(p.weight) + u : ""), p.origin, p.supplier, n(p.price) ? "$" + n(p.price) : ""].filter(Boolean).join("｜") +
            (unitOf(p) ? `（${money4(unitOf(p))}/${u}）` : "");
    }

    function noteHtml(list, u) {
        const c = chosen(list);
        return c
            ? `計價用：${E(c.label || "未命名")} → <b>${money4(unitOf(c))}/${E(u)}</b>${list.filter(p => unitOf(p) > 0).length > 1 ? "（沒指定時用最便宜的）" : ""}`
            : "填內容量與價格，會自動算每單位單價";
    }

    function packagesHtml(list, unit) {

        const u = E(unit || "g");
        const c = chosen(list);

        return `<div class="small fw-bold mb-1">包裝規格與價格（同一個原料可以有多種包裝）</div>
<div class="table-responsive"><table class="table table-sm align-middle mb-1"><thead><tr><th style="min-width:110px">規格名稱</th><th style="width:100px" class="text-end">內容量（${u}）</th><th style="width:90px" class="text-end">價格 $</th><th style="min-width:90px">產地</th><th style="min-width:90px">供應商</th><th style="width:90px" class="text-end">每 ${u}</th><th style="width:56px" class="text-center">計價用</th><th style="width:30px"></th></tr></thead><tbody>
${list.map((p, i) => `<tr>
    <td><input class="form-control form-control-sm" data-pk="label" data-i="${i}" value="${E(p.label)}" placeholder="例如 1L 瓶 / 4L 桶"></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm text-end" data-pk="weight" data-i="${i}" value="${E(p.weight)}"></td>
    <td><input type="number" min="0" step="any" class="form-control form-control-sm text-end" data-pk="price" data-i="${i}" value="${E(p.price)}"></td>
    <td><input class="form-control form-control-sm" data-pk="origin" data-i="${i}" value="${E(p.origin)}" placeholder="紐西蘭"></td>
    <td><input class="form-control form-control-sm" data-pk="supplier" data-i="${i}" value="${E(p.supplier)}" placeholder="ABC"></td>
    <td class="text-end small" data-u="${i}">${unitOf(p) ? money4(unitOf(p)) : "-"}</td>
    <td class="text-center"><input type="radio" name="pkdef" data-pk="def" data-i="${i}" ${c === p ? "checked" : ""}></td>
    <td><button type="button" class="btn btn-sm btn-link text-danger p-0" data-pk="del" data-i="${i}" title="刪除這個規格">✕</button></td></tr>`).join("")}</tbody></table></div>
<button type="button" class="btn btn-sm btn-outline-primary" data-pk="add">＋ 新增規格</button>
<span class="small text-muted ms-2" data-pk-note>${noteHtml(list, unit || "g")}</span>`;
    }

    // 綁定事件：list 會被直接修改；unit() 回傳目前單位；onChange 在內容改變時呼叫（輸入時不重畫表格，不會中斷打字）
    function bindPackages(root, list, unit, onChange) {

        const refresh = () => {
            const el = root.querySelector("[data-pk-note]");
            if (el) el.innerHTML = noteHtml(list, unit());
            list.forEach((p, i) => { const t = root.querySelector(`[data-u="${i}"]`); if (t) t.textContent = unitOf(p) ? money4(unitOf(p)) : "-"; });
            const c = chosen(list);
            root.querySelectorAll("[data-pk=def]").forEach((r, i) => { r.checked = c === list[i]; });
        };

        root.addEventListener("input", e => {
            const k = e.target.dataset.pk;
            if (!k || k === "def" || k === "add" || k === "del") return;
            list[Number(e.target.dataset.i)][k] = e.target.value;
            refresh();
            onChange();
        });

        root.addEventListener("click", e => {
            const b = e.target.closest("[data-pk]");
            if (!b) return;
            const k = b.dataset.pk;
            if (k === "def") { const i = Number(b.dataset.i); list.forEach((p, j) => { p.def = j === i; }); refresh(); onChange(); }
            else if (k === "add") { list.push({ id: newId(), label: "", weight: "", price: "", origin: "", supplier: "", def: false }); root.innerHTML = packagesHtml(list, unit()); onChange(); }
            else if (k === "del") { list.splice(Number(b.dataset.i), 1); root.innerHTML = packagesHtml(list, unit()); onChange(); }
        });
    }

    // =========================
    // 快速新增 / 修改視窗
    // =========================
    let modal = null, el = null, current = null, done = null, pkgs = [];

    const FIELDS = [
        ["MaterialName", "名稱", "col-md-8"],
        ["Category", "分類（包材請填「包材」）", "col-md-4"],
        ["Unit", "單位（原料 g、包材 個）", "col-md-3"],
        ["CostPrice", "單價（每單位；有填下方規格時自動算出）", "col-md-5"],
        ["OriginCountry", "產地", "col-md-4"],
        ["Specification", "規格說明", "col-md-6"],
        ["Remark", "備註", "col-md-6"]
    ];

    function build() {

        el = document.createElement("div");
        el.className = "modal fade";
        el.tabIndex = -1;
        el.innerHTML = `
<div class="modal-dialog modal-xl"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title" id="mqTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><div class="row g-2">${FIELDS.map(([k, l, c]) => `
        <div class="${c}"><label class="form-label small mb-0">${l}</label><input id="mq_${k}" class="form-control form-control-sm" ${k === "CostPrice" ? 'type="number" step="any" min="0"' : ""} ${k === "Category" ? 'list="mqCats"' : ""}></div>`).join("")}
    </div><div id="mqPk" class="mt-3"></div><datalist id="mqCats"><option value="包材"><option value="冷凍"><option value="乳製品"><option value="糖類"><option value="粉類"></datalist>
    <div class="small text-muted mt-2" id="mqHint"></div></div>
    <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">取消</button><button type="button" class="btn btn-primary" id="mqSave">💾 儲存</button></div>
</div></div>`;
        document.body.appendChild(el);
        modal = new bootstrap.Modal(el);
        el.querySelector("#mqSave").addEventListener("click", save);
    }

    const val = k => el.querySelector("#mq_" + k).value.trim();

    // 有有效規格 → 單價由計價用規格決定（欄位唯讀）；沒有 → 手動填單價
    function syncPrice() {
        const f = packageFields(pkgs);
        const input = el.querySelector("#mq_CostPrice");
        input.readOnly = !!f;
        if (f) input.value = f.CostPrice;
    }

    function open(o = {}) {

        if (!el) build();

        current = o.material || null;
        done = o.onSaved || null;

        const src = current || { MaterialName: o.name || "", Category: o.category || "", Unit: o.unit || "g" };

        el.querySelector("#mqTitle").textContent = current ? `✏️ 修改：${current.MaterialName}` : "＋ 新增到原料庫";
        FIELDS.forEach(([k]) => { el.querySelector("#mq_" + k).value = src[k] ?? ""; });

        pkgs = parsePackages(current);
        if (!pkgs.length) pkgs = [{ id: newId(), label: "", weight: "", price: "", origin: "", supplier: "", def: false }];

        // 換掉容器（清掉上一次綁定的事件）
        const old = el.querySelector("#mqPk");
        const box = old.cloneNode(false);
        old.replaceWith(box);
        box.innerHTML = packagesHtml(pkgs, src.Unit || "g");
        bindPackages(box, pkgs, () => el.querySelector("#mq_Unit").value.trim() || "g", syncPrice);
        el.querySelector("#mq_Unit").oninput = () => { box.innerHTML = packagesHtml(pkgs, el.querySelector("#mq_Unit").value.trim() || "g"); };
        syncPrice();

        el.querySelector("#mqHint").textContent = current
            ? "修改後，所有連結這個原料的配方與產品，名稱與單價都會跟著更新（配方裡已記錄的單價要按「更新單價」才會換）。"
            : "新增後會自動連結到目前這一列。";

        modal.show();
        setTimeout(() => el.querySelector("#mq_MaterialName").focus(), 300);
    }

    async function save() {

        const data = {};
        FIELDS.forEach(([k]) => { data[k] = val(k); });

        if (!data.MaterialName) { alert("請輸入名稱"); return; }

        const pf = packageFields(pkgs);
        if (pf) Object.assign(data, pf); else Object.assign(data, { PackageWeight: null, PackagePrice: null, PackagesJson: "" });

        data.CostPrice = data.CostPrice === "" || data.CostPrice === null || data.CostPrice === undefined ? null : Number(data.CostPrice);
        if (data.CostPrice !== null && (isNaN(data.CostPrice) || data.CostPrice < 0)) { alert("單價請輸入 0 以上的數字"); return; }
        if (!data.Unit) data.Unit = "g";

        const btn = el.querySelector("#mqSave");

        try {
            btn.disabled = true;
            const row = current ? await API.update("Material", current.ID, data) : await API.insert("Material", Object.assign({ IsActive: true }, data));
            modal.hide();
            if (done) done(row);
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            btn.disabled = false;
        }
    }

    // 模糊搜尋（給 TomSelect 用）：連續包含分數最高；其次是「字依序出現」（例如「鮮油」找得到「鮮奶油」）；空白分隔的多個關鍵字都要符合
    const fuzzy = {
        score(search) {
            const words = String(search || "").toLowerCase().split(/\s+/).filter(Boolean);
            return item => {
                const text = String(item.text || "").toLowerCase();
                if (!words.length) return 1;
                let total = 0;
                for (const w of words) {
                    const at = text.indexOf(w);
                    if (at >= 0) { total += 10 + (at === 0 ? 3 : 0) + w.length / text.length; continue; }
                    let i = 0, first = -1, last = -1;
                    for (const ch of w) { const j = text.indexOf(ch, i); if (j < 0) return 0; if (first < 0) first = j; last = j; i = j + 1; }
                    total += 1 + w.length / (last - first + 1);
                }
                return total;
            };
        }
    };

    return { fuzzy, open, parsePackages, packagesHtml, bindPackages, packageFields, chosen, unitOf, optionLabel, newId };

})();
