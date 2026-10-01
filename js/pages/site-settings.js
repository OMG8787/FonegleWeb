window.Pages = window.Pages || {};

// =========================================================
// 公司與功能設定（只有系統管理員）
//   公司資料、Logo、功能開關都存在 Settings 表，由 js/site.js 讀寫
// =========================================================
Pages.SiteSettings = (() => {

    "use strict";

    const E = App.esc;
    const dom = {};

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
            "companyForm", "btnSaveCompany", "btnResetCompany", "btnExportCompany", "btnImportCompany", "settingsFile", "logoPreview", "logoEmpty", "logoFile", "btnClearLogo",
            "featureList", "optAiChat", "btnSaveFeatures"
        ].forEach(id => dom[id] = document.getElementById(id));

        // 先向伺服器取最新設定再畫畫面
        await Site.refresh(true);

        renderCompany();
        renderLogo();
        renderFeatures();

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
            alert("✅ 公司資料已儲存，其他人重新整理頁面就會看到");
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
    function exportSettings() {

        const company = {};
        FIELDS.forEach(([k]) => { company[k] = document.getElementById("f_" + k).value.trim(); });

        const disabled = [...dom.featureList.querySelectorAll("[data-id]:not(:disabled)")].filter(c => !c.checked).map(c => Number(c.dataset.id));
        const data = { fonegleSettings: 1, company, features: { disabled, aiChat: dom.optAiChat.checked } };

        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        a.download = "公司設定.json";
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
            if (!d || d.fonegleSettings !== 1 || typeof d.company !== "object") throw new Error("不是公司設定檔");

            FIELDS.forEach(([k]) => {
                if (typeof d.company[k] === "string") document.getElementById("f_" + k).value = d.company[k];
            });

            if (d.features && typeof d.features === "object") {
                const off = new Set((d.features.disabled || []).map(Number));
                dom.featureList.querySelectorAll("[data-id]:not(:disabled)").forEach(c => { c.checked = !off.has(Number(c.dataset.id)); });
                if (typeof d.features.aiChat === "boolean") dom.optAiChat.checked = d.features.aiChat;
            }

            alert("已把檔案內容填入畫面。請確認後，分別按「儲存公司資料」與「儲存功能開關」才會真正儲存。");

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
            alert(`✅ 已儲存（關閉 ${disabled.length} 個功能）。其他人重新整理頁面後生效`);
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            dom.btnSaveFeatures.disabled = false;
        }
    }

    return { init };

})();
