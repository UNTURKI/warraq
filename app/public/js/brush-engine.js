// محرّك الفُرَش: يُطبع شكل الفرشاة بلون القلم على طول الخط، طبعةً بعد طبعة (كما في برامج الرسم).
// الأشكال: مضمّنة (تُرسم هنا، فلا حقوق لأحدٍ فيها) أو مما أضافه صاحب البرنامج من ملفات الفُرَش (‎/api/brushes‎).
//   المرجع: ‎'round'‎ (الخط المتصل المعتاد، يُرسم متّجهاً) · ‎'b:<id>'‎ مضمّن · ‎'s:<set>:<n>'‎ من مجموعة.

/* ------------------------------------------------------------------ عشوائيٌّ ثابت (فيُرسم الخط نفسه كل مرة) */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
export const seedOf = (str) => {
  let h = 2166136261;
  for (const ch of String(str || 'x')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/* ------------------------------------------------------------------ الأشكال المضمّنة */
// fixed: زاوية الشكل ثابتة (كرأس القلم المبريّ)؛ jitter: يدور الشكل عشوائياً مع كل طبعة (ملمس)؛ scatter: تبعثرٌ حول الخط
export const BUILTIN = [
  { id: 'round', name: 'مستدير', hint: 'الخط المتصل المعتاد', vector: true },
  { id: 'nib', name: 'قلم القصب', hint: 'رأسٌ مبريّ مائل: يغلظ ويرقّ كخط اليد', sp: 0.03, fixed: true, ang: -35 },
  { id: 'pencil', name: 'رصاص', hint: 'خطٌّ حبيبيٌّ خفيف', sp: 0.12, jitter: true },
  { id: 'soft', name: 'بخّاخ', hint: 'حافةٌ ناعمة', sp: 0.08 },
  { id: 'charcoal', name: 'فحم', hint: 'خشنٌ متكسّر', sp: 0.1, jitter: true },
  { id: 'brush', name: 'فرشاة حبر', hint: 'شعيراتٌ تتبع اتجاه الخط', sp: 0.04, follow: true },
  { id: 'chisel', name: 'رأس عريض', hint: 'كقلم التظليل المشطوف', sp: 0.04, fixed: true, ang: -20 },
  { id: 'spray', name: 'رذاذ', hint: 'نقطٌ متناثرة', sp: 0.35, jitter: true },
];
const BI = new Map(BUILTIN.map((b) => [b.id, b]));
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
/** قناع الشكل المضمّن (أسود بشفافية) */
function builtinMask(id) {
  const N = 96;
  const c = mkCanvas(N, N);
  const g = c.getContext('2d');
  const R = rng(seedOf(id));
  g.fillStyle = '#000';
  const r = N / 2;
  if (id === 'nib') {
    g.beginPath();
    g.ellipse(r, r, r - 2, (r - 2) * 0.16, 0, 0, Math.PI * 2);
    g.fill();
  } else if (id === 'chisel') {
    g.fillRect(4, r - r * 0.3, N - 8, r * 0.6);
  } else if (id === 'soft') {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(0,0,0,.55)');
    gr.addColorStop(0.5, 'rgba(0,0,0,.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, N, N);
  } else if (id === 'pencil') {
    for (let k = 0; k < 900; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (r - 3);
      g.globalAlpha = 0.25 + R() * 0.55;
      g.fillRect(r + Math.cos(a) * d, r + Math.sin(a) * d, 1.6, 1.6);
    }
  } else if (id === 'charcoal') {
    for (let k = 0; k < 60; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (r - 10);
      g.globalAlpha = 0.18 + R() * 0.3;
      g.beginPath();
      g.ellipse(r + Math.cos(a) * d, r + Math.sin(a) * d, 4 + R() * 9, 2 + R() * 5, R() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === 'brush') {
    // شعيرات: نقاطٌ في صفٍّ معترض على الاتجاه
    for (let k = 0; k < 26; k++) {
      const y = 6 + (k / 25) * (N - 12);
      g.globalAlpha = 0.45 + R() * 0.55;
      g.beginPath();
      g.arc(r + (R() - 0.5) * 6, y, 1.5 + R() * 2.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (id === 'spray') {
    for (let k = 0; k < 70; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (r - 3);
      g.globalAlpha = 0.5 + R() * 0.5;
      g.beginPath();
      g.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, 0.8 + R() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/* ------------------------------------------------------------------ المجموعات المضافة */
let setsP = null;
let setsAt = 0;
export function brushSets(force) {
  if (!setsP || force || Date.now() - setsAt > 60000) {
    setsAt = Date.now();
    setsP = fetch('/api/brushes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { sets: [] }))
      .then((j) => (Array.isArray(j.sets) ? j.sets : []))
      .catch(() => []);
  }
  return setsP;
}
const tips = new Map(); // المرجع ← Promise<{ src, w, h, sp, ang, fixed, jitter, follow }>
/** الشكل بمرجعه (أو null إن لم يُعثر عليه: يُرسم بالمستدير) */
export function getTip(ref) {
  if (!ref || ref === 'round') return Promise.resolve(null);
  if (tips.has(ref)) return tips.get(ref);
  const p = (async () => {
    if (ref.startsWith('b:')) {
      const b = BI.get(ref.slice(2));
      if (!b || b.vector) return null;
      const src = builtinMask(b.id);
      return { src, w: src.width, h: src.height, sp: b.sp, ang: b.ang || 0, fixed: !!b.fixed, jitter: !!b.jitter, follow: !!b.follow, name: b.name };
    }
    const m = /^s:([a-f0-9]{12}):(\d+)$/.exec(ref);
    if (!m) return null;
    const set = (await brushSets()).find((s) => s.id === m[1]);
    const t = set && set.tips.find((x) => String(x.n) === m[2]);
    if (!t) return null;
    const img = new Image();
    img.src = t.url;
    try {
      await img.decode();
    } catch {
      return null;
    }
    return { src: img, w: t.w, h: t.h, sp: t.sp || 0.25, ang: t.ang || 0, fixed: !!t.ang, jitter: false, follow: false, name: t.name, set: set.name };
  })();
  tips.set(ref, p);
  p.then((x) => !x && tips.delete(ref));
  return p;
}
/** الشكل ملوّناً (يُحفظ لكل لون) */
const tinted = new Map();
function tintOf(tip, color, ref) {
  const key = ref + '|' + color;
  let c = tinted.get(key);
  if (c) return c;
  c = mkCanvas(tip.w, tip.h);
  const g = c.getContext('2d');
  g.drawImage(tip.src, 0, 0, tip.w, tip.h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, tip.w, tip.h);
  if (tinted.size > 200) tinted.delete(tinted.keys().next().value);
  tinted.set(key, c);
  return c;
}

/* ------------------------------------------------------------------ الخط: نقاطٌ ناعمة ثم طبعاتٌ متساوية البعد */
/** النقاط (بالبكسل، والثالث الضغط) ← خطٌّ كثيف ناعم (منحنياتٌ تربيعية بين أوساط النقاط، كالخط المتّجه) */
function smooth(P, step) {
  if (P.length < 3) return P.slice();
  const out = [P[0]];
  let prev = P[0];
  for (let k = 1; k < P.length - 1; k++) {
    const c = P[k];
    const m = [(P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2, ((P[k][2] ?? 0.5) + (P[k + 1][2] ?? 0.5)) / 2];
    const len = Math.hypot(c[0] - prev[0], c[1] - prev[1]) + Math.hypot(m[0] - c[0], m[1] - c[1]);
    const n = Math.max(1, Math.ceil(len / Math.max(0.5, step)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * prev[0] + 2 * u * t * c[0] + t * t * m[0], u * u * prev[1] + 2 * u * t * c[1] + t * t * m[1], u * (prev[2] ?? 0.5) + t * (m[2] ?? 0.5)]);
    }
    prev = m;
  }
  out.push(P[P.length - 1]);
  return out;
}
/** نقاط الطبع على طول الخط (كل «بُعد» بكسلاً) */
function stamps(P, gap) {
  const out = [];
  if (!P.length) return out;
  out.push({ x: P[0][0], y: P[0][1], p: P[0][2] ?? 0.5, dir: P.length > 1 ? Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) : 0 });
  let carry = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!d) continue;
    const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let s = gap - carry;
    while (s <= d) {
      const t = s / d;
      out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, p: (a[2] ?? 0.5) + ((b[2] ?? 0.5) - (a[2] ?? 0.5)) * t, dir });
      s += gap;
    }
    carry = d - (s - gap);
  }
  return out;
}
/**
 * يرسم خطّاً بالفرشاة على ctx.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number,number,number?]>} P  النقاط بالبكسل (والضغط ٠–١ إن وُجد)
 * @param {object} o  { tip, ref, color, size (قطر بالبكسل), opacity, spacing?, follow?, seed, pressure }
 */
export function drawStroke(ctx, P, o) {
  const tip = o.tip;
  if (!tip || !P.length) return;
  const size = Math.max(0.6, o.size);
  const sc = size / Math.max(tip.w, tip.h);
  const sw = tip.w * sc, sh = tip.h * sc;
  const gap = Math.max(0.35, size * (o.spacing || tip.sp || 0.25));
  const pts = stamps(smooth(P, gap / 2), gap);
  // طبقةٌ بقدر الخط، تُطبع فيها الطبعات كاملة ثم تُلصق بشفافية القلم (فلا تتراكم الشفافية في التقاطعات)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of pts) {
    if (s.x < x0) x0 = s.x;
    if (s.y < y0) y0 = s.y;
    if (s.x > x1) x1 = s.x;
    if (s.y > y1) y1 = s.y;
  }
  const pad = Math.ceil(Math.hypot(sw, sh) / 2) + 2;
  const bx = Math.floor(x0 - pad), by = Math.floor(y0 - pad);
  const W = Math.ceil(x1 - x0 + pad * 2) + 2, H = Math.ceil(y1 - y0 + pad * 2) + 2;
  if (W > 16000 || H > 16000) return;
  const layer = mkCanvas(Math.max(1, W), Math.max(1, H));
  const g = layer.getContext('2d');
  const img = tintOf(tip, o.color, o.ref || '');
  const R = rng(o.seed || 1);
  const follow = o.follow ?? tip.follow;
  const base = ((tip.ang || 0) * Math.PI) / 180;
  for (const s of pts) {
    const pr = o.pressure ? 0.35 + 0.65 * Math.max(0, Math.min(1, s.p)) : 1;
    const k = pr;
    let ang = base + (follow ? s.dir : 0);
    if (tip.jitter) ang += R() * Math.PI * 2;
    g.save();
    g.translate(s.x - bx, s.y - by);
    if (ang) g.rotate(ang);
    g.drawImage(img, (-sw * k) / 2, (-sh * k) / 2, sw * k, sh * k);
    g.restore();
  }
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0.05, Math.min(1, o.opacity ?? 1));
  ctx.drawImage(layer, bx, by);
  ctx.globalAlpha = ga;
}
/** حدود الخط بالبكسل (لتصديره صورةً) */
export function strokeBox(P, size) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const pad = size * 0.8 + 2;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/** معاينة شكلٍ: خطٌّ متموّج بعرض اللوحة */
export async function preview(canvas, ref, color = '#2A1D14', opt = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const size = opt.size || H * 0.42;
  const P = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    P.push([W * 0.08 + t * W * 0.84, H / 2 + Math.sin(t * Math.PI * 2) * H * 0.18, 0.3 + 0.7 * Math.sin(t * Math.PI)]);
  }
  const tip = await getTip(ref);
  if (!tip) {
    g.strokeStyle = color;
    g.globalAlpha = opt.opacity ?? 1;
    g.lineWidth = size * 0.55;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.globalAlpha = 1;
    return;
  }
  drawStroke(g, P, { tip, ref, color, size, opacity: opt.opacity ?? 1, seed: 7, pressure: true, follow: opt.follow });
}
/** صورة الشكل وحده (لأزرار الاختيار) */
export async function tipThumb(canvas, ref, color = '#2A1D14') {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const tip = await getTip(ref);
  if (!tip) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.36, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const k = Math.min((canvas.width * 0.86) / tip.w, (canvas.height * 0.86) / tip.h);
  const img = tintOf(tip, color, ref);
  g.save();
  g.translate(canvas.width / 2, canvas.height / 2);
  if (tip.ang) g.rotate((tip.ang * Math.PI) / 180);
  g.drawImage(img, (-tip.w * k) / 2, (-tip.h * k) / 2, tip.w * k, tip.h * k);
  g.restore();
}
