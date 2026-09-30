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

    const safeImgSrc = s => /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s || "")) ? String(s) : "";

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
.rp-page{position:relative;max-width:${o.page.width}mm;margin:0 auto;background:#fff;padding:14mm 14mm 10mm;min-height:100vh}
.rp-watermark{position:fixed;left:0;right:0;top:45%;text-align:center;font-size:88px;font-weight:700;color:var(--d);opacity:.05;transform:rotate(-24deg);pointer-events:none;z-index:0;white-space:nowrap}
.rp-page>*{position:relative;z-index:1}
h1,h2,h3{color:var(--d);line-height:1.35}
.rp-cover{min-height:250mm;display:flex;flex-direction:column;justify-content:center;text-align:center;border-bottom:6px solid var(--p);break-after:page;page-break-after:always}
.rp-cover .kicker{color:var(--p);letter-spacing:.3em;font-weight:700}
.rp-cover h1{font-size:2.6em;margin:.3em 0}
.rp-cover .sub{font-size:1.2em;color:#555}
.rp-cover .cust{margin-top:1.5em;font-size:1.1em}
.rp-cover img.cv{max-width:70%;max-height:90mm;margin:1.5em auto;border-radius:10px;object-fit:contain}
.rp-cover .logo{max-height:22mm;margin:0 auto 1em}
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
.rp-foot{margin-top:2.5em;padding-top:10px;border-top:2px solid var(--p);text-align:center;font-size:.85em;color:#666;break-inside:avoid}
.rp-foot .co{font-weight:700;color:var(--d)}
${o.forEditor ? `[data-block-id]{cursor:pointer;outline-offset:3px}
[data-block-id]:hover{outline:2px dashed var(--p)}
[data-block-id].rp-active{outline:2px solid var(--p)}` : ""}
@media print{body{background:#fff}.rp-page{max-width:none;padding:0;min-height:0}.mk-hero{margin:0}}
@media (max-width:640px){.mk-grid{grid-template-columns:1fr}.rp-it{flex-direction:column!important}.rp-it .im{flex-basis:auto;width:100%}}`;
    }

    // ---------- 區塊 ----------
    function buildReportHtml(report, opt = {}) {

        const t = report.theme || {};
        const m = report.meta || {};
        const primary = safeColor(t.primary, "#b9805f");
        const dark = safeColor(t.dark, "#4d341c");
        const text = safeColor(t.textColor, "#2b2b2b");
        const font = FONTS[t.font] || FONTS.jhenghei;
        const page = PAGES[t.pageSize] || PAGES.a4;
        const baseSize = safeNum(t.baseSize, 14, 10, 22);
        const logo = safeImgSrc(t.logo);

        let chapter = 0, fig = 0;

        const attr = b => opt.forEditor ? ` data-block-id="${esc(b.id)}"` : "";

        const img = (src, alt) => { const s = safeImgSrc(src); return s ? `<img src="${s}" alt="${esc(alt || "")}">` : ""; };

        const parts = (report.blocks || []).map(b => {

            switch (b.type) {

                case "cover":
                    return `<section class="rp-cover"${attr(b)}>
${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
${b.kicker ? `<div class="kicker">${esc(b.kicker)}</div>` : ""}
<h1>${esc(b.title || t.title || "")}</h1>
${b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ""}
${safeImgSrc(b.image) ? `<img class="cv" src="${safeImgSrc(b.image)}" alt="">` : ""}
${b.customer ? `<div class="cust">${esc(b.customer)}</div>` : ""}
<div class="meta">${[m.reportNo && "編號 " + esc(m.reportNo), m.date && esc(m.date), m.author && esc(m.author), m.version && esc(m.version)].filter(Boolean).join("　|　")}</div>
</section>`;

                case "heading":
                    chapter++;
                    return `<h2 class="rp-h2"${attr(b)}>${t.numbering ? `<span class="no">${String(chapter).padStart(2, "0")}</span>` : ""}${esc(b.text)}</h2>`;

                case "text":
                    return `<div class="rp-text"${attr(b)}>${sanitizeRichHtml(b.html)}</div>`;

                case "images": {
                    const w = safeNum(b.widthPct, 100, 20, 100);
                    const list = (b.images || []).filter(i => safeImgSrc(i.src));
                    const n = Math.max(1, list.length);
                    return `<div class="rp-figs ${["center", "right"].includes(b.align) ? b.align : ""}"${attr(b)}>${list.map(i => {
                        fig++;
                        return `<figure class="rp-figure" style="width:calc(${w / n}% - 12px)">${img(i.src, i.caption)}<figcaption>圖 ${fig}${i.caption ? "　" + esc(i.caption) : ""}</figcaption></figure>`;
                    }).join("")}</div>`;
                }

                case "imageText":
                    return `<div class="rp-it ${b.imageSide === "right" ? "rev" : ""}"${attr(b)}><div class="im">${img(b.image)}</div><div class="tx">${sanitizeRichHtml(b.html)}</div></div>`;

                case "table": {
                    const rows = (b.rows || []).map(r => (r || []).map(c => esc(c)));
                    if (b.mode === "grid")
                        return `<table class="rp-table grid"${attr(b)}>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
                    return `<table class="rp-table"${attr(b)}>${rows.map(r => `<tr><td class="k">${r[0] || ""}</td><td>${r[1] || ""}</td></tr>`).join("")}</table>`;
                }

                case "callout": {
                    const v = CALLOUTS[b.variant] || CALLOUTS.note;
                    return `<div class="rp-callout" style="--c:${v.color};--cb:${hexToRgba(v.color, .08)}"${attr(b)}><div class="t">${v.icon} ${esc(b.title || v.name)}</div>${sanitizeRichHtml(b.html)}</div>`;
                }

                case "signature":
                    return `<div class="rp-sign"${attr(b)}>${(b.roles || []).map(r => `<div>${esc(r)}</div>`).join("")}</div>`;

                case "pagebreak":
                    return `<div class="rp-pagebreak"${attr(b)}></div>`;

                case "hero": {
                    const bg = safeImgSrc(b.image);
                    const url = safeUrl(b.ctaUrl);
                    return `<section class="mk-hero"${attr(b)} style="${bg ? `background-image:linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)),url(${bg})` : ""}">
<h1>${esc(b.headline)}</h1>${b.sub ? `<p>${esc(b.sub)}</p>` : ""}
${b.ctaText ? `<a class="mk-btn"${url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ""}>${esc(b.ctaText)}</a>` : ""}</section>`;
                }

                case "features":
                    return `<div class="mk-grid"${attr(b)}>${(b.items || []).map(i => `<div class="mk-card"><div class="ic">${esc(i.icon)}</div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join("")}</div>`;

                case "pricing":
                    return `<div class="mk-plans"${attr(b)}>${(b.plans || []).map(p => `<div class="mk-plan ${p.highlight ? "hl" : ""}"><div class="pn">${esc(p.name)}</div><div class="pr">${esc(p.price)}</div><div>${esc(p.unit)}</div>
<ul>${String(p.features || "").split("\n").map(s => s.trim()).filter(Boolean).map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>`).join("")}</div>`;

                case "cta": {
                    const url = safeUrl(b.url);
                    return `<div class="mk-cta"${attr(b)}><h2>${esc(b.title)}</h2><div>${esc(b.text)}</div>
${b.buttonText ? `<p><a class="mk-btn"${url ? ` href="${esc(url)}" target="_blank" rel="noopener noreferrer"` : ""}>${esc(b.buttonText)}</a></p>` : ""}
${safeImgSrc(b.qr) ? `<img src="${safeImgSrc(b.qr)}" alt="QR Code">` : ""}</div>`;
                }

                case "gallery": {
                    const cols = safeNum(b.cols, 3, 2, 4);
                    return `<div class="mk-gal" style="grid-template-columns:repeat(${cols},1fr)"${attr(b)}>${(b.images || []).map(i => img(i.src, i.caption)).join("")}</div>`;
                }

                case "testimonial":
                    return `<div${attr(b)}>${(b.items || []).map(i => `<div class="mk-quote">「${esc(i.quote)}」<div class="who">— ${esc(i.name)}</div></div>`).join("")}</div>`;

                default:
                    return "";
            }
        });

        const gfont = font.google ? `<link href="https://fonts.googleapis.com/css2?family=${font.google}&display=swap" rel="stylesheet">` : "";
        const title = (report.blocks || []).find(b => b.type === "cover")?.title || t.title || "報告";

        const footer = `<div class="rp-foot">${t.companyName ? `<div class="co">${esc(t.companyName)}${t.companySub ? "　" + esc(t.companySub) : ""}</div>` : ""}
${t.footerText ? `<div>${esc(t.footerText)}</div>` : ""}${t.footerBless ? `<div>${esc(t.footerBless)}</div>` : ""}</div>`;

        return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${gfont}<style>${buildCss({ primary, dark, text, font, page, baseSize, forEditor: !!opt.forEditor })}</style></head>
<body>${t.watermark && t.watermarkText ? `<div class="rp-watermark">${esc(t.watermarkText)}</div>` : ""}<div class="rp-page">${parts.join("")}${footer}</div></body></html>`;
    }

    return { THEMES, FONTS, PAGES, CALLOUTS, esc, safeColor, safeImgSrc, safeUrl, sanitizeRichHtml, buildReportHtml };

})();
