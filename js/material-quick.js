// =========================================================
// 快速新增 / 修改原料與包材（配方頁、產品頁共用的小視窗）
//   MaterialQuick.open({ material, name, category, unit, onSaved })
//     material：要修改的原料（沒有 = 新增）；name / category / unit：新增時的預設值
//     onSaved(row)：儲存成功後回傳完整的原料資料
//   需要 Bootstrap JS（modal）與 API；寫入權限同「原料」頁（商品與生產）
// =========================================================
window.MaterialQuick = (() => {

    "use strict";

    const E = App.esc;
    let modal = null, el = null, current = null, done = null;

    const FIELDS = [
        ["MaterialName", "名稱", "col-md-8"],
        ["Category", "分類（包材請填「包材」）", "col-md-4"],
        ["Unit", "單位（原料 g、包材 個）", "col-md-3"],
        ["CostPrice", "單價（每單位）", "col-md-3"],
        ["OriginCountry", "產地", "col-md-3"],
        ["Specification", "規格", "col-md-3"],
        ["Remark", "備註", "col-12"]
    ];

    function build() {

        el = document.createElement("div");
        el.className = "modal fade";
        el.tabIndex = -1;
        el.innerHTML = `
<div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title" id="mqTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><div class="row g-2">${FIELDS.map(([k, l, c]) => `
        <div class="${c}"><label class="form-label small mb-0">${l}</label><input id="mq_${k}" class="form-control form-control-sm" ${k === "CostPrice" ? 'type="number" step="any" min="0"' : ""} ${k === "Category" ? 'list="mqCats"' : ""}></div>`).join("")}
    </div><datalist id="mqCats"><option value="包材"><option value="冷凍"><option value="乳製品"><option value="糖類"><option value="粉類"></datalist>
    <div class="small text-muted mt-2" id="mqHint"></div></div>
    <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">取消</button><button type="button" class="btn btn-primary" id="mqSave">💾 儲存</button></div>
</div></div>`;
        document.body.appendChild(el);
        modal = new bootstrap.Modal(el);
        el.querySelector("#mqSave").addEventListener("click", save);
    }

    const val = k => el.querySelector("#mq_" + k).value.trim();

    function open(o = {}) {

        if (!el) build();

        current = o.material || null;
        done = o.onSaved || null;

        const src = current || { MaterialName: o.name || "", Category: o.category || "", Unit: o.unit || "g" };

        el.querySelector("#mqTitle").textContent = current ? `✏️ 修改：${current.MaterialName}` : "＋ 新增到原料庫";
        FIELDS.forEach(([k]) => { el.querySelector("#mq_" + k).value = src[k] ?? ""; });
        el.querySelector("#mqHint").textContent = current
            ? "修改後，所有連結這個原料的配方與產品，名稱與單價都會跟著更新（配方裡已記錄的單價要按「更新單價」才會換）。"
            : "新增後會自動連結到目前這一列。";

        modal.show();
        setTimeout(() => el.querySelector("#mq_MaterialName").focus(), 300);
    }

    async function save() {

        const data = {};
        FIELDS.forEach(([k]) => { data[k] = val(k); });

        if (!data.MaterialName) { alert("請輸入名稱"); return; }
        data.CostPrice = data.CostPrice === "" ? null : Number(data.CostPrice);
        if (data.CostPrice !== null && (isNaN(data.CostPrice) || data.CostPrice < 0)) { alert("單價請輸入 0 以上的數字"); return; }
        if (!data.Unit) data.Unit = "g";

        const btn = el.querySelector("#mqSave");

        try {
            btn.disabled = true;
            const row = current ? await API.update("Material", current.ID, data) : await API.insert("Material", Object.assign({ IsActive: true }, data));
            modal.hide();
            if (done) done(row);
        } catch (err) {
            App.error(err, "儲存失敗");
        } finally {
            btn.disabled = false;
        }
    }

    return { open };

})();
