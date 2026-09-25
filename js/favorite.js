window.Favorite = (() => {

    "use strict";

    let favoriteIds = [];

    // =========================================
    // 初始化
    // =========================================
    async function init() {

        bindFavoriteButtons();

        // 只有首頁需要讀取清單
        if (document.getElementById("fav-grid")) {
            await loadFavorites();
            renderHomeFavorites();
        }
    }

    // =========================================
    // 載入我的最愛（Users.FavoriteFeaturesList）
    // =========================================
    async function loadFavorites() {

        try {

            const me = await API.me({ silent: true });

            favoriteIds =
                String(me?.user?.FavoriteFeaturesList || "")
                    .split("|")
                    .map(x => Number(x))
                    .filter(x => x && !isNaN(x));

        } catch (err) {

            console.error(err);
        }
    }

    function canFavorite(id) {
        return id !== 1; // 首頁禁止加入最愛
    }

    // =========================================
    // sidebar 綁定
    // =========================================
    function bindFavoriteButtons() {

        document.querySelectorAll("[data-favorite-id]")
            .forEach(btn => {

                const id = Number(btn.dataset.favoriteId);

                if (!canFavorite(id)) {
                    btn.style.display = "none";
                    return;
                }

                btn.addEventListener("click", async (e) => {

                    e.stopPropagation();

                    if (!confirm("確認加入我的最愛？"))
                        return;

                    try {

                        favoriteIds =
                            await API.call("setFavorite", { id, add: true });

                        alert("已加入我的最愛");

                        renderHomeFavorites();

                    } catch (err) {

                        App.error(err, "加入失敗");
                    }
                });
            });
    }

    // =========================================
    // Home Render
    // =========================================
    function renderHomeFavorites() {

        const grid = document.getElementById("fav-grid");

        if (!grid)
            return;

        const allItems = Config.menuData.flatMap(g => g.items);

        const favorites = allItems.filter(x => favoriteIds.includes(x.id));

        if (!favorites.length) {

            grid.innerHTML = `
<div class="text-muted">
尚未加入我的最愛
</div>
`;
            return;
        }

        const html = favorites.map(item => `
<div class="col-12 col-md-6 col-xl-3 mb-3">

    <div class="card favorite-card border-0 shadow-sm h-100">

        <div class="card-body d-flex flex-column">

            <h5 class="mb-3">
                ${item.name}
            </h5>

            <div class="mt-auto d-flex gap-2">

                <button
                    class="btn btn-primary btn-sm flex-fill"
                    onclick="Layout.go('${item.page}')">

                    前往

                </button>

                <button
                    class="btn btn-outline-danger btn-sm"
                    onclick="Favorite.remove(${item.id})">

                    移除

                </button>

            </div>

        </div>

    </div>

</div>
`).join("");

        grid.innerHTML = `
<div class="row">
    ${html}
</div>
`;
    }

    // =========================================
    // 刪除最愛
    // =========================================
    async function remove(id) {

        if (!confirm("確認刪除我的最愛？"))
            return;

        try {

            favoriteIds =
                await API.call("setFavorite", { id, add: false });

            renderHomeFavorites();

            alert("已移除");

        } catch (err) {

            App.error(err, "刪除失敗");
        }
    }

    return {
        init,
        remove
    };

})();
