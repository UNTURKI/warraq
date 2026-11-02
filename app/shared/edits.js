// «المحرِّر»: ما يغيّره المستخدم فيما فهمه المحلّل من الكتاب.
// التعديلات قائمةُ عمليات تُعاد بالترتيب نفسه على ناتج المحلّل (parseVolume) كلما حُلّل الكتاب من جديد،
// فلا يُحفظ الكتاب نفسه، بل ما غُيّر فيه: يُحفظ في مشروع الكتاب، ويدخل الإخراج (PDF و Word) كما يُرى في المحرِّر.
//
// كل عملية تشير إلى موضعها بـ t = { vol, b } (قطعة من قطع المجلد) أو { vol, n, g } (مقطعٌ من حاشية)،
// ومعه «توقيع» القطعة (sig: أول كلماتها)؛ فإن تغيّر ترتيب القطع (إعدادات قراءة أخرى) طُلبت القطعة بتوقيعها قريباً من موضعها.
//
// العمليات:
//   kind      نوع نص محدَّد داخل فقرة (from..to) أو نوع القطعة كلها: نص، متن، آية، حديث، بيت، عنوان بمستواه، عنوان داخل السطر
//   verse     شطرا البيت، ووضعه (سطر واحد، متتابعان، متداخلان) والفاصل بينهما
//   text      استبدال نص: في موضع واحد، أو في الفصل، أو في المجلد، أو في الكتاب كله
//   kindText  نوعٌ لكل نصٍّ مماثل في المجلد أو الكتاب («طبّق على المواضع المماثلة»)
//   style     تنسيق كلمات بعينها: الخط ومقاسه ولونه، العريض والمائل والمسطّر، التظليل، الرفع، تباعد الكلمات، المدّ
//   edit      ما كُتب في الصفحة: تغييرات في نص القطعة (ويرث المكتوب نوع ما قبله)، و«¶» يقسمها فقرات
//   merge     ضمّ الفقرة إلى ما قبلها (Backspace في أولها)
//   insert / remove / move   إدراج قطعة (فقرة، عنوان، بيت، صورة، فاصل، فاصل صفحة) وحذفها ونقلها
//   pstyle    تنسيق الفقرة: المحاذاة، المسافات البادئة، التباعد، ارتفاع السطر، الإطار، البداية المميزة، فاصل الصفحة
//   bst       تنسيق القطعة كلها (العنوان، البيت)
//   img       الصورة: التفاف النص حولها، عرضها، موضعها، شفافيتها، تدويرها، إطارها، استبدالها
//   note / unnote   حاشية جديدة عند موضع من الفقرة (نصاً، أو مقاطع بأنواعها runs، أو قطعاً segs)، وحذف إحالتها
//   side      ما يُكتب في هامش الصفحة بجانب القطعة: الأيمن (r)، والأيسر (l)، والمتبادل (a: في الفردية يميناً والزوجية يساراً، أو العكس، أو في الطرف الخارجي: alt)
//             وكل هامشٍ نصٌّ منسَّق كسائر النصوص ({ type:'p', runs, al, ps }): يُكتب في موضعه من الصفحة ويُنسَّق (t: { vol, b, sd })
//             وحدوده إن اختارها المستخدم (box: { w, h, dy, x } بالمليمتر)، و box: [k, {…}] في العملية يغيّرها وحدها (null: تلقائي)
//   defstyle  نمط فقرة أو حرف (مرتبط: shared/ustyles.js)
//   mu        المتون: جزءٌ يبدأ عند القطعة (cut) أو لا ينقطع قبلها (join)، وموضع التعليق لجزئها (c) أو لفصلها (sec)؛
//             وsplit: [من، إلى] يقسم الفقرة عند المحدَّد منها فيصير قطعةً وحده، وnext: ما يوضع على القطعة التي بعده،
//             وin: نصٌّ قبل المتن في هذا الموضع («قال الناظم…») أو منعه فيه
//   mufreeze  «ثبّت الترتيب»: بدايات الأجزاء كما هي الآن تُثبَّت على قطعها (cut: 2)، فلا يعيد ورّاق تقسيمها
//   (والبيت: kind بـ from و to يجعل كلماتٍ منه آيةً أو يردّها نصاً — vq: [[الشطر، من، إلى]…])
import { normalizeArabic } from './arabic.js';
import { cleanMu } from './mutun.js';

export const EDITS_VERSION = 1;

/** أنواع ما داخل الفقرة */
export const INLINE_KINDS = {
  t: 'نص',
  m: 'متن',
  q: 'آية',
  h: 'حديث',
  ht: 'عنوان داخل السطر',
};
/** مستويات العناوين: الأعم فالأخص */
export const HEAD_LEVELS = [
  [1, 'باب', 'H1'],
  [2, 'فصل', 'H2'],
  [3, 'فرع', 'H3'],
  [4, 'مسألة', 'H4'],
];
/** أنماط الشعر (بأسمائها عند أهل الصنعة) */
export const VERSE_LAYOUTS = { line: 'موازي', stack: 'سلّمي', stagger: 'سلّمي متداخل', center: 'وسط', khams: 'تخميس', tri: 'ثلاثي' };
export const VERSE_SEPS = { none: 'بلا فاصل', one: '✽', three: '✽ ✽ ✽' };

const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

/* ------------------------------------------------------------------ نص القطع */
export const runText = (r) => (r.k === 'r' ? '' : r.s || '');
export const runsText = (runs) => (runs || []).map(runText).join('');
/** نص القطعة كما يُقرأ (الإحالات بلا طول) */
export function blockText(b) {
  if (!b) return '';
  if (b.type === 'para' || b.type === 'p') return runsText(b.runs);
  if (b.type === 'verse') return (b.parts || []).join(' … ');
  if (b.type === 'heading' || b.type === 'label') return b.text || '';
  if (b.type === 'image') return b.cap || '';
  return '';
}
/** توقيع القطعة: أول كلماتها بلا تشكيل */
export const sigOf = (b) => normalizeArabic(blockText(b)).slice(0, 40);

/* ------------------------------------------------------------------ الهامش الجانبي */
/** مواضع الهامش: الأيمن، والأيسر، والمتبادل (بحسب الصفحة: فردية أو زوجية) */
export const SIDE_KEYS = ['r', 'l', 'a'];
/** المتبادل: or = الفردية يميناً والزوجية يساراً، ol = العكس */
export const SIDE_ALTS = { or: 'الفردية يميناً والزوجية يساراً', ol: 'الفردية يساراً والزوجية يميناً', out: 'في الطرف الخارجي (الهامش الواسع)' };
const altOf = (v) => (v === 'ol' || v === 'out' ? v : 'or');
const SIDE_MAX = 1200;
/** حدود الهامش (مم): ما لم يُذكر فتلقائي */
export const SIDE_BOX_LIMITS = { w: [6, 160], h: [4, 280], dy: [-250, 300], x: [-20, 200] };
/**
 * حدود الهامش التي يختارها المستخدم ← { w?, h?, dy?, x? } أو null (تلقائي):
 *   w عرضه، h ارتفاعه (أقلّه: يشغل هذا الحيّز وإن قلّ نصه)، dy بُعده عن أول قطعته (نزولاً)،
 *   x بُعده عن حافة الصفحة التي هو فيها (اليمنى للأيمن، واليسرى للأيسر) — وإلا فهو في وسط الهامش
 */
