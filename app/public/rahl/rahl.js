// الرَّحل: يُوضع عليه ملف PDF فيصير كتاباً يُقلَّب (قارئ ورّاق نفسه: book.js) ويُكتب عليه.
// الكتب تبقى في متصفح القارئ («رفّك» في IndexedDB) بملاحظاتها وموضع القراءة؛ لا يُرفع شيءٌ إلى الموقع.
import { getItem, setItem, delItem, allItems } from '/js/reader-store.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (s) => document.querySelector(s);
const size = (b) => (b >= 1024 ** 2 ? ar((b / 1024 ** 2).toFixed(1)) + ' م.ب' : ar(Math.max(1, Math.round(b / 1024))) + ' ك.ب');
const MAX_SHELF = 12;
// برنامج سطح المكتب: الهيكل (النسّاخ والمحرِّر) — ومنه يوضع كتاب «وَرَق» على الرَّحل
const DESK = window.warraqDesktop || null;
const shell = (() => {
  try {
    return window.top.WarraqShell || null;
  } catch {
    return null;
  }
})();
const lessonOf = () => (shell && shell.lesson) || null;
const isWaraq = (name) => /\.(waraq|warraq)$/i.test(String(name || ''));
if (DESK && shell) {
  $('#file').setAttribute('accept', 'application/pdf,.pdf,.waraq,.warraq');
  $('.rh-drop-s').textContent = 'اسحب ملف PDF أو كتاب «وَرَق» إلى هنا، أو انقر لتختاره';
}
// صورة الغلاف على الرفّ: بدقّة الشاشات الحادّة (البطاقة نحو ٢٨٠ نقطة طولاً، وعلى شاشة ×٢ أو ×٣)
const THUMB_H = 960;

let pdfjsP = null;
const loadPdfjs = () =>
  (pdfjsP ||= import('/vendor/pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return m;
  }));

/** صورة صفحة من الملف (للغلاف وللرفّ) */
async function pageImage(pdf, n, height, q = 0.88) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: height / v1.height });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c.toDataURL('image/jpeg', q);
}
const titleOf = (name) => String(name || 'كتاب').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();

