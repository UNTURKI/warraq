// الصفحة الرئيسية: الألف الفاصلة (قبل التنضيد وبعده)، أساليب دور النشر، الطريق بنقطه الخمس، الكشيدة، وما حولها.
(function () {
  const $ = (s) => document.querySelector(s);
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬').replace(/[0-9]/g, (d) => AR[+d]);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- ١. الصفحة قبل ورّاق وبعده ---- */
  const STYLES = [
    { id: 'mothhab', name: 'المُذهَّب', h1: '#1B3768', matn: '#9A2A1E', quran: '#1E5A44', rule: '#B08A3A', orn: '#B08A3A', sym: '❁', frame: false },
    { id: 'zomorrodi', name: 'الزمرّدي', h1: '#0E5640', matn: '#8A1F24', quran: '#13694B', rule: '#B38B3F', orn: '#B38B3F', sym: '۞', frame: false },
    { id: 'bustan', name: 'البستان', h1: '#8A1C22', matn: '#8A1C22', quran: '#1E5B3F', rule: '#B39048', orn: '#B39048', sym: '❁', frame: false },
    { id: 'hibr', name: 'حِبر', h1: '#000000', matn: '#000000', quran: '#000000', rule: '#000000', orn: '#000000', sym: '✽', frame: false },
    { id: 'najd', name: 'نجد', h1: '#3B2A1E', matn: '#A23B26', quran: '#3F6B45', rule: '#7A5536', orn: '#B28659', sym: '▲', frame: false },
    { id: 'samarqand', name: 'سمرقند', h1: '#16305F', matn: '#16305F', quran: '#9C2B2E', rule: '#C9A035', orn: '#C9A035', sym: '❁', frame: false },
    { id: 'thurayya', name: 'الثُّريّا', h1: '#17325C', matn: '#9B2335', quran: '#0F6B54', rule: '#B8913F', orn: '#B8913F', sym: '۞', frame: false },
  ];
  const box = $('#sheetBox');
  const range = $('#cutRange');
  let touched = false;
  const setPos = (p) => {
    box.style.setProperty('--cut', 100 - p + '%');
    range.value = p;
  };
  function setStyle(id) {
    const st = STYLES.find((x) => x.id === id) || STYLES[0];
    for (const k of ['h1', 'matn', 'quran', 'rule', 'orn']) box.style.setProperty('--' + k, st[k]);
    $('#sheetSet').classList.toggle('framed', st.frame);
    $('#sheetOrn').textContent = st.sym;
    for (const b of document.querySelectorAll('#styleChips .chip')) {
      const on = b.dataset.id === st.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  $('#styleChips').insertAdjacentHTML('beforeend', STYLES.map((s) => `<button type="button" class="chip" data-id="${s.id}"><i style="background:${s.h1}"></i>${s.name}</button>`).join(''));
  $('#styleChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) setStyle(b.dataset.id);
  });
  setStyle('mothhab');
  setPos(0);
  range.addEventListener('input', () => {
    touched = true;
    setPos(Number(range.value));
  });
  // لحظة الافتتاح: الألف تمرّ على الصفحة فتُنضَّد
  if (reduce) setPos(82);
  else {
    const t0 = performance.now() + 1500;
    const tick = (t) => {
      if (touched) return;
      const x = Math.min(1, Math.max(0, (t - t0) / 1700));
      setPos(Math.round(82 * (1 - Math.pow(1 - x, 3))));
      if (x < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---- ٢. الطريق: النقط تمتلئ واحدة بعد أخرى حتى يمسّها الزائر ---- */
  const steps = [...document.querySelectorAll('#roadSteps li')];
  const scenes = [...document.querySelectorAll('#roadStage .scene')];
  let step = 0;
  let held = false;
  function setStep(i) {
    step = i;
    steps.forEach((li, j) => (li.className = j < i ? 'done' : j === i ? 'on' : ''));
    scenes.forEach((s, j) => (s.hidden = j !== i));
  }
  steps.forEach((li, i) => {
    const go = () => {
      held = true;
      if (step !== i) setStep(i);
    };
    li.querySelector('.mz-dot').addEventListener('click', go);
    li.querySelector('.mz-dot').addEventListener('mouseenter', go);
  });
  setStep(0);
  if (!reduce) setInterval(() => !held && !document.hidden && setStep((step + 1) % 5), 3600);

  /* ---- ٣. الكشيدة: يُقاس الشطران بالنقط ثم يُمدّ القصير ---- */
  const kv = $('#kv');
  const sw = $('#kvSwitch');
  let dA = 0;
  let dB0 = 0;
  function setK(on) {
    kv.classList.toggle('on', on);
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-pressed', String(on));
    if (dA) $('#kvDB').textContent = ar(on ? dA : dB0) + ' نقطة';
  }
  sw.addEventListener('click', () => setK(!kv.classList.contains('on')));
  function measure() {
    const a = $('#kvA');
    const b = $('#kvB');
    const probe = document.createElement('span');
    probe.textContent = 'ـــــــــــ';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    a.parentNode.appendChild(probe);
    const unit = probe.getBoundingClientRect().width / 11;
    probe.remove();
    const wa = a.getBoundingClientRect().width;
    const wb0 = b.getBoundingClientRect().width;
    if (!unit || !wa) return;
    const total = Math.max(0, Math.round((wa - wb0) / unit));
    const each = Math.floor(total / 3);
    const rest = total - each * 3;
    const ks = b.querySelectorAll('.k');
    [each + (rest > 0 ? 1 : 0), each + (rest > 1 ? 1 : 0), each].forEach((n, i) => (ks[i].textContent = 'ـ'.repeat(n)));
    dA = Math.round(wa / 10);
    dB0 = Math.round(wb0 / 10);
    $('#kvDA').textContent = ar(dA) + ' نقطة';
    $('#kvDB').textContent = ar(dB0) + ' نقطة';
    setTimeout(() => setK(true), reduce ? 0 : 1400);
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(measure, 120));

  /* ---- لون المتن وأقواسه ---- */
  const MATN = [['#8B1A1A', 'أحمر دمي'], ['#1B2A5A', 'أزرق داكن'], ['#111111', 'أسود'], ['#0F5132', 'أخضر زيتي'], ['#6B1D2F', 'عنابي']];
  const BR = [['()', '( )'], ['«»', '« »'], ['[]', '[ ]'], ['none', 'بلا أقواس']];
  const PAIR = { '()': ['(', ')'], '«»': ['«', '»'], '[]': ['[', ']'], none: ['', ''] };
  let matn = MATN[0][0];
  let br = '()';
  function paintMatn() {
    const m = $('#matnDemo');
    m.style.color = matn;
    m.textContent = PAIR[br][0] + 'إنما الأعمال بالنيات' + PAIR[br][1];
    $('#matnSw').innerHTML = MATN.map(([v, l]) => `<button type="button" class="sw${v === matn ? ' on' : ''}" data-v="${v}" aria-label="${l}" aria-pressed="${v === matn}"><i style="background:${v}"></i></button>`).join('');
    $('#matnBr').innerHTML = BR.map(([v, l]) => `<button type="button" class="${v === br ? 'on' : ''}" data-v="${v}" aria-pressed="${v === br}">${l}</button>`).join('');
  }
  $('#matnSw').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) (matn = b.dataset.v), paintMatn();
  });
  $('#matnBr').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) (br = b.dataset.v), paintMatn();
  });
  paintMatn();

  /* ---- ألوان الغلاف ---- */
  const COVERS = [['#1F3A5F', '#E3C77A', 'الأزرق والذهبي'], ['#6B2331', '#E3C77A', 'العنابي الجلدي'], ['#1F5A45', '#E3C77A', 'الزمرّدي'], ['#232323', '#D9D9D9', 'الأسود الفاخر'], ['#5E4326', '#EBD9A8', 'البنّي العتيق'], ['#22304A', '#D5DBE5', 'الكحلي الفضي']];
  let cover = 0;
  function paintCover() {
    const c = $('#coverDemo');
    c.style.setProperty('--cv', COVERS[cover][0]);
    c.style.setProperty('--cvi', COVERS[cover][1]);
    $('#coverSw').innerHTML = COVERS.map(([bg, , l], i) => `<button type="button" class="sw${i === cover ? ' on' : ''}" data-i="${i}" aria-label="${l}" aria-pressed="${i === cover}"><i style="background:${bg}"></i></button>`).join('');
  }
  $('#coverSw').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) (cover = +b.dataset.i), paintCover();
  });
  paintCover();

  /* ---- رفّ المجلدات: كل مجلد كعبُه، وسماكته بعدد صفحاته ---- */
  const PAGES = [412, 486, 440, 502, 398, 468, 430, 372];
  const vols = [true, true, true, false, false, false, false, false];
  function paintVols() {
    $('#volsDemo').innerHTML = PAGES.map((p, i) => `<button type="button" class="spine ${vols[i] ? 'sel' : 'off'}" style="width:${Math.round(p / 14)}px" data-i="${i}" aria-pressed="${vols[i]}" aria-label="المجلد ${ar(i + 1)}، ${ar(p)} صفحة"><b>${ar(i + 1)}</b></button>`).join('');
    const picked = vols.filter(Boolean).length;
    const pages = vols.reduce((a, on, i) => a + (on ? PAGES[i] : 0), 0);
    $('#volsCap').textContent = picked ? `اخترتَ ${ar(picked)} من ٨ مجلدات، ${ar(pages)} صفحة` : 'اضغط كعب المجلد لتختاره';
  }
  $('#volsDemo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) (vols[+b.dataset.i] = !vols[+b.dataset.i]), paintVols();
  });
  paintVols();
})();
