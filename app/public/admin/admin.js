// لوحة تحكم «ورّاق»
import { toArabicDigits as ar, escapeHtml as esc } from '/shared/arabic.js';
import { TEMPLATES } from '/shared/presets.js';
import { packShelves, spineWidth, isNarrow, watchWidth } from '/js/shelf.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-warraq': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = {};
  try {
    data = await r.json();
  } catch {}
  if (r.status === 404 && data.error === 'not found') {
    // انتهت مهلة تصريح الباب الخفي قبل الدخول
    showAuth({ expired: true });
    throw new Error('انتهت مهلة الدخول. ارجع إلى الموقع وادخل من الباب مجدداً.');
  }
  if (r.status === 401 && !path.endsWith('/login')) {
    showAuth();
    throw new Error(data.error || 'يلزم تسجيل الدخول');
  }
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3000);
}
function status(el, msg, ok) {
  el.hidden = !msg;
  el.className = 'status' + (ok === false ? ' err' : '');
  el.textContent = msg || '';
}
const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat('ar-SA-u-nu-arab', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');

/* ---------------------------------------------------------------- الدخول */
let setupMode = false;
function showAuth(st = {}) {
  $('#panel').hidden = true;
  $('#logoutBtn').hidden = true;
  $('#authCard').hidden = false;
  setupMode = !st.configured && st.canSetup;
  $('#authTitle').textContent = setupMode ? 'إنشاء كلمة سر المالك' : 'تسجيل الدخول';
  $('#authBtn').textContent = setupMode ? 'إنشاء والدخول' : 'دخول';
  $('#pw2Wrap').hidden = !setupMode;
  $('#pw').autocomplete = setupMode ? 'new-password' : 'current-password';
  $('#authHint').textContent = st.expired
    ? 'انتهت مهلة الدخول (١٥ دقيقة). ارجع إلى الموقع وادخل من الباب مجدداً.'
    : setupMode
    ? 'أول تشغيل: اختر كلمة سر (٨ أحرف فأكثر) لحماية دار ابن فقيه. هذه الخطوة متاحة من الجهاز نفسه فقط.'
    : st.configured === false
      ? 'لم تُضبط كلمة سر بعد. افتح هذه الصفحة من جهاز الخادم نفسه، أو اضبط متغير البيئة ADMIN_PASSWORD.'
      : '';
  $('#pw').focus();
}

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#pw').value;
  if (setupMode && pw !== $('#pw2').value) return status($('#authErr'), 'كلمتا السر غير متطابقتين', false);
  try {
    await api(setupMode ? '/api/admin/setup' : '/api/admin/login', { method: 'POST', body: { password: pw } });
    $('#pw').value = $('#pw2').value = '';
    status($('#authErr'), '');
    enterPanel();
  } catch (err) {
    status($('#authErr'), err.message, false);
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  location.replace('/');
});

function enterPanel() {
  $('#authCard').hidden = true;
  $('#panel').hidden = false;
  $('#logoutBtn').hidden = false;
  loadSettings();
  loadFonts();
  loadFeedback();
  // رابط مباشر إلى تبويب (مثل /admin/#fonts من استوديو الأغلفة)
  const tab = document.querySelector(`.tabs button[data-tab="${location.hash.slice(1)}"]`);
  if (tab) tab.click();
  goTo();
}
/** «افتح الإعدادات» من موضعٍ في البرنامج (مثل التفريغ في مجلس الدرس): إلى تبويبه ولوحته */
function goTo() {
  let g = null;
  try {
    g = JSON.parse(localStorage.getItem('warraq.adminGo') || 'null');
    localStorage.removeItem('warraq.adminGo');
  } catch {}
  if (!g || $('#panel').hidden) return;
  const t = document.querySelector(`.tabs button[data-tab="${g.tab}"]`);
  if (t) t.click();
  if (g.scope) {
    const sc = document.querySelector(`#aiScopes [data-scope="${g.scope}"]`);
    if (sc && sc.getAttribute('aria-selected') !== 'true') sc.click();
  }
  if (g.panel) setTimeout(() => document.getElementById(g.panel)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 400);
}
window.addEventListener('storage', (e) => e.key === 'warraq.adminGo' && e.newValue && goTo());
window.addEventListener('focus', () => goTo());

/* ---------------------------------------------------------------- التبويبات */
$$('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('.tab').forEach((t) => (t.hidden = t.id !== 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'ai') loadSettings();
    if (b.dataset.tab === 'feedback') loadFeedback();
    if (b.dataset.tab === 'fonts') loadFonts();
    if (b.dataset.tab === 'downloads') loadDownloads();
    if (b.dataset.tab === 'sources') loadSources();
    if (b.dataset.tab === 'look') loadLook();
    if (b.dataset.tab === 'account') loadAccount();
  }),
);

/* ---------------------------------------------------------------- ١) الذكاء الاصطناعي (أي مزوّد): ثلاثة أقسام */
let ai = { kinds: [], providers: [], summary: {}, log: [], scopes: [], reusable: [] };
// القسم المعروض: التنضيد (استخراج بيانات الكتاب)، أو المحرِّر (المساعد)، أو الرَّحل
// في البرنامج: الواجهة داخل نافذة المكتب (وفيها جسر البرنامج)
const ON_DESK = (() => {
  try {
    return !!(window.warraqDesktop || window.top.warraqDesktop);
  } catch {
    return false;
  }
})();
let aiScope = (() => {
  try {
    return { typeset: 1, editor: 1, rahl: 1 }[localStorage.getItem('warraq.aiScope')] ? localStorage.getItem('warraq.aiScope') : 'typeset';
  } catch {
    return 'typeset';
  }
})();
const sq = (path) => path + (path.includes('?') ? '&' : '?') + 'scope=' + aiScope;
const SCOPE_TEXT = {
  typeset: {
    title: 'الذكاء الاصطناعي في التنضيد',
    hint: 'يعمل مع أي مزوّد وأي مفتاح. أضف مفتاحاً أو أكثر فتصير سلسلة احتياطية: يُجرَّب الأول، فإن تعذّر فالتالي، ثم الخوارزمية الثابتة. المستخدم لا يرى أي خطأ في كل الأحوال.',
    live: 'تُستدعى عند فتح أي كتاب، ويُحفظ الرد يوماً كاملاً.',
    on: 'فُعّل الذكاء الاصطناعي في التنضيد',
    off: 'أُوقف في التنضيد — ورّاق يعمل بالخوارزمية',
    reasons: { disabled: 'الميزة موقوفة — ورّاق يعمل بالخوارزمية الثابتة.', 'no-key': 'لا توجد مفاتيح بعد — ورّاق يعمل بالخوارزمية الثابتة.', paused: 'كل المزوّدين متوقفون مؤقتاً — ورّاق يعمل بالخوارزمية حتى يعودوا تلقائياً.' },
  },
  editor: {
    title: 'مساعد المحرِّر',
    hint: 'نافذةٌ بجانب الصفحة في المحرِّر: حدّد نصاً واطلب ما تريد (تدقيقاً، أو ضبطاً بالشكل، أو شرحاً، أو تخريجاً…) فيصله مع سياقه: الكتاب ومؤلفه، وكونه متناً أو شرحاً أو حاشية؛ أو راجع الفصل والكتاب كله؛ أو اسأله منفصلاً. للمساعد سلسلته: يُجرَّب الأول، فإن تعذّر فالتالي.',
    live: 'يظهر المساعد في المحرِّر بجانب الصفحة.',
    on: 'فُعّل مساعد المحرِّر',
    off: 'أُوقف مساعد المحرِّر',
    reasons: { disabled: 'المساعد موقوف — لا يظهر في المحرِّر.', 'no-key': 'لا مفاتيح لهذا القسم بعد — أضف مفتاحاً، أو استعمل مفتاحاً من قسم التنضيد.', paused: 'كل المزوّدين متوقفون مؤقتاً، ويعودون تلقائياً.' },
  },
  rahl: {
    title: 'مساعد الرَّحل',
    hint: 'نافذةٌ في القارئ على الرَّحل، بثلاث طرق: «مرتبط بالصفحة» (يصله نص الصفحة المفتوحة وما كتبتَه عليها، واسم الكتاب)، و«مرتبط بالمقطع» (يصله رابط الدرس الذي بجانب الكتاب وعنوانه، وتفريغه حين يُضاف)، و«منفصل» (سؤالك وحده). وجوابه يُنسخ أو يصير ملاحظةً على الصفحة.',
    live: 'يظهر المساعد في القارئ على الرَّحل.',
    on: 'فُعّل مساعد الرَّحل',
    off: 'أُوقف مساعد الرَّحل',
    reasons: { disabled: 'المساعد موقوف — لا يظهر في الرَّحل.', 'no-key': 'لا مفاتيح لهذا القسم بعد — أضف مفتاحاً، أو استعمل مفتاحاً من قسمٍ آخر.', paused: 'كل المزوّدين متوقفون مؤقتاً، ويعودون تلقائياً.' },
  },
};
const kindOf = (id) => ai.kinds.find((k) => k.id === id);
const fmtTime = (iso) => new Intl.DateTimeFormat('ar-SA-u-nu-arab', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
const secs = (ms) => ar((ms / 1000).toFixed(1)).replace('.', '٫');
const FIELD_LABELS = { main_title: 'العنوان الرئيسي', sub_title: 'العنوان الفرعي', book_type: 'نوع الكتاب', author_title: 'اللقب', author_short: 'اسم الشهرة', editor_name: 'المحقق' };
const TYPE_AR = { matn: 'متن', sharh: 'شرح', hashiya: 'حاشية', sharh_and_hashiya: 'شرح وحاشية' };

async function loadSettings() {
  ai = await api(sq('/api/admin/ai'));
  if ($('#newKind').options.length === 1) {
    $('#newKind').insertAdjacentHTML('beforeend', ai.kinds.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join(''));
  }
  $('#aiEnabled').checked = ai.summary.enabled;
  renderScopes();
  renderSummary();
  renderReuse();
  renderProviders();
  renderLog();
  if (aiScope === 'editor' || aiScope === 'rahl') loadEditorPrompts();
  const cur = $('#tryOnly').value;
  $('#tryOnly').innerHTML = '<option value="">كل السلسلة</option>' + ai.providers.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  $('#tryOnly').value = ai.providers.some((p) => p.id === cur) ? cur : '';
}

/** شريط الأقسام، وما يخص القسم المعروض */
function renderScopes() {
  const T = SCOPE_TEXT[aiScope];
  for (const b of $$('#aiScopes [data-scope]')) {
    const sc = (ai.scopes || []).find((x) => x.id === b.dataset.scope) || {};
    b.setAttribute('aria-selected', String(b.dataset.scope === aiScope));
    b.classList.toggle('is-off', sc.enabled === false || !sc.providers);
    b.querySelector('.sc-n').textContent = sc.providers ? ar(sc.providers) : '';
    b.querySelector('.sc-n').title = sc.providers ? `${ar(sc.providers)} مفتاح${sc.enabled === false ? ' — موقوف' : ''}` : 'لا مفاتيح';
  }
  $('#aiTitle').textContent = T.title;
  $('#aiHint').textContent = T.hint;
  $('#aiLab').hidden = aiScope !== 'typeset';
  $('#edNotePanel').hidden = $('#edPresetsPanel').hidden = aiScope === 'typeset';
  // التفريغ المباشر: في الرَّحل، وفي البرنامج وحده (مجلس الدرس)
  $('#sttPanel').hidden = !(aiScope === 'rahl' && ON_DESK);
  if (!$('#sttPanel').hidden) loadStt();
  $('#edNoteHint').textContent = aiScope === 'rahl' ? 'ما تريد أن يلتزمه مساعد الرَّحل دائماً، مثل: «اشرح لي كمبتدئ»، أو «أنا أدرس على المذهب الحنبلي»، أو «اختصر الجواب». وفي «منفصل» يُرسل هذا وحده مع سؤالك.' : 'ما تريد أن يلتزمه المساعد دائماً، مثل: «اعتمد رسم المصحف في الآيات»، أو «لا تُبدل الألفاظ العامية في الحكايات»، أو «اكتب الأرقام بالهندية». وفي «منفصل» يُرسل هذا وحده مع سؤالك.';
  $('#addTitle').textContent = ai.reusable && ai.reusable.length ? 'أو أضف مفتاحاً جديداً' : 'إضافة مفتاح';
}
$('#aiScopes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scope]');
  if (!b || b.dataset.scope === aiScope) return;
  aiScope = b.dataset.scope;
  try {
    localStorage.setItem('warraq.aiScope', aiScope);
  } catch {}
  show($('#newMsg'), '');
  show($('#tryOut'), '');
  loadSettings();
});

