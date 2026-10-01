window.Pages = window.Pages || {};

// =========================================================
// 品牌資訊：內容全部來自「公司與功能設定」（Settings 表），程式裡不放任何公司資料
// =========================================================
Pages.Brand = (() => {

    "use strict";

    const E = App.esc;

    function init() {

        render();

        // 設定有更新（背景讀取完成 / 管理員儲存）就重畫
        Site.onChange(render);

        // 系統管理員才顯示「到設定頁修改」
        document.getElementById("btnEdit").classList.toggle("d-none", !Auth.hasPermission(3));

        document.addEventListener("click", e => {
            const b = e.target.closest("[data-copy]");
            if (b) copy(b.dataset.copy);
        });
    }

    const row = (label, value) => value
        ? `<div class="mb-1"><strong>${label}</strong>${E(value)} <span class="copy-btn" data-copy="${E(value)}" title="複製">📋</span></div>`
        : "";

    const link = (label, url) => url
        ? `<div class="py-1">${label}<a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(url)}</a> <span class="copy-btn" data-copy="${E(url)}" title="複製">📋</span></div>`
        : "";

    function render() {

        const c = Site.company;

        const info = [
            row("📌 品牌名稱：", c.brandName),
            row("🚀 食品登陸字號：", c.foodRegNo),
            row("🚀 聯絡人：", c.contactName),
            row("📞 電話：", c.phone),
            row("💬 LINE ID：", c.lineId),
            row("📧 Email：", c.email),
            row("📄 統一編號：", c.taxId),
            row("🖥️ 抬頭：", c.companyName),
            row("📍 地址：", c.address)
        ].join("");

        document.getElementById("infoList").innerHTML = info || empty();

        const links = [
            link("🌐 官網：", c.website),
            link("📸 Instagram：", c.instagramUrl),
            link("💬 LINE：", c.lineUrl),
            link("🔗 連結樹：", c.linkTreeUrl)
        ].join("");

        document.getElementById("linkList").innerHTML = links || empty();

        // 備註：空白行分段，每一段都可以單獨複製
        const blocks = String(c.brandNotes || "").split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

        document.getElementById("notes").innerHTML = blocks.length
            ? blocks.map(t => `<div class="note-block">${E(t)} <span class="copy-btn" data-copy="${E(t)}" title="複製這一段">📋</span></div>`).join("")
            : empty();
    }

    const empty = () => `<div class="text-muted small">尚未填寫。系統管理員可到「系統 → 公司與功能設定」填寫。</div>`;

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
