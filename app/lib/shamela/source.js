// مصدر «المكتبة الشاملة» على الجهاز (الإصدار الرابع): مجلد ‎database‎ في الشاملة، يُقرأ كما هو بلا نسخ.
// يعطي ما يعطيه مصدر «تراث» بالصيغة نفسها (بيانات الكتاب، ترقيم الطبعة، العناوين، نص الصفحات)،
// فيمر الكتاب بالمسار كله كأي كتاب، ومنه يُصنع «ورق» عند فتحه في المحرِّر.
//   master.db                    الكتب والمؤلفون والأقسام
//   book/<آخر ٣ أرقام>/<رقم>.db  صفحات الكتاب (المجلد ورقم الصفحة المطبوع) وعناوينه (الصفحة والأب)
//   store/page                   نص الصفحات (فهرس Lucene): المفتاح «رقم الكتاب-رقم الصفحة في ملف الكتاب»
//   store/title                  نص العناوين بالمفتاح نفسه «رقم الكتاب-رقم العنوان»
import fs from 'node:fs';
import path from 'node:path';
import { ShamelaPages } from './lucene.js';
import { parseCover } from '../../shared/parser.js';
import { normalizeArabic, matchScore } from '../../shared/arabic.js';
import { groupVolumes } from '../turath.js';

const httpErr = (status, message) => Object.assign(new Error(message), { status });

let sqliteMod = null;
async function openDb(file) {
  if (!sqliteMod) {
    try {
      sqliteMod = await import('node:sqlite');
    } catch {
      throw httpErr(501, 'قراءة الشاملة تحتاج إصداراً أحدث من البرنامج (node:sqlite)');
    }
  }
  return new sqliteMod.DatabaseSync(file, { readOnly: true });
}

/** هل المسار مجلد ‎database‎ في الشاملة؟ يُقبل أيضاً مجلد الشاملة نفسه (فيه database) */
export function resolveRoot(dir) {
  const d = path.resolve(String(dir || ''));
  if (fs.existsSync(path.join(d, 'master.db'))) return d;
  if (fs.existsSync(path.join(d, 'database', 'master.db'))) return path.join(d, 'database');
  return null;
}

/* ---------------------------------------------------------------- المكتبة المفتوحة (واحدة لكل مسار) */
const libs = new Map(); // المسار ← حالة المكتبة
function libraryFor(dir) {
  const root = resolveRoot(dir);
  if (!root) throw httpErr(503, 'لم أجد مكتبة الشاملة في هذا المجلد (لا ملف master.db)');
  let L = libs.get(root);
  if (!L) {
    L = { root, master: null, pages: null, titles: null, books: new Map(), errors: [] };
    libs.set(root, L);
  }
  return L;
}
export function forgetLibrary(dir) {
  const root = resolveRoot(dir);
  const L = root && libs.get(root);
  if (!L) return;
  try { L.pages?.close(); L.titles?.close(); } catch {}
  libs.delete(root);
}

async function master(L) {
  if (L.master) return L.master;
  const db = await openDb(path.join(L.root, 'master.db'));
  try {
    const authors = new Map(db.prepare('SELECT author_id, author_name, death_text FROM author').all().map((a) => [a.author_id, a]));
    const cats = new Map(db.prepare('SELECT category_id, category_name FROM category').all().map((c) => [c.category_id, c.category_name]));
    const books = new Map();
    for (const b of db.prepare('SELECT book_id, book_name, book_category, authors, main_author, book_date FROM book WHERE hidden IS NULL OR hidden = 0').all()) {
      const ids = String(b.authors || b.main_author || '').split(',').map((x) => +x.trim()).filter(Boolean);
      const names = ids.map((i) => authors.get(i)?.author_name).filter(Boolean);
      books.set(b.book_id, {
        id: b.book_id,
        name: b.book_name || '',
        cat: cats.get(b.book_category) || '',
        authorIds: ids,
        author: names.join('، '),
        death: b.book_date || null,
        norm: normalizeArabic(b.book_name || ''),
        authNorm: normalizeArabic(names.join(' ')),
      });
    }
    L.master = { books, authors };
  } finally {
    db.close();
  }
  return L.master;
}
function pagesIndex(L) {
  // مقطع تالف لا يُسقط المكتبة كلها: يُتخطى ويُذكر في الفحص
  if (!L.pages) L.pages = new ShamelaPages(path.join(L.root, 'store', 'page'), { onSegmentError: (n, e) => L.errors.push('page/' + n + ': ' + e.message) });
  return L.pages;
}
function titlesIndex(L) {
  if (L.titles === null) {
    try {
      L.titles = new ShamelaPages(path.join(L.root, 'store', 'title'), { onSegmentError: (n, e) => L.errors.push('title/' + n + ': ' + e.message) });
    } catch {
      L.titles = false; // بلا فهرس عناوين: العناوين من النص فقط
    }
  }
  return L.titles || null;
}

