// قراءة ملف PDF في المتصفح: يُقرأ تخطيط كل صفحة (مواضع الكلمات، ومقاس الخط، وعرضه، ولونه، والخطوط المرسومة)
// فيُبنى منه نصٌّ منظَّم: فقرات وعناوين وأبيات وفواصل وحواشٍ مربوطة بإحالاتها. ثم يُكتب ملف Word مكافئاً
// يقرؤه قارئ Word في الموقع (docx-import) بكل ما يعرفه: المتن والشرح بألوانهما وعلاماتهما، والحواشي، والأبيات، والعناوين.
// يحتاج pdf.js (يُمرَّر في o.pdfjs) ومتصفحاً (لرسم الصفحة وأخذ ألوان النص والخطوط منها).
import { makeZip } from './zip.js';

const AR_LETTER = /[ء-يٱ-ۓۺ-ۿ]/;
const AR_ANY = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
const MARK = /^[\u064B-\u065F\u0670\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]+$/;
const DIGITS = '0-9٠-٩۰-۹';
const VERSE_SEP = /^(?:[✽✻✼❁❀✿❃❋✱✲✳✴✵✶✷✸✹✺⁂۞◆◇●○■□▪♦❖※⋆★☆❊❉✦✧]|\*{1,3})$/;
const LTRISH = new RegExp(`^[${DIGITS}A-Za-z.,/:%\\-–]+$`);
const NUMLIKE = new RegExp(`[${DIGITS}A-Za-z]`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};
const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);

/** أشكال الحروف العربية المتصلة (‎U+FE70…) إلى حروفها؛ وتبقى كلمات مثل «ﷺ» و«ﷲ» كما هي */
function normText(s) {
  return String(s || '')
    .replace(/[ﭐ-﷯ﹰ-﻿]/g, (c) => c.normalize('NFKC'))
    .replace(/[​-‏‪-‮⁦-⁩﻿­]/g, '')
    .replace(/ /g, ' ')
    // رسم «الله» حرفاً واحداً (ﷲ = «لله»، وقبله الألف إن كانت)
    .replace(/\uFDF2/g, 'لله');
}
/** التطويل بين حرفين (تمديد الضبط) يُحذف؛ ويبقى «ــ» وحده (علامة) */
const dropKashida = (s) => s.replace(/([\u0621-\u064A\u0671-\u06D3\u064B-\u065F\u0670])\u0640+(?=[\u0621-\u064A\u0671-\u06D3\u064B-\u065F\u0670])/g, '$1');
// الأقواس في السطر العربي تُرسم معكوسة (يختار المشكِّل شكلها المقابل)، فتُقرأ بالعكس
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«', '﴾': '﴿', '﴿': '﴾' };

/** فصل سطر عربي: العناصر مرتبة من اليمين، ثم تُعاد الأرقام واللاتيني إلى ترتيبها (يُكتب من اليسار) */
function joinRtl(items, mirror) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length) out.push(...run.reverse());
    run = [];
  };
  for (const it of items) {
    const t = it.t.trim();
    // الأرقام وما يتصل بها (١٢/٣، 2.5) تُكتب من اليسار داخل السطر العربي
    if (t && LTRISH.test(t) && NUMLIKE.test(t) && !it.multi) run.push(it);
    else if (run.length && t && /^[.,/:\-–]$/.test(t)) run.push(it);
    else {
      // فاصل بين رقمين («١٢ - ٣») لا ينهي الأرقام
      flush();
      out.push(it);
    }
  }
  flush();
  return out.map((it) => (mirror && !it.multi ? it.t.replace(/[()[\]{}<>«»﴾﴿]/g, (c) => MIRROR[c] || c) : it.t));
}

/**
 * ‎PDF ← Word مكافئ.
 * @param {Uint8Array} bytes
 * @param {object} o
 * @param {object} o.pdfjs                 مكتبة pdf.js (محمّلة)
 * @param {(n:number,total:number)=>void} [o.onProgress]
 * @param {number} [o.maxPages]
 * @returns {Promise<{docx:Uint8Array, info:object}>}
 */
export async function pdfToDocx(bytes, o) {
  const { pdfjs } = o;
  let pdf;
  try {
    // (نسخة: pdf.js ينقل ما يُعطى إلى عامله فيفرغ الأصل)
    pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: false }).promise;
  } catch (e) {
    throw new Error(/password/i.test(String(e && e.name)) ? 'الملف محمي بكلمة سر' : 'الملف ليس ملف PDF صالحاً');
  }
  const total = Math.min(pdf.numPages, o.maxPages || 3000);
  const pages = [];
  for (let n = 1; n <= total; n++) {
    pages.push(await readPage(pdf, n, pdfjs));
    if (o.onProgress) o.onProgress(n, total);
  }
  const meta = await pdf.getMetadata().catch(() => null);
  pdf.destroy();
  const textPages = pages.filter((p) => p.lines.length);
  if (!textPages.length || textPages.reduce((a, p) => a + p.chars, 0) < 40) {
    throw new Error('صفحات الملف صورٌ ممسوحة بلا نص مكتوب، فلا يمكن قراءتها. اختر ملفاً نصّه قابل للتحديد (يُنسخ منه النص).');
  }
  // الأقواس: أيكتب هذا الملف للقوس المعكوس رسماً حرفَ شكله أم حرفه المنطقي؟ (يُختار ما يجعل الأقواس أكثر استقامة)
  let open1 = 0, close1 = 0;
  for (const p of pages) {
    for (const L of p.lines) {
      if (!L.rtl) continue;
      const m = /[()]/.exec(L.text);
      if (m) m[0] === '(' ? open1++ : close1++;
    }
  }
  const mirror = close1 > open1;
  for (const p of pages) {
    for (const L of p.lines) {
      for (const sg of L.segs) {
        for (const r of sg.runs) {
          if (mirror && r.tm !== undefined) r.t = r.tm;
          delete r.tm;
        }
        sg.text = sg.runs.map((r) => r.t).join('');
      }
      L.text = L.segs.map((sg) => sg.text).join(' ');
    }
  }
  // خطوط بلا ترميزٍ لحروفها في أكثر الكتاب: لا يُستخرج منه نصّ
  const allLines = pages.flatMap((p) => p.lines);
  if (allLines.length > 20 && allLines.filter((L) => L.pic).length > allLines.length * 0.4) {
    throw new Error('خطوط هذا الملف لا تحمل ترميز حروفها (يظهر نصّها المنسوخ رموزاً)، فلا يمكن استخراج نصّه. صدِّره من برنامجه مرة أخرى بخطوطٍ مضمَّنة، أو اختر ملف Word.');
  }
  const doc = analyse(pages);
  const title = (meta && meta.info && meta.info.Title) || '';
  const docx = writeDocx(doc, { title });
  const out = { docx, info: { pages: total, ...doc.stats } };
  if (o.debug) out.geo = pages.map((p) => ({ left: p.left, right: p.right, rules: p.rules, lines: p.lines.map((L) => [Math.round(L.x0), Math.round(L.x1), Math.round(L.y * 10) / 10, L.fs, L.segs.map((s) => Math.round(s.gap)).join(','), L.garbled ? 'G' : '', L.text.slice(0, 40)]) }));
  if (o.debugLine) out.lineItems = pages.flatMap((p) => p.lines.filter((L) => L.text.includes(o.debugLine)).map((L) => L.items.map((it) => [it.t, Math.round(it.x0 * 10) / 10, Math.round(it.x1 * 10) / 10, Math.round(it.y * 10) / 10, it.fs, it.sup ? 'S' : ''])));
  if (o.debug) out.colors = pages.slice(0, 3).map((p) => p.lines.slice(0, 6).map((L) => [L.text.slice(0, 20), L.color, L.segs[0].runs.slice(0, 3).map((r) => r.c).join(',')]));
  if (o.debug) out.debug = doc.blocks.map((b) => ({ k: b.kind, p: b.page, head: b.head || 0, c: b.centered ? 1 : 0, st: b.style || '', n: b.lines ? b.lines.length : 0, br: b.pageBreakAt ?? -1, t: b.lines ? b.lines.map((L) => L.text).join(' / ').slice(0, 140) : '' }));
  return out;
}

