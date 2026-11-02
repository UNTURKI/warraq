/*
 * cover-core.js — منطق استوديو الأغلفة المشترك (المتصفح + الخادم)
 * لا يعتمد على DOM ولا على Canvas: بنية التصميم، التطبيع، مجموعات الربط اللوني،
 * دمج اختيارات المستخدم مع الصلاحيات، وصيغة رقم المجلد.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoverCore = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_STROKES = 4;
  const SECTIONS = { cover: 'الخلفية', slot: 'الخانة' };
  const MODES = {
    overlay: 'سادة — تراكب لوني (Color Overlay)',
    color: 'ذات طابع — صبغ يحفظ النقش (يصلح للأبيض والأسود)',
    pscolor: 'ذات طابع — طبقة Color كما في فوتوشوب',
    none: 'بلا تلوين (الألوان الأصلية دائماً)',
  };
  /**
   * وضع صورة البديل بالنسبة إلى الصورة الأصلية (البديل الافتراضي للطبقة):
   *   full: تملأ الغلاف كله (وتُقصّ أطرافها)
   *   slot: في خانة الأصل نفسها، بأكبر حجم يتسع لها دون قصّ (شعارٌ مكان شعار: لا يكبر عن خانته ولا يصغر)
   *   mask: تأخذ موضع الأصل وحيّزه وشكله (قناعٌ عليه): لا يظهر منها إلا ما كان تحت الأصل
   *   (فارغ): موضعها وحجمها كما وُضعا لها
   */
  const FITS = {
    '': 'موضعها الخاص (كما وُضعت)',
    full: 'ملء الغلاف كله',
    slot: 'في خانة الأصل (أكبر حجم يتسع لها)',
    mask: 'قناعٌ على الأصل (بشكله وموضعه)',
  };
  /** أوضاع صورة المستخدم في الطبقة (يختارها المالك للطبقة، لا المستخدم) */
  const USER_FITS = ['slot', 'full', 'mask'];
  /** قيمة اللون التي تعني «ألوان الصورة الأصلية» (بلا صبغ) */
  const ORIGINAL = 'original';
  const DIGITS = {
    indic: 'هندية: ١٢',
    latin: 'عربية: 12',
    ordinal: 'كتابة: الثاني',
    ordinal_vol: 'كتابة مع «المجلد»: المجلد الثاني',
  };
  const ROLES = {
    title: 'اسم الكتاب الرئيسي',
    subtitle: 'اسم الكتاب الفرعي',
    author: 'اسم المؤلف',
    publisher: 'اسم الدار',
    volume: 'المجلد',
    blurb: 'نبذة الكتاب (للغلاف الخلفي)',
    custom: 'نص حر',
  };
  /** أنواع التصاميم: صفحات «المجلِّد» الثلاث */
  const KINDS = { front: 'الغلاف الأمامي', back: 'الغلاف الخلفي', spine: 'الكعب' };
  const KIND_LIST = Object.keys(KINDS);
  /** وحدات المحرر لكل سنتيمتر (الغلاف 17 سم = 850 وحدة) */
  const UNITS_PER_CM = 50;
  /** اتجاه النص */
  const ORIENTS = { h: 'أفقي', v: 'عمودي — يُقرأ من الأعلى', v2: 'عمودي — يُقرأ من الأسفل' };
  const ALIGNS = ['right', 'center', 'left', 'justify'];
  /** النص في الكعب حين يختلف عرضه عن العرض الطبيعي */
  const TEXT_FITS = { auto: 'كإعداد الكعب', scale: 'يكبر ويصغر مع الكعب', keep: 'يبقى بحجمه' };

  /* ورق المتن: سماكة الورقة الواحدة بالمليمتر (لحساب الكعب) */
  const PAPERS = [
    { id: 'offset70', group: 'أوفست أبيض', label: 'أوفست ٧٠ غ', mm: 0.090 },
    { id: 'offset80', group: 'أوفست أبيض', label: 'أوفست ٨٠ غ', mm: 0.100 },
    { id: 'offset90', group: 'أوفست أبيض', label: 'أوفست ٩٠ غ', mm: 0.115 },
    { id: 'offset100', group: 'أوفست أبيض', label: 'أوفست ١٠٠ غ', mm: 0.125 },
    { id: 'cream60', group: 'كريمي / شاموا / بالكي (للكتب)', label: 'كريمي ٦٠ غ', mm: 0.110 },
    { id: 'cream70', group: 'كريمي / شاموا / بالكي (للكتب)', label: 'كريمي ٧٠ غ', mm: 0.120 },
    { id: 'cream80', group: 'كريمي / شاموا / بالكي (للكتب)', label: 'كريمي ٨٠ غ', mm: 0.130 },
    { id: 'gloss115', group: 'كوشيه / آرت', label: 'كوشيه لامع ١١٥ غ', mm: 0.095 },
    { id: 'gloss135', group: 'كوشيه / آرت', label: 'كوشيه لامع ١٣٥ غ', mm: 0.110 },
    { id: 'matt115', group: 'كوشيه / آرت', label: 'كوشيه مطفي ١١٥ غ', mm: 0.105 },
    { id: 'matt135', group: 'كوشيه / آرت', label: 'كوشيه مطفي ١٣٥ غ', mm: 0.125 },
  ];
  /** معامل الانتفاخ لحساب السماكة من الغراماج: السماكة = الغراماج × المعامل ÷ ١٠٠٠ */
  const BULKS = { offset: { label: 'أوفست أبيض', k: 1.25 }, cream: { label: 'كريمي / بالكي', k: 1.65 }, gloss: { label: 'كوشيه لامع', k: 0.85 }, matt: { label: 'كوشيه مطفي', k: 0.95 } };
  /** سماح كرتون الغلاف الورقي في الكعب (مم) */
  const COVER_ALLOW = 0.6;
  const DEFAULT_PAPER = { id: 'offset80', gsm: 80, bulk: 'cream', mic: 100 };
  /** لون الكتاب المجسَّم مع الغلاف الأمامي (انظر bookColor) */
  const BOOK_LINKS = { auto: 'تلقائي: لون خلفية الغلاف', fixed: 'لونٌ ثابت أختاره', canvas: 'لون ما خلف الطبقات' };
  const BOOK_DEFAULT = { link: 'auto', color: '#6b1d2f' };

  // الخطوط المضمّنة (ملفاتها في public/covers/fonts — رخصة OFL)
  const BUILTIN_FONTS = [
    { family: 'Amiri', label: 'أميري', weights: [400, 700] },
    { family: 'Aref Ruqaa', label: 'عارف رقعة', weights: [400, 700] },
    { family: 'Scheherazade New', label: 'شهرزاد', weights: [400, 700] },
    { family: 'Noto Naskh Arabic', label: 'نوتو نسخ', weights: [400, 500, 600, 700] },
    { family: 'Lateef', label: 'لطيف', weights: [400, 700] },
    { family: 'Markazi Text', label: 'مركزي', weights: [400, 500, 600, 700] },
    { family: 'Reem Kufi', label: 'ريم كوفي', weights: [400, 500, 600, 700] },
    { family: 'Noto Kufi Arabic', label: 'نوتو كوفي', weights: [400, 500, 600, 700, 800, 900] },
    { family: 'Kufam', label: 'كوفام', weights: [400, 500, 600, 700, 800, 900] },
    { family: 'El Messiri', label: 'المسيري', weights: [400, 500, 600, 700] },
    { family: 'Cairo', label: 'القاهرة', weights: [400, 500, 600, 700, 800, 900] },
    { family: 'Tajawal', label: 'تجوال', weights: [400, 700, 800] },
    { family: 'Rakkas', label: 'رقّاص', weights: [400] },
    { family: 'Lalezar', label: 'لاله‌زار', weights: [400] },
  ];

  const HEX = /^#[0-9a-f]{6}$/i;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const num = (v, d, min, max) => {
    let n = Number(v);
    if (!Number.isFinite(n)) n = d;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  };
  const str = (v, d, max) => (typeof v === 'string' ? v : d == null ? '' : String(d)).slice(0, max || 400);
  const bool = (v, d) => (typeof v === 'boolean' ? v : !!d);
  const hex = (v, d) => {
    if (typeof v !== 'string') return d;
    let s = v.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
    return HEX.test(s) ? s.toLowerCase() : d;
  };
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const safeId = (v) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : null);

  let idCounter = 0;
  function uid(prefix) {
    idCounter = (idCounter + 1) % 1296;
    return (prefix || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + idCounter.toString(36);
  }

  // مسار وسائط آمن: نسمح فقط بملفات الاستوديو المرفوعة
  function safeSrc(v) {
    if (typeof v !== 'string' || !v) return null;
    if (/^\/covers-media\/[a-z0-9._-]{1,80}$/i.test(v)) return v;
    if (/^\/covers\/demo\/[a-z0-9._-]{1,80}$/i.test(v)) return v;
    // صور الأغلفة المضمّنة في البرنامج (public/covers/builtin)
    if (/^\/covers\/builtin\/[a-z0-9._-]{1,80}$/i.test(v)) return v;
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* البناء الافتراضي                                                  */
  /* ---------------------------------------------------------------- */

  function canvasDims(c) {
    // الكعب: وحدات ثابتة لكل سنتيمتر (فعرضه يتغير مع الكتاب ويبقى النص بمقاس الغلاف نفسه)
    if (c.fixed) return { w: Math.max(4, Math.round(c.widthCm * UNITS_PER_CM)), h: Math.round(c.heightCm * UNITS_PER_CM) };
    const w = 850;
    const h = Math.round((w * c.heightCm) / c.widthCm);
    return { w, h };
  }

  function makeVariant(o) {
    return Object.assign(
      { id: uid('v'), label: 'سادة', name: '', src: null, mode: 'overlay', fit: '', offered: true, x: 0, y: 0, w: 850, h: 1200, iw: 0, ih: 0 },
      o || {}
    );
  }

  function makeImageLayer(o) {
    const variants = (o && o.variants) || [makeVariant()];
    return Object.assign(
      {
        id: uid('L'),
        type: 'image',
        section: 'cover',
        name: 'طبقة صور',
        variants,
        defVariant: variants[0].id,
        tint: true,
        color: null,
        opacity: 1,
        visible: true,
        lock: false,
        user: { variant: true, color: true, hide: false, move: false },
      },
      o || {},
      { variants }
    );
  }

  function makeTextLayer(o) {
    return Object.assign(
      {
        id: uid('T'),
        type: 'text',
        section: 'cover',
        name: 'نص',
        role: 'custom',
        text: 'نص',
        font: 'Amiri',
        weight: 700,
        size: 64,
        minSize: 20,
        autoFit: true,
        maxLines: 2,
        lineHeight: 1.3,
        align: 'center',
        orient: 'h',
        fit: 'auto',
        box: { x: 125, y: 300, w: 600, h: 160 },
        color: '#c9a54a',
        strokes: [],
        visible: true,
        volume: { digits: 'indic', template: '{n}' },
        user: { text: true, font: true, size: true, color: true, move: false, strokes: false, hide: false },
      },
      o || {}
    );
  }

  /** التصميم الفارغ: الأقسام والأسماء المعتمدة جاهزة، تنتظر رفع الصور */
  function blankDesign(name, kind) {
    kind = KIND_LIST.includes(kind) ? kind : 'front';
    if (kind === 'spine') return blankSpine(name);
    const canvas = { widthCm: 17, heightCm: 24, dpi: 300, bg: '#ffffff', fixed: false, safeMm: 10 };
    const { w, h } = canvasDims(canvas);
    const full = { x: 0, y: 0, w, h };
    const V = (label, fileName, mode) => makeVariant(Object.assign({ label, name: fileName, mode }, full));
    const pre = kind === 'back' ? 'خلفي ' : '';
    const L = [];
    // قسم الخلفية (من الأسفل إلى الأعلى)
    L.push(makeImageLayer({ section: 'cover', name: 'الخلفية',
      variants: [V('سادة', pre + 'خلفية وراق الخلفية', 'overlay'), V('جلد', pre + 'خلفية وراق الخلفية جلد', 'color')] }));
    L.push(makeImageLayer({ section: 'cover', name: 'الأشكال',
      variants: [V('أشكال', pre + 'خلفية وراق أشكال', 'overlay')] }));
    L.push(makeImageLayer({ section: 'cover', name: 'الخطوط',
      variants: [V('سادة', pre + 'خلفية وراق خطوط', 'overlay'), V('ثلاثية الأبعاد', pre + 'خلفية وراق خطوط ثلاثية الأبعاد', 'color')] }));
    L.push(makeImageLayer({ section: 'cover', name: 'التفاصيل',
      variants: [V('تفاصيل', pre + 'خلفية وراق تفاصيل', 'overlay')], user: { variant: true, color: true, hide: true, move: false } }));
    if (kind === 'front') {
      // قسم الخانة
      L.push(makeImageLayer({ section: 'slot', name: 'خانة: الخلفية',
        variants: [V('سادة', 'خانة وراق الخلفية', 'overlay'), V('جلد', 'خانة وراق الخلفية جلد', 'color')] }));
      L.push(makeImageLayer({ section: 'slot', name: 'خانة: الأشكال',
        variants: [V('أشكال', 'خانة وراق أشكال', 'overlay')] }));
      L.push(makeImageLayer({ section: 'slot', name: 'خانة: الخطوط',
        variants: [V('سادة', 'خانة وراق خطوط', 'overlay'), V('ثلاثية الأبعاد', 'خانة وراق خطوط ثلاثية الأبعاد', 'color')] }));
    }
    // صور الخلفية بحجم الغلاف كاملاً: مقفلة في المحرر حتى لا تُسحب بالخطأ
    L.forEach((l) => { if (l.section === 'cover') l.lock = true; });
    // النصوص
    const cx = (bw) => Math.round((w - bw) / 2);
    if (kind === 'front') {
      L.push(makeTextLayer({ section: 'cover', name: ROLES.title, role: 'title', text: 'اسم الكتاب', size: 110, minSize: 40,
        box: { x: cx(640), y: Math.round(h * 0.25), w: 640, h: 260 }, strokes: [{ id: uid('s'), width: 3, color: '#000000' }] }));
      L.push(makeTextLayer({ section: 'cover', name: ROLES.subtitle, role: 'subtitle', text: 'العنوان الفرعي', size: 46, minSize: 22, weight: 400,
        box: { x: cx(600), y: Math.round(h * 0.25) + 270, w: 600, h: 110 } }));
      L.push(makeTextLayer({ section: 'cover', name: ROLES.author, role: 'author', text: 'اسم المؤلف', font: 'Aref Ruqaa', size: 54, minSize: 24,
        box: { x: cx(600), y: Math.round(h * 0.56), w: 600, h: 90 } }));
    } else {
      L.push(makeTextLayer({ section: 'cover', name: ROLES.title, role: 'title', text: 'اسم الكتاب', size: 64, minSize: 28, maxLines: 1,
        box: { x: cx(600), y: Math.round(h * 0.12), w: 600, h: 110 } }));
      L.push(makeTextLayer({ section: 'cover', name: ROLES.blurb, role: 'blurb', weight: 400, size: 34, minSize: 20, maxLines: 14, lineHeight: 1.7, align: 'justify', autoFit: true,
        text: 'نبذة عن الكتاب: يكتب هنا تعريف قصير بالكتاب ومؤلفه وما يمتاز به، ليقرأه من يقلب الكتاب قبل أن يفتحه.',
        box: { x: cx(640), y: Math.round(h * 0.25), w: 640, h: Math.round(h * 0.45) } }));
    }
    L.push(makeTextLayer({ section: 'cover', name: ROLES.publisher, role: 'publisher', text: 'دار ورّاق', size: 34, minSize: 18, weight: 400, maxLines: 1,
      box: { x: cx(400), y: h - 130, w: 400, h: 60 } }));
    if (kind === 'front') {
      L.push(makeTextLayer({ section: 'slot', name: ROLES.volume, role: 'volume', text: '1', size: 92, minSize: 30, maxLines: 1,
        box: { x: cx(160), y: Math.round(h * 0.7), w: 160, h: 140 }, user: { text: true, font: false, size: false, color: true, move: false, strokes: false, hide: false } }));
    }
    return baseDesign(name, kind, canvas, L);
  }

  /** الكعب الفارغ: عرض طبيعي ٣ سم، العنوان والمؤلف عموديان، والدار ورقم المجلد أفقيان */
  function blankSpine(name) {
    const canvas = { widthCm: 3, heightCm: 24, dpi: 300, bg: '#ffffff', fixed: true, safeMm: 1.5 };
    const { w, h } = canvasDims(canvas);
    const full = { x: 0, y: 0, w, h };
    const V = (label, fileName, mode) => makeVariant(Object.assign({ label, name: fileName, mode }, full));
    const L = [];
    L.push(makeImageLayer({ section: 'cover', name: 'الخلفية', lock: true,
      variants: [V('سادة', 'كعب وراق الخلفية', 'overlay'), V('جلد', 'كعب وراق الخلفية جلد', 'color')] }));
    L.push(makeImageLayer({ section: 'cover', name: 'الزخرفة', lock: true,
      variants: [V('زخرفة', 'كعب وراق زخرفة', 'overlay')] }));
    const bw = w - 16;
    L.push(makeTextLayer({ section: 'cover', name: ROLES.title, role: 'title', text: 'اسم الكتاب', size: 70, minSize: 24, maxLines: 1, orient: 'v',
      box: { x: 8, y: Math.round(h * 0.08), w: bw, h: Math.round(h * 0.5) } }));
    L.push(makeTextLayer({ section: 'cover', name: ROLES.author, role: 'author', text: 'اسم المؤلف', font: 'Aref Ruqaa', size: 46, minSize: 18, maxLines: 1, orient: 'v',
      box: { x: 8, y: Math.round(h * 0.6), w: bw, h: Math.round(h * 0.22) } }));
    L.push(makeTextLayer({ section: 'cover', name: ROLES.publisher, role: 'publisher', text: 'ورّاق', size: 26, minSize: 12, weight: 400, maxLines: 2, fit: 'keep',
      box: { x: 8, y: h - 110, w: bw, h: 70 } }));
    L.push(makeTextLayer({ section: 'slot', name: ROLES.volume, role: 'volume', text: '1', size: 54, minSize: 16, maxLines: 1, fit: 'keep',
      box: { x: 8, y: Math.round(h * 0.84), w: bw, h: 70 }, user: { text: true, font: false, size: false, color: true, move: false, strokes: false, hide: false } }));
    return baseDesign(name, 'spine', canvas, L);
  }

  function baseDesign(name, kind, canvas, layers) {
    return {
      v: 1,
      id: null,
      kind,
      name: name || 'تصميم جديد',
      published: false,
      order: 0,
      thumb: null,
      palette: ['#1f3a5f', '#c9a54a', '#f5efe0'],
      canvas,
      volume: { on: kind !== 'back', userToggle: true, sample: 1 },
      spine: { fitNarrow: 'squeeze', textFit: 'scale' },
      syncVariants: true,
      allowCustom: kind !== 'spine',
      allowUserImages: true,
      allowUserText: true,
      layers,
      links: [],
      book: clone(BOOK_DEFAULT),
      createdAt: null,
      updatedAt: null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* التطبيع (يُستعمل في الخادم للتحقق وفي المتصفح للتوافق)            */
  /* ---------------------------------------------------------------- */

  function normBox(b, W, H, dw, dh) {
    b = b || {};
    return {
      x: num(b.x, 0, -W * 2, W * 3),
      y: num(b.y, 0, -H * 2, H * 3),
      w: num(b.w, dw, 1, W * 4),
      h: num(b.h, dh, 1, H * 4),
    };
  }

  function normalizeDesign(input) {
    const d = input && typeof input === 'object' ? input : {};
    const c = d.canvas || {};
    const kind = oneOf(d.kind, KIND_LIST, 'front');
    const spine = kind === 'spine';
    const canvas = {
      widthCm: num(c.widthCm, spine ? 3 : 17, spine ? 0.3 : 5, spine ? 15 : 100),
      heightCm: num(c.heightCm, 24, 5, 100),
      dpi: num(c.dpi, 300, 72, 600),
      bg: hex(c.bg, '#ffffff'),
      fixed: spine,
      safeMm: num(c.safeMm, spine ? 1.5 : 10, 0, 50),
    };
    const { w: W, h: H } = canvasDims(canvas);
    const seen = new Set();
    const uniq = (id, p) => {
      let v = safeId(id);
      if (!v || seen.has(v)) v = uid(p);
      seen.add(v);
      return v;
    };
    const layers = [];
    for (const l of Array.isArray(d.layers) ? d.layers.slice(0, 80) : []) {
      if (!l || typeof l !== 'object') continue;
      const section = oneOf(l.section, ['cover', 'slot'], 'cover');
      if (l.type === 'image') {
        const u = l.user || {};
        const variants = (Array.isArray(l.variants) ? l.variants : []).slice(0, 12).map((v) => {
          v = v || {};
          const b = normBox(v, W, H, W, H);
          return {
            id: uniq(v.id, 'v'),
            label: str(v.label, 'بديل', 60),
            name: str(v.name, '', 120),
            src: safeSrc(v.src),
            mode: oneOf(v.mode, Object.keys(MODES), 'overlay'),
            fit: oneOf(v.fit, Object.keys(FITS), ''),
            offered: bool(v.offered, true),
            x: b.x, y: b.y, w: b.w, h: b.h,
            iw: num(v.iw, 0, 0, 20000),
            ih: num(v.ih, 0, 0, 20000),
          };
        });
        if (!variants.length) variants.push(makeVariant({ w: W, h: H }));
        layers.push({
          id: uniq(l.id, 'L'),
          type: 'image',
          section,
          name: str(l.name, 'طبقة صور', 80),
          variants,
          defVariant: variants.some((v) => v.id === l.defVariant) ? l.defVariant : variants[0].id,
          tint: bool(l.tint, true),
          color: l.color == null || l.color === ORIGINAL ? null : hex(l.color, null),
          opacity: num(l.opacity, 1, 0, 1),
          visible: bool(l.visible, true),
          lock: bool(l.lock, false),
          user: { variant: bool(u.variant, true), color: bool(u.color, true), hide: bool(u.hide, false), move: bool(u.move, false) },
          // صورة المستخدم بديلاً في هذه الطبقة: موضعها من الصورة الأصلية بحسب ما اختاره المالك في «المجلِّد»
          userFit: oneOf(l.userFit, USER_FITS, 'slot'),
        });
      } else if (l.type === 'text') {
        const u = l.user || {};
        const vol = l.volume || {};
        const strokes = (Array.isArray(l.strokes) ? l.strokes : []).slice(0, MAX_STROKES).map((s) => ({
          id: uniq(s && s.id, 's'),
          width: num(s && s.width, 2, 0.5, 60),
          color: hex(s && s.color, '#000000'),
        }));
        layers.push({
          id: uniq(l.id, 'T'),
          type: 'text',
          section,
          name: str(l.name, 'نص', 80),
          role: oneOf(l.role, Object.keys(ROLES), 'custom'),
          text: str(l.text, '', 600),
          font: str(l.font, 'Amiri', 80),
          weight: num(l.weight, 700, 100, 900),
          size: num(l.size, 64, 4, 600),
          minSize: num(l.minSize, 16, 4, 600),
          autoFit: bool(l.autoFit, true),
          maxLines: num(l.maxLines, 2, 1, 12),
          lineHeight: num(l.lineHeight, 1.3, 0.6, 3),
          align: oneOf(l.align, ALIGNS, 'center'),
          orient: oneOf(l.orient, Object.keys(ORIENTS), 'h'),
          fit: oneOf(l.fit, Object.keys(TEXT_FITS), 'auto'),
          box: normBox(l.box, W, H, 400, 120),
          color: hex(l.color, '#000000'),
          strokes,
          visible: bool(l.visible, true),
          lock: bool(l.lock, false),
          volume: { digits: oneOf(vol.digits, Object.keys(DIGITS), 'indic'), template: str(vol.template, '{n}', 60) || '{n}' },
          user: {
            text: bool(u.text, true), font: bool(u.font, true), size: bool(u.size, true), color: bool(u.color, true),
            move: bool(u.move, false), strokes: bool(u.strokes, false), hide: bool(u.hide, false),
          },
        });
      }
    }
    const out = {
      v: 1,
      id: safeId(d.id),
      kind,
      name: str(d.name, 'تصميم', 80).trim() || 'تصميم',
      published: bool(d.published, false),
      order: num(d.order, 0, -1e6, 1e6),
      thumb: safeSrc(d.thumb),
      palette: (Array.isArray(d.palette) ? d.palette : []).map((x) => hex(x, null)).filter(Boolean).slice(0, 5),
      canvas,
      volume: {
        on: bool(d.volume && d.volume.on, true),
        userToggle: bool(d.volume && d.volume.userToggle, true),
        sample: num(d.volume && d.volume.sample, 1, 1, 999),
      },
      spine: {
        fitNarrow: oneOf(d.spine && d.spine.fitNarrow, ['squeeze', 'crop'], 'squeeze'),
        textFit: oneOf(d.spine && d.spine.textFit, ['scale', 'keep'], 'scale'),
      },
      syncVariants: bool(d.syncVariants, true),
      allowCustom: bool(d.allowCustom, !spine),
      allowUserImages: bool(d.allowUserImages, true),
      allowUserText: bool(d.allowUserText, true),
      layers,
      links: [],
      createdAt: typeof d.createdAt === 'string' ? d.createdAt.slice(0, 40) : null,
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt.slice(0, 40) : null,
    };
    if (!out.palette.length) out.palette = ['#1f3a5f', '#c9a54a'];
    out.links = cleanLinks(out, d.links);
    out.book = cleanBook(out, d.book);
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* أهداف اللون والربط                                                */
  /* ---------------------------------------------------------------- */

  /** كل ما يمكن أن يحمل لوناً: طبقة صور، لون نص، أو حدّ نص */
  function targetsOf(design) {
    const out = [];
    for (const l of design.layers) {
      if (l.type === 'image') {
        out.push({ key: 'L:' + l.id, layerId: l.id, section: l.section, kind: 'image', label: l.name, color: l.color, active: l.tint, userEditable: l.tint && l.user.color });
      } else {
        out.push({ key: 'T:' + l.id + ':fill', layerId: l.id, section: l.section, kind: 'fill', label: l.name, sub: 'لون النص', color: l.color, active: true, userEditable: l.user.color });
        l.strokes.forEach((s, i) => {
          out.push({ key: 'T:' + l.id + ':s:' + s.id, layerId: l.id, section: l.section, kind: 'stroke', strokeId: s.id, label: l.name, sub: 'الحد ' + (i + 1), color: s.color, active: true, userEditable: l.user.strokes || l.user.color });
        });
      }
    }
    return out;
  }

  function cleanLinks(design, links) {
    const keys = new Set(targetsOf(design).map((t) => t.key));
    const seen = new Set();
    const out = [];
    for (const k of Array.isArray(links) ? links : []) {
      if (!k || !keys.has(k.a) || !keys.has(k.b) || k.a === k.b) continue;
      const id = [k.a, k.b].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ a: k.a, b: k.b });
    }
    return out;
  }

  /** لون الكتاب المجسَّم: الربط معروفٌ أو عنصرٌ في التصميم (وإلا فتلقائي) */
  function cleanBook(design, b) {
    b = b && typeof b === 'object' ? b : {};
    let link = typeof b.link === 'string' ? b.link : 'auto';
    if (!BOOK_LINKS[link] && !targetsOf(design).some((t) => t.key === link)) link = 'auto';
    return { link, color: hex(b.color, BOOK_DEFAULT.color) };
  }

  /** مجموعات اللون (اتحاد-بحث): كل العناصر المرتبطة مباشرة أو عبر وسيط */
  function colorGroups(design) {
    const targets = targetsOf(design);
    const parent = {};
    targets.forEach((t) => (parent[t.key] = t.key));
    const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
    for (const l of design.links) {
      if (parent[l.a] == null || parent[l.b] == null) continue;
      const ra = find(l.a), rb = find(l.b);
      if (ra !== rb) parent[rb] = ra;
    }
    const map = new Map();
    for (const t of targets) {
      const r = find(t.key);
      if (!map.has(r)) map.set(r, []);
      map.get(r).push(t);
    }
    const groups = [...map.values()];
    const byKey = {};
    groups.forEach((g, i) => g.forEach((t) => (byKey[t.key] = i)));
    return { groups, byKey, targets };
  }

  function groupOf(design, key) {
    const { groups, byKey } = colorGroups(design);
    return byKey[key] == null ? [] : groups[byKey[key]];
  }

  function getDefaultColor(design, key) {
    const t = targetsOf(design).find((x) => x.key === key);
    return t ? t.color : '#000000';
  }

  /** تغيير لون افتراضي في لوحة المالك: يسري على كل المرتبطين */
  function setDesignColor(design, key, color) {
    const orig = color == null || color === ORIGINAL;
    color = orig ? null : hex(color, null);
    if (!orig && !color) return;
    for (const t of groupOf(design, key)) {
      const l = design.layers.find((x) => x.id === t.layerId);
      if (!l) continue;
      if (orig && t.kind !== 'image') continue; // النصوص تحتاج لوناً دائماً
      if (t.kind === 'image' || t.kind === 'fill') l.color = color;
      else {
        const s = l.strokes.find((x) => x.id === t.strokeId);
        if (s) s.color = color;
      }
    }
  }

  /** إضافة ربط: الهدف يأخذ لون المصدر فوراً */
  function addLink(design, a, b) {
    if (a === b) return false;
    const id = [a, b].sort().join('|');
    if (design.links.some((l) => [l.a, l.b].sort().join('|') === id)) return false;
    design.links.push({ a, b });
    design.links = cleanLinks(design, design.links);
    setDesignColor(design, a, getDefaultColor(design, a));
    return true;
  }

  function removeLink(design, a, b) {
    const id = [a, b].sort().join('|');
    design.links = design.links.filter((l) => [l.a, l.b].sort().join('|') !== id);
  }

  /* ---------------------------------------------------------------- */
  /* البدائل والربط بين البدائل                                         */
  /* ---------------------------------------------------------------- */

  /** البديل المقابل في الطبقة المرتبطة: نفس نوع التلوين ونفس الترتيب بين نظرائه، وإلا نفس الموضع */
  function matchVariant(fromLayer, variantId, toLayer) {
    const idx = fromLayer.variants.findIndex((v) => v.id === variantId);
    if (idx < 0) return null;
    const v = fromLayer.variants[idx];
    const rank = fromLayer.variants.filter((x, i) => i < idx && x.mode === v.mode).length;
    const same = toLayer.variants.filter((x) => x.mode === v.mode);
    if (same[rank]) return same[rank].id;
    if (same.length) return same[same.length - 1].id;
    return toLayer.variants[idx] ? toLayer.variants[idx].id : null;
  }

  /** طبقات الصور المرتبطة بطبقة صور (عبر مجموعة اللون) */
  function linkedImageLayers(design, layerId) {
    return groupOf(design, 'L:' + layerId)
      .filter((t) => t.kind === 'image' && t.layerId !== layerId)
      .map((t) => design.layers.find((l) => l.id === t.layerId))
      .filter(Boolean);
  }

  /* ---------------------------------------------------------------- */
  /* حالة المستخدم                                                     */
  /* ---------------------------------------------------------------- */

  function emptyState(design) {
    return { designId: design.id, volumeOn: design.volume.on, volume: design.volume.sample || 1, variant: {}, hidden: {}, offset: {}, colors: {}, texts: {} };
  }

  /**
   * يدمج اختيارات المستخدم مع التصميم ويطبّق الصلاحيات.
   * النتيجة «حالة محلولة» يقرؤها المُصيِّر مباشرة.
   * opts.admin = true: معاينة المالك (بلا قيود صلاحيات).
   */
  function resolveState(design, userState, opts) {
    const admin = !!(opts && opts.admin);
    const s = userState || {};
    const out = {
      volumeOn: admin ? (s.volumeOn != null ? !!s.volumeOn : design.volume.on) : design.volume.userToggle && s.volumeOn != null ? !!s.volumeOn : design.volume.on,
      volume: num(s.volume, design.volume.sample || 1, 0, 9999),
      variant: {},
      hidden: {},
      offset: {},
      colors: {},
      texts: {},
      custom: null,
    };
    // صورة المستخدم غلافاً (إن سمح المالك)
    const c = s.custom;
    if ((admin || design.allowCustom) && c && typeof c.src === 'string' && /^(data:image\/(png|jpeg|webp);base64,|blob:|\/covers-media\/)/.test(c.src)) {
      out.custom = { src: c.src, fit: c.fit === 'contain' ? 'contain' : 'cover', keepTexts: !!c.keepTexts, keepVolume: c.keepVolume !== false };
    }
    const { groups, targets } = colorGroups(design);
    const sc = s.colors || {};
    // ما ربطته الحزمة بلون غلافٍ آخر (الأمامي ← الخلفي والكعب) يتبعه ولو لم يُتح للمستخدم تغييره هنا
    const linked = s.linked && typeof s.linked === 'object' ? s.linked : {};
    // اللون لكل مجموعة: اختيار المستخدم (إن كان في المجموعة عضو قابل للتعديل) وإلا الافتراضي
    for (const g of groups) {
      let chosen = null;
      if (admin || g.some((t) => t.userEditable || linked[t.key])) {
        for (const t of g) {
          if (sc[t.key] === ORIGINAL) { chosen = ORIGINAL; break; }
          if (hex(sc[t.key], null)) { chosen = hex(sc[t.key]); break; }
        }
      }
      // «الأصلي» يعني بلا صبغ للصور، والنصوص تبقى على لونها الافتراضي
      for (const t of g) out.colors[t.key] = chosen === ORIGINAL ? (t.kind === 'image' ? null : t.color) : chosen || t.color;
    }
    // حدود أضافها المستخدم بنفسه (ليست في التصميم)
    for (const k of Object.keys(sc)) if (out.colors[k] == null && hex(sc[k], null) && /^T:[^:]+:s:u/.test(k)) out.colors[k] = hex(sc[k]);

    for (const l of design.layers) {
      if (l.type === 'image') {
        const want = s.variant && s.variant[l.id];
        const offered = l.variants.filter((v) => v.offered);
        const ok = want && (admin ? l.variants : l.user.variant ? offered : []).some((v) => v.id === want);
        out.variant[l.id] = ok ? want : l.defVariant;
        const hid = s.hidden && s.hidden[l.id];
        out.hidden[l.id] = admin ? (hid != null ? !!hid : !l.visible) : l.user.hide && hid != null ? !!hid : !l.visible;
        const off = s.offset && s.offset[l.id];
        out.offset[l.id] = (admin || l.user.move) && off ? { dx: num(off.dx, 0, -5000, 5000), dy: num(off.dy, 0, -5000, 5000) } : { dx: 0, dy: 0 };
      } else {
        const t = (s.texts && s.texts[l.id]) || {};
        const u = admin ? { text: 1, font: 1, size: 1, move: 1, strokes: 1, hide: 1 } : l.user;
        const r = {
          text: u.text && typeof t.text === 'string' ? t.text.slice(0, 600) : l.text,
          font: u.font && typeof t.font === 'string' && t.font ? t.font.slice(0, 80) : l.font,
          weight: u.font && t.weight ? num(t.weight, l.weight, 100, 900) : l.weight,
          size: u.size && t.size ? num(t.size, l.size, 4, 600) : l.size,
          dx: u.move ? num(t.dx, 0, -5000, 5000) : 0,
          dy: u.move ? num(t.dy, 0, -5000, 5000) : 0,
          hidden: u.hide && t.hidden != null ? !!t.hidden : !l.visible,
          strokes: l.strokes.map((x) => ({ id: x.id, width: x.width })),
        };
        if (u.strokes && Array.isArray(t.strokes)) {
          r.strokes = t.strokes.slice(0, MAX_STROKES).map((x) => ({ id: safeId(x && x.id) || uid('us'), width: num(x && x.width, 2, 0.5, 60) }));
        }
        r.strokes.forEach((x) => {
          const k = 'T:' + l.id + ':s:' + x.id;
          if (out.colors[k] == null) out.colors[k] = hex(sc[k], '#000000');
        });
        out.texts[l.id] = r;
      }
    }
    return out;
  }

  /**
   * لون الكتاب المجسَّم (الجلد: الدفّتان والكعب في المعاينة والرَّحل والخزانة) من الغلاف الأمامي:
   *   auto: لون أسفل طبقة صور ظاهرة مصبوغة في قسم الخلفية (كما كان)
   *   fixed: اللون الثابت book.color
   *   canvas: لون ما خلف الطبقات
   *   مفتاح عنصر ('L:id' صورة أو خلفية، 'T:id:fill' لون نص): يتبع لونه كما اختاره المستخدم،
   *   فإن كان بلا لون (ألوان الصورة الأصلية أو طبقة مخفية) فاللون الثابت
   * rs: الحالة المحلولة (resolveState). يعيد لوناً أو null.
   */
  function bookColor(design, rs) {
    const b = design && design.book ? design.book : BOOK_DEFAULT;
    const colors = (rs && rs.colors) || {};
    const hidden = (rs && rs.hidden) || {};
    if (b.link === 'fixed') return hex(b.color, null);
    if (b.link === 'canvas') return hex(design.canvas && design.canvas.bg, null);
    if (b.link && b.link !== 'auto') {
      const m = /^L:(.+)$/.exec(b.link);
      const c = m && hidden[m[1]] ? null : hex(colors[b.link], null);
      return c || hex(b.color, null);
    }
    const bg = (design.layers || []).find((l) => l.type === 'image' && l.section === 'cover' && !hidden[l.id] && colors['L:' + l.id]);
    return bg ? hex(colors['L:' + bg.id], null) : null;
  }

  /** تغيير اللون من جهة المستخدم: يُكتب لكل المرتبطين */
  function setUserColor(design, state, key, color) {
    color = color === ORIGINAL ? ORIGINAL : hex(color, null);
    if (!color) return state;
    state.colors = state.colors || {};
    const g = groupOf(design, key);
    if (!g.length) state.colors[key] = color;
    for (const t of g) state.colors[t.key] = color;
    return state;
  }

  /**
   * ربط ألوان الحزمة: تغيُّر لونٍ في جزء (الأمامي غالباً) يسري على ما رُبط به في الأجزاء الأخرى.
   * links: [{ a: 'front|T:id:fill', b: 'back|L:id' }]، changed: { key: color } في الجزء part
   * ← { back: { key: color }, spine: {...} } (يُتبع الربط عبر الوسيط: خلفي ← أمامي ← كعب)
   */
  function bundleLinkedColors(links, part, changed) {
    const adj = new Map();
    const add = (x, y) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); };
    for (const l of Array.isArray(links) ? links : []) if (l && l.a && l.b) { add(l.a, l.b); add(l.b, l.a); }
    const out = {};
    for (const [key, color] of Object.entries(changed || {})) {
      const start = part + '|' + key;
      if (!adj.has(start)) continue;
      const seen = new Set([start]);
      const q = [start];
      while (q.length) {
        for (const n of adj.get(q.shift()) || []) {
          if (seen.has(n)) continue;
          seen.add(n);
          q.push(n);
          const i = n.indexOf('|');
          const p = n.slice(0, i);
          if (p !== part) (out[p] = out[p] || {})[n.slice(i + 1)] = color;
        }
      }
    }
    return out;
  }

  /** اختيار بديل: مع مزامنة الطبقات المرتبطة إن فعّلها المالك */
  function setUserVariant(design, state, layerId, variantId, opts) {
    state.variant = state.variant || {};
    state.variant[layerId] = variantId;
    if (!design.syncVariants) return state;
    const from = design.layers.find((l) => l.id === layerId);
    if (!from) return state;
    for (const other of linkedImageLayers(design, layerId)) {
      if (!(opts && opts.admin) && !other.user.variant) continue;
      const m = matchVariant(from, variantId, other);
      if (m) {
        const mv = other.variants.find((v) => v.id === m);
        if (opts && opts.admin ? true : mv.offered) state.variant[other.id] = m;
      }
    }
    return state;
  }

  /* ---------------------------------------------------------------- */
  /* رقم المجلد                                                        */
  /* ---------------------------------------------------------------- */

  const INDIC = '٠١٢٣٤٥٦٧٨٩';
  const toIndic = (s) => String(s).replace(/[0-9]/g, (d) => INDIC[d]);

  const ORD_UNITS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  const ORD_UNITS_COMPOUND = ['', 'الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'];
  const ORD_TENS = ['', '', 'العشرون', 'الثلاثون', 'الأربعون', 'الخمسون', 'الستون', 'السبعون', 'الثمانون', 'التسعون'];

  function ordinal(n) {
    n = Math.floor(n);
    if (n >= 1 && n <= 10) return ORD_UNITS[n];
    if (n >= 11 && n <= 19) return ORD_UNITS_COMPOUND[n - 10] + ' عشر';
    if (n >= 20 && n <= 99) {
      const t = Math.floor(n / 10), u = n % 10;
      return u ? ORD_UNITS_COMPOUND[u] + ' و' + ORD_TENS[t] : ORD_TENS[t];
    }
    if (n === 100) return 'المئة';
    return toIndic(n);
  }

  function formatVolume(layer, n) {
    const v = (layer && layer.volume) || { digits: 'indic', template: '{n}' };
    const value = v.digits === 'ordinal' ? ordinal(n) : v.digits === 'ordinal_vol' ? 'المجلد ' + ordinal(n) : v.digits === 'latin' ? String(n) : toIndic(n);
    return (v.template || '{n}').split('{n}').join(value);
  }

  /** النص النهائي لطبقة نص (مع بيانات الكتاب القادمة من الموقع الأساسي إن وُجدت) */
  function textFor(layer, rs, data) {
    if (layer.role === 'volume') return formatVolume(layer, rs.volume);
    const t = rs.texts[layer.id];
    // بيانات الكتاب من الموقع (حتى الفارغة: كتاب بلا عنوان فرعي لا يُكتب فيه نص التصميم التجريبي)
    const has = data && Object.prototype.hasOwnProperty.call(data, layer.role) && data[layer.role] != null;
    if (has && t && t.text === layer.text) return String(data[layer.role]);
    return t ? t.text : layer.text;
  }

  /** هل يملك المستخدم أي تحكم بهذا التصميم؟ (لإخفاء الأقسام الفارغة) */
  function userControls(design) {
    const { groups } = colorGroups(design);
    return {
      variants: design.layers.filter((l) => l.type === 'image' && l.user.variant && l.variants.filter((v) => v.offered).length > 1),
      colorGroups: groups.filter((g) => g.some((t) => t.userEditable) && g.some((t) => t.kind === 'image')),
      texts: design.layers.filter((l) => l.type === 'text' && Object.values(l.user).some(Boolean)),
      hides: design.layers.filter((l) => l.type === 'image' && l.user.hide),
      movable: design.layers.filter((l) => (l.type === 'image' || l.type === 'text') && l.user.move),
    };
  }

  /** ملخص للمعرض (بلا تفاصيل الطبقات) */
  function summary(d) {
    return { id: d.id, kind: d.kind || 'front', name: d.name, thumb: d.thumb, palette: d.palette, published: d.published, order: d.order, updatedAt: d.updatedAt, ratio: d.canvas.heightCm / d.canvas.widthCm, widthCm: d.canvas.widthCm, heightCm: d.canvas.heightCm };
  }

  /* ---------------------------------------------------------------- */
  /* إضافات المستخدم: صوره بدائلَ في الطبقات، ونصوصه الحرة              */
  /* ---------------------------------------------------------------- */

  const USER_SRC = /^(data:image\/(png|jpeg|webp);base64,|blob:|\/covers-media\/)/;
  const MAX_USER_TEXTS = 8;

  /** نص حر جديد للمستخدم في وسط الغلاف */
  function makeUserText(design, o) {
    const { w, h } = canvasDims(design.canvas);
    const bw = Math.round(Math.min(w - 40, design.kind === 'spine' ? w - 16 : w * 0.7));
    return Object.assign({
      id: uid('ut'), text: 'نصك هنا', font: 'Amiri', weight: 400, size: design.kind === 'spine' ? 36 : 42, color: '#ffffff',
      align: 'center', justify: false, lineHeight: 1.5, orient: 'h',
      box: { x: Math.round((w - bw) / 2), y: Math.round(h * 0.45), w: bw, h: Math.round(design.kind === 'spine' ? 160 : h * 0.18) },
    }, o || {});
  }

  /**
   * التصميم كما يراه المستخدم: صوره التي أضافها بدائلَ في طبقاتها، ونصوصه الحرة طبقاتٍ فوق التصميم.
   * لا يغيّر التصميم الأصلي (نسخة سطحية).
   */
  function effective(design, state) {
    const s = state || {};
    const uv = s.userVariants && typeof s.userVariants === 'object' ? s.userVariants : null;
    const ut = Array.isArray(s.userTexts) ? s.userTexts.slice(0, MAX_USER_TEXTS) : [];
    if (!(uv && Object.keys(uv).length) && !ut.length) return design;
    const out = Object.assign({}, design);
    out.layers = design.layers.map((l) => {
      const list = uv && l.type === 'image' && Array.isArray(uv[l.id]) ? uv[l.id] : null;
      if (!list || !list.length || !design.allowUserImages) return l;
      const extra = list.filter((v) => v && typeof v.src === 'string' && USER_SRC.test(v.src)).slice(0, 6).map((v) => ({
        id: safeId(v.id) || uid('uv'), label: str(v.label, 'صورتك', 40), name: '', src: v.src,
        mode: v.mode === 'none' ? 'none' : oneOf(v.mode, Object.keys(MODES), 'none'), fit: oneOf(l.userFit, USER_FITS, 'slot'), offered: true, user: true,
        x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 100, 1), h: num(v.h, 100, 1), iw: num(v.iw, 0), ih: num(v.ih, 0),
      }));
      return extra.length ? Object.assign({}, l, { variants: l.variants.concat(extra) }) : l;
    });
    if (design.allowUserText) {
      for (const t of ut) {
        if (!t || typeof t !== 'object') continue;
        const b = t.box || {};
        out.layers.push({
          id: safeId(t.id) || uid('ut'), type: 'text', section: 'cover', name: 'نصك', role: 'custom', userText: true,
          text: str(t.text, '', 1200), font: str(t.font, 'Amiri', 80), weight: num(t.weight, 400, 100, 900),
          size: num(t.size, 40, 6, 400), minSize: Math.min(num(t.size, 40, 6, 400), 10), autoFit: true, maxLines: 30,
          lineHeight: num(t.lineHeight, 1.5, 0.6, 3), align: t.justify ? 'justify' : oneOf(t.align, ['right', 'center', 'left'], 'center'),
          orient: oneOf(t.orient, Object.keys(ORIENTS), 'h'), fit: 'keep',
          box: { x: num(b.x, 0), y: num(b.y, 0), w: num(b.w, 300, 10), h: num(b.h, 100, 10) },
          color: hex(t.color, '#000000'), strokes: [], visible: true, lock: false,
          volume: { digits: 'indic', template: '{n}' },
          user: { text: false, font: false, size: false, color: false, move: true, strokes: false, hide: false },
        });
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* الكعب: عرضه من عدد الصفحات ونوع الورق، وتكييف التصميم مع العرض      */
  /* ---------------------------------------------------------------- */

  function cleanPaper(p) {
    p = p && typeof p === 'object' ? p : {};
    const id = p.id === 'gsm' || p.id === 'mic' || PAPERS.some((x) => x.id === p.id) ? p.id : DEFAULT_PAPER.id;
    return { id, gsm: num(p.gsm, DEFAULT_PAPER.gsm, 30, 400), bulk: oneOf(p.bulk, Object.keys(BULKS), DEFAULT_PAPER.bulk), mic: num(p.mic, DEFAULT_PAPER.mic, 30, 600) };
  }
  /** سماكة الورقة الواحدة (مم) */
  function caliper(paper) {
    const p = cleanPaper(paper);
    if (p.id === 'gsm') return (p.gsm * BULKS[p.bulk].k) / 1000;
    if (p.id === 'mic') return p.mic / 1000;
    return PAPERS.find((x) => x.id === p.id).mm;
  }
  function paperLabel(paper) {
    const p = cleanPaper(paper);
    if (p.id === 'gsm') return BULKS[p.bulk].label + ' ' + toIndic(p.gsm) + ' غ';
    if (p.id === 'mic') return 'سماكة ' + toIndic(p.mic) + ' ميكرون';
    return PAPERS.find((x) => x.id === p.id).label;
  }
  /** عرض الكعب (مم): الأوراق = نصف عدد الصفحات، × سماكة الورقة، + سماح كرتون الغلاف */
  function spineWidth(pages, paper) {
    const n = Math.max(2, Math.floor(Number(pages) || 0));
    const sheets = Math.ceil(n / 2);
    const t = caliper(paper);
    const mm = Math.round((sheets * t + COVER_ALLOW) * 10) / 10;
    return { pages: n, sheets, caliper: t, block: sheets * t, mm, cm: mm / 10 };
  }

  /**
   * تكييف تصميم الكعب مع عرض الكتاب الحقيقي (سم):
   *  - أعرض من الطبيعي: يُمطّ التصميم عرضاً.
   *  - أضيق: يُضكّ (squeeze) أو تُقصّ أطرافه يميناً ويساراً (crop) بحسب إعداده.
   *  - النص: يكبر ويصغر بالنسبة نفسها (scale) أو يبقى بحجمه (keep).
   * يعيد نسختين معدّلتين من التصميم والحالة المحلولة، يرسمهما المُصيِّر كأي غلاف.
   */
  function fitSpine(design, rs, cm) {
    if (!design || design.kind !== 'spine' || !(cm > 0)) return { design, rs, k: 1 };
    const n = design.canvas.widthCm;
    const k = cm / n;
    if (Math.abs(k - 1) < 0.002) return { design, rs, k: 1 };
    const crop = k < 1 && design.spine && design.spine.fitNarrow === 'crop';
    const sx = crop ? 1 : k;
    const W0 = canvasDims(design.canvas).w;
    const canvas = Object.assign({}, design.canvas, { widthCm: cm });
    const W1 = canvasDims(canvas).w;
    const offX = crop ? (W0 - W1) / 2 : 0;
    const d = Object.assign({}, design, { canvas });
    const r = Object.assign({}, rs, { texts: Object.assign({}, rs.texts), offset: Object.assign({}, rs.offset) });
    d.layers = design.layers.map((l) => {
      if (l.type === 'image') {
        const o = r.offset[l.id];
        if (o) r.offset[l.id] = { dx: o.dx * sx, dy: o.dy };
        return Object.assign({}, l, { variants: l.variants.map((v) => Object.assign({}, v, { x: v.x * sx - offX, w: v.w * sx })) });
      }
      const mode = l.fit && l.fit !== 'auto' ? l.fit : (design.spine && design.spine.textFit) || 'scale';
      const f = mode === 'scale' ? k : 1;
      const cx = (l.box.x + l.box.w / 2) * sx - offX;
      const bw = mode === 'scale' ? l.box.w * k : Math.min(l.box.w, Math.max(4, W1 - 4));
      const t = r.texts[l.id];
      if (t) r.texts[l.id] = Object.assign({}, t, { size: t.size * f, dx: (t.dx || 0) * sx, strokes: t.strokes.map((x) => Object.assign({}, x, { width: x.width * f })) });
      return Object.assign({}, l, { size: l.size * f, minSize: l.minSize * f, box: { x: cx - bw / 2, y: l.box.y, w: bw, h: l.box.h } });
    });
    return { design: d, rs: r, k };
  }

  return {
    MAX_STROKES, SECTIONS, MODES, FITS, USER_FITS, ROLES, DIGITS, ORIGINAL, BUILTIN_FONTS,
    KINDS, KIND_LIST, UNITS_PER_CM, ORIENTS, ALIGNS, TEXT_FITS, PAPERS, BULKS, COVER_ALLOW, DEFAULT_PAPER, MAX_USER_TEXTS, BOOK_LINKS, BOOK_DEFAULT,
    bookColor, cleanBook,
    uid, clone, hex, canvasDims, safeSrc,
    effective, makeUserText, cleanPaper, caliper, paperLabel, spineWidth, fitSpine,
    makeVariant, makeImageLayer, makeTextLayer, blankDesign, normalizeDesign,
    targetsOf, colorGroups, groupOf, cleanLinks, addLink, removeLink, setDesignColor, getDefaultColor,
    matchVariant, linkedImageLayers,
    emptyState, resolveState, setUserColor, setUserVariant, bundleLinkedColors,
    toIndic, ordinal, formatVolume, textFor, userControls, summary,
  };
});
