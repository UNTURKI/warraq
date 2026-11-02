// صانع الأساليب: يصنع فيه المستخدم (أو المالك) أسلوب إخراج بالنقر — ألوان وخطوط ومقاسات، وأشكال جاهزة لعناصر الكتاب —
// بمعاينة حية من محرك التنضيد نفسه، بلا كود. الأسلوب إعدادات فقط (ومنها settings.design: مفاتيح الأشكال المختارة)،
// والخادم هو الذي يكتب تنسيق الأشكال عند التنضيد (shared/style-parts.js).
//   · عند المستخدم: يُحفظ في متصفحه («أساليبي») ويظهر في صفحة الإخراج، ويُنزَّل بطاقةً.
//   · عند المالك (‎?admin=1‎): يُحفظ في أساليب الموقع فيراه كل المستخدمين.
import { FONTS, ORNAMENTS, MATN_COLORS, STYLE_DEFAULTS, DEFAULT_BOOK_STYLE, styleSettings, registerFonts } from '/shared/presets.js';
import { DESIGN_PARTS, cleanDesign, designCss, PALETTES, paletteSettings, paletteOf, DENSITIES, densityOf } from '/shared/style-parts.js';
import { createPreview } from '/js/preview.js';
import { drawStyleCard } from '/js/style-card-art.js';
import { initMyStyles, loadMyStyles, saveMyStyle, styleOnly, downloadCard, readCardFile, installMyCard, setPick, userStylePayload } from '/js/my-styles.js';
import { parseCardText } from '/shared/card-text.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const Q = new URLSearchParams(location.search);
const EMBED = Q.get('embed') === '1';
// فُتح من «استوديو الأساليب»: الرجوع إليه
const FROM_STUDIO = Q.get('back') === 'studio' || Q.get('back') === 'card';
const STUDIO = Q.get('back') === 'card' ? '/card/' : '/studio/';
let ADMIN = Q.get('admin') === '1';
// برنامج سطح المكتب: لا مستخدمون غير صاحب الجهاز
const DESK = document.documentElement.hasAttribute('data-desktop');
const HEX = /^#[0-9a-f]{6}$/i;

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}

/* ------------------------------------------------------------ الحالة */
// extras / print / fonts: إضافات أسلوبٍ من أساليبي أو من بطاقة رُكّبت (صور، تنسيق، طباعة، خطوط) تبقى معه كما هي،
// وما يُختار هنا من ألوان وخطوط وأشكال يُضاف فوقها
const W = { id: '', name: '', desc: '', base: '', settings: styleSettings({ id: DEFAULT_BOOK_STYLE, settings: {} }), server: null, extras: null, print: null, fonts: [] };
let STYLES = []; // أساليب الموقع (ومعها أساليبي عند المستخدم)
let step = 0;
let savedSnap = '';
let preview = null;
const snap = () => JSON.stringify([W.name, W.desc, W.base, styleOnly(W.settings)]);
const dirty = () => snap() !== savedSnap;

