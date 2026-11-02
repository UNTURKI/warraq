// الخزانة: أول ما يُرى في البرنامج.
//   · على المنضدة: الكتاب الذي يُعمل عليه، وطابور النسّاخ، وخانة يُسحب إليها ملف.
//   · ما أخرجتَه: كل كتاب أُخرج كعوبُ مجلداته بلون غلافه، على رفوف تمتلئ بقدر عرضها (shelf.js).
//     الضغط على كعب يفتح لوحة الكتاب: اقرأه على الرَّحل، افتح ملفه أو مجلده، أعد إخراجه، أزله.
import { spineWidth, watchWidth } from '/js/shelf.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const desk = window.warraqDesktop || (window.top !== window && window.top.warraqDesktop) || null;
const shell = (() => {
  try {
    return window.top !== window ? window.top.WarraqShell || null : null;
  } catch {
    return null;
  }
})();

/** المعدود العربي: كتاب، كتابان، ٣ كتب، ١١ كتاباً */
const COUNT = {
  كتاب: ['كتاب واحد', 'كتابان', 'كتب', 'كتاباً'],
  مجلد: ['مجلد واحد', 'مجلدان', 'مجلدات', 'مجلداً'],
  صفحة: ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  دفتر: ['دفتر واحد', 'دفتران', 'دفاتر', 'دفتراً'],
};
/** عدد الكتب والدفاتر: «٣ كتب ودفتران» */
function NB(list) {
  const nb = list.filter((b) => b.nb).length, bk = list.length - nb;
  return [bk ? N(bk, 'كتاب') : '', nb ? N(nb, 'دفتر') : ''].filter(Boolean).join(' و');
}
function N(n, w) {
  const f = COUNT[w];
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  const nn = ar(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  return `${nn} ${n % 100 >= 3 && n % 100 <= 10 ? f[2] : f[3]}`;
}
const fmtDate = (iso) => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-nu-arab-ca-gregory', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return '';
  }
};
let toastT = 0;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), ms);
}

