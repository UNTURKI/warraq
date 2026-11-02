// مشترك بين صفحات المستخدم: وضع السِّراج، والميزان (الألف ونقطها الخمس تتبع موضعك)، والنَّقْط (أثر الضغطة).
// يُحمَّل في رأس الصفحة (بلا defer) ليُطبَّق السِّراج قبل الرسم؛ وما يحتاج الصفحة ينتظر تمامها.
(function () {
  const root = document.documentElement;
  const KEY = 'warraq.night';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
  let night = false;
  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {}
  night = stored === '1';
  // برنامج سطح المكتب: ما لم يختر المستخدم بنفسه، يتبع السِّراجُ الوضعَ الليلي في Windows
  const sys = root.hasAttribute('data-desktop') && stored === null && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (sys) {
    night = sys.matches;
    sys.addEventListener('change', (e) => {
      try {
        if (localStorage.getItem(KEY) !== null) return;
      } catch {}
      night = e.matches;
      root.classList.toggle('night', night);
      paintLamp();
    });
  }
  root.classList.toggle('night', night);
  // السِّراج أُوقد أو أُطفئ في صفحة أخرى مفتوحة (باب آخر في البرنامج، أو نافذة أخرى): يتبعها
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    night = e.newValue === '1';
    root.classList.toggle('night', night);
    paintLamp();
  });

  function paintLamp() {
    for (const b of document.querySelectorAll('[data-lamp]')) {
      b.setAttribute('aria-pressed', String(night));
      b.title = night ? 'أطفئ السِّراج (الوضع النهاري)' : 'أوقد السِّراج (وضع القراءة ليلاً)';
    }
  }
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-lamp]')) return;
    night = !night;
    root.classList.toggle('night', night);
    try {
      localStorage.setItem(KEY, night ? '1' : '0');
    } catch {}
    paintLamp();
  });

  /* النَّقْط */
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Element) || reduce()) return;
    if (!e.target.closest('.btn, .seg button, .tpl, .sty, .chip, .spine, .sw, .tbtn, .mz-dot, .res button, .cvb')) return;
    const i = document.createElement('i');
    i.className = 'stp';
    i.style.left = e.clientX + 'px';
    i.style.top = e.clientY + 'px';
    document.body.appendChild(i);
    setTimeout(() => i.remove(), 950);
  });

  /* الميزان */
  function rail() {
    const secs = [...document.querySelectorAll('[data-sec]')];
    const dots = document.querySelector('[data-rail]');
    const mob = document.querySelector('[data-rail-mob]');
    const now = document.querySelector('[data-rail-now]');
    if (!secs.length || !dots) return;
    dots.innerHTML = secs.map((s) => `<li><a href="#${s.id}" aria-label="${s.dataset.label}"><i></i><span>${s.dataset.label}</span></a></li>`).join('');
    if (mob) mob.innerHTML = secs.map(() => '<li></li>').join('');
    let cur = 0;
    const paint = () => {
      const open = secs.map((s) => !s.closest('[hidden]'));
      // أبعد محطة مفتوحة: ما قبلها تمّ، وما بعدها لم يُفتح بعد
      [...dots.children].forEach((li, i) => {
        const a = li.firstElementChild;
        a.className = (i < cur ? 'done' : i === cur ? 'on' : '') + (open[i] ? '' : ' na');
      });
      if (mob) [...mob.children].forEach((li, i) => (li.className = i < cur ? 'done' : i === cur ? 'on' : ''));
      secs.forEach((s, i) => {
        const n = s.querySelector('.st-n');
        if (n) n.className = 'st-n' + (i < cur ? ' done' : i === cur ? ' on' : '');
      });
      if (now) now.innerHTML = `${secs[cur].dataset.label}<small>${ar(cur + 1)} من ${ar(secs.length)}</small>`;
    };
    paint();
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => (e.target._vis = e.isIntersecting));
        const vis = secs.findIndex((s) => s._vis);
        if (vis >= 0) cur = vis;
        paint();
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    secs.forEach((s) => io.observe(s));
    // محطة فُتحت أو أُغلقت (ظهر كتاب، أعيد الضبط)
    new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  }
  const ready = () => {
    paintLamp();
    rail();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  window.WQ = { ar };
})();
