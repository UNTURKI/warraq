// خادم «ورّاق» — نصوص الكتب لا تُحفظ أبداً: كل طلب يُعالج في الذاكرة ثم يُنسى.
// المحفوظ فقط إعدادات المالك (مجلد data): مفاتيح الذكاء الاصطناعي مشفّرة، الوسائط المرفوعة، الملاحظات.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { getCatalog, catalogStatus, catalogBook } from './lib/catalog.js';
import { searchSources, searchSets, quickSources, sourceBook, sourcePage, sourcePages, sourceDirect, sourceCatalogBook, publicSources } from './lib/sources.js';
import { renderPdf, closeBrowser } from './lib/render-pdf.js';
import { buildDocx } from './lib/docx.js';
import { handleAdmin, handlePublic, adminVisible, adminAuthed } from './lib/admin-routes.js';
import { isDoor, doorMatches, doorResult, doorBook, doorEnrich } from './lib/door.js';
import { publicDownloads, serveDownload } from './lib/downloads.js';
import { publicFonts, allFonts, serveFont, siteFontsCss, coverSiteFonts } from './lib/fonts.js';
import { listBrushes, brushFile } from './lib/brushes.js';
import { publicStyles, styleExtras, cleanRenderSettings, userExtras, checkUserCard, SLOTS, TEMPLATE_KEYS, PAGE_AT } from './lib/styles.js';
import { cleanPrint, getPrint, PRINT_DEFAULT, PAGE_TYPES, HALF_POS, PAD_TO } from './lib/print.js';
import { listBasmalas } from './lib/basmala.js';
import { rateLimited, clientIp } from './lib/auth.js';
import { buildBookHtml } from './lib/book-html.js';
import { enrichBook, algoExtract } from './lib/enrich.js';
import { createCovers } from './lib/covers.js';
import { BUILTIN_COVERS } from './lib/builtin.js';
import { DATA_DIR } from './lib/store.js';
import { isAuthed } from './lib/auth.js';
import { lookCss } from './lib/look.js';
import { DESKTOP, hostAllowed, desktopRedirect, desktopHtml, desktopOnly } from './lib/desktop.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
let PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 300 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// استوديو الأغلفة: تصاميم الغلاف الخارجي (لوحة المالك في /admin/covers/ وصفحة المستخدم في /covers/)
const covers = createCovers({ dataDir: DATA_DIR, isAdmin: (req) => adminAuthed(req), siteFonts: coverSiteFonts });
try {
  covers.syncBuiltins(BUILTIN_COVERS);
} catch (e) {
  console.error('[covers] builtin', e.message);
}

const STATIC_ROOTS = { '/shared/': path.join(ROOT, 'shared'), '/': path.join(ROOT, 'public') };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': MIME['.json'] });