/* ------------------------------------------------------------------ الرفّ */
async function shelf() {
  const items = await allItems('shelf');
  return items.map((x) => ({ id: x.key, ...x.value })).sort((a, b) => (b.opened || 0) - (a.opened || 0));
}
const isNb = (b) => b && b.kind === 'notebook';
const nbNotes = (id) => 'nb:' + id;
const SHELF_ICON = {
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
  ren: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  khz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M5 20V5h14v15M5 12.5h14M8 5v7.5M11 5v7.5M14.5 7l2 5.5M8 12.5V20M11.5 12.5V20M15 12.5V20"/></svg>',
};
/** دفاتر الرفّ التي في الخزانة (برنامج سطح المكتب) */
async function khizanaNbs() {
  if (!DESK || !DESK.library) return null;
  try {
    return new Set((await DESK.library()).filter((b) => b.nb).map((b) => b.nb));
  } catch {
    return null;
  }
}
async function renderShelf() {
  const list = await shelf();
  $('#shelfWrap').hidden = !list.length;
  const inKhz = list.some(isNb) ? await khizanaNbs() : null;
  const rows = await Promise.all(
    list.map(async (b) => {
      if (isNb(b)) return nbCard(b, inKhz);
      const notes = b.fp ? await getItem('notes', 'book:' + b.fp + ':' + b.N) : null;
      const n = notes && notes.anns ? notes.anns.length : 0;
      const last = notes && notes.last > 1 ? notes.last : 0;
      const pct = last && b.N ? Math.round((last / b.N) * 100) : 0;
      return `<li class="rh-bk" data-id="${esc(b.id)}">
        <button type="button" class="rh-cover" data-open title="افتح «${esc(b.title)}»"><img src="${b.thumb || ''}" alt="" loading="lazy"><i class="rh-progress" style="--p:${pct}%"></i></button>
        <div class="rh-meta">
          <b title="${esc(b.title)}">${esc(b.title)}</b>
          <small>${ar(b.N || 0)} صفحة · ${size(b.size || 0)}</small>
          <small>${last ? `وقفتَ عند ص ${ar(last)}` : 'لم تبدأ قراءته'}${n ? ` · ${ar(n)} ملاحظة` : ''}</small>
        </div>
        <div class="rh-act">
          <button type="button" class="btn small" data-open>${last ? 'تابع القراءة' : 'افتح'}</button>
          <button type="button" class="rh-del" data-del title="أزله من رفّك" aria-label="أزله من رفّك"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg></button>
        </div>
      </li>`;
    }),
  );
  $('#shelf').innerHTML = rows.join('');
  sharpen(list);
}
/** بطاقة الدفتر على الرفّ */
async function nbCard(b, inKhz) {
  const notes = await getItem('notes', nbNotes(b.id));
  const n = notes && notes.anns ? notes.anns.length : 0;
  const last = notes && notes.last > 1 ? notes.last : 0;
  const pages = (b.pages || []).length || 1;
  const khz = inKhz ? inKhz.has(b.id) : null;
  return `<li class="rh-bk nb" data-id="${esc(b.id)}">
    <button type="button" class="rh-cover" data-open title="افتح «${esc(b.title)}»"><img src="${b.thumb || ''}" alt="" loading="lazy"></button>
    <div class="rh-meta">
      <b title="${esc(b.title)}">${esc(b.title)}</b>
      <small>دفتر · ${pagesLabel(pages)}</small>
      <small>${n ? `${ar(n)} ${n === 1 ? 'كتابة' : 'كتابات'}` : 'لم تكتب فيه بعد'}${last ? ` · آخر ما فتحتَ ص ${ar(last)}` : ''}</small>
    </div>
    <div class="rh-act">
      <button type="button" class="btn small" data-open>${n ? 'تابع الكتابة' : 'افتح'}</button>
      <button type="button" class="rh-del" data-ren title="أعد تسميته" aria-label="أعد تسميته">${SHELF_ICON.ren}</button>
      ${khz === null ? '' : `<button type="button" class="rh-del rh-khz${khz ? ' on' : ''}" data-khz title="${khz ? 'في الخزانة (انقر لتزيله منها)' : 'ضعه في الخزانة'}" aria-label="${khz ? 'في الخزانة' : 'ضعه في الخزانة'}" aria-pressed="${khz}">${SHELF_ICON.khz}</button>`}
      <button type="button" class="rh-del" data-del title="احذف الدفتر" aria-label="احذف الدفتر">${SHELF_ICON.del}</button>
    </div>
  </li>`;
}
/** أغلفة الكتب التي وُضعت قبلُ بدقة منخفضة: تُعاد رسمها بدقة عالية مرة واحدة (في الخلفية، كتاباً كتاباً) */
let sharpening = false;
async function sharpen(list) {
  if (sharpening) return;
  const old = list.filter((b) => b.blob && (b.thumbH || 0) < THUMB_H);
  if (!old.length) return;
  sharpening = true;
  try {
    const pdfjs = await loadPdfjs();
    for (const b of old) {
      try {
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await b.blob.arrayBuffer()), isEvalSupported: false }).promise;
        const thumb = await pageImage(pdf, 1, THUMB_H, 0.9);
        pdf.destroy();
        const { id, ...rec } = b;
        await setItem('shelf', id, { ...rec, thumb, thumbH: THUMB_H });
        const img = document.querySelector(`.rh-bk[data-id="${CSS.escape(id)}"] .rh-cover img`);
        if (img) img.src = thumb;
      } catch {}
    }
  } finally {
    sharpening = false;
  }
}
$('#shelf').addEventListener('click', async (e) => {
  const li = e.target.closest('.rh-bk');
  if (!li) return;
  const id = li.dataset.id;
  const rec = await getItem('shelf', id);
  if (isNb(rec)) {
    if (e.target.closest('[data-del]')) {
      if (!confirm(`يُحذف الدفتر «${rec.title}» وكل ما كتبتَه فيه، ولا يُستعاد. أتحذفه؟`)) return;
      await delItem('shelf', id);
      await delItem('notes', nbNotes(id)).catch(() => {});
      await khizanaRemove(id);
      return renderShelf();
    }
    if (e.target.closest('[data-ren]')) {
      const v = prompt('اسم الدفتر:', rec.title);
      if (!v || !v.trim() || v.trim() === rec.title) return;
      const NB = await nbMod();
      rec.title = v.trim().slice(0, 80);
      rec.thumb = await smaller(await NB.coverImage({ title: rec.title, color: rec.color, size: NB.SIZES[rec.size] || NB.SIZES.a5 }), 520);
      await setItem('shelf', id, rec);
      await khizanaPut(id, rec);
      return renderShelf();
    }
    if (e.target.closest('[data-khz]')) {
      const on = e.target.closest('[data-khz]').getAttribute('aria-pressed') === 'true';
      if (on) await khizanaRemove(id);
      else await khizanaPut(id, rec, true);
      note(on ? `أُزيل «${rec.title}» من الخزانة، وبقي على رفّك هنا.` : `وُضع «${rec.title}» في الخزانة.`);
      return renderShelf();
    }
    if (e.target.closest('[data-open]')) openNotebook(id);
    return;
  }
  if (e.target.closest('[data-del]')) {
    const b = rec;
    if (!confirm(`تُزيل «${b ? b.title : 'الكتاب'}» من رفّك؟ (تبقى ملاحظاته إن وضعته مرة أخرى)`)) return;
    await delItem('shelf', id);
    return renderShelf();
  }
  if (e.target.closest('[data-open]')) {
    const b = rec;
    if (b && b.blob) openShelfBook(id, b);
  }
});

