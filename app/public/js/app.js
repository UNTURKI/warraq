// واجهة «ورّاق»: البحث ← المجلدات ← الإعدادات ← الجلب الخلفي ← PDF/Word ← ZIP
import { PRESETS, DEFAULT_BOOK_STYLE, TEMPLATES, MATN_COLORS, ORNAMENTS, VERSE_SEPS, FONTS, NAMES_FONT, styleSettings, registerFonts, RESEARCH_LAYOUTS, applyResearchLayout, kindOf, styleFits, isResearchSettings } from '/shared/presets.js';
import { RESEARCH_WORD_OPTIONS, researchOutline, SECTION_LABEL, UNIT_LABEL } from '/shared/research.js';
import { openGate, closeGate, gateOpen, kindPill, isKind, WORK_KINDS } from '/js/kind-gate.js';
import { MUTUN_DEFAULTS, MUTUN_KEYS, cleanMutun, analyzeMutunPages, rangeHeads, mutunTitle, mutunOutline, markTitleLine, stripRunHeads } from '/shared/mutun.js';
import { createMutunPanel, createRangePanel } from '/js/mutun-panel.js';
import { createPreview } from '/js/preview.js';
import { packShelves, spineWidth, isNarrow, watchWidth } from '/js/shelf.js';
import { drawStyleCard } from '/js/style-card-art.js';
import { composeVolume } from '/shared/compose.js';
import { applyEdits, sigOf, opId } from '/shared/edits.js';
import { packBook, unpackBook, isBookFile } from '/shared/book-file.js';
import { toArabicDigits as ar, toLatinDigits, volumeLabel, escapeHtml as esc, normalizeArabic } from '/shared/arabic.js';
import { makeZip } from '/shared/zip.js';
import { splitVolumes, cleanSplit, printedRuns, topHeads, startsByCount, headAt, printedPage, printedVolOf, countPrinted, entryOfPrinted, MAX_SPLIT } from '/shared/split.js';
import { initMyStyles, loadMyStyles, deleteMyStyle, downloadCard, takePick, userStylePayload, readCardFile, installMyCard } from '/js/my-styles.js';
import { orderVolumes, setTitle, volNumberOf } from '/shared/volset.js';
import { pageGeom } from '/shared/margin.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
// صفحات الكتاب كما طُبع (totalPages مدخلات ملفه، وبها يُجلب)
const bookPages = (b) => b.printedPages || b.totalPages || 0;

/* ---- برنامج سطح المكتب: الإخراج يُحفظ في مجلد الكتاب مباشرة (المستندات\الورّاق\اسم الكتاب) بدل التنزيل والملف المضغوط ---- */
const DESK = window.warraqDesktop || null;
// حال المشروع (أعلى الملف: تُستعمل أثناء تحميل الصفحة نفسه، والوحدة تنتظر أساليبها في أولها)
const PROJECT_FORMAT = 'warraq-project';
let autoT = 0; // مهلة الحفظ التلقائي
let restoring = false; // تُعاد الآن مشروعاً: لا يُحفظ ما في منتصف الإعادة
let tellT = 0; // مهلة إخبار الهيكل بحال المنضدة
let doneWaiters = []; // من ينتظر تمام الإخراج (النسّاخ)
// النسّاخ: منضدة خفية في الهيكل تُخرج ما في الطابور (بلا حفظ تلقائي ولا تنبيهات على الشاشة)
const SCRIBE = !!DESK && new URLSearchParams(location.search).get('scribe') === '1';
/** مسار الملف على الجهاز (ليُعاد فتحه منه حين يُفتح المشروع) */
const deskPathOf = (f) => {
  if (!DESK || !f) return '';
  if (f.__path) return f.__path;
  try {
    return (DESK.pathOf && DESK.pathOf(f)) || '';
  } catch {
    return '';
  }
};
if (DESK) {
  // خط الكتاب يثبّته البرنامج في Windows عند التثبيت، فإرفاقه بالمجلد لمن يُرسَل إليه ملف Word فقط
  const zf = $('#zipFonts');
  zf.checked = false;
  // «وَرَق» صيغة البرنامج: تُختار مع PDF و Word ابتداءً
  $('#outWaraq').checked = true;
  zf.parentElement.lastChild.textContent = 'ضع ملفي خط الكتاب في مجلده (لمن تُرسل إليه ملف Word)';
  $('#zipAll').textContent = 'افتح مجلد الكتاب';
  const reset = $('#resetBtn');
  reset.textContent = 'كتاب جديد';
  reset.title = 'ابدأ كتاباً جديداً (Ctrl+N)';
  // مغادرة الصفحة أثناء الإخراج تُسأل عنها (البرنامج يعرض السؤال)
  window.addEventListener('beforeunload', (e) => {
    if (state && state.running) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ---- أساليب دور النشر وخطوط الموقع: من الخادم (المضمّنة + ما أضافه المالك) ---- */
// ومعها «أساليبي»: ما صنعه المستخدم في «صانع الأساليب» (محفوظة في متصفحه، معلَّمة mine)
let SITE_STYLES = Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, desc: p.desc, settings: p, builtin: true }));
await initMyStyles().catch(() => []);
let STYLES = [...SITE_STYLES, ...loadMyStyles()];
let SITE_FONTS = [];
// لكل نوعٍ أساليبه (الكتب، الأبحاث، المتون): الأسلوب يحمل نوعه في إعداداته (settings.kind)، والأسلوب الشامل (all) يظهر معها كلها
const stylesOf = (kind) => STYLES.filter((x) => styleFits(x.settings, kind));
/** أساليب المعروض: البحث بأساليب الأبحاث، والمتن بأساليب المتون ثم الكتب (بلا تكرار الشامل) */
const stylesForWork = (R) => {
  const all = R ? stylesOf('research') : workKind === 'mutun' ? [...stylesOf('mutun'), ...stylesOf('books')] : stylesOf('books');
  return all.filter((x, i) => all.findIndex((y) => y.id === x.id) === i);
};
/** النوع الذي يُطبَّق له الأسلوب الآن */
const benchKind = () => ((state && state.settings && isResearchSettings(state.settings)) || researchMode ? 'research' : workKind === 'mutun' ? 'mutun' : 'books');
const styleById = (id) => (id === 'file' && fileStyle()) || STYLES.find((x) => x.id === id) || stylesOf('books')[0] || STYLES[0];
/** إعدادات البحث: آخر أسلوب بحث اختير (أو أولها)، بقالب البحث الذي اختير */
const researchDefaults = (layout) => {
  const list = stylesOf('research');
  const st = list.find((x) => x.id === lastResearchStyle()) || list[0];
  return applyResearchLayout(st ? settingsOf(st, 'research') : { ...defaultSettings(), kind: 'research', research: true }, layout || lastResearchLayout());
};
function lastResearchLayout() {
  try {
    return localStorage.getItem('warraq.researchLayout') || 'uni';
  } catch {
    return 'uni';
  }
}
function lastResearchStyle() {
  try {
    return localStorage.getItem('warraq.researchStyle') || '';
  } catch {
    return '';
  }
}
/** إعدادات أسلوب كاملة. أسلوب من صنع المستخدم: إعداداته هو، وإضافات أسلوب الموقع الذي بدأ منه (base) يطبّقها الخادم بمعرّفه */
function settingsOf(st, kind) {
  let k = kind;
  if (!k) {
    try {
      k = benchKind();
    } catch {
      k = 'books';
    }
  }
  const s = styleSettings(st, k);
  if (st && st.mine) s.styleId = SITE_STYLES.some((x) => x.id === st.base) ? st.base : '';
  if (st && st.file) s.styleId = '';
  return s;
}
const defaultSettings = () => settingsOf(STYLES.find((x) => x.id === DEFAULT_BOOK_STYLE) || stylesOf('books')[0] || STYLES[0], 'books');
/* ---- لون الورق ---- */
function loadPaper() {
  try {
    return localStorage.getItem('warraq.paper') === 'yellow' ? 'yellow' : 'white';
  } catch {
    return 'white';
  }
}
function setPaper(v, quiet) {
  state.paper = v === 'yellow' ? 'yellow' : 'white';
  try {
    localStorage.setItem('warraq.paper', state.paper);
  } catch {}
  for (const b of $$('#paperSeg [data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === state.paper));
  if (quiet) return;
  preview.update();
  if (DESK) autosave();
  try {
    window.dispatchEvent(new CustomEvent('warraq:look'));
  } catch {}
}
/* ---- الهامش الخارجي: معتاد، أو واسع في طرف الكتاب (النص ١١ سم والهامش ٤ سم في صفحة ١٧ سم) — shared/margin.js ----
   on: الواسع · odd: الصفحة الفردية يسرى (l، الكتاب العربي) أو يمنى (r) · box: نص الهامش في خانة (null: كالأسلوب) */
function loadOm() {
  try {
    const v = JSON.parse(localStorage.getItem('warraq.om') || 'null');
    if (v && typeof v === 'object') return { on: v.on === true, odd: v.odd === 'r' ? 'r' : 'l', box: typeof v.box === 'boolean' ? v.box : null };
  } catch {}
  return { on: false, odd: 'l', box: null };
}
function setOm(v, quiet) {
  const o = { ...state.om, ...(v || {}) };
  state.om = { on: o.on === true, odd: o.odd === 'r' ? 'r' : 'l', box: typeof o.box === 'boolean' ? o.box : null };
  try {
    localStorage.setItem('warraq.om', JSON.stringify(state.om));
  } catch {}
  renderOm();
  if (quiet) return;
  preview.update();
  if (DESK) autosave();
  try {
    window.dispatchEvent(new CustomEvent('warraq:look'));
  } catch {}
}
/** الإعدادات بالهامش الذي اختاره المستخدم: عرض الهامش الخارجي من الأسلوب (وإلا ٤ سم)، وتشغيله وجهة الصفحات منه هو */
function omSettings(s) {
  const om = { ...(s.outerMargin || {}), on: state.om.on, odd: state.om.odd };
  const out = { outerMargin: om };
  if (state.om.box !== null) out.sideNote = { ...(s.sideNote || {}), box: state.om.box };
  return out;
}
function renderOm() {
  const row = $('#omRow');
  if (!row) return;
  for (const b of $$('#omSeg [data-om]')) b.setAttribute('aria-pressed', String((b.dataset.om === 'on') === state.om.on));
  for (const b of $$('#omOdd [data-odd]')) b.setAttribute('aria-pressed', String(b.dataset.odd === state.om.odd));
  $('#omOdd').hidden = !state.om.on;
  // المقاسات من صفحة الأسلوب: عرض النص معتاداً وواسعاً، والهامش الخارجي
  const s = state.settings || {};
  const g0 = pageGeom({ ...s, outerMargin: null });
  const g1 = pageGeom({ ...s, outerMargin: { ...(s.outerMargin || {}), on: true } });
  const cm = (mm) => ar(String(Math.round(mm) / 10).replace('.', '٫'));
  $('#omOff').textContent = `النص ${cm(g0.text)} سم، والهامشان ${cm(g0.inner)} سم`;
  $('#omOn').textContent = `النص ${cm(g1.text)} سم، والهامش الخارجي ${cm(g1.outer)} سم`;
}
/* ---- «كما في الملف»: الأسلوب الذي في ملف Word نفسه ---- */
// صفحته وهوامشها، وخطه ومقاسه ولونه، وعناوينه بمقاساتها وألوانها ومحاذاتها — بلا زخرفةٍ ولا إطار، ولا باب في صفحة جديدة،
// ولا رأس صفحة؛ والفهرس حيث كان في الملف (أو لا فهرس)
function fileStyle() {
  const w = state.book && state.book.word;
  const L = w && w.look;
  if (!L) return null;
  const base = defaultSettings();
  const n = (v, d, lo, hi) => (Number(v) > 0 ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const font = (f, d) => {
    const k = String(f || '').trim();
    if (!k) return d;
    return Object.keys(FONTS).find((x) => x.toLowerCase() === k.toLowerCase()) || k.replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const H = L.heads || {};
  const body = n(L.size, base.sizes.body, 9, 26);
  const text = /^#[0-9a-f]{6}$/i.test(L.textColor || '') ? L.textColor : /^#[0-9a-f]{6}$/i.test(L.color || '') ? L.color : '#000000';
  const hc = (l) => (H[l] && /^#[0-9a-f]{6}$/i.test(H[l].color || '') ? H[l].color : text);
  const settings = {
    ...base,
    preset: 'file',
    // صفحة الملف وهوامشها كما هي (والهامش الواسع أعلاها أو أسفلها يبقى: منطقةٌ في خلفية الصفحة)
    page: (() => {
      const P = L.page || {};
      const pg = { w: n(P.w, base.page.w, 100, 300), h: n(P.h, base.page.h, 140, 420), side: n(P.side, base.page.side, 6, 45), top: n(P.top, base.page.top, 6, 250), bottom: n(P.bottom, base.page.bottom, 6, 250) };
      if (pg.top > 50 || pg.bottom > 50) {
        pg.wide = true;
        // رقم الصفحة في موضعه من تذييل الملف (لا في وسط الهامش الواسع)
        if (Number(P.footer) > 0) pg.footer = Math.min(60, Number(P.footer));
      }
      return pg;
    })(),
    // رقم الصفحة بلونه ومقاسه في الملف
    ...(L.folio && /^#[0-9a-f]{6}$/i.test(L.folio.color || '') ? { folioColor: L.folio.color } : {}),
    ...(L.folio && Number(L.folio.size) >= 8 ? { folioSize: Math.min(28, Number(L.folio.size)) } : {}),
    fonts: { ...base.fonts, body: font(L.font, base.fonts.body), heading: font((H[1] || {}).font || L.font, base.fonts.heading) },
    sizes: { body, note: Math.max(9, Math.round(body * 0.8 * 2) / 2), h1: n((H[1] || {}).size, body * 1.4, 12, 44), h2: n((H[2] || {}).size, body * 1.2, 11, 38), h3: n((H[3] || {}).size, body * 1.1, 10, 32), h4: n((H[4] || {}).size, body, 9, 30) },
    textColor: text,
    headingColors: { 1: hc(1), 2: hc(2), 3: hc(3), 4: hc(4) },
    headAl: (H[1] || {}).jc === 'center' ? 'c' : 'r',
    ornaments: false,
    frame: false,
    chapterNewPage: false,
    runningHead: false,
    headScheme: 'style', // عناوين الملف كما هي
    tocPosition: w.hasToc ? (w.tocAt === 'start' ? 'start' : 'end') : 'none',
    // تباعد أسطر الملف (الغالب فيه)، وإلا ١٫٦
    lineHeight: Number(L.lineHeight) >= 1 ? Math.min(2.8, Math.max(1.2, Number(L.lineHeight))) : 1.6,
    design: {},
  };
  return { id: 'file', name: 'كما في الملف', desc: 'خطوط الملف ومقاساته وألوانه وصفحته كما هي: بلا زخرفةٍ ولا إطار، ولا ترتيبٍ جديد. وغيّر منه ما شئت.', settings, file: true };
}
/** الخروج من «كما في الملف» في المتون: موضع التعليق «كما في الملف» (لا شيء) يعود موضعاً يضعه ورّاق */
function leaveFileMutun() {
  if (!mutunOn() || !state.mutun || state.mutun.mPlace !== 'none') return;
  const look = loadMutunLook() || {};
  state.mutun = cleanMutun({ ...state.mutun, mPlace: look.mPlace && look.mPlace !== 'none' ? look.mPlace : 'page' });
  saveMutunLook();
  muNotify();
}
/** «ضع الكتاب كما هو» (حرفياً): أسلوب الملف، وتنسيقه وغلافه، وترتيبه — ثم يغيّر المستخدم ما يشاء وحده */
function setAsIs(on) {
  state.asIs = !!on;
  if ($('#wordAsIs')) $('#wordAsIs').checked = state.asIs;
  if (state.asIs) {
    const st = fileStyle();
    if (st) state.settings = { ...st.settings, template: state.settings.template || 'full' };
    state.innerCover = false;
    state.innerTouched = true;
    if ($('#wordInner')) $('#wordInner').checked = false;
    // المتون: الأجزاء كما في الملف، ولا يُزاد ما لم يكن فيه (نصٌّ قبل المتن، موضع تعليق، أرقام)
    if (mutunOn()) {
      const d = (state.book && state.book.mdetect) || {};
      // (ملفٌ بخلفيةٍ لصفحاته: موضع التعليق في تصميمه نفسه، فلا يُزاد عليه)
      const had = !(state.bgs && state.bgs.body) && !!(d.mPlace || (state.book && state.book.mread && state.book.mread.labels));
      const nums = !!(MU.est && MU.est.srcNums);
      state.mutun = cleanMutun({ ...state.mutun, mDivide: 'manual', mIntro: '', ...(had ? {} : { mPlace: 'none' }), ...(nums ? {} : { mNum: 'off', mSeq: 'off' }) });
      saveMutunLook();
      muNotify();
    }
  } else {
    state.settings = defaultSettings();
    leaveFileMutun();
    state.innerCover = true;
    if ($('#wordInner')) $('#wordInner').checked = true;
  }
  state.settingsTouched = false;
  renderSettingsUI();
  if (mutunOn()) refreshMutunData(false);
  preview.update();
  if (DESK) autosave();
}
/** أسلوبٌ من أساليبي بإضافاته (صور، تنسيق، طباعة، خطوط): يُرسل مع التنضيد والمعاينة */
const userStyleNow = () => userStylePayload(STYLES.find((x) => x.id === state.settings.preset));

/* ------------------------------------------------------------------ الحالة (ذاكرة الجلسة فقط) */
let state;
/* ---- الغلاف الخارجي: في ذاكرة الجلسة (sessionStorage) فقط ---- */
const OUTER_KEY = 'warraq.outer';
// الغلاف: الأمامي (design) والخلفي (back) والكعب (spine)، وورق المتن لحساب الكعب، وغلاف الطباعة المفرود
// ولون الكتاب المجسَّم (bookColor): فارغٌ = من الغلاف، وإلا اللون الذي اختاره المستخدم
const OUTER_BLANK = () => ({ authorShort: '', authorTitle: '', edited: [], mode: 'none', design: null, back: null, spine: null, tab: 'front', paper: null, wrap: true, bundle: '', bookColor: '' });
function loadOuter() {
  try {
    return { ...OUTER_BLANK(), ...JSON.parse(sessionStorage.getItem(OUTER_KEY) || '{}') };
  } catch {
    return OUTER_BLANK();
  }
}
function saveOuter() {
  try {
    sessionStorage.setItem(OUTER_KEY, JSON.stringify(state.outer));
  } catch {
    // صور المستخدم قد تتجاوز سعة الجلسة: نحفظ بدونها (تبقى في الذاكرة)
    try {
      const slim = (d) => (d && d.state && (d.state.custom || d.state.userVariants) ? { ...d, state: { ...d.state, custom: undefined, userVariants: undefined } } : d);
      sessionStorage.setItem(OUTER_KEY, JSON.stringify({ ...state.outer, design: slim(state.outer.design), back: slim(state.outer.back), spine: slim(state.outer.spine) }));
    } catch {}
  }
}

function freshState() {
  return {
    book: null, // من /api/book
    localPages: null, // صفحات كتاب المستخدم «كتابي» (ملف Word قُرئ في المتصفح)
    parts: [], // كتب من ملفات Word (من جهاز المستخدم، أو من مجلد الكتب) هي أجزاء الكتاب: واحد = كتابه، وأكثر = مجلداته
    setName: '', // اسم المجموعة حين تتعدد الأجزاء (اسم المجلد الحاوي، أو المشترك بين أسماء الملفات)
    setAuthor: '',
    setKeepNums: false, // أرقام المجلدات من أسماء الملفات (فلا تُعاد تسلسلاً عند الحذف)
    myFile: null, // ملف «كتابي» نفسه في الذاكرة: { bytes, name, id } (لإعادة قراءته بخيارات أخرى)
    fileCover: '', // صورة غلاف ملف Word (إن كان أوله صورة تملأ الصفحة)
    cover: {},
    dirty: new Set(), // حقول الغلاف التي عدّلها المستخدم (لا يغيّرها التحليل)
    tplTouched: false,
    loadSeq: 0,
    meta: { bookType: '', source: '' },
    outer: loadOuter(), // بيانات الغلاف الخارجي في ذاكرة الجلسة
    selected: new Set(),
    settings: defaultSettings(),
    // المتون: إعداداتها وحدها (لا تمسّها الأساليب والقوالب)، وتُضم إلى الإعدادات عند التنضيد
    mutun: loadMutunLook(),
    // لون الورق (أبيض أو أصفر كالكتب الشرعية): يبقى ما اختاره المستخدم آخر مرة، ولا تمسّه الأساليب
    paper: loadPaper(),
    // الهامش الخارجي (معتاد أو واسع في طرف الكتاب، وجهة الصفحة الفردية، ونص الهامش في خانة): يبقى ما اختاره المستخدم آخر مرة
    om: loadOm(),
    // «كما في الملف حرفياً»: شكل الملف نفسه، بلا ترتيبٍ ولا تنضيدٍ من ورّاق (إلا ما يغيّره المستخدم)
    asIs: false,
    // خلفيات الصفحات { body, h1, h2, toc }: صورٌ يختارها المستخدم أو جاءت من ملف Word (لا تمسّها الأساليب)
    bgs: {},
    // «بدون أسلوب»: إعدادات الكتاب الأصلية (أسلوب الملف، أو الأسلوب الذي كان عليه بتعديلاته) قبل أن يُختار له أسلوبٌ في المحرِّر
    noStyle: null,
    settingsTouched: false, // غيّر المستخدم شيئاً من الإعدادات بيده
    worker: null,
    parsed: new Map(), // vol → parsed
    // «المحرِّر»: ما غيّره المستخدم فيما فهمه المحلّل (يُعاد على كل تحليل، ويُحفظ في المشروع)
    edits: { v: 1, ops: [] },
    edCache: new Map(), // vol|خيارات القراءة → ناتج المحلّل (للمحرِّر)
    // «كتاب ورق»: الكتاب كما فهمه ورّاق، في ملفه (‎.waraq): { vols: Map(المجلد ← ناتج المحلّل)، file، manifest }
    // إن وُجد أُخرج منه الكتاب فلا يُجلب من مصدره مرة أخرى
    doc: null,
    files: new Map(), // vol → {pdf: Blob, docx: Blob, urls: []}
    renderQueue: Promise.resolve(),
    aborts: new Set(),
    running: false,
    totals: { done: 0, total: 0 },
  };
}
state = freshState();

/** أرقام مشرقية بفاصل الألوف */
const arN = (n) => ar(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
/** الإشعار، وعليه ختم من هوامش المخطوطات: «بلغ» عند التمام، و«قف» عند ما يستوقف */
function toast(msg, ms = 3200, kind) {
  if (SCRIBE) return;
  const t = $('#toast');
  if (!kind) kind = /^(تعذّر|تعذر|خطأ|أوقف|اكتب|حدّد|اختر|لا توجد|أُوقفت)/.test(msg) ? 'no' : /^(حُفظ|اعتُمد|تمت|تمّ)/.test(msg) ? 'ok' : '';
  t.innerHTML = (kind ? `<span class="seal ${kind}">${kind === 'ok' ? 'بلغ' : 'قف'}</span>` : '') + '<span></span>';
  t.lastElementChild.textContent = msg;
  t.setAttribute('role', kind === 'no' ? 'alert' : 'status');
  t.hidden = true;
  void t.offsetWidth; // يُعاد الختم مع كل إشعار
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

async function api(path, opts = {}) {
  const ac = new AbortController();
  state.aborts.add(ac);
  try {
    const r = await fetch(path, { ...opts, signal: ac.signal });
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try {
        msg = (await r.json()).error || msg;
      } catch {}
      throw new Error(msg);
    }
    return r;
  } finally {
    state.aborts.delete(ac);
  }
}

/* ------------------------------------------------------------------ ١. البحث */
/* اقتراحات فورية أثناء الكتابة */
let sugSeq = 0;
let sugTimer = null;
let sugIndex = -1;
const hideSuggest = () => {
  $('#suggest').hidden = true;
  sugIndex = -1;
};
// مجموعات الكتب التي جاءت في بحث «#» (مجلد فيه كتب): بمعرّفها، لتُفتح عند اختيارها
const setHits = new Map();
$('#q').addEventListener('input', () => {
  clearTimeout(sugTimer);
  const q = $('#q').value.trim();
  if (!q) return hideSuggest();
  sugTimer = setTimeout(async () => {
    const my = ++sugSeq;
    try {
      const r = await fetch('/api/search?quick=1&q=' + encodeURIComponent(q) + srcQuery());
      const d = await r.json();
      if (my !== sugSeq) return; // نتيجة قديمة
      const list = d.results || [];
      const mine = isMyBook(q) ? '<li role="option" data-my="1"><b>📄 كتابي</b><span>ضع ملف Word من جهازك ليكون كتاباً</span></li>' : '';
      if (!list.length && !mine) return hideSuggest();
      for (const b of list) if (b.set) setHits.set(b.id, b);
      $('#suggest').innerHTML =
        mine +
        list
          .map((b, i) =>
            b.set
              ? `<li role="option" data-set="${esc(b.id)}" data-i="${i}"><b>${esc(b.name)}</b><span>مجلد فيه كتب · ${esc(b.cat || '')}${b.author ? ' · ' + esc(b.author) : ''}</span></li>`
              : `<li role="option" data-id="${esc(b.id)}" data-src="${esc(b.src || '')}" data-i="${i}"><b>${esc(b.name)}</b><span>${esc(b.author || '')}${b.cat ? ' · ' + esc(b.cat) : ''}${srcBadge(b)}</span></li>`,
          )
          .join('');
      $('#suggest').hidden = false;
      sugIndex = -1;
    } catch {}
  }, 160);
});
/** اختيار اقتراح أو نتيجة: كتاب، أو مجلد فيه كتب، أو «كتابي» */
function pickHit(el) {
  if (el.dataset.my) return showMyBook();
  if (el.dataset.set) return loadSet(setHits.get(el.dataset.set));
  if (addMode) return addFromSource(el.dataset.id, el.dataset.src);
  loadBook(el.dataset.id, el.dataset.src);
}
$('#q').addEventListener('keydown', (e) => {
  const items = $$('#suggest li');
  if ($('#suggest').hidden || !items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugIndex = (sugIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('on', i === sugIndex));
  } else if (e.key === 'Enter' && sugIndex >= 0) {
    e.preventDefault();
    const li = items[sugIndex];
    hideSuggest();
    pickHit(li);
  } else if (e.key === 'Escape') hideSuggest();
});
$('#suggest').addEventListener('mousedown', (e) => {
  const li = e.target.closest('li[data-id], li[data-my], li[data-set]');
  if (!li) return;
  e.preventDefault();
  hideSuggest();
  if (li.dataset.id) $('#q').value = li.querySelector('b').textContent;
  pickHit(li);
});
$('#q').addEventListener('blur', () => setTimeout(hideSuggest, 150));

$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  // اقتراحات كانت في الطريق لا تظهر بعد الضغط على «بحث»
  clearTimeout(sugTimer);
  sugSeq++;
  hideSuggest();
  const q = $('#q').value.trim();
  const sets = q.startsWith('#'); // «#»: البحث عن مجلد فيه كتب، لا عن كتاب واحد
  if (!sets && q.length < 2) return toast('اكتب اسم الكتاب أو المؤلف');
  // «كتابي»: خانة لملف Word من جهاز المستخدم بدل البحث
  if (isMyBook(q)) return showMyBook();
  wordMode = false;
  const st = $('#searchStatus');
  st.hidden = false;
  st.className = 'status';
  st.textContent = sets ? 'يُبحث عن مجلدات الكتب على الجهاز' : `يُبحث في ${searchWhere()}`;
  // المِسطرة: تُسطَّر الورقة أثناء الانتظار، ثم يُكتب النص على السطور ويجفّ حبره
  $('#results').className = 'res wait';
  $('#results').innerHTML = '<li><b>شرح رياض الصالحين</b><span>محمد بن صالح</span></li><li><b>رياض الصالحين</b><span>يحيى بن شرف النووي</span></li><li><b>نزهة المتقين شرح رياض</b><span>مصطفى الخن</span></li>';
  renderSources();
  const btn = $('#searchBtn');
  const btnHtml = btn.innerHTML;
  btn.classList.add('busy');
  btn.innerHTML = 'يبحث<span class="spin"><i></i><i></i><i></i></span>';
  try {
    const data = await (await api('/api/search?q=' + encodeURIComponent(q) + srcQuery())).json();
    $('#results').className = 'res dry';
    $('#results').innerHTML = '';
    if (sets) {
      // مجلدات فيها كتب: كل مجلد كتابٌ واحد، وملفاته مجلداته بأرقامها التي في أسمائها
      if (data.noFolders) st.textContent = 'علامة # تبحث عن مجلد فيه كتب بين مجلدات الكتب على الجهاز (يضيفها المالك من «مصادر المعرفة ← مصادر الكتب»)، وليس منها شيء الآن. ولملفاتك أنت: اختر «ملف Word من جهازي» وضع عدة ملفات معاً أو مجلداً كاملاً.';
      else if (!data.results.length) st.textContent = 'لا مجلد كتب بهذا الاسم. اكتب # وحدها لترى كل المجلدات التي فيها كتب.';
      else st.textContent = `مجلدات الكتب المطابقة: ${ar(data.results.length)}. اختر مجلداً فتصير ملفاته مجلدات كتاب واحد بحسب أرقامها في أسمائها.`;
      for (const r of data.results) setHits.set(r.id, r);
      $('#results').innerHTML = data.results
        .map((r) => `<li><button type="button" data-set="${esc(r.id)}"><i class="d"></i><span class="t">${esc(r.name)}</span><span class="m">${esc(r.cat || '')}</span><span class="a">${r.author ? esc(r.author) + ' · ' : ''}<span class="muted">مجلد فيه كتب</span>${srcBadge(r)}</span></button></li>`)
        .join('');
      return;
    }
    if (!data.results.length) {
      st.textContent = 'لا نتائج. جرّب صيغة أخرى أو الصق رقم الكتاب من رابطه.';
      return;
    }
    const nTitle = data.results.filter((r) => r.source === 'title').length;
    st.textContent = data.titleSearch
      ? `${ar(nTitle)} كتاباً يطابق عنوانه أو مؤلفه بحثك` + (data.results.length > nTitle ? `، و${ar(data.results.length - nTitle)} كتاباً ورد فيه اللفظ` : '')
      : `${ar(data.results.length)} كتاباً ورد فيه اللفظ (فهرس العناوين غير متاح الآن)`;
    if ((data.failed || []).length) st.textContent += ` — تعذّر الوصول إلى: ${data.failed.join('، ')}`;
    $('#results').innerHTML = data.results
      .map(
        (r) => `<li><button type="button" data-id="${esc(r.id)}" data-src="${esc(r.src || '')}">
          <i class="d"></i><span class="t">${esc(r.name)}</span>
          <span class="m">${r.direct ? 'رقم مباشر' : r.source === 'title' ? esc(r.cat || (r.srcKind === 'folder' ? 'ملف Word' : 'عنوان')) : ar(r.hits) + ' موضع'}</span>
          <span class="a">${esc(r.author || '')}${r.srcKind === 'folder' ? '' : `${r.author ? ' · ' : ''}<span class="muted">رقم ${ar(r.id)}</span>`}${srcBadge(r)}</span>
        </button></li>`,
      )
      .join('');
  } catch (err) {
    $('#results').className = 'res';
    $('#results').innerHTML = '';
    st.className = 'status err';
    st.textContent = 'تعذّر البحث: ' + err.message;
  } finally {
    btn.classList.remove('busy');
    btn.innerHTML = btnHtml;
  }
});
// الحالة الفارغة: كتب مقترحة تُفتح بضغطة، بطبعتها من مصدرها أو من ملفها المضمَّن في البرنامج
$('#tryBox').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (!b.dataset.file) {
    $('#q').value = b.textContent;
    return pickHit(b);
  }
  if (state.running) return toast('المنضدة تعمل الآن: أوقف الإخراج أولاً، أو أرسل الكتاب إلى النسّاخ');
  try {
    const r = await fetch(b.dataset.file);
    if (!r.ok) throw new Error('الملف غير موجود');
    const bytes = new Uint8Array(await r.arrayBuffer());
    restoring = true;
    await openBookFile(bytes, '');
  } catch (err) {
    toast('تعذّر فتح الكتاب: ' + err.message, 6000);
  } finally {
    restoring = false;
    autosave();
  }
});

$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id], button[data-set]');
  if (!b) return;
  $$('#results button').forEach((x) => x.classList.toggle('sel', x === b));
  pickHit(b);
});

/* ---- مصادر الكتب: «تراث» افتراضياً، وما أضافه المالك (API آخر، أو مجلد كتب على جهازه) ---- */
// كل عنصر ما يراه المستخدم مصدراً: مجموعة جمع فيها المالك عدة مصادر (count > 1، ويُبحث فيها معاً)، أو مصدر وحده
let SOURCES = { sources: [{ id: 'turath', name: 'تراث', kind: 'api', count: 1 }] };
let curSrc = ''; // المختار حين يتعدد ما يراه المستخدم
const KIND_ICON = { api: '🌐', folder: '💻', shamela: '📚', local: '📄', mixed: '🗂️' };
const curUnit = () => SOURCES.sources.find((s) => s.id === curSrc) || SOURCES.sources[0] || null;
/** وسم المصدر على النتيجة (يظهر حين يُبحث في مجموعة فيها أكثر من مصدر) */
const srcBadge = (r) => (curUnit() && curUnit().count > 1 && r.srcName ? ` <span class="src-badge k-${esc(r.srcKind || 'api')}">${KIND_ICON[r.srcKind] || ''} ${esc(r.srcName)}</span>` : '');
const srcQuery = () => (SOURCES.sources.length > 1 && curSrc ? '&src=' + encodeURIComponent(curSrc) : '');
function searchWhere() {
  const u = curUnit();
  return `«${u ? u.name : 'تراث'}»`;
}
/** مقطع المصدر فوق البحث: مكتبة «تراث» (وما أضافه المالك من مجموعات ومصادر)، ثم «ملف Word من جهازي» */
let wordMode = false; // اختار المستخدم أن يضع ملف Word بدل البحث
let researchMode = false; // نوع العمل «الأبحاث»: الملف بحث علمي يُنضَّد تنضيد الأبحاث
/* ---- نوع العمل: الكتب، أو الأبحاث (والمتون قريباً). يُختار من «العتبة» أول ما تُدخل المنضدة فارغة ---- */
const KIND_KEY = 'warraq.kind';
let workKind = (() => {
  try {
    const k = sessionStorage.getItem(KIND_KEY);
    return isKind(k) ? k : '';
  } catch {
    return '';
  }
})();
researchMode = workKind === 'research';
function setKind(k, quiet = false) {
  if (!isKind(k)) return;
  const changed = k !== workKind;
  workKind = k;
  try {
    sessionStorage.setItem(KIND_KEY, k);
  } catch {}
  researchMode = k === 'research';
  if (changed && !state.book) wordMode = researchMode;
  if (!quiet) {
    renderSources();
    // كتابٌ على المنضدة ليس من هذا النوع: يُترك (يغيّره من يغيّر النوع وهو فارغ)؛ والمنضدة الفارغة بإعدادات نوعها
    if (!state.book && isResearchSettings(state.settings) !== researchMode) {
      state.settings = researchMode ? researchDefaults() : defaultSettings();
      researchUI(researchMode);
    }
    if (!state.book) renderSettingsUI();
  }
}
/** شريط النوع أعلى عمود المنضدة: زرّ النوع (يفتح العتبة)، و«منضدة جديدة» */
function renderKindBar() {
  const bar = $('#kindBar');
  if (!bar) return;
  const k = workKind || (state.book && state.book.research ? 'research' : 'books');
  if (bar.dataset.k !== k) {
    bar.dataset.k = k;
    bar.querySelector('.kb-pill').innerHTML = kindPill(k);
  }
  $('#clearBench').hidden = !state.book;
  // ما يُسمّى به العمل: «الكتاب» أو «البحث» (الخطوة الأولى، وخانة الملف، وزرّ الإخراج)
  const R = k === 'research';
  const sp = $('#mySlot > span');
  if (sp) {
    if (!sp.dataset.book) sp.dataset.book = sp.textContent;
    sp.textContent = R ? 'ملف Word ‎(docx) أو PDF: اسحبه إلى هنا، أو اضغط لاختياره. وبحثٌ في ملفين يصير مجلدين' : sp.dataset.book;
  }
  const M = k === 'mutun';
  const st1 = $('#s1 .bn-t');
  if (st1) st1.textContent = R ? 'البحث' : M ? 'المتن' : 'الكتاب';
  const st2 = $('#bookCard .bn-t');
  if (st2) st2.textContent = M ? 'المجلد' : 'المجلدات';
  $('#startBtn').innerHTML = (R ? 'أخرِج البحث' : M ? 'أخرِج المتن' : 'أخرِج الكتاب') + ' <span class="kbd">Ctrl+E</span>';
}
/** العتبة: ماذا يضع على المنضدة (حين تُدخل فارغة، أو من زرّ النوع) */
let pendingOpen = false;
async function askKind(force = false) {
  if (!document.documentElement.hasAttribute('data-bench') || SCRIBE || gateOpen()) return;
  if (!force && (state.book || state.running || pendingOpen)) return;
  const pick = await openGate({ door: 'bench', current: force || workKind ? workKind : '' });
  if (!pick) return;
  if (state.book && pick !== (state.book.research ? 'research' : 'books')) {
    if (state.running) return toast('المنضدة تعمل الآن: أوقف الإخراج أولاً');
    if (!confirm(`«${state.cover.title || state.book.name}» على المنضدة، وتغيير النوع إلى «${WORK_KINDS[pick].name}» يُفرغها. أتمضي؟`)) return;
    resetBench(true);
  }
  setKind(pick);
  if (window.WarraqBenchView) window.WarraqBenchView.open('s1');
}
/* ---- المتون: المتن وموضع التعليق عليه (shared/mutun.js، ولوحتاه js/mutun-panel.js) ---- */
// إعدادات المتون في state.mutun وحدها: الأسلوب والقالب يُختاران فلا تذهب، وتُضم إلى الإعدادات عند التنضيد والمعاينة.
// وشكل التعليق الذي اختاره المستخدم آخر مرة (عنوانه وسطوره وموضعه…) يبقى للمتن التالي.
// (دالتان تُستدعيان قبل أن تُعرَّف ثوابت هذا الموضع: الحالة الأولى، فلا تعتمدان على غيرهما)
function lookKeys() {
  return MUTUN_KEYS.filter((k) => k !== 'mRange' && k !== 'mKind');
}
function loadMutunLook() {
  let x = {};
  try {
    x = JSON.parse(localStorage.getItem('warraq.mutunLook') || '{}') || {};
  } catch {}
  // «لا تمسّ ترتيب الكتاب» لكتابه وحده (أجزاؤه مثبّتة في تعديلاته): لا ينتقل إلى كتابٍ آخر
  if (x.mDivide === 'manual') delete x.mDivide;
  // وموضع التعليق «كما في الملف» (لا شيء) لملفه وحده
  if (x.mPlace === 'none') delete x.mPlace;
  return cleanMutun({ ...MUTUN_DEFAULTS, ...Object.fromEntries(lookKeys().filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) });
}
function saveMutunLook() {
  try {
    localStorage.setItem('warraq.mutunLook', JSON.stringify(Object.fromEntries(lookKeys().map((k) => [k, state.mutun[k]]))));
  } catch {}
}
/** المنضدة على المتون: نوع العمل «المتون» (والكتاب الذي عليها متن)
 *  (والكتابُ إن حاضر فحالُه هو العبرة لا شريطُ النوع: إن اختلّ التزامنُ لأي سببٍ فلا يخرج المتن بلا مواضع تعليقه) */