/** إعدادات من مصدر خارجي (بطاقة، تخزين المتصفح): مفاتيح معروفة بقيم سليمة، والباقي من الأصل */
function safeSettings(input) {
  const s = styleSettings({ id: 'x', settings: input && typeof input === 'object' ? input : {} });
  const D = STYLE_DEFAULTS;
  const col = (v, d) => (HEX.test(String(v || '')) ? String(v) : d);
  const num = (v, d, a, b) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
  const txt = (v, d, max) => (typeof v === 'string' && v.trim() ? v.replace(/[<>{}\\"'`;\u0000-\u001f]/g, '').slice(0, max) : d);
  for (const k of ['matnColor', 'quranColor', 'textColor', 'ornamentColor', 'ruleColor']) s[k] = col(s[k], D[k]);
  for (const k of ['quotedColor', 'verseColor', 'basmalaColor']) s[k] = col(s[k], '');
  for (const n of [1, 2, 3, 4]) s.headingColors[n] = col(s.headingColors[n], D.headingColors[n]);
  for (const k of ['body', 'heading', 'cover', 'names']) s.fonts[k] = txt(s.fonts[k], D.fonts[k], 60);
  s.sizes = { body: num(s.sizes.body, 16, 9, 26), note: num(s.sizes.note, 13.5, 7, 22), h1: num(s.sizes.h1, 24, 12, 44), h2: num(s.sizes.h2, 19, 11, 38), h3: num(s.sizes.h3, 17, 10, 32), h4: num(s.sizes.h4, 16, 9, 30) };
  s.page = { w: num(s.page.w, 170, 100, 300), h: num(s.page.h, 240, 140, 420), side: num(s.page.side, 20, 6, 45), top: num(s.page.top, 18, 6, 50), bottom: num(s.page.bottom, 14, 6, 50) };
  s.lineHeight = num(s.lineHeight, 1.85, 1.2, 2.8);
  s.noteLineHeight = num(s.noteLineHeight, 1.6, 1.1, 2.6);
  s.ornament = txt(s.ornament, D.ornament, 24);
  s.matnBrackets = ['()', '«»', '[]', '{}', 'none'].includes(s.matnBrackets) ? s.matnBrackets : '()';
  s.design = cleanDesign(s.design);
  return s;
}

/* ------------------------------------------------------------ عيّنات الاختيار */
const LN = (n, short = true) => Array.from({ length: n }, (_, i) => `<i class="ln${short && i === n - 1 ? ' s' : ''}"></i>`).join('');
const PAGE = (inner) => `<section class="page content"><div class="rh">عنوان الكتاب</div><div class="body">${inner}</div><div class="folio">١٢</div></section>`;
const TOCE = (t, n, l) => `<div class="toc-e l${l}"><span class="t">${t}</span><span class="ld">${'. '.repeat(60)}</span><span class="n">${n}</span></div>`;
// صفحة مصغَّرة للعيّنات التي تُرى فيها الصفحة كلها (الإطار، الغلاف): ٧٠×٩٩ مم بهوامش تناسبها
const MINI = { side: 10, top: 16, bottom: 8 };
const MINI_PAGE = (inner) => `<section class="page content mini"><div class="rh">عنوان الكتاب</div><div class="body">${inner}</div><div class="folio">١٢</div></section>`;
// w, h: مقاس العيّنة (مم) · k: تصغيرها · x: إزاحة تُظهر وسط الصفحة (مم) · S: إعدادات خاصة بالعيّنة
const SPEC = {
  h1: { w: 84, h: 36, k: 0.6, cls: 'pad mid', html: () => '<div class="h1">باب الطهارة</div>' },
  h2: { w: 84, h: 22, k: 0.6, cls: 'pad mid', html: () => '<div class="h2">فصل في المياه</div>' },
  h3: { w: 84, h: 19, k: 0.6, cls: 'pad mid', html: () => '<div class="h3">أقسام المياه</div>' },
  frame: { w: 70, h: 99, k: 0.46, S: { page: MINI }, html: () => MINI_PAGE('<div class="h2">باب</div>' + LN(9)) },
  head: { w: 96, h: 32, k: 0.6, x: 37, html: () => PAGE(LN(14)) },
  folio: { w: 170, h: 30, k: 0.5, cls: 'bot', html: () => PAGE(LN(34, false)) },
  orn: { w: 84, h: 25, k: 0.6, cls: 'pad', html: (S) => LN(1, false) + `<div class="orn">${esc(S.ornament)}</div>` + LN(1) },
  matn: { w: 96, h: 46, k: 0.55, cls: 'pad', html: () => '<p class="p mt">الكلام هو اللفظ المركب المفيد،</p><p class="p mt">وأقسامه ثلاثة: اسم وفعل وحرف.</p><div class="shrule"></div>' + LN(2) },
  notes: { w: 96, h: 30, k: 0.55, cls: 'pad', html: () => LN(2, false) + '<div class="notes"><div class="fnsep"></div><div class="fn">(١) حاشية في أسفل الصفحة.</div></div>' },
  para: { w: 96, h: 50, k: 0.55, cls: 'pad', html: () => '<p class="p first">هذه فقرة أولى من نص الكتاب، وسطرها الأول يبدأ من هنا.</p><p class="p first">وهذه فقرة ثانية تليها في الصفحة.</p>' },
  toc: { w: 96, h: 32, k: 0.55, cls: 'pad', html: () => TOCE('كتاب الطهارة', '٥', 1) + TOCE('باب المياه', '٧', 2) + TOCE('باب الآنية', '١٢', 2) },
  cover: { w: 70, h: 99, k: 0.46, html: (S) => `<section class="page cover mini"><div class="body"><div class="cover-frame"><div class="cover-in"><div></div><div><div class="cv-title">عنوان الكتاب</div><div class="cv-orn">${esc(S.ornament)}</div><div class="cv-author">اسم المؤلف</div></div><div class="cv-bottom">دار النشر</div></div></div></div></section>` },
};
/** اللوحة التي يظهر فيها أثر كل مجموعة في المعاينة */
const VIEW_OF = { h1: 'heads', h2: 'heads', h3: 'heads', frame: 'heads', head: 'sharhPage', folio: 'heads', orn: 'sharhOrn', matn: 'sharhPage', notes: 'heads', para: 'heads', toc: 'toc', cover: 'cover' };

function tile(g, o, label) {
  const sp = SPEC[g];
  const on = (W.settings.design[g] || 'default') === o;
  return `<button type="button" class="mk-tile" data-g="${g}" data-o="${o}" aria-pressed="${on}">
    <span class="mk-spec" style="width:${(sp.w * sp.k).toFixed(2)}mm;height:${(sp.h * sp.k).toFixed(2)}mm"><span class="sp ${sp.cls || ''} sp-${g}-${o}" style="width:${sp.x ? sp.w + 2 * sp.x : sp.w}mm;height:${sp.h}mm;transform:scale(${sp.k});${sp.x ? `right:-${(sp.x * sp.k).toFixed(2)}mm` : ''}">${sp.html(W.settings)}</span></span>
    <b>${esc(label)}</b></button>`;
}
const group = (g, extra = '') => {
  const p = DESIGN_PARTS[g];
  return `<div class="mk-group" data-group="${g}"><h3>${esc(p.label)} <small>${esc(p.hint)}</small></h3>${extra}<div class="mk-tiles">${Object.entries(p.opts).map(([o, label]) => tile(g, o, label)).join('')}</div></div>`;
};
/** تنسيق العيّنات كلها (كل اختيار في نطاق عيّنته)، ومتغيرات الألوان والخطوط من الإعدادات الجارية */
function paintSpecs() {
  const S = W.settings;
  let css = '.sp.bot .page { position: absolute; bottom: 0; right: 0; }\n';
  for (const [g, p] of Object.entries(DESIGN_PARTS)) for (const o of Object.keys(p.opts)) if (o !== 'default') css += designCss({ [g]: o }, { ...S, ...(SPEC[g].S || {}) }, `.sp-${g}-${o}`) + '\n';
  $('#mkSpecCss').textContent = css;
  const root = $('#mkPanel').style;
  const fam = (f) => `'${String(f).replace(/['"\\]/g, '')}', 'Adwa Assalaf', 'Amiri', serif`;
  const vars = { '--c-text': S.textColor, '--c-h1': S.headingColors[1], '--c-h2': S.headingColors[2], '--c-h3': S.headingColors[3], '--c-matn': S.matnColor, '--c-quran': S.quranColor, '--c-orn': S.ornamentColor, '--c-rule': S.ruleColor, '--f-body': fam(S.fonts.body), '--f-heading': fam(S.fonts.heading), '--f-cover': fam(S.fonts.cover), '--m-top': S.page.top + 'mm', '--m-bottom': S.page.bottom + 'mm', '--m-side': S.page.side + 'mm' };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
}
/** خط من خطوط Google المعروفة للموقع: يُحمَّل عند اختياره (لتظهر به العيّنات) */
const loadedFonts = new Set();
function ensureFont(f) {
  const g = FONTS[f] && FONTS[f].google;
  if (!g || loadedFonts.has(f)) return;
  loadedFonts.add(f);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${g}&display=swap`;
  document.head.appendChild(l);
}

/* ------------------------------------------------------------ الخطوات */
const get = (path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), W.settings);
function set(path, v) {
  const ks = path.split('.');
  let o = W.settings;
  for (const k of ks.slice(0, -1)) o = o[k];
  o[ks[ks.length - 1]] = v;
}
const colorF = (k, label) => `<label><input type="color" data-k="${k}" value="${esc(get(k) || '#000000')}"> ${label}</label>`;
const rangeF = (k, label, min, max, st, unit) => `<label class="mk-range"><span>${label} <b data-out="${k}">${ar(get(k))}${unit}</b></span><input type="range" data-k="${k}" data-unit="${unit}" min="${min}" max="${max}" step="${st}" value="${get(k)}"></label>`;
const fontF = (k, label) =>
  `<label>${label}<select data-k="${k}">${[...new Set([...Object.keys(FONTS), get(k)])].map((f) => `<option value="${esc(f)}" ${f === get(k) ? 'selected' : ''}>${esc((FONTS[f] && FONTS[f].label) || f)}${FONTS[f] && FONTS[f].uploaded && !FONTS[f].system ? ' ★' : ''}</option>`).join('')}</select></label>`;

const STEPS = [
  {
    key: 'start',
    title: 'البداية',
    view: 'heads',
    html: () => `<h2>ابدأ من أسلوب</h2><p class="lead">اختر أسلوباً قريباً مما تريد، ثم غيّر فيه ما شئت في الخطوات التالية. المعاينة بجانبك تتغير مع كل اختيار.</p>
      <div class="mk-cards">${STYLES.map((st) => `<button type="button" class="mk-card" data-base="${esc(st.id)}" aria-pressed="${W.from === st.id}" title="${esc(st.desc || st.name)}"><span class="art"><canvas width="300" height="300"></canvas></span><b>${esc(st.name)}</b>${st.mine ? '<small>من صنعي</small>' : ''}</button>`).join('')}
        <button type="button" class="mk-card add" data-import title="ضع بطاقة أسلوب (صورتها PNG أو ملفها): تُركَّب ثم تعدّلها هنا"><span class="art"><svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true"><path d="M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4H3a2 2 0 0 1 0-4h2V6a1 1 0 0 1 1-1h4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span><b>ركّب بطاقة أسلوب</b></button></div>
      ${W.extras || W.fonts.length || W.print ? '<p class="mk-note">لهذا الأسلوب إضافات من بطاقته (صور أو تنسيق أو طباعة أو خطوط): تبقى معه كما هي، وما تختاره هنا يُضاف فوقها. ولتعديلها نفسها افتح المحرر الكامل.</p>' : ''}
      ${W.baseExtras ? `<p class="mk-note">هذا الأسلوب يحمل إضافات خاصة به (زخارف أو صور أو تنسيق من بطاقته): ${ADMIN ? 'تُنسخ إلى أسلوبك الجديد.' : 'تبقى معه ما دام أسلوبه الأصلي في ورّاق، وما تختاره هنا يُضاف فوقها.'}</p>` : ''}`,
  },
  {
    key: 'colors',
    title: 'الألوان',
    view: 'heads',
    html: () => {
      const cur = paletteOf(W.settings);
      return `<h2>الألوان</h2><p class="lead">لوحة جاهزة تلوّن العناوين والمتن والآيات والزخارف معاً، ولك أن تعدّل كل لون بعدها.</p>
      <div class="mk-pals">${PALETTES.map((p) => `<button type="button" class="mk-pal" data-pal="${p.id}" aria-pressed="${cur === p.id}"><span class="sws">${[p.c.h1, p.c.h2, p.c.matn, p.c.quran, p.c.orn].map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>${esc(p.name)}</b></button>`).join('')}</div>
      <div class="mk-group"><h3>تعديل الألوان <small>كل لون وحده</small></h3>
        <div class="mk-colors">${colorF('headingColors.1', 'الأبواب')}${colorF('headingColors.2', 'الفصول')}${colorF('headingColors.3', 'العناوين الفرعية')}${colorF('matnColor', 'المتن')}${colorF('quranColor', 'الآيات')}${colorF('ornamentColor', 'الزخارف')}${colorF('ruleColor', 'الخطوط والإطارات')}${colorF('textColor', 'نص الكتاب')}</div></div>`;
    },
  },
  {
    key: 'type',
    title: 'الخط والمقاس',
    view: 'heads',
    html: () => {
      const cur = densityOf(W.settings);
      return `<h2>الخط والمقاس</h2><p class="lead">خط النص وخط العناوين، ثم كثافة الصفحة: حجم الخط وتباعد الأسطر والهوامش معاً.</p>
      <div class="mk-fields">${fontF('fonts.body', 'خط النص')}${fontF('fonts.heading', 'خط العناوين')}${fontF('fonts.cover', 'خط عنوان الغلاف')}</div>
      <div class="mk-group"><h3>كثافة الصفحة</h3>
        <div class="mk-chips">${DENSITIES.map((d) => `<button type="button" class="mk-chip" data-den="${d.id}" aria-pressed="${cur === d.id}" title="${esc(d.hint)}">${esc(d.name)} <small>— ${esc(d.hint)}</small></button>`).join('')}</div>
        <div class="mk-fields" style="margin-top:12px">${rangeF('sizes.body', 'حجم خط النص', 12, 20, 0.5, ' نقطة')}${rangeF('lineHeight', 'تباعد الأسطر', 1.5, 2.3, 0.05, '')}${rangeF('page.side', 'الهامش الجانبي', 12, 30, 1, ' مم')}${rangeF('sizes.h1', 'حجم عنوان الباب', 16, 34, 0.5, ' نقطة')}</div></div>`;
    },
  },
  {
    key: 'heads',
    title: 'العناوين',
    view: 'heads',
    html: () => `<h2>شكل العناوين</h2><p class="lead">اختر لكل مستوى شكله. الألوان والخط من اختيارك السابق.</p>${group('h1')}${group('h2')}${group('h3')}`,
  },
  {
    key: 'page',
    title: 'الصفحة',
    view: 'heads',
    html: () => `<h2>شكل الصفحة</h2><p class="lead">الإطار والترويسة ورقم الصفحة وخط الحواشي وبداية الفقرات.</p>${group('frame')}${group('head')}${group('folio')}${group('notes')}${group('para')}`,
  },
  {
    key: 'parts',
    title: 'التفاصيل',
    view: 'sharhOrn',
    html: () => `<h2>التفاصيل</h2><p class="lead">الفاصل الزخرفي، والمتن في كتب الشروح، والفهرس، والغلاف الداخلي.</p>
      ${group('orn', `<div class="mk-chips">${[...new Set([...ORNAMENTS, W.settings.ornament])].map((o) => `<button type="button" class="mk-chip" data-orn="${esc(o)}" aria-pressed="${o === W.settings.ornament}">${esc(o)}</button>`).join('')}</div>`)}
      ${group('matn', `<div class="mk-chips">${MATN_COLORS.map((c) => `<button type="button" class="mk-chip" data-matn="${c.v}" aria-pressed="${String(W.settings.matnColor).toLowerCase() === c.v.toLowerCase()}"><i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c.v};vertical-align:-1px"></i> ${esc(c.label)}</button>`).join('')}</div>
        <label class="mk-check"><input type="checkbox" data-k="matnBold" ${W.settings.matnBold ? 'checked' : ''}> المتن بخط عريض</label>
        <label class="mk-check" style="margin-inline-start:14px">أقواس المتن داخل الشرح <select data-k="matnBrackets">${[['()', '( )'], ['«»', '« »'], ['[]', '[ ]'], ['{}', '{ }'], ['none', 'بلا أقواس']].map(([v, t]) => `<option value="${v}" ${W.settings.matnBrackets === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`)}
      ${group('toc')}${group('cover')}`,
  },
  {
    key: 'save',
    title: 'الحفظ',
    view: 'cover',
    html: () => {
      const d = W.settings.design;
      const chosen = Object.entries(DESIGN_PARTS).filter(([g]) => d[g]);
      return `<h2>الاسم والحفظ</h2><p class="lead">${ADMIN ? `يُحفظ في أساليب دار النشر، فيظهر ${DESK ? '' : 'لكل المستخدمين '}في صفحة الإخراج (وتعدّله بعد ذلك من «أساليب دار النشر» أو من هنا).` : 'يُحفظ عندك، ويظهر مع أساليب دار النشر في صفحة الإخراج. ونزّل بطاقته لتحتفظ به أو تنقله إلى جهاز آخر.'}</p>
      <div class="mk-fields"><label>اسم الأسلوب<input type="text" id="mkName2" maxlength="60" value="${esc(W.name)}" placeholder="مثل: أسلوب مكتبتي"></label>
        <label>وصف قصير (اختياري)<input type="text" id="mkDesc" maxlength="200" value="${esc(W.desc)}" placeholder="يظهر تحت اسم الأسلوب"></label></div>
      <div class="mk-group"><h3>ما اخترته <small>${chosen.length ? '' : 'لم تغيّر شكلاً من الأشكال: الأسلوب بألوانه وخطوطه فقط'}</small></h3>
        <ul class="mk-sum">${chosen.map(([g, p]) => `<li><span>${esc(p.label)}</span><b>${esc(p.opts[d[g]])}</b></li>`).join('')}
          <li><span>خط النص</span><b>${esc((FONTS[W.settings.fonts.body] && FONTS[W.settings.fonts.body].label) || W.settings.fonts.body)}</b></li>
          <li><span>حجم النص</span><b>${ar(W.settings.sizes.body)} نقطة</b></li></ul></div>
      <div class="mk-save-row"><button class="btn primary big" type="button" data-save>${W.id ? 'حفظ التعديل' : 'حفظ الأسلوب'}</button><button class="btn big" type="button" data-export>⬇ تنزيل بطاقته</button></div>
      <p class="mk-note">الأسلوب من صنعك إعدادات فقط (لا كود فيه)، فهو آمن في أي نسخة من ورّاق. ${ADMIN || DESK ? '' : 'ولصاحب الموقع أن يركّب بطاقتك في «أساليب دار النشر» فيراها الجميع.'}</p>`;
    },
  },
];

function renderSteps() {
  $('#mkSteps').innerHTML = STEPS.map((s, i) => `<button type="button" data-step="${i}" ${i === step ? 'aria-current="step"' : ''} class="${i < step ? 'done' : ''}"><i>${ar(i + 1)}</i>${s.title}</button>`).join('');
  $('#mkPrev').disabled = step === 0;
  $('#mkNext').hidden = step === STEPS.length - 1;
}
function renderPanel() {
  const p = $('#mkPanel');
  p.innerHTML = STEPS[step].html();
  paintSpecs();
  if (STEPS[step].key === 'start') {
    for (const st of STYLES) {
      const cv = $(`.mk-card[data-base="${CSS.escape(st.id)}"] canvas`, p);
      if (cv) drawStyleCard(cv, st).catch(() => {});
    }
  }
}
function go(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  renderSteps();
  renderPanel();
  if (preview) preview.setView(STEPS[step].view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
/** بعد كل تغيير: العيّنات بألوانها الجديدة، والمعاينة، وعلامة «لم يُحفظ» */
function changed(view, rerender = false) {
  if (rerender) renderPanel();
  else paintSpecs();
  $('#mkDirty').hidden = !dirty();
  if (preview) {
    if (view) preview.setView(view);
    preview.update();
  }
}

/** بدء العمل من أسلوب (من الموقع، أو من أساليبي) */
function startFrom(st, { keepName = false } = {}) {
  W.from = st.id;
  // إضافات أسلوب الموقع (زخارفه وصوره) تبقى معه: الأسلوب الجديد يشير إليه. وأسلوب «من صنعي» يحمل أصله
  W.base = st.mine ? st.base || '' : st.id;
  const origin = STYLES.find((x) => x.id === W.base && !x.mine);
  W.baseExtras = !!(origin && (origin.extras === true || (origin.extras && typeof origin.extras === 'object' && hasX(origin.extras))));
  W.settings = safeSettings(st.settings);
  // أسلوبٌ من أساليبي: إضافاته تبقى معه
  W.extras = st.mine && st.extras ? JSON.parse(JSON.stringify(st.extras)) : null;
  W.print = st.mine && st.print ? JSON.parse(JSON.stringify(st.print)) : null;
  W.fonts = st.mine && st.fonts ? st.fonts : [];
  if (!keepName) {
    W.name = '';
    W.desc = '';
    $('#mkName').value = '';
  }
  for (const f of Object.values(W.settings.fonts)) ensureFont(f);
}
const hasX = (x) => !!((x.css && x.css.trim()) || (x.script && x.script.trim()) || Object.keys(x.images || {}).length || Object.keys(x.templates || {}).length || (x.pages || []).length);

/* ------------------------------------------------------------ الأحداث */
$('#mkSteps').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (b) go(+b.dataset.step);
});
$('#mkPrev').addEventListener('click', () => go(step - 1));
$('#mkNext').addEventListener('click', () => go(step + 1));
$('#mkPanel').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.g) {
    const d = { ...W.settings.design };
    if (t.dataset.o === 'default') delete d[t.dataset.g];
    else d[t.dataset.g] = t.dataset.o;
    W.settings.design = cleanDesign(d);
    $$(`.mk-tile[data-g="${t.dataset.g}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    return changed(VIEW_OF[t.dataset.g]);
  }
  if (t.dataset.base) {
    const st = STYLES.find((x) => x.id === t.dataset.base);
    if (!st) return;
    startFrom(st, { keepName: !!W.name });
    return changed('heads', true);
  }
  if (t.dataset.import !== undefined) return $('#mkFile').click();
  if (t.dataset.pal) {
    Object.assign(W.settings, JSON.parse(JSON.stringify(paletteSettings(PALETTES.find((p) => p.id === t.dataset.pal)))));
    return changed('heads', true);
  }
  if (t.dataset.den) {
    const v = JSON.parse(JSON.stringify(DENSITIES.find((d) => d.id === t.dataset.den).v));
    W.settings.sizes = { ...W.settings.sizes, ...v.sizes };
    W.settings.page = { ...W.settings.page, ...v.page };
    W.settings.lineHeight = v.lineHeight;
    W.settings.noteLineHeight = v.noteLineHeight;
    return changed('heads', true);
  }
  if (t.dataset.orn) {
    W.settings.ornament = t.dataset.orn;
    return changed('sharhOrn', true);
  }
  if (t.dataset.matn) {
    W.settings.matnColor = t.dataset.matn;
    return changed('sharhPage', true);
  }
  if (t.dataset.save !== undefined) return save();
  if (t.dataset.export !== undefined) return exportCard();
});
$('#mkPanel').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'mkName2') {
    W.name = t.value;
    $('#mkName').value = t.value;
    $('#mkName').classList.remove('bad');
    $('#mkDirty').hidden = !dirty();
    return;
  }
  if (t.id === 'mkDesc') {
    W.desc = t.value;
    $('#mkDirty').hidden = !dirty();
    return;
  }
  const k = t.dataset.k;
  if (!k) return;
  if (t.type === 'color') {
    if (!HEX.test(t.value)) return;
    set(k, t.value);
    $$('.mk-pal').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pal === paletteOf(W.settings))));
    return changed(k === 'matnColor' ? 'sharhPage' : 'heads');
  }
  if (t.type === 'range') {
    const v = Number(t.value);
    set(k, v);
    // حجم النص يحمل معه الحاشية والعناوين الأصغر بنسبتها
    if (k === 'sizes.body') {
      const z = W.settings.sizes;
      z.note = Math.round(v * 0.845 * 2) / 2;
      z.h2 = Math.round(v * 1.19 * 2) / 2;
      z.h3 = Math.round(v * 1.06 * 2) / 2;
      z.h4 = v;
    }
    const out = $(`[data-out="${k}"]`);
    if (out) out.textContent = ar(v) + (t.dataset.unit || '');
    $$('.mk-chip[data-den]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.den === densityOf(W.settings))));
    return changed('heads');
  }
});
$('#mkPanel').addEventListener('change', (e) => {
  const t = e.target;
  const k = t.dataset.k;
  if (!k) return;
  if (t.tagName === 'SELECT') {
    set(k, t.value);
    if (k.startsWith('fonts.')) ensureFont(t.value);
    return changed(k === 'matnBrackets' ? 'sharhPage' : k === 'fonts.cover' ? 'cover' : 'heads');
  }
  if (t.type === 'checkbox') {
    set(k, t.checked);
    return changed('sharhPage');
  }
});
$('#mkName').addEventListener('input', (e) => {
  W.name = e.target.value;
  e.target.classList.remove('bad');
  const n2 = $('#mkName2');
  if (n2) n2.value = W.name;
  $('#mkDirty').hidden = !dirty();
});
$('#mkSave').addEventListener('click', () => save());
$('#mkExport').addEventListener('click', () => exportCard());
$('#mkFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) installCard(f);
});
/** «ركّب بطاقة أسلوب»: البطاقة (صورة أو ملف أو نص) تُركَّب أسلوباً ثم تُفتح هنا للتعديل */
async function installCard(f) {
  try {
    let card;
    try {
      card = await readCardFile(f);
    } catch (err) {
      const r = f.size < 3e6 ? parseCardText(await f.text()) : null;
      if (!r) throw err;
      card = r.card;
    }
    if (ADMIN) {
      // في أساليب الموقع: يركّبها الخادم (والكود بموافقة صريحة)، ثم تُعدَّل هنا
      let st;
      try {
        st = await adminApi('POST', '/api/admin/styles/import', { card });
      } catch (err) {
        if (!/برنامج|كود/.test(err.message) || !confirm(err.message + '\n\nتركيب البطاقة بكودها؟')) throw err;
        st = await adminApi('POST', '/api/admin/styles/import', { card, allowScript: true });
      }
      STYLES = [...STYLES.filter((x) => x.id !== st.id), { ...st, mine: false }];
      startFrom(st);
      W.id = st.id;
      W.server = st;
      W.base = st.id;
      W.name = st.name;
      W.desc = st.desc || '';
      $('#mkName').value = W.name;
      savedSnap = snap();
      toast(`رُكّبت البطاقة «${st.name}» في أساليب دار النشر: عدّلها الآن` + ((st.notes || []).length ? ' — وعليها ملاحظات: ' + st.notes.slice(0, 2).join('؛ ') : ''), 7000);
    } else {
      const { style, notes } = await installMyCard(card);
      STYLES = [...STYLES.filter((x) => !x.mine), ...loadMyStyles()];
      startFrom(style);
      W.id = style.id;
      W.name = style.name;
      W.desc = style.desc || '';
      $('#mkName').value = W.name;
      savedSnap = snap();
      toast(`رُكّبت البطاقة «${style.name}» في أساليبك: عدّلها الآن` + (notes.length ? ' — وعليها ملاحظات: ' + notes.slice(0, 2).join('؛ ') : ''), 7000);
    }
    for (const ff of Object.values(W.settings.fonts)) ensureFont(ff);
    go(1);
    changed('heads');
  } catch (err) {
    toast(err.message, 6000);
  }
}

