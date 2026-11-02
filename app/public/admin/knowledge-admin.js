// «مصادر المعرفة» في الإعدادات: ثلاثة أقسام في تبويبٍ واحد —
//   مصادر الكتب (كما كانت، في admin.js)، ومصادر الترجمة، ومصادر العلم (يملؤهما هذا الملف).
// المفاتيح مخزنٌ واحد: يُضاف المفتاح مرة، ويُربط بما شئت من أقسام العلم وبالترجمة. ولا يُعرض مفتاحٌ إلا مقنّعاً.
import { toArabicDigits as ar, escapeHtml as esc } from '/shared/arabic.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LS = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-warraq': '1' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  return d;
}
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3000);
}
const cut = (s, n) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const secs = (ms) => ar((ms / 1000).toFixed(1)).replace('.', '٫');
/** العدد ومعدوده: «مفتاح واحد، مفتاحان، ٣ مفاتيح، ١١ مفتاحاً» */
const CNT = { مفتاح: ['مفتاح واحد', 'مفتاحان', 'مفاتيح', 'مفتاحاً'], مصطلح: ['مصطلح واحد', 'مصطلحان', 'مصطلحات', 'مصطلحاً'], نتيجة: ['نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة'], قسم: ['قسم واحد', 'قسمان', 'أقسام', 'قسماً'], معجم: ['معجم واحد', 'معجمان', 'معاجم', 'معجماً'] };
const cnt = (n, w) => {
  const f = CNT[w];
  return n === 1 ? f[0] : n === 2 ? f[1] : `${ar(n)} ${n % 100 >= 3 && n % 100 <= 10 ? f[2] : f[3]}`;
};
const show = (el, html) => {
  el.hidden = !html;
  el.innerHTML = html || '';
};
const busy = (el, msg) => show(el, `<div class="res"><span class="spin"></span> ${esc(msg)}</div>`);

