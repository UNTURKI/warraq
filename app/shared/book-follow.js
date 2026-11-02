// «تتبّع الشارح في الكتاب»: سطرٌ من تفريغ الدرس ← موضعه في الكتاب المفتوح على الرَّحل (خوارزميةٌ في البرنامج، لا ذكاء اصطناعي).
//
// الكتاب يُفهرَس كلمةً كلمة (صفحةً صفحة، بأي ترتيب): مفتاح كل كلمة (بلا تشكيل، والهمزات والتاء المربوطة صورة واحدة، وبلا «و/ف» و«ال»)،
// وسلاسل الثلاث ← مواضعها. وسطر التفريغ تُطلب سلاسله الثلاث في الفهرس فتصوّت لمواضع البدء (الأندر أثقل صوتاً)،
// ثم تُطابَق كلماته بالترتيب مع كلمات الكتاب عند أقوى المواضع (مع احتمال كلمةٍ سقطت أو زيدت أو سُمعت خطأ)، ويُؤخذ أعلاها.
// وأول مطابقة لا تُقبل إلا من سطرٍ ممتلئ (ست كلماتٍ ذات معنى فأكثر، وأكثر من نصفها في الكتاب بالترتيب)، فلا تخدع الكلماتُ العامة؛
// وبعدها يُبحث قرب آخر موضع أولاً بشرطٍ أخفّ (الشارح يقرأ ما بعده غالباً)، وإلا في الكتاب كله بالشرط الأول.

const DIAC = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const STOP = new Set(
  'في من على الى إلى عن ان أن إن ما لا لم لن هو هي هم هذا هذه ذلك تلك التي الذي الذين ثم او أو قد كان كانت يكون قال قالوا كل بل اي أي مع عند حتى اذا إذا لو لكن انه أنه انها أنها له لها به بها منه فيه عليه الله تعالى رحمه صلى وسلم يعني ايضا أيضا هنا هناك يا نعم طيب'
    .split(' ')
    .map((w) => keyOf(w)),
);
/** مفتاح الكلمة للمطابقة */
export function keyOf(w) {
  let s = String(w || '')
    .replace(DIAC, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A0-9a-z]/gi, '')
    .toLowerCase();
  if (s.length > 3 && (s[0] === 'و' || s[0] === 'ف')) s = s.slice(1);
  if (s.length > 4 && s.startsWith('ال')) s = s.slice(2);
  else if (s.length > 5 && /^(بال|كال|لل)/.test(s)) s = s.slice(s.startsWith('لل') ? 2 : 3);
  return s;
}
const same = (a, b) => a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 1);
const content = (k) => k.length > 1 && !STOP.has(k);

/* ================================================================ الفهرس */
// الموضع: صفحة × ١٠٠٠٠٠ + رقم الكلمة فيها
const P = 100000;
export function createIndex() {
  const pages = new Map(); // i ← { keys, words:[{ t, x0, x1, l }], lines:[{ top, bottom }] }
  const grams = new Map(); // «أ ب ج» ← [موضع]
  const df = new Map(); // مفتاح ← عدد مرّاته
  return {
    pages,
    grams,
    df,
    get size() {
      return pages.size;
    },
    has: (i) => pages.has(i),
    /** صفحةٌ بسطورها: [{ top, bottom, words:[{ t, x0, x1 }] }] */
    add(i, lines) {
      if (pages.has(i)) return;
      const words = [];
      const ls = [];
      (lines || []).forEach((ln, l) => {
        ls.push({ top: ln.top, bottom: ln.bottom });
        for (const w of ln.words || []) {
          const k = keyOf(w.t);
          if (k) words.push({ t: w.t, k, x0: w.x0, x1: w.x1, l });
        }
      });
      const keys = words.map((w) => w.k);
      pages.set(i, { keys, words, lines: ls });
      for (const k of keys) df.set(k, (df.get(k) || 0) + 1);
      for (let n = 0; n + 2 < keys.length; n++) {
        const g = keys[n] + ' ' + keys[n + 1] + ' ' + keys[n + 2];
        const l = grams.get(g);
        if (!l) grams.set(g, [i * P + n]);
        else if (l.length < 60) l.push(i * P + n);
      }
      // سلاسل تعبر إلى الصفحة التالية والسابقة (إن فُهرستا)
      const link = (a, b) => {
        const A = pages.get(a);
        const B = pages.get(b);
        if (!A || !B) return;
        const tail = A.keys.slice(-2);
        const head = B.keys.slice(0, 2);
        const seq = [...tail, ...head];
        for (let n = 0; n + 2 < seq.length; n++) {
          const g = seq[n] + ' ' + seq[n + 1] + ' ' + seq[n + 2];
          const pos = n < tail.length ? a * P + (A.keys.length - tail.length + n) : b * P + (n - tail.length);
          const l = grams.get(g) || [];
          if (!l.includes(pos) && l.length < 60) grams.set(g, [...l, pos]);
        }
      };
      link(i - 1, i);
      link(i, i + 1);
    },
    key(pos) {
      const p = pages.get(Math.floor(pos / P));
      return p ? p.keys[pos % P] : undefined;
    },
    next(pos) {
      const i = Math.floor(pos / P);
      const p = pages.get(i);
      if (p && pos % P + 1 < p.keys.length) return pos + 1;
      for (let j = i + 1; j <= i + 3; j++) if (pages.has(j) && pages.get(j).keys.length) return j * P;
      return -1;
    },
    prev(pos) {
      const i = Math.floor(pos / P);
      if (pos % P > 0 && pages.has(i)) return pos - 1;
      for (let j = i - 1; j >= i - 3; j--) if (pages.has(j) && pages.get(j).keys.length) return j * P + pages.get(j).keys.length - 1;
      return -1;
    },
    word(pos) {
      const p = pages.get(Math.floor(pos / P));
      return p ? p.words[pos % P] : null;
    },
  };
}