/* ====================================================================== قراءة صفحة */
/** رسوم نص الصفحة حرفاً حرفاً (بمواضعها بوحدات الصفحة، والصادات إلى أسفل) */
async function pageGlyphs(page, vp, pdfjs) {
  // النص حرفاً حرفاً من أوامر رسم الصفحة نفسها: لكل رسمٍ نصُّه في الخط (بترتيبه الصحيح، ولو كان ربطاً لعدة حروف)
  // وموضعه ومقاسه ولونه. (أدقّ من نص pdf.js المجمَّع، الذي يعكس الحروف المربوطة ويخلط الألوان)
  const ops = await page.getOperatorList();
  const O = pdfjs.OPS;
  const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
  const fontCache = new Map();
  const fontInfo = (name) => {
    if (fontCache.has(name)) return fontCache.get(name);
    let f = null;
    try {
      f = page.commonObjs.get(name);
    } catch {}
    const nm = String((f && f.name) || '').replace(/^[A-Z]{6}\+/, '');
    const info = { name: nm, bold: !!(f && f.bold) || /bold|black|heavy|semibold|demi/i.test(nm), fm: (f && f.fontMatrix) || [0.001, 0, 0, 0.001, 0, 0], vertical: !!(f && f.vertical) };
    fontCache.set(name, info);
    return info;
  };
  let gs = { ctm: [1, 0, 0, 1, 0, 0], fill: '#000000' };
  const stack = [];
  let ts = { font: null, size: 12, tc: 0, tw: 0, th: 1, tl: 0, rise: 0, tm: [1, 0, 0, 1, 0, 0], tlm: [1, 0, 0, 1, 0, 0] };
  const raw = [];
  let chars = 0;
  const hexOf = (a) => {
    if (typeof a[0] === 'string') return a[0].replace('#', '').toUpperCase();
    if (a.length === 3) return a.map((v) => Math.round(v > 1 ? v : v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    return '000000';
  };
  const show = (arr) => {
    const f = ts.font ? fontInfo(ts.font) : { name: '', bold: false, fm: [0.001, 0, 0, 0.001, 0, 0] };
    for (const g of arr) {
      if (typeof g === 'number') {
        ts.tm = mul([1, 0, 0, 1, (-g / 1000) * ts.size * ts.th, 0], ts.tm);
        continue;
      }
      if (!g) continue;
      const trm = mul(mul([ts.size * ts.th, 0, 0, ts.size, 0, ts.rise], ts.tm), gs.ctm);
      const w = (g.width || 0) * f.fm[0];
      const adv = (w * ts.size + ts.tc + (g.isSpace || g.unicode === ' ' ? ts.tw : 0)) * ts.th;
      const u0 = normText(g.unicode || '');
      // رسمٌ بلا حرفٍ مقابل (خط زخرفي، أو ربط حركات): يُعدّ ولا يُكتب
      const ctl = !!u0 && /^[\u0000-\u001f\ufffd\ue000-\uf8ff]+$/.test(u0);
      const u = ctl ? '\u0000' : u0.replace(/[\u0000-\u001f\ufffd]/g, '');
      if (u) {
        const [x, y] = vp.convertToViewportPoint(trm[4], trm[5]);
        // نهاية الرسم: عرضه (بوحدة الخط) في مصفوفة الرسم نفسها
        const [x2] = vp.convertToViewportPoint(trm[0] * w + trm[4], trm[1] * w + trm[5]);
        const fs = Math.hypot(trm[2], trm[3]) * (vp.scale || 1);
        // نص مدوَّر (هوامش جانبية، علامات مائية) لا يُقرأ
        if (fs > 2 && Math.abs(trm[1]) < 0.2 * Math.abs(trm[0] || 1) && !f.vertical) {
          const t = ctl ? '' : u;
          raw.push({ t, ctl, seq: raw.length, x0: Math.min(x, x2), x1: Math.max(x, x2), y, fs, font: f.name, bold: f.bold, color: isGray(gs.fill) ? '' : gs.fill, multi: false, mark: !ctl && MARK.test(t.replace(/\s/g, '')) && t.trim() !== '' });
          if (!ctl) chars += t.trim().length;
        }
      }
      ts.tm = mul([1, 0, 0, 1, adv, 0], ts.tm);
    }
  };
  const A = ops.argsArray;
  // «ActualText»: نصُّ ما بين علامتين (يكتبه LibreOffice وغيره لرسومٍ لا يدلّ رسمها على حروفها: حرفٌ بحركته، تطويل…)
  const marked = [];
  const endActual = (m) => {
    const got = raw.splice(m.from);
    const vis = got.filter((g) => !g.mark || true);
    if (!vis.length) return;
    const t = normText(m.text).replace(/[\u0000-\u001f]/g, '');
    if (!t) {
      // نصٌّ فارغ: زخرفة بلا حروف (تطويل…) تُترك
      return;
    }
    const b = vis.reduce((a, g) => (g.fs >= a.fs ? g : a), vis[0]);
    raw.push({ ...b, t, ctl: false, seq: vis[0].seq, multi: [...t].length > 1, mark: MARK.test(t.replace(/\s/g, '')), x0: Math.min(...vis.map((g) => g.x0)), x1: Math.max(...vis.map((g) => g.x1)) });
    chars += t.trim().length;
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = A[i] || [];
    switch (fn) {
      case O.save: stack.push({ gs: { ...gs }, ts: { ...ts } }); break;
      case O.restore: { const st = stack.pop(); if (st) { gs = st.gs; ts = { ...ts, font: st.ts.font, size: st.ts.size, tc: st.ts.tc, tw: st.ts.tw, th: st.ts.th, tl: st.ts.tl, rise: st.ts.rise }; } break; }
      case O.transform: gs.ctm = mul([a[0], a[1], a[2], a[3], a[4], a[5]], gs.ctm); break;
      case O.paintFormXObjectBegin: stack.push({ gs: { ...gs }, ts: { ...ts } }); if (a[0]) gs.ctm = mul(Array.from(a[0]), gs.ctm); break;
      case O.paintFormXObjectEnd: { const st = stack.pop(); if (st) gs = st.gs; break; }
      case O.setFillRGBColor: gs.fill = hexOf(a); break;
      case O.setFillGray: gs.fill = '000000'; break;
      case O.setFillCMYKColor: { const [c, m, y, k] = a.map((v) => (v > 1 ? v / 255 : v)); gs.fill = [1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); break; }
      case O.beginText: ts.tm = [1, 0, 0, 1, 0, 0]; ts.tlm = [1, 0, 0, 1, 0, 0]; break;
      case O.setFont: ts.font = a[0]; ts.size = a[1]; break;
      case O.setCharSpacing: ts.tc = a[0]; break;
      case O.setWordSpacing: ts.tw = a[0]; break;
      case O.setHScale: ts.th = a[0] / 100; break;
      case O.setLeading: ts.tl = a[0]; break;
      case O.setTextRise: ts.rise = a[0]; break;
      case O.setTextMatrix: ts.tm = Array.from(a[0] && a[0].length ? a[0] : a).slice(0, 6); ts.tlm = [...ts.tm]; break;
      case O.moveText: ts.tlm = mul([1, 0, 0, 1, a[0], a[1]], ts.tlm); ts.tm = [...ts.tlm]; break;
      case O.setLeadingMoveText: ts.tl = -a[1]; ts.tlm = mul([1, 0, 0, 1, a[0], a[1]], ts.tlm); ts.tm = [...ts.tlm]; break;
      case O.nextLine: ts.tlm = mul([1, 0, 0, 1, 0, -ts.tl], ts.tlm); ts.tm = [...ts.tlm]; break;
      case O.showText: case O.showSpacedText: show(a[0] || []); break;
      case O.beginMarkedContent: marked.push(null); break;
      case O.beginMarkedContentProps: marked.push(typeof a[2] === 'string' ? { text: a[2], from: raw.length } : null); break;
      case O.endMarkedContent: { const m = marked.pop(); if (m) endActual(m); break; }
      case O.nextLineShowText: ts.tlm = mul([1, 0, 0, 1, 0, -ts.tl], ts.tlm); ts.tm = [...ts.tlm]; show(a[0] || []); break;
      case O.nextLineSetSpacingShowText: ts.tw = a[0]; ts.tc = a[1]; ts.tlm = mul([1, 0, 0, 1, 0, -ts.tl], ts.tlm); ts.tm = [...ts.tlm]; show(a[2] || []); break;
      default: break;
    }
  }
  return { raw, chars };
}

async function readPage(pdf, n, pdfjs) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const W = vp.width, H = vp.height;
  const { raw, chars } = await pageGlyphs(page, vp, pdfjs);
  // رسم الصفحة: منه الخطوط المرسومة (فواصل، وخط الحواشي)، وصور الصفحات
  const S = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * S);
  cv.height = Math.ceil(H * S);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  try {
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: S }) }).promise;
  } catch {}
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const rules = findRules(img, S, W, H);
  const lines = buildLines(raw);
  for (const L of lines) L.page = n;
  // أسطرٌ لا تُقرأ حروفها (خطٌّ زخرفي بلا ترميز): تُؤخذ صورةً كما رُسمت، والمتجاورة منها صورةٌ واحدة
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].garbled) continue;
    const grp = [lines[i]];
    while (i + 1 < lines.length && lines[i + 1].garbled && lines[i + 1].y - grp[grp.length - 1].y < grp[grp.length - 1].fs * 2.2) grp.push(lines[++i]);
    const fsM = Math.max(...grp.map((L) => L.fs));
    const box = {
      x0: Math.max(0, Math.min(...grp.map((L) => L.x0)) - fsM * 0.3),
      x1: Math.min(W, Math.max(...grp.map((L) => L.x1)) + fsM * 0.3),
      y0: Math.max(0, Math.min(...grp.map((L) => Math.min(L.y, ...(L.allY || [])) - L.fs * 1.05))),
      y1: Math.min(H, Math.max(...grp.map((L) => Math.max(L.y, ...(L.allY || [])) + L.fs * 0.5))),
    };
    grp[0].pic = cropPic(cv, S, box);
    grp[0].top = box.y0;
    grp[0].bottom = box.y1;
    grp[0].x0 = box.x0;
    grp[0].x1 = box.x1;
    for (const L of grp.slice(1)) L.skip = true;
  }
  const ink = inkRatio(img);
  let pic = null;
  // صفحة صورة (غلاف، لوحة): نصٌّ قليل وحبرٌ كثير
  if (chars < 25 && ink > 0.04) pic = { src: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height };
  page.cleanup();
  return { n, W, H, lines: lines.filter((L) => !L.skip), rules, chars, pic };
}

/** جزءٌ من رسم الصفحة صورةً (بوحدات الصفحة) */
function cropPic(cv, S, b) {
  const w = Math.max(1, Math.round((b.x1 - b.x0) * S)), h = Math.max(1, Math.round((b.y1 - b.y0) * S));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(cv, Math.round(b.x0 * S), Math.round(b.y0 * S), w, h, 0, 0, w, h);
  return { src: c.toDataURL('image/png'), w: b.x1 - b.x0, h: b.y1 - b.y0, png: true };
}

/** أسود أو رمادي أو أبيض: لا لون */
function isGray(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return true;
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(...v) - Math.min(...v) < 38;
}

function inkRatio(img) {
  const d = img.data;
  let ink = 0, all = 0;
  for (let i = 0; i < d.length; i += 4 * 16) {
    all++;
    if (d[i] + d[i + 1] + d[i + 2] < 600) ink++;
  }
  return ink / Math.max(1, all);
}

