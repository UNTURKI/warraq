// صفحة الهوية: بناء الشعار، والنقطة وحدة المسافات، والألوان، والخط، والحركات الأربع.
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ar = (window.WQ && window.WQ.ar) || ((n) => String(n));
  const replay = (el, cls) => { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); };

  /* ------------------------------------------------------------ */
  /* ١. الشعار: الألف خمس نقط؛ وبقلمٍ أعرض تقلّ النقط وبأدقّ تكثر    */
  /* ------------------------------------------------------------ */
  const svg = $('#bSvg');
  const TOP = 60, H = 400, CX = 290;
  const WORD = { 3: 'ثلاث', 4: 'أربع', 5: 'خمس', 6: 'ستّ', 7: 'سبع' };
  const range = $('#penRange');
  const dotsOf = () => 8 - Number(range.value); // المنزلق ١ (أدقّ) ← ٧ نقط، ٥ (أعرض) ← ٣ نقط

  function build(mode) {
    const n = dotsOf();
    const d = H / n;            // قُطر النقطة
    const aw = 0.6 * d;         // عرض الألف (والأصل ٤٨ عند خمس نقط)
    const dx = CX - aw / 2 - 0.5 * d - d / 2; // وسط عمود النقط
    const left = dx - d / 2 - 14;
    let g = '', p = '';
    for (let i = 0; i <= n; i++) g += `<line style="--i:${i}" x1="${left.toFixed(1)}" y1="${TOP + i * d}" x2="500" y2="${TOP + i * d}"/>`;
    for (let i = 0; i < n; i++) p += `<path style="--i:${i}" d="M${dx.toFixed(1)} ${(TOP + i * d).toFixed(1)}l${d / 2} ${d / 2}-${d / 2} ${d / 2}-${d / 2}-${d / 2}z"/>`;
    $('#bGuides').innerHTML = g;
    $('#bDots').innerHTML = p;
    $('#bAlef').style.transform = `scaleX(${(5 / n).toFixed(4)})`;
    const x = CX + aw / 2 + 22;
    $('#bDim path').setAttribute('d', `M${x} ${TOP}v${H}M${x - 8} ${TOP}h16M${x - 8} ${TOP + H}h16`);
    const t = $('#bDim text');
    t.setAttribute('x', x + 12);
    t.textContent = `الألف: ${WORD[n]} نقط`;
    svg.style.setProperty('--n', n);
    svg.classList.remove('play', 'tune');
    if (mode) replay(svg, mode);

    const say = $('#penSay');
    if (n === 5) say.innerHTML = '<b>خمس نقط: هذا ميزان ورّاق.</b> بعدد محطات الإخراج: الكتاب، فالمجلدات، فالتنضيد، فالغلاف، فالإخراج.';
    else say.innerHTML = `${n < 5 ? 'قلمٌ أعرض، فالألف' : 'قلمٌ أدقّ، فالألف'} <b>${WORD[n]} نقط</b>. تغيّر الرسم وبقي الميزان: الألف تُقاس بنقطة قلمها، كما ضبطها ابن مقلة. وورّاق يكتب بخمس.`;
    $('#penBack').hidden = n === 5;
  }
  range.addEventListener('input', () => build('tune'));
  $('#penReplay').addEventListener('click', () => build('play'));
  $('#penBack').addEventListener('click', () => { range.value = 3; build('tune'); range.focus(); });
  build('play');

  /* ------------------------------------------------------------ */
  /* ٢. الميزان: كل مسافة عددٌ من النقط                              */
  /* ------------------------------------------------------------ */
  const sec2 = $('#s2');
  const spec = $('#uSpec');
  const cells = (n, tag) => Array.from({ length: n }, () => `<${tag}></${tag}>`).join('');
  $$('.i-gap', spec).forEach((el) => { el.innerHTML = cells(+el.dataset.s, 'b'); });
  $$('.i-step').forEach((b) => { $('.i-dots', b).innerHTML = cells(+b.dataset.s, 'i'); });
  function paintUnit() {
    const u = Number($('#uRange').value);
    sec2.style.setProperty('--u', u + 'px');
    $('#uOut').textContent = `النقطة = ${ar(u)}`;
    $$('.i-step').forEach((b) => { $('code', b).textContent = ar(u * +b.dataset.s); });
  }
  $('#uRange').addEventListener('input', paintUnit);
  paintUnit();
  $('#uSteps').addEventListener('click', (e) => {
    const b = e.target.closest('.i-step');
    if (!b) return;
    $$('.i-step').forEach((x) => x.classList.toggle('on', x === b));
    spec.dataset.pick = b.dataset.s;
  });
  $('#uSwitch').addEventListener('click', (e) => {
    const b = e.currentTarget;
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });

  /* ------------------------------------------------------------ */
  /* ٣. الألوان: تُقرأ من مظهر الموقع الحالي                         */
  /* ------------------------------------------------------------ */
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.appendChild(probe);
  function hexOf(value) {
    probe.style.color = '';
    probe.style.color = value;
    const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0];
    return '#' + m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const sws = $$('.i-sw');
  function readColors() {
    for (const b of sws) {
      const hex = b.dataset.hex || hexOf(`var(${b.dataset.var})`);
      b.dataset.now = hex;
      b.style.setProperty('--c', hex);
      // نقطة العلامة بلون الزخرفة، وعلى الزخرفة نفسها بالمداد
      b.style.setProperty('--cd', b.dataset.c === 'gold' ? 'var(--p-ink)' : b.dataset.c === 'night' ? '#D6B36A' : 'var(--p-gold)');
      $('code', b).textContent = hex;
    }
  }
  let copyT = 0;
  function pick(b) {
    sws.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('#cBox').dataset.pick = b.dataset.c;
    $('#cName').textContent = $('b', b).textContent;
    $('#cRole').textContent = b.dataset.c === 'night' ? 'أرض السِّراج: ذهبٌ على لازورد، كالمصاحف المذهّبة' : $('span', b).textContent;
    clearTimeout(copyT);
    $('#cCopy').innerHTML = `نسخ <bdi dir="ltr">${b.dataset.now}</bdi>`;
    $('#cCopy').dataset.hex = b.dataset.now;
  }
  $('#cPal').addEventListener('click', (e) => { const b = e.target.closest('.i-sw'); if (b) pick(b); });
  $('#cCopy').addEventListener('click', async (e) => {
    const b = e.currentTarget, hex = b.dataset.hex;
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      const t = document.createElement('textarea');
      t.value = hex; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {}
      t.remove();
    }
    b.innerHTML = `نُسخ <bdi dir="ltr">${hex}</bdi>`;
    clearTimeout(copyT);
    copyT = setTimeout(() => { b.innerHTML = `نسخ <bdi dir="ltr">${hex}</bdi>`; }, 1600);
  });
  readColors();
  pick($('.i-sw.on') || sws[0]);
  // ورقة المظهر قد تصل بعد هذا الملف
  const themeCss = $('#themeCss');
  if (themeCss && !themeCss.sheet) themeCss.addEventListener('load', () => { readColors(); pick($('.i-sw.on')); });

  /* ------------------------------------------------------------ */
  /* ٤. الخط                                                       */
  /* ------------------------------------------------------------ */
  const tOut = $('#tOut');
  $('#tIn').addEventListener('input', (e) => { tOut.textContent = e.target.value.trim() || 'عنوان كتابك'; });
  function paintSize() {
    // لا يتجاوز عرض الشاشة الصغيرة
    const max = Math.max(34, Math.min(96, Math.floor(window.innerWidth / 6.5)));
    tOut.style.setProperty('--ts', Math.min(Number($('#tSize').value), max) + 'px');
  }
  $('#tSize').addEventListener('input', paintSize);
  window.addEventListener('resize', paintSize);
  paintSize();

  /* ------------------------------------------------------------ */
  /* ٥. الحركة: كل حركة تُعاد بالضغط، وتُعرض مرة حين تبلغها           */
  /* ------------------------------------------------------------ */
  function stampAt(box, x, y) {
    const all = $$('.m-nq', box);
    if (all.length >= 9) { const o = all[0]; o.classList.add('old'); setTimeout(() => o.remove(), 500); }
    const i = document.createElement('i');
    i.className = 'm-nq';
    i.style.left = x + 'px';
    i.style.top = y + 'px';
    box.appendChild(i);
  }
  function play(box, e) {
    const mo = box.dataset.mo;
    if (mo === 'nq') {
      const r = box.getBoundingClientRect();
      // بلوحة المفاتيح أو عند العرض الأول: في الوسط
      const byPointer = e && e.clientX;
      stampAt(box, byPointer ? e.clientX - r.left : r.width / 2 + (Math.random() - 0.5) * r.width * (e ? 0.5 : 0), byPointer ? e.clientY - r.top : r.height / 2 + (Math.random() - 0.5) * r.height * (e ? 0.4 : 0));
    } else if (mo === 'md') {
      if (e) box.classList.toggle('go');
      else { box.classList.add('go'); setTimeout(() => box.classList.remove('go'), 1700); }
    } else replay(box, 'go');
  }
  const demos = $$('.i-mo-demo');
  demos.forEach((b) => b.addEventListener('click', (e) => play(b, e)));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        setTimeout(() => play(en.target, null), 150 + demos.indexOf(en.target) * 260);
      });
    }, { threshold: 0.6 });
    demos.forEach((b) => io.observe(b));
  } else demos.forEach((b) => play(b, null));
})();
