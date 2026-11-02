// نافذة «الإعدادات» في البرنامج (كما في «ورّاق البرنامج»): شريط عنوان، وتبويبات عمودية بشرحٍ قصير،
// وصفوفٌ: اسم الإعداد يميناً وأداته يساراً. تبويبات لوحة المالك تبقى بمنطقها (admin.js)، ويُضاف إليها
// ما يخص البرنامج وحده: «عام»، و«النسّاخ»، و«متقدّم» (وإعدادات الطباعة في باب «الأساليب»).
// يُحمَّل قبل admin.js (فتُربط التبويبات الجديدة بمنطقه)، وفي نافذة البرنامج وحدها.
(function () {
  const desk = window.warraqDesktop;
  const html = document.documentElement;
  if (!desk || window.top !== window || !document.querySelector('nav.tabs')) return;
  html.setAttribute('data-settings', '');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

  /* ---- السِّراج: كبقية النوافذ (يتبع ويندوز ما لم يُختر) ---- */
  const KEY = 'warraq.night';
  const sys = window.matchMedia('(prefers-color-scheme: dark)');
  const stored = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  function paintNight() {
    const s = stored();
    const night = s === null ? sys.matches : s === '1';
    html.classList.toggle('night', night);
    if (desk.titlebar) desk.titlebar(night);
    for (const b of $$('#sdLamp button')) b.setAttribute('aria-pressed', String(b.dataset.v === (s === null ? 'sys' : s)));
  }
  sys.addEventListener('change', paintNight);
  window.addEventListener('storage', (e) => e.key === KEY && paintNight());

  /* ---- شريط العنوان ---- */
  const bar = document.createElement('header');
  bar.className = 'sd-bar';
  bar.innerHTML = `<svg viewBox="0 0 40 72" width="10" height="18" aria-hidden="true"><path d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z" fill="currentColor"/><g class="lgd"><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07z"/><path d="M12 14.14l7.07 7.07L12 28.28l-7.07-7.07z"/><path d="M12 28.28l7.07 7.07L12 42.42l-7.07-7.07z"/><path d="M12 42.42l7.07 7.07L12 56.56l-7.07-7.07z"/><path d="M12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></g></svg><b><span class="wq-word" role="img" aria-label="ورّاق"></span></b><span>· الإعدادات</span>`;
  document.body.prepend(bar);

  /* ---- التبويبات: عمودٌ على الجانب، لكل تبويب اسمه وشرحه ---- */
  const nav = $('nav.tabs');
  const side = document.createElement('aside');
  side.className = 'sd-side';
  side.appendChild(nav);
  bar.after(side);
  const TABS = [
    ['general', 'عام', 'السِّراج، والبداية'],
    ['look', 'المظهر', 'ألوان البرنامج'],
    ['sources', 'مصادر المعرفة', 'الكتب والترجمة والعلم'],
    ['fonts', 'الخطوط والفُرَش', 'خطوط الكتب وأقلام الرَّحل'],
    ['ai', 'الذكاء الاصطناعي', 'التنضيد والمحرِّر والرَّحل'],
    ['scribes', 'النسّاخ', 'الإخراج والحفظ'],
    ['advanced', 'متقدّم', 'بيانات البرنامج'],
  ];
  const panel = $('#panel');
  for (const [id, name, hint] of TABS) {
    let b = $(`button[data-tab="${id}"]`, nav);
    if (!b) {
      b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.setAttribute('aria-selected', 'false');
      const sec = document.createElement('section');
      sec.className = 'card tab sd-tab';
      sec.id = 'tab-' + id;
      sec.hidden = true;
      panel.appendChild(sec);
    }
    b.innerHTML = `<b>${name}</b><small>${hint}</small>`;
    nav.appendChild(b);
  }
  for (const b of $$('button[role=tab]', nav)) if (!TABS.some(([id]) => id === b.dataset.tab)) nav.appendChild(b); // ما للموقع وحده (مخفي)
  const links = $('.tab-links', nav);
  if (links) links.remove();
  // الافتراضي «عام» (ما لم يُطلب تبويب بعينه)
  $$('button[role=tab]', nav).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === 'general')));
  $$('.tab', panel).forEach((t) => (t.hidden = t.id !== 'tab-general'));

  const row = (label, body, note) => `<div class="sd-row"><div class="sd-l">${label}</div><div class="sd-c">${body}${note ? `<p class="sd-note">${note}</p>` : ''}</div></div>`;
  const tog = (id, label) => `<label class="sd-tog"><input type="checkbox" id="${id}"><span>${label}</span></label>`;

  $('#tab-general').innerHTML = `<h2 class="sd-h">عام</h2>
    ${row('السِّراج', `<div class="sd-seg" id="sdLamp" role="group" aria-label="السِّراج"><button type="button" data-v="sys">يتبع ويندوز</button><button type="button" data-v="0">نهاري</button><button type="button" data-v="1">ليلي</button></div>`, 'الوضع الليلي: ذهبٌ على لازورد، كالمصاحف المذهّبة. ويُبدَّل من زرّه في الشريط الجانبي.')}
    ${row('جولة البداية', `<button type="button" class="btn" id="sdOnboard">أعِد جولة البداية</button>`, 'الشاشات التي تظهر أول مرة: المظهر، وترتيب الخزانة، ومكان الحفظ، والتنبيه.')}
    ${row('عن ورّاق', `<button type="button" class="btn" id="sdAbout">عن ورّاق</button> <span class="sd-ver" id="sdVer"></span>`)}`;

  $('#tab-scribes').innerHTML = `<h2 class="sd-h">النسّاخ</h2>
    ${row('عدد النسّاخ', `<div class="sd-range"><b id="sdScN">٢</b><input type="range" id="sdSc" min="1" max="8" step="1" aria-label="عدد النسّاخ"><small>من ١ إلى ٨</small></div>`, '<span id="sdScHint"></span>')}
    ${row('مكان الحفظ', `<div class="sd-path"><input type="text" id="sdOut" readonly dir="auto"><button type="button" class="btn" id="sdOutChange">تغيير</button><button type="button" class="btn" id="sdOutOpen">افتح</button></div>`, 'في هذا المجلد مجلدٌ لكل كتاب تخرجه: ملفات PDF و Word و وَرَق، وخط الكتاب إن طلبته.')}
    ${row('اسم مجلد الكتاب', `<input type="text" id="sdFolder" class="sd-in" placeholder="{اسم الكتاب}" dir="auto"><div class="sd-chips"><button type="button" data-ins="{اسم الكتاب}">{اسم الكتاب}</button><button type="button" data-ins="{المؤلف}">{المؤلف}</button></div>`, 'مثل: {اسم الكتاب} - {المؤلف}')}
    ${row('أثناء العمل', `${tog('sdAwake', 'امنع الجهاز من السكون')}${tog('sdNotify', 'أشعرني إذا فرغ النسّاخ')}`)}`;

  $('#tab-advanced').innerHTML = `<h2 class="sd-h">متقدّم</h2>
    ${row('بيانات البرنامج', `<div class="sd-path"><input type="text" id="sdData" readonly dir="ltr"><button type="button" class="btn" id="sdDataOpen">افتح</button></div>`, 'إعداداتك، وأساليبك وخطوطك، والخزانة، والكتاب الذي على المنضدة. انسخ هذا المجلد لتنقل ورّاق كما هو إلى جهاز آخر.')}
    ${row('لوحة المالك', `<span class="sd-note">التبويبات هنا هي لوحة مالك الموقع نفسها، وصاحب الجهاز مالكها فلا كلمة سرّ في البرنامج.</span>`)}`;

  /* ---- الخطوط: «اللوتس» وخطوط الجهاز ---- */
  const fontsTab = $('#tab-fonts');
  if (fontsTab) {
    const box = document.createElement('div');
    box.className = 'sd-lotus';
    box.id = 'sdLotus';
    const hint = $('.hint', fontsTab);
    (hint || fontsTab.firstElementChild).after(box);
    const paintLotus = async () => {
      let list = [];
      try {
        list = ((await (await fetch('/api/fonts', { cache: 'no-store' })).json()) || {}).fonts || [];
      } catch {}
      const lotus = list.filter((f) => /lotus|لوتس/i.test(f.family + ' ' + (f.label || '')));
      const sys = list.filter((f) => f.system).length;
      box.innerHTML = lotus.length
        ? `<b class="sd-lotus-t ok">اللوتس</b><p>خط «اللوتس» (<span dir="ltr">${lotus.map((f) => esc(f.family)).join('، ')}</span>) ${lotus.some((f) => !f.system) ? 'مضافٌ هنا' : 'مثبّتٌ على جهازك'}، وهو ثاني خطوط ورّاق بعد خط الكتاب: في المنضدة، والأساليب، والأغلفة.</p>`
        : `<b class="sd-lotus-t">اللوتس</b><p>خط دور النشر في الكتب العربية (<span dir="ltr">Lotus Linotype</span>، بوزنيه Light و Bold). خطٌّ تجاري من Linotype لا يحلّ توزيعه مع ورّاق؛ فإذا ثبّتّه على جهازك، أو سحبت ملفيه إلى الخانة أدناه، ظهر باسمه «اللوتس» في أول الخطوط. وأقرب الخطوط الحرة إليه في ورّاق: «أميري».</p>`;
      box.insertAdjacentHTML('beforeend', sys ? `<p class="sd-note">ومع خطوط ورّاق كل خطوط جهازك (${ar(sys)} خطاً): تظهر في قوائم الخطوط باسم «خطوط جهازك».</p>` : '');
    };
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    paintLotus();
    $('button[data-tab="fonts"]', nav).addEventListener('click', paintLotus);
  }

  /* ---- القيم ---- */
  let info = null;
  const save = (patch) => desk.setPrefs(patch).then(load).catch(() => {});
  async function load() {
    info = await desk.info().catch(() => null);
    if (!info) return;
    const p = info.prefs || {};
    $('#sdVer').textContent = 'الإصدار ' + info.version;
    $('#sdOut').value = info.outDir || '';
    $('#sdData').value = info.dataDir || '';
    const sc = Math.round(+p.scribes) || info.scribes || 2;
    $('#sdSc').value = sc;
    $('#sdSc').style.setProperty('--v', sc);
    $('#sdScN').textContent = ar(sc);
    const best = Math.max(1, Math.min(4, Math.floor((info.cores || 4) / 2)));
    const now = info.scribes || 2;
    $('#sdScHint').textContent = `كل نسّاخ يُنضّد مجلداً في الوقت نفسه. لجهازك ${ar(info.cores || 4)} أنوية، والأنسب له ${best === 1 ? 'نسّاخ واحد' : best === 2 ? 'نسّاخان' : ar(best) + ' نسّاخ'}.${sc !== now ? ' يسري التغيير من التشغيل التالي للبرنامج.' : ''}`;
    if (document.activeElement !== $('#sdFolder')) $('#sdFolder').value = p.folderPattern || '';
    $('#sdAwake').checked = p.keepAwake !== false;
    $('#sdNotify').checked = p.notify !== false;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.closest('#sdLamp')) {
      try {
        if (t.dataset.v === 'sys') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, t.dataset.v);
      } catch {}
      return paintNight();
    }
    if (t.id === 'sdOnboard') return desk.openWindow('onboard');
    if (t.id === 'sdAbout') return desk.openWindow('about');
    if (t.id === 'sdOutChange') return desk.chooseOutDir().then(load);
    if (t.id === 'sdOutOpen' && info) return desk.showFolder(info.outDir).catch(() => {});
    if (t.id === 'sdDataOpen' && info) return desk.showFolder(info.dataDir).catch(() => {});
    if (t.dataset.ins) {
      const i = $('#sdFolder');
      const at = i.selectionStart != null ? i.selectionStart : i.value.length;
      i.value = i.value.slice(0, at) + t.dataset.ins + i.value.slice(i.selectionEnd != null ? i.selectionEnd : at);
      i.focus();
      save({ folderPattern: i.value.trim() });
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'sdSc') {
      $('#sdScN').textContent = ar(e.target.value);
      e.target.style.setProperty('--v', e.target.value);
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'sdSc') save({ scribes: +t.value });
    if (t.id === 'sdFolder') save({ folderPattern: t.value.trim() });
    if (t.id === 'sdAwake') save({ keepAwake: t.checked });
    if (t.id === 'sdNotify') save({ notify: t.checked });
  });
  paintNight();
  load();

  /* ---- تبويبٌ يُطلب من نافذة أخرى (مثل: المساعد في المحرِّر ← الذكاء الاصطناعي) ---- */
  const OPEN_KEY = 'warraq.settingsOpen';
  const openAsked = () => {
    let want = null;
    try {
      want = localStorage.getItem(OPEN_KEY);
      if (want) localStorage.removeItem(OPEN_KEY);
    } catch {}
    const b = want && $(`button[data-tab="${want}"]`, nav);
    if (b) b.click();
  };
  window.addEventListener('load', () => setTimeout(openAsked, 0));
  window.addEventListener('storage', (e) => e.key === OPEN_KEY && e.newValue && openAsked());
})();
