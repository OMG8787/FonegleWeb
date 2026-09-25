window.Pages = window.Pages || {};

// =========================================================
// AI 文案發想（Gemini，經由 Apps Script aiGenerate）
// 文案庫存於 AiDrafts 工作表（個人，可共享）
// =========================================================
Pages.AiWriter = (() => {

    "use strict";

    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
    const dom = {};

    let events = [];
    let stalls = [];
    let drafts = [];
    let currentDraft = null;

    // =========================
    // 初始化
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        try {

            const data = await API.getMany(["Calendar", "CalendarDays", "StallRecords", "AiDrafts"]);

            events = buildEvents(data.Calendar || [], data.CalendarDays || []);
            stalls = data.StallRecords || [];      // 沒有市集 / 財務權限時為 null
            drafts = data.AiDrafts || [];

            renderEventOptions();
            renderDrafts();

        } catch (err) {

            App.error(err, "載入資料失敗");
        }
    }

    function cacheDom() {

        [
            "srcOutline", "srcCalendar", "calendarBox", "eventSelect", "eventPreview", "useStall", "draftType",
            "platform", "tone", "length", "optHashtag", "optEmoji", "optVersions", "outline", "btnGenerate",
            "btnCopy", "btnRegenerate", "btnSave", "draftTitle", "output", "status", "qDraft", "draftList", "draftEmpty"
        ].forEach(id => dom[id] = document.getElementById(id));
    }

    function bindEvents() {

        document.querySelectorAll('input[name="source"]').forEach(r => r.addEventListener("change", () => {
            dom.calendarBox.classList.toggle("d-none", !dom.srcCalendar.checked);
        }));

        dom.eventSelect.addEventListener("change", renderEventPreview);
        dom.draftType.addEventListener("change", renderEventPreview);
        dom.useStall.addEventListener("change", renderEventPreview);
        dom.btnGenerate.addEventListener("click", generate);
        dom.btnRegenerate.addEventListener("click", generate);
        dom.btnSave.addEventListener("click", saveDraft);
        dom.qDraft.addEventListener("input", renderDrafts);

        dom.btnCopy.addEventListener("click", () => {
            navigator.clipboard.writeText(dom.output.value);
            dom.status.textContent = "✅ 已複製";
        });

        dom.draftList.addEventListener("click", e => {

            const del = e.target.closest("[data-delete]");
            const share = e.target.closest("[data-share]");
            const card = e.target.closest(".draft-card");

            if (del) return removeDraft(Number(del.dataset.delete));
            if (share) return toggleShare(Number(share.dataset.share));
            if (card) loadDraft(drafts.find(d => d.ID === Number(card.dataset.id)));
        });
    }

    // =========================
    // 行事曆
    // =========================
    function buildEvents(rows, days) {

        return rows
            .filter(r => r.IsDeleted !== true)
            .map(r => {

                const d = days
                    .filter(x => x.CalendarId === r.CalendarId)
                    .sort((a, b) => String(a.EventDate).localeCompare(String(b.EventDate)))
                    .map(x => ({ date: App.toDateInput(x.EventDate), start: x.StartTime || "", end: x.EndTime || "", note: x.Note || "" }));

                const start = App.showDateTime(r.StartEventDate);
                const end = App.showDateTime(r.EndEventDate);

                return {
                    id: r.CalendarId,
                    name: r.EventName || "",
                    address: r.EventAddress || "",
                    note: r.Note || "",
                    start: d[0]?.date || start.slice(0, 10),
                    days: d.length ? d : [{ date: start.slice(0, 10), start: start.slice(11, 16), end: end.slice(11, 16), note: "" }]
                };
            })
            .sort((a, b) => b.start.localeCompare(a.start));
    }

    function dayText(d) {
        const dt = new Date(d.date + "T00:00");
        const label = isNaN(dt) ? d.date : `${dt.getMonth() + 1}/${dt.getDate()}（${WEEK[dt.getDay()]}）`;
        return `${label} ${d.start && d.end ? `${d.start}–${d.end}` : ""}${d.note ? `｜${d.note}` : ""}`.trim();
    }

    function renderEventOptions() {

        dom.eventSelect.innerHTML = "";
        dom.eventSelect.add(new Option("請選擇活動", ""));

        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const upcoming = events.filter(e => e.days[e.days.length - 1].date >= today).reverse();
        const past = events.filter(e => e.days[e.days.length - 1].date < today);

        const group = (label, list) => {
            if (!list.length) return;
            const og = document.createElement("optgroup");
            og.label = label;
            list.forEach(e => og.appendChild(new Option(`${e.start}　${e.name}`, e.id)));
            dom.eventSelect.appendChild(og);
        };

        group("即將到來", upcoming);
        group("過去活動", past);
    }

    function selectedEvent() {
        return events.find(e => String(e.id) === dom.eventSelect.value) || null;
    }

    function eventStall(e) {
        return (stalls || []).find(s => String(s.CalendarId) === String(e.id)) || null;
    }

    function eventText(e) {

        const lines = [
            `活動名稱：${e.name}`,
            `地點：${e.address || "未提供"}`,
            `日期與時段：`,
            ...e.days.map(d => `- ${dayText(d)}`)
        ];

        if (e.note) lines.push(`活動備註：${e.note}`);

        // 營業數據屬內部資料，只給日誌類文件使用，不放進對外貼文
        const s = dom.useStall.checked && isLogType() ? eventStall(e) : null;

        if (s) {
            lines.push(
                `出攤數據：營業額 ${s.Revenue ?? "-"} 元（現金 ${s.CashIncome ?? 0}、電子支付 ${s.ElectronicPay ?? 0}），` +
                `人數 ${s.StaffCount ?? "-"} 人，總成本 ${s.TotalCost ?? "-"} 元，盈虧 ${s.ProfitLoss ?? "-"} 元，` +
                `目標 ${s.RevenueTarget ?? "-"} 元`);
            if (s.Note) lines.push(`出攤備註：${s.Note}`);
        }

        return lines.join("\n");
    }

    function isLogType() {
        return ["出攤日誌", "活動細節整理"].includes(dom.draftType.value);
    }

    function renderEventPreview() {

        const e = selectedEvent();

        dom.eventPreview.classList.toggle("d-none", !e);
        if (!e) return;

        dom.eventPreview.textContent = eventText(e);

        if (!dom.draftTitle.value) dom.draftTitle.value = `${e.name}｜${dom.draftType.value}`;
    }

    // =========================
    // 產生
    // =========================
    function buildPrompt() {

        const type = dom.draftType.value;
        const isLog = type === "出攤日誌" || type === "活動細節整理";
        const e = dom.srcCalendar.checked ? selectedEvent() : null;

        const parts = [
            `請幫我寫一篇「${type}」。`,
            `平台：${dom.platform.value}；語氣：${dom.tone.value}；長度：${dom.length.value}。`
        ];

        if (e) parts.push("", "【活動資料】", eventText(e));

        const outline = dom.outline.value.trim();
        if (outline) parts.push("", "【大綱 / 補充】", outline);

        parts.push("", "【要求】");

        if (isLog) {
            parts.push(type === "出攤日誌"
                ? "以條列整理：活動概況、營業數據、人流與熱賣觀察、遇到的問題、下次改善事項。數據只使用上面提供的，沒有的就寫「待補」。"
                : "以條列整理給工作人員：集合時間與地點、每日營業時段、需攜帶的設備與物品、注意事項。資料沒有的寫「待確認」。");
        } else {
            if (dom.optEmoji.checked) parts.push("適度使用 emoji。");
            if (dom.optHashtag.checked) parts.push("文末加上 5～8 個相關 hashtag（含 #瘋菓）。");
            parts.push("開頭要能吸引目光，結尾要有行動呼籲（例如來攤位找我們、私訊預訂）。");
        }

        if (dom.optVersions.checked) parts.push("請提供 3 個不同風格的版本，以【版本一】【版本二】【版本三】標示。");

        return { prompt: parts.join("\n"), event: e, type };
    }

    async function generate() {

        const { prompt, event } = buildPrompt();

        if (dom.srcCalendar.checked && !event) {
            alert("請選擇行事曆活動");
            return;
        }

        if (!dom.srcCalendar.checked && !dom.outline.value.trim()) {
            alert("請輸入大綱");
            return;
        }

        dom.btnGenerate.disabled = dom.btnRegenerate.disabled = true;
        dom.status.textContent = "✨ AI 撰寫中，約 5～15 秒…";

        try {

            dom.output.value = await API.call("aiGenerate", { prompt });
            dom.status.textContent = "✅ 完成，可直接修改後複製或存檔";

            if (!dom.draftTitle.value)
                dom.draftTitle.value = `${event ? event.name + "｜" : ""}${dom.draftType.value}`;

            currentDraft = null;
            renderDrafts();

        } catch (err) {

            dom.status.textContent = "";
            App.error(err, "產生失敗");

        } finally {

            dom.btnGenerate.disabled = dom.btnRegenerate.disabled = false;
        }
    }

    // =========================
    // 文案庫
    // =========================
    async function saveDraft() {

        const content = dom.output.value.trim();

        if (!content) {
            alert("沒有內容可以儲存");
            return;
        }

        const e = dom.srcCalendar.checked ? selectedEvent() : null;

        const data = {
            Title: dom.draftTitle.value.trim() || dom.draftType.value,
            DraftType: dom.draftType.value,
            Platform: dom.platform.value,
            Tone: dom.tone.value,
            CalendarId: e ? e.id : null,
            Outline: dom.outline.value.trim(),
            Content: content
        };

        try {

            currentDraft = currentDraft && currentDraft.CreatedBy === Auth.getUserId()
                ? await API.update("AiDrafts", currentDraft.ID, data)
                : await API.insert("AiDrafts", data);

            drafts = await API.list("AiDrafts");
            renderDrafts();

            dom.status.textContent = "✅ 已存到文案庫";

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    function loadDraft(d) {

        if (!d) return;

        currentDraft = d;
        dom.draftTitle.value = d.Title || "";
        dom.output.value = d.Content || "";
        dom.outline.value = d.Outline || "";
        if (d.DraftType) dom.draftType.value = d.DraftType;
        if (d.Platform) dom.platform.value = d.Platform;
        if (d.Tone) dom.tone.value = d.Tone;
        dom.status.textContent = `已載入：${d.Title || ""}`;

        renderDrafts();
    }

    async function toggleShare(id) {

        const d = drafts.find(x => x.ID === id);
        if (!d) return;

        try {
            await API.update("AiDrafts", id, { IsShared: !d.IsShared });
            drafts = await API.list("AiDrafts");
            renderDrafts();
        } catch (err) {
            App.error(err, "設定失敗");
        }
    }

    async function removeDraft(id) {

        const d = drafts.find(x => x.ID === id);
        if (!d || !confirm(`刪除文案「${d.Title}」？`)) return;

        try {
            await API.remove("AiDrafts", id);
            drafts = drafts.filter(x => x.ID !== id);
            if (currentDraft && currentDraft.ID === id) currentDraft = null;
            renderDrafts();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    function renderDrafts() {

        const kw = dom.qDraft.value.trim();
        const me = Auth.getUserId();
        const esc = App.esc;

        const list = drafts
            .filter(d => !kw || App.like(d.Title, kw) || App.like(d.Content, kw))
            .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));

        dom.draftEmpty.classList.toggle("d-none", list.length > 0);

        dom.draftList.innerHTML = list.map(d => `
<div class="draft-card ${currentDraft && currentDraft.ID === d.ID ? "active" : ""}" data-id="${d.ID}">
    <div class="d-flex justify-content-between align-items-center gap-2">
        <b class="text-truncate">${esc(d.Title || "（無標題）")}</b>
        <span class="text-nowrap">
            ${d.CreatedBy === me ? `
            <button class="btn btn-sm ${d.IsShared ? "btn-info" : "btn-outline-secondary"}" data-share="${d.ID}" title="共享給其他同事">${d.IsShared ? "已共享" : "共享"}</button>
            <button class="btn btn-sm btn-outline-danger" data-delete="${d.ID}">刪除</button>` : `<span class="badge bg-info">同事共享</span>`}
        </span>
    </div>
    <div class="small text-muted">${esc(d.DraftType || "")}・${esc(d.Platform || "")}・${esc(String(d.CreatedAt || "").slice(0, 16))}</div>
</div>`).join("");
    }

    return {
        init
    };

})();
