window.Pages = window.Pages || {};

Pages.Calendar = (() => {
    const dom = {};
    let calendarModal = null;
    let currentDate = new Date();

    let allEvents = [];

    let publicEvents = [];

    let privateEvents = [];

    let isEditMode = false;

    let editingId = null;

    // Calendar 工作表的全部資料（Promise，載入一次，儲存後重新整理）
    let calendarRows = null;

    let privateSearchId = null;
    let lastOverviewRaw = "";
    let overviewEvents = [];
    const dayEventsCache = {};

    const eventColorMap = {};

    const colors = [

        "#5B8FF9",
        "#61DDAA",
        "#65789B",
        "#F6BD16",
        "#7262FD",
        "#78D3F8",
        "#9661BC",
        "#F6903D",
        "#008685",
        "#F08BB4"
    ];

    function getEventColor(name) {

        if (!eventColorMap[name]) {

            const index =
                Object.keys(eventColorMap)
                    .length %
                colors.length;

            eventColorMap[name] =
                colors[index];
        }

        return eventColorMap[name];
    }

    function init() {
        cacheDom();

        calendarModal =
            bootstrap.Modal.getOrCreateInstance(
                document.getElementById("calendarModal")
            );

        bind();

        initOverview();

        loadCalendar();

        loadOverview();
    }
    function initOverview() {

        const today =
            new Date();

        dom.overviewStart.value =
            formatDate(today);

        const sixMonths =
            new Date();

        sixMonths.setMonth(
            sixMonths.getMonth() + 6
        );

        dom.overviewEnd.value =
            formatDate(sixMonths);
    }

    function cacheDom() {

        dom.calendarResult =
            document.getElementById("calendarResult");

        dom.btnCreate =
            document.getElementById("btnCreate");

        dom.btnSave =
            document.getElementById("btnSave");

        dom.activityName =
            document.getElementById("activityName");

        dom.startTime =
            document.getElementById("startTime");

        dom.endTime =
            document.getElementById("endTime");

        dom.address =
            document.getElementById("address");

        dom.type =
            document.getElementById("type");

        dom.cancel =
            document.getElementById("cancel");

        dom.userId =
            document.getElementById("userId");

        dom.remark =
            document.getElementById("remark");

        dom.editTargetName =
            document.getElementById("editTargetName");

        dom.monthPicker =
            document.getElementById("monthPicker");

        dom.btnSearchMonth =
            document.getElementById("btnSearchMonth");

        dom.calendarTitle =
            document.getElementById("calendarTitle");

        dom.btnPrevMonth =
            document.getElementById("btnPrevMonth");

        dom.btnNextMonth =
            document.getElementById("btnNextMonth");

        dom.overviewStart =
            document.getElementById("overviewStart");

        dom.overviewEnd =
            document.getElementById("overviewEnd");

        dom.btnOverview =
            document.getElementById("btnOverview");

        dom.overviewResult =
            document.getElementById("overviewResult");

        dom.btnPrivateCalendar =
            document.getElementById("btnPrivateCalendar");

        dom.calendarFilter =
            document.getElementById("calendarFilter");

        dom.btnShowRaw =
            document.getElementById("btnShowRaw");

        dom.overviewRawText =
            document.getElementById("overviewRawText");

        dom.btnCopyRaw =
            document.getElementById("btnCopyRaw");
    }


    function bind() {
        dom.btnCopyRaw
            .addEventListener(
                "click",
                copyRawText
            );

        dom.btnSave?.addEventListener(
            "click",
            () => {

                if (isEditMode)
                    updateCalendar();
                else
                    saveCalendar();
            }
        );

        dom.btnPrevMonth.addEventListener(
            "click",
            () => {

                currentDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth() - 1,
                    1
                );
                privateEvents = [];

                //privateSearchId = null;

                if (privateSearchId) {

                    privateEvents = [];

                    privateSearchId = null;

                    // alert(
                    //     "如須查詢私人行程需要再次搜尋"
                    // );

                }
                loadCalendar();

            }
        );

        dom.overviewResult.addEventListener(
            "click",
            handleEditClick
        );

        dom.btnNextMonth.addEventListener(
            "click",
            () => {

                currentDate = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth() + 1,
                    1
                );
                privateEvents = [];

                privateSearchId = null;

                // alert(
                //     "如須查詢私人行程需要再次搜尋"
                // );
                loadCalendar();
            }
        );

        dom.btnCreate.addEventListener(
            "click",
            openCreateModal
        );

        dom.btnSearchMonth.addEventListener(
            "click",
            () => {

                const value =
                    dom.monthPicker.value;

                if (!value)
                    return;

                currentDate =
                    new Date(value + "-01");
                if (privateSearchId) {

                    privateEvents = [];

                    privateSearchId = null;

                    alert(
                        "如須查詢私人行程需要再次搜尋"
                    );

                }
                loadCalendar();
            }
        );

        dom.btnOverview.addEventListener(
            "click",
            loadOverview
        );

        dom.btnPrivateCalendar
            .addEventListener(
                "click",
                searchPrivateCalendar
            );

        dom.calendarFilter
            .addEventListener(
                "change",
                applyFilter
            );

        dom.type.addEventListener(
            "change",
            handleTypeChange
        );

        dom.btnShowRaw
            .addEventListener(
                "click",
                showRawText
            );

        document
            .getElementById("calendarModal")
            .addEventListener(
                "hidden.bs.modal",
                resetModalState
            );
    }

    function resetModalState() {

        isEditMode = false;

        editingId = null;

        dom.editTargetName.value = "";

        document.activeElement?.blur();

        clearForm();
    }

    function clearForm() {

        dom.activityName.value = "";

        dom.startTime.value = "";

        dom.endTime.value = "";

        dom.address.value = "";

        dom.remark.value = "";

        dom.userId.value = "";

        dom.cancel.value = "否";

        dom.type.value = "1";

        handleTypeChange();
    }

    function handleTypeChange() {

        const type =
            dom.type.value;

        // 公開活動
        if (type === "1") {

            dom.userId.value = "";

            dom.userId.disabled =
                true;

            dom.userId.placeholder =
                "公開活動不需輸入活動代號";

            // 灰色效果
            dom.userId.classList.add(
                "bg-light"
            );

        }
        else {

            dom.userId.disabled =
                false;

            dom.userId.placeholder =
                "請輸入活動代號";

            // 移除灰色
            dom.userId.classList.remove(
                "bg-light"
            );

        }
    }

    function openCreateModal() {

        isEditMode = false;

        document.getElementById("modalTitle").innerText =
            "新增活動";

        clearForm();

        calendarModal.show();
    }

    async function searchPrivateCalendar() {

        const id =
            prompt(
                "請輸入ID"
            );

        if (!id)
            return;

        privateSearchId = id.trim();

        try {

            const { start, end } = monthRange();

            privateEvents =
                (await fetchRows())
                    .filter(r =>
                        String(r.UserDB_ID || "").trim() === privateSearchId &&
                        r.IsDeleted !== true)
                    .map(mapEvent)
                    .filter(e => overlaps(e, start, end))
                    .sort(byStart);

            if (!privateEvents.length)
                alert("📅 此月份尚無私人活動");

            applyFilter();

        } catch (err) {

            App.error(err, "私人行程查詢失敗");

        }

    }

    // =========================
    // 資料
    // =========================
    function fetchRows(force = false) {

        if (!calendarRows || force) {
            calendarRows = API.list("Calendar").catch(err => {
                calendarRows = null;
                throw err;
            });
        }

        return calendarRows;
    }

    function mapEvent(r) {

        return {
            id: r.CalendarId,
            name: r.EventName || "",
            start: App.showDateTime(r.StartEventDate),
            end: App.showDateTime(r.EndEventDate),
            address: r.EventAddress || "",
            remark: r.Note || "",
            type: String(r.CalendarType || 1),
            cancel: r.IsDeleted === true ? "是" : "否",
            userId: r.UserDB_ID || ""
        };
    }

    // 公開活動：未指定活動代號且未取消
    function isPublic(r) {
        return !String(r.UserDB_ID || "").trim() && r.IsDeleted !== true;
    }

    function overlaps(e, start, end) {
        return e.start.slice(0, 10) <= end && e.end.slice(0, 10) >= start;
    }

    function byStart(a, b) {
        return a.start.localeCompare(b.start);
    }

    function monthRange() {

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        return {
            start: formatDate(new Date(year, month, 1)),
            end: formatDate(new Date(year, month + 1, 0))
        };
    }

    async function loadCalendar(force = false) {

        try {

            updateTitle();

            const { start, end } = monthRange();

            publicEvents =
                (await fetchRows(force))
                    .filter(isPublic)
                    .map(mapEvent)
                    .filter(e => overlaps(e, start, end))
                    .sort(byStart);

            applyFilter();

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    // 換月份
    function updateTitle() {

        dom.calendarTitle.innerText =
            `${currentDate.getFullYear()} 年 ${currentDate.getMonth() + 1} 月`;

        dom.monthPicker.value =
            `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
    }

    function formatDate(date) {

        const y = date.getFullYear();

        const m =
            String(date.getMonth() + 1)
                .padStart(2, "0");

        const d =
            String(date.getDate())
                .padStart(2, "0");

        return `${y}-${m}-${d}`;
    }

    function handleEditClick(e) {

        const btn =
            e.target.closest(".btn-edit");

        if (!btn)
            return;

        const id =
            Number(btn.dataset.id);

        const event =
            overviewEvents.find(
                x => x.id === id
            );

        if (!event)
            return;

        openEditModal(event);
    }

    function renderCalendarFromEvents(events) {

        const now = currentDate;

        const year = now.getFullYear();

        const month = now.getMonth();

        const firstDay =
            new Date(year, month, 1);

        const lastDay =
            new Date(year, month + 1, 0);

        const startWeek =
            firstDay.getDay();

        const totalDays =
            lastDay.getDate();

        let html = `
<table class="table table-bordered calendar-table">

<thead>

<tr>

<th>日</th>
<th>一</th>
<th>二</th>
<th>三</th>
<th>四</th>
<th>五</th>
<th>六</th>

</tr>

</thead>

<tbody>
`;

        let day = 1;

        for (let row = 0; row < 6; row++) {

            html += "<tr>";

            for (let col = 0; col < 7; col++) {

                if (
                    row === 0 &&
                    col < startWeek
                ) {

                    html += "<td></td>";

                } else if (day > totalDays) {

                    html += "<td></td>";

                } else {

                    const dateStr =
                        `${year}/${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`;

                    const dayEvents =
                        events.filter(x => {

                            const start =
                                x.start.substring(0, 10)
                                    .replaceAll("-", "/");

                            const end =
                                x.end.substring(0, 10)
                                    .replaceAll("-", "/");

                            return start <= dateStr &&
                                end >= dateStr;

                        });

                    const visibleEvents = dayEvents.slice(0, 5);

                    html += `
<td class="calendar-day">

<div class="day-number">

${day}

</div>

<div class="event-container">
`;

                    visibleEvents.forEach(e => {

                        html += `

<div
class="event-item"
style="
background:${getEventColor(e.name)}
"
title="
活動:${App.esc(e.name)}
地址:${App.esc(e.address)}
備註:${App.esc(e.remark || "-")}
"
>

${App.esc(e.name)}

</div>
`;

                    });

                    if (dayEvents.length > 5) {

                        const remain =
                            dayEvents.length - visibleEvents.length;

                        const eventKey =
                            `${year}_${month}_${day}`;

                        dayEventsCache[eventKey] =
                            dayEvents;

                        html += `
<div
class="more-events"
onclick="showMoreEvents('${eventKey}')"
>
+${remain}個更多 >>
</div>
`;
                    }

                    html += `
</div>

</td>
`;

                    day++;

                }

            }

            html += "</tr>";

            if (day > totalDays)
                break;

        }

        html += `
</tbody>
</table>
`;

        dom.calendarResult.innerHTML =
            html;
    }

    function buildCalendarData() {

        const type = dom.type.value;

        const data = {
            EventName: dom.activityName.value.trim(),
            StartEventDate: App.showDateTime(dom.startTime.value),
            EndEventDate: App.showDateTime(dom.endTime.value),
            EventAddress: dom.address.value.trim(),
            CalendarType: Number(type),
            IsDeleted: dom.cancel.value === "是",
            UserDB_ID: type === "1" ? "" : dom.userId.value.trim(),
            Note: dom.remark.value.trim()
        };

        if (!data.EventName)
            throw new Error("❌ 活動名稱不可為空");

        if (!data.StartEventDate || !data.EndEventDate)
            throw new Error("❌ 活動時間不可為空");

        if (data.EndEventDate <= data.StartEventDate)
            throw new Error("❌ 結束時間必須大於開始時間");

        return data;
    }

    async function saveCalendar() {

        try {

            const data = buildCalendarData();

            const rows = await fetchRows(true);

            const duplicated = rows.some(r =>
                r.EventName === data.EventName &&
                App.showDateTime(r.StartEventDate).slice(0, 10) === data.StartEventDate.slice(0, 10));

            if (duplicated) {
                alert("⚠️ 相同日期跟活動名稱已建立過，請檢查是否重複建立");
                return;
            }

            await API.insert("Calendar", data);

            calendarModal.hide();

            await loadCalendar(true);

            await loadOverview();

            alert("🎉 活動建立成功，祝福生意興隆！");

        }
        catch (err) {

            App.error(err, "新增失敗");

        }

    }

    function openEditModal(event) {

        isEditMode = true;

        editingId = event.id;

        dom.editTargetName.value =
            event.name;

        dom.activityName.value =
            event.name;

        dom.startTime.value =
            event.start.replace(" ", "T");

        dom.endTime.value =
            event.end.replace(" ", "T");

        dom.address.value =
            event.address || "";

        dom.remark.value =
            event.remark || "";

        dom.type.value =
            event.type || "1";

        dom.cancel.value =
            event.cancel || "否";

        dom.userId.value =
            event.userId || "";

        handleTypeChange();

        document.getElementById("modalTitle").innerText =
            "修改活動";

        calendarModal.show();
    }
    async function updateCalendar() {

        try {

            if (!editingId)
                throw new Error("請先選擇要修改的活動");

            await API.update("Calendar", editingId, buildCalendarData());

            calendarModal.hide();

            await loadCalendar(true);

            await loadOverview();

            alert("✅ 活動修改成功");

        }
        catch (err) {

            App.error(err, "修改失敗");

        }

    }

    window.showMoreEvents =
        function (key) {

            const events =
                dayEventsCache[key];

            const content =
                document.getElementById(
                    "eventListContent"
                );

            content.innerHTML = "";

            events.forEach(e => {

                content.innerHTML += `

<div
class="card mb-2"
style="
border-left:8px solid ${getEventColor(e.name)}
"
>

<div class="card-body">

<h6>
${App.esc(e.name)}
</h6>

<div>
🕒 ${App.esc(e.start)}
</div>

<div>
📍 ${App.esc(e.address || "-")}
</div>

<div>
📝 ${App.esc(e.remark || "-")}
</div>

</div>

</div>

`;

            });

            bootstrap.Modal
                .getOrCreateInstance(
                    document.getElementById(
                        "eventListModal"
                    )
                )
                .show();

        }

    function applyFilter() {

        const type =
            dom.calendarFilter.value;

        switch (type) {

            case "public":

                allEvents =
                    publicEvents;

                break;

            case "private":

                allEvents =
                    privateEvents;

                break;

            default:

                allEvents = [
                    ...publicEvents,
                    ...privateEvents
                ];

                break;

        }

        renderCalendarFromEvents(
            allEvents
        );

    }

    function showRawText() {

        if (!lastOverviewRaw) {

            alert("請先查詢");

            return;
        }

        dom.overviewRawText.value =
            lastOverviewRaw;

        bootstrap.Modal
            .getOrCreateInstance(
                document.getElementById(
                    "overviewRawModal"
                )
            )
            .show();

    }

    function copyRawText() {

        navigator.clipboard.writeText(
            lastOverviewRaw
        );

        const btn =
            dom.btnCopyRaw;

        btn.innerText =
            "已複製✓";

        setTimeout(() => {

            btn.innerText =
                "複製內容";

        }, 1000);

    }

    async function loadOverview() {

        try {

            const start =
                dom.overviewStart.value;

            const end =
                dom.overviewEnd.value;

            const events =
                (await fetchRows())
                    .filter(isPublic)
                    .map(mapEvent)
                    .filter(e => overlaps(e, start || "0000-00-00", end || "9999-99-99"))
                    .sort(byStart);

            overviewEvents = events;

            lastOverviewRaw = buildRawText(events, start, end);

            let html = "";

            const esc = App.esc;

            events.forEach(e => {

                html += `
<div class="card shadow-sm mb-2">

    <div class="card-body">

<div class="d-flex justify-content-between align-items-start">

    <h6 class="mb-2 text-primary">
        ${esc(e.name)}
    </h6>

    <button
        class="btn btn-sm btn-warning btn-edit"
        data-id="${e.id}"
    >
        活動修改
    </button>

</div>

        <div class="small text-muted">

            🕒 ${esc(e.start)}

            <br>

            🕒 ${esc(e.end)}

        </div>

        <div class="mt-2">

            📍 ${esc(e.address || "-")}

        </div>

        <div class="mt-2 text-secondary">

            📝 ${esc(e.remark || "-")}

        </div>

    </div>

</div>
`;
            });

            if (!html) {

                html =
                    `<div class="text-muted">
                    查無活動
                </div>`;
            }

            dom.overviewResult.innerHTML =
                html;

        }
        catch (err) {

            App.error(err, "活動總覽查詢失敗");
        }
    }

    // 複製用純文字（格式與舊系統相同）
    function buildRawText(events, start, end) {

        const range = `${start.replaceAll("-", "/")} ~ ${end.replaceAll("-", "/")}`;

        if (!events.length)
            return `📅 ${range} 尚無已確定的活動`;

        const lines = [`📅 ${range} 已經確定的活動共「${events.length}」場`, ""];

        events.forEach(e => {
            lines.push(`活動名稱:${e.name}`);
            lines.push(`開始時間:${e.start}`);
            lines.push(`結束時間:${e.end}`);
            lines.push(`活動地址:${e.address}`);
            lines.push(`備註:${e.remark}`);
            lines.push("---");
        });

        return lines.join("\n");
    }

    //     const cmd =
    //         `修改行事曆-
    // 修改目標活動名稱:${targetName}
    // 活動名稱:${activityName.value}
    // 開始時間:${startTime.value}
    // 結束時間:${endTime.value}
    // 活動地址:${address.value}
    // 活動類型:${type.value}
    // 活動是否取消:${cancel.value}
    // 使用者ID:${userId.value}
    // 備註:${remark.value}`;


    return {
        init
    };
})();