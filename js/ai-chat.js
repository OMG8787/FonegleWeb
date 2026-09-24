// AI視窗專用(ai-chat.js)：經由 Google Apps Script 呼叫 Gemini

(function () {
    let typingDiv = null
    let aiType = "gemini"
    let history = JSON.parse(localStorage.getItem("aiChat") || "[]")

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
    <select id="aiTypeSelect">
        <option value="gemini">Gemini</option>
    </select>
    <div style="font-size:12px;color:#888;margin-top:6px">
        需在 Apps Script 指令碼屬性設定 GEMINI_API_KEY
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

    /* ===== 載入歷史 ===== */
    const body = document.getElementById("aiBody")
    renderHistory()

    document.getElementById("aiTypeSelect").value = aiType
    updateModeText()
    /* ===== 事件 ===== */
    const input = document.getElementById("aiInput")

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
    document.getElementById("aiTypeSelect").onchange = e => {
        aiType = e.target.value
        localStorage.setItem("aiType", aiType)
        updateModeText()
    }
    document.getElementById("aiSend").onclick = send
    document.getElementById("aiInput").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    })
    document.getElementById("aiNewChat").onclick = () => {
        history = []
        localStorage.removeItem("aiChat")
        body.innerHTML = ""
    }

    /* ===== 功能 ===== */
    function toggle() {
        chat.style.display = chat.style.display === "flex" ? "none" : "flex"
    }
    function open() { chat.style.display = "flex" }
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

        const name = "Gemini"

        el.textContent = `(目前對話模式: ${name})`
    }

    async function send() {

        let msg = input.value.trim()
        if (!msg) return

        // 立即清空輸入框
        input.value = ""
        input.focus()

        // 顯示使用者訊息（靠右）
        addMessage(msg, "user")
        showTyping()
        history.push(`你: ${msg}`)
        localStorage.setItem("aiChat", JSON.stringify(history))

        // 對話紀錄 → Gemini messages
        const messages = history.map(m => m.startsWith("你: ")
            ? { role: "user", text: m.slice(3) }
            : { role: "model", text: m.replace(/^AI: /, "") })

        try {
            const reply = await API.call("aiChat", { messages })
            hideTyping()
            addMessage(reply, "ai")
            history.push(`AI: ${reply}`)
            localStorage.setItem("aiChat", JSON.stringify(history))
        } catch (err) {
            hideTyping()
            addMessage(err?.message || "系統錯誤", "ai")
        }
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
        history.forEach(m => {
            if (m.startsWith("你: ")) addMessage(m.replace("你: ", ""), "user")
            else if (m.startsWith("AI: ")) addMessage(m.replace("AI: ", ""), "ai")
            else addMessage(m, "ai")
        })
    }

    /* ===== 全域控制 ===== */
    window.AIAssistant = { open, close, toggle }
})()