/** لون الحبر في مربع (بوحدات الصفحة): متوسط البكسلات القاتمة، ولا لون للأسود والرمادي */
function colorAt(img, S, x0, y0, x1, y1) {
  const W = img.width, H = img.height, d = img.data;
  const a = Math.max(0, Math.floor(x0 * S)), b = Math.min(W - 1, Math.ceil(x1 * S));
  const c = Math.max(0, Math.floor(y0 * S)), e = Math.min(H - 1, Math.ceil(y1 * S));
  let r = 0, g = 0, bl = 0, n = 0;
  const step = b - a > 60 ? 2 : 1;
  for (let y = c; y <= e; y += step) {
    for (let x = a; x <= b; x += step) {
      const i = (y * W + x) * 4;
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      if (lum > 150) continue;
      r += R;
      g += G;
      bl += B;
      n++;
    }
  }
  if (n < 3) return '';
  r /= n;
  g /= n;
  bl /= n;
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
  if (mx - mn < 38) return '';
  return [r, g, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** الخطوط الأفقية المرسومة: صفوف قليلة السُّمك فيها امتدادٌ متصل طويل، وما فوقها وتحتها فارغ */
function findRules(img, S, W, H) {
  const w = img.width, h = img.height, d = img.data;
  const dark = (x, y) => {
    const i = (y * w + x) * 4;
    return d[i] + d[i + 1] + d[i + 2] < 560;
  };
  const minRun = Math.max(24, w * 0.06);
  const cand = [];
  for (let y = 0; y < h; y++) {
    let best = 0, bx0 = 0, run = 0, x0 = 0;
    for (let x = 0; x < w; x++) {
      if (dark(x, y)) {
        if (!run) x0 = x;
        run++;
        if (run > best) {
          best = run;
          bx0 = x0;
        }
      } else run = 0;
    }
    if (best >= minRun) cand.push({ y, x0: bx0, x1: bx0 + best });
  }
  // صفوف متتالية متداخلة = خطٌّ واحد بسُمكه
  const rules = [];
  for (const c of cand) {
    const last = rules[rules.length - 1];
    if (last && c.y - last.y1 <= 1 && Math.min(c.x1, last.x1) - Math.max(c.x0, last.x0) > (c.x1 - c.x0) * 0.6) {
      last.y1 = c.y;
      last.x0 = Math.min(last.x0, c.x0);
      last.x1 = Math.max(last.x1, c.x1);
    } else rules.push({ y0: c.y, y1: c.y, x0: c.x0, x1: c.x1 });
  }
  const out = [];
  for (const r of rules) {
    const thick = r.y1 - r.y0 + 1;
    if (thick > 4 * S) continue; // كتلة، لا خط
    // ما فوق الخط وتحته (بضعة بكسلات) فارغٌ في امتداده: ليس قاعدة سطر مكتوب
    const pad = Math.round(3 * S);
    let busy = 0, tot = 0;
    for (const yy of [r.y0 - pad, r.y0 - pad + 1, r.y1 + pad, r.y1 + pad - 1]) {
      if (yy < 0 || yy >= h) continue;
      for (let x = r.x0; x < r.x1; x += 2) {
        tot++;
        if (dark(x, yy)) busy++;
      }
    }
    if (tot && busy / tot > 0.08) continue;
    out.push({ y: (r.y0 + r.y1) / 2 / S, x0: r.x0 / S, x1: r.x1 / S, thick: thick / S });
  }
  return out;
}

/** أسطر الصفحة من عناصرها: بحسب خط القاعدة، والأرقام الصغيرة المرتفعة (إحالات) تتبع سطرها */
function buildLines(raw) {
  const main = raw.filter((r) => !r.mark).sort((a, b) => a.y - b.y);
  // ١) تجميع بخط القاعدة وحده (الرسوم في السطر الواحد قد تختلف قاعدتها قليلاً)
  const groups = [];
  for (const r of main) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(r.y - g.y) < 0.36 * Math.max(r.fs, g.fs)) {
      g.items.push(r);
      // القاعدة: قاعدة الرسوم الكبيرة (لا الصغيرة المرتفعة)
      if (r.fs >= g.fs * 0.9) g.y = (g.y * g.n + r.y) / ++g.n;
      g.fs = Math.max(g.fs, r.fs);
    } else groups.push({ y: r.y, fs: r.fs, n: 1, items: [r] });
  }
  // ٢) أرقامٌ صغيرة مرتفعة صارت سطراً وحدها («(٢)» فوق كلمة): تعود إلى سطرها إحالةً
  const REFISH = /^[\s()[\]0-9٠-٩۰-۹]+$/;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const txt = g.items.map((x) => x.t).join('');
    if (!REFISH.test(txt) || !/[0-9٠-٩۰-۹]/.test(txt)) continue;
    const below = groups[i + 1];
    if (below && g.fs < below.fs * 0.88 && below.y - g.y < below.fs * 1.1 && below.y > g.y) {
      for (const x of g.items) x.sup = true;
      below.items.push(...g.items);
      groups.splice(i--, 1);
    }
  }
  // سطران متراكبان (بينهما أقل من نصف سطر، ويغطي أحدهما الآخر): كتابةٌ زخرفية مركّبة (بسملة…) تؤخذ صورة
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i], b = groups[i + 1];
    if (b.y - g.y >= Math.min(g.fs, b.fs) * 0.6) continue;
    const ext = (q) => [Math.min(...q.items.map((x) => x.x0)), Math.max(...q.items.map((x) => x.x1))];
    const [a0, a1] = ext(g), [b0, b1] = ext(b);
    const ov = Math.min(a1, b1) - Math.max(a0, b0);
    if (ov > Math.min(a1 - a0, b1 - b0) * 0.5) {
      g.items.push(...b.items);
      g.fs = Math.max(g.fs, b.fs);
      g.stacked = true;
      groups.splice(i + 1, 1);
      i--;
    }
  }
  // رسمٌ أو رسمان وحدهما فوق سطرٍ بالخط نفسه (حرفٌ مرتفع في خطٍّ زخرفي): من ذلك السطر
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i], below = groups[i + 1];
    const vis = g.items.filter((x) => x.t.trim() || x.ctl);
    if (vis.length > 2 || !vis.length) continue;
    if (below.y - g.y < below.fs * 1.2 && vis.every((x) => below.items.some((b) => b.font === x.font)) && Math.abs(vis[0].fs - below.fs) < below.fs * 0.15) {
      below.items.push(...g.items);
      groups.splice(i--, 1);
    }
  }
  const lines = groups.map((g) => ({ stacked: !!g.stacked, y: g.y, fs: g.fs, items: g.items, minX: Math.min(...g.items.map((x) => x.x0)), maxX: Math.max(...g.items.map((x) => x.x1)) }));
  // الحركات (رسوم بلا عرض) تُلحق بالحرف الذي تقع عليه
  for (const m of raw.filter((r) => r.mark)) {
    const L = lines.find((L) => Math.abs(m.y - L.y) < L.fs * 0.7);
    if (!L) continue;
    const base = L.items.filter((it) => !it.sup && !it.ctl && it.t.trim() && m.x0 >= it.x0 - 0.8 && m.x0 <= it.x1 + 0.8).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - m.x0) - Math.abs((b.x0 + b.x1) / 2 - m.x0))[0];
    if (base) base.t = base.t.replace(/\s+$/, '') + m.t.trim();
  }
  // اتجاه الصفحة الغالب (لما اجتمعت فيه العربية واللاتينية)
  const arN = raw.reduce((a, r) => a + (CL_R.test(r.t) ? 1 : 0), 0);
  const laN = raw.reduce((a, r) => a + (CL_L.test(r.t) ? 1 : 0), 0);
  for (const L of lines) {
    L.pageRtl = arN >= laN * 0.25;
    finishLine(L);
  }
  return lines.filter((L) => L.text.trim() || L.garbled).sort((a, b) => a.y - b.y);
}

