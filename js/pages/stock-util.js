// =========================================================
// 盤點 / 進貨共用工具（產品月盤點、原物料進貨 / 盤點、漲幅表）
// =========================================================
const StockUtil = {

    pad: n => String(n).padStart(2, "0"),

    today() {
        const d = new Date();
        return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    thisMonth() {
        return this.today().slice(0, 7);
    },

    // "2026-09" → "2026-08"
    addMonth(month, n) {
        const [y, m] = month.split("-").map(Number);
        const d = new Date(y, m - 1 + n, 1);
        return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}`;
    },

    monthEnd(month) {
        const [y, m] = month.split("-").map(Number);
        return `${month}-${this.pad(new Date(y, m, 0).getDate())}`;
    },

    addDays(date, days) {
        const d = new Date(date + "T00:00:00");
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    date(v) {
        return App.toDateInput(v) || "";
    },

    // 數字顯示：最多 2 位小數
    qty(v) {
        if (v === "" || v === null || v === undefined || isNaN(v)) return "";
        return Number(Number(v).toFixed(2)).toLocaleString();
    },

    money(v, digits = 0) {
        if (v === "" || v === null || v === undefined || isNaN(v)) return "";
        const n = Number(v);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    },

    pct(v) {
        if (v === null || v === undefined || !isFinite(v)) return "";
        return (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
    },

    // 到期狀態：expired / soon（30 天內）/ ok
    expireState(date, soonDays = 30) {
        if (!date) return "";
        const today = this.today();
        if (date < today) return "expired";
        if (date <= this.addDays(today, soonDays)) return "soon";
        return "ok";
    },

    expireBadge(date) {
        const s = this.expireState(date);
        const esc = App.esc;
        if (!date) return "";
        if (s === "expired") return `<span class="badge bg-danger">${esc(date)} 已過期</span>`;
        if (s === "soon") return `<span class="badge bg-warning text-dark">${esc(date)} 即期</span>`;
        return esc(date);
    },

    // 下載 CSV（Excel 可直接開啟）
    downloadCsv(filename, rows) {
        const csv = rows.map(r => r.map(v => {
            const s = v === null || v === undefined ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")).join("\r\n");

        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
};
