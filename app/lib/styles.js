// أساليب دور النشر: الأساليب المضمّنة + ما يصنعه المالك أو يركّبه من «بطاقة أسلوب».
// الأسلوب = إعدادات يعرفها الموقع (settings) + إضافات اختيارية (extras: صور و CSS) لما لا تغطيه الإعدادات.
import crypto from 'node:crypto';
import { readJson, updateJson } from './store.js';
import { PRESETS, STYLE_DEFAULTS, FONTS, RESEARCH_FONT } from '../shared/presets.js';
import { BUILTIN_STYLES } from './builtin.js';
import { cleanDesign, DESIGN_PARTS } from '../shared/style-parts.js';
import { cleanMutun, MUTUN_KEYS } from '../shared/mutun.js';
import { cleanOuterMargin } from '../shared/margin.js';
import { addFontFile, listFonts, FONT_DIR, inspectFont } from './fonts.js';
import { cleanPrint, getPrint, getPrintPreset, PAGE_TYPES } from './print.js';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'styles.json';
const httpErr = (status, message) => Object.assign(new Error(message), { status });
export const STYLE_FORMAT = 'warraq-style';

/* ------------------------------------------------------------ التنقية */
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, d) => {
  if (typeof v !== 'string') return d;
  let s = v.trim();
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('');
  return HEX.test(s) ? s : d;
};
const hexOrEmpty = (v, d) => (v === '' ? '' : hex(v, d));
const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// نص يدخل في CSS أو HTML: بلا رموز تخرج من سياقه
const text = (v, d, max) => (typeof v === 'string' ? v.replace(/[<>{}\\"'`;\u0000-\u001f]/g, '').slice(0, max) : d);
const fontName = (v, d) => text(v, d, 60).trim() || d;

const D = STYLE_DEFAULTS;
/** خطوط أنواع النص: المتن، والآيات، والأبيات، والباب، والفصل، وما دونهما */
export const ROLE_FONTS = ['matn', 'quran', 'verse', 'h1', 'h2', 'h3'];

/**
 * تنقية إعدادات الأسلوب: مفاتيح معروفة فقط وبقيم مقبولة.
 * partial=true: يُحفظ ما ورد فقط (للأسلوب المخزَّن). false: إعدادات كاملة (للتنضيد).
 */
export function cleanSettings(input, { partial = false } = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const out = {};
  const put = (k, v) => {
    if (!partial || s[k] !== undefined) out[k] = v;
  };
  for (const k of ['matnColor', 'quranColor', 'textColor', 'ornamentColor', 'ruleColor']) put(k, hex(s[k], D[k]));
  for (const k of ['quotedColor', 'verseColor', 'basmalaColor']) put(k, hexOrEmpty(s[k], ''));
  if (!partial || s.headingColors) {
    const h = s.headingColors || {};
    out.headingColors = { 1: hex(h[1], D.headingColors[1]), 2: hex(h[2], D.headingColors[2]), 3: hex(h[3], D.headingColors[3]), 4: hex(h[4], hex(h[2], D.headingColors[4])) };
  }
  for (const k of ['matnBold', 'quranInMatn', 'hadithBold', 'footnotes', 'chapterNewPage', 'runningHead', 'frame', 'ornaments', 'matnQawluhu', 'mergeBroken', 'printReady', 'widowOrphan', 'runts']) {
    put(k, bool(s[k], D[k] === undefined ? true : D[k]));
  }
  // ما يغيّر النص (المسافات والعريض): في البحث مطفأ ما لم يختره المستخدم صراحةً، وفي الكتاب كما كان
  const research = s.template === 'research' || s.kind === 'research' || s.research === true;
  for (const k of ['typoRules', 'nabawiBold']) put(k, bool(s[k], research ? false : D[k] !== false));
  put('spaceCollapse', bool(s.spaceCollapse, false));
  put('matnBrackets', oneOf(s.matnBrackets, ['()', '«»', '[]', '{}', 'none'], D.matnBrackets));
  // عزو الآيات ونظام العناوين (shared/typo-rules.js)
  put('ayahCite', oneOf(s.ayahCite, ['', 'matn', 'note'], D.ayahCite || ''));
  // (القيمة الفارغة من الإصدار السابق: الأصل — المعتمد في الكتاب، وكما في القالب في البحث)
  put('headScheme', oneOf(s.headScheme, ['pro', 'style'], research ? 'style' : 'pro'));
  put('tocPosition', oneOf(s.tocPosition, ['start', 'end', 'none'], D.tocPosition));
  put('verseSep', oneOf(s.verseSep, ['none', 'one', 'three'], D.verseSep));
  put('verseLayout', oneOf(s.verseLayout, ['line', 'stack', 'stagger', 'center', 'khams', 'tri'], D.verseLayout || 'line'));
  // صورة البسملة المختارة من مكتبة الموقع ('' = الافتراضية · 'text' = نصاً بخط الرقعة)
  put('basmalaId', typeof s.basmalaId === 'string' && /^[\w-]{1,24}$/.test(s.basmalaId) ? s.basmalaId : '');
  put('sharhEnd', oneOf(s.sharhEnd, ['page', 'ornament'], D.sharhEnd));
  put('ornament', text(s.ornament, D.ornament, 24) || D.ornament);
  put('verseSepSymbol', text(s.verseSepSymbol, D.verseSepSymbol, 4) || D.verseSepSymbol);
  if (!partial || s.tocInclude) {
    const inc = (Array.isArray(s.tocInclude) ? s.tocInclude : D.tocInclude).map(Number).filter((n) => [1, 2, 3].includes(n));
    out.tocInclude = [...new Set(inc)].sort();
  }
  // عنوان الفهرس مع الأسلوب («فهرس الموضوعات»، «المحتويات»…؛ وما لم يُذكر فعنوان فهرس الملف أو «فهرس الموضوعات»)
  if (typeof s.tocTitle === 'string' && text(s.tocTitle, '', 60).trim()) out.tocTitle = text(s.tocTitle, '', 60).trim();
  if (!partial || s.fonts) {
    const f = s.fonts || {};
    out.fonts = { body: fontName(f.body, D.fonts.body), heading: fontName(f.heading, D.fonts.heading), cover: fontName(f.cover, D.fonts.cover), names: fontName(f.names, D.fonts.names) };
    // خطٌّ لكل نوعٍ من النص (فارغ: خط الكتاب للنص، وخط العناوين للعناوين)
    for (const k of ROLE_FONTS) if (typeof f[k] === 'string' && fontName(f[k], '')) out.fonts[k] = fontName(f[k], '');
  }
  if (!partial || s.sizes) {
    const z = s.sizes || {};
    out.sizes = { body: num(z.body, D.sizes.body, 9, 26), note: num(z.note, D.sizes.note, 7, 22), h1: num(z.h1, D.sizes.h1, 12, 44), h2: num(z.h2, D.sizes.h2, 11, 38), h3: num(z.h3, D.sizes.h3, 10, 32), h4: num(z.h4, D.sizes.h4, 9, 30) };
  }
  put('lineHeight', num(s.lineHeight, D.lineHeight, 1.2, 2.8));
  put('noteLineHeight', num(s.noteLineHeight, D.noteLineHeight, 1.1, 2.6));
  if (!partial || s.page) {
    const p = s.page || {};
    out.page = { w: num(p.w, D.page.w, 100, 300), h: num(p.h, D.page.h, 140, 420), side: num(p.side, D.page.side, 6, 45), top: num(p.top, D.page.top, 6, 50), bottom: num(p.bottom, D.page.bottom, 6, 50) };
    // صفحة ملف Word كما هي («كما في الملف»): هامشٌ أعلى أو أسفل واسع (منطقةٌ للتعليق في خلفية الصفحة) — ويبقى للنص ٤٠ مم على الأقل
    if (p.wide === true) {
      out.page.top = num(p.top, D.page.top, 6, 250);
      out.page.bottom = num(p.bottom, D.page.bottom, 6, 250);
      const room = out.page.h - out.page.top - out.page.bottom;
      if (room < 40) {
        const k = (out.page.h - 40) / (out.page.top + out.page.bottom);
        out.page.top = Math.round(out.page.top * k * 10) / 10;
        out.page.bottom = Math.round(out.page.bottom * k * 10) / 10;
      }
      out.page.wide = true;
      if (Number(p.footer) > 0) out.page.footer = num(p.footer, 6, 1, 60);
    }
  }
  // الهامش الخارجي الواسع (النص ١١ سم والهامش في طرف الكتاب ٤ سم): { on, w عرضه مم, odd: 'l' الفردية يسرى | 'r' يمنى } — shared/margin.js
  const om = cleanOuterMargin(s.outerMargin);
  if (om) out.outerMargin = om;
  put('indentMm', num(s.indentMm, D.indentMm, 0, 15));
  // الأبحاث: المسافة بعد الفقرة (نقطة)، وأحجام الملخص والمصادر والنص الإنجليزي ورقم الصفحة
  if (!partial || s.paraAfter !== undefined) out.paraAfter = num(s.paraAfter, 0, 0, 24);
  for (const [k, d, lo, hi] of [['abstractSize', 15, 9, 24], ['refSize', 14, 9, 24], ['enSize', 12, 8, 20], ['folioSize', 12, 8, 28]]) if (!partial || s[k] !== undefined) out[k] = num(s[k], d, lo, hi);
  // لون رقم الصفحة (من ملف Word «كما في الملف»)
  if (s.folioColor !== undefined) out.folioColor = hexOrEmpty(s.folioColor, '');
  if (!partial || s.research !== undefined) out.research = s.research === true;
  // نوع الأسلوب: للكتب، أو للأبحاث، أو للمتون (يظهر الأسلوب مع نوعه وحده)، أو «شامل» لها كلها (all) وما يخص كل نوعٍ في forKind
  if (!partial || s.kind !== undefined || s.research !== undefined) out.kind = oneOf(s.kind, ['books', 'research', 'mutun', 'all'], s.research === true ? 'research' : 'books');
  // لون الورق مع هذا الأسلوب (أبيض، أو أصفر كالكتب الشرعية؛ وما لم يُذكر فاختيار المستخدم)
  if (s.paper === 'white' || s.paper === 'yellow') out.paper = s.paper;
  // الهامش الجانبي (ما يُكتب في هامش الصفحة بجانب الفقرة في المحرِّر): مقاس خطه ولونه وخطه، ومحاذاته، والخط الفاصل
  const sn = cleanSideNote(s.sideNote);
  if (sn) out.sideNote = sn;
  // أنماط الفقرة والحرف الجاهزة مع الأسلوب (تنبيه، فائدة، مصطلح…): تظهر في المحرِّر، وما عرّفه المستخدم في كتابه باسمها يعلوها
  const us = cleanUStyles(s.ustyles);
  if (us) out.ustyles = us;
  // شكل المتون مع الأسلوب: موضع التعليق وجهته وسطوره وعنوانه و«قبل المتن» (مفاتيح m… من shared/mutun.js)
  const ml = cleanMutunLook(s.mutunLook);
  if (ml) out.mutunLook = ml;
  // الأسلوب الشامل: ما يخص الكتب أو الأبحاث أو المتون وحدها (يُضم إلى إعداداته حين يُختار لذلك النوع)
  if (partial && s.forKind && typeof s.forKind === 'object') {
    const fk = {};
    for (const k of ['books', 'research', 'mutun']) {
      const x = s.forKind[k];
      if (!x || typeof x !== 'object') continue;
      const { kind: _k, forKind: _f, ...rest } = x;
      const c = cleanSettings(rest, { partial: true });
      // (ما كان مجموعةً: الخطوط والمقاسات والصفحة وألوان العناوين — يبقى منها ما ذُكر وحده، ويُضم الباقي من الأسلوب)
      for (const g of ['fonts', 'sizes', 'page', 'headingColors']) {
        if (!c[g] || !rest[g] || typeof rest[g] !== 'object') continue;
        for (const sub of Object.keys(c[g])) if (rest[g][sub] === undefined) delete c[g][sub];
        if (!Object.keys(c[g]).length) delete c[g];
      }
      if (Object.keys(c).length) fk[k] = c;
    }
    if (Object.keys(fk).length) out.forKind = fk;
  }
  // أجزاء التصميم الجاهزة (شكل عنوان الباب، إطار الصفحة…): مفاتيح معروفة فقط، والخادم يكتب تنسيقها
  if (!partial || s.design) out.design = cleanDesign(s.design);
  return out;
}

/** الهامش الجانبي: { size نقطة، color، font، al، rule، box } */
function cleanSideNote(v) {
  if (!v || typeof v !== 'object') return null;
  const o = {};
  if (Number.isFinite(+v.size) && +v.size > 0) o.size = num(v.size, 11, 6, 22);
  if (HEX.test(v.color || '')) o.color = v.color;
  if (typeof v.font === 'string' && fontName(v.font, '')) o.font = fontName(v.font, '');
  if (['r', 'l', 'c', 'j'].includes(v.al)) o.al = v.al;
  if (typeof v.rule === 'boolean') o.rule = v.rule;
  // نص الهامش في خانةٍ (إطارٍ بقدر نصه)
  if (typeof v.box === 'boolean') o.box = v.box;
  return Object.keys(o).length ? o : null;
}
/** أنماط الفقرة والحرف: { sid: { name, kind: p|c, st, ps, al } } */
const UST_ST = { size: [0.3, 4], up: [-200, 200], ws: [-50, 300], ks: [0, 9] };
function cleanUStyles(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const [sid0, x] of Object.entries(v).slice(0, 40)) {
    const sid = String(sid0).replace(/[^\w-]/g, '').slice(0, 24);
    if (!sid || !x || typeof x !== 'object') continue;
    const st = {};
    const xs = x.st && typeof x.st === 'object' ? x.st : {};
    for (const [k, [lo, hi]] of Object.entries(UST_ST)) if (Number.isFinite(+xs[k]) && +xs[k] !== 0) st[k] = num(xs[k], 0, lo, hi);
    for (const k of ['bold', 'it', 'ul', 'sk']) if (xs[k]) st[k] = k === 'bold' ? true : 1;
    for (const k of ['color', 'bg']) if (HEX.test(xs[k] || '')) st[k] = xs[k];
    if (typeof xs.font === 'string' && fontName(xs.font, '')) st.font = fontName(xs.font, '');
    if (xs.va === 'sup' || xs.va === 'sub') st.va = xs.va;
    const ps = {};
    const xp = x.ps && typeof x.ps === 'object' ? x.ps : {};
    for (const [k, lo, hi] of [['ind', -60, 120], ['is', -40, 120], ['ie', -40, 120], ['sb', -20, 200], ['sa', -20, 200], ['lh', 0.8, 5]]) if (Number.isFinite(+xp[k])) ps[k] = num(xp[k], 0, lo, hi);
    if (['box', 'shade', 'side', 'double'].includes(xp.bx)) ps.bx = xp.bx;
    if (['b', 'd', 'n', 'p', 'w'].includes(xp.ls)) ps.ls = xp.ls;
    if (xp.drop) ps.drop = 1;
    if (xp.dir === 'ltr') ps.dir = 'ltr';
    out[sid] = {
      name: text(x.name, 'نمط', 60).trim() || 'نمط',
      kind: x.kind === 'c' ? 'c' : 'p',
      ...(Object.keys(st).length ? { st } : {}),
      ...(x.kind !== 'c' && Object.keys(ps).length ? { ps } : {}),
      ...(x.kind !== 'c' && ['c', 'l', 'r'].includes(x.al) ? { al: x.al } : {}),
    };
  }
  return Object.keys(out).length ? out : null;
}
/** شكل المتون: ما ورد من مفاتيح m… بقيمها المقبولة (بلا مدى المتن ونوعه، فهما لكل كتابٍ وحده) */
function cleanMutunLook(v) {
  if (!v || typeof v !== 'object') return null;
  const keys = MUTUN_KEYS.filter((k) => k !== 'mRange' && k !== 'mKind' && v[k] !== undefined);
  if (!keys.length) return null;
  const full = cleanMutun(v);
  const out = {};
  for (const k of keys) if (!(k === 'mDivide' && full[k] === 'manual') && !(k === 'mPlace' && full[k] === 'none')) out[k] = full[k];
  return Object.keys(out).length ? out : null;
}

/** إعدادات طلب التنضيد كما تصل من المتصفح: تُنقّى كلها قبل أن تدخل مستند الطباعة */
export function cleanRenderSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    ...cleanSettings(s),
    template: oneOf(s.template, ['matn', 'matn_sharh', 'matn_hashia', 'full', 'tafsir', 'research'], 'full'),
    // الغلاف الداخلي الذي يصنعه الموقع: يُترك حين يأتي ملف Word بصفحات عنوانه
    innerCover: s.innerCover !== false,
    tocLevels: num(s.tocLevels, 3, 1, 4),
    tocTitle: text(s.tocTitle, '', 60),
    docxFont: text(s.docxFont, '', 60),
    docxLineSpacing: num(s.docxLineSpacing, 1, 0.8, 3),
    // قالب البحث (البحث الجامعي، المحكَّم، الرسالة العلمية)
    rlayout: oneOf(s.rlayout, ['uni', 'journal', 'thesis'], 'uni'),
    // لون الورق: أبيض، أو أصفر كالكتب الشرعية
    paper: oneOf(s.paper, ['white', 'yellow'], 'white'),
    // محاذاة العناوين («كما في الملف»: يميناً إن كانت كذلك فيه)
    headAl: oneOf(s.headAl, ['c', 'r'], 'c'),
    // المتون: المتن وموضع التعليق عليه (shared/mutun.js)
    mutun: s.mutun === true,
    ...(s.mutun === true ? cleanMutun(s) : {}),
    // خلفيات الصفحات: صورة لصفحات المتن والشرح، ولصفحة الباب، ولصفحة الفصل، وللفهرس (ما لم يُختر لها شيء: خلفية المتن)
    ...(cleanBgs(s.bgs) ? { bgs: cleanBgs(s.bgs) } : {}),
    // تنسيق ملف Word نفسه في كلماته (خطها ومقاسها): في «كما في الملف» وحده
    fileFmt: s.fileFmt === true,
    preset: text(s.preset, '', 40),
    styleId: /^[\w-]{1,40}$/.test(String(s.styleId || '')) ? String(s.styleId) : '',
    // تنسيق طباعة محفوظ يختاره المستخدم (أو تحمله حزمة غلاف): يتقدّم على تنسيق الأسلوب والموقع
    printPreset: /^pp\d{1,4}$/.test(String(s.printPreset || '')) ? String(s.printPreset) : '',
  };
}

