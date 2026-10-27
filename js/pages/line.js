window.Pages = window.Pages || {};

// =========================================================
// LINE 管理：員工專用 LINE 官方帳號的成員開通、權限、綁定網站帳號；機器人金鑰、AI 與回覆文字
// =========================================================
Pages.Line = (() => {

    "use strict";

    // 權限（與「帳號審核與權限」頁相同的代碼）
    const PERMS = [
        { id: 13, name: "最高系統管理員", desc: "全部資料" },
        { id: 3, name: "系統管理", desc: "帳號、員工及會員" },
        { id: 20, name: "行事曆", desc: "活動、營業時段" },
        { id: 21, name: "市集營運", desc: "出攤紀錄、保證金、備品清單、市集報表" },
        { id: 22, name: "商品與生產", desc: "產品、配方、原料、庫存、生產" },
        { id: 23, name: "銷售與客戶", desc: "訂單、出貨、客戶" },
        { id: 24, name: "財務", desc: "帳款、支出、攤提" },
        { id: 25, name: "行銷", desc: "AI 文案、行事曆" },
        { id: 26, name: "財務總覽", desc: "只看品牌損益" }
    ];
    const NAMES = Object.fromEntries(PERMS.map(p => [p.id, p.name]));
    const STATUS_BADGE = { "待開通": "bg-warning text-dark", "已開通": "bg-success", "停用": "bg-secondary" };

    const dom = {};
    let data = { users: [], accounts: [], bot: {} };
    let roles = [];
    let editing = null;
    let editModal = null;

    const esc = v => App.esc(v);
    const codesOf = r => String(r?.Permissions || "").split(/[|,、]/).map(Number).filter(n => n > 0);
    const roleById = id => roles.find(r => String(r.ID) === String(id));

    async function init() {

        ["pendingCard", "pendingList", "pendingCount", "listCount", "qKeyword", "qStatus", "btnRefresh", "userBody",
            "botState", "botHint", "btnSecret", "btnBotOff", "secretBox", "secretText", "gasUrl",
            "aiUsing", "aiProvider", "aiModel", "aiKey", "aiKeyHint", "aiEndpoint", "btnAiSave", "btnAiTest", "btnAiClear",
            "txtWelcome", "txtPending", "txtPrompt", "btnTextSave",
            "editModal", "edAvatar", "edTitle", "edStatus", "edRole", "edLink", "edPerms", "edNote", "edInfo", "edRemove", "edSave"]
            .forEach(id => dom[id] = document.getElementById(id));

        editModal = new bootstrap.Modal(dom.editModal);

        dom.gasUrl.value = window.APP_SETTINGS?.GAS_URL || "";

        dom.qKeyword.addEventListener("input", renderUsers);
        dom.qStatus.addEventListener("change", renderUsers);
        dom.btnRefresh.addEventListener("click", load);
        dom.userBody.addEventListener("click", e => {
            const b = e.target.closest("[data-edit]");
            if (b) openEdit(b.dataset.edit);
        });
        dom.pendingList.addEventListener("click", onPendingClick);

        dom.edRole.addEventListener("change", () => {
            const r = roleById(dom.edRole.value);
            if (r) setPermChecks(codesOf(r));
        });
        dom.edPerms.addEventListener("change", () => {
            // 手動改了權限：跟角色不一樣就不算套用角色
            const r = roleById(dom.edRole.value);
            if (r && codesOf(r).sort().join() !== checkedPerms().sort().join()) dom.edRole.value = "";
        });
        dom.edSave.addEventListener("click", saveEdit);
        dom.edRemove.addEventListener("click", removeUser);

        dom.btnSecret.addEventListener("click", newSecret);
        dom.btnBotOff.addEventListener("click", botOff);
        dom.btnAiSave.addEventListener("click", saveAi);
        dom.btnAiTest.addEventListener("click", testAi);
        dom.btnAiClear.addEventListener("click", clearAi);
        dom.btnTextSave.addEventListener("click", saveTexts);
        dom.aiProvider.addEventListener("change", renderAiPlaceholder);
        document.addEventListener("click", e => {
            const b = e.target.closest("[data-copy]");
            if (b) copy(document.getElementById(b.dataset.copy).value, b);
        });

        dom.userBody.innerHTML = `<tr><td colspan="7" class="text-muted">載入中…</td></tr>`;
        await load();
    }

    async function load() {
        try {
            const [res, roleRows] = await Promise.all([API.call("lineUsers", {}, { silent: true }), API.list("Roles", null, { fresh: true })]);
            data = res;
            roles = (roleRows || []).slice().sort((a, b) => (App.num(a.SortOrder) || 999) - (App.num(b.SortOrder) || 999) || App.num(a.ID) - App.num(b.ID));
            renderPending();
            renderUsers();
            renderBot();
        } catch (err) {
            App.error(err, "載入 LINE 成員失敗");
        }
    }

    // =========================
    // 成員
    // =========================
    function avatar(u) {
        return u.PictureUrl
            ? `<img class="lu-avatar" src="${esc(u.PictureUrl)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
            : `<span class="lu-avatar ph">👤</span>`;
    }

    const permText = list => list.length ? list.map(n => NAMES[n] || n).join("、") : "（沒有權限）";
    const roleOptions = (selected, blank = "— 自訂 —") =>
        `<option value="">${esc(blank)}</option>` + roles.map(r => `<option value="${r.ID}" ${String(r.ID) === String(selected ?? "") ? "selected" : ""}>${esc(r.RoleName)}</option>`).join("");

    function renderPending() {
        const list = data.users.filter(u => u.Status === "待開通");
        dom.pendingCard.classList.toggle("d-none", !list.length);
        dom.pendingCount.textContent = list.length;
        dom.pendingList.innerHTML = list.map(u => `
<div class="d-flex flex-wrap align-items-center gap-2 border rounded-3 p-2" data-uid="${esc(u.LineUserId)}">
    ${avatar(u)}
    <div class="me-auto">
        <div class="fw-bold">${esc(u.DisplayName || "（沒有名稱）")}</div>
        <div class="small text-muted">加入 ${esc(App.showDateTime(u.FollowedAt))}${u.IsFollowing ? "" : "・已封鎖官方帳號"}</div>
    </div>
    ${roles.length ? `<select class="form-select form-select-sm" style="width:auto" data-role>${roleOptions("", "選擇角色…")}</select>
    <button class="btn btn-sm btn-success" data-approve>開通</button>` : ""}
    <button class="btn btn-sm btn-outline-secondary" data-deny>停用</button>
    <button class="btn btn-sm btn-outline-primary" data-edit-pending>詳細設定</button>
</div>`).join("");
    }

    async function onPendingClick(e) {
        const row = e.target.closest("[data-uid]");
        if (!row) return;
        const uid = row.dataset.uid;
        const u = data.users.find(x => x.LineUserId === uid);

        if (e.target.closest("[data-edit-pending]")) return openEdit(uid);

        if (e.target.closest("[data-deny]")) {
            if (!confirm(`停用「${u.DisplayName}」？對方傳訊息時會收到「帳號已停用」。`)) return;
            return save([{ lineUserId: uid, status: "停用" }], "已停用");
        }

        if (e.target.closest("[data-approve]")) {
            const r = roleById(row.querySelector("[data-role]").value);
            if (!r) return alert("請先選擇角色（決定機器人可以查詢哪些資料）；要細調請按「詳細設定」");
            if (!confirm(`開通「${u.DisplayName}」，角色「${r.RoleName}」：${permText(codesOf(r))}？`)) return;
            return save([{ lineUserId: uid, status: "已開通", roleList: codesOf(r), roleId: r.ID }], "已開通");
        }
    }

    function renderUsers() {
        const kw = dom.qKeyword.value.trim().toLowerCase();
        const st = dom.qStatus.value;
        const order = { "待開通": 0, "已開通": 1, "停用": 2 };
        const list = data.users
            .filter(u => !st || u.Status === st)
            .filter(u => !kw || [u.DisplayName, u.LinkedName, u.Note].some(v => String(v || "").toLowerCase().includes(kw)))
            .sort((a, b) => (order[a.Status] ?? 9) - (order[b.Status] ?? 9) || String(b.LastSeenAt).localeCompare(String(a.LastSeenAt)));

        dom.listCount.textContent = `${list.length} / ${data.users.length} 人`;
        dom.userBody.innerHTML = list.map(u => `
<tr>
    <td><div class="d-flex align-items-center gap-2">${avatar(u)}<div><div class="fw-bold">${esc(u.DisplayName || "（沒有名稱）")}</div>${u.IsFollowing ? "" : `<div class="small text-danger">已封鎖官方帳號</div>`}</div></div></td>
    <td><span class="badge ${STATUS_BADGE[u.Status] || "bg-secondary"}">${esc(u.Status)}</span></td>
    <td class="small">${u.LinkedUserId ? esc(u.LinkedName) : `<span class="text-muted">未綁定</span>`}</td>
    <td class="small">${u.RoleTemplateId && roleById(u.RoleTemplateId) ? `<span class="badge bg-light text-dark border perm-chip me-1">${esc(roleById(u.RoleTemplateId).RoleName)}</span>` : ""}${esc(permText(u.RoleList))}</td>
    <td class="small text-nowrap">${esc(App.showDateTime(u.LastSeenAt))}</td>
    <td class="small">${esc(u.Note)}</td>
    <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-edit="${esc(u.LineUserId)}">編輯</button></td>
</tr>`).join("") || `<tr><td colspan="7" class="text-muted">${data.users.length ? "沒有符合的成員" : "還沒有人加入。設定好機器人後，員工加官方帳號好友就會出現在這裡。"}</td></tr>`;
    }

    // =========================
    // 編輯成員
    // =========================
    function setPermChecks(list) {
        dom.edPerms.querySelectorAll("input[data-perm]").forEach(i => { i.checked = list.includes(Number(i.dataset.perm)); });
    }

    const checkedPerms = () => [...dom.edPerms.querySelectorAll("input[data-perm]:checked")].map(i => Number(i.dataset.perm));

    function openEdit(uid) {
        const u = data.users.find(x => x.LineUserId === uid);
        if (!u) return;
        editing = u;

        dom.edAvatar.innerHTML = avatar(u);
        dom.edTitle.textContent = u.DisplayName || "（沒有名稱）";
        dom.edStatus.value = u.Status;
        dom.edRole.innerHTML = roleOptions(u.RoleTemplateId);
        dom.edPerms.innerHTML = PERMS.map(p => `
<div class="form-check" title="${esc(p.desc)}">
    <input class="form-check-input" type="checkbox" id="edp${p.id}" data-perm="${p.id}">
    <label class="form-check-label" for="edp${p.id}">${esc(p.name)}<div class="small text-muted">${esc(p.desc)}</div></label>
</div>`).join("");
        setPermChecks(u.RoleList);

        // 系統管理員（非最高）只能綁定自己的帳號
        const accounts = data.accounts.filter(a => data.canLinkOthers || a.id === data.me || a.id === u.LinkedUserId);
        dom.edLink.innerHTML = `<option value="">— 不綁定 —</option>` +
            accounts.map(a => `<option value="${esc(a.id)}" ${a.id === u.LinkedUserId ? "selected" : ""}>${esc(a.name)}${a.phone ? `（${esc(a.phone)}）` : ""}${a.id === data.me ? "（我）" : ""}</option>`).join("") +
            (u.LinkedUserId && !accounts.some(a => a.id === u.LinkedUserId) ? `<option value="${esc(u.LinkedUserId)}" selected>${esc(u.LinkedName)}</option>` : "");

        dom.edNote.value = u.Note || "";
        dom.edInfo.innerHTML = [
            `加入：${esc(App.showDateTime(u.FollowedAt))}`,
            u.LastSeenAt ? `最後使用：${esc(App.showDateTime(u.LastSeenAt))}` : "",
            u.ApprovedAt ? `開通：${esc(u.ApprovedBy)}，${esc(App.showDateTime(u.ApprovedAt))}` : "",
            data.canLinkOthers ? "" : "只有最高系統管理員可以綁定別人的網站帳號"
        ].filter(Boolean).join("　・　");
        dom.edRemove.classList.toggle("d-none", !(Auth.hasPermission(12) || Auth.getRoleList().includes(13)));

        editModal.show();
    }

    async function saveEdit() {
        const u = editing;
        if (!u) return;
        const perms = checkedPerms();
        const status = dom.edStatus.value;
        if (status === "已開通" && !perms.length && !confirm("沒有勾選任何權限：開通後只能查共享備忘錄。確定嗎？")) return;
        if (perms.includes(13) && !u.RoleList.includes(13) && !confirm("「最高系統管理員」可以透過 LINE 查詢全部資料（含財務、所有人的備忘錄），確定要給嗎？")) return;

        const ok = await save([{
            lineUserId: u.LineUserId,
            status,
            roleList: perms,
            roleId: dom.edRole.value || "",
            linkedUserId: dom.edLink.value,
            note: dom.edNote.value.trim()
        }], "已儲存");
        if (ok) editModal.hide();
    }

    async function removeUser() {
        const u = editing;
        if (!u || !confirm(`移除「${u.DisplayName}」？\n對方如果再傳訊息，會重新登記為「待開通」。`)) return;
        try {
            await API.call("removeLineUser", { lineUserId: u.LineUserId });
            editModal.hide();
            await load();
        } catch (err) {
            App.error(err, "移除失敗");
        }
    }

    async function save(changes, msg) {
        try {
            await API.call("setLineUsers", { changes });
            await load();
            App.toast("✅ " + msg);
            return true;
        } catch (err) {
            App.error(err, "儲存失敗");
            return false;
        }
    }

    // =========================
    // 機器人設定
    // =========================
    function renderBot() {
        const b = data.bot || {};
        dom.botState.className = "badge " + (b.enabled ? "bg-success" : "bg-secondary");
        dom.botState.textContent = b.enabled ? "已啟用" : "未啟用";
        dom.botHint.textContent = b.enabled ? `Bot 金鑰 ${b.secretHint}` : "請先產生 Bot 金鑰並部署機器人（見下方設定步驟）";
        dom.btnSecret.textContent = b.enabled ? "🔑 重新產生 Bot 金鑰" : "🔑 產生 Bot 金鑰";
        dom.btnBotOff.classList.toggle("d-none", !b.enabled);

        const providers = b.providers || {};
        dom.aiProvider.innerHTML = Object.entries(providers).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("");
        dom.aiProvider.value = b.ai?.provider || "gemini";
        dom.aiModel.value = b.ai?.model || "";
        dom.aiEndpoint.value = b.ai?.endpoint || "";
        dom.aiKey.value = "";
        dom.aiKeyHint.textContent = b.ai?.hasKey ? `（已設定 ${b.ai.keyHint}）` : "";
        dom.aiUsing.textContent = b.using
            ? `目前使用：${b.using.source === "bot" ? "這裡設定的" : "系統共用"} ${b.using.name}（${b.using.model}）`
            : "⚠️ 目前沒有可用的 AI，機器人無法回答問題";
        renderAiPlaceholder();

        dom.txtWelcome.value = b.welcome || "";
        dom.txtPending.value = b.pendingText || "";
        dom.txtPrompt.value = b.prompt || "";
    }

    function renderAiPlaceholder() {
        const p = (data.bot?.providers || {})[dom.aiProvider.value] || {};
        dom.aiModel.placeholder = p.model ? `預設 ${p.model}` : "必填";
        dom.aiEndpoint.placeholder = p.endpoint || "留空使用官方網址";
    }

    async function newSecret() {
        const again = data.bot?.enabled;
        if (again && !confirm("重新產生後，舊的金鑰立即失效：機器人會停止回覆，直到你把新金鑰貼到 Vercel 並重新部署。確定嗎？")) return;
        try {
            const r = await API.call("setLineBot", { op: "secret" });
            dom.secretText.value = r.secret;
            dom.secretBox.classList.remove("d-none");
            data.bot.enabled = true;
            data.bot.secretHint = "••••" + r.secret.slice(-4);
            renderBot();
        } catch (err) {
            App.error(err, "產生金鑰失敗");
        }
    }

    async function botOff() {
        if (!confirm("停用機器人？Bot 金鑰會被刪除，所有人都無法再透過 LINE 查詢（之後可以重新產生金鑰啟用）。")) return;
        try {
            await API.call("setLineBot", { op: "off" });
            dom.secretBox.classList.add("d-none");
            await load();
        } catch (err) {
            App.error(err, "停用失敗");
        }
    }

    async function saveBotConfig(payload, msg) {
        try {
            data.bot = Object.assign(data.bot, await API.call("setLineBot", Object.assign({ op: "save" }, payload)));
            renderBot();
            App.toast("✅ " + msg);
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    function saveAi() {
        return saveBotConfig({
            ai: { provider: dom.aiProvider.value, model: dom.aiModel.value.trim(), apiKey: dom.aiKey.value.trim(), endpoint: dom.aiEndpoint.value.trim() }
        }, "AI 設定已儲存");
    }

    function clearAi() {
        if (!confirm("清除機器人的 AI 設定，改用系統共用的 Gemini？")) return;
        return saveBotConfig({ aiClear: true }, "已改用系統共用 AI");
    }

    async function testAi() {
        try {
            const r = await API.call("setLineBot", { op: "test" });
            alert(`✅ 連線成功（${r.source === "bot" ? "這裡設定的" : "系統共用"} ${r.name} ${r.model}）\nAI 回覆：${r.reply}`);
        } catch (err) {
            App.error(err, "測試失敗");
        }
    }

    function saveTexts() {
        return saveBotConfig({ welcome: dom.txtWelcome.value, pendingText: dom.txtPending.value, prompt: dom.txtPrompt.value }, "回覆文字已儲存");
    }

    async function copy(text, btn) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const t = document.createElement("textarea");
            t.value = text;
            document.body.appendChild(t);
            t.select();
            document.execCommand("copy");
            t.remove();
        }
        const old = btn.textContent;
        btn.textContent = "✅ 已複製";
        setTimeout(() => { btn.textContent = old; }, 1500);
    }

    return { init };

})();
