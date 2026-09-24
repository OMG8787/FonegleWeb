window.Pages = window.Pages || {};

Pages.MailPage = (() => {

    "use strict";

    // =========================
    // DOM
    // =========================
    const $ = id => document.getElementById(id);
    const val = id => $(id)?.value?.trim() || "";

    let submitBtn;

    // =========================
    // 收件人
    // =========================
    let recipients = [];

    // =========================
    // Init
    // =========================
    function init() {

        submitBtn = $("submitBtn");

        bindEvents();

        renderRecipients();
    }

    // =========================
    // Events
    // =========================
    function bindEvents() {

        $("btnAddRecipient")
            ?.addEventListener("click", addRecipientHandler);

        $("RecipientEmail")
            ?.addEventListener("keydown", e => {

                if (e.key === "Enter") {

                    e.preventDefault();

                    addRecipientHandler();
                }
            });

        submitBtn
            ?.addEventListener("click", submitForm);
    }

    // =========================
    // Email驗證
    // =========================
    function isValidEmail(mail) {

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            .test(mail);
    }

    // =========================
    // 新增收件人
    // =========================
    function addRecipientHandler() {

        const email = val("RecipientEmail");

        if (!email) {

            App.toast("請輸入Email");
            return;
        }

        if (!isValidEmail(email)) {

            App.toast("Email格式錯誤");
            return;
        }

        const exists = recipients.some(
            x => x.toLowerCase() === email.toLowerCase()
        );

        if (exists) {

            App.toast("收件人已存在");
            return;
        }

        recipients.push(email);

        $("RecipientEmail").value = "";

        renderRecipients();
    }

    // =========================
    // 顯示收件人
    // =========================
    function renderRecipients() {

        const container = $("RecipientContainer");
        const countEl = $("RecipientCount");

        if (!container || !countEl) {
            return;
        }

        countEl.textContent = recipients.length;

        if (!recipients.length) {

            container.innerHTML = `
                <div class="text-muted">
                    尚未新增收件人
                </div>
            `;

            return;
        }

        container.innerHTML = recipients.map((email, index) => `

            <div class="badge bg-primary d-flex align-items-center gap-2 p-2">

                <span>${App.esc(email)}</span>

                <button
                    type="button"
                    class="btn-close btn-close-white"
                    onclick="Pages.MailPage.removeRecipient(${index})">
                </button>

            </div>

        `).join("");
    }

    // =========================
    // 移除收件人
    // =========================
    function removeRecipient(index) {

        recipients.splice(index, 1);

        renderRecipients();
    }

    // =========================
    // Loading
    // =========================
    function setLoading(flag) {

        submitBtn.disabled = flag;

        submitBtn.innerHTML = flag
            ? "寄送中..."
            : "寄送信件";

        document.body.style.cursor =
            flag ? "wait" : "default";
    }

    // =========================
    // Submit
    // =========================
    async function submitForm() {

        if (!recipients.length) {

            App.toast("請新增收件人");
            return;
        }

        const subject = val("MailSubject");

        if (!subject) {

            App.toast("請輸入主旨");
            return;
        }

        const content = val("MailContent");

        if (!content) {

            App.toast("請輸入內容");
            return;
        }

        const ok = confirm(`
確認要寄送信件嗎？
        `);

        if (!ok) {
            return;
        }

        setLoading(true);

        try {

            // 附件以 base64 一起送出，由 Apps Script 透過 Gmail 寄出
            const attachments =
                await API.readFiles("AttachmentFile");

            const result = await API.call("sendMail", {
                to: recipients,
                subject,
                body: content,
                attachments
            });

            App.toast(`寄送成功（今日剩餘可寄 ${result?.remainingQuota ?? "-"} 封）`);

            resetForm();

        } catch (err) {

            App.error(err, "寄送失敗");

        } finally {

            setLoading(false);
        }
    }

    // =========================
    // Reset
    // =========================
    function resetForm() {

        $("MailSubject").value = "";
        $("MailContent").value = "";
        $("RecipientEmail").value = "";

        // 清空附件
        const oldFile = $("AttachmentFile");

        const newFile =
            oldFile.cloneNode(true);

        oldFile.parentNode.replaceChild(
            newFile,
            oldFile
        );

        recipients = [];

        renderRecipients();
    }

    return {
        init,
        removeRecipient
    };

})();