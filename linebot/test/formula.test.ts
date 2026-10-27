import assert from "node:assert/strict";
import { test } from "node:test";
import { FormulaBook } from "../src/formula.js";

// 跟網站配方頁相同的測試情境：牛奶冰淇淋 = 牛奶 995 + 二代穩定劑（再製品）5；二代穩定劑 = 刺槐豆膠 10 + 砂糖 90
const materials = [
  { ID: 1, MaterialName: "牛奶", NutritionJson: JSON.stringify({ kcal: 60, protein: 3, sodium: 40 }), Ingredients: "生乳" },
  { ID: 2, MaterialName: "刺槐豆膠", NutritionJson: "" },
  { ID: 3, MaterialName: "砂糖", NutritionJson: JSON.stringify({ kcal: 400, carb: 100, sugar: 100 }), Ingredients: "砂糖" },
  { ID: 4, MaterialName: "巧克力", Ingredients: "可可膏、砂糖、可可脂(植物性)" },
];
const formulas = [
  { FormulaID: 10, FormulaName: "牛奶冰淇淋", YieldQty: 10, YieldUnit: "杯", UnitWeight: 100, YieldRate: 100, IsActive: true },
  { FormulaID: 20, FormulaName: "二代穩定劑", YieldQty: 1, UnitWeight: 100, YieldRate: 100, IsActive: true, IsSemi: true },
  { FormulaID: 30, FormulaName: "巧克力醬", YieldQty: 1, UnitWeight: 500, YieldRate: 80, IsActive: true },
  { FormulaID: 31, FormulaName: "巧克力醬（舊版）", YieldQty: 1, UnitWeight: 500, IsActive: false },
];
const details = [
  { FormulaDetailID: 1, FormulaID: 10, MaterialID: "1", MaterialName: "牛奶", Quantity: 995, UnitCost: 0.1, SortOrder: 1 },
  { FormulaDetailID: 2, FormulaID: 10, MaterialID: "", SubFormulaId: "20", MaterialName: "二代穩定劑", Quantity: 5, UnitCost: 0.236, SortOrder: 2 },
  { FormulaDetailID: 3, FormulaID: 20, MaterialID: "2", MaterialName: "刺槐豆膠", Quantity: 10, UnitCost: 2, SortOrder: 1 },
  { FormulaDetailID: 4, FormulaID: 20, MaterialID: "3", MaterialName: "砂糖", Quantity: 90, UnitCost: 0.04, SortOrder: 2 },
  { FormulaDetailID: 5, FormulaID: 30, MaterialID: "4", MaterialName: "巧克力", Quantity: 300, SortOrder: 1 },
  { FormulaDetailID: 6, FormulaID: 30, MaterialID: "1", MaterialName: "牛奶", Quantity: 700, SortOrder: 2 },
  { FormulaDetailID: 7, FormulaID: 31, MaterialID: "4", MaterialName: "巧克力", Quantity: 1, SortOrder: 1 },
];
const book = () => new FormulaBook({ formulas, details, materials });
const close = (a: number, b: number, msg = "") => assert.ok(Math.abs(a - b) < 1e-6, `${msg} ${a} ≠ ${b}`);

test("預設份數：10 杯 × 100 g", () => {
  const c = book().scale(formulas[0]);
  close(c.raw, 1000);
  close(c.lines[0].scaled, 995);
  close(c.lines[1].scaled, 5);
  close(c.portions, 10);
});

test("依成品重量換算，用到的再製品也換算", () => {
  const b = book();
  const c = b.scale(formulas[0], { finishedG: 3000 });
  close(c.lines[0].scaled, 2985, "牛奶");
  close(c.lines[1].scaled, 15, "穩定劑");
  close(c.materialCost, 2985 * 0.1 + 15 * 0.236, "原料成本");
  const [blk] = b.subRecipes(formulas[0], c.lines.map((l) => l.scaled));
  assert.equal(blk.sub.FormulaName, "二代穩定劑");
  close(blk.need, 15);
  close(blk.lines[0].scaled, 1.5, "刺槐豆膠");
  close(blk.lines[1].scaled, 13.5, "砂糖");
});

test("成品率：成品 400 g、成品率 80% → 備料 500 g", () => {
  const c = book().scale(formulas[2], { finishedG: 400 });
  close(c.raw, 500);
  close(c.lines[0].scaled, 150);
  close(c.lines[1].scaled, 350);
  close(c.finished, 400);
});

test("份數與依食材換算", () => {
  const b = book();
  close(b.scale(formulas[0], { portions: 3 }).raw, 300);
  const c = b.scale(formulas[0], { ingredient: "牛奶", ingredientG: 1990 });
  close(c.raw, 2000);
  close(c.lines[1].scaled, 10);
  assert.throws(() => b.scale(formulas[0], { ingredient: "鳳梨", ingredientG: 10 }), /沒有「鳳梨」/);
});

test("找配方：編號、完整名稱、關鍵字；停用的排後面", () => {
  const b = book();
  assert.equal(b.find("10").match?.FormulaName, "牛奶冰淇淋");
  assert.equal(b.find("#20").match?.FormulaName, "二代穩定劑");
  assert.equal(b.find("牛奶冰淇淋").match?.FormulaID, 10);
  // 「巧克力醬」完全相同 → 直接選到
  assert.equal(b.find("巧克力醬").match?.FormulaID, 30);
  // 「巧克力」包含兩個，只有一個啟用 → 選啟用的
  const r = b.find("巧克力");
  assert.equal(r.match?.FormulaID, 30);
  assert.equal(r.candidates.length, 2);
  assert.equal(b.find("不存在").match, undefined);
});

test("成分標示：再製品展開、複合原料顯示成分，依重量排序", () => {
  const b = book();
  const lb = b.label(formulas[0]);
  assert.equal(lb.nested, "牛奶(生乳)、二代穩定劑(砂糖、刺槐豆膠)");
  assert.equal(lb.flat, "牛奶(生乳)、砂糖、刺槐豆膠");
  assert.deepEqual(lb.missing, ["刺槐豆膠"]);
  assert.equal(b.label(formulas[2]).nested, "牛奶(生乳)、巧克力(可可膏、砂糖、可可脂(植物性))");
});

test("營養素：每 100 g 依用量加總；沒有資料的列出", () => {
  const nu = book().nutrition(formulas[0]);
  // 牛奶 995 g、砂糖 4.5 g、刺槐豆膠 0.5 g（共 1000 g）
  close(nu.per100.kcal, (995 * 0.6 + 4.5 * 4) / 10);
  close(nu.per100.sugar, (4.5 * 1) / 10);
  close(nu.per100.sodium, (995 * 0.4) / 10);
  close(nu.perServing.kcal, nu.per100.kcal);
  assert.deepEqual(nu.missing.map((m) => m.name), ["刺槐豆膠"]);
});

test("自己包含自己的配方不會無限展開", () => {
  const loop = [...details, { FormulaDetailID: 9, FormulaID: 20, SubFormulaId: "10", MaterialName: "牛奶冰淇淋", Quantity: 1, SortOrder: 3 }];
  const b = new FormulaBook({ formulas, details: loop, materials });
  assert.ok(b.label(formulas[0]).nested.startsWith("牛奶"));
  assert.ok(b.subRecipes(formulas[0], [995, 5]).length >= 1);
});
