import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, test } from "node:test";
import { cleanReply, handleEvent, processEvents } from "../src/bot.js";
import type { StartInfo } from "../src/gas.js";
import { validateSignature, type LineEvent } from "../src/line.js";

process.env.LINE_CHANNEL_SECRET = "line-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "line-token";
process.env.GAS_URL = "https://script.example/exec";
process.env.BOT_SECRET = "fb-test";

const UID = "U" + "c".repeat(32);

// ===== 模擬 LINE、管理系統、Gemini =====
let replies: { token: string; texts: string[]; quick: number }[] = [];
let pushes: string[] = [];
let gasCalls: Record<string, unknown>[] = [];
let aiBodies: Record<string, unknown>[] = [];
let startInfo: StartInfo;
let aiScript: unknown[] = [];

const active = (over: Partial<StartInfo> = {}): StartInfo => ({
  status: "已開通", allowed: true, problem: "", isNew: false, name: "阿明", appName: "瘋菓管理系統",
  texts: { welcome: "", pending: "" }, userId: "web1", perms: [22], permNames: ["商品與生產（產品、配方成本、原料、庫存、生產）"],
  tables: ["Formula", "FormulaDetail", "Material", "Memos"].map((name) => ({ name, title: name, cols: [] })),
  labels: {}, prompt: "出貨日是週二、四", history: [{ u: true, t: "嗨" }, { u: false, t: "你好！" }],
  ai: { source: "bot", provider: "gemini", apiKey: "g-key", model: "gemini-test", endpoint: "https://gemini.example/v1beta" },
  ...over,
});

const DB = {
  Formula: [{ FormulaID: 10, FormulaName: "草莓冰淇淋", YieldQty: 10, UnitWeight: 100, YieldRate: 100, IsActive: true }],
  FormulaDetail: [
    { FormulaDetailID: 1, FormulaID: 10, MaterialID: "1", MaterialName: "草莓", Quantity: 400, SortOrder: 1 },
    { FormulaDetailID: 2, FormulaID: 10, MaterialID: "2", MaterialName: "牛奶", Quantity: 600, SortOrder: 2 },
  ],
  Material: [],
  Memos: [],
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  replies = [];
  pushes = [];
  gasCalls = [];
  aiBodies = [];
  aiScript = [];
  startInfo = active();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/chat/loading/start")) return new Response("", { status: 202 });
    if (url.includes("/v2/bot/profile/")) return json({ displayName: "阿明", pictureUrl: "https://p.example/a.jpg" });
    if (url.endsWith("/message/reply")) {
      if (body.replyToken === "expired") return new Response('{"message":"Invalid reply token"}', { status: 400 });
      replies.push({ token: body.replyToken, texts: body.messages.map((m: { text: string }) => m.text), quick: body.messages.at(-1).quickReply?.items.length ?? 0 });
      return json({});
    }
    if (url.endsWith("/message/push")) {
      pushes.push(body.messages[0].text);
      return json({});
    }
    if (url === process.env.GAS_URL) {
      assert.equal(body.action, "bot");
      assert.equal(body.secret, "fb-test");
      gasCalls.push(body);
      if (body.op === "start") return json({ success: true, data: startInfo });
      if (body.op === "call") {
        assert.equal(body.call, "getMany");
        return json({ success: true, data: Object.fromEntries(body.params.tables.map((t: keyof typeof DB) => [t, DB[t]])) });
      }
      return json({ success: true, data: true });
    }
    if (url.startsWith("https://gemini.example/")) {
      assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "g-key");
      aiBodies.push(body);
      return json(aiScript.shift());
    }
    throw new Error("沒有模擬的網址 " + url);
  }) as typeof fetch;
});

const msg = (text: string, replyToken = "r1"): LineEvent => ({ type: "message", replyToken, source: { type: "user", userId: UID }, message: { type: "text", text } });

test("LINE 簽章驗證", () => {
  const body = '{"events":[]}';
  const sig = createHmac("sha256", "line-secret").update(body).digest("base64");
  assert.equal(validateSignature(body, sig), true);
  assert.equal(validateSignature(body + " ", sig), false);
  assert.equal(validateSignature(body, null), false);
});

test("待開通：回覆等待開通，不呼叫 AI", async () => {
  startInfo = { status: "待開通", allowed: false, problem: "", isNew: false, name: "阿明", appName: "瘋菓", texts: { welcome: "", pending: "" } };
  await handleEvent(msg("今天有什麼事"));
  assert.equal(replies.length, 1);
  assert.match(replies[0].texts[0], /等待管理員開通/);
  assert.equal(aiBodies.length, 0);
  const start = gasCalls.find((c) => c.op === "start")!;
  assert.equal(start.displayName, "阿明");
  assert.equal(start.pictureUrl, "https://p.example/a.jpg");
});

test("停用：回覆已停用", async () => {
  startInfo = { status: "停用", allowed: false, problem: "", isNew: false, name: "", appName: "瘋菓", texts: { welcome: "", pending: "" } };
  await handleEvent(msg("嗨"));
  assert.match(replies[0].texts[0], /已停用/);
});

