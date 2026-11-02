// محلّل صفحات «تراث» إلى بنية دلالية (متن، شرح، حاشية، باب، فصل، شعر)
// Deterministic, rule-based parser — no AI. Runs inside the Web Worker.

import { normalizeArabic, toLatinDigits, matchScore, isSharhLabel } from './arabic.js';
import { findQuran, suraOf, ayahRange } from './quran.js';
import { srcVerseNumbers, readMutunBlocks } from './mutun.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const H_OPEN = '\u0001';
const H_SEP = '\u0002';
const H_CLOSE = '\u0003';

// خط فاصل الحواشي في «تراث»/الشاملة: سطر من الشرطات السفلية
const FOOT_SEP = /(^|\n)[ \t]*(?:_[ \t]*){3,}(\n|$)/;
// رقم الحاشية في أول سطرها: (١) أو [١] أو (*)
const NOTE_START = /^\s*(?:[([]\s*([0-9٠-٩۰-۹]{1,3}|\*{1,3})\s*[)\]]\s*[-–:ـ]?|([0-9٠-٩۰-۹]{1,3})\s*(?:[-–.)ـ:]|\s(?=[^\s0-9٠-٩])))\s*/;
// إحالة داخل المتن: (١)
const REF_RE = /[ \t\u00A0]*(?:[([]([0-9٠-٩۰-۹]+|\*{1,3})[)\]]|\u0007([0-9]+)\u0008)/g;
// ملفات Word: الإحالة علامة يكتبها المستورد، و«(١)» المكتوبة في النص تبقى نصاً (opts.tokenRefs)
const TOKEN_REF_RE = /[ \t\u00A0]*\u0007([0-9]+)\u0008/g;
// البيت الشعري: شطر ... شطر
const VERSE_RE = /^(.{3,90}?)\s+(?:\.{3,}|…+|\*{1,3}|•)\s+(.{3,90})$/;
// رمز الفاصل للمتن المضمَّن: «ــ» (واصلتان) أو «--»
const MATN_MARK = /(ـ{2,}|-{2,}|—{1,2})/;

const TERMINAL = /[.؟?!:۔…»"'\])﴾]\s*$/;

// عنوان داخل الجملة (لا يُفصل عنها): يُكتب في السطر بعريض ويُدرج في الفهرس
const I_OPEN = '\u0004';
const I_SEP = '\u0005';
const I_CLOSE = '\u0006';
const H_RE = new RegExp(`${H_OPEN}(\\d)${H_SEP}([\\s\\S]*?)${H_CLOSE}`, 'g');

// علامات يكتبها مستورد ملفات Word (shared/docx-import.js) ليحفظ ما لا تحمله صيغة «تراث»:
//   \u000e رقم \u000f في أول السطر: خصائص السطر في meta.marks (محاذاة، متن، خارج الفهرس) أو عنصره (صورة، جدول…)
//   \u0010 تنسيق \u0011 نص \u0012 داخل السطر: نص بتنسيق المؤلف (b عريض، u مسطّر، cRRGGBB لون)
const MARK_RE = /^\u000e(\d+)\u000f/;
const OBJ_LINE = /^\u000e(\d+)\u000f$/;
const FMT_RE = /\u0010[^\u0011\u0012]*\u0011|\u0012/g;
/** النص بلا علامات التنسيق */
export const stripFmt = (s) => String(s).replace(FMT_RE, '');

/** تنظيف العنوان: حذف المعقوفات [ ] التي تضعها الشاملة/تراث لتمييز العناوين */
export function cleanHeading(t) {
  return String(t || '')
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:،\-–]+|[\s:،\-–]+$/g, '')
    .trim();
}

// سطر كامل بين معقوفين مثل «[فصل]» أو «[باب ما جاء في …]» = عنوان بلا وسم
const BRACKET_HEAD = /^\[([^\[\]]{2,90})\]$/;
const isBracketHeading = (line) => {
  const m = BRACKET_HEAD.exec(line);
  return !!m && /[\u0621-\u064A]{2}/.test(m[1]) && !/^\s*(ص|ج|ق)\s*[0-9٠-٩]/.test(m[1]);
};

/**
 * تقسيم السطر عند العناوين الموسومة. العنوان يُفصل فقط إذا كان في حدود الجملة:
 * قبله بداية السطر أو نهاية جملة (. ؟ !)، وبعده نهاية السطر أو نقطة. وإلا بقي في موضعه داخل الجملة.
 */
