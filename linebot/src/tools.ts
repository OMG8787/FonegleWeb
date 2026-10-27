import type { Tool } from "./ai.js";
import { FormulaBook, grams, NUTRITION_FIELDS, num } from "./formula.js";
import type { Row } from "./gas.js";
import type { Session } from "./session.js";
import { addDays, daysFrom, hm, showDate, today, ymd } from "./time.js";

// 給 AI 的查詢工具：每個工具只在有權限讀取需要的資料表時才提供
// 回傳精簡的文字（AI 再整理成回答）；資料都經過系統的權限檢查

const MAX_CHARS = 7000;
const str = (v: unknown) => String(v ?? "").trim();
const words = (kw: unknown) => str(kw).toLowerCase().split(/\s+/).filter(Boolean);
const matches = (fields: unknown[], kw: unknown) => {
  const ws = words(kw);
  return ws.every((w) => fields.some((f) => str(f).toLowerCase().includes(w)));
};
const money = (n: number) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const clip = (v: unknown, n: number) => {
  const s = str(v).replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n) + "…" : s;
};
const argStr = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const argNum = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? undefined : n;
};
const argBool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : fallback);

/** 結果太長就截斷（AI 一次看不了太多） */
function finish(lines: string[], more = 0): string {
  let out = "";
  let shown = 0;
  for (const line of lines) {
    if (out.length + line.length > MAX_CHARS) break;
    out += line + "\n";
    shown++;
  }
  const hidden = lines.length - shown + more;
  return (out.trim() || "（沒有資料）") + (hidden > 0 ? `\n…還有 ${hidden} 筆沒列出，請縮小範圍（加關鍵字或日期）` : "");
}

const noAccess = (what: string) => `🔐 沒有權限查詢${what}`;

// ------------------------------------------------------------
// 共用：行事曆、訂單
// ------------------------------------------------------------
const CAL_TYPES: Record<string, string> = { "1": "公開活動", "2": "會議", "3": "私人行程", "4": "其他" };

interface CalEvent {
  id: string;
  name: string;
  start: string;
  end: string;
  days: { date: string; time: string }[];
  address: string;
  note: string;
  type: string;
  cancelled: boolean;
  deposit: number;
  payee: string;
}

