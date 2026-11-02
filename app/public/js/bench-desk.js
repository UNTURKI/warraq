// المِنضدة في البرنامج (كما في «ورّاق البرنامج»): الشاشة تنقسم كبرامج الإخراج.
//   · عمودٌ بالخطوات الخمس (الكتاب، المجلدات، التنضيد، الغلاف، الإخراج): خطوةٌ مفتوحة بخياراتها والباقي عناوين،
//     وزر «أخرِج الكتاب» ثابت في أسفله.
//   · والباقي للكتاب نفسه: المعاينة صفحتين متقابلتين، أو نتائج البحث، أو الغلاف الخارجي، أو الإخراج وهو يجري.
// يُعيد ترتيب صفحة الإخراج قبل أن يعمل app.js (يُحمَّل قبله)، والعناصر كلها بمعرّفاتها فلا يتغيّر من منطقها شيء.
// يعمل في هيكل البرنامج وحده، لا في الموقع ولا في نافذة النسّاخ الخفية.
(function () {
  const html = document.documentElement;
  if (!html.hasAttribute('data-shell') || /[?&]scribe=1/.test(location.search) || !document.getElementById('settingsCard')) return;
  html.setAttribute('data-bench', '');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, inner) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (inner != null) e.innerHTML = inner;
    return e;
  };

  const body = $('.body');
  const main = $('.main');
  main.classList.add('bn-panel');
  main.setAttribute('aria-label', 'خطوات الإخراج');
  const STEPS = ['s1', 'bookCard', 's3', 's4', 's5'].map((id) => $('#' + id));
  const LABEL = { s1: 'الكتاب', bookCard: 'المجلدات', s3: 'التنضيد', s4: 'الغلاف', s5: 'الإخراج' };

  /* ---------- عناوين الخطوات: معيَّن، واسم الخطوة، وما اختير فيها، وعلامة التمام ---------- */
  for (const sec of STEPS) {
    const h = $(':scope > header.st-h', sec);
    h.classList.add('bn-h');
    h.setAttribute('role', 'button');
    h.tabIndex = 0;
    h.insertAdjacentHTML('beforeend', `<i class="bn-d" aria-hidden="true"></i><span class="bn-tt"><b class="bn-t">${LABEL[sec.id]}</b><small class="bn-sum"></small></span><span class="bn-ok" aria-hidden="true">✓</span>`);
    const bd = el('div', 'bn-body');
    for (const n of [...sec.children]) if (n !== h) bd.appendChild(n);
    sec.appendChild(bd);
  }

  /* ---------- المعاينة وما يعرض بجانب الخطوات ---------- */
  const view = el('section', 'bn-view');
  view.setAttribute('aria-label', 'الكتاب');
  const pane = (name, bar) => {
    const p = el('div', 'bn-pane');
    p.dataset.pane = name;
    p.hidden = true;
    if (bar) p.appendChild(el('div', 'bn-vbar', bar));
    const c = el('div', 'bn-pc');
    p.appendChild(c);
    view.appendChild(p);
    return c;
  };
  const chipsTo = (cur) => `<span class="bn-chips">${[['preview', 'المعاينة'], ['cover', 'الغلاف الخارجي'], ['progress', 'الإخراج']].map(([k, t]) => `<button type="button" class="bn-chip" data-go="${k}" aria-pressed="${k === cur}">${t}</button>`).join('')}</span>`;

  // البداية: المنضدة فارغة
  const start = pane('start');
  start.innerHTML = `<div class="bn-empty"><svg viewBox="0 0 40 72" width="30" height="54" aria-hidden="true"><path d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z" fill="currentColor"/><g class="lgd"><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07z"/><path d="M12 14.14l7.07 7.07L12 28.28l-7.07-7.07z"/><path d="M12 28.28l7.07 7.07L12 42.42l-7.07-7.07z"/><path d="M12 42.42l7.07 7.07L12 56.56l-7.07-7.07z"/><path d="M12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></g></svg><h2>المِنضدة فارغة</h2><p>ابحث عن كتابٍ في «تراث» من خانة البحث، أو ضع ملف Word أو PDF هنا.</p></div>`;
  const empty = $('.bn-empty', start);
  empty.appendChild($('#myBook'));
  empty.appendChild($('#tryBox'));

  // نتائج البحث
  const results = pane('results', `<b class="bn-vt">نتائج البحث</b><span class="bn-vs" id="bnResN"></span>`);
  results.appendChild($('#results'));

  // المعاينة: شريطها منها (صفحتان، صفحة، اللوحات، الصفحات)
  const pv = $('aside.pv');
  pane('preview').appendChild(pv);

  // الغلاف الخارجي: استوديو الأغلفة يملأ المكان
  const cover = pane('cover', `<b class="bn-vt">الغلاف الخارجي</b><span class="bn-vs" id="bnCoverSt"></span>${chipsTo('cover')}`);
  cover.appendChild($('#outerFileNote'));
  cover.appendChild($('#outerFrame'));

  // الإخراج وهو يجري، ومجلداته حين تتمّ
  const prog = pane('progress', `<b class="bn-vt">الإخراج</b><span class="bn-vs" id="bnProgSt"></span>${chipsTo('progress')}`);
  prog.appendChild($('#progressCard'));

  body.appendChild(view);

  /* ---------- أسفل العمود: «أخرِج الكتاب» ---------- */
  const go = $('.go.actions');
  const foot = el('div', 'bn-foot');
  foot.appendChild(go);
  main.appendChild(foot);
  $('#startBtn').innerHTML = 'أخرِج الكتاب <span class="kbd">Ctrl+E</span>';
  $('#startBtn').title = 'جلب الكتاب وتنضيده وإخراج ملفاته (Ctrl+E)';
  $('#rerenderBtn').classList.remove('big');

  /* ---------- التنضيد: أهم الخيارات في صندوق، والباقي تحت «خيارات أكثر» ---------- */
  const s3 = $('#s3 .bn-body');
  const opts = el('div', 'bn-opts');
  const opt = (label, ...nodes) => {
    const o = el('div', 'bn-opt');
    o.appendChild(el('span', 'bn-ol', label));
    for (const n of nodes) n && o.appendChild(n);
    opts.appendChild(o);
    return o;
  };
  for (const s of $$(':scope > .sub', s3)) s.remove(); // «القالب الأساسي»، «أسلوب دار النشر»: صارا عنوانين صغيرين
  opts.appendChild($('#autoNote'));
  opt('القالب', $('#templates'));
  opt('أسلوب دار النشر', $('#presets'), $('#presetDesc'));
  const rowOf = (id) => $('#' + id).closest('.row');
  for (const r of [rowOf('tocPos'), rowOf('chapterNewPage'), rowOf('headScheme'), rowOf('ayahCite'), rowOf('typoRules'), rowOf('spaceCollapse'), rowOf('nabawiBold'), rowOf('widowOrphan'), rowOf('runts'), rowOf('printReady')]) opts.appendChild(r);
  const more = el('details', 'bn-more');
  more.appendChild(el('summary', '', 'خيارات أكثر <small>المتن في الشرح، والفهرس، والألوان، والأبيات، والترويسة…</small>'));
  more.appendChild($('.work', s3));
  s3.prepend(opts);
  $('.catch', s3).before(more);

  // المجلدات: بيانات الغلاف الداخلي تُطوى (تُعدَّل حين يُحتاج)
  const ce = $('#bookCard .cover-edit');
  const ced = el('details', 'bn-more bn-cover');
  ced.appendChild(el('summary', '', 'بيانات الغلاف الداخلي <small>اسم الكتاب، والمؤلف، والمحقق، والطبعة، والناشر</small>'));
  ced.appendChild(ce);
  $('#bookCard .bn-body .catch').before(ced);
  $(':scope > .sub', ce).remove();

  // التعقيبة («التالي»): تفتح الخطوة التالية
  for (const a of $$('.bn-panel a.catch')) {
    const to = a.getAttribute('href').slice(1);
    a.classList.add('bn-next');
    a.textContent = 'التالي: ' + (LABEL[to] || a.textContent);
  }

  /* ================= الحال: أيّ خطوة مفتوحة، وماذا يُعرض بجانبها ================= */
  let open = 's1';
  let want = null; // ما اختاره المستخدم ليُعرض (يُنسى إذا انتقل إلى خطوة أخرى)
  let was = { has: false, running: false, done: false };
  const hasBook = () => !$('#settingsCard').hidden;
  const running = () => !$('#progressCard').hidden && !$('#cancelBtn').hidden;
  const finished = () => !$('#progressCard').hidden && !$('#doneBox').hidden;
  const isOn = (id) => (id === 's1' ? true : id === 'bookCard' ? !$('#bookCard').hidden : hasBook());

  function setOpen(id, scroll) {
    if (!isOn(id)) return;
    open = id;
    want = null;
    paint();
    if (scroll) $('#' + id).scrollIntoView({ block: 'nearest' });
  }

  function paneNow() {
    const nRes = $('#results').children.length;
    if (!hasBook()) return nRes ? 'results' : 'start';
    if (open === 's1' && nRes) return 'results';
    // خانة الملف مطلوبة (اختير «ملف Word من جهازي» أو نوع الأبحاث) والكتاب على المنضدة: تظهر بجانب الخطوة
    if (open === 's1' && !$('#myBook').hidden) return 'start';
    const can = { preview: true, cover: $('#outerMode [aria-pressed="true"]')?.dataset.v === 'design', progress: !$('#progressCard').hidden };
    if (want && can[want]) return want;
    if (running()) return 'progress';
    if (open === 's4' && can.cover) return 'cover';
    if (open === 's5' && can.progress) return 'progress';
    return 'preview';
  }

  // لا يُكتب في الصفحة إلا ما تغيّر (فلا يوقظ المراقبَ ما يكتبه هو)
  const setHidden = (x, v) => x.hidden !== v && (x.hidden = v);
  const setAttr = (x, k, v) => x.getAttribute(k) !== v && x.setAttribute(k, v);
  const setText = (x, v) => x.textContent !== v && (x.textContent = v);
  const txt = (s) => (s ? s.textContent.replace(/\s+/g, ' ').trim() : '');
  function summary(id) {
    if (!hasBook() && id !== 's1') return '';
    switch (id) {
      case 's1':
        return hasBook() ? txt($('#bookTitle')) : '';
      case 'bookCard':
        // كتابٌ جُمعت مجلداته في مجلدٍ واحد: يُذكر أن طبعته مجلدات (فيُقسَّم من هنا)
        if (!$('#singleVol').hidden) {
          const sb = $('#splitBox');
          const pr = sb && !sb.hidden ? +sb.dataset.printed || 0 : 0;
          return pr > 1 ? `مجلد واحد، وطبعته ${pr.toLocaleString('ar-EG')} ${pr <= 10 ? 'مجلدات' : 'مجلداً'}: قسّمه` : 'مجلد واحد';
        }
        return txt($('#volCount')).split('.')[0];
      case 's3':
        return [txt($('#templates [aria-pressed="true"] b')), txt($('#presets [aria-pressed="true"] b'))].filter(Boolean).join(' · ');
      case 's4':
        return txt($('#outerMode [aria-pressed="true"]'));
      case 's5':
        return [$('#outPdf').checked && 'PDF', $('#outDocx').checked && 'Word', $('#outWaraq') && $('#outWaraq').checked && 'وَرَق'].filter(Boolean).join(' و ') || 'لم تُختر صيغة';
    }
    return '';
  }

  function paint() {
    const has = hasBook();
    html.classList.toggle('bn-has', has);
    const oi = STEPS.findIndex((s) => s.id === open);
    STEPS.forEach((sec, i) => {
      const on = isOn(sec.id);
      sec.classList.toggle('bn-open', sec.id === open);
      sec.classList.toggle('bn-off', !on);
      const done = sec.id === 's5' ? finished() : has && (i < oi || (sec.id === 's1' && open !== 's1'));
      sec.classList.toggle('bn-done', !!done);
      const h = $('.bn-h', sec);
      setAttr(h, 'aria-expanded', String(sec.id === open));
      setAttr(h, 'aria-disabled', String(!on));
      setText($('.bn-sum', sec), sec.id === open ? '' : summary(sec.id));
    });
    for (const a of $$('.bn-panel a.bn-next')) setHidden(a, !isOn(a.getAttribute('href').slice(1)));
    const p = paneNow();
    for (const x of $$('.bn-pane', view)) setHidden(x, x.dataset.pane !== p);
    setAttr(view, 'data-pane', p);
    for (const c of $$('[data-go]')) {
      const k = c.dataset.go;
      setAttr(c, 'aria-pressed', String(k === p));
      setHidden(c, k === 'cover' ? $('#outerMode [aria-pressed="true"]')?.dataset.v !== 'design' : k === 'progress' ? $('#progressCard').hidden : false);
    }
    const n = $('#results').children.length;
    setText($('#bnResN'), n ? `${n.toLocaleString('ar-EG')} ${n === 1 ? 'نتيجة' : n === 2 ? 'نتيجتان' : n <= 10 ? 'نتائج' : 'نتيجة'}` : '');
    setText($('#bnCoverSt'), txt($('#outerStatus')));
    setText($('#bnProgSt'), running() ? txt($('#pctNum')) + ' · ' + txt($('#pctCap')) : finished() ? 'تمّ' : '');
    // المعاينة: تبويبا «الغلاف الخارجي» و«الإخراج» في شريطها أيضاً
    const bar = $('.pvw-bar', view);
    if (bar && !$('.bn-chips', bar)) {
      bar.insertAdjacentHTML('beforeend', chipsTo('preview'));
      paint();
    }
  }

  /** ما يتغيّر في الصفحة بفعل app.js: كتاب جديد، بدء الإخراج، تمامه… فتُفتح الخطوة التي تخصه */
  function sync() {
    const now = { has: hasBook(), running: running(), done: finished() };
    if (now.has && !was.has) open = !$('#singleVol').hidden ? 's3' : 'bookCard';
    if (!now.has && was.has) open = 's1';
    if (now.running && !was.running) {
      open = 's5';
      want = null;
    }
    if (!isOn(open)) open = 's1';
    was = now;
    paint();
  }

  let t = 0;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(sync, 30);
  };
  new MutationObserver(later).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-pressed', 'class'], characterData: true });
  document.addEventListener('change', later, true);

  // فتح خطوة بعنوانها، أو بالتعقيبة
  main.addEventListener('click', (e) => {
    const h = e.target.closest('.bn-h');
    if (h) return setOpen(h.closest('.stn').id === open ? open : h.closest('.stn').id, true);
    const a = e.target.closest('a.catch');
    if (a) {
      e.preventDefault();
      setOpen(a.getAttribute('href').slice(1), true);
    }
  });
  main.addEventListener('keydown', (e) => {
    const h = e.target.closest && e.target.closest('.bn-h');
    if (h && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(h.closest('.stn').id, true);
    }
  });
  view.addEventListener('click', (e) => {
    const c = e.target.closest('[data-go]');
    if (!c) return;
    want = c.dataset.go;
    paint();
  });
  // اختيار «تصميم غلاف خارجي» يعرض الاستوديو بجانب الخطوات
  $('#outerMode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.v === 'design') want = 'cover';
    else if (b) want = null;
  });

  // Ctrl+E: أخرِج الكتاب
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if (hasBook() && !running()) $('#startBtn').click();
    }
  });

  // للهيكل: فتح خطوة (مثلاً «التنضيد» من الخزانة)
  window.WarraqBenchView = { open: (id) => setOpen(id, true), paint };
  paint();
})();