function splitHeadings(line, resolveLevel) {
  const out = [];
  let buf = '';
  let last = 0;
  for (const m of line.matchAll(H_RE)) {
    const before = buf + line.slice(last, m.index);
    const after = line.slice(m.index + m[0].length);
    const text = cleanHeading(m[2]);
    last = m.index + m[0].length;
    if (!text) {
      buf = before;
      continue;
    }
    const level = resolveLevel(text, +m[1]);
    const b = before.trim();
    const a = after.trim();
    const beforeOk = !b || /[.؟?!]["»)\]]?$/.test(b);
    const afterOk = !a || (/^\.(?!\.)/.test(a)) || a.startsWith(H_OPEN);
    if (beforeOk && afterOk) {
      if (b) out.push({ type: 'text', s: b });
      out.push({ type: 'heading', level, text });
      buf = '';
      const lead = after.match(/^\s*\.(?!\.)\s*/);
      if (lead) last += lead[0].length;
    } else {
      // مسافة احتياطية قبل العنوان وبعده حتى لا يلتصق بالكلام
      const sepBefore = before && !/[\s(«"'\[]$/.test(before) ? ' ' : '';
      buf = before + sepBefore + I_OPEN + level + I_SEP + text + I_CLOSE;
      if (after && !/^[\s.،,؛;:!؟?)»"'\]]/.test(after)) buf += ' ';
    }
  }
  const tail = (buf + line.slice(last)).trim();
  if (tail) out.push({ type: 'text', s: tail });
  return out;
}

/** تنظيف HTML صفحة تراث مع الإبقاء على علامات العناوين */
export function cleanHtml(html) {
  let s = String(html || '').replace(/\r\n?/g, '\n');
  // عناوين: <span data-type="title" id="toc-12" data-level="2">...</span> (قد تتداخل)
  s = s.replace(
    /<span[^>]*data-type=["']?title["']?[^>]*>([\s\S]*?)<\/span>(?:\s*<\/span>)*/gi,
    (m, inner) => {
      const lvl = /data-level=["']?(\d)/i.exec(m);
      // عنوانٌ من سطرين (الشاملة: «ترجمة مؤلف…» ثم «شيخ الإسلام…»): سطرٌ واحد، فلا تنفصل علامتاه
      const text = inner.replace(/<[^>]+>/g, '').replace(/\s*\n\s*/g, ' ').trim();
      return `${H_OPEN}${lvl ? lvl[1] : '0'}${H_SEP}${text}${H_CLOSE}`;
    },
  );
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  return s.replace(/[ \t ]+\n/g, '\n');
}

/** تقسيم نص سطري إلى مقاطع: نص عادي، آية ﴿﴾، حديث «» */
export function inlineRuns(text) {
  const runs = [];
  const re = /(\u0004\d\u0005[^\u0006]*\u0006|\u0007[0-9]+\u0008|\u0010[^\u0011\u0012]*\u0011[^\u0012]*\u0012|﴿[^﴾]*﴾|«[^»]*»|\{[^{}\n]{1,2000}\})/g;
  let last = 0;
  let m;
  const plain = (a, b) => {
    const t = stripFmt(text.slice(a, b));
    if (t) runs.push({ k: 't', s: t });
  };
  while ((m = re.exec(text))) {
    if (m.index > last) plain(last, m.index);
    if (m[0][0] === '\u0004') runs.push({ k: 'ht', s: stripFmt(m[0].slice(3, -1)), level: +m[0][1] });
    else if (m[0][0] === '\u0007') runs.push({ k: 'rs', n: m[0].slice(1, -1), s: '(' + m[0].slice(1, -1).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]) + ')' });
    else if (m[0][0] === '\u0010') {
      // نص بتنسيق المؤلف (من ملف Word)
      const cut = m[0].indexOf('\u0011');
      const flags0 = m[0].slice(1, cut);
      // خط المقطع ومقاسه في الملف «[الخط|النسبة]» (يُطبَّق في «كما في الملف»)
      const fm = /\[([^\]|]*)\|?([\d.]*)\]/.exec(flags0);
      const flags = flags0.replace(/\[[^\]]*\]/g, '');
      const col = /c([0-9a-f]{6})/i.exec(flags);
      const rest = flags.replace(/c[0-9a-f]{6}/i, '');
      const r = { k: 'f', s: m[0].slice(cut + 1, -1) };
      if (rest.includes('b')) r.b = 1;
      if (rest.includes('u')) r.u = 1;
      if (col) r.c = '#' + col[1].toLowerCase();
      if (fm && fm[1].trim()) r.ff = fm[1].trim();
      if (fm && +fm[2] > 0) r.fz = Math.min(4, Math.max(0.3, +fm[2]));
      if (r.s) runs.push(r.b || r.u || r.c || r.ff || r.fz ? r : { k: 't', s: r.s });
    } else if (m[0][0] === '{') {
      // الآية بين قوسين معقوفين {…} (كما في كتب «الشاملة» و«تراث»): تصير ﴿…﴾
      const inner = stripFmt(m[0].slice(1, -1)).trim();
      if (/[\u0621-\u064A]/.test(inner)) runs.push({ k: 'q', s: '﴿' + inner + '﴾' });
      else plain(m.index, m.index + m[0].length);
    } else runs.push({ k: m[0][0] === '﴿' ? 'q' : 'h', s: stripFmt(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) plain(last, text.length);
  return runs;
}

/** استخراج المتن المضمَّن بين رمزي الفاصل «ــ ... ــ»، ويعيد مقاطع m (متن) و s (شرح) */
function splitEmbeddedMatn(line, opts, startIn = false) {
  let parts = line.split(MATN_MARK);
  // parts: [before, mark, inside, mark, after, ...]
  // الشرطة الطويلة حول كلمات قليلة اعتراضٌ لا متن: «— رحمه الله —»، «— صلى الله عليه وسلم —»
  for (let i = 1; i + 2 < parts.length; i += 2) {
    if (/^—{1,2}$/.test(parts[i]) && /^—{1,2}$/.test(parts[i + 2]) && parts[i + 1].trim().split(/\s+/).length <= 4) {
      parts = [...parts.slice(0, i - 1), parts[i - 1] + parts[i] + parts[i + 1] + parts[i + 2] + (parts[i + 3] || ''), ...parts.slice(i + 4)];
      i -= 2;
    }
  }
  const segs = [];
  // startIn: السطر تتمةُ متنٍ فُتح قبله ولم يُغلق (انكسر عند آخر الصفحة)، فأوله متن حتى علامة الإغلاق
  let inMatn = !!startIn;
  let found = !!startIn;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) {
      inMatn = !inMatn;
      found = true;
      continue;
    }
    if (!p) continue;
    segs.push({ matn: inMatn, s: p });
  }
  if (!found) {
    return null;
  }
  const out = segs.filter((x) => x.s.trim());
  out.open = inMatn; // بقي المتن مفتوحاً في آخر السطر
  return out;
}

/** «قوله: (...)» — نمط الشروح المشهور لإيراد لفظ المتن */
function splitQawluhu(line) {
  const re = /(قوله|قول المصنف|قال المصنف)(\s*[:：]?\s*)\(([^()]{2,400})\)/g;
  let last = 0;
  let m;
  const segs = [];
  while ((m = re.exec(line))) {
    const pre = line.slice(last, m.index) + m[1] + m[2];
    if (pre) segs.push({ matn: false, s: pre });
    segs.push({ matn: true, s: m[3] });
    last = m.index + m[0].length;
  }
  if (!segs.length) return null;
  if (last < line.length) segs.push({ matn: false, s: line.slice(last) });
  return segs;
}

/** تحويل سطر إلى مقاطع مع الإحالات للحواشي */
function lineToRuns(line, pageNotes, pageId, opts, stats, startIn = false) {
  const segs = (opts.embeddedMarks !== false && splitEmbeddedMatn(line, opts, startIn)) || [{ matn: false, s: line }];
  const runs = [];
  for (const seg of segs) {
    if (seg.matn) stats.matn++;
    let last = 0;
    let m;
    const RE = opts.tokenRefs ? TOKEN_REF_RE : REF_RE;
    RE.lastIndex = 0;
    const src = seg.s;
    const pushText = (t) => {
      if (!t) return;
      for (const r of inlineRuns(t)) runs.push(seg.matn && r.k !== 'ht' ? { k: 'm', s: r.s, q: r.k === 'q' } : r);
    };
    // رقم الآية داخل ﴿…﴾ أو {…} ليس إحالة إلى حاشية
    const inAyah = [];
    for (const q of src.matchAll(/﴿[^﴾]*﴾|\{[^{}]*\}/g)) inAyah.push([q.index, q.index + q[0].length]);
    while ((m = RE.exec(src))) {
      const num = toLatinDigits(m[1] || m[2]);
      const key = `${pageId}:${num}`;
      if (inAyah.some(([x, y]) => m.index > x && m.index < y)) continue;
      if (pageNotes && pageNotes.has(key)) {
        pushText(src.slice(last, m.index));
        runs.push({ k: 'r', id: key, inMatn: seg.matn });
        pageNotes.get(key).used = true;
        last = m.index + m[0].length;
      }
    }
    pushText(src.slice(last));
  }
  const out = mergeRuns(runs);
  out.open = !!segs.open;
  return out;
}

function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    const p = out[out.length - 1];
    if (p && r.k !== 'r' && r.k !== 'ht' && r.k !== 'rs' && r.k !== 'sn' && r.k !== 'f' && p.k === r.k && !!p.q === !!r.q && r.k !== 'q') p.s += r.s;
    else out.push({ ...r });
  }
  return out;
}

function parseVerse(line) {
  // الشطر نص صرف: بلا علامات تنسيق ولا إحالات (حاشية البيت تُلحق بفقرة في صفحته)
  const m = VERSE_RE.exec(stripFmt(line).replace(/\u0007[0-9]+\u0008/g, '').trim());
  if (!m) return null;
  // تجنّب اعتبار سطور النثر الطويلة أبياتاً
  if (line.length > 170) return null;
  return [m[1].trim(), m[2].trim()];
}

/** تحليل قسم الحواشي في صفحة */
/**
 * علامات الإحالة الأخرى تُوحَّد إلى «(١)»: «(^١)» و«[^١]» (صيغة «تراث» الحديثة)، و«^١» وحدها،
 * والأرقام المرفوعة «¹²³» — في النص وفي الحاشية معاً.
 */
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
function refMarks(t) {
  return String(t || '')
    .replace(/([([])\s*\^\s*([0-9٠-٩۰-۹]{1,3})\s*([)\]])/g, '($2)')
    .replace(/\^\s*([0-9٠-٩۰-۹]{1,3})(?![0-9٠-٩۰-۹])/g, '($1)')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3}/g, (m) => '(' + [...m].map((c) => SUP[c]).join('') + ')');
}