export function cleanSideBox(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(SIDE_BOX_LIMITS)) {
    const n = v[k];
    if (n === null || n === undefined || n === '' || !Number.isFinite(+n)) continue;
    out[k] = Math.round(Math.min(hi, Math.max(lo, +n)) * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}
/** هامشٌ واحد ← نصٌّ منسَّق { type: 'p', runs, al?, ps?, box? } (والنص الخالص من الإصدارات السابقة يصير مقطعاً واحداً) */
export function sidePart(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.replace(/\r/g, '').trim().slice(0, SIDE_MAX);
    return s ? { type: 'p', runs: [{ k: 't', s }] } : null;
  }
  if (typeof v !== 'object') return null;
  let left = SIDE_MAX;
  const runs = [];
  for (const r of Array.isArray(v.runs) ? v.runs : []) {
    if (!r || r.k === 'r' || typeof r.s !== 'string' || !r.s || left <= 0) continue;
    const x = { k: r.k === 'q' || r.k === 'h' ? r.k : 't', s: r.s.replace(/\r/g, '').replace(/\u2029/g, '\n').slice(0, left) };
    left -= x.s.length;
    if (r.st && typeof r.st === 'object') x.st = r.st;
    runs.push(x);
  }
  const merged = mergeRuns(runs);
  if (!runsText(merged).trim()) return null;
  const out = { type: 'p', runs: merged };
  if (/^[jclr]$/.test(v.al || '')) out.al = v.al;
  if (v.ps && typeof v.ps === 'object' && Object.keys(v.ps).length) out.ps = { ...v.ps };
  const box = cleanSideBox(v.box);
  if (box) out.box = box;
  return out;
}
/** الهوامش الجانبية للقطعة بصورةٍ واحدة ← { r?, l?, a?, alt? } أو null */
export function normSide(sd) {
  if (!sd || typeof sd !== 'object') return null;
  const out = {};
  for (const k of SIDE_KEYS) {
    const p = sidePart(sd[k]);
    if (p) out[k] = p;
  }
  if (out.a) out.alt = altOf(sd.alt);
  return Object.keys(out).length ? out : null;
}
/** نص الهامش الخالص */
export const sideText = (v) => (v == null ? '' : typeof v === 'string' ? v : runsText(v.runs || []));
/** في أي جهةٍ يقع الهامش k في صفحةٍ رقمها n ← 'r' أو 'l' (oddRight: الصفحة الفردية يمنى؛ والطرف الخارجي يسار اليسرى ويمين اليمنى) */
export function sideSlot(k, alt, n, oddRight = false) {
  if (k !== 'a') return k === 'l' ? 'l' : 'r';
  const odd = Math.abs(Math.round(+n || 1)) % 2 === 1;
  if (alt === 'out') return odd !== !!oddRight ? 'l' : 'r';
  return (alt === 'ol') === odd ? 'l' : 'r';
}
/** توقيعا بيتٍ بلا أرقامه (ترقيم الملف يُحذف أو يبقى بحسب الإعدادات): يتطابقان إن اتفق أولهما */
const bare = (x) => String(x || '').replace(/[0-9٠-٩۰-۹()[\]\-–—.:،\s]+/g, '');
function looseSig(a, b) {
  const x = bare(a);
  const y = bare(b);
  const n = Math.min(x.length, y.length);
  return n >= 8 && x.slice(0, n - 2) === y.slice(0, n - 2);
}

/** نوع القطعة كما يراه المستخدم */
export function blockKind(b, layout) {
  if (!b) return null;
  if (b.type === 'heading') return { kind: 'heading', level: b.level || 1 };
  if (b.type === 'verse') return { kind: 'verse', matn: !!b.mt };
  if (b.type === 'label') return { kind: 'label' };
  if (b.type === 'para' || b.type === 'p') {
    const txt = (b.runs || []).filter((r) => r.k !== 'r' && (r.s || '').trim());
    if (b.mt) return { kind: 'matn', block: true };
    if (txt.length && txt.every((r) => r.k === 'm')) return { kind: 'matn' };
    return { kind: layout === 'split' ? 'sharh' : 'text' };
  }
  return { kind: b.type };
}

/* ------------------------------------------------------------------ الموضع */
/** القطعة (أو مقطع الحاشية) التي تشير إليها t، بتوقيعها ← { node, list, i } أو null */
export function locate(parsed, t, sig) {
  if (!parsed || !t) return null;
  if (t.sd != null && t.b != null) return locateSide(parsed, t, sig);
  if (t.n != null) {
    const note = parsed.notes && parsed.notes[t.n];
    if (!note || !note.segs) return null;
    const node = note.segs[t.g];
    if (!node) return null;
    if (sig != null && sigOf(node) !== sig) {
      const j = note.segs.findIndex((s) => sigOf(s) === sig);
      return j < 0 ? null : { node: note.segs[j], list: note.segs, i: j };
    }
    return { node, list: note.segs, i: t.g };
  }
  const list = parsed.blocks || [];
  const ok = (i) => list[i] && (sig == null || sigOf(list[i]) === sig || (list[i].type === 'verse' && looseSig(sigOf(list[i]), sig)));
  if (ok(t.b)) return { node: list[t.b], list, i: t.b };
  // تغيّر ترتيب القطع: يُطلب التوقيع قريباً من الموضع
  for (let d = 1; d <= 80; d++) {
    if (ok(t.b - d)) return { node: list[t.b - d], list, i: t.b - d };
    if (ok(t.b + d)) return { node: list[t.b + d], list, i: t.b + d };
  }
  return null;
}

/** هامشٌ جانبيٌّ لقطعة (t: { b, sd }): يُطلب بتوقيعه قريباً من موضعه، ويصير نصاً منسَّقاً يُعدَّل كالحاشية */
function locateSide(parsed, t, sig) {
  const list = parsed.blocks || [];
  const k = SIDE_KEYS.includes(t.sd) ? t.sd : null;
  if (!k) return null;
  const at = (i) => {
    const b = list[i];
    if (!b || !b.side || b.side[k] == null) return null;
    const part = sidePart(b.side[k]);
    if (!part) return null;
    if (sig != null && sigOf(part) !== sig) return null;
    if (b.side[k] !== part) b.side = { ...b.side, [k]: part };
    return { node: b.side[k], list: null, i: 0, side: { block: b, k } };
  };
  for (let d = 0; d <= 80; d++) {
    const x = at(t.b - d) || (d ? at(t.b + d) : null);
    if (x) return x;
  }
  return null;
}

/* ------------------------------------------------------------------ تقطيع المقاطع */
/** يقسم المقاطع عند from و to ← [{ r, in }] (الإحالة تتبع ما قبلها) */
function cut(runs, from, to) {
  const out = [];
  let p = 0;
  for (const r of runs) {
    if (r.k === 'r') {
      out.push({ r, in: p > from && p <= to });
      continue;
    }
    const s = r.s || '';
    const a = p;
    const b = p + s.length;
    p = b;
    const pieces = [
      [a, Math.min(b, Math.max(a, from)), false],
      [Math.max(a, from), Math.min(b, to), true],
      [Math.max(a, Math.min(b, to)), b, false],
    ];
    for (const [x, y, inside] of pieces) if (y > x) out.push({ r: { ...r, s: s.slice(x - a, y - a) }, in: inside && from < to });
  }
  return out;
}
const stKey = (st) => (st ? JSON.stringify(st) : '');
/** ضمّ المقاطع المتجاورة من نوع واحد (وتنسيق واحد) */
export function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    if (r.k !== 'r' && !r.s) continue;
    const p = out[out.length - 1];
    // (نص الملف المنسَّق: لا يُضم إلا إلى مثله في عريضه ولونه وخطه)
    const fk = (x) => (x.k === 'f' ? [x.b, x.u, x.c, x.ff, x.fz].join('|') : '');
    if (p && p.k === r.k && r.k !== 'r' && r.k !== 'rs' && r.k !== 'sn' && !!p.q === !!r.q && (p.level || 0) === (r.level || 0) && stKey(p.st) === stKey(r.st) && fk(p) === fk(r)) p.s += r.s;
    else out.push({ ...r });
  }
  return out;
}

