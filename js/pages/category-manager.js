// =========================================================
// 產品分類管理（ID_Category 工作表）
// - 新增、改名、改代碼、停用 / 啟用
// - 有產品在使用的分類只能停用，不能刪除（避免產品失去分類）
// 用法：CategoryManager.open({ products: () => 產品陣列, onChange: categories => { ... } })
// =========================================================
window.CategoryManager = (() => {

    "use strict";

    let categories = [];
    let opts = {};
    let root = null;

    const esc = v => App.esc(v ?? "");

    function usage() {
        const count = {};
        (opts.products ? opts.products() : []).forEach(p => {
            if (p.CategoryID !== null && p.CategoryID !== undefined && p.CategoryID !== "")
                count[String(p.CategoryID)] = (count[String(p.CategoryID)] || 0) + 1;
        });
        return count;
    }

    function build() {

        root = document.createElement("div");
        root.id = "categoryManager";
        root.className = "cm-backdrop";
        root.innerHTML = `
<style>
    .cm-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:1050;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto}
    .cm-box{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:100%;max-width:720px}
    .cm-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e5e7eb}
    .cm-body{padding:14px 18px}
    .cm-table td,.cm-table th{vertical-align:middle}
    .cm-table input.form-control{min-width:90px}
    .cm-table tr.inactive input{color:#9ca3af}
    @media (max-width:576px){.cm-backdrop{padding:10px 6px}.cm-hide-sm{display:none}}
</style>
<div class="cm-box" role="dialog" aria-modal="true" aria-labelledby="cmTitle">
    <div class="cm-head">
        <h5 class="mb-0" id="cmTitle">🏷️ 管理產品分類</h5>
        <button type="button" class="btn-close" data-cm="close" aria-label="關閉"></button>
    </div>
    <div class="cm-body">
        <div class="input-group mb-3">
            <input id="cmNewName" class="form-control" placeholder="新分類名稱，例如：冰淇淋" maxlength="50">
            <input id="cmNewCode" class="form-control" placeholder="代碼（可空白）" maxlength="20" style="max-width:140px">
            <button type="button" class="btn btn-success" data-cm="add">➕ 新增</button>
        </div>
        <div class="table-responsive">
            <table class="table table-sm cm-table mb-2">
                <thead class="table-light">
                    <tr>
                        <th>名稱</th>
                        <th class="cm-hide-sm">代碼</th>
                        <th class="text-center">產品數</th>
                        <th class="text-center">啟用</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="cmList"></tbody>
            </table>
        </div>
        <div class="small text-muted">
            改名後按 💾 儲存。停用的分類不會出現在選單，但已經使用的產品保留原分類。
            有產品使用中的分類只能停用，不能刪除。
        </div>
    </div>
</div>`;

        document.body.appendChild(root);

        root.addEventListener("click", onClick);
        root.addEventListener("change", e => {
            if (e.target.matches("[data-f=IsActive]")) save(e.target.closest("tr"));
        });
        root.querySelector("#cmNewName").addEventListener("keydown", e => { if (e.key === "Enter") add(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape" && root.style.display !== "none") close(); });
    }

    function render() {

        const used = usage();
        const list = categories.slice().sort((a, b) =>
            (a.IsActive === false) - (b.IsActive === false) || Number(a.ID) - Number(b.ID));

        root.querySelector("#cmList").innerHTML = list.map(c => {
            const n = used[String(c.ID)] || 0;
            const active = c.IsActive !== false;
            return `
<tr data-id="${esc(c.ID)}" class="${active ? "" : "inactive"}">
    <td><input class="form-control form-control-sm" data-f="CategoryName" value="${esc(c.CategoryName)}" maxlength="50"></td>
    <td class="cm-hide-sm"><input class="form-control form-control-sm" data-f="CategoryCode" value="${esc(c.CategoryCode)}" maxlength="20"></td>
    <td class="text-center">${n}</td>
    <td class="text-center"><input class="form-check-input" type="checkbox" data-f="IsActive" ${active ? "checked" : ""} title="${active ? "啟用中" : "已停用"}"></td>
    <td class="text-end text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary" data-cm="save" title="儲存">💾</button>
        ${n ? "" : `<button type="button" class="btn btn-sm btn-outline-danger" data-cm="remove" title="刪除">🗑</button>`}
    </td>
</tr>`;
        }).join("") || `<tr><td colspan="5" class="text-muted">尚未建立分類</td></tr>`;
    }

    function onClick(e) {
        if (e.target === root) return close();
        const b = e.target.closest("[data-cm]");
        if (!b) return;
        const act = b.dataset.cm;
        if (act === "close") close();
        if (act === "add") add();
        if (act === "save") save(b.closest("tr"));
        if (act === "remove") remove(b.closest("tr"));
    }

    function nameTaken(name, exceptId) {
        return categories.some(c => String(c.ID) !== String(exceptId) && String(c.CategoryName).trim() === name);
    }

    async function add() {

        const nameEl = root.querySelector("#cmNewName");
        const codeEl = root.querySelector("#cmNewCode");
        const name = nameEl.value.trim();

        if (!name) { nameEl.focus(); return alert("請輸入分類名稱"); }
        if (nameTaken(name)) return alert(`已經有「${name}」這個分類`);

        try {
            const row = await API.insert("ID_Category",
                { CategoryName: name, CategoryCode: codeEl.value.trim(), IsActive: true },
                { loadingText: "新增分類中…" });
            categories.push(row);
            nameEl.value = "";
            codeEl.value = "";
            changed();
            nameEl.focus();
        } catch (err) {
            App.error(err, "新增分類失敗");
        }
    }

    async function save(tr) {

        const id = tr.dataset.id;
        const c = categories.find(x => String(x.ID) === id);
        const name = tr.querySelector("[data-f=CategoryName]").value.trim();
        const active = tr.querySelector("[data-f=IsActive]").checked;

        if (!name) return alert("分類名稱不能空白");
        if (nameTaken(name, id)) return alert(`已經有「${name}」這個分類`);

        try {
            const row = await API.update("ID_Category", id, {
                CategoryName: name,
                CategoryCode: tr.querySelector("[data-f=CategoryCode]").value.trim(),
                IsActive: active
            }, { loadingText: "儲存分類中…" });
            Object.assign(c, row);
            changed();
        } catch (err) {
            App.error(err, "儲存分類失敗");
            render();
        }
    }

    async function remove(tr) {

        const id = tr.dataset.id;
        const c = categories.find(x => String(x.ID) === id);

        if (usage()[id]) return alert("這個分類還有產品在使用，只能停用");
        if (!confirm(`確定刪除分類「${c.CategoryName}」？`)) return;

        try {
            await API.remove("ID_Category", id, { loadingText: "刪除分類中…" });
            categories = categories.filter(x => String(x.ID) !== id);
            changed();
        } catch (err) {
            App.error(err, "刪除分類失敗");
        }
    }

    function changed() {
        render();
        if (opts.onChange) opts.onChange(categories.slice());
    }

    async function open(options = {}) {

        opts = options;
        if (!root) build();

        root.style.display = "flex";
        root.querySelector("#cmList").innerHTML = `<tr><td colspan="5" class="text-muted">載入中…</td></tr>`;

        try {
            categories = await API.list("ID_Category");
            render();
            root.querySelector("#cmNewName").focus();
        } catch (err) {
            App.error(err, "讀取分類失敗");
            close();
        }
    }

    function close() {
        if (root) root.style.display = "none";
    }

    return { open, close };
})();
