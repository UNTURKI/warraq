// قواعد التنضيد الأساسية: تُطبَّق على «نموذج الإخراج» بعد تركيبه (shared/compose.js)، للكتب والأبحاث والمتون، في PDF و Word.
//   ١) المسافات (من المحرك نفسه في الكتب والمتون؛ وفي البحث بقرار المستخدم typoRules، أو توحيد المسافات وحده spaceCollapse): لا مسافة قبل علامة الترقيم ومسافةٌ واحدة بعدها «قال، ثم مضى»، والقوس والتنصيص يلتصقان
//      بما بداخلهما «(كذا)»، وإحالة الحاشية تلتصق بالكلمة قبل العلامة «قوله(١).»، وواو العطف تلتصق بما بعدها «والكتاب».
//   ٢) عزو الآيات (ayahCite): صيغةٌ واحدة في الكتاب كله: «[البقرة: ٢٥٥]» بعد الآية بنمطٍ أصغر، أو في الحاشية
//      «سورة البقرة، الآية ٢٥٥». موضع الآية من نصها (shared/quran.js) أو من عزوها المكتوب بعدها.
//   ٣) قول النبي ﷺ (nabawiBold): ما بعد «قال ﷺ» و«قال رسول الله ﷺ» و«قال الرسول» ونحوها، بين علامتي تنصيص
//      أو بعد «:»، بخطٍّ عريض حتى نهاية جملته (نقطةٍ أو آخر الفقرة).
//   ٤) نظام العناوين (headScheme: 'pro' الأصل، و'style' كما صمّمه الأسلوب؛ وفي البحث الأصل 'style'): لكل عنوانٍ دوره (b.hr): الجزء/الباب (part)، والفصل (ch)، والمبحث (h2)، والمطلب (h3)،
//      والفرع والمسألة عنوانٌ مدمج في أول فقرته بعريض المتن و«:» (يصير عنواناً داخل السطر ht). والمقاسات والصفحات في
//      lib/book-html.js و typeset/engine.js.
//
// في «المحرِّر» تحمل المقاطع مواضعها من نص القطعة (_o): قواعد المسافات لا تزيد ولا تنقص إلا مسافات، فيُقسَّم المقطع
// حيث تغيّر ويبقى لكل جزءٍ موضعه، فلا يضلّ المؤشر. وما كتبه المستخدم في المحرِّر بعد ذلك يُكتب فوقها.
import { suraName, suraByName } from './quran.js';

const WS = '[ \\t\\u00A0]';
const AR = '\\u0621-\\u064A';
const HAR = '\\u064B-\\u0652';
const DIG = '0-9\\u0660-\\u0669';
const arNum = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const latin = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660);

/* ====================================================================== */
/* ١) المسافات                                                             */
/* ====================================================================== */
const R = (src, f = 'g') => new RegExp(src, f);
const SPACE_RULES = [
  // مسافاتٌ متتالية: مسافةٌ واحدة
  [R(`${WS}{2,}`), ' '],
  // لا مسافة قبل العلامة
  [R(`${WS}+(?=[،؛؟!:,;?])`), ''],
  [R(`([^\\s.])${WS}+(?=\\.(?!\\.))`), '$1'],
  // ومسافةٌ بعدها (إن تلاها حرف أو قوس)
  [R(`([،؛؟!])(?=[${AR}(«﴿\\[])`), '$1 '],
  [R(`:(?=[${AR}«﴿])`), ': '],
  [R(`\\.(?=[${AR}])`), '. '],
  // القوس والتنصيص يلتصقان بما بداخلهما
  [R(`([(\\[«{﴿“])${WS}+`), '$1'],
  [R(`${WS}+([)\\]»}﴾”])`), '$1'],
  // وبينهما وبين ما خارجهما مسافة (إلا رقم الحاشية بين قوسين: يلتصق بكلمته)
  [R(`([${AR}${HAR}])(?=[«﴿]|\\((?![${DIG}\\s]{1,4}\\)))`), '$1 '],
  [R(`([»﴾]|(?<!\\([${DIG}]{1,3})\\))(?=[${AR}])`), '$1 '],
  // رقم الحاشية المكتوب نصاً «(١)» يلتصق بالكلمة قبله
  [R(`([${AR}${HAR}])${WS}+(?=\\([${DIG}]{1,3}\\))`), '$1'],
  // واو العطف تلتصق بما بعدها
  [R(`(^|[\\s(«])(و[${HAR}]?)${WS}+(?=[${AR}])`), '$1$2'],
];
// داخل الآية: القوسان المزهّران وحدهما (لا يُمسّ نص القرآن)
const BRACKET_RULES = [SPACE_RULES[6], SPACE_RULES[7]];
// البحث («توحيد المسافات» وحده): المسافات المتتالية مسافةً واحدة
const COLLAPSE_RULES = [SPACE_RULES[0]];

