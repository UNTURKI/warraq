// تقسيم الكتاب إلى مجلدات (منضدة التنضيد): بعض كتب «تراث» جُمعت مجلداتها في مجلدٍ واحد (ثلاثة آلاف صفحة)،
// فيُقسَّم: بمجلدات الطبعة (من ترقيم صفحاتها «١/٢٣»)، أو بالأبواب الكبرى (كل باب مجلد)، أو بعددٍ يُختار
// (بأحجامٍ متقاربة، وكل مجلدٍ يبدأ بباب وينتهي بنهاية باب)، أو بصفحاتٍ يختارها المستخدم.
// والباب الذي يبدأ في وسط صفحة: يُقطع عنده (ما قبله آخر المجلد السابق، وهو أول التالي) — trimPage يفعل ذلك في العامل.
import { toLatinDigits, normalizeArabic } from './arabic.js';

export const SPLIT_MODES = ['none', 'printed', 'heads', 'count', 'custom'];
export const MAX_SPLIT = 60;

/* ------------------------------------------------------------------ مجلدات الطبعة */
/** رقم مجلد الطبعة من مدخل page_map («١,٢٣» أو «1,23») */
function volOf(v) {
  if (v == null) return null;
  const parts = String(v).split(',');
  return parts.length > 1 ? toLatinDigits(parts[0]).trim() || null : null;
}
/** رقم الصفحة المطبوع */
export function printedPage(pageMap, pageId) {
  const v = pageMap && pageMap[pageId - 1];
  if (v == null) return '';
  const parts = String(v).split(',');
  return toLatinDigits(parts[parts.length - 1]).trim();
}
export function printedVolOf(pageMap, pageId) {
  return volOf(pageMap && pageMap[pageId - 1]);
}
/**
 * مجلدات الطبعة من ترقيم الصفحات: [{ vol, start, end }] — صفحاتٌ بلا رقم مجلد تلحق بما قبلها
 * (وما قبل أول رقم يلحق بالمجلد الأول). لا شيء إن لم يكن فيه إلا مجلدٌ واحد.
 */
export function printedRuns(pageMap) {
  if (!Array.isArray(pageMap) || !pageMap.length) return [];
  const runs = [];
  pageMap.forEach((v, i) => {
    const vol = volOf(v);
    const last = runs[runs.length - 1];
    if (!vol || (last && last.vol === vol)) {
      if (last) last.end = i + 1;
      return;
    }
    // رقمٌ عاد إلى مجلدٍ سبق (خطأ في المصدر): يُضم إلى ما قبله
    if (runs.some((r) => r.vol === vol)) return void (last.end = i + 1);
    runs.push({ vol, start: i + 1, end: i + 1 });
  });
  if (!runs.length) return [];
  runs[0].start = 1;
  runs[runs.length - 1].end = pageMap.length;
  return runs.length > 1 ? runs : [];
}

/* ------------------------------------------------------------------ الأبواب */
/** العناوين مرتّبة بصفحاتها: [{ i, title, lvl, page }] */
export function headsOf(book) {
  const hs = (book && book.book && book.book.indexes && book.book.indexes.headings) || [];
  return hs
    .map((h, i) => ({ i, title: String(h.title || '').trim(), lvl: +h.level || 1, page: +h.page || 0 }))
    .filter((h) => h.page >= 1 && h.title)
    .sort((a, b) => a.page - b.page || a.i - b.i);
}
/** الأبواب الكبرى: عناوين أعلى مستوى في الكتاب (عادةً المستوى ١)، أول عنوانٍ من كل صفحة */
export function topHeads(book, depth = 0) {
  const hs = headsOf(book);
  if (!hs.length) return { lvl: 0, list: [] };
  const levels = [...new Set(hs.map((h) => h.lvl))].sort((a, b) => a - b);
  // مستوى أعلى فيه عنوانٌ واحد فقط (عنوان الكتاب نفسه): يُتجاوز إلى ما تحته
  let k = 0;
  while (k < levels.length - 1 && hs.filter((h) => h.lvl === levels[k]).length < 2) k++;
  const lvl = levels[Math.min(levels.length - 1, k + depth)];
  const seen = new Set();
  const list = [];
  for (const h of hs) if (h.lvl >= levels[k] && h.lvl <= lvl && !seen.has(h.page)) (seen.add(h.page), list.push(h));
  return { lvl, list };
}
/** أول عنوانٍ في صفحة (لعرضه أول المجلد، وللقطع عنده) */
export function headAt(book, page, maxLvl = 99) {
  return headsOf(book).find((h) => h.page === page && h.lvl <= maxLvl) || null;
}

/* ------------------------------------------------------------------ نقاط البدء */
/** كل بابٍ كبير مجلد: نقاط البدء (الصفحة الأولى دائماً) */
export function startsByHeads(book) {
  // الباب الأول وما قبله (المقدمة) المجلد الأول
  const { list } = topHeads(book);
  const starts = [1, ...list.slice(1).map((h) => h.page).filter((p) => p > 1)];
  return [...new Set(starts)];
}
export function startsByPrinted(book) {
  return printedRuns(book.pageMap).map((r) => r.start);
}
/**
 * n مجلدات بأحجامٍ متقاربة، وكل مجلدٍ يبدأ بباب: تُختار نقاط القطع من صفحات الأبواب الكبرى
 * (وإن قلّت فمن الفصول تحتها) بأقل انحرافٍ عن الحجم المتساوي (برمجة ديناميكية).
 */
