const Layout = {

    async init() {

        this.renderHeader();
        this.renderSidebar();
        this.renderFooter();


        this.startClock();

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

    // 登入綁定裝置、不會自動過期（登出或管理員強制登出才結束），不再顯示倒數
    renderHeader() {
        document.getElementById("headerArea").innerHTML = `
        <div id="erp-header">
            <button type="button" id="btnMenu" class="hdr-btn" onclick="Layout.toggleSidebar()" aria-label="功能選單" title="功能選單">☰</button>
            <a class="hdr-title" href="${Auth.root}home.html">🍦 <span class="hdr-title-full">瘋菓內部管理系統</span><span class="hdr-title-short">瘋菓管理</span></a>
            <div class="hdr-right">
                <button type="button" class="hdr-btn hdr-logout" onclick="Auth.logout()">登出</button>
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
        </div>
        <div id="sidebarBackdrop" onclick="Layout.closeSidebar()"></div>`;

        // 桌機：記住收合狀態；手機：側欄預設關閉（抽屜）
        let collapsed = false;
        try { collapsed = localStorage.getItem("erp_sidebar_collapsed") === "1"; } catch { }
        this.toggleSidebar(collapsed);

        // 手機：選了功能就關閉抽屜；桌機 / 手機切換時重設
        document.getElementById("erp-sidebar").addEventListener("click", e => {
            if (this.isMobile() && e.target.closest(".submenu-item [onclick]")) this.closeSidebar();
        });
        window.matchMedia("(max-width: 991.98px)").addEventListener?.("change", () => this.closeSidebar());
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
            <span>© 2026 瘋菓貿易社（統編 60005166）V1.0.0</span>
            <span class="footer-clock">｜現在時間：<span id="clock"></span></span>
        </div>`;
    },

    go(page) {
        window.location.href = /^(https?:)?\//.test(page)
            ? page
            : Auth.root + page;
    },

    isMobile() {
        return window.matchMedia("(max-width: 991.98px)").matches;
    },

    // 桌機：收合 / 展開選單，主畫面同步放大縮小，並記住選擇
    // 手機：打開 / 關閉抽屜選單
    toggleSidebar(collapsed) {

        const sidebar = document.getElementById("erp-sidebar");
        if (!sidebar) return;

        if (collapsed === undefined && this.isMobile()) {
            document.body.classList.toggle("sidebar-open");
            return;
        }

        const on = sidebar.classList.toggle("collapsed", collapsed);

        document.body.classList.toggle("sidebar-collapsed", on);

        if (collapsed === undefined) {
            try { localStorage.setItem("erp_sidebar_collapsed", on ? "1" : "0"); } catch { }
        }
    },

    closeSidebar() {
        document.body.classList.remove("sidebar-open");
    },

    startClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById("clock").innerText =
                now.toLocaleString();
        }, 1000);
    }
};