export function fixSpaces(s, rules = SPACE_RULES) {
  let t = String(s);
  for (const [re, to] of rules) t = t.replace(re, to);
  return t;
}

/**
 * مقابلة النص بعد القواعد بالنص قبلها (لا يختلفان إلا في المسافات): أجزاءٌ { s, o } و o موضع الجزء في الأصل،
 * أو null لمسافةٍ زيدت. null إن اختلفا في غير المسافات.
 */
function align(a, b) {
  const segs = [];
  let i = 0;
  let j = 0;
  const push = (ch, o) => {
    const last = segs[segs.length - 1];
    if (last && ((o == null && last.o == null) || (o != null && last.o != null && last.o + last.s.length === o))) last.s += ch;
    else segs.push({ s: ch, o });
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) push(b[j++], i++);
    else if (i < a.length && /\s/.test(a[i])) i++;
    else if (j < b.length && /\s/.test(b[j])) push(b[j++], null);
    else return null;
  }
  return segs;
}

/** يطبّق تحويلاً لا يغيّر إلا المسافات على مقطع، ويعيد مقطعاً أو مقاطع (بمواضعها في المحرِّر) */
function respace(r, rules) {
  const next = fixSpaces(r.s, rules);
  if (next === r.s) return [r];
  if (r._o == null) return [{ ...r, s: next }];
  // عنوانٌ داخل السطر له معرّفٌ واحد: لا يُقسَّم في المحرِّر
  if (r.k === 'ht') return [r];
  const segs = align(r.s, next);
  if (!segs) return [r];
  return segs.map((g) => {
    const x = { ...r, s: g.s };
    if (g.o == null) delete x._o;
    else x._o = r._o + g.o;
    return x;
  });
}

const TEXTY = new Set(['t', 'm', 'h', 'f', 'ht', 'kw', 'qm']);
const PUNCT_START = /^[،؛؟!:.,;?]/;
const lastNonRef = (out) => {
  for (let i = out.length - 1; i >= 0; i--) if (out[i].k !== 'r') return i;
  return -1;
};
/** حذف المسافات في آخر مقطع (بلا مساسٍ بمواضعه: ما بقي منه في موضعه) */
const trimEnd = (r) => ({ ...r, s: r.s.replace(/[ \t ]+$/, '') });
const trimStart = (r) => {
  const m = /^[ \t ]+/.exec(r.s);
  if (!m) return r;
  const x = { ...r, s: r.s.slice(m[0].length) };
  if (r._o != null) x._o = r._o + m[0].length;
  return x;
};
const spaceRun = (k) => ({ k: k === 'q' || k === 'h' || k === 'r' || k === 'qref' ? 't' : k, s: ' ' });

