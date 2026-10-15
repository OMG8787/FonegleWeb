window.Pages = window.Pages || {};

const App = {

    async init(pageName = null) {

        Layout.init();

        // 版面統一：搜尋區可收合、左側列表延伸（先處理，頁面載入資料時版面就固定好）
        App.enhance();

        if (pageName && Pages[pageName]) {
            await Pages[pageName].init();
        }
    },

    // =========================
    // 版面統一（全站）
    //   1. 搜尋區塊（.search-area 或 data-search-box）加上「收合 / 展開」，每次進頁面預設展開
    //   2. 左列表、右表單：左側列表延伸到跟右側表單一樣高（CSS 見 layout.css 的 .side-col）
    // =========================
    enhance() {

        document.querySelectorAll(".search-area, [data-search-box]").forEach(el => {
            if (el.dataset.collapsible) return;
            el.dataset.collapsible = "1";
            const bar = document.createElement("div");
            bar.className = "search-toggle d-flex justify-content-between align-items-center";
            bar.innerHTML = `<span class="small fw-bold text-muted">${App.esc(el.dataset.searchBox || "🔍 搜尋條件")}</span>
                <button type="button" class="btn btn-sm btn-link p-0 text-decoration-none" aria-expanded="true">▲ 收合</button>`;
            el.parentNode.insertBefore(bar, el);
            const btn = bar.querySelector("button");
            btn.addEventListener("click", () => {
                const hide = !el.classList.contains("d-none");
                el.classList.toggle("d-none", hide);
                btn.textContent = hide ? "▼ 展開" : "▲ 收合";
                btn.setAttribute("aria-expanded", String(!hide));
            });
        });

        document.querySelectorAll('[class*="list-wrapper"], .list-wrap').forEach(w => {
            const col = w.closest('[class*="col-lg-"], [class*="col-xl-"]');
            if (!col || !col.parentElement || !col.parentElement.querySelector("#formCard") || col.contains(document.getElementById("formCard"))) return;
            col.classList.add("side-col");
            for (let el = w.parentElement; el && el !== col; el = el.parentElement) el.classList.add("side-flex");
            w.classList.add("side-fill");
        });
    },

    toast(msg) {
        alert(msg);
    },

    // 顯示錯誤（API 失敗時的訊息）
    error(err, fallback = "操作失敗") {

        console.error(err);

        // 登入失效時 Auth 已經提示並跳轉
        if (err?.code === "AUTH")
            return;

        alert(err?.message || fallback);
    },

    // HTML 跳脫，避免資料內容破壞畫面
    esc(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },

    // 模糊比對（不分大小寫）
    like(value, keyword) {

        if (keyword === undefined || keyword === null || String(keyword).trim() === "")
            return true;

        return String(value ?? "")
            .toLowerCase()
            .includes(String(keyword).trim().toLowerCase());
    },

    toBool(v) {

        if (v === true) return true;
        if (!v) return false;

        return /^(true|1|是|y|yes|啟用|開啟|✔)$/i.test(String(v).trim());
    },

    num(v, fallback = 0) {

        const n = Number(String(v ?? "").replace(/,/g, ""));

        return v === "" || v === null || v === undefined || isNaN(n)
            ? fallback
            : n;
    },

    // 空字串 → null（寫入數字欄位用）
    numOrNull(v) {

        if (v === "" || v === null || v === undefined) return null;

        const n = Number(String(v).replace(/,/g, ""));

        return isNaN(n) ? null : n;
    },

    // 現在時間 yyyy-MM-dd HH:mm:ss（本地時區）
    now() {

        const d = new Date();
        const p = n => String(n).padStart(2, "0");

        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },

    // 任意日期字串 → yyyy-MM-dd（給 <input type=date>）
    toDateInput(v) {

        if (!v) return "";

        const s = String(v).trim().replace(/\//g, "-");
        const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

        return m
            ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
            : "";
    },

    // 任意日期字串 → yyyy-MM-ddTHH:mm（給 <input type=datetime-local>）
    toDateTimeInput(v) {

        if (!v) return "";

        const s = String(v).trim().replace(/\//g, "-");
        const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);

        if (!m) return "";

        return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}`;
    },

    // 顯示用：yyyy-MM-ddTHH:mm → yyyy-MM-dd HH:mm
    showDateTime(v) {
        return String(v || "").replace("T", " ").slice(0, 16);
    }
};

/**
 * 組字串工具
 */
function addLine(label, value, arr) {
    if (value) arr.push(`${label}: ${value}`);
}

/**
 * datetime-local 格式化工具
 * yyyy-MM-ddTHH:mm
 */
function formatDateTime(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d}T${h}:${min}`;
}
