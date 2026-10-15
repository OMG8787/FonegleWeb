// =========================================================
// 訂單統計（首頁品牌損益、品牌攤提表、客戶頁共用）
// - 訂單資料一列一個品項，同一個 OrderNo 合併成一張訂單
// - 營收 = 訂單總額（TotalAmount，已扣折扣）− 運費：運費是支出，不算收益（但仍計入客戶的應收帳款）
// - 成本 = Σ 數量 × 單位成本：訂單記有成本單價（UnitCost，確認成交 / 已付款時鎖定）→ 用當時記下的（不再變動）；
//          其餘用產品目前的成本價（Products.CostPrice，食材浮動時會跟著變）；都沒有的品項以 0 計，並記在 missing
// - 退款、取消的訂單不計
// - 通路：SalesChannel = B2B → B2B；其他（LINE / 官網 / 門市 / 其他）→ 線上訂單
// =========================================================
window.OrderStats = {

    // 訂單編號 → 運費（訂單資料一列一個品項，運費每列都一樣，取第一列）
    shipMap(rows) {
        const m = new Map();
        (rows || []).forEach(r => { if (r.OrderNo && !m.has(String(r.OrderNo))) m.set(String(r.OrderNo), App.num(r.ShippingFee)); });
        return m;
    },

    // 帳款已收的金額扣掉運費的部分（運費是支出，不算營收；依已收比例分攤，只有由訂單建立的帳款才扣）
    netPaid(r, ship) {
        const paid = App.num(r.PaidAmount);
        const fee = r.OrderID ? ship && ship.get(String(r.OrderID)) : 0;
        const amount = App.num(r.Amount);
        if (!paid || !fee || amount <= 0) return paid;
        return paid - Math.min(fee, amount) * Math.min(1, paid / amount);
    },

    group(rows, products) {

        const costOf = new Map();
        (products || []).forEach(p => {
            if (p.CostPrice !== null && p.CostPrice !== undefined && p.CostPrice !== "")
                costOf.set(String(p.ID), App.num(p.CostPrice));
        });

        const map = new Map();

        (rows || []).forEach(r => {

            if (!r.OrderNo) return;

            let o = map.get(r.OrderNo);

            if (!o) {
                o = {
                    orderNo: r.OrderNo,
                    companyId: r.CompanyId === null || r.CompanyId === undefined || r.CompanyId === "" ? "" : String(r.CompanyId),
                    channel: r.SalesChannel || "",
                    date: App.toDateInput(r.OrderDate) || "",
                    shipping: App.num(r.ShippingFee),
                    revenue: Math.max(0, App.num(r.TotalAmount) - App.num(r.ShippingFee)),
                    cost: 0,
                    missing: 0,
                    locked: true,
                    refunded: false,
                    cancelled: true
                };
                map.set(r.OrderNo, o);
            }

            if (r.PaymentStatus === "退款") o.refunded = true;
            if (r.OrderStatus !== "取消") o.cancelled = false;          // 整張訂單都取消才算取消

            const pid = String(r.ProductID ?? "");
            const snap = r.UnitCost;

            if (snap !== null && snap !== undefined && snap !== "") {
                o.cost += App.num(r.Qty) * App.num(snap);          // 已確認成交：成本已鎖定
            } else {
                o.locked = false;
                if (costOf.has(pid)) o.cost += App.num(r.Qty) * costOf.get(pid);
                else o.missing++;
            }
        });

        return [...map.values()]
            .filter(o => !o.refunded && !o.cancelled)
            .map(o => Object.assign(o, { profit: o.revenue - o.cost, b2b: o.channel === "B2B" }));
    },

    // 封存結論（ArchiveSummary）：舊的已結清訂單封存後留下的每月總數，channel = "b2b" | "online"
    //   inRange(日期字串)：判斷這個月份在不在目前要看的期間內
    archived(archive, channel, inRange) {
        const s = { count: 0, revenue: 0, cost: 0, profit: 0, missing: 0, shipping: 0, last: "" };
        (archive || []).forEach(a => {
            if (a.Key !== channel || !inRange(a.Period + "-15")) return;
            const v = App.num(a.Amount);
            if (a.Label === "order") { s.count += App.num(a.Count); s.revenue += v; }
            else if (a.Label === "order_cost") s.cost += v;
            else if (a.Label === "order_shipping") s.shipping += v;
        });
        s.profit = s.revenue - s.cost;
        s.avg = s.count ? s.revenue / s.count : 0;
        return s;
    },

    // 把兩份統計加起來（目前的訂單 + 封存結論）
    merge(a, b) {
        const s = { count: a.count + b.count, revenue: a.revenue + b.revenue, cost: a.cost + b.cost, shipping: (a.shipping || 0) + (b.shipping || 0), missing: a.missing + b.missing, last: a.last > b.last ? a.last : b.last };
        s.profit = s.revenue - s.cost;
        s.avg = s.count ? s.revenue / s.count : 0;
        return s;
    },

    // { count, revenue, cost, profit, avg, missing }
    summarize(list) {
        const s = { count: 0, revenue: 0, shipping: 0, cost: 0, profit: 0, missing: 0, last: "" };
        (list || []).forEach(o => {
            s.count++;
            s.revenue += o.revenue;
            s.shipping += o.shipping;
            s.cost += o.cost;
            s.profit += o.profit;
            s.missing += o.missing;
            if (o.date > s.last) s.last = o.date;
        });
        s.avg = s.count ? s.revenue / s.count : 0;
        return s;
    }
};
