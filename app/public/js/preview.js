// المعاينة الحية: ست لوحات تُنضَّد بمحرك التنضيد الحقيقي داخل إطار، وتتحدث مع كل تغيير في الإعدادات.
// تُستعمل في صفحة المستخدم (إعدادات التنضيد) وفي محرر الأساليب عند المالك.
import { buildPreviewDoc, PREVIEW_VIEWS, RESEARCH_VIEW_LABELS, MUTUN_VIEW_LABELS, MUTUN_OWN_LABELS } from '/shared/preview-sample.js';

const MM = 96 / 25.4;
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
// لوحات المتون
const MHINTS = {
  heads: 'نموذجٌ ثابت (لا من كتابك): متنٌ منثور مقسومٌ أجزاءً، ولكل جزءٍ موضع التعليق عليه بعنوانه وسطوره.',
  sharhPage: 'نموذجٌ ثابت (لا من كتابك): منظومةٌ بشطريها كما اخترت في «شطرا البيت»، ورقم البيت في خانته أو بين الشطرين، والكشيدة تسوّي الأشطر.',
  sharhOrn: 'متنك نفسه كما يخرج: أول أجزائه، ولكل جزءٍ موضع التعليق عليه. تنقّل بين الصفحات لترى المتن وما يقابله.',
};
// لوحات البحث العلمي
const RHINTS = {
  cover: 'صفحة عنوان البحث كما جاءت في ملفه: الجامعة والكلية والقسم أعلاها، والعنوان في وسطها، ثم الباحث والمشرف، والعام في أسفلها.',
  heads: 'الملخص بحجمه، والكلمات المفتاحية بعنوانها العريض، والملخص الإنجليزي من اليسار بخط Times New Roman.',
  sharhPage: 'المقدمة، ثم المباحث والمطالب بمستوياتها (بالحجم والوزن لا بالألوان)، والحواشي ١٢ تحت خطها.',
  sharhOrn: 'الخاتمة بنتائجها وتوصياتها.',
  verses: 'المصادر والمراجع بحجم ١٤ وبمسافة معلّقة: أول سطر كل مرجع بارز، وما بعده داخلٌ عنه.',
  toc: 'فهرس الموضوعات بعناوين البحث وأرقام صفحاتها.',
};
const HINTS = {
  cover: 'أول صفحة داخل الكتاب: العنوان والمؤلف والمحقق والطبعة. وبعدها الصفحات الخاصة إن حملها الأسلوب.',
  heads: 'الأبواب والفصول والعناوين الفرعية مع النص وحواشيه.',
  sharhPage: 'كل متن جديد يبدأ في أول صفحة جديدة. تنقّل بين الصفحات لترى ذلك.',
  sharhOrn: 'ثلاثة رموز بعد كل شرح، ثم يأتي المتن التالي في الصفحة نفسها.',
  verses: 'الآيات بلونها، والأبيات مضبوطة الأشطر بالفاصل المختار.',
  toc: 'الفهرس بالمستويات المختارة وأرقام الصفحات.',
};

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {() => object} o.getSettings        الإعدادات الكاملة الحالية
 * @param {() => object} [o.getCover]         بيانات الغلاف الداخلي (إن وُجد كتاب)
 * @param {() => object} [o.getParseOpts]     { matnQawluhu }
 * @param {() => object} [o.getExtras]        إضافات غير محفوظة (محرر المالك)
 * @param {string} [o.endpoint]               '/api/preview' أو مسار المالك
 * @param {string} [o.title]
 * @param {(warnings: string[]) => void} [o.onWarnings]  تنبيهات التنضيد (منها أخطاء برنامج الأسلوب)
 * @param {Array<{key,label,short}>} [o.views]  لوحات غير الست المعتادة (محرر إعدادات الطباعة: ما قبل الكتاب، الكتاب، ما بعده)
 * @param {object} [o.hints]                  شرح كل لوحة من o.views · [o.empty] ما يُكتب في لوحة فارغة
 * @param {string} [o.view]                   اللوحة الأولى
 * @param {() => object|null} [o.getPrint]    إعداد طباعة غير محفوظ (null = إعداد الموقع)
 * @param {boolean} [o.spread]               صفحتان متقابلتين (برنامج سطح المكتب): اليمنى ثم اليسرى كما في الكتاب العربي
 * @param {boolean} [o.fill]                 الصفحة تملأ ارتفاع مكانها (لا ارتفاع النافذة)
 *
 * مستند المعاينة يعمل في إطار معزول (sandbox بلا allow-same-origin): قد يحمل كوداً من بطاقة أسلوب،
 * فلا يصل إلى الموقع ولا إلى جلسته. التخاطب معه برسائل: هو يخبر بعدد صفحات كل لوحة، ونحن نطلب عرض صفحة.
 */