/* ================================================================ المطابقة */
/** من كلمةٍ في السطر (t) وموضعها في الكتاب (pos): كلماتٌ تُطابَق بالترتيب إلى الأمام (dir=1) أو إلى الخلف (dir=-1) ← [{ t, p }] */
function walkAlign(ix, T, t0, pos0, dir) {
  const out = [];
  let pos = pos0;
  let miss = 0;
  const step = (p) => (dir > 0 ? ix.next(p) : ix.prev(p));
  for (let t = t0; t >= 0 && t < T.length && pos >= 0; t += dir) {
    // الكلمة التالية في الكتاب، أو بعدها بقليل (كلماتٌ في الكتاب لم تُقل، أو سُمعت غيرها)
    let p = pos;
    let found = -1;
    for (let s = 0; s < 6 && p >= 0; s++, p = step(p)) {
      const k = ix.key(p);
      if (k !== undefined && same(k, T[t])) {
        found = p;
        break;
      }
    }
    if (found >= 0) {
      out.push({ t, p: found });
      pos = step(found);
      miss = 0;
    } else if (++miss > 3) break; // كلامٌ ليس في الكتاب: انتهت القراءة هنا
  }
  return out;
}
/** أحسن مطابقةٍ لكلمات T (مفاتيح) بالكتاب بين الموضعين lo و hi ← { hit:[{t,p}], m, score, anchors } أو null */
function alignIn(ix, T, lo, hi, rank) {
  const idf = (k) => 1 / Math.log(2 + (ix.df.get(k) || 0));
  // التصويت: كل سلسلةٍ ثلاثية من السطر وجدت في الكتاب تصوّت لموضعٍ فيه (الأندر أثقل صوتاً)
  const votes = new Map();
  for (let n = 0; n + 2 < T.length; n++) {
    const g = T[n] + ' ' + T[n + 1] + ' ' + T[n + 2];
    const hits = ix.grams.get(g);
    if (!hits || hits.length > 40) continue;
    const w = (idf(T[n]) + idf(T[n + 1]) + idf(T[n + 2])) / Math.sqrt(hits.length);
    for (const pos of hits) {
      if (pos < lo || pos > hi) continue;
      const b = Math.floor((pos - n) / 8) + ':' + Math.floor(pos / P);
      const v = votes.get(b) || { w: 0, n: 0, t: n, pos };
      v.w += w;
      v.n++;
      if (n < v.t) (v.t = n), (v.pos = pos);
      votes.set(b, v);
    }
  }
  const cands = [...votes.values()].sort((a, b) => b.w - a.w).slice(0, 6);
  let best = null;
  for (const c of cands) {
    const fw = walkAlign(ix, T, c.t, c.pos, 1);
    const bw = c.t > 0 ? walkAlign(ix, T, c.t - 1, ix.prev(c.pos), -1) : [];
    const hit = [...bw.reverse(), ...fw];
    if (!hit.length) continue;
    const m = hit.filter((h) => content(T[h.t])).length;
    const t1 = hit[0].t;
    const t2 = hit[hit.length - 1].t;
    const span = T.slice(t1, t2 + 1).filter(content).length || 1;
    const score = m / span;
    const r = { hit, m, score, anchors: c.n };
    r.v = rank ? rank(r) : m * score;
    // (عند التساوي: الأحدث في الكلام، أي ما يُقرأ الآن)
    if (!best || r.v > best.v || (r.v === best.v && t2 > best.hit[best.hit.length - 1].t)) best = r;
  }
  return best;
}
const strict = (r) => r && r.anchors >= 2 && r.m >= 5 && r.score >= 0.6;