/** قواعد المسافات في مقاطع فقرة (أو حاشية) */
export function spaceRuns(runs) {
  let out = [];
  for (const r of runs) {
    if (r.k === 'q') out.push(...respace(r, BRACKET_RULES));
    else if (TEXTY.has(r.k) && typeof r.s === 'string') out.push(...respace(r, SPACE_RULES));
    else out.push(r);
  }
  out = out.filter((r) => r.k === 'r' || r.k === 'rs' || r.s !== '');
  // ما بين المقاطع
  const res = [];
  for (let i = 0; i < out.length; i++) {
    let r = out[i];
    const pi = lastNonRef(res);
    const prev = pi >= 0 ? res[pi] : null;
    const prevIsRef = res.length && res[res.length - 1].k === 'r';
    if (r.k === 'r') {
      // الإحالة تلتصق بالكلمة قبلها، وتسبق العلامة: «قوله.(١)» ← «قوله(١).»
      const moved = [];
      const before = res.length;
      while (res.length && !prevIsRef) {
        const p = res[res.length - 1];
        if (!TEXTY.has(p.k) || typeof p.s !== 'string') break;
        const t = p.s.replace(/[ \t ]+$/, '');
        if (!t) {
          res.pop();
          continue;
        }
        const m = p.k === 't' && /[.،؛:!؟]+$/.exec(t);
        if (m && m[0].length === t.length) {
          moved.unshift({ ...p, s: t });
          res.pop();
          continue;
        }
        if (m) {
          moved.unshift({ k: 't', s: m[0], ...(p._o != null ? { _o: p._o + t.length - m[0].length } : {}) });
          res[res.length - 1] = { ...p, s: t.slice(0, -m[0].length).replace(/[ \t ]+$/, '') };
        } else res[res.length - 1] = { ...p, s: t };
        break;
      }
      // لا كلمة قبلها (أول الفقرة): تبقى العلامة مكانها
      if (!res.length && before) res.push(...moved.splice(0));
      res.push(r, ...moved);
      continue;
    }
    if (prev && typeof r.s === 'string' && typeof prev.s === 'string') {
      const rs = r.s;
      // علامةٌ في أول المقطع: لا مسافة قبلها
      if (PUNCT_START.test(rs.replace(/^[ \t ]+/, ''))) {
        if (!prevIsRef) res[pi] = trimEnd(prev);
        r = trimStart(r);
      } else if (!/^\s/.test(rs) && !/\s$/.test(prev.s) && !prevIsRef) {
        const pe = prev.s.slice(-1);
        const rb = rs[0];
        // بعد العلامة، وقبل الآية والحديث وبعدهما: مسافة
        const needs =
          (/[،؛؟!:.]/.test(pe) && new RegExp(`[${AR}«﴿(\\[]`).test(rb)) ||
          (new RegExp(`[${AR}${HAR}]`).test(pe) && /[«﴿]/.test(rb) && (r.k === 'q' || r.k === 'h')) ||
          (/[»﴾]/.test(pe) && (prev.k === 'q' || prev.k === 'h') && new RegExp(`[${AR}]`).test(rb));
        if (needs) res.push(spaceRun(r.k === 'q' || r.k === 'h' ? prev.k : r.k));
      }
    }
    res.push(r);
  }
  return res.filter((r) => r.k === 'r' || r.k === 'rs' || r.s !== '');
}

/* ====================================================================== */
/* ٢) عزو الآيات                                                           */
/* ====================================================================== */
// عزوٌ مكتوب بعد الآية: «[البقرة: ٢٥٥]»، «[سورة البقرة، الآية ٢٥٥]»، «(البقرة: ٢٥٥-٢٥٧)»
const CITE_AFTER = new RegExp(
  `^${WS}*[\\[(]${WS}*(?:سورة${WS}+)?([${AR} ]{2,24}?)${WS}*[:،,]${WS}*(?:(?:الآيات|الآية|آية|آيات)${WS}*)?([${DIG}]{1,3})(?:${WS}*[-–—]${WS}*([${DIG}]{1,3}))?${WS}*[\\])]`,
);
const citeNums = (a) => (a.from === a.to ? arNum(a.from) : arNum(a.from) + '-' + arNum(a.to));
export const citeInline = (a) => `[${suraName(a.su)}: ${citeNums(a)}]`;
export const citeNote = (a) => `سورة ${suraName(a.su)}، ${a.from === a.to ? 'الآية' : 'الآيات'} ${citeNums(a)}`;

