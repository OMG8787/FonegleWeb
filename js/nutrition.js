// =========================================================
// 營養成分（原料管理、配方「營養素」共用）
//   每個原料存「每 100 g」的營養成分：Material.NutritionJson = {"kcal":..,"protein":..,...}
//   項目依台灣包裝食品營養標示：熱量、蛋白質、脂肪、飽和脂肪、反式脂肪、碳水化合物、糖、鈉
//   dv = 每日參考值（算每日參考值百分比用；沒有參考值的項目不算）
// =========================================================
window.Nutrition = {

    FIELDS: [
        { k: "kcal", label: "熱量", unit: "大卡", dv: 2000, digits: 1 },
        { k: "protein", label: "蛋白質", unit: "公克", dv: 60, digits: 1 },
        { k: "fat", label: "脂肪", unit: "公克", dv: 60, digits: 1 },
        { k: "satFat", label: "飽和脂肪", unit: "公克", dv: 18, digits: 1, indent: true },
        { k: "transFat", label: "反式脂肪", unit: "公克", dv: null, digits: 1, indent: true },
        { k: "carb", label: "碳水化合物", unit: "公克", dv: 300, digits: 1 },
        { k: "sugar", label: "糖", unit: "公克", dv: null, digits: 1, indent: true },
        { k: "sodium", label: "鈉", unit: "毫克", dv: 2000, digits: 0 }
    ],

    // 原料的營養成分（沒填 = null）
    parse(m) {
        if (!m || !m.NutritionJson) return null;
        try {
            const o = typeof m.NutritionJson === "string" ? JSON.parse(m.NutritionJson) : m.NutritionJson;
            if (!o || typeof o !== "object") return null;
            const out = {};
            this.FIELDS.forEach(f => { const v = Number(o[f.k]); if (o[f.k] !== "" && o[f.k] !== null && o[f.k] !== undefined && !isNaN(v)) out[f.k] = v; });
            return Object.keys(out).length ? out : null;
        } catch {
            return null;
        }
    },

    // 存檔用：全部空白 → ""
    stringify(o) {
        const out = {};
        this.FIELDS.forEach(f => { if (o && o[f.k] !== null && o[f.k] !== undefined && o[f.k] !== "" && !isNaN(Number(o[f.k]))) out[f.k] = Number(o[f.k]); });
        return Object.keys(out).length ? JSON.stringify(out) : "";
    },

    // 原料的成分（包裝上的成分標示）：「砂糖、可可粉、植物油」→ 陣列；沒建立 = []
    //   括號裡的不拆開：「巧克力(可可膏、砂糖)、奶粉」→ ["巧克力(可可膏、砂糖)", "奶粉"]
    ingredients(m) {
        const out = [];
        let cur = "", depth = 0;
        for (const ch of String((m && m.Ingredients) || "")) {
            if ("(（[【".includes(ch)) depth++;
            if (")）]】".includes(ch)) depth = Math.max(0, depth - 1);
            if (!depth && "、,，;；\n".includes(ch)) { out.push(cur); cur = ""; } else cur += ch;
        }
        out.push(cur);
        return out.map(s => s.trim()).filter(Boolean);
    },

    // 複合原料（成分不只自己）：回傳成分陣列；單一原料或沒建立 → null
    compound(m) {
        const list = this.ingredients(m);
        return list.length && !(list.length === 1 && list[0] === String(m.MaterialName || "").trim()) ? list : null;
    },

    fmt(v, f) {
        const n = Number(v) || 0;
        const d = f.digits;
        return (Math.round(n * 10 ** d) / 10 ** d).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    },

    // 原料管理表單用：輸入框（id = prefix + 欄位）
    inputsHtml(prefix) {
        return `<div class="row g-2">${this.FIELDS.map(f => `
            <div class="col-6 col-md-3">
                <label class="form-label small mb-0" for="${prefix}${f.k}">${f.label}（${f.unit}）</label>
                <input id="${prefix}${f.k}" type="number" min="0" step="any" class="form-control form-control-sm" data-nu="${f.k}">
            </div>`).join("")}</div>`;
    },

    readInputs(box) {
        const o = {};
        box.querySelectorAll("[data-nu]").forEach(i => { if (i.value !== "") o[i.dataset.nu] = Number(i.value); });
        return o;
    },

    fillInputs(box, o) {
        box.querySelectorAll("[data-nu]").forEach(i => { const v = o && o[i.dataset.nu]; i.value = v === null || v === undefined ? "" : v; });
    }
};