const mutunOn = () => (state.book ? !!state.book.mutun && !state.book.research : workKind === 'mutun');
/**
 * متنٌ من ملف Word «كما في الملف» بلا موضع تعليقٍ يضعه ورّاق (موضعه في الملف نفسه، كخلفية صفحاته):
 * يُخرج الملف كما هو — صفحاته كما قُرئت (بلا رفع اسم الكتاب ولا ما أعلى الصفحات)، وبلا تقسيمٍ إلى أجزاء
 */
const mutunAsFile = () => mutunOn() && !!state.asIs && !!state.book && !!state.book.rawPages && !!state.mutun && state.mutun.mPlace === 'none';
/** إعداداتٌ من مشروعٍ قديم كانت فيها مفاتيح المتون: تُنقل إلى مكانها */
function splitMutun(settings) {
  const s = { ...(settings || {}) };
  const mu = {};
  for (const k of MUTUN_KEYS) if (k in s) (mu[k] = s[k]), delete s[k];
  delete s.mutun;
  return { settings: s, mutun: Object.keys(mu).length ? mu : null };
}
/** ملف متنٍ من الجهاز: يُفهم إن كان مهيّأً للتعليق (صفحاته الفارغة أو المسطّرة وعنوانها، وتقسيمه)، وتُرفع منه صفحات التعليق */
function markMutun(part) {
  const book = part.book;
  book.mutun = true;
  // صفحات الملف كما قُرئت (لـ«كما في الملف»: لا يُرفع منها شيء)
  if (book.word) book.rawPages = part.pages;
  // اسم المتن من أول ملفه (السطر البارز قبل أول باب)، لا من اسم الملف
  const t = mutunTitle(part.pages);
  if (t) {
    book.name = t;
    book.cover = { ...book.cover, title: t };
    part.pages = markTitleLine(part.pages, t);
  }
  // اسم الكتاب أعلى كل صفحة، ورقم الصفحة وحده آخرها: يُرفعان (ليسا من المتن)
  try {
    const rh = stripRunHeads(part.pages, t);
    part.pages = rh.pages;
    if (rh.head) book.mrhead = rh.head;
  } catch {}
  try {
    const r = analyzeMutunPages(part.pages, { title: book.name });
    if (r.found) {
      // أرقام صفحات العناوين بعد رفع صفحات التعليق
      const map = r.map || [];
      const hs = (book.book && book.book.indexes && book.book.indexes.headings) || [];
      for (const h of hs) if (map[h.page - 1]) h.page = map[h.page - 1];
      part.pages = r.pages;
      const n = r.pages.length;
      book.totalPages = n;
      book.volumes = [{ ...(book.volumes[0] || { vol: '1', parts: [] }), start: 1, end: n, pages: n }];
      book.mdetect = r.settings;
      book.minfo = r.info;
    }
  } catch {}
  return part;
}
/* ---- ما يُعرف من المتن نفسه: نوعه، وأبياته وفقراته، وعدد أجزائه — للوحتين وللمعاينة ---- */
// يُقرأ المتن مرة (ملف الجهاز في الحال، وما في «تراث» ومصادره يُجلب في الخلفية إن لم يكن كبيراً)، ويُعاد حسابه مع كل تغيير
const MU = { key: '', parsed: null, base: null, outline: null, est: null, loading: false, err: '', seq: 0 };
const muVol = () => (state.book ? String((state.book.volumes.find((v) => state.selected.has(v.vol)) || state.book.volumes[0] || {}).vol || '1') : '');
function muKey() {
  return state.book ? [state.book.id, muVol(), state.book.volumes.length, (state.book.word && JSON.stringify(state.book.word.options)) || '', state.mutun && state.mutun.mStrip === false ? 'n' : 's'].join('|') : '';
}
async function ensureMutunData() {
  if (!state.book || !state.book.mutun) return;
  const key = muKey();
  if (MU.key === key && (MU.parsed || MU.loading)) return;
  // كتابٌ كبير من مصدرٍ على الشبكة: لا يُجلب كله لأجل اللوحتين (يُعرف نوعه من الإخراج)
  if (!state.localPages && !state.doc && !state.book.set && (state.book.totalPages || 0) > 900) return;
  Object.assign(MU, { key, parsed: null, base: null, outline: null, est: null, loading: true, err: '' });
  const seq = ++MU.seq;
  renderMutunPanels();
  try {
    const parsed = await window.WarraqBench.editor.parse(muVol());
    if (seq !== MU.seq) return;
    MU.parsed = parsed;
    applyMutunRead(parsed);
  } catch (err) {
    if (seq !== MU.seq) return;
    MU.err = err.message || String(err);
  }
  MU.loading = false;
  refreshMutunData();
}
let muT = 0;
let muHadData = false;
let muReadPending = false;
/**
 * ما فهمه ورّاق من ترتيب صفحات المتن: «قال …» قبل المتن، وعنوان التعليق وموضعه، واسم الكتاب أعلى الصفحات —
 * يُضبط منه مرةً لكل كتاب (وما فُهم من مواضع التعليق في الملف نفسه يعلو)، ويُذكر في «ما فهمه ورّاق من الملف»
 */
function applyMutunRead(parsed) {
  const mr = parsed && parsed.stats && parsed.stats.mread;
  if (!muReadPending || !state.book) return;
  muReadPending = false;
  if (!mr) return;
  state.book.mread = { intros: mr.intros, labels: mr.labels, heads: mr.heads, nums: mr.nums || 0 };
  const patch = { ...(mr.settings || {}) };
  const d = state.book.mdetect || {};
  for (const k of ['mRule', 'mPlace', 'mLabel']) if (d[k] != null) delete patch[k];
  if (mr.labels && !d.mDivide) patch.mDivide = 'manual';
  if (Object.keys(patch).length) {
    state.mutun = cleanMutun({ ...state.mutun, ...patch });
    saveMutunLook();
  }
  const bits = [];
  if (mr.intros) bits.push(`«${esc(mr.settings.mIntro || 'قال…')}» قبل المتن (${N(mr.intros, 'موضع')}) — صار «قبل المتن» في التنضيد`);
  if (mr.labels) bits.push(`عنوان التعليق «${esc(mr.settings.mLabel || state.mutun.mLabel)}» بعد ${N(mr.labels, 'جزء')} — والأجزاء كما في الملف`);
  if (mr.heads) bits.push(`اسم الكتاب أعلى الصفحات رُفع من النص`);
  if (mr.nums) bits.push(`أرقام الأبيات كما كانت في الملف: رقم البيت ${mr.settings.mNum === 'mid' ? 'بين الشطرين' : 'بجانب البيت'}${mr.settings.mSeq === 'side' ? '، ومعه العدّ المتسلسل' : ''} — بأرقام ورّاق`);
  if (state.book.mrhead) bits.push(`«${esc(state.book.mrhead)}» أعلى كل صفحة: اسم الكتاب، رُفع من النص`);
  const ul = $('#wordSummary');
  if (ul && bits.length) ul.insertAdjacentHTML('beforeend', bits.map((b) => `<li class="mu-read">${b}</li>`).join(''));
}
/** يُعاد حساب ما يُعرف بعد كل تغيير (تعديلات المحرِّر، والإعدادات) */
function refreshMutunData(now = true) {
  clearTimeout(muT);
  const run = () => {
    if (MU.parsed && state.book) {
      try {
        const applied = applyEdits(MU.parsed, muVol(), state.edits).parsed;
        MU.applied = applied;
        MU.base = composeVolume(applied, { ...state.settings, mutun: false });
        MU.outline = mutunOutline(MU.base);
        // (كل قطعةٍ بموضعها: ليُعرف أول كل جزء — لـ«ثبّت الترتيب» وما يحدّده المحرِّر)
        const d = composeVolume({ ...applied, blocks: applied.blocks.map((b, i) => (b._i != null ? b : { ...b, _i: i })) }, { ...currentSettings(), mutun: true });
        MU.est = d.mutun;
        MU.doc = d;
      } catch {}
    }
    renderMutunPanels();
    if (!muHadData && MU.applied) {
      muHadData = true;
      preview.update('heads');
    }
  };
  if (now) run();
  else muT = setTimeout(run, 160);
}
/** ما تعرفه اللوحتان عن المتن */
function muCtx() {
  const m = state.mutun;
  const det = MU.outline ? (MU.outline.poem ? 'poem' : 'prose') : state.book && state.book.mdetect && state.book.mdetect.mDivide === 'verses' ? 'poem' : '';
  const poem = m.mKind === 'poem' || (m.mKind !== 'prose' && det === 'poem');
  const s = state.settings;
  const heads = rangeHeads((state.book && state.book.book && state.book.book.indexes && state.book.book.indexes.headings) || (MU.outline ? MU.outline.heads.map((h) => ({ title: h.t, level: h.lvl })) : []));
  // أول بيتٍ مما يُخرج (مثالٌ للأرقام)
  let sample = null;
  if (MU.doc) {
    const v = MU.doc.blocks.find((b) => b.type === 'verse' && b.parts && b.parts[0] && b.parts[1]);
    if (v) sample = { parts: [v.parts[0], v.parts[1]], vn: v.vn || 1 };
  }
  return {
    poem,
    detected: det,
    hasHeads: MU.outline ? MU.outline.heads.length > 0 : heads.length > 0,
    midOk: (s.verseLayout || 'line') === 'line' && (s.verseSep || 'none') === 'none',
    fonts: Object.entries(FONTS).filter(([k]) => k !== NAMES_FONT).map(([k, f]) => ({ v: k, label: f.label || k })),
    headingFont: FONTS[s.fonts.heading] ? FONTS[s.fonts.heading].label.replace(/\s*\(.*\)$/, '') : s.fonts.heading,
    labelSize: Math.max((s.sizes && s.sizes.h3) || 17, 14),
    estimate: MU.est ? { units: MU.est.units, verses: MU.est.poem ? MU.est.verses : 0, paras: MU.est.poem ? 0 : MU.est.paras } : null,
    sample,
    heads,
    outline: MU.outline,
    loading: MU.loading,
    totalVerses: MU.est ? MU.est.totalVerses : 0,
    // الغلاف الداخلي الذي يصنعه ورّاق (فيه خانات صاحب النسخة): يُترك حين يأتي الملف بصفحات عنوانه، أو «كما في الملف»
    innerCover: state.innerCover !== false,
    totalParas: MU.est ? MU.est.totalParas : 0,
    srcNums: !!(MU.est && MU.est.srcNums),
    bodySize: (s.sizes && s.sizes.body) || 16,
    keep: state.mutun.mDivide === 'manual',
  };
}
let muPanel = null;
let muRange = null;
function renderMutunPanels() {
  const on = mutunOn();
  const box = $('#mutunBox');
  if (box) box.hidden = !on;
  const rb = $('#mRangeBox');
  if (rb) rb.hidden = !(on && state.book);
  if (!on) return;
  if (!muPanel && $('#mutunHost')) muPanel = createMutunPanel($('#mutunHost'), { get: () => state.mutun, set: setMutun, ctx: muCtx });
  if (!muRange && $('#mRangeHost')) muRange = createRangePanel($('#mRangeHost'), { get: () => state.mutun, set: setMutun, ctx: muCtx, needOutline: ensureMutunData });
  if (muPanel) muPanel.render();
  if (muRange && state.book) muRange.render();
}
// اسمان قديمان يُستدعيان من مواضع كثيرة
const syncMutunUI = renderMutunPanels;
const renderRange = () => {};
function setMutun(patch) {
  const was = state.mutun || {};
  // «ثبّت الترتيب»: الأجزاء كما هي الآن تُثبَّت على قطعها (عمليةٌ في التعديلات)، ثم لا يعيد ورّاق تقسيمها
  if (patch.mDivide === 'manual' && was.mDivide !== 'manual') muFreeze();
  state.mutun = cleanMutun({ ...state.mutun, ...patch });
  saveMutunLook();
  // حذف ترقيم الملف أو إبقاؤه: يُحلَّل المتن من جديد
  if ('mStrip' in patch && patch.mStrip !== was.mStrip) {
    state.parsed && state.parsed.clear && state.parsed.clear();
    MU.key = '';
    ensureMutunData();
  }
  if (state.book) state.settingsTouched = true;
  renderMutunPanels();
  refreshMutunData(false);
  preview.update();
  if (DESK) autosave();
  muNotify();
}
/** يثبّت بدايات الأجزاء كما يُرى الآن (من آخر ما حُسب للمتن) */
function muFreeze() {
  const est = MU.est;
  const ap = MU.applied;
  if (!est || !ap || !Array.isArray(est.list)) return;
  const at = est.list
    .slice(1)
    .filter((u) => u.ui != null && ap.blocks[u.ui])
    .map((u) => ({ b: u.ui, sig: sigOf(ap.blocks[u.ui]) }));
  const ops = (state.edits.ops || []).filter((o) => o.op !== 'mufreeze');
  ops.push({ id: opId(), op: 'mufreeze', vol: muVol(), at });
  state.edits = { v: 1, ops };
}
/** المحرِّر يتبع ما تغيّر من إعدادات المتون */
function muNotify() {
  try {
    window.dispatchEvent(new CustomEvent('warraq:mutun'));
  } catch {}
}
// وضع الشعر والفاصل بين الشطرين يغيّران ما يجوز من مواضع الأرقام
$('#s3').addEventListener('change', (e) => {
  if (!e.target.closest('#mutunBox')) renderMutunPanels();
});

/** «منضدة جديدة»: يُرفع الكتاب عن المنضدة، ثم العتبة */
function clearBench() {
  if (state.running) return toast('المنضدة تعمل الآن: أوقف الإخراج أولاً');
  if (state.book && !confirm(`رفع «${state.cover.title || state.book.name}» عن المنضدة؟ (ما حُفظ في الخزانة يبقى فيها)`)) return;
  resetBench();
  askKind();
}
const BOOK_HINT = $('#myHint').textContent;
const RESEARCH_HINT =
  'يُقرأ البحث على جهازك ولا يُرفع، ويفهم ورّاق بنيته: صفحة العنوان (الجامعة والكلية والقسم والعنوان والباحث والمشرف والعام)، والملخص والكلمات المفتاحية والملخص الإنجليزي، والمقدمة والتمهيد، والأبواب والفصول والمباحث والمطالب والفروع، والخاتمة، والمصادر والمراجع، والحواشي. ثم يُنضَّد تنضيد الأبحاث: A4 بخط Traditional Arabic، أسود خالص بلا زخرفة، والحواشي ١٢، والمراجع بمسافة معلّقة، والنص الإنجليزي بـTimes New Roman، وفهرس الموضوعات. وبحثٌ في ملفين يصير مجلدين.';
function renderSources() {
  const on = SOURCES.sources;
  const many = on.length > 1;
  if (!on.some((s) => s.id === curSrc)) curSrc = on[0] ? on[0].id : '';
  const libName = (s) => (s.id === 'turath' ? 'مكتبة «تراث»' : esc(s.name));
  $('#srcTabs').innerHTML =
    on.map((s) => `<button type="button" role="radio" data-src="${esc(s.id)}" aria-checked="${!wordMode && s.id === curSrc}" title="${s.count > 1 ? `مجموعة فيها ${s.count === 2 ? 'مصدران' : ar(s.count) + ' مصادر'}` : ''}">${libName(s)}</button>`).join('') +
    `<button type="button" role="radio" data-my="1" aria-checked="${wordMode}">ملف Word من جهازي</button>`;
  const u = curUnit();
  $('#searchWhere').textContent =
    on.length === 1 && on[0].id === 'turath'
      ? 'يعتمد البحث على واجهة «تراث» مع مطابقة سريعة للعنوان والمؤلف لإظهار النسخ والطبعات والشروح المتوفرة.'
      : u
        ? `يبحث في «${u.name}»${u.count > 1 ? ` (${u.count === 2 ? 'مصدران' : ar(u.count) + ' مصادر'} معاً، وكل نتيجة تذكر مصدرها)` : ''}${many ? '. اختر المصدر فوق خانة البحث' : ''}.`
        : 'لا مصدر كتب مفعّلاً الآن.';
  // الحالة الفارغة: قبل البحث لا تبقى الصفحة بيضاء، وباب ملف Word ظاهر
  const empty = !$('#results').children.length && $('#searchStatus').hidden;
  // نوع «الأبحاث»: البحث من ملفه وحده، فلا مصادر ولا خانة بحث
  if (researchMode) wordMode = true;
  $('#srcTabs').hidden = researchMode;
  $('#kindNote').hidden = !researchMode;
  $('#searchForm').hidden = $('#searchHint').hidden = wordMode;
  $('#tryBox').hidden = wordMode || !empty;
  $('#myBook').hidden = !(wordMode || empty);
  $('#myDirBtn').closest('.mydir').hidden = researchMode;
  // المنضدة في البرنامج: ما يُكتب فوق خانة الملف
  const be = document.querySelector('.bn-empty');
  if (be) {
    const has = !!state.book;
    be.querySelector(':scope > h2').textContent = researchMode ? (has ? 'ضع بحثاً آخر' : 'ضع بحثك على المِنضدة') : has ? 'ضع ملفاً آخر' : workKind === 'mutun' ? 'ضع المتن على المِنضدة' : 'المِنضدة فارغة';
    be.querySelector(':scope > p').textContent = researchMode
      ? 'ملف Word أو PDF: يفهم ورّاق صفحة عنوانه وملخصه ومباحثه ومطالبه وحواشيه ومراجعه، وينضّده تنضيد الأبحاث.' + (has ? ' ويحلّ محلّ ما على المنضدة.' : '')
      : workKind === 'mutun'
        ? (has ? 'يحلّ الملف محلّ المتن الذي على المنضدة.' : 'ابحث عن المتن في «تراث» أو في مصادرك من خانة البحث، أو ضع ملفه (Word أو PDF) هنا: يُفهم منه عنوانه وأبوابه، ونظمه أو نثره، وموضع التعليق إن كان مهيّأً له.')
        : has ? 'يحلّ الملف محلّ الكتاب الذي على المنضدة. ولإضافته مجلداً إلى الكتاب اختر «إضافة كتاب» في المجلدات.' : 'ابحث عن كتابٍ في «تراث» من خانة البحث، أو ضع ملف Word أو PDF هنا.';
  }
  renderKindBar();
  const MU = workKind === 'mutun';
  $('#myTitle').textContent = wordMode ? (researchMode ? 'ضع ملف بحثك هنا' : MU ? 'ضع ملف المتن هنا' : 'ضع ملف كتابك هنا') : MU ? 'أو ضع ملف المتن هنا' : 'أو ضع ملف كتابك هنا';
  $('#myHint').hidden = !wordMode;
  $('#myHint').textContent = researchMode ? RESEARCH_HINT : BOOK_HINT;
  $('#mySlot').classList.toggle('research', wordMode && researchMode);
  if (!wordMode && !$('#myStatus').classList.contains('err')) $('#myStatus').hidden = true;
  // «إضافة»: الكتاب التالي الذي يُختار يُضاف مجلداً إلى الكتاب المعروض
  $('#addNote').hidden = !addMode;
  if (addMode && state.book) $('#addName').textContent = state.setName || state.book.name;
  // علامة # تخص مجلدات الكتب على الجهاز
  $('#setHint').hidden = wordMode || !on.some((s) => s.kind === 'folder' || s.kind === 'mixed');
}
$('#srcTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.my) return showMyBook(b.dataset.my === 'research');
  const same = !wordMode && b.dataset.src === curSrc;
  wordMode = false;
  curSrc = b.dataset.src;
  if (!same) {
    $('#results').innerHTML = '';
    $('#searchStatus').hidden = true;
  }
  renderSources();
  if (!same && $('#q').value.trim().length >= 2 && !isMyBook($('#q').value)) $('#searchForm').requestSubmit();
});

/* ---- «كتابي»: ملف Word من جهاز المستخدم يصير كتاباً كالمجلوب من «تراث» ---- */
const isMyBook = (q) => ['كتابي', 'كتابى'].includes(normalizeArabic(q).replace(/\s+/g, ''));
function showMyBook(research) {
  hideSuggest();
  // البحث نوعٌ مستقل (الكتب، الأبحاث): يُختار من «العتبة»، أو بزرّ النوع
  if (typeof research === 'boolean' && research !== researchMode) setKind(research ? 'research' : 'books', true);
  wordMode = true;
  $('#results').innerHTML = '';
  $('#searchStatus').hidden = true;
  $('#myStatus').hidden = true;
  $('#myStatus').className = 'status';
  renderSources();
  $('#mySlot').focus();
}
/** ملفات Word من جهاز المستخدم: ملف واحد كتابٌ، وعدة ملفات (أو مجلد كامل) مجلدات كتاب واحد بأرقامها التي في أسمائها */
async function loadMyBooks(files, folder = '') {
  const st = $('#myStatus');
  st.hidden = false;
  st.className = 'status';
  if (state.running) return void (st.textContent = 'أوقف العملية الجارية أولاً');
  const all = [...files].filter((f) => !f.name.startsWith('~$') && !f.name.startsWith('.'));
  // كتاب «وَرَق»: يُفتح من ملفه بنصه وأسلوبه وتعديلاته (قسيم PDF و Word)
  const wq = all.find((f) => /\.(waraq|warraq)$/i.test(f.name));
  if (wq) {
    try {
      const bytes = new Uint8Array(await wq.arrayBuffer());
      if (!isBookFile(bytes)) throw new Error('ليس كتاب «وَرَق»');
      restoring = true;
      try {
        await openBookFile(bytes, deskPathOf(wq));
      } finally {
        restoring = false;
      }
      st.hidden = true;
      autosave();
      return;
    } catch (err) {
      st.className = 'status err';
      st.textContent = 'تعذّر فتح كتاب «وَرَق»: ' + err.message;
      return;
    }
  }
  const docx = all.filter((f) => /\.(docx|pdf)$/i.test(f.name));
  const fail = (msg) => {
    st.className = 'status err';
    st.textContent = msg;
  };
  if (!docx.length) return fail(all.some((f) => /\.doc$/i.test(f.name)) ? 'هذا ملف Word قديم (‎.doc): افتحه في Word واحفظه بصيغة ‎.docx ثم ضعه هنا.' : folder ? 'لا ملفات Word (‎.docx) ولا PDF في هذا المجلد' : 'ضع ملف Word بصيغة ‎.docx أو ملف PDF');
  if (docx.some((f) => f.size > 150 * 1024 * 1024)) return fail('في الملفات ما هو أكبر من ١٥٠ م.ب');
  if (docx.length > 120) return fail('الملفات أكثر من ١٢٠ ملفاً');
  const many = docx.length > 1;
  const ordered = many ? orderVolumes(docx, (f) => f.name) : [{ item: docx[0], vol: 1 }];
  const SPIN = '<span class="spin"><i></i><i></i><i></i></span> ';
  st.innerHTML = SPIN + (many ? 'تُقرأ الملفات…' : 'يُقرأ الملف: فقراته وعناوينه وحواشيه وصوره وجداوله، ومتنه وشرحه…');
  // تقدّم قراءة PDF صفحةً صفحة
  const pdfProgress = (name, i) => (n, total) => {
    if (n === 1 || n % 5 === 0 || n === total) st.innerHTML = SPIN + (many ? `الملف ${ar(i + 1)} من ${ar(docx.length)}: ` : '') + `تُقرأ صفحات ملف PDF: ${ar(n)} من ${ar(total)}`;
  };
  const adding = addMode && state.parts.length > 0;
  // ما يُضاف يُقرأ بخيارات القراءة التي عليها الكتاب المعروض
  const options = adding && state.book.word ? state.book.word.options : {};
  // البحث: ما يُضاف إلى بحثٍ بحثٌ مثله، وإلا فبحسب المقطع المختار
  const research = adding ? !!state.book.research : workKind === 'research';
  const mutun = adding ? !!state.book.mutun : workKind === 'mutun';
  try {
    const parts = [];
    for (const [i, o] of ordered.entries()) {
      if (many) st.innerHTML = SPIN + `يُقرأ الملف ${ar(i + 1)} من ${ar(docx.length)}: ${esc(o.item.name)}`;
      // يبقى الملف في الذاكرة: تغيير خيار من خيارات قراءته يعيد قراءته
      const f = { bytes: new Uint8Array(await o.item.arrayBuffer()), name: o.item.name, id: 'my-' + Date.now().toString(36) + '-' + i, path: deskPathOf(o.item) };
      parts.push({ ...(await readMine(f, options, pdfProgress(o.item.name, i), research, mutun)), vol: o.vol });
    }
    const sum = (k) => parts.reduce((a, p) => a + ((p.book.stats || {})[k] || 0), 0);
    if (adding) addParts(parts);
    else {
      state.parts = parts;
      state.setName = many ? setTitle(docx.map((f) => f.name), folder) : '';
      state.setAuthor = '';
      state.setKeepNums = many;
      showParts(false);
    }
    st.className = 'status';
    st.textContent =
      (adding ? `أُضيف ${N(parts.length, 'كتاب')} مجلداً: ` : many ? `ملفاتك (${N(parts.length, 'ملف')}) صارت مجلدات كتاب واحد بحسب أرقامها في أسمائها: ` : 'قُرئ الملف: ') +
      [N(sum('paragraphs'), 'فقرة'), sum('headings') ? N(sum('headings'), 'عنوان') + (!many && sum('guessedHeadings') ? ' (خُمّنت من الأسطر العريضة)' : '') : '', sum('notes') ? N(sum('notes'), 'حاشية') : '', sum('verses') ? N(sum('verses'), 'بيت') : '', sum('images') ? N(sum('images'), 'صورة') : '', sum('tables') ? N(sum('tables'), 'جدول') : ''].filter(Boolean).join('، ') +
      '.' +
      (() => {
        // من PDF: ما أُخذ صورةً (كتابة زخرفية لا تُقرأ حروفها)
        const decor = parts.reduce((a, p) => a + (((p.book.stats || {}).fromPdf || {}).decor || 0), 0);
        return decor ? ` وفيه كتابةٌ بخطٍّ زخرفي لا تُقرأ حروفها (${N(decor, 'صورة')}) أُبقيت صوراً كما هي.` : '';
      })() +
      ' انظر ما فُهم منه في الأسفل.';
  } catch (err) {
    fail('تعذّرت قراءة الملف: ' + (err.message || err));
  }
}
/** صور الملف: الكبيرة تُصغَّر، وما لا يعرضه المتصفح مباشرة (WebP، BMP…) يُحوَّل. undefined = تبقى كما هي، null = تُترك */
async function wordImage(bytes, mime, info) {
  const plain = /png|jpeg|gif/.test(mime) && info && info.w > 0 && info.h > 0;
  if (plain && bytes.length <= 700 * 1024 && Math.max(info.w, info.h) <= 2400) return undefined;
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * k));
    cv.height = Math.max(1, Math.round(bmp.height * k));
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(bmp, 0, 0, cv.width, cv.height);
    return { src: cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height };
  } catch {
    return plain ? undefined : null;
  }
}
/** يرسم نصوص مربعات الغلاف (بمواضعها من الصفحة، ولونها ومقاسها وخطها) على صورته ← { src, w, h } */
async function drawCoverTexts(cover, texts, page) {
  const img = new Image();
  img.src = cover.src;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  // النقطة بنقاط الصورة: ارتفاع الصفحة بالنقاط (المليمتر ٢٫٨٣٥ نقطة)
  const pagePt = ((page && page.h) || 297) * 2.835;
  const k = H / pagePt;
  g.textBaseline = 'alphabetic';
  g.direction = 'rtl';
  for (const t of texts) {
    const bx = t.x * W;
    const bw = Math.max(1, t.w * W);
    let y = t.y * H + 3.6 * k; // حشوة المربع العليا
    for (const p of t.paras || []) {
      const px = Math.max(6, (Number(p.size) || 24) * k);
      const fam = String(p.font || '').replace(/["\\]/g, '');
      try {
        await document.fonts.load(`${px}px "${fam}"`);
      } catch {}
      g.font = `${p.bold ? '700 ' : ''}${px}px ${fam ? `"${fam}", ` : ''}"Amiri", "Noto Naskh Arabic", serif`;
      g.fillStyle = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#000';
      for (const line of p.lines || []) {
        y += px * 1.05;
        let x = bx + bw / 2;
        g.textAlign = 'center';
        if (p.jc === 'r') (g.textAlign = 'right'), (x = bx + bw - 7.2 * k);
        else if (p.jc === 'l') (g.textAlign = 'left'), (x = bx + 7.2 * k);
        g.fillText(line, x, y, bw);
        y += px * 0.2;
      }
    }
  }
  return { src: cv.toDataURL('image/jpeg', 0.92), w: W, h: H };
}
/** قراءة ملف Word من ذاكرة المتصفح بخيارات قراءته ← جزء (كتاب بصفحاته) */
async function readMine(f, options, onProgress, research = false, mutun = false) {
  // البحث العلمي: لا متن ولا شرح، والفهرس يبنيه ورّاق
  if (research) options = { ...RESEARCH_WORD_OPTIONS, ...(options || {}), matn: 'none', embed: 'none' };
  const { importDocx, inflateRawBrowser } = await import('/shared/docx-import.js');
  // ملف PDF: يُقرأ تخطيطه مرة واحدة إلى ملف Word مكافئ (يبقى في الذاكرة لإعادة القراءة بخيارات أخرى)
  if (/\.pdf$/i.test(f.name) && !f.docx) {
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const { pdfToDocx } = await import('/shared/pdf-import.js');
    const r = await pdfToDocx(f.bytes, { pdfjs, onProgress });
    f.docx = r.docx;
    f.pdfInfo = r.info;
    f.bytes = null;
  }
  const bytes = f.docx || f.bytes;
  const fileName = f.docx ? f.name.replace(/\.pdf$/i, '.docx') : f.name;
  // (المتون: الفقرات الفارغة المتتالية أسطرٌ للكتابة، يُعرف بها موضع التعليق)
  const { pages, stats, ...meta } = await importDocx(bytes, { inflate: inflateRawBrowser, fileName, id: f.id, options, image: wordImage, blankLines: workKind === 'mutun' });
  if (f.pdfInfo) stats.fromPdf = f.pdfInfo;
  // غلاف الملف من رأس صفحته الأولى: ما كُتب عليه (مربعات النص) يُرسم على صورته، فيكون الغلاف كما في الملف
  if (meta.word && meta.word.cover && Array.isArray(meta.word.coverTexts) && meta.word.coverTexts.length) {
    try {
      meta.word.cover = await drawCoverTexts(meta.word.cover, meta.word.coverTexts, meta.word.look && meta.word.look.page);
    } catch {}
  }
  const book = { ...meta, stats, src: 'local', srcName: f.name, srcKind: 'local', link: '', local: true };
  if (research) markResearch(book, pages);
  if (mutun) return markMutun({ kind: 'mine', file: f, book, pages });
  return { kind: 'mine', file: f, book, pages };
}
/** كتابٌ هو بحث: بنيته كما فُهمت، وبيانات صفحة عنوانه في بيانات الغلاف (العنوان، الباحث، المشرف، الجامعة، العام) */
function markResearch(book, pages) {
  book.research = true;
  const o = researchOutline(pages);
  book.rmeta = { sections: o.sections, units: o.units, titlePage: !!o.meta };
  const m = o.meta;
  const c = { ...book.cover, authorLabel: 'إعداد', editorLabel: 'إشراف' };
  if (m) {
    if (m.title) c.title = m.title;
    if (m.subtitle) c.subtitle = m.subtitle;
    if (m.author) c.author = m.author;
    if (m.supervisor) c.editor = m.supervisor;
    if (m.date) c.edition = m.date;
    if (m.inst.length) c.publisher = m.inst.join(' — ');
    if (m.meta) c.authorNote = m.meta;
  }
  book.cover = c;
  if (m && m.title) book.name = m.title;
  return book;
}
/** كتاب من مصدره (بلا صفحاته). wo: خيارات قراءة ملف Word (لكتب مجلد الكتب على الجهاز) */
async function readSource(id, src = '', wo = '') {
  const book = await (await api('/api/book?id=' + encodeURIComponent(id) + (src ? '&src=' + encodeURIComponent(src) : '') + (wo ? '&wo=' + encodeURIComponent(wo) : ''))).json();
  if (wo) book.wo = wo;
  return book;
}
const partOf = (book, vol = 1) => ({ kind: 'src', bookId: book.id, src: book.src || '', book, pages: null, vol });

/** ملفات ما سُحب إلى الخانة: ملفات، أو مجلد كامل بما فيه */
async function dropFiles(dt) {
  const entries = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  if (!entries.some((e) => e.isDirectory)) return { files: [...dt.files], folder: '' };
  const out = [];
  let folder = '';
  const walk = async (en, depth) => {
    if (en.isFile) out.push(await new Promise((res, rej) => en.file(res, rej)));
    else if (en.isDirectory && depth < 4) {
      if (!folder) folder = en.name;
      const rd = en.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => rd.readEntries(res, rej));
        if (!batch.length) break;
        for (const x of batch) await walk(x, depth + 1);
      }
    }
  };
  for (const en of entries) await walk(en, 0);
  return { files: out, folder };
}
$('#myFile').addEventListener('change', (e) => {
  const fs = [...e.target.files];
  e.target.value = '';
  if (fs.length) loadMyBooks(fs);
});
$('#myDir').addEventListener('change', (e) => {
  const fs = [...e.target.files];
  const folder = fs[0] && fs[0].webkitRelativePath ? fs[0].webkitRelativePath.split('/')[0] : '';
  e.target.value = '';
  if (fs.length) loadMyBooks(fs, folder);
});
$('#myDirBtn').addEventListener('click', () => $('#myDir').click());
{
  const slot = $('#mySlot');
  slot.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), $('#myFile').click()));
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    slot.classList.add('over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('over'));
  slot.addEventListener('drop', async (e) => {
    e.preventDefault();
    slot.classList.remove('over');
    const { files, folder } = await dropFiles(e.dataTransfer).catch(() => ({ files: [...e.dataTransfer.files], folder: '' }));
    if (files.length) loadMyBooks(files, folder);
  });
  // ملف الكتاب يُسحب إلى أي موضعٍ من المنضدة، لا إلى خانته وحدها: كان ما يسقط خارجها يضيع
  // (البرنامج يمنع فتح الملف المسحوب في النافذة). وتبقى للخانات الأخرى ملفاتها (بطاقة الأسلوب، وصورة الغلاف…)
  const BOOK_FILE = /\.(docx|pdf|waraq|warraq|doc)$/i;
  const hasFiles = (dt) => !!dt && [...(dt.types || [])].includes('Files');
  const ownTarget = (t) => {
    if (!t || !t.closest) return false;
    if (t.closest('#mySlot, #installStyle, input[type="file"]')) return true;
    const lb = t.closest('label');
    return !!(lb && lb.querySelector('input[type="file"]'));
  };
  document.addEventListener('dragover', (e) => {
    if (e.defaultPrevented || !hasFiles(e.dataTransfer) || ownTarget(e.target)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    slot.classList.add('over');
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) slot.classList.remove('over');
  });
  document.addEventListener('drop', async (e) => {
    if (e.defaultPrevented || !hasFiles(e.dataTransfer) || ownTarget(e.target)) return;
    e.preventDefault();
    slot.classList.remove('over');
    const { files, folder } = await dropFiles(e.dataTransfer).catch(() => ({ files: [...e.dataTransfer.files], folder: '' }));
    if (!files.length || (!folder && !files.some((f) => BOOK_FILE.test(f.name)))) return;
    if (!wordMode) showMyBook();
    loadMyBooks(files, folder);
  });
}