/**
 * سطر التفريغ ← موضعه في الكتاب، أو null
 * @param {object} st حال التتبّع (يُحفظ بين السطور): { lock: موضع آخر مطابقة }
 * ← { page, endPage, from, to (موضعا أول المطابق وآخره)، words، score (كثافة المطابقة فيما قُرئ)، near }
 */
export function matchLine(ix, text, st = {}) {
  const T = String(text || '')
    .split(/\s+/)
    .map(keyOf)
    .filter(Boolean);
  const C = T.filter(content);
  if (C.length < 3 || !ix.size) return null;
  const tryRegion = (near) => alignIn(ix, T, near == null ? -Infinity : near - 3 * P, near == null ? Infinity : near + 6 * P);
  let r = null;
  let near = false;
  if (st.lock != null) {
    const b = tryRegion(st.lock);
    // قرب ما يُقرأ: شرطٌ أخفّ
    if (b && b.anchors >= 1 && b.m >= 3 && b.score >= 0.5) (r = b), (near = true);
  }
  if (!r) {
    // أول مطابقة (أو بعيداً عمّا كان يُقرأ): سطرٌ ممتلئ، وقراءةٌ فيه من الكتاب بالترتيب
    if (C.length < 6) return null;
    const b = tryRegion(null);
    if (strict(b)) r = b;
  }
  if (!r) return null;
  const from = r.hit[0].p;
  const to = r.hit[r.hit.length - 1].p;
  st.lock = to;
  st.page = Math.floor(to / P);
  return { page: Math.floor(from / P), endPage: Math.floor(to / P), from, to, words: r.hit.length, score: +r.score.toFixed(2), near };
}

/* ================================================================ التتبّع المباشر (كلمةً كلمة) */
/**
 * يتبع الشارح وهو يقرأ: يُعطى في كل مرةٍ آخر ما قيل (ما تمّ من السطور، والجاري كلمةً كلمة)،
 * فيعرف أين وصل في الكتاب. أول مرة: بعد عشر كلماتٍ فأكثر، وبالشرط الأول (سطرٌ ممتلئ مقروءٌ بالترتيب).
 * وبعدها: يُبحث قرب ما وصل إليه (من صفحةٍ قبله إلى ثلاثٍ بعده) بشرطٍ خفيف، وما لا يطابق من كلامه يُتغاضى عنه (شرحٌ منه)؛
 * ولا يترك موضعه إلا إذا طال كلامٌ لا يطابق ما حوله (عشر كلماتٍ ذات معنى فأكثر) ثم جاء كلامٌ يطابق موضعاً آخر بالشرط الأول.
 */