test("加好友：歡迎詞 + 依權限的範例按鈕", async () => {
  await handleEvent({ type: "follow", replyToken: "f1", source: { type: "user", userId: UID } });
  assert.match(replies[0].texts[0], /歡迎使用「瘋菓管理系統」員工助理/);
  assert.match(replies[0].texts[0], /草莓冰淇淋做 3 公斤/);
  assert.ok(replies[0].quick >= 3);
});

test("AI 用工具換算配方後回答；記住對話", async () => {
  aiScript = [
    { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "formula", args: { name: "草莓冰淇淋", finished_g: 3000 } } }] } }] },
    { candidates: [{ content: { role: "model", parts: [{ text: "**草莓冰淇淋 3 公斤**\n- 草莓 1,200 g\n- 牛奶 1,800 g" }] } }] },
  ];
  await handleEvent(msg("草莓冰淇淋做 3 公斤要多少料？"));
  assert.equal(aiBodies.length, 2);
  // 系統說明帶入日期、權限與公司補充說明；對話記憶 + 這次的問題
  const first = aiBodies[0] as { systemInstruction: { parts: { text: string }[] }; contents: { role: string }[]; tools: { functionDeclarations: { name: string }[] }[] };
  const sys = first.systemInstruction.parts[0].text;
  assert.match(sys, /阿明/);
  assert.match(sys, /出貨日是週二、四/);
  assert.match(sys, /不能新增、修改、刪除/);
  assert.equal(first.contents.length, 3);
  const toolNames = first.tools[0].functionDeclarations.map((t) => t.name);
  assert.ok(toolNames.includes("formula") && !toolNames.includes("orders"), toolNames.join());
  // 工具結果送回 AI
  const second = aiBodies[1] as { contents: { parts: { functionResponse?: { response: { result: string } } }[] }[] };
  const result = second.contents.at(-1)!.parts[0].functionResponse!.response.result;
  assert.match(result, /草莓：1,200 g/);
  // LINE 回覆：去掉 Markdown
  assert.equal(replies.length, 1);
  assert.equal(replies[0].texts[0], "草莓冰淇淋 3 公斤\n・草莓 1,200 g\n・牛奶 1,800 g");
  const remember = gasCalls.find((c) => c.op === "remember") as { turns: { u: boolean; t: string }[] };
  assert.deepEqual(remember.turns.map((t) => t.u), [true, false]);
  assert.equal(remember.turns[0].t, "草莓冰淇淋做 3 公斤要多少料？");
});

test("重新開始：清除對話記憶", async () => {
  await handleEvent(msg("重新開始"));
  assert.ok(gasCalls.some((c) => c.op === "forget"));
  assert.match(replies[0].texts[0], /重新開始/);
  assert.equal(aiBodies.length, 0);
});

test("使用說明：不用 AI，列出可以查的權限", async () => {
  await handleEvent(msg("說明"));
  assert.match(replies[0].texts[0], /你可以查詢：商品與生產/);
  assert.equal(aiBodies.length, 0);
});

test("沒有設定 AI：提醒管理員", async () => {
  startInfo = active({ ai: null });
  await handleEvent(msg("今天有什麼事"));
  assert.match(replies[0].texts[0], /LINE 管理/);
});

test("AI 失敗：回覆錯誤訊息（不洩漏金鑰）", async () => {
  globalThis.fetch = ((orig) => (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("https://gemini.example/")) return new Response('{"error":"bad key g-key"}', { status: 403 });
    return orig(input, init);
  }) as typeof fetch)(globalThis.fetch);
  await handleEvent(msg("今天有什麼事"));
  assert.match(replies[0].texts[0], /暫時無法回答/);
  assert.doesNotMatch(replies[0].texts[0], /g-key/);
});

test("回覆權杖過期：改用推播", async () => {
  aiScript = [{ candidates: [{ content: { role: "model", parts: [{ text: "好的" }] } }] }];
  await handleEvent(msg("嗨", "expired"));
  assert.deepEqual(pushes, ["好的"]);
});

test("群組訊息不回覆；非文字訊息提醒", async () => {
  await processEvents([{ type: "message", replyToken: "g1", source: { type: "group", groupId: "C1", userId: UID }, message: { type: "text", text: "配方" } }]);
  assert.equal(replies.length, 0);
  assert.equal(gasCalls.length, 0);
  await handleEvent({ type: "message", replyToken: "s1", source: { type: "user", userId: UID }, message: { type: "sticker" } });
  assert.match(replies[0].texts[0], /只看得懂文字/);
});

test("機器人被停用（BOT_OFF）：回覆暫停服務", async () => {
  globalThis.fetch = ((orig) => (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === process.env.GAS_URL) return json({ success: false, message: "LINE 機器人尚未啟用", code: "BOT_OFF" });
    return orig(input, init);
  }) as typeof fetch)(globalThis.fetch);
  await processEvents([msg("嗨")]);
  assert.match(replies[0].texts[0], /暫停服務/);
});

test("cleanReply", () => {
  assert.equal(cleanReply("## 標題\n**粗體** 與 `程式`\n\n\n\n* 項目"), "標題\n粗體 與 程式\n\n・項目");
});
