// عميل API بصيغة «تراث» (api.turath.io) — بلا مفاتيح، مع إعادة المحاولة عند الأخطاء المؤقتة.
// يُنشأ عميل لكل مصدر (makeTurath): «تراث» نفسه افتراضياً، أو أي API يتكلم الصيغة نفسها يضيفه المالك.
import { matchScore, toLatinDigits } from '../shared/arabic.js';
import { parseCover } from '../shared/parser.js';
import { catalogFor } from './catalog.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_DIR } from './store.js';
import { DESKTOP } from './desktop.js';

export const DEFAULT_API = (process.env.TURATH_API || 'https://api.turath.io').replace(/\/$/, '');
const VER = 3;
/** ملفات الكتب الكاملة: «تراث» ينشر كل كتاب ملفاً واحداً (books-v3/<رقم>.json) فيه صفحاته كلها */
export const DEFAULT_FILES = (process.env.TURATH_FILES || 'https://files.turath.io').replace(/\/$/, '');
/** مسارات ملف الكتاب في FILES بالترتيب: الإصدار الثالث، ثم القديم */
export const BOOK_PATHS = ['books-v3', 'books'];

const safeJson = (s) => {
  if (s && typeof s === 'object') return s;
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

/** استخراج رقم الكتاب من رابط تراث أو رقم مباشر */
export function extractBookId(q) {
  const s = toLatinDigits(String(q || '').trim());
  const m = s.match(/turath\.io\/book\/(\d+)/i) || s.match(/^(\d{1,7})$/);
  return m ? +m[1] : null;
}

/**
 * عميل مصدر بصيغة «تراث».
 * @param {object} [o]
 * @param {string} [o.api]      عنوان الـAPI (الافتراضي: تراث)
 * @param {string|null} [o.dataUrl]  ملف بيانات الفهرس (عناوين ومؤلفون). null = بلا فهرس، وغائب = فهرس تراث
 * @param {string} [o.name]     اسم المصدر في رسائل الخطأ
 */
export function makeTurath(o = {}) {
  const API = String(o.api || DEFAULT_API).replace(/\/$/, '');
  const NAME = o.name || 'تراث';
  const catalog = o.dataUrl === null ? null : catalogFor(o.dataUrl);
  const FILES = o.files ? String(o.files).replace(/\/$/, '') : null;

  // إذا قال المصدر «طلبات كثيرة» (429) توقفت الطلبات كلها معاً حتى ينقضي ما طلبه، بدل أن يعيد كلُّ طلب
  // المحاولة وحده فيمدّ الحظر (كل محاولة مبكرة طلبٌ جديد يُحسب)
  let pausedUntil = 0;
  async function getJson(path, params = {}, { retries = 4 } = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries({ ...params, ver: VER })) if (v !== undefined && v !== '') url.searchParams.set(k, v);
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      const wait = pausedUntil - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': 'AlWarraq/1.0 (+book typesetting)' },
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 404) {
          const e = new Error(`غير موجود في «${NAME}»`);
          e.status = 404;
          throw e;
        }
        if (res.status === 429) {
          const ra = Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000;
          pausedUntil = Math.max(pausedUntil, Date.now() + ra);
          throw Object.assign(new Error('HTTP 429'), { retry: true, wait: 1 });
        }
        if (res.status >= 500) throw Object.assign(new Error('HTTP ' + res.status), { retry: true, wait: Math.min(30, Number(res.headers.get('retry-after')) || 0) * 1000 });
        if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
        return await res.json();
      } catch (e) {
        lastErr = e;
        if (e.status === 404 || (e.status && !e.retry)) throw e;
        await new Promise((r) => setTimeout(r, e.wait || 400 * 2 ** i + Math.random() * 200));
      }
    }
    throw lastErr;
  }

  /** البحث: أولاً في فهرس عناوين الكتب والمؤلفين، ثم يُكمَّل بالبحث النصي في «تراث» */
  async function searchBooks(q) {
    const direct = extractBookId(q);
    const out = [];
    const seen = new Set();
    if (direct) {
      try {
        const b = await getBook(direct);
        out.push({ id: direct, name: b.name, author: b.cover.author, hits: 0, score: 99, direct: true });
        seen.add(direct);
      } catch {}
    }
    const [cat, a, b] = await Promise.allSettled([
      catalog ? catalog.search(q) : Promise.resolve(null),
      getJson('/search', { q }),
      getJson('/search', { q, page: 2 }),
    ]);
    // ١) مطابقة العناوين في فهرس الكتب (كل الكتب، لا المواضع النصية فقط)
    const titleHits = cat.status === 'fulfilled' && cat.value ? cat.value : [];
    for (const h of titleHits) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      out.push({ ...h, hits: 0 });
    }
    // ٢) كتب ظهرت في البحث النصي ولم تطابق عناوينها
    const rows = [
      ...(a.status === 'fulfilled' ? a.value.data || [] : []),
      ...(b.status === 'fulfilled' ? b.value.data || [] : []),
    ];
    if (a.status === 'rejected' && !out.length) throw a.reason;
    const byBook = new Map();
    for (const r of rows) {
      const meta = safeJson(r.meta);
      const id = r.book_id;
      if (!id) continue;
      const known = out.find((o) => o.id === id);
      if (known) {
        known.hits = (known.hits || 0) + 1;
        continue;
      }
      if (!byBook.has(id)) {
        byBook.set(id, { id, name: meta.book_name || '', author: meta.author_name || '', cat: r.cat_id, hits: 0, source: 'text' });
      }
      byBook.get(id).hits++;
    }
    const textHits = [...byBook.values()].map((v) => {
      const t = matchScore(q, v.name);
      const au = matchScore(q, v.author);
      return { ...v, score: Math.max(t * 1.2, au) * 0.9 + Math.min(v.hits, 10) * 0.01 };
    });
    textHits.sort((x, y) => y.score - x.score);
    out.push(...textHits);
    return {
      count: out.length,
      titleSearch: titleHits.length > 0 || (cat.status === 'fulfilled' && cat.value !== null),
      results: out.slice(0, 80),
    };
  }


  /**
   * معلومات الكتاب والمجلدات وحدودها.
   * من ملف الكتاب الكامل نفسه إن كان للمصدر ملفات (فيه meta و indexes كما في /book): فالصفحات والفهرس من ملفٍ واحد،
   * ولا حاجة إلى مقابلة شيءٍ بشيء. وإن تعذّر الملف فمن الـAPI (ويُجلب الكتاب حينئذٍ صفحةً صفحة).
   */
  // ذاكرة قصيرة لبيانات الكتاب الوصفية فقط (لا نصوص) حتى لا يُطلب مرتين متتاليتين
  const bookCache = new Map();
  async function getBook(id) {
    const hit = bookCache.get(+id);
    if (hit && Date.now() - hit.at < 10 * 60e3) return hit.data;
    let data = FILES ? await bookFromFile(id).catch((e) => (tlog(`الكتاب ${id}: تعذّر ملفه (${e.message}) — من الـAPI`), null)) : null;
    if (!data) data = await getBookUncached(id);
    bookCache.set(+id, { at: Date.now(), data });
    if (bookCache.size > 100) bookCache.delete(bookCache.keys().next().value);
    return data;
  }

  async function authorOf(meta) {
    if (/المؤلف\s*:/.test(meta.info || '') || !meta.author_id) return '';
    try {
      const a = await getJson('/author', { id: meta.author_id }, { retries: 1 });
      return a.name || a.full_name || '';
    } catch {
      return '';
    }
  }
  function bookData(id, meta, idx, authorName) {
    const totalPages = (idx.page_map || []).length;
    const volumes = groupVolumes(pageIdBounds(idx.volume_bounds, idx.print_pg_to_pg), idx.page_map || [], totalPages);
    return {
      id: +id,
      name: meta.name || '',
      info: meta.info || '',
      cover: parseCover(meta, authorName),
      volumes,
      totalPages: totalPages || volumes.reduce((a, v) => a + v.pages, 0),
      // ترقيم الصفحات المطبوع («المجلد,الصفحة»): منه يُعرف تقسيم الطبعة إن جُمعت مجلداتها في مجلدٍ واحد
      pageMap: Array.isArray(idx.page_map) && idx.page_map.length <= 60000 ? idx.page_map.map((x) => (x == null ? '' : String(x).slice(0, 16))) : [],
      book: { meta: { id: meta.id, name: meta.name, info: meta.info }, indexes: { headings: idx.headings || [] } },
    };
  }
  async function getBookUncached(id) {
    const j = await getJson('/book', { id, include: 'indexes' });
    const meta = j.meta || {};
    return bookData(id, meta, j.indexes || {}, await authorOf(meta));
  }
  /** بيانات الكتاب من ملفه الكامل (فيه meta و indexes و indexes_generated كما في /book) */
  async function bookFromFile(id) {
    const f = await bookFile(id);
    if (!f.meta || !Array.isArray(f.idx.page_map)) throw new Error('ملف الكتاب بلا فهرس');
    const data = bookData(id, f.meta, f.idx, await authorOf(f.meta));
    // عدد الصفحات عددُ صفحات الملف نفسه
    if (data.totalPages !== f.pages.length) {
      data.totalPages = f.pages.length;
      data.volumes = groupVolumes(pageIdBounds(f.idx.volume_bounds, f.idx.print_pg_to_pg), f.idx.page_map, f.pages.length);
    }
    data.fromFile = true;
    return data;
  }

  /* ------------------------------------------------------------------
     جلب الكتاب دفعة واحدة.
     سبب البطء القديم: كانت كل صفحة طلباً مستقلاً إلى api.turath.io (ستة طلبات معاً). و«تراث» يحدّ عدد
     الطلبات في كل فترة؛ فبعد نحو ١٤٥ صفحة يردّ بـ«طلبات كثيرة» (429)، فيقف الجلب حتى تنفتح الفترة التالية.
     والحل: ملف الكتاب الكامل (files.turath.io/books/<رقم>.json) طلبٌ واحد مهما كثرت صفحاته، فيه الصفحات
     وفهارس الكتاب معاً. يبدأ تنزيله حين يُختار الكتاب، ويُحفظ في الذاكرة، وفي البرنامج يُحفظ على الجهاز
     أيضاً (مضغوطاً) فلا يُنزَّل الكتاب مرة ثانية.
     ولا يُقابَل الملف بصفحاتٍ من الـAPI: بيانات الكتاب نفسها من الملف (getBook)، فلا يُطلب من الـAPI شيءٌ أثناء الجلب.
     والتنزيل في البرنامج بشبكة Chromium نفسها (net.fetch من Electron: وكيل الجهاز وشهاداته) ثم بـ fetch في Node،
     وسبب كل إخفاق يُكتب في logs/turath.log. */
  const fileCache = new Map(); // رقم الكتاب ← { at, promise }
  function bookFile(id) {
    const hit = fileCache.get(+id);
    if (hit && Date.now() - hit.at < 30 * 60e3) return hit.promise;
    const promise = (async () => {
      const j = decodeBookFile((await diskCache.read(FILES, id)) || (await downloadFile(id)));
      if (!j || !Array.isArray(j.pages) || !j.pages.length) throw new Error('ملف الكتاب بلا صفحات');
      return {
        meta: j.meta || null,
        idx: { ...(j.indexes || {}), ...(j.indexes_generated || {}) },
        pages: j.pages.map((p, i) => ({ page_id: i + 1, text: (p && p.text) || '', meta: { page_id: i + 1, page: p && p.page != null ? p.page : null, vol: p && p.vol != null ? String(p.vol) : null } })),
      };
    })();
    fileCache.set(+id, { at: Date.now(), promise });
    // لا تبقى في الذاكرة إلا ثلاثة كتب، ولا يُحفظ الفشل
    if (fileCache.size > 3) fileCache.delete(fileCache.keys().next().value);
    promise.catch(() => { if (fileCache.get(+id)?.promise === promise) fileCache.delete(+id); });
    return promise;
  }
  async function downloadFile(id) {
    // books-v3 هو المنشور اليوم (books القديم يردّ 404)؛ ويُجرَّب القديم إن غاب الجديد
    const urls = BOOK_PATHS.map((p) => `${FILES}/${p}/${+id}.json`);
    // شبكة البرنامج (Chromium) أولاً، ثم Node؛ ولكلٍّ محاولتان
    const ways = [globalThis.__warraqNetFetch, fetch].filter(Boolean);
    let lastErr;
    for (let i = 0; i < ways.length * 2; i++) {
      const get = ways[i % ways.length];
      const url = urls[0];
      const t = Date.now();
      try {
        const res = await get(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(300_000) });
        if (res.status === 404) throw Object.assign(new Error('HTTP 404'), { status: 404 });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        const j = JSON.parse(buf.toString('utf8'));
        tlog(`الكتاب ${id}: نُزّل ملفه (${Math.round(buf.length / 1024)} ك.ب، ${Array.isArray(j.pages) ? j.pages.length : 0} صفحة) في ${((Date.now() - t) / 1000).toFixed(1)} ث${get === fetch ? ' (Node)' : ''}`);
        diskCache.write(FILES, id, buf);
        return j;
      } catch (e) {
        lastErr = e;
        tlog(`الكتاب ${id}: تعذّر تنزيل ملفه ${url} ${get === fetch ? '(Node)' : '(Chromium)'}: ${e.message}${e.cause ? ' — ' + (e.cause.code || e.cause.message) : ''}`);
        if (e.status === 404) {
          // غير موجود في هذا المسار: المسار التالي، فإن لم يبقَ شيء فلا ملف للكتاب
          urls.shift();
          if (!urls.length) break;
          i--;
          continue;
        }
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * صفحات من..إلى من ملف الكتاب الكامل. null إن لم يكن للمصدر ملفات كاملة أو تعذّر الملف (فيعود الجلب صفحةً صفحة).
   */
  async function getPages(bookId, from, to) {
    if (!FILES) return null;
    try {
      const [f, book] = await Promise.all([bookFile(bookId), getBook(bookId)]);
      const pages = f.pages;
      const off = offsetOf(bookId, f, book);
      if (off === null) {
        tlog(`الكتاب ${bookId}: صفحات الملف (${pages.length}) لا توافق فهرس الكتاب المحفوظ (${book.totalPages})`);
        return null;
      }
      const a = from - 1 + off, b = to + off;
      if (a < 0 || b > pages.length) return null;
      // أرقام الصفحات أرقامُ الفهرس (لا مواضعها في الملف)
      return pages.slice(a, b).map((p, i) => ({ ...p, page_id: from + i, meta: { ...p.meta, page_id: from + i } }));
    } catch (e) {
      tlog(`الكتاب ${bookId}: لا ملف (${e.message}) — صفحةً صفحة`);
      return null;
    }
  }
  /**
   * موضع صفحات الفهرس في الملف: صفر إن كان الفهرس من الملف نفسه أو تساوى العددان.
   * وإن اختلفا (كتابٌ اختير قبل هذا الإصدار، فعدد صفحاته من الـAPI) قوبل ترقيم الطبعة فيهما — بلا أي طلب.
   */
  const offsets = new Map();
  function offsetOf(bookId, f, book) {
    const total = book.totalPages;
    if (book.fromFile || !total || f.pages.length === total) return 0;
    if (offsets.has(+bookId)) return offsets.get(+bookId);
    const found = mapOffset(book.pageMap, f.idx.page_map) ?? null;
    offsets.set(+bookId, found);
    if (offsets.size > 50) offsets.delete(offsets.keys().next().value);
    return found;
  }

  async function getPage(bookId, pg) {
    // صفحة من ملف الكتاب إن كان حاضراً (في الذاكرة أو على الجهاز) ومطابقاً للفهرس: بلا طلب إلى الـAPI
    if (FILES && fileCache.has(+bookId) && bookCache.has(+bookId)) {
      const got = await getPages(bookId, +pg, +pg);
      if (got && got[0]) return got[0];
    }
    const j = await getJson('/page', { book_id: bookId, pg });
    return { page_id: +pg, text: j.text || '', meta: safeJson(j.meta) };
  }

  /** اقتراحات فورية أثناء الكتابة: من فهرس العناوين فقط */
  const quick = async (q, limit = 12) => (catalog ? (await catalog.search(q, limit)) || [] : []);
  /** فحص الاتصال: طلب بحث واحد بلا إعادة محاولة */
  const ping = async () => {
    const j = await getJson('/search', { q: 'كتاب' }, { retries: 0 });
    return { ok: true, results: Array.isArray(j.data) ? j.data.length : 0 };
  };

  return { api: API, name: NAME, catalog, searchBooks, getBook, getPage, getPages, quick, ping };
}

/* تمييز المجلدات الحقيقية من أقسام الكتاب:
   تراث قد يجعل الأبواب/الأقسام «مجلدات» في volume_bounds. المجلد المطبوع الحقيقي يبدأ ترقيمه من جديد،
   أما القسم فيكمل ترقيم ما قبله. فنضم الأقسام المتصلة الترقيم إلى مجلد واحد، ونغطي الصفحات الساقطة بين الحدود. */
function printedPage(pageMap, pageId) {
  const v = pageMap[pageId - 1];
  if (v == null) return NaN;
  const parts = String(v).split(',');
  return parseInt(toLatinDigits(parts[parts.length - 1]), 10);
}
function printedVol(pageMap, pageId) {
  const v = pageMap[pageId - 1];
  if (v == null) return null;
  const parts = String(v).split(',');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * حدود المجلدات بأرقام الصفحات المتسلسلة.
 * في الإصدار الثالث (ver=3 و books-v3) volume_bounds أرقامُ الطبعة («المجلد ١: من ص٢ إلى ص١٧٣»)، لا أرقام الصفحات؛
 * فتُحوَّل بـ print_pg_to_pg («المجلد,الصفحة» ← رقم الصفحة). وإن لم يوجد ما يقابل الحدود فهي أرقام صفحات أصلاً: كما هي.
 */
export function pageIdBounds(bounds, printToPage) {
  if (!bounds || !printToPage || typeof printToPage !== 'object') return bounds;
  const out = {};
  for (const [vol, b] of Object.entries(bounds)) {
    if (!Array.isArray(b)) return bounds;
    const s = printToPage[`${vol},${b[0]}`], e = printToPage[`${vol},${b[1]}`];
    if (!s || !e) return bounds;
    out[vol] = [s, e];
  }
  return out;
}

export function groupVolumes(bounds, pageMap, totalPages) {
  const parts = Object.entries(bounds || {})
    .map(([vol, [start, end]]) => ({ vol, start: +start, end: +end }))
    .filter((p) => p.start && p.end >= p.start)
    .sort((x, y) => x.start - y.start);
  if (!parts.length) return totalPages ? [{ vol: '1', label: null, start: 1, end: totalPages, pages: totalPages, parts: [] }] : [];
  // تغطية الصفحات الساقطة: قبل أول مجلد، وبين المجلدات، وبعد آخرها
  parts[0].start = 1;
  for (let i = 1; i < parts.length; i++) if (parts[i].start > parts[i - 1].end + 1) parts[i - 1].end = parts[i].start - 1;
  if (totalPages && parts[parts.length - 1].end < totalPages) parts[parts.length - 1].end = totalPages;

  const groups = [];
  for (const p of parts) {
    const g = groups[groups.length - 1];
    const ps = printedPage(pageMap, p.start);
    const prevEnd = g ? printedPage(pageMap, g.end) : NaN;
    const pv = printedVol(pageMap, p.start);
    const gv = g ? printedVol(pageMap, g.end) : null;
    const continues =
      g &&
      ((pv !== null && gv !== null && pv === gv) || // نفس رقم المجلد المطبوع
        (Number.isFinite(ps) && Number.isFinite(prevEnd) && ps > 3 && ps >= prevEnd && ps - prevEnd <= 12)); // ترقيم متصل
    if (continues) {
      g.end = p.end;
      g.parts.push(p.vol);
    } else groups.push({ vol: p.vol, start: p.start, end: p.end, parts: [p.vol] });
  }
  const numeric = (s) => /^\s*[0-9٠-٩]+\s*$/.test(s);
  const used = new Set();
  return groups.map((g, i) => {
    const num = g.parts.find(numeric);
    // مجلدٌ باسمٍ لا برقم («المقدمة»، «الفهارس»): يبقى اسمه، فلا يأخذ رقم مجلدٍ حقيقي فتنزاح الأرقام بعده
    const named = !num && groups.length > 1 && g.parts.length === 1 && String(g.parts[0]).trim();
    let key = num ? toLatinDigits(num).trim() : named || (groups.length === 1 ? '1' : String(i + 1));
    while (used.has(key)) key = String(+key + 1 || i + 1);
    used.add(key);
    return { vol: key, start: g.start, end: g.end, pages: g.end - g.start + 1, parts: g.parts.length > 1 ? g.parts : [] };
  });
}

/* ------------------------------------------------------------------
   فك ملف الكتاب بصيغة books-v3.
   أسماء الحقول فيه حروفٌ عربية (الفتحتان فما بعدها: «ً» = meta، «٘» = indexes ...) بدل meta و indexes و headings ...
   والحرف ليس ثابتاً لكل حقل (يختلف من كتاب لآخر)، لكن ترتيب الحقول ترتيبُها نفسه في /book من الـAPI، والحروف
   تتصاعد بترتيبها. فيُقابَل كل حقلٍ مرمَّز بالحقل التالي المتوقَّع الذي يوافقه نوعُ قيمته.
   أما pages ونصوص الصفحات (text, vol, page) والعناوين (title, level, page) فبأسمائها كما هي. */
const META_FIELDS = [
  ['id', 'num'], ['name', 'str'], ['type', 'num'], ['printed', 'num'], ['pdf_links', 'obj'], ['info', 'str'],
  ['info_long', 'str'], ['version', 'str'], ['author_id', 'num'], ['cat_id', 'num'], ['date_built', 'num'], ['author_page_start', 'num'],
];
const INDEX_FIELDS = [
  ['volumes', (v) => Array.isArray(v) && v.every((x) => x == null || typeof x !== 'object')],
  ['headings', (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'title' in x)],
  ['print_pg_to_pg', (v) => isObj(v) && Object.values(v).every((x) => typeof x === 'number')],
  ['volume_bounds', (v) => isObj(v) && Object.values(v).every((x) => Array.isArray(x) && x.length === 2)],
  ['page_map', (v) => Array.isArray(v) && v.every((x) => x == null || typeof x === 'string')],
  ['page_headings', (v) => isObj(v) && Object.values(v).every(Array.isArray)],
  ['non_author', Array.isArray],
];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const KIND = { num: (v) => typeof v === 'number', str: (v) => typeof v === 'string', obj: isObj };
const coded = (k) => /^[^\x00-\x7f]+$/.test(k); // اسمٌ مرمَّز (بلا حروف لاتينية)
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** حقول كائنٍ مرمَّز بأسمائها: fields = [[الاسم، فحص النوع]...] بترتيبها في الـAPI */
function decodeFields(o, fields) {
  const out = {};
  let at = 0;
  for (const k of Object.keys(o).filter(coded).sort(byCode)) {
    const v = o[k];
    let j = at;
    while (j < fields.length && !fields[j][1](v)) j++;
    if (j === fields.length) continue; // حقلٌ لا يُعرف: يُترك
    out[fields[j][0]] = v;
    at = j + 1;
  }
  // الحقول ذات الأسماء اللاتينية (numbers, number_max ...) كما هي
  for (const k of Object.keys(o)) if (!coded(k)) out[k] = o[k];
  return out;
}

/**
 * ملف الكتاب بصيغة واحدة { meta, indexes, indexes_generated?, pages } أياً كان مصدره:
 * الصيغة القديمة (books/) تمرّ كما هي، وصيغة books-v3 المرمَّزة تُفكّ.
 */
export function decodeBookFile(j) {
  if (!isObj(j) || j.meta || j.indexes) return j;
  const objs = Object.keys(j).filter((k) => coded(k) && isObj(j[k])).sort(byCode).map((k) => j[k]);
  if (!objs.length) return j;
  // meta: فيه نصوص (الاسم والبطاقة) في حقوله المرمَّزة؛ والفهارس كلها مصفوفات وكائنات
  const hasText = (o) => Object.keys(o).some((k) => coded(k) && typeof o[k] === 'string');
  const metaRaw = objs.find(hasText);
  const idxRaw = objs.find((o) => o !== metaRaw);
  const out = { ...j };
  for (const k of Object.keys(out)) if (coded(k)) delete out[k];
  if (metaRaw) out.meta = decodeFields(metaRaw, META_FIELDS.map(([n, t]) => [n, KIND[t]]));
  if (idxRaw) out.indexes = decodeFields(idxRaw, INDEX_FIELDS);
  return out;
}

/**
 * الإزاحة بين صفحات الفهرس وصفحات الملف بمقابلة ترقيم الطبعة («المجلد,الصفحة») في كليهما.
 * عدد إن اتفقت إزاحة واحدة على ٩٠٪ من العيّنة، و null إن لم تتفق، و undefined إن غاب الترقيم من أحدهما.
 */
export function mapOffset(apiMap, fileMap) {
  if (!Array.isArray(apiMap) || !Array.isArray(fileMap) || apiMap.length < 2 || fileMap.length < 2) return undefined;
  const key = (x) => (x == null ? '' : toLatinDigits(String(x)).replace(/\s+/g, '').slice(0, 16));
  const A = apiMap.map(key), F = fileMap.map(key);
  const step = Math.max(1, Math.floor(A.length / 400));
  let best = null, bestScore = 0;
  for (let d = -40; d <= 40; d++) {
    let n = 0, ok = 0;
    for (let i = 0; i < A.length; i += step) {
      if (!A[i]) continue;
      const j = i + d;
      if (j < 0 || j >= F.length) continue;
      n++;
      if (A[i] === F[j]) ok++;
    }
    const score = n ? ok / n : 0;
    if (n >= Math.min(10, A.length / 2) && score > bestScore) (bestScore = score), (best = d);
  }
  return bestScore >= 0.9 ? best : null;
}

/** سجلّ جلب الكتب (في البرنامج): logs/turath.log بجانب مجلد البيانات — منه يُعرف لماذا جُلب كتابٌ صفحةً صفحة */
const LOG = DESKTOP ? path.join(DATA_DIR, '..', 'logs', 'turath.log') : null;
function tlog(msg) {
  if (!LOG) return;
  const line = new Date().toISOString().replace('T', ' ').slice(0, 19) + '  ' + msg + '\n';
  fsp.mkdir(path.dirname(LOG), { recursive: true }).then(() => fsp.appendFile(LOG, line)).catch(() => {});
}

/* ملفات الكتب على الجهاز (في البرنامج فقط؛ الموقع لا يحفظ نصوص الكتب): مضغوطة، تُستعمل ثلاثين يوماً،
   ولا يتجاوز مجموعها ١٫٥ غيغابايت (يُحذف الأقدم استعمالاً). */
const diskCache = (() => {
  const DIR = DESKTOP ? path.join(DATA_DIR, 'books-cache') : null;
  const MAX_AGE = 30 * 864e5, MAX_BYTES = 1.5 * 1024 ** 3;
  const fileOf = (base, id) => path.join(DIR, `${String(base).replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]+/gi, '_')}-${+id}.json.gz`);
  async function read(base, id) {
    if (!DIR) return null;
    const f = fileOf(base, id);
    try {
      const st = await fsp.stat(f);
      if (Date.now() - st.mtimeMs > MAX_AGE) return null;
      const j = JSON.parse(zlib.gunzipSync(await fsp.readFile(f)).toString('utf8'));
      fsp.utimes(f, new Date(), st.mtime).catch(() => {}); // آخر استعمال
      return j;
    } catch {
      return null;
    }
  }
  function write(base, id, buf) {
    if (!DIR) return;
    (async () => {
      await fsp.mkdir(DIR, { recursive: true });
      const f = fileOf(base, id);
      const tmp = f + '.' + process.pid + '.tmp';
      await fsp.writeFile(tmp, await new Promise((ok, no) => zlib.gzip(buf, { level: 6 }, (e, r) => (e ? no(e) : ok(r)))));
      await fsp.rename(tmp, f);
      // الحدّ الأعلى للحجم: يُحذف الأقدم استعمالاً
      const all = [];
      for (const n of await fsp.readdir(DIR)) {
        if (!n.endsWith('.json.gz')) continue;
        const st = await fsp.stat(path.join(DIR, n)).catch(() => null);
        if (st) all.push({ f: path.join(DIR, n), size: st.size, at: st.atimeMs > st.mtimeMs ? st.atimeMs : st.mtimeMs });
      }
      all.sort((a, b) => b.at - a.at);
      let sum = 0;
      for (const x of all) if ((sum += x.size) > MAX_BYTES && x.f !== f) await fsp.unlink(x.f).catch(() => {});
    })().catch(() => {});
  }
  return { read, write };
})();

/* المصدر الافتراضي («تراث»): الواجهة القديمة كما هي */
let defaultClient = null;
const def = () => (defaultClient ||= makeTurath());
export const searchBooks = (q) => def().searchBooks(q);
export const getBook = (id) => def().getBook(id);
export const getPage = (id, pg) => def().getPage(id, pg);
