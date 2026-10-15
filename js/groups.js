// =========================================================
// 群組（產品、配方共用）：依產品類型、用途等分類，同一筆資料可以同時在多個群組
//   存在 Groups 欄位，以「|」分隔，例如「冰淇淋|市集款|B2B」
//   Groups.attach(select)：多選 + 可直接輸入新群組（按 Enter 建立），可打字模糊搜尋
// =========================================================
window.Groups = {

    parse(text) {
        const out = [];
        String(text || "").split(/[|,，、]/).map(s => s.trim()).filter(Boolean).forEach(s => { if (!out.includes(s)) out.push(s); });
        return out;
    },

    join(list) {
        return this.parse((list || []).join("|")).join("|");
    },

    // 所有用過的群組（依使用次數多到少）
    collect(...lists) {
        const count = new Map();
        lists.flat().forEach(r => this.parse(r && r.Groups).forEach(g => count.set(g, (count.get(g) || 0) + 1)));
        return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant")).map(x => x[0]);
    },

    badges(text) {
        return this.parse(text).map(g => `<span class="badge rounded-pill text-bg-light border me-1">🏷️ ${App.esc(g)}</span>`).join("");
    },

    // 篩選用的下拉選單：全部群組 + 各群組（附數量）
    fillFilter(select, rows, label = "全部群組") {
        const keep = select.value;
        const names = this.collect(rows);
        const count = g => rows.filter(r => this.parse(r.Groups).includes(g)).length;
        select.innerHTML = `<option value="">🏷️ ${label}</option>` + names.map(g => `<option value="${App.esc(g)}">${App.esc(g)}（${count(g)}）</option>`).join("");
        select.value = names.includes(keep) ? keep : "";
    },

    // 表單用：回傳 { get(), set(list|text), setOptions(names), disable(bool) }
    attach(select) {

        const opts = names => names.map(g => ({ value: g, text: g }));
        let ts = null;

        if (window.TomSelect) {
            ts = new TomSelect(select, {
                plugins: ["remove_button"], create: true, persist: false, createOnBlur: true, maxOptions: null, refreshThrottle: 0,
                placeholder: "選擇或輸入群組，例如：冰淇淋、市集款、B2B",
                score: window.MaterialQuick ? MaterialQuick.fuzzy.score : undefined,
                render: { option_create: (d, esc) => `<div class="create">＋ 新增群組「<b>${esc(d.input)}</b>」</div>` },
                // 選好一個群組後清掉輸入的字，接著打下一個
                onItemAdd() { this.setTextboxValue(""); this.refreshOptions(false); }
            });
        }

        return {
            get: () => (ts ? ts.getValue() : [...select.selectedOptions].map(o => o.value)).map(s => String(s).trim()).filter(Boolean),
            set: list => {
                const v = Array.isArray(list) ? list : Groups.parse(list);
                if (ts) {
                    v.forEach(g => { if (!ts.options[g]) ts.addOption({ value: g, text: g }); });
                    ts.setValue(v, true);
                } else {
                    v.forEach(g => { if (![...select.options].some(o => o.value === g)) select.add(new Option(g, g)); });
                    [...select.options].forEach(o => { o.selected = v.includes(o.value); });
                }
            },
            setOptions: names => {
                if (ts) { const cur = ts.getValue(); ts.addOptions(opts(names)); ts.setValue(cur, true); }
                else names.forEach(g => { if (![...select.options].some(o => o.value === g)) select.add(new Option(g, g)); });
            },
            disable: on => { if (ts) { if (on) ts.disable(); else ts.enable(); } else select.disabled = on; }
        };
    }
};
