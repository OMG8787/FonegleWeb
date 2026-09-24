window.Pages = window.Pages || {};

Pages.Permission = (() => {

    "use strict";

    const dom = {};

    const selectedMembers = [];
    const selectedPermissions = [];
    const selectedRoleMembers = [];

    let preload = {};

    // =========================================
    // init
    // =========================================
    async function init() {

        cacheDom();

        if (!isAdmin())
            document.getElementById("connectionItem")?.remove();

        bindEvents();

        // 一次取回所有需要的資料表
        try {
            preload = await API.getMany(["Users", "ID_Permission", "ID_UserRoles"]);
        } catch (err) {
            App.error(err, "載入資料失敗");
        }

        await loadMembers();

        await loadPermissions();

        renderPresets();
        renderPermissions();

        await loadRoles();
    }

    async function getList(table) {

        if (preload[table]) {
            const list = preload[table];
            delete preload[table];
            return list;
        }

        return API.list(table);
    }

    // =========================================
    // DOM
    // =========================================
    function cacheDom() {

        dom.permissionArea =
            document.getElementById("permissionArea");

        dom.memberInput =
            document.getElementById("memberInput");

        dom.memberSelect =
            document.getElementById("memberSelect");

        dom.memberList =
            document.getElementById("memberList");

        dom.permissionSelect =
            document.getElementById("permissionSelect");

        dom.permissionList =
            document.getElementById("permissionList");

        // Role
        dom.roleArea =
            document.getElementById("roleArea");

        dom.roleMemberInput =
            document.getElementById("roleMemberInput");

        dom.roleMemberSelect =
            document.getElementById("roleMemberSelect");

        dom.roleMemberList =
            document.getElementById("roleMemberList");

        dom.roleSelect =
            document.getElementById("roleSelect");

        dom.rolePreviewList =
            document.getElementById("rolePreviewList");
    }

    // =========================================
    // Events
    // =========================================
    function bindEvents() {

        document.querySelector("#btnTogglePermission")
            ?.closest(".setting-header")
            .addEventListener("click", togglePermissionArea);

        document.getElementById("btnAddMember")
            ?.addEventListener("click", addMember);

        document.getElementById("btnAddPermission")
            ?.addEventListener("click", addPermission);

        document.getElementById("btnSubmitPermission")
            ?.addEventListener("click", submitPermission);

        document.querySelector("#btnToggleRole")
            ?.closest(".setting-header")
            .addEventListener("click", toggleRoleArea);

        document.getElementById("btnAddRoleMember")
            ?.addEventListener("click", addRoleMember);

        document.getElementById("btnAddRole")
            ?.addEventListener("click", addRole);

        document.getElementById("btnSubmitRole")
            ?.addEventListener("click", submitRole);

        document.querySelector("#btnToggleConnection")
            ?.closest(".setting-header")
            .addEventListener("click", toggleConnectionArea);

        document.getElementById("btnConnTest")
            ?.addEventListener("click", () => testConnection(false));

        document.getElementById("btnConnSave")
            ?.addEventListener("click", () => testConnection(true));

        document.getElementById("btnConnReset")
            ?.addEventListener("click", resetConnection);
    }

    // =========================================
    // Toggle Area
    // =========================================
    // =========================================
    // Toggle Area
    // =========================================
    function closeAllAreas() {

        dom.permissionArea.classList.add("d-none");
        dom.roleArea.classList.add("d-none");
        document.getElementById("connectionArea")?.classList.add("d-none");

        document.getElementById("btnTogglePermission").innerText = "▶";
        document.getElementById("btnToggleRole").innerText = "▶";

        const t = document.getElementById("btnToggleConnection");
        if (t) t.innerText = "▶";
    }

    // =========================================
    // 資料庫連線設定（僅管理員）
    // =========================================
    const CONN_KEY = "fonegle_gas_url";
    const CONN_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

    function isAdmin() {
        return Auth.hasPermission(3, 13);
    }

    function toggleConnectionArea() {

        const area = document.getElementById("connectionArea");
        const isHidden = area.classList.contains("d-none");

        closeAllAreas();

        if (isHidden) {
            area.classList.remove("d-none");
            document.getElementById("btnToggleConnection").innerText = "▼";
            renderConnection();
        }
    }

    function renderConnection() {

        const s = window.APP_SETTINGS;
        const source = document.getElementById("connSource");

        document.getElementById("connCurrent").textContent = s.GAS_URL || "（未設定）";
        document.getElementById("connUrl").value = s.GAS_URL || "";

        source.textContent = s.GAS_SOURCE === "override" ? "此瀏覽器自訂" : "預設（settings.js）";
        source.className = "badge ms-1 " + (s.GAS_SOURCE === "override" ? "bg-warning text-dark" : "bg-secondary");
    }

    function showConnResult(ok, text) {

        const el = document.getElementById("connResult");
        el.className = "small mt-2 " + (ok ? "text-success" : "text-danger");
        el.textContent = text;
    }

    async function testConnection(apply) {

        if (!isAdmin()) return;

        const url = document.getElementById("connUrl").value.trim();

        if (!CONN_PATTERN.test(url)) {
            showConnResult(false, "網址格式不正確，應為 https://script.google.com/macros/s/.../exec");
            return;
        }

        showConnResult(true, "連線測試中...");

        try {

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "ping" })
            });

            const data = await res.json();

            if (data?.data !== "pong")
                throw new Error("回應不正確，請確認是本系統的 Apps Script 網址");

        } catch (err) {

            showConnResult(false, "連線失敗：" + (err.message || err) + "（請確認已部署為網頁應用程式，存取權為「所有人」）");
            return;
        }

        if (!apply) {
            showConnResult(true, "✅ 連線成功");
            return;
        }

        if (url === window.APP_SETTINGS.GAS_URL_DEFAULT) {
            resetConnection();
            return;
        }

        if (!confirm("確定此瀏覽器改用這個網址？\n\n切換到不同的試算表後需要重新登入。"))
            return;

        localStorage.setItem(CONN_KEY, url);

        alert("✅ 已套用，請重新登入");
        Auth.logout();
    }

    function resetConnection() {

        if (!isAdmin()) return;

        const had = localStorage.getItem(CONN_KEY);

        localStorage.removeItem(CONN_KEY);

        if (had && had !== window.APP_SETTINGS.GAS_URL_DEFAULT) {
            alert("✅ 已改回預設網址，請重新登入");
            Auth.logout();
            return;
        }

        window.APP_SETTINGS.GAS_URL = window.APP_SETTINGS.GAS_URL_DEFAULT;
        window.APP_SETTINGS.GAS_SOURCE = "settings";
        renderConnection();
        showConnResult(true, "目前已是預設網址");
    }

    function togglePermissionArea() {

        const isHidden =
            dom.permissionArea.classList.contains("d-none");

        closeAllAreas();

        if (isHidden) {

            dom.permissionArea.classList.remove("d-none");

            document.getElementById("btnTogglePermission").innerText = "▼";
        }
    }

    function toggleRoleArea() {

        const isHidden =
            dom.roleArea.classList.contains("d-none");

        closeAllAreas();

        if (isHidden) {

            dom.roleArea.classList.remove("d-none");

            document.getElementById("btnToggleRole").innerText = "▼";
        }
    }
    // =========================================
    // 載入成員
    // =========================================
    async function loadMembers() {

        try {

            const list = (await getList("Users"))
                .filter(u => u.IsWeb === true)
                .sort((a, b) => String(a.Name).localeCompare(String(b.Name), "zh-Hant"))
                .map(u => ({ userId: u.LineUserId, name: `${u.Name}（${u.LineUserId}）` }));

            renderSelect(dom.memberSelect, list, "userId", "name", "請選擇成員");
            renderSelect(dom.roleMemberSelect, list, "userId", "name", "請選擇成員");

        } catch (err) {

            console.error(err);
        }
    }

    // =========================================
    // 載入權限
    // =========================================
    async function loadPermissions() {

        try {

            const list = (await getList("ID_Permission"))
                .map(p => ({ permissionId: p.ID, permissionName: `${p.ID} - ${p.Permission}` }));

            renderSelect(dom.permissionSelect, list, "permissionId", "permissionName", "請選擇權限");

        } catch (err) {

            console.error(err);
        }
    }

    // =========================================
    // 載入角色
    // =========================================
    async function loadRoles() {

        try {

            const list = (await getList("ID_UserRoles"))
                .map(r => ({ roleId: r.ID, roleName: `${r.ID} - ${r.RoleName}` }));

            renderSelect(dom.roleSelect, list, "roleId", "roleName", "請選擇角色");

        } catch (err) {

            console.error(err);
        }
    }


    // =========================================
    // 加入成員
    // =========================================
    function addMember() {

        const value =
            dom.memberInput.value.trim()
            || dom.memberSelect.value;

        if (!value)
            return;

        if (selectedMembers.includes(value))
            return;

        selectedMembers.push(value);

        renderMembers();

        dom.memberInput.value = "";
    }

    function renderMembers() {

        dom.memberList.innerHTML =
            selectedMembers.join("<br>");
    }

    // =========================================
    // 加入權限
    // =========================================
    function addPermission() {

        const value =
            dom.permissionSelect.value;

        if (!value)
            return;

        if (selectedPermissions.includes(value))
            return;

        selectedPermissions.push(value);

        renderPermissions();
    }

    // 角色範本：常見的權限組合
    const PRESETS = [
        { name: "👑 老闆", codes: ["13"], hint: "最高系統管理員，全部功能" },
        { name: "🧑‍💼 店長 / 營運", codes: ["20", "21", "22", "23", "12"], hint: "行事曆、市集、商品生產、銷售，含刪除" },
        { name: "🎪 市集人員", codes: ["20", "21"], hint: "行事曆、現場點餐、出攤紀錄" },
        { name: "🏭 生產人員", codes: ["20", "22"], hint: "行事曆、產品、配方成本、原料、庫存" },
        { name: "💼 會計", codes: ["24", "23"], hint: "帳務、支出、攤提，並可查看訂單與店家" },
        { name: "📣 行銷", codes: ["20", "25"], hint: "行事曆與 AI 文案" },
        { name: "👀 唯讀", codes: ["20", "21", "22", "16"], hint: "只能查看，不能新增修改刪除" }
    ];

    function permissionName(code) {
        const opt = [...dom.permissionSelect.options].find(o => o.value === String(code));
        return opt ? opt.textContent.trim() : String(code);
    }

    function renderPresets() {

        const box = document.getElementById("presetButtons");
        if (!box) return;

        box.innerHTML = PRESETS.map((p, i) =>
            `<button type="button" class="btn btn-sm btn-outline-primary" data-preset="${i}" title="${App.esc(p.hint)}">${App.esc(p.name)}</button>`
        ).join("");

        box.addEventListener("click", e => {
            const btn = e.target.closest("[data-preset]");
            if (!btn) return;
            const preset = PRESETS[Number(btn.dataset.preset)];
            selectedPermissions.length = 0;
            preset.codes.forEach(c => selectedPermissions.push(c));
            document.getElementById("presetHint").textContent = `${preset.name}：${preset.hint}`;
            renderPermissions();
        });

        document.getElementById("btnClearPermission")?.addEventListener("click", () => {
            selectedPermissions.length = 0;
            renderPermissions();
        });
    }

    function renderPermissions() {

        dom.permissionList.innerHTML = selectedPermissions.length
            ? selectedPermissions.map(c => App.esc(permissionName(c))).join("<br>")
            : `<span class="text-muted small">尚未選擇</span>`;
    }

    function addRoleMember() {

        const value =
            dom.roleMemberInput.value.trim()
            || dom.roleMemberSelect.value;

        if (!value)
            return;

        if (selectedRoleMembers.includes(value))
            return;

        selectedRoleMembers.push(value);

        renderRoleMembers();

        dom.roleMemberInput.value = "";
    }

    function renderRoleMembers() {

        dom.roleMemberList.innerHTML =
            selectedRoleMembers.join("<br>");
    }

    function addRole() {

        renderRolePreview();
    }

    function renderRolePreview() {

        const role =
            dom.roleSelect.value;

        if (!role)
            return;

        const html =
            selectedRoleMembers.map(member => {

                return `
<div class="border rounded p-2 mb-2 bg-white">

ID: ${member}
<br>
崗位編號 : 將工作岡位改成ID: ${role}

</div>
`;

            }).join("");

        dom.rolePreviewList.innerHTML = html;
    }


    // =========================================
    // 送出權限
    // =========================================
    async function submitPermission() {

        if (!selectedMembers.length) {

            alert("請選擇成員");
            return;
        }

        if (!selectedPermissions.length) {

            alert("請選擇權限");
            return;
        }

        const preview =
            selectedMembers.map(member => {

                return `姓名 : ${member} 權限 : [${selectedPermissions.join("、")}]`;

            }).join("\n");

        const ok = confirm(`
確認批次權限修改？

${preview}
    `);

        if (!ok)
            return;

        try {

            setLoading(true);

            await API.batch(selectedMembers.map(member => ({
                action: "update",
                table: "Users",
                id: member,
                data: { RoleList: selectedPermissions.join("|") }
            })));

            alert("批次權限修改成功");

        } catch (err) {

            App.error(err, "批次權限修改失敗");

        } finally {

            setLoading(false);
        }
    }

    async function submitRole() {

        const role =
            dom.roleSelect.value;

        if (!selectedRoleMembers.length) {

            alert("請選擇成員");
            return;
        }

        if (!role) {

            alert("請選擇角色");
            return;
        }

        const preview =
            selectedRoleMembers.map(member => {

                return `ID: ${member} 崗位編號 : 將工作岡位改成ID: ${role}`;

            }).join("\n");

        const ok = confirm(`
確認批次修改單一資料？

${preview}
    `);

        if (!ok)
            return;

        try {

            setLoading(true);

            await API.batch(selectedRoleMembers.map(member => ({
                action: "update",
                table: "Users",
                id: member,
                data: { RoleId: Number(role) }
            })));

            alert("角色修改成功");

        } catch (err) {

            App.error(err, "角色修改失敗");

        } finally {

            setLoading(false);
        }
    }
    // =========================================
    // 下拉選單
    // =========================================
    function renderSelect(select, list, valueKey, textKey, defaultText = "請選擇") {

        if (!select)
            return;

        select.innerHTML = "";
        select.add(new Option(defaultText, ""));

        list.forEach(item => select.add(new Option(item[textKey], item[valueKey])));
    }

    // =========================================
    // Loading
    // =========================================
    function setLoading(flag) {

        document.body.style.cursor =
            flag ? "wait" : "default";
    }

    return {
        init
    };

})();