function citeAyat(doc, mode) {
  let seq = 0;
  const noteId = () => {
    let id;
    do id = 'qa' + ++seq;
    while (doc.notes[id]);
    return id;
  };
  for (const b of doc.blocks) {
    // الآية التي تُفسَّر (قالب التفسير) والمتن: لا تُعزى
    if (b.type !== 'para' || b.ay || b.mt || !Array.isArray(b.runs)) continue;
    const runs = [];
    for (let i = 0; i < b.runs.length; i++) {
      const r = b.runs[i];
      runs.push(r);
      if (r.k !== 'q') continue;
      // عزوٌ مكتوب بعدها: يُقرأ ويُحذف (فيُكتب بالصيغة الواحدة)
      let addr = Array.isArray(r.qa) && r.qa.length === 3 ? { su: r.qa[0], from: r.qa[1], to: r.qa[2] } : null;
      const nx = b.runs[i + 1];
      const m = nx && nx.k === 't' && CITE_AFTER.exec(nx.s);
      const su = m ? suraByName(m[1]) : 0;
      if (su) {
        const from = +latin(m[2]);
        const to = m[3] ? +latin(m[3]) : from;
        // المكتوب أوثق من التقدير
        addr = { su, from, to: Math.max(from, to) };
        const rest = { ...nx, s: nx.s.slice(m[0].length) };
        if (nx._o != null) rest._o = nx._o + m[0].length;
        b.runs[i + 1] = rest;
      }
      if (!addr || !suraName(addr.su)) {
        if (su) b.runs[i + 1] = nx; // لم يُعرف: يبقى كما كتب
        continue;
      }
      if (mode === 'note') {
        const id = noteId();
        doc.notes[id] = { id, kind: 'fn', segs: [{ type: 'p', runs: [{ k: 't', s: citeNote(addr) }] }] };
        runs.push({ k: 'r', id });
      } else runs.push({ k: 'qref', s: ' ' + citeInline(addr) });
    }
    b.runs = runs.filter((r) => r.k === 'r' || r.k === 'rs' || r.s !== '');
  }
}

/* ====================================================================== */
/* ٣) قول النبي ﷺ بخطٍّ عريض                                               */
/* ====================================================================== */
const SAW = `(?:ﷺ|صلى${WS}+الله${WS}+عليه${WS}+(?:وآله${WS}+)?(?:و${WS}*)?سلم|عليه${WS}+الصلاة${WS}+والسلام)`;
const PROPHET = `(?:رسول${WS}+الله|النبي|الرسول|نبي${WS}+الله)`;
const SAY = `(?:قال|يقول|فقال|وقال|ويقول|فيقول|قوله|بقوله|لقوله)`;
const TRIGGER = new RegExp(
  `(?:${SAY}${WS}+${PROPHET}(?:${WS}*${SAW})?|${SAY}${WS}*${SAW}|${PROPHET}${WS}*${SAW}${WS}+(?:أنه${WS}+)?${SAY}|${SAW}${WS}+(?:أنه${WS}+)?${SAY})${WS}*(:?)${WS}*`,
  'g',
);
const CLOSE = { '«': '»', '"': '"', '“': '”' };

/** مدى قول النبي ﷺ في نص الفقرة: [[من، إلى]…] */
export function nabawiRanges(text) {
  const out = [];
  TRIGGER.lastIndex = 0;
  let m;
  while ((m = TRIGGER.exec(text))) {
    const e = m.index + m[0].length;
    const open = text[e];
    if (CLOSE[open]) {
      const c = text.indexOf(CLOSE[open], e + 1);
      if (c > e + 1) {
        out.push([e, c + 1]);
        TRIGGER.lastIndex = c + 1;
      }
    } else if (m[1]) {
      // بعد «:» حتى نهاية الجملة
      const rest = text.slice(e);
      const end = rest.search(/[.؟!]/);
      const z = end < 0 ? text.length : e + end;
      if (z > e + 1) {
        out.push([e, z]);
        TRIGGER.lastIndex = z;
      }
    }
  }
  return out;
}

