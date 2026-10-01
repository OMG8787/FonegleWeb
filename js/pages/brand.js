window.Pages = window.Pages || {};

// =========================================================
// 品牌資訊（只瀏覽）：每一段都有 📋 複製
//   內容來自 Site.brand：優先讀 site-config.json 的 brandPage，沒有檔案才讀試算表的 BrandBlocks 表
//   編輯請到「系統 → 公司與功能設定」（只有系統管理員）；程式裡不放任何公司資料
// =========================================================
Pages.Brand = (() => {

    "use strict";

    const dom = {};

    const canEdit = () => Auth.hasPermission(3, 13);

    async function init() {

        dom.content = document.getElementById("content");

        document.addEventListener("click", e => {
            const b = e.target.closest("[data-copy]");
            if (b) copy(b.dataset.copy);
        });

        Site.onChange(render);

        render();
        await Site.refresh();
        render();
    }

    function render() {

        const saved = BrandBlocks.clean(Site.brand);

        dom.content.innerHTML = BrandBlocks.viewAll(saved) +
            (!saved.length ? `<div class="text-muted small">${canEdit() ? "還沒有設定內容。請到「系統 → 公司與功能設定」編輯品牌資訊頁。" : "管理人員還沒有設定內容。"}</div>` : "");
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
