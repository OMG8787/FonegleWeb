window.Pages = window.Pages || {};

Pages.Member = (() => {

    "use strict";

    const dom = {};
    let listCache = [];
    let currentDetail = null;
    let mode = "view";

    function init() {
        cacheDom();
        bindEvents();
        hideForm();
        setModeUI("view");

        loadRoleList(); // ⭐ 新增：載入角色清單
    }

    function cacheDom() {
        dom.editHint = document.getElementById("editHint");
        dom.qIdCard = document.getElementById("qIdCard");
        dom.qName = document.getElementById("qName");
        dom.qPhone = document.getElementById("qPhone");
        dom.qLineId = document.getElementById("qLineId");

        dom.btnSearch = document.getElementById("btnSearch");
        dom.btnCreateTop = document.getElementById("btnCreateTop");
        dom.btnCreate = document.getElementById("btnCreate");
        dom.btnUpdate = document.getElementById("btnUpdate");
        dom.btnClear = document.getElementById("btnClear");

        dom.memberList = document.getElementById("memberList");
        dom.emptyHint = document.getElementById("emptyHint");

        dom.form = document.getElementById("memberForm");
        dom.formSection = dom.form?.closest(".card");

        dom.LineUserId = document.getElementById("LineUserId");
        dom.Name = document.getElementById("Name");
        dom.PhoneNumber = document.getElementById("PhoneNumber");
        dom.IdCardNumber = document.getElementById("IdCardNumber");
        dom.Email = document.getElementById("Email");
        dom.Birthday = document.getElementById("Birthday");

        dom.RoleId = document.getElementById("RoleId");
        dom.AccountManager = document.getElementById("AccountManager");
        dom.PassWord = document.getElementById("PassWord");

        dom.IsPushMessage = document.getElementById("IsPushMessage");
        dom.IsMember = document.getElementById("IsMember");
        dom.IsBlocked = document.getElementById("IsBlocked");
        dom.IsActive = document.getElementById("IsActive");
        dom.IsWeb = document.getElementById("IsWeb");
        dom.IsMailActive = document.getElementById("IsMailActive");
        dom.IsConverted = document.getElementById("IsConverted");

        dom.OpenClaw = document.getElementById("OpenClaw");
        dom.OpenClawAgent = document.getElementById("OpenClawAgent");

        dom.RoleList = document.getElementById("RoleList");
        dom.FavoriteFeaturesList = document.getElementById("FavoriteFeaturesList");
        dom.searchTitle =
            document.getElementById("searchTitle");

        dom.searchCount =
            document.getElementById("searchCount");
    }

    function bindEvents() {

        dom.btnSearch?.addEventListener("click", searchMember);

        dom.btnCreateTop?.addEventListener("click", openCreate);

        // ❗ 修正：新增 = 送出，不是 openCreate
        dom.btnCreate?.addEventListener("click", submitMember);

        dom.btnUpdate?.addEventListener("click", submitMember);

        dom.btnClear?.addEventListener("click", clearForm);

        dom.memberList?.addEventListener("click", async (e) => {

            // 編輯
            const editBtn = e.target.closest(".edit-btn");

            if (editBtn) {

                const card =
                    editBtn.closest(".member-card");

                const item =
                    listCache[card.dataset.index];

                loadDetail(item);
                return;
            }

            // 刪除
            const deleteBtn = e.target.closest(".delete-btn");

            if (deleteBtn) {

                await deleteMember(
                    deleteBtn.dataset.id,
                    deleteBtn.dataset.name
                );
            }

        });
    }

    async function deleteMember(userId, name) {

        if (userId === Config.userId) {
            alert("不可刪除自己的帳號");
            return;
        }

        const ok = confirm(
            `⚠️ 即將永久刪除會員

姓名：
${name}

UserID：
${userId}

此操作無法復原！

是否確定刪除？`
        );

        if (!ok)
            return;

        try {

            await API.remove("Users", userId);

            alert("刪除完成");

            hideForm();
            setModeUI("view");

            await searchMember();

        }
        catch (err) {

            App.error(err, "刪除失敗");

        }

    }


    // =========================
    // ROLE LIST API
    // =========================
    async function loadRoleList() {

        try {

            const list = await API.list("ID_UserRoles");

            dom.RoleId.innerHTML =
                '<option value="">請選擇角色</option>';

            list.forEach(r => {
                dom.RoleId.add(new Option(`${r.ID} - ${r.RoleName}`, r.ID));
            });

        }
        catch (err) {

            console.error(err);

        }
    }

    async function searchMember() {

        try {

            const all = await API.list("Users");

            const q = {
                idCard: dom.qIdCard.value.trim(),
                name: dom.qName.value.trim(),
                phone: dom.qPhone.value.trim(),
                lineId: dom.qLineId.value.trim()
            };

            const list = all
                .filter(u =>
                    App.like(u.IdCardNumber, q.idCard) &&
                    App.like(u.Name, q.name) &&
                    App.like(u.PhoneNumber, q.phone) &&
                    App.like(u.LineUserId, q.lineId))
                .sort((a, b) => (a.ID || 0) - (b.ID || 0));

            listCache = list;

            renderList({
                title: "📌 會員查詢結果",
                count: list.length,
                list
            });

        } catch (err) {

            App.error(err, "查詢會員失敗");
        }
    }

    function renderList(result) {
        const list = result.list;

        dom.searchTitle.textContent =
            result.title;

        dom.searchCount.textContent =
            `符合條件共 ${result.count} 位`;

        dom.memberList.innerHTML = "";

        if (!list.length) {
            dom.emptyHint.classList.remove("d-none");
            return;
        }

        dom.emptyHint.classList.add("d-none");

        list.forEach((u, index) => {

            const div = document.createElement("div");
            div.className = "member-card";
            div.dataset.index = index;

            div.innerHTML = `
    <div class="member-name">${App.esc(u.Name)}</div>
    <div class="member-info">${App.esc(u.PhoneNumber)}</div>
    <div class="member-info">${App.esc(u.Email)}</div>

    <div class="mt-2 d-flex gap-2">

        <button class="btn btn-sm btn-outline-primary edit-btn">
            編輯
        </button>

        <button
            class="btn btn-sm btn-outline-danger delete-btn"
            data-id="${App.esc(u.LineUserId)}"
            data-name="${App.esc(u.Name)}">
            刪除
        </button>

    </div>
`;

            dom.memberList.appendChild(div);
        });
    }

    function setModeUI(newMode) {

        mode = newMode;

        const title =
            dom.formSection.querySelector(".section-header");

        // =====================
        // CREATE
        // =====================
        if (mode === "create") {

            title.innerText = "📝 新增會員";

            dom.editHint.classList.add("d-none");

            // LINE ID 不需要輸入
            dom.LineUserId.value = "";
            dom.LineUserId.readOnly = true;
            dom.LineUserId.disabled = true;

            // 密碼允許輸入
            dom.PassWord.readOnly = false;
            dom.PassWord.disabled = false;

            // 按鈕狀態
            dom.btnCreate.disabled = false;
            dom.btnUpdate.disabled = true;

            dom.btnCreate.classList.remove(
                "btn-secondary"
            );

            dom.btnCreate.classList.add(
                "btn-success"
            );

            dom.btnUpdate.classList.remove(
                "btn-primary"
            );

            dom.btnUpdate.classList.add(
                "btn-secondary"
            );
        }

        // =====================
        // EDIT
        // =====================
        else if (mode === "edit") {

            title.innerText = "📝 編輯會員";

            dom.editHint.classList.remove("d-none");

            // LINE ID 不可修改
            dom.LineUserId.readOnly = true;
            dom.LineUserId.disabled = false;

            // 密碼禁止修改
            dom.PassWord.value = "";
            dom.PassWord.readOnly = true;
            dom.PassWord.disabled = true;

            // 按鈕狀態
            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = false;

            dom.btnCreate.classList.remove(
                "btn-success"
            );

            dom.btnCreate.classList.add(
                "btn-secondary"
            );

            dom.btnUpdate.classList.remove(
                "btn-secondary"
            );

            dom.btnUpdate.classList.add(
                "btn-primary"
            );
        }

        // =====================
        // VIEW
        // =====================
        else {

            title.innerText = "📝 會員資料編輯";

            dom.editHint.classList.add("d-none");

            dom.LineUserId.readOnly = true;
            dom.LineUserId.disabled = false;

            dom.PassWord.readOnly = true;
            dom.PassWord.disabled = true;

            dom.btnCreate.disabled = true;
            dom.btnUpdate.disabled = true;

            dom.btnCreate.classList.remove(
                "btn-success"
            );

            dom.btnUpdate.classList.remove(
                "btn-primary"
            );

            dom.btnCreate.classList.add(
                "btn-secondary"
            );

            dom.btnUpdate.classList.add(
                "btn-secondary"
            );
        }
    }

    function loadDetail(u) {

        currentDetail = u;

        fillForm(u);
        showForm();
        setModeUI("edit");
        scrollToForm();
    }

    function fillForm(u) {

        dom.LineUserId.value = u.LineUserId || "";
        dom.Name.value = u.Name || "";
        dom.PhoneNumber.value = u.PhoneNumber || "";
        dom.IdCardNumber.value = u.IdCardNumber || "";
        dom.Email.value = u.Email || "";

        dom.Birthday.value =
            u.BirthdayYear && u.BirthdayMonth && u.BirthdayDay
                ? `${u.BirthdayYear}-${String(u.BirthdayMonth).padStart(2, "0")}-${String(u.BirthdayDay).padStart(2, "0")}`
                : "";

        dom.RoleId.value = u.RoleId ?? "";
        dom.AccountManager.value = u.AccountManager || "";

        // ❗ 密碼禁止輸入
        dom.PassWord.value = "";
        dom.PassWord.readOnly = true;
        dom.PassWord.disabled = true;

        dom.IsPushMessage.checked = u.IsPushMessage === true;
        dom.IsMailActive.checked = u.IsMailActive === true;
        dom.IsMember.checked = u.IsMember === true;
        dom.IsConverted.checked = u.IsConverted === true;
        dom.IsActive.checked = u.IsActive !== false;
        dom.IsBlocked.checked = u.IsBlocked === true;

        dom.IsWeb.checked = u.IsWeb === true;

        dom.OpenClaw.value = u.OpenClaw || "";
        dom.OpenClawAgent.value = u.OpenClawAgent || "";

        dom.RoleList.value = u.RoleList || "";
        dom.FavoriteFeaturesList.value = u.FavoriteFeaturesList || "";
    }

    function openCreate() {

        currentDetail = null;

        dom.form.reset();

        // 新帳號預設為啟用中的會員
        dom.IsActive.checked = true;
        dom.IsMember.checked = true;

        showForm();

        setModeUI("create");

        scrollToForm();
    }

    function clearForm() {
        dom.form.reset();
        setModeUI("create");
    }

    function showForm() {
        dom.formSection.classList.remove("d-none");
    }

    function scrollToForm() {

        setTimeout(() => {

            dom.formSection.scrollIntoView({

                behavior: "smooth",

                block: "start"

            });

        }, 100);

    }


    function hideForm() {
        dom.formSection.classList.add("d-none");
    }

    async function submitMember() {

        const loginUserId = Config.userId;

        const targetUserId = dom.LineUserId.value;

        if (
            loginUserId === targetUserId &&
            !dom.IsWeb.checked
        ) {

            alert(
                "禁止關閉自己的網站權限，請由其他管理員代為操作。"
            );

            return;
        }

        const data = buildPayload();

        if (mode === "create" && (!data.Name || !data.PhoneNumber)) {
            alert("請輸入姓名與電話");
            return;
        }

        try {

            if (mode === "create") {

                await API.insert("Users", data);
                alert("🎉 會員新增成功");

            } else {

                delete data.PassWord;
                await API.update("Users", targetUserId, data);
                alert("✅ 會員資料修改成功");
            }

            setModeUI("view");
            hideForm();
            await searchMember();

        } catch (err) {

            App.error(err, "儲存失敗");
        }
    }

    function buildPayload() {

        const [y, m, d] =
            (dom.Birthday.value || "").split("-").map(x => App.numOrNull(x));

        return {
            Name: dom.Name.value.trim(),
            PhoneNumber: dom.PhoneNumber.value.trim(),
            IdCardNumber: dom.IdCardNumber.value.trim(),
            PassWord: dom.PassWord.value,
            Email: dom.Email.value.trim(),
            BirthdayYear: y ?? null,
            BirthdayMonth: m ?? null,
            BirthdayDay: d ?? null,

            IsPushMessage: dom.IsPushMessage.checked,
            RoleId: App.numOrNull(dom.RoleId.value),

            IsMember: dom.IsMember.checked,
            IsBlocked: dom.IsBlocked.checked,
            IsActive: dom.IsActive.checked,

            IsWeb: dom.IsWeb.checked,
            IsMailActive: dom.IsMailActive.checked,

            IsConverted: dom.IsConverted.checked,

            AccountManager: dom.AccountManager.value.trim(),

            OpenClaw: dom.OpenClaw.value.trim(),
            OpenClawAgent: dom.OpenClawAgent.value.trim(),
            RoleList: dom.RoleList.value.trim(),
            FavoriteFeaturesList: dom.FavoriteFeaturesList.value.trim()
        };
    }

    return {
        init,
        deleteMember
    };

})();