/** مفاتيح الأقسام الأخرى: تُستعمل هنا بنقرة (المفتاح نفسه، لا نسخة) */
function renderReuse() {
  const list = ai.reusable || [];
  const box = $('#reuseBox');
  box.hidden = !list.length;
  if (!list.length) return (box.innerHTML = '');
  box.innerHTML = `<h4 class="sec">استعمل مفتاحاً من قسمٍ آخر</h4>
    <p class="hint">بلا نسخٍ ولا إعداد: يُستعمل المفتاح نفسه (وإن غيّرته هناك تغيّر هنا)، ولك أن تختار له هنا نموذجاً غير نموذجه.</p>
    <div class="ru-list">${list
      .map(
        (p) => `<button type="button" class="ru" data-ref="${esc(p.id)}"><span class="ru-n"><b>${esc(p.label)}</b><small>${esc(p.kindLabel)} · <span dir="ltr">${esc(p.model || '')}</span></small></span><span class="ru-from">من ${esc(p.scopeLabel)}</span><code dir="ltr">${esc(p.keyMasked || '—')}</code><span class="ru-add">＋ استعمله هنا</span></button>`,
      )
      .join('')}</div>`;
}
$('#reuseBox').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ref]');
  if (!b) return;
  b.disabled = true;
  try {
    const p = await api(sq('/api/admin/ai/providers'), { method: 'POST', body: { ref: b.dataset.ref, scope: aiScope } });
    toast('أُضيف المفتاح إلى سلسلة هذا القسم، ونختبره الآن…');
    await loadSettings();
    runProvider(p.id, 'test');
  } catch (err) {
    b.disabled = false;
    toast(err.message);
  }
});

function renderSummary() {
  const s = ai.summary;
  const T = SCOPE_TEXT[aiScope];
  const ok = s.available && s.available.ok;
  $('#aiSum').innerHTML = `
    <div class="sum-state ${ok ? 'ok' : 'off'}"><b>${ok ? '● نشطة' : '○ غير نشطة'}</b><small>${ok ? esc(T.live) : esc(T.reasons[s.available && s.available.reason] || '')}</small></div>
    <div><b>${ar(s.active || 0)}<span class="muted"> / ${ar(s.providers || 0)}</span></b><small>مزوّد مفعّل</small></div>
    <div><b>${ar(s.calls || 0)}</b><small>استدعاء اليوم</small></div>
    <div><b>${ar(s.ok || 0)}</b><small>نجح</small></div>
    <div><b>${ar(s.fails || 0)}</b><small>فشل (انتقل للتالي)</small></div>`;
}

function provState(p) {
  const s = p.state || {};
  if (!p.enabled) return ['off', 'معطّل'];
  if (s.pausedUntil) return ['warn', `متوقف مؤقتاً حتى ${fmtDate(s.pausedUntil)}`];
  if (s.lastErrorAt && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt)) return ['warn', 'آخر محاولة فشلت'];
  if (s.lastOkAt) return ['ok', 'يعمل ✓'];
  return ['idle', 'لم يُختبر بعد'];
}

function renderProviders() {
  const list = ai.providers;
  if (!list.length) {
    $('#provList').innerHTML = '<p class="empty">لا توجد مفاتيح. الصق مفتاحك في الأعلى واضغط «إضافة إلى السلسلة».</p>';
    return;
  }
  $('#provList').innerHTML = list
    .map((p, i) => {
      const k = kindOf(p.kind) || { models: [] };
      const [cls, txt] = provState(p);
      const s = p.state || {};
      const ro = p.fromEnv ? 'disabled' : '';
      const roRef = p.fromEnv || p.ref ? 'disabled' : '';
      const where = p.ref ? ` · <span class="p-ref" title="المفتاح نفسه من قسمٍ آخر: يُغيَّر مفتاحه وعنوانه هناك">مفتاح ${esc(p.refScopeLabel)}</span>` : p.usedIn && p.usedIn.length ? ` · <span class="p-ref" title="يُستعمل هذا المفتاح نفسه في قسمٍ آخر">يُستعمل أيضاً في ${esc(p.usedIn.join(' و'))}</span>` : '';
      return `<div class="prov ${p.enabled ? '' : 'is-off'}${p.ref ? ' is-ref' : ''}" data-id="${esc(p.id)}">
        <div class="p-top">
          <span class="rank">${ar(i + 1)}</span>
          <div class="p-name"><b>${esc(p.label)}</b><small>${esc(p.kindLabel)}${p.fromEnv ? ' · من متغيرات البيئة' : ''}${where}</small></div>
          <span class="pill ${cls}">${esc(txt)}</span>
          <label class="switch sm" title="تفعيل هذا المزوّد"><input type="checkbox" data-f="enabled" ${p.enabled ? 'checked' : ''} ${ro}><span></span></label>
        </div>
        <div class="p-grid">
          <div class="kv"><small>المفتاح</small><span class="mono">${esc(p.keyMasked || '— بلا مفتاح —')}</span></div>
          <label class="kv"><small>النموذج</small><input data-f="model" list="ml-${esc(p.id)}" value="${esc(p.model)}" dir="ltr" spellcheck="false" ${ro}>
            <datalist id="ml-${esc(p.id)}">${(k.models || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist></label>
          <label class="kv"><small>عنوان الخدمة</small><input data-f="baseUrl" value="${esc(p.baseUrl)}" dir="ltr" spellcheck="false" ${roRef}></label>
        </div>
        <div class="p-stats">اليوم: ${ar(s.calls || 0)} استدعاء · ${ar(s.ok || 0)} نجح · ${ar(s.fails || 0)} فشل${s.lastMs ? ` · آخر زمن استجابة ${secs(s.lastMs)} ث` : ''}${s.lastOkAt ? ` · آخر نجاح ${fmtDate(s.lastOkAt)}` : ''}</div>
        ${s.lastError && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt) ? `<div class="p-err">آخر خطأ (${fmtDate(s.lastErrorAt)}): <b>${esc(s.lastError)}</b>${s.lastDetail ? `<code dir="ltr">${esc(s.lastDetail)}</code>` : ''}</div>` : ''}
        <div class="p-tools">
          <button class="btn small" data-act="test">🧪 اختبار</button>
          <button class="btn small" data-act="models">جلب النماذج</button>
          ${p.fromEnv ? '' : `${p.ref ? '' : '<button class="btn small" data-act="key">تغيير المفتاح</button>'}<button class="btn small" data-act="rename">تسمية</button>`}
          <span class="spacer"></span>
          ${p.fromEnv ? '' : `<button class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} title="رفع الأولوية">▲</button>
          <button class="btn small" data-act="down" ${i === list.length - 1 || list[i + 1].fromEnv ? 'disabled' : ''} title="خفض الأولوية">▼</button>
          <button class="btn small danger" data-act="del">حذف</button>`}
        </div>
        <div class="result" data-out hidden></div>
      </div>`;
    })
    .join('');
}

function renderLog() {
  const tasks = aiScope !== 'typeset';
  $('#aiLog').innerHTML = ai.log.length
    ? `<thead><tr><th>الوقت</th><th>المزوّد</th><th>النموذج</th><th>${tasks ? 'الطلب' : 'الكتاب'}</th><th>النتيجة</th><th>الزمن</th></tr></thead><tbody>` +
      ai.log
        .map(
          (e) => `<tr class="${e.ok ? 'ok' : 'bad'}"><td class="nw">${fmtTime(e.at)}</td><td>${esc(e.provider)}</td><td dir="ltr">${esc(e.model || '')}</td><td>${tasks ? esc(e.task || '—') : e.bookId ? ar(e.bookId) : '—'}</td>
          <td>${e.ok ? '✓ نجح' : '✗ ' + esc(e.error || '')}${!e.ok && e.detail ? `<small dir="ltr">${esc(e.detail.slice(0, 160))}</small>` : ''}</td><td class="nw">${secs(e.ms)} ث</td></tr>`,
        )
        .join('') +
      '</tbody>'
    : '<tbody><tr><td class="empty">لا استدعاءات بعد.</td></tr></tbody>';
}

/** عرض نتيجة اختبار */
function hintFor(r) {
  const s = r.status || 0;
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(r.detail || '')) return 'من Google AI Studio اضغط «Create API key» وانسخ المفتاح الجديد كاملاً، واختر مشروعاً فعّالاً.';
  if (/SERVICE_DISABLED|has not been used/.test(r.detail || '')) return 'فعّل «Generative Language API» لمشروع المفتاح في Google Cloud Console، أو أنشئ المفتاح من Google AI Studio مباشرة.';
  if (/REFERRER|referer|IP_ADDRESS/i.test(r.detail || '')) return 'أزل قيود المفتاح (المواقع/عناوين IP) من إعدادات Google Cloud، أو اجعلها «None».';
  if (s === 401 || s === 403) return 'تأكد أنك نسخت المفتاح كاملاً، وأنه يخص المزوّد المختار، وأنه مفعّل.';
  if (s === 404) return 'اسم النموذج أو عنوان الخدمة غير صحيح — اضغط «جلب النماذج» واختر منها.';
  if (s === 429) return 'الحصة انتهت أو الطلبات كثيرة. سيُتخطى هذا المزوّد مؤقتاً ويُجرَّب التالي.';
  if (s === 402) return 'أضف رصيداً في حساب المزوّد.';
  if (/الاتصال|المهلة/.test(r.error || '')) return 'تحقق من اتصال الإنترنت على جهاز الخادم ومن عنوان الخدمة.';
  return '';
}
function fieldsHtml(d) {
  return `<dl class="fields">${Object.entries(FIELD_LABELS)
    .map(([k, l]) => `<dt>${l}</dt><dd>${esc(k === 'book_type' ? TYPE_AR[d[k]] || d[k] || '—' : d[k] || '—')}</dd>`)
    .join('')}</dl>`;
}
function testHtml(r) {
  if (r.ok && r.reply != null) return `<div class="res ok"><b>✓ يعمل</b> — أجاب خلال ${secs(r.ms)} ث${r.model ? ` بالنموذج <span dir="ltr">${esc(r.model)}</span>` : ''}. سألناه أن يصحّح «ذهب الطالب الي المدرسه» فقال: <q class="reply">${esc(r.reply)}</q></div>`;
  if (r.ok) return `<div class="res ok"><b>✓ يعمل</b> — أجاب خلال ${secs(r.ms)} ث${r.model ? ` بالنموذج <span dir="ltr">${esc(r.model)}</span>` : ''}. هذا ما استخرجه لكتاب تجريبي:${fieldsHtml(r.sample)}</div>`;
  const h = hintFor(r);
  return `<div class="res err"><b>✗ ${esc(r.error || 'تعذّر')}</b>${r.detail ? `<div class="detail">رسالة المزوّد: <code dir="ltr">${esc(r.detail)}</code></div>` : ''}${h ? `<div class="tip">💡 ${esc(h)}</div>` : ''}</div>`;
}
function show(el, html) {
  el.hidden = !html;
  el.innerHTML = html || '';
}
const busy = (el, msg) => show(el, `<div class="res"><span class="spin"></span> ${esc(msg)}</div>`);