const gzCache = new Map();
/** صفحة «اصنع بطاقتك» من صفحة الاستوديو (تُقرأ كل مرة فتتبع أي تعديل فيها) */
function cardPage() {
  return fs
    .readFileSync(path.join(ROOT, 'public/studio/index.html'), 'utf8')
    .replace('<title>استوديو الأساليب — ورّاق</title>', '<title>اصنع بطاقتك — ورّاق</title>')
    .replace('<body>', '<body data-page="card">')
    .replace('<h1 id="listTitle">استوديو الأساليب</h1>', '<h1 id="listTitle">اصنع بطاقتك</h1>');
}
/** صفحة HTML في وضع البرنامج: تُقرأ وتُعلَّم بعلامته (وفي الموقع تُخدم كما هي) */
function sendHtml(res, file, pathname = '') {
  res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(desktopHtml(fs.readFileSync(file, 'utf8'), pathname));
}
function serveStatic(req, res, pathname) {
  for (const [prefix, dir] of Object.entries(STATIC_ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    let file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) return send(res, 403, 'forbidden');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith('/')) return send(res, 301, '', { location: pathname + '/' });
      file = path.join(file, 'index.html');
    }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      // ملفات النص الكبيرة (نص القرآن للتعرف على الآيات): مضغوطة وتُحفظ في المتصفح يوماً
      if (ext === '.txt' && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        const st = fs.statSync(file);
        let hit = gzCache.get(file);
        if (!hit || hit.mtime !== st.mtimeMs) gzCache.set(file, (hit = { mtime: st.mtimeMs, buf: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) }));
        res.writeHead(200, { 'content-type': MIME[ext], 'content-encoding': 'gzip', vary: 'accept-encoding', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
        return res.end(hit.buf);
      }
      if (DESKTOP && ext === '.html') return sendHtml(res, file, pathname);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.ttf' || ext === '.woff2' || ext === '.woff' ? 'public, max-age=86400' : 'no-cache',
        'x-content-type-options': 'nosniff',
        // الخطوط تُحمَّل أيضاً من إطار المعاينة المعزول (بلا أصل)، فيلزمها إذن CORS
        ...(/^\.(ttf|otf|woff2?)$/.test(ext) ? { 'access-control-allow-origin': '*' } : {}),
      });
      return fs.createReadStream(file).pipe(res);
    }
  }
  return send(res, 404, 'not found');
}

