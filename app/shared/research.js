// الأبحاث العلمية (الشرعية والأكاديمية): يفهم ورّاق بنية البحث كما في «دليل إعداد وتنسيق البحوث الشرعية»
// فينضّده تنضيد بحثٍ لا تنضيد كتاب:
//  - صفحة العنوان في أوله (الجامعة، الكلية، القسم، العنوان، الباحث، المشرف، العام) تصير صفحة عنوانٍ رسمية،
//  - العناوين تُرتَّب بمصطلحات البحث: المقدمة والتمهيد والخاتمة والمصادر (المستوى الأول)، ثم الباب والفصل
//    والمبحث والمطلب والفرع بحسب ما في البحث منها،
//  - ولكل فقرة دورها: الملخص، والكلمات المفتاحية، والنص الإنجليزي، وقائمة المصادر والمراجع (بمسافة معلّقة).
// يُستعمل في التركيب (compose.js) حين يكون القالب «research»، وفي الواجهة لقراءة بيانات صفحة العنوان.

/** خيارات قراءة ملف البحث: لا متن ولا شرح، والفهرس يبنيه ورّاق، وتبقى صفحات الغلاف وتنسيق الملف */
export const RESEARCH_WORD_OPTIONS = { matn: 'none', embed: 'none', toc: 'site', keepCover: true, keepFormat: true };

