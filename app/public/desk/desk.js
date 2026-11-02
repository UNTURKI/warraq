// هيكل البرنامج: الأبواب الخمسة في إطارات تبقى حية، وشريط الحالة، وأوامر قائمة البرنامج.
// كل باب صفحةٌ من صفحات ورّاق كما هي؛ والهيكل يصل بينها: window.WarraqShell (تراه الصفحات في window.top).
import { initLesson } from '/desk/lesson.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const desk = window.warraqDesktop || null;

/** الأبواب: اسمها وصفحتها */
export const DOORS = {
  khizana: { url: '/khizana/', name: 'الخزانة' },
  bench: { url: '/app/', name: 'المِنضدة' },
  muharrir: { url: '/muharrir/', name: 'المحرِّر' },
  rahl: { url: '/rahl/', name: 'الرَّحل' },
  styles: { url: '/studio/', name: 'الأساليب' },
  covers: { url: '/admin/covers/', name: 'المجلِّد' },
  tiraz: { url: '/tiraz/', name: 'الطِّراز' },
};
const doorOfPath = (p) => Object.keys(DOORS).find((k) => DOORS[k].url === p) || null;

const frames = new Map(); // الباب ← { el, ready }
let current = null;

/** إطار الباب (يُنشأ أول مرة يُطلب) ← وعدٌ بنافذته حين تتم */
function frame(door) {
  let f = frames.get(door);
  if (f) return f;
  const el = document.createElement('iframe');
  el.title = DOORS[door].name;
  el.dataset.door = door;
  el.hidden = true;
  const ready = new Promise((resolve) => el.addEventListener('load', () => resolve(el.contentWindow), { once: true }));
  el.src = DOORS[door].url;
  $('#doors').appendChild(el);
  f = { el, ready };
  frames.set(door, f);
  return f;
}

/** فتح باب: يظهر إطاره، ويُعلَّم زرّه ← نافذة صفحته */
function go(door) {
  if (!DOORS[door]) return Promise.resolve(null);
  const f = frame(door);
  for (const [d, x] of frames) x.el.hidden = d !== door;
  for (const b of $$('.side .door[data-door]')) {
    if (b.dataset.door === door) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const from = current;
  current = door;
  try {
    localStorage.setItem('warraq.door', door);
  } catch {}
  titlebar();
  if (shell.lesson) shell.lesson.door(door);
  // العودة إلى المنضدة: ما عُدّل في «الأساليب» يظهر فيها
  if (door === 'bench' && from && from !== 'bench') f.ready.then((w) => w && w.WarraqBench && w.WarraqBench.refreshStyles && w.WarraqBench.refreshStyles());
  // المحرِّر: الكتاب الذي على المنضدة الآن (وما غُيّر فيه من غير المحرِّر)
  if (door === 'muharrir' && from !== 'muharrir') f.ready.then((w) => w && w.WarraqEditor && w.WarraqEditor.refresh());
  f.el.focus({ preventScroll: true });
  // للمودات («الطِّراز»): الباب تغيّر
  if (from !== door) window.dispatchEvent(new CustomEvent('warraq:door', { detail: { door, from } }));
  return f.ready;
}
const win = (door) => (frames.has(door) ? frames.get(door).ready : Promise.resolve(null));

/* ------------------------------------------------------------------ حال المنضدة: شريط الحالة وعنوان النافذة وأيقونة شريط المهام */
let benchInfo = null;
function setBench(info) {
  const justDone = !!(benchInfo && benchInfo.running && info && info.done);
  // (إشعار التمام يرسله الإخراج نفسه بعد أن يُسجَّل الكتاب في الخزانة، ومعه زرّا المجلد والرَّحل)
  // متى وُضع الكتاب على المنضدة (لبطاقته في الخزانة)
  if (info && info.title) info.at = benchInfo && benchInfo.id === info.id && benchInfo.at ? benchInfo.at : Date.now();
  const prevId = benchInfo && benchInfo.id;
  benchInfo = info || null;
  // كتابٌ آخر على المنضدة والمحرِّر مفتوح: يُفتح فيه
  if ((info && info.id) !== prevId && current === 'muharrir') win('muharrir').then((w) => w && w.WarraqEditor && w.WarraqEditor.refresh());
  const el = $('#stBench');
  const b = benchInfo;
  $('.side .door[data-door="bench"] .busy').hidden = !(b && b.running);
  if (!b || !b.title) {
    el.textContent = 'المنضدة فارغة';
  } else {
    const pct = b.running ? Math.max(0, Math.min(100, b.pct || 0)) : null;
    const vols = b.volumes > 1 ? (b.volumes === 2 ? 'مجلدان' : `${ar(b.volumes)} ${b.volumes <= 10 ? 'مجلدات' : 'مجلداً'}`) : 'مجلد واحد';
    el.innerHTML = `<b></b> · ${vols}${b.running ? ` · ${escapeHtml(b.stage || 'يعمل')} <span class="bar"><i style="width:${pct}%"></i></span>${ar(pct)}٪` : b.done ? ' · تمّ إخراجه' : ''}`;
    el.querySelector('b').textContent = b.title;
  }
  titlebar();
  document.title = b && b.title ? `${b.title} — ورّاق` : 'ورّاق';
  // شريط المهام: التقدّم، والأيقونة بمرحلة الإخراج، ثم التمام
  if (desk && desk.progress) desk.progress(b && b.running ? { pct: b.pct || 0, title: b.title, phase: b.phase || 1 } : justDone ? { done: true, title: b.title } : null);
  notifyKhizana();
  window.dispatchEvent(new CustomEvent('warraq:bench', { detail: benchInfo ? { ...benchInfo } : null }));
}
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** الخزانة تعرض ما على المنضدة وطابور النسّاخ وما أُخرج: تُخبَر بكل تغيّر (what: desk | books) */
function notifyKhizana(what = 'desk') {
  const f = frames.get('khizana');
  if (!f) return;
  f.ready.then((w) => w && w.WarraqKhizana && w.WarraqKhizana[what] && w.WarraqKhizana[what]());
}

/* ------------------------------------------------------------------ الاتصال */
/* ------------------------------------------------------------------ شريط العنوان: ورّاق · الباب (أو الكتاب على المنضدة) · محفوظ */
function titlebar() {
  const b = benchInfo;
  const onBench = current === 'bench';
  $('#tbCtx').textContent = onBench && b && b.title ? b.title : current ? DOORS[current].name : '';
  const saved = $('#tbSaved');
  saved.hidden = !(onBench && b && b.title);
  saved.textContent = b && b.running ? 'يعمل' : 'محفوظ';
}
// أزرار النافذة (يرسمها ويندوز) بلون الشريط: تتبع السِّراج
const syncChrome = () => desk && desk.titlebar && desk.titlebar(document.documentElement.classList.contains('night'));
new MutationObserver(syncChrome).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
$('#menuBtn').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (desk && desk.menu) desk.menu(Math.round(r.left), Math.round(r.bottom));
});

