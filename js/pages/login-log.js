window.Pages = window.Pages || {};

// =========================================================
// 登入紀錄（Sessions 目前登入中 + LoginLog 登入歷程）
// =========================================================
Pages.LoginLog = (() => {

    "use strict";

    const dom = {};

    let logs = [];

    // =========================
    // 初始化
    // =========================
    async function init() {

        ["onlineBody", "onlineCount", "btnRefresh", "qFrom", "qTo", "qKeyword", "qResult",
            "btnSearch", "btnThisMonth", "btnToday", "userBody", "logBody", "logCount"]
            .forEach(id => dom[id] = document.getElementById(id));

        dom.btnRefresh.addEventListener("click", loadOnline);
        dom.btnSearch.addEventListener("click", loadLogs);
        dom.btnThisMonth.addEventListener("click", () => { setRange("month"); loadLogs(); });
        dom.btnToday.addEventListener("click", () => { setRange("today"); loadLogs(); });
        dom.qKeyword.addEventListener("input", render);
        dom.qResult.addEventListener("change", render);

        dom.onlineBody.addEventListener("click", async e => {
            const btn = e.target.closest("[data-kick]");
            if (!btn) return;
            if (!confirm(`確定要讓「${btn.dataset.name}」的這個裝置立即登出？`)) return;

            try {
                btn.disabled = true;
                await Auth.request("kickSession", { sessionId: btn.dataset.kick });
                await Promise.all([loadOnline(), loadLogs()]);
            } catch (ex) {
                App.error(ex);
                btn.disabled = false;
            }
        });

        setRange("month");

        await Promise.all([loadOnline(), loadLogs()]);
    }

    // =========================
    // 日期
    // =========================
    function ymd(d) {
        const pad = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function setRange(type) {
        const now = new Date();
        dom.qTo.value = ymd(now);
        dom.qFrom.value = type === "today" ? ymd(now) : ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    }

    function short(text) {
        return String(text || "").slice(0, 16);
    }

    function minutesText(m) {
        m = Number(m) || 0;
        if (m < 60) return `${m} 分`;
        return `${Math.floor(m / 60)} 小時 ${m % 60} 分`;
    }

    function remainText(ms) {
        const m = Math.max(0, Math.round((ms - Date.now()) / 60000));
        return `剩 ${minutesText(m)}`;
    }

    // =========================
    // 目前登入中
    // =========================
    async function loadOnline() {

        dom.onlineBody.innerHTML = `<tr><td colspan="6" class="text-muted">載入中…</td></tr>`;

        try {
            const list = await Auth.request("loginSessions");

            dom.onlineCount.textContent = list.length;

            dom.onlineBody.innerHTML = list.length
                ? list.map(s => `
                    <tr>
                        <td>${App.esc(s.UserName)} ${s.IsMe ? `<span class="badge bg-secondary">目前裝置</span>` : ""}</td>
                        <td class="device small">${App.esc(s.Device || "（舊版登入，未記錄）")}</td>
                        <td>${App.esc(short(s.LoginAt))}</td>
                        <td>${App.esc(short(s.LastActiveAt))}</td>
                        <td><span class="small text-muted">${remainText(s.ExpireAt)}</span></td>
                        <td class="text-end">${s.IsMe || !s.SessionId ? "" :
                        `<button class="btn btn-sm btn-outline-danger" data-kick="${App.esc(s.SessionId)}" data-name="${App.esc(s.UserName)}">強制登出</button>`}</td>
                    </tr>`).join("")
                : `<tr><td colspan="6" class="text-muted">目前沒有人登入</td></tr>`;

        } catch (ex) {
            dom.onlineBody.innerHTML = `<tr><td colspan="6" class="text-danger">${App.esc(ex.message)}</td></tr>`;
        }
    }

    // =========================
    // 登入歷程
    // =========================
    async function loadLogs() {

        dom.logBody.innerHTML = `<tr><td colspan="9" class="text-muted">載入中…</td></tr>`;

        try {
            logs = await Auth.request("loginLog", { from: dom.qFrom.value, to: dom.qTo.value });
            render();
        } catch (ex) {
            dom.logBody.innerHTML = `<tr><td colspan="9" class="text-danger">${App.esc(ex.message)}</td></tr>`;
        }
    }

    function isOk(o) {
        return o.Result === "成功";
    }

    // 未結束的登入以「最後活動 - 登入時間」估算
    function usedMinutes(o) {
        if (o.UsedMinutes !== null && o.UsedMinutes !== undefined && o.UsedMinutes !== "") return Number(o.UsedMinutes);
        if (!isOk(o)) return 0;
        const a = Date.parse(String(o.LoginAt).replace(" ", "T"));
        const b = Date.parse(String(o.LastActiveAt || o.LoginAt).replace(" ", "T"));
        return isNaN(a) || isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 60000));
    }

    function filtered() {
        const kw = dom.qKeyword.value.trim();
        const r = dom.qResult.value;

        return logs.filter(o =>
            (!kw || [o.UserName, o.Account, o.Device].some(v => App.like(v, kw))) &&
            (!r || (r === "success") === isOk(o)));
    }

    function render() {

        const list = filtered();

        dom.logCount.textContent = `共 ${list.length} 筆`;

        dom.logBody.innerHTML = list.length
            ? list.map(o => {
                const ok = isOk(o);
                const active = ok && !o.EndAt;
                return `
                <tr>
                    <td>${App.esc(short(o.LoginAt))}</td>
                    <td>${App.esc(o.UserName)}</td>
                    <td>${App.esc(o.Account)}</td>
                    <td>${ok ? `<span class="badge bg-success">成功</span>` : `<span class="badge bg-danger">${App.esc(o.Result)}</span>`}</td>
                    <td class="device small">${App.esc(o.Device)}</td>
                    <td>${App.esc(short(o.LastActiveAt))}</td>
                    <td>${active ? `<span class="badge bg-info text-dark">使用中</span>` : App.esc(short(o.EndAt))}</td>
                    <td>${App.esc(o.EndReason)}</td>
                    <td class="text-end">${ok ? minutesText(usedMinutes(o)) : ""}</td>
                </tr>`;
            }).join("")
            : `<tr><td colspan="9" class="text-muted">查無紀錄</td></tr>`;

        renderUsers(list);
    }

    // =========================
    // 各帳號彙總
    // =========================
    function renderUsers(list) {

        const map = new Map();

        list.forEach(o => {
            const key = o.LineUserId || "acc:" + o.Account;
            const u = map.get(key) || { name: o.UserName, account: o.Account, count: 0, fail: 0, minutes: 0, last: "", device: "" };

            if (isOk(o)) {
                u.count++;
                u.minutes += usedMinutes(o);
                if (String(o.LoginAt) > u.last) {
                    u.last = String(o.LoginAt);
                    u.device = o.Device;
                }
            } else {
                u.fail++;
            }

            if (!u.name && o.UserName) u.name = o.UserName;
            map.set(key, u);
        });

        const rows = [...map.values()].sort((a, b) => b.minutes - a.minutes);

        dom.userBody.innerHTML = rows.length
            ? rows.map(u => `
                <tr>
                    <td>${App.esc(u.name || "（未知帳號）")}</td>
                    <td>${App.esc(u.account)}</td>
                    <td class="text-end">${u.count}</td>
                    <td class="text-end ${u.fail ? "text-danger fw-bold" : ""}">${u.fail}</td>
                    <td class="text-end">${minutesText(u.minutes)}</td>
                    <td>${App.esc(short(u.last))}</td>
                    <td class="device small">${App.esc(u.device)}</td>
                </tr>`).join("")
            : `<tr><td colspan="7" class="text-muted">查無紀錄</td></tr>`;
    }

    return { init };
})();