/** خلفيات الصفحات: صور (data:) لا يزيد كلٌّ منها على ١٢ م.ب */
export const BG_KINDS = ['body', 'h1', 'h2', 'toc'];
const BG_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
export function cleanBgs(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  for (const k of BG_KINDS) if (typeof b[k] === 'string' && b[k].length <= 16 * 1024 * 1024 && BG_RE.test(b[k])) out[k] = b[k];
  return Object.keys(out).length ? out : null;
}

/* ------------------------------------------------------------ الإضافات (extras) */
export const SLOTS = {
  coverBg: 'خلفية صفحة الغلاف الداخلي',
  pageBg: 'خلفية صفحات المتن والفهرس',
  h1Ornament: 'زخرفة تحت عناوين الأبواب',
  separator: 'فاصل زخرفي بدل الرموز',
};
const IMG_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_EXTRAS = 12 * 1024 * 1024;
const MAX_SCRIPT = 300_000;

/** CSS المالك: بلا خروج من وسم style، بلا @import، ولا روابط خارجية */
function cleanCss(css) {
  return String(css || '')
    .slice(0, 80_000)
    .replace(/<\/?[a-z!][^>]*>?/gi, '')
    .replace(/</g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@charset[^;]*;?/gi, '')
    .replace(/url\s*\(\s*(['"]?)(?!data:image\/|#)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(|javascript:/gi, '');
}

/* قوالب البطاقة: HTML لعناصر الصفحة وصفحات خاصة. تُنقّى هنا، ومستند الطباعة نفسه يمنع أي سكربت (CSP). */
export const TEMPLATE_KEYS = {
  h1: 'عنوان الباب (المستوى ١)',
  h2: 'عنوان الفصل (المستوى ٢)',
  h3: 'العنوان الفرعي (المستوى ٣)',
  h4: 'عنوان المستوى ٤',
  folio: 'رقم الصفحة',
  rh: 'ترويسة الصفحة',
  page: 'طبقة زخرفية في كل صفحة',
  cover: 'الغلاف الداخلي كله',
  chapterPage: 'صفحة فاصلة لكل باب',
  ornament: 'الفاصل الزخرفي',
  tocHead: 'رأس الفهرس (عنوانه وما تحته)',
};
export const PAGE_AT = {
  start: 'أول الكتاب (قبل الغلاف الداخلي)',
  afterCover: 'بعد الغلاف الداخلي',
  beforeContent: 'قبل أول المتن (بعد الفهرس إن كان في البداية)',
  afterContent: 'بعد آخر المتن',
  end: 'آخر الكتاب',
};
const BAD_TAGS = 'script|style|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|audio|video|source|track|template|noscript';
function cleanHtml(html, max) {
  return String(html || '')
    .slice(0, max)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(new RegExp(`<\\s*(script|style|iframe|object|template|noscript)\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\s*\\/?\\s*(${BAD_TAGS})\\b[^>]*>?`, 'gi'), '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(javascript|vbscript)\s*:/gi, '')
    // الروابط والمصادر: صورة مضمّنة، أو صورة من صور الأسلوب asset(name)، أو مرجع داخلي #id
    .replace(/\b(src|href|xlink:href|srcset|action|formaction|poster|data)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, attr, val) => {
      const v = val.replace(/^["']|["']$/g, '').trim();
      return /^(data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$|asset\(\s*[\w-]{1,40}\s*\)$|#[\w-]*$)/i.test(v) ? m : '';
    })
    .replace(/url\s*\(\s*(['"]?)(?!data:image\/|#)[^)]*\)/gi, 'none')
    .replace(/@import/gi, '');
}

export function cleanExtras(input) {
  const e = input && typeof input === 'object' ? input : {};
  const images = {};
  let total = 0;
  for (const [k, v] of Object.entries(e.images && typeof e.images === 'object' ? e.images : {}).slice(0, 24)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(k) || typeof v !== 'string' || !IMG_RE.test(v)) continue;
    // SVG: بلا سكربتات ولا معالجات أحداث (وإن كانت لا تعمل في خلفيات CSS)
    if (v.startsWith('data:image/svg+xml') && /<script|\son\w+\s*=|javascript:/i.test(Buffer.from(v.split(',')[1], 'base64').toString('utf8'))) continue;
    total += v.length;
    if (total > MAX_EXTRAS) throw httpErr(413, 'صور الأسلوب أكبر من المسموح (١٢ م.ب)');
    images[k] = v;
  }
  const slots = {};
  for (const k of Object.keys(SLOTS)) {
    const v = e.slots && e.slots[k];
    if (typeof v === 'string' && images[v]) slots[k] = v;
  }
  const templates = {};
  for (const k of Object.keys(TEMPLATE_KEYS)) {
    const v = e.templates && typeof e.templates[k] === 'string' ? cleanHtml(e.templates[k], 30_000).trim() : '';
    if (v) templates[k] = v;
  }
  const pages = (Array.isArray(e.pages) ? e.pages : [])
    .slice(0, 12)
    .map((x) => ({
      at: oneOf(x && x.at, Object.keys(PAGE_AT), 'afterCover'),
      name: String((x && x.name) || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30),
      folio: bool(x && x.folio, false),
      html: cleanHtml(x && x.html, 80_000).trim(),
    }))
    .filter((x) => x.html);
  const options = { blankPage: bool(e.options && e.options.blankPage, true) };
  // برنامج الأسلوب: كود يتحكم في آلية التنضيد. لا يُنقّى (هو كود)، بل يُعزل حيث يعمل: مستند الطباعة بلا شبكة،
  // والمعاينة في إطار sandbox لا يصل إلى الموقع. scriptOn=false يعطّله دون حذفه.
  const script = typeof e.script === 'string' ? e.script.replace(/\u0000/g, '').slice(0, MAX_SCRIPT) : '';
  return { css: cleanCss(e.css), images, slots, h1OrnamentMm: num(e.h1OrnamentMm, 7, 2, 40), separatorMm: num(e.separatorMm, 8, 2, 40), templates, pages, options, script, scriptOn: bool(e.scriptOn, true) };
}

export const hasExtras = (e) =>
  !!(e && ((e.css && e.css.trim()) || (e.images && Object.keys(e.images).length) || (e.templates && Object.keys(e.templates).length) || (e.pages && e.pages.length) || (e.options && e.options.blankPage === false) || hasScript(e)));
/** هل يحمل الأسلوب برنامجاً (كوداً)؟ */
export const hasScript = (e) => !!(e && typeof e.script === 'string' && e.script.trim());

/** صور الأسلوب داخل HTML: src="asset(x)" ← الصورة · asset(x) في style ← url(الصورة) */
function htmlAssets(html, images) {
  return String(html)
    .replace(/\b(src|href|xlink:href)\s*=\s*(["'])\s*asset\(\s*([\w-]{1,40})\s*\)\s*\2/gi, (m, attr, q, name) => (images[name] ? `${attr}="${images[name]}"` : ''))
    .replace(/asset\(\s*['"]?([\w-]{1,40})['"]?\s*\)/gi, (m, name) => (images[name] ? `url(${images[name]})` : 'none'));
}

/**
 * كل ما يحتاجه مستند الطباعة من إضافات الأسلوب: الأنماط، قوالب العناصر، الصفحات الخاصة، الخيارات.
 * @returns {{css: string, tpl: object, pages: Array, opts: object, script: string}|null}
 */
export function extrasFor(extras) {
  if (!hasExtras(extras)) return null;
  const e = cleanExtras(extras);
  // خطوط الموقع (المضمّنة والمرفوعة) المذكورة في تنسيق البطاقة أو قوالبها: تُحمَّل في المستند وإن لم تكن من خطوط الإعدادات
  const hay = [e.css, e.script, ...Object.values(e.templates), ...e.pages.map((x) => x.html)].join('\n').toLowerCase();
  const fonts = Object.keys(FONTS).filter((fam) => hay.includes(fam.toLowerCase()));
  return {
    css: extrasCss(e),
    tpl: Object.fromEntries(Object.entries(e.templates).map(([k, v]) => [k, htmlAssets(v, e.images)])),
    pages: e.pages.map((x) => ({ ...x, html: htmlAssets(x.html, e.images) })),
    opts: { ...e.options, fonts },
    script: e.scriptOn && e.script.trim() ? e.script : '',
  };
}

/** CSS الإضافات جاهزاً للإلحاق بمستند الطباعة */
export function extrasCss(extras) {
  const e = cleanExtras(extras);
  if (!e.css.trim() && !Object.keys(e.slots).length) return '';
  const url = (name) => `url("${e.images[name]}")`;
  let css = '';
  if (e.slots.coverBg) css += `.page.cover{background:${url(e.slots.coverBg)} center/100% 100% no-repeat var(--paper, #fff)}.cover-frame,.cover-in{border-color:transparent}\n`;
  if (e.slots.pageBg) css += `.page.content,.page.toc{background:${url(e.slots.pageBg)} center/100% 100% no-repeat var(--paper, #fff)}\n`;
  if (e.slots.h1Ornament) css += `.h1::after{border-top:0;width:auto;height:${e.h1OrnamentMm}mm;margin-top:1.5mm;background:${url(e.slots.h1Ornament)} center/contain no-repeat}\n`;
  if (e.slots.separator) css += `.orn,.cv-orn{color:transparent;font-size:0;line-height:0;height:${e.separatorMm}mm;background:${url(e.slots.separator)} center/contain no-repeat}\n`;
  // في CSS المالك: asset(name) ← صورة من صور الأسلوب
  css += e.css.replace(/asset\(\s*['"]?([a-z0-9_-]{1,40})['"]?\s*\)/gi, (m, name) => (e.images[name] ? url(name) : 'none'));
  return css;
}

/* ------------------------------------------------------------ المخزن */
const STYLE_KEYS = [...Object.keys(cleanSettings({})), 'tocTitle'];
const load = () => {
  const d = readJson(FILE, {});
  return { items: Array.isArray(d.items) ? d.items : [], overrides: d.overrides && typeof d.overrides === 'object' ? d.overrides : {}, order: Array.isArray(d.order) ? d.order : [] };
};

// أسماء قديمة للأساليب المضمّنة (كانت بأسماء دور نشر): أسلوب عدّله المالك وبقي باسمه القديم يأخذ اسمه الجديد
// (والقياسي كان «الورّاق (القياسي)» فصار «ورّاق (القياسي)»)
const OLD_NAMES = new Set(['دار ال' + 'منهاج', 'دار ابن ' + 'حزم', 'دار ' + 'طيبة الخضراء', 'دار ال' + 'ذهبي', 'دار الإمام ال' + 'ذهبي', 'ال' + 'ورّاق (القياسي)']);
function fromPreset(id) {
  const p = PRESETS[id];
  const settings = {};
  for (const k of STYLE_KEYS) if (p[k] !== undefined) settings[k] = JSON.parse(JSON.stringify(p[k]));
  // الإضافات (CSS والصور والقوالب) وتنسيق الطباعة من lib/builtin.js، وما لا يحمله المضمّن فارغ
  const built = BUILTIN_STYLES[id] || {};
  return { id, name: p.name, desc: p.desc, settings: cleanSettings(settings, { partial: true }), extras: cleanExtras(built.extras), print: built.print ? cleanPrint(built.print) : null, hidden: false };
}

export function normalizeStyle(input) {
  const s = input && typeof input === 'object' ? input : {};
  const name = text(s.name, '', 60).trim();
  if (!name) throw httpErr(400, 'اكتب اسم الأسلوب');
  return {
    name,
    desc: text(s.desc, '', 200).trim(),
    hidden: bool(s.hidden, false),
    settings: cleanSettings(s.settings, { partial: true }),
    extras: cleanExtras(s.extras),
    // إعداد طباعة خاص بهذا الأسلوب (null = يتبع إعداد الموقع)
    print: s.print && typeof s.print === 'object' ? cleanPrint(s.print) : null,
  };
}

/** كل الأساليب بترتيب المالك: المضمّنة (بتعديلاتها) ثم ما أضافه */
export function listStyles() {
  const d = load();
  const all = [
    ...Object.keys(PRESETS).map((id) => ({ ...(d.overrides[id] ? { ...fromPreset(id), ...d.overrides[id], ...(OLD_NAMES.has(d.overrides[id].name) ? { name: PRESETS[id].name } : {}), id } : fromPreset(id)), builtin: true, modified: !!d.overrides[id] })),
    ...d.items.map((s) => ({ ...s, builtin: false, modified: false })),
  ];
  const pos = (id) => {
    const i = d.order.indexOf(id);
    // مضمَّنٌ جديد لم يرتّبه المالك بعد يتقدّم على ما سبقه، بترتيبه في PRESETS
    return i < 0 ? (PRESETS[id] ? -1 : 1e6) : i;
  };
  return all.map((s, i) => [s, i]).sort((a, b) => pos(a[0].id) - pos(b[0].id) || a[1] - b[1]).map(([s]) => s);
}

export const getStyle = (id) => listStyles().find((s) => s.id === id) || null;

/** ما يراه المستخدم: الأساليب الظاهرة بإعداداتها، بلا محتوى الإضافات (يطبّقها الخادم عند التنضيد) */
export function publicStyles() {
  const list = listStyles().filter((s) => !s.hidden);
  const use = list.length ? list : listStyles().slice(0, 1);
  return use.map((s) => ({ id: s.id, name: s.name, desc: s.desc, settings: s.settings, builtin: s.builtin, extras: hasExtras(s.extras) }));
}

/** إعداد الطباعة الساري على طلب تنضيد: الخاص بأسلوبه إن حمل واحداً، وإلا إعداد الموقع */
export function resolvePrint(settings) {
  if (settings && settings.printPreset) {
    try {
      return getPrintPreset(settings.printPreset).print;
    } catch {
      /* حُذف التنسيق: يُرجع إلى الأسلوب أو الموقع */
    }
  }
  const st = settings && settings.styleId ? getStyle(settings.styleId) : null;
  return st && st.print ? cleanPrint(st.print) : getPrint();
}

/** إضافات أسلوب محفوظ (للتنضيد والمعاينة) */
export function styleExtras(id) {
  const s = id ? getStyle(id) : null;
  return s ? extrasFor(s.extras) : null;
}

export async function createStyle(input) {
  const st = { id: 's' + crypto.randomBytes(5).toString('hex'), ...normalizeStyle(input), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await updateJson(FILE, {}, (d0) => {
    const d = { items: [], overrides: {}, order: [], ...d0 };
    d.items = [...(d.items || []), st];
    return d;
  });
  return getStyle(st.id);
}

export async function saveStyle(id, input) {
  const cur = getStyle(id);
  if (!cur) throw httpErr(404, 'الأسلوب غير موجود');
  const st = { ...normalizeStyle(input), updatedAt: new Date().toISOString() };
  await updateJson(FILE, {}, (d0) => {
    const d = { items: [], overrides: {}, order: [], ...d0 };
    if (PRESETS[id]) d.overrides = { ...d.overrides, [id]: st };
    else d.items = d.items.map((x) => (x.id === id ? { ...x, ...st } : x));
    return d;
  });
  return getStyle(id);
}

/** حذف أسلوب أضافه المالك، أو إعادة الأسلوب المضمّن إلى أصله */
export async function deleteStyle(id) {
  if (!getStyle(id)) throw httpErr(404, 'الأسلوب غير موجود');
  await updateJson(FILE, {}, (d0) => {
    const d = { items: [], overrides: {}, order: [], ...d0 };
    if (PRESETS[id]) {
      const { [id]: _drop, ...rest } = d.overrides || {};
      d.overrides = rest;
    } else {
      d.items = (d.items || []).filter((x) => x.id !== id);
      d.order = (d.order || []).filter((x) => x !== id);
    }
    return d;
  });
  return { reset: !!PRESETS[id] };
}

export async function orderStyles(ids) {
  const known = new Set(listStyles().map((s) => s.id));
  await updateJson(FILE, {}, (d0) => ({ items: [], overrides: {}, ...d0, order: ids.filter((x) => known.has(x)) }));
}

/* ------------------------------------------------------------ البطاقة */
/** أعلى إصدار بطاقات يفهمه هذا الموقع (يزيد كلما أُضيفت للمحرك قدرة جديدة تحتاجها البطاقات) */
export const CARD_VERSION = 3;
const MAX_CARD_FONTS = 16 * 1024 * 1024;

/** خطوط رفعها المالك ويستعملها هذا الأسلوب (في إعداداته أو في تنسيقه الخاص): تسافر مع البطاقة */
function cardFonts(s) {
  const hay = [JSON.stringify(s.settings.fonts || {}), s.extras.css || '', s.extras.script || '', ...Object.values(s.extras.templates || {}), ...(s.extras.pages || []).map((x) => x.html)].join('\n').toLowerCase();
  const out = [];
  let total = 0;
  for (const f of listFonts()) {
    if (!hay.includes(f.family.toLowerCase())) continue;
    for (const [weight, v] of Object.entries(f.files)) {
      const buf = fs.readFileSync(path.join(FONT_DIR, v.file));
      total += buf.length;
      if (total > MAX_CARD_FONTS) return out; // بطاقة معقولة الحجم: ما زاد يُرفع من تبويب الخطوط
      out.push({ family: f.family, label: f.label || f.family, weight, name: v.original || v.file, data: buf.toString('base64') });
    }
  }
  return out;
}

/**
 * فحص بطاقة قبل تركيبها: ما الذي سيُحذف أو يُتجاهل؟ (ملاحظات تُعرض لصاحبها، وتُعاد لمن كتب البطاقة ليصلحها)
 * @returns {string[]}
 */
export function lintCard(card) {
  const notes = [];
  const x = (card && card.extras) || {};
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const clean = cleanExtras(x);
  const tpls = x.templates && typeof x.templates === 'object' ? x.templates : {};
  for (const k of Object.keys(tpls)) {
    if (!TEMPLATE_KEYS[k]) notes.push(`قالب مجهول يُتجاهل: templates/${k}.html (المعروف: ${Object.keys(TEMPLATE_KEYS).join(' ')})`);
    else if (norm(clean.templates[k]) !== norm(tpls[k])) notes.push(`القالب ${k}: حُذف منه ما لا يُسمح به (سكربت، معالج حدث، رابط خارجي، وسم ممنوع)`);
  }
  const pgs = Array.isArray(x.pages) ? x.pages : [];
  pgs.forEach((p, i) => {
    if (p && p.at && !PAGE_AT[p.at]) notes.push(`صفحة خاصة ${i + 1}: موضع مجهول «${p.at}» فوُضعت بعد الغلاف الداخلي (المعروف: ${Object.keys(PAGE_AT).join(' ')})`);
    if (!p || !norm(p.html)) notes.push(`صفحة خاصة ${i + 1}: فارغة فتُركت`);
  });
  if (clean.pages.length === pgs.filter((p) => p && norm(p.html)).length) {
    let ci = 0;
    pgs.forEach((p, i) => {
      if (!p || !norm(p.html)) return;
      if (norm(clean.pages[ci].html) !== norm(p.html)) notes.push(`صفحة خاصة ${i + 1}: حُذف منها ما لا يُسمح به`);
      ci++;
    });
  }
  if (norm(clean.css) !== norm(x.css)) notes.push('style.css: حُذف منه ما لا يُسمح به (@import، رابط خارجي url(…)، وسم)');
  const imgs = x.images && typeof x.images === 'object' ? x.images : {};
  for (const k of Object.keys(imgs)) if (!clean.images[k]) notes.push(`الصورة ${k}: مرفوضة (اسم غير صالح، أو صيغة غير مقبولة، أو SVG فيها سكربت)`);
  const all = [x.css, x.script, ...Object.values(tpls), ...pgs.map((p) => (p && p.html) || '')].join('\n');
  for (const m of all.matchAll(/asset\(\s*['"]?([\w-]+)['"]?\s*\)/g)) if (!clean.images[m[1]]) notes.push(`صورة غير موجودة: asset(${m[1]})`);
  for (const k of Object.keys((x.slots && typeof x.slots === 'object' && x.slots) || {})) {
    if (!SLOTS[k]) notes.push(`خانة مجهولة تُتجاهل: slots.${k} (المعروف: ${Object.keys(SLOTS).join(' ')})`);
    else if (!clean.slots[k]) notes.push(`الخانة ${k}: صورتها «${x.slots[k]}» غير موجودة`);
  }
  const st = card && card.settings && typeof card.settings === 'object' ? card.settings : {};
  lintSettings(st, 'settings', notes);
  // ما يخص كل نوعٍ في الأسلوب الشامل: يُفحص كما تُفحص الإعدادات
  if (st.forKind && typeof st.forKind === 'object' && !Array.isArray(st.forKind)) {
    for (const [k, v] of Object.entries(st.forKind)) {
      if (!['books', 'research', 'mutun'].includes(k)) notes.push(`نوعٌ مجهول يُتجاهل: settings.forKind.${k} (المعروف: books research mutun)`);
      else if (v && typeof v === 'object' && !Array.isArray(v)) lintSettings(v, `settings.forKind.${k}`, notes);
    }
  }
  // إعداد الطباعة الخاص بالبطاقة: أنواع الصفحات المعروفة فقط
  const pr = card && card.print;
  if (pr !== undefined && pr !== null) {
    if (typeof pr !== 'object' || Array.isArray(pr)) notes.push('print: يجب أن يكون كائناً { } فتُرك (يتبع الأسلوب إعداد الموقع)');
    else {
      for (const where of ['front', 'back']) {
        const allowed = where === 'front' ? Object.keys(PAGE_TYPES) : ['blank', 'text', 'image'];
        (Array.isArray(pr[where]) ? pr[where] : []).forEach((x, i) => {
          const t = x && typeof x === 'object' ? x.type : x;
          if (!allowed.includes(t)) notes.push(`print.${where}[${i + 1}]: نوع صفحة مجهول «${String(t).slice(0, 20)}» فتُركت (المعروف: ${allowed.join(' ')})`);
          else if (t === 'image' && !/^data:image\/(png|jpeg);base64,/.test(String(x.src || ''))) notes.push(`print.${where}[${i + 1}]: صفحة صورة بلا صورة صالحة (PNG أو JPEG مضمّنة)`);
        });
      }
      if (Array.isArray(pr.front) && !pr.front.some((x) => (x && typeof x === 'object' ? x.type : x) === 'cover')) notes.push('print.front: لا غلاف داخلي فيه، فأُضيف آخر التسلسل');
      for (const k of Object.keys(pr)) if (!['front', 'back', 'half', 'basmala', 'numbering', 'gutterMm', 'padTo'].includes(k)) notes.push(`إعداد طباعة مجهول يُتجاهل: print.${k}`);
    }
  }
  // (خطّا البحوث من خطوط ويندوز: يعرفهما البرنامج وإن لم يكونا من خطوطه المضمّنة)
  const own = (fam) => fam === RESEARCH_FONT || fam === 'Times New Roman' || (Array.isArray(card.fonts) && card.fonts.some((f) => f && f.family === fam));
  const fontsAt = [['settings', st], ...Object.entries((st.forKind && typeof st.forKind === 'object' && st.forKind) || {}).map(([k, v]) => [`settings.forKind.${k}`, v || {}])];
  for (const [at, x] of fontsAt) {
    if (x.fonts && typeof x.fonts === 'object') {
      for (const [k, fam] of Object.entries(x.fonts)) if (typeof fam === 'string' && fam && !FONTS[fam] && !own(fam)) notes.push(`الخط «${fam}» (${at}.fonts.${k}) ليس من خطوط الموقع: ارفعه من «الخطوط» أو اختر غيره`);
    }
  }
  return [...new Set(notes)];
}

/** فحص إعدادات (الأسلوب نفسه، أو ما يخص نوعاً منه في forKind): ما يُتجاهل، وما تُرك من قيمه */
function lintSettings(st, at, notes) {
  const known = cleanSettings(st, { partial: true });
  for (const k of Object.keys(st)) {
    if (k === 'forKind') continue;
    if (!(k in known)) notes.push(`إعداد مجهول يُتجاهل: ${at}.${k}`);
    else if (k === 'design') {
      // أجزاء التصميم الجاهزة: مجموعة معروفة وشكل من أشكالها
      for (const [g, v] of Object.entries(st.design && typeof st.design === 'object' && !Array.isArray(st.design) ? st.design : {})) {
        if (!DESIGN_PARTS[g]) notes.push(`جزء تصميم مجهول يُتجاهل: ${at}.design.${g} (المعروف: ${Object.keys(DESIGN_PARTS).join(' ')})`);
        else if (!Object.prototype.hasOwnProperty.call(DESIGN_PARTS[g].opts, String(v))) notes.push(`${at}.design.${g}: الشكل «${String(v).slice(0, 20)}» غير معروف فتُرك الأصل (المعروف: ${Object.keys(DESIGN_PARTS[g].opts).join(' ')})`);
      }
    } else if (k === 'mutunLook') {
      // شكل المتون: مفاتيح m… بقيمها المقبولة (ومدى المتن ونوعه لكل كتابٍ وحده)
      const v = st.mutunLook && typeof st.mutunLook === 'object' && !Array.isArray(st.mutunLook) ? st.mutunLook : {};
      const got = known.mutunLook || {};
      for (const kk of Object.keys(v)) {
        if (kk === 'mRange' || kk === 'mKind') notes.push(`${at}.mutunLook.${kk}: لكل كتابٍ وحده (يختاره المستخدم) فلا يحمله الأسلوب`);
        else if (!MUTUN_KEYS.includes(kk)) notes.push(`إعداد مجهول يُتجاهل: ${at}.mutunLook.${kk} (المعروف: ${MUTUN_KEYS.filter((x) => x !== 'mRange' && x !== 'mKind').join(' ')})`);
        else if (!(kk in got)) notes.push(`${at}.mutunLook.${kk}: «${String(JSON.stringify(v[kk])).slice(0, 30)}» لكل كتابٍ وحده فيُترك (اختيار المستخدم)`);
        else if (kk === 'mOwner') {
          const o = v.mOwner && typeof v.mOwner === 'object' ? v.mOwner : {};
          if (o.on === true && !got.mOwner.on) notes.push(`${at}.mutunLook.mOwner: لا خانة فيها نصٌّ فأُطفئت`);
          for (const [i, f] of (Array.isArray(o.fields) ? o.fields : []).entries()) if (f && f.f !== undefined && !['line', 'dots', 'blank'].includes(f.f)) notes.push(`${at}.mutunLook.mOwner.fields[${i + 1}].f: «${String(f.f).slice(0, 20)}» غير معروف فأُخذ «dots» (المعروف: line dots blank)`);
          if (Array.isArray(o.fields) && o.fields.length > 8) notes.push(`${at}.mutunLook.mOwner: أكثر من ٨ خانات فأُخذت الثماني الأولى`);
        } else if (typeof v[kk] !== 'object' && String(got[kk]) !== String(v[kk])) notes.push(`${at}.mutunLook.${kk}: القيمة «${String(v[kk]).slice(0, 30)}» غير مقبولة فأُخذ «${got[kk]}»`);
      }
    } else if (st[k] && typeof st[k] === 'object' && !Array.isArray(st[k])) {
      for (const kk of Object.keys(st[k])) if (!(kk in (known[k] || {}))) notes.push(`إعداد مجهول يُتجاهل: ${at}.${k}.${kk}`);
    } else if (typeof st[k] !== 'object' && JSON.stringify(known[k]) !== JSON.stringify(st[k]) && String(known[k]).toLowerCase() !== String(st[k]).toLowerCase()) {
      notes.push(`الإعداد ${at}.${k}: القيمة «${String(st[k]).slice(0, 30)}» غير مقبولة فأُخذ «${known[k]}»`);
    }
  }
}

/* ------------------------------------------------------------ أساليب المستخدم (في متصفحه) */
// أسلوب يصنعه المستخدم أو يركّبه من بطاقة يُحفظ في متصفحه، ويأتي مع كل طلب تنضيد أو معاينة: إعداداته وإضافاته
// (صور، CSS، قوالب، صفحات خاصة) وإعداد طباعته وخطوطه. تُنقّى كلها هنا كما تُنقّى بطاقات المالك،
// إلا البرنامج (الكود): لا يعمل في أسلوب مستخدم (لا يعمل كودٌ في الخادم إلا ما وافق عليه المالك).
const MAX_USER_FONTS = 16 * 1024 * 1024;
/** خطوط أسلوب المستخدم: ملفات خطوط حقيقية فقط (يُفحص رأسها)، بأسماء آمنة */
export function cleanUserFonts(list) {
  const out = [];
  let total = 0;
  for (const f of (Array.isArray(list) ? list : []).slice(0, 12)) {
    if (!f || typeof f.data !== 'string' || typeof f.family !== 'string') continue;
    const family = f.family.replace(/["'\\<>{};()\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!family) continue;
    let buf;
    try {
      buf = Buffer.from(f.data, 'base64');
    } catch {
      continue;
    }
    const info = inspectFont(buf);
    if (!info) continue;
    total += buf.length;
    if (total > MAX_USER_FONTS) break;
    out.push({ family, label: text(f.label, family, 60) || family, weight: ['400', '700', 'all'].includes(String(f.weight)) ? String(f.weight) : '400', name: text(f.name, '', 80), ext: info.ext, data: buf.toString('base64') });
  }
  return out;
}
function userFontCss(fonts) {
  const FMT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
  return cleanUserFonts(fonts)
    .map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight === 'all' ? '100 900' : f.weight};font-style:normal;font-display:block;src:url(data:font/${f.ext};base64,${f.data}) format('${FMT[f.ext]}');}`)
    .join('\n');
}
/** إضافات أسلوب أصله من الموقع (baseId) وفوقها إضافات المستخدم: الصور والخانات والقوالب تغلب، والتنسيق والصفحات تُضاف */
function mergeExtras(a, b) {
  return {
    ...a,
    css: [a.css, b.css].filter((x) => x && x.trim()).join('\n'),
    images: { ...a.images, ...b.images },
    slots: { ...a.slots, ...b.slots },
    templates: { ...a.templates, ...b.templates },
    pages: [...a.pages, ...b.pages],
    options: b.options,
    h1OrnamentMm: b.h1OrnamentMm,
    separatorMm: b.separatorMm,
  };
}
/**
 * إضافات التنضيد لأسلوب مستخدم: إضافات أصله (أسلوب الموقع) ثم إضافاته هو (بلا كود)، وخطوطه.
 * @returns {object|null} بصيغة extrasFor
 */
export function userExtras({ baseId = '', extras = null, fonts = null } = {}) {
  const base = baseId ? getStyle(baseId) : null;
  const own = extras && typeof extras === 'object' ? { ...cleanExtras(extras), script: '' } : null;
  let merged = base ? cleanExtras(base.extras) : null;
  if (own) merged = merged ? mergeExtras(merged, own) : own;
  const x = merged ? extrasFor(merged) : null;
  const fcss = userFontCss(fonts);
  if (!fcss) return x;
  return x ? { ...x, css: fcss + '\n' + x.css } : { css: fcss, tpl: {}, pages: [], opts: { fonts: [] }, script: '' };
}
/**
 * فحص بطاقة يركّبها المستخدم في متصفحه: تُنقّى، ويُعاد أسلوبها جاهزاً للحفظ عنده، مع ملاحظات الموقع عليها.
 * الكود لا يدخل (يُذكر ذلك في الملاحظات)، والخطوط تبقى مع الأسلوب (لا تدخل مكتبة الموقع).
 */
export function checkUserCard(card) {
  if (!card || typeof card !== 'object' || card.format !== STYLE_FORMAT) throw httpErr(415, 'هذا الملف ليس بطاقة أسلوب للورّاق');
  if (Number(card.version) > CARD_VERSION) throw httpErr(415, 'هذه البطاقة تحتاج إصداراً أحدث من الموقع');
  const name = text(card.name, '', 60).trim() || 'أسلوب من بطاقة';
  const droppedScript = hasScript(card.extras);
  const notes = lintCard(card).filter((n) => !/ليس من خطوط الموقع/.test(n) || !(Array.isArray(card.fonts) && card.fonts.length));
  if (droppedScript) notes.unshift('البطاقة تحمل برنامجاً (كوداً) يتحكم في التنضيد: لا يعمل في أساليبك الخاصة، وما سواه يعمل. يعمل البرنامج حين يركّب صاحب الموقع البطاقة في «أساليب دور النشر».');
  const extras = { ...cleanExtras(card.extras), script: '' };
  const base = typeof card.base === 'string' && /^[\w-]{1,40}$/.test(card.base) && getStyle(card.base) ? card.base : '';
  return {
    style: {
      name,
      desc: text(card.desc, '', 200).trim(),
      base,
      settings: cleanSettings(card.settings, { partial: true }),
      extras,
      print: card.print && typeof card.print === 'object' ? cleanPrint(card.print) : null,
      fonts: cleanUserFonts(card.fonts),
    },
    notes: [...new Set(notes)],
    droppedScript,
  };
}

/** محتوى «بطاقة الأسلوب» للتصدير */
export function styleCard(id) {
  const s = getStyle(id);
  if (!s) throw httpErr(404, 'الأسلوب غير موجود');
  const fonts = cardFonts(s);
  // أدنى إصدار يكفي البطاقة: بلا كود تُقبل في المواقع الأقدم أيضاً
  return { format: STYLE_FORMAT, version: hasScript(s.extras) ? CARD_VERSION : 2, name: s.name, desc: s.desc, settings: s.settings, extras: s.extras, ...(s.print ? { print: s.print } : {}), ...(fonts.length ? { fonts } : {}), exportedAt: new Date().toISOString() };
}

/**
 * تركيب بطاقة أسلوب: تُنقّى ثم تصير أسلوباً جديداً قابلاً للتعديل.
 * خطوط البطاقة تدخل مكتبة خطوط الموقع (إن لم تكن فيها)، فتعمل في الكتاب والغلاف كأي خط مرفوع.
 */
export async function importCard(card, { allowScript = false } = {}) {
  if (!card || typeof card !== 'object' || card.format !== STYLE_FORMAT) throw httpErr(415, 'هذا الملف ليس بطاقة أسلوب للورّاق');
  if (Number(card.version) > CARD_VERSION) throw httpErr(415, 'هذه البطاقة تحتاج إصداراً أحدث من الموقع: حدّث الموقع ثم ركّبها');
  // بطاقة تحمل كوداً لا تُركَّب إلا بموافقة صريحة من المالك
  if (hasScript(card.extras) && !allowScript) throw Object.assign(httpErr(409, 'هذه البطاقة تحمل برنامجاً (كوداً) يتحكم في التنضيد. ركّبها إن كنت تثق بمصدرها.'), { code: 'script-consent' });
  const fonts = [];
  for (const f of (Array.isArray(card.fonts) ? card.fonts : []).slice(0, 12)) {
    if (!f || typeof f.data !== 'string' || typeof f.family !== 'string') continue;
    const fam = f.family.trim();
    const w = ['400', '700', 'all'].includes(String(f.weight)) ? String(f.weight) : '400';
    // خط مضمّن في الموقع أو مرفوع من قبل بالوزن نفسه: يبقى ما في الموقع
    if (Object.keys(FONTS).some((k) => !FONTS[k].uploaded && k.toLowerCase() === fam.toLowerCase())) continue;
    const have = listFonts().find((x) => x.family.toLowerCase() === fam.toLowerCase());
    if (have && (have.files[w] || have.files.all)) continue;
    await addFontFile({ family: fam, label: f.label, weight: w, data: f.data, name: f.name });
    fonts.push(fam);
  }
  const notes = lintCard(card);
  const st = await createStyle({ name: card.name, desc: card.desc, settings: card.settings, extras: card.extras, print: card.print, hidden: false });
  return { ...st, installedFonts: [...new Set(fonts)], notes };
}
