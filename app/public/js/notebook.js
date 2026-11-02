// الدفتر على الرَّحل: صفحاتٌ بقوالب (فارغة، مسطّرة، مربعات، نقاط، كراسة خط، تفريغ، ورقة درس، متن وحاشية، أبيات…)
// تُرسم هنا ثم تُجمع ملفَّ PDF (لكل قالبٍ صورةٌ واحدة تتكرر في صفحاته) فيقرؤه قارئ ورّاق نفسه ويُكتب عليه بأقلامه.

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

export const SIZES = {
  a5: { name: 'A5', hint: 'دفترٌ في اليد', w: 148, h: 210 },
  b5: { name: 'B5', hint: 'دفتر الطالب', w: 176, h: 250 },
  a4: { name: 'A4', hint: 'ورقةٌ كاملة', w: 210, h: 297 },
  sq: { name: 'مربع', hint: 'للرسم والخرائط', w: 200, h: 200 },
};
export const PAPERS = {
  ivory: { name: 'عاجي', bg: '#FBF6E9', line: '#D3C5A4', strong: '#B9A57A', margin: '#D9A3A8', dot: '#B9AA88', ink: '#8C7A55' },
  white: { name: 'أبيض', bg: '#FFFFFF', line: '#C3CEDC', strong: '#9FB0C6', margin: '#E3A6AC', dot: '#9EAABA', ink: '#7A889C' },
  cream: { name: 'كريمي', bg: '#F4EAD3', line: '#CDB98F', strong: '#AD966A', margin: '#C9918F', dot: '#AE9C78', ink: '#86704A' },
};
export const COVERS = ['#6B1D2F', '#1F3A5F', '#24543F', '#5A3A22', '#2B2B2E', '#1E5B5B', '#7A4A12', '#4A2C5E'];
export const TEMPLATES = [
  { id: 'blank', name: 'فارغة', hint: 'ورقةٌ للرسم والكتابة الحرة' },
  { id: 'ruled', name: 'مسطّرة', hint: 'أسطرٌ واسعة (٨ مم) بهامشٍ أيمن' },
  { id: 'narrow', name: 'مسطّرة ضيقة', hint: 'أسطرٌ متقاربة (٦ مم) لخطٍّ صغير' },
  { id: 'grid', name: 'مربعات', hint: 'شبكةٌ (٥ مم) للجداول والرسوم' },
  { id: 'dots', name: 'نقاط', hint: 'نقطةٌ كل ٥ مم: حرّةٌ ومنظّمة' },
  { id: 'khatt', name: 'كراسة الخط', hint: 'سطرٌ وخطٌّ مساعد ونقاط القياس لتعلّم الخط العربي' },
  { id: 'cornell', name: 'تفريغ الدرس', hint: 'عمودٌ للمسائل والكلمات، وأسطر، وخلاصةٌ أسفلها (طريقة كورنيل)' },
  { id: 'dars', name: 'ورقة درس', hint: 'رأسٌ للدرس والشيخ والكتاب والتاريخ، ثم أسطر' },
  { id: 'hashiya', name: 'متن وحاشية', hint: 'المتن أعلى الصفحة، والحاشية تحت خطٍّ قصير كما في الكتب' },
  { id: 'verse', name: 'أبيات', hint: 'شطران متقابلان لكتابة الشعر والمنظومات' },
  { id: 'plan', name: 'جدول مراجعة', hint: 'أيام الأسبوع: ما يُقرأ ويُحفظ ويُراجع' },
];
const TPL = new Map(TEMPLATES.map((t) => [t.id, t]));
export const tplName = (id) => (TPL.get(id) || TEMPLATES[0]).name;

