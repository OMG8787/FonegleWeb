window.Pages = window.Pages || {};

// =========================================================
// 帳號審核與權限：核准新帳號、勾選每個帳號的模組權限、啟用 / 停用
// =========================================================
Pages.Access = (() => {

    "use strict";

    // 表格上可勾選的權限（順序即欄位順序）
    const PERMS = [
        { id: 13, short: "最高", name: "最高系統管理員", desc: "全部功能與資料（含所有權限）" },
        { id: 3, short: "系統", name: "系統管理", desc: "帳號審核與權限、角色設定、員工及會員、登入紀錄、郵件寄送、代理人" },
        { id: 20, short: "行事曆", name: "行事曆", desc: "行事曆（新增 / 修改活動）、首頁行程提醒" },
        { id: 21, short: "市集", name: "市集營運", desc: "現場點餐、市集報表、出攤紀錄、保證金追蹤、市集報名連結、讀取行事曆" },
        { id: 22, short: "商品", name: "商品與生產", desc: "產品、配方與成本、原料、庫存、生產履歷、產品月盤點、原物料進貨 / 盤點 / 漲幅" },
        { id: 23, short: "銷售", name: "銷售與客戶", desc: "訂單、出貨、客戶 / 合作廠商（含交易統計、開票與收款設定）、庫存助手追蹤清單、讀取產品" },
        { id: 24, short: "財務", name: "財務", desc: "提醒中心（開發票 / 收帳 / 保證金）、帳務（應收）、支出表、品牌攤提、首頁品牌損益與待辦提醒、客戶 / 合作廠商、保證金追蹤、原物料進貨、市集報表與出攤紀錄（唯讀）、月盤點（唯讀）" },
        { id: 25, short: "AI", name: "AI 行銷", desc: "AI 文案發想（可讀取行事曆）" },
        { id: 26, short: "損益", name: "財務總覽", desc: "只能在首頁看到 📊 品牌損益（總損益、活動出攤 / 線上訂單 / B2B 損益），不能使用任何財務功能，也看不到帳款、支出、客戶等明細" },
        { id: 12, short: "刪除", name: "刪除資料", desc: "可以刪除資料（沒有這個權限只能新增與修改）" },
        { id: 16, short: "唯讀", name: "唯讀", desc: "只能查看，不能新增、修改、刪除（優先於其他權限）" }
    ];

    const NAMES = Object.fromEntries(PERMS.map(p => [p.id, p.name]));

    // 角色範本（與權限管理頁相同）
    // 試算表還沒有角色時建立的預設角色（之後可自由修改 / 新增 / 刪除）
    const DEFAULT_ROLES = [
        { RoleName: "👑 老闆", Permissions: "13", Description: "全部功能與資料" },
        { RoleName: "🧑‍💼 店長 / 營運", Permissions: "12|20|21|22|23", Description: "營運相關全部功能（不含財務與系統）" },
        { RoleName: "🎪 市集人員", Permissions: "20|21", Description: "行事曆、現場點餐、出攤紀錄、保證金" },
        { RoleName: "🏭 生產人員", Permissions: "20|22", Description: "產品、配方、原料、庫存、生產" },
        { RoleName: "💼 會計", Permissions: "23|24", Description: "訂單、客戶、帳務、支出、提醒中心" },
        { RoleName: "📣 行銷", Permissions: "20|25", Description: "行事曆、AI 文案" },
        { RoleName: "👀 唯讀", Permissions: "16|20|21|22", Description: "只能查看" },
        { RoleName: "🚫 無權限", Permissions: "", Description: "只能使用首頁、備忘錄與帳號設定" }
    ].map((r, i) => ({ ...r, SortOrder: i + 1 }));

    // 角色（Roles 工作表）：{ ID, RoleName, Permissions: "20|21", Description }
    let roles = [];
    let editingRole = null;     // null = 沒在編輯；{} = 新增；角色物件 = 修改

    const codesOf = r => String(r?.Permissions || "").split(/[|,、]/).map(Number).filter(n => n > 0);
    const roleById = id => roles.find(r => String(r.ID) === String(id));

    const dom = {};

    let users = [];
    let edits = new Map();   // LineUserId → { roles: Set, isActive, roleId }
    const iAmAdmin = () => Auth.hasPermission(13) && Auth.getRoleList().includes(13);

    async function init() {

        ["pendingCard", "pendingList", "pendingCount", "qKeyword", "qStatus", "listCount", "accessHead", "accessBody",
            "saveBar", "changeCount", "btnRevert", "btnSave", "legendBody",
            "roleBody", "roleEditor", "roleEditorTitle", "roleName", "roleDesc", "rolePerms", "btnRoleNew", "btnRoleSave", "btnRoleCancel", "btnRoleDelete"]
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

        dom.btnRoleNew.addEventListener("click", () => openRoleEditor({}));
        dom.btnRoleCancel.addEventListener("click", () => openRoleEditor(null));
        dom.btnRoleSave.addEventListener("click", saveRole);
        dom.btnRoleDelete.addEventListener("click", deleteRole);
        dom.roleBody.addEventListener("click", e => {
            const b = e.target.closest("[data-role-edit]");
            if (b) openRoleEditor(roleById(b.dataset.roleEdit));
        });

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
            const [list, roleRows] = await Promise.all([Auth.request("accessList"), API.list("Roles", null, { fresh: true })]);
            users = list;
            roles = sortRoles(roleRows || []);
            if (!roles.length) await seedRoles();
            renderRoles();
            renderPending();
            renderTable();
        } catch (err) {
            App.error(err, "載入帳號失敗");
        }
    }

    function sortRoles(list) {
        return list.slice().sort((a, b) => (App.num(a.SortOrder) || 999) - (App.num(b.SortOrder) || 999) || App.num(a.ID) - App.num(b.ID));
    }

    // 試算表還沒有角色：建立預設角色
    async function seedRoles() {
        try {
            const rows = await API.batch(DEFAULT_ROLES
                .filter(r => iAmAdmin() || !codesOf(r).includes(13))
                .map(r => ({ action: "insert", table: "Roles", data: r })), { silent: true });
            roles = sortRoles(rows.filter(Boolean));
        } catch (err) {
            console.warn("建立預設角色失敗", err);
        }
    }

    // =========================
    // 角色設定
    // =========================
    function roleUsers(r) {
        return users.filter(u => String(u.RoleTemplateId) === String(r.ID));
    }

    function renderRoles() {

        const esc = App.esc;

        dom.roleBody.innerHTML = roles.length ? roles.map(r => {
            const codes = codesOf(r);
            return `
<tr>
    <td><div class="fw-bold">${esc(r.RoleName || "")}</div><div class="small text-muted">${esc(r.Description || "")}</div></td>
    <td>${codes.length ? codes.map(id => `<span class="badge bg-light text-dark border me-1">${esc(NAMES[id] || id)}</span>`).join("") : `<span class="text-muted small">無權限</span>`}</td>
    <td class="text-center">${roleUsers(r).length}</td>
    <td class="text-end">${codes.includes(13) && !iAmAdmin() ? "" : `<button type="button" class="btn btn-sm btn-outline-primary" data-role-edit="${esc(r.ID)}">✏️ 編輯</button>`}</td>
</tr>`;
        }).join("") : `<tr><td colspan="4" class="text-muted">還沒有角色，按「新增角色」建立</td></tr>`;

        // 帳號表的角色選單也要更新
        renderTable();
    }

    function openRoleEditor(r) {

        editingRole = r;
        dom.roleEditor.classList.toggle("d-none", !r);
        if (!r) return;

        const codes = new Set(codesOf(r));
        dom.roleEditorTitle.textContent = r.ID ? `編輯角色：${r.RoleName}` : "新增角色";
        dom.roleName.value = r.RoleName || "";
        dom.roleDesc.value = r.Description || "";
        dom.btnRoleDelete.classList.toggle("d-none", !r.ID);
        dom.rolePerms.innerHTML = PERMS.map(p => `
<label class="form-check mb-0" title="${App.esc(p.desc)}">
    <input class="form-check-input" type="checkbox" value="${p.id}" ${codes.has(p.id) ? "checked" : ""} ${p.id === 13 && !iAmAdmin() ? "disabled" : ""}>
    <span class="form-check-label small">${App.esc(p.name)}</span>
</label>`).join("");
        dom.roleName.focus();
        dom.roleEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async function saveRole() {

        const name = dom.roleName.value.trim();
        if (!name) return alert("請輸入角色名稱");
        if (roles.some(r => r.RoleName === name && (!editingRole.ID || String(r.ID) !== String(editingRole.ID))))
            return alert(`已經有「${name}」這個角色`);

        const codes = [...dom.rolePerms.querySelectorAll("input:checked")].map(i => Number(i.value));
        const data = { RoleName: name, Description: dom.roleDesc.value.trim(), Permissions: codes.join("|") };

        try {
            let row;
            if (editingRole.ID) {
                row = await API.update("Roles", editingRole.ID, data, { loadingText: "儲存角色中…" });
                roles = sortRoles(roles.map(r => String(r.ID) === String(row.ID) ? row : r));
            } else {
                data.SortOrder = roles.reduce((m, r) => Math.max(m, App.num(r.SortOrder)), 0) + 1;
                row = await API.insert("Roles", data, { loadingText: "新增角色中…" });
                roles = sortRoles(roles.concat(row));
            }
            openRoleEditor(null);
            renderRoles();
            await syncRoleUsers(row);
        } catch (err) {
            App.error(err, "儲存角色失敗");
        }
    }

    // 角色權限改了：詢問是否同步到使用這個角色的帳號
    async function syncRoleUsers(role) {

        const codes = codesOf(role);
        const targets = roleUsers(role).filter(u => {
            const want = new Set(u.RoleList.filter(id => !NAMES[id] || locked(u, id)).concat(codes.filter(id => !locked(u, id))));
            return [...want].sort().join("|") !== [...u.RoleList].sort().join("|");
        });

        if (!targets.length) return;
        if (!confirm(`有 ${targets.length} 個帳號使用「${role.RoleName}」：\n${targets.map(u => "・" + u.Name).join("\n")}\n\n要把他們的權限一起更新成這個角色的設定嗎？`)) return;

        try {
            await API.call("setUserAccess", {
                changes: targets.map(u => ({
                    userId: u.LineUserId,
                    roleList: u.RoleList.filter(id => !NAMES[id] || locked(u, id)).concat(codes.filter(id => !locked(u, id))),
                    roleId: role.ID
                }))
            });
            alert(`✅ 已更新 ${targets.length} 個帳號的權限`);
            await load();
        } catch (err) {
            App.error(err, "同步帳號權限失敗");
        }
    }

    async function deleteRole() {

        const r = editingRole;
        if (!r || !r.ID) return;
        const n = roleUsers(r).length;
        if (!confirm(`確定刪除角色「${r.RoleName}」？${n ? `\n\n有 ${n} 個帳號使用這個角色，他們目前的權限會保留，只是不再標示角色。` : ""}`)) return;

        try {
            await API.remove("Roles", r.ID, { loadingText: "刪除角色中…" });
            roles = roles.filter(x => String(x.ID) !== String(r.ID));
            openRoleEditor(null);
            renderRoles();
        } catch (err) {
            App.error(err, "刪除失敗");
        }
    }

    // =========================
    // 目前狀態（套用未儲存的修改）
    // =========================
    function stateOf(u) {
        const e = edits.get(u.LineUserId);
        return {
            roles: e ? e.roles : new Set(u.RoleList),
            isActive: e ? e.isActive : u.IsActive,
            roleId: e ? e.roleId : (u.RoleTemplateId ?? null)
        };
    }

    function isChanged(u) {
        const s = stateOf(u);
        const a = [...s.roles].sort().join("|");
        const b = [...u.RoleList].sort().join("|");
        return a !== b || s.isActive !== u.IsActive || String(s.roleId ?? "") !== String(u.RoleTemplateId ?? "");
    }

    function editOf(u) {
        if (!edits.has(u.LineUserId)) {
            const s = stateOf(u);
            edits.set(u.LineUserId, { roles: new Set(s.roles), isActive: s.isActive, roleId: s.roleId });
        }
        return edits.get(u.LineUserId);
    }

    // 角色選單（沒有權限設定「最高管理員」的人，不能選含最高管理員的角色）
    function roleOptions(selected, withBlank) {
        return (withBlank ? `<option value="">（自訂 / 未指定）</option>` : "") + roles.map(r =>
            `<option value="${App.esc(r.ID)}" ${String(selected) === String(r.ID) ? "selected" : ""} ${codesOf(r).includes(13) && !iAmAdmin() ? "disabled" : ""}>${App.esc(r.RoleName)}</option>`).join("");
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
        ${roleOptions((roles.find(r => !codesOf(r).length) || {}).ID, false)}
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

        const role = roleById(card.querySelector("[data-preset]").value) || { RoleName: "無權限", ID: null };
        const preset = { name: role.RoleName, codes: codesOf(role), id: role.ID };

        if (reject && !confirm(`確定拒絕「${u.Name}」的帳號申請？`)) return;

        try {
            await API.call("approveUser", {
                userId: u.LineUserId,
                approve,
                roleList: approve ? preset.codes : undefined,
                roleId: approve ? preset.id : undefined
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
    <th>角色</th>
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
            ${roleOptions(s.roleId, true)}
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
            // 手動改了權限：跟角色設定不同時，標示為自訂
            const r = roleById(edit.roleId);
            if (r && codesOf(r).sort().join("|") !== [...edit.roles].filter(x => NAMES[x]).sort().join("|")) edit.roleId = null;
        }

        if (e.target.matches("[data-active]")) edit.isActive = e.target.checked;

        if (e.target.matches("[data-preset]")) {
            const role = roleById(e.target.value);
            edit.roleId = role ? role.ID : null;
            if (role) {
                // 保留：舊版代碼、自己鎖住的權限、不能動的「最高」
                const keep = [...edit.roles].filter(id => !NAMES[id] || locked(u, id));
                edit.roles = new Set(keep.concat(codesOf(role).filter(id => !locked(u, id))));
            }
        }

        if (!isChanged(u)) edits.delete(u.LineUserId);

        renderTable();
    }

    async function save() {

        const changes = users.filter(isChanged).map(u => {
            const s = stateOf(u);
            return { userId: u.LineUserId, roleList: [...s.roles], isActive: s.isActive, roleId: s.roleId ?? null };
        });

        if (!changes.length) return;

        const lines = changes.map(c => {
            const u = users.find(x => x.LineUserId === c.userId);
            const names = c.roleList.map(id => NAMES[id] || id).join("、") || "無權限";
            const role = roleById(c.roleId);
            return `・${u.Name}：${c.isActive ? "" : "【停用】"}${role ? `［${role.RoleName}］` : ""}${names}`;
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
