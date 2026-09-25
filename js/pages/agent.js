window.Pages = window.Pages || {};

Pages.AgentSetting = (() => {

    const dom = {};
    let currentAgentList = [];
    let editAgentId = null;
    let currentUser = {
        id: "",
        name: "",
        no: ""
    };
    let permissionTools = [];
    // toolId → { isAllow, rowId }
    let originalPermissions = {};

    // =====================
    function init() {

        cacheDom();
        render();
        bind();
    }

    function mapTool(t) {

        return {
            id: Number(t.Id),
            name: t.ToolName,
            agentToolName: t.AgentToolName,
            isEnable: t.IsEnable === true
        };
    }

    function yesNo(v) {
        return v === true ? "✔" : "✘";
    }

    function renderAgentTable(list) {

        const tbody =
            document.getElementById("agentTableBody");

        if (!tbody)
            return;

        const esc = App.esc;

        tbody.innerHTML = (list || []).map(item => `
        <tr>

            <td>${esc(item.Id)}</td>

            <td>${esc(item.TargetlineUserId)}</td>
            <td>${esc(item.userName)}</td>

            <td>${esc(item.AgentKey)}</td>
            <td>${esc(item.AgentToolsProfileName)}</td>

            <td>${esc(item.OpenClawAgentId)}</td>

            <td>${esc(item.ModelName)}</td>

            <td>${yesNo(item.IsEnable)}</td>

            <td>${yesNo(item.AllowMemory)}</td>

            <td>${esc(item.MaxMemoryCount ?? "")}</td>

            <td>${esc(item.MemoryExpireDays ?? "")}</td>

            <td>${esc(item.openClaw)}</td>

            <td>
                <button
                    class="btn btn-sm btn-warning btn-edit-agent"
                    data-id="${esc(item.Id)}">
                    編輯
                </button>
            </td>

        </tr>
    `).join("");

        tbody
            .querySelectorAll(".btn-edit-agent")
            .forEach(btn => {
                btn.addEventListener("click", () => editAgent(Number(btn.dataset.id)));
            });
    }

    function editAgent(id) {

        const row =
            currentAgentList.find(x => x.Id === id);

        if (!row)
            return;

        editAgentId = id;

        const set = (elId, v) => document.getElementById(elId).value = v ?? "";

        set("targetlineUserId", row.TargetlineUserId);
        set("agentKey", row.AgentKey);
        set("agentToolsProfileName", (row.AgentToolsProfileName || "").toLowerCase());
        set("openClawAgentId", row.OpenClawAgentId);
        set("workspacePath", row.WorkspacePath);
        set("userProfilePath", row.UserProFilePath);
        set("modelName", row.ModelName);
        set("sessionScope", row.SessionScope);
        set("sandboxMode", row.SandboxMode);
        set("workspaceAccess", row.WorkspaceAccess);

        document.getElementById("agentEnable").checked = row.IsEnable === true;
        document.getElementById("allowMemory").checked = row.AllowMemory === true;

        set("maxMemoryCount", row.MaxMemoryCount ?? 0);
        set("memoryExpireDays", row.MemoryExpireDays ?? 0);

        document.getElementById("agentForm")
            .classList.remove("d-none");

        document.getElementById("btnToggleAgentForm")
            .innerText = "收合";

        document.getElementById("btnSaveAgent")
            .innerText = "更新代理人";

        document.getElementById("agentForm")
            .scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
    }


    async function loadPermissionTools() {

        try {

            permissionTools =
                (await API.list("ID_AgentTool")).map(mapTool);

            renderPermissions();

        } catch (err) {

            App.error(err, "工具清單載入失敗");
        }
    }

    // DOM 綁定
    function cacheDom() {
        dom.userId = document.getElementById("agentUserId");
        dom.permissionList = document.getElementById("permissionList");

        dom.agentForm = document.getElementById("agentForm");
        dom.toolList = document.getElementById("toolList");

        dom.queryUserInfo =
            document.getElementById("queryUserInfo");

        dom.queryUserName =
            document.getElementById("queryUserName");

        dom.queryUserNo =
            document.getElementById("queryUserNo");
    }

    // =====================
    function render() {
        renderPermissions();
    }

    function renderPermissions() {

        dom.permissionList.innerHTML =
            permissionTools.map(t => `
        <div class="list-group-item ${!t.isEnable ? 'border border-danger' : ''}">

            <div class="d-flex justify-content-between align-items-center">

                <div>
                    <div class="fw-bold">${App.esc(t.name)}</div>
                    <small class="text-muted d-block">
    ${App.esc(t.agentToolName)}
</small>

${!t.isEnable
                    ? `<small class="text-danger fw-bold">
            ⚠ 此功能已從工具總開關關閉
            </small>`
                    : ""
                }
                </div>

                <div class="form-check form-switch">

                    <input
                        class="form-check-input permission-checkbox"
                        type="checkbox"
                        id="tool_${t.id}"
                        >

                </div>

            </div>

        </div>
    `).join("");
    }



    // =====================
    function bind() {

        document.getElementById("btnQueryAgent")
            ?.addEventListener("click", queryPermission);

        document.getElementById("btnSubmitPermission")
            ?.addEventListener("click", submitPermission);

        document.addEventListener("change", guardChange);

        document.getElementById("btnToggleAgentForm")
            ?.addEventListener("click", () => {

                const form =
                    document.getElementById("agentForm");

                form.classList.toggle("d-none");

                document.getElementById("btnToggleAgentForm")
                    .innerText =
                    form.classList.contains("d-none")
                        ? "展開"
                        : "收合";
            });

        document.getElementById("btnCreateAgent")
            ?.addEventListener("click", () => {

                editAgentId = null;

                document.getElementById("btnSaveAgent")
                    .innerText = "儲存代理人資料";

                // 清空表單
                ["targetlineUserId", "agentKey", "agentToolsProfileName", "openClawAgentId",
                    "workspacePath", "userProfilePath", "modelName", "sessionScope",
                    "sandboxMode", "workspaceAccess", "maxMemoryCount", "memoryExpireDays"]
                    .forEach(id => document.getElementById(id).value = "");

                document.getElementById("agentEnable").checked = false;
                document.getElementById("allowMemory").checked = false;

                // 清空查詢結果表格
                currentAgentList = [];

                const tbody =
                    document.getElementById("agentTableBody");

                if (tbody)
                    tbody.innerHTML = "";

                // 強制展開
                dom.agentForm.classList.remove("d-none");

                document.getElementById("btnToggleAgentForm")
                    .innerText = "收合";

                document.getElementById("targetlineUserId")
                    .focus();

                document.getElementById("agentForm")
                    .scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

            });

        document.getElementById("btnSearchAgent")
            ?.addEventListener("click", searchAgent);

        document.getElementById("btnSaveAgent")
            ?.addEventListener("click", saveAgent);


        document.getElementById("btnCreateTool")
            ?.addEventListener("click", () => {

                const form = document.getElementById("toolForm");
                form.classList.toggle("d-none");

                delete document.getElementById("btnSaveTool").dataset.editId;

                if (!form.classList.contains("d-none")) {
                    document.getElementById("toolName").focus();
                }
            });

        document.getElementById("btnSaveTool")
            ?.addEventListener("click", saveTool);

    }

    // =====================
    // 三區塊只能開一個 + toggle icon
    // =====================
    function toggle(el, id) {

        const target = document.getElementById(id);
        const all = ["area_permission", "area_agent", "area_db"];

        const isOpen = !target.classList.contains("d-none");

        all.forEach(a => {
            if (a !== id)
                document.getElementById(a)?.classList.add("d-none");
        });

        document.querySelectorAll(".toggle-arrow")
            .forEach(a => a.innerText = "▶");

        if (isOpen) {

            target.classList.add("d-none");
            el.querySelector(".toggle-arrow").innerText = "▶";

        } else {

            target.classList.remove("d-none");
            el.querySelector(".toggle-arrow").innerText = "▼";

            switch (id) {

                case "area_permission":
                    loadPermissionTools();
                    break;

                case "area_db":
                    searchTool();
                    break;
            }
        }
    }

    // =====================
    // 防呆：未查詢 ID 禁止操作
    // =====================
    function requireUserId() {

        if (!currentUser.id) {

            alert("請先搜尋使用者ID");
            return false;
        }
        return true;
    }

    function guardChange(e) {

        if (!e.target.matches(".permission-checkbox")) {
            return;
        }

        if (!currentUser.id) {

            alert("請先查詢使用者");

            e.target.checked = false;
        }
    }

    // =====================
    // 查詢個人工具權限
    // =====================
    async function queryPermission() {

        const userId = dom.userId.value.trim();

        if (!userId) {

            alert("請輸入使用者ID");
            return;
        }

        try {

            if (!permissionTools.length)
                await loadPermissionTools();

            const [user, perms] = await Promise.all([
                API.get("Users", userId),
                API.list("AgentToolPermissions", { TargetlineUserId: userId })
            ]);

            if (!user) {
                alert("查無此使用者ID");
                return;
            }

            currentUser = {
                id: userId,
                name: user.Name || "",
                no: user.ID ?? ""
            };

            dom.queryUserName.textContent = currentUser.name;
            dom.queryUserNo.textContent = currentUser.no;
            dom.queryUserInfo.classList.remove("d-none");

            applyPermission(perms);

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    function applyPermission(perms) {

        originalPermissions = {};

        permissionTools.forEach(t => {

            const el = document.getElementById(`tool_${t.id}`);

            if (el) el.checked = false;
        });

        perms.forEach(p => {

            const toolId = Number(p.ToolId);

            originalPermissions[toolId] = {
                isAllow: p.IsAllow === true,
                rowId: p.Id
            };

            const el = document.getElementById(`tool_${toolId}`);

            if (el) el.checked = p.IsAllow === true;
        });
    }

    function getChangedPermissions() {

        const result = [];

        permissionTools.forEach(t => {

            const el = document.getElementById(`tool_${t.id}`);

            const current = el?.checked || false;

            const original = originalPermissions[t.id]?.isAllow || false;

            if (current !== original) {

                result.push({
                    ToolId: t.id,
                    IsAllow: current,
                    rowId: originalPermissions[t.id]?.rowId
                });
            }
        });

        return result;
    }

    async function submitPermission() {

        if (!requireUserId())
            return;

        const changes = getChangedPermissions();

        if (changes.length === 0) {

            alert("沒有任何異動");
            return;
        }

        try {

            await API.batch(changes.map(c => c.rowId
                ? {
                    action: "update",
                    table: "AgentToolPermissions",
                    id: c.rowId,
                    data: { IsAllow: c.IsAllow }
                }
                : {
                    action: "insert",
                    table: "AgentToolPermissions",
                    data: {
                        TargetlineUserId: currentUser.id,
                        ToolId: c.ToolId,
                        IsAllow: c.IsAllow
                    }
                }));

            alert(`✅ 已更新 ${changes.length} 項工具權限`);

            applyPermission(
                await API.list("AgentToolPermissions", { TargetlineUserId: currentUser.id }));

        } catch (err) {

            App.error(err, "更新失敗");
        }
    }

    // =====================
    // 代理人帳號管理（查詢）
    // =====================
    async function searchAgent() {

        const userId =
            document.getElementById("searchAgentUserId").value.trim();

        const openClawAgentId =
            document.getElementById("searchOpenClawAgentId").value.trim();

        const status =
            document.getElementById("searchAgentStatus").value;

        const modelName =
            document.getElementById("searchModelName").value.trim();

        try {

            const { AgentConfig: agents, Users: users } =
                await API.getMany(["AgentConfig", "Users"]);

            const userMap = Object.fromEntries(users.map(u => [u.LineUserId, u]));

            const list = agents
                .filter(a =>
                    App.like(a.TargetlineUserId, userId) &&
                    App.like(a.OpenClawAgentId, openClawAgentId) &&
                    App.like(a.ModelName, modelName) &&
                    (!status || (status === "開啟") === (a.IsEnable === true)))
                .map(a => ({
                    ...a,
                    userName: userMap[a.TargetlineUserId]?.Name || "",
                    openClaw: userMap[a.TargetlineUserId]?.OpenClaw || ""
                }));

            currentAgentList = list;

            renderAgentTable(list);

            if (list.length === 0) {
                alert("代理人查詢，共 0 筆符合資料");
            }

        }
        catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    // =====================
    // 新增/修改 AgentConfig
    // =====================
    async function saveAgent() {

        const val = id => document.getElementById(id).value.trim();

        const data = {
            TargetlineUserId: val("targetlineUserId"),
            AgentKey: val("agentKey"),
            AgentToolsProfileName: val("agentToolsProfileName"),
            OpenClawAgentId: val("openClawAgentId"),
            WorkspacePath: val("workspacePath"),
            UserProFilePath: val("userProfilePath"),
            ModelName: val("modelName"),
            SessionScope: val("sessionScope"),
            SandboxMode: val("sandboxMode"),
            WorkspaceAccess: val("workspaceAccess"),
            IsEnable: document.getElementById("agentEnable").checked,
            AllowMemory: document.getElementById("allowMemory").checked,
            MaxMemoryCount: App.numOrNull(val("maxMemoryCount")),
            MemoryExpireDays: App.numOrNull(val("memoryExpireDays"))
        };

        // =====================
        // 防呆
        // =====================
        if (!data.TargetlineUserId) {
            alert("請輸入目標使用者ID");
            return;
        }

        if (!data.AgentToolsProfileName) {
            alert("請輸入 Agent總權限");
            return;
        }

        if (!data.OpenClawAgentId) {
            alert("請輸入 OpenClawAgentId");
            return;
        }

        try {

            const [user, agents] = await Promise.all([
                API.get("Users", data.TargetlineUserId),
                API.list("AgentConfig")
            ]);

            if (!user) {
                alert("建立Agent時找不到綁定使用者，請確認使用者ID");
                return;
            }

            const sameName = agents.some(a =>
                a.OpenClawAgentId === data.OpenClawAgentId && a.Id !== editAgentId);

            if (sameName) {
                alert("🔐 此代理人名稱建立過了");
                return;
            }

            if (editAgentId) {

                await API.update("AgentConfig", editAgentId, data);

                alert("✅ 代理人修改成功");

            } else {

                const created = await API.insert("AgentConfig", data);

                // 把代理人編號寫回使用者（需要會員管理權限，失敗不影響建立）
                try {
                    await API.update("Users", data.TargetlineUserId, { OpenClawAgent: String(created.Id) });
                } catch (e) {
                    console.warn("回寫使用者代理人編號失敗：", e.message);
                }

                alert("🎉 代理人建立成功！");
            }

            document.getElementById("agentForm")
                .classList.add("d-none");

            document.getElementById("btnToggleAgentForm")
                .innerText = "展開";

            editAgentId = null;

            document.getElementById("btnSaveAgent")
                .innerText = "儲存代理人資料";

            await searchAgent();

        } catch (err) {

            App.error(err, "代理人儲存失敗");
        }
    }

    // =====================
    // 工具總表
    // =====================
    async function searchTool() {

        try {

            renderToolList((await API.list("ID_AgentTool")).map(mapTool));

        } catch (err) {

            App.error(err, "工具查詢失敗");
        }
    }

    function renderToolList(list) {

        dom.toolList.innerHTML = (list || []).map(t => `
        <div class="list-group-item">

            <div class="d-flex justify-content-between align-items-center">

                <div>
                    <div class="fw-bold">${App.esc(t.name)}</div>
                    <small class="text-muted">
                        ${App.esc(t.agentToolName)}
                    </small>
                </div>

                <div class="form-check form-switch">
                    <input
                        class="form-check-input tool-toggle"
                        data-id="${t.id}"
                        type="checkbox"
                        ${t.isEnable ? "checked" : ""}
                    >
                </div>

            </div>

        </div>
    `).join("");

        dom.toolList.querySelectorAll(".tool-toggle")
            .forEach(el => {
                el.addEventListener("change", updateToolToggle);
            });
    }

    async function updateToolToggle(e) {

        const id = Number(e.target.dataset.id);

        const isEnable = e.target.checked;

        try {

            await API.update("ID_AgentTool", id, { IsEnable: isEnable });

            alert(`✅ 工具已${isEnable ? "啟用" : "關閉"}`);

            const t = permissionTools.find(x => x.id === id);
            if (t) t.isEnable = isEnable;

        } catch (err) {

            App.error(err, "更新失敗");

            e.target.checked = !isEnable;
        }
    }

    async function saveTool() {

        const toolName = document.getElementById("toolName").value.trim();
        const agentToolName = document.getElementById("agentToolName").value.trim();
        const isEnable = document.getElementById("toolEnable").checked;
        const editId = document.getElementById("btnSaveTool").dataset.editId;

        // =====================
        // 防呆驗證
        // =====================
        if (!toolName) {
            alert("請輸入工具中文名稱");
            return;
        }

        if (!agentToolName) {
            alert("請輸入官方工具名稱");
            return;
        }

        try {

            const data = {
                ToolName: toolName,
                AgentToolName: agentToolName,
                IsEnable: isEnable
            };

            if (editId)
                await API.update("ID_AgentTool", Number(editId), data);
            else
                await API.insert("ID_AgentTool", data);

            alert(editId ? "✅ 工具修改成功" : "🎉 工具建立成功");

            // 清空表單
            document.getElementById("toolName").value = "";
            document.getElementById("agentToolName").value = "";
            document.getElementById("toolEnable").checked = true;
            delete document.getElementById("btnSaveTool").dataset.editId;

            // 關閉表單
            document.getElementById("toolForm").classList.add("d-none");

            await searchTool();

        } catch (err) {

            App.error(err, "工具建立失敗");
        }
    }

    function editTool(id) {

        const t =
            permissionTools.find(x => x.id == id);

        if (!t)
            return;

        document.getElementById("toolName").value =
            t.name;

        document.getElementById("agentToolName").value =
            t.agentToolName;

        document.getElementById("toolEnable").checked =
            t.isEnable;

        document.getElementById("toolForm")
            .classList.remove("d-none");

        document.getElementById("btnSaveTool")
            .dataset.editId = id;
    }

    return {
        init,
        toggle,
        editTool
    };

})();