/** أرقام الإحالات في نص الصفحة: «(١)» و«[١]» (لتُعرف بها الحواشي المكتوبة في سطر واحد) */
const REF_NUMS = /[([]\s*([0-9٠-٩۰-۹]{1,3})\s*[)\]]/g;
const refNumsOf = (text) => new Set([...String(text || '').matchAll(REF_NUMS)].map((m) => toLatinDigits(m[1])));
// رقم حاشية في وسط السطر: «… انتهى. (٢) أخرجه …»
const INLINE_NOTE = /(^|[\s.،؛:»"'”)\]])[([]\s*([0-9٠-٩۰-۹]{1,3})\s*[)\]]\s*[-–:]?\s*/g;

/**
 * الحاشية بلا خط فاصل: أسطرٌ في آخر الصفحة تبدأ بـ«(١)» وما بعده، وأرقامها مذكورة في النص قبلها.
 * يعيد موضع أول سطر منها (أو -1).
 */
function trailingNotesAt(lines) {
  for (let i = lines.length - 1; i > 0; i--) {
    const m = SHARH_START.exec(lines[i]);
    if (!m || toLatinDigits(m[1]) !== '1') continue;
    const before = lines.slice(0, i).join('\n');
    // (السطر المبدوء بالرقم في النص قائمةٌ لا إحالة: لا يُعدّ)
    const inline = refNumsOf(lines.slice(0, i).map((l) => l.replace(SHARH_START, '')).join('\n'));
    let n = 0;
    let ok = true;
    for (let j = i; j < lines.length; j++) {
      const mm = SHARH_START.exec(lines[j]);
      if (!mm) continue;
      const num = +toLatinDigits(mm[1]);
      if (num !== n + 1 || !inline.has(String(num))) {
        ok = false;
        break;
      }
      n = num;
    }
    if (ok && n >= 1 && before.length > 40) return i;
  }
  return -1;
}

function parseNotes(text, pageId, carry, refs) {
  const notes = new Map();
  const order = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // إن كانت حواشي الصفحة بأقواس «(١)» فالأسطر المبدوءة بـ«١-» قوائم داخل الحاشية لا حواشٍ جديدة
  const strict = lines.some((l) => SHARH_START.test(l));
  let cur = null;
  let continuation = [];
  for (let line of lines) {
    const m = (strict ? SHARH_START : NOTE_START).exec(line);
    if (m) {
      const num = toLatinDigits(m[1] || m[2]);
      const key = `${pageId}:${num}`;
      cur = { id: key, num, lines: [] };
      if (!notes.has(key)) {
        notes.set(key, cur);
        order.push(key);
      }
      line = line.slice(m[0].length);
    }
    // حواشٍ متتالية في سطر واحد: يُفصل عند الرقم التالي إن كان مذكوراً في نص الصفحة
    while (cur && refs && refs.size) {
      INLINE_NOTE.lastIndex = 0;
      let hit = null;
      for (const mm of line.matchAll(INLINE_NOTE)) {
        const n = toLatinDigits(mm[2]);
        if (mm.index > 0 && cur.num != null && +n === +cur.num + 1 && refs.has(n) && !notes.has(`${pageId}:${n}`)) {
          hit = { at: mm.index + mm[1].length, end: mm.index + mm[0].length, n };
          break;
        }
      }
      if (!hit) break;
      cur.lines.push(line.slice(0, hit.at).trim());
      const key = `${pageId}:${hit.n}`;
      cur = { id: key, num: hit.n, lines: [] };
      notes.set(key, cur);
      order.push(key);
      line = line.slice(hit.end);
    }
    const cont = line.replace(/^=\s*/, '').replace(/\s*=$/, '');
    if (cur) cur.lines.push(cont);
    else continuation.push(cont); // تتمة حاشية من الصفحة السابقة
  }
  if (continuation.length && carry) carry.lines.push(...continuation);
  else if (continuation.length) {
    // لا توجد حاشية سابقة: تُعامل كحاشية مستقلة بلا رقم
    const key = `${pageId}:c`;
    notes.set(key, { id: key, num: null, lines: continuation, orphan: true });
    order.push(key);
  }
  return { notes, order };
}

/** تحويل أسطر الحاشية إلى مقاطع: كلام الحاشية الواحدة متصل في فقرة واحدة (لا تُقطع أسطره)،
 *  والأبيات تبقى أبياتاً. أما الشرح (keepParas) فتبقى فقراته كما هي. */
function noteToSegments(lines, keepParas = false) {
  const segs = [];
  for (const l of lines) {
    const line = typeof l === 'string' ? l : l.s;
    const sub = typeof l === 'object' && l.sub;
    const v = parseVerse(line);
    if (v) {
      segs.push({ type: 'verse', parts: v, sub });
      continue;
    }
    const runs = mergeRuns(inlineRuns(line));
    const prev = segs[segs.length - 1];
    if (!keepParas && !sub && prev && prev.type === 'p' && !prev.sub) prev.runs = mergeRuns([...prev.runs, { k: 't', s: ' ' }, ...runs]);
    else segs.push({ type: 'p', runs, sub });
  }
  return segs;
}

/** بيانات الغلاف من حقل info */
export function parseCover(meta = {}, authorName = '') {
  const info = String(meta.info || '');
  const get = (label) => {
    const re = new RegExp(`^\\s*${label}\\s*[:：]\\s*(.*)$`, 'm');
    const m = re.exec(info);
    return m ? m[1].trim() : '';
  };
  const block = (label) => {
    // الحقل قد يكون على سطر واحد أو أسطر تالية حتى الحقل التالي
    const lines = info.split('\n');
    const i = lines.findIndex((l) => new RegExp(`^\\s*${label}\\s*[:：]`).test(l));
    if (i < 0) return '';
    const first = lines[i].replace(new RegExp(`^\\s*${label}\\s*[:：]\\s*`), '').trim();
    const rest = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*[^:：\s][^:：]{0,25}[:：]/.test(lines[j]) || /^\s*\[/.test(lines[j])) break;
      if (lines[j].trim()) rest.push(lines[j].trim());
    }
    return [first, ...rest].filter(Boolean).join(' - ');
  };
  const fullTitle = get('الكتاب') || meta.name || '';
  let title = fullTitle;
  let subtitle = '';
  const sep = fullTitle.match(/^(.+?)\s*[=\-–]\s+(.+)$/);
  if (sep && sep[1].length > 3) {
    title = sep[1].trim();
    subtitle = sep[2].trim();
  }
  let author = get('المؤلف') || authorName || '';
  let authorNote = '';
  const d = author.match(/\((ت\s*[^)]+)\)\s*$/);
  if (d) {
    authorNote = `(${d[1]})`;
    author = author.slice(0, d.index).trim();
  }
  const editor =
    block('المحقق') || block('تحقيق') || block('حققه') || block('عني به') || block('دراسة وتحقيق') || block('ضبطه');
  const editorLabel = block('عني به') && !block('المحقق') && !block('تحقيق') ? 'عُني به' : 'تحقيق';
  return {
    title,
    subtitle,
    author,
    authorNote,
    editor,
    editorLabel,
    publisher: get('الناشر'),
    edition: (() => {
      const e = get('الطبعة');
      return e && !/^الطبعة/.test(e) ? 'الطبعة ' + e : e;
    })(),
  };
}

/* ====================================================================== */
/* أدوات مساعدة لنوع «المتن في أعلى الصفحة ثم ــ ثم الشرح» وللمقدّمات     */
/* ====================================================================== */

// سطر فاصل المتن عن الشرح: «ــ» وحده، أو في آخر سطر المتن
const SPLIT_LINE = /^\s*ـ{2,}\s*$/;
// متن مميَّز برمز في أول السطر: «* قوله: "…"» (مثل شرح الواسطية للعثيمين)
const STAR_MATN = /^\s*[*※•◘❖■✱⁕✽❋]\s*(?=\S)/;
// سطر «شرح» وحده (بلا شيء أو بين قوسين أو علامتين، وقد يكون عنواناً في «تراث»): يبدأ الشرح بعده، وما قبله متن
const SHARH_LABEL = { test: (l) => isSharhLabel(l) };
const SHARH_START = /^\s*[([]\s*([0-9٠-٩]{1,3})\s*[)\]]\s*[-–:]?\s*/;
// سطر زخرفة وحده «* * *»: نهاية فصل أو باب (ثلاث علامات فأكثر ولا شيء غيرها)
const ORN_LINE = /^[\s*✽❋✱⁕※•·٭✲✳❉❈⋆✦✧]+$/;
const isOrnLine = (l) => ORN_LINE.test(l) && (l.match(/[^\s]/g) || []).length >= 3;
const SPLIT_TAIL = /\s+ـ{2,}\s*$/;
const DOTS_ONLY = /^[\s.…·،]*$/;
const DOT_LEADER = /(?:\s*[.…·]){3,}\s*$/;

// الفاصل كما يُكتب خطأً أحياناً: «ــ.» و«ـتـ» و«ـتت» (سطرٌ قصيرٌ من التطويل وحده)
const SPLIT_FUZZY = /^\s*(?=[ـت.]{2,5}\s*$)(?=[^ـ]*ـ)(?:ـ[ـت.]+|تـ[ـت.]*)\s*$/;
const isSplitLine = (l) => SPLIT_LINE.test(l) || SPLIT_FUZZY.test(l);
// آخر المتن نقاطٌ متتالية («… الإنسان.....» أو «… (٣) . . . . .»): كنايةٌ عن خط الفصل، وقد لا يليها «ــ»
const MATN_DOTS_END = /[^\s.…·](?:[\s.…·]*[.…·]){3,}\s*$/;
/**
 * موضع الفاصل في أسطر الصفحة: { i, tail, next } أو null (next: أول سطرٍ بعد الفاصل)
 * dots: في كتابٍ من هذا النوع، السطر الذي ينتهي بنقاطٍ آخرُ المتن وإن لم يكن بعده «ــ»
 */
function findSplit(lines, from = 0, dots = false) {
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (isSplitLine(l)) return { i, tail: false, next: i + 1 };
    if (SPLIT_TAIL.test(l) && (l.match(/ـ{2,}/g) || []).length === 1) return { i, tail: true, next: i + 1 };
    if (dots && i + 1 < lines.length && MATN_DOTS_END.test(l)) return { i, tail: true, next: isSplitLine(lines[i + 1]) ? i + 2 : i + 1 };
  }
  return null;
}

// مقدمة الكتاب: اسم الكتاب والمؤلف والمحقق في أول الصفحات تُحذف آلياً (الغلاف يُبنى من البيانات)
const CREDIT =
  /^(?:تأليف|تصنيف|تألیف|جمع(?:ه)?|لمؤلفه|للإمام|للشيخ|للعلامة|للحافظ|تحقيق|حققه|وحققه|تحقيق وتعليق|تحقيق وتخريج|دراسة وتحقيق|عني به|عنى به|اعتنى به|بعناية|بقلم|ضبطه|ضبط نصه|راجعه|قدم له|تقديم|المؤلف|المحقق|الناشر|الطبعة|خرج أحاديثه|خرّج أحاديثه|علق عليه|تعليق)(?:\s|:|$)/;

