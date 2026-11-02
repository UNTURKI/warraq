// «المتون»: المتن وموضعٌ للتعليق عليه (لا إخراج المتن وحده: ذلك من «الكتب»).
// يُركَّب المتن كما في الكتب (بقالبه وأسلوبه)، ثم:
//   ١) نوعه: نظمٌ أو نثر (يُعرف من نصه، ويختاره المستخدم) — وبه تكون خيارات النطاق والتقسيم والأرقام،
//   ٢) يُؤخذ منه ما اختير: كله، أو من بابٍ إلى باب، أو من بيتٍ إلى بيت (النظم)، أو من فقرةٍ إلى فقرة (النثر)،
//   ٣) يُقسَّم أجزاءً: بالأبواب والفصول، أو بعدد الأبيات (النظم)، أو بعدد الأسطر أو الفقرات (النثر)؛
//      وما حدّده المستخدم في «المحرِّر» يعلو ذلك: جزءٌ يبدأ هنا (cut)، أو لا ينقطع قبله (join)،
//   ٤) ولكل جزءٍ موضعٌ للتعليق: صفحةٌ (أو صفحات) تقابله، أو تحته بعد فاصل، أو هامشٌ بجانبه، أو لا شيء —
//      للكتاب كله من الإعدادات، ولفصلٍ أو جزءٍ بعينه من «المحرِّر» (sec / c على القطعة)، ومعه عنوانه ورؤوس مسائل إن شاء،
//   ٥) وأبيات المنظومة بأرقامها فيها (البيت ٩٠ يبقى ٩٠ وإن بدأ المقطع منه)، وبعدٍّ متسلسل يبدأ من رقمٍ يُختار:
//      كلٌّ في خانة صغيرة على يمين البيت، أو أحدهما بين الشطرين.
// ويُفهم ملف المتن (Word أو PDF) المهيّأ للتعليق: صفحاته الفارغة أو المسطّرة، وعنوانها المتكرر، وتقسيمه — فيُضبط ذلك كله منه.
import { pageGeom } from './margin.js';

/** الإعدادات وقيمها الأصلية */
export const MUTUN_DEFAULTS = {
  mKind: 'auto', // نوع المتن: auto · poem (نظم) · prose (نثر)
  mStrip: true, // ترقيم الملف (رقم البيت وما بعده من شرطةٍ أو نقطة) يُحذف، ويُرقَّم المتن بأرقام ورّاق (ورقم البيت في الملف يبقى رقمه)
  mDivide: 'auto', // auto · heads · lines · paras · verses · manual (ثابت: كما حُدّد، لا يعيد ورّاق تقسيمه)
  mHead: 2, // في التقسيم بالأبواب: ما كان مستواه هذا فما فوقه يبدأ جزءاً (١ الأبواب، ٢ والفصول، ٤ كل عنوان)
  mCount: 5, // عدد الأسطر أو الفقرات أو الأبيات في الجزء
  mPlace: 'page', // page: صفحةٌ تقابل المتن · below: تحت المتن بعد فاصل · side: هامشٌ بجانبه · none: بلا موضع تعليق (المتن وحده كما في ملفه)
  mSide: 'right', // جهة المتن: right (والتعليق يساراً) · left (العكس) · free: بلا تقابل
  mCenter: false, // المتن في وسط صفحته (في المقابلة)
  mLead: 0, // تباعد سطور المتن (٠: كالأسلوب)
  mPages: 1, // صفحات التعليق لكل جزء (في المقابلة)
  mBelow: 0, // تحت المتن: ٠ ما بقي من الصفحة، أو عدد السطور
  mSideW: 42, // الهامش بجانب المتن: عرضه من منطقة النص (٪)
  mLabel: 'التعليقات', // عنوان موضع التعليق ('' بلا عنوان)
  mLabelAl: 'c', // موضعه: r يمين · c وسط · l يسار
  mLabelFont: '', // خطه ('' خط العناوين)
  mLabelSize: 0, // مقاسه بالنقطة (٠ تلقائي)
  mLabelColor: '', // لونه ('' لون الفصل)
  mLabelDeco: 'plain', // زينته: plain · rule (خطٌّ تحته) · frame (إطار) · band (شريط) · orn (زخرفة)
  mLabelBold: true,
  mIntro: '', // نصٌّ قبل المتن (بعد الباب إن كان): «قال الناظم رحمه الله:» ('' بلا نص)
  mIntroAt: 'first', // first: أول المتن وحده · heads: بعد كل بابٍ وفصل · units: أول كل جزء
  mIntroAl: 'r', // r يمين · c وسط · l يسار
  mIntroFont: '',
  mIntroSize: 0,
  mIntroColor: '',
  mIntroDeco: 'plain', // plain · rule · frame · band · orn
  mIntroBold: true,
  mRule: 'lines', // blank · dots · lines · grid
  mRuleColor: '#B7AC98',
  mGap: 8, // ما بين سطور التعليق (مم)
  mNum: 'side', // رقم البيت في المنظومة: off · side (خانة يمين البيت) · mid (بين الشطرين)
  mSeq: 'off', // العدّ المتسلسل: off · side · mid
  mSeqFrom: 1, // يبدأ العدّ المتسلسل من
  mBelowLines: 8, // في Word: سطور التعليق تحت المتن حين يكون «ما بقي من الصفحة»
  mRange: { mode: 'all' }, // all · heads {from:{t,n}, to:{t,n}} · verses {from, to (0 = إلى آخرها)} · paras {from, to}
  // خانات صاحب النسخة أسفل الغلاف الداخلي (للمعاهد: يكتب الطالب اسمه ورقمه في نسخته):
  // on: تظهر · fields: [{ t: نص الخانة، f: ما بعدها line (خط) · dots (نقاط) · blank (فارغ) }]
  mOwner: { on: false, fields: [{ t: 'الاسم', f: 'dots' }, { t: 'رقم الهاتف', f: 'dots' }] },
};
export const MUTUN_KEYS = Object.keys(MUTUN_DEFAULTS);
/** ما بعد نص الخانة في الغلاف الداخلي: خطٌّ يُكتب عليه، أو نقاط، أو فراغ */
export const OWNER_FILLS = ['line', 'dots', 'blank'];
export const OWNER_MAX = 8;
/** خانات صاحب النسخة: نصوصها (بلا فارغ) وما بعد كلٍّ منها */
export function cleanOwner(v) {
  const x = v && typeof v === 'object' ? v : {};
  const list = Array.isArray(x.fields) ? x.fields : MUTUN_DEFAULTS.mOwner.fields;
  const fields = list
    .map((f) => (f && typeof f === 'object' ? { t: txt(String(f.t || ''), 40), f: ONE(f.f, OWNER_FILLS, 'dots') } : null))
    .filter((f) => f && f.t)
    .slice(0, OWNER_MAX);
  return { on: x.on === true && fields.length > 0, fields };
}
/** حدود ما يُختار (للوحات) */
export const MUTUN_LIMITS = { mCount: [1, 400], mGap: [5, 16], mLead: [1.2, 3.4], mPages: [1, 4], mBelow: [0, 60], mSideW: [28, 60], mLabelSize: [9, 40], mIntroSize: [9, 40], mSeqFrom: [1, 99999] };
/** نصوصٌ جاهزة لما قبل المتن */
export const INTRO_PICKS = ['قال الناظم رحمه الله تعالى:', 'قال الناظم رحمه الله:', 'قال المصنف رحمه الله تعالى:', 'قال الماتن رحمه الله:', 'قال المؤلف رحمه الله:'];