function calendarEvents(session: Session, cal: Row[], days: Row[]): CalEvent[] {
  return cal
    // 別人的私人行程不顯示（跟網站一樣）
    .filter((e) => !str(e.UserDB_ID) || str(e.UserDB_ID) === session.info.userId)
    .map((e) => {
      const ds = days
        .filter((d) => str(d.CalendarId) === str(e.CalendarId) && ymd(d.EventDate))
        .map((d) => ({ date: ymd(d.EventDate), time: [hm(d.StartTime) || str(d.StartTime), hm(d.EndTime) || str(d.EndTime)].filter(Boolean).join("–") }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const start = ds[0]?.date || ymd(e.StartEventDate);
      const end = ds.at(-1)?.date || ymd(e.EndEventDate) || start;
      if (!ds.length && hm(e.StartEventDate)) ds.push({ date: start, time: [hm(e.StartEventDate), hm(e.EndEventDate)].filter(Boolean).join("–") });
      return {
        id: str(e.CalendarId), name: str(e.EventName), start, end, days: ds, address: str(e.EventAddress), note: str(e.Note),
        type: CAL_TYPES[str(e.CalendarType) || "1"] ?? "", cancelled: e.IsDeleted === true, deposit: num(e.DepositAmount), payee: str(e.DepositPayee),
      };
    })
    .filter((e) => e.start)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function eventLine(e: CalEvent, from?: string, to?: string): string {
  const range = e.start === e.end ? showDate(e.start) : `${showDate(e.start)}～${showDate(e.end)}`;
  const inRange = e.days.filter((d) => (!from || d.date >= from) && (!to || d.date <= to));
  const times = (inRange.length ? inRange : e.days).filter((d) => d.time).map((d) => (e.days.length > 1 ? `${showDate(d.date)} ${d.time}` : d.time));
  return [
    `・${range} ${e.name}${e.cancelled ? "（已取消）" : ""}${e.type && e.type !== "公開活動" ? `［${e.type}］` : ""}`,
    times.length ? `  時間：${times.slice(0, 6).join("、")}${times.length > 6 ? "…" : ""}` : "",
    e.address ? `  地點：${e.address}` : "",
    e.deposit ? `  保證金：${money(e.deposit)}${e.payee ? `（付給 ${e.payee}）` : ""}` : "",
    e.note ? `  備註：${clip(e.note, 120)}` : "",
  ].filter(Boolean).join("\n");
}

const OPEN_ORDER = (o: OrderGroup) => !["已完成", "取消"].includes(o.status) && o.pay !== "退款";

interface OrderGroup {
  no: string;
  date: string;
  ship: string;
  customer: string;
  phone: string;
  channel: string;
  status: string;
  pay: string;
  shipping: string;
  total: number;
  items: string[];
  note: string;
}

function groupOrders(rows: Row[], companies: Row[] | null): OrderGroup[] {
  const companyName = new Map((companies ?? []).map((c) => [str(c.ID), str(c.CompanyName)]));
  const map = new Map<string, OrderGroup>();
  rows.forEach((r) => {
    const no = str(r.OrderNo);
    if (!no) return;
    let o = map.get(no);
    if (!o) {
      o = {
        no, date: ymd(r.OrderDate), ship: ymd(r.ExpectedShippingDate),
        customer: companyName.get(str(r.CompanyId)) || str(r.MemberName) || str(r.ContactName),
        phone: str(r.MemberPhone), channel: str(r.SalesChannel), status: str(r.OrderStatus), pay: str(r.PaymentStatus),
        shipping: str(r.ShippingStatus), total: num(r.TotalAmount), items: [], note: str(r.Note),
      };
      map.set(no, o);
    }
    if (str(r.ProductName)) o.items.push(`${str(r.ProductName)} ×${num(r.Qty)}${str(r.Unit)}`);
  });
  return [...map.values()];
}

function orderLine(o: OrderGroup): string {
  return [
    `・${o.no}｜${o.customer || "（未填客戶）"}｜${o.status || "未填狀態"}${o.pay ? `／${o.pay}` : ""}`,
    `  ${o.date ? "下單 " + showDate(o.date) : ""}${o.ship ? `　預計出貨 ${showDate(o.ship)}` : ""}${o.channel ? `　${o.channel}` : ""}　總額 ${money(o.total)}`,
    `  品項：${o.items.slice(0, 8).join("、")}${o.items.length > 8 ? `…共 ${o.items.length} 項` : ""}`,
    o.note ? `  備註：${clip(o.note, 80)}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// 工具
// ------------------------------------------------------------
export function buildTools(session: Session): Tool[] {
  const can = (...tables: string[]) => tables.every((t) => session.canRead(t));
  const tools: Tool[] = [];

  // ===== 今日 / 近期概況 =====
  tools.push({
    name: "overview",
    description: "近期概況（今天要做什麼、這週有什麼事）：行程、未完成備忘錄、待處理訂單、應收帳款、快到期庫存、保證金。依權限只列看得到的部分。",
    parameters: { type: "object", properties: { days: { type: "number", description: "往後看幾天（預設 7，今天就填 0）" } } },
    handler: async (args) => {
      const days = Math.min(31, Math.max(0, argNum(args.days) ?? 7));
      const t0 = today();
      const end = addDays(t0, days);
      const d = await session.tables(["Calendar", "CalendarDays", "Memos", "Orders", "Companies", "Receivable", "Inventory", "Products", "Material", "Deposits"]);
      const out: string[] = [`範圍：${showDate(t0)}～${showDate(end)}`];

      if (d.Calendar) {
        const evs = calendarEvents(session, d.Calendar, d.CalendarDays ?? []).filter((e) => !e.cancelled && e.start <= end && e.end >= t0);
        out.push(`\n📅 行程（${evs.length}）`, ...(evs.length ? evs.slice(0, 15).map((e) => eventLine(e, t0, end)) : ["・沒有行程"]));
      }

      if (d.Memos) {
        const open = d.Memos.filter((m) => m.IsDone !== true);
        const soon = open
          .filter((m) => (ymd(m.DueDate) && ymd(m.DueDate) <= end) || str(m.Priority) === "高")
          .sort((a, b) => (ymd(a.DueDate) || "9999").localeCompare(ymd(b.DueDate) || "9999"));
        out.push(`\n📝 備忘錄（未完成 ${open.length}，到期或重要 ${soon.length}）`, ...soon.slice(0, 12).map(memoLine));
      }

      if (d.Orders) {
        const open = groupOrders(d.Orders, d.Companies).filter(OPEN_ORDER);
        const due = open.filter((o) => o.status === "待確認" || (o.ship && o.ship <= end)).sort((a, b) => (a.ship || "0").localeCompare(b.ship || "0"));
        const byStatus = new Map<string, number>();
        open.forEach((o) => byStatus.set(o.status || "未填", (byStatus.get(o.status || "未填") ?? 0) + 1));
        out.push(`\n🧾 進行中訂單 ${open.length} 張（${[...byStatus].map(([k, v]) => `${k} ${v}`).join("、") || "無"}）；待確認或範圍內要出貨：`, ...(due.length ? due.slice(0, 10).map(orderLine) : ["・沒有"]));
      }

      if (d.Receivable) {
        const unpaid = d.Receivable.filter((r) => str(r.PaymentStatus) !== "已付款" && ymd(r.DueDate) && ymd(r.DueDate) <= end);
        out.push(`\n💰 範圍內到期（含逾期）未收帳款 ${unpaid.length} 筆，合計 ${money(unpaid.reduce((t, r) => t + num(r.Amount) - num(r.PaidAmount), 0))}`, ...unpaid.slice(0, 10).map(receivableLine));
      }

      if (d.Inventory) {
        const names = itemNames(d.Products, d.Material);
        const exp = d.Inventory.filter((r) => num(r.StockQty) > 0 && ymd(r.ExpDate) && daysFrom(ymd(r.ExpDate)) <= Math.max(days, 14) && r.IsActive !== false);
        out.push(`\n📦 14 天內到期的庫存 ${exp.length} 筆`, ...exp.slice(0, 10).map((r) => `・${names(r)} ${num(r.StockQty)}${str(r.Unit)}，到期 ${showDate(ymd(r.ExpDate))}${daysFrom(ymd(r.ExpDate)) < 0 ? "（已過期）" : ""}`));
      }

      if (d.Deposits) {
        const dep = d.Deposits.filter((x) => !ymd(x.ReturnedDate) && str(x.Status) !== "已退還" && ymd(x.ExpectReturnDate) && ymd(x.ExpectReturnDate) <= end);
        if (dep.length) out.push(`\n🏦 範圍內該退還的保證金 ${dep.length} 筆`, ...dep.map((x) => `・${str(x.EventName)} ${money(num(x.Amount))}（${str(x.Payee)}），預計 ${showDate(ymd(x.ExpectReturnDate))}`));
      }

      return finish(out);
    },
  });

  // ===== 備忘錄 =====
  if (can("Memos")) {
    tools.push({
      name: "memos",
      description: "查備忘錄（自己的、同事共享的、系統通知）。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "關鍵字（標題或內容），可留空" },
          include_done: { type: "boolean", description: "是否包含已完成（預設否）" },
        },
      },
      handler: async (args) => {
        const { Memos } = await session.tables(["Memos"]);
        const list = (Memos ?? [])
          .filter((m) => argBool(args.include_done) || m.IsDone !== true)
          .filter((m) => matches([m.Title, m.Content], args.keyword))
          .sort((a, b) => Number(a.IsDone === true) - Number(b.IsDone === true) || (ymd(a.DueDate) || "9999").localeCompare(ymd(b.DueDate) || "9999"));
        return finish([`共 ${list.length} 筆`, ...list.map(memoLine)]);
      },
    });
  }

  // ===== 行事曆 =====
  if (can("Calendar")) {
    tools.push({
      name: "calendar",
      description: "查行事曆活動（市集、出攤、會議…）：日期、每天的營業時間、地點、保證金、備註。",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "起日 YYYY-MM-DD（預設今天）" },
          to: { type: "string", description: "迄日 YYYY-MM-DD（預設起日後 30 天）" },
          keyword: { type: "string", description: "活動名稱、地點或備註的關鍵字" },
          include_cancelled: { type: "boolean", description: "是否包含已取消的活動" },
        },
      },
      handler: async (args) => {
        const from = ymd(args.from) || today();
        const to = ymd(args.to) || addDays(from, 30);
        const d = await session.tables(["Calendar", "CalendarDays"]);
        const evs = calendarEvents(session, d.Calendar ?? [], d.CalendarDays ?? [])
          .filter((e) => argBool(args.include_cancelled) || !e.cancelled)
          .filter((e) => e.start <= to && e.end >= from)
          .filter((e) => matches([e.name, e.address, e.note], args.keyword));
        return finish([`${showDate(from)}～${showDate(to)} 共 ${evs.length} 個活動`, ...evs.map((e) => eventLine(e, from, to))]);
      },
    });
  }

  // ===== 配方 =====
  if (can("Formula", "FormulaDetail")) {
    const book = async () => {
      const d = await session.tables(["Formula", "FormulaDetail", "Material"]);
      return new FormulaBook({ formulas: d.Formula ?? [], details: d.FormulaDetail ?? [], materials: d.Material ?? [] });
    };

    tools.push({
      name: "formulas",
      description: "列出 / 搜尋配方名稱（不知道確切名稱時先用這個）。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "配方名稱關鍵字，留空列出全部" },
          semi_only: { type: "boolean", description: "只列再製品（醬、基底、穩定劑等自製半成品）" },
        },
      },
      handler: async (args) => {
        const b = await book();
        const list = (await session.tables(["Formula"])).Formula!
          .filter((f) => !argBool(args.semi_only) || f.IsSemi === true)
          .filter((f) => matches([f.FormulaName, f.FormulaCode, f.Groups], args.keyword))
          .sort((a, c) => Number(c.IsActive !== false) - Number(a.IsActive !== false) || str(a.FormulaName).localeCompare(str(c.FormulaName), "zh-Hant"));
        return finish([`共 ${list.length} 個配方`, ...list.map((f) => {
          const s = b.spec(f);
          return `・#${str(f.FormulaID)} ${str(f.FormulaName)}${f.IsSemi === true ? "（再製品）" : ""}${f.IsActive === false ? "（停用）" : ""}：${s.items.length} 種食材，每份 ${grams(s.unitWeight)} g${s.yieldRate !== 1 ? `，成品率 ${grams(s.yieldRate * 100)}%` : ""}${str(f.Groups) ? `，分類 ${str(f.Groups)}` : ""}`;
        })]);
      },
    });

    tools.push({
      name: "formula",
      description:
        "查一個配方的食材用量，可依需求換算（做幾公斤、做幾份、或依某個食材的重量）；用到的再製品配方也會一起換算。也可以查成分標示與營養標示。換算方式擇一，都不填就用配方預設份數。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "配方名稱或編號" },
          finished_g: { type: "number", description: "想做的成品總重（公克），例如 3 公斤填 3000" },
          portions: { type: "number", description: "想做幾份（單位依配方）" },
          ingredient: { type: "string", description: "依這個食材的重量換算（例如手上只有 2000 g 牛奶）" },
          ingredient_g: { type: "number", description: "上面那個食材有幾公克" },
          label: { type: "boolean", description: "要不要附成分標示（材料(成分)，依重量排序）" },
          nutrition: { type: "boolean", description: "要不要附營養標示（每 100 g / 每份）" },
        },
        required: ["name"],
      },
      handler: async (args) => {
        const b = await book();
        const { match, candidates } = b.find(argStr(args.name));
        if (!match) {
          return candidates.length
            ? `找到 ${candidates.length} 個相似的配方，請確認是哪一個：\n${candidates.slice(0, 15).map((f) => `・#${str(f.FormulaID)} ${str(f.FormulaName)}${f.IsActive === false ? "（停用）" : ""}`).join("\n")}`
            : `找不到配方「${argStr(args.name)}」，可以用 formulas 工具搜尋`;
        }
        const c = b.scale(match, {
          finishedG: argNum(args.finished_g),
          portions: argNum(args.portions),
          ingredient: argStr(args.ingredient) || undefined,
          ingredientG: argNum(args.ingredient_g),
        });
        const out = [
          `🍦 ${str(match.FormulaName)}（#${str(match.FormulaID)}${match.IsActive === false ? "，停用中" : ""}${match.IsVerified === true ? "，已確認" : ""}）`,
          `換算：${c.basis} → 成品約 ${grams(c.finished)} g（約 ${grams(c.portions, 2)} ${str(match.YieldUnit) || "份"}）${c.yieldRate !== 1 ? `，成品率 ${grams(c.yieldRate * 100)}% → 備料 ${grams(c.raw)} g` : ""}`,
          "食材（製作重量／比例）：",
          ...c.lines.map((l) => `・${l.subId && b.formula(l.subId) ? "🍳" : ""}${l.name}：${grams(l.scaled)} g（${(l.pct * 100).toFixed(1)}%）${l.remark ? `　${clip(l.remark, 40)}` : ""}`),
          `合計 ${grams(c.raw)} g`,
        ];
        if (session.hasPerm(22, 24) && c.materialCost > 0) out.push(`原料成本約 ${money(c.materialCost)}`);
        if (str(match.Description) || str(match.Remark)) out.push(`說明：${clip([match.Description, match.Remark].map(str).filter(Boolean).join("／"), 300)}`);

        for (const blk of b.subRecipes(match, c.lines.map((l) => l.scaled))) {
          out.push(
            `\n${"　".repeat(blk.depth)}🍳 再製品「${str(blk.sub.FormulaName)}」（用在「${blk.parent}」需要 ${grams(blk.need)} g${blk.yieldRate !== 1 ? `，成品率 ${grams(blk.yieldRate * 100)}% → 備料 ${grams(blk.raw)} g` : ""}）：`,
            ...blk.lines.map((l) => `${"　".repeat(blk.depth)}・${l.isSub ? "🍳" : ""}${l.name}：${grams(l.scaled)} g（${(l.pct * 100).toFixed(1)}%）`),
          );
        }

        if (argBool(args.label)) {
          const lb = b.label(match);
          out.push(`\n📋 成分標示（材料(成分)）：${lb.nested}`, `全部展開：${lb.flat}`);
          if (lb.missing.length) out.push(`（${lb.missing.length} 個原料還沒在原料管理建立成分，以名稱顯示：${lb.missing.slice(0, 10).join("、")}）`);
        }
        if (argBool(args.nutrition)) {
          const nu = b.nutrition(match);
          const v = (o: Record<string, number>, f: (typeof NUTRITION_FIELDS)[number]) => `${grams(o[f.k], f.digits)} ${f.unit}`;
          out.push(`\n🥗 營養標示（每份 ${grams(nu.serving)} g）`, ...NUTRITION_FIELDS.map((f) => `${f.label}：每份 ${v(nu.perServing, f)}／每 100 g ${v(nu.per100, f)}${f.dv ? `（每日 ${((nu.perServing[f.k] / f.dv) * 100).toFixed(1)}%）` : ""}`));
          if (nu.missing.length) out.push(`⚠️ ${nu.missing.length} 個原料沒有營養資料（佔 ${(nu.missing.reduce((t, m) => t + m.pct, 0) * 100).toFixed(1)}%），以 0 計，結果會偏低：${nu.missing.slice(0, 10).map((m) => m.name).join("、")}`);
        }
        return finish(out);
      },
    });
  }

  // ===== 產品 =====
  if (can("Products")) {
    tools.push({
      name: "products",
      description: "查產品：規格、售價、會員價、目前庫存、保存天數、狀態。",
      parameters: { type: "object", properties: { keyword: { type: "string", description: "產品名稱、口味、條碼或 SKU" }, include_inactive: { type: "boolean" } } },
      handler: async (args) => {
        const { Products } = await session.tables(["Products"]);
        const showCost = session.hasPerm(22, 24);
        const list = (Products ?? [])
          .filter((p) => argBool(args.include_inactive) || p.IsActive !== false)
          .filter((p) => matches([p.ProductName, p.ShortName, p.Flavor, p.Specification, p.SKU, p.Barcode, p.Groups], args.keyword));
        return finish([`共 ${list.length} 個產品`, ...list.map((p) => {
          const spec = [p.Specification, p.Flavor, p.Capacity].map(str).filter(Boolean).join("／");
          return `・${str(p.ProductName)}${spec ? `（${spec}）` : ""}${p.IsActive === false ? "［停用］" : ""}：售價 ${money(num(p.SalePrice))}${num(p.MemberPrice) ? `，會員價 ${money(num(p.MemberPrice))}` : ""}${showCost && num(p.CostPrice) ? `，成本 ${money(num(p.CostPrice))}` : ""}，庫存 ${num(p.CurrentStock)}${str(p.Unit)}${num(p.ShelfLifeDays) ? `，保存 ${num(p.ShelfLifeDays)} 天` : ""}${str(p.Status) ? `，${str(p.Status)}` : ""}`;
        })]);
      },
    });
  }

  // ===== 原料 =====
  if (can("Material")) {
    tools.push({
      name: "materials",
      description: "查原料：單價、目前庫存、安全庫存、供應商、成分、有沒有營養資料。",
      parameters: {
        type: "object",
        properties: { keyword: { type: "string", description: "原料名稱或分類" }, low_stock_only: { type: "boolean", description: "只列庫存低於安全庫存的" } },
      },
      handler: async (args) => {
        const d = await session.tables(["Material", "Companies"]);
        const supplier = new Map((d.Companies ?? []).map((c) => [str(c.ID), str(c.CompanyName)]));
        const list = (d.Material ?? [])
          .filter((m) => m.IsActive !== false)
          .filter((m) => matches([m.MaterialName, m.Category, m.Description], args.keyword))
          .filter((m) => !argBool(args.low_stock_only) || (num(m.MinStock) > 0 && num(m.CurrentStock) < num(m.MinStock)));
        return finish([`共 ${list.length} 個原料`, ...list.map((m) => {
          const low = num(m.MinStock) > 0 && num(m.CurrentStock) < num(m.MinStock);
          return `・${str(m.MaterialName)}${str(m.Category) ? `［${str(m.Category)}］` : ""}：每${str(m.Unit) || "單位"} ${num(m.CostPrice)} 元，庫存 ${num(m.CurrentStock)}${str(m.Unit)}${num(m.MinStock) ? `（安全庫存 ${num(m.MinStock)}${low ? "，⚠️ 不足" : ""}）` : ""}${supplier.get(str(m.SupplierID)) ? `，供應商 ${supplier.get(str(m.SupplierID))}` : ""}${str(m.Ingredients) ? `，成分：${clip(m.Ingredients, 80)}` : ""}${m.NutritionJson ? "，有營養資料" : ""}`;
        })]);
      },
    });
  }

  // ===== 庫存 =====
  if (can("Inventory")) {
    tools.push({
      name: "inventory",
      description: "查庫存批號：數量、製造日、到期日、位置；可以只看快到期的。",
      parameters: {
        type: "object",
        properties: { keyword: { type: "string", description: "產品 / 原料名稱或批號" }, expiring_days: { type: "number", description: "只列幾天內到期的（含已過期）" } },
      },
      handler: async (args) => {
        const d = await session.tables(["Inventory", "Products", "Material"]);
        const names = itemNames(d.Products, d.Material);
        const within = argNum(args.expiring_days);
        const list = (d.Inventory ?? [])
          .filter((r) => r.IsActive !== false && num(r.StockQty) > 0)
          .filter((r) => matches([names(r), r.BatchNo, r.Location, r.Warehouse], args.keyword))
          .filter((r) => within === undefined || (ymd(r.ExpDate) && daysFrom(ymd(r.ExpDate)) <= within))
          .sort((a, b) => (ymd(a.ExpDate) || "9999").localeCompare(ymd(b.ExpDate) || "9999"));
        return finish([`共 ${list.length} 筆`, ...list.map((r) => `・${names(r)} ${num(r.StockQty)}${str(r.Unit)}${str(r.BatchNo) ? `，批號 ${str(r.BatchNo)}` : ""}${ymd(r.MfgDate) ? `，製造 ${showDate(ymd(r.MfgDate))}` : ""}${ymd(r.ExpDate) ? `，到期 ${showDate(ymd(r.ExpDate))}${daysFrom(ymd(r.ExpDate)) < 0 ? "（已過期）" : ""}` : ""}${str(r.Location) || str(r.Warehouse) ? `，${[r.Warehouse, r.Location].map(str).filter(Boolean).join(" ")}` : ""}`)]);
      },
    });
  }

  // ===== 訂單 =====
  if (can("Orders")) {
    tools.push({
      name: "orders",
      description: "查訂單（同一個訂單編號合併成一張）：客戶、品項、金額、訂單 / 付款 / 出貨狀態、預計出貨日。訂單狀態有：待確認、製作中、待出貨、已出貨、配送中、已完成、取消。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "訂單編號、客戶名稱、電話或產品名稱" },
          status: { type: "string", description: "訂單狀態" },
          from: { type: "string", description: "下單日起 YYYY-MM-DD" },
          to: { type: "string", description: "下單日迄 YYYY-MM-DD" },
          open_only: { type: "boolean", description: "只看還沒完成的（預設：沒有其他條件時是）" },
        },
      },
      handler: async (args) => {
        const d = await session.tables(["Orders", "Companies"]);
        const from = ymd(args.from), to = ymd(args.to), status = argStr(args.status);
        const openOnly = argBool(args.open_only, !argStr(args.keyword) && !status && !from && !to);
        const list = groupOrders(d.Orders ?? [], d.Companies)
          .filter((o) => !openOnly || OPEN_ORDER(o))
          .filter((o) => !status || o.status === status)
          .filter((o) => (!from || o.date >= from) && (!to || o.date <= to))
          .filter((o) => matches([o.no, o.customer, o.phone, o.items.join(" ")], args.keyword))
          .sort((a, b) => (openOnly ? (a.ship || "9999").localeCompare(b.ship || "9999") : b.date.localeCompare(a.date)));
        const total = list.filter((o) => o.status !== "取消" && o.pay !== "退款").reduce((t, o) => t + o.total, 0);
        return finish([`共 ${list.length} 張${openOnly ? "進行中" : ""}訂單，總額 ${money(total)}（不含取消 / 退款）`, ...list.map(orderLine)]);
      },
    });
  }

  // ===== 應收帳款 =====
  if (can("Receivable")) {
    tools.push({
      name: "receivables",
      description: "查應收帳款：誰還沒付、金額、到期日、發票。",
      parameters: {
        type: "object",
        properties: { keyword: { type: "string", description: "付款人、項目或發票號碼" }, unpaid_only: { type: "boolean", description: "只看還沒收齊的（預設是）" } },
      },
      handler: async (args) => {
        const d = await session.tables(["Receivable", "Companies"]);
        const company = new Map((d.Companies ?? []).map((c) => [str(c.ID), str(c.CompanyName)]));
        const list = (d.Receivable ?? [])
          .map((r): Row => ({ ...r, PayerName: str(r.PayerName) || company.get(str(r.CompanyId)) || "" }))
          .filter((r) => !argBool(args.unpaid_only, true) || str(r.PaymentStatus) !== "已付款")
          .filter((r) => matches([r.PayerName, r.Item, r.InvoiceNo, r.OrderID], args.keyword))
          .sort((a, b) => (ymd(a.DueDate) || "9999").localeCompare(ymd(b.DueDate) || "9999"));
        const rest = list.reduce((t, r) => t + num(r.Amount) - num(r.PaidAmount), 0);
        return finish([`共 ${list.length} 筆，未收合計 ${money(rest)}`, ...list.map(receivableLine)]);
      },
    });
  }

  // ===== 出攤備品清單 =====
  if (can("PackingItems")) {
    tools.push({
      name: "packing",
      description: "查出攤備品清單：每次出攤要帶的產品與物件、帶了沒。",
      parameters: { type: "object", properties: { keyword: { type: "string", description: "活動 / 清單名稱或物品" }, include_past: { type: "boolean", description: "包含已經過去的活動" } } },
      handler: async (args) => {
        const { PackingItems } = await session.tables(["PackingItems"]);
        const lists = new Map<string, Row[]>();
        (PackingItems ?? []).forEach((r) => {
          const k = str(r.ListKey) || str(r.ListName);
          lists.set(k, [...(lists.get(k) ?? []), r]);
        });
        const t0 = today();
        const out = [...lists.values()]
          .filter((items) => argBool(args.include_past) || !ymd(items[0].EventDate) || ymd(items[0].EventDate) >= t0)
          .filter((items) => matches([items[0].ListName, ...items.map((i) => i.ItemName)], args.keyword))
          .sort((a, b) => (ymd(a[0].EventDate) || "9999").localeCompare(ymd(b[0].EventDate) || "9999"))
          .map((items) => {
            const done = items.filter((i) => i.IsPacked === true).length;
            return [
              `🧺 ${str(items[0].ListName) || "清單"}${ymd(items[0].EventDate) ? `（${showDate(ymd(items[0].EventDate))}）` : ""}：${done}/${items.length} 已打包`,
              ...items.sort((a, b) => num(a.SortOrder) - num(b.SortOrder)).map((i) => `${i.IsPacked === true ? "✅" : "⬜"} ${str(i.ItemName)}${num(i.Qty) ? ` ×${num(i.Qty)}${str(i.Unit)}` : ""}${str(i.Note) ? `（${clip(i.Note, 40)}）` : ""}`),
            ].join("\n");
          });
        return finish(out.length ? out : ["沒有符合的備品清單"]);
      },
    });
  }

  // ===== 任何資料表 =====
  const tables = session.info.tables ?? [];
  if (tables.length) {
    tools.push({
      name: "query_table",
      description:
        "上面的工具都不適用時，直接查詢系統的資料表（只回傳符合的列）。可以查的資料表：\n" +
        tables.map((t) => `${t.name}：${t.title}`).join("\n"),
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "資料表英文名稱", enum: tables.map((t) => t.name) },
          keyword: { type: "string", description: "任何欄位包含的關鍵字（空白分隔 = 都要包含）" },
          field: { type: "string", description: "要精確比對的欄位英文名稱（選填）" },
          value: { type: "string", description: "那個欄位的值" },
          limit: { type: "number", description: "最多幾筆（預設 15，最多 40）" },
        },
        required: ["table"],
      },
      handler: async (args) => {
        const name = argStr(args.table);
        if (!session.canRead(name)) return noAccess(`「${name}」`);
        const rows = (await session.tables([name]))[name] ?? [];
        const field = argStr(args.field), value = argStr(args.value);
        const hit = rows
          .filter((r) => !field || str(r[field]) === value)
          .filter((r) => matches(Object.values(r), args.keyword));
        const limit = Math.min(40, Math.max(1, argNum(args.limit) ?? 15));
        const skip = new Set(["CreatedBy", "UpdatedBy", "UpdateLineUserId", "CreateLineID", "PassWord"]);
        return finish(
          [`${name} 符合 ${hit.length} 筆${hit.length > limit ? `（列出前 ${limit} 筆）` : ""}`, ...hit.slice(0, limit).map((r, i) =>
            `#${i + 1} ` + Object.entries(r).filter(([k, v]) => !skip.has(k) && str(v) !== "").map(([k, v]) => `${session.label(k)}=${clip(v, 120)}`).join("；"))],
        );
      },
    });
  }

  return tools;
}