const tab = $('#tab-sources');
if (tab) {
  /* ================================================================ الحال */
  let K = null; // ما يعرضه الخادم: الأنواع والمفاتيح والأقسام والترجمة
  let pane = ['books', 'trans', 'sci'].includes(LS('warraq.knPane')) ? LS('warraq.knPane') : 'books';
  const OPEN = new Set(); // أقسامٌ مفتوحة التفاصيل
  const ICON = { dorar: '❁', siwar: '◈', deepl: 'D', google: 'G', microsoft: 'M', libre: 'L', custom: '⌘' };
  const SCI_KINDS = ['dorar', 'siwar', 'custom'];
  const TRANS_KINDS = ['siwar', 'deepl', 'google', 'microsoft', 'libre'];

  async function load() {
    try {
      K = await api('/api/admin/know');
    } catch (e) {
      $('#kn-trans').innerHTML = $('#kn-sci').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
      return;
    }
    paint();
  }
  function setView(v) {
    if (v && v.keys) K = v;
    paint();
  }
  function paint() {
    paintNav();
    if (!K) return;
    if (pane === 'trans') paintTrans();
    if (pane === 'sci') paintSci();
  }
  function paintNav() {
    for (const b of $$('#knScopes [data-kn]')) b.setAttribute('aria-selected', String(b.dataset.kn === pane));
    for (const id of ['books', 'trans', 'sci']) $('#kn-' + id).hidden = id !== pane;
    if (!K) return;
    const tN = (K.trans.keys || []).length;
    const sN = K.sci.cats.filter((c) => !c.free && c.keys.length).length;
    $('#knTransN').textContent = tN ? ar(tN) : '';
    $('#knSciN').textContent = sN ? ar(sN) : '';
    $('#knTransN').title = tN ? `${ar(tN)} مفتاح للترجمة` : 'لا مفاتيح';
    $('#knSciN').title = sN ? `${ar(sN)} أقسام لها مصادر` : 'لا مفاتيح';
  }
  $('#knScopes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kn]');
    if (!b) return;
    pane = b.dataset.kn;
    LS('warraq.knPane', pane);
    paint();
    if (pane !== 'books' && !K) load();
  });
  // فتح التبويب: يُحمَّل ما فيه (ومن نافذةٍ أخرى قد يُطلب قسمٌ بعينه)
  const tabBtn = document.querySelector('.tabs button[data-tab="sources"]');
  if (tabBtn)
    tabBtn.addEventListener('click', () => {
      const want = LS('warraq.knOpen');
      if (want && ['books', 'trans', 'sci'].includes(want)) {
        pane = want;
        LS('warraq.knPane', pane);
        try {
          localStorage.removeItem('warraq.knOpen');
        } catch {}
      }
      load();
    });
  window.addEventListener('storage', (e) => {
    if (e.key === 'warraq.knOpen' && e.newValue && tabBtn) tabBtn.click();
  });

  /* ================================================================ أجزاء مشتركة */
  const aiName = (v) => {
    const a = (K.ais || []).find((x) => x.value === v);
    return a ? `${a.label} · ${a.model}` : '';
  };
  /** اختيار الذكاء الاصطناعي: سلسلة المحرِّر، أو مزوّدٌ بعينه من أي قسم */
  function aiSelect(f, cur, empty = 'سلسلة المحرِّر (الأول فالتالي)') {
    const groups = {};
    for (const a of K.ais || []) (groups[a.scopeLabel] ||= []).push(a);
    const missing = cur && !(K.ais || []).some((a) => a.value === cur);
    return `<select data-f="${f}"><option value="">${esc(empty)}</option>${Object.entries(groups)
      .map(([g, list]) => `<optgroup label="${esc('من ' + g)}">${list.map((a) => `<option value="${esc(a.value)}" ${a.value === cur ? 'selected' : ''}>${esc(a.label)} · ${esc(a.model || '')}${a.enabled ? '' : ' (معطّل)'}</option>`).join('')}</optgroup>`)
      .join('')}${missing ? `<option value="${esc(cur)}" selected>(مزوّدٌ حُذف — يُستعمل ما بعده)</option>` : ''}</select>`;
  }
  const kindLabel = (k) => (K.kinds[k] || {}).label || k;
  function keyState(k) {
    const s = k.state || {};
    if (!k.enabled) return ['off', 'معطّل'];
    if (s.pausedUntil) return ['warn', 'موقوف مؤقتاً'];
    if (s.lastErrorAt && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt)) return ['warn', 'آخر محاولة فشلت'];
    if (s.lastOkAt) return ['ok', 'يعمل ✓'];
    return ['idle', 'لم يُختبر بعد'];
  }
  function keyCard(k) {
    const [cls, txt] = keyState(k);
    const s = k.state || {};
    const K2 = K.kinds[k.kind] || {};
    return `<article class="kn-key ${k.enabled ? '' : 'is-off'}" data-key="${esc(k.id)}">
      <header class="kn-key-h">
        <span class="kn-ico k-${esc(k.kind)}" aria-hidden="true">${ICON[k.kind] || '•'}</span>
        <div class="kn-key-n"><input class="kn-name" data-kf="label" value="${esc(k.label)}" maxlength="60" aria-label="اسم المفتاح"><small>${esc(k.kindLabel)} · <span class="mono" dir="ltr">${esc(k.keyMasked || '— بلا مفتاح —')}</span>${k.usedIn.length ? ` · يُستعمل في: ${esc(k.usedIn.join('، '))}` : ' · <em>غير مربوط بشيء</em>'}</small></div>
        <span class="pill ${cls}">${esc(txt)}</span>
        <label class="switch sm" title="تفعيل هذا المفتاح"><input type="checkbox" data-kf="enabled" ${k.enabled ? 'checked' : ''}><span></span></label>
      </header>
      ${K2.base ? `<label class="field">${k.kind === 'custom' ? 'عنوان البحث (فيه {q})' : 'عنوان الخادم'}<input data-kf="base" dir="ltr" value="${esc(k.base)}"></label>` : ''}
      ${K2.region ? `<label class="field">المنطقة (Region)<input data-kf="region" dir="ltr" value="${esc(k.region)}" placeholder="مثل westeurope (اتركه فارغاً للمفتاح العام)"></label>` : ''}
      ${k.kind === 'siwar' ? `<label class="field">معرّفات معاجم بعينها (اختياري)<input data-kf="lexiconIds" dir="ltr" value="${esc(k.lexiconIds)}" placeholder="فارغ: كل المعاجم العامة"></label>` : ''}
      ${k.kind === 'custom' ? `<div class="grid2"><label class="field">ترويسة المفتاح<input data-kf="header" dir="ltr" value="${esc(k.header)}" placeholder="authorization"></label><label class="field">قبل المفتاح<input data-kf="prefix" dir="ltr" value="${esc(k.prefix)}" placeholder="Bearer "></label></div><label class="field">مسار النتائج والحقول (اختياري)<input data-kf="paths" dir="ltr" value="${esc(k.paths)}" placeholder="data.items | title | text | url"></label>` : ''}
      ${s.calls ? `<div class="p-stats">منذ التشغيل — الطلبات: ${ar(s.calls)}، الناجحة: ${ar(s.ok)}، الفاشلة: ${ar(s.fails)}${s.lastError && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt) ? ` · آخر خطأ: <b>${esc(s.lastError)}</b>` : ''}</div>` : ''}
      <div class="p-tools">
        <button class="btn small" type="button" data-ka="test">🧪 اختبار</button>
        <button class="btn small" type="button" data-ka="rekey">تغيير المفتاح</button>
        <button class="btn small primary" type="button" data-ka="save" hidden>حفظ التعديل</button>
        <span class="spacer"></span>
        ${K2.keyUrl ? `<a class="btn small ghost" href="${esc(K2.keyUrl)}" target="_blank" rel="noopener">صفحة المفتاح ↗</a>` : ''}
        <button class="btn small danger" type="button" data-ka="del">حذف</button>
      </div>
      <div class="result" data-out hidden></div>
    </article>`;
  }
  function testHtml(r) {
    if (!r) return '';
    if (r.services) {
      return `<div class="res ${r.ok ? 'ok' : 'err'}"><b>${r.ok ? '✓ التوكن مقبول' : '✗ ' + esc(r.error || 'تعذّر')}</b> — ${secs(r.ms)} ث<ul class="kn-svc">${r.services
        .map((x) => `<li class="${x.ok ? 'ok' : 'bad'}"><b>${x.ok ? '✓' : '✗'} ${esc(x.label)}</b>${x.ok ? (x.sample ? `<small>${esc(cut(x.sample, 90))}</small>` : '<small>يجيب</small>') : `<small>${esc(x.error)}</small>`}</li>`)
        .join('')}</ul></div>`;
    }
    if (!r.ok) return `<div class="res err"><b>✗ ${esc(r.error || 'تعذّر')}</b>${r.detail ? `<div class="detail"><code dir="ltr">${esc(r.detail)}</code></div>` : ''}</div>`;
    if (r.lexicons != null) return `<div class="res ok"><b>✓ سِوار يجيب</b> — ${cnt(r.lexicons, 'معجم')} عامة${r.names && r.names.length ? `: ${esc(r.names.join('، '))}…` : ''}${r.sample ? `<div class="kn-sample">مثال: ${esc(r.sample)}</div>` : ''}${r.langs && r.langs.length ? `<div class="tip">لغات المقابلات في المعاجم: <span dir="ltr">${esc(r.langs.join(', '))}</span></div>` : ''}</div>`;
    if (r.sample != null && r.n == null) return `<div class="res ok"><b>✓ يترجم</b> — ${secs(r.ms)} ث: «الحمد لله رب العالمين» ← <q dir="auto">${esc(r.sample)}</q>${r.usage ? `<div class="tip">${esc(r.usage)}</div>` : ''}</div>`;
    return `<div class="res ok"><b>✓ يجيب</b> — ${r.n ? cnt(r.n, 'نتيجة') : 'بلا نتائج'}${r.sample ? `: ${esc(r.sample)}` : ''}${r.note ? `<div class="tip">${esc(r.note)}</div>` : ''}</div>`;
  }
  /** نموذج إضافة مفتاح (لمصادر العلم أو الترجمة) */
  function addForm(where) {
    const kinds = where === 'sci' ? SCI_KINDS : TRANS_KINDS;
    const first = kinds[0];
    return `<form class="panel addkey kn-add" data-where="${where}" autocomplete="off">
      <h4 class="sec">إضافة مفتاح</h4>
      <div class="grid2">
        <label class="field">الخدمة<select name="kind">${kinds.map((k) => `<option value="${k}" ${k === first ? 'selected' : ''}>${esc(kindLabel(k))}</option>`).join('')}</select></label>
        <label class="field">اسم للتمييز (اختياري)<input name="label" maxlength="60" placeholder="مثل: توكن الدرر"></label>
      </div>
      <p class="hint kn-khint"></p>
      <div class="keybox"><input name="key" type="password" placeholder="الصق المفتاح هنا…" dir="ltr" spellcheck="false"><button class="btn small" type="button" data-show>إظهار</button></div>
      <div class="kn-extra"></div>
      <label class="chk kn-link"><input type="checkbox" name="link" checked> <span></span></label>
      <div class="row"><button class="btn" type="button" data-test>🧪 اختبار</button><span class="spacer"></span><button class="btn primary" type="submit">＋ إضافة</button></div>
      <div class="result" data-msg hidden></div>
    </form>`;
  }
  function paintAddExtra(form) {
    const kind = form.kind.value;
    const K2 = K.kinds[kind] || {};
    const where = form.dataset.where;
    $('.kn-khint', form).innerHTML = `${esc(K2.hint || '')}${K2.keyUrl ? ` — <a href="${esc(K2.keyUrl)}" target="_blank" rel="noopener">من أين؟ ↗</a>` : ''}`;
    form.key.placeholder = K2.keyOptional ? 'المفتاح (إن طلبه الخادم)' : 'الصق المفتاح هنا…';
    $('.kn-extra', form).innerHTML = [
      K2.base ? `<label class="field">${kind === 'custom' ? 'عنوان البحث (ضع {q} حيث تُكتب كلمات البحث)' : 'عنوان الخادم'}<input name="base" dir="ltr" placeholder="${kind === 'custom' ? 'https://example.com/api/search?q={q}' : 'https://libretranslate.com'}"></label>` : '',
      K2.region ? '<label class="field">المنطقة (Region)<input name="region" dir="ltr" placeholder="مثل westeurope — اتركه فارغاً للمفتاح العام"></label>' : '',
      kind === 'siwar' ? '<label class="field">معرّفات معاجم بعينها (اختياري)<input name="lexiconIds" dir="ltr" placeholder="فارغ: كل المعاجم العامة"></label>' : '',
      kind === 'custom' ? '<div class="grid2"><label class="field">ترويسة المفتاح<input name="header" dir="ltr" placeholder="authorization"></label><label class="field">قبل المفتاح<input name="prefix" dir="ltr" value="Bearer "></label></div><label class="field">مسار النتائج والحقول (اختياري)<input name="paths" dir="ltr" placeholder="data.items | title | text | url"></label>' : '',
    ].join('');
    const link = $('.kn-link', form);
    const txt =
      where === 'sci'
        ? kind === 'dorar'
          ? 'اربطه بأقسامه السبعة (العقيدة، الحديث، التفسير، الفقه، الأخلاق والسلوك، الأدب، التاريخ): كلٌّ بموسوعته'
          : kind === 'siwar'
            ? 'اربطه بقسم «اللغة»'
            : ''
        : kind === 'siwar'
          ? 'واستعمله أيضاً في قسم «اللغة» من مصادر العلم'
          : '';
    link.hidden = !txt;
    $('span', link).textContent = txt;
  }
  const draftOf = (form) => {
    const d = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
    d.for = form.dataset.where;
    if (d.link === 'on' && !$('.kn-link', form).hidden) d.link = 'auto';
    else delete d.link;
    return d;
  };
  /** شكل المفتاح: يُعرف نوعه منه أحياناً */
  function guess(form) {
    const k = form.key.value.trim();
    let g = '';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:fx$/i.test(k)) g = 'deepl';
    else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) g = form.dataset.where === 'trans' && form.kind.value !== 'siwar' ? '' : 'siwar';
    else if (/^AIza/.test(k)) g = 'google';
    if (g && [...form.kind.options].some((o) => o.value === g) && form.kind.value !== g) {
      form.kind.value = g;
      paintAddExtra(form);
      toast('تعرّفنا عليه من شكله: ' + kindLabel(g));
    }
  }
  function wireAdd(root) {
    for (const form of $$('.kn-add', root)) {
      paintAddExtra(form);
      form.kind.addEventListener('change', () => paintAddExtra(form));
      form.key.addEventListener('input', () => guess(form));
      $('[data-show]', form).addEventListener('click', (e) => {
        form.key.type = form.key.type === 'password' ? 'text' : 'password';
        e.target.textContent = form.key.type === 'password' ? 'إظهار' : 'إخفاء';
      });
      $('[data-test]', form).addEventListener('click', async () => {
        const out = $('[data-msg]', form);
        busy(out, form.kind.value === 'dorar' ? 'نختبر التوكن في كل موسوعة…' : 'نختبر…');
        try {
          show(out, testHtml(await api('/api/admin/know/keys/test', { method: 'POST', body: draftOf(form) })));
        } catch (e) {
          show(out, `<div class="res err">${esc(e.message)}</div>`);
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const out = $('[data-msg]', form);
        try {
          const r = await api('/api/admin/know/keys', { method: 'POST', body: draftOf(form) });
          toast('أُضيف المفتاح، ونختبره الآن…');
          setView(r.view);
          runTest(r.key.id);
        } catch (err) {
          show(out, `<div class="res err">${esc(err.message)}</div>`);
        }
      });
    }
  }
  async function runTest(id) {
    const out = document.querySelector(`.kn-key[data-key="${CSS.escape(id)}"] [data-out]`);
    if (!out) return;
    busy(out, 'نختبر…');
    try {
      const r = await api(`/api/admin/know/keys/${id}/test`, { method: 'POST' });
      const v = await api('/api/admin/know');
      setView(v);
      const again = document.querySelector(`.kn-key[data-key="${CSS.escape(id)}"] [data-out]`);
      if (again) show(again, testHtml(r));
    } catch (e) {
      show(out, `<div class="res err">${esc(e.message)}</div>`);
    }
  }
  /** أحداث بطاقات المفاتيح (في القسمين) */
  function wireKeys(root) {
    root.addEventListener('input', (e) => {
      const card = e.target.closest('.kn-key');
      if (card && e.target.dataset.kf && e.target.dataset.kf !== 'enabled' && e.target.dataset.kf !== 'label') $('[data-ka="save"]', card).hidden = false;
    });
    root.addEventListener('change', async (e) => {
      const card = e.target.closest('.kn-key');
      const f = e.target.dataset.kf;
      if (!card || (f !== 'enabled' && f !== 'label')) return;
      try {
        setView(await api('/api/admin/know/keys/' + card.dataset.key, { method: 'PATCH', body: { [f]: f === 'enabled' ? e.target.checked : e.target.value } }));
        toast('حُفظ');
      } catch (err) {
        toast(err.message);
        load();
      }
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ka]');
      const card = b && b.closest('.kn-key');
      if (!card) return;
      const id = card.dataset.key;
      try {
        if (b.dataset.ka === 'test') return runTest(id);
        if (b.dataset.ka === 'rekey') {
          const k = prompt('الصق المفتاح الجديد:');
          if (!k) return;
          setView(await api('/api/admin/know/keys/' + id, { method: 'PATCH', body: { key: k } }));
          toast('حُفظ المفتاح الجديد');
          return runTest(id);
        }
        if (b.dataset.ka === 'save') {
          const body = Object.fromEntries($$('[data-kf]', card).filter((i) => i.dataset.kf !== 'enabled' && i.dataset.kf !== 'label').map((i) => [i.dataset.kf, i.value]));
          setView(await api('/api/admin/know/keys/' + id, { method: 'PATCH', body }));
          toast('حُفظ');
          return runTest(id);
        }
        if (b.dataset.ka === 'del') {
          const k = K.keys.find((x) => x.id === id) || {};
          if (!confirm(`حذف المفتاح «${k.label}»؟${k.usedIn && k.usedIn.length ? ' يُفكّ من: ' + k.usedIn.join('، ') + '.' : ''}`)) return;
          setView(await api('/api/admin/know/keys/' + id, { method: 'DELETE' }));
          toast('حُذف');
        }
      } catch (err) {
        toast(err.message);
      }
    });
  }

  /* ================================================================ مصادر الترجمة */
  const transBox = $('#kn-trans');
  function paintTrans() {
    const T = K.trans;
    const keys = K.keys.filter((k) => (T.keys || []).includes(k.id) || (TRANS_KINDS.includes(k.kind) && k.kind !== 'siwar' && !k.usedIn.length));
    const engines = keys.filter((k) => k.engine);
    const langs = Object.entries(K.langs);
    const lsel = (f, cur, auto) => `<select data-tf="${f}">${langs.filter(([k]) => auto || k !== 'auto').map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    const mode = T.mode || 'ai';
    const noEngine = !engines.length;
    const focus = document.activeElement && transBox.contains(document.activeElement) ? document.activeElement.dataset.tf : '';
    transBox.innerHTML = `<div class="step-h"><h2>مصادر الترجمة</h2></div>
      <p class="hint">ترجمة المحدَّد أو الفصل أو الكتاب كله من «المساعد» في المحرِّر. لها ثلاث طرق: <b>الذكاء الاصطناعي</b> الذي تختاره (ويستعين بمسردك ومعاجم سِوار في المصطلحات)، أو <b>محرك ترجمة</b> وحده بلا ذكاء اصطناعي (DeepL، Google، Microsoft، LibreTranslate — أسرع وأرخص للكتب الطويلة)، أو <b>المحرك ثم يراجعه الذكاء</b>.</p>
      <div class="kn-note"><b>عن سِوار:</b> منصة معاجم لا محرك ترجمة: فيها معاني المفردات ومقابلاتها في المعاجم الثنائية اللغة، فتُعين في المصطلحات (تُرسل مقابلاتها مع كل دفعة)، ولا تترجم الجمل وحدها. ولترجمة الكتاب بلا ذكاء اصطناعي أضف مفتاح محرك.</div>
      <div class="panel kn-set">
        <div class="kn-row"><span class="kn-l">الطريقة</span><div class="sd-seg kn-seg" role="group">${[
          ['ai', 'الذكاء الاصطناعي'],
          ['engine', 'المحرك وحده'],
          ['hybrid', 'المحرك ثم يراجعه الذكاء'],
        ]
          .map(([v, n]) => `<button type="button" data-tmode="${v}" aria-pressed="${mode === v}" ${v !== 'ai' && noEngine ? 'disabled title="أضف مفتاح محرك ترجمة أولاً"' : ''}>${n}</button>`)
          .join('')}</div></div>
        <div class="kn-row"><span class="kn-l">الذكاء الاصطناعي</span><div>${aiSelect('ai', T.ai).replace('data-f="ai"', 'data-tf="ai"')}<small class="muted">من مفاتيحك في «الذكاء الاصطناعي»: يُجرَّب أولاً، ثم سلسلة المحرِّر احتياطاً.</small></div></div>
        <div class="kn-row"><span class="kn-l">المحرك</span><div><select data-tf="engine" ${noEngine ? 'disabled' : ''}><option value="">${noEngine ? 'لا محرك بعد' : 'الأول من المفاتيح'}</option>${engines.map((k) => `<option value="${k.id}" ${T.engine === k.id ? 'selected' : ''}>${esc(k.label)} (${esc(k.kindLabel)})</option>`).join('')}</select></div></div>
        <div class="kn-row"><span class="kn-l">من ← إلى</span><div class="kn-langs">${lsel('from', T.from, true)}<span aria-hidden="true">←</span>${lsel('to', T.to, false)}</div></div>
        <div class="kn-row"><span class="kn-l">صيغ التعظيم</span><div class="sd-seg kn-seg" role="group">${[
          ['keep', 'تبقى بحروفها (ﷺ)'],
          ['translate', 'تُترجم'],
        ]
          .map(([v, n]) => `<button type="button" data-thonor="${v}" aria-pressed="${(T.honor || 'keep') === v}">${n}</button>`)
          .join('')}</div></div>
        <div class="kn-row"><span class="kn-l">المصطلحات</span><label class="chk"><input type="checkbox" data-tf="useSiwar" ${T.useSiwar ? 'checked' : ''}> استعن بمعاجم سِوار في مقابلات المفردات (من العربية)</label></div>
        <div class="kn-row"><span class="kn-l">توجيه للمترجم</span><textarea data-tf="note" rows="2" maxlength="600" placeholder="اختياري، مثل: «ترجمة ميسّرة للمسلمين الجدد»، أو «اكتب الأعلام كما في Encyclopaedia of Islam»">${esc(T.note || '')}</textarea></div>
        <div class="kn-row"><span class="kn-l">مسرد المصطلحات <small>${T.glossaryCount ? cnt(T.glossaryCount, 'مصطلح') : ''}</small></span><textarea data-tf="glossary" rows="5" dir="auto" placeholder="مصطلحٌ في كل سطر بمقابله:&#10;الصلاة = Salah (prayer)&#10;الزكاة = Zakah&#10;السنة = the Sunnah">${esc(T.glossary || '')}</textarea></div>
        <div class="row"><small class="muted">يُرسل منه مع كل دفعة ما ورد في نصها وحده.</small><span class="spacer"></span><button class="btn small primary" type="button" data-tsave>حفظ</button></div>
      </div>
      <h4 class="sec">مفاتيح الترجمة</h4>
      <div class="kn-keys">${keys.length ? keys.map(keyCard).join('') : '<p class="empty">لا مفاتيح للترجمة بعد. أضف مفتاح محرك، أو سِوار للمصطلحات. وبلا مفتاحٍ تعمل الترجمة بالذكاء الاصطناعي وحده.</p>'}</div>
      ${addForm('trans')}
      <div class="panel kn-lab">
        <h4 class="sec">جرّب الترجمة</h4>
        <textarea id="trTry" rows="3" dir="auto" placeholder="اكتب نصاً…">${esc(LS('warraq.knTrTry') || 'قال رسول الله ﷺ: «إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى».')}</textarea>
        <div class="row"><select id="trVia"><option value="">بالطريقة المختارة</option><option value="ai">الذكاء الاصطناعي</option>${noEngine ? '' : '<option value="engine">المحرك وحده</option><option value="hybrid">المحرك ثم الذكاء</option>'}</select><span class="spacer"></span><button class="btn primary" type="button" id="trRun">ترجم</button></div>
        <div id="trOut"></div>
      </div>`;
    wireAdd(transBox);
    if (focus) {
      const el = transBox.querySelector(`[data-tf="${focus}"]`);
      if (el) el.focus();
    }
  }
  async function saveTrans(patch, msg = 'حُفظ') {
    try {
      setView(await api('/api/admin/know/trans', { method: 'PUT', body: patch }));
      toast(msg);
    } catch (e) {
      toast(e.message);
    }
  }
  transBox.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tmode) return saveTrans({ mode: b.dataset.tmode }, 'الطريقة: ' + b.textContent);
    if (b.dataset.thonor) return saveTrans({ honor: b.dataset.thonor });
    if (b.hasAttribute('data-tsave')) return saveTrans({ note: $('[data-tf="note"]', transBox).value, glossary: $('[data-tf="glossary"]', transBox).value });
    if (b.id === 'trRun') {
      const text = $('#trTry').value.trim();
      if (!text) return;
      LS('warraq.knTrTry', text);
      const out = $('#trOut');
      busy(out, 'يترجم…');
      try {
        const r = await api('/api/admin/know/translate', { method: 'POST', body: { items: [{ id: '1', text }], via: $('#trVia').value || undefined } });
        out.innerHTML = `<div class="res ok"><b>✓ ${esc(r.via === 'engine' ? 'المحرك ' + (r.engine || '') : r.via === 'hybrid' ? `${r.engine} ثم ${r.provider}` : r.provider || '')}</b>${r.ms ? ` — ${secs(r.ms)} ث` : ''}<p class="kn-tr" dir="auto">${esc(r.items[0].text)}</p>${r.glossary && r.glossary.length ? `<div class="tip">المسرد المُرسل: ${r.glossary.map((g) => `${esc(g.src)} = ${esc(g.dst)} <small>(${esc(g.from)})</small>`).join(' · ')}</div>` : ''}</div>`;
      } catch (err) {
        out.innerHTML = `<div class="res err">${esc(err.message)}</div>`;
      }
    }
  });
  transBox.addEventListener('change', (e) => {
    const f = e.target.dataset.tf;
    if (!f || f === 'note' || f === 'glossary') return;
    saveTrans({ [f]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  });
  wireKeys(transBox);

  /* ================================================================ مصادر العلم */
  const sciBox = $('#kn-sci');
  const MATCH = { all: 'كل الكلمات', any: 'أي كلمة', phrase: 'العبارة كما هي' };
  const IN = { both: 'العنوان والنص', title: 'العنوان', text: 'النص' };
  const SORT = { relevance: 'الأقرب', newest: 'الأحدث', oldest: 'الأقدم' };
  const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${String(cur) === String(k) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  function linkRow(c, l, i) {
    const k = K.keys.find((x) => x.id === l.key);
    if (!k) return '';
    const o = l.opts || {};
    const svc = l.service;
    return `<li class="kn-lk ${k.enabled ? '' : 'is-off'}" data-li="${i}">
      <span class="kn-ico sm k-${esc(k.kind)}" aria-hidden="true">${ICON[k.kind] || '•'}</span>
      <b>${esc(k.label)}</b>
      ${k.kind === 'dorar' ? `<select data-lf="service" title="الموسوعة">${opt(K.services, svc)}</select>` : `<small>${esc(k.kindLabel)}</small>`}
      ${k.kind === 'dorar' ? `<select data-lf="match" title="مطابقة كلمات البحث">${opt(MATCH, o.match || 'all')}</select>` : ''}
      ${k.kind === 'dorar' && svc === 'hadith' ? `<select data-lf="degree" title="درجة الأحاديث">${opt(K.degrees, o.degree || 0)}</select>` : ''}
      ${k.kind === 'dorar' && ['aqeeda', 'feqhia', 'alakhlaq', 'aadab'].includes(svc) ? `<select data-lf="in" title="موضع البحث">${opt(IN, o.in || 'both')}</select>` : ''}
      ${k.kind === 'dorar' && svc === 'history' ? `<select data-lf="sort" title="الترتيب">${opt(SORT, o.sort || 'relevance')}</select>` : ''}
      ${k.kind === 'dorar' && svc === 'tafseer' ? `<select data-lf="category" title="نوع المادة"><option value="">كل المواد</option>${opt(K.tafseerCats, o.category || '')}</select>` : ''}
      <button type="button" class="kn-x" data-la="unlink" title="فكّ هذا المفتاح من القسم" aria-label="فكّ">✕</button>
    </li>`;
  }
  function catCard(c) {
    const linkable = K.keys.filter((k) => SCI_KINDS.includes(k.kind));
    const open = OPEN.has(c.id) || c.custom;
    const ready = c.free || c.keys.some((l) => (K.keys.find((k) => k.id === l.key) || {}).enabled);
    const pill = c.free ? '<span class="pill idle">بلا مصادر</span>' : c.keys.length ? `<span class="pill ${ready ? 'ok' : 'warn'}">${cnt(c.keys.length, 'مفتاح')}</span>` : '<span class="pill warn">لا مفتاح</span>';
    return `<article class="kn-cat ${c.enabled ? '' : 'is-off'} ${c.free ? 'free' : ''}" data-cat="${esc(c.id)}">
      <header class="kn-cat-h">
        <button type="button" class="kn-cat-n" data-ca="open" aria-expanded="${open}"><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small></button>
        ${pill}
        <label class="switch sm" title="${c.enabled ? 'مفعّل: يظهر في المساعد' : 'موقوف'}"><input type="checkbox" data-cf="enabled" ${c.enabled ? 'checked' : ''}><span></span></label>
      </header>
      <div class="kn-cat-ai"><span>الذكاء الاصطناعي</span>${aiSelect('ai', c.ai, c.free ? 'سلسلة المحرِّر' : 'سلسلة المحرِّر (الأول فالتالي)').replace('data-f="ai"', 'data-cf="ai"')}</div>
      ${
        c.free
          ? '<p class="hint kn-free">لا يُبحث في شيء: الذكاء الاصطناعي حرٌّ في جوابه. واختر له ذكاءً إن شئت.</p>'
          : `<ul class="kn-links">${c.keys.map((l, i) => linkRow(c, l, i)).join('')}</ul>
        <div class="kn-cat-add"><select data-ca="link"><option value="">＋ اربط مفتاحاً${c.keys.length ? ' آخر' : ''}…</option>${linkable.map((k) => `<option value="${esc(k.id)}">${esc(k.label)} (${esc(k.kindLabel)})</option>`).join('')}</select>${linkable.length ? '' : '<small class="muted">أضف مفتاحاً في الأسفل أولاً.</small>'}</div>`
      }
      ${
        c.custom && open
          ? `<div class="kn-cat-own">
        <div class="grid2"><label class="field">الاسم<input data-cown="name" value="${esc(c.name)}" maxlength="60"></label><label class="field">الموسوعة الأصل في الدرر<select data-cown="dorar"><option value="">—</option>${opt(K.services, c.dorar)}</select></label></div>
        <label class="field">وصفه (يقرؤه المخطِّط ليعرف متى يُبحث فيه)<input data-cown="desc" value="${esc(c.desc)}" maxlength="200"></label>
        <label class="field">كلماتٌ تدلّ عليه في النص (للاختيار التلقائي بلا ذكاء)<input data-cown="words" value="${esc(c.wordsText || '')}" maxlength="1200" placeholder="مثل: الميراث، الفرائض، العصبة"></label>
        <div class="row"><button type="button" class="btn small primary" data-ca="saveown">حفظ</button><span class="spacer"></span><button type="button" class="btn small danger" data-ca="del">حذف القسم</button></div>
      </div>`
          : ''
      }
    </article>`;
  }
  function paintSci() {
    const S = K.sci;
    const keys = K.keys.filter((k) => SCI_KINDS.includes(k.kind));
    const ready = S.cats.filter((c) => !c.free && c.keys.length);
    const labCats = LS('warraq.knLab') || 'auto';
    sciBox.innerHTML = `<div class="step-h"><h2>مصادر العلم</h2></div>
      <p class="hint">ما يستعين به «المساعد» في المحرِّر (والرَّحل) فوق علمه: يُبحث في هذه الأقسام بحسب النص الذي حدّدته أو سؤالك، وتُرسل النتائج مرقّمةً مع التوجيه، فيبني عليها جوابه ويذكر رقم كل مصدر، ويحكم على الحديث بما في المصدر لا من عنده. لكل قسمٍ مفتاحٌ أو أكثر، وذكاءٌ اصطناعي تختاره. و«عام» بلا مصادر: الذكاء حرٌّ في جوابه.</p>
      ${!keys.length ? `<div class="kn-start"><b>ابدأ بمفتاح الدرر السنية</b><span>توكنٌ واحد للموسوعات السبع (الحديثية، والتفسير، والعقدية، والفقهية، والأخلاق، والآداب، والتاريخية): يُطلب من <a href="https://dorar.net/api-services/request" target="_blank" rel="noopener">صفحة طلب الوصول ↗</a> ويصل إلى بريدك، فتضعه في الأسفل فيُربط كل قسمٍ بموسوعته. ولقسم «اللغة» مفتاح سِوار.</span></div>` : ''}
      <div class="panel kn-set">
        <div class="kn-row"><span class="kn-l">في المساعد</span><label class="chk"><input type="checkbox" data-sf="auto" ${S.auto ? 'checked' : ''}> «تلقائي» أولاً: يُختار من الأقسام ما يناسب النص (ولك أن تختار غيره في المساعد)</label></div>
        <div class="kn-row"><span class="kn-l">اختيار الأقسام</span><label class="chk"><input type="checkbox" data-sf="plan" ${S.plan ? 'checked' : ''}> بالذكاء الاصطناعي: يقرأ النص فيختار الأقسام ويكتب كلمات البحث (أدقّ، وطلبٌ قصيرٌ زائد) — وإلا فبكلماتٍ تدلّ عليها</label></div>
        <div class="kn-row"><span class="kn-l">النتائج لكل قسم</span><div class="sd-range kn-range"><b id="knMaxN">${ar(S.max)}</b><input type="range" min="1" max="10" step="1" value="${S.max}" data-sf="max" style="--v:${S.max}"><small>من ١ إلى ١٠</small></div></div>
      </div>
      <div class="row between"><h4 class="sec">الأقسام <small class="muted">— ${ready.length ? (ready.length === 1 ? 'قسمٌ واحد له' : cnt(ready.length, 'قسم') + ' لها') + ' مصادر' : 'لا مصادر بعد'}</small></h4><button type="button" class="btn small" data-sa="newcat">＋ قسمٌ خاص</button></div>
      <form class="panel kn-newcat" id="knNewCat" hidden autocomplete="off">
        <div class="grid2"><label class="field">اسم القسم<input name="name" maxlength="60" required placeholder="مثل: الفرائض، أصول الفقه، السيرة"></label><label class="field">وصفه<input name="desc" maxlength="200" placeholder="ما يُبحث فيه"></label></div>
        <label class="field">كلماتٌ تدلّ عليه (اختياري)<input name="words" maxlength="1200" placeholder="الميراث، الفرائض، العصبة، الحجب"></label>
        <div class="row"><button class="btn primary" type="submit">إنشاء</button><button class="btn small" type="button" data-sa="cancelcat">إلغاء</button></div>
      </form>
      <div class="kn-cats">${S.cats.map(catCard).join('')}</div>
      <h4 class="sec">مفاتيح مصادر العلم</h4>
      <div class="kn-keys">${keys.length ? keys.map(keyCard).join('') : '<p class="empty">لا مفاتيح بعد.</p>'}</div>
      ${addForm('sci')}
      <div class="panel kn-lab">
        <h4 class="sec">مختبر البحث</h4>
        <p class="hint">اكتب نصاً (أو سؤالاً) كما يصل المساعد، وشاهد ما يُختار من الأقسام وكلمات البحث وما يُعاد.</p>
        <textarea id="knLabText" rows="3" dir="auto" placeholder="مثل: قال رسول الله ﷺ: «من حسن إسلام المرء تركه ما لا يعنيه»">${esc(LS('warraq.knLabText') || '')}</textarea>
        <div class="kn-chips" id="knLabCats">${[['auto', 'تلقائي'], ...S.cats.filter((c) => !c.free && c.enabled).map((c) => [c.id, c.name])].map(([id, n]) => `<button type="button" data-lab="${esc(id)}" aria-pressed="${labCats.split(',').includes(id)}">${esc(n)}</button>`).join('')}</div>
        <div class="row"><input id="knLabQ" class="grow" dir="auto" placeholder="كلمات بحثٍ بعينها (اختياري)"><button class="btn primary" type="button" id="knLabRun">ابحث</button></div>
        <div id="knLabOut"></div>
      </div>`;
    wireAdd(sciBox);
  }
  const catOf = (el) => {
    const card = el.closest('.kn-cat');
    return card ? K.sci.cats.find((c) => c.id === card.dataset.cat) : null;
  };
  async function saveCat(c, patch, msg) {
    try {
      setView(await api('/api/admin/know/sci', { method: 'PUT', body: { cat: { id: c.id, ...patch } } }));
      if (msg) toast(msg);
    } catch (e) {
      toast(e.message);
      load();
    }
  }
  sciBox.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = catOf(b);
    if (b.dataset.ca === 'open' && c) {
      OPEN.has(c.id) ? OPEN.delete(c.id) : OPEN.add(c.id);
      return paintSci();
    }
    if (b.dataset.la === 'unlink' && c) {
      const i = +b.closest('[data-li]').dataset.li;
      const keys = c.keys.filter((_, j) => j !== i);
      return saveCat(c, { keys }, 'فُكّ المفتاح من «' + c.name + '»');
    }
    if (b.dataset.ca === 'saveown' && c) {
      const card = b.closest('.kn-cat');
      const own = Object.fromEntries($$('[data-cown]', card).map((i) => [i.dataset.cown, i.value]));
      return saveCat(c, own, 'حُفظ القسم');
    }
    if (b.dataset.ca === 'del' && c) {
      if (!confirm(`حذف القسم «${c.name}»؟`)) return;
      try {
        setView(await api('/api/admin/know/sci/cats/' + c.id, { method: 'DELETE' }));
        toast('حُذف القسم');
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    if (b.dataset.sa === 'newcat') {
      $('#knNewCat').hidden = false;
      return $('#knNewCat').elements.namedItem('name').focus();
    }
    if (b.dataset.sa === 'cancelcat') return ($('#knNewCat').hidden = true);
    if (b.dataset.lab) {
      let cur = (LS('warraq.knLab') || 'auto').split(',');
      const id = b.dataset.lab;
      if (id === 'auto') cur = ['auto'];
      else {
        cur = cur.filter((x) => x !== 'auto');
        cur = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        if (!cur.length) cur = ['auto'];
      }
      LS('warraq.knLab', cur.join(','));
      for (const x of $$('#knLabCats [data-lab]')) x.setAttribute('aria-pressed', String(cur.includes(x.dataset.lab)));
      return;
    }
    if (b.id === 'knLabRun') {
      const text = $('#knLabText').value.trim();
      const q = $('#knLabQ').value.trim();
      if (!text && !q) return $('#knLabText').focus();
      LS('warraq.knLabText', text);
      const out = $('#knLabOut');
      busy(out, 'يبحث…');
      try {
        const r = await api('/api/admin/know/search', { method: 'POST', body: { cats: (LS('warraq.knLab') || 'auto').split(','), text, q, prompt: text.slice(0, 300) } });
        const how = { ai: 'اختار الأقسام وكلمات البحث الذكاءُ الاصطناعي', rules: 'اختيرت بكلماتٍ تدلّ عليها (بلا ذكاء اصطناعي)', q: 'بكلمات البحث التي كتبتها', none: 'لا قسم له مصادر', general: 'عام' }[r.how] || '';
        const used = (r.used || []).map((u) => `<li><b>${esc(u.name)}</b> — ${u.n ? cnt(u.n, 'نتيجة') : 'لا نتائج'}${u.queries && u.queries.length ? ` بـ: ${u.queries.map((q) => `«${esc(q)}»`).join('، ')}` : ''}</li>`).join('');
        const src = (r.sources || []).map((s) => `<li><span class="kn-n">${ar(s.n)}</span><div><small>${esc(s.catName)} · ${esc(s.via)}</small>${s.title ? `<b>${esc(s.title)}</b>` : ''}<p>${esc(cut(s.text, 260))}</p>${s.grade ? `<em>خلاصة حكم المحدث: ${esc(s.grade)}</em>` : ''}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" dir="ltr">${esc(cut(s.url, 60))}</a>` : ''}</div></li>`).join('');
        const errs = (r.errors || []).map((x) => `<li>${esc(x.cat)}: ${esc(x.error)}</li>`).join('');
        out.innerHTML = `<div class="res ${r.sources && r.sources.length ? 'ok' : ''}"><b>${r.sources && r.sources.length ? '✓ ' + cnt(r.sources.length, 'نتيجة') : 'لا نتائج'}</b> — ${esc(how)}${used ? `<ul class="kn-used">${used}</ul>` : ''}${errs ? `<ul class="kn-errs">${errs}</ul>` : ''}</div>${src ? `<ol class="kn-src">${src}</ol>` : ''}`;
      } catch (err) {
        out.innerHTML = `<div class="res err">${esc(err.message)}</div>`;
      }
    }
  });
  sciBox.addEventListener('change', async (e) => {
    const t = e.target;
    const c = catOf(t);
    if (t.dataset.sf) {
      const v = t.type === 'checkbox' ? t.checked : +t.value;
      try {
        setView(await api('/api/admin/know/sci', { method: 'PUT', body: { [t.dataset.sf]: v } }));
        toast('حُفظ');
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    if (!c) return;
    if (t.dataset.cf === 'enabled') return saveCat(c, { enabled: t.checked }, t.checked ? 'فُعّل «' + c.name + '»' : 'أُوقف «' + c.name + '»');
    if (t.dataset.cf === 'ai') return saveCat(c, { ai: t.value }, t.value ? 'الذكاء الاصطناعي لـ«' + c.name + '»: ' + aiName(t.value) : 'سلسلة المحرِّر');
    if (t.dataset.ca === 'link' && t.value) {
      const k = K.keys.find((x) => x.id === t.value);
      if (c.keys.some((l) => l.key === t.value && (k.kind !== 'dorar' || l.service === (c.dorar || 'hadith')))) {
        t.value = '';
        return toast('هذا المفتاح مربوطٌ بهذا القسم');
      }
      return saveCat(c, { keys: [...c.keys, { key: t.value, service: k && k.kind === 'dorar' ? c.dorar || 'hadith' : '', opts: {} }] }, 'رُبط المفتاح بـ«' + c.name + '»');
    }
    if (t.dataset.lf) {
      const i = +t.closest('[data-li]').dataset.li;
      const keys = c.keys.map((l, j) => {
        if (j !== i) return l;
        if (t.dataset.lf === 'service') return { ...l, service: t.value, opts: { match: (l.opts || {}).match } };
        const opts = { ...(l.opts || {}), [t.dataset.lf]: t.value };
        if (!t.value || t.value === '0') delete opts[t.dataset.lf];
        return { ...l, opts };
      });
      return saveCat(c, { keys });
    }
  });
  sciBox.addEventListener('input', (e) => {
    if (e.target.dataset.sf === 'max') {
      $('#knMaxN').textContent = ar(e.target.value);
      e.target.style.setProperty('--v', e.target.value);
    }
  });
  sciBox.addEventListener('submit', async (e) => {
    if (e.target.id !== 'knNewCat') return;
    e.preventDefault();
    const f = e.target;
    try {
      const r = await api('/api/admin/know/sci/cats', { method: 'POST', body: { name: f.elements.namedItem('name').value, desc: f.elements.namedItem('desc').value, words: f.elements.namedItem('words').value } });
      OPEN.add(r.id);
      setView(r.view);
      toast('أُنشئ القسم: اربط به مفتاحاً');
    } catch (err) {
      toast(err.message);
    }
  });
  wireKeys(sciBox);

  /* ---- أول ما يُفتح ---- */
  paintNav();
  if (!tab.hidden) load();
}