const ONE = (v, list, d) => (list.includes(v) ? v : d);
const NUM = (v, d, lo, hi) => (v !== null && v !== '' && Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const INT = (v, d, lo, hi) => Math.round(NUM(v, d, lo, hi));
const HEX = /^#[0-9a-f]{6}$/i;
const txt = (v, max) => (typeof v === 'string' ? v.replace(/[<>{}\\"'`;\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const fontName = (v) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 80) : '');
const rangeOk = (r) => r && typeof r === 'object';
/** تنقية إعدادات المتون (في المتصفح وفي الخادم) */
export function cleanMutun(s) {
  const x = s && typeof s === 'object' ? s : {};
  const r = rangeOk(x.mRange) ? x.mRange : {};
  const head = (h) => (h && typeof h === 'object' && typeof h.t === 'string' ? { t: txt(h.t, 160), n: INT(h.n, 1, 1, 999) } : null);
  const mode = ONE(r.mode, ['all', 'heads', 'verses', 'paras'], 'all');
  const range =
    mode === 'heads' && head(r.from)
      ? { mode, from: head(r.from), ...(head(r.to) ? { to: head(r.to) } : {}) }
      : mode === 'verses' || mode === 'paras'
        ? { mode, from: INT(r.from, 1, 1, 99999), to: INT(r.to, 0, 0, 99999) }
        : { mode: 'all' };
  const L = MUTUN_LIMITS;
  return {
    mKind: ONE(x.mKind, ['auto', 'poem', 'prose'], 'auto'),
    mStrip: x.mStrip !== false,
    mDivide: ONE(x.mDivide, ['auto', 'heads', 'lines', 'paras', 'verses', 'manual'], 'auto'),
    mHead: NUM(x.mHead, 2, 1, 4),
    mCount: INT(x.mCount, 5, ...L.mCount),
    mPlace: ONE(x.mPlace, ['page', 'below', 'side', 'none'], 'page'),
    mSide: ONE(x.mSide, ['right', 'left', 'free'], 'right'),
    mCenter: x.mCenter === true,
    mLead: +x.mLead ? NUM(x.mLead, 0, ...L.mLead) : 0,
    mPages: INT(x.mPages, 1, ...L.mPages),
    mBelow: INT(x.mBelow, 0, ...L.mBelow),
    mSideW: INT(x.mSideW, 42, ...L.mSideW),
    mLabel: x.mLabel === '' ? '' : txt(x.mLabel, 60) || MUTUN_DEFAULTS.mLabel,
    mLabelAl: ONE(x.mLabelAl, ['r', 'c', 'l'], 'c'),
    mLabelFont: fontName(x.mLabelFont),
    mLabelSize: +x.mLabelSize ? NUM(x.mLabelSize, 0, ...L.mLabelSize) : 0,
    mLabelColor: HEX.test(x.mLabelColor || '') ? x.mLabelColor : '',
    mLabelDeco: ONE(x.mLabelDeco, ['plain', 'rule', 'frame', 'band', 'orn'], 'plain'),
    mLabelBold: x.mLabelBold !== false,
    mIntro: txt(x.mIntro, 80),
    mIntroAt: ONE(x.mIntroAt, ['first', 'heads', 'units'], 'first'),
    mIntroAl: ONE(x.mIntroAl, ['r', 'c', 'l'], 'r'),
    mIntroFont: fontName(x.mIntroFont),
    mIntroSize: +x.mIntroSize ? NUM(x.mIntroSize, 0, ...L.mIntroSize) : 0,
    mIntroColor: HEX.test(x.mIntroColor || '') ? x.mIntroColor : '',
    mIntroDeco: ONE(x.mIntroDeco, ['plain', 'rule', 'frame', 'band', 'orn'], 'plain'),
    mIntroBold: x.mIntroBold !== false,
    mRule: ONE(x.mRule, ['blank', 'dots', 'lines', 'grid'], 'lines'),
    mRuleColor: HEX.test(x.mRuleColor || '') ? x.mRuleColor : MUTUN_DEFAULTS.mRuleColor,
    mGap: NUM(x.mGap, 8, ...L.mGap),
    mNum: ONE(x.mNum, ['off', 'side', 'mid'], 'side'),
    mSeq: ONE(x.mSeq, ['off', 'side', 'mid'], 'off'),
    mSeqFrom: INT(x.mSeqFrom, 1, ...L.mSeqFrom),
    mBelowLines: INT(x.mBelowLines, 8, 2, 40),
    mRange: range,
    mOwner: cleanOwner(x.mOwner),
  };
}

/** موضع التعليق لجزءٍ أو فصلٍ بعينه (من «المحرِّر»): { place, n, label, hints } — ما لم يُذكر يبقى على الإعدادات */
export function cleanUnitCfg(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  if (['page', 'below', 'side', 'none'].includes(c.place)) out.place = c.place;
  if (c.n != null && Number.isFinite(+c.n)) out.n = INT(c.n, 0, 0, 60);
  if (typeof c.label === 'string') out.label = c.label === '' ? '' : txt(c.label, 80);
  if (Array.isArray(c.hints)) {
    const h = c.hints.map((t) => txt(String(t || ''), 220)).filter(Boolean).slice(0, 12);
    if (h.length) out.hints = h;
  }
  return Object.keys(out).length ? out : null;
}
/**
 * ما يحمله القطعة من «المحرِّر» للمتون: { cut, join, c, sec, in }
 * cut: 1 جزءٌ يبدأ هنا (حدّده المستخدم) · 2 بدايةُ جزءٍ ثُبّتت («ثبّت الترتيب»: لا تُعدّ إلا في التقسيم الثابت)
 * in: نصٌّ قبل المتن هنا { t } (أو { off: 1 }: لا يوضع هنا)
 */
export function cleanMu(mu) {
  if (!mu || typeof mu !== 'object') return null;
  const out = {};
  if (mu.cut) out.cut = mu.cut === 2 ? 2 : 1;
  else if (mu.join) out.join = 1;
  const c = cleanUnitCfg(mu.c);
  if (c) out.c = c;
  const sec = cleanUnitCfg(mu.sec);
  if (sec) out.sec = sec;
  // دور القطعة في المتن (مما فُهم من الملف، أو حدّده المستخدم): in «قال…» قبل المتن · lab عنوان التعليق · matn متنٌ (لا غير)
  if (['in', 'lab', 'matn'].includes(mu.as)) out.as = mu.as;
  if (mu.in && typeof mu.in === 'object') {
    if (mu.in.off) out.in = { off: 1 };
    else if (typeof mu.in.t === 'string' && txt(mu.in.t, 80)) out.in = { t: txt(mu.in.t, 80) };
  }
  return Object.keys(out).length ? out : null;
}

/* ------------------------------------------------------------ ترقيم الملف */
// المنظومة في الملف قد تأتي مرقّمة: «١- العلمُ يرفع…» أو «(١) …» أو رقمٌ بين الشطرين أو في آخر البيت،
// أو في خاناتٍ من جدول (العدّ، ورقم البيت في المنظومة). يُحذف الرقم وما يتبعه من شرطةٍ أو نقطةٍ أو قوس،
// فلا يبقى في البيت إلا البيت؛ ويُحفظ رقمه: sn رقم البيت في المنظومة، وsq العدّ المتسلسل (إن كانا معاً).
// ولا يُعدّ الرقم ترقيماً إلا إن تتابع في الأبيات (فرقم الحاشية «(١)» في آخر شطرٍ لا يُحذف).
const DIGS = '0-9٠-٩۰-۹';
const LEAD_NUM = new RegExp(`^\\s*[(\\[{﴿«]?\\s*([${DIGS}]{1,5})\\s*[)\\]}﴾»]?\\s*(?:[-–—ـ.:،/\\\\)|]+\\s*)?(?=[^\\s${DIGS}])`, 'u');
const TAIL_NUM = new RegExp(`(?<=[^\\s${DIGS}])\\s*(?:[-–—ـ.:،|]+\\s*)?[(\\[{﴿«]?\\s*([${DIGS}]{1,5})\\s*[)\\]}﴾»]?\\s*[.\\-–]?\\s*$`, 'u');
const latinN = (s) => +String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);
/** رقمٌ وحده (خانة جدولٍ أو جزءٌ من سطر): «١٢» «(١٢)» «١٢-» */
export const numOnly = (t) => {
  const m = new RegExp(`^\\s*[(\\[{﴿«]?\\s*([${DIGS}]{1,5})\\s*[)\\]}﴾»]?\\s*[-–—.:]?\\s*$`, 'u').exec(String(t || ''));
  return m ? latinN(m[1]) : 0;
};
/**
 * يحذف ترقيم الملف من أبيات المتن (في مكانها) ← { stripped, positions }
 * @param {Array} blocks قطع المجلد (ناتج المحلّل)
 */
export function srcVerseNumbers(blocks) {
  const vs = (blocks || []).filter((b) => b && b.type === 'verse' && Array.isArray(b.parts));
  if (vs.length < 2) return { stripped: 0, positions: [] };
  // مواضع الرقم: أول الصدر، آخره، أول العجز، آخر العجز
  const POS = [
    [0, LEAD_NUM],
    [0, TAIL_NUM],
    [1, LEAD_NUM],
    [1, TAIL_NUM],
  ];
  const found = POS.map(([p, re]) => vs.map((v, i) => {
    const m = re.exec(String(v.parts[p] || ''));
    return m ? { i, n: latinN(m[1]) } : null;
  }).filter(Boolean));
  // ترقيمٌ: في كثيرٍ من الأبيات، ويتزايد في أكثرها
  const isSeq = (list) => {
    if (list.length < Math.max(2, Math.ceil(vs.length * 0.3))) return false;
    let ok = 0;
    for (let j = 1; j < list.length; j++) {
      const d = list[j].n - list[j - 1].n;
      const di = list[j].i - list[j - 1].i;
      if (d >= 1 && d <= di + 2) ok++;
    }
    return ok >= (list.length - 1) * 0.7;
  };
  const acc = POS.map((_, k) => isSeq(found[k]));
  const on = acc.map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
  // علامةٌ بلا رقم في أول البيت أو آخره («- » «• » «* »): ليست من البيت إن تكررت في أكثر الأبيات
  const BUL = /^\s*[-–—•*◆❖✽۞▪●]+\s*(?=\S)/u;
  const BUL_T = /(?<=\S)\s*[-–—•*◆❖✽۞▪●]+\s*$/u;
  let bul = 0;
  if (vs.filter((v) => BUL.test(String(v.parts[0] || ''))).length >= vs.length * 0.5)
    for (const v of vs) if (BUL.test(String(v.parts[0] || ''))) (v.parts = [String(v.parts[0]).replace(BUL, ''), v.parts[1]]), bul++;
  if (vs.filter((v) => BUL_T.test(String(v.parts[1] || ''))).length >= vs.length * 0.5)
    for (const v of vs) if (BUL_T.test(String(v.parts[1] || ''))) (v.parts = [v.parts[0], String(v.parts[1]).replace(BUL_T, '')]), bul++;
  if (!on.length) return { stripped: bul, positions: [] };
  // رقم البيت في المنظومة: ما بين الشطرين إن كان، وإلا الأكبر قيمةً (العدّ يبدأ من واحد)
  const med = (k) => {
    const a = found[k].map((x) => x.n).sort((p, q) => p - q);
    return a[Math.floor(a.length / 2)];
  };
  const inner = on.filter((k) => k === 1 || k === 2);
  const orig = inner.length ? inner[0] : on.reduce((best, k) => (med(k) > med(best) ? k : best), on[0]);
  let stripped = 0;
  vs.forEach((v, i) => {
    const parts = [...v.parts];
    for (const k of on) {
      const [p, re] = POS[k];
      const m = re.exec(String(parts[p] || ''));
      if (!m) continue;
      parts[p] = String(parts[p]).replace(re, '').trim();
      if (k === orig) v.sn = latinN(m[1]);
      else if (on.length > 1) v.sq = latinN(m[1]);
      stripped++;
    }
    v.parts = parts;
  });
  // كيف كانت الأرقام في الملف: رقم البيت بين الشطرين أو على جانبه، ومعه عدٌّ متسلسل أو لا
  return { stripped, positions: on, origMid: orig === 1 || orig === 2, seq: on.length > 1 };
}
/** أرقام الأبيات: رقمها في الملف إن كان (ويتصل العدّ بعده)، وإلا ترتيبها */
function verseNos(blocks) {
  let vn = 0;
  return blocks.map((b) => (b.type === 'verse' ? (vn = b.sn > 0 ? b.sn : vn + 1) : 0));
}

/* ------------------------------------------------------------ أدوات */
const normT = (t) =>
  String(t || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '');
const letters = (t) => (String(t || '').match(/[ء-ي]/g) || []).length;
const paraText = (b) => (b.runs || []).map((r) => (r.k === 'r' ? '' : r.s || '')).join('');
/** نص القطعة مختصراً (للوحات: أول البيت أو الفقرة) */
export const blockGist = (b, n = 60) => {
  const t = b.type === 'verse' ? (b.parts || []).filter(Boolean).join(' … ') : b.type === 'heading' ? b.text || '' : paraText(b);
  const s = String(t).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
};
/** هل المتن منظومة؟ (الأبيات غالبة؛ وأبياتٌ تتخلل النثر لا تجعله نظماً) */
export function isPoem(blocks) {
  let v = 0;
  let prose = 0;
  for (const b of blocks) {
    if (b.type === 'verse') v++;
    else if (b.type === 'para') prose += letters(paraText(b));
  }
  return v >= 6 && v * 40 >= prose * 1.5;
}
/** نوع المتن كما اختير أو كما عُرف */
export const poemOf = (blocks, kind) => (kind === 'poem' ? true : kind === 'prose' ? false : isPoem(blocks));

/** العناوين التي يُختار منها «من بابٍ إلى باب»: [{ t, n, lvl, label }] (n: ترتيب العنوان بين ما يطابقه نصاً) */
export function rangeHeads(headings) {
  const seen = new Map();
  return (headings || [])
    .map((h) => ({ t: String(h.title || h.text || '').trim(), lvl: +h.level || +h.lvl || 1 }))
    .filter((h) => h.t)
    .map((h) => {
      const k = normT(h.t);
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      return { ...h, n };
    });
}

/* ------------------------------------------------------------ النطاق */
function findHead(blocks, h, from = 0) {
  if (!h) return -1;
  const want = normT(h.t);
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'heading') continue;
    const got = normT(b.text);
    if (got && (got === want || got.startsWith(want) || want.startsWith(got))) {
      n++;
      if (n >= (h.n || 1) && i >= from) return i;
    }
  }
  return -1;
}
/** العناوين التي فوق القطعة a (الباب والفصل اللذان هي فيهما) */
function headsAbove(blocks, a) {
  const heads = [];
  let lvl = 99;
  for (let i = a - 1; i >= 0 && lvl > 1; i--) {
    const b = blocks[i];
    if (b.type === 'heading' && (b.level || 1) < lvl) {
      heads.unshift(i);
      lvl = b.level || 1;
    }
  }
  return heads;
}
/** ما اختير من المتن ← [a, z, heads] */
function rangeOf(blocks, R) {
  if (!R || R.mode === 'all') return [0, blocks.length];
  if (R.mode === 'heads') {
    const a = findHead(blocks, R.from);
    if (a < 0) return [0, blocks.length];
    let t = R.to ? findHead(blocks, R.to, a) : a;
    if (t < 0) t = a;
    const lvl = blocks[t].level || 1;
    let z = blocks.length;
    for (let i = t + 1; i < blocks.length; i++) if (blocks[i].type === 'heading' && (blocks[i].level || 1) <= lvl) {
      z = i;
      break;
    }
    return [a, z];
  }
  // من بيتٍ إلى بيت (بأرقامها في المنظومة)، أو من فقرةٍ إلى فقرة (بأرقامها في المتن)
  const key = R.mode === 'verses' ? 'vn' : 'pn';
  const from = Math.max(1, R.from || 1);
  const to = R.to > 0 ? Math.max(from, R.to) : Infinity;
  let a = -1;
  let z = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    const n = blocks[i][key];
    if (!n) continue;
    if (a < 0 && n >= from) a = i;
    if (n > to) {
      z = i;
      break;
    }
  }
  if (a < 0) return [0, 0];
  return [a, z, headsAbove(blocks, a)];
}