/* ------------------------------------------------------------------ الألوان: لون الكعب، ولون كتابته */
const SPINE_FALLBACK = ['#6A1F2B', '#22385E', '#1D5A3F', '#5A3A22', '#1F1F21', '#1E2C45'];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const spineColor = (b) => b.color || b.accent || SPINE_FALLBACK[hash(b.title) % SPINE_FALLBACK.length];
function lum(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = (hex) => (lum(hex) > 0.35 ? '#2A1D14' : '#F4E7C4');

/* ------------------------------------------------------------------ على المنضدة */
const STEP = { 2: 'المجلدات', 3: 'التنضيد', 5: 'الإخراج' };
function diamonds(n) {
  return `<span class="steps5" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
}
const rel = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'الآن';
  try {
    const f = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
    return m < 60 ? f.format(-m, 'minute') : m < 1440 ? f.format(-Math.round(m / 60), 'hour') : f.format(-Math.round(m / 1440), 'day');
  } catch {
    return '';
  }
};
function renderDesk() {
  const info = shell ? shell.benchInfo() : null;
  const jobs = window.top.WarraqScribes ? window.top.WarraqScribes.list() : [];
  let html = '';
  if (info && info.title) {
    const n = info.done ? 5 : info.running ? 5 : info.step || 2;
    const state = info.running ? `${esc(info.stage || 'يعمل')} · ${ar(info.pct || 0)}٪` : info.done ? 'تمّ إخراجه' : `${STEP[info.step] || 'الكتاب'}${info.tpl && info.step === 3 ? ' · ' + esc(info.tpl) : ''}`;
    html += `<button type="button" class="card bench" data-act="bench" title="تابع على المنضدة"><span class="ci"><b class="t"></b><span class="row">${diamonds(n)}<span class="meta">${state}</span></span>${
      info.running ? `<span class="prog"><i style="width:${info.pct || 0}%"></i></span>` : `<span class="cf"><span>من ${esc(info.from || '«تراث»')}</span><span>${esc(rel(info.at))}</span></span>`
    }</span></button>`;
  } else {
    html += `<button type="button" class="card bench empty" data-act="new"><span class="ci"><b>المنضدة فارغة</b><span class="meta">ابحث عن كتاب في «تراث»، أو ضع ملفك</span><span class="cf"><span class="go">ابدأ كتاباً ←</span></span></span></button>`;
  }
  // كتب النسّاخ: بطاقة لكل كتاب
  for (const j of jobs.slice(0, 4)) {
    const st = j.state === 'running' ? `النسّاخ يعملون · ${ar(Math.round(j.pct))}٪` : j.state === 'failed' ? 'تعذّر إخراجه' : 'في انتظار النسّاخ';
    html += `<div class="card job ${j.state}" data-job="${esc(j.id)}"><b class="t"></b><span class="row">${diamonds(j.state === 'running' ? 4 : 3)}<span class="meta">${st}</span></span>${
      j.state === 'running' ? `<span class="prog"><i style="width:${j.pct}%"></i></span>` : ''
    }<span class="cf">${j.state === 'failed' ? `<button type="button" class="tl" data-act="retry" title="${esc(j.error)}">أعد المحاولة</button>` : '<span></span>'}<button type="button" class="tl quiet" data-act="drop" title="${j.state === 'running' ? 'أوقفه وأزله من الطابور' : 'أزله من الطابور'}">إزالة</button></span></div>`;
  }
  if (jobs.length > 4) html += `<div class="card more"><b>${ar(jobs.length - 4)}+</b><span class="meta">كتب أخرى عند النسّاخ</span></div>`;
  html += `<label class="card drop" id="drop" tabindex="0"><b>اسحب كتاب «وَرَق» أو ملف Word أو PDF هنا</b><span class="meta">فيصير مشروعاً على المنضدة</span></label>`;
  $('#desk').innerHTML = html;
  const t = $('#desk .bench .t');
  if (t) t.textContent = info.title;
  for (const c of $$('#desk .job')) c.querySelector('.t').textContent = jobs.find((j) => j.id === c.dataset.job).title;
  wireDrop();
}
$('#desk').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'bench') shell && shell.go('bench');
  if (act === 'new') shell && shell.newBook();
  const li = b.closest('[data-job]');
  if (li && act === 'drop') window.top.WarraqScribes.remove(li.dataset.job);
  if (li && act === 'retry') window.top.WarraqScribes.retry(li.dataset.job);
});
function wireDrop() {
  const d = $('#drop');
  d.addEventListener('click', () => desk && desk.openDialog('bench'));
  d.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), desk && desk.openDialog('bench')));
  d.addEventListener('dragover', (e) => (e.preventDefault(), d.classList.add('over')));
  d.addEventListener('dragleave', () => d.classList.remove('over'));
  d.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    d.classList.remove('over');
    openDropped(e.dataTransfer.files);
  });
}
/** ملفات سُحبت إلى الخزانة: إلى المنضدة (بمساراتها على الجهاز) */
function openDropped(files) {
  const paths = [...files].map((f) => (desk ? desk.pathOf(f) : '')).filter((p) => /\.(docx|pdf|waraq|warraq)$/i.test(p));
  if (!paths.length) return toast('ضع كتاب «وَرَق» أو ملف Word ‏(‎.docx) أو PDF');
  const proj = paths.find((p) => /\.(waraq|warraq)$/i.test(p));
  if (shell) shell.openOnBench(proj ? { path: proj, paths: [proj] } : { paths });
}
/** ملف PDF وُضع على الرفّ: يُقرأ على الرَّحل */
function readDropped(files) {
  const wq = [...files].find((x) => /\.(waraq|warraq)$/i.test(x.name));
  if (wq && shell && desk && shell.waraqOnRahl) return shell.waraqOnRahl(desk.pathOf(wq));
  const f = [...files].find((x) => /\.pdf$/i.test(x.name) || x.type === 'application/pdf');
  if (!f) return toast('الرَّحل يقرأ ملفات PDF وكتب «وَرَق»: ضع أحدها على الرفّ');
  if (shell) shell.openOnRahl(f);
}
// الإفلات في أي موضع من الخزانة: إلى المنضدة (وعلى خانة الرفّ: إلى الرَّحل)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!e.dataTransfer || !e.dataTransfer.files.length) return; // سحب كعبٍ داخل الخزانة
  if (!e.target.closest || (!e.target.closest('#drop') && !e.target.closest('.slot'))) openDropped(e.dataTransfer.files);
});

/* ------------------------------------------------------------------ ما أخرجتَه: الخزائن الخشبية */
// كل مجلد كعبُ كتابٍ مجلّد: لونه لون غلافه، وسُمكه بعدد صفحاته، وطوله يختلف من كتاب لآخر.
// على الكعب أعصابٌ بارزة مذهّبة، ورقعة جلد عليها العنوان بالذهب، ورقم المجلد في دائرة.
// للمستخدم خزائن يسمّيها ويتنقّل بينها (في كل خزانة أربعة رفوف، وما زاد فعلى صفحة تالية منها)،
// وترتيبٌ يختاره: بلا تقسيم، أو بموضوع الكتاب في «تراث»، أو بمجموعات يصنعها. وكل مجموعة جناحٌ من الخزانة
// بين قائمتين، فوقه بطاقة فهرسٍ في حاملٍ نحاسي عليها اسمها وعدد كتبها.
let books = [];
let filter = '';
let selected = null;
let prefs = {};
let page = 0;
const MAX_SHELVES = 4;
const norm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const MODES = { none: 'بلا تقسيم', subject: 'بالموضوع', custom: 'مجموعاتي' };
const cabinets = () => (Array.isArray(prefs.cabinets) && prefs.cabinets.length ? prefs.cabinets : [{ id: 'main', name: 'خزانة ورّاق' }]);
const curCab = () => {
  const list = cabinets();
  return list.find((c) => c.id === prefs.cabinet) || list[0];
};
const cabOf = (b) => (cabinets().some((c) => c.id === b.cabinet) ? b.cabinet : cabinets()[0].id);
const groupsOf = (cab) => (Array.isArray(prefs.groups) ? prefs.groups : []).filter((g) => (g.cabinet || cabinets()[0].id) === cab);
const mode = () => (MODES[prefs.shelfMode] ? prefs.shelfMode : 'none');
// لافتة المجموعة: «card» بطاقة فهرسٍ كبيرة في حامل نحاسي (يرتفع لها الرف)، أو «plate» لوحة ذهبية صغيرة على إطار الرف
const labelStyle = () => (prefs.groupLabel === 'plate' ? 'plate' : 'card');
async function savePrefs(patch) {
  Object.assign(prefs, patch);
  if (desk && desk.setPrefs) await desk.setPrefs(patch).catch(() => {});
}

async function loadBooks() {
  const [list, info] = await Promise.all([desk ? desk.library().catch(() => []) : [], desk && desk.info ? desk.info().catch(() => null) : null]);
  // الدفتر (من الرَّحل): مجلدٌ واحد، صفحاته في رفّ الرَّحل
  books = list.map((b) => (b.nb ? { ...b, volumes: [{ vol: '', label: '', pdf: '', docx: '', pages: b.nbPages || 1, nb: true }] } : b));
  if (info && info.prefs) prefs = info.prefs;
  renderShelves();
  if (prefs.shelfMode === undefined && books.length) askMode();
  fillSubjects();
}

/** موضوع كل كتاب من فهرس «تراث» (يُحفظ في سجلّه)، وكتب الجهاز «من جهازك» */
async function fillSubjects() {
  const need = books.filter((b) => !b.subject || !b.subject.name);
  if (!need.length) return;
  const idOf = (b) => {
    const src = b.project && b.project.source;
    if (!src) return 0;
    if (Array.isArray(src.parts)) {
      const p = src.parts.find((x) => x.kind === 'src' && (!x.src || x.src === 'turath'));
      return p ? +p.id || 0 : 0;
    }
    return !src.src || src.src === 'turath' ? +src.id || 0 : 0;
  };
  const local = (b) => {
    const src = b.project && b.project.source;
    return !!(src && Array.isArray(src.parts) && src.parts.every((x) => x.kind === 'mine'));
  };
  const ids = [...new Set(need.map(idOf).filter(Boolean))];
  let map = {};
  if (ids.length) map = ((await fetch('/api/subjects?ids=' + ids.join(','), { cache: 'no-store' }).then((r) => r.json()).catch(() => null)) || {}).subjects || {};
  let changed = false;
  for (const b of need) {
    const id = idOf(b);
    const subject = map[id] ? { id: String(id), name: map[id] } : local(b) ? { id: 'local', name: 'من جهازك' } : null;
    if (!subject) continue;
    b.subject = subject;
    changed = true;
    if (desk && desk.libraryUpdate) desk.libraryUpdate(b.id, { subject }).catch(() => {});
  }
  if (changed && mode() === 'subject') renderShelves();
}

/** رقعة العنوان: جلدٌ أسود على الألوان، وعنّابي على الأسود */
const labelOn = (hex) => (lum(hex) < 0.02 ? '#5A1824' : lum(hex) > 0.3 ? '#2A1D14' : '#17110D');
const GOLD = '#E3C77E';
const SLOT_W = 200;
const GAP = 3;
const BAY_PAD = 36; // حشو الجناح من الجانبين
const POST = 14; // القائمة بين جناحين

/** الاسم على الكعب: ما اختاره المستخدم، وإلا عنوان الكتاب */
const spineName = (b) => (b.spine && b.spine.trim()) || b.title;
/**
 * الاسم على الكعب لا ينتهي بنقاط: يُكتب منه ما يتّسع له الكعب من كلمات كاملة، ويقف عند آخر كلمة تتّسع.
 * (يُقاس بقلم اللوحة: الخط العربي في الكتابة العمودية يُدار على جنبه، فطوله هو عرضه)
 */
const pen = document.createElement('canvas').getContext('2d');
function fitSpines(root = document) {
  const spans = [...root.querySelectorAll('.spine .lab span[data-fit]')];
  // قراءة كل الأطوال أولاً (تخطيط واحد)، ثم الكتابة
  const room = spans.map((sp) => {
    const lab = sp.parentElement;
    const cs = getComputedStyle(sp);
    return { sp, h: lab.clientHeight - 10, font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` };
  });
  for (const { sp, h, font } of room) {
    const full = sp.dataset.fit;
    pen.font = font;
    const words = full.split(/\s+/).filter(Boolean);
    let text = full;
    if (pen.measureText(full).width > h) {
      text = words[0] || '';
      for (let i = 1; i < words.length; i++) {
        const t = text + ' ' + words[i];
        if (pen.measureText(t).width > h) break;
        text = t;
      }
      // ما يتّصل به من حروف العطف والجر وحدها لا يُترك في آخر السطر
      text = text.replace(/\s+(و|في|من|على|إلى|عن|أو|ثم|بن|ابن|بنت|أبي|أبو|ذو|ذي|الى)$/u, '');
    }
    sp.textContent = text;
    sp.classList.toggle('one', text === (words[0] || '') && pen.measureText(text).width > h);
  }
}
if (document.fonts) document.fonts.ready.then(() => fitSpines());
/** ما يُرسل إلى الرَّحل مع الكتاب: ملف «وَرَق»، والغلاف الخلفي والكعب ولون الجلد كما اختيرت (وإلا فالشكل الافتراضي) */
function looksOf(b, v) {
  const o = {};
  if (b.waraqExists) o.waraq = b.waraq;
  if (b.backImg) o.back = b.backImg;
  if (v && v.spineImg) o.spine = v.spineImg;
  if (b.color) o.cloth = b.color;
  return Object.keys(o).length ? o : undefined;
}
/** الكتاب في اللوحة: غلافه الأمامي وحده، بمقاس أغلفة الكتب كلها (والكعب والخلفي يُريان على الرف والرَّحل) */
function coversHtml(b, c) {
  return `<div class="cover" style="--c:${c}">${b.thumb ? `<img alt="الغلاف الأمامي" src="${b.thumb}">` : `<span class="ct"></span>`}</div>`;
}
const JPEG_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
/** صورة الكعب الحقيقي (كما يُطبع) آمنةً للنمط */
const realSpine = (v) => (v && typeof v.spineImg === 'string' && JPEG_URL.test(v.spineImg) ? v.spineImg : '');
/** كعب الخزانة: الكعب نفسه مرسوماً بنسبة كعبه على الرف (نصّه بمقاسه، لا يُمطّ) */
const shelfSpineImg = (v) => (v && typeof v.shelfImg === 'string' && JPEG_URL.test(v.shelfImg) ? v.shelfImg : '');
/** مقاس صورة JPEG من رأسها (بلا انتظار تحميلها) ← { w, h } أو null */
const jpegDims = new Map();
function jpegSize(url) {
  if (jpegDims.has(url)) return jpegDims.get(url);
  let out = null;
  try {
    // رأس الملف يكفي: أول ٦٤ ك.ب. من البيانات
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64.length > 87380 ? b64.slice(0, 87380) : b64); // ٨٧٣٨٠ من مضاعفات ٤
    for (let i = 2; i + 9 < bin.length; ) {
      if (bin.charCodeAt(i) !== 0xff) break;
      const m = bin.charCodeAt(i + 1);
      const len = (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        out = { h: (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6), w: (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8) };
        break;
      }
      i += 2 + len;
    }
  } catch {}
  jpegDims.set(url, out);
  return out;
}
/** شكل الكعوب: «real» كعب الغلاف كما يُطبع، أو «leather» الكعب الجلدي الافتراضي (للخزانة كلها، ولكل كتابٍ إن خُصّ) */
const spineLookAll = () => (prefs.spineLook === 'leather' ? 'leather' : 'real');
const spineLookOf = (b) => (b.spineLook === 'real' || b.spineLook === 'leather' ? b.spineLook : spineLookAll());
const hasRealSpine = (b) => !b.nb && b.volumes.some((v) => shelfSpineImg(v) || realSpine(v));
/**
 * صورة الكعب على الرف، أو '' فيُرسم الكعب الجلدي. لا تُمطّ صورةٌ أبداً:
 * كعب الخزانة (يُرسم مع الإخراج بنسبة الرف) يُوضع كما هو، وكعب الطباعة وحده (من إخراجٍ قديم) لا يُوضع
 * إلا إن قاربت نسبته نسبة الكعب على الرف، وإلا فالكعب الجلدي بعنوانه (والكعب النحيف في الطباعة نحيفٌ جداً على الرف).
 */
