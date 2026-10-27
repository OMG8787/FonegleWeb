import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

// LINE Messaging API 的最小資料模型（僅保留用得到的欄位）
// https://developers.line.biz/en/reference/messaging-api/#webhook-event-objects

export interface LineEvent {
  type: string;
  replyToken?: string;
  source: { type: "user" | "group" | "room"; userId?: string; groupId?: string; roomId?: string };
  message?: { id?: string; type: string; text?: string };
  postback?: { data?: string };
}

const API = "https://api.line.me/v2/bot";
const MAX_TEXT_LENGTH = 5000;
const MAX_MESSAGES_PER_REPLY = 5;
/** 快速回覆最多 13 個按鈕，按鈕文字最多 20 字 */
const MAX_CHOICES = 13;
const MAX_CHOICE_LENGTH = 20;

/** 驗證 X-Line-Signature（HMAC-SHA256 + Base64） */
export function validateSignature(body: string, signature: string | null): boolean {
  if (!signature || !config.line.channelSecret) return false;
  const computed = createHmac("sha256", config.line.channelSecret).update(body).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === computed.length && timingSafeEqual(computed, given);
}

function headers() {
  return { Authorization: `Bearer ${config.line.channelAccessToken}`, "Content-Type": "application/json" };
}

/** 文字切成 LINE 能送的訊息（每則 5000 字、最多 5 則）；choices 變成最後一則下方的快速回覆按鈕 */
export function textMessages(text: string, choices: string[] = []): Record<string, unknown>[] {
  const chunks: string[] = [];
  let rest = text.trim() || "……";
  while (rest.length > MAX_TEXT_LENGTH) {
    // 盡量在換行處切開
    const cut = rest.lastIndexOf("\n", MAX_TEXT_LENGTH);
    const at = cut > MAX_TEXT_LENGTH / 2 ? cut : MAX_TEXT_LENGTH;
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  chunks.push(rest);
  const messages: Record<string, unknown>[] = chunks.slice(0, MAX_MESSAGES_PER_REPLY).map((t) => ({ type: "text", text: t }));
  if (choices.length) {
    messages[messages.length - 1].quickReply = {
      items: choices.slice(0, MAX_CHOICES).map((c) => ({ type: "action", action: { type: "message", label: c.slice(0, MAX_CHOICE_LENGTH), text: c } })),
    };
  }
  return messages;
}

/**
 * 回覆訊息；回覆權杖過期（處理太久）時改用推播送給本人（推播會用到官方帳號的每月額度）
 */
export async function replyText(replyToken: string | undefined, userId: string, text: string, choices: string[] = []): Promise<void> {
  const messages = textMessages(text, choices);
  if (replyToken) {
    const response = await fetch(`${API}/message/reply`, { method: "POST", headers: headers(), body: JSON.stringify({ replyToken, messages }) });
    if (response.ok) return;
    const detail = await response.text();
    console.warn(`LINE 回覆失敗 ${response.status}: ${detail.slice(0, 300)}`);
    if (response.status !== 400 || !userId) return;
  }
  if (!userId) return;
  const push = await fetch(`${API}/message/push`, { method: "POST", headers: headers(), body: JSON.stringify({ to: userId, messages }) });
  if (!push.ok) console.warn(`LINE 推播失敗 ${push.status}: ${(await push.text()).slice(0, 300)}`);
}

/** 顯示「輸入中」動畫（只有一對一聊天有效；失敗不影響回覆） */
export async function showLoading(userId: string, seconds = 30): Promise<void> {
  try {
    const response = await fetch(`${API}/chat/loading/start`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ chatId: userId, loadingSeconds: seconds }),
    });
    if (!response.ok) console.warn(`輸入中動畫失敗 ${response.status}：${await response.text()}`);
  } catch (error) {
    console.warn("輸入中動畫失敗", error);
  }
}

export interface Profile {
  displayName: string;
  pictureUrl: string;
}

const profiles = new Map<string, { at: number; profile: Profile }>();
const PROFILE_TTL_MS = 6 * 3_600_000;

/** LINE 名稱與大頭貼（同一個執行個體內快取 6 小時） */
export async function getProfile(userId: string): Promise<Profile> {
  const cached = profiles.get(userId);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;
  try {
    const response = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, { headers: headers() });
    if (!response.ok) return { displayName: "", pictureUrl: "" };
    const p = (await response.json()) as { displayName?: string; pictureUrl?: string };
    const profile = { displayName: p.displayName ?? "", pictureUrl: p.pictureUrl ?? "" };
    profiles.set(userId, { at: Date.now(), profile });
    return profile;
  } catch {
    return { displayName: "", pictureUrl: "" };
  }
}
