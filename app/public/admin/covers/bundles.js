/*
 * bundles.js — صفحة «الربط» في المجلِّد: حِزم تجمع غلافاً أمامياً وخلفياً وكعباً وأسلوب نشر وتنسيق طباعة.
 *  - لوحة: خمسة أعمدة، تختار الحزمة ثم تنقر عنصراً في كل عمود (أو تسحب من نقطة عنصر إلى عنصر في عمود آخر)
 *    فتُرسم بينها خطوط بلون الحزمة، كلوحة الربط اللوني. ولكل عنصر نقطتان (يميناً ويساراً)، والخط يخرج من النقطة التي تقابل العمود الآخر.
 *  - لكل حزمة صورتها (لا لونها): بها يعرفها المستخدم في المنضدة ويختارها بشكلها.
 *  - جدول: كل الحِزم صفوفاً، وكل خيار قائمة بالأسماء (أسرع حين تكثر التفاصيل).
 *  - ملف الحزمة (‎.zip‎): الأغلفة الثلاثة بصورها + بطاقة الأسلوب + تنسيق الطباعة، يُوضع في «استيراد حزمة» فيدخل كله دفعة واحدة.
 */
(function () {
  'use strict';
  const Core = window.CoverCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#2b7cff', '#c2410c', '#15803d', '#9333ea', '#be123c', '#0e7490', '#a16207', '#4338ca'];
  const BUNDLE_FORMAT = 'warraq-bundle';
  const COLS = [
    { key: 'front', label: 'الغلاف الأمامي', kind: 'front' },
    { key: 'back', label: 'الغلاف الخلفي', kind: 'back' },
    { key: 'spine', label: 'الكعب', kind: 'spine' },
    { key: 'style', label: 'أسلوب النشر' },
    { key: 'print', label: 'تنسيق الطباعة' },
  ];

  // ربط ألوان الأغلفة: الخلفي يميناً، والأمامي وسطاً (كل ربط طرفه فيه)، والكعب يساراً
  const PARTS = [
    { key: 'back', label: 'الغلاف الخلفي' },
    { key: 'front', label: 'الغلاف الأمامي' },
    { key: 'spine', label: 'الكعب' },
  ];
  const norm = (s) => String(s || '').replace(/ـ/g, '').replace(/^\s*(خلفي|كعب)\s+/, '').replace(/\s+/g, ' ').trim();

  const B = { root: null, ctx: null, bundles: [], styles: [], prints: [], cur: null, view: 'board', saveT: 0, drag: null, ro: null, dcache: new Map(), xd: null, xdrag: null, xpending: null };
  try { B.view = localStorage.getItem('covers.bundles.view') === 'table' ? 'table' : 'board'; } catch (_) { /* لا تخزين */ }

  /** الخيارات المتاحة لكل عمود: [{ id, name, thumb? }] */
  function options(key) {
    const col = COLS.find((c) => c.key === key);
    if (col.kind) return B.ctx.designs.filter((d) => (d.kind || 'front') === col.kind);
    if (key === 'style') return B.styles.map((s) => ({ id: s.id, name: s.name, sub: s.builtin ? 'مضمَّن' : s.hidden ? 'مخفي' : '' }));
    return B.prints.map((p) => ({ id: p.id, name: p.name, sub: p.summary || '' }));
  }
  const nameOf = (key, id) => { const o = id && options(key).find((x) => x.id === id); return o ? o.name : ''; };
  const curBundle = () => B.bundles.find((b) => b.id === B.cur) || null;
  const colorOf = (b, i) => b.color || COLORS[(i == null ? B.bundles.indexOf(b) : i) % COLORS.length];

  async function show(root, ctx) {
    B.root = root;
    B.ctx = ctx;
    const [bj, sj, pj] = await Promise.all([
      ctx.api('GET', '/api/admin/covers/bundles'),
      ctx.api('GET', '/api/admin/styles').catch(() => ({ styles: [] })),
      ctx.api('GET', '/api/admin/print/presets').catch(() => ({ items: [] })),
    ]);
    B.bundles = bj.bundles || [];
    B.dcache = new Map();
    B.styles = sj.styles || [];
    B.prints = pj.items || [];
    if (B.cur === '__last' && B.bundles.length) B.cur = B.bundles[B.bundles.length - 1].id;
    if (!B.bundles.some((b) => b.id === B.cur)) B.cur = B.bundles[0] ? B.bundles[0].id : null;
    const cnt = $('[data-kcount="links"]');
    if (cnt) cnt.textContent = Core.toIndic(B.bundles.length);
    render();
  }

  function render() {
    const r = B.root;
    r.innerHTML = `
      <div class="bd-head">
        <div>
          <h2>الربط</h2>
          <p class="muted small">اربط أي غلاف أمامي بأي غلاف خلفي وأي كعب، ومعها أسلوب نشر وتنسيق طباعة، في «حزمة» باسم واحد. تُنزَّل الحزمة ملفاً واحداً تحتفظ به، ثم تضعه في «استيراد حزمة» فيدخل كله دفعة واحدة، ويختارها المستخدم في المنضدة بنقرة.</p>
        </div>
        <div class="row wrap">
          <div class="seg" role="radiogroup" aria-label="طريقة العرض">
            <button role="radio" data-view="board" aria-checked="${B.view === 'board'}">${ic('link')} لوحة</button>
            <button role="radio" data-view="table" aria-checked="${B.view === 'table'}">${ic('rows')} جدول</button>
          </div>
          <label class="btn" title="ضع ملف حزمة نزّلته من هنا">${ic('upload')} استيراد حزمة<input type="file" data-bimport accept=".zip,application/zip" hidden></label>
          <button class="btn primary" data-bact="new">${ic('plus')} حزمة جديدة</button>
        </div>
      </div>
      ${B.view === 'board' ? boardHTML() + linkSecHTML() : tableHTML()}`;
    if (B.view === 'board') {
      requestAnimationFrame(drawLines);
      paintColorLinks();
    }
  }

  /* ------------------------------------------------------------ اللوحة */
  function chipsHTML() {
    if (!B.bundles.length) return `<div class="empty card"><h3>لا حِزم بعد</h3><p class="muted">أنشئ حزمة، ثم انقر في كل عمود ما تريده فيها.</p><button class="btn primary" data-bact="new">${ic('plus')} حزمة جديدة</button></div>`;
    const b = curBundle();
    return `<div class="bd-chips">${B.bundles.map((x, i) => `<button class="bd-chip ${x.id === B.cur ? 'on' : ''} ${x.image ? 'img' : ''}" data-bsel="${x.id}" style="--c:${colorOf(x, i)}">${x.image ? `<img src="${esc(x.image)}" alt="">` : '<i></i>'}<span>${esc(x.name)}</span></button>`).join('')}</div>
      ${b ? `<div class="bd-cur card">
        ${imgPick(b)}
        <input class="inp bd-name" data-bname="${b.id}" value="${esc(b.name)}" aria-label="اسم الحزمة">
        <span class="muted small bd-sum">${COLS.map((c) => (b[c.key] ? '' : `<span class="bd-miss">${c.label}</span>`)).join('') || 'كاملة'}</span>
        <button class="btn sm" data-bact="download" data-id="${b.id}">${ic('download')} تنزيل ملف الحزمة</button>
        <button class="ibtn" data-bact="dup" data-id="${b.id}" title="نسخ">${ic('copy')}</button>
        <button class="ibtn danger" data-bact="del" data-id="${b.id}" title="حذف الحزمة (لا تُحذف الأغلفة)">${ic('trash')}</button>
      </div>` : ''}`;
  }

  /** صورة الحزمة: تُختار من الجهاز، وتظهر للمستخدم في المنضدة فيعرف الحزمة بشكلها */
  function imgPick(b, sm) {
    return `<span class="bd-img ${sm ? 'sm' : ''} ${b.image ? 'has' : ''}">
      <label title="${b.image ? 'غيّر صورة الحزمة' : 'ضع صورة للحزمة: بها يختارها المستخدم في المنضدة'}">${b.image ? `<img src="${esc(b.image)}" alt="">` : `${ic('upload')}<small>صورة الحزمة</small>`}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" data-bimg="${b.id}" hidden></label>
      ${b.image ? `<button type="button" class="bd-img-x" data-bact="unimg" data-id="${b.id}" title="أزل الصورة">✕</button>` : ''}
    </span>`;
  }

  function itemHTML(col, o, b) {
    const on = b && b[col.key] === o.id;
    const others = B.bundles.filter((x) => x !== b && x[col.key] === o.id);
    const thumb = col.kind ? `<span class="bd-thumb thumb ${col.kind}">${B.ctx.thumbHTML(o)}</span>` : `<span class="bd-ic">${ic(col.key === 'style' ? 'palette' : 'layers')}</span>`;
    return `<div class="bd-item ${on ? 'on' : ''}" data-col="${col.key}" data-item="${esc(o.id)}" title="${on ? 'انقر لإزالته من الحزمة' : 'انقر لوضعه في الحزمة'}">
      ${thumb}<span class="bd-iname"><b>${esc(o.name)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}${col.kind && !o.published ? '<small class="warn">غير منشور</small>' : ''}</span>
      ${others.length ? `<span class="bd-dots">${others.slice(0, 4).map((x) => `<i style="background:${colorOf(x)}" title="${esc(x.name)}"></i>`).join('')}</span>` : ''}
      <button class="bd-node r" data-node="${col.key}" data-side="r" aria-label="اسحب للربط" title="اسحب إلى عنصر في عمود آخر"></button>
      <button class="bd-node l" data-node="${col.key}" data-side="l" aria-label="اسحب للربط" title="اسحب إلى عنصر في عمود آخر"></button>
    </div>`;
  }

  function boardHTML() {
    const b = curBundle();
    return `${chipsHTML()}
      <div class="bd-board ${b ? '' : 'off'}" style="--bc:${b ? colorOf(b) : 'var(--accent)'}">
        <svg class="bd-svg"></svg>
        <svg class="bd-drag"><path class="bd-temp" d=""/></svg>
        ${COLS.map((c) => {
          const list = options(c.key);
          return `<section class="bd-col" data-colkey="${c.key}"><header>${esc(c.label)} <span class="chip">${Core.toIndic(list.length)}</span></header>${c.key === 'print' && !list.length ? '<p class="muted small">التنسيقات تُحفظ بأسمائها من «أساليب دور النشر» ← «الطباعة».</p>' : ''}
            <div class="bd-list">${list.map((o) => itemHTML(c, o, b)).join('') || `<p class="muted small">لا ${c.kind ? 'تصاميم' : 'عناصر'} بعد${c.kind ? ' — أنشئها من صفحة «' + c.label + '»' : ''}.</p>`}
            ${b && b[c.key] ? '' : '<p class="bd-none muted small">— بلا —</p>'}</div></section>`;
        }).join('')}
      </div>`;
  }

  function drawLines() {
    const board = $('.bd-board', B.root);
    const svg = $('.bd-svg', B.root);
    if (!board || !svg) return;
    const br = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    const pos = (key, id) => {
      const el = $(`.bd-item[data-col="${key}"][data-item="${CSS.escape(id)}"]`, board);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { el, l: r.left - br.left, r: r.right - br.left, y: r.top - br.top + r.height / 2 };
    };
    const NODE = 4; // مركز النقطة خارج حافة العنصر
    // الخط بين عنصرين: من النقطة التي تقابل الآخر (يسار الأول ويمين الثاني إن كان الثاني إلى يساره، والعكس)،
    // وإن كانا في عمودٍ واحد (الشاشة الضيقة) فمن طرفيهما الأيسرين بقوسٍ خارجه
    const link = (a, z) => {
      const ax = (a.l + a.r) / 2, zx = (z.l + z.r) / 2;
      let x1, x2, c1, c2;
      if (ax - zx > 8) {
        x1 = a.l - NODE; x2 = z.r + NODE;
        const dx = Math.max(30, (x1 - x2) / 2);
        c1 = x1 - dx; c2 = x2 + dx;
        a.used.add('l'); z.used.add('r');
      } else if (zx - ax > 8) {
        x1 = a.r + NODE; x2 = z.l - NODE;
        const dx = Math.max(30, (x2 - x1) / 2);
        c1 = x1 + dx; c2 = x2 - dx;
        a.used.add('r'); z.used.add('l');
      } else {
        x1 = a.l - NODE; x2 = z.l - NODE;
        c1 = x1 - 46; c2 = x2 - 46;
        a.used.add('l'); z.used.add('l');
      }
      return `M${x1},${a.y} C${c1},${a.y} ${c2},${z.y} ${x2},${z.y}`;
    };
    const paths = [];
    $$('.bd-node.used', board).forEach((n) => n.classList.remove('used'));
    // الحزم الأخرى أولاً (باهتة)، ثم المختارة فوقها
    const order = B.bundles.map((b, i) => [b, i]).sort((x, y) => (x[0].id === B.cur) - (y[0].id === B.cur));
    order.forEach(([b, i]) => {
      const mine = b.id === B.cur;
      const pts = COLS.map((c) => (b[c.key] ? pos(c.key, b[c.key]) : null)).filter(Boolean).map((p) => ({ ...p, used: new Set() }));
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], z = pts[k + 1]; // الأعمدة من اليمين إلى اليسار
        paths.push(`<path class="bd-line ${mine ? 'mine' : ''}" d="${link(a, z)}" style="stroke:${colorOf(b, i)}"/>`);
      }
      // نقاط الحزمة المختارة التي يمرّ بها خطها تُملأ بلونها
      if (mine) for (const p of pts) for (const sd of p.used) { const n = $(`.bd-node.${sd}`, p.el); if (n) n.classList.add('used'); }
    });
    svg.innerHTML = paths.join('');
    if (!B.ro && window.ResizeObserver) {
      B.ro = new ResizeObserver(() => { if ($('.bd-board', B.root)) drawLines(); drawX(); });
      B.ro.observe(B.root);
    }
  }

  /* ------------------------------------------------------------ ربط ألوان الأغلفة */
  function loadDesign(id) {
    if (!B.dcache.has(id)) {
      const pr = B.ctx.api('GET', '/api/admin/covers/' + id).then((j) => Core.normalizeDesign(j.design));
      pr.catch(() => B.dcache.delete(id));
      B.dcache.set(id, pr);
    }
    return B.dcache.get(id);
  }

  function linkSecHTML() {
    if (!curBundle()) return '';
    return `<section class="lnk" id="bdLinks">
      <div class="lk-head">
        <div>
          <h2>${ic('palette')} ربط ألوان الأغلفة</h2>
          <p class="muted small">اربط لون صورةٍ أو نصٍّ في الغلاف الأمامي بما يقابله في الغلاف الخلفي والكعب: إذا غيّر المستخدم لون الخلفية أو النص في الأمامي تغيّر معه هناك. اسحب من نقطة إلى أخرى (أو انقر نقطتين)، وانقر الخط لحذفه.</p>
        </div>
        <div class="row">
          <button class="btn sm" data-xact="auto">${ic('wand')} ربط تلقائي بالأسماء</button>
          <button class="btn sm danger" data-xact="clear">${ic('unlink')} حذف كل الروابط</button>
        </div>
      </div>
      <div class="lnk-body"><p class="muted small">جارٍ تحميل الأغلفة…</p></div>
    </section>`;
  }

  async function paintColorLinks() {
    const b0 = curBundle();
    const box = $('#bdLinks .lnk-body', B.root);
    if (!b0 || !box) return;
    B.xpending = null;
    if (!b0.front || !(b0.back || b0.spine)) {
      B.xd = null;
      box.innerHTML = '<p class="muted small">ضع في الحزمة غلافاً أمامياً ومعه غلافاً خلفياً أو كعباً، ثم اربط ألوانها هنا.</p>';
      return;
    }
    const ds = {};
    try {
      for (const p of PARTS) if (b0[p.key]) ds[p.key] = await loadDesign(b0[p.key]);
    } catch (err) {
      box.innerHTML = `<p class="muted small">تعذّر تحميل الأغلفة: ${esc(err.message)}</p>`;
      return;
    }
    const b = curBundle();
    if (!b || b.id !== b0.id || !box.isConnected) return;
    B.xd = ds;
    // روابط عناصر لم تعد في الأغلفة (حُذفت طبقتها) تُترك
    const keys = new Set();
    for (const [p, d] of Object.entries(ds)) for (const t of Core.targetsOf(d)) keys.add(p + '|' + t.key);
    const n = (b.links || []).length;
    b.links = (b.links || []).filter((l) => keys.has(l.a) && keys.has(l.b));
    if (b.links.length !== n) persist();
    const parts = PARTS.filter((p) => ds[p.key]);
    box.innerHTML = `<div class="lnk-board" style="--cols:${parts.length}"><svg class="lk-svg"></svg><svg class="lk-drag"><path class="lk-temp" d=""/></svg>${parts.map((p) => colHTML(p, ds[p.key], ds)).join('')}</div>`;
    requestAnimationFrame(drawX);
  }

  function colHTML(p, d, ds) {
    // جهة النقاط: الخلفي على حافته اليسرى (نحو الأمامي)، والكعب على اليمنى، والأمامي على الجهة التي فيها جارُه
    const sides = p.key === 'back' ? ['l'] : p.key === 'spine' ? ['r'] : [ds.back && 'r', ds.spine && 'l'].filter(Boolean);
    const cards = d.layers.slice().reverse().map((l) => {
      const rows = Core.targetsOf({ layers: [l] }).map((t) => {
        const off = t.kind === 'image' && !t.active;
        const sub = t.kind === 'image' ? (off ? 'التلوين معطّل' : 'لون الصورة') : t.sub;
        const key = p.key + '|' + t.key;
        return `<div class="lk-t lnk-t ${off ? 'off' : ''} ${p.key === 'front' && !off && !t.userEditable ? 'ro' : ''}" data-xkey="${esc(key)}">
          <span class="lk-sw ${t.color ? '' : 'orig'}" style="${t.color ? 'background:' + t.color : ''}"></span><span class="lk-sub">${esc(sub)}</span>
          ${sides.map((s) => `<button class="lk-node lnk-node ${s}" data-xnode="${esc(key)}" data-side="${s}" style="--c:${t.color || '#999'}" ${off ? 'disabled title="فعّل تلوين الطبقة أولاً"' : 'title="اسحب للربط"'} aria-label="نقطة ربط: ${esc(l.name)} — ${esc(sub)}"></button>`).join('')}
        </div>`;
      }).join('');
      return `<div class="lk-card"><div class="lk-card-h">${ic(l.type === 'image' ? 'image' : 'type')}<b>${esc(l.name)}</b>${l.section === 'slot' ? '<small class="muted">الخانة</small>' : ''}</div>${rows}</div>`;
    }).join('');
    return `<section class="lnk-col" data-part="${p.key}"><header>${esc(p.label)} <span class="chip" title="${esc(d.name)}">${esc(d.name)}</span></header>
      <div class="lk-list">${cards || '<p class="muted small">لا عناصر ملوّنة.</p>'}</div></section>`;
  }

  const targetOf = (key) => {
    const i = key.indexOf('|');
    const d = B.xd && B.xd[key.slice(0, i)];
    return d ? Core.targetsOf(d).find((t) => t.key === key.slice(i + 1)) : null;
  };

  function drawX() {
    const b = curBundle();
    const board = $('.lnk-board', B.root);
    if (!b || !board) return;
    const svg = $('.lk-svg', board);
    const br = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    const at = (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top }; };
    $$('.lnk-node.linked', board).forEach((n) => n.classList.remove('linked'));
    let html = '';
    for (const l of b.links || []) {
      const f = l.a.startsWith('front|') ? l.a : l.b;
      const o = f === l.a ? l.b : l.a;
      const n1 = $(`.lnk-node[data-xnode="${CSS.escape(f)}"][data-side="${o.startsWith('back|') ? 'r' : 'l'}"]`, board);
      const n2 = $(`.lnk-node[data-xnode="${CSS.escape(o)}"]`, board);
      if (!n1 || !n2) continue;
      n1.classList.add('linked');
      n2.classList.add('linked');
      const a = at(n1), z = at(n2);
      const dir = z.x > a.x ? 1 : -1;
      const dx = Math.max(40, Math.abs(z.x - a.x) * 0.45);
      const p = `M ${a.x} ${a.y} C ${a.x + dir * dx} ${a.y}, ${z.x - dir * dx} ${z.y}, ${z.x} ${z.y}`;
      const t = targetOf(f);
      html += `<g class="lk-line" data-xa="${esc(l.a)}" data-xb="${esc(l.b)}"><title>انقر لحذف هذا الربط</title>
        <path class="hit" d="${p}"/><path class="under" d="${p}"/><path class="main" d="${p}" stroke="${(t && t.color) || '#8a8f99'}"/></g>`;
    }
    svg.innerHTML = html;
  }

  function addX(a, z) {
    const b = curBundle();
    if (!b || !a || !z || a === z) return;
    const pa = a.split('|')[0], pz = z.split('|')[0];
    if (pa === pz) return B.ctx.toast('اربط عنصرين من غلافين مختلفين', true);
    if (pa !== 'front' && pz !== 'front') return B.ctx.toast('كل ربط طرفه في الغلاف الأمامي', true);
    const ta = targetOf(a), tz = targetOf(z);
    if ((ta && ta.kind === 'image' && !ta.active) || (tz && tz.kind === 'image' && !tz.active)) return B.ctx.toast('فعّل تلوين الطبقة أولاً', true);
    b.links = b.links || [];
    const id = [a, z].sort().join('~');
    if (b.links.some((l) => [l.a, l.b].sort().join('~') === id)) return B.ctx.toast('هذا الربط موجود', true);
    b.links.push(pa === 'front' ? { a, b: z } : { a: z, b: a });
    persist();
    drawX();
    B.ctx.toast('تم الربط — يتبع لونُه لونَ الغلاف الأمامي عند المستخدم');
  }

  function setXPending(k) {
    B.xpending = k;
    $$('.lnk-t', B.root).forEach((r) => r.classList.toggle('pending', r.dataset.xkey === k));
    const board = $('.lnk-board', B.root);
    if (board) board.classList.toggle('picking', !!k);
  }
  function pickX(k) {
    if (!B.xpending) setXPending(k);
    else if (B.xpending === k) setXPending(null);
    else { const p = B.xpending; setXPending(null); addX(p, k); }
  }

  /** الربط التلقائي: ما تطابق اسم طبقته ونوعه في الأمامي والخلفي/الكعب («الخلفية» ↔ «خلفي الخلفية»…) */
  function autoX() {
    const b = curBundle();
    if (!b || !B.xd || !B.xd.front) return;
    const front = Core.targetsOf(B.xd.front);
    const same = (t, u) => t.kind === u.kind && norm(t.label) === norm(u.label) && (t.kind !== 'stroke' || t.sub === u.sub) && (t.kind !== 'image' || (t.active && u.active));
    let n = 0;
    b.links = b.links || [];
    for (const p of ['back', 'spine']) {
      if (!B.xd[p]) continue;
      for (const u of Core.targetsOf(B.xd[p])) {
        const t = front.find((x) => same(x, u));
        if (!t) continue;
        const a = 'front|' + t.key, z = p + '|' + u.key;
        if (b.links.some((l) => (l.a === a && l.b === z) || (l.a === z && l.b === a))) continue;
        b.links.push({ a, b: z });
        n++;
      }
    }
    if (n) { persist(); drawX(); }
    B.ctx.toast(n ? `تم إنشاء ${n} ربط بمطابقة أسماء الطبقات` : 'لا عناصر جديدة متطابقة الأسماء', !n);
  }

  document.addEventListener('click', (e) => {
    if (!B.root || !B.root.isConnected || !(e.target instanceof Element)) return;
    const sec = e.target.closest('#bdLinks');
    if (!sec || !B.root.contains(sec)) return;
    const b = curBundle();
    if (!b) return;
    const act = e.target.closest('[data-xact]');
    if (act && act.dataset.xact === 'auto') return autoX();
    if (act && act.dataset.xact === 'clear') {
      if (!(b.links || []).length || !confirm('حذف كل روابط الألوان في هذه الحزمة؟')) return;
      b.links = [];
      persist();
      return drawX();
    }
    const line = e.target.closest('.lk-line');
    if (line) {
      const id = [line.dataset.xa, line.dataset.xb].sort().join('~');
      b.links = (b.links || []).filter((l) => [l.a, l.b].sort().join('~') !== id);
      persist();
      drawX();
      return B.ctx.toast('حُذف الربط');
    }
    if (e.target.closest('.lnk-node')) return; // النقطة تُعالَج في pointerup
    const row = e.target.closest('.lnk-t');
    if (row && !row.classList.contains('off')) pickX(row.dataset.xkey);
  });
  document.addEventListener('pointerdown', (e) => {
    const n = e.target instanceof Element && e.target.closest('.lnk-node');
    if (!n || n.disabled || !B.root || !B.root.contains(n)) return;
    e.preventDefault();
    const board = n.closest('.lnk-board');
    const br = board.getBoundingClientRect();
    const r = n.getBoundingClientRect();
    B.xdrag = { from: n.dataset.xnode, board, x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top, dir: n.dataset.side === 'r' ? 1 : -1, x0: e.clientX, y0: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    const d = B.xdrag;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) d.moved = true;
    if (!d.moved) return;
    const br = d.board.getBoundingClientRect();
    const x = e.clientX - br.left, y = e.clientY - br.top;
    const dx = Math.max(30, Math.abs(x - d.x) / 2);
    const temp = $('.lk-temp', d.board);
    temp.setAttribute('d', `M${d.x},${d.y} C${d.x + d.dir * dx},${d.y} ${x - d.dir * dx},${y} ${x},${y}`);
    temp.style.display = 'block';
    $$('.lnk-t.hover', d.board).forEach((x) => x.classList.remove('hover'));
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest && el.closest('.lnk-t:not(.off)');
    if (row) row.classList.add('hover');
  });
  document.addEventListener('pointerup', (e) => {
    const d = B.xdrag;
    if (!d) return;
    B.xdrag = null;
    $('.lk-temp', d.board).style.display = 'none';
    $$('.lnk-t.hover', d.board).forEach((x) => x.classList.remove('hover'));
    if (!d.moved) return pickX(d.from);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest && el.closest('.lnk-t:not(.off)');
    if (row) addX(d.from, row.dataset.xkey);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && B.xpending) setXPending(null); });

  /* ------------------------------------------------------------ الجدول */
  function tableHTML() {
    const sel = (b, c) => `<select class="inp sm" data-tset="${b.id}:${c.key}"><option value="">— بلا —</option>${options(c.key).map((o) => `<option value="${esc(o.id)}" ${b[c.key] === o.id ? 'selected' : ''}>${esc(o.name)}${c.kind && !o.published ? ' (غير منشور)' : ''}</option>`).join('')}</select>`;
    return `<div class="bd-table-wrap card"><table class="bd-table">
      <thead><tr><th>الحزمة</th>${COLS.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
      <tbody>${B.bundles.map((b, i) => `<tr>
        <td><span class="row">${imgPick(b, true)}<input class="inp sm" data-bname="${b.id}" value="${esc(b.name)}"></span></td>
        ${COLS.map((c) => `<td>${sel(b, c)}</td>`).join('')}
        <td class="nowrap"><button class="ibtn" data-bact="download" data-id="${b.id}" title="تنزيل ملف الحزمة">${ic('download')}</button><button class="ibtn" data-bact="dup" data-id="${b.id}" title="نسخ">${ic('copy')}</button><button class="ibtn danger" data-bact="del" data-id="${b.id}" title="حذف">${ic('trash')}</button></td>
      </tr>`).join('') || `<tr><td colspan="${COLS.length + 2}" class="muted small center">لا حِزم بعد.</td></tr>`}</tbody>
    </table>
    <div class="bd-table-f"><button class="btn sm" data-bact="new">${ic('plus')} صف جديد</button><span class="muted small">كل اختيار يُحفظ فوراً.</span></div></div>`;
  }

  /* ------------------------------------------------------------ الحفظ */
  function persist(now) {
    clearTimeout(B.saveT);
    const go = () => B.ctx.api('PUT', '/api/admin/covers/bundles', { bundles: B.bundles }).then((j) => {
      // المعرّفات الجديدة تُثبَّت من الخادم
      const cur = B.bundles.findIndex((b) => b.id === B.cur);
      B.bundles = j.bundles;
      if (cur >= 0 && B.bundles[cur]) B.cur = B.bundles[cur].id;
      const cnt = $('[data-kcount="links"]');
      if (cnt) cnt.textContent = Core.toIndic(B.bundles.length);
    }).catch(B.ctx.fail);
    if (now) return go();
    B.saveT = setTimeout(go, 400);
    return null;
  }

  function newBundle(o) {
    const id = 'b' + Math.random().toString(36).slice(2, 10);
    const b = Object.assign({ id, name: 'حزمة ' + Core.toIndic(B.bundles.length + 1), front: null, back: null, spine: null, style: null, print: null, color: COLORS[B.bundles.length % COLORS.length] }, o || {});
    B.bundles.push(b);
    B.cur = b.id;
    return b;
  }

  /** صورة الحزمة: تُرفع إلى وسائط المجلِّد ثم تُحفظ مع الحزمة */
  async function setImage(b, file) {
    if (!/^image\//.test(file.type || '')) return B.ctx.toast('اختر صورة (PNG أو JPG أو WEBP أو SVG)', true);
    try {
      B.ctx.toast('جارٍ رفع الصورة…');
      const up = await B.ctx.upload(file);
      if (!up || up.kind !== 'image') throw new Error('ليست صورة');
      b.image = up.url;
      await persist(true);
      render();
      B.ctx.toast('وُضعت صورة الحزمة: بها يختارها المستخدم في المنضدة');
    } catch (err) { B.ctx.fail(err); }
  }

  function setPart(b, key, id) {
    // تغيّر غلافٌ في الحزمة: روابط ألوانه السابقة لا تصلح لغيره
    if (['front', 'back', 'spine'].includes(key) && b[key] !== (id || null) && b.links) {
      b.links = key === 'front' ? [] : b.links.filter((l) => !l.a.startsWith(key + '|') && !l.b.startsWith(key + '|'));
    }
    b[key] = id || null;
    persist();
  }

  /* ------------------------------------------------------------ الأحداث */
  document.addEventListener('click', (e) => {
    if (!B.root || !B.root.isConnected || !B.root.contains(e.target)) return;
    const v = e.target.closest('[data-view]');
    if (v && B.root.contains(v) && v.closest('.bd-head')) {
      B.view = v.dataset.view;
      try { localStorage.setItem('covers.bundles.view', B.view); } catch (_) { /* لا تخزين */ }
      return render();
    }
    const s = e.target.closest('[data-bsel]');
    if (s) { B.cur = s.dataset.bsel; return render(); }
    const a = e.target.closest('[data-bact]');
    if (a) return act(a.dataset.bact, a.dataset.id, a);
    const it = e.target.closest('.bd-item');
    if (it && !e.target.closest('.bd-node')) {
      const b = curBundle();
      if (!b) return B.ctx.toast('أنشئ حزمة أولاً', true);
      setPart(b, it.dataset.col, b[it.dataset.col] === it.dataset.item ? null : it.dataset.item);
      render();
    }
  });

  document.addEventListener('input', (e) => {
    if (!B.root || !B.root.contains(e.target)) return;
    const el = e.target;
    if (el.dataset.bname) { const b = B.bundles.find((x) => x.id === el.dataset.bname); if (b) { b.name = el.value; persist(); const c = $(`[data-bsel="${b.id}"]`, B.root); if (c) c.lastChild.textContent = el.value; } }
    else if (el.dataset.bcolor) { const b = B.bundles.find((x) => x.id === el.dataset.bcolor); if (b) { b.color = el.value; persist(); if (B.view === 'board') { const c = $(`[data-bsel="${b.id}"]`, B.root); if (c) c.style.setProperty('--c', el.value); drawLines(); } } }
  });
  document.addEventListener('change', (e) => {
    if (!B.root || !B.root.contains(e.target)) return;
    const el = e.target;
    if (el.dataset.bimg) {
      const b = B.bundles.find((x) => x.id === el.dataset.bimg);
      const f = el.files && el.files[0];
      el.value = '';
      if (b && f) setImage(b, f);
      return;
    }
    if (el.dataset.tset) {
      const [id, key] = el.dataset.tset.split(':');
      const b = B.bundles.find((x) => x.id === id);
      if (b) setPart(b, key, el.value);
    } else if (el.dataset.bimport != null) {
      const f = el.files && el.files[0];
      el.value = '';
      if (f) importFile(f, B.ctx).then(async () => { B.ctx.designs = await B.ctx.reload(); await show(B.root, B.ctx); }).catch(B.ctx.fail);
    }
  });

  // السحب من نقطة عنصر إلى عنصر في عمود آخر: يضع الاثنين في الحزمة
  document.addEventListener('pointerdown', (e) => {
    const n = e.target.closest && e.target.closest('.bd-node');
    if (!n || !B.root || !B.root.contains(n)) return;
    const b = curBundle();
    if (!b) return;
    const it = n.closest('.bd-item');
    const board = $('.bd-board', B.root);
    const br = board.getBoundingClientRect();
    const r = n.getBoundingClientRect();
    B.drag = { b, from: it, x: r.left - br.left + r.width / 2, y: r.top - br.top + r.height / 2, br, dir: n.dataset.side === 'r' ? 1 : -1 };
    $('.bd-temp', B.root).style.display = 'block';
    board.classList.add('picking');
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!B.drag) return;
    const br = $('.bd-board', B.root).getBoundingClientRect();
    const x = e.clientX - br.left, y = e.clientY - br.top;
    const dx = Math.max(30, Math.abs(x - B.drag.x) / 2);
    $('.bd-temp', B.root).setAttribute('d', `M${B.drag.x},${B.drag.y} C${B.drag.x + B.drag.dir * dx},${B.drag.y} ${x - B.drag.dir * dx},${y} ${x},${y}`);
    $$('.bd-item.hover', B.root).forEach((x) => x.classList.remove('hover'));
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const to = over && over.closest && over.closest('.bd-item');
    if (to && to.dataset.col !== B.drag.from.dataset.col) to.classList.add('hover');
  });
  document.addEventListener('pointerup', (e) => {
    if (!B.drag) return;
    const d = B.drag;
    B.drag = null;
    const board = $('.bd-board', B.root);
    if (board) board.classList.remove('picking');
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const to = over && over.closest && over.closest('.bd-item');
    if (to && to.dataset.col !== d.from.dataset.col) {
      if (d.b[d.from.dataset.col] !== d.from.dataset.item) setPart(d.b, d.from.dataset.col, d.from.dataset.item);
      setPart(d.b, to.dataset.col, to.dataset.item);
    }
    render();
  });

  async function act(what, id, btn) {
    const b = id ? B.bundles.find((x) => x.id === id) : null;
    if (what === 'new') { newBundle(); await persist(true); return render(); }
    if (what === 'unimg' && b) { b.image = null; await persist(true); return render(); }
    if (what === 'dup' && b) {
      const { front, back, spine, style, print, image } = b;
      newBundle({ name: b.name + ' (نسخة)', front, back, spine, style, print, image, links: (b.links || []).map((l) => ({ ...l })) });
      await persist(true);
      return render();
    }
    if (what === 'del' && b) {
      if (!confirm(`حذف الحزمة «${b.name}»؟ (الأغلفة والأسلوب لا تُحذف)`)) return;
      B.bundles = B.bundles.filter((x) => x !== b);
      if (B.cur === b.id) B.cur = B.bundles[0] ? B.bundles[0].id : null;
      await persist(true);
      return render();
    }
    if (what === 'download' && b) {
      btn.disabled = true;
      try { await exportBundle(b); } catch (err) { B.ctx.fail(err); }
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------ ملف الحزمة */
  async function exportBundle(b) {
    const ctx = B.ctx;
    const { makeZip } = await import('/shared/zip.js');
    ctx.toast('جارٍ تجهيز ملف الحزمة…');
    const files = [];
    const doc = { format: BUNDLE_FORMAT, version: 1, name: b.name, color: b.color || null, savedAt: new Date().toISOString(), parts: {}, links: b.links || [] };
    for (const k of ['front', 'back', 'spine']) {
      if (!b[k]) continue;
      const { design } = await ctx.api('GET', '/api/admin/covers/' + b[k]);
      files.push(...(await ctx.designZipFiles(design, k + '/')));
      doc.parts[k] = { dir: k + '/', id: design.id, name: design.name };
    }
    if (b.style) {
      const card = await ctx.api('GET', '/api/admin/styles/' + encodeURIComponent(b.style) + '/card');
      files.push({ name: 'style.json', data: JSON.stringify(card, null, 2) });
      doc.style = { file: 'style.json', id: b.style, name: card.name };
    }
    if (b.print) {
      const p = await ctx.api('GET', '/api/admin/print/presets/' + b.print);
      files.push({ name: 'print.json', data: JSON.stringify({ format: 'warraq-print', name: p.name, print: p.print }, null, 2) });
      doc.print = { file: 'print.json', id: b.print, name: p.name };
    }
    if (b.image) {
      try {
        const r = await fetch(b.image);
        if (r.ok) {
          const ext = (b.image.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1];
          files.push({ name: 'image.' + ext, data: new Uint8Array(await r.arrayBuffer()) });
          doc.image = 'image.' + ext;
        }
      } catch (_) { /* تُترك الصورة */ }
    }
    files.unshift({ name: 'bundle.json', data: JSON.stringify(doc, null, 2) });
    const blob = new Blob([makeZip(files)], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `حزمة غلاف - ${ctx.safeFile(b.name) || 'حزمة'}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ctx.toast('نُزّل ملف الحزمة: صورتها، والأغلفة بصورها، والأسلوب وتنسيق الطباعة');
  }

  /** وضع ملف حزمة: يدخل كل ما فيه (وما كان موجوداً بعينه في البرنامج لا يُكرَّر) ثم تُضاف الحزمة */
  async function importFile(file, ctx) {
    const files = await ctx.unzipFiles(file);
    const key = [...files.keys()].find((k) => /(^|\/)bundle\.json$/i.test(k));
    if (!key) throw new Error('هذا ليس ملف حزمة: لا bundle.json فيه');
    const root = key.replace(/bundle\.json$/i, '');
    let doc;
    try { doc = JSON.parse(await files.get(key).text()); } catch (_) { throw new Error('bundle.json غير مقروء'); }
    if (!doc || doc.format !== BUNDLE_FORMAT) throw new Error('هذا ليس ملف حزمة من «ورّاق»');
    ctx.toast('جارٍ استيراد الحزمة…');
    const [have, styles, prints, cur] = await Promise.all([
      ctx.api('GET', '/api/admin/covers'),
      ctx.api('GET', '/api/admin/styles').catch(() => ({ styles: [] })),
      ctx.api('GET', '/api/admin/print/presets').catch(() => ({ items: [] })),
      ctx.api('GET', '/api/admin/covers/bundles'),
    ]);
    // (معرّفات الطبقات تبقى كما هي مع الغلاف المستورد، فتصلح روابط الألوان له)
    const out = { name: String(doc.name || 'حزمة').slice(0, 60), color: doc.color || null, front: null, back: null, spine: null, style: null, print: null, links: Array.isArray(doc.links) ? doc.links : [] };
    const notes = [];
    for (const k of ['front', 'back', 'spine']) {
      const part = doc.parts && doc.parts[k];
      if (!part) continue;
      const same = have.designs.find((d) => d.id === part.id && d.name === part.name && (d.kind || 'front') === k);
      if (same) { out[k] = same.id; continue; }
      const f = files.get(root + (part.dir || k + '/') + 'cover.json');
      if (!f) { notes.push('لا ' + Core.KINDS[k] + ' في الملف'); continue; }
      const { design, lost } = await ctx.importDesignDoc(await f.text(), files, root + (part.dir || k + '/'), k);
      out[k] = design.id;
      if (lost) notes.push(`${lost} صورة لم توجد (${Core.KINDS[k]})`);
    }
    if (doc.style) {
      const same = styles.styles.find((s) => s.id === doc.style.id && s.name === doc.style.name);
      if (same) out.style = same.id;
      else {
        const f = files.get(root + (doc.style.file || 'style.json'));
        if (f) {
          const card = JSON.parse(await f.text());
          let st;
          try { st = await ctx.api('POST', '/api/admin/styles/import', { card }); } catch (err) {
            if (err.status === 409 && confirm(`بطاقة الأسلوب «${card.name || ''}» فيها كود يعمل في الكتاب. هل تثق بمصدرها وتريد تركيبها؟`)) st = await ctx.api('POST', '/api/admin/styles/import', { card, allowScript: true });
            else notes.push('لم يُركَّب الأسلوب');
          }
          if (st) out.style = st.id || (st.style && st.style.id) || null;
        }
      }
    }
    if (doc.print) {
      const same = prints.items.find((p) => p.id === doc.print.id && p.name === doc.print.name);
      if (same) out.print = same.id;
      else {
        const f = files.get(root + (doc.print.file || 'print.json'));
        if (f) {
          try { const j = await ctx.api('POST', '/api/admin/print/presets', JSON.parse(await f.text())); out.print = j.item.id; } catch (err) { notes.push('تنسيق الطباعة: ' + err.message); }
        }
      }
    }
    if (doc.image && ctx.upload) {
      const f = files.get(root + String(doc.image));
      if (f) {
        try { const up = await ctx.upload(f); if (up && up.kind === 'image') out.image = up.url; } catch (_) { notes.push('لم تُرفع صورة الحزمة'); }
      }
    }
    const bundles = (cur.bundles || []).concat([out]);
    await ctx.api('PUT', '/api/admin/covers/bundles', { bundles });
    B.cur = '__last';
    ctx.toast(`دخلت الحزمة «${out.name}»` + (notes.length ? ' · ' + notes.join('، ') : ''), !!notes.length);
  }

  window.CoverBundles = { show, importFile };
})();