function finishLine(L) {
  L.allY = L.items.map((it) => it.y);
  const ctlItems = L.items.filter((it) => it.ctl);
  L.items = L.items.filter((it) => !it.ctl);
  L.ctl = ctlItems.length;
  if (!L.items.length) {
    // كله رسومٌ بلا حروف
    L.segs = [];
    L.text = '';
    L.garbled = true;
    L.x0 = Math.min(...ctlItems.map((i) => i.x0));
    L.x1 = Math.max(...ctlItems.map((i) => i.x1), L.x0 + L.fs);
    L.top = L.y - L.fs * 0.8;
    L.bottom = L.y + L.fs * 0.3;
    L.boldShare = 0;
    L.color = '';
    L.rtl = true;
    return;
  }
  // المقاس الغالب في السطر (بعدد الأحرف)
  const sizes = new Map();
  for (const it of L.items) if (!it.sup) sizes.set(Math.round(it.fs * 2) / 2, (sizes.get(Math.round(it.fs * 2) / 2) || 0) + it.t.trim().length);
  L.fs = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || L.fs;
  // الإحالات: أرقام أصغر مرتفعة
  for (const it of L.items) if (!it.sup && it.fs < L.fs * 0.86 && it.y < L.y - L.fs * 0.12 && /^[\s()[\]0-9٠-٩۰-۹]+$/.test(it.t)) it.sup = true;
  // اتجاه السطر من حروفه (لا من النقاط والأرقام: سطر الفهرس «باب كذا . . . . ٨» عربي)
  // واتجاه السطر: بلا عربية لاتيني، وبلا لاتينية عربي؛ وإن اجتمعا فبالحرف في طرفيه (سطرٌ أوله وآخره لاتيني لاتيني)،
  // وإلا فاتجاه الصفحة الغالب
  const strong = L.items.filter((it) => !it.sup && (CL_R.test(it.t) || CL_L.test(it.t))).sort((a, b) => a.x0 - b.x0);
  const isR = (it) => CL_R.test(it.t);
  const hasR = strong.some(isR), hasL = strong.some((it) => !isR(it));
  if (!hasR) L.rtl = !hasL && L.pageRtl !== false;
  else if (!hasL) L.rtl = true;
  else {
    const a = isR(strong[0]), b = isR(strong[strong.length - 1]);
    L.rtl = a && b ? true : !a && !b ? false : L.pageRtl !== false;
  }
  // الترتيب بمنتصف الرسم (الرسوم المتراكبة في الخط الزخرفي: منتصفها أصدق من طرفها)، ثم بترتيبها في الملف
  const mid = (it) => (it.x0 + it.x1) / 2;
  let items = [...L.items].sort((a, b) => {
    const d = L.rtl ? mid(b) - mid(a) : mid(a) - mid(b);
    if (Math.abs(d) > 0.3) return d;
    return L.rtl ? (b.seq ?? 0) - (a.seq ?? 0) : (a.seq ?? 0) - (b.seq ?? 0);
  });
  // حرفٌ لاتيني منفرد ملتصق بحرفين عربيين من جانبيه: رسمُ تطويلٍ أو وصلٍ أخطأ البرنامج ترميزه («سBBمعت»)
  if (L.rtl) {
    const lat = (it) => /^[A-Za-z]$/.test(it.t) && !it.sup;
    const near = (a, b) => Math.abs(a.x0 - b.x1) < L.fs * 0.15 || (a.x0 < b.x1 && a.x1 > b.x0);
    const drop = new Set();
    for (let i = 0; i < items.length; i++) {
      if (!lat(items[i])) continue;
      let j = i;
      while (j + 1 < items.length && lat(items[j + 1])) j++;
      const before = items[i - 1], after = items[j + 1];
      if (before && after && AR_LETTER.test(before.t) && AR_LETTER.test(after.t) && near(before, items[i]) && near(items[j], after)) {
        for (let k = i; k <= j; k++) drop.add(items[k]);
        after.glue = true;
      }
      i = j;
    }
    if (drop.size) items = items.filter((it) => !drop.has(it));
  }
  // رمزٌ زخرفي وحده في وسط السطر بين كلامين («… ✽ …»): فاصل شطرين، يُقطع عنده السطر
  if (items.length > 6) {
    const lx0 = Math.min(...items.map((i) => i.x0)), lx1 = Math.max(...items.map((i) => i.x1));
    const k = items.findIndex((it, i) => i > 0 && i < items.length - 1 && VERSE_SEP.test(it.t.trim()) && Math.abs((it.x0 + it.x1) / 2 - (lx0 + lx1) / 2) < (lx1 - lx0) * 0.15);
    if (k > 0) {
      items = items.filter((_, i) => i !== k);
      items[k].forceSeg = true;
    }
  }
  // مقاطع السطر: كلامٌ متصل، وبين مقطعين فراغ كبير (شطرا بيت، أو كلمات متباعدة)
  L.segs = [];
  let prev = null;
  let cur = null;
  const big = Math.max(L.fs * 1.1, 9);
  for (const it of items) {
    const gap = prev ? (L.rtl ? prev.x0 - it.x1 : it.x0 - prev.x1) : 0;
    if (!cur || gap > big || it.forceSeg) {
      cur = { items: [], gap: prev ? gap : 0 };
      L.segs.push(cur);
    } else if (prev && !it.glue && gap > L.fs * 0.16 && !/\s$/.test(prev.t) && !/^\s/.test(it.t)) cur.items.push({ t: ' ', x0: it.x1, x1: it.x1, space: true, bold: it.bold, color: it.color, font: it.font, fs: it.fs });
    cur.items.push(it);
    prev = it;
  }
  for (const sg of L.segs) {
    // نص المقطع: يبقى لكل عنصر خصائصه (عريض، لون، خط، إحالة)
    const ordered = bidiOrder(sg.items, L.rtl);
    // الأجزاء المتجاورة بخصائص واحدة تُجمع؛ والإحالة المرتفعة («(» «٢» «)» رسومٌ منفصلة) رقمٌ واحد
    const runs = [];
    for (const it of ordered) {
      const last = runs[runs.length - 1];
      if (it.sup) {
        const d = toLatin(it.t.replace(/[^0-9٠-٩۰-۹]/g, ''));
        if (last && last.sup !== '' && last.supOpen) last.sup += d;
        else runs.push({ t: '', sup: d, supOpen: true, b: false, c: '', f: '', fs: it.fs });
        continue;
      }
      if (last) last.supOpen = false;
      if (last && !last.sup && last.b === !!it.bold && last.c === (it.color || '') && last.f === (it.font || '') && Math.abs(last.fs - it.fs) < 0.3) {
        last.t += it.t;
        last.tm += it.tm ?? it.t;
      } else runs.push({ t: it.t, tm: it.tm ?? it.t, sup: '', b: !!it.bold, c: it.color || '', f: it.font || '', fs: it.fs });
    }
    sg.runs = runs.filter((r) => r.t || r.sup);
    sg.text = sg.runs.map((r) => r.t).join('');
    sg.x0 = Math.min(...sg.items.map((i) => i.x0));
    sg.x1 = Math.max(...sg.items.map((i) => i.x1));
  }
  // بيت: فراغٌ واحدٌ كبير في وسط السطر بين شطرين متقاربين طولاً (وما في الشطر من فراغات تمديدٍ أصغر منه بكثير)
  L.verse = false;
  if (L.segs.length >= 2) {
    const gs = L.segs.slice(1).map((sg, i) => ({ i: i + 1, g: sg.gap })).sort((a, b) => b.g - a.g);
    const k = gs[0].i;
    const A = L.segs.slice(0, k), B = L.segs.slice(k);
    const lo = (ss) => Math.min(...ss.map((x) => x.x0)), hi = (ss) => Math.max(...ss.map((x) => x.x1));
    const wA = hi(A) - lo(A), wB = hi(B) - lo(B);
    const words = (ss) => ss.map((x) => x.text).join(' ').split(/\s+/).filter((w) => AR_LETTER.test(w)).length;
    const lx0 = lo(L.segs), lx1 = hi(L.segs);
    const gapMid = L.rtl ? (lo(A) + hi(B)) / 2 : (hi(A) + lo(B)) / 2;
    if (
      words(A) >= 2 && words(B) >= 2 &&
      Math.min(wA, wB) / Math.max(wA, wB) > 0.4 &&
      Math.abs(gapMid - (lx0 + lx1) / 2) < (lx1 - lx0) * 0.15 &&
      (!gs[1] || gs[0].g >= gs[1].g * 1.6)
    ) {
      const merge = (ss, gap) => {
        const runs = [];
        ss.forEach((x, i) => {
          if (i) runs.push({ ...x.runs[0], t: ' ', tm: ' ', sup: '' });
          runs.push(...x.runs);
        });
        return { items: ss.flatMap((x) => x.items), gap, runs, text: ss.map((x) => x.text).join(' '), x0: lo(ss), x1: hi(ss) };
      };
      L.segs = [merge(A, 0), merge(B, gs[0].g)];
      L.verse = true;
    }
  }
  L.text = L.segs.map((s) => s.text).join(' ');
  // سطرٌ لا يُقرأ (خط زخرفي بلا نصٍّ مقابل لرسومه): حروف متفرقة ومسافات كثيرة
  const toks = L.text.trim().split(/\s+/).filter(Boolean);
  const singles = toks.filter((t) => [...t].length === 1 && AR_LETTER.test(t)).length;
  const letters = L.text.replace(/[\s.]/g, '').length;
  // خطٌّ زخرفي يرفع الحروف ويخفضها عن السطر: يُؤخذ صورةً كما هو
  const offBase = L.items.filter((it) => it.t.trim() && !it.sup && Math.abs(it.y - L.y) > L.fs * 0.16).length;
  L.calli = offBase > Math.max(2, L.items.length * 0.15);
  L.garbled = L.ctl > Math.max(1, (letters + L.ctl) * 0.12) || (toks.length >= 3 && singles / toks.length > 0.45) || L.stacked;
  L.x0 = Math.min(...L.segs.map((s) => s.x0));
  L.x1 = Math.max(...L.segs.map((s) => s.x1));
  const fsMax = Math.max(...L.items.map((i) => i.fs));
  L.top = L.y - fsMax * 0.8;
  L.bottom = L.y + L.fs * 0.3;
  const chars = L.text.replace(/\s/g, '').length || 1;
  L.boldShare = L.segs.flatMap((s) => s.runs).reduce((a, r) => a + (r.b ? r.t.replace(/\s/g, '').length : 0), 0) / chars;
  const cols = new Map();
  for (const r of L.segs.flatMap((s) => s.runs)) if (r.c) cols.set(r.c, (cols.get(r.c) || 0) + r.t.replace(/\s/g, '').length);
  L.color = [...cols].find(([, n]) => n >= chars * 0.6)?.[0] || '';
}
/**
 * من ترتيب الرسم (البصري) إلى ترتيب القراءة: مختصر خوارزمية الاتجاه الثنائي (Unicode Bidi).
 * السطر العربي: العناصر مرتبة من اليمين، ثم تُعكس داخله كل قطعة تُكتب من اليسار: كلامٌ لاتيني أو روسي أو يوناني
 * (بما بينه من مسافات وعلامات وأرقام تتبعه)، والأعداد («2020»، «12/05/2020»، «2020-2021»، «١٤٤٤»).
 * والسطر اللاتيني بالعكس: مرتب من اليسار، وتُعكس فيه القطع العربية.
 * والإحالات المرتفعة أرقامٌ أيضاً («(12)» لا «(21)»).
 */
