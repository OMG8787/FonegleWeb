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

    get sessionMs() {
        return (window.APP_SETTINGS?.SESSION_HOURS || 10) * 60 * 60 * 1000;
    },

    // =========================
    // Google Apps Script 傳輸層
    // =========================
    async request(action, payload = {}) {

        const url = window.APP_SETTINGS?.GAS_URL;

        if (!url) {
            throw new Error("尚未設定 Google 試算表連線，請到登入頁的「連線設定」貼上 Apps Script 網址");
        }

        let res;

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
                })
            });

        } catch (err) {

            throw new Error("無法連線到 Google 試算表服務，請檢查網路");
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
    setSession({ userId, token, roleList }) {

        this.setCookie(this.cookieName, userId);
        this.setCookie(this.tokenCookieName, token);
        this.setRoleList(roleList || []);
        this.refreshExpireTime();

        sessionStorage.setItem(this.validatedKey, String(Date.now()));
    },

    setUserId(userId) {

        this.setCookie(this.cookieName, userId);
        this.refreshExpireTime();
    },

    setRoleList(roleList) {

        this.setCookie(
            this.roleCookieName,
            JSON.stringify(roleList || [])
        );
    },

    setCookie(name, value) {

        const expires =
            new Date(Date.now() + this.sessionMs).toUTCString();

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
    // 更新操作時間
    // =========================
    refreshExpireTime() {

        const expireTime = Date.now() + this.sessionMs;

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

    // =========================
    // 監聽使用者操作（自動延長登入）
    // =========================
    startActivityListener() {

        if (this._activityStarted) return;

        this._activityStarted = true;

        let lastRefresh = 0;

        const refresh = () => {

            const now = Date.now();

            if (now - lastRefresh < 5 * 60 * 1000)
                return;

            lastRefresh = now;

            this.refreshExpireTime();
        };

        ["mousemove", "click", "keydown", "scroll", "touchstart"]
            .forEach(event => document.addEventListener(event, refresh));
    },

    hasPermission(...ids) {

        const roleList = this.getRoleList();

        return ids.some(id => roleList.includes(id));
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
            this.startActivityListener();
            this.checkPagePermission();
        };

        // 5 分鐘內驗證過就不重複呼叫（減少等待時間）
        const validatedAt = Number(sessionStorage.getItem(this.validatedKey) || 0);

        if (Date.now() - validatedAt > 5 * 60 * 1000) {

            try {

                const me = await this.request("me");

                // 以伺服器上的權限為準
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
