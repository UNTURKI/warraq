// أجزاء التصميم الجاهزة: أشكال معدّة لعناصر الكتاب (عنوان الباب، إطار الصفحة، رقم الصفحة…) يُختار منها بالنقر في «صانع الأساليب».
// الاختيارات تُحفظ في إعدادات الأسلوب (settings.design = { h1: 'box', frame: 'double', … }) — مفاتيح معروفة فقط، لا CSS من المستخدم.
// والخادم هو الذي يكتب التنسيق من هذه المفاتيح عند التنضيد (designCss)، فيصنع المستخدم أسلوبه بلا كود وبلا خطر.
// الألوان والخطوط والمقاسات من إعدادات الأسلوب نفسها (متغيرات ‎--c-h1‎ ‎--c-rule‎… في مستند الطباعة)، فكل شكل يتبع ألوان أسلوبه.

/** المجموعات واختياراتها (الأول في كل مجموعة هو الأصل: لا يُكتب له تنسيق) */
export const DESIGN_PARTS = {
  h1: {
    label: 'عنوان الباب',
    hint: 'المستوى الأول: «كتاب…» و«باب…»',
    opts: { default: 'خط قصير تحته', plain: 'بلا زينة', lines: 'بين خطين', box: 'في إطار', band: 'شريط ملوّن', orn: 'بين زخرفتين', side: 'شريط جانبي' },
  },
  h2: {
    label: 'عنوان الفصل',
    hint: 'المستوى الثاني',
    opts: { default: 'في الوسط', start: 'في أول السطر', underline: 'خط تحته', side: 'شريط جانبي', orn: 'بين رمزين', tint: 'خلفية خفيفة' },
  },
  h3: {
    label: 'العنوان الفرعي',
    hint: 'المستوى الثالث',
    opts: { default: 'في أول السطر', center: 'في الوسط', underline: 'خط تحته', side: 'شريط جانبي', dot: 'رمز قبله' },
  },
  frame: {
    label: 'إطار الصفحة',
    hint: 'حول النص في صفحات الكتاب والفهرس',
    opts: { default: 'بلا إطار', line: 'خط واحد', double: 'خطان', thick: 'سميك ورفيع', corners: 'زوايا', bars: 'خط أعلى وخط أسفل' },
  },
  head: {
    label: 'ترويسة الصفحة',
    hint: 'اسم الكتاب أو الباب في أعلى الصفحة',
    opts: { default: 'خط تحتها', plain: 'بلا خط', double: 'خطان', dots: 'خط منقّط', tint: 'خلفية خفيفة' },
  },
  folio: {
    label: 'رقم الصفحة',
    hint: 'في أسفل الصفحة',
    opts: { default: 'في الوسط', dashes: 'بين شرطتين', dots: 'بين نقطتين', circle: 'في دائرة', box: 'في مربع', outer: 'في الطرف الخارجي' },
  },
  orn: {
    label: 'الفاصل الزخرفي',
    hint: 'بين الأقسام وبعد الشروح',
    opts: { default: 'رموز', lines: 'رموز بين خطين', rule: 'خط قصير', big: 'رموز كبيرة' },
  },
  matn: {
    label: 'المتن أعلى الصفحة',
    hint: 'في كتب المتن وشرحه',
    opts: { default: 'عريض ملوّن', box: 'في إطار', tint: 'خلفية خفيفة', side: 'شريط جانبي' },
  },
  notes: {
    label: 'خط الحواشي',
    hint: 'الخط الذي يفصل الحواشي عن النص',
    opts: { default: 'قصير في أول السطر', full: 'بعرض الصفحة', center: 'قصير في الوسط', none: 'بلا خط' },
  },
  para: {
    label: 'الفقرات',
    hint: 'بداية كل فقرة',
    opts: { default: 'مسافة بادئة', block: 'بلا مسافة، وفراغ بين الفقرات' },
  },
  toc: {
    label: 'الفهرس',
    hint: 'بين العنوان ورقم صفحته',
    opts: { default: 'نقاط', plain: 'بلا نقاط', lines: 'خط تحت كل سطر' },
  },
  cover: {
    label: 'الغلاف الداخلي',
    hint: 'صفحة العنوان والمؤلف داخل الكتاب',
    opts: { default: 'إطار مزدوج', single: 'إطار واحد', none: 'بلا إطار', band: 'شريطان ملوّنان', corners: 'زوايا' },
  },
};

