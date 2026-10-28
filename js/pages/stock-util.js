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

    // 出貨紀錄：出貨單（Shipment）＋ 已出貨的訂單（沒有開出貨單的訂單才算，避免重複）
    //   訂單算出貨：訂單狀態 已出貨 / 配送中 / 已完成，或出貨狀態 已出貨 / 配送中 / 已送達 / 已完成；取消、退款不算
    //   日期：出貨單的出貨日；訂單用預計出貨日，沒填用下單日
    //   回傳 [{ pid, qty, date, source, ref }]
    shippedRows(orders, shipments) {
        const out = [];
        const covered = new Set();
        (shipments || []).forEach(s => {
            if (s.OrderID) covered.add(String(s.OrderID).trim());
            if (!s.ProductID) return;
            out.push({ pid: String(s.ProductID), qty: Number(s.ShippingQty) || 0, date: this.date(s.ShippingDate || s.CreatedAt), source: "出貨單", ref: s.ShipmentNo || "" });
        });
        const SHIPPED_ORDER = ["已出貨", "配送中", "已完成", "完成"];
        const SHIPPED_SHIP = ["已出貨", "配送中", "已送達", "已完成"];
        (orders || []).forEach(o => {
            if (!o.ProductID || o.OrderStatus === "取消" || o.PaymentStatus === "退款") return;
            if (covered.has(String(o.OrderNo || "").trim()) || covered.has(String(o.OrderID))) return;
            if (!SHIPPED_ORDER.includes(o.OrderStatus) && !SHIPPED_SHIP.includes(o.ShippingStatus)) return;
            out.push({ pid: String(o.ProductID), qty: Number(o.Qty) || 0, date: this.date(o.ExpectedShippingDate || o.OrderDate || o.UpdatedAt), source: "訂單", ref: o.OrderNo || "" });
        });
        return out;
    },

    // 推算目前庫存：最近一次有實盤的月份（月底的實盤數量）＋ 之後製作 − 之後出貨
    //   沒有盤點過：從第一次生產開始算（之前的舊訂單不算）；沒有生產紀錄也沒有盤點 → null（用產品頁填的庫存）
    stockNow(pid, { productions, shipped, counts }) {
        pid = String(pid);
        const pdate = x => this.date(x.MfgDate || x.StartTime || x.CreatedAt);
        const prods = (productions || []).filter(x => String(x.ProductID) === pid && x.Status !== "已取消");
        const last = (counts || [])
            .filter(c => String(c.ProductID) === pid && c.CountedQty !== null && c.CountedQty !== undefined && c.CountedQty !== "")
            .sort((a, b) => String(b.CountMonth).localeCompare(String(a.CountMonth)))[0];
        let base = 0, from;
        if (last) {
            base = Number(last.CountedQty) || 0;
            from = this.addDays(this.monthEnd(last.CountMonth), 1);
        } else {
            from = prods.map(pdate).filter(Boolean).sort()[0];
            if (!from) return null;
        }
        const made = prods.filter(x => pdate(x) >= from).reduce((t, x) => t + (Number(x.ProducedQty) || 0), 0);
        const out = (shipped || []).filter(s => s.pid === pid && s.date >= from).reduce((t, s) => t + s.qty, 0);
        return base + made - out;
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
