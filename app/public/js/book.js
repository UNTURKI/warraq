// قارئ ورّاق: الكتاب كما يُمسك باليد.
// يُفتح من زر «معاينة» بعد الإخراج: كتابٌ مغلق بغلافه الخارجي يُدار باليد في كل اتجاه، ثم يُفتح غلافه،
// وتُقلَّب أوراقه من اليسار إلى اليمين كما يُقرأ الكتاب العربي. والورقة تُطوى تحت الإصبع من أي ركن
// كالورق الحقيقي، وتتبعه حيث ذهب. لون الجلد (الدفّتان والكعب) هو لون خلفية الغلاف الخارجي المختار.
// الصفحات هي صفحات ملف PDF نفسه (يرسمها pdf.js في المتصفح)، فما تراه هنا هو ما ستطبعه.

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

let pdfjsP = null;
const loadPdfjs = () =>
  (pdfjsP ||= import('/vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  }));
let cssP = null;
const loadCss = () =>
  (cssP ||= new Promise((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/css/book.css';
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
  }));

/* ------------------------------------------------------------------ الألوان */
const hex = (r, g, b) => '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
const rgbOf = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (h) => { const [r, g, b] = rgbOf(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const mixHex = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hex(...x.map((v, i) => v + (y[i] - v) * t)); };
const validHex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim() : null);

/** لون خلفية الغلاف من صورته (إن لم يُعرف اللون المختار): أكثر ألوان الحافة تكراراً */
async function coverColor(src) {
  if (!src) return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = 60, H = 84;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const bins = new Map();
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      if (!(y < 3 || y >= H - 3 || xx < 3 || xx >= W - 3)) continue;
      const i = (y * W + xx) * 4;
      const k = [d[i] >> 3, d[i + 1] >> 3, d[i + 2] >> 3].join(',');
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      bins.set(k, b);
    }
    const top = [...bins.values()].sort((a, b) => b.n - a.n)[0];
    return top ? hex(top.r / top.n, top.g / top.n, top.b / top.n) : null;
  } catch {
    return null;
  }
}

/** الجلد بلونه نفسه تماماً، وما حوله يُشتق منه */
function palette(cloth) {
  const dark = lumOf(cloth) < 0.55;
  return {
    cloth,
    clothD: mixHex(cloth, '#000000', 0.3),
    clothL: mixHex(cloth, '#ffffff', 0.14),
    ink: dark ? '#E6CC8A' : mixHex(cloth, '#000000', 0.68),
    end: mixHex('#F6EEDD', cloth, 0.14),
    room: mixHex(cloth, '#0d0906', 0.86),
  };
}

const LOGO = '<svg viewBox="0 0 40 72" aria-hidden="true"><path d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z"/><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07zM12 14.14l7.07 7.07L12 28.28l-7.07-7.07zM12 28.28l7.07 7.07L12 42.42l-7.07-7.07zM12 42.42l7.07 7.07L12 56.56l-7.07-7.07zM12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></svg>';
const ICON = {
  toc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M20 6H9M20 12H9M20 18H9"/><path d="M5 5.2l1 1-1 1-1-1zM5 11.2l1 1-1 1-1-1zM5 17.2l1 1-1 1-1-1z" fill="currentColor"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>',
  turn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/></svg>',
  paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z" fill="currentColor" fill-opacity=".18"/><path d="M15 3v4h4M9 12h7M9 15.5h7"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  lesson: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"/></svg>',
  notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h10l3 3v15H6z"/><path d="M9.5 9h6M9.5 12.5h6M9.5 16h3.5"/><path d="M4 6v15"/></svg>',
  find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
  // سهما التقليب: ريشة قلم تشير إلى جهة الورقة
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/><path d="M4 12h11.5" opacity=".55"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/><path d="M20 12H8.5" opacity=".55"/></svg>',
  pages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke-linecap="round"/></svg>',
  book3d: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z"/><path d="M12 6.5v13"/></svg>',
  scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="8" rx="1"/><rect x="6" y="13.5" width="12" height="8" rx="1"/></svg>',
  flipH: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><rect x="2.5" y="5" width="8" height="14" rx="1"/><rect x="13.5" y="5" width="8" height="14" rx="1"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M12 7.6c.5 2.5 1.9 3.9 4.4 4.4-2.5.5-3.9 1.9-4.4 4.4-.5-2.5-1.9-3.9-4.4-4.4 2.5-.5 3.9-1.9 4.4-4.4z" fill="currentColor" stroke="none"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>',
};

