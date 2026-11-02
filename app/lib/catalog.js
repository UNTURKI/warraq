// فهرس كتب «تراث» (عناوين + مؤلفين + تصنيفات) من ملف البيانات الذي يستعمله تطبيق تراث نفسه
// يُحمَّل في الذاكرة فقط (بيانات وصفية عامة، لا نصوص) ويُحدَّث كل ٢٤ ساعة.
// البنية تُكتشف آلياً لأن الملف قد يتغير: books كائن أو مصفوفة، والحقول name/n/title و author_id/a …
import { normalizeArabic, matchScore, lightStem } from '../shared/arabic.js';

export const DEFAULT_DATA_URL = process.env.TURATH_DATA || 'https://files.turath.io/data-v3.json';
const TTL = 24 * 3600 * 1000;

const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

function authorMap(root) {
  const m = new Map();
  const src = root.authors || root.a || {};
  const list = Array.isArray(src) ? src : Object.entries(src).map(([k, v]) => ({ _k: k, ...(typeof v === 'object' ? v : { name: v }) }));
  for (const a of list) {
    const id = pick(a, ['id', '_k']);
    const name = pick(a, ['name', 'n', 'title', 'full_name']);
    if (id !== undefined && name) m.set(String(id), String(name));
  }
  return m;
}

function catMap(root) {
  const m = new Map();
  const src = root.cats || root.categories || {};
  const list = Array.isArray(src) ? src : Object.entries(src).map(([k, v]) => ({ _k: k, ...v }));
  for (const c of list) {
    const id = pick(c, ['id', '_k']);
    const name = pick(c, ['name', 'n']);
    if (id !== undefined && name) m.set(String(id), String(name));
    for (const b of c.books || []) if (!m.has('b' + b)) m.set('b' + b, String(id));
  }
  return m;
}

/** يحوّل أي شكل معروف لقائمة الكتب إلى [{id,name,authorId,cat}] */
function extractBooks(root) {
  const candidates = [root.books, root.b, root.bks, root.data && root.data.books].filter(Boolean);
  for (const src of candidates) {
    const entries = Array.isArray(src) ? src.map((v, i) => [String(i), v]) : Object.entries(src);
    const out = [];
    for (const [k, v] of entries) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const name = pick(v, ['name', 'n', 'title', 't', 'book_name']);
        if (!name) continue;
        out.push({
          id: +pick(v, ['id', 'book_id']) || +k,
          name: String(name),
          authorId: pick(v, ['author_id', 'author', 'a', 'auth']),
          cat: pick(v, ['cat_id', 'cat', 'c', 'category']),
          info: pick(v, ['info', 'i']) || '',
        });
      } else if (Array.isArray(v)) {
        // شكل مضغوط: [id?, name, author, cat, ...]
        const name = v.find((x) => typeof x === 'string' && /[؀-ۿ]/.test(x));
        if (!name) continue;
        const nums = v.filter((x) => typeof x === 'number');
        out.push({ id: +k || nums[0], name, authorId: nums.length > 1 ? nums[1] : nums[0], cat: nums[2] });
      } else if (typeof v === 'string') {
        out.push({ id: +k, name: v });
      }
    }
    if (out.length > 50) return out;
  }
  return [];
}

/**
 * فهرس عناوين لمصدر بعينه (ملف بياناته). لكل ملف بيانات فهرسه وذاكرته.
 * @param {string} dataUrl
 */
