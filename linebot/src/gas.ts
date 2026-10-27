import { config } from "./config.js";

// 呼叫管理系統（Google Apps Script）：{ action: "bot", secret, op, lineUserId, ... }
// 權限、資料範圍都由系統依 LINE 管理的設定判斷；機器人只能查詢

export class GasError extends Error {
  constructor(message: string, public code = "") {
    super(message);
  }
}

export type Row = Record<string, unknown>;

export interface AiConfig {
  source: "bot" | "system";
  provider: "gemini" | "claude" | "openai";
  apiKey: string;
  model: string;
  endpoint: string;
}

export interface TableInfo {
  name: string;
  title: string;
  cols: string[];
}

/** start 的回傳：這個 LINE 使用者的狀態；allowed = 已開通、可以查詢 */
export interface StartInfo {
  status: string;
  allowed: boolean;
  problem: string;
  isNew: boolean;
  name: string;
  appName: string;
  texts: { welcome: string; pending: string };
  userId?: string;
  linked?: boolean;
  perms?: number[];
  permNames?: string[];
  tables?: TableInfo[];
  labels?: Record<string, string>;
  prompt?: string;
  ai?: AiConfig | null;
  history?: { u: boolean; t: string }[];
}

const TIMEOUT_MS = 25_000;

async function post<T>(body: Record<string, unknown>, retry = true): Promise<T> {
  if (!config.gas.url || !config.gas.secret) throw new GasError("機器人還沒設定 GAS_URL / BOT_SECRET", "CONFIG");
  let text = "";
  let status = 0;
  try {
    // Apps Script 會先 302 轉址再回傳內容（fetch 會自動跟著轉址）
    const response = await fetch(config.gas.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "bot", secret: config.gas.secret, ...body }),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    if (retry) return post<T>(body, false);
    throw new GasError(`連不上管理系統：${(error as Error).message}`, "NETWORK");
  }

  let json: { success?: boolean; data?: T; message?: string; code?: string };
  try {
    json = JSON.parse(text);
  } catch {
    // Google 偶爾回傳錯誤頁（404 / 500），都是查詢，重試一次沒有副作用
    if (retry) return post<T>(body, false);
    throw new GasError(`管理系統回應格式錯誤（${status}）`, "FORMAT");
  }
  if (!json.success) throw new GasError(json.message || "管理系統錯誤", json.code || "");
  return json.data as T;
}

export const gas = {
  start(lineUserId: string, profile: { displayName?: string; pictureUrl?: string } = {}): Promise<StartInfo> {
    return post<StartInfo>({ op: "start", lineUserId, displayName: profile.displayName ?? "", pictureUrl: profile.pictureUrl ?? "" });
  },
  /** 以這個 LINE 使用者的權限呼叫系統的查詢動作（list / getMany / get / me / financeSummary） */
  call<T>(lineUserId: string, action: string, params: Record<string, unknown>): Promise<T> {
    return post<T>({ op: "call", lineUserId, call: action, params });
  },
  remember(lineUserId: string, turns: { u: boolean; t: string }[]): Promise<number> {
    return post<number>({ op: "remember", lineUserId, turns });
  },
  forget(lineUserId: string): Promise<boolean> {
    return post<boolean>({ op: "forget", lineUserId });
  },
  unfollow(lineUserId: string): Promise<boolean> {
    return post<boolean>({ op: "unfollow", lineUserId });
  },
};
