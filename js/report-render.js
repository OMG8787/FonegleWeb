// =========================================================
// 報告 / 行銷文宣輸出：資料 { theme, meta, blocks[] } → 單一獨立 HTML
//   buildReportHtml 是純函式（只吃 JSON、只吐字串、沒有副作用），
//   預覽、列印、下載都用它，所見即所得。使用者輸入一律先過白名單 / 跳脫。
// =========================================================
window.ReportRender = (() => {

    "use strict";

    const THEMES = {
        brand: { name: "瘋菓棕", primary: "#b9805f", dark: "#4d341c" },
        blue: { name: "海洋藍", primary: "#0d6efd", dark: "#0d3b66" },
        green: { name: "森林綠", primary: "#198754", dark: "#14532d" },
        pink: { name: "莓果粉", primary: "#d63384", dark: "#6f1a45" },
        dark: { name: "沉穩灰", primary: "#495057", dark: "#212529" }
    };

    const FONTS = {
        jhenghei: { name: "微軟正黑體", css: `"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif` },
        noto: { name: "Noto 黑體", css: `"Noto Sans TC","Microsoft JhengHei",sans-serif`, google: "Noto+Sans+TC:wght@400;700" },
        system: { name: "系統預設（網頁常用）", css: `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft JhengHei",Arial,sans-serif` },
        serif: { name: "Noto 明體", css: `"Noto Serif TC","PMingLiU",serif`, google: "Noto+Serif+TC:wght@400;700" }
    };

    const PAGES = {
        a4: { name: "A4 直式", css: "A4", width: 210 },
        a4l: { name: "A4 橫式", css: "A4 landscape", width: 297 },
        a3: { name: "A3 直式", css: "A3", width: 297 },
        wide: { name: "簡報 16:9", css: "297mm 167mm", width: 297 }
    };

    const CALLOUTS = {
        conclusion: { name: "結論", icon: "✅", color: "#198754" },
        suggest: { name: "建議", icon: "💡", color: "#0d6efd" },
        notice: { name: "注意", icon: "⚠️", color: "#f08c00" },
        risk: { name: "風險", icon: "🚨", color: "#dc3545" },
        note: { name: "說明", icon: "📝", color: "#6c757d" }
    };

    // ---------- 安全過濾 ----------
    const esc = v => String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const safeColor = (c, def) => /^#[0-9a-f]{3,8}$/i.test(String(c || "").trim()) ? String(c).trim() : def;

    const safeNum = (n, def, min, max) => {
        n = Number(n);
        return isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };

    // 圖片只接受 data:image base64（上傳 / 貼上的圖）或 https 網址（已放在網路上的圖）
    const safeImgSrc = s => {
        s = String(s || "");
        return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https:\/\/[^\s"'<>()\\]+$/.test(s) ? s : "";
    };

    const safeUrl = u => /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "";

    const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI", "H3", "H4", "A", "FONT"]);

    function cleanStyle(style) {
        const out = [];
        String(style || "").split(";").forEach(p => {
            const i = p.indexOf(":");
            if (i < 0) return;
            const k = p.slice(0, i).trim().toLowerCase();
            const v = p.slice(i + 1).trim();
            if ((k === "color" || k === "background-color") && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(v)) out.push(`${k}:${v}`);
            else if (k === "font-size" && /^\d{1,3}(\.\d+)?(px|pt|em|rem|%)$/.test(v)) out.push(`${k}:${v}`);
            else if (k === "text-align" && /^(left|right|center|justify)$/.test(v)) out.push(`${k}:${v}`);
            else if (k === "font-weight" && /^(bold|normal|[1-9]00)$/.test(v)) out.push(`${k}:${v}`);
        });
        return out.join(";");
    }

    // 富文字白名單：只留安全標籤與屬性，其餘拿掉（保留文字）
    function sanitizeRichHtml(html) {

        const doc = new DOMParser().parseFromString(`<body>${String(html || "")}</body>`, "text/html");

        const walk = node => {
            [...node.childNodes].forEach(ch => {
                if (ch.nodeType === 3) return;
                if (ch.nodeType !== 1) { ch.remove(); return; }

                if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|SVG|MATH|FORM|INPUT|TEXTAREA|BUTTON|SELECT|IMG|VIDEO|AUDIO)$/.test(ch.tagName)) { ch.remove(); return; }

                walk(ch);

                if (!ALLOWED_TAGS.has(ch.tagName)) {
                    ch.replaceWith(...ch.childNodes);
                    return;
                }

                const keep = {};
                if (ch.tagName === "A") {
                    const href = safeUrl(ch.getAttribute("href"));
                    if (href) keep.href = href;
                }
                const st = cleanStyle(ch.getAttribute("style"));
                if (st) keep.style = st;
                if (ch.tagName === "FONT") {
                    const c = ch.getAttribute("color");
                    if (c && /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(c)) keep.color = c;
                }

                [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
                Object.keys(keep).forEach(k => ch.setAttribute(k, keep[k]));
                if (ch.tagName === "A") { ch.setAttribute("target", "_blank"); ch.setAttribute("rel", "noopener noreferrer"); }
            });
        };

        walk(doc.body);
        return doc.body.innerHTML;
    }

    const hexToRgba = (hex, a) => {
        let h = safeColor(hex, "#000000").slice(1);
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        const n = parseInt(h.slice(0, 6), 16) || 0;
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    };

    // ---------- CSS ----------
    function buildCss(o) {
        return `
:root{--p:${o.primary};--d:${o.dark};--tint:${hexToRgba(o.primary, .08)};--txt:${o.text}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${o.page.css};margin:12mm 12mm 14mm}
body{margin:0;background:#eceff3;color:var(--txt);font-family:${o.font.css};font-size:${o.baseSize}px;line-height:1.7}
.rp-page{position:relative;max-width:${o.web ? o.cardWidth + "px" : o.page.width + "mm"};margin:0 auto;background:${o.web ? o.cardBg : "#fff"};padding:14mm 14mm 10mm;min-height:100vh}
${o.web ? `body{background:${o.pageBg};padding:20px}
.rp-page{padding:0;min-height:0;border-radius:${o.cardRadius}px;border:1px solid #e6e6e6;box-shadow:0 4px 12px rgba(0,0,0,.08);overflow:hidden}
.rp-content{padding:26px}
.rp-cover{min-height:0;padding:30px 0;border-bottom:0;break-after:auto;page-break-after:auto}
.mk-hero{margin:0 -26px}
@media print{body{padding:0}.rp-page{border:0;box-shadow:none;border-radius:0}}` : ""}
.rp-wm{position:fixed;pointer-events:none;z-index:5;white-space:nowrap}
.rp-logo{margin:0 0 1em}.rp-logo img{max-width:100%;height:auto;display:inline-block}
.rp-page>*{position:relative;z-index:1}
h1,h2,h3{color:var(--d);line-height:1.35}
.rp-cover{min-height:250mm;display:flex;flex-direction:column;justify-content:center;text-align:center;border-bottom:6px solid var(--p);break-after:page;page-break-after:always}
.rp-cover .kicker{color:var(--p);letter-spacing:.3em;font-weight:700}
.rp-cover h1{font-size:2.6em;margin:.3em 0}
.rp-cover .sub{font-size:1.2em;color:#555}
.rp-cover .cust{margin-top:1.5em;font-size:1.1em}
.rp-cover img.cv{max-width:70%;max-height:90mm;margin:1.5em auto;border-radius:10px;object-fit:contain}
.rp-cover .meta{margin-top:2em;color:#777;font-size:.9em}
.rp-h2{font-size:1.55em;margin:1.6em 0 .6em;padding-left:.6em;border-left:6px solid var(--p);break-after:avoid;page-break-after:avoid}
.rp-h2 .no{color:var(--p);margin-right:.4em}
.rp-text{margin:.6em 0}
.rp-text ul,.rp-text ol{padding-left:1.4em}
.rp-figs{display:flex;gap:12px;flex-wrap:wrap;margin:1em 0}
.rp-figs.center{justify-content:center}.rp-figs.right{justify-content:flex-end}
.rp-figure{margin:0;text-align:center;break-inside:avoid;page-break-inside:avoid}
.rp-figure img{max-width:100%;border-radius:6px;border:1px solid #e3e3e3}
.rp-figure figcaption{font-size:.85em;color:#666;margin-top:4px}
.rp-it{display:flex;gap:18px;align-items:flex-start;margin:1em 0;break-inside:avoid}
.rp-it.rev{flex-direction:row-reverse}
.rp-it .im{flex:0 0 42%}.rp-it .im img{width:100%;border-radius:8px}
.rp-it .tx{flex:1}
.rp-table{width:100%;border-collapse:collapse;margin:1em 0}
.rp-table td,.rp-table th{border:1px solid #dcdcdc;padding:7px 10px;vertical-align:top;text-align:left}
.rp-table tr{break-inside:avoid;page-break-inside:avoid}
.rp-table th,.rp-table td.k{background:var(--tint);color:var(--d);font-weight:700;width:28%}
.rp-table.grid th{width:auto;background:var(--p);color:#fff}
.rp-callout{margin:1em 0;padding:12px 16px;border-left:6px solid var(--c);background:var(--cb);border-radius:6px;break-inside:avoid;page-break-inside:avoid}
.rp-callout .t{font-weight:700;color:var(--c);margin-bottom:.3em}
.rp-sign{display:flex;gap:16px;margin:2em 0 1em;break-inside:avoid}
.rp-sign div{flex:1;border-top:1px solid #555;padding-top:6px;text-align:center;min-height:60px;padding-top:40px}
.rp-pagebreak{break-after:page;page-break-after:always;height:0}
.mk-hero{min-height:90mm;margin:0 -14mm;padding:22mm 14mm;color:#fff;text-align:center;background:linear-gradient(135deg,var(--d),var(--p)) center/cover;display:flex;flex-direction:column;justify-content:center;align-items:center;break-inside:avoid}
.mk-hero h1{color:#fff;font-size:2.6em;margin:0 0 .3em;text-shadow:0 2px 12px rgba(0,0,0,.35)}
.mk-hero p{font-size:1.2em;margin:0 0 1em;text-shadow:0 2px 8px rgba(0,0,0,.35)}
.mk-btn{display:inline-block;background:#fff;color:var(--d)!important;padding:.6em 1.6em;border-radius:99px;font-weight:700;text-decoration:none}
.mk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:1.2em 0}
.mk-card{background:var(--tint);border-radius:12px;padding:16px;text-align:center;break-inside:avoid}
.mk-card .ic{font-size:2em}.mk-card h3{margin:.3em 0}.mk-card p{margin:0;font-size:.95em}
.mk-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:1.2em 0}
.mk-plan{border:2px solid #e3e3e3;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}
.mk-plan.hl{border-color:var(--p);background:var(--tint)}
.mk-plan .pn{font-weight:700;color:var(--d)}.mk-plan .pr{font-size:2em;font-weight:700;color:var(--p)}
.mk-plan ul{list-style:none;padding:0;margin:.6em 0 0;font-size:.95em}.mk-plan li{padding:3px 0;border-top:1px dashed #ddd}
.mk-cta{margin:1.4em 0;padding:22px;border-radius:14px;background:var(--d);color:#fff;text-align:center;break-inside:avoid}
.mk-cta h2{color:#fff;margin:0 0 .3em}.mk-cta img{width:110px;height:110px;margin:.8em auto 0;background:#fff;padding:6px;border-radius:8px;display:block}
.mk-gal{display:grid;gap:10px;margin:1em 0}.mk-gal img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px}
.mk-quote{border-left:5px solid var(--p);background:var(--tint);padding:10px 16px;margin:.8em 0;border-radius:6px;break-inside:avoid}
.mk-quote .who{text-align:right;color:var(--d);font-weight:700;font-size:.9em}
.rp-title{font-size:1.85em;margin:.2em 0 .5em;font-weight:800;color:var(--d)}
.rp-sec{font-size:1.2em;margin:1.3em 0 .6em;font-weight:800;color:var(--d)}
.rp-claim{margin:.6em 0}.rp-claim .big{font-size:1.35em;font-weight:700;color:var(--d)}.rp-claim .sub{color:#555;margin-top:6px}
.rp-tags{margin:.6em 0}.rp-tags span{display:inline-block;background:var(--tint);border:1px solid ${hexToRgba(o.primary, .35)};color:var(--d);padding:4px 10px;border-radius:999px;font-size:.87em;margin:0 6px 6px 0}
.rp-bl ul,.rp-bl ol{margin:.4em 0;padding-left:1.3em}.rp-bl li{margin:.35em 0}
.rp-bl ul.check,.rp-bl ul.arrow{list-style:none;padding-left:0}
.rp-bl ul.check li:before{content:"✓";color:var(--p);font-weight:700;margin-right:.6em}
.rp-bl ul.arrow li:before{content:"➜";color:var(--p);margin-right:.6em}
.rp-btns{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.rp-btn{display:inline-block;padding:11px 20px;border-radius:12px;background:var(--p);color:#fff!important;font-weight:700;text-decoration:none;box-shadow:0 4px 8px ${hexToRgba(o.primary, .3)}}
.rp-btn.ghost{background:#fff;color:var(--p)!important;border:1px solid var(--p);box-shadow:0 2px 6px ${hexToRgba(o.primary, .15)}}
.rp-btn.link{background:none;box-shadow:none;color:var(--p)!important;text-decoration:underline;padding-left:0}
.mk-card.inl{display:flex;gap:10px;text-align:left;align-items:flex-start}.mk-card.inl .ic{font-size:1.6em;line-height:1;color:var(--p)}.mk-card.inl .bc{flex:1;font-size:.95em}.mk-card.inl strong{color:var(--p)}
.mk-card.plain{background:none;padding:6px}
.rp-steps{display:flex;gap:12px;margin:1em 0}.rp-step{flex:1;background:var(--tint);border:1px solid ${hexToRgba(o.primary, .25)};border-radius:12px;padding:14px;text-align:center;font-size:.95em;break-inside:avoid}
.rp-step .n{display:inline-block;min-width:1.8em;height:1.8em;line-height:1.8em;border-radius:50%;background:var(--p);color:#fff;font-weight:700;margin-bottom:6px}
.rp-step .ic{font-size:1.6em;line-height:1.3}.rp-step strong{display:block;color:var(--d)}
.mk-prods{display:grid;gap:14px;margin:1em 0}.mk-prod{break-inside:avoid}.mk-prod img{width:100%;object-fit:cover;border-radius:12px;display:block}
.mk-prod .pn{font-weight:700;margin-top:6px;color:var(--d)}.mk-prod .pp{color:var(--p);font-weight:700}.mk-prod .pt{font-size:.9em;color:#666}.mk-prod a{color:inherit;text-decoration:none}
.rp-cols{display:grid;gap:16px;margin:.8em 0}
.rp-hr{border:0;border-top:1px solid #ddd}.rp-hr.dashed{border-top:2px dashed #ccc}.rp-hr.dotted{border-top:3px dotted #ccc}.rp-hr.space{border-top:0}
.rp-ft{margin-top:1.6em;padding-top:14px;border-top:1px solid #eee;font-size:.87em;color:#555;line-height:1.6}
.rp-text a,.rp-ft a,.rp-cols a{color:var(--p)}
.rp-banner{margin:${o.web ? "-26px -26px 18px" : "0 0 14px"}}.rp-banner img{width:100%;display:block;object-fit:cover;${o.web ? "" : "border-radius:8px"}}
.bx{margin:1em 0;padding:var(--bxp,14px);border-radius:var(--bxr,12px);overflow:hidden}
.bx>*:first-child{margin-top:0}.bx>*:last-child{margin-bottom:0}
.bx-card{background:var(--bxbg,${hexToRgba(o.primary, .08)});border:1px solid var(--bxbd,${hexToRgba(o.primary, .25)})}
.bx-outline{border:2px solid var(--bxbd,var(--p));background:var(--bxbg,transparent)}
.bx-shadow{background:var(--bxbg,#fff);border:1px solid #eee;box-shadow:0 4px 14px rgba(0,0,0,.14)}
.bx-solid{background:var(--bxbg,var(--p));color:#fff}.bx-solid *{color:inherit!important}.bx-solid .rp-btn{background:#fff;color:var(--p)!important}
.bx-tint{background:var(--bxbg,var(--tint))}
.bx-dashed{border:2px dashed var(--bxbd,var(--p));background:var(--bxbg,transparent)}
.bx-bar{border-left:6px solid var(--bxbd,var(--p));background:var(--bxbg,var(--tint));border-radius:0 var(--bxr,12px) var(--bxr,12px) 0}
.rp-foot{margin-top:2.5em;padding-top:10px;border-top:2px solid var(--p);text-align:center;font-size:.85em;color:#666;break-inside:avoid}
.rp-foot .co{font-weight:700;color:var(--d)}
${o.forEditor ? `[data-block-id]{cursor:pointer;outline-offset:3px}
[data-block-id]:hover{outline:2px dashed var(--p)}
[data-block-id].rp-active{outline:2px solid var(--p)}` : ""}
@media print{body{background:#fff}.rp-page{max-width:none;padding:0;min-height:0}.mk-hero{margin:0}}
@media (max-width:640px){.mk-grid,.rp-cols,.mk-prods{grid-template-columns:1fr!important}.rp-steps{flex-direction:column}.rp-it{flex-direction:column!important}.rp-it .im{flex-basis:auto;width:100%}}`;
    }

    // ---------- 區塊 ----------
    const BOX_STYLES = { none: "無外框", card: "卡片（淡底＋細框）", outline: "外框線", shadow: "陰影卡片", solid: "實心色塊（白字）", tint: "淺色底", dashed: "虛線框", bar: "左側粗線" };
    const NO_BOX = { cover: 1, pagebreak: 1, banner: 1, hero: 1, divider: 1 };

    function buildReportHtml(report, opt = {}) {

        const t = report.theme || {};
        const m = report.meta || {};
        const primary = safeColor(t.primary, "#b9805f");
        const dark = safeColor(t.dark, "#4d341c");
        const text = safeColor(t.textColor, "#2b2b2b");
        const font = FONTS[t.font] || FONTS.jhenghei;
        const page = PAGES[t.pageSize] || PAGES.a4;
        const baseSize = safeNum(t.baseSize, 14, 8, 48);
        const logo = safeImgSrc(t.logo);
        const web = t.layout === "web";

        let chapter = 0, fig = 0, boxed = false;

        const attr = b => (opt.forEditor && !boxed ? ` data-block-id="${esc(b.id)}"` : "");

        const img = (src, alt) => { const s = safeImgSrc(src); return s ? `<img src="${esc(s)}" alt="${esc(alt || "")}">` : ""; };

        const btn = (x, cls) => {
            const url = safeUrl(x.url);
            return `<a class="${cls}"${url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ""}>${esc(x.text)}</a>`;
        };

        const lines = v => String(v || "").split("\n").map(s => s.trim()).filter(Boolean);
        const bold = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        const RATIOS = { "1/1": "1/1", "4/3": "4/3", "3/4": "3/4", "16/9": "16/9" };
        const withRatio = (html, r) => html.replace("<img ", `<img style="aspect-ratio:${RATIOS[r] || "1/1"}" `);

        // Logo：可選擇顯示在封面 / 頁首 / 頁尾，並調整寬度、對齊與位移
        const logoHtml = where => {
            if (!logo || (t.logoShow || "cover") !== where) return "";
            const al = ["left", "right"].includes(t.logoAlign) ? t.logoAlign : "center";
            const dx = safeNum(t.logoDx, 0, -400, 400), dy = safeNum(t.logoDy, 0, -200, 200);
            return `<div class="rp-logo" style="text-align:${al}"><img src="${esc(logo)}" alt="" style="width:${safeNum(t.logoW, 120, 20, 800)}px;${dx || dy ? `transform:translate(${dx}px,${dy}px)` : ""}"></div>`;
        };

        // 浮水印：文字或圖片，可調透明度、大小、角度、顏色與位置（含整頁平鋪）
        function watermarkHtml() {
            if (!t.watermark) return "";
            const isImg = t.watermarkType === "image";
            const wImg = safeImgSrc(t.wmImage);
            const txt = String(t.watermarkText || "");
            if (isImg ? !wImg : !txt) return "";

            const op = safeNum(t.wmOpacity, 6, 1, 100) / 100;
            const size = safeNum(t.wmSize, isImg ? 240 : 88, 10, 1200);
            const ang = safeNum(t.wmAngle, -24, -180, 180);
            const color = safeColor(t.wmColor, dark);
            const pos = ["tile", "tl", "tr", "bl", "br"].includes(t.wmPos) ? t.wmPos : "center";

            if (pos === "tile") {
                const step = Math.round(size * (isImg ? 1.6 : Math.max(3, txt.length * 0.9 + 1.5)));
                const inner = isImg
                    ? `<image href="${esc(wImg)}" x="${step / 2 - size / 2}" y="${step / 2 - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" transform="rotate(${ang} ${step / 2} ${step / 2})"/>`
                    : `<text x="${step / 2}" y="${step / 2}" font-size="${size}" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${step / 2} ${step / 2})" font-family="Microsoft JhengHei,sans-serif">${esc(txt)}</text>`;
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${step}" height="${step}">${inner}</svg>`;
                return `<div class="rp-wm" style="inset:0;opacity:${op};background-image:url(&quot;data:image/svg+xml;utf8,${encodeURIComponent(svg)}&quot;)"></div>`;
            }

            const place = { center: "left:0;right:0;top:45%;text-align:center", tl: "left:24px;top:24px", tr: "right:24px;top:24px", bl: "left:24px;bottom:24px", br: "right:24px;bottom:24px" }[pos];
            const inner = isImg
                ? `<img src="${esc(wImg)}" alt="" style="width:${size}px;height:auto">`
                : `<span style="font-size:${size}px;font-weight:700;color:${color}">${esc(txt)}</span>`;
            return `<div class="rp-wm" style="${place};opacity:${op};transform:rotate(${ang}deg)">${inner}</div>`;
        }

        // 每個區塊都可以微調：文字大小、上下間距、左右位移
        function deco(b, html) {
            const st = [];
            const fs = safeNum(b.fs, 0, 0, 200);
            if (fs) st.push(`font-size:${fs}px`);
            const mt = safeNum(b.mt, 0, -60, 300), mb = safeNum(b.mb, 0, -60, 300), dx = safeNum(b.dx, 0, -400, 400);
            if (mt) st.push(`margin-top:${mt}px`);
            if (mb) st.push(`margin-bottom:${mb}px`);
            if (dx) st.push(`position:relative;left:${dx}px`);
            return st.length && b.type !== "pagebreak" ? `<div style="${st.join(";")}">${html}</div>` : html;
        }

        function boxWrap(b, html) {
            const x = b.box;
            const st = x && BOX_STYLES[x.style] && x.style !== "none" ? x.style : "";
            if (!st || NO_BOX[b.type]) return html;
            const vars = [];
            if (x.custom) vars.push(`--bxbg:${safeColor(x.bg, "#fffaf2")}`, `--bxbd:${safeColor(x.bd, primary)}`);
            vars.push(`--bxp:${safeNum(x.pad, 14, 0, 60)}px`, `--bxr:${safeNum(x.radius, 12, 0, 40)}px`);
            const w = safeNum(x.width, 100, 30, 100);
            const align = ["center", "right"].includes(x.align) ? `text-align:${x.align};` : "";
            return `<div class="bx bx-${st}"${opt.forEditor ? ` data-block-id="${esc(b.id)}"` : ""} style="${vars.join(";")};${align}${w < 100 ? `width:${w}%;margin-left:auto;margin-right:auto;` : ""}">${html}</div>`;
        }

        const parts = (report.blocks || []).map(b => {

            boxed = !!(b.box && b.box.style && b.box.style !== "none" && !NO_BOX[b.type]);
            let html = "";

            switch (b.type) {

                case "cover":
                    html = `<section class="rp-cover"${attr(b)}>
${logoHtml("cover")}
${b.kicker ? `<div class="kicker">${esc(b.kicker)}</div>` : ""}
<h1>${esc(b.title || t.title || "")}</h1>
${b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ""}
${safeImgSrc(b.image) ? `<img class="cv" src="${esc(safeImgSrc(b.image))}" alt="" style="max-width:${safeNum(b.imgW, 70, 10, 100)}%;${Number(b.imgH) ? `height:${safeNum(b.imgH, 0, 20, 900)}px;max-height:none` : ""}">` : ""}
${b.customer ? `<div class="cust">${esc(b.customer)}</div>` : ""}
<div class="meta">${[m.reportNo && "編號 " + esc(m.reportNo), m.date && esc(m.date), m.author && esc(m.author), m.version && esc(m.version)].filter(Boolean).join("　|　")}</div>
</section>`;
                    break;

                case "banner": {
                    const h = safeNum(b.height, 0, 0, 600);
                    html = `<div class="rp-banner"${attr(b)}>${safeImgSrc(b.image) ? `<img src="${esc(safeImgSrc(b.image))}" alt="${esc(b.alt || "")}"${h ? ` style="height:${h}px"` : ""}>` : ""}</div>`;
                    break;
                }

                case "heading": {
                    const al = ["center", "right"].includes(b.align) ? ` style="text-align:${b.align}"` : "";
                    if (b.level === "h1") html = `<h1 class="rp-title"${attr(b)}${al}>${esc(b.text)}</h1>`;
                    else if (b.level === "h3") html = `<h3 class="rp-sec"${attr(b)}${al}>${esc(b.text)}</h3>`;
                    else {
                        chapter++;
                        html = `<h2 class="rp-h2"${attr(b)}${al}>${t.numbering ? `<span class="no">${String(chapter).padStart(2, "0")}</span>` : ""}${esc(b.text)}</h2>`;
                    }
                    break;
                }

                case "text":
                    html = `<div class="rp-text"${attr(b)}>${sanitizeRichHtml(b.html)}</div>`;
                    break;

                case "claim":
                    html = `<div class="rp-claim"${attr(b)}${["center", "right"].includes(b.align) ? ` style="text-align:${b.align}"` : ""}><div class="big">${esc(b.big)}</div>${b.sub ? `<div class="sub">${esc(b.sub)}</div>` : ""}</div>`;
                    break;

                case "tags":
                    html = `<div class="rp-tags"${attr(b)}>${String(b.text || "").split(/[\n,，、]/).map(s => s.trim()).filter(Boolean).map(s => `<span>${esc(s)}</span>`).join("")}</div>`;
                    break;

                case "bullets": {
                    const st = ["check", "arrow", "num"].includes(b.style) ? b.style : "disc";
                    const items = lines(b.items).map(s => `<li>${bold(s)}</li>`).join("");
                    html = `<div class="rp-bl"${attr(b)}>${b.title ? `<h3 class="rp-sec" style="margin-top:0">${esc(b.title)}</h3>` : ""}${st === "num" ? `<ol>${items}</ol>` : `<ul class="${st}">${items}</ul>`}</div>`;
                    break;
                }

                case "images": {
                    const w = safeNum(b.widthPct, 100, 20, 100);
                    const list = (b.images || []).filter(i => safeImgSrc(i.src));
                    const n = Math.max(1, list.length);
                    html = `<div class="rp-figs ${["center", "right"].includes(b.align) ? b.align : ""}"${attr(b)}>${list.map(i => {
                        fig++;
                        return `<figure class="rp-figure" style="width:calc(${w / n}% - 12px)">${Number(b.imgH) ? img(i.src, i.caption).replace("<img ", `<img style="height:${safeNum(b.imgH, 0, 20, 900)}px;object-fit:contain" `) : img(i.src, i.caption)}<figcaption>圖 ${fig}${i.caption ? "　" + esc(i.caption) : ""}</figcaption></figure>`;
                    }).join("")}</div>`;
                    break;
                }

                case "imageText":
                    html = `<div class="rp-it ${b.imageSide === "right" ? "rev" : ""}"${attr(b)}><div class="im" style="flex:0 0 ${safeNum(b.imgW, 42, 10, 90)}%">${img(b.image)}</div><div class="tx">${sanitizeRichHtml(b.html)}</div></div>`;
                    break;

                case "columns": {
                    const n = safeNum(b.cols, 2, 2, 3);
                    html = `<div class="rp-cols" style="grid-template-columns:repeat(${n},1fr)"${attr(b)}>${(b.items || []).slice(0, n).map(c => `<div>${sanitizeRichHtml(c.html)}</div>`).join("")}</div>`;
                    break;
                }

                case "table": {
                    const rows = (b.rows || []).map(r => (r || []).map(c => esc(c)));
                    html = b.mode === "grid"
                        ? `<table class="rp-table grid"${attr(b)}>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`
                        : `<table class="rp-table"${attr(b)}>${rows.map(r => `<tr><td class="k">${r[0] || ""}</td><td>${r[1] || ""}</td></tr>`).join("")}</table>`;
                    break;
                }

                case "callout": {
                    const v = CALLOUTS[b.variant] || CALLOUTS.note;
                    html = `<div class="rp-callout" style="--c:${v.color};--cb:${hexToRgba(v.color, .08)}"${attr(b)}><div class="t">${v.icon} ${esc(b.title || v.name)}</div>${sanitizeRichHtml(b.html)}</div>`;
                    break;
                }

                case "signature":
                    html = `<div class="rp-sign"${attr(b)}>${(b.roles || []).map(r => `<div>${esc(r)}</div>`).join("")}</div>`;
                    break;

                case "pagebreak":
                    html = `<div class="rp-pagebreak"${attr(b)}></div>`;
                    break;

                case "divider": {
                    const st = ["dashed", "dotted", "space"].includes(b.style) ? b.style : "";
                    html = `<hr class="rp-hr ${st}"${attr(b)} style="margin:${safeNum(b.gap, 16, 0, 80)}px 0">`;
                    break;
                }

                case "hero": {
                    const bg = safeImgSrc(b.image);
                    html = `<section class="mk-hero"${attr(b)} style="${bg ? `background-image:linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)),url(&quot;${esc(bg)}&quot;)` : ""}${Number(b.minH) ? `;min-height:${safeNum(b.minH, 0, 40, 900)}px` : ""}">
<h1>${esc(b.headline)}</h1>${b.sub ? `<p>${esc(b.sub)}</p>` : ""}
${b.ctaText ? btn({ text: b.ctaText, url: b.ctaUrl }, "mk-btn") : ""}</section>`;
                    break;
                }

                case "features": {
                    const n = safeNum(b.cols, 3, 1, 4);
                    const lay = ["inline", "plain"].includes(b.layout) ? b.layout : "stack";
                    html = `<div class="mk-grid" style="grid-template-columns:repeat(${n},1fr)"${attr(b)}>${(b.items || []).map(i => lay === "inline"
                        ? `<div class="mk-card inl"><div class="ic">${esc(i.icon)}</div><div class="bc"><strong>${esc(i.title)}</strong><br>${esc(i.text)}</div></div>`
                        : `<div class="mk-card ${lay === "plain" ? "plain" : ""}"><div class="ic">${esc(i.icon)}</div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join("")}</div>`;
                    break;
                }

                case "steps":
                    html = `<div class="rp-steps"${attr(b)}>${(b.items || []).map((i, k) => `<div class="rp-step">${i.icon ? `<div class="ic">${esc(i.icon)}</div>` : `<div class="n">${k + 1}</div>`}<strong>${esc(i.title)}</strong>${esc(i.text)}</div>`).join("")}</div>`;
                    break;

                case "products": {
                    const n = safeNum(b.cols, 3, 1, 4);
                    html = `<div class="mk-prods" style="grid-template-columns:repeat(${n},1fr)"${attr(b)}>${(b.items || []).map(i => {
                        const url = safeUrl(i.url);
                        const nm = esc(i.name);
                        return `<div class="mk-prod">${withRatio(img(i.image, i.name), b.ratio)}
${nm ? `<div class="pn">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${nm}</a>` : nm}</div>` : ""}${i.price ? `<div class="pp">${esc(i.price)}</div>` : ""}${i.text ? `<div class="pt">${esc(i.text)}</div>` : ""}</div>`;
                    }).join("")}</div>`;
                    break;
                }

                case "pricing":
                    html = `<div class="mk-plans"${attr(b)}>${(b.plans || []).map(p => `<div class="mk-plan ${p.highlight ? "hl" : ""}"><div class="pn">${esc(p.name)}</div><div class="pr">${esc(p.price)}</div><div>${esc(p.unit)}</div>
<ul>${lines(p.features).map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>`).join("")}</div>`;
                    break;

                case "buttons": {
                    const al = { center: "center", right: "flex-end" }[b.align] || "flex-start";
                    html = `<div class="rp-btns" style="justify-content:${al}"${attr(b)}>${(b.items || []).map(x => btn(x, "rp-btn " + (["ghost", "link"].includes(x.style) ? x.style : ""))).join("")}</div>`;
                    break;
                }

                case "cta":
                    html = `<div class="mk-cta"${attr(b)}><h2>${esc(b.title)}</h2><div>${esc(b.text)}</div>
${b.buttonText ? `<p>${btn({ text: b.buttonText, url: b.url }, "mk-btn")}</p>` : ""}
${safeImgSrc(b.qr) ? `<img src="${esc(safeImgSrc(b.qr))}" alt="QR Code" style="width:${safeNum(b.qrSize, 110, 40, 400)}px;height:${safeNum(b.qrSize, 110, 40, 400)}px">` : ""}</div>`;
                    break;

                case "gallery": {
                    const cols = safeNum(b.cols, 3, 2, 4);
                    html = `<div class="mk-gal" style="grid-template-columns:repeat(${cols},1fr)"${attr(b)}>${(b.images || []).map(i => withRatio(img(i.src, i.caption), b.ratio)).join("")}</div>`;
                    break;
                }

                case "testimonial":
                    html = `<div${attr(b)}>${(b.items || []).map(i => `<div class="mk-quote">「${esc(i.quote)}」<div class="who">— ${esc(i.name)}</div></div>`).join("")}</div>`;
                    break;

                case "footer":
                    html = `<div class="rp-ft"${attr(b)}>${sanitizeRichHtml(b.html)}</div>`;
                    break;

                default:
                    html = "";
            }

            return deco(b, boxWrap(b, html));
        });

        const gfont = font.google ? `<link href="https://fonts.googleapis.com/css2?family=${font.google}&display=swap" rel="stylesheet">` : "";
        const title = (report.blocks || []).find(b => b.type === "cover")?.title || t.title || "報告";

        const hasFoot = t.companyName || t.footerText || t.footerBless;
        const footer = hasFoot ? `<div class="rp-foot">${t.companyName ? `<div class="co">${esc(t.companyName)}${t.companySub ? "　" + esc(t.companySub) : ""}</div>` : ""}
${t.footerText ? `<div>${esc(t.footerText)}</div>` : ""}${t.footerBless ? `<div>${esc(t.footerBless)}</div>` : ""}</div>` : "";

        const css = buildCss({
            primary, dark, text, font, page, baseSize, forEditor: !!opt.forEditor, web,
            cardWidth: safeNum(t.cardWidth, 720, 320, 1200), cardRadius: safeNum(t.cardRadius, 12, 0, 40),
            pageBg: safeColor(t.pageBg, "#f4f6f8"), cardBg: safeColor(t.cardBg, "#ffffff")
        });

        return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${gfont}<style>${css}</style></head>
<body>${watermarkHtml()}<div class="rp-page"><div class="rp-content">${logoHtml("top")}${parts.join("")}${logoHtml("bottom")}${footer}</div></div></body></html>`;
    }

    return { THEMES, FONTS, PAGES, CALLOUTS, BOX_STYLES, esc, safeColor, safeImgSrc, safeUrl, sanitizeRichHtml, buildReportHtml };

})();
