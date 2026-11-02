/* لوحة المالك — استوديو الأغلفة */
(function () {
  'use strict';
  const Core = window.CoverCore;
  const R = window.CoverRender;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dpr = () => Math.min(2.5, window.devicePixelRatio || 1);
  const round = (n) => Math.round(n * 10) / 10;

  $$('[data-ic]').forEach((el) => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)));

  /* ------------------------------------------------------------ */
  /* الاتصال بالخادم                                               */
  /* ------------------------------------------------------------ */
  async function api(method, url, body, raw) {
    const o = { method, headers: {} };
    if (method !== 'GET') o.headers['x-warraq'] = '1';
    if (raw) {
      o.body = raw.body;
      o.headers['x-filename'] = encodeURIComponent(raw.name || '');
      o.headers['content-type'] = raw.type || 'application/octet-stream';
    } else if (body) {
      o.body = JSON.stringify(body);
      o.headers['content-type'] = 'application/json';
    }
    const r = await fetch(url, o);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'خطأ ' + r.status), { status: r.status });
    return j;
  }
  const upload = (file) => api('POST', '/api/admin/covers/upload', null, { body: file, name: file.name, type: file.type });

  let toastT = 0;
  function toast(msg, warn) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('warn', !!warn);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const fail = (e) => toast(e.message || String(e), true);

  /* ------------------------------------------------------------ */
  /* الحالة                                                        */
  /* ------------------------------------------------------------ */
  const S = {
    designs: [], fonts: { builtin: [], uploaded: [] }, allFonts: Core.BUILTIN_FONTS, disabledFonts: [],
    d: null, saved: '', sel: null, filter: 'all', tab: 'design',
    hist: [], fut: [], zoom: 1, scale: 1, moveAll: true,
    pv: { variant: {}, volumeOn: true, volume: 1 },
    lastRS: null, linker: null,
    kind: 'front', pvSpine: null, safe: (() => { try { return localStorage.getItem('covers.safe') === '1'; } catch (_) { return false; } })(),
    // خطوط الإرشاد: v مواضع الخطوط العمودية (x)، و h مواضع الأفقية (y)، بوحدات المحرر
    guides: { h: [], v: [] }, guidesOn: (() => { try { return localStorage.getItem('covers.guidesOn') !== '0'; } catch (_) { return true; } })(),
  };
  const STAGE_HINT = 'انقر عنصراً لتحديده، واسحبه لتحريكه. الأسهم للتحريك الدقيق (Shift ×١٠). اسحب من المسطرة خط إرشاد، وأعده إليها لتحذفه (Ctrl+؛ يظهرها ويخفيها، و Alt يوقف الالتصاق).';
  // الكعب في «معاينة بعرض آخر»: اللوحة بعرضه المعاين (والتحرير موقوف حتى العودة للطبيعي)
  const spinePreview = () => !!(S.d && S.d.kind === 'spine' && S.pvSpine && Math.abs(S.pvSpine - S.d.canvas.widthCm) > 0.001);
  const dims = () => Core.canvasDims(spinePreview() ? Object.assign({}, S.d.canvas, { widthCm: S.pvSpine }) : S.d.canvas);
  const KIND_HINTS = {
    front: 'وجه الكتاب: اسمه ومؤلفه وخانة رقم المجلد.',
    back: 'ظهر الكتاب: يُبنى ويُضبط كالغلاف الأمامي تماماً، وفيه عادةً نبذة عن الكتاب واسم الدار.',
    spine: 'الكعب: يُصمَّم على عرض طبيعي تختاره، ثم يُمطّ أو يُضكّ تلقائياً بحسب سماكة كل كتاب.',
  };
  const layerById = (id) => S.d && S.d.layers.find((l) => l.id === id);
  const selLayer = () => (S.sel ? layerById(S.sel) : null);
  const rs = () => Core.resolveState(S.d, { variant: S.pv.variant, volumeOn: S.pv.volumeOn, volume: S.pv.volume }, { admin: true });
  const dirty = () => !!S.d && JSON.stringify(S.d) !== S.saved;
  // خطوط الموقع (من لوحة التحكم ← الخطوط) + ما رُفع قديماً إلى الاستوديو
  const allFonts = () => S.allFonts
    .concat((S.fonts.site || []).map((f) => ({ family: f.family, label: f.label || f.family, weights: f.weights || [400, 700], uploaded: true })))
    .concat(S.fonts.uploaded.filter((f, i, a) => a.findIndex((x) => x.family === f.family) === i).map((f) => ({ family: f.family, label: f.label || f.family, weights: S.fonts.uploaded.filter((x) => x.family === f.family).map((x) => x.weight || 400), uploaded: true })))
    // البرنامج: خطوط الجهاز
    .concat((S.fonts.system || []).map((f) => ({ family: f.family, label: f.label || f.family, weights: f.weights || [400], uploaded: true, system: true, arabic: f.arabic, pinned: !!f.pinned })));

  function updateDirty() {
    const dd = dirty();
    $('#dirty').textContent = dd ? '● تغييرات غير محفوظة' : 'محفوظ';
    $('#dirty').classList.toggle('on', dd);
    $('#undoBtn').disabled = S.hist.length < 2;
    $('#redoBtn').disabled = !S.fut.length;
  }

  function commit() {
    if (!S.d) return;
    S.d.links = Core.cleanLinks(S.d, S.d.links);
    S.d.book = Core.cleanBook(S.d, S.d.book);
    const snap = JSON.stringify(S.d);
    if (S.hist[S.hist.length - 1] !== snap) {
      S.hist.push(snap);
      if (S.hist.length > 100) S.hist.shift();
      S.fut = [];
    }
    updateDirty();
  }
  function restore(snap) {
    S.d = JSON.parse(snap);
    if (S.sel && !layerById(S.sel)) S.sel = null;
    $('#nameInp').value = S.d.name;
    refreshAll();
  }
  function undo() { if (S.hist.length < 2) return; S.fut.push(S.hist.pop()); restore(S.hist[S.hist.length - 1]); }
  function redo() { if (!S.fut.length) return; const s = S.fut.pop(); S.hist.push(s); restore(s); }

  function refreshAll() {
    renderLayers();
    renderProps();
    layoutCanvas();
    if (S.tab === 'links' && S.linker) S.linker.render();
    if (S.tab === 'settings') renderSettings();
    updateDirty();
  }

  /* ------------------------------------------------------------ */
  /* التوجيه                                                       */
  /* ------------------------------------------------------------ */
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  function route() {
    const m = /^#\/edit\/([\w-]+)/.exec(location.hash);
    const km = /^#\/(back|spine|links)\/?$/.exec(location.hash);
    if (!m) S.kind = km ? km[1] : 'front';
    const onErr = (e) => {
      if (e.status === 401 || e.status === 404) {
        // بلا جلسة مالك: الاستوديو تابع للوحة التحكم
        document.body.innerHTML = `<div style="max-width:460px;margin:12vh auto;text-align:center" class="card"><div style="padding:28px"><h2 style="font-family:var(--display)">استوديو الأغلفة</h2><p class="muted">سجّل الدخول إلى دار ابن فقيه أولاً، ثم افتح الاستوديو من تبويب «استوديو الأغلفة».</p><a class="btn primary" href="/admin/">دار ابن فقيه</a></div></div>`;
      } else fail(e);
    };
    if (m) openEditor(m[1]).catch(onErr);
    else showList().catch(onErr);
  }

  async function loadMeta() {
    const j = await api('GET', '/api/admin/covers');
    S.designs = j.designs;
    S.fonts = j.fonts;
    S.allFonts = j.allFonts || Core.BUILTIN_FONTS;
    S.disabledFonts = j.disabledFonts || [];
    R.registerFonts(S.fonts.uploaded);
  }

  /* ------------------------------------------------------------ */
  /* قائمة التصاميم                                                */
  /* ------------------------------------------------------------ */
  async function showList() {
    if (S.d && dirty()) {
      if (!confirm('في التصميم تغييرات غير محفوظة. هل تغادر دون حفظ؟')) { history.replaceState(null, '', '#/edit/' + S.d.id); return; }
    }
    S.d = null;
    $('#editView').classList.add('hidden');
    $('#listView').classList.remove('hidden');
    document.title = 'استوديو الأغلفة — دار ابن فقيه';
    await loadMeta();
    const links = S.kind === 'links';
    $$('#kindTabs [data-kind]').forEach((a) => a.setAttribute('aria-selected', String(a.dataset.kind === S.kind)));
    $('#designsSec').classList.toggle('hidden', links);
    $('.fonts-sec').classList.toggle('hidden', links);
    $('#bundlesSec').classList.toggle('hidden', !links);
    $('#newDesign').classList.toggle('hidden', links);
    for (const k of Core.KIND_LIST) $(`[data-kcount="${k}"]`).textContent = Core.toIndic(S.designs.filter((d) => (d.kind || 'front') === k).length);
    if (links) {
      if (window.CoverBundles) await window.CoverBundles.show($('#bundles'), { api, toast, fail, upload, designs: S.designs, thumbHTML, unzipFiles, importDesignDoc, designZipFiles, safeFile, reload: async () => { await loadMeta(); return S.designs; } });
      return;
    }
    $('#kindTitle').textContent = 'تصاميم ' + Core.KINDS[S.kind];
    $('#kindHint').textContent = KIND_HINTS[S.kind] || '';
    $('#newDesign').lastChild.textContent = ' ' + (S.kind === 'spine' ? 'كعب جديد' : S.kind === 'back' ? 'غلاف خلفي جديد' : 'تصميم جديد');
    renderGrid();
    renderFonts();
  }
  const kindList = () => S.designs.filter((d) => (d.kind || 'front') === S.kind);

  const thumbHTML = (d) => (d.thumb ? `<img src="${esc(d.thumb)}" alt="" loading="lazy">` : R.fallbackThumb(d));

  function renderGrid() {
    const list = kindList();
    $('#designCount').textContent = list.length ? `${list.length} تصميم · ${list.filter((d) => d.published).length} منشور` : '';
    if (!list.length) {
      $('#designGrid').innerHTML = `<div class="empty card"><h3>لا تصاميم بعد</h3><p class="muted">ابدأ بتصميم جديد: ستجد خانات الصور والنصوص جاهزة بأسمائها، ترفع الصور وتضع النصوص ثم تنشره.</p><button class="btn primary" data-act="new">${ic('plus')} ${S.kind === 'spine' ? 'كعب جديد' : 'تصميم جديد'}</button></div>`;
      return;
    }
    $('#designGrid').innerHTML = list.map((d) => `
      <article class="dcard" data-id="${d.id}" draggable="true" title="اسحبه لتغيّر موضعه">
        <a class="thumb" href="#/edit/${d.id}" draggable="false" title="تحرير">${thumbHTML(d).replace('<img ', '<img draggable="false" ')}</a>
        <div class="dmeta">
          <b title="${esc(d.name)}">${esc(d.name)}</b>
          <span class="chip ${d.published ? 'ok' : ''}">${d.published ? 'منشور' : 'مسودة'}</span>
        </div>
        <div class="dact">
          <a class="btn sm" href="#/edit/${d.id}">تحرير</a>
          <button class="ibtn" data-act="pub" title="${d.published ? 'إخفاء عن المستخدمين' : 'نشر للمستخدمين'}">${ic(d.published ? 'eyeOff' : 'eye')}</button>
          <button class="ibtn" data-act="dup" title="نسخ">${ic('copy')}</button>
          <button class="ibtn danger" data-act="del" title="حذف">${ic('trash')}</button>
        </div>
      </article>`).join('');
  }

  $('#designGrid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'new') return newDesign();
    const id = b.closest('[data-id]').dataset.id;
    const list = kindList();
    const i = list.findIndex((d) => d.id === id);
    try {
      if (b.dataset.act === 'pub') {
        const { design } = await api('GET', '/api/admin/covers/' + id);
        design.published = !design.published;
        await api('PUT', '/api/admin/covers/' + id, { design });
        toast(design.published ? 'نُشر التصميم للمستخدمين' : 'أُخفي التصميم');
      } else if (b.dataset.act === 'dup') {
        await api('POST', '/api/admin/covers/' + id + '/duplicate');
        toast('نُسخ التصميم (مسودة)');
      } else if (b.dataset.act === 'del') {
        if (!confirm(`حذف التصميم «${list[i].name}» نهائياً؟`)) return;
        await api('DELETE', '/api/admin/covers/' + id);
        toast('حُذف التصميم');
      }
      await loadMeta();
      renderGrid();
    } catch (err) { fail(err); }
  });

  /* الترتيب بالسحب (كاستوديو الأساليب): تُسحب البلاطة إلى حيث يُراد، فتنزاح البلاطات لها، ويُحفظ الترتيب حين تُفلت */
  let dragEl = null;
  let dragFrom = '';
  const gridIds = () => [...$('#designGrid').querySelectorAll('.dcard[data-id]')].map((x) => x.dataset.id);
  $('#designGrid').addEventListener('dragstart', (e) => {
    const el = e.target.closest && e.target.closest('.dcard[data-id][draggable="true"]');
    if (!el) return;
    dragEl = el;
    dragFrom = gridIds().join(',');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-warraq-cover', el.dataset.id);
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  $('#designGrid').addEventListener('dragover', (e) => {
    if (!dragEl) return;
    const over = e.target.closest('.dcard[data-id]');
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!over || over === dragEl) return;
    const cards = [...$('#designGrid').querySelectorAll('.dcard[data-id]')];
    if (cards.indexOf(over) > cards.indexOf(dragEl)) over.after(dragEl);
    else over.before(dragEl);
  });
  $('#designGrid').addEventListener('drop', (e) => { if (dragEl) e.preventDefault(); });
  $('#designGrid').addEventListener('dragend', async () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl = null;
    const shownIds = gridIds();
    if (shownIds.join(',') === dragFrom) return;
    // تصاميم هذا التبويب تأخذ خاناتها نفسها في الترتيب الكامل بترتيبها الجديد
    const shown = new Set(shownIds);
    let k = 0;
    const ids = S.designs.map((d) => (shown.has(d.id) ? shownIds[k++] : d.id));
    try {
      await api('POST', '/api/admin/covers/order', { ids });
    } catch (err) { fail(err); }
    await loadMeta().catch(fail);
    renderGrid();
  });

  async function newDesign() {
    const kind = Core.KIND_LIST.includes(S.kind) ? S.kind : 'front';
    const def = kind === 'spine' ? 'كعب جديد' : kind === 'back' ? 'غلاف خلفي جديد' : 'تصميم جديد';
    const name = prompt('اسم التصميم (يظهر للمستخدم):', def);
    if (name == null) return;
    try {
      const { design } = await api('POST', '/api/admin/covers', { name: name.trim() || def, kind });
      location.hash = '#/edit/' + design.id;
    } catch (e) { fail(e); }
  }
  $('#newDesign').addEventListener('click', newDesign);

  /* الخطوط */
  function renderFonts() {
    const sample = 'بسم الله الرحمن الرحيم';
    const b = S.allFonts.map((f) => `
      <div class="font-row">
        <span class="font-sample" style="font-family:'${esc(f.family)}'">${sample}</span>
        <span class="font-name">${esc(f.label)} <small class="muted">${esc(f.family)}</small></span>
        <label class="sw small" title="إتاحته للمستخدم"><span>متاح</span><input type="checkbox" data-font-toggle="${esc(f.family)}" ${S.disabledFonts.includes(f.family) ? '' : 'checked'}></label>
      </div>`).join('');
    const u = S.fonts.uploaded.map((f, i) => `
      <div class="font-row up">
        <span class="font-sample" style="font-family:'${esc(f.family)}'">${sample}</span>
        <span class="font-name">${esc(f.label || f.family)} <small class="chip">مرفوع · ${f.weight}</small></span>
        <button class="ibtn danger" data-font-del="${i}" title="حذف">${ic('trash')}</button>
      </div>`).join('');
    const site = (S.fonts.site || []).map((f) => `
      <div class="font-row up">
        <span class="font-sample" style="font-family:'${esc(f.family)}'">${sample}</span>
        <span class="font-name">${esc(f.label || f.family)} <small class="chip">خط مضاف</small></span>
        <span></span>
      </div>`).join('');
    $('#fontList').innerHTML = site + u + b;
  }
  async function saveFonts() {
    const j = await api('PUT', '/api/admin/covers/fonts', { uploaded: S.fonts.uploaded, disabled: S.disabledFonts });
    S.fonts = j;
    R.registerFonts(j.uploaded);
    renderFonts();
  }
  $('#fontList').addEventListener('change', (e) => {
    const f = e.target.dataset.fontToggle;
    if (!f) return;
    S.disabledFonts = e.target.checked ? S.disabledFonts.filter((x) => x !== f) : S.disabledFonts.concat(f);
    saveFonts().catch(fail);
  });
  $('#fontList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-font-del]');
    if (!b) return;
    S.fonts.uploaded.splice(+b.dataset.fontDel, 1);
    saveFonts().then(() => toast('حُذف الخط'), fail);
  });
  /* ------------------------------------------------------------ */
  /* المحرر                                                        */
  /* ------------------------------------------------------------ */
  async function openEditor(id) {
    if (S.d && S.d.id === id) return;
    if (!S.designs.length) await loadMeta();
    const { design } = await api('GET', '/api/admin/covers/' + id);
    S.d = Core.normalizeDesign(design);
    S.saved = JSON.stringify(S.d);
    S.hist = [S.saved];
    S.fut = [];
    S.sel = null;
    S.zoom = 1;
    S.pv = { variant: {}, volumeOn: S.d.volume.on, volume: S.d.volume.sample || 1 };
    S.kind = S.d.kind;
    S.pvSpine = null;
    $('#kindChip').textContent = Core.KINDS[S.d.kind];
    $('#kindChip').dataset.kind = S.d.kind;
    $('#spinePv').classList.toggle('hidden', S.d.kind !== 'spine');
    $('#pvSafe').checked = S.safe;
    $('#pvGuides').checked = S.guidesOn;
    loadGuides();
    syncSpinePv();
    $('#listView').classList.add('hidden');
    $('#editView').classList.remove('hidden');
    $('#nameInp').value = S.d.name;
    $('#pvVolume').checked = S.pv.volumeOn;
    $('#pvVolNum').value = S.pv.volume;
    document.title = S.d.name + ' — استوديو الأغلفة';
    setTab('design');
    refreshAll();
  }

  $('#backBtn').addEventListener('click', () => { location.hash = '#/' + (S.d && S.d.kind !== 'front' ? S.d.kind : ''); });
  $('#nameInp').addEventListener('input', (e) => { S.d.name = e.target.value; updateDirty(); });
  $('#nameInp').addEventListener('change', commit);
  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#saveBtn').addEventListener('click', () => save().catch(fail));
  $('#previewBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const w = window.open('about:blank', '_blank');
    try {
      if (dirty()) await save();
      if (w) w.location = '/covers/?preview=1#d=' + S.d.id;
    } catch (err) { if (w) w.close(); fail(err); }
  });

  async function save() {
    const { design } = await api('PUT', '/api/admin/covers/' + S.d.id, { design: S.d });
    S.d = design;
    S.saved = JSON.stringify(design);
    S.hist[S.hist.length - 1] = S.saved;
    updateDirty();
    toast('حُفظ التصميم');
  }

  document.addEventListener('keydown', (e) => {
    if (!S.d || $('#editView').classList.contains('hidden')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save().catch(fail); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (S.tab !== 'design') return;
    // Ctrl+; كما في فوتوشوب (بالمفتاح نفسه: «ك» في اللوحة العربية)
    if (mod && e.code === 'Semicolon') { e.preventDefault(); setGuidesOn(!S.guidesOn); return; }
    const l = selLayer();
    if (!l) return;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d && !l.lock) {
      e.preventDefault();
      moveLayer(l, d[0], d[1], null);
      requestRender();
      clearTimeout(keyCommitT);
      keyCommitT = setTimeout(() => { commit(); renderProps(); }, 400);
    }
    if (e.key === 'Escape') select(null);
  });
  let keyCommitT = 0;

  function setTab(t) {
    S.tab = t;
    $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    $$('.pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t));
    if (t === 'links') {
      if (!S.linker) S.linker = CoverLinker.create($('#linker'), { getDesign: () => S.d, commit, changed: () => { updateDirty(); }, toast });
      S.linker.render();
    }
    if (t === 'settings') renderSettings();
    if (t === 'design') { layoutCanvas(); renderLayers(); renderProps(); }
  }
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  /* ------------------------------------------------------------ */
  /* اللوحة (Canvas)                                               */
  /* ------------------------------------------------------------ */
  const cv = $('#cv');
  const overlay = $('#overlay');
  const selBox = $('#sel');
  selBox.innerHTML = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((h) => `<i class="h h-${h}" data-h="${h}"></i>`).join('') + '<span class="sel-label"></span>';

  function layoutCanvas() {
    if (!S.d || S.tab !== 'design') return;
    const { w, h } = dims();
    const st = $('#stage');
    const fit = Math.max(0.05, Math.min((st.clientWidth - 56) / w, (st.clientHeight - 56) / h));
    S.scale = fit * S.zoom;
    cv.width = Math.round(w * S.scale * dpr());
    cv.height = Math.round(h * S.scale * dpr());
    $('#canvasBox').style.width = w * S.scale + 'px';
    $('#canvasBox').style.height = h * S.scale + 'px';
    $('#canvasBox').classList.toggle('previewing', spinePreview());
    drawSafe();
    drawGuides();
    requestRender();
  }

  /** حدود هامش الأمان: خط متقطع على بعده من الحواف (لا يدخل في الغلاف نفسه) */
  function drawSafe() {
    const g = $('#safeGuide');
    if (!S.d || !S.safe || !(S.d.canvas.safeMm > 0)) { g.classList.add('hidden'); return; }
    const { w } = dims();
    const cm = spinePreview() ? S.pvSpine : S.d.canvas.widthCm;
    const px = (S.d.canvas.safeMm / 10) * (w / cm) * S.scale;
    g.style.inset = px + 'px';
    g.classList.remove('hidden');
    g.dataset.label = 'هامش الأمان ' + Core.toIndic(S.d.canvas.safeMm) + ' مم';
  }
  $('#pvSafe').addEventListener('change', (e) => {
    S.safe = e.target.checked;
    try { localStorage.setItem('covers.safe', S.safe ? '1' : '0'); } catch (_) { /* لا تخزين */ }
    drawSafe();
  });

  /* ------------------------------------------------------------ */
  /* المساطر وخطوط الإرشاد (كما في فوتوشوب)                         */
  /* ------------------------------------------------------------ */
  // تُحفظ لكل تصميم في هذا الجهاز، ولا تدخل في الغلاف ولا في ملفه
  const guidesKey = () => 'covers.guides.' + S.d.id;
  function loadGuides() {
    S.guides = { h: [], v: [] };
    try {
      const g = JSON.parse(localStorage.getItem(guidesKey()) || 'null');
      if (g && Array.isArray(g.h) && Array.isArray(g.v)) S.guides = { h: g.h.filter(Number.isFinite), v: g.v.filter(Number.isFinite) };
    } catch (_) { /* لا تخزين */ }
  }
  function saveGuides() {
    try { localStorage.setItem(guidesKey(), JSON.stringify(S.guides)); } catch (_) { /* لا تخزين */ }
  }
  const guidesShown = () => !!S.d && S.guidesOn && !spinePreview();
  const unitsPerCm = () => dims().w / (spinePreview() ? S.pvSpine : S.d.canvas.widthCm);
  const cmText = (u) => Core.toIndic(String(+(u / unitsPerCm()).toFixed(2))) + ' سم';

  function setGuidesOn(on) {
    S.guidesOn = on;
    $('#pvGuides').checked = on;
    try { localStorage.setItem('covers.guidesOn', on ? '1' : '0'); } catch (_) { /* لا تخزين */ }
    drawGuides();
  }
  $('#pvGuides').addEventListener('change', (e) => setGuidesOn(e.target.checked));

  function drawGuides() {
    const on = guidesShown();
    ['#guides', '#rulerH', '#rulerV'].forEach((s) => $(s).classList.toggle('hidden', !on));
    ['#addGuideH', '#addGuideV', '#clearGuides'].forEach((s) => ($(s).disabled = !on));
    $('#clearGuides').disabled = !on || !(S.guides.h.length + S.guides.v.length);
    if (!on) return;
    $('#guides').innerHTML =
      S.guides.h.map((y, i) => `<div class="guide gh" data-g="h" data-i="${i}" style="top:${y * S.scale}px" title="${cmText(y)} من الأعلى"></div>`).join('') +
      S.guides.v.map((x, i) => `<div class="guide gv" data-g="v" data-i="${i}" style="left:${x * S.scale}px" title="${cmText(x)} من اليسار"></div>`).join('');
    drawRulers();
  }

  /** مسطرتان بالسنتيمتر: فوق الغلاف وعن يمينه */
  function drawRulers() {
    const { w, h } = dims();
    const per = unitsPerCm() * S.scale; // بكسل لكل سنتيمتر على الشاشة
    const step = [0.5, 1, 2, 5, 10, 20].find((s) => per * s >= 34) || 50;
    const minor = per * step / 10 >= 5 ? step / 10 : per * step / 5 >= 5 ? step / 5 : step / 2;
    const k = dpr();
    const near = (v, m) => Math.abs(v / m - Math.round(v / m)) < 1e-6;
    for (const horiz of [true, false]) {
      const el = $(horiz ? '#rulerH' : '#rulerV');
      const len = (horiz ? w : h) * S.scale;
      const cw = horiz ? len : 18, ch = horiz ? 18 : len;
      el.width = Math.round(cw * k);
      el.height = Math.round(ch * k);
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      const c = el.getContext('2d');
      c.setTransform(k, 0, 0, k, 0, 0);
      c.fillStyle = '#f7f5f0';
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = '#a39b88';
      c.fillStyle = '#5c5546';
      c.lineWidth = 1;
      c.font = '600 9.5px Tajawal, sans-serif';
      c.direction = 'ltr';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.beginPath();
      // المسطرة الأفقية تلامس الغلاف بحافتها السفلى، والعمودية بحافتها اليسرى
      if (horiz) { c.moveTo(0, 17.5); c.lineTo(cw, 17.5); } else { c.moveTo(0.5, 0); c.lineTo(0.5, ch); }
      const lenCm = len / per;
      for (let i = 0; i * minor <= lenCm + 1e-6; i++) {
        const cm = i * minor;
        const p = Math.round(cm * per) + 0.5;
        const major = near(cm, step);
        const t = major ? 18 : near(cm, step / 2) ? 8 : 4;
        if (horiz) { c.moveTo(p, 18); c.lineTo(p, 18 - t); } else { c.moveTo(0, p); c.lineTo(t, p); }
        if (major && i > 0) {
          const txt = Core.toIndic(String(+cm.toFixed(1)));
          if (horiz) c.fillText(txt, p + 3, 1);
          else { c.save(); c.translate(17, p + 3); c.rotate(Math.PI / 2); c.fillText(txt, 0, 0); c.restore(); }
        }
      }
      c.stroke();
    }
  }

  /** أهداف الالتصاق على محور: حواف الغلاف ومنتصفه وخطوط الإرشاد */
  function snapTargets(axis) {
    const { w, h } = dims();
    const L = axis === 'v' ? w : h;
    const t = [0, L / 2, L];
    if (guidesShown()) t.push(...S.guides[axis]);
    return t;
  }
  /** أقرب التصاق لأيٍّ من القيم (ضمن ٦ بكسل على الشاشة)، ويُظهر خطه الوردي */
  function snapTo(vals, axis, targets) {
    const th = 6 / S.scale;
    let best = null;
    for (const v of vals) for (const t of targets || snapTargets(axis)) {
      const d = t - v;
      if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
    }
    if (best) {
      const g = $(axis === 'v' ? '#guideV' : '#guideH');
      g.style[axis === 'v' ? 'left' : 'top'] = best.at * S.scale + 'px';
      g.classList.remove('hidden');
    }
    return best;
  }
  const hideSnap = () => { $('#guideV').classList.add('hidden'); $('#guideH').classList.add('hidden'); };

  /** سحب خط: جديد من المسطرة، أو موجود لتحريكه. ما أُفلت خارج الغلاف حُذف */
  function dragGuide(e, axis, i) {
    e.preventDefault();
    e.stopPropagation();
    const tip = $('#guideTip');
    const isNew = i == null;
    if (isNew) { S.guides[axis].push(-1); i = S.guides[axis].length - 1; drawGuides(); }
    const el = $(`#guides [data-g="${axis}"][data-i="${i}"]`);
    el.classList.add('on');
    const { w, h } = dims();
    const L = axis === 'v' ? w : h;
    const v0 = S.guides[axis][i];
    let val = v0;
    const c0 = { x: e.clientX, y: e.clientY };
    let moved = isNew;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - c0.x, ev.clientY - c0.y) < 3) return;
      moved = true;
      const p = toDesign(ev);
      val = axis === 'v' ? p.x : p.y;
      const out = val < -4 / S.scale || val > L + 4 / S.scale;
      hideSnap();
      if (!out && !ev.altKey) {
        // يلتصق بحواف الغلاف ومنتصفه وبحواف العنصر المحدد ومنتصفه
        const t = [0, L / 2, L];
        const l = selLayer();
        if (l && S.lastRS && R.isShown(l, S.lastRS)) {
          const b = R.bounds(S.d, S.lastRS, l);
          if (axis === 'v') t.push(b.x, b.x + b.w / 2, b.x + b.w); else t.push(b.y, b.y + b.h / 2, b.y + b.h);
        }
        const f = snapTo([val], axis, t);
        if (f) val += f.d;
        hideSnap();
      }
      val = round(val);
      el.style[axis === 'v' ? 'left' : 'top'] = val * S.scale + 'px';
      el.classList.toggle('gone', out);
      tip.classList.toggle('gone', out);
      tip.textContent = out ? 'أفلِت للحذف' : cmText(val);
      const r = overlay.getBoundingClientRect();
      tip.style.left = ev.clientX - r.left + 'px';
      tip.style.top = ev.clientY - r.top + 'px';
      tip.classList.remove('hidden');
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      tip.classList.add('hidden');
      // نقرةٌ بلا تحريك: لا يُعاد رسم الخطوط (فيصل النقر المزدوج للحذف إلى الخط نفسه)
      if (!isNew && val === v0) { el.classList.remove('on'); return; }
      if (ev.type === 'pointercancel' || val < -4 / S.scale || val > L + 4 / S.scale) S.guides[axis].splice(i, 1);
      else S.guides[axis][i] = Math.min(L, Math.max(0, val));
      saveGuides();
      drawGuides();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    if (isNew) move(e);
  }
  $('#rulerH').addEventListener('pointerdown', (e) => { if (e.button === 0 && guidesShown()) dragGuide(e, 'h'); });
  $('#rulerV').addEventListener('pointerdown', (e) => { if (e.button === 0 && guidesShown()) dragGuide(e, 'v'); });
  $('#guides').addEventListener('pointerdown', (e) => {
    const g = e.target.closest('[data-g]');
    if (!g || e.button !== 0) return;
    dragGuide(e, g.dataset.g, +g.dataset.i);
  });
  $('#guides').addEventListener('dblclick', (e) => {
    const g = e.target.closest('[data-g]');
    if (!g) return;
    e.stopPropagation();
    S.guides[g.dataset.g].splice(+g.dataset.i, 1);
    saveGuides();
    drawGuides();
  });
  function addGuide(axis) {
    const { w, h } = dims();
    const L = axis === 'v' ? w : h;
    // في المنتصف، وإن كان فيه خط فبعده بسنتيمتر
    let v = round(L / 2);
    while (S.guides[axis].some((x) => Math.abs(x - v) < 0.5) && v < L) v = round(v + unitsPerCm());
    S.guides[axis].push(Math.min(L, v));
    saveGuides();
    drawGuides();
  }
  $('#addGuideH').addEventListener('click', () => addGuide('h'));
  $('#addGuideV').addEventListener('click', () => addGuide('v'));
  $('#clearGuides').addEventListener('click', () => {
    if (!(S.guides.h.length + S.guides.v.length) || !confirm('حذف كل خطوط الإرشاد في هذا التصميم؟')) return;
    S.guides = { h: [], v: [] };
    saveGuides();
    drawGuides();
  });

  /** معاينة الكعب بعرض كتاب آخر */
  function syncSpinePv() {
    if (!S.d || S.d.kind !== 'spine') return;
    const r = $('#pvSpine');
    const n = S.d.canvas.widthCm;
    r.min = String(Math.max(0.3, Math.round(n * 0.3 * 10) / 10));
    r.max = String(Math.max(n * 2.5, 4).toFixed(1));
    r.value = String(S.pvSpine || n);
    const cur = S.pvSpine || n;
    $('#pvSpineOut').textContent = Core.toIndic(cur.toFixed(1)) + ' سم' + (spinePreview() ? (cur > n ? ' · مُطّ' : S.d.spine.fitNarrow === 'crop' ? ' · قُصّت أطرافه' : ' · ضُكّ') : ' · الطبيعي');
    $('#pvSpineReset').disabled = !spinePreview();
    $('#stageHint').textContent = spinePreview() ? 'معاينة فقط: هكذا يظهر الكعب في كتاب بهذا العرض. عُد إلى «الطبيعي» لتحرير التصميم.' : STAGE_HINT;
  }
  $('#pvSpine').addEventListener('input', (e) => {
    const v = +e.target.value;
    S.pvSpine = Math.abs(v - S.d.canvas.widthCm) < 0.05 ? null : v;
    if (S.pvSpine) select(null);
    syncSpinePv();
    layoutCanvas();
  });
  $('#pvSpineReset').addEventListener('click', () => { S.pvSpine = null; syncSpinePv(); layoutCanvas(); });
  new ResizeObserver(() => layoutCanvas()).observe($('#stage'));
  $('#zoomIn').addEventListener('click', () => { S.zoom = Math.min(4, S.zoom * 1.25); layoutCanvas(); });
  $('#zoomOut').addEventListener('click', () => { S.zoom = Math.max(0.3, S.zoom / 1.25); layoutCanvas(); });
  $('#zoomFit').addEventListener('click', () => { S.zoom = 1; layoutCanvas(); });
  $('#pvVolume').addEventListener('change', (e) => { S.pv.volumeOn = e.target.checked; requestRender(); });
  $('#pvVolNum').addEventListener('input', (e) => { S.pv.volume = Math.max(1, +e.target.value || 1); requestRender(); });

  let rq = 0, rtok = 0;
  function requestRender() { cancelAnimationFrame(rq); rq = requestAnimationFrame(doRender); }
  async function doRender() {
    if (!S.d) return;
    const tok = ++rtok;
    const st = rs();
    await R.prepare(S.d, st);
    if (tok !== rtok || !S.d) return;
    R.draw(cv, S.d, st, { scale: S.scale * dpr(), placeholders: true, spineCm: spinePreview() ? S.pvSpine : null });
    S.lastRS = st;
    drawSel();
  }

  function drawSel() {
    const l = selLayer();
    if (!l || !S.lastRS || !R.isShown(l, S.lastRS) || spinePreview()) { selBox.classList.add('hidden'); return; }
    const b = R.bounds(S.d, S.lastRS, l);
    Object.assign(selBox.style, { left: b.x * S.scale + 'px', top: b.y * S.scale + 'px', width: b.w * S.scale + 'px', height: b.h * S.scale + 'px' });
    selBox.classList.remove('hidden');
    selBox.classList.toggle('locked', !!l.lock);
    selBox.classList.toggle('text', l.type === 'text');
    selBox.querySelector('.sel-label').textContent = (l.lock ? '🔒 ' : '') + l.name;
  }

  function select(id) {
    S.sel = id;
    renderLayers();
    renderProps();
    drawSel();
  }

  const toDesign = (e) => {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left) / S.scale, y: (e.clientY - r.top) / S.scale };
  };
  const inside = (b, p) => p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;

  function boxesOf(l) {
    if (l.type === 'text') return [l.box];
    const active = R.activeVariant(l, rs());
    return S.moveAll ? l.variants : [active];
  }
  function moveLayer(l, dx, dy) {
    for (const b of boxesOf(l)) { b.x = round(b.x + dx); b.y = round(b.y + dy); }
  }

  let drag = null;
  overlay.addEventListener('pointerdown', (e) => {
    if (!S.d || e.button !== 0 || spinePreview()) return;
    const p = toDesign(e);
    const h = e.target.dataset.h;
    let l = selLayer();
    const st = S.lastRS || rs();
    if (!(h && l && !l.lock)) {
      if (!(l && !l.lock && R.isShown(l, st) && inside(R.bounds(S.d, st, l), p))) {
        l = R.hitTest(S.d, st, p.x, p.y, (x) => !x.lock);
        if (!l) { select(null); return; }
        if (l.id !== S.sel) select(l.id);
      }
    }
    const b0 = R.bounds(S.d, st, l);
    drag = { l, h: h || null, p0: p, b0, starts: boxesOf(l).map((b) => ({ b, x: b.x, y: b.y, w: b.w, h: b.h })), moved: false };
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!drag) {
      const p = toDesign(e);
      const st = S.lastRS;
      if (!st || !S.d || spinePreview()) { overlay.style.cursor = 'default'; return; }
      const hit = R.hitTest(S.d, st, p.x, p.y, (x) => !x.lock);
      overlay.style.cursor = hit ? 'move' : 'default';
      return;
    }
    const p = toDesign(e);
    let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (!drag.moved && Math.hypot(dx, dy) * S.scale < 2) return;
    drag.moved = true;
    hideSnap();
    const b0 = drag.b0;
    const snap = !e.altKey;
    if (!drag.h) {
      // تحريك + التصاق حواف العنصر ومنتصفه بحواف الغلاف ومنتصفه وخطوط الإرشاد
      if (snap) {
        const fx = snapTo([b0.x + dx, b0.x + dx + b0.w / 2, b0.x + dx + b0.w], 'v');
        const fy = snapTo([b0.y + dy, b0.y + dy + b0.h / 2, b0.y + dy + b0.h], 'h');
        if (fx) dx += fx.d;
        if (fy) dy += fy.d;
      }
      for (const s of drag.starts) { s.b.x = round(s.x + dx); s.b.y = round(s.y + dy); }
    } else {
      // تغيير المقاس: تلتصق الحافة المسحوبة وحدها
      if (snap) {
        const fx = drag.h.includes('e') ? snapTo([b0.x + b0.w + dx], 'v') : drag.h.includes('w') ? snapTo([b0.x + dx], 'v') : null;
        const fy = drag.h.includes('s') ? snapTo([b0.y + b0.h + dy], 'h') : drag.h.includes('n') ? snapTo([b0.y + dy], 'h') : null;
        if (fx) dx += fx.d;
        if (fy) dy += fy.d;
      }
      const keep = drag.l.type === 'image' && drag.h.length === 2;
      const ar = drag.b0.w / drag.b0.h;
      for (const s of drag.starts) {
        let { x, y, w, h } = s;
        if (drag.h.includes('e')) w = Math.max(8, s.w + dx);
        if (drag.h.includes('w')) { w = Math.max(8, s.w - dx); x = s.x + s.w - w; }
        if (drag.h.includes('s')) h = Math.max(8, s.h + dy);
        if (drag.h.includes('n')) { h = Math.max(8, s.h - dy); y = s.y + s.h - h; }
        if (keep) {
          const nh = w / ar;
          if (drag.h.includes('n')) y = s.y + s.h - nh;
          h = nh;
        }
        Object.assign(s.b, { x: round(x), y: round(y), w: round(w), h: round(h) });
      }
    }
    requestRender();
  });

  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    hideSnap();
    if (moved) { commit(); renderProps(); }
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);
  overlay.addEventListener('dblclick', () => {
    const l = selLayer();
    if (l && l.type === 'text') { const t = $('#props [data-p="text"]'); if (t) { t.focus(); t.select(); } }
  });

  /* ------------------------------------------------------------ */
  /* لوحة الطبقات                                                  */
  /* ------------------------------------------------------------ */
  function layerSub(l) {
    if (l.type === 'text') return l.role === 'volume' ? Core.formatVolume(l, S.pv.volume) : l.text.slice(0, 28);
    const n = l.variants.length;
    const up = l.variants.filter((v) => v.src).length;
    return n > 1 ? `${n} بدائل · ${up}/${n} مرفوعة` : up ? 'مرفوعة' : 'بانتظار الصورة';
  }

  function renderLayers() {
    if (!S.d) return;
    const items = S.d.layers.slice().reverse().filter((l) => S.filter === 'all' || l.section === S.filter);
    $('#layers').innerHTML = items.map((l) => {
      const missing = l.type === 'image' && l.variants.some((v) => !v.src);
      return `<li data-id="${l.id}" draggable="true" class="${l.id === S.sel ? 'sel' : ''} ${l.visible ? '' : 'off'}">
        <span class="grip" title="اسحب لتغيير الترتيب">${ic('grip')}</span>
        <span class="lt-ic ${l.section}">${ic(l.type === 'image' ? 'image' : 'type')}</span>
        <span class="lt-name"><b>${esc(l.name)}</b><small>${missing ? '<em class="warn-dot" title="صور ناقصة"></em>' : ''}${esc(layerSub(l))}</small></span>
        ${l.type === 'image' && !l.tint ? '' : `<span class="lt-sw ${l.color ? '' : 'orig'}" style="${l.color ? 'background:' + l.color : ''}" title="${l.color ? l.color : 'ألوان الصورة الأصلية'}"></span>`}
        <button class="ibtn ${l.lock ? 'on' : ''}" data-lock title="${l.lock ? 'مقفلة في المحرر (لا تُسحب بالخطأ)' : 'قفل في المحرر'}">${ic(l.lock ? 'lock' : 'unlock')}</button>
        <button class="ibtn" data-eye title="${l.visible ? 'ظاهرة افتراضياً' : 'مخفية افتراضياً'}">${ic(l.visible ? 'eye' : 'eyeOff')}</button>
      </li>`;
    }).join('') || '<li class="empty muted small">لا طبقات في هذا القسم</li>';
    const l = selLayer();
    const idx = l ? S.d.layers.indexOf(l) : -1;
    $('#upBtn').disabled = !l || idx === S.d.layers.length - 1;
    $('#downBtn').disabled = !l || idx === 0;
    $('#dupBtn').disabled = $('#delBtn').disabled = !l;
  }

  $('#layers').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const l = layerById(li.dataset.id);
    if (e.target.closest('[data-eye]')) { l.visible = !l.visible; commit(); renderLayers(); requestRender(); return; }
    if (e.target.closest('[data-lock]')) { l.lock = !l.lock; commit(); renderLayers(); drawSel(); return; }
    select(l.id);
  });

  // سحب وإفلات لترتيب الطبقات (الأعلى في القائمة = الأعلى في الغلاف)
  let dragId = null;
  $('#layers').addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    dragId = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    li.classList.add('dragging');
  });
  $('#layers').addEventListener('dragover', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li || !dragId) return;
    e.preventDefault();
    const r = li.getBoundingClientRect();
    const above = e.clientY < r.top + r.height / 2;
    $$('#layers li').forEach((x) => x.classList.remove('drop-above', 'drop-below'));
    li.classList.add(above ? 'drop-above' : 'drop-below');
  });
  $('#layers').addEventListener('dragend', () => { dragId = null; $$('#layers li').forEach((x) => x.classList.remove('drop-above', 'drop-below', 'dragging')); });
  $('#layers').addEventListener('drop', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li || !dragId || li.dataset.id === dragId) return;
    e.preventDefault();
    const above = li.classList.contains('drop-above');
    const moving = layerById(dragId);
    S.d.layers.splice(S.d.layers.indexOf(moving), 1);
    const ti = S.d.layers.indexOf(layerById(li.dataset.id));
    S.d.layers.splice(above ? ti + 1 : ti, 0, moving);
    commit();
    renderLayers();
    requestRender();
  });

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    S.filter = b.dataset.f;
    $$('#filters button').forEach((x) => x.classList.toggle('on', x === b));
    renderLayers();
  });

  function shift(dir) {
    const l = selLayer();
    if (!l) return;
    const i = S.d.layers.indexOf(l), j = i + dir;
    if (j < 0 || j >= S.d.layers.length) return;
    [S.d.layers[i], S.d.layers[j]] = [S.d.layers[j], S.d.layers[i]];
    commit(); renderLayers(); requestRender();
  }
  $('#upBtn').addEventListener('click', () => shift(1));
  $('#downBtn').addEventListener('click', () => shift(-1));
  $('#dupBtn').addEventListener('click', () => {
    const l = selLayer();
    if (!l) return;
    const c = Core.clone(l);
    c.id = Core.uid(l.type === 'image' ? 'L' : 'T');
    c.name = l.name + ' (نسخة)';
    if (c.variants) { const map = {}; c.variants.forEach((v) => { const n = Core.uid('v'); map[v.id] = n; v.id = n; }); c.defVariant = map[l.defVariant]; }
    if (c.strokes) c.strokes.forEach((s) => (s.id = Core.uid('s')));
    S.d.layers.splice(S.d.layers.indexOf(l) + 1, 0, c);
    commit(); select(c.id); requestRender();
  });
  $('#delBtn').addEventListener('click', () => {
    const l = selLayer();
    if (!l || !confirm(`حذف الطبقة «${l.name}»؟`)) return;
    S.d.layers.splice(S.d.layers.indexOf(l), 1);
    S.sel = null;
    commit(); renderLayers(); renderProps(); requestRender();
  });

  // قائمة الإضافة
  $('#addMenu').innerHTML = `
    <button data-add="image:cover">${ic('image')} طبقة صور — قسم الخلفية</button>
    <button data-add="image:slot">${ic('image')} طبقة صور — قسم الخانة</button>
    <hr>
    <button data-add="text:cover">${ic('type')} نص — قسم الخلفية</button>
    <button data-add="text:slot">${ic('type')} نص — قسم الخانة</button>`;
  // القائمة فوق كل شيء (موضع ثابت محسوب من الزر)، فلا تقصّها لوحة الطبقات ولا حافة النافذة
  function placeMenu() {
    const m = $('#addMenu');
    const r = $('#addLayerBtn').getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 6) + 'px';
    m.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    m.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 16) + 'px';
  }
  $('#addLayerBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('#addMenu');
    m.classList.toggle('hidden');
    if (!m.classList.contains('hidden')) placeMenu();
  });
  document.addEventListener('click', () => $('#addMenu').classList.add('hidden'));
  window.addEventListener('resize', () => $('#addMenu').classList.add('hidden'));
  $('.layers-panel').addEventListener('scroll', () => $('#addMenu').classList.add('hidden'), true);
  $('#addMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const [type, section] = b.dataset.add.split(':');
    const { w: W, h: H } = dims();
    let l;
    if (type === 'image') {
      l = Core.makeImageLayer({ section, name: section === 'slot' ? 'خانة: طبقة جديدة' : 'طبقة جديدة', variants: [Core.makeVariant({ label: 'أساسي', w: W, h: H })] });
    } else {
      l = Core.makeTextLayer({ section, name: 'نص جديد', text: 'نص جديد', box: { x: (W - 500) / 2, y: H / 2 - 60, w: 500, h: 120 } });
    }
    S.d.layers.push(l);
    commit(); select(l.id); requestRender();
  });

  /* رفع مجموعة صور بمطابقة الأسماء */
  const normName = (s) => String(s || '').replace(/\.[a-z0-9]+$/i, '').replace(/ـ/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '').replace(/[_\-]+/g, ' ').replace(/\s*\(\d+\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const IMG_RE = /\.(png|jpe?g|webp|gif|svg)$/i;
  const bareName = (n) => String(n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const byName = (a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true });

  /** تنفيذ مهامّ بالتوازي (أسرع من رفع الصور واحدة بعد أخرى) */
  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k], k); } catch (err) { out[k] = { error: err }; }
      }
    }));
    return out;
  }

  /** إدراج صور في التصميم المفتوح: المطابِق لاسم خانة يدخلها، والباقي طبقات جديدة بأسماء الملفات */
  async function addImages(list) {
    const files = Array.from(list || []).filter((f) => IMG_RE.test(f.name) || /^image\//.test(f.type)).sort(byName);
    if (!files.length) return toast('لا صور في ما اخترت', true);
    const variants = [];
    S.d.layers.forEach((l) => l.type === 'image' && l.variants.forEach((v) => variants.push({ l, v, n: normName(v.name) })));
    toast(`جارٍ رفع ${files.length} صورة…`);
    const res = await pool(files, 4, (f) => upload(f));
    const { w: W, h: H } = dims();
    let filled = 0, added = 0, last = null;
    const miss = [];
    files.forEach((f, i) => {
      const r = res[i];
      if (!r || r.error || r.kind !== 'image') { miss.push(f.name); return; }
      const m = variants.find((x) => x.n && x.n === normName(f.name));
      if (m) { applyUpload(m.l, m.v, r); filled++; return; }
      const name = bareName(f.name);
      const l = Core.makeImageLayer({ section: 'cover', name, variants: [Core.makeVariant({ label: 'أساسي', name, w: W, h: H })] });
      applyUpload(l, l.variants[0], r);
      // صورة أصغر من الغلاف (شعار، زخرفة): تبقى بحجمها في الوسط ولا تُمطّ
      const v0 = l.variants[0];
      if (r.w && r.h && r.w < W && r.h < H && !(v0.x === 0 && v0.y === 0 && v0.w === W && v0.h === H)) {
        Object.assign(v0, { w: r.w, h: r.h, x: round((W - r.w) / 2), y: round((H - r.h) / 2) });
      }
      // فوق آخر طبقة صور في قسم الخلفية، وتحت النصوص
      let at = -1;
      S.d.layers.forEach((x, k) => { if (x.type === 'image' && x.section === 'cover') at = k; });
      S.d.layers.splice(at + 1, 0, l);
      variants.push({ l, v: l.variants[0], n: normName(name) });
      added++; last = l;
    });
    commit(); renderLayers(); renderProps(); requestRender();
    if (last) select(last.id);
    const parts = [];
    if (added) parts.push(`${added} طبقة جديدة بأسماء ملفاتها`);
    if (filled) parts.push(`${filled} صورة دخلت خاناتها`);
    if (miss.length) parts.push(`تعذّر: ${miss.slice(0, 3).join('، ')}${miss.length > 3 ? '…' : ''}`);
    toast(parts.join(' · ') || 'لم يُضف شيء', !!miss.length);
  }
  for (const id of ['#bulkUpload', '#bulkDir']) {
    $(id).addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) addImages(files).catch(fail);
    });
  }

  /* ------------------------------------------------------------ */
  /* ملف الغلاف: تنزيله ثم وضعه لاحقاً فيعود التصميم كما هو         */
  /* ------------------------------------------------------------ */
  const COVER_FORMAT = 'warraq-cover';
  const safeFile = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

  /** كل موضع في التصميم يحمل صورة: [الكائن، المفتاح، الاسم المقترح] */
  function mediaRefs(d) {
    const refs = [];
    if (d.thumb) refs.push([d, 'thumb', 'الصورة الخارجية']);
    (d.layers || []).forEach((l) => {
      if (l.type !== 'image') return;
      (l.variants || []).forEach((v) => { if (v.src) refs.push([v, 'src', v.name || `${l.name} ${v.label || ''}`]); });
    });
    return refs;
  }

  /** ملفات تصميم واحد داخل ملف مضغوط: cover.json وصوره (prefix: مجلد داخل الملف، للحِزم) */
  async function designZipFiles(design, prefix) {
    prefix = prefix || '';
    const d = JSON.parse(JSON.stringify(design));
    const files = [];
    const used = new Map();   // رابط الصورة ← اسمها في الملف
    const taken = new Set();
    for (const [o, k, label] of mediaRefs(d)) {
      const src = o[k];
      if (!/^\/covers-media\//.test(src)) continue;
      if (!used.has(src)) {
        const r = await fetch(src);
        if (!r.ok) { o[k] = ''; continue; }
        const ext = (src.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1];
        const base = safeFile(label) || 'صورة';
        let name = `images/${base}.${ext}`;
        for (let n = 2; taken.has(name); n++) name = `images/${base} (${n}).${ext}`;
        taken.add(name);
        used.set(src, name);
        files.push({ name: prefix + name, data: new Uint8Array(await r.arrayBuffer()) });
      }
      o[k] = used.get(src);
    }
    delete d.id;
    const doc = { format: COVER_FORMAT, version: 1, name: d.name, kind: d.kind || 'front', savedAt: new Date().toISOString(), design: d };
    files.unshift({ name: prefix + 'cover.json', data: JSON.stringify(doc, null, 2) });
    return files;
  }

  async function exportCover() {
    if (dirty()) await save();
    const { makeZip } = await import('/shared/zip.js');
    toast('جارٍ تجهيز ملف الغلاف…');
    const files = await designZipFiles(S.d);
    const d = S.d;
    const blob = new Blob([makeZip(files)], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `غلاف - ${safeFile(d.name) || 'تصميم'}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('نُزّل ملف الغلاف (الصور + إعدادات النصوص)');
  }
  $('#exportBtn').addEventListener('click', () => exportCover().catch(fail));

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

  /** قراءة ملف ‎.zip إلى خريطة: المسار ← File */
  async function unzipFiles(file) {
    const { zipEntries, inflateRawBrowser } = await import('/shared/docx-import.js');
    let entries;
    try { entries = zipEntries(new Uint8Array(await file.arrayBuffer())); } catch (e) { throw new Error('الملف ليس ملف غلاف صالحاً'); }
    const out = new Map();
    for (const [name, e] of entries) {
      if (name.endsWith('/')) continue;
      const data = e.method === 8 ? await inflateRawBrowser(e.data) : e.data;
      const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      out.set(name, new File([data], name.replace(/^.*\//, ''), { type: MIME[ext] || 'application/octet-stream' }));
    }
    return out;
  }

  /** إنشاء تصميم من cover.json وملفاته ← { design, lost } (base: مجلد التصميم داخل ملف الحزمة) */
  async function importDesignDoc(text, files, base, kind) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error('cover.json غير مقروء'); }
    const d = doc && doc.format === COVER_FORMAT ? doc.design : (doc && doc.design) || doc;
    if (!d || !Array.isArray(d.layers) || !d.canvas) throw new Error('هذا ليس ملف غلاف من «ورّاق»');
    base = base || '';
    const find = (ref) => {
      if (base && files.has(base + ref)) return files.get(base + ref);
      if (files.has(ref)) return files.get(ref);
      const tail = ref.replace(/^.*\//, '');
      if (base) for (const [k, f] of files) if (k.startsWith(base) && (k.endsWith('/' + ref) || k.endsWith('/' + tail))) return f;
      for (const [k, f] of files) if (k === tail || k.endsWith('/' + ref) || k.endsWith('/' + tail)) return f;
      return null;
    };
    const refs = mediaRefs(d).filter(([o, k]) => !/^\/covers-media\//.test(o[k]));
    const uniq = [...new Set(refs.map(([o, k]) => o[k]))];
    toast(`جارٍ استيراد الغلاف (${uniq.length} صورة)…`);
    const up = await pool(uniq, 4, async (ref) => { const f = find(ref); return f ? upload(f) : null; });
    const url = new Map();
    let lost = 0;
    uniq.forEach((ref, i) => { const r = up[i]; if (r && r.url) url.set(ref, r.url); else lost++; });
    refs.forEach(([o, k]) => { o[k] = url.get(o[k]) || ''; });
    delete d.id;
    if (!d.kind && doc && doc.kind) d.kind = doc.kind;
    if (kind) d.kind = kind;
    d.published = !!(base && d.published);
    const { design } = await api('POST', '/api/admin/covers', { design: d });
    return { design, lost };
  }
  /** نوع ما يُستورد: صفحة الغلاف الخلفي أو الكعب المفتوحة تجعله منها، وفي صفحة الأمامي يبقى نوع الملف */
  const importKind = () => (S.kind === 'back' || S.kind === 'spine' ? S.kind : '');
  async function importCoverDoc(text, files) {
    const { design, lost } = await importDesignDoc(text, files, '', importKind());
    toast('عاد الغلاف بنصوصه ومواضعها' + (lost ? ` · ${lost} صورة لم توجد في الملف` : ''), !!lost);
    location.hash = '#/edit/' + design.id;
  }

  /** مجلّد صور بلا cover.json ← تصميم جديد، كل صورة طبقة باسمها */
  async function designFromImages(files, name) {
    const { design } = await api('POST', '/api/admin/covers', { name: (name || 'تصميم من مجلّد').slice(0, 80), kind: importKind() || 'front' });
    await openEditor(design.id);
    history.replaceState(null, '', '#/edit/' + design.id);
    await addImages(files);
    await save();
  }

  $('#impFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (/\.json$/i.test(f.name)) return await importCoverDoc(await f.text(), new Map());
      const files = await unzipFiles(f);
      // ملف حزمة وُضع هنا: يُستورد حزمةً
      if ([...files.keys()].some((k) => /(^|\/)bundle\.json$/i.test(k)) && window.CoverBundles) {
        await window.CoverBundles.importFile(f, { api, toast, unzipFiles, importDesignDoc, upload });
        location.hash = '#/links';
        return;
      }
      const key = [...files.keys()].find((k) => /(^|\/)cover\.json$/i.test(k));
      if (key) return await importCoverDoc(await files.get(key).text(), files);
      const imgs = [...files.values()].filter((x) => IMG_RE.test(x.name));
      if (!imgs.length) throw new Error('لا cover.json ولا صور في هذا الملف');
      await designFromImages(imgs, bareName(f.name));
    } catch (err) { fail(err); }
  });
  $('#impBundle').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !window.CoverBundles) return;
    try {
      await window.CoverBundles.importFile(f, { api, toast, unzipFiles, importDesignDoc, upload });
      if (S.kind === 'links') await showList(); else location.hash = '#/links';
    } catch (err) { fail(err); }
  });
  $('#impDir').addEventListener('change', async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    try {
      const files = new Map(list.map((f) => [String(f.webkitRelativePath || f.name).replace(/^[^/]+\//, ''), f]));
      const key = [...files.keys()].find((k) => /(^|\/)cover\.json$/i.test(k));
      if (key) return await importCoverDoc(await files.get(key).text(), files);
      const imgs = list.filter((x) => IMG_RE.test(x.name));
      if (!imgs.length) throw new Error('لا صور في هذا المجلّد');
      await designFromImages(imgs, String(list[0].webkitRelativePath || '').split('/')[0]);
    } catch (err) { fail(err); }
  });

  function applyUpload(l, v, r) {
    v.src = r.url;
    v.iw = r.w; v.ih = r.h;
    if (!v.name && r.original) v.name = r.original.replace(/\.[^.]+$/, '');
    const { w: W, h: H } = dims();
    if (!r.w || !r.h) return;
    // بديلٌ في خانة الصورة الأصلية أو قناعٌ عليها: موضعه وحجمه من الأصل (ويُحفظ كذلك في أرقامه)
    const ref = l.variants.find((x) => x.id === l.defVariant) || l.variants[0];
    if (ref && ref !== v && (v.fit === 'slot' || v.fit === 'mask')) {
      const k = (v.fit === 'slot' ? Math.min : Math.max)(ref.w / r.w, ref.h / r.h);
      Object.assign(v, { w: round(r.w * k), h: round(r.h * k), x: round(ref.x + (ref.w - r.w * k) / 2), y: round(ref.y + (ref.h - r.h * k) / 2) });
      return;
    }
    const ar = r.w / r.h, car = W / H;
    if (Math.abs(ar - car) / car < 0.012) { Object.assign(v, { x: 0, y: 0, w: W, h: H }); return; }
    const full = v.x === 0 && v.y === 0 && v.w === W && v.h === H;
    if (!full) { const cy = v.y + v.h / 2; v.h = round(v.w / ar); v.y = round(cy - v.h / 2); return; }
    if (l.section === 'slot') {
      const vt = S.d.layers.find((x) => x.type === 'text' && x.section === 'slot');
      const cx = vt ? vt.box.x + vt.box.w / 2 : W / 2, cy = vt ? vt.box.y + vt.box.h / 2 : H * 0.75;
      const w = W * 0.28;
      Object.assign(v, { w: round(w), h: round(w / ar), x: round(cx - w / 2), y: round(cy - w / ar / 2) });
    } else {
      let w = W, h = W / ar;
      if (h > H) { h = H; w = H * ar; }
      Object.assign(v, { w: round(w), h: round(h), x: round((W - w) / 2), y: round((H - h) / 2) });
    }
  }

  /* ------------------------------------------------------------ */
  /* لوحة الخصائص                                                  */
  /* ------------------------------------------------------------ */
  const props = $('#props');
  const sw = (p, label, checked, hint) => `<label class="sw" ${hint ? `title="${esc(hint)}"` : ''}><span>${label}</span><input type="checkbox" data-p="${p}" ${checked ? 'checked' : ''}></label>`;
  const numF = (p, label, v, attrs) => `<label class="field"><span>${label}</span><input class="inp" type="number" data-p="${p}" value="${v}" ${attrs || ''}></label>`;

  function linkedChips(key) {
    const g = Core.groupOf(S.d, key).filter((t) => t.key !== key);
    if (!g.length) return `<button class="link-note" data-act="go-links">${ic('link')} غير مرتبط — اربطه بعنصر آخر</button>`;
    return `<div class="linked">${ic('link')}<span>مرتبط بـ:</span>${g.map((t) => `<span class="chip ${t.section}">${esc(t.label)}${t.sub ? ' · ' + esc(t.sub) : ''}</span>`).join('')}<button class="link-note" data-act="go-links">تعديل</button></div>`;
  }

  const hexLabel = (c) => c || 'ألوان الصورة الأصلية';
  function colorRow(key, color, label) {
    const img = key.startsWith('L:');
    return `<div class="color-row"><label class="color ${color ? '' : 'orig'}"><input type="color" value="${color || '#808080'}" data-color="${key}"></label><div><b class="small">${label}</b><code class="muted small" data-hex="${key}">${hexLabel(color)}</code></div>
      ${img && color ? `<button class="btn sm ghost" data-act="orig" data-key="${key}" title="إلغاء الصبغ وإظهار الصورة بألوانها">↺ الأصلي</button>` : ''}</div>${linkedChips(key)}`;
  }

  function renderProps() {
    if (!S.d) return;
    const l = selLayer();
    if (!l) { props.innerHTML = overviewHTML(); return; }
    props.innerHTML = l.type === 'image' ? imageProps(l) : textProps(l);
  }

  function overviewHTML() {
    const imgs = S.d.layers.filter((l) => l.type === 'image');
    const missing = imgs.reduce((n, l) => n + l.variants.filter((v) => !v.src).length, 0);
    const total = imgs.reduce((n, l) => n + l.variants.length, 0);
    return `<div class="pp">
      <h3>خطوات التصميم</h3>
      <ol class="steps">
        <li class="${missing ? '' : 'done'}"><b>ارفع الصور</b><span>${total - missing}/${total} مرفوعة. اختر طبقة وارفع صورة كل بديل، أو استعمل «رفع بالأسماء» لتوزيع الصور على خاناتها بأسماء ملفاتها.</span></li>
        <li><b>ضع النصوص</b><span>اختر نصاً واسحبه إلى موضعه على الغلاف، وغيّر عرض خانته من المقابض. سيظهر للمستخدم في الموضع نفسه تلقائياً.</span></li>
        <li class="${S.d.links.length ? 'done' : ''}"><b>اربط الألوان</b><span>من تبويب «الربط»: ${S.d.links.length} ربط حالياً.</span></li>
        <li><b>حدد ما يتحكم به المستخدم</b><span>لكل طبقة قسم «صلاحيات المستخدم».</span></li>
        <li class="${S.d.published ? 'done' : ''}"><b>انشر وأضف الصورة الخارجية</b><span>من تبويب «الإعدادات».</span></li>
      </ol>
      <p class="muted small">الطبقات المقفلة (${ic('lock')}) لا تُسحب على اللوحة، ويمكن تحديدها من قائمة الطبقات.</p>
    </div>`;
  }

  function permBox(title, inner) { return `<details class="pp-sec" open><summary>${title}</summary><div class="pp-body">${inner}</div></details>`; }

  function imageProps(l) {
    const st = rs();
    const av = R.activeVariant(l, st);
    const { w: W, h: H } = dims();
    const variants = l.variants.map((v, i) => `
      <div class="variant ${v.id === av.id ? 'shown' : ''}" data-vid="${v.id}">
        <label class="vthumb checker" title="انقر أو اسحب صورة هنا">
          ${v.src ? `<img src="${esc(v.src)}" alt="">` : `<span>${ic('upload')}<small>رفع</small></span>`}
          <input type="file" accept="image/*,.svg" data-vupload="${v.id}" hidden>
        </label>
        <div class="vbody">
          <div class="row"><input class="inp sm" data-p="variants.${i}.label" value="${esc(v.label)}" placeholder="اسم الخيار للمستخدم" title="اسم الخيار كما يراه المستخدم"></div>
          <input class="inp sm muted-inp" data-p="variants.${i}.name" value="${esc(v.name)}" placeholder="اسم الملف (للرفع بالأسماء)" title="اسم الصورة — يُستعمل في «رفع بالأسماء»">
          <select class="inp sm" data-p="variants.${i}.mode" data-rerender title="طريقة التلوين">
            ${Object.entries(Core.MODES).map(([k, t]) => `<option value="${k}" ${v.mode === k ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <select class="inp sm" data-p="variants.${i}.fit" data-rerender title="وضع الصورة: بالنسبة إلى الغلاف، أو إلى الصورة الأصلية (البديل الافتراضي)">
            ${Object.entries(Core.FITS).filter(([k]) => l.defVariant !== v.id || k === '' || k === 'full').map(([k, t]) => `<option value="${k}" ${(v.fit || '') === k ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <div class="vrow">
            <label class="mini"><input type="radio" name="def-${l.id}" data-act="v-def" ${l.defVariant === v.id ? 'checked' : ''}> الافتراضي</label>
            <label class="mini" title="يظهر للمستخدم ضمن الخيارات"><input type="checkbox" data-p="variants.${i}.offered" ${v.offered ? 'checked' : ''}> خيار للمستخدم</label>
          </div>
          <div class="vrow end">
            ${v.id === av.id ? '<span class="chip ok">معروض</span>' : `<button class="btn sm ghost" data-act="v-show">${ic('eye')} عرض</button>`}
            <button class="ibtn danger" data-act="v-del" title="حذف البديل" ${l.variants.length < 2 ? 'disabled' : ''}>${ic('trash')}</button>
          </div>
        </div>
      </div>`).join('');
    const vi = l.variants.indexOf(av);
    return `<div class="pp">
      <div class="pp-head"><span class="lt-ic ${l.section}">${ic('image')}</span><input class="inp title-inp" data-p="name" value="${esc(l.name)}"></div>
      <label class="field"><span>القسم</span><select class="inp" data-p="section" data-rerender><option value="cover" ${l.section === 'cover' ? 'selected' : ''}>قسم الخلفية</option><option value="slot" ${l.section === 'slot' ? 'selected' : ''}>قسم الخانة (يختفي إذا أوقف المستخدم المجلد)</option></select></label>

      ${permBox(`البدائل (${l.variants.length}) <span class="muted small">— صور يختار المستخدم إحداها</span>`, `${variants}
        <button class="btn sm add-variant" data-act="v-add">${ic('plus')} إضافة بديل</button>`)}

      ${permBox('الموضع والحجم', `
        ${av.fit && (av.fit === 'full' || av.id !== l.defVariant) ? `<p class="muted small">${ic('fit')} موضع هذا البديل من وضعه «${esc(Core.FITS[av.fit])}»${av.fit === 'full' ? '' : '، فيتبع الصورة الأصلية حيث كانت'}؛ والأرقام أدناه لا تُستعمل إلا في «موضعها الخاص».</p>` : ''}
        <p class="muted small">للبديل المعروض${l.variants.length > 1 ? ' · ' : ''}${l.variants.length > 1 ? `<label class="mini"><input type="checkbox" id="moveAll" ${S.moveAll ? 'checked' : ''}> تطبيق على كل البدائل</label>` : ''}</p>
        <div class="grid4">
          ${numF(`variants.${vi}.x`, 'س', av.x, 'step="1"')}${numF(`variants.${vi}.y`, 'ص', av.y, 'step="1"')}
          ${numF(`variants.${vi}.w`, 'العرض', av.w, 'step="1" min="1"')}${numF(`variants.${vi}.h`, 'الارتفاع', av.h, 'step="1" min="1"')}
        </div>
        <div class="row wrap">
          <button class="btn sm" data-act="v-full">${ic('fit')} ملء الغلاف (${W}×${H})</button>
          <button class="btn sm" data-act="v-ratio" ${av.iw ? '' : 'disabled'}>نسبة الصورة الأصلية</button>
          <button class="btn sm" data-act="center-h">${ic('center')} توسيط</button>
        </div>
        <label class="field"><span>الشفافية: ${Math.round(l.opacity * 100)}٪</span><input type="range" min="0" max="1" step="0.01" data-p="opacity" value="${l.opacity}"></label>`)}

      ${permBox('اللون', `
        ${sw('tint', 'تلوين الطبقة', l.tint, 'إن أُوقف تظهر الصورة بألوانها الأصلية')}
        ${l.tint ? colorRow('L:' + l.id, l.color, 'اللون الافتراضي') : '<p class="muted small">الصورة تظهر بألوانها الأصلية دائماً.</p>'}
        <p class="muted small">افتراضياً تظهر الصورة بألوانها الأصلية حتى يختار المستخدم لوناً. السادة: يُصبغ الشكل كله باللون. ذات الطابع: يصير اللون هو لون الطبقة مع بقاء الظلال والنقوش، ويصلح حتى للأبيض والأسود.</p>`)}

      ${permBox(`${ic('lock')} صلاحيات المستخدم`, `
        ${sw('user.variant', 'اختيار البديل', l.user.variant, 'يظهر للمستخدم إن كان هناك أكثر من بديل متاح')}
        ${S.d.allowUserImages ? `<label class="field"><span>صورة المستخدم بديلاً</span><select class="inp" data-p="userFit" title="حين يضع المستخدم صورته بديلاً في هذه الطبقة (في المنضدة أو المحرِّر)">${Core.USER_FITS.map((k) => `<option value="${k}" ${(l.userFit || 'slot') === k ? 'selected' : ''}>${Core.FITS[k]}</option>`).join('')}</select></label>` : ''}
        ${sw('user.color', 'تغيير اللون', l.user.color)}
        ${sw('user.hide', 'إظهار/إخفاء الطبقة', l.user.hide)}
        ${sw('user.move', 'تحريك الصورة', l.user.move, 'الصور ثابتة افتراضياً')}
        <hr>
        ${sw('visible', 'ظاهرة افتراضياً', l.visible)}
        ${sw('lock', 'قفل في المحرر', l.lock, 'تمنع السحب بالخطأ على اللوحة')}`)}
    </div>`;
  }

  function fontOptions(cur) {
    const fonts = allFonts();
    const known = fonts.some((f) => f.family === cur);
    return (known ? '' : `<option value="${esc(cur)}" selected>${esc(cur)} (غير موجود)</option>`) +
      `<optgroup label="مضمّنة">${fonts.filter((f) => !f.uploaded).map((f) => `<option value="${esc(f.family)}" ${f.family === cur ? 'selected' : ''}>${esc(f.label)}${S.disabledFonts.includes(f.family) ? ' (غير متاح للمستخدم)' : ''}</option>`).join('')}</optgroup>` +
      (fonts.some((f) => f.uploaded && !f.system) ? `<optgroup label="الخطوط المضافة">${fonts.filter((f) => f.uploaded && !f.system).map((f) => `<option value="${esc(f.family)}" ${f.family === cur ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</optgroup>` : '') +
      [['خطوط جهازك العربية', (f) => f.system && f.arabic], ['خطوط جهازك الأخرى', (f) => f.system && !f.arabic]]
        .map(([g, ok]) => (fonts.some(ok) ? `<optgroup label="${g}">${fonts.filter(ok).map((f) => `<option value="${esc(f.family)}" ${f.family === cur ? 'selected' : ''} style="font-family:'${esc(f.family)}'">${esc(f.label)}</option>`).join('')}</optgroup>` : ''))
        .join('');
  }

  function textProps(l) {
    const font = allFonts().find((f) => f.family === l.font);
    const weights = font ? font.weights : [400, 700];
    const strokes = l.strokes.map((s, i) => `
      <div class="stroke">
        <span class="snum">${i + 1}</span>
        <label class="color"><input type="color" value="${s.color}" data-color="T:${l.id}:s:${s.id}"></label>
        <label class="field grow"><span>العرض (px)</span><input class="inp" type="number" min="0.5" max="60" step="0.5" data-p="strokes.${i}.width" value="${s.width}"></label>
        <button class="ibtn danger" data-act="s-del" data-sid="${s.id}" title="حذف الحد">${ic('trash')}</button>
      </div>
      ${linkedChips('T:' + l.id + ':s:' + s.id)}`).join('');
    const vol = l.role === 'volume';
    return `<div class="pp">
      <div class="pp-head"><span class="lt-ic ${l.section}">${ic('type')}</span><input class="inp title-inp" data-p="name" value="${esc(l.name)}"></div>
      <div class="grid2">
        <label class="field"><span>الدور</span><select class="inp" data-p="role" data-rerender>${Object.entries(Core.ROLES).map(([k, t]) => `<option value="${k}" ${l.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>القسم</span><select class="inp" data-p="section" data-rerender><option value="cover" ${l.section === 'cover' ? 'selected' : ''}>الخلفية</option><option value="slot" ${l.section === 'slot' ? 'selected' : ''}>الخانة</option></select></label>
      </div>
      ${vol ? `
        <div class="grid2">
          <label class="field"><span>صيغة الرقم</span><select class="inp" data-p="volume.digits" data-rerender>${Object.entries(Core.DIGITS).map(([k, t]) => `<option value="${k}" ${l.volume.digits === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>القالب ({n} = الرقم)</span><input class="inp" data-p="volume.template" value="${esc(l.volume.template)}" placeholder="{n}"></label>
        </div>
        <p class="muted small">يكتب المستخدم رقم المجلد، ويظهر هكذا: <b>${esc(Core.formatVolume(l, S.pv.volume))}</b></p>`
      : `<label class="field"><span>النص الافتراضي <small class="muted">(يُستبدل ببيانات الكتاب عند الإخراج)</small></span><textarea class="inp" data-p="text" rows="2">${esc(l.text)}</textarea></label>`}

      ${permBox('الخط', `
        <label class="field"><span>نوع الخط</span><select class="inp" data-p="font" data-rerender>${fontOptions(l.font)}</select></label>
        <div class="font-preview" style="font-family:'${esc(l.font)}';font-weight:${l.weight}">${esc(vol ? Core.formatVolume(l, S.pv.volume) : l.text || 'نص') }</div>
        <div class="grid2">
          <label class="field"><span>السماكة</span><select class="inp" data-p="weight" data-num>${[...new Set(weights.concat(l.weight))].sort().map((w) => `<option value="${w}" ${w === l.weight ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
          ${numF('size', 'الحجم الأقصى', l.size, 'min="4" max="600" step="1"')}
          ${numF('minSize', 'أصغر حجم', l.minSize, 'min="4" max="600" step="1"')}
          ${numF('maxLines', 'أقصى عدد أسطر', l.maxLines, 'min="1" max="12" step="1"')}
          ${numF('lineHeight', 'تباعد الأسطر', l.lineHeight, 'min="0.6" max="3" step="0.05"')}
          <label class="field"><span>المحاذاة</span><select class="inp" data-p="align"><option value="right" ${l.align === 'right' ? 'selected' : ''}>يمين</option><option value="center" ${l.align === 'center' ? 'selected' : ''}>وسط</option><option value="left" ${l.align === 'left' ? 'selected' : ''}>يسار</option><option value="justify" ${l.align === 'justify' ? 'selected' : ''}>ضبط من الطرفين</option></select></label>
          <label class="field"><span>الاتجاه</span><select class="inp" data-p="orient" data-rerender>${Object.entries(Core.ORIENTS).map(([k, t]) => `<option value="${k}" ${l.orient === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          ${S.d.kind === 'spine' ? `<label class="field" title="إذا اختلف عرض الكعب عن العرض الطبيعي"><span>مع تغيّر عرض الكعب</span><select class="inp" data-p="fit">${Object.entries(Core.TEXT_FITS).map(([k, t]) => `<option value="${k}" ${l.fit === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
        </div>
        ${sw('autoFit', 'تصغير تلقائي ليتسع في الخانة', l.autoFit, 'العناوين الطويلة تُصغَّر حتى «أصغر حجم» ثم تُقسم أسطراً')}`)}

      ${permBox('اللون والحدود (Stroke)', `
        ${colorRow('T:' + l.id + ':fill', l.color, 'لون النص')}
        <div class="strokes">${strokes || '<p class="muted small">لا حدود.</p>'}</div>
        <button class="btn sm" data-act="s-add" ${l.strokes.length >= Core.MAX_STROKES ? 'disabled' : ''}>${ic('plus')} إضافة حد (${l.strokes.length}/${Core.MAX_STROKES})</button>
        <p class="muted small">الحد ١ ملاصق للنص، وكل حد تالٍ يحيط بما قبله.</p>`)}

      ${permBox('موضع الخانة', `
        <div class="grid4">${numF('box.x', 'س', l.box.x)}${numF('box.y', 'ص', l.box.y)}${numF('box.w', 'العرض', l.box.w, 'min="10"')}${numF('box.h', 'الارتفاع', l.box.h, 'min="10"')}</div>
        <button class="btn sm" data-act="center-h">${ic('center')} توسيط أفقي</button>
        <p class="muted small">اسحب الخانة على الغلاف وغيّر حجمها من المقابض. النص يتوسطها ويتصاغر ليتسع لها.</p>`)}

      ${permBox(`${ic('lock')} صلاحيات المستخدم`, `
        ${sw('user.text', vol ? 'كتابة رقم المجلد' : 'تعديل النص', l.user.text)}
        ${sw('user.font', 'تغيير الخط', l.user.font)}
        ${sw('user.size', 'تغيير الحجم', l.user.size)}
        ${sw('user.color', 'تغيير اللون', l.user.color)}
        ${sw('user.strokes', 'تعديل الحدود', l.user.strokes)}
        ${sw('user.move', 'تحريك النص', l.user.move)}
        ${sw('user.hide', 'إخفاء النص', l.user.hide)}
        <hr>
        ${sw('visible', 'ظاهر افتراضياً', l.visible)}
        ${sw('lock', 'قفل في المحرر', l.lock)}`)}
    </div>`;
  }

  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
  }
  function readVal(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range' || el.dataset.num != null) return el.value === '' ? 0 : Number(el.value);
    return el.value;
  }

  props.addEventListener('input', (e) => {
    const el = e.target;
    const l = selLayer();
    if (!l) return;
    if (el.dataset.p) {
      const p = el.dataset.p;
      const val = readVal(el);
      // نقل الموضع لكل البدائل
      const m = /^variants\.(\d+)\.(x|y|w|h)$/.exec(p);
      if (m && S.moveAll) {
        const v = l.variants[+m[1]];
        const delta = val - v[m[2]];
        l.variants.forEach((x) => { if (x !== v) x[m[2]] = round(x[m[2]] + delta); });
      }
      setPath(l, p, val);
      if (p === 'name') renderLayers();
      if (p === 'opacity') el.previousElementSibling.textContent = `الشفافية: ${Math.round(val * 100)}٪`;
      if (p === 'font' || p === 'weight') { const fp = $('.font-preview', props); if (fp) { fp.style.fontFamily = `'${l.font}'`; fp.style.fontWeight = l.weight; } }
      requestRender();
      updateDirty();
    } else if (el.dataset.color) {
      Core.setDesignColor(S.d, el.dataset.color, el.value);
      $$('[data-hex]', props).forEach((c) => { c.textContent = hexLabel(Core.getDefaultColor(S.d, c.dataset.hex)); });
      $$('input[data-color]', props).forEach((c) => { const v = Core.getDefaultColor(S.d, c.dataset.color); if (c !== el && v) c.value = v; });
      $$('label.color.orig', props).forEach((c) => c.classList.toggle('orig', !Core.getDefaultColor(S.d, c.querySelector('input').dataset.color)));
      requestRender();
      updateDirty();
    } else if (el.id === 'moveAll') S.moveAll = el.checked;
  });

  props.addEventListener('change', (e) => {
    const el = e.target;
    const l = selLayer();
    if (!l) return;
    if (el.dataset.vupload) {
      const f = el.files[0];
      el.value = '';
      if (f) uploadVariant(l, el.dataset.vupload, f);
      return;
    }
    if (el.dataset.act === 'v-def') {
      const vid = el.closest('[data-vid]').dataset.vid;
      l.defVariant = vid;
      S.pv.variant[l.id] = vid;
      commit(); renderProps(); requestRender();
      return;
    }
    if (el.dataset.p || el.dataset.color) {
      commit();
      if (el.dataset.rerender != null || el.type === 'checkbox') { renderProps(); renderLayers(); }
    }
  });

  async function uploadVariant(l, vid, file) {
    const v = l.variants.find((x) => x.id === vid);
    if (!v) return;
    try {
      toast('جارٍ رفع الصورة…');
      const r = await upload(file);
      if (r.kind !== 'image') throw new Error('الملف ليس صورة');
      applyUpload(l, v, r);
      S.pv.variant[l.id] = v.id;
      commit(); renderProps(); renderLayers(); requestRender();
      toast('رُفعت الصورة');
    } catch (err) { fail(err); }
  }

  // إفلات صورة على بطاقة بديل
  props.addEventListener('dragover', (e) => { const v = e.target.closest('.variant'); if (v) { e.preventDefault(); v.classList.add('drop'); } });
  props.addEventListener('dragleave', (e) => { const v = e.target.closest('.variant'); if (v) v.classList.remove('drop'); });
  props.addEventListener('drop', (e) => {
    const v = e.target.closest('.variant');
    if (!v) return;
    e.preventDefault();
    v.classList.remove('drop');
    const f = e.dataTransfer.files[0];
    if (f) uploadVariant(selLayer(), v.dataset.vid, f);
  });

  props.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const l = selLayer();
    const act = b.dataset.act;
    if (act === 'go-links') return setTab('links');
    if (act === 'orig') { Core.setDesignColor(S.d, b.dataset.key, Core.ORIGINAL); commit(); renderProps(); renderLayers(); requestRender(); return; }
    if (!l) return;
    const { w: W, h: H } = dims();
    const vEl = b.closest('[data-vid]');
    const v = vEl && l.variants.find((x) => x.id === vEl.dataset.vid);
    const av = l.type === 'image' ? R.activeVariant(l, rs()) : null;
    if (act === 'v-show') { S.pv.variant[l.id] = v.id; renderProps(); requestRender(); return; }
    if (act === 'v-del') {
      if (!confirm('حذف هذا البديل؟')) return;
      l.variants.splice(l.variants.indexOf(v), 1);
      if (l.defVariant === v.id) l.defVariant = l.variants[0].id;
      delete S.pv.variant[l.id];
    } else if (act === 'v-add') {
      // البديل الجديد يأخذ موضع الصورة الأصلية وحجمها (أكبر ما يتسع في خانتها)، ويُغيَّر وضعه من بطاقته
      // وبألوانه كما هي (استبدالٌ كما في Word)؛ ومن أراد أن يُصبغ بلون الطبقة غيّر «طريقة التلوين» في بطاقته
      const nv = Core.makeVariant({ label: 'بديل ' + (l.variants.length + 1), x: av.x, y: av.y, w: av.w, h: av.h, mode: 'none', fit: 'slot' });
      l.variants.push(nv);
      S.pv.variant[l.id] = nv.id;
    } else if (act === 'v-full') {
      boxesOf(l).forEach((x) => Object.assign(x, { x: 0, y: 0, w: W, h: H }));
    } else if (act === 'v-ratio') {
      const ar = av.iw / av.ih;
      boxesOf(l).forEach((x) => { const cy = x.y + x.h / 2; x.h = round(x.w / ar); x.y = round(cy - x.h / 2); });
    } else if (act === 'center-h') {
      if (l.type === 'text') l.box.x = round((W - l.box.w) / 2);
      else boxesOf(l).forEach((x) => (x.x = round((W - x.w) / 2)));
    } else if (act === 's-add') {
      if (l.strokes.length >= Core.MAX_STROKES) return;
      const last = l.strokes[l.strokes.length - 1];
      l.strokes.push({ id: Core.uid('s'), width: last ? last.width : 3, color: last ? (last.color === '#000000' ? '#ffffff' : '#000000') : '#000000' });
    } else if (act === 's-del') {
      l.strokes = l.strokes.filter((s) => s.id !== b.dataset.sid);
    } else return;
    commit(); renderProps(); renderLayers(); requestRender();
  });

  /* ------------------------------------------------------------ */
  /* الإعدادات والصورة الخارجية                                     */
  /* ------------------------------------------------------------ */
  /** لون الكتاب المجسَّم مع الغلاف الأمامي: ثابت، أو مربوطٌ بلون صورة أو خلفية أو نص في الغلاف */
  function bookCardHTML(d) {
    const b = d.book || Core.BOOK_DEFAULT;
    const opt = (v, t) => `<option value="${esc(v)}" ${b.link === v ? 'selected' : ''}>${esc(t)}</option>`;
    const tg = Core.targetsOf(d);
    const imgs = tg.filter((t) => t.kind === 'image').map((t) => opt(t.key, (t.section === 'slot' ? 'الخانة: ' : '') + t.label + (t.active ? '' : ' (بلا صبغ)'))).join('');
    const txts = tg.filter((t) => t.kind === 'fill').map((t) => opt(t.key, t.label)).join('');
    const cur = Core.bookColor(d, rs()) || '';
    const fixed = b.link === 'fixed';
    return `<section class="card set-card book-card">
        <h3>${ic('layers')} لون الكتاب المجسَّم</h3>
        <p class="muted small">لون جلد الكتاب (الدفّتين والكعب) في المعاينة والرَّحل والخزانة حين يُختار هذا الغلاف. اربطه بلون صورةٍ أو خلفيةٍ في الغلاف فيتبعها إذا غيّر المستخدم لونها، أو اجعله لوناً ثابتاً. والمستخدم يغيّره من المنضدة إن شاء.</p>
        <div class="bk-row">
          <span class="bk-sw${cur ? '' : ' none'}" style="--bk:${esc(cur || '#6b1d2f')}" title="${cur ? 'اللون الآن: ' + esc(cur) : 'لا لون الآن: يُقرأ من صورة الغلاف'}"><i></i></span>
          <label class="field"><span>يأخذ لونه من</span><select class="inp" data-s="book.link">
            ${Object.entries(Core.BOOK_LINKS).map(([k, t]) => opt(k, t)).join('')}
            ${imgs ? `<optgroup label="ربطٌ بلون صورة أو خلفية في الغلاف">${imgs}</optgroup>` : ''}
            ${txts ? `<optgroup label="ربطٌ بلون نص">${txts}</optgroup>` : ''}
          </select></label>
          <label class="field" ${b.link === 'auto' || b.link === 'canvas' ? 'hidden' : ''}><span>${fixed ? 'اللون' : 'اللون إن كانت بلا صبغ'}</span><span class="row"><label class="color"><input type="color" data-s="book.color" value="${esc(b.color || '#6b1d2f')}"></label></span></label>
        </div>
      </section>`;
  }
  function paintBookSwatch() {
    const sw = $('#settings .book-card .bk-sw');
    if (!sw || !S.d) return;
    const cur = Core.bookColor(S.d, rs()) || '';
    sw.classList.toggle('none', !cur);
    sw.style.setProperty('--bk', cur || '#6b1d2f');
    sw.title = cur ? 'اللون الآن: ' + cur : 'لا لون الآن: يُقرأ من صورة الغلاف';
  }

  function renderSettings() {
    const d = S.d;
    const px = Math.round((d.canvas.widthCm / 2.54) * d.canvas.dpi);
    const py = Math.round((d.canvas.heightCm / 2.54) * d.canvas.dpi);
    $('#settings').innerHTML = `
      <section class="card set-card thumb-card">
        <h3>${ic('image')} الصورة الخارجية</h3>
        <p class="muted small">المربع الذي يراه المستخدم في معرض التصاميم. يُفضَّل مربع 1024×1024. نزّل القالب وصمّم عليه، ثم ارفعه هنا. إن لم ترفع صورة تُولَّد تلقائياً من ألوان التصميم واسمه.</p>
        <div class="thumb-pre">
          <div class="gal-demo"><div class="thumb">${thumbHTML(d)}</div><b>${esc(d.name)}</b></div>
          <div class="col">
            <label class="btn" data-ic2="upload">${ic('upload')} رفع صورة<input type="file" id="thumbUp" accept="image/*,.svg" hidden></label>
            <button class="btn danger" id="thumbDel" ${d.thumb ? '' : 'disabled'}>${ic('trash')} إزالة (استعمال المولَّدة)</button>
            <a class="btn" href="/covers/thumbnail-template.svg" download="قالب-الصورة-الخارجية.svg">${ic('download')} تنزيل القالب SVG</a>
            <button class="btn" id="thumbGen">${ic('download')} تنزيل المولَّدة SVG</button>
          </div>
        </div>
        <div class="field"><span>ألوان التصميم (للصورة المولَّدة ولاقتراحات الألوان عند المستخدم)</span>
          <div class="row wrap" id="palette">${d.palette.map((c, i) => `<span class="pal"><label class="color"><input type="color" value="${c}" data-pal="${i}"></label><button class="ibtn" data-pal-del="${i}" title="حذف" ${d.palette.length < 2 ? 'disabled' : ''}>${ic('x')}</button></span>`).join('')}
            ${d.palette.length < 5 ? `<button class="btn sm" id="palAdd">${ic('plus')}</button>` : ''}
            <button class="btn sm ghost" id="palFrom" title="أخذ الألوان من طبقات التصميم">${ic('wand')} من التصميم</button>
          </div>
        </div>
      </section>

      <section class="card set-card">
        <h3>${ic('eye')} النشر</h3>
        <label class="field"><span>اسم التصميم</span><input class="inp" data-s="name" value="${esc(d.name)}"></label>
        <label class="sw"><span>منشور (يظهر للمستخدمين في المعرض)</span><input type="checkbox" data-s="published" ${d.published ? 'checked' : ''}></label>
      </section>

      <section class="card set-card">
        <h3>${ic('layers')} قسم الخانة (المجلد)</h3>
        <label class="sw"><span>مفعّل افتراضياً</span><input type="checkbox" data-s="volume.on" ${d.volume.on ? 'checked' : ''}></label>
        <label class="sw"><span>يستطيع المستخدم إيقافه</span><input type="checkbox" data-s="volume.userToggle" ${d.volume.userToggle ? 'checked' : ''}></label>
        <label class="field"><span>رقم المجلد للمعاينة</span><input class="inp" type="number" min="1" max="999" data-s="volume.sample" value="${d.volume.sample}"></label>
        <p class="muted small">عند إيقافه تختفي كل طبقات قسم الخانة (الصور والنص معاً).</p>
      </section>

      ${d.kind === 'front' ? bookCardHTML(d) : ''}

      <section class="card set-card">
        <h3>${ic('upload')} إضافات المستخدم</h3>
        <label class="sw"><span>يستطيع المستخدم رفع صورة من جهازه لتكون هي الغلاف كله</span><input type="checkbox" data-s="allowCustom" ${d.allowCustom ? 'checked' : ''}></label>
        <label class="sw" title="في كل طبقة صور يُسمح له باختيار بديلها: يضع صورته بديلاً، فتكون صورة بألوانها، أو شكلاً يُلوَّن (بحسب الملف)"><span>يضع صوره بدائلَ في الطبقات</span><input type="checkbox" data-s="allowUserImages" ${d.allowUserImages ? 'checked' : ''}></label>
        <label class="sw" title="نص حر يكتبه ويختار خطه ولونه ومحاذاته والمسافة بين أسطره"><span>يضيف نصوصاً خاصة به</span><input type="checkbox" data-s="allowUserText" ${d.allowUserText ? 'checked' : ''}></label>
        <p class="muted small">صورته غلافاً: يختار هل تبقى فوقها نصوص التصميم وخانة رقم المجلد. وصوره في الطبقات تظهر بجانب بدائل كل طبقة (ما سمحت له باختيار بديلها).</p>
      </section>
      ${d.kind === 'spine' ? `<section class="card set-card">
        <h3>${ic('fit')} عرض الكعب</h3>
        <label class="field"><span>العرض الطبيعي (سم) — تصمّم عليه، ويتغير عند كل كتاب بحسب عدد صفحاته ونوع ورقه</span><input class="inp" type="number" step="0.1" min="0.3" max="15" data-s="canvas.widthCm" value="${d.canvas.widthCm}"></label>
        <div class="field"><span>إذا كان الكتاب أعرض من الطبيعي</span><p class="muted small">يُمطّ التصميم عرضاً تلقائياً.</p></div>
        <label class="field"><span>إذا كان الكتاب أضيق من الطبيعي</span><select class="inp" data-s="spine.fitNarrow">
          <option value="squeeze" ${d.spine.fitNarrow === 'squeeze' ? 'selected' : ''}>يُضكّ التصميم عرضاً (عكس المطّ)</option>
          <option value="crop" ${d.spine.fitNarrow === 'crop' ? 'selected' : ''}>تُقصّ أطرافه يميناً ويساراً بقدر ما نقص</option></select></label>
        <label class="field"><span>النصوص</span><select class="inp" data-s="spine.textFit">
          <option value="scale" ${d.spine.textFit === 'scale' ? 'selected' : ''}>تكبر وتصغر مع عرض الكعب</option>
          <option value="keep" ${d.spine.textFit === 'keep' ? 'selected' : ''}>تبقى بحجمها لا تتأثر</option></select></label>
        <p class="muted small">ولكل نص أن يخالف هذا من خصائصه («مع تغيّر عرض الكعب»). جرّب الأعراض من «معاينة بعرض» فوق اللوحة.</p>
      </section>` : ''}

      <section class="card set-card">
        <h3>${ic('link')} الربط بين القسمين</h3>
        <label class="sw"><span>مزامنة البدائل في الطبقات المرتبطة</span><input type="checkbox" data-s="syncVariants" ${d.syncVariants ? 'checked' : ''}></label>
        <p class="muted small">مثال: إذا اختار المستخدم «جلد» للخلفية، تتحول «خانة: الخلفية» المرتبطة بها إلى «جلد» أيضاً (المطابقة بنوع التلوين ثم بالترتيب).</p>
      </section>

      <section class="card set-card">
        <h3>${ic('fit')} ${d.kind === 'spine' ? 'ارتفاع الكعب والدقة' : 'مقاس الغلاف'}</h3>
        <div class="grid2">
          ${d.kind === 'spine' ? '' : `<label class="field"><span>العرض (سم)</span><input class="inp" type="number" step="0.1" min="5" max="100" data-s="canvas.widthCm" value="${d.canvas.widthCm}"></label>`}
          <label class="field"><span>الارتفاع (سم)</span><input class="inp" type="number" step="0.1" min="5" max="100" data-s="canvas.heightCm" value="${d.canvas.heightCm}"></label>
          <label class="field"><span>الدقة (DPI) للتنزيل</span><input class="inp" type="number" min="72" max="600" data-s="canvas.dpi" value="${d.canvas.dpi}"></label>
          <label class="field"><span>لون ما خلف الطبقات</span><span class="row"><label class="color"><input type="color" data-s="canvas.bg" value="${d.canvas.bg}"></label></span></label>
          <label class="field" title="المسافة من الحواف التي لا يُوضع فيها نص ولا صورة مهمة (تظهر بخط متقطع إذا فعّلت «حدود هامش الأمان» فوق اللوحة)"><span>هامش الأمان (مم)</span><input class="inp" type="number" step="0.5" min="0" max="50" data-s="canvas.safeMm" value="${d.canvas.safeMm}"></label>
        </div>
        <p class="muted small">التنزيل للمستخدم: ${px}×${py} بكسل. وحدات المحرر: ${dims().w}×${dims().h}. تغيير النسبة لا يحرّك الطبقات، فراجع مواضعها بعده.</p>
      </section>`;
  }

  const settings = $('#settings');
  settings.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.s) {
      if (/^book\./.test(el.dataset.s)) S.d.book = Object.assign({}, Core.BOOK_DEFAULT, S.d.book);
      setPath(S.d, el.dataset.s, readVal(el));
      if (el.dataset.s === 'name') $('#nameInp').value = S.d.name;
      if (/^(book\.|canvas\.bg)/.test(el.dataset.s)) paintBookSwatch();
      updateDirty();
    } else if (el.dataset.pal != null) {
      S.d.palette[+el.dataset.pal] = el.value;
      $('.gal-demo .thumb', settings).innerHTML = thumbHTML(S.d);
      updateDirty();
    }
  });
  settings.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'thumbUp') {
      const f = el.files[0];
      el.value = '';
      if (!f) return;
      upload(f).then((r) => {
        if (r.kind !== 'image') throw new Error('الملف ليس صورة');
        S.d.thumb = r.url;
        commit(); renderSettings();
        if (r.w && r.h && Math.abs(r.w / r.h - 1) > 0.02) toast('رُفعت الصورة — ننصح بمربع (1024×1024)؛ ستُقص من الوسط', true);
        else toast('رُفعت الصورة الخارجية');
      }).catch(fail);
      return;
    }
    if (el.dataset.s || el.dataset.pal != null) {
      commit();
      if (/^canvas\./.test(el.dataset.s || '')) { renderSettings(); syncSpinePv(); }
      else if (el.dataset.s === 'book.link') renderSettings();
    }
  });
  settings.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'thumbDel') { S.d.thumb = null; commit(); renderSettings(); }
    else if (t.id === 'palAdd') { S.d.palette.push('#888888'); commit(); renderSettings(); }
    else if (t.dataset.palDel != null) { S.d.palette.splice(+t.dataset.palDel, 1); commit(); renderSettings(); }
    else if (t.id === 'palFrom') {
      const { groups } = Core.colorGroups(S.d);
      const cols = [];
      for (const g of groups) { const c = (g.find((x) => x.color) || {}).color; if (c && g.some((x) => x.kind === 'image' && x.active) && !cols.includes(c)) cols.push(c); }
      const txt = Core.targetsOf(S.d).find((x) => x.kind === 'fill' && !cols.includes(x.color));
      if (txt) cols.push(txt.color);
      if (cols.length) { S.d.palette = cols.slice(0, 5); commit(); renderSettings(); }
    } else if (t.id === 'thumbGen') {
      const blob = new Blob([R.fallbackThumb(S.d)], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'صورة-خارجية-' + S.d.name + '.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  });

  route();
})();
