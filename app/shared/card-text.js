// «البطاقة النصية»: أسلوب مكتوب نصاً عادياً (كما يجيب به أي ذكاء اصطناعي) يتحول هنا إلى بطاقة أسلوب.
// الصيغة: كل ملف من ملفات الأسلوب في مربع كود، وقبله سطر فيه اسم الملف:
//
//   ### style.json            ← الاسم والإعدادات والخيارات والصفحات الخاصة (وإعداد الطباعة "print" إن أُريد)
//   ```json … ```
//   ### style.css             ← التنسيق الخاص
//   ### templates/h1.html     ← قوالب العناصر (h1 h2 h3 h4 folio rh page cover chapterPage ornament tocHead)
//   ### pages/basmala.html    ← الصفحات الخاصة
//   ### images/frame.svg      ← صور الأسلوب (SVG نصاً)
//   ### script.js             ← برنامج الأسلوب
//
// ويُقبل الجواب ملفوفاً كله في مربع خارجي واحد (بأربع علامات: ما يطلبه التوجيه ليُنسخ بضغطة)، ومنسوخاً بلا علامات
// (أسماء الملفات في أسطرها)، والكود وحده (كائن JSON ثم CSS).
//
// يعمل في المتصفح (خانة التركيب) وفي Node (scripts/make-card.mjs والاختبارات). المرجع: docs/ai-style-prompt-books.md و docs/ai-style-prompt-research.md

const NAME_RE = /(style\.json|style\.css|script\.js|(?:templates|pages|images)\/[\w.-]+\.(?:html|svg))/i;

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** JSON كما يكتبه الناس والنماذج: يُتسامح مع التعليقات والفاصلة الزائدة قبل القوس */
function looseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}

