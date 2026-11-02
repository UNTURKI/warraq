// إعدادات الطباعة («النسخة الجاهزة للطباعة»): يخصصها المالك كاملةً من «أساليب دور النشر».
//   · تسلسل الصفحات قبل الكتاب وبعده: بيضاء، عنوان مختصر، غلاف داخلي، بسملة، صفحة نص حر، صفحة صورة — تُضاف وتُحذف وتُرتَّب
//   · صفحة العنوان المختصر: موضعها ومقاساتها وألوانها · صفحة البسملة: عرضها وموضعها ولونها
//   · الترقيم (تُحسب صفحات ما قبل الكتاب أم يبدأ الكتاب من ١) · هامش التجليد · إتمام عدد الصفحات إلى مضاعف
// للموقع إعداد عام (data/print.json)، ولأي أسلوب أن يحمل إعداداً خاصاً به (style.print) يسافر مع بطاقته.
import { readJson, updateJson } from './store.js';

const FILE = 'print.json';
const httpErr = (status, message) => Object.assign(new Error(message), { status });

export const PAGE_TYPES = {
  blank: 'صفحة بيضاء',
  half: 'العنوان المختصر',
  cover: 'الغلاف الداخلي',
  basmala: 'البسملة',
  text: 'صفحة نص',
  image: 'صفحة صورة',
};
const FRONT_TYPES = ['blank', 'half', 'cover', 'basmala', 'text', 'image'];
const BACK_TYPES = ['blank', 'text', 'image'];
export const HALF_POS = { bl: 'أسفل اليسار', br: 'أسفل اليمين', tl: 'أعلى اليسار', tr: 'أعلى اليمين', c: 'وسط الصفحة' };
export const PAD_TO = [0, 2, 4, 8, 16, 32];
const MAX_FRONT = 24;
const MAX_BACK = 12;
const MAX_IMAGES = 8 * 1024 * 1024;
const IMG_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