/* ---- إضافة مفتاح ---- */
function detectLocal(key) {
  let best = null;
  for (const k of ai.kinds) for (const pre of k.prefixes || []) if (key.startsWith(pre) && (!best || pre.length > best.pre.length)) best = { k, pre };
  if (best) return { kind: best.k.id, label: best.k.label };
  if (key.startsWith('sk-')) return { ambiguous: true };
  return null;
}
function refreshDetect() {
  const key = $('#newKey').value.trim();
  const chosen = $('#newKind').value;
  const el = $('#detect');
  if (!key || chosen) {
    el.hidden = !chosen;
    if (chosen) el.innerHTML = `المزوّد المختار: <b>${esc(kindOf(chosen).label)}</b>`;
    el.className = 'detect';
    return;
  }
  const d = detectLocal(key);
  el.hidden = false;
  if (d && d.kind) {
    el.className = 'detect ok';
    el.innerHTML = `✓ تعرّفنا عليه من بدايته: <b>${esc(d.label)}</b>`;
  } else if (d && d.ambiguous) {
    el.className = 'detect warn';
    el.innerHTML = 'يبدأ بـ <code>sk-</code> وقد يكون لأكثر من مزوّد — اضغط «تعرّف وجلب النماذج» وسنتحقق منه.';
  } else {
    el.className = 'detect warn';
    el.innerHTML = 'لم نتعرف على المزوّد من بدايته — اضغط «تعرّف وجلب النماذج» لتجربة المزوّدين المعروفين، أو اختر المزوّد من الخيارات المتقدمة.';
  }
}
function applyKindHints() {
  const k = kindOf($('#newKind').value || (detectLocal($('#newKey').value.trim()) || {}).kind);
  $('#newModel').placeholder = k && k.model ? k.model : 'اسم النموذج';
  $('#newBase').placeholder = k && k.baseUrl ? k.baseUrl : 'https://…/v1';
  if (k && !$('#newModels').dataset.probed) $('#newModels').innerHTML = (k.models || []).map((m) => `<option value="${esc(m)}">`).join('');
}
$('#newKey').addEventListener('input', () => {
  delete $('#newModels').dataset.probed;
  refreshDetect();
  applyKindHints();
});
$('#newKind').addEventListener('change', () => {
  delete $('#newModels').dataset.probed;
  refreshDetect();
  applyKindHints();
  if ($('#newKind').value === 'custom') $('#newBase').focus();
});
$('#showKey').addEventListener('click', () => {
  const k = $('#newKey');
  k.type = k.type === 'password' ? 'text' : 'password';
  $('#showKey').textContent = k.type === 'password' ? 'إظهار' : 'إخفاء';
});
const draft = () => ({ key: $('#newKey').value, kind: $('#newKind').value, baseUrl: $('#newBase').value.trim(), model: $('#newModel').value.trim(), label: $('#newLabel').value.trim() });
const needKey = () => {
  const d = draft();
  if (!d.key.trim() && d.kind !== 'custom') {
    show($('#newMsg'), '<div class="res err">الصق المفتاح أولاً.</div>');
    $('#newKey').focus();
    return null;
  }
  return d;
};

$('#probeKey').addEventListener('click', async () => {
  const d = needKey();
  if (!d) return;
  const unknown = !d.kind && !d.baseUrl && !detectLocal(d.key.trim());
  busy($('#newMsg'), unknown ? 'نجرّب المزوّدين المعروفين…' : 'نتحقق من المفتاح ونجلب النماذج…');
  try {
    const r = await api('/api/admin/ai/detect', { method: 'POST', body: { ...d, probe: true, all: unknown } });
    if (r.ok) {
      $('#newKind').value = r.kind;
      $('#newModels').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join('');
      $('#newModels').dataset.probed = '1';
      if (!$('#newModel').value) $('#newModel').value = r.model || '';
      $('#adv').open = true;
      refreshDetect();
      applyKindHints();
      show($('#newMsg'), `<div class="res ok"><b>✓ المفتاح مقبول لدى ${esc(r.label)}</b> — ${ar(r.models.length)} نموذجاً متاحاً. اخترنا <span dir="ltr">${esc(r.model || '—')}</span>، ويمكنك تغييره من «النموذج».</div>`);
    } else {
      const tried = (r.tried || []).map((t) => `<li><b>${esc(t.label)}</b>: ${esc(t.error)}${t.detail ? ` <code dir="ltr">${esc(t.detail.slice(0, 200))}</code>` : ''}</li>`).join('');
      show($('#newMsg'), `<div class="res err"><b>✗ ${esc(r.error)}</b>${tried ? `<ul class="tried">${tried}</ul>` : ''}${r.unknown ? '<div class="tip">💡 اختر المزوّد من «خيارات متقدمة»، أو اختر «عنوان مخصص» وضع عنوان الخدمة.</div>' : ''}</div>`);
      if (r.unknown) $('#adv').open = true;
    }
  } catch (err) {
    show($('#newMsg'), `<div class="res err">${esc(err.message)}</div>`);
  }
});

$('#testNew').addEventListener('click', async () => {
  const d = needKey();
  if (!d) return;
  busy($('#newMsg'), 'نرسل طلباً تجريبياً…');
  try {
    show($('#newMsg'), testHtml(await api(sq('/api/admin/ai/test'), { method: 'POST', body: { ...d, scope: aiScope } })));
  } catch (err) {
    show($('#newMsg'), `<div class="res err">${esc(err.message)}</div>`);
    if (/لم نتعرف/.test(err.message)) $('#adv').open = true;
  }
});

$('#addKey').addEventListener('click', async () => {
  const d = needKey();
  if (!d) return;
  try {
    const p = await api(sq('/api/admin/ai/providers'), { method: 'POST', body: { ...d, scope: aiScope } });
    for (const id of ['#newKey', '#newModel', '#newBase', '#newLabel']) $(id).value = '';
    $('#newKind').value = '';
    $('#detect').hidden = true;
    show($('#newMsg'), '');
    toast('أُضيف المفتاح إلى السلسلة، ونختبره الآن…');
    await loadSettings();
    runProvider(p.id, 'test');
  } catch (err) {
    show($('#newMsg'), `<div class="res err">${esc(err.message)}</div>`);
    if (/لم نتعرف|عنوان/.test(err.message)) $('#adv').open = true;
  }
});

/* ---- بطاقات السلسلة ---- */
async function runProvider(id, act) {
  const card = document.querySelector(`.prov[data-id="${CSS.escape(id)}"]`);
  const out = card && card.querySelector('[data-out]');
  if (!out) return;
  if (act === 'test') {
    busy(out, 'نرسل طلباً تجريبياً…');
    try {
      const r = await api(sq(`/api/admin/ai/providers/${id}/test`), { method: 'POST' });
      await loadSettings();
      const again = document.querySelector(`.prov[data-id="${CSS.escape(id)}"] [data-out]`);
      if (again) show(again, testHtml(r));
    } catch (err) {
      show(out, `<div class="res err">${esc(err.message)}</div>`);
    }
  } else if (act === 'models') {
    busy(out, 'نجلب قائمة النماذج…');
    const r = await api(sq(`/api/admin/ai/providers/${id}/models`), { method: 'POST' });
    if (r.ok) {
      card.querySelector('datalist').innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join('');
      show(out, `<div class="res ok">${ar(r.models.length)} نموذجاً متاحاً لهذا المفتاح — امسح حقل «النموذج» واختر من القائمة.<div class="mlist" dir="ltr">${r.models.slice(0, 80).map((m) => `<button type="button" class="chip" data-model="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>`);
    } else show(out, `<div class="res err"><b>✗ ${esc(r.error)}</b>${r.detail ? `<div class="detail"><code dir="ltr">${esc(r.detail)}</code></div>` : ''}</div>`);
  }
}

$('#provList').addEventListener('change', async (e) => {
  const card = e.target.closest('.prov');
  const f = e.target.dataset.f;
  if (!card || !f) return;
  const val = f === 'enabled' ? e.target.checked : e.target.value.trim();
  try {
    await api(sq('/api/admin/ai/providers/' + card.dataset.id), { method: 'PATCH', body: { [f]: val } });
    toast('حُفظ');
    loadSettings();
  } catch (err) {
    toast(err.message);
    loadSettings();
  }
});

$('#provList').addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-model]');
  const card = e.target.closest('.prov');
  if (!card) return;
  const id = card.dataset.id;
  if (chip) {
    await api(sq('/api/admin/ai/providers/' + id), { method: 'PATCH', body: { model: chip.dataset.model } });
    toast('اختير النموذج ' + chip.dataset.model);
    await loadSettings();
    return runProvider(id, 'test');
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  try {
    if (act === 'test' || act === 'models') return runProvider(id, act);
    if (act === 'key') {
      const k = prompt('الصق المفتاح الجديد لهذا المزوّد:');
      if (!k) return;
      await api(sq('/api/admin/ai/providers/' + id), { method: 'PATCH', body: { key: k } });
      toast('حُفظ المفتاح الجديد');
      await loadSettings();
      return runProvider(id, 'test');
    }
    if (act === 'rename') {
      const p = ai.providers.find((x) => x.id === id);
      const n = prompt('اسم للتمييز (اتركه فارغاً لاسم المزوّد):', p.customLabel ? p.label : '');
      if (n === null) return;
      await api(sq('/api/admin/ai/providers/' + id), { method: 'PATCH', body: { label: n } });
    }
    if (act === 'up' || act === 'down') {
      const ids = ai.providers.filter((p) => !p.fromEnv).map((p) => p.id);
      const i = ids.indexOf(id);
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api(sq('/api/admin/ai/order'), { method: 'POST', body: { ids, scope: aiScope } });
    }
    if (act === 'del') {
      const p = ai.providers.find((x) => x.id === id) || {};
      const msg = p.ref ? 'إزالة هذا المفتاح من سلسلة هذا القسم؟ (يبقى في قسمه)' : p.usedIn && p.usedIn.length ? `حذف هذا المزوّد ومفتاحه من السلسلة؟ يبقى في ${p.usedIn.join(' و')} نسخةً منه.` : 'حذف هذا المزوّد ومفتاحه من السلسلة؟';
      if (!confirm(msg)) return;
      await api(sq('/api/admin/ai/providers/' + id), { method: 'DELETE' });
      toast('حُذف');
    }
    loadSettings();
  } catch (err) {
    toast(err.message);
  }
});

$('#aiEnabled').addEventListener('change', async (e) => {
  try {
    await api(sq('/api/admin/ai'), { method: 'PUT', body: { enabled: e.target.checked, scope: aiScope } });
    toast(e.target.checked ? SCOPE_TEXT[aiScope].on : SCOPE_TEXT[aiScope].off);
    loadSettings();
  } catch (err) {
    e.target.checked = !e.target.checked;
    toast(err.message);
  }
});
$('#resetAi').addEventListener('click', async () => {
  await api('/api/admin/ai/reset', { method: 'POST' });
  toast('رُفع الإيقاف المؤقت عن كل المزوّدين');
  loadSettings();
});
$('#refreshAi').addEventListener('click', loadSettings);

/* ---- المختبر ---- */
$('#tryRun').addEventListener('click', async () => {
  const book = $('#tryBook').value.trim();
  if (!book) return $('#tryBook').focus();
  busy($('#tryOut'), 'نشغّل السلسلة…');
  try {
    const r = await api('/api/admin/ai/try', { method: 'POST', body: { book, only: $('#tryOnly').value } });
    const trail = (r.trail || [])
      .map((t) => `<li class="${t.ok ? 'ok' : t.skipped ? 'skip' : 'bad'}">${t.ok ? '✓' : t.skipped ? '⏭' : '✗'} <b>${esc(t.label)}</b>${t.ms != null ? ` — ${secs(t.ms)} ث` : ''}${t.error ? ` — ${esc(t.error)}` : ''}${t.detail ? ` <code dir="ltr">${esc(t.detail.slice(0, 200))}</code>` : ''}</li>`)
      .join('');
    const head = `<div class="try-h">📖 ${esc(r.book.name)} <small class="muted">(${ar(r.book.id)})</small></div>`;
    const body = r.data
      ? `<div class="res ok"><b>✓ أجاب ${esc(r.provider)}</b>${fieldsHtml(r.data)}</div>`
      : `<div class="res err"><b>لم يُجب أي مزوّد</b> — ${r.reason === 'no-key' ? 'لا توجد مفاتيح.' : 'سيُستعمل الاستخراج الخوارزمي للمستخدم دون أن يرى أي خطأ.'}</div>`;
    show($('#tryOut'), head + (trail ? `<ol class="trail">${trail}</ol>` : '') + body);
    loadSettings();
  } catch (err) {
    show($('#tryOut'), `<div class="res err">${esc(err.message)}</div>`);
  }
});
$('#tryBook').addEventListener('keydown', (e) => e.key === 'Enter' && $('#tryRun').click());