/** اختيارات التصميم منقّاة: مفاتيح المجموعات المعروفة بقيمها المعروفة فقط (والأصل لا يُحفظ) */
export function cleanDesign(input) {
  const d = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [k, part] of Object.entries(DESIGN_PARTS)) {
    const v = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : undefined;
    if (typeof v === 'string' && v !== 'default' && Object.prototype.hasOwnProperty.call(part.opts, v)) out[k] = v;
  }
  return out;
}

const RULE = 'var(--c-rule)';
const mix = (v, pct) => `color-mix(in srgb, ${v} ${pct}%, transparent)`;
/** زوايا (أربع علامات) بطبقات خلفية */
const corners = (len, w, color) =>
  ['top left', 'top right', 'bottom left', 'bottom right']
    .flatMap((pos) => [`linear-gradient(${color},${color}) ${pos} / ${len} ${w} no-repeat`, `linear-gradient(${color},${color}) ${pos} / ${w} ${len} no-repeat`])
    .join(', ');
/** أول رمز من زخرفة الأسلوب (نص منقّى في الإعدادات: بلا علامات تنصيص ولا شرطة مائلة) */
const sym = (S, d = '❁') => {
  const t = String((S && S.ornament) || '').trim().split(/\s+/)[0] || d;
  return /^[^"'\\<>{};\n]{1,6}$/.test(t) ? t : d;
};

/** قواعد كل اختيار: [المحدِّد، التصريحات] */
const RULES = {
  h1: {
    plain: () => [['.h1::after', 'display:none']],
    lines: () => [
      ['.h1', `border-top:0.8pt solid ${RULE};border-bottom:0.8pt solid ${RULE};padding:1.8mm 0 1.4mm`],
      ['.h1::after', 'display:none'],
    ],
    box: () => [
      ['.h1', `border:0.9pt solid ${RULE};padding:2.2mm 5mm 1.8mm;margin-left:10mm;margin-right:10mm`],
      ['.h1::after', 'display:none'],
    ],
    band: () => [
      ['.h1', 'background:var(--c-h1);color:#fff;padding:2mm 5mm 1.6mm;border-radius:1mm'],
      ['.h1::after', 'display:none'],
    ],
    orn: (S) => [
      ['.h1::before', `content:'${sym(S)}';display:block;color:var(--c-orn);font-size:0.55em;line-height:1.5;font-weight:400`],
      ['.h1::after', `content:'${sym(S)}';display:block;width:auto;border:0;margin:0.6mm auto 0;color:var(--c-orn);font-size:0.55em;line-height:1.5;font-weight:400`],
    ],
    side: () => [
      ['.h1', 'text-align:start;border-inline-start:2.2mm solid var(--c-h1);padding:0.6mm 4mm 0.2mm 0;padding-inline-start:4mm;padding-inline-end:0'],
      ['.h1::after', 'display:none'],
    ],
  },
  h2: {
    start: () => [['.h2', 'text-align:start']],
    underline: () => [['.h2', `border-bottom:0.6pt solid ${RULE};padding-bottom:0.8mm`]],
    side: () => [['.h2', 'text-align:start;border-inline-start:1.6mm solid var(--c-h2);padding-inline-start:3mm']],
    orn: (S) => [
      ['.h2::before', `content:'${sym(S)}';color:var(--c-orn);font-size:0.62em;font-weight:400;margin-inline-end:0.7em;vertical-align:0.15em`],
      ['.h2::after', `content:'${sym(S)}';color:var(--c-orn);font-size:0.62em;font-weight:400;margin-inline-start:0.7em;vertical-align:0.15em`],
    ],
    tint: () => [['.h2', `background:${mix('var(--c-h2)', 9)};padding:1.2mm 4mm 0.8mm;border-radius:1mm`]],
  },
  h3: {
    center: () => [['.h3', 'text-align:center']],
    underline: () => [['.h3', `border-bottom:0.5pt solid ${RULE};padding-bottom:0.5mm`]],
    side: () => [['.h3', 'border-inline-start:1.2mm solid var(--c-h3);padding-inline-start:2.6mm']],
    dot: () => [['.h3::before', `content:'◆';color:var(--c-orn);font-size:0.5em;margin-inline-end:0.9em;vertical-align:0.3em`]],
  },
  frame: (() => {
    // الإطار حول منطقة النص وترويستها، ورقم الصفحة تحته خارجه.
    // (لا تحويل transform في هذه العناصر: المتصفح يقسم العنصر عند حدّ الصفحة قبل تحويله فيُقطع في PDF)
    // ومع الهامش الخارجي الواسع يحيط الإطار بالنص وحده (--x-l و --x-r)، ونص الهامش خارجه: --mside-clear ما بين حافة النص
    // وما بعد الإطار، فلا تقع خانة الهامش على الإطار
    const gap = (S) => Math.min(6, Math.max(((S && S.page) || { side: 20 }).side - 4, 2));
    const box = (S) => {
      const P = (S && S.page) || { side: 20, top: 18, bottom: 14 };
      const g = gap(S);
      return `content:'';position:absolute;pointer-events:none;top:${Math.max(P.top - 13, 3)}mm;bottom:${Math.max(P.bottom - 1.6, 3)}mm;left:calc(var(--t-l, ${P.side}mm) - ${g}mm);right:calc(var(--t-r, ${P.side}mm) - ${g}mm)`;
    };
    const sel = '.page.content::before, .page.toc::before';
    const clear = (S, w) => ['.page.content, .page.toc', `--mside-clear:${(gap(S) + w + 1.4).toFixed(1)}mm`];
    return {
      line: (S) => [[sel, `${box(S)};border:0.8pt solid ${RULE}`], clear(S, 0.3)],
      double: (S) => [[sel, `${box(S)};border:2.6pt double ${RULE}`], clear(S, 0.9)],
      thick: (S) => [[sel, `${box(S)};border:1.3pt solid ${RULE};outline:0.5pt solid ${RULE};outline-offset:-1.7mm`], clear(S, 0.5)],
      corners: (S) => [[sel, `${box(S)};background:${corners('9mm', '0.9pt', RULE)}`], clear(S, 0.3)],
      bars: (S) => [[sel, `${box(S)};border-top:0.9pt solid ${RULE};border-bottom:0.9pt solid ${RULE}`]],
    };
  })(),
  head: {
    plain: () => [['.rh', 'border-bottom:0']],
    double: () => [['.rh', `border-bottom:2.2pt double ${RULE}`]],
    dots: () => [['.rh', `border-bottom:1pt dotted ${RULE}`]],
    tint: () => [['.rh', `border-bottom:0;background:${mix(RULE, 16)};padding:0.5mm 3mm 0.3mm;border-radius:0.8mm`]],
  },
  folio: {
    dashes: () => [
      ['.folio:not(:empty)::before', "content:'– ';font-weight:400"],
      ['.folio:not(:empty)::after', "content:' –';font-weight:400"],
    ],
    dots: () => [
      ['.folio:not(:empty)::before', "content:'• ';font-weight:400;color:var(--c-orn)"],
      ['.folio:not(:empty)::after', "content:' •';font-weight:400;color:var(--c-orn)"],
    ],
    circle: () => [
      ['.folio', 'font-size:12pt'],
      ['.folio:not(:empty)::before', `content:'';position:absolute;left:calc(50% - 1.05em);top:calc(50% - 1.13em);width:2.1em;height:2.1em;border:0.7pt solid ${RULE};border-radius:50%`],
    ],
    box: () => [
      ['.folio', 'font-size:12pt'],
      ['.folio:not(:empty)::before', `content:'';position:absolute;left:calc(50% - 1.3em);top:calc(50% - 0.97em);width:2.6em;height:1.8em;border:0.7pt solid ${RULE};border-radius:0.8mm`],
    ],
    outer: (S) => {
      const side = ((S && S.page) || { side: 20 }).side;
      // الصفحة اليسرى (.pg-l) كعبها يمين وطرفها الخارجي يسار، واليمنى (.pg-r) عكسها؛ والرقم بمحاذاة طرف النص
      return [
        ['.folio', `text-align:left;padding:0 ${side}mm`],
        ['.page.pg-r .folio', 'text-align:right'],
      ];
    },
  },
  orn: {
    lines: () => [
      ['.orn', 'display:flex;align-items:center;gap:4mm'],
      ['.orn::before, .orn::after', `content:'';flex:1;border-top:0.6pt solid ${RULE}`],
    ],
    rule: () => [['.orn', `font-size:0;line-height:0;height:0;width:30%;margin:4.5mm auto 5mm;border-top:0.9pt solid ${RULE}`]],
    big: () => [['.orn', 'font-size:1.55em;margin:3.5mm 0 4.5mm']],
  },
  matn: {
    // فقرات المتن المتتالية كتلة واحدة: أولها يفتح الإطار وآخرها يغلقه
    box: () => [
      ['.p.mt', `border-left:0.7pt solid ${RULE};border-right:0.7pt solid ${RULE};padding:0 3.2mm`],
      ['.p.mt:not(.p.mt + .p.mt)', `border-top:0.7pt solid ${RULE};padding-top:1.2mm`],
      ['.p.mt:not(:has(+ .p.mt))', `border-bottom:0.7pt solid ${RULE};padding-bottom:1mm`],
    ],
    tint: () => [
      ['.p.mt', `background:${mix('var(--c-matn)', 8)};padding:0 3.2mm`],
      ['.p.mt:not(.p.mt + .p.mt)', 'padding-top:1.2mm;border-radius:1.2mm 1.2mm 0 0'],
      ['.p.mt:not(:has(+ .p.mt))', 'padding-bottom:1mm;border-radius:0 0 1.2mm 1.2mm'],
    ],
    side: () => [['.p.mt', 'border-inline-start:1.4mm solid var(--c-matn);padding-inline-start:3.2mm']],
  },
  notes: {
    full: () => [['.notes:not(.sh) .fnsep', 'width:100%']],
    center: () => [['.notes:not(.sh) .fnsep', 'margin-left:auto;margin-right:auto']],
    none: () => [['.notes:not(.sh) .fnsep', 'border-top-color:transparent']],
  },
  para: {
    block: () => [
      ['.p.first', 'text-indent:0'],
      ['.p + .p.first', 'margin-top:1.8mm'],
    ],
  },
  toc: {
    plain: () => [['.toc-e .ld', 'visibility:hidden']],
    lines: () => [
      ['.toc-e .ld', 'visibility:hidden'],
      ['.toc-e', `border-bottom:0.4pt solid ${mix(RULE, 55)}`],
    ],
  },
  cover: {
    single: () => [['.cover-in', 'border-color:transparent']],
    none: () => [
      ['.cover-frame', 'border-color:transparent'],
      ['.cover-in', 'border-color:transparent'],
    ],
    band: () => [
      ['.cover-frame', 'border:0;border-top:6mm solid var(--c-h1);border-bottom:6mm solid var(--c-h1);padding:0'],
      ['.cover-in', 'border-color:transparent'],
    ],
    corners: () => [
      ['.cover-frame', `border-color:transparent;background:${corners('14mm', '1.2pt', RULE)}`],
      ['.cover-in', 'border-color:transparent'],
    ],
  },
};

/** قواعد التصميم المختار: [[المحدِّد، التصريحات], …] */
export function designRules(design, S) {
  const d = cleanDesign(design);
  const out = [];
  for (const [k, v] of Object.entries(d)) {
    const fn = RULES[k] && RULES[k][v];
    if (fn) out.push(...fn(S || {}));
  }
  return out;
}

/**
 * تنسيق التصميم المختار نصاً. scope: محدِّد يسبق كل قاعدة (لعيّنات الاختيار في «صانع الأساليب»).
 * الخادم يكتبه في مستند الطباعة بعد تنسيقه الأصلي وقبل تنسيق بطاقة الأسلوب (فتنسيق البطاقة يغلب).
 */
export function designCss(design, S, scope = '') {
  return designRules(design, S)
    .map(([sel, decl]) => `${sel.split(',').map((x) => (scope ? scope + ' ' : '') + x.trim()).join(', ')} { ${decl}; }`)
    .join('\n');
}

/* ------------------------------------------------------------ اختيارات سريعة (واجهة «صانع الأساليب») */
/** لوحات ألوان جاهزة: تملأ ألوان العناوين والمتن والآيات والزخارف والخطوط */
export const PALETTES = [
  { id: 'burgundy', name: 'عنابي وذهبي', c: { h1: '#6B1D2F', h2: '#3D2314', h3: '#6B1D2F', h4: '#3D2314', matn: '#8B1A1A', quran: '#1F6F4A', orn: '#C5A059', rule: '#C5A059', text: '#1d1712' } },
  { id: 'navy', name: 'كحلي وفضي', c: { h1: '#1B3358', h2: '#24456F', h3: '#1B3358', h4: '#33475B', matn: '#1B3358', quran: '#1F6F4A', orn: '#8C9AAE', rule: '#9AA7B8', text: '#16181d' } },
  { id: 'green', name: 'أخضر وذهبي', c: { h1: '#1E5B3A', h2: '#2B4A38', h3: '#1E5B3A', h4: '#2B4A38', matn: '#7A2E1E', quran: '#1E5B3A', orn: '#B8963E', rule: '#B8963E', text: '#17191a' } },
  { id: 'brown', name: 'بنّي تراثي', c: { h1: '#5A3418', h2: '#7A4A21', h3: '#5A3418', h4: '#4A3626', matn: '#8A3B12', quran: '#2E6B4E', orn: '#A9773B', rule: '#B58A55', text: '#241a12' } },
  { id: 'black', name: 'أسود كلاسيكي', c: { h1: '#111111', h2: '#111111', h3: '#222222', h4: '#222222', matn: '#111111', quran: '#111111', orn: '#555555', rule: '#444444', text: '#111111' } },
  { id: 'teal', name: 'فيروزي ونحاسي', c: { h1: '#0F5E63', h2: '#134B4F', h3: '#0F5E63', h4: '#2C4446', matn: '#9A4A1C', quran: '#0F5E63', orn: '#B87333', rule: '#B87333', text: '#16191a' } },
  { id: 'plum', name: 'بنفسجي ورمادي', c: { h1: '#4B2A5E', h2: '#3A2947', h3: '#4B2A5E', h4: '#3A2947', matn: '#7B2D52', quran: '#2B6A57', orn: '#9A8FA6', rule: '#A79DB2', text: '#19161c' } },
  { id: 'red', name: 'أحمر وأسود', c: { h1: '#A31919', h2: '#1a1a1a', h3: '#A31919', h4: '#1a1a1a', matn: '#A31919', quran: '#1F6F4A', orn: '#A31919', rule: '#1a1a1a', text: '#141414' } },
];
/** تطبيق لوحة ألوان على إعدادات (تعيد ما يتغير منها) */
export const paletteSettings = (p) => ({ headingColors: { 1: p.c.h1, 2: p.c.h2, 3: p.c.h3, 4: p.c.h4 }, matnColor: p.c.matn, quranColor: p.c.quran, ornamentColor: p.c.orn, ruleColor: p.c.rule, textColor: p.c.text, quotedColor: '', verseColor: '', basmalaColor: '' });
/** أي لوحة تطابق هذه الإعدادات؟ */
export const paletteOf = (s) => {
  const h = (s && s.headingColors) || {};
  const eq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  const hit = PALETTES.find((p) => eq(h[1], p.c.h1) && eq(h[2], p.c.h2) && eq(s.matnColor, p.c.matn) && eq(s.ruleColor, p.c.rule) && eq(s.ornamentColor, p.c.orn));
  return hit ? hit.id : '';
};

/** كثافة الصفحة: حجم الخط وتباعد الأسطر والهوامش معاً */
export const DENSITIES = [
  { id: 'compact', name: 'مضغوط', hint: 'صفحات أقل', v: { sizes: { body: 14, note: 12, h1: 21, h2: 17, h3: 15.5, h4: 14.5 }, lineHeight: 1.7, noteLineHeight: 1.5, page: { side: 17, top: 16, bottom: 13 } } },
  { id: 'normal', name: 'معتدل', hint: 'الأصل', v: { sizes: { body: 16, note: 13.5, h1: 24, h2: 19, h3: 17, h4: 16 }, lineHeight: 1.85, noteLineHeight: 1.6, page: { side: 20, top: 18, bottom: 14 } } },
  { id: 'airy', name: 'مريح', hint: 'خط أكبر وهوامش أوسع', v: { sizes: { body: 17.5, note: 14, h1: 26, h2: 21, h3: 18.5, h4: 17.5 }, lineHeight: 2, noteLineHeight: 1.7, page: { side: 23, top: 21, bottom: 16 } } },
];
export const densityOf = (s) => {
  const hit = DENSITIES.find((d) => s && s.sizes && s.page && s.sizes.body === d.v.sizes.body && s.lineHeight === d.v.lineHeight && s.page.side === d.v.page.side);
  return hit ? hit.id : '';
};
