window.Pages = window.Pages || {};

// =========================================================
// 品牌資訊：內容存在資料庫（BrandBlocks 表，一列一個區塊），程式裡不放任何公司資料
//   所有登入的人都能看（每一段都有 📋 複製）；市集營運 / 系統管理可以線上編輯
//   編輯用「新增區塊」選單：大標題、文字、資料欄、產品清單、連結、表格、項目清單、公司資料（自動帶入設定）、圖片
// =========================================================
Pages.Brand = (() => {

    "use strict";

    const E = App.esc;
    const dom = {};

    let saved = [];          // 資料庫裡的內容：[{ id, type, data }]
    let draft = null;        // 編輯中的副本；null = 瀏覽模式
    let startJson = "";      // 開始編輯時的內容（判斷有沒有改）
    let openIdx = 0;
    let products = null;     // Products 表（null 沒讀過、false 沒權限）

    const canEdit = () => Auth.hasPermission(21, 10, 3);

    const COMPANY_FIELDS = [
        ["brandName", "品牌名稱"], ["brandShort", "品牌簡稱"], ["companyName", "抬頭（公司名稱）"], ["taxId", "統一編號"],
        ["contactName", "聯絡人"], ["phone", "電話"], ["email", "Email"], ["address", "地址"], ["lineId", "LINE ID"],
        ["lineUrl", "LINE 連結"], ["instagramUrl", "Instagram"], ["website", "官方網站"], ["linkTreeUrl", "連結樹"]
    ];
    const DEFAULT_COMPANY = ["brandName", "companyName", "taxId", "contactName", "phone", "email", "lineId", "address"];

    const safeHref = u => (/^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
    const safeImg = u => (/^https:\/\/[^\s"'<>()\\]+$/.test(String(u || "").trim()) ? String(u).trim() : "");
    const lines = t => String(t || "").split("\n").map(s => s.trim()).filter(Boolean);
    const copyBtn = (text, title) => `<span class="copy-btn" data-copy="${E(text)}" title="${title || "複製"}">📋</span>`;
    const linkOrText = u => (safeHref(u) ? `<a href="${E(safeHref(u))}" target="_blank" rel="noopener noreferrer">${E(u)}</a>` : E(u));

    // =========================
    // 區塊類型：make 新增時的內容、sum 摘要、view 瀏覽畫面、edit 編輯畫面
    // =========================
    const TYPES = {

        heading: {
            label: "大標題", icon: "🔖", make: () => ({ text: "新標題", level: "h2" }), sum: d => d.text,
            view: d => (d.level === "h3" ? `<h5 class="mt-3 mb-2">${E(d.text)}</h5>` : `<h4 class="mt-4 mb-2 pb-1 border-bottom">${E(d.text)}</h4>`),
            edit: (d, i) => `<div class="row g-2">${inp(i, "text", "標題文字", { col: "col-8" })}${inp(i, "level", "大小", { col: "col-4", opts: [["h2", "大標題"], ["h3", "小標題"]] })}</div>`
        },

        text: {
            label: "文字段落", icon: "📝", make: () => ({ title: "", text: "" }), sum: d => d.title || lines(d.text)[0] || "",
            view: d => card(d.title, String(d.text || "").split(/\n{2,}/).map(t => t.trim()).filter(Boolean)
                .map(t => `<div class="note-block">${E(t)} ${copyBtn(t, "複製這一段")}</div>`).join("")),
            edit: (d, i) => inp(i, "title", "標題（選填）") + inp(i, "text", "內容（空一行分一段，每段都有複製按鈕）", { area: 6 })
        },

        fields: {
            label: "資料欄（名稱 + 內容）", icon: "📇", make: () => ({ title: "基本資料", rows: [{ label: "欄位 1", value: "值 1" }, { label: "欄位 2", value: "值 2" }] }),
            sum: d => `${d.title || ""}（${(d.rows || []).length} 列）`,
            view: d => card(d.title, (d.rows || []).map(r => `<div class="mb-1"><strong>${E(r.label)}：</strong>${E(r.value)} ${copyBtn(r.value)}</div>`).join("") +
                allBtn((d.rows || []).map(r => `${r.label}：${r.value}`).join("\n"))),
            edit: (d, i) => inp(i, "title", "標題") + (d.rows || []).map((r, k) => `<div class="d-flex gap-1 mb-1 align-items-start">
<input class="form-control form-control-sm" style="max-width:36%" data-i="${i}" data-p="rows.${k}.label" value="${E(r.label)}" placeholder="名稱">
<textarea class="form-control form-control-sm" rows="1" data-i="${i}" data-p="rows.${k}.value" placeholder="內容">${E(r.value)}</textarea>${itemBtns(i, "rows", k)}</div>`).join("") +
                addBtn(i, "rows", { label: "", value: "" }, "新增一列")
        },

        products: {
            label: "產品清單", icon: "🍨", make: () => ({ title: "主打商品", intro: "", items: [{ name: "產品名稱", desc: "說明", price: "" }] }),
            sum: d => `${d.title || ""}（${(d.items || []).length} 項）`,
            view: d => card(d.title, (d.intro ? `<div class="note-block">${E(d.intro)} ${copyBtn(d.intro)}</div>` : "") +
                (d.items || []).map(p => `<div class="prod-line"><span class="n">${E(p.name)}</span><span class="d">${E(p.desc)}</span>${p.price ? `<span class="p">${E(p.price)}</span>` : ""}${copyBtn(prodText(p))}</div>`).join("") +
                allBtn((d.items || []).map(prodText).join("\n"))),
            edit: (d, i) => inp(i, "title", "標題（例如：主打商品、茶韻系列）") + inp(i, "intro", "簡介（選填）", { area: 2 }) +
                (d.items || []).map((p, k) => `<div class="bb-sub"><div class="row g-2">${inp(i, `items.${k}.name`, "名稱", { col: "col-5" })}${inp(i, `items.${k}.desc`, "說明", { col: "col-5" })}${inp(i, `items.${k}.price`, "價格（選填）", { col: "col-2" })}</div>${itemBtns(i, "items", k)}</div>`).join("") +
                addBtn(i, "items", { name: "", desc: "", price: "" }, "新增產品") + pickerHtml(i)
        },

        links: {
            label: "連結清單", icon: "🔗", make: () => ({ title: "連結", items: [{ label: "名稱", url: "https://" }] }),
            sum: d => `${d.title || ""}（${(d.items || []).length} 個）`,
            view: d => card(d.title, (d.items || []).map(x => `<div class="py-1">${E(x.label)}：${linkOrText(x.url)} ${copyBtn(x.url)}</div>`).join("")),
            edit: (d, i) => inp(i, "title", "標題") + (d.items || []).map((x, k) => `<div class="d-flex gap-1 mb-1 align-items-start">
<input class="form-control form-control-sm" style="max-width:34%" data-i="${i}" data-p="items.${k}.label" value="${E(x.label)}" placeholder="名稱">
<input class="form-control form-control-sm" data-i="${i}" data-p="items.${k}.url" value="${E(x.url)}" placeholder="網址（https:// 或 mailto:）">${itemBtns(i, "items", k)}</div>`).join("") +
                addBtn(i, "items", { label: "", url: "https://" }, "新增連結")
        },

        bullets: {
            label: "項目清單", icon: "☑️", make: () => ({ title: "", items: "第一項\n第二項\n第三項" }), sum: d => d.title || lines(d.items)[0] || "",
            view: d => card(d.title, `<ul class="mb-2">${lines(d.items).map(t => `<li>${E(t)} ${copyBtn(t)}</li>`).join("")}</ul>` + allBtn(lines(d.items).join("\n"))),
            edit: (d, i) => inp(i, "title", "標題（選填）") + inp(i, "items", "項目（一行一項）", { area: 5 })
        },

        table: {
            label: "表格（可複製每一列）", icon: "📊", make: () => ({ title: "", rows: [["項目", "內容"], ["欄位 1", "值 1"]] }),
            sum: d => `${d.title || ""}（${(d.rows || []).length} 列）`,
            view: d => {
                const rows = d.rows || [];
                const head = rows[0] || [];
                return card(d.title, `<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>${head.map(c => `<th>${E(c)}</th>`).join("")}<th></th></tr></thead><tbody>${rows.slice(1).map(r =>
                    `<tr>${r.map(c => `<td>${E(c)}</td>`).join("")}<td>${copyBtn(rowText(r))}</td></tr>`).join("")}</tbody></table></div>`);
            },
            edit: (d, i) => inp(i, "title", "標題（選填）") + `<div class="small text-muted mb-1">第一列是表頭</div>` + (d.rows || []).map((r, k) => `<div class="d-flex gap-1 mb-1 align-items-center">${r.map((c, j) =>
                `<input class="form-control form-control-sm" data-i="${i}" data-p="rows.${k}.${j}" value="${E(c)}">`).join("")}${itemBtns(i, "rows", k)}</div>`).join("") +
                `<button class="btn btn-sm btn-outline-primary mb-2" data-act="add" data-i="${i}" data-arr="rows" data-kind="row">＋ 新增一列</button>
<button class="btn btn-sm btn-outline-secondary mb-2 ms-1" data-act="addcol" data-i="${i}">＋ 欄</button>
<button class="btn btn-sm btn-outline-secondary mb-2 ms-1" data-act="delcol" data-i="${i}" ${((d.rows[0] || []).length <= 2) ? "disabled" : ""}>－ 欄</button>`
        },

        company: {
            label: "公司資料（自動帶入設定）", icon: "🏢", make: () => ({ title: "公司資料", fields: DEFAULT_COMPANY.slice() }), sum: d => `${d.title || ""}（自動）`,
            view: d => {
                const c = Site.company;
                const rows = COMPANY_FIELDS.filter(([k]) => (d.fields || []).includes(k) && c[k]);
                return card(d.title, rows.length
                    ? rows.map(([k, l]) => `<div class="mb-1"><strong>${E(l)}：</strong>${/Url$|^website$/.test(k) ? linkOrText(c[k]) : E(c[k])} ${copyBtn(c[k])}</div>`).join("") +
                    allBtn(rows.map(([k, l]) => `${l}：${c[k]}`).join("\n"))
                    : `<div class="text-muted small">還沒有資料。系統管理員可到「系統 → 公司與功能設定」填寫。</div>`);
            },
            edit: (d, i) => inp(i, "title", "標題") + `<div class="small text-muted mb-1">資料來自「系統 → 公司與功能設定」，勾選要顯示哪些：</div>` +
                COMPANY_FIELDS.map(([k, l]) => `<label class="me-3 small"><input type="checkbox" class="form-check-input" data-i="${i}" data-ck="${k}" ${(d.fields || []).includes(k) ? "checked" : ""}> ${E(l)}</label>`).join("")
        },

        image: {
            label: "圖片（網址）", icon: "🖼️", make: () => ({ url: "", caption: "" }), sum: d => d.caption || d.url || "",
            view: d => (safeImg(d.url) ? `<figure class="mb-3"><img src="${E(safeImg(d.url))}" alt="" style="max-width:100%;border-radius:8px"><figcaption class="small text-muted">${E(d.caption)}</figcaption></figure>` : ""),
            edit: (d, i) => inp(i, "url", "圖片網址（https://…）") + inp(i, "caption", "圖說（選填）")
        },

        divider: { label: "分隔線", icon: "➖", make: () => ({}), sum: () => "", view: () => "<hr>", edit: () => `<div class="small text-muted">這裡會畫一條分隔線</div>` }
    };

    const GROUPS = [
        ["📄 文字與資料", ["heading", "text", "fields", "bullets", "table", "company"]],
        ["🍨 產品與連結", ["products", "links", "image", "divider"]]
    ];

    const prodText = p => [p.name, p.desc].filter(Boolean).join("｜") + (p.price ? `　${p.price}` : "");
    const rowText = r => (r.length > 1 ? `${r[0]}：${r.slice(1).join(" / ")}` : String(r[0] || ""));
    const allBtn = text => (text ? `<div class="mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${E(text)}">📋 複製全部</button></div>` : "");
    const card = (title, body) => `<div class="card border-0 shadow-sm mb-3"><div class="card-body">${title ? `<h5 class="mb-3">${E(title)}</h5>` : ""}${body}</div></div>`;

    // =========================
    // 載入 / 儲存
    // =========================
    async function init() {

        ["content", "addBar", "addType", "btnAdd", "btnEdit", "btnSave", "btnCancel", "btnExport", "btnImport", "importFile", "subTitle"].forEach(id => dom[id] = document.getElementById(id));

        dom.addType.innerHTML = GROUPS.map(([g, keys]) => `<optgroup label="${g}">${keys.map(k => `<option value="${k}">${TYPES[k].icon} ${TYPES[k].label}</option>`).join("")}</optgroup>`).join("");

        dom.btnEdit.classList.toggle("d-none", !canEdit());
        dom.btnEdit.addEventListener("click", startEdit);
        dom.btnCancel.addEventListener("click", cancelEdit);
        dom.btnSave.addEventListener("click", save);
        dom.btnAdd.addEventListener("click", addBlock);
        dom.btnExport.addEventListener("click", exportBlocks);
        dom.btnImport.addEventListener("click", () => dom.importFile.click());
        dom.importFile.addEventListener("change", importBlocks);

        dom.content.addEventListener("input", onInput);
        dom.content.addEventListener("change", onInput);
        dom.content.addEventListener("click", onClick);
        document.addEventListener("click", e => {
            const b = e.target.closest("[data-copy]");
            if (b) copy(b.dataset.copy);
        });

        Site.onChange(() => { if (!draft) render(); });

        await load();
    }

    const virtual = () => [{ id: null, type: "company", data: { title: "公司資料", fields: DEFAULT_COMPANY.slice() } }];

    async function load() {

        try {
            const rows = await API.list("BrandBlocks");

            saved = rows
                .sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0) || a.ID - b.ID)
                .map(r => {
                    let data = null;
                    try { data = JSON.parse(r.Data || "{}"); } catch { }
                    return TYPES[r.Type] && data && typeof data === "object" ? { id: r.ID, type: r.Type, data, order: Number(r.SortOrder) || 0 } : null;
                })
                .filter(Boolean);

        } catch (err) {
            App.error(err, "載入品牌資訊失敗");
        }

        render();
    }

    function render() {

        const list = draft || (saved.length ? saved : virtual());

        dom.btnEdit.classList.toggle("d-none", !!draft || !canEdit());
        ["btnSave", "btnCancel", "btnExport", "btnImport", "addBar"].forEach(k => dom[k].classList.toggle("d-none", !draft));
        dom.subTitle.textContent = draft ? "編輯中：新增、排序、修改後按「💾 儲存」" : "報名或介紹專用，點 📋 即可複製";

        if (!draft) {
            dom.content.innerHTML = list.map(b => TYPES[b.type].view(b.data)).join("") +
                (!saved.length ? `<div class="text-muted small">${canEdit() ? "還沒有內容。按右上角「✏️ 編輯內容」新增大標題、產品、連結等區塊。" : "管理人員還沒有新增內容。"}</div>` : "");
            return;
        }

        const top = dom.content.scrollTop;
        dom.content.innerHTML = list.map((b, i) => editCard(b, i, list.length)).join("") || `<div class="text-muted small">還沒有區塊，請從上方新增</div>`;
        dom.content.scrollTop = top;
    }

    function editCard(b, i, n) {

        const T = TYPES[b.type];
        const open = i === openIdx;

        return `<div class="bb" id="bb-${i}">
<div class="bb-h" data-h="${i}"><span>${open ? "▾" : "▸"}</span><span>${T.icon}</span><span class="t">${E(T.label)} <span class="sum">${E(String(T.sum(b.data) || "").slice(0, 30))}</span></span>
<button class="btn btn-sm btn-link" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
<button class="btn btn-sm btn-link" data-act="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""}>↓</button>
<button class="btn btn-sm btn-link" data-act="dup" data-i="${i}" title="複製">⧉</button>
<button class="btn btn-sm btn-link text-danger" data-act="del" data-i="${i}" title="刪除">✕</button></div>
${open ? `<div class="bb-b">${T.edit(b.data, i)}</div>` : ""}</div>`;
    }

    async function save() {

        const keep = new Set(draft.filter(b => b.id).map(b => b.id));
        const ops = [];

        saved.filter(b => !keep.has(b.id)).forEach(b => ops.push({ action: "remove", table: "BrandBlocks", id: b.id }));

        for (let i = 0; i < draft.length; i++) {

            const b = draft[i];
            const data = JSON.stringify(b.data);

            if (data.length > 45000) { alert(`第 ${i + 1} 個區塊內容太長（上限約 45000 字），請拆成兩個區塊`); return; }

            const row = { SortOrder: i + 1, Type: b.type, Data: data };
            const old = b.id ? saved.find(x => x.id === b.id) : null;

            if (!b.id) ops.push({ action: "insert", table: "BrandBlocks", data: row });
            else if (!old || old.type !== b.type || old.order !== i + 1 || JSON.stringify(old.data) !== data) ops.push({ action: "update", table: "BrandBlocks", id: b.id, data: row });
        }

        try {

            dom.btnSave.disabled = true;
            if (ops.length) await API.batch(ops);
            draft = null;
            await load();
            alert(ops.length ? "✅ 已儲存" : "沒有變更");

        } catch (err) {

            App.error(err, "儲存失敗");

        } finally {

            dom.btnSave.disabled = false;
        }
    }

    // =========================
    // 編輯
    // =========================
    function startEdit() {
        draft = JSON.parse(JSON.stringify(saved.length ? saved : virtual()));
        startJson = JSON.stringify(draft.map(b => [b.type, b.data]));
        openIdx = 0;
        render();
    }

    function cancelEdit() {
        if (JSON.stringify(draft.map(b => [b.type, b.data])) !== startJson && !confirm("放棄剛才的修改？")) return;
        draft = null;
        render();
    }

    function addBlock() {
        const type = dom.addType.value;
        draft.splice(openIdx + 1, 0, { id: null, type, data: TYPES[type].make() });
        openIdx = openIdx + 1;
        render();
        document.getElementById(`bb-${openIdx}`)?.scrollIntoView({ block: "nearest" });
    }

    function setPath(o, p, v) {
        const ks = p.split(".");
        const last = ks.pop();
        ks.reduce((a, k) => a[k], o)[last] = v;
    }

    const inp = (i, path, label, o = {}) => {
        const v = path.split(".").reduce((a, k) => (a == null ? a : a[k]), draft[i].data) ?? "";
        const base = `data-i="${i}" data-p="${path}" ${o.re ? 'data-re="1"' : ""}`;
        const el = o.area
            ? `<textarea class="form-control form-control-sm" rows="${o.area}" ${base}>${E(v)}</textarea>`
            : o.opts
                ? `<select class="form-select form-select-sm" ${base}>${o.opts.map(([k, n]) => `<option value="${E(k)}" ${String(v) === k ? "selected" : ""}>${E(n)}</option>`).join("")}</select>`
                : `<input class="form-control form-control-sm" ${base} value="${E(v)}">`;
        return `<div class="${o.col || "mb-2"}"><label class="form-label small mb-0">${label}</label>${el}</div>`;
    };

    const itemBtns = (i, arr, k) => `<button class="btn btn-sm btn-outline-secondary py-0" data-act="aup" data-i="${i}" data-arr="${arr}" data-k="${k}" title="上移" ${k === 0 ? "disabled" : ""}>↑</button>
<button class="btn btn-sm btn-link text-danger p-0" data-act="adel" data-i="${i}" data-arr="${arr}" data-k="${k}" title="刪除">✕</button>`;

    const addBtn = (i, arr, tpl, label) => `<button class="btn btn-sm btn-outline-primary mb-2" data-act="add" data-i="${i}" data-arr="${arr}" data-tpl="${E(JSON.stringify(tpl))}">＋ ${label}</button>`;

    // 產品清單：可以從產品資料庫挑（需要產品讀取權限），也可以手動輸入
    function pickerHtml(i) {

        if (products === false) return `<div class="small text-muted">沒有產品資料庫的讀取權限，請手動輸入產品。</div>`;
        if (products === null) return `<button class="btn btn-sm btn-outline-secondary mb-2 ms-1" data-act="pick-load" data-i="${i}">📦 從產品資料庫加入…</button>`;

        return `<div class="d-flex gap-1 mb-2"><select class="form-select form-select-sm" data-pick="${i}">${products.map(p => `<option value="${p.ID}">${E(p.SKU ? p.SKU + " " : "")}${E(p.ProductName)}</option>`).join("") || "<option value=''>（產品資料庫是空的）</option>"}</select>
<button class="btn btn-sm btn-outline-primary text-nowrap" data-act="pick-add" data-i="${i}">加入</button></div>`;
    }

    function onInput(e) {

        const t = e.target;

        if (t.dataset.ck) {
            const d = draft[Number(t.dataset.i)].data;
            const set = new Set(d.fields || []);
            if (t.checked) set.add(t.dataset.ck); else set.delete(t.dataset.ck);
            d.fields = COMPANY_FIELDS.map(f => f[0]).filter(k => set.has(k));
            return;
        }

        if (t.dataset.pick !== undefined || !t.dataset.p || !draft) return;
        if (e.type === "input" && t.tagName === "SELECT") return;

        const i = Number(t.dataset.i);
        setPath(draft[i].data, t.dataset.p, t.value);

        if (t.dataset.re) { render(); return; }

        const T = TYPES[draft[i].type];
        const sum = document.querySelector(`#bb-${i} .sum`);
        if (sum) sum.textContent = String(T.sum(draft[i].data) || "").slice(0, 30);
    }

    async function onClick(e) {

        const btn = e.target.closest("[data-act]");

        if (!btn) {
            const h = e.target.closest("[data-h]");
            if (h && draft) { const i = Number(h.dataset.h); openIdx = openIdx === i ? -1 : i; render(); }
            return;
        }

        if (!draft) return;

        const i = Number(btn.dataset.i);
        const act = btn.dataset.act;
        const d = draft[i].data;

        if (act === "up" && i > 0) { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; openIdx = i - 1; }
        else if (act === "down" && i < draft.length - 1) { [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; openIdx = i + 1; }
        else if (act === "dup") { draft.splice(i + 1, 0, { id: null, type: draft[i].type, data: JSON.parse(JSON.stringify(d)) }); openIdx = i + 1; }
        else if (act === "del") { if (!confirm("刪除這個區塊？（按儲存後才會真的刪除）")) return; draft.splice(i, 1); openIdx = Math.min(openIdx, draft.length - 1); }
        else if (act === "add") {
            const arr = d[btn.dataset.arr];
            arr.push(btn.dataset.kind === "row" ? Array.from({ length: (arr[0] || []).length || 2 }, () => "") : JSON.parse(btn.dataset.tpl));
        }
        else if (act === "adel") d[btn.dataset.arr].splice(Number(btn.dataset.k), 1);
        else if (act === "aup") { const a = d[btn.dataset.arr]; const k = Number(btn.dataset.k); if (k > 0) [a[k - 1], a[k]] = [a[k], a[k - 1]]; }
        else if (act === "addcol") d.rows.forEach(r => r.push(""));
        else if (act === "delcol") { if ((d.rows[0] || []).length > 2) d.rows.forEach(r => r.pop()); }
        else if (act === "pick-load") {
            try { products = (await API.list("Products", null, { silent: true })).filter(p => p.IsActive !== false); } catch { products = false; }
        }
        else if (act === "pick-add") {
            const sel = document.querySelector(`[data-pick="${i}"]`);
            const p = (products || []).find(x => String(x.ID) === String(sel?.value));
            if (!p) return;
            d.items.push({ name: p.ProductName || "", desc: [p.Flavor, p.Specification, p.Capacity].filter(Boolean).join("｜") || p.Description || "", price: p.SalePrice ? "$" + p.SalePrice : "" });
        }
        else return;

        render();
    }

    // =========================
    // 匯出 / 匯入（備份，或把內容搬到另一個系統）
    // =========================
    function exportBlocks() {

        const list = draft || (saved.length ? saved : virtual());
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ fonegleBrandPage: 1, blocks: list.map(b => ({ type: b.type, data: b.data })) }, null, 2)], { type: "application/json" }));
        a.download = "品牌資訊.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async function importBlocks() {

        const f = dom.importFile.files[0];
        dom.importFile.value = "";
        if (!f) return;

        try {
            const d = JSON.parse(await f.text());
            if (!d || d.fonegleBrandPage !== 1 || !Array.isArray(d.blocks) || d.blocks.length > 300) throw new Error("不是品牌資訊檔");

            const blocks = d.blocks.filter(b => b && TYPES[b.type] && b.data && typeof b.data === "object");
            if (!blocks.length) throw new Error("沒有可用的區塊");
            if (!confirm(`載入 ${blocks.length} 個區塊，取代目前編輯中的內容？（按「💾 儲存」才會寫入資料庫）`)) return;

            draft = blocks.map(b => ({ id: null, type: b.type, data: b.data }));
            openIdx = 0;
            render();

        } catch (err) {
            alert("匯入失敗：" + (err?.message || err));
        }
    }

    // =========================
    // 複製
    // =========================
    async function copy(text) {
        try { await navigator.clipboard.writeText(text); } catch { return; }
        toast("已複製");
    }

    function toast(msg) {
        let t = document.getElementById("copyToast");
        if (!t) {
            t = document.createElement("div");
            t.id = "copyToast";
            Object.assign(t.style, { position: "fixed", bottom: "20px", right: "20px", background: "#333", color: "#fff", padding: "10px 14px", borderRadius: "8px", fontSize: "14px", zIndex: 9999, opacity: "0", transition: "0.2s" });
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = "1";
        setTimeout(() => { t.style.opacity = "0"; }, 1200);
    }

    return { init };

})();
