window.Pages = window.Pages || {};
Pages.OrderReport = (() => {

    let orders = [];
    let charts = {};
    let currentRange = "day";

    let exportRange = "day";
    let exportFormat = "csv";

    async function init() {
        await load();
        bind();
        render();
        bindEvent()
    }

    function bindEvent() {

        // ⭐ 抓按鈕
        const goOrderBtn = document.getElementById('goOrderBtn');

        // ⭐ 綁事件（防呆寫法）
        if (goOrderBtn) {
            goOrderBtn.addEventListener('click', () => {
                window.location.href = './OrderNow.html';
            });
        }
    }
    async function load() {

        const result = await MarketStore.load();

        orders = result.orders;

        if (!result.online)
            alert(`⚠️ 目前無法連線到 Google 試算表（${result.error?.message || "網路錯誤"}），顯示的是本機資料`);
    }

    function bind() {

        document.querySelectorAll('#rangeGroup button').forEach(btn => {
            btn.onclick = () => {

                document.querySelectorAll('#rangeGroup button')
                    .forEach(b => b.classList.remove('active'));

                btn.classList.add('active');

                currentRange = btn.dataset.type;
                render();
            };
        });

        document.querySelectorAll('#exportRangeGroup button').forEach(btn => {
            btn.onclick = () => {

                document.querySelectorAll('#exportRangeGroup button')
                    .forEach(b => b.classList.remove('active'));

                btn.classList.add('active');
                exportRange = btn.dataset.range;
            };
        });

        document.querySelectorAll('#exportFormatGroup button').forEach(btn => {
            btn.onclick = () => {

                document.querySelectorAll('#exportFormatGroup button')
                    .forEach(b => b.classList.remove('active'));

                btn.classList.add('active');
                exportFormat = btn.dataset.format;
            };
        });

        document.getElementById('btnExport').onclick = exportReport;

    }
    function renderSummaries(data, t) {

        // 📈 趨勢
        const last = t.labels.length - 1;
        document.getElementById("trendSummary").innerHTML = `
        <div>最新日期：${t.labels[last] || '-'}</div>
        <div>營收：$${format(t.revenue[last] || 0)}</div>
        <div>來客：${t.orders[last] || 0}</div>
    `;

        // 🔥 時段
        const peak = [...data.hourMap]
            .map((h, i) => ({ ...h, hour: i }))
            .sort((a, b) => b.revenue - a.revenue)[0];

        document.getElementById("hourSummary").innerHTML = `
        <div>高峰：${peak.hour}:00</div>
        <div>營收：$${format(peak.revenue)}</div>
        <div>來客：${peak.orders}</div>
    `;

        // 🍦 冰
        document.getElementById("iceSummary").innerHTML = `
        <div>單球：${data.ice1}</div>
        <div>雙球：${data.ice2}</div>
        <div>三球：${data.ice3}</div>
    `;

        // 💰 營收
        document.getElementById("revenueSummary").innerHTML = `
        <div>冰品：$${format(data.iceRevenue)}</div>
        <div>鯛魚燒：$${format(data.fishRevenue)}</div>
        <div>甜筒：$${format(data.coneRevenue)}</div>
        <div>其他：$${format(data.otherRevenue)}</div>
    `;

        // 💳 支付
        document.getElementById("paymentSummary").innerHTML = `
        <div>現金：$${format(data.cashRevenue)}（${data.cash}）</div>
        <div>電子：$${format(data.onlineRevenue)}（${data.online}）</div>
    `;

        // 🧁 加購
        document.getElementById("addonSummary").innerHTML = `
        <div>甜筒：${data.coneCount}</div>
        <div>加魚1：${data.fish1}</div>
        <div>加魚2：${data.fish2}</div>
    `;
    }

    // =========================
    // 篩選
    // =========================
    function filter() {

        const now = new Date();

        if (currentRange === "all") return orders;

        return orders.filter(o => {

            const d = new Date(o.time);

            if (currentRange === "day")
                return d.toDateString() === now.toDateString();

            if (currentRange === "week") {

                const start = new Date(now);

                const day = now.getDay() === 0 ? 7 : now.getDay();
                // 週日(0) → 7，其餘不變

                start.setDate(now.getDate() - day + 1); // 回到週一
                start.setHours(0, 0, 0, 0); // 當天00:00

                return d >= start;
            }

            if (currentRange === "month")
                return d.getMonth() === now.getMonth()
                    && d.getFullYear() === now.getFullYear();

            return true;
        });
    }
    function format(n) {
        return n.toLocaleString();
    }
    // =========================
    // 核心分析（完整版）
    // =========================
    function analyze(list) {

        let revenue = 0;
        let orderCount = list.length;
        let itemCount = 0;
        let cashRevenue = 0;
        let onlineRevenue = 0;

        let ice1 = 0, ice2 = 0, ice3 = 0;

        let iceRevenue = 0;
        let fishRevenue = 0;
        let coneRevenue = 0;
        let otherRevenue = 0;

        let coneCount = 0;
        let fish1 = 0;
        let fish2 = 0;

        let cash = 0;
        let online = 0;

        let comboMap = {};
        let hourMap = Array(24).fill(0).map(() => ({
            revenue: 0,
            orders: 0,
            items: 0
        }));

        list.forEach(o => {

            revenue += o.total;

            // 支付
            if (o.payment === 'cash') {
                cash++;
                cashRevenue += o.total;
            } else {
                online++;
                onlineRevenue += o.total;
            }

            const hour = new Date(o.time).getHours();

            hourMap[hour].revenue += o.total;
            hourMap[hour].orders += 1;
            hourMap[hour].items += o.items.length;

            o.items.forEach(i => {

                itemCount++;

                // 冰
                if (i.iceCount === 1) ice1++;
                if (i.iceCount === 2) ice2++;
                if (i.iceCount === 3) ice3++;

                const icePrice =
                    i.iceCount === 1 ? 90 :
                        i.iceCount === 2 ? 150 :
                            i.iceCount === 3 ? 200 : 0;

                iceRevenue += icePrice;
                fishRevenue += i.addTaiyaki;
                fishRevenue += i.taiyakiOnly;

                if (i.cone) {
                    coneRevenue += 10;
                    coneCount++;
                }

                if (i.addTaiyaki === 20) fish1++;
                if (i.addTaiyaki === 40) fish2++;

                // 其他（自訂金額）
                const totalKnown =
                    icePrice + i.addTaiyaki + i.taiyakiOnly + (i.cone ? 10 : 0);

                if (i.total > totalKnown) {
                    otherRevenue += (i.total - totalKnown);
                }

                const key =
                    `${i.iceCount}球+加購魚${i.addTaiyaki}+單點魚${i.taiyakiOnly}+甜筒${i.cone}`;

                comboMap[key] = (comboMap[key] || 0) + 1;
            });
        });
        hourMap = hourMap.map(h => ({
            ...h,
            avg: h.orders ? Math.round(h.revenue / h.orders) : 0,
            avgItem: h.items ? Math.round(h.revenue / h.items) : 0
        }));
        return {
            revenue,
            orderCount,
            itemCount,

            cashRevenue,
            onlineRevenue,

            avgOrder: orderCount ? Math.round(revenue / orderCount) : 0,
            avgItem: itemCount ? Math.round(revenue / itemCount) : 0,
            avgItemsPerOrder: orderCount ? (itemCount / orderCount).toFixed(2) : 0,

            ice1, ice2, ice3,

            iceRevenue,
            fishRevenue,
            coneRevenue,
            otherRevenue,

            coneCount,
            fish1,
            fish2,

            cash,
            online,

            comboMap,
            hourMap
        };
    }

    // =========================
    // 趨勢
    // =========================
    function trend(list) {

        let map = {};

        list.forEach(o => {
            const d = o.time.slice(0, 10);

            if (!map[d]) {
                map[d] = {
                    revenue: 0,
                    orders: 0,
                    items: 0
                };
            }

            map[d].revenue += o.total;
            map[d].orders += 1;
            map[d].items += o.items.length;
        });

        const keys = Object.keys(map).sort().slice(-7);

        return {
            labels: keys,
            revenue: keys.map(k => map[k].revenue),
            orders: keys.map(k => map[k].orders),
            items: keys.map(k => map[k].items),
            avg: keys.map(k =>
                map[k].orders
                    ? Math.round(map[k].revenue / map[k].orders)
                    : 0
            )
        };
    }
    // =========================
    // Render
    // =========================
    function render() {

        const list = filter();
        const data = analyze(list);

        // ================= KPI 表格 =================
        document.getElementById('kpiRevenue').innerText = "$" + format(data.revenue);
        document.getElementById('kpiOrders').innerText = data.orderCount;
        document.getElementById('kpiAvg').innerText = "$" + data.avgOrder;

        document.getElementById('kpiItems').innerText = data.itemCount;
        document.getElementById('kpiAvgItem').innerText = "$" + data.avgItem;
        document.getElementById('kpiItemsPerOrder').innerText = data.avgItemsPerOrder;

        // ================= 圖表 =================

        const t = trend(list);

        drawLine(
            'chartTrend',
            t.labels,
            [
                { label: '營收', data: t.revenue }
            ],
            t
        );

        drawBar(
            'chartHour',
            [...Array(24).keys()],
            data.hourMap.map(h => h.revenue),
            '營收金額',
            data.hourMap
        );

        drawPie('chartIce',
            ['單球', '雙球', '三球'],
            [data.ice1, data.ice2, data.ice3],
            '組數'
        );

        // ✅ 支付（修正）
        drawPieWithTooltip('chartPayment',
            ['現金', '電子'],
            [data.cashRevenue, data.onlineRevenue],
            [data.cash, data.online]
        );

        // ✅ 加購
        drawPie('chartAddon',
            ['甜筒', '加魚1', '加魚2'],
            [data.coneCount, data.fish1, data.fish2],
            '組數'
        );

        // ✅ 營收結構（完整）
        drawPie('chartRevenue',
            ['冰品', '鯛魚燒', '甜筒', '其他'],
            [
                data.iceRevenue,
                data.fishRevenue,
                data.coneRevenue,
                data.otherRevenue
            ],
            '營收金額'
        );

        // 熱門組合
        const top = Object.entries(data.comboMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        drawBar('chartCombo',
            top.map(x => x[0]),
            top.map(x => x[1])
        );
        renderSummaries(data, t);
    }
    function drawPieWithTooltip(id, labels, data, counts) {
        if (charts[id]) charts[id].destroy();

        charts[id] = new Chart(document.getElementById(id), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: '金額',
                    data: data
                }]
            },
            options: {
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const i = ctx.dataIndex;
                                return `${labels[i]}：$${format(data[i])}（${counts[i]}筆）`;
                            }
                        }
                    }
                }
            }
        });
    }

    function downloadFile(content, filename, type) {

        const blob = new Blob([content], { type });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    function buildHTML(list, data) {

        return `
<html>
<head>
<meta charset="utf-8">
<title>營運報表</title>

<style>
body {
    font-family: Arial, sans-serif;
    padding: 20px;
    background: #fff;
}

/* 標題 */
h1 {
    text-align: center;
    margin-bottom: 30px;
}

/* 區塊 */
.block {
    margin-bottom: 25px;
    border: 1px solid #ddd;
    border-radius: 10px;
    padding: 15px;
}

/* 表格 */
table {
    width: 100%;
    border-collapse: collapse;
}

td, th {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: center;
}

/* 左右排 */
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

/* 列印優化 */
@media print {
    body {
        padding: 0;
    }
}
</style>

</head>
<body>

<h1>📊 營運報表（${exportRange}）</h1>

<!-- KPI -->
<div class="block">
<h2>📌 總覽</h2>
<table>
<tr>
    <th>營收</th>
    <th>來客數</th>
    <th>組數</th>
    <th>平均客單</th>
    <th>平均組價</th>
    <th>每單組數</th>
</tr>
<tr>
    <td>$${format(data.revenue)}</td>
    <td>${data.orderCount}</td>
    <td>${data.itemCount}</td>
    <td>$${format(data.avgOrder)}</td>
    <td>$${format(data.avgItem)}</td>
    <td>${data.avgItemsPerOrder}</td>
</tr>
</table>
</div>

<!-- 冰 + 加購 -->
<div class="grid">

<div class="block">
<h3>🍦 冰淇淋結構</h3>
<table>
<tr><th>單球</th><th>雙球</th><th>三球</th></tr>
<tr>
<td>${data.ice1}</td>
<td>${data.ice2}</td>
<td>${data.ice3}</td>
</tr>
</table>
</div>

<div class="block">
<h3>🧁 加購分析</h3>
<table>
<tr><th>甜筒</th><th>加魚1</th><th>加魚2</th></tr>
<tr>
<td>${data.coneCount}</td>
<td>${data.fish1}</td>
<td>${data.fish2}</td>
</tr>
</table>
</div>

</div>

<!-- 營收 -->
<div class="block">
<h3>💰 營收結構</h3>
<table>
<tr><th>冰品</th><th>鯛魚燒</th><th>甜筒</th><th>其他</th></tr>
<tr>
<td>$${format(data.iceRevenue)}</td>
<td>$${format(data.fishRevenue)}</td>
<td>$${format(data.coneRevenue)}</td>
<td>$${format(data.otherRevenue)}</td>
</tr>
</table>
</div>

<!-- 支付 -->
<div class="block">
<h3>💳 支付分析</h3>
<table>
<tr><th>方式</th><th>金額</th><th>筆數</th></tr>
<tr>
<td>現金</td>
<td>$${format(data.cashRevenue)}</td>
<td>${data.cash}</td>
</tr>
<tr>
<td>電子</td>
<td>$${format(data.onlineRevenue)}</td>
<td>${data.online}</td>
</tr>
</table>
</div>

</body>
</html>
`;
    }

    function buildCSV(list, data) {

        return `
營運報表 (${exportRange})

營收,${data.revenue}
來客數,${data.orderCount}
組數,${data.itemCount}
平均客單,${data.avgOrder}
平均組價,${data.avgItem}
每單組數,${data.avgItemsPerOrder}

---
冰淇淋結構
單球,雙球,三球
${data.ice1},${data.ice2},${data.ice3}
`;
    }

    function getExportData() {

        const now = new Date();

        return orders.filter(o => {

            const d = new Date(o.time);
            const diff = now - d;

            if (exportRange === "day")
                return diff <= 86400000;

            if (exportRange === "week")
                return diff <= 86400000 * 7;

            if (exportRange === "month")
                return diff <= 86400000 * 30;

            return true;
        });
    }
    function exportReport() {

        const list = getExportData();
        const data = analyze(list);

        let result = "";

        if (exportFormat === "csv") {
            result = buildCSV(list, data);
            downloadFile(result, "report.csv", "text/csv");
        }

        if (exportFormat === "html") {
            result = buildHTML(list, data);
            downloadFile(result, "report.html", "text/html");
        }

        if (exportFormat === "pdf") {

            const { jsPDF } = window.jspdf;

            html2canvas(document.querySelector(".order-ui"), {
                scale: 2 // ✅ 就是寫在這裡
            }).then(canvas => {

                const img = canvas.toDataURL("image/png");

                const pdf = new jsPDF('p', 'mm', 'a4');

                const imgWidth = 210;
                const pageHeight = 297;

                const imgHeight = canvas.height * imgWidth / canvas.width;
                let heightLeft = imgHeight;

                let position = 0;

                pdf.addImage(img, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;

                while (heightLeft > 0) {
                    position = heightLeft - imgHeight;
                    pdf.addPage();
                    pdf.addImage(img, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;
                }

                pdf.save("report.pdf");
            });
        }
    }

    // =========================
    // Chart 工具（避免 undefined）
    // =========================
    function drawPie(id, labels, data, labelName = '數據') {
        if (charts[id]) charts[id].destroy();

        charts[id] = new Chart(document.getElementById(id), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: labelName,
                    data: data
                }]
            }
        });
    }

    function drawBar(id, labels, data, labelName = '數據', fullData = null) {
        if (charts[id]) charts[id].destroy();

        charts[id] = new Chart(document.getElementById(id), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: labelName,
                    data: data
                }]
            },
            options: {
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {

                                if (!fullData) {
                                    return `${labelName}：${ctx.raw}`;
                                }

                                const d = fullData[ctx.dataIndex];

                                return [
                                    `營收：$${format(d.revenue)}`,
                                    `來客數：${d.orders}`,
                                    `組數：${d.items}`,
                                    `平均客單：$${d.avg}`,
                                    `平均組價：$${d.avgItem}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    function drawLine(id, labels, datasets, trendData = null) {
        if (charts[id]) charts[id].destroy();

        charts[id] = new Chart(document.getElementById(id), {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {

                                if (!trendData) {
                                    return `${ctx.dataset.label}：${ctx.raw}`;
                                }

                                const i = ctx.dataIndex;

                                return [
                                    `營收：$${format(trendData.revenue[i])}`,
                                    `來客數：${trendData.orders[i]}`,
                                    `組數：${trendData.items[i]}`,
                                    `平均客單：$${trendData.avg[i]}`,
                                    `平均組價：$${trendData.items[i] ? Math.round(trendData.revenue[i] / trendData.items[i]) : 0}`
                                ];
                            }
                        }
                    }
                }
            }
        });
    }

    // =========================
    // 清除
    // =========================
    async function clearRange() {

        if (!confirm("確定清除？（會同時刪除 Google 試算表中的資料）")) return;

        const now = new Date();
        const before = orders;

        orders = orders.filter(o => {

            const d = new Date(o.time);

            if (currentRange === "day")
                return d.toDateString() !== now.toDateString();

            if (currentRange === "week") {
                const start = new Date(now);
                start.setDate(now.getDate() - now.getDay());
                return d < start;
            }

            if (currentRange === "month")
                return !(d.getMonth() === now.getMonth()
                    && d.getFullYear() === now.getFullYear());

            return true;
        });

        const kept = new Set(orders);
        const removed = before.filter(o => !kept.has(o)).map(o => o.id);

        render();

        try {
            await MarketStore.remove(removed);
        } catch (err) {
            App.error(err, "雲端刪除失敗，請稍後再試");
        }
    }

    return { init };

})();