/* ---------------------------------------------------------------- نص الصفحة بصيغة «تراث» */
const nl = (s) => String(s || '').replace(/\r\n?/g, '\n');
// إحالة الحاشية في الشاملة «(¬١)» هي «(^١)» في «تراث»؛ وعنوان ‎class='title'‎ هو ‎data-type="title"‎
const markup = (s) => nl(s).replace(/¬/g, '^').replace(/<span\s+class=['"]?title['"]?\s*>/gi, '<span data-type="title">');
function pageText(rec) {
  if (!rec) return '';
  const body = markup(rec.body).trim();
  const foot = markup(rec.foot).trim();
  // صفحات المقدمات في الشاملة نصها كله في حقل الحاشية بلا متن: هو نص الصفحة نفسه، لا حاشية
  if (!body) return foot;
  return foot ? body + '\n__________\n' + foot : body;
}
const plain = (s) => nl(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- الكتاب */
function bookDbPath(root, id) {
  return path.join(root, 'book', String(id % 1000).padStart(3, '0'), id + '.db');
}

async function loadBook(L, id) {
  const hit = L.books.get(id);
  if (hit) {
    hit.at = Date.now();
    return hit;
  }
  const M = await master(L);
  const meta = M.books.get(id);
  if (!meta) throw httpErr(404, 'الكتاب غير موجود في مكتبة الشاملة');

  // نص الصفحات بمفاتيحها (رقم الصفحة في ملف الكتاب ← النص)
  const recs = new Map();
  for (const p of pagesIndex(L).bookPages(id)) {
    const n = +String(p.key).split('-')[1];
    if (!recs.has(n)) recs.set(n, p);
  }

  // صفحات الكتاب وعناوينه من ملفه؛ وإن لم يوجد فمن مفاتيح النص وحدها
  let rows = null, titles = [];
  const file = bookDbPath(L.root, id);
  if (fs.existsSync(file)) {
    const db = await openDb(file);
    try {
      rows = db.prepare('SELECT id, part, page FROM page ORDER BY id').all();
      titles = db.prepare('SELECT id, page, parent FROM title ORDER BY id').all();
    } finally {
      db.close();
    }
  }
  if (!rows || !rows.length) rows = [...recs.keys()].sort((a, b) => a - b).map((n) => ({ id: n, part: null, page: null }));
  if (!rows.length) throw httpErr(404, 'لا نص لهذا الكتاب في فهرس الشاملة');

  const indexOf = new Map(rows.map((r, i) => [r.id, i + 1]));
  const texts = rows.map((r) => pageText(recs.get(r.id)));
  const pageMap = rows.map((r) => (r.page == null || r.page === '' ? '' : (r.part ? `${r.part},${r.page}` : String(r.page))).slice(0, 16));

  // حدود المجلدات من عمود المجلد (part)
  const bounds = {};
  rows.forEach((r, i) => {
    if (r.part == null || r.part === '') return;
    const k = String(r.part);
    if (!bounds[k]) bounds[k] = [i + 1, i + 1];
    else bounds[k][1] = i + 1;
  });
  const volumes = groupVolumes(bounds, pageMap, rows.length);

  // العناوين: نصها من فهرس العناوين، ومستواها من سلسلة آبائها
  const headings = [];
  if (titles.length) {
    const tIndex = titlesIndex(L);
    const tText = new Map();
    if (tIndex) for (const t of tIndex.bookPages(id)) tText.set(+String(t.key).split('-')[1], plain(t.body || t.foot));
    const parentOf = new Map(titles.map((t) => [t.id, t.parent]));
    const level = (tid) => {
      let d = 1, p = parentOf.get(tid), guard = 0;
      while (p && guard++ < 20) { d++; p = parentOf.get(p); }
      return Math.min(d, 6);
    };
    for (const t of titles) {
      const title = tText.get(t.id);
      const page = indexOf.get(t.page);
      if (title && page) headings.push({ title, level: level(t.id), page });
    }
  }

  const authorRec = M.authors.get(meta.authorIds[0]);
  const death = authorRec?.death_text && /^\d+$/.test(authorRec.death_text) ? ` (ت ${authorRec.death_text}هـ)` : '';
  const info = [`الكتاب: ${meta.name}`, meta.author ? `المؤلف: ${meta.author}${death}` : '', meta.cat ? `القسم: ${meta.cat}` : ''].filter(Boolean).join('\n');

  const data = {
    id,
    name: meta.name,
    info,
    cover: parseCover({ info, name: meta.name }, meta.author),
    volumes,
    totalPages: rows.length,
    pageMap: rows.length <= 60000 ? pageMap : [],
    book: { meta: { id, name: meta.name, info }, indexes: { headings } },
  };
  const entry = { at: Date.now(), data, rows, texts };
  L.books.set(id, entry);
  // في الذاكرة آخر ثلاثة كتب فقط
  while (L.books.size > 3) {
    let oldest = null;
    for (const [k, v] of L.books) if (!oldest || v.at < L.books.get(oldest).at) oldest = k;
    L.books.delete(oldest);
  }
  return entry;
}

const pageOut = (e, pg) => {
  const r = e.rows[pg - 1];
  return { page_id: pg, text: e.texts[pg - 1] || '', meta: { page_id: pg, page: r && r.page != null ? r.page : null, vol: r && r.part ? String(r.part) : null } };
};

/* ---------------------------------------------------------------- واجهة المصدر (كواجهة «تراث») */
export function makeShamela({ dir, name = 'الشاملة' } = {}) {
  const L = () => libraryFor(dir);

  async function searchBooks(q) {
    const M = await master(L());
    const out = [];
    const direct = /^\s*(\d{1,7})\s*$/.exec(String(q || ''));
    if (direct && M.books.has(+direct[1])) {
      const b = M.books.get(+direct[1]);
      out.push({ id: b.id, name: b.name, author: b.author, cat: b.cat, hits: 0, score: 99, direct: true });
    }
    const words = normalizeArabic(q).split(' ').filter(Boolean);
    if (words.length) {
      const hits = [];
      for (const b of M.books.values()) {
        const hay = b.norm + ' ' + b.authNorm;
        if (!words.every((w) => hay.includes(w) || (w.replace(/^(ال|و|ب|ل)/, '').length > 2 && hay.includes(w.replace(/^(ال|و|ب|ل)/, ''))))) continue;
        if (out[0] && out[0].id === b.id) continue;
        const score = Math.max(matchScore(q, b.name) * 1.2, matchScore(q, b.author));
        hits.push({ id: b.id, name: b.name, author: b.author, cat: b.cat, hits: 0, score, source: 'title' });
      }
      hits.sort((a, b) => b.score - a.score);
      out.push(...hits);
    }
    return { count: out.length, titleSearch: true, results: out.slice(0, 80) };
  }
  const quick = async (q, limit = 12) => (await searchBooks(q)).results.slice(0, limit);

  async function getBook(id) {
    return (await loadBook(L(), +id)).data;
  }
  async function getPage(id, pg) {
    const e = await loadBook(L(), +id);
    if (!(pg >= 1 && pg <= e.rows.length)) throw httpErr(404, 'الصفحة غير موجودة');
    return pageOut(e, +pg);
  }
  async function getPages(id, from, to) {
    const e = await loadBook(L(), +id);
    const a = Math.max(1, +from), b = Math.min(e.rows.length, +to);
    const out = [];
    for (let pg = a; pg <= b; pg++) out.push(pageOut(e, pg));
    return out;
  }
  /** فحص المجلد: كم كتاباً، وهل يُقرأ فهرس النص */
  async function ping() {
    const lib = L();
    const M = await master(lib);
    const idx = pagesIndex(lib);
    return { ok: true, books: M.books.size, withText: idx.books().size, errors: lib.errors.slice(0, 5), sample: [...M.books.values()].slice(0, 3).map((b) => b.name) };
  }
  return { name, catalog: null, searchBooks, getBook, getPage, getPages, quick, ping };
}
