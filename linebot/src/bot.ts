import { generate, type Turn } from "./ai.js";
import { config } from "./config.js";
import { gas, GasError, type StartInfo } from "./gas.js";
import { getProfile, replyText, showLoading, type LineEvent } from "./line.js";
import { Session } from "./session.js";
import { nowLocal } from "./time.js";
import { buildTools } from "./tools.js";

// 處理 LINE 事件：只服務一對一聊天（公司資料不在群組裡回覆）

const RESET_WORDS = ["重新開始", "清除對話", "忘記對話", "/reset"];
const HELP_WORDS = ["說明", "使用說明", "help", "/help", "?", "？", "功能"];

const DEFAULT_PENDING = "⏳ 你的帳號還在等待管理員開通。\n開通後就可以在這裡查詢備忘錄、行事曆、配方等資料。";

/** 依權限給的範例問題（快速回覆按鈕） */
function examples(info: StartInfo): string[] {
  const has = (t: string) => info.tables?.some((x) => x.name === t);
  return [
    "今天有什麼事？",
    has("Calendar") ? "這週有哪些行程？" : "",
    has("Memos") ? "我的備忘錄" : "",
    has("Formula") ? "草莓冰淇淋做 3 公斤要多少料？" : "",
    has("Orders") ? "還沒出貨的訂單" : "",
    has("Inventory") ? "快到期的庫存" : "",
    has("Receivable") ? "還沒收款的帳款" : "",
    "使用說明",
  ].filter(Boolean);
}

function helpText(info: StartInfo): string {
  return [
    `🤖 ${info.appName} 員工助理`,
    `你好，${info.name}！直接用聊天的方式問我就可以，例如：`,
    ...examples(info).filter((x) => x !== "使用說明").map((x) => `・${x}`),
    "",
    `🔐 你可以查詢：${info.permNames?.length ? info.permNames.join("、") : "共享備忘錄（還沒有其他權限，請找管理員）"}`,
    "✏️ 我只能查詢，不能新增或修改資料，要改請到網站操作。",
    "🔄 想換話題可以說「重新開始」。",
  ].join("\n");
}

function statusText(info: StartInfo): string {
  if (info.status === "停用") return "🚫 此帳號已停用，如有疑問請聯絡管理員。";
  if (info.problem) return `⚠️ ${info.problem}`;
  return info.texts.pending || DEFAULT_PENDING;
}

function welcomeText(info: StartInfo): string {
  const intro = info.texts.welcome || `👋 歡迎使用「${info.appName}」員工助理！`;
  return info.allowed ? `${intro}\n\n${helpText(info)}` : `${intro}\n\n${statusText(info)}`;
}

/** 給 AI 的背景說明 */
export function systemPrompt(info: StartInfo): string {
  const t = nowLocal();
  return [
    `你是「${info.appName}」的 LINE 員工助理，幫公司同仁查詢系統資料。使用繁體中文（台灣用語），口吻親切、專業、簡潔。`,
    `現在是 ${t.date}（星期${t.weekday}）${t.time}（台灣時間）。`,
    `正在跟你說話的是：${info.name}。他可以查詢的資料：${info.permNames?.length ? info.permNames.join("、") : "只有共享備忘錄"}。`,
    "",
    "【規則】",
    "1. 公司的資料一律用工具查詢後再回答；查不到、沒有權限就直接說，絕對不要編造數字、日期、配方用量或客戶資料。",
    "2. 配方換算一定用 formula 工具，不要自己心算；名稱不確定時先用 formulas 搜尋，有多個相似的請使用者選。",
    "3. 你只能查詢，不能新增、修改、刪除任何資料；使用者要求修改時，告訴他到網站操作" + (config.siteUrl ? `（${config.siteUrl}）` : "") + "。",
    "4. 回覆會顯示在 LINE：不要用 Markdown（不要用 **粗體**、# 標題、表格、```），用 emoji 與「・」條列，重點放前面；內容長就分段，不要一次列出太多（超過 15 項時先摘要並詢問要不要看全部）。",
    "5. 「今天」「明天」「這週」「下個月」請依上面的現在時間換算成日期再查詢；這週 = 本週一到週日。",
    "6. 只回答跟工作、公司資料有關的問題；其他閒聊簡短回應即可。",
    info.prompt ? `\n【公司補充說明（管理員設定）】\n${info.prompt}` : "",
  ].join("\n");
}

