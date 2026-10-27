import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row, StartInfo } from "../src/gas.js";
import { Session } from "../src/session.js";
import { addDays, today } from "../src/time.js";
import { buildTools } from "../src/tools.js";

const T = today();
const DB: Record<string, Row[]> = {
  Memos: [
    { ID: 1, Title: "訂冷凍箱", DueDate: addDays(T, 1), Priority: "高", IsDone: false, CreatedBy: "me" },
    { ID: 2, Title: "已經做完", IsDone: true },
    { ID: 3, Title: "很久以後", DueDate: addDays(T, 60), IsDone: false },
  ],
  Calendar: [
    { CalendarId: 1, EventName: "信義市集", StartEventDate: addDays(T, 2), EndEventDate: addDays(T, 3), EventAddress: "信義廣場", CalendarType: 1, DepositAmount: 3000, DepositPayee: "主辦" },
    { CalendarId: 2, EventName: "老闆看牙醫", StartEventDate: addDays(T, 1), CalendarType: 3, UserDB_ID: "boss" },
    { CalendarId: 3, EventName: "我的私事", StartEventDate: addDays(T, 1), CalendarType: 3, UserDB_ID: "me" },
    { CalendarId: 4, EventName: "取消的活動", StartEventDate: addDays(T, 1), IsDeleted: true },
  ],
  CalendarDays: [
    { DayId: 1, CalendarId: 1, EventDate: addDays(T, 2), StartTime: "11:00", EndTime: "20:00" },
    { DayId: 2, CalendarId: 1, EventDate: addDays(T, 3), StartTime: "11:00", EndTime: "18:00" },
  ],
  Orders: [
    { OrderID: 1, OrderNo: "A001", MemberName: "王小明", ProductName: "草莓冰淇淋", Qty: 2, Unit: "盒", TotalAmount: 700, OrderStatus: "待出貨", ExpectedShippingDate: addDays(T, 1), OrderDate: addDays(T, -2) },
    { OrderID: 2, OrderNo: "A001", MemberName: "王小明", ProductName: "芒果冰淇淋", Qty: 1, Unit: "盒", TotalAmount: 700, OrderStatus: "待出貨", ExpectedShippingDate: addDays(T, 1), OrderDate: addDays(T, -2) },
    { OrderID: 3, OrderNo: "A002", CompanyId: 5, ProductName: "香草", Qty: 10, TotalAmount: 3000, OrderStatus: "已完成", OrderDate: addDays(T, -10) },
    { OrderID: 4, OrderNo: "A003", MemberName: "取消哥", ProductName: "香草", Qty: 1, TotalAmount: 100, OrderStatus: "取消", OrderDate: addDays(T, -1) },
  ],
  Companies: [{ ID: 5, CompanyName: "好牧場" }],
  Formula: [{ FormulaID: 10, FormulaName: "草莓冰淇淋", YieldQty: 10, UnitWeight: 100, YieldRate: 100, IsActive: true }],
  FormulaDetail: [
    { FormulaDetailID: 1, FormulaID: 10, MaterialID: "1", MaterialName: "草莓", Quantity: 400, UnitCost: 0.3, SortOrder: 1 },
    { FormulaDetailID: 2, FormulaID: 10, MaterialID: "2", MaterialName: "牛奶", Quantity: 600, UnitCost: 0.1, SortOrder: 2 },
  ],
  Material: [
    { ID: 1, MaterialName: "草莓", Unit: "g", CostPrice: 0.3, CurrentStock: 500, MinStock: 1000, IsActive: true },
    { ID: 2, MaterialName: "牛奶", Unit: "g", CostPrice: 0.1, CurrentStock: 9000, MinStock: 1000, IsActive: true },
  ],
  Receivable: [{ ReceivableID: 1, CompanyId: 5, Item: "10 月貨款", Amount: 3000, PaidAmount: 1000, PaymentStatus: "部分付款", DueDate: addDays(T, -1) }],
};

function session(tables: string[], perms: number[], fetched: string[][] = []) {
  const info: StartInfo = {
    status: "已開通", allowed: true, problem: "", isNew: false, name: "測試", appName: "瘋菓", texts: { welcome: "", pending: "" },
    userId: "me", perms, tables: tables.map((name) => ({ name, title: name + " 說明", cols: [] })),
    labels: { Title: "標題", DueDate: "到期日" },
  };
  return new Session("U" + "0".repeat(32), info, async (_uid, names) => {
    fetched.push(names);
    return Object.fromEntries(names.map((n) => [n, DB[n] ?? []]));
  });
}