/* ---- مساعد المحرِّر: توجيهه العام وتوجيهاته الجاهزة ---- */
let edp = { presets: [], note: '', kinds: {}, targets: {} };
let edFilter = 'all';
const ED_OPEN = new Set();
// ما يصلح لكل موضع من أنواع الرد
const ED_KINDS_FOR = { sel: ['fix', 'answer', 'mhints', 'translate'], section: ['review', 'answer', 'structure', 'roles', 'units', 'mhints', 'translate'], book: ['review', 'answer', 'structure', 'roles', 'units', 'mhints', 'translate'], free: ['answer', 'translate'], page: ['answer'], clip: ['answer'] };
const ED_KIND_HINT = { fix: 'يُعاد النص مصحَّحاً: ترى الفرق ثم تستبدل', answer: 'جوابٌ يُقرأ ويُنسخ', review: 'مواضع أخطاء تُقبل واحداً واحداً أو كلها', structure: 'العناوين ومستوياتها: تُعلَّم بنقرة', roles: 'المتن من الشرح: يُعلَّم بنقرة', units: 'المتون: أجزاءٌ للتعليق بعناوينها، تُطبَّق بنقرة', mhints: 'المتون: رؤوس مسائل تُكتب خفيفةً في مواضع التعليق', translate: 'ترجمةٌ بمصادر الترجمة: تُعرض، ثم تُستبدل أو تُدرج أو تُنزَّل' };
async function loadEditorPrompts() {
  try {
    edp = await api(sq('/api/admin/ai/prompts?all=1'));
  } catch (err) {
    $('#edList').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  if (document.activeElement !== $('#edNote')) $('#edNote').value = edp.note || '';
  renderEdPresets();
}
function renderEdPresets() {
  const T = edp.targets || {};
  const counts = {};
  for (const p of edp.presets) counts[p.target] = (counts[p.target] || 0) + 1;
  $('#edFilter').innerHTML = [['all', 'الكل', edp.presets.length], ...Object.entries(T).map(([k, v]) => [k, v, counts[k] || 0])]
    .map(([k, v, n]) => `<button type="button" data-f="${k}" aria-pressed="${edFilter === k}">${esc(v)} <small>${ar(n)}</small></button>`)
    .join('');
  const list = edp.presets.map((p, i) => ({ p, i })).filter(({ p }) => edFilter === 'all' || p.target === edFilter);
  $('#edList').innerHTML = list.length
    ? list
        .map(({ p, i }) => {
          const open = ED_OPEN.has(p.id || p._tmp);
          const kinds = ED_KINDS_FOR[p.target] || ['answer'];
          return `<div class="ep${p.hidden ? ' is-off' : ''}${open ? ' open' : ''}" data-i="${i}">
            <div class="ep-top">
              <span class="ep-tg tg-${esc(p.target)}">${esc(T[p.target] || '')}</span>
              <button type="button" class="ep-name" data-act="open" aria-expanded="${open}"><b>${esc(p.title || 'بلا اسم')}</b><small>${esc(p.hint || '')}</small></button>
              <span class="ep-k" title="${esc(ED_KIND_HINT[p.kind] || '')}">${esc((edp.kinds || {})[p.kind] || '')}</span>
              ${p.only === 'mutun' ? '<span class="pill" title="يظهر حين يكون الكتاب متناً للتعليق">للمتون</span>' : ''}
              ${p.builtin ? (p.edited ? '<span class="pill warn" title="عدّلته عن أصله">معدَّل</span>' : '') : '<span class="pill ok">خاص</span>'}
              <label class="switch sm" title="${p.hidden ? 'مخفيٌّ من المساعد' : 'ظاهرٌ في المساعد'}"><input type="checkbox" data-f="shown" ${p.hidden ? '' : 'checked'}><span></span></label>
              <span class="ep-mv"><button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} title="أعلى">▲</button><button type="button" class="btn small" data-act="down" ${i === edp.presets.length - 1 ? 'disabled' : ''} title="أسفل">▼</button></span>
            </div>
            ${
              open
                ? `<div class="ep-body">
              <div class="grid2">
                <label class="field">الاسم<input data-f="title" maxlength="60" value="${esc(p.title || '')}"></label>
                <label class="field">وصفٌ قصير<input data-f="hint" maxlength="140" value="${esc(p.hint || '')}"></label>
                ${
                  p.builtin
                    ? ''
                    : `<label class="field">يعمل على<select data-f="target">${Object.entries(T).map(([k, v]) => `<option value="${k}" ${p.target === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
                <label class="field">نوع الرد<select data-f="kind">${kinds.map((k) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${esc((edp.kinds || {})[k] || k)} — ${esc(ED_KIND_HINT[k] || '')}</option>`).join('')}</select></label>
                <label class="field">يظهر في<select data-f="only"><option value="" ${!p.only ? 'selected' : ''}>كل الكتب</option><option value="mutun" ${p.only === 'mutun' ? 'selected' : ''}>المتون وحدها</option></select></label>`
                }
              </div>
              ${aiScope === 'editor' || aiScope === 'rahl' ? knowField(p) : ''}
              <label class="field">التوجيه<textarea data-f="prompt" rows="4" maxlength="4000" placeholder="${p.target === 'free' ? 'اكتب «…» حيث يُكمل المستخدم' : 'ما تريد من المساعد أن يفعله…'}">${esc(p.prompt || '')}</textarea></label>
              <p class="hint">${p.target === 'sel' ? 'يصله النص المحدَّد مع سياقه: اسم الكتاب ومؤلفه، والفصل، وكون النص متناً أو شرحاً أو حاشية، وما قبله وما بعده.' : p.target === 'free' ? 'يُرسل كما هو بلا سياق، و«…» يُكمله المستخدم قبل الإرسال.' : 'تصله فقرات ' + (p.target === 'book' ? 'المجلد كله' : 'الفصل الظاهر') + ' دفعاتٍ، مع اسم الكتاب ومؤلفه.'}</p>
              <div class="row">
                ${p.builtin && p.edited ? '<button type="button" class="btn small" data-act="reset">إرجاع الأصل</button>' : ''}
                ${p.builtin ? '' : '<button type="button" class="btn small danger" data-act="del">حذف</button>'}
                <span class="spacer"></span>
                <button type="button" class="btn small" data-act="open">إغلاق</button>
                <button type="button" class="btn small primary" data-act="save">حفظ</button>
              </div>
            </div>`
                : ''
            }
          </div>`;
        })
        .join('')
    : '<p class="empty">لا توجيهات هنا.</p>';
}
/** مصادر العلم للتوجيه (من «مصادر المعرفة»): تلقائي، أو عام (بلا مصادر)، أو قسمٌ بعينه أو أكثر */
function knowField(p) {
  if (p.kind === 'translate') return '';
  const cats = ((edp.know && edp.know.cats) || []).filter((c) => !c.free);
  const cur = String(p.know || '');
  const multi = cur && !['auto', 'general'].includes(cur) && !cats.some((c) => c.id === cur);
  return `<label class="field">مصادر العلم <small class="muted">(من الإعدادات ← مصادر المعرفة)</small><select data-f="know">
    <option value="" ${!cur ? 'selected' : ''}>ما يختاره المستخدم في المساعد</option>
    <option value="auto" ${cur === 'auto' ? 'selected' : ''}>تلقائي: بحسب النص</option>
    <option value="general" ${cur === 'general' ? 'selected' : ''}>عام: بلا مصادر</option>
    ${cats.map((c) => `<option value="${esc(c.id)}" ${cur === c.id ? 'selected' : ''}>${esc(c.name)}${c.ready ? '' : ' (لا مفتاح بعد)'}</option>`).join('')}
    ${multi ? `<option value="${esc(cur)}" selected>${esc(cur.split(',').map((id) => (cats.find((c) => c.id === id) || { name: id }).name).join(' + '))}</option>` : ''}
  </select></label>`;
}
/** القائمة كلها تُحفظ كما هي (الترتيب والإخفاء والتعديل) */
async function saveEdPresets(msg) {
  // (الجديد الذي لم يُكتب بعد لا يُحفظ)
  const r = await api(sq('/api/admin/ai/prompts'), { method: 'PUT', body: { presets: edp.presets.map(({ _tmp, ...p }) => p) } });
  edp.presets = r.presets;
  renderEdPresets();
  if (msg) toast(msg);
}
const edRow = (el) => {
  const row = el.closest('.ep');
  return row ? { row, i: +row.dataset.i, p: edp.presets[+row.dataset.i] } : null;
};
$('#edFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  edFilter = b.dataset.f;
  renderEdPresets();
});
$('#edList').addEventListener('change', async (e) => {
  const r = edRow(e.target);
  if (!r) return;
  const f = e.target.dataset.f;
  if (f === 'shown') {
    r.p.hidden = !e.target.checked;
    try {
      await saveEdPresets(e.target.checked ? 'يظهر في المساعد' : 'أُخفي من المساعد');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (f === 'target') {
    r.p.target = e.target.value;
    const ks = ED_KINDS_FOR[r.p.target] || ['answer'];
    if (!ks.includes(r.p.kind)) r.p.kind = ks[0];
    readEdFields(r);
    renderEdPresets();
  }
});
function readEdFields(r) {
  for (const el of r.row.querySelectorAll('.ep-body [data-f]')) if (el.dataset.f !== 'target') r.p[el.dataset.f] = el.value;
}
$('#edList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  const r = b && edRow(b);
  if (!r) return;
  const key = r.p.id || r.p._tmp;
  const act = b.dataset.act;
  try {
    if (act === 'open') {
      if (ED_OPEN.has(key)) ED_OPEN.delete(key);
      else ED_OPEN.add(key);
      if (r.p._tmp && !ED_OPEN.has(key)) edp.presets.splice(r.i, 1); // جديدٌ أُغلق قبل حفظه
      return renderEdPresets();
    }
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? r.i - 1 : r.i + 1;
      if (j < 0 || j >= edp.presets.length) return;
      [edp.presets[r.i], edp.presets[j]] = [edp.presets[j], edp.presets[r.i]];
      return await saveEdPresets();
    }
    if (act === 'save') {
      readEdFields(r);
      if (!String(r.p.title || '').trim() || !String(r.p.prompt || '').trim()) return toast('اكتب اسم التوجيه ونصه');
      ED_OPEN.delete(key);
      return await saveEdPresets('حُفظ التوجيه');
    }
    if (act === 'reset') {
      const x = await api(sq('/api/admin/ai/prompts/reset'), { method: 'POST', body: { id: r.p.id } });
      edp.presets = x.presets;
      renderEdPresets();
      return toast('أُرجع إلى أصله');
    }
    if (act === 'del') {
      if (!confirm(`حذف التوجيه «${r.p.title}»؟`)) return;
      edp.presets.splice(r.i, 1);
      ED_OPEN.delete(key);
      return await saveEdPresets('حُذف');
    }
  } catch (err) {
    toast(err.message);
  }
});
$('#edAdd').addEventListener('click', () => {
  const target = edFilter !== 'all' ? edFilter : 'sel';
  const p = { _tmp: 'n' + Date.now(), title: '', hint: '', prompt: '', target, kind: (ED_KINDS_FOR[target] || ['answer'])[0], builtin: false };
  edp.presets.unshift(p);
  ED_OPEN.add(p._tmp);
  renderEdPresets();
  const t = $('#edList .ep.open [data-f="title"]');
  if (t) t.focus();
});
$('#edResetAll').addEventListener('click', async () => {
  if (!confirm('إرجاع التوجيهات الجاهزة إلى أصلها وترتيبها؟ (تبقى توجيهاتك الخاصة)')) return;
  try {
    const x = await api(sq('/api/admin/ai/prompts/reset'), { method: 'POST', body: {} });
    edp.presets = x.presets;
    ED_OPEN.clear();
    renderEdPresets();
    toast('أُرجعت التوجيهات الجاهزة إلى أصلها');
  } catch (err) {
    toast(err.message);
  }
});
$('#edNoteSave').addEventListener('click', async () => {
  try {
    const r = await api(sq('/api/admin/ai/prompts'), { method: 'PUT', body: { note: $('#edNote').value } });
    $('#edNote').value = r.note;
    toast(r.note ? 'حُفظ التوجيه العام' : 'لا توجيه عام');
  } catch (err) {
    toast(err.message);
  }
});

/* ---------------------------------------------------------------- مصادر الكتب */
let srcs = { sources: [], units: [], hasTurath: true, kinds: {}, defaults: {} };
const SRC_ICON = { api: '🌐', folder: '💻', shamela: '📚' };
async function loadSources() {
  try {
    srcs = await api('/api/admin/sources');
    renderSources();
  } catch (e) {
    toast(e.message);
  }
}
function testText(r) {
  if (!r.ok) return '✗ ' + r.error;
  if (r.books !== undefined) return `✓ ${ar(r.books)} كتاباً في المجلد` + (r.sample && r.sample.length ? ` — منها: ${r.sample.join('، ')}` : '') + (r.note ? ` — ${r.note}` : '');
  return `✓ الـAPI يجيب` + (r.catalog != null ? ` — فهرس العناوين: ${ar(r.catalog)} كتاباً` : ' — بلا فهرس عناوين (بحث نصي فقط)');
}
function renderSources() {
  // ما يراه المستخدم: المجموعات والمصادر المنفردة
  const units = srcs.units || [];
  $('#srcGroups').innerHTML = [...new Set(srcs.sources.map((x) => x.group).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('');
  $('#srcUnits').innerHTML =
    units.length === 0
      ? '<small class="muted">لا مصدر مفعّلاً الآن.</small>'
      : `<small class="muted">${units.length === 1 ? 'يرى المستخدم مصدراً واحداً (فلا اختيار فوق خانة البحث):' : `يرى المستخدم فوق خانة البحث ${units.length === 2 ? 'اختيارين' : ar(units.length) + ' اختيارات'} (الأول مختار ابتداءً):`}</small>` +
        units.map((u) => `<span class="src-unit ${u.group ? 'grp' : ''}"><b>${esc(u.name)}</b>${u.group ? `<small>${u.members.map((m) => `${SRC_ICON[m.kind] || ''} ${esc(m.name)}`).join(' + ')}</small>` : `<small>${SRC_ICON[u.kind] || ''} وحده</small>`}</span>`).join('');
  $('#srcRestoreRow').hidden = srcs.hasTurath;
  $('#srcList').innerHTML = srcs.sources.length
    ? srcs.sources
        .map(
          (s, i) => `<article class="src-card ${s.enabled ? '' : 'off'}" data-id="${esc(s.id)}">
        <header class="src-h">
          <span class="src-ico" aria-hidden="true">${SRC_ICON[s.kind] || ''}</span>
          <input class="src-name" data-f="name" value="${esc(s.name)}" maxlength="40" aria-label="اسم المصدر">
          <label class="src-group" title="المصادر التي لها اسم المجموعة نفسه مصدر واحد عند المستخدم. فارغة: المصدر وحده">المجموعة <input data-f="group" list="srcGroups" value="${esc(s.group || '')}" maxlength="40" placeholder="وحده"></label>
          <span class="pill ${s.kind === 'folder' || s.kind === 'shamela' ? 'ok' : 'idle'}">${esc(srcs.kinds[s.kind] || s.kind)}</span>
          ${s.id === 'turath' ? '<span class="pill warn">الأصلي</span>' : ''}
          <span class="src-acts">
            <button class="btn small" type="button" data-act="up" title="تقديم" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn small" type="button" data-act="down" title="تأخير" ${i === srcs.sources.length - 1 ? 'disabled' : ''}>↓</button>
            <label class="switch sm" title="${s.enabled ? 'مفعّل: يظهر للمستخدم' : 'موقوف: لا يُبحث فيه'}"><input type="checkbox" data-f="enabled" ${s.enabled ? 'checked' : ''}><span></span></label>
          </span>
        </header>
        <div class="src-fields">${
          s.kind === 'folder' || s.kind === 'shamela'
            ? `<label class="field">${s.kind === 'shamela' ? 'مجلد الشاملة' : 'مسار المجلد'}<input data-f="path" dir="ltr" maxlength="500" value="${esc(s.path || '')}"></label>`
            : `<label class="field">عنوان الـAPI<input data-f="api" dir="ltr" value="${esc(s.api || '')}" placeholder="${esc(s.id === 'turath' ? srcs.defaults.api + '  (الأصلي)' : 'https://…')}"></label>
               <label class="field">ملف بيانات الفهرس<input data-f="data" dir="ltr" value="${esc(s.data || '')}" placeholder="${esc(s.id === 'turath' ? srcs.defaults.data + '  (الأصلي)' : 'اختياري')}"></label>
               <label class="field">رابط صفحة الكتاب<input data-f="link" dir="ltr" value="${esc(s.link || '')}" placeholder="اختياري"></label>`
        }</div>
        <div class="row">
          <button class="btn small primary" type="button" data-act="save" disabled>حفظ التعديل</button>
          <button class="btn small" type="button" data-act="test">اختبار</button>
          <button class="btn small danger" type="button" data-act="del">حذف</button>
          <small class="src-res muted"></small>
        </div>
      </article>`,
        )
        .join('')
    : '<p class="empty">لا مصادر. أضف مصدراً، أو استعد «تراث».</p>';
}
$('#srcList').addEventListener('input', (e) => {
  const card = e.target.closest('.src-card');
  if (card && e.target.dataset.f && e.target.dataset.f !== 'enabled') card.querySelector('[data-act="save"]').disabled = false;
});
const srcPatch = (card) => Object.fromEntries($$('[data-f]').filter((i) => card.contains(i)).map((i) => [i.dataset.f, i.type === 'checkbox' ? i.checked : i.value.trim()]));
$('#srcList').addEventListener('change', async (e) => {
  const card = e.target.closest('.src-card');
  if (!card || e.target.dataset.f !== 'enabled') return;
  try {
    const r = await api('/api/admin/sources/' + card.dataset.id, { method: 'PATCH', body: { enabled: e.target.checked } });
    srcs.sources = r.sources;
      srcs.units = r.units || srcs.units;
    renderSources();
  } catch (err) {
    e.target.checked = !e.target.checked;
    toast(err.message);
  }
});
$('#srcList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  const card = e.target.closest('.src-card');
  if (!b || !card) return;
  const id = card.dataset.id;
  const res = card.querySelector('.src-res');
  try {
    if (b.dataset.act === 'save') {
      const r = await api('/api/admin/sources/' + id, { method: 'PATCH', body: srcPatch(card) });
      srcs.sources = r.sources;
      srcs.units = r.units || srcs.units;
      renderSources();
      toast('حُفظ المصدر');
    } else if (b.dataset.act === 'test') {
      res.textContent = 'يُختبر…';
      res.className = 'src-res muted';
      // يُختبر ما في الخانات الآن (ولو لم يُحفظ بعد)
      const cur = srcs.sources.find((s) => s.id === id);
      const r = await api('/api/admin/sources/test', { method: 'POST', body: { ...cur, ...srcPatch(card) } });
      res.textContent = testText(r);
      res.className = 'src-res ' + (r.ok ? 'ok' : 'err');
    } else if (b.dataset.act === 'del') {
      const cur = srcs.sources.find((s) => s.id === id);
      if (!confirm(`حذف المصدر «${cur.name}»؟${id === 'turath' ? ' يمكنك استعادته بعد ذلك.' : ''}`)) return;
      const r = await api('/api/admin/sources/' + id, { method: 'DELETE' });
      srcs.sources = r.sources;
      srcs.units = r.units || srcs.units;
      srcs.hasTurath = r.hasTurath;
      renderSources();
    } else if (b.dataset.act === 'up' || b.dataset.act === 'down') {
      const ids = srcs.sources.map((s) => s.id);
      const i = ids.indexOf(id);
      const j = b.dataset.act === 'up' ? i - 1 : i + 1;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const ro = await api('/api/admin/sources/order', { method: 'POST', body: { ids } });
      srcs.sources = ro.sources;
      srcs.units = ro.units || srcs.units;
      renderSources();
    }
  } catch (err) {
    toast(err.message);
  }
});
$('#srcRestore').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/sources/restore', { method: 'POST' });
    srcs.sources = r.sources;
      srcs.units = r.units || srcs.units;
    srcs.hasTurath = true;
    renderSources();
    toast('عاد «تراث» إلى المصادر');
  } catch (err) {
    toast(err.message);
  }
});
for (const [sel, kind] of [['#srcAddApi', 'api'], ['#srcAddFolder', 'folder'], ['#srcAddShamela', 'shamela']]) {
  const form = $(sel);
  const body = () => ({ kind, ...Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()])) });
  const msg = form.querySelector('.status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/admin/sources', { method: 'POST', body: body() });
      srcs.sources = r.sources;
      srcs.units = r.units || srcs.units;
      form.reset();
      status(msg, '');
      renderSources();
      toast(`أُضيف المصدر «${r.source.name}»`);
    } catch (err) {
      status(msg, err.message, false);
    }
  });
  form.querySelector('[data-test]').addEventListener('click', async () => {
    status(msg, 'يُختبر…', true);
    try {
      const r = await api('/api/admin/sources/test', { method: 'POST', body: body() });
      status(msg, testText(r), r.ok);
    } catch (err) {
      status(msg, err.message, false);
    }
  });
}

