// محرر «صفحة النص» في إعدادات الطباعة: تكتب فيه كما تكتب في Word، على صفحة بمقاسها وهوامشها كما تُطبع.
// لكل جزء تحدده من النص: حجمه وخطه وكونه عريضاً ولونه. ولكل فقرة: محاذاتها (يمين، وسط، يسار، ضبط).
// المخزَّن: فقرات [{ align, runs: [{ t, b, sizePt, font, color }] }] — وهي نفسها ما يُطبع في PDF و Word.
// والصورة فقرة: { align, img: { src, w, h }, widthPct, free, layer }:
//   حرّة (free: { xPct, yPct } موضع وسطها من الصفحة، وعرضها من عرض الصفحة): لا تؤثر في النص ولا تأخذ من حيّزه شيئاً،
//     تُسحب بالمؤشر إلى أي موضع وتُكبَّر من زواياها، وهي أمام النص أو خلفه (layer: 'front' | 'behind')؛
//   أو في سطرها بين الفقرات (free: null، وعرضها من عرض النص): تزيح النص، وتُسحب بين الفقرات.
const ROLES = { heading: 'خط العناوين', body: 'خط المتن', cover: 'خط عنوان الغلاف', names: 'خط الأسماء' };
const DEF = { b: true, sizePt: 18, font: 'heading', color: '' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AUTO = '#010203'; // «لون نص الكتاب»: لون وهمي يُكتب في المحرر ويُخزَّن فارغاً
const hex = (c) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c || '');
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
  return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '';
};

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {Array} o.paras                      الفقرات الحالية
 * @param {() => object} o.roleFonts           خطوط الأسلوب: { heading, body, cover, names } ← أسماء الخطوط الفعلية
 * @param {Array<[string, string]>} o.fonts    خطوط الموقع: [الاسم، المسمّى]
 * @param {string} [o.textColor]               لون نص الكتاب (ما يُعرض به «اللون التلقائي»)
 * @param {(paras: Array) => void} o.onChange
 * @param {(file: File) => Promise<{src,w,h}>} [o.pickImage]  تجهيز صورة مرفوعة (بغيابه لا يظهر زر الصورة)
 * @param {{w:number,h:number,side:number,top:number,bottom:number}} [o.page]  مقاس الصفحة وهوامشها (مم)
 * @param {'top'|'middle'|'bottom'} [o.v]      موضع النص الرأسي في الصفحة
 * @param {number} [o.lineHeight]              تباعد الأسطر
 */
