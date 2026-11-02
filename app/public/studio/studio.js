// استوديو الأساليب — مكانٌ واحد لصنع الأساليب وتركيب بطاقاتها وتعديلها، بمعاينة حية من محرك التنضيد نفسه.
//   · المالك (جلسة دار ابن فقيه): «أساليب دور النشر» التي يراها كل المستخدمين، وإعدادات الطباعة للموقع.
//   · المستخدم: «أساليبي» في متصفحه، بالأدوات نفسها (إعدادات، أشكال جاهزة، صور، CSS، قوالب، صفحات خاصة، طباعة، خطوط)،
//     إلا البرنامج (الكود) فلا يعمل إلا في أساليب الموقع. (‎?user=1‎ يفتحه المالك كما يراه المستخدم)
import { MATN_COLORS, ORNAMENTS, VERSE_SEPS, FONTS, NAMES_FONT, DEFAULT_BOOK_STYLE, styleSettings, registerFonts, kindOf, styleFits, STYLE_KINDS, applyResearchLayout } from '/shared/presets.js';
import { cleanMutun, MUTUN_DEFAULTS, MUTUN_LIMITS, OWNER_MAX, INTRO_PICKS } from '/shared/mutun.js';
import { embedCard, extractCard } from '/shared/style-card.js';
import { parseCardText } from '/shared/card-text.js';
import { drawStyleCard, cardPng } from '/js/style-card-art.js';
import { createPreview } from '/js/preview.js';
import { mountPrintEditor } from '/studio/print-editor.js';
import { tintMask } from '/js/basmala-mask.js';
import { DESIGN_PARTS, cleanDesign } from '/shared/style-parts.js';
import { pageGeom, OUTER_MARGIN } from '/shared/margin.js';
import { initMyStyles, loadMyStyles, saveMyStyle, deleteMyStyle, downloadCard as downloadMyCard, readCardFile, installMyCard, setPick } from '/js/my-styles.js';

const Q = new URLSearchParams(location.search);
const EMBED = Q.get('embed') === '1';
// صفحة «اصنع بطاقتك» (/card/): الاستوديو نفسه بواجهة المستخدم دائماً (ولو فتحها المالك)
const CARD = document.body.dataset.page === 'card';
// المالك أم المستخدم: يُعرف من الخادم (‎/api/styles/meta‎)، و‎?user=1‎ يفرض واجهة المستخدم
let ADMIN = false;
const U = { site: [] }; // عند المستخدم: أساليب الموقع (يبدأ منها)

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const ic = window.ic || (() => '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
$$('[data-ic]').forEach((el) => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)));

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-warraq': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'خطأ ' + r.status), { status: r.status, code: j.code });
  return j;
}
let toastT = 0;
function toast(msg, warn) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('warn', !!warn);
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3000);
}
const fail = (e) => toast(e.message || String(e), true);

const S = { styles: [], slots: {}, templates: {}, pageAt: {}, e: null, saved: '', preview: null, justAdded: null, view: 'list' };
// إعدادات الطباعة: إعداد الموقع، ومكتبة صور البسملة، وحال المحرر (mode: site = للموقع كله · style = لأسلوب بعينه)
const PR = { site: null, defaults: null, library: [], presets: [], editor: null, mode: null, value: null, saved: '' };
const byId = (id) => S.styles.find((x) => x.id === id);

/* ------------------------------------------------------------------ التوجيه */
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if (dirty() || prDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
// إفلات ملف خارج الخانة لا يفتح الملف في المتصفح
for (const t of ['dragover', 'drop']) window.addEventListener(t, (e) => e.preventDefault());

async function load() {
  const meta = await fetch('/api/styles/meta', { cache: 'no-store', credentials: 'same-origin' }).then((r) => r.json());
  ADMIN = !!meta.admin && Q.get('user') !== '1' && !CARD;
  if (ADMIN) {
    try {
      await loadAdmin();
    } catch (e) {
      if (e.status !== 401 && e.status !== 404) throw e;
      ADMIN = false; // جلسة المالك منتهية: يعمل الاستوديو كما عند المستخدم
    }
  }
  if (!ADMIN) {
    const [pub, fn] = await Promise.all([
      fetch('/api/styles', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ styles: [] })),
      fetch('/api/fonts').then((r) => r.json()).catch(() => ({ fonts: [] })),
      initMyStyles(true),
    ]);
    U.site = pub.styles || [];
    S.styles = loadMyStyles();
    S.slots = meta.slots;
    S.templates = meta.templates || {};
    S.pageAt = meta.pageAt || {};
    PR.site = meta.print.print;
    PR.siteDefault = true;
    PR.defaults = meta.print.defaults;
    PR.library = meta.basmalas || [];
    PR.presets = [];
    registerFonts(fn.fonts || []);
  }
  document.body.classList.toggle('as-admin', ADMIN);
  document.body.classList.toggle('as-user', !ADMIN);
  document.body.classList.toggle('embed', EMBED);
  if (ADMIN && !document.querySelector('script[data-panel-name]')) {
    const sc = document.createElement('script');
    sc.src = '/admin/panel-name.js';
    sc.defer = true;
    sc.dataset.panelName = '1';
    document.body.appendChild(sc);
  }
}
async function loadAdmin() {
  // (جلسة المالك: إن لم تُفتح فلا تُطلب بقية بياناته)
  const stt = await api('GET', '/api/admin/status');
  if (!stt.authed) throw Object.assign(new Error('بلا جلسة'), { status: 401 });
  const [st, fn, pr, bs] = await Promise.all([
    api('GET', '/api/admin/styles'),
    fetch('/api/fonts').then((r) => r.json()).catch(() => ({ fonts: [] })),
    api('GET', '/api/admin/print'),
    api('GET', '/api/admin/basmala'),
  ]);
  PR.presets = await api('GET', '/api/admin/print/presets').then((r) => r.items).catch(() => []);
  PR.site = pr.print;
  PR.siteDefault = pr.isDefault;
  PR.defaults = pr.defaults;
  PR.library = bs.items;
  S.styles = st.styles;
  S.slots = st.slots;
  S.templates = st.templates || {};
  S.pageAt = st.pageAt || {};
  registerFonts(fn.fonts || []);
}

function showView(name) {
  S.view = name;
  $('#listView').hidden = name !== 'list';
  $('#editView').hidden = name !== 'edit';
  $('#printView').hidden = name !== 'print' && name !== 'stylePrint';
}

async function route() {
  const m = /^#\/edit\/([\w-]+)(\/print)?$/.exec(location.hash);
  const sitePrint = location.hash === '#/print';
  try {
    if (!S.loaded) {
      await load();
      S.loaded = true;
    }
    // مغادرة إعدادات طباعة الموقع وفيها تغييرات
    if (S.view === 'print' && !sitePrint && prDirty() && !confirm('في إعدادات الطباعة تغييرات غير محفوظة. هل تغادر دون حفظ؟')) {
      history.replaceState(null, '', '#/print');
      return;
    }
    if (m && byId(m[1])) return m[2] ? openStylePrint(m[1]) : openEditor(m[1]);
    // إعدادات الطباعة للموقع كله: للمالك وحده
    if (sitePrint && !ADMIN) {
      history.replaceState(null, '', '#/');
      return showList();
    }
    if (S.e && dirty() && !confirm('في الأسلوب تغييرات غير محفوظة. هل تغادر دون حفظ؟')) {
      history.replaceState(null, '', '#/edit/' + S.e.id + (S.view === 'stylePrint' ? '/print' : ''));
      return;
    }
    S.e = null;
    PR.mode = null;
    await load();
    if (sitePrint) return openSitePrint();
    showList();
  } catch (e) {
    fail(e);
  }
}

/* ------------------------------------------------------------------ الشبكة وخانة التركيب */
const PUZZLE = '<svg viewBox="0 0 24 24" class="pz" aria-hidden="true"><path d="M10 3a2 2 0 0 1 4 0v2h4a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H6a1 1 0 0 1-1-1v-4H3a2 2 0 0 1 0-4h2V6a1 1 0 0 1 1-1h4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const PG_TITLE = { blank: 'صفحة بيضاء', half: 'العنوان المختصر', cover: 'الغلاف الداخلي', basmala: 'البسملة', text: 'صفحة نص', image: 'صفحة صورة', book: 'الكتاب' };
/** شريط مصغّر لتسلسل الطباعة: ما قبل الكتاب، الكتاب، ما بعده */
const seqStrip = (pr) => [...pr.front.map((x) => x.type), 'book', ...pr.back.map((x) => x.type)].map((t) => `<li title="${PG_TITLE[t]}"><span class="pe-pg t-${t}"><i></i></span><small>${PG_TITLE[t]}</small></li>`).join('');

/** تبويبا الأساليب: الكتب والمتون أسلوبٌ واحد (المتن يُنضَّد كالكتاب، ومعه شكل موضع التعليق)، والأبحاث وحدها */
const STUDIO_TABS = { books: 'الكتب والمتون', research: 'الأبحاث' };
const tabOf = (k) => (k === 'research' ? 'research' : 'books');
const fitsTab = (s, tab) => (tab === 'research' ? styleFits(s, 'research') : styleFits(s, 'books') || styleFits(s, 'mutun'));

function showList() {
  showView('list');
  document.title = CARD ? 'اصنع بطاقتك — ورّاق' : ADMIN ? 'استوديو الأساليب — أساليب دور النشر' : 'استوديو الأساليب — أساليبي';
  $('#listTitle').textContent = CARD ? 'اصنع بطاقتك' : 'استوديو الأساليب';
  $('#listSub').textContent = ADMIN
    ? 'أساليب دور النشر التي يختار منها المستخدمون: عدّل الموجود، أو أضف جديداً، أو ركّب بطاقة أسلوب جاهزة'
    : 'أساليبك: اصنع أسلوب إخراجك، أو ركّب بطاقة أسلوب، وعدّله كما تشاء. يُحفظ عندك ويظهر في صفحة الإخراج مع أساليب دور النشر';
  if (ADMIN && PR.site) {
    $('#psSeq').innerHTML = seqStrip(PR.site);
    const n = PR.library.length;
    $('#psState').textContent = (PR.siteDefault ? 'الآن: التسلسل الأصلي' : 'الآن: تسلسل من تخصيصك') + (n ? ` · صور البسملة: ${n}` : ' · لا صور بسملة بعد');
  }
  // الأساليب بنوعيها: أساليب الكتب والمتون (أسلوبٌ واحد لهما، ولشكل المتون فيه موضعه)، وأساليب الأبحاث (جامعات ومراكز بحث)
  const KIND = tabOf(S.kind);
  const count = (k) => S.styles.filter((x) => fitsTab(x.settings, k)).length;
  $('#kindTabs').innerHTML = Object.entries(STUDIO_TABS)
    .map(([k, v]) => `<button type="button" role="tab" data-kind="${k}" aria-selected="${k === KIND}">أساليب ${v}<small>${count(k) || '٠'}</small></button>`)
    .join('');
  const shown = S.styles.filter((x) => fitsTab(x.settings, KIND));
  const g = $('#grid');
  const makerUrl = (id) => '/maker/?' + new URLSearchParams({ ...(ADMIN ? { admin: '1' } : {}), ...(id ? { id } : {}), back: CARD ? 'card' : 'studio', ...(EMBED ? { embed: '1' } : {}) }).toString();
  const chipsOf = (st) =>
    ADMIN
      ? `${st.builtin ? `<span class="chip">${st.modified ? 'مضمّن · معدّل' : 'مضمّن'}</span>` : '<span class="chip cover">من إضافتك</span>'}${st.hidden ? '<span class="chip slot">مخفي</span>' : ''}${st.print ? '<span class="chip" title="له إعدادات طباعة خاصة به">🖨️ طباعة خاصة</span>' : ''}${st.extras && st.extras.script && st.extras.script.trim() ? '<span class="chip code" title="يحمل برنامجاً يتحكم في التنضيد">كود</span>' : ''}`
      : `<span class="chip cover">من أساليبي</span>${st.extras ? '<span class="chip" title="فيه صور أو تنسيق خاص">إضافات</span>' : ''}${st.print ? '<span class="chip" title="له إعدادات طباعة خاصة به">🖨️ طباعة خاصة</span>' : ''}${st.fonts && st.fonts.length ? '<span class="chip" title="يحمل خطوطه">خطوط</span>' : ''}`;
  g.innerHTML =
    shown
      .map(
        (st) => `<article class="scard ${st.hidden ? 'is-hidden' : ''} ${S.justAdded === st.id ? 'snap' : ''}" data-id="${st.id}"${ADMIN ? ' draggable="true" title="اسحبه لتغيّر موضعه"' : ''}>
        <a class="thumb" href="#/edit/${st.id}" draggable="false" title="تحرير «${esc(st.name)}»"><canvas width="512" height="512"></canvas></a>
        <div class="smeta"><b title="${esc(st.name)}">${esc(st.name)}</b>
          <span class="chips">${chipsOf(st)}</span></div>
        <div class="sact">
          <a class="btn sm" href="#/edit/${st.id}">تحرير</a>
          <a class="ibtn" href="${makerUrl(st.id)}" draggable="false" title="تعديل ألوانه وخطوطه وأشكاله بالنقر (الصانع السريع)">${ic('palette')}</a>
          <button class="ibtn" data-act="card" title="تنزيل بطاقة الأسلوب">${ic('download')}</button>
          <button class="ibtn" data-act="dup" title="نسخة جديدة منه">${ic('copy')}</button>
          ${
            ADMIN
              ? `<button class="ibtn" data-act="hide" title="${st.hidden ? 'إظهاره للمستخدمين' : 'إخفاؤه عن المستخدمين'}">${ic(st.hidden ? 'eyeOff' : 'eye')}</button>
          ${st.builtin ? (st.modified ? `<button class="ibtn" data-act="del" title="استعادة الأصل">${ic('reset')}</button>` : '') : `<button class="ibtn danger" data-act="del" title="حذف">${ic('trash')}</button>`}`
              : `<button class="ibtn danger" data-act="del" title="حذف">${ic('trash')}</button>`
          }
        </div>
      </article>`,
      )
      .join('') +
    (KIND !== 'books' ? '' : `<a class="slot make" href="${makerUrl('')}" title="أسلوب جديد بالنقر: ألوان وخطوط وأشكال جاهزة للعناوين والصفحة، بمعاينة حية">
      <span class="slot-in"><span class="mk-plus" aria-hidden="true">🎨</span><b>اصنع أسلوباً بالنقر</b><small>ألوان وخطوط وأشكال جاهزة، بلا كود</small></span>
    </a>`) +
    `
    <label class="slot" id="slot" tabindex="0">
      <input type="file" id="slotFile" accept=".png,.json,.md,.txt,image/png,application/json,text/plain,text/markdown" hidden>
      <span class="slot-in">${PUZZLE}<b>ركّب بطاقة أسلوب</b><small>اسحب ملف البطاقة (صورتها أو ملفها) إلى هنا، أو انقر لاختياره${ADMIN ? '' : ' — ثم عدّله كما تشاء'}</small></span>
    </label>`;
  shown.forEach((st) => drawStyleCard($(`.scard[data-id="${st.id}"] canvas`, g), st).catch(() => {}));
  // عند المستخدم: أساليب دار النشر يبدأ منها أسلوبه
  const sg = $('#siteGrid');
  if (sg) {
    sg.hidden = ADMIN;
    if (!ADMIN) {
      sg.innerHTML = `<h3>ابدأ من أسلوب دار نشر <small class="muted">— نسخة منه تصير من أساليبك فتعدّلها</small></h3><div class="style-grid mini">${U.site
        .filter((st) => fitsTab(st.settings, KIND))
        .map((st) => `<article class="scard site" data-site="${esc(st.id)}"><button type="button" class="thumb" data-from-site="${esc(st.id)}" title="ابدأ من «${esc(st.name)}»"><canvas width="512" height="512"></canvas></button><div class="smeta"><b>${esc(st.name)}</b></div><div class="sact"><button class="btn sm" type="button" data-from-site="${esc(st.id)}">ابدأ منه</button></div></article>`)
        .join('')}</div>`;
      U.site.filter((st) => fitsTab(st.settings, KIND)).forEach((st) => drawStyleCard($(`[data-site="${CSS.escape(st.id)}"] canvas`, sg), st).catch(() => {}));
    }
  }
  S.justAdded = null;
  bindSlot();
}

