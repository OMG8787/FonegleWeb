// =========================================================
// 帳務提醒（首頁、提醒中心共用）：開發票、收帳、保證金
//
// 每家客戶的規則（客戶 / 合作廠商頁設定）：
//   InvoiceCycle  開發票方式：每筆（帳單日就開）/ 月結（每月開票日開）/ 不開
//   InvoiceDay    月結開票日（1 ~ 31，31 = 月底）
//   PayDay        每月固定匯款日（有設定時優先）
//   PayTermDays   開票後幾天付款（沒設定 = 30 天）
//
// 提醒規則：
//   開發票：發票狀態「待開」的帳款（由訂單自動建立的都是待開，付過款也要開）；
//           沒有發票狀態的舊帳款：還沒收款、還沒開發票才提醒；已開 / 免開 / 有發票號碼或開立日 → 不提醒
//   收帳  ：還沒收齊的帳款；應收日 = 帳款到期日 → 依客戶規則計算
//   保證金：還沒退還的保證金；應退日 = 預計退還日 → 活動日隔天；活動取消 = 當天
//           活動還沒結束的不提醒（提醒中心選「全部」才看得到）
// =========================================================
window.Billing = {

    DEFAULT_PAY_DAYS: 30,
    DEPOSIT_RETURN_DAYS: 1,     // 沒有預計退還日：活動日隔天就提醒追退費

    pad(n) {
        return String(n).padStart(2, "0");
    },

    ymd(d) {
        return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    today() {
        return this.ymd(new Date());
    },

    addDays(date, n) {
        const d = new Date(date + "T00:00");
        d.setDate(d.getDate() + Number(n || 0));
        return this.ymd(d);
    },

    // 兩個日期相差幾天（b - a）
    diff(a, b) {
        return Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000);
    },

    lastDay(y, m) {
        return new Date(y, m, 0).getDate();
    },

    // 某年月的第 day 號（超過當月天數 = 月底）
    dayOf(y, m, day) {
        return `${y}-${this.pad(m)}-${this.pad(Math.min(day, this.lastDay(y, m)))}`;
    },

    // date 當天或之後，第一個「每月 day 號」
    nextDay(date, day) {
        let [y, m] = date.split("-").map(Number);
        let d = this.dayOf(y, m, day);
        if (d < date) {
            m++;
            if (m > 12) { m = 1; y++; }
            d = this.dayOf(y, m, day);
        }
        return d;
    },

    date(v) {
        return App.toDateInput(v) || "";
    },

    cycleOf(c) {
        return (c && c.InvoiceCycle) || "每筆";
    },

    // 應開發票日（不開發票 → null）
    invoiceDue(c, billDate) {
        if (!billDate) return null;
        const cycle = this.cycleOf(c);
        if (cycle === "不開") return null;
        if (cycle === "月結") return this.nextDay(billDate, App.num(c.InvoiceDay) || 31);
        return billDate;
    },

    // 應收款日
    payDue(c, r) {
        const due = this.date(r.DueDate);
        if (due) return due;
        const bill = this.date(r.BillDate) || this.today();
        const base = this.date(r.InvoiceDate) || this.invoiceDue(c, bill) || bill;
        if (c && App.num(c.PayDay) > 0) return this.nextDay(base, App.num(c.PayDay));
        const days = c && c.PayTermDays !== null && c.PayTermDays !== undefined && c.PayTermDays !== ""
            ? App.num(c.PayTermDays) : this.DEFAULT_PAY_DAYS;
        return this.addDays(base, days);
    },

    needsInvoice(r, c) {
        if (App.num(r.Amount) <= 0) return false;
        if (String(r.InvoiceNo || "").trim() || this.date(r.InvoiceDate)) return false;
        if (r.InvoiceStatus === "已開" || r.InvoiceStatus === "免開") return false;
        if (this.cycleOf(c) === "不開") return false;
        if (r.InvoiceStatus === "待開") return true;
        return this.unpaid(r) > 0;
    },

    unpaid(r) {
        return Math.max(0, App.num(r.Amount) - App.num(r.PaidAmount));
    },

    // 提醒狀態：逾期 / 今天 / N 天後
    level(date, today) {
        const d = this.diff(today, date);
        return { days: d, level: d < 0 ? "overdue" : d === 0 ? "today" : "soon" };
    },

    whenText(item) {
        return item.level === "overdue" ? `逾期 ${-item.days} 天` : item.level === "today" ? "今天" : `${item.days} 天後`;
    },

    // 全部提醒（依日期排序）；horizon：只列出幾天內到期的（null = 全部）
    build({ receivables = [], companies = [], deposits = [], today = this.today(), horizon = null } = {}) {

        const byId = new Map(companies.map(c => [String(c.ID), c]));
        const companyOf = r => byId.get(String(r.CompanyId)) || null;
        const within = date => horizon === null || this.diff(today, date) <= horizon;
        const out = { invoice: [], collect: [], deposit: [] };

        // 開發票：同一家、同一個應開立日合併
        const groups = new Map();
        receivables.forEach(r => {
            const c = companyOf(r);
            if (!this.needsInvoice(r, c)) return;
            const due = this.invoiceDue(c, this.date(r.BillDate));
            if (!due) return;
            const key = (r.CompanyId || "n:" + (r.PayerName || "")) + "|" + due;
            const g = groups.get(key) || { kind: "invoice", date: due, name: r.PayerName || (c && c.CompanyName) || "（未指定）", company: c, items: [], amount: 0 };
            g.items.push(r);
            g.amount += App.num(r.Amount);
            groups.set(key, g);
        });
        groups.forEach(g => {
            if (!within(g.date)) return;
            Object.assign(g, this.level(g.date, today));
            g.title = `開發票：${g.name}`;
            g.sub = `${this.cycleOf(g.company)}${this.cycleOf(g.company) === "月結" ? `（每月 ${App.num(g.company.InvoiceDay) >= 31 || !App.num(g.company.InvoiceDay) ? "月底" : App.num(g.company.InvoiceDay) + " 號"}）` : ""}・${g.items.length} 筆`;
            out.invoice.push(g);
        });

        // 收帳
        receivables.forEach(r => {
            const left = this.unpaid(r);
            if (left <= 0) return;
            const c = companyOf(r);
            const due = this.payDue(c, r);
            if (!within(due)) return;
            out.collect.push(Object.assign({
                kind: "collect", date: due, name: r.PayerName || (c && c.CompanyName) || "（未指定）", company: c, items: [r], amount: left,
                title: `收帳：${r.PayerName || (c && c.CompanyName) || ""}`,
                sub: `${r.Item || ""}${this.date(r.DueDate) ? "" : `・${c && App.num(c.PayDay) ? `每月 ${App.num(c.PayDay)} 號匯款` : `開票後 ${c && c.PayTermDays !== null && c.PayTermDays !== undefined && c.PayTermDays !== "" ? App.num(c.PayTermDays) : this.DEFAULT_PAY_DAYS} 天`}`}`
            }, this.level(due, today)));
        });

        // 保證金
        deposits.forEach(d => {
            if (App.num(d.Amount) <= 0 || d.Status === "已退還" || this.date(d.ReturnedDate)) return;
            const base = this.date(d.EventDate) || this.date(d.PaidDate) || today;
            const due = this.date(d.ExpectReturnDate) || this.addDays(base, this.DEPOSIT_RETURN_DAYS);
            if (!within(due)) return;
            if (horizon !== null && due > today) return;      // 活動還沒結束：先不提醒
            const cancelled = /活動取消|活動已刪除/.test(d.Note || "");
            out.deposit.push(Object.assign({
                kind: "deposit", date: due, name: d.Payee || d.EventName || "", items: [d], amount: App.num(d.Amount),
                title: `保證金：${d.Payee || d.EventName || ""}`,
                sub: `${d.EventName || ""}${base ? `（${base}）` : ""}・${cancelled ? "活動已取消，" : "活動已結束，"}請追蹤退費`
            }, this.level(due, today)));
        });

        Object.values(out).forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
        out.all = [...out.invoice, ...out.collect, ...out.deposit].sort((a, b) => a.date.localeCompare(b.date));
        return out;
    },

    ICONS: { invoice: "🧾", collect: "💰", deposit: "🔖" }
};
