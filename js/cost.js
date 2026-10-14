// =========================================================
// 產品成本計算（產品頁、產品成本重算共用）
//   產品成本 = 配方用量的成本 + 包材成本
//   配方用量：份數（每份 = 配方的「每份重量」）或重量（成品公克數）
//     例：配方一份 5000 g，產品只用 1000 g → 用量選「重量」填 1000
//   原料單價優先用原料庫目前的價格（有連結的原料），沒有連結才用配方裡記的單價
//   包材：產品記錄 [{ MaterialID, Name, Qty, UnitCost }]，單價優先用原料庫目前的價格
//   裝飾 / 配料：同一個清單，多一個 Kind: "decor"（不是包材的食材），成本另外顯示
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

    // 原料的規格選項（規格 / 產地 / 供應商 / 價格）：[{ id, label, weight, price, origin, supplier, def }]
    options(m) {
        try { const a = JSON.parse((m && m.PackagesJson) || "[]"); return Array.isArray(a) ? a.filter(x => x && typeof x === "object") : []; } catch { return []; }
    },

    // 指定的規格選項的每單位單價；找不到（沒指定 / 選項已刪除）→ null
    optionPrice(m, id) {
        if (!id || !m) return null;
        const o = this.options(m).find(x => String(x.id) === String(id));
        return o && this.num(o.weight) > 0 && this.num(o.price) > 0 ? this.num(o.price) / this.num(o.weight) : null;
    },

    // 配方食材的單價：指定了規格選項 → 該選項；否則原料目前的單價；沒連原料 → 配方裡記的單價
    detailPrice(d, m) {
        const o = this.optionPrice(m, d.PackageId);
        if (o !== null) return o;
        return m && m.CostPrice !== null && m.CostPrice !== undefined && m.CostPrice !== "" ? this.num(m.CostPrice) : this.num(d.UnitCost);
    },

    // 配方每份重量（沒填就用「原料總重 ÷ 預設倍數」）
    unitWeight(f, details) {
        const base = details.reduce((s, d) => s + this.num(d.Quantity), 0);
        const w = this.num(f.UnitWeight);
        if (w > 0) return w;
        const def = this.num(f.YieldQty);
        return def > 0 ? base / def : base;
    },

    // 再製品（自己做的伯爵茶、焦糖醬…）每成品公克的成本 = 那個配方每公克原料成本 + 每份的人工 / 包材 / 其他 ÷ 每份重量
    //   ctx：{ formulas, allDetails, materials, seen }；seen 防止配方互相包含造成無限循環
    gramCost(sub, ctx) {

        const seen = ctx.seen || (ctx.seen = new Set());
        const id = String(sub.FormulaID);

        if (seen.has(id)) return { price: 0, missing: [(sub.FormulaName || id) + "（配方互相包含）"] };

        seen.add(id);

        try {
            const det = (ctx.allDetails || []).filter(x => String(x.FormulaID) === id);
            const pg = this.perGram(sub, det, ctx.materials, ctx);
            const uw = this.unitWeight(sub, det);
            const extra = this.num(sub.PackagingCost) + this.num(sub.LaborCost) + this.num(sub.OtherCost);
            return { price: pg.value + (uw > 0 ? extra / uw : 0), missing: pg.missing.map(x => `${sub.FormulaName || id}：${x}`) };
        } finally {
            seen.delete(id);
        }
    },

    // 給配方頁 / 精靈用：某個再製品配方每公克成本
    subGramCost(formulaId, formulas, allDetails, materials) {
        const sub = (formulas || []).find(f => String(f.FormulaID) === String(formulaId));
        return sub ? this.gramCost(sub, { formulas, allDetails, materials, seen: new Set() }) : { price: 0, missing: [] };
    },

    // 配方儲存在 Formula 表的成本欄位（以預設倍數計算，與配方頁一致）
    formulaCosts(f, details, materials, ctx) {
        const m = this.num(f.YieldQty) || 1;
        const uw = this.unitWeight(f, details);
        const pg = this.perGram(f, details, materials, ctx);
        const extra = this.num(f.PackagingCost) + this.num(f.LaborCost) + this.num(f.OtherCost);
        const unit = pg.value * uw + extra;
        const r2 = v => Math.round(v * 100) / 100;
        return { MaterialCost: r2(pg.value * uw * m), UnitCost: r2(unit), TotalCost: r2(unit * m) };
    },

    // 配方每「成品公克」的原料成本（已含成品率）；missing = 沒有單價的原料名稱
    //   食材可以是「再製品」（SubFormulaId）：成本自動來自那個配方（需要 ctx）
    perGram(f, details, materials, ctx) {

        const base = details.reduce((s, d) => s + this.num(d.Quantity), 0);
        const rate = (this.num(f.YieldRate) || 100) / 100;
        const missing = [];
        let sum = 0;

        details.forEach(d => {
            const sub = d.SubFormulaId && ctx ? (ctx.formulas || []).find(x => String(x.FormulaID) === String(d.SubFormulaId)) : null;
            let price, m = null;

            if (sub) {
                const g = this.gramCost(sub, Object.assign({}, ctx, { materials: materials || ctx.materials }));
                price = g.price;
                missing.push(...g.missing);
            } else {
                m = d.MaterialID ? (materials || []).find(x => String(x.ID) === String(d.MaterialID)) : null;
                price = this.detailPrice(d, m);
            }

            if (!price && this.num(d.Quantity) > 0 && !(sub && missing.length)) missing.push((m && m.MaterialName) || d.MaterialName || "（未命名原料）");
            sum += this.num(d.Quantity) * price;
        });

        return { value: base > 0 ? sum / base / rate : 0, missing };
    },

    // p：{ FormulaID, FormulaUseMode, FormulaUseQty, PackagingJson }
    product(p, formulas, allDetails, materials) {

        const out = { formula: 0, extra: 0, packaging: 0, decor: 0, total: 0, grams: 0, formulaName: "", lines: [], missing: [], hasFormula: false };

        const f = p.FormulaID ? (formulas || []).find(x => String(x.FormulaID) === String(p.FormulaID)) : null;

        if (f) {
            const details = (allDetails || []).filter(d => String(d.FormulaID) === String(f.FormulaID));
            const uw = this.unitWeight(f, details);
            const qty = this.num(p.FormulaUseQty);
            const grams = p.FormulaUseMode === "weight" ? qty : qty * uw;
            const pg = this.perGram(f, details, materials, { formulas, allDetails, materials, seen: new Set([String(f.FormulaID)]) });

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
            const decor = x.Kind === "decor";          // 裝飾 / 配料：不是包材的食材（例如餅乾、水果、巧克力片）
            if (!price && this.num(x.Qty) > 0) out.missing.push((m && m.MaterialName) || x.Name || (decor ? "（未命名裝飾）" : "（未命名包材）"));
            if (decor) out.decor += cost; else out.packaging += cost;
            out.lines.push({ name: (m && m.MaterialName) || x.Name || "", qty: this.num(x.Qty), price, cost, unit: (m && m.Unit) || x.Unit || "", kind: decor ? "decor" : "pack" });
        });

        out.total = out.formula + out.extra + out.packaging + out.decor;
        return out;
    }
};