/* ------------------------------------------------------------------ أجزاء الكتاب: كتب من ملفات Word تصير مجلدات كتاب واحد */
let addMode = false; // ضُغط «إضافة»: الكتاب التالي الذي يُختار يُضاف مجلداً
const nameAuthor = (t) => {
  const m = /^(.{2,}?)\s+[-–—]\s+(.{2,})$/.exec(String(t || '').trim());
  return m ? { name: m[1].trim(), author: m[2].trim() } : { name: String(t || '').trim(), author: '' };
};
/** الكتاب المعروض من أجزائه: جزء واحد = كتابه كما هو؛ وأكثر = كتاب مجلداته أجزاؤه (كما لو جاء من «تراث» بمجلداته) */
function bookOfParts() {
  const parts = state.parts;
  if (parts.length === 1) return { book: parts[0].book, pages: parts[0].pages };
  const first = parts[0].book;
  const t = nameAuthor(state.setName || first.name);
  // «اسم - الجزء الثاني»: ما بعد الشرطة رقم المجلد لا اسم المؤلف
  const isVol = (a) => !a || volNumberOf(a) > 0 || /^(الجزء|جزء|المجلد|مجلد|القسم)(\s|$)/.test(a);
  const author = state.setAuthor || (isVol(t.author) ? '' : t.author) || (isVol(first.cover.author) ? '' : first.cover.author) || '';
  const sumS = (k) => parts.reduce((a, p) => a + ((p.book.stats || {})[k] || 0), 0);
  const sumW = (k) => parts.reduce((a, p) => a + ((p.book.word || {})[k] || 0), 0);
  const mine = parts.every((p) => p.kind === 'mine');
  return {
    pages: null,
    book: {
      ...first,
      id: 'set-' + first.id,
      name: t.name,
      cover: { ...first.cover, title: t.name, author },
      volumes: parts.map((p, i) => ({ vol: String(p.vol), start: 1, end: p.book.totalPages, pages: bookPages(p.book), parts: [], part: i })),
      totalPages: parts.reduce((a, p) => a + p.book.totalPages, 0),
      printedPages: parts.reduce((a, p) => a + bookPages(p.book), 0),
      stats: { ...first.stats, headings: sumS('headings'), notes: sumS('notes'), verses: sumS('verses'), typedNotes: sumS('typedNotes'), imagesSkipped: sumS('imagesSkipped') },
      word: first.word ? { ...first.word, set: parts.length, images: sumW('images'), tables: sumW('tables') } : null,
      set: true,
      local: true,
      link: '',
      srcKind: mine ? 'local' : first.srcKind,
      srcName: mine ? N(parts.length, 'ملف') : first.srcName,
    },
  };
}
/** عرض الكتاب من أجزائه (بعد اختيار، أو إضافة، أو حذف، أو إعادة قراءة) */
function showParts(keep = false) {
  const { book, pages } = bookOfParts();
  showBook(book, pages, keep);
  renderParts();
}
/** قائمة الأجزاء: كل كتاب اختير ومعه حذفه، وزر «إضافة» */
function renderParts() {
  const ps = state.parts;
  $('#partsBox').hidden = !ps.length;
  if (!ps.length) return;
  $('#partsList').innerHTML = ps
    .map((p, i) => `<li><i class="d"></i><b>${ps.length > 1 ? esc(volumeLabel(String(p.vol))) : 'الكتاب'}</b><span title="${esc(p.kind === 'mine' ? p.file.name : p.book.name)}">${esc(p.kind === 'mine' ? p.file.name.replace(/\.(docx|pdf)$/i, '') : p.book.name)}</span><small>${N(bookPages(p.book), 'صفحة')}</small><button type="button" class="tbtn" data-del="${i}" title="حذف هذا الكتاب من الاختيار">حذف</button></li>`)
    .join('');
  $('#partsNote').textContent = ps.length > 1 ? 'كل كتاب مجلدٌ في كتاب واحد، ويخرج كل مجلد بملفه.' : 'أضف إليه كتاباً آخر فيصيران مجلدين في كتاب واحد.';
}
/** إضافة أجزاء إلى الكتاب المعروض: تأخذ الأرقام التالية */
function addParts(parts) {
  let next = Math.max(0, ...state.parts.map((p) => +p.vol || 0));
  for (const p of parts) state.parts.push({ ...p, vol: ++next });
  if (!state.setName) state.setName = state.parts[0].book.name;
  addMode = false;
  showParts(true);
  renderSources();
  $('#bookCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`أُضيف ${parts.length === 1 ? 'الكتاب' : N(parts.length, 'كتاب')} مجلداً: صار الكتاب ${N(state.parts.length, 'مجلد')}`, 3200, 'ok');
}
/** «إضافة»: كتاب من مجلد الكتب يُضاف مجلداً (كتب «تراث» لها مجلداتها، فلا تُضاف) */
async function addFromSource(id, src) {
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  try {
    const book = await readSource(id, src, state.book && state.book.word ? wordKey(state.book.word.options) : '');
    if (!book.local) return toast('لا يُضاف مجلداً إلا كتاب من ملف Word: من جهازك، أو من مجلد الكتب', 4200, 'no');
    addParts([partOf(book)]);
  } catch (err) {
    toast('تعذّر تحميل الكتاب: ' + err.message);
  }
}
/** «#»: مجلد فيه كتب ← كتاب واحد، ملفاته مجلداته بأرقامها التي في أسمائها */
async function loadSet(hit) {
  if (!hit || !hit.members || !hit.members.length) return;
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  const adding = addMode && state.parts.length > 0;
  const n = hit.members.length;
  if (!adding) {
    $('#bookCard').hidden = false;
    $('#bookMeta').textContent = '';
    $('#bookSrc').hidden = true;
    $('#volList').innerHTML = '';
    $('#partsBox').hidden = true;
  }
  const wo = adding && state.book.word ? wordKey(state.book.word.options) : '';
  try {
    const parts = [];
    for (const [i, m] of hit.members.entries()) {
      if (!adding) $('#bookTitle').textContent = `تُقرأ المجلدات: ${ar(i + 1)} من ${ar(n)}…`;
      parts.push(partOf(await readSource(m.id, hit.src, wo), +m.vol || i + 1));
    }
    if (adding) return addParts(parts);
    state.parts = parts;
    state.setName = hit.name;
    state.setAuthor = hit.author || '';
    state.setKeepNums = true;
    showParts(false);
  } catch (err) {
    if (adding) toast('تعذّر تحميل المجلدات: ' + err.message);
    else $('#bookTitle').textContent = 'تعذّر تحميل المجلدات: ' + err.message;
  }
}
$('#addPart').addEventListener('click', () => {
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  if (!state.parts.length) return;
  addMode = true;
  // كتابه من ملفاته: يضع ملفاً آخر. ومن مجلد الكتب: يبحث عنه
  wordMode = state.parts[0].kind === 'mine';
  $('#results').innerHTML = '';
  $('#searchStatus').hidden = true;
  $('#myStatus').hidden = true;
  renderSources();
  $('#s1').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => (wordMode ? $('#mySlot') : $('#q')).focus({ preventScroll: true }), 350);
});
$('#addCancel').addEventListener('click', () => {
  addMode = false;
  renderSources();
});
$('#partsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  const gone = state.parts.splice(+b.dataset.del, 1)[0];
  if (!state.parts.length) {
    // لم يبقَ كتاب: تُطوى المحطات التي بعد البحث
    stopAll();
    clearFiles();
    state.parsed.clear();
    state.book = null;
    state.localPages = null;
    state.setName = '';
    addMode = false;
    for (const id of ['#bookCard', '#settingsCard', '#progressCard']) $(id).hidden = true;
    renderSources();
    return toast('حُذف الكتاب من الاختيار', 2600, 'ok');
  }
  // أرقام من أسماء الملفات تبقى؛ وما رُقّم بترتيب إضافته يُعاد تسلسله
  if (!state.setKeepNums) state.parts.forEach((p, i) => (p.vol = i + 1));
  if (state.parts.length === 1) state.setName = state.setAuthor = '';
  showParts(true);
  toast(`حُذف «${gone.book.name}» من الاختيار`, 2600, 'ok');
});

/* ------------------------------------------------------------------ ٢. الكتاب والمجلدات */
async function loadBook(id, src = '', wo = '', keep = false) {
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  $('#bookCard').hidden = false;
  if (!keep) {
    $('#bookTitle').textContent = 'جارٍ تحميل بيانات الكتاب…';
    $('#bookMeta').textContent = '';
    $('#bookSrc').hidden = true;
    $('#volList').innerHTML = '';
  }
  try {
    // wo: خيارات قراءة ملف Word (لكتب مجلد المالك)
    const book = await readSource(id, src, wo);
    state.setName = state.setAuthor = '';
    state.setKeepNums = false;
    state.parts = book.local ? [partOf(book)] : [];
    showBook(book, null, keep);
    renderParts();
    return true;
  } catch (err) {
    // إعادة قراءة كتاب معروض (keep): يبقى كما هو، والخطأ يظهر عند خياراته
    if (!keep) $('#bookTitle').textContent = 'تعذّر تحميل الكتاب: ' + err.message;
    return false;
  }
}

/** عرض كتاب (مجلوب من مصدر، أو ملف المستخدم «كتابي» ومعه صفحاته) وتهيئة ما بعده */
/** keep: الكتاب نفسه أُعيدت قراءته بخيارات أخرى (ملف Word): يبقى ما عدّله المستخدم من بيانات الغلاف والقالب */
function showBook(book, localPages, keep = false) {
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  $('#bookCard').hidden = false;
  {
    const id = book.id;
    const seq = ++state.loadSeq;
    const prevCover = state.cover;
    state.book = book;
    state.localPages = localPages || null;
    state.doc = null; // كتاب آخر (أو قراءة أخرى للملف): ملف الكتاب يُصنع من جديد
    if (!keep) {
      state.dirty = new Set();
      state.tplTouched = false;
      state.outer = { ...state.outer, authorShort: '', authorTitle: '', edited: [] };
    }
    state.meta = { bookType: '', source: '' };
    state.parsed.clear();
    clearFiles();
    state.cover = keep ? { ...book.cover, ...Object.fromEntries([...state.dirty].map((k) => [k, prevCover[k]])) } : { ...book.cover };
    // غلاف الملف (صورة تملأ صفحته الأولى): يكون الغلاف الخارجي ما لم يُختر تصميم
    const w = book.word || null;
    const fc = w && w.cover && w.options.keepCover && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(w.cover.src) ? w.cover.src : '';
    if (fc && (!keep || !state.fileCover) && state.outer.mode !== 'design') state.outer.mode = 'file';
    if (!fc && state.outer.mode === 'file') state.outer.mode = 'none';
    state.fileCover = fc;
    // خلفيات صفحات الملف (صورٌ خلف النص في رؤوس صفحاته): خلفيات الكتاب كما هي، ويغيّرها المستخدم أو يزيلها
    if (!keep) {
      state.bgs = cleanBgsClient(w && w.bgs);
      state.noStyle = null;
    } else if (w && w.bgs && !hasBgs()) state.bgs = cleanBgsClient(w.bgs);
    renderBgs();
    // ملف جاء بصفحات عنوانه (صور): لا يُصنع الغلاف الداخلي مبدئياً. وغيره: يُصنع كالعادة
    if (!keep) state.innerTouched = false;
    // (والملف الذي جاء بغلافه — صورةً أولَه أو في رأس صفحته الأولى — لا يُزاد عليه غلافٌ داخلي من ورّاق: الكتاب كما في الملف)
    if (!state.innerTouched) state.innerCover = !(w && (w.titlePages || w.cover) && w.options.keepCover);
    // فهرس الملف كما هو: في موضعه من الملف (أوله أو آخره)
    if (w && w.toc === 'file' && (w.tocAt === 'start' || w.tocAt === 'end') && !keep) {
      state.settings.tocPosition = w.tocAt;
      $$('#tocPos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === w.tocAt)));
    }
    if (workKind === 'mutun' && !book.research && !book.mutun) book.mutun = true;
    syncResearch(book, keep);
    renderWordBox();
    $('#bookTitle').textContent = book.name;
    $('#bookMeta').textContent = book.cover.author || '';
    // رابط الكتاب في موقع مصدره (إن كان له موقع)، ووسم المصدر إن لم يكن «تراث»
    const link = book.link === undefined ? 'https://app.turath.io/book/' + id : book.link;
    $('#bookLink').hidden = !link;
    if (link) $('#bookLink').href = link;
    $('#bookLink').textContent = `عرض في ${book.srcName && book.src !== 'turath' ? book.srcName : 'تراث'}`;
    const showSrc = book.srcKind === 'local' || book.srcKind === 'folder' || SOURCES.sources.length > 1 || SOURCES.sources.some((x) => x.count > 1);
    $('#bookSrc').hidden = !showSrc || !book.srcName;
    $('#bookSrc').className = 'src-badge k-' + (book.srcKind || 'api');
    $('#bookSrc').textContent = `${KIND_ICON[book.srcKind] || ''} ${book.srcKind === 'local' ? 'ملفك: ' : book.srcKind === 'folder' ? 'من الجهاز: ' : book.srcKind === 'shamela' ? 'من الشاملة: ' : 'المصدر: '}${book.srcName || ''}`;
    $('#autoNote').hidden = true;
    if (book.research) researchNote(book);
    for (const inp of $$('[data-cover]')) inp.value = state.cover[inp.dataset.cover] || '';
    // مجلدات المصدر كما هي (والتقسيم يبدّلها ويعود إليها)
    book.origVolumes = book.volumes;
    state.split = null;
    renderVolumes();
    renderSplit();
    $('#settingsCard').hidden = false;
    renderOuter();
    preview.update();
    enrich(id, seq, book.src || '', localPages || book.set ? { name: book.name, info: book.info } : null); // في الخلفية: لا ينتظره شيء ولا يُظهر أخطاء
    if (!keep && !SCRIBE) $('#bookCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (DESK) deskChanged();
  }
}

/**
 * البحث العلمي: قالبه «بحث علمي» وأساليبه أساليب الأبحاث، وتُخفى خيارات المتن والشرح والشعر.
 * والكتاب بعد بحثٍ يعود إلى أساليب الكتب.
 */
function syncResearch(book, keep) {
  const r = !!(book && book.research);
  const mu = !r && !!(book && book.mutun);
  if (gateOpen()) closeGate(null);
  setKind(r ? 'research' : mu ? 'mutun' : 'books', true);
  renderKindBar();
  if (r && !isResearchSettings(state.settings)) {
    state.settings = researchDefaults();
    state.settingsTouched = false;
  } else if (!r && isResearchSettings(state.settings)) {
    state.settings = defaultSettings();
    state.settingsTouched = false;
  }
  // المتون: إعداداتها (شكل التعليق الذي اختاره المستخدم آخر مرة، وما فُهم من ملف المتن المهيّأ للتعليق)، والمتن كله
  if (state.settings.mutun || MUTUN_KEYS.some((k) => k in state.settings)) state.settings = splitMutun(state.settings).settings;
  if (mu && !keep) state.mutun = cleanMutun({ ...loadMutunLook(), ...(book.mdetect || {}), mKind: 'auto', mRange: { mode: 'all' } });
  // ما يُفهم من ترتيب صفحات المتن («قال …»، عنوان التعليق…) يُعرف بعد تحليله: يُضبط منه مرةً لهذا الكتاب
  muReadPending = !!(mu && !keep);
  if (!keep) state.asIs = false;
  MU.key = '';
  MU.seq++;
  Object.assign(MU, { parsed: null, applied: null, base: null, outline: null, est: null, doc: null, loading: false });
  muHadData = false;
  renderSettingsUI();
  if (mu) setTimeout(ensureMutunData, 50);
  if (r) state.tplTouched = true; // لا يغيّر التحليلُ القالب
  researchUI(r);
}
function researchUI(r) {
  document.documentElement.classList.toggle('is-research', r);
  syncMutunUI();
  renderRange();
  const hide = (el, h) => el && (el.hidden = h);
  // المتون: لا شرح فيها ولا متنٌ مضمَّن، والأجزاء هي التي تبدأ الصفحات (لا الأبواب)
  const mu = mutunOn();
  hide($('#matnColors') && $('#matnColors').closest('.panel'), r || mu);
  for (const id of ['#sharhEnd', '#verseLayout', '#verseSepWrap', '#mergeBroken', '#matnQawluhu']) hide($(id) && $(id).closest('.row'), r);
  for (const id of ['#sharhEnd', '#matnQawluhu', '#chapterNewPage']) hide($(id) && $(id).closest('.row'), r || mu);
  // تصحيح المسافات وتوحيدها: خياران للبحث وحده (وفي الكتب والمتون من المحرك نفسه)
  for (const el of $$('.research-only')) hide(el, !r);
  const subs = $$('#s3 > h3.sub');
  if (subs[0]) subs[0].innerHTML = r ? 'القالب <small>بنية البحث العلمي</small>' : 'القالب الأساسي <small>المتن أساس كل القوالب</small>';
  if (subs[1]) subs[1].textContent = r ? 'أسلوب البحث' : 'أسلوب دار النشر';
  // المنضدة في البرنامج: العنوان الصغير فوق البطاقات
  const ol = $('#presets').parentElement && $('#presets').parentElement.querySelector(':scope > .bn-ol');
  if (ol) ol.textContent = r ? 'أسلوب البحث' : 'أسلوب دار النشر';
}
/** ما فهمه ورّاق من البحث (فوق القوالب) */
function researchNote(book) {
  const m = book.rmeta || {};
  const secs = (m.sections || []).map((k) => SECTION_LABEL[k]).filter(Boolean);
  const units = Object.entries(m.units || {}).map(([k, n]) => (UNIT_LABEL[k] ? (n === 1 ? UNIT_LABEL[k][0] : ar(n) + ' ' + (n <= 10 ? UNIT_LABEL[k][1] : UNIT_LABEL[k][0])) : ''));
  const note = $('#autoNote');
  note.hidden = false;
  note.innerHTML =
    'بحث علمي' + (m.titlePage ? ' بصفحة عنوانه (تبقى غلافه الداخلي)' : '') + (secs.length || units.filter(Boolean).length ? ': فيه ' + esc([...secs, ...units.filter(Boolean)].join('، ')) : '') +
    ' — العناوين بمصطلحات البحث (المقدمة والتمهيد والخاتمة والمصادر، ثم الأبواب والفصول والمباحث والمطالب)، والملخص والكلمات المفتاحية والمراجع والنص الإنجليزي كلٌّ بتنسيقه. اختر القالب بحسب نوع البحث، والأسلوب بحسب الجامعة أو الجهة.';
}

/** كعوب المجلدات في الخزانة الخشبية: كل مجلد كعبُه، وسماكته بعدد صفحاته. ويمتلئ الرفّ بقدر عرضه، وما زاد فعلى رفّ تحته */
function renderVolumes() {
  const book = state.book;
  const single = book.volumes.length <= 1;
  $('#volBox').hidden = single;
  $('#singleVol').hidden = !single;
  state.selected = new Set(book.volumes.map((v) => v.vol));
  const spine = (v, i) => {
    const num = /^[0-9٠-٩]{1,3}$/.test(String(v.vol).trim()) ? ar(v.vol) : ar(i + 1);
    const tip = volumeLabel(v.vol) + '، ' + N(v.pages, 'صفحة') + (v.first ? '. يبدأ بـ«' + v.first + '»' : '') + (v.parts && v.parts.length ? '. يضم: ' + v.parts.join('، ') : '');
    return `<label class="vol spine sel" title="${esc(tip)}"><input type="checkbox" value="${esc(v.vol)}" checked ${single ? 'disabled' : ''} aria-label="${esc(tip)}"><b>${num}</b><small>${ar(v.pages)}<i>صفحة</i></small></label>`;
  };
  $('#volList').innerHTML = `<div class="shelf">${book.volumes.map(spine).join('')}</div>`;
  layoutShelves();
  updateVolCount();
}

/* ---- تقسيم الكتاب: بمجلدات الطبعة، أو كل بابٍ كبير مجلد، أو بعددٍ يُختار (وكل مجلد يبدأ بباب)، أو بصفحاتٍ يختارها المستخدم ---- */
const splitBook = () => state.book && { ...state.book, volumes: state.book.origVolumes || state.book.volumes };
const canSplit = () => !!(state.book && !state.book.set && !state.doc && !state.book.mutun && (state.book.totalPages || 0) >= 20);
function renderSplit() {
  const box = $('#splitBox');
  box.hidden = !canSplit();
  if (box.hidden) return;
  const book = splitBook();
  const orig = book.volumes;
  const runs = printedRuns(book.pageMap);
  box.dataset.printed = runs.length > 1 && orig.length === 1 ? String(runs.length) : '';
  const top = topHeads(book);
  const heads = top.list.length; // الباب الأول وما قبله مجلدٌ واحد
  const mode = state.split ? state.split.mode : 'none';
  const n = state.split && state.split.mode === 'count' ? state.split.n : Math.max(2, Math.min(MAX_SPLIT, runs.length || Math.round(bookPages(book) / 500) || 2));
  const opt = (m, name, sub, on = true, extra = '') => `<div class="sp-opt${mode === m ? ' on' : ''}"><button type="button" role="radio" data-split="${m}" aria-checked="${mode === m}" ${on ? '' : 'disabled'}><b>${name}</b><small>${sub}</small></button>${extra}</div>`;
  $('#splitModes').innerHTML = [
    opt('none', 'كما في المصدر', orig.length > 1 ? N(orig.length, 'مجلد') : 'مجلدٌ واحد'),
    opt('printed', 'بمجلدات الطبعة', runs.length > 1 ? `${N(runs.length, 'مجلد')} من ترقيم الصفحات «${ar(runs[1].vol)}/١»` : 'لا أرقام مجلدات في ترقيم صفحاته', runs.length > 1 && runs.length !== orig.length),
    opt('heads', 'كل بابٍ كبير مجلد', heads > 1 ? (heads <= MAX_SPLIT ? `${N(heads, 'مجلد')} بعدد أبوابه الكبرى` : `أبوابه الكبرى كثيرة (${ar(heads)})`) : 'لا أبواب كبرى فيه', heads > 1 && heads <= MAX_SPLIT),
    opt('count', 'بعددٍ تختاره', 'بأحجامٍ متقاربة، وكل مجلد يبدأ بباب', true, `<span class="split-n"><button type="button" data-dn="-1" aria-label="أنقص">−</button><input type="number" id="splitN" min="2" max="${MAX_SPLIT}" value="${n}" aria-label="عدد المجلدات"><button type="button" data-dn="1" aria-label="زد">+</button></span>`),
    opt('custom', 'بصفحاتٍ تختارها', 'عدّل بداية كل مجلد'),
  ].join('');
  // المجلدات كما ستخرج: يبدأ كلٌّ منها من صفحةٍ تُعدَّل
  const vols = state.book.volumes;
  const plan = $('#splitPlan');
  plan.hidden = mode === 'none';
  if (plan.hidden) return;
  const total = book.totalPages || 0;
  // خانات البدء بعدّ صفحات الطبعة، لا بمدخلات الملف
  const seq = (pg) => countPrinted(book.pageMap, 1, pg);
  const pp = (pg) => {
    const v = printedVolOf(book.pageMap, pg), p = printedPage(book.pageMap, pg);
    return p ? ` <span class="pp" title="رقمها في الطبعة">${v ? ar(v) + '/' : ''}${ar(p)}</span>` : '';
  };
  $('#splitList').innerHTML = vols
    .map((v, k) => {
      const last = k === vols.length - 1;
      const end = last ? total : vols[k + 1].start - (vols[k + 1].head ? 0 : 1);
      const mid = k > 0 && !v.head && headAt(book, v.start) == null;
      return `<li data-k="${k}"><b>${esc(volumeLabel(v.vol))}</b>
        <span class="sp-r">من ص <input type="number" min="1" max="${seq(total)}" value="${seq(v.start)}" data-start="${k}" ${k === 0 ? 'disabled' : ''} aria-label="صفحة بدايته">${pp(v.start)} إلى ص ${ar(seq(end))}${pp(end)}</span>
        <small>${N(v.pages, 'صفحة')}</small>
        <em class="${mid ? 'warn' : ''}" title="${esc(v.first || '')}">${mid ? 'لا يبدأ ببابٍ أو فصل' : v.first ? 'يبدأ بـ«' + esc(v.first) + '»' : ''}</em>
        ${k ? `<button type="button" class="sp-x" data-merge="${k}" title="اجمعه إلى ما قبله" aria-label="اجمعه إلى ما قبله">×</button>` : '<span></span>'}</li>`;
    })
    .join('');
  const notes = [];
  if (mode === 'count' && state.splitInexact) notes.push('لا أبواب في الكتاب تكفي هذا العدد: قُسِّم بالصفحات.');
  if (vols.some((v) => v.head)) notes.push('البابُ الذي يبدأ في وسط صفحة: ما قبله آخر المجلد السابق، وهو أول التالي.');
  $('#splitNote').textContent = notes.join(' ');
  $('#splitAdd').disabled = vols.length >= MAX_SPLIT;
}
/** يطبّق التقسيم (أو يعيد مجلدات المصدر): المجلدات وكعوبها، والاختيار، والمعاينة */
function applySplit(split, { quiet = false } = {}) {
  if (!state.book) return;
  if (state.running) return toast('أوقف العملية الجارية أولاً');
  const s = cleanSplit(split);
  if (!quiet && state.edits.ops.length && !confirm('تعديلات المحرِّر مرتبطة بمجلدات الكتاب، وتغيير التقسيم يجعلها لا تطابقه. أتمضي؟')) return renderSplit();
  const book = splitBook();
  let vols = s ? splitVolumes(book, s) : null;
  if (s && !vols) {
    if (!quiet) toast('لا يتأتّى هذا التقسيم في هذا الكتاب');
    return renderSplit();
  }
  state.splitInexact = !!(s && s.mode === 'count' && !startsByCount(book, s.n).exact);
  state.split = vols ? s : null;
  state.book.volumes = vols || book.volumes;
  state.parsed.clear();
  clearFiles();
  renderVolumes();
  renderSplit();
  if (!quiet) {
    pushOuterData();
    preview.update();
    deskChanged();
  }
}
/** بدايات المجلدات من الجدول (للتقسيم اليدوي) */
const splitStarts = () => state.book.volumes.map((v) => v.start);
$('#splitModes').addEventListener('click', (e) => {
  const step = e.target.closest('[data-dn]');
  if (step) {
    const inp = $('#splitN');
    inp.value = Math.max(2, Math.min(MAX_SPLIT, (+inp.value || 2) + +step.dataset.dn));
    return applySplit({ mode: 'count', n: +inp.value });
  }
  if (e.target.closest('#splitN')) return;
  const b = e.target.closest('[data-split]');
  if (!b || b.disabled) return;
  const m = b.dataset.split;
  if (m === 'none') return applySplit(null);
  if (m === 'count') return applySplit({ mode: 'count', n: +$('#splitN').value || 2 });
  if (m === 'custom') return applySplit({ mode: 'custom', starts: state.split ? splitStarts() : startsByCount(splitBook(), Math.max(2, Math.round(bookPages(state.book) / 600) || 2)).starts });
  applySplit({ mode: m });
});
$('#splitModes').addEventListener('change', (e) => {
  if (e.target.id === 'splitN') applySplit({ mode: 'count', n: +e.target.value || 2 });
});
$('#splitList').addEventListener('change', (e) => {
  const inp = e.target.closest('[data-start]');
  if (!inp) return;
  const starts = splitStarts();
  starts[+inp.dataset.start] = Math.max(2, Math.min(state.book.totalPages, entryOfPrinted(state.book.pageMap, Math.round(+inp.value) || 2)));
  applySplit({ mode: 'custom', starts });
});
$('#splitList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-merge]');
  if (!b) return;
  applySplit({ mode: 'custom', starts: splitStarts().filter((_, k) => k !== +b.dataset.merge) });
});
$('#splitAdd').addEventListener('click', () => {
  // أكبر المجلدات يُقسم عند أقرب بابٍ إلى وسطه (أو وسطه إن لم يكن فيه باب)
  const book = splitBook();
  const vols = state.book.volumes;
  const big = vols.reduce((a, v) => (v.pages > a.pages ? v : a), vols[0]);
  const mid = Math.round((big.start + big.end) / 2);
  const hs = topHeads(book, 1).list.map((h) => h.page).filter((p) => p > big.start && p < big.end);
  const at = hs.length ? hs.reduce((a, p) => (Math.abs(p - mid) < Math.abs(a - mid) ? p : a), hs[0]) : mid;
  applySplit({ mode: 'custom', starts: [...splitStarts(), at] });
});