/** light (ملفات Word): العنوان لا يُحذف بكلمة («تقديم»، «تعليق»…) بل بمطابقة اسم الكتاب أو المؤلف، وسطر البيانات قصير */
function isFrontMatterLine(line, info, light = false, heading = false) {
  const t = stripFmt(line).replace(/[\u0001-\u0008]/g, '').trim();
  if (!t) return true;
  if (DOTS_ONLY.test(t)) return true;
  if (t.length > 160) return false;
  const n = normalizeArabic(t);
  if (!n) return true;
  if (CREDIT.test(t)) {
    if (!light) return true;
    // ملف Word: سطر بيانات قصير («تأليف: فلان»، «تحقيق فلان الفلاني») لا عنوان ولا فقرة
    if (!heading && t.length <= 60 && (/[:：]/.test(t) || t.split(/\s+/).length <= 6)) return true;
  }
  if (/^رحمه(ما|م)? الله/.test(t) && t.length < 30) return true;
  for (const name of info.names) {
    if (name.length > 5 && (n === name || (n.includes(name) && n.length < name.length + 25))) return true;
  }
  for (const title of info.titles) {
    if (!title) continue;
    if (n === title) return true;
    if (title.length > 6 && (title.includes(n) || n.includes(title)) && Math.min(n.length, title.length) / Math.max(n.length, title.length) > 0.55) return true;
    if (matchScore(t, title) >= 0.95 && n.length <= title.length * 1.4) return true;
  }
  return false;
}

