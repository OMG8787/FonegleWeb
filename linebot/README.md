# 員工 LINE 助理（linebot）

員工在「員工專用 LINE 官方帳號」用聊天的方式詢問，AI 會查詢管理系統的資料後回答，例如：

- 「今天有什麼事？」「這週有哪些行程？」
- 「我的備忘錄」
- 「草莓冰淇淋做 3 公斤要多少料？」（含再製品配方換算、成分標示、營養標示）
- 「還沒出貨的訂單」「快到期的庫存」「還沒收款的帳款」

## 運作方式

```
員工 LINE ──► LINE 官方帳號 ──► 這個程式（Vercel）──► 管理系統 Code.gs（Google 試算表）
                                   │ 驗證 LINE 簽章          │ 檢查 LINE 管理設定的權限
                                   └ AI 選工具查詢資料 ◄──────┘ 只回傳看得到的資料
```

- **帳號與權限在網站管理**：員工加好友後在網站「系統 → 💬 LINE 管理」出現，一開始是「待開通」、沒有任何權限；要由系統管理員開通並設定權限（跟網站帳號同一套權限）。
- **只能查詢**：機器人不能新增、修改、刪除任何資料（Code.gs 只允許 `list`、`getMany`、`get`、`me`、`financeSummary`）。
- **只服務一對一聊天**：在群組裡不會回覆公司資料。
- **AI 設定在網站**：LINE 管理頁可以選 Gemini / Claude / OpenAI 相容服務並輸入 API Key；沒設定時用系統共用的 `GEMINI_API_KEY`。
- **對話記憶**：記得最近 12 則（存在 Apps Script 快取，6 小時沒對話會忘記）；說「重新開始」可以清除。

## 部署

1. **Code.gs**：把最新的 `gas/Code.gs` 貼到 Apps Script → 部署 → 管理部署 → 編輯 → 新版本。
2. **LINE Developers**（https://developers.line.biz/console/）：建立 Messaging API Channel，
   複製 Basic settings 的 **Channel secret**，在 Messaging API 分頁發行 **Channel access token**。
3. **網站 → 系統 → 💬 LINE 管理**：按「🔑 產生 Bot 金鑰」，複製金鑰與系統網址。
4. **Vercel**（https://vercel.com/new）：匯入這個 GitHub 專案，**Root Directory 選 `linebot`**，
   Environment Variables 填：

   | 名稱 | 內容 |
   |---|---|
   | `LINE_CHANNEL_SECRET` | LINE 的 Channel secret |
   | `LINE_CHANNEL_ACCESS_TOKEN` | LINE 的 Channel access token |
   | `GAS_URL` | LINE 管理頁的「系統網址」（結尾 /exec） |
   | `BOT_SECRET` | LINE 管理頁產生的 Bot 金鑰 |
   | `SITE_URL`（選填） | 網站網址，機器人請人「到網站操作」時附上 |

   Deploy 完成後打開 `https://你的專案.vercel.app/api/line`，看到 `{"ok":true,"missing":[]}` 就是設定齊全。
5. **LINE Developers → Messaging API**：Webhook URL 填 `https://你的專案.vercel.app/api/line`，打開 **Use webhook**，按 **Verify**。
6. **LINE Official Account Manager → 回應設定**：關閉「自動回應訊息」與「加入好友的歡迎訊息」。
7. 用手機加好友、傳一句話 → LINE 管理頁「待開通」出現 → 開通後就可以使用。

> 重新產生 Bot 金鑰後，要到 Vercel 更新 `BOT_SECRET` 並 Redeploy，機器人才會恢復。
>
> Vercel 免費方案（Hobby）限非商業用途，公司正式使用請改用 Pro 方案。

## 費用

- LINE：回覆訊息不限則數（這個機器人都用回覆）；只有處理超過時限時才會改用推播（免費方案每月 200 則）。
- AI：依 LINE 管理設定的服務計費；Gemini 有免費額度。

## 開發

```bash
npm install
npm run typecheck
npm test
```

| 檔案 | 用途 |
|---|---|
| `api/line.ts` | LINE Webhook 入口（驗證簽章） |
| `src/bot.ts` | 處理訊息：開通狀態、說明、重新開始、呼叫 AI |
| `src/tools.ts` | 給 AI 的查詢工具（概況、備忘錄、行事曆、配方、產品、原料、庫存、訂單、帳款、備品清單、任何資料表） |
| `src/formula.ts` | 配方換算、再製品、成分標示、營養素（與網站配方頁相同規則） |
| `src/gas.ts` | 呼叫管理系統（`action: "bot"`） |
| `src/ai.ts` | Gemini / Claude / OpenAI 相容服務（含工具呼叫） |
