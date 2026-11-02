// رسم «بطاقة الأسلوب»: مربع دائري الزوايا يعرض هوية الأسلوب (اسمه وألوانه وخطه وزخرفته).
// يُستعمل في شبكة الأساليب عند المالك، وفي الملف الذي يُنزَّل إلى الجهاز.
import { styleSettings, kindOf } from '/shared/presets.js';

const FALLBACK = '"Amiri", "Noto Naskh Arabic", serif';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitText(g, text, weight, family, max, size, min) {
  for (let s = size; s >= min; s -= 2) {
    g.font = `${weight} ${s}px "${family}", ${FALLBACK}`;
    if (g.measureText(text).width <= max) return s;
  }
  return min;
}

/**
 * @param {HTMLCanvasElement} canvas  أي مقاس مربع (الملف المنزَّل 1024)
 * @param {{name: string, desc?: string, settings: object, extras?: object}} style
 */
export async function drawStyleCard(canvas, style) {
  const S = styleSettings(style);
  const N = 1024;
  const k = canvas.width / N;
  const g = canvas.getContext('2d');
  const fams = [...new Set([S.fonts.heading, S.fonts.body])];
  if (document.fonts && document.fonts.load) {
    await Promise.race([
      Promise.allSettled(fams.flatMap((f) => [document.fonts.load(`700 40px "${f}"`, style.name || 'بسم'), document.fonts.load(`400 40px "${f}"`, 'بسم الله')])),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  }
  const KIND = kindOf(S);
  const c1 = S.headingColors[1], c2 = S.headingColors[2], c3 = S.headingColors[3];
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, N, N);
  g.save();
  rr(g, 0, 0, N, N, 180);
  g.clip();
  // الإطار الخارجي بلون الأبواب
  g.fillStyle = c1;
  g.fillRect(0, 0, N, N);
  const light = g.createRadialGradient(N / 2, N * 0.25, 40, N / 2, N * 0.4, N * 0.8);
  light.addColorStop(0, 'rgba(255,255,255,.20)');
  light.addColorStop(1, 'rgba(0,0,0,.24)');
  g.fillStyle = light;
  g.fillRect(0, 0, N, N);
  // الورقة
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 12;
  rr(g, 78, 78, N - 156, N - 156, 112);
  g.fillStyle = '#FBF8F1';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 5;
  g.strokeStyle = S.ruleColor;
  rr(g, 100, 100, N - 200, N - 200, 94);
  g.stroke();
  g.lineWidth = 1.6;
  rr(g, 114, 114, N - 228, N - 228, 82);
  g.stroke();

  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const cx = N / 2;
  // الوسم
  g.font = `700 36px "Tajawal", ${FALLBACK}`;
  g.fillStyle = S.ornamentColor;
  g.fillText(KIND === 'research' ? 'أسلوب بحث' : KIND === 'mutun' ? 'أسلوب متن' : 'أسلوب إخراج', cx, 212);
  // الاسم: أكبر ما يسع، ليُقرأ حتى في أيقونة الملف الصغيرة
  const name = style.name || 'أسلوب';
  const size = fitText(g, name, 700, S.fonts.heading, 730, 156, 56);
  g.font = `700 ${size}px "${S.fonts.heading}", ${FALLBACK}`;
  g.fillStyle = c1;
  g.fillText(name, cx, 400);
  // الزخرفة
  g.font = `400 62px "${S.fonts.body}", ${FALLBACK}`;
  g.fillStyle = S.ornamentColor;
  g.fillText(S.ornament, cx, 506);
  // عينة سطر واحد: متن بأقواسه، ثم شرح، ثم آية
  const [bo, bc] = { '()': ['(', ')'], '«»': ['«', '»'], '[]': ['[', ']'], '{}': ['{', '}'], none: ['', ''] }[S.matnBrackets] || ['(', ')'];
  // البحث: عنوان المبحث ونصّه وحاشيته
  const parts =
    KIND === 'research'
      ? [['المبحث الأول', S.headingColors[2], 700], [' ونصّه ', S.textColor, 400], ['(١)', S.textColor, 700]]
      : [
          [`${bo}المتن${bc}`, S.matnColor, S.matnBold ? 700 : 400],
          [' وشرحه ', S.textColor, 400],
          ['﴿آية﴾', S.quranColor, 400],
        ];
  const fontOf = (w) => `${w} 50px "${S.fonts.body}", ${FALLBACK}`;
  const widths = parts.map(([t, , w]) => ((g.font = fontOf(w)), g.measureText(t).width));
  let x = cx + widths.reduce((a, b) => a + b, 0) / 2;
  g.textAlign = 'right';
  parts.forEach(([t, color, w], i) => {
    g.font = fontOf(w);
    g.fillStyle = color;
    g.fillText(t, x, 612);
    x -= widths[i];
  });
  g.textAlign = 'center';
  g.fillStyle = S.ruleColor;
  g.fillRect(cx - 150, 652, 300, 3);
  // دوائر الألوان
  const dots = [...new Set([c1, c2, c3, S.matnColor, S.quranColor, S.ornamentColor].map((c) => String(c).toLowerCase()))];
  dots.forEach((c, i) => {
    const x = cx + ((dots.length - 1) / 2 - i) * 96;
    g.beginPath();
    g.arc(x, 748, 36, 0, Math.PI * 2);
    g.fillStyle = c;
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.beginPath();
    g.arc(x, 748, 39, 0, Math.PI * 2);
    g.stroke();
  });
  // التذييل: شعار «ورّاق» المكتوب بلون الأبواب، ثم «بطاقة أسلوب»
  g.font = `700 28px "Tajawal", ${FALLBACK}`;
  g.fillStyle = '#8a7a66';
  const ex = style.extras || {};
  const extras = (ex.css && ex.css.trim()) || Object.keys(ex.images || {}).length || Object.keys(ex.templates || {}).length || (ex.pages || []).length;
  const tail = extras ? '· بطاقة أسلوب + إضافات' : '· بطاقة أسلوب';
  const mark = await wordmark(c2);
  if (mark) {
    const h = 58;
    const w = (h * mark.width) / mark.height;
    const gap = 12;
    const tw = g.measureText(tail).width;
    const right = cx + (w + gap + tw) / 2;
    g.drawImage(mark, right - w, 872 - h + 8, w, h);
    g.textAlign = 'right';
    g.fillText(tail, right - w - gap, 862);
    g.textAlign = 'center';
  } else g.fillText('ورّاق ' + tail, cx, 862);
  g.restore();
}

/** شعار «ورّاق» المكتوب (img/waraq-word.png) ملوّناً بلونٍ واحد، أو null إن تعذّر تحميله */
let WORD = null;
async function wordmark(color) {
  if (!WORD)
    WORD = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/img/waraq-word.png';
    });
  const img = await WORD;
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** صورة البطاقة PNG (بايتات) بمقاس الملف 1024 */
export async function cardPng(style) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  await drawStyleCard(c, style);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
