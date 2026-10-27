// 設定都來自環境變數（Vercel 專案 Settings → Environment Variables）
// 用 getter 每次讀取，測試時可以直接改 process.env

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

export const config = {
  line: {
    get channelSecret() { return env("LINE_CHANNEL_SECRET"); },
    get channelAccessToken() { return env("LINE_CHANNEL_ACCESS_TOKEN"); },
  },
  gas: {
    /** 管理系統的 Apps Script 網址（結尾是 /exec） */
    get url() { return env("GAS_URL"); },
    /** 網站「LINE 管理」產生的 Bot 金鑰 */
    get secret() { return env("BOT_SECRET"); },
  },
  get timeZone() { return env("BOT_TIMEZONE", "Asia/Taipei"); },
  get siteUrl() { return env("SITE_URL"); },
};

/** 缺少必要設定時回傳缺少的名稱（給健康檢查與錯誤訊息用） */
export function missingConfig(): string[] {
  const required: [string, string][] = [
    ["LINE_CHANNEL_SECRET", config.line.channelSecret],
    ["LINE_CHANNEL_ACCESS_TOKEN", config.line.channelAccessToken],
    ["GAS_URL", config.gas.url],
    ["BOT_SECRET", config.gas.secret],
  ];
  return required.filter(([, v]) => !v).map(([k]) => k);
}