/* ---------------------------------------------------------------- التنزيل: ملفات نسختي البرنامج */
// لكل نسخة (المستخدم، المبرمج): رفع إصدار جديد، وقائمة الإصدارات مع حذف القديم. الأحدث هو ما يُنزَّل من صفحة التنزيل.
let dl = { editions: [], maxMb: 2048 };
const bytes = (b) => (b >= 1024 ** 3 ? ar((b / 1024 ** 3).toFixed(2)) + ' غ.ب' : b >= 1024 ** 2 ? ar((b / 1024 ** 2).toFixed(1)) + ' م.ب' : kb(b));
async function loadDownloads() {
  try {
    dl = await api('/api/admin/downloads');
    renderDownloads();
  } catch (e) {
    toast(e.message);
  }
}
function renderDownloads() {
  $('#dlMax').textContent = `الحد الأقصى للملف ${ar(dl.maxMb)} م.ب.`;
  $('#dlAdmin').innerHTML = dl.editions
    .map(
      (e) => `<section class="dl-ed" data-edition="${e.key}">
        <header class="dl-ed-h"><img src="${esc(e.image)}" alt="" width="96" height="64"><div><h3>${esc(e.title)}</h3><p class="hint">${esc(e.desc)}</p></div></header>
        <form class="dl-up" autocomplete="off">
          <label class="dl-pick" tabindex="0"><input type="file" hidden accept=".zip,.7z,.rar,.tar,.gz,.tgz,.xz,.exe,.msi,.dmg,.pkg,.appimage,.deb,.rpm,.apk,.ipa"><b>اختر ملف الإصدار</b><small class="dl-picked">أو اسحبه إلى هنا — ZIP · EXE · MSI · DMG · AppImage …</small></label>
          <div class="dl-fields">
            <label class="field">رقم الإصدار<input name="version" maxlength="30" required placeholder="مثل 1.2.0" dir="ltr"></label>
            <label class="field">ما الجديد (اختياري)<input name="notes" maxlength="500" placeholder="سطر يظهر للمستخدم تحت زر التنزيل"></label>
          </div>
          <div class="dl-bar" hidden><i></i><span></span></div>
          <div class="row"><button class="btn primary" type="submit" disabled>رفع الإصدار</button><button class="btn small" type="button" data-cancel hidden>إلغاء الرفع</button></div>
          <p class="status" hidden></p>
        </form>
        <div class="dl-list">${
          e.items.length
            ? e.items
                .map(
                  (x, i) => `<div class="dl-item" data-id="${x.id}">
                    <div class="dl-item-h"><b>الإصدار <bdi>${esc(x.version)}</bdi></b>${i === 0 ? '<span class="pill ok">الحالي — يُنزَّل من الصفحة</span>' : '<span class="pill idle">سابق</span>'}</div>
                    <div class="mono" title="${esc(x.name)}">${esc(x.name)}</div>
                    <small class="muted">${bytes(x.size)} · ${fmtDate(x.createdAt)} · نُزّل ${ar(x.downloads || 0)} مرة</small>
                    ${x.notes ? `<small class="dl-note">${esc(x.notes)}</small>` : ''}
                    <div class="row"><a class="btn small" href="/downloads/file/${x.id}" download>تنزيل</a><button class="btn small danger" type="button" data-del>حذف</button></div>
                  </div>`,
                )
                .join('')
            : '<p class="empty">لم يُرفع إصدار بعد. تظهر النسخة للمستخدم بصورتها وعبارة «قريباً».</p>'
        }</div>
      </section>`,
    )
    .join('');
}
const dlForm = (el) => el.closest('.dl-up');
function dlPicked(form, file) {
  form._file = file || null;
  form.querySelector('.dl-picked').textContent = file ? `${file.name} — ${bytes(file.size)}` : 'أو اسحبه إلى هنا — ZIP · EXE · MSI · DMG · AppImage …';
  form.querySelector('.dl-pick').classList.toggle('has', !!file);
  form.querySelector('button[type=submit]').disabled = !file;
  status(form.querySelector('.status'), '');
}
$('#dlAdmin').addEventListener('change', (e) => {
  if (e.target.type === 'file') dlPicked(dlForm(e.target), e.target.files[0]);
});
for (const t of ['dragover', 'dragleave', 'drop']) {
  $('#dlAdmin').addEventListener(t, (e) => {
    const pick = e.target.closest('.dl-pick');
    if (!pick) return;
    e.preventDefault();
    pick.classList.toggle('over', t === 'dragover');
    if (t === 'drop' && e.dataTransfer.files[0]) dlPicked(dlForm(pick), e.dataTransfer.files[0]);
  });
}
$('#dlAdmin').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('dl-pick')) {
    e.preventDefault();
    e.target.querySelector('input').click();
  }
});
$('#dlAdmin').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const file = form._file;
  if (!file) return;
  const st = form.querySelector('.status');
  if (file.size > dl.maxMb * 1024 * 1024) return status(st, `الملف أكبر من المسموح (${ar(dl.maxMb)} م.ب)`, false);
  const q = new URLSearchParams({ edition: form.closest('.dl-ed').dataset.edition, version: form.version.value.trim(), notes: form.notes.value.trim(), name: file.name });
  const bar = form.querySelector('.dl-bar');
  const btn = form.querySelector('button[type=submit]');
  const cancel = form.querySelector('[data-cancel]');
  // XMLHttpRequest: الملف يُرسل كما هو (بلا تحويل ولا تحميله في الذاكرة)، مع تقدّم الرفع
  const xhr = new XMLHttpRequest();
  form._xhr = xhr;
  xhr.open('PUT', '/api/admin/downloads/upload?' + q);
  xhr.setRequestHeader('x-warraq', '1');
  xhr.setRequestHeader('content-type', 'application/octet-stream');
  xhr.upload.onprogress = (ev) => {
    if (!ev.lengthComputable) return;
    const pct = Math.round((ev.loaded / ev.total) * 100);
    bar.querySelector('i').style.width = pct + '%';
    bar.querySelector('span').textContent = `${ar(pct)}٪ — ${bytes(ev.loaded)} من ${bytes(ev.total)}`;
  };
  const end = (msg, ok) => {
    form._xhr = null;
    bar.hidden = cancel.hidden = true;
    btn.disabled = false;
    if (msg) status(st, msg, ok);
  };
  xhr.onload = () => {
    let data = {};
    try {
      data = JSON.parse(xhr.responseText);
    } catch {}
    if (xhr.status === 201) {
      toast(`رُفع الإصدار ${data.version} — صار هو ما يُنزَّل من صفحة التنزيل`);
      return loadDownloads();
    }
    end(data.error || 'تعذّر الرفع (' + xhr.status + ')', false);
  };
  xhr.onerror = () => end('انقطع الاتصال أثناء الرفع', false);
  xhr.onabort = () => end('أُلغي الرفع', false);
  bar.hidden = cancel.hidden = false;
  bar.querySelector('i').style.width = '0';
  bar.querySelector('span').textContent = 'يبدأ الرفع…';
  btn.disabled = true;
  status(st, '');
  xhr.send(file);
});
$('#dlAdmin').addEventListener('click', async (e) => {
  if (e.target.closest('[data-cancel]')) {
    const f = dlForm(e.target);
    if (f._xhr) f._xhr.abort();
    return;
  }
  if (!e.target.closest('[data-del]')) return;
  const item = e.target.closest('.dl-item');
  const ver = item.querySelector('bdi').textContent;
  if (!confirm(`حذف الإصدار ${ver} وملفه نهائياً؟`)) return;
  try {
    await api('/api/admin/downloads/' + item.dataset.id, { method: 'DELETE' });
    toast('حُذف الإصدار');
    loadDownloads();
  } catch (err) {
    toast(err.message);
  }
});