const OPEN_Q = /^[\s«»"“”'(\[{]+/;
const CLOSE_Q = /[\s«»"“”')\]}]+$/;
/** نوع جديد لمقاطع محدَّدة: الآية بين قوسين مزهّرين، والحديث بين علامتي تنصيص */
function retypePieces(pieces, kind, level) {
  const idx = pieces.map((p, i) => (p.in && p.r.k !== 'r' ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return pieces.map((p) => p.r);
  // المسافات في طرفي التحديد تبقى خارجه
  const first = pieces[idx[0]].r;
  const last = pieces[idx[idx.length - 1]].r;
  const lead = (first.s.match(/^\s+/) || [''])[0];
  const trail = (last.s.match(/\s+$/) || [''])[0];
  first.s = first.s.slice(lead.length);
  if (last.s.length >= trail.length) last.s = last.s.slice(0, last.s.length - trail.length);
  for (const i of idx) {
    const r = pieces[i].r;
    // ما كان آيةً يفقد قوسيه المزهّرين إذا صار غيرها
    if (kind !== 'q' && (r.k === 'q' || (r.k === 'm' && r.q))) r.s = r.s.replace(/[﴿﴾]/g, '');
    const next = { k: kind, s: r.s };
    if (r.st) next.st = r.st;
    if (kind === 'm') next.q = false;
    if (kind === 'ht') next.level = level || 3;
    pieces[i].r = next;
  }
  const f = pieces[idx[0]].r;
  const l = pieces[idx[idx.length - 1]].r;
  if (kind === 'q') {
    f.s = f.s.replace(OPEN_Q, '');
    l.s = l.s.replace(CLOSE_Q, '');
    if (!f.s.startsWith('﴿')) f.s = '﴿' + f.s;
    if (!l.s.endsWith('﴾')) l.s += '﴾';
  } else if (kind === 'h') {
    if (!/^[«"“]/.test(f.s)) f.s = '«' + f.s;
    if (!/[»"”]$/.test(l.s)) l.s += '»';
  }
  const out = [];
  pieces.forEach((p, i) => {
    if (i === idx[0] && lead) out.push({ k: 't', s: lead });
    out.push(p.r);
    if (i === idx[idx.length - 1] && trail) out.push({ k: 't', s: trail });
  });
  return out;
}
/** نوعٌ لنصٍّ محدَّد داخل فقرة */
export function retypeSpan(node, from, to, kind, level) {
  const pieces = cut(node.runs || [], from, to);
  node.runs = mergeRuns(retypePieces(pieces, kind, level));
  return node;
}

/**
 * تنسيق نصٍّ بعينه: { size: نسبة المقاس (١ = مقاس الكتاب)، bold، color } — ما كان null أُزيل
 * (المقاس يُحفظ نسبةً لا نقاطاً، فيتبع مقاس الأسلوب إن تغيّر)
 */
export function styleSpan(node, from, to, st) {
  const pieces = cut(node.runs || [], from, to);
  for (const p of pieces) {
    if (!p.in || p.r.k === 'r') continue;
    const cur = { ...(p.r.st || {}) };
    for (const [k, v] of Object.entries(st || {})) {
      if (v == null || v === false || (k === 'size' && v === 1)) delete cur[k];
      else cur[k] = v;
    }
    if (Object.keys(cur).length) p.r.st = cur;
    else delete p.r.st;
  }
  node.runs = mergeRuns(pieces.map((p) => p.r));
  return node;
}

/** شطرا بيت من سطر: عند فاصل («…» أو «...» أو «*»)، وإلا عند أقرب مسافة إلى وسطه */
export function splitVerse(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?)\s*(?:\.{3,}|…+|\*{1,3}|✽+|•)\s*(.+)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  const mid = t.length / 2;
  let best = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [t, ''] : [t.slice(0, best).trim(), t.slice(best + 1).trim()];
}

/* ------------------------------------------------------------------ الآيات داخل البيت */
// نص البيت كما يُحدَّد: «الصدر … العجز» (الفاصل ثلاثة أحرف)
export const VSEP_TXT = ' … ';
/** موضعٌ في نص البيت ← [الشطر، الموضع فيه] */
function verseAt(parts, o) {
  const l0 = String(parts[0] || '').length;
  return o <= l0 ? [0, o] : [1, Math.max(0, Math.min(String(parts[1] || '').length, o - l0 - VSEP_TXT.length))];
}
/** آيات البيت مرتّبةً بلا تداخل */
function normVq(list, parts) {
  const out = [];
  for (const p of [0, 1]) {
    const len = String(parts[p] || '').length;
    const xs = (list || [])
      .filter((q) => Array.isArray(q) && q[0] === p)
      .map((q) => [p, Math.max(0, Math.min(len, q[1] | 0)), Math.max(0, Math.min(len, q[2] | 0))])
      .filter((q) => q[2] > q[1])
      .sort((a, b) => a[1] - b[1]);
    for (const q of xs) {
      const last = out[out.length - 1];
      if (last && last[0] === p && q[1] <= last[2]) last[2] = Math.max(last[2], q[2]);
      else out.push(q);
    }
  }
  return out;
}
/**
 * قوسا الآية في الشطر: حين يصير [x, y) منه آيةً يُحاط بـ﴿ ﴾ (ما لم يكونا حوله)، وحين يصير نصاً يُرفعان منه —
 * كما تُعامل الآية في الفقرة، لا لونٌ وحده. يعيد [x, y] الجديدين، وتُزاح آيات الشطر الأخرى بقدر ما زيد أو نقص.
 */
function verseBrackets(node, vq, p, x, y, kind) {
  let t = String(node.parts[p] || '');
  // المسافات في طرفي المحدَّد تبقى خارجه
  while (x < y && /\s/.test(t[x])) x++;
  while (y > x && /\s/.test(t[y - 1])) y--;
  if (y <= x) return [x, y];
  const shift = (at, by) => {
    for (const q of vq) {
      if (q[0] !== p) continue;
      if (q[1] >= at) q[1] += by;
      if (q[2] >= at) q[2] += by;
    }
  };
  if (kind === 'q') {
    // «(…)» أو «"…"» حول الآية المكتوبة: يصيران القوسين المزهّرين
    if (/[(«"“]/.test(t[x]) && /[)»"”]/.test(t[y - 1]) && y - x > 2) {
      t = t.slice(0, x) + '﴿' + t.slice(x + 1, y - 1) + '﴾' + t.slice(y);
      node.parts[p] = t;
      return [x, y];
    }
    const open = t[x] === '﴿' || t[x - 1] === '﴿';
    const close = t[y - 1] === '﴾' || t[y] === '﴾';
    if (t[x - 1] === '﴿') x--;
    if (t[y] === '﴾') y++;
    if (!close) {
      t = t.slice(0, y) + '﴾' + t.slice(y);
      shift(y, 1);
      y++;
    }
    if (!open) {
      t = t.slice(0, x) + '﴿' + t.slice(x);
      shift(x, 1);
      y++;
    }
    node.parts[p] = t;
    return [x, y];
  }
  // نصٌّ لا آية: قوسا الآية في طرفيه (أو حوله ملاصقين) يُرفعان
  if (t[y] === '﴾') y++;
  if (t[x - 1] === '﴿') x--;
  if (t[y - 1] === '﴾') {
    t = t.slice(0, y - 1) + t.slice(y);
    shift(y, -1);
    y--;
  }
  if (t[x] === '﴿') {
    t = t.slice(0, x) + t.slice(x + 1);
    shift(x + 1, -1);
    y--;
  }
  node.parts[p] = t;
  return [x, y];
}
/** يجعل [from, to) من نص البيت آيةً (q) أو نصاً (t) */
function verseSpanKind(node, from, to, kind) {
  const parts = (node.parts = [...(node.parts || ['', ''])]);
  const [pa, a] = verseAt(parts, from);
  const [pz, z] = verseAt(parts, to);
  // المحدَّد قد يعبر الفاصل: يُقسم على الشطرين
  const spans = pa === pz ? [[pa, a, z]] : [[pa, a, String(parts[pa] || '').length], [pz, 0, z]];
  let vq = normVq(node.vq, parts).map((q) => [...q]);
  for (let [p, x, y] of spans) {
    [x, y] = verseBrackets(node, vq, p, x, y, kind);
    // يُطرح ما يقع فيه أولاً، ثم يُضاف إن كان آية
    const next = [];
    for (const q of vq) {
      if (q[0] !== p || q[2] <= x || q[1] >= y) next.push(q);
      else {
        if (q[1] < x) next.push([p, q[1], x]);
        if (q[2] > y) next.push([p, y, q[2]]);
      }
    }
    vq = next;
    if (kind === 'q') vq.push([p, x, y]);
  }
  vq = normVq(vq, parts);
  if (vq.length) node.vq = vq;
  else delete node.vq;
}
/** تغيّر نص الشطر: كل آيةٍ فيه تُطلب بنصها في الشطر الجديد (وما لم يُوجد يُترك) */
function reanchorVq(node, oldParts) {
  if (!node.vq) return;
  const out = [];
  for (const [p, a, z] of node.vq) {
    const was = String(oldParts[p] || '').slice(a, z);
    const now = String(node.parts[p] || '');
    if (!was) continue;
    if (now.slice(a, z) === was) out.push([p, a, z]);
    else {
      const j = now.indexOf(was);
      if (j >= 0) out.push([p, j, j + was.length]);
    }
  }
  const vq = normVq(out, node.parts);
  if (vq.length) node.vq = vq;
  else delete node.vq;
}

/* ------------------------------------------------------------------ نوع القطعة كلها */
function retypeBlock(loc, op, layout) {
  const b = loc.node;
  const inNote = !!(op.t && op.t.n != null);
  const base = { pageId: b.pageId, ...(b.printed !== undefined ? { printed: b.printed } : {}) };
  const textRuns = () => {
    if (b.type === 'para' || b.type === 'p') return b.runs.map((r) => (r.k === 'm' ? (r.q ? { k: 'q', s: r.s } : { k: 't', s: r.s }) : r));
    return [{ k: 't', s: b.type === 'verse' ? (b.parts || []).filter(Boolean).join(' ') : b.text || '' }];
  };
  let next = null;
  switch (op.kind) {
    case 'text':
    case 'sharh':
      next = inNote ? { type: 'p', runs: mergeRuns(textRuns()), sub: !!b.sub } : { type: 'para', runs: mergeRuns(textRuns()), ...base, ...(b.al ? { al: b.al } : {}) };
      break;
    case 'matn':
      if (inNote) return false;
      if (b.type === 'verse') next = { ...b, mt: true };
      else if (layout === 'split') next = { type: 'para', runs: mergeRuns(textRuns()), ...base, mt: true };
      else
        next = {
          type: 'para',
          runs: mergeRuns(textRuns().map((r) => (r.k === 'r' || r.k === 'rs' || r.k === 'sn' ? r : { k: 'm', s: r.s, q: r.k === 'q' }))),
          ...base,
        };
      break;
    case 'q':
    case 'h': {
      const runs = textRuns();
      const len = runsText(runs).length;
      const node = { type: inNote ? 'p' : 'para', runs, ...(inNote ? { sub: !!b.sub } : base) };
      retypeSpan(node, 0, len, op.kind);
      next = node;
      break;
    }
    case 'verse': {
      const parts = Array.isArray(op.parts) && op.parts.length === 2 ? op.parts.map((s) => String(s || '').trim()) : splitVerse(b.type === 'verse' ? (b.parts || []).join(' ... ') : runsText(textRuns()));
      const wasMatn = !!b.mt || (b.type === 'para' && (b.runs || []).filter((r) => r.k !== 'r' && (r.s || '').trim()).every((r) => r.k === 'm'));
      next = inNote ? { type: 'verse', parts, ...(b.sub ? { sub: true } : {}) } : { type: 'verse', parts, ...base, ...(wasMatn ? { mt: true } : {}) };
      break;
    }
    case 'heading':
      if (inNote) return false;
      next = { type: 'heading', level: Math.max(1, Math.min(4, op.level || 2)), text: blockText(b).replace(/[﴿﴾]/g, '').replace(/\s+/g, ' ').trim(), ...base, printed: b.printed ?? null };
      break;
    default:
      return false;
  }
  loc.list[loc.i] = next;
  return true;
}

/* ------------------------------------------------------------------ الاستبدال */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const AR_WORD = '[\\p{L}\\p{M}\\p{N}ـ]';
/** تعبير البحث: كلمة كاملة، وتجاهل التشكيل (فـ«شرط» تجد «شرطً» و«شَرْط») */
export function findRegex(find, { word = false, marks = false, re = false } = {}) {
  // تعبير نمطي (للمتمرّس): كما كتبه، وإن لم يصحّ لم يجد شيئاً
  if (re) {
    try {
      return new RegExp(String(find), 'gu');
    } catch {
      return /(?!)/gu;
    }
  }
  let src = marks
    ? [...String(find).replace(DIAC, '')].map((c) => escRe(c) + '[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640]*').join('')
    : escRe(String(find));
  if (word) src = `(?<!${AR_WORD})${src}(?!${AR_WORD})`;
  return new RegExp(src, 'gu');
}
/** استبدال في المقاطع، فقرةً فقرة ← عدد المواضع */
function replaceInRuns(runs, re, repl, onlyAt) {
  let n = 0;
  let p = 0;
  for (const r of runs) {
    if (r.k === 'r') continue;
    const a = p;
    p += (r.s || '').length;
    if (onlyAt != null && (onlyAt < a || onlyAt >= p)) continue;
    r.s = (r.s || '').replace(re, (m, ...rest) => {
      const off = rest.find((x) => typeof x === 'number');
      if (onlyAt != null && a + off !== onlyAt) return m;
      n++;
      return typeof repl === 'function' ? repl(m) : repl;
    });
  }
  return n;
}
function replaceInNode(node, re, repl, onlyAt) {
  if (!node) return 0;
  if (node.type === 'para' || node.type === 'p') return replaceInRuns(node.runs || [], re, repl, onlyAt);
  let n = 0;
  const rep = (s) =>
    String(s || '').replace(re, (m) => {
      n++;
      return typeof repl === 'function' ? repl(m) : repl;
    });
  if (node.type === 'verse') {
    const old = [...(node.parts || [])];
    if (onlyAt != null && re.global) {
      // موضعٌ واحد من نص البيت («الصدر … العجز»): في شطره وحده
      const [p, o] = verseAt(old, onlyAt);
      const t = String(old[p] || '');
      re.lastIndex = 0;
      let m;
      let hit = null;
      while ((m = re.exec(t))) {
        if (m.index === o) {
          hit = m;
          break;
        }
        if (m[0] === '') re.lastIndex++;
      }
      if (hit) {
        n = 1;
        node.parts = [...old];
        node.parts[p] = t.slice(0, hit.index) + (typeof repl === 'function' ? repl(hit[0]) : repl) + t.slice(hit.index + hit[0].length);
      }
    } else node.parts = old.map(rep);
    reanchorVq(node, old);
  }
  else if (node.type === 'heading' || node.type === 'label') node.text = rep(node.text);
  return n;
}
/** الحواشي التي تحيل إليها قطع */
function notesOf(blocks) {
  const ids = new Set();
  for (const b of blocks) for (const r of b.runs || []) if (r.k === 'r') ids.add(r.id);
  return ids;
}

/** حدود الفصل الذي فيه القطعة i: من أقرب عنوان قبلها (مستواه ≤ ٢، وإلا أي عنوان) إلى العنوان التالي من مستواه أو أعلى */
export function sectionRange(blocks, i) {
  let start = 0;
  let level = 9;
  for (let j = Math.min(i, blocks.length - 1); j >= 0; j--) {
    if (blocks[j].type === 'heading') {
      if (level === 9) {
        start = j;
        level = blocks[j].level || 1;
      }
      if ((blocks[j].level || 1) <= 2) {
        start = j;
        level = blocks[j].level || 1;
        break;
      }
    }
  }
  let end = blocks.length - 1;
  for (let j = start + 1; j < blocks.length; j++)
    if (blocks[j].type === 'heading' && (blocks[j].level || 1) <= level) {
      end = j - 1;
      break;
    }
  return [start, end];
}

/* ------------------------------------------------------------------ الكتابة في الصفحة (كما في Word) */
// علامة الفقرة الجديدة (Enter) في النص المكتوب
export const PARA_MARK = '\u2029';
/** المقطع الذي يرث منه المكتوبُ نوعَه وتنسيقه: الحرف الذي قبله (كما في Word)، وإلا الذي بعده */
function inheritAt(runs, a) {
  let p = 0;
  let before = null;
  let after = null;
  for (const r of runs) {
    if (r.k === 'r') continue;
    const s = r.s || '';
    if (a > p && a <= p + s.length) before = before || r;
    if (a >= p && a < p + s.length) after = after || r;
    p += s.length;
  }
  return before || after || { k: 't' };
}
const PLAIN_KEYS = ['k', 'q', 'level', 'b', 'u', 'c', 'st', 'su'];
/** يستبدل النص [a, z) بـ s (والمكتوب يرث نوع ما قبله وتنسيقه) */
export function spliceRuns(runs, a, z, s) {
  // ما يحلّ محلّ نصٍّ يرث نوعَ أوّله؛ والمُدرَج يرث ما قبله
  const base = inheritAt(runs, z > a ? a + 1 : a);
  const pieces = cut(runs || [], a, Math.max(a, z));
  const out = [];
  let put = false;
  let p = 0;
  const ins = () => {
    if (put || !s) return (put = true);
    const r = {};
    for (const k of PLAIN_KEYS) if (base[k] !== undefined) r[k] = base[k];
    if (r.k === 'r' || r.k === 'rs' || r.k === 'sn') r.k = 't';
    // الرقم الثابت والعنوان داخل السطر لا يمتدّان بالكتابة بعدهما
    r.s = s;
    out.push(r);
    put = true;
  };
  for (const x of pieces) {
    const len = x.r.k === 'r' ? 0 : (x.r.s || '').length;
    if (!put && p >= a && !(x.r.k === 'r' && p === a && a > 0)) ins();
    if (!x.in || x.r.k === 'r') out.push(x.r);
    p += len;
  }
  ins();
  return mergeRuns(out);
}
/**
 * الفرق بين نصين ← تغييرات [{ a, z, s }] بمواضع النص الأول: كلمةً كلمة، ثم يضيق كل تغيير إلى ما تغيّر من حروفه
 * (فتصحيح «شرطً» إلى «شرطًا» إضافةُ ألفٍ في آخرها، فتبقى الكلمة على نوعها وتنسيقها)
 */
export function diffText(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a === b) return [];
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q);
  const B = b.slice(p, b.length - q);
  const tok = (s) => s.match(/\s+|[^\s]+/g) || [];
  const ta = tok(A);
  const tb = tok(B);
  let out = [];
  if (!ta.length || !tb.length || ta.length * tb.length > 4e6) out = [{ a: p, z: a.length - q, s: B }];
  else {
    const n = ta.length;
    const m = tb.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    let pa = p;
    let cur = null;
    while (i < n || j < m) {
      if (i < n && j < m && ta[i] === tb[j]) {
        if (cur) out.push(cur), (cur = null);
        pa += ta[i].length;
        i++;
        j++;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
        cur = cur || { a: pa, z: pa, s: '' };
        cur.s += tb[j];
        j++;
      } else {
        cur = cur || { a: pa, z: pa, s: '' };
        pa += ta[i].length;
        cur.z = pa;
        i++;
      }
    }
    if (cur) out.push(cur);
  }
  // كل تغيير يضيق إلى حروفه
  return out.map((c) => {
    const old = a.slice(c.a, c.z);
    let x = 0;
    while (x < old.length && x < c.s.length && old[x] === c.s[x]) x++;
    let y = 0;
    while (y < old.length - x && y < c.s.length - x && old[old.length - 1 - y] === c.s[c.s.length - 1 - y]) y++;
    return { a: c.a + x, z: c.z - y, s: c.s.slice(x, c.s.length - y) };
  });
}

/** يقسم المقاطع عند موضع ← [قبله، بعده] */
export function splitRunsAt(runs, at) {
  const left = [];
  const right = [];
  let p = 0;
  for (const r of runs || []) {
    if (r.k === 'r') {
      (p <= at ? left : right).push(r);
      continue;
    }
    const s = r.s || '';
    if (p + s.length <= at) left.push(r);
    else if (p >= at) right.push(r);
    else {
      left.push({ ...r, s: s.slice(0, at - p) });
      right.push({ ...r, s: s.slice(at - p) });
    }
    p += s.length;
  }
  return [mergeRuns(left), mergeRuns(right)];
}
/** فقرة جديدة على هيئة فقرةٍ (Enter): نوعها وتنسيق فقرتها، بلا ما لا يتكرر (فاصل الصفحة، البداية المميزة) */
function siblingOf(node, runs) {
  const nb = { type: node.type, runs, ins: 1 };
  for (const k of ['mt', 'sh', 'al', 'sub', 'pageId']) if (node[k] !== undefined) nb[k] = node[k];
  if (node.ps) {
    const ps = { ...node.ps };
    delete ps.drop;
    delete ps.pb;
    if (Object.keys(ps).length) nb.ps = ps;
  }
  return nb;
}
/** تقسيم الفقرة عند علامات الفقرة الجديدة ← الفقرات الجديدة بعدها */
function splitParas(loc) {
  const node = loc.node;
  const out = [];
  let runs = node.runs;
  for (let g = 0; g < 400; g++) {
    const t = runsText(runs);
    const k = t.indexOf(PARA_MARK);
    if (k < 0) break;
    const [l, r] = splitRunsAt(runs, k);
    if (!out.length) node.runs = l;
    else out[out.length - 1].runs = l;
    // علامة الفقرة وما بعدها من مسافات
    const lead = (runsText(r).slice(1).match(/^[ \t]*/) || [''])[0].length;
    runs = spliceRuns(r, 0, 1 + lead, '');
    out.push(siblingOf(node, runs));
  }
  if (out.length) loc.list.splice(loc.i + 1, 0, ...out);
  return out.length;
}
/** قطعة جديدة (من «إدراج»): نسخة نظيفة بما يُعرف من مفاتيحها */
const BLOCK_TYPES = ['para', 'heading', 'verse', 'image', 'hr', 'ornament', 'pagebreak', 'label', 'p', 'table'];
function cleanBlock(b) {
  if (!b || !BLOCK_TYPES.includes(b.type)) return null;
  const x = clone(b);
  delete x._i;
  if (x.type === 'para' || x.type === 'p') {
    x.runs = mergeRuns(Array.isArray(x.runs) ? x.runs : []);
    x.ins = 1; // فقرة كتبها المستخدم: تبقى ولو فرغت (ليُكتب فيها)
  }
  if (x.type === 'heading') {
    x.level = Math.max(1, Math.min(4, x.level | 0 || 2));
    x.text = String(x.text || '');
  }
  if (x.type === 'verse') x.parts = [String((x.parts || [])[0] || ''), String((x.parts || [])[1] || '')];
  return x;
}
/** يدمج ما في set مع obj: ما كان null أُزيل */
function mergeProps(obj, set) {
  const cur = { ...(obj || {}) };
  for (const [k, v] of Object.entries(set || {})) {
    if (v == null || v === false || v === '') delete cur[k];
    else cur[k] = v;
  }
  return Object.keys(cur).length ? cur : null;
}

/* ------------------------------------------------------------------ نص الحاشية */
const NOTE_KINDS = new Set(['t', 'q', 'h', 'f']);
/** مقاطع تصلح للحاشية: بلا إحالةٍ إلى حاشيةٍ أخرى، والمتن والعنوان داخل السطر نصٌّ فيها */
export function noteRuns(runs) {
  const out = [];
  for (const r of Array.isArray(runs) ? runs : []) {
    if (!r || r.k === 'r' || typeof r.s !== 'string' || !r.s) continue;
    const x = { k: NOTE_KINDS.has(r.k) ? r.k : r.k === 'm' && r.q ? 'q' : 't', s: r.s.slice(0, 20000) };
    if (r.st && typeof r.st === 'object') x.st = r.st;
    if (x.k === 'f') for (const k of ['b', 'u', 'c', 'ff', 'fz']) if (r[k] !== undefined) x[k] = r[k];
    out.push(x);
  }
  return mergeRuns(out);
}
/** قطع الحاشية من العملية: segs (فقرات وأبيات)، أو runs (فقرة بأنواعها)، أو text (نصٌّ خالص) */
function noteSegs(op) {
  if (Array.isArray(op.segs) && op.segs.length) {
    const segs = op.segs
      .slice(0, 60)
      .map((b) => {
        if (!b) return null;
        if (b.type === 'verse') return { type: 'verse', parts: [String((b.parts || [])[0] || ''), String((b.parts || [])[1] || '')] };
        const runs = noteRuns(b.runs || [{ k: 't', s: blockText(b) }]);
        return runs.length ? { type: 'p', runs } : null;
      })
      .filter(Boolean);
    if (segs.length) return segs;
  }
  if (Array.isArray(op.runs)) {
    const runs = noteRuns(op.runs);
    if (runs.length) return [{ type: 'p', runs }];
  }
  return [{ type: 'p', runs: [{ k: 't', s: String(op.text || '') }] }];
}
/** نصٌّ فيه آياتٌ بين ﴿ ﴾ ← مقاطع: الآية آيةٌ، وما سواها نص */
export function runsFromText(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  let at = 0;
  const re = /﴿[^﴿﴾]{1,4000}﴾/g;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ k: 't', s: s.slice(at, m.index) });
    out.push({ k: 'q', s: m[0] });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ k: 't', s: s.slice(at) });
  return mergeRuns(out);
}

/* ------------------------------------------------------------------ تطبيق عملية */
function applyOp(parsed, vol, op) {
  const layout = parsed.layout;
  // ما يشمل الكتاب كله لا مجلد له؛ وما سواه لمجلده وحده
  const ov = op.vol != null ? op.vol : op.t && op.t.vol;
  // الأنماط للكتاب كله (كل مجلداته)
  const whole = ((op.op === 'text' || op.op === 'kindText') && op.scope === 'book') || op.op === 'defstyle';
  if (ov != null && String(ov) !== vol && !whole) return { skip: true };
  // الهامش الجانبي نصٌّ منسَّق: يُكتب فيه ويُنسَّق، ولا يُدرج فيه ولا يُحذف منه كالقطع
  if (op.t && op.t.sd != null && !['edit', 'style', 'pstyle', 'kind'].includes(op.op)) return { missed: true };
  if (op.op === 'batch') {
    // عدة عمليات تُعدّ واحدة (نوعٌ لقطع كثيرة معاً): تُطبَّق وتُرجَع معاً
    let n = 0;
    let missed = 0;
    for (const x of op.ops || []) {
      const r = applyOp(parsed, vol, x);
      if (r.skip) continue;
      if (r.missed) missed++;
      else n += r.n || 0;
    }
    return missed && !n ? { missed: true } : { n, ...(missed ? { partial: missed } : {}) };
  }
  if (op.op === 'kind') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    const node = loc.node;
    if (op.from != null && op.to != null && op.to > op.from && (node.type === 'para' || node.type === 'p') && INLINE_KINDS[op.kind]) {
      retypeSpan(node, op.from, op.to, op.kind, op.level);
      return { n: 1 };
    }
    // كلماتٌ من البيت: آيةٌ (أو تُردّ نصاً)
    if (op.from != null && op.to != null && op.to > op.from && node.type === 'verse' && (op.kind === 'q' || op.kind === 't')) {
      verseSpanKind(node, op.from, op.to, op.kind);
      return { n: 1 };
    }
    if (node.type === 'heading' && op.kind === 'heading') {
      node.level = Math.max(1, Math.min(4, op.level || node.level));
      return { n: 1 };
    }
    return retypeBlock(loc, op, layout) ? { n: 1 } : { missed: true };
  }
  if (op.op === 'style') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || !loc.node.runs) return { missed: true };
    const len = runsText(loc.node.runs).length;
    styleSpan(loc.node, op.from != null ? op.from : 0, op.to != null ? op.to : len, op.st);
    return { n: 1 };
  }
  if (op.op === 'edit') {
    // ما كُتب في الصفحة: تغييرات في نص القطعة (من الآخر إلى الأول)، وعلامات الفقرة الجديدة تقسمها فقرات
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    const node = loc.node;
    const ch = (Array.isArray(op.ch) ? op.ch : []).slice().sort((x, y) => y.a - x.a);
    if (loc.side) {
      // ما كُتب في الهامش: الأسطر الجديدة أسطرٌ فيه (لا فقرات في الكتاب)، وإن فرغ حُذف
      for (const c of ch) node.runs = spliceRuns(node.runs, c.a | 0, c.z | 0, String(c.s || '').replace(new RegExp(PARA_MARK, 'g'), '\n'));
      const part = sidePart(node);
      const sd = { ...loc.side.block.side };
      if (part) sd[loc.side.k] = part;
      else delete sd[loc.side.k];
      const ns = normSide(sd);
      if (ns) loc.side.block.side = ns;
      else delete loc.side.block.side;
      return { n: 1 };
    }
    if (node.type === 'para' || node.type === 'p') {
      for (const c of ch) node.runs = spliceRuns(node.runs, c.a | 0, c.z | 0, String(c.s || ''));
      // ما كتبه المستخدم بيده: يبقى كما كتبه (لا تمسّه قواعد المسافات في التنضيد، shared/typo-rules.js)
      node.ue = 1;
      if (!runsText(node.runs).trim()) node.ins = 1;
      const n = splitParas(loc);
      for (let k = 1; k <= n; k++) if (loc.list[loc.i + k]) loc.list[loc.i + k].ue = 1;
      return { n: 1, ...(n ? { split: n } : {}) };
    }
    if (node.type === 'heading' || node.type === 'label') {
      let t = node.text || '';
      for (const c of ch) t = t.slice(0, c.a) + String(c.s || '') + t.slice(c.z);
      node.text = t.replace(new RegExp(PARA_MARK, 'g'), ' ');
      node.ue = 1;
      return { n: 1 };
    }
    if (node.type === 'verse' && Array.isArray(op.parts)) {
      const old = node.parts || [];
      node.parts = op.parts.slice(0, 2).map((s) => String(s || ''));
      reanchorVq(node, old);
      return { n: 1 };
    }
    return { missed: true };
  }
  if (op.op === 'merge') {
    // Backspace في أول الفقرة: تُضمّ إلى ما قبلها
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.i < 1) return { missed: true };
    const prev = loc.list[loc.i - 1];
    const node = loc.node;
    if (!prev || !node.runs || !prev.runs) return { missed: true };
    prev.runs = mergeRuns([...prev.runs, ...node.runs]);
    loc.list.splice(loc.i, 1);
    return { n: 1 };
  }
  if (op.op === 'insert') {
    const b = cleanBlock(op.block);
    if (!b) return { missed: true };
    if (!op.t) {
      parsed.blocks.splice(Math.max(0, Math.min(parsed.blocks.length, op.pos | 0)), 0, b);
      return { n: 1 };
    }
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    loc.list.splice(op.where === 'before' ? loc.i : loc.i + 1, 0, b);
    return { n: 1 };
  }
  if (op.op === 'remove') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    loc.list.splice(loc.i, 1);
    return { n: 1 };
  }
  if (op.op === 'move') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    const j = loc.i + (op.d < 0 ? -1 : 1);
    if (j < 0 || j >= loc.list.length) return { missed: true };
    const [x] = loc.list.splice(loc.i, 1);
    loc.list.splice(j, 0, x);
    return { n: 1 };
  }
  if (op.op === 'pstyle') {
    // تنسيق الفقرة: المحاذاة، والمسافات البادئة، والتباعد، وارتفاع السطر، والإطار، وفاصل الصفحة، والبداية المميزة
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    const node = loc.node;
    const set = { ...(op.ps || {}) };
    if ('al' in set) {
      if ((loc.side ? /^[jclr]$/ : /^[clr]$/).test(set.al || '')) node.al = set.al;
      else delete node.al;
      delete set.al;
    }
    const ps = mergeProps(node.ps, set);
    if (ps) node.ps = ps;
    else delete node.ps;
    return { n: 1 };
  }
  if (op.op === 'bst') {
    // تنسيق القطعة كلها (العنوان، البيت): الخط ومقاسه ولونه…
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    const s = mergeProps(loc.node.st, op.st);
    if (s && s.size === 1) delete s.size;
    if (s && Object.keys(s).length) loc.node.st = s;
    else delete loc.node.st;
    return { n: 1 };
  }
  if (op.op === 'img') {
    // الصورة: التفاف النص حولها، وعرضها، وموضعها، وشفافيتها، وصورتها
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'image') return { missed: true };
    const node = loc.node;
    for (const [k, v] of Object.entries(op.set || {})) {
      if (!['wrap', 'wPct', 'al', 'x', 'y', 'op', 'src', 'w', 'h', 'cap', 'rot', 'bd'].includes(k)) continue;
      if (v == null || v === '') delete node[k];
      else node[k] = v;
    }
    return { n: 1 };
  }
  if (op.op === 'note') {
    // حاشية جديدة عند موضعٍ من الفقرة (كما في Word: إدراج حاشية)؛ ونصها: نصٌّ خالص، أو مقاطع بأنواعها (آية، حديث…)،
    // أو قطعٌ (فقرات وأبيات) — كما حين يُجعل نصٌّ من الكتاب حاشيةً على موضعٍ آخر
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || !loc.node.runs || !op.nid) return { missed: true };
    const id = String(op.nid);
    parsed.notes = parsed.notes || {};
    parsed.notes[id] = { id, kind: 'fn', segs: noteSegs(op) };
    const [l, r] = splitRunsAt(loc.node.runs, Math.max(0, op.pos | 0));
    loc.node.runs = [...l, { k: 'r', id }, ...r];
    return { n: 1 };
  }
  if (op.op === 'side') {
    // الهامش الجانبي: نصٌّ في هامش الصفحة بجانب القطعة: الأيمن (r)، والأيسر (l)، والمتبادل (a) بحسب الصفحة (alt)
    // القيمة نصٌّ خالص أو نصٌّ منسَّق ({ runs, al, ps })، وفارغةً تحذفه؛ و mv: [من، إلى] ينقله بتنسيقه إلى موضعٍ آخر
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || !['para', 'heading', 'verse', 'label'].includes(loc.node.type) || loc.list !== parsed.blocks) return { missed: true };
    const node = loc.node;
    const cur = normSide(node.side) || {};
    const set = op.set || {};
    for (const k of SIDE_KEYS) {
      if (!(k in set)) continue;
      const p = sidePart(set[k]);
      if (p) cur[k] = p;
      else delete cur[k];
    }
    if (Array.isArray(op.mv) && SIDE_KEYS.includes(op.mv[0]) && SIDE_KEYS.includes(op.mv[1]) && op.mv[0] !== op.mv[1] && cur[op.mv[0]]) {
      const [a, b] = op.mv;
      const x = cur[a];
      if (cur[b]) cur[a] = cur[b];
      else delete cur[a];
      cur[b] = x;
    }
    // حدود الهامش وحدها: box: [k، { w, h, dy, x }] (والقيمة null تعيد ذلك الحدّ تلقائياً، و box: [k، null] يعيدها كلها)
    if (Array.isArray(op.box) && SIDE_KEYS.includes(op.box[0]) && cur[op.box[0]]) {
      const [k, patch] = op.box;
      const merged = patch && typeof patch === 'object' ? { ...(cur[k].box || {}), ...patch } : {};
      for (const x of Object.keys(merged)) if (merged[x] === null) delete merged[x];
      const box = cleanSideBox(merged);
      cur[k] = { ...cur[k] };
      if (box) cur[k].box = box;
      else delete cur[k].box;
    }
    if ('alt' in set) cur.alt = altOf(set.alt);
    const ns = normSide(cur);
    if (ns) node.side = ns;
    else delete node.side;
    return { n: 1 };
  }
  if (op.op === 'unnote') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || !loc.node.runs) return { missed: true };
    const before = loc.node.runs.length;
    loc.node.runs = mergeRuns(loc.node.runs.filter((r) => !(r.k === 'r' && r.id === op.nid)));
    return loc.node.runs.length < before ? { n: 1 } : { missed: true };
  }
  if (op.op === 'cell') {
    // خلية جدول: نصها، وعريضها، ومحاذاتها، ولونها
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'table') return { missed: true };
    const row = (loc.node.rows || [])[op.r | 0];
    const cell = row && (row.cells || [])[op.c | 0];
    if (!cell) return { missed: true };
    for (const [k, v] of Object.entries(op.set || {})) {
      if (!['t', 'b', 'al', 'bg'].includes(k)) continue;
      if (v == null || v === '' || v === false) {
        if (k === 't') cell.t = '';
        else delete cell[k];
      } else cell[k] = k === 't' ? String(v).slice(0, 4000) : v;
    }
    return { n: 1 };
  }
  if (op.op === 'table') {
    // الجدول: صفوف وأعمدة تُضاف وتُحذف، وصف العنوان، والحدود
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'table') return { missed: true };
    const tb = loc.node;
    tb.rows = Array.isArray(tb.rows) ? tb.rows : [];
    const r = Math.max(0, op.r | 0);
    const c = Math.max(0, op.c | 0);
    const ncol = Math.max(1, ...tb.rows.map((x) => (x.cells || []).length));
    const evenCols = (n) => Array.from({ length: n }, () => Math.round((100 / n) * 100) / 100);
    if (op.act === 'rowAfter' || op.act === 'rowBefore') tb.rows.splice(op.act === 'rowAfter' ? r + 1 : r, 0, { cells: Array.from({ length: ncol }, () => ({ t: '' })) });
    else if (op.act === 'colAfter' || op.act === 'colBefore') {
      for (const row of tb.rows) (row.cells = row.cells || []).splice(op.act === 'colAfter' ? c + 1 : c, 0, { t: '' });
      tb.cols = evenCols(ncol + 1);
    } else if (op.act === 'rowDel') {
      if (tb.rows.length < 2) return { missed: true };
      tb.rows.splice(r, 1);
    } else if (op.act === 'colDel') {
      if (ncol < 2) return { missed: true };
      for (const row of tb.rows) (row.cells || []).splice(c, 1);
      tb.cols = evenCols(ncol - 1);
    } else if (op.act === 'hdr') {
      if (tb.rows[0]) tb.rows[0].hdr = !tb.rows[0].hdr;
    } else if (op.act === 'borders') tb.borders = !tb.borders;
    else return { missed: true };
    return { n: 1 };
  }
  if (op.op === 'untable') {
    // الجدول يصير نصاً: يُستخرج كلامه فقراتٍ (أو أبياتاً، أو «عنوان: قيمة») ويُحذف الجدول
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'table') return { missed: true };
    const out = tableToBlocks(loc.node, op).map(cleanBlock).filter(Boolean);
    loc.list.splice(loc.i, 1, ...out);
    return { n: 1, ...(out.length > 1 ? { split: out.length - 1 } : {}) };
  }
  if (op.op === 'memo') {
    // ملاحظة للمراجع على القطعة: تُرى في المحرِّر وحده، ولا تُطبع
    const loc = locate(parsed, op.t, op.sig);
    if (!loc) return { missed: true };
    if (op.text && String(op.text).trim()) loc.node.memo = { text: String(op.text).trim().slice(0, 2000), ts: op.ts || 0 };
    else delete loc.node.memo;
    return { n: 1 };
  }
  if (op.op === 'defstyle') {
    // نمط فقرة أو حرف: يُعرَّف أو يُعدَّل (فيتغيّر كل ما يحمله) أو يُحذف
    const sid = String(op.sid || '');
    if (!sid) return { missed: true };
    parsed.ustyles = { ...(parsed.ustyles || {}) };
    if (op.remove) delete parsed.ustyles[sid];
    else
      parsed.ustyles[sid] = {
        name: String(op.name || 'نمط').slice(0, 60),
        kind: op.kind === 'c' ? 'c' : 'p',
        ...(op.st && Object.keys(op.st).length ? { st: op.st } : {}),
        ...(op.ps && Object.keys(op.ps).length ? { ps: op.ps } : {}),
        ...(/^[clr]$/.test(op.al || '') ? { al: op.al } : {}),
      };
    return { n: 1 };
  }
  if (op.op === 'mu') {
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.list !== parsed.blocks) return { missed: true };
    let i = loc.i;
    // المحدَّد من فقرة: تُقسم عنده، فيصير قطعةً وحده (وما قبله وما بعده فقرتان على هيئتها)
    if (Array.isArray(op.split) && (loc.node.type === 'para' || loc.node.type === 'p')) {
      const node = loc.node;
      const len = runsText(node.runs).length;
      const a = Math.max(0, Math.min(len, op.split[0] | 0));
      const z = Math.max(a, Math.min(len, op.split[1] | 0));
      const [pre, rest] = splitRunsAt(node.runs, a);
      const [mid, post] = splitRunsAt(rest, z - a);
      const has = (runs) => runsText(runs).trim().length > 0;
      if (has(mid)) {
        const piece = (runs) => {
          const nb = siblingOf(node, runs);
          delete nb.ins;
          return nb;
        };
        const pieces = [];
        if (has(pre)) pieces.push({ ...node, runs: pre });
        const m = has(pre) ? piece(mid) : { ...node, runs: mid };
        pieces.push(m);
        if (has(post)) pieces.push(piece(post));
        loc.list.splice(loc.i, 1, ...pieces);
        i = loc.i + (has(pre) ? 1 : 0);
      }
    }
    const setOn = (node, set) => {
      if (!node || !set) return;
      const cur = { ...(node.mu || {}) };
      for (const [k, v] of Object.entries(set)) {
        if (!['cut', 'join', 'c', 'sec', 'in', 'as'].includes(k)) continue;
        if (v == null || v === false || v === 0) delete cur[k];
        else cur[k] = v;
        // البداية والضمّ لا يجتمعان
        if (k === 'cut' && v) delete cur.join;
        if (k === 'join' && v) delete cur.cut;
      }
      const mu = cleanMu(cur);
      if (mu) node.mu = mu;
      else delete node.mu;
    };
    setOn(parsed.blocks[i], op.set);
    if (op.next) setOn(parsed.blocks[i + 1], op.next);
    return { n: 1 };
  }
  if (op.op === 'mufreeze') {
    // «ثبّت الترتيب»: البدايات المثبّتة من قبل تُرفع، وتُثبَّت هذه (ما حدّده المستخدم بدايةً يبقى كما هو)
    for (const b of parsed.blocks) if (b.mu && b.mu.cut === 2) {
      const mu = cleanMu({ ...b.mu, cut: 0 });
      if (mu) b.mu = mu;
      else delete b.mu;
    }
    let n = 0;
    for (const at of Array.isArray(op.at) ? op.at : []) {
      const loc = locate(parsed, { vol: op.vol, b: at.b }, at.sig);
      if (!loc || loc.list !== parsed.blocks) continue;
      const cur = loc.node.mu || {};
      if (cur.cut === 1) continue;
      const mu = cleanMu({ ...cur, cut: 2, join: 0 });
      if (mu) loc.node.mu = mu;
      n++;
    }
    return { n: n || 1 };
  }
  if (op.op === 'cap') {
    // شرح الصورة (ما يُكتب تحتها)
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'image') return { missed: true };
    if (op.cap) loc.node.cap = String(op.cap).slice(0, 2000);
    else delete loc.node.cap;
    return { n: 1 };
  }
  if (op.op === 'verse') {
    // نمط الشعر وقيمه: للقصيدة كلها (الأبيات المتتالية)، أو لكل قصائد المجلد (all: «التنسيق المتكامل»)
    const VK = ['vl', 'vs', 'vg', 'vi', 'vk'];
    const setOn = (x) => {
      for (const k of VK) if (op[k] !== undefined) op[k] === null || op[k] === '' ? delete x[k] : (x[k] = op[k]);
      if (op.pst !== undefined) {
        const ps = mergeProps(x.ps, { pst: op.pst });
        if (ps) x.ps = ps;
        else delete x.ps;
      }
    };
    if (op.all) {
      let n = 0;
      for (const x of parsed.blocks) if (x.type === 'verse') setOn(x), n++;
      return n ? { n } : { missed: true };
    }
    const loc = locate(parsed, op.t, op.sig);
    if (!loc || loc.node.type !== 'verse') return { missed: true };
    const v = loc.node;
    if (Array.isArray(op.parts) && op.parts.length === 2) {
      const old = v.parts || [];
      v.parts = op.parts.map((s) => String(s || '').trim());
      reanchorVq(v, old);
    }
    if (VK.some((k) => op[k] !== undefined) || op.pst !== undefined) {
      let a = loc.i;
      let b = loc.i;
      while (a > 0 && loc.list[a - 1].type === 'verse') a--;
      while (b < loc.list.length - 1 && loc.list[b + 1].type === 'verse') b++;
      for (let i = a; i <= b; i++) setOn(loc.list[i]);
    }
    return { n: 1 };
  }
  if (op.op === 'text') {
    if (!op.find) return { n: 0 };
    const re = findRegex(op.find, op);
    // التعبير النمطي: $1 و $2… في البديل
    const rp = op.re ? (m) => m.replace(new RegExp(re.source, re.flags.replace('g', '')), op.repl) : op.repl;
    if (op.scope === 'one') {
      const loc = locate(parsed, op.t, op.sig);
      if (!loc) return { missed: true };
      // at: موضع الكلمة (وما كان وقتاً في الإصدار السابق يُهمل)
      const n = replaceInNode(loc.node, re, rp, op.at != null && op.at < 1e11 ? op.at : undefined);
      return n ? { n } : { missed: true };
    }
    let blocks = parsed.blocks;
    if (op.scope === 'section' && op.range) blocks = parsed.blocks.slice(op.range[0], op.range[1] + 1);
    let n = 0;
    for (const b of blocks) n += replaceInNode(b, re, rp);
    const ids = op.scope === 'section' ? notesOf(blocks) : null;
    for (const [id, note] of Object.entries(parsed.notes || {})) {
      if (ids && !ids.has(id)) continue;
      for (const s of note.segs || []) n += replaceInNode(s, re, rp);
    }
    return { n };
  }
  if (op.op === 'kindText') {
    // كل موضعٍ فيه النص نفسه يصير من النوع نفسه
    const key = normalizeArabic(op.text);
    if (!key) return { n: 0 };
    let n = 0;
    if (op.block) {
      parsed.blocks.forEach((b, i) => {
        if ((b.type === 'para' || b.type === 'heading' || b.type === 'verse') && normalizeArabic(blockText(b)) === key) {
          if (retypeBlock({ node: b, list: parsed.blocks, i }, { ...op, t: { b: i } }, layout)) n++;
        }
      });
      return { n };
    }
    const nodes = [...parsed.blocks, ...Object.values(parsed.notes || {}).flatMap((x) => x.segs || [])];
    const re = findRegex(String(op.text).trim(), { marks: true });
    for (const node of nodes) {
      if (node.type !== 'para' && node.type !== 'p') continue;
      if (op.kind === 'm' && node.type === 'p') continue;
      const full = runsText(node.runs);
      const hits = [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(full))) hits.push([m.index, m.index + m[0].length]);
      // من الآخر إلى الأول: لا تتغيّر مواضع ما قبله
      for (const [a, b] of hits.reverse()) {
        // ما كان من النوع نفسه لا يُعاد
        const pieces = cut(node.runs, a, b).filter((p) => p.in && p.r.k !== 'r');
        if (pieces.length && pieces.every((p) => p.r.k === op.kind)) continue;
        retypeSpan(node, a, b, op.kind, op.level);
        n++;
      }
    }
    return { n };
  }
  return { missed: true };
}

