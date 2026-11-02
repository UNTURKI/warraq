// «مجلس الدرس»: بجانب الكتاب على الرَّحل (النصف الأيمن) درسُه.
// الدرس في متصفحٍ مدمج في البرنامج نفسه (يوتيوب، تيليجرام، أي رابط) يملأ المجلس، بجلسةٍ تُحفظ: يُدخل فيه حساب يوتيوب مرةً ويبقى
// (وإن رفض Google الدخول فيه جُرِّبت هويةٌ أخرى وحدها، ثم «عبر متصفحك»: electron/lesson-signin.cjs)، أو صوتيةٌ أو مقطعٌ من الجهاز.
// والبرنامج يتحكم فيه: التشغيل والإيقاف والقفز ٥ ثوانٍ والسرعة والشريط، و«ملء» المجلس بالمقطع (وزرّ ملء الشاشة يملؤه وحده)،
// و«صوت فقط» بموجاتٍ من صوته الحقيقي، و«ملاحظة عند هذا الوقت» في الكتاب، و«التفريغ المباشر» (transcribe.js). ولونه لون الكتاب المفتوح، أو السِّراج حين لا كتاب.
import { allItems, delItem } from '/js/reader-store.js';
import { createTranscriber, TR_ICON } from '/desk/transcribe.js';

const desk = window.warraqDesktop || null;
const $ = (s, r = document) => r.querySelector(s);
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** ١:٠٤:٠٩ أو ٤:٠٩ */
export function clock(t) {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return ar(h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`);
}
const WEBVIEW = !!desk && /Electron\//.test(navigator.userAgent);
const WEB = !!(desk && desk.lessonWeb);
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/></svg>',
  // (في العربية البداية يمين): التأخير سهمٌ إلى اليمين، والتقديم إلى اليسار
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M17.5 3.5v4h-4"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12a7 7 0 1 0 2.05-4.95"/><path d="M6.5 3.5v4h4"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
  fill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" opacity=".25" stroke="none"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12h4"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="currentColor"/><path d="M10 9v6l5-3z" fill="var(--bg,#1a1210)"/></svg>',
  tg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M21 4 3 11l6 2.2L18 7l-7 7.6.2 5.4 3.3-3.6L18.5 20z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  disk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 6.5h6l2 2h9v10h-17z"/><path d="M10 16.5v-4l3.5 2z" fill="currentColor"/></svg>',
  goBack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  goFwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2-4.9M19 4v4h-4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.5 15.5 7 12 10.5 8.5 7zM7 8.5l3.5 3.5L7 15.5 3.5 12zM17 8.5l3.5 3.5-3.5 3.5-3.5-3.5zM12 13.5l3.5 3.5-3.5 3.5L8.5 17z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/></svg>',
  bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 11v9M4 13h3M17 13h3M5 8l2.5 2M19 8l-2.5 2M5 19l2.5-2M19 19l-2.5-2M9.5 7a2.5 2.5 0 0 1 5 0"/></svg>',
};

/* ------------------------------------------------------------------ عنوان الدرس */
export function toUrl(q) {
  q = String(q || '').trim();
  if (!q) return '';
  if (/^https?:\/\//i.test(q)) return tme(q);
  if (/^(www\.)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(q)) return tme('https://' + q);
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}
/** منشورٌ في قناة تيليجرام عامة: يُفتح بمقطعه دون دخول */
function tme(u) {
  const m = /^https?:\/\/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})\/(\d+)(?:[?#].*)?$/i.exec(u);
  return m ? `https://t.me/${m[1]}/${m[2]}?embed=1&mode=tme` : u;
}
/** هوية الدرس: مقطع يوتيوب بمعرّفه، وغيره بعنوانه (لـ«اسمعه» من ملاحظةٍ في الكتاب) */
export function lessonId(src) {
  if (!src) return '';
  if (src.kind === 'file') return 'file:' + (src.path || src.name);
  try {
    const u = new URL(src.url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.searchParams.get('v')) return 'yt:' + u.searchParams.get('v');
    if (u.hostname === 'youtu.be') return 'yt:' + u.pathname.slice(1);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && /^\/(shorts|live)\//.test(u.pathname)) return 'yt:' + u.pathname.split('/')[2];
    return 'web:' + u.origin + u.pathname + (u.hash && /telegram/.test(u.hostname) ? u.hash : u.search);
  } catch {
    return 'web:' + src.url;
  }
}
/** اسم الملف بلا امتداده */
const bare = (n) => String(n || '').replace(/\.[a-z0-9]{2,4}$/i, '');
const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};

/* ------------------------------------------------------------------ صفحة الدرس: ما يُحقن فيها */
let GUEST_SRC = null;
const guestSrc = async () => GUEST_SRC || (GUEST_SRC = await (await fetch('/desk/lesson-guest-page.js')).text());
const wrapGuest = (src, send) => `(() => { try { if (window.__wqL) { window.__wqL.report(); return 'again'; } const make = (${src}); window.__wqL = make(window, ${send}, document); return 'ok'; } catch (e) { return String(e); } })()`;

/**
 * الضيف: صفحة الدرس أو مقطعه، بواجهةٍ واحدة:
 *   el (ما يوضع في المسرح)، kind، load(url)، call(fn, ...args) (cmd/fill/meter)، back/fwd/reload/go، stop()
 * h.noInject(url): صفحاتٌ لا يُحقن فيها شيء (صفحات حساب Google)
 */