/* ------------------------------------------------------------ التقسيم */
const UNIT_TYPES = ['para', 'verse', 'image', 'table', 'label', 'ornament'];
const hasBody = (u) => u.some((b) => UNIT_TYPES.includes(b.type));
/** الأجزاء: مصفوفة من مصفوفات العناصر */
function divide(blocks, how, s, m) {
  const units = [];
  let cur = [];
  let count = 0;
  let due = false; // بلغ الجزء عدده: ينقطع قبل القطعة التالية (ما لم تُضمّ إليه)
  const flush = () => {
    if (hasBody(cur)) {
      units.push(cur);
      cur = [];
    }
    count = 0;
    due = false;
  };
  // عدد أسطر الفقرة تقديراً (عرض السطر ÷ عرض الحرف)
  // (عرض النص: بلا الهامش الخارجي الواسع إن اختير)
  const cpl = Math.max(20, pageGeom(s).text / (((s.sizes && s.sizes.body) || 16) * 0.3528 * 0.47));
  const linesOf = (b) => (b.type === 'verse' ? 1 : b.type === 'para' ? Math.max(1, Math.ceil(letters(paraText(b)) / cpl)) : b.type === 'heading' ? 0 : 1);
  const manual = how === 'manual';
  for (const b of blocks) {
    const mu = b.mu || {};
    const body = cur.some((x) => x.type !== 'heading' && x.type !== 'mintro');
    // البداية المثبّتة (cut: 2) لا تُعدّ إلا في التقسيم الثابت؛ وفيه لا يُقسم إلا عندها وعند ما حدّده المستخدم
    const cut = mu.cut === 1 || (mu.cut === 2 && manual) || !!b._cut;
    let brk = false;
    if (manual) brk = cut;
    else if (mu.join) brk = false;
    else if (cut) brk = true;
    else if (b.type === 'heading') brk = how === 'heads' ? (b.level || 1) <= m.mHead : true;
    else brk = due;
    // (عناوينُ وحدها قبل القطعة تبقى معها في جزئها، وكذلك «قال …»)
    if (brk && body) flush();
    cur.push(b);
    if (b.type === 'heading' || b.type === 'mintro') continue;
    if (how === 'heads' || manual) continue;
    if (how === 'verses') count += b.type === 'verse' ? 1 : 0;
    else if (how === 'paras') count += b.type === 'para' || b.type === 'verse' ? 1 : 0;
    else count += linesOf(b);
    // الجزء ينتهي بنهاية فقرة (أو بيت)
    if (count >= m.mCount) due = true;
  }
  if (cur.length) {
    if (hasBody(cur) || !units.length) units.push(cur);
    else units[units.length - 1].push(...cur);
  }
  // في التقسيم بالأبيات: ما لا بيت فيه (عنوان المنظومة، أو مقدمةٌ منثورة قصيرة) يُضم إلى الجزء الذي بعده
  // (إلا ما حدّده المستخدم جزءاً وحده)
  const userCut = (u) => u.some((b) => b.mu && b.mu.cut === 1);
  if (how === 'verses')
    for (let i = units.length - 2; i >= 0; i--)
      if (!units[i].some((b) => b.type === 'verse') && !userCut(units[i]) && !userCut(units[i + 1]))
        units.splice(i, 2, [...units[i], ...units[i + 1]]);
  return units;
}

