window.Pages = window.Pages || {};

// =========================================================
// 資料庫管理（權限管理頁；系統管理）
//   1. 容量：Google 試算表每個檔案最多 1,000 萬個儲存格（含空白儲存格）；可釋放沒有資料的空白列
//   2. 封存：① 建立封存備份（完整複製整個試算表）→ ② 預覽 → ③ 封存
//      舊的流水帳（帳款、支出、出攤、訂單、市集點餐…）換算成每月結論，明細從目前的資料庫移除；
//      配方、原料、產品、客戶、帳號等重要資料與登入紀錄不動；財務總表會把結論加回去，總金額不變
// =========================================================
Pages.DbAdmin = (() => {

    "use strict";

    const E = App.esc;
    const dom = {};
    let status = null;
    let plan = null;           // 預覽結果

    const TABLE_NAMES = {
        Receivable: "帳務（已收齊）", Expenses: "支出", StallRecords: "出攤紀錄", Deposits: "保證金（已退還）",
        MarketOrders: "市集現場點餐", Orders: "訂單（已結清）"
    };

    const n = v => Number(v || 0).toLocaleString();
    const money = v => "$" + Math.round(Number(v || 0)).toLocaleString();

    function init() {

        const item = document.getElementById("dbItem");
        if (!item) return;

        ["dbToggle", "dbArea", "dbBar", "dbUsage", "dbHint", "dbSheets", "btnDbRefresh", "btnDbTrim", "btnDbBackup", "dbBackupInfo",
            "dbCutoff", "btnDbPreview", "dbPlan", "dbConfirm", "btnDbArchive", "dbProgress", "dbHistory", "dbMonthly"]
            .forEach(id => dom[id] = document.getElementById(id));

        // 備份與封存只有最高系統管理員（13）可以做；系統管理（3）只能看容量與釋放空白
        if (!Auth.hasPermission(13)) document.getElementById("dbArchiveBox")?.remove();

        item.querySelector(".setting-header").addEventListener("click", toggle);
        dom.btnDbRefresh.addEventListener("click", load);
        dom.btnDbTrim.addEventListener("click", trim);
        if (dom.btnDbBackup) {
            dom.btnDbBackup.addEventListener("click", backup);
            dom.btnDbPreview.addEventListener("click", preview);
            dom.btnDbArchive.addEventListener("click", archive);
            dom.dbConfirm.addEventListener("input", syncArchiveBtn);
            dom.dbCutoff.addEventListener("change", () => { plan = null; dom.dbPlan.innerHTML = ""; syncArchiveBtn(); });

            // 預設封存截止日：一年前的月初
            const d = new Date();
            d.setFullYear(d.getFullYear() - 1, d.getMonth(), 1);
            dom.dbCutoff.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        }
    }

    function toggle() {
        const open = dom.dbArea.classList.toggle("d-none") === false;
        dom.dbToggle.innerText = open ? "▼" : "▶";
        if (open && !status) load();
    }

    // =========================
    // 容量
    // =========================
    async function load() {

        try {
            status = await Auth.request("dbStatus", {}, { silent: true });
        } catch (err) {
            App.error(err, "讀取資料庫容量失敗");
            return;
        }

        const pct = status.percent;
        const cls = pct >= 80 ? "bg-danger" : pct >= 50 ? "bg-warning" : "bg-success";

        dom.dbBar.className = "progress-bar " + cls;
        dom.dbBar.style.width = Math.max(1, Math.min(100, pct)) + "%";
        dom.dbBar.textContent = pct + "%";
        dom.dbUsage.innerHTML = `已配置 <b>${n(status.usedCells)}</b> / ${n(status.limit)} 個儲存格`;
        dom.dbHint.className = "small mt-1 " + (pct >= 80 ? "text-danger fw-bold" : pct >= 50 ? "text-warning" : "text-muted");
        dom.dbHint.textContent = pct >= 80 ? "⚠️ 快滿了：請先釋放空白儲存格，再做封存，避免寫不進資料。"
            : pct >= 50 ? "已超過一半，建議規劃封存；資料越多系統也會越慢。" : "容量充足。";

        dom.btnDbTrim.disabled = !status.reclaimable;
        dom.btnDbTrim.textContent = status.reclaimable ? `🧹 釋放空白儲存格（約 ${n(status.reclaimable)} 個）` : "🧹 沒有可釋放的空白儲存格";

        dom.dbSheets.innerHTML = status.sheets.slice(0, 12).map(s => `
<tr><td>${E(s.name)}${status.archiveTables.includes(s.name) ? ' <span class="badge bg-light text-dark border">可封存</span>' : ""}</td>
<td class="text-end">${n(s.rows)}</td><td class="text-end">${n(s.cells)}</td><td class="text-end">${(s.cells / status.usedCells * 100).toFixed(1)}%</td></tr>`).join("");

        renderBackup();
        loadHistory();
    }

    function renderBackup() {

        const b = status && status.lastBackup;

        if (!dom.dbBackupInfo) return;

        if (!b) { dom.dbBackupInfo.innerHTML = `<span class="text-muted">還沒有封存備份。封存前一定要先建立備份。</span>`; return; }

        const hours = (Date.now() - b.at) / 3600000;
        const fresh = hours <= status.backupMaxAgeHours;

        dom.dbBackupInfo.innerHTML = `最近一次：<a href="${E(b.url)}" target="_blank" rel="noopener noreferrer">${E(b.name)}</a>（${E(b.atText)}，${hours < 1 ? "不到 1 小時前" : Math.floor(hours) + " 小時前"}）` +
            (fresh ? ` <span class="badge bg-success">可用於封存</span>` : ` <span class="badge bg-danger">已超過 ${status.backupMaxAgeHours} 小時，請重新備份</span>`);
    }

    async function trim() {

        if (!confirm(`釋放沒有資料的空白列（約 ${n(status.reclaimable)} 個儲存格）？\n\n只刪除每個工作表最後一筆資料後面多餘的空白列，不會動到任何資料；之後新增資料時系統會自動補列。`)) return;

        try {
            const r = await Auth.request("dbTrim", {}, { loadingText: "釋放空白儲存格中…" });
            alert(`✅ 已釋放 ${n(r.freedCells)} 個儲存格（${r.sheets} 個工作表）`);
            await load();
        } catch (err) {
            App.error(err, "釋放失敗");
        }
    }

    // =========================
    // 封存
    // =========================
    async function backup() {

        if (!confirm("建立封存備份？\n\n會把整個試算表（所有資料與程式）完整複製一份到你的 Google 雲端硬碟，約需 10～60 秒。舊資料原封不動留在備份檔，之後要查舊明細就開啟那個檔案。")) return;

        try {
            const r = await Auth.request("dbBackup", {}, { loadingText: "複製試算表中，請稍候…" });
            alert(`✅ 備份完成：${r.name}\n\n備份檔在你的雲端硬碟（與這個試算表同一個帳號）。`);
            await load();
        } catch (err) {
            App.error(err, "備份失敗");
        }
    }

    async function preview() {

        const cutoff = dom.dbCutoff.value;
        if (!cutoff) { alert("請選擇封存截止日"); return; }

        plan = [];
        dom.dbPlan.innerHTML = `<div class="text-muted small">計算中…</div>`;

        try {
            for (const table of status.archiveTables)
                plan.push(await Auth.request("dbArchive", { table, cutoff, dryRun: true }, { silent: true }));
        } catch (err) {
            plan = null;
            dom.dbPlan.innerHTML = "";
            App.error(err, "預覽失敗");
            return;
        }

        const total = plan.reduce((t, p) => t + p.archived, 0);

        dom.dbPlan.innerHTML = `
<table class="table table-sm align-middle mb-1"><thead><tr><th>資料表</th><th class="text-end">封存列數</th><th class="text-end">留下</th><th class="text-end">月份數</th><th class="text-end">釋放儲存格</th></tr></thead><tbody>
${plan.map(p => `<tr><td>${E(TABLE_NAMES[p.table] || p.table)}</td><td class="text-end ${p.archived ? "fw-bold" : "text-muted"}">${n(p.archived)}</td><td class="text-end">${n(p.kept)}</td><td class="text-end">${p.months}</td><td class="text-end">${n(p.cellsFreed)}</td></tr>`).join("")}
</tbody></table>
<div class="small text-muted">只封存 <b>${E(cutoff)}</b> 以前、<b>已經結清</b>的明細（未收齊的帳款、未結清的訂單、未退還的保證金都會留著）。${total ? "" : "<b>目前沒有可封存的資料。</b>"}</div>`;

        syncArchiveBtn();
    }

    function syncArchiveBtn() {
        const total = plan ? plan.reduce((t, p) => t + p.archived, 0) : 0;
        dom.btnDbArchive.disabled = !(total > 0 && dom.dbConfirm.value.trim() === "封存" && status && status.lastBackup);
    }

    async function archive() {

        const cutoff = dom.dbCutoff.value;
        const total = plan.reduce((t, p) => t + p.archived, 0);

        if (!confirm(`確定封存 ${n(total)} 列明細嗎？\n\n截止日：${cutoff} 以前（已結清的）\n舊明細會從目前的資料庫移除，只留下每月結論；完整的舊資料在封存備份檔。\n\n這個動作無法在系統內復原。`)) return;

        const archiveId = "A" + Date.now().toString(36).toUpperCase();
        const lines = [];

        dom.btnDbArchive.disabled = true;

        try {

            for (const p of plan) {

                if (!p.archived) continue;

                dom.dbProgress.innerHTML = `<div class="small text-muted">封存「${E(TABLE_NAMES[p.table] || p.table)}」中…（${lines.length + 1}）</div>`;
                const r = await Auth.request("dbArchive", { table: p.table, cutoff, confirm: "封存", archiveId }, { silent: true });
                lines.push(`${TABLE_NAMES[p.table] || p.table}：封存 ${n(r.archived)} 列，留下 ${n(r.kept)} 列`);
            }

            dom.dbProgress.innerHTML = `<div class="alert alert-success small mt-2 mb-0">✅ 封存完成<br>${lines.map(E).join("<br>")}</div>`;
            dom.dbConfirm.value = "";
            plan = null;
            dom.dbPlan.innerHTML = "";

            API.cacheClear();
            await load();

        } catch (err) {

            dom.dbProgress.innerHTML = `<div class="alert alert-danger small mt-2 mb-0">封存中斷：${E(err.message || err)}<br>已完成：${lines.map(E).join("；") || "（無）"}。<br>可以直接再按一次（同一批次重跑不會重複計算）。</div>`;
            await load();

        } finally {

            syncArchiveBtn();
        }
    }

    // =========================
    // 封存紀錄 與 每月結論
    // =========================
    async function loadHistory() {

        let rows = [];
        try { rows = await API.list("ArchiveSummary", null, { silent: true, fresh: true }); } catch { return; }

        const log = rows.filter(r => r.Label === "archive_log").sort((a, b) => String(b.ArchivedAt).localeCompare(String(a.ArchivedAt)));

        dom.dbHistory.innerHTML = log.length ? log.map(r => `<tr><td>${E(r.ArchivedAt)}</td><td>${E(TABLE_NAMES[r.Key] || r.Key)}</td><td class="text-end">${n(r.Count)}</td><td class="small">${E(String(r.Note || "").replace(/備份：.*/, ""))}</td></tr>`).join("")
            : `<tr><td colspan="4" class="text-muted small">還沒有封存過</td></tr>`;

        // 每月結論
        const by = {};
        rows.filter(r => r.Label !== "archive_log").forEach(r => {
            const m = by[r.Period] = by[r.Period] || { ar: 0, exp: 0, sIn: 0, sCost: 0, order: 0 };
            const a = Number(r.Amount) || 0;
            if (r.Label === "ar_income") m.ar += a;
            else if (r.Label === "expense") m.exp += a;
            else if (r.Label === "stall_income") m.sIn += a;
            else if (r.Label === "stall_cost") m.sCost += a;
            else if (r.Label === "order") m.order += a;
        });

        const periods = Object.keys(by).sort().reverse();

        dom.dbMonthly.innerHTML = periods.length ? periods.map(p => `<tr><td>${E(p)}</td><td class="text-end">${money(by[p].ar)}</td><td class="text-end">${money(by[p].sIn)}</td><td class="text-end">${money(by[p].exp)}</td><td class="text-end">${money(by[p].sCost)}</td><td class="text-end">${money(by[p].order)}</td></tr>`).join("")
            : `<tr><td colspan="6" class="text-muted small">還沒有封存結論</td></tr>`;
    }

    return { init };

})();
