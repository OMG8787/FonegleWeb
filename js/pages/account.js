window.Pages = window.Pages || {};

Pages.Account = (() => {

    "use strict";

    const dom = {};
    let profileLoaded = false;

    // ==================================================
    // init
    // ==================================================
    async function init() {

        cacheDom();

        bindEvents();
    }

    // ==================================================
    // DOM
    // ==================================================
    function cacheDom() {

        // 修改密碼
        dom.passwordArea = document.getElementById("passwordArea");

        dom.currentPassword = document.getElementById("currentPassword");
        dom.newPassword = document.getElementById("newPassword");
        dom.confirmPassword = document.getElementById("confirmPassword");

        // Profile
        dom.profileArea = document.getElementById("profileArea");

        dom.userName =
            document.getElementById("userName");

        dom.phone =
            document.getElementById("phone");

        dom.email =
            document.getElementById("email");

        dom.idCard =
            document.getElementById("idCard");

        dom.lineUserId =
            document.getElementById("lineUserId");

        dom.lineUserId.value =
            `${Config.userId || "無資料"}`;

        dom.birthYear =
            document.getElementById("birthYear");

        dom.birthMonth =
            document.getElementById("birthMonth");

        dom.birthDay =
            document.getElementById("birthDay");

        dom.pushNotify =
            document.getElementById("pushNotify");
    }

    // ==================================================
    // Events
    // ==================================================
    function bindEvents() {

        // 修改密碼
        document.querySelector("#btnTogglePassword")
            ?.closest(".setting-header")
            .addEventListener("click", togglePasswordArea);

        document.getElementById("btnSubmitPassword")
            ?.addEventListener("click", submitPassword);

        // Profile
        document.querySelector("#btnToggleProfile")
            ?.closest(".setting-header")
            .addEventListener("click", toggleProfileArea);

        document.getElementById("btnSubmitProfile")
            ?.addEventListener("click", submitProfile);
    }

    // ==================================================
    // Toggle
    // ==================================================
    function togglePasswordArea() {

        toggleSection(
            "btnTogglePassword",
            dom.passwordArea
        );
    }

    async function toggleProfileArea() {

        toggleSection(
            "btnToggleProfile",
            dom.profileArea
        );

        // 第一次展開才載入
        if (
            !profileLoaded &&
            !dom.profileArea.classList.contains("d-none")
        ) {

            await loadProfile();

            profileLoaded = true;
        }
    }
    function toggleSection(buttonId, area) {

        // =========================
        // 所有區塊
        // =========================
        const sections = [
            {
                buttonId: "btnTogglePassword",
                area: dom.passwordArea
            },
            {
                buttonId: "btnToggleProfile",
                area: dom.profileArea
            }
        ];

        const currentButton =
            document.getElementById(buttonId);

        const isHidden =
            area.classList.contains("d-none");

        // =========================
        // 先全部關閉
        // =========================
        sections.forEach(section => {

            section.area.classList.add("d-none");

            const btn =
                document.getElementById(section.buttonId);

            if (btn) {
                btn.innerText = "▶";
            }
        });

        // =========================
        // 如果原本是關閉
        // 就展開目前項目
        // =========================
        if (isHidden) {

            area.classList.remove("d-none");

            currentButton.innerText = "▼";
        }
    }
    // ==================================================
    // 修改密碼
    // ==================================================
    async function submitPassword() {

        const currentPassword =
            dom.currentPassword.value.trim();

        const newPassword =
            dom.newPassword.value.trim();

        const confirmPassword =
            dom.confirmPassword.value.trim();

        // 驗證
        if (!currentPassword ||
            !newPassword ||
            !confirmPassword) {

            alert("請完整輸入");
            return;
        }

        if (newPassword !== confirmPassword) {

            alert("確認密碼不一致");
            return;
        }
        if (newPassword.length < 4) {

            alert("密碼至少需要4碼");
            return;
        }
        const ok = confirm(`
確定要修改密碼嗎？

修改後可能需要重新登入。
        `);

        if (!ok)
            return;

        try {

            setLoading(true);

            const message = await API.call("changePassword", {
                oldPassword: currentPassword,
                newPassword
            });

            alert(message || "密碼修改成功");
            clearPasswordForm();

        } catch (err) {

            App.error(err, "修改失敗");

        } finally {

            setLoading(false);
        }
    }

    function clearPasswordForm() {

        dom.currentPassword.value = "";
        dom.newPassword.value = "";
        dom.confirmPassword.value = "";
    }

    // ==================================================
    // 會員資料
    // ==================================================
    async function loadProfile() {

        try {

            const { user } = await API.me();

            dom.userName.value = user.Name || "";
            dom.phone.value = user.PhoneNumber || "";
            dom.email.value = user.Email || "";
            dom.idCard.value = user.IdCardNumber || "";
            dom.lineUserId.value = user.LineUserId || Config.userId || "";

            dom.birthYear.value = user.BirthdayYear || "";
            dom.birthMonth.value = user.BirthdayMonth || "";
            dom.birthDay.value = user.BirthdayDay || "";

            dom.pushNotify.checked = user.IsPushMessage === true;

        } catch (err) {

            App.error(err, "讀取會員資料失敗");
        }
    }

    async function submitProfile() {

        const name = dom.userName.value.trim();
        const phone = dom.phone.value.trim();
        const email = dom.email.value.trim();
        const idCard = dom.idCard.value.trim();
        const pushNotify = dom.pushNotify.checked;

        if (email && !email.includes("@")) {
            alert("Email格式錯誤");
            return;
        }

        const ok = confirm("確定要修改會員資料嗎？");
        if (!ok) return;

        try {

            setLoading(true);

            const message = await API.call("updateProfile", {
                data: {
                    Name: name,
                    PhoneNumber: phone,
                    Email: email,
                    IdCardNumber: idCard,
                    BirthdayYear: App.numOrNull(dom.birthYear.value),
                    BirthdayMonth: App.numOrNull(dom.birthMonth.value),
                    BirthdayDay: App.numOrNull(dom.birthDay.value),
                    IsPushMessage: pushNotify
                }
            });

            alert(message || "會員資料修改成功");

        } catch (err) {

            App.error(err, "修改失敗");

        } finally {
            setLoading(false);
        }
    }

    // ==================================================
    // 密碼顯示切換
    // ==================================================
    function togglePassword(inputId, btn) {

        const input =
            document.getElementById(inputId);

        if (!input)
            return;

        const isPassword =
            input.type === "password";

        input.type =
            isPassword
                ? "text"
                : "password";

        btn.innerText =
            isPassword
                ? "🙈"
                : "👁";
    }


    // ==================================================
    // Loading
    // ==================================================
    function setLoading(flag) {

        document.body.style.cursor =
            flag ? "wait" : "default";

        document.querySelectorAll("button")
            .forEach(btn => {

                btn.disabled = flag;
            });
    }

    return {
        init,
        togglePassword
    };
})();