export function startsByCount(book, n) {
  const total = book.totalPages || 0;
  n = Math.max(1, Math.min(MAX_SPLIT, Math.round(n) || 1, total));
  if (n <= 1) return { starts: [1], exact: true };
  let cands = [];
  for (let depth = 0; depth < 4; depth++) {
    cands = [...new Set(topHeads(book, depth).list.map((h) => h.page).filter((p) => p > 1 && p <= total))].sort((a, b) => a - b);
    // كل مجلد يبدأ بباب: لا يُنزل إلى الفصول إلا إن لم تكفِ الأبواب العدد
    if (cands.length >= n - 1) break;
  }
  if (cands.length < n - 1) {
    // لا أبواب تكفي: بالصفحات (وتُذكر)
    const starts = Array.from({ length: n }, (_, k) => 1 + Math.round((k * total) / n));
    return { starts: [...new Set(starts)], exact: false };
  }
  // تقليل المرشّحين في الكتب الكبيرة جداً (أقربهم إلى نقاطٍ متقاربة)
  if (cands.length > 1200) {
    const step = cands.length / 1200;
    cands = Array.from({ length: 1200 }, (_, k) => cands[Math.floor(k * step)]);
  }
  const ideal = total / n;
  const C = cands.length;
  const cost = (a, b) => (b - a - ideal) ** 2; // مجلدٌ من الصفحة a إلى ما قبل b
  // dp[j][c]: أقل كلفة لـ j قطعة آخرها عند المرشّح c
  let prev = new Float64Array(C).fill(Infinity);
  const back = [];
  for (let c = 0; c < C; c++) prev[c] = cost(1, cands[c]);
  back.push(new Int32Array(C).fill(-1));
  for (let j = 2; j <= n - 1; j++) {
    const cur = new Float64Array(C).fill(Infinity);
    const bk = new Int32Array(C).fill(-1);
    for (let c = j - 1; c < C; c++) {
      let best = Infinity, arg = -1;
      for (let p = j - 2; p < c; p++) {
        if (prev[p] === Infinity) continue;
        const v = prev[p] + cost(cands[p], cands[c]);
        if (v < best) (best = v), (arg = p);
      }
      cur[c] = best;
      bk[c] = arg;
    }
    prev = cur;
    back.push(bk);
  }
  let best = Infinity, arg = -1;
  for (let c = n - 2; c < C; c++) {
    if (prev[c] === Infinity) continue;
    const v = prev[c] + cost(cands[c], total + 1);
    if (v < best) (best = v), (arg = c);
  }
  const cuts = [];
  for (let j = n - 1, c = arg; j >= 1 && c >= 0; j--) {
    cuts.push(cands[c]);
    c = back[j - 1][c];
  }
  return { starts: [1, ...cuts.reverse()], exact: true };
}

/* ------------------------------------------------------------------ المجلدات */
/**
 * نقاط البدء ← مجلدات المنضدة: [{ vol, start, end, pages, parts, head, tail, from }]
 * head: العنوان الذي يبدأ به المجلد (يُقطع عنده إن كان في وسط صفحته)، tail: عنوان المجلد التالي
 * (فالصفحة المشتركة يُؤخذ منها ما قبله). keys: أرقام المجلدات (لمجلدات الطبعة: أرقامها فيها)
 */
export function volumesFrom(book, starts, { keys = null, cutAtHeads = true } = {}) {
  const total = book.totalPages || 0;
  const s = [...new Set(starts.map((x) => Math.round(+x)).filter((x) => x >= 1 && x <= total))].sort((a, b) => a - b);
  if (!s.length || s[0] !== 1) s.unshift(1);
  const heads = s.map((p, k) => (k && cutAtHeads ? headAt(book, p) : null));
  return s.map((start, k) => {
    const nextStart = k + 1 < s.length ? s[k + 1] : total + 1;
    const tail = heads[k + 1] || null;
    // بابٌ يبدأ في وسط صفحته: الصفحة مشتركة بين المجلدين
    const end = tail ? Math.max(start, nextStart) : nextStart - 1;
    const h = heads[k] || null;
    const first = h || headAt(book, start);
    return {
      vol: keys && keys[k] ? String(keys[k]) : String(k + 1),
      start,
      end,
      pages: end - start + 1,
      parts: [],
      split: true,
      ...(h ? { head: { title: h.title, lvl: h.lvl, i: h.i } } : {}),
      ...(tail ? { tail: { title: tail.title, lvl: tail.lvl, i: tail.i } } : {}),
      first: first ? first.title : '',
    };
  });
}
/** نقاط البدء من مجلدات (للتعديل اليدوي) */
export const startsOf = (vols) => vols.map((v) => v.start);