function shelfImage(s) {
  if (s.b.nb || spineLookOf(s.b) !== 'real') return '';
  const shelf = shelfSpineImg(s.v);
  if (shelf) return shelf;
  const img = realSpine(s.v);
  const d = img && jpegSize(img);
  if (!d || !d.w || !d.h) return '';
  const r = s.w / s.h / (d.w / d.h);
  return r <= 1.18 && r >= 1 / 1.18 ? img : '';
}
function spineHtml(s) {
  const n = s.b.volumes.length > 1 ? `<i class="no">${ar(s.i + 1)}</i>` : '';
  const light = lum(s.c) > 0.3;
  const title = s.b.title + (s.v.label ? ' — ' + s.v.label : '');
  // الكعب الذي اختير للكتاب: صورته كما يُطبع (عنوانه ورقم مجلده فيها)؛ وإلا فالكعب الجلدي الافتراضي بعنوانه
  const img = shelfImage(s);
  const face = img ? '' : `<span class="lab"><span data-fit="${esc(spineName(s.b))}">${esc(spineName(s.b))}</span></span>${n}`;
  return `<button type="button" draggable="true" class="spine${s.b.nb ? ' nb' : ''}${img ? ' real' : ''}${s.missing ? ' gone' : ''}${s.w < 34 ? ' thin' : ''}${light ? ' light' : ''}${s.b.id === selected ? ' on' : ''}" data-book="${esc(s.b.id)}" style="--c:${s.c};--lab:${labelOn(s.c)};--g:${light ? '#6B4A16' : GOLD};width:${s.w}px;height:${s.h}px${img ? `;--img:url(${img})` : ''}" title="${esc(title + (s.missing ? ' (نُقلت ملفاته أو حُذفت)' : ''))}" aria-label="${esc(title)}">${face}</button>`;
}
const spinesOf = (list) => {
  const out = [];
  for (const b of list) {
    const c = spineColor(b);
    const h = 150 + (hash(b.id + b.title) % 6) * 6;
    // الدفتر أقصر من الكتب قليلاً، وكعبه بقدر صفحاته
    if (b.nb) out.push({ b, v: b.volumes[0], i: 0, c, h: 136 + (hash(b.id) % 3) * 4, w: Math.max(26, Math.min(44, spineWidth(Math.max(40, (b.nbPages || 1) * 3), false))), missing: false });
    else b.volumes.forEach((v, i) => out.push({ b, v, i, c, h, w: spineWidth(v.pages || 300, false), missing: !(v.pdfExists || v.docxExists) }));
  }
  return out;
};
/** كعوبٌ على رفوف بعرضٍ معلوم ← [{ items, used }] */
function rowsOf(spines, width) {
  const rows = [];
  let row = [];
  let used = 0;
  for (const s of spines) {
    if (row.length && used + GAP + s.w > width) {
      rows.push({ items: row, used });
      row = [];
      used = 0;
    }
    used += (row.length ? GAP : 0) + s.w;
    row.push(s);
  }
  if (row.length || !rows.length) rows.push({ items: row, used });
  return rows;
}

/** مجموعات الخزانة الحالية بحسب الترتيب المختار ← [{ key, name, books, empty? }] */
function groupsNow(list, cab = curCab().id) {
  const m = mode();
  if (m === 'subject') {
    const by = new Map();
    for (const b of list) {
      const name = (b.subject && b.subject.name) || 'غير مصنّف';
      if (!by.has(name)) by.set(name, []);
      by.get(name).push(b);
    }
    return [...by.entries()]
      .sort((a, b) => (a[0] === 'غير مصنّف') - (b[0] === 'غير مصنّف') || (a[0] === 'من جهازك') - (b[0] === 'من جهازك') || a[0].localeCompare(b[0], 'ar'))
      .map(([name, bs]) => ({ key: 's:' + name, name, books: bs }));
  }
  if (m === 'custom') {
    const gs = groupsOf(cab);
    const out = gs.map((g) => ({ key: g.id, id: g.id, name: g.name, books: list.filter((b) => b.group === g.id), custom: true }));
    const rest = list.filter((b) => !gs.some((g) => g.id === b.group));
    if (rest.length || !gs.length) out.push({ key: '', id: '', name: 'بلا مجموعة', books: rest, custom: true, loose: true });
    return out;
  }
  return [{ key: 'all', name: '', books: list }];
}

/**
 * التخطيط: أجنحة (مجموعات) تتجاور في «طبقة» ما اتّسع لها العرض، والجناح الأعرض من الخزانة يأخذ طبقته وحده على رفوف.
 * الطبقات تُقسَّم صفحاتٍ لا تزيد كل صفحة على أربعة رفوف. ← [ [ band{ bays[{g, rows, basis}], h } ] ]
 */