function bindSlot() {
  const slot = $('#slot');
  const over = (on) => slot.classList.toggle('over', on);
  slot.addEventListener('dragenter', (e) => { e.preventDefault(); over(true); });
  slot.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; over(true); });
  slot.addEventListener('dragleave', () => over(false));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    over(false);
    const f = e.dataTransfer.files[0];
    if (f) installCard(f);
  });
  slot.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && $('#slotFile').click());
  $('#slotFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) installCard(f);
  });
}

/** تركيب بطاقة: تُقرأ البيانات من داخل الملف ثم يحفظها الخادم أسلوباً جديداً */
async function installCard(file) {
  try {
    if (!ADMIN) {
      $('#slot')?.classList.add('busy');
      return await installCardData(await readCardFile(file));
    }
    if (file.size > 40 * 1024 * 1024) throw new Error('الملف أكبر من ٤٠ م.ب');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let card = extractCard(bytes);
    // ليست صورة بطاقة ولا JSON: لعلها بطاقة نصية (جواب ذكاء اصطناعي محفوظ في ملف)
    if (!card && bytes[0] !== 0x89 && file.size < 3 * 1024 * 1024) {
      const r = parseCardText(new TextDecoder().decode(bytes));
      if (r) card = r.card;
    }
    if (!card) throw new Error('هذا الملف ليس بطاقة أسلوب. (إن كانت صورة البطاقة فُتحت في برنامج صور وحُفظت من جديد فقد زالت بياناتها)');
    await installCardData(card);
  } catch (e) {
    $('#slot')?.classList.remove('busy');
    fail(e);
  }
}
/** تركيب بطاقة (كائنها): موافقة على الكود إن وُجد، ثم عرض ملاحظات الموقع عليها */
async function installCardData(card) {
  $('#slot')?.classList.add('busy');
  let st;
  if (!ADMIN) {
    // عند المستخدم: يفحصها الخادم وينقّيها، ثم تُحفظ في أساليبه (في متصفحه)
    const r = await installMyCard(card);
    await load();
    S.justAdded = r.style.id;
    showList();
    toast(`رُكّبت البطاقة في أساليبك: «${r.style.name}» — افتحها لتعدّلها`);
    showNotes(r.style.name, r.notes);
    return r.style;
  }
  try {
    st = await api('POST', '/api/admin/styles/import', { card });
  } catch (e) {
    // بطاقة فيها كود: لا تُركَّب إلا بموافقة صريحة
    if (e.code !== 'script-consent') throw e;
    if (!(await askCode(card.name))) {
      $('#slot')?.classList.remove('busy');
      toast('لم تُركَّب البطاقة');
      return null;
    }
    st = await api('POST', '/api/admin/styles/import', { card, allowScript: true });
  }
  await load();
  S.justAdded = st.id;
  showList();
  toast(`رُكّبت البطاقة: «${st.name}»${(st.installedFonts || []).length ? ' ومعها خطوطها (' + st.installedFonts.join('، ') + ')' : ''} — يمكنك تعديلها الآن`);
  showNotes(st.name, st.notes);
  return st;
}
function showNotes(name, notes) {
  if (!(notes || []).length) return;
  $('#notesOut').value = `ملاحظات موقع ورّاق على بطاقة «${name}»:\n` + notes.map((n) => '- ' + n).join('\n');
  $('#notesDlg').showModal();
}

/* ---- البطاقة النصية: لصق جواب الذكاء الاصطناعي ---- */
function readText() {
  const st = $('#textState');
  const txt = $('#textInp').value;
  let r = null;
  let err = '';
  try {
    r = txt.trim() ? parseCardText(txt) : null;
  } catch (e) {
    err = e.message;
  }
  $('#textOk').disabled = !r;
  st.hidden = !txt.trim();
  st.className = 'text-state' + (r ? ' ok' : ' err');
  if (r) {
    const x = r.card.extras;
    const parts = [`«${r.card.name}»`, x.css.trim() ? 'تنسيق CSS' : '', Object.keys(x.templates).length ? `قوالب: ${Object.keys(x.templates).join(' ')}` : '', x.pages.length ? `${x.pages.length} صفحة خاصة` : '', Object.keys(x.images).length ? `صور: ${Object.keys(x.images).join(' ')}` : '', x.script ? 'برنامج (كود)' : ''].filter(Boolean);
    st.textContent = 'قُرئت البطاقة: ' + parts.join(' · ') + (r.warnings.length ? ' — ' + r.warnings.join(' · ') : '');
  } else st.textContent = err || 'لم أجد أسلوباً في النص. الصق جواب الذكاء الاصطناعي كما نسخته من مربع الكود (وفيه ### style.json ثم كوده)، أو كود style.json وحده';
  return r;
}
$('#textBtn').addEventListener('click', () => {
  $('#textInp').value = '';
  readText();
  $('#textDlg').showModal();
});
$('#textCancel').addEventListener('click', () => $('#textDlg').close());
$('#textInp').addEventListener('input', readText);
$('#textForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = readText();
  if (!r) return;
  $('#textDlg').close();
  try {
    await installCardData(r.card);
  } catch (err) {
    $('#slot')?.classList.remove('busy');
    fail(err);
  }
});
$('#notesCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#notesOut').value);
    toast('نُسخت الملاحظات');
  } catch {
    $('#notesOut').select();
  }
});
/* ---- التوجيه الجاهز لأي ذكاء اصطناعي: لكل قسمٍ توجيهه (الكتب والمتون، أو الأبحاث) ---- */
for (const b of $$('[data-prompt-copy]')) {
  b.addEventListener('click', async () => {
    const kind = b.dataset.promptCopy === 'research' ? 'research' : 'books';
    try {
      const r = await fetch('/api/styles/ai-prompt?kind=' + kind, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('تعذّر تحميل التوجيه');
      const text = (await r.text()) + '\n\n---\n\n## الأسلوب المطلوب\n\n';
      await navigator.clipboard.writeText(text);
      toast(`نُسخ توجيه ${kind === 'research' ? 'الأبحاث' : 'الكتب والمتون'}. الصقه في الذكاء الاصطناعي ثم اكتب تحته وصف الأسلوب`);
    } catch (e) {
      toast('تعذّر النسخ: استعمل «تنزيله ملفاً»', true);
    }
  });
}

/** سؤال المالك قبل تركيب بطاقة تحمل كوداً */
function askCode(name) {
  const d = $('#codeDlg');
  $('#codeName').textContent = name || '';
  return new Promise((resolve) => {
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}

const fileName = (name) => `أسلوب ${String(name).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.warraq.png`;
function saveBytes(bytes, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** ملف البطاقة: صورة البطاقة وبداخلها بيانات الأسلوب */
async function downloadCard(card) {
  const png = await cardPng({ name: card.name, settings: card.settings, extras: card.extras });
  saveBytes(embedCard(png, card), fileName(card.name));
}

$('#kindTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  S.kind = b.dataset.kind;
  try {
    sessionStorage.setItem('warraq.studioKind', S.kind);
  } catch {}
  showList();
});
try {
  S.kind = sessionStorage.getItem('warraq.studioKind') || 'books';
} catch {}
$('#grid').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const st = byId(id);
  if (!ADMIN) {
    try {
      if (b.dataset.act === 'card') {
        await downloadMyCard(st);
        return toast('نُزّلت بطاقة الأسلوب');
      }
      if (b.dataset.act === 'dup') S.justAdded = (await saveMyStyle({ ...st, id: '', name: (st.name + ' (نسخة)').slice(0, 60) })).id;
      if (b.dataset.act === 'del') {
        if (!confirm(`حذف أسلوبك «${st.name}» من أساليبك؟ (نزّل بطاقته أولاً إن أردت الاحتفاظ به)`)) return;
        await deleteMyStyle(id);
      }
      await load();
      return showList();
    } catch (err) {
      return fail(err);
    }
  }
  try {
    if (b.dataset.act === 'card') {
      await downloadCard(await api('GET', `/api/admin/styles/${id}/card`));
      return toast('نُزّلت بطاقة الأسلوب');
    }
    if (b.dataset.act === 'dup') {
      const n = await api('POST', '/api/admin/styles', { from: id });
      S.justAdded = n.id;
    } else if (b.dataset.act === 'hide') {
      await api('PUT', '/api/admin/styles/' + id, { style: { ...st, hidden: !st.hidden } });
    } else if (b.dataset.act === 'del') {
      if (!confirm(st.builtin ? `إعادة «${st.name}» إلى أصله وحذف تعديلاتك عليه؟` : `حذف الأسلوب «${st.name}» نهائياً؟`)) return;
      await api('DELETE', '/api/admin/styles/' + id);
    }
    await load();
    showList();
  } catch (err) {
    fail(err);
  }
});

/* الترتيب بالسحب: تُسحب البلاطة إلى حيث يريد صاحبها، فتنزاح البلاطات لها وهي تُسحب، ويُحفظ الترتيب حين تُفلت */
let dragEl = null;
let dragFrom = '';
$('#grid').addEventListener('dragstart', (e) => {
  const el = ADMIN && e.target.closest && e.target.closest('.scard[data-id][draggable="true"]');
  if (!el) return;
  dragEl = el;
  dragFrom = [...$('#grid').querySelectorAll('.scard[data-id]')].map((x) => x.dataset.id).join(',');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-warraq-style', el.dataset.id);
  requestAnimationFrame(() => el.classList.add('dragging'));
});
$('#grid').addEventListener('dragover', (e) => {
  if (!dragEl) return;
  const over = e.target.closest('.scard[data-id]');
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!over || over === dragEl) return;
  const cards = [...$('#grid').querySelectorAll('.scard[data-id]')];
  // بعده في الترتيب: يوضع بعده، وقبله: قبله (فتنزاح البلاطات بينهما خانةً واحدة)
  if (cards.indexOf(over) > cards.indexOf(dragEl)) over.after(dragEl);
  else over.before(dragEl);
});
$('#grid').addEventListener('drop', (e) => {
  if (dragEl) e.preventDefault();
});
$('#grid').addEventListener('dragend', async () => {
  if (!dragEl) return;
  dragEl.classList.remove('dragging');
  dragEl = null;
  const shownIds = [...$('#grid').querySelectorAll('.scard[data-id]')].map((x) => x.dataset.id);
  if (shownIds.join(',') === dragFrom) return;
  // الأساليب المعروضة (أساليب هذا التبويب) تأخذ خاناتها نفسها في الترتيب الكامل بترتيبها الجديد
  const all = S.styles.map((x) => x.id);
  const shown = new Set(shownIds);
  let k = 0;
  const ids = all.map((id) => (shown.has(id) ? shownIds[k++] : id));
  try {
    await api('POST', '/api/admin/styles/order', { ids });
    await load();
    showList();
  } catch (err) {
    fail(err);
    showList();
  }
});

/* أسلوب جديد */
$('#newBtn').addEventListener('click', () => {
  // الأسلوب الجديد من أسلوبٍ من نوع التبويب المفتوح (فيكون من نوعه: للكتب، أو للأبحاث)
  const K = tabOf(S.kind);
  const ofK = (list) => list.filter((x) => (K === 'research' ? kindOf(x.settings) === 'research' : ['books', 'mutun'].includes(kindOf(x.settings))));
  $('#newFrom').innerHTML = ADMIN
    ? ofK(S.styles).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    : `<optgroup label="أساليب دور النشر">${ofK(U.site).map((s) => `<option value="site:${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>` + (ofK(S.styles).length ? `<optgroup label="أساليبي">${ofK(S.styles).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>` : '');
  $('#newName').value = '';
  $('#newDlg').showModal();
  $('#newName').focus();
});
$('#newCancel').addEventListener('click', () => $('#newDlg').close());
$('#newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#newName').value.trim();
  if (!name) return;
  if (!ADMIN) {
    try {
      const st = await newMyStyle($('#newFrom').value, name);
      $('#newDlg').close();
      location.hash = '#/edit/' + st.id;
    } catch (err) {
      fail(err);
    }
    return;
  }
  try {
    const st = await api('POST', '/api/admin/styles', { from: $('#newFrom').value, name });
    $('#newDlg').close();
    await load();
    location.hash = '#/edit/' + st.id;
  } catch (err) {
    fail(err);
  }
});

/** أسلوبٌ جديد من أساليبي: نسخة من أسلوب دار نشر (يبقى أصله، فتعمل زخارفه وصوره) أو من أسلوب من أساليبي */
async function newMyStyle(from, name) {
  let st;
  if (from.startsWith('site:')) {
    const site = U.site.find((x) => x.id === from.slice(5)) || U.site[0];
    const settings = styleSettings(site || { id: DEFAULT_BOOK_STYLE, settings: {} });
    for (const k of ['preset', 'styleId', 'template']) delete settings[k];
    st = await saveMyStyle({ id: '', name, desc: '', base: site ? site.id : '', settings, extras: null, print: null, fonts: [] });
  } else {
    const src = byId(from);
    if (!src) throw new Error('الأسلوب الأصل غير موجود');
    st = await saveMyStyle({ ...JSON.parse(JSON.stringify(src)), id: '', name });
  }
  await load();
  return st;
}
$('#siteGrid')?.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-from-site]');
  if (!b) return;
  const site = U.site.find((x) => x.id === b.dataset.fromSite);
  const name = prompt('اسم أسلوبك الجديد:', site ? site.name + ' — بتعديلي' : '');
  if (name == null || !name.trim()) return;
  try {
    const st = await newMyStyle('site:' + b.dataset.fromSite, name.trim().slice(0, 60));
    location.hash = '#/edit/' + st.id;
  } catch (err) {
    fail(err);
  }
});