/* ------------------------------------------------------------------ الكتاب على الرَّحل */
let opening = false;
/** سطرٌ تحت الرَّحل: خبرٌ (note) أو خطأ */
function note(msg, isErr = false) {
  const err = $('#err');
  err.textContent = msg;
  err.classList.toggle('note', !isErr);
  err.hidden = !msg;
}
/** كتاب «وَرَق»: يُنضَّد PDF (أو يُؤخذ ما أُخرج منه) ثم يوضع على الرَّحل — في البرنامج */
function addWaraq(file) {
  const path = file.__path || (DESK && DESK.pathOf ? (() => { try { return DESK.pathOf(file); } catch { return ''; } })() : '');
  if (!DESK || !shell || !shell.waraqOnRahl || !path) return note('ملف «وَرَق» يوضع على الرَّحل في برنامج ورّاق: افتحه فيه (أو أخرجه PDF ثم ضعه هنا).', true);
  note('');
  return shell.waraqOnRahl(path);
}
async function addFile(file, from = {}) {
  if (opening) return;
  const err = $('#err');
  err.hidden = true;
  if (!file) return;
  if (isWaraq(file.name)) return addWaraq(file);
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    return note(DESK && shell ? 'الرَّحل يقبل ملفات PDF وكتب «وَرَق». (ولإخراج كتابٍ من ملف Word ضعه على المنضدة).' : 'الرَّحل يقبل ملفات PDF. (ولإخراج كتابٍ من ملف Word استعمل «ابدأ إخراج كتاب»).', true);
  }
  busy(true);
  try {
    const pdfjs = await loadPdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const coverFirst = $('#coverFirst').checked && pdf.numPages > 1;
    let meta = null;
    try {
      meta = await pdf.getMetadata();
    } catch {}
    const metaTitle = meta && meta.info && meta.info.Title && !/^untitled|microsoft word/i.test(meta.info.Title) ? meta.info.Title : '';
    const rec = {
      name: file.name,
      title: (from && from.title) || titleOf(metaTitle || file.name),
      size: file.size,
      pages: pdf.numPages,
      N: pdf.numPages - (coverFirst ? 1 : 0),
      fp: (pdf.fingerprints && pdf.fingerprints[0]) || '',
      coverFirst,
      thumb: await pageImage(pdf, 1, THUMB_H, 0.9),
      thumbH: THUMB_H,
      added: Date.now(),
      opened: Date.now(),
      blob: new Blob([bytes], { type: 'application/pdf' }),
    };
    pdf.destroy();
    const id = (rec.fp || file.name) + ':' + (coverFirst ? 1 : 0);
    const old = await getItem('shelf', id);
    if (old) rec.added = old.added || rec.added;
    // ملف «وَرَق» الكتاب (من الخزانة أو النسّاخ): يبقى مع الكتاب على الرفّ
    const wq = (from && from.waraq) || (old && old.waraq) || '';
    if (wq) rec.waraq = wq;
    // الغلاف الخلفي والكعب ولون الجلد كما اختيرت للكتاب (من الخزانة)، وإلا فالشكل الافتراضي
    for (const k of ['back', 'spine', 'cloth']) {
      const v = (from && from[k]) || (old && old[k]) || '';
      if (v) rec[k] = v;
    }
    try {
      await setItem('shelf', id, rec);
      // لا يزيد الرفّ على اثني عشر كتاباً: يُزال أقدمها فتحاً
      // (والدفاتر لا تُزال: ما كُتب فيها لا نسخة له غيرها)
      const list = (await shelf()).filter((b) => !isNb(b));
      for (const b of list.slice(MAX_SHELF)) await delItem('shelf', b.id);
    } catch {}
    await openShelfBook(id, rec);
  } catch (e) {
    err.textContent = 'تعذّر فتح الملف: ' + (e && e.message ? e.message : e);
    err.hidden = false;
  } finally {
    busy(false);
  }
}
async function openShelfBook(id, rec) {
  if (opening) return;
  opening = true;
  busy(true);
  try {
    rec.opened = Date.now();
    setItem('shelf', id, rec).catch(() => {});
    let outer = '';
    if (rec.coverFirst) {
      const pdfjs = await loadPdfjs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await rec.blob.arrayBuffer()), isEvalSupported: false }).promise;
      outer = await pageImage(pdf, 1, Math.min(1800, Math.round(window.innerHeight * 1.6 * Math.min(2, window.devicePixelRatio || 1))), 0.9);
      pdf.destroy();
    }
    const { openBook } = await import('/js/book.js');
    await openBook({
      blob: rec.blob,
      outer,
      back: rec.back || '',
      spine: rec.spine || '',
      ...(rec.cloth ? { cloth: rec.cloth } : {}),
      title: rec.title,
      fileName: rec.title,
      fallbackColor: '#6B1D2F',
      waraq: waraqItem(id, rec),
      // «مجلس الدرس» (في البرنامج): الدرس بجانب الكتاب، ويُحفظ معه
      ...(lessonOf() ? { lesson: () => lessonOf().toggle(), lessonOpen: () => lessonOf().isOpen, lessonKey: (e) => lessonOf().key(e), onTheme: (p) => lessonOf().theme(p), clip: () => lessonOf().clip } : {}),
      onClose: () => {
        if (lessonOf()) lessonOf().book(null);
        renderShelf();
      },
    });
    if (lessonOf()) lessonOf().book({ id, title: rec.title });
  } catch (e) {
    $('#err').textContent = 'تعذّر فتح الكتاب: ' + (e && e.message ? e.message : e);
    $('#err').hidden = false;
  } finally {
    opening = false;
    busy(false);
  }
}
/**
 * «وَرَق» في قائمة التنزيل (مع PDF): الكتاب بصيغة ورّاق إن عُرف ملفه فيُفتح في المحرِّر،
 * وإلا «حوّله إلى وَرَق»: يُقرأ الكتاب كما يُقرأ على المنضدة ويُحفظ في مجلد الكتب (في البرنامج وحده).
 */
