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

        bindEvents();

        // 一次取回所有需要的資料表
        try {
            preload = await API.getMany(["Users", "ID_Permission", "ID_UserRoles"]);
        } catch (err) {
            App.error(err, "載入資料失敗");
        }

        await loadMembers();

        await loadPermissions();

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

        document.getElementById("btnTogglePermission").innerText = "▶";
        document.getElementById("btnToggleRole").innerText = "▶";
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

            DataParseHelper.renderSelect(dom.memberSelect, list, "userId", "name", "請選擇成員");
            DataParseHelper.renderSelect(dom.roleMemberSelect, list, "userId", "name", "請選擇成員");

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

            DataParseHelper.renderSelect(dom.permissionSelect, list, "permissionId", "permissionName", "請選擇權限");

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

            DataParseHelper.renderSelect(dom.roleSelect, list, "roleId", "roleName", "請選擇角色");

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

    function renderPermissions() {

        dom.permissionList.innerHTML =
            selectedPermissions.join("<br>");
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