export function mountRichText(host, o) {
  const roles = o.roleFonts() || {};
  const famCss = (f) => (ROLES[f] ? `wq-${f}, "${roles[f] || ''}", serif` : `"${f}", serif`);
  host.classList.add('rt');
  host.innerHTML = `
    <div class="rt-tools">
    <div class="rt-bar" role="toolbar" aria-label="تنسيق النص">
      <select class="inp rt-font" title="الخط" aria-label="الخط">
        <optgroup label="خطوط الأسلوب (تتبع ما يُختار في الإعدادات)">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</optgroup>
        <optgroup label="خط بعينه">${o.fonts.map(([f, t]) => `<option value="${esc(f)}">${esc(t)}</option>`).join('')}</optgroup>
      </select>
      <label class="rt-size" title="حجم الخط (نقطة)"><input class="inp" type="number" min="8" max="72" step="1" value="18" aria-label="حجم الخط"><span>نقطة</span></label>
      <button type="button" class="rt-btn rt-bold" data-cmd="bold" title="عريض (Ctrl+B)" aria-pressed="false"><b>B</b></button>
      <label class="rt-color" title="لون النص"><span class="color"><input type="color" value="#6b1d2f" aria-label="لون النص"></span></label>
      <button type="button" class="rt-btn rt-auto" data-cmd="auto" title="لون نص الكتاب (يتبع الإعدادات)">تلقائي</button>
      <span class="rt-sep"></span>
      <span class="rt-align" role="group" aria-label="المحاذاة">
        <button type="button" class="rt-btn" data-align="start" title="يبدأ من اليمين">${alignIcon('r')}</button>
        <button type="button" class="rt-btn" data-align="center" title="في الوسط">${alignIcon('c')}</button>
        <button type="button" class="rt-btn" data-align="end" title="يبدأ من اليسار">${alignIcon('l')}</button>
        <button type="button" class="rt-btn" data-align="justify" title="ضبط السطر من الطرفين">${alignIcon('j')}</button>
      </span>
      ${o.pickImage ? `<span class="rt-sep"></span><label class="rt-btn rt-addimg" tabindex="0" title="إدراج صورة في الصفحة"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5 4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> صورة<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>` : ''}
    </div>
    <div class="rt-chips" hidden></div>
    <div class="rt-imgbar" hidden></div>
    </div>
    <div class="rt-stage"><div class="rt-fit"><div class="rt-page" tabindex="-1" dir="rtl">
      <div class="rt-wrap"><div class="rt-area" contenteditable="true" dir="rtl" spellcheck="false" role="textbox" aria-multiline="true" aria-label="نص الصفحة"></div></div>
      <div class="rt-layer"></div>
      <i class="rt-guide gx" hidden></i><i class="rt-guide gy" hidden></i><i class="rt-drop" hidden></i>
    </div></div></div>
    <p class="rt-over small" hidden>النص أطول من الصفحة: صغّر الخط أو قلّل الأسطر.</p>
    <p class="muted small rt-hint">هذه الصفحة كما تُطبع. حدّد جزءاً من النص ثم غيّر حجمه أو خطه أو لونه، أو اجعله عريضاً. والمحاذاة للفقرة التي فيها المؤشر. ${o.pickImage ? 'زر «صورة» يضع صورة حرّة على الصفحة: اسحبها إلى أي موضع واسحب زواياها لتكبيرها وتصغيرها، والنص لا يتأثر بها (والأسهم تحرّكها بدقة، وتلتقط وسط الصفحة وهوامشها، و Alt يوقف الالتقاط). وإن أردتها تزيح النص فاجعلها «في سطر» ثم اسحبها إلى ما بين فقرتين. ' : ''}يُقبل في النص: <code>{{title}}</code> <code>{{author}}</code> <code>{{publisher}}</code> <code>{{edition}}</code>.</p>`;
  const area = host.querySelector('.rt-area');
  const $ = (s) => host.querySelector(s);
  /* ---------- الصفحة: بمقاسها وهوامشها، مصغَّرة إلى عرض المكان ---------- */
  const PG = { w: 170, h: 240, side: 20, top: 18, bottom: 14, ...(o.page && o.page.w > 0 && o.page.h > 0 ? o.page : {}) };
  const stage = $('.rt-stage');
  const fit = $('.rt-fit');
  const pageEl = $('.rt-page');
  const wrap = $('.rt-wrap');
  const layer = $('.rt-layer');
  pageEl.style.width = PG.w + 'mm';
  pageEl.style.height = PG.h + 'mm';
  wrap.style.cssText = `top:${PG.top}mm;bottom:${PG.bottom}mm;left:${PG.side}mm;right:${PG.side}mm`;
  let scale = 1;
  function fitPage() {
    const w = pageEl.offsetWidth;
    const h = pageEl.offsetHeight;
    const room = stage.clientWidth - 24;
    if (!w || room <= 0) return;
    // الصفحة كلها ظاهرة في النافذة ما أمكن (فلا تغيب أدواتها عند العمل في أسفلها)
    scale = Math.max(0.45, Math.min(1, room / w, (window.innerHeight * 0.74) / h));
    scale = Math.min(scale, room / w);
    pageEl.style.transform = `scale(${scale})`;
    pageEl.style.setProperty('--k', scale);
    fit.style.width = w * scale + 'px';
    fit.style.height = h * scale + 'px';
  }
  function setLayout(l = {}) {
    const v = l.v || 'middle';
    wrap.className = 'rt-wrap v-' + (v === 'top' || v === 'bottom' ? v : 'middle');
    area.style.lineHeight = String(Math.min(3, Math.max(1, Number(l.lineHeight) || 1.75)));
    checkOver();
  }
  function checkOver() {
    const over = $('.rt-over');
    if (over) over.hidden = !(area.scrollHeight > wrap.clientHeight + 2);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(fitPage).observe(stage);
  requestAnimationFrame(fitPage);
  area.style.color = o.textColor || '#1d1712';
  area.style.fontFamily = famCss(DEF.font);
  area.style.fontSize = DEF.sizePt + 'pt';
  area.style.fontWeight = '700';

  /* ---------- البيانات ← المحرر ---------- */
  const runHtml = (r) =>
    `<span style="font-family:${esc(famCss(r.font || DEF.font))};font-size:${Number(r.sizePt) || DEF.sizePt}pt;font-weight:${r.b === false ? 'normal' : 'bold'}${r.color ? ';color:' + esc(r.color) : ''}">${esc(r.t) || '<br>'}</span>`;
  const CSS_ALIGN = { start: 'right', end: 'left', center: 'center', justify: 'justify' };
  // صور الصفحة: بياناتها هنا، وعنصرها في المحرر يحمل مفتاحها وعرضها وموضعها
  const imgs = new Map();
  let imgSeq = 0;
  const clampN = (v, d, a, b) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
  const HANDLES = '<i class="rt-h nw"></i><i class="rt-h ne"></i><i class="rt-h sw"></i><i class="rt-h se"></i>';
  const fx = (v, d = 50) => clampN(v, d, 0, 100).toFixed(2);
  /** صورة في سطرها بين الفقرات (تزيح النص): عرضها من عرض النص */
  function imgBlockHtml(p) {
    const key = 'i' + ++imgSeq;
    imgs.set(key, { src: p.img.src, w: p.img.w, h: p.img.h });
    const wp = clampN(p.widthPct, 40, 5, 100);
    return `<div class="rt-imgp" contenteditable="false" data-img="${key}" data-w="${wp}" style="text-align:${CSS_ALIGN[p.align] || 'center'}"><span class="rt-imgbox" style="width:${wp}%"><img alt="" draggable="false" src="${p.img.src}">${HANDLES}</span></div>`;
  }
  /** صورة حرّة على الصفحة (لا تؤثر في النص): وسطها عند موضعها من الصفحة، وعرضها من عرض الصفحة */
  function freeEl(p, key) {
    if (!key) {
      key = 'i' + ++imgSeq;
      imgs.set(key, { src: p.img.src, w: p.img.w, h: p.img.h });
    }
    const el = document.createElement('div');
    el.className = 'rt-free' + (p.layer === 'behind' ? ' behind' : '');
    el.dataset.img = key;
    el.dataset.w = clampN(p.widthPct, 40, 5, 100);
    el.dataset.x = fx(p.free && p.free.xPct);
    el.dataset.y = fx(p.free && p.free.yPct);
    el.innerHTML = `<img alt="" draggable="false" src="${p.img.src}">${HANDLES}`;
    place(el);
    return el;
  }
  function place(el) {
    el.style.left = el.dataset.x + '%';
    el.style.top = el.dataset.y + '%';
    el.style.width = el.dataset.w + '%';
  }
  const isFree = (el) => !!el && el.classList.contains('rt-free');
  const allImgs = () => [...area.querySelectorAll('.rt-imgp'), ...layer.children];
  function load(paras) {
    const list = paras && paras.length ? paras : [{ align: 'center', runs: [{ ...DEF, t: '' }] }];
    imgs.clear();
    layer.textContent = '';
    area.innerHTML = list
      .filter((p) => !(p.img && p.img.src && p.free))
      .map((p) => (p.img && p.img.src ? imgBlockHtml(p) : `<div style="text-align:${CSS_ALIGN[p.align] || 'center'}">${(p.runs.length ? p.runs : [{ ...DEF, t: '' }]).map(runHtml).join('')}</div>`))
      .join('');
    for (const p of list) if (p.img && p.img.src && p.free) layer.appendChild(freeEl(p));
    // صفحة ليس في نصها إلا صور: سطر فارغ ليُكتب فيه
    if (!area.querySelector(':scope > div:not(.rt-imgp)')) area.insertAdjacentHTML('beforeend', `<div data-auto="1" style="text-align:center">${runHtml({ ...DEF, t: '' })}</div>`);
    chips();
  }

  /* ---------- المحرر ← البيانات ---------- */
  /** تنسيق عقدة نصية: أقرب ما صُرّح به فوقها، وإلا الأصل */
  function styleOf(node) {
    const st = { b: null, sizePt: null, font: null, color: null };
    for (let el = node.nodeType === 3 ? node.parentNode : node; el && el !== area; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      const s = el.style;
      if (st.b === null) {
        if (s.fontWeight) st.b = s.fontWeight === 'bold' || +s.fontWeight >= 600;
        else if (/^(B|STRONG)$/.test(el.tagName)) st.b = true;
      }
      if (st.sizePt === null && s.fontSize) {
        const v = parseFloat(s.fontSize);
        if (/pt$/.test(s.fontSize) && v) st.sizePt = v;
        else if (/px$/.test(s.fontSize) && v) st.sizePt = Math.round(v * 0.75 * 2) / 2;
      }
      if (st.font === null) {
        const f = s.fontFamily || (el.tagName === 'FONT' && el.getAttribute('face')) || '';
        const first = f.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (first) st.font = first.startsWith('wq-') && ROLES[first.slice(3)] ? first.slice(3) : first;
      }
      if (st.color === null) {
        const c = hex(s.color || (el.tagName === 'FONT' && el.getAttribute('color')) || '');
        if (c) st.color = c === AUTO ? '' : c;
      }
    }
    return { b: st.b ?? DEF.b, sizePt: st.sizePt ?? DEF.sizePt, font: st.font ?? DEF.font, color: st.color ?? DEF.color };
  }
  const ALIGN_OF = { right: 'start', left: 'end', center: 'center', justify: 'justify', start: 'start', end: 'end' };
  const isBlock = (n) => n.nodeType === 1 && /^(DIV|P|H[1-6]|LI|UL|OL|BLOCKQUOTE)$/.test(n.tagName);
  function read() {
    const paras = [];
    let cur = null;
    const open = (align) => {
      cur = { align: align || 'center', runs: [] };
      paras.push(cur);
    };
    const walk = (node, align) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
          if (!t) continue;
          if (!cur) open(align);
          const st = styleOf(n);
          const last = cur.runs[cur.runs.length - 1];
          if (last && last.b === st.b && last.sizePt === st.sizePt && last.font === st.font && last.color === st.color) last.t += t;
          else cur.runs.push({ t, ...st });
        } else if (n.nodeType === 1) {
          if (n.classList.contains('rt-imgp')) {
            // صورة: فقرة مستقلة
            const im = imgs.get(n.dataset.img);
            cur = null;
            if (im) paras.push({ align: ((a) => (a === 'justify' ? 'center' : a))(ALIGN_OF[n.style.textAlign] || 'center'), img: { ...im }, widthPct: +clampN(n.dataset.w, 40, 5, 100).toFixed(2), free: null, runs: [] });
            continue;
          }
          if (n.tagName === 'BR') {
            // سطر فارغ داخل فقرة فارغة يحفظ تنسيقها، وفاصل سطر داخل فقرة يبدأ فقرة جديدة
            if (!cur) open(align);
            if (!cur.runs.length) cur.runs.push({ t: '', ...styleOf(n) });
            else if (n.nextSibling) cur = null;
          } else if (isBlock(n)) {
            // سطر الكتابة الذي يضيفه المحرر بعد صورة في آخر الصفحة: لا يُحفظ ما دام فارغاً
            if (n.dataset.auto && !n.textContent.trim()) continue;
            cur = null;
            const a = ALIGN_OF[n.style.textAlign] || align;
            const before = paras.length;
            walk(n, a);
            if (paras.length === before) open(a); // فقرة فارغة تماماً
            cur = null;
          } else walk(n, align);
        }
      }
    };
    walk(area, 'center');
    for (const p of paras) if (!p.img && !p.runs.length) p.runs.push({ t: '', ...DEF });
    if (!paras.some((p) => !p.img)) paras.push({ align: 'center', runs: [{ t: '', ...DEF }] });
    // الصور الحرّة بعد النص، بترتيبها (الأخيرة فوق ما قبلها)
    for (const el of layer.children) {
      const im = imgs.get(el.dataset.img);
      if (im) paras.push({ align: 'center', img: { ...im }, widthPct: +clampN(el.dataset.w, 40, 5, 100).toFixed(2), free: { xPct: +fx(el.dataset.x), yPct: +fx(el.dataset.y) }, layer: el.classList.contains('behind') ? 'behind' : 'front', runs: [] });
    }
    return paras;
  }

  /* ---------- التحديد والأوامر ---------- */
  let saved = null;
  const inArea = (n) => n && (n === area || area.contains(n));
  const onSel = () => {
    // المحرر أُزيل من الصفحة (أُعيد رسم النموذج): يُفك مستمعه
    if (!area.isConnected) return document.removeEventListener('selectionchange', onSel);
    const s = document.getSelection();
    if (s.rangeCount && inArea(s.anchorNode) && inArea(s.focusNode)) {
      saved = s.getRangeAt(0).cloneRange();
      sync();
    }
  };
  document.addEventListener('selectionchange', onSel);
  function restore() {
    area.focus();
    if (!saved) return;
    const s = document.getSelection();
    s.removeAllRanges();
    s.addRange(saved);
  }
  /** الفقرة (العنصر) التي فيها العقدة */
  const blockOf = (n) => {
    for (let el = n && n.nodeType === 3 ? n.parentNode : n; el && el !== area; el = el.parentNode) if (isBlock(el)) return el;
    return null;
  };
  /** أدوات الشريط تُظهر تنسيق موضع المؤشر */
  function sync() {
    if (!saved) return;
    const st = styleOf(saved.startContainer.nodeType === 1 && saved.startContainer.childNodes[saved.startOffset] ? saved.startContainer.childNodes[saved.startOffset] : saved.startContainer);
    const sel = $('.rt-font');
    if (![...sel.options].some((x) => x.value === st.font)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(st.font)}">${esc(st.font)}</option>`);
    sel.value = st.font;
    if (document.activeElement !== $('.rt-size input')) $('.rt-size input').value = st.sizePt;
    $('.rt-bold').setAttribute('aria-pressed', String(st.b));
    $('.rt-color input').value = st.color || hex(area.style.color) || '#1d1712';
    $('.rt-auto').setAttribute('aria-pressed', String(!st.color));
    const b = blockOf(saved.startContainer);
    const al = ALIGN_OF[(b && b.style.textAlign) || 'center'] || 'center';
    host.querySelectorAll('[data-align]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.align === al)));
  }
  let pendingSize = 0;
  /** «xxx-large» الذي يكتبه المتصفح للحجم ٧ ← الحجم المطلوب بالنقطة */
  function fixSizes() {
    if (!pendingSize) return;
    for (const el of area.querySelectorAll('[style*="xxx-large"], font[size="7"]')) {
      el.removeAttribute('size');
      el.style.fontSize = pendingSize + 'pt';
    }
  }
  function exec(cmd, val) {
    restore();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
    fixSizes();
    changed();
  }
  function changed() {
    const s = document.getSelection();
    if (s.rangeCount && inArea(s.anchorNode)) saved = s.getRangeAt(0).cloneRange();
    sync();
    checkOver();
    o.onChange(read());
  }

  host.querySelector('.rt-bar').addEventListener('mousedown', (e) => {
    // الأزرار لا تسحب التحديد من النص
    if (e.target.closest('button')) e.preventDefault();
  });
  host.querySelector('.rt-bar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cmd === 'bold') return exec('bold');
    if (b.dataset.cmd === 'auto') return exec('foreColor', AUTO);
    if (b.dataset.align) {
      // صورة مختارة: المحاذاة لها
      if (selImg && !isFree(selImg) && area.contains(selImg)) {
        selImg.style.textAlign = CSS_ALIGN[b.dataset.align === 'justify' ? 'center' : b.dataset.align];
        imgBar();
        return o.onChange(read());
      }
      return exec({ start: 'justifyRight', end: 'justifyLeft', center: 'justifyCenter', justify: 'justifyFull' }[b.dataset.align]);
    }
  });

  /* ---------- الصور: إدراجها، وسحبها على الصفحة، وتكبيرها من زواياها ---------- */
  let selImg = null;
  const bar = $('.rt-imgbar');
  const east = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  const gx = $('.rt-guide.gx');
  const gy = $('.rt-guide.gy');
  const drop = $('.rt-drop');
  const imgChanged = () => {
    checkOver();
    o.onChange(read());
  };
  function selectImg(el) {
    if (selImg && selImg !== el) selImg.classList.remove('sel');
    selImg = el && host.contains(el) ? el : null;
    if (selImg) selImg.classList.add('sel');
    imgBar();
    chips();
  }
  /** صور الصفحة أزراراً صغيرة (ليُختار منها ما كان خلف النص أو صغيراً) */
  function chips() {
    const box = $('.rt-chips');
    if (!box) return;
    const list = allImgs();
    box.hidden = !list.length;
    box.innerHTML = list.length ? '<span>صور الصفحة:</span>' + list.map((el, i) => `<button type="button" class="rt-chip" data-chip="${el.dataset.img}" aria-pressed="${el === selImg}" title="${isFree(el) ? (el.classList.contains('behind') ? 'حرّة خلف النص' : 'حرّة') : 'في سطر النص'}"><img alt="صورة ${i + 1}" src="${(imgs.get(el.dataset.img) || {}).src || ''}"></button>`).join('') : '';
  }
  /** شريط الصورة المختارة: هل تؤثر في النص؟ وأمامه أم خلفه؟ وعرضها وتوسيطها وحذفها */
  function imgBar() {
    bar.hidden = !selImg;
    if (!selImg) return;
    const free = isFree(selImg);
    const behind = selImg.classList.contains('behind');
    const wp = Math.round(clampN(selImg.dataset.w, 40, 5, 100));
    const al = ALIGN_OF[selImg.style.textAlign] || 'center';
    host.querySelectorAll('[data-align]').forEach((b) => b.setAttribute('aria-pressed', String(!free && b.dataset.align === al)));
    bar.innerHTML = `
      <div class="rt-imgrow">
        <b class="rt-imgt">الصورة</b>
        <span class="rt-seg" role="group" aria-label="هل تؤثر الصورة في النص؟">
          <button type="button" class="rt-btn" data-imode="free" aria-pressed="${free}" title="تضعها حيث شئت من الصفحة، والنص لا يتحرك ولا يُؤخذ من حيّزه شيء">حرّة: لا تؤثر في النص</button>
          <button type="button" class="rt-btn" data-imode="inline" aria-pressed="${!free}" title="تأخذ سطراً بين الفقرات فتزيح النص">في سطر: تزيح النص</button>
        </span>
        ${free ? `<span class="rt-seg" role="group" aria-label="ترتيبها مع النص"><button type="button" class="rt-btn" data-ilayer="front" aria-pressed="${!behind}">أمام النص</button><button type="button" class="rt-btn" data-ilayer="behind" aria-pressed="${behind}">خلف النص</button></span>` : ''}
        <label class="rt-imgw">العرض <input class="inp" type="number" min="5" max="100" step="1" value="${wp}" data-iw> ٪ <small>${free ? 'من عرض الصفحة' : 'من عرض النص'}</small></label>
        ${free ? `<button type="button" class="rt-btn" data-icenter="x" title="توسيطها بين يمين الصفحة ويسارها">وسّطها أفقياً</button><button type="button" class="rt-btn" data-icenter="y" title="توسيطها بين أعلى الصفحة وأسفلها">وسّطها رأسياً</button>` : ''}
        <button type="button" class="rt-btn rt-del" data-idel title="حذف الصورة (Delete)">حذف</button>
      </div>`;
  }
  /* ---- هندسة الصفحة ---- */
  const prect = () => pageEl.getBoundingClientRect();
  /** نسبة ارتفاع الصورة الحرّة من ارتفاع الصفحة (٪) */
  const hPct = (el) => {
    const im = imgs.get(el.dataset.img) || { w: 1, h: 1 };
    return ((+el.dataset.w * im.h) / im.w) * (PG.w / PG.h);
  };
  /** هل تقع النقطة على سطر من النص؟ (الصورة التي خلف النص تُمسك حيث لا نص فوقها) */
  function onText(x, y) {
    const rg = document.createRange();
    for (const b of area.children) {
      if (b.classList.contains('rt-imgp')) continue;
      rg.selectNodeContents(b);
      for (const r of rg.getClientRects()) if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 1 && y <= r.bottom + 1) return true;
    }
    return false;
  }
  const inRect = (r, x, y, pad = 0) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  const boxOf = (el) => (isFree(el) ? el : el.querySelector('.rt-imgbox')).getBoundingClientRect();
  /** زاوية الصورة المختارة تحت المؤشر: nw ne sw se */
  function cornerAt(el, x, y) {
    const r = boxOf(el);
    const t = 9;
    const nx = Math.abs(x - r.left) <= t ? 'w' : Math.abs(x - r.right) <= t ? 'e' : '';
    const ny = Math.abs(y - r.top) <= t ? 'n' : Math.abs(y - r.bottom) <= t ? 's' : '';
    return nx && ny ? ny + nx : '';
  }
  /** الصورة تحت المؤشر: الأمامية أولاً (الأخيرة فوق)، ثم التي في السطر، ثم التي خلف النص حيث لا نص فوقها */
  function imageAt(e) {
    const x = e.clientX;
    const y = e.clientY;
    const frees = [...layer.children].reverse();
    for (const el of frees) if (!el.classList.contains('behind') && inRect(el.getBoundingClientRect(), x, y)) return el;
    const inl = e.target.closest && e.target.closest('.rt-imgp');
    if (inl && area.contains(inl) && inRect(boxOf(inl), x, y, 3)) return inl;
    if (onText(x, y)) return null;
    for (const el of frees) if (el.classList.contains('behind') && inRect(el.getBoundingClientRect(), x, y)) return el;
    return null;
  }
  /** موضع الإدراج بين الفقرات عند ارتفاع y: الفقرة التي تُدرج قبلها (أو null للآخر) */
  function gapAt(y, skip) {
    for (const b of area.children) {
      if (b === skip) continue;
      const r = b.getBoundingClientRect();
      if (y < r.top + r.height / 2) return b;
    }
    return null;
  }
  const SNAP = 1.1; // ٪ من الصفحة
  /** التقاط: وسط الصفحة، وهوامشها، وحوافها */
  function snap(el, x, y, off) {
    let sx = null;
    let sy = null;
    if (!off) {
      const hw = +el.dataset.w / 2;
      const hh = hPct(el) / 2;
      const mx = (PG.side / PG.w) * 100;
      const mt = (PG.top / PG.h) * 100;
      const mb = 100 - (PG.bottom / PG.h) * 100;
      for (const [cand, line] of [[50, 50], [mx + hw, mx], [100 - mx - hw, 100 - mx], [hw, 0], [100 - hw, 100]]) if (sx === null && Math.abs(x - cand) <= SNAP) [x, sx] = [cand, line];
      for (const [cand, line] of [[50, 50], [mt + hh, mt], [mb - hh, mb], [hh, 0], [100 - hh, 100]]) if (sy === null && Math.abs(y - cand) <= SNAP) [y, sy] = [cand, line];
    }
    gx.hidden = sx === null;
    gy.hidden = sy === null;
    if (sx !== null) gx.style.left = sx + '%';
    if (sy !== null) gy.style.top = sy + '%';
    return [x, y];
  }
  const noGuides = () => {
    gx.hidden = gy.hidden = drop.hidden = true;
  };
  /* ---- السحب: كله على الصفحة نفسها، والمؤشر مُمسَك حتى يُرفع ---- */
  pageEl.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button) return;
      const corner = selImg ? cornerAt(selImg, e.clientX, e.clientY) : '';
      const el = corner ? selImg : imageAt(e);
      if (!el) {
        if (selImg) selectImg(null);
        return; // كتابة وتحديد في النص كالمعتاد
      }
      e.preventDefault();
      e.stopPropagation();
      if (el !== selImg) selectImg(el);
      pageEl.focus({ preventScroll: true });
      const P0 = prect();
      const free = isFree(el);
      const im = imgs.get(el.dataset.img) || { w: 1, h: 1 };
      const ratio = im.h / im.w;
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      let apply;
      if (corner) {
        // تكبير وتصغير من الزاوية: الزاوية المقابلة ثابتة، والنسبة محفوظة
        const r = boxOf(el);
        const ax = corner[1] === 'e' ? r.left : r.right;
        const ay = corner[0] === 's' ? r.top : r.bottom;
        const base = free ? P0.width : area.getBoundingClientRect().width;
        const centered = !free && (ALIGN_OF[el.style.textAlign] || 'center') === 'center';
        const cx0 = (r.left + r.right) / 2;
        apply = (ev) => {
          let w = centered ? 2 * Math.abs(ev.clientX - cx0) : Math.max(Math.abs(ev.clientX - ax), free ? Math.abs(ev.clientY - ay) / ratio : 0);
          w = Math.min(base, Math.max(base * 0.05, w));
          el.dataset.w = ((w / base) * 100).toFixed(2);
          if (free) {
            const cx = ax + (corner[1] === 'e' ? w / 2 : -w / 2);
            const cy = ay + (corner[0] === 's' ? (w * ratio) / 2 : (-w * ratio) / 2);
            el.dataset.x = fx(((cx - P0.left) / P0.width) * 100);
            el.dataset.y = fx(((cy - P0.top) / P0.height) * 100);
            place(el);
          } else el.querySelector('.rt-imgbox').style.width = el.dataset.w + '%';
          const inp = bar.querySelector('[data-iw]');
          if (inp) inp.value = Math.round(+el.dataset.w);
        };
      } else if (free) {
        // تحريك حرّ: الصورة تتبع المؤشر حيث ذهب
        const x0 = +el.dataset.x;
        const y0 = +el.dataset.y;
        apply = (ev) => {
          const [x, y] = snap(el, clampN(x0 + ((ev.clientX - start.x) / P0.width) * 100, 50, 0, 100), clampN(y0 + ((ev.clientY - start.y) / P0.height) * 100, 50, 0, 100), ev.altKey);
          el.dataset.x = fx(x);
          el.dataset.y = fx(y);
          place(el);
        };
      } else {
        // صورة في سطر النص: تُسحب إلى ما بين فقرتين
        apply = (ev) => {
          const before = gapAt(ev.clientY, el);
          const ar = area.getBoundingClientRect();
          const ref = before ? before.getBoundingClientRect().top : area.lastElementChild.getBoundingClientRect().bottom;
          drop.hidden = false;
          drop.style.top = ((ref - P0.top) / P0.height) * 100 + '%';
          drop.style.left = ((ar.left - P0.left) / P0.width) * 100 + '%';
          drop.style.width = (ar.width / P0.width) * 100 + '%';
          el.classList.add('drag');
        };
      }
      pageEl.setPointerCapture(e.pointerId);
      pageEl.classList.add(corner ? 'resizing' : 'dragging');
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
        moved = true;
        apply(ev);
      };
      const up = (ev) => {
        pageEl.removeEventListener('pointermove', move);
        pageEl.removeEventListener('pointerup', up);
        pageEl.removeEventListener('pointercancel', up);
        pageEl.classList.remove('dragging', 'resizing');
        try {
          pageEl.releasePointerCapture(e.pointerId);
        } catch {}
        if (moved && !corner && !free && ev.type === 'pointerup') {
          const before = gapAt(ev.clientY, el);
          if (before !== el.nextElementSibling || !before) area.insertBefore(el, before);
          // سحبها إلى جهة من السطر يحاذيها إليها
          const ar = area.getBoundingClientRect();
          if (Math.abs(ev.clientX - start.x) > 40) el.style.textAlign = CSS_ALIGN[ev.clientX > ar.left + (ar.width * 2) / 3 ? 'start' : ev.clientX < ar.left + ar.width / 3 ? 'end' : 'center'];
          if (!el.nextElementSibling) el.insertAdjacentHTML('afterend', `<div data-auto="1" style="text-align:center">${runHtml({ ...DEF, t: '' })}</div>`);
        }
        el.classList.remove('drag');
        noGuides();
        if (moved) {
          imgBar();
          imgChanged();
        }
      };
      pageEl.addEventListener('pointermove', move);
      pageEl.addEventListener('pointerup', up);
      pageEl.addEventListener('pointercancel', up);
    },
    true,
  );
  // شكل المؤشر فوق الصور وزواياها
  pageEl.addEventListener('pointermove', (e) => {
    if (pageEl.classList.contains('dragging') || pageEl.classList.contains('resizing')) return;
    const c = selImg ? cornerAt(selImg, e.clientX, e.clientY) : '';
    pageEl.style.cursor = c ? (c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize') : imageAt(e) ? 'grab' : '';
  });
  // لوحة المفاتيح للصورة المختارة: الأسهم تحرّكها، و Delete يحذفها، و Esc يتركها
  pageEl.addEventListener('keydown', (e) => {
    if (!selImg || e.target !== pageEl || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'Escape') return selectImg(null);
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      return removeImg(selImg);
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (!d) return;
    e.preventDefault();
    if (isFree(selImg)) {
      const st = e.shiftKey ? 2.5 : 0.5;
      selImg.dataset.x = fx(+selImg.dataset.x + d[0] * st);
      selImg.dataset.y = fx(+selImg.dataset.y + d[1] * st);
      place(selImg);
    } else if (d[1]) {
      const sib = d[1] < 0 ? selImg.previousElementSibling : selImg.nextElementSibling;
      if (!sib) return;
      if (d[1] < 0) area.insertBefore(selImg, sib);
      else area.insertBefore(sib, selImg);
    } else return;
    imgChanged();
  });
  function removeImg(el) {
    imgs.delete(el.dataset.img);
    el.remove();
    if (selImg === el) selImg = null;
    if (!area.firstChild) area.insertAdjacentHTML('beforeend', `<div data-auto="1" style="text-align:center">${runHtml({ ...DEF, t: '' })}</div>`);
    imgBar();
    chips();
    imgChanged();
  }
  /** من «في سطر» إلى «حرّة» في موضعها الظاهر نفسه، والعكس إلى أقرب ما بين فقرتين */
  function toFree(el) {
    const r = boxOf(el);
    const P0 = prect();
    const im = imgs.get(el.dataset.img);
    const n = freeEl({ img: im, widthPct: (r.width / P0.width) * 100, free: { xPct: ((r.left + r.width / 2 - P0.left) / P0.width) * 100, yPct: ((r.top + r.height / 2 - P0.top) / P0.height) * 100 } }, el.dataset.img);
    el.remove();
    layer.appendChild(n);
    if (!area.firstChild) area.insertAdjacentHTML('beforeend', `<div data-auto="1" style="text-align:center">${runHtml({ ...DEF, t: '' })}</div>`);
    return n;
  }
  function toInline(el) {
    const r = el.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    const im = imgs.get(el.dataset.img);
    const cx = r.left + r.width / 2;
    const tmp = document.createElement('div');
    const keep = imgSeq;
    tmp.innerHTML = imgBlockHtml({ align: cx > ar.left + (ar.width * 2) / 3 ? 'start' : cx < ar.left + ar.width / 3 ? 'end' : 'center', img: im, widthPct: Math.min(100, (r.width / ar.width) * 100) });
    const n = tmp.firstChild;
    // المفتاح نفسه (بيانات الصورة واحدة)
    imgs.delete('i' + (keep + 1));
    n.dataset.img = el.dataset.img;
    area.insertBefore(n, gapAt(r.top + r.height / 2, null));
    el.remove();
    if (!n.nextElementSibling) n.insertAdjacentHTML('afterend', `<div data-auto="1" style="text-align:center">${runHtml({ ...DEF, t: '' })}</div>`);
    return n;
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !selImg) return;
    if (b.dataset.imode) {
      const want = b.dataset.imode === 'free';
      if (want === isFree(selImg)) return;
      const n = want ? toFree(selImg) : toInline(selImg);
      selImg = null;
      selectImg(n);
    } else if (b.dataset.ilayer) {
      selImg.classList.toggle('behind', b.dataset.ilayer === 'behind');
      imgBar();
    } else if (b.dataset.icenter) {
      selImg.dataset[b.dataset.icenter] = '50.00';
      place(selImg);
    } else if (b.dataset.idel !== undefined) return removeImg(selImg);
    else return;
    chips();
    imgChanged();
  });
  bar.addEventListener('input', (e) => {
    const t = e.target;
    if (!selImg || t.dataset.iw === undefined || t.value === '') return;
    const wp = clampN(t.value, 40, 5, 100);
    selImg.dataset.w = wp;
    if (isFree(selImg)) place(selImg);
    else selImg.querySelector('.rt-imgbox').style.width = wp + '%';
    imgChanged();
  });
  const chipBox = $('.rt-chips');
  if (chipBox)
    chipBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip]');
      if (!b) return;
      selectImg(allImgs().find((el) => el.dataset.img === b.dataset.chip) || null);
      pageEl.focus({ preventScroll: true });
    });
  const addInp = host.querySelector('.rt-addimg input');
  if (addInp) {
    host.querySelector('.rt-addimg').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addInp.click()));
    addInp.addEventListener('change', async () => {
      const file = addInp.files[0];
      addInp.value = '';
      if (!file) return;
      let im;
      try {
        im = await o.pickImage(file);
      } catch {
        return;
      }
      if (!im || !im.src) return;
      if (allImgs().length >= 8) return;
      // صورة حرّة في وسط الصفحة (وإن كان في الوسط صورة فبجانبها): تُسحب بعدها إلى موضعها، والنص لا يتأثر
      let x = 50;
      let y = 50;
      for (let g = 0; g < 8 && [...layer.children].some((el) => Math.abs(+el.dataset.x - x) < 2 && Math.abs(+el.dataset.y - y) < 2); g++) {
        x += 4;
        y += 4;
      }
      const el = freeEl({ img: im, widthPct: 40, free: { xPct: x, yPct: y } });
      layer.appendChild(el);
      selectImg(el);
      pageEl.focus({ preventScroll: true });
      imgChanged();
    });
  }
  $('.rt-font').addEventListener('change', (e) => exec('fontName', famCss(e.target.value)));
  $('.rt-size input').addEventListener('change', (e) => {
    const v = Math.min(72, Math.max(8, Number(e.target.value) || DEF.sizePt));
    e.target.value = v;
    pendingSize = v;
    exec('fontSize', '7');
  });
  $('.rt-color input').addEventListener('input', (e) => exec('foreColor', e.target.value));

  area.addEventListener('input', () => {
    fixSizes();
    changed();
  });
  area.addEventListener('keydown', (e) => {
    // الكتابة أو تحريك المؤشر في النص: أزرار المحاذاة تعود للنص لا للصورة المختارة
    if (selImg && !e.ctrlKey && !e.metaKey && !e.altKey) selectImg(null);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      exec('bold');
    }
  });
  // اللصق نصاً فقط (بلا تنسيق من خارج)
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'));
  });
  try {
    document.execCommand('defaultParagraphSeparator', false, 'div');
  } catch {}

  load(o.paras);
  setLayout({ v: o.v, lineHeight: o.lineHeight });
  return { load, read, area, page: pageEl, selectImg, setLayout, fitPage };
}

function alignIcon(k) {
  const w = { r: [16, 10, 16, 8], c: [16, 10, 16, 10], l: [16, 10, 16, 8], j: [16, 16, 16, 16] }[k];
  const x = (len) => (k === 'r' ? 20 - len : k === 'l' ? 4 : 12 - len / 2);
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${w.map((len, i) => `<rect x="${x(len)}" y="${5 + i * 4}" width="${len}" height="1.8" rx=".9" fill="currentColor"/>`).join('')}</svg>`;
}