/* ------------------------------------------------------------------ المحرر */
const snapshot = () => (S.e ? JSON.stringify({ n: S.e.name, d: S.e.desc, h: S.e.hidden, s: S.e.settings, x: S.e.extras, p: S.e.print, f: (S.e.fonts || []).map((f) => f.family + f.weight + f.data.length) }) : '');
const dirty = () => !!S.e && snapshot() !== S.saved;
function markDirty() {
  const d = dirty();
  for (const el of [$('#dirty'), ...(PR.mode === 'style' ? [$('#prDirty')] : [])]) {
    el.textContent = d ? '● تغييرات غير محفوظة' : 'محفوظ';
    el.classList.toggle('on', d);
  }
}

function openEditor(id) {
  if (S.e && S.e.id === id) {
    // عودة من «طباعة هذا الأسلوب» إلى محرره: الحال كما هو
    if (S.view !== 'edit') {
      PR.mode = null;
      showView('edit');
      keepOpen(renderForm);
      markDirty();
      S.preview && S.preview.update();
      window.scrollTo({ top: 0 });
    }
    return;
  }
  initEditor(id);
  showView('edit');
  window.scrollTo({ top: 0 });
}

/** تحميل أسلوب في المحرر (S.e) ورسم نموذجه ومعاينته */
function initEditor(id) {
  const st = byId(id);
  PR.mode = null;
  // الأسلوب الشامل يبقى شاملاً، وما يخص كل نوعٍ منه (forKind) في مكانه: لا يُضمّ إلى الأسلوب نفسه
  const { forKind, ...plain } = JSON.parse(JSON.stringify(st.settings || {}));
  const isAll = plain.kind === 'all';
  const full = { ...styleSettings({ ...st, settings: isAll ? { ...plain, kind: 'books' } : plain }), ...(isAll ? { kind: 'all' } : {}), ...(forKind ? { forKind } : {}) };
  delete full.preset;
  delete full.styleId;
  delete full.template;
  S.e = {
    id,
    builtin: st.builtin,
    modified: st.modified,
    name: st.name,
    desc: st.desc || '',
    hidden: !!st.hidden,
    settings: { matnQawluhu: true, mergeBroken: true, ...full },
    extras: { css: '', images: {}, slots: {}, h1OrnamentMm: 7, separatorMm: 8, templates: {}, pages: [], options: { blankPage: true }, ...JSON.parse(JSON.stringify(st.extras || {})) },
    // إعداد طباعة خاص بالأسلوب (null = يتبع إعداد الموقع)
    print: st.print ? JSON.parse(JSON.stringify(st.print)) : null,
    // أساليبي: أصله من أساليب الموقع (تعمل زخارفه)، وخطوطه التي تسافر معه
    base: st.base || '',
    fonts: Array.isArray(st.fonts) ? JSON.parse(JSON.stringify(st.fonts)) : [],
  };
  if (!ADMIN) S.e.extras.script = '';
  for (const f of S.e.fonts) useFont(f);
  S.saved = snapshot();
  $('#nameInp').value = st.name;
  // نوع الأسلوب (للكتب، أو للأبحاث، أو للمتون): من إعداداته
  const kindChip = kindOf(st.settings) === 'all' ? '<span class="chip">أسلوب شامل: كتاب وبحث ومتن</span>' : kindOf(full) !== 'books' ? `<span class="chip">أسلوب ${STYLE_KINDS[kindOf(full)]}</span>` : '';
  $('#edChips').innerHTML = kindChip + (ADMIN ? (st.builtin ? `<span class="chip">${st.modified ? 'مضمّن · معدّل' : 'أسلوب مضمّن'}</span>` : '<span class="chip cover">من إضافتك</span>') : `<span class="chip cover">من أساليبي</span>${st.base ? `<span class="chip" title="زخارفه وصوره من أسلوب الموقع الذي بدأ منه">أصله: ${esc((U.site.find((x) => x.id === st.base) || {}).name || st.base)}</span>` : ''}`);
  $('#resetBuiltin').hidden = !(ADMIN && st.builtin && st.modified);
  document.title = st.name + ' — استوديو الأساليب';
  renderForm();
  markDirty();
  if (!S.preview) {
    S.preview = createPreview($('#previewHost'), {
      // في البرنامج: المعاينة تملأ عمودها صفحتين متقابلتين، وأدواتها في شريط واحد
      ...(document.documentElement.hasAttribute('data-shell') ? { bar: true, spread: true, fill: true } : {}),
      // المالك: معاينة المالك (بالكود). المستخدم: المعاينة العامة بأسلوبه (بلا كود)، وزخارف أصله بمعرّفه
      endpoint: ADMIN ? '/api/admin/styles/preview' : '/api/preview',
      // الأسلوب كما يُختار لنوع المعاينة (كتاب، متن، بحث)، ومعه ما يخص ذلك النوع
      getSettings: () => previewSettings(),
      getParseOpts: () => ({ matnQawluhu: S.e.settings.matnQawluhu !== false }),
      getExtras: () => S.e.extras,
      getPrint: () => S.e.print,
      getFonts: () => (ADMIN ? undefined : S.e.fonts.length ? S.e.fonts : undefined),
      onWarnings: (w) => {
        S.warnings = w;
        showScriptState();
      },
    });
  } else S.preview.update();
}

/* ------------------------------------------------------------------ إعدادات الطباعة */
const prDirty = () => PR.mode === 'site' && !!PR.value && JSON.stringify(PR.value) !== PR.saved;
function markPrDirty() {
  if (PR.mode !== 'site') return markDirty();
  const d = prDirty();
  $('#prDirty').textContent = d ? '● تغييرات غير محفوظة' : 'محفوظ';
  $('#prDirty').classList.toggle('on', d);
}
function printEditor() {
  if (!PR.editor) {
    PR.editor = mountPrintEditor($('#printHost'), {
      api,
      toast,
      ic,
      ...(ADMIN ? {} : { endpoint: '/api/preview', manageLibrary: false, getFonts: () => (S.e && S.e.fonts.length ? S.e.fonts : undefined) }),
      onLibrary: (items) => (PR.library = items),
    });
  }
  return PR.editor;
}

/** إعدادات الطباعة للموقع كله */
function openSitePrint() {
  PR.mode = 'site';
  $('#prPresets').hidden = false;
  PR.value = JSON.parse(JSON.stringify(PR.site));
  PR.saved = JSON.stringify(PR.value);
  showView('print');
  document.title = 'إعدادات الطباعة — أساليب دور النشر';
  $('#prTitle').textContent = 'إعدادات الطباعة';
  $('#prChips').innerHTML = '<span class="chip cover">للموقع كله</span>';
  $('#prFollow').hidden = true;
  $('#prFollowBox').hidden = true;
  $('#printHost').hidden = false;
  $('#prReset').hidden = false;
  // المعاينة بإعدادات أول أسلوب ظاهر (ما يراه المستخدم أول ما يفتح)
  const base = S.styles.find((x) => !x.hidden) || S.styles[0];
  const full = styleSettings(base);
  PR.baseSettings = () => full;
  printEditor().open(PR.value, { getSettings: PR.baseSettings, getExtras: null, onChange: markPrDirty, library: PR.library });
  markPrDirty();
  renderPresets();
  window.scrollTo({ top: 0 });
}

/** إعدادات الطباعة الخاصة بأسلوب: جزء من الأسلوب، تُحفظ معه وتسافر مع بطاقته */
function openStylePrint(id) {
  if (!(S.e && S.e.id === id)) initEditor(id);
  PR.mode = 'style';
  PR.value = null;
  showView('stylePrint');
  document.title = 'طباعة «' + S.e.name + '» — استوديو الأساليب';
  $('#prPresets').hidden = !ADMIN;
  $('#prTitle').textContent = 'طباعة «' + (S.e.name || 'الأسلوب') + '»';
  syncStylePrint();
  markDirty();
  renderPresets();
  window.scrollTo({ top: 0 });
}
function syncStylePrint() {
  const own = !!S.e.print;
  $('#prChips').innerHTML = own ? '<span class="chip ok">إعدادات خاصة بهذا الأسلوب</span>' : '<span class="chip">يتبع الإعدادات العامة</span>';
  $('#prFollow').hidden = !own;
  $('#prReset').hidden = !own;
  $('#prFollowBox').hidden = own;
  $('#printHost').hidden = !own;
  if (own) {
    printEditor().open(S.e.print, {
      getSettings: () => ({ ...JSON.parse(JSON.stringify(S.e.settings)), ...(ADMIN ? {} : { styleId: S.e.base || '', preset: S.e.base || '' }) }),
      getExtras: () => S.e.extras,
      onChange: markDirty,
      library: PR.library,
    });
  }
}
$('#prBack').addEventListener('click', () => {
  location.hash = PR.mode === 'style' && S.e ? '#/edit/' + S.e.id : '#/';
});
$('#prOwn').addEventListener('click', () => {
  S.e.print = JSON.parse(JSON.stringify(PR.site));
  syncStylePrint();
  markDirty();
});
$('#prFollow').addEventListener('click', () => {
  if (!confirm('حذف إعدادات الطباعة الخاصة بهذا الأسلوب، ليتبع الإعدادات العامة؟')) return;
  S.e.print = null;
  syncStylePrint();
  markDirty();
});
$('#prReset').addEventListener('click', () => {
  if (!confirm('إعادة التسلسل والمقاسات إلى الأصل؟ (بيضاء، عنوان مختصر، بيضاء، غلاف داخلي، بيضاء، بسملة، بيضاء)')) return;
  const fresh = JSON.parse(JSON.stringify(PR.defaults));
  if (PR.mode === 'style') {
    S.e.print = fresh;
    syncStylePrint();
    return markDirty();
  }
  PR.value = fresh;
  printEditor().open(PR.value, { getSettings: PR.baseSettings, getExtras: null, onChange: markPrDirty, library: PR.library });
  markPrDirty();
});
async function savePrint() {
  if (PR.mode === 'style') return save();
  const r = await api('PUT', '/api/admin/print', { print: PR.value });
  PR.site = r.print;
  PR.siteDefault = r.isDefault;
  PR.saved = JSON.stringify(PR.value);
  markPrDirty();
  toast('حُفظت إعدادات الطباعة — تسري على كل «نسخة جاهزة للطباعة»');
}
$('#prSave').addEventListener('click', () => savePrint().catch(fail));