/**
 * تعديلات المستخدم على مجلد محلَّل ← { parsed, report: Map(op.id ← { n, missed }) }
 * (لا يُمسّ الأصل: نسخة جديدة)
 */
export function applyEdits(parsed, vol, edits) {
  const ops = edits && Array.isArray(edits.ops) ? edits.ops : [];
  const report = new Map();
  if (!parsed || !ops.length) return { parsed, report };
  const out = clone(parsed);
  for (const op of ops) {
    let r;
    try {
      r = applyOp(out, String(vol), op);
    } catch {
      r = { missed: true };
    }
    if (!r.skip) report.set(op.id, r);
  }
  // الهوامش الجانبية بصورةٍ واحدة (نصوص الإصدارات السابقة تصير نصاً منسَّقاً)
  for (const b of out.blocks || []) {
    if (!b || !b.side) continue;
    const ns = normSide(b.side);
    if (ns) b.side = ns;
    else delete b.side;
  }
  // إحصاء ما تغيّر (للشارات): العناوين والأبيات
  if (out.stats) {
    out.stats = { ...out.stats, headings: out.blocks.filter((b) => b.type === 'heading').length, verses: out.blocks.filter((b) => b.type === 'verse').length };
  }
  return { parsed: out, report };
}

/* ------------------------------------------------------------------ الجدول ← نص */
/** طرق التحويل، وفواصل الخلايا في السطر الواحد */
export const UNTABLE_MODES = {
  row: 'فقرة لكل صف',
  cell: 'فقرة لكل خلية',
  kv: '«العنوان: القيمة» لكل صف',
  verse: 'بيت لكل صف',
};
export const UNTABLE_SEPS = [
  ['، ', '،'],
  [' — ', '—'],
  [' | ', '|'],
  [' : ', ':'],
  [' ', 'مسافة'],
];
/** نصوص خلايا الصف بترتيب القراءة (الخلية الممدودة عمودياً تُترك، والخلية ذات الأسطر تبقى بأسطرها) */
function tableRowsText(node, reverse) {
  return (Array.isArray(node.rows) ? node.rows : []).map((r) => {
    const cells = (r.cells || []).map((c) => ({ t: c && !c.skip ? String(c.t == null ? '' : c.t).replace(/\r/g, '').trim() : '', b: !!(c && c.b) }));
    if (reverse) cells.reverse();
    return { hdr: !!r.hdr, cells };
  });
}
/** هل يصلح الجدول أبياتاً؟ (أكثر صفوفه خليتان فيهما كلام) */
export function tableLooksVerse(node) {
  const rows = tableRowsText(node, false).filter((r) => r.cells.some((c) => c.t));
  if (!rows.length) return false;
  const two = rows.filter((r) => r.cells.filter((c) => c.t).length === 2).length;
  return two / rows.length >= 0.6;
}
/**
 * قطع النص التي يصير إليها الجدول.
 * o: { mode: row|cell|kv|verse, sep, hdr: heading|para|drop, reverse }
 * - الصف الأول عنوانٌ إن كان صفَّ عنوانٍ في الجدول (أو اختير «hdr»)، فيصير عنواناً أو فقرةً غامقة أو يُحذف.
 */
