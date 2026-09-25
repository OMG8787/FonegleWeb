window.Pages = window.Pages || {};

Pages.OrderNow = (() => {

    const dom = {};

    let orders = [];
    let currentItems = []; // ⭐ 多組訂單

    let addTaiyakiValue = 0;
    let taiyakiOnlyValue = 0;
    let paymentType = "cash";

    const ICE_PRICE = {
        1: 90,
        2: 150,
        3: 200
    };

    function init() {
        bindDom();
        bindEvent();
        loadOrders();
        // ⭐ 只在第一次進來預設
        document.querySelector('input[name="icecream"][value="90"]').checked = true;
        updateTotal();
    }

    function bindDom() {

        dom.iceCreamRadios = document.querySelectorAll('input[name="icecream"]');
        dom.taiyakiOnlyMode = document.getElementById('taiyakiOnlyMode');

        dom.icePrice = document.getElementById('icePrice');
        dom.addPrice = document.getElementById('addPrice');
        dom.taiyakiPrice = document.getElementById('taiyakiPrice');
        dom.conePrice = document.getElementById('conePrice');
        dom.currentTotal = document.getElementById('currentTotal');

        dom.customAmount = document.getElementById('customAmount');

        dom.btnSubmit = document.getElementById('submitOrder');
        dom.btnAddItem = document.getElementById('addItem');
        dom.itemList = document.getElementById('itemList');

        dom.btnDownload = document.getElementById('downloadReport');
        dom.btnDelete = document.getElementById('deleteLastOrder');

        dom.addTaiyakiGroup = document.getElementById('addTaiyakiGroup');
        dom.taiyakiOnlyGroup = document.getElementById('taiyakiOnlyGroup');
        dom.addCone = document.getElementById('addCone');
        dom.paymentGroup = document.getElementById('paymentGroup');

        dom.receivedAmount = document.getElementById('receivedAmount');
        dom.change = document.getElementById('change');
        dom.shouldPay = document.getElementById('shouldPay');
        dom.grandTotal = document.getElementById('grandTotal');

        dom.goReportBtn = document.getElementById('goReportBtn');
    }

    function bindEvent() {

        dom.iceCreamRadios.forEach(r => r.addEventListener('change', updateTotal));
        dom.customAmount?.addEventListener('input', updateTotal);
        dom.taiyakiOnlyMode?.addEventListener('change', updateTotal);
        dom.addCone?.addEventListener('change', updateTotal);

        dom.btnAddItem?.addEventListener('click', addItem);
        dom.btnSubmit?.addEventListener('click', submitOrder);

        dom.btnDownload?.addEventListener('click', downloadReport);
        dom.btnDelete?.addEventListener('click', deleteLastOrder);

        dom.receivedAmount?.addEventListener('input', updateTotal);

        dom.goReportBtn?.addEventListener('click', () => {
            window.location.href = './market-report.html';
        });

        addTaiyakiValue = bindButtonGroup(dom.addTaiyakiGroup, val => {
            addTaiyakiValue = Number(val);
        });

        taiyakiOnlyValue = bindButtonGroup(dom.taiyakiOnlyGroup, val => {
            taiyakiOnlyValue = Number(val);
        });

        paymentType = bindButtonGroup(dom.paymentGroup, val => {
            paymentType = val;
        });
    }

    function bindButtonGroup(group, callback) {
        if (!group) return null;

        const buttons = group.querySelectorAll('button');
        let defaultValue = null;

        buttons.forEach(btn => {

            if (btn.classList.contains('active')) {
                defaultValue = btn.dataset.value;
            }

            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                callback(btn.dataset.value); // ⭐ 不轉數字
                updateTotal();
            });
        });

        callback(defaultValue);
        return defaultValue;
    }

    function resetSelection() {

        // ❌ 不再預設冰淇淋
        document.querySelectorAll('input[name="icecream"]').forEach(r => {
            r.checked = false;
        });


        if (dom.addCone) dom.addCone.checked = false;
        if (dom.customAmount) dom.customAmount.value = "";
        // if (dom.receivedAmount) dom.receivedAmount.value = "";
        dom.taiyakiOnlyMode.checked = false;
        dom.receivedAmount.value = "";
        dom.change.innerText = "$0";
        dom.change.style.color = "";
        resetButtonGroup(dom.addTaiyakiGroup);
        resetButtonGroup(dom.taiyakiOnlyGroup);

        // UI + 資料同步
        dom.addTaiyakiGroup.querySelector('[data-value="0"]')?.classList.add('active');
        dom.taiyakiOnlyGroup.querySelector('[data-value="0"]')?.classList.add('active');

        addTaiyakiValue = 0;
        taiyakiOnlyValue = 0;
        updateTotal();
    }

    function resetButtonGroup(group) {
        if (!group) return;

        const buttons = group.querySelectorAll('button');

        buttons.forEach(b => b.classList.remove('active'));
    }

    // =========================
    // ⭐ 加入一組
    // =========================
    function addItem() {

        const current = getCurrentSelectionTotal();

        const iceCount =
            current.ice === 90 ? 1 :
                current.ice === 150 ? 2 :
                    current.ice === 200 ? 3 : 0;

        const item = {
            iceCount,
            addTaiyaki: current.add,
            taiyakiOnly: current.taiyaki,
            cone: current.cone ? 1 : 0
        };

        item.total = calcItem(item);

        currentItems.push(item);

        // ⭐ 重置 UI（關鍵）
        resetSelection();

        renderItems();
        updateTotal();
    }

    function renderItems() {
        dom.itemList.innerHTML = currentItems.map((i, idx) => {

            // const ice = ICE_PRICE[i.iceCount] || 0;

            const total = i.total ?? calcItem(i);

            return `
            <div class="border p-2 mb-2">
                第${idx + 1}組：
                ${i.iceCount}球 /
                加魚:${i.addTaiyaki} /
                單點魚:${i.taiyakiOnly} /
                甜筒:${i.cone}
                <strong class="ms-2">= $${total}</strong>
            </div>
        `;
        }).join('');
    }

    // =========================
    // 計算金額（改為總和）
    // =========================
    function updateTotal() {

        // ===== 當前選擇 =====
        const current = getCurrentSelectionTotal();

        // 👉 本組金額
        dom.icePrice.innerText = '$' + current.ice;
        dom.addPrice.innerText = '$' + current.add;
        dom.taiyakiPrice.innerText = '$' + current.taiyaki;
        dom.conePrice.innerText = '$' + current.cone;

        // ===== 已加入 =====
        let itemsTotal = 0;

        currentItems.forEach(i => {
            itemsTotal += i.total ?? calcItem(i);
        });

        // 👉 應收（全部）
        const grandTotal = itemsTotal + current.total;

        dom.grandTotal.innerText = '$' + grandTotal;
        dom.shouldPay.innerText = '$' + grandTotal;
        dom.currentTotal.innerText = '$' + current.total;

        // ===== 找零 =====
        const received = parseInt(dom.receivedAmount.value, 10);
        const safeReceived = isNaN(received) ? 0 : received;

        let change = safeReceived - grandTotal;

        if (change < 0) {
            dom.change.innerText = `不足 $${Math.abs(change)}`;
            dom.change.style.color = 'red';
        } else {
            dom.change.innerText = `$${change}`;
            dom.change.style.color = 'green';
        }
    }

    function calcItem(i) {

        const ice = ICE_PRICE[i.iceCount] || 0;

        return ice + i.addTaiyaki + i.taiyakiOnly + (i.cone ? 10 : 0);
    }

    // =========================
    // 送出
    // =========================
    function submitOrder() {

        // if (received <= 0) {
        //     alert('請輸入收款金額');
        //     return;
        // }

        if (currentItems.length === 0) {
            alert('請先加入至少一組');
            return;
        }

        const grandTotal = Number(dom.grandTotal.innerText.replace('$', ''));
        const received = Number(dom.receivedAmount.value || 0);
        const change = received - grandTotal;

        // ⭐ 每組明細
        let detail = '';

        currentItems.forEach((i, idx) => {

            const ice = ICE_PRICE[i.iceCount] || 0;

            const total = i.total ?? calcItem(i);

            detail += `
第${idx + 1}組：
${i.iceCount}球 / 加魚:${i.addTaiyaki} / 單點魚:${i.taiyakiOnly} / 甜筒:${i.cone}
金額：$${total}
------------------`;
        });

        alert(`
【訂單明細】

${detail}

==================
組數：${currentItems.length}
應收：$${grandTotal}
收款：$${received}
找零：$${change < 0 ? 0 : change}
    `);

        const order = {
            time: new Date().toISOString(),
            items: JSON.parse(JSON.stringify(currentItems)),
            total: grandTotal,
            received,
            change,
            payment: paymentType
        };

        orders.push(order);

        // 寫入 Google 試算表（斷線時先暫存本機）
        MarketStore.add(order).then(ok => {
            if (!ok)
                alert("⚠️ 目前無法連線到 Google 試算表，這筆訂單暫存為「待上傳」，恢復網路後會自動上傳");
        }).catch(err => App.error(err, "訂單上傳失敗"));

        // ⭐ 清空整單（但下一筆重新預設）
        currentItems = [];
        renderItems();

        // ⭐ 重設 UI 並「恢復預設第一組」
        document.querySelector('input[name="icecream"][value="90"]').checked = true;
        dom.receivedAmount.value = "";

        resetButtonGroup(dom.addTaiyakiGroup);
        resetButtonGroup(dom.taiyakiOnlyGroup);

        dom.addTaiyakiGroup.querySelector('[data-value="0"]')?.classList.add('active');
        dom.taiyakiOnlyGroup.querySelector('[data-value="0"]')?.classList.add('active');

        addTaiyakiValue = 0;
        taiyakiOnlyValue = 0;

        updateTotal();
    }

    function analyzeOrders(orders) {

        let result = {
            orderCount: 0,
            itemCount: 0,
            totalRevenue: 0,

            comboMap: {},

            // 冰數量
            ice1: 0,
            ice2: 0,
            ice3: 0,

            // 營收
            iceRevenue: 0,
            addFishRevenue: 0,
            singleFishRevenue: 0,
            coneRevenue: 0,

            // 次數
            cone: 0,
            addFish: 0,
            singleFish: 0,

            // 支付
            cashCount: 0,
            onlineCount: 0,
            cashRevenue: 0,
            onlineRevenue: 0,

            // =====================
            // ⭐ 情境
            // =====================

            // 只魚
            onlyFish1: 0,
            onlyFish2: 0,

            // 只冰
            onlyIce1: 0,
            onlyIce2: 0,
            onlyIce3: 0,

            // 冰+甜筒
            iceCone1: 0,
            iceCone2: 0,
            iceCone3: 0,

            // ⭐ 冰+魚（新增🔥）
            iceAddFish1: 0,
            iceAddFish2: 0,

            // ⭐ 純甜筒（修正🔥）
            onlyCone: 0,

            // 加魚
            addFish1: 0,
            addFish2: 0
        };

        orders.forEach(o => {

            result.orderCount++;
            result.totalRevenue += o.total;

            // ⭐ 支付統計
            if (o.payment === 'cash') {
                result.cashCount++;
                result.cashRevenue += o.total;
            } else {
                result.onlineCount++;
                result.onlineRevenue += o.total;
            }

            o.items.forEach(i => {

                const icePrice = ICE_PRICE[i.iceCount] || 0;
                const conePrice = i.cone ? 10 : 0;

                result.iceRevenue += icePrice;
                result.addFishRevenue += i.addTaiyaki;
                result.singleFishRevenue += i.taiyakiOnly;
                result.coneRevenue += conePrice;

                result.itemCount++;

                // 冰
                if (i.iceCount === 1) result.ice1++;
                if (i.iceCount === 2) result.ice2++;
                if (i.iceCount === 3) result.ice3++;

                // 次數
                if (i.cone) result.cone++;
                if (i.addTaiyaki > 0) result.addFish++;
                if (i.taiyakiOnly > 0) result.singleFish++;

                // 組合
                const key = `${i.iceCount}球_魚${i.addTaiyaki}_單魚${i.taiyakiOnly}_筒${i.cone}`;
                result.comboMap[key] = (result.comboMap[key] || 0) + 1;

                // =====================
                // ⭐ 情境分析
                // =====================

                // 1️⃣ 只魚
                if (i.iceCount === 0 && i.taiyakiOnly > 0 && !i.cone) {
                    if (i.taiyakiOnly === 60) result.onlyFish1++;
                    if (i.taiyakiOnly === 100) result.onlyFish2++;
                }

                // 2️⃣ 只冰
                if (i.iceCount > 0 && i.addTaiyaki === 0 && i.taiyakiOnly === 0 && !i.cone) {
                    if (i.iceCount === 1) result.onlyIce1++;
                    if (i.iceCount === 2) result.onlyIce2++;
                    if (i.iceCount === 3) result.onlyIce3++;
                }

                // 3️⃣ 冰+甜筒
                if (i.iceCount > 0 && i.cone) {
                    if (i.iceCount === 1) result.iceCone1++;
                    if (i.iceCount === 2) result.iceCone2++;
                    if (i.iceCount === 3) result.iceCone3++;
                }

                // 4️⃣ ⭐ 冰+魚（新增🔥）
                if (i.iceCount > 0 && i.addTaiyaki > 0) {
                    if (i.addTaiyaki === 20) result.iceAddFish1++;
                    if (i.addTaiyaki === 40) result.iceAddFish2++;
                }

                // 5️⃣ ⭐ 純甜筒（修正）
                if (i.iceCount === 0 && i.cone && i.taiyakiOnly === 0) {
                    result.onlyCone++;
                }

                // 6️⃣ 加魚
                if (i.addTaiyaki > 0) {
                    if (i.addTaiyaki === 20) result.addFish1++;
                    if (i.addTaiyaki === 40) result.addFish2++;
                }

            });
        });

        // =====================
        // 平均
        // =====================

        result.avgOrder = result.orderCount
            ? Math.round(result.totalRevenue / result.orderCount)
            : 0;

        result.avgItem = result.itemCount
            ? Math.round(result.totalRevenue / result.itemCount)
            : 0;

        result.avgItemsPerOrder = result.orderCount
            ? (result.itemCount / result.orderCount).toFixed(2)
            : 0;

        result.addFishRate = result.itemCount
            ? (result.addFish / result.itemCount * 100).toFixed(1) + '%'
            : '0%';

        result.coneRate = result.itemCount
            ? (result.cone / result.itemCount * 100).toFixed(1) + '%'
            : '0%';

        result.singleFishRate = result.itemCount
            ? (result.singleFish / result.itemCount * 100).toFixed(1) + '%'
            : '0%';

        return result;
    }
    // 以本地時間（台灣）取日期，避免 UTC 造成早上 8 點前的訂單算到前一天
    function localDay(time) {
        const d = new Date(time);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function groupOrders(orders) {

        const dayMap = {};
        const weekMap = {};
        const monthMap = {};

        orders.forEach(o => {

            const date = new Date(o.time);

            const dayKey = localDay(date);

            const weekKey = getWeekKey(date);

            const monthKey =
                date.getFullYear() + '-' +
                String(date.getMonth() + 1).padStart(2, '0');

            pushGroup(dayMap, dayKey, o);
            pushGroup(weekMap, weekKey, o);
            pushGroup(monthMap, monthKey, o);
        });

        return { dayMap, weekMap, monthMap };
    }

    function pushGroup(map, key, order) {
        if (!map[key]) map[key] = [];
        map[key].push(order);
    }

    // ISO week
    function getWeekKey(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);

        d.setDate(d.getDate() + 4 - (d.getDay() || 7));

        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

        return `${d.getFullYear()}-W${weekNo}`;
    }

    function getCurrentSelectionTotal() {

        const isTaiyakiOnly = dom.taiyakiOnlyMode.checked;

        const ice = isTaiyakiOnly
            ? 0
            : Number(document.querySelector('input[name="icecream"]:checked')?.value || 0);

        const add = isTaiyakiOnly ? 0 : Number(addTaiyakiValue || 0);
        const taiyaki = Number(taiyakiOnlyValue || 0);
        const cone = isTaiyakiOnly ? 0 : (dom.addCone?.checked ? 10 : 0);

        return {
            ice,
            add,
            taiyaki,
            cone,
            total: ice + add + taiyaki + cone
        };
    }
    // =========================
    // CSV（強化版）
    // =========================
    function buildSection(title, map) {

        let csv = `${title}\n\n`;

        // =====================
        // 核心指標
        // =====================
        csv += '【核心指標】\n';
        csv += '期間,來客數,組數,總營收,平均客單價,平均組價,每單組數\n';

        Object.keys(map).sort().forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.orderCount,
                s.itemCount,
                s.totalRevenue,
                s.avgOrder,
                s.avgItem,
                s.avgItemsPerOrder
            ].join(',') + '\n';
        });

        csv += '\n';

        // =====================
        // 營收結構
        // =====================
        csv += '【營收結構】\n';
        csv += '期間,冰淇淋營收,加購魚營收,單點魚營收,甜筒營收\n';

        Object.keys(map).sort().forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.iceRevenue,
                s.addFishRevenue,
                s.singleFishRevenue,
                s.coneRevenue
            ].join(',') + '\n';
        });

        csv += '\n';

        // =====================
        // 銷售行為
        // =====================
        csv += '【銷售行為】\n';
        csv += '期間,加魚率,甜筒率,單點魚率\n';

        Object.keys(map).sort().forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.addFishRate,
                s.coneRate,
                s.singleFishRate
            ].join(',') + '\n';
        });

        csv += '\n';

        // =====================
        // 冰結構
        // =====================
        csv += '【冰淇淋結構】\n';
        csv += '期間,單球,雙球,三球\n';

        Object.keys(map).sort().forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.ice1,
                s.ice2,
                s.ice3
            ].join(',') + '\n';
        });

        csv += '\n';

        // =====================
        // 情境
        // =====================
        csv += '【購買情境】\n';
        csv += '期間,單點一條魚,單點兩條魚,純冰(單球),純冰(雙球),純冰(三球),單球+甜筒,雙球+甜筒,三球+甜筒,冰+單魚,冰+雙魚\n';

        Object.keys(map).sort().forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.onlyFish1,
                s.onlyFish2,
                s.onlyIce1,
                s.onlyIce2,
                s.onlyIce3,
                s.iceCone1,
                s.iceCone2,
                s.iceCone3,
                s.addFish1,
                s.addFish2
            ].join(',') + '\n';
        });

        csv += '\n';

        csv += '【加購統計】\n';
        csv += '期間,甜筒總數,加魚單條,加魚雙條\n';

        Object.keys(map).forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.cone,
                s.addFish1,
                s.addFish2
            ].join(',') + '\n';
        });

        csv += '\n';

        csv += '【支付統計】\n';
        csv += '期間,現金筆數,電子筆數,現金營收,電子營收\n';

        Object.keys(map).forEach(key => {
            const s = analyzeOrders(map[key]);

            csv += [
                key,
                s.cashCount,
                s.onlineCount,
                s.cashRevenue,
                s.onlineRevenue
            ].join(',') + '\n';
        });

        csv += '\n';
        return csv;
    }

    function downloadReport() {

        if (orders.length === 0) return alert('沒有資料');

        const { dayMap, weekMap, monthMap } = groupOrders(orders);

        let csv = '\uFEFF';

        csv += buildSection("【日報】", dayMap);
        csv += buildSection("【週報】", weekMap);
        csv += buildSection("【月報】", monthMap);

        // ⭐ 必須在下載前加入
        csv += buildDailyDetail(orders);

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'report.csv';
        link.click();
    }


    async function loadOrders() {

        setupPendingBanner();

        try {

            const result = await MarketStore.load();

            orders = result.orders;

            if (result.uploaded)
                alert(`☁️ 已補上傳 ${result.uploaded} 筆斷線時的訂單`);

        } catch (err) {

            App.error(err, "讀取雲端訂單失敗");
        }
    }

    // 斷線待上傳提示（有待上傳訂單時才顯示）
    function setupPendingBanner() {

        const banner = document.createElement("div");
        banner.id = "pendingBanner";
        banner.className = "alert alert-warning d-none d-flex justify-content-between align-items-center";
        banner.innerHTML = `<span id="pendingText"></span>
            <button class="btn btn-sm btn-warning" id="btnRetryUpload">立即上傳</button>`;

        const main = document.querySelector("#erp-main .container-fluid") || document.body;
        main.prepend(banner);

        const update = n => {
            banner.classList.toggle("d-none", !n);
            document.getElementById("pendingText").textContent =
                `⚠️ 有 ${n} 筆訂單因斷線尚未上傳到 Google 試算表，恢復網路後會自動上傳`;
        };

        MarketStore.onPendingChange(update);
        update(MarketStore.pendingCount());

        document.getElementById("btnRetryUpload").addEventListener("click", async () => {
            try {
                const n = await MarketStore.syncPending({});
                alert(`☁️ 已上傳 ${n} 筆`);
                orders = (await MarketStore.load()).orders;
            } catch (err) {
                App.error(err, "仍無法連線，請稍後再試");
            }
        });
    }

    async function deleteLastOrder() {

        if (orders.length === 0) return alert('沒有訂單');

        orders.sort((a, b) => new Date(a.time) - new Date(b.time));

        const last = orders[orders.length - 1];

        if (!confirm(`確定刪除最後一筆訂單？\n時間：${new Date(last.time).toLocaleString()}\n金額：$${last.total}`))
            return;

        orders.pop();

        try {
            await MarketStore.remove([last.id]);
            alert('已刪除');
        } catch (err) {
            App.error(err, '雲端刪除失敗，請稍後再試');
        }
    }
    function buildDailyDetail(orders) {

        let csv = '【每日流水帳】\n';

        const map = {};

        orders.forEach(o => {
            const day = localDay(o.time);
            if (!map[day]) map[day] = [];
            map[day].push(o);
        });

        Object.keys(map).sort().forEach(day => {

            const list = map[day].sort((a, b) => new Date(a.time) - new Date(b.time));

            let dayTotal = 0;

            csv += `\n日期：${day}\n`;
            csv += '時間,組數,金額,購買內容\n';

            list.forEach(o => {

                const time = new Date(o.time).toLocaleTimeString();

                // ⭐ 組合內容
                const detail = o.items.map(i => {
                    return `${i.iceCount}球+魚${i.addTaiyaki}+單魚${i.taiyakiOnly}+筒${i.cone}`;
                }).join(' | ');

                csv += [
                    time,
                    o.items.length,
                    o.total,
                    `"${detail}"`
                ].join(',') + '\n';

                dayTotal += o.total;
            });

            csv += `當日總營收,${dayTotal}\n`;
        });

        csv += '\n';

        return csv;
    }

    return { init };

})();