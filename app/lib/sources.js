// مصادر الكتب: من أين يجلب الموقع كتبه. الأصل «تراث»، وللمالك أن يغيّر عنوان الـAPI، ويضيف مصادر أخرى ويحذف:
//   · api:    أي API يتكلم صيغة «تراث» (‎/search و‎/book و‎/page، ومعه اختيارياً ملف بيانات لفهرس العناوين)
//   · folder: مجلد على الجهاز الذي يعمل عليه الموقع، فيه كتب بصيغة Word (‎.docx)
//   · shamela: مجلد «المكتبة الشاملة» (الإصدار الرابع) على الجهاز، يُقرأ كما هو (lib/shamela/)
// المجموعات (كأسماء الخطوط): لكل مصدر «اسم مجموعة» اختياري. المصادر التي لها الاسم نفسه مجموعة واحدة: تظهر للمستخدم مصدراً
// واحداً بذلك الاسم ويُبحث فيها معاً. والمصدر الذي بلا مجموعة يبقى وحده باسمه. وإن تعدد ما يراه المستخدم اختار بينها فوق خانة البحث.
// كل نتيجة بحث وكل كتاب يحملان مصدرهما (src)، فيُعرف أهو من «تراث» أم من API آخر أم من الجهاز.
import crypto from 'node:crypto';
import { readJson, updateJson } from './store.js';
import { makeTurath, DEFAULT_API, DEFAULT_FILES } from './turath.js';
import { DEFAULT_DATA_URL } from './catalog.js';
import { scanFolder, searchFolder, searchFolderSets, folderBook, forgetFolder } from './local-books.js';
import { parseWordOptionsKey } from '../shared/docx-import.js';
import { makeShamela, resolveRoot, forgetLibrary } from './shamela/source.js';

const FILE = 'sources.json';
const httpErr = (status, message) => Object.assign(new Error(message), { status });
export const SOURCE_KINDS = { api: 'API بصيغة «تراث»', folder: 'مجلد كتب Word على الجهاز', shamela: 'المكتبة الشاملة على الجهاز' };
const KINDS = Object.keys(SOURCE_KINDS);
export const MAX_SOURCES = 12;
const TURATH = Object.freeze({ id: 'turath', kind: 'api', name: 'تراث', api: '', data: '', link: 'https://app.turath.io/book/', enabled: true });

const text = (v, max) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const httpUrl = (v) => {
  const s = text(v, 300);
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    throw httpErr(400, 'الرابط غير صالح: ' + s.slice(0, 60));
  }
  if (!/^https?:$/.test(u.protocol)) throw httpErr(400, 'الرابط يجب أن يبدأ بـ http أو https');
  return s.replace(/\/+$/, '');
};

/** رابط صفحة الكتاب في موقع المصدر (يُلحق به رقم الكتاب): يبقى كما كُتب */
const linkUrl = (v) => {
  const s = text(v, 300);
  if (!s) return '';
  httpUrl(s);
  return s;
};

function clean(input, base = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const kind = KINDS.includes(s.kind ?? base.kind) ? s.kind ?? base.kind : 'api';
  const pick = (k) => (s[k] !== undefined ? s[k] : base[k]);
  const out = {
    id: base.id || 's' + crypto.randomBytes(4).toString('hex'),
    kind,
    name: text(pick('name'), 40),
    enabled: typeof pick('enabled') === 'boolean' ? pick('enabled') : true,
    // اسم المجموعة (فارغ: المصدر وحده)
    group: text(pick('group'), 40),
  };
  if (!out.name) throw httpErr(400, 'اكتب اسم المصدر');
  if (kind === 'api') {
    out.api = httpUrl(pick('api'));
    out.data = httpUrl(pick('data'));
    out.link = linkUrl(pick('link'));
    // «تراث» نفسه: الفارغ = عنوانه الأصلي. وغيره لا بد له من عنوان
    if (!out.api && out.id !== 'turath') throw httpErr(400, 'اكتب عنوان الـAPI');
  } else {
    out.path = text(pick('path'), 500);
    if (!out.path) throw httpErr(400, 'اكتب مسار المجلد');
    if (kind === 'shamela' && !resolveRoot(out.path)) throw httpErr(400, 'لم أجد مكتبة الشاملة في هذا المجلد: اختر مجلد database فيها (فيه master.db)');
  }
  return out;
}