/* ---------------------------------------------------------------- ٢) الخطوط */
// الخط المضاف يدخل في كل الموقع: خط الكتاب، أساليب دور النشر، واستوديو الأغلفة.
let fonts = { weights: {}, fonts: [], builtin: [] };
let pending = []; // ملفات اختيرت وتنتظر تحديد اسم الخط ووزنه
const W_SHORT = { 400: 'طبيعي', 700: 'عريض (Bold)', all: 'الكل' };
const kb = (n) => ar(Math.max(1, Math.ceil(n / 1024))) + ' ك.ب';
const refreshFontCss = () => ($('#siteFontsCss').href = '/api/fonts.css?t=' + Date.now());

async function loadFonts() {
  fonts = await api('/api/admin/fonts');
  refreshFontCss();
  renderFonts();
}
function renderFonts() {
  const sample = 'بسم الله الرحمن الرحيم';
  $('#fontGrid').innerHTML = fonts.fonts.length
    ? fonts.fonts
        .map((f) => {
          const by = Object.fromEntries(f.files.map((x) => [x.weight, x]));
          const file = (w) =>
            by[w]
              ? `<span class="fchip ok">${W_SHORT[w]} <small>${by[w].ext} · ${kb(by[w].size)}</small><button type="button" data-rm="${w}" title="حذف هذا الملف" aria-label="حذف ملف ${W_SHORT[w]}">✕</button></span>`
              : by.all
                ? ''
                : `<button type="button" class="fchip add" data-addw="${w}">＋ إضافة ${W_SHORT[w]}</button>`;
          return `<div class="fcard" data-id="${f.id}" data-family="${esc(f.family)}">
            <div class="fsample" style="font-family:'${esc(f.family)}'"><span>${sample}</span><b>${sample}</b></div>
            <div class="fmeta">
              <label class="field">الاسم في القوائم<input value="${esc(f.label)}" data-f="label" maxlength="60"></label>
              <small class="muted">اسم العائلة: <bdi>${esc(f.family)}</bdi>${f.docx && f.docx !== f.family ? ` · في Word: <bdi>${esc(f.docx)}</bdi>` : ''}</small>
            </div>
            <div class="ffiles">${file('400')}${file('700')}${by.all ? `<span class="fchip ok">ملف واحد لكل الأوزان <small>${by.all.ext} · ${kb(by.all.size)}</small><button type="button" data-rm="all" title="حذف">✕</button></span>` : ''}</div>
            <button class="btn small danger" type="button" data-del>حذف الخط</button>
          </div>`;
        })
        .join('')
    : '<p class="empty">لم تُضف خطوطاً بعد. اسحب ملف خط إلى الخانة أعلاه.</p>';
  $('#builtinFonts').innerHTML = fonts.builtin.map((f) => `<span class="fchip" style="font-family:'${esc(f.family)}'">${esc(f.label)}</span>`).join('');
  $('#famList').innerHTML = fonts.fonts.map((f) => `<option value="${esc(f.family)}">`).join('');
}
function renderPending() {
  $('#pending').innerHTML = pending
    .map(
      (p, i) => `<div class="pend" data-i="${i}">
        <div class="pend-file"><b>${esc(p.file.name)}</b><small class="muted">${kb(p.file.size)}${p.info.family ? ` · الاسم داخل الملف: <bdi>${esc(p.info.family)}${p.info.subfamily ? ' ' + esc(p.info.subfamily) : ''}</bdi>` : ''}${p.info.variable ? ' · خط متغير الأوزان' : ''}</small></div>
        <label class="field">اسم الخط<input data-pf="family" list="famList" value="${esc(p.family)}" maxlength="60" placeholder="مثل: خط الثلث"></label>
        <div class="field">هذا الملف هو
          <div class="seg" data-pw>${['400', '700', 'all'].map((w) => `<button type="button" data-v="${w}" aria-pressed="${p.weight === w}" title="${esc(fonts.weights[w] || '')}">${W_SHORT[w]}</button>`).join('')}</div>
        </div>
        <div class="pend-act"><button class="btn primary small" type="button" data-add>إضافة</button><button class="btn small" type="button" data-cancel>إلغاء</button></div>
        ${p.error ? `<p class="status err">${esc(p.error)}</p>` : ''}
      </div>`,
    )
    .join('') + (pending.length > 1 ? '<div class="pend-all"><button class="btn primary" type="button" id="addAllFonts">إضافة الكل</button></div>' : '');
}

const readAsDataUrl = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