function memoLine(m: Row): string {
  const due = ymd(m.DueDate);
  const late = due && daysFrom(due) < 0 && m.IsDone !== true;
  return [
    `・${m.IsDone === true ? "✅" : str(m.Priority) === "高" ? "❗" : "⬜"} ${str(m.Title)}${due ? `（${late ? "⚠️ 已逾期 " : "到期 "}${showDate(due)}）` : ""}${m.IsShared === true ? "［共享］" : ""}${str(m.Audience) ? "［系統通知］" : ""}`,
    str(m.Content) ? `  ${clip(m.Content, 150)}` : "",
  ].filter(Boolean).join("\n");
}

function receivableLine(r: Row): string {
  const due = ymd(r.DueDate);
  const rest = num(r.Amount) - num(r.PaidAmount);
  return `・${str(r.PayerName) || "（未填付款人）"}｜${clip(r.Item, 40)}｜應收 ${money(num(r.Amount))}${num(r.PaidAmount) ? `，已收 ${money(num(r.PaidAmount))}` : ""}${rest > 0 && num(r.PaidAmount) ? `，還差 ${money(rest)}` : ""}${due ? `｜到期 ${showDate(due)}${daysFrom(due) < 0 && str(r.PaymentStatus) !== "已付款" ? "（⚠️ 逾期）" : ""}` : ""}｜${str(r.PaymentStatus) || "未付款"}${str(r.InvoiceNo) ? `｜發票 ${str(r.InvoiceNo)}` : ""}`;
}

/** 庫存列的品名（連到產品或原料） */
function itemNames(products: Row[] | null, materials: Row[] | null) {
  const p = new Map((products ?? []).map((x) => [str(x.ID), str(x.ProductName)]));
  const m = new Map((materials ?? []).map((x) => [str(x.ID), str(x.MaterialName)]));
  return (r: Row) => p.get(str(r.ProductID)) || m.get(str(r.MaterialID)) || (str(r.ProductID) ? `產品 #${str(r.ProductID)}` : str(r.MaterialID) ? `原料 #${str(r.MaterialID)}` : "（未知品項）");
}