const CL_L = /[A-Za-zÀ-ɏͰ-ϿЀ-ԯḀ-῿԰-֏Ⴀ-ჿ]/;
const CL_R = /[֐-׿؀-ٟٮ-ەۥۦۮۯۺ-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const CL_N = new RegExp(`^[${DIGITS}]+$`);
function bidiClass(it) {
  const t = it.t;
  if (it.space || !t.trim()) return 'WS';
  if (it.sup) return /[0-9٠-٩۰-۹]/.test(t) ? 'SUP' : 'ON';
  if (CL_R.test(t)) return 'R';
  if (CL_L.test(t)) return 'L';
  if (CL_N.test(t.trim())) return 'EN';
  if (/^[.,/:٫٬]$/.test(t.trim())) return 'CS';
  if (/^[-+–]$/.test(t.trim())) return 'ES';
  if (/^[%#$°٪€£]$/.test(t.trim())) return 'ET';
  return 'ON';
}
function bidiOrder(items, rtl) {
  const n = items.length;
  const cls = items.map(bidiClass);
  // الأعداد بجوار كلامٍ لاتيني (ولو بينهما مسافة أو علامة) منه: «London 1999»، «ISBN 978-…»
  const strongNear = (i, step) => {
    for (let k = i + step; k >= 0 && k < n; k += step) {
      if (cls[k] === 'L' || cls[k] === 'R') return cls[k];
      if (cls[k] === 'SUP') return null;
    }
    return null;
  };
  const kind = cls.map((c, i) => (c === 'EN' && (strongNear(i, 1) === 'L' || strongNear(i, -1) === 'L') && rtl ? 'L' : c));
  // فاصلٌ واحد بين عددين من العدد: «12/05»، «3.14». أما «-» فيصل العددين في السياق اللاتيني فقط؛
  // وبعد كلامٍ عربي هما عددان يُرسمان من اليمين («2020-2021» يُرى «2021-2020»)، كما يفعل المتصفح وWord
  for (let i = 1; i < n - 1; i++) {
    if (kind[i - 1] !== 'EN' || kind[i + 1] !== 'EN') continue;
    if (kind[i] === 'CS' || (kind[i] === 'ES' && (!rtl || strongNear(i + 1, -1) !== 'R'))) kind[i] = 'EN';
  }
  // علامة النسبة والعملة بجوار عدد منه
  for (let i = 0; i < n; i++) if (kind[i] === 'ET' && (kind[i - 1] === 'EN' || kind[i + 1] === 'EN')) kind[i] = 'EN';
  const out = [];
  const flip = (want) => {
    // want: صنف القطع التي تُعكس (L في السطر العربي، R في اللاتيني)؛ وما بينها من محايد يتبعها إن أحاط بها صنفها
    let i = 0;
    while (i < n) {
      const k = kind[i];
      const run = k === want || (rtl && (k === 'EN' || k === 'SUP'));
      if (!run) {
        out.push(items[i++]);
        continue;
      }
      const base = k === want ? want : k; // L / EN / SUP / R
      let j = i;
      for (;;) {
        let e = j + 1;
        if (e < n && kind[e] === base) {
          j = e;
          continue;
        }
        // محايدات بين قطعتين من الصنف نفسه (للكلام اللاتيني والعربي فقط، لا للأعداد: «12 15» عددان)
        if (base === want) {
          while (e < n && (kind[e] === 'WS' || kind[e] === 'ON' || kind[e] === 'CS' || kind[e] === 'ES' || kind[e] === 'ET' || (base === 'L' && kind[e] === 'EN'))) e++;
          if (e < n && e > j + 1 && kind[e] === base) {
            j = e;
            continue;
          }
        }
        break;
      }
      out.push(...items.slice(i, j + 1).reverse().map((it) => ({ ...it, ltrRun: rtl })));
      i = j + 1;
    }
  };
  flip(rtl ? 'L' : 'R');
  if (!rtl) return out;
  // (القوس معكوساً يُحفظ بجانبه في الكلام العربي: بعض البرامج تكتب للقوس المرسوم معكوساً حرفه المنطقي، وبعضها حرف شكله؛ ويُختار للملف كله)
  return out.map((it) => (it.multi || it.space || it.sup || it.ltrRun ? it : { ...it, tm: it.t.replace(/[()[\]{}<>«»﴾﴿]/g, (c) => MIRROR[c] || c) }));
}

/** أجزاء سطرٍ جزءاً واحداً (بينها مسافة) */
function oneSeg(segs) {
  const runs = [];
  segs.forEach((x, i) => {
    if (i) runs.push({ ...x.runs[0], t: ' ', sup: '' });
    runs.push(...x.runs);
  });
  return { items: segs.flatMap((x) => x.items), gap: segs[0].gap, runs, text: segs.map((x) => x.text).join(' '), x0: Math.min(...segs.map((x) => x.x0)), x1: Math.max(...segs.map((x) => x.x1)) };
}

/* ====================================================================== التحليل */
/** ألوان النص في الملف كله تُجمع في ألوان قليلة: عناصر اللون الواحد تتفاوت قليلاً بتنعيم الرسم */
function unifyColors(pages) {
  const pal = [];
  const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const near = (c) => {
    const [r, g, b] = rgb(c);
    let best = null, bd = 1e9;
    for (const p of pal) {
      const d = Math.abs(p.r / p.n - r) + Math.abs(p.g / p.n - g) + Math.abs(p.b / p.n - b);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best && bd < 70) {
      best.r += r;
      best.g += g;
      best.b += b;
      best.n++;
      return best;
    }
    const p = { r, g, b, n: 1 };
    pal.push(p);
    return p;
  };
  const runs = pages.flatMap((p) => p.lines.flatMap((L) => L.segs.flatMap((s) => s.runs)));
  const of = runs.map((r) => (r.c ? near(r.c) : null));
  const hex = (p) => [p.r / p.n, p.g / p.n, p.b / p.n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  runs.forEach((r, i) => (r.c = of[i] ? hex(of[i]) : ''));
  for (const p of pages) {
    for (const L of p.lines) {
      const chars = L.text.replace(/\s/g, '').length || 1;
      const cols = new Map();
      for (const r of L.segs.flatMap((s) => s.runs)) if (r.c) cols.set(r.c, (cols.get(r.c) || 0) + r.t.replace(/\s/g, '').length);
      L.color = [...cols].find(([, n]) => n >= chars * 0.6)?.[0] || '';
    }
  }
}

function analyse(pages) {
  unifyColors(pages);
  // ١) مقاس نص الكتاب: الأكثر أحرفاً
  const sizes = new Map();
  for (const p of pages) for (const L of p.lines) sizes.set(L.fs, (sizes.get(L.fs) || 0) + L.text.length);
  const bodyFs = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
  // ٢) الترويسة والتذييل: أسطر في أعلى الصفحة أو أسفلها تتكرر (بلا أرقامها)، أو رقم الصفحة وحده
  const key0 = (t) => t.replace(/[0-9٠-٩۰-۹]+/g, '#').replace(/\s+/g, ' ').trim();
  const keyOf = (L) => (L.pic ? `pic:${Math.round(L.pic.w / 4)}x${Math.round(L.pic.h / 4)}` : key0(L.text));
  const edgeCount = new Map();
  for (const p of pages) {
    const ls = p.lines;
    for (const L of [ls[0], ls[1], ls[ls.length - 1], ls[ls.length - 2]]) {
      if (!L) continue;
      const k = keyOf(L);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  const stats = { headers: 0, notes: 0, headings: 0, verses: 0, rules: 0, imagePages: 0, paragraphs: 0, refs: 0 };
  const isPageNum = (t) => new RegExp(`^[\\s\\-–—()\\[\\]${DIGITS}]+$`).test(t) && new RegExp(`[${DIGITS}]`).test(t) && t.replace(/\s/g, '').length <= 8;
  for (const p of pages) {
    const ls = p.lines;
    const topZone = p.H * 0.11, botZone = p.H * 0.9;
    const drop = new Set();
    for (let i = 0; i < Math.min(2, ls.length); i++) {
      const L = ls[i];
      if (L.top > topZone) break;
      // (سطرٌ كامل من الكلام لا يكون ترويسة وإن تكرر)
      const rep = (edgeCount.get(keyOf(L)) || 0) >= Math.max(3, pages.length * 0.15) && (L.x1 - L.x0 < (p.right0 || p.W) * 0.6 || L.fs < bodyFs * 0.95);
      // سطر الترويسة: يتكرر، أو رقم وحده، أو صغيرٌ يليه خط
      const ruleBelow = p.rules.some((r) => r.y > L.bottom && r.y < L.bottom + L.fs * 1.6 && r.x1 - r.x0 > (L.x1 - L.x0) * 0.8);
      if (isPageNum(L.text) || rep || (ruleBelow && L.fs <= bodyFs * 1.05)) drop.add(L);
      else break;
    }
    for (let i = ls.length - 1; i >= Math.max(0, ls.length - 2); i--) {
      const L = ls[i];
      if (L.bottom < botZone) break;
      const rep = (edgeCount.get(keyOf(L)) || 0) >= Math.max(3, pages.length * 0.15) && (L.x1 - L.x0 < p.W * 0.45 || L.fs < bodyFs * 0.95);
      if (isPageNum(L.text) || (rep && L.text.length < 80)) drop.add(L);
      else break;
    }
    stats.headers += drop.size;
    p.body = ls.filter((L) => !drop.has(L));
    // صفحة الفهرس (أسطرٌ بنقاطٍ متتابعة ورقم صفحة): الموقع يصنع فهرسه، فلا تُنقل
    const tocLine = (L) => /(?:\.\s?){4,}|…{2,}|_{4,}/.test(L.text) && new RegExp(`[${DIGITS}]\\s*$|^\\s*[${DIGITS}]`).test(L.text.trim());
    if (p.body.filter(tocLine).length >= 3) {
      p.body = p.body.filter((L) => !tocLine(L) && !/^\s*(?:فهرس|الفهرس|المحتويات|محتويات|فهرست)(?:\s|$)|^\s*الموضوع\s+الصفحة\s*$|^\s*الصفحة\s+الموضوع\s*$/.test(L.text));
      p.toc = true;
      stats.tocPages = (stats.tocPages || 0) + 1;
    }
    // خطوط الترويسة والإطار: ما فوق أول سطر أو تحت آخره لا يُعدّ فاصلاً
    const first = p.body[0], last = p.body[p.body.length - 1];
    // (ولا خطٌّ داخل سطر: تطويلٌ في كلمة، أو خطٌّ تحت كلام)
    const inLine = (r) => p.body.some((L) => r.y > L.top - 1 && r.y < L.y + L.fs * 0.45 && r.x0 >= L.x0 - L.fs && r.x1 <= L.x1 + L.fs);
    p.inRules = first && !p.toc ? p.rules.filter((r) => r.y > first.top - 2 && r.y < last.bottom + 2 && !inLine(r)) : [];
  }
  // ٣) هوامش النص (من أسطر المتن بمقاسه)
  for (const p of pages) {
    const bl = p.body.filter((L) => Math.abs(L.fs - bodyFs) <= bodyFs * 0.12 && L.text.length > 20);
    const all = bl.length >= 3 ? bl : p.body;
    p.right = pct(all.map((L) => L.x1), 0.9);
    p.left = pct(all.map((L) => L.x0), 0.1);
    if (!(p.right > p.left)) {
      p.right = p.W * 0.88;
      p.left = p.W * 0.12;
    }
    p.width = p.right - p.left;
  }
  // ٤) الحواشي: ما تحت خطّ الحواشي (خطٌّ أقصر من السطر بعده أسطر أصغر)، وإلا فأسطرٌ صغيرة في آخر الصفحة تبدأ برقم
  const NOTE_START = new RegExp(`^\\s*(?:[(\\[]\\s*([${DIGITS}]{1,3})\\s*[)\\]]|([${DIGITS}]{1,3})\\s*[-–.)ـ:])\\s*`);
  for (const p of pages) {
    p.notes = [];
    let at = -1;
    const fr = p.inRules
      .filter((r) => r.y > p.H * 0.3 && r.x1 - r.x0 < p.width * 0.75)
      .sort((a, b) => b.y - a.y)
      .find((r) => {
        const below = p.body.filter((L) => L.top > r.y - 1);
        return below.length && below.filter((L) => L.fs < bodyFs * 0.95).length >= below.length * 0.6;
      });
    if (fr) at = p.body.findIndex((L) => L.top > fr.y - 1);
    if (at < 0) {
      // بلا خط: أسطر صغيرة متتالية في آخر الصفحة أولها رقم
      let i = p.body.length;
      while (i > 0 && p.body[i - 1].fs < bodyFs * 0.9) i--;
      if (i < p.body.length && i > 0 && (NOTE_START.test(p.body[i].text) || p.body[i].segs[0].runs.some((r) => r.sup))) at = i;
    }
    if (at > 0) {
      p.noteLines = p.body.slice(at);
      p.body = p.body.slice(0, at);
      p.inRules = p.inRules.filter((r) => !fr || r !== fr);
    } else p.noteLines = [];
  }
  // ٥) الحواشي حاشيةً حاشية (والسطر الأول بلا رقم تتمةُ حاشية الصفحة السابقة)
  let lastNote = null;
  for (const p of pages) {
    const notes = [];
    let cur = null;
    for (const L of p.noteLines) {
      let text = L.segs.map((s) => s.runs.map((r) => (r.sup ? `(${r.sup}) ` : r.t)).join('')).join(' ').trim();
      // حواشٍ متعددة في سطر: يُقطع عند الرقم التالي
      const pieces = [];
      for (;;) {
        const m = NOTE_START.exec(text);
        if (m && (!cur || !pieces.length)) {
          const num = toLatin(m[1] || m[2]);
          pieces.push({ num, text: text.slice(m[0].length) });
        } else if (!pieces.length) pieces.push({ num: null, text });
        // الرقم التالي في وسط السطر
        const lastP = pieces[pieces.length - 1];
        const nextNum = lastP.num ? +lastP.num + 1 : cur && cur.num ? +cur.num + 1 : 0;
        const re = new RegExp(`(?:^|\\s)[(\\[]\\s*(${nextNum}|${String(nextNum).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])})\\s*[)\\]]\\s*`);
        const mm = nextNum ? re.exec(lastP.text) : null;
        if (mm && mm.index > 0) {
          const rest = lastP.text.slice(mm.index + mm[0].length);
          lastP.text = lastP.text.slice(0, mm.index).trim();
          text = `(${nextNum}) ` + rest;
          continue;
        }
        break;
      }
      for (const pc of pieces) {
        if (pc.num) {
          cur = { num: pc.num, lines: [pc.text] };
          notes.push(cur);
        } else if (cur) cur.lines.push(pc.text);
        else if (lastNote) lastNote.lines.push(pc.text);
        else {
          cur = { num: null, lines: [pc.text] };
          notes.push(cur);
        }
      }
    }
    p.notes = notes.filter((n) => n.num);
    if (p.notes.length) lastNote = p.notes[p.notes.length - 1];
    stats.notes += p.notes.length;
  }
  // ٥ب) صفحةٌ بعمودين: كثيرٌ من أسطرها مقسومة بفراغٍ في الموضع نفسه، وليست شعراً (أعجاز الشعر تتفق قافيتها)
  for (const p of pages) {
    const split = p.body.filter((L) => L.verse && L.segs.length === 2);
    if (split.length < 6 || split.length < p.body.length * 0.4) continue;
    const last = (sg) => sg.text.replace(/[\u064B-\u065F\u0670\u0640\s.،,:؛!؟»)"]+$/g, '').slice(-1);
    const ends = new Map();
    for (const L of split) ends.set(last(L.segs[1]), (ends.get(last(L.segs[1])) || 0) + 1);
    const rhyme = Math.max(...ends.values()) / split.length;
    const gm = split.map((L) => (L.rtl ? (L.segs[0].x0 + L.segs[1].x1) / 2 : (L.segs[0].x1 + L.segs[1].x0) / 2));
    const spread = pct(gm, 0.9) - pct(gm, 0.1);
    if (rhyme >= 0.5 || spread > p.width * 0.04) continue;
    // عمودان: يُقرأ الأيمن ثم الأيسر (في العربية)، والسطر الممتد عبرهما (عنوان) يفصل بين قطعتين
    const gx = median(gm);
    const rtl = split[0].rtl;
    const out = [];
    let colR = [], colL = [];
    const flush = () => {
      out.push(...(rtl ? [...colR, ...colL] : [...colL, ...colR]));
      colR = [];
      colL = [];
    };
    const part = (L, segs, col) => {
      const sg = segs.length === 1 ? { ...segs[0], gap: 0 } : { ...oneSeg(segs), gap: 0 };
      return { ...L, segs: [sg], text: sg.text, x0: sg.x0, x1: sg.x1, verse: false, col };
    };
    for (const L of p.body) {
      if (L.x0 > gx - 2) colR.push({ ...L, col: 'R' });
      else if (L.x1 < gx + 2) colL.push({ ...L, col: 'L' });
      else {
        // مقاطع السطر على جانبي الفاصل
        const R = L.segs.filter((sg) => sg.x0 > gx - 2), Lf = L.segs.filter((sg) => sg.x1 < gx + 2);
        if (R.length && Lf.length && R.length + Lf.length === L.segs.length) {
          colR.push(part(L, R, 'R'));
          colL.push(part(L, Lf, 'L'));
        } else {
          flush();
          out.push(L);
        }
      }
    }
    flush();
    p.body = out;
    p.columns = true;
    const gut = Math.max(bodyFs * 0.5, (pct(split.map((L) => Math.abs(L.segs[1].gap)), 0.5) || bodyFs * 2) / 2);
    p.frames = { R: { l: gx + gut, r: p.right }, L: { l: p.left, r: gx - gut }, F: { l: p.left, r: p.right } };
    stats.columnPages = (stats.columnPages || 0) + 1;
  }

  // ٦) الفقرات
  const blocks = [];
  let open = null; // فقرة لم تنتهِ في آخر الصفحة السابقة
  for (const p of pages) {
    if (p.pic && p.body.length <= 1) {
      blocks.push({ kind: 'pic', pic: p.pic, page: p.n, W: p.W, H: p.H, startsPage: true });
      stats.imagePages++;
      open = null;
      continue;
    }
    const gaps = [];
    for (let i = 1; i < p.body.length; i++) {
      const a = p.body[i - 1], b = p.body[i];
      if (Math.abs(a.fs - b.fs) < 0.6 && Math.abs(a.fs - bodyFs) < bodyFs * 0.15) gaps.push(b.y - a.y);
    }
    const lineGap = median(gaps) || bodyFs * 1.7;
    const center = (p.left + p.right) / 2;
    const refsHere = new Set(p.notes.map((n) => n.num));
    let first = true;
    let prev = null;
    // الخطوط المرسومة بين الأسطر: فواصل
    const rules = [...p.inRules].sort((a, b) => a.y - b.y);
    const emitRulesBefore = (y, next) => {
      while (rules.length && rules[0].y < y) {
        const r = rules.shift();
        const w = r.x1 - r.x0;
        const mid = (r.x0 + r.x1) / 2;
        // خطٌّ تحت عنوان أو فوقه (زخرفة العنوان، أو في صفحة العنوان): ليس فاصلاً
        const lastB = blocks[blocks.length - 1];
        const headish = (L) => L && (L.fs >= bodyFs * 1.12 || (L.boldShare > 0.7 && L.x1 - L.x0 < p.width * 0.6 && Math.abs((L.x0 + L.x1) / 2 - center) < p.width * 0.08));
        const nearPrev = lastB && lastB.page === p.n && lastB.lines && lastB.lines.length <= 2 && headish(lastB.lines[lastB.lines.length - 1]) && r.y - lastB.lines[lastB.lines.length - 1].bottom < bodyFs * 2.2;
        const nearNext = next && headish(next) && next.top - r.y < bodyFs * 2.2;
        if (nearPrev || nearNext) continue;
        blocks.push({ kind: 'rule', orn: w < p.width * 0.35 && Math.abs(mid - center) < p.width * 0.1, page: p.n });
        stats.rules++;
        open = null;
        prev = null;
      }
    };
    const LEADER = /(?:\.\s?){4,}|…{2,}|_{4,}/;
    const used = new Set();
    for (const [li, L0] of p.body.entries()) {
      if (used.has(L0)) continue;
      let L = L0;
      // صفحة العمودين: يُقاس كل سطرٍ بعرض عموده
      if (p.frames) {
        const f = p.frames[L.col || 'F'];
        p.left = f.l;
        p.right = f.r;
        p.width = f.r - f.l;
      }
      // بيتٌ مدرَّج: الشطر الأول في سطرٍ إلى اليمين، والثاني تحته إلى اليسار
      const N = p.body[li + 1];
      if (N && L.rtl && N.rtl && !L.pic && !N.pic && !L.verse && !N.verse && Math.abs(L.fs - N.fs) < 0.6 && N.y - L.y <= Math.max(lineGap, L.fs * 1.3) * 1.5) {
        const wL = L.x1 - L.x0, wN = N.x1 - N.x0;
        const words = (X) => X.text.split(/\s+/).filter((w) => AR_LETTER.test(w)).length;
        if (
          wL < p.width * 0.62 && wN < p.width * 0.62 && wL > p.width * 0.2 && wN > p.width * 0.2 &&
          L.x0 > center - p.width * 0.12 && N.x1 < center + p.width * 0.12 &&
          L.x0 - N.x0 > p.width * 0.2 && L.x1 - N.x1 > p.width * 0.2 &&
          Math.abs((N.x0 + L.x1) / 2 - center) < p.width * 0.08 &&
          words(L) >= 2 && words(N) >= 2
        ) {
          used.add(N);
          L = { ...L, segs: [oneSeg(L.segs), { ...oneSeg(N.segs), gap: L.x0 - N.x1 }], text: L.text + ' ' + N.text, verse: true, bottom: N.bottom };
        }
      }
      emitRulesBefore(L.top, L);
      if (L.pic) {
        // سطرٌ بخطٍّ زخرفي لا تُقرأ حروفه: صورته
        const mid = (L.x0 + L.x1) / 2;
        blocks.push({ kind: 'img', pic: L.pic, page: p.n, startsPage: first, side: Math.abs(mid - center) < p.width * 0.12 ? 'c' : (mid > center) === true ? 'r' : 'l' });
        stats.decor = (stats.decor || 0) + 1;
        prev = null;
        open = null;
        first = false;
        continue;
      }
      // سطرٌ من رموز الزخرفة وحدها («۞ ۞ ۞»، «* * *»، «❁ ❁»): فاصلٌ زخرفي
      if (!/[\p{L}\p{N}]/u.test(L.text) && L.text.replace(/\s/g, '').length <= 14 && L.text.replace(/\s/g, '').length >= 1 && !/^[.،,:؛-]+$/.test(L.text.trim())) {
        blocks.push({ kind: 'rule', orn: true, page: p.n, startsPage: first });
        stats.rules++;
        prev = null;
        open = null;
        first = false;
        continue;
      }
      const lmargin = L.x0 - p.left, rmargin = p.right - L.x1;
      const centered = lmargin > p.width * 0.06 && rmargin > p.width * 0.06 && Math.abs(lmargin - rmargin) < Math.max(p.width * 0.08, bodyFs * 2);
      const verse = !!L.verse;
      const indented = L.rtl ? rmargin > L.fs * 0.9 : lmargin > L.fs * 0.9;
      // مسافة بدء صغيرة (برامج تجعلها نصف حرف): تُعتدّ إن انتهى ما قبلها بعلامة وقف
      const indentedSoft = (L.rtl ? rmargin : lmargin) > Math.max(L.fs * 0.45, 5);
      const big = L.fs >= bodyFs * 1.12;
      const small = L.fs < bodyFs * 0.88;
      const style = (L.boldShare > 0.7 ? 'b' : '') + (L.color ? 'c' + L.color : '') + (big ? 'B' : small ? 's' : '');
      let newPara = true;
      if (prev && !verse && !prev.verse && p.frames && prev.L.col && L.col && prev.L.col !== L.col) {
        // من آخر عمودٍ إلى أول التالي: تتمة الفقرة إن امتلأ آخر سطرٍ فيه ولم ينتهِ بعلامة وقف
        const pf = p.frames[prev.L.col];
        const full = prev.L.rtl ? prev.L.x0 - pf.l < (pf.r - pf.l) * 0.06 : pf.r - prev.L.x1 < (pf.r - pf.l) * 0.06;
        newPara = !(full && !/[.:؟!]["»)\]]?\s*$/.test(prev.L.text.trim()) && !indented && !centered && style === prev.style);
      } else if (prev && !verse && !prev.verse) {
        const gap = L.y - prev.L.y;
        const prevShort = prev.L.rtl ? prev.L.x0 - p.left > p.width * 0.1 : p.right - prev.L.x1 > p.width * 0.1;
        // تغيّر اللون أو العرض وحده في وسط فقرة لا يقطعها (متنٌ ملوّن ثم شرحه في السطر نفسه)، إلا بعد نهاية جملة
        const sizeCls = (x) => x.replace(/^b?(c[0-9A-F]+)?/, '');
        const styleBreak = style !== prev.style && (sizeCls(style) !== sizeCls(prev.style) || /[.:؟!)\]»"]\s*$/.test(prev.L.text.trim()));
        const prevEnds = /[.:؟!]["»)\]]?\s*$/.test(prev.L.text.trim());
        newPara = gap > lineGap * 1.45 || prevShort || indented || (indentedSoft && prevEnds) || centered !== prev.centered || styleBreak || LEADER.test(L.text) || LEADER.test(prev.L.text);
        if (prev.centered && centered && gap <= lineGap * 1.25 && style === prev.style && !big) newPara = false;
        const bigGap = Math.max(lineGap, L.fs * 1.3) * 1.35;
        if (prev.centered && centered && big && gap <= bigGap && style === prev.style) newPara = false;
        // عنوانٌ كبير طال فانقسم سطرين (الأول ممتلئ، والثاني في الوسط)
        if (big && prev.L.fs >= bodyFs * 1.12 && (centered || prev.centered) && gap <= bigGap && style === prev.style && !prevEnds) newPara = false;
      } else if (first && open && !verse && !centered && !indented && Math.abs(L.fs - open.fs) < 0.6 && open.style.replace(/^b?(c[0-9A-F]+)?/, '') === style.replace(/^b?(c[0-9A-F]+)?/, '')) {
        // تتمة فقرة من الصفحة السابقة
        newPara = false;
      }
      if (newPara) {
        const blk = { kind: verse ? 'verse' : 'p', lines: [L], centered, fs: L.fs, style, page: p.n, startsPage: first, bold: L.boldShare > 0.7, color: L.color, big, small };
        blocks.push(blk);
        prev = { L, centered, style, verse, blk };
      } else {
        const blk = prev ? prev.blk : open;
        if (first) blk.pageBreakAt = blk.lines.length;
        blk.lines.push(L);
        prev = { L, centered, style, verse: false, blk };
      }
      first = false;
    }
    emitRulesBefore(Infinity);
    // آخر فقرة في الصفحة: تتصل بالصفحة التالية إن امتلأ سطرها الأخير ولم ينتهِ بنقطة (يُقاس بعرض عموده)
    const lastB = prev && prev.blk;
    if (lastB && lastB.kind === 'p' && !lastB.centered) {
      const LL = lastB.lines[lastB.lines.length - 1];
      const f = p.frames ? p.frames[LL.col || 'F'] : { l: p.left, r: p.right };
      const full = LL.rtl ? LL.x0 - f.l < (f.r - f.l) * 0.06 : f.r - LL.x1 < (f.r - f.l) * 0.06;
      open = full && !/[.:؟!]["»)]?$/.test(LL.text.trim()) ? lastB : null;
    } else open = null;
    if (p.frames) {
      p.left = p.frames.F.l;
      p.right = p.frames.F.r;
      p.width = p.right - p.left;
    }
    // الإحالات: الأرقام المرتفعة، و«(١)» في النص إن كان للصفحة حاشية بذلك الرقم
    for (const b of blocks.filter((x) => x.page === p.n && x.lines)) b.refsHere = refsHere;
    p.blocks = blocks.filter((x) => x.page === p.n);
  }
  const LEADER_T = /(?:\.\s?){4,}|…{2,}|_{4,}/;
  // صفحةٌ انتهى كلامها قبل آخرها بكثير (نهاية باب أو كتاب): ما بعدها يبدأ صفحةً جديدة
  const ends = pages.filter((p) => p.body && p.body.length >= 3).map((p) => p.body[p.body.length - 1].bottom);
  const fullBottom = pct(ends, 0.85);
  for (let k = 1; k < pages.length; k++) {
    const pv = pages[k - 1], p = pages[k];
    if (!pv.body || !pv.body.length || !p.blocks || !p.blocks.length) continue;
    const end = pv.body[pv.body.length - 1].bottom;
    const limit = pv.noteLines && pv.noteLines.length ? pv.noteLines[0].top : fullBottom;
    if (limit - end > pv.H * 0.2) p.blocks[0].hardBreak = true;
  }
  // ٧) العناوين: سطر أو سطران، أكبر من نص الكتاب، أو في الوسط عريضاً أو ملوّناً قصيراً
  const headSizes = [...new Set(blocks.filter((b) => b.kind === 'p' && b.lines.length <= 3 && b.big).map((b) => b.fs))].sort((a, b) => b - a);
  for (const b of blocks) {
    if (b.kind !== 'p') continue;
    const text = b.lines.map((L) => L.text).join(' ');
    b.textLen = text.length;
    const shortish = b.lines.length <= 3 && text.length <= 140;
    if (shortish && b.big && !/[،,]\s*$/.test(text)) b.head = Math.min(4, 1 + headSizes.indexOf(b.fs));
    else if (b.lines.length <= 2 && text.length <= 90 && b.centered && !b.small && (b.bold || b.color) && !LEADER_T.test(text)) b.head = Math.min(4, headSizes.length + 1);
    // سطرٌ قصير عريض وحده (لا يبدأ بقوس ولا ينتهي بعلامة وقف): عنوان فرعي («فصل في كذا»)
    else if (b.lines.length === 1 && b.bold && text.length <= 50 && text.trim().split(/\s+/).length <= 7 && !/^[(«"\[﴿]/.test(text.trim()) && !/[.:،,؛)»"\]﴾-]$/.test(text.trim()) && b.lines[0].x1 - b.lines[0].x0 < (pages.find((q) => q.n === b.page)?.width || 1e9) * 0.6) b.head = Math.min(4, headSizes.length + 2);
    if (b.head) stats.headings++;
    else stats.paragraphs++;
  }
  stats.verses = blocks.filter((b) => b.kind === 'verse').length;
  return { pages, blocks, bodyFs, stats };
}

/* ====================================================================== كتابة ملف Word */
function writeDocx(doc, { title }) {
  const { pages, blocks, bodyFs } = doc;
  const P0 = pages.find((p) => p.lines.length) || pages[0];
  const twip = (pt) => Math.round(pt * 20);
  const media = [];
  const rels = [];
  const notes = [];
  let noteId = 1;
  const body = [];
  const noteIdOf = new Map(); // "صفحة:رقم" ← معرّف الحاشية
  for (const p of pages) {
    for (const n of p.notes) {
      const id = noteId++;
      noteIdOf.set(p.n + ':' + n.num, { id, used: false });
      const txt = n.lines.join(' ').replace(/\s+/g, ' ').trim();
      notes.push(`<w:footnote w:id="${id}"><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r><w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve"> ${esc(dropKashida(txt))}</w:t></w:r></w:p></w:footnote>`);
    }
  }
  const runXml = (r) => {
    const t = dropKashida(r.t);
    if (!t) return '';
    const sz = Math.round((r.fs || bodyFs) * 2);
    const font = r.f ? `<w:rFonts w:ascii="${esc(r.f)}" w:hAnsi="${esc(r.f)}" w:cs="${esc(r.f)}"/>` : '';
    return `<w:r><w:rPr>${font}${r.b ? '<w:b/><w:bCs/>' : ''}${r.c ? `<w:color w:val="${r.c}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  };
  const refXml = (id) => `<w:r><w:rPr><w:rtl/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
  const REFTXT = new RegExp(`[(\\[]\\s*([${DIGITS}]{1,3})\\s*[)\\]]`, 'g');
  /** أجزاء سطر ← XML، والإحالات (المرتفعة، و«(١)» إن كان لها حاشية في صفحتها) حواشٍ حقيقية */
  const lineXml = (L, page) => {
    let out = '';
    for (const [si, sg] of L.segs.entries()) {
      if (si) out += runXml({ ...sg.runs[0], t: ' ' });
      for (const r of sg.runs) {
        if (r.sup) {
          const n = noteIdOf.get(page + ':' + r.sup);
          if (n && !n.used) {
            n.used = true;
            out += refXml(n.id);
          } else out += runXml({ ...r, t: ` (${r.sup})`, b: false, c: '' });
          continue;
        }
        // «(١)» في وسط الكلام
        let last = 0;
        let piece = '';
        for (const m of r.t.matchAll(REFTXT)) {
          const n = noteIdOf.get(page + ':' + toLatin(m[1]));
          if (!n || n.used) continue;
          piece += runXml({ ...r, t: r.t.slice(last, m.index) }) + refXml(n.id);
          n.used = true;
          last = m.index + m[0].length;
        }
        out += piece + runXml({ ...r, t: r.t.slice(last) });
      }
    }
    return out;
  };
  let lastPage = 0;
  const lastText = new Map();
  for (const b of blocks) {
    const newPage = b.page !== lastPage;
    lastPage = b.page;
    const pageMark = newPage ? '<w:r><w:lastRenderedPageBreak/></w:r>' : '';
    if (b.hardBreak && body.length) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    if (b.kind === 'pic') {
      const id = media.length + 1;
      const bin = Uint8Array.from(atob(b.pic.src.split(',')[1]), (c) => c.charCodeAt(0));
      media.push({ name: `word/media/page${id}.jpg`, data: bin });
      rels.push(`<Relationship Id="rIdImg${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${id}.jpg"/>`);
      const cx = Math.round(b.W * 12700), cy = Math.round(b.H * 12700);
      body.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${pageMark}<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImg${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      continue;
    }
    if (b.kind === 'img') {
      // صورة سطرٍ بخطٍّ زخرفي، بمقاسها في الصفحة
      const id = media.length + 1;
      const bin = Uint8Array.from(atob(b.pic.src.split(',')[1]), (c) => c.charCodeAt(0));
      media.push({ name: `word/media/line${id}.png`, data: bin });
      rels.push(`<Relationship Id="rIdImg${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/line${id}.png"/>`);
      const cx = Math.round(b.pic.w * 12700), cy = Math.round(b.pic.h * 12700);
      const jc = b.side === 'c' ? 'center' : b.side === 'l' ? 'left' : 'right';
      body.push(`<w:p><w:pPr><w:bidi/><w:jc w:val="${jc}"/></w:pPr>${pageMark}<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImg${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      continue;
    }
    if (b.kind === 'rule') {
      // فاصل: خط رفيع بعرض السطر (متن/شرح)، أو زخرفة قصيرة في الوسط
      body.push(`<w:p><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="${b.orn ? 'double' : 'single'}" w:sz="4" w:space="1" w:color="auto"/></w:pBdr></w:pPr>${pageMark}</w:p>`);
      continue;
    }
    const jc = b.centered || b.kind === 'verse' ? 'center' : 'both';
    const head = b.head ? `<w:outlineLvl w:val="${b.head - 1}"/>` : '';
    let inner = pageMark;
    if (b.kind === 'verse') {
      const L = b.lines[0];
      inner += L.segs.map((sg, i) => (i ? '<w:r><w:tab/></w:r>' : '') + lineXml({ ...L, segs: [sg] }, b.page)).join('');
    } else {
      b.lines.forEach((L, i) => {
        // (الأسطر الموسّطة: عنوانٌ أو شعرٌ مرصوف، تبقى أسطرها كما هي)
        if (i) inner += (b.pageBreakAt === i ? '<w:r><w:lastRenderedPageBreak/></w:r>' : '') + (b.centered && !b.head ? '<w:r><w:br/></w:r>' : runXml({ ...L.segs[0].runs[0], t: ' ', b: false, c: '' }));
        inner += lineXml(L, L.page || b.page);
      });
    }
    body.push(`<w:p><w:pPr><w:bidi/><w:jc w:val="${jc}"/>${head}</w:pPr>${inner}</w:p>`);
    if (!b.head) lastText.set(b.lines[b.lines.length - 1].page || b.page, body.length - 1);
  }
  // حواشٍ لم يوجد رقمها في كلام صفحتها: تُربط بآخر فقرة في الصفحة (لئلا تضيع)
  let linked = 0;
  for (const [k, n] of noteIdOf) {
    if (n.used) {
      linked++;
      continue;
    }
    const pg = +k.split(':')[0];
    let at = lastText.get(pg);
    for (let q = pg - 1; at === undefined && q >= pg - 3; q--) at = lastText.get(q);
    if (at === undefined) continue;
    body[at] = body[at].replace(/<\/w:p>$/, refXml(n.id) + '</w:p>');
    n.used = true;
  }
  doc.stats.refs = linked;
  doc.stats.orphanNotes = noteIdOf.size - linked;
  const W = twip(P0.W), H = twip(P0.H);
  const mR = twip(P0.W - (P0.right || P0.W * 0.88)), mL = twip(P0.left || P0.W * 0.12);
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${W}" w:h="${H}"/><w:pgMar w:top="1000" w:right="${mR}" w:bottom="1000" w:left="${mL}"/><w:bidi/></w:sectPr></w:body></w:document>`;
  const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notes.join('')}</w:footnotes>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="${Math.round(bodyFs * 2)}"/><w:szCs w:val="${Math.round(bodyFs * 2)}"/><w:rtl/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFn" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join('')}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title || '')}</dc:title></cp:coreProperties>`;
  return makeZip([
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/footnotes.xml', data: footnotesXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'docProps/core.xml', data: core },
    ...media,
  ]);
}

export const _test = { normText, dropKashida, joinRtl };

/**
 * نص الصفحة للقارئ (تحديد النص ونسخه والبحث): أسطرٌ بترتيب القراءة، ولكل سطر كلماته بمواضعها.
 * المواضع نسبةٌ من عرض الصفحة وطولها (٠–١). الحروف المتصلة (‎U+FE70…) تعود حروفاً، والأرقام والكلام اللاتيني بترتيبه.
 * @returns {Promise<{lines: Array<{rtl:boolean, top:number, bottom:number, words:Array<{t:string,x0:number,x1:number}>, text:string}>}>}
 */
export async function pageText(page, pdfjs) {
  const vp = page.getViewport({ scale: 1 });
  const { raw } = await pageGlyphs(page, vp, pdfjs);
  const lines = buildLines(raw).filter((L) => !L.garbled && L.text.trim());
  const W = vp.width, H = vp.height;
  return {
    lines: lines.map((L) => {
      const words = [];
      for (const sg of L.segs) {
        let cur = null;
        for (const it of bidiOrder(sg.items, L.rtl)) {
          if (it.space || !it.t.trim()) {
            cur = null;
            continue;
          }
          if (it.sup) {
            // رقم الإحالة المرتفع: من الكلمة قبله
            if (cur) cur.t += it.t;
            continue;
          }
          if (!cur) words.push((cur = { t: '', x0: Infinity, x1: -Infinity }));
          cur.t += it.t;
          cur.x0 = Math.min(cur.x0, it.x0);
          cur.x1 = Math.max(cur.x1, it.x1);
        }
        cur = null;
      }
      const ws = words.filter((w) => w.t.trim() && Number.isFinite(w.x0)).map((w) => ({ t: dropKashida(w.t), x0: w.x0 / W, x1: w.x1 / W }));
      return { rtl: L.rtl, top: L.top / H, bottom: L.bottom / H, words: ws, text: ws.map((w) => w.t).join(' ') };
    }).filter((L) => L.words.length),
  };
}