function layout(groups, inner, withSlot) {
  const bands = [];
  let band = null;
  const close = () => band && band.bays.length && bands.push(band);
  for (const g of groups) {
    const spines = spinesOf(g.books);
    const natural = spines.reduce((a, s) => a + s.w, 0) + Math.max(0, spines.length - 1) * GAP;
    const need = Math.max(g.name ? 150 : 0, natural + BAY_PAD);
    if (need <= inner && band && band.used + POST + need <= inner) {
      band.bays.push({ g, rows: [{ items: spines, used: natural }], basis: need });
      band.used += POST + need;
    } else if (need <= inner) {
      close();
      band = { bays: [{ g, rows: [{ items: spines, used: natural }], basis: need }], used: need, h: 1 };
    } else {
      close();
      band = null;
      bands.push({ bays: [{ g, rows: rowsOf(spines, inner - BAY_PAD), basis: inner }], used: inner, h: 0 });
    }
  }
  close();
  for (const b of bands) b.h = Math.max(...b.bays.map((x) => x.rows.length));
  // خانة الرَّحل: في آخر رفّ إن اتّسع، وإلا جناحٌ وحدها
  if (withSlot) {
    const last = bands[bands.length - 1];
    if (groups.length === 1 && !groups[0].name && last) {
      const r = last.bays[0].rows[last.bays[0].rows.length - 1];
      if (inner - BAY_PAD - r.used >= SLOT_W + 24) r.slot = true;
      else last.bays[0].rows.push({ items: [], used: 0, slot: true }), (last.h = last.bays[0].rows.length);
    } else if (last && last.h === 1 && last.used + POST + SLOT_W <= inner) last.bays.push({ slot: true, basis: SLOT_W, rows: [{ items: [], used: 0, slot: true }] });
    else bands.push({ bays: [{ slot: true, basis: inner, rows: [{ items: [], used: 0, slot: true }] }], h: 1, used: inner });
  }
  // الصفحات: أربعة رفوف لكل صفحة (والطبقة الطويلة تُقسم على الصفحات)
  const pages = [];
  let cur = [];
  let used = 0;
  for (const b of bands) {
    let rows = b.h;
    let from = 0;
    while (rows > 0) {
      const room = MAX_SHELVES - used;
      if (room <= 0) {
        pages.push(cur);
        cur = [];
        used = 0;
        continue;
      }
      const take = Math.min(rows, room);
      cur.push({ ...b, from, h: take });
      used += take;
      rows -= take;
      from += take;
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function slotHtml() {
  return `<label class="slot" tabindex="0" title="اقرأ كتاب PDF على الرَّحل"><b>ضع كتاباً على الرَّحل</b><span>اسحب ملف PDF إلى الرفّ</span></label>`;
}
function bayHtml(bay, band, inner) {
  const g = bay.g;
  const rows = bay.rows.slice(band.from, band.from + band.h);
  while (rows.length < band.h) rows.push({ items: [], used: 0 });
  const cells = rows
    .map((r) => {
      const end = r.items.length && (bay.basis - BAY_PAD) - r.used > 30 ? '<i class="bookend" aria-hidden="true"></i>' : '';
      const empty = !r.items.length && !r.slot && g && g.custom && !g.books.length ? '<span class="bay-empty">اسحب كتاباً إلى هنا</span>' : '';
      return `<div class="cell">${r.items.map(spineHtml).join('')}${end}${r.slot ? slotHtml() : ''}${empty}</div><div class="plank" aria-hidden="true"></div>`;
    })
    .join('');
  const n = g ? g.books.length : 0;
  // بطاقة الفهرس في حاملها النحاسي: اسم المجموعة وعدد كتبها
  const cap = g && g.name && labelStyle() === 'plate'
    ? `<div class="bay-rail"><button type="button" class="grp-plate${g.custom && !g.loose ? ' editable' : ''}" ${g.custom && !g.loose ? `data-group="${esc(g.id)}" title="أعد تسمية المجموعة أو احذفها"` : 'tabindex="-1"'}>${esc(g.name)} · ${n ? NB(g.books) : 'فارغة'}</button></div>`
    : labelStyle() === 'plate' && band.bays.some((x) => x.g && x.g.name) && !(g && g.name) ? '<div class="bay-rail" aria-hidden="true"></div>'
    : g && g.name ? `<div class="bay-cap"><button type="button" class="card-holder${g.custom && !g.loose ? ' editable' : ''}" ${g.custom && !g.loose ? `data-group="${esc(g.id)}" title="أعد تسمية المجموعة أو احذفها"` : 'tabindex="-1"'}><span class="cardtext"><b>${esc(g.name)}</b><small>${n ? NB(g.books) : 'فارغة'}</small></span></button></div>` : '';
  const grow = band.bays.length > 1 ? `flex:${Math.round(bay.basis)} 1 ${Math.round(bay.basis)}px` : 'flex:1 1 auto';
  return `<section class="bay${bay.slot ? ' bay-slot' : ''}${g && g.name ? ' named' : ''}" style="${grow}" ${g ? `data-bay="${esc(g.key)}"` : ''} ${g && g.custom ? `data-drop-group="${esc(g.id || '')}"` : ''}>${cap}${cells}</section>`;
}

function renderShelves({ show = null } = {}) {
  const cab = curCab();
  const mine = books.filter((b) => cabOf(b) === cab.id);
  const list = filter ? mine.filter((b) => norm(b.title + ' ' + b.author).includes(norm(filter))) : mine;
  const real = books.filter((b) => !b.nb);
  const vols = real.reduce((a, b) => a + b.volumes.length, 0);
  const nbs = books.length - real.length;
  $('#sub').textContent = books.length ? `${real.length ? `${N(real.length, 'كتاب')} في ${N(vols, 'مجلد')}` : ''}${nbs ? `${real.length ? ' و' : ''}${N(nbs, 'دفتر')}` : ''}${books.length ? ` · آخر إخراج: ${fmtDate(books.reduce((a, b) => (b.updated > a ? b.updated : a), ''))}` : ''}` : 'ما تخرجه يُوضع هنا';
  $('#plaque').textContent = `${cab.name}${mine.length ? ' · ' + NB(mine) : ''}`;
  renderTools();
  const cse = $('#case');
  const cell = (inner, cls = '') => `<div class="cell${cls}">${inner}</div><div class="plank" aria-hidden="true"></div>`;
  $('#pager').hidden = true;
  if (!mine.length && mode() !== 'custom') {
    const first = !books.length;
    cse.innerHTML =
      cell(
        first
          ? `<div class="brass"><b>رفوفك فارغة بعد</b><span>كل كتاب تخرجه يُوضع هنا مجلّداً بلون غلافه</span><button type="button" class="btn" data-try="الأربعون النووية">جرّب: الأربعون النووية</button></div>`
          : `<div class="brass"><b>«${esc(cab.name)}» فارغة</b><span>اسحب كتاباً من خزانة أخرى إلى اسمها، أو اختر هذه الخزانة بعد إخراج كتاب</span></div>`,
        ' center',
      ) + cell(slotHtml());
    wireSlot();
    return;
  }
  if (filter && !list.length) {
    cse.innerHTML = cell(`<div class="brass"><b>لا كتاب في هذه الخزانة بهذا الاسم</b><span>اضغط Enter لتبحث عنه في «تراث»</span></div>`, ' center') + cell(slotHtml());
    wireSlot();
    return;
  }
  const inner = Math.max(200, cse.clientWidth - 32);
  const pages = layout(groupsNow(list), inner, true);
  if (show) {
    const at = pages.findIndex((pg) => pg.some((band) => band.bays.some((bay) => bay.rows.slice(band.from, band.from + band.h).some((r) => r.items.some((x) => x.b.id === show)))));
    if (at >= 0) page = at;
  }
  page = Math.min(page, pages.length - 1);
  const pg = pages[page] || [];
  cse.innerHTML = pg
    .map((band, k) => `<div class="band${k ? ' next' : ''}${labelStyle() === 'plate' ? ' plated' : ''}">${band.bays.map((bay, j) => (j ? '<i class="post" aria-hidden="true"></i>' : '') + bayHtml(bay, band, inner)).join('')}</div>`)
    .join('');
  // صفحات الخزانة: إذا امتلأت رفوفها الأربعة
  const pager = $('#pager');
  pager.hidden = pages.length < 2;
  if (pages.length > 1) {
    pager.querySelector('span').textContent = `الرفوف ${ar(page + 1)} من ${ar(pages.length)}`;
    pager.querySelector('[data-pg="-1"]').disabled = page === 0;
    pager.querySelector('[data-pg="1"]').disabled = page >= pages.length - 1;
  }
  wireSlot();
  fitSpines(cse);
}
function wireSlot() {
  const sl = $('#case .slot');
  if (!sl) return;
  const pick = () => desk && desk.openDialog('rahl');
  sl.addEventListener('click', pick);
  sl.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
  sl.addEventListener('dragover', (e) => (e.preventDefault(), sl.classList.add('over')));
  sl.addEventListener('dragleave', () => sl.classList.remove('over'));
  sl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sl.classList.remove('over');
    readDropped(e.dataTransfer.files);
  });
}
$('#case').addEventListener('click', (e) => {
  const t = e.target.closest('[data-try]');
  if (t) return void (shell && shell.go('bench').then((w) => w && w.WarraqBench && w.WarraqBench.search(t.dataset.try)));
  const s = e.target.closest('.spine[data-book]');
  if (s) return openPanel(s.dataset.book);
  const g = e.target.closest('.card-holder[data-group], .grp-plate[data-group]');
  if (g) groupMenu(g);
});
$('#pager').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pg]');
  if (!b) return;
  page = Math.max(0, page + +b.dataset.pg);
  renderShelves();
});
watchWidth($('#case'), renderShelves);

