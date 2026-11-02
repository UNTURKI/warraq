// وضع البرنامج: ما يتغيّر في الصفحات حين يعمل ورّاق برنامجاً على سطح المكتب.
// يُحمَّل في كل صفحة من الخادم (lib/desktop.js) في البرنامج وحده، فلا أثر له في الموقع.
// والجسر window.warraqDesktop يضعه البرنامج (electron/preload.cjs).
(function () {
  // صفحة في باب من أبواب الهيكل (/desk/): تأخذ جسر البرنامج من الهيكل، وتُخفي ترويستها (الهيكل يعرض الأبواب)
  let shell = null;
  try {
    if (window.parent !== window && window.parent === window.top && window.top.location.pathname === '/desk/') shell = window.top.WarraqShell || null;
  } catch {}
  if (shell) {
    document.documentElement.setAttribute('data-shell', '');
    if (!window.warraqDesktop && window.top.warraqDesktop) window.warraqDesktop = window.top.warraqDesktop;
  }
  const desk = window.warraqDesktop;
  // القلم (Ctrl+K) من أي باب: يُفتح في الهيكل (والقائمة تحمله في البرنامج)
  if (shell)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' && shell.palette) {
        e.preventDefault();
        shell.palette.open();
      }
    });
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const path = location.pathname;
  // أيقونتا الإعدادات والسِّراج كما في «ورّاق البرنامج»
  const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"/></svg>';
  const LAMP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 3c1.6 2 2.2 3.4 0 5.6C9.8 6.4 10.4 5 12 3z"/><path d="M4 13c0-1.2 3.6-2 8-2s8 .8 8 2c0 2.8-3.6 5-8 5s-8-2.2-8-5zM20 13l2-2M9 21h6M12 18v3"/></svg>';

  // السِّراج في الصفحات التي ليست على أساس wq.css («الأساليب»، «المجلِّد»، الأغلفة على المنضدة…): يتبع زرّه وويندوز كبقية البرنامج
  if (!document.documentElement.classList.contains('wq')) {
    const KEY = 'warraq.night';
    const sys = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const paintNight = () => {
      let st = null;
      try {
        st = localStorage.getItem(KEY);
      } catch {}
      document.documentElement.classList.toggle('night', st === null ? !!(sys && sys.matches) : st === '1');
    };
    paintNight();
    if (sys) sys.addEventListener('change', paintNight);
    window.addEventListener('storage', (e) => e.key === KEY && paintNight());
  }

  function ready() {
    // «الأساليب» بابٌ في البرنامج: الشرح الطويل (بطاقة الأسلوب، والذكاء الاصطناعي) يُطوى تحت سؤال
    if (shell && path === '/studio/') {
      const how = $('.list-main .how');
      if (how && how.tagName !== 'DETAILS') {
        const d = document.createElement('details');
        d.className = how.className + ' dk-how';
        d.innerHTML = '<summary>ما بطاقة الأسلوب؟ وكيف تصنع أسلوباً بالذكاء الاصطناعي؟</summary>';
        while (how.firstChild) d.appendChild(how.firstChild);
        how.replaceWith(d);
      }
    }
    // زر السِّراج في الترويسات (نوافذ البرنامج المستقلة): أيقونة الملف
    for (const b of $$('[data-lamp]')) {
      const svg = b.querySelector('svg');
      if (svg) svg.outerHTML = LAMP;
    }
    // الشعار واسم البرنامج: يعودان إلى واجهة الإخراج (لا صفحة رئيسية في البرنامج)
    for (const a of $$('a[href="/"]')) {
      a.setAttribute('href', '/app/');
      if (a.title === 'الصفحة الرئيسية') a.title = 'واجهة الإخراج';
      if (a.getAttribute('aria-label') === 'ورّاق: الصفحة الرئيسية') a.setAttribute('aria-label', 'ورّاق: واجهة الإخراج');
      if (a.textContent.trim() === 'الرئيسية') a.textContent = 'صفحة الإخراج';
    }

    // الترويسة: زر «الإعدادات» (يُفتح في نافذته، فلا يضيع الكتاب المفتوح)
    const nav = $('header.top .nav');
    if (nav && desk && path !== '/identity/' && !$('.dk-set', nav)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lnk dk-set';
      b.title = 'إعدادات البرنامج (Ctrl+,)';
      b.innerHTML = GEAR + '<span>الإعدادات</span>';
      b.addEventListener('click', () => desk.openWindow('settings'));
      const last = nav.querySelector('#resetBtn, .btn.kb');
      nav.insertBefore(b, last && last.parentElement === nav ? last : null);
    }

    // من واجهة الإخراج: الرَّحل وصنع البطاقة يُفتحان في نافذة مستقلة، فيبقى الكتاب الجاري كما هو
    if (path === '/app/' && nav && desk) {
      for (const a of $$('a.lnk', nav)) {
        const m = /^\/(rahl|card)\/$/.exec(a.getAttribute('href') || '');
        if (m)
          a.addEventListener('click', (e) => {
            e.preventDefault();
            desk.openWindow(m[1]);
          });
      }
    }

    // صفحة الهوية: تُفتح من «عن ورّاق» في نافذتها للقراءة، فلا تنقّل فيها غير السِّراج
    if (path === '/identity/' && nav) for (const a of $$('a', nav)) a.hidden = true;

    // لوحة الإعدادات: اسمها في البرنامج
    if (path.startsWith('/admin/')) {
      const sm = $('.topbar .brand small');
      if (sm) sm.textContent = 'إعدادات البرنامج';
    }
  }

  // داخل الهيكل: رابطٌ إلى صفحة باب آخر يفتح ذلك الباب (ولا تُستبدل الصفحة في إطارها)
  if (shell)
    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || (a.target && a.target !== '_self')) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      const door = shell.doorOfPath(u.pathname);
      if (!door || u.pathname === location.pathname) return;
      e.preventDefault();
      shell.go(door);
    });

  // أوامر قائمة البرنامج: للنوافذ المستقلة (الإعدادات…)؛ والهيكل يتولى أوامر نافذته بنفسه
  if (desk && window.top === window && path !== '/desk/')
    desk.onMenu((cmd) => {
      if (cmd === 'new-book') {
        const r = $('#resetBtn');
        if (r) r.click();
        else location.assign('/app/');
      } else if (cmd === 'feedback') openFeedback();
      else if (cmd === 'settings-changed') refreshLook();
    });

  /** بعد إغلاق الإعدادات: ألوان المظهر والخطوط المضافة تُعاد قراءتها في الصفحة المفتوحة دون إعادة تحميلها */
  function refreshLook() {
    for (const l of $$('link[rel="stylesheet"]')) {
      const href = l.getAttribute('href') || '';
      if (/^\/api\/(theme|fonts)\.css/.test(href)) l.setAttribute('href', href.replace(/\?.*$/, '') + '?t=' + Date.now());
    }
  }

  /** نافذة الملاحظات: من feedback.js (يُحمَّل عند الحاجة في الصفحات التي لا تضمّه) */
  function openFeedback() {
    const fb = window.WarraqFeedback;
    if (fb && fb.open) return fb.open();
    const sc = document.createElement('script');
    sc.src = '/js/feedback.js';
    sc.onload = () => window.WarraqFeedback && window.WarraqFeedback.open && window.WarraqFeedback.open();
    document.head.appendChild(sc);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
