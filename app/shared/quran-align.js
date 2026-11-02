// الآيات في التفريغ: الشيخ يتلو الآية في درسه، والتفريغ يكتبها بأخطاء السماع (همزةٌ ساقطة، كلمةٌ تبدّلت)؛
// فتُطابَق بالمصحف (نص «تنزيل» الإملائي) مطابقةً متسامحة، وتُكتب كما في المصحف ومعها سورتها وآياتها.
// المطابقة: سلاسل أربع كلمات تدلّ على المواضع المحتملة، ثم يُمدّ كل موضعٍ كلمةً كلمة مع احتمال كلمةٍ تبدّلت
// أو سقطت أو زيدت (بقدرٍ محدود)، ويُؤخذ أطولها. ولا يُعدّ آيةً ما قلّ عن خمس كلمات إلا آيةٌ كاملة.
import { qNorm, suraName } from './quran.js';

const N = 4;
const DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => DIGITS[+d]);
const WORD = /[ء-ي٠-٩ٮ-ۓەؐ-ًؚ-ٰٟۖ-ۭـ]+/g;

/** المصحف كلمةً كلمة: الكلمة كما هي، وموحّدةً، وسورتها وآيتها، وطول آيتها، وسلاسل الأربع ← مواضعها */
export function buildQuranText(txt) {
  const raw = [];
  const norm = [];
  const ref = [];
  const ayahLen = new Map();
  for (const line of String(txt).split('\n')) {
    const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!m) continue;
    const r = +m[1] * 1000 + +m[2];
    let n = 0;
    for (const w of m[3].trim().split(/\s+/)) {
      const q = qNorm(w);
      if (!q) continue;
      raw.push(w);
      norm.push(q);
      ref.push(r);
      n++;
    }
    ayahLen.set(r, n);
  }
  const grams = new Map();
  for (let i = 0; i + N <= norm.length; i++) {
    const g = norm[i] + ' ' + norm[i + 1] + ' ' + norm[i + 2] + ' ' + norm[i + 3];
    const l = grams.get(g);
    if (!l) grams.set(g, [i]);
    else if (l.length < 400) l.push(i);
  }
  return { raw, norm, ref, ayahLen, grams };
}
let loading = null;
export function loadQuranText(url = '/shared/quran/quran-simple-clean.txt') {
  loading ||= fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(buildQuranText)
    .catch(() => (loading = null));
  return loading;
}

/** توحيد كلمة التفريغ (ومعها ما يكتبه السامع بغير رسم المصحف الإملائي) */
const tNorm = (w) => qNorm(w);
const same = (a, b) => a === b || (a.length > 3 && b.length > 3 && (a.replace(/ا/g, '') === b.replace(/ا/g, '') || a.replace(/ي/g, 'ى') === b.replace(/ي/g, 'ى')));

/** مدّ الموضع: من كلمة i في التفريغ والكلمة p في المصحف ← { len (في التفريغ), qlen (في المصحف), miss } */
function extend(T, Q, i, p) {
  let a = i, b = p, miss = 0, run = 0, good = 0;
  let best = { a: i, b: p, miss: 0, good: 0 };
  while (a < T.length && b < Q.norm.length) {
    if (same(T[a], Q.norm[b])) {
      a++;
      b++;
      good++;
      run = 0;
      if (good >= N) best = { a, b, miss, good };
      continue;
    }
    // كلمةٌ تبدّلت، أو سقطت من التفريغ، أو زيدت فيه
    if (run >= 1 || miss + 1 > Math.max(1, Math.floor((good + 1) * 0.2))) break;
    miss++;
    run++;
    if (a + 1 < T.length && b + 1 < Q.norm.length && same(T[a + 1], Q.norm[b + 1])) (a++, b++);
    else if (b + 1 < Q.norm.length && same(T[a], Q.norm[b + 1])) b++;
    else if (a + 1 < T.length && same(T[a + 1], Q.norm[b])) a++;
    else break;
  }
  return { len: best.a - i, qlen: best.b - p, miss: best.miss, good: best.good };
}

/**
 * نص التفريغ ← أجزاء: [{ text }] و [{ quran: { text, ref: 'البقرة: ٢٥٥', s, a1, a2 }, heard }]
 * text الآية من المصحف، و heard ما كُتب في التفريغ.
 */
export function alignQuran(text, Q) {
  const src = String(text || '');
  if (!Q || !src) return [{ text: src }];
  const words = [];
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(src))) {
    const n = tNorm(m[0]);
    if (n) words.push({ a: m.index, b: m.index + m[0].length, n });
  }
  const T = words.map((w) => w.n);
  const found = [];
  for (let i = 0; i + N <= T.length; ) {
    const cands = Q.grams.get(T[i] + ' ' + T[i + 1] + ' ' + T[i + 2] + ' ' + T[i + 3]) || [];
    let best = null;
    for (const p of cands) {
      const e = extend(T, Q, i, p);
      if (!best || e.good > best.good || (e.good === best.good && e.miss < best.miss)) best = { ...e, p };
    }
    if (best) {
      const r1 = Q.ref[best.p], r2 = Q.ref[best.p + best.qlen - 1];
      // آيةٌ كاملة قصيرة («الحمد لله رب العالمين») تُقبل وإن قلّت كلماتها عن خمس
      const whole = r1 === r2 && Q.ayahLen.get(r1) === best.qlen && (best.p === 0 || Q.ref[best.p - 1] !== r1);
      if (best.qlen >= 5 || whole) {
        found.push({ i, len: best.len, p: best.p, qlen: best.qlen });
        i += best.len;
        continue;
      }
    }
    i++;
  }
  if (!found.length) return [{ text: src }];
  const out = [];
  let at = 0;
  for (const f of found) {
    const a = words[f.i].a, b = words[f.i + f.len - 1].b;
    if (a > at) out.push({ text: src.slice(at, a) });
    const r1 = Q.ref[f.p], r2 = Q.ref[f.p + f.qlen - 1];
    const s = Math.floor(r1 / 1000), a1 = r1 % 1000, a2 = r2 % 1000;
    const s2 = Math.floor(r2 / 1000);
    out.push({
      quran: {
        text: Q.raw.slice(f.p, f.p + f.qlen).join(' '),
        s,
        a1,
        a2: s2 === s ? a2 : a1,
        ref: `${suraName(s)}: ${ar(a1)}${s2 === s && a2 !== a1 ? '–' + ar(a2) : ''}`,
      },
      heard: src.slice(a, b),
    });
    at = b;
  }
  if (at < src.length) out.push({ text: src.slice(at) });
  return out;
}
