// دفتر القارئ: أقلام الحبر والتظليل، وتحديد النص ونسخه وتظليله، والنص المضاف، والملاحظات اللاصقة، والعلامات،
// والبحث في الكتاب، ومتابعة القراءة؛ ثم حفظ الكتاب ملفاً جديداً فيه ذلك كله (تعليقات PDF حقيقية تظهر في أي قارئ).
// كل ما يُكتب يُحفظ في متصفح القارئ وحده (reader-store.js)، ويعود متى فُتح الكتاب نفسه.
//
// المواضع كلها نسبٌ من الصفحة (٠–١)، فتبقى في مكانها مهما كبُر الكتاب أو صغُر أو قُلِّبت ورقته.

import { getItem, setItem } from '/js/reader-store.js';
import { FONTS } from '/shared/presets.js';
import { BUILTIN, getTip, drawStroke, tipThumb, preview, brushSets, seedOf, strokeBox } from '/js/brush-engine.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** وقتٌ من الدرس: ١:٠٤:٠٩ أو ٤:٠٩ */
const clockOf = (t) => {
  t = Math.max(0, Math.floor(+t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s2 = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s2}` : `${m}:${s2}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const rgb = (h) => {
  const n = parseInt(String(h).replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// تطبيع البحث: بلا تشكيل ولا تطويل، والهمزات والتاء المربوطة والألف المقصورة صورة واحدة
const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const norm = (s) =>
  String(s || '')
    .replace(DIAC, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();

/* ------------------------------------------------------------------ الأدوات */
export const PEN_COLORS = ['#1d1712', '#B3261E', '#1F4E9B', '#1F6E43', '#8A5A12', '#6A2C91'];
// ألوان التظليل: تُرسم «تغميقاً» (Darken) فيبقى الحبر كما هو ويتلوّن ما حوله فقط
export const HL_COLORS = ['#FFE566', '#B4EDA9', '#FFC1DA', '#B5E1FF', '#FFD39A'];
const TEXT_COLORS = ['#1d1712', '#B3261E', '#1F4E9B', '#1F6E43', '#8A5A12', '#6B1D2F'];
const SIZES = { pen: [0.0022, 0.0038, 0.0065], marker: [0.016, 0.024, 0.034] };
/* الأقلام: حتى ثمانية، لكلٍّ نوعه (حبرٌ أو تظليل) وشكله (مستديرٌ متّجه، أو فرشاةٌ مضمّنة، أو من الفُرَش المضافة) ولونه وحجمه وشفافيته */
export const MAX_PENS = 8;
const PEN_RANGE = { ink: [0.0008, 0.04], mark: [0.006, 0.07] }; // عرض الخط من عرض الصفحة: أدقّه وأغلظه
const penW = (kind, v) => {
  const [a, b] = PEN_RANGE[kind] || PEN_RANGE.ink;
  return a * Math.pow(b / a, clamp(v, 0, 100) / 100);
};
const penV = (kind, w) => {
  const [a, b] = PEN_RANGE[kind] || PEN_RANGE.ink;
  return Math.round((Math.log(clamp(w, a, b) / a) / Math.log(b / a)) * 100);
};
const DEFAULT_PENS = () => [
  { id: 'p-ink', kind: 'ink', name: 'قلم الحبر', br: 'round', c: PEN_COLORS[0], w: 0.0038, op: 1 },
  { id: 'p-mark', kind: 'mark', name: 'قلم التظليل', br: 'round', c: HL_COLORS[0], w: 0.024, op: 1 },
];
function cleanPens(list) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p !== 'object' || out.length >= MAX_PENS) continue;
    const kind = p.kind === 'mark' ? 'mark' : 'ink';
    out.push({
      id: /^p-[\w-]{1,30}$/.test(String(p.id || '')) && !out.some((x) => x.id === p.id) ? p.id : 'p-' + Math.random().toString(36).slice(2, 9),
      kind,
      name: String(p.name || '').slice(0, 40) || (kind === 'ink' ? 'قلم' : 'تظليل'),
      br: /^(round|b:[a-z]+|s:[a-f0-9]{12}:\d+)$/.test(String(p.br || '')) ? p.br : 'round',
      c: /^#[0-9a-f]{6}$/i.test(String(p.c || '')) ? p.c : kind === 'ink' ? PEN_COLORS[0] : HL_COLORS[0],
      w: clamp(+p.w || (kind === 'ink' ? 0.0038 : 0.024), PEN_RANGE[kind][0], PEN_RANGE[kind][1]),
      op: clamp(+p.op || 1, 0.1, 1),
      ...(p.fw ? { fw: true } : {}),
    });
  }
  return out.length ? out : DEFAULT_PENS();
}
const TEXT_SIZES = [10, 12, 14, 16, 20, 24, 30, 36];

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const NICON = {
  hand: I('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5"/><path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L4 14.4a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/>'),
  select: I('<path d="M9 4h6M9 20h6M12 4v16"/><path d="M5 9 3 12l2 3M19 9l2 3-2 3"/>'),
  pen: I('<path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 3L8.2 18.4z"/><path d="M13.8 6.8l3 3"/>'),
  marker: I('<path d="M9 15l-3.5 3.5H3V16l3.5-3.5"/><path d="M8.5 13.5 15 7l4 4-6.5 6.5z"/><path d="M14 20h7"/>'),
  text: I('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  note: I('<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/><path d="M8.5 9h7M8.5 12.5h4"/>'),
  eraser: I('<path d="M8.5 19 4 14.5 13.5 5l6.5 6.5-7.5 7.5z"/><path d="M8.5 19H20M9 9.5l6.5 6.5"/>'),
  undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: I('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  mark: I('<path d="M7 3h10v18l-5-4-5 4z"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  quote: I('<path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12h5V7zM10 12c0 3-1.5 5-4.5 5.5M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12h5V7zM19 12c0 3-1.5 5-4.5 5.5"/>'),
  under: I('<path d="M7 4v6a5 5 0 0 0 10 0V4M5 20h14"/>'),
  trash: I('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  search: I('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
  book: I('<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>'),
  save: I('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
  doc: I('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2"/>'),
  move: I('<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'),
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  bold: I('<path d="M7 4h6.5a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z"/>', 'stroke-width="2.2"'),
};
const TOOLS = [
  ['hand', 'تقليب الصفحات', 'H'],
  ['select', 'تحديد النص ونسخه وتظليله', 'V'],
  ['pen', 'قلم الحبر', 'P'],
  ['marker', 'قلم التظليل', 'M'],
  ['text', 'إضافة نص', 'T'],
  ['note', 'ملاحظة لاصقة', 'N'],
  ['eraser', 'الممحاة', 'E'],
];

/**
 * @param {object} c
 * @param {HTMLElement} c.room  @param {HTMLElement} c.stage
 * @param {object} c.pdf  @param {object} c.pdfjs
 * @param {number} c.OFF  @param {number} c.N  @param {number} c.AR0  @param {number} c.pageHpt
 * @param {string} c.title  @param {string} c.fileName
 * @param {(i:number)=>void} c.goto  @param {()=>number} c.current
 * @param {(on:boolean)=>void} c.onActive  حين تُختار أداة كتابة (يستوي الكتاب) أو يعود التقليب
 * @param {(msg:string)=>void} c.toast
 */
export async function createNotes(c) {
  const { room, stage, pdfjs, OFF, AR0 } = c;
  let { pdf, N } = c; // (الدفتر: يتجدد ملفه كلما زادت صفحاته)
  const VH = 1000 / AR0; // طول الصفحة بوحدات الرسم (عرضها ١٠٠٠)
  const key = c.notesKey || 'book:' + ((pdf.fingerprints && pdf.fingerprints[0]) || 'x') + ':' + N;
  const saved = (await getItem('notes', key)) || {};
  const M = { anns: Array.isArray(saved.anns) ? saved.anns : [], marks: Array.isArray(saved.marks) ? saved.marks : [], last: saved.last || 0 };
  const S = {
    tool: 'hand',
    color: { pen: PEN_COLORS[0], marker: HL_COLORS[0], hl: HL_COLORS[0], text: TEXT_COLORS[0] },
    size: { pen: 1, marker: 1 },
    font: 'Amiri',
    fs: 14,
    bold: false,
    undo: [],
    redo: [],
  };
  try {
    Object.assign(S, JSON.parse(localStorage.getItem('warraq-pen') || '{}'), { tool: 'hand', undo: [], redo: [] });
  } catch {}
  if (!FONTS[S.font] && S.font !== 'Tajawal') S.font = 'Amiri';
  // الأقلام (وما كان قبلها: قلم الحبر وقلم التظليل بلونيهما وحجميهما)
  (() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('warraq-pens') || 'null');
    } catch {}
    if (saved && Array.isArray(saved.pens)) {
      S.pens = cleanPens(saved.pens);
      S.pen = S.pens.some((p) => p.id === saved.pen) ? saved.pen : S.pens[0].id;
      S.lastPen = saved.last && typeof saved.last === 'object' ? saved.last : {};
    } else {
      const d = DEFAULT_PENS();
      d[0].c = S.color.pen || d[0].c;
      d[0].w = SIZES.pen[S.size.pen ?? 1] || d[0].w;
      d[1].c = S.color.marker || d[1].c;
      d[1].w = SIZES.marker[S.size.marker ?? 1] || d[1].w;
      S.pens = d;
      S.pen = d[0].id;
      S.lastPen = {};
    }
  })();
  const keepPrefs = () => {
    try {
      localStorage.setItem('warraq-pen', JSON.stringify({ color: S.color, size: S.size, font: S.font, fs: S.fs, bold: S.bold }));
      localStorage.setItem('warraq-pens', JSON.stringify({ pens: S.pens, pen: S.pen, last: S.lastPen }));
    } catch {}
  };
  const penNow = () => S.pens.find((p) => p.id === S.pen) || S.pens[0];
  /** القلم الأخير من نوعه (حبرٌ أو تظليل) */
  function penOfKind(kind) {
    const last = S.pens.find((p) => p.id === S.lastPen[kind] && p.kind === kind);
    return last || S.pens.find((p) => p.kind === kind) || null;
  }
  // خطوط النص المضاف (المضمّنة في الموقع)
  if (!document.querySelector('link[href="/covers/fonts.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/covers/fonts.css';
    document.head.appendChild(l);
  }

  /* ------------------------------------------------------------ الحفظ */
  let saveT = 0;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => setItem('notes', key, { anns: M.anns, marks: M.marks, last: M.last, title: c.title || '', updated: Date.now() }), 350);
    updateCounts();
  };
  const annsOf = (i) => M.anns.filter((a) => a.p === i);

  /* ------------------------------------------------------------ الواجهة */
  const ui = document.createElement('div');
  ui.className = 'nt-ui nt-rail';
  ui.setAttribute('role', 'toolbar');
  ui.setAttribute('aria-label', 'أدوات القراءة');
  ui.innerHTML =
    TOOLS.map(([t, label, k]) => `<button type="button" class="nt-t" data-tool="${t}" aria-pressed="${t === 'hand'}" title="${label} (${k})">${NICON[t]}<span>${label}</span></button>`).join('') +
    `<i class="nt-sep"></i>
     <button type="button" class="nt-t" data-nact="mark" aria-pressed="false" title="علامة على هذه الصفحة (B)">${NICON.mark}<span>علامة</span></button>
     <button type="button" class="nt-t" data-nact="undo" title="تراجع (Ctrl+Z)" disabled>${NICON.undo}<span>تراجع</span></button>
     <button type="button" class="nt-t" data-nact="redo" title="إعادة (Ctrl+Y)" disabled>${NICON.redo}<span>إعادة</span></button>`;
  const opts = document.createElement('div');
  opts.className = 'nt-ui nt-opts';
  opts.hidden = true;
  // (فوق المسرح لا فيه: لا تتحرك الأدوات مع تمرير الكتاب مكبَّراً)
  room.querySelector('.bk-mid').append(ui, opts);
  const pop = document.createElement('div'); // قائمة النص المحدَّد
  pop.className = 'nt-ui nt-pop';
  pop.hidden = true;
  const card = document.createElement('div'); // الملاحظة اللاصقة مفتوحة
  card.className = 'nt-ui nt-card';
  card.hidden = true;
  room.append(pop, card);

  function renderOpts() {
    const t = S.tool;
    opts.hidden = !['pen', 'marker', 'text', 'select'].includes(t);
    if (opts.hidden) return;
    const sw = (list, cur, kind) =>
      `<div class="nt-sw">${list.map((col) => `<button type="button" data-color="${col}" data-kind="${kind}" style="--c:${col}" aria-pressed="${col.toLowerCase() === String(cur).toLowerCase()}" aria-label="لون ${col}"></button>`).join('')}<label class="nt-cust" title="لون آخر"><input type="color" data-kind="${kind}" value="${cur}"><span style="--c:${cur}"></span></label></div>`;
    opts.classList.toggle('pens', t === 'pen' || t === 'marker');
    if (t === 'pen' || t === 'marker') return renderPens(sw);
    if (t === 'select') {
      opts.innerHTML = `<b>لون التظليل</b>` + sw(HL_COLORS, S.color.hl, 'hl');
    } else {
      const fonts = Object.entries(FONTS);
      opts.innerHTML =
        `<b>النص</b>
         <select data-font title="الخط" aria-label="الخط">${[['Tajawal', { label: 'تجوال (واضح)' }], ...fonts].map(([k, v]) => `<option value="${esc(k)}" ${k === S.font ? 'selected' : ''} style="font-family:'${esc(k)}'">${esc(v.label)}</option>`).join('')}</select>
         <select data-fs title="الحجم" aria-label="الحجم">${TEXT_SIZES.map((n) => `<option value="${n}" ${n === S.fs ? 'selected' : ''}>${ar(n)}</option>`).join('')}</select>
         <button type="button" class="nt-b" data-bold aria-pressed="${!!S.bold}" title="عريض" aria-label="عريض">${NICON.bold}</button><i class="nt-vr"></i>` +
        sw(TEXT_COLORS, S.color.text, 'text');
    }
  }
  /* ------------------------------------------------------------ حامل الأقلام: حتى ثمانية، لكلٍّ شكله ولونه وحجمه */
  const shapeName = (ref) => {
    if (!ref || ref === 'round') return 'مستدير';
    if (ref.startsWith('b:')) return (BUILTIN.find((b) => 'b:' + b.id === ref) || {}).name || 'فرشاة';
    return (S.shapeNames && S.shapeNames[ref]) || 'فرشاة';
  };
  function renderPens(sw) {
    const pen = penNow();
    const tray =
      S.pens.map((p, k) => `<button type="button" class="nt-pen${p.kind === 'mark' ? ' mk' : ''}" data-pen="${p.id}" aria-pressed="${p.id === pen.id}" title="${esc(p.name)} — ${esc(shapeName(p.br))} (${ar(k + 1)})"><canvas width="64" height="64" data-tip="${esc(p.br)}" data-c="${p.c}"></canvas><i style="--c:${p.c}"></i></button>`).join('') +
      (S.pens.length < MAX_PENS ? `<button type="button" class="nt-pen add" data-pen-add title="قلمٌ جديد (حتى ثمانية أقلام)">＋</button>` : '');
    opts.innerHTML = `
      <div class="nt-tray" role="group" aria-label="أقلامي">${tray}</div>
      <div class="nt-pset">
        <button type="button" class="nt-pname" data-pen-rename title="سمِّ القلم">${esc(pen.name)}</button>
        <button type="button" class="nt-shape" data-pen-shapes aria-expanded="false" title="شكل القلم"><canvas width="168" height="40" data-prev></canvas><span>${esc(shapeName(pen.br))}</span><i>▾</i></button>
        <i class="nt-vr"></i>
        ${sw(pen.kind === 'ink' ? PEN_COLORS : HL_COLORS, pen.c, 'pen')}
        <i class="nt-vr"></i>
        <label class="nt-rng" title="الحجم"><span>الحجم</span><input type="range" min="0" max="100" value="${penV(pen.kind, pen.w)}" data-pp="size" aria-label="الحجم"></label>
        <label class="nt-rng" title="الشفافية"><span>الشفافية</span><input type="range" min="10" max="100" value="${Math.round(pen.op * 100)}" data-pp="op" aria-label="الشفافية"></label>
        <button type="button" class="nt-b nt-pmore" data-pen-menu aria-expanded="false" title="المزيد: نوع القلم، اتجاه الفرشاة، نسخه، حذفه">${I('<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>')}</button>
      </div>`;
    paintPenCanvases();
    if (!S.shapeNames) brushSets().then((sets) => {
      S.shapeNames = {};
      for (const st of sets) for (const t of st.tips) S.shapeNames[`s:${st.id}:${t.n}`] = t.name;
      const sp = opts.querySelector('.nt-shape span');
      if (sp) sp.textContent = shapeName(penNow().br);
      paintRailPens();
    });
  }
  function paintPenCanvases() {
    const pen = penNow();
    for (const cv of opts.querySelectorAll('canvas[data-tip]')) tipThumb(cv, cv.dataset.tip, cv.dataset.c).catch(() => {});
    const pv = opts.querySelector('canvas[data-prev]');
    if (pv) preview(pv, pen.br, pen.c, { size: clamp(penV(pen.kind, pen.w) / 100, 0.08, 1) * 28 + 2, opacity: pen.op, follow: pen.fw ? true : undefined }).catch(() => {});
  }
  function paintRailPens() {
    for (const [tool, kind] of [['pen', 'ink'], ['marker', 'mark']]) {
      const b = ui.querySelector(`[data-tool="${tool}"]`);
      if (!b) continue;
      const p = (S.tool === tool && penNow().kind === kind ? penNow() : null) || penOfKind(kind);
      let dot = b.querySelector('.nt-pc');
      if (!dot) {
        b.insertAdjacentHTML('beforeend', '<i class="nt-pc"></i>');
        dot = b.querySelector('.nt-pc');
      }
      dot.style.setProperty('--c', p ? p.c : 'transparent');
      dot.hidden = !p;
      const lbl = b.querySelector('span');
      if (lbl) lbl.textContent = p ? `${p.name} — ${shapeName(p.br)}` : kind === 'ink' ? 'قلم الحبر' : 'قلم التظليل';
    }
  }
  function closePenPops() {
    for (const x of opts.querySelectorAll('.nt-shapes, .nt-pmenu')) x.remove();
    for (const x of opts.querySelectorAll('[aria-expanded="true"]')) x.setAttribute('aria-expanded', 'false');
  }
  const deskOf = () => {
    try {
      return window.warraqDesktop || window.top.warraqDesktop || null;
    } catch {
      return null;
    }
  };
  async function openShapes(btn) {
    if (opts.querySelector('.nt-shapes')) return closePenPops();
    closePenPops();
    btn.setAttribute('aria-expanded', 'true');
    const pen = penNow();
    const box = document.createElement('div');
    box.className = 'nt-shapes';
    box.innerHTML = `<h5>المضمّنة</h5><div class="nt-sh-bi">${BUILTIN.map((b) => {
      const ref = b.vector ? 'round' : 'b:' + b.id;
      return `<button type="button" data-shape="${ref}" aria-pressed="${pen.br === ref}" title="${esc(b.hint)}"><canvas width="168" height="40" data-sp="${ref}"></canvas><small>${esc(b.name)}</small></button>`;
    }).join('')}</div><div class="nt-sh-sets"><p class="nt-sh-wait"><span class="spin" aria-hidden="true"><i></i><i></i><i></i></span></p></div>`;
    opts.appendChild(box);
    for (const cv of box.querySelectorAll('canvas[data-sp]')) preview(cv, cv.dataset.sp, pen.c, { size: 16 }).catch(() => {});
    const sets = await brushSets(true);
    const wrap = box.querySelector('.nt-sh-sets');
    if (!box.isConnected) return;
    S.shapeNames = {};
    for (const st of sets) for (const t of st.tips) S.shapeNames[`s:${st.id}:${t.n}`] = t.name;
    wrap.innerHTML = sets.length
      ? sets.map((st) => `<h5>${esc(st.name)} <small>${esc(st.format || '')}</small></h5><div class="nt-sh-tips">${st.tips.slice(0, 200).map((t) => `<button type="button" data-shape="s:${st.id}:${t.n}" aria-pressed="${pen.br === `s:${st.id}:${t.n}`}" title="${esc(t.name)}"><canvas width="56" height="56" data-st="s:${st.id}:${t.n}"></canvas></button>`).join('')}</div>`).join('')
      : `<p class="nt-sh-none">أضف فُرَشاً من ملفات فوتوشوب (‎.abr‎) وProcreate وKrita وGIMP وغيرها من <b>الإعدادات ← الخطوط والفُرَش</b>، فتظهر هنا أشكالاً لأقلامك.${deskOf() ? ' <button type="button" data-open-brushes>افتح الإعدادات</button>' : ''}</p>`;
    for (const cv of wrap.querySelectorAll('canvas[data-st]')) tipThumb(cv, cv.dataset.st, pen.c).catch(() => {});
  }
  function openPenMenu(btn) {
    if (opts.querySelector('.nt-pmenu')) return closePenPops();
    closePenPops();
    btn.setAttribute('aria-expanded', 'true');
    const pen = penNow();
    const m = document.createElement('div');
    m.className = 'nt-pmenu';
    m.innerHTML = `
      <div class="nt-pm-seg" role="group" aria-label="نوع القلم"><button type="button" data-pm="ink" aria-pressed="${pen.kind === 'ink'}">حبر</button><button type="button" data-pm="mark" aria-pressed="${pen.kind === 'mark'}">تظليل <small>يُمزج بالورق</small></button></div>
      ${pen.br !== 'round' ? `<label class="nt-pm-chk"><input type="checkbox" data-pm="fw" ${pen.fw ? 'checked' : ''}> الشكل يدور مع اتجاه الخط</label>` : ''}
      <button type="button" data-pm="dup" ${S.pens.length >= MAX_PENS ? 'disabled' : ''}>نسخةٌ من هذا القلم</button>
      <button type="button" data-pm="del" ${S.pens.length < 2 ? 'disabled' : ''}>احذف هذا القلم</button>
      <button type="button" data-pm="reset" class="q">أعد الأقلام إلى أصلها</button>`;
    opts.appendChild(m);
  }
  function selectPen(id) {
    const p = S.pens.find((x) => x.id === id);
    if (!p) return;
    S.pen = p.id;
    S.lastPen[p.kind] = p.id;
    keepPrefs();
    setTool(p.kind === 'ink' ? 'pen' : 'marker', p.id);
  }
  /** أفعال حامل الأقلام ← true إن عولج النقر */
  function penAct(b) {
    const pen = penNow();
    if (b.dataset.pen) return selectPen(b.dataset.pen), true;
    if (b.hasAttribute('data-pen-add')) {
      if (S.pens.length >= MAX_PENS) return true;
      const np = { ...pen, id: 'p-' + uid().slice(0, 7), name: `قلم ${ar(S.pens.length + 1)}` };
      S.pens.push(np);
      selectPen(np.id);
      return true;
    }
    if (b.hasAttribute('data-pen-shapes')) return openShapes(b), true;
    if (b.hasAttribute('data-pen-menu')) return openPenMenu(b), true;
    if (b.hasAttribute('data-pen-rename')) {
      const n = prompt('اسم القلم:', pen.name);
      if (n && n.trim()) {
        pen.name = n.trim().slice(0, 40);
        keepPrefs();
        renderOpts();
        paintRailPens();
      }
      return true;
    }
    if (b.hasAttribute('data-open-brushes')) {
      try {
        localStorage.setItem('warraq.settingsOpen', 'fonts');
        deskOf().openWindow('settings');
      } catch {}
      return true;
    }
    if (b.dataset.shape) {
      pen.br = b.dataset.shape;
      keepPrefs();
      renderOpts();
      paintRailPens();
      return true;
    }
    if (b.dataset.pm) {
      const a = b.dataset.pm;
      if (a === 'ink' || a === 'mark') {
        if (pen.kind !== a) {
          pen.kind = a;
          pen.w = clamp(pen.w, PEN_RANGE[a][0], PEN_RANGE[a][1]);
          if (a === 'mark' && PEN_COLORS.includes(pen.c)) pen.c = HL_COLORS[0];
          if (a === 'ink' && HL_COLORS.includes(pen.c)) pen.c = PEN_COLORS[0];
        }
        return selectPen(pen.id), true;
      }
      if (a === 'dup' && S.pens.length < MAX_PENS) {
        const np = { ...pen, id: 'p-' + uid().slice(0, 7), name: pen.name + ' ٢' };
        S.pens.splice(S.pens.indexOf(pen) + 1, 0, np);
        return selectPen(np.id), true;
      }
      if (a === 'del' && S.pens.length > 1) {
        if (!confirm(`حذف «${pen.name}» من حامل الأقلام؟ (يبقى ما كتبتَ به)`)) return true;
        const k = S.pens.indexOf(pen);
        S.pens.splice(k, 1);
        return selectPen(S.pens[Math.max(0, k - 1)].id), true;
      }
      if (a === 'reset') {
        if (!confirm('إرجاع الأقلام إلى قلم الحبر وقلم التظليل؟')) return true;
        S.pens = DEFAULT_PENS();
        S.lastPen = {};
        return selectPen(S.pens[0].id), true;
      }
      return true;
    }
    if (b.dataset.color && b.dataset.kind === 'pen') {
      pen.c = b.dataset.color;
      keepPrefs();
      renderOpts();
      paintRailPens();
      return true;
    }
    return false;
  }
  function penInput(t, done) {
    const pen = penNow();
    if (t.dataset.pp === 'size') pen.w = +penW(pen.kind, +t.value).toFixed(5);
    else if (t.dataset.pp === 'op') pen.op = clamp(+t.value / 100, 0.1, 1);
    else if (t.dataset.pm === 'fw') pen.fw = t.checked ? true : undefined;
    else if (t.type === 'color' && t.dataset.kind === 'pen') {
      pen.c = t.value;
      if (t.nextElementSibling) t.nextElementSibling.style.setProperty('--c', t.value);
    }
    keepPrefs();
    paintPenCanvases();
    const chip = opts.querySelector(`[data-pen="${pen.id}"]`);
    if (chip) {
      const cv = chip.querySelector('canvas');
      cv.dataset.c = pen.c;
      chip.querySelector('i').style.setProperty('--c', pen.c);
      tipThumb(cv, pen.br, pen.c).catch(() => {});
    }
    if (done) paintRailPens();
  }
  opts.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.nt-opts')) closePenPops();
  });
  opts.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (penAct(b, e)) return;
    if (b.dataset.color) {
      S.color[b.dataset.kind] = b.dataset.color;
      applyToEditing();
    } else if (b.dataset.size) S.size[S.tool] = +b.dataset.size;
    else if (b.hasAttribute('data-bold')) {
      S.bold = !S.bold;
      applyToEditing();
    }
    keepPrefs();
    renderOpts();
  });
  opts.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.pp || (t.dataset.kind === 'pen' && t.type === 'color')) return penInput(t);
    if (t.type === 'color') {
      S.color[t.dataset.kind] = t.value;
      t.nextElementSibling.style.setProperty('--c', t.value);
      applyToEditing();
    } else if (t.matches('[data-font]')) S.font = t.value;
    else if (t.matches('[data-fs]')) S.fs = +t.value;
    else return;
    applyToEditing();
    keepPrefs();
  });
  opts.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pp || t.dataset.pm === 'fw' || (t.dataset.kind === 'pen' && t.type === 'color')) return penInput(t, true);
    renderOpts();
  });

  function setTool(t, penId) {
    if (!TOOLS.some(([x]) => x === t)) return;
    if (t === 'pen' || t === 'marker') {
      // القلم المختار، أو الأخير من هذا النوع (وإن لم يبقَ قلمٌ منه فأيّ قلم)
      const want = t === 'pen' ? 'ink' : 'mark';
      const p = (penId && S.pens.find((x) => x.id === penId)) || penOfKind(want) || penNow();
      S.lastPen[p.kind] = p.id;
      S.pen = p.id;
      t = p.kind === 'ink' ? 'pen' : 'marker';
    }
    if (editing) commitEdit();
    closePop();
    const was = S.tool !== 'hand';
    S.tool = t;
    for (const b of ui.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    for (const [x] of TOOLS) room.classList.toggle('tool-' + x, x === t);
    room.classList.toggle('annotating', t !== 'hand');
    if (t !== 'select') window.getSelection()?.removeAllRanges();
    renderOpts();
    paintRailPens();
    if ((t !== 'hand') !== was) c.onActive(t !== 'hand');
    c.onTool && c.onTool(t);
    // تحديد النص: طبقة نص الصفحتين الظاهرتين
    if (t === 'select') for (const L of liveLayers()) ensureText(L);
  }
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) setTool(b.dataset.tool);
    else if (b.dataset.nact === 'undo') undo();
    else if (b.dataset.nact === 'redo') redo();
    else if (b.dataset.nact === 'mark') toggleMark();
  });

  /* ------------------------------------------------------------ الرسم على الصفحة */
  const pathD = (pts) => {
    const P = pts.map(([u, v]) => [u * 1000, v * VH]);
    if (P.length === 1) P.push([P[0][0] + 0.01, P[0][1]]);
    let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
    for (let k = 1; k < P.length - 1; k++) {
      const mx = (P[k][0] + P[k + 1][0]) / 2, my = (P[k][1] + P[k + 1][1]) / 2;
      d += `Q${P[k][0].toFixed(1)} ${P[k][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const L = P[P.length - 1];
    return d + `L${L[0].toFixed(1)} ${L[1].toFixed(1)}`;
  };
  const strokeSvg = (a) => `<path d="${pathD(a.pts)}" stroke="${a.c}" stroke-width="${(a.w * 1000).toFixed(2)}" ${a.t === 'mark' ? 'stroke-linecap="butt"' : ''}${a.op && a.op < 1 ? ` stroke-opacity="${a.op}"` : ''} data-id="${a.id}"/>`;
  const fsCq = (fs) => ((fs / c.pageHpt) * 100).toFixed(3) + 'cqh';
  function overlayHtml(i) {
    const list = annsOf(i);
    let blend = '';
    let ink = '';
    let html = '';
    for (const a of list) {
      if (a.t === 'hl') blend += a.rects.map(([u, v, w, h]) => `<rect x="${(u * 1000).toFixed(1)}" y="${(v * VH).toFixed(1)}" width="${(w * 1000).toFixed(1)}" height="${(h * VH).toFixed(1)}" rx="2" fill="${a.c}" data-id="${a.id}"/>`).join('');
      else if (a.br && (a.t === 'mark' || a.t === 'ink')) continue; // (الفُرَش تُطبع على لوحة: paintBrushes)
      else if (a.t === 'mark') blend += strokeSvg(a);
      else if (a.t === 'ink') ink += strokeSvg(a);
      else if (a.t === 'ul') ink += a.rects.map(([u, v, w, h]) => `<path d="M${(u * 1000).toFixed(1)} ${((v + h) * VH - 1).toFixed(1)}h${(w * 1000).toFixed(1)}" stroke="${a.c}" stroke-width="2.2" data-id="${a.id}"/>`).join('');
      if ((a.t === 'hl' || a.t === 'ul') && a.note) {
        const r = a.rects[0];
        html += `<button type="button" class="an-pin sm" data-id="${a.id}" style="left:${((r[0] + r[2]) * 100).toFixed(2)}%;top:${(r[1] * 100).toFixed(2)}%" title="${esc(a.note)}">${NICON.note}</button>`;
      }
      if (a.t === 'text')
        html += `<div class="an-tx" data-id="${a.id}" dir="auto" style="left:${(a.x * 100).toFixed(2)}%;top:${(a.y * 100).toFixed(2)}%;width:${(a.w * 100).toFixed(2)}%;font-family:'${esc(a.f)}',serif;font-size:${fsCq(a.fs)};color:${a.c};font-weight:${a.b ? 700 : 400}">${esc(a.s)}</div>`;
      if (a.t === 'note') html += `<button type="button" class="an-pin" data-id="${a.id}" style="left:${(a.x * 100).toFixed(2)}%;top:${(a.y * 100).toFixed(2)}%;--c:${a.c || '#F2C94C'}" title="${esc(a.s || 'ملاحظة')}">${NICON.note}</button>`;
    }
    if (M.marks.includes(i)) html += '<i class="an-rib" title="علامة"></i>';
    return { blend: `<svg class="an-blend" viewBox="0 0 1000 ${VH.toFixed(1)}" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round">${blend}</svg>`, rest: `<svg class="an-ink" viewBox="0 0 1000 ${VH.toFixed(1)}" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round">${ink}</svg>${html}` };
  }
  /**
   * طبقتا الصفحة على وجهها (ومنه وجها الورقة وهي تُقلَّب):
   *  ‎.an-hl‎ التظليل وحده، يُمزج بالصفحة «تغميقاً» (Darken): يبقى الحبر على لونه ويتلوّن الورق حوله فقط
   *  ‎.an‎ ما سواه: الحبر والنصوص والملاحظات وطبقة النص للتحديد
   */
  const paintLayer = (L, i) => {
    const o = overlayHtml(i);
    L.previousElementSibling.querySelector('.an-hlv').innerHTML = o.blend;
    L.querySelector('.an-ov').innerHTML = o.rest;
    paintBrushes(L, i);
  };
  /* ---- الفُرَش: لوحتان على الصفحة (الحبر فوقها، والتظليل في طبقة المزج) ---- */
  function sizeCanvas(cv, L) {
    const r = L.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = clamp(Math.round((r.width || 0) * dpr) || 1400, 700, 2400);
    cv.width = W;
    cv.height = Math.round(W / AR0);
  }
  const strokePx = (a, W, H) => a.pts.map((q) => [q[0] * W, q[1] * H, q[2] ?? 0.5]);
  let brushSeq = 0;
  async function paintBrushes(L, i) {
    const list = annsOf(i).filter((a) => a.br && (a.t === 'ink' || a.t === 'mark'));
    const seq = (L._bseq = ++brushSeq);
    if (!list.length) return;
    const tipsOf = new Map();
    for (const a of list) if (!tipsOf.has(a.br)) tipsOf.set(a.br, await getTip(a.br));
    if (L._bseq !== seq || !L.isConnected) return;
    for (const kind of ['mark', 'ink']) {
      const mine = list.filter((a) => a.t === kind);
      if (!mine.length) continue;
      const host = kind === 'mark' ? L.previousElementSibling.querySelector('.an-hlv') : L.querySelector('.an-ov');
      const cv = document.createElement('canvas');
      cv.className = 'an-bc';
      sizeCanvas(cv, L);
      const g = cv.getContext('2d');
      for (const a of mine) {
        const tip = tipsOf.get(a.br);
        const P = strokePx(a, cv.width, cv.height);
        if (!tip) {
          // شكلٌ حُذف من الفُرَش: يُرسم مستديراً
          g.save();
          g.globalAlpha = a.op || 1;
          g.strokeStyle = a.c;
          g.lineWidth = a.w * cv.width;
          g.lineCap = g.lineJoin = 'round';
          g.beginPath();
          P.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
          g.restore();
        } else drawStroke(g, P, { tip, ref: a.br, color: a.c, size: a.w * cv.width, opacity: a.op || 1, seed: a.sd || 1, pressure: !!a.pr, follow: a.fw ? true : undefined });
      }
      host.prepend(cv);
    }
  }
  /** الطبع الحيّ أثناء الكتابة: ما زاد من الخط منذ آخر طبعة */
  function liveStamp(d, all) {
    if (!d.tip || !d.live) return;
    const g = d.live.getContext('2d');
    const P = strokePx(d.a, d.live.width, d.live.height);
    const from = all || !d.last ? 0 : Math.max(0, d.last - 1);
    const seg = P.slice(from);
    if (!seg.length) return;
    drawStroke(g, seg, { tip: d.tip, ref: d.a.br, color: d.a.c, size: d.a.w * d.live.width, opacity: 1, seed: d.a.sd + from, pressure: !!d.a.pr, follow: d.a.fw ? true : undefined });
    d.last = P.length;
  }
  function decorate(el, i, live) {
    let L = el.querySelector(':scope > .an');
    if (!L) {
      const hl = document.createElement('div');
      hl.className = 'an-hl';
      hl.innerHTML = '<div class="an-hits"></div><div class="an-fol"></div><div class="an-hlv"></div>';
      L = document.createElement('div');
      L.className = 'an';
      L.innerHTML = '<div class="an-txt"></div><div class="an-ov"></div>';
      el.append(hl, L);
    }
    L.dataset.i = i;
    L.classList.toggle('an-on', !!live);
    paintLayer(L, i);
    paintHits(L, i);
    paintFollow(L, i);
    if (live && S.tool === 'select') ensureText(L);
  }
  function refresh(i) {
    for (const L of room.querySelectorAll(`.an[data-i="${i}"]`)) {
      paintLayer(L, i);
      if (editing && editing.a.p === i && L === editing.L) {
        // النص الجاري تحريره يبقى عنصراً واحداً (ومقبضه معه)
        const ov = L.querySelector('.an-ov');
        const old = ov.querySelector(`.an-tx[data-id="${editing.a.id}"]`);
        if (old) old.replaceWith(editing.el);
        else ov.appendChild(editing.el);
        editing.el.after(editing.bar);
      }
    }
  }
  const liveLayers = () => [...room.querySelectorAll('.an.an-on')];
  const layerAt = (x, y) =>
    liveLayers().find((L) => {
      const r = L.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  const toPage = (L, x, y) => {
    const r = L.getBoundingClientRect();
    return [(x - r.left) / r.width, (y - r.top) / r.height];
  };

  /* ------------------------------------------------------------ نص الصفحة (لتحديده ونسخه والبحث فيه) */
  const textCache = new Map();
  let pageTextFn = null;
  function textOf(i) {
    if (!textCache.has(i))
      textCache.set(
        i,
        (async () => {
          pageTextFn ||= (await import('/shared/pdf-import.js')).pageText;
          const page = await pdf.getPage(i + OFF);
          try {
            return await pageTextFn(page, pdfjs);
          } catch {
            return { lines: [] };
          }
        })(),
      );
    return textCache.get(i);
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '100px serif';
  async function ensureText(L) {
    const i = +L.dataset.i;
    const box = L.querySelector('.an-txt');
    if (box.dataset.i === String(i)) return;
    box.dataset.i = String(i);
    const { lines } = await textOf(i);
    if (box.dataset.i !== String(i)) return;
    const K = 0.82; // حجم الخط من ارتفاع السطر
    let html = '';
    for (const ln of lines) {
      const h = ln.bottom - ln.top;
      ln.words.forEach((w, k) => {
        const t = w.t + (k < ln.words.length - 1 ? ' ' : '');
        const m = measureCtx.measureText(t).width / 100 || 1;
        const wf = Math.max(0.002, w.x1 - w.x0);
        const sx = (wf * AR0) / (m * h * K);
        html += `<span style="left:${(w.x0 * 100).toFixed(3)}%;top:${(ln.top * 100).toFixed(3)}%;font-size:${(h * K * 100).toFixed(3)}cqh;transform:scaleX(${sx.toFixed(4)})">${esc(t)}</span>`;
      });
      html += '<br>';
    }
    box.innerHTML = html;
  }

  /* ------------------------------------------------------------ السجل (تراجع وإعادة) */
  function apply(op, rev) {
    // op: {kind:'add'|'del'|'upd', a, prev}
    const kind = rev ? { add: 'del', del: 'add', upd: 'upd' }[op.kind] : op.kind;
    const a = rev && op.kind === 'upd' ? op.prev : op.a;
    if (kind === 'add') M.anns.push(a);
    else if (kind === 'del') M.anns = M.anns.filter((x) => x.id !== a.id);
    else {
      const k = M.anns.findIndex((x) => x.id === a.id);
      if (k >= 0) M.anns[k] = a;
      else M.anns.push(a);
    }
    refresh(a.p);
    if (op.prev && op.prev.p !== a.p) refresh(op.prev.p);
    persist();
    if (panelTab) renderPanel();
  }
  function act(op) {
    apply(op, false);
    S.undo.push(op);
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    syncHist();
  }
  function undo() {
    const op = S.undo.pop();
    if (!op) return;
    apply(op, true);
    S.redo.push(op);
    syncHist();
  }
  function redo() {
    const op = S.redo.pop();
    if (!op) return;
    apply(op, false);
    S.undo.push(op);
    syncHist();
  }
  function syncHist() {
    ui.querySelector('[data-nact="undo"]').disabled = !S.undo.length;
    ui.querySelector('[data-nact="redo"]').disabled = !S.redo.length;
  }
  const add = (a) => act({ kind: 'add', a: { id: uid(), at: Date.now(), ...a } });
  const del = (a) => act({ kind: 'del', a });
  const upd = (prev, a) => act({ kind: 'upd', a, prev });

  /* ------------------------------------------------------------ اليد على الصفحة */
  let draw = null;
  function onDown(e) {
    if (S.tool === 'hand' || S.tool === 'select' || e.button > 0) return;
    if (e.target.closest('.nt-ui, .an-txbar')) return;
    const L = e.target.closest('.an.an-on') || layerAt(e.clientX, e.clientY);
    if (!L) return;
    const i = +L.dataset.i;
    const [u, v] = toPage(L, e.clientX, e.clientY);
    if (S.tool === 'pen' || S.tool === 'marker') {
      e.preventDefault();
      const pen = penNow();
      const t = pen.kind === 'mark' ? 'mark' : 'ink';
      const pr = e.pointerType === 'pen' && e.pressure > 0 ? +e.pressure.toFixed(3) : null;
      const a = { t, p: i, c: pen.c, w: +pen.w.toFixed(5), pts: [pr != null ? [u, v, pr] : [u, v]], ...(pen.op < 1 ? { op: pen.op } : {}), ...(pen.br !== 'round' ? { br: pen.br, sd: seedOf(uid()), ...(pen.fw ? { fw: 1 } : {}) } : {}), ...(pr != null ? { pr: 1 } : {}) };
      if (a.br) {
        // الفرشاة: تُطبع على لوحةٍ حيّةٍ فوق الصفحة، ثم تُرسم في مكانها حين يُرفع القلم
        const host = t === 'mark' ? L.previousElementSibling.querySelector('.an-hlv') : L.querySelector('.an-ov');
        const cv = document.createElement('canvas');
        cv.className = 'an-bc live';
        sizeCanvas(cv, L);
        cv.style.opacity = a.op || 1;
        host.appendChild(cv);
        draw = { L, a, live: cv, id: e.pointerId, shift: e.shiftKey, tip: null, last: null };
        getTip(a.br).then((tip) => draw && draw.a === a && ((draw.tip = tip), liveStamp(draw, true)));
      } else {
        const svg = t === 'mark' ? L.previousElementSibling.querySelector('.an-blend') : L.querySelector('.an-ink');
        svg.insertAdjacentHTML('beforeend', strokeSvg({ ...a, id: 'live' }));
        draw = { L, a, path: svg.lastElementChild, id: e.pointerId, shift: e.shiftKey };
      }
      L.setPointerCapture?.(e.pointerId);
    } else if (S.tool === 'eraser') {
      e.preventDefault();
      draw = { L, eraser: true, id: e.pointerId, last: [u, v, e.clientX, e.clientY] };
      L.setPointerCapture?.(e.pointerId);
      eraseAt(L, i, u, v, e.clientX, e.clientY);
    } else if (S.tool === 'text') {
      if (e.target.closest('.an-tx')) return; // تحرير نصٍّ موجود (يُعالج في النقر)
      e.preventDefault();
      if (editing) return commitEdit();
      const w = 0.42;
      startEdit({ id: uid(), at: Date.now(), t: 'text', p: i, x: clamp(u - w, 0.01, 0.99 - w), y: clamp(v - 0.012, 0, 0.95), w, s: '', f: S.font, fs: S.fs, c: S.color.text, b: !!S.bold }, L, true);
    } else if (S.tool === 'note') {
      if (e.target.closest('.an-pin')) return;
      e.preventDefault();
      const a = { id: uid(), at: Date.now(), t: 'note', p: i, x: clamp(u - 0.02, 0, 0.94), y: clamp(v - 0.02, 0, 0.95), s: '', c: '#F2C94C' };
      openCard(a, true);
    }
  }
  function onMove(e) {
    if (!draw || e.pointerId !== draw.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (draw.eraser) {
      const i = +draw.L.dataset.i;
      for (const ev of evs.length ? evs : [e]) {
        const [u, v] = toPage(draw.L, ev.clientX, ev.clientY);
        // الممحاة تمسح ما مرّت عليه كله (لا مواضع الحركة وحدها): نقاطٌ متقاربة بين الموضعين
        const [u0, v0, x0, y0] = draw.last || [u, v, ev.clientX, ev.clientY];
        const n = Math.max(1, Math.ceil(Math.hypot(u - u0, (v - v0) / AR0) / 0.004));
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          eraseAt(draw.L, i, u0 + (u - u0) * f, v0 + (v - v0) * f, x0 + (ev.clientX - x0) * f, y0 + (ev.clientY - y0) * f);
        }
        draw.last = [u, v, ev.clientX, ev.clientY];
      }
      return;
    }
    const pts = draw.a.pts;
    for (const ev of evs.length ? evs : [e]) {
      const q = toPage(draw.L, ev.clientX, ev.clientY);
      const p0 = pts[pts.length - 1];
      if (Math.hypot(q[0] - p0[0], (q[1] - p0[1]) / AR0) > 0.0012) pts.push(draw.a.pr ? [clamp(q[0], 0, 1), clamp(q[1], 0, 1), +(ev.pressure || 0.5).toFixed(3)] : [clamp(q[0], 0, 1), clamp(q[1], 0, 1)]);
    }
    // التظليل مع Shift: خط مستقيم
    if ((e.shiftKey || draw.shift) && draw.a.t === 'mark' && pts.length > 2) pts.splice(1, pts.length - 2);
    if (draw.live) return liveStamp(draw);
    draw.path.setAttribute('d', pathD(pts));
  }
  function onUp(e) {
    if (!draw || e.pointerId !== draw.id) return;
    const d = draw;
    draw = null;
    if (d.eraser) return;
    if (d.live) d.live.remove();
    else d.path.remove();
    // (الفرشاة: لا تُخفَّف نقاطها كثيراً، فشكلها يتبع الحركة)
    const pts = simplify(d.a.pts, d.a.br ? 0.00025 : 0.0007);
    add({ ...d.a, pts: pts.map((q) => (q.length > 2 ? [+q[0].toFixed(5), +q[1].toFixed(5), q[2]] : [+q[0].toFixed(5), +q[1].toFixed(5)])) });
  }
  room.addEventListener('pointerdown', onDown);
  room.addEventListener('pointermove', onMove);
  room.addEventListener('pointerup', onUp);
  room.addEventListener('pointercancel', onUp);
  // (رامر–دوغلاس–بوكر) تخفيف نقاط الخط
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let dm = 0, k = -1;
      const [x1, y1] = pts[a], [x2, y2] = pts[b];
      const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1e-12;
      for (let j = a + 1; j < b; j++) {
        const [x, y] = pts[j];
        const t = clamp(((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / L2, 0, 1);
        const dd = Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
        if (dd > dm) [dm, k] = [dd, j];
      }
      if (dm > eps && k > 0) {
        keep[k] = 1;
        stack.push([a, k], [k, b]);
      }
    }
    return pts.filter((_, j) => keep[j]);
  }
  function eraseAt(L, i, u, v, cx, cy) {
    const tol = 0.008;
    const hit = annsOf(i).find((a) => {
      if (a.t === 'ink' || a.t === 'mark') {
        const r = Math.max(tol, a.w / 2);
        for (let k = 0; k < a.pts.length; k++) {
          const p = a.pts[k], q = a.pts[k + 1] || p;
          const dx = q[0] - p[0], dy = (q[1] - p[1]) / AR0;
          const L2 = dx * dx + dy * dy || 1e-12;
          const t = clamp(((u - p[0]) * dx + ((v - p[1]) / AR0) * dy) / L2, 0, 1);
          if (Math.hypot(u - (p[0] + t * dx), (v - p[1]) / AR0 - t * dy) < r) return true;
        }
        return false;
      }
      if (a.t === 'hl' || a.t === 'ul') return a.rects.some(([x, y, w, h]) => u >= x - 0.004 && u <= x + w + 0.004 && v >= y - 0.004 && v <= y + h + 0.004);
      const el = L.querySelector(`[data-id="${a.id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    });
    if (hit) del(hit);
  }

  /* ------------------------------------------------------------ النص المضاف: يُكتب في موضعه */
  let editing = null; // { a, el, isNew, before }
  function startEdit(a, L, isNew) {
    if (editing) commitEdit();
    const ov = L.querySelector('.an-ov');
    let el = ov.querySelector(`.an-tx[data-id="${a.id}"]`);
    if (!el) {
      ov.insertAdjacentHTML('beforeend', `<div class="an-tx" data-id="${a.id}"></div>`);
      el = ov.lastElementChild;
    }
    el.className = 'an-tx editing';
    el.dir = 'auto';
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.textContent = a.s;
    const bar = document.createElement('span');
    bar.className = 'an-txbar';
    bar.contentEditable = 'false';
    bar.innerHTML = `<button type="button" data-tx="move" title="اسحب لتنقله">${NICON.move}</button><button type="button" data-tx="del" title="احذف النص">${NICON.trash}</button>`;
    editing = { a: { ...a }, el, L, isNew, before: isNew ? null : a, bar };
    styleEdit();
    el.after(bar);
    placeBar();
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    sel.collapseToEnd();
    // ما يختاره القارئ من الخط واللون والحجم يتبع النص الجاري تحريره
    S.font = a.f;
    S.fs = a.fs;
    S.color.text = a.c;
    S.bold = !!a.b;
    if (S.tool === 'text') renderOpts();
  }
  function styleEdit() {
    const { a, el } = editing;
    Object.assign(el.style, { left: (a.x * 100).toFixed(2) + '%', top: (a.y * 100).toFixed(2) + '%', width: (a.w * 100).toFixed(2) + '%', fontFamily: `'${a.f}',serif`, fontSize: fsCq(a.fs), color: a.c, fontWeight: a.b ? 700 : 400 });
  }
  function placeBar() {
    if (!editing) return;
    const { a, bar } = editing;
    Object.assign(bar.style, { left: (a.x * 100).toFixed(2) + '%', top: (a.y * 100).toFixed(2) + '%' });
  }
  function applyToEditing() {
    if (!editing) return;
    Object.assign(editing.a, { f: S.font, fs: S.fs, c: S.color.text, b: !!S.bold });
    styleEdit();
  }
  function commitEdit() {
    if (!editing) return;
    const { a, el, isNew, before, bar } = editing;
    editing = null;
    a.s = el.innerText.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
    bar.remove();
    el.contentEditable = 'false';
    el.classList.remove('editing');
    if (!a.s) {
      if (isNew) refresh(a.p);
      else del(before);
      return;
    }
    if (isNew) act({ kind: 'add', a });
    else if (JSON.stringify(a) !== JSON.stringify(before)) upd(before, a);
    else refresh(a.p);
  }
  room.addEventListener('click', (e) => {
    const tx = e.target.closest('.an.an-on .an-tx');
    if (tx && S.tool === 'text' && !tx.classList.contains('editing')) {
      const a = M.anns.find((x) => x.id === tx.dataset.id);
      if (a) startEdit(a, tx.closest('.an'), false);
      return;
    }
    const tb = e.target.closest('[data-tx]');
    if (tb && editing) {
      if (tb.dataset.tx === 'del') {
        editing.el.textContent = '';
        commitEdit();
      }
      return;
    }
    const pin = e.target.closest('.an.an-on .an-pin');
    if (pin) {
      e.stopPropagation();
      const a = M.anns.find((x) => x.id === pin.dataset.id);
      if (a) openCard(a, false);
    }
  });
  // نقل النص بمقبضه
  room.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-tx="move"]');
    if (!h || !editing) return;
    e.preventDefault();
    e.stopPropagation();
    const L = editing.L;
    const r = L.getBoundingClientRect();
    const s = { x: e.clientX, y: e.clientY, ax: editing.a.x, ay: editing.a.y };
    const mv = (ev) => {
      if (!editing) return;
      editing.a.x = clamp(s.ax + (ev.clientX - s.x) / r.width, 0, 1 - editing.a.w);
      editing.a.y = clamp(s.ay + (ev.clientY - s.y) / r.height, 0, 0.97);
      styleEdit();
      placeBar();
    };
    const end = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', end);
      editing && editing.el.focus();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', end);
  }, true);
  room.addEventListener('focusout', (e) => {
    if (!editing || e.target !== editing.el) return;
    // التنقل إلى أدوات الخط لا يُنهي التحرير
    setTimeout(() => {
      if (!editing) return;
      const f = document.activeElement;
      if (f === editing.el || (f && (opts.contains(f) || editing.bar.contains(f)))) return;
      commitEdit();
    }, 0);
  });

  /* ------------------------------------------------------------ الملاحظة اللاصقة */
  let cardFor = null;
  function openCard(a, isNew) {
    closePop();
    cardFor = { a, isNew };
    card.hidden = false;
    card.innerHTML = `<div class="nt-card-h"><b>${NICON.note} ملاحظة · ص ${ar(a.p)}</b><button type="button" data-card="x" aria-label="أغلق">${NICON.x}</button></div>
      <textarea dir="auto" rows="5" placeholder="اكتب ملاحظتك…">${esc(a.t === 'note' ? a.s : a.note || '')}</textarea>
      ${a.t === 'hl' || a.t === 'ul' ? `<blockquote>${esc((a.text || '').slice(0, 220))}</blockquote>` : ''}
      ${a.src && a.src.kind === 'lesson' ? `<p class="nt-src">من الدرس${a.src.title ? ': ' + esc(a.src.title.slice(0, 80)) : ''} · <button type="button" data-card="hear" title="اسمعه في مجلس الدرس">${ar(clockOf(a.src.t))}</button></p>` : ''}
      <div class="nt-card-f"><button type="button" class="nt-go" data-card="save">حفظ</button>${isNew ? '' : `<button type="button" class="nt-quiet" data-card="del">${NICON.trash} ${a.t === 'note' ? 'احذف الملاحظة' : 'احذف'}</button>`}</div>`;
    placeCard(a);
    card.querySelector('textarea').focus();
  }
  function placeCard(a) {
    const L = room.querySelector(`.an.an-on[data-i="${a.p}"]`);
    const rr = room.getBoundingClientRect();
    let x = rr.width / 2, y = rr.height / 3;
    if (L) {
      const r = L.getBoundingClientRect();
      const ax = a.t === 'note' ? a.x : a.rects ? a.rects[0][0] + a.rects[0][2] : 0.5;
      const ay = a.t === 'note' ? a.y : a.rects ? a.rects[0][1] + a.rects[0][3] : 0.3;
      x = r.left + r.width * ax - rr.left;
      y = r.top + r.height * ay - rr.top + 18;
    }
    const w = Math.min(320, rr.width - 24);
    card.style.width = w + 'px';
    card.style.left = clamp(x - w / 2, 12, rr.width - w - 12) + 'px';
    card.style.top = clamp(y, 64, rr.height - 280) + 'px';
  }
  function closeCard() {
    if (card.contains(document.activeElement)) document.activeElement.blur();
    card.hidden = true;
    cardFor = null;
  }
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-card]');
    if (!b || !cardFor) return;
    const { a, isNew } = cardFor;
    const txt = card.querySelector('textarea').value.trim();
    if (b.dataset.card === 'save') {
      if (a.t === 'note') {
        if (!txt) {
          if (!isNew) del(a);
        } else if (isNew) act({ kind: 'add', a: { ...a, s: txt } });
        else if (txt !== a.s) upd(a, { ...a, s: txt });
      } else if (isNew) act({ kind: 'add', a: { ...a, note: txt } });
      else if (txt !== (a.note || '')) upd(a, { ...a, note: txt });
      closeCard();
    } else if (b.dataset.card === 'hear') {
      try {
        const L = window.top.WarraqShell && window.top.WarraqShell.lesson;
        if (L && L.hear) L.hear(a.src);
      } catch {}
    } else if (b.dataset.card === 'del') {
      if (a.t === 'note') del(a);
      else upd(a, { ...a, note: '' });
      closeCard();
    } else closeCard();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) card.querySelector('[data-card="save"]').click();
    else if (e.key === 'Escape') closeCard();
    if (e.target.tagName === 'TEXTAREA' || e.key === 'Escape') e.stopPropagation();
  });

  /* ------------------------------------------------------------ النص المحدَّد: نسخ، وتظليل، وملاحظة */
  const selInside = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    const host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (!host || !host.closest || !(host.closest('.an-txt') || host.closest('.an'))) return null;
    if (!room.contains(host)) return null;
    return r;
  };
  const cleanText = (s) => String(s).replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  function selRects(range) {
    const out = new Map(); // i ← rects
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const L = layerAt(r.left + r.width / 2, r.top + r.height / 2);
      if (!L) continue;
      const i = +L.dataset.i;
      const b = L.getBoundingClientRect();
      const q = [(r.left - b.left) / b.width, (r.top - b.top) / b.height, r.width / b.width, r.height / b.height];
      if (!out.has(i)) out.set(i, []);
      out.get(i).push(q);
    }
    // ما في السطر الواحد مستطيلٌ واحد
    for (const [i, list] of out) {
      list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const merged = [];
      for (const q of list) {
        const m = merged.find((x) => Math.abs(x[1] + x[3] / 2 - (q[1] + q[3] / 2)) < Math.max(x[3], q[3]) * 0.5);
        if (m) {
          const x0 = Math.min(m[0], q[0]), x1 = Math.max(m[0] + m[2], q[0] + q[2]);
          const y0 = Math.min(m[1], q[1]), y1 = Math.max(m[1] + m[3], q[1] + q[3]);
          m.splice(0, 4, x0, y0, x1 - x0, y1 - y0);
        } else merged.push([...q]);
      }
      out.set(i, merged.map((q) => q.map((n) => +n.toFixed(5))));
    }
    return out;
  }
  let popRange = null;
  function showPop() {
    const r = selInside();
    if (!r || S.tool !== 'select') return closePop();
    popRange = r.cloneRange();
    const rects = [...r.getClientRects()].filter((x) => x.width > 1);
    if (!rects.length) return closePop();
    const rr = room.getBoundingClientRect();
    const top = Math.min(...rects.map((x) => x.top));
    const x0 = Math.min(...rects.map((x) => x.left)), x1 = Math.max(...rects.map((x) => x.right));
    pop.innerHTML = `<button type="button" data-sel="copy">${NICON.copy}<span>نسخ</span></button>
      <button type="button" data-sel="cite" title="ينسخ النص ومعه اسم الكتاب ورقم الصفحة">${NICON.quote}<span>نسخ بالإحالة</span></button>
      <i class="nt-sep"></i>
      ${HL_COLORS.map((col) => `<button type="button" class="nt-dot" data-sel="hl" data-c="${col}" style="--c:${col}" title="ظلّل" aria-pressed="${col === S.color.hl}"></button>`).join('')}
      <button type="button" data-sel="ul" title="خطٌّ تحته">${NICON.under}</button>
      <button type="button" data-sel="note" title="ظلّل واكتب ملاحظة">${NICON.note}<span>ملاحظة</span></button>`;
    pop.hidden = false;
    const w = pop.offsetWidth;
    pop.style.left = clamp((x0 + x1) / 2 - rr.left - w / 2, 8, rr.width - w - 8) + 'px';
    pop.style.top = Math.max(8, top - rr.top - pop.offsetHeight - 10) + 'px';
  }
  function closePop() {
    pop.hidden = true;
    popRange = null;
  }
  const pageRef = (i) => `${c.title || 'الكتاب'}${c.vol ? '، ' + c.vol : ''}، ص ${ar(i)}`;
  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      c.toast('نُسخ');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      room.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      c.toast('نُسخ');
    }
  }
  pop.addEventListener('pointerdown', (e) => e.preventDefault()); // لا يضيع التحديد
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]');
    if (!b || !popRange) return;
    const range = popRange;
    const text = cleanText(range.toString());
    const rects = selRects(range);
    const pages = [...rects.keys()].sort((a, b) => a - b);
    const k = b.dataset.sel;
    if (k === 'copy') copyText(text);
    else if (k === 'cite') copyText(`«${text}»\n(${pageRef(pages[0] || c.current())})`);
    else if (k === 'hl' || k === 'ul' || k === 'note') {
      if (k === 'hl') S.color.hl = b.dataset.c;
      keepPrefs();
      let first = null;
      for (const i of pages) {
        const a = { id: uid(), at: Date.now(), t: k === 'ul' ? 'ul' : 'hl', p: i, c: k === 'ul' ? '#B3261E' : S.color.hl, rects: rects.get(i), text };
        if (k === 'note' && !first) first = a;
        else act({ kind: 'add', a });
      }
      if (first) openCard(first, true);
    }
    window.getSelection()?.removeAllRanges();
    closePop();
  });
  /*
   * التحديد باليد: يُحسب موضعا البداية والنهاية من نقطتي الإصبع ويُحدَّد ما بينهما (في الجهتين، وعلى أسطرٍ عدة).
   * (تحديد المتصفح وحده في كلمات موضوعة بمواضعها يتعثّر حين يُسحب من اليسار إلى اليمين في الكلام العربي)
   */
  function caretAt(x, y, L) {
    let node = null, offset = 0;
    if (document.caretPositionFromPoint) {
      const c = document.caretPositionFromPoint(x, y);
      if (c) [node, offset] = [c.offsetNode, c.offset];
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) [node, offset] = [r.startContainer, r.startOffset];
    }
    if (node && node.nodeType === 3 && node.parentElement && node.parentElement.closest('.an.an-on .an-txt')) return { node, offset };
    // بين الكلمات أو الأسطر: أقرب كلمةٍ إلى الإصبع، من أولها أو آخرها
    L = L || layerAt(x, y);
    if (!L) return null;
    let best = null, bd = Infinity;
    for (const sp of L.querySelectorAll('.an-txt span')) {
      const r = sp.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dy * 4 + dx;
      if (d < bd) [bd, best] = [d, { sp, r }];
    }
    if (!best || !best.sp.firstChild) return null;
    const t = best.sp.firstChild;
    const rtl = /[\u0590-\u08FF]/.test(t.textContent);
    const atStart = rtl ? x > (best.r.left + best.r.right) / 2 : x < (best.r.left + best.r.right) / 2;
    return { node: t, offset: atStart ? 0 : t.textContent.replace(/\s+$/, '').length };
  }
  let selDrag = null;
  room.addEventListener('pointerdown', (e) => {
    if (S.tool !== 'select' || e.button > 0 || e.target.closest('.nt-ui, .an-pin')) return;
    const L = e.target.closest('.an.an-on') || layerAt(e.clientX, e.clientY);
    if (!L) return;
    const pos = caretAt(e.clientX, e.clientY, L);
    if (!pos) return;
    e.preventDefault();
    closePop();
    selDrag = { a: pos, id: e.pointerId, moved: false };
    window.getSelection().collapse(pos.node, pos.offset);
    try {
      L.setPointerCapture(e.pointerId);
    } catch {}
  });
  room.addEventListener('pointermove', (e) => {
    if (!selDrag || e.pointerId !== selDrag.id) return;
    const pos = caretAt(e.clientX, e.clientY);
    if (!pos) return;
    selDrag.moved = true;
    // بالكلمات كاملةً (لا يُقطع حرفٌ من أول الكلمة أو آخرها)
    const A = selDrag.a.node, F = pos.node;
    const len = (t) => t.textContent.replace(/\s+$/, '').length;
    const fwd = A === F ? pos.offset >= selDrag.a.offset : !!(A.compareDocumentPosition(F) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (fwd) window.getSelection().setBaseAndExtent(A, 0, F, len(F));
    else window.getSelection().setBaseAndExtent(A, len(A), F, 0);
  });
  const endSel = (e) => {
    if (!selDrag || e.pointerId !== selDrag.id) return;
    selDrag = null;
  };
  room.addEventListener('pointerup', endSel, true);
  room.addEventListener('pointercancel', endSel, true);
  // نقرتان: الكلمة كلها
  room.addEventListener('dblclick', (e) => {
    if (S.tool !== 'select') return;
    const sp = e.target.closest('.an.an-on .an-txt span');
    if (!sp || !sp.firstChild) return;
    const t = sp.firstChild;
    window.getSelection().setBaseAndExtent(t, 0, t, t.textContent.replace(/\s+$/, '').length);
    showPop();
  });
  const selDone = () => setTimeout(showPop, 0);
  room.addEventListener('pointerup', (e) => {
    if (S.tool === 'select' && !e.target.closest('.nt-ui')) selDone();
  });
  room.addEventListener('keyup', (e) => {
    if (S.tool === 'select' && e.shiftKey) selDone();
  });
  room.addEventListener('copy', (e) => {
    const r = selInside();
    if (!r) return;
    e.clipboardData.setData('text/plain', cleanText(r.toString()));
    e.preventDefault();
  });
  document.addEventListener('selectionchange', onSelChange);
  function onSelChange() {
    if (!pop.hidden && !selInside()) closePop();
  }

  /* ------------------------------------------------------------ العلامات */
  function toggleMark() {
    const i = c.current();
    if (!(i >= 1 && i <= N)) return c.toast('افتح الكتاب على صفحة لتضع عليها علامة');
    if (M.marks.includes(i)) M.marks = M.marks.filter((x) => x !== i);
    else M.marks = [...M.marks, i].sort((a, b) => a - b);
    refresh(i);
    persist();
    syncMark();
    if (panelTab) renderPanel();
    c.toast(M.marks.includes(i) ? `وُضعت علامة على ص ${ar(i)}` : 'رُفعت العلامة');
  }
  function syncMark() {
    const i = c.current();
    ui.querySelector('[data-nact="mark"]').setAttribute('aria-pressed', String(M.marks.includes(i)));
  }

  /* ------------------------------------------------------------ البحث */
  const hits = new Map(); // i ← [[u,v,w,h]...]
  function paintHits(L, i) {
    const box = L.previousElementSibling && L.previousElementSibling.querySelector('.an-hits');
    if (!box) return;
    box.innerHTML = (hits.get(i) || []).map(([u, v, w, h]) => `<i style="left:${(u * 100).toFixed(2)}%;top:${(v * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;height:${(h * 100).toFixed(2)}%"></i>`).join('');
  }
  let searchSeq = 0;
  async function search(q, onHit, onProgress) {
    const my = ++searchSeq;
    hits.clear();
    for (const L of room.querySelectorAll('.an')) paintHits(L, +L.dataset.i);
    const nq = norm(q).replace(/\s+/g, ' ').trim();
    if (nq.length < 2) return;
    let found = 0;
    for (let i = 1; i <= N; i++) {
      if (my !== searchSeq) return;
      const { lines } = await textOf(i);
      for (const ln of lines) {
        // نص السطر مطبَّعاً، ومواضع كلماته فيه
        let txt = '';
        const spans = ln.words.map((w) => {
          const a = txt.length ? txt.length + 1 : 0;
          txt += (txt.length ? ' ' : '') + norm(w.t);
          return [a, txt.length, w];
        });
        let at = txt.indexOf(nq);
        while (at >= 0) {
          const ws = spans.filter(([a, b]) => b > at && a < at + nq.length).map((x) => x[2]);
          if (ws.length) {
            const x0 = Math.min(...ws.map((w) => w.x0)), x1 = Math.max(...ws.map((w) => w.x1));
            const box = [x0 - 0.003, ln.top, x1 - x0 + 0.006, ln.bottom - ln.top];
            if (!hits.has(i)) hits.set(i, []);
            hits.get(i).push(box);
            found++;
            onHit({ i, line: ln.text, words: ws.map((w) => w.t).join(' ') });
          }
          at = txt.indexOf(nq, at + nq.length);
        }
      }
      for (const L of room.querySelectorAll(`.an[data-i="${i}"]`)) paintHits(L, i);
      if (i % 8 === 0 || i === N) onProgress(i, found);
    }
  }

  /* ------------------------------------------------------------ تتبّع الشارح: ما يقرؤه الشارح في الدرس (من تفريغه) مظلَّلاً في الكتاب */
  // الكتاب يُفهرَس في الخلفية من الصفحة المفتوحة إلى الخارج، وكل سطرٍ من التفريغ يُطابَق به (shared/book-follow.js)
  const FW = { ix: null, st: {}, boxes: new Map(), now: new Map(), building: null, done: 0, lib: null, lastSuggest: 0, fol: null };
  function paintFollow(L, i) {
    const hl = L.previousElementSibling;
    if (!hl) return;
    let box = hl.querySelector('.an-fol');
    if (!box) {
      box = document.createElement('div');
      box.className = 'an-fol';
      hl.insertBefore(box, hl.querySelector('.an-hlv'));
    }
    const list = FW.boxes.get(i) || [];
    const cur = FW.now.get(i) || [];
    const sq = (cls) => ([u, v, w, h]) => `<i${cls} style="left:${(u * 100).toFixed(2)}%;top:${(v * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;height:${(h * 100).toFixed(2)}%"></i>`;
    const html = list.map(sq('')).join('') + cur.map(sq(' class="now"')).join('');
    if (box.__h !== html) (box.__h = html), (box.innerHTML = html);
  }
  function paintFollowAll() {
    for (const L of room.querySelectorAll('.an')) paintFollow(L, +L.dataset.i);
  }
  /** فهرسة الكتاب (مرةً، في الخلفية): من الصفحة المفتوحة إلى الخارج */
  function followIndex() {
    if (FW.building) return FW.building;
    FW.building = (async () => {
      FW.lib = await import('/shared/book-follow.js');
      FW.ix = FW.lib.createIndex();
      const cur = clamp(c.current() || 1, 1, N);
      const order = [];
      for (let d = 0; order.length < N && d <= N; d++) for (const p of d ? [cur + d, cur - d] : [cur]) if (p >= 1 && p <= N) order.push(p);
      for (let k = 0; k < order.length; k++) {
        const { lines } = await textOf(order[k]);
        FW.ix.add(order[k], lines);
        FW.done = k + 1;
        if (k % 6 === 5) await new Promise((r) => setTimeout(r, 0));
      }
    })();
    return FW.building;
  }
  /**
   * سطرٌ من التفريغ ← موضعه في الكتاب (ويُظلَّل، ويُقترح الانتقال إليه أو يُنتقل وحده)
   * ← { page, endPage, words, score, near } أو { page: null }، ومعهما ما فُهرس من الكتاب
   */
  async function follow(text, opts = {}) {
    followIndex();
    // أول سطر: لا ينتظر الفهرسة كلها (ما فُهرس يكفي، والصفحة المفتوحة أولاً)
    while (!FW.ix || FW.done < Math.min(N, 3)) await new Promise((r) => setTimeout(r, 40));
    let r = FW.lib.matchLine(FW.ix, text, FW.st);
    // لم يُعثر عليه وفي الكتاب ما لم يُفهرس بعد: يُنتظر قليلاً (والفهرسة ماضية) ثم يُطلب ثانيةً
    if (!r && FW.done < N) {
      const d0 = FW.done;
      await Promise.race([FW.building, new Promise((res) => setTimeout(res, 4000))]);
      if (FW.done > d0) r = FW.lib.matchLine(FW.ix, text, FW.st);
    }
    const state = { indexed: FW.done, N };
    if (!r) return { page: null, ...state };
    FW.boxes = FW.lib.boxesOf(FW.ix, r.from, r.to);
    paintFollowAll();
    const vis = c.visible ? c.visible() : [c.current()];
    if (!vis.includes(r.page) && !vis.includes(r.endPage)) {
      if (opts.auto) c.goto(r.page);
      else if (r.page !== FW.lastSuggest) {
        FW.lastSuggest = r.page;
        c.toast(`الشارح يقرأ في ص ${ar(r.page)}`, 9000, { label: 'انتقل إليها', run: () => c.goto(r.page) });
      }
    }
    return { ...r, ...state };
  }
  /**
   * التتبّع المباشر: آخر ما قيل (ما تمّ قبلُ، والجاري كلمةً كلمة) ← أين وصل الشارح في الكتاب؛ يُظلَّل ما قرأه إلى الكلمة الجارية،
   * ويُقترح الانتقال إلى صفحته إن لم تكن ظاهرة (أو يُنتقل وحده). ← { found, page, inNow, jumped, indexed, N } أو { page: null }
   */
  async function followLive(before, now, opts = {}) {
    followIndex();
    // أول مرة: لا تُنتظر الفهرسة كلها (الصفحة المفتوحة وما حولها أولاً)
    while (!FW.ix || FW.done < Math.min(N, 3)) await new Promise((r) => setTimeout(r, 40));
    if (!FW.fol || FW.fol.ix !== FW.ix) (FW.fol = FW.lib.createFollower(FW.ix)), (FW.fol.ix = FW.ix);
    let r = FW.fol.update(before, now);
    // لم يُعرف وفي الكتاب ما لم يُفهرس بعد: يُنتظر قليلاً ثم يُطلب ثانية
    if ((!r || !r.found) && FW.done < N) {
      const d0 = FW.done;
      await Promise.race([FW.building, new Promise((res) => setTimeout(res, 4000))]);
      if (FW.done > d0) r = FW.fol.update(before, now) || r;
    }
    const state = { indexed: FW.done, N };
    if (!r) return { page: null, ...state };
    if (r.found) {
      FW.boxes = FW.lib.boxesOf(FW.ix, r.from, r.to);
      FW.now = FW.lib.boxesOf(FW.ix, r.to, r.to);
      paintFollowAll();
      const vis = c.visible ? c.visible() : [c.current()];
      if (!vis.includes(r.page)) {
        if (opts.auto) c.goto(r.page);
        else if (r.page !== FW.lastSuggest) {
          FW.lastSuggest = r.page;
          c.toast(`الشارح يقرأ في ص ${ar(r.page)}`, 9000, { label: 'انتقل إليها', run: () => c.goto(r.page) });
        }
      }
    }
    return { ...r, ...state };
  }
  function followClear() {
    FW.boxes = new Map();
    FW.now = new Map();
    if (FW.fol) FW.fol.reset();
    FW.st = {};
    FW.lastSuggest = 0;
    paintFollowAll();
  }

  /* ------------------------------------------------------------ دفتري: الملاحظات والعلامات والبحث */
  let panelTab = '';
  const panel = document.createElement('aside');
  panel.className = 'nt-ui bk-notes';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'دفتري');
  room.querySelector('.bk-mid').appendChild(panel);
  function openPanel(tab) {
    panelTab = tab === panelTab && !panel.hidden ? '' : tab;
    panel.hidden = !panelTab;
    room.classList.toggle('notes-on', !!panelTab);
    for (const b of room.querySelectorAll('[data-act="notes"],[data-act="find"]')) b.setAttribute('aria-pressed', String(!!panelTab && (b.dataset.act === 'find') === (panelTab === 'find')));
    if (panelTab) renderPanel();
    c.onLayout && c.onLayout();
    if (panelTab === 'find') panel.querySelector('input')?.focus();
  }
  const KIND = { hl: 'تظليل', ul: 'خطٌّ تحت كلام', mark: 'تظليل بالقلم', ink: 'كتابة بالقلم', text: 'نصٌّ مضاف', note: 'ملاحظة' };
  function renderPanel() {
    const tab = panelTab;
    const tabs = [['notes', 'ملاحظاتي', M.anns.length], ['marks', 'العلامات', M.marks.length], ['find', 'البحث', 0]];
    let body = '';
    if (tab === 'notes') {
      const list = [...M.anns].sort((a, b) => a.p - b.p || (a.at || 0) - (b.at || 0));
      body = list.length
        ? `<ol class="nt-list">${list
            .map((a) => {
              const t = a.t === 'note' ? a.s : a.t === 'text' ? a.s : a.text || '';
              return `<li><button type="button" data-go="${a.p}" data-id="${a.id}"><span class="nt-k" style="--c:${a.c}">${KIND[a.t]}</span>${t ? `<span class="nt-x">${esc(t.slice(0, 160))}</span>` : ''}${a.note ? `<span class="nt-n">${NICON.note} ${esc(a.note.slice(0, 140))}</span>` : ''}<small>ص ${ar(a.p)}</small></button></li>`;
            })
            .join('')}</ol>`
        : `<p class="nt-empty">لم تكتب شيئاً بعد. اختر من الأدوات: <b>تحديد النص</b> لتظلّله أو تنسخه، أو <b>القلم</b>، أو <b>النص</b>، أو <b>الملاحظة</b>.</p>`;
      body += `<div class="nt-foot"><button type="button" class="nt-go" data-p="pdf" ${M.anns.length ? '' : 'disabled'}>${NICON.save} احفظ الكتاب بملاحظاتك</button><button type="button" class="nt-quiet" data-p="txt" ${M.anns.length ? '' : 'disabled'}>${NICON.doc} ملاحظاتك ملفاً نصياً</button>${M.anns.length ? `<button type="button" class="nt-quiet nt-danger" data-p="clear">${NICON.trash} امسح الكل</button>` : ''}</div>`;
    } else if (tab === 'marks') {
      body = M.marks.length
        ? `<ol class="nt-list">${M.marks.map((i) => `<li><button type="button" data-go="${i}"><span class="nt-k mk">${NICON.mark}</span><span class="nt-x">الصفحة ${ar(i)}</span></button><button type="button" class="nt-del" data-unmark="${i}" aria-label="ارفع العلامة">${NICON.x}</button></li>`).join('')}</ol>`
        : `<p class="nt-empty">ضع علامة على الصفحة التي تريد الرجوع إليها بزر <b>علامة</b> في الأدوات (أو مفتاح B).</p>`;
    } else if (tab === 'find') {
      body = `<form class="nt-find"><input type="search" placeholder="ابحث في الكتاب…" value="${esc(lastQ)}" dir="auto"><button type="submit" aria-label="ابحث">${NICON.search}</button></form><p class="nt-prog" aria-live="polite"></p><ol class="nt-list nt-res"></ol>`;
    }
    panel.innerHTML = `<div class="nt-tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}${n ? ` <small>${ar(n)}</small>` : ''}</button>`).join('')}<button type="button" class="nt-close" data-tab="" aria-label="أغلق">${NICON.x}</button></div><div class="nt-body">${body}</div>`;
    if (tab === 'find' && lastQ) runSearch(lastQ);
  }
  let lastQ = '';
  function runSearch(q) {
    lastQ = q;
    const res = panel.querySelector('.nt-res');
    const prog = panel.querySelector('.nt-prog');
    if (!res) return;
    res.innerHTML = '';
    let n = 0;
    prog.textContent = 'يُبحث…';
    search(
      q,
      (h) => {
        n++;
        if (n > 300) return;
        const nl = norm(h.line), nq = norm(q).trim();
        const k = nl.indexOf(nq);
        // المقتطف بحروفه الأصلية: موضع المطابقة بالتقريب
        const ratio = k >= 0 && nl.length ? k / nl.length : 0;
        const at = Math.round(ratio * h.line.length);
        const snip = (at > 40 ? '…' : '') + h.line.slice(Math.max(0, at - 40), at + nq.length + 50);
        res.insertAdjacentHTML('beforeend', `<li><button type="button" data-go="${h.i}"><span class="nt-x">${esc(snip).replace(esc(h.words), `<mark>${esc(h.words)}</mark>`)}</span><small>ص ${ar(h.i)}</small></button></li>`);
      },
      (i, found) => {
        if (prog) prog.textContent = i < N ? `يُبحث… ص ${ar(i)} من ${ar(N)} — ${ar(found)} موضعاً` : found ? `${ar(found)} موضعاً` : 'لم يوجد.';
      },
    );
  }
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = panel.querySelector('.nt-find input').value.trim();
    if (q) runSearch(q);
  });
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab !== undefined) return b.dataset.tab ? openPanel(b.dataset.tab) : openPanel('');
    if (b.dataset.go) {
      c.goto(+b.dataset.go);
      if (room.classList.contains('narrow')) openPanel('');
      return;
    }
    if (b.dataset.unmark) {
      M.marks = M.marks.filter((x) => x !== +b.dataset.unmark);
      refresh(+b.dataset.unmark);
      persist();
      syncMark();
      return renderPanel();
    }
    if (b.dataset.p === 'pdf') return savePdf();
    if (b.dataset.p === 'txt') return saveText();
    if (b.dataset.p === 'clear') {
      if (!confirm('تمسح كل ما كتبته وظلّلته في هذا الكتاب؟')) return;
      const all = [...M.anns];
      for (const a of all) del(a);
      renderPanel();
    }
  });
  function updateCounts() {
    for (const b of room.querySelectorAll('[data-act="notes"]')) {
      let s = b.querySelector('.nt-count');
      if (!s) b.insertAdjacentHTML('beforeend', '<span class="nt-count"></span>');
      s = b.querySelector('.nt-count');
      s.textContent = M.anns.length ? ar(M.anns.length) : '';
    }
    for (const el of room.querySelectorAll('[data-dl="notes"]')) el.disabled = !M.anns.length;
  }

  /* ------------------------------------------------------------ التصدير */
  const download = (blob, name) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  const baseName = () => (c.fileName || c.title || 'الكتاب').replace(/\.pdf$/i, '');
  function saveText() {
    const list = [...M.anns].sort((a, b) => a.p - b.p || (a.at || 0) - (b.at || 0));
    let out = `ملاحظات على: ${c.title || baseName()}${c.vol ? ' — ' + c.vol : ''}\n${'='.repeat(30)}\n`;
    let last = 0;
    for (const a of list) {
      if (a.p !== last) {
        out += `\n— الصفحة ${a.p} —\n`;
        last = a.p;
      }
      if (a.t === 'hl' || a.t === 'ul') out += `• «${a.text}»${a.note ? `\n  ملاحظة: ${a.note}` : ''}\n`;
      else if (a.t === 'note') out += `• ملاحظة: ${a.s}\n`;
      else if (a.t === 'text') out += `• نص مضاف: ${a.s}\n`;
      else out += `• ${KIND[a.t]}\n`;
    }
    if (M.marks.length) out += `\nالعلامات: ${M.marks.map((i) => 'ص ' + i).join('، ')}\n`;
    download(new Blob(['﻿' + out], { type: 'text/plain;charset=utf-8' }), baseName() + ' - ملاحظاتي.txt');
  }
  /** النص المضاف صورةً (يُرسم بخطه نفسه، فيظهر في أي قارئ PDF كما كُتب) */
  async function textBitmap(a, ptW) {
    const K = 4; // بكسل لكل نقطة
    const fs = a.fs;
    const font = `${a.b ? 700 : 400} ${fs * K}px '${a.f}', serif`;
    try {
      await document.fonts.load(font, a.s);
    } catch {}
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    g.font = font;
    const maxW = a.w * ptW * K;
    const lines = [];
    for (const para of a.s.split('\n')) {
      let cur = '';
      for (const w of para.split(/\s+/)) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && g.measureText(t).width > maxW) {
          lines.push(cur);
          cur = w;
        } else cur = t;
      }
      lines.push(cur);
    }
    const lh = fs * 1.5 * K;
    cv.width = Math.ceil(maxW);
    cv.height = Math.ceil(lines.length * lh + fs * 0.4 * K);
    g.font = font;
    g.fillStyle = a.c;
    g.textBaseline = 'alphabetic';
    const rtl = /[֐-ࣿ]/.test(a.s);
    g.direction = rtl ? 'rtl' : 'ltr';
    g.textAlign = rtl ? 'right' : 'left';
    lines.forEach((t, k) => g.fillText(t, rtl ? cv.width - 2 : 2, (k + 1) * lh - fs * 0.38 * K));
    return { bitmap: await createImageBitmap(cv), wPt: cv.width / K, hPt: cv.height / K };
  }
  /** خط الفرشاة صورةً (للحفظ في الملف): بحدوده، بثلاثة بكسلات لكل نقطة */
  async function brushBitmap(a, vpW, vpH) {
    const K = 3;
    const W = vpW * K, H = vpH * K;
    const P = a.pts.map((q) => [q[0] * W, q[1] * H, q[2] ?? 0.5]);
    const size = a.w * W;
    const box = strokeBox(P, size);
    if (box.w * box.h > 64e6) return null;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(box.w));
    cv.height = Math.max(1, Math.ceil(box.h));
    const g = cv.getContext('2d');
    g.translate(-box.x, -box.y);
    const tip = await getTip(a.br);
    if (tip) drawStroke(g, P, { tip, ref: a.br, color: a.c, size, opacity: a.op || 1, seed: a.sd || 1, pressure: !!a.pr, follow: a.fw ? true : undefined });
    else {
      g.globalAlpha = a.op || 1;
      g.strokeStyle = a.c;
      g.lineWidth = size;
      g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      P.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    return { bitmap: await createImageBitmap(cv), x: box.x / K, y: box.y / K, w: box.w / K, h: box.h / K };
  }
  async function noteBitmap(col) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = col || '#F2C94C';
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(86, 10);
    g.lineTo(86, 64);
    g.lineTo(62, 86);
    g.lineTo(10, 86);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath();
    g.moveTo(62, 86);
    g.lineTo(62, 64);
    g.lineTo(86, 64);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,40,10,.55)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (const y of [30, 46]) {
      g.beginPath();
      g.moveTo(24, y);
      g.lineTo(72, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(24, 62);
    g.lineTo(48, 62);
    g.stroke();
    return createImageBitmap(cv);
  }
  /** حدود خطٍّ عريض (مضلعٌ واحد): جانباه، ورأساه مستقيمان كرأس قلم التظليل */
  function strokeOutline(pts, r) {
    const L = [], R = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      L.push([pts[k][0] - dy * r, pts[k][1] + dx * r]);
      R.push([pts[k][0] + dy * r, pts[k][1] - dx * r]);
    }
    return [...L, ...R.reverse()];
  }
  /**
   * مزج التظليل في الملف «تغميق» (Darken) لا «ضرب» (Multiply): يبقى الحبر الأسود والأحمر والأخضر على لونه
   * ويتلوّن الورق حوله فقط. (pdf.js يكتب ‎/BM /Multiply‎ في ما يضيفه آخر الملف؛ يُستبدل بطوله نفسه، فلا تتغير مواضع الكائنات)
   */
  function darkenBlend(bytes, from) {
    const out = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const pat = [...'/Multiply'].map((ch) => ch.charCodeAt(0));
    const rep = [...'/Darken  '].map((ch) => ch.charCodeAt(0));
    const bm = [...'/BM'].map((ch) => ch.charCodeAt(0));
    for (let i = Math.max(0, from); i <= out.length - pat.length; i++) {
      if (out[i] !== 47) continue;
      let ok = true;
      for (let k = 0; k < pat.length && ok; k++) ok = out[i + k] === pat[k];
      if (!ok) continue;
      // قبله ‎/BM‎ (وبينهما مسافات)
      let j = i - 1;
      while (j > 0 && (out[j] === 32 || out[j] === 10 || out[j] === 13)) j--;
      if (j < 2 || out[j - 2] !== bm[0] || out[j - 1] !== bm[1] || out[j] !== bm[2]) continue;
      out.set(rep, i);
    }
    return out;
  }
  let saving = false;
  async function savePdf() {
    if (saving) return;
    if (!M.anns.length) return c.toast('لا ملاحظات بعد');
    saving = true;
    c.toast('يُجهَّز الكتاب بملاحظاتك…', 60000);
    const st = pdf.annotationStorage;
    const keys = [];
    let n = 0;
    const put = (v) => {
      const k = 'pdfjs_internal_editor_warraq' + n++;
      keys.push(k);
      st.setValue(k, v);
    };
    try {
      const byPage = new Map();
      for (const a of M.anns) {
        if (!byPage.has(a.p)) byPage.set(a.p, []);
        byPage.get(a.p).push(a);
      }
      for (const [i, list] of byPage) {
        const page = await pdf.getPage(i + OFF);
        const vp = page.getViewport({ scale: 1 });
        const pageIndex = i + OFF - 1;
        const P = (u, v) => vp.convertToPdfPoint(u * vp.width, v * vp.height);
        const box = (pts, pad = 0) => {
          const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
          return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
        };
        const ink = (ptsList, color, thickness, opacity) => {
          const all = ptsList.flat();
          put({
            annotationType: 15,
            color: rgb(color),
            thickness,
            opacity,
            paths: { lines: ptsList.map((pts) => pts.flatMap(([x, y]) => [NaN, NaN, NaN, NaN, x, y])), points: ptsList.map((pts) => pts.flat()) },
            pageIndex,
            rect: box(all, thickness),
            rotation: 0,
          });
        };
        const rectPts = ([u, v, w, h]) => {
          const [x1, y1] = P(u, v), [x2, y2] = P(u + w, v + h);
          return { x0: Math.min(x1, x2), x1: Math.max(x1, x2), y0: Math.min(y1, y2), y1: Math.max(y1, y2) };
        };
        for (const a of list) {
          if (a.br && (a.t === 'ink' || a.t === 'mark')) {
            // خط الفرشاة: صورةٌ في موضعه
            const bm = await brushBitmap(a, vp.width, vp.height);
            if (!bm) continue;
            const [x1, y1] = P(bm.x / vp.width, bm.y / vp.height);
            const [x2, y2] = P((bm.x + bm.w) / vp.width, (bm.y + bm.h) / vp.height);
            put({ annotationType: 13, bitmapId: 'warraq_b' + n, bitmap: bm.bitmap, pageIndex, rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], rotation: 0 });
          } else if (a.t === 'ink') {
            const pts = a.pts.map(([u, v]) => P(u, v));
            if (pts.length === 1) pts.push([pts[0][0] + 0.3, pts[0][1]]);
            ink([pts], a.c, a.w * vp.width, a.op || 1);
          } else if (a.t === 'mark') {
            // قلم التظليل: شكل الخط نفسه مملوءاً (تظليلٌ حرٌّ في الملف، يُمزج تغميقاً كالتظليل)
            const pts = a.pts.map(([u, v]) => P(u, v));
            if (pts.length === 1) pts.push([pts[0][0] + 0.3, pts[0][1]]);
            const outline = strokeOutline(pts, (a.w * vp.width) / 2);
            put({
              annotationType: 9,
              color: rgb(a.c),
              opacity: a.op || 1,
              thickness: a.w * vp.width,
              outlines: { outline: outline.flatMap(([x, y]) => [NaN, NaN, NaN, NaN, x, y]), points: [pts.flat()] },
              pageIndex,
              rect: box(outline, 1),
              rotation: 0,
            });
          } else if (a.t === 'hl') {
            const R = a.rects.map(rectPts);
            const v = {
              annotationType: 9,
              color: rgb(a.c),
              opacity: 1,
              quadPoints: R.flatMap((r) => [r.x0, r.y1, r.x1, r.y1, r.x0, r.y0, r.x1, r.y0]),
              outlines: R.map((r) => [r.x0, r.y0, r.x1, r.y0, r.x1, r.y1, r.x0, r.y1]),
              pageIndex,
              rect: [Math.min(...R.map((r) => r.x0)), Math.min(...R.map((r) => r.y0)), Math.max(...R.map((r) => r.x1)), Math.max(...R.map((r) => r.y1))],
              rotation: 0,
            };
            if (a.note) v.popup = { contents: a.note, rect: [v.rect[2], v.rect[1], v.rect[2] + 160, v.rect[3]] };
            put(v);
          } else if (a.t === 'ul') {
            ink(a.rects.map(rectPts).map((r) => [[r.x0, r.y0 + 0.6], [r.x1, r.y0 + 0.6]]), a.c, 0.9, 1);
            if (a.note) {
              const r = rectPts(a.rects[0]);
              put({ annotationType: 13, bitmapId: 'warraq_n' + n, bitmap: await noteBitmap('#F2C94C'), pageIndex, rect: [r.x1, r.y1, r.x1 + 14, r.y1 + 14], rotation: 0, popup: { contents: a.note, rect: [r.x1, r.y1, r.x1 + 180, r.y1 + 90] } });
            }
          } else if (a.t === 'text') {
            const { bitmap, wPt, hPt } = await textBitmap(a, vp.width);
            const [x, y] = P(a.x, a.y);
            put({ annotationType: 13, bitmapId: 'warraq_t' + n, bitmap, pageIndex, rect: [x, y - hPt, x + wPt, y], rotation: 0 });
          } else if (a.t === 'note') {
            const [x, y] = P(a.x, a.y);
            const sz = vp.width * 0.045;
            put({ annotationType: 13, bitmapId: 'warraq_n' + n, bitmap: await noteBitmap(a.c), pageIndex, rect: [x, y - sz, x + sz, y], rotation: 0, popup: { contents: a.s, rect: [x + sz, y - 100, x + sz + 200, y] } });
          }
        }
      }
      const bytes = darkenBlend(await pdf.saveDocument(), c.srcBytes || 0);
      download(new Blob([bytes], { type: 'application/pdf' }), baseName() + ' - بملاحظاتي.pdf');
      c.toast('حُفظ الكتاب بملاحظاتك');
    } catch (err) {
      c.toast('تعذّر حفظ الكتاب بالملاحظات: ' + (err && err.message ? err.message : err));
    } finally {
      for (const k of keys) st.remove ? st.remove(k) : st.setValue(k, { deleted: true });
      saving = false;
    }
  }

  /* ------------------------------------------------------------ المفاتيح */
  function onKey(e) {
    const t = e.target;
    if (t.closest && t.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')) {
      if (e.key === 'Escape' && editing) {
        commitEdit();
        return true;
      }
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) return e.preventDefault(), undo(), true;
      if (k === 'y' || (k === 'z' && e.shiftKey)) return e.preventDefault(), redo(), true;
      if (k === 'f') return e.preventDefault(), openPanel('find'), true;
      return false;
    }
    if (e.altKey) return false;
    if (e.key === 'Escape') {
      if (!card.hidden) return closeCard(), true;
      if (!pop.hidden) return closePop(), window.getSelection()?.removeAllRanges(), true;
      if (panelTab) return openPanel(''), true;
      if (S.tool !== 'hand') return setTool('hand'), true;
      return false;
    }
    const map = { h: 'hand', v: 'select', p: 'pen', m: 'marker', t: 'text', n: 'note', e: 'eraser' };
    const k = e.key.toLowerCase();
    // ١–٨: قلمٌ من حامل الأقلام
    const dg = /^[1-8]$/.test(e.key) ? +e.key : /^[١-٨]$/.test(e.key) ? e.key.charCodeAt(0) - 0x660 : 0;
    if (dg && (S.tool === 'pen' || S.tool === 'marker') && S.pens[dg - 1]) return selectPen(S.pens[dg - 1].id), true;
    if (map[k]) return setTool(map[k]), true;
    if (k === 'b') return toggleMark(), true;
    return false;
  }

  /* ------------------------------------------------------------ متابعة القراءة */
  function onPage(i) {
    syncMark();
    if (!pop.hidden) closePop();
    if (!card.hidden && cardFor && cardFor.a.p !== i && !room.querySelector(`.an.an-on[data-i="${cardFor.a.p}"]`)) closeCard();
    if (i >= 1 && i <= N && i !== M.last) {
      M.last = i;
      persist();
    }
  }

  /**
   * «مجلس الدرس»: نصٌّ من تفريغ الدرس. إن كانت ملاحظةٌ مفتوحة للكتابة أُضيف فيها عند المؤشر،
   * وإلا صار ملاحظةً لاصقة في هامش الصفحة المفتوحة (تحت ما سبقها من ملاحظات الدرس) ← { page, into }
   */
  function addNote(text, meta = {}, page = 1) {
    text = String(text || '').trim();
    const src = { kind: 'lesson', t: +meta.t || 0, title: String(meta.title || '').slice(0, 200), url: String(meta.url || '').slice(0, 500) };
    // بلا نص: ملاحظةٌ جديدة عند هذا الوقت من الدرس، مفتوحةٌ للكتابة (تُحفظ حين يُحفظ ما كُتب فيها)
    if (!text) {
      const k = M.anns.filter((x) => x.p === page && x.t === 'note' && x.src && x.src.kind === 'lesson').length;
      openCard({ id: uid(), at: Date.now(), t: 'note', p: page, x: 0.93, y: clamp(0.05 + (k % 12) * 0.075, 0, 0.95), s: '', c: '#E8C77A', src }, true);
      return { page, open: true };
    }
    const ta = !card.hidden && cardFor && card.querySelector('textarea');
    if (ta) {
      const v = ta.value;
      // المؤشر حيث تركه الكاتب، وإلا (لم يكتب فيها بعد) في آخرها
      const atCaret = v && ta.selectionStart > 0;
      const a0 = atCaret ? ta.selectionStart : v.length;
      const b0 = atCaret ? ta.selectionEnd : v.length;
      const pre = v.slice(0, a0);
      const ins = (pre && !/\s$/.test(pre) ? ' ' : '') + text;
      ta.value = pre + ins + v.slice(b0);
      ta.selectionStart = ta.selectionEnd = a0 + ins.length;
      ta.dispatchEvent(new Event('input'));
      return { page: cardFor.a.p, into: true };
    }
    const k = M.anns.filter((x) => x.p === page && x.t === 'note' && x.src && x.src.kind === 'lesson').length;
    const a = { id: uid(), at: Date.now(), t: 'note', p: page, x: 0.93, y: clamp(0.05 + (k % 12) * 0.075, 0, 0.95), s: text, c: '#E8C77A', src };
    act({ kind: 'add', a });
    const pin = room.querySelector(`.an-pin[data-id="${a.id}"]`);
    if (pin) pin.classList.add('an-new');
    return { page, into: false };
  }

  syncHist();
  renderOpts();
  paintRailPens();
  updateCounts();
  /** ما في الصفحة (لمساعد الرَّحل): نصها، وما كتبه القارئ عليها */
  async function pageContext(i) {
    let text = '';
    try {
      const { lines } = await textOf(i);
      text = (lines || []).map((ln) => ln.words.map((w) => w.t).join(' ')).join('\n');
    } catch {}
    const list = annsOf(i);
    const mine = list
      .map((a) =>
        a.t === 'text' ? `نصٌّ كتبتُه: ${a.s}`
        : a.t === 'note' ? `ملاحظة${a.src && a.src.kind === 'lesson' ? ' من الدرس' : a.src && a.src.kind === 'ai' ? ' من المساعد' : ''}: ${a.s}`
        : a.t === 'hl' || a.t === 'ul' ? `${a.t === 'hl' ? 'ظلّلتُ' : 'خططتُ تحت'}: «${a.text || ''}»${a.note ? ` — وعلّقت: ${a.note}` : ''}`
        : null,
      )
      .filter((x) => x && x.trim().length > 4);
    return { text, mine, inked: list.filter((a) => a.t === 'ink' || a.t === 'mark').length };
  }
  /** جوابٌ من المساعد يصير ملاحظةً على الصفحة */
  function addAiNote(text, page) {
    const k = M.anns.filter((x) => x.p === page && x.t === 'note').length;
    const a = { id: uid(), at: Date.now(), t: 'note', p: page, x: 0.04, y: clamp(0.05 + (k % 12) * 0.075, 0, 0.95), s: String(text || '').slice(0, 8000), c: '#D9C8F5', src: { kind: 'ai' } };
    act({ kind: 'add', a });
    const pin = room.querySelector(`.an-pin[data-id="${a.id}"]`);
    if (pin) pin.classList.add('an-new');
    return a;
  }
  return {
    /** ملفٌّ جديد للكتاب نفسه (الدفتر حين تزيد صفحاته أو يتغيّر قالبها) */
    setDoc(p2, n2) {
      pdf = p2;
      N = n2;
      textCache.clear();
      FW.building = null;
      FW.ix = null;
      FW.done = 0;
      FW.st = {};
      FW.fol = null;
    },
    addNote,
    addAiNote,
    follow,
    followLive,
    followClear,
    get followProgress() {
      return { indexed: FW.done, N, building: !!FW.building && FW.done < N };
    },
    pageContext,
    decorate,
    onKey,
    onPage,
    openPanel,
    savePdf,
    saveText,
    setTool,
    get active() {
      return S.tool !== 'hand';
    },
    get tool() {
      return S.tool;
    },
    get count() {
      return M.anns.length;
    },
    resumeAt: M.last,
    destroy() {
      document.removeEventListener('selectionchange', onSelChange);
      clearTimeout(saveT);
      setItem('notes', key, { anns: M.anns, marks: M.marks, last: M.last, title: c.title || '', updated: Date.now() });
    },
  };
}