function waraqItem(id, rec) {
  if (!DESK || !shell) return null;
  if (rec.waraq)
    return {
      label: 'الكتاب بصيغة «وَرَق»',
      sub: 'افتحه في المحرِّر: يُحرَّر ويُخرج منه',
      run: () => shell.openInEditor(rec.waraq),
    };
  const scribes = window.top.WarraqScribes;
  if (!scribes || !scribes.toWaraq) return null;
  return {
    label: 'حوّله إلى كتاب «وَرَق»',
    sub: 'يُقرأ نصه وبنيته ويُحفظ في مجلد الكتب',
    async run(say) {
      say('يُقرأ الكتاب ويُصنع منه كتاب «وَرَق»… (قد يأخذ دقيقة)', 60000);
      try {
        const r = await scribes.toWaraq(new File([rec.blob], (rec.title || 'كتاب') + '.pdf', { type: 'application/pdf' }));
        rec.waraq = r.path;
        await setItem('shelf', id, rec).catch(() => {});
        say(`صُنع «${r.title}» كتابَ «وَرَق» وحُفظ في مجلد الكتب`, 6000, { label: 'افتحه في المحرِّر', run: () => shell.openInEditor(r.path) });
        return { label: 'الكتاب بصيغة «وَرَق»', sub: 'افتحه في المحرِّر: يُحرَّر ويُخرج منه', run: () => shell.openInEditor(r.path) };
      } catch (e) {
        say('تعذّر صنع كتاب «وَرَق»: ' + (e && e.message ? e.message : e), 6000);
      }
    },
  };
}
/* ------------------------------------------------------------------ الدفتر */
let NBm = null;
const nbMod = () => (NBm ||= import('/js/notebook.js'));
const pagesLabel = (n) => (n === 1 ? 'صفحة واحدة' : n === 2 ? 'صفحتان' : n % 100 >= 3 && n % 100 <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`);
const MAX_NB_PAGES = 600;
const newNbId = () => 'nb-' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
/** صورةٌ أصغر (للرفّ والخزانة) */
async function smaller(dataUrl, w) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round((img.naturalHeight * w) / img.naturalWidth);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}
/** الدفتر في الخزانة: يُضاف (put) أو يُحدَّث سجله إن كان فيها */
async function khizanaPut(id, rec, add = false) {
  if (!DESK || !DESK.libraryAdd) return false;
  try {
    if (!add) {
      const inK = await khizanaNbs();
      if (!inK || !inK.has(id)) return false;
    }
    await DESK.libraryAdd({ title: rec.title, color: rec.color, thumb: rec.thumb, nb: id, nbPages: (rec.pages || []).length || 1, subject: { id: 'nb', name: 'دفاتري' } });
    if (shell && shell.libraryChanged) shell.libraryChanged();
    return true;
  } catch {
    return false;
  }
}
async function khizanaRemove(id) {
  if (!DESK || !DESK.library || !DESK.libraryRemove) return;
  try {
    for (const b of await DESK.library()) if (b.nb === id) await DESK.libraryRemove(b.id);
    if (shell && shell.libraryChanged) shell.libraryChanged();
  } catch {}
}
/** دفترٌ جديد: اسمه، وقالب صفحته الأولى، ومقاسه، وورقه، ولون غلافه */
const nbDlg = { tpl: 'ruled', size: 'a5', paper: 'ivory', color: '' };
async function newNotebook() {
  const NB = await nbMod();
  const dlg = $('#nbDlg');
  const list = (await shelf()).filter(isNb);
  const used = new Set(list.map((b) => b.title));
  let name = 'دفتري';
  for (let k = 2; used.has(name); k++) name = 'دفتري ' + ar(k);
  $('#nbName').value = name;
  if (!nbDlg.color) nbDlg.color = NB.COVERS[list.length % NB.COVERS.length];
  $('#nbTpls').innerHTML = NB.TEMPLATES.map((t) => `<button type="button" role="radio" data-tpl="${t.id}" title="${esc(t.hint)}"><canvas width="66" height="93"></canvas><small>${esc(t.name)}</small></button>`).join('');
  $('#nbSize').innerHTML = Object.entries(NB.SIZES).map(([k, v]) => `<button type="button" role="radio" data-size="${k}" title="${esc(v.hint)}"><b>${esc(v.name)}</b><small>${esc(v.hint)}</small></button>`).join('');
  $('#nbPaper').innerHTML = Object.entries(NB.PAPERS).map(([k, v]) => `<button type="button" role="radio" data-paper="${k}"><i style="background:${v.bg}"></i><b>${esc(v.name)}</b></button>`).join('');
  $('#nbColor').innerHTML = NB.COVERS.map((c) => `<button type="button" role="radio" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('');
  $('#nbKhzRow').hidden = !(DESK && DESK.libraryAdd);
  nbPaint(NB, true);
  dlg.showModal();
  $('#nbName').select();
}
let nbCoverT = 0;
function nbPaint(NB, all = false) {
  const size = NB.SIZES[nbDlg.size], paper = NB.PAPERS[nbDlg.paper];
  const ratio = size.h / size.w;
  for (const b of $('#nbTpls').children) {
    b.setAttribute('aria-checked', String(b.dataset.tpl === nbDlg.tpl));
    if (all) {
      const cv = b.querySelector('canvas');
      cv.height = Math.round(cv.width * ratio);
      NB.thumb(cv, b.dataset.tpl, size, paper);
    }
  }
  for (const b of $('#nbSize').children) b.setAttribute('aria-checked', String(b.dataset.size === nbDlg.size));
  for (const b of $('#nbPaper').children) b.setAttribute('aria-checked', String(b.dataset.paper === nbDlg.paper));
  for (const b of $('#nbColor').children) b.setAttribute('aria-checked', String(b.dataset.color === nbDlg.color));
  const t = NB.TEMPLATES.find((x) => x.id === nbDlg.tpl);
  $('#nbTplHint').textContent = t ? t.hint : '';
  const pg = $('.nbd-page');
  pg.height = Math.round(pg.width * ratio);
  NB.thumb(pg, nbDlg.tpl, size, paper);
  // الغلاف (بعد سكون الكتابة في الاسم)
  clearTimeout(nbCoverT);
  nbCoverT = setTimeout(async () => {
    const cv = $('.nbd-cover');
    cv.height = Math.round(cv.width * ratio);
    const img = new Image();
    img.src = await NB.coverImage({ title: $('#nbName').value.trim() || 'دفتري', color: nbDlg.color, size });
    await img.decode();
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  }, 120);
}
$('#nbNew').addEventListener('click', () => newNotebook());
$('#nbDlg').addEventListener('click', async (e) => {
  const NB = await nbMod();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.nbd === 'cancel') return $('#nbDlg').close();
  if (b.dataset.tpl) nbDlg.tpl = b.dataset.tpl;
  else if (b.dataset.size) nbDlg.size = b.dataset.size;
  else if (b.dataset.paper) nbDlg.paper = b.dataset.paper;
  else if (b.dataset.color) nbDlg.color = b.dataset.color;
  else return;
  nbPaint(NB, !!(b.dataset.size || b.dataset.paper));
});
// الأسهم بين خيارات المجموعة الواحدة
$('#nbDlg').addEventListener('keydown', (e) => {
  const b = e.target.closest('[role="radio"]');
  if (!b || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const sibs = [...b.parentElement.children];
  const k = sibs.indexOf(b) + (e.key === 'ArrowLeft' ? 1 : -1);
  const n = sibs[(k + sibs.length) % sibs.length];
  n.focus();
  n.click();
});
$('#nbName').addEventListener('input', async () => nbPaint(await nbMod()));
$('#nbDlg form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const NB = await nbMod();
  const title = $('#nbName').value.trim().slice(0, 80) || 'دفتري';
  const id = newNbId();
  const cover = await NB.coverImage({ title, color: nbDlg.color, size: NB.SIZES[nbDlg.size] });
  const rec = { kind: 'notebook', title, color: nbDlg.color, size: nbDlg.size, paper: nbDlg.paper, pages: [nbDlg.tpl], added: Date.now(), opened: Date.now(), thumb: await smaller(cover, 520) };
  await setItem('shelf', id, rec);
  const toKhz = !$('#nbKhzRow').hidden && $('#nbKhz').checked;
  $('#nbDlg').close();
  if (toKhz) await khizanaPut(id, rec, true);
  await renderShelf();
  openNotebook(id);
});