/** ملفٌ بأجزائه (Range): للصوت والمقاطع الطويلة، فلا يُقرأ كله */
function serveRange(req, res, file, type) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return send(res, 404, 'not found');
  }
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
    let end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size || start > end) return send(res, 416, '', { 'content-range': `bytes */${size}` });
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('حجم الطلب كبير جداً'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('JSON غير صالح'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/**
 * أسلوب المستخدم الذي يأتي مع طلب التنضيد أو المعاينة (أساليبه محفوظة في متصفحه): إضافاته وإعداد طباعته وخطوطه.
 * يُقبل باسم userStyle، أو حقولاً مباشرة (extras / print / fonts) كما يرسلها محرر الأساليب.
 */
function userStyleOf(body) {
  const u = body.userStyle && typeof body.userStyle === 'object' ? body.userStyle : body.extras || body.print || body.fonts ? { extras: body.extras, print: body.print, fonts: body.fonts } : null;
  return u;
}
function renderExtras(body, settings) {
  const u = userStyleOf(body);
  if (!u) return { extra: styleExtras(settings.styleId), print: null };
  return { extra: userExtras({ baseId: settings.styleId, extras: u.extras, fonts: u.fonts }), print: u.print && typeof u.print === 'object' ? cleanPrint(u.print) : null };
}

function validateRender(body) {
  if (!body || !body.doc || !Array.isArray(body.doc.blocks) || !body.settings) {
    throw Object.assign(new Error('بيانات التنضيد ناقصة'), { status: 400 });
  }
}

const fileName = (s) => encodeURIComponent(String(s || 'book').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  // وضع البرنامج: لا يُجاب طلب لم يُوجَّه إلى الجهاز نفسه باسمه
  if (!hostAllowed(req)) return send(res, 403, 'forbidden');
  try {
    if (p === '/api/health') return json(res, 200, { ok: true, catalog: catalogStatus() });
    // موضوع الكتاب من فهرس «تراث» (العقيدة، التفسير، الحديث…): لتقسيم رفوف الخزانة في البرنامج
    if (p === '/api/subjects' && req.method === 'GET') {
      await getCatalog().catch(() => null);
      const ids = String(url.searchParams.get('ids') || '').split(',').map((x) => +x).filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
      const out = {};
      for (const id of ids) {
        const b = catalogBook(id);
        if (b && b.cat) out[id] = b.cat;
      }
      return json(res, 200, { subjects: out });
    }
    // لوحة التحكم والمسارات العامة المرتبطة بها
    const ctx = { json, readBody };
    // استوديو الأغلفة (عام + مسارات المالك /api/admin/covers*)
    if (await covers.handle(req, res, url)) return;
    if (p.startsWith('/api/admin/')) {
      await handleAdmin(req, res, url, ctx);
      return;
    }
    if (await handlePublic(req, res, url, ctx)) return;
    // تنزيل الموقع كبرنامج: ما رفعه المالك من إصدارات
    if (p === '/api/downloads' && req.method === 'GET') return json(res, 200, { editions: publicDownloads() });
    if (p.startsWith('/downloads/file/') && (req.method === 'GET' || req.method === 'HEAD')) {
      if (serveDownload(req, res, p.slice('/downloads/file/'.length))) return;
      return send(res, 404, 'not found');
    }
    // «مجلس الدرس» في البرنامج: صوتٌ أو مقطع اختاره المستخدم من جهازه (برمزٍ مؤقت تعطيه العملية الرئيسية)، مع التقديم والتأخير
    if (DESKTOP && p.startsWith('/lesson-media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const m = typeof globalThis.__warraqLessonMedia === 'function' ? globalThis.__warraqLessonMedia(p.split('/')[2] || '') : null;
      if (!m) return send(res, 404, 'not found');
      return serveRange(req, res, m.path, m.type);
    }
    // «الطِّراز» (البرنامج وحده): ملفات المودات المثبّتة، وما يعمل منها في كل جزء، ودليل صانعها (electron/mods.cjs)
    if (DESKTOP && p.startsWith('/mods/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const m = /^\/mods\/([^/]+)\/(.+)$/.exec(p);
      const H = globalThis.__warraqMods;
      let f = null;
      try {
        f = m && H ? H.file(decodeURIComponent(m[1]), decodeURIComponent(m[2])) : null;
      } catch {}
      if (!f) return send(res, 404, 'not found');
      if (f.media) return serveRange(req, res, f.path, f.type);
      res.writeHead(200, { 'content-type': f.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...(/font\//.test(f.type) ? { 'access-control-allow-origin': '*' } : {}) });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(f.path).pipe(res);
    }
    if (DESKTOP && p === '/api/mods' && req.method === 'GET') {
      const H = globalThis.__warraqMods;
      return json(res, 200, H ? H.active(String(url.searchParams.get('part') || 'other')) : { safe: false, mods: [] });
    }
    if (DESKTOP && p === '/api/mods/prompt' && req.method === 'GET') {
      const H = globalThis.__warraqMods;
      return send(res, 200, H && H.prompt ? H.prompt() : '', { 'content-type': 'text/plain; charset=utf-8' });
    }
    if (DESKTOP && p === '/api/mods/guide' && req.method === 'GET') {
      const H = globalThis.__warraqMods;
      return send(res, 200, H ? H.guide() : '', { 'content-type': 'text/markdown; charset=utf-8' });
    }
    // خطوط المالك: تدخل في كل الموقع (الكتاب، الأساليب، الأغلفة)
    if (p.startsWith('/site-fonts/') && req.method === 'GET') {
      if (!serveFont(res, p.slice('/site-fonts/'.length))) send(res, 404, 'not found');
      return;
    }
    if (p === '/api/fonts' && req.method === 'GET') return json(res, 200, { fonts: allFonts() });
    // فُرَش الرسم (أشكال أقلام الرَّحل)
    if (p === '/api/brushes' && req.method === 'GET') return json(res, 200, { sets: listBrushes() });
    if (p.startsWith('/brushes/') && req.method === 'GET') {
      const f = brushFile(p.slice('/brushes/'.length));
      if (!f) return send(res, 404, 'not found');
      return send(res, 200, fs.readFileSync(f), { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' });
    }
    // مظهر الموقع (ألوانه، وحركة النَّقْط): ورقة أنماط تُربط في كل الصفحات
    if (p === '/api/theme.css' && req.method === 'GET') return send(res, 200, lookCss(), { 'content-type': MIME['.css'], 'cache-control': 'no-cache' });
    if (p === '/api/fonts.css' && req.method === 'GET') return send(res, 200, siteFontsCss(), { 'content-type': MIME['.css'], 'cache-control': 'no-cache' });
    // أساليب دور النشر (المضمّنة + ما أضافه المالك)
    if (p === '/api/styles' && req.method === 'GET') return json(res, 200, { styles: publicStyles() });
    if (p === '/api/preview' && req.method === 'POST') {
      // مستند المعاينة الحية: نفس مستند الطباعة ومحرك التنضيد، يعمل في متصفح المستخدم
      // (أسلوب المستخدم بصوره وخطوطه قد يكبر الطلب)
      const body = await readBody(req, 40 * 1024 * 1024);
      validateRender(body);
      const settings = cleanRenderSettings(body.settings);
      const { extra, print } = renderExtras(body, settings);
      return json(res, 200, { html: buildBookHtml({ doc: body.doc, settings, cover: body.cover || {}, extra, print, preview: true, origin: body.origin, marks: body.marks, editor: body.editor === true, numStart: Number(body.numStart) > 0 ? Math.min(100000, Math.floor(Number(body.numStart))) : 0 }) });
    }
    // استوديو الأساليب: ما يحتاجه محرر الأساليب عند المستخدم (الخانات، القوالب، مواضع الصفحات، إعداد الطباعة وصور البسملة)
    if (p === '/api/styles/meta' && req.method === 'GET') {
      return json(res, 200, { admin: adminVisible(req), desktop: DESKTOP, slots: SLOTS, templates: TEMPLATE_KEYS, pageAt: PAGE_AT, print: { print: getPrint(), defaults: PRINT_DEFAULT, types: PAGE_TYPES, halfPos: HALF_POS, padTo: PAD_TO }, basmalas: listBasmalas() });
    }
    // فحص بطاقة يركّبها المستخدم في متصفحه (تُنقّى ويعود أسلوبها مع ملاحظات الموقع)
    if (p === '/api/styles/check' && req.method === 'POST') {
      if (rateLimited('card:' + clientIp(req), 30, 10 * 60e3)) return json(res, 429, { error: 'بطاقات كثيرة في وقت قصير، حاول بعد قليل' });
      const b = await readBody(req, 48 * 1024 * 1024);
      return json(res, 200, checkUserCard(b.card));
    }
    // التوجيه الجاهز لأي ذكاء اصطناعي ليكتب بطاقة أسلوب نصية: لكل قسمٍ توجيهه (الكتب والمتون أسلوبٌ واحد، والأبحاث وحدها)
    if (p === '/api/styles/ai-prompt' && req.method === 'GET') {
      const k = url.searchParams.get('kind') === 'research' ? 'research' : 'books';
      const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'docs', `ai-style-prompt-${k}.md`);
      if (!fs.existsSync(file)) return send(res, 404, 'not found');
      return send(res, 200, fs.readFileSync(file, 'utf8'), { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(k === 'research' ? 'توجيه بطاقة أسلوب البحث.md' : 'توجيه بطاقة أسلوب الكتب والمتون.md') });
    }
    // مصادر الكتب المفعّلة (أسماؤها وأنواعها فقط): «تراث» افتراضياً، وما أضافه المالك من API أو مجلد كتب
    if (p === '/api/sources' && req.method === 'GET') return json(res, 200, publicSources());
    // src: معرّف المصدر. غائب = المصدر الأول (الطلبات القديمة تبقى تعمل)
    const srcParam = (url.searchParams.get('src') || '').slice(0, 40);
    const bookIdOf = (v) => String(v || '').trim().slice(0, 40);
    // خيارات قراءة ملف Word (كتب مجلد المالك): matn.cover.format.toc
    const woParam = /^[a-z]{1,10}(\.[a-z]{1,10})?\.[01]\.[01]\.(file|site)$/.test(url.searchParams.get('wo') || '') ? url.searchParams.get('wo') : '';
    if (p === '/api/book/enrich' && req.method === 'GET') {
      // بيانات الغلاف ونوع الكتاب: بالذكاء الاصطناعي إن كان مفعّلاً ومتاحاً، وإلا بالخوارزمية — دون أي خطأ للمستخدم
      const id = bookIdOf(url.searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'رقم الكتاب مطلوب' });
      if (isDoor(id)) return json(res, 200, doorEnrich());
      let book;
      try {
        book = await sourceBook(srcParam, id);
      } catch {
        return json(res, 200, { source: 'none', fields: null });
      }
      const cat = sourceCatalogBook(srcParam, id);
      return json(res, 200, await enrichBook({ ...book, authorShort: (cat && cat.author) || (book.local ? book.cover.author : '') || '' }));
    }
    if (p === '/api/book/enrich-local' && req.method === 'POST') {
      // كتاب المستخدم «كتابي» (ملف Word قُرئ في متصفحه): نوعه وعنوانه بالخوارزمية الثابتة من اسمه فقط
      const b = await readBody(req, 8 * 1024);
      const name = String(b.name || '').slice(0, 200);
      const info = String(b.info || '').slice(0, 600);
      if (!name) return json(res, 200, { source: 'none', fields: null });
      return json(res, 200, { source: 'algo', fields: algoExtract({ name, info, authorName: (/^\s*المؤلف\s*[:：]\s*(.*)$/m.exec(info) || [])[1] || '' }) });
    }
    if (p === '/api/search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      // «#اسم»: البحث عن مجلد فيه كتب (ملفاته تصير مجلدات كتاب واحد)، لا عن كتاب واحد
      if (q.startsWith('#')) {
        const data = searchSets(q.slice(1).trim().slice(0, 120), url.searchParams.get('quick') ? 12 : 60);
        return json(res, 200, data);
      }
      if (url.searchParams.get('quick')) {
        // اقتراحات فورية أثناء الكتابة (من فهارس العناوين وأسماء ملفات المجلدات)
        if (!q) return json(res, 200, { results: [] });
        const list = await quickSources(q, srcParam, 12).catch(() => []);
        if (!DESKTOP && doorMatches(q)) list.unshift(doorResult());
        return json(res, 200, { results: list.slice(0, 12), catalog: catalogStatus().loaded });
      }
      if (q.length < 2) return json(res, 400, { error: 'اكتب حرفين على الأقل للبحث' });
      if (DESKTOP || !doorMatches(q)) return json(res, 200, await searchSources(q, srcParam));
      let data = { results: [], titleSearch: true };
      try {
        data = await searchSources(q, srcParam);
      } catch {}
      data.results = [doorResult(), ...(data.results || [])];
      data.titleSearch = true;
      return json(res, 200, data);
    }
    if (p === '/api/book' && req.method === 'GET') {
      const id = bookIdOf(url.searchParams.get('id'));
      if (!id) return json(res, 400, { error: 'رقم الكتاب مطلوب' });
      if (isDoor(id)) return json(res, 200, doorBook());
      return json(res, 200, await sourceBook(srcParam, id, woParam));
    }
    // صفحات متتالية دفعة واحدة: { pages } أو { bulk:false } فيجلب المتصفح صفحةً صفحة
    if (p === '/api/pages' && req.method === 'GET') {
      const id = bookIdOf(url.searchParams.get('book_id'));
      const from = +url.searchParams.get('from');
      const to = +url.searchParams.get('to');
      if (!id || !from || !to || to < from || to - from > 2000) return json(res, 400, { error: 'book_id و from و to مطلوبة' });
      if (isDoor(id)) return json(res, 404, { error: 'الصفحة غير متاحة' });
      const pages = await sourcePages(srcParam, id, from, to);
      return json(res, 200, pages ? { pages } : { bulk: false, direct: sourceDirect(srcParam) });
    }
    if (p === '/api/page' && req.method === 'GET') {
      const id = bookIdOf(url.searchParams.get('book_id'));
      const pg = +url.searchParams.get('pg');
      if (!id || !pg) return json(res, 400, { error: 'book_id و pg مطلوبان' });
      if (isDoor(id)) return json(res, 404, { error: 'الصفحة غير متاحة' });
      return json(res, 200, await sourcePage(srcParam, id, pg, woParam));
    }
    if (p === '/api/render/pdf' && req.method === 'POST') {
      const body = await readBody(req);
      validateRender(body);
      const baseUrl = `http://127.0.0.1:${PORT}`;
      const settings = cleanRenderSettings(body.settings);
      const { extra, print } = renderExtras(body, settings);
      const { pdf, layout } = await renderPdf({ doc: body.doc, settings, cover: body.cover || {}, baseUrl, extra, ...(print ? { print } : {}) });
      return send(res, 200, pdf, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename*=UTF-8''${fileName(body.fileName)}.pdf`,
        'x-layout': Buffer.from(JSON.stringify(layout)).toString('base64'),
        'access-control-expose-headers': 'x-layout',
      });
    }
    if (p === '/api/render/docx' && req.method === 'POST') {
      const body = await readBody(req);
      validateRender(body);
      const buf = buildDocx({ doc: body.doc, settings: cleanRenderSettings(body.settings), cover: body.cover || {}, layout: body.layout });
      return send(res, 200, buf, {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename*=UTF-8''${fileName(body.fileName)}.docx`,
      });
    }
    // لوحة التحكم لا تظهر إلا لمن دخل من الباب الخفي أو له جلسة قائمة
    if ((p === '/admin' || p.startsWith('/admin/')) && !adminVisible(req)) return send(res, 404, 'not found');
    // «اصنع بطاقتك»: صفحة المستخدم لصنع بطاقات الأساليب — هي استوديو الأساليب نفسه بواجهة المستخدم دائماً
    if (p === '/card') return send(res, 301, '', { location: '/card/' });
    if (p === '/card/' && (req.method === 'GET' || req.method === 'HEAD')) return send(res, 200, desktopHtml(cardPage(), p), { 'content-type': MIME['.html'] });
    // في البرنامج: الصفحة الرئيسية وصفحة التنزيل للموقع وحده، والبرنامج يبدأ بواجهة الإخراج
    const go = (req.method === 'GET' || req.method === 'HEAD') && desktopRedirect(p);
    if (go) return send(res, 302, '', { location: go });
    if (desktopOnly(p)) return send(res, 404, 'not found');
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
    return send(res, 405, 'method not allowed');
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
    console.error('[warraq]', p, e.message);
    if (!res.headersSent) json(res, status, { error: e.message || 'خطأ غير متوقع' });
    else res.end();
  }
});

server.requestTimeout = 0; // التنضيد قد يطول للمجلدات الكبيرة
// التشغيل: إن كان المنفذ مشغولاً جُرّب التالي (للتشغيل المحلي بنقرة واحدة)
let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tries++ < 20) {
    PORT++;
    setTimeout(() => server.listen(PORT, HOST), 50);
  } else {
    console.error('تعذّر تشغيل الخادم:', e.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  const url = `http://localhost:${PORT}`;
  process.emit('warraq:listening', PORT); // لبرنامج سطح المكتب: المنفذ الفعلي
  console.log(`\n  Al-Warraq is running at: ${url}\n  ورّاق يعمل الآن على: ${url}\n  (Close this window or press Ctrl+C to stop)\n`);
  if (process.env.WARRAQ_OPEN === '1') {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.listen(PORT, HOST);
// تحميل فهرس عناوين الكتب في الخلفية عند التشغيل
getCatalog().catch(() => {});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closeBrowser().catch(() => {});
    process.exit(0);
  });
}