/** تطبيع للمقارنة: بلا تشكيل ولا همزات ولا علامات */
export const rnorm = (t) =>
  String(t || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-يa-zA-Z0-9٠-٩\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/* ------------------------------------------------------------ أقسام البحث (المستوى الأول) */
const SECTIONS = [
  ['abstract', /^(ال)?(ملخص|مستخلص)( ال(بحث|دراسه|رساله))?( (باللغه )?(ال)?عربيه?)?$/],
  ['abstractEn', /^(abstract|summary|english abstract|research abstract)$|^(ال)?(ملخص|مستخلص)( ال(بحث|دراسه|رساله))? (باللغه )?(ال)?(انجليزيه|انكليزيه|انقليزيه)$/],
  ['intro', /^(ال)?مقدمه( ال(بحث|دراسه|رساله))?$/],
  ['tamheed', /^(ال)?تمهيد$/],
  ['conclusion', /^(ال)?خاتمه( ال(بحث|دراسه|رساله))?$/],
  ['results', /^(ال)?نتائج( و(ال)?توصيات)?$|^(اهم )?(ال)?نتائج (ال)?(بحث|دراسه)$/],
  ['recs', /^(اهم )?(ال)?توصيات( (ال)?(بحث|دراسه))?$|^(ال)?توصيات و(ال)?مقترحات$/],
  ['endnotes', /^(ال)?هوامش( (ال)?(بحث|دراسه))?$|^(ال)?حواشي (ال)?(بحث|دراسه)$|^(endnotes|notes)$/],
  ['refs', /^((قائمه|ثبت|فهرس) )?(ال)?(مصادر|مراجع)( و(ال)?(مراجع|مصادر))?$|^(references|bibliography|works cited|sources|reference list)$/],
  ['index', /^(ال)?فهارس( (ال)?(عامه|فنيه))?$|^فهرس (ال)?(موضوعات|محتويات|محتوي|ايات|احاديث|اعلام|اثار|اشعار|مصطلحات)/],
  ['appendix', /^(ال)?ملاحق$|^(ال)?ملحق( |$)/],
  ['dedication', /^(ال)?اهداء$/],
  ['thanks', /^(ال)?شكر( و(ال)?(تقدير|عرفان))?$/],
];
// أقسام يجوز أن يتبعها عنوانها بعد «:» (التمهيد: التعريف بمفردات العنوان)
const PREFIXED = new Set(['tamheed', 'conclusion', 'intro', 'appendix', 'index']);
const SECTION_OF = (raw) => {
  const n = rnorm(raw);
  if (!n || n.length > 70) return '';
  for (const [k, re] of SECTIONS) if (re.test(n)) return k;
  const m = /^([^:：\-–—]{2,30})[:：\-–—]/.exec(String(raw || ''));
  if (m) {
    const h = rnorm(m[1]);
    for (const [k, re] of SECTIONS) if (PREFIXED.has(k) && re.test(h)) return k;
  }
  return '';
};
export const sectionOf = SECTION_OF;

/* ------------------------------------------------------------ وحدات البحث: الباب ← الفصل ← المبحث ← المطلب ← الفرع ← المسألة */
const KINDS = ['باب', 'فصل', 'مبحث', 'مطلب', 'فرع', 'مساله'];
const ORD =
  '(ال)?(اول|اولي|ثاني|ثانيه|ثالث|ثالثه|رابع|رابعه|خامس|خامسه|سادس|سادسه|سابع|سابعه|ثامن|ثامنه|تاسع|تاسعه|عاشر|عاشره|حادي|حاديه|تمهيدي|تمهيديه|اخير|اخيره)|[0-9٠-٩]+';
const UNIT_RE = new RegExp(`^(ال)?(باب|فصل|مبحث|مطلب|فرع|مساله)( (${ORD}))( |$)`);
/** نوع وحدة البحث في العنوان («المبحث الأول: …» ← مبحث) */
export function unitOf(raw) {
  const n = rnorm(raw);
  if (!n || n.length > 160) return '';
  const m = UNIT_RE.exec(n);
  return m ? m[2] : '';
}

/* ------------------------------------------------------------ صفحة العنوان */
const INST = /^(المملكه|وزاره|جامعه|الجامعه|كليه|قسم|شعبه|معهد|عماده|برنامج|مركز|مجله|كرسي|الدراسات العليا|دوله|جمهوريه|الادارة|اداره|مجمع|هيئه)( |$)/;
const META = /^(بحث|رساله|مشروع|اطروحه|مذكره|متطلب|استكمالا|لنيل|ضمن|دراسه مقدمه|مقدم|مقدمه (لنيل|استكمالا|ضمن)|قدم|تقدم|research|thesis|dissertation|submitted)( |$)/;
const PERSON = /^(اعداد|الباحث|الباحثه|الطالب|الطالبه|اشراف|المشرف|المشرفه|تحت اشراف|باشراف|سعاده|فضيله|الاستاذ|الاستاذه|الدكتور|الدكتوره|د|ا د|تقديم|تاليف|by|supervised|supervisor|prepared)( |$)/;
const DATE = /(العام الجامعي|العام الدراسي|الفصل الدراسي|السنه الدراسيه|^(عام|سنه) |[0-9٠-٩]{4}|^[0-9٠-٩]{3,4} ?(ه|م)( |$))/;
/** نوع سطرٍ من أسطر صفحة العنوان: inst · meta · person · date · '' (عنوان أو غيره) */
export function titleLineKind(raw) {
  const n = rnorm(raw);
  if (!n) return 'empty';
  if (PERSON.test(n)) return 'person';
  if (INST.test(n)) return 'inst';
  if (META.test(n)) return 'meta';
  if (DATE.test(n) && n.length < 70) return 'date';
  return '';
}
const after = (t) => {
  const m = /[:：]\s*(.+)$/.exec(String(t || ''));
  return (m ? m[1] : String(t || '').replace(/^\S+\s+/, '')).trim();
};
/**
 * بيانات صفحة العنوان من أسطرها: { title, subtitle, author, supervisor, inst[], meta, date }
 * (null إن لم تكن صفحة عنوان بحث)
 */
export function readTitleLines(lines) {
  const L = lines.map((t) => String(t || '').trim()).filter(Boolean);
  if (L.length < 2) return null;
  const kinds = L.map(titleLineKind);
  const out = { title: '', subtitle: '', author: '', supervisor: '', inst: [], meta: '', date: '', kinds };
  let titleAt = -1;
  L.forEach((t, i) => {
    const k = kinds[i];
    if (k === 'inst') out.inst.push(t);
    else if (k === 'meta') out.meta = out.meta || t;
    else if (k === 'date') out.date = out.date || t;
    else if (k === 'person') {
      const n = rnorm(t);
      const v = /[:：]/.test(t) ? after(t) : '';
      // «إعداد الطالب:» وحده في سطر، والاسم في السطر التالي
      const next = !v && L[i + 1] && !kinds[i + 1] ? L[i + 1] : '';
      const name = v || next || after(t);
      if (/^(اشراف|المشرف|المشرفه|تحت اشراف|باشراف|supervised|supervisor)/.test(n)) out.supervisor = out.supervisor || name;
      else out.author = out.author || name;
      if (next) kinds[i + 1] = 'name';
    } else if (k === '' && t.length >= 4) {
      if (titleAt < 0) {
        out.title = t;
        titleAt = i;
      } else if (i === titleAt + 1 && !out.subtitle) out.subtitle = t;
    }
  });
  const marks = kinds.filter((k) => k === 'inst' || k === 'person' || k === 'meta').length;
  if (!out.title || marks < 1) return null;
  return out;
}

const textOf = (b) => (b.type === 'heading' ? b.text || '' : (b.runs || []).map((r) => (r.k === 'r' ? '' : r.s || '')).join(''));
const isLatin = (t) => {
  const lat = (String(t).match(/[A-Za-z]/g) || []).length;
  const ar = (String(t).match(/[ء-ي]/g) || []).length;
  return lat >= 12 && lat > ar * 3;
};

/** صفحة العنوان في أول الملف: أسطر في الوسط قصيرة قبل أول قسمٍ من أقسام البحث */
function leadingTitle(blocks) {
  const lines = [];
  let i = 0;
  for (; i < blocks.length && lines.length < 18; i++) {
    const b = blocks[i];
    if (b.type === 'pagebreak') {
      if (lines.length) {
        i++;
        break;
      }
      continue;
    }
    if (b.type !== 'para' && b.type !== 'heading') break;
    const t = textOf(b).trim();
    if (!t) continue;
    if (t.length > 170 || SECTION_OF(t) || unitOf(t)) break;
    if (b.al !== 'c') break;
    if ((b.runs || []).some((r) => r.k === 'r')) break;
    lines.push({ t, b });
  }
  if (lines.length < 3) return null;
  const meta = readTitleLines(lines.map((x) => x.t));
  if (!meta) return null;
  return { end: i, lines, meta };
}

/** صفحة العنوان صفحةً من الملف (كما يرسمها المحرك لصفحات الملف): المؤسسة أعلاها، والعنوان في وسطها، والباحث والمشرف، ثم العام */
function titlePage(tp, s) {
  const big = Math.max(18, (s.sizes && s.sizes.h1 ? s.sizes.h1 : 18) + 4);
  const mid = (s.sizes && s.sizes.body) || 16;
  const parts = [];
  const kinds = tp.meta.kinds;
  let stage = 0; // 0: أعلى الصفحة · 1: العنوان · 2: البيان · 3: الأسماء · 4: العام
  tp.lines.forEach(({ t }, i) => {
    const k = kinds[i];
    let gap = 0;
    let sz = mid;
    let bold = true;
    if (k === 'inst') {
      gap = parts.length ? 0.004 : 0.01;
    } else if (t === tp.meta.title) {
      gap = stage < 1 ? 0.13 : 0.03;
      sz = big;
      stage = 1;
    } else if (t === tp.meta.subtitle) {
      gap = 0.012;
      sz = mid + 2;
      stage = 1;
    } else if (k === 'meta') {
      gap = stage < 2 ? 0.05 : 0.01;
      bold = false;
      stage = 2;
    } else if (k === 'person' || k === 'name') {
      gap = stage < 3 ? 0.1 : k === 'name' ? 0.004 : 0.03;
      stage = 3;
    } else if (k === 'date') {
      gap = stage < 4 ? 0.12 : 0.01;
      sz = Math.max(12, mid - 2);
      bold = false;
      stage = 4;
    } else {
      gap = 0.02;
    }
    parts.push({ k: 'text', t, al: 'c', b: bold ? 1 : 0, gap, sz });
  });
  return { type: 'pagefig', parts, rtp: true };
}

/* ------------------------------------------------------------ أدوار الفقرات */
const KEYWORDS = /^\s*((?:ال)?كلمات (?:ال)?(?:مفتاحي[ةه]|دال[ةه]|مفتاح)|الكلمات المفتاحية|الكلمات الدالة|كلمات مفتاحية|Key ?words|Index terms)\s*[:：]/i;
/** «الكلمات المفتاحية» وحدها في سطرها (بلا «:»، أو بـ«:» أو شرطة في آخرها)، وكلماتها في السطر الذي بعدها */
const KEYWORDS_HEAD = /^\s*((?:ال)?كلمات (?:ال)?(?:مفتاحي[ةه]|دال[ةه]|مفتاح)|الكلمات المفتاحية|الكلمات الدالة|كلمات مفتاحية|Key ?words|Index terms)\s*[:：\-–—]?\s*$/i;
/** سطر كلماتٍ مفتاحية: قصير، وكلماته مفصولة بفواصل أو «:» أو شرطات */
const kwLine = (t) => t.length > 0 && t.length <= 200 && /[،,;؛:：\-–—]/.test(t) && !/[.؟!]\s*$/.test(t);
/** «الكلمات المفتاحية:» عريضة وحدها */
function boldLead(runs, re) {
  const r0 = runs.find((r) => r.k !== 'r' && r.s && r.s.trim());
  if (!r0 || (r0.k === 'f' && r0.b)) return runs;
  const i = runs.indexOf(r0);
  const m = re.exec(r0.s);
  if (!m) return runs;
  const cut = m.index + m[0].length;
  return [...runs.slice(0, i), { k: 'f', s: r0.s.slice(0, cut), b: 1 }, { ...r0, s: r0.s.slice(cut) }, ...runs.slice(i + 1)].filter((r) => r.k === 'r' || r.s);
}
/** فقرة قصيرة عريضة (أو تنتهي بـ«:»، أو تبدأ بترتيبٍ عربي «أولاً، ثانياً…») في قائمة المراجع: عنوان قسمٍ منها («أولاً: الكتب») */
const REF_ORD = /^(اولا|ثانيا|ثالثا|رابعا|خامسا|سادسا|سابعا|ثامنا|تاسعا|عاشرا|حادي عشر|ثاني عشر)( |$)/;
const refHead = (b, t) => t.length <= 70 && (/[:：]\s*$/.test(t) || REF_ORD.test(rnorm(t)) || (b.runs || []).every((r) => r.k === 'r' || !r.s.trim() || (r.k === 'f' && r.b)));

/**
 * يُحوِّل ما حلّله المحلّل إلى بنية بحث: صفحة العنوان، ومستويات العناوين، وأدوار الفقرات.
 * @returns {{blocks, notes, layout, ownCover, stats}}
 */
export function researchify(vol, s = {}) {
  const src = vol.blocks || [];
  const out = [];
  const tp = leadingTitle(src);
  const firstObj = src.find((b) => b.type !== 'pagebreak');
  let ownCover = !!(firstObj && (firstObj.type === 'pagefig' || firstObj.type === 'coverpage'));
  let start = 0;
  if (tp) {
    out.push(titlePage(tp, s));
    ownCover = true;
    start = tp.end;
  }
  // ١) العناوين: ما كُتب فقرةً وهو عنوانٌ من عناوين البحث يصير عنواناً
  const body = [];
  for (let i = start; i < src.length; i++) {
    let b = src[i];
    if (b.type === 'para') {
      // لا متن في البحث: ما عُلّم متناً يعود نصاً (والآية تبقى آية)
      if (b.mt || b.runs.some((r) => r.k === 'm')) b = { ...b, mt: false, runs: b.runs.map((r) => (r.k === 'm' ? (r.q ? { k: 'q', s: r.s } : { k: 't', s: r.s }) : r)) };
      const t = textOf(b).trim();
      const notes = b.runs.some((r) => r.k === 'r');
      const boldAll = b.runs.every((r) => r.k === 'r' || !r.s.trim() || (r.k === 'f' && r.b));
      const short = t.length <= 120 && !b.runs.some((r) => r.k === 'q');
      const sec = short && !notes ? SECTION_OF(t.replace(/[:：]\s*$/, '')) : '';
      const unit = short && (boldAll || b.al === 'c' || !/[.،]$/.test(t)) ? unitOf(t) : '';
      if (sec || unit) {
        body.push({ type: 'heading', level: sec ? 1 : 2, text: t.replace(/[:：]\s*$/, ''), ...(b.al ? { al: b.al } : {}), ...(b._i != null ? { _i: b._i } : {}), ...(b.ps ? { ps: b.ps } : {}) });
        continue;
      }
    }
    body.push(b);
  }
  // ٢) مستويات وحدات البحث بحسب ما فيه منها
  const present = new Set(body.filter((b) => b.type === 'heading').map((b) => unitOf(b.text)).filter(Boolean));
  const order = KINDS.filter((k) => present.has(k));
  const base = present.has('باب') || present.has('فصل') ? 1 : 2;
  const levelOf = Object.fromEntries(order.map((k, i) => [k, Math.min(4, base + i)]));
  const stats = { sections: 0, units: Object.fromEntries(order.map((k) => [k, 0])), refs: 0, abstract: 0, english: 0, keywords: 0, titlePage: !!tp };
  let parent = 1; // مستوى آخر عنوانٍ معروف
  let section = ''; // القسم الجاري (الملخص، المصادر…)
  let kwNext = false; // السطر السابق «الكلمات المفتاحية» وحدها
  for (let bi = 0; bi < body.length; bi++) {
    const b = body[bi];
    const wasKwHead = kwNext;
    kwNext = false;
    if (b.type === 'heading') {
      const sec = SECTION_OF(b.text);
      const unit = unitOf(b.text);
      let level = b.level;
      if (sec) {
        level = 1;
        section = sec;
        stats.sections++;
      } else if (unit) {
        level = levelOf[unit];
        stats.units[unit]++;
        if (level <= 1) section = '';
      } else if (!b.nt) level = Math.min(4, Math.max(b.level || 2, parent + 1));
      // عنوان أعلى من القسم الجاري (فصل بعد المقدمة) يُنهي القسم
      if (unit && section && level <= 2 && section !== 'refs') section = '';
      if (sec || unit) parent = level;
      out.push({ ...b, level, ...(sec ? { rs: sec } : {}) });
      continue;
    }
    if (b.type !== 'para') {
      out.push(b);
      continue;
    }
    const t = textOf(b).trim();
    let role = '';
    let runs = b.runs;
    const nx = body[bi + 1];
    if (KEYWORDS.test(t)) {
      role = section === 'abstract' || section === 'abstractEn' ? 'abs kw' : 'kw';
      runs = boldLead(runs, KEYWORDS);
      stats.keywords++;
      // «الكلمات المفتاحية:» وحدها وكلماتها في السطر التالي
      if (!t.replace(KEYWORDS, '').trim() && nx && nx.type === 'para' && kwLine(textOf(nx).trim())) kwNext = true;
    } else if (KEYWORDS_HEAD.test(t) && nx && nx.type === 'para' && kwLine(textOf(nx).trim())) {
      // «الكلمات المفتاحية» في سطر وكلماتها في السطر الذي بعده: العنوان عريض، والسطران كلمات مفتاحية
      role = section === 'abstract' || section === 'abstractEn' ? 'abs kw' : 'kw';
      runs = runs.map((r) => (r.k === 't' || r.k === 'f' ? { k: 'f', s: r.s, b: 1 } : r));
      kwNext = true;
      stats.keywords++;
    } else if (wasKwHead) {
      role = section === 'abstract' || section === 'abstractEn' ? 'abs kw' : 'kw';
    } else if (section === 'refs') {
      role = refHead(b, t) ? 'refh' : 'ref';
      if (role === 'ref') stats.refs++;
    } else if (section === 'abstract' || section === 'abstractEn') {
      role = 'abs';
      stats.abstract++;
    }
    if (isLatin(t)) {
      role = role ? role + ' en' : 'en';
      stats.english++;
    }
    out.push(role ? { ...b, runs, role } : runs !== b.runs ? { ...b, runs } : b);
  }
  return { ...vol, blocks: out, layout: 'plain', ownCover, stats: { ...(vol.stats || {}), research: stats } };
}

/* ------------------------------------------------------------ من الواجهة: ما في ملف البحث قبل تنضيده */
const strip = (h) =>
  String(h || '')
    // علامات ملف Word في النص: المحاذاة (\u000e…\u000f)، والتنسيق (\u0010…\u0011 … \u0012)، وأرقام الحواشي (\u0007…\b)
    .replace(/\u000e[^\u000f\n]*\u000f/g, '')
    .replace(/\u0010[^\u0011\n]*\u0011/g, '')
    .replace(/\u0007[^\u0008\n]*\u0008/g, '')
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
/**
 * نظرة سريعة على صفحات البحث (بصيغة الكتاب): بيانات صفحة العنوان، وأقسامه ووحداته.
 * @returns {{meta: object|null, sections: string[], units: object}}
 */
export function researchOutline(pages) {
  const lines = [];
  for (const p of pages || []) {
    for (const l of String((p && p.text) || '').split('\n')) {
      const t = strip(l);
      if (t) lines.push(t);
    }
    if (lines.length > 4000) break;
  }
  const head = [];
  for (const t of lines.slice(0, 24)) {
    if (SECTION_OF(t) || unitOf(t) || t.length > 170) break;
    head.push(t);
  }
  const meta = head.length >= 3 ? readTitleLines(head) : null;
  const sections = [];
  const units = {};
  for (const t of lines) {
    if (t.length > 160) continue;
    const s = SECTION_OF(t.replace(/[:：]\s*$/, ''));
    if (s && !sections.includes(s)) sections.push(s);
    const u = unitOf(t);
    if (u) units[u] = (units[u] || 0) + 1;
  }
  return { meta, sections, units };
}

/** أسماء الأقسام والوحدات (للواجهة) */
export const SECTION_LABEL = {
  abstract: 'الملخص',
  abstractEn: 'الملخص الإنجليزي',
  intro: 'المقدمة',
  tamheed: 'التمهيد',
  conclusion: 'الخاتمة',
  results: 'النتائج',
  recs: 'التوصيات',
  endnotes: 'الهوامش',
  refs: 'المصادر والمراجع',
  index: 'الفهارس',
  appendix: 'الملاحق',
  dedication: 'الإهداء',
  thanks: 'الشكر',
};
export const UNIT_LABEL = { باب: ['باب', 'أبواب'], فصل: ['فصل', 'فصول'], مبحث: ['مبحث', 'مباحث'], مطلب: ['مطلب', 'مطالب'], فرع: ['فرع', 'فروع'], مساله: ['مسألة', 'مسائل'] };
