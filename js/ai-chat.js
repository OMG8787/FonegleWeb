// AI視窗專用(ai-chat.js)：經由 Google Apps Script 呼叫 AI（使用者在帳號設定選的服務，或系統共用 Gemini）

(function () {
    let typingDiv = null
    // 對話紀錄存在 Google 試算表 AiChats（個人），手機電腦同步
    let history = []          // [{ id, role: "user" | "model", text }]
    let loaded = false

    /* ===== 建立浮動按鈕 ===== */
    const btn = document.createElement("div")
    btn.innerHTML = "🤖"
    btn.style = `
position:fixed;
right:25px;
bottom:25px;
width:60px;
height:60px;
border-radius:18px;
background:linear-gradient(135deg,#4facfe,#3498db);
color:white;
display:flex;
align-items:center;
justify-content:center;
cursor:pointer;
font-weight:bold;
z-index:9999;
box-shadow:0 10px 25px rgba(0,0,0,0.2);
transition:0.2s;
`
    document.body.appendChild(btn)

    /* ===== 聊天視窗 ===== */
    const chat = document.createElement("div")
    chat.style = `
position:fixed;
right:25px;
bottom:100px;
width: min(360px, 90vw);
height: min(520px, 80vh);
background:white;
border-radius:20px;
box-shadow:0 15px 40px rgba(0,0,0,0.25);
display:none;
flex-direction:column;
z-index:9999;
overflow:hidden;
transition: all 0.2s ease;
`
    chat.innerHTML = `
<div style="
background:linear-gradient(135deg,#4facfe,#3498db);
color:white;
padding:12px;
display:flex;
justify-content:space-between;
align-items:center;
border-top-left-radius:20px;
border-top-right-radius:20px;
font-weight:600;
">
    智能助理 <span id="aiModeText" style="opacity:0.85;font-size:12px;margin-left:8px;"></span>
    <div>
        <span id="aiSettingBtn" style="cursor:pointer">⚙</span>
        <span id="aiNewChat" style="cursor:pointer;margin:0 10px">🆕</span>
        <span id="aiCloseBtn" style="cursor:pointer">✖</span>
    </div>
</div>

<div id="aiSetting" style="display:none;padding:10px;border-bottom:1px solid #ccc">
    <div style="font-size:13px">
        要改用自己的 API Key（Gemini / Claude / OpenAI 相容），請到
        <a id="aiSettingLink" href="#">帳號設定 → AI 設定</a>
    </div>
</div>

<div id="aiBody" style="flex:1;padding:10px;overflow:auto;display:flex;flex-direction:column;"></div>

<div style="display:flex;border-top:1px solid #ccc">
    <textarea id="aiInput"
maxlength="5000"
rows="1"
style="
flex:1;
border:none;
padding:10px 12px;
resize:none;
outline:none;
border-radius:12px;
background:#fff;
box-shadow:inset 0 0 0 1px #eee;
font-size:14px;
">
</textarea>
    <button id="aiSend" style="
border:none;
padding:10px 14px;
border-radius:12px;
background:linear-gradient(135deg,#4facfe,#3498db);
color:white;
cursor:pointer;
font-weight:600;
box-shadow:0 5px 12px rgba(0,0,0,0.15);
">送出</button>
</div>
`
    document.body.appendChild(chat)

    /* ===== 載入歷史（第一次打開時才讀取） ===== */
    const body = document.getElementById("aiBody")

    document.getElementById("aiSettingLink").href = Auth.root + "page/account.html"
    /* ===== 事件 ===== */
    const input = document.getElementById("aiInput")
    input.dataset.placeholder = input.placeholder

    input.addEventListener("input", () => {
        input.style.height = "auto"
        input.style.height = Math.min(input.scrollHeight, 200) + "px"
    })
    btn.onclick = () => toggle()
    document.getElementById("aiCloseBtn").onclick = () => close()
    document.getElementById("aiSettingBtn").onclick = () => {
        const s = document.getElementById("aiSetting")
        s.style.display = s.style.display === "block" ? "none" : "block"
    }
    document.getElementById("aiSend").onclick = send
    document.getElementById("aiInput").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    })
    document.getElementById("aiNewChat").onclick = async () => {
        if (history.length && !confirm("清除所有對話紀錄？")) return
        const ids = history.map(m => m.id).filter(Boolean)
        history = []
        body.innerHTML = ""
        try {
            if (ids.length)
                await API.batch(ids.map(id => ({ action: "remove", table: "AiChats", id })))
        } catch (err) {
            addMessage("清除紀錄失敗：" + (err?.message || err), "ai")
        }
    }

    /* ===== 功能 ===== */
    function toggle() {
        chat.style.display === "flex" ? close() : open()
    }
    let modeShown = false
    function open() {
        chat.style.display = "flex"
        if (!modeShown) { modeShown = true; updateModeText() }
        loadHistory()
    }

    async function loadHistory() {
        if (loaded) return
        loaded = true
        body.innerHTML = ""
        showTyping()
        try {
            const rows = await API.list("AiChats", null, { silent: true })
            history = rows
                .sort((a, b) => a.ID - b.ID)
                .slice(-40)
                .map(r => ({ id: r.ID, role: r.Role === "user" ? "user" : "model", text: r.Text || "" }))
            hideTyping()
            renderHistory()
        } catch (err) {
            hideTyping()
            loaded = false
            addMessage("讀取對話紀錄失敗：" + (err?.message || err), "ai")
        }
    }

    // 寫入一則對話到試算表（失敗不影響對話）
    async function saveMessage(entry) {
        try {
            const row = await API.insert("AiChats", { Role: entry.role, Text: entry.text }, { silent: true })
            entry.id = row.ID
        } catch (err) {
            console.warn("對話紀錄儲存失敗", err)
        }
    }
    function close() { chat.style.display = "none" }

    // 顯示「正在輸入…」
    function showTyping() {
        if (typingDiv) return

        typingDiv = document.createElement("div")
        typingDiv.innerText = "智能助手 正在輸入訊息…"
        typingDiv.style.whiteSpace = "pre-wrap"
        typingDiv.style.margin = "6px 0"
        typingDiv.style.maxWidth = "70%"
        typingDiv.style.padding = "8px 12px"
        typingDiv.style.borderRadius = "16px"
        typingDiv.style.fontSize = "14px"
        typingDiv.style.lineHeight = "1.4"
        typingDiv.style.background = "#f5f7fa"
        typingDiv.style.border = "1px solid #eee"
        typingDiv.style.color = "#888"
        typingDiv.style.alignSelf = "flex-start"

        body.appendChild(typingDiv)
        body.scrollTop = body.scrollHeight
    }

    function hideTyping() {
        if (typingDiv) {
            typingDiv.remove()
            typingDiv = null
        }
    }

    function autoResizeChat() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // 超小裝置
        if (w < 500 || h < 600) {
            chat.style.width = "95vw";
            chat.style.height = "85vh";
            chat.style.right = "2.5vw";
            chat.style.bottom = "10px";
        }
        // 平板
        else if (w < 1024) {
            chat.style.width = "80vw";
            chat.style.height = "80vh";
        }
        // 桌機
        else {
            chat.style.width = "360px";
            chat.style.height = "520px";
        }
    }

    // 標題模式顯示
    function updateModeText() {
        const el = document.getElementById("aiModeText")

        el.textContent = ""

        // 顯示目前實際使用的 AI（自己的設定或系統共用）
        API.call("getAiConfig", {}, { silent: true }).then(c => {
            const u = c && c.using
            el.textContent = u ? `(${u.source === "user" ? "" : "系統 "}${u.name}・${u.model})` : "(尚未設定 AI)"
        }).catch(() => { })
    }

    async function send() {

        if (busy) return
        let msg = input.value.trim()
        if (!msg) return

        // 立即清空輸入框
        input.value = ""
        input.focus()

        // 顯示使用者訊息（靠右）
        addMessage(msg, "user")
        showTyping()
        const userEntry = { role: "user", text: msg }
        history.push(userEntry)
        saveMessage(userEntry)

        // 對話紀錄 → Gemini messages
        const messages = history.slice(-20).map(m => ({ role: m.role, text: m.text }))

        // 對話視窗有「正在輸入…」提示，不擋整個畫面；等待回覆時停用輸入避免重複送出
        setBusy(true)
        try {
            const reply = await API.call("aiChat", { messages }, { silent: true })
            hideTyping()
            addMessage(reply, "ai")
            const aiEntry = { role: "model", text: reply }
            history.push(aiEntry)
            saveMessage(aiEntry)
        } catch (err) {
            hideTyping()
            addMessage(err?.message || "系統錯誤", "ai")
        } finally {
            setBusy(false)
        }
    }

    let busy = false
    function setBusy(on) {
        busy = on
        const btn = document.getElementById("aiSend")
        btn.disabled = on
        btn.style.opacity = on ? ".5" : ""
        input.readOnly = on
        input.placeholder = on ? "AI 回覆中…" : input.dataset.placeholder
        if (!on) input.focus()
    }

    function addMessage(text, type) {
        const div = document.createElement("div")
        div.innerText = text
        div.style.whiteSpace = "pre-wrap"
        div.style.margin = "6px 0"
        div.style.maxWidth = "70%"
        div.style.padding = "8px 12px"
        div.style.borderRadius = "16px"
        div.style.wordBreak = "break-word"
        div.style.fontSize = "14px"
        div.style.lineHeight = "1.4"
        if (type === "user") {
            div.style.background = "#3498db"
            div.style.color = "white"
            div.style.alignSelf = "flex-end"
        } else {
            div.style.background = "#ecf0f1"
            div.style.color = "#333"
            div.style.alignSelf = "flex-start"
        }
        body.appendChild(div)
        body.scrollTop = body.scrollHeight
    }

    function renderHistory() {
        body.innerHTML = ""
        history.forEach(m => addMessage(m.text, m.role === "user" ? "user" : "ai"))
    }

    /* ===== 全域控制 ===== */
    window.AIAssistant = { open, close, toggle }
})()