/** اسم المجموعة التي تُجعل فيها المصادر عند الترقية من الصيغة الأولى (وضع «مجموعة واحدة») */
export const LEGACY_GROUP = 'المكتبة';
function load() {
  const d = readJson(FILE, null);
  if (!d || !Array.isArray(d.items)) return { items: [{ ...TURATH, group: '' }] };
  let items = d.items.filter((x) => x && typeof x.id === 'string' && KINDS.includes(x.kind) && x.name).map((x) => ({ ...x, group: typeof x.group === 'string' ? x.group : '' }));
  // الصيغة الأولى (وضع واحد لكل المصادر): «مجموعة واحدة» ← كلها في مجموعة، و«منفصلة» ← كل مصدر وحده
  if (d.v !== 2 && d.mode !== 'separate' && items.length > 1 && !d.items.some((x) => x && typeof x.group === 'string')) items = items.map((x) => ({ ...x, group: LEGACY_GROUP }));
  return { items };
}
const save = (fn) => updateJson(FILE, {}, () => ({ ...fn(load()), v: 2, updatedAt: new Date().toISOString() }));

/** ما يراه المستخدم مصدراً: مجموعة (بأعضائها المفعّلين) أو مصدر وحده — بترتيب المالك */
const groupId = (name) => 'g' + crypto.createHash('sha1').update(name).digest('hex').slice(0, 10);
function unitsOf(items) {
  const out = [];
  const byGroup = new Map();
  for (const x of items) {
    if (!x.enabled) continue;
    if (!x.group) {
      out.push({ id: x.id, name: x.name, group: false, members: [x] });
      continue;
    }
    let u = byGroup.get(x.group);
    if (!u) {
      u = { id: groupId(x.group), name: x.group, group: true, members: [] };
      byGroup.set(x.group, u);
      out.push(u);
    }
    u.members.push(x);
  }
  return out;
}
const kindOf = (u) => (u.members.every((m) => m.kind === u.members[0].kind) ? u.members[0].kind : 'mixed');
export const sourceUnits = () => unitsOf(load().items).map((u) => ({ id: u.id, name: u.name, group: u.group, kind: kindOf(u), members: u.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind })) }));

/** كل المصادر بترتيب المالك (للوحته) */
export const listSources = () => load().items.map((x) => ({ ...x }));
export const enabledSources = () => load().items.filter((x) => x.enabled);
export const getSource = (id) => load().items.find((x) => x.id === id) || null;
/** هل حُذف «تراث»؟ (ليُعرض زر استعادته) */
export const hasTurath = () => load().items.some((x) => x.id === 'turath');

/** ما يراه المستخدم: المجموعات والمصادر المنفردة بأسمائها وأنواعها فقط (لا روابط ولا مسارات)، وعدد ما في كل مجموعة */
export function publicSources() {
  return { sources: sourceUnits().map((u) => ({ id: u.id, name: u.name, kind: u.kind, count: u.members.length })) };
}

export async function addSource(input) {
  const cur = load();
  if (cur.items.length >= MAX_SOURCES) throw httpErr(409, `بلغت المصادر حدّها (${MAX_SOURCES})`);
  const item = clean(input);
  await save((d) => ({ ...d, items: [...d.items, item] }));
  return item;
}
export async function updateSource(id, patch) {
  const cur = getSource(id);
  if (!cur) throw httpErr(404, 'المصدر غير موجود');
  const item = clean(patch, cur);
  if (cur.kind === 'folder') forgetFolder(cur.path);
  if (cur.kind === 'shamela') forgetLibrary(cur.path);
  clients.delete(id);
  await save((d) => ({ ...d, items: d.items.map((x) => (x.id === id ? item : x)) }));
  return item;
}
export async function deleteSource(id) {
  const cur = getSource(id);
  if (!cur) throw httpErr(404, 'المصدر غير موجود');
  if (cur.kind === 'shamela') forgetLibrary(cur.path);
  clients.delete(id);
  await save((d) => ({ ...d, items: d.items.filter((x) => x.id !== id) }));
}
export async function orderSources(ids) {
  await save((d) => {
    const pos = (id) => {
      const i = ids.indexOf(id);
      return i < 0 ? 1e6 : i;
    };
    return { ...d, items: d.items.map((x, i) => [x, i]).sort((a, b) => pos(a[0].id) - pos(b[0].id) || a[1] - b[1]).map(([x]) => x) };
  });
}
/** إعادة «تراث» إن حُذف (في أول القائمة) */
export async function restoreTurath() {
  if (hasTurath()) return;
  await save((d) => ({ ...d, items: [{ ...TURATH, group: '' }, ...d.items] }));
}