function net() {
  const on = navigator.onLine;
  $('#stNet').classList.toggle('off', !on);
  $('#stNet b').textContent = on ? 'متصل بـ«تراث»' : 'غير متصل';
  $('#stNet').title = on ? 'متصل بالإنترنت: الجلب من «تراث» متاح' : 'لا اتصال: كتب «وَرَق» وملفات Word و PDF من جهازك تعمل، والجلب من «تراث» يحتاج اتصالاً';
}
window.addEventListener('online', net);
window.addEventListener('offline', net);

/* ------------------------------------------------------------------ واجهة الهيكل للصفحات */
const shell = {
  go,
  /** الباب المفتوح الآن */
  currentDoor: () => current,
  win,
  /** نافذة باب دون فتحه (يُنشأ إطاره خفياً إن لم يكن) */
  frameOf: (door) => (DOORS[door] ? frame(door).ready : Promise.resolve(null)),
  get door() {
    return current;
  },
  doorOfPath,
  /** الأبواب: [{ id, name }] */
  doors: () => Object.entries(DOORS).map(([id, d]) => ({ id, name: d.name })),
  /** أوامرٌ تُضاف إلى «القلم» (Ctrl+K)، من المودات مثلاً: add({ t, h, k, run }) ← دالة تزيله */
  commands: (() => {
    const list = [];
    return {
      add(c) {
        list.push(c);
        return () => {
          const i = list.indexOf(c);
          if (i >= 0) list.splice(i, 1);
        };
      },
      list: () => list.slice(),
    };
  })(),
  /** المنضدة تخبر بحالها */
  bench: setBench,
  benchInfo: () => benchInfo,
  /** كتاب جديد على المنضدة */
  async newBook() {
    const w = await go('bench');
    if (w && w.WarraqBench) w.WarraqBench.reset();
  },
  /** فتح ملفات على المنضدة (Word/PDF) أو مشروع */
  async openOnBench(job) {
    const w = await go('bench');
    if (w && w.WarraqBench) return w.WarraqBench.open(job);
  },
  /** كتاب «وَرَق» في المحرِّر: يوضع على المنضدة من ملفه (إن لم يكن عليها)، ثم يُفتح المحرِّر */
  async openInEditor(path) {
    const w = await win('bench');
    if (!w || !w.WarraqBench) return;
    const cur = w.WarraqBench.editor && w.WarraqBench.editor.info();
    if (!(cur && cur.file && cur.file === path)) await w.WarraqBench.open({ paths: [path] });
    return go('muharrir');
  },
  /** ملف PDF على الرَّحل (meta.waraq: ملف «وَرَق» الكتاب إن عُرف) */
  async openOnRahl(file, meta) {
    const w = await go('rahl');
    if (w && w.WarraqRahl) return w.WarraqRahl.open(file, meta);
  },
  /**
   * كتاب «وَرَق» على الرَّحل: إن كان قد أُخرج (في الخزانة بملف PDF) وُضع مجلده الأول في الحال،
   * وإلا نضّده النسّاخ في الخلفية PDF ثم وضعه على الرَّحل.
   */
  async waraqOnRahl(path) {
    const norm = (p) => String(p || '').replace(/\//g, '\\').toLowerCase();
    const list = desk && desk.library ? await desk.library().catch(() => []) : [];
    const rec = list.find((b) => b.waraq && norm(b.waraq) === norm(path) && b.volumes.some((v) => v.pdfExists));
    if (rec) {
      const v = rec.volumes.find((x) => x.pdfExists);
      const bytes = await desk.readFile(v.pdf);
      return shell.openOnRahl(new File([bytes], v.pdf.split(/[\\/]/).pop(), { type: 'application/pdf' }), { waraq: path, ...(rec.backImg ? { back: rec.backImg } : {}), ...(v.spineImg ? { spine: v.spineImg } : {}), ...(rec.color ? { cloth: rec.color } : {}) });
    }
    const w = await go('rahl');
    if (!window.WarraqScribes) return;
    window.WarraqScribes.addFiles([path], { rahl: true });
    const name = path.split(/[\\/]/).pop().replace(/\.(waraq|warraq)$/i, '');
    if (w && w.WarraqRahl && w.WarraqRahl.note) w.WarraqRahl.note(`«${name}» يُنضَّد الآن عند النسّاخ (PDF)، ثم يوضع على الرَّحل وحده.`);
  },
  /** دفترٌ من الخزانة على الرَّحل (صفحاته وما كُتب فيها في رفّ الرَّحل) */
  async openNotebook(id) {
    const w = await go('rahl');
    if (w && w.WarraqRahl && w.WarraqRahl.openNotebook) return w.WarraqRahl.openNotebook(id);
  },
  /** تغيّرت الخزانة (كتاب أُخرج، أو حُذف) */
  libraryChanged: () => notifyKhizana('books'),
  /** يُستدعى من الصفحات حين يتغير طابور النسّاخ */
  scribesChanged: () => {
    renderScribes();
    notifyKhizana();
  },
};
window.WarraqShell = shell;
// «مجلس الدرس»: بجانب الكتاب على الرَّحل
shell.lesson = initLesson(shell);

/* ------------------------------------------------------------------ النسّاخ: شريط الحالة (والطابور نفسه في scribes.js) */
function renderScribes() {
  const q = window.WarraqScribes ? window.WarraqScribes.list() : [];
  const el = $('#stScribes');
  if (!q.length) return void (el.textContent = 'النسّاخ: لا عمل');
  const cur = q.find((j) => j.state === 'running');
  el.innerHTML = cur ? `النسّاخ: <b></b> <span class="bar"><i style="width:${Math.round(cur.pct || 0)}%"></i></span>${ar(Math.round(cur.pct || 0))}٪${q.length > 1 ? ` · ${ar(q.length - 1)} في الطابور` : ''}` : `النسّاخ: ${ar(q.length)} في الطابور`;
  if (cur) el.querySelector('b').textContent = cur.title;
}

/* ------------------------------------------------------------------ الأزرار وأوامر القائمة */
$('.side').addEventListener('click', (e) => {
  const b = e.target.closest('.door[data-door]');
  if (b) go(b.dataset.door);
});
$('#settingsBtn').addEventListener('click', () => desk && desk.openWindow('settings'));
// «إصلاح»: البرنامج يسأل، ثم يُوقف ما يعمل ويعيد الواجهة من أولها (بلا مسّ المحفوظ)
$('#repairBtn').addEventListener('click', () => {
  if (desk && desk.repair) return desk.repair();
  // في المتصفح (بلا البرنامج): يكفي محو حال الجلسة وإعادة التحميل
  if (!confirm('أصلح الصفحة؟ يُوقف ما يعمل ويُعيد تحميلها من أولها.')) return;
  try {
    sessionStorage.clear();
  } catch {}
  location.reload();
});

/** أوامر قائمة البرنامج: تصل إلى الهيكل وحده، وهو يوجّهها */
function onMenu(cmd) {
  if (cmd === 'new-book') return shell.newBook();
  if (cmd.startsWith('door:')) {
    // باب، وموضع فيه بعد # (مثل styles#/print: إعدادات الطباعة في «الأساليب»)
    const [door, at] = cmd.slice(5).split('#');
    return go(door).then((w) => {
      if (w && at) w.location.hash = '#' + at;
      return w;
    });
  }
  if (cmd === 'feedback') return openFeedback();
  if (cmd === 'settings-changed') return refreshAll();
  if (cmd === 'onboard') return firstRun(true);
  if (cmd === 'palette') return shell.palette && shell.palette.open();
  if (cmd === 'lamp') return $('.side [data-lamp]').click();
  if (cmd === 'export') return go('bench').then((w) => w && w.WarraqBench && w.WarraqBench.exportBook());
  if (cmd === 'save-project') return win('bench').then((w) => w && w.WarraqBench && w.WarraqBench.saveAs());
}
/** المظهر تغيّر (الإعدادات، أو أول لقاء): يُعاد في الهيكل وأبوابه */
function refreshAll() {
  refreshLook(document);
  for (const f of frames.values()) f.ready.then((w) => w && refreshLook(w.document));
}
shell.refreshLook = refreshAll;
shell.firstRun = (force) => firstRun(force);
function refreshLook(doc) {
  for (const l of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const href = l.getAttribute('href') || '';
    if (/^\/api\/(theme|fonts)\.css/.test(href)) l.setAttribute('href', href.replace(/\?.*$/, '') + '?t=' + Date.now());
  }
}
function openFeedback() {
  const open = () => window.WarraqFeedback && window.WarraqFeedback.open && window.WarraqFeedback.open();
  if (window.WarraqFeedback && window.WarraqFeedback.open) return open();
  const sc = document.createElement('script');
  sc.src = '/js/feedback.js';
  sc.onload = open;
  document.head.appendChild(sc);
}
// الملاحظة يُرفق بها الكتاب الذي على المنضدة
window.WarraqFeedback = Object.assign(window.WarraqFeedback || {}, { book: () => (benchInfo && benchInfo.id ? { id: benchInfo.id, name: benchInfo.title } : null) });

/* ------------------------------------------------------------------ البدء */
net();
setBench(null);
syncChrome();
renderScribes();
if (desk) {
  desk.onMenu(onMenu);
  desk.info && desk.info().then((i) => i && ($('#stVer').textContent = 'الإصدار ' + i.version));
}
// المنضدة تُفتح من البدء (فيها الكتاب المحفوظ من الجلسة السابقة)، والخزانة أول ما يُرى
frame('bench');
let first = 'khizana';
try {
  const q = new URLSearchParams(location.search).get('door');
  if (q && DOORS[q]) first = q;
} catch {}
go(first);
const { initScribes } = await import('/desk/scribes.js');
initScribes(shell, renderScribes);
// أول لقاء (مرة واحدة)، ومن «مساعدة ← جولة البداية»
async function firstRun(force = false) {
  const { onboard } = await import('/desk/onboard.js');
  const r = await onboard(shell, { force });
  if (r && r.tryBook) {
    const w = await go('bench');
    if (w && w.WarraqBench) w.WarraqBench.search(r.tryBook);
  }
}
firstRun();
// ملفات يطلب البرنامج فتحها (من مستكشف الملفات، أو «فتح» Ctrl+O، أو سحبها على الأيقونة)
if (desk && desk.onOpen) desk.onOpen((job) => routeOpen(job));
if (desk && desk.ready) desk.ready();

/** توجيه ملف إلى بابه: المشروع والكتاب إلى المنضدة، و PDF للقراءة إلى الرَّحل، و«إلى النسّاخ» إلى الطابور */
async function routeOpen(job) {
  if (!job) return;
  if (job.mode === 'rahl') {
    if (/\.(waraq|warraq)$/i.test(job.path || '')) return shell.waraqOnRahl(job.path);
    const bytes = await desk.readFile(job.path);
    return shell.openOnRahl(new File([bytes], job.name || 'كتاب.pdf', { type: 'application/pdf' }));
  }
  if (job.mode === 'queue' && window.WarraqScribes) return window.WarraqScribes.addFiles([job.path]);
  // مودٌ (‎.wqmod‎) فُتح من المستكشف: يُعرض في «الطِّراز» ليُثبَّت
  if (job.mode === 'mod') return go('tiraz').then((w) => w && w.WarraqTiraz && w.WarraqTiraz.inspect(job.path));
  return shell.openOnBench(job);
}
shell.routeOpen = routeOpen;