/**
 * التركيب: المتن مركّباً كما في الكتب (base)، ثم النطاق، والأجزاء، ومواضع التعليق، وأرقام الأبيات.
 * @param {object} vol  ناتج المحلّل (وتعديلات «المحرِّر» عليه) · @param {object} s الإعدادات · @param {Function} base composeVolume
 */
export function composeMutun(vol, s, base) {
  const m = cleanMutun(s);
  // كل قطعة بموضعها مما حلّله المحلّل (ليُعرف ما حدّده المستخدم عليها من أجزاء ومواضع تعليق)
  const marked = (vol.blocks || []).some((b) => b._i != null);
  const src = marked ? vol : { ...vol, blocks: (vol.blocks || []).map((b, i) => ({ ...b, _i: i })) };
  const doc = base(src, { ...s, mutun: false });
  // الترتيب الثابت: لا يعيد ورّاق تقسيم المتن ولا تنضيده (فواصل صفحات الملف تبقى، وأنماط الأبيات كما هي)
  const keep = m.mDivide === 'manual';
  // أرقام الأبيات في المنظومة كلها (رقمها في الملف إن كان مرقّماً)، وأرقام الفقرات في المتن كله (قبل اقتطاع شيء منه)
  let vn = 0;
  let pn = 0;
  let srcNums = false;
  const all = doc.blocks.map((b) => {
    const o = src.blocks[b._i];
    const mu = o && o.mu ? cleanMu(o.mu) : null;
    const x = { ...b, ...(mu ? { mu } : {}) };
    // الأجزاء هي التي تبدأ الصفحات (إلا فاصل صفحةٍ وضعه المستخدم، أو كان في الملف والترتيب ثابت)
    if (x.breakBefore && !(x.ps && x.ps.pb) && !keep) delete x.breakBefore;
    if (b.type === 'verse') {
      const sn = (o && o.sn) || b.sn;
      vn = sn > 0 ? sn : vn + 1;
      if (sn > 0) srcNums = true;
      x.vn = vn;
      if (o && o.sq) x.sq = o.sq;
    } else if (b.type === 'para') x.pn = ++pn;
    if (!marked) delete x._i;
    return x;
  });
  const poem = poemOf(all, m.mKind);
  const R = (m.mRange.mode === 'verses' && !poem) || (m.mRange.mode === 'paras' && poem) ? { mode: 'all' } : m.mRange;
  const [a, z, keepHeads] = rangeOf(all, R);
  let blocks = [...(keepHeads || []).map((i) => all[i]), ...all.slice(a, z)];
  // صفحات الملف (غلافه وصفحات عنوانه) لا تدخل في أجزاء المتن: تبقى في أوله
  const lead = [];
  while (blocks.length && (blocks[0].type === 'coverpage' || blocks[0].type === 'pagefig')) lead.push(blocks.shift());
  blocks = blocks.filter((b) => (b.type !== 'pagebreak' || keep) && b.type !== 'coverpage' && b.type !== 'pagefig');
  // أدوار القطع (مما فُهم من الملف أو حدّده المستخدم): «قال …» في موضعه، وعنوان التعليق يختم جزءه ويسمّي موضع تعليقه
  {
    const roled = [];
    let lastBody = null;
    let cutNext = false;
    for (const b of blocks) {
      const as = b.mu && b.mu.as;
      if (as === 'lab') {
        const t = blockGist(b, 80).replace(/[:：]\s*$/, '');
        if (lastBody && t !== LAB_SENT) lastBody._endLabel = t;
        if (lastBody && b._i != null) lastBody._labAt = b._i;
        cutNext = true;
        continue;
      }
      if (as === 'in') {
        const t = blockGist(b, 90);
        const mi = { type: 'mintro', text: t, src: true, own: true, ...(b._i != null ? { at: b._i } : {}), ...(cutNext ? { _cut: 1 } : {}) };
        cutNext = false;
        roled.push(mi);
        roled._intro = true;
        continue;
      }
      const x = cutNext ? { ...b, _cut: 1 } : b;
      cutNext = false;
      if (roled._intro && (b.type === 'verse' || b.type === 'para')) {
        x._noAutoIntro = 1;
        roled._intro = false;
      }
      if (b.type === 'verse' || b.type === 'para') lastBody = x;
      roled.push(x);
    }
    blocks = roled;
  }
  const hasHeads = blocks.some((b) => b.type === 'heading');
  let how = m.mDivide !== 'auto' ? m.mDivide : poem ? 'verses' : hasHeads ? 'heads' : 'paras';
  // النظم يُقسم بأبياته، والنثر بأسطره أو فقراته
  if (poem && (how === 'lines' || how === 'paras')) how = 'verses';
  if (!poem && how === 'verses') how = 'paras';
  if (how === 'heads' && !hasHeads) how = poem ? 'verses' : 'paras';
  const mm = m.mDivide === 'auto' ? { ...m, mCount: poem ? m.mCount || 5 : how === 'paras' ? 1 : m.mCount } : m;

  // موضع التعليق لفصلٍ بعينه (من «المحرِّر»): يسري من عنوانه إلى العنوان الذي في مستواه أو أعلى
  const stack = [];
  for (const b of blocks) {
    if (b.type === 'heading') while (stack.length && stack[stack.length - 1].lvl >= (b.level || 1)) stack.pop();
    if (b.mu && b.mu.sec) stack.push({ lvl: b.type === 'heading' ? b.level || 1 : 2.5, c: b.mu.sec });
    if (stack.length) b._sec = stack.reduce((acc, x) => ({ ...acc, ...x.c }), {});
  }
  const units = divide(blocks, how, s, mm);

  // أرقام الأبيات: رقمه في المنظومة، والعدّ المتسلسل في المقطع؛ وما بين الشطرين لا يكون إلا والشطران في سطر بلا رموز
  const lineLayout = (b) => (b.vl || s.verseLayout || 'line') === 'line' && (b.vs || s.verseSep || 'none') === 'none';
  let sn = m.mSeqFrom - 1;
  let nv = 0;
  const numbered = (b) => {
    const { _sec, _cut, _endLabel, _noAutoIntro, _labAt, ...x } = b;
    if (x.type !== 'verse') return x;
    sn++;
    nv++;
    if (!poem || (m.mNum === 'off' && m.mSeq === 'off')) return x;
    const single = x.single || !String((x.parts || [])[0] || '').trim() || !String((x.parts || [])[1] || '').trim();
    const midOk = lineLayout(x) && !single;
    let pv = m.mNum;
    let ps = m.mSeq;
    if (pv === 'mid' && !midOk) pv = 'side';
    if (ps === 'mid' && (!midOk || pv === 'mid')) ps = 'side';
    const side = [];
    if (ps === 'side') side.push(sn);
    if (pv === 'side') side.push(x.vn);
    const vno = { side, ...(pv === 'mid' ? { mid: x.vn } : ps === 'mid' ? { mid: sn } : {}) };
    return side.length || vno.mid != null ? { ...x, vno } : x;
  };
  // موضع التعليق لكل جزء: الإعدادات، ثم ما حُدّد لفصله، ثم ما حُدّد له وحده
  const globalCfg = { place: m.mPlace, n: m.mPlace === 'below' ? m.mBelow : m.mPlace === 'page' ? m.mPages : 0, label: m.mLabel };
  const cfgOf = (u) => {
    const first = u.find((b) => b.type !== 'heading') || u[0];
    const own = u.find((b) => b.mu && b.mu.c);
    const sec = (first && first._sec) || {};
    const mine = (own && own.mu.c) || {};
    const c = { ...globalCfg, ...sec, ...mine };
    // عنوان التعليق كما كان في الملف بعد هذا الجزء
    const fileLab = u.find((b) => b._endLabel);
    if (fileLab && mine.label == null && sec.label == null) c.label = fileLab._endLabel;
    // عدد ما يُعطى (الصفحات أو السطور) يتبع موضعه: ما لم يُذكر فقيمة الإعدادات لذلك الموضع
    if (mine.n == null && sec.n == null) c.n = c.place === 'below' ? m.mBelow : c.place === 'page' ? m.mPages : 0;
    if (c.place === 'page') c.n = Math.max(1, Math.min(4, c.n || 1));
    return c;
  };

  const out = [...lead];
  const list = [];
  // ما قبل المتن («قال الناظم رحمه الله:»): بعد الباب أو الفصل إن كان، قبل أول بيتٍ أو فقرة —
  // في أول المتن، أو بعد كل عنوان، أو في أول كل جزء؛ وما حدّده المستخدم في موضعٍ بعينه يعلو ذلك (mu.in)
  let introDone = false;
  let intros = 0;
  const introAt = (u, j, firstBody) => {
    const b = u[j];
    const own = b.mu && b.mu.in;
    if (b._noAutoIntro) return '';
    if (own && own.off) return '';
    if (own && own.t) return own.t;
    if (!m.mIntro) return '';
    // (السطر نفسه «قال …» في المتن: لا يُكرَّر قبله)
    if (b.type === 'para' && (normT(blockGist(b, 200)) === normT(m.mIntro) || INTRO_RE.test(blockGist(b, 120)))) return '';
    const auto = m.mIntroAt === 'units' ? firstBody : m.mIntroAt === 'heads' ? !introDone || (j > 0 && u[j - 1].type === 'heading') : !introDone;
    return auto ? m.mIntro : '';
  };
  units.forEach((u, k) => {
    const c = cfgOf(u);
    const ui = marked ? (u.find((b) => b._i != null) || {})._i : undefined;
    const v = u.filter((b) => b.type === 'verse');
    const lab = u.find((b) => b._labAt != null);
    list.push({ k, ui, c, ...(lab ? { labAt: lab._labAt } : {}), gist: blockGist(u.find((b) => b.type !== 'heading') || u[0], 50), verses: v.length ? [v[0].vn, v[v.length - 1].vn] : null, head: (u.find((b) => b.type === 'heading') || {}).text || '' });
    out.push({ type: 'mstart', k, place: c.place, c, ...(ui != null ? { ui } : {}) });
    const fb = u.findIndex((b) => b.type !== 'heading' && b.type !== 'mintro');
    u.forEach((b, j) => {
      if (b.type === 'mintro') {
        intros++;
        introDone = true;
      } else if (b.type === 'verse' || b.type === 'para') {
        const t = introAt(u, j, j === fb);
        if (t) {
          out.push({ type: 'mintro', text: t, k, ...(b._i != null ? { at: b._i } : {}), ...(b.mu && b.mu.in && b.mu.in.t ? { own: true } : {}) });
          intros++;
        }
        introDone = true;
      }
      // الهامش بجانب المتن يُضيّقه: أبيات المنظومة فيه شطرٌ في كل سطر (في وسطه) لتسعه، ما لم يُختر لها نمط (أو كان الترتيب ثابتاً)
      out.push(numbered(c.place === 'side' && b.type === 'verse' && !b.vl && !keep ? { ...b, vl: 'center' } : b));
    });
    out.push({ type: 'mcomment', k, c, ...(ui != null ? { ui } : {}) });
  });
  const ids = new Set(out.filter((b) => b.type === 'heading').map((b) => b.id));
  const notes = {};
  const usedRefs = new Set();
  for (const b of out) for (const r of b.runs || []) if (r.k === 'r') usedRefs.add(r.id);
  for (const [id, n] of Object.entries(doc.notes || {})) if (usedRefs.has(id)) notes[id] = n;
  const firstV = blocks.find((b) => b.type === 'verse');
  return {
    ...doc,
    blocks: out,
    notes,
    headings: (doc.headings || []).filter((h) => ids.has(h.id)),
    bookHasMatn: false,
    mutun: {
      place: m.mPlace,
      // المقابلة: جهة صفحة المتن (يبدأ كل جزءٍ فيها) · الهامش: جهة المتن من الصفحة (أو الهامش في الحافة الخارجية)
      side: m.mPlace === 'page' && m.mSide !== 'free' ? m.mSide : '',
      colSide: m.mSide === 'free' ? 'outer' : m.mSide,
      center: m.mCenter && m.mPlace === 'page',
      lead: m.mLead,
      label: m.mLabel,
      labelAl: m.mLabelAl,
      labelDeco: m.mLabelDeco,
      intro: m.mIntro,
      introAt: m.mIntroAt,
      intros,
      keep,
      srcNums,
      rule: m.mRule,
      color: m.mRuleColor,
      gapMm: m.mGap,
      sideW: m.mSideW,
      belowLines: m.mBelowLines,
      poem,
      kind: poem ? 'poem' : 'prose',
      how,
      units: units.length,
      list,
      verses: nv,
      paras: blocks.filter((b) => b.type === 'para').length,
      firstVerse: firstV ? firstV.vn : 0,
      totalVerses: vn,
      totalParas: pn,
    },
  };
}

