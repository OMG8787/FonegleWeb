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

        // 使用臨時密碼登入：直接打開改密碼區塊
        if (Auth.mustChangePassword() || /mustChange=1/.test(location.search)) {

            if (dom.passwordArea.classList.contains("d-none")) togglePasswordArea();

            const tip = document.createElement("div");
            tip.id = "mustChangeTip";
            tip.className = "alert alert-warning";
            tip.innerHTML = "🔑 你目前使用的是管理員提供的<b>臨時密碼</b>，請先設定新密碼才能使用其他功能。「目前密碼」請輸入臨時密碼。";
            dom.passwordArea.prepend(tip);
            dom.currentPassword.focus();
        }
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

        // AI 設定
        ["aiArea", "aiStatus", "aiProvider", "aiApiKey", "aiKeyHelp", "aiModel", "aiModelList", "aiEndpoint", "aiTestResult"]
            .forEach(id => dom[id] = document.getElementById(id));
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

        // AI 設定
        document.querySelector("#btnToggleAi")
            ?.closest(".setting-header")
            .addEventListener("click", toggleAiArea);

        dom.aiProvider?.addEventListener("change", () => renderAiDefaults(true));
        document.getElementById("btnShowAiKey")?.addEventListener("click", () => {
            dom.aiApiKey.type = dom.aiApiKey.type === "password" ? "text" : "password";
        });
        document.getElementById("btnSaveAi")?.addEventListener("click", saveAi);
        document.getElementById("btnTestAi")?.addEventListener("click", testAi);
        document.getElementById("btnClearAi")?.addEventListener("click", clearAi);
    }

    // ==================================================
    // AI 設定
    // ==================================================
    const AI_MODELS = {
        gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite"],
        claude: ["claude-sonnet-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"],
        openai: []
    };

    let aiConfig = null;

    async function toggleAiArea() {

        toggleSection("btnToggleAi", dom.aiArea);

        if (!aiConfig && !dom.aiArea.classList.contains("d-none")) {
            try {
                aiConfig = await API.call("getAiConfig", {}, { silent: true });
                fillAi();
            } catch (err) {
                App.error(err, "讀取 AI 設定失敗");
            }
        }
    }

    function fillAi() {

        const c = aiConfig;

        dom.aiProvider.value = c.provider || "gemini";
        dom.aiModel.value = c.model || "";
        dom.aiEndpoint.value = c.endpoint || "";
        dom.aiApiKey.value = "";

        renderAiDefaults(false);

        const u = c.using;
        dom.aiStatus.innerHTML = !u
            ? "⚠️ 目前<b>沒有可用的 AI</b>：請輸入自己的 API Key"
            : u.source === "user"
                ? `✅ 目前使用<b>你自己的</b> ${App.esc(u.name)}（${App.esc(u.model)}）`
                : `ℹ️ 目前使用<b>系統共用</b>的 ${App.esc(u.name)}（${App.esc(u.model)}）；輸入自己的 API Key 後改用你的`;
    }

    // 依服務顯示預設 Model / Endpoint 提示
    function renderAiDefaults(changed) {

        const p = dom.aiProvider.value;
        const def = aiConfig?.providers?.[p] || {};

        dom.aiModelList.innerHTML = (AI_MODELS[p] || []).map(m => `<option value="${App.esc(m)}">`).join("");
        dom.aiModel.placeholder = def.model ? `預設：${def.model}` : "必填，例如 gpt-4o-mini";
        dom.aiEndpoint.placeholder = def.endpoint || "";

        // 換服務時清掉不適用的 Model / Endpoint
        if (changed) { dom.aiModel.value = ""; dom.aiEndpoint.value = ""; }

        const same = aiConfig?.hasKey && aiConfig.provider === p;
        dom.aiApiKey.placeholder = same ? `已儲存（${aiConfig.keyHint}），留空表示不變更` : "貼上你的 API Key";
        dom.aiKeyHelp.textContent = p === "claude"
            ? "到 console.anthropic.com 建立（需儲值，依用量計費）"
            : p === "gemini"
                ? "到 aistudio.google.com 用 Google 帳號免費建立"
                : "OpenAI 或其他相容服務（例如自架、代理）的金鑰";
    }

    async function saveAi() {

        try {
            aiConfig = await API.call("setAiConfig", {
                provider: dom.aiProvider.value,
                apiKey: dom.aiApiKey.value.trim(),
                model: dom.aiModel.value.trim(),
                endpoint: dom.aiEndpoint.value.trim()
            }, { loadingText: "儲存 AI 設定中…" });
            fillAi();
            dom.aiTestResult.textContent = "";
            alert("✅ AI 設定已儲存");
        } catch (err) {
            App.error(err, "儲存失敗");
        }
    }

    async function testAi() {

        dom.aiTestResult.className = "small mt-2 text-muted";
        dom.aiTestResult.textContent = "測試中…";

        try {
            const r = await API.call("testAiConfig", {}, { loadingText: "測試 AI 連線中…", noRetry: true });
            dom.aiTestResult.className = "small mt-2 text-success";
            dom.aiTestResult.textContent = `✅ 連線成功（${r.source === "user" ? "你的" : "系統共用"} ${r.name}・${r.model}）：${r.reply}`;
        } catch (err) {
            dom.aiTestResult.className = "small mt-2 text-danger";
            dom.aiTestResult.textContent = "❌ " + (err?.message || "連線失敗");
        }
    }

    async function clearAi() {

        if (!confirm("確定清除你的 AI 設定？清除後會改用系統共用設定（如果有）。")) return;

        try {
            aiConfig = await API.call("setAiConfig", { clear: true }, { loadingText: "清除中…" });
            fillAi();
            dom.aiTestResult.textContent = "";
        } catch (err) {
            App.error(err, "清除失敗");
        }
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
            },
            {
                buttonId: "btnToggleAi",
                area: dom.aiArea
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

            if (Auth.mustChangePassword()) {
                Auth.setMustChangePassword(false);
                location.href = Auth.root + "home.html";
            }

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