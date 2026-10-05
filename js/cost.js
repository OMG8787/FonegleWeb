// =========================================================
// 產品成本計算（產品頁、產品成本重算共用）
//   產品成本 = 配方用量的成本 + 包材成本
//   配方用量：份數（每份 = 配方的「每份重量」）或重量（成品公克數）
//     例：配方一份 5000 g，產品只用 1000 g → 用量選「重量」填 1000
//   原料單價優先用原料庫目前的價格（有連結的原料），沒有連結才用配方裡記的單價
//   包材：產品記錄 [{ MaterialID, Name, Qty, UnitCost }]，單價優先用原料庫目前的價格
// =========================================================
window.Cost = {

    num(v) {
        const n = Number(String(v ?? "").replace(/,/g, ""));
        return isNaN(n) ? 0 : n;
    },

    parsePackaging(text) {
        try {
            const a = JSON.parse(text || "[]");
            return Array.isArray(a) ? a.filter(x => x && typeof x === "object") : [];
        } catch {
            return [];
        }
    },

    // 配方每份重量（沒填就用「原料總重 ÷ 預設倍數」）
    unitWeight(f, details) {
        const base = details.reduce((s, d) => s + this.num(d.Quantity), 0);
        const w = this.num(f.UnitWeight);
        if (w > 0) return w;
        const def = this.num(f.YieldQty);
        return def > 0 ? base / def : base;
    },

    // 配方每「成品公克」的原料成本（已含成品率）；missing = 沒有單價的原料名稱
    perGram(f, details, materials) {

        const base = details.reduce((s, d) => s + this.num(d.Quantity), 0);
        const rate = (this.num(f.YieldRate) || 100) / 100;
        const missing = [];
        let sum = 0;

        details.forEach(d => {
            const m = d.MaterialID ? (materials || []).find(x => String(x.ID) === String(d.MaterialID)) : null;
            const price = m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? this.num(m.CostPrice) : this.num(d.UnitCost);
            if (!price && this.num(d.Quantity) > 0) missing.push((m && m.MaterialName) || d.MaterialName || "（未命名原料）");
            sum += this.num(d.Quantity) * price;
        });

        return { value: base > 0 ? sum / base / rate : 0, missing };
    },

    // p：{ FormulaID, FormulaUseMode, FormulaUseQty, PackagingJson }
    product(p, formulas, allDetails, materials) {

        const out = { formula: 0, extra: 0, packaging: 0, total: 0, grams: 0, formulaName: "", lines: [], missing: [], hasFormula: false };

        const f = p.FormulaID ? (formulas || []).find(x => String(x.FormulaID) === String(p.FormulaID)) : null;

        if (f) {
            const details = (allDetails || []).filter(d => String(d.FormulaID) === String(f.FormulaID));
            const uw = this.unitWeight(f, details);
            const qty = this.num(p.FormulaUseQty);
            const grams = p.FormulaUseMode === "weight" ? qty : qty * uw;
            const pg = this.perGram(f, details, materials);

            out.hasFormula = true;
            out.formulaName = f.FormulaName || "";
            out.grams = grams;
            out.formula = grams * pg.value;
            out.missing.push(...pg.missing);

            // 配方裡填的人工 / 其他 / 包材成本是「每份」，依用量換算
            const perPortion = this.num(f.PackagingCost) + this.num(f.LaborCost) + this.num(f.OtherCost);
            out.extra = uw > 0 ? perPortion * grams / uw : 0;
        }

        this.parsePackaging(p.PackagingJson).forEach(x => {
            const m = x.MaterialID ? (materials || []).find(y => String(y.ID) === String(x.MaterialID)) : null;
            const price = m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? this.num(m.CostPrice) : this.num(x.UnitCost);
            const cost = this.num(x.Qty) * price;
            if (!price && this.num(x.Qty) > 0) out.missing.push((m && m.MaterialName) || x.Name || "（未命名包材）");
            out.packaging += cost;
            out.lines.push({ name: (m && m.MaterialName) || x.Name || "", qty: this.num(x.Qty), price, cost, unit: (m && m.Unit) || x.Unit || "" });
        });

        out.total = out.formula + out.extra + out.packaging;
        return out;
    }
};