/* ------------------------------------------------------------------ القطع في وسط الصفحة */
const SPAN_RE = /<span[^>]*data-type=["']?title["']?[^>]*>([\s\S]*?)<\/span>/gi;
const FOOT = /(^|\n)[ \t]*(?:_[ \t]*){3,}(\n|$)/;
const norm = (s) => normalizeArabic(String(s || '').replace(/<[^>]+>/g, '')).replace(/[^\p{L}\p{N}]+/gu, '');
const NOTE_NUM = /^\s*[([]\s*([0-9٠-٩۰-۹]{1,3})\s*[)\]]/;
const REF = /[([]\s*([0-9٠-٩۰-۹]{1,3})\s*[)\]]/g;
/** موضع العنوان في نص الصفحة (أول وسمِ عنوانٍ يطابقه)، أو -1 */
export function headIndex(text, title) {
  const want = norm(title);
  if (!want) return -1;
  SPAN_RE.lastIndex = 0;
  let m;
  let first = -1;
  while ((m = SPAN_RE.exec(text))) {
    if (first < 0) first = m.index;
    const got = norm(m[1]);
    if (got && (got === want || got.startsWith(want) || want.startsWith(got))) return m.index;
  }
  // بلا وسم: السطر الذي هو العنوان نفسه
  const lines = String(text).split('\n');
  let at = 0;
  for (const l of lines) {
    if (norm(l) === want) return at;
    at += l.length + 1;
  }
  return -1;
}
/**
 * صفحةٌ يبدأ في وسطها باب: side = 'head' يُؤخذ من العنوان إلى آخرها، و'tail' ما قبله.
 * والحواشي: لكلّ جزءٍ حواشيه التي أُحيل إليها فيه (ويبقى ما لا رقم له مع ما قبله).
 * إن لم يوجد العنوان بقيت الصفحة كما هي.
 */
export function trimPage(text, title, side) {
  const t = String(text || '');
  const cut = FOOT.exec(t);
  const body = cut ? t.slice(0, cut.index) : t;
  const foot = cut ? t.slice(cut.index + cut[0].length) : '';
  const at = headIndex(body, title);
  if (at < 0) return t;
  // العنوان أول الصفحة: لا شيء قبله
  if (!body.slice(0, at).replace(/<[^>]+>/g, '').trim()) return side === 'head' ? t : '';
  const part = side === 'head' ? body.slice(at) : body.slice(0, at);
  if (!part.replace(/<[^>]+>/g, '').trim()) return side === 'head' ? t : '';
  if (!foot.trim()) return part;
  // الحواشي المحال إليها في هذا الجزء
  const refs = new Set();
  for (const m of part.replace(/<[^>]+>/g, '').matchAll(REF)) refs.add(toLatinDigits(m[1]));
  const keep = [];
  let on = false;
  let numbered = false;
  for (const l of foot.split('\n')) {
    const m = NOTE_NUM.exec(l);
    if (m) {
      numbered = true;
      on = refs.has(toLatinDigits(m[1]));
    }
    if (on || (!numbered && side === 'tail')) keep.push(l);
  }
  const notes = keep.join('\n').trim();
  return notes ? part.replace(/\s+$/, '') + '\n__________\n' + notes : part;
}

/* ------------------------------------------------------------------ الوصف */
/** ما يُحفظ في المشروع ويُعاد منه: { mode, n?, starts? } */
export function cleanSplit(s) {
  if (!s || typeof s !== 'object' || !SPLIT_MODES.includes(s.mode) || s.mode === 'none') return null;
  const out = { mode: s.mode };
  if (s.mode === 'count') out.n = Math.max(2, Math.min(MAX_SPLIT, Math.round(+s.n) || 2));
  if (s.mode === 'custom') out.starts = [...new Set((Array.isArray(s.starts) ? s.starts : []).map((x) => Math.round(+x)).filter((x) => x >= 1))].sort((a, b) => a - b).slice(0, MAX_SPLIT);
  return out;
}
/** المجلدات بحسب طريقة التقسيم (book: الكتاب بمجلداته الأصلية في origVolumes أو volumes) */
export function splitVolumes(book, split) {
  const s = cleanSplit(split);
  if (!s) return null;
  if (s.mode === 'printed') {
    const runs = printedRuns(book.pageMap);
    if (runs.length < 2) return null;
    const keys = runs.map((r) => r.vol);
    const uniq = new Set(keys).size === keys.length && keys.every((k) => /^\d{1,3}$/.test(k));
    return volumesFrom(book, runs.map((r) => r.start), { keys: uniq ? keys : null, cutAtHeads: false });
  }
  if (s.mode === 'heads') {
    const st = startsByHeads(book);
    return st.length > 1 && st.length <= MAX_SPLIT ? volumesFrom(book, st) : null;
  }
  if (s.mode === 'count') {
    const r = startsByCount(book, s.n);
    return volumesFrom(book, r.starts, { cutAtHeads: r.exact });
  }
  if (s.mode === 'custom') return s.starts.length ? volumesFrom(book, s.starts) : null;
  return null;
}
