import { waitUntil } from "@vercel/functions";
import { processEvents } from "../src/bot.js";
import { missingConfig } from "../src/config.js";
import { validateSignature, type LineEvent } from "../src/line.js";

/**
 * LINE Webhook 入口（LINE Developers 後台的 Webhook URL 設為 https://你的網域/api/line）
 * 驗證簽章後立即回 200，實際處理用 waitUntil 在回應後繼續進行
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!validateSignature(body, request.headers.get("x-line-signature"))) {
    console.warn("LINE 簽章驗證失敗");
    return new Response("Unauthorized", { status: 401 });
  }

  const events = (JSON.parse(body) as { events?: LineEvent[] }).events ?? [];
  waitUntil(processEvents(events));
  return new Response("OK");
}

/** 健康檢查：只顯示缺少哪些設定，不顯示任何設定值 */
export function GET(): Response {
  const missing = missingConfig();
  return Response.json({ ok: missing.length === 0, missing });
}
