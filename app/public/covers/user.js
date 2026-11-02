/* صفحة المستخدم — معرض التصاميم والتخصيص */
(function () {
  'use strict';
  const Core = window.CoverCore;
  const R = window.CoverRender;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dpr = () => Math.min(2.5, window.devicePixelRatio || 1);
  const qs = new URLSearchParams(location.search);
  const PREVIEW = qs.get('preview') === '1';
  const EMBED = qs.get('embed') === '1'; // داخل موقع ورّاق (إطار iframe)
  if (EMBED) document.documentElement.classList.add('embed');
  // نوع التصاميم المعروضة: الغلاف الأمامي (الأصل) أو الخلفي أو الكعب
  const KIND = Core.KIND_LIST.includes(qs.get('kind')) ? qs.get('kind') : 'front';
  const KIND_TITLES = { front: 'اختر تصميم غلافك', back: 'اختر الغلاف الخلفي', spine: 'اختر تصميم الكعب' };

  // ألوان مقترحة عامة (تُضاف إليها ألوان التصميم)
  const SWATCHES = ['#1f3a5f', '#172a46', '#6b1e2b', '#0f4c3a', '#1b1b1d', '#5b3b22', '#4a2c5e', '#7a5c2e', '#c9a54a', '#d4af5a', '#bfc3c7', '#f5efe0', '#ffffff'];

  const S = {
    list: [], fonts: { builtin: Core.BUILTIN_FONTS, uploaded: [] }, view: 'grid',
    d: null, st: null, states: {}, data: {}, drag: null,
  };

  function store(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) { return null; } }
  function pref(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } }

  let toastT = 0;
  function toast(msg, warn) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('warn', !!warn);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* بيانات الكتاب من الموقع الأساسي: ?title=…&author=… أو رسالة postMessage */
  ['title', 'subtitle', 'author', 'publisher'].forEach((k) => { if (qs.get(k)) S.data[k] = qs.get(k); });
  if (qs.get('volume')) S.data.volume = +qs.get('volume') || 1;
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    // المنضدة تعيد اختيارات المستخدم المحفوظة في مشروعه (لكل تصميم حالته)
    if (e.data.type === 'warraq-cover-states' && e.data.states && typeof e.data.states === 'object') {
      Object.assign(S.states, e.data.states);
      if (S.d && e.data.states[S.d.id]) { S.st = e.data.states[S.d.id]; S.st.designId = S.d.id; applyData(); renderControls(); sizeCanvas(); requestRender(); }
      return;
    }
    if (e.data.type !== 'warraq-book') return;
    Object.assign(S.data, e.data.data || {});
    if (S.d && S.d.kind === 'spine' && 'spineCm' in (e.data.data || {})) { sizeCanvas(); requestRender(); renderControls(); }
    if (e.data.data && e.data.data.volume) { S.data.volume = +e.data.data.volume; if (S.st) S.st.volume = S.data.volume; }
    if (S.d) { applyData(); renderControls(); changed(); }
  });

  /* ------------------------------------------------------------ */
  /* المعرض                                                        */
  /* ------------------------------------------------------------ */
  const thumbHTML = (d) => (d.thumb ? `<img src="${esc(d.thumb)}" alt="" loading="lazy" draggable="false">` : R.fallbackThumb(d));

  async function loadList() {
    const [a, f] = await Promise.all([fetch('/api/covers').then((r) => r.json()), fetch('/api/covers/fonts').then((r) => r.json()).catch(() => null)]);
    S.list = (a.designs || []).filter((d) => (d.kind || 'front') === KIND);
    if (f) { S.fonts = f; R.registerFonts(f.uploaded); }
    renderGallery();
  }

  function renderGallery() {
    const g = $('#gallery');
    if (!S.list.length) {
      g.innerHTML = `<p class="muted empty-g">لا توجد تصاميم ${KIND === 'spine' ? 'كعب' : KIND === 'back' ? 'للغلاف الخلفي' : ''} منشورة بعد.</p>`;
      return;
    }
    g.innerHTML = S.list.map((d, i) => `
      <button class="gcard" data-id="${d.id}" style="--i:${i}" aria-label="${esc(d.name)}">
        <span class="thumb">${thumbHTML(d)}<span class="shine"></span></span>
        <span class="gname">${esc(d.name)}</span>
      </button>`).join('');
    updateArrows();
  }

  function setView(v) {
    S.view = v;
    pref('covers.view', v);
    $('#gallery').className = 'gallery ' + v;
    $$('.seg [data-view]').forEach((b) => b.setAttribute('aria-checked', b.dataset.view === v));
    $('.g-body').classList.toggle('strip', v === 'strip');
    updateArrows();
  }
  $$('.seg [data-view]').forEach((b) => {
    b.insertAdjacentHTML('afterbegin', ic(b.dataset.view === 'grid' ? 'grid' : 'rows'));
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  // إمالة ثلاثية الأبعاد ولمعة تتبع المؤشر
  $('#gallery').addEventListener('pointermove', (e) => {
    const c = e.target.closest('.gcard');
    if (!c || e.pointerType !== 'mouse') return;
    const t = c.querySelector('.thumb');
    const r = t.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    t.style.setProperty('--rx', (-y * 10).toFixed(2) + 'deg');
    t.style.setProperty('--ry', (x * 12).toFixed(2) + 'deg');
    t.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
    t.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
  });
  $('#gallery').addEventListener('pointerout', (e) => {
    const c = e.target.closest('.gcard');
    if (c && !c.contains(e.relatedTarget)) { const t = c.querySelector('.thumb'); t.style.removeProperty('--rx'); t.style.removeProperty('--ry'); }
  });

  // الشريط: أسهم + سحب بالمؤشر + عجلة الفأرة
  const gal = $('#gallery');
  function updateArrows() {
    const strip = S.view === 'strip';
    const max = gal.scrollWidth - gal.clientWidth;
    const pos = Math.abs(gal.scrollLeft);
    $('.g-arrow.prev').disabled = !strip || pos < 4;
    $('.g-arrow.next').disabled = !strip || pos > max - 4;
  }
  gal.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  $$('.g-arrow').forEach((b) => {
    b.innerHTML = ic(b.classList.contains('next') ? 'chevL' : 'chevR');
    b.addEventListener('click', () => gal.scrollBy({ left: -b.dataset.dir * gal.clientWidth * 0.8, behavior: 'smooth' }));
  });
  gal.addEventListener('wheel', (e) => {
    if (S.view !== 'strip' || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    const max = gal.scrollWidth - gal.clientWidth;
    if (max <= 0) return;
    e.preventDefault();
    gal.scrollLeft -= e.deltaY;
  }, { passive: false });
  let gdrag = null;
  gal.addEventListener('pointerdown', (e) => { if (S.view === 'strip' && e.pointerType === 'mouse') gdrag = { x: e.clientX, s: gal.scrollLeft, moved: false }; });
  window.addEventListener('pointermove', (e) => {
    if (!gdrag) return;
    const dx = e.clientX - gdrag.x;
    if (Math.abs(dx) > 5) { gdrag.moved = true; gal.classList.add('dragging'); }
    gal.scrollLeft = gdrag.s - dx;
  });
  window.addEventListener('pointerup', () => { if (gdrag) setTimeout(() => { gdrag = null; gal.classList.remove('dragging'); }, 0); });

  gal.addEventListener('click', (e) => {
    const c = e.target.closest('.gcard');
    if (!c || (gdrag && gdrag.moved)) return;
    location.hash = 'd=' + c.dataset.id;
  });

  /* ------------------------------------------------------------ */
  /* التوجيه                                                       */
  /* ------------------------------------------------------------ */
  window.addEventListener('hashchange', route);
  async function route() {
    const m = /d=([\w-]+)/.exec(location.hash);
    if (m) await openDesign(m[1]);
    else showGallery();
  }

  function showGallery() {
    S.d = null;
    notifyParent();
    $('#customizeView').classList.add('hidden');
    $('#galleryView').classList.remove('hidden');
    document.title = 'تصاميم الأغلفة — ورّاق';
    $('.g-head h1').textContent = KIND_TITLES[KIND];
    updateArrows();
  }
  $('#backToGallery').innerHTML = ic('back') + ' كل التصاميم';
  $('#backToGallery').addEventListener('click', () => { history.pushState(null, '', location.pathname + location.search); showGallery(); });

  async function fetchDesign(id) {
    let r = await fetch('/api/covers/' + id);
    if (!r.ok && PREVIEW) r = await fetch('/api/admin/covers/' + id);
    if (!r.ok) throw new Error('التصميم غير متاح');
    return (await r.json()).design;
  }

  async function openDesign(id) {
    $('#galleryView').classList.add('hidden');
    $('#customizeView').classList.remove('hidden');
    $('#cvLoading').classList.remove('hidden');
    let d;
    try { d = Core.normalizeDesign(await fetchDesign(id)); } catch (e) { toast(e.message, true); showGallery(); return; }
    $('#previewBanner').classList.toggle('hidden', !(PREVIEW && !d.published));
    S.d = d;
    S.st = S.states[id] || store('covers.state.' + id) || Core.emptyState(d);
    S.st.designId = id;
    if (S.data.volume && S.st.volume == null) S.st.volume = S.data.volume;
    applyData();
    $('#cName').textContent = d.name;
    document.title = d.name + ' — تصاميم الأغلفة';
    renderMiniStrip();
    renderControls();
    sizeCanvas();
    await requestRender(true);
    $('#cvLoading').classList.add('hidden');
    notifyParent();
    window.scrollTo({ top: 0 });
  }

  /** نصوص الكتاب القادمة من الموقع: تملأ الحقول ما لم يعدّلها المستخدم */
  function applyData() {
    S.st.texts = S.st.texts || {};
    for (const l of S.d.layers) {
      if (l.type !== 'text' || !(l.role in S.data) || S.data[l.role] == null || l.role === 'volume') continue;
      const t = (S.st.texts[l.id] = S.st.texts[l.id] || {});
      if (!t.edited && l.user.text) t.text = String(S.data[l.role]);
    }
  }

  function renderMiniStrip() {
    $('#miniStrip').innerHTML = S.list.map((d) => `<a class="mini-t ${d.id === S.d.id ? 'on' : ''}" href="#d=${d.id}" title="${esc(d.name)}"><span class="thumb">${thumbHTML(d)}</span></a>`).join('');
  }

  /* ------------------------------------------------------------ */
  /* المعاينة                                                      */
  /* ------------------------------------------------------------ */
  const ucv = $('#ucv');
  let scale = 1;
  /** التصميم كما يراه المستخدم: بصوره ونصوصه الخاصة */
  const ED = () => Core.effective(S.d, S.st);
  /** عرض الكعب المعاين (من المنضدة: تقدير بعدد صفحات الكتاب ونوع ورقه) */
  const spineCm = () => (S.d && S.d.kind === 'spine' && S.data.spineCm > 0 ? +S.data.spineCm : null);
  const viewDims = () => Core.canvasDims(spineCm() ? Object.assign({}, S.d.canvas, { widthCm: spineCm() }) : S.d.canvas);
  function sizeCanvas() {
    if (!S.d) return;
    const { w, h } = viewDims();
    const frame = $('.cv-frame');
    const maxW = Math.min(frame.parentElement.clientWidth, S.d.kind === 'spine' ? 260 : 520);
    const maxH = Math.max(320, window.innerHeight - 170);
    scale = Math.min(maxW / w, maxH / h);
    ucv.style.width = w * scale + 'px';
    ucv.style.height = h * scale + 'px';
    ucv.width = Math.round(w * scale * dpr());
    ucv.height = Math.round(h * scale * dpr());
  }
  window.addEventListener('resize', () => { if (S.d) { sizeCanvas(); requestRender(); } });

  let rq = 0, tok = 0;
  function resolved() { return Core.resolveState(ED(), S.st); }
  function requestRender(now) {
    return new Promise((resolve) => {
      cancelAnimationFrame(rq);
      const go = async () => {
        if (!S.d) return resolve();
        const my = ++tok;
        const rs = resolved();
        const ed = ED();
        await R.prepare(ed, rs, S.data);
        if (my !== tok || !S.d) return resolve();
        R.draw(ucv, ed, rs, { scale: scale * dpr(), data: S.data, spineCm: spineCm() });
        resolve();
      };
      if (now) go(); else rq = requestAnimationFrame(go);
    });
  }
  let saveT = 0;
  function notifyParent(kind) {
    if (!EMBED || window.parent === window) return;
    try { window.parent.postMessage({ type: kind || 'warraq-cover-change', kind: (S.d && S.d.kind) || KIND, designId: S.d ? S.d.id : null, designName: S.d ? S.d.name : '', state: S.d ? S.st : null }, location.origin); } catch (_) { /* لا شيء */ }
  }
  function changed() {
    S.states[S.d.id] = S.st;
    notifyParent();
    clearTimeout(saveT);
    saveT = setTimeout(() => store('covers.state.' + S.d.id, S.st), 300);
    requestRender();
  }

  // تحريك ما سمح المالك بتحريكه
  const movable = (l) => l.user.move;
  function toDesign(e) {
    const r = ucv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  ucv.addEventListener('pointermove', (e) => {
    if (!S.d) return;
    const p = toDesign(e);
    if (S.drag) {
      const dx = p.x - S.drag.p.x, dy = p.y - S.drag.p.y;
      const l = S.drag.l;
      if (l.type === 'text') { const t = (S.st.texts[l.id] = S.st.texts[l.id] || {}); t.dx = Math.round(S.drag.x + dx); t.dy = Math.round(S.drag.y + dy); }
      else { S.st.offset = S.st.offset || {}; S.st.offset[l.id] = { dx: Math.round(S.drag.x + dx), dy: Math.round(S.drag.y + dy) }; }
      requestRender();
      return;
    }
    const hit = R.hitTest(ED(), resolved(), p.x, p.y, movable);
    ucv.style.cursor = hit ? 'grab' : 'default';
  });
  ucv.addEventListener('pointerdown', (e) => {
    if (!S.d) return;
    const p = toDesign(e);
    const l = R.hitTest(ED(), resolved(), p.x, p.y, movable);
    if (!l) return;
    const cur = l.type === 'text' ? (S.st.texts[l.id] || {}) : ((S.st.offset || {})[l.id] || {});
    S.drag = { l, p, x: cur.dx || 0, y: cur.dy || 0 };
    ucv.setPointerCapture(e.pointerId);
    ucv.style.cursor = 'grabbing';
    e.preventDefault();
  });
  const endDrag = () => {
    if (!S.drag) return;
    const l = S.drag.l;
    S.drag = null;
    ucv.style.cursor = 'grab';
    // نص المستخدم: يُثبَّت موضعه في خانته نفسها
    const ut = l.userText && (S.st.userTexts || []).find((t) => t.id === l.id);
    const t = S.st.texts && S.st.texts[l.id];
    if (ut && t) { ut.box.x = Math.round(ut.box.x + (t.dx || 0)); ut.box.y = Math.round(ut.box.y + (t.dy || 0)); delete S.st.texts[l.id]; }
    changed();
    renderControls();
  };
  ucv.addEventListener('pointerup', endDrag);
  ucv.addEventListener('pointercancel', endDrag);

  /* ------------------------------------------------------------ */
  /* أدوات التخصيص                                                 */
  /* ------------------------------------------------------------ */
  const controls = $('#controls');
  const availableFonts = () => (S.fonts.site || []).map((f) => ({ family: f.family, label: f.label || f.family, weights: f.weights || [400, 700] }))
    .concat(S.fonts.builtin || [])
    .concat(S.fonts.system || [])
    .concat((S.fonts.uploaded || []).filter((f, i, a) => a.findIndex((x) => x.family === f.family) === i).map((f) => ({ family: f.family, label: f.label || f.family, weights: S.fonts.uploaded.filter((x) => x.family === f.family).map((x) => x.weight || 400) })));

  function swatchRow(key, current, withOriginal) {
    const cols = [...new Set((S.d.palette || []).concat(SWATCHES))];
    return `<div class="swatches" data-key="${key}">
      ${withOriginal ? `<button class="swatch original ${current ? '' : 'on'}" data-swatch="${Core.ORIGINAL}" title="ألوان الصورة الأصلية" aria-label="ألوان الصورة الأصلية"><span>الأصلي</span></button>` : ''}
      ${cols.map((c) => `<button class="swatch ${c === current ? 'on' : ''}" style="--c:${c}" data-swatch="${c}" title="${c}" aria-label="${c}"></button>`).join('')}
      <label class="swatch custom" title="لون مخصص"><input type="color" value="${current || '#808080'}" data-colorpick="${key}">${ic('palette')}</label>
    </div>`;
  }

  /** هل الطبقة تابعة لطبقة أخرى معروضة؟ (تُخفى أداتها ويكفي التحكم بالمتبوعة) */
  function isFollower(l, shown) {
    if (!S.d.syncVariants || l.section !== 'slot') return false;
    return Core.linkedImageLayers(S.d, l.id).some((o) => o.section === 'cover' && shown.includes(o));
  }

  function groupLabel(g) {
    const imgs = g.filter((t) => t.kind === 'image');
    const cover = imgs.filter((t) => t.section === 'cover').map((t) => t.label);
    const names = (cover.length ? cover : imgs.map((t) => t.label.replace(/^خانة\s*[:：]\s*/, 'الخانة: ')));
    const extra = g.length - imgs.length;
    return names.join('، ') + (extra ? ` <small class="muted">+ ${extra} من النصوص</small>` : '') + (imgs.some((t) => t.section === 'slot') && cover.length ? ' <small class="muted">والخانة</small>' : '');
  }

  function renderControls() {
    const d = S.d, rs = resolved();
    const uc = Core.userControls(d);
    const parts = [];

    // ١) الأشكال (البدائل): وما سمح المالك باختيار بديله يضع فيه المستخدم صورته أيضاً
    const ed = ED();
    const canImg = d.allowUserImages;
    const vlayers = ed.layers.filter((l) => l.type === 'image' && l.user.variant && (l.variants.filter((v) => v.offered).length > 1 || canImg) && !(l.section === 'slot' && !rs.volumeOn));
    const shownV = vlayers.filter((l) => !isFollower(l, vlayers) || l.variants.some((v) => v.user));
    if (shownV.length) {
      parts.push(section('layers', 'الشكل', shownV.map((l) => `
        <div class="ctl">
          <span class="ctl-l">${esc(l.section === 'slot' ? l.name.replace(/^خانة\s*[:：]\s*/, 'الخانة: ') : l.name)}</span>
          <div class="seg-opts">${l.variants.filter((v) => v.offered).map((v) => v.user ? `<span class="opt-user ${rs.variant[l.id] === v.id ? 'on' : ''}">
              <button class="opt ${rs.variant[l.id] === v.id ? 'on' : ''}" data-variant="${l.id}:${v.id}" title="${v.mode === 'none' ? 'صورتك بألوانها' : 'شكلك: يأخذ لون الطبقة'}"><img src="${esc(v.src)}" alt="">${esc(v.label)}</button>
              <button class="uv-mode" data-uvmode="${l.id}:${v.id}" title="${v.mode === 'none' ? 'اجعلها شكلاً يُلوَّن بلون الطبقة' : 'اجعلها صورة بألوانها الأصلية'}">${v.mode === 'none' ? 'صورة' : 'شكل'}</button>
              <button class="uv-del" data-uvdel="${l.id}:${v.id}" title="إزالة">${ic('x')}</button></span>`
            : `<button class="opt ${rs.variant[l.id] === v.id ? 'on' : ''}" data-variant="${l.id}:${v.id}">${esc(v.label)}</button>`).join('')}
            ${canImg ? `<label class="opt add-uv" title="ضع صورتك (شعارك) مكان هذه الصورة: تأخذ موضعها وحجمها بلا تشويه، وتبقى بألوانها">${ic('upload')} صورتك<input type="file" accept="image/png,image/jpeg,image/webp" data-uvup="${l.id}" hidden></label>` : ''}</div>
        </div>`).join('')));
    }

    // ٢) الألوان
    if (uc.colorGroups.length) {
      parts.push(section('palette', 'الألوان', uc.colorGroups.filter((g) => rs.volumeOn || g.some((t) => t.section === 'cover')).map((g) => `
        <div class="ctl">
          <span class="ctl-l">${groupLabel(g)}</span>
          ${(() => { const img = g.find((t) => t.kind === 'image'); return swatchRow(img.key, rs.colors[img.key], true); })()}
        </div>`).join('')));
    }

    // ٣) المجلد
    const volText = d.layers.find((l) => l.type === 'text' && l.role === 'volume');
    if (d.volume.userToggle || (volText && volText.user.text)) {
      parts.push(section('star', 'خانة المجلد', `
        ${d.volume.userToggle ? `<label class="sw"><span>إظهار خانة رقم المجلد</span><input type="checkbox" data-volon ${rs.volumeOn ? 'checked' : ''}></label>` : ''}
        ${EMBED && rs.volumeOn ? `<p class="muted small">رقم المجلد يُكتب تلقائياً لكل مجلد برقمه الحقيقي عند الإخراج (المعاينة: ${esc(volText ? Core.formatVolume(volText, rs.volume) : rs.volume)}).</p>` : ''}
        ${!EMBED && volText && volText.user.text && rs.volumeOn ? `<div class="ctl row-ctl"><span class="ctl-l">رقم المجلد</span>
          <div class="stepper"><button data-vstep="-1" aria-label="إنقاص">−</button><input type="number" min="1" max="999" value="${rs.volume}" data-volnum><button data-vstep="1" aria-label="زيادة">+</button></div>
          <span class="vol-pre">${esc(Core.formatVolume(volText, rs.volume))}</span></div>` : ''}`));
    }

    // صورة المستخدم غلافاً
    if (d.allowCustom) {
      const c = S.st.custom;
      parts.push(section('upload', 'صورتك غلافاً', c && c.src ? `
        <div class="custom-row"><img src="${esc(c.src)}" alt=""><div class="c-body">
          <div class="seg-opts"><button class="opt ${c.fit !== 'contain' ? 'on' : ''}" data-cfit="cover">ملء الغلاف</button><button class="opt ${c.fit === 'contain' ? 'on' : ''}" data-cfit="contain">الصورة كاملة</button></div>
          <label class="sw"><span>إبقاء نصوص التصميم فوقها</span><input type="checkbox" data-ckeep="keepTexts" ${c.keepTexts ? 'checked' : ''}></label>
          <label class="sw"><span>إبقاء خانة رقم المجلد</span><input type="checkbox" data-ckeep="keepVolume" ${c.keepVolume !== false ? 'checked' : ''}></label>
          <button class="btn sm danger" data-cdel>${ic('trash')} إزالة صورتي والعودة للتصميم</button>
        </div></div>` : `
        <p class="muted small">ارفع صورة من جهازك (JPG أو PNG) لتكون هي الغلاف بدل التصميم. المقاس المثالي نسبة ١٧×٢٤.</p>
        <label class="btn">${ic('upload')} اختيار صورة<input type="file" accept="image/png,image/jpeg,image/webp" data-cupload hidden></label>`));
    }

    // ٤) النصوص
    const texts = uc.texts.filter((l) => !(l.section === 'slot' && !rs.volumeOn));
    if (texts.length) parts.push(section('type', 'النصوص', texts.map((l) => textCard(l, rs)).join('')));

    // نصوص المستخدم الحرة
    if (d.allowUserText) {
      const uts = (S.st.userTexts || []);
      parts.push(section('font', 'نصوصك', `${uts.map((t, i) => userTextCard(t, i)).join('')}
        ${uts.length < Core.MAX_USER_TEXTS ? `<button class="btn" data-utadd>${ic('plus')} إضافة نص</button>` : ''}
        ${uts.length ? '<p class="muted small">اسحب النص على الغلاف لتضعه حيث تريد.</p>' : '<p class="muted small">نص حر تكتبه بنفسك، وتختار خطه ولونه ومحاذاته والمسافة بين أسطره.</p>'}`));
    }

    // ٥) إظهار وإخفاء
    const hides = uc.hides.filter((l) => !(l.section === 'slot' && !rs.volumeOn));
    if (hides.length) parts.push(section('eye', 'إظهار وإخفاء', hides.map((l) => `<label class="sw"><span>${esc(l.name)}</span><input type="checkbox" data-showlayer="${l.id}" ${rs.hidden[l.id] ? '' : 'checked'}></label>`).join('')));

    parts.push(`<div class="c-actions">
      <button class="btn" data-act="reset">${ic('reset')} إعادة الضبط</button>
      <button class="btn" data-act="download">${ic('download')} تنزيل الغلاف PNG</button>
      <button class="btn gold" data-act="apply">${ic('check')} اعتماد هذا الغلاف</button>
    </div>`);
    controls.innerHTML = parts.join('');
    $('#moveHint').textContent = uc.movable.length ? 'يمكنك سحب ' + uc.movable.map((l) => l.name).join(' و') + ' على الغلاف لتحريكه.' : '';
  }

  function userTextCard(t, i) {
    const fonts = availableFonts();
    const al = t.justify ? 'justify' : t.align;
    const algn = [['right', 'يمين'], ['center', 'وسط'], ['left', 'يسار'], ['justify', 'ضبط من الطرفين']];
    return `<div class="tcard ut" data-ut="${t.id}">
      <div class="tcard-h"><b>نصك ${Core.toIndic(i + 1)}</b><button class="ibtn" data-utdel="${t.id}" title="حذف النص">${ic('trash')}</button></div>
      <textarea class="inp" rows="3" data-utf="text" placeholder="اكتب نصك">${esc(t.text)}</textarea>
      <label class="field"><span>الخط</span><select class="inp" data-utf="font">${fonts.map((f) => `<option value="${esc(f.family)}" ${f.family === t.font ? 'selected' : ''} style="font-family:'${esc(f.family)}'">${esc(f.label)}</option>`).join('')}</select></label>
      <div class="ctl"><span class="ctl-l">الترتيب (المحاذاة)</span><div class="seg-opts">${algn.map(([k, n]) => `<button class="opt ${al === k ? 'on' : ''}" data-utalign="${k}">${n}</button>`).join('')}</div></div>
      ${S.d.kind === 'spine' ? `<div class="ctl"><span class="ctl-l">الاتجاه</span><div class="seg-opts">${Object.entries(Core.ORIENTS).map(([k, n]) => `<button class="opt ${t.orient === k ? 'on' : ''}" data-utorient="${k}">${n}</button>`).join('')}</div></div>` : ''}
      <label class="field"><span>الحجم <output>${Core.toIndic(Math.round(t.size))}</output></span><input type="range" min="10" max="${S.d.kind === 'spine' ? 120 : 160}" step="1" value="${t.size}" data-utf="size"></label>
      <label class="field"><span>المسافة بين الأسطر <output>${Core.toIndic(t.lineHeight.toFixed(2))}</output></span><input type="range" min="0.8" max="2.6" step="0.05" value="${t.lineHeight}" data-utf="lineHeight"></label>
      <label class="sw"><span>عريض</span><input type="checkbox" data-utbold ${t.weight >= 600 ? 'checked' : ''}></label>
      <div class="ctl"><span class="ctl-l">اللون</span>${swatchRow('UT:' + t.id, t.color)}</div>
    </div>`;
  }
  const userText = (id) => (S.st.userTexts || []).find((t) => t.id === id);

  function section(icon, title, body) {
    return `<section class="c-sec"><h3>${ic(icon)} ${title}</h3><div class="c-body">${body}</div></section>`;
  }

  function textCard(l, rs) {
    const t = rs.texts[l.id];
    const u = l.user;
    const vol = l.role === 'volume';
    const fonts = availableFonts();
    const st = S.st.texts && S.st.texts[l.id];
    const moved = st && (st.dx || st.dy);
    const fill = 'T:' + l.id + ':fill';
    return `<div class="tcard" data-text="${l.id}">
      <div class="tcard-h"><b>${esc(l.name)}</b>
        ${u.hide ? `<label class="sw small"><span>ظاهر</span><input type="checkbox" data-texthide="${l.id}" ${t.hidden ? '' : 'checked'}></label>` : ''}
      </div>
      ${u.text && !vol ? `<input class="inp" data-textval="${l.id}" value="${esc(Core.textFor(l, rs, S.data))}" placeholder="${esc(l.text)}">` : ''}
      ${u.font ? `<details class="fontpick"><summary><span style="font-family:'${esc(t.font)}'">${esc((fonts.find((f) => f.family === t.font) || { label: t.font }).label)}</span><small class="muted">تغيير الخط</small></summary>
        <div class="font-grid">${fonts.map((f) => `<button class="ftile ${f.family === t.font ? 'on' : ''}" data-font="${l.id}" data-family="${esc(f.family)}" style="font-family:'${esc(f.family)}'"><span>${esc(vol ? '١٢' : (Core.textFor(l, rs, S.data) || 'نص').slice(0, 14))}</span><small>${esc(f.label)}</small></button>`).join('')}</div>
      </details>` : ''}
      ${u.size ? `<label class="field"><span>الحجم</span><input type="range" min="${l.minSize}" max="${Math.round(l.size * 1.5)}" step="1" value="${t.size}" data-tsize="${l.id}"></label>` : ''}
      ${u.color ? `<div class="ctl"><span class="ctl-l">لون النص</span>${swatchRow(fill, rs.colors[fill])}</div>` : ''}
      ${u.strokes ? strokesEditor(l, t, rs) : ''}
      ${u.move && moved ? `<button class="btn sm ghost" data-resetpos="${l.id}">${ic('move')} إعادة الموضع</button>` : ''}
    </div>`;
  }

  function strokesEditor(l, t, rs) {
    return `<div class="ustrokes">
      <span class="ctl-l">الحدود (${t.strokes.length}/${Core.MAX_STROKES})</span>
      ${t.strokes.map((s, i) => {
        const k = 'T:' + l.id + ':s:' + s.id;
        return `<div class="ustroke"><span class="snum">${i + 1}</span>
          <label class="color"><input type="color" value="${rs.colors[k] || '#000000'}" data-colorpick="${k}"></label>
          <input type="range" min="0.5" max="20" step="0.5" value="${s.width}" data-swidth="${l.id}:${i}" aria-label="عرض الحد ${i + 1}">
          <output>${s.width}px</output>
          <button class="ibtn" data-sdel="${l.id}:${i}" title="حذف">${ic('x')}</button></div>`;
      }).join('')}
      ${t.strokes.length < Core.MAX_STROKES ? `<button class="btn sm" data-sadd="${l.id}">${ic('plus')} إضافة حد</button>` : ''}
    </div>`;
  }

  function textState(id) {
    S.st.texts = S.st.texts || {};
    return (S.st.texts[id] = S.st.texts[id] || {});
  }
  function currentStrokes(l) {
    const t = textState(l.id);
    if (!t.strokes) t.strokes = resolved().texts[l.id].strokes.map((s) => ({ id: s.id, width: s.width }));
    return t.strokes;
  }

  controls.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = S.d;
    if (b.dataset.utadd != null) {
      S.st.userTexts = (S.st.userTexts || []).concat([Core.makeUserText(d, { color: (d.palette || [])[2] || '#ffffff', font: (d.layers.find((l) => l.type === 'text') || {}).font || 'Amiri' })]);
      renderControls(); changed(); return;
    }
    if (b.dataset.utdel) { S.st.userTexts = (S.st.userTexts || []).filter((t) => t.id !== b.dataset.utdel); renderControls(); changed(); return; }
    const utCard = b.closest('[data-ut]');
    if (utCard && (b.dataset.utalign || b.dataset.utorient || b.dataset.swatch)) {
      const t = userText(utCard.dataset.ut);
      if (b.dataset.utalign) { t.justify = b.dataset.utalign === 'justify'; if (!t.justify) t.align = b.dataset.utalign; }
      else if (b.dataset.utorient) {
        // تدوير الخانة مع الاتجاه حتى يبقى النص داخل الكعب
        const wasV = t.orient !== 'h', isV = b.dataset.utorient !== 'h';
        t.orient = b.dataset.utorient;
        if (wasV !== isV) { const { w } = Core.canvasDims(d.canvas); const cy = t.box.y + t.box.h / 2; const nh = isV ? Math.round(Core.canvasDims(d.canvas).h * 0.35) : 160; t.box = { x: 8, y: Math.round(cy - nh / 2), w: w - 16, h: nh }; }
      } else if (b.dataset.swatch !== Core.ORIGINAL) t.color = b.dataset.swatch;
      renderControls(); changed(); return;
    }
    if (b.dataset.uvmode || b.dataset.uvdel) {
      const [lid, vid] = (b.dataset.uvmode || b.dataset.uvdel).split(':');
      const list = (S.st.userVariants || {})[lid] || [];
      const v = list.find((x) => x.id === vid);
      if (b.dataset.uvmode && v) v.mode = v.mode === 'none' ? 'overlay' : 'none';
      if (b.dataset.uvdel) {
        S.st.userVariants[lid] = list.filter((x) => x.id !== vid);
        if (S.st.variant && S.st.variant[lid] === vid) delete S.st.variant[lid];
      }
      renderControls(); changed(); return;
    }
    if (b.dataset.cfit) { S.st.custom.fit = b.dataset.cfit; renderControls(); changed(); return; }
    if (b.dataset.cdel != null) { delete S.st.custom; renderControls(); changed(); return; }
    if (b.dataset.variant) {
      const [lid, vid] = b.dataset.variant.split(':');
      Core.setUserVariant(ED(), S.st, lid, vid);
      renderControls(); changed();
    } else if (b.dataset.swatch) {
      Core.setUserColor(d, S.st, b.closest('[data-key]').dataset.key, b.dataset.swatch);
      renderControls(); changed();
    } else if (b.dataset.vstep) {
      S.st.volume = Math.max(1, Math.min(999, (resolved().volume || 1) + +b.dataset.vstep));
      renderControls(); changed();
    } else if (b.dataset.font) {
      const t = textState(b.dataset.font);
      t.font = b.dataset.family;
      const f = availableFonts().find((x) => x.family === t.font);
      const lay = d.layers.find((x) => x.id === b.dataset.font);
      if (f && !f.weights.includes(lay.weight)) t.weight = f.weights.includes(700) ? 700 : f.weights[f.weights.length - 1];
      else delete t.weight;
      renderControls(); changed();
      const det = $(`[data-text="${b.dataset.font}"] details`, controls);
      if (det) det.open = true;
    } else if (b.dataset.sadd) {
      const l = d.layers.find((x) => x.id === b.dataset.sadd);
      const ss = currentStrokes(l);
      if (ss.length < Core.MAX_STROKES) {
        const id = 'us' + Math.random().toString(36).slice(2, 8);
        ss.push({ id, width: 3 });
        S.st.colors = S.st.colors || {};
        S.st.colors['T:' + l.id + ':s:' + id] = ss.length % 2 ? '#000000' : '#ffffff';
      }
      renderControls(); changed();
    } else if (b.dataset.sdel) {
      const [lid, i] = b.dataset.sdel.split(':');
      currentStrokes(d.layers.find((x) => x.id === lid)).splice(+i, 1);
      renderControls(); changed();
    } else if (b.dataset.resetpos) {
      const t = textState(b.dataset.resetpos);
      t.dx = 0; t.dy = 0;
      renderControls(); changed();
    } else if (b.dataset.act === 'reset') {
      if (!confirm('إعادة التصميم إلى إعداداته الأصلية؟')) return;
      S.st = Core.emptyState(d);
      applyData();
      renderControls(); changed();
    } else if (b.dataset.act === 'download') download(b);
    else if (b.dataset.act === 'apply') apply();
  });

  controls.addEventListener('input', (e) => {
    const el = e.target;
    const d = S.d;
    const utCard = el.closest('[data-ut]');
    if (utCard && (el.dataset.utf || el.dataset.colorpick)) {
      const t = userText(utCard.dataset.ut);
      if (el.dataset.colorpick) t.color = el.value;
      else if (el.dataset.utf === 'text' || el.dataset.utf === 'font') t[el.dataset.utf] = el.value;
      else {
        t[el.dataset.utf] = +el.value;
        const o = el.previousElementSibling && el.previousElementSibling.querySelector('output');
        if (o) o.textContent = Core.toIndic(el.dataset.utf === 'lineHeight' ? (+el.value).toFixed(2) : el.value);
      }
      changed();
      return;
    }
    if (el.dataset.colorpick) {
      Core.setUserColor(d, S.st, el.dataset.colorpick, el.value);
      $$(`[data-key="${CSS.escape(el.dataset.colorpick)}"] .swatch.on`, controls).forEach((x) => x.classList.remove('on'));
      changed();
    } else if (el.dataset.textval) {
      const t = textState(el.dataset.textval);
      t.text = el.value; t.edited = true;
      changed();
    } else if (el.dataset.tsize) {
      textState(el.dataset.tsize).size = +el.value;
      changed();
    } else if (el.dataset.swidth) {
      const [lid, i] = el.dataset.swidth.split(':');
      currentStrokes(d.layers.find((x) => x.id === lid))[+i].width = +el.value;
      el.nextElementSibling.textContent = el.value + 'px';
      changed();
    } else if (el.dataset.volnum != null) {
      S.st.volume = Math.max(1, Math.min(999, +el.value || 1));
      const vt = d.layers.find((l) => l.role === 'volume');
      const pre = $('.vol-pre', controls);
      if (pre && vt) pre.textContent = Core.formatVolume(vt, S.st.volume);
      changed();
    }
  });

  controls.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.cupload != null) { const f = el.files[0]; el.value = ''; if (f) useCustomImage(f); return; }
    if (el.dataset.uvup) { const f = el.files[0]; el.value = ''; if (f) addUserVariant(el.dataset.uvup, f); return; }
    if (el.dataset.utbold != null) { const t = userText(el.closest('[data-ut]').dataset.ut); t.weight = el.checked ? 700 : 400; changed(); return; }
    if (el.closest('[data-ut]')) { if (el.dataset.colorpick) renderControls(); return; }
    if (el.dataset.ckeep) { S.st.custom[el.dataset.ckeep] = el.checked; changed(); return; }
    if (el.dataset.volon != null) { S.st.volumeOn = el.checked; renderControls(); changed(); }
    else if (el.dataset.showlayer) { S.st.hidden = S.st.hidden || {}; S.st.hidden[el.dataset.showlayer] = !el.checked; changed(); }
    else if (el.dataset.texthide) { textState(el.dataset.texthide).hidden = !el.checked; changed(); }
    else if (el.dataset.colorpick) renderControls();
  });

  /** صورة المستخدم: تُصغَّر محلياً (حتى 2600 بكسل) ولا تُرفع إلى الخادم */
  function useCustomImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 2600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      S.st.custom = { src: c.toDataURL('image/jpeg', 0.92), fit: 'cover', keepTexts: false, keepVolume: true };
      renderControls();
      changed();
      toast('صارت صورتك هي الغلاف');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('تعذّرت قراءة الصورة', true); };
    img.src = url;
  }

  /**
   * صورة المستخدم بديلاً في طبقة: الصورة الشفافة (PNG بخلفية شفافة) «شكلٌ» يأخذ لون الطبقة،
   * وغيرها «صورة» بألوانها. تُصغَّر محلياً (حتى ٢٠٠٠ بكسل) ولا تُرفع إلى الخادم.
   */
  function addUserVariant(layerId, file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, c.width, c.height);
      let alpha = false;
      try {
        const px = g.getImageData(0, 0, c.width, c.height).data;
        const step = Math.max(4, Math.floor(px.length / 4 / 40000) * 4);
        for (let i = 3; i < px.length; i += step) if (px[i] < 245) { alpha = true; break; }
      } catch (_) { /* لا شيء */ }
      let src;
      if (alpha) src = c.toDataURL('image/png');
      else {
        const j = document.createElement('canvas');
        j.width = c.width; j.height = c.height;
        const jg = j.getContext('2d');
        jg.fillStyle = '#fff'; jg.fillRect(0, 0, j.width, j.height); jg.drawImage(c, 0, 0);
        src = j.toDataURL('image/jpeg', 0.9);
      }
      const layer = S.d.layers.find((l) => l.id === layerId);
      const base = layer.variants.find((v) => v.id === layer.defVariant) || layer.variants[0];
      const { w: W, h: H } = Core.canvasDims(S.d.canvas);
      const full = base.x <= 1 && base.y <= 1 && base.w >= W - 1 && base.h >= H - 1;
      const ar = c.width / c.height;
      // الصورة في طبقة بحجم الغلاف: تملؤه (وتُقصّ أطرافها)، والشكل يُحتوى في خانة الطبقة كاملاً
      const fit = !alpha && full ? Math.max : Math.min;
      const s = fit(base.w / c.width, base.h / c.height);
      const w = c.width * s, h = c.height * s;
      // وضعها كما اختاره المالك لهذه الطبقة في «المجلِّد» (userFit، والأصل: في خانة الصورة الأصلية)
      // استبدالٌ كما في Word: صورة المستخدم بألوانها كما هي (لا تُصبغ بلون الصورة الأصلية ولو كانت شفافة)، في موضع الأصل وحجمه بلا تشويه
      // (وزرّ «صورة/شكل» بجانبها يجعلها شكلاً يأخذ لون الطبقة إن أراد)
      const v = { id: 'uv' + Math.random().toString(36).slice(2, 9), label: 'صورتك', src, mode: 'none', fit: layer.userFit || 'slot',
        x: Math.round(base.x + (base.w - w) / 2), y: Math.round(base.y + (base.h - h) / 2), w: Math.round(w), h: Math.round(h), iw: c.width, ih: c.height };
      if (!(ar > 0)) return;
      S.st.userVariants = S.st.userVariants || {};
      S.st.userVariants[layerId] = (S.st.userVariants[layerId] || []).concat([v]);
      S.st.variant = S.st.variant || {};
      S.st.variant[layerId] = v.id;
      renderControls();
      changed();
      toast('وُضعت صورتك مكان الصورة الأصلية وبحجمها');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('تعذّرت قراءة الصورة', true); };
    img.src = url;
  }

  async function download(btn) {
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = 'جارٍ التجهيز…';
    try {
      const blob = await R.exportBlob(ED(), resolved(), { data: S.data, spineCm: spineCm() });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'غلاف-' + (S.data.title || S.d.name) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) { toast('تعذّر التنزيل', true); }
    btn.disabled = false;
    btn.innerHTML = old;
  }

  /** اعتماد الغلاف: يُسلَّم للموقع الأساسي (sessionStorage + postMessage + حدث) */
  function apply() {
    const payload = { type: 'warraq-cover', kind: (S.d && S.d.kind) || KIND, designId: S.d.id, designName: S.d.name, state: S.st, at: Date.now() };
    store('warraq.cover', payload);
    try { if (window.parent !== window) window.parent.postMessage(payload, location.origin); } catch (_) { /* لا نافذة أم */ }
    window.dispatchEvent(new CustomEvent('warraq-cover', { detail: payload }));
    toast('اعتُمد الغلاف «' + S.d.name + '»');
  }

  /* ------------------------------------------------------------ */
  setView(pref('covers.view') === 'strip' ? 'strip' : 'grid');
  if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'warraq-cover-ready' }, location.origin);
  loadList().then(route).catch(() => { $('#gallery').innerHTML = '<p class="muted empty-g">تعذّر تحميل التصاميم.</p>'; });
})();