/* ---- ملف Word: ما فهمه الموقع منه، وخيارات قراءته (تغييرها يعيد قراءة الملف) ---- */
// المعدود العربي: واحد، مثنى، جمع (٣–١٠)، مفرد منصوب (١١ فأكثر)
const COUNTED = {
  متن: ['متن واحد', 'متنان', 'متون', 'متناً'],
  عنوان: ['عنوان واحد', 'عنوانان', 'عناوين', 'عنواناً'],
  حاشية: ['حاشية واحدة', 'حاشيتان', 'حواشٍ', 'حاشية'],
  بيت: ['بيت واحد', 'بيتان', 'أبيات', 'بيتاً'],
  صورة: ['صورة واحدة', 'صورتان', 'صور', 'صورة'],
  كتاب: ['كتاب واحد', 'كتابان', 'كتب', 'كتاباً'],
  ملف: ['ملف واحد', 'ملفان', 'ملفات', 'ملفاً'],
  مجلد: ['مجلد واحد', 'مجلدان', 'مجلدات', 'مجلداً'],
  صفحة: ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  سطر: ['سطر واحد', 'سطران', 'أسطر', 'سطراً'],
  جدول: ['جدول واحد', 'جدولان', 'جداول', 'جدولاً'],
  فقرة: ['فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة'],
  غلاف: ['غلاف', 'غلافان', 'أغلفة', 'غلافاً'],
  خط: ['خط واحد', 'خطان', 'خطوط', 'خطاً'],
  تعديل: ['تعديل واحد', 'تعديلان', 'تعديلات', 'تعديلاً'],
  موضع: ['موضع واحد', 'موضعين', 'مواضع', 'موضعاً'],
  جزء: ['جزء واحد', 'جزأين', 'أجزاء', 'جزءاً'],
};
function N(n, word) {
  const f = COUNTED[word];
  n = Number(n) || 0;
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  const k = n % 100;
  return `${arN(n)} ${k >= 3 && k <= 10 ? f[2] : f[3]}`;
}
const MATN_SAYS = {
  sep: (w) => `${N(w.units, 'متن')}، يفصل الخط «---» كل متن عن شرحه`,
  toggle: (w) => `${N(w.units, 'متن')}، والخط «---» يتناوب بين المتن والشرح`,
  label: (w) => `${N(w.units, 'متن')} بين «المتن:» و«الشرح:»`,
  box: (w) => `${N(w.units, 'متن')}، كل متن في إطار وشرحه بعده`,
};
const EMBED_SAYS = {
  bold: () => 'المتن داخل الشرح: ما كُتب عريضاً',
  color: (w) => `المتن داخل الشرح: ما كُتب بهذا اللون <i class="word-sw" style="background:${/^#[0-9a-f]{6}$/i.test(w.matnColor) ? w.matnColor : '#888'}"></i>`,
  font: () => 'المتن داخل الشرح: ما كُتب بخط آخر أو مقاس آخر',
  paren: () => 'المتن داخل الشرح: ما بين قوسين',
  marks: () => 'المتن داخل الشرح: ما بين «ــ ــ»',
};
function renderWordBox() {
  const book = state.book;
  const w = book && book.word;
  const box = $('#wordBox');
  box.hidden = !w;
  if (!w) return;
  $('#wordAsIs').closest('label').hidden = !w.look;
  $('#wordAsIs').checked = !!state.asIs;
  // (بعد إعادة قراءة الملف: شكله كما صار)
  if (state.asIs && w.look && state.settings.preset !== 'file') {
    const fs = fileStyle();
    if (fs) state.settings = { ...fs.settings, template: state.settings.template || 'full' };
  }
  const st = book.stats || {};
  const bits = [];
  if (w.set) bits.push(`<b>${N(w.set, 'كتاب')}</b>: كل واحد منها مجلد في هذا الكتاب. ما يأتي عن أولها، وخيارات القراءة تسري عليها كلها`);
  // النوع: شرح (متونه مفصولة عن شروحها، أو مضمَّنة فيها)، أو كتاب عادي
  // البحث: لا متن ولا شرح فيه، وخيارات المتن مخفية
  const R = !!book.research;
  const MUB = !!book.mutun;
  $('#wordMatn').closest('label').hidden = R || MUB;
  $('#wordEmbed').closest('label').hidden = R || MUB;
  if (MUB) {
    // المتون: ما فُهم من ملف المتن المهيّأ للتعليق (مواضع التعليق فيه، وتقسيمه)
    const d = book.mdetect;
    bits.push(
      d && d.mPlace
        ? `<b>متنٌ مهيّأ للتعليق</b>: ${d.mPlace === 'page' ? 'صفحةٌ للتعليق تقابل المتن' : 'موضع التعليق تحت المتن'}${d.mRule ? '، سطورها ' + ({ dots: 'منقّطة', lines: 'خطوط', blank: 'فارغة' }[d.mRule] || '') : ''}${d.mLabel ? `، بعنوان «${esc(d.mLabel)}»` : ''}${d.mDivide === 'manual' ? '، والأجزاء كما في الملف (يختم كلاً منها موضع تعليقه)' : d.mCount ? `، وفي كل جزءٍ ${d.mDivide === 'verses' ? N(d.mCount, 'بيت') : N(d.mCount, 'فقرة')}` : ''} — ضُبطت الإعدادات منه، ورُفعت سطور الكتابة من النص`
        : '<b>متن</b>: اسمه من أول سطرٍ فيه، ونوعه (نظمٌ أو نثر) من نصه',
    );
  } else if (R) bits.push('<b>بحث علمي</b>: ' + (book.rmeta && book.rmeta.titlePage ? 'بصفحة عنوانه، و' : '') + 'بنيته من عناوينه ومصطلحاته (الملخص، المقدمة، المباحث والمطالب، الخاتمة، المصادر)');
  else if (MATN_SAYS[w.matn]) bits.push('<b>شرح</b>: ' + MATN_SAYS[w.matn](w));
  else if (EMBED_SAYS[w.embed]) bits.push('<b>شرح</b>: متنه مضمَّن في شرحه');
  else bits.push('كتاب عادي: لا متن مميَّزاً فيه' + (w.seps ? ` (وفيه ${N(w.seps, 'خط')} «---»)` : ''));
  if (!R && EMBED_SAYS[w.embed]) bits.push(EMBED_SAYS[w.embed](w) + ' — يُكتب بلون المتن وخطه وأقواسه من الإعدادات');
  const count = (n, word) => (n ? N(n, word) : '');
  bits.push([count(st.headings, 'عنوان'), count(st.notes, 'حاشية'), count(st.verses, 'بيت'), count(w.images, 'صورة'), count(w.tables, 'جدول')].filter(Boolean).join('، '));
  if (w.hasToc) bits.push(w.toc === 'file' ? `فهرس الملف نفسه: ${N(w.tocMatched, 'عنوان')}${w.tocMatched < w.tocEntries ? ` (من ${ar(w.tocEntries)}، والباقي لم يوجد في النص)` : ''} — وحُذف الفهرس القديم من النص` : `حُذف الفهرس القديم من النص (${N(w.tocEntries, 'عنوان')})، ويُبنى فهرس جديد`);
  else bits.push('لا فهرس قديماً في الملف: يبنيه ورّاق من العناوين');
  if (w.tocsRemoved > 1) bits.push(`وحُذفت معه ${w.tocsRemoved - 1 === 1 ? 'فهرس آخر' : ar(w.tocsRemoved - 1) + ' فهارس أخرى'} (أرقام صفحاتها لم تعد صحيحة)`);
  if (w.covers) bits.push(!w.options.keepCover ? `في الملف ${N(w.covers, 'غلاف')} (صورة تملأ الصفحة) لم ${w.covers === 2 ? 'يُؤخذا' : w.covers > 1 ? 'تُؤخذ' : 'يُؤخذ'}` : w.cover ? 'غلاف الملف: أول صفحة' + (w.covers > 1 ? `، و${w.covers > 2 ? N(w.covers - 1, 'غلاف') + ' أخرى' : 'غلاف آخر'} في موضعه من الكتاب` : '') : `${N(w.covers, 'غلاف')} في موضعه من الكتاب`);
  if (w.titlePages) bits.push(w.options.keepCover ? `${w.titlePages === 1 ? 'صفحة عنوان' : w.titlePages === 2 ? 'صفحتا عنوان' : ar(w.titlePages) + ' صفحات عنوان'} بصورها (عنوان الكتاب، شعار الدار): كل صفحة كما هي في الملف` : `${w.titlePages === 1 ? 'صفحة عنوان' : ar(w.titlePages) + ' صفحات عنوان'} بصورها لم تُؤخذ`);
  if (w.pageMarks) bits.push(`${N(w.pageMarks, 'سطر')} من أسطر أرقام الصفحات («ص: ١٢») رُفعت من النص`);
  if (st.typedNotes) bits.push(`${N(st.typedNotes, 'حاشية')} مكتوبة تحت خط حُوّلت حواشيَ حقيقية`);
  if (st.imagesSkipped) bits.push(`${N(st.imagesSkipped, 'صورة')} لم تُؤخذ (رمز صغير في السطر، أو صيغة لا تُعرض)`);
  $('#wordSummary').innerHTML = bits.filter(Boolean).map((b) => `<li>${b}</li>`).join('');
  const o = w.options;
  $('#wordMatn').innerHTML = Object.entries(WORD_MATN)
    .map(([k, v]) => `<option value="${k}" ${k === o.matn ? 'selected' : ''}>${esc(v)}${k === 'auto' && w.detected ? ' — ' + esc(WORD_MATN_SHORT[w.detected] || '') : ''}</option>`)
    .join('');
  $('#wordEmbed').innerHTML = Object.entries(WORD_EMBED)
    .map(([k, v]) => `<option value="${k}" ${k === o.embed ? 'selected' : ''}>${esc(v)}${k === 'auto' && w.embedDetected ? ' — ' + esc(WORD_EMBED_SHORT[w.embedDetected] || '') : ''}</option>`)
    .join('');
  $('#wordToc').value = o.toc;
  $('#wordTocRow').hidden = !w.hasToc;
  $('#wordFormat').checked = o.keepFormat;
  $('#wordCover').checked = o.keepCover;
  const pages = (w.covers || 0) + (w.titlePages || 0);
  $('#wordCoverRow').hidden = !pages;
  // الغلاف الداخلي الذي يصنعه الموقع: يُترك مبدئياً حين يأتي الملف بصفحات عنوانه
  $('#wordInnerRow').hidden = !(w.titlePages && o.keepCover);
  $('#wordInner').checked = state.innerCover !== false;
  $('#wordBusy').hidden = true;
}
const WORD_MATN = {
  auto: 'يتعرّف ورّاق وحده',
  none: 'لا متن مفصولاً عن شرحه',
  sep: 'الخط «---»: ما قبله متن وما بعده شرح',
  toggle: 'الخط «---» يتناوب: متن، ثم شرح، ثم متن…',
  label: '«المتن:» ثم «الشرح:»',
  box: 'المتن في إطار، وشرحه بعده',
};
const WORD_MATN_SHORT = { none: 'لا متن مفصولاً', sep: 'خط «---»', toggle: 'خط يتناوب', label: '«المتن: / الشرح:»', box: 'المتن في إطار' };
const WORD_EMBED = {
  auto: 'يتعرّف ورّاق وحده',
  none: 'لا متن داخل الشرح',
  bold: 'ما كُتب بالخط العريض',
  color: 'ما كُتب بلون مختلف',
  font: 'ما كُتب بخط آخر أو مقاس آخر',
  paren: 'ما بين قوسين ( )',
  marks: 'ما بين «ــ ــ»',
};
const WORD_EMBED_SHORT = { none: 'لا شيء', bold: 'العريض', color: 'الملوّن', font: 'ما بخط آخر', paren: 'ما بين قوسين', marks: 'ما بين «ــ ــ»' };
const WORD_CTRLS = ['#wordMatn', '#wordEmbed', '#wordToc', '#wordFormat', '#wordCover'];
const wordKey = (o) => [o.matn, o.embed, o.keepCover ? 1 : 0, o.keepFormat ? 1 : 0, o.toc].join('.');
async function reimportWord() {
  const book = state.book;
  if (!book || !book.word || state.reimporting) return;
  if (state.running) {
    renderWordBox();
    return toast('أوقف العملية الجارية أولاً');
  }
  const options = { matn: $('#wordMatn').value, embed: $('#wordEmbed').value, toc: $('#wordToc').value, keepFormat: $('#wordFormat').checked, keepCover: $('#wordCover').checked };
  const busy = $('#wordBusy');
  busy.hidden = false;
  busy.className = 'status';
  busy.innerHTML = '<span class="spin"><i></i><i></i><i></i></span> يُعاد قراءة الملف…';
  // خيار واحد في المرة: الخيارات تُقفل حتى تنتهي القراءة
  state.reimporting = true;
  for (const id of WORD_CTRLS) $(id).disabled = true;
  try {
    const parts = [];
    for (const [i, p] of state.parts.entries()) {
      if (state.parts.length > 1) busy.innerHTML = `<span class="spin"><i></i><i></i><i></i></span> يُعاد قراءة الملفات: ${ar(i + 1)} من ${ar(state.parts.length)}…`;
      parts.push(p.kind === 'mine' ? { ...(await readMine(p.file, options, null, !!p.book.research, !!p.book.mutun)), vol: p.vol } : partOf(await readSource(p.bookId, p.src, wordKey(options)), p.vol));
    }
    state.parts = parts;
    showParts(true);
    renderOuter();
  } catch (err) {
    // يبقى الكتاب كما كان، وتعود الخيارات إلى ما هو عليه
    renderWordBox();
    busy.hidden = false;
    busy.className = 'status err';
    busy.textContent = 'تعذّرت إعادة القراءة: ' + (err.message || err);
  } finally {
    state.reimporting = false;
    for (const id of WORD_CTRLS) $(id).disabled = false;
  }
}
for (const id of WORD_CTRLS) $(id).addEventListener('change', reimportWord);
// الغلاف الداخلي إعداد إخراج (لا يعيد قراءة الملف)
// «كما في الملف حرفياً»
$('#wordAsIs').addEventListener('change', (e) => {
  if (e.target.checked && !fileStyle()) {
    e.target.checked = false;
    return toast('هذا الخيار لملفات Word');
  }
  setAsIs(e.target.checked);
  // التنسيق والغلاف كما في الملف
  if (e.target.checked && state.book && state.book.word && (!state.book.word.options.keepFormat || !state.book.word.options.keepCover)) {
    $('#wordFormat').checked = true;
    $('#wordCover').checked = true;
    reimportWord();
  }
  toast(e.target.checked ? 'الكتاب كما هو في الملف: غيّر ما شئت من الإعدادات وحده' : 'عاد الكتاب إلى أسلوب ورّاق');
});
// لون الورق
$('#paperSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (b) setPaper(b.dataset.v);
});
// الهامش الخارجي، وجهة الصفحة الفردية
$('#omRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-om], [data-odd]');
  if (!b) return;
  if (b.dataset.om) setOm({ on: b.dataset.om === 'on' });
  else setOm({ odd: b.dataset.odd });
});
/* ---- خلفيات الصفحات: صفحات المتن والشرح، وصفحة الباب، وصفحة الفصل، والفهرس (أو صورة واحدة لها كلها) ---- */
const BG_KINDS = ['body', 'h1', 'h2', 'toc'];
const BG_NAME = { body: 'صفحات المتن والشرح', h1: 'صفحة الباب', h2: 'صفحة الفصل', toc: 'الفهرس' };
const BG_SRC = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
function cleanBgsClient(b) {
  const out = {};
  if (b && typeof b === 'object') for (const k of BG_KINDS) if (typeof b[k] === 'string' && BG_SRC.test(b[k])) out[k] = b[k];
  return out;
}
function hasBgs() {
  return !!state.bgs && ['body', 'h1', 'h2', 'toc'].some((k) => state.bgs[k]);
}
function renderBgs() {
  const B = state.bgs || {};
  for (const slot of $$('#bgs [data-bg]')) {
    const k = slot.dataset.bg;
    const own = B[k] || '';
    // صفحة الباب أو الفصل أو الفهرس بلا صورتها: تُرى صورة المتن باهتةً (بها تخرج)
    const shown = own || (k !== 'body' && k !== 'toc' ? B.body || '' : '');
    slot.classList.toggle('on', !!own);
    slot.classList.toggle('inh', !own && !!shown);
    slot.querySelector('.bg-th').style.backgroundImage = shown ? `url("${shown}")` : '';
    slot.querySelector('.bg-x').hidden = !own;
    slot.title = own ? `خلفية ${BG_NAME[k]}: اضغط لتغييرها` : `اختر صورةً خلفيةً لـ${BG_NAME[k]}`;
  }
  if ($('#bgClear')) $('#bgClear').hidden = !hasBgs();
}
/** صورة الخلفية: تُصغَّر الكبيرة (ضلعها الأطول ٢٤٠٠ نقطة، تكفي صفحةً بدقة الطباعة) */
async function bgImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || 'image/png';
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  if (k === 1 && bytes.length <= 1.5 * 1024 * 1024 && /png|jpeg/.test(mime)) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(bin)}`;
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.9);
}
let bgTarget = null;
function setBgs(patch, msg) {
  state.bgs = cleanBgsClient({ ...(state.bgs || {}), ...patch });
  for (const [k, v] of Object.entries(patch)) if (!v) delete state.bgs[k];
  renderBgs();
  preview.update();
  if (DESK) autosave();
  if (msg) toast(msg);
  try {
    window.dispatchEvent(new CustomEvent('warraq:look'));
  } catch {}
}
$('#bgs').addEventListener('click', (e) => {
  const x = e.target.closest('[data-bg-x]');
  if (x) {
    e.stopPropagation();
    return setBgs({ [x.dataset.bgX]: '' }, 'أُزيلت خلفية ' + BG_NAME[x.dataset.bgX]);
  }
  const b = e.target.closest('[data-bg]');
  if (!b) return;
  bgTarget = b.dataset.bg;
  $('#bgFile').click();
});
$('#bgAll').addEventListener('click', () => {
  bgTarget = '*';
  $('#bgFile').click();
});
$('#bgClear').addEventListener('click', () => setBgs({ body: '', h1: '', h2: '', toc: '' }, 'أُزيلت خلفيات الصفحات'));
$('#bgFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f || !bgTarget) return;
  try {
    const src = await bgImage(f);
    if (bgTarget === '*') setBgs({ body: src, h1: src, h2: src, toc: src }, 'صورةٌ واحدة خلفيةً للصفحات كلها');
    else setBgs({ [bgTarget]: src }, 'خلفية ' + BG_NAME[bgTarget]);
  } catch {
    toast('تعذّرت قراءة الصورة');
  }
  bgTarget = null;
});
$('#wordInner').addEventListener('change', (e) => {
  state.innerCover = e.target.checked;
  state.innerTouched = true;
});

/** توزيع كعوب المجلدات على الرفوف بحسب عرض الخزانة المتاح (والكعوب نفسها تُنقل فيبقى اختيارها) */
function layoutShelves() {
  const list = $('#volList');
  const book = state.book;
  if (!list || !book || !book.volumes) return;
  const els = [...list.querySelectorAll('.spine')];
  if (els.length !== book.volumes.length) return;
  const host = list.parentElement || list;
  const avail = host.clientWidth || window.innerWidth - 32;
  const narrow = isNarrow(avail);
  // كعوبٌ أعرض من كعوب الخزانة: يُقرأ عليها رقم المجلد وعدد صفحاته
  const widths = book.volumes.map((v) => Math.max(narrow ? 32 : 42, Math.round(spineWidth(v.pages, narrow) * 1.25)));
  const { rows, inner } = packShelves(widths, avail);
  els.forEach((el, i) => {
    const w = Math.min(widths[i], inner);
    el.style.width = w + 'px';
    el.classList.toggle('slim', w < 46);
  });
  list.classList.toggle('narrow', narrow);
  list.replaceChildren(...rows.map((r) => {
    const d = document.createElement('div');
    d.className = 'shelf';
    for (const i of r) d.appendChild(els[i]);
    return d;
  }));
}
watchWidth($('#volList') && $('#volList').parentElement, layoutShelves);

function updateVolCount() {
  const all = state.book.volumes;
  const single = all.length <= 1;
  const sel = all.filter((v) => single || state.selected.has(v.vol));
  const pages = sel.reduce((a, v) => a + v.pages, 0);
  $('#volCount').textContent = `${N(all.length, 'مجلد')}، ${!sel.length ? 'لم تختر منها شيئاً' : `اخترتَ ${sel.length === all.length ? 'كلها' : ar(sel.length) + ' منها'}. ${N(pages, 'صفحة')}`}`;
  for (const l of $$('#volList .spine')) {
    const on = l.querySelector('input').checked;
    l.classList.toggle('sel', on);
    l.classList.toggle('off', !on);
  }
  $('#goCap').textContent = sel.length ? `${single ? 'مجلد واحد' : N(sel.length, 'مجلد')}، ${N(pages, 'صفحة')}.${single ? '' : ' يخرج كل مجلد بملفه.'}` : 'لم تختر مجلداً بعد.';
}
$('#volList').addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return;
  e.target.checked ? state.selected.add(e.target.value) : state.selected.delete(e.target.value);
  updateVolCount();
  pushOuterData();
});
$('#selAll').onclick = () => {
  $$('#volList input').forEach((i) => (i.checked = true));
  state.selected = new Set(state.book.volumes.map((v) => v.vol));
  updateVolCount();
  pushOuterData();
};
$('#selNone').onclick = () => {
  $$('#volList input').forEach((i) => (i.checked = false));
  state.selected.clear();
  updateVolCount();
};
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.cover) {
    state.cover[e.target.dataset.cover] = e.target.value;
    state.dirty.add(e.target.dataset.cover);
  }
  if (e.target.dataset && e.target.dataset.outer) {
    state.outer[e.target.dataset.outer] = e.target.value;
    if (!state.outer.edited.includes(e.target.dataset.outer)) state.outer.edited.push(e.target.dataset.outer);
    saveOuter();
  }
  if (e.target.dataset && (e.target.dataset.outer || e.target.dataset.cover)) pushOuterData();
});

/* ---- التحليل (ذكاء اصطناعي إن كان مفعّلاً، وإلا الخوارزمية) — يملأ ما لم يعدّله المستخدم ---- */
const TYPE_LABEL = { matn: 'متن', sharh: 'شرح', hashiya: 'حاشية', sharh_and_hashiya: 'شرح وحاشية', tafsir: 'تفسير' };
const TYPE_TO_TPL = { matn: 'matn', sharh: 'matn_sharh', hashiya: 'matn_hashia', sharh_and_hashiya: 'full', tafsir: 'tafsir' };
async function enrich(id, seq, src = '', local = null) {
  if (state.book && state.book.docFile) return; // كتاب ورق: بياناته في ملفه
  if (state.book && state.book.research) return; // البحث: بنيته فُهمت من ملفه، وبيانات غلافه من صفحة عنوانه
  let r;
  try {
    // كتاب المستخدم «كتابي»: لا يعرفه الخادم، فيُرسل اسمه ليُعرف نوعه (متن، شرح، حاشية) بالخوارزمية
    const res = local
      ? await fetch('/api/book/enrich-local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(local) })
      : await fetch('/api/book/enrich?id=' + encodeURIComponent(id) + (src ? '&src=' + encodeURIComponent(src) : ''), { cache: 'no-store' });
    if (!res.ok) return;
    r = await res.json();
  } catch {
    return; // صامت تماماً: تبقى بيانات «تراث» والخوارزمية
  }
  if (seq !== state.loadSeq || !r || !r.fields) return;
  const f = r.fields;
  const coverMap = { title: f.main_title, subtitle: f.sub_title, editor: f.editor_name };
  for (const [k, v] of Object.entries(coverMap)) {
    if (!v || state.dirty.has(k)) continue;
    state.cover[k] = v;
    const inp = document.querySelector(`[data-cover="${k}"]`);
    if (inp) inp.value = v;
  }
  state.meta = { bookType: f.book_type || '', source: r.source };
  // إعدادات الصفحة: القالب حسب نوع الكتاب ما لم يختر المستخدم قالباً
  // كتاب من ملف Word (كتابي، أو من مجلد المالك): القالب الكامل، فلا تسقط حواشيه ولا شرحه
  const fromWord = !!(state.book && state.book.local);
  const tpl = fromWord ? 'full' : TYPE_TO_TPL[f.book_type];
  if (tpl && !state.tplTouched) {
    state.settings.template = tpl;
    $$('#templates .opt').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tpl === tpl)));
  }
  // الغلاف الخارجي: اسم الشهرة واللقب في ذاكرة الجلسة
  for (const [k, v] of [['authorShort', f.author_short], ['authorTitle', f.author_title]]) if (!state.outer.edited.includes(k)) state.outer[k] = v || '';
  saveOuter();
  renderOuter();
  preview.update();
  const note = $('#autoNote');
  if (note && f.book_type) {
    note.hidden = false;
    note.innerHTML = fromWord
      ? `كتاب من ملف Word${state.book.word && state.book.word.type ? ' فُهم أنه <b>' + TYPE_LABEL[state.book.word.type] + '</b>' : ''} — اختير القالب «${esc(TEMPLATES[tpl])}» ليبقى كل ما في الملف (المتن والشرح والحواشي)، ويمكنك تغييره: «المتن فقط» يخرج متنه وحده.`
      : `نوع الكتاب: <b>${TYPE_LABEL[f.book_type]}</b> — اختير القالب «${esc(TEMPLATES[tpl])}» تلقائياً ويمكنك تغييره.` + (r.source === 'ai' ? ' <span class="badge">✨ بمساعدة الذكاء الاصطناعي</span>' : '');
  }
}

/* ------------------------------------------------------------------ ٣. الإعدادات */
const TPL_ICONS = {
  matn: '<u class="m"></u><u class="m w8"></u><u class="m"></u><u class="m w6"></u>',
  matn_sharh: '<u class="m"></u><u></u><u></u><u class="w8"></u><u class="m w8"></u><u></u><u class="w6"></u>',
  matn_hashia: '<u class="m"></u><u class="m w8"></u><u class="m w6"></u><u class="r"></u><u class="f"></u><u class="f"></u>',
  full: '<u class="m w8"></u><u></u><u></u><u class="w6"></u><u class="r"></u><u class="f"></u><u class="f"></u>',
  tafsir: '<u class="q w8"></u><u></u><u></u><u class="w6"></u><u class="q w6"></u><u></u><u class="r"></u><u class="f"></u>',
  // قوالب البحث: الجامعي (عنوان القسم في صفحته ثم النص والحاشية) · المحكَّم (متصل كثيف) · الرسالة (أسطر أرحب)
  'r-uni': '<u class="w6 c"></u><u></u><u></u><u class="w8"></u><u></u><u class="w6"></u><u class="r"></u><u class="f"></u>',
  'r-journal': '<u class="w6 c"></u><u></u><u></u><u class="w6"></u><u class="w6 c"></u><u></u><u class="w8"></u><u class="r"></u><u class="f"></u>',
  'r-thesis': '<u class="w6 c"></u><u class="sp"></u><u class="sp"></u><u class="sp w8"></u><u class="r"></u><u class="f"></u>',
};
const TPL_DESC = {
  matn: 'نص المتن الأساسي وحده بحجم قياسي.',
  matn_sharh: 'يتعرف آلياً على كتب «المتن أعلى الصفحة ثم خط ثم الشرح» ويخرجها كذلك.',
  matn_hashia: 'المتن في الأعلى والحواشي تحت خط فاصل.',
  full: 'تقسيم متكامل: متن + شرح + حواشٍ سفلية.',
  tafsir: 'لكتب التفسير: الآية تُبرز متناً وما تحتها تفسيرها، مع عناوين التفسير (الإيضاح، المعنى…) ومقدمات السور والحواشي.',
};

/* أساليب دور النشر: بطاقات مرسومة (كما هي في لوحة المالك). تُرسم كل بطاقة مرة وتُحفظ صورتها. */
const cardArt = new Map();
function styleArt(st) {
  const key = st.id + '|' + JSON.stringify([st.name, st.settings]);
  if (!cardArt.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 440;
    cardArt.set(key, drawStyleCard(c, st).then(() => c).catch(() => c));
  }
  return cardArt.get(key);
}
/** صورة بطاقة الأسلوب في مكانها. في المنضدة (البرنامج) تُصغَّر على مراحل إلى حجمها المعروض فتبقى حادّة لا مبكسلة */
function paintArt(cv, art) {
  if (!document.documentElement.hasAttribute('data-bench')) return cv.getContext('2d').drawImage(art, 0, 0);
  const css = cv.getBoundingClientRect().width || 112;
  const size = Math.max(64, Math.round(css * (window.devicePixelRatio || 1)));
  let src = art;
  let w = art.width;
  while (w / 2 >= size) {
    const t = document.createElement('canvas');
    t.width = t.height = Math.round(w / 2);
    const g = t.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, t.width, t.height);
    src = t;
    w = t.width;
  }
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, size, size);
}
function renderStyleCards() {
  const cur = state.settings.preset;
  const R = isResearchSettings(state.settings);
  // أساليب النوع وحده (والبحث مثل الكتب: «اصنع أسلوبك» و«ركّب بطاقة أسلوب»)
  const FS = !R ? fileStyle() : null;
  const LIST = [...(FS ? [FS] : []), ...stylesForWork(R)];
  $('#presets').innerHTML =
    LIST.map(
      (st) => `<div class="stwrap ${st.mine ? 'mine' : ''}"><button type="button" class="stcard" data-preset="${esc(st.id)}" aria-pressed="${cur === st.id}" title="${esc(st.desc || st.name)}">
        <span class="stcard-art"><canvas width="440" height="440" aria-hidden="true"></canvas></span>
        <b>${esc(st.name)}</b></button>${
          st.mine
            ? `<span class="stmine"><i>من صنعي</i><button type="button" data-my="edit" data-id="${esc(st.id)}" title="تعديله في استوديو الأساليب">تعديل</button><button type="button" data-my="card" data-id="${esc(st.id)}" title="تنزيل بطاقته (ملف يُحفظ أو يُنقل)">تنزيل</button><button type="button" data-my="del" data-id="${esc(st.id)}" title="حذفه">حذف</button></span>`
            : ''
        }</div>`,
    ).join('') +
    (`<div class="stwrap"><button type="button" class="stcard stmake" id="makeStyle" title="استوديو الأساليب: اصنع أسلوبك بالنقر أو بالمحرر الكامل، بمعاينة حية"><span class="stcard-art"><span>＋</span></span><b>اصنع أسلوبك</b></button></div>` +
    `<div class="stwrap"><label class="stcard stmake stcardin" id="installStyle" tabindex="0" title="ضع بطاقة أسلوب (صورتها أو ملفها): تصير من أساليبك فتعدّلها"><input type="file" id="cardFile" accept=".png,.json,.md,.txt,image/png,application/json,text/plain,text/markdown" hidden><span class="stcard-art"><svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true"><path d="M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4H3a2 2 0 0 1 0-4h2V6a1 1 0 0 1 1-1h4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span><b>ركّب بطاقة أسلوب</b></label></div>`);
  for (const st of LIST) {
    styleArt(st).then((art) => {
      const cv = $(`#presets [data-preset="${CSS.escape(st.id)}"] canvas`);
      if (cv) paintArt(cv, art);
    });
  }
  const sel = LIST.find((st) => st.id === cur);
  $('#presetDesc').textContent = sel ? sel.desc || '' : '';
}

