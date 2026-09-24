window.Pages = window.Pages || {};

// =========================================================
// 行事曆
// - Calendar 工作表：活動（名稱、地址、類型、備註、起訖）
// - CalendarDays 工作表：活動每一天的開始 / 結束時間與當日備註
// =========================================================
Pages.Calendar = (() => {

    "use strict";

    const dom = {};
    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
    const COLORS = ["#5B8FF9", "#61DDAA", "#65789B", "#F6BD16", "#7262FD", "#78D3F8", "#9661BC", "#F6903D", "#008685", "#F08BB4"];
    const MAX_DAYS = 62;

    let calendarModal = null;
    let currentDate = new Date();

    let dataPromise = null;     // { events: [...] }
    let publicEvents = [];
    let privateEvents = [];
    let allEvents = [];
    let overviewEvents = [];
    let privateSearchId = null;
    let lastOverviewRaw = "";

    let editingId = null;
    let dayRows = [];           // 視窗中的每日時段 [{ date, start, end, note }]

    const dayEventsCache = {};
    const eventColorMap = {};

    // =========================
    // 初始化
    // =========================
    function init() {

        cacheDom();

        calendarModal = bootstrap.Modal.getOrCreateInstance(dom.calendarModal);

        bind();

        const today = new Date();
        const sixMonths = new Date();
        sixMonths.setMonth(sixMonths.getMonth() + 6);

        dom.overviewStart.value = ymd(today);
        dom.overviewEnd.value = ymd(sixMonths);

        loadCalendar();
        loadOverview();
    }

    function cacheDom() {

        [
            "calendarResult", "btnCreate", "btnSave", "activityName", "startDate", "endDate",
            "defaultOpen", "defaultClose", "btnApplyTime", "dailyList", "address", "type", "cancel",
            "userId", "remark", "monthPicker", "btnSearchMonth", "calendarTitle", "btnPrevMonth",
            "btnNextMonth", "overviewStart", "overviewEnd", "btnOverview", "overviewResult",
            "btnPrivateCalendar", "calendarFilter", "btnShowRaw", "overviewRawText", "btnCopyRaw",
            "calendarModal", "modalTitle", "eventListContent"
        ].forEach(id => dom[id] = document.getElementById(id));
    }

    function bind() {

        dom.btnCopyRaw.addEventListener("click", copyRawText);
        dom.btnSave.addEventListener("click", saveCalendar);
        dom.btnCreate.addEventListener("click", openCreateModal);
        dom.btnOverview.addEventListener("click", loadOverview);
        dom.btnPrivateCalendar.addEventListener("click", searchPrivateCalendar);
        dom.calendarFilter.addEventListener("change", applyFilter);
        dom.type.addEventListener("change", handleTypeChange);
        dom.btnShowRaw.addEventListener("click", showRawText);
        dom.overviewResult.addEventListener("click", handleEditClick);

        dom.btnPrevMonth.addEventListener("click", () => changeMonth(-1));
        dom.btnNextMonth.addEventListener("click", () => changeMonth(1));

        dom.btnSearchMonth.addEventListener("click", () => {
            if (!dom.monthPicker.value) return;
            currentDate = new Date(dom.monthPicker.value + "-01T00:00");
            clearPrivate();
            loadCalendar();
        });

        // 日期變更 → 重建每日時段
        dom.startDate.addEventListener("change", onDateRangeChange);
        dom.endDate.addEventListener("change", onDateRangeChange);
        dom.btnApplyTime.addEventListener("click", applyDefaultTime);

        dom.dailyList.addEventListener("input", e => {
            const i = Number(e.target.dataset.index);
            const field = e.target.dataset.field;
            if (!isNaN(i) && field) dayRows[i][field] = e.target.value;
        });

        dom.calendarModal.addEventListener("hidden.bs.modal", () => {
            editingId = null;
            document.activeElement?.blur();
            clearForm();
        });
    }

    // =========================
    // 工具
    // =========================
    function ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function parseYmd(s) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function dateRange(start, end) {

        const out = [];
        const d = parseYmd(start);
        const last = parseYmd(end);

        while (d <= last && out.length <= MAX_DAYS) {
            out.push(ymd(d));
            d.setDate(d.getDate() + 1);
        }

        return out;
    }

    function dayLabel(date) {
        const d = parseYmd(date);
        return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
    }

    function timeText(day) {
        if (!day.start && !day.end) return "";
        return `${day.start || "?"}–${day.end || "?"}`;
    }

    function getEventColor(name) {
        if (!eventColorMap[name])
            eventColorMap[name] = COLORS[Object.keys(eventColorMap).length % COLORS.length];
        return eventColorMap[name];
    }

    function changeMonth(step) {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + step, 1);
        clearPrivate();
        loadCalendar();
    }

    function clearPrivate() {
        privateEvents = [];
        privateSearchId = null;
    }

    // =========================
    // 資料
    // =========================
    function fetchData(force = false) {

        if (!dataPromise || force) {

            dataPromise = API.getMany(["Calendar", "CalendarDays"])
                .then(({ Calendar: rows, CalendarDays: days }) => {

                    const byEvent = {};

                    days.forEach(d => {
                        (byEvent[d.CalendarId] = byEvent[d.CalendarId] || []).push({
                            id: d.DayId,
                            date: App.toDateInput(d.EventDate),
                            start: String(d.StartTime || "").slice(0, 5),
                            end: String(d.EndTime || "").slice(0, 5),
                            note: d.Note || ""
                        });
                    });

                    return { events: rows.map(r => mapEvent(r, byEvent[r.CalendarId])) };
                })
                .catch(err => {
                    dataPromise = null;
                    throw err;
                });
        }

        return dataPromise;
    }

    function mapEvent(r, days) {

        const start = App.showDateTime(r.StartEventDate);
        const end = App.showDateTime(r.EndEventDate);

        // 舊資料沒有每日時段 → 由起訖時間換算
        if (!days || !days.length) {
            days = start && end
                ? dateRange(start.slice(0, 10), end.slice(0, 10)).map(date => ({
                    date,
                    start: start.slice(11, 16),
                    end: end.slice(11, 16),
                    note: ""
                }))
                : [];
        }

        days.sort((a, b) => a.date.localeCompare(b.date));

        return {
            id: r.CalendarId,
            name: r.EventName || "",
            startDate: days[0]?.date || start.slice(0, 10),
            endDate: days[days.length - 1]?.date || end.slice(0, 10),
            days,
            address: r.EventAddress || "",
            remark: r.Note || "",
            type: String(r.CalendarType || 1),
            cancel: r.IsDeleted === true ? "是" : "否",
            userId: String(r.UserDB_ID || "").trim(),
            cancelled: r.IsDeleted === true
        };
    }

    function isPublic(e) {
        return !e.userId && !e.cancelled;
    }

    function overlaps(e, start, end) {
        return e.startDate <= end && e.endDate >= start;
    }

    function byStart(a, b) {
        return (a.startDate + (a.days[0]?.start || "")).localeCompare(b.startDate + (b.days[0]?.start || ""));
    }

    function monthRange() {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
    }

    // =========================
    // 月曆
    // =========================
    async function loadCalendar(force = false) {

        try {

            dom.calendarTitle.innerText = `${currentDate.getFullYear()} 年 ${currentDate.getMonth() + 1} 月`;
            dom.monthPicker.value = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

            const { start, end } = monthRange();
            const { events } = await fetchData(force);

            publicEvents = events.filter(isPublic).filter(e => overlaps(e, start, end)).sort(byStart);

            applyFilter();

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    async function searchPrivateCalendar() {

        const id = prompt("請輸入ID");

        if (!id) return;

        privateSearchId = id.trim();

        try {

            const { start, end } = monthRange();
            const { events } = await fetchData();

            privateEvents = events
                .filter(e => e.userId === privateSearchId && !e.cancelled)
                .filter(e => overlaps(e, start, end))
                .sort(byStart);

            if (!privateEvents.length)
                alert("📅 此月份尚無私人活動");

            applyFilter();

        } catch (err) {

            App.error(err, "私人行程查詢失敗");
        }
    }

    function applyFilter() {

        switch (dom.calendarFilter.value) {
            case "public": allEvents = publicEvents; break;
            case "private": allEvents = privateEvents; break;
            default: allEvents = [...publicEvents, ...privateEvents];
        }

        renderMonth(allEvents);
    }

    function renderMonth(events) {

        const esc = App.esc;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const startWeek = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        let html = `<table class="table table-bordered calendar-table"><thead><tr>${WEEK.map(w => `<th>${w}</th>`).join("")}</tr></thead><tbody>`;
        let day = 1;

        for (let row = 0; row < 6 && day <= totalDays; row++) {

            html += "<tr>";

            for (let col = 0; col < 7; col++) {

                if ((row === 0 && col < startWeek) || day > totalDays) {
                    html += "<td></td>";
                    continue;
                }

                const date = ymd(new Date(year, month, day));

                const dayEvents = events
                    .map(e => ({ e, d: e.days.find(x => x.date === date) }))
                    .filter(x => x.d)
                    .sort((a, b) => (a.d.start || "").localeCompare(b.d.start || ""));

                html += `<td class="calendar-day"><div class="day-number">${day}</div><div class="event-container">`;

                dayEvents.slice(0, 5).forEach(({ e, d }) => {
                    html += `
<div class="event-item" style="background:${getEventColor(e.name)}"
title="活動:${esc(e.name)}
時間:${esc(timeText(d) || "-")}
地址:${esc(e.address || "-")}
當日備註:${esc(d.note || "-")}
活動備註:${esc(e.remark || "-")}">
<span class="event-time">${esc(d.start || "")}</span>${esc(e.name)}
</div>`;
                });

                if (dayEvents.length > 5) {
                    const key = date;
                    dayEventsCache[key] = dayEvents;
                    html += `<div class="more-events" onclick="showMoreEvents('${key}')">+${dayEvents.length - 5}個更多 >></div>`;
                }

                html += "</div></td>";
                day++;
            }

            html += "</tr>";
        }

        dom.calendarResult.innerHTML = html + "</tbody></table>";
    }

    window.showMoreEvents = function (key) {

        const esc = App.esc;

        dom.eventListContent.innerHTML = (dayEventsCache[key] || []).map(({ e, d }) => `
<div class="card mb-2" style="border-left:8px solid ${getEventColor(e.name)}">
    <div class="card-body">
        <h6>${esc(e.name)}</h6>
        <div>🕒 ${esc(dayLabel(d.date))} ${esc(timeText(d) || "")}</div>
        <div>📍 ${esc(e.address || "-")}</div>
        <div>📝 ${esc(d.note || e.remark || "-")}</div>
    </div>
</div>`).join("");

        bootstrap.Modal.getOrCreateInstance(document.getElementById("eventListModal")).show();
    };

    // =========================
    // 活動總覽
    // =========================
    async function loadOverview() {

        try {

            const start = dom.overviewStart.value || "0000-00-00";
            const end = dom.overviewEnd.value || "9999-99-99";
            const { events } = await fetchData();

            overviewEvents = events.filter(isPublic).filter(e => overlaps(e, start, end)).sort(byStart);

            lastOverviewRaw = buildRawText(overviewEvents, dom.overviewStart.value, dom.overviewEnd.value);

            const esc = App.esc;

            dom.overviewResult.innerHTML = overviewEvents.map(e => `
<div class="card shadow-sm mb-2">
    <div class="card-body">
        <div class="d-flex justify-content-between align-items-start">
            <h6 class="mb-2 text-primary">${esc(e.name)}</h6>
            <button class="btn btn-sm btn-warning btn-edit" data-id="${e.id}">活動修改</button>
        </div>
        <div class="small text-muted mb-1">
            📅 ${esc(e.startDate)}${e.endDate !== e.startDate ? " ~ " + esc(e.endDate) : ""}（${e.days.length} 天）
        </div>
        <ul class="small mb-2 ps-3">
            ${e.days.map(d => `<li>${esc(dayLabel(d.date))} ${esc(timeText(d) || "時間未定")}${d.note ? `<span class="text-secondary">｜${esc(d.note)}</span>` : ""}</li>`).join("")}
        </ul>
        <div>📍 ${esc(e.address || "-")}</div>
        <div class="mt-1 text-secondary">📝 ${esc(e.remark || "-")}</div>
    </div>
</div>`).join("") || `<div class="text-muted">查無活動</div>`;

        } catch (err) {

            App.error(err, "活動總覽查詢失敗");
        }
    }

    function buildRawText(events, start, end) {

        const range = `${(start || "").replaceAll("-", "/")} ~ ${(end || "").replaceAll("-", "/")}`;

        if (!events.length)
            return `📅 ${range} 尚無已確定的活動`;

        const lines = [`📅 ${range} 已經確定的活動共「${events.length}」場`, ""];

        events.forEach(e => {
            lines.push(`活動名稱:${e.name}`);
            e.days.forEach(d => lines.push(`${dayLabel(d.date)} ${timeText(d) || "時間未定"}${d.note ? "｜" + d.note : ""}`));
            lines.push(`活動地址:${e.address}`);
            lines.push(`備註:${e.remark}`);
            lines.push("---");
        });

        return lines.join("\n");
    }

    function showRawText() {

        if (!lastOverviewRaw) {
            alert("請先查詢");
            return;
        }

        dom.overviewRawText.value = lastOverviewRaw;
        bootstrap.Modal.getOrCreateInstance(document.getElementById("overviewRawModal")).show();
    }

    function copyRawText() {

        navigator.clipboard.writeText(lastOverviewRaw);
        dom.btnCopyRaw.innerText = "已複製✓";
        setTimeout(() => dom.btnCopyRaw.innerText = "複製內容", 1000);
    }

    // =========================
    // 新增 / 修改視窗
    // =========================
    function handleTypeChange() {

        const isPublicType = dom.type.value === "1";

        dom.userId.disabled = isPublicType;
        dom.userId.placeholder = isPublicType ? "公開活動不需輸入活動代號" : "請輸入活動代號";
        dom.userId.classList.toggle("bg-light", isPublicType);

        if (isPublicType) dom.userId.value = "";
    }

    function clearForm() {

        dom.activityName.value = "";
        dom.startDate.value = "";
        dom.endDate.value = "";
        dom.address.value = "";
        dom.remark.value = "";
        dom.userId.value = "";
        dom.cancel.value = "否";
        dom.type.value = "1";
        dayRows = [];
        renderDayRows();
        handleTypeChange();
    }

    function openCreateModal() {

        editingId = null;
        dom.modalTitle.innerText = "新增活動";
        clearForm();
        calendarModal.show();
    }

    function openEditModal(e) {

        editingId = e.id;
        dom.modalTitle.innerText = "修改活動";

        dom.activityName.value = e.name;
        dom.startDate.value = e.startDate;
        dom.endDate.value = e.endDate;
        dom.address.value = e.address;
        dom.remark.value = e.remark;
        dom.type.value = e.type;
        dom.cancel.value = e.cancel;
        dom.userId.value = e.userId;
        dayRows = e.days.map(d => ({ ...d }));

        if (e.days[0]) {
            dom.defaultOpen.value = e.days[0].start || dom.defaultOpen.value;
            dom.defaultClose.value = e.days[0].end || dom.defaultClose.value;
        }

        renderDayRows();
        handleTypeChange();
        calendarModal.show();
    }

    function handleEditClick(e) {

        const btn = e.target.closest(".btn-edit");
        if (!btn) return;

        const event = overviewEvents.find(x => x.id === Number(btn.dataset.id));
        if (event) openEditModal(event);
    }

    // 依日期區間重建每日列，保留已填的資料
    function onDateRangeChange() {

        const start = dom.startDate.value;
        let end = dom.endDate.value;

        if (start && (!end || end < start)) {
            end = start;
            dom.endDate.value = start;
        }

        if (!start) {
            dayRows = [];
            renderDayRows();
            return;
        }

        const dates = dateRange(start, end);

        if (dates.length > MAX_DAYS) {
            alert(`活動最多 ${MAX_DAYS} 天`);
            dom.endDate.value = dates[MAX_DAYS - 1];
            return onDateRangeChange();
        }

        const old = Object.fromEntries(dayRows.map(d => [d.date, d]));

        dayRows = dates.map(date => old[date] || {
            date,
            start: dom.defaultOpen.value,
            end: dom.defaultClose.value,
            note: ""
        });

        renderDayRows();
    }

    function applyDefaultTime() {

        dayRows.forEach(d => {
            d.start = dom.defaultOpen.value;
            d.end = dom.defaultClose.value;
        });

        renderDayRows();
    }

    function renderDayRows() {

        if (!dayRows.length) {
            dom.dailyList.innerHTML = `<tr><td colspan="4" class="text-muted">請先選擇開始與結束日期</td></tr>`;
            return;
        }

        const esc = App.esc;

        dom.dailyList.innerHTML = dayRows.map((d, i) => `
<tr>
    <td class="fw-bold">${esc(dayLabel(d.date))}</td>
    <td><input type="time" class="form-control form-control-sm" data-index="${i}" data-field="start" value="${esc(d.start || "")}"></td>
    <td><input type="time" class="form-control form-control-sm" data-index="${i}" data-field="end" value="${esc(d.end || "")}"></td>
    <td><input class="form-control form-control-sm" data-index="${i}" data-field="note" value="${esc(d.note || "")}" placeholder="例如：雨備、提早進場"></td>
</tr>`).join("");
    }

    function buildCalendarData() {

        const name = dom.activityName.value.trim();

        if (!name) throw new Error("❌ 活動名稱不可為空");
        if (!dom.startDate.value || !dayRows.length) throw new Error("❌ 請選擇活動日期");

        dayRows.forEach(d => {
            if (d.start && d.end && d.end <= d.start)
                throw new Error(`❌ ${dayLabel(d.date)} 的結束時間必須晚於開始時間`);
        });

        const first = dayRows[0];
        const last = dayRows[dayRows.length - 1];
        const type = dom.type.value;

        return {
            event: {
                EventName: name,
                StartEventDate: `${first.date} ${first.start || "00:00"}`,
                EndEventDate: `${last.date} ${last.end || "23:59"}`,
                EventAddress: dom.address.value.trim(),
                CalendarType: Number(type),
                IsDeleted: dom.cancel.value === "是",
                UserDB_ID: type === "1" ? "" : dom.userId.value.trim(),
                Note: dom.remark.value.trim()
            },
            days: dayRows.map(d => ({
                EventDate: d.date,
                StartTime: d.start || "",
                EndTime: d.end || "",
                Note: (d.note || "").trim()
            }))
        };
    }

    async function saveCalendar() {

        try {

            const { event, days } = buildCalendarData();

            if (!editingId) {

                const { events } = await fetchData(true);

                if (events.some(e => e.name === event.EventName && e.startDate === event.StartEventDate.slice(0, 10))) {
                    alert("⚠️ 相同日期跟活動名稱已建立過，請檢查是否重複建立");
                    return;
                }

                // 第 0 個操作建立活動，每日時段以 $0.CalendarId 關聯
                await API.batch([
                    { action: "insert", table: "Calendar", data: event },
                    ...days.map(d => ({ action: "insert", table: "CalendarDays", data: { ...d, CalendarId: "$0.CalendarId" } }))
                ]);

            } else {

                await API.batch([
                    { action: "update", table: "Calendar", id: editingId, data: event },
                    { action: "removeWhere", table: "CalendarDays", where: { CalendarId: editingId } },
                    ...days.map(d => ({ action: "insert", table: "CalendarDays", data: { ...d, CalendarId: editingId } }))
                ]);
            }

            const isNew = !editingId;

            calendarModal.hide();

            await loadCalendar(true);
            await loadOverview();

            alert(isNew ? "🎉 活動建立成功，祝福生意興隆！" : "✅ 活動修改成功");

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    return {
        init
    };

})();