// إحالات الحواشي بلا أقواس: «الكلمة1» أو «الكلمة 1»
const NO_REF_BEFORE = /(?:ص|ج|ق|الآية|آية|رقم|برقم|سنة|عام|حديث|ط|الطبعة|المجلد|الجزء|سورة|باب|[0-9٠-٩\/\\\-:.])\s*$/;
function linkBareRefs(pieces, pageNotes, pageId) {
  if (!pageNotes || !pageNotes.size) return;
  const allText = pieces.filter((p) => p.type === 'text').map((p) => p.s).join('\n');
  const nums = [...pageNotes.values()]
    .map((n) => n.num)
    .filter((n) => n && /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => a - b);
  let cursorPiece = 0;
  let cursorPos = 0;
  for (const n of nums) {
    // موجود بأقواس؟ فلا حاجة
    const east = String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
    if (new RegExp(`[([](?:${n}|${east})[)\\]]`).test(allText)) continue;
    const re = new RegExp(`(^|[^0-9٠-٩])(${n}|${east})(?![0-9٠-٩/])`, 'g');
    let found = false;
    for (let pi = cursorPiece; pi < pieces.length && !found; pi++) {
      const p = pieces[pi];
      if (p.type !== 'text') continue;
      re.lastIndex = pi === cursorPiece ? cursorPos : 0;
      let m;
      while ((m = re.exec(p.s))) {
        const at = m.index + m[1].length;
        const before = p.s.slice(Math.max(0, at - 14), at);
        const after = p.s.slice(at + m[2].length, at + m[2].length + 3);
        // يجب أن يسبقه حرف عربي أو علامة ترقيم (ملتصق أو بمسافة)، وألا يكون ضمن تاريخ أو إحالة مرجعية
        if (!/[ء-يً-ْٰ»"')\].،؛:!؟]\s?$/.test(before) || NO_REF_BEFORE.test(before.replace(/\s+$/, ''))) continue;
        if (/^\s*(هـ|م\b|\/)/.test(after)) continue;
        const openB = (before.match(/[([]/g) || []).length > (before.match(/[)\]]/g) || []).length;
        if (openB) continue;
        const pre = p.s.slice(0, at).replace(/\s+$/, '');
        const token = `\u0007${n}\u0008`;
        p.s = pre + token + p.s.slice(at + m[2].length);
        cursorPiece = pi;
        cursorPos = pre.length + token.length;
        found = true;
        break;
      }
    }
  }
}

/**
 * تحليل مجلد كامل.
 * @param {object} book  { meta, indexes } من /book
 * @param {Array} pages  [{ page_id, text, meta }] مرتبة
 * @param {object} opts  { mergeBrokenParagraphs, matnQawluhu, layout: 'auto'|'split'|'plain', stripFrontMatter }
 *   ولكتب ملفات Word (book.parse من المستورد): unitPages (كل متن وشرحه في صفحته)، tokenRefs (الإحالات علامات)، lightFront،
 *   bracketHeads، starMatn، embeddedMarks، fileToc، tocTitle
 */
export function parseVolume(book, pages, opts = {}) {
  const o = { mergeBrokenParagraphs: true, matnQawluhu: true, layout: 'auto', stripFrontMatter: true, ...opts };
  const headingsByPage = new Map();
  for (const h of book?.indexes?.headings || []) {
    if (!headingsByPage.has(h.page)) headingsByPage.set(h.page, []);
    headingsByPage.get(h.page).push(h);
  }
  const cover = parseCover(book?.meta || {});
  const front = {
    titles: [cover.title, book?.meta?.name, cover.subtitle ? cover.title + ' ' + cover.subtitle : '']
      .filter(Boolean)
      .map((t) => normalizeArabic(t.replace(/\s*[-–=]\s*ط\s.*$/, ''))),
    names: [cover.author, ...String(cover.editor || '').split(/\s+-\s+/)].filter(Boolean).map(normalizeArabic),
  };

  // ١) تنظيف الصفحات وفصل قسم الحواشي (_____)
  const pre = pages.map((pg) => {
    const raw0 = refMarks(cleanHtml(pg.text));
    let raw = raw0;
    // حاشية بلا خط فاصل (في بعض صفحات «تراث»): تُعرف بأرقامها المذكورة في النص قبلها، فيُوضع الخط
    if (!FOOT_SEP.test(raw0) && o.layout !== 'split') {
      const ls = raw0.split('\n');
      const nonEmpty = ls.map((l, i) => [l.trim(), i]).filter(([l]) => l);
      // (ولا في صفحةٍ ينتهي متنها بنقاطٍ: ما بعدها شرحٌ مرقّم لا حواشٍ)
      if (!nonEmpty.some(([l]) => isSplitLine(l) || SPLIT_TAIL.test(l) || MATN_DOTS_END.test(l))) {
        const at = trailingNotesAt(nonEmpty.map(([l]) => l));
        if (at > 0) {
          const li = nonEmpty[at][1];
          raw = ls.slice(0, li).join('\n') + '\n__________\n' + ls.slice(li).join('\n');
        }
      }
    }
    const cut = FOOT_SEP.exec(raw);
    const body = cut ? raw.slice(0, cut.index) : raw;
    // علامات الأسطر (ملفات Word): تُرفع عن السطر وتُحفظ خصائصه بنصه، وسطر العنصر (صورة، جدول) يبقى علامةً وحدها
    const marks = (pg.meta && pg.meta.marks) || null;
    const markQ = new Map();
    const lines = body
      .split('\n')
      .map((l) => {
        let t = l.replace(/[ \t ]+/g, ' ').trim();
        const m = MARK_RE.exec(t);
        const mk = m && marks ? marks[m[1]] : null;
        if (mk && mk.obj) return m[0];
        if (m) t = t.slice(m[0].length).trim();
        // في صفحة فيها علامات: لكل سطر دوره (سطران متطابقان لكلٍّ علامته أو لا علامة)
        if (marks && t) {
          if (!markQ.has(t)) markQ.set(t, []);
          markQ.get(t).push(mk || null);
        }
        return t;
      })
      .filter(Boolean);
    return { pg, lines, marks, markQ, notesText: cut ? raw.slice(cut.index + cut[0].length) : '' };
  });

  // ٢) نوع الكتاب: هل المتن في أعلى الصفحات يفصله «ــ» عن الشرح؟
  const textPages = pre.filter((p) => p.lines.length).length;
  const splitPages = pre.filter((p) => findSplit(p.lines)).length;
  const isSplit = o.layout === 'split' || (o.layout !== 'plain' && splitPages >= Math.max(3, Math.ceil(textPages * 0.25)));
  // أسطر متتالية يبدأ كلٌّ منها برمز («* العموم والخصوص» ثم «* أو: من وجه») قائمةٌ مسرودة لا متن:
  // يُعرف المتن الذي يسبقه رمز بأنه سطرٌ وحده بين فقرات الشرح. والقائمة قد تستمر من آخر صفحة إلى أول التي بعدها.
  let prevListTail = false;
  for (const p of pre) {
    p.listSet = new Set();
    const ls = p.lines;
    for (let i = 0; i < ls.length; i++) {
      if (!STAR_MATN.test(ls[i])) continue;
      const near = (i > 0 && STAR_MATN.test(ls[i - 1])) || (i + 1 < ls.length && STAR_MATN.test(ls[i + 1])) || (i === 0 && prevListTail);
      if (near) p.listSet.add(ls[i]);
    }
    prevListTail = ls.length > 0 && p.listSet.has(ls[ls.length - 1]);
  }
  let starLines = 0;
  let labelLines = 0;
  for (const p of pre) for (const l of p.lines) {
    if (STAR_MATN.test(l) && !p.listSet.has(l) && l.replace(STAR_MATN, '').length > 8) starLines++;
    if (SHARH_LABEL.test(l)) labelLines++;
  }
  // المتن المضمَّن «ــ متن ــ»: لا يُعتدّ به إلا إذا تكرر؛ فشرطة عارضة (—) في كتاب لا متن فيه (كالتفاسير) ليست متناً
  // (ملفات Word تكتب علاماتها بنفسها، فتبقى كما هي)
  if (o.embeddedMarks === undefined && !o.unitPages && !o.tokenRefs && !isSplit) {
    let all = 0;
    let marked = 0;
    for (const p of pre) for (const l of p.lines) {
      all++;
      if (MATN_MARK.test(l) && !SPLIT_LINE.test(l) && (splitEmbeddedMatn(l) || []).some((x) => x.matn)) marked++;
    }
    if (marked < 2 || marked < all * 0.01) o.embeddedMarks = false;
  }
  const isStar = !isSplit && o.starMatn !== false && starLines >= 3; // متن يسبقه رمز
  const isLabel = !isSplit && labelLines >= 2; // «شرح:» يتكرر

  const blocks = [];
  const notes = {};
  const stats = { pages: pages.length, notes: 0, headings: 0, matn: 0, verses: 0, sharh: 0, layout: isSplit ? 'split' : 'plain', frontMatterRemoved: 0 };
  let lastNote = null; // تتمة الحاشية في الصفحة التالية
  let seenSplit = false; // ظهر فاصل المتن عن الشرح في صفحةٍ سابقة
  let lastSharhPara = null;
  let pendingMerge = false;
  // متنٌ مضمَّن (بين «ــ … ــ») لم يُغلق في آخر السطر: يستمر في السطر التالي أو في أول الصفحة التالية
  let matnOpen = false;
  let frontDone = !o.stripFrontMatter;

  pre.forEach(({ pg, lines, marks, markQ, notesText, listSet }, pageIndex) => {
    const pageId = pg.page_id;
    /** خصائص السطر (من علامته) — مرة واحدة لكل سطر */
    const takeMark = (line) => {
      const q = markQ.size ? markQ.get(line) : null;
      return q && q.length ? q.shift() : null;
    };
    /** عنصر السطر: صورة، جدول، صفحة غلاف، خط */
    const objOf = (line) => {
      const m = OBJ_LINE.exec(line);
      const ob = m && marks && marks[m[1]] && marks[m[1]].obj;
      return ob && typeof ob === 'object' && ['image', 'table', 'coverpage', 'pagefig', 'hr', 'pagebreak'].includes(ob.type) ? ob : null;
    };
    const printed = pg.meta?.page ?? null;
    const pageHeads = (headingsByPage.get(pageId) || []).slice();
    const headNorm = pageHeads.map((h) => normalizeArabic(cleanHeading(h.title)));
    const resolveLevel = (text, lvl) => {
      const idx = headNorm.indexOf(normalizeArabic(text));
      if (idx >= 0) {
        lvl = lvl || pageHeads[idx].level;
        headNorm[idx] = null;
      }
      return Math.min(Math.max(lvl || 2, 1), 4);
    };

    // تقسيم الصفحة: متن أعلى / شرح / حاشية
    let matnLines = lines;
    let sharhLines = [];
    let hashiaText = notesText;
    const sp = isSplit ? findSplit(lines, 0, true) : null;
    if (sp) {
      matnLines = lines.slice(0, sp.i);
      if (sp.tail) matnLines.push(lines[sp.i].replace(SPLIT_TAIL, ''));
      const rest = lines.slice(sp.next);
      // فاصل ثانٍ في الصفحة نفسها = بداية الحاشية (خطأ شائع في تراث)
      const sp2 = findSplit(rest);
      if (sp2) {
        sharhLines = rest.slice(0, sp2.i);
        if (sp2.tail) sharhLines.push(rest[sp2.i].replace(SPLIT_TAIL, ''));
        hashiaText = rest.slice(sp2.i + 1).join('\n') + (hashiaText ? '\n' + hashiaText : '');
      } else sharhLines = rest;
      // (في «تراث» النقاط آخر المتن علامة استكماله؛ وفي ملف Word هي من نص المؤلف)
      if (!o.unitPages)
        matnLines = matnLines
          .filter((l) => !DOTS_ONLY.test(l))
          .map((l) => l.replace(DOT_LEADER, '').trim())
          .filter((l) => l && !DOTS_ONLY.test(l));
    } else if (isSplit && lines.length && seenSplit) {
      // صفحة بلا فاصل بعد أن بدأ المتن والشرح: كلها تتمة شرح (المتن الطويل يُشرح في صفحات)،
      // فتتصل جملتها الأولى بآخر جملةٍ في الصفحة السابقة. (وما قبل أول فاصلٍ في الكتاب نصٌّ عادي: المقدمة)
      matnLines = [];
      sharhLines = DOTS_ONLY.test(lines[0]) ? lines.slice(1) : lines;
    }
    if (sp) seenSplit = true;

    // الحواشي الحقيقية
    const { notes: pageNotes, order } = parseNotes(hashiaText, pageId, isSplit ? null : lastNote, refNumsOf([...matnLines, ...sharhLines].join('\n')));
    for (const key of order) if (!pageNotes.get(key).orphan) lastNote = pageNotes.get(key);

    // أجزاء المتن (عناوين/نص)
    const pieces = [];
    for (const line of matnLines) {
      if (OBJ_LINE.test(line)) {
        const ob = objOf(line);
        if (ob) pieces.push({ type: 'obj', ob });
        continue;
      }
      const mk = takeMark(line);
      if (line.includes(H_OPEN)) pieces.push(...splitHeadings(line, resolveLevel).map((x) => (mk ? { ...x, mk } : x)));
      else pieces.push(mk ? { type: 'text', s: line, mk } : { type: 'text', s: line });
    }

    // حذف اسم الكتاب والمؤلف والمحقق من أول الكتاب
    if (!frontDone) {
      let removed = 0;
      let i0 = 0;
      while (i0 < pieces.length) {
        const p0 = pieces[i0];
        // صورة أو جدول بين أسطر العنوان: يبقى، ويستمر الحذف بعده
        if (p0.type === 'obj') {
          i0++;
          continue;
        }
        const txt = p0.type === 'heading' ? p0.text : p0.s;
        if (!isFrontMatterLine(txt, front, !!o.lightFront, p0.type === 'heading')) break;
        pieces.splice(i0, 1);
        removed++;
      }
      stats.frontMatterRemoved += removed;
      if (i0 < pieces.length || pageIndex >= 2) frontDone = true;
    }

    // الإحالات بلا أقواس (١ بدلاً من (١))
    if (!sp && !o.tokenRefs) linkBareRefs(pieces, pageNotes, pageId);

    const sharhNums = new Set(sharhLines.map((l) => (SHARH_START.exec(l) || [])[1]).filter(Boolean).map(toLatinDigits));
    // ---- أجزاء المتن (والنص العادي) ----
    let firstBlockOnPage = true;
    const matnRefRe = /[ \t]*[([]([0-9٠-٩]{1,3})[)\]]/g;
    /**
     * علامة «شرح»: ما قبلها متن، وما بعدها شرح.
     * المتن كل ما بين العلامة وأقرب عنوان (باب، فصل) أو زخرفة «* * *» قبلها؛ فإن كان قبلها شرحٌ سابق
     * (علامة «شرح» أخرى) فلا يُعرف أين انتهى، فالمتن ما قبلها مباشرة: فقرة، أو أبيات متتالية.
     */
    const pushLabel = (text) => {
      const run = [];
      let k = blocks.length - 1;
      for (; k >= 0 && run.length < 40; k--) {
        const b = blocks[k];
        if ((b.type === 'para' || b.type === 'verse') && !b.mt && !b.sh) run.unshift(b);
        else break;
      }
      const stop = k >= 0 ? blocks[k] : null;
      const bounded = stop && (stop.type === 'heading' || stop.type === 'hr');
      let take = [];
      if (bounded) take = run;
      else if (run.length) {
        const last = run[run.length - 1];
        if (last.type === 'verse') for (let j = run.length - 1; j >= 0 && run[j].type === 'verse'; j--) take.unshift(run[j]);
        else take = [last];
      }
      if (take.length) {
        for (const b of take) b.mt = true;
        stats.matn++;
      }
      const clean = String(text).replace(/\u0001\d?\u0002?|\u0002|\u0003/g, ' ').replace(/\s+/g, ' ').trim();
      blocks.push({ type: 'label', text: clean, pageId, strong: isLabel });
      stats.labels = (stats.labels || 0) + 1;
      pendingMerge = false;
          matnOpen = false;
      firstBlockOnPage = false;
    };
    const pushPieces = () => {
      for (const piece of pieces) {
        const mk = piece.mk || null;
        const al = mk && /^[clr]$/.test(mk.al || '') ? mk.al : '';
        if (piece.type === 'obj') {
          blocks.push({ ...piece.ob, pageId, ...(sp ? { mt: true } : {}) });
          stats.objects = (stats.objects || 0) + 1;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        if (piece.type === 'heading' && (isLabel || isStar) && SHARH_LABEL.test(piece.text)) {
          pushLabel(piece.text);
          continue;
        }
        if (piece.type === 'heading') {
          blocks.push({ type: 'heading', level: piece.level, text: stripFmt(piece.text), pageId, printed, ...(al ? { al } : {}), ...(mk && mk.nt ? { nt: true } : {}) });
          stats.headings++;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        const line = piece.s;
        // «* * *» وحده: نهاية فصل؛ يبقى زخرفة في الكتاب، وبعده متن جديد
        if (isOrnLine(line)) {
          blocks.push({ type: 'hr', pageId });
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        // «شرح» وحده في سطر: علامة بدء الشرح، وما قبله مباشرة متن (قبل فحص العناوين: «(شرح)» ليس عنواناً)
        if ((isLabel || isStar) && SHARH_LABEL.test(line)) {
          pushLabel(line);
          continue;
        }
        const ni = headNorm.indexOf(normalizeArabic(cleanHeading(line)));
        if ((ni >= 0 && line.length < 160) || (o.bracketHeads !== false && isBracketHeading(line))) {
          const level = ni >= 0 ? Math.min(Math.max(pageHeads[ni].level, 1), 4) : 3;
          if (ni >= 0) headNorm[ni] = null;
          blocks.push({ type: 'heading', level, text: cleanHeading(line), pageId, printed });
          stats.headings++;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        const verse = parseVerse(line);
        if (verse && (!sp || o.unitPages)) {
          // في صفحة «متن ثم شرح» من ملف Word: أبيات المتن (المنظومات) تبقى أبياتاً
          blocks.push({ type: 'verse', parts: verse, pageId, ...(sp ? { mt: true } : {}) });
          if (sp) stats.matn++;
          stats.verses++;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        if (sp) {
          // المتن: أرقامه «(١)» تبقى كما في الكتاب علامةً على موضع الشرح
          let runs = mergeRuns(inlineRuns(o.tokenRefs ? line : line.replace(matnRefRe, (m, d) => `\u0007${toLatinDigits(d)}\u0008`)));
          // ملف Word: علامة الإحالة في المتن حاشية حقيقية في صفحته، و«(١)» المكتوبة تبقى نصاً
          if (o.tokenRefs) {
            runs = runs.map((r) => {
              const key = `${pageId}:${r.n}`;
              if (r.k !== 'rs' || !pageNotes.has(key)) return r;
              pageNotes.get(key).used = true;
              return { k: 'r', id: key };
            });
          }
          if (runs.length) {
            blocks.push({ type: 'para', runs, pageId, mt: true, ...(al ? { al } : {}), ...(mk && +mk.fz ? { fz: +mk.fz } : {}) });
            stats.matn++;
          }
          firstBlockOnPage = false;
          continue;
        }
        // بندٌ من قائمة مسرودة بالرموز: فقرة عادية برمزها كما كُتب (لا متن، ولا تُضمّ إلى ما قبلها)
        if (listSet && listSet.has(line)) {
          const runs = lineToRuns(line, pageNotes, pageId, o, stats);
          blocks.push({ type: 'para', runs, pageId, li: true, ...(al ? { al } : {}) });
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        // متن يسبقه رمز «*»
        if (isStar && STAR_MATN.test(line)) {
          const runs = lineToRuns(line.replace(STAR_MATN, ''), pageNotes, pageId, o, stats);
          blocks.push({ type: 'para', runs, pageId, mt: true, star: true });
          stats.matn++;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        // تتمة متنٍ لم يُغلق: في سطرٍ فيه علامة إغلاقه، أو في أول الصفحة التالية تتمةً لفقرتها
        const prevB = blocks[blocks.length - 1];
        const contMerge = firstBlockOnPage && pendingMerge && prevB && prevB.type === 'para' && !prevB.mt && !prevB.sh;
        const startIn = matnOpen && o.embeddedMarks !== false && (MATN_MARK.test(line) || contMerge);
        const runs = lineToRuns(line, pageNotes, pageId, o, stats, startIn);
        matnOpen = !!runs.open;
        // فقرة كلها متن (عريضة أو ملوّنة في ملف Word)
        if (mk && mk.mt) {
          blocks.push({ type: 'para', runs, pageId, mt: true, ...(al ? { al } : {}), ...(mk && +mk.fz ? { fz: +mk.fz } : {}) });
          stats.matn++;
          pendingMerge = false;
          matnOpen = false;
          firstBlockOnPage = false;
          continue;
        }
        const prev = blocks[blocks.length - 1];
        // أسطر المتن المميَّز التي تليه قبل «شرح:» جزء منه
        if (isStar && prev && prev.star && prev.pageId === pageId && pieces.slice(pieces.indexOf(piece) + 1, pieces.indexOf(piece) + 4).some((q) => q.type === 'text' && SHARH_LABEL.test(q.s))) {
          prev.runs = mergeRuns([...prev.runs, { k: 't', s: ' ' }, ...runs]);
          firstBlockOnPage = false;
          continue;
        }
        if (firstBlockOnPage && pendingMerge && prev && prev.type === 'para' && !prev.mt && !prev.sh) {
          // المسافة بين جزأي متنٍ انكسر عند آخر الصفحة من المتن نفسه
          const lastK = (prev.runs.filter((r) => r.k !== 'r').pop() || {}).k;
          const firstK = (runs.find((r) => r.k !== 'r') || {}).k;
          prev.runs = mergeRuns([...prev.runs, lastK === 'm' && firstK === 'm' ? { k: 'm', s: ' ', q: false } : { k: 't', s: ' ' }, ...runs]);
        } else {
          blocks.push({ type: 'para', runs, pageId, ...(al ? { al } : {}), ...(mk && +mk.fz ? { fz: +mk.fz } : {}) });
        }
        firstBlockOnPage = false;
        pendingMerge = o.mergeBrokenParagraphs && !TERMINAL.test(line);
      }
    };

    // ---- الشرح: نص عادي بعد خط، يبدأ كل عنصر برقمه «(١)» ؛ وحواشيه هي الحواشي الحقيقية ----
    const runsText = (runs) => runs.map((r) => r.s || '').join('');
    const pushSharh = (sl, allowMerge) => {
      let first = true;
      for (let line of sl) {
        if (OBJ_LINE.test(line)) {
          const ob = objOf(line);
          if (ob) blocks.push({ ...ob, pageId, sh: true });
          first = false;
          continue;
        }
        const mk = takeMark(line);
        const al = mk && /^[clr]$/.test(mk.al || '') ? mk.al : '';
        // عنوانٌ وحده في سطره من الشرح: يبقى عنواناً (لا كلماتٍ عريضة في فقرة)
        const hOnly = new RegExp(`^${H_OPEN}(\\d)${H_SEP}([\\s\\S]*?)${H_CLOSE}$`).exec(line);
        if (hOnly && cleanHeading(hOnly[2])) {
          const text = cleanHeading(hOnly[2]);
          blocks.push({ type: 'heading', level: resolveLevel(text, +hOnly[1] || 0), text: stripFmt(text), pageId, printed });
          stats.headings++;
          first = false;
          continue;
        }
        line = line.replace(new RegExp(`${H_OPEN}\\d${H_SEP}([\\s\\S]*?)${H_CLOSE}`, 'g'), (m, t) => `${I_OPEN}3${I_SEP}${cleanHeading(t)}${I_CLOSE}`);
        const m = SHARH_START.exec(line);
        let numRun = null;
        if (m) {
          line = line.slice(m[0].length);
          numRun = { k: 'sn', s: '(' + m[1].replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]) + ')' };
          stats.sharh++;
        }
        // البيت أولاً: لا إحالة داخل شطره (يبقى رقمها كما كُتب)
        const v0 = !numRun && parseVerse(line.replace(/\u0007[0-9]+\u0008/g, ''));
        // إحالات حاشية الشرح
        if (!v0 && !o.tokenRefs)
          line = line.replace(/[ \t]*[([]([0-9٠-٩]{1,3})[)\]]/g, (mm, d) => {
            const k = `${pageId}:${toLatinDigits(d)}`;
            if (pageNotes.has(k)) {
              pageNotes.get(k).used = true;
              return `\u0007${toLatinDigits(d)}\u0008`;
            }
            return mm;
          });
        if (!numRun) {
          const v = v0;
          if (v) {
            blocks.push({ type: 'verse', parts: v, pageId, sh: true });
            stats.verses++;
            first = false;
            continue;
          }
        }
        // ملف Word: المتن المضمَّن في شرحه بين «ــ ــ» (يكتبها المستورد لما كان عريضاً أو ملوّناً أو بين قوسين)
        const esegs = (o.unitPages && o.embeddedMarks !== false && splitEmbeddedMatn(line, o)) || [{ matn: false, s: line }];
        let runs = esegs.flatMap((sg) => {
          if (sg.matn) stats.matn++;
          return inlineRuns(sg.s).map((r) => {
            if (r.k === 'rs' && pageNotes.has(`${pageId}:${r.n}`)) {
              pageNotes.get(`${pageId}:${r.n}`).used = true;
              return { k: 'r', id: `${pageId}:${r.n}`, ...(sg.matn ? { inMatn: true } : {}) };
            }
            return sg.matn && r.k !== 'ht' && r.k !== 'rs' ? { k: 'm', s: r.s, q: r.k === 'q' } : r;
          });
        });
        if (numRun) runs = [numRun, { k: 't', s: ' ' }, ...runs];
        runs = mergeRuns(runs);
        const last = blocks[blocks.length - 1];
        if (allowMerge && first && !numRun && last && last === lastSharhPara && !TERMINAL.test(runsText(last.runs))) {
          // تتمة جملة الشرح من الصفحة السابقة
          last.runs = mergeRuns([...last.runs, { k: 't', s: ' ' }, ...runs]);
        } else {
          const blk = { type: 'para', runs, pageId, sh: true, ...(al ? { al } : {}), ...(mk && +mk.fz ? { fz: +mk.fz } : {}) };
          blocks.push(blk);
          lastSharhPara = blk;
        }
        first = false;
      }
    };

    const hasMatn = !!sp && pieces.some((p) => (p.type === 'text' && p.s.trim()) || p.type === 'obj');
    // عنوان أعلى الصفحة بلا متن جديد: ما تحته من الشرح يبدأ تحت العنوان
    const startsNewSection = pieces.some((p) => p.type === 'heading') && !hasMatn;
    const firstNum = sharhLines.findIndex((l) => SHARH_START.test(l));
    const contLines = firstNum < 0 ? sharhLines : sharhLines.slice(0, firstNum);
    const itemLines = firstNum < 0 ? [] : sharhLines.slice(firstNum);
    const rule = () => blocks.push({ type: 'rule', pageId });

    if (!isSplit || (!sp && !sharhLines.length)) pushPieces();
    else if (o.unitPages) {
      // ملف Word: الصفحة متن واحد وشرحه كله (لا تتمة من صفحة سابقة)
      pushPieces();
      if (hasMatn && sharhLines.length) rule();
      pushSharh(sharhLines, false);
    } else if (startsNewSection) {
      pushPieces();
      pushSharh(contLines, false);
      pushSharh(itemLines, false);
    } else if (hasMatn && !itemLines.length) {
      // شرح غير مرقم يلي متناً جديداً
      pushPieces();
      if (contLines.length) rule();
      pushSharh(contLines, false);
    } else {
      // ما قبل أول رقم تتمةٌ لشرح الصفحة السابقة، ثم المتن الجديد، ثم خط، ثم شرحه
      pushSharh(contLines, true);
      pushPieces();
      if (hasMatn && itemLines.length) rule();
      pushSharh(itemLines, false);
    }
    if (firstBlockOnPage) pendingMerge = false;
    if (sp) pendingMerge = false;

    // الحواشي العادية
    for (const key of order) {
      const n = pageNotes.get(key);
      if (!n.lines.length) continue;
      notes[key] = { id: key, kind: 'fn', _src: n };
      stats.notes++;
      if (!n.used) {
        const target = [...blocks].reverse().find((b) => b.type === 'para' && b.pageId === pageId);
        if (target) target.runs.push({ k: 'r', id: key });
        else blocks.push({ type: 'para', runs: [{ k: 'r', id: key }], pageId, noteHolder: true });
      }
    }
  });

  for (const k of Object.keys(notes)) {
    const src = notes[k]._src;
    notes[k].segs = noteToSegments(src.lines);
    delete notes[k]._src;
  }
  stats.bookType = isSplit ? 'split' : isStar ? 'star' : isLabel ? 'label' : 'plain';
  stats.keywords = markKeywords(blocks);
  if (o.quran) stats.quran = markQuran(blocks, o.quran);
  stats.quotedMatn = markQuotedMatn(blocks, o);
  // المتون: ترقيم الملف في الأبيات يُحذف (ويُحفظ رقم البيت)
  let nums = null;
  if (o.mutunNums) {
    nums = srcVerseNumbers(blocks);
    stats.srcNums = nums.stripped;
  }
  // المتون: أدوار القطع كما تُفهم من ترتيب الصفحة («قال …»، عنوان التعليق وسطوره، اسم الكتاب أعلى الصفحات)،
  // وأرقام الأبيات كما كانت فيه (رقم البيت بين الشطرين أو بجانبه، والعدّ)
  if (o.mutunRead) {
    const r = readMutunBlocks(blocks);
    if (nums && nums.positions && nums.positions.length) {
      r.settings.mNum = nums.origMid ? 'mid' : 'side';
      r.settings.mSeq = nums.seq ? 'side' : 'off';
      r.nums = 1;
    }
    if (r.intros || r.labels || r.heads || r.nums) stats.mread = r;
  }
  return { blocks, notes, stats, layout: isSplit ? 'split' : 'plain', ...(o.fileToc ? { fileToc: true, tocTitle: String(o.tocTitle || '').slice(0, 60) } : {}) };
}

/* ====================================================================== */
/* «مسألة:» و«تنبيه:» تُكتبان كما هما: في سطرٍ وحدها تصير «مسألة:» عنواناً رابعاً و«تنبيه:» عنواناً صغيراً
   (عريضاً بلون العناوين)؛ وإن تلاها نصٌّ في سطرها بقيت معه، والكلمة وحدها عريضة بلون العناوين. */
const KEYWORD = /^(\s*)((?:مسأل[ةه]|تنبي[هة])[\u064B-\u0652]*\s*[:：])/;
const bareKw = (s) => s.replace(/[\u064B-\u0652\u0640]/g, '');
function markKeywords(blocks) {
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== 'para' || b.mt || !b.runs || !b.runs.length) continue;
    const first = b.runs[0];
    if (!first || first.k !== 't') continue;
    const m = KEYWORD.exec(first.s);
    if (!m) continue;
    const word = m[2].trim();
    const rest = first.s.slice(m[0].length);
    const alone = !rest.trim() && b.runs.length === 1;
    if (alone) {
      const isMasala = /^مسأل/.test(bareKw(word));
      blocks[i] = isMasala
        ? { type: 'heading', level: 4, text: word, pageId: b.pageId, ...(b.printed != null ? { printed: b.printed } : {}), kw: true, nt: true } // لا تُغرق الفهرس بـ«مسألة:» مكررة
        : { type: 'label', text: word, pageId: b.pageId, strong: true, kw: true, ...(b.sh ? { sh: true } : {}) };
    } else {
      b.runs = [{ k: 'kw', s: m[1] + word }, { k: 't', s: rest }, ...b.runs.slice(1)].filter((r) => r.k !== 't' || r.s);
    }
    n++;
  }
  return n;
}

/* ====================================================================== */
/* الآيات غير المعلَّمة: نص يطابق القرآن (خمس كلمات متصلة فأكثر) يصير آية ﴿…﴾.
   ما كان بين قوسين أو تنصيص يُستبدل بهما القوسان المزهّران. */
const OPENERS = { '(': ')', '«': '»', '"': '"', '“': '”', '[': ']' };
function markQuran(blocks, index) {
  let count = 0;
  for (const b of blocks) {
    if (b.type !== 'para') continue;
    const runs = [];
    let changed = false;
    for (const r of b.runs) {
      if (r.k === 'h' && r.s.length > 12) {
        // «…» كلها آية
        const inner = r.s.slice(1, -1);
        const hits = findQuran(inner, index);
        const words = (inner.match(/[\u0621-\u064A]+/g) || []).length;
        const got = hits.reduce((a, h) => a + (inner.slice(h.a, h.b).match(/[\u0621-\u064A]+/g) || []).length, 0);
        if (hits.length && got >= words * 0.85) {
          runs.push({ k: 'q', s: '﴿' + inner.trim() + '﴾' });
          changed = true;
          count++;
          continue;
        }
      }
      if (r.k !== 't' || r.s.length < 20) {
        runs.push(r);
        continue;
      }
      const hits = findQuran(r.s, index);
      if (!hits.length) {
        runs.push(r);
        continue;
      }
      let last = 0;
      for (const h of hits) {
        let { a, b: e } = h;
        // آية بين قوسين أو تنصيص (وقد يليها رقمها داخلهما)
        const close = OPENERS[r.s[a - 1]];
        if (close) {
          const tail = /^\s*(?:\(\s*[0-9\u0660-\u0669]{1,3}\s*\))?\s*/.exec(r.s.slice(e))[0];
          if (r.s[e + tail.length] === close) {
            a--;
            e += tail.length + 1;
          }
        }
        if (a < last) continue;
        if (a > last) runs.push({ k: 't', s: r.s.slice(last, a) });
        let inner = r.s.slice(a, e);
        if (OPENERS[inner[0]]) inner = inner.slice(1, -1).trim();
        runs.push({ k: 'q', s: '﴿' + inner + '﴾' });
        last = e;
        count++;
      }
      if (last < r.s.length) runs.push({ k: 't', s: r.s.slice(last) });
      changed = true;
    }
    if (changed) b.runs = runs;
    // سورة كل آية (لكتب التفسير: آية من سورة أخرى في مقدمة السورة ليست مما يُفسَّر)
    for (const r of b.runs) if (r.k === 'q' && r.su === undefined) r.su = suraOf(r.s, index);
    // موضع الآية في المصحف [سورة، من، إلى]: لعزوها («عزو الآيات» في التنضيد)
    for (const r of b.runs) {
      if (r.k !== 'q' || r.qa !== undefined) continue;
      const g = ayahRange(r.s, index);
      if (g) r.qa = [g.su, g.from, g.to];
    }
  }
  return count;
}

/* المتن المقتبس داخل الشرح: بعد «قوله» أو بين تنصيص يطابق المتن الذي سبقه  */
/* ====================================================================== */

const QAWL = /(?:^|[\s(«"“])((?:[وف])?(?:قوله|قولُه|قولِه|قولَه|قول المصنف|قال المصنف|قول الناظم|قال الناظم))((?:\s*(?:رحمه الله(?: تعالى)?|تعالى|ﷺ))?\s*[:：]?\s*)/g;
const DELIMS = { '(': ')', '"': '"', '“': '”', '«': '»', '[': ']' };

// رموز الصلاة والترضي تُقارن بألفاظها: «ﷺ» = «صلى الله عليه وسلم» (ويكفي بعضها)
const HONORIFICS = {
  'ﷺ': 'صلى الله عليه وسلم',
  'ﷻ': 'جل جلاله',
  '﷽': 'بسم الله الرحمن الرحيم',
  '﷾': 'سبحانه وتعالى',
  '﷿': 'عز وجل',
  '﵀': 'رحمه الله',
  '﵁': 'رضي الله عنه',
  '﵂': 'رضي الله عنها',
  '﵃': 'رضي الله عنهم',
  '﵄': 'رضي الله عنهما',
  '﵇': 'عليه السلام',
};
const HON_RE = new RegExp('[' + Object.keys(HONORIFICS).join('') + ']', 'g');

/** كلمات النص للمقارنة: بلا تشكيل، والرموز مفكوكة إلى ألفاظها */
function matnTokens(text) {
  return normalizeArabic(String(text || '').replace(HON_RE, (c) => ' ' + HONORIFICS[c] + ' '))
    .split(' ')
    .filter(Boolean);
}
// «وأشهد» = «أشهد»: واو العطف أو الفاء في أول الكلمة لا تمنع المطابقة
const bareWord = (w) => (w.length > 2 && (w[0] === 'و' || w[0] === 'ف') ? w.slice(1) : w);
const sameWord = (a, b) => a === b || bareWord(a) === bareWord(b) || bareWord(a) === b || a === bareWord(b);

function containsSeq(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (!sameWord(hay[i + j], needle[j])) continue outer;
    return true;
  }
  return false;
}

/** هل يطابق النص المقتبسُ المتنَ السابق؟ (تسلسل كلمات مع تساهل الواو/الفاء والرموز، أو تقارب كبير للنصوص الطويلة) */
function matchesMatn(quote, matnTok) {
  const q = matnTokens(quote);
  if (!q.length || !matnTok || !matnTok.length || q.join('').length < 2) return false;
  if (containsSeq(matnTok, q)) return true;
  if (q.length >= 3) {
    const ms = new Set(matnTok.map(bareWord));
    return q.filter((w) => ms.has(bareWord(w))).length / q.length >= 0.8;
  }
  return false;
}

/** أطول بداية من الكلمات (بعد «قوله» بلا أقواس) موجودة في المتن السابق */
function longestMatnPrefix(text, matnTok) {
  if (!matnTok || !matnTok.length) return 0;
  const words = text.split(/(\s+)/);
  let best = 0;
  let acc = '';
  for (let i = 0, n = 0; i < words.length && n < 14; i++) {
    acc += words[i];
    if (/^\s+$/.test(words[i])) continue;
    n++;
    const core = acc.replace(/[،,؛:.]+\s*$/, '');
    const qt = matnTokens(core);
    if (qt.length && containsSeq(matnTok, qt)) best = core.length;
    else if (n > 1) break;
  }
  return best;
}

/** يقسم مقطع نص عادي إلى نص + «متن مقتبس» (qm) */
function splitQuoted(str, matnTok, useQawl) {
  const ranges = []; // [بداية، نهاية) لكل مقتبس
  const overlaps = (x, y) => ranges.some(([a, b]) => x < b && y > a);
  // ١) «قوله» وما بعده (بين أقواس أو تنصيص، أو كلمات تطابق بداية المتن)
  if (useQawl) {
    QAWL.lastIndex = 0;
    let m;
    while ((m = QAWL.exec(str))) {
      const start = m.index + m[0].length;
      const open = str[start];
      if (DELIMS[open]) {
        const close = str.indexOf(DELIMS[open], start + 1);
        if (close > start + 1 && close - start < 500) {
          ranges.push([start + 1, close]);
          QAWL.lastIndex = close;
        }
      } else {
        const n = longestMatnPrefix(str.slice(start), matnTok);
        if (n) {
          ranges.push([start, start + n]);
          QAWL.lastIndex = start + n;
        }
      }
    }
  }
  // ٢) أي نص بين تنصيص «…» "…" “…” (أو بين قوسين من كلمتين فأكثر) يطابق المتن السابق
  const qre = /"([^"\n]{1,300})"|“([^”\n]{1,300})”|«([^»\n]{1,300})»|\(([^()\n]{2,300})\)/g;
  let m2;
  while ((m2 = qre.exec(str))) {
    const inner = m2[1] ?? m2[2] ?? m2[3] ?? m2[4];
    const x = m2.index + 1;
    const y = x + inner.length;
    if (overlaps(x, y)) continue;
    if (m2[4] !== undefined && inner.trim().split(/\s+/).length < 2 && !HON_RE.test(inner) && !/صلى|عليه|وسلم/.test(inner)) continue;
    HON_RE.lastIndex = 0;
    if (matchesMatn(inner, matnTok)) ranges.push([x, y]);
  }
  ranges.sort((p, q) => p[0] - q[0]);
  const out = [];
  let last = 0;
  for (const [x, y] of ranges) {
    if (x > last) out.push({ k: 't', s: str.slice(last, x) });
    out.push({ k: 'qm', s: str.slice(x, y) });
    last = y;
  }
  if (last < str.length) out.push({ k: 't', s: str.slice(last) });
  return out;
}

/**
 * تمرير على المجلد كله: يتتبع «المتن السابق» (فقرات المتن المتتالية، أو مقاطع المتن المضمَّن)
 * ويُبرز في الشرح ما اقتُبس منه. لا يُعدّ ذلك متناً جديداً (لا يؤثر في القوالب ولا في نهاية الشرح).
 */
function markQuotedMatn(blocks, o) {
  let matnNorm = [];
  let chunk = [];
  let prevWasMatn = false;
  let count = 0;
  for (const b of blocks) {
    if (b.type !== 'para') {
      if (b.type !== 'heading' && b.type !== 'rule' && b.type !== 'label') prevWasMatn = false;
      continue;
    }
    if (b.mt) {
      // سطور المتن المتتالية مقطع واحد
      if (!prevWasMatn) chunk = [];
      chunk.push(b.runs.map((r) => r.s || '').join(''));
      matnNorm = matnTokens(chunk.join(' '));
      prevWasMatn = true;
      continue;
    }
    prevWasMatn = false;
    const own = b.runs.filter((r) => r.k === 'm').map((r) => r.s).join(' ');
    if (own) matnNorm = matnTokens(own); // المتن المضمَّن في الفقرة نفسها
    const runs = [];
    for (const r of b.runs) {
      if (r.k === 't' || r.k === 'h') {
        const parts = splitQuoted(r.s, matnNorm, o.matnQawluhu !== false);
        for (const p of parts) {
          if (p.k === 'qm') count++;
          runs.push(p.k === 't' && r.k === 'h' ? { k: 'h', s: p.s } : p);
        }
      } else runs.push(r);
    }
    b.runs = runs;
  }
  return count;
}