/* ---- الخزائن، والترتيب، والمجموعات ---- */
function renderTools() {
  const cab = curCab();
  $('#cabTabs').innerHTML =
    cabinets()
      .map(
        (c) => `<button type="button" class="cab-tab" role="tab" data-cab="${esc(c.id)}" aria-selected="${c.id === cab.id}" title="${c.id === cab.id ? 'انقر مرتين لإعادة التسمية' : 'افتح هذه الخزانة (واسحب إليها كتاباً لتنقله)'}"><span>${esc(c.name)}</span><small>${ar(books.filter((b) => cabOf(b) === c.id).length)}</small></button>`,
      )
      .join('') + `<button type="button" class="cab-tab add" data-act="newcab" title="خزانة جديدة باسمٍ تختاره">＋ خزانة</button>`;
  for (const b of $$('#shelfMode button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode()));
  $('#newGroup').hidden = mode() !== 'custom';
  $('#labelStyle').hidden = mode() === 'none';
  for (const b of $$('#labelStyle button')) b.setAttribute('aria-pressed', String(b.dataset.label === labelStyle()));
  // شكل الكعوب: يظهر إذا كان في الخزانة كتابٌ له كعبٌ حقيقي
  $('#spineLook').hidden = !books.some(hasRealSpine);
  for (const b of $$('#spineLook button')) b.setAttribute('aria-pressed', String(b.dataset.look === spineLookAll()));
}
$('#spineLook').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-look]');
  if (!b) return;
  await savePrefs({ spineLook: b.dataset.look });
  renderShelves();
  if (panelId) openPanel(panelId, { refresh: true });
});
$('#cabTabs').addEventListener('click', async (e) => {
  const add = e.target.closest('[data-act="newcab"]');
  if (add) {
    const name = await ask('خزانة جديدة', 'اسم الخزانة', '', 'مثل: كتب الفقه، أو مكتبة البيت');
    if (!name) return;
    const c = { id: 'c' + uid(), name };
    await savePrefs({ cabinets: [...cabinets(), c], cabinet: c.id });
    page = 0;
    return renderShelves();
  }
  const t = e.target.closest('[data-cab]');
  if (!t) return;
  if (t.dataset.cab === curCab().id) return cabMenu(t);
  page = 0;
  await savePrefs({ cabinet: t.dataset.cab });
  renderShelves();
});
$('#cabTabs').addEventListener('dblclick', (e) => {
  const t = e.target.closest('[data-cab]');
  if (t) cabMenu(t);
});
$('#shelfMode').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  page = 0;
  await savePrefs({ shelfMode: b.dataset.mode });
  renderShelves();
  if (b.dataset.mode === 'subject') fillSubjects();
});
$('#labelStyle').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-label]');
  if (!b) return;
  await savePrefs({ groupLabel: b.dataset.label });
  renderShelves();
});
$('#newGroup').addEventListener('click', async () => {
  const name = await ask('مجموعة جديدة', 'اسم المجموعة', '', 'مثل: العقيدة، أو كتب الطلب، أو للقراءة');
  if (!name) return;
  const g = { id: 'g' + uid(), name, cabinet: curCab().id };
  await savePrefs({ groups: [...(prefs.groups || []), g] });
  renderShelves();
});
async function cabMenu(anchor) {
  const c = curCab();
  const act = await menu(anchor, [['rename', 'أعد التسمية'], ...(cabinets().length > 1 ? [['delete', 'احذف الخزانة (تنتقل كتبها إلى الأولى)']] : [])]);
  if (act === 'rename') {
    const name = await ask('إعادة تسمية الخزانة', 'اسم الخزانة', c.name);
    if (name) await savePrefs({ cabinets: cabinets().map((x) => (x.id === c.id ? { ...x, name } : x)) });
  }
  if (act === 'delete') {
    const rest = cabinets().filter((x) => x.id !== c.id);
    for (const b of books) if (cabOf(b) === c.id) b.cabinet = rest[0].id;
    if (desk && desk.libraryMove) await desk.libraryMove('cabinet', c.id, rest[0].id).catch(() => {});
    await savePrefs({ cabinets: rest, cabinet: rest[0].id, groups: (prefs.groups || []).map((g) => ((g.cabinet || 'main') === c.id ? { ...g, cabinet: rest[0].id } : g)) });
    toast(`حُذفت «${c.name}»، وكتبها الآن في «${rest[0].name}»`, 4200);
  }
  renderShelves();
}
async function groupMenu(anchor) {
  const g = (prefs.groups || []).find((x) => x.id === anchor.dataset.group);
  if (!g) return;
  const mine = groupsOf(g.cabinet || cabinets()[0].id);
  const k = mine.indexOf(g);
  const act = await menu(anchor, [['rename', 'أعد التسمية'], ...(k > 0 ? [['up', 'قدّمها (قبل «' + mine[k - 1].name + '»)']] : []), ...(k < mine.length - 1 ? [['down', 'أخّرها (بعد «' + mine[k + 1].name + '»)']] : []), ['delete', 'احذف المجموعة (تبقى كتبها بلا مجموعة)']]);
  if (act === 'up' || act === 'down') {
    const other = mine[k + (act === 'up' ? -1 : 1)];
    const all = prefs.groups.slice();
    const a = all.indexOf(g);
    const c = all.indexOf(other);
    [all[a], all[c]] = [all[c], all[a]];
    await savePrefs({ groups: all });
  }
  if (act === 'rename') {
    const name = await ask('إعادة تسمية المجموعة', 'اسم المجموعة', g.name);
    if (name) await savePrefs({ groups: prefs.groups.map((x) => (x.id === g.id ? { ...x, name } : x)) });
  }
  if (act === 'delete') {
    for (const b of books) if (b.group === g.id) b.group = '';
    if (desk && desk.libraryMove) await desk.libraryMove('group', g.id, '').catch(() => {});
    await savePrefs({ groups: prefs.groups.filter((x) => x.id !== g.id) });
  }
  renderShelves();
}
/** نقل كتاب: إلى خزانة، أو إلى مجموعة */
async function moveBook(id, patch) {
  const b = books.find((x) => x.id === id);
  if (!b) return;
  Object.assign(b, patch);
  if (desk && desk.libraryUpdate) await desk.libraryUpdate(id, patch).catch(() => {});
  renderShelves();
  if (panelId === id) openPanel(id, { refresh: true });
}

