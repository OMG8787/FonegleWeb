window.Pages = window.Pages || {};

// =========================================================
// 帳號審核與權限：核准新帳號、勾選每個帳號的模組權限、啟用 / 停用
// =========================================================
Pages.Access = (() => {

    "use strict";

    // 表格上可勾選的權限（順序即欄位順序）
    const PERMS = [
        { id: 13, short: "最高", name: "最高系統管理員", desc: "全部功能與資料（含所有權限）" },
        { id: 3, short: "系統", name: "系統管理", desc: "帳號審核與權限、員工及會員、登入紀錄、郵件寄送、代理人" },
        { id: 20, short: "行事曆", name: "行事曆", desc: "行事曆（新增 / 修改活動）、首頁行程提醒" },
        { id: 21, short: "市集", name: "市集營運", desc: "現場點餐、市集報表、出攤紀錄、市集報名連結、讀取行事曆" },
        { id: 22, short: "商品", name: "商品與生產", desc: "產品、配方與成本、原料、庫存、生產履歷、產品月盤點、原物料進貨 / 盤點 / 漲幅" },
        { id: 23, short: "銷售", name: "銷售與客戶", desc: "訂單、出貨、客戶 / 合作廠商、讀取產品" },
        { id: 24, short: "財務", name: "財務", desc: "帳務（應收）、支出表、品牌攤提、市集報表與出攤紀錄（唯讀）、首頁收支、盤點與進貨（唯讀）" },
        { id: 25, short: "AI", name: "AI 行銷", desc: "AI 文案發想（可讀取行事曆）" },
        { id: 12, short: "刪除", name: "刪除資料", desc: "可以刪除資料（沒有這個權限只能新增與修改）" },
        { id: 16, short: "唯讀", name: "唯讀", desc: "只能查看，不能新增、修改、刪除（優先於其他權限）" }
    ];

    const NAMES = Object.fromEntries(PERMS.map(p => [p.id, p.name]));

    // 角色範本（與權限管理頁相同）
    const PRESETS = [
        { name: "👑 老闆", codes: [13] },
        { name: "🧑‍💼 店長 / 營運", codes: [20, 21, 22, 23, 12] },
        { name: "🎪 市集人員", codes: [20, 21] },
        { name: "🏭 生產人員", codes: [20, 22] },
        { name: "💼 會計", codes: [24, 23] },
        { name: "📣 行銷", codes: [20, 25] },
        { name: "👀 唯讀", codes: [20, 21, 22, 16] },
        { name: "🚫 無權限", codes: [] }
    ];

    const dom = {};

    let users = [];
    let edits = new Map();   // LineUserId → { roleList: Set, isActive }
    const iAmAdmin = () => Auth.hasPermission(13) && Auth.getRoleList().includes(13);

    async function init() {

        ["pendingCard", "pendingList", "pendingCount", "qKeyword", "qStatus", "listCount", "accessHead", "accessBody",
            "saveBar", "changeCount", "btnRevert", "btnSave", "legendBody"]
            .forEach(id => dom[id] = document.getElementById(id));

        dom.qKeyword.addEventListener("input", renderTable);
        dom.qStatus.addEventListener("change", renderTable);
        dom.btnRevert.addEventListener("click", () => { edits.clear(); renderTable(); });
        dom.btnSave.addEventListener("click", save);
        dom.accessBody.addEventListener("change", onTableChange);
        dom.accessBody.addEventListener("click", e => {
            const btn = e.target.closest("[data-reset]");
            if (btn) resetPassword(users.find(x => x.LineUserId === btn.closest("tr[data-uid]").dataset.uid));
        });
        dom.pendingList.addEventListener("click", onPendingClick);

        renderHead();
        renderLegend();

        dom.accessBody.innerHTML = `<tr><td colspan="${PERMS.length + 3}" class="text-muted">載入中…</td></tr>`;

        await load();

        if (location.hash === "#pending") dom.pendingCard.scrollIntoView({ behavior: "smooth" });

        // 有未儲存的變更時提醒
        window.addEventListener("beforeunload", e => {
            if (edits.size) { e.preventDefault(); e.returnValue = ""; }
        });
    }

    async function load() {
        try {
            users = await Auth.request("accessList");
            renderPending();
            renderTable();
        } catch (err) {
            App.error(err, "載入帳號失敗");
        }
    }

    // =========================
    // 目前狀態（套用未儲存的修改）
    // =========================
    function stateOf(u) {
        const e = edits.get(u.LineUserId);
        return {
            roles: e ? e.roles : new Set(u.RoleList),
            isActive: e ? e.isActive : u.IsActive
        };
    }

    function isChanged(u) {
        const s = stateOf(u);
        const a = [...s.roles].sort().join("|");
        const b = [...u.RoleList].sort().join("|");
        return a !== b || s.isActive !== u.IsActive;
    }

    function editOf(u) {
        if (!edits.has(u.LineUserId)) {
            const s = stateOf(u);
            edits.set(u.LineUserId, { roles: new Set(s.roles), isActive: s.isActive });
        }
        return edits.get(u.LineUserId);
    }

    // 不能改的勾選：非最高管理員不能動「最高」；自己的最高 / 系統不能拿掉
    function locked(u, id) {
        if (id === 13 && !iAmAdmin()) return true;
        if (u.IsMe && (id === 13 || id === 3) && u.RoleList.includes(id)) return true;
        return false;
    }

    // =========================
    // 待審核
    // =========================
    function renderPending() {

        const esc = App.esc;
        const list = users.filter(u => u.ApprovalStatus === "待審核")
            .sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));
        const resets = users.filter(u => u.ResetRequestedAt)
            .sort((a, b) => String(b.ResetRequestedAt).localeCompare(String(a.ResetRequestedAt)));

        dom.pendingCount.textContent = list.length + resets.length;

        const resetHtml = resets.map(u => `
<div class="pending-card d-flex flex-wrap align-items-center gap-2" data-uid="${esc(u.LineUserId)}">
    <div class="me-auto">
        <div class="fw-bold">🔑 密碼重設申請：${esc(u.Name || "")}</div>
        <div class="small text-muted">📞 ${esc(u.PhoneNumber || "")}　🕒 申請 ${esc(String(u.ResetRequestedAt).slice(0, 16))}　<span class="text-danger">請先打電話向本人確認</span></div>
    </div>
    <button class="btn btn-sm btn-warning" data-reset>產生臨時密碼</button>
</div>`).join("");

        dom.pendingList.innerHTML = (list.length || resets.length) ? resetHtml + list.map(u => `
<div class="pending-card d-flex flex-wrap align-items-center gap-2" data-uid="${esc(u.LineUserId)}">
    <div class="me-auto">
        <div class="fw-bold">${esc(u.Name || "")}</div>
        <div class="small text-muted">📞 ${esc(u.PhoneNumber || "")}　✉️ ${esc(u.Email || "")}　🕒 申請 ${esc(String(u.CreatedAt || "").slice(0, 16))}</div>
    </div>
    <select class="form-select form-select-sm" style="width:auto" data-preset>
        ${PRESETS.map((p, i) => iAmAdmin() || !p.codes.includes(13)
            ? `<option value="${i}" ${p.name.includes("無權限") ? "selected" : ""}>${esc(p.name)}</option>` : "").join("")}
    </select>
    <button class="btn btn-sm btn-success" data-approve>✅ 核准</button>
    <button class="btn btn-sm btn-outline-danger" data-reject>拒絕</button>
</div>`).join("") : `<div class="text-muted small">目前沒有待處理的申請</div>`;
    }

    async function onPendingClick(e) {

        const card = e.target.closest("[data-uid]");
        if (!card) return;

        const u = users.find(x => x.LineUserId === card.dataset.uid);

        if (e.target.closest("[data-reset]")) return resetPassword(u);

        const approve = !!e.target.closest("[data-approve]");
        const reject = !!e.target.closest("[data-reject]");
        if (!u || (!approve && !reject)) return;

        const preset = PRESETS[Number(card.querySelector("[data-preset]").value)];

        if (reject && !confirm(`確定拒絕「${u.Name}」的帳號申請？`)) return;

        try {
            await API.call("approveUser", {
                userId: u.LineUserId,
                approve,
                roleList: approve ? preset.codes : undefined
            });

            alert(approve
                ? `✅ 已核准「${u.Name}」（${preset.name}）${preset.codes.length ? "" : "\n目前沒有任何權限，請在下方表格勾選"}`
                : `已拒絕「${u.Name}」的申請`);

            await load();

        } catch (err) {
            App.error(err, "操作失敗");
        }
    }

    // =========================
    // 重設密碼：產生臨時密碼，只顯示這一次
    // =========================
    async function resetPassword(u) {

        if (!u) return;

        if (!confirm(`確定要重設「${u.Name}」的密碼？\n\n・會產生一組臨時密碼（只顯示這一次）\n・對方所有裝置會立即登出\n・對方用臨時密碼登入後必須設定新密碼\n\n請先確認是本人提出的申請。`)) return;

        try {
            const r = await API.call("resetUserPassword", { userId: u.LineUserId });

            try { await navigator.clipboard.writeText(r.tempPassword); } catch { }

            prompt(`✅ 已重設「${r.name}」的密碼（帳號 ${r.phone}）\n請把臨時密碼告訴本人（已嘗試複製到剪貼簿）：`, r.tempPassword);

            await load();

        } catch (err) {
            App.error(err, "重設失敗");
        }
    }

    // =========================
    // 權限表
    // =========================
    function renderHead() {
        dom.accessHead.innerHTML = `
<tr>
    <th>帳號</th>
    <th>狀態</th>
    <th>角色範本</th>
    ${PERMS.map(p => `<th class="perm" title="${App.esc(p.name + "：" + p.desc)}">${App.esc(p.short)}</th>`).join("")}
</tr>`;
    }

    function statusBadge(u, s) {
        if (u.ApprovalStatus === "待審核") return `<span class="badge bg-warning text-dark">待審核</span>`;
        if (u.ApprovalStatus === "已拒絕") return `<span class="badge bg-secondary">已拒絕</span>`;
        return `<div class="form-check form-switch mb-0" title="${s.isActive ? "啟用中" : "已停用"}">
            <input class="form-check-input" type="checkbox" data-active ${s.isActive ? "checked" : ""} ${u.IsMe ? "disabled" : ""}>
            <label class="form-check-label small">${s.isActive ? "啟用" : "停用"}</label></div>`;
    }

    function filtered() {

        const kw = dom.qKeyword.value.trim();
        const st = dom.qStatus.value;

        return users.filter(u => {
            const s = stateOf(u);
            const ok =
                st === "staff" ? (u.RoleList.length > 0 || edits.has(u.LineUserId) || u.ApprovalStatus === "待審核") :
                    st === "active" ? s.isActive && u.ApprovalStatus === "已核准" :
                        st === "inactive" ? !s.isActive && u.ApprovalStatus === "已核准" :
                            st === "pending" ? u.ApprovalStatus === "待審核" :
                                st === "rejected" ? u.ApprovalStatus === "已拒絕" : true;
            return ok && (!kw || [u.Name, u.PhoneNumber, u.Email].some(v => App.like(v, kw)));
        }).sort((a, b) =>
            (b.IsMe - a.IsMe) || (b.RoleList.length > 0) - (a.RoleList.length > 0) || String(a.Name).localeCompare(String(b.Name), "zh-Hant"));
    }

    function renderTable() {

        const esc = App.esc;
        const list = filtered();

        dom.listCount.textContent = `共 ${list.length} 個帳號`;

        dom.accessBody.innerHTML = list.length ? list.map(u => {

            const s = stateOf(u);
            const others = [...s.roles].filter(id => !NAMES[id]);
            const pending = u.ApprovalStatus !== "已核准";

            return `
<tr data-uid="${esc(u.LineUserId)}" class="${isChanged(u) ? "changed" : ""} ${!s.isActive ? "inactive" : ""}">
    <td>
        <div class="fw-bold">${esc(u.Name || "")} ${u.IsMe ? `<span class="badge bg-info">我</span>` : ""}
            ${u.ResetRequestedAt ? `<span class="badge bg-danger">申請重設密碼</span>` : ""}
            ${u.MustChangePassword ? `<span class="badge bg-secondary" title="已發臨時密碼，等待本人改密碼">臨時密碼</span>` : ""}
            ${!u.IsMe && !pending && !(u.RoleList.includes(13) && !iAmAdmin()) ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1" data-reset title="產生臨時密碼">🔑 重設密碼</button>` : ""}</div>
        <div class="small text-muted">${esc(u.PhoneNumber || "")}${others.length ? `　<span title="舊版權限代碼，會保留">其他：${others.join("、")}</span>` : ""}</div>
    </td>
    <td>${statusBadge(u, s)}</td>
    <td>
        <select class="form-select form-select-sm" data-preset ${pending ? "disabled" : ""}>
            <option value="">套用…</option>
            ${PRESETS.map((p, i) => `<option value="${i}" ${p.codes.includes(13) && !iAmAdmin() ? "disabled" : ""}>${esc(p.name)}</option>`).join("")}
        </select>
    </td>
    ${PERMS.map(p => `<td class="perm"><input type="checkbox" class="form-check-input" data-perm="${p.id}"
        ${s.roles.has(p.id) ? "checked" : ""} ${locked(u, p.id) || pending ? "disabled" : ""}
        title="${esc(p.name)}"></td>`).join("")}
</tr>`;
        }).join("") : `<tr><td colspan="${PERMS.length + 3}" class="text-muted">沒有符合的帳號</td></tr>`;

        const changed = users.filter(isChanged).length;
        dom.changeCount.textContent = changed;
        dom.saveBar.classList.toggle("d-none", !changed);
    }

    function onTableChange(e) {

        const tr = e.target.closest("tr[data-uid]");
        if (!tr) return;

        const u = users.find(x => x.LineUserId === tr.dataset.uid);
        if (!u) return;

        const edit = editOf(u);

        if (e.target.matches("[data-perm]")) {
            const id = Number(e.target.dataset.perm);
            if (e.target.checked) edit.roles.add(id);
            else edit.roles.delete(id);
        }

        if (e.target.matches("[data-active]")) edit.isActive = e.target.checked;

        if (e.target.matches("[data-preset]") && e.target.value !== "") {
            const preset = PRESETS[Number(e.target.value)];
            // 保留：舊版代碼、自己鎖住的權限、不能動的「最高」
            const keep = [...edit.roles].filter(id => !NAMES[id] || locked(u, id));
            edit.roles = new Set(keep.concat(preset.codes.filter(id => !locked(u, id))));
        }

        if (!isChanged(u)) edits.delete(u.LineUserId);

        renderTable();
    }

    async function save() {

        const changes = users.filter(isChanged).map(u => {
            const s = stateOf(u);
            return { userId: u.LineUserId, roleList: [...s.roles], isActive: s.isActive };
        });

        if (!changes.length) return;

        const lines = changes.map(c => {
            const u = users.find(x => x.LineUserId === c.userId);
            const names = c.roleList.map(id => NAMES[id] || id).join("、") || "無權限";
            return `・${u.Name}：${c.isActive ? "" : "【停用】"}${names}`;
        });

        if (!confirm(`儲存以下 ${changes.length} 個帳號的權限？\n\n${lines.join("\n")}`)) return;

        try {
            await API.call("setUserAccess", { changes });
            edits.clear();
            alert("✅ 權限已更新（對方下次操作時立即生效）");
            await load();
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    function renderLegend() {
        dom.legendBody.innerHTML = PERMS.map(p =>
            `<tr><td class="text-nowrap fw-bold">${App.esc(p.name)}（${p.id}）</td><td>${App.esc(p.desc)}</td></tr>`).join("");
    }

    return { init };
})();
