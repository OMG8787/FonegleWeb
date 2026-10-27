import type { Row } from "./gas.js";

// 配方計算：跟網站配方頁相同的規則
//   基準重量（Quantity）只代表比例；成品重量 = 份數 × 每份重量，備料總重 = 成品重量 ÷ 成品率
//   再製品（SubFormulaId）依用量換算它自己的配方；成分表、營養素把再製品展開成原物料

export interface FormulaData {
  formulas: Row[];
  details: Row[];
  materials: Row[];
}

export interface Item {
  name: string;
  materialId: string;
  subId: string;
  qty: number;
  unitCost: number;
  remark: string;
}

export const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** 顯示重量：最多 1 位小數，千分位 */
export const grams = (v: number, digits = 1): string =>
  (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString("en-US", { maximumFractionDigits: digits });

const str = (v: unknown) => String(v ?? "").trim();

export const NUTRITION_FIELDS = [
  { k: "kcal", label: "熱量", unit: "大卡", dv: 2000, digits: 1 },
  { k: "protein", label: "蛋白質", unit: "公克", dv: 60, digits: 1 },
  { k: "fat", label: "脂肪", unit: "公克", dv: 60, digits: 1 },
  { k: "satFat", label: "　飽和脂肪", unit: "公克", dv: 18, digits: 1 },
  { k: "transFat", label: "　反式脂肪", unit: "公克", dv: 0, digits: 1 },
  { k: "carb", label: "碳水化合物", unit: "公克", dv: 300, digits: 1 },
  { k: "sugar", label: "　糖", unit: "公克", dv: 0, digits: 1 },
  { k: "sodium", label: "鈉", unit: "毫克", dv: 2000, digits: 0 },
] as const;

export class FormulaBook {
  private byId = new Map<string, Row>();
  private matById = new Map<string, Row>();
  private items = new Map<string, Item[]>();

  constructor(private data: FormulaData) {
    data.formulas.forEach((f) => this.byId.set(str(f.FormulaID), f));
    data.materials.forEach((m) => this.matById.set(str(m.ID), m));
  }

  formula(id: unknown): Row | undefined {
    return this.byId.get(str(id));
  }

  material(id: unknown): Row | undefined {
    return id === "" || id === null || id === undefined ? undefined : this.matById.get(str(id));
  }

  /** 配方的食材（依排序；沒有名稱或重量的略過） */
  itemsOf(formulaId: unknown): Item[] {
    const key = str(formulaId);
    if (!this.items.has(key)) {
      const list = this.data.details
        .filter((d) => str(d.FormulaID) === key)
        .sort((a, b) => num(a.SortOrder) - num(b.SortOrder) || num(a.FormulaDetailID) - num(b.FormulaDetailID))
        .map((d) => ({
          name: str(this.material(d.MaterialID)?.MaterialName) || str(d.MaterialName),
          materialId: str(d.MaterialID),
          subId: str(d.SubFormulaId),
          qty: num(d.Quantity),
          unitCost: num(d.UnitCost),
          remark: str(d.Remark),
        }))
        .filter((x) => x.qty > 0 && (x.name || x.subId));
      this.items.set(key, list);
    }
    return this.items.get(key)!;
  }

  /** 找配方：編號、完全相同的名稱、包含關鍵字；啟用的優先 */
  find(query: string): { match?: Row; candidates: Row[] } {
    const q = query.trim().toLowerCase();
    if (!q) return { candidates: [] };
    const active = (f: Row) => f.IsActive !== false;
    const all = [...this.byId.values()];
    const byId = this.byId.get(q.replace(/^#/, ""));
    if (byId) return { match: byId, candidates: [byId] };
    const exact = all.filter((f) => str(f.FormulaName).toLowerCase() === q);
    if (exact.length) return { match: exact.find(active) ?? exact[0], candidates: exact };
    const words = q.split(/\s+/).filter(Boolean);
    const hits = all
      .filter((f) => words.every((w) => [f.FormulaName, f.FormulaCode, f.Groups].some((v) => str(v).toLowerCase().includes(w))))
      .sort((a, b) => Number(active(b)) - Number(active(a)) || str(a.FormulaName).length - str(b.FormulaName).length);
    const activeHits = hits.filter(active);
    const pick = activeHits.length === 1 ? activeHits[0] : hits.length === 1 ? hits[0] : undefined;
    return { match: pick, candidates: hits };
  }

  /** 規格：基準總重、每份重量、成品率、預設份數 */
  spec(f: Row) {
    const items = this.itemsOf(f.FormulaID);
    const base = items.reduce((t, x) => t + x.qty, 0);
    const defMult = num(f.YieldQty) || 0;
    let unitWeight = num(f.UnitWeight);
    if (!unitWeight) unitWeight = defMult > 0 ? base / defMult : base;
    const yieldRate = (num(f.YieldRate) || 100) / 100;
    return { items, base, unitWeight, yieldRate, defMult };
  }

  private expandable(x: Item, seen: Set<string>): Row | undefined {
    const sub = x.subId ? this.formula(x.subId) : undefined;
    return sub && !seen.has(str(sub.FormulaID)) && seen.size < 8 && this.itemsOf(sub.FormulaID).length ? sub : undefined;
  }

  /**
   * 換算：target 擇一 —— finishedG（成品總重）、portions（份數）、ingredient + ingredientG（依某個食材的重量）；都沒有用預設份數
   */
  scale(f: Row, target: { finishedG?: number; portions?: number; ingredient?: string; ingredientG?: number } = {}) {
    const s = this.spec(f);
    let raw: number;
    let basis: string;
    if (target.ingredient && target.ingredientG && target.ingredientG > 0) {
      const q = target.ingredient.trim().toLowerCase();
      const hit = s.items.find((x) => x.name.toLowerCase() === q) ?? s.items.find((x) => x.name.toLowerCase().includes(q));
      if (!hit) throw new Error(`配方裡沒有「${target.ingredient}」，食材有：${s.items.map((x) => x.name).join("、")}`);
      raw = s.base ? (target.ingredientG * s.base) / hit.qty : 0;
      basis = `依「${hit.name}」${grams(target.ingredientG)} g 換算`;
    } else if (target.finishedG && target.finishedG > 0) {
      raw = target.finishedG / s.yieldRate;
      basis = `成品 ${grams(target.finishedG)} g`;
    } else {
      const portions = target.portions && target.portions > 0 ? target.portions : s.defMult || 1;
      raw = (portions * s.unitWeight) / s.yieldRate;
      basis = `${grams(portions, 2)} ${str(f.YieldUnit) || "份"}（每份 ${grams(s.unitWeight)} g）`;
    }
    const factor = s.base ? raw / s.base : 0;
    const lines = s.items.map((x) => ({ ...x, scaled: x.qty * factor, pct: s.base ? x.qty / s.base : 0 }));
    const finished = raw * s.yieldRate;
    return {
      ...s,
      basis,
      raw,
      finished,
      portions: s.unitWeight ? finished / s.unitWeight : 0,
      lines,
      materialCost: lines.reduce((t, l) => t + l.scaled * l.unitCost, 0),
    };
  }

  /** 用到的再製品配方，依這次的用量換算（再製品裡又有再製品就再往下一層） */
  subRecipes(f: Row, amounts: number[]) {
    const blocks: { sub: Row; parent: string; need: number; yieldRate: number; raw: number; depth: number; lines: { name: string; scaled: number; pct: number; isSub: boolean }[] }[] = [];
    const walk = (items: Item[], amts: number[], parent: string, seen: Set<string>, depth: number) =>
      items.forEach((x, i) => {
        const sub = this.expandable(x, seen);
        if (!sub || !(amts[i] > 0)) return;
        const det = this.itemsOf(sub.FormulaID);
        const base = det.reduce((t, d) => t + d.qty, 0);
        const yieldRate = (num(sub.YieldRate) || 100) / 100;
        const raw = amts[i] / yieldRate;
        const scaled = det.map((d) => (base ? (raw * d.qty) / base : 0));
        const inner = new Set([...seen, str(sub.FormulaID)]);
        blocks.push({
          sub, parent, need: amts[i], yieldRate, raw, depth,
          lines: det.map((d, j) => ({ name: d.name, scaled: scaled[j], pct: base ? d.qty / base : 0, isSub: !!this.expandable(d, inner) })),
        });
        walk(det, scaled, str(sub.FormulaName), inner, depth + 1);
      });
    walk(this.itemsOf(f.FormulaID), amounts, str(f.FormulaName), new Set([str(f.FormulaID)]), 0);
    return blocks;
  }

  /** 樹狀成分：weight = 這一層用了幾 g，再製品的食材依比例分下去；同一個原料合併 */
  tree(items: Item[], weight: number, seen: Set<string>): TreeNode[] {
    const base = items.reduce((t, x) => t + x.qty, 0);
    const map = new Map<string, TreeNode>();
    items.forEach((x) => {
      const sub = this.expandable(x, seen);
      const key = sub ? "s:" + str(sub.FormulaID) : x.materialId ? "m:" + x.materialId : "n:" + x.name;
      const node = map.get(key) ?? { key, name: sub ? str(sub.FormulaName) : x.name, materialId: sub ? "" : x.materialId, w: 0, sub };
      node.w += base ? (weight * x.qty) / base : 0;
      map.set(key, node);
    });
    const nodes = [...map.values()];
    nodes.forEach((n) => {
      if (n.sub) n.children = this.tree(this.itemsOf(n.sub.FormulaID), n.w, new Set([...seen, str(n.sub.FormulaID)]));
    });
    return nodes.sort((a, b) => b.w - a.w);
  }

  rootTree(f: Row): TreeNode[] {
    const items = this.itemsOf(f.FormulaID);
    return this.tree(items, items.reduce((t, x) => t + x.qty, 0), new Set([str(f.FormulaID)]));
  }

  /** 全部展開成原物料，重量由多到少 */
  leaves(tree: TreeNode[]): TreeNode[] {
    const out = new Map<string, TreeNode>();
    const walk = (nodes: TreeNode[]) =>
      nodes.forEach((n) => {
        if (n.children) return walk(n.children);
        const o = out.get(n.key) ?? { ...n, w: 0 };
        o.w += n.w;
        out.set(n.key, o);
      });
    walk(tree);
    return [...out.values()].sort((a, b) => b.w - a.w);
  }

  /** 原料管理填的成分（括號裡的不拆開） */
  ingredientsOf(m: Row | undefined): string[] {
    const out: string[] = [];
    let cur = "";
    let depth = 0;
    for (const ch of str(m?.Ingredients)) {
      if ("(（[【".includes(ch)) depth++;
      if (")）]】".includes(ch)) depth = Math.max(0, depth - 1);
      if (!depth && "、,，;；\n".includes(ch)) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  }

  private compound(m: Row | undefined): string[] | null {
    const list = this.ingredientsOf(m);
    return list.length && !(list.length === 1 && list[0] === str(m?.MaterialName)) ? list : null;
  }

  /** 成分標示：材料(成分)，依重量排序；買來的複合原料也顯示成 材料(成分) */
  label(f: Row): { nested: string; flat: string; missing: string[] } {
    const tree = this.rootTree(f);
    const leafLabel = (n: TreeNode) => {
      const c = this.compound(this.material(n.materialId));
      return c ? `${n.name}(${c.join("、")})` : n.name;
    };
    const nested = (nodes: TreeNode[]): string => nodes.map((n) => (n.children ? `${n.name}(${nested(n.children)})` : leafLabel(n))).join("、");
    const leaves = this.leaves(tree);
    return {
      nested: nested(tree),
      flat: leaves.map(leafLabel).join("、"),
      missing: leaves.filter((l) => !this.material(l.materialId)?.Ingredients).map((l) => l.name),
    };
  }

  private nutritionOf(m: Row | undefined): Record<string, number> | null {
    if (!m?.NutritionJson) return null;
    try {
      const o = typeof m.NutritionJson === "string" ? JSON.parse(m.NutritionJson) : m.NutritionJson;
      const out: Record<string, number> = {};
      NUTRITION_FIELDS.forEach((f) => {
        const v = o?.[f.k];
        if (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v))) out[f.k] = Number(v);
      });
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  }

  /** 營養素：原物料每 100 g 營養成分依用量加總，換算回每 100 g 與每份 */
  nutrition(f: Row, byYield = false) {
    const leaves = this.leaves(this.rootTree(f));
    const total = leaves.reduce((t, l) => t + l.w, 0);
    const s = this.spec(f);
    const weight = total * (byYield ? s.yieldRate : 1);
    const sum: Record<string, number> = {};
    NUTRITION_FIELDS.forEach((x) => (sum[x.k] = 0));
    const missing: { name: string; pct: number }[] = [];
    leaves.forEach((l) => {
      const nu = this.nutritionOf(this.material(l.materialId));
      if (!nu) return missing.push({ name: l.name, pct: total ? l.w / total : 0 });
      NUTRITION_FIELDS.forEach((x) => (sum[x.k] += (l.w / 100) * (nu[x.k] || 0)));
    });
    const per100: Record<string, number> = {};
    const perServing: Record<string, number> = {};
    NUTRITION_FIELDS.forEach((x) => {
      per100[x.k] = weight ? (sum[x.k] / weight) * 100 : 0;
      perServing[x.k] = (per100[x.k] * s.unitWeight) / 100;
    });
    return { per100, perServing, serving: s.unitWeight, missing };
  }
}

export interface TreeNode {
  key: string;
  name: string;
  materialId: string;
  w: number;
  sub?: Row;
  children?: TreeNode[];
}
