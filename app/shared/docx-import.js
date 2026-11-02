// استيراد ملف Word (‎.docx) كتاباً: يُحوَّل إلى الصيغة نفسها التي يأتي بها كتاب «تراث»
// (بيانات الكتاب + صفحات نصية فيها العناوين موسومة والحواشي تحت خط فاصل)، فيمر بالمحلّل والإعدادات
// والمعاينة والإخراج كأي كتاب مجلوب. بلا اعتماديات، ويعمل في المتصفح (كتاب المستخدم «كتابي») وفي Node (مجلد كتب المالك).
//
// «هندسة عكسية»: يُفهم الملف كما يُفهم كتاب «تراث»، ثم يُكتب بلغته:
//   · البنية: العناوين (أنماط Heading أو مستوى المخطط، وإلا تخمين من السطر العريض)، الحواشي الحقيقية والمكتوبة
//     يدوياً تحت خط «____»، الأبيات، القوائم المرقّمة، فواصل الصفحات.
//   · المتن والشرح: الفاصل «---» (أو خط أفقي أو حدّ سفلي للفقرة) بين المتن وشرحه، أو «المتن: … الشرح: …»،
//     أو متن بالعريض / بلون / بين قوسين / بين «ــ ــ». كل متن وشرحه يُكتبان صفحةً واحدة فيها المتن ثم «ــــ» ثم الشرح،
//     وهي صيغة «تراث» نفسها، فيعمل عليها كل ما في الموقع (القوالب، نهاية الشرح، ألوان المتن…).
//   · الصور والجداول تبقى في مواضعها، وصورة تملأ الصفحة غلافٌ (أول الملف، أو في وسطه لكتاب ثانٍ).
//   · تنسيق المؤلف: التوسيط والمحاذاة يساراً والعريض واللون والتسطير (اختياري).
//   · فهرس الملف نفسه (حقل TOC، أو أنماط الفهرس، أو مكتوب يدوياً): تؤخذ عناوينه كما هي، أو يُبنى فهرس جديد.
// الخيارات: { matn, keepCover, keepFormat, toc } (cleanWordOptions).

import { normalizeArabic, isSharhLabel } from './arabic.js';
import { numOnly, BLANK_LINE } from './mutun.js';

const EAST = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => EAST[+d]);
const AR_LETTERS = /[ء-ي]/;
const dec = new TextDecoder('utf-8');