/**
 * ما يُعرف من المتن قبل تقسيمه (للوحات «المجلد»): نوعه، وعدد أبياته وفقراته، وأول كل بيتٍ وفقرة (لاختيار النطاق).
 * @param {object} doc  ناتج composeVolume بلا متون (أو بها: يُقرأ منه ما يلزم)
 */
export function mutunOutline(doc) {
  const verses = [];
  const paras = [];
  const heads = [];
  const bl = (doc && doc.blocks) || [];
  const nos = verseNos(bl);
  const vnum = [];
  bl.forEach((b, i) => {
    if (b.type === 'verse') verses.push(blockGist(b, 70)), vnum.push(nos[i]);
    else if (b.type === 'para') paras.push(blockGist(b, 70));
    else if (b.type === 'heading') heads.push({ t: b.text, lvl: b.level || 1, v: verses.length, p: paras.length });
  });
  // أرقام الأبيات (رقمها في الملف إن كان مرقّماً): أولها وآخرها
  return { verses, vnum, vlo: vnum.length ? Math.min(...vnum) : 1, vhi: vnum.length ? Math.max(...vnum) : 0, paras, heads, poem: isPoem(bl) };
}

/* ------------------------------------------------------------ ملف المتن المهيّأ للتعليق (Word أو PDF) */
const strip = (h) =>
  String(h || '')
    .replace(/\u000e[^\u000f\n]*\u000f/g, '')
    .replace(/\u0010[^\u0011\n]*\u0011/g, '')
    .replace(/\u0007[^\u0008\n]*\u0008/g, '')
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
// سطرٌ للكتابة: نقاطٌ أو شرطاتٌ سفلية أو خطوط (وما بينها من فراغ)
const RULE_LINE = /^[\s.…·_ـ\-–—•⠀─]{6,}$/;
// سطرٌ فارغ من الملف (فقراتٌ فارغة متتالية تحت عنوان التعليق): يكتبه المستورد هكذا ليُعرف موضعها
export const BLANK_LINE = '⠀'.repeat(8);
// موضع تعليقٍ بلا عنوان في الملف (صفحةٌ فارغة أو سطور): علامته
export const LAB_SENT = '⟦تعليق⟧';
const BLANKS = /^[\s⠀]+$/;
const DOTS = /[.…·•]/;
/**
 * يفهم ملفاً مهيّأً للتعليق: مواضع التعليق فيه (صفحاتٌ فارغة، أو سطورٌ منقّطة أو مخطوطة، وعنوانها المتكرر)،
 * وهل هي صفحةٌ تقابل المتن أم تحته، وتقسيم المتن بينها (كم بيتاً أو فقرةً في كل جزء).
 * وتُرفع مواضع التعليق من النص، فيبقى المتن وحده.
 * @param {Array<{text:string}>} pages  صفحات الكتاب (بصيغة الكتاب)
 * @param {{title?:string}} o
 * @returns {{pages, map, found: boolean, settings: object, info: object}}
 */