export function tableToBlocks(node, o = {}) {
  const mode = UNTABLE_MODES[o.mode] ? o.mode : 'row';
  const sep = typeof o.sep === 'string' && o.sep.length <= 6 ? o.sep : '، ';
  const rows = tableRowsText(node, !!o.reverse);
  const flat = (s) => s.replace(/\s*\n+\s*/g, ' ').trim();
  const para = (s, bold) => ({ type: 'para', runs: [{ k: 't', s, ...(bold ? { st: { bold: true } } : {}) }] });
  const out = [];
  // صف العنوان: الصف المعلَّم عنواناً في الجدول، أو الأول إن طُلب
  const hasHdr = rows.length > 1 && (rows[0].hdr || o.firstIsHdr);
  const head = hasHdr ? rows[0] : null;
  const body = hasHdr ? rows.slice(1) : rows;
  const hdrMode = ['heading', 'para', 'drop'].includes(o.hdr) ? o.hdr : mode === 'kv' ? 'drop' : 'heading';
  if (head && hdrMode !== 'drop') {
    const t = head.cells.map((c) => flat(c.t)).filter(Boolean).join(sep);
    if (t) out.push(hdrMode === 'heading' ? { type: 'heading', level: Math.max(1, Math.min(4, o.level | 0 || 3)), text: t } : para(t, true));
  }
  const labels = head ? head.cells.map((c) => flat(c.t)) : [];
  for (const r of body) {
    const cells = r.cells;
    if (!cells.some((c) => c.t)) continue;
    if (mode === 'cell') {
      for (const c of cells) for (const line of c.t.split(/\n+/)) if (line.trim()) out.push(para(line.trim(), c.b));
      continue;
    }
    if (mode === 'verse') {
      const full = cells.filter((c) => c.t);
      if (full.length === 2) out.push({ type: 'verse', parts: [flat(full[0].t), flat(full[1].t)] });
      else out.push(para(full.map((c) => flat(c.t)).join(sep)));
      continue;
    }
    if (mode === 'kv' && labels.some(Boolean)) {
      const t = cells
        .map((c, i) => (c.t ? (labels[i] ? `${labels[i]}: ${flat(c.t)}` : flat(c.t)) : ''))
        .filter(Boolean)
        .join(sep === '، ' ? ' — ' : sep);
      if (t) out.push(para(t));
      continue;
    }
    const t = cells.map((c) => flat(c.t)).filter(Boolean).join(sep);
    if (t) out.push(para(t, cells.every((c) => !c.t || c.b)));
  }
  return out;
}

/** معرّف عملية */
export const opId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
