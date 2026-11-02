/*
 * render.js — مُصيِّر الغلاف على Canvas (مشترك بين لوحة المالك وصفحة المستخدم).
 *   - الصور السادة: تراكب لوني كامل (Color Overlay): كل البكسلات بلون واحد مع الحفاظ على الشفافية.
 *   - الصور ذات الطابع (جلد، ثلاثي الأبعاد): نمط المزج «Color» كما في فوتوشوب:
 *     يؤخذ التدرج والتشبع من اللون، وتبقى الإضاءة (الظلال والنقوش) من الصورة.
 *   - النص: حتى ٤ حدود متراكبة (الحد الأول ملاصق للنص)، تصغير تلقائي ليتسع للخانة، RTL.
 */
(function () {
  'use strict';
  const Core = window.CoverCore;

  const imgPromises = new Map();
  const imgReady = new Map();
  const alphaMaps = new Map();
  const tintCache = new Map();
  const TINT_MAX = 48;
  const srcIds = new Map();

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (imgPromises.has(src)) return imgPromises.get(src);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { imgReady.set(src, img); resolve(img); };
      img.onerror = () => { imgReady.set(src, null); resolve(null); };
      img.src = src;
    });
    imgPromises.set(src, p);
    return p;
  }

  const fontKey = (family, weight) => `${weight} 40px "${family}"`;
  const fontsLoaded = new Set();
  function loadFont(family, weight, text) {
    const k = family + '|' + weight;
    if (fontsLoaded.has(k) || !document.fonts || !document.fonts.load) return Promise.resolve();
    return document.fonts.load(fontKey(family, weight), text || 'بسم الله 123').then(() => fontsLoaded.add(k), () => {});
  }

  /** الخطوط المرفوعة من لوحة المالك: تُسجَّل في المستند */
  const registered = new Set();
  function registerFonts(list) {
    for (const f of list || []) {
      const k = f.family + '|' + f.src;
      if (registered.has(k) || !window.FontFace) continue;
      registered.add(k);
      try {
        const face = new FontFace(f.family, `url(${f.src})`, { weight: String(f.weight || 400) });
        document.fonts.add(face);
        face.load().catch(() => {});
      } catch (_) { /* خط غير صالح */ }
    }
  }

  function activeVariant(layer, rs) {
    const id = rs && rs.variant ? rs.variant[layer.id] : null;
    return layer.variants.find((v) => v.id === id) || layer.variants.find((v) => v.id === layer.defVariant) || layer.variants[0];
  }

  /** الصورة الأصلية للطبقة: بديلها الافتراضي (إليه تُقاس البدائل ذوات الوضع «خانة الأصل» و«القناع») */
  function refVariant(layer) {
    return layer.variants.find((v) => v.id === layer.defVariant) || layer.variants[0];
  }

  function isShown(layer, rs) {
    if (layer.section === 'slot' && !rs.volumeOn) return false;
    if (layer.type === 'image') return !rs.hidden[layer.id];
    const t = rs.texts[layer.id];
    return !(t && t.hidden);
  }

  /** تحميل كل ما يلزم قبل الرسم (صور وخطوط) */
  async function prepare(design, rs, data) {
    const jobs = [];
    if (rs.custom) jobs.push(loadImage(rs.custom.src));
    for (const l of design.layers) {
      if (l.type === 'image') {
        const v = activeVariant(l, rs);
        if (v && v.src) jobs.push(loadImage(v.src));
        // القناع يُرسم بشكل الصورة الأصلية
        const ref = v && v.fit === 'mask' ? refVariant(l) : null;
        if (ref && ref !== v && ref.src) jobs.push(loadImage(ref.src));
      } else {
        const t = rs.texts[l.id];
        jobs.push(loadFont(t ? t.font : l.font, t ? t.weight : l.weight, Core.textFor(l, rs, data)));
      }
    }
    await Promise.all(jobs);
  }

  /* ------------------------- التلوين ------------------------- */
  function tinted(img, src, w, h, color, mode) {
    w = Math.max(1, Math.min(8000, Math.round(w)));
    h = Math.max(1, Math.min(8000, Math.round(h)));
    // مفتاح قصير للمصدر (صور المستخدم data: طويلة جداً)
    let sid = srcIds.get(src);
    if (!sid) { sid = 's' + srcIds.size; srcIds.set(src, sid); }
    const key = [sid, w, h, color, mode].join('|');
    let c = tintCache.get(key);
    if (c) { tintCache.delete(key); tintCache.set(key, c); return c; }
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    if (mode === 'overlay') {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
    } else if (mode === 'color') {
      textureTint(g, w, h, color);
    } else if (mode === 'pscolor') {
      g.globalCompositeOperation = 'color';
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0, w, h);
    }
    tintCache.set(key, c);
    if (tintCache.size > TINT_MAX) tintCache.delete(tintCache.keys().next().value);
    return c;
  }

  /**
   * صبغ يحفظ النقش: لون الطبقة يصير هو اللون المتوسط للصورة، والنقش (الظلال والإضاءات)
   * يُحسب نسبةً إلى متوسط إضاءة الصورة. فالأبيض يبقى أبيض بظلال رمادية، والأسود أسود بإضاءات خفيفة.
   * (نمط «Color» في فوتوشوب يُبقي إضاءة الصورة نفسها، فلا يصل إلى الأبيض أو الأسود.)
   */
  function textureTint(g, w, h, color) {
    let im;
    try { im = g.getImageData(0, 0, w, h); } catch (_) { return; }
    const d = im.data;
    const n = parseInt(color.slice(1), 16);
    const cr = ((n >> 16) & 255) / 255, cg = ((n >> 8) & 255) / 255, cb = (n & 255) / 255;
    let sum = 0, wsum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a;
      wsum += a;
    }
    const m = Math.min(0.95, Math.max(0.05, wsum ? sum / wsum / 255 : 0.5));
    const lo = 0.75 / m, hi = 1 / (1 - m); // الظلال أخف قليلاً حتى لا يقسو النقش على الألوان الفاتحة
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const dl = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255 - m;
      let r, gg, b;
      if (dl < 0) { const f = 1 + dl * lo; r = cr * f; gg = cg * f; b = cb * f; }
      else { const t = dl * hi; r = cr + (1 - cr) * t; gg = cg + (1 - cg) * t; b = cb + (1 - cb) * t; }
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255;
    }
    g.putImageData(im, 0, 0);
  }

  /* ------------------------- النص ------------------------- */
  const measureCtx = document.createElement('canvas').getContext('2d');
  const fontStr = (weight, size, family) => `${weight} ${size}px "${family}", "Amiri", "Noto Naskh Arabic", serif`;

  function wrapLines(text, size, t, maxW) {
    measureCtx.font = fontStr(t.weight, size, t.font);
    measureCtx.direction = 'rtl';
    const out = [];
    out.ends = new Set(); // أواخر الفقرات (لا تُضبط من الطرفين)
    for (const para of String(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.ends.add(out.length); out.push(''); continue; }
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = line + ' ' + words[i];
        if (measureCtx.measureText(test).width <= maxW) line = test;
        else { out.push(line); line = words[i]; }
      }
      out.ends.add(out.length);
      out.push(line);
    }
    return out;
  }

  function textBox(layer, rs) {
    const t = rs.texts[layer.id] || { dx: 0, dy: 0 };
    return { x: layer.box.x + (t.dx || 0), y: layer.box.y + (t.dy || 0), w: layer.box.w, h: layer.box.h };
  }

  /** النص العمودي (في الكعب): يُخطَّط في إطار مدوَّر طولُه ارتفاعُ الخانة */
  const vertical = (layer) => layer.orient === 'v' || layer.orient === 'v2';

  /** تخطيط النص داخل خانته: الحجم النهائي والأسطر */
  function layoutText(layer, rs, data) {
    const t = rs.texts[layer.id];
    const text = Core.textFor(layer, rs, data);
    const box = textBox(layer, rs);
    const totalStroke = t.strokes.reduce((a, s) => a + s.width, 0);
    const vert = vertical(layer);
    const availW = Math.max(4, (vert ? box.h : box.w) - 2 * totalStroke);
    const availH = Math.max(4, (vert ? box.w : box.h) - 2 * totalStroke);
    const widest = (lines, size) => {
      measureCtx.font = fontStr(t.weight, size, t.font);
      return lines.reduce((m, l) => Math.max(m, measureCtx.measureText(l).width), 0);
    };
    const fits = (size) => {
      const lines = wrapLines(text, size, t, availW);
      return lines.length <= layer.maxLines && widest(lines, size) <= availW + 0.5 && lines.length * size * layer.lineHeight <= availH + 0.5 ? lines : null;
    };
    let size = t.size;
    let lines;
    if (layer.autoFit) {
      lines = fits(size);
      if (!lines) {
        let lo = Math.min(layer.minSize, size), hi = size, best = null;
        for (let i = 0; i < 14 && hi - lo > 0.5; i++) {
          const mid = (lo + hi) / 2;
          const r = fits(mid);
          if (r) { best = { size: mid, lines: r }; lo = mid; } else hi = mid;
        }
        if (best) { size = best.size; lines = best.lines; }
        else { size = Math.min(layer.minSize, size); lines = wrapLines(text, size, t, availW); }
      }
    } else {
      lines = wrapLines(text, size, t, availW);
    }
    return { text, lines, size, box, totalStroke, t, availW };
  }

  function drawText(ctx, layer, rs, data) {
    const L = layoutText(layer, rs, data);
    if (!L.text.trim()) return;
    const { t, size, lines, totalStroke } = L;
    let box = L.box;
    ctx.save();
    if (vertical(layer)) {
      // الكعب: يُدار الإطار حول مركز الخانة، فيصير طول السطر ارتفاعَها
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate(layer.orient === 'v' ? -Math.PI / 2 : Math.PI / 2);
      box = { x: -box.h / 2, y: -box.w / 2, w: box.h, h: box.w };
    }
    ctx.font = fontStr(t.weight, size, t.font);
    ctx.direction = 'rtl';
    const justify = layer.align === 'justify';
    ctx.textAlign = justify ? 'right' : layer.align;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText('بسم');
    const asc = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : size * 0.8;
    const desc = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : size * 0.3;
    const lineH = size * layer.lineHeight;
    const x = layer.align === 'center' ? box.x + box.w / 2 : layer.align === 'left' ? box.x + totalStroke : box.x + box.w - totalStroke;
    const top = box.y + box.h / 2 - (lineH * lines.length) / 2;
    const baselines = lines.map((_, i) => top + lineH * i + lineH / 2 + (asc - desc) / 2);
    // الضبط من الطرفين: تُوزَّع المسافة بين الكلمات، إلا آخر سطر في الفقرة فيبقى على اليمين
    const each = (fn) => lines.forEach((ln, j) => {
      const words = justify && !(lines.ends && lines.ends.has(j)) ? ln.split(' ').filter(Boolean) : null;
      if (!words || words.length < 2) return fn(ln, x, baselines[j]);
      const ws = words.map((w) => ctx.measureText(w).width);
      const gap = (L.availW - ws.reduce((a, b) => a + b, 0)) / (words.length - 1);
      if (gap > size * 1.6) return fn(ln, x, baselines[j]); // سطر قصير جداً: لا تُمطّ فراغاته
      let px = x;
      words.forEach((w, i) => { fn(w, px, baselines[j]); px -= ws[i] + gap; });
    });

    // الحدود: من الأبعد إلى الأقرب، كل حد عرضه = مجموع ما قبله + عرضه
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    const cum = [];
    t.strokes.reduce((a, s, i) => (cum[i] = a + s.width), 0);
    for (let i = t.strokes.length - 1; i >= 0; i--) {
      const s = t.strokes[i];
      ctx.lineWidth = cum[i] * 2;
      ctx.strokeStyle = rs.colors['T:' + layer.id + ':s:' + s.id] || '#000000';
      each((ln, px, py) => ctx.strokeText(ln, px, py));
    }
    ctx.fillStyle = rs.colors['T:' + layer.id + ':fill'] || layer.color;
    each((ln, px, py) => ctx.fillText(ln, px, py));
    ctx.restore();
  }

  /* ------------------------- الصور ------------------------- */
  /**
   * موضع صورة الطبقة. dims: مقاس الغلاف (لوضع «ملء الغلاف»).
   * وللبديل ذي الوضع: خانته تُحسب من الصورة الأصلية (البديل الافتراضي) أو من الغلاف، و mask: مستطيل القناع وصورته.
   */
  function imageBox(layer, rs, dims) {
    const v = activeVariant(layer, rs);
    const o = (rs.offset && rs.offset[layer.id]) || { dx: 0, dy: 0 };
    const ref = refVariant(layer);
    const fit = v.fit === 'full' ? (dims ? 'full' : '') : v.fit && ref && ref !== v ? v.fit : '';
    if (fit) {
      const img = v.src ? imgReady.get(v.src) : null;
      const iw = v.iw || (img && img.naturalWidth), ih = v.ih || (img && img.naturalHeight);
      if (iw && ih) {
        const R = fit === 'full' ? { x: 0, y: 0, w: dims.w, h: dims.h } : { x: ref.x, y: ref.y, w: ref.w, h: ref.h };
        const k = (fit === 'slot' ? Math.min : Math.max)(R.w / iw, R.h / ih);
        const w = iw * k, h = ih * k;
        return {
          x: R.x + (R.w - w) / 2 + o.dx, y: R.y + (R.h - h) / 2 + o.dy, w, h, v,
          mask: fit === 'mask' ? { x: R.x + o.dx, y: R.y + o.dy, w: R.w, h: R.h, src: ref.src } : null,
        };
      }
    }
    return { x: v.x + o.dx, y: v.y + o.dy, w: v.w, h: v.h, v };
  }

  const maskCache = new Map();
  function drawImageLayer(ctx, layer, rs, scale, dims) {
    const b = imageBox(layer, rs, dims);
    const img = b.v.src ? imgReady.get(b.v.src) : null;
    if (!img) return false;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.imageSmoothingQuality = 'high';
    const color = rs.colors['L:' + layer.id];
    // بلا لون = ألوان الصورة الأصلية
    const plain = !layer.tint || b.v.mode === 'none' || !color;
    const pic = plain ? img : tinted(img, b.v.src, b.w * scale, b.h * scale, color, b.v.mode);
    const m = b.mask;
    const refImg = m && m.src ? imgReady.get(m.src) : null;
    if (m && refImg) {
      // القناع: الصورة الأصلية ترسم الشكل، والبديل يملؤه (source-in)
      const cw = Math.max(1, Math.min(8000, Math.round(m.w * scale))), chh = Math.max(1, Math.min(8000, Math.round(m.h * scale)));
      const key = [m.src, b.v.src, cw, chh, Math.round(b.x - m.x), Math.round(b.y - m.y), Math.round(b.w), plain ? '' : color + b.v.mode].join('|');
      let c = maskCache.get(key);
      if (!c) {
        c = document.createElement('canvas');
        c.width = cw; c.height = chh;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.scale(cw / m.w, chh / m.h);
        g.drawImage(refImg, 0, 0, m.w, m.h);
        g.globalCompositeOperation = 'source-in';
        g.drawImage(pic, b.x - m.x, b.y - m.y, b.w, b.h);
        maskCache.set(key, c);
        if (maskCache.size > 12) maskCache.delete(maskCache.keys().next().value);
      }
      ctx.drawImage(c, m.x, m.y, m.w, m.h);
    } else {
      // قناعٌ بلا صورة أصلية بعد: يُقصّ على خانتها فقط
      if (m) { ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip(); }
      ctx.drawImage(pic, b.x, b.y, b.w, b.h);
    }
    ctx.restore();
    return true;
  }

  /* ------------------------- الرسم الكامل ------------------------- */
  /**
   * يرسم الغلاف على canvas بمقياس scale (بكسل لكل وحدة تصميم).
   * opts: { scale, data, placeholders (لوحة المالك: إطار للبدائل التي لم تُرفع صورها) }
   */
  function draw(canvas, design, rs, opts) {
    opts = opts || {};
    // الكعب بعرض الكتاب الحقيقي (سم): يُمطّ أو يُضكّ أو تُقصّ أطرافه
    if (opts.spineCm && design.kind === 'spine') ({ design, rs } = Core.fitSpine(design, rs, opts.spineCm));
    const { w: W, h: H } = Core.canvasDims(design.canvas);
    const scale = opts.scale || canvas.width / W;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = design.canvas.bg;
    ctx.fillRect(0, 0, W, H);
    const custom = rs.custom && imgReady.get(rs.custom.src);
    if (custom) {
      // صورة المستخدم غلافاً: ملء الغلاف (قص) أو احتواء كامل
      const k = (rs.custom.fit === 'contain' ? Math.min : Math.max)(W / custom.naturalWidth, H / custom.naturalHeight);
      const iw = custom.naturalWidth * k, ih = custom.naturalHeight * k;
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(custom, (W - iw) / 2, (H - ih) / 2, iw, ih);
      ctx.restore();
    }
    for (const l of design.layers) {
      if (!isShown(l, rs)) continue;
      // فوق صورة المستخدم: نصوص الخلفية إن طلبها، وقسم الخانة (رقم المجلد) إن أبقاه
      if (custom && (l.section === 'slot' ? !rs.custom.keepVolume : l.type !== 'text' || !rs.custom.keepTexts)) continue;
      if (l.type === 'image') {
        const ok = drawImageLayer(ctx, l, rs, scale, { w: W, h: H });
        if (!ok && opts.placeholders) {
          const b = imageBox(l, rs, { w: W, h: H });
          ctx.save();
          ctx.setLineDash([10, 8]);
          ctx.strokeStyle = 'rgba(120,120,140,.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
          ctx.restore();
        }
      } else drawText(ctx, l, rs, opts.data);
    }
  }

  async function render(canvas, design, rs, opts) {
    await prepare(design, rs, opts && opts.data);
    draw(canvas, design, rs, opts);
  }

  async function exportCanvas(design, rs, opts) {
    opts = opts || {};
    await prepare(design, rs, opts.data);
    let fd = design;
    if (opts.spineCm && design.kind === 'spine') fd = Core.fitSpine(design, rs, opts.spineCm).design;
    const { w: W, h: H } = Core.canvasDims(fd.canvas);
    const dpi = opts.dpi || design.canvas.dpi;
    let pxW = Math.round((fd.canvas.widthCm / 2.54) * dpi);
    if (opts.maxWidth) pxW = Math.min(pxW, opts.maxWidth);
    // الكعب الضيق: المقياس من الارتفاع (فلا يُشوَّه بتقريب عرضٍ صغير)
    const scale = fd.kind === 'spine' ? Math.round((fd.canvas.heightCm / 2.54) * dpi) / H : pxW / W;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * scale));
    c.height = Math.round(H * scale);
    draw(c, design, rs, { scale, data: opts.data, spineCm: opts.spineCm });
    return c;
  }
  /** تصدير PNG بدقة الطباعة (المقاس بالسنتيمتر × DPI) */
  async function exportBlob(design, rs, opts) {
    const c = await exportCanvas(design, rs, opts);
    return new Promise((resolve) => c.toBlob(resolve, (opts && opts.type) || 'image/png', 0.95));
  }

  /* ------------------------- الحدود والالتقاط ------------------------- */
  function bounds(design, rs, layer) {
    if (layer.type === 'image') {
      const b = imageBox(layer, rs, Core.canvasDims(design.canvas));
      const r = b.mask || b;
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    }
    return textBox(layer, rs);
  }

  function alphaMap(src) {
    if (alphaMaps.has(src)) return alphaMaps.get(src);
    const img = imgReady.get(src);
    if (!img) return null;
    const k = Math.min(1, 256 / Math.max(img.naturalWidth || 256, img.naturalHeight || 256));
    const w = Math.max(1, Math.round((img.naturalWidth || 256) * k));
    const h = Math.max(1, Math.round((img.naturalHeight || 256) * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    let data = null;
    try { data = g.getImageData(0, 0, w, h).data; } catch (_) { /* مصدر خارجي */ }
    const m = { w, h, data };
    alphaMaps.set(src, m);
    return m;
  }

  /** أعلى طبقة تحت النقطة (للصور: بكسل غير شفاف فعلاً) */
  function hitTest(design, rs, x, y, filter) {
    for (let i = design.layers.length - 1; i >= 0; i--) {
      const l = design.layers[i];
      if (!isShown(l, rs) || (filter && !filter(l))) continue;
      const b = bounds(design, rs, l);
      if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
      if (l.type === 'text') return l;
      const v = activeVariant(l, rs);
      if (!v.src) continue;
      // القناع: الشكل شكل الصورة الأصلية
      const ref = v.fit === 'mask' ? refVariant(l) : null;
      const m = alphaMap(ref && ref !== v && ref.src ? ref.src : v.src);
      if (!m || !m.data) return l;
      const px = Math.min(m.w - 1, Math.floor(((x - b.x) / b.w) * m.w));
      const py = Math.min(m.h - 1, Math.floor(((y - b.y) / b.h) * m.h));
      if (m.data[(py * m.w + px) * 4 + 3] > 24) return l;
    }
    return null;
  }

  /* ------------------------- الصورة الخارجية الاحتياطية ------------------------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * صورة خارجية تُولَّد من ألوان التصميم إن لم يرفع المالك صورة.
   * مبنية على نفس «قالب الصورة الخارجية» (thumbnail-template.svg).
   */
  function fallbackThumb(design) {
    const p = design.palette || [];
    const c1 = p[0] || '#1f3a5f', c2 = p[1] || '#c9a54a', c3 = p[2] || '#f5efe0';
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    const star = 'M0,-34 L9,-13 L32,-14 L15,2 L24,24 L0,12 L-24,24 L-15,2 L-32,-14 L-9,-13Z';
    return `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(design.name)}">
  <defs>
    <radialGradient id="${id}r" cx="50%" cy="28%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
    <pattern id="${id}p" width="128" height="128" patternUnits="userSpaceOnUse"><path d="${star}" transform="translate(64 64)" fill="none" stroke="${c2}" stroke-width="3" opacity=".22"/><circle cx="0" cy="0" r="6" fill="${c2}" opacity=".2"/><circle cx="128" cy="128" r="6" fill="${c2}" opacity=".2"/></pattern>
    <filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".35"/></filter>
  </defs>
  <rect width="1024" height="1024" rx="180" fill="${c1}"/>
  <rect width="1024" height="1024" rx="180" fill="url(#${id}p)"/>
  <rect width="1024" height="1024" rx="180" fill="url(#${id}r)"/>
  <rect x="44" y="44" width="936" height="936" rx="146" fill="none" stroke="${c2}" stroke-width="6" opacity=".9"/>
  <rect x="64" y="64" width="896" height="896" rx="128" fill="none" stroke="${c2}" stroke-width="2" opacity=".6"/>
  <g filter="url(#${id}s)">
    <rect x="377" y="132" width="270" height="381" rx="10" fill="${c1}"/>
    <rect x="377" y="132" width="270" height="381" rx="10" fill="url(#${id}r)"/>
    <rect x="395" y="150" width="234" height="345" rx="4" fill="none" stroke="${c2}" stroke-width="5"/>
    <rect x="405" y="160" width="214" height="325" rx="2" fill="none" stroke="${c2}" stroke-width="1.6"/>
    <path d="${star}" transform="translate(512 270) scale(1.15)" fill="${c2}"/>
    <rect x="452" y="330" width="120" height="10" rx="5" fill="${c3}" opacity=".9"/>
    <rect x="472" y="352" width="80" height="7" rx="3.5" fill="${c3}" opacity=".6"/>
    <circle cx="512" cy="430" r="26" fill="none" stroke="${c2}" stroke-width="4"/>
  </g>
  <text x="512" y="700" text-anchor="middle" font-family="Amiri, 'Noto Naskh Arabic', serif" font-weight="700" font-size="96" fill="${c3}" direction="rtl">${esc(design.name)}</text>
  <g transform="translate(512 820)">${p.slice(0, 5).map((c, i, a) => `<circle cx="${(i - (a.length - 1) / 2) * 64}" cy="0" r="22" fill="${c}" stroke="${c3}" stroke-width="4"/>`).join('')}</g>
</svg>`;
  }

  window.CoverRender = { loadImage, loadFont, registerFonts, prepare, draw, render, exportBlob, exportCanvas, bounds, hitTest, activeVariant, refVariant, isShown, layoutText, fallbackThumb, imgReady };
})();