/* ---- ترتيب الكتب في الرف: كما يشاء المستخدم. أول الكتب في أقصى يمين الرف ---- */
async function saveOrder() {
  if (desk && desk.libraryOrder) await desk.libraryOrder(books.map((b) => b.id)).catch(() => {});
}
/** مجموعة الكتاب الظاهرة (في خزانته وبترتيب الرفوف الحالي) ← { g, list } */
function groupOfBook(b) {
  const cab = cabOf(b);
  const g = groupsNow(books.filter((x) => cabOf(x) === cab), cab).find((x) => x.books.includes(b));
  return g || { key: '', books: [b] };
}
/** مجموعة الكتاب في «مجموعاتي» كما تظهر ('' لما لا مجموعة له) */
const shownGroup = (b) => (groupsOf(cabOf(b)).some((g) => g.id === b.group) ? b.group : '');
/** ضع الكتاب قبل كتابٍ آخر أو بعده (وانقله إلى مجموعته إن لزم) */
async function placeBook(id, ref, after, patch = null) {
  const b = books.find((x) => x.id === id);
  const r = books.find((x) => x.id === ref);
  if (!b || !r || b === r) return false;
  const before = books.map((x) => x.id).join();
  books.splice(books.indexOf(b), 1);
  books.splice(books.indexOf(r) + (after ? 1 : 0), 0, b);
  const moved = before !== books.map((x) => x.id).join();
  if (patch && Object.keys(patch).length) {
    Object.assign(b, patch);
    if (desk && desk.libraryUpdate) await desk.libraryUpdate(id, patch).catch(() => {});
  }
  if (moved) await saveOrder();
  renderShelves({ show: id });
  flashBook(id);
  if (panelId === id) openPanel(id, { refresh: true });
  return moved;
}
/** تقديم الكتاب أو تأخيره في رفّه: first | prev | next | last */
function stepBook(id, where) {
  const b = books.find((x) => x.id === id);
  if (!b) return;
  const sib = groupOfBook(b).books;
  const i = sib.indexOf(b);
  if (sib.length < 2) return;
  if ((where === 'first' || where === 'prev') && i === 0) return;
  if ((where === 'last' || where === 'next') && i === sib.length - 1) return;
  const [ref, after] = where === 'first' ? [sib[0], false] : where === 'prev' ? [sib[i - 1], false] : where === 'next' ? [sib[i + 1], true] : [sib[sib.length - 1], true];
  return placeBook(id, ref.id, after);
}
function flashBook(id) {
  for (const x of $$(`#case .spine[data-book="${CSS.escape(id)}"]`)) {
    x.classList.remove('moved');
    void x.offsetWidth;
    x.classList.add('moved');
  }
}
/** رتّب كتب الخزانة الحالية مرةً واحدة (ثم يبقى المستخدم حرّاً في تحريكها) */
const SORTS = {
  title: ['بالعنوان', (a, b) => a.title.localeCompare(b.title, 'ar')],
  author: ['بالمؤلف', (a, b) => (a.author || '\uffff').localeCompare(b.author || '\uffff', 'ar') || a.title.localeCompare(b.title, 'ar')],
  newest: ['الأحدث إخراجاً أولاً', (a, b) => (b.added || b.updated || '').localeCompare(a.added || a.updated || '')],
  oldest: ['الأقدم إخراجاً أولاً', (a, b) => (a.added || a.updated || '').localeCompare(b.added || b.updated || '')],
  reverse: ['اعكس الترتيب', null],
};
async function sortCabinet(how) {
  const cab = curCab();
  const slots = [];
  const mine = [];
  books.forEach((b, i) => cabOf(b) === cab.id && (slots.push(i), mine.push(b)));
  if (mine.length < 2) return;
  const sorted = how === 'reverse' ? mine.slice().reverse() : mine.slice().sort(SORTS[how][1]);
  slots.forEach((i, k) => (books[i] = sorted[k]));
  await saveOrder();
  page = 0;
  renderShelves();
  toast(`رُتّبت «${cab.name}» ${how === 'reverse' ? 'بعكس ترتيبها' : SORTS[how][0]}، واسحب أي كتاب بعدها إلى حيث شئت`, 4200);
}
$('#sortBtn').addEventListener('click', async (e) => {
  const how = await menu(e.currentTarget, Object.entries(SORTS).map(([k, [t]]) => [k, t]));
  if (how) sortCabinet(how);
});
// من لوحة المفاتيح: Alt مع الأسهم على الكعب المحدّد (أو Alt+Home / Alt+End)
document.addEventListener('keydown', async (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const sp = e.target.closest && e.target.closest('.spine[data-book]');
  if (!sp) return;
  const rtl = getComputedStyle(sp).direction === 'rtl';
  const map = { Home: 'first', End: 'last', ArrowRight: rtl ? 'prev' : 'next', ArrowLeft: rtl ? 'next' : 'prev', ArrowUp: 'prev', ArrowDown: 'next' };
  const where = map[e.key];
  if (!where) return;
  e.preventDefault();
  const id = sp.dataset.book;
  await stepBook(id, where);
  const again = $(`#case .spine[data-book="${CSS.escape(id)}"]`);
  if (again) again.focus();
});

// السحب: كعبٌ إلى مكانٍ بين الكتب، أو إلى مجموعة (جناحها)، أو إلى خزانة (اسمها في الأعلى)
const BOOK_MIME = 'text/x-warraq-book';
let dragId = null;
document.addEventListener('dragstart', (e) => {
  const s = e.target.closest && e.target.closest('.spine[data-book]');
  if (!s) return;
  e.dataTransfer.setData(BOOK_MIME, s.dataset.book);
  dragId = s.dataset.book;
  e.dataTransfer.effectAllowed = 'move';
  document.body.classList.add('dragging-book');
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.body.classList.remove('dragging-book');
  for (const x of $$('.drop-on, .ins-before, .ins-after')) x.classList.remove('drop-on', 'ins-before', 'ins-after');
});
const isBookDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes(BOOK_MIME);
/**
 * أين يقع الكتاب المسحوب إن أُفلت هنا؟ ← { ref, after, patch, el } أو null
 * على كعب: قبله أو بعده بحسب نصفه (والرفّ من اليمين). على فراغ الجناح: آخر مجموعته.
 */
function dropSpot(e) {
  const b = books.find((x) => x.id === dragId);
  if (!b || !e.target.closest) return null;
  const sp = e.target.closest('#case .spine[data-book]');
  const bay = e.target.closest('#case .bay[data-bay]');
  if (!bay) return null;
  const key = bay.dataset.bay;
  const g = groupsNow(books.filter((x) => cabOf(x) === curCab().id)).find((x) => x.key === key);
  if (!g) return null;
  const m = mode();
  // بالموضوع: الكتاب يتحرّك بين كتب موضوعه (فالموضوع من فهرس «تراث» لا يُغيَّر بالسحب)
  if (m === 'subject' && !g.books.includes(b)) return null;
  const patch = m === 'custom' && (g.id || '') !== shownGroup(b) ? { group: g.id || '' } : null;
  if (sp && sp.dataset.book !== b.id) {
    const r = sp.getBoundingClientRect();
    const rtl = getComputedStyle(sp).direction === 'rtl';
    const leftHalf = e.clientX < r.left + r.width / 2;
    return { ref: sp.dataset.book, after: rtl ? leftHalf : !leftHalf, patch, el: sp };
  }
  if (sp) return null; // على كعبه هو
  const rest = g.books.filter((x) => x !== b);
  if (!rest.length) return patch ? { ref: null, patch, el: bay } : null;
  return { ref: rest[rest.length - 1].id, after: true, patch, el: bay };
}
for (const [sel, ok] of [
  ['#case', (t) => t.closest('[data-drop-group]')],
  ['#cabTabs', (t) => t.closest('[data-cab]')],
]) {
  const box = $(sel);
  box.addEventListener('dragover', (e) => {
    if (!isBookDrag(e)) return;
    if (sel === '#case') {
      const spot = dropSpot(e);
      for (const x of $$('.drop-on, .ins-before, .ins-after')) x.classList.remove('drop-on', 'ins-before', 'ins-after');
      if (!spot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (spot.el.classList.contains('spine')) {
        // العلامة على الكعب كله (والمجلدات الأخرى للكتاب نفسه) في جهة الإدراج
        const all = $$(`#case .spine[data-book="${CSS.escape(spot.ref)}"]`);
        const edge = spot.after ? all[all.length - 1] : all[0];
        (edge || spot.el).classList.add(spot.after ? 'ins-after' : 'ins-before');
      } else spot.el.classList.add('drop-on');
      return;
    }
    const t = ok(e.target);
    for (const x of $$('.drop-on')) if (x !== t) x.classList.remove('drop-on');
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    t.classList.add('drop-on');
  });
  box.addEventListener('drop', (e) => {
    if (!isBookDrag(e)) return;
    if (sel === '#case') {
      const spot = dropSpot(e);
      for (const x of $$('.drop-on, .ins-before, .ins-after')) x.classList.remove('drop-on', 'ins-before', 'ins-after');
      if (!spot) return;
      e.preventDefault();
      e.stopPropagation();
      const id = dragId || e.dataTransfer.getData(BOOK_MIME);
      if (spot.ref) placeBook(id, spot.ref, spot.after, spot.patch);
      else moveBook(id, spot.patch);
      return;
    }
    const t = ok(e.target);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(BOOK_MIME);
    if (t.dataset.cab) {
      const c = cabinets().find((x) => x.id === t.dataset.cab);
      moveBook(id, { cabinet: t.dataset.cab, group: '' });
      if (c) toast(`نُقل إلى «${c.name}»`);
    } else moveBook(id, { group: t.dataset.dropGroup || '' });
  });
}

/* ---- نافذة صغيرة: سؤالٌ باسم، أو قائمة أوامر ---- */
function ask(title, label, value = '', hint = '') {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'kz-ask';
    d.innerHTML = `<form class="kz-ask-card" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3><label><span>${esc(label)}</span><input type="text" maxlength="60" value="${esc(value)}" placeholder="${esc(hint)}"></label><div class="row"><button type="button" class="btn" data-x>إلغاء</button><button type="submit" class="btn pri">حفظ</button></div></form>`;
    document.body.appendChild(d);
    const inp = d.querySelector('input');
    inp.focus();
    inp.select();
    const done = (v) => (d.remove(), resolve(v));
    d.querySelector('form').addEventListener('submit', (e) => (e.preventDefault(), done(inp.value.trim().slice(0, 60) || null)));
    d.querySelector('[data-x]').addEventListener('click', () => done(null));
    d.addEventListener('mousedown', (e) => e.target === d && done(null));
    d.addEventListener('keydown', (e) => e.key === 'Escape' && (e.stopPropagation(), done(null)));
  });
}
function menu(anchor, items) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'kz-menu';
    m.innerHTML = items.map(([k, t]) => `<button type="button" data-k="${k}" class="${k === 'delete' ? 'danger' : ''}">${esc(t)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left + r.width / 2 - m.offsetWidth / 2)) + 'px';
    const done = (v) => (m.remove(), document.removeEventListener('mousedown', out, true), resolve(v));
    const out = (e) => !m.contains(e.target) && done(null);
    setTimeout(() => document.addEventListener('mousedown', out, true));
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) done(b.dataset.k);
    });
  });
}

/* ---- أول مرة: كيف تُرتَّب خزانتك؟ ---- */
function askMode() {
  if ($('.kz-mode')) return;
  const d = document.createElement('div');
  d.className = 'kz-ask kz-mode';
  d.innerHTML = `<div class="kz-ask-card wide" role="dialog" aria-label="ترتيب الخزانة"><h3>كيف تُرتَّب خزانتك؟</h3><p>تغيّره متى شئت من أعلى الرفوف.</p>
    <div class="mode-opts">
      <button type="button" data-mode="none"><i class="mo mo-none"></i><b>بلا تقسيم</b><small>الكتب متجاورة، ترتّبها كما تشاء بالسحب</small></button>
      <button type="button" data-mode="subject"><i class="mo mo-subject"></i><b>بموضوع الكتاب</b><small>العقيدة، والتفسير، والحديث… من فهرس «تراث» تلقائياً</small></button>
      <button type="button" data-mode="custom"><i class="mo mo-custom"></i><b>مجموعاتي</b><small>تسمّي مجموعاتك وتضع فيها ما تشاء من الكتب</small></button>
    </div></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    d.remove();
    await savePrefs({ shelfMode: b.dataset.mode });
    renderShelves();
    if (b.dataset.mode === 'subject') fillSubjects();
  });
}