function renderSettingsUI() {
  const s = state.settings;
  for (const b of $$('#paperSeg [data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === state.paper));
  renderOm();
  if (isResearchSettings(s)) {
    const cur = RESEARCH_LAYOUTS[s.rlayout] ? s.rlayout : 'uni';
    $('#templates').innerHTML = Object.entries(RESEARCH_LAYOUTS)
      .map(([k, v]) => `<button type="button" class="tpl opt" data-rl="${k}" aria-pressed="${cur === k}"><span class="mini">${TPL_ICONS['r-' + k]}</span><b>${v.name}</b><small>${v.desc}</small></button>`)
      .join('');
  } else
  $('#templates').innerHTML = Object.entries(TEMPLATES)
    .map(
      ([k, v]) => `<button type="button" class="tpl opt" data-tpl="${k}" aria-pressed="${s.template === k}">
        <span class="mini">${TPL_ICONS[k]}</span><b>${v}</b><small>${TPL_DESC[k]}</small></button>`,
    )
    .join('');
  renderStyleCards();
  $('#matnColors').innerHTML =
    MATN_COLORS.map(
      (c) => `<button type="button" class="sw" data-color="${c.v}" title="${esc(c.label)}" aria-label="${esc(c.label)}" aria-pressed="${s.matnColor.toLowerCase() === c.v.toLowerCase()}"><i style="background:${c.v}"></i></button>`,
    ).join('') +
    `<label class="clr" title="لون مخصص"><input type="color" id="matnCustom" value="${s.matnColor}">مخصص</label>`;
  const fontOpt = ([k, f]) => `<option value="${esc(k)}" ${k === s.fonts.body ? 'selected' : ''}>${esc(f.label)}${f.uploaded && !f.system && !f.pinned ? ' ★' : ''}</option>`;
  // «اللوتس» (إن كان مثبّتاً في الجهاز) مع خطوط ورّاق
  const ownFonts = Object.entries(FONTS).filter(([k, f]) => k !== NAMES_FONT && (!f.system || f.pinned));
  const sysFonts = Object.entries(FONTS).filter(([, f]) => f.system && !f.pinned);
  // وإن لم يكن: يُذكر في مكانه، ويُبيَّن كيف يُضاف (خطٌّ تجاري لا يُوزَّع مع البرنامج)
  const lotusHint = DESK && !Object.values(FONTS).some((f) => f.pinned) ? `<option disabled title="خط «اللوتس» (Lotus Linotype) تجاري من Linotype لا يُوزَّع مع ورّاق. ثبّته على جهازك، أو أضف ملفاته من الإعدادات ← الخطوط، فيظهر هنا">اللوتس — ثبّته على جهازك ليظهر هنا</option>` : '';
  // البرنامج: خطوط الجهاز بعد خطوط ورّاق، العربية منها أولاً
  $('#bookFont').innerHTML = sysFonts.length
    ? `<optgroup label="خطوط ورّاق">${ownFonts.slice(0, 1).map(fontOpt).join('')}${lotusHint}${ownFonts.slice(1).map(fontOpt).join('')}</optgroup>` +
      [['خطوط جهازك العربية', (f) => f.arabic], ['خطوط جهازك الأخرى', (f) => !f.arabic]]
        .map(([g, ok]) => (sysFonts.some(([, f]) => ok(f)) ? `<optgroup label="${g}">${sysFonts.filter(([, f]) => ok(f)).map(fontOpt).join('')}</optgroup>` : ''))
        .join('')
    : ownFonts.map(fontOpt).join('');
  if (!FONTS[s.fonts.body]) $('#bookFont').insertAdjacentHTML('afterbegin', `<option value="${esc(s.fonts.body)}" selected>${esc(s.fonts.body)}</option>`);
  // خط كل نوعٍ من النص: القائمة نفسها، وأولها «خط الكتاب» (أو «خط العناوين»)
  // (وخط الرقعة الذي لاسم المؤلف يصلح للعناوين أيضاً)
  const roleOwn = Object.entries(FONTS).filter(([, f]) => !f.system || f.pinned);
  const fontList = (cur) => {
    const opt = ([k, f]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(f.label)}</option>`;
    const list = sysFonts.length
      ? `<optgroup label="خطوط ورّاق">${roleOwn.map(opt).join('')}</optgroup>` + [['خطوط جهازك العربية', (f) => f.arabic], ['خطوط جهازك الأخرى', (f) => !f.arabic]].map(([g, ok]) => (sysFonts.some(([, f]) => ok(f)) ? `<optgroup label="${g}">${sysFonts.filter(([, f]) => ok(f)).map(opt).join('')}</optgroup>` : '')).join('')
      : roleOwn.map(opt).join('');
    return (cur && !FONTS[cur] ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : '') + list;
  };
  const label = (k) => (FONTS[k] ? FONTS[k].label.replace(/\s*\(.*\)$/, '') : k);
  for (const sel of $$('#roleFonts select[data-rf]')) {
    const k = sel.dataset.rf;
    if (k === 'body') sel.innerHTML = fontList(s.fonts.body);
    else {
      const head = /^h/.test(k);
      sel.innerHTML = `<option value="" ${!s.fonts[k] ? 'selected' : ''}>${head ? 'كخط العناوين' : 'كخط الكتاب'} (${esc(label(head ? s.fonts.heading : s.fonts.body))})</option>` + fontList(s.fonts[k] || '');
      if (!s.fonts[k]) sel.value = '';
    }
  }
  $('#ornament').innerHTML = [...new Set([...ORNAMENTS, s.ornament])].map((o) => `<option ${o === s.ornament ? 'selected' : ''}>${esc(o)}</option>`).join('');
  $('#matnBold').checked = s.matnBold;
  $('#quranInMatn').checked = !!s.quranInMatn;
  $('#matnBrackets').value = s.matnBrackets;
  $('#footnotes').checked = s.footnotes;
  $$('#tocPos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.tocPosition)));
  $('#c1').value = s.headingColors[1];
  $('#c2').value = s.headingColors[2];
  $('#c3').value = s.headingColors[3];
  $('#cq').value = s.quranColor;
  $('#cqm').value = s.quotedColor || s.matnColor;
  $('#cv').value = s.verseColor || s.textColor;
  $('#cm').value = s.matnColor;
  $('#ct').value = s.textColor;
  $('#verseSep').value = s.verseSep || 'none';
  $('#verseLayout').value = s.verseLayout || 'line';
  $('#printReady').checked = !!s.printReady;
  $('#cb').value = s.basmalaColor || s.headingColors[1];
  syncPrintUI();
  syncVerseUI();
  $('#verseSepSymbol').innerHTML = [...new Set([...VERSE_SEPS, s.verseSepSymbol])].map((o) => `<option ${o === s.verseSepSymbol ? 'selected' : ''}>${esc(o)}</option>`).join('');
  $('#matnQawluhu').checked = s.matnQawluhu !== false;
  $('#mergeBroken').checked = s.mergeBroken !== false;
  const inc = s.tocInclude || [1, 2, 3];
  $$('.tocInc').forEach((c) => (c.checked = inc.includes(+c.value)));
  $('#docxLineSpacing').value = String(s.docxLineSpacing || 1);
  $$('#sharhEnd button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === (s.sharhEnd || 'page'))));
  $('#chapterNewPage').checked = s.chapterNewPage;
  $('#runningHead').checked = s.runningHead;
  $('#widowOrphan').checked = s.widowOrphan !== false;
  $('#runts').checked = s.runts !== false;
  // البحث: ما يغيّر النص مطفأ ما لم يُختر، والعناوين كما في قالبه؛ والكتاب: قول النبي ﷺ عريضاً والتقسيم العلمي أصلاً
  const rsch = isResearchSettings(s);
  $('#typoRules').checked = s.typoRules === true;
  $('#spaceCollapse').checked = s.spaceCollapse === true;
  $('#nabawiBold').checked = rsch ? s.nabawiBold === true : s.nabawiBold !== false;
  $('#ayahCite').value = s.ayahCite || '';
  $('#headScheme').value = (rsch ? s.headScheme === 'pro' : s.headScheme !== 'style') ? 'pro' : 'style';
  syncSegs();
  syncSpacing();
  // بطاقة المقاسات: من الأسلوب المختار
  const pg = s.page || {};
  const sz = s.sizes || {};
  const dec = (n) => ar(String(n)).replace('.', '٫');
  syncMutunUI();
  if (MU.parsed) refreshMutunData(false);
  $('#specDl').innerHTML = `<dt>المقاس</dt><dd>${dec(pg.w / 10)}×${dec(pg.h / 10)} سم</dd><dt>الهوامش</dt><dd>${dec(pg.side)} / ${dec(pg.top)} / ${dec(pg.bottom)} مم</dd><dt>المتن</dt><dd>${dec(sz.body)} نقطة بتباعد ${dec(s.lineHeight)}</dd><dt>الحواشي</dt><dd>${dec(sz.note)} نقطة</dd>`;
}

/* ---- المقاطع: قائمة اختيار قصيرة تُعرض مقطعاً من أزرار (والقائمة نفسها تبقى مصدر القيمة) ---- */
// أنماط الشعر: اسم النمط وشكله (كجامع أنماط الشعر في المحرِّر): الأشطر خطوطٌ في مواضعها
const VERSE_PAT = {
  line: [['r', 3], ['l', 3], ['r', 10], ['l', 10], ['r', 17], ['l', 17]],
  stack: [['r', 2], ['l', 7], ['r', 12], ['l', 17]],
  stagger: [['r2', 2], ['l2', 7], ['r2', 12], ['l2', 17]],
  center: [['c', 2], ['c', 7], ['c', 12], ['c', 17]],
  khams: [['r', 1], ['l', 1], ['r', 7], ['l', 7], ['c', 14]],
  tri: [['r', 5], ['l', 5], ['c', 13]],
};
const patIcon = (k) => (VERSE_PAT[k] ? `<i class="pat" aria-hidden="true">${VERSE_PAT[k].map(([c, t]) => `<b class="${c}" style="top:${t}px"></b>`).join('')}</i>` : '');
for (const sel of $$('select[data-seg]')) {
  sel.hidden = true;
  const seg = document.createElement('div');
  const pats = sel.id === 'verseLayout';
  seg.className = 'seg' + (pats ? ' vpats' : '');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
  seg.innerHTML = [...sel.options].map((o) => `<button type="button" data-v="${esc(o.value)}" title="${esc(o.textContent)}">${pats ? patIcon(o.value) : ''}${pats ? `<span>${esc(o.dataset.short || o.textContent)}</span>` : esc(o.dataset.short || o.textContent)}</button>`).join('');
  sel.after(seg);
  sel._seg = seg;
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || sel.disabled || sel.value === b.dataset.v) return;
    sel.value = b.dataset.v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    syncSegs();
  });
}
function syncSegs() {
  for (const sel of $$('select[data-seg]')) {
    sel._seg.classList.toggle('off', sel.disabled);
    for (const b of sel._seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === sel.value));
  }
}
/* تباعد أسطر Word: نقطة تتحرك على خط */
const SPACING = ['1', '1.15', '1.5', '1.85'];
function syncSpacing() {
  const i = Math.max(0, SPACING.indexOf(String($('#docxLineSpacing').value)));
  $('#spacingRange').value = i;
  $('#spacingVal').textContent = i === 3 ? '1.85 (مثل PDF)' : i === 0 ? '1.0' : SPACING[i];
}
$('#spacingRange').addEventListener('input', (e) => {
  $('#docxLineSpacing').value = SPACING[+e.target.value];
  state.settings.docxLineSpacing = +SPACING[+e.target.value];
  syncSpacing();
});

$('#templates').addEventListener('click', (e) => {
  // قالب البحث: بنيته (الصفحات الجديدة، والفهرس، والتباعد)، ويبقى الأسلوب
  const rl = e.target.closest('[data-rl]');
  if (rl) {
    state.settings = applyResearchLayout(state.settings, rl.dataset.rl);
    try {
      localStorage.setItem('warraq.researchLayout', rl.dataset.rl);
    } catch {}
    renderSettingsUI();
    preview.update();
    return;
  }
  const b = e.target.closest('[data-tpl]');
  if (!b) return;
  state.settings.template = b.dataset.tpl;
  state.tplTouched = true;
  $$('#templates .opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
/** اختيار أسلوب: يحدد كل إعدادات التنسيق (كما ضبطها صاحبه)، ويبقى القالب وتباعد Word من اختيار المستخدم */
/* ---- الأساليب في المحرِّر، و«بدون أسلوب» ---- */
/** أساليب نوع الكتاب (كما في بطاقات التنضيد)، بأسمائها وألوانها */
function editorStyles() {
  if (!state.book) return [];
  const R = isResearchSettings(state.settings);
  const list = stylesForWork(R);
  return list.map((st) => {
    const s = st.settings || {};
    return { id: st.id, name: st.name, desc: st.desc || '', mine: !!st.mine, colors: [s.headingColors && s.headingColors[1], s.matnColor, s.textColor].filter((c) => /^#[0-9a-f]{6}$/i.test(c || '')), font: (s.fonts && s.fonts.body) || '' };
  });
}
/**
 * الأسلوب الجاري: «بدون أسلوب» حين يكون الكتاب على أصله — ملف Word على تنسيق ملفه («كما في الملف»)،
 * وغيره على ما كان عليه (أسلوبه السابق بتعديلاته) ما لم يُختر له أسلوبٌ من المحرِّر
 */
function editorStyleNow() {
  if (fileStyle()) return { id: state.asIs || state.settings.preset === 'file' ? 'none' : state.settings.preset, origin: 'كما في الملف', word: true };
  const orig = state.noStyle ? state.noStyle.settings : state.settings;
  return { id: state.noStyle ? state.settings.preset : 'none', origin: (styleById(orig && orig.preset) || {}).name ? `«${styleById(orig.preset).name}»${state.noStyle && state.noStyle.touched ? ' بتعديلاتك' : ''}` : '', word: false };
}
/** يختار أسلوباً للكتاب من المحرِّر ('none': بدون أسلوب). ما خُصّ به النص في المحرِّر يبقى كما هو */
function editorApplyStyle(id) {
  if (!state.book) return false;
  if (state.running) {
    toast('أوقف الإخراج أولاً');
    return false;
  }
  if (id === 'none') {
    if (fileStyle()) {
      // ملف Word: أصله تنسيق الملف نفسه
      state.noStyle = null;
      if (!state.asIs || state.settings.preset !== 'file') setAsIs(true);
    } else if (state.noStyle) {
      // يعود الكتاب إلى ما كان عليه قبل أول أسلوبٍ اختير هنا (الأسلوب بتعديلاته)
      const o = state.noStyle;
      state.noStyle = null;
      state.settings = JSON.parse(JSON.stringify(o.settings));
      state.settingsTouched = !!o.touched;
      renderSettingsUI();
    } else return true;
  } else {
    const st = styleById(id);
    if (!st || st.id !== id) return false;
    // أول أسلوبٍ يُختار هنا: يُحفظ ما كان عليه الكتاب، فيعود إليه «بدون أسلوب»
    if (!state.noStyle && !fileStyle()) state.noStyle = { settings: JSON.parse(JSON.stringify(state.settings)), touched: !!state.settingsTouched };
    if (state.asIs) {
      state.asIs = false;
      if ($('#wordAsIs')) $('#wordAsIs').checked = false;
      leaveFileMutun();
    }
    applyStyle(id);
  }
  preview.update();
  if (DESK) autosave();
  try {
    window.dispatchEvent(new CustomEvent('warraq:look'));
  } catch {}
  return true;
}
function applyStyle(id) {
  const st = styleById(id);
  if (st && (kindOf(st.settings) === 'research' || (kindOf(st.settings) === 'all' && isResearchSettings(state.settings)))) {
    // أسلوب البحث (أو الشامل على بحث): خطّه وألوانه ومقاساته، وقالب البحث المختار يبقى
    state.settings = applyResearchLayout(settingsOf(st, 'research'), state.settings.rlayout || lastResearchLayout());
    try {
      localStorage.setItem('warraq.researchStyle', st.id);
    } catch {}
  } else {
    const keep = pick(state.settings, ['template', 'docxLineSpacing']);
    state.settings = { ...settingsOf(st, workKind === 'mutun' ? 'mutun' : 'books'), ...keep };
  }
  state.settingsTouched = false;
  // ما يحمله الأسلوب من لون الورق وشكل المتون (موضع التعليق وسطوره وعنوانه…)
  if (state.settings.paper === 'white' || state.settings.paper === 'yellow') setPaper(state.settings.paper, true);
  // والهامش الخارجي وخانة الهامش إن حملهما الأسلوب
  {
    const om = state.settings.outerMargin;
    const sb = state.settings.sideNote && state.settings.sideNote.box;
    if ((om && (typeof om.on === 'boolean' || om.odd)) || typeof sb === 'boolean') setOm({ ...(om && typeof om.on === 'boolean' ? { on: om.on } : {}), ...(om && om.odd ? { odd: om.odd } : {}), ...(typeof sb === 'boolean' ? { box: sb } : {}) }, true);
  }
  if (state.settings.mutunLook && mutunOn() && state.mutun) {
    state.mutun = cleanMutun({ ...state.mutun, ...state.settings.mutunLook });
    saveMutunLook();
    try {
      renderMutunPanels();
    } catch {}
  }
  renderSettingsUI();
}
$('#presets').addEventListener('click', (e) => {
  const my = e.target.closest('[data-my]');
  if (my) {
    const st = STYLES.find((x) => x.id === my.dataset.id && x.mine);
    if (!st) return;
    if (my.dataset.my === 'edit') return openStudio('#/edit/' + st.id);
    if (my.dataset.my === 'card') return downloadCard(st);
    if (my.dataset.my === 'del') {
      if (!confirm(`حذف أسلوبك «${st.name}»؟ (نزّل بطاقته أولاً إن أردت الاحتفاظ به)`)) return;
      deleteMyStyle(st.id).then(() => {
        const was = state.settings.preset === st.id;
        STYLES = [...SITE_STYLES, ...loadMyStyles()];
        if (was) applyStyle(STYLES[0].id);
        else renderStyleCards();
        preview.update();
      });
    }
    return;
  }
  if (e.target.closest('#makeStyle')) return openStudio('');
  if (e.target.closest('#installStyle')) return;
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  applyStyle(b.dataset.preset);
});

/* ---- «ركّب بطاقة أسلوب»: البطاقة تصير من أساليبي وتُختار ---- */
async function installStyleCard(file) {
  try {
    const card = await readCardFile(file);
    const { style, notes } = await installMyCard(card);
    STYLES = [...SITE_STYLES, ...loadMyStyles()];
    applyStyle(style.id);
    preview.update();
    toast(`رُكّبت بطاقة «${style.name}» واختيرت: تجدها مع أساليبك، وتعدّلها من «تعديل»` + (notes.length ? ` — وعليها ملاحظات: ${notes.slice(0, 2).join('؛ ')}` : ''), notes.length ? 9000 : undefined);
  } catch (err) {
    toast(err.message || String(err));
  }
}
$('#presets').addEventListener('change', (e) => {
  if (e.target.id !== 'cardFile') return;
  const f = e.target.files[0];
  e.target.value = '';
  if (f) installStyleCard(f);
});
$('#presets').addEventListener('keydown', (e) => {
  if (e.target.id === 'installStyle' && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    $('#cardFile').click();
  }
});
for (const t of ['dragover', 'drop']) {
  $('#presets').addEventListener(t, (e) => {
    const slot = e.target.closest && e.target.closest('#installStyle');
    if (!slot) return;
    e.preventDefault();
    if (t === 'drop' && e.dataTransfer.files[0]) installStyleCard(e.dataTransfer.files[0]);
  });
}

/* ---- استوديو الأساليب (والصانع السريع): يُفتح فوق الصفحة، وما يُحفظ فيه يصير بطاقة هنا ويُختار ---- */
function openStudio(hash) {
  openOverlay('/studio/?embed=1' + (hash || ''), 'استوديو الأساليب');
}
function openMaker(q) {
  openOverlay('/maker/?embed=1&' + new URLSearchParams(q).toString(), 'صانع الأساليب');
}
function openOverlay(url, title) {
  let ov = $('#makerOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'makerOverlay';
    ov.className = 'maker-ov';
    ov.innerHTML = '<iframe></iframe>';
    document.body.appendChild(ov);
  }
  ov.querySelector('iframe').title = title;
  ov.querySelector('iframe').src = url;
  ov.hidden = false;
  document.documentElement.classList.add('maker-open');
}
function closeMaker() {
  const ov = $('#makerOverlay');
  if (!ov) return;
  ov.hidden = true;
  ov.querySelector('iframe').removeAttribute('src');
  document.documentElement.classList.remove('maker-open');
}
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || e.data.warraq !== 'maker') return;
  if (e.data.type === 'close') return closeMaker();
  if (e.data.type === 'saved') {
    takePick();
    // (الحفظ في صفحة أخرى: تُقرأ الأساليب من جديد — أساليبي، وأساليب دار النشر إن حفظ فيها المالك)
    refreshStyles().then(() => {
      if (!e.data.stay) closeMaker();
      if (STYLES.some((x) => x.id === e.data.id)) applyStyle(e.data.id);
      else renderStyleCards();
      preview.update();
      toast('حُفظ أسلوبك واختير: تجده مع أساليب دار النشر');
    });
  }
});
/** قراءة الأساليب من جديد: أساليب دار النشر من الخادم، وأساليبي من الجهاز */
async function refreshStyles() {
  const st = await fetch('/api/styles', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (st && Array.isArray(st.styles) && st.styles.length) SITE_STYLES = st.styles;
  await initMyStyles(true).catch(() => {});
  STYLES = [...SITE_STYLES, ...loadMyStyles()];
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
$('#matnColors').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  state.settings.matnColor = b.dataset.color;
  $$('#matnColors .sw').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('#cm').value = b.dataset.color;
});
$('#matnColors').addEventListener('input', (e) => {
  if (e.target.id !== 'matnCustom') return;
  state.settings.matnColor = e.target.value;
  $$('#matnColors .sw[data-color]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  $('#cm').value = e.target.value;
});
$('#tocPos').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.tocPosition = b.dataset.v;
  $$('#tocPos button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
const bind = (id, fn) => $(id).addEventListener('change', (e) => fn(e.target));
bind('#bookFont', (t) => {
  // خط الكتاب للمتن والعناوين والعنوان الرئيسي؛ ويبقى «عارف رقعة» لاسم المؤلف والمحقق
  state.settings.fonts = { ...state.settings.fonts, body: t.value, heading: t.value, cover: t.value };
  const rb = $('#roleFonts select[data-rf="body"]');
  if (rb) rb.value = t.value;
  // «كخط الكتاب» في القوائم الأخرى باسم الخط الجديد
  for (const o of $$('#roleFonts select[data-rf] option[value=""]')) o.textContent = o.textContent.replace(/\(.*\)$/, `(${t.selectedOptions[0] ? t.selectedOptions[0].textContent.replace(/\s*\(.*\)$/, '') : t.value})`);
});
bind('#matnBold', (t) => (state.settings.matnBold = t.checked));
bind('#quranInMatn', (t) => (state.settings.quranInMatn = t.checked));
bind('#matnQawluhu', (t) => (state.settings.matnQawluhu = t.checked));
bind('#mergeBroken', (t) => (state.settings.mergeBroken = t.checked));
bind('#matnBrackets', (t) => (state.settings.matnBrackets = t.value));
bind('#footnotes', (t) => (state.settings.footnotes = t.checked));
bind('#ornament', (t) => (state.settings.ornament = t.value));
$('#sharhEnd').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.sharhEnd = b.dataset.v;
  $$('#sharhEnd button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
bind('#chapterNewPage', (t) => (state.settings.chapterNewPage = t.checked));
bind('#runningHead', (t) => (state.settings.runningHead = t.checked));
bind('#widowOrphan', (t) => (state.settings.widowOrphan = t.checked));
bind('#runts', (t) => (state.settings.runts = t.checked));
bind('#typoRules', (t) => (state.settings.typoRules = t.checked));
bind('#spaceCollapse', (t) => (state.settings.spaceCollapse = t.checked));
bind('#nabawiBold', (t) => (state.settings.nabawiBold = t.checked));
bind('#ayahCite', (t) => (state.settings.ayahCite = t.value));
bind('#headScheme', (t) => (state.settings.headScheme = t.value));
for (const n of [1, 2, 3]) $('#c' + n).addEventListener('input', (e) => {
  state.settings.headingColors[n] = e.target.value;
  if (n === 1) paintBasmalas(); // لون البسملة يتبع لون الأبواب ما لم يُختر لها لون
});
$('#cq').addEventListener('input', (e) => (state.settings.quranColor = e.target.value));
$('#cqm').addEventListener('input', (e) => (state.settings.quotedColor = e.target.value));
$('#cv').addEventListener('input', (e) => (state.settings.verseColor = e.target.value));
$('#ct').addEventListener('input', (e) => (state.settings.textColor = e.target.value));
// لون المتن: من الجدول، أو من ألوانه الجاهزة (فيتبع أحدهما الآخر)
$('#cm').addEventListener('input', (e) => {
  state.settings.matnColor = e.target.value;
  $$('#matnColors .sw[data-color]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.color.toLowerCase() === e.target.value.toLowerCase())));
  if ($('#matnCustom')) $('#matnCustom').value = e.target.value;
});
$('#roleFonts').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-rf]');
  if (!sel) return;
  const k = sel.dataset.rf;
  const f = { ...state.settings.fonts };
  if (sel.value) f[k] = sel.value;
  else delete f[k];
  state.settings.fonts = f;
  if (k === 'body') $('#bookFont').value = sel.value;
});
bind('#verseSep', (t) => (state.settings.verseSep = t.value));
$('#printPreset').addEventListener('change', (e) => {
  if (e.target.value) state.settings.printPreset = e.target.value;
  else delete state.settings.printPreset;
  syncPrintUI();
  preview.update('cover');
  autosave();
});
bind('#printReady', (t) => {
  state.settings.printReady = t.checked;
  syncPrintUI();
});
$('#cb').addEventListener('input', (e) => {
  state.settings.basmalaColor = e.target.value;
  paintBasmalas();
  showBasmalaPage();
});
/** المعاينة تنتقل إلى صفحة البسملة (في لوحة الغلاف: الصفحات غير البيضاء مما قبل الكتاب) */
function showBasmalaPage() {
  const inked = printSeq().front.filter((t) => t !== 'blank');
  const i = inked.indexOf('basmala');
  if (i >= 0) preview.goto('cover', i);
}
/** ما يضبطه المالك للطباعة: صور البسملة، وتسلسل الصفحات قبل الكتاب (للموقع، ولكل أسلوب له تسلسل خاص) */
let PRINT_INFO = { basmalas: [], front: ['blank', 'half', 'blank', 'cover', 'blank', 'basmala', 'blank'], back: [], styles: {} };
const PRINT_PAGE = { blank: 'صفحة بيضاء', half: 'العنوان المختصر', cover: 'الغلاف الداخلي', basmala: 'البسملة', text: 'صفحة نص', image: 'صفحة صورة' };
const printSeq = () => (state.settings.printPreset && (PRINT_INFO.presets || []).find((p) => p.id === state.settings.printPreset)) || PRINT_INFO.styles[state.settings.styleId] || PRINT_INFO;
/** لون البسملة وشكلها وشرح التسلسل: تظهر مع خيار «جاهزة للطباعة» */
function syncPrintUI() {
  const on = !!state.settings.printReady;
  const seq = printSeq();
  const hasBsm = [...seq.front, ...seq.back].includes('basmala');
  $('#basmalaWrap').classList.toggle('off', !on || !hasBsm);
  $('#basmalaWrap').hidden = !hasBsm;
  $('#cb').disabled = !on || !hasBsm;
  $('#printHint').hidden = !on;
  // تنسيقات الطباعة المحفوظة (من «أساليب دور النشر»): يختار منها، أو تحملها حزمة غلاف
  const pres = PRINT_INFO.presets || [];
  $('#printPresetF').hidden = !on || !pres.length;
  if (pres.length) {
    if (state.settings.printPreset && !pres.some((p) => p.id === state.settings.printPreset)) delete state.settings.printPreset;
    $('#printPreset').innerHTML = '<option value="">كما في الأسلوب</option>' + pres.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    $('#printPreset').value = state.settings.printPreset || '';
  }
  // التسلسل كما رتّبه المالك
  const names = seq.front.map((t, i) => (i && t === 'blank' ? 'بيضاء' : PRINT_PAGE[t] || ''));
  $('#printHint').textContent = 'قبل الكتاب: ' + names.join('، ثم ') + '. كلها بلا أرقام صفحات.' + (seq.back.length ? ` وبعد الكتاب: ${seq.back.map((t) => PRINT_PAGE[t]).join('، ثم ')}.` : '');
  // شكل البسملة: يختار المستخدم بين الصور التي رفعها المالك، أو تُكتب بخط الرقعة
  const list = PRINT_INFO.basmalas;
  const show = on && hasBsm && list.length > 0;
  $('#bsmChoose').hidden = !show;
  if (!show) return;
  const cur = state.settings.basmalaId === 'text' ? 'text' : (list.find((b) => b.id === state.settings.basmalaId) || list[0]).id;
  $('#bsmPick').innerHTML =
    list.map((b) => `<button type="button" class="bsm-opt" role="radio" data-bsm="${esc(b.id)}" aria-checked="${cur === b.id}" title="${esc(b.name)}"><img data-mask="${esc(b.id)}" alt="${esc(b.name)}"><small>${esc(b.name)}</small></button>`).join('') +
    `<button type="button" class="bsm-opt" role="radio" data-bsm="text" aria-checked="${cur === 'text'}"><span class="bsm-txt">بسم الله الرحمن الرحيم</span><small>بخط الرقعة</small></button>`;
  paintBasmalas();
}
/** مصغّرات البسملة بلونها المختار (كل صورة قناع يُلوَّن) */
function paintBasmalas() {
  const color = state.settings.basmalaColor || state.settings.headingColors[1];
  for (const img of $$('#bsmPick img[data-mask]')) {
    const b = PRINT_INFO.basmalas.find((x) => x.id === img.dataset.mask);
    if (!b) continue;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      img.src = c.toDataURL('image/png');
    };
    im.src = b.src;
  }
  for (const t of $$('#bsmPick .bsm-txt')) t.style.color = color;
}
$('#bsmPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bsm]');
  if (!b) return;
  state.settings.basmalaId = b.dataset.bsm;
  $$('#bsmPick [data-bsm]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  showBasmalaPage();
});
bind('#verseLayout', (t) => {
  state.settings.verseLayout = t.value;
  syncVerseUI();
});
/** الفاصل بين الشطرين لا معنى له إلا إذا كانا في سطر واحد */
function syncVerseUI() {
  const line = ['line', 'tri', 'khams'].includes(state.settings.verseLayout || 'line');
  for (const id of ['#verseSepWrap', '#verseSymWrap']) $(id).classList.toggle('off', !line);
  $('#verseSep').disabled = $('#verseSepSymbol').disabled = !line;
  syncSegs();
}
bind('#verseSepSymbol', (t) => (state.settings.verseSepSymbol = t.value));
$$('.tocInc').forEach((c) =>
  c.addEventListener('change', () => {
    state.settings.tocInclude = $$('.tocInc').filter((x) => x.checked).map((x) => +x.value);
  }),
);
bind('#docxLineSpacing', (t) => (state.settings.docxLineSpacing = +t.value));

/* ---- صيغ الإخراج الثلاث: PDF للقراءة والطباعة، و Word للتحرير فيه، و«وَرَق» صيغة ورّاق (الكتاب بنصه وأسلوبه وتعديلاته) ---- */
function outOpts() {
  return { pdf: $('#outPdf').checked, docx: $('#outDocx').checked, waraq: $('#outWaraq').checked, docxFont: $('#docxFont').value, zipFonts: $('#zipFonts').checked };
}
function setOut(o) {
  if (!o) return;
  $('#outPdf').checked = o.pdf !== false;
  $('#outDocx').checked = !!o.docx;
  // ما حُفظ قبل «وَرَق»: في البرنامج تُحفظ معه (صيغته)، وفي الموقع لا
  $('#outWaraq').checked = o.waraq != null ? !!o.waraq : !!DESK;
  if (o.docxFont != null) $('#docxFont').value = o.docxFont;
  $('#zipFonts').checked = !!o.zipFonts;
}
const anyOut = () => $('#outPdf').checked || $('#outDocx').checked || $('#outWaraq').checked;

function currentSettings() {
  return {
    ...JSON.parse(JSON.stringify(state.settings)),
    docxFont: $('#docxFont').value || '',
    innerCover: state.innerCover !== false,
    paper: state.paper === 'yellow' ? 'yellow' : 'white',
    // الهامش الخارجي الواسع ونص الهامش في خانة
    ...omSettings(state.settings),
    // خلفيات الصفحات، وتنسيق كلمات ملف Word نفسه (خطها ومقاسها) في «كما في الملف»
    ...(hasBgs() ? { bgs: { ...state.bgs } } : {}),
    fileFmt: state.settings.preset === 'file',
    // المتون: إعداداتها تُضم هنا (فلا يذهب بها اختيار أسلوبٍ أو قالب)
    ...(mutunOn() && !mutunAsFile() ? { ...JSON.parse(JSON.stringify(state.mutun)), mutun: true } : { mutun: false }),
  };
}

/* ------------------------------------------------------------------ ٤. الجلب والتنضيد */
const volRow = (vol) => document.getElementById('vr-' + vol);

function buildRows(vols) {
  $('#volRows').innerHTML = vols
    .map(
      (v) => `<div class="vrow" id="vr-${esc(v.vol)}">
        <span class="vsp" aria-hidden="true"><i></i></span>
        <div class="vname"><b>${esc(volumeLabel(v.vol))}</b><small>${N(v.pages, 'صفحة')}</small></div>
        <div class="vprog"><div class="vdots" aria-hidden="true">${'<i></i>'.repeat(10)}</div><span class="st vst">في الانتظار</span></div>
        <div class="vdl dl"></div>
      </div>`,
    )
    .join('');
}
/** حالة مجلد: نصها، وكعبه يمتلئ بقدر ما جُلب، ونقطه العشر تُختم عند كل عُشر */
function setRow(vol, text, cls = '', pct) {
  const r = volRow(vol);
  if (!r) return;
  const st = r.querySelector('.st');
  st.className = 'st vst ' + cls;
  st.innerHTML = text;
  if (pct != null) {
    r.querySelector('.vsp i').style.height = pct + '%';
    const lit = Math.floor(pct / 10);
    [...r.querySelectorAll('.vdots i')].forEach((d, j) => d.classList.toggle('on', j < lit));
  }
  // «بلغ»: علامة المقابلة في هوامش المخطوطات، تُختم عند تمام المجلد
  const dl = r.querySelector('.dl');
  const seal = dl.querySelector('.balagh');
  if (cls === 'ok' && !seal) dl.insertAdjacentHTML('afterbegin', '<span class="balagh" title="بلغ: علامة التمام">بلغ</span>');
  else if (cls !== 'ok' && seal) seal.remove();
}
/** لوحة التقدم: تعمل (تُكتب الورقة المسطّرة)، أو واقفة، أو تمّت (حرد المتن) */
function setLive(mode, cap) {
  $('#bar').classList.toggle('idle', mode !== 'run');
  if (cap != null) $('#pctCap').textContent = cap;
  const done = mode === 'done';
  $('#bar').hidden = done;
  $('#doneBox').hidden = !done;
  $('#zipRow').hidden = done;
  if (!done && $('#donePlace')) $('#donePlace').remove();
}
/** العدّاد: الأرقام تدور بالأرقام المشرقية ولا تقفز */
function odo(el, n) {
  const str = arN(n);
  el.setAttribute('aria-label', str);
  if (el.dataset.len !== String(str.length)) {
    el.dataset.len = str.length;
    el.classList.add('odo');
    el.innerHTML = [...str].map((c) => (c === '٬' ? '<em>٬</em>' : `<span>${'٠١٢٣٤٥٦٧٨٩'.replace(/./g, '<i>$&</i>')}</span>`)).join('');
  }
  const cols = el.children;
  [...str].forEach((c, i) => {
    const d = '٠١٢٣٤٥٦٧٨٩'.indexOf(c);
    if (d >= 0) cols[i].style.transform = `translateY(${-d * 1.4}em)`;
  });
}

$('#startBtn').addEventListener('click', start);

async function start() {
  if (!state.book) return;
  if (state.running || state.preparing) return toast('العملية جارية بالفعل');
  const vols = state.book.volumes.filter((v) => state.book.volumes.length <= 1 || state.selected.has(v.vol));
  if (!vols.length) return toast('حدّد مجلداً واحداً على الأقل');
  const s = currentSettings();
  if (!anyOut()) return toast('اختر صيغة إخراج واحدة على الأقل: PDF أو Word أو وَرَق');
  // كتاب ورق: نصه في ملفه، فيُنضَّد مباشرة بلا جلب
  if (state.doc) return startFromDoc(vols, s);
  // تجهيز مسبق خفيف على الخادم (إن تعذّر يكمل العمل كالمعتاد). كتاب المستخدم «كتابي» لا يحتاجه
  state.preparing = true;
  let pre = null;
  if (!state.localPages && !state.book.set) try {
    const r = await fetch('/api/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId: state.book.id, volumes: vols.map((v) => v.vol), template: s.template }),
    });
    pre = await r.json();
  } catch {}
  state.preparing = false;
  if (pre && pre.go) return void location.assign(pre.go);
  if (pre && pre.ok === false) return toast(pre.error || 'تعذّر تجهيز الكتاب');
  clearFiles();
  state.parsed.clear();
  runGen++;
  state.running = true;
  // مراحل الإخراج (لأيقونة البرنامج في شريط المهام): ١ الجلب ٢ التنضيد ٣ الغلاف ٤ الكتابة ٥ التمام
  state.phase = 1;
  state.startedAt = Date.now();
  if (DESK && !SCRIBE) saveLastStyle();
  $('#progressCard').hidden = false;
  $('#rerenderBtn').hidden = true;
  $('#zipBtn').disabled = true;
  $('#cancelBtn').hidden = false;
  $('#progSub').textContent = `${state.cover.title || state.book.name}، ${vols.length <= 1 ? 'مجلد واحد' : N(vols.length, 'مجلد')}`;
  setLive('run', 'يبدأ الجلب');
  updateZipLabel();
  buildRows(vols);
  const total = vols.reduce((a, v) => a + v.pages, 0);
  state.totals = { done: 0, total };
  updateStats(0, '—', total);
  if (!SCRIBE) $('#progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (DESK) deskTell();

  const w = new Worker('/js/fetch.worker.js', { type: 'module' });
  state.worker = w;
  w.onmessage = (ev) => onWorker(ev.data, s);
  w.onerror = (e) => {
    toast('خطأ في العامل الخلفي: ' + (e.message || ''));
    finishRun();
  };
  w.postMessage(workerJob(vols));
}

/** الإخراج من «كتاب ورق»: المجلدات محلَّلة في الملف */
function startFromDoc(vols, s) {
  clearFiles();
  state.parsed.clear();
  runGen++;
  state.running = true;
  state.phase = 2;
  state.startedAt = Date.now();
  if (DESK && !SCRIBE) saveLastStyle();
  $('#progressCard').hidden = false;
  $('#rerenderBtn').hidden = true;
  $('#zipBtn').disabled = true;
  $('#cancelBtn').hidden = false;
  $('#progSub').textContent = `${state.cover.title || state.book.name}، ${vols.length <= 1 ? 'مجلد واحد' : N(vols.length, 'مجلد')} · من ملف الكتاب`;
  updateZipLabel();
  buildRows(vols);
  const total = vols.reduce((a, v) => a + (v.pages || 0), 0);
  state.totals = { done: total, total };
  updateStats(total, '—', total);
  setLive('run', 'يُنضَّد الكتاب');
  if (!SCRIBE) $('#progressCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  for (const v of vols) {
    const parsed = state.doc.vols.get(String(v.vol));
    if (!parsed) continue;
    state.parsed.set(v.vol, parsed);
    enqueueRender(v.vol, s);
  }
  state.renderQueue.then(finishIf(runGen));
  if (DESK) deskTell();
}

/* ---- «كتاب ورق»: يُصنع من الكتاب الذي على المنضدة (مرة واحدة)، ويُحفظ في ملفه، ويُفتح منه ---- */
function bookStyle() {
  return {
    settings: state.settings,
    ...(state.book && state.book.mutun ? { mutun: state.mutun } : {}),
    settingsTouched: !!state.settingsTouched,
    tplTouched: !!state.tplTouched,
    cover: state.cover,
    dirty: [...state.dirty],
    outer: state.outer,
    innerCover: state.innerCover !== false,
    innerTouched: !!state.innerTouched,
    fileCover: state.fileCover || '',
    selected: [...state.selected],
    paper: state.paper,
    om: state.om,
    ...(state.asIs ? { asIs: true } : {}),
    ...(hasBgs() ? { bgs: state.bgs } : {}),
    ...(state.noStyle ? { noStyle: state.noStyle } : {}),
    out: outOpts(),
  };
}
function bookManifest() {
  const p = getProject();
  return {
    id: (state.doc && state.doc.manifest && state.doc.manifest.id) || 'wb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: state.cover.title || state.book.name,
    author: state.cover.author || '',
    volumes: state.book.volumes.map((v) => ({ vol: String(v.vol), label: state.book.volumes.length > 1 ? volumeLabel(v.vol) : '', pages: v.pages || 0 })),
    source: (state.doc && state.doc.manifest && state.doc.manifest.source) || (p ? p.source : null),
    from: deskInfo() ? deskInfo().from : '',
    ...(state.doc && state.doc.manifest && state.doc.manifest.created ? { created: state.doc.manifest.created } : {}),
  };
}
async function bookBytes() {
  return packBook({ manifest: bookManifest(), style: bookStyle(), volumes: Object.fromEntries(state.doc.vols), edits: state.edits, thumb: state.fileCover || '' });
}
/** الكتاب الذي على المنضدة كتابَ ورق: كل مجلداته تُجلب وتُحلَّل مرة واحدة، ثم يُحفظ ملفه */
let converting = null;
function convertBook(onProgress) {
  if (state.doc) return Promise.resolve(state.doc);
  if (!state.book) return Promise.reject(new Error('لا كتاب على المنضدة'));
  if (converting) return converting;
  const vols = state.book.volumes;
  const got = new Map();
  converting = new Promise((resolve, reject) => {
    const w = new Worker('/js/fetch.worker.js', { type: 'module' });
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress' && onProgress) onProgress({ done: m.overallDone, total: m.overallTotal });
      else if (m.type === 'parsing' && onProgress) onProgress({ parsing: true, vol: m.vol });
      else if (m.type === 'volume') got.set(String(m.vol), m.parsed);
      else if (m.type === 'done') {
        w.terminate();
        if (got.size !== vols.length) return reject(new Error('تعذّر تحليل بعض المجلدات'));
        resolve(got);
      } else if (m.type === 'error') {
        w.terminate();
        reject(new Error(m.message || 'تعذّر الجلب'));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || 'خطأ في العامل الخلفي'));
    };
    w.postMessage(workerJob(vols));
  })
    .then(async (got) => {
      state.doc = { vols: got, file: '', manifest: null };
      state.doc.manifest = bookManifest();
      await saveBookFile(true);
      if (DESK) deskChanged();
      return state.doc;
    })
    .finally(() => (converting = null));
  return converting;
}
/** حفظ ملف الكتاب (في مجلد الكتاب، أو حيث فُتح) — بعد لحظة من آخر تغيير */
let bookT = 0;
let bookSaving = Promise.resolve();
function saveBookSoon() {
  if (!state.doc || !DESK || SCRIBE) return;
  clearTimeout(bookT);
  bookT = setTimeout(() => saveBookFile(), 1500);
}
function saveBookFile(now = false) {
  if (!state.doc || !DESK) return Promise.resolve();
  clearTimeout(bookT);
  bookSaving = bookSaving.then(async () => {
    try {
      const bytes = await bookBytes();
      if (state.doc.file && DESK.writeBook) await DESK.writeBook(state.doc.file, bytes);
      else {
        const folder = folderName(DESK.info ? ((await DESK.info().catch(() => null)) || {}).prefs : null);
        const r = await DESK.saveFile(folder, (state.cover.title || state.book.name || 'كتاب') + '.waraq', bytes, { unique: true });
        state.doc.file = r.path;
        autosave();
      }
    } catch (err) {
      if (now) toast('تعذّر حفظ ملف الكتاب: ' + err.message, 5000);
    }
  });
  return bookSaving;
}
/** فتح «كتاب ورق» من ملفه */
async function openBookFile(bytes, path) {
  const b = await unpackBook(bytes);
  const m = b.manifest;
  await siteReady;
  resetBench(true);
  const vols = (m.volumes && m.volumes.length ? m.volumes : Object.keys(b.volumes).map((vol) => ({ vol, label: '' }))).map((v) => {
    const pv = b.volumes[v.vol];
    const pages = v.pages || (pv && pv.stats && pv.stats.pages) || 1;
    return { vol: String(v.vol), pages, start: 1, end: pages };
  });
  const book = {
    id: m.id || 'wb-file',
    name: m.title || 'كتاب',
    cover: { ...(b.style.cover || {}), title: (b.style.cover && b.style.cover.title) || m.title || '', author: (b.style.cover && b.style.cover.author) || m.author || '' },
    volumes: vols,
    src: 'book',
    srcKind: 'local',
    srcName: String(path || '').split(/[\\/]/).pop() || 'وَرَق',
    link: '',
    docFile: true,
    info: {},
    // نوعه من إعداداته: بحث، أو متن للتعليق
    ...(isResearchSettings((b.style && b.style.settings) || {}) ? { research: true } : {}),
    ...((b.style && (b.style.mutun || (b.style.settings && b.style.settings.mutun))) ? { mutun: true } : {}),
  };
  setKind(book.research ? 'research' : book.mutun ? 'mutun' : 'books', true);
  showBook(book, null);
  state.doc = { vols: new Map(Object.entries(b.volumes)), file: path || '', manifest: m };
  // صورة الغلاف قبل الأسلوب: وضع «غلاف الملف» لا يثبت إلا وصورته حاضرة
  state.fileCover = b.style.fileCover || '';
  applyProjectState({ ...b.style, edits: b.edits });
  state.fileCover = b.style.fileCover || '';
  renderOuter();
  if (DESK) deskChanged();
  return true;
}

/** المتون: ترقيم الملف في الأبيات يُحذف عند التحليل (ويُحفظ رقم البيت) */
const muParse = () => (mutunOn() && !mutunAsFile() ? { mutunRead: true, ...(state.mutun && state.mutun.mStrip !== false ? { mutunNums: true } : {}) } : {});
/** طلب الجلب والتحليل للعامل الخلفي (للإخراج، وللمحرِّر) */
function workerJob(vols) {
  return {
    type: 'start',
    bookId: state.book.id,
    src: state.book.src || '',
    // كتاب من ملف Word: صفحاته حاضرة (كتابي) أو من مجلد المالك، وفقراته كاملة فلا تُدمج عبر الصفحات
    pages: (mutunAsFile() && state.book.rawPages) || state.localPages || undefined,
    book: state.book.book,
    totalPages: state.book.totalPages || 0,
    // كتاب من عدة كتب: كل مجلد يُجلب من كتابه (صفحاته الحاضرة، أو من مجلد الكتب) ويُحلَّل بتعليمات ملفه
    volumes: vols.map((v) => {
      const pt = state.book.set ? state.parts[v.part] : null;
      const own = pt ? { bookId: pt.book.id, src: pt.book.src || '', wo: pt.book.wo || '', totalPages: pt.book.totalPages || 0, pages: pt.pages || undefined, book: pt.book.book, parseOpts: { ...(pt.book.parse || {}), matnQawluhu: $('#matnQawluhu').checked, mergeBrokenParagraphs: false, ...muParse() } } : {};
      return { vol: v.vol, start: v.start, end: v.end, ...(v.head ? { head: v.head } : {}), ...(v.tail ? { tail: v.tail } : {}), ...own };
    }),
    concurrency: 6,
    wo: state.book.wo || '',
    // تعليمات قراءة ملف Word (من المستورد): كل متن وشرحه في صفحته، فهرس الملف…
    parseOpts: { ...(state.book.parse || {}), matnQawluhu: $('#matnQawluhu').checked, mergeBrokenParagraphs: $('#mergeBroken').checked && !state.book.local, ...muParse(), ...(mutunAsFile() ? { asFile: true } : {}) },
  };
}

function updateStats(done, cur, total) {
  odo($('#stDone'), done);
  $('#stCur').textContent = cur === '—' ? '—' : arN(cur);
  $('#stLeft').textContent = arN(Math.max(total - done, 0));
  $('#stTotal').textContent = arN(total);
  const pct = total ? Math.floor((done / total) * 100) : 0;
  $('#pctNum').textContent = ar(pct) + '٪';
  $('#ruledNo').textContent = cur === '—' ? '' : arN(cur);
  // الألف تُكتب بقدر ما جُلب، والنقط الخمس تُختم عند كل خُمس
  $('#barFill').style.clipPath = `inset(0 0 ${100 - pct}% 0)`;
  [...$('#mzDots').children].forEach((li, i) => li.classList.toggle('on', pct >= (i + 1) * 20));
  $('#bar').setAttribute('aria-valuenow', pct);
  state.fetchPct = pct;
  if (DESK) deskTell();
}
/** ملفا خط الكتاب لتثبيتهما فتظهر ملفات Word بخطه: خط رفعه المالك (ملفاته هو)، وإلا فخط الكتاب الافتراضي */
function bookFontFiles() {
  const up = SITE_FONTS.find((x) => x.family === state.settings.fonts.body);
  return up
    ? up.files.filter((x) => x.ext === 'ttf' || x.ext === 'otf').map((x) => [x.url, `${up.family}${x.weight === '700' ? '-Bold' : x.weight === '400' ? '-Regular' : ''}.${x.ext}`])
    : ['AdwaAssalaf-Regular.ttf', 'AdwaAssalaf-Bold.ttf'].map((f) => ['/fonts/' + f, f]);
}

/** البرنامج: حفظ ملف المجلد في مجلد الكتاب (ومعه ملفا الخط إن طُلبا مع Word) */
/** اسم مجلد الكتاب: من «اسم مجلد الكتاب» في الإعدادات ← النسّاخ (الأصل: اسم الكتاب وحده) */
function folderName(prefs) {
  const t = state.cover.title || state.book.name || 'كتاب';
  const a = String(state.cover.author || '').split(/[،,(]/)[0].trim();
  const pat = String((prefs && prefs.folderPattern) || '').trim() || '{اسم الكتاب}';
  const s = pat.replace(/\{اسم الكتاب\}/g, t).replace(/\{المؤلف\}/g, a).replace(/^[\s\-–—·]+|[\s\-–—·]+$/g, '').trim();
  return s || t;
}
async function deskSave(files, kind, name) {
  const folder = folderName(DESK.info ? (await DESK.info().catch(() => null) || {}).prefs : null);
  try {
    const r = await DESK.saveFile(folder, name, new Uint8Array(await files[kind].arrayBuffer()));
    (files.saved || (files.saved = {}))[kind] = r.path;
    state.deskDir = r.dir;
    if (kind === 'docx' && $('#zipFonts').checked && !state.deskFonts) {
      state.deskFonts = true;
      for (const [url, fname] of bookFontFiles()) {
        try {
          const f = await fetch(url);
          if (f.ok) await DESK.saveFile(folder, 'خط الكتاب/' + fname, new Uint8Array(await f.arrayBuffer()));
        } catch {}
      }
    }
  } catch (err) {
    toast('تعذّر حفظ الملف في مجلد الكتاب: ' + err.message, 6000);
  }
}

function updateZipLabel() {
  const n = [...state.files.values()].filter((f) => f.pdf || f.docx).length;
  if (DESK) return void ($('#zipBtn').textContent = 'افتح مجلد الكتاب');
  $('#zipBtn').textContent = n ? `تنزيل المجلدات المكتملة (${ar(n)}) ZIP` : 'تنزيل المجلدات المكتملة (ZIP)';
}

function onWorker(m, s) {
  if (m.type === 'progress') {
    // الجلب بمدخلات الملف، والعرض بصفحات الطبعة
    const sum = state.totals ? state.totals.total : 0;
    const scale = (n) => (sum && sum < m.overallTotal ? Math.round((n * sum) / m.overallTotal) : n);
    updateStats(scale(m.overallDone), state.book.set ? m.current : countPrinted(state.book.pageMap, 1, m.current), scale(m.overallTotal));
    const own = (state.book.volumes.find((x) => String(x.vol) === String(m.vol)) || {}).pages;
    const of = own && own < m.total ? own : m.total;
    const pct = Math.round((m.done / m.total) * 100);
    setLive('run', m.overallDone >= m.overallTotal ? 'يُنضَّد ما جُلب' : `يُجلب: ${volumeLabel(m.vol)}`);
    setRow(m.vol, `يُجلب: صفحة ${arN(Math.round((m.done * of) / m.total))} من ${arN(of)}${m.failed ? ` <span class="badge">تعذّر ${ar(m.failed)}</span>` : ''}`, '', pct);
  } else if (m.type === 'parsing') {
    setRow(m.vol, '<span class="spin"><i></i><i></i><i></i></span> تُحلَّل بنيته: متن وشرح وحواشٍ وأبواب', '', 100);
  } else if (m.type === 'volume') {
    state.parsed.set(m.vol, m.parsed);
    enqueueRender(m.vol, s);
  } else if (m.type === 'done') {
    state.worker && state.worker.terminate();
    state.worker = null;
    state.renderQueue.then(finishIf(runGen));
  } else if (m.type === 'error') {
    toast('تعذّر الجلب: ' + m.message);
    finishRun();
  }
}

async function finishRun() {
  // «وَرَق»: بعد تمام المجلدات يُصنع ملف الكتاب كله (والمنضدة ما زالت «تعمل» حتى يتمّ)
  const rows = $$('#volRows .vrow:not(.vbook)');
  const okRows = $$('#volRows .vrow:not(.vbook) .st.ok');
  const all = rows.length > 0 && okRows.length === rows.length;
  if (all && $('#outWaraq').checked && state.running) await waraqOut();
  state.running = false;
  $('#cancelBtn').hidden = true;
  if (state.parsed.size) $('#rerenderBtn').hidden = false;
  // حرد المتن: خاتمة الكتاب حين تتمّ مجلداته كلها
  if (all) {
    const files = [...state.files.values()];
    const pages = files.reduce((a, f) => a + (f.pages || 0), 0);
    $('#doneTitle').textContent = state.cover.title || state.book.name;
    $('#doneCount').textContent = (rows.length <= 1 ? 'مجلد واحد' : N(rows.length, 'مجلد')) + (pages ? `، ${N(pages, 'صفحة')}` : '');
    $('#doneKinds').textContent = [files.some((f) => f.pdf) && 'PDF', files.some((f) => f.docx) && 'Word', state.waraqOut && 'وَرَق'].filter(Boolean).join(' و ');
    setLive('done');
    toast(DESK ? 'تمّ إخراج الكتاب، وملفاته محفوظة في مجلده' : 'تمّ إخراج الكتاب: ملفاته جاهزة للتنزيل', 4200, 'ok');
    if (DESK) deskFinished(true);
  } else {
    setLive('idle', okRows.length ? 'تمّ بعضه' : 'متوقف');
    if (DESK) deskFinished(false);
  }
}

/* رقم الإخراج الجاري: يزيد مع كل بدء ومع كل إيقاف. ما دخل الطابور في إخراجٍ أُوقف لا يعمل
   (كانت المجلدات أو الكتب التي جُلبت ووقفت في الطابور تُنضَّد بعد «إيقاف»، فيبدو أنه أوقف الأول وحده) */
let runGen = 0;
const stale = (g) => g !== runGen;
function enqueueRender(vol, s) {
  const g = runGen;
  state.renderQueue = state.renderQueue.then(() => (stale(g) ? null : renderVolume(vol, s, g))).catch(() => {});
}
/** تمام الإخراج — إلا إن أُوقف (أو بدأ غيره) قبل تمامه */
const finishIf = (g) => () => (stale(g) ? null : finishRun());

/** المرحلة التي بلغها الإخراج (لا ترجع إلى الوراء في الإخراج الواحد) */
function setPhase(n) {
  if (!DESK || n <= (state.phase || 0)) return;
  state.phase = n;
  deskTell();
}
async function renderVolume(vol, s, g = runGen) {
  const raw = state.parsed.get(vol);
  if (!raw || stale(g)) return;
  // ما غيّره المستخدم في «المحرِّر»
  const parsed = applyEdits(raw, vol, state.edits).parsed;
  const nEdits = state.edits.ops.length;
  setPhase(2);
  const doc = composeVolume(parsed, s);
  const multi = state.book.volumes.length > 1;
  const cover = { ...state.cover, volLabel: multi ? volumeLabel(vol) : '' };
  // غلاف الملف نفسه (ملف Word أوله صورة تملأ الصفحة)
  if (state.outer.mode === 'file' && state.fileCover) cover.outerImage = state.fileCover;
  // الوجهان مرسومَين (لغلاف الطباعة المفرود بعد التنضيد)
  const sides = {};
  if (state.outer.mode === 'design' && outerSel('front')) {
    setPhase(3);
    setRow(vol, '<span class="spin"><i></i><i></i><i></i></span> تجهيز الغلاف الخارجي برقم المجلد…');
    try {
      const r = await coverCanvas('front', vol);
      sides.front = r.canvas;
      sides.frontDesign = r.design;
      cover.outerImage = canvasURL(r.canvas);
    } catch (err) {
      toast('تعذّر تجهيز الغلاف الخارجي: ' + err.message);
    }
  }
  // الغلاف الخلفي: آخر صفحة في PDF و Word
  if (outerOn() && outerSel('back')) {
    setPhase(3);
    setRow(vol, '<span class="spin"><i></i><i></i><i></i></span> تجهيز الغلاف الخلفي…');
    try {
      const r = await coverCanvas('back', vol);
      sides.back = r.canvas;
      sides.backDesign = r.design;
      cover.backImage = canvasURL(r.canvas);
    } catch (err) {
      toast('تعذّر تجهيز الغلاف الخلفي: ' + err.message);
    }
  }
  const baseName = (cover.title || state.book.name) + (multi ? ' - ' + volumeLabel(vol) : '');
  const badges =
    (parsed.stats.bookType === 'star' || parsed.stats.bookType === 'label'
      ? `<span class="badge">متن مميَّز ${parsed.stats.bookType === 'star' ? 'بالرمز «*»' : 'يليه «شرح:»'}: ${ar(parsed.stats.matn)} مقطع</span>`
      : '') +
    (parsed.layout === 'split'
      ? state.book.word
        ? `<span class="badge">متن وشرحه: ${ar(parsed.stats.matn)} مقطع متن</span>`
        : `<span class="badge">متن أعلى الصفحة وشرح تحته: ${ar(parsed.stats.sharh)} فقرة شرح</span>`
      : doc.bookHasMatn ? `<span class="badge">شرح مضمَّن: ${ar(parsed.stats.matn)} مقطع متن</span>` : '') +
    (doc.ayat !== undefined ? `<span class="badge">تفسير: ${ar(doc.ayat)} موضع آيات تُفسَّر</span>` : '') +
    (parsed.stats.quran ? `<span class="badge">عُرفت ${ar(parsed.stats.quran)} آية لم تُعلَّم في المصدر</span>` : '') +
    (parsed.stats.frontMatterRemoved ? `<span class="badge">حُذفت بيانات العنوان من أول الكتاب</span>` : '') +
    `<span class="badge">${ar(parsed.stats.notes)} حاشية</span><span class="badge">${ar(parsed.stats.headings)} عنوان</span>` +
    (nEdits ? `<span class="badge">${N(nEdits, 'تعديل')} من المحرِّر</span>` : '');
  // (ومعه ما يحتاجه قارئ المعاينة: الغلاف الخارجي — وهو أول صفحة في الملف — والعنوان والمجلد)
  const files = { urls: [], name: baseName, outer: cover.outerImage || '', cloth: bookCloth(), title: cover.title || state.book.name, author: cover.author || '', vol: multi ? volumeLabel(vol) : '' };
  // الغلاف الخلفي الحقيقي (لا الشكل الافتراضي) في المعاينة والرَّحل والخزانة
  if (sides.back) files.back = smallURL(sides.back, 900, 1300);
  state.files.set(vol, files);
  const row = volRow(vol);
  const dl = row && row.querySelector('.dl');
  if (dl) dl.innerHTML = '';
  if (stale(g)) return;
  try {
    let layout = null;
    setPhase(4);
    if ($('#outPdf').checked) {
      setLive('idle', `يُنضَّد: ${volumeLabel(vol)}`);
      setRow(vol, '<span class="spin"><i></i><i></i><i></i></span> يُنضَّد PDF: تقسيم الصفحات والحواشي' + badges);
      const r = await api('/api/render/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc, settings: s, cover, fileName: baseName, ...(userStyleNow() ? { userStyle: userStyleNow() } : {}) }),
      });
      const h = r.headers.get('x-layout');
      if (h) layout = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(h), (c) => c.charCodeAt(0))));
      files.pdf = await r.blob();
      if (DESK) await deskSave(files, 'pdf', `${baseName}.pdf`);
      addLink(dl, files, 'pdf', 'PDF', `${baseName}.pdf`);
    }
    if (stale(g)) return;
    if ($('#outDocx').checked) {
      setRow(vol, '<span class="spin"><i></i><i></i><i></i></span> يُبنى ملف Word بحواشيه الحقيقية' + badges);
      const r = await api('/api/render/docx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc, settings: s, cover, layout, fileName: baseName }),
      });
      files.docx = await r.blob();
      if (DESK) await deskSave(files, 'docx', `${baseName}.docx`);
      addLink(dl, files, 'docx', 'Word', `${baseName}.docx`);
    }
    // «وَرَق» بجانب PDF و Word: ملف هذا المجلد (وفي الكتاب ذي المجلد الواحد يصنعه الإخراج إن اختير)
    if (!($('#outWaraq').checked && $$('#volRows .vrow:not(.vbook)').length === 1)) addWaraqButton(dl, vol);
    const pages = layout ? `: ${N(layout.pageCount, 'صفحة')}` : '';
    if (layout) {
      files.pages = layout.pageCount;
      state.spinePages = Math.max(state.spinePages || 0, layout.pageCount);
    }
    // غلاف الطباعة المفرود (أمامي + كعب بعرضه الحقيقي + خلفي): يحتاج عدد الصفحات من تنضيد PDF
    let spineNote = '';
    if (stale(g)) return;
    if (outerOn() && state.outer.wrap !== false && (hasFront() || outerSel('back') || outerSel('spine'))) {
      if (!layout) spineNote = ' <span class="badge">غلاف الطباعة يحتاج PDF ليُحسب الكعب</span>';
      else {
        try {
          setRow(vol, '<span class="spin"><i></i><i></i><i></i></span> غلاف الطباعة: الكعب بعرضه من عدد الصفحات' + badges);
          const w = await buildWrap(vol, layout.pageCount, sides);
          files.wrap = w.blob;
          files.spine = w.spine;
          if (w.spineCanvas) files.spineImg = smallURL(w.spineCanvas, 90, 900);
          const wname = `${baseName} - غلاف الطباعة.pdf`;
          if (DESK) await deskSave(files, 'wrap', wname);
          addLink(dl, files, 'wrap', 'غلاف الطباعة', wname);
          spineNote = ` <span class="badge">الكعب ${ar(w.spine.mm.toFixed(1))} مم · غلاف الطباعة ${ar(w.cm.w.toFixed(1))}×${ar(w.cm.h.toFixed(1))} سم</span>`;
        } catch (err) {
          spineNote = ' <span class="badge">تعذّر غلاف الطباعة: ' + esc(err.message) + '</span>';
        }
      }
      renderPaper();
      renderOuterKind();
      pushOuterData();
    }
    // الكعب الحقيقي (بعرضه من عدد الصفحات، أو بتقديرٍ إن لم يُنضَّد PDF): للخزانة والرَّحل والمعاينة
    if (outerOn() && outerSel('spine') && !files.spineImg) {
      try {
        const C = window.CoverCore;
        const sp = C.spineWidth(files.pages || (state.book.volumes.find((x) => String(x.vol) === String(vol)) || {}).pages || 300, state.outer.paper);
        files.spineImg = smallURL((await coverCanvas('spine', vol, sp.cm)).canvas, 90, 900);
      } catch {}
    }
    // كعب الخزانة: الكعب نفسه مرسوماً بنسبة كعبه على الرف (عرضه بعدد الصفحات كما في shelf.js، وارتفاعه نحو ١٦٥)،
    // فيُخطَّط نصّه لذلك العرض ويبقى بمقاسه؛ ولو مُطّ كعب الطباعة النحيف إليه لانضغط نصّه حتى يختفي
    if (outerOn() && outerSel('spine') && !files.shelfImg) {
      try {
        const pg = files.pages || (state.book.volumes.find((x) => String(x.vol) === String(vol)) || {}).pages || 300;
        const design = await loadCoverDesign(outerSel('spine').designId);
        const cm = (design.canvas.heightCm * spineWidth(pg, false)) / 165;
        files.shelfImg = smallURL((await coverCanvas('spine', vol, cm)).canvas, 160, 640);
      } catch {}
    }
    if (DESK) setTimeout(deskTell, 0);
    setRow(vol, `${DESK ? 'تمّ، وحُفظ في مجلد الكتاب' : 'تمّ، وجاهز للتنزيل'}${pages}${parsed.failedPages ? ` <span class="badge">تعذّر جلب ${ar(parsed.failedPages)} صفحة</span>` : ''}` + spineNote + badges, 'ok', 100);
    $('#zipBtn').disabled = false;
    updateZipLabel();
  } catch (err) {
    if (err.name === 'AbortError') return;
    setRow(vol, '<span class="seal no sm">قف</span> تعذّر الإخراج: ' + esc(err.message), 'err');
  }
}

function addLink(dl, files, kind, label, name) {
  if (!dl) return;
  const url = URL.createObjectURL(files[kind]);
  files.urls.push(url);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.className = kind;
  a.textContent = label;
  a.title = 'تنزيل ' + label;
  const saved = DESK && files.saved && files.saved[kind];
  if (saved) {
    a.removeAttribute('download');
    a.href = '#';
    a.title = kind === 'docx' ? 'افتح في Word' : 'افتح ملف PDF';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      DESK.openPath(saved).catch((err) => toast('تعذّر فتح الملف: ' + err.message));
    });
  }
  dl.appendChild(a);
  if (kind === 'pdf') {
    // المعاينة: الكتاب نفسه يُفتح ويُقلَّب (قارئ ورّاق)
    const v = document.createElement('button');
    v.type = 'button';
    v.className = 'view';
    v.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>معاينة';
    v.title = 'اقرأ المجلد كتاباً يُقلَّب';
    v.addEventListener('click', async () => {
      v.disabled = true;
      try {
        const { openBook } = await import('/js/book.js');
        await openBook({
          blob: files.pdf,
          outer: files.outer,
          back: files.back || '',
          spine: files.spineImg || '',
          // لونٌ اختاره المستخدم بعد الإخراج يظهر في المعاينة أيضاً
          cloth: state.outer.bookColor || files.cloth,
          title: files.title,
          author: files.author,
          vol: files.vol,
          fileName: name.replace(/\.pdf$/i, ''),
          // «وَرَق» مع PDF في قائمة التنزيل (حين يُصنع مع الإخراج)
          waraq: () => {
            const w = state.waraqOut;
            if (!w) return null;
            if (DESK && w.path) return { label: w.part ? 'المجلدات المُخرجة بصيغة «وَرَق»' : 'الكتاب بصيغة «وَرَق»', sub: 'افتحه في المحرِّر: يُحرَّر ويُخرج منه', run: () => shellOf() && (w.part ? shellOf().openInEditor(w.path) : shellOf().go('muharrir')) };
            w.url = w.url || URL.createObjectURL(w.blob);
            return { label: 'الكتاب بصيغة «وَرَق»', sub: 'ملفٌ واحد يُحرَّر في ورّاق ويُخرج منه', href: w.url, download: w.name };
          },
          fallbackColor: getComputedStyle(document.documentElement).getPropertyValue('--p-rubric').trim() || '#6B1D2F',
        });
      } catch (err) {
        toast('تعذّر فتح المعاينة: ' + err.message);
      } finally {
        v.disabled = false;
      }
    });
    dl.appendChild(v);
  }
}

$('#rerenderBtn').addEventListener('click', () => {
  if (state.running) return;
  const s = currentSettings();
  clearFiles();
  runGen++;
  state.running = true;
  $('#zipBtn').disabled = true;
  $('#cancelBtn').hidden = false;
  updateZipLabel();
  setLive('idle', 'يُعاد التنضيد بالإعدادات الحالية');
  for (const vol of state.parsed.keys()) setRow(vol, 'في انتظار التنضيد', '');
  for (const vol of state.parsed.keys()) enqueueRender(vol, s);
  state.renderQueue.then(finishIf(runGen));
});

$('#zipBtn').addEventListener('click', async () => {
  if (DESK) {
    if (!state.deskDir) return toast('لا توجد ملفات مكتملة بعد');
    return void DESK.showFolder(state.deskDir).catch((err) => toast('تعذّر فتح المجلد: ' + err.message));
  }
  const entries = [];
  const used = new Set();
  for (const f of state.files.values()) {
    for (const kind of ['pdf', 'docx']) {
      if (!f[kind]) continue;
      let n = `${f.name}.${kind}`.replace(/[\\/:*?"<>|]+/g, ' ');
      while (used.has(n)) n = n.replace(/(\.\w+)$/, ' (٢)$1');
      used.add(n);
      entries.push({ name: n, data: new Uint8Array(await f[kind].arrayBuffer()) });
    }
    if (f.wrap) entries.push({ name: `${f.name} - غلاف الطباعة.pdf`.replace(/[\\/:*?"<>|]+/g, ' '), data: new Uint8Array(await f.wrap.arrayBuffer()) });
  }
  if (state.waraqOut) entries.push({ name: state.waraqOut.name, data: new Uint8Array(await state.waraqOut.blob.arrayBuffer()) });
  if (!entries.length) return toast('لا توجد ملفات مكتملة بعد');
  if ($('#zipFonts').checked && entries.some((e) => e.name.endsWith('.docx'))) {
    for (const [url, name] of bookFontFiles()) {
      try {
        const r = await fetch(url);
        if (r.ok) entries.push({ name: 'خط الكتاب/' + name, data: new Uint8Array(await r.arrayBuffer()) });
      } catch {}
    }
  }
  const zip = makeZip(entries);
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.cover.title || state.book.name || 'ورّاق') + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
});

$('#zipAll').addEventListener('click', () => $('#zipBtn').click());
/**
 * «وَرَق» (‎.waraq‎) صيغةٌ ثالثة مع PDF و Word: الكتاب كله بنصه كما فهمه ورّاق وأسلوبه وتعديلاته، في ملفٍ واحد.
 * ما حُلّل للإخراج يُحفظ نفسه فلا يُجلب مرة أخرى (وإن أُخرج بعض المجلدات فقط جُلب الباقي مرة واحدة).
 * في البرنامج: يُحفظ في مجلد الكتاب (أو في ملفه إن فُتح من ملف)، وفي الموقع: يُنزَّل.
 */
async function waraqOut() {
  // لم يُخرج إلا بعض المجلدات: ملف «وَرَق» بها وحدها (ولا يُجلب الباقي)
  const outVols = [...state.parsed.keys()].map(String);
  if (!state.doc && outVols.length < state.book.volumes.length) return waraqOfVols(outVols);
  const multi = state.book.volumes.length > 1;
  const row = multi ? bookRow() : $('#volRows .vrow');
  const st = row && row.querySelector('.st');
  const was = st ? st.innerHTML : '';
  if (st) st.innerHTML = '<span class="spin"><i></i><i></i><i></i></span> يُصنع ملف «وَرَق»: الكتاب كله بنصه وأسلوبه';
  try {
    if (!state.doc && state.parsed.size === state.book.volumes.length) {
      state.doc = { vols: new Map([...state.parsed].map(([k, v]) => [String(k), v])), file: '', manifest: null };
      state.doc.manifest = bookManifest();
    }
    if (!state.doc) await convertBook();
    const bytes = await bookBytes();
    const name = String(state.cover.title || state.book.name || 'كتاب').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.waraq';
    const w = { blob: new Blob([bytes], { type: 'application/x-warraq-book' }), name, path: '' };
    if (DESK) {
      await saveBookFile(true);
      w.path = state.doc.file || '';
      if (!state.deskDir && w.path) state.deskDir = w.path.replace(/[\\/][^\\/]*$/, '');
      deskChanged();
    }
    state.waraqOut = w;
    if (st) {
      st.innerHTML = multi ? 'تمّ: ملفٌ واحد بمجلداته كلها' : was;
      if (multi) st.className = 'st vst ok';
    }
    addWaraqLink(row && row.querySelector('.dl'), w);
  } catch (err) {
    if (st) st.innerHTML = was + ' <span class="badge">تعذّر صنع ملف «وَرَق»: ' + esc(err.message) + '</span>';
  }
}
/** صفّ «الكتاب كله» تحت المجلدات (لملف «وَرَق» في الكتاب ذي المجلدات)؛ أو «المجلدات المختارة» إن لم يُخرج كله */
function bookRow(n = 0) {
  let r = $('#vr-book');
  if (r) return r;
  $('#volRows').insertAdjacentHTML(
    'beforeend',
    `<div class="vrow vbook" id="vr-book"><span class="vsp" aria-hidden="true"><i style="height:100%"></i></span><div class="vname"><b>${n ? 'المجلدات المختارة' : 'الكتاب كله'}</b><small>${N(n || state.book.volumes.length, 'مجلد')} في ملفٍ واحد</small></div><div class="vprog"><span class="st vst"></span></div><div class="vdl dl"></div></div>`,
  );
  return $('#vr-book');
}
/**
 * ملف «وَرَق» لبعض المجلدات (ما أُخرج منها، أو مجلدٌ واحد): من تحليلها الحاضر، بأسلوب الكتاب وتعديلاته.
 * ← { bytes, name }
 */
async function volsBook(keys) {
  const all = state.book.volumes;
  const picked = all.filter((v) => keys.includes(String(v.vol)));
  const m = bookManifest();
  m.id = 'wb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  m.volumes = picked.map((v) => ({ vol: String(v.vol), label: all.length > 1 ? volumeLabel(v.vol) : '', pages: v.pages || 0 }));
  if (picked.length < all.length) m.partOf = { volumes: all.length };
  const volumes = Object.fromEntries(picked.map((v) => [String(v.vol), state.parsed.get(String(v.vol)) || state.parsed.get(v.vol)]).filter(([, x]) => x));
  const bytes = await packBook({ manifest: m, style: { ...bookStyle(), selected: Object.keys(volumes) }, volumes, edits: state.edits, thumb: state.fileCover || '' });
  const t = String(state.cover.title || state.book.name || 'كتاب').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const tail = picked.length === all.length ? '' : picked.length === 1 ? ' - ' + volumeLabel(picked[0].vol) : ' - ' + N(picked.length, 'مجلد');
  return { bytes, name: t + tail + '.waraq' };
}
/** يُحفظ (في البرنامج: في مجلد الكتاب) أو يُنزَّل ← { blob, name, path } */
async function keepWaraq(b) {
  const w = { blob: new Blob([b.bytes], { type: 'application/x-warraq-book' }), name: b.name, path: '' };
  if (DESK) {
    const folder = folderName(DESK.info ? ((await DESK.info().catch(() => null)) || {}).prefs : null);
    const r = await DESK.saveFile(folder, b.name, b.bytes, { unique: true });
    w.path = r.path;
    if (!state.deskDir && w.path) state.deskDir = w.path.replace(/[\\/][^\\/]*$/, '');
  }
  return w;
}
/** «وَرَق» لما أُخرج من المجلدات وحده (لا يُجلب الباقي) */
async function waraqOfVols(keys) {
  const row = keys.length === 1 ? volRow(keys[0]) : bookRow(keys.length);
  const st = row && row.querySelector('.st');
  const was = st ? st.innerHTML : '';
  if (st) st.innerHTML = '<span class="spin"><i></i><i></i><i></i></span> يُصنع ملف «وَرَق»';
  try {
    const w = await keepWaraq(await volsBook(keys));
    w.part = true;
    state.waraqOut = w;
    if (st) {
      st.innerHTML = keys.length === 1 ? was : 'تمّ: ملفٌ واحد بالمجلدات المختارة';
      if (keys.length > 1) st.className = 'st vst ok';
    }
    const dl = row && row.querySelector('.dl');
    if (dl) dl.querySelector('button.waraq')?.remove();
    addWaraqLink(dl, w);
  } catch (err) {
    if (st) st.innerHTML = was + ' <span class="badge">تعذّر صنع ملف «وَرَق»: ' + esc(err.message) + '</span>';
  }
}
/** زرّ «وَرَق» في صفّ المجلد: ملف المجلد وحده، يُصنع حين يُطلب */
function addWaraqButton(dl, vol) {
  if (!dl || dl.querySelector('.waraq')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'waraq';
  b.innerHTML = '<i class="wq-fi" aria-hidden="true"></i>وَرَق';
  b.title = DESK ? 'احفظ هذا المجلد بصيغة «وَرَق» في مجلد الكتاب (يُحرَّر في المحرِّر ويُخرج منه)' : 'نزّل هذا المجلد بصيغة «وَرَق» (‎.waraq‎): يُفتح في برنامج ورّاق فيُحرَّر ويُخرج منه';
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      const w = await keepWaraq(await volsBook([String(vol)]));
      b.remove();
      addWaraqLink(dl, w);
      if (DESK) toast(`حُفظ «${w.name}» في مجلد الكتاب`, 4200);
      else dl.querySelector('a.waraq:last-child')?.click();
    } catch (err) {
      toast('تعذّر صنع ملف «وَرَق»: ' + err.message);
      b.disabled = false;
    }
  });
  dl.appendChild(b);
}
/** رابط «وَرَق» بجانب PDF و Word: في الموقع يُنزَّل، وفي البرنامج يُفتح الكتاب في المحرِّر */
function addWaraqLink(dl, w) {
  if (!dl || !w) return;
  const a = document.createElement('a');
  a.className = 'waraq';
  a.innerHTML = '<i class="wq-fi" aria-hidden="true"></i>وَرَق';
  if (DESK && w.path) {
    a.href = '#';
    a.title = 'افتحه في المحرِّر (وهو محفوظ في ملفه: ' + w.path.split(/[\\/]/).pop() + ')';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const sh = shellOf();
      // ملف الكتاب الذي على المنضدة: المحرِّر مباشرة؛ وملف بعض المجلدات: يُفتح هو
      if (sh && w.part && sh.openInEditor) sh.openInEditor(w.path);
      else if (sh) sh.go('muharrir');
      else DESK.showFolder(w.path).catch(() => {});
    });
  } else {
    w.url = w.url || URL.createObjectURL(w.blob);
    a.href = w.url;
    a.download = w.name;
    a.title = 'تنزيل الكتاب بصيغة «وَرَق» (‎.waraq‎): يُفتح في برنامج ورّاق فيُحرَّر ويُخرج منه بلا اتصال';
  }
  dl.appendChild(a);
}
$('#cancelBtn').addEventListener('click', () => {
  stopAll();
  setLive('idle', 'متوقف');
  if (state.parsed.size) $('#rerenderBtn').hidden = false;
  toast('أُوقفت العملية');
  // ما بعد الإيقاف لا يبلغ finishRun: يُبلَّغ البرنامج (شريط المهام، ومن ينتظر تمام الإخراج) هنا
  if (DESK) deskFinished(false);
});

function stopAll() {
  runGen++;
  if (state.worker) {
    state.worker.postMessage({ type: 'cancel' });
    state.worker.terminate();
    state.worker = null;
  }
  for (const ac of state.aborts) ac.abort();
  state.aborts.clear();
  state.renderQueue = Promise.resolve();
  state.running = false;
  $('#cancelBtn').hidden = true;
}

function clearFiles() {
  for (const f of state.files.values()) for (const u of f.urls) URL.revokeObjectURL(u);
  state.files.clear();
  if (state.waraqOut && state.waraqOut.url) URL.revokeObjectURL(state.waraqOut.url);
  state.waraqOut = null;
}

/* ------------------------------------------------------------------ إعادة الضبط: تعرية الذاكرة تماماً */
$('#resetBtn').addEventListener('click', () => resetBench());
function resetBench(quiet = false) {
  stopAll();
  clearFiles();
  state.parsed.clear();
  try {
    sessionStorage.removeItem(OUTER_KEY);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('covers.') || k === 'warraq.cover') sessionStorage.removeItem(k);
  } catch {}
  state = freshState();
  if (researchMode) state.settings = researchDefaults();
  researchUI(researchMode);
  $('#outerFrame').removeAttribute('src');
  delete $('#outerFrame').dataset.k;
  outerFrameReady = false;
  $('#autoNote').hidden = true;
  $('#q').value = '';
  $('#results').innerHTML = '';
  $('#searchStatus').hidden = true;
  for (const id of ['#bookCard', '#settingsCard', '#progressCard']) $(id).hidden = true;
  $('#volRows').innerHTML = '';
  updateStats(0, '—', 0);
  $('#results').className = 'res';
  $('#myStatus').hidden = true;
  $('#myStatus').className = 'status';
  wordMode = false;
  addMode = false;
  renderSources();
  renderParts();
  renderSettingsUI();
  preview.update();
  window.scrollTo({ top: 0, behavior: quiet ? 'auto' : 'smooth' });
  if (DESK) deskChanged();
  if (!quiet) toast(DESK ? 'المنضدة فارغة لكتاب جديد' : 'تمت تعرية الذاكرة وإعادة الضبط');
}

/* ------------------------------------------------------------------ الغلاف الخارجي: استوديو الأغلفة */
// يختار المستخدم قبل «الإخراج» هل يريد غلافاً خارجياً. إن أراد ظهر الاستوديو مضمَّناً (iframe)،
// ويُرسَل إليه اسم الكتاب والمؤلف تلقائياً. وعند الإخراج يُرسم الغلاف لكل مجلد برقمه الحقيقي
// ويُضاف أول صفحة في PDF و Word.
let outerFrameReady = false;
const designCache = new Map();
/** أجزاء الغلاف: الأمامي (state.outer.design) والخلفي والكعب */
const OUTER_KEYS = { front: 'design', back: 'back', spine: 'spine' };
const OUTER_NAMES = { front: 'الغلاف الأمامي', back: 'الغلاف الخلفي', spine: 'الكعب' };
const outerSel = (k) => {
  const s = state.outer[OUTER_KEYS[k]];
  return s && s.designId ? s : null;
};
const outerOn = () => state.outer.mode === 'design' || (state.outer.mode === 'file' && !!state.fileCover);
const hasFront = () => (state.outer.mode === 'file' && !!state.fileCover) || (state.outer.mode === 'design' && !!outerSel('front'));

/** رقم المجلد الحقيقي: من اسمه إن كان رقماً، وإلا ترتيبه بين مجلدات الكتاب */
function volNumber(vol) {
  const n = parseInt(toLatinDigits(String(vol)), 10);
  if (Number.isFinite(n) && n > 0) return n;
  const i = state.book ? state.book.volumes.findIndex((v) => v.vol === vol) : -1;
  return i >= 0 ? i + 1 : 1;
}

/** عرض الكعب التقديري للمعاينة: من أكبر مجلد نُضِّد (عدد صفحاته) ونوع الورق */
function spineEstimate() {
  const C = window.CoverCore;
  return C && state.spinePages ? C.spineWidth(state.spinePages, state.outer.paper) : null;
}

/** بيانات الكتاب للغلاف: العنوان المختصر واسم المؤلف من الذكاء الاصطناعي (أو من الغلاف الداخلي) */
function outerBookData() {
  if (!state.book) return {};
  // اسم الشهرة من الذكاء الاصطناعي (مع اللقب إن وُجد)، وإلا اسم المؤلف من الغلاف الداخلي
  const author = state.outer.authorShort ? [state.outer.authorTitle, state.outer.authorShort].filter(Boolean).join(' ').trim() : state.cover.author || '';
  const first = state.book.volumes.find((v) => state.selected.has(v.vol)) || state.book.volumes[0];
  const sp = spineEstimate();
  return {
    title: state.cover.title || state.book.name || '',
    subtitle: state.cover.subtitle || '',
    author,
    publisher: state.cover.publisher || undefined,
    volume: first ? volNumber(first.vol) : 1,
    spineCm: sp ? sp.cm : null,
  };
}

let pushT = 0;
function pushOuterData() {
  clearTimeout(pushT);
  pushT = setTimeout(() => {
    const f = $('#outerFrame');
    if (!outerFrameReady || !f.contentWindow) return;
    const data = outerBookData();
    if (data.publisher === undefined) delete data.publisher;
    f.contentWindow.postMessage({ type: 'warraq-book', data }, location.origin);
  }, 150);
}
/** اختيارات المستخدم المحفوظة في المشروع تعود إلى الاستوديو (لكل تصميم حالته) */
function pushOuterStates() {
  const f = $('#outerFrame');
  if (!f.contentWindow) return;
  const states = {};
  for (const k of Object.keys(OUTER_KEYS)) {
    const s = outerSel(k);
    if (s && s.state) states[s.designId] = s.state;
  }
  if (Object.keys(states).length) f.contentWindow.postMessage({ type: 'warraq-cover-states', states }, location.origin);
}

function renderOuterStatus() {
  const st = $('#outerStatus');
  if (!outerOn()) return void (st.textContent = 'لن يُضاف غلاف خارجي');
  const parts = [];
  if (state.outer.mode === 'file') parts.push('الأمامي: غلاف الملف <img class="outer-thumb" alt="" src="' + state.fileCover + '">');
  for (const k of Object.keys(OUTER_KEYS)) {
    if (k === 'front' && state.outer.mode === 'file') continue;
    const s = outerSel(k);
    if (s) parts.push(`${k === 'front' ? 'الأمامي' : k === 'back' ? 'الخلفي' : 'الكعب'}: <b>${esc(s.designName || '')}</b>${s.state && s.state.custom ? ' (بصورتك)' : ''}`);
  }
  st.innerHTML = parts.length ? parts.join(' · ') : 'اختر تصميماً من المعرض أدناه';
}

const outerFrameSrc = (k) => {
  const s = outerSel(k);
  return '/covers/?embed=1&kind=' + k + (s ? '#d=' + encodeURIComponent(s.designId) : '');
};
/** يحمّل الإطار على تبويب الجزء المختار (force: يُعاد ولو كان عليه) */
function loadOuterFrame(force) {
  const f = $('#outerFrame');
  const k = state.outer.tab || 'front';
  if (!force && f.dataset.k === k && f.getAttribute('src')) return;
  f.dataset.k = k;
  outerFrameReady = false;
  f.src = outerFrameSrc(k);
}

function renderOuterKind() {
  const k = state.outer.tab || 'front';
  const box = $('#outerKind');
  if (k === 'front' && state.outer.mode === 'file') return void (box.innerHTML = '');
  const s = outerSel(k);
  let html = s ? `${OUTER_NAMES[k]}: <b>${esc(s.designName || '')}</b> <button type="button" data-oclear="${k}">إزالة ${k === 'spine' ? 'الكعب' : 'هذا الغلاف'}</button>` : `${OUTER_NAMES[k]}: ${k === 'front' ? 'اختر تصميماً من المعرض أدناه' : 'اختياري — اختر تصميماً من المعرض أدناه، أو اتركه'}`;
  if (k === 'back' && s) html += ' <span>يكون آخر صفحة في كل مجلد.</span>';
  if (k === 'spine') {
    const sp = spineEstimate();
    html += sp ? ` <span>المعاينة بعرض <b>${ar(sp.mm.toFixed(1))} مم</b> (أكبر مجلد نُضِّد)، وكل مجلد بعرضه عند الإخراج.</span>` : ' <span>المعاينة بالعرض الطبيعي للتصميم حتى يُنضَّد الكتاب.</span>';
  }
  box.innerHTML = html;
}

/* ورق المتن: قائمته مرة واحدة */
function buildPaperUI() {
  const C = window.CoverCore;
  if (!C || $('#outerPaper').options.length) return;
  const groups = [...new Set(C.PAPERS.map((p) => p.group))];
  $('#outerPaper').innerHTML =
    groups.map((g) => `<optgroup label="${esc(g)}">${C.PAPERS.filter((p) => p.group === g).map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</optgroup>`).join('') +
    '<optgroup label="ورق آخر"><option value="gsm">أحسبها من الغراماج…</option><option value="mic">سماكة من المطبعة (ميكرون)…</option></optgroup>';
  $('#paperBulk').innerHTML = Object.entries(C.BULKS).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
}
function renderPaper() {
  const C = window.CoverCore;
  if (!C) return;
  buildPaperUI();
  const p = (state.outer.paper = C.cleanPaper(state.outer.paper));
  $('#outerPaper').value = p.id;
  $('#paperGsm').value = p.gsm;
  $('#paperBulk').value = p.bulk;
  $('#paperMic').value = p.mic;
  $('#paperGsmF').hidden = $('#paperBulkF').hidden = p.id !== 'gsm';
  $('#paperMicF').hidden = p.id !== 'mic';
  $('#outerWrap').checked = state.outer.wrap !== false;
  // عرض الكعب لكل مجلد نُضِّد
  const done = [...state.files.entries()].filter(([, f]) => f.pages);
  const t = C.caliper(p);
  let html = `سماكة الورقة <b>${ar(t.toFixed(3))} مم</b>. عرض الكعب = (الصفحات ÷ ٢) × السماكة + ${ar(C.COVER_ALLOW)} مم سماح الغلاف، ويُحسب لكل مجلد تلقائياً بعد تنضيده (بلا الغلافين).`;
  if (done.length) {
    html += '<br>' + done.map(([vol, f]) => {
      const s = C.spineWidth(f.pages, p);
      return `${state.book && state.book.volumes.length > 1 ? esc(volumeLabel(vol)) + ': ' : 'الكعب: '}<b>${ar(s.mm.toFixed(1))} مم</b> (${N(f.pages, 'صفحة')})${s.mm < 4 ? ' <span class="warn">كعب رفيع: لا يُكتب عليه عادة</span>' : ''}`;
    }).join(' · ');
  }
  $('#spineCalc').innerHTML = html;
}

function renderOuter() {
  $('#outerShort').value = state.outer.authorShort || '';
  $('#outerTitle').value = state.outer.authorTitle || '';
  // «غلاف الملف» يظهر لملف Word أوله صورة غلاف
  $('#outerFileBtn').hidden = !state.fileCover;
  if (state.outer.mode === 'file' && !state.fileCover) state.outer.mode = 'none';
  $$('#outerMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.outer.mode)));
  const on = outerOn();
  $('#outerBody').hidden = !on;
  const k = state.outer.tab || 'front';
  $$('#outerTabs button').forEach((b) => {
    const kk = b.dataset.k;
    const s = outerSel(kk);
    const file = kk === 'front' && state.outer.mode === 'file';
    b.setAttribute('aria-pressed', String(kk === k));
    b.classList.toggle('set', !!s || file);
    b.querySelector('small').textContent = file ? 'غلاف الملف' : s ? s.designName || '' : kk === 'front' ? '' : 'بلا';
  });
  const fileFront = k === 'front' && state.outer.mode === 'file';
  $('#outerFileNote').hidden = !fileFront;
  $('#outerFrame').hidden = fileFront;
  if (on && !fileFront) loadOuterFrame();
  renderOuterKind();
  renderPaper();
  renderOuterStatus();
  renderOuterBook();
  pushOuterData();
}

$('#outerMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  state.outer.mode = b.dataset.v;
  saveOuter();
  renderOuter();
});
$('#outerTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  state.outer.tab = b.dataset.k;
  saveOuter();
  renderOuter();
});
$('#outerKind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-oclear]');
  if (!b) return;
  state.outer[OUTER_KEYS[b.dataset.oclear]] = null;
  state.outer.bundle = '';
  paintBundles();
  saveOuter();
  loadOuterFrame(true);
  renderOuter();
  autosave();
});
$('#outerPaperBox').addEventListener('change', (e) => {
  const C = window.CoverCore;
  if (e.target.id === 'outerWrap') state.outer.wrap = e.target.checked;
  else if (C) state.outer.paper = C.cleanPaper({ id: $('#outerPaper').value, gsm: +$('#paperGsm').value, bulk: $('#paperBulk').value, mic: +$('#paperMic').value });
  saveOuter();
  renderPaper();
  renderOuterKind();
  pushOuterData();
  autosave();
});

/* ---- لون الكتاب المجسَّم: من الغلاف (كما ضبطه المجلِّد)، أو لونٌ يختاره المستخدم ---- */
// (var ودالة: قد يُرسم الغلاف قبل أن يصل التحميل إلى هنا)
var BOOK_CHIPS = [['#6b1d2f', 'عنّابي'], ['#1f3a5f', 'كحلي'], ['#0f4c3a', 'زمرّدي'], ['#5b3b22', 'بنّي'], ['#1b1b1d', 'أسود'], ['#7a5a16', 'ذهبي'], ['#e9e1cf', 'عاجي']];
function isHex(c) { return /^#[0-9a-f]{6}$/i.test(c || ''); }
/** لون جلد الكتاب: اختيار المستخدم، وإلا لون الغلاف الأمامي المصمَّم (وإلا يقرؤه القارئ من صورة الغلاف) */
function bookCloth() {
  if (isHex(state.outer.bookColor)) return state.outer.bookColor;
  return state.outer.mode === 'design' ? state.outerCloth || state.outerColor || '' : '';
}
/** لون الكتاب من الغلاف الأمامي المختار الآن (بلا رسمه): يتبع ما اختاره المستخدم من ألوان الغلاف */
async function coverClothNow() {
  const C = window.CoverCore;
  const sel = outerSel('front');
  if (!C || !C.bookColor || state.outer.mode !== 'design' || !sel) return '';
  const design = await loadCoverDesign(sel.designId);
  const st = sel.state || {};
  const ed = C.effective(design, st);
  return C.bookColor(ed, C.resolveState(ed, st)) || '';
}
var obT = 0, obSeq = 0;
function renderOuterBook() {
  const pick = isHex(state.outer.bookColor);
  $$('#outerBookMode button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v === 'pick') === pick)));
  $('#outerBookPick').hidden = !pick;
  if (pick) $('#outerBookColor').value = state.outer.bookColor;
  // ألوانٌ جاهزة، ومعها ألوان الغلاف الأمامي المختار
  const pal = [];
  const sel = outerSel('front');
  const d = sel && designCache.get(sel.designId);
  if (d && Array.isArray(d.palette)) for (const c of d.palette) if (isHex(c) && !pal.some(([x]) => x === c.toLowerCase())) pal.push([c.toLowerCase(), 'من ألوان الغلاف']);
  const chips = pal.concat(BOOK_CHIPS.filter(([c]) => !pal.some(([x]) => x === c))).slice(0, 10);
  $('#outerBookChips').innerHTML = chips.map(([c, t]) => `<button type="button" class="ob-chip" data-c="${c}" style="--c:${c}" title="${esc(t)}" aria-label="${esc(t)}" aria-pressed="${state.outer.bookColor === c}"></button>`).join('');
  const sw = $('#outerBookSw');
  const show = (c, hint) => {
    sw.classList.toggle('none', !c);
    if (c) sw.style.setProperty('--bk', c);
    $('#outerBookHint').textContent = hint;
  };
  if (pick) return show(state.outer.bookColor, 'هذا لون الكتاب في المعاينة والرَّحل والخزانة، أيّاً كان الغلاف.');
  const seq = ++obSeq;
  clearTimeout(obT);
  if (state.outer.mode !== 'design' || !outerSel('front')) {
    return show('', state.outer.mode === 'file' ? 'يُقرأ لونه من صورة غلاف الملف.' : 'بلا غلافٍ مصمَّم: يُقرأ من صورة الغلاف إن كانت، وإلا العنّابي.');
  }
  obT = setTimeout(() => {
    coverClothNow().then((c) => {
      if (seq !== obSeq) return;
      show(c, c ? 'يتبع لون الغلاف الأمامي كما ضبطه المجلِّد: إذا غيّرت لون خلفيته أو الصورة المربوطة به تغيّر معه.' : 'يُقرأ لونه من صورة الغلاف عند الإخراج.');
    }, () => seq === obSeq && show('', 'يُقرأ لونه من صورة الغلاف عند الإخراج.'));
  }, 120);
}
function setBookColor(c) {
  state.outer.bookColor = isHex(c) ? c.toLowerCase() : '';
  saveOuter();
  renderOuterBook();
  autosave();
}
$('#outerBookMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  if (b.dataset.v === 'cover') return setBookColor('');
  if (isHex(state.outer.bookColor)) return;
  // أول اختيار: يبدأ من لون الكتاب الآن
  coverClothNow().catch(() => '').then((c) => setBookColor(c || bookCloth() || '#6b1d2f'));
});
$('#outerBookChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]');
  if (b) setBookColor(b.dataset.c);
});
$('#outerBookColor').addEventListener('input', (e) => {
  state.outer.bookColor = e.target.value.toLowerCase();
  $('#outerBookSw').style.setProperty('--bk', state.outer.bookColor);
  $$('#outerBookChips [data-c]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === state.outer.bookColor)));
});
$('#outerBookColor').addEventListener('change', (e) => setBookColor(e.target.value));
renderOuterBook();

/* حِزم الربط من المجلِّد: غلاف أمامي وخلفي وكعب وأسلوب وتنسيق طباعة باسم واحد */
let BUNDLES = [];
async function loadBundles() {
  try {
    const j = await fetch('/api/covers/bundles', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    BUNDLES = (j && j.bundles) || [];
  } catch {
    BUNDLES = [];
  }
  $('#outerBundleRow').hidden = !BUNDLES.length;
  $('#outerBundle').innerHTML = '<option value="">— اختر حزمة: غلاف أمامي وخلفي وكعب وأسلوب وتنسيق طباعة —</option>' +
    BUNDLES.map((b) => `<option value="${esc(b.id)}" ${state.outer.bundle === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  paintBundles();
}
/** الحِزم بصورها أول التنضيد: صورة الحزمة (وإلا صورة غلافها الأمامي) واسمها وما فيها */
function paintBundles() {
  const box = $('#bundlePick');
  if (!box) return;
  box.hidden = !BUNDLES.length;
  if (!BUNDLES.length) return;
  const styleName = (id) => {
    const st = id && (typeof SITE_STYLES !== 'undefined' && Array.isArray(SITE_STYLES) ? SITE_STYLES : []).find((x) => x.id === id);
    return st ? st.name || '' : '';
  };
  $('#bundleList').innerHTML = BUNDLES.map((b) => {
    const pic = b.image || (b.front && b.front.thumb) || '';
    const has = [b.front && 'أمامي', b.back && 'خلفي', b.spine && 'كعب', b.style && 'أسلوب', b.print && 'طباعة'].filter(Boolean);
    const on = state.outer.bundle === b.id;
    const sn = styleName(b.style);
    // بلا صورة: ألوان غلافها الأمامي (لون الجلد ولون الذهب)
    const pal = (b.front && Array.isArray(b.front.palette) && b.front.palette) || [];
    const hex = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '');
    const tile = !pic && hex(pal[0]) ? ` style="background:${hex(pal[0])};color:${hex(pal[1]) || '#E9D7A8'};box-shadow:inset 0 0 0 5px ${hex(pal[0])},inset 0 0 0 6.5px ${hex(pal[1]) || '#E9D7A8'},0 6px 12px -8px rgba(42,29,20,.6)"` : '';
    return `<button type="button" class="bpk-c ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-bundle="${esc(b.id)}" style="--c:${esc(b.color || hex(pal[0]) || '#6B1D2F')}" title="${esc(b.name)}${sn ? ' — الأسلوب: ' + esc(sn) : ''}">
      <span class="bpk-i"${tile}>${pic ? `<img data-full="${esc(pic)}" alt="">` :`<i${tile ? ' style="color:inherit"' : ''}>${esc((b.name || '؟').trim().slice(0, 1))}</i>`}${on ? '<em aria-hidden="true">✓</em>' : ''}</span>
      <b>${esc(b.name)}</b><small>${esc(has.join(' · ') || 'فارغة')}</small></button>`;
  }).join('');
  $$('#bundleList img[data-full]').forEach((img) => {
    const box = img.parentElement;
    // بعرض الخانة (ولا يقل عن ٢٢٠: قد تُرسم والقسم مخفي فلا يُعرف عرضها، أو تتسع بعدُ مع النافذة)
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.max(220, box.clientWidth || 0);
    const w = Math.round(cw * dpr), h = Math.round(cw * (4 / 3) * dpr);
    sharpThumb(img.dataset.full, w, h).then((u) => { img.src = u; }, () => { img.src = img.dataset.full; });
  });
}
/* صورة الحزمة مصغّرةً بحجم خانتها: الصور الكبيرة (آلاف البكسلات) إذا صغّرها المتصفح دفعةً واحدة إلى خانةٍ صغيرة
   بدت مغبّشة كأنها مضغوطة؛ فتُصغَّر بالتنصيف خطوةً خطوة بتنعيمٍ عالٍ، وتُقصّ من الوسط بنسبة الخانة (كـ object-fit: cover) */
const thumbCache = new Map();
function sharpThumb(src, w, h) {
  const key = src + '|' + w + 'x' + h;
  if (!thumbCache.has(key)) {
    const pr = (async () => {
      // (بـ onload لا decode(): قد يعلق decode() في Chromium مع أن الصورة حُمّلت)
      const img = new Image();
      await new Promise((ok, no) => {
        img.onload = ok;
        img.onerror = () => no(new Error('img'));
        img.src = src;
      });
      const nw = img.naturalWidth, nh = img.naturalHeight;
      // صورة متجهة (SVG) أو أصغر من الخانة: تُعرض كما هي
      if (!nw || !nh || /\.svg($|\?)/i.test(src) || (nw <= w * 1.5 && nh <= h * 1.5)) return src;
      const r = Math.max(w / nw, h / nh);
      let cur = img, cw = w / r, ch = h / r, cx = (nw - cw) / 2, cy = (nh - ch) / 2;
      const draw = (W, H) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(cur, cx, cy, cw, ch, 0, 0, W, H);
        cur = c;
        cx = cy = 0;
        cw = W;
        ch = H;
      };
      while (cw / 2 >= w * 1.2) draw(Math.round(cw / 2), Math.round(ch / 2));
      draw(w, h);
      const blob = await new Promise((ok) => cur.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('canvas');
      return URL.createObjectURL(blob);
    })();
    pr.catch(() => thumbCache.delete(key));
    thumbCache.set(key, pr);
  }
  return thumbCache.get(key);
}
$('#bundleList') && $('#bundleList').addEventListener('click', (e) => {
  const c = e.target.closest('[data-bundle]');
  if (!c) return;
  // نقرةٌ على الحزمة المختارة تُلغي اختيارها
  if (state.outer.bundle === c.dataset.bundle) return clearBundle();
  const b = BUNDLES.find((x) => x.id === c.dataset.bundle);
  if (b) applyBundle(b);
});
$('#outerBundle').addEventListener('change', (e) => {
  if (!e.target.value) return clearBundle();
  const b = BUNDLES.find((x) => x.id === e.target.value);
  if (b) applyBundle(b);
});
/** إلغاء الحزمة: يعود ما كان قبلها (الأغلفة والأسلوب وتنسيق الطباعة)، وإلا فبلا أغلفة */
function clearBundle() {
  if (!state.outer.bundle) return;
  const pre = state.outer.preBundle || null;
  state.outer.design = pre ? pre.design : null;
  state.outer.back = pre ? pre.back : null;
  state.outer.spine = pre ? pre.spine : null;
  state.outer.mode = pre ? pre.mode : 'none';
  state.outer.tab = pre ? pre.tab : 'front';
  state.outer.bundle = '';
  state.outer.preBundle = null;
  if (pre) {
    if (pre.preset && pre.preset !== state.settings.preset) applyStyle(pre.preset);
    if (pre.printPreset) state.settings.printPreset = pre.printPreset;
    else delete state.settings.printPreset;
    state.settings.printReady = !!pre.printReady;
    $('#printReady').checked = !!pre.printReady;
    syncPrintUI();
  }
  saveOuter();
  loadOuterFrame(true);
  renderOuter();
  autosave();
  $('#outerBundle').value = '';
  paintBundles();
  toast('أُلغي اختيار الحزمة');
}
/** الحزمة: الأغلفة الثلاثة والأسلوب وتنسيق الطباعة دفعةً واحدة */
function applyBundle(b) {
  const sel = (d) => (d ? { designId: d.id, designName: d.name, state: undefined } : null);
  // ما كان قبل أول حزمة: إليه يعود الإلغاء (والانتقال من حزمة إلى حزمة لا يغيّره)
  if (!state.outer.bundle) {
    const o = state.outer;
    o.preBundle = { design: o.design, back: o.back, spine: o.spine, mode: o.mode, tab: o.tab, preset: state.settings.preset, printPreset: state.settings.printPreset || '', printReady: !!state.settings.printReady };
  }
  if (b.style) {
    const btn = $(`#presets [data-preset="${CSS.escape(b.style)}"]`);
    if (btn) btn.click();
  }
  if (b.print) {
    state.settings.printPreset = b.print;
    state.settings.printReady = true;
    $('#printReady').checked = true;
    syncPrintUI();
  }
  if (b.front) {
    state.outer.design = sel(b.front);
    state.outer.mode = 'design';
    state.outer.tab = 'front';
  }
  state.outer.back = sel(b.back);
  state.outer.spine = sel(b.spine);
  if (!b.front && state.outer.mode === 'none') state.outer.mode = 'design';
  state.outer.bundle = b.id;
  saveOuter();
  loadOuterFrame(true);
  renderOuter();
  autosave();
  $('#outerBundle').value = b.id;
  paintBundles();
  toast(`اختيرت الحزمة «${b.name}»: أغلفتها وأسلوبها وتنسيق طباعتها`);
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data || typeof e.data.type !== 'string') return;
  const m = e.data;
  if (m.type === 'warraq-cover-ready') {
    outerFrameReady = true;
    pushOuterStates();
    pushOuterData();
    return;
  }
  if ((m.type === 'warraq-cover-change' || m.type === 'warraq-cover') && m.designId) {
    const k = m.kind && OUTER_KEYS[m.kind] ? m.kind : $('#outerFrame').dataset.k || 'front';
    const prev = state.outer[OUTER_KEYS[k]];
    const prevColors = (prev && prev.designId === m.designId && prev.state && prev.state.colors) || {};
    state.outer[OUTER_KEYS[k]] = { designId: m.designId, designName: m.designName || '', state: m.state };
    if (m.state) bundleColorSync(k, prevColors, m.state.colors || {}).catch(() => {});
    saveOuter();
    renderOuterStatus();
    renderOuterKind();
    if (k === 'front') renderOuterBook();
    $$('#outerTabs button').forEach((b) => {
      const s = outerSel(b.dataset.k);
      if (b.dataset.k === k && s) { b.classList.add('set'); b.querySelector('small').textContent = s.designName || ''; }
    });
    if (m.type === 'warraq-cover') toast(k === 'front' ? 'اعتُمد الغلاف الخارجي — سيُضاف أول صفحة في كل مجلد' : k === 'back' ? 'اعتُمد الغلاف الخلفي — سيُضاف آخر صفحة في كل مجلد' : 'اعتُمد الكعب — يُحسب عرضه لكل مجلد عند الإخراج');
  }
});

/**
 * ربط ألوان الحزمة: ما غيّره المستخدم من ألوان صور جزءٍ ونصوصه (الأمامي غالباً) يسري على ما ربطه المالك به
 * في الأجزاء الأخرى (الخلفي والكعب)، ما دامت أغلفة الحزمة هي المختارة.
 */
async function bundleColorSync(k, prev, next) {
  const C = window.CoverCore;
  const b = state.outer.bundle && BUNDLES.find((x) => x.id === state.outer.bundle);
  if (!C || !C.bundleLinkedColors || !b || !Array.isArray(b.links) || !b.links.length) return;
  const mine = (p) => {
    const s = outerSel(p);
    return s && b[p] && b[p].id === s.designId ? s : null;
  };
  if (!mine(k)) return;
  const changed = {};
  for (const key of Object.keys(next)) if (next[key] !== prev[key]) changed[key] = next[key];
  if (!Object.keys(changed).length) return;
  const byPart = C.bundleLinkedColors(b.links, k, changed);
  let n = 0;
  for (const [p, colors] of Object.entries(byPart)) {
    const s = mine(p);
    if (!s) continue;
    const design = await loadCoverDesign(s.designId);
    // (قد يكون اختيار هذا الجزء تغيّر في أثناء التحميل)
    if (outerSel(p) !== s) continue;
    const st = s.state || C.emptyState(design);
    st.linked = st.linked || {};
    for (const [key, color] of Object.entries(colors)) {
      C.setUserColor(design, st, key, color);
      for (const t of C.groupOf(design, key)) st.linked[t.key] = 1;
      st.linked[key] = 1;
      n++;
    }
    s.state = st;
  }
  if (n) saveOuter();
}

async function loadCoverDesign(id) {
  const C = window.CoverCore, R = window.CoverRender;
  if (!C || !R) throw new Error('مكتبة الغلاف غير محمّلة');
  let design = designCache.get(id);
  if (!design) {
    const r = await fetch('/api/covers/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('التصميم غير متاح');
    design = C.normalizeDesign((await r.json()).design);
    designCache.set(id, design);
    try {
      const f = await (await fetch('/api/covers/fonts')).json();
      R.registerFonts(f.uploaded);
    } catch {}
  }
  return design;
}

/** يرسم جزءاً من الغلاف (الأمامي أو الخلفي أو الكعب) لمجلد واحد ← canvas بدقة الطباعة */
async function coverCanvas(k, vol, spineCm) {
  const C = window.CoverCore, R = window.CoverRender;
  const sel = outerSel(k);
  const design = await loadCoverDesign(sel.designId);
  const multi = state.book.volumes.length > 1;
  const st = { ...(sel.state || {}), volume: volNumber(vol) };
  // النصوص التي لم يكتبها المستخدم بنفسه تؤخذ دائماً من بيانات الكتاب الحالي
  st.texts = Object.fromEntries(Object.entries(st.texts || {}).map(([key, t]) => [key, t && t.edited ? t : { ...t, text: undefined }]));
  // كتاب من مجلد واحد: لا خانة لرقم المجلد
  if (!multi) st.volumeOn = false;
  // صور المستخدم ونصوصه في التصميم
  const ed = C.effective(design, st);
  const rs = C.resolveState(ed, st);
  if (k === 'front') {
    // لون الخلفية المختار (أسفل طبقة صور ظاهرة في قسم الخلفية، بصبغها): لما حول غلاف الطباعة المفرود
    const bg = ed.layers.find((l) => l.type === 'image' && l.section === 'cover' && !(rs.hidden && rs.hidden[l.id]) && rs.colors['L:' + l.id]);
    state.outerColor = bg ? rs.colors['L:' + bg.id] : '';
    // ولون جلد الكتاب المجسَّم كما ضبطه المجلِّد مع الغلاف (تلقائي، أو ثابت، أو مربوطٌ بلون صورةٍ أو خلفية فيه)
    state.outerCloth = (C.bookColor && C.bookColor(ed, rs)) || state.outerColor;
  }
  const data = outerBookData();
  delete data.volume;
  delete data.spineCm;
  if (data.publisher === undefined) delete data.publisher;
  return { canvas: await R.exportCanvas(ed, rs, { data, spineCm }), design };
}
const canvasURL = (c) => c.toDataURL('image/jpeg', 0.92);

/** يرسم الغلاف الخارجي لمجلد واحد ← data URL (JPEG بدقة الطباعة) */
async function buildOuterImage(vol) {
  return canvasURL((await coverCanvas('front', vol)).canvas);
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('تعذّرت قراءة صورة الغلاف'));
    im.src = src;
  });
}

