window.Pages = window.Pages || {};

Pages.LinkTree = (() => {

    "use strict";

    const dom = {};
    let editingItem = null;
    let listCache = [];
    let filterMode = "all"; // all / 1=自動爬蟲 / 0=無須爬蟲

    // =========================
    // INIT
    // =========================
    async function init() {

        cacheDom();
        bindEvents();

        await loadList();
        setFilter("all");
    }

    // =========================
    // DOM
    // =========================
    function cacheDom() {

        dom.addOwner = document.getElementById("addOwner");
        dom.addUrl = document.getElementById("addUrl");
        dom.addStatus = document.getElementById("addStatus");
        dom.addNote = document.getElementById("addNote");

        dom.searchKey = document.getElementById("searchKey");
        dom.listArea = document.getElementById("listArea");
    }

    // =========================
    // EVENTS
    // =========================
    function bindEvents() {

        document.getElementById("btnAdd")
            ?.addEventListener("click", addLinkTree);

        document.getElementById("btnSearch")
            ?.addEventListener("click", loadList);

        document.getElementById("btnFilterAll")
            ?.addEventListener("click", () => {
                filterMode = "all";
                renderList(listCache);
            });

        document.getElementById("btnFilterAuto")
            ?.addEventListener("click", () => {
                filterMode = "1";
                renderList(listCache);
            });

        document.getElementById("btnFilterManual")
            ?.addEventListener("click", () => {
                filterMode = "0";
                renderList(listCache);
            });

        document.getElementById("btnFilterAll")
            ?.addEventListener("click", () => setFilter("all"));

        document.getElementById("btnFilterAuto")
            ?.addEventListener("click", () => setFilter("1"));

        document.getElementById("btnFilterManual")
            ?.addEventListener("click", () => setFilter("0"));
    }

    function setFilter(mode) {

        filterMode = mode;

        // ⭐ 先全部變灰
        const allBtn = document.getElementById("btnFilterAll");
        const autoBtn = document.getElementById("btnFilterAuto");
        const manualBtn = document.getElementById("btnFilterManual");

        [allBtn, autoBtn, manualBtn].forEach(btn => {
            btn.classList.remove("btn-primary");
            btn.classList.add("btn-outline-secondary");
        });

        // ⭐ 被選到的變藍
        if (mode === "all") {
            allBtn.classList.remove("btn-outline-secondary");
            allBtn.classList.add("btn-primary");
        } else if (mode === "1") {
            autoBtn.classList.remove("btn-outline-secondary");
            autoBtn.classList.add("btn-primary");
        } else {
            manualBtn.classList.remove("btn-outline-secondary");
            manualBtn.classList.add("btn-primary");
        }

        renderList(listCache);
    }

    // =========================
    // 新增
    // =========================
    async function addLinkTree() {

        const owner = dom.addOwner.value.trim();
        const url = dom.addUrl.value.trim();
        const status = dom.addStatus.value;
        const note = dom.addNote.value.trim();

        if (!owner || !url) {
            alert("請輸入廠商與網址");
            return;
        }

        try {

            setLoading(true);

            const data = {
                SiteName: owner,
                BaseUrl: url,
                // 下拉選單：0 = ✔ 需要自動爬蟲、1 = ✘ 無須自動爬蟲
                IsDeleted: status === "1",
                Description: note
            };

            if (editingItem) {

                await API.update("CrawlerSources", editingItem.id, data);

                alert("✅ 連結樹修改成功");

            } else {

                const exists = (await API.list("CrawlerSources"))
                    .some(x => String(x.BaseUrl).trim() === url);

                if (exists) {
                    alert("⚠️ 此連結樹網址已經建立過");
                    return;
                }

                await API.insert("CrawlerSources", data);

                alert("🎉 連結樹建立成功");
            }

            resetForm();

            await loadList();

        } catch (err) {

            App.error(err, "操作失敗");

        } finally {
            setLoading(false);
        }
    }

    // =========================
    // 查詢
    // =========================
    async function loadList() {

        try {

            const key = dom.searchKey?.value?.trim() || "";

            listCache = (await API.list("CrawlerSources"))
                .filter(x =>
                    App.like(x.SiteName, key) ||
                    App.like(x.BaseUrl, key) ||
                    App.like(x.Description, key))
                .sort((a, b) => String(a.SiteName).localeCompare(String(b.SiteName), "zh-Hant"))
                .map(x => {

                    const status = x.IsDeleted === true ? "0" : "1";

                    return {
                        id: x.ID,
                        owner: x.SiteName || "",
                        url: x.BaseUrl || "",
                        status,
                        statusText: status === "1" ? "自動爬蟲" : "無須爬蟲",
                        note: x.Description || ""
                    };
                });

            if (!listCache.length) {
                dom.listArea.innerHTML = "<div class='text-muted'>無資料</div>";
                return;
            }

            renderList(listCache);

        } catch (err) {

            App.error(err, "查詢失敗");
        }
    }

    // =========================
    // render
    // =========================
    function renderList(list) {

        let finalList = list;

        if (filterMode !== "all") {
            finalList = list.filter(x => x.status === filterMode);
        }

        if (!finalList.length) {
            dom.listArea.innerHTML = "<div class='text-muted'>此分類無資料</div>";
            return;
        }

        const esc = App.esc;

        dom.listArea.innerHTML = finalList.map((x) => {

            const isHidden = x.status !== "1";

            return `
<div class="border rounded p-3 mb-2 ${isHidden ? 'bg-light text-muted' : 'bg-white'}">

<div class="fw-bold">🏢 ${esc(x.owner)}</div>

<div class="d-flex align-items-center gap-2">
🌐
<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url)}</a>

<button class="btn btn-sm btn-outline-secondary"
onclick="Pages.LinkTree.copy(${listCache.indexOf(x)})">
複製
</button>
</div>

<div>📌 ${esc(x.statusText)}</div>
<div>📝 ${esc(x.note)}</div>

<div class="mt-2 d-flex gap-2">

<button class="btn btn-sm btn-warning" onclick="Pages.LinkTree.edit(${listCache.indexOf(x)})">
修改
</button>

<button class="btn btn-sm btn-danger" onclick="Pages.LinkTree.remove(${listCache.indexOf(x)})">
刪除
</button>

</div>

</div>
        `;

        }).join("");
    }

    // =========================
    // 修改（先做UI骨架）
    // =========================
    async function edit(index) {

        const item = listCache[index];

        editingItem = item;
        document.getElementById("editHint").classList.remove("d-none");
        // ⭐把資料塞回表單
        dom.addOwner.value = item.owner;
        dom.addUrl.value = item.url;
        // 列表 status：1 = 自動爬蟲；下拉選單值相反
        dom.addStatus.value = item.status === "1" ? "0" : "1";
        dom.addNote.value = item.note;

        // ⭐按鈕變成更新
        document.getElementById("btnAdd").innerText = "更新連結樹";

        // ⭐滾動到上面（UX 很重要）
        document.getElementById("formCard")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function resetForm() {

        editingItem = null;
        document.getElementById("editHint").classList.add("d-none");
        dom.addOwner.value = "";
        dom.addUrl.value = "";
        dom.addStatus.value = "0";
        dom.addNote.value = "";

        document.getElementById("btnAdd").innerText = "建立連結樹";
        window.scrollTo({ top: 0 });
    }
    // =========================
    // 刪除（先做）
    // =========================
    // =========================
    // 刪除
    // =========================
    async function remove(index) {

        const item = listCache[index];

        const ok = confirm(
            `⚠️ 確認刪除連結樹？

廠商：${item.owner}
網址：${item.url}

此操作將永久刪除資料，
刪除後將無法復原！

按下「確定」繼續刪除。`
        );

        if (!ok)
            return;

        try {

            setLoading(true);

            await API.remove("CrawlerSources", item.id);

            alert("🗑️ 刪除完成");

            await loadList();

        } catch (err) {

            App.error(err, "刪除失敗");

        } finally {

            setLoading(false);

        }
    }

    function copy(index) {

        const item = listCache[index];

        if (item)
            navigator.clipboard.writeText(item.url);
    }


    // =========================
    // loading
    // =========================
    function setLoading(flag) {

        document.body.style.cursor =
            flag ? "wait" : "default";
    }

    return {
        init,
        edit,
        remove,
        copy
    };

})();