function needName() {
  W.name = (W.name || '').trim();
  if (W.name) return true;
  $('#mkName').classList.add('bad');
  $('#mkName').focus();
  toast('اكتب اسم الأسلوب أولاً');
  return false;
}
function exportCard() {
  if (!needName()) return;
  downloadCard({ name: W.name, desc: W.desc, base: W.base, settings: W.settings, extras: W.extras, print: W.print, fonts: W.fonts });
}
async function adminApi(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-warraq': '1' }, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || 'تعذّر الحفظ (HTTP ' + r.status + ')');
  return j;
}
async function save() {
  if (!needName()) return;
  const btns = $$('#mkSave, [data-save]');
  btns.forEach((b) => (b.disabled = true));
  try {
    let id;
    if (ADMIN) {
      // أسلوب في الموقع: الجديد ينسخ إضافات أصله وإعداد طباعته، والمعدَّل يحفظ ما عنده منها
      const src = W.server || STYLES.find((x) => x.id === W.base) || {};
      const style = { name: W.name, desc: W.desc, hidden: !!(W.server && W.server.hidden), settings: styleOnly(W.settings), extras: src.extras && typeof src.extras === 'object' ? src.extras : undefined, print: src.print || undefined };
      const r = W.id ? await adminApi('PUT', '/api/admin/styles/' + encodeURIComponent(W.id), { style }) : await adminApi('POST', '/api/admin/styles', { style });
      id = r.id || W.id;
      W.id = id;
      W.server = r;
    } else {
      const st = await saveMyStyle({ id: W.id, name: W.name, desc: W.desc, base: W.base, settings: W.settings, extras: W.extras, print: W.print, fonts: W.fonts });
      id = st.id;
      W.id = id;
      setPick(id);
    }
    savedSnap = snap();
    $('#mkDirty').hidden = true;
    toast(ADMIN ? `حُفظ «${W.name}» في أساليب دار النشر` : `حُفظ «${W.name}» في أساليبك`);
    if (FROM_STUDIO) setTimeout(() => ((leaving = true), (location.href = studioUrl(id))), 700);
    else if (EMBED) parent.postMessage({ warraq: 'maker', type: 'saved', id }, location.origin);
    else if (ADMIN) setTimeout(() => ((leaving = true), (location.href = '/studio/')), 900);
    else {
      $('#mkBack').textContent = '→ إلى صفحة الإخراج';
      if (step === STEPS.length - 1) renderPanel();
    }
  } catch (err) {
    toast(err.message, 5000);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}
const studioUrl = (id) => STUDIO + (EMBED ? '?embed=1' : '') + (id ? '#/edit/' + id : '');
$('#mkBack').addEventListener('click', (e) => {
  if (dirty() && !confirm('في الأسلوب تغييرات لم تُحفظ. الخروج بلا حفظ؟')) return e.preventDefault();
  savedSnap = snap();
  if (FROM_STUDIO) return;
  if (EMBED) {
    e.preventDefault();
    parent.postMessage({ warraq: 'maker', type: 'close' }, location.origin);
  }
});
let leaving = false; // انتقال بعد الحفظ: بلا سؤال
window.addEventListener('beforeunload', (e) => {
  if (!leaving && dirty() && !EMBED) e.preventDefault();
});

/* ------------------------------------------------------------ البدء */
async function init() {
  if (EMBED) document.body.classList.add('embed');
  const j = (u, o) => fetch(u, { cache: 'no-store', credentials: 'same-origin', ...o }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [fonts, adminStyles, pub] = await Promise.all([j('/api/fonts'), ADMIN ? j('/api/admin/styles') : null, j('/api/styles')]);
  if (fonts && Array.isArray(fonts.fonts)) registerFonts(fonts.fonts);
  if (ADMIN && !(adminStyles && Array.isArray(adminStyles.styles))) {
    ADMIN = false; // ليس مالكاً (أو انتهت جلسته): يعمل الصانع كما عند المستخدم
    toast('لم تُفتح جلسة المالك: الأسلوب يُحفظ في أساليبك فقط', 5000);
  }
  await initMyStyles().catch(() => []);
  const site = ADMIN ? adminStyles.styles : (pub && pub.styles) || [];
  STYLES = [...site.map((s) => ({ ...s, mine: false })), ...(ADMIN ? [] : loadMyStyles())];
  if (!STYLES.length) STYLES = [{ id: DEFAULT_BOOK_STYLE, name: 'المُذهَّب', desc: '', settings: {}, mine: false }];
  $('#mkMode').textContent = ADMIN ? 'أسلوب جديد في أساليب دار النشر' + (DESK ? '' : ' — يراه كل المستخدمين') : 'اصنع أسلوب إخراج كتابك بالنقر، بلا كود';
  $('#mkBack').href = FROM_STUDIO ? studioUrl() : ADMIN ? '/studio/' : '/app/';
  if (ADMIN || FROM_STUDIO) $('#mkBack').textContent = '→ استوديو الأساليب';
  // المحرر الكامل لهذا الأسلوب (صور، تنسيق، قوالب، صفحات خاصة، طباعة، خطوط)
  $('#mkFull').addEventListener('click', (e) => {
    e.preventDefault();
    if (!W.id) return toast('احفظ الأسلوب أولاً، ثم افتحه في المحرر الكامل');
    if (dirty() && !confirm('في الأسلوب تغييرات لم تُحفظ. فتح المحرر الكامل بلا حفظها؟')) return;
    savedSnap = snap();
    location.href = studioUrl(W.id) + (ADMIN ? '' : '');
  });
  // تعديل أسلوب موجود (id)، أو البدء من أسلوب (from)، أو من الأول
  const edit = STYLES.find((s) => s.id === Q.get('id'));
  const from = STYLES.find((s) => s.id === Q.get('from')) || STYLES[0];
  if (edit && (ADMIN || edit.mine)) {
    startFrom(edit);
    W.id = edit.id;
    W.name = edit.name;
    W.desc = edit.desc || '';
    if (ADMIN) {
      W.server = edit;
      W.base = edit.id;
    }
    $('#mkName').value = W.name;
    step = 1;
  } else startFrom(from);
  savedSnap = snap();
  preview = createPreview($('#mkPreview'), {
    title: 'معاينة حية',
    view: 'heads',
    // إضافات أسلوب الموقع الذي بدأ منه (base) يطبّقها الخادم بمعرّفه
    getSettings: () => ({ ...JSON.parse(JSON.stringify(W.settings)), template: 'full', preset: W.base || DEFAULT_BOOK_STYLE, styleId: W.base || '' }),
    // إضافات أسلوبٍ من أساليبي (أو بطاقة رُكّبت فيها)
    getUserStyle: () => (ADMIN ? null : userStylePayload({ mine: true, extras: W.extras, print: W.print, fonts: W.fonts })),
  });
  renderSteps();
  renderPanel();
}
init();