/** الدفتر على الرَّحل: يُبنى ملفه من قوالب صفحاته، ويزيد صفحةً كلما بلغتَ آخره */
async function openNotebook(id) {
  if (opening) return;
  const rec = await getItem('shelf', id);
  if (!isNb(rec)) return note('هذا الدفتر ليس على رفّ الرَّحل في هذا الجهاز (ربما حُذف منه).', true);
  opening = true;
  busy(true);
  try {
    const NB = await nbMod();
    const size = NB.SIZES[rec.size] || NB.SIZES.a5;
    const paper = NB.PAPERS[rec.paper] || NB.PAPERS.ivory;
    if (!Array.isArray(rec.pages) || !rec.pages.length) rec.pages = ['ruled'];
    rec.opened = Date.now();
    await setItem('shelf', id, rec);
    let cover = await NB.coverImage({ title: rec.title, color: rec.color, size });
    if (!rec.heads || typeof rec.heads !== 'object') rec.heads = {};
    const build = () => NB.notebookPdf({ id, title: rec.title, pages: rec.pages, heads: rec.heads, size: rec.size, paper: rec.paper, cover });
    const save = async () => {
      await setItem('shelf', id, rec);
      khizanaPut(id, rec);
    };
    const known = (t) => NB.TEMPLATES.some((x) => x.id === t);
    const notebook = {
      templates: NB.TEMPLATES,
      pageTemplate: (i) => rec.pages[i - 1] || 'blank',
      thumb: (cv, t) => NB.thumb(cv, t, size, paper),
      async addPage(tpl) {
        if (rec.pages.length >= MAX_NB_PAGES) throw new Error(`بلغ الدفتر ${ar(MAX_NB_PAGES)} صفحة: افتح دفتراً آخر`);
        const t = known(tpl) ? tpl : rec.pages[rec.pages.length - 1];
        rec.pages.push(t);
        await save();
        return { blob: await build(), name: NB.tplName(t) };
      },
      /** عناوين الصفحة i: [{ t, lvl }] (باب ١، فصل ٢) */
      heads: (i) => (Array.isArray(rec.heads[i]) ? rec.heads[i].map((h) => ({ ...h })) : []),
      async setHeads(i, list) {
        if (i < 1 || i > rec.pages.length) throw new Error('صفحةٌ غير موجودة');
        const clean = (Array.isArray(list) ? list : []).map((h) => ({ t: String(h.t || '').trim().slice(0, 120), lvl: h.lvl === 2 ? 2 : 1 })).filter((h) => h.t).slice(0, 3);
        if (clean.length) rec.heads[i] = clean;
        else delete rec.heads[i];
        await save();
        return { blob: await build() };
      },
      /** اسمٌ جديد: الغلاف (وصورة الرفّ والخزانة) والملف */
      async rename(title) {
        rec.title = String(title || '').trim().slice(0, 80) || rec.title;
        cover = await NB.coverImage({ title: rec.title, color: rec.color, size });
        rec.thumb = await smaller(cover, 520);
        await save();
        if (lessonOf()) lessonOf().book({ id, title: rec.title });
        return { blob: await build(), outer: cover, title: rec.title };
      },
      async setTemplate(i, tpl) {
        if (!known(tpl) || i < 1 || i > rec.pages.length) throw new Error('قالبٌ غير معروف');
        rec.pages[i - 1] = tpl;
        await save();
        return { blob: await build(), name: NB.tplName(tpl) };
      },
    };
    const { openBook } = await import('/js/book.js');
    await openBook({
      blob: await build(),
      outer: cover,
      cloth: rec.color,
      title: rec.title,
      fileName: rec.title,
      fallbackColor: rec.color,
      notebook,
      notesKey: nbNotes(id),
      ...(lessonOf() ? { lesson: () => lessonOf().toggle(), lessonOpen: () => lessonOf().isOpen, lessonKey: (e) => lessonOf().key(e), onTheme: (p) => lessonOf().theme(p), clip: () => lessonOf().clip } : {}),
      onClose: () => {
        if (lessonOf()) lessonOf().book(null);
        renderShelf();
      },
    });
    if (lessonOf()) lessonOf().book({ id, title: rec.title });
  } catch (e) {
    note('تعذّر فتح الدفتر: ' + (e && e.message ? e.message : e), true);
  } finally {
    opening = false;
    busy(false);
  }
}

function busy(on) {
  $('#drop').classList.toggle('busy', on);
  $('.rh-busy').hidden = !on;
}

/* ------------------------------------------------------------------ الإفلات والاختيار */
const drop = $('#drop');
$('#file').addEventListener('change', (e) => {
  addFile(e.target.files[0]);
  e.target.value = '';
});
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('#file').click();
  }
});
for (const t of ['dragenter', 'dragover']) {
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const t of ['dragleave', 'drop']) drop.addEventListener(t, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  addFile(e.dataTransfer.files[0]);
});
// إفلات الملف في أي موضع من الصفحة
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files[0] && !drop.contains(e.target)) addFile(e.dataTransfer.files[0]);
});

renderShelf();

// برنامج سطح المكتب: الهيكل والخزانة يضعان كتاباً على الرَّحل (ملف PDF من الجهاز)
window.WarraqRahl = { open: addFile, note, openNotebook, newNotebook };