/** LINE 不支援 Markdown：去掉 AI 常用的格式符號 */
export function cleanReply(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ 	]*[-*][ 	]+/gm, "・")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function handleEvent(e: LineEvent): Promise<void> {
  const uid = e.source.userId;

  // 群組 / 聊天室：不回覆公司資料，只在被邀請時提醒一次
  if (e.source.type !== "user") {
    if (e.type === "join" && e.replyToken) await replyText(e.replyToken, "", "🔐 為了保護公司資料，請加我好友後用「一對一聊天」詢問，我在群組裡不會回覆。");
    return;
  }
  if (!uid) return;

  if (e.type === "unfollow") {
    await gas.unfollow(uid).catch((err) => console.warn("記錄封鎖失敗", err));
    return;
  }

  if (e.type === "follow") {
    const info = await gas.start(uid, await getProfile(uid));
    await replyText(e.replyToken, uid, welcomeText(info), info.allowed ? examples(info) : []);
    return;
  }

  if (e.type !== "message" || !e.message) return;

  await showLoading(uid);
  const info = await gas.start(uid, await getProfile(uid));
  if (!info.allowed) {
    await replyText(e.replyToken, uid, info.isNew ? welcomeText(info) : statusText(info));
    return;
  }

  if (e.message.type !== "text" || !e.message.text?.trim()) {
    await replyText(e.replyToken, uid, "目前我只看得懂文字訊息喔，請用打字的方式問我 🙏", examples(info));
    return;
  }

  const text = e.message.text.trim();

  if (RESET_WORDS.includes(text)) {
    await gas.forget(uid);
    await replyText(e.replyToken, uid, "🔄 好的，我們重新開始。想查什麼呢？", examples(info));
    return;
  }

  if (HELP_WORDS.includes(text.toLowerCase())) {
    await replyText(e.replyToken, uid, helpText(info), examples(info));
    return;
  }

  if (!info.ai) {
    await replyText(e.replyToken, uid, "⚠️ 機器人還沒有設定 AI，請管理員到網站「系統 → LINE 管理」設定 AI 服務。");
    return;
  }

  const session = new Session(uid, info);
  const turns: Turn[] = [...(info.history ?? []).map((h) => ({ isUser: h.u, text: h.t })), { isUser: true, text }];

  let reply: string;
  try {
    reply = cleanReply(await generate({ ai: info.ai, system: systemPrompt(info), turns, tools: buildTools(session) }));
    if (!reply) reply = "抱歉，我想不出答案，可以換個方式問我嗎？";
  } catch (error) {
    console.error("AI 回覆失敗", error);
    const detail = error instanceof GasError ? error.message : (error as Error).message;
    await replyText(e.replyToken, uid, `😵 抱歉，暫時無法回答（${detail.slice(0, 150)}）。請稍後再試一次。`);
    return;
  }

  await replyText(e.replyToken, uid, reply);
  await gas.remember(uid, [{ u: true, t: text }, { u: false, t: reply }]).catch((err) => console.warn("記錄對話失敗", err));
}

/** 一批事件：同一個人依序處理，不同人並行 */
export async function processEvents(events: LineEvent[]): Promise<void> {
  const byUser = new Map<string, LineEvent[]>();
  for (const e of events) {
    const key = e.source.userId ?? e.source.groupId ?? e.source.roomId ?? "";
    byUser.set(key, [...(byUser.get(key) ?? []), e]);
  }
  await Promise.all(
    [...byUser.values()].map(async (list) => {
      for (const e of list) {
        try {
          await handleEvent(e);
        } catch (error) {
          console.error(`處理 LINE 事件失敗 ${e.type}`, error);
          if (e.replyToken && e.source.type === "user" && e.source.userId) {
            const msg = error instanceof GasError && error.code === "BOT_OFF" ? "🔧 機器人目前暫停服務，請稍後再試。" : "😵 系統忙碌中，請稍後再試一次。";
            await replyText(e.replyToken, e.source.userId, msg).catch(() => undefined);
          }
        }
      }
    }),
  );
}