/* ------------------------------------------------------------------ هندسة الطيّ */
/** قصّ مضلّع بنصف مستوٍ: يبقى ما كان (X-M)·n في جهة keep (+1 أو -1) */
function clipPoly(poly, M, n, keep) {
  const side = (p) => keep * ((p.x - M.x) * n.x + (p.y - M.y) * n.y);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
const polyCss = (pts, dx = 0) => (pts.length >= 3 ? `polygon(${pts.map((p) => `${(p.x - dx).toFixed(2)}px ${p.y.toFixed(2)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)');

/** حلّ مصفوفة ٣×٣ (للعودة من نقطة على الشاشة إلى سطح الكتاب) */
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/**
 * @param {object} o
 * @param {Blob} o.blob          ملف PDF
 * @param {string} [o.outer]     صورة الغلاف الخارجي (data URL)؛ وهي أول صفحة في الملف إن وُجدت
 * @param {string} [o.cloth]     لون خلفية الغلاف المختار (يُقدَّم على قراءته من الصورة)
 * @param {string} [o.back]      صورة الغلاف الخلفي المختار (وإلا فالخلفية الافتراضية بشعار ورّاق)
 * @param {string} [o.spine]     صورة الكعب المختار كما يُطبع (وإلا فكعبٌ جلديّ بعنوان الكتاب)
 * @param {string} [o.title] [o.author] [o.vol]
 * @param {string} [o.fileName]  اسم الملف عند التنزيل
 * @param {string} [o.fallbackColor]  لون الجلد إن لم يكن غلاف خارجي
 */
export async function openBook(o) {
  await loadCss();
  // الكعب المختار: صورته تُرسم على الكعب (تُحمَّل قبل البناء)
  let spineImg = null;
  if (o.spine) {
    try {
      const im = new Image();
      im.src = o.spine;
      await im.decode();
      spineImg = im;
    } catch {}
  }
  const backHtml = () => (o.back ? `<img src="${o.back}" alt="الغلاف الخلفي">` : `<div class="bk-stamp">${LOGO}</div>`);
  const prevFocus = document.activeElement;
  const room = document.createElement('div');
  room.className = 'bk-room is-loading';
  room.setAttribute('role', 'dialog');
  room.setAttribute('aria-modal', 'true');
  room.setAttribute('aria-label', 'قراءة: ' + (o.title || 'الكتاب'));
  room.innerHTML = `
    <div class="bk-top">
      <div class="bk-name"><b>${esc(o.title || 'الكتاب')}</b>${o.vol ? `<span>${esc(o.vol)}</span>` : ''}${o.notebook ? `<button type="button" class="bk-nbren" data-act="nbren" title="أعد تسمية الدفتر" aria-label="أعد تسمية الدفتر"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button><input class="bk-nbrn" type="text" maxlength="80" dir="auto" aria-label="اسم الدفتر" hidden>` : ''}</div>
      <div class="bk-tools">
        <button type="button" class="bk-btn" data-act="toc" aria-pressed="false" title="الأبواب والفصول">${ICON.toc}<span>الأبواب</span></button>
        <button type="button" class="bk-btn" data-act="notes" aria-pressed="false" title="دفتري: ملاحظاتك وتظليلك وعلاماتك">${ICON.notes}<span>دفتري</span></button>
        <button type="button" class="bk-btn bk-aib" data-act="ai" aria-pressed="false" title="المساعد: اسأل عن الصفحة أو الدرس أو ما شئت (Ctrl+Shift+A)">${ICON.ai}<span>المساعد</span></button>
        ${typeof o.lesson === 'function' ? `<button type="button" class="bk-btn bk-lesson" data-act="lesson" aria-pressed="false" title="الدرس بجانب الكتاب: مقطعٌ أو صوتية من يوتيوب أو تيليجرام أو جهازك، وتفريغه إلى حواشيك (Ctrl+Shift+D)">${ICON.lesson}<span>الدرس</span></button>` : ''}
        <button type="button" class="bk-btn" data-act="view" title="صفحاتٌ مسطّحة (كالمحرر) أو الكتاب مجسَّماً">${ICON.pages}<span>صفحات</span></button>
        <button type="button" class="bk-btn" data-act="flow" hidden title="تمرير الصفحات إلى الأسفل، أو تقليبها يميناً ويساراً">${ICON.flipH}<span>تقليب</span></button>
        <button type="button" class="bk-btn" data-act="find" aria-pressed="false" title="البحث في الكتاب (Ctrl+F)">${ICON.find}<span>بحث</span></button>
        <button type="button" class="bk-btn" data-act="zoom" aria-pressed="false" title="تكبير الصفحة (+)">${ICON.zoom}<span>تكبير</span></button>
        <button type="button" class="bk-btn bk-paper" data-act="paper" aria-pressed="false" title="ورقٌ أصفر كورق الكتب الشرعية، أو أبيض — للقراءة وحدها: الكتاب نفسه لا يتغيّر">${ICON.paper}<span>ورق أصفر</span></button>
        <button type="button" class="bk-btn" data-act="reset" title="أعِد الكتاب إلى وضعه (أو انقر مرتين خارجه)">${ICON.turn}<span>الوضع الأول</span></button>
        <button type="button" class="bk-btn" data-act="full" title="ملء الشاشة">${ICON.full}<span>ملء الشاشة</span></button>
        <div class="bk-dlw">
          <button type="button" class="bk-btn" data-act="dlmenu" aria-haspopup="menu" aria-expanded="false" title="تنزيل">${ICON.dl}<span>تنزيل</span>${ICON.caret}</button>
          <div class="bk-menu" role="menu" hidden>
            <a role="menuitem" data-act="dl">${ICON.dl}<span>الكتاب كما هو <small>PDF</small></span></a>
            <button type="button" role="menuitem" data-act="dlnotes" data-dl="notes">${ICON.notes}<span>الكتاب بملاحظاتك <small>PDF: التظليل والقلم والنصوص والملاحظات</small></span></button>
            <button type="button" role="menuitem" data-act="dltxt" data-dl="notes">${ICON.toc}<span>ملاحظاتك وحدها <small>ملف نصي</small></span></button>
            <button type="button" role="menuitem" data-act="dlwaraq" hidden><i class="bk-wq" aria-hidden="true"></i><span></span></button>
          </div>
        </div>
        <div class="bk-morew" hidden>
          <button type="button" class="bk-btn" data-act="more" aria-haspopup="menu" aria-expanded="false" title="المزيد">${ICON.more}<span>المزيد</span></button>
          <div class="bk-menu bk-more" role="menu" hidden></div>
        </div>
        <button type="button" class="bk-btn bk-close" data-act="close" title="أغلق (Esc)">${ICON.x}<span>أغلق</span></button>
      </div>
    </div>
    <div class="bk-mid">
      <aside class="bk-toc" hidden aria-label="الأبواب والفصول"><div class="bk-toc-h"><b>الأبواب والفصول</b><button type="button" class="bk-toc-x" data-act="toc" aria-label="أغلق الأبواب">${ICON.x}</button></div><ol></ol></aside>
      <div class="bk-stage">
        <div class="bk-scene">
          <i class="bk-floor"></i>
          <div class="bk-book" dir="ltr">
            <div class="bk-half l"><i class="bk-bd"></i><i class="bk-edge"></i><div class="bk-face"></div></div>
            <div class="bk-half r"><i class="bk-bd"></i><i class="bk-edge"></i><div class="bk-face"></div></div>
            <div class="bk-gutter"></div>
            <div class="bk-box"></div>
            <div class="bk-obox"></div>
          </div>
        </div>
        <p class="bk-wait"><span class="spin" aria-hidden="true"><i></i><i></i><i></i></span> يُجهَّز الكتاب…</p>
        <p class="bk-hint"></p>
        <button type="button" class="bk-side prev" data-act="prev" aria-label="الصفحة السابقة" title="السابقة (→)">${ICON.prev}</button>
        <button type="button" class="bk-side next" data-act="next" aria-label="الصفحة التالية" title="التالية (←)">${ICON.next}</button>
      </div>
      <div class="bk-flat" tabindex="-1" hidden><div class="bk-fl-in"></div></div>
    </div>
    <div class="bk-bar">
      <button type="button" class="bk-nav prev" data-act="prev" title="السابقة (→)">${ICON.prev}<span>السابقة</span></button>
      <div class="bk-scrub"><input type="range" min="0" max="1" step="1" value="0" aria-label="الانتقال إلى صفحة"><output></output></div>
      <button type="button" class="bk-at" data-act="goto" title="انتقل إلى صفحة"></button>
      <button type="button" class="bk-zl" data-act="fit" hidden title="الحجم الملائم (Ctrl+العجلة للتكبير والتصغير)"></button>
      ${o.notebook ? `<button type="button" class="bk-nbadd" data-act="nbhead" title="بابٌ أو فصلٌ أعلى الصفحة: يُكتب فيها، ويظهر في «الأبواب»">＋ عنوان</button><button type="button" class="bk-nbadd" data-act="nbnew" title="صفحةٌ جديدة بقالبٍ تختاره (والتقليب بعد آخر صفحةٍ يفتح صفحةً جديدة)">＋ صفحة</button>` : ''}
      <button type="button" class="bk-nav next" data-act="next" title="التالية (←)"><span>التالية</span>${ICON.next}</button>
    </div>
    <div class="bk-toast" role="status" aria-live="polite" hidden></div>
    <div class="bk-nbmenu" hidden></div>
    <div class="bk-nbmenu bk-nbhead" hidden></div>
    <svg class="bk-defs" width="0" height="0" aria-hidden="true" focusable="false"><filter id="bkPaperY" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.953 0 0 0 0  0 0.906 0 0 0  0 0 0.769 0 0  0 0 0 1 0"/></filter></svg>`;
  if (o.notebook) room.classList.add('nb');
  document.body.appendChild(room);
  document.documentElement.classList.add('bk-open');
  const $ = (s) => room.querySelector(s);
  const book = $('.bk-book');
  const scene = $('.bk-scene');
  const halfL = $('.bk-half.l'), halfR = $('.bk-half.r');
  const fL = halfL.querySelector('.bk-face'), fR = halfR.querySelector('.bk-face');
  const stage = $('.bk-stage');
  const floor = $('.bk-floor');
  const scrub = $('.bk-scrub input');
  let url = URL.createObjectURL(o.blob);
  $('[data-act="dl"]').href = url;
  $('[data-act="dl"]').download = (o.fileName || o.title || 'الكتاب') + '.pdf';
  /* «وَرَق» مع PDF: o.waraq = { label, sub, href?, download?, run?(say) } (أو دالةٌ تعيده حين تُفتح القائمة) */
  let wq = null;
  function paintWaraq() {
    wq = typeof o.waraq === 'function' ? o.waraq() : o.waraq || wq;
    const it = $('[data-act="dlwaraq"]');
    it.hidden = !wq;
    if (wq) it.querySelector('span').innerHTML = `${esc(wq.label || 'الكتاب بصيغة «وَرَق»')} <small>${esc(wq.sub || 'يُحرَّر في ورّاق ويُخرج منه')}</small>`;
  }
  paintWaraq();
  async function runWaraq() {
    if (!wq) return;
    if (wq.href) {
      const a = document.createElement('a');
      a.href = wq.href;
      a.download = wq.download || (o.fileName || o.title || 'الكتاب') + '.waraq';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (!wq.run) return;
    const it = $('[data-act="dlwaraq"]');
    it.disabled = true;
    try {
      const next = await wq.run((msg, ms, action) => toast(msg, ms, action));
      if (next) {
        o.waraq = next;
        wq = next;
        paintWaraq();
      }
    } finally {
      it.disabled = false;
    }
  }
  $('.bk-close').focus();

  /* ---------------- الجلد: لون خلفية الغلاف الخارجي المختار */
  // (حافة الغلاف البيضاء — كصفحة عنوان مطبوعة جُعلت غلافاً — لا تصلح جلداً: يُؤخذ اللون الاحتياطي)
  const seen = validHex(o.cloth) ? null : await coverColor(o.outer);
  const pal = palette(validHex(o.cloth) || (seen && lumOf(seen) < 0.84 ? seen : null) || validHex(o.fallbackColor) || '#6B1D2F');
  for (const [k, v] of Object.entries(pal)) room.style.setProperty('--' + k, v);
  if (o.onTheme) try { o.onTheme(pal); } catch {}

  /* ---------------- الملف */
  let pdf;
  let pdfjs;
  let notes = null; // دفتر القارئ (book-notes.js)
  let ai = null; // مساعد الرَّحل (reader-ai.js)
  let closed = false;
  try {
    pdfjs = await loadPdfjs();
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await o.blob.arrayBuffer()), isEvalSupported: false }).promise;
  } catch (e) {
    $('.bk-wait').textContent = 'تعذّر فتح الملف: ' + (e && e.message ? e.message : e);
    return close;
  }
  const OFF = o.outer ? 1 : 0;
  // الغلاف الخلفي آخر صفحة في PDF ورّاق (صورةٌ بلا نص): يُرى ظهراً للكتاب، لا صفحةً أخيرة فيه
  async function backTail(doc) {
    if (!o.back || doc.numPages - OFF < 2) return 0;
    try {
      const t = await (await doc.getPage(doc.numPages)).getTextContent();
      return t.items.some((x) => (x.str || '').trim()) ? 0 : 1;
    } catch {
      return 0;
    }
  }
  let N = Math.max(1, pdf.numPages - OFF - (await backTail(pdf)));
  const vp0 = (await pdf.getPage(1 + OFF)).getViewport({ scale: 1 });
  const AR0 = vp0.width / vp0.height;
  const pageHpt = vp0.height;
  const heightMm = (vp0.height * 25.4) / 72;

  /* ---------------- الأوراق: الغلاف، ثم كل ورقة وجهاها صفحتان، ثم الدفّة الأخيرة */
  const leaves = [];
  let L = 0;
  function buildLeaves() {
    leaves.length = 0;
    leaves.push({ f: { k: 'cover' }, b: { k: 'end' } });
    for (let i = 1; i <= N; i += 2) leaves.push({ f: { k: 'pg', i }, b: i + 1 <= N ? { k: 'pg', i: i + 1 } : { k: 'blank' } });
    leaves.push({ f: { k: 'end' }, b: { k: 'back' } });
    L = leaves.length;
  }
  buildLeaves();
  const st = { s: 0, side: 'l', narrow: false, zoom: 1, busy: false, pw: 0, ph: 0, T: 0, rx: 0, ry: 0 };
  const faceL = (s) => (s >= 0 && s < L ? leaves[s].f : null);
  const faceR = (s) => (s > 0 && s <= L ? leaves[s - 1].b : null);
  const isClosed = (s = st.s) => s === 0 || s === L;
  // الميل الذي يُرى به الكتاب مغلقاً (يظهر كعبه وسُمكه)
  // ومفتوحاً يميل أعلاه عنك قليلاً كأنه على حامل: يُرى سُمك الأوراق في الجهتين
  // (وحين يُكتب على الصفحة يستوي الكتاب أمام القارئ)
  const restTilt = (s = st.s) => (s === 0 ? { rx: 9, ry: -24 } : s === L ? { rx: 9, ry: 24 } : notes && notes.active ? { rx: 0, ry: 0 } : { rx: 11, ry: 0 });

  /* ---------------- رسم الصفحات (pdf.js) مع ذاكرة صغيرة */
  const cache = new Map();
  const pending = new Map();
  let queue = Promise.resolve();
  const bucket = () => Math.ceil((st.ph * Math.min(2.5, window.devicePixelRatio || 1)) / 200) * 200;
  function pageUrl(i, hh) {
    const h = hh || bucket();
    const key = i + '@' + h;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const p = (queue = queue.then(async () => {
      if (closed) return '';
      const page = await pdf.getPage(i + OFF);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: h / v1.height });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const u = URL.createObjectURL(blob);
      cache.set(key, u);
      if (cache.size > 30) {
        const [k0, u0] = cache.entries().next().value;
        cache.delete(k0);
        URL.revokeObjectURL(u0);
      }
      return u;
    }).catch(() => ''));
    pending.set(key, p);
    p.finally(() => pending.delete(key));
    return p;
  }

  /* ---------------- وجه الصفحة */
  const coverHtml = () =>
    o.outer
      ? `<img src="${o.outer}" alt="الغلاف">`
      : `<div class="bk-cloth-cover"><div class="bk-frame"><b>${esc(o.title || '')}</b>${o.author ? `<span>${esc(o.author)}</span>` : ''}${o.vol ? `<em>${esc(o.vol)}</em>` : ''}</div></div>`;
  function fillFace(el, f, extra = '') {
    el.className = 'bk-face' + (f ? ' k-' + f.k : '') + (extra ? ' ' + extra : '');
    el.dataset.i = f && f.k === 'pg' ? f.i : '';
    if (!f) return void (el.innerHTML = '');
    if (f.k === 'cover') return void (el.innerHTML = coverHtml());
    if (f.k === 'back') return void (el.innerHTML = backHtml());
    if (f.k === 'end' || f.k === 'blank') return void (el.innerHTML = '');
    el.innerHTML = '<img alt="" decoding="async"><span class="spin bk-pload" aria-hidden="true"><i></i><i></i><i></i></span>';
    const img = el.firstChild;
    img.alt = 'الصفحة ' + ar(f.i);
    pageUrl(f.i).then((u) => {
      if (u && el.dataset.i === String(f.i)) {
        img.src = u;
        el.classList.add('ready');
      }
    });
    // ما كتبه القارئ على الصفحة (ويُكتب عليها إن كانت ظاهرة)
    if (notes) notes.decorate(el, f.i, el === fL || el === fR);
  }
  function prefetch() {
    for (let s = st.s - 1; s <= st.s + 2; s++) for (const f of [faceL(s), faceR(s)]) if (f && f.k === 'pg') pageUrl(f.i);
  }

  /* ---------------- المقاسات */
  function measure() {
    const W = stage.clientWidth, H = stage.clientHeight;
    st.narrow = Math.min(W, window.innerWidth) < 760;
    let ph = H * (st.narrow ? 0.84 : 0.82);
    let pw = ph * AR0;
    // (وعلى جانب المسرح شريط أدوات الدفتر: يُترك له مكانه في الجهتين ليبقى الكتاب في الوسط)
    const rail = !st.narrow && room.querySelector('.nt-rail') ? 150 : 0;
    const maxW = st.narrow ? W * 0.86 : ((W - rail) * 0.9) / 2;
    if (pw > maxW) { pw = maxW; ph = pw / AR0; }
    st.pw = Math.round(pw * st.zoom);
    st.ph = Math.round(ph * st.zoom);
    // سماكة الكتاب: نحو عُشر مليمتر لكل ورقة، ودفّتان
    st.T = Math.round(clamp((N / 2) * 0.1 * (st.ph / heightMm) + 8, 12, 70));
    room.style.setProperty('--pw', st.pw + 'px');
    room.style.setProperty('--ph', st.ph + 'px');
    room.style.setProperty('--t', st.T + 'px');
    // الصفحات مفتوحةً لا تستوي: تنحني نحو الكعب فينخفض طرفاها الأعلى والأسفل عنده قليلاً
    const d = clamp(st.ph * 0.012, 2, 9), Wp = st.pw, Hp = st.ph, n = 14;
    const curve = (toSpine) => {
      const top = [], bot = [];
      for (let i = 0; i <= n; i++) {
        const x = (Wp * i) / n;
        const k = toSpine(x) ** 3;
        top.push(`${x.toFixed(1)}px ${(d * k).toFixed(2)}px`);
        bot.unshift(`${x.toFixed(1)}px ${(Hp - d * k).toFixed(2)}px`);
      }
      return `polygon(${[...top, ...bot].join(',')})`;
    };
    room.style.setProperty('--curveL', curve((x) => x / Wp));
    room.style.setProperty('--curveR', curve((x) => 1 - x / Wp));
    room.classList.toggle('narrow', st.narrow);
    railAt(stage);
  }
  /** موضع المسرح في الوسط (لأدوات الدفتر فوقه) */
  function railAt(el) {
    const mr = $('.bk-mid').getBoundingClientRect(), sr = el.getBoundingClientRect();
    room.style.setProperty('--sl', Math.round(sr.left - mr.left) + 'px');
    room.style.setProperty('--sc', Math.round(sr.left - mr.left + sr.width / 2) + 'px');
    room.style.setProperty('--sw', Math.round(sr.width) + 'px');
  }

  /* ---------------- موضع الكتاب ودورانه */
  // مغلقاً يتوسّط غلافُه، ومفتوحاً تتوسّط حاشيتُه؛ وفي الجوال تتوسّط الصفحةُ المقروءة
  function shiftOf(s = st.s, side = st.side) {
    if (st.zoom > 1) return 0;
    const h = st.pw / 2;
    if (s === 0) return h;
    if (s === L) return -h;
    if (st.narrow) return side === 'l' ? h : -h;
    return 0;
  }
  let cur = { x: 0 }; // الإزاحة الحالية
  let hoverFold = null; // ورقة رفع الماوس ركنها
  // محور الدوران: مغلقاً وسط الكتاب نفسه (وسط سُمكه)، ومفتوحاً الكعب
  function origin(s = st.s) {
    if (s === 0) return { x: st.pw / 2, y: st.ph / 2, z: -st.T / 2 };
    if (s === L) return { x: st.pw * 1.5, y: st.ph / 2, z: -st.T / 2 };
    return { x: st.pw, y: st.ph / 2, z: 0 };
  }
  let org = { x: 0, y: 0, z: 0 };
  function applyTransform() {
    book.style.transformOrigin = `${org.x}px ${org.y}px ${org.z}px`;
    book.style.transform = `translateX(${cur.x}px) rotateX(${st.rx}deg) rotateY(${st.ry}deg)`;
    // الكعب والحواف تظهر بقدر ميل الكتاب
    room.style.setProperty('--tiltK', Math.min(1, (Math.abs(st.ry) + Math.abs(st.rx)) / 14).toFixed(3));
    // الظل على الأرض تحت الكتاب: لا يدور معه، بل يتسع ويضيق بقدر ما يُرى منه
    const ry = (st.ry * Math.PI) / 180;
    const closedNow = isClosed();
    const w = closedNow ? st.pw * Math.abs(Math.cos(ry)) + st.T * Math.abs(Math.sin(ry)) : 2 * st.pw * Math.abs(Math.cos(ry));
    const cx = closedNow ? (st.s === 0 ? st.pw / 2 : st.pw * 1.5) + cur.x : st.pw + cur.x;
    floor.style.width = Math.max(40, w * 1.04) + 'px';
    floor.style.left = cx + 'px';
  }
  function setOrigin(s) {
    org = origin(s);
  }

  /* ---------------- الكتاب المغلق مجسَّماً */
  // نسيج الكعب: جلدٌ بضوئه، وعنوان الكتاب ومجلده بالذهب، وشريطان أعلى وأسفل
  let spineTex = { key: '', url: '' };
  function spineTexture(len, H) {
    const key = [len, H, pal.cloth, spineImg ? 1 : 0].join('|');
    if (spineTex.key === key) return spineTex.url;
    const k = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.round(len * k));
    c.height = Math.round(H * k);
    const x = c.getContext('2d');
    x.scale(k, k);
    if (spineImg) {
      // الكعب المختار كما يُطبع: صورته على عرض الكعب كله، وظلٌّ خفيف عند طرفيه ليبقى مستديراً
      x.imageSmoothingQuality = 'high';
      x.drawImage(spineImg, 0, 0, len, H);
      const sh = x.createLinearGradient(0, 0, len, 0);
      sh.addColorStop(0, 'rgba(0,0,0,.28)');
      sh.addColorStop(0.18, 'rgba(0,0,0,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,.06)');
      sh.addColorStop(0.82, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,.28)');
      x.fillStyle = sh;
      x.fillRect(0, 0, len, H);
      spineTex = { key, url: c.toDataURL('image/png') };
      return spineTex.url;
    }
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, pal.clothD);
    g.addColorStop(0.22, pal.cloth);
    g.addColorStop(0.5, pal.clothL);
    g.addColorStop(0.78, pal.cloth);
    g.addColorStop(1, pal.clothD);
    x.fillStyle = g;
    x.fillRect(0, 0, len, H);
    // نسيج الجلد: حبيبات خفيفة
    for (let i = 0; i < (len * H) / 60; i++) {
      x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.035)';
      x.fillRect(Math.random() * len, Math.random() * H, 1.2, 1.2);
    }
    x.strokeStyle = pal.ink;
    x.globalAlpha = 0.75;
    for (const yy of [H * 0.09, H * 0.09 + 5, H * 0.91, H * 0.91 - 5]) {
      x.beginPath();
      x.moveTo(len * 0.06, yy);
      x.lineTo(len * 0.94, yy);
      x.lineWidth = 1;
      x.stroke();
    }
    x.globalAlpha = 1;
    // العنوان: من أعلى إلى أسفل كما يُكتب على كعوب الكتب العربية
    const text = [o.title, o.vol].filter(Boolean).join('    ');
    if (len >= 12 && text) {
      x.save();
      x.translate(len / 2, H * 0.5);
      x.rotate(Math.PI / 2);
      const fs = clamp(len * 0.42, 8, 22);
      x.font = `700 ${fs}px "Adwa Assalaf", "Amiri", serif`;
      x.direction = 'rtl';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      let t = text;
      while (x.measureText(t).width > H * 0.7 && t.length > 4) t = t.slice(0, -2);
      if (t !== text) t = t.trim() + '…';
      x.fillStyle = pal.ink;
      x.fillText(t, 0, 0);
      x.restore();
    }
    spineTex = { key, url: c.toDataURL('image/png') };
    return spineTex.url;
  }
  /** نصف قطر زوايا الدفتر (الكتاب حادّ الزوايا: ٠) */
  const roundOf = (W) => (o.notebook ? clamp(Math.round(W * 0.045), 6, 16) : 0);
  /**
   * حافّةٌ مقوّسة عند زاويةٍ مستديرة: شرائط قصيرة على ربع دائرة (في x,y) عمقها من z0 إلى z1.
   * الزوايا a0→a1 بالدرجات (y إلى الأسفل)، والوجه إلى الخارج. flip: الكتاب معكوساً (x ← W−x).
   */
  function cornerStrips(parts, { cx, cy, r, a0, a1, z0, z1, cls, flip = null }) {
    const K = 4;
    let pts = Array.from({ length: K + 1 }, (_, i) => {
      const a = ((a0 + ((a1 - a0) * i) / K) * Math.PI) / 180;
      const x = cx + r * Math.cos(a);
      return { x: flip == null ? x : flip - x, y: cy + r * Math.sin(a) };
    });
    if (flip != null) pts = pts.reverse();
    for (let i = 0; i < K; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const th = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      parts.push(`<i class="bx ${cls}" style="left:0;top:0;width:${(len + 0.6).toFixed(2)}px;height:${(z1 - z0).toFixed(2)}px;transform-origin:0 0;transform:translate3d(${a.x.toFixed(2)}px,${a.y.toFixed(2)}px,${z0.toFixed(2)}px) rotateZ(${th.toFixed(2)}deg) rotateX(90deg)"></i>`);
    }
  }
  /**
   * يبني الكتاب مغلقاً فوق النصف الظاهر. الإحداثيات: x عبر الغلاف (الكعب عند W)، y من أعلاه، z إلى داخله (0 الغلاف، -T الظهر).
   * mirror: الكتاب مغلقاً من آخره (الظهر أمامك والكعب يساراً).
   */
  function buildBox(mirror) {
    const box = $('.bk-box');
    const W = st.pw, H = st.ph, T = st.T;
    box.style.left = mirror ? W + 'px' : '0px';
    const R = roundOf(W); // الدفتر: زوايا مستديرة
    const sig = [W, H, T, mirror ? 1 : 0, pal.cloth, R].join('|');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const bt = clamp(Math.round(T * 0.07), 2, 4); // سُمك الدفّة
    const sq = clamp(Math.round(W * 0.012), 2, 5); // زيادة الدفّة على الورق
    const bulge = T * 0.17; // تقوّس الكعب
    const conc = T * 0.11; // تقعّر حافة الأوراق
    const X = (x) => (mirror ? W - x : x);
    const parts = [];
    /** سطحٌ رأسي من p0 إلى p1 (في x,z)، وجهه إلى يمين اتجاهه */
    const vstrip = (p0, p1, y0, y1, cls, extra = '') => {
      let a = { x: X(p0.x), z: p0.z }, b = { x: X(p1.x), z: p1.z };
      if (mirror) [a, b] = [b, a];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const th = (Math.atan2(-dz, dx) * 180) / Math.PI;
      parts.push(`<i class="bx ${cls}" style="left:${a.x.toFixed(2)}px;top:${y0}px;width:${(len + 0.6).toFixed(2)}px;height:${y1 - y0}px;transform:translateZ(${a.z.toFixed(2)}px) rotateY(${th.toFixed(3)}deg);${extra}"></i>`);
    };
    /** سطحٌ أفقي (أعلى أو أسفل) بشكل مضلّع في x,z */
    const hface = (pts, y, up, cls) => {
      const P = pts.map((p) => ({ x: X(p.x), z: p.z }));
      const minX = Math.min(...P.map((p) => p.x)), maxX = Math.max(...P.map((p) => p.x));
      const w = maxX - minX + 1;
      // أعلى: الأصل أسفل العنصر و rotateX(90)؛ v=T عند z=0. أسفل: الأصل أعلاه و rotateX(-90)؛ v=-z
      const poly = P.map((p) => `${(p.x - minX).toFixed(2)}px ${(up ? p.z + T : -p.z).toFixed(2)}px`).join(',');
      const style = up
        ? `left:${minX.toFixed(2)}px;top:${y - T}px;width:${w.toFixed(2)}px;height:${T}px;transform-origin:50% 100%;transform:rotateX(90deg)`
        : `left:${minX.toFixed(2)}px;top:${y}px;width:${w.toFixed(2)}px;height:${T}px;transform-origin:50% 0;transform:rotateX(-90deg)`;
      parts.push(`<i class="bx ${cls}" style="${style};clip-path:polygon(${poly})"></i>`);
    };
    const K = 10;
    // الكعب: قوسٌ من حافة الغلاف إلى حافة الظهر، ينتفخ إلى الخارج
    const arc = Array.from({ length: K + 1 }, (_, i) => {
      const t = i / K;
      return { x: W + bulge * Math.sin(Math.PI * t), z: -T * t };
    });
    let arcLen = 0;
    const segs = [];
    for (let i = 0; i < K; i++) {
      const l = Math.hypot(arc[i + 1].x - arc[i].x, arc[i + 1].z - arc[i].z);
      segs.push(arcLen);
      arcLen += l;
    }
    const tex = spineTexture(Math.round(arcLen), H);
    for (let i = 0; i < K; i++) {
      // (عند الانعكاس يُقرأ النسيج من الطرف الآخر ليبقى العنوان معتدلاً)
      const off = mirror ? arcLen - segs[i] - Math.hypot(arc[i + 1].x - arc[i].x, arc[i + 1].z - arc[i].z) : segs[i];
      vstrip(arc[i], arc[i + 1], 0, H, 'spine', `background:url(${tex}) ${(-off).toFixed(2)}px 0/${arcLen.toFixed(2)}px ${H}px`);
    }
    // رأس الكعب وذيله: الجلد المنحني وتحته شريطة الحبك
    const capPts = [...arc, { x: W, z: -T }, { x: W, z: 0 }];
    hface(capPts, 0, true, 'cap');
    hface(capPts, H, false, 'cap');
    // الدفّتان: حوافّهما (أعلى وأسفل وجهة الأوراق)
    for (const [z0, z1] of [[-bt, 0], [-T, -T + bt]]) {
      const rect = [{ x: R, z: z0 }, { x: W, z: z0 }, { x: W, z: z1 }, { x: R, z: z1 }];
      hface(rect, 0, true, 'board-edge');
      hface(rect, H, false, 'board-edge');
      vstrip({ x: 0, z: z0 }, { x: 0, z: z1 }, R, H - R, 'board-edge');
      if (R) {
        const flip = mirror ? W : null;
        cornerStrips(parts, { cx: R, cy: R, r: R, a0: 180, a1: 270, z0, z1, cls: 'board-edge', flip });
        cornerStrips(parts, { cx: R, cy: H - R, r: R, a0: 90, a1: 180, z0, z1, cls: 'board-edge', flip });
      }
    }
    // كتلة الأوراق: أصغر من الدفّتين، وحافتها الأمامية مقعّرة
    const z0 = -T + bt, z1 = -bt;
    const fore = Array.from({ length: K + 1 }, (_, i) => {
      const t = i / K;
      return { x: sq + conc * 4 * t * (1 - t), z: z0 + (z1 - z0) * t };
    });
    const rb = Math.max(0, R - sq); // زوايا الأوراق تتبع زوايا الدفّتين
    const block = [...fore.map((p) => ({ x: p.x + rb, z: p.z })), { x: W, z: z1 }, { x: W, z: z0 }];
    hface(block, sq, true, 'pages-top');
    hface(block, H - sq, false, 'pages-top');
    for (let i = 0; i < K; i++) vstrip(fore[i], fore[i + 1], sq + rb, H - sq - rb, 'pages-fore');
    if (rb)
      for (let i = 0; i < K; i++) {
        const xo = (fore[i].x + fore[i + 1].x) / 2 + rb, za = fore[i].z, zb = fore[i + 1].z;
        const flip = mirror ? W : null;
        cornerStrips(parts, { cx: xo, cy: sq + rb, r: rb, a0: 180, a1: 270, z0: za, z1: zb, cls: 'pages-corner', flip });
        cornerStrips(parts, { cx: xo, cy: H - sq - rb, r: rb, a0: 90, a1: 180, z0: za, z1: zb, cls: 'pages-corner', flip });
      }
    // الوجه الآخر: ظهر الكتاب (أو غلافه حين يُرى الكتاب من آخره)
    parts.push(`<div class="bx far${mirror ? ' is-cover' : ''}" style="left:0;top:0;width:${W}px;height:${H}px;transform:translateZ(${-T}px) rotateY(180deg)">${mirror ? coverHtml() : backHtml()}</div>`);
    box.innerHTML = parts.join('');
  }

  /**
   * الكتاب مفتوحاً مجسَّماً: تحت كل صفحة كتلةُ أوراقها (ما بقي يساراً وما قُرئ يميناً) بسُمكها الحقيقي، ثم الدفّة.
   * الإحداثيات: x عبر الكتاب (الكعب عند W)، z إلى الداخل (0 سطح الصفحتين).
   */
  function buildOpen(done) {
    const box = $('.bk-obox');
    const W = st.pw, H = st.ph, T = st.T;
    const bt = clamp(Math.round(T * 0.07), 2, 4);
    const Tp = Math.max(4, T - 2 * bt);
    const hL = Math.max(1.5, Tp * clamp(1 - done, 0, 1)), hR = Math.max(1.5, Tp * clamp(done, 0, 1));
    room.style.setProperty('--hL', hL.toFixed(2) + 'px');
    room.style.setProperty('--hR', hR.toFixed(2) + 'px');
    const R = roundOf(W), rp = Math.round(R * 0.7); // الدفتر: زوايا الدفّتين والأوراق مستديرة
    const sig = [W, H, T, hL.toFixed(1), hR.toFixed(1), pal.cloth, R].join('|');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    const D = T + 12; // ارتفاع عناصر الأوجه الأفقية (يتسع لكل عمق)
    const parts = [];
    const vstrip = (a, b, y0, y1, cls) => {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const th = (Math.atan2(-dz, dx) * 180) / Math.PI;
      parts.push(`<i class="bx ${cls}" style="left:${a.x.toFixed(2)}px;top:${y0}px;width:${(len + 0.6).toFixed(2)}px;height:${y1 - y0}px;transform:translateZ(${a.z.toFixed(2)}px) rotateY(${th.toFixed(3)}deg)"></i>`);
    };
    const hface = (pts, y, up, cls) => {
      const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
      const poly = pts.map((p) => `${(p.x - minX).toFixed(2)}px ${(up ? p.z + D : -p.z).toFixed(2)}px`).join(',');
      const style = up
        ? `left:${minX.toFixed(2)}px;top:${y - D}px;width:${(maxX - minX + 1).toFixed(2)}px;height:${D}px;transform-origin:50% 100%;transform:rotateX(90deg)`
        : `left:${minX.toFixed(2)}px;top:${y}px;width:${(maxX - minX + 1).toFixed(2)}px;height:${D}px;transform-origin:50% 0;transform:rotateX(-90deg)`;
      parts.push(`<i class="bx ${cls}" style="${style};clip-path:polygon(${poly})"></i>`);
    };
    // زيادة الدفّة على الأوراق (تزيد بعمقها ليبقى طرفها ظاهراً حول الكتلة الأعلى منها)
    const ovr = (h) => ({ ox: 9 + h * 0.16, oy: 7 + h * 0.12 });
    for (const [side, h] of [['L', hL], ['R', hR]]) {
      const v = ovr(h);
      room.style.setProperty('--ox' + side, v.ox.toFixed(2) + 'px');
      room.style.setProperty('--oy' + side, v.oy.toFixed(2) + 'px');
    }
    for (const [x0, x1, h, outer] of [[0, W, hL, 0], [W, 2 * W, hR, 2 * W]]) {
      const { ox, oy } = ovr(h);
      // كتلة الأوراق: رأسها وذيلها وحافتها (أطراف الأوراق تنحني قليلاً نحو الكعب)
      const px0 = outer === 0 ? x0 + rp : x0, px1 = outer === 0 ? x1 : x1 - rp;
      const blk = [{ x: px0, z: 0 }, { x: px1, z: 0 }, { x: px1, z: -h }, { x: px0, z: -h }];
      hface(blk, 0, true, 'pages-top');
      hface(blk, H, false, 'pages-top');
      if (outer === 0) vstrip({ x: 0, z: -h }, { x: 0, z: 0 }, rp, H - rp, 'pages-fore');
      else vstrip({ x: outer, z: 0 }, { x: outer, z: -h }, rp, H - rp, 'pages-fore');
      // الدفّة تحتها: حوافّها
      const bx0 = outer === 0 ? -ox : W, bx1 = outer === 0 ? W : 2 * W + ox;
      const brd = [{ x: outer === 0 ? bx0 + R : bx0, z: -h }, { x: outer === 0 ? bx1 : bx1 - R, z: -h }, { x: outer === 0 ? bx1 : bx1 - R, z: -h - bt }, { x: outer === 0 ? bx0 + R : bx0, z: -h - bt }];
      hface(brd, -oy, true, 'board-edge');
      hface(brd, H + oy, false, 'board-edge');
      if (outer === 0) vstrip({ x: -ox, z: -h - bt }, { x: -ox, z: -h }, -oy + R, H + oy - R, 'board-edge');
      else vstrip({ x: 2 * W + ox, z: -h }, { x: 2 * W + ox, z: -h - bt }, -oy + R, H + oy - R, 'board-edge');
      if (R) {
        const L0 = outer === 0;
        const [tA, bA] = L0 ? [[180, 270], [90, 180]] : [[270, 360], [0, 90]];
        const pcx = L0 ? rp : outer - rp, bcx = L0 ? -ox + R : 2 * W + ox - R;
        cornerStrips(parts, { cx: pcx, cy: rp, r: rp, a0: tA[0], a1: tA[1], z0: -h, z1: 0, cls: 'pages-corner' });
        cornerStrips(parts, { cx: pcx, cy: H - rp, r: rp, a0: bA[0], a1: bA[1], z0: -h, z1: 0, cls: 'pages-corner' });
        cornerStrips(parts, { cx: bcx, cy: -oy + R, r: R, a0: tA[0], a1: tA[1], z0: -h - bt, z1: -h, cls: 'board-edge' });
        cornerStrips(parts, { cx: bcx, cy: H + oy - R, r: R, a0: bA[0], a1: bA[1], z0: -h - bt, z1: -h, cls: 'board-edge' });
      }
    }
    box.innerHTML = parts.join('');
  }

  /** حركة واحدة بإيقاع واحد: كل ما يتحرك معاً يُحسب في الإطار نفسه */
  let raf = 0;
  function tween(dur, step, ease = easeIO) {
    return new Promise((res) => {
      if (reduceMotion()) dur = 1;
      const t0 = performance.now();
      const loop = (now) => {
        const t = clamp((now - t0) / dur, 0, 1);
        step(ease(t), t);
        if (t < 1 && !closed) raf = requestAnimationFrame(loop);
        else res();
      };
      raf = requestAnimationFrame(loop);
    });
  }

  /* ---------------- الحال */
  function paint() {
    // لا تبقى ورقةٌ مطويّة معلّقة (رفعها الماوس ثم قُلِّب الكتاب بزر أو بمفتاح)
    for (const el of book.querySelectorAll('.bk-fold')) el.remove();
    hoverFold = null;
    room.classList.remove('flipping');
    fillFace(fL, faceL(st.s));
    fillFace(fR, faceR(st.s));
    halfL.classList.toggle('none', !faceL(st.s));
    halfR.classList.toggle('none', !faceR(st.s));
    room.dataset.state = st.s === 0 ? 'closed' : st.s === L ? 'back' : 'open';
    const done = (st.s - 1) / Math.max(1, L - 2);
    room.style.setProperty('--edgeL', isClosed() ? '0px' : Math.round(st.T * 0.5 * clamp(1 - done, 0.06, 1)) + 'px');
    room.style.setProperty('--edgeR', isClosed() ? '0px' : Math.round(st.T * 0.5 * clamp(done, 0.06, 1)) + 'px');
    // الكتاب المغلق: دفّتان لهما سُمك، وكتلة أوراق أصغر منهما قليلاً، وكعب مقوَّس، وحافة أوراق مقعّرة
    if (isClosed()) buildBox(st.s === L);
    else buildOpen(done);
    cur.x = shiftOf();
    setOrigin(st.s);
    applyTransform();
    label();
    prefetch();
    if (notes) notes.onPage(current());
    if (ai) ai.onPage();
  }
  /** الصفحات الظاهرة الآن (صفحةٌ أو صفحتان) */
  function visiblePages() {
    if (view === 'flat') return flat.spread ? spreadOf(flat.cur) : [flat.cur];
    if (isClosed()) return [];
    if (st.narrow) return [current()].filter((i) => i >= 1 && i <= N);
    return [faceR(st.s), faceL(st.s)].filter((f) => f && f.k === 'pg').map((f) => f.i).sort((a, b) => a - b);
  }
  async function toggleAI() {
    if (!ai) {
      try {
        const { createReaderAI } = await import('/js/reader-ai.js');
        ai = createReaderAI({ room, title: o.title || '', notebook: !!o.notebook, heads: o.notebook ? (i) => o.notebook.heads(i) : null, pages: visiblePages, N: () => N, notes: () => notes, clip: o.clip, toast, onLayout: () => relayout() });
      } catch (e) {
        return toast('تعذّر فتح المساعد: ' + (e && e.message ? e.message : e));
      }
    }
    ai.toggle();
  }
  function current() {
    if (view === 'flat') return flat.cur;
    const r = faceR(st.s), l = faceL(st.s);
    if (st.narrow) {
      const f = st.side === 'r' ? r : l;
      return f && f.k === 'pg' ? f.i : r && r.k === 'pg' ? r.i : l && l.k === 'pg' ? l.i : st.s === 0 ? 0 : N;
    }
    return r && r.k === 'pg' ? r.i : l && l.k === 'pg' ? l.i : st.s === 0 ? 0 : N;
  }
  function label() {
    if (view === 'flat') return flatLabel();
    const i = current();
    const at = $('.bk-at');
    if (st.s === 0) at.textContent = 'الغلاف';
    else if (st.s === L) at.textContent = 'ظهر الكتاب';
    else {
      const r = faceR(st.s), l = faceL(st.s);
      const ids = st.narrow ? [i] : [r, l].filter((f) => f && f.k === 'pg').map((f) => f.i);
      at.textContent = ids.length ? `${ids.length > 1 ? 'ص ' + ar(ids[0]) + '–' + ar(ids[1]) : 'ص ' + ar(ids[0])} من ${ar(N)}` : `${ar(N)} صفحة`;
    }
    scrub.max = String(N + 1);
    scrub.value = String(st.s === 0 ? 0 : st.s === L ? N + 1 : i);
    for (const b of room.querySelectorAll('[data-act="prev"]')) b.disabled = st.s === 0;
    for (const b of room.querySelectorAll('[data-act="next"]')) b.disabled = st.s === L && !o.notebook;
    const tool = notes && notes.active ? notes.tool : '';
    $('.bk-hint').textContent =
      st.s === 0 ? 'اسحب الكتاب لتديره، واضغطه ليُفتح'
      : st.s === L ? 'اسحب الكتاب لتديره، واضغطه ليُفتح من آخره'
      : tool ? { select: 'حدّد كلاماً من الصفحة لتنسخه أو تظلّله', pen: 'اكتب على الصفحة بالقلم', marker: 'ظلّل بالقلم (Shift لخطٍّ مستقيم)', text: 'انقر حيث تريد الكتابة', note: 'انقر حيث تريد الملاحظة', eraser: 'امسح ما كتبته بالمرور عليه' }[tool] + ' — والتقليب بالسهمين'
      : st.narrow ? '' : 'اسحب ركن الورقة لتقلّبها، أو اسحب خارج الكتاب لتديره';
  }

  /* ================================================================ الغلافان: لوحٌ صلب يدور حول الكعب */
  function makeBoardLeaf(leaf) {
    const el = document.createElement('div');
    el.className = 'bk-leaf';
    el.innerHTML = '<div class="bk-face f"></div><div class="bk-face b"></div><i class="bk-lshade f"></i><i class="bk-lshade b"></i>';
    fillFace(el.children[0], leaf.f, 'f');
    fillFace(el.children[1], leaf.b, 'b');
    book.appendChild(el);
    return el;
  }
  function setLeafAngle(el, a) {
    const k = Math.sin((a * Math.PI) / 180);
    el.style.transform = `translateZ(1px) rotateY(${a}deg)`;
    el.style.setProperty('--k', k.toFixed(3));
    room.style.setProperty('--lift', k.toFixed(3));
  }
  /** فتح الغلاف أو إغلاقه: يستقيم الكتاب أولاً، ثم يدور اللوح وينزلق الكتاب إلى وسطه في حركة واحدة */
  let tiltSeq = 0; // آخر ميلٍ بدأ (الأحدث يلغي ما قبله)
  async function boardFlip(dir) {
    tiltSeq++;
    const s0 = st.s, s1 = s0 + dir;
    const leaf = leaves[dir > 0 ? s0 : s0 - 1];
    // ١) يستقيم الكتاب (من أي ميل أداره القارئ)
    if (st.rx || st.ry) {
      const a = { rx: st.rx, ry: st.ry };
      await tween(Math.min(650, 260 + (Math.abs(a.ry) + Math.abs(a.rx)) * 6), (e) => {
        st.rx = a.rx * (1 - e);
        st.ry = a.ry * (1 - e);
        applyTransform();
      });
    }
    st.rx = st.ry = 0;
    // ٢) ما تكشفه الدفّة، وما بعدها؛ والمحور الآن لا أثر له (الكتاب مستقيم)
    if (dir > 0) {
      fillFace(fL, faceL(s1));
      halfL.classList.toggle('none', !faceL(s1));
    } else {
      fillFace(fR, faceR(s1));
      halfR.classList.toggle('none', !faceR(s1));
    }
    room.dataset.state = isClosed(s1) ? (s1 === 0 ? 'closed' : 'back') : 'open';
    // النصف الخالي (حيث تستقر الدفّة أو منه تقوم): تبقى دفّته وحافته ظاهرتين وتتلاشيان مع الحركة
    for (const h of [halfL, halfR]) {
      const empty = h.classList.contains('none') || !h.querySelector('.bk-face').className.includes('k-');
      h.classList.toggle('ghost', empty);
      if (empty) h.classList.remove('none');
    }
    room.classList.add('flipping', 'turning-board');
    const el = makeBoardLeaf(leaf);
    const from = dir > 0 ? 0 : 180, to = dir > 0 ? 180 : 0;
    setLeafAngle(el, from);
    const x0 = cur.x, x1 = shiftOf(s1, dir > 0 ? (st.narrow ? 'l' : 'r') : 'l');
    // (أطراف الأوراق تنمو مع انفتاح الكتاب)
    const e0 = isClosed(s0) ? 0 : 1, e1 = isClosed(s1) ? 0 : 1;
    room.style.setProperty('--open', e0);
    await tween(1050, (e) => {
      setLeafAngle(el, from + (to - from) * e);
      cur.x = x0 + (x1 - x0) * e;
      const ov = e0 + (e1 - e0) * e;
      room.style.setProperty('--open', ov.toFixed(3));
      // دفّة النصف الخالي تظهر حين تقترب الدفّة المتحركة منها لا قبل ذلك
      room.style.setProperty('--ghost', clamp((ov - 0.55) / 0.45, 0, 1).toFixed(3));
      applyTransform();
    });
    el.remove();
    halfL.classList.remove('ghost');
    halfR.classList.remove('ghost');
    room.classList.remove('flipping', 'turning-board');
    room.style.setProperty('--lift', '0');
    room.style.removeProperty('--open');
    room.style.removeProperty('--ghost');
    st.s = s1;
    st.side = s1 === 1 && st.narrow ? 'l' : dir > 0 ? 'r' : 'l';
    if (st.narrow && st.s > 0 && st.s < L) st.side = faceL(st.s) && faceL(st.s).k === 'pg' && dir > 0 ? 'l' : 'r';
    paint();
    // ٣) يميل قليلاً ليُرى سُمكه (مغلقاً ومفتوحاً). لا يُنتظر: يُقلَّب الكتاب أثناءه، وحركةٌ أحدث تلغيه
    {
      const t = restTilt();
      const my = ++tiltSeq;
      tween(600, (e) => {
        if (my !== tiltSeq) return;
        st.rx = t.rx * e;
        st.ry = t.ry * e;
        applyTransform();
      }, easeOut);
    }
  }

  /* ================================================================ الأوراق: طيّ لين يتبع الإصبع */
  /**
   * fold: ورقة ترتفع من ركنها. leaf ممسوكة من ركن C0 (الخارجي، أعلى أو أسفل)، والإصبع عند P.
   * خطّ الطيّ عمودٌ منصِّف بين الركن والإصبع: ما في جهة الركن ينقلب فيُرى ظهره، والباقي وجهه.
   */
  function makeFold(dir) {
    const s0 = st.s;
    const s1 = s0 + dir;
    if (s1 < 1 || s1 > L - 1 || s0 < 1 || s0 > L - 1) return null;
    const W = st.pw, H = st.ph;
    const leaf = dir > 0 ? leaves[s0] : leaves[s0 - 1];
    // الورقة يساراً (إلى الأمام) أو يميناً (إلى الوراء)، والكعب بينهما
    const a = dir > 0 ? 0 : W, b = dir > 0 ? W : 2 * W, sp = W, outer = dir > 0 ? 0 : 2 * W;
    const frontF = dir > 0 ? leaf.f : leaf.b, backF = dir > 0 ? leaf.b : leaf.f;
    // ما تحت الورقة
    if (dir > 0) {
      fillFace(fL, faceL(s1));
      halfL.classList.toggle('none', !faceL(s1));
    } else {
      fillFace(fR, faceR(s1));
      halfR.classList.toggle('none', !faceR(s1));
    }
    const wrap = document.createElement('div');
    wrap.className = 'bk-fold';
    // الظلال بقدر ارتفاع الورقة (لا شيء وهي مستوية، وأكثرها في منتصف طريقها):
    //  ظلٌّ على الصفحة تحتها يلي خط الطيّ، وانحناءٌ على ظهرها عند الطيّ، وظلٌّ ليّن حول طرفها المرفوع
    wrap.innerHTML = `<div class="fd-cast"><i></i></div><div class="fd-front" style="left:${a}px"><div class="bk-face"></div></div><div class="fd-flapwrap"><div class="fd-back"><div class="bk-face"></div><i class="fd-curl"></i></div></div>`;
    book.appendChild(wrap);
    const front = wrap.querySelector('.fd-front'), back = wrap.querySelector('.fd-back');
    const cast = wrap.querySelector('.fd-cast'), castI = cast.firstChild, curl = back.querySelector('.fd-curl'), flap = wrap.querySelector('.fd-flapwrap');
    // (وظلّ الكعب عليهما كما هو عليها ساكنة: الوجه في جهته، والظهر في الجهة التي ينتهي إليها)
    fillFace(front.firstChild, frontF, dir > 0 ? 'gl' : 'gr');
    fillFace(back.firstChild, backF, dir > 0 ? 'gr' : 'gl');
    room.classList.add('flipping');
    // شكل الورقة كما هي ساكنة: طرفاها الأعلى والأسفل ينخفضان قليلاً عند الكعب (لا مستطيل حادّ)
    const dd = clamp(H * 0.012, 2, 9), nn = 14, top = [], bot = [];
    for (let i = 0; i <= nn; i++) {
      const x = a + (W * i) / nn;
      const k = (dir > 0 ? (x - a) / W : 1 - (x - a) / W) ** 3;
      top.push({ x, y: dd * k });
      bot.unshift({ x, y: H - dd * k });
    }
    const rect = [...top, ...bot];
    const diag = Math.hypot(W, H);
    const f = {
      dir, s0, s1, wrap, W, H, a, b, sp, outer, corner: { x: outer, y: H }, P: { x: outer, y: H },
      setCorner(top) { this.corner = { x: outer, y: top ? 0 : H }; },
      target() { return { x: 2 * sp - outer, y: this.corner.y }; },
      /** تقييد الإصبع: الورقة مشدودة إلى الكعب، فلا يبعد ركنها عنه أكثر من عرضها (وقطرها) */
      limit(P) {
        const near = { x: sp, y: this.corner.y }, far = { x: sp, y: H - this.corner.y };
        let q = { ...P };
        for (const [c, r] of [[near, W], [far, diag]]) {
          const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy);
          if (d > r) q = { x: c.x + (dx * r) / d, y: c.y + (dy * r) / d };
        }
        return q;
      },
      set(P) {
        P = this.limit(P);
        this.P = P;
        const C = this.corner;
        const dx = P.x - C.x, dy = P.y - C.y, len = Math.hypot(dx, dy);
        if (len < 0.5) {
          front.style.clipPath = polyCss(rect, a);
          back.style.clipPath = 'polygon(0 0,0 0,0 0)';
          cast.style.clipPath = 'polygon(0 0,0 0,0 0)';
          flap.style.filter = 'none';
          return;
        }
        const n = { x: dx / len, y: dy / len };
        const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
        const keep = clipPoly(rect, M, n, 1); // ما بقي على الورقة
        const fold = clipPoly(rect, M, n, -1); // ما انطوى
        front.style.clipPath = polyCss(keep, a);
        // الظهر: صفحة الظهر في موضعها بعد التقليب، ثم تنعكس حول خط الطيّ
        const ea = -1 + 2 * n.x * n.x, eb = 2 * n.x * n.y, ec = -2 * n.x * n.y, ed = 1 - 2 * n.y * n.y;
        const k0 = (b - M.x) * n.x + (0 - M.y) * n.y;
        const e = b - 2 * k0 * n.x, ff = 0 - 2 * k0 * n.y;
        back.style.transform = `matrix(${ea},${eb},${ec},${ed},${e},${ff})`;
        back.style.clipPath = polyCss(fold.map((p) => ({ x: b - p.x, y: p.y })));
        // ارتفاع الورقة: صفرٌ وهي مستوية في أول الطريق وآخره
        const lift = Math.pow(Math.sin(Math.PI * clamp(len / (2 * W), 0, 1)), 0.85);
        const big = diag * 2;
        const place = (el, mx, my, deg, w) => {
          el.style.left = mx + 'px';
          el.style.top = my + 'px';
          el.style.width = w + 'px';
          el.style.height = big * 2 + 'px';
          el.style.transform = `rotate(${deg}deg) translateY(${-big}px)`;
        };
        const ang = (Math.atan2(n.y, n.x) * 180) / Math.PI;
        // ١) على الصفحة تحتها (فيما انكشف منها فقط): يلي خط الطيّ، ويتسع ويلين كلما ارتفعت الورقة
        cast.style.clipPath = polyCss(fold);
        place(castI, M.x, M.y, ang + 180, W * (0.05 + 0.3 * lift));
        castI.style.opacity = Math.min(1, lift * 1.15).toFixed(3);
        // ٢) على ظهر الورقة: انحناء الورق عند الطيّ (ظلٌّ رقيق ثم ضوء)
        place(curl, b - M.x, M.y, (Math.atan2(-n.y, n.x) * 180) / Math.PI, W * 0.55);
        curl.style.opacity = Math.min(1, 0.25 + lift).toFixed(3);
        // ٣) الورقة المرفوعة تُلقي ظلاً ليّناً حولها على ما تحتها
        flap.style.filter = lift > 0.02 ? `drop-shadow(0 ${(1 + 4 * lift).toFixed(1)}px ${(2 + 9 * lift).toFixed(1)}px rgba(0,0,0,${(0.24 * lift).toFixed(3)}))` : 'none';
      },
      remove() {
        wrap.remove();
        room.classList.remove('flipping');
        room.style.setProperty('--lift', '0');
      },
    };
    return f;
  }
  /** يُكمل الطيّ إلى آخره (أو يعيد الورقة)، بمنحنى يرفع الورقة في وسط طريقها */
  async function finishFold(f, done, dur) {
    const P0 = { ...f.P };
    const T = done ? f.target() : f.corner;
    const lift = done ? (f.corner.y === 0 ? f.H * 0.32 : -f.H * 0.32) : 0;
    const C = { x: (P0.x + T.x) / 2, y: (P0.y + T.y) / 2 + lift * (1 - Math.abs(P0.x - f.sp) / f.W) };
    const dist = Math.hypot(T.x - P0.x, T.y - P0.y);
    dur = dur ?? clamp(dist * 0.9, 220, 760);
    const narrowShift = done && st.narrow;
    const x0 = cur.x, x1 = narrowShift ? shiftOf(f.s1, f.dir > 0 ? 'r' : 'l') : cur.x;
    await tween(dur, (e) => {
      const u = 1 - e;
      f.set({ x: u * u * P0.x + 2 * u * e * C.x + e * e * T.x, y: u * u * P0.y + 2 * u * e * C.y + e * e * T.y });
      if (narrowShift) {
        cur.x = x0 + (x1 - x0) * e;
        applyTransform();
      }
    }, done ? easeIO : easeOut);
    f.remove();
    if (done) {
      st.s = f.s1;
      st.side = f.dir > 0 ? 'r' : 'l';
      if (st.narrow) {
        const r = faceR(st.s), l = faceL(st.s);
        if (f.dir > 0 && (!r || r.k !== 'pg') && l && l.k === 'pg') st.side = 'l';
        if (f.dir < 0 && (!l || l.k !== 'pg') && r && r.k === 'pg') st.side = 'r';
      }
    }
    paint();
  }
  /** تقليب بضغطة: الورقة تُرفع من ركنها السفلي وتُطوى حتى تستقر */
  async function flip(dir) {
    if (st.busy) return;
    dropHover();
    const s1 = st.s + dir;
    if (s1 < 0 || s1 > L) return;
    st.busy = true;
    if ((dir > 0 && (st.s === 0 || s1 === L)) || (dir < 0 && (st.s === L || s1 === 0))) await boardFlip(dir);
    else {
      const f = makeFold(dir);
      if (f) {
        f.set({ ...f.corner });
        await finishFold(f, true, 820);
      }
    }
    st.busy = false;
  }
  async function pan(side) {
    if (st.busy) return;
    dropHover();
    st.busy = true;
    st.side = side;
    const x0 = cur.x, x1 = shiftOf(st.s, side);
    await tween(420, (e) => {
      cur.x = x0 + (x1 - x0) * e;
      applyTransform();
    });
    label();
    st.busy = false;
  }
  function next() {
    // الدفتر: التقليب بعد آخر صفحةٍ يفتح صفحةً جديدة
    if (o.notebook && !nbBusy && !st.busy && visiblePages().includes(N)) return nbAddPage();
    if (view === 'flat') return flatStep(1);
    if (st.narrow && st.s > 0 && st.s < L && st.side === 'r' && faceL(st.s) && faceL(st.s).k === 'pg') return pan('l');
    return flip(1);
  }
  function prev() {
    if (view === 'flat') return flatStep(-1);
    if (st.narrow && st.s > 0 && st.s < L && st.side === 'l' && faceR(st.s) && faceR(st.s).k === 'pg') return pan('r');
    return flip(-1);
  }
  /** الانتقال إلى صفحة: قريبةً تُقلَّب، وبعيدةً تُطوى ورقةٌ وتحتها الصفحة المطلوبة */
  async function gotoPage(i) {
    if (view === 'flat') return flatGo(i);
    if (st.busy) return;
    i = clamp(Math.round(i), 0, N + 1);
    const s = i === 0 ? 0 : i === N + 1 ? L : Math.floor(i / 2) + 1;
    const side = i > 0 && i <= N && i % 2 === 1 ? 'l' : 'r';
    if (s === st.s) {
      if (st.narrow && side !== st.side) await pan(side);
      return;
    }
    if (Math.abs(s - st.s) === 1 || isClosed(s) || isClosed()) {
      // إلى الغلاف أو منه: يُغلق الكتاب/يُفتح أولاً
      if (isClosed() && !isClosed(s)) await flip(st.s === 0 ? 1 : -1);
      while (!st.busy && st.s !== s && Math.abs(s - st.s) === 1) await flip(s > st.s ? 1 : -1);
      if (st.s !== s && !isClosed(s)) return gotoPage(i);
      if (st.s !== s && isClosed(s)) {
        // قفزة إلى آخر ورقة قبل الدفّة، ثم إغلاق
        const pre = s === 0 ? 1 : L - 1;
        if (st.s !== pre) await jumpTo(pre);
        await flip(s === 0 ? -1 : 1);
      }
      if (st.narrow && st.side !== side && st.s > 0 && st.s < L) await pan(side);
      return;
    }
    await jumpTo(s);
    if (st.narrow && st.side !== side) {
      st.side = side;
      paint();
    }
  }
  /** قفزة بعيدة داخل الكتاب: ورقة واحدة تُطوى، وجهها الصفحة الحالية وظهرها المطلوبة */
  async function jumpTo(s) {
    if (s === st.s) return;
    dropHover();
    st.busy = true;
    const dir = s > st.s ? 1 : -1;
    const real = leaves;
    // ورقة مؤقتة تجمع الحاضر والمطلوب
    const tmp = dir > 0 ? { f: faceL(st.s) || { k: 'blank' }, b: faceR(s) || { k: 'blank' } } : { f: faceL(s) || { k: 'blank' }, b: faceR(st.s) || { k: 'blank' } };
    const idx = dir > 0 ? st.s : st.s - 1;
    const saved = real[idx];
    real[idx] = tmp;
    const f = makeFold(dir);
    // ما تحت الورقة: الصفحة المطلوبة نفسها
    if (dir > 0) {
      fillFace(fL, faceL(s));
      halfL.classList.toggle('none', !faceL(s));
    } else {
      fillFace(fR, faceR(s));
      halfR.classList.toggle('none', !faceR(s));
    }
    real[idx] = saved;
    if (f) {
      f.s1 = s;
      f.set({ ...f.corner });
      await finishFold(f, true, 760);
    }
    st.busy = false;
  }

  /* ================================================================ اليد: السحب والضغط */
  /** من نقطة على الشاشة إلى موضعها على سطح الكتاب (مهما مال أو دار) */
  function toBook(cx, cy) {
    const r = scene.getBoundingClientRect();
    const d = 2400;
    const px = r.width / 2, py = r.height / 2;
    // تحويل الكتاب كما في CSS (حول محوره)، ثم منظور المشهد
    const Mb = new DOMMatrix().translate(org.x, org.y, org.z).multiply(new DOMMatrix(`translateX(${cur.x}px) rotateX(${st.rx}deg) rotateY(${st.ry}deg)`)).translate(-org.x, -org.y, -org.z);
    const persp = new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / d, 0, 0, 0, 1]);
    const F = new DOMMatrix().translate(px, py).multiply(persp).translate(-px, -py).multiply(Mb);
    const inv = inv3([F.m11, F.m21, F.m41, F.m12, F.m22, F.m42, F.m14, F.m24, F.m44]);
    if (!inv) return { x: 0, y: 0 };
    const X = cx - r.left, Y = cy - r.top;
    const w = inv[6] * X + inv[7] * Y + inv[8];
    return { x: (inv[0] * X + inv[1] * Y + inv[2]) / w, y: (inv[3] * X + inv[4] * Y + inv[5]) / w };
  }
  /** أيّ ورقة تحت الإصبع: اليسرى تُقلَّب إلى الأمام، واليمنى إلى الوراء */
  function leafAt(p) {
    if (p.y < -10 || p.y > st.ph + 10) return 0;
    if (p.x >= -10 && p.x < st.pw && faceL(st.s) && st.s < L - 1) return 1;
    if (p.x >= st.pw && p.x <= 2 * st.pw + 10 && faceR(st.s) && st.s > 1) return -1;
    return 0;
  }
  const onBookArea = (p) => p.x >= -12 && p.x <= 2 * st.pw + 12 && p.y >= -12 && p.y <= st.ph + 12 && ((p.x < st.pw && faceL(st.s)) || (p.x >= st.pw && faceR(st.s)));

  let drag = null;
  // ما ليس من الكتاب نفسه (أدوات الدفتر، الأزرار، ملاحظة لاصقة) لا يُقلِّب ولا يُدير
  const notBook = (e) => !!(e.target.closest && e.target.closest('.nt-ui, .an-pin, .an-txbar, button, a, input, select, textarea'));
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || st.zoom > 1) return;
    if (e.target.closest('.bk-wait') || notBook(e)) return;
    if (notes && notes.active) return; // الكتابة على الصفحة لا تقلّبها
    const p = toBook(e.clientX, e.clientY);
    const onBook = onBookArea(p);
    drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), p0: p, onBook, id: e.pointerId, mode: '', f: null };
    if (hoverFold && !st.busy) {
      // الورقة مرفوعة من الماوس: يُمسك بها كما هي
      drag.mode = 'fold';
      drag.f = hoverFold;
      hoverFold = null;
      drag.grab = { x: drag.f.P.x - p.x, y: drag.f.P.y - p.y };
      st.busy = true;
      stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return void hover(e);
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.mode) {
      if (Math.hypot(dx, dy) < 8) return;
      const dir = !isClosed() && drag.onBook && !st.busy ? leafAt(drag.p0) : 0;
      if (dir) {
        const f = makeFold(dir);
        if (!f) return void (drag.mode = 'none');
        // الركن الأقرب إلى موضع الإمساك
        f.setCorner(drag.p0.y < st.ph / 2);
        f.set({ ...f.corner });
        drag.mode = 'fold';
        drag.f = f;
        drag.grab = { x: f.corner.x - drag.p0.x, y: f.corner.y - drag.p0.y };
        st.busy = true;
      } else if (!st.busy) {
        drag.mode = 'orbit';
        tiltSeq++; // الإدارة باليد توقف الميل الذي بدأ وحده
        drag.rx0 = st.rx;
        drag.ry0 = st.ry;
      } else return void (drag.mode = 'none');
      stage.setPointerCapture(e.pointerId);
    }
    if (drag.mode === 'fold') {
      const p = toBook(e.clientX, e.clientY);
      // الركن يتبع الإصبع وقد أُمسك من موضعه
      drag.f.set({ x: p.x + drag.grab.x * 0.35, y: p.y + drag.grab.y * 0.35 });
    } else if (drag.mode === 'orbit') {
      const lim = isClosed() ? { x: 40, y: 180 } : { x: 28, y: 38 };
      st.ry = clamp(drag.ry0 + dx * 0.35, -lim.y, lim.y);
      st.rx = clamp(drag.rx0 - dy * 0.25, -lim.x, lim.x);
      applyTransform();
    }
  });
  const up = async (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.mode === 'fold') {
      const f = d.f;
      const v = (e.clientX - d.x0) / Math.max(1, performance.now() - d.t0);
      // تُكمَل إن تجاوز الركن الكعب، أو قُذفت بسرعة نحوه
      const past = f.dir > 0 ? f.P.x > f.sp - f.W * 0.1 : f.P.x < f.sp + f.W * 0.1;
      const fling = f.dir > 0 ? v > 0.5 : v < -0.5;
      await finishFold(f, past || fling);
      st.busy = false;
      return;
    }
    if (d.mode) return;
    // ضغطة
    const sr = stage.getBoundingClientRect();
    if (isClosed()) {
      if (d.onBook) return st.s === 0 ? next() : prev();
      return;
    }
    if (!d.onBook) return;
    if (st.narrow) return e.clientX < sr.left + sr.width / 2 ? next() : prev();
    return d.p0.x < st.pw ? next() : prev();
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  // الماوس فوق ركن الورقة: يرتفع الركن نحوه، فيُعرف أنه يُقلَّب
  function hover(e) {
    if (e.pointerType !== 'mouse' || st.busy || st.zoom > 1 || isClosed() || (notes && notes.active) || notBook(e)) return endHover();
    const p = toBook(e.clientX, e.clientY);
    const W = st.pw, H = st.ph;
    const zx = W * 0.16, zy = H * 0.16;
    let dir = 0, top = false;
    if (p.x >= -6 && p.x < zx && st.s < L - 1) dir = 1;
    else if (p.x > 2 * W - zx && p.x <= 2 * W + 6 && st.s > 1) dir = -1;
    if (dir && p.y >= -6 && p.y < zy) top = true;
    else if (!(dir && p.y > H - zy && p.y <= H + 6)) dir = 0;
    if (!dir) return endHover();
    if (hoverFold && hoverFold.dir !== dir) endHover(true);
    if (!hoverFold) {
      hoverFold = makeFold(dir);
      if (!hoverFold) return;
      hoverFold.setCorner(top);
    } else if ((hoverFold.corner.y === 0) !== top) hoverFold.setCorner(top);
    const C = hoverFold.corner;
    const want = { x: C.x + (p.x - C.x) * 0.9 + (dir > 0 ? W * 0.05 : -W * 0.05), y: C.y + (p.y - C.y) * 0.9 + (top ? H * 0.03 : -H * 0.03) };
    hoverFold.set(want);
  }
  /** ورقة رفعها الماوس تُسقط فوراً قبل أي تقليب آخر */
  function dropHover() {
    if (!hoverFold) return;
    const f = hoverFold;
    hoverFold = null;
    f.remove();
    fillFace(fL, faceL(st.s));
    fillFace(fR, faceR(st.s));
    halfL.classList.toggle('none', !faceL(st.s));
    halfR.classList.toggle('none', !faceR(st.s));
  }
  let hoverEnding = false;
  async function endHover(now) {
    if (!hoverFold || hoverEnding) return;
    const f = hoverFold;
    if (now) {
      hoverFold = null;
      f.remove();
      paint();
      return;
    }
    hoverEnding = true;
    hoverFold = null;
    st.busy = true;
    await finishFold(f, false, 260);
    st.busy = false;
    hoverEnding = false;
  }
  stage.addEventListener('pointerleave', (e) => { if (!drag) endHover(); });
  stage.addEventListener('dblclick', (e) => {
    const p = toBook(e.clientX, e.clientY);
    if (!onBookArea(p)) resetTilt();
  });
  async function resetTilt() {
    if (st.busy) return;
    st.busy = true;
    tiltSeq++;
    const t = restTilt();
    const a = { rx: st.rx, ry: st.ry };
    await tween(520, (e) => {
      st.rx = a.rx + (t.rx - a.rx) * e;
      st.ry = a.ry + (t.ry - a.ry) * e;
      applyTransform();
    });
    st.busy = false;
  }

  /* ---------------- الأبواب (فهرس الملف نفسه): لوحة جانبية تُفسح للكتاب ولا تغطيه */
  let tocItems = [];
  async function buildToc() {
    let items = [];
    try {
      const outline = (await pdf.getOutline()) || [];
      const flat = [];
      const walk = (list, lvl) => {
        for (const it of list) {
          flat.push({ it, lvl });
          if (lvl < 2 && it.items && it.items.length) walk(it.items, lvl + 1);
        }
      };
      walk(outline, 1);
      items = await Promise.all(
        flat.slice(0, 400).map(async ({ it, lvl }) => {
          try {
            const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
            const idx = dest ? await pdf.getPageIndex(dest[0]) : -1;
            return { title: it.title, lvl, i: idx + 1 - OFF };
          } catch {
            return null;
          }
        }),
      );
    } catch {}
    items = items.filter((x) => x && x.i >= 1);
    tocItems = items;
    const ol = $('.bk-toc ol');
    ol.innerHTML = items.length
      ? items.map((x) => `<li class="lv${x.lvl}"><button type="button" data-p="${x.i}"><span>${esc(x.title)}</span><small>${ar(x.i)}</small></button></li>`).join('')
      : '<li class="bk-toc-none">لا عناوين في هذا الملف.</li>';
  }
  $('.bk-toc').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    if (room.classList.contains('slim')) toggleToc(false);
    gotoPage(+b.dataset.p);
  });
  function toggleToc(on) {
    const t = $('.bk-toc');
    on = on ?? t.hidden;
    t.hidden = !on;
    for (const b of room.querySelectorAll('[data-act="toc"]')) b.setAttribute('aria-pressed', String(on));
    room.classList.toggle('toc-on', on);
    relayout();
  }

  /* ---------------- التكبير */
  function setZoom(z) {
    if (view === 'flat') return flatZoom(z > 1 ? flat.z * 1.25 : 1);
    st.zoom = z;
    room.classList.toggle('zoomed', z > 1);
    $('[data-act="zoom"]').setAttribute('aria-pressed', String(z > 1));
    if (z > 1) { st.rx = st.ry = 0; }
    measure();
    paint();
    stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
  }
  let panning = null;
  stage.addEventListener('pointerdown', (e) => {
    if (st.zoom === 1 || (notes && notes.active) || notBook(e)) return;
    panning = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, stp: stage.scrollTop };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!panning) return;
    stage.scrollLeft = panning.sl - (e.clientX - panning.x);
    stage.scrollTop = panning.stp - (e.clientY - panning.y);
  });
  window.addEventListener('pointerup', () => (panning = null));

  /* ================================================================ صفحاتٌ مسطّحة (كالمحرر): تمريرٌ إلى الأسفل أو تقليبٌ يميناً ويساراً، والتكبير بـ Ctrl+العجلة */
  const RP = (() => {
    try {
      return JSON.parse(localStorage.getItem('warraq.reader') || '{}') || {};
    } catch {
      return {};
    }
  })();
  const saveRP = () => {
    try {
      localStorage.setItem('warraq.reader', JSON.stringify(RP));
    } catch {}
  };
  let view = RP.view === 'flat' ? 'flat' : '3d';
  // الورق الأصفر (كورق الكتب الشرعية): للعرض وحده — الكتاب وتنزيله كما هما، والتظليل يبقى ظاهراً عليه
  const setPaperY = (on) => {
    room.classList.toggle('paper-y', !!on);
    const b = room.querySelector('.bk-tools [data-act="paper"]');
    if (b) b.setAttribute('aria-pressed', String(!!on));
    RP.paper = on ? 'yellow' : 'white';
    saveRP();
  };
  setPaperY(RP.paper === 'yellow');
  const FL = { gap: 22, lbl: 26 }; // المسافة بين الصفحات، وسطر رقم الصفحة تحتها
  const flat = { el: $('.bk-flat'), col: $('.bk-fl-in'), flow: RP.flow === 'flip' ? 'flip' : 'scroll', z: clamp(+RP.fz || 1, 0.4, 5), cur: 1, fw: 0, fh: 0, padT: 24, spread: false, built: false, io: null, refillT: 0 };
  const relayout = () => (view === 'flat' ? layoutFlat() : (measure(), paint()));
  function buildFlat() {
    if (flat.built) return;
    flat.built = true;
    const parts = [];
    for (let i = 1; i <= N; i++) parts.push(`<div class="bk-fp" data-i="${i}"><div class="bk-face k-pg"></div><small>${ar(i)}</small></div>`);
    flat.col.innerHTML = parts.join('');
    flat.io = new IntersectionObserver(
      (ents) => {
        for (const en of ents) en.isIntersecting ? fillFlat(en.target) : clearFlat(en.target);
      },
      { root: flat.el, rootMargin: '120% 60%' },
    );
    for (const fp of flat.col.children) flat.io.observe(fp);
  }
  const flatBucket = () => Math.min(3600, Math.ceil((flat.fh * Math.min(2.5, window.devicePixelRatio || 1)) / 200) * 200);
  function fillFlat(fp) {
    const i = +fp.dataset.i;
    const face = fp.firstElementChild;
    const h = flatBucket();
    if (face.dataset.h === String(h)) return;
    if (!face.dataset.h) {
      face.dataset.i = i;
      face.innerHTML = '<img alt="" decoding="async"><span class="spin bk-pload" aria-hidden="true"><i></i><i></i><i></i></span>';
      face.firstChild.alt = 'الصفحة ' + ar(i);
      // ما كتبه القارئ عليها، ويُكتب عليها (كل صفحةٍ ظاهرة)
      if (notes) notes.decorate(face, i, true);
    }
    face.dataset.h = h;
    pageUrl(i, h).then((u) => {
      if (u && face.dataset.h === String(h)) {
        face.firstChild.src = u;
        face.classList.add('ready');
      }
    });
  }
  function clearFlat(fp) {
    const face = fp.firstElementChild;
    if (!face.dataset.h) return;
    delete face.dataset.h;
    face.classList.remove('ready');
    face.innerHTML = '';
  }
  /** بعد التكبير: الصفحات الظاهرة بدقّتها الجديدة (حين يهدأ) */
  function refillSoon() {
    clearTimeout(flat.refillT);
    flat.refillT = setTimeout(() => {
      const r = flat.el.getBoundingClientRect();
      for (const fp of flat.col.children) {
        if (!fp.firstElementChild.dataset.h) continue;
        const b = fp.getBoundingClientRect();
        if (b.bottom > r.top - r.height && b.top < r.bottom + r.height) fillFlat(fp);
      }
    }, 260);
  }
  /** الصفحتان المتقابلتان (الأولى وحدها، ثم الزوجية يميناً والفردية يساراً كما في الكتاب) أو صفحةٌ واحدة */
  const spreadOf = (i) => {
    i = clamp(i, 1, N);
    if (!flat.spread || i === 1) return [i];
    const a = i % 2 === 0 ? i : i - 1;
    return a + 1 <= N ? [a, a + 1] : [a];
  };
  function layoutFlat() {
    const W = flat.el.clientWidth;
    const H = flat.el.clientHeight;
    if (!W || !H) return;
    const narrow = W < 760;
    st.narrow = narrow;
    room.classList.toggle('narrow', narrow);
    railAt(flat.el);
    // (أدوات الدفتر: عمودٌ على اليسار، أو صفٌّ في الأعلى حين يضيق)
    const padX = narrow ? 28 : 150;
    flat.padT = narrow ? 64 : 24;
    const padY = flat.padT + 20;
    let fw;
    if (flat.flow === 'scroll') fw = Math.min(W - padX, 920, (H - padY - FL.lbl) * AR0 * 1.9);
    else {
      const h = H - flat.padT - 24 - FL.lbl;
      const one = Math.min(W - padX, h * AR0);
      const two = Math.min((W - padX - 18) / 2, h * AR0);
      flat.spread = !narrow && two >= one * 0.82 && N > 1;
      fw = flat.spread ? two : one;
    }
    flat.fw = Math.max(80, Math.round(fw * flat.z));
    flat.fh = Math.round(flat.fw / AR0);
    flat.col.style.setProperty('--fw', flat.fw + 'px');
    flat.col.style.setProperty('--fh', flat.fh + 'px');
    flat.col.style.paddingTop = flat.padT + 'px';
    flat.col.style.gap = FL.gap + 'px';
    room.classList.toggle('flow-flip', flat.flow === 'flip');
    room.classList.toggle('fl-zoomed', flat.z > 1.01);
    if (flat.flow === 'flip') showSpread(flat.cur);
    refillSoon();
    zoomChip();
    flatLabel();
  }
  /* التمرير: الصفحة الحالية ما عند ثلث الشاشة (الصفحات بمقاسٍ واحد) */
  const stride = () => flat.fh + FL.lbl + FL.gap;
  let scrollRaf = 0;
  flat.el.addEventListener('scroll', () => {
    if (flat.flow !== 'scroll') return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const i = clamp(Math.floor((flat.el.scrollTop + flat.el.clientHeight * 0.35 - flat.padT) / stride()) + 1, 1, N);
      if (i !== flat.cur) {
        flat.cur = i;
        flatLabel();
        if (notes) notes.onPage(i);
        if (ai) ai.onPage();
      }
    });
  });
  function flatGo(i, smooth) {
    i = clamp(Math.round(i) || 1, 1, N);
    if (flat.flow === 'flip') {
      const dir = i > flat.cur ? 1 : i < flat.cur ? -1 : 0;
      flat.cur = spreadOf(i)[0];
      showSpread(flat.cur, dir);
    } else {
      flat.cur = i;
      const top = flat.padT + (i - 1) * stride() - 10;
      flat.el.scrollTo({ top, behavior: smooth && Math.abs(top - flat.el.scrollTop) < flat.el.clientHeight * 3 ? 'smooth' : 'auto' });
    }
    flatLabel();
    if (notes) notes.onPage(i);
        if (ai) ai.onPage();
  }
  function flatStep(d) {
    if (flat.flow === 'flip') {
      const sp = spreadOf(flat.cur);
      const to = d > 0 ? sp[sp.length - 1] + 1 : sp[0] - 1;
      if (to < 1 || to > N) return;
      return flatGo(to);
    }
    flatGo(flat.cur + d, true);
  }
  /** التقليب: تنزلق الصفحات (إلى الأمام تأتي من اليسار كما يُقلَّب الكتاب العربي) */
  function showSpread(i, dir = 0) {
    const on = new Set(spreadOf(i));
    for (const fp of flat.col.children) fp.classList.toggle('on', on.has(+fp.dataset.i));
    flat.col.classList.toggle('pair', on.size === 2);
    if (dir && !reduceMotion()) {
      flat.col.classList.remove('in-next', 'in-prev');
      void flat.col.offsetWidth;
      flat.col.classList.add(dir > 0 ? 'in-next' : 'in-prev');
    }
    flat.el.scrollTop = 0;
    // وما بعدها جاهزٌ قبل أن يُطلب
    const last = Math.max(...on);
    for (const j of [last + 1, last + 2, Math.min(...on) - 1]) if (j >= 1 && j <= N) pageUrl(j, flatBucket());
  }
  flat.col.addEventListener('animationend', () => flat.col.classList.remove('in-next', 'in-prev'));
  function flatLabel() {
    if (view !== 'flat') return;
    const at = $('.bk-at');
    const ids = flat.flow === 'flip' ? spreadOf(flat.cur) : [flat.cur];
    at.textContent = `${ids.length > 1 ? 'ص ' + ar(ids[0]) + '–' + ar(ids[1]) : 'ص ' + ar(ids[0])} من ${ar(N)}`;
    scrub.max = String(N + 1);
    scrub.value = String(flat.cur);
    const sp = spreadOf(flat.cur);
    for (const b of room.querySelectorAll('[data-act="prev"]')) b.disabled = sp[0] <= 1;
    for (const b of room.querySelectorAll('[data-act="next"]')) b.disabled = sp[sp.length - 1] >= N && !o.notebook;
  }
  function zoomChip() {
    const b = $('.bk-zl');
    b.hidden = view !== 'flat';
    b.textContent = ar(Math.round(flat.z * 100)) + '٪';
    b.classList.toggle('on', Math.abs(flat.z - 1) > 0.01);
    $('[data-act="zoom"]').setAttribute('aria-pressed', String(view === 'flat' ? flat.z > 1.01 : st.zoom > 1));
  }
  /** التكبير حول نقطةٍ (موضع الماوس، وإلا وسط الصفحات): تبقى تحته */
  function flatZoom(z, cx, cy) {
    z = clamp(z, 0.4, 5);
    if (Math.abs(z - flat.z) < 0.002) return;
    const r = flat.el.getBoundingClientRect();
    const mx = cx == null ? r.width / 2 : cx - r.left;
    const my = cy == null ? r.height / 2 : cy - r.top;
    const k = z / flat.z;
    const sl = flat.el.scrollLeft, stp = flat.el.scrollTop;
    // (الفراغ أعلى الصفحات وبينها لا يكبر: يُحسب الموضع من الصفحات نفسها)
    const yIn = stp + my - flat.padT;
    const pg = Math.floor(yIn / stride());
    const inPg = yIn - pg * stride();
    flat.z = z;
    RP.fz = +z.toFixed(3);
    saveRP();
    layoutFlat();
    flat.el.scrollLeft = (sl + mx) * k - mx;
    flat.el.scrollTop = flat.flow === 'scroll' ? flat.padT + pg * stride() + Math.min(inPg * k, flat.fh + FL.lbl) - my : (stp + my) * k - my;
  }
  flat.el.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return flatZoom(flat.z * Math.exp(-clamp(e.deltaY, -120, 120) * 0.0022), e.clientX, e.clientY);
      }
      // التقليب بالعجلة (والصفحة كلها ظاهرة)
      if (flat.flow === 'flip' && flat.el.scrollHeight <= flat.el.clientHeight + 2 && Math.abs(e.deltaY) > 3) {
        e.preventDefault();
        if (Date.now() - (flat.wheelT || 0) > 380) {
          flat.wheelT = Date.now();
          flatStep(e.deltaY > 0 ? 1 : -1);
        }
      }
    },
    { passive: false },
  );
  // الكتاب المجسَّم: Ctrl+العجلة تكبّره وتصغّره
  stage.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0 && st.zoom === 1) setZoom(1.8);
      else if (e.deltaY > 0 && st.zoom > 1) setZoom(1);
    },
    { passive: false },
  );
  // اليد: سحب الصفحات (والنقر في التقليب: يسارها التالية ويمينها السابقة)
  let flPan = null;
  flat.el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || (notes && notes.active) || notBook(e) || e.pointerType === 'touch') return;
    flPan = { x: e.clientX, y: e.clientY, sl: flat.el.scrollLeft, stp: flat.el.scrollTop, moved: false, id: e.pointerId };
  });
  flat.el.addEventListener('pointermove', (e) => {
    if (!flPan || e.pointerId !== flPan.id) return;
    const dx = e.clientX - flPan.x, dy = e.clientY - flPan.y;
    if (!flPan.moved && Math.hypot(dx, dy) < 5) return;
    if (!flPan.moved) {
      flPan.moved = true;
      flat.el.setPointerCapture(e.pointerId);
      flat.el.classList.add('panning');
    }
    flat.el.scrollLeft = flPan.sl - dx;
    flat.el.scrollTop = flPan.stp - dy;
  });
  const flUp = (e) => {
    if (!flPan || e.pointerId !== flPan.id) return;
    const p = flPan;
    flPan = null;
    flat.el.classList.remove('panning');
    if (p.moved || flat.flow !== 'flip' || e.type === 'pointercancel') return;
    if (!e.target.closest('.bk-fp')) return;
    const r = flat.el.getBoundingClientRect();
    flatStep(e.clientX < r.left + r.width / 2 ? 1 : -1);
  };
  flat.el.addEventListener('pointerup', flUp);
  flat.el.addEventListener('pointercancel', flUp);
  function flatKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'PageDown' || (k === ' ' && flat.flow === 'flip')) return e.preventDefault(), flatStep(1), true;
    if (k === 'ArrowRight' || k === 'PageUp') return e.preventDefault(), flatStep(-1), true;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      const d = k === 'ArrowDown' ? 1 : -1;
      if (flat.el.scrollHeight > flat.el.clientHeight + 2) flat.el.scrollBy({ top: d * 90 });
      else flatStep(d);
      return e.preventDefault(), true;
    }
    if (k === ' ') return e.preventDefault(), flat.el.scrollBy({ top: (e.shiftKey ? -1 : 1) * flat.el.clientHeight * 0.85, behavior: 'smooth' }), true;
    if (k === 'Home') return flatGo(1), true;
    if (k === 'End') return flatGo(N), true;
    if (k === '+' || k === '=') return flatZoom(flat.z * 1.2), true;
    if (k === '-') return flatZoom(flat.z / 1.2), true;
    if (k === '0') return flatZoom(1), true;
    return false;
  }
  /** الكتاب مجسَّماً أو صفحاتٍ مسطّحة: عند الصفحة نفسها */
  function setView(v, first) {
    const at = first ? 0 : current();
    view = v;
    RP.view = v;
    saveRP();
    room.classList.toggle('flat', v === 'flat');
    stage.hidden = v === 'flat';
    flat.el.hidden = v !== 'flat';
    const vb = $('[data-act="view"]');
    vb.innerHTML = v === 'flat' ? `${ICON.book3d}<span>كتاب</span>` : `${ICON.pages}<span>صفحات</span>`;
    vb.title = v === 'flat' ? 'الكتاب مجسَّماً تقلّب أوراقه' : 'صفحاتٌ مسطّحة (كالمحرر): تمريرٌ أو تقليب، وCtrl+العجلة للتكبير';
    $('[data-act="flow"]').hidden = v !== 'flat';
    $('[data-act="reset"]').hidden = v === 'flat';
    setFlowBtn();
    if (v === 'flat') {
      if (notes && notes.active) room.classList.add('annotating');
      buildFlat();
      layoutFlat();
      flatGo(at >= 1 && at <= N ? at : at > N ? N : 1);
      flat.el.focus({ preventScroll: true });
    } else {
      // (إلى الصفحة نفسها مباشرةً، مفتوحاً مائلاً قليلاً: لا تقليب ورقةً ورقة)
      if (!first && at >= 1 && at <= N) {
        st.s = Math.floor(at / 2) + 1;
        st.side = at % 2 === 1 ? 'l' : 'r';
        const t = restTilt();
        st.rx = t.rx;
        st.ry = t.ry;
      }
      measure();
      paint();
    }
    zoomChip();
    fitTools();
  }
  function setFlowBtn() {
    const b = $('[data-act="flow"]');
    // الزر يعرض ما يُنتقل إليه
    b.innerHTML = flat.flow === 'flip' ? `${ICON.scroll}<span>تمرير</span>` : `${ICON.flipH}<span>تقليب</span>`;
    b.title = flat.flow === 'flip' ? 'الصفحات تحت بعضها: تمريرٌ إلى الأسفل' : 'تقليب الصفحات يميناً ويساراً (صفحتان متقابلتان حين يتسع المكان)';
  }
  function setFlow(f) {
    const at = flat.cur;
    flat.flow = f;
    RP.flow = f;
    saveRP();
    setFlowBtn();
    for (const fp of flat.col.children) fp.classList.remove('on');
    layoutFlat();
    flatGo(at);
    fitTools();
  }

  /* ---------------- الشريط العلوي حين يضيق: تختفي الكتابة أولاً، ثم يذهب الأقل استعمالاً إلى «المزيد» */
  const tools = $('.bk-tools');
  const moreW = $('.bk-morew');
  const moreBox = $('.bk-more');
  // ترتيب الذهاب إلى «المزيد» (الأبواب ودفتري والدرس والإغلاق تبقى ظاهرة)
  const SPILL = ['full', 'reset', 'flow', 'zoom', 'view', 'dlmenu', 'find'];
  const homeOf = new Map();
  for (const a of SPILL) {
    const el = a === 'dlmenu' ? $('.bk-dlw') : tools.querySelector(`:scope > [data-act="${a}"]`);
    if (!el) continue;
    const mark = document.createComment(a);
    el.before(mark);
    homeOf.set(el, mark);
  }
  let fitting = false;
  function fitTools() {
    if (fitting) return;
    fitting = true;
    const top = $('.bk-top');
    for (const [el, mark] of homeOf) if (el.parentElement !== tools) mark.after(el);
    moreW.hidden = true;
    room.classList.remove('icons');
    const room0 = () => top.clientWidth - (parseFloat(getComputedStyle(top).paddingLeft) + parseFloat(getComputedStyle(top).paddingRight)) - 16 - Math.min(200, $('.bk-name b').scrollWidth);
    const over = () => tools.scrollWidth > room0();
    if (over()) room.classList.add('icons');
    if (over()) {
      moreW.hidden = false;
      for (const a of SPILL) {
        if (!over()) break;
        const el = [...homeOf.keys()].find((x) => (a === 'dlmenu' ? x.classList.contains('bk-dlw') : x.dataset.act === a));
        if (el && !el.hidden) moreBox.appendChild(el);
      }
    }
    fitting = false;
  }
  function moreMenu(on) {
    on = on ?? moreBox.hidden;
    moreBox.hidden = !on;
    $('[data-act="more"]').setAttribute('aria-expanded', String(on));
  }
  const toolsRO = new ResizeObserver(() => fitTools());
  toolsRO.observe($('.bk-top'));

  /* ---------------- لوحتا الأبواب ودفتري: بجانب الكتاب بقدر الحاجة، ودُرجٌ جانبي حين يضيق المكان كثيراً */
  const slimRO = new ResizeObserver(() => {
    const slim = room.clientWidth < 600;
    if (slim !== room.classList.contains('slim')) {
      room.classList.toggle('slim', slim);
      relayout();
    }
  });
  slimRO.observe(room);

  /* ---------------- الأزرار ولوحة المفاتيح */
  room.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a !== 'dlmenu') dlMenu(false);
    if (a !== 'more' && a !== 'dlmenu') moreMenu(false);
    if (a === 'close') close();
    else if (a === 'dlmenu') (paintWaraq(), dlMenu());
    else if (a === 'dlwaraq') runWaraq();
    else if (a === 'lesson') o.lesson && o.lesson();
    else if (a === 'dl') return;
    else if (a === 'dlnotes') notes && notes.savePdf();
    else if (a === 'dltxt') notes && notes.saveText();
    else if (a === 'notes') notes && notes.openPanel('notes');
    else if (a === 'ai') toggleAI();
    else if (a === 'nbnew') nbMenu(false);
    else if (a === 'nbhead') nbHeads();
    else if (a === 'nbren') nbRename();
    else if (a === 'find') notes && notes.openPanel('find');
    else if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'toc') toggleToc();
    else if (a === 'zoom') view === 'flat' ? flatZoom(flat.z * 1.25) : setZoom(st.zoom > 1 ? 1 : 1.8);
    else if (a === 'fit') flatZoom(1);
    else if (a === 'view') setView(view === 'flat' ? '3d' : 'flat');
    else if (a === 'flow') setFlow(flat.flow === 'flip' ? 'scroll' : 'flip');
    else if (a === 'more') return moreMenu();
    else if (a === 'reset') resetTilt();
    else if (a === 'paper') setPaperY(!room.classList.contains('paper-y'));
    else if (a === 'full') {
      if (document.fullscreenElement) document.exitFullscreen();
      else room.requestFullscreen && room.requestFullscreen().catch(() => {});
    } else if (a === 'goto') {
      const v = prompt(`انتقل إلى صفحة (١–${ar(N)}):`, String(current() || 1));
      const n = parseInt(String(v || '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660), 10);
      if (n >= 1 && n <= N) gotoPage(n);
    }
  });
  const out = $('.bk-scrub output');
  scrub.addEventListener('input', () => {
    const v = +scrub.value;
    out.textContent = v === 0 ? 'الغلاف' : v === N + 1 ? 'ظهر الكتاب' : 'ص ' + ar(v);
    out.style.setProperty('--p', (v / (N + 1)).toFixed(4));
    room.classList.add('scrubbing');
  });
  scrub.addEventListener('change', () => {
    room.classList.remove('scrubbing');
    gotoPage(+scrub.value);
  });
  function onKey(e) {
    // اختصارات «مجلس الدرس» (تعمل والكتاب مفتوح)
    if (e.ctrlKey && e.shiftKey && !e.altKey && o.lessonKey && (e.code === 'KeyD' ? (e.preventDefault(), o.lesson(), true) : o.lessonKey(e))) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyA') return e.preventDefault(), toggleAI();
    if (notes && notes.onKey(e)) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')) return;
    if (e.key === 'Escape') {
      if (!$('.bk-more').hidden) return moreMenu(false);
      if (!$('.bk-dlw .bk-menu').hidden) return dlMenu(false);
      if (!$('.bk-toc').hidden) return toggleToc(false);
      if (view === 'flat' && flat.z > 1.01) return flatZoom(1);
      if (view !== 'flat' && st.zoom > 1) return setZoom(1);
      return close();
    }
    if (view === 'flat' && flatKey(e)) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') gotoPage(0);
    else if (e.key === 'End') gotoPage(N + 1);
    else if (e.key === '+' || e.key === '=') setZoom(1.8);
    else if (e.key === '-') setZoom(1);
  }
  document.addEventListener('keydown', onKey);
  let rt = 0;
  const onResize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => (relayout(), fitTools()), 80);
  };
  window.addEventListener('resize', onResize);

  /* ---------------- قائمة التنزيل، والإشعار */
  function dlMenu(on) {
    const m = $('.bk-dlw .bk-menu');
    on = on ?? m.hidden;
    m.hidden = !on;
    $('[data-act="dlmenu"]').setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('pointerdown', onDocDown, true);
  function onDocDown(e) {
    if (!e.target.closest || !e.target.closest('.bk-dlw')) dlMenu(false);
    if (!e.target.closest || !e.target.closest('.bk-morew')) moreMenu(false);
  }
  let toastT = 0;
  function toast(msg, ms = 2600, action) {
    const t = $('.bk-toast');
    t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
    if (action) t.querySelector('button').onclick = () => {
      t.hidden = true;
      action.run();
    };
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), ms);
  }

  /* ---------------- الدفتر: صفحاتٌ تُضاف، ولكل صفحةٍ قالبها (ملفٌّ جديد يحلّ محل القديم دون إغلاق الكتاب) */
  let nbBusy = false;
  async function swapDoc(blob, { clear = [], go, outer, title } = {}) {
    const np = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    // اسمٌ جديد: الغلاف والكعب والعنوان
    if (outer) {
      o.outer = outer;
      spineTex = { key: '', url: '' };
      $('.bk-box').dataset.sig = '';
    }
    if (title) {
      o.title = title;
      $('.bk-name b').textContent = title;
      room.setAttribute('aria-label', 'قراءة: ' + title);
    }
    const old = pdf;
    pdf = np;
    N = Math.max(1, pdf.numPages - OFF - (await backTail(pdf)));
    buildLeaves();
    for (const [k, u] of [...cache]) if (clear.includes(+k.split('@')[0])) (cache.delete(k), URL.revokeObjectURL(u));
    URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    $('[data-act="dl"]').href = url;
    o.blob = blob;
    if (notes && notes.setDoc) notes.setDoc(pdf, N);
    if (view === 'flat') {
      if (flat.io) flat.io.disconnect();
      flat.built = false;
      buildFlat();
      layoutFlat();
    } else {
      measure();
      paint();
    }
    try {
      old.destroy();
    } catch {}
    if (go) await gotoPage(go);
    label();
    buildToc();
  }
  async function nbAddPage(tpl) {
    if (nbBusy || !o.notebook) return;
    nbBusy = true;
    try {
      const r = await o.notebook.addPage(tpl);
      await swapDoc(r.blob, { go: N + 1 });
      toast(`صفحةٌ جديدة: ${r.name}`, 5000, { label: 'قالبٌ آخر', run: () => nbMenu(true) });
    } catch (e) {
      toast('تعذّرت إضافة صفحة: ' + (e && e.message ? e.message : e));
    } finally {
      nbBusy = false;
    }
  }
  async function nbSetTemplate(i, tpl) {
    if (nbBusy || !o.notebook) return;
    nbBusy = true;
    try {
      const r = await o.notebook.setTemplate(i, tpl);
      await swapDoc(r.blob, { clear: [i] });
      toast(`قالب الصفحة ${ar(i)}: ${r.name}`);
    } catch (e) {
      toast('تعذّر تغيير القالب: ' + (e && e.message ? e.message : e));
    } finally {
      nbBusy = false;
    }
  }
  /** قائمة القوالب: صفحةٌ جديدة بقالبها، أو قالبٌ آخر للصفحة الظاهرة */
  async function nbMenu(forCurrent) {
    const box = $('.bk-nbmenu');
    if (!box.hidden && !forCurrent) return (box.hidden = true);
    const cur = visiblePages();
    const i = cur.length ? cur[cur.length - 1] : N;
    const curTpl = o.notebook.pageTemplate(i);
    box.innerHTML = `<div class="nbm-h"><b>${forCurrent ? `قالب الصفحة ${ar(i)}` : 'صفحةٌ جديدة'}</b><button type="button" data-nbx aria-label="أغلق">${ICON.x}</button></div>
      <div class="nbm-grid">${o.notebook.templates
        .map((t) => `<button type="button" data-tpl="${t.id}" aria-pressed="${forCurrent && t.id === curTpl}" title="${esc(t.hint)}"><canvas width="96" height="${Math.round(96 / AR0)}" data-tplv="${t.id}"></canvas><small>${esc(t.name)}</small></button>`)
        .join('')}</div>
      ${forCurrent ? '' : `<button type="button" class="nbm-alt" data-nbcur>أو غيّر قالب الصفحة الظاهرة (ص ${ar(i)})</button>`}`;
    box.dataset.mode = forCurrent ? 'cur' : 'new';
    box.dataset.page = String(i);
    box.hidden = false;
    for (const cv of box.querySelectorAll('canvas[data-tplv]')) o.notebook.thumb(cv, cv.dataset.tplv);
  }
  room.addEventListener('click', (e) => {
    const b = e.target.closest('.bk-nbmenu button');
    if (!b) return;
    const box = $('.bk-nbmenu');
    if (b.hasAttribute('data-nbx')) return (box.hidden = true);
    if (b.hasAttribute('data-nbcur')) return nbMenu(true);
    if (b.dataset.tpl) {
      box.hidden = true;
      if (box.dataset.mode === 'cur') nbSetTemplate(+box.dataset.page, b.dataset.tpl);
      else nbAddPage(b.dataset.tpl);
    }
  });

  /** عناوين الصفحة (باب وفصل): تُكتب أعلاها، وتصير فهرس الملف فتظهر في «الأبواب» */
  let nbHeadPage = 0;
  function nbHeads(page) {
    const box = $('.bk-nbhead');
    if (!box.hidden && page === undefined) return void (box.hidden = true);
    $('.bk-nbmenu').hidden = true;
    const vis = visiblePages();
    const i = page || (vis.includes(nbHeadPage) ? nbHeadPage : vis.length ? vis[0] : 0);
    if (!i) return toast('افتح الدفتر على صفحةٍ أولاً');
    nbHeadPage = i;
    const list = o.notebook.heads(i);
    const lv = (l) => (l === 2 ? 'فصل' : 'باب');
    box.innerHTML = `<div class="nbm-h"><b>عناوين الصفحة ${ar(i)}</b>${vis.length > 1 ? `<span class="nbh-pages">${vis.map((p) => `<button type="button" data-nbhp="${p}" aria-pressed="${p === i}">ص ${ar(p)}</button>`).join('')}</span>` : ''}<button type="button" data-nbx aria-label="أغلق">${ICON.x}</button></div>
      <p class="nbh-hint">الباب والفصل يُكتبان أعلى الصفحة، ويظهران في «الأبواب» وفي فهرس الملف حين تنزّله.</p>
      ${list.length ? `<ol class="nbh-list">${list.map((h, k) => `<li data-k="${k}"><button type="button" class="nbh-lv l${h.lvl}" data-lv title="بدّل: باب أو فصل">${lv(h.lvl)}</button><input type="text" value="${esc(h.t)}" maxlength="120" dir="auto" aria-label="العنوان"><button type="button" class="nbh-del" data-del title="احذفه" aria-label="احذفه">${ICON.x}</button></li>`).join('')}</ol>` : ''}
      ${list.length < 3 ? `<div class="nbh-add"><span class="nbh-seg" role="group" aria-label="نوعه"><button type="button" data-addlv="1" aria-pressed="${!list.length}">باب</button><button type="button" data-addlv="2" aria-pressed="${!!list.length}">فصل</button></span><input type="text" class="nbh-new" maxlength="120" dir="auto" placeholder="${list.length ? 'فصلٌ تحته…' : 'اكتب عنوان الباب…'}" aria-label="عنوانٌ جديد"><button type="button" class="nbh-go" data-addh>أضف</button></div>` : '<p class="nbh-hint">ثلاثة عناوين على الأكثر في الصفحة.</p>'}`;
    box.hidden = false;
    const inp = box.querySelector('.nbh-new');
    if (inp) inp.focus();
  }
  async function nbSetHeads(i, list) {
    if (nbBusy) return;
    nbBusy = true;
    try {
      const r = await o.notebook.setHeads(i, list);
      await swapDoc(r.blob, { clear: [i] });
    } catch (e) {
      toast('تعذّر: ' + (e && e.message ? e.message : e));
    } finally {
      nbBusy = false;
    }
    if (!$('.bk-nbhead').hidden) nbHeads(i);
  }
  const nbHeadList = () => {
    const box = $('.bk-nbhead');
    return [...box.querySelectorAll('.nbh-list li')].map((li) => ({ lvl: li.querySelector('[data-lv]').classList.contains('l2') ? 2 : 1, t: li.querySelector('input').value.trim() })).filter((h) => h.t);
  };
  function nbAddHead() {
    const box = $('.bk-nbhead');
    const inp = box.querySelector('.nbh-new');
    const t = inp ? inp.value.trim() : '';
    if (!t) return inp && inp.focus();
    const lvl = box.querySelector('[data-addlv][aria-pressed="true"]') ? +box.querySelector('[data-addlv][aria-pressed="true"]').dataset.addlv : 1;
    nbSetHeads(nbHeadPage, [...nbHeadList(), { t, lvl }]);
  }
  room.addEventListener('click', (e) => {
    const box = e.target.closest('.bk-nbhead');
    if (!box) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-nbx')) return void (box.hidden = true);
    if (b.dataset.nbhp) return nbHeads(+b.dataset.nbhp);
    if (b.dataset.addlv) {
      for (const x of box.querySelectorAll('[data-addlv]')) x.setAttribute('aria-pressed', String(x === b));
      return box.querySelector('.nbh-new').focus();
    }
    if (b.hasAttribute('data-addh')) return nbAddHead();
    const li = b.closest('li');
    if (li && b.hasAttribute('data-del')) return nbSetHeads(nbHeadPage, nbHeadList().filter((_, k) => k !== +li.dataset.k));
    if (li && b.hasAttribute('data-lv')) {
      b.classList.toggle('l1');
      b.classList.toggle('l2');
      return nbSetHeads(nbHeadPage, nbHeadList());
    }
  });
  room.addEventListener('keydown', (e) => {
    const box = e.target.closest && e.target.closest('.bk-nbhead');
    if (!box) return;
    if (e.key === 'Escape') return void ((box.hidden = true), e.stopPropagation());
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.target.matches('.nbh-new')) return nbAddHead();
    if (e.target.closest('.nbh-list')) return nbSetHeads(nbHeadPage, nbHeadList());
  });
  room.addEventListener('change', (e) => {
    if (e.target.closest && e.target.closest('.bk-nbhead .nbh-list')) nbSetHeads(nbHeadPage, nbHeadList());
  });
  /** تسمية الدفتر: في مكان اسمه أعلى القارئ (والغلاف والكعب يتبعانه) */
  function nbRename() {
    const b = $('.bk-name b'), inp = $('.bk-nbrn');
    inp.value = o.title || '';
    b.hidden = true;
    $('.bk-nbren').hidden = true;
    inp.hidden = false;
    inp.focus();
    inp.select();
  }
  async function nbRenameDone(keep) {
    const b = $('.bk-name b'), inp = $('.bk-nbrn');
    if (inp.hidden) return;
    const v = inp.value.trim().slice(0, 80);
    inp.hidden = true;
    b.hidden = false;
    $('.bk-nbren').hidden = false;
    if (!keep || !v || v === o.title || nbBusy) return;
    nbBusy = true;
    try {
      const r = await o.notebook.rename(v);
      await swapDoc(r.blob, { outer: r.outer, title: v });
      if (view !== 'flat') paint();
      toast(`سُمّي الدفتر «${v}»`);
    } catch (e) {
      toast('تعذّرت التسمية: ' + (e && e.message ? e.message : e));
    } finally {
      nbBusy = false;
    }
  }
  if (o.notebook) {
    const inp = $('.bk-nbrn');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (e.preventDefault(), nbRenameDone(true));
      if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), nbRenameDone(false));
    });
    inp.addEventListener('blur', () => nbRenameDone(true));
  }

  function close() {
    if (closed) return;
    closed = true;
    if (notes) notes.destroy();
    if (ai) ai.destroy();
    document.removeEventListener('pointerdown', onDocDown, true);
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    if (flat.io) flat.io.disconnect();
    toolsRO.disconnect();
    slimRO.disconnect();
    if (document.fullscreenElement === room) document.exitFullscreen().catch(() => {});
    room.classList.add('leaving');
    setTimeout(() => {
      room.remove();
      document.documentElement.classList.remove('bk-open');
      for (const u of cache.values()) URL.revokeObjectURL(u);
      URL.revokeObjectURL(url);
      pdf && pdf.destroy();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (window.WarraqReader === reader) delete window.WarraqReader;
      if (typeof o.onClose === 'function') o.onClose();
    }, reduceMotion() ? 0 : 260);
  }

  /* ---------------- دفتر القارئ: الأقلام والتحديد والملاحظات والعلامات والبحث */
  try {
    const { createNotes } = await import('/js/book-notes.js');
    notes = await createNotes({
      room, stage, pdf, pdfjs, OFF, N, AR0, pageHpt, notesKey: o.notesKey || '',
      title: o.title || '', vol: o.vol || '', fileName: o.fileName || o.title || 'الكتاب', srcBytes: o.blob.size,
      goto: (i) => gotoPage(i),
      current: () => current(),
      visible: () => visiblePages(),
      toast,
      onLayout: () => relayout(),
      onTool: () => label(),
      onActive: async (on) => {
        if (view === 'flat') {
          room.classList.toggle('annotating', on);
          return label();
        }
        dropHover();
        // يُكتب على الكتاب مفتوحاً مستوياً أمام القارئ
        if (on && isClosed()) {
          if (st.busy) return;
          await flip(st.s === 0 ? 1 : -1);
        }
        room.classList.toggle('annotating', on);
        if (on) {
          tiltSeq++;
          if (st.rx || st.ry) {
            const a = { rx: st.rx, ry: st.ry };
            await tween(380, (e) => {
              st.rx = a.rx * (1 - e);
              st.ry = a.ry * (1 - e);
              applyTransform();
            });
          }
          st.rx = st.ry = 0;
          applyTransform();
        } else resetTilt();
        label();
      },
    });
  } catch (err) {
    console.error(err);
  }
  // «مجلس الدرس»: سطرٌ من تفريغ الدرس يصير ملاحظةً في الصفحة المفتوحة (أو يُضاف إلى ملاحظةٍ مفتوحة للكتابة)
  const reader = {
    title: o.title || '',
    /** عنوان الباب الذي فيه القارئ (للتفريغ المباشر: يعين على كلماته) */
    get heading() {
      const p = current() || 1;
      let h = '';
      for (const x of tocItems) if (x.i <= p) h = x.title;
      return String(h || '').slice(0, 200);
    },
    addNote(text, meta) {
      if (!notes || !notes.addNote) return null;
      if (view !== 'flat' && isClosed() && !st.busy) flip(st.s === 0 ? 1 : -1);
      const r = notes.addNote(text, meta, Math.max(1, Math.min(N, current() || 1)));
      if (r && !r.into && !r.open) toast(`أُضيفت إلى ص ${String(r.page).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d])} ملاحظةٌ من الدرس`);
      return r;
    },
    /** «تتبّع الشارح»: سطرٌ من تفريغ الدرس ← موضعه في الكتاب مظلَّلاً (opts.auto: يُنتقل إليه وحده) */
    follow: (text, opts) => (notes && notes.follow ? notes.follow(text, opts) : Promise.resolve(null)),
    /** التتبّع المباشر كلمةً كلمة (before: ما تمّ قبلُ، now: الجاري) */
    followLive: (before, now, opts) => (notes && notes.followLive ? notes.followLive(before, now, opts) : null),
    followClear: () => notes && notes.followClear && notes.followClear(),
    get followProgress() {
      return notes && notes.followProgress ? notes.followProgress : null;
    },
    goto: (i) => gotoPage(i),
    /** نص صفحةٍ من الكتاب كما يقرؤه البرنامج (سطراً سطراً) */
    pageText: async (i) => (notes && notes.pageContext ? (await notes.pageContext(i)).text : ''),
    get pages() {
      return N;
    },
    get page() {
      return current() || 0;
    },
    /** الصفحات الظاهرة الآن */
    get visible() {
      return visiblePages();
    },
  };
  window.WarraqReader = reader;
  const lessonOn = () => o.lessonOpen && room.querySelector('.bk-lesson') && room.querySelector('.bk-lesson').setAttribute('aria-pressed', String(!!o.lessonOpen()));
  lessonOn();
  if (o.lessonOpen) room.addEventListener('click', () => setTimeout(lessonOn, 30));

  /* ---------------- البداية: كتابٌ مغلق مائل يُرى سُمكه (أو الصفحات مسطّحةً لمن اختارها) */
  const t0 = restTilt(0);
  st.rx = t0.rx;
  st.ry = t0.ry;
  setView(view, true);
  room.classList.remove('is-loading');
  fitTools();
  buildToc();
  // متابعة القراءة من حيث توقف القارئ آخر مرة
  if (notes && notes.resumeAt > 1 && notes.resumeAt <= N) {
    const i = notes.resumeAt;
    toast(`وقفتَ آخر مرة عند الصفحة ${ar(i)}`, 9000, { label: 'تابع القراءة', run: () => gotoPage(i) });
  }
  // (يبقى مغلقاً حتى يفتحه القارئ: يديره أولاً إن شاء، ثم يضغطه)
  return close;
}