/* ------------------------------------------------------------------ لوحة الكتاب */
let panelId = null;
function openPanel(id, { refresh = false } = {}) {
  const b = books.find((x) => x.id === id);
  if (!b) return;
  panelId = id;
  selected = id;
  for (const x of $$('#case .spine')) x.classList.toggle('on', x.dataset.book === id);
  const c = spineColor(b);
  const p = $('#panel');
  if (b.nb) return nbPanel(b, c, p, refresh);
  const one = b.volumes.length <= 1;
  const WQ = `<button type="button" class="tl wq" data-act="waraq" title="الكتاب بصيغة «وَرَق»: افتحه في المحرِّر فيُحرَّر ويُخرج منه (${esc(String(b.waraq || '').split(/[\\/]/).pop())})"><i class="wq-fi" aria-hidden="true"></i>وَرَق</button>`;
  const vols = b.volumes
    .map(
      (v, i) => `<li><b>${esc(v.label || (b.volumes.length > 1 ? 'المجلد ' + ar(i + 1) : 'الكتاب'))}</b>${v.pages ? `<small>${N(v.pages, 'صفحة')}</small>` : ''}<span class="acts">
        ${v.pdfExists ? `<button type="button" class="btn sm" data-act="read" data-i="${i}" title="اقرأه على الرَّحل">اقرأ</button><button type="button" class="tl" data-act="pdf" data-i="${i}" title="افتح ملف PDF في برنامجه">PDF</button>` : ''}
        ${v.docxExists ? `<button type="button" class="tl" data-act="docx" data-i="${i}" title="افتح في Word">Word</button>` : ''}
        ${one && b.waraqExists ? WQ : ''}
        ${!v.pdfExists && !v.docxExists && !(one && b.waraqExists) ? '<small class="gone">نُقلت ملفاته أو حُذفت</small>' : ''}</span></li>`,
    )
    .join('') +
    // «وَرَق»: الكتاب كله في ملفٍ واحد (ففي ذي المجلدات سطرٌ وحده)
    (!one && b.waraqExists ? `<li class="wq-row"><b>الكتاب كله</b><small>${N(b.volumes.length, 'مجلد')} في ملف</small><span class="acts">${WQ}</span></li>` : '');
  p.innerHTML = `<button type="button" class="x" data-act="close" aria-label="إغلاق">✕</button>
    <div class="p-id">
    ${coversHtml(b, c)}
    <h2 class="pt"></h2><p class="pa"></p>
    <p class="pm">${N(b.volumes.length, 'مجلد')} · أُخرج ${fmtDate(b.updated)}</p>
    </div>
    <div class="p-ops">
    <ol class="vols">${vols}</ol>
    <div class="place">
      <label><span>على الكعب</span><span class="spine-name"><input type="text" data-spine maxlength="80" dir="auto" placeholder="${esc(b.title)}" value="${esc(b.spine || '')}" title="اسمٌ أقصر يُكتب على كعب المجلد في الرف (يبقى العنوان كما هو في الكتاب)"><button type="button" class="tl" data-act="spine-reset" ${b.spine ? '' : 'hidden'} title="عُد إلى عنوان الكتاب">↺</button></span></label>
      ${lookHtml(b)}
      <label><span>الخزانة</span><select data-place="cabinet">${cabinets().map((c) => `<option value="${esc(c.id)}" ${c.id === cabOf(b) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${ordHtml(b)}
      ${mode() === 'custom' ? `<label><span>المجموعة</span><select data-place="group"><option value="">بلا مجموعة</option>${groupsOf(cabOf(b)).map((g) => `<option value="${esc(g.id)}" ${g.id === b.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : mode() === 'subject' && b.subject ? `<p class="subj">الموضوع: <b>${esc(b.subject.name)}</b></p>` : ''}
    </div>
    <div class="pacts">
      ${b.dirExists ? '<button type="button" class="btn" data-act="folder">افتح المجلد</button>' : ''}
      ${b.project ? '<button type="button" class="btn" data-act="again" title="يعود الكتاب إلى المنضدة بإعداداته: غيّر ما شئت ثم أخرجه">أعده إلى المنضدة</button>' : ''}
      ${b.project ? '<button type="button" class="tl" data-act="queue" title="يُخرج من جديد في الخلفية بإعداداته نفسها">أعد إخراجه في الخلفية</button>' : ''}
      <button type="button" class="tl danger" data-act="remove" title="يُزال من الخزانة، وتبقى ملفاته في مجلدها">أزله من الخزانة</button>
    </div>
    </div>`;
  p.querySelector('.pt').textContent = b.title;
  p.querySelector('.pa').textContent = b.author || '';
  const ct = p.querySelector('.ct');
  if (ct) ct.textContent = b.title;
  p.hidden = false;
  fitPanel();
  if (!refresh) p.querySelector('.x').focus();
}
/** لوحة الدفتر: يُفتح على الرَّحل، ومكانه في الخزانة */
function nbPanel(b, c, p, refresh) {
  p.innerHTML = `<button type="button" class="x" data-act="close" aria-label="إغلاق">✕</button>
    <div class="p-id">
    <div class="cover nb" style="--c:${c}">${b.thumb ? `<img alt="" src="${b.thumb}">` : `<span class="ct"></span>`}</div>
    <h2 class="pt"></h2>
    <p class="pm">دفتر · ${N(b.nbPages || 1, 'صفحة')} · ${fmtDate(b.updated)}</p>
    </div>
    <div class="p-ops">
    <ol class="vols"><li><b>الدفتر</b><small>${N(b.nbPages || 1, 'صفحة')} على رفّ الرَّحل</small><span class="acts"><button type="button" class="btn sm" data-act="nbopen" title="افتحه على الرَّحل فتكتب فيه">افتحه على الرَّحل</button></span></li></ol>
    <div class="place">
      <label><span>على الكعب</span><span class="spine-name"><input type="text" data-spine maxlength="80" dir="auto" placeholder="${esc(b.title)}" value="${esc(b.spine || '')}"><button type="button" class="tl" data-act="spine-reset" ${b.spine ? '' : 'hidden'} title="عُد إلى اسم الدفتر">↺</button></span></label>
      <label><span>الخزانة</span><select data-place="cabinet">${cabinets().map((x) => `<option value="${esc(x.id)}" ${x.id === cabOf(b) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      ${ordHtml(b)}
      ${mode() === 'custom' ? `<label><span>المجموعة</span><select data-place="group"><option value="">بلا مجموعة</option>${groupsOf(cabOf(b)).map((g) => `<option value="${esc(g.id)}" ${g.id === b.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <p class="nb-note">صفحات الدفتر وما كتبتَه فيه محفوظةٌ في رفّ الرَّحل على هذا الجهاز، والخزانة تحفظ مكانه بين كتبك. ولنسخةٍ منه في ملف: افتحه ثم «نزّل» ← PDF بما كتبت.</p>
    <div class="pacts">
      <button type="button" class="tl danger" data-act="remove" title="يُزال من الخزانة، ويبقى الدفتر على رفّ الرَّحل">أزله من الخزانة</button>
    </div>
    </div>`;
  p.querySelector('.pt').textContent = b.title;
  const ct = p.querySelector('.ct');
  if (ct) ct.textContent = b.title;
  p.hidden = false;
  fitPanel();
  if (!refresh) p.querySelector('.x').focus();
}
/** اللوحة بعرضٍ يسع ما فيها فلا شريط تمرير: عمودٌ واحد، ثم عمودان (الكتاب وما يُعمل به)، ثم المجلدات في عمودين */
const FITS = ['', 'wide', 'wide wide2', 'wide wide2 wide3'];
function fitPanel() {
  const p = $('#panel');
  if (p.hidden) return;
  for (const f of FITS) {
    p.classList.remove('wide', 'wide2', 'wide3');
    if (f) p.classList.add(...f.split(' '));
    if (p.scrollHeight <= p.clientHeight + 1) return;
  }
}
window.addEventListener('resize', () => fitPanel());
/** شكل الكعب على الرف لهذا الكتاب: كالخزانة، أو كعب الغلاف كما يُطبع، أو الكعب الجلدي */
function lookHtml(b) {
  if (!hasRealSpine(b)) return '';
  const all = spineLookAll() === 'real' ? 'كعب الغلاف' : 'الجلدي';
  const cur = b.spineLook === 'real' || b.spineLook === 'leather' ? b.spineLook : '';
  return `<label title="كعب الغلاف: الكعب الذي اختير له كما يُطبع. الجلدي: الكعب الافتراضي بعنوانه على رقعته"><span>شكل الكعب</span><select data-look>
    <option value="" ${cur ? '' : 'selected'}>كالخزانة (${all})</option>
    <option value="real" ${cur === 'real' ? 'selected' : ''}>كعب الغلاف كما يُطبع</option>
    <option value="leather" ${cur === 'leather' ? 'selected' : ''}>الكعب الجلدي الافتراضي</option></select></label>`;
}
/** موضع الكتاب في رفّه، وأزرار تقديمه وتأخيره */
function ordHtml(b) {
  const g = groupOfBook(b);
  const n = g.books.length;
  const i = g.books.indexOf(b);
  if (n < 2) return '';
  const where = g.name ? ` في «${esc(g.name)}»` : '';
  return `<div class="ord"><span>في الرف</span><span class="ord-row">
    <button type="button" class="tl" data-act="ord-first" ${i === 0 ? 'disabled' : ''} title="إلى أقصى اليمين: أول الرف (Alt+Home)">⇥</button>
    <button type="button" class="tl" data-act="ord-prev" ${i === 0 ? 'disabled' : ''} title="قدّمه كتاباً واحداً إلى اليمين (Alt+→)">→</button>
    <b class="ord-pos" title="موضعه من اليمين">${ar(i + 1)} من ${ar(n)}${where}</b>
    <button type="button" class="tl" data-act="ord-next" ${i === n - 1 ? 'disabled' : ''} title="أخّره كتاباً واحداً إلى اليسار (Alt+←)">←</button>
    <button type="button" class="tl" data-act="ord-last" ${i === n - 1 ? 'disabled' : ''} title="إلى آخر الرف: أقصى اليسار (Alt+End)">⇤</button>
  </span><small>أو اسحب كعبه إلى أي مكانٍ بين الكتب</small></div>`;
}
function closePanel() {
  $('#panel').hidden = true;
  panelId = null;
  selected = null;
  for (const x of $$('#case .spine.on')) x.classList.remove('on');
}
document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#panel').hidden && closePanel());
$('#panel').addEventListener('change', (e) => {
  if (e.target.matches('[data-spine]') && panelId) return void moveBook(panelId, { spine: e.target.value.trim() });
  if (e.target.matches('[data-look]') && panelId) return void moveBook(panelId, { spineLook: e.target.value });
  const sel = e.target.closest('[data-place]');
  if (!sel || !panelId) return;
  moveBook(panelId, sel.dataset.place === 'cabinet' ? { cabinet: sel.value, group: '' } : { group: sel.value });
});
$('#panel').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-spine]')) {
    e.preventDefault();
    e.target.blur();
  }
});
// الاسم على الكعب يتغيّر في الرف وأنت تكتب
$('#panel').addEventListener('input', (e) => {
  if (!e.target.matches('[data-spine]') || !panelId) return;
  const b = books.find((x) => x.id === panelId);
  const name = e.target.value.trim() || (b && b.title) || '';
  for (const sp of $$(`#case .spine[data-book="${CSS.escape(panelId)}"] .lab span`)) sp.dataset.fit = name;
  fitSpines($('#case'));
});
$('#panel').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const b = books.find((x) => x.id === panelId);
  if (!b) return;
  const v = btn.dataset.i != null ? b.volumes[+btn.dataset.i] : null;
  try {
    switch (btn.dataset.act) {
      case 'close':
        return closePanel();
      case 'ord-first':
      case 'ord-prev':
      case 'ord-next':
      case 'ord-last':
        return await stepBook(b.id, btn.dataset.act.slice(4));
      case 'spine-reset':
        return await moveBook(b.id, { spine: '' });
      case 'nbopen':
        closePanel();
        return await shell.openNotebook(b.nb);
      case 'read': {
        const bytes = await desk.readFile(v.pdf);
        const name = v.pdf.split(/[\\/]/).pop();
        await shell.openOnRahl(new File([bytes], name, { type: 'application/pdf' }), looksOf(b, v));
        return closePanel();
      }
      case 'pdf':
        return await desk.openPath(v.pdf);
      case 'docx':
        return await desk.openPath(v.docx);
      case 'waraq':
        closePanel();
        return await shell.openInEditor(b.waraq);
      case 'folder':
        return await desk.showFolder(b.dir);
      case 'again': {
        const w = await shell.go('bench');
        if (w && w.WarraqBench) {
          closePanel();
          await w.WarraqBench.restore(b.project);
        }
        return;
      }
      case 'queue':
        if (window.top.WarraqScribes.add(b.project)) toast(`أُرسل «${b.title}» إلى النسّاخ`);
        return closePanel();
      case 'remove':
        await desk.libraryRemove(b.id);
        closePanel();
        toast(b.nb ? `أُزيل الدفتر «${b.title}» من الخزانة، وبقي على رفّ الرَّحل` : `أُزيل «${b.title}» من الخزانة، وملفاته باقية في مجلدها`, 4200);
        return loadBooks();
    }
  } catch (err) {
    toast('تعذّر: ' + (err && err.message ? err.message : err), 5000);
  }
});