function makeCatalog(dataUrl) {
  let cache = null; // { at, books: [{id,name,author,cat,norm,authNorm}], shape }
  let loading = null;

  async function load() {
    const res = await fetch(dataUrl, {
      headers: { accept: 'application/json', 'user-agent': 'AlWarraq/1.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const root = await res.json();
    const authors = authorMap(root);
    const cats = catMap(root);
    const raw = extractBooks(root);
    const books = raw
      .filter((b) => b.id && b.name)
      .map((b) => {
        const author = authors.get(String(b.authorId)) || '';
        const cat = b.cat !== undefined ? cats.get(String(b.cat)) : cats.get(cats.get('b' + b.id) || '');
        return { id: b.id, name: b.name, author, cat: cat || '', norm: normalizeArabic(b.name), authNorm: normalizeArabic(author) };
      });
    // إن لم تتضمن المؤلفين قائمة كتبهم مربوطة بالكتاب فاربطها من authors[].books
    const byId = new Map(books.map((b) => [b.id, b]));
    const srcA = root.authors || {};
    for (const [k, a] of Object.entries(srcA)) {
      for (const bid of (a && a.books) || []) {
        const b = byId.get(+bid);
        if (b && !b.author) {
          b.author = authors.get(String(a.id ?? k)) || '';
          b.authNorm = normalizeArabic(b.author);
        }
      }
    }
    const shape = { keys: Object.keys(root).slice(0, 12), books: books.length, authors: authors.size };
    console.log('[catalog] تم تحميل فهرس الكتب:', JSON.stringify(shape));
    return { at: Date.now(), books, shape };
  }

  async function get() {
    if (cache && Date.now() - cache.at < TTL) return cache;
    if (!loading) {
      loading = load()
        .then((c) => (cache = c))
        .catch((e) => {
          console.warn('[catalog] تعذّر تحميل فهرس الكتب:', e.message);
          return cache; // نبقي القديم إن وُجد
        })
        .finally(() => (loading = null));
    }
    return loading;
  }

  const status = () => (cache ? { loaded: true, ...cache.shape, at: new Date(cache.at).toISOString() } : { loaded: false });

  /** البحث في العناوين والمؤلفين (الشهرة) بمطابقة تطبيعية سريعة */
  async function search(q, limit = 60) {
    const c = await get();
    if (!c || !c.books.length) return null;
    const nq = normalizeArabic(q);
    const words = nq.split(' ').filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const b of c.books) {
      const hay = b.norm + ' ' + b.authNorm;
      // تصفية سريعة: كل كلمة (أو جذرها بلا «ال») يجب أن تظهر في العنوان أو المؤلف
      let ok = true;
      for (const w of words) {
        const bare = w.replace(/^(ال|و|ب|ل)/, '');
        const stem = lightStem(w);
        if (!hay.includes(w) && !(bare.length > 2 && hay.includes(bare)) && !(stem.length >= 3 && hay.includes(stem))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const t = matchScore(q, b.name);
      const a = matchScore(q, b.author);
      let score = Math.max(t * 1.25, a, (t + a) * 0.8);
      if (b.norm === nq) score += 1;
      else if (b.norm.startsWith(nq)) score += 0.5;
      hits.push({ id: b.id, name: b.name, author: b.author, cat: b.cat, score, source: 'title' });
    }
    hits.sort((x, y) => y.score - x.score || x.name.length - y.name.length);
    return hits.slice(0, limit);
  }

  /** بيانات كتاب من الفهرس (إن كان محمّلاً): الاسم واسم شهرة المؤلف */
  function book(id) {
    if (!cache) return null;
    if (!cache.byId) cache.byId = new Map(cache.books.map((b) => [b.id, b]));
    return cache.byId.get(+id) || null;
  }

  return { get, status, search, book, url: dataUrl };
}

const catalogs = new Map();
/** فهرس ملف بيانات (واحد لكل رابط) */
export function catalogFor(dataUrl) {
  const url = dataUrl || DEFAULT_DATA_URL;
  if (!catalogs.has(url)) catalogs.set(url, makeCatalog(url));
  return catalogs.get(url);
}

/* الفهرس الافتراضي («تراث»): الواجهة القديمة كما هي */
export const getCatalog = () => catalogFor().get();
export const catalogStatus = () => catalogFor().status();
export const searchCatalog = (q, limit) => catalogFor().search(q, limit);
export const catalogBook = (id) => catalogFor().book(id);