export function createFollower(ix, o = {}) {
  const MIN_WORDS = o.minWords || 10;
  const MISS = o.miss || 10;
  const TRAIL = o.trail || 40; // ما يُظلَّل خلف الكلمة الجارية (كلمات)
  const st = { lock: null, run: null, cur: null };
  const back = (pos, n) => {
    let p = pos;
    for (let k = 0; k < n; k++) {
      const q = ix.prev(p);
      if (q < 0) break;
      p = q;
    }
    return p;
  };
  const toks = (s) => String(s || '').split(/\s+/).map(keyOf).filter(Boolean);
  return {
    state: st,
    reset() {
      st.lock = st.run = st.cur = null;
    },
    /**
     * @param {string} before ما تمّ قبلُ (آخر السطور)
     * @param {string} now    السطر الجاري (جزئياً كان أو تامّاً)
     * ← { found, page, pos, jumped, inNow (في السطر الجاري شيءٌ مطابق)، miss (كلماتٌ بعد آخر مطابقة)، from, to } أو null (لم يُعرف بعد)
     */
    update(before, now) {
      const B = toks(before).slice(-36);
      const N = toks(now);
      const T = [...B, ...N].slice(-56);
      const cut = T.length - N.length;
      if (!ix.size || T.length < 3) return null;
      let r = null;
      let jumped = false;
      if (st.lock != null) {
        // آخر ما قيل أولاً (فإن أعاد ما قرأه قبل قليل تبعه)، ثم ما قيل كله (وآخره شرحٌ منه)
        const valid = (l) => l && l.anchors >= 1 && l.m >= 3 && l.score >= 0.4;
        const R = T.length > 16 ? T.slice(-16) : null;
        // (الأحدث أثقل: نصف وزن الكلمة كل ست كلمات إلى الوراء)
        const recent = (r) => r.hit.reduce((a, h) => a + (content(R[h.t]) ? 0.5 ** ((R.length - 1 - h.t) / 6) : 0), 0);
        const l1 = R && alignIn(ix, R, st.lock - P, st.lock + 3 * P, recent);
        if (valid(l1)) r = { ...l1, hit: l1.hit.map((h) => ({ t: h.t + T.length - 16, p: h.p })) };
        else {
          const l2 = alignIn(ix, T, st.lock - P, st.lock + 3 * P);
          if (valid(l2)) r = l2;
        }
      }
      const lastT = r ? r.hit[r.hit.length - 1].t : -1;
      const miss = T.slice(lastT + 1).filter(content).length;
      if (st.lock == null || miss >= MISS) {
        // لا موضع بعد، أو طال ما لا يطابق ما حوله: يُبحث في الكتاب كله فيما قيل بعد آخر مطابقة
        const off = st.lock == null ? 0 : lastT + 1;
        const seg = T.slice(off);
        if (seg.length >= (st.lock == null ? MIN_WORDS : 6) && seg.filter(content).length >= 6) {
          const g = alignIn(ix, seg, -Infinity, Infinity);
          // (والانتقال عن موضعٍ معروف يحتاج قراءةً أطول: سبع كلماتٍ ذات معنى، فلا ينقله اقتباسٌ قصير)
          if (strict(g) && (st.lock == null || g.m >= 7)) {
            const gp = g.hit[g.hit.length - 1].p;
            if (st.lock == null || gp < st.lock - P || gp > st.lock + 3 * P) {
              r = { ...g, hit: g.hit.map((h) => ({ t: h.t + off, p: h.p })) };
              jumped = st.lock != null;
              st.run = r.hit[0].p;
            }
          }
        }
      }
      if (!r) return st.cur == null ? null : { found: false, page: Math.floor(st.cur / P), pos: st.cur, miss, inNow: false, jumped: false };
      const to = r.hit[r.hit.length - 1].p;
      const first = r.hit[0].p;
      if (st.run == null || first < st.run - 3 * P || first > to) st.run = first;
      // رجع يعيد ما قرأ قبلُ: يبدأ التظليل منه
      if (to < st.cur && first < st.run) st.run = first;
      st.lock = st.cur = to;
      const from = Math.max(st.run, back(to, TRAIL));
      return { found: true, page: Math.floor(to / P), pos: to, from, to, jumped, miss: T.slice(r.hit[r.hit.length - 1].t + 1).filter(content).length, inNow: r.hit.some((h) => h.t >= cut) };
    },
  };
}

/** المطابق ← مستطيلاتٌ على الصفحات لتظليله: كل سطرٍ من أول كلمةٍ مطابقة فيه إلى آخرها (وما بينها) ← Map(صفحة ← [[u,v,w,h]]) */
export function boxesOf(ix, from, to) {
  const out = new Map();
  let pos = from;
  const rows = new Map(); // «صفحة:سطر» ← { i, l, x0, x1 }
  for (let guard = 0; pos >= 0 && pos <= to && guard < 4000; guard++, pos = ix.next(pos)) {
    const i = Math.floor(pos / P);
    const w = ix.word(pos);
    if (!w) continue;
    const id = i + ':' + w.l;
    const r = rows.get(id) || { i, l: w.l, x0: w.x0, x1: w.x1 };
    r.x0 = Math.min(r.x0, w.x0);
    r.x1 = Math.max(r.x1, w.x1);
    rows.set(id, r);
  }
  for (const r of rows.values()) {
    const ln = ix.pages.get(r.i).lines[r.l];
    if (!out.has(r.i)) out.set(r.i, []);
    out.get(r.i).push([r.x0 - 0.004, ln.top - 0.002, r.x1 - r.x0 + 0.008, ln.bottom - ln.top + 0.004]);
  }
  return out;
}
export const PAGE = P;
