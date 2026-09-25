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
            "memoShared", "btnMemoAdd", "memoList", "memoShowDone", "financeRow", "arList", "mIncome",
            "mExpense", "mNet", "mDetail"
        ].forEach(id => dom[id] = document.getElementById(id));

        const now = new Date();
        dom.todayText.textContent = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}（${WEEK[now.getDay()]}）`;

        dom.btnMemoAdd.addEventListener("click", addMemo);
        dom.memoTitle.addEventListener("keydown", e => { if (e.key === "Enter") addMemo(); });
        dom.memoShowDone.addEventListener("change", renderMemos);
        dom.memoList.addEventListener("click", onMemoClick);
        dom.memoList.addEventListener("change", onMemoClick);

        const finance = Auth.hasPermission(24);

        try {

            const tables = ["Calendar", "CalendarDays", "Memos"];
            if (finance) tables.push("Receivable", "Expenses", "StallRecords");

            const [data, me] = await Promise.all([API.getMany(tables), API.me().catch(() => null)]);

            if (me?.user?.Name) dom.greeting.textContent = `${me.user.Name}，歡迎回來 👋`;

            renderReminders(data.Calendar || [], data.CalendarDays || []);

            memos = data.Memos || [];
            renderMemos();

            if (finance && data.Receivable) {
                dom.financeRow.classList.remove("d-none");
                renderFinance(data.Receivable, data.Expenses || [], data.StallRecords || []);
            }

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
            const mine = m.CreatedBy === me;
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
        <div class="small">${dueBadge} ${m.IsShared ? `<span class="badge bg-info">${mine ? "已共享" : "同事共享"}</span>` : ""}</div>
    </div>
    ${mine ? `<div class="memo-actions"><button class="btn btn-sm btn-link text-danger p-0" data-delete="${m.ID}">刪除</button></div>` : ""}
</div>`;
        }).join("") || `<div class="text-muted small">沒有待辦事項</div>`;
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
            }

            if (del && e.type === "click") {
                const id = Number(del.dataset.delete);
                if (!confirm("刪除這則備忘？")) return;
                await API.remove("Memos", id);
                memos = memos.filter(x => x.ID !== id);
                renderMemos();
            }

        } catch (err) {

            App.error(err, "操作失敗");
        }
    }

    // =========================
    // 財務
    // =========================
    function renderFinance(receivables, expenses, stalls) {

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

        // 本月收支：收款（依付款日）+ 出攤營業額 − 支出
        const inMonth = v => App.toDateInput(v).startsWith(month);
        const arIncome = receivables.filter(r => inMonth(r.PaymentDate)).reduce((s, r) => s + App.num(r.PaidAmount), 0);
        const stallIncome = stalls.filter(r => inMonth(r.StallDate)).reduce((s, r) => s + App.num(r.Revenue), 0);
        // 出攤費用不含「食材成本估算」，實際食材採購請記在支出表，避免重複計算
        const stallCost = stalls.filter(r => inMonth(r.StallDate)).reduce((s, r) => s + App.num(r.TotalCost) - App.num(r.FoodCost), 0);
        const expense = expenses.filter(r => inMonth(r.ExpenseDate)).reduce((s, r) => s + App.num(r.Amount), 0);
        const income = arIncome + stallIncome;
        const out = expense + stallCost;

        dom.mIncome.textContent = money(income);
        dom.mExpense.textContent = money(out);
        dom.mNet.textContent = money(income - out);
        dom.mNet.className = "money " + (income - out >= 0 ? "text-success" : "text-danger");
        dom.mDetail.innerHTML = `收入 = 帳款收款 ${money(arIncome)} ＋ 出攤營業額 ${money(stallIncome)}<br>
            支出 = 支出表 ${money(expense)} ＋ 出攤費用 ${money(stallCost)}（攤位、車資、人手、手續費等，不含食材估算）`;
    }

    return {
        init
    };

})();