export function analyzeMutunPages(pages, o = {}) {
  const P = (pages || []).map((p) => {
    const lines = String((p && p.text) || '').split('\n');
    return { p, lines, plain: lines.map(strip) };
  });
  const isRule = (t) => RULE_LINE.test(t);
  const titleK = normT(o.title || '');
  // عناوين مواضع التعليق: سطرٌ قصير يتكرر، وتليه سطور الكتابة (أو هو وحده في صفحته)
  const freq = new Map();
  for (const x of P)
    x.plain.forEach((t, j) => {
      const k = normT(t);
      if (!k || t.length > 40 || isRule(t)) return;
      const next = x.plain.slice(j + 1).find((y) => y.trim());
      const alone = x.plain.filter((y) => normT(y)).length === 1;
      if (!(next && isRule(next)) && !alone) return;
      if (!freq.has(k)) freq.set(k, { t, n: 0 });
      freq.get(k).n++;
    });
  const labels = new Set([...freq.entries()].filter(([k, v]) => v.n >= 2 && k !== titleK).map(([k]) => k));
  let label = '';
  let best = 0;
  for (const k of labels) if (freq.get(k).n > best) (best = freq.get(k).n), (label = freq.get(k).t.replace(/[:：]\s*$/, '').trim());
  const filler = (t) => !normT(t) || isRule(t) || labels.has(normT(t)) || (titleK && normT(t) === titleK);
  // مواضع التعليق: صفحاتٌ كلها حشو، أو كتلُ سطورٍ (عنوانٌ وسطور كتابة) داخل الصفحة
  const blocks = []; // { page, from, to, rules, whole }
  P.forEach((x, i) => {
    const content = x.plain.filter((t) => normT(t) || isRule(t));
    if (content.length && x.plain.every(filler) && !(titleK && content.every((t) => normT(t) === titleK))) {
      blocks.push({ page: i, from: 0, to: x.lines.length, rules: x.plain.filter(isRule).length, whole: true });
      return;
    }
    if (!content.length && i > 0) {
      blocks.push({ page: i, from: 0, to: x.lines.length, rules: 0, whole: true, empty: true });
      return;
    }
    for (let j = 0; j < x.plain.length; j++) {
      if (!isRule(x.plain[j]) && !labels.has(normT(x.plain[j]))) continue;
      let a = j;
      let z = j;
      let rules = 0;
      while (z < x.plain.length && filler(x.plain[z])) {
        if (isRule(x.plain[z])) rules++;
        z++;
      }
      if (rules >= 3) {
        blocks.push({ page: i, from: a, to: z, rules, whole: false });
        j = z;
      }
    }
  });
  const ruleKind = () => {
    let dots = 0;
    let lines = 0;
    let blank = 0;
    for (const b of blocks) for (const t of P[b.page].plain.slice(b.from, b.to)) if (isRule(t)) BLANKS.test(t) ? blank++ : DOTS.test(t) ? dots++ : lines++;
    return blank >= dots + lines || dots + lines === 0 ? 'blank' : dots >= lines ? 'dots' : 'lines';
  };
  const real = blocks.filter((b) => !b.empty);
  const found = real.length >= 2 || (blocks.length >= 2 && blocks.filter((b) => b.empty).length >= 2 && P.length >= 4);
  const settings = {};
  const info = { commentBlocks: blocks.length, pages: P.length };
  if (!found) return { pages, map: null, found: false, settings, info };
  // صفحةٌ تقابل المتن: صفحاتٌ كاملة للتعليق، أو سطور كتابةٍ تملأ صفحة (١٢ سطراً فأكثر)
  const whole = blocks.filter((b) => b.whole).length;
  const avgRules = real.length ? real.reduce((a, b) => a + b.rules, 0) / real.length : 0;
  settings.mPlace = whole >= blocks.length * 0.5 || avgRules >= 12 ? 'page' : 'below';
  if (settings.mPlace === 'page' && whole >= 2) {
    // أول صفحة متن: موضعها في الملف (الفردية يسرى في الكتاب العربي)
    const firstM = P.findIndex((x, i) => !blocks.some((b) => b.page === i && b.whole));
    settings.mSide = (firstM + 1) % 2 === 0 ? 'right' : 'left';
  }
  settings.mRule = ruleKind();
  settings.mLabel = label;
  // المتن بلا مواضع التعليق، وأجزاؤه كما في الملف
  const clean = [];
  const map = [];
  const segs = [[]]; // أسطر المتن بين موضعَي تعليق
  // موضع كل تعليقٍ يبقى علامةً في مكانه (عنوانه وسطرٌ للكتابة): بها يُعرف أين ينتهي كل جزء كما في الملف
  const labelIn = (pi, a, z) => {
    for (let j = a; j < z; j++) if (labels.has(normT(P[pi].plain[j]))) return P[pi].plain[j].replace(/[:：]\s*$/, '').trim();
    return LAB_SENT;
  };
  const endsMarked = (t) => /⠀{4,}\s*$/.test(t);
  P.forEach((x, i) => {
    map[i] = clean.length + 1;
    const mine = blocks.filter((b) => b.page === i);
    if (mine.some((b) => b.whole)) {
      if (segs[segs.length - 1].length) segs.push([]);
      const prev = clean[clean.length - 1];
      if (prev && !endsMarked(prev.text)) prev.text += '\n' + labelIn(i, 0, x.plain.length) + '\n' + BLANK_LINE;
      return;
    }
    const keep = [];
    x.lines.forEach((l, j) => {
      const inBlock = mine.find((b) => j >= b.from && j < b.to);
      if (inBlock) {
        if (j === inBlock.from && segs[segs.length - 1].length) segs.push([]);
        if (j === inBlock.from) keep.push(labelIn(i, inBlock.from, inBlock.to), BLANK_LINE);
        return;
      }
      keep.push(l);
      if (normT(x.plain[j])) segs[segs.length - 1].push(x.plain[j]);
    });
    clean.push({ ...x.p, text: keep.join('\n') });
  });
  const parts = segs.filter((g) => g.length);
  const med = (a) => (a.length ? a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)] : 0);
  const verses = parts.map((g) => g.filter((t) => / \.\.\. |\t/.test(t)).length);
  // الأجزاء كما في الملف (يختم كلاً منها موضع تعليقه)؛ والعدد لمن أراد التقسيم الآلي
  settings.mDivide = 'manual';
  settings.mCount = med(verses) >= 2 ? med(verses) : Math.max(1, med(parts.map((g) => g.length)));
  info.parts = parts.length;
  return { pages: clean, map: map.map((n) => Math.min(n, clean.length || 1)), found: true, settings, info };
}

