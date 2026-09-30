window.Pages = window.Pages || {};

// =========================================================
// 製作報告：區塊編輯器 + 即時預覽（輸出由 js/report-render.js 的 buildReportHtml 產生）
//   report = { theme, meta, blocks[], source }
//   草稿自動存在這台電腦（IndexedDB，失敗退回 localStorage）；品牌預設存在 localStorage
// =========================================================
Pages.Report = (() => {

    "use strict";

    const R = window.ReportRender;
    const E = R.esc;
    const dom = {};

    const BRAND_KEY = "fonegle_report_brand";

    let report = null;
    let openId = null;
    let events = [];
    let days = [];
    let products = null;
    let seq = 0;
    let previewTimer = 0, saveTimer = 0;
    let lastRange = null;
    let hoverZone = null;

    // =========================
    // 區塊類型
    // =========================
    const uid = () => "b" + Date.now().toString(36) + (seq++);

    const TYPES = {
        cover: { label: "封面", icon: "📕", make: () => ({ kicker: "", title: "報告標題", subtitle: "", customer: "", image: "" }), sum: b => b.title },
        heading: { label: "章節標題", icon: "🔖", make: () => ({ text: "新章節" }), sum: b => b.text },
        text: { label: "文字段落", icon: "📝", make: () => ({ html: "<p>在這裡輸入內容…</p>" }), sum: b => plain(b.html) },
        images: { label: "圖片（1～3 張）", icon: "🖼️", make: () => ({ images: [], widthPct: 100, align: "center" }), sum: b => `${(b.images || []).length} 張` },
        imageText: { label: "圖文並排", icon: "🧩", make: () => ({ image: "", html: "<p>說明文字…</p>", imageSide: "left" }), sum: b => plain(b.html) },
        table: { label: "表格", icon: "📊", make: () => ({ mode: "kv", rows: [["項目", "內容"]] }), sum: b => `${(b.rows || []).length} 列` },
        callout: { label: "重點框", icon: "💡", make: () => ({ variant: "suggest", title: "", html: "<p>重點說明…</p>" }), sum: b => plain(b.html) },
        signature: { label: "簽核欄", icon: "✍️", make: () => ({ roles: ["製表", "審核", "核准"] }), sum: b => (b.roles || []).join("／") },
        pagebreak: { label: "強制分頁", icon: "✂️", make: () => ({}), sum: () => "" },
        hero: { label: "主視覺（大標語）", icon: "🌟", make: () => ({ headline: "一句吸引人的標語", sub: "副標題", image: "", ctaText: "", ctaUrl: "" }), sum: b => b.headline },
        features: { label: "賣點卡片", icon: "✨", make: () => ({ items: [{ icon: "🍦", title: "賣點一", text: "說明" }, { icon: "🌿", title: "賣點二", text: "說明" }, { icon: "❤️", title: "賣點三", text: "說明" }] }), sum: b => `${(b.items || []).length} 張` },
        pricing: { label: "價格方案", icon: "💰", make: () => ({ plans: [{ name: "方案 A", price: "$100", unit: "／份", features: "特色一\n特色二", highlight: false }] }), sum: b => `${(b.plans || []).length} 個方案` },
        cta: { label: "行動呼籲", icon: "📣", make: () => ({ title: "立即聯繫我們", text: "", buttonText: "", url: "", qr: "" }), sum: b => b.title },
        gallery: { label: "圖片牆", icon: "🖼️", make: () => ({ images: [], cols: 3 }), sum: b => `${(b.images || []).length} 張` },
        testimonial: { label: "客戶見證", icon: "💬", make: () => ({ items: [{ quote: "很好吃！", name: "客人" }] }), sum: b => `${(b.items || []).length} 則` }
    };

    const ITEM_TPL = {
        images: () => ({ src: "", caption: "" }),
        items_features: () => ({ icon: "⭐", title: "", text: "" }),
        items_testimonial: () => ({ quote: "", name: "" }),
        plans: () => ({ name: "", price: "", unit: "", features: "", highlight: false }),
        roles: () => "",
        rows: () => ["", ""]
    };

    const plain = html => {
        const d = new DOMParser().parseFromString(`<body>${R.sanitizeRichHtml(html)}</body>`, "text/html");
        return (d.body.textContent || "").trim().slice(0, 40);
    };

    const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

    function setPath(o, p, v) {
        const ks = p.split(".");
        const last = ks.pop();
        ks.reduce((a, k) => a[k], o)[last] = v;
    }

    const todayText = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    // =========================
    // 草稿儲存
    // =========================
    const DraftStore = (() => {

        let dbp = null;
        const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

        const open = () => dbp || (dbp = timeout(new Promise((res, rej) => {
            const r = indexedDB.open("fonegle_report", 1);
            r.onupgradeneeded = () => r.result.createObjectStore("kv");
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        }), 3000));

        const req = (mode, fn) => open().then(db => timeout(new Promise((res, rej) => {
            const r = fn(db.transaction("kv", mode).objectStore("kv"));
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        }), 3000));

        return {
            async get(key) {
                try { return await req("readonly", s => s.get(key)); } catch { }
                try { return JSON.parse(localStorage.getItem("rp:" + key) || "null"); } catch { return null; }
            },
            async set(key, value) {
                try { await req("readwrite", s => s.put(value, key)); return true; } catch { }
                try { localStorage.setItem("rp:" + key, JSON.stringify(value)); return true; } catch { return false; }
            }
        };
    })();

    const draftKey = () => "draft:" + (Auth.getUserId() || "me");

    function scheduleSave() {
        clearTimeout(saveTimer);
        dom.saveState.textContent = "編輯中…";
        saveTimer = setTimeout(async () => {
            const ok = await DraftStore.set(draftKey(), report);
            dom.saveState.textContent = ok ? "✅ 草稿已自動儲存 " + new Date().toLocaleTimeString("zh-TW", { hour12: false }) : "⚠️ 草稿無法儲存（圖片太大或瀏覽器空間不足）";
        }, 800);
    }

    // =========================
    // 初始化
    // =========================
    async function init() {

        [
            "btnNew", "btnDownload", "btnPrint", "srcKind", "srcRecord", "btnSrcBuild", "btnSrcRefill",
            "addType", "btnAddBlock", "blockList", "themeForm", "preview", "saveState"
        ].forEach(id => dom[id] = document.getElementById(id));

        dom.addType.innerHTML = Object.keys(TYPES).map(k => `<option value="${k}">${TYPES[k].icon} ${TYPES[k].label}</option>`).join("");

        bind();

        const saved = await DraftStore.get(draftKey());
        report = saved && Array.isArray(saved.blocks) ? normalize(saved) : await newReport();
        openId = report.blocks[0]?.id || null;

        renderAll();
        loadSources();
    }

    function normalize(r) {
        r.theme = Object.assign(defaultTheme(), r.theme || {});
        r.meta = Object.assign({ reportNo: "", date: todayText(), author: "", version: "V1.0" }, r.meta || {});
        r.blocks.forEach(b => { if (!b.id) b.id = uid(); });
        return r;
    }

    function defaultTheme() {
        const base = {
            preset: "brand", primary: R.THEMES.brand.primary, dark: R.THEMES.brand.dark, textColor: "#2b2b2b",
            font: "jhenghei", baseSize: 14, pageSize: "a4",
            companyName: "瘋菓 Fonegle Dessert", companySub: "", logo: "",
            watermark: false, watermarkText: "瘋菓", title: "報告", numbering: true,
            footerText: "", footerBless: "Thank you."
        };
        try { return Object.assign(base, JSON.parse(localStorage.getItem(BRAND_KEY) || "{}")); } catch { return base; }
    }

    async function newReport() {

        let author = "";
        try { author = (await API.me({ silent: true }))?.user?.Name || ""; } catch { }

        return {
            theme: defaultTheme(),
            meta: { reportNo: "", date: todayText(), author, version: "V1.0" },
            blocks: [
                Object.assign({ id: uid(), type: "cover" }, TYPES.cover.make()),
                Object.assign({ id: uid(), type: "heading" }, TYPES.heading.make()),
                Object.assign({ id: uid(), type: "text" }, TYPES.text.make())
            ],
            source: null
        };
    }

    async function loadSources() {

        try {
            const d = await API.getMany(["Calendar", "CalendarDays", "Products"], { silent: true });
            events = (d.Calendar || []).filter(e => e.IsDeleted !== true)
                .sort((a, b) => String(b.StartEventDate).localeCompare(String(a.StartEventDate)));
            days = d.CalendarDays || [];
            products = d.Products ? d.Products.filter(p => p.IsActive !== false) : null;
        } catch { }

        renderSourceOptions();
    }

    function renderSourceOptions() {

        const kind = dom.srcKind.value;
        const list = kind === "event"
            ? events.map(e => [e.CalendarId, `${App.toDateInput(e.StartEventDate)}　${e.EventName}`])
            : (products || []).map(p => [p.ID, `${p.SKU || ""} ${p.ProductName}`]);

        dom.srcRecord.innerHTML = list.length
            ? list.map(([id, t]) => `<option value="${E(id)}">${E(t)}</option>`).join("")
            : `<option value="">${kind === "product" && products === null ? "（沒有產品讀取權限）" : "（沒有資料）"}</option>`;
    }

    // =========================
    // 事件
    // =========================
    function bind() {

        dom.btnNew.addEventListener("click", async () => {
            if (!confirm("清除目前內容並建立新報告？（品牌設定會保留）")) return;
            const keep = report.theme;
            report = await newReport();
            report.theme = keep;
            openId = report.blocks[0].id;
            renderAll();
        });

        dom.btnAddBlock.addEventListener("click", () => {
            const b = Object.assign({ id: uid(), type: dom.addType.value }, TYPES[dom.addType.value].make());
            const i = report.blocks.findIndex(x => x.id === openId);
            report.blocks.splice(i < 0 ? report.blocks.length : i + 1, 0, b);
            openId = b.id;
            changed(true);
            document.getElementById(`blk-${b.id}`)?.scrollIntoView({ block: "nearest" });
        });

        dom.srcKind.addEventListener("change", renderSourceOptions);
        dom.btnSrcBuild.addEventListener("click", () => useSource(false));
        dom.btnSrcRefill.addEventListener("click", () => useSource(true));
        dom.btnPrint.addEventListener("click", printReport);
        dom.btnDownload.addEventListener("click", downloadHtml);

        [dom.blockList, dom.themeForm].forEach(box => {
            box.addEventListener("input", onInput);
            box.addEventListener("change", onInput);
            box.addEventListener("click", onClick);
            box.addEventListener("mousedown", e => { if (e.target.closest("[data-cmd]")) e.preventDefault(); });
            box.addEventListener("dragover", e => { const z = e.target.closest(".er-drop"); if (z) { e.preventDefault(); z.classList.add("over"); } });
            box.addEventListener("dragleave", e => e.target.closest(".er-drop")?.classList.remove("over"));
            box.addEventListener("drop", e => {
                const z = e.target.closest(".er-drop");
                if (!z) return;
                e.preventDefault();
                z.classList.remove("over");
                addImages(z, [...e.dataTransfer.files]);
            });
            box.addEventListener("mouseover", e => { hoverZone = e.target.closest(".er-drop") || hoverZone; });
        });

        document.addEventListener("selectionchange", () => {
            const s = window.getSelection();
            if (s.rangeCount && s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement)?.closest(".er-rich"))
                lastRange = s.getRangeAt(0).cloneRange();
        });

        document.addEventListener("paste", e => {
            const z = document.activeElement?.closest?.(".er-drop") || (document.activeElement?.closest?.(".er-rich") ? null : hoverZone);
            const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
            if (z && files.length && document.body.contains(z)) { e.preventDefault(); addImages(z, files); }
        });

        dom.preview.addEventListener("load", () => {
            const d = dom.preview.contentDocument;
            if (!d) return;
            d.addEventListener("click", e => {
                const el = e.target.closest("[data-block-id]");
                if (!el) return;
                e.preventDefault();
                openId = el.dataset.blockId;
                renderBlocks();
                document.getElementById(`blk-${openId}`)?.scrollIntoView({ block: "nearest" });
                markActive();
            });
            markActive();
            if (previewScroll) d.documentElement.scrollTop = previewScroll;
        });
    }

    let previewScroll = 0;

    function markActive() {
        const d = dom.preview.contentDocument;
        if (!d) return;
        d.querySelectorAll(".rp-active").forEach(x => x.classList.remove("rp-active"));
        d.querySelector(`[data-block-id="${openId}"]`)?.classList.add("rp-active");
    }

    const objOf = id => (id === "@" ? report : report.blocks.find(b => b.id === id));

    function onInput(e) {

        const t = e.target;

        if (t.matches("[data-cmd-color]")) {
            if (e.type === "input") runCmd(t.dataset.cmdColor, t.value);
            return;
        }

        if (t.matches("[data-cmd-size]")) {
            if (e.type === "change" && t.value) { runCmd("size", t.value); t.value = ""; }
            return;
        }

        if (t.classList.contains("er-rich")) {
            const o = objOf(t.dataset.b);
            if (o) { setPath(o, t.dataset.p, R.sanitizeRichHtml(t.innerHTML)); changed(false); }
            return;
        }

        if (!t.dataset.b || !t.dataset.p || t.type === "file") return;
        if (e.type === "input" && (t.tagName === "SELECT" || t.type === "checkbox")) return;

        const o = objOf(t.dataset.b);
        if (!o) return;

        setPath(o, t.dataset.p, t.type === "checkbox" ? t.checked : t.value);

        if (t.dataset.p === "theme.preset" && R.THEMES[t.value]) {
            report.theme.primary = R.THEMES[t.value].primary;
            report.theme.dark = R.THEMES[t.value].dark;
        }

        if (t.dataset.p === "mode" && o.type === "table") reshapeTable(o);

        changed(!!t.dataset.re || t.dataset.p === "theme.preset");
    }

    function reshapeTable(b) {
        const cols = b.mode === "kv" ? 2 : Math.max(2, (b.rows[0] || []).length || 2);
        b.rows = (b.rows.length ? b.rows : [["", ""]]).map(r => Array.from({ length: cols }, (_, i) => r[i] || ""));
    }

    function onClick(e) {

        const zone = e.target.closest(".er-drop");
        if (zone && !e.target.closest("[data-act]")) {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.multiple = zone.dataset.multi === "1";
            inp.onchange = () => addImages(zone, [...inp.files]);
            inp.click();
            return;
        }

        const btn = e.target.closest("[data-act],[data-cmd]");

        if (btn?.dataset.cmd) { runCmd(btn.dataset.cmd); return; }

        if (!btn) {
            const head = e.target.closest(".er-bh");
            if (head) { openId = openId === head.dataset.id ? null : head.dataset.id; renderBlocks(); markActive(); }
            return;
        }

        const id = btn.dataset.b;
        const i = report.blocks.findIndex(x => x.id === id);
        const b = objOf(id);
        const act = btn.dataset.act;

        if (act === "up" && i > 0) [report.blocks[i - 1], report.blocks[i]] = [report.blocks[i], report.blocks[i - 1]];
        else if (act === "down" && i < report.blocks.length - 1) [report.blocks[i + 1], report.blocks[i]] = [report.blocks[i], report.blocks[i + 1]];
        else if (act === "dup") {
            const c = JSON.parse(JSON.stringify(b));
            c.id = uid();
            delete c.auto;
            report.blocks.splice(i + 1, 0, c);
            openId = c.id;
        }
        else if (act === "del") {
            if (!confirm("刪除這個區塊？")) return;
            report.blocks.splice(i, 1);
            if (openId === id) openId = null;
        }
        else if (act === "arr-add") {
            const arr = getPath(b, btn.dataset.arr);
            const max = Number(btn.dataset.max || 99);
            if (arr.length >= max) { alert(`最多 ${max} 個`); return; }
            arr.push(btn.dataset.tpl === "rows" ? Array.from({ length: arr[0]?.length || 2 }, () => "") : ITEM_TPL[btn.dataset.tpl]());
        }
        else if (act === "arr-del") getPath(b, btn.dataset.arr).splice(Number(btn.dataset.i), 1);
        else if (act === "col-add") b.rows.forEach(r => r.push(""));
        else if (act === "col-del") { if ((b.rows[0] || []).length > 2) b.rows.forEach(r => r.pop()); }
        else if (act === "img-clear") setPath(b, btn.dataset.p, "");
        else if (act === "ai") { aiWrite(b, btn); return; }
        else if (act === "save-brand") { saveBrand(); return; }
        else if (act === "load-brand") {
            try { Object.assign(report.theme, JSON.parse(localStorage.getItem(BRAND_KEY) || "{}")); } catch { }
        }
        else return;

        changed(true);
    }

    // 內容變動：needRender 重畫編輯區（輸入文字時不重畫，避免游標跳掉）
    function changed(needRender) {
        if (needRender) { renderBlocks(); renderTheme(); }
        schedulePreview();
        scheduleSave();
    }

    // =========================
    // 編輯區
    // =========================
    function renderAll() {
        renderBlocks();
        renderTheme();
        renderPreviewNow();
        dom.saveState.textContent = "";
    }

    function renderBlocks() {

        const top = dom.blockList.scrollTop;

        dom.blockList.innerHTML = report.blocks.map((b, i) => {
            const T = TYPES[b.type] || { label: b.type, icon: "❓", sum: () => "" };
            const open = b.id === openId;
            return `
<div class="er-block ${open ? "active" : ""}" id="blk-${b.id}">
    <div class="er-bh" data-id="${b.id}">
        <span>${T.icon}</span>
        <span class="t">${E(T.label)} <span class="sum">${E(String(T.sum(b) || "").slice(0, 26))}</span>${b.auto ? ` <span class="badge bg-info text-dark">自動帶入</span>` : ""}</span>
        <button class="btn btn-sm btn-link" data-act="up" data-b="${b.id}" title="上移" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-sm btn-link" data-act="down" data-b="${b.id}" title="下移" ${i === report.blocks.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-sm btn-link" data-act="dup" data-b="${b.id}" title="複製">⧉</button>
        <button class="btn btn-sm btn-link text-danger" data-act="del" data-b="${b.id}" title="刪除">✕</button>
    </div>
    <div class="er-bb ${open ? "" : "d-none"}">${open ? editorBody(b) : ""}</div>
</div>`;
        }).join("") || `<div class="text-muted small">還沒有區塊，請從上方新增</div>`;

        dom.blockList.scrollTop = top;
    }

    function field(b, p, label, o = {}) {

        const v = getPath(b.id === "@" ? report : b, p) ?? "";
        const base = `data-b="${b.id}" data-p="${p}" ${o.re ? 'data-re="1"' : ""}`;
        const cls = o.col || "mb-2";

        if (o.check)
            return `<div class="${cls}"><div class="form-check"><input type="checkbox" class="form-check-input" ${base} ${v ? "checked" : ""}><label class="form-check-label small">${label}</label></div></div>`;

        let el;
        if (o.area) el = `<textarea class="form-control form-control-sm" rows="${o.area}" ${base}>${E(v)}</textarea>`;
        else if (o.opts) el = `<select class="form-select form-select-sm" ${base}>${o.opts.map(([k, n]) => `<option value="${E(k)}" ${String(v) === String(k) ? "selected" : ""}>${E(n)}</option>`).join("")}</select>`;
        else el = `<input class="form-control form-control-sm" type="${o.type || "text"}" ${o.min !== undefined ? `min="${o.min}" max="${o.max}"` : ""} ${base} value="${E(v)}" placeholder="${E(o.ph || "")}">`;

        return `<div class="${cls}">${label ? `<label class="form-label small mb-0">${label}</label>` : ""}${el}</div>`;
    }

    function drop(id, path, src, multi) {
        const s = R.safeImgSrc(src);
        return `<div class="er-drop mb-2" tabindex="0" data-drop="${id}" data-p="${path}" ${multi ? 'data-multi="1"' : ""}>
${s ? `<img src="${s}" alt="">` : ""}📷 點擊選圖、拖曳進來，或按 Ctrl+V 貼上截圖</div>
${s && !multi ? `<button class="btn btn-sm btn-outline-secondary mb-2" data-act="img-clear" data-b="${id}" data-p="${path}">移除圖片</button>` : ""}`;
    }

    function rich(b, path) {

        const tb = `
<div class="er-tb">
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="bold"><b>B</b></button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="italic"><i>I</i></button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="underline"><u>U</u></button>
    <select class="form-select form-select-sm w-auto py-0" data-cmd-size="1"><option value="">字級</option><option value="0.85em">小</option><option value="1em">標準</option><option value="1.25em">大</option><option value="1.6em">特大</option></select>
    <input type="color" value="#c0392b" data-cmd-color="foreColor" title="文字顏色">
    <input type="color" value="#fff3a0" data-cmd-color="hiliteColor" title="螢光筆">
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="insertUnorderedList">• 清單</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="insertOrderedList">1. 清單</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="justifyLeft">⯇</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="justifyCenter">≡</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="justifyRight">⯈</button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="removeFormat">清除</button>
    <button type="button" class="btn btn-sm btn-outline-primary" data-act="ai" data-b="${b.id}" data-p="${path}">🤖 AI 幫我寫</button>
</div>`;

        return `<div class="mb-2">${tb}<div class="er-rich" contenteditable="true" data-b="${b.id}" data-p="${path}">${R.sanitizeRichHtml(getPath(b, path))}</div></div>`;
    }

    function addBtn(b, arr, tpl, label, max) {
        return `<button class="btn btn-sm btn-outline-primary mb-2" data-act="arr-add" data-b="${b.id}" data-arr="${arr}" data-tpl="${tpl}" ${max ? `data-max="${max}"` : ""}>＋ ${label}</button>`;
    }

    function delBtn(b, arr, i) {
        return `<button class="btn btn-sm btn-link text-danger p-0" data-act="arr-del" data-b="${b.id}" data-arr="${arr}" data-i="${i}">✕ 刪除</button>`;
    }

    function thumbs(b, max) {
        const list = b.images || [];
        return `<div class="er-thumbs">${list.map((im, i) => `
<div class="er-thumb">${R.safeImgSrc(im.src) ? `<img src="${im.src}" alt="">` : ""}
    <input class="form-control form-control-sm mt-1" data-b="${b.id}" data-p="images.${i}.caption" value="${E(im.caption)}" placeholder="圖說">
    ${delBtn(b, "images", i)}</div>`).join("")}</div>
${list.length < max ? drop(b.id, "images", "", true) : `<div class="small text-muted">最多 ${max} 張</div>`}`;
    }

    function editorBody(b) {

        switch (b.type) {

            case "cover":
                return field(b, "kicker", "上方小字（例如：專案提案）") + field(b, "title", "標題") + field(b, "subtitle", "副標題") + field(b, "customer", "對象 / 客戶") + drop(b.id, "image", b.image);

            case "heading":
                return field(b, "text", "標題文字");

            case "text":
                return rich(b, "html");

            case "images":
                return thumbs(b, 3) + `<div class="row g-2">${field(b, "widthPct", "整體寬度 %", { type: "number", min: 20, max: 100, col: "col-6" })}${field(b, "align", "對齊", { col: "col-6", opts: [["center", "置中"], ["left", "靠左"], ["right", "靠右"]] })}</div>`;

            case "imageText":
                return field(b, "imageSide", "圖片位置", { opts: [["left", "圖左文右"], ["right", "文左圖右"]] }) + drop(b.id, "image", b.image) + rich(b, "html");

            case "table": {
                const cols = (b.rows[0] || []).length;
                return field(b, "mode", "表格樣式", { re: true, opts: [["kv", "資訊表（兩欄）"], ["grid", "自由表格（第一列為表頭）"]] }) +
                    b.rows.map((r, i) => `<div class="d-flex gap-1 mb-1 align-items-center">${r.map((c, j) => `<input class="form-control form-control-sm" data-b="${b.id}" data-p="rows.${i}.${j}" value="${E(c)}">`).join("")}${delBtn(b, "rows", i)}</div>`).join("") +
                    addBtn(b, "rows", "rows", "新增一列") +
                    (b.mode === "grid" ? ` <button class="btn btn-sm btn-outline-secondary mb-2" data-act="col-add" data-b="${b.id}">＋ 欄</button><button class="btn btn-sm btn-outline-secondary mb-2 ms-1" data-act="col-del" data-b="${b.id}" ${cols <= 2 ? "disabled" : ""}>－ 欄</button>` : "");
            }

            case "callout":
                return `<div class="row g-2">${field(b, "variant", "類型", { col: "col-5", re: true, opts: Object.keys(R.CALLOUTS).map(k => [k, R.CALLOUTS[k].icon + " " + R.CALLOUTS[k].name]) })}${field(b, "title", "標題（留空用類型名稱）", { col: "col-7" })}</div>` + rich(b, "html");

            case "signature":
                return b.roles.map((r, i) => `<div class="d-flex gap-1 mb-1"><input class="form-control form-control-sm" data-b="${b.id}" data-p="roles.${i}" value="${E(r)}">${delBtn(b, "roles", i)}</div>`).join("") + addBtn(b, "roles", "roles", "新增簽核欄", 5);

            case "hero":
                return field(b, "headline", "大標語") + field(b, "sub", "副標題") + drop(b.id, "image", b.image) +
                    `<div class="row g-2">${field(b, "ctaText", "按鈕文字", { col: "col-5" })}${field(b, "ctaUrl", "按鈕連結（http / https / mailto）", { col: "col-7" })}</div>` +
                    `<button class="btn btn-sm btn-outline-primary" data-act="ai" data-b="${b.id}" data-p="hero">🤖 AI 幫我寫標語</button>`;

            case "features":
                return b.items.map((it, i) => `<div class="er-sub"><div class="row g-2">${field(b, `items.${i}.icon`, "圖示", { col: "col-3" })}${field(b, `items.${i}.title`, "標題", { col: "col-9" })}</div>${field(b, `items.${i}.text`, "說明", { area: 2 })}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_features", "新增賣點", 6);

            case "pricing":
                return b.plans.map((p, i) => `<div class="er-sub"><div class="row g-2">${field(b, `plans.${i}.name`, "方案名稱", { col: "col-6" })}${field(b, `plans.${i}.price`, "價格", { col: "col-3" })}${field(b, `plans.${i}.unit`, "單位", { col: "col-3" })}</div>${field(b, `plans.${i}.features`, "特色（一行一項）", { area: 3 })}${field(b, `plans.${i}.highlight`, "主打推薦", { check: true })}${delBtn(b, "plans", i)}</div>`).join("") + addBtn(b, "plans", "plans", "新增方案", 4);

            case "cta":
                return field(b, "title", "標題") + field(b, "text", "說明", { area: 2 }) +
                    `<div class="row g-2">${field(b, "buttonText", "按鈕文字", { col: "col-5" })}${field(b, "url", "連結（http / https / mailto）", { col: "col-7" })}</div>` +
                    `<div class="small text-muted">QR Code 圖片（自行用 QR 產生器做好後上傳）</div>` + drop(b.id, "qr", b.qr);

            case "gallery":
                return field(b, "cols", "每列張數", { opts: [["2", "2"], ["3", "3"], ["4", "4"]] }) + thumbs(b, 12);

            case "testimonial":
                return b.items.map((it, i) => `<div class="er-sub">${field(b, `items.${i}.quote`, "見證內容", { area: 2 })}${field(b, `items.${i}.name`, "署名")}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_testimonial", "新增見證", 6);

            default:
                return `<div class="small text-muted">${b.type === "pagebreak" ? "這裡會強制換頁（列印用）" : "未知區塊"}</div>`;
        }
    }

    function renderTheme() {

        const t = report.theme;
        const f = (p, label, o = {}) => field({ id: "@" }, p, label, Object.assign({ col: "col-6 mb-2" }, o));

        const saveBtns = `<div class="d-flex gap-2 mb-3"><button class="btn btn-sm btn-outline-primary" data-act="save-brand" data-b="@">💾 存成我的品牌預設</button><button class="btn btn-sm btn-outline-secondary" data-act="load-brand" data-b="@">套用我的預設</button></div>`;

        dom.themeForm.innerHTML = `
<div class="er-sub"><div class="fw-bold small mb-2">📄 文件資訊</div><div class="row g-0">
${f("theme.title", "文件名稱")}${f("meta.reportNo", "編號")}${f("meta.date", "日期")}${f("meta.author", "製作人")}${f("meta.version", "版本")}
${f("theme.pageSize", "紙張 / 尺寸", { opts: Object.keys(R.PAGES).map(k => [k, R.PAGES[k].name]) })}
</div></div>
<div class="er-sub"><div class="fw-bold small mb-2">🎨 配色與字型</div><div class="row g-0">
${f("theme.preset", "預設配色", { opts: Object.keys(R.THEMES).map(k => [k, R.THEMES[k].name]) })}
${f("theme.font", "字型", { opts: Object.keys(R.FONTS).map(k => [k, R.FONTS[k].name]) })}
${f("theme.primary", "主色", { type: "color" })}${f("theme.dark", "標題深色", { type: "color" })}
${f("theme.textColor", "內文顏色", { type: "color" })}${f("theme.baseSize", "內文字級 px", { type: "number", min: 10, max: 22 })}
${f("theme.numbering", "章節自動編號", { check: true, col: "col-12 mb-2" })}
</div></div>
<div class="er-sub"><div class="fw-bold small mb-2">🏷️ 品牌</div><div class="row g-0">
${f("theme.companyName", "公司名稱")}${f("theme.companySub", "副標（英文標語等）")}
${f("theme.footerText", "頁尾聲明", { col: "col-12 mb-2" })}${f("theme.footerBless", "頁尾祝福語", { col: "col-12 mb-2" })}
${f("theme.watermark", "顯示浮水印", { check: true })}${f("theme.watermarkText", "浮水印文字")}
</div><div class="small text-muted">Logo（會放在封面）</div>${drop("@", "theme.logo", t.logo)}</div>
${saveBtns}`;
    }

    // =========================
    // 圖片
    // =========================
    function readFile(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
        });
    }

    async function compress(file, keepPng) {

        const src = await readFile(file);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const max = keepPng ? 700 : 1600;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d");

        if (keepPng) return (ctx.drawImage(img, 0, 0, c.width, c.height), c.toDataURL("image/png"));

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.85);
    }

    async function addImages(zone, files) {

        files = files.filter(f => f.type.startsWith("image/"));
        if (!files.length) return;

        const o = objOf(zone.dataset.drop);
        const p = zone.dataset.p;
        const keepPng = p === "theme.logo" || p === "qr";

        try {
            const urls = [];
            for (const f of files) urls.push(await compress(f, keepPng));

            if (zone.dataset.multi === "1") {
                const max = o.type === "gallery" ? 12 : 3;
                const arr = getPath(o, p);
                urls.forEach(u => { if (arr.length < max) arr.push({ src: u, caption: "" }); });
            } else setPath(o, p, urls[0]);

            changed(true);
        } catch (err) {
            alert("圖片讀取失敗：" + (err?.message || "格式不支援"));
        }
    }

    // =========================
    // 富文字
    // =========================
    function runCmd(cmd, value) {

        const ed = lastRange && (lastRange.startContainer.nodeType === 1 ? lastRange.startContainer : lastRange.startContainer.parentElement)?.closest(".er-rich");
        if (!ed) return;

        ed.focus();
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(lastRange);

        document.execCommand("styleWithCSS", false, true);

        if (cmd === "size") {
            const txt = s.toString();
            if (txt) document.execCommand("insertHTML", false, `<span style="font-size:${value}">${E(txt)}</span>`);
        } else document.execCommand(cmd, false, value);

        const o = objOf(ed.dataset.b);
        if (o) { setPath(o, ed.dataset.p, R.sanitizeRichHtml(ed.innerHTML)); changed(false); }
    }

    // =========================
    // AI 幫我寫
    // =========================
    async function aiWrite(b, btn) {

        const brief = prompt("這段要寫什麼？（例如：介紹夏季新口味、活動邀請語）", "");
        if (!brief || !brief.trim()) return;

        const old = btn.textContent;
        btn.disabled = true;
        btn.textContent = "產生中…";

        try {

            const kind = b.type === "hero" ? "行銷主視覺標語（第一行是 15 字內大標語，第二行是一句副標題，只要兩行）" : "文件段落（不要標題、不要使用 Markdown 符號）";
            const ctx = report.blocks.find(x => x.type === "cover")?.title || "";
            const text = String(await API.call("aiGenerate", { prompt: `請為瘋菓撰寫${kind}。文件主題：${ctx}\n需求：${brief.trim()}` })).trim();

            if (b.type === "hero") {
                const lines = text.split("\n").map(s => s.replace(/^[#*\-\s]+/, "").trim()).filter(Boolean);
                b.headline = lines[0] || b.headline;
                b.sub = lines[1] || b.sub;
            } else {
                b.html = text.split(/\n{2,}/).map(p => `<p>${E(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
            }

            changed(true);

        } catch (err) {

            App.error(err, "AI 產生失敗");

        } finally {

            btn.disabled = false;
            btn.textContent = old;
        }
    }

    // =========================
    // 從系統資料帶入
    // =========================
    function eventBlocks(e) {

        const start = App.showDateTime(e.StartEventDate);
        const end = App.showDateTime(e.EndEventDate);
        const range = start && end ? (start.slice(0, 10) === end.slice(0, 10) ? start.slice(0, 10) : `${start.slice(0, 10)} ～ ${end.slice(0, 10)}`) : start;
        const schedule = days.filter(d => String(d.CalendarId) === String(e.CalendarId))
            .sort((a, b) => String(a.EventDate).localeCompare(String(b.EventDate)))
            .map(d => `${App.toDateInput(d.EventDate)} ${d.StartTime || ""}${d.EndTime ? "–" + d.EndTime : ""}`.trim()).join("；");

        return [
            { type: "cover", auto: "cover", kicker: "活動資訊", title: e.EventName || "", subtitle: range, customer: e.EventAddress || "", image: "" },
            { type: "heading", text: "活動資訊" },
            { type: "table", auto: "info", mode: "kv", rows: [["活動名稱", e.EventName || ""], ["活動日期", range], ["地點", e.EventAddress || ""], ["營業時段", schedule], ["備註", e.Note || ""]] }
        ];
    }

    function productBlocks(p) {

        const rows = [["產品名稱", p.ProductName], ["品牌", p.Brand], ["規格", p.Specification], ["口味", p.Flavor], ["容量", p.Capacity],
            ["單位", p.Unit], ["建議售價", p.SalePrice ? "$" + p.SalePrice : ""], ["會員價", p.MemberPrice ? "$" + p.MemberPrice : ""],
            ["保存天數", p.ShelfLifeDays ? p.ShelfLifeDays + " 天" : ""]].filter(r => r[1]);

        return [
            { type: "cover", auto: "cover", kicker: "產品介紹", title: p.ProductName || "", subtitle: [p.Flavor, p.Specification].filter(Boolean).join("｜"), customer: "", image: "" },
            { type: "heading", text: "產品資訊" },
            { type: "table", auto: "info", mode: "kv", rows },
            { type: "text", auto: "desc", html: p.Description ? `<p>${E(p.Description).replace(/\n/g, "<br>")}</p>` : "<p></p>" }
        ];
    }

    function currentSource() {

        const kind = dom.srcKind.value;
        const id = dom.srcRecord.value;
        if (!id) return null;

        const row = kind === "event" ? events.find(e => String(e.CalendarId) === id) : (products || []).find(p => String(p.ID) === id);
        return row ? { kind, id, blocks: kind === "event" ? eventBlocks(row) : productBlocks(row) } : null;
    }

    function useSource(refill) {

        const s = currentSource();
        if (!s) { alert("請先選擇一筆資料"); return; }

        if (!refill) {
            if (report.blocks.length && !confirm("用這筆資料建立新內容？目前的區塊會被取代（品牌設定保留）。")) return;
            report.blocks = s.blocks.map(b => Object.assign({ id: uid() }, b));
            report.source = { kind: s.kind, id: s.id };
            openId = report.blocks[0].id;
            renderAll();
            scheduleSave();
            return;
        }

        if (!report.source || report.source.kind !== s.kind || report.source.id !== s.id) {
            if (!confirm("目前報告不是用這筆資料建立的，仍要把它的資料重新帶入嗎？")) return;
        }

        let n = 0;
        s.blocks.filter(b => b.auto).forEach(nb => {
            const cur = report.blocks.find(b => b.auto === nb.auto && b.type === nb.type);
            if (!cur) return;
            const { id, ...rest } = nb;
            Object.assign(cur, rest);
            n++;
        });

        report.source = { kind: s.kind, id: s.id };
        changed(true);
        alert(n ? `已更新 ${n} 個自動帶入的區塊（你自己加的與手改過的區塊不會被動到）` : "沒有可更新的自動帶入區塊");
    }

    // =========================
    // 品牌預設
    // =========================
    function saveBrand() {
        const t = report.theme;
        const keys = ["preset", "primary", "dark", "textColor", "font", "baseSize", "pageSize", "companyName", "companySub", "logo", "watermark", "watermarkText", "footerText", "footerBless", "numbering"];
        const brand = {};
        keys.forEach(k => brand[k] = t[k]);
        try {
            localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
            alert("✅ 已存成這台電腦的品牌預設，之後建立新報告會自動套用");
        } catch { alert("無法儲存（瀏覽器空間不足，Logo 可能太大）"); }
    }

    // =========================
    // 預覽與輸出
    // =========================
    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreviewNow, 300);
    }

    function renderPreviewNow() {
        try { previewScroll = dom.preview.contentDocument?.documentElement.scrollTop || 0; } catch { previewScroll = 0; }
        dom.preview.srcdoc = R.buildReportHtml(report, { forEditor: true });
    }

    async function printReport() {

        const fr = document.createElement("iframe");
        fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        document.body.appendChild(fr);
        fr.srcdoc = R.buildReportHtml(report);

        await new Promise(r => { fr.onload = r; });

        const d = fr.contentDocument;
        await Promise.all([...d.images].map(i => (i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
        if (d.fonts?.ready) await Promise.race([d.fonts.ready, new Promise(r => setTimeout(r, 3000))]);

        fr.contentWindow.focus();
        fr.contentWindow.print();
        setTimeout(() => fr.remove(), 60000);
    }

    function downloadHtml() {

        const title = (report.blocks.find(b => b.type === "cover")?.title || report.theme.title || "報告").replace(/[\\/:*?"<>|]/g, "_");
        const blob = new Blob([R.buildReportHtml(report)], { type: "text/html;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${title}_${report.meta.date || todayText()}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    return { init };

})();
