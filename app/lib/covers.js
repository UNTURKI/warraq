/*
 * lib/covers.js — وحدة «استوديو الأغلفة» على الخادم، بلا اعتماديات.
 *
 * الاستعمال (في server.js):
 *   import { createCovers } from './lib/covers.js';
 *   const covers = createCovers({ dataDir, isAdmin: (req) => isAuthed(req) });
 *   // داخل معالج الطلبات، قبل خدمة الملفات الثابتة:
 *   if (await covers.handle(req, res, url)) return;
 *
 * المسارات:
 *   GET    /api/covers                    التصاميم المنشورة (ملخص للمعرض)
 *   GET    /api/covers/fonts              الخطوط المرفوعة + المضمّنة المتاحة
 *   GET    /api/covers/:id                تصميم منشور كامل
 *   GET    /covers-media/:file            الصور والخطوط المرفوعة
 *   GET    /api/admin/covers              كل التصاميم (مالك)
 *   GET    /api/admin/covers/:id          تصميم كامل (مالك، ولو مسودة)
 *   POST   /api/admin/covers              إنشاء  { name } أو { design }
 *   PUT    /api/admin/covers/:id          حفظ التصميم كاملاً
 *   POST   /api/admin/covers/:id/duplicate
 *   DELETE /api/admin/covers/:id
 *   POST   /api/admin/covers/order        { ids: [...] }
 *   POST   /api/admin/covers/upload       جسم الطلب = الملف نفسه، ترويسة x-filename
 *   PUT    /api/admin/covers/fonts        { uploaded: [...], disabled: [...] }
 *   GET    /api/covers/bundles            حِزم الربط (غلاف أمامي + خلفي + كعب + أسلوب + تنسيق طباعة)
 *   GET    /api/admin/covers/bundles      كل الحِزم (مالك)
 *   PUT    /api/admin/covers/bundles      { bundles: [...] } حفظ القائمة كاملة
 * كل طلب تعديل يتطلب الترويسة  x-warraq: 1  (كما في الموقع الأساسي).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { systemFonts } from './desktop.js';
import { FONTS } from '../shared/presets.js';
import '../shared/cover-core.js'; // يعرّف globalThis.CoverCore (الملف نفسه يعمل في المتصفح)

const Core = globalThis.CoverCore;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_JSON = 4 * 1024 * 1024;

/* -------------------- كشف نوع الملف من محتواه -------------------- */
function sniff(buf) {
  const b = buf;
  const s = (i, n) => b.slice(i, i + n).toString('latin1');
  if (b.length > 8 && b[0] === 0x89 && s(1, 3) === 'PNG') return { ext: 'png', type: 'image/png', kind: 'image' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg', kind: 'image' };
  if (b.length > 12 && s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return { ext: 'webp', type: 'image/webp', kind: 'image' };
  if (b.length > 6 && (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a')) return { ext: 'gif', type: 'image/gif', kind: 'image' };
  if (b.length > 4 && s(0, 4) === 'wOFF') return { ext: 'woff', type: 'font/woff', kind: 'font' };
  if (b.length > 4 && s(0, 4) === 'wOF2') return { ext: 'woff2', type: 'font/woff2', kind: 'font' };
  if (b.length > 4 && s(0, 4) === 'OTTO') return { ext: 'otf', type: 'font/otf', kind: 'font' };
  if (b.length > 4 && (b.readUInt32BE(0) === 0x00010000 || s(0, 4) === 'true')) return { ext: 'ttf', type: 'font/ttf', kind: 'font' };
  const head = b.slice(0, 2048).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    // SVG: نرفض السكربتات والمعالجات والروابط الخارجية
    const all = b.toString('utf8');
    if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject/i.test(all)) return null;
    return { ext: 'svg', type: 'image/svg+xml', kind: 'image' };
  }
  return null;
}

/* أبعاد الصورة من الترويسة (لضبط النسبة تلقائياً عند الرفع) */
function imageSize(buf, ext) {
  try {
    if (ext === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === 'gif') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (ext === 'webp') {
      const c = buf.slice(12, 16).toString('latin1');
      if (c === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (c === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (c === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (ext === 'jpg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
    if (ext === 'svg') {
      const t = buf.slice(0, 4096).toString('utf8');
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(t);
      const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(t);
      const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(t);
      if (w && h) return { w: +w[1], h: +h[1] };
      if (vb) return { w: +vb[1], h: +vb[2] };
    }
  } catch (_) { /* أبعاد غير معروفة */ }
  return { w: 0, h: 0 };
}

/* -------------------- التخزين -------------------- */
function atomicWrite(file, data) {
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function createCovers(opts) {
  opts = opts || {};
  const root = path.join(opts.dataDir || path.join(__dirname, '..', 'data'), 'covers');
  const mediaDir = path.join(root, 'media');
  const dbFile = path.join(root, 'designs.json');
  const fontsFile = path.join(root, 'fonts.json');
  fs.mkdirSync(mediaDir, { recursive: true });
  const isAdmin = opts.isAdmin || (() => false);

  let db = { designs: [] };
  try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (_) { /* أول تشغيل */ }
  if (!Array.isArray(db.designs)) db.designs = [];
  if (!Array.isArray(db.bundles)) db.bundles = [];
  let fonts = { uploaded: [], disabled: [] };
  try { fonts = Object.assign(fonts, JSON.parse(fs.readFileSync(fontsFile, 'utf8'))); } catch (_) { /* لا خطوط بعد */ }

  const save = () => atomicWrite(dbFile, JSON.stringify(db));
  const saveFonts = () => atomicWrite(fontsFile, JSON.stringify(fonts));
  const find = (id) => db.designs.find((d) => d.id === id);
  const sorted = () => db.designs.slice().sort((a, b) => a.order - b.order || String(a.createdAt).localeCompare(String(b.createdAt)));

  /* حِزم الربط: كل حزمة تربط غلافاً أمامياً وخلفياً وكعباً وأسلوب نشر وتنسيق طباعة باسم واحد */
  const ref = (v) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : null);
  /* ربط ألوان الأغلفة في الحزمة: عنصر لوني في الأمامي ↔ عنصر في الخلفي أو الكعب ("front|T:id:fill" ↔ "back|L:id") */
  const LINK_KEY = /^(front|back|spine)\|(L:[\w-]{1,60}|T:[\w-]{1,60}:(fill|s:[\w-]{1,60}))$/;
  function cleanBundleLinks(list) {
    const seen = new Set();
    const out = [];
    for (const l of Array.isArray(list) ? list.slice(0, 400) : []) {
      if (!l || !LINK_KEY.test(l.a) || !LINK_KEY.test(l.b)) continue;
      const pa = l.a.split('|')[0], pb = l.b.split('|')[0];
      if (pa === pb || (pa !== 'front' && pb !== 'front')) continue;
      const id = [l.a, l.b].sort().join('~');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ a: l.a, b: l.b });
    }
    return out;
  }
  function cleanBundles(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).slice(0, 200).map((b, i) => {
      b = b && typeof b === 'object' ? b : {};
      let id = ref(b.id);
      if (!id || seen.has(id)) id = 'b' + crypto.randomBytes(4).toString('hex');
      seen.add(id);
      return {
        id,
        name: String(b.name || 'حزمة').replace(/\s+/g, ' ').trim().slice(0, 60) || 'حزمة',
        front: ref(b.front), back: ref(b.back), spine: ref(b.spine),
        style: ref(b.style),
        print: typeof b.print === 'string' && /^pp\d{1,4}$/.test(b.print) ? b.print : null,
        color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color.toLowerCase() : null,
        // صورة الحزمة: بها يعرفها المستخدم في المنضدة ويختارها بشكلها
        image: Core.safeSrc(b.image),
        links: cleanBundleLinks(b.links),
        order: i + 1,
      };
    });
  }
  /** الحزمة كما يراها المستخدم: الأغلفة غير المنشورة لا تُعرض */
  function publicBundle(b) {
    const pub = (id, kind) => { const d = id && find(id); return d && d.published && (d.kind || 'front') === kind ? { id: d.id, name: d.name, thumb: d.thumb, palette: d.palette } : null; };
    return { id: b.id, name: b.name, front: pub(b.front, 'front'), back: pub(b.back, 'back'), spine: pub(b.spine, 'spine'), style: b.style, print: b.print, color: b.color, image: b.image || null, links: b.links || [] };
  }

  function newId() {
    let id;
    do id = 'd' + crypto.randomBytes(5).toString('hex'); while (find(id));
    return id;
  }

  function upsert(input, id) {
    const now = new Date().toISOString();
    const d = Core.normalizeDesign(input);
    const prev = id ? find(id) : null;
    d.id = prev ? prev.id : newId();
    d.createdAt = prev ? prev.createdAt : now;
    d.updatedAt = now;
    if (!prev) {
      d.order = db.designs.reduce((m, x) => Math.max(m, x.order), 0) + 1;
      db.designs.push(d);
    } else {
      Object.keys(prev).forEach((k) => delete prev[k]);
      Object.assign(prev, d);
    }
    save();
    return d;
  }

  /* المضمَّن في البرنامج (lib/builtin.js): أغلفة وحزم معرّفاتها «bi-». يُضاف كل منها مرة واحدة، فما عدّله المالك يبقى،
     وما حذفه المالك لا يعود، وما لم يعد في البرنامج يُحذف. تصاميم التجربة القديمة (كانت تُبذر في أول تشغيل) تُحذف مرة واحدة. */
  const LEGACY_DEMO = new Set(['الأزرق والذهبي', 'العنابي الجلدي', 'الزمرّدي', 'الأسود الفاخر', 'البنّي العتيق', 'الكحلي الفضي', 'خلفي الأزرق والذهبي', 'خلفي العنابي الجلدي', 'كعب الأزرق والذهبي', 'كعب العنابي الجلدي']);
  function syncBuiltins(pack) {
    db.synced = db.synced && typeof db.synced === 'object' ? db.synced : {};
    const isBuiltin = (id) => String(id).startsWith('bi-');
    const designKeep = new Set(pack.designs.map((d) => d.id));
    const bundleKeep = new Set(pack.bundles.map((b) => b.id));
    const legacy = !db.legacyDemoRemoved;
    const removed = new Set();
    db.designs = db.designs.filter((d) => {
      const gone = (isBuiltin(d.id) && !designKeep.has(d.id)) || (legacy && !isBuiltin(d.id) && LEGACY_DEMO.has(d.name));
      if (gone) removed.add(d.id);
      return !gone;
    });
    db.bundles = db.bundles.filter((b) => !(isBuiltin(b.id) && !bundleKeep.has(b.id)));
    for (const b of db.bundles) for (const k of ['front', 'back', 'spine']) if (removed.has(b[k])) b[k] = null;
    db.legacyDemoRemoved = true;
    const now = new Date().toISOString();
    let added = false;
    for (const d of pack.designs) {
      if (db.synced[d.id]) continue;
      db.synced[d.id] = true;
      if (find(d.id)) continue;
      const n = Core.normalizeDesign(JSON.parse(JSON.stringify(d)));
      n.id = d.id;
      n.createdAt = now;
      n.updatedAt = now;
      n.order = db.designs.reduce((m, x) => Math.max(m, x.order), 0) + 1;
      db.designs.push(n);
      added = true;
    }
    for (const b of pack.bundles) {
      if (db.synced[b.id]) continue;
      db.synced[b.id] = true;
      if (db.bundles.some((x) => x.id === b.id)) continue;
      const [c] = cleanBundles([b]);
      c.order = db.bundles.length + 1;
      db.bundles.push(c);
      added = true;
    }
    // ما أُضيف يتقدّم على ما سبقه بترتيب المضمَّن، ثم يبقى ترتيب المالك
    if (added) {
      const first = (list, ids) => [...ids.map((id) => list.find((x) => x.id === id)).filter(Boolean), ...list.filter((x) => !isBuiltin(x.id))];
      first(sorted(), pack.designs.map((d) => d.id)).forEach((d, i) => { d.order = i + 1; });
      db.bundles = first(db.bundles, pack.bundles.map((b) => b.id));
      db.bundles.forEach((b, i) => { b.order = i + 1; });
    }
    save();
    return true;
  }

  /* -------------------- أدوات HTTP -------------------- */
  function send(res, code, obj, headers) {
    const body = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' }, headers || {}));
    res.end(body);
  }
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        if (n > limit) { reject(Object.assign(new Error('الملف أكبر من المسموح'), { code: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  async function readJSON(req) {
    const b = await readBody(req, MAX_JSON);
    try { return JSON.parse(b.toString('utf8') || '{}'); } catch (_) { throw Object.assign(new Error('JSON غير صالح'), { code: 400 }); }
  }

  function serveMedia(req, res, name) {
    if (!/^[a-f0-9]{16,64}\.(png|jpg|webp|gif|svg|woff2?|ttf|otf)$/.test(name)) { send(res, 404, { error: 'غير موجود' }); return true; }
    const file = path.join(mediaDir, name);
    fs.stat(file, (err, st) => {
      if (err) { send(res, 404, { error: 'غير موجود' }); return; }
      const ext = name.split('.').pop();
      const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };
      const etag = '"' + st.size.toString(16) + '-' + st.mtimeMs.toString(16) + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, {
        'content-type': types[ext],
        'content-length': st.size,
        'cache-control': 'public, max-age=31536000, immutable',
        etag,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(file).pipe(res);
    });
    return true;
  }

  function fontsPublic() {
    // خطوط الموقع (خط الكتاب + ما رفعه المالك من لوحة التحكم): معرّفة في /api/fonts.css، ولها الأولوية عند تطابق الاسم
    const site = typeof opts.siteFonts === 'function' ? opts.siteFonts() : [];
    const taken = new Set(site.map((f) => f.family));
    return {
      builtin: Core.BUILTIN_FONTS.filter((f) => !fonts.disabled.includes(f.family) && !taken.has(f.family)),
      uploaded: fonts.uploaded.filter((f) => !taken.has(f.family)),
      site,
      // البرنامج: خطوط الجهاز (تُعرف بأسمائها)
      system: systemFonts()
        .filter((f) => !taken.has(f.family) && !Core.BUILTIN_FONTS.some((b) => b.family === f.family))
        // «اللوتس» إن وُجد: باسمه وفي أول خطوط الجهاز
        .map((f) => (FONTS[f.family] && FONTS[f.family].pinned ? { family: f.family, label: FONTS[f.family].label, weights: f.weights, arabic: true, pinned: true } : { family: f.family, label: f.label, weights: f.weights, arabic: f.arabic }))
        .sort((a, b) => !!b.pinned - !!a.pinned),
    };
  }

  /* -------------------- المعالج -------------------- */
  async function handle(req, res, url) {
    url = url || new URL(req.url, 'http://x');
    const p = url.pathname;
    const m = req.method;

    try {
      if (p.startsWith('/covers-media/') && (m === 'GET' || m === 'HEAD')) return serveMedia(req, res, p.slice(14));

      // ---------- عام ----------
      if (p === '/api/covers' && m === 'GET') {
        return send(res, 200, { designs: sorted().filter((d) => d.published).map(Core.summary) }), true;
      }
      if (p === '/api/covers/fonts' && m === 'GET') return send(res, 200, fontsPublic()), true;
      if (p === '/api/covers/bundles' && m === 'GET') {
        return send(res, 200, { bundles: db.bundles.map(publicBundle).filter((b) => b.front || b.back || b.spine || b.style || b.print) }), true;
      }
      let mm = /^\/api\/covers\/([a-z0-9_-]+)$/i.exec(p);
      if (mm && m === 'GET') {
        const d = find(mm[1]);
        if (!d || !d.published) return send(res, 404, { error: 'التصميم غير موجود' }), true;
        return send(res, 200, { design: d }), true;
      }

      // ---------- المالك ----------
      if (!p.startsWith('/api/admin/covers')) return false;
      if (!(await isAdmin(req))) return send(res, 404, { error: 'غير موجود' }), true;
      if (m !== 'GET' && req.headers['x-warraq'] !== '1') return send(res, 403, { error: 'طلب مرفوض' }), true;

      if (p === '/api/admin/covers' && m === 'GET') return send(res, 200, { designs: sorted().map(Core.summary), fonts: fontsPublic(), allFonts: Core.BUILTIN_FONTS, disabledFonts: fonts.disabled }), true;
      if (p === '/api/admin/covers' && m === 'POST') {
        const body = await readJSON(req);
        const base = body.design || Core.blankDesign(String(body.name || 'تصميم جديد').slice(0, 80), body.kind);
        if (body.name) base.name = String(body.name).slice(0, 80);
        return send(res, 200, { design: upsert(base, null) }), true;
      }
      if (p === '/api/admin/covers/bundles' && m === 'GET') return send(res, 200, { bundles: db.bundles }), true;
      if (p === '/api/admin/covers/bundles' && m === 'PUT') {
        const body = await readJSON(req);
        db.bundles = cleanBundles(body.bundles);
        save();
        return send(res, 200, { bundles: db.bundles }), true;
      }
      if (p === '/api/admin/covers/order' && m === 'POST') {
        const body = await readJSON(req);
        (Array.isArray(body.ids) ? body.ids : []).forEach((id, i) => { const d = find(id); if (d) d.order = i + 1; });
        save();
        return send(res, 200, { ok: true }), true;
      }
      if (p === '/api/admin/covers/upload' && m === 'POST') {
        const buf = await readBody(req, MAX_UPLOAD);
        const t = buf.length ? sniff(buf) : null;
        if (!t) return send(res, 415, { error: 'نوع الملف غير مدعوم (PNG، JPG، WEBP، GIF، SVG، أو خط TTF/OTF/WOFF)' }), true;
        const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
        const name = hash + '.' + t.ext;
        const file = path.join(mediaDir, name);
        if (!fs.existsSync(file)) atomicWrite(file, buf);
        const size = t.kind === 'image' ? imageSize(buf, t.ext) : { w: 0, h: 0 };
        let original = '';
        try { original = decodeURIComponent(String(req.headers['x-filename'] || '')).slice(0, 120); } catch (_) { /* اسم غير مقروء */ }
        return send(res, 200, { url: '/covers-media/' + name, kind: t.kind, type: t.type, w: size.w, h: size.h, bytes: buf.length, original }), true;
      }
      if (p === '/api/admin/covers/fonts' && m === 'PUT') {
        const body = await readJSON(req);
        fonts.disabled = (Array.isArray(body.disabled) ? body.disabled : []).filter((f) => Core.BUILTIN_FONTS.some((b) => b.family === f));
        fonts.uploaded = (Array.isArray(body.uploaded) ? body.uploaded : []).slice(0, 60).map((f) => ({
          family: String((f && f.family) || '').replace(/["\\<>]/g, '').slice(0, 60).trim(),
          label: String((f && f.label) || (f && f.family) || '').replace(/[<>]/g, '').slice(0, 60).trim(),
          src: Core.safeSrc(f && f.src),
          weight: Math.min(900, Math.max(100, Number(f && f.weight) || 400)),
        })).filter((f) => f.family && f.src);
        saveFonts();
        return send(res, 200, fontsPublic()), true;
      }
      mm = /^\/api\/admin\/covers\/([a-z0-9_-]+)(\/duplicate)?$/i.exec(p);
      if (mm) {
        const d = find(mm[1]);
        if (!d) return send(res, 404, { error: 'التصميم غير موجود' }), true;
        if (mm[2] && m === 'POST') {
          const copy = JSON.parse(JSON.stringify(d));
          copy.name = d.name + ' (نسخة)';
          copy.published = false;
          return send(res, 200, { design: upsert(copy, null) }), true;
        }
        if (m === 'GET') return send(res, 200, { design: d }), true;
        if (m === 'PUT') {
          const body = await readJSON(req);
          return send(res, 200, { design: upsert(body.design || body, d.id) }), true;
        }
        if (m === 'DELETE') {
          db.designs = db.designs.filter((x) => x.id !== d.id);
          // الحِزم التي فيها هذا التصميم: يُفرَّغ موضعه
          for (const b of db.bundles) for (const k of ['front', 'back', 'spine']) if (b[k] === d.id) b[k] = null;
          save();
          return send(res, 200, { ok: true }), true;
        }
      }
      return send(res, 404, { error: 'غير موجود' }), true;
    } catch (e) {
      send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'خطأ في الخادم' });
      if (!e.code) console.error('[covers]', e);
      return true;
    }
  }

  return { handle, syncBuiltins, upsert, list: sorted, get: find, mediaDir, sniff };
}

export { sniff, imageSize };