/** ملفات جديدة: يُقرأ اسم الخط ووزنه من داخل الملف، ثم يختار المالك (طبيعي / عريض / الكل) */
async function chooseFonts(files, preset = {}) {
  for (const file of files) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('أكبر من ٢٠ ميغابايت');
      const data = await readAsDataUrl(file);
      const info = await api('/api/admin/fonts/inspect', { method: 'POST', body: { data } });
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_ ]?(Regular|Bold|Medium|Light|Black|SemiBold|ExtraBold|VF|Variable)$/i, '');
      const p = { file, data, info, family: preset.family || info.family || base, weight: preset.weight || info.suggest || '400' };
      if (preset.family) await addPending(p); // إضافة وزن لخط موجود: مباشرة
      else pending.push(p);
    } catch (err) {
      status($('#upMsg'), `${file.name}: ${err.message}`, false);
    }
  }
  renderPending();
}
async function addPending(p) {
  await api('/api/admin/fonts', { method: 'POST', body: { family: p.family, weight: p.weight, data: p.data, name: p.file.name } });
  status($('#upMsg'), `أُضيف «${p.family}» (${W_SHORT[p.weight]}) — صار متاحاً في خط الكتاب والأساليب والأغلفة`, true);
  await loadFonts();
}
$('#pending').addEventListener('input', (e) => {
  const row = e.target.closest('.pend');
  if (row && e.target.dataset.pf) pending[+row.dataset.i][e.target.dataset.pf] = e.target.value;
});
$('#pending').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'addAllFonts') {
    for (const p of [...pending]) {
      try {
        await addPending(p);
        pending = pending.filter((x) => x !== p);
      } catch (err) {
        p.error = err.message;
      }
    }
    return renderPending();
  }
  const row = b.closest('.pend');
  const p = pending[+row.dataset.i];
  if (b.closest('[data-pw]')) {
    p.weight = b.dataset.v;
    return renderPending();
  }
  if (b.dataset.cancel !== undefined) pending = pending.filter((x) => x !== p);
  else if (b.dataset.add !== undefined) {
    try {
      if (!p.family.trim()) throw new Error('اكتب اسم الخط');
      await addPending(p);
      pending = pending.filter((x) => x !== p);
    } catch (err) {
      p.error = err.message;
    }
  }
  renderPending();
});
$('#fontGrid').addEventListener('change', async (e) => {
  const card = e.target.closest('.fcard');
  if (!card || e.target.dataset.f !== 'label') return;
  try {
    await api('/api/admin/fonts/' + card.dataset.id, { method: 'PATCH', body: { label: e.target.value } });
    toast('حُفظ');
  } catch (err) {
    toast(err.message);
  }
});
let addTarget = null;
$('#fontGrid').addEventListener('click', async (e) => {
  const card = e.target.closest('.fcard');
  if (!card) return;
  try {
    if (e.target.closest('[data-addw]')) {
      addTarget = { family: card.dataset.family, weight: e.target.closest('[data-addw]').dataset.addw };
      return $('#fileInput').click();
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      if (!confirm('حذف هذا الملف من الخط؟')) return;
      await api(`/api/admin/fonts/${card.dataset.id}/${rm.dataset.rm}`, { method: 'DELETE' });
      return loadFonts();
    }
    if (e.target.matches('[data-del]')) {
      if (!confirm(`حذف الخط «${card.dataset.family}» من ورّاق كله؟ ما يستعمله من أساليب وأغلفة سيظهر بخط بديل.`)) return;
      await api('/api/admin/fonts/' + card.dataset.id, { method: 'DELETE' });
      loadFonts();
    }
  } catch (err) {
    toast(err.message);
  }
});
const drop = $('#drop');
drop.addEventListener('click', () => {
  addTarget = null;
  $('#fileInput').click();
});
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && drop.click());
$('#fileInput').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const t = addTarget;
  addTarget = null;
  chooseFonts(t ? files.slice(0, 1) : files, t || {});
});
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  chooseFonts([...e.dataTransfer.files]);
});

/* ---------------------------------------------------------------- ٣) الشكاوى والملاحظات */
let fb = { types: {}, statuses: {}, items: [] };
async function loadFeedback() {
  fb = await api('/api/admin/feedback');
  if ($('#fbStatus').options.length === 1) {
    $('#fbStatus').insertAdjacentHTML('beforeend', Object.entries(fb.statuses).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
    $('#fbType').insertAdjacentHTML('beforeend', Object.entries(fb.types).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
  }
  const n = fb.items.filter((x) => x.status === 'new').length;
  $('#fbCount').hidden = !n;
  $('#fbCount').textContent = ar(n);
  renderFeedback();
}
function renderFeedback() {
  const st = $('#fbStatus').value;
  const ty = $('#fbType').value;
  const list = fb.items.filter((x) => (!st || x.status === st) && (!ty || x.type === ty));
  $('#fbList').innerHTML = list.length
    ? list
        .map(
          (x) => `<div class="fb st-${x.status}" data-id="${x.id}">
        <input type="checkbox" class="fbsel" aria-label="تحديد">
        <div class="head"><span class="badge">${esc(fb.types[x.type] || x.type)}</span><span>${fmtDate(x.createdAt)}</span>
          ${x.bookId ? `<span>📖 ${esc(x.bookName || '')} (${ar(x.bookId)})</span>` : ''}${x.contact ? `<span>✉️ ${esc(x.contact)}</span>` : ''}${x.page ? `<span>📍 ${esc(x.page)}</span>` : ''}</div>
        <div class="msg">${esc(x.message)}</div>
        <div class="tools">
          <label>الحالة <select data-f="status">${Object.entries(fb.statuses).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>التصنيف <select data-f="type">${Object.entries(fb.types).map(([k, v]) => `<option value="${k}" ${k === x.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <button class="btn small danger" data-del>حذف</button>
        </div></div>`,
        )
        .join('')
    : '<p class="empty">لا توجد رسائل.</p>';
  $('#fbAll').checked = false;
  $('#fbDelete').disabled = true;
}
$('#fbStatus').addEventListener('change', renderFeedback);
$('#fbType').addEventListener('change', renderFeedback);
$('#fbList').addEventListener('change', async (e) => {
  const card = e.target.closest('.fb');
  if (e.target.classList.contains('fbsel')) {
    $('#fbDelete').disabled = !$$('.fbsel:checked').length;
    return;
  }
  if (!card || !e.target.dataset.f) return;
  const updated = await api('/api/admin/feedback/' + card.dataset.id, { method: 'PATCH', body: { [e.target.dataset.f]: e.target.value } });
  Object.assign(fb.items.find((x) => x.id === updated.id), updated);
  loadFeedback();
});
$('#fbList').addEventListener('click', async (e) => {
  if (!e.target.matches('[data-del]')) return;
  const id = e.target.closest('.fb').dataset.id;
  await api('/api/admin/feedback', { method: 'DELETE', body: { ids: [id] } });
  loadFeedback();
});
$('#fbAll').addEventListener('change', (e) => {
  $$('.fbsel').forEach((c) => (c.checked = e.target.checked));
  $('#fbDelete').disabled = !e.target.checked;
});
$('#fbDelete').addEventListener('click', async () => {
  const ids = $$('.fbsel:checked').map((c) => c.closest('.fb').dataset.id);
  if (!ids.length || !confirm(`حذف ${ar(ids.length)} رسالة؟`)) return;
  await api('/api/admin/feedback', { method: 'DELETE', body: { ids } });
  loadFeedback();
});
$('#fbDeleteDone').addEventListener('click', async () => {
  const ids = fb.items.filter((x) => x.status === 'done').map((x) => x.id);
  if (!ids.length) return toast('لا توجد رسائل تمت معالجتها');
  if (!confirm(`حذف ${ar(ids.length)} رسالة تمت معالجتها؟`)) return;
  await api('/api/admin/feedback', { method: 'DELETE', body: { ids } });
  loadFeedback();
});

/* ---------------------------------------------------------------- ٤) الحساب: كلمة السر، والباب الخفي */
let acct = null;
let door = null; // ما في النموذج الآن (قبل الحفظ)
const TOO_MANY = 'يا علامة عصرك وموسوعة الدنيا، اختار عدد أقل';

async function loadAccount() {
  try {
    acct = await api('/api/admin/account');
    door = { ...acct.door, keyVols: [...acct.door.keyVols] };
    renderAccount();
  } catch (err) {
    status($('#doorMsg'), err.message, false);
  }
}
function renderAccount() {
  const on = !acct.passwordOff;
  $('#pwOn').checked = on;
  $('#pwOnHint').textContent = on
    ? 'مفعّلة: من يدخل من الباب الخفي يُسأل عن كلمة السر. وإن أوقفتها دخل اللوحة كل من عرف الباب (الكتاب ومجلداته وقالبه) بلا سؤال.'
    : 'موقوفة: كل من عرف الباب (الكتاب ومجلداته وقالبه) يدخل اللوحة بلا كلمة سر. شغّلها لتعود الحماية.';
  $('#pwForm').hidden = !on || acct.envPassword;
  $('#pwOnForm').hidden = true;
  for (const [id, k] of [['#doorTitle', 'title'], ['#doorAuthor', 'author'], ['#doorEditor', 'editor'], ['#doorPublisher', 'publisher'], ['#doorPanel', 'panel']]) $(id).value = door[k] || '';
  $('#doorVols').value = door.volumes;
  status($('#doorVolsMsg'), '');
  $('#doorTpl').innerHTML = Object.entries(TEMPLATES).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${door.keyTemplate === k}">${esc(v)}</button>`).join('');
  renderDoorShelf();
}
/** رفّ المجلدات كما يراه المستخدم: يمتلئ كل رفّ بقدر عرضه، والمرفوع منها هو المفتاح */
function renderDoorShelf() {
  if (!door || !acct) return;
  const n = door.volumes;
  const pages = acct.pages.slice(0, n);
  const shelfEl = $('#doorShelf');
  const avail = (shelfEl.parentElement || shelfEl).clientWidth || 900;
  const narrow = isNarrow(avail);
  const base = pages.map((p) => spineWidth(p, narrow));
  const { rows: packed, inner } = packShelves(base, avail);
  shelfEl.classList.toggle('narrow', narrow);
  const keys = new Set(door.keyVols);
  const spine = (i) => {
    const on = keys.has(String(i + 1));
    const w = Math.min(base[i], inner);
    return `<button type="button" class="spine ${on ? 'sel' : 'off'}${w < 36 ? ' slim' : ''}" style="width:${w}px" data-vol="${i + 1}" aria-pressed="${on}" title="المجلد ${ar(i + 1)}، ${ar(pages[i])} صفحة"><b>${ar(i + 1)}</b><small>${ar(pages[i])}</small></button>`;
  };
  shelfEl.innerHTML = packed.map((r) => `<div class="shelf">${r.map(spine).join('')}</div>`).join('');
  const list = door.keyVols.map((v) => ar(v));
  $('#doorKeyNote').textContent = !list.length
    ? 'لم تختر مجلداً بعد: اختر مجلداً واحداً على الأقل.'
    : n > 1 && list.length === n
      ? 'كل المجلدات محددة، وهذا ما يبدأ به أي زائر: اترك بعضها.'
      : `يفتح الباب: ${list.length === 1 ? 'المجلد ' + list[0] + ' وحده' : 'المجلدات ' + list.join(' و') + ' وحدها'}، مع قالب «${TEMPLATES[door.keyTemplate]}».`;
}
$('#doorVols').addEventListener('input', (e) => {
  const n = Math.floor(Number(e.target.value));
  if (n > acct.max) return status($('#doorVolsMsg'), TOO_MANY, false);
  status($('#doorVolsMsg'), '');
  if (!(n >= 1)) return;
  door.volumes = n;
  door.keyVols = door.keyVols.filter((v) => +v <= n);
  renderDoorShelf();
});
$('#doorTpl').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  door.keyTemplate = b.dataset.v;
  $$('#doorTpl button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderDoorShelf();
});
$('#doorShelf').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vol]');
  if (!b) return;
  const v = b.dataset.vol;
  door.keyVols = door.keyVols.includes(v) ? door.keyVols.filter((x) => x !== v) : [...door.keyVols, v].sort((x, y) => x - y);
  renderDoorShelf();
});
$('#doorDefault').addEventListener('click', () => {
  door = { ...acct.defaults, keyVols: [...acct.defaults.keyVols] };
  renderAccount();
  status($('#doorMsg'), 'عادت الخانات إلى الأصل. اضغط «حفظ الباب» ليُعمل به.', true);
});
$('#doorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = Math.floor(Number($('#doorVols').value));
  if (n > acct.max) return status($('#doorVolsMsg'), TOO_MANY, false);
  try {
    const r = await api('/api/admin/door', {
      method: 'PUT',
      body: { title: $('#doorTitle').value, author: $('#doorAuthor').value, editor: $('#doorEditor').value, publisher: $('#doorPublisher').value, panel: $('#doorPanel').value, volumes: n, keyVols: door.keyVols, keyTemplate: door.keyTemplate },
    });
    acct = { ...acct, ...r };
    door = { ...r.door, keyVols: [...r.door.keyVols] };
    renderAccount();
    if (window.WarraqPanel) window.WarraqPanel.set(r.door.panel);
    status($('#doorMsg'), `حُفظ الباب: يُبحث عن «${r.door.title}»، ثم تُختار مجلداته المحددة وقالب «${TEMPLATES[r.door.keyTemplate]}».`, true);
    toast('حُفظ الباب الخفي');
  } catch (err) {
    status(err.message === TOO_MANY ? $('#doorVolsMsg') : $('#doorMsg'), err.message, false);
  }
});