const BOLDABLE = new Set(['t', 'h', 'f']);
function boldRanges(runs, ranges) {
  if (!ranges.length) return runs;
  const out = [];
  let at = 0;
  for (const r of runs) {
    if (r.k === 'r' || typeof r.s !== 'string') {
      out.push(r);
      continue;
    }
    const a0 = at;
    at += r.s.length;
    if (!BOLDABLE.has(r.k) || (r.st && r.st.bold)) {
      out.push(r);
      continue;
    }
    // نقاط القطع داخل هذا المقطع
    const cuts = new Set([0, r.s.length]);
    for (const [x, y] of ranges) {
      if (x > a0 && x < at) cuts.add(x - a0);
      if (y > a0 && y < at) cuts.add(y - a0);
    }
    const pts = [...cuts].sort((p, q) => p - q);
    for (let k = 0; k + 1 < pts.length; k++) {
      const s = r.s.slice(pts[k], pts[k + 1]);
      if (!s) continue;
      const mid = a0 + pts[k];
      const bold = ranges.some(([x, y]) => mid >= x && mid < y) && /[^\s]/.test(s);
      const x = { ...r, s };
      if (r._o != null) x._o = r._o + pts[k];
      if (bold) x.st = { ...(r.st || {}), bold: true };
      out.push(x);
    }
  }
  return out;
}
const runsPlain = (runs) => runs.map((r) => (r.k === 'r' || typeof r.s !== 'string' ? '' : r.s)).join('');
export const nabawiRuns = (runs) => boldRanges(runs, nabawiRanges(runsPlain(runs)));

/* ====================================================================== */
/* ٤) نظام العناوين: دور كل عنوان                                          */
/* ====================================================================== */
const KW = { باب: 'part', قسم: 'part', جزء: 'part', فصل: 'ch', مبحث: 'h2', مطلب: 'h3', فرع: 'ri', مسأله: 'ri', مساله: 'ri' };
const kwOf = (t) => {
  const w = String(t || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/ة/g, 'ه')
    .trim()
    .split(/[\s:،.]+/)[0]
    .replace(/^ال/, '');
  return KW[w] || '';
};
const BY_LEVEL = { 1: 'part', 2: 'ch', 3: 'h2', 4: 'h3' };
/** أكثر ما يُبدأ من الفصول في صفحةٍ فردية (كتبٌ فصولها أبوابٌ صغيرة كثيرة لا تُزاد بها صفحاتٌ بيضاء) */
export const MAX_ODD_CHAPTERS = 60;

export function headRoles(blocks) {
  const hs = blocks.filter((b) => b.type === 'heading');
  const kws = hs.map((b) => kwOf(b.text));
  const kinds = new Set(kws.filter(Boolean));
  const count = (k) => kws.filter((x) => x === k).length;
  // تقسيمٌ علميّ صريح (باب، فصل، مبحث، مطلب، فرع…): الدور من لفظه. وإلا فمن مستواه
  const byWord = kinds.size >= 2 && count('part') <= 40;
  // وما لا لفظ له لا يعلو أعلى ما في الكتاب من الألفاظ إلا درجة: بحثٌ أعلى وحداته المبحث ← «المقدمة» و«الخاتمة» فصول لا أجزاء
  const RANK = ['part', 'ch', 'h2', 'h3', 'ri'];
  const top = byWord ? Math.min(...[...kinds].map((k) => RANK.indexOf(k))) : 0;
  hs.forEach((b, i) => {
    const lv = BY_LEVEL[Math.min(4, Math.max(1, b.level))] || 'h3';
    let r = (byWord && kws[i]) || RANK[Math.max(RANK.indexOf(lv), top - 1, 0)];
    // الفرع والمسألة مدمجان في فقرتهما أينما كانا (ما دون الفصل)
    if (kws[i] === 'ri' && b.level >= 3) r = 'ri';
    b.hr = r;
  });
  const chs = hs.filter((b) => b.hr === 'ch').length;
  return { oddChapters: chs <= MAX_ODD_CHAPTERS };
}

