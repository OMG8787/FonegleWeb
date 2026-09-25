// =========================================================
// 操作遮罩：送出請求時擋住畫面，避免重複點擊
//   - 一送出就立即擋住點擊與 Enter（透明）
//   - 超過 200ms 才顯示轉圈與文字，快速操作不會閃爍
//   - 多個請求同時進行時，全部完成才關閉
// =========================================================
const Loading = {

    count: 0,
    showTimer: null,
    hideTimer: null,

    // 依操作類型顯示的文字
    texts: {
        login: "登入中…", register: "建立帳號中…", forgetPassword: "處理中…",
        list: "載入中…", getMany: "載入中…", get: "載入中…", me: "載入中…",
        loginSessions: "載入中…", loginLog: "載入中…",
        insert: "儲存中…", update: "儲存中…", batch: "儲存中…",
        updateProfile: "儲存中…", changePassword: "儲存中…", setFavorite: "儲存中…",
        remove: "刪除中…", removeWhere: "刪除中…", kickSession: "處理中…",
        sendMail: "寄送中…", aiChat: "AI 回覆中…", aiGenerate: "AI 產生中，約需 5～20 秒…"
    },

    el() {

        let mask = document.getElementById("loadingMask");
        if (mask) return mask;

        const style = document.createElement("style");
        style.textContent = `
            #loadingMask{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;
                background:transparent;cursor:progress;transition:background .15s}
            #loadingMask.active{display:flex}
            #loadingMask.visible{background:rgba(17,24,39,.35);backdrop-filter:blur(1px)}
            #loadingMask .loading-box{display:none;align-items:center;gap:12px;background:#fff;color:#1f2937;
                padding:16px 24px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:16px;font-weight:600;max-width:80vw}
            #loadingMask.visible .loading-box{display:flex}
            #loadingMask .loading-spin{width:26px;height:26px;border:3px solid #e5e7eb;border-top-color:#d63384;border-radius:50%;
                animation:loadingSpin .8s linear infinite;flex-shrink:0}
            @keyframes loadingSpin{to{transform:rotate(360deg)}}`;
        document.head.appendChild(style);

        mask = document.createElement("div");
        mask.id = "loadingMask";
        mask.setAttribute("role", "status");
        mask.setAttribute("aria-live", "polite");
        mask.innerHTML = `<div class="loading-box"><div class="loading-spin"></div><div class="loading-text">處理中…</div></div>`;
        document.body.appendChild(mask);

        return mask;
    },

    show(text) {

        if (!document.body) return;

        this.count++;

        clearTimeout(this.hideTimer);

        const mask = this.el();
        mask.querySelector(".loading-text").textContent = text || "處理中…";
        mask.classList.add("active");

        // 送出請求時移開焦點，避免 Enter 再次送出
        if (document.activeElement && document.activeElement !== document.body)
            document.activeElement.blur();

        if (!mask.classList.contains("visible") && !this.showTimer) {
            this.showTimer = setTimeout(() => {
                this.showTimer = null;
                if (this.count > 0) mask.classList.add("visible");
            }, 200);
        }
    },

    hide() {

        if (this.count <= 0) return;

        this.count--;

        if (this.count > 0) return;

        // 稍等一下再關，連續請求（儲存 → 重新載入）不會閃爍
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            if (this.count > 0) return;
            clearTimeout(this.showTimer);
            this.showTimer = null;
            const mask = document.getElementById("loadingMask");
            if (mask) mask.classList.remove("active", "visible");
        }, 80);
    },

    get busy() {
        return this.count > 0;
    }
};

