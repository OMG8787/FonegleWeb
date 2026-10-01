window.Pages = window.Pages || {};

// =========================================================
// 公司與功能設定（只有系統管理員）
//   公司資料、Logo、功能開關都存在 Settings 表，由 js/site.js 讀寫
// =========================================================
Pages.SiteSettings = (() => {

    "use strict";

    const E = App.esc;
    const dom = {};
    let editor = null;        // 品牌資訊頁的區塊編輯器（js/brand-blocks.js）
    let savedBrand = [];      // 試算表裡目前的品牌資訊區塊（含 id，用來比對要新增 / 修改 / 刪除）
    let pendingLogo = "";     // 匯入檔裡的 Logo，按「儲存公司資料」時一起存

    // [欄位, 名稱, 說明, 寬度 col, 型別]
    const FIELDS = [
        ["appName", "系統名稱", "左上角與瀏覽器分頁標題", "col-md-6"],
        ["brandShort", "品牌簡稱", "手機版標題、AI 文案會用到", "col-md-6"],
        ["brandName", "品牌全名", "", "col-md-6"],
        ["brandSub", "品牌副標（英文標語）", "", "col-md-6"],
        ["companyName", "公司名稱（抬頭）", "頁尾、報告抬頭、寄件人", "col-md-6"],
        ["taxId", "統一編號", "", "col-md-6"],
        ["contactName", "聯絡人 / 負責人", "", "col-md-4"],
        ["phone", "電話", "", "col-md-4"],
        ["email", "Email", "", "col-md-4"],
        ["address", "地址", "", "col-12"],
        ["lineId", "LINE 帳號", "例如 @abc123", "col-md-4"],
        ["lineUrl", "LINE 連結", "https://…", "col-md-8"],
        ["instagramUrl", "Instagram 連結", "https://…", "col-md-6"],
        ["website", "官方網站", "https://…", "col-md-6"],
        ["linkTreeUrl", "連結樹網址", "https://…", "col-md-6"],
        ["bannerUrl", "宣傳頁橫幅圖網址", "https://…（製作報告的宣傳頁範本使用）", "col-md-6"],
        ["reportFooter", "報告預設頁尾聲明", "可多行；留空就用「本文件為 公司名稱 內部文件…」", "col-12", "area"],
        ["aiBrandIntro", "AI 文案的品牌簡介", "一兩句話說明你的品牌，AI 寫文案時會參考", "col-12", "area"]
    ];

    async function init() {

        [
            "sourceStatus", "companyForm", "btnSaveCompany", "btnResetCompany", "btnExportCompany", "btnImportCompany", "settingsFile", "logoPreview", "logoEmpty", "logoFile", "btnClearLogo",
            "featureList", "optAiChat", "btnSaveFeatures", "content", "addType", "btnAdd", "btnSaveBrand", "btnReloadBrand"
        ].forEach(id => dom[id] = document.getElementById(id));

        // 編輯一律以試算表為準（略過 site-config.json），避免拿舊檔案的內容去覆蓋試算表
        await Site.refresh(true, "sheet");

        renderCompany();
        renderLogo();
        renderFeatures();
        editor = BrandBlocks.createEditor({ content: dom.content, addType: dom.addType, addBtn: dom.btnAdd });
        loadBrand();
        renderStatus();

        dom.btnSaveBrand.addEventListener("click", saveBrand);
        dom.btnReloadBrand.addEventListener("click", () => { if (!editor.isDirty() || confirm("放棄剛才的修改？")) loadBrand(); });
        dom.btnSaveCompany.addEventListener("click", saveCompany);
        dom.btnResetCompany.addEventListener("click", resetCompany);
        dom.btnExportCompany.addEventListener("click", exportSettings);
        dom.btnImportCompany.addEventListener("click", () => dom.settingsFile.click());
        dom.settingsFile.addEventListener("change", importSettings);
        dom.logoFile.addEventListener("change", onLogoFile);
        dom.btnClearLogo.addEventListener("click", clearLogo);
        dom.btnSaveFeatures.addEventListener("click", saveFeatures);

        dom.featureList.addEventListener("change", e => {
            const g = e.target.closest("[data-group]");
            if (g) dom.featureList.querySelectorAll(`[data-in-group="${g.dataset.group}"]:not(:disabled)`).forEach(c => { c.checked = g.checked; });
        });
    }

    // =========================
    // 資料來源狀態：site-config.json 與試算表是否一致
    // =========================
    const brandNorm = list => BrandBlocks.clean(list).map(b => [b.type, b.data]);

    const norm = (c, f, logo, brand) => JSON.stringify({
        brand: brandNorm(brand),
        company: Object.fromEntries(FIELDS.map(([k]) => [k, String((c || {})[k] ?? "")])),
        off: [...new Set(((f || {}).disabled || []).map(Number))].sort((a, b) => a - b),
        ai: (f || {}).aiChat !== false,
        logo: String(logo || "")
    });

    async function renderStatus() {

        const box = dom.sourceStatus;
        const file = await Site.readFile();

        box.className = "alert small";

        if (!file) {
            box.classList.add("alert-info");
            box.innerHTML = "ℹ️ 網站根目錄目前<b>沒有</b> <code>site-config.json</code>，所以每次開啟網站都會向試算表讀取設定（比較慢）。設定好之後請按「⬇️ 匯出 site-config.json」，把檔案放到網站根目錄（和 index.html 同一層），之後網站會優先讀這個檔，開啟更快。";
            return;
        }

        const same = norm(Site.company, Site.features, Site.logo, Site.brand) === norm(file.company, file.features, file.logo, file.brandPage);

        if (same) {
            box.classList.add("alert-success");
            box.innerHTML = `✅ 網站正在使用 <code>site-config.json</code>（匯出時間 ${E(file.exportedAt ? new Date(file.exportedAt).toLocaleString("zh-TW", { hour12: false }) : "未知")}），內容與試算表一致。`;
        } else {
            box.classList.add("alert-warning");
            box.innerHTML = "⚠️ 網站其他人目前看到的是 <code>site-config.json</code> 的內容，和你現在試算表裡的設定<b>不一樣</b>。請按「⬇️ 匯出 site-config.json」，用新檔案覆蓋網站根目錄的舊檔（這個瀏覽器已先套用你剛改的內容）。";
        }
    }

    // =========================
    // 品牌資訊頁內容（BrandBlocks 表，一列一個區塊）
    // =========================
    function loadBrand() {
        savedBrand = BrandBlocks.clean(Site.brand);
        editor.load(savedBrand);
    }

    async function saveBrand() {

        let ops;
        try { ops = editor.buildOps(savedBrand); } catch (err) { alert(err.message); return; }

        try {

            dom.btnSaveBrand.disabled = true;
            if (ops.length) await API.batch(ops);

            await Site.refresh(true, "sheet");
            Site.touch();
            loadBrand();
            renderStatus();
            alert(ops.length ? "✅ 品牌資訊已儲存到試算表。\n\n若網站根目錄有 site-config.json，請重新「匯出 site-config.json」並更新該檔案，其他人才會看到；沒有這個檔的話，重新整理頁面就會看到。" : "沒有變更");

        } catch (err) {

            App.error(err, "儲存失敗");

        } finally {

            dom.btnSaveBrand.disabled = false;
        }
    }

    // =========================
    // 公司資料
    // =========================
    function renderCompany() {

        const c = Site.company;

        dom.companyForm.innerHTML = FIELDS.map(([k, label, hint, col, type]) => `
<div class="${col}">
    <label class="form-label small mb-0">${E(label)}</label>
    ${type === "area" || type === "area8"
        ? `<textarea id="f_${k}" class="form-control form-control-sm" rows="${type === "area8" ? 8 : 3}">${E(c[k] ?? "")}</textarea>`
        : `<input id="f_${k}" class="form-control form-control-sm" value="${E(c[k] ?? "")}">`}
    ${hint ? `<div class="form-text mt-0">${E(hint)}</div>` : ""}
</div>`).join("");
    }

    async function saveCompany() {

        const data = {};
        FIELDS.forEach(([k]) => { data[k] = document.getElementById("f_" + k).value.trim(); });

        for (const k of ["lineUrl", "instagramUrl", "website", "linkTreeUrl", "bannerUrl"])
            if (data[k] && !/^https:\/\/[^\s"'<>]+$/.test(data[k])) { alert(`「${FIELDS.find(f => f[0] === k)[1]}」請填 https:// 開頭的網址，或留空`); return; }

        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { alert("Email 格式不正確"); return; }
        if (!data.appName) { alert("系統名稱不能空白"); return; }
        if (Object.values(data).some(v => /[<>]/.test(v))) { alert("欄位內容不能包含 < 或 > 符號"); return; }

        try {
            dom.btnSaveCompany.disabled = true;
            await Site.save("company", data);
            if (pendingLogo) { await Site.save("logo", pendingLogo); pendingLogo = ""; renderLogo(); }
            renderStatus();
            alert("✅ 公司資料已儲存到試算表。\n\n若網站根目錄有 site-config.json，其他人要等你重新「匯出 site-config.json」並更新該檔案後才會看到；沒有這個檔的話，重新整理頁面就會看到。");
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            dom.btnSaveCompany.disabled = false;
        }
    }

    async function resetCompany() {

        if (!confirm("還原為系統預設的公司資料？（Logo 與功能開關不受影響）")) return;

        try {
            await Site.save("company", {});
            renderCompany();
            alert("已還原為預設");
        } catch (err) {
            App.error(err, "還原失敗");
        }
    }

    // =========================
    // 匯出 / 匯入（備份或換系統用；匯入只填進畫面，確認後再按儲存）
    // =========================
    // 匯出的品牌資訊：畫面上編輯中的內容（還沒有內容、也沒改過就不匯出）
    function savedBrandForExport() {
        return savedBrand.length || editor.isDirty() ? editor.blocks() : [];
    }

    function exportSettings() {

        const company = {};
        FIELDS.forEach(([k]) => { company[k] = document.getElementById("f_" + k).value.trim(); });

        const disabled = [...dom.featureList.querySelectorAll("[data-id]:not(:disabled)")].filter(c => !c.checked).map(c => Number(c.dataset.id));
        const data = { fonegleSettings: 1, exportedAt: new Date().toISOString(), company, features: { disabled, aiChat: dom.optAiChat.checked }, logo: Site.logo, brandPage: savedBrandForExport() };

        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = "site-config.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async function importSettings() {

        const f = dom.settingsFile.files[0];
        dom.settingsFile.value = "";
        if (!f) return;

        try {
            const d = JSON.parse(await f.text());
            const isSettings = d && d.fonegleSettings === 1 && typeof d.company === "object";
            const isBrand = d && d.fonegleBrandPage === 1 && Array.isArray(d.blocks);   // 只有品牌資訊頁內容的舊格式

            if (!isSettings && !isBrand) throw new Error("不是設定檔");

            const notes = [];

            if (isSettings) {

                FIELDS.forEach(([k]) => {
                    if (typeof d.company[k] === "string") document.getElementById("f_" + k).value = d.company[k];
                });

                if (d.features && typeof d.features === "object") {
                    const off = new Set((d.features.disabled || []).map(Number));
                    dom.featureList.querySelectorAll("[data-id]:not(:disabled)").forEach(c => { c.checked = !off.has(Number(c.dataset.id)); });
                    if (typeof d.features.aiChat === "boolean") dom.optAiChat.checked = d.features.aiChat;
                }

                if (typeof d.logo === "string" && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(d.logo) && d.logo.length <= 45000) pendingLogo = d.logo;

                notes.push("請確認後，分別按「儲存公司資料」與「儲存功能開關」");
            }

            const list = isSettings ? d.brandPage : d.blocks;

            if (Array.isArray(list) && list.length <= 300) {

                const blocks = BrandBlocks.clean(list);

                if (blocks.length) {
                    editor.replace(blocks);
                    notes.push(`品牌資訊頁已載入 ${blocks.length} 個區塊，請按「儲存品牌資訊」`);
                }
            }

            alert("已把檔案內容填入畫面（還沒有儲存）。\n" + notes.join("；") + "，才會真正儲存。");

        } catch (err) {
            alert("匯入失敗：" + (err?.message || err));
        }
    }

    // =========================
    // Logo
    // =========================
    function renderLogo() {
        const logo = Site.logo;
        dom.logoPreview.src = logo || "";
        dom.logoPreview.style.display = logo ? "" : "none";
        dom.logoEmpty.style.display = logo ? "none" : "";
    }

    // 縮小到約 200px 寬，存成 PNG（保留透明）；試算表一格最多 5 萬字元，太大就再縮
    async function shrink(file) {

        const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

        for (const w of [200, 150, 110, 80]) {
            const k = Math.min(1, w / img.width);
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            const out = c.toDataURL("image/png");
            if (out.length <= 45000) return out;
        }

        throw new Error("圖片太複雜，縮小後仍超過上限，請換一張較簡單的 Logo");
    }

    async function onLogoFile() {

        const f = dom.logoFile.files[0];
        dom.logoFile.value = "";
        if (!f) return;

        try {
            await Site.save("logo", await shrink(f));
            renderLogo();
            alert("✅ Logo 已更新");
        } catch (err) {
            App.error(err, "Logo 儲存失敗");
        }
    }

    async function clearLogo() {

        if (!Site.logo || !confirm("移除 Logo？")) return;

        try {
            await Site.save("logo", "");
            renderLogo();
        } catch (err) {
            App.error(err, "移除失敗");
        }
    }

    // =========================
    // 功能開關
    // =========================
    function renderFeatures() {

        const f = Site.features;
        const off = new Set((f.disabled || []).map(Number));
        const locked = new Set(Config.lockedIds || []);

        dom.featureList.innerHTML = Config.menuData.map((g, gi) => `
<div class="feat-group">
    <h6><label><input type="checkbox" data-group="${gi}" ${g.items.every(i => locked.has(i.id) || !off.has(i.id)) ? "checked" : ""}> ${E(g.icon || "")} ${E(g.group)}</label></h6>
    ${g.items.map(i => `<label class="feat-item ${locked.has(i.id) ? "locked" : ""}">
        <input type="checkbox" data-in-group="${gi}" data-id="${i.id}" ${locked.has(i.id) || !off.has(i.id) ? "checked" : ""} ${locked.has(i.id) ? "disabled" : ""}>
        ${locked.has(i.id) ? "🔒 " : ""}${E(i.name)}</label>`).join("")}
</div>`).join("");

        dom.optAiChat.checked = f.aiChat !== false;
    }

    async function saveFeatures() {

        const disabled = [...dom.featureList.querySelectorAll("[data-id]:not(:disabled)")]
            .filter(c => !c.checked).map(c => Number(c.dataset.id));

        try {
            dom.btnSaveFeatures.disabled = true;
            await Site.save("features", { disabled, aiChat: dom.optAiChat.checked });
            renderStatus();
            alert(`✅ 已儲存（關閉 ${disabled.length} 個功能）。\n\n若網站根目錄有 site-config.json，請重新「匯出 site-config.json」並更新該檔案；沒有這個檔的話，其他人重新整理頁面後生效。`);
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            dom.btnSaveFeatures.disabled = false;
        }
    }

    return { init };

})();