/** الفرع والمسألة: العنوان يُدمج في أول الفقرة التي بعده (عريضاً بعده «:») */
function runIn(doc) {
  const out = [];
  const blocks = doc.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = blocks[i + 1];
    if (b.type === 'heading' && b.hr === 'ri' && n && n.type === 'para' && !n.mt && Array.isArray(n.runs)) {
      const t = String(b.text || '').trim().replace(/[\s:：.]+$/, '');
      blocks[i + 1] = { ...n, runs: [{ k: 'ht', s: t + ':', level: b.level, id: b.id }, { k: 't', s: ' ' }, ...n.runs.map((r, j) => (j === 0 ? trimStart(r) : r))], ri: true };
      const h = (doc.headings || []).find((x) => x.id === b.id);
      if (h) h.inline = true;
      continue;
    }
    out.push(b);
  }
  doc.blocks = out;
}

/* ====================================================================== */
/** القواعد كلها على نموذج الإخراج (يُعدَّل في مكانه، ويُعاد) */
export function applyTypoRules(doc, s) {
  if (!doc || !Array.isArray(doc.blocks)) return doc;
  doc.notes = doc.notes || {};
  // الكتب والمتون: قواعد المسافات من المحرك نفسه (لا خيار). البحث: لا يُغيَّر نص الباحث إلا بقراره الصريح
  // (typoRules: القواعد كلها · spaceCollapse: توحيد المسافات المتتالية وحده)، وقول النبي ﷺ عريضاً كذلك
  const research = !!doc.research;
  const spaces = research ? s.typoRules === true : true;
  const collapse = research && !spaces && s.spaceCollapse === true;
  const nabawi = research ? s.nabawiBold === true : s.nabawiBold !== false;
  if (s.ayahCite === 'matn' || s.ayahCite === 'note') citeAyat(doc, s.ayahCite);
  // ما كتبه المستخدم بيده في «المحرِّر» (ue): يبقى كما كتبه
  const fixRuns = (runs, mine) => {
    let x = runs;
    if (spaces && !mine) x = spaceRuns(x);
    else if (collapse && !mine) x = x.flatMap((r) => (TEXTY.has(r.k) && typeof r.s === 'string' ? respace(r, COLLAPSE_RULES) : [r]));
    if (nabawi) x = nabawiRuns(x);
    return x;
  };
  if (spaces || collapse || nabawi) {
    for (const b of doc.blocks) {
      if (b.type === 'para' && Array.isArray(b.runs)) b.runs = fixRuns(b.runs, !!b.ue);
      // العنوان: في المحرِّر يُكتب بنصه كما هو (موضع المؤشر من نصه)
      else if ((spaces || collapse) && (b.type === 'heading' || b.type === 'label') && typeof b.text === 'string' && b._i == null && !b.ue) b.text = fixSpaces(b.text, spaces ? SPACE_RULES : COLLAPSE_RULES);
    }
    // (الحواشي مشتركة مع ناتج المحلّل: تُنسخ ولا تُغيَّر في مكانها)
    for (const [id, n] of Object.entries(doc.notes)) {
      if (!n || !Array.isArray(n.segs)) continue;
      doc.notes[id] = { ...n, segs: n.segs.map((sg) => (sg && Array.isArray(sg.runs) ? { ...sg, runs: fixRuns(sg.runs, !!sg.ue) } : sg)) };
    }
  }
  // نظام العناوين: المعتمد أصلاً في الكتب والمتون (إلا «كما صمّمه الأسلوب»)، وفي البحث باختياره وحده
  if (research ? s.headScheme === 'pro' : s.headScheme !== 'style') {
    const { oddChapters } = headRoles(doc.blocks);
    doc.oddChapters = oddChapters;
    runIn(doc);
  }
  return doc;
}