export function createPreview(host, o) {
  const endpoint = o.endpoint || '/api/preview';
  const VIEWS = o.views || PREVIEW_VIEWS;
  const HINT = { ...HINTS, ...(o.hints || {}) };
  const EMPTY = { toc: 'الفهرس معطّل: موقع الفهرس «بدون»، أو لم يُختر أي مستوى من العناوين.', ...(o.empty || {}) };
  host.classList.add('pvw');
  const tabs = `<div class="pvw-tabs" role="tablist">${VIEWS.map((v, i) => `<button type="button" role="tab" data-view="${v.key}" title="${v.label}"><i>${ar(i + 1)}</i>${v.short}</button>`).join('')}</div>`;
  const pager = `<div class="pvw-pager" hidden><button type="button" data-step="-1" aria-label="الصفحة السابقة">›</button><span></span><button type="button" data-step="1" aria-label="الصفحة التالية">‹</button></div>`;
  const stageHtml = `<div class="pvw-stage"><div class="pvw-paper"><div class="pvw-off" hidden></div></div></div>`;
  host.innerHTML = o.bar
    ? // شريط واحد فوق المعاينة (المنضدة في البرنامج): صفحتان أو صفحة، واللوحات، والصفحات
      `<div class="pvw-bar">
        <span class="pvw-mode" role="group" aria-label="العرض"><button type="button" data-spread="1">صفحتان</button><button type="button" data-spread="0">صفحة</button></span>
        ${tabs}
        <span class="pvw-status" aria-live="polite"></span>
        ${pager}
        <button type="button" class="pvw-zoom" title="ملء النافذة (Esc للعودة)" aria-label="ملء النافذة">⤢</button>
      </div>
      ${stageHtml}
      <p class="pvw-hint"></p>`
    : `
    <div class="pvw-head">
      <b class="pvw-title">${o.title || 'معاينة حية'}</b>
      <span class="pvw-status" aria-live="polite"></span>
      <button type="button" class="pvw-zoom" title="تكبير المعاينة">⤢ تكبير</button>
    </div>
    ${tabs}
    ${stageHtml}
    <div class="pvw-foot">
      ${pager}
      <p class="pvw-hint"></p>
    </div>`;
  if (o.bar) host.classList.add('pvw-barred');
  const $ = (s) => host.querySelector(s);
  const paper = $('.pvw-paper');
  const stage = $('.pvw-stage');
  const off = $('.pvw-off');
  const st = { view: o.view || 'heads', page: 0, frame: null, frame2: null, spread: !!o.spread, views: {}, token: 0, timer: 0, dirty: true, w: 170 * MM, h: 240 * MM, focus: null };
  /** صفحتان متقابلتان الآن؟ (في لوحةٍ فيها أكثر من صفحة) */
  const twoUp = () => st.spread && !!st.frame2 && (st.views[st.view] || 0) > 1;

  const status = (t, cls) => {
    const el = $('.pvw-status');
    el.textContent = t || '';
    el.className = 'pvw-status' + (cls ? ' ' + cls : '');
  };

  function fit() {
    const full = host.classList.contains('pvw-full');
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - (full ? 40 : 0);
    if (availW <= 0) return;
    const availH = full || o.fill ? stage.clientHeight - 24 : Math.max(360, window.innerHeight - 250);
    const two = twoUp();
    const k = Math.min(availW / (st.w * (two ? 2 : 1)), availH / st.h, full ? 1.6 : 1.1);
    paper.style.width = st.w * k * (two ? 2 : 1) + 'px';
    paper.style.height = st.h * k + 'px';
    paper.style.setProperty('--k', k);
    paper.classList.toggle('pvw-two', two);
    for (const f of paper.querySelectorAll('iframe')) {
      f.style.width = st.w + 'px';
      f.style.height = st.h + 'px';
      // الصفحة الأولى يمين، والتي تليها يسار
      f.style.left = two && f === st.frame ? st.w * k + 'px' : '0';
    }
  }

  function show() {
    const f = st.frame;
    host.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === st.view)));
    host.querySelectorAll('[data-spread]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spread === (st.spread ? '1' : '0'))));
    $('.pvw-hint').textContent = (labelled === 'research' && RHINTS[st.view]) || (/^mutun/.test(labelled) && MHINTS[st.view]) || HINT[st.view] || '';
    if (!f || !f.contentWindow) return;
    const count = st.views[st.view] || 0;
    st.page = Math.min(st.page, Math.max(count - 1, 0));
    const two = twoUp();
    if (two) st.page -= st.page % 2;
    // face: وجه الصفحة في الصفحتين المتقابلتين (اليمنى ثم اليسرى)، فيقع الهامش الخارجي الواسع وهامش التجليد في موضعهما
    f.contentWindow.postMessage({ warraq: 'show', view: st.view, page: st.page, face: two ? 'r' : '' }, '*');
    if (st.frame2) {
      const has = two && st.page + 1 < count;
      st.frame2.style.visibility = has ? '' : 'hidden';
      if (has) st.frame2.contentWindow.postMessage({ warraq: 'show', view: st.view, page: st.page + 1, face: 'l' }, '*');
    }
    fit();
    const target = count > 0;
    off.hidden = target;
    if (!target) off.textContent = EMPTY[st.view] || 'لا شيء يُعرض في هذه اللوحة بهذه الإعدادات.';
    const pager = $('.pvw-pager');
    pager.hidden = count < 2;
    const last = two ? Math.min(st.page + 2, count) : st.page + 1;
    pager.querySelector('span').textContent = last > st.page + 1 ? `صفحة ${ar(st.page + 1)}–${ar(last)} من ${ar(count)}` : `صفحة ${ar(st.page + 1)} من ${ar(count)}`;
    pager.querySelector('[data-step="-1"]').disabled = st.page === 0;
    pager.querySelector('[data-step="1"]').disabled = last >= count;
  }

  async function run() {
    const token = ++st.token;
    if (!host.isConnected || stage.clientWidth <= 0) {
      st.dirty = true; // غير ظاهرة الآن: تُبنى عند ظهورها
      return;
    }
    st.dirty = false;
    let settings, built;
    try {
      settings = o.getSettings();
      // النصوص التجريبية (مجرّدةً من الكتاب)، ومعها في المتون متن المستخدم نفسه لوحةً بعدها
      const own = o.getDoc ? o.getDoc() : null;
      relabel(own && own.mode ? own.mode : modeOf(settings));
      built = own && own.doc && !own.extra ? own : buildPreviewDoc(settings, { cover: (own && own.cover) || (o.getCover ? o.getCover() : null), parseOpts: o.getParseOpts ? o.getParseOpts() : null, own: own && own.extra });
    } catch (e) {
      return status('تعذّر بناء المعاينة', 'err');
    }
    status('يُحدَّث…', 'busy');
    let html;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-warraq': '1' },
        body: JSON.stringify({ doc: built.doc, settings, cover: built.cover, marks: built.marks, origin: location.origin, extras: o.getExtras ? o.getExtras() : undefined, ...(o.getPrint ? { print: o.getPrint() } : {}), ...(o.getFonts ? { fonts: o.getFonts() } : {}), ...(o.getUserStyle ? { userStyle: o.getUserStyle() || undefined } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      html = j.html;
    } catch (e) {
      if (token === st.token) status('تعذّرت المعاينة: ' + e.message, 'err');
      return;
    }
    if (token !== st.token) return;
    st.w = (settings.page?.w || 170) * MM;
    st.h = (settings.page?.h || 240) * MM;
    const f = document.createElement('iframe');
    f.className = 'pvw-frame loading';
    f.setAttribute('tabindex', '-1');
    f.setAttribute('aria-hidden', 'true');
    f.title = 'معاينة الصفحة';
    f.setAttribute('sandbox', 'allow-scripts'); // معزول: لا أصل له، فلا يصل كودُ بطاقةٍ إلى الموقع
    f.srcdoc = html;
    // المستند يراسلنا حين يكتمل تنضيده: { views: عدد صفحات كل لوحة، error، warnings }
    const ready = waitReady(f);
    paper.appendChild(f);
    fit();
    const info = await ready;
    // الصفحة المقابلة: المستند نفسه في إطار ثانٍ
    let f2 = null;
    if (st.spread && info && !info.error && token === st.token) {
      f2 = document.createElement('iframe');
      f2.className = 'pvw-frame loading';
      f2.setAttribute('tabindex', '-1');
      f2.setAttribute('aria-hidden', 'true');
      f2.title = 'معاينة الصفحة المقابلة';
      f2.setAttribute('sandbox', 'allow-scripts');
      f2.srcdoc = html;
      const r2 = waitReady(f2);
      paper.appendChild(f2);
      if (!(await r2)) {
        f2.remove();
        f2 = null;
      }
    }
    return finish(f, f2, info, token);
  }

  /** البحث العلمي: لوحاته بأسمائها (الملخص، المباحث، الخاتمة، المصادر) بدل لوحات الكتاب */
  // labelled: '' (الكتب) · 'research' · 'mutun' — اللوحات بأسماء النوع، وما لا يخصه يُخفى
  let labelled = '';
  function relabel(mode) {
    mode = mode === true ? 'research' : mode || '';
    if (o.views || mode === labelled) return;
    labelled = mode;
    const L = mode === 'research' ? RESEARCH_VIEW_LABELS : mode === 'mutun' ? MUTUN_VIEW_LABELS : mode === 'mutun-own' ? MUTUN_OWN_LABELS : null;
    host.querySelectorAll('.pvw-tabs [data-view]').forEach((b) => {
      const v = PREVIEW_VIEWS.find((x) => x.key === b.dataset.view);
      if (!v) return;
      const r = L ? L[b.dataset.view] : undefined;
      b.hidden = r === null;
      const [label, short] = r || [v.label, v.short];
      b.title = label;
      b.lastChild.textContent = short;
    });
    if (L && L[st.view] === null) st.view = 'heads';
  }
  const modeOf = (s) => (s.template === 'research' ? 'research' : s.mutun ? 'mutun' : '');

  function waitReady(f) {
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.source !== f.contentWindow || !e.data || e.data.warraq !== 'ready') return;
        cleanup();
        resolve(e.data);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 30000);
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
      };
      window.addEventListener('message', onMsg);
    });
  }

  function finish(f, f2, info, token) {
    if (token !== st.token || !info) {
      f.remove();
      if (f2) f2.remove();
      if (token === st.token) status('تعذّرت المعاينة (انتهت المهلة)', 'err');
      return;
    }
    if (info.error) {
      f.remove();
      if (f2) f2.remove();
      return status('خطأ في التنضيد', 'err');
    }
    st.views = info.views || {};
    const warns = Array.isArray(info.warnings) ? info.warnings.map(String) : [];
    if (o.onWarnings) o.onWarnings(warns);
    const old = st.frame;
    const old2 = st.frame2;
    st.frame = f;
    st.frame2 = f2;
    if (st.focus && VIEWS.some((v) => v.key === st.focus)) {
      if (st.focus !== st.view) st.page = 0;
      st.view = st.focus;
    }
    st.focus = null;
    show();
    f.classList.remove('loading');
    if (f2) f2.classList.remove('loading');
    if (old) old.remove();
    if (old2) old2.remove();
    const bad = warns.find((w) => w.startsWith('script:'));
    status(bad ? 'خطأ في برنامج الأسلوب' : '', bad ? 'err' : '');
  }

  /** طلب تحديث (مؤجَّل قليلاً). focus: اللوحة التي يُنتقل إليها لأن التغيير يخصها */
  function update(focus) {
    try {
      const own = o.getDoc ? o.getDoc(true) : null;
      relabel(own && own.mode ? own.mode : modeOf(o.getSettings()));
    } catch {}
    if (focus === 'sharh') focus = (o.getSettings().sharhEnd || 'page') === 'ornament' ? 'sharhOrn' : 'sharhPage';
    // المتون: الأبيات وشطراها في لوحة النظم (لا لوحة «الآيات والشعر»: لا وجود لها فيها، فكانت المعاينة تختفي)
    if (/^mutun/.test(labelled) && focus === 'verses') focus = 'sharhPage';
    if (/^mutun/.test(labelled) && (focus === 'sharhOrn' && labelled !== 'mutun-own')) focus = null;
    if (focus) st.focus = focus;
    clearTimeout(st.timer);
    st.timer = setTimeout(run, 180);
  }

  host.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view]');
    if (tab) {
      st.view = tab.dataset.view;
      st.page = 0;
      return show();
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      st.page += +step.dataset.step * (twoUp() ? 2 : 1);
      return show();
    }
    const sp = e.target.closest('[data-spread]');
    if (sp) return api.setSpread(sp.dataset.spread === '1');
    if (e.target.closest('.pvw-zoom')) {
      const full = host.classList.toggle('pvw-full');
      e.target.closest('.pvw-zoom').textContent = o.bar ? (full ? '✕' : '⤢') : full ? '✕ إغلاق' : '⤢ تكبير';
      document.documentElement.classList.toggle('pvw-lock', full);
      // العنصر الحاوي (اللاصق) يُرفع فوق كل شيء ما دامت المعاينة مكبّرة
      if (host.parentElement) host.parentElement.classList.toggle('pvw-raise', full);
      requestAnimationFrame(fit);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host.classList.contains('pvw-full')) $('.pvw-zoom').click();
  });
  new ResizeObserver(() => {
    fit();
    if (st.dirty && stage.clientWidth > 0) update();
  }).observe(stage);
  window.addEventListener('resize', fit);
  const api = {
    update,
    setView: (v) => { st.view = v; st.page = 0; show(); },
    /** الانتقال إلى صفحة بعينها من لوحة (محرر الطباعة: الصفحة المختارة من التسلسل) */
    goto: (v, page) => { st.view = v; st.page = Math.max(0, page | 0); show(); },
    get state() { return st; },
    /** صفحتان متقابلتان أو صفحة واحدة */
    setSpread(on) {
      st.spread = !!on;
      if (st.spread && !st.frame2) {
        show();
        return update();
      }
      if (!st.spread && st.frame2) {
        st.frame2.remove();
        st.frame2 = null;
      }
      show();
    },
  };
  show();
  update();
  return api;
}
