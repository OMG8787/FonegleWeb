// =========================================================
// 深色 / 淺色模式（整個系統共用）
//   第一次進來跟著瀏覽器 / 系統的設定，按右上角按鈕切換後記住（只存在這個瀏覽器）
//   放在 <head> 最前面載入，頁面畫出來之前就套用，不會閃一下白畫面
//   Bootstrap 5.3 用 <html data-bs-theme="dark|light"> 切換；其餘自訂顏色在 css/dark.css
// =========================================================
(function () {

    "use strict";

    var KEY = "fonegle_theme";
    var root = document.documentElement;

    function saved() {
        try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : ""; } catch (e) { return ""; }
    }

    function system() {
        return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function apply(t) {
        root.setAttribute("data-bs-theme", t);
        root.style.colorScheme = t;
        // 圖表（Chart.js）的文字與格線顏色
        if (window.Chart && Chart.defaults) {
            Chart.defaults.color = t === "dark" ? "#cbd5e1" : "#666";
            Chart.defaults.borderColor = t === "dark" ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.1)";
        }
        document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
            b.textContent = t === "dark" ? "☀️" : "🌙";
            b.title = t === "dark" ? "切換為淺色模式" : "切換為深色模式";
            b.setAttribute("aria-label", b.title);
        });
    }

    var current = saved() || system();
    apply(current);

    window.Theme = {

        get: function () { return root.getAttribute("data-bs-theme") || "light"; },

        set: function (t) {
            if (t !== "dark" && t !== "light") return;
            try { localStorage.setItem(KEY, t); } catch (e) { }
            apply(t);
            try { window.dispatchEvent(new CustomEvent("themechange", { detail: t })); } catch (e) { }
        },

        toggle: function () { this.set(this.get() === "dark" ? "light" : "dark"); },

        // 切換按鈕（header 與登入頁共用）
        refresh: function () { apply(this.get()); }
    };

    // 沒有手動選過 → 系統切換深淺色時跟著變
    if (window.matchMedia) {
        var mq = matchMedia("(prefers-color-scheme: dark)");
        var follow = function () { if (!saved()) apply(system()); };
        if (mq.addEventListener) mq.addEventListener("change", follow);
    }

    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-theme-btn]");
        if (b) window.Theme.toggle();
    });

    document.addEventListener("DOMContentLoaded", function () { window.Theme.refresh(); });

})();