/**
 * اسم الكتاب (أو غيره) يتكرر أعلى كل صفحة، ورقم الصفحة وحده في آخرها: ليسا من المتن — يُرفعان.
 * (يبقى في الصفحة الأولى إن كان اسم المتن نفسه: يصير عنوانه)
 * @returns {{ pages, head: string, removed: number }}
 */
export function stripRunHeads(pages, title = '') {
  const P = (pages || []).map((p) => String((p && p.text) || '').split('\n'));
  const firstIdx = (ls) => ls.findIndex((l) => normT(strip(l)));
  const lastIdx = (ls) => {
    for (let j = ls.length - 1; j >= 0; j--) if (normT(strip(ls[j]))) return j;
    return -1;
  };
  const cnt = new Map();
  for (const ls of P) {
    const j = firstIdx(ls);
    if (j < 0) continue;
    const t = strip(ls[j]);
    if (t.length > 70 || / \.\.\. |\t/.test(t) || /data-type=["']?title/.test(ls[j])) continue;
    const k = normT(t);
    cnt.set(k, { t, n: ((cnt.get(k) || {}).n || 0) + 1 });
  }
  let head = '';
  let best = 0;
  for (const [k, v] of cnt) if (v.n > best) (best = v.n), (head = k);
  const ok = head && best >= 2 && best >= P.length * 0.5;
  const PAGE_NO = /^[\s\-–—(\[{﴾]*[0-9٠-٩]{1,4}[\s\-–—)\]}﴿]*$/;
  let removed = 0;
  const out = P.map((ls, i) => {
    const x = [...ls];
    const j = firstIdx(x);
    // (الصفحة الأولى: اسم المتن في أولها يبقى — يصير عنوانه)
    if (ok && j >= 0 && normT(strip(x[j])) === head && !(i === 0 && title && normT(title) === head)) {
      x.splice(j, 1);
      removed++;
    }
    const z = lastIdx(x);
    if (z >= 0 && PAGE_NO.test(strip(x[z]))) {
      x.splice(z, 1);
      removed++;
    }
    return { ...pages[i], text: x.join('\n') };
  });
  return { pages: removed ? out : pages, head: ok ? cnt.get(head).t : '', removed };
}

/* ------------------------------------------------------------ قراءة بنية المتن من قطعه */
// ترتيب صفحة المتن في الملفات: العنوان (اسم الكتاب)، ثم الباب، ثم «قال …» (إن كان)، ثم المتن (نظماً أو نثراً)، ثم «التعليقات» (إن كانت).
// فما يتكرر في الصفحات قبل المتن مباشرةً هو «قال …»، وما يتكرر بعده وتحته أسطرٌ (أو فراغ أو آخر الصفحة) هو عنوان التعليق.
const INTRO_RE = /^\s*[«"(]?\s*(?:و?قال|يقول|قول|وقال|قالَ)\s+(?:ال)?(?:ناظم|ماتن|مصنف|مصنّف|مؤلف|مؤلّف|شيخ|إمام|حافظ|علامة|علّامة|عالم|شارح)/u;
const INTRO_WORDS = /^\s*(?:و?قال|يقول)\b/u;
const isFillerB = (b) => b && b.type === 'para' && RULE_LINE.test(strip(paraText(b)) || '') && strip(paraText(b)).length >= 6;
const textB = (b) => (b.type === 'para' ? strip(paraText(b)) : b.type === 'heading' ? b.text || '' : '');
const key2 = (t) => normT(t).slice(0, 16);
/**
 * يفهم أدوار القطع في المتن (في مكانها): «قال …» (mu.as = 'in')، وعنوان التعليق (mu.as = 'lab') وتُرفع سطور الكتابة تحته،
 * واسم الكتاب المتكرر أعلى الصفحات (يُرفع). وما حدّده المستخدم من قبل (mu.as) لا يُمسّ.
 * @returns {{ intros: number, labels: number, heads: number, settings: object }}
 */
export function readMutunBlocks(blocks) {
  const out = { intros: 0, labels: 0, heads: 0, settings: {} };
  if (!Array.isArray(blocks) || !blocks.length) return out;
  // الصفحات
  const pages = new Map();
  blocks.forEach((b, i) => {
    const k = b.pageId != null ? String(b.pageId) : '';
    if (!pages.has(k)) pages.set(k, []);
    pages.get(k).push(i);
  });
  const pageList = [...pages.values()];
  // ١) سطرٌ يتكرر أول الصفحات (اسم الكتاب): يُرفع
  if (pageList.length >= 3) {
    // (أول قطعةٍ في الصفحة نفسها، قبل أي عنوان)
    const firsts = pageList.map((ix) => ix[0]).filter((i) => i != null && blocks[i].type === 'para' && textB(blocks[i]) && !INTRO_RE.test(textB(blocks[i])));
    const c = new Map();
    for (const i of firsts) {
      const t = textB(blocks[i]);
      if (t.length <= 70) c.set(normT(t), (c.get(normT(t)) || 0) + 1);
    }
    const [hk, hn] = [...c.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
    if (hk && hn >= pageList.length * 0.5 && hn >= 3)
      for (const i of firsts) if (normT(textB(blocks[i])) === hk && !(blocks[i].mu && blocks[i].mu.as)) (blocks[i]._drop = 1), out.heads++;
  }
  const live = (i) => blocks[i] && !blocks[i]._drop;
  const nextIdx = (i) => {
    let j = i + 1;
    while (j < blocks.length && !live(j)) j++;
    return j < blocks.length ? j : -1;
  };
  const prevIdx = (i) => {
    let j = i - 1;
    while (j >= 0 && !live(j)) j--;
    return j;
  };
  const isBody = (b) => b && (b.type === 'verse' || (b.type === 'para' && !isFillerB(b)));
  const short = (b, n) => b && b.type === 'para' && textB(b).length > 0 && textB(b).length <= n && !(b.mu && b.mu.as);
  // تكرار السطور القصيرة (بأول كلماتها)
  const rep = new Map();
  blocks.forEach((b) => {
    if (b.type === 'para' && textB(b).length <= 90 && !isFillerB(b)) rep.set(key2(textB(b)), (rep.get(key2(textB(b))) || 0) + 1);
  });
  const repeated = (b) => (rep.get(key2(textB(b))) || 0) >= 2;
  const samePage = (a, b) => blocks[a] && blocks[b] && String(blocks[a].pageId) === String(blocks[b].pageId);
  const introTexts = new Map();
  const labelTexts = new Map();
  // شكلهما في الملف (لونهما وعرضهما وموضعهما في السطر): يصير شكل «قبل المتن» وعنوان التعليق
  const lookOf = (b) => {
    const rs = (b.runs || []).filter((r) => r.k !== 'r' && (r.s || '').trim());
    const c = rs.length && rs.every((r) => r.c && r.c === rs[0].c) ? rs[0].c : '';
    const bold = rs.length ? rs.every((r) => r.b || (r.st && r.st.bold)) : null;
    return { c: /^#[0-9a-f]{6}$/i.test(c) ? c : '', bold, al: ['c', 'l', 'r'].includes(b.al) ? b.al : '' };
  };
  let introLook = null;
  let labelLook = null;
  let afterHead = 0;
  let below = 0;
  let pageLab = 0;
  const ruleN = { dots: 0, lines: 0, blank: 0 };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!live(i) || b.type !== 'para' || isFillerB(b)) continue;
    const t = textB(b);
    // ٢) عنوان التعليق: سطرٌ قصير بعد المتن، وتحته سطور كتابة أو فراغ أو آخر الصفحة (أو الباب التالي)
    if (short(b, 40) && !/[.؟!]$/.test(t)) {
      let j = nextIdx(i);
      let fill = 0;
      const fills = [];
      while (j >= 0 && isFillerB(blocks[j]) && samePage(i, j)) {
        fills.push(j);
        fill++;
        j = nextIdx(j);
      }
      const endOfPage = j < 0 || !samePage(i, j) || blocks[j].type === 'heading';
      const pv = prevIdx(i);
      const contentAbove = pv >= 0 && isBody(blocks[pv]) && samePage(pv, i);
      const alone = !contentAbove && (pv < 0 || !samePage(pv, i) || blocks[pv].type === 'heading');
      // (علامة موضع التعليق التي يتركها فهم الملف: عنوانه وسطرٌ فارغ واحد)
      const marker = t === LAB_SENT || (fill === 1 && strip(paraText(blocks[fills[0]])) === BLANK_LINE);
      if (endOfPage && (marker || fill >= 2 || (repeated(b) && (contentAbove || alone)))) {
        b.mu = { ...(b.mu || {}), as: 'lab' };
        for (const f of fills) {
          const ft = strip(paraText(blocks[f]));
          if (!marker) ruleN[/^⠀+$/.test(ft) ? 'blank' : DOTS.test(ft) ? 'dots' : 'lines']++;
          blocks[f]._drop = 1;
        }
        if (!fill) ruleN.blank++;
        labelTexts.set(t.replace(/[:：]\s*$/, ''), (labelTexts.get(t.replace(/[:：]\s*$/, '')) || 0) + 1);
        if (!labelLook && t !== LAB_SENT) labelLook = lookOf(b);
        if (contentAbove) below++;
        else pageLab++;
        out.labels++;
        continue;
      }
    }
    // ٣) «قال …»: سطرٌ قصير بعد الباب (أو أول الصفحة) وقبل المتن مباشرة
    if (short(b, 90)) {
      const pv = prevIdx(i);
      const nx = nextIdx(i);
      const top = pv < 0 || blocks[pv].type === 'heading' || !samePage(pv, i) || (blocks[pv].mu && blocks[pv].mu.as === 'lab');
      const before = nx >= 0 && isBody(blocks[nx]) && !(blocks[nx].type === 'para' && short(blocks[nx], 90) && INTRO_RE.test(textB(blocks[nx])));
      const sure = INTRO_RE.test(t) || (INTRO_WORDS.test(t) && /[:：]\s*$/.test(t) && t.length <= 60);
      if (top && before && (sure || (repeated(b) && /[:：]\s*$/.test(t)))) {
        b.mu = { ...(b.mu || {}), as: 'in' };
        introTexts.set(t, (introTexts.get(t) || 0) + 1);
        if (!introLook) introLook = lookOf(b);
        if (pv >= 0 && blocks[pv].type === 'heading') afterHead++;
        out.intros++;
      }
    }
  }
  // ما رُفع يُحذف من القطع
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]._drop) blocks.splice(i, 1);
  const most = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  if (out.intros) {
    out.settings.mIntro = most(introTexts)[0];
    out.settings.mIntroAt = out.intros >= 2 && afterHead >= out.intros * 0.6 ? 'heads' : 'first';
    if (introLook) {
      if (introLook.c) out.settings.mIntroColor = introLook.c;
      if (introLook.bold != null) out.settings.mIntroBold = introLook.bold;
      if (introLook.al) out.settings.mIntroAl = introLook.al;
    }
  }
  if (out.labels) {
    out.settings.mLabel = most(labelTexts)[0];
    out.settings.mPlace = pageLab > below ? 'page' : 'below';
    const r = most(new Map(Object.entries(ruleN)));
    if (r && r[1]) out.settings.mRule = r[0];
    if (labelLook) {
      if (labelLook.c) out.settings.mLabelColor = labelLook.c;
      if (labelLook.al) out.settings.mLabelAl = labelLook.al;
    }
  }
  return out;
}

/** عنوان المتن من أول ملفه: أول سطرٍ فيه، قصيرٌ قبل أول عنوان */
export function mutunTitle(pages) {
  const first = String((pages && pages[0] && pages[0].text) || '').split('\n');
  for (const l of first.slice(0, 6)) {
    if (/data-type=["']?title/.test(l)) return '';
    const t = strip(l);
    if (!normT(t)) continue;
    // أول سطرٍ في الملف، قصير، ليس بيتاً ولا جملةً تنتهي بنقطة أو نقطتين
    if (t.length <= 90 && !/ \.\.\. |\t/.test(t) && !/[.:：،]\s*$/.test(t)) return t.replace(/^[\s*«"]+|[\s*»"]+$/g, '');
    return '';
  }
  return '';
}

/** سطر العنوان في أول الملف (اسم المتن) يصير عنواناً أعلى (في وسط صفحته بخط العناوين)، لا فقرةً من المتن */
export function markTitleLine(pages, title) {
  if (!title || !pages || !pages[0]) return pages;
  const lines = String(pages[0].text || '').split('\n');
  for (let j = 0; j < Math.min(lines.length, 6); j++) {
    const t = strip(lines[j]);
    if (!normT(t)) continue;
    if (t.replace(/^[\s*«"]+|[\s*»"]+$/g, '') !== title) return pages;
    lines[j] = `<span data-type="title" data-level="1">${title.replace(/[<>&]/g, '')}</span>`;
    return [{ ...pages[0], text: lines.join('\n') }, ...pages.slice(1)];
  }
  return pages;
}