/**
 * غلاف الطباعة المفرود لمجلد: من اليسار إلى اليمين (كتاب عربي): الأمامي ثم الكعب ثم الخلفي،
 * بنزيف ٣ مم حوله (تُمدّ حواف الرسم إليه)، وعرض الكعب من عدد صفحات المجلد ونوع الورق.
 * ← { blob: PDF بمقاسه الحقيقي (فيه TrimBox للقص)، spine }
 */
async function buildWrap(vol, pages, sides) {
  const C = window.CoverCore;
  const sp = C.spineWidth(pages, state.outer.paper);
  const pxcm = 300 / 2.54, bleed = 0.3;
  // مقاس الوجه: من تصميم الأمامي، وإلا الخلفي، وإلا ١٧×٢٤
  let fw = 17, fh = 24;
  const dsg = (sides.frontDesign || sides.backDesign);
  if (dsg) { fw = dsg.canvas.widthCm; fh = dsg.canvas.heightCm; }
  let front = sides.front || null;
  if (!front && state.outer.mode === 'file' && state.fileCover) front = await loadImg(state.fileCover);
  const spine = outerSel('spine') ? (await coverCanvas('spine', vol, sp.cm)).canvas : null;
  const b = Math.round(bleed * pxcm), fwp = Math.round(fw * pxcm), spp = Math.max(1, Math.round(sp.cm * pxcm));
  const W = 2 * b + 2 * fwp + spp, H = 2 * b + Math.round(fh * pxcm);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.fillStyle = state.outerColor || '#ffffff';
  g.fillRect(0, 0, W, H);
  const fhp = H - 2 * b;
  if (front) g.drawImage(front, b, b, fwp, fhp);
  if (spine) g.drawImage(spine, b + fwp, b, spp, fhp);
  if (sides.back) g.drawImage(sides.back, b + fwp + spp, b, fwp, fhp);
  // النزيف: تُمدّ الحواف
  g.drawImage(c, b, b, 1, fhp, 0, b, b, fhp);
  g.drawImage(c, W - b - 1, b, 1, fhp, W - b, b, b, fhp);
  g.drawImage(c, 0, b, W, 1, 0, 0, W, b);
  g.drawImage(c, 0, H - b - 1, W, 1, 0, H - b, W, b);
  const jpg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  const pt = 72 / 2.54;
  return { blob: jpegPdf(new Uint8Array(await jpg.arrayBuffer()), W, H, (W / pxcm) * pt, (H / pxcm) * pt, bleed * pt), spine: sp, spineCanvas: spine, cm: { w: W / pxcm, h: H / pxcm } };
}
/** صورة صغيرة من رسمٍ (للخزانة والرَّحل والمعاينة): JPEG لا يزيد على العرض والارتفاع المعطيين */
function smallURL(src, maxW, maxH, q = 0.86) {
  if (!src || !src.width || !src.height) return '';
  const k = Math.min(1, maxW / src.width, maxH / src.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/** ملف PDF من صورة JPEG واحدة بمقاس محدد (نقاط)، مع حدود القص (TrimBox) والنزيف (BleedBox) */
function jpegPdf(jpg, pw, ph, wPt, hPt, bPt) {
  const enc = new TextEncoder();
  const parts = [];
  const offs = [];
  let len = 0;
  const push = (x) => {
    const u = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(u);
    len += u.length;
  };
  const f = (n) => (Math.round(n * 100) / 100).toString();
  const obj = (n, body, stream) => {
    offs[n] = len;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(wPt)} ${f(hPt)}] /BleedBox [0 0 ${f(wPt)} ${f(hPt)}] /TrimBox [${f(bPt)} ${f(bPt)} ${f(wPt - bPt)} ${f(hPt - bPt)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  const content = enc.encode(`q ${f(wPt)} 0 0 ${f(hPt)} 0 0 cm /Im0 Do Q`);
  obj(5, `<< /Length ${content.length} >>`, content);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const u of parts) {
    out.set(u, p);
    p += u.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}

/* ------------------------------------------------------------------ الملاحظات والشكاوى */
// الزر ونافذته في /js/feedback.js (مشترك بين كل الصفحات)؛ هنا نعرّفه بالكتاب المفتوح ليُرفق بالرسالة
window.WarraqFeedback = Object.assign(window.WarraqFeedback || {}, { book: () => (state.book ? { id: state.book.id, name: state.book.name } : null) });

/* ------------------------------------------------------------------ المعاينة الحية */
// ست لوحات تُنضَّد بالمحرك الحقيقي وتتحدث مع كل تغيير: الغلاف الداخلي، العناوين والمتن،
// الشرح بطريقتيه، الآيات والشعر، الفهرس. اللوحة المعروضة تنتقل إلى ما يخص التغيير.
const COVER_KEYS = ['title', 'subtitle', 'author', 'authorNote', 'editorLabel', 'editor', 'edition', 'publisher'];
// المنضدة في البرنامج (data-bench): المعاينة تملأ ما بجانب الخطوات، صفحتين متقابلتين، وأدواتها في شريط واحد
const BENCH_VIEW = document.documentElement.hasAttribute('data-bench');
/** المعاينة في المتون: النماذج الثابتة (نثرٌ ونظم، مجرّدةً من الكتاب)، ومعها متن المستخدم نفسه (أول ستة أجزاء منه) بتعديلاته لوحةً بعدها */
function mutunPreviewDoc(peek) {
  if (!mutunOn() || !state.book || !MU.applied) return null;
  if (peek) return { mode: 'mutun-own' };
  const d = composeVolume(MU.applied, currentSettings());
  const cut = d.blocks.findIndex((b) => b.type === 'mstart' && b.k >= 6);
  const blocks = cut < 0 ? d.blocks : d.blocks.slice(0, cut);
  const ids = new Set(blocks.filter((b) => b.type === 'heading').map((b) => b.id));
  return { extra: { ...d, blocks, headings: (d.headings || []).filter((h) => ids.has(h.id)) }, cover: { ...(previewCover() || {}), title: state.cover.title || state.book.name, author: state.cover.author || '' }, mode: 'mutun-own' };
}
function previewCover() {
  if (!state.book) return null;
  const first = state.book.volumes.find((v) => state.selected.has(v.vol)) || state.book.volumes[0];
  const c = Object.fromEntries(COVER_KEYS.map((k) => [k, state.cover[k] || '']));
  c.volLabel = state.book.volumes.length > 1 && first ? volumeLabel(first.vol) : '';
  return c;
}
const preview = createPreview($('#previewHost'), {
  ...(BENCH_VIEW ? { bar: true, spread: true, fill: true } : {}),
  getSettings: currentSettings,
  getDoc: mutunPreviewDoc,
  getUserStyle: userStyleNow,
  getParseOpts: () => ({ matnQawluhu: $('#matnQawluhu').checked }),
  getCover: previewCover,
});

/** اللوحة التي يخصها التغيير (فيُنتقل إليها ليُرى الفرق) */
function previewFocus(t) {
  const id = t.id || '';
  if (t.closest('#matnColors') || ['matnBold', 'quranInMatn', 'matnBrackets', 'matnQawluhu', 'cqm', 'cm', 'ct'].includes(id)) return 'sharh';
  const rf = t.dataset && t.dataset.rf;
  if (rf) return /^h/.test(rf) ? 'heads' : rf === 'quran' || rf === 'verse' ? 'verses' : 'sharh';
  if (t.closest('#sharhEnd')) return 'sharh';
  if (id === 'ornament') return 'sharhOrn';
  if (id === 'runningHead') return 'sharhPage';
  if (['c1', 'c2', 'c3', 'footnotes', 'chapterNewPage', 'headScheme'].includes(id)) return 'heads';
  if (['typoRules', 'spaceCollapse'].includes(id)) return 'sharhPage';
  if (['ayahCite', 'nabawiBold'].includes(id)) return 'verses';
  if (['cq', 'cv', 'verseSep', 'verseSepSymbol', 'verseLayout'].includes(id)) return 'verses';
  if (['printReady', 'cb'].includes(id) || t.closest('#bsmPick')) return 'cover';
  if (t.closest('#tocPos') || t.classList.contains('tocInc')) return 'toc';
  return null;
}
for (const type of ['input', 'change', 'click']) {
  $('#settingsCard').addEventListener(type, (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t.closest('#previewHost, #outerPanel, .actions, #templates, #progressCard')) return;
    if (type === 'click' && !t.closest('button, .sw')) return;
    // خيارات الإخراج (الصيغ وخط Word) لا تغيّر المعاينة، إلا خط الكتاب
    if (t.closest('.panel.out') && t.id !== 'bookFont') return;
    if (!t.closest('#presets')) state.settingsTouched = true;
    // بعد أن تُطبَّق القيمة في معالجها
    setTimeout(() => preview.update(previewFocus(t)), 0);
  });
}
// بيانات الغلاف الداخلي تظهر في لوحة الغلاف
$('#bookCard').addEventListener('input', (e) => e.target.dataset && e.target.dataset.cover && preview.update('cover'));

/* ------------------------------------------------------------------ أساليب المالك وخطوطه */
async function loadSite() {
  try {
    const [st, fn, pi] = await Promise.all([
      fetch('/api/styles', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/fonts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/print-info', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (pi && Array.isArray(pi.basmalas) && Array.isArray(pi.front)) PRINT_INFO = { basmalas: pi.basmalas, front: pi.front, back: pi.back || [], styles: pi.styles || {}, presets: Array.isArray(pi.presets) ? pi.presets : [] };
    loadBundles();
    const so = await fetch('/api/sources', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (so && Array.isArray(so.sources)) SOURCES = { sources: so.sources.map((x) => ({ ...x, count: x.count > 1 ? x.count : 1 })) };
    if (fn && Array.isArray(fn.fonts)) {
      SITE_FONTS = fn.fonts;
      registerFonts(SITE_FONTS);
    }
    if (st && Array.isArray(st.styles) && st.styles.length) {
      SITE_STYLES = st.styles;
      STYLES = [...SITE_STYLES, ...loadMyStyles()];
      // أسلوب حُفظ للتوّ في «صانع الأساليب» (فُتح في صفحته): يُختار
      const picked = takePick();
      if (picked && STYLES.some((x) => x.id === picked)) state.settings = { ...state.settings, preset: picked };
      // ما لم يغيّر المستخدم شيئاً: يُطبَّق الأسلوب كما ضبطه صاحبه
      if (!state.settingsTouched || picked) {
        const st = styleById(state.settings.preset);
        const R = isResearchSettings(state.settings);
        // الأسلوب من نوع المعروض: بحثٌ بأسلوب بحث وقالبه، وكتابٌ بأسلوب كتاب
        if (R) state.settings = styleFits(st.settings, 'research') ? applyResearchLayout(settingsOf(st, 'research'), state.settings.rlayout) : researchDefaults(state.settings.rlayout);
        else {
          const keep = pick(state.settings, ['template', 'docxLineSpacing']);
          const k = workKind === 'mutun' ? 'mutun' : 'books';
          state.settings = { ...settingsOf(styleFits(st.settings, k) || styleFits(st.settings, 'books') ? st : styleById(DEFAULT_BOOK_STYLE), k), ...keep };
        }
      }
    }
  } catch {}
  renderSources();
  renderSettingsUI();
  preview.update();
}

if (researchMode) state.settings = researchDefaults();
// شريط النوع أعلى عمود المنضدة (في البرنامج)
if (document.documentElement.hasAttribute('data-bench')) {
  const bar = document.createElement('div');
  bar.className = 'bn-kind';
  bar.id = 'kindBar';
  bar.innerHTML = `<span class="kb-pill"></span><button type="button" class="kb-clear" id="clearBench" hidden title="رفع الكتاب عن المنضدة والبدء من جديد (Ctrl+N)"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>منضدة جديدة</button>`;
  const panel = $('.bn-panel') || $('.main');
  panel.prepend(bar);
  // المتون: تقسيم المتن وموضع التعليق أول ما في «التنضيد»
  const opts = $('#s3 .bn-opts');
  if (opts) opts.before($('#mutunBox'));
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-kind-pill]')) askKind(true);
    else if (e.target.closest('#clearBench')) clearBench();
  });
}
renderSettingsUI();
researchUI(researchMode);
renderSources();
const siteReady = loadSite();
if (DESK) deskInit();

/* ================================================================== البرنامج: المنضدة ومشروعها */
// المشروع: الكتاب الذي على المنضدة بكل ما اختير له (مصدره، مجلداته، إعداداته، غلافاه، صيغ إخراجه).
// يُحفظ تلقائياً فيعود كما تُرك حين يُفتح البرنامج، ويُحفظ ملفاً ‎.waraq‎ يُفتح بنقرتين، ويُسلَّم إلى النسّاخ.
// (في البرنامج وحده: DESK)
/** هيكل البرنامج (إن كانت المنضدة باباً فيه) */
function shellOf() {
  try {
    return window.parent !== window && window.parent.WarraqShell ? window.parent.WarraqShell : null;
  } catch {
    return null;
  }
}

/** المشروع الحالي ← كائن يُحفظ (null إن كانت المنضدة فارغة) */
function getProject() {
  if (!state.book) return null;
  const src = state.parts.length
    ? {
        parts: state.parts.map((p) => (p.kind === 'mine' ? { kind: 'mine', path: (p.file && p.file.path) || '', name: p.file ? p.file.name : '', vol: p.vol } : { kind: 'src', id: p.bookId, src: p.src || '', wo: (p.book && p.book.wo) || '', vol: p.vol })),
        setName: state.setName,
        setAuthor: state.setAuthor,
        setKeepNums: state.setKeepNums,
        wordOptions: state.book.word ? state.book.word.options : null,
        research: !!state.book.research,
        mutun: !!state.book.mutun,
      }
    : { id: state.book.id, src: state.book.src || '', wo: state.book.wo || '', mutun: !!state.book.mutun };
  // كتابٌ فُتح من ملفه: مصدره الأول (إن ضاع الملف أُعيد منه)
  const orig = state.book.docFile && state.doc && state.doc.manifest && state.doc.manifest.source;
  return {
    format: PROJECT_FORMAT,
    version: 1,
    saved: new Date().toISOString(),
    title: state.cover.title || state.book.name,
    author: state.cover.author || '',
    source: orig || src,
    volumes: state.book.volumes.length,
    ...(state.split ? { split: state.split } : {}),
    selected: [...state.selected],
    settings: state.settings,
    ...(state.book.mutun ? { mutun: state.mutun } : {}),
    settingsTouched: !!state.settingsTouched,
    tplTouched: !!state.tplTouched,
    cover: state.cover,
    dirty: [...state.dirty],
    outer: state.outer,
    innerCover: state.innerCover !== false,
    innerTouched: !!state.innerTouched,
    paper: state.paper,
    om: state.om,
    ...(state.asIs ? { asIs: true } : {}),
    ...(hasBgs() ? { bgs: state.bgs } : {}),
    ...(state.noStyle ? { noStyle: state.noStyle } : {}),
    out: outOpts(),
    ...(state.edits.ops.length ? { edits: state.edits } : {}),
    ...(state.doc && state.doc.file ? { bookFile: state.doc.file } : {}),
  };
}

/** إعادة مشروع إلى المنضدة: الكتاب من مصدره (أو ملفاته من الجهاز)، ثم كل ما اختير له */
async function restoreProject(p) {
  if (!p || p.format !== PROJECT_FORMAT || !p.source) throw new Error('ليس ملف مشروع من ورّاق');
  if (state.running) throw new Error('أوقف العملية الجارية أولاً');
  // كتابٌ له ملف (‎.waraq): يُفتح منه، فلا يُجلب من مصدره
  if (p.bookFile && DESK) {
    let bytes = null;
    try {
      bytes = await DESK.readFile(p.bookFile);
    } catch {}
    if (bytes && isBookFile(bytes)) return openBookFile(bytes, p.bookFile);
  }
  await siteReady;
  // نوع العمل من المشروع (الكتب، الأبحاث، المتون)
  setKind(p.source.mutun ? 'mutun' : p.source.research ? 'research' : 'books', true);
  resetBench(true);
  const src = p.source;
  if (Array.isArray(src.parts) && src.parts.length) {
    $('#bookCard').hidden = false;
    $('#bookTitle').textContent = 'يُفتح الكتاب…';
    const parts = [];
    for (const x of src.parts) {
      if (x.kind === 'mine') {
        if (!x.path) throw new Error(`لا يُعرف مكان الملف «${x.name}» على الجهاز`);
        let bytes;
        try {
          bytes = await DESK.readFile(x.path);
        } catch {
          throw new Error(`الملف «${x.name}» لم يعد في مكانه: ${x.path}`);
        }
        const f = { bytes, name: x.name, id: 'my-' + Date.now().toString(36) + '-' + parts.length, path: x.path };
        parts.push({ ...(await readMine(f, src.wordOptions || {}, null, !!src.research, !!src.mutun)), vol: x.vol });
      } else parts.push(partOf(await readSource(x.id, x.src, x.wo), x.vol));
    }
    state.parts = parts;
    state.setName = src.setName || '';
    state.setAuthor = src.setAuthor || '';
    state.setKeepNums = !!src.setKeepNums;
    showParts(false);
  } else if (!(await loadBook(src.id, src.src || '', src.wo || ''))) {
    throw new Error('تعذّر تحميل الكتاب من مصدره' + (navigator.onLine ? '' : ': لا اتصال بالإنترنت'));
  }
  applyProjectState(p);
}
/** ما اختاره المستخدم للكتاب (من مشروعه أو من ملف الكتاب): الغلاف، والأسلوب، والمجلدات، والإخراج، والتعديلات */
function applyProjectState(p) {
  // ما اختاره المستخدم يعلو ما يُستنتج من الكتاب
  state.dirty = new Set(p.dirty || []);
  state.edits = p.edits && Array.isArray(p.edits.ops) ? { v: 1, ops: p.edits.ops } : { v: 1, ops: [] };
  state.cover = { ...state.cover, ...(p.cover || {}) };
  for (const inp of $$('[data-cover]')) inp.value = state.cover[inp.dataset.cover] || '';
  // (مشروعٌ قديم: مفاتيح المتون كانت في الإعدادات)
  const sp = splitMutun(p.settings);
  state.settings = { ...defaultSettings(), ...sp.settings };
  if (state.book && state.book.mutun) state.mutun = cleanMutun({ ...state.mutun, ...(sp.mutun || {}), ...(p.mutun && typeof p.mutun === 'object' ? p.mutun : {}) });
  state.settingsTouched = !!p.settingsTouched;
  state.tplTouched = !!p.tplTouched;
  renderSettingsUI();
  // تقسيم الكتاب (قبل اختيار المجلدات)
  if (p.split && canSplit()) applySplit(p.split, { quiet: true });
  if (Array.isArray(p.selected) && state.book.volumes.length > 1) {
    const ok = new Set(p.selected.filter((v) => state.book.volumes.some((x) => x.vol === v)));
    if (ok.size) {
      state.selected = ok;
      for (const c of $$('#volList input')) c.checked = ok.has(c.value);
      updateVolCount();
    }
  }
  if (p.paper === 'yellow' || p.paper === 'white') setPaper(p.paper, true);
  if (p.om && typeof p.om === 'object') setOm(p.om, true);
  state.bgs = cleanBgsClient(p.bgs);
  state.noStyle = p.noStyle && typeof p.noStyle === 'object' && p.noStyle.settings ? p.noStyle : null;
  renderBgs();
  state.asIs = p.asIs === true;
  if ($('#wordAsIs')) $('#wordAsIs').checked = state.asIs;
  if (typeof p.innerCover === 'boolean') {
    state.innerCover = p.innerCover;
    state.innerTouched = !!p.innerTouched;
    $('#wordInner').checked = p.innerCover;
  }
  if (p.outer && typeof p.outer === 'object') {
    state.outer = { ...OUTER_BLANK(), ...p.outer };
    saveOuter();
    if (outerOn()) loadOuterFrame(true);
    renderOuter();
  }
  if (p.out) setOut(p.out);
  preview.update();
  deskChanged();
}

/* ---- الحفظ التلقائي: كل تغيير على المنضدة يُحفظ بعد لحظة، فيعود الكتاب كما تُرك ---- */
function autosave() {
  if (!DESK || SCRIBE || restoring || !DESK.saveCurrent) return;
  saveBookSoon();
  clearTimeout(autoT);
  autoT = setTimeout(() => DESK.saveCurrent(getProject()).catch(() => {}), 1200);
}

/* ---- حال المنضدة: للهيكل (شريط الحالة، والخزانة، وأيقونة شريط المهام) أو للنسّاخ ---- */
function deskInfo() {
  if (!state.book) return null;
  const rows = $$('#volRows .vrow:not(.vbook)');
  const okN = $$('#volRows .vrow:not(.vbook) .st.ok').length;
  // الجلب نصف العمل، والتنضيد نصفه
  const pct = state.running ? Math.round((state.fetchPct || 0) * 0.5 + (rows.length ? (okN / rows.length) * 50 : 0)) : 0;
  const stage = !state.running ? '' : (state.fetchPct || 0) < 100 ? 'الجلب' : 'التنضيد';
  return {
    id: state.book.id,
    title: state.cover.title || state.book.name,
    author: state.cover.author || '',
    running: !!state.running,
    pct,
    stage,
    phase: state.running ? state.phase || 1 : 0,
    done: !state.running && rows.length > 0 && okN === rows.length,
    volumes: state.book.volumes.length,
    step: !$('#progressCard').hidden ? 5 : !$('#settingsCard').hidden ? 3 : 2,
    // لبطاقة الخزانة: القالب، ومن أين الكتاب
    tpl: ($('#templates [aria-pressed="true"] b') || {}).textContent || '',
    from: state.book.local || (state.parts[0] && state.parts[0].kind === 'mine') ? 'ملف من جهازك' : state.book.srcName && state.book.src && state.book.src !== 'turath' ? state.book.srcName : '«تراث»',
  };
}
function deskTell() {
  clearTimeout(tellT);
  tellT = setTimeout(() => {
    const info = deskInfo();
    if (SCRIBE) window.WarraqBench.onProgress && window.WarraqBench.onProgress(info);
    else {
      const sh = shellOf();
      if (sh) sh.bench(info);
    }
  }, 60);
}
function deskChanged() {
  deskTell();
  autosave();
  deskBar();
}
/** المنضدة في الهيكل: شريطها (اسم الكتاب وأوامره)، والمعاينة عمودٌ ثابت ما دام على المنضدة كتاب */
function deskBar() {
  const has = !!state.book && !$('#settingsCard').hidden;
  document.body.classList.toggle('has-book', has);
  const t = $('#dkTitle');
  if (t) t.textContent = state.book ? state.cover.title || state.book.name : 'المنضدة فارغة: ابحث عن كتاب، أو ضع ملفك';
  const sv = $('#dkSave');
  if (sv) sv.disabled = !state.book;
}

/** انتهى الإخراج: يُسجَّل الكتاب في الخزانة (إن تمّ كله) */
async function deskFinished(ok) {
  deskTell();
  if (ok && state.deskDir && DESK.libraryAdd) {
    try {
      const files = [...state.files.entries()];
      const first = files[0] && files[0][1];
      const rec = {
        title: state.cover.title || state.book.name,
        author: state.cover.author || '',
        dir: state.deskDir,
        color: bookCloth(),
        accent: (state.settings.headingColors && state.settings.headingColors[1]) || '',
        thumb: first && first.outer ? await thumbOf(first.outer) : '',
        // الغلاف الخلفي والكعب كما اختيرا (وإلا فالشكل الافتراضي)
        backImg: first && first.back ? await thumbOf(first.back) : '',
        volumes: files.map(([vol, f]) => ({ vol, label: state.book.volumes.length > 1 ? volumeLabel(vol) : '', pdf: (f.saved && f.saved.pdf) || '', docx: (f.saved && f.saved.docx) || '', pages: f.pages || 0, ...(f.spineImg ? { spineImg: f.spineImg } : {}), ...(f.shelfImg ? { shelfImg: f.shelfImg } : {}) })),
        waraq: (state.waraqOut && state.waraqOut.path) || '',
        project: getProject(),
      };
      // موضوعه من فهرس «تراث» (لترتيب الخزانة بالموضوع)، وما كان من الجهاز «من جهازك»
      const subject = await subjectOf(rec.project);
      if (subject) rec.subject = subject;
      const saved = await DESK.libraryAdd(rec);
      // الخزانة: ما أُخرج أول مرة يوضع في الخزانة المفتوحة (وإعادة الإخراج تُبقيه حيث كان)، ثم يُسأل: أين تضعه؟
      const info = DESK.info ? await DESK.info().catch(() => null) : null;
      const prefs = (info && info.prefs) || {};
      const cabs = Array.isArray(prefs.cabinets) && prefs.cabinets.length ? prefs.cabinets : [{ id: 'main', name: 'خزانة ورّاق' }];
      if (saved && saved.id && !cabs.some((c) => c.id === saved.cabinet)) {
        saved.cabinet = (cabs.find((c) => c.id === prefs.cabinet) || cabs[0]).id;
        if (DESK.libraryUpdate) await DESK.libraryUpdate(saved.id, { cabinet: saved.cabinet }).catch(() => {});
      }
      const sh = shellOf();
      if (sh) sh.libraryChanged();
      if (!SCRIBE && saved && saved.id) placeBox(saved, prefs);
      // إشعار التمام (ويندوز): «٣ مجلدات · PDF و Word · ١٢٤٠ صفحة · ٤ دقائق»، وزرّاه: افتح المجلد، ضعه على الرَّحل
      if (DESK.notify) {
        const pages = rec.volumes.reduce((a, v) => a + (v.pages || 0), 0);
        const kinds = [rec.volumes.some((v) => v.pdf) && 'PDF', rec.volumes.some((v) => v.docx) && 'Word', rec.waraq && 'وَرَق'].filter(Boolean).join(' و ');
        const mins = Math.max(1, Math.round((Date.now() - (state.startedAt || Date.now())) / 60000));
        const body = [rec.volumes.length > 1 ? N(rec.volumes.length, 'مجلد') : 'مجلد واحد', kinds, pages ? N(pages, 'صفحة') : '', mins === 1 ? 'دقيقة' : mins === 2 ? 'دقيقتان' : `${ar(mins)} ${mins <= 10 ? 'دقائق' : 'دقيقة'}`].filter(Boolean).join(' · ');
        DESK.notify({ title: SCRIBE ? `فرغ النسّاخ من «${rec.title}»` : `تمّ إخراج «${rec.title}»`, body, door: 'khizana', book: saved && saved.id, source: SCRIBE ? 'scribes' : 'bench' }).catch(() => {});
      }
    } catch {}
  }
  const ws = doneWaiters;
  doneWaiters = [];
  for (const w of ws) w(ok);
}
/** موضوع الكتاب في فهرس «تراث» ← { id, name } (وكتب الجهاز: «من جهازك») */
async function subjectOf(project) {
  const src = project && project.source;
  if (!src) return null;
  let id = 0;
  if (Array.isArray(src.parts)) {
    if (src.parts.length && src.parts.every((x) => x.kind === 'mine')) return { id: 'local', name: 'من جهازك' };
    const p = src.parts.find((x) => x.kind === 'src' && (!x.src || x.src === 'turath'));
    id = p ? +p.id || 0 : 0;
  } else if (!src.src || src.src === 'turath') id = +src.id || 0;
  if (!id) return null;
  try {
    const r = await (await fetch('/api/subjects?ids=' + id, { cache: 'no-store' })).json();
    const name = r && r.subjects && r.subjects[id];
    return name ? { id: String(id), name } : null;
  } catch {
    return null;
  }
}
/**
 * بعد التمام: «أين تضع كتابك؟» — الخزائن رقاعٌ يُختار منها (و«＋ خزانة جديدة» باسمٍ يُكتب في مكانه)،
 * وفي ترتيب «مجموعاتي» مجموعات الخزانة المختارة. كل اختيار يُحفظ في الحال، والخزانة المختارة تصير المفتوحة.
 */
function placeBox(book, prefs) {
  const box = $('#doneBox');
  if (!box || !DESK.libraryUpdate) return;
  let cabs = Array.isArray(prefs.cabinets) && prefs.cabinets.length ? prefs.cabinets.slice() : [{ id: 'main', name: 'خزانة ورّاق' }];
  let groups = Array.isArray(prefs.groups) ? prefs.groups.slice() : [];
  const custom = prefs.shelfMode === 'custom';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let el = $('#donePlace');
  if (!el) {
    el = document.createElement('div');
    el.id = 'donePlace';
    el.className = 'place-box';
    box.querySelector('.acts').before(el);
  }
  const chip = (attrs, on, label) => `<button type="button" class="pl-chip" ${attrs} aria-pressed="${on}">${esc(label)}</button>`;
  const adder = (kind, label) => `<span class="pl-add" data-add="${kind}"><button type="button" class="pl-chip ghost">${label}</button></span>`;
  function paint() {
    const cab = cabs.find((c) => c.id === book.cabinet) || cabs[0];
    const gs = groups.filter((g) => (g.cabinet || cabs[0].id) === cab.id);
    el.innerHTML = `<p class="pl-q">أين تضع كتابك؟</p>
      <div class="pl-row" role="group" aria-label="الخزانة"><span class="pl-l">الخزانة</span>${cabs.map((c) => chip(`data-cab="${esc(c.id)}"`, c.id === cab.id, c.name)).join('')}${adder('cab', '＋ خزانة جديدة')}</div>
      ${custom ? `<div class="pl-row" role="group" aria-label="المجموعة"><span class="pl-l">المجموعة</span>${chip('data-grp=""', !gs.some((g) => g.id === book.group), 'بلا مجموعة')}${gs.map((g) => chip(`data-grp="${esc(g.id)}"`, g.id === book.group, g.name)).join('')}${adder('grp', '＋ مجموعة')}</div>` : ''}
      <p class="pl-ok" aria-live="polite"></p>`;
  }
  const said = (t) => {
    const o = el.querySelector('.pl-ok');
    if (o) o.textContent = t;
  };
  async function put(patch, msg) {
    Object.assign(book, patch);
    await DESK.libraryUpdate(book.id, patch).catch(() => {});
    const sh = shellOf();
    if (sh) sh.libraryChanged();
    paint();
    said(msg);
  }
  el.onclick = async (e) => {
    const a = e.target.closest('.pl-add');
    if (a && !a.querySelector('input')) {
      a.innerHTML = `<input type="text" class="pl-in" maxlength="40" placeholder="${a.dataset.add === 'cab' ? 'اسم الخزانة' : 'اسم المجموعة'}" dir="auto">`;
      return a.querySelector('input').focus();
    }
    const b = e.target.closest('.pl-chip[data-cab], .pl-chip[data-grp]');
    if (!b) return;
    if (b.dataset.cab != null) {
      const c = cabs.find((x) => x.id === b.dataset.cab);
      await DESK.setPrefs({ cabinet: c.id }).catch(() => {});
      return put({ cabinet: c.id, group: '' }, `في «${c.name}»`);
    }
    const g = groups.find((x) => x.id === b.dataset.grp);
    return put({ group: g ? g.id : '' }, g ? `في مجموعة «${g.name}»` : 'بلا مجموعة');
  };
  el.onkeydown = async (e) => {
    const i = e.target.closest('.pl-in');
    if (!i) return;
    if (e.key === 'Escape') return paint();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = i.value.trim().slice(0, 40);
    if (!name) return paint();
    if (i.closest('.pl-add').dataset.add === 'cab') {
      const c = { id: 'c' + uid(), name };
      cabs = [...cabs, c];
      await DESK.setPrefs({ cabinets: cabs, cabinet: c.id }).catch(() => {});
      return put({ cabinet: c.id, group: '' }, `صُنعت «${name}» ووُضع فيها`);
    }
    const g = { id: 'g' + uid(), name, cabinet: book.cabinet || cabs[0].id };
    groups = [...groups, g];
    await DESK.setPrefs({ groups }).catch(() => {});
    return put({ group: g.id }, `في مجموعة «${name}»`);
  };
  el.onfocusout = (e) => {
    const i = e.target.closest && e.target.closest('.pl-in');
    if (i && !i.value.trim()) setTimeout(paint, 120);
  };
  paint();
}
/* ---- آخر أسلوب استُعمل: به يُخرج النسّاخ ما أُضيف إليه من المستكشف («أضفه إلى طابور النسّاخ») ---- */
const LAST_STYLE = 'warraq.lastStyle';
function saveLastStyle() {
  if (isResearchSettings(state.settings)) return;
  try {
    const { template, ...settings } = state.settings;
    localStorage.setItem(LAST_STYLE, JSON.stringify({ settings, out: outOpts() }));
  } catch {}
}
function applyLastStyle() {
  let last = null;
  try {
    last = JSON.parse(localStorage.getItem(LAST_STYLE) || 'null');
  } catch {}
  if (!last || !last.settings || last.settings.research || isResearchSettings(state.settings)) return;
  // القالب يبقى ما استُنتج من الكتاب نفسه، والأسلوب وإعداداته من آخر إخراج
  state.settings = { ...state.settings, ...last.settings, template: state.settings.template };
  state.settingsTouched = true;
  renderSettingsUI();
  if (last.out) setOut(last.out);
}
/** صورة صغيرة من الغلاف الخارجي (للخزانة) */
function thumbOf(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // صورة الغلاف في الخزانة: بدقة الشاشات الحادّة
      const w = Math.min(480, img.width);
      const k = w / img.width;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

/** فتح ما يُطلب على المنضدة: مشروع ‎.waraq‎، أو ملفات Word و PDF من الجهاز */
async function openJob(job) {
  pendingOpen = true;
  setTimeout(() => (pendingOpen = false), 4000);
  if (state.running) return toast('المنضدة تعمل الآن: أوقف الإخراج أولاً، أو أرسل الكتاب إلى النسّاخ');
  const paths = job.paths || (job.path ? [job.path] : []);
  if (!paths.length) return;
  if (/\.(waraq|warraq)$/i.test(paths[0])) {
    try {
      const bytes = await DESK.readFile(paths[0]);
      restoring = true;
      if (isBookFile(bytes)) await openBookFile(bytes, paths[0]);
      else await restoreProject(JSON.parse(new TextDecoder().decode(bytes)));
      toast('فُتح المشروع: ' + (state.cover.title || state.book.name), 3200, 'ok');
    } catch (err) {
      toast('تعذّر فتح المشروع: ' + err.message, 6000);
    } finally {
      restoring = false;
      autosave();
    }
    return;
  }
  const files = [];
  for (const p of paths) {
    const name = p.split(/[\\/]/).pop();
    const f = new File([await DESK.readFile(p)], name);
    f.__path = p;
    files.push(f);
  }
  resetBench(true);
  showMyBook();
  await loadMyBooks(files, job.folder || '');
}

/** حفظ المشروع ملفاً (Ctrl+S) */
async function saveProjectAs() {
  const p = getProject();
  if (!p) return toast('لا كتاب على المنضدة بعد');
  try {
    // الكتاب كله في ملفه (كتاب ورق): يُصنع أولاً إن لم يكن
    if (!state.doc) {
      toast('يُصنع كتاب ورق: يُجلب الكتاب ويُحلَّل مرة واحدة…', 6000);
      await convertBook();
    }
    const r = await DESK.saveProjectAs(await bookBytes(), (p.title || 'كتاب') + '.waraq');
    if (r && r.path) {
      state.doc.file = r.path;
      autosave();
    }
    if (r && r.path) toast('حُفظ الكتاب: ' + r.path.split(/[\\/]/).pop(), 3600, 'ok');
  } catch (err) {
    toast('تعذّر حفظ المشروع: ' + err.message, 5000);
  }
}

function deskInit() {
  window.WarraqBench = {
    getProject,
    /** للنسّاخ: يعود حين ينتهي الإخراج (true إن تمّ كله) */
    async run(p) {
      restoring = true;
      try {
        await restoreProject(p);
      } finally {
        restoring = false;
      }
      const done = new Promise((r) => doneWaiters.push(r));
      await start();
      if (!state.running && !state.preparing) return false;
      return done;
    },
    cancel() {
      if (state.running) $('#cancelBtn').click();
      const ws = doneWaiters;
      doneWaiters = [];
      for (const w of ws) w(false);
    },
    /** للنسّاخ: ملفات Word أو PDF (أو كتاب «وَرَق») من الجهاز تُقرأ ثم تُخرج. opts.pdf: لا بدّ من PDF (للرَّحل) */
    async runFiles(paths, opts = {}) {
      restoring = true;
      try {
        await openJob({ paths });
      } finally {
        restoring = false;
      }
      if (!state.book) throw new Error('تعذّرت قراءة الملف');
      // كتاب «وَرَق» يُخرج بأسلوبه الذي في ملفه، وغيره بآخر أسلوب استُعمل
      if (!(state.doc && /\.(waraq|warraq)$/i.test(paths[0] || ''))) applyLastStyle();
      if (opts.pdf) $('#outPdf').checked = true;
      const done = new Promise((r) => doneWaiters.push(r));
      await start();
      if (!state.running && !state.preparing) return false;
      return done;
    },
    info: deskInfo,
    /** ما أخرجه آخر إخراج: ملفات المجلدات، وملف «وَرَق» */
    outputFiles: () => ({
      title: state.cover.title || (state.book && state.book.name) || '',
      volumes: [...state.files.entries()].map(([vol, f]) => ({ vol, label: state.book && state.book.volumes.length > 1 ? volumeLabel(vol) : '', pdf: (f.saved && f.saved.pdf) || '', docx: (f.saved && f.saved.docx) || '' })),
      waraq: (state.waraqOut && state.waraqOut.path) || '',
    }),
    /**
     * «حوّله إلى وَرَق» (من الرَّحل): ملف PDF أو Word يُقرأ كما يُقرأ على المنضدة، ويُحفظ كتابَ «وَرَق» في مجلد الكتب.
     * (في منضدةٍ خفية خاصة بذلك، فلا يمسّ ما على المنضدة الظاهرة) ← { path, title }
     */
    async makeWaraq(file, onProgress) {
      if (state.running) throw new Error('المنضدة تعمل الآن');
      restoring = true;
      try {
        resetBench(true);
        showMyBook();
        await loadMyBooks([file]);
      } finally {
        restoring = false;
      }
      if (!state.book) throw new Error('تعذّرت قراءة الملف');
      applyLastStyle();
      await convertBook(onProgress);
      await saveBookFile(true);
      if (!state.doc.file) throw new Error('تعذّر حفظ ملف الكتاب');
      return { path: state.doc.file, title: state.cover.title || state.book.name };
    },
    reset: () => {
      resetBench();
      askKind();
    },
    /** نوع العمل (الكتب، الأبحاث): للمحرِّر */
    kind: () => workKind || (state.book ? (state.book.research ? 'research' : 'books') : ''),
    setKind: (k) => !state.book && setKind(k),
    /** العودة إلى المنضدة من باب آخر: الأساليب قد تغيّرت في «الأساليب» */
    async refreshStyles() {
      if (state.running) return;
      await refreshStyles();
      renderStyleCards();
    },
    /** بحث في «تراث» (من خانة الخزانة) */
    search(q) {
      if (state.running) return toast('المنضدة تعمل الآن');
      if (wordMode) {
        wordMode = false;
        renderSources();
      }
      $('#q').value = q;
      $('#searchForm').requestSubmit();
      window.scrollTo({ top: 0 });
    },
    open: openJob,
    saveAs: saveProjectAs,
    /** «أخرِج الكتاب» (Ctrl+E من القائمة أو القلم) */
    exportBook() {
      if (!state.book) return toast('لا كتاب على المنضدة بعد');
      if (state.running) return toast('المنضدة تُخرج هذا الكتاب الآن');
      if (window.WarraqBenchView) window.WarraqBenchView.open('s5');
      $('#startBtn').click();
    },
    /** القلم: أسلوب دار نشر على الكتاب المفتوح */
    applyStyle(id) {
      const b = $(`#presets [data-preset="${CSS.escape(id)}"]`);
      if (!b) return false;
      if (window.WarraqBenchView) window.WarraqBenchView.open('s3');
      b.click();
      return true;
    },
    /** القلم: تصميمٌ غلافاً خارجياً (يُفتح في استوديو الأغلفة بجانب الخطوات) */
    applyCover(id, name) {
      if (!state.book) return toast('ضع كتاباً على المنضدة أولاً'), false;
      state.outer.mode = 'design';
      state.outer.design = { designId: id, designName: name || '', state: (state.outer.design && state.outer.design.designId === id && state.outer.design.state) || undefined };
      state.outer.tab = 'front';
      saveOuter();
      loadOuterFrame(true);
      renderOuter();
      if (window.WarraqBenchView) window.WarraqBenchView.open('s4');
      autosave();
      return true;
    },
    restore: async (p) => {
      restoring = true;
      try {
        await restoreProject(p);
      } finally {
        restoring = false;
        autosave();
      }
    },
    onProgress: null,
    /** «المحرِّر»: الكتاب الذي على المنضدة كما فهمه المحلّل، وما غيّره المستخدم فيه */
    editor: {
      info() {
        if (!state.book) return null;
        const s = state.settings;
        return {
          id: state.book.id,
          title: state.cover.title || state.book.name,
          author: state.cover.author || '',
          volumes: state.book.volumes.map((v) => ({ vol: String(v.vol), label: state.book.volumes.length > 1 ? volumeLabel(v.vol) : '', pages: v.pages || 0 })),
          running: !!state.running,
          template: s.template,
          look: { body: s.fonts.body, heading: s.fonts.heading, matnColor: s.matnColor, matnBold: s.matnBold, quranColor: s.quranColor, textColor: s.textColor, headingColors: s.headingColors, verseLayout: s.verseLayout, verseSep: s.verseSep, verseSepSymbol: s.verseSepSymbol, verseColor: s.verseColor, ornamentColor: s.ornamentColor, hadithBold: s.hadithBold },
          edits: JSON.parse(JSON.stringify(state.edits)),
          doc: !!state.doc,
          file: (state.doc && state.doc.file) || '',
          from: (deskInfo() || {}).from || '',
        };
      },
      /** ما يحتاجه تنضيد الصفحات في المحرِّر: الإعدادات كاملة، وأسلوب المستخدم، والغلاف */
      /** لون الورق (أبيض أو أصفر): إعدادٌ من إعدادات التنضيد */
      paper: { get: () => state.paper, set: (v) => setPaper(v) },
      /** الهامش الخارجي: { on, odd, box } — on الواسع في طرف الكتاب، odd الصفحة الفردية يسرى (l) أو يمنى (r)، box نص الهامش في خانة (null: كالأسلوب) */
      om: {
        get: () => ({ ...state.om, geom: pageGeom({ ...state.settings, outerMargin: { ...(state.settings.outerMargin || {}), on: true } }), styleBox: !!(state.settings.sideNote && state.settings.sideNote.box) }),
        set: (v) => setOm(v),
      },
      renderInputs() {
        if (!state.book) return null;
        return { settings: currentSettings(), userStyle: userStyleNow() || undefined, cover: { ...state.cover } };
      },
      /** الخطوط المتاحة (خطوط ورّاق، ثم خطوط الجهاز العربية، ثم الأخرى) لقائمة الخط في المحرِّر */
      fonts() {
        return Object.entries(FONTS)
          .filter(([k]) => k !== NAMES_FONT)
          .map(([k, f]) => ({ v: k, label: f.label || k, group: f.system && !f.pinned ? (f.arabic ? 'sys-ar' : 'sys') : 'own' }));
      },
      /** يُصنع كتاب ورق من الكتاب الذي على المنضدة (يُجلب ويُحلَّل مرة واحدة) */
      convert: (onProgress) => convertBook(onProgress),
      /**
       * «احفظ بصيغة…» من المحرِّر: PDF أو Word يُخرجان بأسلوب الكتاب وتعديلاته (بصيغةٍ واحدة، ثم تعود اختيارات الإخراج كما كانت)،
       * و«وَرَق» يُحفظ ملفه (في البرنامج: «حفظ باسم»، وفي الموقع: يُنزَّل) ← { ok, files: [{ name, path?, blob? }] }
       */
      async exportAs(fmt, onProgress) {
        if (!state.book) throw new Error('لا كتاب على المنضدة');
        if (fmt === 'waraq') {
          if (!state.doc) await convertBook();
          const name = (state.cover.title || state.book.name || 'كتاب') + '.waraq';
          if (DESK) {
            const r = await DESK.saveProjectAs(await bookBytes(), name);
            if (!r || !r.path) return { ok: false, cancel: true, files: [] };
            state.doc.file = r.path;
            autosave();
            return { ok: true, files: [{ name: r.path.split(/[\\/]/).pop(), path: r.path }] };
          }
          const bytes = await bookBytes();
          return { ok: true, files: [{ name, blob: new Blob([bytes], { type: 'application/x-warraq-book' }) }] };
        }
        if (fmt !== 'pdf' && fmt !== 'docx') throw new Error('صيغة غير معروفة');
        if (state.running || state.preparing) throw new Error('المنضدة تُخرج هذا الكتاب الآن: انتظر حتى يتمّ');
        const vols = state.book.volumes.filter((v) => state.book.volumes.length <= 1 || state.selected.has(v.vol));
        if (!vols.length) throw new Error('حدّد مجلداً واحداً على الأقل في المنضدة');
        const ids = { pdf: '#outPdf', docx: '#outDocx', waraq: '#outWaraq' };
        const keep = Object.fromEntries(Object.entries(ids).map(([k, q]) => [k, $(q).checked]));
        for (const [k, q] of Object.entries(ids)) $(q).checked = k === fmt;
        let tick = 0;
        // (ما أُخرج قبلُ لا يُعدّ من هذا الحفظ)
        clearFiles();
        try {
          await start();
          // حتى يتمّ الإخراج (والتقدّم للمحرِّر)
          await new Promise((res) => {
            const t = setInterval(() => {
              if (onProgress && state.totals) onProgress({ done: $$('#volRows .vrow:not(.vbook) .st.ok').length, total: $$('#volRows .vrow:not(.vbook)').length, tick: ++tick });
              if (!state.running && !state.preparing) {
                clearInterval(t);
                res();
              }
            }, 400);
          });
        } finally {
          for (const [k, q] of Object.entries(ids)) $(q).checked = keep[k];
          updateZipLabel();
        }
        const files = [];
        for (const f of state.files.values()) {
          const name = `${f.name}.${fmt}`;
          if (f.saved && f.saved[fmt]) files.push({ name, path: f.saved[fmt] });
          else if (f[fmt] instanceof Blob) files.push({ name, blob: f[fmt] });
        }
        return { ok: files.length > 0, files };
      },
      /** المجلد محلَّلاً (بلا تعديلات المستخدم) — يُجلب ويُحلَّل في عامل خلفي، ويُحفظ ما دام الكتاب وخيارات قراءته */
      parse(vol, onProgress) {
        if (!state.book) return Promise.reject(new Error('لا كتاب على المنضدة'));
        if (state.doc) {
          const pv = state.doc.vols.get(String(vol)) || state.doc.vols.values().next().value;
          return pv ? Promise.resolve(pv) : Promise.reject(new Error('المجلد ليس في ملف الكتاب'));
        }
        const v = state.book.volumes.find((x) => String(x.vol) === String(vol)) || state.book.volumes[0];
        const job = workerJob([v]);
        const key = state.book.id + '|' + v.vol + '|' + JSON.stringify(job.parseOpts) + '|' + JSON.stringify(job.volumes);
        if (state.edCache.has(key)) return state.edCache.get(key);
        const pr = new Promise((resolve, reject) => {
          const w = new Worker('/js/fetch.worker.js', { type: 'module' });
          let got = null;
          w.onmessage = (ev) => {
            const m = ev.data;
            if (m.type === 'progress' && onProgress) onProgress({ done: m.done, total: m.total });
            else if (m.type === 'parsing' && onProgress) onProgress({ parsing: true });
            else if (m.type === 'volume') got = m.parsed;
            else if (m.type === 'done') {
              w.terminate();
              got ? resolve(got) : reject(new Error('تعذّر تحليل المجلد'));
            } else if (m.type === 'error') {
              w.terminate();
              reject(new Error(m.message || 'تعذّر الجلب'));
            }
          };
          w.onerror = (e) => {
            w.terminate();
            reject(new Error(e.message || 'خطأ في العامل الخلفي'));
          };
          w.postMessage({ ...job, concurrency: 6 });
        });
        state.edCache.set(key, pr);
        pr.catch(() => state.edCache.delete(key));
        return pr;
      },
      setEdits(edits) {
        state.edits = { v: 1, ops: Array.isArray(edits && edits.ops) ? edits.ops : [] };
        autosave();
        if (DESK) deskTell();
        // المتون: الأجزاء ومواضع التعليق التي حُدّدت في المحرِّر تدخل المعاينة وما يُعرف عن المتن
        if (MU.parsed) {
          refreshMutunData(false);
          preview.update();
        }
        return true;
      },
      /**
       * الأساليب (للمحرِّر): أساليب النوع، والأسلوب الجاري، وتغييره — و«بدون أسلوب»: الكتاب على أصله
       * (تنسيق ملفه إن كان ملف Word، أو الأسلوب الذي كان عليه بتعديلاته قبل أن يُختار له أسلوبٌ هنا).
       * تغيير الأسلوب لا يمسّ ما خُصّ به نصٌّ أو كلمة (المقاس، اللون، الخط…): ذلك في التعديلات، لا في الأسلوب.
       */
      styles: {
        list: () => editorStyles(),
        current: () => editorStyleNow(),
        apply: (id) => editorApplyStyle(id),
      },
      /** خلفيات الصفحات (للمحرِّر): ما اختير، وتغييره بصورة (ملف) أو إزالته */
      bgs: {
        get: () => ({ ...(state.bgs || {}) }),
        async setFile(kind, file) {
          const src = await bgImage(file);
          if (kind === '*') setBgs({ body: src, h1: src, h2: src, toc: src }, 'صورةٌ واحدة خلفيةً للصفحات كلها');
          else if (['body', 'h1', 'h2', 'toc'].includes(kind)) setBgs({ [kind]: src }, 'خلفية ' + BG_NAME[kind]);
          return true;
        },
        clear(kind) {
          if (kind === '*') setBgs({ body: '', h1: '', h2: '', toc: '' }, 'أُزيلت خلفيات الصفحات');
          else if (['body', 'h1', 'h2', 'toc'].includes(kind)) setBgs({ [kind]: '' }, 'أُزيلت خلفية ' + BG_NAME[kind]);
          return true;
        },
      },
      /** المتون (للمحرِّر): هل الكتاب متن، وإعداداته، وتغييرها، وما يُعرف عنه */
      mutun: {
        on: () => mutunOn() && !!state.book,
        get: () => JSON.parse(JSON.stringify(state.mutun)),
        set: (patch) => setMutun(patch || {}),
        ctx: () => muCtx(),
      },
    },
  };
  if (SCRIBE) return;
  // شريط المنضدة (في الهيكل: الترويسة مخفية)
  if (shellOf()) {
    const bar = document.createElement('div');
    bar.className = 'dk-bar';
    bar.innerHTML = `<b id="dkTitle"></b><span class="dk-acts"><button type="button" class="btn quiet" id="dkNew" title="كتاب جديد (Ctrl+N)">كتاب جديد</button><button type="button" class="btn quiet" id="dkOpen" title="فتح كتاب «وَرَق» (‎.waraq‎)، أو ملف Word أو PDF (Ctrl+O)">فتح…</button><button type="button" class="btn quiet" id="dkSave" title="حفظ الكتاب بصيغة «وَرَق»: ملفٌ بنصه وأسلوبه يُفتح بنقرتين ويُخرج بلا اتصال (Ctrl+S)">حفظ الكتاب</button></span>`;
    $('.main').prepend(bar);
    $('#dkNew').addEventListener('click', () => resetBench());
    $('#dkOpen').addEventListener('click', () => DESK.openDialog('bench'));
    $('#dkSave').addEventListener('click', saveProjectAs);
    deskBar();
  }
  // «أرسله إلى النسّاخ»: يُخرج في الخلفية، وتفرغ المنضدة لكتاب آخر
  const scribes = () => {
    try {
      return window.parent.WarraqScribes || null;
    } catch {
      return null;
    }
  };
  if (scribes()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'toScribes';
    b.className = 'btn big quiet';
    b.textContent = 'أرسله إلى النسّاخ';
    b.title = 'يُخرج الكتاب في الخلفية بهذه الإعدادات، وتفرغ المنضدة لكتاب آخر';
    $('#startBtn').after(b);
    b.addEventListener('click', () => {
      if (state.running) return toast('المنضدة تُخرج هذا الكتاب الآن');
      const p = getProject();
      if (!p) return;
      const vols = state.book.volumes.filter((v) => state.book.volumes.length <= 1 || state.selected.has(v.vol));
      if (!vols.length) return toast('حدّد مجلداً واحداً على الأقل');
      if (!anyOut()) return toast('اختر صيغة إخراج واحدة على الأقل: PDF أو Word أو وَرَق');
      scribes().add(p);
      resetBench(true);
      toast(`أُرسل «${p.title}» إلى النسّاخ: يُخرج في الخلفية، والمنضدة لكتاب آخر`, 4200, 'ok');
    });
  }
  // آخر تغيير قبل الإغلاق لا ينتظر مهلة الحفظ
  window.addEventListener('pagehide', () => {
    if (!autoT || restoring) return;
    clearTimeout(autoT);
    DESK.saveCurrent(getProject()).catch(() => {});
  });
  // كل تغيير يدوي على المنضدة يُحفظ
  for (const t of ['input', 'change', 'click']) document.addEventListener(t, (e) => e.isTrusted && state.book && autosave(), true);
  window.addEventListener('message', (e) => e.origin === location.origin && e.data && /^warraq-cover/.test(e.data.type || '') && autosave());
  // الكتاب الذي كان على المنضدة حين أُغلق البرنامج
  if (DESK.loadCurrent)
    DESK.loadCurrent()
      .then(async (p) => {
        if (!p || state.book) return;
        restoring = true;
        try {
          await restoreProject(p);
        } catch (err) {
          toast('تعذّرت إعادة الكتاب الذي كان على المنضدة: ' + err.message, 6000);
        } finally {
          restoring = false;
        }
      })
      .catch(() => {});
  deskTell();
  // دخول المنضدة (من باب آخر) وهي فارغة: «العتبة»؛ وإن كانت المنضدة مفتوحة قبل أن تتم صفحتها: بعد إعادة ما كان عليها
  const openNow = () => {
    const sh = shellOf();
    if (sh && typeof sh.currentDoor === 'function' && sh.currentDoor() === 'bench') askKind();
  };
  if (DESK.loadCurrent) DESK.loadCurrent().then(() => setTimeout(openNow, 400), () => setTimeout(openNow, 400));
  else setTimeout(openNow, 400);
  try {
    window.top.addEventListener('warraq:door', (e) => {
      if (e.detail && e.detail.door === 'bench') setTimeout(() => askKind(), 250);
    });
  } catch {}
}
