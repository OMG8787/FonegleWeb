const Layout = {

    async init() {

        this.renderHeader();
        this.renderSidebar();
        this.renderFooter();


        this.startClock();
        this.startLogoutTimer();

        if (window.Favorite) {
            await Favorite.init();
        }

    },
    // 權限判斷工具
    hasMenuPermission(item) {

        if (!item.Permission || item.Permission.length === 0)
            return true;

        return Auth.hasPermission(...item.Permission);
    },

    startLogoutTimer() {

        const timerEl =
            document.getElementById(
                "logoutTimer"
            );

        if (!timerEl) return;

        const updateTimer = () => {

            const expireTime =
                Auth.getExpireTime();

            if (!expireTime) {

                timerEl.innerText = "已過期";

                Auth.logout();

                return;
            }

            const remain =
                expireTime - Date.now();

            // =========================
            // 已到期
            // =========================
            if (remain <= 0) {

                timerEl.innerText =
                    "00:00:00";

                alert(
                    "登入已逾時，請重新登入"
                );

                Auth.logout();

                return;
            }

            // =========================
            // 剩餘5分鐘提醒
            // =========================
            if (
                remain <= 5 * 60 * 1000 &&
                !this.warningShown
            ) {

                this.warningShown = true;

                const keepLogin =
                    confirm(
                        "系統將於5分鐘內自動登出，是否繼續使用？"
                    );

                // 使用者要繼續
                if (keepLogin) {

                    Auth.refreshExpireTime();

                    this.warningShown = false;

                    return;
                }

                // 不繼續
                else {

                    Auth.logout();

                    return;
                }
            }

            // 超過5分鐘重置
            if (remain > 5 * 60 * 1000) {

                this.warningShown = false;
            }

            // =========================
            // 顯示倒數
            // =========================
            const hours =
                Math.floor(remain / 3600000);

            const minutes =
                Math.floor(
                    (remain % 3600000)
                    / 60000
                );

            const seconds =
                Math.floor(
                    (remain % 60000)
                    / 1000
                );

            timerEl.innerText =
                `${String(hours).padStart(2, "0")}:` +
                `${String(minutes).padStart(2, "0")}:` +
                `${String(seconds).padStart(2, "0")}`;
        };

        // 立即執行一次
        updateTimer();

        // 每秒更新
        setInterval(updateTimer, 1000);
    },

    renderHeader() {
        document.getElementById("headerArea").innerHTML = `
        <div id="erp-header">
            <div>
                <button onclick="Layout.toggleSidebar()">功能選單☰</button>
            </div>
            <div>瘋菓內部管理系統</div>


            <div class="d-flex align-items-center gap-2">
            <span>
    自動登出剩餘時間:
    <span id="logoutTimer">
        --:--:--
    </span>
</span>
            <button
                class="btn btn-sm btn-light"
                onclick="Auth.logout()">

                登出

            </button>

        </div>
        </div>`;
    },
    renderSidebar() {

        const html = Config.menuData.map((group, index) => {

            const itemsHtml = group.items.map(item => {

                const hasPermission =
                    Layout.hasMenuPermission(item);

                return `
    <div class="submenu-item d-flex justify-content-between align-items-center 
        ${hasPermission ? "" : "menu-disabled"}">

        <div
            style="flex:1;cursor:pointer;"
            onclick="${hasPermission ? `Layout.go('${item.page}')` : ''}"
            title="${hasPermission ? '' : '無權限使用'}">

            ${hasPermission ? item.name : "🔒 " + item.name}

        </div>

        ${item.id !== 1 ? `
        <button
            class="btn btn-sm btn-outline-warning ms-2"
            data-favorite-id="${item.id}"
            title="將此功能加到我的最愛">

            +

        </button>
        ` : ``}

    </div>
    `;
            }).join("");

            return `
            <div class="menu-group">

                <div class="menu-group-title"
                    onclick="Layout.toggleGroup(${index})">

                    <span>${group.icon || "📁"}</span>
                    <span>${group.group}</span>

                    <span class="arrow">▼</span>
                </div>

                <div class="submenu" id="group-${index}">
                    ${itemsHtml}
                </div>

            </div>`;
        }).join("");

        document.getElementById("sidebarArea").innerHTML = `
        <div id="erp-sidebar">
            ${html}
        </div>`;
    },

    // toggleGroup(index) {

    //     const el = document.getElementById(`group-${index}`);

    //     if (!el) return;

    //     el.classList.toggle("open");
    // },

    toggleGroup(index) {

        document.querySelectorAll(".submenu").forEach(el => {
            if (el.id !== `group-${index}`) {
                el.classList.remove("open");
            }
        });

        const el = document.getElementById(`group-${index}`);
        if (el) el.classList.toggle("open");
    },

    renderFooter() {
        document.getElementById("footerArea").innerHTML = `
        <div id="erp-footer">
            © 2026 瘋菓貿易社(統編 : 60005166) V1.0.0
            |
            現在時間：
            <span id="clock"></span>
        </div>`;
    },

    go(page) {
        window.location.href = /^(https?:)?\//.test(page)
            ? page
            : Auth.root + page;
    },

    toggleSidebar() {
        document.getElementById("erp-sidebar")
            .classList.toggle("collapsed");
    },

    startClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById("clock").innerText =
                now.toLocaleString();
        }, 1000);
    }
};