/* ------------------------------------------------------------------ رسم القالب */
const UI = '"Tajawal","Segoe UI",Tahoma,sans-serif';
const DISPLAY = '"Adwa Assalaf","Amiri","Noto Naskh Arabic",serif';
/** يرسم القالب على لوحةٍ بعرض W بكسلاً (المقاسات بالمليمتر) */
export function drawTemplate(g, id, W, H, size = SIZES.a5, paper = PAPERS.ivory) {
  const mm = W / size.w;
  g.save();
  g.fillStyle = paper.bg;
  g.fillRect(0, 0, W, H);
  // حبيبات الورق الخفيفة
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(120,90,40,.035)';
  for (let k = 0; k < (W * H) / 900; k++) g.fillRect(rnd() * W, rnd() * H, 1.3, 1.3);
  const line = (x1, y1, x2, y2, c = paper.line, w = 0.22) => {
    g.strokeStyle = c;
    g.lineWidth = Math.max(1, w * mm);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const top = 18 * mm, bottom = H - 13 * mm, side = 11 * mm;
  const ruled = (gap, y0 = top, y1 = bottom, x0 = side, x1 = W - side, margin = true) => {
    for (let y = y0 + gap * mm; y <= y1 + 0.5; y += gap * mm) line(x0, y, x1, y);
    if (margin) line(W - 22 * mm, y0 - 6 * mm, W - 22 * mm, y1 + 2 * mm, paper.margin, 0.3);
  };
  const label = (t, x, y, px = 3.4, align = 'right', font = UI, c = paper.ink) => {
    g.fillStyle = c;
    g.font = `700 ${px * mm}px ${font}`;
    g.textAlign = align;
    g.direction = 'rtl';
    g.textBaseline = 'alphabetic';
    g.fillText(t, x, y);
  };
  const diamond = (x, y, r, c = paper.strong) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.closePath();
    g.fill();
  };
  switch (id) {
    case 'ruled':
      ruled(8);
      break;
    case 'narrow':
      ruled(6);
      break;
    case 'grid': {
      const st = 5 * mm;
      const x0 = side, x1 = W - side, y0 = top - 6 * mm, y1 = bottom;
      let k = 0;
      for (let x = x0; x <= x1 + 0.5; x += st, k++) line(x, y0, x, y1, k % 5 ? paper.line : paper.strong, k % 5 ? 0.15 : 0.25);
      k = 0;
      for (let y = y0; y <= y1 + 0.5; y += st, k++) line(x0, y, x1, y, k % 5 ? paper.line : paper.strong, k % 5 ? 0.15 : 0.25);
      break;
    }
    case 'dots': {
      g.fillStyle = paper.dot;
      for (let y = top - 6 * mm; y <= bottom; y += 5 * mm) for (let x = side; x <= W - side + 0.5; x += 5 * mm) {
        g.beginPath();
        g.arc(x, y, 0.38 * mm, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'khatt': {
      // لكل سطرٍ: خطّ القاعدة، وفوقه خطٌّ مساعد، وفي الهامش نقاط القياس (معيّنات) كما في كراسات الخط
      const row = 16 * mm;
      for (let y = top + 8 * mm; y <= bottom; y += row) {
        line(side, y, W - side, y, paper.strong, 0.3);
        line(side, y - 6 * mm, W - side, y - 6 * mm, paper.line, 0.18);
        g.setLineDash([2 * mm, 2 * mm]);
        line(side, y - 3 * mm, W - side, y - 3 * mm, paper.line, 0.12);
        g.setLineDash([]);
        for (let k = 0; k < 3; k++) diamond(W - side + 4 * mm, y - 1 * mm - k * 2.05 * mm, 0.95 * mm, paper.margin);
      }
      break;
    }
    case 'cornell': {
      const cue = W - 50 * mm;
      const sum = H - 48 * mm;
      line(side, top - 2 * mm, W - side, top - 2 * mm, paper.strong, 0.35);
      label('الموضوع', W - side, top - 5 * mm, 3.2);
      line(cue, top - 2 * mm, cue, sum, paper.margin, 0.3);
      label('المسائل والكلمات', W - side, top + 5 * mm, 2.8);
      for (let y = top + 8 * mm; y <= sum - 1; y += 8 * mm) line(side, y, cue - 2 * mm, y);
      line(side, sum, W - side, sum, paper.strong, 0.35);
      label('الخلاصة', W - side, sum + 6 * mm, 3.2);
      for (let y = sum + 14 * mm; y <= bottom; y += 8 * mm) line(side, y, W - side, y);
      break;
    }
    case 'dars': {
      const h = 30 * mm;
      g.strokeStyle = paper.strong;
      g.lineWidth = 0.3 * mm;
      const r = 3 * mm;
      g.beginPath();
      g.roundRect ? g.roundRect(side, top - 8 * mm, W - side * 2, h, r) : g.rect(side, top - 8 * mm, W - side * 2, h);
      g.stroke();
      const cols = [W - side - 3 * mm, W / 2 - 2 * mm];
      const rows = [top + 2 * mm, top + 14 * mm];
      const fields = [['الدرس', 'الشيخ'], ['الكتاب', 'التاريخ']];
      fields.forEach((pair, ri) =>
        pair.forEach((t, ci) => {
          label(t + ':', cols[ci], rows[ri], 3.1);
          line(cols[ci] - 18 * mm, rows[ri] + 1 * mm, cols[ci] - (W / 2 - side - 6 * mm), rows[ri] + 1 * mm, paper.line, 0.18);
        }),
      );
      diamond(W / 2, top - 8 * mm, 1.4 * mm);
      ruled(8, top + h - 8 * mm);
      break;
    }
    case 'hashiya': {
      const split = top + (bottom - top) * 0.68;
      ruled(9, top, split - 4 * mm);
      // خطّ الحاشية: قصيرٌ في جهة البداية كما في الكتب
      line(W - side - 40 * mm, split, W - side, split, paper.strong, 0.35);
      for (let y = split + 6 * mm; y <= bottom; y += 6 * mm) line(side, y, W - side, y, paper.line, 0.15);
      break;
    }
    case 'verse': {
      const gap = 14 * mm;
      const mid = W / 2;
      for (let y = top + 10 * mm; y <= bottom; y += 13 * mm) {
        line(mid + gap / 2, y, W - side, y);
        line(side, y, mid - gap / 2, y);
        diamond(mid, y - 1.5 * mm, 0.8 * mm, paper.margin);
      }
      break;
    }
    case 'plan': {
      const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
      const heads = ['اليوم', 'الدرس والقراءة', 'الحفظ', 'المراجعة'];
      const x = [W - side, W - side - 22 * mm, W / 2 - 4 * mm, side + (W / 2 - side) * 0.45, side];
      const y0 = top - 4 * mm;
      const rh = (bottom - y0 - 10 * mm) / 7;
      label('جدول المراجعة', W / 2, y0 - 4 * mm, 3.6, 'center', DISPLAY, paper.ink);
      line(side, y0, W - side, y0, paper.strong, 0.35);
      heads.forEach((t, k) => label(t, x[k] - 1.5 * mm, y0 + 6.5 * mm, 2.8));
      line(side, y0 + 10 * mm, W - side, y0 + 10 * mm, paper.strong, 0.3);
      days.forEach((d, k) => {
        const yy = y0 + 10 * mm + rh * (k + 1);
        line(side, yy, W - side, yy, paper.line, 0.22);
        label(d, x[0] - 1.5 * mm, yy - rh / 2 + 1.5 * mm, 3);
      });
      for (const xx of x.slice(1, 4)) line(xx, y0, xx, y0 + 10 * mm + rh * 7, paper.line, 0.22);
      break;
    }
    default:
      break;
  }
  g.restore();
}

/* ------------------------------------------------------------------ عناوين الصفحة: باب وفصل */
export const HEAD_LEVELS = [
  { lvl: 1, name: 'باب', hint: 'عنوانٌ كبير في وسط الصفحة' },
  { lvl: 2, name: 'فصل', hint: 'عنوانٌ أصغر تحت الباب' },
];
/** ارتفاع العناوين أعلى الصفحة (بالمليمتر) */
const headH = (h) => (h.lvl === 1 ? 25 : 15);
export const headsHeight = (heads) => (heads || []).reduce((a, h) => a + headH(h), 0);
/**
 * العناوين أعلى الصفحة: تُمحى الأسطر تحتها، ثم الباب في الوسط بين معيّنين وتحته خطٌّ مذهّب،
 * والفصل في جهة البداية بمعيّنٍ قبله.
 */
export function drawHeads(g, heads, W, H, size = SIZES.a5, paper = PAPERS.ivory) {
  if (!heads || !heads.length) return;
  const mm = W / size.w;
  const side = 11 * mm;
  let y = 7 * mm;
  const band = (headsHeight(heads) + 4) * mm;
  g.save();
  g.fillStyle = paper.bg;
  g.fillRect(0, 0, W, y + band);
  let sd = 11;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(120,90,40,.035)';
  for (let k = 0; k < (W * (y + band)) / 900; k++) g.fillRect(rnd() * W, rnd() * (y + band), 1.3, 1.3);
  const dia = (x, yy, r, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x, yy - r);
    g.lineTo(x + r, yy);
    g.lineTo(x, yy + r);
    g.lineTo(x - r, yy);
    g.closePath();
    g.fill();
  };
  g.direction = 'rtl';
  g.textBaseline = 'alphabetic';
  const RUB = paper.bg === '#FFFFFF' ? '#6B1D2F' : '#6B1D2F';
  for (const h of heads) {
    const t = String(h.t || '').trim();
    if (h.lvl === 1) {
      let px = 10 * mm;
      g.font = `700 ${px}px ${DISPLAY}`;
      while (g.measureText(t).width > W - side * 2 - 22 * mm && px > 3.6 * mm) g.font = `700 ${(px -= 0.3 * mm)}px ${DISPLAY}`;
      g.fillStyle = RUB;
      g.textAlign = 'center';
      const base = y + 14 * mm;
      g.fillText(t, W / 2, base);
      const tw = g.measureText(t).width;
      dia(W / 2 + tw / 2 + 6 * mm, base - px * 0.32, 1.6 * mm, '#C5A059');
      dia(W / 2 - tw / 2 - 6 * mm, base - px * 0.32, 1.6 * mm, '#C5A059');
      g.strokeStyle = '#C5A059';
      g.lineWidth = Math.max(1, 0.35 * mm);
      g.beginPath();
      g.moveTo(W / 2 - Math.min(tw / 2 + 12 * mm, W / 2 - side), base + 5 * mm);
      g.lineTo(W / 2 + Math.min(tw / 2 + 12 * mm, W / 2 - side), base + 5 * mm);
      g.stroke();
      dia(W / 2, base + 5 * mm, 0.9 * mm, '#C5A059');
    } else {
      let px = 6.6 * mm;
      g.font = `700 ${px}px ${DISPLAY}`;
      while (g.measureText(t).width > W - side * 2 - 10 * mm && px > 3 * mm) g.font = `700 ${(px -= 0.25 * mm)}px ${DISPLAY}`;
      g.fillStyle = '#3E2C1E';
      g.textAlign = 'right';
      const base = y + 10 * mm;
      dia(W - side - 1.4 * mm, base - px * 0.3, 1.4 * mm, '#C5A059');
      g.fillStyle = '#3E2C1E';
      g.fillText(t, W - side - 6 * mm, base);
    }
    y += headH(h) * mm;
  }
  g.restore();
}

/** صورة قالبٍ صغيرة (لقوائم الاختيار) */
export function thumb(canvas, id, size = SIZES.a5, paper = PAPERS.ivory) {
  const g = canvas.getContext('2d');
  const W = canvas.width * 4, H = canvas.height * 4;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  drawTemplate(c.getContext('2d'), id, W, H, size, paper);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(c, 0, 0, canvas.width, canvas.height);
}

/* ------------------------------------------------------------------ الغلاف */
export async function coverImage({ title = 'دفتري', color = COVERS[0], size = SIZES.a5 } = {}) {
  try {
    await document.fonts.load(`700 40px ${DISPLAY}`, title);
  } catch {}
  const W = 1000, H = Math.round((1000 * size.h) / size.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, shade(color, 0.14));
  gr.addColorStop(0.5, color);
  gr.addColorStop(1, shade(color, -0.22));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // ملمس القماش
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.04)';
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // الشريط المطاطي عند حافة الفتح (يساراً: الكعب يمين الدفتر العربي)
  const bx = W * 0.085, bw = W * 0.035;
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.fillRect(bx, 0, bw, H);
  g.fillStyle = 'rgba(255,255,255,.07)';
  g.fillRect(bx + bw - W * 0.008, 0, W * 0.008, H);
  // إطارٌ ذهبي بزوايا مستديرة (بين الشريط والكعب)
  const fx = bx + bw + 34, fw = W - fx - 46;
  g.strokeStyle = '#D9B66C';
  g.lineWidth = 6;
  rr(g, fx, 46, fw, H - 92, 34);
  g.stroke();
  g.lineWidth = 2;
  rr(g, fx + 16, 62, fw - 32, H - 124, 26);
  g.stroke();
  // رقعة العنوان
  const lw = fw * 0.76, lh = H * 0.2;
  const lx = fx + (fw - lw) / 2, ly = H * 0.3;
  g.fillStyle = '#F6EEDC';
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = 18;
  rr(g, lx, ly, lw, lh, 26);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#C5A059';
  g.lineWidth = 3;
  rr(g, lx + 12, ly + 12, lw - 24, lh - 24, 18);
  g.stroke();
  g.fillStyle = shade(color, -0.1);
  g.textAlign = 'center';
  g.direction = 'rtl';
  g.textBaseline = 'middle';
  let fs = lh * 0.36;
  g.font = `700 ${fs}px ${DISPLAY}`;
  while (g.measureText(title).width > lw - 70 && fs > 24) g.font = `700 ${(fs -= 3)}px ${DISPLAY}`;
  g.fillText(title, lx + lw / 2, ly + lh * 0.5);
  // النقط الخمس (من شعار ورّاق)
  g.fillStyle = '#D9B66C';
  for (let k = 0; k < 5; k++) {
    const x = fx + fw / 2 + (k - 2) * 26, y = H * 0.62, r = 8;
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.fill();
  }
  return c.toDataURL('image/jpeg', 0.9);
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ ملف PDF: لكل قالبٍ صورةٌ واحدة تتكرر */
const jpegCache = new Map();
async function templateJpeg(id, size, paper, heads = null) {
  const key = (heads && heads.length ? 'H|' + JSON.stringify(heads) + '|' : 'T|') + [id, size.w, size.h, paper.bg].join('|');
  if (jpegCache.has(key)) return jpegCache.get(key);
  const p = (async () => {
    try {
      await document.fonts.load(`700 20px ${UI}`, 'الدرس');
      await document.fonts.load(`700 20px ${DISPLAY}`, 'جدول');
    } catch {}
    const W = 1500, H = Math.round((W * size.h) / size.w);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    drawTemplate(c.getContext('2d'), id, W, H, size, paper);
    if (heads && heads.length) drawHeads(c.getContext('2d'), heads, W, H, size, paper);
    return { w: W, h: H, bytes: new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer()) };
  })();
  jpegCache.set(key, p);
  // الصفحات ذوات العناوين لا تتكرر: لا تبقى في الذاكرة أكثر من ستين
  if (jpegCache.size > 80) for (const k of [...jpegCache.keys()].filter((x) => x.startsWith('H|')).slice(0, 20)) jpegCache.delete(k);
  return p;
}
async function dataUrlBytes(u) {
  return new Uint8Array(await (await fetch(u)).arrayBuffer());
}
/**
 * ملف الدفتر: الغلاف صفحةً أولى، ثم الصفحات بقوالبها، وعناوينها (أبوابها وفصولها) فهرساً للملف (Outlines)
 * فيقرؤها القارئ في «الأبواب»، وتبقى في الملف المنزَّل.
 * @param {{ title, pages: string[], heads?: Object<number, {t,lvl}[]>, size: string, paper: string, cover: string(dataURL) }} nb
 */
export async function notebookPdf(nb) {
  const size = SIZES[nb.size] || SIZES.a5;
  const paper = PAPERS[nb.paper] || PAPERS.ivory;
  const Wpt = (size.w * 72) / 25.4, Hpt = (size.h * 72) / 25.4;
  const enc = new TextEncoder();
  const parts = [];
  let len = 0;
  const offs = [];
  const push = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    len += b.length;
  };
  const obj = (n, body, stream) => {
    offs[n] = len;
    push(`${n} 0 obj\n`);
    if (stream) {
      push(body.replace('%LEN%', String(stream.length)) + '\nstream\n');
      push(stream);
      push('\nendstream\nendobj\n');
    } else push(body + '\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // الصور: الغلاف، وقالبٌ لكل نوع، وصورةٌ لكل صفحةٍ ذات عنوان
  const heads = nb.heads || {};
  const hasHead = (k) => Array.isArray(heads[k]) && heads[k].length > 0;
  const keyOf = (t, k) => (hasHead(k) ? 'p' + k : t);
  const ids = [...new Set(nb.pages.filter((t, i) => !hasHead(i + 1)))];
  const imgs = new Map();
  let n = 3;
  const coverBytes = nb.cover ? await dataUrlBytes(nb.cover) : null;
  const coverDim = coverBytes ? jpegSize(coverBytes) : null;
  const pagesObjs = [];
  const content = (im) => `q ${Wpt.toFixed(2)} 0 0 ${Hpt.toFixed(2)} 0 0 cm /${im} Do Q`;
  if (coverBytes) {
    const imN = n++;
    obj(imN, `<< /Type /XObject /Subtype /Image /Width ${coverDim.w} /Height ${coverDim.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %LEN% >>`, coverBytes);
    imgs.set('__cover', imN);
  }
  const jobs = [...ids.map((id) => [id, id, null]), ...nb.pages.map((t, i) => (hasHead(i + 1) ? ['p' + (i + 1), t, heads[i + 1]] : null)).filter(Boolean)];
  for (const [key, id, hd] of jobs) {
    const j = await templateJpeg(id, size, paper, hd);
    const imN = n++;
    obj(imN, `<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %LEN% >>`, j.bytes);
    imgs.set(key, imN);
  }
  // محتوى كل صورة (يتكرر في صفحاتها)
  const contents = new Map();
  for (const [k, imN] of imgs) {
    const cN = n++;
    obj(cN, `<< /Length %LEN% >>`, enc.encode(content('Im')));
    contents.set(k, { cN, imN });
  }
  const order = [...(coverBytes ? ['__cover'] : []), ...nb.pages.map((t, i) => keyOf(t, i + 1))];
  for (const k of order) {
    const { cN, imN } = contents.get(k);
    const pN = n++;
    obj(pN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Wpt.toFixed(2)} ${Hpt.toFixed(2)}] /Resources << /XObject << /Im ${imN} 0 R >> >> /Contents ${cN} 0 R >>`);
    pagesObjs.push(pN);
  }
  // الفهرس: الفصل تحت آخر بابٍ قبله
  const marks = [];
  nb.pages.forEach((t, i) => {
    if (hasHead(i + 1)) for (const h of heads[i + 1]) if (String(h.t || '').trim()) marks.push({ t: String(h.t).trim().slice(0, 200), lvl: h.lvl === 2 ? 2 : 1, pg: pagesObjs[i + (coverBytes ? 1 : 0)] });
  });
  let outlineN = 0;
  if (marks.length) {
    const tops = [];
    for (const m of marks) {
      m.n = n++;
      m.kids = [];
      if (m.lvl === 2 && tops.length && tops[tops.length - 1].lvl === 1) tops[tops.length - 1].kids.push(m);
      else tops.push(m);
    }
    outlineN = n++;
    const item = (m, list, k, parent) => {
      const prev = list[k - 1], next = list[k + 1];
      const kids = m.kids || [];
      return `<< /Title ${pdfString(m.t)} /Parent ${parent} 0 R${prev ? ` /Prev ${prev.n} 0 R` : ''}${next ? ` /Next ${next.n} 0 R` : ''}${kids.length ? ` /First ${kids[0].n} 0 R /Last ${kids[kids.length - 1].n} 0 R /Count ${kids.length}` : ''} /Dest [${m.pg} 0 R /XYZ 0 ${Hpt.toFixed(2)} 0] >>`;
    };
    tops.forEach((m, k) => {
      obj(m.n, item(m, tops, k, outlineN));
      m.kids.forEach((c, j) => obj(c.n, item(c, m.kids, j, m.n)));
    });
    obj(outlineN, `<< /Type /Outlines /First ${tops[0].n} 0 R /Last ${tops[tops.length - 1].n} 0 R /Count ${marks.length} >>`);
  }
  const infoN = n++;
  obj(infoN, `<< /Title ${pdfString(nb.title || 'دفتري')} /Producer (Alwarraq) /Creator (Alwarraq) >>`);
  obj(1, `<< /Type /Catalog /Pages 2 0 R${outlineN ? ` /Outlines ${outlineN} 0 R /PageMode /UseOutlines` : ''} >>`);
  obj(2, `<< /Type /Pages /Kids [${pagesObjs.map((x) => x + ' 0 R').join(' ')}] /Count ${pagesObjs.length} >>`);
  const xref = len;
  const count = n;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let k = 1; k < count; k++) x += String(offs[k] || 0).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoN} 0 R /ID [<${idHex(nb.id || nb.title)}> <${idHex((nb.id || '') + nb.pages.length)}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) out.set(p, o), (o += p.length);
  return new Blob([out], { type: 'application/pdf' });
}
/** نصٌّ في PDF (UTF-16BE) */
function pdfString(s) {
  let h = 'FEFF';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) continue;
    h += c.toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${h}>`;
}
function idHex(s) {
  let h = 2166136261 >>> 0;
  let out = '';
  for (let k = 0; k < 4; k++) {
    for (const ch of String(s) + k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}
function jpegSize(b) {
  let p = 2;
  while (p < b.length) {
    if (b[p] !== 0xff) break;
    const m = b[p + 1];
    const L = (b[p + 2] << 8) | b[p + 3];
    if (m >= 0xc0 && m <= 0xc3) return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8] };
    p += 2 + L;
  }
  return { w: 1000, h: 1414 };
}
export const pagesLabel = (n) => (n === 1 ? 'صفحة واحدة' : n === 2 ? 'صفحتان' : n % 100 >= 3 && n % 100 <= 10 ? `${ar(n)} صفحات` : `${ar(n)} صفحة`);