/* ------------------------------------------------------------ التشغيل */
const clients = new Map(); // معرّف المصدر ← { key, client }
function apiClient(src) {
  const key = [src.api, src.data, src.name].join('|');
  const hit = clients.get(src.id);
  if (hit && hit.key === key) return hit.client;
  // «تراث» نفسه ولو كُتب عنوانه بصورةٍ أخرى (http، شرطة في آخره): له ملفات الكتب الكاملة وفهرس العناوين
  const isDefault = !src.api || src.api === DEFAULT_API || /^https?:\/\/api\.turath\.io\/*$/i.test(String(src.api).trim());
  // ملف الفهرس: ما كتبه المالك، وإلا فهرس «تراث» إن كان العنوان عنوانه، وإلا بلا فهرس (بحث نصي فقط)
  const client = makeTurath({ api: src.api || undefined, name: src.name, dataUrl: src.data || (isDefault ? DEFAULT_DATA_URL : null), files: isDefault ? DEFAULT_FILES : null });
  clients.set(src.id, { key, client });
  return client;
}

/** مصدر الشاملة: قارئ واحد لكل مجلد */
function shamelaClient(src) {
  const key = 'shamela|' + src.path + '|' + src.name;
  const hit = clients.get(src.id);
  if (hit && hit.key === key) return hit.client;
  const client = makeShamela({ dir: src.path, name: src.name });
  clients.set(src.id, { key, client });
  return client;
}
/** واجهة الكتب لمصدرٍ يعطي صيغة «تراث» (API أو الشاملة) */
const clientOf = (src) => (src.kind === 'shamela' ? shamelaClient(src) : apiClient(src));

const tag = (src, r) => ({ ...r, src: src.id, srcName: src.name, srcKind: src.kind });

/** المصدر الذي يُطلب منه كتاب: المذكور إن كان مفعّلاً، وإلا أول مصدر مفعّل (الطلبات القديمة بلا src) */
export function sourceFor(id) {
  const on = enabledSources();
  if (id) {
    const s = on.find((x) => x.id === id);
    if (!s) throw httpErr(404, 'مصدر الكتاب غير متاح');
    return s;
  }
  const first = on.find((x) => x.kind === 'api') || on[0];
  if (!first) throw httpErr(503, 'لا مصدر كتب مفعّلاً');
  return first;
}

/** المصادر التي يشملها بحث: أعضاء المجموعة المختارة، أو المصدر المختار، أو كلها (all)، أو أول ما يراه المستخدم (بلا اختيار) */
function targets(srcId) {
  const items = load().items;
  const units = unitsOf(items);
  if (srcId === 'all') return items.filter((x) => x.enabled);
  if (srcId) {
    const u = units.find((x) => x.id === srcId);
    if (u) return u.members;
    const s = items.find((x) => x.enabled && x.id === srcId);
    return s ? [s] : [];
  }
  return units.length ? units[0].members : [];
}

async function searchOne(src, q) {
  if (src.kind === 'folder') {
    const results = searchFolder(src.path, q);
    return { titleSearch: true, results };
  }
  return clientOf(src).searchBooks(q);
}

/** البحث في المصادر المقصودة، وكل نتيجة تحمل مصدرها */
export async function searchSources(q, srcId) {
  const list = targets(srcId);
  if (!list.length) return { count: 0, titleSearch: true, results: [], sources: [] };
  const done = await Promise.allSettled(list.map((s) => searchOne(s, q)));
  const results = [];
  const failed = [];
  let titleSearch = false;
  done.forEach((d, i) => {
    if (d.status === 'rejected') return failed.push(list[i].name);
    titleSearch = titleSearch || !!d.value.titleSearch;
    for (const r of d.value.results || []) results.push(tag(list[i], r));
  });
  if (failed.length === list.length) throw httpErr(502, 'تعذّر الاتصال بمصدر الكتب' + (failed.length > 1 ? ' (كل المصادر)' : ` «${failed[0]}»`));
  // مجموعة مصادر: الرقم المباشر أولاً، ثم ما طابق عنوانه (بدرجته)، ثم ما ورد فيه اللفظ
  if (list.length > 1) {
    const rank = (r) => (r.direct ? 2 : r.source === 'title' ? 1 : 0);
    results.sort((a, b) => rank(b) - rank(a) || (b.score || 0) - (a.score || 0));
  }
  return { count: results.length, titleSearch, results: results.slice(0, 100), sources: list.map((s) => s.id), failed };
}

/** «#»: البحث عن مجلد فيه كتب (مجموعة تصير مجلدات كتاب واحد) في كل مجلدات الكتب المفعّلة على الجهاز */
export function searchSets(q, limit = 60) {
  const folders = enabledSources().filter((s) => s.kind === 'folder');
  const results = [];
  for (const s of folders) {
    try {
      for (const r of searchFolderSets(s.path, q, limit)) results.push(tag(s, r));
    } catch {}
  }
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { count: results.length, titleSearch: true, sets: true, noFolders: !folders.length, results: results.slice(0, limit), sources: folders.map((s) => s.id) };
}

/** اقتراحات فورية أثناء الكتابة */
export async function quickSources(q, srcId, limit = 12) {
  const list = targets(srcId);
  const done = await Promise.allSettled(list.map(async (s) => (s.kind === 'folder' ? searchFolder(s.path, q, limit) : clientOf(s).quick(q, limit))));
  const out = [];
  done.forEach((d, i) => {
    if (d.status === 'fulfilled') for (const r of d.value) out.push(tag(list[i], r));
  });
  if (list.length > 1) out.sort((a, b) => (b.score || 0) - (a.score || 0));
  return out.slice(0, limit);
}

/** بيانات كتاب من مصدره (بلا صفحاته) */
/** wo: خيارات قراءة ملف Word (كتب المجلد)، نصاً كما يكتبها wordOptionsKey */
export async function sourceBook(srcId, id, wo = '') {
  const src = sourceFor(srcId);
  if (src.kind === 'folder') {
    const { pages, ...book } = await folderBook(src.path, id, wo ? parseWordOptionsKey(wo) : undefined);
    return { ...book, src: src.id, srcName: src.name, srcKind: src.kind, link: '', local: true };
  }
  if (!/^\d{1,9}$/.test(String(id))) throw httpErr(400, 'رقم الكتاب غير صالح');
  const book = await clientOf(src).getBook(+id);
  return { ...book, src: src.id, srcName: src.name, srcKind: src.kind, link: src.link ? src.link + (/[/=]$/.test(src.link) ? '' : '/') + book.id : '' };
}

export async function sourcePage(srcId, id, pg, wo = '') {
  const src = sourceFor(srcId);
  if (src.kind === 'folder') {
    const book = await folderBook(src.path, id, wo ? parseWordOptionsKey(wo) : undefined);
    const p = book.pages[pg - 1];
    if (!p) throw httpErr(404, 'الصفحة غير موجودة');
    return p;
  }
  return clientOf(src).getPage(+id, pg);
}

/** صفحات متتالية دفعة واحدة (من ملف الكتاب الكامل)؛ null = لا سبيل إلا صفحةً صفحة */
/** عناوين «تراث» نفسه لمتصفح المستخدم (يجلب منها مباشرة إن تعذّر على الخادم): للمصدر الافتراضي فقط */
export function sourceDirect(srcId) {
  try {
    const src = sourceFor(srcId);
    if (src.kind !== 'api' || (src.api && src.api !== DEFAULT_API)) return null;
    return { api: DEFAULT_API, files: DEFAULT_FILES };
  } catch {
    return null;
  }
}
export async function sourcePages(srcId, id, from, to) {
  const src = sourceFor(srcId);
  if (src.kind !== 'api' && src.kind !== 'shamela') return null;
  const c = clientOf(src);
  return c.getPages ? c.getPages(+id, from, to) : null;
}

/** اسم شهرة المؤلف من فهرس المصدر (إن كان له فهرس محمَّل) */
export function sourceCatalogBook(srcId, id) {
  try {
    const src = sourceFor(srcId);
    if (src.kind !== 'api') return null;
    const c = apiClient(src).catalog;
    return c ? c.book(id) : null;
  } catch {
    return null;
  }
}

/** فحص مصدر (محفوظ أو قبل حفظه): هل يجيب الـAPI؟ كم كتاباً في المجلد؟ */
export async function testSource(input, base) {
  let src;
  // «تراث» نفسه يُختبر بعنوانه الأصلي إن تُرك عنوانه فارغاً
  if (!base && input && input.id === 'turath') base = { id: 'turath' };
  try {
    src = clean({ ...input, name: (input && input.name) || (base && base.name) || 'فحص' }, base || {});
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (src.kind === 'folder') {
    forgetFolder(src.path);
    const r = scanFolder(src.path);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, books: r.list.length, sample: r.list.slice(0, 3).map((x) => x.name), note: r.list.length ? '' : 'لا ملفات ‎.docx في المجلد' };
  }
  if (src.kind === 'shamela') {
    forgetLibrary(src.path);
    try {
      const r = await makeShamela({ dir: src.path, name: src.name }).ping();
      return { ok: true, books: r.books, sample: r.sample, note: r.errors.length ? 'تعذّرت قراءة بعض مقاطع الفهرس: ' + r.errors[0] : r.withText < r.books ? (r.books - r.withText) + ' كتاباً بلا نص في الفهرس' : '' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  try {
    const client = makeTurath({ api: src.api || undefined, name: src.name, dataUrl: null });
    const r = await client.ping();
    let catalog = null;
    if (src.data || !src.api || src.api === DEFAULT_API) {
      const c = makeTurath({ api: src.api || undefined, dataUrl: src.data || DEFAULT_DATA_URL }).catalog;
      const got = await c.get();
      catalog = got ? got.books.length : 0;
    }
    return { ok: true, results: r.results, catalog, api: client.api };
  } catch (e) {
    return { ok: false, error: e.status ? `الـAPI أجاب بـ HTTP ${e.status}` : 'تعذّر الاتصال: ' + (e.cause && e.cause.code ? e.cause.code : e.message) };
  }
}