const tool = (s: Session, name: string) => {
  const t = buildTools(s).find((x) => x.name === name);
  assert.ok(t, `沒有工具 ${name}`);
  return t;
};

test("只提供有權限的工具", () => {
  const names = buildTools(session(["Memos", "Calendar", "CalendarDays"], [20])).map((t) => t.name);
  assert.deepEqual(names, ["overview", "memos", "calendar", "query_table"]);
  const all = buildTools(session(Object.keys(DB).concat(["Products", "Inventory", "PackingItems"]), [13])).map((t) => t.name);
  for (const n of ["formula", "formulas", "orders", "receivables", "products", "materials", "inventory", "packing"]) assert.ok(all.includes(n), n);
});

test("行事曆：別人的私人行程、取消的活動不顯示；多天活動列出每天時間", async () => {
  const out = await tool(session(["Calendar", "CalendarDays"], [20]), "calendar").handler({});
  assert.match(out, /信義市集/);
  assert.match(out, /11:00–20:00/);
  assert.match(out, /保證金：\$3,000/);
  assert.match(out, /我的私事/);
  assert.doesNotMatch(out, /老闆看牙醫/);
  assert.doesNotMatch(out, /取消的活動/);
  const all = await tool(session(["Calendar", "CalendarDays"], [20]), "calendar").handler({ include_cancelled: true, keyword: "取消" });
  assert.match(all, /取消的活動（已取消）/);
});

test("備忘錄：預設不含已完成；關鍵字", async () => {
  const s = session(["Memos"], []);
  const out = await tool(s, "memos").handler({});
  assert.match(out, /共 2 筆/);
  assert.doesNotMatch(out, /已經做完/);
  assert.match(await tool(s, "memos").handler({ keyword: "冷凍", include_done: true }), /共 1 筆/);
});

test("訂單：同編號合併、客戶名稱連到公司、預設只看進行中", async () => {
  const s = session(["Orders", "Companies"], [23]);
  const open = await tool(s, "orders").handler({});
  assert.match(open, /共 1 張進行中訂單/);
  assert.match(open, /A001｜王小明｜待出貨/);
  assert.match(open, /草莓冰淇淋 ×2盒、芒果冰淇淋 ×1盒/);
  const kw = await tool(s, "orders").handler({ keyword: "好牧場" });
  assert.match(kw, /A002｜好牧場｜已完成/);
  const all = await tool(s, "orders").handler({ open_only: false });
  assert.match(all, /共 3 張訂單，總額 \$3,700（不含取消/);
});

test("配方工具：換算 3 公斤；成本只給商品 / 財務權限", async () => {
  const s = session(["Formula", "FormulaDetail", "Material"], [22]);
  const out = await tool(s, "formula").handler({ name: "草莓", finished_g: 3000 });
  assert.match(out, /草莓：1,200 g（40\.0%）/);
  assert.match(out, /牛奶：1,800 g（60\.0%）/);
  assert.match(out, /原料成本約 \$540/);
  const notFound = await tool(s, "formula").handler({ name: "鳳梨" });
  assert.match(notFound, /找不到配方/);
});

test("概況：依權限組合，逾期帳款、低庫存", async () => {
  const fetched: string[][] = [];
  const s = session(["Memos", "Calendar", "CalendarDays", "Orders", "Companies", "Receivable"], [20, 23, 24], fetched);
  const out = await tool(s, "overview").handler({ days: 7 });
  assert.match(out, /📅 行程（2）/);
  assert.match(out, /訂冷凍箱/);
  assert.doesNotMatch(out, /很久以後/);
  assert.match(out, /進行中訂單 1 張/);
  assert.match(out, /未收帳款 1 筆，合計 \$2,000/);
  assert.match(out, /逾期/);
  // 只向系統要有權限的表、一次要完
  assert.equal(fetched.length, 1);
  assert.ok(!fetched[0].includes("Inventory"));
  const low = await tool(session(["Material"], [22]), "materials").handler({ low_stock_only: true });
  assert.match(low, /共 1 個原料/);
  assert.match(low, /草莓.*⚠️ 不足/);
});

test("查詢資料表：沒權限的拒絕、欄位用中文、同一張表只讀一次", async () => {
  const fetched: string[][] = [];
  const s = session(["Memos"], [], fetched);
  const q = tool(s, "query_table");
  assert.match(await q.handler({ table: "Receivable" }), /沒有權限/);
  const out = await q.handler({ table: "Memos", keyword: "冷凍" });
  assert.match(out, /符合 1 筆/);
  assert.match(out, /標題=訂冷凍箱/);
  await q.handler({ table: "Memos", field: "Priority", value: "高" });
  assert.equal(fetched.length, 1);
});
