// =========================================================
// 訂單統計（首頁品牌損益、品牌攤提表、客戶頁共用）
// - 訂單資料一列一個品項，同一個 OrderNo 合併成一張訂單
// - 營收 = 訂單總額（TotalAmount，已扣折扣）− 運費：運費是支出，不算收益（但仍計入客戶的應收帳款）
// - 成本 = Σ 數量 × 產品成本價（Products.CostPrice）；產品沒有成本價的品項以 0 計，並記在 missing
// - 退款的訂單不計
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
                    refunded: false
                };
                map.set(r.OrderNo, o);
            }

            if (r.PaymentStatus === "退款") o.refunded = true;

            const pid = String(r.ProductID ?? "");
            if (costOf.has(pid)) o.cost += App.num(r.Qty) * costOf.get(pid);
            else o.missing++;
        });

        return [...map.values()]
            .filter(o => !o.refunded)
            .map(o => Object.assign(o, { profit: o.revenue - o.cost, b2b: o.channel === "B2B" }));
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