function webGuest(h) {
  let el;
  let attached = false; // (webview: لا يُنفَّذ فيه شيء قبل أن تجهز صفحته)
  const exec = (js) => {
    try {
      if (el.executeJavaScript) return attached ? el.executeJavaScript(js).catch(() => null) : Promise.resolve(null);
      return Promise.resolve(el.contentWindow.eval(js));
    } catch {
      return Promise.resolve(null);
    }
  };
  const call = (fn, ...args) => exec(`window.__wqL && window.__wqL.${fn}(${args.map((x) => JSON.stringify(x ?? null)).join(',')})`);
  const inject = async (url) => {
    if (h.noInject(url)) return;
    await exec(wrapGuest(await guestSrc(), '(c, d) => { try { window.__warraqLessonSend(c, d); } catch (e) {} }'));
    h.injected();
  };
  if (WEBVIEW) {
    el = document.createElement('webview');
    el.setAttribute('partition', 'persist:lesson');
    el.className = 'lsn-web';
    el.addEventListener('dom-ready', () => {
      attached = true;
      inject(el.getURL());
    });
    el.addEventListener('ipc-message', (e) => e.channel === 'lesson' && Array.isArray(e.args) && h.msg(e.args[0], e.args[1]));
    const nav = () => h.nav({ url: el.getURL(), title: el.getTitle(), back: el.canGoBack(), fwd: el.canGoForward() });
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated']) el.addEventListener(ev, nav);
    el.addEventListener('did-start-loading', () => h.nav({ loading: true }));
    el.addEventListener('did-stop-loading', () => (nav(), h.nav({ loading: false })));
    el.addEventListener('did-fail-load', (e) => e.errorCode !== -3 && e.isMainFrame && h.fail(e.errorDescription || 'تعذّر فتح الصفحة'));
    el.addEventListener('render-process-gone', (e) => h.gone((e && e.reason) || ''));
    return {
      el,
      kind: 'web',
      load: (u) => (attached ? el.loadURL(u).catch(() => {}) : el.setAttribute('src', u)),
      call,
      back: () => el.canGoBack() && el.goBack(),
      fwd: () => el.canGoForward() && el.goForward(),
      reload: () => (attached ? el.reload() : null),
      go: (u) => (attached ? el.loadURL(u).catch(() => {}) : el.setAttribute('src', u)),
      url: () => (attached ? el.getURL() : el.getAttribute('src') || ''),
      stop() {},
    };
  }
  // (في الاختبار وفي المتصفح: إطارٌ من الأصل نفسه)
  el = document.createElement('iframe');
  el.className = 'lsn-web';
  el.addEventListener('load', async () => {
    try {
      const w = el.contentWindow;
      w.__warraqLessonSend = (c, d) => h.msg(c, d);
      w.__wqAllowFrame = true;
      h.nav({ url: w.location.href, title: w.document.title, back: false, fwd: false, loading: false });
      if (!h.noInject(w.location.href)) {
        w.eval(wrapGuest(await guestSrc(), '(c, d) => window.__warraqLessonSend(c, d)'));
        h.injected();
      }
    } catch {
      h.nav({ url: el.src, title: '', loading: false });
    }
  });
  return { el, kind: 'web', load: (u) => (h.nav({ loading: true }), (el.src = u)), call, back: () => el.contentWindow.history.back(), fwd: () => el.contentWindow.history.forward(), reload: () => el.contentWindow.location.reload(), go: (u) => (el.src = u), url: () => el.src, stop() {} };
}
/** مقطعٌ من الجهاز في الهيكل نفسه */
async function fileGuest(media, h) {
  const box = document.createElement('div');
  box.className = 'lsn-file';
  const el = document.createElement(media.video ? 'video' : 'audio');
  el.preload = 'auto';
  el.src = media.url;
  box.appendChild(el);
  const make = new Function('return (' + (await guestSrc()) + ')')();
  const api = make(window, (c, d) => h.msg(c, d), box);
  el.addEventListener('click', () => (el.paused ? el.play() : el.pause()));
  return {
    el: box,
    kind: 'file',
    media: el,
    load() {},
    call(fn, a, b) {
      const r = api[fn](a, b);
      // قبل أن تُعرف مدته: التشغيل يُطلب منه مباشرة
      if (!r && fn === 'cmd' && a === 'play') el.play().catch(() => {});
      return Promise.resolve(r);
    },
    back() {},
    fwd() {},
    reload() {},
    go() {},
    url: () => '',
    stop() {
      api.stop();
      el.pause();
      el.removeAttribute('src');
      el.load();
    },
  };
}