// 遮罩期間擋住鍵盤送出（Enter / 空白鍵）
document.addEventListener("keydown", e => {
    if (Loading.busy && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

const Auth = {

    cookieName: "erp_user_id",
    tokenCookieName: "erp_token",
    roleCookieName: "erp_role_list",
    validatedKey: "erp_validated_at",

    // 網站根目錄（由 settings.js 推算）
    get root() {
        return window.APP_SETTINGS?.ROOT || "/";
    },

    // cookie 只作用在本網站路徑（GitHub Pages 同網域可能有其他專案）
    get cookiePath() {
        try {
            return new URL(this.root, location.href).pathname || "/";
        } catch {
            return "/";
        }
    },

    // 伺服器沒回傳到期時間時的備用值（實際以 Apps Script 的 SESSION_HOURS 為準）
    get sessionMs() {
        return (window.APP_SETTINGS?.SESSION_HOURS || 6) * 60 * 60 * 1000;
    },

    // =========================
    // 裝置資訊（登入紀錄用），例如「手機 · iPhone · Safari」
    // =========================
    deviceInfo() {

        const ua = navigator.userAgent || "";

        const os =
            /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad" :
            /iPhone/.test(ua) ? "iPhone" :
            /Android/.test(ua) ? "Android" :
            /Windows/.test(ua) ? "Windows" :
            /Mac OS X|Macintosh/.test(ua) ? "Mac" :
            /CrOS/.test(ua) ? "ChromeOS" :
            /Linux/.test(ua) ? "Linux" : "其他";

        const browser =
            /Line\//.test(ua) ? "LINE" :
            /FBAN|FBAV/.test(ua) ? "Facebook" :
            /Instagram/.test(ua) ? "Instagram" :
            /Edg\//.test(ua) ? "Edge" :
            /OPR\//.test(ua) ? "Opera" :
            /SamsungBrowser/.test(ua) ? "Samsung" :
            /Firefox|FxiOS/.test(ua) ? "Firefox" :
            /Chrome|CriOS/.test(ua) ? "Chrome" :
            /Safari/.test(ua) ? "Safari" : "其他";

        const type =
            os === "iPad" || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "平板" :
            /Mobi|iPhone|Android/.test(ua) ? "手機" : "電腦";

        return {
            device: `${type} · ${os} · ${browser} · ${screen.width}x${screen.height}`,
            userAgent: ua
        };
    },

    // =========================
    // Google Apps Script 傳輸層
    // =========================
    // opts.silent：背景動作（自動補傳、驗證登入等）不顯示遮罩
    // opts.loadingText：自訂遮罩文字
    async request(action, payload = {}, opts = {}) {

        const url = window.APP_SETTINGS?.GAS_URL;

        if (!url) {
            throw new Error("尚未設定 Google 試算表連線，請聯絡系統管理員");
        }

        const masked = !opts.silent;

        if (masked) Loading.show(opts.loadingText || Loading.texts[action]);

        try {
            return await this.send(url, action, payload);
        } finally {
            if (masked) Loading.hide();
        }
    },

    async send(url, action, payload) {

        let res;

        // 避免網路卡住時遮罩永遠不消失（AI 需要較久）
        const timeoutMs = /^ai/.test(action) || action === "sendMail" ? 120000 : 60000;
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

        try {

            // text/plain 可避免瀏覽器 CORS 預檢，Apps Script 才收得到
            res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify({
                    ...payload,
                    action,
                    token: this.getToken()
                }),
                signal: ctrl?.signal
            });

        } catch (err) {

            if (err?.name === "AbortError")
                throw new Error("連線逾時，請稍後再試（資料可能已送出，請重新整理確認）");

            throw new Error("無法連線到 Google 試算表服務，請檢查網路");

        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            throw new Error(`Google 試算表服務錯誤（HTTP ${res.status}）`);
        }

        const data = await res.json();

        if (!data.success) {

            if (data.code === "AUTH" && !this.isLoginPage()) {

                alert(data.message || "登入已失效，請重新登入");

                this.logout();
            }

            const err = new Error(data.message || "操作失敗");
            err.code = data.code;
            throw err;
        }

        return data.data;
    },

    // =========================
    // 寫入登入資訊
    // =========================
    setSession({ userId, token, roleList, expireAt }) {

        this.setExpireTime(expireAt);
        this.setCookie(this.cookieName, userId);
        this.setCookie(this.tokenCookieName, token);
        this.setRoleList(roleList || []);

        sessionStorage.setItem(this.validatedKey, String(Date.now()));
    },

    setUserId(userId) {

        this.setCookie(this.cookieName, userId);
    },

    setRoleList(roleList) {

        this.setCookie(
            this.roleCookieName,
            JSON.stringify(roleList || [])
        );
    },

    // cookie 與登入同時到期
    setCookie(name, value) {

        const expires =
            new Date(this.getExpireTime() || Date.now() + this.sessionMs).toUTCString();

        document.cookie =
            `${name}=${encodeURIComponent(value ?? "")}; expires=${expires}; path=${this.cookiePath}`;
    },

    getCookie(name) {

        const match =
            document.cookie.match(
                new RegExp("(^| )" + name + "=([^;]+)")
            );

        return match
            ? decodeURIComponent(match[2])
            : null;
    },

    // =========================
    // 登入到期時間（自登入起算固定時數，不因操作延長）
    // =========================
    setExpireTime(expireAt) {

        const expireTime = Number(expireAt) || Date.now() + this.sessionMs;

        const expires = new Date(expireTime).toUTCString();

        document.cookie =
            `erp_expire_time=${expireTime}; expires=${expires}; path=${this.cookiePath}`;

        // 同步延長其他 cookie
        [this.cookieName, this.tokenCookieName, this.roleCookieName].forEach(name => {

            const v = this.getCookie(name);

            if (v !== null)
                document.cookie = `${name}=${encodeURIComponent(v)}; expires=${expires}; path=${this.cookiePath}`;
        });
    },

    getExpireTime() {

        const v = this.getCookie("erp_expire_time");

        return v ? Number(v) : null;
    },

    getUserId() {
        return this.getCookie(this.cookieName);
    },

    getToken() {
        return this.getCookie(this.tokenCookieName);
    },

    getRoleList() {

        try {
            return JSON.parse(this.getCookie(this.roleCookieName) || "[]");
        } catch {
            return [];
        }
    },

    // =========================
    // 清除登入
    // =========================
    clear() {

        [this.cookieName, this.tokenCookieName, this.roleCookieName, "erp_expire_time"]
            .forEach(name => {
                document.cookie =
                    `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${this.cookiePath}`;
            });

        sessionStorage.removeItem(this.validatedKey);
    },

    // =========================
    // 登出
    // =========================
    logout() {

        const token = this.getToken();
        const url = window.APP_SETTINGS?.GAS_URL;

        // 通知伺服器刪除 Session（不等待結果）
        if (token && url) {

            try {
                fetch(url, {
                    method: "POST",
                    keepalive: true,
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: "logout", token })
                }).catch(() => { });
            } catch { }
        }

        this.clear();

        localStorage.removeItem("aiChat");
        localStorage.removeItem("aiType");

        if (!this.isLoginPage()) {
            location.href = this.root + "login.html";
        }
    },

    isLoginPage() {

        return location.pathname
            .toLowerCase()
            .endsWith("/login.html");
    },

    // =========================
    // 檢查目前頁面權限
    // =========================
    checkPagePermission() {

        // config.js 以 const 宣告，不會出現在 window 上
        if (typeof Config === "undefined" || !Config.menuData)
            return true;

        const path = location.pathname.toLowerCase();

        let currentItem = null;

        Config.menuData.forEach(group => {
            group.items.forEach(item => {
                if (item.page && path.endsWith("/" + item.page.toLowerCase())) {
                    currentItem = item;
                }
            });
        });

        if (!currentItem?.Permission?.length)
            return true;

        if (!this.hasPermission(...currentItem.Permission)) {

            this.showPermissionMask();
            return false;
        }

        return true;
    },

    // =========================
    // 顯示無權限遮罩
    // =========================
    showPermissionMask() {

        if (document.getElementById("permissionMask"))
            return;

        const mask = document.createElement("div");

        mask.id = "permissionMask";

        mask.innerHTML = `
        <div class="permission-box">
            🔐 無權限使用此功能
        </div>
        <button onclick="location.href='${this.root}home.html'">
            回首頁
        </button>
    `;

        Object.assign(mask.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            zIndex: "999999",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            justifyContent: "center",
            alignItems: "center",
            backdropFilter: "blur(2px)",
            pointerEvents: "all"
        });

        const style = document.createElement("style");

        style.innerHTML = `
        .permission-box{
            background:white;
            padding:30px 40px;
            border-radius:16px;
            font-size:24px;
            font-weight:bold;
            box-shadow:0 10px 30px rgba(0,0,0,.3);
        }
    `;

        document.head.appendChild(style);
        document.body.appendChild(mask);
    },

    // 13 最高系統管理員擁有全部權限
    hasPermission(...ids) {

        const roleList = this.getRoleList();

        return roleList.includes(13) || ids.some(id => roleList.includes(id));
    },

    // =========================
    // 驗證登入
    // =========================
    async checkLogin() {

        if (this.isLoginPage())
            return;

        if (!this.getUserId() || !this.getToken()) {
            this.logout();
            return;
        }

        const expireTime = this.getExpireTime();

        if (!expireTime || expireTime <= Date.now()) {

            alert("登入已逾時");
            this.logout();
            return;
        }

        const afterReady = () => {
            this.checkPagePermission();
        };

        // 5 分鐘內驗證過就不重複呼叫（減少等待時間）
        const validatedAt = Number(sessionStorage.getItem(this.validatedKey) || 0);

        if (Date.now() - validatedAt > 5 * 60 * 1000) {

            try {

                const me = await this.request("me", {}, { silent: true });

                // 以伺服器上的權限與到期時間為準
                if (me.expireAt) this.setExpireTime(me.expireAt);
                this.setRoleList(me.roleList || []);

                sessionStorage.setItem(this.validatedKey, String(Date.now()));

            } catch (ex) {

                console.error(ex);

                if (ex.code !== "AUTH") {
                    // 連線問題：保留登入，讓使用者可以重試
                    console.warn("登入驗證失敗：", ex.message);
                }
            }
        }

        if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", afterReady);
        else
            afterReady();
    }
};