/* كلمة السر: تشغيلها وإيقافها */
async function setPasswordOff(off, password) {
  const r = await api('/api/admin/account/password-off', { method: 'PUT', body: { off, password } });
  acct = { ...acct, ...r };
  renderAccount();
  status($('#pwOnMsg'), off ? 'أُوقفت كلمة السر: من دخل من الباب الخفي دخل اللوحة.' : 'كلمة السر مفعّلة.', true);
}
$('#pwOn').addEventListener('change', async (e) => {
  const on = e.target.checked;
  try {
    if (!on) {
      if (!confirm('إيقاف كلمة السر؟ سيدخل اللوحة كل من عرف الباب الخفي (الكتاب ومجلداته وقالبه) بلا سؤال.')) return void (e.target.checked = true);
      return await setPasswordOff(true);
    }
    // تشغيلها ولا كلمة سر مضبوطة: تُكتب أولاً
    if (!acct.configured) {
      $('#pwOnForm').hidden = false;
      $('#pwOnNew').focus();
      return;
    }
    await setPasswordOff(false);
  } catch (err) {
    e.target.checked = !on;
    status($('#pwOnMsg'), err.message, false);
  }
});
$('#pwOnForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await setPasswordOff(false, $('#pwOnNew').value);
    e.target.reset();
  } catch (err) {
    status($('#pwOnMsg'), err.message, false);
  }
});
$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/password', { method: 'POST', body: { current: $('#pwCur').value, next: $('#pwNew').value } });
    e.target.reset();
    status($('#pwMsg'), 'تغيّرت كلمة السر، وأُبطلت الجلسات الأخرى.', true);
  } catch (err) {
    status($('#pwMsg'), err.message, false);
  }
});

/* ---------------------------------------------------------------- البدء */
(async () => {
  try {
    const st = await api('/api/admin/status');
    st.authed ? enterPanel() : showAuth(st);
  } catch {
    showAuth({});
  }
})();

/* ---------------------------------------------------------------- مظهر الموقع: ألوانه، ونقطة الضغط */
let look = null;
const LOOK_COLORS = [
  ['paper', 'الكاغد', 'خلفية الصفحات'],
  ['ink', 'المِداد', 'لون النص'],
  ['rubric', 'الحُمرة', 'العناوين والتنبيهات'],
  ['btn', 'الأزرار', 'الأزرار والشعار'],
  ['gold', 'الزخرفة', 'النقط والخطوط'],
];
/** ورقة المظهر تُعاد قراءتها فتتبدل ألوان اللوحة نفسها في الحال */
function refreshTheme() {
  const l = document.getElementById('themeCss');
  if (l) l.href = '/api/theme.css?t=' + Date.now();
}
function renderLook() {
  const card = (id, name, desc, c, mine) => `<div class="look-card" role="radio" tabindex="0" data-theme="${esc(id)}" aria-checked="${look.theme === id}" style="--c-paper:${c.paper};--c-ink:${c.ink};--c-rubric:${c.rubric};--c-btn:${c.btn};--c-gold:${c.gold}">
      <span class="look-demo" aria-hidden="true"><i class="lk-dot"></i><b><span class="wq-word" role="img" aria-label="ورّاق"></span></b><u>كتب التراث</u><em>ابدأ</em></span>
      <span class="look-name">${esc(name)}${look.theme === id ? ' <small>معمول به</small>' : ''}</span>
      <span class="look-desc">${esc(desc)}</span>
      <span class="look-foot"><span class="look-sw">${['paper', 'ink', 'rubric', 'btn', 'gold'].map((k) => `<i style="background:${c[k]}" title="${c[k]}"></i>`).join('')}</span>${mine ? `<button type="button" class="btn small danger" data-del-look="${esc(id)}" title="حذف هذا المظهر">حذف</button>` : ''}</span>
    </div>`;
  $('#lookThemes').innerHTML = look.themes.map((t) => card(t.id, t.name, t.desc, t.colors, false)).join('') + look.customs.map((t) => card(t.id, t.name, 'من ألوانك.', t.colors, true)).join('');
  // خانات الألوان: تبدأ من المظهر المعمول به
  const cur = look.customs.find((t) => t.id === look.theme) || look.themes.find((t) => t.id === look.theme) || look.themes[0];
  $('#lookColors').innerHTML = LOOK_COLORS.map(([k, name, what]) => `<label class="look-color"><input type="color" data-look="${k}" value="${esc(cur.colors[k])}"><span><b>${name}</b><small>${what}</small></span></label>`).join('');
  $('#lookCustomNote').textContent = look.customs.length ? `لك ${look.customs.length === 1 ? 'مظهر واحد' : look.customs.length === 2 ? 'مظهران' : ar(look.customs.length) + ' مظاهر'} من ألوانك، وتحذف ما لا تريده من بطاقته.` : '';
  $('#lookDot').checked = look.clickDot;
}
async function loadLook() {
  try {
    look = await api('/api/admin/look');
    renderLook();
  } catch (err) {
    status($('#lookMsg'), err.message, false);
  }
}
async function saveLook(patch, msg) {
  try {
    look = await api('/api/admin/look', { method: 'PUT', body: patch });
    refreshTheme();
    renderLook();
    status($('#lookMsg'), '');
    toast(msg);
  } catch (err) {
    status($('#lookMsg'), err.message, false);
  }
}
async function lookCall(path, opts, msg) {
  try {
    look = await api(path, opts);
    refreshTheme();
    renderLook();
    status($('#lookMsg'), '');
    toast(msg);
  } catch (err) {
    status($('#lookMsg'), err.message, false);
  }
}
function pickLook(e) {
  const del = e.target.closest('[data-del-look]');
  if (del) {
    const t = look.customs.find((x) => x.id === del.dataset.delLook);
    if (!t || !confirm(`حذف المظهر «${t.name}»؟${look.theme === t.id ? ' (هو المعمول به الآن: يعود ورّاق إلى المظهر الأصلي)' : ''}`)) return;
    return lookCall('/api/admin/look/custom/' + encodeURIComponent(t.id), { method: 'DELETE' }, 'حُذف المظهر');
  }
  const b = e.target.closest('[data-theme]');
  if (!b || b.dataset.theme === look.theme) return;
  saveLook({ theme: b.dataset.theme }, 'طُبّق المظهر على ورّاق كله');
}
$('#lookThemes').addEventListener('click', pickLook);
$('#lookThemes').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && e.target.matches('.look-card') && (e.preventDefault(), pickLook(e)));
$('#lookApply').addEventListener('click', () => {
  const colors = Object.fromEntries($$('#lookColors [data-look]').map((i) => [i.dataset.look, i.value]));
  lookCall('/api/admin/look/custom', { method: 'POST', body: { name: $('#lookName').value, colors } }, 'حُفظ مظهرك وطُبّق على ورّاق كله').then(() => ($('#lookName').value = ''));
});
$('#lookDot').addEventListener('change', (e) => saveLook({ clickDot: e.target.checked }, e.target.checked ? 'عادت نقطة الضغط' : 'أُوقفت نقطة الضغط'));

// الرفّ يُعاد توزيعه إذا تغيّر عرض الصفحة
watchWidth($('#doorShelf') && $('#doorShelf').parentElement, () => { if (door && acct && !$('#doorShelf').closest('[hidden]')) renderDoorShelf(); });

/* ---- التفريغ المباشر (مجلس الدرس) ---- */
let stt = null;
let sttPick = '';
async function loadStt() {
  try {
    stt = await api('/api/admin/stt');
  } catch (e) {
    return show($('#sttMsg'), `<div class="res err">${esc(e.message)}</div>`);
  }
  sttPick = sttPick || stt.engine;
  $('#sttWords').value = stt.words || '';
  $('#sttQuran').checked = stt.quran !== false;
  $('#sttSave').checked = stt.save !== false;
  $('#sttDelay').value = stt.delay || 'low';
  renderStt();
}
const STT_BADGE = { elevenlabs: 'قوي في العربية', soniox: 'كلمةً كلمة', openai: 'مفتاح OpenAI', gemini: 'مفتاح Gemini' };
function renderStt() {
  if (!stt) return;
  $('#sttEngines').innerHTML = stt.engines
    .map(
      (e) => `<button type="button" role="radio" class="stt-eng${e.id === sttPick ? ' on' : ''}" data-eng="${e.id}" aria-checked="${e.id === sttPick}">
        <span class="se-h"><b>${esc(e.label)}</b>${e.id === stt.engine ? '<em class="se-cur">المستعملة</em>' : ''}</span>
        <small dir="ltr" class="se-m">${esc(e.model)}</small>
        <span class="se-n">${esc(e.note)}</span>
        <span class="se-k ${e.hasKey ? 'ok' : ''}">${e.hasKey ? (e.from ? `✓ مفتاح «${esc(e.from)}» من الذكاء الاصطناعي` : `✓ مفتاح <span dir="ltr">${esc(e.keyMasked)}</span>`) : 'لا مفتاح'}</span>
      </button>`,
    )
    .join('');
  const e = stt.engines.find((x) => x.id === sttPick) || stt.engines[0];
  $('#sttKeyBox').innerHTML = `<div class="keybox"><input id="sttKey" type="password" dir="ltr" autocomplete="off" spellcheck="false" placeholder="${e.ownKey ? 'مفتاحٌ محفوظ — الصق غيره لتبدّله' : e.reuse && e.hasKey ? 'يُستعمل مفتاح الذكاء الاصطناعي — أو الصق مفتاحاً لهذه وحدها' : 'الصق مفتاح ' + esc(e.label) + ' هنا…'}">${e.ownKey ? '<button class="btn small danger" type="button" id="sttDelKey">احذف المفتاح</button>' : ''}</div>
    <p class="hint">${e.keyUrl ? `احصل على مفتاح: <a href="${esc(e.keyUrl)}" target="_blank" rel="noopener" dir="ltr">${esc(e.keyUrl.replace(/^https:\/\//, ''))}</a>. ` : ''}الصوت يُرسل إلى ${esc(e.label)} وحدها بمفتاحك، وتُحسب كلفته عليها.</p>`;
  $('#sttDelayRow').hidden = sttPick !== 'openai';
}
$('#sttEngines').addEventListener('click', (e) => {
  const b = e.target.closest('[data-eng]');
  if (!b) return;
  sttPick = b.dataset.eng;
  renderStt();
});
$('#sttKeyBox').addEventListener('click', async (e) => {
  if (!e.target.closest('#sttDelKey')) return;
  if (!confirm('حذف المفتاح المحفوظ لهذه الخدمة؟')) return;
  stt = await api('/api/admin/stt', { method: 'PUT', body: { keys: { [sttPick]: '' } } });
  renderStt();
});
async function saveStt() {
  const key = ($('#sttKey') && $('#sttKey').value.trim()) || '';
  stt = await api('/api/admin/stt', { method: 'PUT', body: { engine: sttPick, words: $('#sttWords').value, quran: $('#sttQuran').checked, save: $('#sttSave').checked, delay: $('#sttDelay').value, ...(key ? { keys: { [sttPick]: key } } : {}) } });
  renderStt();
}
$('#sttSaveBtn').addEventListener('click', async () => {
  try {
    await saveStt();
    const e = stt.engines.find((x) => x.id === stt.engine);
    show($('#sttMsg'), `<div class="res ${e && e.hasKey ? 'ok' : 'err'}"><b>${e && e.hasKey ? '✓ حُفظ' : 'حُفظ، لكن لا مفتاح لهذه الخدمة بعد'}</b> — التفريغ في «مجلس الدرس» يستعمل ${esc(e ? e.label : '')}.</div>`);
  } catch (err) {
    show($('#sttMsg'), `<div class="res err">${esc(err.message)}</div>`);
  }
});
$('#sttTest').addEventListener('click', async () => {
  busy($('#sttMsg'), 'يُجرَّب الاتصال…');
  try {
    await saveStt();
    const r = await api('/api/admin/stt/test', { method: 'POST', body: { engine: sttPick } });
    show($('#sttMsg'), `<div class="res ${r.ok ? 'ok' : 'err'}"><b>${r.ok ? '✓' : '✗'} ${esc(r.message)}</b></div>`);
  } catch (err) {
    show($('#sttMsg'), `<div class="res err">${esc(err.message)}</div>`);
  }
});