/* ------------------------------------------------------------------ الأدوات */
$('#q').addEventListener('input', (e) => {
  filter = e.target.value.trim();
  renderShelves();
});
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q.length < 2 || !shell) return;
  const w = await shell.go('bench');
  if (w && w.WarraqBench) w.WarraqBench.search(q);
});
$('#newBtn').addEventListener('click', () => shell && shell.newBook());
// Ctrl+K: البحث · Ctrl+N: كتاب جديد (والقائمة تحملهما أيضاً)
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'k' && !(shell && shell.palette)) {
    e.preventDefault();
    $('#q').focus();
    $('#q').select();
  }
});
$('#outDirBtn').addEventListener('click', async () => {
  if (!desk) return;
  const i = await desk.info();
  desk.showFolder(i.outDir).catch((err) => toast('تعذّر فتح المجلد: ' + err.message));
});

window.WarraqKhizana = {
  /** القلم: لوحة كتاب من الخزانة */
  open: (id) => (books.length ? Promise.resolve() : loadBooks()).then(() => openPanel(id)),
  /** تغيّر ما على المنضدة أو طابور النسّاخ */
  desk: renderDesk,
  /** تغيّرت الخزانة نفسها (أو ترتيبها من الإعدادات) */
  books: loadBooks,
};
renderDesk();
loadBooks();