const HEX = /^#[0-9a-f]{6}$/i;
const hexOrEmpty = (v) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : '');
const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// نص الصفحة الحرة: يُكتب في المستند نصاً (لا HTML)، فيكفي حذف رموز التحكم
/** خط جزء من النص: دور من أدوار الأسلوب (heading body cover names) أو اسم خط من خطوط الموقع */
const fontOf = (v, d) => (typeof v === 'string' && v.trim() ? v.replace(/[<>{}\\"'`;,\u0000-\u001f]/g, '').trim().slice(0, 60) || d : d);
const freeText = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').slice(0, 3000) : '');

/** التسلسل الأصلي كما طُلب أول مرة: بيضاء، عنوان مختصر، بيضاء، غلاف داخلي، بيضاء، بسملة، بيضاء، ثم الكتاب */
export const PRINT_DEFAULT = Object.freeze({
  front: [{ type: 'blank' }, { type: 'half' }, { type: 'blank' }, { type: 'cover' }, { type: 'blank' }, { type: 'basmala' }, { type: 'blank' }],
  back: [],
  half: { pos: 'bl', titlePt: 24, subPt: 17, showSub: true, showAuthor: false, color: '', subColor: '' },
  basmala: { widthPct: 62, yPct: 44, color: '' },
  numbering: 'count',
  gutterMm: 0,
  padTo: 0,
});

function cleanItem(x, types, budget) {
  const type = x && typeof x === 'object' ? x.type : x;
  if (!types.includes(type)) return null;
  if (type === 'text') {
    // صفحة نص: فقرات، ولكل فقرة محاذاتها، ولكل جزء من نصها حجمه وخطه وكونه عريضاً ولونه (كأنها تُكتب في Word)
    // ومن فقراتها الصور: { align, img: { src, w, h }, widthPct, free: null | { xPct, yPct }, layer: 'front' | 'behind' }
    const dflt = { sizePt: num(x.sizePt, 18, 8, 72), font: fontOf(x.font, 'heading'), b: bool(x.bold, true), color: hexOrEmpty(x.color) };
    const run = (r) => ({ t: freeText(r && r.t).replace(/\n/g, ' '), b: bool(r && r.b, dflt.b), sizePt: num(r && r.sizePt, dflt.sizePt, 8, 72), font: fontOf(r && r.font, dflt.font), color: r && r.color !== undefined ? hexOrEmpty(r.color) : dflt.color });
    const ALIGN = ['center', 'start', 'end', 'justify'];
    let paras;
    if (Array.isArray(x.paras)) {
      let images = 0;
      paras = x.paras
        .slice(0, 80)
        .map((p) => {
          // فقرة صورة: في سطرها بين الفقرات (عرضها من عرض النص)، أو حرّة في موضع من الصفحة (عرضها من عرض الصفحة)
          if (p && p.img && typeof p.img === 'object') {
            const src = typeof p.img.src === 'string' && IMG_RE.test(p.img.src) ? p.img.src : '';
            const w = Math.round(Number(p.img.w));
            const h = Math.round(Number(p.img.h));
            if (!src || !(w > 0 && h > 0 && w <= 8000 && h <= 8000) || ++images > 8) return null;
            budget.used += src.length;
            if (budget.used > MAX_IMAGES) throw httpErr(413, 'صور صفحات الطباعة أكبر من المسموح (٦ م.ب)');
            const fr = p.free && typeof p.free === 'object' ? { xPct: num(p.free.xPct, 50, 0, 100), yPct: num(p.free.yPct, 50, 0, 100) } : null;
            // layer: الحرّة أمام النص (الأصل) أو خلفه
            return { align: oneOf(p.align, ['center', 'start', 'end'], 'center'), img: { src, w, h }, widthPct: num(p.widthPct, 40, 5, 100), free: fr, ...(fr ? { layer: p.layer === 'behind' ? 'behind' : 'front' } : {}), runs: [] };
          }
          return { align: oneOf(p && p.align, ALIGN, 'center'), runs: (Array.isArray(p && p.runs) ? p.runs : []).slice(0, 40).map(run) };
        })
        .filter(Boolean);
    } else {
      // الصيغة الأولى: نص واحد بتنسيق واحد، كل سطر فقرة
      const align = oneOf(x.align, ALIGN, 'center');
      paras = freeText(x.text).split('\n').slice(0, 80).map((line) => ({ align, runs: [run({ t: line })] }));
    }
    // حد لطول النص كله، وفقرة بلا أجزاء تحفظ تنسيق سطرها الفارغ
    let left = 6000;
    for (const p of paras) {
      for (const r of p.runs) {
        r.t = r.t.slice(0, Math.max(left, 0));
        left -= r.t.length;
      }
      if (!p.runs.length && !p.img) p.runs.push(run({ t: '' }));
    }
    if (!paras.length) paras = [{ align: 'center', runs: [run({ t: '' })] }];
    return { type, v: oneOf(x.v, ['top', 'middle', 'bottom'], 'middle'), lineHeight: num(x.lineHeight, 1.75, 1, 3), paras };
  }
  if (type === 'image') {
    const src = typeof x.src === 'string' && IMG_RE.test(x.src) ? x.src : '';
    const w = Math.round(Number(x.w));
    const h = Math.round(Number(x.h));
    if (src) {
      budget.used += src.length;
      if (budget.used > MAX_IMAGES) throw httpErr(413, 'صور صفحات الطباعة أكبر من المسموح (٦ م.ب)');
    }
    return {
      type,
      src: src && w > 0 && h > 0 && w <= 8000 && h <= 8000 ? src : '',
      w: src ? w : 0,
      h: src ? h : 0,
      fit: oneOf(x.fit, ['contain', 'page'], 'contain'),
      widthPct: num(x.widthPct, 60, 10, 100),
      yPct: num(x.yPct, 50, 10, 90),
    };
  }
  return { type };
}

/**
 * تنقية إعداد الطباعة: مفاتيح معروفة وقيم مقبولة، وغلاف داخلي واحد دائماً في ما قبل الكتاب.
 * يُرجع إعداداً كاملاً صالحاً مهما كان المدخل.
 */
export function cleanPrint(input) {
  const p = input && typeof input === 'object' ? input : {};
  const D = PRINT_DEFAULT;
  const budget = { used: 0 };
  let front = (Array.isArray(p.front) ? p.front : D.front).slice(0, MAX_FRONT).map((x) => cleanItem(x, FRONT_TYPES, budget)).filter(Boolean);
  // غلاف داخلي واحد: الأول يبقى، وإن غاب أُضيف آخر التسلسل (قبل الكتاب مباشرة)
  let seen = false;
  front = front.filter((x) => (x.type !== 'cover' ? true : seen ? false : (seen = true)));
  if (!seen) front.push({ type: 'cover' });
  const back = (Array.isArray(p.back) ? p.back : D.back).slice(0, MAX_BACK).map((x) => cleanItem(x, BACK_TYPES, budget)).filter(Boolean);
  const h = p.half && typeof p.half === 'object' ? p.half : {};
  const b = p.basmala && typeof p.basmala === 'object' ? p.basmala : {};
  return {
    front,
    back,
    half: {
      pos: oneOf(h.pos, Object.keys(HALF_POS), D.half.pos),
      titlePt: num(h.titlePt, D.half.titlePt, 10, 72),
      subPt: num(h.subPt, D.half.subPt, 8, 48),
      showSub: bool(h.showSub, D.half.showSub),
      showAuthor: bool(h.showAuthor, D.half.showAuthor),
      color: hexOrEmpty(h.color),
      subColor: hexOrEmpty(h.subColor),
    },
    basmala: { widthPct: num(b.widthPct, D.basmala.widthPct, 20, 100), yPct: num(b.yPct, D.basmala.yPct, 15, 85), color: hexOrEmpty(b.color) },
    numbering: oneOf(p.numbering, ['count', 'book'], D.numbering),
    gutterMm: num(p.gutterMm, D.gutterMm, 0, 25),
    padTo: oneOf(Number(p.padTo), PAD_TO, D.padTo),
  };
}

/** إعداد الموقع العام (الأصلي إن لم يُخصَّص) */
export const getPrint = () => cleanPrint(readJson(FILE, null));
/** هل الإعداد هو الأصلي بلا تخصيص؟ */
export const isDefaultPrint = (p) => JSON.stringify(cleanPrint(p)) === JSON.stringify(cleanPrint(null));

export async function setPrint(input) {
  const clean = cleanPrint(input);
  await updateJson(FILE, {}, () => ({ ...clean, updatedAt: new Date().toISOString() }));
  return getPrint();
}

/** إعادة إعداد الموقع إلى الأصل */
export async function resetPrint() {
  await updateJson(FILE, {}, () => ({ ...cleanPrint(null), updatedAt: new Date().toISOString() }));
  return getPrint();
}

/** هل في التسلسل صفحة بسملة؟ (ليُعرض اختيار صورتها للمستخدم) */
/** نص صفحة نص (أسطرها) — لعرضه مختصراً وللبحث فيه */
export const textOf = (item) => (item && Array.isArray(item.paras) ? item.paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n') : '');
/** الخطوط المسمّاة (غير أدوار الأسلوب) في صفحات النص: لتُحمَّل في مستند الطباعة */
export const textFonts = (print) => [...new Set([...(print.front || []), ...(print.back || [])].filter((x) => x.type === 'text').flatMap((x) => x.paras.flatMap((p) => p.runs.map((r) => r.font))).filter((f) => !['heading', 'body', 'cover', 'names'].includes(f)))];

export const hasBasmalaPage = (print) => !!print && Array.isArray(print.front) && [...print.front, ...(print.back || [])].some((x) => x.type === 'basmala');

/** وصف مختصر للتسلسل (للواجهات): أنواع الصفحات بالترتيب */
export const printSummary = (print) => ({ front: print.front.map((x) => x.type), back: print.back.map((x) => x.type), numbering: print.numbering, gutterMm: print.gutterMm, padTo: print.padTo });

/* ---------------- التنسيقات المحفوظة: إعدادات طباعة بأسمائها، تُعمَّم للموقع أو تُربط بأسلوب، وتُنزَّل ملفاً ---------------- */
const PRESETS_FILE = 'print-presets.json';
export const MAX_PRINT_PRESETS = 30;
const perr = (status, message) => Object.assign(new Error(message), { status });
const loadPresets = () => {
  const d = readJson(PRESETS_FILE, { items: [] });
  return (Array.isArray(d.items) ? d.items : []).filter((x) => x && typeof x.id === 'string' && x.print && typeof x.print === 'object');
};
const brief = (x) => ({ id: x.id, name: x.name, createdAt: x.createdAt || null, summary: printSummary(cleanPrint(x.print)) });
export const listPrintPresets = () => loadPresets().map(brief);
export function getPrintPreset(id) {
  const x = loadPresets().find((p) => p.id === String(id));
  if (!x) throw perr(404, 'التنسيق غير موجود');
  return { id: x.id, name: x.name, print: cleanPrint(x.print) };
}
/** حفظ تنسيق باسمه. يُقبل ملف التنسيق المنزَّل كما هو: { format: 'warraq-print', name, print } */
export async function addPrintPreset(input) {
  const b = input && typeof input === 'object' ? input : {};
  const src = b.print && typeof b.print === 'object' ? b.print : null;
  if (!src || !Array.isArray(src.front)) throw perr(400, 'هذا ليس تنسيق طباعة: لا تسلسل صفحات فيه');
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) throw perr(400, 'اكتب اسم التنسيق');
  const print = cleanPrint(src);
  let item = null;
  await updateJson(PRESETS_FILE, { items: [] }, (d) => {
    const items = Array.isArray(d.items) ? d.items : [];
    if (items.length >= MAX_PRINT_PRESETS) throw perr(409, `بلغت التنسيقات المحفوظة الحد (${MAX_PRINT_PRESETS}): احذف واحداً ثم احفظ`);
    let n = items.length + 1;
    while (items.some((x) => x.id === 'pp' + n)) n++;
    item = { id: 'pp' + n, name, print, createdAt: new Date().toISOString() };
    return { items: [...items, item] };
  });
  return brief(item);
}
export async function deletePrintPreset(id) {
  await updateJson(PRESETS_FILE, { items: [] }, (d) => ({ items: (Array.isArray(d.items) ? d.items : []).filter((x) => x.id !== String(id)) }));
  return listPrintPresets();
}
