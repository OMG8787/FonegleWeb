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
    let userTpl = [];
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
        cover: { label: "封面", icon: "📕", make: () => ({ style: "center", kicker: "", title: "報告標題", subtitle: "", customer: "", image: "" }), sum: b => b.title },
        heading: { label: "標題", icon: "🔖", make: () => ({ text: "新章節", level: "h2", align: "left" }), sum: b => b.text },
        text: { label: "文字段落", icon: "📝", make: () => ({ html: "<p>在這裡輸入內容…</p>" }), sum: b => plain(b.html) },
        images: { label: "圖片（1～3 張）", icon: "🖼️", make: () => ({ images: [], widthPct: 100, align: "center" }), sum: b => `${(b.images || []).length} 張` },
        imageText: { label: "圖文並排", icon: "🧩", make: () => ({ image: "", html: "<p>說明文字…</p>", imageSide: "left" }), sum: b => plain(b.html) },
        table: { label: "表格", icon: "📊", make: () => ({ mode: "kv", rows: [["項目", "內容"]] }), sum: b => `${(b.rows || []).length} 列` },
        callout: { label: "重點框", icon: "💡", make: () => ({ variant: "suggest", title: "", html: "<p>重點說明…</p>" }), sum: b => plain(b.html) },
        signature: { label: "簽核欄", icon: "✍️", make: () => ({ roles: ["製表", "審核", "核准"] }), sum: b => (b.roles || []).join("／") },
        pagebreak: { label: "強制分頁", icon: "✂️", make: () => ({}), sum: () => "" },
        hero: { label: "主視覺（大標語）", icon: "🌟", make: () => ({ headline: "一句吸引人的標語", sub: "副標題", image: "", ctaText: "", ctaUrl: "" }), sum: b => b.headline },
        features: { label: "賣點卡片", icon: "✨", make: () => ({ cols: 3, layout: "stack", items: [{ icon: "🍦", title: "賣點一", text: "說明" }, { icon: "🌿", title: "賣點二", text: "說明" }, { icon: "❤️", title: "賣點三", text: "說明" }] }), sum: b => `${(b.items || []).length} 張` },
        pricing: { label: "價格方案", icon: "💰", make: () => ({ plans: [{ name: "方案 A", price: "$100", unit: "／份", features: "特色一\n特色二", highlight: false }] }), sum: b => `${(b.plans || []).length} 個方案` },
        cta: { label: "行動呼籲", icon: "📣", make: () => ({ title: "立即聯繫我們", text: "", buttonText: "", url: "", qr: "" }), sum: b => b.title },
        gallery: { label: "圖片牆", icon: "🖼️", make: () => ({ images: [], cols: 3, ratio: "1/1" }), sum: b => `${(b.images || []).length} 張` },
        testimonial: { label: "客戶見證", icon: "💬", make: () => ({ items: [{ quote: "很好吃！", name: "客人" }] }), sum: b => `${(b.items || []).length} 則` },
        banner: { label: "頁首橫幅圖", icon: "🏞️", make: () => ({ image: "", height: 0, alt: "" }), sum: b => (b.image ? "已放圖" : "尚未放圖") },
        claim: { label: "大標語 + 副標語", icon: "📢", make: () => ({ big: "一句話說出價值", sub: "副標語", align: "left" }), sum: b => b.big },
        tags: { label: "膠囊標籤", icon: "🏷️", make: () => ({ text: "標籤一\n標籤二\n標籤三" }), sum: b => String(b.text || "").replace(/\s+/g, "、") },
        bullets: { label: "項目清單", icon: "☑️", make: () => ({ title: "", style: "disc", items: "第一項\n第二項\n**重點**：可用粗體" }), sum: b => b.title || String(b.items || "").split("\n")[0] },
        columns: { label: "多欄文字", icon: "▥", make: () => ({ cols: 2, items: [{ html: "<p>左欄</p>" }, { html: "<p>右欄</p>" }, { html: "<p>第三欄</p>" }] }), sum: b => `${b.cols} 欄` },
        steps: { label: "流程步驟", icon: "🪜", make: () => ({ items: [{ icon: "", title: "步驟一", text: "說明" }, { icon: "", title: "步驟二", text: "說明" }, { icon: "", title: "步驟三", text: "說明" }] }), sum: b => `${(b.items || []).length} 步` },
        products: { label: "產品牆（圖 + 名稱 + 價格）", icon: "🍨", make: () => ({ cols: 3, ratio: "1/1", items: [{ image: "", name: "產品名稱", price: "$100", text: "", url: "" }] }), sum: b => `${(b.items || []).length} 項` },
        buttons: { label: "按鈕列", icon: "🔘", make: () => ({ align: "left", items: [{ text: "📩 立即洽詢", url: "mailto:", style: "solid" }] }), sum: b => (b.items || []).map(x => x.text).join("／") },
        divider: { label: "分隔線 / 空白", icon: "➖", make: () => ({ style: "line", gap: 16 }), sum: b => b.style },
        footer: { label: "頁尾聯絡資訊", icon: "📇", make: () => ({ html: "<p><strong>公司名稱</strong><br>聯絡人：<br>電話：<br>Email：</p>" }), sum: b => plain(b.html) }
    };

    const TYPE_GROUPS = [
        ["📄 文件 / 報告", ["cover", "heading", "text", "images", "imageText", "columns", "table", "callout", "signature", "pagebreak", "divider"]],
        ["📣 行銷 / 宣傳頁", ["banner", "hero", "claim", "tags", "bullets", "features", "steps", "products", "gallery", "pricing", "buttons", "cta", "testimonial", "footer"]]
    ];

    // 這些區塊不能套外框
    const NO_BOX = { cover: 1, pagebreak: 1, banner: 1, hero: 1, divider: 1 };

    const ITEM_TPL = {
        images: () => ({ src: "", caption: "" }),
        items_features: () => ({ icon: "⭐", title: "", text: "" }),
        items_testimonial: () => ({ quote: "", name: "" }),
        plans: () => ({ name: "", price: "", unit: "", features: "", highlight: false }),
        roles: () => "",
        rows: () => ["", ""],
        items_steps: () => ({ icon: "", title: "", text: "" }),
        items_buttons: () => ({ text: "按鈕", url: "", style: "solid" }),
        items_products: () => ({ image: "", name: "", price: "", text: "", url: "" }),
        items_columns: () => ({ html: "<p></p>" }),
        meta: () => ({ label: "", value: "" })
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
            "addType", "btnAddBlock", "blockList", "themeForm", "preview", "saveState", "tplSelect", "btnTpl", "btnTplSave", "btnTplDel", "btnTplExport", "btnTplImport", "tplFile"
        ].forEach(id => dom[id] = document.getElementById(id));

        dom.addType.innerHTML = TYPE_GROUPS.map(([g, keys]) =>
            `<optgroup label="${g}">${keys.map(k => `<option value="${k}">${TYPES[k].icon} ${TYPES[k].label}</option>`).join("")}</optgroup>`).join("");


        bind();

        userTpl = (await DraftStore.get("templates")) || [];
        renderTplOptions();

        const saved = await DraftStore.get(draftKey());
        report = saved && Array.isArray(saved.blocks) ? normalize(saved) : await newReport();
        openId = report.blocks[0]?.id || null;

        renderAll();
        loadSources();
    }

    function normalize(r) {
        r.theme = Object.assign(defaultTheme(), r.theme || {});
        r.meta = r.meta || {};
        if (!Array.isArray(r.meta.rows)) r.meta.rows = defaultMetaRows(r.meta.author || "", r.meta);
        r.blocks.forEach(b => {
            if (!b.id) b.id = uid();
            if (b.type === "cover") b.style = b.style || "center";
            if (b.type === "heading") { b.level = b.level || "h2"; b.align = b.align || "left"; }
            if (b.type === "features") { b.cols = b.cols || 3; b.layout = b.layout || "stack"; }
            if (b.type === "gallery") b.ratio = b.ratio || "1/1";
        });
        return r;
    }

    function defaultMetaRows(author, old = {}) {
        return [
            { label: "報告編號", value: old.reportNo || "" }, { label: "報告日期", value: old.date || todayText() },
            { label: "撰寫人", value: author || "" }, { label: "版次", value: old.version || "V1.0" }
        ];
    }

    function defaultTheme() {
        const base = {
            preset: "brand", primary: R.THEMES.brand.primary, dark: R.THEMES.brand.dark, textColor: "#2b2b2b",
            font: "jhenghei", baseSize: 14, pageSize: "a4",
            layout: "doc", pageBg: "#f4f6f8", cardBg: "#ffffff", cardWidth: 720, cardRadius: 12,
            logoShow: "cover", logoAlign: "center", logoW: 120, logoDx: 0, logoDy: 0,
            headStyle: "bar", figLabel: "圖", runHead: false, runHeadLeft: "", runHeadRight: "", runFootLeft: "", pageNo: false, pageFmt: "第 {p} 頁 / 共 {n} 頁",
            watermarkType: "text", wmImage: "", wmColor: "#4d341c", wmSize: 88, wmOpacity: 6, wmAngle: -24, wmPos: "center",
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
            meta: { rows: defaultMetaRows(author) },
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

        dom.tplSelect.addEventListener("change", () => { dom.btnTplDel.disabled = !dom.tplSelect.value.startsWith("u:"); });
        dom.btnTpl.addEventListener("click", applyTemplate);
        dom.btnTplSave.addEventListener("click", saveTemplate);
        dom.btnTplDel.addEventListener("click", deleteTemplate);
        dom.btnTplExport.addEventListener("click", exportTemplate);
        dom.btnTplImport.addEventListener("click", () => dom.tplFile.click());
        dom.tplFile.addEventListener("change", importTemplate);
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

        if (t.dataset.url) {
            if (e.type !== "change" || !t.value.trim()) return;
            const u = R.safeImgSrc(t.value.trim());
            if (!u || u.startsWith("data:")) { alert("請貼上 https:// 開頭的圖片網址"); return; }
            putImages(objOf(t.dataset.drop), t.dataset.p, t.dataset.multi === "1", [u]);
            return;
        }

        if (t.matches("[data-cmd-color]")) {
            if (e.type === "input") runCmd(t.dataset.cmdColor, t.value);
            return;
        }

        if (t.matches("[data-cmd-size]")) {
            if (e.type === "change" && t.value) { runCmd("size", t.dataset.cmdSize === "px" ? Number(t.value) + "px" : t.value); t.value = ""; }
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
        else if (act === "default-logo") { loadDefaultLogo(); return; }
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
${s ? `<img src="${E(s)}" alt="">` : ""}📷 點擊選圖、拖曳進來，或按 Ctrl+V 貼上截圖</div>
<input class="form-control form-control-sm mb-2" data-url="1" data-drop="${id}" data-p="${path}" ${multi ? 'data-multi="1"' : ""} placeholder="或貼上圖片網址（https://…）後按 Enter">
${s && !multi ? `<button class="btn btn-sm btn-outline-secondary mb-2" data-act="img-clear" data-b="${id}" data-p="${path}">移除圖片</button>` : ""}`;
    }

    function rich(b, path) {

        const tb = `
<div class="er-tb">
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="bold"><b>B</b></button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="italic"><i>I</i></button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-cmd="underline"><u>U</u></button>
    <select class="form-select form-select-sm w-auto py-0" data-cmd-size="1"><option value="">字級</option><option value="0.85em">小</option><option value="1em">標準</option><option value="1.25em">大</option><option value="1.6em">特大</option></select>
    <input type="number" min="6" max="200" class="form-control form-control-sm py-0" style="width:74px" data-cmd-size="px" placeholder="px" title="選取文字後，輸入字級（px）再按 Enter">
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
<div class="er-thumb">${R.safeImgSrc(im.src) ? `<img src="${E(im.src)}" alt="">` : ""}
    <input class="form-control form-control-sm mt-1" data-b="${b.id}" data-p="images.${i}.caption" value="${E(im.caption)}" placeholder="圖說">
    ${delBtn(b, "images", i)}</div>`).join("")}</div>
${list.length < max ? drop(b.id, "images", "", true) : `<div class="small text-muted">最多 ${max} 張</div>`}`;
    }

    // 每個區塊底部的「外框樣式」：卡片、外框線、陰影、實心色塊…，可自訂顏色、內距、圓角、寬度
    function boxEditor(b) {

        b.box = Object.assign({ style: "none", pad: 14, radius: 12, width: 100, align: "left", custom: false, bg: "#fffaf2", bd: report.theme.primary }, b.box || {});

        const x = b.box;
        const al = [["left", "靠左"], ["center", "置中"], ["right", "靠右"]];

        return `<details class="er-sub mt-2" ${x.style !== "none" ? "open" : ""}><summary class="small fw-bold">🔲 外框樣式${x.style !== "none" ? "（" + E(R.BOX_STYLES[x.style]) + "）" : ""}</summary><div class="mt-2">
${field(b, "box.style", "外框", { opts: Object.entries(R.BOX_STYLES) })}
<div class="row g-2">${field(b, "box.pad", "內距 px", { type: "number", min: 0, max: 60, col: "col-4" })}${field(b, "box.radius", "圓角 px", { type: "number", min: 0, max: 40, col: "col-4" })}${field(b, "box.width", "寬度 %", { type: "number", min: 30, max: 100, col: "col-4" })}</div>
<div class="row g-2">${field(b, "box.align", "框內文字對齊", { col: "col-6", opts: al })}${field(b, "box.custom", "自訂顏色", { check: true, re: true, col: "col-6 pt-4" })}</div>
${x.custom ? `<div class="row g-2">${field(b, "box.bg", "底色", { type: "color", col: "col-6" })}${field(b, "box.bd", "邊框 / 線條色", { type: "color", col: "col-6" })}</div>` : ""}
</div></details>`;
    }

    // 每個區塊：文字大小、上下間距、左右位移，以及各類型專屬的圖片 / 元件大小
    function sizeEditor(b) {

        const spec = {
            cover: [["imgW", "封面圖寬度 %", 70, 10, 100], ["imgH", "封面圖高度 px（0 = 自動）", 0, 0, 900]],
            imageText: [["imgW", "圖片寬度 %", 42, 10, 90]],
            images: [["imgH", "圖片高度 px（0 = 自動）", 0, 0, 900]],
            hero: [["minH", "區塊高度 px（0 = 自動）", 0, 0, 900]],
            cta: [["qrSize", "QR 圖大小 px", 110, 40, 400]]
        }[b.type] || [];

        spec.forEach(([k, , def]) => { if (b[k] === undefined) b[k] = def; });

        const used = ["fs", "mt", "mb", "dx"].some(k => Number(b[k])) || spec.some(([k, , def]) => Number(b[k]) !== def);

        return `<details class="er-sub mt-2" ${used ? "open" : ""}><summary class="small fw-bold">📐 大小與位置</summary><div class="mt-2">
<div class="row g-2">${spec.map(([k, label, , min, max]) => field(b, k, label, { type: "number", min, max, col: "col-6" })).join("")}
${field(b, "fs", "文字大小 px（0 = 依主題）", { type: "number", min: 0, max: 200, col: "col-6" })}
${field(b, "mt", "上方間距 px", { type: "number", min: -60, max: 300, col: "col-6" })}
${field(b, "mb", "下方間距 px", { type: "number", min: -60, max: 300, col: "col-6" })}
${field(b, "dx", "左右位移 px（負數往左）", { type: "number", min: -400, max: 400, col: "col-6" })}</div></div></details>`;
    }

    function editorBody(b) {
        return typeEditor(b) + (b.type === "pagebreak" ? "" : sizeEditor(b)) + (NO_BOX[b.type] ? "" : boxEditor(b));
    }

    function typeEditor(b) {

        switch (b.type) {

            case "banner":
                return drop(b.id, "image", b.image) + field(b, "height", "高度 px（0 = 依圖片比例）", { type: "number", min: 0, max: 600 }) + field(b, "alt", "圖片說明（替代文字）");

            case "claim":
                return field(b, "big", "大標語") + field(b, "sub", "副標語") + field(b, "align", "對齊", { opts: [["left", "靠左"], ["center", "置中"], ["right", "靠右"]] });

            case "tags":
                return field(b, "text", "標籤（用換行或逗號分隔）", { area: 3 });

            case "bullets":
                return field(b, "title", "小標題（可留空）") + field(b, "style", "符號", { opts: [["disc", "● 圓點"], ["check", "✓ 勾選"], ["arrow", "➜ 箭頭"], ["num", "1. 數字"]] }) +
                    field(b, "items", "項目（一行一項，可用 **粗體**）", { area: 5 });

            case "columns": {
                const n = Number(b.cols) || 2;
                while (b.items.length < n) b.items.push({ html: "<p></p>" });
                return field(b, "cols", "欄數", { re: true, opts: [["2", "2 欄"], ["3", "3 欄"]] }) +
                    b.items.slice(0, n).map((it, i) => `<div class="small text-muted">第 ${i + 1} 欄</div>${rich(b, `items.${i}.html`)}`).join("");
            }

            case "divider":
                return field(b, "style", "樣式", { opts: [["line", "實線"], ["dashed", "虛線"], ["dotted", "點線"], ["space", "只留空白"]] }) + field(b, "gap", "上下間距 px", { type: "number", min: 0, max: 80 });

            case "steps":
                return b.items.map((it, i) => `<div class="er-sub"><div class="row g-2">${field(b, `items.${i}.icon`, "圖示（留空 = 自動編號）", { col: "col-4" })}${field(b, `items.${i}.title`, "標題", { col: "col-8" })}</div>${field(b, `items.${i}.text`, "說明")}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_steps", "新增步驟", 6);

            case "products":
                return `<div class="row g-2">${field(b, "cols", "每列張數", { col: "col-6", opts: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]] })}${field(b, "ratio", "圖片比例", { col: "col-6", opts: [["1/1", "方形 1:1"], ["4/3", "橫式 4:3"], ["3/4", "直式 3:4"], ["16/9", "寬 16:9"]] })}</div>` +
                    b.items.map((it, i) => `<div class="er-sub">${drop(b.id, `items.${i}.image`, it.image)}<div class="row g-2">${field(b, `items.${i}.name`, "名稱", { col: "col-7" })}${field(b, `items.${i}.price`, "價格", { col: "col-5" })}</div>${field(b, `items.${i}.text`, "說明")}${field(b, `items.${i}.url`, "連結（選填）")}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_products", "新增產品", 12);

            case "buttons":
                return field(b, "align", "對齊", { opts: [["left", "靠左"], ["center", "置中"], ["right", "靠右"]] }) +
                    b.items.map((it, i) => `<div class="er-sub"><div class="row g-2">${field(b, `items.${i}.text`, "按鈕文字", { col: "col-7" })}${field(b, `items.${i}.style`, "樣式", { col: "col-5", opts: [["solid", "實心"], ["ghost", "外框"], ["link", "文字連結"]] })}</div>${field(b, `items.${i}.url`, "連結（http / https / mailto）")}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_buttons", "新增按鈕", 6);

            case "footer":
                return rich(b, "html");


            case "cover":
                return field(b, "style", "封面樣式", { opts: [["center", "置中（標題在中間）"], ["formal", "正式（左上 Logo、右上公司名、下方資訊表）"]] }) + field(b, "kicker", "上方小字（例如：專案提案）") + field(b, "title", "標題") + field(b, "subtitle", "副標題") + field(b, "customer", "對象 / 客戶") + drop(b.id, "image", b.image);

            case "heading":
                return field(b, "level", "層級", { opts: [["h1", "頁面大標題"], ["h2", "章節標題（可自動編號）"], ["h3", "小標題"]] }) + field(b, "text", "標題文字") +
                    field(b, "align", "對齊", { opts: [["left", "靠左"], ["center", "置中"], ["right", "靠右"]] });

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
                return `<div class="row g-2">${field(b, "cols", "每列欄數", { col: "col-6", opts: [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]] })}${field(b, "layout", "卡片樣式", { col: "col-6", opts: [["stack", "圖示在上（置中）"], ["inline", "圖示在左"], ["plain", "無底色"]] })}</div>` + b.items.map((it, i) => `<div class="er-sub"><div class="row g-2">${field(b, `items.${i}.icon`, "圖示", { col: "col-3" })}${field(b, `items.${i}.title`, "標題", { col: "col-9" })}</div>${field(b, `items.${i}.text`, "說明", { area: 2 })}${delBtn(b, "items", i)}</div>`).join("") + addBtn(b, "items", "items_features", "新增賣點", 6);

            case "pricing":
                return b.plans.map((p, i) => `<div class="er-sub"><div class="row g-2">${field(b, `plans.${i}.name`, "方案名稱", { col: "col-6" })}${field(b, `plans.${i}.price`, "價格", { col: "col-3" })}${field(b, `plans.${i}.unit`, "單位", { col: "col-3" })}</div>${field(b, `plans.${i}.features`, "特色（一行一項）", { area: 3 })}${field(b, `plans.${i}.highlight`, "主打推薦", { check: true })}${delBtn(b, "plans", i)}</div>`).join("") + addBtn(b, "plans", "plans", "新增方案", 4);

            case "cta":
                return field(b, "title", "標題") + field(b, "text", "說明", { area: 2 }) +
                    `<div class="row g-2">${field(b, "buttonText", "按鈕文字", { col: "col-5" })}${field(b, "url", "連結（http / https / mailto）", { col: "col-7" })}</div>` +
                    `<div class="small text-muted">QR Code 圖片（自行用 QR 產生器做好後上傳）</div>` + drop(b.id, "qr", b.qr);

            case "gallery":
                return `<div class="row g-2">${field(b, "cols", "每列張數", { col: "col-6", opts: [["2", "2"], ["3", "3"], ["4", "4"]] })}${field(b, "ratio", "圖片比例", { col: "col-6", opts: [["1/1", "方形 1:1"], ["4/3", "橫式 4:3"], ["3/4", "直式 3:4"], ["16/9", "寬 16:9"]] })}</div>` + thumbs(b, 12);

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

        const metaEditor = `<div class="col-12"><div class="small text-muted mb-1">封面資訊列（名稱與內容都可以修改）</div>${report.meta.rows.map((r, i) => `
<div class="d-flex gap-1 mb-1"><input class="form-control form-control-sm" style="max-width:38%" data-b="@" data-p="meta.rows.${i}.label" value="${E(r.label)}" placeholder="名稱">
<input class="form-control form-control-sm" data-b="@" data-p="meta.rows.${i}.value" value="${E(r.value)}" placeholder="內容">
<button class="btn btn-sm btn-link text-danger p-0" data-act="arr-del" data-b="@" data-arr="meta.rows" data-i="${i}" title="刪除這一列">✕</button></div>`).join("")}
<button class="btn btn-sm btn-outline-primary mb-2" data-act="arr-add" data-b="@" data-arr="meta.rows" data-tpl="meta" data-max="10">＋ 新增一列</button></div>`;

        dom.themeForm.innerHTML = `
<div class="er-sub"><div class="fw-bold small mb-2">📄 文件資訊</div><div class="row g-0">
${f("theme.title", "文件名稱", { col: "col-12 mb-2" })}${metaEditor}
${f("theme.layout", "版面模式", { re: true, col: "col-12 mb-2", opts: [["doc", "文件 / 報告（A4 等紙張，適合列印）"], ["web", "宣傳網頁（底色 + 置中卡片，適合貼到網站）"]] })}
${t.layout === "web"
            ? `${f("theme.pageBg", "網頁底色", { type: "color" })}${f("theme.cardBg", "卡片底色", { type: "color" })}${f("theme.cardWidth", "卡片寬度 px", { type: "number", min: 320, max: 1200 })}${f("theme.cardRadius", "卡片圓角 px", { type: "number", min: 0, max: 40 })}`
            : f("theme.pageSize", "紙張 / 尺寸", { opts: Object.keys(R.PAGES).map(k => [k, R.PAGES[k].name]) })}
</div></div>
<div class="er-sub"><div class="fw-bold small mb-2">🎨 配色與字型</div><div class="row g-0">
${f("theme.preset", "預設配色", { opts: Object.keys(R.THEMES).map(k => [k, R.THEMES[k].name]) })}
${f("theme.font", "字型", { opts: Object.keys(R.FONTS).map(k => [k, R.FONTS[k].name]) })}
${f("theme.primary", "主色", { type: "color" })}${f("theme.dark", "標題深色", { type: "color" })}
${f("theme.textColor", "內文顏色", { type: "color" })}${f("theme.baseSize", "內文字級 px", { type: "number", min: 8, max: 48 })}
${f("theme.numbering", "章節自動編號", { check: true, col: "col-12 mb-2" })}
</div></div>
${t.layout === "web" ? "" : `<div class="er-sub"><div class="fw-bold small mb-2">📑 正式文件設定</div><div class="row g-0">
${f("theme.headStyle", "章節標題樣式", { opts: [["bar", "左側粗線"], ["line", "底線（正式）"], ["plain", "純文字"]] })}${f("theme.figLabel", "圖號名稱（例如：圖、Figure）")}
${f("theme.runHead", "列印時每頁加頁首", { check: true, re: true, col: "col-12 mb-2" })}
${t.runHead ? `${f("theme.runHeadLeft", "頁首左側文字")}${f("theme.runHeadRight", "頁首右側文字")}` : ""}
${f("theme.runFootLeft", "頁尾左側文字（例如：機密聲明、文件編號）", { col: "col-12 mb-2" })}
${f("theme.pageNo", "列印時顯示頁碼", { check: true, re: true, col: "col-12 mb-2" })}
${t.pageNo ? f("theme.pageFmt", "頁碼格式（{p} = 目前頁、{n} = 總頁數）", { col: "col-12 mb-2" }) : ""}
</div><div class="small text-muted">頁首、頁尾、頁碼會在「列印 / 存成 PDF」時出現（封面不顯示），預覽畫面看不到。</div></div>`}
<div class="er-sub"><div class="fw-bold small mb-2">🏷️ 品牌</div><div class="row g-0">
${f("theme.companyName", "公司名稱")}${f("theme.companySub", "副標（英文標語等）")}
${f("theme.footerText", "頁尾聲明", { col: "col-12 mb-2" })}${f("theme.footerBless", "頁尾祝福語", { col: "col-12 mb-2" })}
</div></div>
<div class="er-sub"><div class="fw-bold small mb-2">🖼️ Logo</div>
${drop("@", "theme.logo", t.logo)}
<button class="btn btn-sm btn-outline-secondary mb-2" data-act="default-logo" data-b="@">用預設 Logo（瘋菓）</button>
<div class="row g-0">
${f("theme.logoShow", "顯示位置", { opts: [["cover", "封面"], ["top", "每份內容最上方"], ["bottom", "內容最下方（頁尾前）"], ["none", "不顯示"]] })}
${f("theme.logoAlign", "對齊", { opts: [["left", "靠左"], ["center", "置中"], ["right", "靠右"]] })}
${f("theme.logoW", "寬度 px", { type: "number", min: 20, max: 800 })}
${f("theme.logoDx", "左右位移 px", { type: "number", min: -400, max: 400 })}
${f("theme.logoDy", "上下位移 px", { type: "number", min: -200, max: 200 })}
</div></div>
<div class="er-sub"><div class="fw-bold small mb-2">💧 浮水印</div><div class="row g-0">
${f("theme.watermark", "顯示浮水印", { check: true, re: true, col: "col-12 mb-2" })}
${t.watermark ? `
${f("theme.watermarkType", "類型", { re: true, opts: [["text", "文字"], ["image", "圖片（例如 Logo）"]] })}
${f("theme.wmPos", "位置", { opts: [["center", "置中"], ["tile", "整頁平鋪"], ["tl", "左上角"], ["tr", "右上角"], ["bl", "左下角"], ["br", "右下角"]] })}
${t.watermarkType === "image" ? `<div class="col-12">${drop("@", "theme.wmImage", t.wmImage)}</div>` : `${f("theme.watermarkText", "浮水印文字")}${f("theme.wmColor", "文字顏色", { type: "color" })}`}
${f("theme.wmSize", t.watermarkType === "image" ? "圖片寬度 px" : "文字大小 px", { type: "number", min: 10, max: 1200 })}
${f("theme.wmOpacity", "濃度 %（越小越淡）", { type: "number", min: 1, max: 100 })}
${f("theme.wmAngle", "旋轉角度（度）", { type: "number", min: -180, max: 180 })}` : ""}
</div></div>
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

    // 系統內建的瘋菓 Logo（img/logo.png）
    async function fetchDefaultLogo() {
        const res = await fetch("../img/logo.png");
        if (!res.ok) throw new Error("找不到預設 Logo");
        return compress(await res.blob(), true);
    }

    async function loadDefaultLogo() {
        try {
            report.theme.logo = await fetchDefaultLogo();
            changed(true);
        } catch (err) {
            alert("載入預設 Logo 失敗：" + (err?.message || err));
        }
    }

    function putImages(o, p, multi, urls) {

        if (multi) {
            const max = o.type === "gallery" ? 12 : 3;
            const arr = getPath(o, p);
            urls.forEach(u => { if (arr.length < max) arr.push({ src: u, caption: "" }); });
        } else setPath(o, p, urls[0]);

        changed(true);
    }

    async function addImages(zone, files) {

        files = files.filter(f => f.type.startsWith("image/"));
        if (!files.length) return;

        const o = objOf(zone.dataset.drop);
        const p = zone.dataset.p;
        const keepPng = p === "theme.logo" || p === "theme.wmImage" || p === "qr";

        try {
            const urls = [];
            for (const f of files) urls.push(await compress(f, keepPng));

            putImages(o, p, zone.dataset.multi === "1", urls);
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
    // 範本（依「品牌對外網頁」資料夾裡的頁面整理）
    // =========================
    const BANNER = "https://img.cloudimg.in/uploads/shops/39971/theme/31/3121fab139bb6a962ea668a4cfab9cd0.png?v=202601270250";
    const IMG = "https://img.cloudimg.in/uploads/shops/39971/products/";
    const MAIL = "mailto:austin.fonegle@gmail.com";
    const LINE = "https://line.me/R/ti/p/@764zeuav?ts=07251231&oat_content=url";
    const IG = "https://www.instagram.com/fonegle_dessert/";

    const WEB_THEME = {
        layout: "web", pageBg: "#f4f6f8", cardBg: "#ffffff", cardWidth: 720, cardRadius: 12, preset: "brand",
        primary: "#b56b00", dark: "#7a4a00", textColor: "#333333", font: "system", baseSize: 15, numbering: false,
        companyName: "", companySub: "", footerText: "", footerBless: "", watermark: false
    };

    const P = t => `<p>${t}</p>`;
    const banner = () => ({ type: "banner", image: BANNER, height: 0, alt: "瘋菓冰品研究室" });
    const h1 = text => ({ type: "heading", level: "h1", text, align: "left" });
    const h3 = text => ({ type: "heading", level: "h3", text, align: "left" });
    const text = html => ({ type: "text", html });
    const btns = (items, align) => ({ type: "buttons", align: align || "left", items });
    const feat = (items, cols, layout) => ({ type: "features", cols: cols || 2, layout: layout || "inline", items: items.map(([icon, title, t]) => ({ icon, title, text: t })) });
    const contact = extra => ({
        type: "footer",
        html: `<p><strong>瘋菓貿易社</strong>（統編：60005166）<br>品牌：瘋菓冰品研究室</p><p>聯絡人：董峻宏<br>電話：0923-212-212<br>Email：<a href="${MAIL}">austin.fonegle@gmail.com</a><br>官方 LINE：<strong>@764zeuav</strong>${extra === false ? "" : `<br>Instagram：<a href="${IG}">fonegle_dessert</a>`}</p>`
    });
    const gal = (urls, ratio) => ({ type: "gallery", cols: 3, ratio: ratio || "1/1", images: urls.map(u => ({ src: IMG + u, caption: "" })) });
    const cta = () => btns([{ text: "📩 合作洽詢", url: MAIL, style: "solid" }, { text: "💬 官方 LINE", url: LINE, style: "ghost" }]);

    const LEAD_BRAND = [
        P("🍨 當甜點不只是甜，而是一口奢華的極致體驗。<br>奢華高端為核心，專注創造高端冰淇淋品牌，結合膳食纖維、高蛋白等機能成分，打造低負擔高享受的極致味覺盛宴。"),
        P("🎁 <strong>專屬訂製，點亮每一場美好時刻</strong><br>專業研發團隊，提供客製化甜品服務，無論是私密餐會、企業活動，或星級餐廳聯名合作，都能量身打造專屬風味。"),
        P("✨ <strong>重新定義冰品，讓品味成為態度</strong><br>瘋菓不只是提供冰品，而是傳遞風格與態度。每一次品嚐，都像穿上一件精心挑選的禮服，用冰涼詮釋高雅生活。")
    ].join("");

    const MODES = ["🛒 **產品販售**（經銷／通路供應）：提供高蛋白冰品、膳食纖維冰淇淋、造型甜點等現成品。", "🔧 **OEM／ODM 客製化開發**：OEM 協助製作貴司配方；ODM 依需求調整風味、營養配方、口感、造型。", "🤩 **聯名／活動合作**：品牌行銷專案、限定甜點、主題活動出攤等。"].join("\n");

    const h2 = t => ({ type: "heading", level: "h2", text: t, align: "left" });
    const kv = rows => ({ type: "table", mode: "kv", rows });
    const grid = rows => ({ type: "table", mode: "grid", rows });
    const note = (variant, title, html) => ({ type: "callout", variant, title, html });
    const compactDate = () => todayText().replace(/-/g, "");

    const TEMPLATES = {
        blank: {
            name: "空白報告（A4 文件）",
            theme: { layout: "doc" },
            blocks: () => [{ type: "cover", kicker: "", title: "報告標題", subtitle: "", customer: "", image: "" }, { type: "heading", level: "h2", text: "新章節", align: "left" }, text("<p>在這裡輸入內容…</p>")]
        },
        production: {
            name: "生產報告（正式版面，A4）",
            defaultLogo: true,
            theme: {
                layout: "doc", pageSize: "a4", preset: "brand", primary: "#8b4a2b", dark: "#2f2a26", textColor: "#2b2b2b",
                font: "jhenghei", baseSize: 13, numbering: true, headStyle: "line", figLabel: "圖",
                companyName: "瘋菓貿易社", companySub: "Fonegle Dessert Lab", logoShow: "cover", logoW: 150,
                footerText: "本文件為瘋菓貿易社內部生產紀錄，未經授權請勿轉載、散佈。", footerBless: "", watermark: false,
                runHead: true, runHeadLeft: "瘋菓貿易社", runHeadRight: "生產報告", runFootLeft: "機密文件・僅供內部使用", pageNo: true, pageFmt: "第 {p} 頁 / 共 {n} 頁"
            },
            meta: () => ({ rows: [{ label: "報告編號", value: "PR-" + compactDate() + "-01" }, { label: "生產日期", value: todayText() }, { label: "製表人", value: "" }, { label: "版次", value: "V1.0" }] }),
            blocks: () => [
                { type: "cover", style: "formal", kicker: "Production Report", title: "生產報告", subtitle: "（產品名稱／生產批號）", customer: "", image: "" },
                h2("基本資訊"),
                kv([["產品名稱", ""], ["產品編號 / SKU", ""], ["生產批號", ""], ["生產日期", todayText()], ["生產地點 / 產線", ""], ["預定產量", ""], ["實際產量", ""], ["良率", ""], ["負責人", ""]]),
                h2("原料與配方"),
                grid([["原料名稱", "用量", "單位", "批號 / 效期", "備註"], ["", "", "", "", ""], ["", "", "", "", ""], ["", "", "", "", ""]]),
                h2("製程紀錄"),
                grid([["步驟", "內容 / 條件", "起訖時間", "操作人員", "備註"], ["", "", "", "", ""], ["", "", "", "", ""], ["", "", "", "", ""]]),
                h2("品質檢驗"),
                grid([["檢驗項目", "標準", "實測值", "判定", "檢驗人員"], ["外觀", "", "", "", ""], ["口感 / 質地", "", "", "", ""], ["重量 / 規格", "", "", "", ""], ["保存溫度", "", "", "", ""]]),
                h2("異常與處置"),
                note("risk", "異常狀況", "<p>（無異常請填「無」）</p>"),
                h2("結論與建議"),
                note("conclusion", "結論", "<p>請填寫本批生產的整體結論。</p>"),
                { type: "signature", roles: ["製表", "審核", "核准"] }]
        },
        brand: {
            name: "品牌介紹頁（瘋菓冰品研究室）",
            theme: WEB_THEME,
            blocks: () => [banner(), h1("瘋菓冰品研究室"), text(LEAD_BRAND), h3("🤝 合作邀約"),
                text(P("主要專營 <strong>客製化冰品開發（OEM・ODM）</strong>、高蛋白冰品、膳食纖維冰淇淋與創意造型甜點，並希望與更多品牌夥伴建立長期穩定的 <strong>B2B 合作關係</strong>。")),
                { type: "bullets", title: "🧊 合作模式", style: "disc", items: MODES },
                text(P("⭐ <strong>品牌特色與優勢</strong><br>高蛋白與機能型冰品研發能力，風味穩定、外觀吸睛、辨識度高，適用健身、親子、文創、餐飲、品牌推廣等多元領域。")),
                cta(), h3("🍨 主要特色"),
                feat([["🍦", "高端義式冰淇淋", "嚴選素材，低負擔高享受，兼顧美味與健康。"], ["💪", "機能系甜點", "結合膳食纖維、高蛋白等機能配方。"], ["🎨", "客製化風味", "活動、餐會、品牌聯名皆可量身打造。"], ["🏛️", "生活美學", "每一款甜點都是視覺 + 味覺的儀式感呈現。"]]),
                contact()]
        },
        b2b: {
            name: "B2B 合作頁（OEM／ODM）",
            theme: WEB_THEME,
            blocks: () => [banner(), h1("瘋菓冰品研究室"),
                text(P("專注 <strong>B2B 客製化開發</strong>，提供高端各式冰淇淋、客製化甜點之 <strong>OEM／ODM</strong> 與品牌聯名合作。") +
                    P("<strong>🍨 每一口都是奢華的極致體驗。</strong><br>我們相信冰品不只是甜點，而是品牌價值的延伸。透過專業研發與客製化配方，無論是私密餐會、企業活動，或星級餐廳聯名合作，都能量身打造具市場辨識度專屬風味。")),
                { type: "tags", text: "OEM／ODM\n各式冰品甜點\n品牌聯名" },
                h3("🤝 B2B 合作項目"),
                { type: "bullets", title: "", style: "disc", items: "**OEM 代工**：可依貴司配方製作冰品／甜點，穩定量產。\n**ODM 開發**：風味、營養配方、口感、造型全方位客製。\n**通路／經銷供應**：高蛋白冰品、機能型冰淇淋、造型甜點。\n**品牌聯名／活動**：限定商品、行銷專案、市集活動出攤。" },
                h3("🍨 冰品核心優勢"),
                feat([["🍦", "冰淇淋工法", "質地綿密、融化穩定，適合商用與活動場景。"], ["💪", "機能型配方", "高蛋白、膳食纖維可依需求調整，兼顧美味與訴求。"], ["🎨", "客製化美學", "口味、色彩、造型、包裝皆可配合品牌視覺。"]], 2),
                h3("⭐ B2B 合作優勢"),
                feat([["🔬", "研發能力", "機能配方（高蛋白／膳食纖維/膠原蛋白）與風味穩定度高。"], ["🔧", "客製彈性", "少量試產到量產，快速調整。"], ["✨", "品牌辨識", "外觀吸睛，適合行銷與聯名。"], ["🏃", "多元場景", "餐飲、健身、親子、文創、企業活動。"]], 2),
                h3("📄 聊聊／品牌資料"),
                btns([{ text: "📩 合作洽詢", url: MAIL, style: "solid" }, { text: "💬 LINE 諮詢", url: LINE, style: "solid" }]),
                btns([{ text: "🌳 連結樹", url: "https://linktr.ee/fonegle_dessert", style: "ghost" }, { text: "📸 官方網站", url: "https://fonegle.waca.store/", style: "ghost" }]),
                { type: "footer", html: `<p><strong>瘋菓貿易社</strong>（統編：60005166）｜品牌：瘋菓冰品研究室<br>聯絡人：董峻宏｜電話：0923-212-212｜Email：<a href="${MAIL}">austin.fonegle@gmail.com</a></p>` }]
        },
        market: {
            name: "市集活動合作頁（主辦單位邀請）",
            theme: Object.assign({}, WEB_THEME, { pageBg: "#6e4a21", cardBg: "#ece6ca" }),
            blocks: () => [banner(), h1("瘋菓冰品市集活動合作"),
                { type: "claim", big: "🍨 為活動創造話題，為品牌留下記憶", sub: "高端義式冰淇淋 × 創意甜點 × 市集活動合作", align: "left" },
                text(LEAD_BRAND),
                h3("📸 人氣商品展示"),
                text(P("從經典義式冰淇淋到特色創意甜點，每款商品皆以風味、視覺與品質為核心設計，適合作為市集熱銷商品、活動甜點與品牌聯名企劃。")),
                gal(["9c/9c534a910645edd6c253b461f8e51aba.png", "49/496b78e7e0eb4c44bacf05a8653ed338.png", "28/2882d6e5b0460d544947e1dff471aa42.png", "b2/b237f14dfdbe0cfab20ecfac2b0870e7.png", "6f/6f683680ed397c71743a93a84ef05792.png", "23/2332ff54bd117ac7943d3016c7b47cae.png"]),
                { type: "bullets", title: "🧊 合作模式", style: "disc", items: MODES },
                text(P("⭐ <strong>品牌特色與優勢</strong><br>高蛋白與機能型冰品研發能力，風味穩定、外觀吸睛、辨識度高，適用健身、親子、文創、餐飲、品牌推廣等多元領域。")),
                h3("🤝 主辦單位合作邀請"),
                Object.assign(text(P("我們持續尋找優質市集與活動合作機會，希望透過高辨識度冰品與創意甜點，為活動帶來更多人潮與話題。")), { box: { style: "card" } }),
                feat([["🎪", "大型文創市集", "文創品牌聚集與假日活動。"], ["🏬", "節慶市集", "檔期活動與主題展售。"], ["👨‍👩‍👧", "企業家庭日", "員工與親子互動活動。"], ["🎵", "音樂祭活動", "戶外大型活動與市集。"]]),
                text(P("歡迎各類型活動邀約合作，可配合活動主題進行商品規劃與現場展售。")),
                h3("📷 攤位與活動展示"),
                gal(["ca/ca9866ca6120a9bd04e227a5f2f87864.png", "90/909ffb93189ee5469b7c66075b116de7.jpg", "0d/0d8058921cea9d3e3753e36b31df92df.jpg"], "4/3"),
                cta(), h3("🍨 主要特色"),
                feat([["🍦", "高端義式冰淇淋", "嚴選食材，高享受，兼顧美味與滑順口感。"], ["💪", "機能系甜點", "結合膳食纖維、高蛋白等機能配方。"], ["🎨", "客製化風味", "活動、餐會、品牌聯名皆可量身打造。"], ["🏛️", "生活美學", "每一款甜點都是視覺 + 味覺的儀式感呈現。"]]),
                h3("⭐ 為什麼適合市集活動"),
                feat([["📸", "高拍照率商品", "提升社群曝光與打卡分享。"], ["🔥", "高話題性", "創新口味吸引消費者關注。"], ["🎨", "主題客製化", "可配合活動打造限定商品。"], ["🤝", "配合度高", "支援快閃、市集與品牌活動。"]]),
                contact()]
        },
        dm: {
            name: "品牌聯名與活動合作（DM 單頁）",
            theme: WEB_THEME,
            blocks: () => [banner(), h1("品牌聯名與活動合作｜瘋菓冰品研究室"),
                text(P("瘋菓提供 <strong>創意客製化甜點與冰品研發</strong>，專業團隊可依品牌需求打造專屬產品，適合品牌聯名、活動甜點與限定商品企劃。")),
                { type: "bullets", title: "合作模式", style: "disc", items: "產品販售（經銷／通路供應）\nOEM／ODM 客製化開發\n聯名／活動合作（品牌行銷專案、限定甜點、主題活動出攤）" },
                { type: "bullets", title: "品牌特色與優勢", style: "disc", items: "高蛋白與機能型冰品研發能力\n風味穩定、造型吸睛，提升辨識度\n適用健身、親子、文創、餐飲、品牌推廣等多元領域\n小量至中量生產彈性，兼顧創意與營養\n提供試吃樣品與專業諮詢" },
                btns([{ text: "立即洽詢合作", url: MAIL, style: "solid" }, { text: "加入官方 LINE", url: LINE, style: "solid" }]),
                contact()]
        },
        b2c: {
            name: "消費者品牌頁（甜點的極致體驗）",
            theme: WEB_THEME,
            blocks: () => [banner(), h1("瘋菓冰品研究室｜甜點的極致體驗"),
                text(P("瘋菓不只是冰品，更是一種風格與態度。每一次品嚐，都像穿上一件精心挑選的禮服，用冰涼詮釋高雅生活。甜點是心靈的避風港，也是日常的小確幸。")),
                { type: "bullets", title: "主要商品", style: "disc", items: "義式冰淇淋與高蛋白冰品\n膳食纖維冰淇淋，低負擔高享受\n創意造型甜點與燒製小品\n客製化甜點訂製，私密聚會、活動皆適用" },
                { type: "bullets", title: "參與活動", style: "disc", items: "市集、音樂祭、運動賽事、文創活動\n品牌特色甜點現場體驗\n試吃與產品諮詢" },
                btns([{ text: "加入官方 LINE 追蹤", url: LINE, style: "solid" }, { text: "追蹤 Instagram", url: IG, style: "solid" }]),
                contact()]
        }
    };

    function renderTplOptions(selected) {

        const mine = userTpl.map(t => `<option value="u:${E(t.id)}">⭐ ${E(t.name)}</option>`).join("");

        dom.tplSelect.innerHTML = `<optgroup label="內建範本（依品牌對外網頁整理）">${Object.keys(TEMPLATES).map(k => `<option value="b:${k}">${TEMPLATES[k].name}</option>`).join("")}</optgroup>` +
            (mine ? `<optgroup label="我的範本">${mine}</optgroup>` : "");

        if (selected) dom.tplSelect.value = selected;
        dom.btnTplDel.disabled = !dom.tplSelect.value.startsWith("u:");
    }

    function currentTpl() {

        const v = dom.tplSelect.value;
        if (v.startsWith("b:")) {
            const t = TEMPLATES[v.slice(2)];
            return t && { name: t.name, theme: t.theme, blocks: t.blocks(), meta: t.meta && t.meta(), defaultLogo: !!t.defaultLogo };
        }
        const u = userTpl.find(t => "u:" + t.id === v);
        return u && { name: u.name, theme: u.theme, blocks: JSON.parse(JSON.stringify(u.blocks)), meta: u.meta && JSON.parse(JSON.stringify(u.meta)) };
    }

    async function saveTemplate() {

        const name = (prompt("範本名稱？（同名會覆蓋）", "") || "").trim();
        if (!name) return;

        const item = { id: (userTpl.find(t => t.name === name) || {}).id || uid(), name, theme: JSON.parse(JSON.stringify(report.theme)), meta: JSON.parse(JSON.stringify(report.meta)), blocks: JSON.parse(JSON.stringify(report.blocks)) };
        item.blocks.forEach(b => delete b.auto);
        userTpl = userTpl.filter(t => t.id !== item.id).concat(item);

        if (!(await DraftStore.set("templates", userTpl))) { alert("範本無法儲存（瀏覽器空間不足，圖片太多或太大）"); return; }
        renderTplOptions("u:" + item.id);
        alert(`✅ 已存成「${name}」，之後可從範本清單的「我的範本」套用`);
    }

    async function deleteTemplate() {

        const v = dom.tplSelect.value;
        const t = userTpl.find(x => "u:" + x.id === v);
        if (!t || !confirm(`刪除我的範本「${t.name}」？`)) return;

        userTpl = userTpl.filter(x => x !== t);
        await DraftStore.set("templates", userTpl);
        renderTplOptions();
    }

    function exportTemplate() {

        const name = (report.blocks.find(b => b.type === "cover")?.title || report.theme.title || "範本").replace(/[\\/:*?"<>|]/g, "_");
        const data = { fonegleTemplate: 1, name, theme: report.theme, meta: report.meta, blocks: report.blocks.map(b => { const c = Object.assign({}, b); delete c.auto; return c; }) };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
        a.download = `${name}.範本.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async function importTemplate() {

        const file = dom.tplFile.files[0];
        dom.tplFile.value = "";
        if (!file) return;

        try {
            const d = JSON.parse(await file.text());
            if (!d || d.fonegleTemplate !== 1 || !Array.isArray(d.blocks) || d.blocks.length > 300) throw new Error("不是範本檔");
            const blocks = d.blocks.filter(b => b && TYPES[b.type]);
            if (!blocks.length) throw new Error("沒有可用的區塊");

            const item = { id: uid(), name: String(d.name || "匯入的範本").slice(0, 40), theme: Object.assign(defaultTheme(), d.theme || {}),
                meta: d.meta && Array.isArray(d.meta.rows) ? { rows: d.meta.rows.slice(0, 12).map(r => ({ label: String(r.label || "").slice(0, 40), value: String(r.value || "").slice(0, 200) })) } : undefined, blocks: blocks.map(b => { const c = Object.assign({}, b); delete c.id; return c; }) };
            userTpl.push(item);

            if (!(await DraftStore.set("templates", userTpl))) throw new Error("空間不足，無法儲存");
            renderTplOptions("u:" + item.id);
            alert(`✅ 已匯入「${item.name}」，在「我的範本」`);
        } catch (err) {
            alert("匯入失敗：" + (err?.message || err));
        }
    }

    async function applyTemplate() {

        const tpl = currentTpl();
        if (!tpl) return;
        if (!confirm(`套用「${tpl.name}」？目前的區塊會被取代（Logo 與品牌預設保留）。`)) return;

        const logo = report.theme.logo;
        report.theme = Object.assign(defaultTheme(), tpl.theme, logo && !tpl.theme.logo ? { logo } : {});
        if (tpl.meta && Array.isArray(tpl.meta.rows)) report.meta = tpl.meta;
        if (tpl.defaultLogo && !report.theme.logo) { try { report.theme.logo = await fetchDefaultLogo(); } catch { } }
        report.blocks = tpl.blocks.map(b => Object.assign({}, b, { id: uid() }));
        report.source = null;
        openId = report.blocks[0].id;

        renderAll();
        scheduleSave();
    }

    // =========================
    // 品牌預設
    // =========================
    function saveBrand() {
        const t = report.theme;
        const keys = ["preset", "primary", "dark", "textColor", "font", "baseSize", "pageSize", "companyName", "companySub", "logo", "watermark", "watermarkText", "footerText", "footerBless", "numbering", "layout", "pageBg", "cardBg", "cardWidth", "cardRadius",
            "logoShow", "logoAlign", "logoW", "logoDx", "logoDy", "headStyle", "figLabel", "runHead", "runHeadLeft", "runHeadRight", "runFootLeft", "pageNo", "pageFmt", "watermarkType", "wmImage", "wmColor", "wmSize", "wmOpacity", "wmAngle", "wmPos"];
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
        a.download = `${title}_${(report.meta.rows.find(r => /日期/.test(r.label)) || {}).value || todayText()}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    return { init };

})();