/* ------------------------------------------------------------ ZIP */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** قراءة دليل ملف ZIP: اسم كل ملف وموضع بياناته */
export function zipEntries(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      e = i;
      break;
    }
  }
  if (e < 0) throw new Error('الملف ليس ملف Word صالحاً (‎.docx)');
  const n = u16(b, e + 10);
  let p = u32(b, e + 16);
  const out = new Map();
  for (let i = 0; i < n && p + 46 <= b.length; i++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extra = u16(b, p + 30);
    const comment = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    out.set(name, { method, data: b.subarray(start, start + csize) });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** فك ضغط deflate الخام في المتصفح */
export async function inflateRawBrowser(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

/* ------------------------------------------------------------ XML */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const val = (xml, tag) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*?)?\\sw:val="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
};
/** خاصية منطقية في Word: <w:b/> = نعم · <w:b w:val="0"/> = لا · غائبة = null */
const onOff = (xml, tag) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?/>`).exec(xml);
  if (!m) return null;
  const v = /w:val="([^"]*)"/.exec(m[0]);
  return !v || !/^(0|false|off)$/i.test(v[1]);
};
/** حذف عنصر بكل ما فيه (مع التداخل) */
function dropAll(xml, tag) {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  let out = '';
  let i = 0;
  for (;;) {
    const s = xml.indexOf(open, i);
    if (s < 0) return out + xml.slice(i);
    const ch = xml[s + open.length];
    if (ch !== ' ' && ch !== '>' && ch !== '/') {
      out += xml.slice(i, s + open.length);
      i = s + open.length;
      continue;
    }
    out += xml.slice(i, s);
    const gt = xml.indexOf('>', s);
    if (gt < 0) return out;
    if (xml[gt - 1] === '/') {
      i = gt + 1;
      continue;
    }
    // نهاية العنصر مع حساب التداخل
    let depth = 1;
    let j = gt + 1;
    while (depth > 0) {
      const c = xml.indexOf(close, j);
      if (c < 0) return out;
      let o = xml.indexOf(open, j);
      while (o >= 0 && o < c) {
        const k = xml[o + open.length];
        if ((k === ' ' || k === '>') && xml[xml.indexOf('>', o) - 1] !== '/') depth++;
        o = xml.indexOf(open, o + open.length);
      }
      depth--;
      j = c + close.length;
    }
    i = j;
  }
}
/** نهاية عنصر بدأ عند s (مع التداخل): موضع ما بعد وسم الإغلاق */
function endOf(xml, s, tag) {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  let depth = 0;
  let i = s;
  for (;;) {
    const c = xml.indexOf(close, i);
    if (c < 0) return xml.length;
    let o = xml.indexOf(open, i);
    while (o >= 0 && o < c) {
      const k = xml[o + open.length];
      if (k === ' ' || k === '>') depth++;
      o = xml.indexOf(open, o + open.length);
    }
    depth--;
    i = c + close.length;
    if (depth <= 0) return i;
  }
}

/* ------------------------------------------------------------ خيارات الاستيراد */
/** طرق تمييز المتن في الملف (للواجهة) */
/** كيف يُفصل المتن عن شرحه (للواجهة) */
export const WORD_MATN = {
  auto: 'يتعرّف الموقع وحده',
  none: 'لا متن مفصولاً عن شرحه',
  sep: 'الخط «---»: ما قبله متن وما بعده شرح',
  toggle: 'الخط «---» يتناوب: متن، ثم شرح، ثم متن…',
  label: '«المتن:» ثم «الشرح:»',
  box: 'المتن في إطار، وشرحه بعده',
};
/** كيف يُعرف المتن المضمَّن داخل الشرح: يُكتب بلون المتن وخطه وأقواسه كما في الإعدادات */
export const WORD_EMBED = {
  auto: 'يتعرّف الموقع وحده',
  none: 'لا متن داخل الشرح',
  bold: 'ما كُتب بالخط العريض',
  color: 'ما كُتب بلون مختلف',
  font: 'ما كُتب بخط آخر أو مقاس آخر',
  paren: 'ما بين قوسين ( )',
  marks: 'ما بين «ــ ــ»',
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function cleanWordOptions(o) {
  const x = o && typeof o === 'object' ? o : {};
  // الصيغة الأولى: matn كان يحمل طرق المتن المضمَّن أيضاً
  const oldEmbed = has(WORD_EMBED, x.matn) && !has(WORD_MATN, x.matn) ? x.matn : '';
  return {
    matn: oldEmbed ? 'none' : has(WORD_MATN, x.matn) ? x.matn : 'auto',
    embed: oldEmbed || (has(WORD_EMBED, x.embed) ? x.embed : 'auto'),
    keepCover: x.keepCover !== false,
    keepFormat: x.keepFormat !== false,
    toc: x.toc === 'site' ? 'site' : 'file',
  };
}
/** الخيارات نصاً قصيراً (لعنوان الطلب ومفتاح الذاكرة): matn.embed.cover.format.toc */
export const wordOptionsKey = (o) => {
  const c = cleanWordOptions(o);
  return [c.matn, c.embed, c.keepCover ? 1 : 0, c.keepFormat ? 1 : 0, c.toc].join('.');
};
export const parseWordOptionsKey = (s) => {
  const p = String(s || '').split('.');
  // الصيغة الأولى بأربعة أجزاء: matn.cover.format.toc
  if (p.length === 4) return cleanWordOptions({ matn: p[0], keepCover: p[1] !== '0', keepFormat: p[2] !== '0', toc: p[3] });
  return cleanWordOptions({ matn: p[0], embed: p[1], keepCover: p[2] !== '0', keepFormat: p[3] !== '0', toc: p[4] });
};

/* ------------------------------------------------------------ الصور */
function toBase64(u8) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
/** نوع الصورة ومقاسها من رأس الملف (PNG · JPEG · GIF)، وغيرها يُعرف نوعه فقط */
export function imageInfo(b) {
  if (!b || b.length < 24) return null;
  const be32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', w: be32(16), h: be32(20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { mime: 'image/gif', w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { mime: 'image/jpeg', w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
        i += 2;
        continue;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { mime: 'image/jpeg', w: 0, h: 0 };
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return { mime: 'image/webp', w: 0, h: 0 };
  if (b[0] === 0x42 && b[1] === 0x4d) return { mime: 'image/bmp', w: 0, h: 0 };
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return { mime: 'image/tiff', w: 0, h: 0 };
  return null;
}

/* ------------------------------------------------------------ الأنماط والترقيم */
/** لون النص: يُهمل الأسود وما قاربه (لون الكتابة المعتاد) والأبيض */
const hexColor = (v) => {
  if (!v || !/^[0-9a-f]{6}$/i.test(v)) return '';
  const n = parseInt(v, 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (Math.max(r, g, b) < 70) return '';
  if (Math.min(r, g, b) > 235) return '';
  return '#' + v.toLowerCase();
};
const visibleBorder = (xml) => /w:val="(?!nil"|none")[^"]+"/.test(xml);
/** مقاس الخط (نصف نقطة) واسمه من خصائص الجزء: العربي أولاً (szCs، cs) */
const szOf = (rPr) => +(val(rPr, 'w:szCs') ?? val(rPr, 'w:sz') ?? 0) || 0;
const fontOf = (rPr) => {
  const m = /<w:rFonts\b[^>]*>/.exec(rPr);
  if (!m) return '';
  const f = /w:cs="([^"]+)"/.exec(m[0]) || /w:ascii="([^"]+)"/.exec(m[0]) || /w:hAnsi="([^"]+)"/.exec(m[0]);
  return f ? decodeXml(f[1]).trim().toLowerCase() : '';
};
/** خط آيات المصحف: اختلافه عن خط الكتاب ليس تمييزاً للمتن */
const QURAN_FONT = /quran|qur'an|uthman|mushaf|hafs|qcf|kfgqpc|me_quran|amiri quran|قرآن|مصحف/i;

function parseStyles(xml) {
  const raw = new Map();
  let defaultId = '';
  // اتجاه الفقرات الأصلي في الملف (docDefaults)
  const defBidi = onOff((/<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>/.exec(xml) || [''])[0], 'w:bidi');
  const defR = (/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(xml) || [''])[0];
  const defSz = szOf(defR) || 0;
  const defFont = fontOf(defR) || '';
  for (const m of xml.matchAll(/<w:style\s[^>]*>[\s\S]*?<\/w:style>/g)) {
    const s = m[0];
    const head = /^<w:style\s[^>]*>/.exec(s)[0];
    const id = (/w:styleId="([^"]*)"/.exec(head) || [])[1];
    if (!id) continue;
    const type = (/w:type="([^"]*)"/.exec(head) || [])[1] || 'paragraph';
    if (type === 'paragraph' && /w:default="(1|true)"/.test(head)) defaultId = id;
    const pPr = (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(s) || [''])[0];
    const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(s.replace(pPr, '')) || [''])[0];
    const o = val(pPr, 'w:outlineLvl');
    raw.set(id, {
      name: (val(s, 'w:name') || id).toLowerCase(),
      based: val(s, 'w:basedOn'),
      outline: o === null ? null : +o,
      jc: val(pPr, 'w:jc'),
      bidi: onOff(pPr, 'w:bidi'),
      bold: onOff(rPr, 'w:bCs') ?? onOff(rPr, 'w:b'),
      color: hexColor(val(rPr, 'w:color')),
      sz: szOf(rPr),
      font: fontOf(rPr),
      numbered: /<w:numPr>/.test(pPr),
      tblBorders: type === 'table' ? visibleBorder((/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(s) || [''])[0]) : false,
    });
  }
  // الوراثة (basedOn)
  const out = new Map();
  const resolve = (id, seen = new Set()) => {
    if (out.has(id)) return out.get(id);
    const s = raw.get(id);
    if (!s || seen.has(id)) return { name: '', outline: null, jc: null, bold: null, bidi: defBidi, color: '', sz: defSz, font: defFont };
    seen.add(id);
    const p = s.based ? resolve(s.based, seen) : { outline: null, jc: null, bold: null, bidi: defBidi, color: '', sz: defSz, font: defFont };
    const r = { name: s.name, outline: s.outline ?? p.outline, jc: s.jc ?? p.jc, bold: s.bold ?? p.bold, bidi: s.bidi ?? p.bidi, color: s.color || p.color || '', sz: s.sz || p.sz || 0, font: s.font || p.font || '', tblBorders: s.tblBorders || !!p.tblBorders };
    // «Heading 3» أو «عنوان ٣» بلا مستوى مخطط صريح
    const hm = /^(?:heading|عنوان)\s*([1-9])$/.exec(s.name);
    if (hm && r.outline === null) r.outline = +hm[1] - 1;
    r.title = /^(title|العنوان)$/.test(s.name);
    r.subtitle = /^(subtitle|عنوان فرعي)$/.test(s.name);
    const tm = /^toc\s*([1-9])$/.exec(s.name);
    r.tocLevel = tm ? +tm[1] : 0;
    r.tocTitle = /^toc ?heading/.test(s.name) || /^(عنوان جدول المحتويات)/.test(s.name);
    r.toc = !!tm || r.tocTitle || /^(table of figures|جدول المحتويات)/.test(s.name);
    // عنوان الفهرس مبني على «Heading 1» فيرث مستواه: ليس عنواناً في الكتاب
    if (r.toc) r.outline = null;
    out.set(id, r);
    return r;
  };
  for (const id of raw.keys()) resolve(id);
  out.set('', defaultId ? resolve(defaultId) : { name: '', outline: null, jc: null, bold: null, bidi: defBidi, color: '', sz: defSz, font: defFont });
  return out;
}

function parseNumbering(xml) {
  const abs = new Map();
  for (const m of xml.matchAll(/<w:abstractNum\s[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    const lv = new Map();
    // نوع الترقيم، ونصّه («(%1)»، «%1-»، «%1.»…)، وأول عدده
    for (const l of m[2].matchAll(/<w:lvl\s[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) lv.set(+l[1], { fmt: val(l[2], 'w:numFmt') || 'decimal', text: val(l[2], 'w:lvlText'), start: +(val(l[2], 'w:start') || 1) || 1 });
    abs.set(m[1], lv);
  }
  const nums = new Map();
  for (const m of xml.matchAll(/<w:num\s[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) nums.set(m[1], abs.get(val(m[2], 'w:abstractNumId')) || new Map());
  return nums;
}

/* ------------------------------------------------------------ الفقرات */
// رموز التحكم التي يستعملها المحلّل علاماتٍ لا تدخل من نص الملف
const cleanRun = (s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f­​﻿]/g, '');
const cleanText = (s) => s.replace(/[­​﻿]/g, '').replace(/[  ]+/g, ' ').trim();
const REF_PH = /\u0007\d+\u0008/g;
const noRefs = (s) => s.replace(REF_PH, '');
const EMU = { pt: 12700, in: 914400, cm: 360000, mm: 36000, px: 9525 };

/** صور الفقرة: معرّف العلاقة ومقاس العرض (EMU) وهل هي عائمة */
function imagesOf(xml) {
  const out = [];
  if (xml.includes('<w:drawing')) {
    for (const m of xml.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)) {
      const d = m[1];
      const rid = (/<a:blip\b[^>]*r:embed="([^"]+)"/.exec(d) || [])[1];
      if (!rid) continue;
      const ext = /<wp:extent\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(d);
      const anchor = /<wp:anchor\b/.test(d);
      // موضع الصورة العائمة: المرجع (الصفحة، الهامش…) والإزاحة عنه (EMU) أو المحاذاة فيه
      const pos = (axis) => {
        const m2 = new RegExp(`<wp:position${axis}\\b[^>]*relativeFrom="(\\w+)"[^>]*>([\\s\\S]*?)</wp:position${axis}>`).exec(d);
        if (!m2) return null;
        const off = /<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(m2[2]);
        const al = /<wp:align>(\w+)<\/wp:align>/.exec(m2[2]);
        return { rel: m2[1], off: off ? +off[1] : null, align: al ? al[1] : '' };
      };
      out.push({ rid, cx: ext ? +ext[1] : 0, cy: ext ? +ext[2] : 0, anchor, ...(anchor ? { ph: pos('H'), pv: pos('V') } : {}) });
    }
  }
  // صور كانت داخل مربعات نص
  if (xml.includes('<w:tbi ')) for (const m of xml.matchAll(/<w:tbi w:rid="([^"]+)" w:cx="(\d+)" w:cy="(\d+)"\/>/g)) out.push({ rid: m[1], cx: +m[2], cy: +m[3], anchor: false, boxed: true });
  if (xml.includes('<w:pict')) {
    for (const m of xml.matchAll(/<w:pict>([\s\S]*?)<\/w:pict>/g)) {
      const rid = (/<v:imagedata\b[^>]*r:id="([^"]+)"/.exec(m[1]) || [])[1];
      if (!rid) continue;
      const st = (/<v:shape\b[^>]*style="([^"]*)"/.exec(m[1]) || [])[1] || '';
      const dim = (k) => {
        const x = new RegExp(`(?:^|;)\\s*${k}:\\s*([\\d.]+)(pt|in|cm|mm|px)?`).exec(st);
        return x ? Math.round(+x[1] * (EMU[x[2] || 'pt'] || 12700)) : 0;
      };
      out.push({ rid, cx: dim('width'), cy: dim('height'), anchor: /position:\s*absolute/.test(st) });
    }
  }
  return out;
}

/** فقرة Word ← أجزاؤها (نص كل جزء وكونه عريضاً أو مسطّراً ولونه) وخصائصها */
function parsePara(xml, styles) {
  const pPr = (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(xml) || [''])[0];
  const body = pPr ? xml.replace(pPr, '') : xml;
  // خصائص علامة الفقرة (rPr داخل pPr) ليست خصائص الفقرة
  const pp = pPr.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '');
  const st = styles.get(val(pp, 'w:pStyle') || '') || styles.get('') || {};
  const directOutline = val(pp, 'w:outlineLvl');
  const numPr = (/<w:numPr>[\s\S]*?<\/w:numPr>/.exec(pp) || [''])[0];
  const segs = [];
  const refs = [];
  let seen = false; // مرّ نص في الفقرة
  let breakBefore = onOff(pp, 'w:pageBreakBefore') === true;
  let breakAfter = false;
  let soft = false;
  let tocField = false;
  let softMid = false; // انكسرت الصفحة (كما صفّها Word) في وسط الفقرة
  let skipMark = false; // بعد إحالة برمز مكتوب (customMarkFollows): الرمز نفسه ليس نصاً
  for (const rm of body.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
    const run = rm[1];
    const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run) || [''])[0];
    const sup = val(rPr, 'w:vertAlign') === 'superscript';
    // الخط المرتفع (أرقام الحواشي وأقواسها) لا يحمل تنسيقاً يُحفظ
    const b = !sup && (onOff(rPr, 'w:bCs') ?? onOff(rPr, 'w:b') ?? st.bold) === true;
    const uv = val(rPr, 'w:u');
    const u = !sup && !!uv && uv !== 'none';
    const cv = val(rPr, 'w:color');
    const c = sup ? '' : cv === null ? st.color || '' : hexColor(cv);
    // الخط ومقاسه «اسم|مقاس» (لمعرفة المتن المميَّز بخطه)
    const ff = fontOf(rPr) || st.font || '';
    const fk = sup ? '' : ff + '|' + (szOf(rPr) || st.sz || 0);
    let t = '';
    for (const tk of run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>|<w:noBreakHyphen\/>|<w:lastRenderedPageBreak\/>|<w:instrText(?:\s[^>]*)?>([^<]*)<\/w:instrText>|<w:(footnote|endnote)Reference\s[^>]*w:id="(-?\d+)"[^>]*\/>/g)) {
      if (tk[1] !== undefined) {
        // «(¬١)» (رقم الحاشية في نصوص الشاملة) كما «(١)»
        let s = cleanRun(decodeXml(tk[1])).replace(/([(\[])\s*¬\s*(?=[0-9٠-٩])/g, '$1');
        if (skipMark) {
          skipMark = false;
          s = s.replace(/^\s*[(\[]?\s*[0-9٠-٩*]{1,4}\s*[)\]]?/, '');
          if (!s) continue;
        }
        // رقم حاشية مكتوب يدوياً بخط مرتفع: «كلمة¹» ← «كلمة (١)»
        t += sup && /^\s*[0-9٠-٩]{1,3}\s*$/.test(s) ? ' (' + s.trim() + ')' : s;
        if (s.trim()) seen = true;
      } else if (tk[2] !== undefined) {
        if (/^\s*TOC\b/.test(tk[2])) tocField = true;
      } else if (tk[3]) {
        // موضع إحالة الحاشية: يُستبدل برقمها في صفحتها عند توزيع الصفحات
        refs.push({ kind: tk[3], id: tk[4] });
        t += `\u0007${refs.length - 1}\u0008`;
        if (/w:customMarkFollows="(1|true)"/.test(tk[0])) skipMark = true;
      } else if (tk[0].startsWith('<w:tab')) t += '\t';
      else if (tk[0].startsWith('<w:lastRendered')) {
        if (!seen) soft = true;
        else softMid = true;
      } else if (tk[0].startsWith('<w:br')) {
        if (/w:type="page"/.test(tk[0])) {
          if (seen) breakAfter = true;
          else breakBefore = true;
        } else if (!/w:type=/.test(tk[0])) t += '\n';
      } else if (tk[0].startsWith('<w:cr')) t += '\n';
      else t += '-';
    }
    if (!t) continue;
    const last = segs[segs.length - 1];
    // ما ليس فيه حرف (ترقيم، مسافة، رقم) لا يُعرف له خط: يتبع ما قبله
    const f = /[\p{L}]/u.test(t) && !QURAN_FONT.test(ff) ? fk : '';
    if (last && last.b === b && last.u === u && last.c === c && (last.f === f || !f || !last.f)) {
      last.t += t;
      if (!last.f) last.f = f;
    } else segs.push({ t, b, u, c, f });
  }
  if (/<w:sectPr\b/.test(pp) && val((/<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(pp) || [''])[0], 'w:type') !== 'continuous') breakAfter = true;
  // حدّ سفلي وحده على الفقرة: هكذا يحوّل Word السطر «---» (رفيع) و«___» (سميك)
  let border = '';
  const bdr = (/<w:pBdr>[\s\S]*?<\/w:pBdr>/.exec(pp) || [''])[0];
  if (bdr && !/<w:(top|left|right|start|end)\b[^>]*w:val="(?!nil"|none")/.test(bdr)) {
    const bt = (/<w:bottom\b[^>]*\/>/.exec(bdr) || [''])[0];
    const bv = (/w:val="([^"]+)"/.exec(bt) || [])[1] || '';
    const bs = +((/w:sz="(\d+)"/.exec(bt) || [])[1] || 0);
    if (bv === 'single') border = bs >= 12 ? 'under' : 'dash';
    else if (bv && bv !== 'nil' && bv !== 'none') border = 'orn';
  }
  const text = segs.map((s) => s.t).join('');
  let chars = 0;
  let boldChars = 0;
  const colors = new Map();
  for (const s of segs) {
    const n = noRefs(s.t).replace(/\s/g, '').length;
    chars += n;
    if (s.b) boldChars += n;
    if (s.c) colors.set(s.c, (colors.get(s.c) || 0) + n);
  }
  let color = '';
  for (const [c, n] of colors) if (chars > 0 && n >= chars * 0.9) color = c;
  const fonts = new Map();
  for (const s of segs) if (s.f) fonts.set(s.f, (fonts.get(s.f) || 0) + noRefs(s.t).replace(/\s/g, '').length);
  let font = '';
  for (const [f, n] of fonts) if (chars > 0 && n >= chars * 0.85) font = f;
  // فقرة في إطار (حدود من جهاتها، أو تظليل): هكذا يُكتب المتن في أعلى الصفحة في بعض الشروح
  const sides = bdr ? ['top', 'bottom', 'left', 'right', 'start', 'end'].filter((k) => new RegExp('<w:' + k + '\\b[^>]*w:val="(?!nil"|none")').test(bdr)).length : 0;
  const shd = (/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(pp) || [])[1] || '';
  const frame = sides >= 3 || (!!shd && !/^ffffff$/i.test(shd));
  const jcDirect = val(pp, 'w:jc');
  const jc = jcDirect || st.jc || '';
  const bidi = onOff(pp, 'w:bidi') ?? st.bidi ?? null;
  const ind = /<w:ind\b[^>]*>/.exec(pp);
  // ارتفاع السطر ثابتٌ دقيق (نقطةٌ أو نقطتان): فقرةٌ لا تُرى، يضعها المصمّم فاصلاً لا سطراً
  const spc = (/<w:spacing\b[^>]*>/.exec(pp) || [''])[0];
  const tiny = /w:lineRule="exact"/.test(spc) && +((/w:line="(\d+)"/.exec(spc) || [])[1] || 999) <= 120;
  // لون علامة الفقرة (خصائص سطرها الفارغ): لون ما يُكتب فيها، ولون رقمها الآلي
  const markR = (/<w:pPr>[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(pPr) || [])[1] || '';
  return {
    segs,
    text,
    tiny,
    markColor: hexColor(val(markR, 'w:color')) || st.color || '',
    markFont: fontOf(markR) ? fontOf(markR) + '|' + (szOf(markR) || st.sz || 0) : '',
    refs,
    style: st,
    outline: directOutline !== null ? +directOutline : st.outline ?? null,
    jc,
    jcDirect: !!jcDirect,
    bidi,
    bold: chars > 0 && boldChars >= chars * 0.9,
    color,
    font,
    frame,
    chars,
    boldChars,
    numId: numPr ? val(numPr, 'w:numId') : null,
    ilvl: numPr ? +(val(numPr, 'w:ilvl') || 0) : 0,
    indent: ind ? +((/w:(?:start|left|right)="(-?\d+)"/.exec(ind[0]) || [])[1] || 0) : 0,
    spaceBefore: +((/<w:spacing\b[^>]*w:before="(\d+)"/.exec(pp) || [])[1] || 0),
    // تباعد الأسطر: «auto» مضاعفٌ للسطر المفرد، و«exact»/«atLeast» بالنقاط ← نسبةٌ إلى مقاس الخط (تُحسب بعد معرفته)
    lineRule: (/w:lineRule="(\w+)"/.exec(spc) || [])[1] || (/w:line="/.test(spc) ? 'auto' : ''),
    line: +((/w:line="(\d+)"/.exec(spc) || [])[1] || 0),
    breakBefore,
    breakAfter,
    soft,
    softMid,
    // نص مربعات النص في الفقرة (شرح على صورة، أو إطار نص)
    tbx: body.includes('<w:tbx ') ? [...body.matchAll(/<w:tbx w:val="([^"]*)"\/>/g)].map((m) => cleanRun(decodeXml(m[1])).trim()).filter(Boolean) : [],
    capStyle: /^(caption|تسمية توضيحية)$/.test(st.name || ''),
    border,
    hr: /<v:rect\b[^>]*o:hr="t"/.test(body),
    tocField,
    // سطر من أسطر الفهرس الآلي: فيه رقم صفحة عنوانه أو رابطه
    pageref: /PAGEREF|w:anchor="_Toc/.test(body),
    fld: [...body.matchAll(/w:fldCharType="(begin|end)"/g)].map((m) => m[1]),
    images: imagesOf(body),
  };
}
/** جهة الفقرة كما تُرى: c وسط · l يسار · r يمين · j مضبوطة. في الفقرة العربية «left» هي بداية السطر (اليمين) */
/** نص الرقم الآلي: «(%1)» ← «(١)»، و«%1.%2» ← «١.٣» (العدّ لكل مستوى) */
function numLabel(lv, counts, ilvl) {
  if (!lv) return '';
  if (lv.fmt === 'none') return '';
  if (lv.fmt === 'bullet') return '•';
  const t = lv.text == null ? '%' + (ilvl + 1) + '-' : lv.text;
  return t.replace(/%([1-9])/g, (m, k) => ar(counts[+k - 1] || 1));
}
const sideOf = (jc, bidi) => (jc === 'center' ? 'c' : /^(both|distribute|lowKashida|mediumKashida|highKashida|thaiDistribute)$/.test(jc) ? 'j' : jc === 'left' || jc === 'start' ? (bidi ? 'r' : 'l') : jc === 'right' || jc === 'end' ? (bidi ? 'l' : 'r') : bidi ? 'r' : 'l');

/** شطران في سطر واحد بينهما جدولة أو فراغ واسع ← بيت (ومعه أرقامه إن كانت في خاناتٍ من السطر: «١ ⇥ الصدر ⇥ ٩٠ ⇥ العجز») */
function tabVerse(text) {
  if (!/\t| {4,}/.test(text)) return null;
  const all = text.split(/\s*(?:\t+| {4,})\s*/).map((x) => x.trim()).filter(Boolean);
  const ok = (h) => h.length >= 6 && h.length <= 90 && AR_LETTERS.test(h) && h.split(/\s+/).length >= 2;
  if (all.length === 2) return ok(all[0]) && ok(all[1]) ? all : null;
  // خاناتٌ فيها أرقام: ما قبل الصدر عدٌّ، وما بين الشطرين رقم البيت، وما بعد العجز رقمه
  if (all.length < 3 || all.length > 5) return null;
  const nums = all.map(numOnly);
  const texts = all.map((t, i) => (nums[i] ? null : t)).filter((t) => t != null);
  if (texts.length !== 2 || !ok(texts[0]) || !ok(texts[1])) return null;
  return withNums(texts, all.indexOf(texts[0]), all.indexOf(texts[1]), nums);
}
/** «الصدر ... العجز» (أو «…» أو «***») في سطرٍ واحد ← { dv: [الصدر، العجز] } */
function dotVerse(text) {
  const t = String(text || '').replace(/[\t\n]+/g, ' ').trim();
  if (t.length > 190) return {};
  const parts = t.split(/\s+(?:\.{3,}|…+|\*{1,3}|•)\s+/);
  if (parts.length !== 2) return {};
  const ok = (h) => h.length >= 6 && h.length <= 100 && AR_LETTERS.test(h) && h.split(/\s+/).length >= 2;
  return ok(parts[0]) && ok(parts[1]) ? { dv: parts.map((x) => x.trim()) } : {};
}
/**
 * أرقام البيت من خاناتها إلى نصه بصيغةٍ واحدة يعرفها «المتون» فيحذفها ويحفظها:
 * العدّ قبل الصدر «١- الصدر»، ورقم البيت بين الشطرين «الصدر (٩٠)»، أو بعد العجز «العجز (٩٠)»
 */
function withNums([p0, p1], i0, i1, nums) {
  const before = nums.slice(0, i0).find(Boolean);
  const mid = nums.slice(i0 + 1, i1).find(Boolean);
  const after = nums.slice(i1 + 1).find(Boolean);
  return [(before ? ar(before) + '- ' : '') + p0 + (mid ? ' (' + ar(mid) + ')' : ''), p1 + (after ? ' (' + ar(after) + ')' : '')];
}

/** عناصر الجسم بالترتيب: فقرات وجداول */
function* blocksOf(xml) {
  let i = 0;
  for (;;) {
    const m = /<w:(tbl|p)(?=[\s>/])/g;
    m.lastIndex = i;
    const hit = m.exec(xml);
    if (!hit) return;
    const s = hit.index;
    if (hit[1] === 'tbl') {
      const e = endOf(xml, s, 'w:tbl');
      yield { type: 'tbl', xml: xml.slice(s, e) };
      i = e;
    } else {
      const gt = xml.indexOf('>', s);
      if (xml[gt - 1] === '/') {
        yield { type: 'p', xml: '' };
        i = gt + 1;
        continue;
      }
      const e = xml.indexOf('</w:p>', s);
      const end = e < 0 ? xml.length : e + 6;
      yield { type: 'p', xml: xml.slice(s, end) };
      i = end;
    }
  }
}

/** جدول ← صفوفه وخلاياه (مع الدمج والحدود والاتجاه). الجدول داخل خلية تُؤخذ فقراته نصاً في خليته */
function readTable(xml, styles, numOf = null) {
  let inner = xml.replace(/^<w:tbl(?:\s[^>]*)?>/, '');
  for (let g = 0; g < 200; g++) {
    const s = inner.search(/<w:tbl(?=[\s>])/);
    if (s < 0) break;
    const e = endOf(inner, s, 'w:tbl');
    inner = inner.slice(0, s) + (inner.slice(s, e).match(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g) || []).join('') + inner.slice(e);
  }
  const tblPr = (/<w:tblPr>[\s\S]*?<\/w:tblPr>/.exec(inner) || [''])[0];
  const tb = (/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/.exec(tblPr) || [''])[0];
  const ts = styles.get(val(tblPr, 'w:tblStyle') || ' ') || {};
  let bordered = tb ? visibleBorder(tb) : !!ts.tblBorders;
  const grid = [...inner.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)].map((m) => +m[1]);
  const rows = [];
  for (const r of inner.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)) {
    const trPr = (/<w:trPr>[\s\S]*?<\/w:trPr>/.exec(r[1]) || [''])[0];
    const cells = [];
    for (const c of r[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)) {
      const tcPr = (/<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(c[1]) || [''])[0];
      const paras = [...blocksOf(c[1].replace(tcPr, ''))]
        .filter((b) => b.type === 'p' && b.xml)
        .map((b) => {
          const p = parsePara(b.xml, styles);
          // الرقم الآلي في الخلية («(١)» في خانة رقم البيت): ليس في نص الملف، فيُكتب
          const pre = numOf ? numOf(p) : '';
          if (pre) {
            p.text = pre + p.text;
            p.segs.unshift({ t: pre, b: false, u: false, c: p.markColor || '', f: '' });
            p.chars += pre.length;
            if (!p.color && p.markColor) p.color = p.markColor;
          }
          return p;
        });
      const vm = /<w:vMerge\b[^>]*>/.exec(tcPr);
      const cb = (/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/.exec(tcPr) || [''])[0];
      if (cb && visibleBorder(cb)) bordered = true;
      const fill = (/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(tcPr) || [])[1] || '';
      const lettered = paras.filter((p) => p.chars);
      cells.push({
        text: cleanText(paras.map((p) => p.text.replace(/[\t\n]+/g, ' ')).join(' ')),
        paras,
        // لون الخلية وخطها (من نصها، وإلا من علامة فقرتها): فتبقى الخانة الفارغة بلونها
        color: (lettered.length && lettered.every((p) => p.color && p.color === lettered[0].color) ? lettered[0].color : '') || (!lettered.length && paras[0] ? paras[0].markColor : ''),
        font: (lettered.length && lettered.every((p) => p.font && p.font === lettered[0].font) ? lettered[0].font : '') || (paras[0] ? paras[0].markFont : ''),
        jc: paras[0] ? paras[0].jc : '',
        span: Math.max(1, +(val(tcPr, 'w:gridSpan') || 1)),
        vm: vm ? (/w:val="restart"/.test(vm[0]) ? 'r' : 'c') : '',
        bg: fill && !/^(ffffff|auto)$/i.test(fill) ? '#' + fill.toLowerCase() : '',
      });
    }
    if (cells.length) rows.push({ cells, hdr: onOff(trPr, 'w:tblHeader') === true });
  }
  return { rows, grid, rtl: onOff(tblPr, 'w:bidiVisual') === true, bordered };
}

/** صفوف جدول الشعر ← أسطر: صف بشطرين (أو شطران في صفين متتاليين) بيت، وغيره خلاياه متتابعة */
function tableLines(rowsIn) {
  const rows = rowsIn.map((r) => r.cells);
  const hemi = (t) => t.length >= 3 && t.length <= 90 && AR_LETTERS.test(t);
  const out = [];
  let single = null; // شطر وحده في صفه (وضع «الشطر الثاني في السطر التالي»)
  const flushSingle = () => {
    if (single) out.push({ text: single.text, refs: single.refs });
    single = null;
  };
  rows.forEach((cells, ri) => {
    const full = cells.filter((c) => c.text && !/^[\s*✽۞❁❖•◆~.…]+$/.test(c.text));
    const refsOf = (cs) => cs.flatMap((c) => c.paras.flatMap((p) => p.refs));
    // صفٌّ بخانات أرقام: العدّ، والصدر، ورقم البيت في المنظومة (في الوسط)، والعجز — أو بعضها
    const nums = cells.map((c) => numOnly(noRefs(c.text)));
    if (cells.length >= 3 && cells.length <= 6 && nums.some(Boolean)) {
      const texts = full.filter((c, i) => !numOnly(noRefs(c.text)));
      // (الشطر: كلماتٌ بلا أرقام — فجدول «رقم | اسم ١ | وصف» ليس شعراً)
      const hemiN = (t) => hemi(t) && noRefs(t).length >= 8 && noRefs(t).trim().split(/\s+/).length >= 2 && !/[0-9٠-٩]/.test(noRefs(t));
      if (texts.length === 2 && hemiN(texts[0].text) && hemiN(texts[1].text)) {
        flushSingle();
        const i0 = cells.indexOf(texts[0]);
        const i1 = cells.indexOf(texts[1]);
        out.push({ verse: withNums([joinRefs(texts[0]), joinRefs(texts[1], texts[0].paras.reduce((a, p) => a + p.refs.length, 0))], i0, i1, nums), refs: refsOf(texts), num: true });
        return;
      }
    }
    // صف العنوان في أول الجدول («م | الصدر | رقم | العجز»): خاناتٌ قصيرة
    if (ri === 0 && cells.length >= 3 && full.length >= 3 && full.every((c) => noRefs(c.text).length <= 16 && !numOnly(noRefs(c.text)))) {
      for (const c of cells) for (const p of c.paras) if (cleanText(p.text)) out.push({ text: p.text, refs: p.refs, para: p, hdr: true });
      return;
    }
    // بيتٌ في خانةٍ واحدة: شطران في فقرتين، أو «الصدر ... العجز» أو بالجدولة في فقرة
    if (full.length === 1) {
      const c = full[0];
      const ps = c.paras.filter((p) => cleanText(noRefs(p.text)));
      const two = ps.length === 2 && ps.every((p) => hemi(cleanText(noRefs(p.text.replace(/[\t\n]+/g, ' ')))));
      const one = ps.length === 1 ? tabVerse(noRefs(ps[0].text).replace(/\n/g, ' ')) || (dotVerse(noRefs(ps[0].text)).dv || null) : null;
      if (two || one) {
        flushSingle();
        out.push({ verse: two ? [joinRefs({ paras: [ps[0]] }), joinRefs({ paras: [ps[1]] }, ps[0].refs.length)] : one, refs: refsOf(full) });
        return;
      }
    }
    if (cells.length >= 2 && cells.length <= 3 && full.length === 2 && hemi(full[0].text) && hemi(full[1].text)) {
      flushSingle();
      out.push({ verse: [joinRefs(full[0]), joinRefs(full[1], full[0].paras.reduce((a, p) => a + p.refs.length, 0))], refs: refsOf(full) });
    } else if (cells.length >= 2 && cells.length <= 3 && full.length === 1 && hemi(full[0].text)) {
      const cur = { text: joinRefs(full[0]), refs: refsOf(full) };
      if (single) {
        out.push({ verse: [single.text, shiftRefs(cur.text, single.refs.length)], refs: [...single.refs, ...cur.refs] });
        single = null;
      } else single = cur;
    } else {
      flushSingle();
      for (const c of cells) for (const p of c.paras) if (cleanText(p.text)) out.push({ text: p.text, refs: p.refs, para: p });
    }
  });
  flushSingle();
  return out;
}
/** نص الخلية مع إعادة ترقيم مواضع الإحالات لتتصل عبر فقراتها */
function joinRefs(cell, base = 0) {
  let n = base;
  return cleanText(
    cell.paras
      .map((p) => {
        const t = p.text.replace(/[\t\n]+/g, ' ').replace(/\u0007(\d+)\u0008/g, (m, k) => `\u0007${n + +k}\u0008`);
        n += p.refs.length;
        return t;
      })
      .join(' '),
  );
}
const shiftRefs = (text, by) => text.replace(/\u0007(\d+)\u0008/g, (m, k) => `\u0007${by + +k}\u0008`);

/* ------------------------------------------------------------ العناوين والفواصل والفهرس */
const HEAD_1 = /^(?:كتاب|الباب|القسم|المقدمة|مقدمة|الخاتمة|خاتمة|تمهيد|التمهيد|الجزء)(?:\s|$)/;
const HEAD_2 = /^(?:باب|الفصل|فصل|المبحث|مبحث)(?:\s|$)/;
const HEAD_3 = /^(?:المطلب|مطلب|مسألة|المسألة|فرع|تنبيه|فائدة|تتمة|تذييل)(?:\s|$|:)/;
const NOT_HEAD = /^(?:بسم الله|الحمد لله|وصلى الله|والله أعلم|تم بحمد|آمين)/;
// سطر كله شرطات أو تطويل: فاصل المتن عن الشرح · سطر كله شرطات سفلية: خط الحواشي المكتوبة يدوياً
const SEP_DASH = /^\s*(?:[-‐‑‒–—―]\s*){3,}$|^\s*ـ{2,}\s*$/;
const SEP_UNDER = /^\s*(?:_\s*){3,}$/;
const NOTE_LINE = /^\s*(?:[(\[]\s*([0-9٠-٩]{1,3})\s*[)\]]\s*[-–:]?|([0-9٠-٩]{1,3})\s*[-–.)])\s*/;
// عنوان الفهرس وأخواته: «الفهرس»، «فهرس الموضوعات»، «فهرس المحتويات»، «المحتويات»، «محتويات الكتاب»، «فهرس الآيات»، «ثبت الموضوعات»…
const TOC_TITLE = /^(?:ال)?(?:فهرس|فهرست|فهارس|محتويات|ثبت)(?:\s+[\u0621-\u064A]+){0,3}\s*[:：]?$|^(?:قائمة|جدول)\s+(?:ال)?محتويات\s*[:：]?$/;
const TOC_ENTRY = /^(.{2,160}?)(?:\s*[.…·_]{3,}\s*|\s*\t+\s*|\s{3,})([0-9٠-٩]{1,4})$/;
// سطر رقم الصفحة في الملفات المنقولة («ص: ١٢»، «[ص: ١٢]»، «الجزء: ١ ¦ الصفحة: ١٢»): نهاية صفحة، لا نص
const PAGE_MARK = /^[\[(]?\s*(?:(?:الجزء|ج)\s*[:：]?\s*[0-9٠-٩]{1,3}\s*[¦|،\-–/]\s*)?(?:ص|صفحة|الصفحة)\s*[:：]?\s*[0-9٠-٩]{1,5}\s*[\])]?$/;
// أول شرح الصورة: «شكل (١)»، «صورة ٢:»، «المصدر: …»
const CAP_WORD = /^(?:ال)?(?:شكل|صورة|رسم|مخطط|خريطة|لوحة|نموذج|مصدر|خارطة|رسمة|شاشة)(?:\s+(?:رقم|توضيحي|توضيحية|بياني|بيانية))?\s*(?:[(\[]?\s*[0-9٠-٩]{1,3}(?:\s*[-–.]\s*[0-9٠-٩]{1,3})?\s*[)\]]?)?\s*(?:[:：.\-–]|$)/;
const MATN_LABEL = /^\s*(?:ال)?(?:متن|نص)\s*[:：]\s*/;
const SHARH_LABEL = /^\s*(?:ال)?(?:شرح|تعليق|توضيح)\s*[:：]\s*/;
const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const norm = (s) => normalizeArabic(s);

// نثر فيه « ... » أو « * » بين كلامين قصيرين يحسبه المحلّل بيتاً: فاصل لا يُرى (U+2060) يمنع ذلك (البيت الحقيقي يكتبه المستورد نفسه)
const WJ = '\u2060';
// (يُنظر إلى النص بلا علامات التنسيق والإحالات، فهي لا تُرى)
const guardVerse = (t) => (/\s(?:\.{3,}|…+|\*{1,3}|•)\s/.test(t.replace(/\u0010[^\u0011]*\u0011|\u0012|\u0007\d+\u0008/g, '')) ? t.replace(/\.{3,}|…+|\*{1,3}|•/g, (sym) => sym[0] + WJ + sym.slice(1)) : t);
// سطر تالٍ في حاشية يبدأ برقم أو قوس: لا يُحسب حاشية جديدة
const guardNote = (t) => (/^\s*(?:[(\[]\s*[0-9٠-٩*]|[0-9٠-٩]{1,3}\s*(?:[-–.)ـ:]|\s)|=)/.test(t) ? WJ + t : t);

/* ------------------------------------------------------------ الاستيراد */
/**
 * @param {Uint8Array|ArrayBuffer} bytes  محتوى ملف ‎.docx
 * @param {object} o
 * @param {(u8: Uint8Array) => Promise<Uint8Array>|Uint8Array} o.inflate  فك deflate الخام (zlib.inflateRawSync في Node، inflateRawBrowser في المتصفح)
 * @param {string} [o.fileName]  اسم الملف: منه اسم الكتاب («اسم الكتاب - المؤلف.docx» يعطي المؤلف أيضاً)
 * @param {string|number} [o.id]
 * @param {number} [o.pageChars]  حجم الصفحة التقريبي بالأحرف (١٨٠٠)
 * @param {object} [o.options]  { matn, keepCover, keepFormat, toc } (cleanWordOptions)
 * @param {(bytes: Uint8Array, mime: string, info: object|null) => Promise<{src,w,h}|null|undefined>} [o.image]
 *        تحويل الصورة (في المتصفح: تصغير الكبيرة وتحويل ما لا يُعرض). undefined = تبقى كما هي.
 * @returns {Promise<{id, name, info, cover, volumes, totalPages, book, pages, stats, word, parse}>}  كما يعيد ‎/api/book، ومعه pages
 */
export async function importDocx(bytes, o = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0x50 || b[1] !== 0x4b) {
    if (b[0] === 0xd0 && b[1] === 0xcf) throw new Error('هذا ملف Word قديم (‎.doc). افتحه في Word واحفظه بصيغة ‎.docx ثم ارفعه');
    throw new Error('الملف ليس ملف Word صالحاً (‎.docx)');
  }
  const opt = cleanWordOptions(o.options);
  const zip = zipEntries(b);
  const readBytes = async (name) => {
    const e = zip.get(name);
    if (!e) return null;
    return e.method === 0 ? e.data : await o.inflate(e.data);
  };
  const read = async (name) => {
    const raw = await readBytes(name);
    return raw ? dec.decode(raw) : '';
  };
  let docXml = await read('word/document.xml');
  if (!docXml) throw new Error('الملف ليس مستند Word (لا نص فيه)');
  const styles = parseStyles(await read('word/styles.xml'));
  const numbering = parseNumbering(await read('word/numbering.xml'));
  const core = await read('docProps/core.xml');
  const relMap = new Map();
  for (const m of (await read('word/_rels/document.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (/\bId="([^"]+)"/.exec(m[0]) || [])[1];
    const target = (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1];
    if (id && target && !/TargetMode="External"/.test(m[0])) relMap.set(id, target);
  }

  // ما لا يُقرأ: مربعات النص، والبدائل، والنص المحذوف وتغييرات التنسيق في تتبّع التغييرات
  /** مربع النص ← عنصر واحد يحمل نصه (فقراته أسطر)، فلا تتداخل فقراته مع فقرات المستند */
  const boxText = (xml) => {
    let out = '';
    let i = 0;
    const open = '<w:txbxContent';
    const close = '</w:txbxContent>';
    for (;;) {
      const a = xml.indexOf(open, i);
      if (a < 0) return out + xml.slice(i);
      const b = xml.indexOf(close, a);
      if (b < 0) return out + xml.slice(i, a);
      const inner = xml.slice(a, b);
      const lines = (inner.match(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g) || []).map((p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')).filter((l) => l.trim());
      // صورة داخل مربع النص تبقى صورةً (يُحفظ مرجعها في مكانه)
      const blips = [...inner.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)]
        .map((m) => {
          const rid = (/<a:blip\b[^>]*r:embed="([^"]+)"/.exec(m[1]) || [])[1];
          const ext = /<wp:extent\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(m[1]);
          return rid ? `<w:tbi w:rid="${rid}" w:cx="${ext ? ext[1] : 0}" w:cy="${ext ? ext[2] : 0}"/>` : '';
        })
        .concat([...inner.matchAll(/<v:imagedata\b[^>]*r:id="([^"]+)"/g)].map((m) => `<w:tbi w:rid="${m[1]}" w:cx="0" w:cy="0"/>`))
        .join('');
      out += xml.slice(i, a) + blips + (lines.length ? `<w:tbx w:val="${lines.join('&#10;').replace(/"/g, '&quot;')}"/>` : '');
      i = b + close.length;
    }
  };
  const strip = (xml0) => {
    let s = xml0;
    // البديل القديم (VML) أولاً، ثم مربعات النص
    if (s.includes('<mc:Fallback')) s = dropAll(s, 'mc:Fallback');
    if (s.includes('<w:txbxContent')) s = boxText(s);
    for (const t of ['w:object', 'w:del', 'w:moveFrom', 'w:pPrChange', 'w:rPrChange', 'w:sectPrChange', 'w:tblPrChange', 'w:trPrChange', 'w:tcPrChange']) if (s.includes('<' + t)) s = dropAll(s, t);
    return s;
  };
  // مقاس الصفحة ومنطقة النص (بوحدة twip): لمعرفة عرض الصورة نسبةً إلى السطر، وهل تملأ الصفحة
  const sects = docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || [];
  const sp = sects.length ? sects[sects.length - 1] : '';
  const attr = (tag, name, d) => +((new RegExp(`<${tag}\\b[^>]*\\b${name}="(-?\\d+)"`).exec(sp) || [])[1] ?? d);
  const pgW = attr('w:pgSz', 'w:w', 11906) || 11906;
  const pgH = attr('w:pgSz', 'w:h', 16838) || 16838;
  const mL = Math.abs(attr('w:pgMar', 'w:left', 1440));
  const mR = Math.abs(attr('w:pgMar', 'w:right', 1440));
  const mT = Math.abs(attr('w:pgMar', 'w:top', 1440));
  const mB = Math.abs(attr('w:pgMar', 'w:bottom', 1440));
  const textW = Math.max(2000, pgW - mL - mR);
  const bodyM = /<w:body>([\s\S]*)<\/w:body>/.exec(docXml);
  const body = strip(bodyM ? bodyM[1] : docXml);
  docXml = '';
  // أقسام الملف بترتيبها: مقاس صفحاتها وهوامشها، ورؤوسها (الأولى والمعتادة)؛ ومن رأس القسم تُعرف خلفية صفحاته
  // (ورأسٌ لم يُذكر في قسمٍ يرثه من القسم الذي قبله، كما في Word)
  const sections = [];
  {
    let inh = { first: '', default: '', even: '' };
    let inhF = { first: '', default: '', even: '' };
    for (const x of sects) {
      const a = (tag, name, d) => +((new RegExp(`<${tag}\\b[^>]*\\b${name}="(-?\\d+)"`).exec(x) || [])[1] ?? d);
      const refs = { ...inh };
      for (const m of x.matchAll(/<w:headerReference\b[^>]*>/g)) {
        const t = (/w:type="(\w+)"/.exec(m[0]) || [])[1] || 'default';
        const id = (/r:id="([^"]+)"/.exec(m[0]) || [])[1] || '';
        if (id) refs[t] = id;
      }
      inh = refs;
      const frefs = { ...inhF };
      for (const m of x.matchAll(/<w:footerReference\b[^>]*>/g)) {
        const t = (/w:type="(\w+)"/.exec(m[0]) || [])[1] || 'default';
        const id = (/r:id="([^"]+)"/.exec(m[0]) || [])[1] || '';
        if (id) frefs[t] = id;
      }
      inhF = frefs;
      sections.push({
        refs,
        frefs,
        ft: Math.abs(a('w:pgMar', 'w:footer', 720)),
        titlePg: onOff(x, 'w:titlePg') === true,
        w: a('w:pgSz', 'w:w', 11906) || 11906,
        h: a('w:pgSz', 'w:h', 16838) || 16838,
        mL: Math.abs(a('w:pgMar', 'w:left', 1440)),
        mR: Math.abs(a('w:pgMar', 'w:right', 1440)),
        mT: Math.abs(a('w:pgMar', 'w:top', 1440)),
        mB: Math.abs(a('w:pgMar', 'w:bottom', 1440)),
        hd: Math.abs(a('w:pgMar', 'w:header', 720)),
        chars: 0,
      });
    }
    if (!sections.length) sections.push({ refs: {}, titlePg: false, w: pgW, h: pgH, mL, mR, mT, mB, hd: 720, chars: 0 });
  }
  let secIdx = 0; // القسم الجاري
  let firstBreakAt = -1; // أحرف النص قبل أول فاصل صفحة (صفحة أولى فارغة: الغلاف في رأسها)

  const stats = { paragraphs: 0, headings: 0, notes: 0, verses: 0, tables: 0, images: 0, covers: 0, titlePages: 0, guessedHeadings: 0, imagesSkipped: 0, typedNotes: 0 };

  // الصور: من ملفات الوسائط في الملف، مرة واحدة لكل صورة
  const imgCache = new Map();
  let imgBudget = Math.max(1, +o.maxImageMB || 90) * 1024 * 1024;
  /** مسار ملفٍ في الحزمة من هدف علاقةٍ (نسبةً إلى word/) */
  const partPath = (target, base = 'word/') => {
    const parts = [];
    for (const seg of (target.startsWith('/') ? target.slice(1) : base + target).split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  };
  const loadImage = async (rid, rels = relMap) => {
    const key = (rels === relMap ? '' : 'h:') + rid + '|' + (rels.get(rid) || '');
    if (imgCache.has(key)) return imgCache.get(key);
    let res = null;
    const target = rels.get(rid);
    if (target) {
      const e = zip.get(partPath(target));
      if (e && e.data.length <= 25 * 1024 * 1024) {
        try {
          const raw = e.method === 0 ? e.data : await o.inflate(e.data);
          const info = imageInfo(raw);
          let out = o.image ? await o.image(raw, info ? info.mime : '', info) : undefined;
          if (out === undefined) out = info && /png|jpeg|gif/.test(info.mime) && info.w > 0 && info.h > 0 ? { src: `data:${info.mime};base64,${toBase64(raw)}`, w: info.w, h: info.h } : null;
          if (out && out.src && out.w > 0 && out.h > 0 && out.src.length <= imgBudget) {
            imgBudget -= out.src.length;
            res = { src: out.src, w: Math.round(out.w), h: Math.round(out.h) };
          }
        } catch {}
      }
    }
    if (!res) stats.imagesSkipped++;
    imgCache.set(key, res);
    return res;
  };
  /**
   * رأس صفحة: صورته التي خلف النص بمقاس الصفحة (خلفية الصفحة)، ومربعات النص فيه بمواضعها (عنوان الغلاف المكتوب على صورته)
   * ← { bg: {src,w,h}|null, texts: [{ lines, x, y, w, h, color, size, bold, font, jc }] } (المواضع نسبةً إلى الصفحة)
   */
  const headerCache = new Map();
  const readHeader = async (rid, sec) => {
    if (!rid || !relMap.has(rid)) return null;
    if (headerCache.has(rid)) return headerCache.get(rid);
    const path = partPath(relMap.get(rid));
    const raw = await read(path);
    const out = { bg: null, texts: [] };
    if (raw) {
      const hrels = new Map();
      for (const m of (await read(path.replace(/([^/]+)$/, '_rels/$1.rels'))).matchAll(/<Relationship\b[^>]*>/g)) {
        const id = (/\bId="([^"]+)"/.exec(m[0]) || [])[1];
        const target = (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1];
        if (id && target && !/TargetMode="External"/.test(m[0])) hrels.set(id, target);
      }
      const xml = raw.includes('<mc:Fallback') ? dropAll(raw, 'mc:Fallback') : raw;
      const EMU_TW = 635;
      const W = sec.w * EMU_TW;
      const H = sec.h * EMU_TW;
      for (const m of xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)) {
        const a = m[0];
        const ext = /<wp:extent\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(a);
        const cx = ext ? +ext[1] : 0;
        const cy = ext ? +ext[2] : 0;
        const blip = (/<a:blip\b[^>]*r:embed="([^"]+)"/.exec(a) || [])[1];
        // صورة خلف النص تملأ الصفحة (أو أكثرها): خلفية
        if (blip && !out.bg && cx >= W * 0.6 && cy >= H * 0.6 && !/<w:txbxContent/.test(a)) {
          out.bg = await loadImage(blip, hrels);
          continue;
        }
        if (!/<w:txbxContent/.test(a)) continue;
        // مربع نص: موضعه (من حافة الصفحة)، وأسطره بلونها ومقاسها وخطها
        const pos = (axis) => {
          const m2 = new RegExp(`<wp:position${axis}\\b[^>]*relativeFrom="(\\w+)"[^>]*>([\\s\\S]*?)</wp:position${axis}>`).exec(a);
          if (!m2) return 0;
          const off = +((/<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(m2[2]) || [])[1] || 0);
          const al = (/<wp:align>(\w+)<\/wp:align>/.exec(m2[2]) || [])[1] || '';
          const rel = m2[1];
          if (axis === 'H') {
            const [r0, r1] = rel === 'page' ? [0, W] : [sec.mL * EMU_TW, W - sec.mR * EMU_TW];
            return al === 'center' ? (r0 + r1 - cx) / 2 : al === 'right' ? r1 - cx : al === 'left' ? r0 : r0 + off;
          }
          const r0 = rel === 'page' ? 0 : rel === 'margin' || rel === 'topMargin' ? (rel === 'margin' ? sec.mT * EMU_TW : 0) : sec.hd * EMU_TW;
          return al === 'center' ? (H - cy) / 2 : al === 'bottom' ? H - cy : r0 + off;
        };
        const box = /<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/.exec(a);
        const paras = [];
        for (const pm of (box ? box[1] : '').matchAll(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g)) {
          const pp = parsePara(pm[0], styles);
          const r0 = (/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/.exec(pm[0].replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '')) || [])[1] || '';
          const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(r0) || [''])[0];
          const lines = pp.text.split('\n').map((t) => cleanText(t.replace(/\t/g, ' '))).filter(Boolean);
          if (!lines.length) continue;
          const cv = val(rPr, 'w:color');
          paras.push({ lines, color: cv && /^[0-9a-f]{6}$/i.test(cv) ? '#' + cv.toLowerCase() : '#000000', size: (+(val(rPr, 'w:sz') || val(rPr, 'w:szCs') || 0) || 24) / 2, bold: (onOff(rPr, 'w:bCs') ?? onOff(rPr, 'w:b')) === true, font: (/w:cs="([^"]+)"/.exec((/<w:rFonts\b[^>]*>/.exec(rPr) || [''])[0]) || [])[1] || '', jc: sideOf(pp.jc, true) });
        }
        if (paras.length) out.texts.push({ paras, x: +(pos('H') / W).toFixed(4), y: +(pos('V') / H).toFixed(4), w: +(cx / W).toFixed(4), h: +(cy / H).toFixed(4) });
      }
    }
    headerCache.set(rid, out);
    return out;
  };

  // الحواشي السفلية والختامية: رقمها في الملف ← أسطرها
  const noteLines = { footnote: new Map(), endnote: new Map(), typed: new Map() };
  for (const [kind, file] of [['footnote', 'word/footnotes.xml'], ['endnote', 'word/endnotes.xml']]) {
    const xml = strip(await read(file));
    for (const m of xml.matchAll(new RegExp(`<w:${kind}\\s([^>]*)>([\\s\\S]*?)<\\/w:${kind}>`, 'g'))) {
      if (/w:type="(separator|continuationSeparator|continuationNotice)"/.test(m[1])) continue;
      const id = (/w:id="(-?\d+)"/.exec(m[1]) || [])[1];
      const lines = [];
      for (const blk of blocksOf(m[2])) {
        if (blk.type === 'tbl') {
          for (const l of tableLines(readTable(blk.xml, styles).rows)) lines.push(l.verse ? l.verse.map((h) => noRefs(h)).join(' ... ') : cleanText(noRefs(l.text).replace(/[\t\n]+/g, ' ')));
        } else if (blk.xml) {
          const p = parsePara(blk.xml, styles);
          const raw = noRefs(p.text);
          const v = tabVerse(raw);
          for (const part of v ? [v.join(' ... ')] : raw.split('\n')) {
            const t = cleanText(part.replace(/\t+/g, ' '));
            if (t) lines.push(v ? t : guardVerse(t));
          }
        }
      }
      // بعض الملفات تحيط رقم الحاشية بقوسين مكتوبين: «(¹) النص» ← يبقى في أول الحاشية «()» فارغان
      // وبعضها يكتب الرقم نفسه في أول الحاشية «(١) النص» أو «(¬١)» (كما في الشاملة): رقمها يضعه الموقع
      if (lines.length) lines[0] = lines[0].replace(/^[(\[]\s*[)\]]\s*/, '').replace(/^[(\[]\s*¬?\s*[0-9٠-٩]{1,3}\s*[)\]]\s*[-–:]?\s*/, '');
      // حاشية برمز مكتوب (لا رقم آلي فيها): رقمها المكتوب في أولها «١- النص» يُرفع كذلك
      if (lines.length && !new RegExp(`<w:${kind}Ref\\b`).test(m[2])) lines[0] = lines[0].replace(/^[0-9٠-٩*]{1,3}\s*[-–.):]\s*/, '');
      if (id !== undefined && lines.length && lines.some(Boolean)) noteLines[kind].set(id, lines.filter(Boolean));
    }
  }

  /* ---------------------------------------------------------- ١) عناصر الملف بالترتيب */
  // kind: p فقرة · head عنوان · verse بيت · tbl جدول · img صورة · cover صورة تملأ الصفحة · sep فاصل متن/شرح ·
  //       nsep خط الحواشي المكتوبة · hr خط زخرفي · break فاصل صفحة (soft: كما صفّها Word آخر مرة)
  const items = [];
  const counters = new Map();
  let styledHeads = 0;
  let docTitle = '';
  let textSoFar = 0; // أحرف النص قبل هذا الموضع (لمعرفة غلاف أول الملف وموضع الفهرس)
  const toc = { entries: [], title: '', at: -1, kind: '', sec: -1 };
  let tocDepth = -1; // داخل حقل TOC
  let pageMarks = 0;
  let fldDepth = 0;
  const pushBreak = (soft) => {
    if (!soft && firstBreakAt < 0) firstBreakAt = textSoFar;
    const last = items[items.length - 1];
    if (last && last.kind === 'break') last.soft = last.soft && soft;
    else items.push({ kind: 'break', soft });
  };
  /** أسطر الفقرة: أجزاؤها مقسومة عند فواصل الأسطر، منظَّفة المسافات */
  const linesOfSegs = (segs) => {
    const lines = [[]];
    for (const s of segs) {
      const parts = s.t.split('\n');
      parts.forEach((part, i) => {
        if (i) lines.push([]);
        const t = part.replace(/[\t ]+/g, ' ');
        if (t) lines[lines.length - 1].push({ t, b: s.b, u: s.u, c: s.c, f: s.f });
      });
    }
    for (const l of lines) {
      while (l.length && !l[0].t.trim()) l.shift();
      while (l.length && !l[l.length - 1].t.trim()) l.pop();
      if (l.length) {
        l[0].t = l[0].t.replace(/^\s+/, '');
        l[l.length - 1].t = l[l.length - 1].t.replace(/\s+$/, '');
      }
    }
    return lines.filter((l) => l.length);
  };
  const textOfSegs = (segs) => segs.map((s) => s.t).join('');
  const pushImages = async (p, hasText) => {
    let hadCover = false;
    for (const im of p.images) {
      const wTw = im.cx / 635;
      const hTw = im.cy / 635;
      // صورة صغيرة في سطر النص (رمز أو زخرفة): لا تُجعل شكلاً مستقلاً
      if (hasText && !im.anchor && !im.boxed && hTw > 0 && hTw < 520 && wTw < 1500) {
        stats.imagesSkipped++;
        continue;
      }
      const data = await loadImage(im.rid);
      if (!data) continue;
      const w = wTw || data.w * 15;
      const h = hTw || (w * data.h) / data.w;
      const full = w >= pgW * 0.7 && h >= pgH * 0.6;
      // صورة طولية تملأ نصف الصفحة فأكثر قبل أي نص: غلاف الملف (وما دونها صورة عنوان تبقى في صفحتها بمقاسها)
      const first = textSoFar < 60 && !items.some((x) => x.kind === 'img' || x.kind === 'cover') && data.h / data.w >= 1.15 && w >= pgW * 0.5 && h >= pgH * 0.5;
      if (full || first) {
        items.push({ kind: 'cover', data, first: textSoFar < 200 });
        hadCover = true;
        continue;
      }
      // موضع الصورة العائمة من الصفحة (إن كان مرجعه الصفحة أو الهوامش): لصفحات الصور التي تُحفظ بتنسيقها
      let abs = null;
      if (im.anchor && im.ph && im.pv) {
        const rx = im.ph.rel === 'page' ? [0, pgW] : im.ph.rel === 'leftMargin' ? [0, mL] : im.ph.rel === 'rightMargin' ? [pgW - mR, pgW] : [mL, pgW - mR];
        const ry = im.pv.rel === 'page' ? [0, pgH] : im.pv.rel === 'topMargin' ? [0, mT] : im.pv.rel === 'bottomMargin' ? [pgH - mB, pgH] : im.pv.rel === 'margin' ? [mT, pgH - mB] : null;
        const at = (r, o, size) => (o.off !== null ? r[0] + o.off / 635 : /^(center)$/.test(o.align) ? (r[0] + r[1] - size) / 2 : /^(right|bottom|outside)$/.test(o.align) ? r[1] - size : r[0]);
        const x = at(rx, im.ph, w);
        if (ry) abs = { x: +(x / pgW).toFixed(4), y: +(at(ry, im.pv, h) / pgH).toFixed(4) };
        else abs = { x: +(x / pgW).toFixed(4), y: null };
      }
      let side = im.boxed ? 'c' : sideOf(p.jc, p.bidi ?? false);
      // عائمة بلا موضع رأسي معلوم: جهتها من موضعها الأفقي
      if (abs) {
        const cx = abs.x + w / pgW / 2;
        side = cx < 0.4 ? 'l' : cx > 0.6 ? 'r' : 'c';
      }
      items.push({ kind: 'img', data, wPct: Math.max(8, Math.min(100, Math.round((w / textW) * 100))), wPage: +(w / pgW).toFixed(4), side, ...(abs && abs.y !== null ? { abs } : {}) });
    }
    // نص مربعات النص مع الصورة (شرح موجز عليها أو تحتها): يبقى معها
    if (p.tbx.length && !hadCover) {
      const last = items[items.length - 1];
      if (last && last.kind === 'img') last.cap = [last.cap, ...p.tbx].filter(Boolean).join('\n');
    }
  };
  const tocEntryOf = (raw, level) => {
    const flat = noRefs(raw).replace(/\n/g, ' ');
    const tab = flat.indexOf('\t');
    let title = tab >= 0 ? flat.slice(0, tab) : flat;
    title = cleanText(title.replace(/[\s.…·_]{2,}[0-9٠-٩]{1,4}\s*$/, '').replace(/[.…·_]{3,}\s*$/, ''));
    if (tab < 0) title = title.replace(/\s+[0-9٠-٩]{1,4}$/, (m) => (/[.…·]/.test(flat) ? '' : m));
    return title ? { title, level } : null;
  };

  // فراغ قبل العنصر (فقرات فارغة ومسافة قبل الفقرة، twip): تُحفظ به مواضع الصور في صفحات العنوان
  let gapTw = 0;
  let gapFrom = 0;
  const applyGap = () => {
    for (let k = gapFrom; k < items.length; k++) {
      if (items[k].kind === 'break') {
        gapTw = 0; // فراغ آخر الصفحة لا يُنقل إلى التي بعدها
        continue;
      }
      if (gapTw) items[k].gap = gapTw;
      gapTw = 0;
      break;
    }
    gapFrom = items.length;
  };
  // فقراتٌ فارغة متتالية (أسطرٌ يكتب فيها الطالب تحت «التعليقات»): في المتون تُكتب أسطراً فارغة معلَّمة ليُعرف موضعها
  let blankRun = 0;
  const flushBlank = () => {
    if (o.blankLines && blankRun >= 3) {
      gapTw = Math.max(0, gapTw - blankRun * 340);
      for (let k = 0; k < blankRun; k++) items.push({ kind: 'p', segs: [{ t: BLANK_LINE, b: false, u: false, c: '' }], refs: [], cand: {}, side: 'r', wline: true });
    }
    blankRun = 0;
  };
  /** رقم الفقرة الآلي في خلية جدول بنصّه في الملف («(١)»، «١.»…) */
  const numOf = (p) => {
    if (!p.numId || p.numId === '0') return '';
    const lv = (numbering.get(p.numId) || new Map()).get(p.ilvl);
    if (!lv || lv.fmt === 'none') return '';
    if (lv.fmt === 'bullet') return '• ';
    const key = p.numId + ':' + p.ilvl;
    const n = counters.has(key) ? counters.get(key) + 1 : lv.start || 1;
    counters.set(key, n);
    for (const k of counters.keys()) if (k.startsWith(p.numId + ':') && +k.split(':')[1] > p.ilvl) counters.delete(k);
    const counts = [];
    for (let i = 0; i <= p.ilvl; i++) counts.push(counters.get(p.numId + ':' + i) || 1);
    return numLabel(lv, counts, p.ilvl) + ' ';
  };
  const secStart = [0];
  let pendingSect = false;
  // عنوان الفهرس قبله (فقرةٌ أو مربع نص «فهرس»): يُرفع ويصير عنوانه
  const takeTocTitle = () => {
    if (toc.title || toc.entries.length) return;
    for (let k = items.length - 1, n = 0; k >= 0 && n < 4; k--) {
      const x = items[k];
      if (x.kind === 'break') continue;
      n++;
      if (x.kind !== 'p' && x.kind !== 'head') break;
      const t = noRefs(x.kind === 'head' ? x.text : textOfSegs(x.segs)).replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();
      if (t.length <= 40 && TOC_TITLE.test(t)) {
        toc.title = t;
        items.splice(k, 1);
        // «فهرس» مكرراً (في مربع نصٍّ وفي فقرة): يُرفع الآخر أيضاً
        const y = items[k - 1];
        if (y && (y.kind === 'p' || y.kind === 'head') && noRefs(y.kind === 'head' ? y.text : textOfSegs(y.segs)).replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim() === t) items.splice(k - 1, 1);
      }
      break;
    }
  };
  for (const blk of blocksOf(body)) {
    // قسمٌ انتهى بالفقرة السابقة: يبدأ ما بعده
    if (pendingSect) {
      pendingSect = false;
      secIdx = Math.min(secIdx + 1, sections.length - 1);
      secStart[secIdx] = textSoFar;
    }
    applyGap();
    if (blk.type === 'tbl') flushBlank();
    if (blk.type === 'tbl') {
      const T = readTable(blk.xml, styles, opt.keepFormat ? numOf : null);
      if (!T.rows.length) continue;
      const maxCols = Math.max(...T.rows.map((r) => r.cells.reduce((a, c) => a + c.span, 0)));
      const lines = tableLines(T.rows);
      const verseRows = lines.filter((l) => l.verse).length;
      // فهرس مكتوب في جدول: عمود للعنوان وعمود لرقم الصفحة
      const pairs = T.rows.map((r) => r.cells.filter((c) => c.text)).filter((cs) => cs.length === 2 && cs.some((c) => /^[0-9٠-٩]{1,4}$/.test(noRefs(c.text))) && cs.some((c) => AR_LETTERS.test(c.text)));
      const lastText = [...items].reverse().find((x) => x.kind === 'p' || x.kind === 'head');
      const afterTitle = lastText && TOC_TITLE.test(noRefs(textOfSegs(lastText.segs || [{ t: lastText.text || '' }])).trim());
      if (pairs.length >= 3 && pairs.length >= T.rows.length * 0.7 && afterTitle) {
        {
          toc.title = noRefs(textOfSegs(lastText.segs || [{ t: lastText.text || '' }])).trim();
          items.splice(items.indexOf(lastText), 1);
        }
        if (toc.at < 0) (toc.at = textSoFar), (toc.sec = secIdx);
        toc.kind = toc.kind || 'table';
        for (const cs of pairs) toc.entries.push({ title: cleanText(noRefs(cs.find((c) => AR_LETTERS.test(c.text)).text)), level: 1 });
        continue;
      }
      const cellImages = async () => {
        for (const r of T.rows) for (const c of r.cells) for (const p of c.paras) if (p.images.length) await pushImages(p, false);
      };
      // جدول شعرٍ بأرقام (ولو بحدود): خانة العدّ، والشطران، ورقم البيت — أبياتٌ بأرقامها
      const numRows = lines.filter((l) => l.verse && l.num).length;
      const numbered = numRows >= 2 && numRows >= T.rows.length * 0.6;
      // جدولٌ بحدود وأبياته شعرٌ حقاً (شطران من كلماتٍ بلا أرقام): أبيات تُحرَّر كغيرها، لا جدول
      const strong = (h) => { const t = noRefs(h).trim(); return t.length >= 8 && t.split(/\s+/).length >= 2 && !/[0-9٠-٩]/.test(t) && AR_LETTERS.test(t); };
      const strongRows = lines.filter((l) => l.verse && l.verse.every(strong)).length;
      const poemTbl = strongRows >= 2 && strongRows >= T.rows.length * 0.6;
      if ((!T.bordered && verseRows > 0 && verseRows >= T.rows.length * 0.5) || numbered || poemTbl) {
        // جدول شعر بلا حدود: أبيات
        stats.tables++;
        for (const l of lines) {
          if (l.hdr && numbered) continue;
          if (l.verse) items.push({ kind: 'verse', parts: l.verse, refs: l.refs });
          else for (const part of l.text.split('\n')) if (cleanText(part.replace(/\t+/g, ' '))) items.push({ kind: 'p', segs: [{ t: cleanText(part.replace(/\t+/g, ' ')), b: false, u: false, c: '' }], refs: l.refs, cand: {}, side: 'r' });
        }
        continue;
      }
      // خانة واحدة بحدود (إطار حول نص: هكذا يُكتب المتن في أعلى الصفحة في بعض الشروح): فقراته في إطار
      const oneCell = T.rows.length === 1 && T.rows[0].cells.length === 1;
      if ((!T.bordered && maxCols <= 1) || oneCell) {
        // إطار نصي: فقراته
        const frame = T.bordered || !!T.rows[0].cells[0].bg;
        for (const r of T.rows)
          for (const c of r.cells)
            for (const p of c.paras)
              for (const line of linesOfSegs(p.segs)) {
                items.push({ kind: 'p', segs: line, refs: p.refs, cand: {}, side: sideOf(p.jc, p.bidi ?? false), bold: p.bold, color: p.color, font: p.font, ...(frame ? { frame: true } : {}) });
                textSoFar += noRefs(textOfSegs(line)).length;
              }
        await cellImages();
        continue;
      }
      // جدول حقيقي: يبقى جدولاً
      stats.tables++;
      const total = T.grid.reduce((a, x) => a + x, 0);
      const span = new Map(); // موضع العمود ← خلية بدء الدمج الرأسي
      const rows = T.rows.map((r) => {
        let col = 0;
        const cells = r.cells.map((c) => {
          const cell = {
            lines: c.paras.map((p) => ({ t: p.text.replace(/[\t\n]+/g, ' '), refs: p.refs })).filter((l) => cleanText(noRefs(l.t)) || l.refs.length),
            b: c.paras.some((p) => p.chars) && c.paras.every((p) => !p.chars || p.bold),
            c: c.color || '',
            f: c.font || '',
            j: /^(both|distribute|lowKashida|mediumKashida|highKashida|thaiDistribute)$/.test(c.jc || '') ? 1 : 0,
            al: (() => {
              const p = c.paras.find((x) => x.chars);
              const s = p ? sideOf(p.jc, p.bidi ?? T.rtl) : '';
              return s === 'c' || s === 'l' ? s : '';
            })(),
            span: c.span,
            bg: c.bg,
          };
          if (c.vm === 'c' && span.get(col)) {
            span.get(col).rs = (span.get(col).rs || 1) + 1;
            cell.skip = true;
          } else if (c.vm === 'r') span.set(col, cell);
          else span.delete(col);
          col += c.span;
          return cell;
        });
        return { hdr: r.hdr, cells };
      });
      items.push({ kind: 'tbl', rows, cols: total && T.grid.length === maxCols ? T.grid.map((x) => +((x / total) * 100).toFixed(2)) : [], rtl: T.rtl, borders: T.bordered, chars: T.rows.reduce((a, r) => a + r.cells.reduce((x, c) => x + c.text.length, 0), 0) });
      textSoFar += 40;
      await cellImages();
      continue;
    }
    if (!blk.xml) {
      gapTw += 340; // فقرة فارغة
      blankRun++;
      continue;
    }
    const p = parsePara(blk.xml, styles);
    if (/<w:sectPr\b/.test(blk.xml)) pendingSect = true;
    // فقرةٌ لا تُرى (ارتفاع سطرها نقطة): لا سطر فارغ ولا فراغ، ويبقى ما فيها من فاصل صفحة أو قسم
    if (p.tiny && !(p.text || '').trim() && !p.images.length && !p.tbx.length && !p.border && !p.hr) {
      if (p.breakBefore || p.breakAfter) {
        flushBlank();
        pushBreak(false);
      }
      continue;
    }
    if (!(p.text || '').trim() && !p.images.length && !p.border && !p.hr && !p.tbx.length && !p.breakBefore && !p.breakAfter) blankRun++;
    else flushBlank();
    // حقل الفهرس الآلي (TOC): فقراته بين بدايته ونهايته
    let inToc = tocDepth >= 0;
    for (const f of p.fld) {
      if (f === 'begin') fldDepth++;
      else {
        fldDepth = Math.max(0, fldDepth - 1);
        if (tocDepth >= 0 && fldDepth < tocDepth) tocDepth = -1;
      }
    }
    if (p.tocField && tocDepth < 0) {
      takeTocTitle();
      tocDepth = Math.max(1, fldDepth);
      inToc = true;
      if (fldDepth < 1) tocDepth = -1; // بدأ وانتهى في الفقرة نفسها
    }
    const raw = p.text;
    const flat = cleanText(raw.replace(/[\t\n]+/g, ' '));
    const plain = noRefs(flat).trim();
    // فقرة أُغلق فيها حقل الفهرس وليست من أسطره (لا رقم صفحة فيها ولا نمط فهرس): نص عادي
    const tocClosed = inToc && tocDepth < 0 && !p.tocField;
    if (p.style.toc || (inToc && !(tocClosed && !p.pageref))) {
      takeTocTitle();
      if (toc.at < 0) (toc.at = textSoFar), (toc.sec = secIdx);
      toc.kind = toc.kind || 'field';
      if (p.style.tocTitle || (TOC_TITLE.test(plain) && !toc.entries.length)) toc.title = toc.title || plain;
      else if (plain) {
        const e = tocEntryOf(raw, p.style.tocLevel || 1);
        if (e) toc.entries.push(e);
      }
      continue;
    }
    // سطر فهرس بقي بعد فكّ حقله (فيه رقم صفحة عنوانه أو رابطه): من الفهرس القديم
    if (p.pageref && plain && plain.length <= 200 && /[0-9٠-٩]\s*$/.test(plain) && !p.images.length) {
      if (toc.at < 0) (toc.at = textSoFar), (toc.sec = secIdx);
      toc.kind = toc.kind || 'field';
      // عنوانه قبله («المحتويات»): يُرفع معه
      const prevT = items[items.length - 1];
      if (prevT && (prevT.kind === 'p' || prevT.kind === 'head')) {
        const tt = noRefs(prevT.kind === 'head' ? prevT.text : textOfSegs(prevT.segs)).replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();
        if (tt.length <= 40 && TOC_TITLE.test(tt)) {
          toc.title = toc.title || tt;
          items.pop();
        }
      }
      const e = tocEntryOf(raw, p.style.tocLevel || 0);
      if (e) toc.entries.push(e);
      continue;
    }
    if (p.breakBefore) pushBreak(false);
    else if (p.soft) pushBreak(true);
    // سطر رقم الصفحة (ملف منقول صفحةً صفحة): نهاية صفحة
    if (plain.length <= 40 && PAGE_MARK.test(plain) && !p.images.length) {
      pageMarks++;
      pushBreak(false);
      continue;
    }
    const isSepText = SEP_DASH.test(plain) || p.hr;
    // فقرة ليس فيها إلا إحالة حاشية: تُلحق بما بعدها
    if (!plain && p.refs.length) items.push({ kind: 'refs', refs: p.refs });
    gapTw += p.spaceBefore;
    if (!plain && !p.images.length) {
      // فقرة فارغة بحدّ سفلي: خط
      if (p.border === 'dash' || p.hr) items.push({ kind: 'sep' });
      else if (p.border === 'under') items.push({ kind: 'nsep' });
      else if (p.border === 'orn') items.push({ kind: 'hr' });
      else gapTw += 340; // سطر فارغ
      // إطار نص وحده (بلا صورة): فقراته نص
      for (const t of p.tbx) for (const line of t.split('\n')) if (line.trim()) items.push({ kind: 'p', segs: [{ t: cleanText(line), b: false, u: false, c: '' }], refs: [], cand: {}, side: 'c', box: true, ...(t.length >= 40 ? { frame: true } : {}) });
      if (p.breakAfter) pushBreak(false);
      continue;
    }
    // «* * *» وحده: زخرفة نهاية فصل أو باب
    if (plain && !p.images.length && /^[\s*✽❋✱⁕※•·٭✲✳❉❈⋆✦✧]+$/.test(plain) && (plain.match(/\S/g) || []).length >= 3) {
      items.push({ kind: 'hr' });
      if (p.breakAfter) pushBreak(false);
      continue;
    }
    // «شرح» وحده في فقرته (بلا شيء، أو بين قوسين أو علامتين): فاصلٌ ما قبله متن وما بعده شرحه
    if (plain && !p.images.length && isSharhLabel(plain)) {
      items.push({ kind: 'sep', label: true });
      if (p.breakAfter) pushBreak(false);
      continue;
    }
    if (isSepText && !p.images.length) {
      items.push({ kind: 'sep', ...(plain.length >= 12 ? { wl: plain } : {}) });
      if (p.breakAfter) pushBreak(false);
      continue;
    }
    if (SEP_UNDER.test(plain) && !p.images.length) {
      items.push({ kind: 'nsep', ...(plain.length >= 12 ? { wl: plain } : {}) });
      if (p.breakAfter) pushBreak(false);
      continue;
    }
    const side = sideOf(p.jc, p.bidi ?? false);
    if (plain) {
      const first = items.filter((x) => x.kind !== 'break').length < 12;
      const prevIt = items[items.length - 1];
      // شرح الصورة: فقرة بنمط «تسمية توضيحية»، أو تبدأ بـ«شكل (١)»، أو سطر قصير متوسط غير عريض بعد الصورة مباشرة
      const capLike = prevIt && prevIt.kind === 'img' && !p.images.length && !p.breakBefore && (p.outline === null || p.capStyle) && (p.capStyle ? plain.length <= 300 : (CAP_WORD.test(plain) && plain.length <= 220) || (side === 'c' && !p.bold && !prevIt.cap && textSoFar >= 300 && plain.length <= 160 && !HEAD_1.test(plain) && !HEAD_2.test(plain)));
      if (capLike) {
        prevIt.cap = [prevIt.cap, plain].filter(Boolean).join('\n');
      } else if ((p.style.title || p.style.subtitle) && first) {
        if (p.style.title && !docTitle) docTitle = plain;
        items.push({ kind: 'p', segs: [{ t: flat, b: false, u: false, c: '' }], refs: p.refs, cand: {}, side });
      } else if (p.outline !== null && p.outline >= 0 && p.outline <= 8 && plain.length <= 200) {
        styledHeads++;
        items.push({ kind: 'head', level: Math.min(p.outline + 1, 4), text: flat, refs: p.refs, side, jcDirect: p.jcDirect, styled: true, hc: p.color || (p.chars ? '' : p.markColor), hf: p.font, hb: p.bold, hcs: p.chars });
      } else {
        const v = tabVerse(raw.replace(/\n/g, ' '));
        if (v) items.push({ kind: 'verse', parts: v, refs: p.refs });
        else {
          // قائمة مرقّمة آلياً: الرقم ليس في نص الملف، فيُعاد حسابه
          let prefix = '';
          if (p.numId && p.numId !== '0') {
            const fmt = (numbering.get(p.numId) || new Map()).get(p.ilvl) || 'decimal';
            if (fmt === 'bullet' || fmt === 'none') prefix = fmt === 'bullet' ? '- ' : '';
            else {
              const key = p.numId + ':' + p.ilvl;
              const n = (counters.get(key) || 0) + 1;
              counters.set(key, n);
              for (const k of counters.keys()) if (k.startsWith(p.numId + ':') && +k.split(':')[1] > p.ilvl) counters.delete(k);
              prefix = ar(n) + '- ';
            }
          }
          const lines = linesOfSegs(p.segs);
          lines.forEach((segs, i) => {
            // سطر خط داخل الفقرة (بعد فاصل سطر): فاصل
            const lt = lines.length > 1 ? noRefs(textOfSegs(segs)).trim() : '';
            if (lt && SEP_UNDER.test(lt)) return void items.push({ kind: 'nsep' });
            if (lt && SEP_DASH.test(lt)) return void items.push({ kind: 'sep' });
            if (i === 0 && prefix) segs.unshift({ t: prefix, b: false, u: false, c: '' });
            items.push({
              kind: 'p',
              segs,
              raw: lines.length === 1 ? raw : '',
              // «الصدر ... العجز» في فقرة: بيتٌ إن جاورته أبيات (ينظر فيه بعد قراءة الملف)
              ...(lines.length === 1 && !prefix ? dotVerse(noRefs(raw)) : {}),
              refs: p.refs,
              cand: i === 0 && lines.length === 1 ? { bold: p.bold, center: side === 'c' } : {},
              side,
              indent: p.indent,
              bold: p.bold,
              color: p.color,
              font: p.font,
              ...(p.frame ? { frame: true } : {}),
              ...(p.line ? { lr: p.lineRule, ln: p.line } : {}),
            });
          });
        }
      }
      textSoFar += plain.length;
    }
    if (p.images.length) await pushImages(p, !!plain);
    else for (const t of p.tbx) for (const line of t.split('\n')) if (line.trim()) items.push({ kind: 'p', segs: [{ t: cleanText(line), b: false, u: false, c: '' }], refs: [], cand: {}, side: 'c', box: true, ...(t.length >= 40 ? { frame: true } : {}) });
    // «---» يحوّله Word حدّاً سفلياً على الفقرة التي قبله
    if (plain && p.border === 'dash') items.push({ kind: 'sep' });
    else if (plain && p.border === 'under') items.push({ kind: 'nsep' });
    if (p.breakAfter) pushBreak(false);
    // انكسرت الصفحة في وسط هذه الفقرة (كما صفّها Word): الصفحة التالية تبدأ بعدها
    else if (p.softMid) pushBreak(true);
  }
  flushBlank();
  applyGap();
  // خطوطٌ متتالية («______» أو «------» سطراً بعد سطر): سطورٌ للكتابة لا فواصل
  for (let i = 0; i < items.length; i++) {
    if (!items[i].wl) continue;
    let j = i;
    while (j < items.length && items[j].wl) j++;
    // (تُكتب خطاً متصلاً «─»: فالشرطات السفلية والشرطات فواصل حواشٍ ومتونٍ عند المحلّل)
    if (j - i >= 2) for (let k = i; k < j; k++) items[k] = { kind: 'p', segs: [{ t: '─'.repeat(40), b: false, u: false, c: '' }], refs: [], cand: {}, side: 'r', wline: true };
    else delete items[i].wl;
    i = j - 1;
  }
  // فقراتٌ متتالية بشكل «الصدر ... العجز»: أبيات (والسطر الواحد منها بين النثر يبقى نثراً)
  {
    const isV = (x) => x && (x.kind === 'verse' || x.dv);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.dv || !(isV(items[i - 1]) || isV(items[i + 1]))) continue;
      items[i] = { kind: 'verse', parts: it.dv, refs: it.refs, ...(it.gap ? { gap: it.gap } : {}) };
    }
    for (const it of items) delete it.dv;
  }
  const plainOf = (it) => noRefs(it.kind === 'head' ? it.text : it.kind === 'verse' ? it.parts.join(' ') : it.segs ? textOfSegs(it.segs) : '').trim();
  const totalChars = Math.max(1, textSoFar);

  /* ---------------------------------------------------------- ١ب) صفحات الصور أول الملف (عنوان الكتاب، شعار الدار) */
  // صفحة قائمة بنفسها (بين فاصلَي صفحة) فيها صور وقليل نص، قبل أن يبدأ نص الكتاب: تبقى صفحةً بتنسيقها
  {
    let i = 0;
    let before = 0;
    while (i < items.length && before < 300) {
      let j = i;
      while (j < items.length && items[j].kind !== 'break') j++;
      const page = items.slice(i, j);
      const imgs = page.filter((x) => x.kind === 'img');
      const txt = page.filter((x) => x.kind === 'p');
      const chars = txt.reduce((a, x) => a + plainOf(x).length, 0);
      const pure = page.every((x) => x.kind === 'img' || x.kind === 'p');
      if (imgs.length && pure && chars <= 220 && txt.length <= 6 && j < items.length) {
        const al = (x) => (x.side === 'l' ? 'l' : x.side === 'r' && x.kind === 'img' ? 'r' : x.side === 'c' || x.kind === 'img' ? 'c' : 'r');
        const parts = page.map((x) => {
          const gap = +Math.min(0.6, (x.gap || 0) / pgH).toFixed(4);
          if (x.kind === 'img') return { k: 'img', src: x.data.src, w: x.data.w, h: x.data.h, wp: x.wPage, al: al(x), gap, ...(x.abs ? { abs: x.abs } : {}), ...(x.cap ? { cap: x.cap } : {}) };
          return { k: 'text', t: plainOf(x), al: al(x), gap, ...(x.bold ? { b: 1 } : {}) };
        });
        items.splice(i, j - i, { kind: 'pagefig', parts });
        i += 2;
        continue;
      }
      before += page.reduce((a, x) => a + (x.kind === 'tbl' ? x.chars : plainOf(x).length), 0);
      i = j + 1;
    }
  }

  /* ---------------------------------------------------------- ٢) الفهرس المكتوب في الملف (القديم) */
  // عنوانه «الفهرس» أو «فهرس الموضوعات» أو أخواتهما، وقد يليه سطر «الموضوع … الصفحة»، ثم أسطره: «عنوان ..... رقم»،
  // أو «عنوان رقم»، أو العنوان في سطر ورقمه في سطر، أو جدول. يُرفع كله من النص (أرقامه لم تعد صحيحة)،
  // وعناوين فهرس الموضوعات تبقى ليُبنى بها «فهرس الملف كما هو».
  let tocsRemoved = toc.entries.length ? 1 : 0;
  {
    const NUM = '[0-9٠-٩]{1,4}';
    const HEADW = /^(?:ال)?(?:موضوع|موضوعات|عنوان|عناوين|صفحة|صفحات|رقم|ص|م|المحتوى|محتوى|بيان)$/;
    const isHeadRow = (t) => {
      const w = t.replace(/[^ء-ي\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
      return w.length >= 1 && w.length <= 4 && w.every((x) => HEADW.test(x)) && /صفح|موضوع|عنوان/.test(t);
    };
    const STRONG = new RegExp(`^(.{2,160}?)(?:\\s*[.…·_]{2,}\\s*|\\s*\\t+\\s*|\\s{3,})(${NUM})$`);
    const LEAD = new RegExp(`^(${NUM})(?:\\s*[.…·_]{2,}\\s*|\\s*\\t+\\s*|\\s{3,})(.{2,160})$`);
    const WEAK = new RegExp(`^([^.،؛:]{2,110}?)\\s+(${NUM})$`);
    const ONLYNUM = new RegExp(`^${NUM}$`);
    const titleOf = (t) => cleanText(t.replace(/[.…·_\s]+$/, ''));
    // (علامات الاتجاه الخفية وأقواس رقم الصفحة و«ص» قبله لا تمنع معرفة السطر)
    const textOf = (x) =>
      noRefs(x.raw || (x.kind === 'head' ? x.text : textOfSegs(x.segs)))
        .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/\n/g, ' ')
        .trim()
        .replace(/(?:ص\s*[:：]?\s*)?[(\[]\s*([0-9٠-٩]{1,4})\s*[)\]]$/, '$1')
        .replace(/(\s)ص\s*[:：]?\s*([0-9٠-٩]{1,4})$/, '$1$2');
    // عنوان الفهرس: بلا تشكيل ولا تطويل ولا زخرفة حوله
    const tocTitleOf = (t) => t.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/^[^\u0621-\u064A]+|[^\u0621-\u064A:：]+$/g, '').replace(/\s+/g, ' ').trim();
    /** سطر من أسطر الفهرس؟ → { title, num } (num فارغ: عنوان بلا رقم) أو null */
    const entryOf = (x) => {
      if (x.kind !== 'p' && x.kind !== 'head') return null;
      const t = textOf(x);
      let m = STRONG.exec(t);
      if (m) return { title: titleOf(m[1]), num: m[2], strong: true };
      m = LEAD.exec(t);
      if (m) return { title: titleOf(m[2]), num: m[1], strong: true };
      m = WEAK.exec(t);
      if (m && AR_LETTERS.test(m[1])) return { title: titleOf(m[1]), num: m[2] };
      return null;
    };
    const SUBJECT = /موضوع|محتو|^(?:ال)?فهرس(?:ت)?\s*[:：]?$|فهرس الكتاب|الفهرس العام/;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== 'p' && it.kind !== 'head') continue;
      const title = tocTitleOf(plainOf(it));
      if (title.length > 40 || !TOC_TITLE.test(title)) continue;
      let before = 0;
      for (let k = 0; k < i; k++) before += plainOf(items[k]).length;
      // فهرس في آخر الكتاب: يمتد إلى آخره، وأسطره التي بلا رقم منه
      const tail = before >= totalChars * 0.6;
      // من بعد العنوان: أسطر الفهرس حتى أول ما ليس منه
      const found = [];
      let end = i + 1; // أول عنصر بعد الفهرس
      let pend = []; // عناوين قصيرة بلا رقم: تُحسب من الفهرس إن جاء بعدها سطر منه
      let real = 0;
      let headRow = false;
      let k = i + 1;
      for (; k < items.length; k++) {
        const x = items[k];
        if (x.kind === 'break' || x.kind === 'refs' || x.kind === 'hr' || x.kind === 'sep' || x.kind === 'nsep') continue;
        if (x.kind === 'tbl') {
          // فهرس في جدول: خلية للعنوان وخلية لرقم الصفحة
          const rows = x.rows.map((r) => r.cells.map((c) => cleanText(c.lines.map((l) => noRefs(l.t)).join(' '))).filter(Boolean));
          const pairs = rows.filter((cs) => cs.length >= 2 && cs.some((c) => ONLYNUM.test(c)) && cs.some((c) => AR_LETTERS.test(c)));
          if (pairs.length < Math.max(2, rows.filter((cs) => !isHeadRow(cs.join(' '))).length * 0.6)) break;
          for (const e of pend) found.push(e);
          pend = [];
          for (const cs of pairs) found.push({ title: cs.filter((c) => AR_LETTERS.test(c)).sort((a, b) => b.length - a.length)[0], num: cs.find((c) => ONLYNUM.test(c)), indent: 0 });
          real += pairs.length;
          end = k + 1;
          continue;
        }
        if (x.kind !== 'p' && x.kind !== 'head') break;
        const t = textOf(x);
        if (isHeadRow(t)) {
          headRow = true;
          end = k + 1;
          continue;
        }
        if (ONLYNUM.test(t)) {
          // رقم الصفحة في سطر وحده بعد عنوانه
          if (pend.length) {
            pend[pend.length - 1].num = t;
            for (const e of pend) found.push(e);
            pend = [];
            real++;
            end = k + 1;
            continue;
          }
          if (found.length) {
            end = k + 1;
            continue;
          }
          break;
        }
        const e = entryOf(x);
        // (سطر ضعيف الدلالة «عنوان رقم» لا يُثبت ما قبله إن كثر)
        if (e && (e.strong || pend.length <= 2 || tail || headRow)) {
          for (const q of pend) found.push(q);
          pend = [];
          found.push({ ...e, indent: x.indent || 0, styled: x.kind === 'head' ? x.level : 0 });
          real++;
          end = k + 1;
          continue;
        }
        // سطر قصير بلا رقم (باب في الفهرس لا رقم له، أو عنوان رقمه في السطر التالي)
        if (t.length <= 110 && !/[.؟!]$/.test(t) && pend.length < (tail || headRow ? 40 : 8)) {
          pend.push({ title: titleOf(t), num: '', indent: x.indent || 0, styled: x.kind === 'head' ? x.level : 0, at: k });
          continue;
        }
        break;
      }
      // فهرس آخر الكتاب بلغ آخره: ما بقي من أسطر قصيرة بلا رقم منه
      // («فهرس» في آخر الكتاب وتحته أسطرٌ قصيرة إلى آخره: هو الفهرس، ولو لم تكن فيه أرقام صفحات)
      let bare = false;
      if (tail && k >= items.length && pend.length && (real >= 2 || headRow || pend.length >= 2)) {
        bare = !real && !headRow;
        for (const q of pend) found.push(q);
        real += pend.length;
        end = items.length;
      }
      if (real < 3 && !(bare && real >= 2)) continue;
      // المستوى: من نمط العنوان، وإلا من الإزاحة (أقلها مستوى أول)
      const ind = [...new Set(found.map((f) => f.indent))].sort((a, b) => a - b);
      const entries = found.filter((f) => f.title).map((f) => ({ title: f.title, level: Math.min(f.styled || ind.indexOf(f.indent) + 1, 4) }));
      // أول فهرس موضوعات يُبنى به فهرس الملف؛ وما سواه (فهارس الآيات والأعلام…) يُرفع فقط
      if (!toc.entries.length && (SUBJECT.test(title) || !/آيات|أحاديث|حديث|أعلام|أشعار|قوافي|مصادر|مراجع|أماكن|بلدان|كتب/.test(title))) {
        toc.entries = entries;
        toc.title = title;
        toc.kind = 'manual';
        toc.at = before;
      }
      tocsRemoved++;
      items.splice(i, end - i);
      i--;
    }
    // بلا عنوان: ستة أسطر متتالية «عنوان ..... رقم» بنقاط متصلة، يوجد نصف عناوينها على الأقل في نص الكتاب
    if (!toc.entries.length) {
      for (let i = 0; i < items.length; i++) {
        if (!(items[i].kind === 'p' && STRONG.test(textOf(items[i])))) continue;
        let j = i;
        const found = [];
        while (j < items.length) {
          const x = items[j];
          if (x.kind === 'break') {
            j++;
            continue;
          }
          const m = x.kind === 'p' ? STRONG.exec(textOf(x)) : null;
          if (!m || !/[.…·_]{3,}/.test(textOf(x))) break;
          found.push({ title: titleOf(m[1]), indent: x.indent || 0 });
          j++;
        }
        if (found.length >= 6) {
          const span = items.slice(i, j);
          const body = new Set(items.filter((x) => !span.includes(x) && (x.kind === 'p' || x.kind === 'head')).map((x) => norm(plainOf(x))));
          if (found.filter((f) => body.has(norm(f.title))).length >= found.length * 0.5) {
            const ind = [...new Set(found.map((f) => f.indent))].sort((a, b) => a - b);
            toc.entries = found.map((f) => ({ title: f.title, level: Math.min(ind.indexOf(f.indent) + 1, 4) }));
            toc.kind = 'manual';
            let before = 0;
            for (let k = 0; k < i; k++) before += plainOf(items[k]).length;
            toc.at = before;
            tocsRemoved++;
            items.splice(i, j - i);
            break;
          }
        }
        i = Math.max(i, j - 1);
      }
    }
  }
  const hasToc = toc.entries.length >= 2;

  /* ---------------------------------------------------------- ٣) العناوين */
  // ملف بلا أنماط عناوين: يُخمَّن العنوان من السطر العريض القصير (المتوسط، أو المبدوء بكلمة باب/فصل…)
  if (styledHeads < 2) {
    for (const it of items) {
      if (it.kind !== 'p' || !it.cand || !it.cand.bold || it.frame) continue;
      const t = plainOf(it);
      if (t.length < 2 || t.length > 80 || NOT_HEAD.test(t) || /[.،؛]$/.test(t)) continue;
      const level = HEAD_1.test(t) ? 1 : HEAD_2.test(t) ? 2 : HEAD_3.test(t) ? 3 : it.cand.center ? 2 : 0;
      if (!level) continue;
      it.kind = 'head';
      it.level = level;
      it.text = textOfSegs(it.segs);
      stats.guessedHeadings++;
    }
  }
  // فهرس الملف كما هو: عناوين الكتاب هي عناوين فهرسه (بمستوياتها)، وما لم يُذكر فيه يبقى عنواناً خارج الفهرس
  let fileToc = false;
  let tocMatched = 0;
  if (hasToc && opt.toc === 'file') {
    const idx = new Map();
    items.forEach((it, i) => {
      if (it.kind !== 'head' && it.kind !== 'p') return;
      const t = plainOf(it);
      if (!t || t.length > 200) return;
      const k = norm(t);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(i);
    });
    let from = 0;
    const hit = new Map();
    for (const e of toc.entries) {
      const list = idx.get(norm(e.title)) || [];
      const i = list.find((x) => x >= from && !hit.has(x)) ?? list.find((x) => !hit.has(x));
      if (i === undefined) continue;
      hit.set(i, e);
      from = i + 1;
    }
    tocMatched = hit.size;
    if (tocMatched >= Math.max(2, Math.ceil(toc.entries.length * 0.5))) {
      fileToc = true;
      items.forEach((it, i) => {
        const e = hit.get(i);
        if (e) {
          if (it.kind === 'p') it.text = textOfSegs(it.segs);
          it.kind = 'head';
          it.level = (it.styled && toc.kind === 'manual') || !e.level ? (it.styled ? it.level : 1) : Math.min(e.level, 4);
          it.nt = false;
        } else if (it.kind === 'head') it.nt = true;
      });
    }
  }

  /* ---------------------------------------------------------- ٤) الحواشي المكتوبة يدوياً تحت خط «____» */
  // تُحوَّل حواشيَ حقيقية: رقمها في النص «(١)» يصير إحالة، وأسطرها تُرفع من المتن (ثم تُرقَّم من جديد في صفحاتها)
  {
    const hasBreaks = items.some((x) => x.kind === 'break');
    let regionStart = 0;
    let uid = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'break') {
        regionStart = i + 1;
        continue;
      }
      if (it.kind !== 'nsep') continue;
      const found = [];
      const orphan = [];
      let cur = null;
      let j = i + 1;
      for (; j < items.length; j++) {
        const x = items[j];
        if (x.kind !== 'p') break;
        const t = plainOf(x);
        const m = NOTE_LINE.exec(t);
        if (m) {
          cur = { num: toLatin(m[1] || m[2]), lines: [t.slice(m[0].length)] };
          found.push(cur);
        } else if (cur && hasBreaks) cur.lines.push(t);
        else break;
      }
      // أسطر «١- …» بعد خط قد تكون قائمة لا حواشي: يلزم أن يوجد رقم نصفها على الأقل في النص قبل الخط
      const region = items.slice(regionStart, i).map((x) => (x.kind === 'p' || x.kind === 'head' ? noRefs(x.kind === 'head' ? x.text : textOfSegs(x.segs)) : '')).join('\n');
      const refd = found.filter((n) => new RegExp('[(\\[]\\s*(?:' + n.num + '|' + ar(n.num) + ')\\s*[)\\]]').test(region)).length;
      const bracketed = j > i + 1 && /^\s*[(\[]/.test(plainOf(items[i + 1]));
      if (!found.length || (!bracketed && refd < found.length * 0.5)) {
        it.kind = 'hr';
        continue;
      }
      for (const n of found) {
        const id = 't' + ++uid;
        noteLines.typed.set(id, n.lines.filter(Boolean).length ? n.lines.filter(Boolean).map(guardVerse) : ['']);
        const re = new RegExp('\\s*[(\\[]\\s*(?:' + n.num + '|' + ar(n.num) + ')\\s*[)\\]]');
        let done = false;
        for (let k = regionStart; k < i && !done; k++) {
          const x = items[k];
          if (x.kind !== 'p' && x.kind !== 'head') continue;
          if (!x.ownRefs) {
            x.refs = x.refs.slice();
            x.ownRefs = true;
          }
          const put = (s) => {
            const m = re.exec(s);
            if (!m) return null;
            x.refs.push({ kind: 'typed', id });
            return s.slice(0, m.index) + `\u0007${x.refs.length - 1}\u0008` + s.slice(m.index + m[0].length);
          };
          if (x.kind === 'head') {
            const r = put(x.text);
            if (r !== null) {
              x.text = r;
              done = true;
            }
          } else {
            for (const s of x.segs) {
              const r = put(s.t);
              if (r !== null) {
                s.t = r;
                done = true;
                break;
              }
            }
          }
        }
        if (!done) {
          // لا رقم لها في النص: تُلحق بآخر فقرة قبل الخط
          const x = [...items.slice(regionStart, i)].reverse().find((y) => y.kind === 'p');
          if (x) {
            if (!x.ownRefs) {
              x.refs = x.refs.slice();
              x.ownRefs = true;
            }
            x.refs.push({ kind: 'typed', id });
            x.segs.push({ t: `\u0007${x.refs.length - 1}\u0008`, b: false, u: false, c: '' });
          } else orphan.push({ kind: 'typed', id }); // لا فقرة قبل الخط: تُلحق بما بعده
        }
        stats.typedNotes++;
      }
      // حواشي أسفل الصفحة تنتهي بها صفحتها: ما بعدها أول صفحة جديدة (به يُعرف المتن الذي في أول الصفحة)
      const ins = [...(orphan.length ? [{ kind: 'refs', refs: orphan }] : []), ...(j < items.length && items[j].kind !== 'break' ? [{ kind: 'break', soft: true, notesEnd: true }] : [])];
      if (j < items.length && items[j].kind === 'break') items[j].notesEnd = true;
      items.splice(i, j - i, ...ins);
      i += ins.length;
      regionStart = i;
      i--;
    }
  }

  /* ---------------------------------------------------------- ٥) المتن والشرح */
  const paras = items.filter((x) => x.kind === 'p');
  const PAREN = /\(([^()]{3,400})\)/g;
  const parenOk = (inner) => AR_LETTERS.test(inner) && inner.trim().split(/\s+/).length >= 2 && !/^\s*(?:ص|ج|ت|رقم|برقم|رواه|أخرجه|انظر|ينظر|راجع|سورة|الآية|آية|أي|يعني|ت\s|[0-9٠-٩])/.test(inner);
  /** إحصاء فقرات: العريض واللون والأقواس ورموز المتن وكلمتا «المتن:» و«الشرح:» */
  const scan = (list) => {
    const st = { chars: 0, bold: 0, colors: new Map(), fonts: new Map(), fontSegs: new Map(), boldSegs: [], colorSegs: new Map(), parenSegs: 0, parenParas: 0, parenWords: 0, markPairs: 0, matnLabels: 0, sharhLabels: 0, stars: 0, n: list.length };
    for (const it of list) {
      const t = plainOf(it);
      if (MATN_LABEL.test(t)) st.matnLabels++;
      if (SHARH_LABEL.test(t)) st.sharhLabels++;
      if (/^\*\s*(?:قوله|قال)/.test(t)) st.stars++;
      // رمز المتن المضمَّن «ــ»: تطويل ليس بين حرفين (التطويل داخل الكلمة زينة)
      for (const m of t.matchAll(/ـ{2,}/g)) {
        const before = t[m.index - 1] || ' ';
        const after = t[m.index + m[0].length] || ' ';
        if (!(AR_LETTERS.test(before) && AR_LETTERS.test(after))) st.markPairs++;
      }
      let had = false;
      for (const m of t.matchAll(PAREN)) {
        if (!parenOk(m[1])) continue;
        st.parenSegs++;
        st.parenWords += m[1].trim().split(/\s+/).length;
        had = true;
      }
      if (had) st.parenParas++;
      // فقرة كلها عريضة (عنوان فرعي، أو متن في سطره) لا تُحسب مقطعاً عريضاً داخل الكلام
      const whole = it.bold;
      for (const s of it.segs) {
        const n = noRefs(s.t).replace(/\s/g, '').length;
        st.chars += n;
        if (s.b) {
          st.bold += n;
          if (n >= 2 && !whole) st.boldSegs.push(n);
        }
        if (s.c) {
          st.colors.set(s.c, (st.colors.get(s.c) || 0) + n);
          if (n >= 2) st.colorSegs.set(s.c, [...(st.colorSegs.get(s.c) || []), n]);
        }
        if (s.f) {
          st.fonts.set(s.f, (st.fonts.get(s.f) || 0) + n);
          if (n >= 2 && it.font !== s.f) st.fontSegs.set(s.f, [...(st.fontSegs.get(s.f) || []), n]);
        }
      }
    }
    st.chars = Math.max(1, st.chars);
    return st;
  };
  const ALL = scan(paras);
  let allChars = ALL.chars;
  const boldAll = ALL.bold;
  const colorAll = ALL.colors;
  const { matnLabels, sharhLabels, markPairs } = ALL;
  allChars = Math.max(1, allChars);
  // ملف كله عريض، أو كله بلون: ذلك خطه المعتاد لا تمييز فيه
  const baseBold = boldAll >= allChars * 0.7;
  let baseColor = '';
  for (const [c, n] of colorAll) if (n >= allChars * 0.6) baseColor = c;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  // لون المتن: أكثر الألوان (غير المعتاد) نصاً
  let matnColor = '';
  for (const [c, n] of colorAll) if (c !== baseColor && (!matnColor || n > colorAll.get(matnColor))) matnColor = c;
  // خط الكتاب المعتاد (أكثر الخطوط نصاً)، وخط المتن: أكثر ما خالفه (اسماً، أو مقاساً بنقطة فأكثر)
  let baseFont = '';
  for (const [f, n] of ALL.fonts) if (!baseFont || n > ALL.fonts.get(baseFont)) baseFont = f;
  const fontDiff = (f) => {
    if (!f || !baseFont || f === baseFont) return false;
    const [fa, sa] = f.split('|');
    const [fb, sb] = baseFont.split('|');
    return fa !== fb || Math.abs((+sa || 0) - (+sb || 0)) >= 2;
  };
  const base = cleanText(String(o.fileName || '').replace(/\.docx$/i, '').replace(/[_]+/g, ' '));
  const nameHint = /شرح|حاشية|تعليق|تقرير/.test(base + ' ' + docTitle);
  const sepCount = items.filter((x) => x.kind === 'sep').length;
  const labelSeps = items.filter((x) => x.kind === 'sep' && x.label).length;
  const hardPages = (() => {
    // صفحات يفصلها فاصل صفحة حقيقي: كم خطاً في كل صفحة؟
    const pages = [0];
    for (const x of items) {
      if (x.kind === 'break' && (!x.soft || x.notesEnd)) pages.push(0);
      else if (x.kind === 'sep') pages[pages.length - 1]++;
    }
    return pages;
  })();
  let frameGroups = 0;
  let frameChars = 0;
  items.forEach((x, i) => {
    if (x.kind !== 'p' || !x.frame) return;
    frameChars += plainOf(x).length;
    const prev = items[i - 1];
    if (!(prev && prev.kind === 'p' && prev.frame)) frameGroups++;
  });
  const pageLayout = sepCount >= 3 && hardPages.length >= 3 && hardPages.filter((n) => n === 1).length >= sepCount * 0.7 && !hardPages.some((n) => n > 2);
  const detect = () => {
    if (sepCount >= 2 || (sepCount === 1 && totalChars < 12000 && markPairs < 6)) {
      if (pageLayout) return 'sep';
      // «شرح» بين المتن وشرحه (لا فاصل بين الشرح والمتن التالي): ليس تناوباً
      if (labelSeps * 2 >= sepCount) return 'sep';
      // تناوب (متن --- شرح --- متن…): المقاطع الزوجية قصيرة والفردية طويلة
      const segLen = [0];
      let headInside = false;
      for (const x of items) {
        if (x.kind === 'sep') segLen.push(0);
        else if (x.kind === 'head') headInside = true;
        else segLen[segLen.length - 1] += plainOf(x).length;
      }
      if (!headInside && segLen.length >= 4) {
        const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1] || 0;
        const even = segLen.filter((_, i) => i % 2 === 0 && i < segLen.length - (segLen.length % 2 ? 1 : 0));
        const odd = segLen.filter((_, i) => i % 2 === 1);
        if (med(even) * 2.5 <= med(odd) && Math.max(...even) <= 1500) return 'toggle';
      }
      return 'sep';
    }
    if (matnLabels >= 2 && sharhLabels >= 2) return 'label';
    // المتن في إطار (فقرات بحدود، أو خانة جدول، أو مربع نص) وشرحه بعده
    if (frameGroups >= (nameHint ? 2 : 3) && frameChars <= totalChars * 0.5) return 'box';
    return 'none';
  };
  const detected = detect();
  let mode = opt.matn === 'auto' ? detected : opt.matn;
  // طريقة لا أثر لها في الملف: لا متن مفصولاً
  if ((mode === 'sep' || mode === 'toggle') && !sepCount) mode = 'none';
  if (mode === 'box' && !frameGroups) mode = 'none';

  const isContent = (x) => x.kind === 'p' || x.kind === 'verse' || x.kind === 'img' || x.kind === 'tbl' || x.kind === 'hr';
  const sigOf = (x) => (x.kind === 'p' ? (x.frame ? 'x' : '') + (x.bold && !baseBold ? 'b' : '') + (x.color && x.color !== baseColor ? x.color : '') + (fontDiff(x.font) ? '~' + x.font : '') : '');
  const lenOf = (x) => (x.kind === 'tbl' ? x.chars : plainOf(x).length);
  let units = 0;
  if (mode === 'sep') {
    const sepIdx = [];
    items.forEach((x, i) => x.kind === 'sep' && sepIdx.push(i));
    const first = []; // أول عنصر متن لكل فاصل
    // ما قبل كل خط حتى حدّه (عنوان، فاصل صفحة، الخط السابق)، ومعه: أين تبدأ صفحة الخط كما صفّها Word آخر مرة
    const spans = [];
    {
      let prev = -1;
      for (const si of sepIdx) {
        const span = [];
        let softFrom = -1; // عدد عناصر span التي بعد آخر بداية صفحة
        let j = si - 1;
        for (; j > prev; j--) {
          const x = items[j];
          if (x.kind === 'break' && x.soft && !x.notesEnd) {
            if (softFrom < 0) softFrom = span.length;
            continue;
          }
          if (!isContent(x)) break;
          span.unshift(j);
        }
        // pageTop: ما قبل الخط يبدأ من أول صفحة حقيقية (فاصل صفحة، أو نهاية حواشي الصفحة السابقة، أو أول الملف)
        spans.push({ si, span, bounded: j > prev || prev < 0, softFrom, pageTop: j < 0 || (j > prev && items[j].kind === 'break') });
        prev = si;
      }
    }
    // «المتن في أول الصفحة ثم الخط ثم الشرح»: يُعرف حين يقع أول الصفحة قبل الخط بقليل في أكثر المواضع
    const loose = spans.filter((q) => !q.bounded && q.span.length > 1);
    const near = (q) => q.softFrom > 0 && q.softFrom <= 8 && q.softFrom < q.span.length && q.span.slice(-q.softFrom).reduce((a, k) => a + lenOf(items[k]), 0) <= 1800;
    const softPages = !pageLayout && loose.length >= 2 && loose.filter(near).length >= loose.length * 0.6;
    // أكثر الخطوط يسبقها أول صفحة: الكتاب مصفوف «المتن أول الصفحة ثم الخط ثم الشرح»
    const topped = spans.filter((q) => q.pageTop && q.span.length).length >= Math.max(2, spans.length * 0.6);
    let prevSep = -1;
    // سطر فارغ (لا مسافة الفقرات المعتادة): أكثر من الفراغ الغالب بين الفقرات بنحو سطر
    // (الفراغ الغالب: مسافة ما قبل الفقرة وحدها، فالسطر الفارغ يزيد عليها ٣٤٠ فأكثر)
    const gaps = items.filter((x) => x.kind === 'p').map((x) => x.gap || 0).filter((g) => g < 340).sort((a, b) => a - b);
    const gapBase = gaps.length ? gaps[gaps.length >> 1] : 0;
    const blankBefore = (x) => (x.gap || 0) >= gapBase + 280;
    for (const { si, span, bounded, softFrom, pageTop } of spans) {
      let take = [];
      // قبل «شرح»: المتن من بعد آخر سطر فارغ إليه (والسطر الفارغ بعد «شرح» السابق لا يُعدّ: هو أول الشرح)
      let labelTake = null;
      if (items[si].label) {
        // بعد عنوان (باب، فصل) أو زخرفة «* * *»: كل ما بينه وبين «شرح» متن
        const coll = [];
        let k = si - 1;
        let stop = '';
        for (; k > prevSep; k--) {
          const x = items[k];
          if (x.kind === 'break') {
            if (x.soft && !x.notesEnd) continue;
            stop = 'break';
            break;
          }
          if (x.kind === 'p' || x.kind === 'verse') {
            coll.unshift(k);
            continue;
          }
          stop = x.kind;
          break;
        }
        if ((stop === 'head' || stop === 'hr') && coll.length) labelTake = coll;
        // وإلا (قبله شرح سابق): من بعد آخر سطر فارغ
        else if (span.length) {
          for (let k2 = span.length - 1; k2 >= 1; k2--) {
            if (blankBefore(items[span[k2]])) {
              labelTake = span.slice(k2);
              break;
            }
          }
        }
      }
      if (labelTake) take = labelTake;
      else if (span.length) {
        const chars = span.reduce((a, k) => a + lenOf(items[k]), 0);
        // بين عنوان (أو أول الملف) والخط: كله متن إن كان فقرات قليلة قصيرة؛ وإلا فالمتن آخره فقط (وما قبله كلام للشارح)
        const last = items[span[span.length - 1]];
        const sig = sigOf(last);
        // المتن المميَّز بتنسيقه (عريض أو ملوّن) يُعرف به، وإن سبقه كلام غيره
        const mixed = !!sig && span.some((k) => sigOf(items[k]) !== sig);
        const texty = span.every((k) => items[k].kind === 'p' || items[k].kind === 'verse');
        if (!mixed && bounded && (pageLayout || (span.length <= 4 && chars <= 700 && texty) || (topped && pageTop && span.length <= 8 && chars <= 1800 && texty))) take = span;
        else if (!mixed && softPages && near({ span, softFrom })) take = span.slice(-softFrom); // من أول الصفحة إلى الخط
        else {
          for (let k = span.length - 1; k >= 0; k--) {
            const x = items[span[k]];
            const same = sig ? sigOf(x) === sig : last.kind === 'verse' ? x.kind === 'verse' : k === span.length - 1;
            if (!same) break;
            take.unshift(span[k]);
          }
        }
      }
      units++;
      for (const k of take) {
        items[k].role = 'matn';
        items[k].unit = units;
      }
      first.push(take.length ? take[0] : si);
      prevSep = si;
    }
    sepIdx.forEach((si, n) => {
      const stop = n + 1 < sepIdx.length ? first[n + 1] : items.length;
      for (let k = si + 1; k < stop; k++) {
        const x = items[k];
        // (صفحة بلا متن بعد صفحة متن وشرح: تتمة شرحه)
        if (x.kind === 'break') continue;
        if (!isContent(x)) break;
        x.role = 'sharh';
        x.unit = n + 1;
      }
      items[si].unit = n + 1;
    });
  } else if (mode === 'toggle') {
    let seg = 0;
    let open = true; // عنوان داخل الشرح ينهيه
    const seg0 = [];
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      if (x.kind === 'sep') {
        seg++;
        open = true;
        x.unit = Math.floor((seg - 1) / 2) + 1;
        continue;
      }
      if (x.kind === 'break') continue;
      if (!isContent(x)) {
        if (seg % 2 === 1) open = false;
        continue;
      }
      if (!open) continue;
      x.role = seg % 2 === 0 ? 'matn' : 'sharh';
      x.unit = Math.floor(seg / 2) + 1;
      if (seg === 0) seg0.push(x);
    }
    units = Math.floor(seg / 2) + 1;
    // ما قبل أول فاصل: إن طال (مقدمة) فالمتن آخر فقرة منه فقط
    if (seg0.length > 4 || seg0.reduce((a, x) => a + lenOf(x), 0) > 700) for (const x of seg0.slice(0, -1)) delete x.role, delete x.unit;
  } else if (mode === 'box') {
    // كل إطار متن، وما بعده شرحه حتى الإطار التالي (أو عنوان)
    let state = '';
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      if (x.kind === 'break' || x.kind === 'skip' || x.kind === 'refs') continue;
      if (!isContent(x)) {
        state = '';
        continue;
      }
      if (x.kind === 'p' && x.frame) {
        if (state !== 'matn') units++;
        state = 'matn';
      } else if (state) state = 'sharh';
      if (state) {
        x.role = state;
        x.unit = units;
      }
    }
  } else if (mode === 'label') {
    let state = '';
    const cut = (it, re) => {
      const m = re.exec(textOfSegs(it.segs));
      let n = m ? m[0].length : 0;
      while (n > 0 && it.segs.length) {
        const s = it.segs[0];
        if (s.t.length <= n) {
          n -= s.t.length;
          it.segs.shift();
        } else {
          s.t = s.t.slice(n);
          n = 0;
        }
      }
      if (!it.segs.length || !plainOf(it)) it.kind = 'skip';
    };
    for (const x of items) {
      if (x.kind === 'break' || x.kind === 'skip') continue;
      if (!isContent(x)) {
        state = '';
        continue;
      }
      if (x.kind === 'p') {
        const t = plainOf(x);
        if (MATN_LABEL.test(t)) {
          units++;
          state = 'matn';
          cut(x, MATN_LABEL);
        } else if (SHARH_LABEL.test(t) && state) {
          state = 'sharh';
          cut(x, SHARH_LABEL);
        }
      }
      if (state && x.kind !== 'skip') {
        x.role = state;
        x.unit = units;
      }
    }
  }
  // خطوط لا شرح بعدها (فواصل زخرفية بين الأبواب): ليست فاصل متن وشرح — حين تعرّف الموقع وحده
  if (opt.matn === 'auto' && (mode === 'sep' || mode === 'toggle' || mode === 'box') && units > 0) {
    const withSharh = new Set(items.filter((x) => x.role === 'sharh').map((x) => x.unit)).size;
    if (withSharh < units * 0.5) {
      for (const x of items) {
        delete x.role;
        delete x.unit;
      }
      units = 0;
      mode = 'none';
    }
  }
  const unitMode = units > 0 && (mode === 'sep' || mode === 'toggle' || mode === 'label' || mode === 'box');

  /* ---------------------------------------------------------- ٥ب) المتن المضمَّن داخل الشرح */
  // في غير فقرات المتن: ما كُتب عريضاً أو بلون أو بين قوسين أو بين «ــ ــ» يصير متناً مضمَّناً (بلون المتن وخطه وأقواسه من الإعدادات)
  const SH = scan(paras.filter((x) => x.role !== 'matn'));
  const cs = SH.colorSegs.get(matnColor) || [];
  // خط المتن المضمَّن: أكثر الخطوط المخالفة لخط الكتاب نصاً داخل الشرح
  let matnFont = '';
  for (const [f, list] of SH.fontSegs) {
    if (!fontDiff(f)) continue;
    const n = list.reduce((a, b) => a + b, 0);
    if (!matnFont || n > (SH.fontSegs.get(matnFont) || []).reduce((a, b) => a + b, 0)) matnFont = f;
  }
  const fs = SH.fontSegs.get(matnFont) || [];
  const fsChars = fs.reduce((a, b) => a + b, 0);
  const sharhBook = nameHint || unitMode;
  const detectEmbed = () => {
    if (markPairs >= 6) return 'marks';
    if (matnColor && cs.length >= (unitMode ? 3 : 5) && (SH.colors.get(matnColor) || 0) >= SH.chars * 0.02 && (SH.colors.get(matnColor) || 0) <= SH.chars * 0.6 && avg(cs) >= (unitMode ? 6 : 12)) return 'color';
    if (sharhBook && !baseBold && SH.boldSegs.length >= (unitMode ? 3 : 5) && SH.bold >= SH.chars * 0.02 && SH.bold <= SH.chars * 0.55 && avg(SH.boldSegs) >= (unitMode ? 6 : 9)) return 'bold';
    if (sharhBook && matnFont && fs.length >= (unitMode ? 3 : 5) && fsChars >= SH.chars * 0.02 && fsChars <= SH.chars * 0.55 && avg(fs) >= (unitMode ? 6 : 9)) return 'font';
    if (sharhBook && SH.parenSegs >= 8 && SH.parenParas >= SH.n * 0.3 && SH.parenWords / SH.parenSegs >= 3) return 'paren';
    return 'none';
  };
  const embedDetected = detectEmbed();
  let embed = opt.embed === 'auto' ? embedDetected : opt.embed;
  if (embed === 'color' && !matnColor) embed = 'none';
  if (embed === 'bold' && baseBold) embed = 'none';
  if (embed === 'font' && !matnFont) embed = 'none';

  /* ---------------------------------------------------------- ٦) تنسيق المؤلف */
  // المحاذاة المعتادة في الملف (أكثرها نصاً): ما خالفها إلى الوسط أو اليسار يُحفظ
  const sideChars = { c: 0, l: 0, r: 0, j: 0 };
  for (const it of paras) sideChars[it.side || 'r'] += plainOf(it).length;
  const baseSide = Object.keys(sideChars).sort((a, b) => sideChars[b] - sideChars[a])[0];
  const rtlBase = baseSide === 'r' || baseSide === 'j';
  const alOf = (it) => {
    if (!opt.keepFormat) return '';
    // العنوان في جهة بداية السطر (اليمين) هو الأصل في الملفات: شكله يقرره أسلوب الموقع. المحفوظ: الوسط وأقصى اليسار
    if (it.kind === 'head') return it.side === 'c' ? 'c' : it.side === 'l' && rtlBase ? 'l' : '';
    // (والوسط يبقى وسطاً وإن كان أكثر الملف كذلك: محاذاة الأسلوب غيره)
    if (it.side === 'c') return 'c';
    if (it.side === 'l' && rtlBase) return 'l';
    return '';
  };
  // رموز المتن المضمَّن في النص الطبيعي: التطويل داخل الكلمة زينة، والشرطتان علامة ترقيم
  const sanitize = (t, keepMarks = embed === 'marks') => {
    let s = t.replace(/—/g, '–').replace(/-{2,}/g, '–').replace(/([ء-يً-ْ])ـ{2,}(?=[ء-ي])/g, '$1ـ');
    if (!keepMarks) s = s.replace(/ـ{2,}/g, '–');
    return s;
  };
  const F_OPEN = '\u0010';
  const F_SEP = '\u0011';
  const F_CLOSE = '\u0012';
  /** نص بتنسيقه: لا تُحاط الإحالات وأرقام الحواشي بالعلامة */
  const wrapFmt = (text, flags) =>
    text
      .split(/(\u0007\d+\u0008|[(\[][0-9٠-٩*]{1,3}[)\]])/)
      .map((part, i) => (i % 2 || !part.trim() ? part : F_OPEN + flags + F_SEP + part + F_CLOSE))
      .join('');
  /**
   * سطر الفقرة نصاً: متنه المضمَّن بين «ــ ــ»، وتنسيق المؤلف (إن حُفظ) بعلاماته. يعيد { text, mt } (mt: السطر كله متن).
   * role: 'matn' سطر من متن فوق الخط (كله متن بموضعه) · 'sharh' سطر من شرحه · '' نص خارج المتون وشروحها
   */
  // مقاس خط الفقرة نسبةً إلى خط المتن (١ = خط المتن): يُحفظ إن اختلف، فيُعرف به العنوان الذي كُبّر خطه ولم يُجعل «عنواناً»
  const bodySz = +(baseFont.split('|')[1] || 0);
  const fzOf = (it) => {
    if (!bodySz || !it.segs) return 0;
    const by = new Map();
    for (const s of it.segs) {
      const sz = s.f ? +(s.f.split('|')[1] || 0) : 0;
      const n = noRefs(s.t || '').replace(/\s/g, '').length;
      if (sz && n) by.set(sz, (by.get(sz) || 0) + n);
    }
    let best = 0;
    for (const [sz, n] of by) if (!best || n > by.get(best)) best = sz;
    const r = best ? Math.round((best / bodySz) * 100) / 100 : 0;
    return r && Math.abs(r - 1) >= 0.08 ? r : 0;
  };
  /**
   * خط المقطع ومقاسه إن خالفا خط الكتاب: «[الخط|النسبة]» (يُطبَّق في «كما في الملف» وحده، فالأسلوب يقرر غيره)
   * (المتن المميَّز بخطه لا يُعلَّم: ذلك علامته في الملف)
   */
  const fontFlag = (s, e) => {
    if (!s.f || !baseFont || s.f === baseFont || (e === 'font' && s.f === matnFont)) return '';
    const [fa, sa] = s.f.split('|');
    const [fb, sb] = baseFont.split('|');
    const name = fa && fa !== fb ? fa.replace(/[\[\]|\u0000-\u001f]/g, '').slice(0, 60) : '';
    const r = +sa && +sb && Math.abs(+sa - +sb) >= 1 ? Math.round((+sa / +sb) * 100) / 100 : 0;
    return name || r ? '[' + name + '|' + (r || '') + ']' : '';
  };
  /** خط الخلية: اسمه ونسبة مقاسه إلى خط الكتاب { ff, fz } */
  const cellFont = (f) => {
    const [fa, sa] = String(f).split('|');
    const sb = +(baseFont.split('|')[1] || 0);
    const out = {};
    if (fa) out.ff = fa.slice(0, 60);
    if (+sa && sb) out.fz = Math.round((+sa / sb) * 100) / 100;
    return out;
  };
  const renderSegs = (segs, role) => {
    const emb = role === 'matn' ? 'none' : embed;
    // (مقطع ليس فيه حرف ولا رقم — قوس أو نقطة — ليس متناً)
    const isMatnSeg = (s) => /[\p{L}\p{N}]/u.test(noRefs(s.t)) && (emb === 'bold' ? s.b && !baseBold : emb === 'color' ? !!s.c && s.c === matnColor : emb === 'font' ? !!s.f && s.f === matnFont : false);
    // سطر المتن الذي كله عريض أو كله بلون: ذلك علامته في الملف، وشكله هنا يقرره أسلوب المتن في الموقع
    const lettered = segs.filter((s) => /[\p{L}]/u.test(noRefs(s.t)));
    const allB = role === 'matn' && lettered.length > 0 && lettered.every((s) => s.b);
    const allC = role === 'matn' && lettered.length > 0 && lettered.every((s) => s.c && s.c === lettered[0].c) ? lettered[0].c : '';
    const flagsOf = (s, e = emb) => (!opt.keepFormat ? '' : (s.b && !baseBold && e !== 'bold' && !allB ? 'b' : '') + (s.u ? 'u' : '') + (s.c && s.c !== baseColor && s.c !== allC && !(e === 'color' && s.c === matnColor) ? 'c' + s.c.slice(1) : '') + fontFlag(s, e));
    const keep = emb === 'marks';
    const plainText = (e) => segs.map((s) => { const f = flagsOf(s, e); const t = sanitize(s.t, keep); return f ? wrapFmt(t, f) : t; }).join('');
    if (emb === 'bold' || emb === 'color' || emb === 'font') {
      const flags = segs.map(isMatnSeg);
      const rest = segs.filter((s, i) => !flags[i]).map((s) => noRefs(s.t)).join('').replace(/[\s.،؛:!؟()«»"'\-–]/g, '');
      if (flags.some(Boolean) && !rest) {
        // السطر كله بتنسيق المتن: خارج الشرح فقرة متن؛ وداخل الشرح سطر قصير (عنوان فرعي) يبقى بتنسيقه، والطويل متن مضمَّن
        if (role !== 'sharh') return { text: segs.map((s) => sanitize(s.t, false)).join(''), mt: true };
        if (noRefs(segs.map((s) => s.t).join('')).trim().length <= 60) return { text: plainText('none'), mt: false };
      }
      let out = '';
      let open = false;
      segs.forEach((s, i) => {
        const t = sanitize(s.t, false);
        if (flags[i]) {
          if (!open) {
            const lead = t.match(/^\s*/)[0];
            out += lead + 'ــ' + t.slice(lead.length);
            open = true;
          } else out += t;
        } else {
          if (open) {
            const trail = out.match(/\s*$/)[0];
            out = out.slice(0, out.length - trail.length) + 'ــ' + trail;
            open = false;
          }
          const f = flagsOf(s);
          out += f ? wrapFmt(t, f) : t;
        }
      });
      if (open) out = out.replace(/\s*$/, (m) => 'ــ' + m);
      return { text: out, mt: false };
    }
    let whole = false;
    let text = plainText(emb);
    if (emb === 'paren') {
      const plain = noRefs(segs.map((s) => s.t).join('')).trim();
      const m = /^\(([^()]{3,})\)[.،؛:]?$/.exec(plain);
      if (m && parenOk(m[1]) && role !== 'sharh') {
        whole = true;
        text = sanitize(m[1], false);
      } else text = text.replace(PAREN, (all, inner) => (parenOk(inner) && !inner.includes(F_OPEN) && !inner.includes(F_CLOSE) ? 'ــ' + inner + 'ــ' : all));
    }
    return { text, mt: whole };
  };

  /* ---------------------------------------------------------- ٧) التوزيع على صفحات */
  // الحواشي تُرقَّم من جديد في كل صفحة وتوضع تحت الخط الفاصل (كما في «تراث»)؛ وكل متن وشرحه صفحة: المتن ثم «ــــ» ثم الشرح
  const target = Math.max(600, +o.pageChars || 1800);
  const pages = [];
  const headings = [];
  let cur = { lines: [], notes: [], chars: 0, marks: {}, mk: 0, n: 0 };
  const flush = () => {
    if (!cur.lines.length) return;
    const text = cur.lines.join('\n') + (cur.notes.length ? '\n_________\n' + cur.notes.join('\n') : '');
    const meta = { page: pages.length + 1 };
    if (cur.mk) meta.marks = cur.marks;
    pages.push({ page_id: pages.length + 1, text, meta });
    cur = { lines: [], notes: [], chars: 0, marks: {}, mk: 0, n: 0 };
  };
  /** علامة السطر: خصائصه (محاذاة، متن، خارج الفهرس) أو عنصره (صورة، جدول…) */
  const mark = (m) => {
    const n = ++cur.mk;
    cur.marks[n] = m;
    return `\u000e${n}\u000f`;
  };
  /** حاشية إلى أسفل الصفحة الجارية برقمها فيها ← علامة إحالتها في النص (\u0007 رقم \u0008: لا تلتبس بـ«(١)» مكتوبة في النص) */
  const addNote = (r) => {
    const lines = r && noteLines[r.kind].get(r.id);
    if (!lines) return '';
    const n = ++cur.n;
    cur.notes.push(`(${ar(n)}) ${escHtml(lines[0])}`, ...lines.slice(1).map((l) => escHtml(guardNote(l))));
    stats.notes++;
    return `\u0007${n}\u0008`;
  };
  const FT = '((?:\\u0010[^\\u0011\\u0012]*\\u0011|\\u0012|\\s)*)';
  const PAREN_REF = new RegExp('[(\\[]' + FT + '(\\u0007\\d+\\u0008)' + FT + '[)\\]]', 'g');
  const unparen = (m, a, t, b) => a.replace(/\s/g, '') + t + b.replace(/\s/g, '');
  /** مواضع الإحالات في النص ← علامات بأرقام الحواشي في صفحتها */
  const withRefs = (text, refs) =>
    text
      .replace(/[ \t]*\u0007(\d+)\u0008/g, (m, k) => addNote(refs[+k]))
      // قوسان مكتوبان حول رقم الحاشية في النص «كلمة(¹)» — ولو كانا بتنسيق (عريض، ملوّن) — يُرفعان: القوسان يضعهما الموقع
      .replace(PAREN_REF, unparen)
      .replace(PAREN_REF, unparen)
      .replace(/\u0010[^\u0011\u0012]*\u0011\u0012/g, '')
      .replace(/ {2,}/g, ' ');
  // إحالات لا تُكتب في موضعها (على عنوان، أو بيت، أو في خلية جدول، أو في فقرة ليس فيها غيرها): تُلحق بأول سطر نص بعدها،
  // وتُسجَّل حواشيها في صفحته
  const pendingRefs = [];
  /** النص بلا مواضع إحالاته، وهي إلى المؤجَّلات */
  const deferRefs = (text, refs) =>
    text.replace(/[ \t]*\u0007(\d+)\u0008/g, (m, k) => {
      if (refs[+k]) pendingRefs.push(refs[+k]);
      return '';
    });
  const takePending = () => pendingRefs.splice(0).map(addNote).join('');
  let curUnit = 0;
  let phase = '';
  let firstCover = null;
  const closeUnit = () => {
    if (!curUnit) return;
    if (phase === 'matn') cur.lines.push('ــــــــ');
    flush();
    curUnit = 0;
    phase = '';
  };
  for (const it of items) {
    if (it.kind === 'skip') continue;
    if (it.kind === 'refs') {
      pendingRefs.push(...it.refs);
      continue;
    }
    if (it.kind === 'sep' || it.kind === 'nsep') {
      // فاصل لا متن له ولا شرح (في كتاب عادي): خط زخرفي
      if (!unitMode || !it.unit) it.kind = 'hr';
      else continue;
    }
    if (it.kind === 'break') {
      // فاصل الصفحة في الملف يبقى (ما بعده في صفحة جديدة كما في الملف)، إلا في أول الكتاب، ولا يتكرر
      if (!it.soft && opt.keepFormat && !unitMode && (pages.length || cur.lines.length)) {
        const last = cur.lines[cur.lines.length - 1] || '';
        const lm = /^\u000e(\d+)\u000f$/.exec(last);
        const lastObj = lm && cur.marks[lm[1]] && cur.marks[lm[1]].obj;
        if (!(lastObj && lastObj.type === 'pagebreak')) cur.lines.push(mark({ obj: { type: 'pagebreak' } }));
      }
      if (!curUnit && !it.soft && cur.chars >= 300) flush();
      continue;
    }
    if (it.kind === 'pagefig') {
      // صفحة صور من أول الملف (عنوان الكتاب، شعار الدار): صفحة مستقلة بتنسيقها
      stats.titlePages++;
      if (!opt.keepCover) continue;
      closeUnit();
      cur.lines.push(mark({ obj: { type: 'pagefig', parts: it.parts } }));
      cur.chars += 100;
      continue;
    }
    if (it.kind === 'cover') {
      stats.covers++;
      if (!opt.keepCover) continue;
      if (it.first && !firstCover) {
        firstCover = it.data; // غلاف أول الملف: يُعرض غلافاً خارجياً للكتاب
        continue;
      }
      closeUnit();
      cur.lines.push(mark({ obj: { type: 'coverpage', src: it.data.src, w: it.data.w, h: it.data.h } }));
      cur.chars += 100;
      continue;
    }
    // الدخول في متن وشرحه، والخروج منهما
    if (it.unit && it.unit !== curUnit) {
      closeUnit();
      flush();
      curUnit = it.unit;
      phase = 'matn';
    } else if (!it.unit && curUnit) closeUnit();
    if (curUnit && it.role === 'sharh' && phase === 'matn') {
      cur.lines.push('ــــــــ');
      phase = 'sharh';
    }
    if (it.kind === 'head') {
      if ((it.level === 1 && cur.chars >= 500) || cur.chars >= target) flush();
      // حاشية على العنوان: العنوان يبقى نظيفاً للفهرس، وإحالتها على أول سطر بعده
      const plain = cleanText(deferRefs(it.text, it.refs));
      const al = alOf(it);
      const m = al || it.nt ? mark({ ...(al ? { al } : {}), ...(it.nt ? { nt: 1 } : {}) }) : '';
      cur.lines.push(`${m}<span data-type="title" data-level="${it.level}">${escHtml(plain)}</span>`);
      headings.push({ title: plain, level: it.level, page: pages.length + 1 });
      cur.chars += plain.length;
      stats.headings++;
      continue;
    }
    if (!curUnit && cur.chars >= target) flush();
    if (it.kind === 'verse') {
      cur.lines.push(escHtml(sanitize(deferRefs(it.parts[0], it.refs))) + ' ... ' + escHtml(sanitize(deferRefs(it.parts[1], it.refs))));
      cur.chars += it.parts[0].length + it.parts[1].length;
      stats.verses++;
      continue;
    }
    if (it.kind === 'img') {
      stats.images++;
      const al = opt.keepFormat ? (it.side === 'l' && rtlBase ? 'l' : it.side === 'r' && rtlBase && it.wPct < 60 ? 'r' : 'c') : 'c';
      cur.lines.push(mark({ obj: { type: 'image', src: it.data.src, w: it.data.w, h: it.data.h, wPct: it.wPct, al, ...(it.cap ? { cap: it.cap.slice(0, 600) } : {}) } }));
      cur.chars += 200;
      continue;
    }
    if (it.kind === 'tbl') {
      const rows = it.rows.map((r) => ({
        ...(r.hdr ? { hdr: 1 } : {}),
        cells: r.cells.map((c) => ({
          t: c.skip ? '' : c.lines.map((l) => cleanText(sanitize(deferRefs(l.t, l.refs)))).filter(Boolean).join('\n'),
          ...(c.b ? { b: 1 } : {}),
          ...(c.al && opt.keepFormat ? { al: c.al } : {}),
          ...(c.span > 1 ? { span: c.span } : {}),
          ...(c.rs > 1 ? { rs: c.rs } : {}),
          ...(c.skip ? { skip: 1 } : {}),
          ...(c.bg && opt.keepFormat ? { bg: c.bg } : {}),
          // لون الخلية وخطها ومحاذاتها المضبوطة من الملف
          ...(c.c && opt.keepFormat ? { c: c.c } : {}),
          ...(c.f && opt.keepFormat ? cellFont(c.f) : {}),
          ...(c.j && opt.keepFormat ? { al: 'j' } : {}),
        })),
      }));
      cur.lines.push(mark({ obj: { type: 'table', rows, cols: it.cols, rtl: it.rtl ? 1 : 0, borders: it.borders ? 1 : 0 } }));
      cur.chars += it.chars;
      continue;
    }
    if (it.kind === 'hr') {
      cur.lines.push(mark({ obj: { type: 'hr' } }));
      continue;
    }
    const r = renderSegs(it.segs, curUnit ? it.role || '' : '');
    const line = escHtml(withRefs(guardVerse(r.text), it.refs));
    if (!noRefs(line).replace(/\u0010[^\u0011]*\u0011|\u0012/g, '').trim()) {
      // سطر لم يبقَ فيه إلا إحالة: تبقى (فحاشيتها سُجّلت في هذه الصفحة)
      if (/\u0007\d+\u0008/.test(line)) cur.lines.push(line.match(/\u0007\d+\u0008/g).join(''));
      continue;
    }
    const al = alOf(it);
    const fz = fzOf(it);
    const m = al || r.mt || fz ? mark({ ...(al ? { al } : {}), ...(r.mt ? { mt: 1 } : {}), ...(fz ? { fz } : {}) }) : '';
    cur.lines.push(m + line + takePending());
    cur.chars += line.length;
    stats.paragraphs++;
  }
  // إحالات لم يأتِ بعدها نص: سطر لها وحدها
  if (pendingRefs.length) cur.lines.push(takePending());
  // فاصل صفحة في آخر الكتاب (قبل الفهرس أو آخر قسم): لا صفحة فارغة بعده
  while (cur.lines.length) {
    const m = /^\u000e(\d+)\u000f$/.exec(cur.lines[cur.lines.length - 1]);
    if (!(m && cur.marks[m[1]] && cur.marks[m[1]].obj && cur.marks[m[1]].obj.type === 'pagebreak')) break;
    cur.lines.pop();
  }
  closeUnit();
  flush();
  if (!pages.length) throw new Error('الملف لا نص فيه');

  /* ---------------------------------------------------------- ٨) بيانات الكتاب وما فُهم منه */
  // الاسم من اسم الملف («اسم الكتاب - المؤلف.docx»)، وإلا من عنوان المستند
  const tag = (name) => {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`).exec(core);
    return m ? cleanText(decodeXml(m[1])) : '';
  };
  let name = base;
  let author = '';
  const split = /^(.{2,}?)\s+[-–—]\s+(.{2,})$/.exec(base);
  if (split) {
    name = split[1].trim();
    author = split[2].trim();
  }
  const coreTitle = tag('dc:title');
  if (!AR_LETTERS.test(name)) name = (AR_LETTERS.test(docTitle) && docTitle) || (AR_LETTERS.test(coreTitle) && coreTitle) || name || docTitle || coreTitle || 'كتابي';
  const creator = tag('dc:creator');
  if (!author && AR_LETTERS.test(creator)) author = creator;
  const info = `الكتاب: ${name}${author ? `\nالمؤلف: ${author}` : ''}`;
  const id = o.id ?? 'my-' + pages.length + '-' + name.length;
  stats.pages = pages.length;

  /* ---------------------------------------------------------- ٨أ) الأقسام: خلفيات الصفحات وغلاف الرأس */
  // كم من النص في كل قسم: أكثرها نصاً قسم الكتاب (هوامشه هوامش الكتاب، وخلفية رأسه خلفية صفحاته)
  for (let i = 0; i < sections.length; i++) sections[i].chars = Math.max(0, (i + 1 < sections.length && secStart[i + 1] != null ? secStart[i + 1] : textSoFar) - (secStart[i] ?? textSoFar));
  const tocSec = toc.sec >= 0 && hasToc ? toc.sec : -1;
  let mainSec = 0;
  sections.forEach((x, i) => {
    if (i !== tocSec && x.chars > sections[mainSec].chars) mainSec = i;
  });
  const MS = sections[mainSec];
  const bgs = {};
  let headCover = null;
  if (opt.keepFormat || opt.keepCover) {
    const H = async (i, t) => (sections[i] && sections[i].refs[t] ? await readHeader(sections[i].refs[t], sections[i]) : null);
    // خلفية صفحات الكتاب: صورة رأسه المعتاد
    const def = await H(mainSec, 'default');
    if (def && def.bg) bgs.body = def.bg.src;
    // الصفحة الأولى فارغةٌ ورأسها الأول فيه صورةٌ تملأ الصفحة: غلاف الملف (وما كُتب عليه في مربعات النص)
    if (opt.keepCover && sections[0].titlePg && firstBreakAt === 0) {
      const f = await H(0, 'first');
      if (f && f.bg) headCover = { ...f.bg, texts: f.texts };
    }
    // الفهرس في قسمه: صفحته الأولى برأسها الأول (إن كان)، وإلا برأسه المعتاد
    if (tocSec >= 0 && tocSec !== mainSec) {
      const t = sections[tocSec].titlePg ? await H(tocSec, 'first') : null;
      const d = t && t.bg ? t : await H(tocSec, 'default');
      if (d && d.bg) bgs.toc = d.bg.src;
    } else if (bgs.body) bgs.toc = bgs.body;
    // قسمٌ يبدأ بباب ورأسه الأول بخلفيةٍ غير خلفية الكتاب: خلفية صفحة الباب
    for (let i = 0; i < sections.length && !bgs.h1; i++) {
      if (i === tocSec || !sections[i].titlePg || (i === 0 && headCover)) continue;
      const f = await H(i, 'first');
      if (f && f.bg && f.bg.src !== bgs.body) bgs.h1 = f.bg.src;
    }
  }
  if (headCover && !firstCover) firstCover = { src: headCover.src, w: headCover.w, h: headCover.h };
  // رقم الصفحة في تذييل قسم الكتاب: لونه ومقاسه وخطه (فيُكتب كما في الملف)
  let folio = null;
  if (opt.keepFormat && MS.frefs && MS.frefs.default && relMap.has(MS.frefs.default)) {
    const fx = await read(partPath(relMap.get(MS.frefs.default)));
    const pm = /<w:p(?=[\s>])(?:(?!<\/w:p>)[\s\S])*?(?:<w:instrText[^>]*>\s*PAGE\b|w:instr="\s*PAGE\b)[\s\S]*?<\/w:p>/.exec(fx ? (fx.includes('<mc:Fallback') ? dropAll(fx, 'mc:Fallback') : fx) : '');
    if (pm) {
      const rp = (/<w:r(?:\s[^>]*)?>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(pm[0]) || [])[1] || '';
      const cv = val(rp, 'w:color');
      folio = { color: cv && /^[0-9a-f]{6}$/i.test(cv) ? '#' + cv.toLowerCase() : '', size: (+(val(rp, 'w:sz') || 0) || 0) / 2, bold: (onOff(rp, 'w:bCs') ?? onOff(rp, 'w:b')) === true };
    }
  }
  const hasMatn = unitMode || embed !== 'none';
  /** تباعد الأسطر الغالب في الملف نسبةً إلى مقاس الخط (السطر المفرد في Word نحو ١٫٢ من الخط العربي) */
  function lineHeightOf() {
    const by = new Map();
    for (const it of items) {
      if (it.kind !== 'p' || it.wline) continue;
      const n = plainOf(it).length;
      if (!n) continue;
      const pt = +(String(it.font || baseFont).split('|')[1] || 0) / 2 || +(baseFont.split('|')[1] || 0) / 2 || 14;
      let r = 1.2;
      if (it.lr === 'auto' && it.ln) r = (it.ln / 240) * 1.2;
      else if (it.lr === 'exact' && it.ln) r = it.ln / 20 / pt;
      else if (it.lr === 'atLeast' && it.ln) r = Math.max(1.2, it.ln / 20 / pt);
      r = Math.round(Math.min(2.8, Math.max(1.0, r)) * 20) / 20;
      by.set(r, (by.get(r) || 0) + n);
    }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : 0;
  }
  function lookOf() {
    const mm = (t) => Math.round((t / 56.7) * 10) / 10;
    const fz = new Map();
    for (const it of items) if (it.kind === 'p' && it.font && !it.wline) fz.set(it.font, (fz.get(it.font) || 0) + plainOf(it).length);
    const top = [...fz.entries()].sort((a, b) => b[1] - a[1])[0];
    const [bf, bs] = top ? String(top[0]).split('|') : ['', ''];
    const base = styles.get('') || {};
    const heads = {};
    // العناوين كما كُتبت في الملف (لونها وخطها ومقاسها في أكثرها)، وإلا كما في أنماط عناوينه
    for (const l of [1, 2, 3, 4]) {
      const hs = items.filter((x) => x.kind === 'head' && x.styled && x.level === l);
      if (!hs.length) continue;
      const most = (f) => {
        const m = new Map();
        for (const x of hs) if (f(x)) m.set(f(x), (m.get(f(x)) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      };
      const fz = most((x) => x.hf);
      const [ff, fs] = fz ? fz.split('|') : ['', ''];
      heads[l] = { font: ff || '', size: (+fs || 0) / 2, color: most((x) => x.hc), bold: hs.filter((x) => x.hb).length * 2 >= hs.length, jc: most((x) => (x.side === 'c' ? 'center' : '')) || '' };
    }
    for (const st of styles.values()) {
      if (st.outline == null || st.outline < 0 || st.outline > 3 || st.toc) continue;
      const l = st.outline + 1;
      const h = heads[l] || {};
      heads[l] = { font: h.font || st.font || '', size: h.size || (st.sz || 0) / 2, color: h.color || st.color || '', bold: h.bold != null ? h.bold : st.bold !== false, jc: h.jc || st.jc || '' };
    }
    return {
      // لون النص الغالب (وبه لا يُعلَّم لون كل مقطع)
      textColor: baseColor || '',
      lineHeight: lineHeightOf(),
      // صفحة قسم الكتاب (لا آخر قسم: قد يكون قسم الفهرس بهوامش أخرى)
      page: { w: mm(MS.w), h: mm(MS.h), side: mm((MS.mL + MS.mR) / 2), top: mm(MS.mT), bottom: mm(MS.mB), footer: mm(MS.ft) },
      ...(folio ? { folio } : {}),
      font: bf || base.font || '',
      size: (+bs || base.sz || 0) / 2,
      color: base.color || '',
      heads,
    };
  }
  const word = {
    // نوع الكتاب كما فُهم من بنيته
    type: hasMatn ? (stats.notes ? 'sharh_and_hashiya' : 'sharh') : '',
    matn: unitMode ? mode : 'none', // كيف فُصل المتن عن شرحه (المعمول به)
    detected, // ما تعرّف عليه الموقع وحده
    embed, // كيف عُرف المتن المضمَّن داخل الشرح (المعمول به)
    embedDetected,
    units,
    seps: sepCount,
    matnColor: embed === 'color' ? matnColor : '',
    frames: frameGroups,
    pageMarks,
    titlePages: stats.titlePages,
    tocsRemoved,
    hasToc,
    toc: fileToc ? 'file' : 'site',
    tocEntries: toc.entries.length,
    tocMatched,
    tocTitle: toc.title,
    tocAt: hasToc ? (toc.at <= totalChars * 0.5 ? 'start' : 'end') : '',
    covers: stats.covers + (headCover ? 1 : 0),
    cover: firstCover,
    // ما كُتب على صورة الغلاف (مربعات النص في رأس الصفحة الأولى): يُرسم عليها في المتصفح
    ...(headCover && headCover.texts.length ? { coverTexts: headCover.texts } : {}),
    // خلفيات الصفحات من رؤوسها: صفحات الكتاب، والباب، والفهرس
    ...(Object.keys(bgs).length ? { bgs } : {}),
    images: stats.images,
    tables: items.filter((x) => x.kind === 'tbl').length,
    typedNotes: stats.typedNotes,
    options: opt,
    // شكل الملف نفسه (لـ«كما في الملف»): صفحته وهوامشها، وخط النص ومقاسه ولونه، وخطوط العناوين ومقاساتها وألوانها ومحاذاتها
    look: lookOf(),
  };
  return {
    id,
    name,
    info,
    cover: { title: name, subtitle: '', author, authorNote: '', editor: '', editorLabel: 'تحقيق', publisher: '', edition: '' },
    volumes: [{ vol: '1', start: 1, end: pages.length, pages: pages.length, parts: [] }],
    totalPages: pages.length,
    book: { meta: { id, name, info }, indexes: { headings } },
    pages,
    stats,
    word,
    // تعليمات للمحلّل: الفقرات كاملة فلا تُدمج، وكل متن وشرحه في صفحته
    // (تنسيق الملف محفوظ: لا يُحذف من أوله شيء — اسم الكتاب أو مؤلفه في صفحاته من الكتاب كما كتبه صاحبه)
    parse: { layout: unitMode ? 'split' : 'plain', unitPages: true, tokenRefs: true, lightFront: true, ...(opt.keepFormat ? { stripFrontMatter: false } : {}), bracketHeads: false, mergeBrokenParagraphs: false, starMatn: !unitMode && ALL.stars >= 3, embeddedMarks: embed !== 'none', ...(fileToc ? { fileToc: true, tocTitle: toc.title } : {}) },
  };
}