/* ---- التنسيقات المحفوظة: تُحفظ بأسمائها، ثم تُعمَّم للموقع كله أو تُربط بأسلوب، وتُنزَّل ملفاً يفهمه الموقع ---- */
/** إعداد الطباعة الذي في المحرر الآن (للموقع، أو الخاص بالأسلوب المفتوح؛ وإن كان الأسلوب يتبع الموقع فإعداد الموقع) */
const curPrint = () => (PR.mode === 'style' ? (S.e && S.e.print) || PR.site : PR.value);
const typeStrip = (front, back) => [...front, 'book', ...back].map((t) => `<li title="${PG_TITLE[t]}"><span class="pe-pg t-${t}"><i></i></span></li>`).join('');
function renderPresets() {
  const list = PR.presets;
  const styles = S.styles.map((x) => `<option value="${esc(x.id)}" ${PR.mode === 'style' && S.e && S.e.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#ppList').innerHTML = list.length
    ? list
        .map(
          (x) => `<article class="pp-item" data-pp="${esc(x.id)}">
        <div class="pp-meta"><b title="${esc(x.name)}">${esc(x.name)}</b><ol class="pp-seq" aria-hidden="true">${typeStrip(x.summary.front, x.summary.back)}</ol></div>
        <div class="pp-acts">
          <button class="btn sm" data-pp-act="open" title="يُفتح في المحرر هنا لتراه وتعدّله (لا يُحفظ حتى تضغط «حفظ»)">${ic('eye')} افتحه هنا</button>
          <button class="btn sm" data-pp-act="site" title="يصير إعداد الطباعة للموقع كله">${ic('check')} عمّمه للموقع</button>
          <span class="pp-link"><select class="inp sm" aria-label="الأسلوب الذي يُربط به">${styles}</select><button class="btn sm" data-pp-act="style" title="يصير إعداد الطباعة الخاص بهذا الأسلوب">${ic('link')} اربطه بالأسلوب</button></span>
          <button class="ibtn" data-pp-act="dl" title="تنزيله ملفاً (يوضع لاحقاً هنا أو في موقع آخر)">${ic('download')}</button>
          <button class="ibtn danger" data-pp-act="del" title="حذف">${ic('trash')}</button>
        </div>
      </article>`,
        )
        .join('')
    : '<p class="muted small pp-empty">لا تنسيقات محفوظة بعد. رتّب الصفحات واضبطها في الأسفل، ثم اضغط «حفظ هذا التنسيق باسم…».</p>';
}
$('#ppSave').addEventListener('click', async () => {
  const print = curPrint();
  if (!print) return;
  const name = prompt('اسم التنسيق:', '');
  if (name == null) return;
  if (!name.trim()) return toast('اكتب اسم التنسيق', true);
  try {
    const r = await api('POST', '/api/admin/print/presets', { name: name.trim(), print });
    PR.presets = r.items;
    renderPresets();
    toast(`حُفظ التنسيق «${r.item.name}»: عمّمه أو اربطه بأسلوب من قائمته`);
  } catch (e) { fail(e); }
});
$('#ppFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (f.size > 11 * 1024 * 1024) throw new Error('الملف أكبر من المسموح');
    let d;
    try { d = JSON.parse(await f.text()); } catch { throw new Error('هذا ليس ملف تنسيق طباعة (ملف JSON نزّلته من هنا)'); }
    // ملف التنسيق المنزَّل: { format: 'warraq-print', name, print } — ويُقبل إعداد الطباعة وحده
    const print = d && d.format === 'warraq-print' && d.print ? d.print : d && Array.isArray(d.front) ? d : null;
    if (!print) throw new Error('هذا ليس ملف تنسيق طباعة: لا تسلسل صفحات فيه');
    const r = await api('POST', '/api/admin/print/presets', { name: String((d && d.name) || f.name.replace(/(\.warraq-print)?\.json$/i, '')).trim() || 'تنسيق', print });
    PR.presets = r.items;
    renderPresets();
    toast(`وُضع التنسيق «${r.item.name}» بين المحفوظات: افتحه، أو عمّمه، أو اربطه بأسلوب`);
  } catch (err) { fail(err); }
});
$('#ppList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pp-act]');
  if (!b) return;
  const el = b.closest('[data-pp]');
  const item = PR.presets.find((x) => x.id === el.dataset.pp);
  if (!item) return;
  const act = b.dataset.ppAct;
  try {
    if (act === 'del') {
      if (!confirm(`حذف التنسيق «${item.name}»؟ (ما عُمّم منه أو رُبط بأسلوب يبقى كما هو)`)) return;
      PR.presets = (await api('DELETE', '/api/admin/print/presets/' + item.id)).items;
      renderPresets();
      return toast('حُذف التنسيق');
    }
    if (act === 'dl') {
      const full = await api('GET', '/api/admin/print/presets/' + item.id);
      const blob = new Blob([JSON.stringify({ format: 'warraq-print', version: 1, name: full.name, print: full.print }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = full.name.replace(/[\\/:*?"<>|]+/g, ' ') + '.warraq-print.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
      return toast('نُزّل ملف التنسيق');
    }
    if (act === 'open') {
      const full = await api('GET', '/api/admin/print/presets/' + item.id);
      if (PR.mode === 'style') {
        S.e.print = full.print;
        syncStylePrint();
        markDirty();
      } else {
        PR.value = full.print;
        printEditor().open(PR.value, { getSettings: PR.baseSettings, getExtras: null, onChange: markPrDirty, library: PR.library });
        markPrDirty();
      }
      return toast(`فُتح «${item.name}» في المحرر. اضغط «حفظ» ليُعمل به هنا`);
    }
    if (act === 'site') {
      if (!confirm(`تعميم «${item.name}» للموقع كله؟ يصير إعداد الطباعة لكل «نسخة جاهزة للطباعة» (إلا أسلوباً له إعداده الخاص).`)) return;
      const r = await api('POST', '/api/admin/print/presets/' + item.id + '/apply', { target: 'site' });
      PR.site = r.print;
      PR.siteDefault = r.isDefault;
      if (PR.mode === 'site') {
        PR.value = JSON.parse(JSON.stringify(PR.site));
        PR.saved = JSON.stringify(PR.value);
        printEditor().open(PR.value, { getSettings: PR.baseSettings, getExtras: null, onChange: markPrDirty, library: PR.library });
        markPrDirty();
      }
      return toast(`عُمّم «${item.name}» للموقع كله`);
    }
    if (act === 'style') {
      const id = el.querySelector('select').value;
      const st0 = S.styles.find((x) => x.id === id);
      if (!st0) return;
      if (S.e && S.e.id === id && dirty()) return toast('في هذا الأسلوب تغييرات غير محفوظة: احفظه أولاً، أو استعمل «افتحه هنا»', true);
      if (!confirm(`ربط «${item.name}» بأسلوب «${st0.name}»؟ يصير إعداد الطباعة الخاص به.`)) return;
      const r = await api('POST', '/api/admin/print/presets/' + item.id + '/apply', { target: id });
      S.styles = S.styles.map((x) => (x.id === r.style.id ? r.style : x));
      if (S.e && S.e.id === id) {
        S.e.print = r.style.print;
        S.saved = snapshot();
        if (PR.mode === 'style') syncStylePrint();
        markDirty();
      }
      return toast(`رُبط «${item.name}» بأسلوب «${st0.name}»`);
    }
  } catch (err) { fail(err); }
});

/** اختيار صورة البسملة لهذا الأسلوب من مكتبة الموقع */
function basmalaPicker(cur) {
  if (!PR.library.length) return `<p class="muted small">لا صور بسملة في المكتبة: تُكتب بخط الرقعة. أضف صوراً من <a href="#/print">إعدادات الطباعة</a>.</p>`;
  const opt = (id, label, inner) => `<button type="button" class="bsm-opt" data-bsm="${id}" aria-pressed="${(cur || '') === id}" title="${esc(label)}">${inner}<small>${esc(label)}</small></button>`;
  return `<div class="bsm-pick">${opt('', 'الافتراضية (أول المكتبة)', `<img data-mask="${PR.library[0].id}" alt="">`)}${PR.library.map((b) => opt(b.id, b.name, `<img data-mask="${b.id}" alt="">`)).join('')}${opt('text', 'نصاً بخط الرقعة', '<span class="bsm-txt">بسم الله الرحمن الرحيم</span>')}</div>`;
}
function paintBasmalas() {
  const color = S.e.settings.basmalaColor || (S.e.print && S.e.print.basmala.color) || (PR.site && PR.site.basmala.color) || S.e.settings.headingColors[1];
  for (const img of $$('#form img[data-mask]')) {
    const b = PR.library.find((x) => x.id === img.dataset.mask);
    if (b) tintMask(b.src, color).then((u) => (img.src = u)).catch(() => {});
  }
  for (const t of $$('#form .bsm-txt')) t.style.color = color;
}

/** أخطاء برنامج الأسلوب كما أبلغ بها مستند المعاينة */
function showScriptState() {
  const el = $('#scriptState');
  if (!el) return;
  const errs = (S.warnings || []).filter((w) => w.startsWith('script:')).map((w) => w.slice(7));
  el.hidden = !errs.length;
  el.textContent = errs.length ? 'خطأ في البرنامج: ' + errs.join(' · ') : '';
}

/** خطٌّ يحمله أسلوبٌ من أساليبي: يُعرَّف في الصفحة (لقوائم الخطوط والعيّنات) */
const usedFonts = new Set();
function useFont(f) {
  const key = f.family + '|' + f.weight;
  if (usedFonts.has(key)) return;
  usedFonts.add(key);
  try {
    const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const face = new FontFace(f.family, bin, { weight: f.weight === 'all' ? '100 900' : f.weight });
    face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
  } catch {}
}
const fontKind = (bytes) => {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  return tag === 'wOFF' || tag === 'wOF2' || tag === 'OTTO' || tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0);
};
async function addFontFiles(files) {
  for (const f of files) {
    if (f.size > 8 * 1024 * 1024) { toast(`${f.name}: أكبر من ٨ م.ب`, true); continue; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!fontKind(bytes)) { toast(`${f.name}: ليس ملف خط (TTF أو OTF أو WOFF)`, true); continue; }
    const fam = (prompt(`اسم الخط «${f.name}» كما يظهر في القوائم:`, f.name.replace(/\.[^.]+$/, '').replace(/[-_](Regular|Bold|Medium|Light)$/i, '').replace(/[-_]+/g, ' ')) || '').replace(/["'\\<>{};()]/g, '').trim().slice(0, 60);
    if (!fam) continue;
    const weight = /bold|black|heavy/i.test(f.name) ? '700' : '400';
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const font = { family: fam, label: fam, weight, name: f.name, data: btoa(bin) };
    S.e.fonts = [...S.e.fonts.filter((x) => !(x.family === fam && x.weight === weight)), font].slice(0, 12);
    useFont(font);
  }
  keepOpen(renderForm);
  changed('fonts.body');
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
/** يحذف مفتاحاً متداخلاً، وما فرغ من آبائه */
function unset(o, path) {
  const ks = path.split('.');
  const chain = [o];
  for (let i = 0; i < ks.length - 1; i++) {
    const n = chain[i] && chain[i][ks[i]];
    if (!n || typeof n !== 'object') return;
    chain.push(n);
  }
  delete chain[chain.length - 1][ks[ks.length - 1]];
  for (let i = chain.length - 1; i > 0; i--) if (!Object.keys(chain[i]).length) delete chain[i - 1][ks[i - 1]];
}
function set(o, path, v) {
  const ks = path.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] = a[ks[i]] ?? {};
  a[ks[ks.length - 1]] = v;
}

const ON_BY_DEFAULT = ['widowOrphan', 'runts', 'ornaments', 'nabawiBold']; // (ما لم يُذكر في الأسلوب: يعمل)
const chk = (k, label, hint) => `<label class="sw" ${hint ? `title="${esc(hint)}"` : ''}><span>${label}</span><input type="checkbox" data-k="${k}" ${(get(S.e.settings, k) === undefined ? ON_BY_DEFAULT.includes(k) : get(S.e.settings, k) !== false && get(S.e.settings, k)) ? 'checked' : ''}></label>`;
const color = (k, label, emptyLabel) => {
  const v = get(S.e.settings, k);
  return `<label class="cfield"><span class="color ${v ? '' : 'empty'}"><input type="color" data-k="${k}" value="${v || '#888888'}"></span><span>${label}${emptyLabel && !v ? ` <small class="muted">(${emptyLabel})</small>` : ''}</span>${emptyLabel && v ? `<button type="button" class="link-btn" data-clear="${k}">${emptyLabel}</button>` : ''}</label>`;
};
const numF = (k, label, step, min, max) => `<label class="field"><span>${label}</span><input class="inp" type="number" data-k="${k}" step="${step}" min="${min}" max="${max}" value="${get(S.e.settings, k)}"></label>`;
const seg = (k, opts) => `<div class="seg2" data-seg="${k}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${get(S.e.settings, k) === v}">${t}</button>`).join('')}</div>`;
const sel = (k, opts) => `<select class="inp" data-k="${k}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${get(S.e.settings, k) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
const fontSel = (k, label) => {
  const cur = get(S.e.settings, k);
  const list = Object.entries(FONTS).map(([f, x]) => [f, x.label + (x.uploaded && !x.system ? ' ★' : x.system ? ' · من جهازك' : '')]);
  // خطوط الأسلوب نفسه (أساليبي)
  for (const f of (S.e && S.e.fonts) || []) if (!list.some(([k]) => k === f.family)) list.unshift([f.family, f.label + ' ◆']);
  if (!list.some(([k]) => k === cur)) list.unshift([cur, cur + ' (غير موجود)']);
  return `<label class="field"><span>${label}</span>${sel(k, list)}</label>`;
};
/* ---- نوع الأسلوب، والمحرِّر (الهامش والأنماط)، والمتون، وما يخص كل نوعٍ في الأسلوب الشامل ---- */
// الكتاب والمتن أسلوبٌ واحد (books)، و«متن وحده» يبقى لبطاقاتٍ صُنعت له
const KIND_OPTS = [['books', 'كتاب ومتن'], ['research', 'بحث'], ['all', 'شامل: الثلاثة']];
const KIND_CHIP = { books: 'للكتب والمتون', research: 'للأبحاث', mutun: 'للمتون وحدها', all: 'شامل' };
const MU_PLACE = [['page', 'صفحةٌ تقابله'], ['below', 'تحته'], ['side', 'بجانبه']];
const MU_RULE = [['lines', 'خطوط'], ['dots', 'منقّطة'], ['blank', 'فارغة'], ['grid', 'شبكة']];
const MU_SIDE = [['right', 'المتن يميناً'], ['left', 'يساراً'], ['free', 'حيث وقع']];
const MU_AL = [['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']];
const MU_DECO = [['plain', 'بلا زينة'], ['rule', 'خطٌّ تحته'], ['frame', 'إطار'], ['band', 'شريط'], ['orn', 'زخرفة']];
const MU_NUM = [['off', 'بلا رقم'], ['side', 'خانة يمين البيت'], ['mid', 'بين الشطرين']];
const MU_FILL = [['line', 'خط'], ['dots', 'نقاط'], ['blank', 'فارغ']];
const YES_NO = [[true, 'نعم'], [false, 'لا']];
/** خانات صاحب النسخة كما في المنضدة أول مرة */
const OWNER_DEF = MUTUN_DEFAULTS.mOwner.fields;
/** ما تُعايَن به الأساليب: كتاب، أو متن (بموضع التعليق وخانات صاحب النسخة)، أو بحث — بحسب نوع الأسلوب */
const PV_NAMES = { books: 'كتاباً', mutun: 'متناً', research: 'بحثاً' };
const pvKinds = (s) => ({ research: ['research'], mutun: ['mutun'], all: ['books', 'mutun', 'research'] })[kindOf(s)] || ['books', 'mutun'];
const pvKind = () => (pvKinds(S.e.settings).includes(S.pv) ? S.pv : pvKinds(S.e.settings)[0]);
/** إعدادات المعاينة: الأسلوب كما يُختار لذلك النوع (ومعه ما يخصه في forKind)، والمتن بشكل متونه */
function previewSettings() {
  const pk = pvKind();
  const { preset: _p, styleId: _i, forKind: _f, ...s } = styleSettings({ id: S.e.id, settings: S.e.settings }, pk);
  const base = { ...s, template: pk === 'research' ? 'research' : 'full', ...(ADMIN ? {} : { styleId: S.e.base || '', preset: S.e.base || '' }) };
  if (pk === 'research') return applyResearchLayout(base, 'uni');
  if (pk === 'mutun') return { ...base, ...cleanMutun(s.mutunLook || {}), mutun: true };
  return base;
}
/** حقلٌ عددي اختياري: فارغاً يُحذف (فيتبع الأصل) */
const optNum = (k, label, step, min, max, ph) => {
  const v = get(S.e.settings, k);
  return `<label class="field"><span>${label}</span><input class="inp" type="number" data-k="${k}" data-opt step="${step}" min="${min}" max="${max}" value="${v == null ? '' : v}" placeholder="${esc(ph || '')}"></label>`;
};
const optText = (k, label, ph, max = 60) => {
  const v = get(S.e.settings, k);
  return `<label class="field"><span>${label}</span><input class="inp" data-k="${k}" data-opt maxlength="${max}" value="${esc(v == null ? '' : v)}" placeholder="${esc(ph || '')}"></label>`;
};
const optSeg = (k, opts, none) => {
  const v = get(S.e.settings, k);
  return `<div class="seg2" data-seg="${k}" data-opt>${none ? `<button type="button" data-v="" aria-pressed="${v == null || v === ''}">${none}</button>` : ''}${opts.map(([x, t]) => `<button type="button" data-v="${x}" aria-pressed="${v === x}">${t}</button>`).join('')}</div>`;
};
const optFont = (k, label, none) => {
  const cur = get(S.e.settings, k) || '';
  const list = Object.entries(FONTS).map(([f, x]) => [f, x.label + (x.system ? ' · من جهازك' : '')]);
  for (const f of (S.e && S.e.fonts) || []) if (!list.some(([n]) => n === f.family)) list.unshift([f.family, f.label + ' ◆']);
  return `<label class="field"><span>${label}</span><select class="inp" data-k="${k}" data-opt><option value="">${esc(none)}</option>${list.map(([v, t]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
};
function kindSec(s) {
  const k = kindOf(s);
  const tip = {
    books: 'أسلوبٌ واحد للكتاب والمتن: يظهر مع الكتب (المتن والشرح والحواشي)، ومع المتون بشكل موضع التعليق أدناه. وما يخص المتن وحده (خطه، مقاسه، صفحته) في «ما يخص المتن» أدناه.',
    research: 'يظهر مع الأبحاث العلمية، بقوالبها (الجامعي، المحكَّم، الرسالة)، وما يخصها أدناه.',
    mutun: 'بطاقةٌ صُنعت للمتون وحدها: تظهر مع المتون. واجعلها «كتاب ومتن» لتظهر مع الكتب أيضاً.',
    all: 'بطاقةٌ واحدة تصلح للكتاب والبحث والمتن: تظهر مع الأنواع الثلاثة، وما يخص كلّاً منها في «لكل نوعٍ ما يخصه» أدناه (ما لم يُذكر فيه فمن الأسلوب نفسه).',
  }[k];
  const opts = k === 'mutun' ? [...KIND_OPTS, ['mutun', 'متن وحده']] : KIND_OPTS;
  const pvs = pvKinds(s);
  const pv = pvKind();
  return sec(
    `نوع الأسلوب <span class="chip">${KIND_CHIP[k]}</span>`,
    `<div class="rowf"><span class="lbl">يصلح لـ</span><div class="seg2" data-seg="kind">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${k === v}">${t}</button>`).join('')}</div></div>
     <p class="muted small">${tip}</p>
     ${pvs.length > 1 ? `<div class="rowf"><span class="lbl">المعاينة</span><div class="seg2">${pvs.map((x) => `<button type="button" data-pv="${x}" aria-pressed="${x === pv}">${PV_NAMES[x]}</button>`).join('')}</div></div>` : ''}
     <div class="rowf"><span class="lbl">لون الورق</span>${optSeg('paper', [['white', 'أبيض'], ['yellow', 'أصفر (شاموا)']], 'اختيار المستخدم')}</div>
     ${k === 'all' ? forKindHtml(s) : ''}
     ${k === 'books' ? fkOne('mutun', 'ما يخص المتن وحده') : ''}
     ${k === 'books' || k === 'mutun' ? mutunLookHtml('mutunLook', 'شكل المتون مع هذا الأسلوب') : ''}
     ${k === 'research' ? researchHtml('', 'ما يخص البحث') : ''}`,
    true,
    'kindSec',
  );
}
/**
 * شكل المتون تحت المفتاح base — كل ما في لوحة المتون في المنضدة: موضع التعليق وجهته ومساحته، وسطوره، وعنوانه،
 * و«قبل المتن»، وتباعد سطور المتن، وأرقام الأبيات، والتقسيم، وخانات صاحب النسخة في الغلاف الداخلي.
 * ما لم يُختر هنا فاختيار المستخدم؛ وما اختير يصير له حين يختار الأسلوب، ثم يغيّره إن شاء.
 */
function mutunLookHtml(base, title) {
  const m = get(S.e.settings, base) || {};
  const L = MUTUN_LIMITS;
  const has = (k) => m[k] !== undefined;
  const clr = (k, label, none) => `<div class="field">${color(base + '.' + k, label, none)}${has(k) ? `<button type="button" class="link-btn" data-unset="${base}.${k}">اختياره</button>` : ''}</div>`;
  // نصٌّ له ثلاث حالات: غائب (اختيار المستخدم) · نص · فارغ (بلا عنوان)
  const txt3 = (k, label, ph, none, max) => `<label class="field"><span>${label}${m[k] === '' ? ` <small class="muted">(${none})</small>` : ''}</span><input class="inp" data-k="${base}.${k}" data-opt maxlength="${max}" value="${esc(m[k] || '')}" placeholder="${esc(m[k] === '' ? none : ph)}" list="${k}List">
      <span class="row wrap"><button type="button" class="link-btn" data-clear="${base}.${k}">${none}</button>${has(k) ? `<button type="button" class="link-btn" data-unset="${base}.${k}">اختياره</button>` : ''}</span></label>`;
  const own = m.mOwner && typeof m.mOwner === 'object' ? m.mOwner : null;
  const fields = own && Array.isArray(own.fields) && own.fields.length ? own.fields : OWNER_DEF;
  const ownOn = own ? own.on === true : null;
  return `<h4 class="sub">${title} <small class="muted">— ما لم يُختر فاختيار المستخدم في المنضدة، وما اختير يصير له مع الأسلوب ثم يغيّره إن شاء</small></h4>
    <details class="fk" open><summary>موضع التعليق</summary>
      <div class="rowf"><span class="lbl">موضعه</span>${optSeg(base + '.mPlace', MU_PLACE, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">الجهة</span>${optSeg(base + '.mSide', MU_SIDE, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">المتن في وسط صفحته</span>${optSeg(base + '.mCenter', YES_NO, 'اختياره')}</div>
      <div class="grid3">${optNum(base + '.mPages', 'صفحات التعليق (المقابلة)', 1, ...L.mPages, 'اختياره')}${optNum(base + '.mBelow', 'سطور التعليق تحته (٠ ما بقي)', 1, ...L.mBelow, 'اختياره')}${optNum(base + '.mSideW', 'عرض الهامش بجانبه (٪)', 1, ...L.mSideW, 'اختياره')}
        ${optNum(base + '.mBelowLines', 'سطور التعليق في Word', 1, 2, 40, 'اختياره')}${optNum(base + '.mLead', 'تباعد سطور المتن', 0.05, ...L.mLead, 'كالأسلوب')}</div>
    </details>
    <details class="fk"><summary>سطور التعليق</summary>
      <div class="rowf"><span class="lbl">شكلها</span>${optSeg(base + '.mRule', MU_RULE, 'اختياره')}</div>
      <div class="grid3">${optNum(base + '.mGap', 'ما بينها (مم)', 0.5, ...L.mGap, 'اختياره')}${clr('mRuleColor', 'لونها', 'الأصل')}</div>
    </details>
    <details class="fk"><summary>عنوان التعليق</summary>
      <div class="grid3">${txt3('mLabel', 'نصه', 'التعليقات', 'بلا عنوان', 60)}${optFont(base + '.mLabelFont', 'خطه', 'خط العناوين')}${optNum(base + '.mLabelSize', 'مقاسه (نقطة)', 0.5, ...L.mLabelSize, 'تلقائي')}</div>
      <div class="rowf"><span class="lbl">موضعه</span>${optSeg(base + '.mLabelAl', MU_AL, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">زينته</span>${optSeg(base + '.mLabelDeco', MU_DECO, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">عريض</span>${optSeg(base + '.mLabelBold', YES_NO, 'اختياره')}</div>
      ${clr('mLabelColor', 'لونه', 'لون الفصل')}
    </details>
    <details class="fk"><summary>قبل المتن («قال الناظم رحمه الله:»)</summary>
      <div class="grid3">${txt3('mIntro', 'النص', INTRO_PICKS[1], 'بلا نص', 80)}${optFont(base + '.mIntroFont', 'خطه', 'خط العناوين')}${optNum(base + '.mIntroSize', 'مقاسه (نقطة)', 0.5, ...L.mIntroSize, 'كالنص')}</div>
      <datalist id="mIntroList">${INTRO_PICKS.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <datalist id="mLabelList">${['التعليقات', 'الشرح', 'الفوائد', 'فقه الحديث', 'المسائل', 'ملحوظات'].map((t) => `<option value="${t}">`).join('')}</datalist>
      <div class="rowf"><span class="lbl">يوضع</span>${optSeg(base + '.mIntroAt', [['first', 'أول المتن'], ['heads', 'بعد كل باب وفصل'], ['units', 'أول كل جزء']], 'اختياره')}</div>
      <div class="rowf"><span class="lbl">موضعه</span>${optSeg(base + '.mIntroAl', MU_AL, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">زينته</span>${optSeg(base + '.mIntroDeco', MU_DECO, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">عريض</span>${optSeg(base + '.mIntroBold', YES_NO, 'اختياره')}</div>
      ${clr('mIntroColor', 'لونه', 'لون المتن')}
    </details>
    <details class="fk"><summary>أرقام الأبيات والتقسيم</summary>
      <div class="rowf"><span class="lbl">رقم البيت في المنظومة</span>${optSeg(base + '.mNum', MU_NUM, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">العدّ المتسلسل</span>${optSeg(base + '.mSeq', MU_NUM, 'اختياره')}</div>
      <div class="rowf"><span class="lbl">ترقيم الملف</span>${optSeg(base + '.mStrip', [[true, 'يُحذف ويرقّم ورّاق'], [false, 'يبقى كما هو']], 'اختياره')}</div>
      <div class="rowf"><span class="lbl">التقسيم</span>${optSeg(base + '.mDivide', [['auto', 'تلقائي'], ['heads', 'بالأبواب'], ['verses', 'بالأبيات'], ['lines', 'بالأسطر'], ['paras', 'بالفقرات']], 'اختياره')}</div>
      <div class="rowf"><span class="lbl">بالأبواب: يبدأ الجزء عند</span>${optSeg(base + '.mHead', [[1, 'كل باب'], [2, 'كل باب وفصل'], [4, 'كل عنوان']], 'اختياره')}</div>
      <div class="grid3">${optNum(base + '.mCount', 'العدد في كل جزء', 1, ...L.mCount, 'اختياره')}${optNum(base + '.mSeqFrom', 'يبدأ العدّ من', 1, ...L.mSeqFrom, 'اختياره')}</div>
    </details>
    <details class="fk" ${own ? 'open' : ''}><summary>الغلاف الداخلي: خانات صاحب النسخة${ownOn ? ' <span class="chip ok">تظهر</span>' : ownOn === false ? ' <span class="chip">لا تظهر</span>' : ''}</summary>
      <p class="muted small">أسفل الغلاف الداخلي يكتب الطالب اسمه ورقم هاتفه في نسخته (للمعاهد والدورات). اختر أن تظهر مع الأسلوب أو لا، أو اتركها لاختيار المستخدم. وتنسيق البطاقة يتبعها في الحالين: <code>.page.cover.has-owner</code> و<code>#book.mu-owner</code>، وفي قالب الغلاف <code>{{#owner}}…{{/owner}}</code> و<code>{{ownerBox}}</code> موضعها.</p>
      <div class="rowf"><span class="lbl">الخانات</span><div class="seg2" data-own-on="${base}"><button type="button" data-v="" aria-pressed="${ownOn === null}">اختياره</button><button type="button" data-v="1" aria-pressed="${ownOn === true}">تظهر</button><button type="button" data-v="0" aria-pressed="${ownOn === false}">لا تظهر</button></div></div>
      ${own ? `<div class="own-list" data-own="${base}">${fields.map((f, i) => `<div class="rowf own-row"><input class="inp" data-own-t="${i}" maxlength="40" value="${esc(f.t)}" aria-label="نص الخانة"><div class="seg2">${MU_FILL.map(([v, t]) => `<button type="button" data-own-f="${v}" data-i="${i}" aria-pressed="${(f.f || 'dots') === v}">${t}</button>`).join('')}</div><button type="button" class="ibtn danger" data-own-x="${i}" title="احذف الخانة">${ic('trash')}</button></div>`).join('')}
        ${fields.length < OWNER_MAX ? `<div class="rowf own-row"><input class="inp" data-own-new maxlength="40" placeholder="خانة أخرى، مثل: الرقم الأكاديمي"><button type="button" class="btn sm" data-own-add>${ic('plus')} أضفها</button></div>` : ''}</div>` : ''}
    </details>`;
}
/** ما يخص البحث (تحت base: '' للأسلوب نفسه، أو 'forKind.research.'): المسافة بعد الفقرة، ومقاسات الملخص والمصادر والإنجليزي ورقم الصفحة، وعنوان الفهرس */
function researchHtml(base, title) {
  return `<h4 class="sub">${title} <small class="muted">— فارغاً: كالأصل (١٥ · ١٤ · ١٢ · ١٢)</small></h4>
    <div class="grid3">${optNum(base + 'paraAfter', 'بعد الفقرة (نقطة)', 0.5, 0, 24, '٠')}${optNum(base + 'abstractSize', 'مقاس الملخص', 0.5, 9, 24, '١٥')}${optNum(base + 'refSize', 'مقاس المصادر', 0.5, 9, 24, '١٤')}
      ${optNum(base + 'enSize', 'مقاس النص الإنجليزي', 0.5, 8, 20, '١٢')}${optNum(base + 'folioSize', 'مقاس رقم الصفحة', 0.5, 8, 28, '١٢')}${optText(base + 'tocTitle', 'عنوان الفهرس', 'فهرس الموضوعات')}</div>`;
}
/** ما يخص نوعاً في forKind: الخط والمقاس والصفحة والتباعد والزخرفة، وما يخص ذلك النوع */
function fkOne(k, name) {
  const b = 'forKind.' + k;
  return `<details class="fk" ${get(S.e.settings, b) ? 'open' : ''}><summary>${name}${get(S.e.settings, b) ? ' <span class="chip ok">مخصَّص</span>' : ''}</summary>
      <div class="grid3">${optFont(b + '.fonts.body', 'خط النص', 'كالأسلوب')}${optFont(b + '.fonts.heading', 'خط العناوين', 'كالأسلوب')}${optNum(b + '.sizes.body', 'مقاس النص (نقطة)', 0.5, 9, 26, 'كالأسلوب')}
        ${optNum(b + '.sizes.note', 'مقاس الحاشية', 0.5, 7, 22, 'كالأسلوب')}${optNum(b + '.lineHeight', 'تباعد الأسطر', 0.05, 1.2, 2.8, 'كالأسلوب')}${optNum(b + '.page.w', 'عرض الصفحة (مم)', 1, 100, 300, 'كالأسلوب')}
        ${optNum(b + '.page.h', 'طول الصفحة (مم)', 1, 140, 420, 'كالأسلوب')}${optNum(b + '.page.side', 'الهامش الجانبي', 1, 6, 45, 'كالأسلوب')}${optNum(b + '.page.top', 'الهامش العلوي', 1, 6, 50, 'كالأسلوب')}
        ${optNum(b + '.page.bottom', 'الهامش السفلي', 1, 6, 50, 'كالأسلوب')}${optNum(b + '.indentMm', 'المسافة البادئة (مم)', 0.5, 0, 15, 'كالأسلوب')}${optNum(b + '.noteLineHeight', 'تباعد أسطر الحاشية', 0.05, 1.1, 2.6, 'كالأسلوب')}</div>
      <div class="rowf"><span class="lbl">الزخارف</span>${optSeg(b + '.ornaments', [[true, 'نعم'], [false, 'بلا زخرفة']], 'كالأسلوب')}</div>
      <div class="rowf"><span class="lbl">إطار الصفحة</span>${optSeg(b + '.frame', YES_NO, 'كالأسلوب')}</div>
      <div class="rowf"><span class="lbl">الترويسة</span>${optSeg(b + '.runningHead', YES_NO, 'كالأسلوب')}</div>
      <div class="rowf"><span class="lbl">موقع الفهرس</span>${optSeg(b + '.tocPosition', [['start', 'البداية'], ['end', 'النهاية'], ['none', 'بدون']], 'كالأسلوب')}</div>
      ${k === 'research' ? researchHtml(b + '.', 'ما يخص البحث') : ''}
      <button type="button" class="link-btn" data-fk-clear="${k}">أعده كالأسلوب</button></details>`;
}
/** الأسلوب الشامل: لكل نوعٍ ما يخصه (الخط والمقاس والصفحة والتباعد، والألوان)، وشكل المتون */
function forKindHtml() {
  return `<h4 class="sub">لكل نوعٍ ما يخصه</h4>${fkOne('books', 'الكتاب')}${fkOne('research', 'البحث')}${fkOne('mutun', 'المتن')}
    ${mutunLookHtml('forKind.mutun.mutunLook', 'شكل المتون')}`;
}
/** المحرِّر: الهامش الجانبي، والأنماط الجاهزة (تنبيه، فائدة، مصطلح…) */
function editorSec(s) {
  const U = s.ustyles || {};
  const list = Object.entries(U);
  const prev = (x) => {
    const st = x.st || {};
    return [st.font ? `font-family:'${String(st.font).replace(/['";]/g, '')}'` : '', st.color ? `color:${st.color}` : '', st.bold ? 'font-weight:700' : '', st.it ? 'font-style:italic' : '', st.bg ? `background:${st.bg}` : '', st.ul ? 'text-decoration:underline' : ''].filter(Boolean).join(';');
  };
  return sec(
    `المحرِّر: الهامش والأنماط${s.sideNote || list.length ? ' <span class="chip ok">مخصَّص</span>' : ''}`,
    `<p class="muted small">ما يُكتب في <b>هامش الصفحة</b> بجانب الفقرة (من «المحرِّر» أو «المساعد»)، والأنماط الجاهزة التي يجدها المستخدم في المحرِّر مع هذا الأسلوب. وما نسّقه بيده في كتابه يعلو ذلك.</p>
     <h4 class="sub">الهامش الجانبي</h4>
     <div class="grid3">${optNum('sideNote.size', 'مقاسه (نقطة)', 0.5, 6, 22, 'كالحاشية')}${optFont('sideNote.font', 'خطه', 'خط النص')}<div class="field">${color('sideNote.color', 'لونه', 'لون النص')}</div></div>
     <div class="rowf"><span class="lbl">محاذاته</span>${optSeg('sideNote.al', [['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار'], ['j', 'ضبط']], 'وسط')}</div>
     <div class="rowf"><span class="lbl">خطٌّ يفصله عن النص</span>${optSeg('sideNote.rule', [[true, 'نعم'], [false, 'بلا خط']], 'نعم')}</div>
     <div class="rowf"><span class="lbl">في خانة</span>${optSeg('sideNote.box', [[true, 'في خانةٍ بقدر نصه'], [false, 'بلا خانة']], 'بلا خانة')}</div>
     <p class="muted small">الخانة إطارٌ حول نص الهامش يتّسع ويضيق بقدره (ولا يزيد على عرض الهامش)، ويغني عن الخط الفاصل. وللمستخدم أن يغيّرها في المحرِّر.</p>
     <h4 class="sub">الأنماط الجاهزة</h4>
     <div class="ust-list">${list.length ? list.map(([id, x]) => `<div class="ust-row"><span class="ust-prev" style="${esc(prev(x))}">${esc(x.name)}</span><small class="muted">${x.kind === 'c' ? 'نمط حرف' : 'نمط فقرة'}${x.ps && x.ps.bx ? ' · ' + { box: 'إطار', double: 'مزدوج', shade: 'مظلَّل', side: 'خط جانبي' }[x.ps.bx] : ''}</small><button type="button" class="ibtn danger" data-ust-del="${esc(id)}" title="حذف">${ic('trash')}</button></div>`).join('') : '<p class="muted small">لا أنماط بعد.</p>'}</div>
     <div class="ust-add">
       <input class="inp" id="ustName" maxlength="40" placeholder="اسم النمط: تنبيه، فائدة، مصطلح…">
       <select class="inp" id="ustKind"><option value="p">نمط فقرة</option><option value="c">نمط حرف (كلمات)</option></select>
       <label class="mini"><input type="checkbox" id="ustBold"> عريض</label><label class="mini"><input type="checkbox" id="ustIt"> مائل</label>
       <label class="mini">اللون <input type="color" id="ustColor" value="#6B1D2F"></label><label class="mini"><input type="checkbox" id="ustColorOn" checked> بلونه</label>
       <select class="inp" id="ustBox"><option value="">بلا إطار</option><option value="box">إطار</option><option value="double">مزدوج</option><option value="shade">مظلَّل</option><option value="side">خط جانبي</option></select>
       <button type="button" class="btn sm" data-ust-add>${ic('plus')} أضف النمط</button>
     </div>`,
    !!(s.sideNote || list.length),
    'editorSec',
  );
}
/** الهامش الخارجي الواسع: النص أضيق والهامش في طرف الكتاب أوسع (shared/margin.js) — مع الأسلوب، وإلا فاختيار المستخدم */
function omHint() {
  const s = S.e.settings;
  const cm = (mm) => String(Math.round(mm * 10) / 100).replace('.', '٫').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const g0 = pageGeom({ ...s, outerMargin: null });
  const g1 = pageGeom({ ...s, outerMargin: { ...(s.outerMargin || {}), on: true } });
  return `معتاداً: النص ${cm(g0.text)} سم، والهامشان ${cm(g0.inner)} سم · واسعاً: النص ${cm(g1.text)} سم، والهامش الخارجي ${cm(g1.outer)} سم، والداخلي (عند الكعب) ${cm(g1.inner)} سم. والحواشي تضيق مع النص.`;
}
function marginSec(s) {
  const om = s.outerMargin || {};
  return sec(
    `الهامش الخارجي الواسع${om.on === true ? ' <span class="chip ok">واسع</span>' : om.on === false ? ' <span class="chip">معتاد</span>' : ''}`,
    `<p class="muted small">منطقة النص أضيق، والهامش الذي في <b>طرف الكتاب</b> أوسع يُكتب فيه (عناوين جانبية، تلخيص، تعليق): في صفحة ١٧ سم النص ١١ سم والهامش الخارجي ٤ سم، والهامش عند الكعب كما هو. يقع في يسار الصفحة اليسرى ويمين اليمنى، في الكتب والمتون والأبحاث. ويختاره المستخدم في «المنضدة ← التنضيد» وفي «المحرِّر»؛ وهنا ما يأتي مع هذا الأسلوب.</p>
     <div class="rowf"><span class="lbl">مع هذا الأسلوب</span>${optSeg('outerMargin.on', [[false, 'معتاد'], [true, 'واسع']], 'كما يختار المستخدم')}</div>
     <div class="grid3">${optNum('outerMargin.w', 'عرض الهامش الخارجي الواسع (مم)', 0.5, OUTER_MARGIN.min, OUTER_MARGIN.max, String(OUTER_MARGIN.w))}</div>
     <div class="rowf"><span class="lbl">الصفحة الفردية</span>${optSeg('outerMargin.odd', [['l', 'يسرى (الكتاب العربي)'], ['r', 'يمنى']], 'كما يختار المستخدم')}</div>
     <p class="muted small" id="omHint">${esc(omHint())}</p>
     <p class="muted small"><b>حدود الصفحة لتنسيقك</b> (الإطار والزخارف وخانات الهامش): <code>var(--t-l)</code> و<code>var(--t-r)</code> بُعد حافتي النص عن يسار الصفحة ويمينها (تتبدّلان بين الصفحتين)، و<code>var(--x-l)</code> <code>var(--x-r)</code> ما زيد للهامش الواسع، و<code>.page.pg-l</code> <code>.page.pg-r</code> الصفحة اليسرى واليمنى، و<code>#book.om-wide</code> حين يكون واسعاً. ومن رسم إطاراً حول النص فليجعل في <code>--mside-clear</code> (على <code>.page.content</code>) بُعدَه عن حافة النص وزيادة، فتوضع خانات الهامش خارجه لا عليه؛ و<code>--mside-edge</code> بُعدها عن حافة الورق، و<code>--mside-bottom</code> أدنى ما تنزل إليه. وإطار الصفحة في «أشكال جاهزة» يفعل ذلك وحده. و<b>خانة الهامش</b> <code>.mside-n.framed</code> بقدر ما كُتب فيها: غيّر حدّها وخلفيتها وحشوها وزخرفتها (<code>::before</code> <code>::after</code>)، لا عرضها ولا موضعها. ولا خلفية تتكرر (<code>repeat</code>): تصير في PDF صورةً نقطية.</p>`,
    om.on !== undefined || om.w !== undefined || om.odd !== undefined,
    'marginSec',
  );
}
const sec = (title, body, open = true, id = '') => `<details class="ed-sec" ${open ? 'open' : ''} ${id ? `id="${id}"` : ''}><summary>${title}</summary><div class="ed-body">${body}</div></details>`;

function renderForm() {
  const s = S.e.settings;
  const x = S.e.extras;
  const imgs = Object.entries(x.images);
  const adv = Object.keys(x.templates).length || x.pages.length;
  const hasCode = !!(x.script && x.script.trim());
  const anyX = imgs.length || x.css.trim() || adv || hasCode;
  const withCur = (list, cur) => [...new Set([...list, cur])].map((o) => [o, o]);
  $('#form').innerHTML =
    sec('البيانات', `
      <label class="field"><span>وصف قصير (يظهر تحت اسم الأسلوب عند المستخدم)</span><textarea class="inp" id="descInp" rows="2" maxlength="200">${esc(S.e.desc)}</textarea></label>
      ${ADMIN ? `<label class="sw"><span>ظاهر للمستخدمين</span><input type="checkbox" id="visInp" ${S.e.hidden ? '' : 'checked'}></label>` : '<p class="muted small">أسلوبك محفوظ عندك، ويظهر في صفحة الإخراج مع أساليب دور النشر. نزّل بطاقته لتحتفظ به أو تنقله<span class="site-only">، ولصاحب الموقع أن يركّبها فيراه الجميع</span>.</p>'}`) +
    kindSec(s) +
    editorSec(s) +
    marginSec(s) +
    sec(`أشكال جاهزة للعناصر${Object.keys(s.design || {}).length ? ' <span class="chip ok">مختارة</span>' : ''}`, `
      <p class="muted small">أشكال معدّة لعناصر الكتاب بألوان الأسلوب وخطوطه، بلا كود. تُختار هنا من القوائم، أو بعيّناتها المرسومة في <a href="${ADMIN ? '/maker/?admin=1&id=' : '/maker/?id='}${encodeURIComponent(S.e.id)}">🎨 الصانع السريع</a> (احفظ تعديلك هنا أولاً). وتنسيق البطاقة الخاص (CSS) يغلبها إن تعارضا.</p>
      <div class="grid3">${Object.entries(DESIGN_PARTS).map(([g, part]) => `<label class="field"><span>${esc(part.label)}</span><select class="inp" data-design="${g}">${Object.entries(part.opts).map(([o, t]) => `<option value="${o}" ${((s.design || {})[g] || 'default') === o ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`).join('')}</div>`, !!Object.keys(s.design || {}).length, 'designSec') +
    sec('المتن المضمَّن في الشرح', `
      <div class="swatches" data-swatch="matnColor">${MATN_COLORS.map((c) => `<button type="button" class="swb" data-v="${c.v}" aria-pressed="${String(s.matnColor).toLowerCase() === c.v.toLowerCase()}"><i style="background:${c.v}"></i>${c.label}</button>`).join('')}
        <label class="swb"><input type="color" data-k="matnColor" value="${s.matnColor}"> مخصص</label></div>
      <div class="grid2">
        ${chk('matnBold', 'خط عريض للمتن')}
        <label class="field inline-f"><span>الأقواس</span>${sel('matnBrackets', [['()', '( )'], ['«»', '« »'], ['[]', '[ ]'], ['{}', '{ }'], ['none', 'بلا أقواس']])}</label>
      </div>
      ${chk('matnQawluhu', 'إبراز المتن المقتبس في الشرح بعد «قوله»')}
      ${color('quotedColor', 'لون المتن المقتبس', 'مثل لون المتن')}`) +
    sec('التنسيق والتخصيص', `
      ${chk('footnotes', 'الحواشي السفلية')}
      ${chk('ornaments', 'الزخارف (الفاصل الزخرفي وزخرفة الغلاف)')}
      ${chk('frame', 'إطار حول الصفحة')}
      ${chk('quranInMatn', 'الآية داخل المتن بلون المتن')}
      <div class="grid2">${optText('tocTitle', 'عنوان الفهرس', 'فهرس الموضوعات')}</div>
      <div class="rowf"><span class="lbl">موقع الفهرس</span>${seg('tocPosition', [['start', 'بداية الكتاب'], ['end', 'نهاية الكتاب'], ['none', 'بدون']])}</div>
      <div class="rowf"><span class="lbl">عناوين الفهرس</span>${[1, 2, 3].map((n) => `<label class="mini"><input type="checkbox" data-toc="${n}" ${(s.tocInclude || []).includes(n) ? 'checked' : ''}> ${['الأبواب (H1)', 'الفصول (H2)', 'الفرعية (H3)'][n - 1]}</label>`).join('')}</div>
      <div class="colors">${color('headingColors.1', 'لون الأبواب')}${color('headingColors.2', 'لون الفصول')}${color('headingColors.3', 'العناوين الفرعية')}${color('quranColor', 'لون الآيات')}</div>
      <div class="rowf"><span class="lbl">بعد انتهاء الشرح</span>${seg('sharhEnd', [['page', 'المتن في أول صفحة جديدة'], ['ornament', 'ثلاثة رموز ثم المتن']])}</div>
      <div class="grid2">
        <label class="field"><span>الرمز الزخرفي</span><input class="inp" data-k="ornament" list="ornList" value="${esc(s.ornament)}" maxlength="24"><datalist id="ornList">${ORNAMENTS.map((o) => `<option value="${o}">`).join('')}</datalist></label>
        <label class="field"><span>شطرا البيت</span>${sel('verseLayout', [['line', 'موازي: الشطران في سطر واحد'], ['stack', 'سلّمي: الأول يميناً والثاني في السطر التالي يساراً'], ['stagger', 'سلّمي متداخل: والثاني يبدأ قبل نهاية الأول'], ['center', 'وسط: كل شطر في وسط سطره'], ['khams', 'تخميس: بيتان ثم شطر في الوسط'], ['tri', 'ثلاثي: بيت ثم شطر في الوسط']])}</label>
        <label class="field"><span>بين الشطرين (في السطر الواحد)</span>${sel('verseSep', [['none', 'لا شيء'], ['one', 'رمز واحد'], ['three', 'ثلاثة رموز']])}</label>
        <label class="field"><span>رمز الأبيات</span>${sel('verseSepSymbol', withCur(VERSE_SEPS, s.verseSepSymbol))}</label>
        <div class="field">${color('verseColor', 'لون الأبيات', 'مثل لون النص')}</div>
      </div>
      ${chk('chapterNewPage', 'بدء الأبواب في صفحة جديدة')}
      ${chk('runningHead', 'ترويسة الصفحات (اسم الكتاب/الباب)')}
      ${chk('widowOrphan', 'لا سطرٌ وحده من فقرة في أسفل الصفحة أو أعلاها (اليتيم والأرمل)')}
      ${chk('runts', 'لا كلمةٌ وحدها في آخر الفقرة (الأقزم)')}
      ${chk('mergeBroken', 'دمج الفقرات المقطوعة بين صفحات المصدر')}`) +
    sec(`الطباعة${S.e.print ? ' <span class="chip ok">إعدادات خاصة</span>' : ''}`, `
      ${chk('printReady', 'نسخة جاهزة للطباعة (يختارها المستخدم مبدئياً مع هذا الأسلوب)')}
      <div class="colors">${color('basmalaColor', 'لون البسملة', 'مثل لون الأبواب')}</div>
      <div class="field"><span>صورة البسملة مع هذا الأسلوب <small class="muted">— وللمستخدم أن يختار غيرها</small></span>${basmalaPicker(s.basmalaId)}</div>
      <div class="pr-own">
        <span>${S.e.print ? 'لهذا الأسلوب <b>إعدادات طباعة خاصة به</b> (تسلسل الصفحات، العنوان المختصر، الترقيم، هامش التجليد) تسافر مع بطاقته.' : 'تسلسل الصفحات والترقيم وهامش التجليد: يتبع <a href="#/print">إعدادات الطباعة العامة</a>.'}</span>
        <a class="btn sm" href="#/edit/${S.e.id}/print">🖨️ ${S.e.print ? 'تعديل طباعة هذا الأسلوب' : 'تخصيص طباعة هذا الأسلوب'}</a>
      </div>`, !!(s.printReady || S.e.print), 'printSec') +
    sec('الخطوط والمقاسات والألوان العامة', `
      <div class="grid2">
        ${fontSel('fonts.body', 'خط المتن')}${fontSel('fonts.heading', 'خط العناوين')}
        ${fontSel('fonts.cover', 'خط عنوان الغلاف')}${fontSel('fonts.names', 'خط اسم المؤلف والمحقق')}
      </div>
      ${
        ADMIN
          ? '<p class="muted small">لإضافة خط جديد: دار ابن فقيه ← «الخطوط». الخطوط المضافة معلَّمة بنجمة ★.</p>'
          : `<div class="field"><span>خطوط هذا الأسلوب <small class="muted">— تسافر معه وتعمل في PDF والمعاينة (◆ في القوائم)</small></span>
        <div class="xfonts">${S.e.fonts.map((f, i) => `<span class="chip">${esc(f.label)} <small>${f.weight === '700' ? 'عريض' : f.weight === 'all' ? 'كل الأوزان' : 'عادي'}</small> <button type="button" class="link-btn" data-font-del="${i}" title="حذف">×</button></span>`).join('')}
          <label class="btn sm">${ic('upload')} إضافة خط<input type="file" id="xfontFile" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" multiple hidden></label></div></div>`
      }
      <div class="grid3">
        ${numF('sizes.body', 'المتن (نقطة)', 0.5, 9, 26)}${numF('sizes.note', 'الحاشية', 0.5, 7, 22)}${numF('lineHeight', 'تباعد الأسطر', 0.05, 1.2, 2.8)}
        ${numF('sizes.h1', 'الأبواب', 0.5, 12, 44)}${numF('sizes.h2', 'الفصول', 0.5, 11, 38)}${numF('sizes.h3', 'الفرعية', 0.5, 10, 32)}
        ${numF('sizes.h4', 'المستوى الرابع', 0.5, 9, 30)}${numF('page.w', 'عرض الصفحة (مم)', 1, 100, 300)}${numF('page.h', 'طول الصفحة (مم)', 1, 140, 420)}
        ${numF('page.side', 'الهامش الجانبي (مم)', 1, 6, 45)}${numF('page.top', 'الهامش العلوي', 1, 6, 50)}${numF('page.bottom', 'الهامش السفلي', 1, 6, 50)}
        ${numF('noteLineHeight', 'تباعد أسطر الحاشية', 0.05, 1.1, 2.6)}${numF('indentMm', 'المسافة البادئة (مم)', 0.5, 0, 15)}
      </div>
      <div class="colors">${color('textColor', 'لون النص')}${color('ornamentColor', 'لون الزخارف')}${color('ruleColor', 'لون الخطوط والإطار')}${color('headingColors.4', 'عناوين المستوى الرابع')}</div>
      ${chk('hadithBold', 'خط عريض للأحاديث بين «»')}
      ${chk('nabawiBold', 'قول النبي ﷺ بعد «قال ﷺ» ونحوها بخطٍّ عريض')}
      <div class="grid2">
        <label class="field"><span>عزو الآيات</span>${sel('ayahCite', [['', 'كما في الأصل'], ['matn', 'في المتن: [البقرة: ٢٥٥]'], ['note', 'في الحاشية: سورة البقرة، الآية ٢٥٥']])}</label>
        <label class="field"><span>نظام العناوين</span>${sel('headScheme', [['pro', 'التقسيم العلمي: الباب والفصل والمبحث والمطلب والفرع'], ['style', 'عناوين الأسلوب: كما صمّمها هذا الأسلوب']])}</label>
      </div>`, false) +
    sec(`إضافات البطاقة <small class="muted">— صور وتنسيقات خاصة بهذا الأسلوب</small>${anyX ? ' <span class="chip ok">مفعّلة</span>' : ''}`, `
      <p class="muted small">ما لا تغطيه إعدادات ورّاق يوضع هنا، ويُحفظ داخل بطاقة الأسلوب ويعمل في PDF والمعاينة. (ملف Word لا يتأثر بالإضافات.)</p>
      <div class="ximgs">${imgs.map(([n, v]) => `<figure class="ximg"><img src="${v}" alt=""><figcaption><code>${esc(n)}</code><button type="button" class="ibtn danger" data-ximg-del="${esc(n)}" title="حذف">${ic('trash')}</button></figcaption></figure>`).join('')}
        <label class="ximg add">${ic('upload')}<span>إضافة صورة</span><input type="file" id="ximgFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden></label></div>
      <div class="grid2">${Object.entries(S.slots).map(([k, label]) => `<label class="field"><span>${label}</span><select class="inp" data-slot="${k}"><option value="">— بلا —</option>${imgs.map(([n]) => `<option value="${esc(n)}" ${x.slots[k] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`).join('')}
        <label class="field"><span>ارتفاع زخرفة الأبواب (مم)</span><input class="inp" type="number" min="2" max="40" step="0.5" data-x="h1OrnamentMm" value="${x.h1OrnamentMm}"></label>
        <label class="field"><span>ارتفاع الفاصل الزخرفي (مم)</span><input class="inp" type="number" min="2" max="40" step="0.5" data-x="separatorMm" value="${x.separatorMm}"></label>
      </div>
      <label class="field"><span>تنسيق خاص (CSS) — للصورة اكتب <code>asset(اسمها)</code></span><textarea class="inp code" id="cssInp" rows="6" dir="ltr" spellcheck="false" placeholder=".h1 { letter-spacing: .5px }&#10;.page.content { background: asset(frame) center/100% 100% no-repeat }">${esc(x.css)}</textarea></label>
      <p class="muted small" dir="rtl">أهم العناصر: <code>.page.cover</code> الغلاف الداخلي · <code>.page.content</code> صفحة المتن · <code>.h1 .h2 .h3</code> العناوين · <code>.m</code> المتن المضمَّن · <code>.q</code> الآيات · <code>.verse</code> الأبيات · <code>.orn</code> الفاصل الزخرفي · <code>.fn</code> الحاشية · <code>.toc-e</code> سطر الفهرس · <code>.cv-title .cv-author</code> عنوان الغلاف واسم المؤلف · <code>.page.odd</code> و<code>.page.even</code> الصفحة الفردية والزوجية · <code>.page.pg-l</code> و<code>.page.pg-r</code> الصفحة اليسرى واليمنى من الكتاب المفتوح · <code>.page.opens</code> صفحة تبدأ بباب. وألوان الإعدادات وخطوطها متغيرات: <code>var(--c-h1)</code> <code>var(--c-rule)</code> <code>var(--f-heading)</code>… فيتبع التنسيق ما يُختار في الإعدادات.</p>
      <details class="adv" ${adv ? 'open' : ''} id="advSec"><summary>قوالب العناصر والصفحات الخاصة (HTML) <small class="muted">— لتغيير بنية الصفحة لا ألوانها فقط</small></summary>
        <div class="ed-body">
          <p class="muted small">القالب يحل محل بناء العنصر الافتراضي. القيم بين قوسين مزدوجين: <code>{{text}}</code> نص العنوان · <code>{{n_ar}}</code> رقمه (أو رقم الصفحة) بالأرقام المشرقية · <code>{{n}}</code> بالأرقام اللاتينية · <code>{{n_word}}</code> كتابةً · <code>{{first}}</code> و<code>{{rest}}</code> أول كلمة من العنوان وباقيه · <code>{{title}}</code> اسم الكتاب · <code>{{chapter}}</code> و<code>{{section}}</code> الباب والفصل الجاريان. · <code>{{total_ar}}</code> عدد الصفحات · <code>{{author}}</code> المؤلف. وللصورة: <code>src="asset(اسمها)"</code>. والمرجع الكامل في <code>docs/style-card-spec.md</code>.</p>
          ${Object.entries(S.templates).map(([k, label]) => `<label class="field"><span>${esc(label)} <code>${k}</code></span><textarea class="inp code" dir="ltr" spellcheck="false" rows="${x.templates[k] ? 4 : 1}" data-tpl="${k}">${esc(x.templates[k] || '')}</textarea></label>`).join('')}
          <h4 class="sub">صفحات خاصة <small class="muted">— صفحة كاملة من تصميمك في موضع من الكتاب</small></h4>
          ${x.pages.map((pg, i) => `<div class="xpage" data-i="${i}">
              <div class="rowf"><select class="inp" data-pg="at">${Object.entries(S.pageAt).map(([k, t]) => `<option value="${k}" ${pg.at === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
                <input class="inp" data-pg="name" value="${esc(pg.name || '')}" placeholder="اسم لاتيني للتنسيق" dir="ltr" maxlength="30">
                <label class="mini"><input type="checkbox" data-pg="folio" ${pg.folio ? 'checked' : ''}> يظهر رقم الصفحة</label>
                <button type="button" class="ibtn danger" data-pg-del title="حذف الصفحة">${ic('trash')}</button></div>
              <textarea class="inp code" dir="ltr" spellcheck="false" rows="5" data-pg="html" placeholder="<div class=&quot;basmala&quot;>بسم الله الرحمن الرحيم</div>">${esc(pg.html || '')}</textarea>
            </div>`).join('')}
          <button type="button" class="btn sm" data-pg-add>${ic('plus')} صفحة خاصة</button>
        </div>
      </details>
      ${ADMIN ? '' : '<p class="muted small">البرنامج (الكود) الذي يغيّر آلية التنضيد لا يعمل في أساليبك الخاصة؛ يعمل حين تُركَّب البطاقة في «أساليب دور النشر».</p>'}
      <details class="adv" ${hasCode ? 'open' : ''} id="codeSec" ${ADMIN ? '' : 'hidden'}><summary>برنامج الأسلوب (كود) <small class="muted">— لتغيير آلية التنضيد نفسها</small></summary>
        <div class="ed-body">
          <p class="muted small">كود JavaScript يعمل داخل مستند التنضيد قبل أن يبدأ، ويسجّل دواله في <code>W</code>: <code>W.on('page', fn)</code> عند إنشاء كل صفحة · <code>W.on('pageDone', fn)</code> بعد ترقيمها · <code>W.set('used', fn)</code> و<code>W.set('place', fn)</code> لاستبدال منطق القياس والتوزيع. المرجع: <code>docs/style-card-spec.md</code>. الكود معزول: لا يتصل بالشبكة ولا يصل إلى ورّاق.</p>
          <label class="sw"><span>تشغيل البرنامج</span><input type="checkbox" id="scriptOn" ${x.scriptOn === false ? '' : 'checked'}></label>
          <textarea class="inp code" id="scriptInp" rows="${hasCode ? 14 : 4}" dir="ltr" spellcheck="false" placeholder="W.on('pageDone', (page, info) => { /* … */ });">${esc(x.script || '')}</textarea>
          <p class="script-state" id="scriptState" hidden></p>
        </div>
      </details>`, !!anyX, 'extrasSec');
  paintBasmalas();
}

/** اللوحة التي يخصها التغيير */
function focusOf(k) {
  if (/^matn|^quotedColor/.test(k)) return 'sharh';
  if (k === 'sharhEnd') return 'sharh';
  if (k === 'ornament') return 'sharhOrn';
  if (k === 'runningHead') return 'sharhPage';
  if (/^headingColors|^footnotes$|^chapterNewPage$|^sizes\.h/.test(k)) return 'heads';
  if (/^quranColor$|^verse/.test(k)) return 'verses';
  if (/^toc/.test(k)) return 'toc';
  if (/^fonts\.(cover|names)$/.test(k) || k === 'printReady' || k === 'basmalaColor' || k === 'basmalaId') return 'cover';
  return null;
}
function changed(k) {
  markDirty();
  if (/^(page\.|outerMargin)/.test(k || '') && $('#omHint')) $('#omHint').textContent = omHint();
  // تغيير يخص البسملة: المعاينة تنتقل إلى صفحتها (في لوحة الغلاف: الصفحات غير البيضاء مما قبل الكتاب)
  if (S.preview && /^basmala/.test(k || '') && S.e.settings.printReady) {
    const pr = S.e.print || PR.site;
    const inked = pr.front.filter((x) => x.type !== 'blank').map((x) => x.type);
    const xs = S.e.extras.pages.filter((p) => String(p.html || '').trim());
    const ci = inked.indexOf('cover');
    const bi = inked.indexOf('basmala');
    if (bi >= 0) S.preview.goto('cover', xs.filter((p) => p.at === 'start').length + bi + (bi > ci ? xs.filter((p) => p.at === 'afterCover').length : 0));
  }
  S.preview && S.preview.update(focusOf(k || ''));
}

const form = $('#form');
form.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.k) {
    const k = t.dataset.k;
    // حقلٌ اختياري فارغ: يُحذف (فيتبع الأصل)
    if (t.dataset.opt !== undefined && t.value === '') {
      unset(S.e.settings, k);
      return changed(k);
    }
    let v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? get(S.e.settings, k) : Number(t.value)) : t.value;
    set(S.e.settings, k, v);
    if (t.type === 'color') {
      t.parentElement.classList.remove('empty');
      if (k === 'matnColor') $$('[data-swatch="matnColor"] [data-v]', form).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    }
    return changed(k);
  }
  if (t.id === 'descInp') { S.e.desc = t.value; return markDirty(); }
  if (t.id === 'visInp') { S.e.hidden = !t.checked; return markDirty(); }
  if (t.id === 'cssInp') { S.e.extras.css = t.value; return changed(); }
  if (t.dataset.tpl) {
    if (t.value.trim()) S.e.extras.templates[t.dataset.tpl] = t.value;
    else delete S.e.extras.templates[t.dataset.tpl];
    return changed(t.dataset.tpl === 'cover' ? 'fonts.cover' : 'headingColors');
  }
  if (t.dataset.pg) {
    const pg = S.e.extras.pages[+t.closest('.xpage').dataset.i];
    pg[t.dataset.pg] = t.type === 'checkbox' ? t.checked : t.value;
    return changed('fonts.cover');
  }
  if (t.id === 'blankInp') { S.e.extras.options.blankPage = t.checked; return changed('fonts.cover'); }
  if (t.id === 'scriptInp') { S.e.extras.script = t.value; return changed(); }
  if (t.id === 'scriptOn') { S.e.extras.scriptOn = t.checked; return changed(); }
  if (t.dataset.x) { S.e.extras[t.dataset.x] = Number(t.value) || S.e.extras[t.dataset.x]; return changed(t.dataset.x === 'separatorMm' ? 'ornament' : 'headingColors'); }
  if (t.dataset.toc) {
    S.e.settings.tocInclude = $$('[data-toc]', form).filter((x) => x.checked).map((x) => +x.dataset.toc);
    return changed('tocInclude');
  }
});
form.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.ownT !== undefined) {
    const list = t.closest('[data-own]');
    const k = list.dataset.own + '.mOwner';
    const cur = get(S.e.settings, k) || { on: true, fields: [] };
    const fields = (Array.isArray(cur.fields) && cur.fields.length ? cur.fields : OWNER_DEF).map((f) => ({ ...f }));
    const v = t.value.trim().slice(0, 40);
    if (v) fields[+t.dataset.ownT] = { ...fields[+t.dataset.ownT], t: v };
    else fields.splice(+t.dataset.ownT, 1);
    set(S.e.settings, k, { ...cur, fields });
    keepOpen(renderForm);
    return changed('mOwner');
  }
  if (t.dataset.design) {
    S.e.settings.design = cleanDesign({ ...(S.e.settings.design || {}), [t.dataset.design]: t.value });
    return changed({ cover: 'fonts.cover', toc: 'tocInclude', orn: 'ornament', matn: 'matnColor' }[t.dataset.design] || 'headingColors');
  }
  if (t.dataset.slot) {
    if (t.value) S.e.extras.slots[t.dataset.slot] = t.value;
    else delete S.e.extras.slots[t.dataset.slot];
    return changed({ coverBg: 'fonts.cover', pageBg: 'headingColors', h1Ornament: 'headingColors', separator: 'ornament' }[t.dataset.slot]);
  }
  if (t.id === 'xfontFile') {
    const files = [...t.files];
    t.value = '';
    return addFontFiles(files);
  }
  if (t.id === 'ximgFile') {
    const files = [...t.files];
    t.value = '';
    return addImages(files);
  }
  // بعد اختيار لون: إعادة رسم (لتحديث «مثل لون المتن»)
  if (t.type === 'color' && /quotedColor|verseColor|basmalaColor/.test(t.dataset.k || '')) keepOpen(renderForm);
  else if (t.type === 'color' && (t.dataset.k || '') === 'headingColors.1') paintBasmalas();
});
form.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const segEl = b.closest('[data-seg]');
  if (segEl) {
    const k = segEl.dataset.seg;
    const raw = b.dataset.v;
    if (segEl.dataset.opt !== undefined && raw === '') unset(S.e.settings, k);
    else set(S.e.settings, k, raw === 'true' ? true : raw === 'false' ? false : /^\d+(\.\d+)?$/.test(raw) && /(mPages|mHead)$/.test(k) ? Number(raw) : raw);
    $$('button', segEl).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    // نوع الأسلوب: يظهر ما يخصه (المتون، وما يخص كل نوعٍ في الشامل)
    if (k === 'kind') {
      if (raw === 'research') S.e.settings.research = true;
      else delete S.e.settings.research;
      keepOpen(renderForm);
    }
    return changed(k);
  }
  // المعاينة: كتاباً أو متناً أو بحثاً
  if (b.dataset.pv) {
    S.pv = b.dataset.pv;
    $$('[data-pv]', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    return S.preview && S.preview.update();
  }
  // ما يُترك لاختيار المستخدم: يُحذف من الأسلوب
  if (b.dataset.unset) {
    unset(S.e.settings, b.dataset.unset);
    keepOpen(renderForm);
    return changed(b.dataset.unset.split('.').pop());
  }
  // خانات صاحب النسخة (الاسم ورقم الهاتف…): تظهر مع الأسلوب، أو لا، أو اختيار المستخدم؛ ونصوصها وما بعد كلٍّ منها
  const ownOn = b.closest('[data-own-on]');
  if (ownOn) {
    const k = ownOn.dataset.ownOn + '.mOwner';
    const cur = get(S.e.settings, k);
    if (b.dataset.v === '') unset(S.e.settings, k);
    else set(S.e.settings, k, { on: b.dataset.v === '1', fields: cur && Array.isArray(cur.fields) && cur.fields.length ? cur.fields : OWNER_DEF.map((f) => ({ ...f })) });
    keepOpen(renderForm);
    return changed('mOwner');
  }
  const ownList = b.closest('[data-own]');
  if (ownList && (b.dataset.ownF || b.dataset.ownX !== undefined || b.dataset.ownAdd !== undefined)) {
    const k = ownList.dataset.own + '.mOwner';
    const cur = get(S.e.settings, k) || { on: true, fields: [] };
    const fields = (Array.isArray(cur.fields) && cur.fields.length ? cur.fields : OWNER_DEF).map((f) => ({ ...f }));
    if (b.dataset.ownF) fields[+b.dataset.i].f = b.dataset.ownF;
    else if (b.dataset.ownX !== undefined) fields.splice(+b.dataset.ownX, 1);
    else {
      const t = ($('[data-own-new]', ownList).value || '').trim().slice(0, 40);
      if (!t) return toast('اكتب نص الخانة', true);
      fields.push({ t, f: (fields[fields.length - 1] || {}).f || 'dots' });
    }
    set(S.e.settings, k, { ...cur, fields });
    keepOpen(renderForm);
    return changed('mOwner');
  }
  if (b.dataset.fkClear) {
    if (S.e.settings.forKind) delete S.e.settings.forKind[b.dataset.fkClear];
    if (S.e.settings.forKind && !Object.keys(S.e.settings.forKind).length) delete S.e.settings.forKind;
    keepOpen(renderForm);
    return changed('kind');
  }
  if (b.dataset.ustDel) {
    if (S.e.settings.ustyles) delete S.e.settings.ustyles[b.dataset.ustDel];
    if (S.e.settings.ustyles && !Object.keys(S.e.settings.ustyles).length) delete S.e.settings.ustyles;
    keepOpen(renderForm);
    return changed('ustyles');
  }
  if (b.dataset.ustAdd !== undefined) {
    const name = ($('#ustName').value || '').trim().slice(0, 40);
    if (!name) return toast('اكتب اسم النمط', true);
    const kind = $('#ustKind').value === 'c' ? 'c' : 'p';
    const st = {};
    if ($('#ustBold').checked) st.bold = true;
    if ($('#ustIt').checked) st.it = 1;
    if ($('#ustColorOn').checked) st.color = $('#ustColor').value;
    const bx = $('#ustBox').value;
    const id = 's' + Date.now().toString(36).slice(-6);
    S.e.settings.ustyles = { ...(S.e.settings.ustyles || {}), [id]: { name, kind, ...(Object.keys(st).length ? { st } : {}), ...(kind === 'p' && bx ? { ps: { bx, sb: 2, sa: 2 } } : {}) } };
    keepOpen(renderForm);
    return changed('ustyles');
  }
  const sw = b.closest('[data-swatch]');
  if (sw && b.dataset.v) {
    S.e.settings[sw.dataset.swatch] = b.dataset.v;
    $$('[data-v]', sw).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('input[type=color]', sw).value = b.dataset.v;
    return changed(sw.dataset.swatch);
  }
  if (b.dataset.bsm !== undefined) {
    S.e.settings.basmalaId = b.dataset.bsm;
    $$('.bsm-opt', form).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    return changed('basmalaId');
  }
  if (b.dataset.clear) {
    set(S.e.settings, b.dataset.clear, '');
    keepOpen(renderForm);
    return changed(b.dataset.clear);
  }
  if (b.dataset.fontDel !== undefined) {
    S.e.fonts.splice(+b.dataset.fontDel, 1);
    keepOpen(renderForm);
    return changed('fonts.body');
  }
  if (b.dataset.pgAdd !== undefined) {
    S.e.extras.pages.push({ at: 'afterCover', name: '', folio: false, html: '' });
    return keepOpen(renderForm);
  }
  if (b.dataset.pgDel !== undefined) {
    S.e.extras.pages.splice(+b.closest('.xpage').dataset.i, 1);
    keepOpen(renderForm);
    return changed('fonts.cover');
  }
  if (b.dataset.ximgDel) {
    const n = b.dataset.ximgDel;
    delete S.e.extras.images[n];
    for (const k of Object.keys(S.e.extras.slots)) if (S.e.extras.slots[k] === n) delete S.e.extras.slots[k];
    keepOpen(renderForm);
    return changed();
  }
});
function keepOpen(fn) {
  const open = Object.fromEntries($$('details', form).map((d, i) => [d.id || i, d.open]));
  fn();
  $$('details', form).forEach((d, i) => { if (open[d.id || i] !== undefined) d.open = open[d.id || i]; });
  showScriptState();
}

const readDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});
async function addImages(files) {
  for (const f of files) {
    if (f.size > 4 * 1024 * 1024) { toast(`${f.name}: أكبر من ٤ م.ب`, true); continue; }
    let name = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'img';
    while (S.e.extras.images[name]) name += '2';
    S.e.extras.images[name] = await readDataUrl(f);
  }
  keepOpen(renderForm);
  $('#extrasSec').open = true;
  changed();
}

$('#nameInp').addEventListener('input', (e) => { S.e.name = e.target.value; markDirty(); });
$('#backBtn').addEventListener('click', () => { location.hash = '#/'; });

const payload = () => ({ name: S.e.name.trim(), desc: S.e.desc, hidden: S.e.hidden, settings: S.e.settings, extras: S.e.extras, print: S.e.print });
async function save() {
  if (!S.e.name.trim()) return toast('اكتب اسم الأسلوب', true);
  if (!ADMIN) {
    const st = await saveMyStyle({ id: S.e.id, name: S.e.name.trim(), desc: S.e.desc, base: S.e.base, settings: S.e.settings, extras: S.e.extras, print: S.e.print, fonts: S.e.fonts });
    S.styles = S.styles.map((x) => (x.id === st.id ? st : x));
    S.saved = snapshot();
    markDirty();
    setPick(st.id);
    toast('حُفظ في أساليبك — تجده في صفحة الإخراج');
    if (EMBED) parent.postMessage({ warraq: 'maker', type: 'saved', id: st.id, stay: true }, location.origin);
    return;
  }
  const st = await api('PUT', '/api/admin/styles/' + S.e.id, { style: payload() });
  S.styles = S.styles.map((x) => (x.id === st.id ? st : x));
  S.e.modified = st.modified;
  $('#resetBuiltin').hidden = !(st.builtin && st.modified);
  $('#edChips').innerHTML = st.builtin ? `<span class="chip">${st.modified ? 'مضمّن · معدّل' : 'أسلوب مضمّن'}</span>` : '<span class="chip cover">من إضافتك</span>';
  S.saved = snapshot();
  markDirty();
  toast('حُفظ الأسلوب — يظهر للمستخدمين الآن');
}
$('#saveBtn').addEventListener('click', () => save().catch(fail));
$('#cardBtn').addEventListener('click', async () => {
  try {
    const p = payload();
    if (!ADMIN) {
      await downloadMyCard({ name: p.name || 'أسلوب', desc: p.desc, base: S.e.base, settings: p.settings, extras: p.extras, print: p.print, fonts: S.e.fonts });
      return toast('نُزّلت بطاقة الأسلوب (بحالته الحالية)');
    }
    await downloadCard({ format: 'warraq-style', version: p.extras.script && p.extras.script.trim() ? 3 : 2, name: p.name || 'أسلوب', desc: p.desc, settings: p.settings, extras: p.extras, ...(p.print ? { print: p.print } : {}), exportedAt: new Date().toISOString() });
    toast('نُزّلت بطاقة الأسلوب (بحالته الحالية)');
  } catch (e) { fail(e); }
});
$('#resetBuiltin').addEventListener('click', async () => {
  if (!confirm('إعادة هذا الأسلوب المضمّن إلى أصله وحذف تعديلاتك عليه؟')) return;
  try {
    await api('DELETE', '/api/admin/styles/' + S.e.id);
    const id = S.e.id;
    S.e = null;
    await load();
    initEditor(id);
    toast('أُعيد الأسلوب إلى أصله');
  } catch (e) { fail(e); }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && (S.e || S.view === 'print')) {
    e.preventDefault();
    (S.view === 'print' ? savePrint() : save()).catch(fail);
  }
});

$('#closeEmbed')?.addEventListener('click', () => {
  if (dirty() && !confirm('في الأسلوب تغييرات غير محفوظة. هل تخرج دون حفظ؟')) return;
  parent.postMessage({ warraq: 'maker', type: 'close' }, location.origin);
});

route();