/* ================================================================== المجلس */
export function initLesson(shell) {
  const doors = $('#doors');
  const box = document.createElement('aside');
  box.className = 'lsn';
  box.id = 'lesson';
  box.setAttribute('aria-label', 'مجلس الدرس');
  box.hidden = true;
  box.innerHTML = `
    <div class="lsn-split" title="اسحب لتغيير العرض" aria-hidden="true"></div>
    <header class="lsn-h">
      <span class="lsn-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <b>مجلس الدرس</b>
      <span class="lsn-title" id="lsnTitle"></span>
      <span class="lsn-sp"></span>
      <button type="button" class="lsn-acct" id="lsnAcct" data-a="acct" hidden></button>
      <button type="button" class="lsn-ib" data-a="home" title="مصدرٌ آخر للدرس">${I.home}</button>
      <span class="lsn-mw">
        <button type="button" class="lsn-ib" data-a="menu" title="المزيد" aria-haspopup="menu" aria-expanded="false">${I.more}</button>
        <span class="lsn-menu" id="lsnMenu" role="menu" hidden>
          <button type="button" role="menuitem" data-a="signin" data-acct="out">${I.key}<span>سجّل دخولك في يوتيوب</span></button>
          <button type="button" role="menuitem" data-a="viaBrowser" data-acct="out" data-need-browser>${I.globe}<span>سجّل دخولك عبر متصفحك</span></button>
          <button type="button" role="menuitem" data-a="signout" data-acct="in">${I.out}<span>اخرج من حساب يوتيوب</span></button>
          <button type="button" role="menuitem" data-a="diag">${I.bug}<span>انسخ سجلّ التشخيص <small>للإبلاغ عن مشكلة</small></span></button>
        </span>
      </span>
      <button type="button" class="lsn-ib" data-a="close" title="أغلق المجلس (Ctrl+Shift+D)">${I.x}</button>
    </header>
    <form class="lsn-bar" id="lsnBar" hidden autocomplete="off">
      <button type="button" class="lsn-ib" data-a="back" title="رجوع">${I.goBack}</button>
      <button type="button" class="lsn-ib" data-a="fwd" title="تقدّم">${I.goFwd}</button>
      <button type="button" class="lsn-ib" data-a="reload" title="تحديث">${I.reload}</button>
      <label class="lsn-addr"><span class="lsn-src" id="lsnSrc">${I.globe}</span><input id="lsnUrl" dir="auto" spellcheck="false" placeholder="رابط الدرس، أو ابحث في يوتيوب"></label>
      <button type="button" class="lsn-ib lsn-q" data-go="yt" title="يوتيوب">${I.yt}</button>
      <button type="button" class="lsn-ib lsn-q" data-go="tg" title="تيليجرام">${I.tg}</button>
      <i class="lsn-load" aria-hidden="true"></i>
    </form>
    <div class="lsn-banner" id="lsnBanner" role="status" hidden></div>
    <div class="lsn-stage" id="lsnStage">
      <div class="lsn-pick" id="lsnPick"></div>
      <div class="lsn-ear" id="lsnEar" hidden>
        <div class="lsn-disc" aria-hidden="true"><svg viewBox="0 0 100 100"><g class="lsn-khatam"><path d="M50 8 61 22 79 21 78 39 92 50 78 61 79 79 61 78 50 92 39 78 21 79 22 61 8 50 22 39 21 21 39 22z"/><circle cx="50" cy="50" r="15"/></g></svg></div>
        <div class="lsn-ear-t"><small>سماع</small><b id="lsnEarTitle"></b><span class="lsn-wave" id="lsnWave" aria-hidden="true">${'<i></i>'.repeat(24)}</span></div>
      </div>
      <div class="lsn-fail" id="lsnFail" hidden></div>
    </div>
    <div class="lsn-ctl" id="lsnCtl">
      <button type="button" class="lsn-cb" data-a="back5" title="تأخير ٥ ثوانٍ (Ctrl+Shift+→)">${I.back}<b>٥</b></button>
      <button type="button" class="lsn-play" data-a="toggle" title="تشغيل وإيقاف (Ctrl+Shift+مسافة)">${I.play}</button>
      <button type="button" class="lsn-cb" data-a="fwd5" title="تقديم ٥ ثوانٍ (Ctrl+Shift+←)">${I.fwd}<b>٥</b></button>
      <span class="lsn-time" id="lsnNow">٠:٠٠</span>
      <div class="lsn-track"><input type="range" id="lsnSeek" min="0" max="1000" step="1" value="0" aria-label="موضع الدرس"><output id="lsnTip"></output></div>
      <span class="lsn-time dim" id="lsnDur">—</span>
      <button type="button" class="lsn-rate" data-a="rate" title="سرعة التشغيل">١×</button>
      <button type="button" class="lsn-cb" data-a="note" title="ملاحظةٌ في الكتاب عند هذا الوقت من الدرس («اسمعه» فيها يعيدك إليه)">${I.note}</button>
      <button type="button" class="lsn-cb" data-a="fill" aria-pressed="false" title="املأ المجلس بالمقطع (وزرّ ملء الشاشة في الموقع يملؤه وحده)">${I.fill}</button>
      <button type="button" class="lsn-cb" data-a="ear" aria-pressed="false" title="صوت فقط: تختفي الصورة ويبقى الدرس">${I.ear}</button>
      <button type="button" class="lsn-cb lsn-trb" data-a="tr" aria-pressed="false" title="التفريغ: كلام الدرس يُكتب وهو يُقال">${TR_ICON}</button>
    </div>
    <div class="lsn-toast" id="lsnToast" role="status" hidden></div>`;
  doors.appendChild(box);
  const B = (s) => box.querySelector(s);

  /* ---------------------------------------------------------------- الحال */
  const S = {
    open: false,
    door: null,
    book: null, // { id, title }
    reading: false, // كتابٌ مفتوح في القارئ (فالمجلس بلون غرفته)
    src: null, // { kind:'web', url } | { kind:'file', path, name, url, video }
    guest: null,
    st: { has: false, t: 0, d: 0, paused: true, rate: 1, video: false, title: '' },
    nav: { url: '', title: '', back: false, fwd: false },
    ear: false,
    resume: null, // { t, play } (من «اسمعه» في ملاحظة)
    acct: { signedIn: false, browsers: [], accountsHosts: ['accounts.google.com', 'accounts.youtube.com'] },
    transfer: null,
  };
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem('warraq.lesson') || '{}') || {};
  } catch {}
  if (prefs.fill === undefined) prefs.fill = true;
  // (ما كان يُحفظ من سجل الدروس قبل هذا الإصدار لا يبقى)
  delete prefs.last;
  delete prefs.asr;
  delete prefs.asrOk;
  delete prefs.browser;
  const savePrefs = () => {
    try {
      localStorage.setItem('warraq.lesson', JSON.stringify({ w: prefs.w, fill: prefs.fill }));
    } catch {}
  };
  savePrefs();
  (async () => {
    try {
      for (const { key } of await allItems('notes')) if (/^lesson(s-of)?:/.test(String(key))) await delItem('notes', key);
    } catch {}
  })();

  /* ---------------------------------------------------------------- التخطيط واللون */
  function layout() {
    const show = S.open && S.door === 'rahl';
    box.hidden = !S.open;
    box.classList.toggle('away', S.open && !show); // يبقى الدرس يعمل حين يُترك الرَّحل
    doors.classList.toggle('with-lesson', show);
    const w = clamp(prefs.w || 0.5, 0.28, 0.72);
    doors.style.setProperty('--lw', (w * 100).toFixed(2) + '%');
    chip();
  }
  /** ألوان غرفة القارئ (من جلد الكتاب): حين يُفتح الكتاب. وبلا كتابٍ: ألوان البرنامج (والسِّراج) */
  function theme(p) {
    for (const k of ['cloth', 'clothD', 'clothL', 'room']) if (p && p[k]) box.style.setProperty('--' + k, p[k]);
    S.reading = !!p;
    box.classList.toggle('book', S.reading);
  }
  // التفريغ المباشر (تحت أزرار الدرس)
  const tr = createTranscriber({
    box,
    desk,
    state: () => S,
    lessonKey: () => lessonId(S.src),
    title: () => B('#lsnTitle').textContent || '',
    seek: (t) => (cmd('seek', t), cmd('play')),
    toast: (m) => toast(m),
    reader: async () => {
      const w = await shell.win('rahl');
      return (w && w.WarraqReader) || null;
    },
  });
  B('#lsnToast').before(tr.pane);
  const stage = B('#lsnStage');
  // سحب الحدّ بين الكتاب والمجلس
  B('.lsn-split').addEventListener('pointerdown', (e) => {
    const el = e.currentTarget;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('lsn-dragging');
    const mv = (ev) => {
      const r = doors.getBoundingClientRect();
      prefs.w = clamp((r.right - ev.clientX) / r.width, 0.28, 0.72);
      layout();
    };
    const up = () => {
      el.removeEventListener('pointermove', mv);
      document.body.classList.remove('lsn-dragging');
      savePrefs();
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  });

  /* ---------------------------------------------------------------- اختيار المصدر */
  function renderPick() {
    const a = S.acct;
    const can = WEB && a.browsers && a.browsers.length;
    B('#lsnPick').innerHTML = `
      <div class="lsn-pick-in">
        <p class="lsn-pick-h">ضع الدرس بجانب الكتاب</p>
        <p class="lsn-pick-s">شرحٌ تسمعه وأنت تقرأ: تُوقفه وتعيد ما فاتك، وتكتب ملاحظتك في الكتاب عند وقتها.</p>
        <div class="lsn-srcs">
          <button type="button" data-src="yt">${I.yt}<b>يوتيوب</b><small>ابحث أو الصق رابط الدرس</small></button>
          <button type="button" data-src="tg">${I.tg}<b>تيليجرام</b><small>قناة الدروس أو مقطعٌ فيها</small></button>
          <button type="button" data-src="url">${I.link}<b>رابط</b><small>أي صفحةٍ فيها صوت أو مقطع</small></button>
          <button type="button" data-src="file">${I.disk}<b>من جهازك</b><small>صوتية أو مقطع (mp3، mp4…)</small></button>
        </div>
        <p class="lsn-drop">أو اسحب ملف الصوت أو المقطع إلى هنا</p>
        ${
          WEB
            ? `<div class="lsn-acc ${a.signedIn ? 'in' : ''}">
                 <span class="lsn-acc-i">${a.signedIn ? I.ok : I.user}</span>
                 <div><b>${a.signedIn ? 'أنت مسجَّلٌ في يوتيوب' : 'حسابك في يوتيوب'}</b><small>${a.signedIn ? 'يبقى دخولك في البرنامج حتى تخرج منه' : 'سجّل دخولك مرةً واحدة داخل البرنامج ويبقى'}</small></div>
                 ${a.signedIn ? `<button type="button" class="lsn-q2" data-a="signout">خروج</button>` : `<button type="button" class="lsn-go" data-a="signin">سجّل دخولك</button>`}
               </div>
               ${!a.signedIn && can ? `<p class="lsn-note">وإن رفض Google الدخول هنا: <button type="button" class="lsn-q2" data-a="viaBrowser">سجّل الدخول عبر ${esc(a.browsers[0].name)}</button> ثم يُنقل دخولك إلى البرنامج.</p>` : ''}`
            : ''
        }
      </div>`;
  }
  B('#lsnPick').addEventListener('click', (e) => {
    const s = e.target.closest('[data-src]');
    if (!s) return;
    const k = s.dataset.src;
    if (k === 'yt') return loadWeb('https://www.youtube.com/');
    if (k === 'tg') return loadWeb('https://web.telegram.org/k/');
    if (k === 'url') {
      showBar(true);
      B('#lsnUrl').value = '';
      return B('#lsnUrl').focus();
    }
    if (k === 'file') return pickFile();
  });
  // سحب ملفٍ إلى المجلس
  box.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(), box.classList.add('over');
  });
  box.addEventListener('dragleave', (e) => !box.contains(e.relatedTarget) && box.classList.remove('over'));
  box.addEventListener('drop', async (e) => {
    box.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    const p = desk && desk.pathOf ? desk.pathOf(f) : '';
    if (p && desk.lesson) {
      try {
        return loadFile(await desk.lesson.media(p));
      } catch (err) {
        return toast(err.message || 'ليس ملف صوتٍ أو مقطعاً');
      }
    }
    if (/^(audio|video)\//.test(f.type)) loadFile({ url: URL.createObjectURL(f), name: f.name, path: '', video: /^video\//.test(f.type) });
  });
  async function pickFile() {
    if (!desk || !desk.lesson) return toast('اختيار ملفٍ من الجهاز في البرنامج وحده');
    try {
      const m = await desk.lesson.pick();
      if (m) loadFile(m);
    } catch (err) {
      toast(err.message || String(err));
    }
  }

  /* ---------------------------------------------------------------- الضيف */
  function unmount() {
    if (!S.guest) return;
    S.guest.stop();
    S.guest.el.remove();
    S.guest = null;
  }
  const isAccountsUrl = (u) => S.acct.accountsHosts.includes(hostOf(u));
  /** ما يصل من ضيفٍ غير الحالي يُترك */
  function handlers() {
    const me = { g: null };
    const cur = () => S.guest && S.guest === me.g;
    let goneAt = 0;
    me.h = {
      msg: (c, d) => cur() && onMsg(c, d),
      nav: (n) => cur() && onNav(n),
      injected: () => cur() && apply(),
      fail: (m) => cur() && fail(m),
      noInject: (u) => isAccountsUrl(u),
      gone: (reason) => {
        if (!cur()) return;
        if (desk && desk.lessonWeb) desk.lessonWeb.log('webview gone ' + reason);
        // توقّفت صفحة الدرس: تُعاد مرةً وحدها، فإن توقّفت ثانيةً قريباً أُخبر
        if (Date.now() - goneAt > 30000) {
          goneAt = Date.now();
          toast('توقّفت صفحة الدرس فأُعيد فتحها');
          const u = S.nav.url || (S.src && S.src.url);
          setTimeout(() => u && S.guest && S.guest.go(u), 300);
        } else fail('توقّفت صفحة الدرس. اضغط «تحديث» لإعادة فتحها، وإن تكرّر فانسخ «سجلّ التشخيص» من قائمة المجلس وأرسله لنا.');
      },
    };
    return me;
  }
  function mount(make) {
    unmount();
    const me = handlers();
    const g = make(me.h);
    me.g = g;
    S.guest = g;
    S.st = { has: false, t: 0, d: 0, paused: true, rate: 1, video: false, title: '' };
    stage.insertBefore(g.el, B('#lsnEar'));
    B('#lsnPick').hidden = true;
    B('#lsnFail').hidden = true;
    paintCtl();
    return g;
  }
  /** ما يريده المجلس من صفحة الدرس (يُعاد بعد كل تنقّل: الصفحة الجديدة لا تعرفه) */
  function apply() {
    if (!S.guest) return;
    S.guest.call('fill', !!prefs.fill);
    S.guest.call('meter', box.classList.contains('ear'));
    tr.apply();
  }
  function webOf() {
    if (!S.guest || S.guest.kind !== 'web') mount((h) => webGuest(h));
    return S.guest;
  }
  function onMsg(ch, d) {
    if (ch === 'state' && d && typeof d === 'object') return onState(d);
    if (ch === 'lvl' && Array.isArray(d)) return wave(d);
    if (ch === 'pcm') return tr.onPcm(d);
  }
  function onState(d) {
    const was = S.st;
    S.st = { has: !!d.has, t: +d.t || 0, d: +d.d || 0, paused: d.paused !== false, rate: +d.rate || 1, video: !!d.video, muted: !!d.muted, title: String(d.title || ''), fill: !!d.fill, tap: d.tap && typeof d.tap === 'object' ? d.tap : null };
    // «اسمعه»: إلى وقت الملاحظة (قد لا يقبل المقطع القفز أول ما تُعرف مدته: يُعاد حتى يبلغه)
    if (S.resume && S.st.has && S.st.d > 0) {
      const R = S.resume;
      const t = Math.max(0, R.t - 1);
      if (Math.abs(S.st.t - t) < 1.5 || (R.n = (R.n || 0) + 1) > 8) {
        S.resume = null;
        if (R.play) cmd('play');
      } else {
        cmd('seek', t);
        if (R.play) cmd('play');
      }
    }
    if (S.st.has && !was.has) apply();
    paintCtl();
    title();
    if (S.src && S.src.kind === 'file' && S.guest && S.guest.media) setEar(S.ear || !S.src.video, true);
    tr.sync();
  }
  function onNav(n) {
    if (n.loading !== undefined) box.classList.toggle('loading', n.loading);
    if (n.title !== undefined && n.url === undefined) {
      S.nav.title = n.title;
      return title();
    }
    if (n.url !== undefined) {
      const moved = n.url !== S.nav.url;
      S.nav = { ...S.nav, ...n };
      if (S.src && S.src.kind === 'web') S.src.url = n.url;
      if (document.activeElement !== B('#lsnUrl')) B('#lsnUrl').value = n.url || '';
      B('#lsnSrc').innerHTML = /youtube|youtu\.be/.test(n.url) ? I.yt : /telegram|t\.me/.test(n.url) ? I.tg : isAccountsUrl(n.url) ? I.key : I.globe;
      if (n.back !== undefined) B('[data-a="back"]').disabled = !n.back;
      if (n.fwd !== undefined) B('[data-a="fwd"]').disabled = !n.fwd;
      B('#lsnFail').hidden = true;
      if (moved) setTimeout(apply, 300);
      title();
      tr.sync();
    }
  }
  function fail(msg) {
    B('#lsnFail').textContent = msg;
    B('#lsnFail').hidden = false;
  }
  function loadWeb(url, opts = {}) {
    if (!url) return;
    S.src = { kind: 'web', url };
    const g = webOf();
    showBar(true);
    B('#lsnUrl').value = url;
    if (!opts.keepEar) setEar(false);
    title();
    g.load(url);
  }
  async function loadFile(m) {
    if (!m || !m.url) return;
    S.src = { kind: 'file', ...m };
    const me = handlers();
    const g = await fileGuest(m, me.h);
    unmount();
    S.guest = g;
    me.g = g;
    S.st = { has: false, t: 0, d: 0, paused: true, rate: 1, video: false, title: '' };
    stage.insertBefore(g.el, B('#lsnEar'));
    B('#lsnPick').hidden = true;
    B('#lsnFail').hidden = true;
    showBar(false);
    setEar(!m.video, true);
    title();
    cmd('play');
  }
  function showBar(on) {
    B('#lsnBar').hidden = !on;
  }
  const cmd = (name, arg) => S.guest && S.guest.call('cmd', name, arg ?? null);
  function home() {
    if (S.guest) cmd('pause');
    unmount();
    S.src = null;
    S.resume = null;
    showBar(false);
    setEar(false);
    B('#lsnPick').hidden = false;
    B('#lsnFail').hidden = true;
    renderPick();
    paintCtl();
    title();
    tr.sync();
  }

  /* ---------------------------------------------------------------- الأزرار */
  let seeking = false;
  function paintCtl() {
    const st = S.st;
    const on = !!(S.guest && st.has);
    box.classList.toggle('has-media', on);
    box.classList.toggle('playing', on && !st.paused);
    B('[data-a="toggle"]').innerHTML = on && !st.paused ? I.pause : I.play;
    B('[data-a="toggle"]').setAttribute('aria-label', on && !st.paused ? 'أوقف' : 'شغّل');
    if (!seeking) {
      B('#lsnNow').textContent = clock(st.t);
      B('#lsnSeek').value = st.d ? Math.round((st.t / st.d) * 1000) : 0;
      B('#lsnSeek').style.setProperty('--v', st.d ? (st.t / st.d).toFixed(4) : 0);
    }
    B('#lsnDur').textContent = st.d ? clock(st.d) : '—';
    B('#lsnSeek').disabled = !on || !st.d;
    B('[data-a="rate"]').textContent = ar(String(st.rate).replace('.', '٫')) + '×';
    for (const b of box.querySelectorAll('.lsn-ctl button')) b.disabled = !on;
    B('[data-a="tr"]').disabled = false;
    B('[data-a="fill"]').setAttribute('aria-pressed', String(!!prefs.fill));
    B('[data-a="fill"]').disabled = !on || !st.video || box.classList.contains('ear');
    B('[data-a="ear"]').disabled = !S.guest;
    chip();
  }
  // الشريط: يُسحب (والوقت يظهر فوقه)، ويُقفز إليه حين يُترك (وأثناء السحب كل خُمس ثانية)
  {
    const r = B('#lsnSeek');
    let last = 0;
    const at = () => (+r.value / 1000) * (S.st.d || 0);
    r.addEventListener('input', () => {
      seeking = true;
      box.classList.add('seeking');
      B('#lsnNow').textContent = clock(at());
      B('#lsnTip').textContent = clock(at());
      B('#lsnTip').style.setProperty('--p', +r.value / 1000);
      r.style.setProperty('--v', +r.value / 1000);
      if (Date.now() - last > 200) (last = Date.now()), cmd('seek', at());
    });
    r.addEventListener('change', () => {
      cmd('seek', at());
      setTimeout(() => ((seeking = false), box.classList.remove('seeking')), 500);
    });
  }
  function setEar(on, auto = false) {
    if (!auto) S.ear = on;
    box.classList.toggle('ear', on);
    B('#lsnEar').hidden = !on;
    B('[data-a="ear"]').setAttribute('aria-pressed', String(on));
    B('[data-a="ear"]').innerHTML = on && S.src && (S.src.kind === 'web' || S.src.video) ? I.film : I.ear;
    B('[data-a="ear"]').title = on ? 'أظهر الصورة' : 'صوت فقط: تختفي الصورة ويبقى الدرس';
    if (S.guest) S.guest.call('meter', on);
    if (!on) wave(null);
    title();
  }
  /** موجاتٌ من صوت الدرس الحقيقي (٢٤ حزمة) */
  const waveEls = [...B('#lsnWave').children];
  function wave(b) {
    if (!b) return waveEls.forEach((i) => (i.style.height = ''));
    // الأصوات المنخفضة في الوسط والعالية على الطرفين (كما يُرسم الصوت)
    const order = [];
    for (let k = 0; k < 12; k++) order.push(23 - 2 * k > 0 ? b[23 - 2 * k] : b[0]);
    for (let k = 0; k < 12; k++) order.push(b[2 * k]);
    waveEls.forEach((i, k) => (i.style.height = (3 + ((+order[k] || 0) / 255) * 31).toFixed(1) + 'px'));
  }
  function title() {
    const t = S.src ? (S.src.kind === 'file' ? bare(S.src.name) : String(S.st.title || S.nav.title || '').replace(/\s*[-–]\s*YouTube$/, '')) : '';
    B('#lsnTitle').textContent = t;
    B('#lsnEarTitle').textContent = t || 'الدرس';
  }
  function menu(on) {
    const m = B('#lsnMenu');
    on = on ?? m.hidden;
    m.hidden = !on;
    B('[data-a="menu"]').setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('pointerdown', (e) => !e.target.closest('.lsn-mw') && menu(false), true);
  box.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) return loadWeb(g.dataset.go === 'yt' ? 'https://www.youtube.com/' : 'https://web.telegram.org/k/');
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a !== 'menu') menu(false);
    if (a === 'menu') return menu();
    if (a === 'close') return close();
    if (a === 'home') return home();
    if (a === 'back') return S.guest && S.guest.back();
    if (a === 'fwd') return S.guest && S.guest.fwd();
    if (a === 'reload') {
      B('#lsnFail').hidden = true;
      return S.guest && S.guest.reload();
    }
    if (a === 'toggle') return cmd('toggle');
    if (a === 'back5') return cmd('seekBy', -5);
    if (a === 'fwd5') return cmd('seekBy', 5);
    if (a === 'rate') return cmd('rate', RATES[(RATES.indexOf(S.st.rate) + 1) % RATES.length] || 1);
    if (a === 'fill') {
      prefs.fill = !prefs.fill;
      savePrefs();
      if (S.guest) S.guest.call('fill', prefs.fill);
      return paintCtl();
    }
    if (a === 'ear') return setEar(!box.classList.contains('ear'));
    if (a === 'note') return toBook();
    if (a === 'tr') return tr.toggle();
    if (a === 'acct') return S.acct.signedIn ? menu(true) : signIn();
    if (a === 'signin') return signIn();
    if (a === 'signout') return signOut();
    if (a === 'viaBrowser') return viaBrowser();
    if (a === 'cancelBrowser') return desk && desk.lessonWeb && desk.lessonWeb.cancelBrowser();
    if (a === 'bannerX') return banner(null);
    if (a === 'diag') return diag();
  });
  B('#lsnBar').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = toUrl(B('#lsnUrl').value);
    if (u) S.guest && S.guest.kind === 'web' ? ((S.src = { kind: 'web', url: u }), S.guest.go(u)) : loadWeb(u);
    B('#lsnUrl').blur();
  });
  /** اختصارات المجلس (من أي باب، والرَّحل يمرّرها من كتابه) ← true إن عُملت */
  function key(e) {
    if (!S.open || !S.guest) return false;
    if (!(e.ctrlKey && e.shiftKey) || e.altKey) return false;
    if (e.code === 'Space') cmd('toggle');
    else if (e.key === 'ArrowRight') cmd('seekBy', -5);
    else if (e.key === 'ArrowLeft') cmd('seekBy', 5);
    else return false;
    e.preventDefault();
    return true;
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.code === 'KeyD' || e.key === 'D' || e.key === 'd')) return e.preventDefault(), toggle();
    if (e.key === 'Escape' && !B('#lsnMenu').hidden) return menu(false);
    key(e);
  });

  /* ---------------------------------------------------------------- إلى الكتاب: ملاحظةٌ عند هذا الوقت */
  async function toBook() {
    const w = await shell.win('rahl');
    const R = w && w.WarraqReader;
    if (!R) return toast('افتح الكتاب على الرَّحل أولاً، ثم اكتب ملاحظتك فيه');
    R.addNote('', { kind: 'lesson', t: S.st.t, title: B('#lsnTitle').textContent || '', url: S.src && S.src.kind === 'web' ? S.src.url : '' });
  }

  /* ---------------------------------------------------------------- حساب يوتيوب */
  function banner(html, cls = '') {
    const el = B('#lsnBanner');
    el.hidden = !html;
    el.className = 'lsn-banner ' + cls;
    if (html) el.innerHTML = html;
  }
  function paintAcct() {
    const a = S.acct;
    const el = B('#lsnAcct');
    el.hidden = !WEB;
    el.classList.toggle('in', !!a.signedIn);
    el.innerHTML = a.signedIn ? `${I.ok}<span>يوتيوب</span>` : `${I.user}<span>دخول</span>`;
    el.title = a.signedIn ? 'أنت مسجَّلٌ في يوتيوب داخل البرنامج' : 'سجّل دخولك في يوتيوب داخل البرنامج (مرةً واحدة ويبقى)';
    for (const b of box.querySelectorAll('[data-acct]')) b.hidden = !WEB || (b.dataset.acct === 'in') !== !!a.signedIn || (b.hasAttribute('data-need-browser') && !(a.browsers && a.browsers.length));
    if (!B('#lsnPick').hidden) renderPick();
  }
  async function refreshAcct() {
    if (!WEB) return;
    try {
      S.acct = { ...S.acct, ...(await desk.lessonWeb.account()) };
    } catch {}
    paintAcct();
  }
  async function signIn() {
    if (!WEB) return toast('الدخول في البرنامج وحده');
    try {
      const { url } = await desk.lessonWeb.signIn();
      loadWeb(url);
    } catch (e) {
      toast(e.message || String(e));
    }
  }
  async function signOut() {
    if (!WEB) return;
    if (!confirm('تخرج من حساب يوتيوب في البرنامج؟')) return;
    await desk.lessonWeb.signOut().catch(() => {});
    await refreshAcct();
    toast('خرجتَ من حسابك');
    if (S.guest && S.guest.kind === 'web' && /youtube/.test(S.nav.url)) S.guest.reload();
  }
  async function viaBrowser() {
    if (!WEB) return;
    const b = S.acct.browsers && S.acct.browsers[0];
    if (!b) return banner(`<p>لم يُعثر على كروم ولا إيدج في جهازك. ثبّت أحدهما ثم أعد المحاولة، أو سجّل دخولك هنا في الصفحة.</p><button type="button" class="lsn-q2" data-a="bannerX">حسناً</button>`, 'warn');
    banner(`<i class="lsn-ring" aria-hidden="true"></i><p>تُفتح نافذة الدخول في <b>${esc(b.name)}</b>…</p>`, 'busy');
    try {
      await desk.lessonWeb.viaBrowser(b.id);
    } catch (e) {
      banner(`<p>تعذّر فتح ${esc(b.name)}: ${esc(e.message || e)}</p><button type="button" class="lsn-q2" data-a="diag">انسخ سجلّ التشخيص</button><button type="button" class="lsn-q2" data-a="bannerX">إغلاق</button>`, 'warn');
    }
  }
  async function diag() {
    try {
      const t = WEB ? await desk.lessonWeb.log('') : '';
      await navigator.clipboard.writeText(`مجلس الدرس — سجلّ التشخيص\n${navigator.userAgent}\n\n${t || '(فارغ)'}`);
      toast('نُسخ سجلّ التشخيص: ألصقه في رسالتك إلينا');
    } catch {
      toast('تعذّر النسخ');
    }
  }
  function onWebEvent(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'account') {
      S.acct = { ...S.acct, ...m };
      return paintAcct();
    }
    if (m.type === 'gone') return;
    if (m.type === 'signin') {
      if (m.status === 'start') return banner(`<p>سجّل دخولك في الصفحة. وإن رفض Google المتصفحَ جُرِّبت طريقةٌ أخرى وحدها.</p><button type="button" class="lsn-q2" data-a="bannerX">${I.x}</button>`, 'info');
      if (m.status === 'retry') return banner(`<i class="lsn-ring" aria-hidden="true"></i><p>رفض Google الدخول بتلك الطريقة؛ أُجرِّب «${esc(m.name)}» (${ar(m.step)} من ${ar(m.of)})… سجّل دخولك في الصفحة حين تظهر.</p>`, 'busy');
      if (m.status === 'ok') {
        banner(null);
        refreshAcct();
        return toast('تمّ: أنت مسجَّلٌ في يوتيوب داخل البرنامج');
      }
      if (m.status === 'failed') {
        const b = (m.browsers && m.browsers[0]) || (S.acct.browsers && S.acct.browsers[0]);
        return banner(
          b
            ? `<p><b>رفض Google الدخول داخل البرنامج.</b> الحل: سجّل دخولك في نافذة ${esc(b.name)} تُفتح نظيفةً لهذا وحده، وحين تنتهي تُغلق وحدها ويُنقل دخولك إلى هنا.</p><button type="button" class="lsn-go" data-a="viaBrowser">افتح نافذة الدخول</button><button type="button" class="lsn-q2" data-a="bannerX">لاحقاً</button>`
            : `<p><b>رفض Google الدخول داخل البرنامج،</b> ولم يُعثر على كروم ولا إيدج ليُسجَّل الدخول فيه ثم يُنقل. ثبّت أحدهما وأعد المحاولة.</p><button type="button" class="lsn-q2" data-a="bannerX">حسناً</button>`,
          'warn',
        );
      }
    }
    if (m.type === 'transfer') {
      S.transfer = m.status === 'open' ? m : null;
      if (m.status === 'open') return banner(`<i class="lsn-ring" aria-hidden="true"></i><p>سجّل دخولك في نافذة <b>${esc(m.browser)}</b> التي فُتحت. حين ينتهي الدخول تُغلق وحدها ويُنقل إلى هنا.</p><button type="button" class="lsn-q2" data-a="cancelBrowser">إلغاء</button>`, 'busy');
      if (m.status === 'done') {
        banner(null);
        refreshAcct();
        toast('تمّ: نُقل دخولك إلى البرنامج');
        return desk.lessonWeb.home().then((u) => loadWeb(u || 'https://www.youtube.com/'));
      }
      const msg = { cancel: 'أُلغي الدخول عبر المتصفح.', closed: 'أُغلقت نافذة الدخول قبل أن يتمّ الدخول.', timeout: 'انتهى وقت الدخول قبل أن يتمّ.', error: 'تعذّر الدخول عبر المتصفح: ' + (m.message || '') }[m.status] || '';
      if (msg) banner(`<p>${esc(msg)}</p><button type="button" class="lsn-q2" data-a="viaBrowser">أعد المحاولة</button><button type="button" class="lsn-q2" data-a="bannerX">إغلاق</button>`, m.status === 'cancel' ? 'info' : 'warn');
    }
  }
  if (WEB) desk.lessonWeb.onEvent(onWebEvent);

  /* ---------------------------------------------------------------- الفتح والإغلاق */
  function open() {
    if (S.open) return;
    S.open = true;
    layout();
    if (!S.guest) renderPick();
    refreshAcct();
  }
  function close() {
    if (!S.open) return;
    if (S.guest) cmd('pause');
    unmount();
    S.src = null;
    S.resume = null;
    S.open = false;
    B('#lsnPick').hidden = false;
    banner(null);
    setEar(false);
    showBar(false);
    layout();
    paintCtl();
    title();
    tr.sync();
  }
  const toggle = () => (S.open ? close() : open());

  /* ---------------------------------------------------------------- خارج الرَّحل: شارةٌ في شريط الحالة */
  const chipEl = document.createElement('span');
  chipEl.id = 'stLesson';
  chipEl.className = 'st-lesson';
  chipEl.hidden = true;
  chipEl.innerHTML = `<button type="button" data-c="toggle" aria-label="تشغيل وإيقاف"></button><button type="button" data-c="go" title="إلى الرَّحل"><b>الدرس</b> <span></span></button>`;
  const stEnd = $('.status .end');
  if (stEnd) stEnd.before(chipEl);
  chipEl.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (!c) return;
    if (c.dataset.c === 'toggle') cmd('toggle');
    else shell.go('rahl');
  });
  function chip() {
    const on = S.open && S.door !== 'rahl' && S.guest && S.st.has;
    chipEl.hidden = !on;
    if (!on) return;
    chipEl.querySelector('[data-c="toggle"]').innerHTML = S.st.paused ? I.play : I.pause;
    chipEl.querySelector('span').textContent = clock(S.st.t);
  }

  /* ---------------------------------------------------------------- مع الهيكل */
  let toastT = 0;
  function toast(msg) {
    const t = B('#lsnToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 3200);
  }
  // صفحةٌ جديدة لم تأخذ ما يريده المجلس (التنقّل في يوتيوب): يُعاد
  setInterval(() => {
    if (S.guest && S.st.has && !!prefs.fill && S.st.video && !S.st.fill && !box.classList.contains('ear')) apply();
  }, 2500);
  layout();
  paintCtl();
  paintAcct();
  renderPick();
  return {
    open,
    close,
    toggle,
    key,
    theme,
    get isOpen() {
      return S.open;
    },
    /** الدرس الذي بجانب الكتاب (لمساعد الرَّحل): رابطه وعنوانه وموضعه، وتفريغه حين يُضاف */
    get clip() {
      if (!S.src) return null;
      const web = S.src.kind === 'web';
      const url = web ? S.nav.url || S.src.url || '' : '';
      const t = S.src.kind === 'file' ? bare(S.src.name) : String(S.st.title || S.nav.title || '').replace(/\s*[-–]\s*YouTube$/, '');
      return { kind: S.src.kind, url, title: t, name: S.src.kind === 'file' ? S.src.name : '', t: +S.st.t || 0, d: +S.st.d || 0, transcript: tr.text() };
    },
    /** الباب الظاهر تغيّر */
    door(d) {
      S.door = d;
      layout();
    },
    /** الكتاب المفتوح على الرَّحل ({ id, title } أو null) */
    book(b) {
      S.book = b && b.id ? { id: String(b.id), title: String(b.title || '') } : null;
      if (!S.book) theme(null);
    },
    /** «اسمعه» من ملاحظةٍ في الكتاب: الدرس عند وقت الملاحظة */
    async hear(src) {
      if (!src) return;
      if (!S.open) {
        S.open = true;
        layout();
      }
      const same = S.src && S.src.kind === 'web' && src.url && lessonId({ kind: 'web', url: src.url }) === lessonId(S.src);
      if (same || (!src.url && S.guest)) {
        cmd('seek', Math.max(0, (+src.t || 0) - 1));
        return cmd('play');
      }
      if (src.url) {
        loadWeb(src.url);
        S.resume = { t: +src.t || 0, play: true };
      } else toast('هذه الملاحظة من درسٍ في جهازك: افتحه في المجلس');
    },
    /** للاختبار */
    get state() {
      return { open: S.open, resume: S.resume, src: S.src, st: S.st, ear: box.classList.contains('ear'), kind: S.guest && S.guest.kind, acct: S.acct, book: S.book, reading: S.reading, nav: S.nav, tr: tr.state };
    },
    load: async (u) => (S.open || open(), loadWeb(toUrl(u))),
    loadFile,
    transcribe: (on) => tr.setOpen(on),
    /** تقرير التفريغ (ما جرى) */
    trReport: () => tr.report(),
    /** للاختبار: أمرٌ إلى صفحة الدرس */
    guestCall: (fn, ...a) => S.guest && S.guest.call(fn, ...a),
  };
}