/** مربعات الكود في النص، مع اسم الملف الذي يخص كلاً منها */
function blocks(text) {
  let src = String(text || '').replace(/\r\n?/g, '\n');
  // إن لُفّ الجواب كله في مربع واحد: يُفك الغلاف. (أربع علامات فأكثر: ما يطلبه التوجيه ليُنسخ الجواب بضغطة؛ أو ثلاث باسم markdown/text)
  const outer = /(?:^|\n)[ \t]{0,3}(`{4,}|~{4,})[^\n`]*\n/.exec(src) || /^\s*(`{3}|~{3})[ \t]*(?:markdown|md|text|txt|plaintext|plain)[ \t]*\n/i.exec(src);
  if (outer) {
    const fence = outer[1];
    src = src.slice(outer.index + outer[0].length);
    const last = src.lastIndexOf('\n' + fence);
    if (last >= 0) src = src.slice(0, last);
  }
  const lines = src.split('\n');
  const out = [];
  let prevEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s{0,3}(`{3,}|~{3,})\s*([^\n`]*)$/.exec(lines[i]);
    if (!open) continue;
    const fence = open[1];
    let j = i + 1;
    while (j < lines.length && !new RegExp('^\\s{0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[j])) j++;
    const body = lines.slice(i + 1, j).join('\n');
    const info = open[2].trim();
    // اسم الملف: في سطر الفتح، أو في أقرب سطر قبله (عنوان أو سطر عريض)، أو تعليق في أول المربع
    let name = (NAME_RE.exec(info) || [])[1] || '';
    for (let k = i - 1, seen = 0; !name && k > prevEnd && seen < 4; k--) {
      if (!lines[k].trim()) continue;
      seen++;
      name = (NAME_RE.exec(lines[k]) || [])[1] || '';
    }
    if (!name) {
      const first = body.split('\n').find((l) => l.trim()) || '';
      if (/^\s*(\/\/|\/\*|<!--|#)/.test(first)) name = (NAME_RE.exec(first) || [])[1] || '';
    }
    let lang = info.split(/\s+/)[0].toLowerCase();
    let text = body;
    // مربع أوله سطر اسم الملف ثم سطر فتح مربع (غلاف خارجي بثلاث علامات انكسر تداخله): يُرفع السطران
    const bl = text.split('\n');
    const f0 = bl.findIndex((l) => l.trim());
    if (f0 >= 0 && NAME_RE.test(bl[f0]) && bl[f0 + 1] !== undefined) {
      const inner = /^\s{0,3}(`{3,}|~{3,})\s*([^\n`]*)$/.exec(bl[f0 + 1]);
      if (inner) {
        name = NAME_RE.exec(bl[f0])[1];
        lang = inner[2].trim().split(/\s+/)[0].toLowerCase() || lang;
        text = bl.slice(f0 + 2).join('\n');
      }
    }
    out.push({ name: name.replace(/\\/g, '/'), lang, body: text });
    prevEnd = j;
    i = j;
  }
  return out;
}

/** أسطر يضيفها النسخ من واجهات المحادثة فوق الكود: اسم اللغة، «نسخ الكود»… */
const CHAT_LABEL = /^\s*(json|css|html|xml|svg|js|javascript|text|plaintext|markdown|md|copy|copy code|edit|نسخ|نسخ الكود|نسخ الرمز|تحرير|تعديل)\s*$/i;
function stripLabels(lines) {
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || CHAT_LABEL.test(lines[i]))) i++;
  return lines.slice(i);
}
/** نص بلا مربعات كود (نُسخ الجواب المعروض فزالت علاماته): الملفات تُعرف بأسطر أسمائها */
function plainSections(text) {
  const head = new RegExp('^\\s{0,3}(?:#{1,6}\\s*)?[*_`"«\\s]{0,4}' + NAME_RE.source + '[*_`"»\\s]{0,4}:?\\s*$', 'i');
  const out = [];
  let cur = null;
  for (const l of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = head.exec(l);
    if (m) out.push((cur = { name: m[1], lines: [] }));
    else if (cur) cur.lines.push(l);
  }
  return out.map((b) => ({ name: b.name.replace(/\\/g, '/'), lang: '', body: stripLabels(b.lines).join('\n').trim() })).filter((b) => b.body);
}
/** الكود وحده بلا اسم ولا مربع: كائن JSON (فهو style.json)، وما بعده إن كان CSS فهو style.css */
function bareCode(text) {
  const src = stripLabels(String(text || '').replace(/\r\n?/g, '\n').split('\n')).join('\n').trim();
  if (src[0] !== '{') return [];
  let depth = 0;
  let inStr = false;
  let end = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const out = [{ name: 'style.json', lang: 'json', body: src.slice(0, end + 1) }];
  const rest = stripLabels(src.slice(end + 1).split('\n')).join('\n').trim();
  if (/[^{}]+\{[^{}]*\}/.test(rest)) out.push({ name: 'style.css', lang: 'css', body: rest });
  return out;
}

/**
 * @param {string} text  نص البطاقة (جواب الذكاء الاصطناعي كما هو)
 * @returns {{card: object, files: string[], warnings: string[]}|null}  null إن لم يكن النص بطاقة نصية
 */
export function parseCardText(text) {
  let all = blocks(text);
  // جواب لُفّ كله في مربع واحد (بأربع علامات، كما يطلب التوجيه، ليُنسخ بضغطة): الملفات في داخله
  if (all.length === 1) {
    const inner = blocks(all[0].body);
    if (inner.length) all = inner;
  }
  // بلا مربعات كود: أسماء الملفات في أسطرها، أو الكود وحده
  if (!all.some((b) => b.body.trim())) all = plainSections(text);
  if (!all.length) all = bareCode(text);
  if (!all.length) return null;
  const warnings = [];
  const files = {};
  const unnamed = [];
  for (const b of all) {
    if (!b.name) {
      unnamed.push(b);
      continue;
    }
    const key = b.name.replace(/^(templates|pages|images)\//i, (m) => m.toLowerCase()).replace(/^(style\.json|style\.css|script\.js)$/i, (m) => m.toLowerCase());
    if (files[key] !== undefined) warnings.push(`الملف ${key} تكرر: أُخذ الأخير`);
    files[key] = b.body;
  }
  // مربعات بلا اسم: تُعرف بلغتها إن لم يكن لنوعها ملف
  for (const b of unnamed) {
    if (files['style.json'] === undefined && (b.lang === 'json' || /^\s*\{[\s\S]*"name"\s*:/.test(b.body))) files['style.json'] = b.body;
    else if (files['style.css'] === undefined && b.lang === 'css') files['style.css'] = b.body;
    else if (files['script.js'] === undefined && /^(js|javascript)$/.test(b.lang)) files['script.js'] = b.body;
  }
  const names = Object.keys(files);
  if (!names.length) return null;

  let meta = {};
  if (files['style.json'] !== undefined) {
    try {
      meta = looseJson(files['style.json']);
    } catch (e) {
      throw new Error('ملف style.json غير صالح: ' + e.message);
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('ملف style.json يجب أن يكون كائناً { }');
  } else warnings.push('لا يوجد style.json: أُخذ الاسم من العنوان والإعدادات من الافتراضي');
  // بطاقة كاملة بصيغتها النهائية داخل style.json؟ تُقبل كما هي
  if (meta.format === 'warraq-style' && meta.extras) return { card: meta, files: names, warnings };
  const title = /^#{1,3}\s*(?:أسلوب|بطاقة|style)?\s*[:：\-–—]?\s*[«"]?([^\n«»"`]{2,60}?)[»"]?\s*$/m.exec(String(text).split('```')[0] || '');
  const name = String(meta.name || (title && title[1]) || '').trim();
  if (!name) throw new Error('لا اسم للأسلوب: أضف "name" في style.json');

  const templates = {};
  const images = {};
  const pageFiles = {};
  for (const [k, body] of Object.entries(files)) {
    let m;
    if ((m = /^templates\/([\w-]+)\.html$/.exec(k))) templates[m[1]] = body.trim();
    else if ((m = /^pages\/([\w.-]+)\.html$/.exec(k))) pageFiles[m[1]] = body.trim();
    else if ((m = /^images\/([\w-]+)\.svg$/.exec(k))) {
      const svg = body.trim();
      if (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(svg)) images[m[1].toLowerCase()] = svg.replace(/\s+/g, '');
      else if (/<svg[\s>]/i.test(svg)) images[m[1].toLowerCase()] = 'data:image/svg+xml;base64,' + b64(svg);
      else warnings.push(`الصورة ${k} ليست SVG: تُركت`);
    }
  }
  // الصفحات الخاصة: ما ذُكر في style.json بموضعه، وما لم يُذكر يوضع بعد الغلاف الداخلي
  const pages = [];
  const used = new Set();
  for (const p of Array.isArray(meta.pages) ? meta.pages : []) {
    const base = String((p && (p.file || p.name)) || '').replace(/^pages\//, '').replace(/\.html$/, '');
    const html = (p && typeof p.html === 'string' && p.html) || pageFiles[base];
    if (!html) {
      warnings.push(`صفحة خاصة بلا ملف: pages/${base}.html`);
      continue;
    }
    used.add(base);
    pages.push({ at: p.at || 'afterCover', name: String(p.name || base).toLowerCase(), folio: !!p.folio, html });
  }
  for (const [base, html] of Object.entries(pageFiles)) if (!used.has(base)) pages.push({ at: 'afterCover', name: base.toLowerCase(), folio: false, html });

  const script = (files['script.js'] || '').trim();
  const card = {
    format: 'warraq-style',
    version: script ? 3 : 2,
    name,
    desc: String(meta.desc || meta.description || '').trim(),
    settings: meta.settings && typeof meta.settings === 'object' ? meta.settings : {},
    extras: {
      css: files['style.css'] || '',
      images,
      slots: meta.slots && typeof meta.slots === 'object' ? meta.slots : {},
      h1OrnamentMm: meta.h1OrnamentMm,
      separatorMm: meta.separatorMm,
      templates,
      pages,
      options: meta.options && typeof meta.options === 'object' ? meta.options : {},
      ...(script ? { script } : {}),
    },
    // إعداد طباعة خاص بالأسلوب («النسخة الجاهزة للطباعة»): تسلسل الصفحات والعنوان المختصر والترقيم وهامش التجليد
    ...(meta.print && typeof meta.print === 'object' && !Array.isArray(meta.print) ? { print: meta.print } : {}),
    exportedAt: new Date().toISOString(),
  };
  return { card, files: names, warnings };
}
