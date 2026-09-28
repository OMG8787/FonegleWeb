window.Pages = window.Pages || {};

// =========================================================
// 首頁：行事曆提醒、備忘錄、待收款提醒、本月收支
// =========================================================
Pages.Home = (() => {

    "use strict";

    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
    const REMIND_DAYS = 14;
    const dom = {};

    let memos = [];

    async function init() {

        [
            "greeting", "todayText", "reminderList", "reminderCount", "memoTitle", "memoDue", "memoPriority",
            "memoShared", "btnMemoAdd", "memoList", "memoShowDone", "financeRow", "arList", "mDetail", "plSince",
            "plIncludeBrand", "plTotal", "plTotalIncome", "plTotalExpense", "approvalBanner", "approvalCount", "approvalNames", "btnOpenCalendar"
        ].forEach(id => dom[id] = document.getElementById(id));

        if (!Auth.hasPermission(20, 10, 11)) dom.btnOpenCalendar.classList.add("d-none");

        const now = new Date();
        dom.todayText.textContent = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}（${WEEK[now.getDay()]}）`;

        dom.btnMemoAdd.addEventListener("click", addMemo);
        dom.memoTitle.addEventListener("keydown", e => { if (e.key === "Enter") addMemo(); });
        dom.memoShowDone.addEventListener("change", renderMemos);
        dom.memoList.addEventListener("click", onMemoClick);
        dom.memoList.addEventListener("change", onMemoClick);

        const finance = Auth.hasPermission(24);

        API.me({ silent: true })
            .then(me => { if (me?.user?.Name) dom.greeting.textContent = `${me.user.Name}，歡迎回來 👋`; })
            .catch(() => { });

        // 每張表各自讀取：哪一區的資料先回來就先顯示（有快取時先顯示上次的資料）
        const tables = ["Memos", "Calendar", "CalendarDays"];
        if (finance) tables.push("Receivable", "Expenses", "StallRecords", "BrandCosts");

        // 品牌損益是否含品牌攤提表（記住選擇）
        try { dom.plIncludeBrand.checked = localStorage.getItem("fonegle_pl_include_brand") !== "0"; } catch { }
        dom.plIncludeBrand.addEventListener("change", () => {
            try { localStorage.setItem("fonegle_pl_include_brand", dom.plIncludeBrand.checked ? "1" : "0"); } catch { }
            if (lastFinance) renderFinance(...lastFinance);
        });

        const data = {};
        let frame = null;

        const renderAll = () => {
            frame = null;

            if ("Memos" in data) {
                memos = data.Memos || [];
                renderMemos();
                renderApprovalBanner();
            }

            if (data.Calendar === null)
                dom.reminderList.innerHTML = `<div class="text-muted small">🔒 沒有行事曆權限</div>`;
            else if ("Calendar" in data && "CalendarDays" in data)
                renderReminders(data.Calendar || [], data.CalendarDays || []);

            if (finance && data.Receivable && "Expenses" in data && "StallRecords" in data && "BrandCosts" in data) {
                dom.financeRow.classList.remove("d-none");
                renderFinance(data.Receivable, data.Expenses || [], data.StallRecords || [], data.BrandCosts || []);
            }
        };

        try {

            const result = await API.getMany(tables, {
                onTable(name, rows) {
                    data[name] = rows;
                    if (!frame) frame = requestAnimationFrame(renderAll);
                }
            });

            // 讀取失敗（不是沒權限、也沒有快取可顯示）的區塊顯示提示
            const failed = t => result[t] === null && !(t in data);
            if (failed("Memos"))
                dom.memoList.innerHTML = `<div class="text-muted small">⚠️ 備忘錄讀取失敗，請重新整理再試一次</div>`;
            if (data.Calendar !== null && (failed("Calendar") || failed("CalendarDays")))
                dom.reminderList.innerHTML = `<div class="text-muted small">⚠️ 行事曆讀取失敗，請重新整理再試一次</div>`;

        } catch (err) {

            App.error(err, "首頁資料載入失敗");
        }
    }

    // =========================
    // 工具
    // =========================
    function ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function addDays(n) {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return ymd(d);
    }

    function label(date) {
        const d = new Date(date + "T00:00");
        return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
    }

    function money(v) {
        const n = Math.round(Number(v) || 0);
        return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
    }

    // =========================
    // 行事曆提醒
    // =========================
    function renderReminders(events, days) {

        const today = ymd(new Date());
        const until = addDays(REMIND_DAYS);
        const esc = App.esc;

        // 每一天一筆（沒有每日時段的舊活動由起訖換算）
        const items = [];

        events.filter(e => e.IsDeleted !== true).forEach(e => {

            let d = days.filter(x => x.CalendarId === e.CalendarId)
                .map(x => ({ date: App.toDateInput(x.EventDate), start: x.StartTime || "", end: x.EndTime || "", note: x.Note || "" }));

            if (!d.length) {
                const s = App.showDateTime(e.StartEventDate), t = App.showDateTime(e.EndEventDate);
                for (let dt = new Date(s.slice(0, 10) + "T00:00"); ymd(dt) <= t.slice(0, 10) && d.length < 62; dt.setDate(dt.getDate() + 1))
                    d.push({ date: ymd(dt), start: s.slice(11, 16), end: t.slice(11, 16), note: "" });
            }

            d.filter(x => x.date >= today && x.date <= until)
                .forEach(x => items.push({ ...x, name: e.EventName, address: e.EventAddress, private: !!String(e.UserDB_ID || "").trim() }));
        });

        items.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

        dom.reminderCount.textContent = items.length ? `${items.length} 天次` : "";

        dom.reminderList.innerHTML = items.map(x => `
<div class="reminder ${x.date === today ? "today" : ""}">
    <div class="d-flex justify-content-between">
        <b>${x.date === today ? "🔴 今天" : esc(label(x.date))}　${esc(x.name)}</b>
        ${x.private ? `<span class="badge bg-secondary">私人</span>` : ""}
    </div>
    <div class="small text-muted">
        🕒 ${esc(x.start && x.end ? `${x.start}–${x.end}` : "時間未定")}
        ${x.address ? `　📍 ${esc(x.address)}` : ""}
    </div>
    ${x.note ? `<div class="small">📝 ${esc(x.note)}</div>` : ""}
</div>`).join("") || `<div class="text-muted small">未來 ${REMIND_DAYS} 天沒有行程 🎉</div>`;
    }

    // =========================
    // 備忘錄
    // =========================
    function renderMemos() {

        const today = ymd(new Date());
        const me = Auth.getUserId();
        const esc = App.esc;
        const rank = { 高: 0, 中: 1, 低: 2 };

        const list = memos
            .filter(m => dom.memoShowDone.checked || m.IsDone !== true)
            .sort((a, b) =>
                (a.IsDone === true) - (b.IsDone === true) ||
                (rank[a.Priority] ?? 1) - (rank[b.Priority] ?? 1) ||
                String(a.DueDate || "9999").localeCompare(String(b.DueDate || "9999")));

        dom.memoList.innerHTML = list.map(m => {

            const due = App.toDateInput(m.DueDate);
            const notice = !!m.Audience;   // 系統通知（例如新帳號申請）
            const mine = m.CreatedBy === me || notice;
            let dueBadge = "";

            if (due && m.IsDone !== true) {
                if (due < today) dueBadge = `<span class="badge bg-danger">逾期 ${esc(label(due))}</span>`;
                else if (due === today) dueBadge = `<span class="badge bg-warning text-dark">今天到期</span>`;
                else dueBadge = `<span class="badge bg-light text-dark border">${esc(label(due))}</span>`;
            }

            return `
<div class="memo ${m.IsDone === true ? "done" : ""}">
    <input class="form-check-input mt-1" type="checkbox" data-done="${m.ID}" ${m.IsDone === true ? "checked" : ""} ${mine ? "" : "disabled"}>
    <div>
        <div class="memo-title">${m.Priority === "高" ? "❗ " : ""}${esc(m.Title || "")}</div>
        ${notice && m.Content ? `<div class="small text-muted" style="white-space:pre-line">${esc(m.Content)}</div>` : ""}
        <div class="small">${notice ? `<span class="badge bg-warning text-dark">系統通知</span>` : ""} ${dueBadge} ${m.IsShared ? `<span class="badge bg-info">${m.CreatedBy === me ? "已共享" : "同事共享"}</span>` : ""}
        ${["approveUser", "resetPassword"].includes(m.LinkType) && m.IsDone !== true ? `<a class="btn btn-sm btn-warning py-0 ms-1" href="page/access.html#pending">前往處理</a>` : ""}</div>
    </div>
    ${mine ? `<div class="memo-actions"><button class="btn btn-sm btn-link text-danger p-0" data-delete="${m.ID}">刪除</button></div>` : ""}
</div>`;
        }).join("") || `<div class="text-muted small">沒有待辦事項</div>`;
    }

    // 新帳號待審核提醒（只有系統管理員會收到這類通知）
    function renderApprovalBanner() {

        const pending = memos.filter(m => ["approveUser", "resetPassword"].includes(m.LinkType) && m.IsDone !== true);

        dom.approvalBanner.classList.toggle("d-none", !pending.length);
        dom.approvalCount.textContent = pending.length;
        dom.approvalNames.textContent = pending.map(m =>
            (m.LinkType === "resetPassword" ? "🔑 重設密碼 " : "🆕 新帳號 ") +
            String(m.Title || "").replace(/^.*：/, "")).join("、");
    }

    async function addMemo() {

        const title = dom.memoTitle.value.trim();

        if (!title) return;

        dom.btnMemoAdd.disabled = true;

        try {

            const memo = await API.insert("Memos", {
                Title: title,
                DueDate: dom.memoDue.value,
                Priority: dom.memoPriority.value,
                IsShared: dom.memoShared.checked,
                IsDone: false
            });

            memos.push(memo);
            dom.memoTitle.value = "";
            dom.memoDue.value = "";
            renderMemos();

        } catch (err) {

            App.error(err, "新增失敗");

        } finally {

            dom.btnMemoAdd.disabled = false;
        }
    }

    async function onMemoClick(e) {

        const done = e.target.closest("[data-done]");
        const del = e.target.closest("[data-delete]");

        try {

            if (done && e.type === "change") {
                const id = Number(done.dataset.done);
                const m = memos.find(x => x.ID === id);
                await API.update("Memos", id, { IsDone: done.checked });
                m.IsDone = done.checked;
                renderMemos();
                renderApprovalBanner();
            }

            if (del && e.type === "click") {
                const id = Number(del.dataset.delete);
                if (!confirm("刪除這則備忘？")) return;
                await API.remove("Memos", id);
                memos = memos.filter(x => x.ID !== id);
                renderMemos();
                renderApprovalBanner();
            }

        } catch (err) {

            App.error(err, "操作失敗");
        }
    }

    // =========================
    // 財務
    // =========================
    let lastFinance = null;

    function renderFinance(receivables, expenses, stalls, brand = []) {

        lastFinance = [receivables, expenses, stalls, brand];

        const today = ymd(new Date());
        const soon = addDays(7);
        const month = today.slice(0, 7);
        const esc = App.esc;
        const unpaid = r => App.num(r.Amount) - App.num(r.PaidAmount);

        // 待收款：逾期或 7 天內到期
        const list = receivables
            .filter(r => unpaid(r) > 0 && App.toDateInput(r.DueDate) && App.toDateInput(r.DueDate) <= soon)
            .sort((a, b) => App.toDateInput(a.DueDate).localeCompare(App.toDateInput(b.DueDate)));

        const totalUnpaid = receivables.reduce((s, r) => s + Math.max(0, unpaid(r)), 0);

        dom.arList.innerHTML = `<div class="small text-muted mb-2">全部未收 <b>${money(totalUnpaid)}</b></div>` + (list.map(r => {
            const due = App.toDateInput(r.DueDate);
            return `
<div class="d-flex justify-content-between small py-1 border-bottom">
    <span>${due < today ? `<span class="badge bg-danger">逾期</span>` : `<span class="badge bg-warning text-dark">即將到期</span>`}
        ${esc(r.PayerName || "")}｜${esc(r.Item || "")}</span>
    <span><b>${money(unpaid(r))}</b>　${esc(label(due))}</span>
</div>`;
        }).join("") || `<div class="text-muted small">沒有逾期或 7 天內到期的帳款 👍</div>`) +
            `<a href="page/receivable.html" class="btn btn-sm btn-link px-0 mt-2">前往帳務管理 →</a>`;

        // 品牌損益：營收 = 收款（依付款日）+ 出攤營業額 + 品牌攤提表回收
        //           支出 = 支出表 + 出攤費用 + 品牌攤提表投入（全額計入投入當時）
        //   品牌攤提表與支出表同一天、同金額的視為同一筆，只算一次
        const q = Math.floor((Number(month.slice(5, 7)) - 1) / 3);
        const year = month.slice(0, 4);
        const periods = {
            m: d => d.startsWith(month),
            q: d => d.startsWith(year) && Math.floor((Number(d.slice(5, 7)) - 1) / 3) === q,
            y: d => d.startsWith(year),
            a: () => true
        };

        const sum = (rows, dateKey, fn, inRange) => rows.reduce((t, r) => {
            const d = App.toDateInput(r[dateKey]) || "";
            return inRange(d) ? t + fn(r) : t;
        }, 0);

        const useBrand = dom.plIncludeBrand.checked;
        const expKey = new Set(expenses.map(r => (App.toDateInput(r.ExpenseDate) || "") + "|" + Math.round(App.num(r.Amount))));
        const brandOut = useBrand ? brand.filter(e => e.Type !== "回收") : [];
        const brandIn = useBrand ? brand.filter(e => e.Type === "回收") : [];
        const brandOutOnly = brandOut.filter(e => !expKey.has((App.toDateInput(e.RecordDate) || "") + "|" + Math.round(App.num(e.Amount))));
        const dupCount = brandOut.length - brandOutOnly.length;

        const calc = inRange => {
            // 已收款但沒填付款日的帳款：只算進「成立至今」
            const arIncome = sum(receivables, "PaymentDate", r => App.num(r.PaidAmount), d => d ? inRange(d) : inRange === periods.a);
            const stallIncome = sum(stalls, "StallDate", r => App.num(r.Revenue), inRange);
            // 出攤費用不含「食材成本估算」，實際食材採購記在支出表，避免重複計算
            const stallCost = sum(stalls, "StallDate", r => App.num(r.TotalCost) - App.num(r.FoodCost), inRange);
            const expense = sum(expenses, "ExpenseDate", r => App.num(r.Amount), inRange);
            const brandCost = sum(brandOutOnly, "RecordDate", r => App.num(r.Amount), inRange);
            const brandIncome = sum(brandIn, "RecordDate", r => App.num(r.Amount), inRange);
            return {
                arIncome, stallIncome, stallCost, expense, brandCost, brandIncome,
                income: arIncome + stallIncome + brandIncome,
                out: expense + stallCost + brandCost
            };
        };

        let all = null;
        Object.keys(periods).forEach(k => {
            const c = calc(periods[k]);
            if (k === "a") all = c;
            const net = c.income - c.out;
            document.getElementById(k + "Income").textContent = money(c.income);
            document.getElementById(k + "Expense").textContent = money(c.out);
            const el = document.getElementById(k + "Net");
            el.textContent = money(net);
            el.className = (k === "a" ? "pl-all " : "") + (net >= 0 ? "text-success" : "text-danger");
        });

        // 品牌總損益（成立至今）
        const total = all.income - all.out;
        dom.plTotal.textContent = money(total);
        dom.plTotal.className = "pl-big " + (total >= 0 ? "text-success" : "text-danger");
        dom.plTotalIncome.textContent = money(all.income);
        dom.plTotalExpense.textContent = money(all.out);

        // 成立日：最早一筆收入 / 支出 / 出攤 / 品牌投入
        const first = [
            ...receivables.filter(r => App.num(r.PaidAmount)).map(r => App.toDateInput(r.PaymentDate)),
            ...stalls.map(r => App.toDateInput(r.StallDate)),
            ...expenses.map(r => App.toDateInput(r.ExpenseDate)),
            ...brandOut.concat(brandIn).map(r => App.toDateInput(r.RecordDate))
        ].filter(Boolean).sort()[0];
        dom.plSince.textContent = first ? `成立至今，自 ${first.replace(/-/g, "/")}` : "成立至今";

        dom.mDetail.innerHTML = `營收 = 帳款收款（依付款日）＋ 出攤營業額${useBrand ? " ＋ 品牌攤提表「回收」" : ""}<br>
            支出 = 支出表 ＋ 出攤費用（攤位、車資、人手、手續費等，不含食材估算）${useBrand ? " ＋ 品牌攤提表「支出」（全額計入投入當時）" : ""}<br>
            <b>成立至今明細</b>：帳款收款 ${money(all.arIncome)}、出攤營業額 ${money(all.stallIncome)}${useBrand ? `、攤提表回收 ${money(all.brandIncome)}` : ""}；
            支出表 ${money(all.expense)}、出攤費用 ${money(all.stallCost)}${useBrand ? `、攤提表投入 ${money(all.brandCost)}` : ""}<br>
            ${useBrand && dupCount ? `※ 品牌攤提表有 ${dupCount} 筆與支出表同日同金額，視為同一筆只算一次<br>` : ""}
            ${useBrand ? "" : "※ 目前未計入品牌攤提表（右上角可切換）"}`;
    }

    return {
        init
    };

})();
