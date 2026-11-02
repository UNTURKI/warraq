// «الطِّراز»: مودات تُلبس البرنامج حُلّةً أخرى — تغيّر شكله وأصواته وحركته، أو تضيف إليه ما ليس فيه.
//
// المود مجلدٌ (أو ملف ‎.wqmod‎ وهو ZIP لذلك المجلد) فيه mod.json وملفاته (CSS و JS وصور وأصوات وخطوط…).
// يُثبَّت في userData/mods/<id>/، أو يُربط ربطاً من مجلد صانعه («قيد الصنع»: يتبع ملفاته ويُعاد كلما حُفظ منها شيء).
// والخادم الداخلي يخدم ملفاته (/mods/<id>/…) ويضع أوراق أنماطه في رأس صفحات أبوابه، و mods-runtime.js يشغّل نصوصه.
// هنا: الحال (المفعّل، والترتيب، والإعدادات)، والتثبيت والفحص، والضغط والفك، والوضع الآمن، والمعرض، وقالب الصانع.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
/** أجزاء البرنامج التي يدخلها مود (الطِّراز نفسه لا يدخله مود، فيبقى منه الخروج دائماً) */
const PARTS = ['shell', 'khizana', 'bench', 'muharrir', 'rahl', 'styles', 'covers', 'settings', 'other'];
const PART_NAMES = { shell: 'الهيكل', khizana: 'الخزانة', bench: 'المِنضدة', muharrir: 'المحرِّر', rahl: 'الرَّحل', styles: 'الأساليب', covers: 'المجلِّد', settings: 'الإعدادات', other: 'صفحات أخرى' };
const SETTING_TYPES = ['toggle', 'range', 'number', 'color', 'select', 'text'];
const LIMITS = { files: 3000, total: 96 * 1024 * 1024, file: 48 * 1024 * 1024 };
/** ما يُخدم من ملفات المود (وغيره لا يُخدم) */
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
};
const MEDIA = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.opus', '.webm', '.mp4']);

class ModError extends Error {}
const fail = (msg) => {
  throw new ModError(msg);
};
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);

/* ================================================================ ZIP: فكٌّ حذِر وضغط */
let CRC = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** مسارٌ داخل الحزمة: نسبيٌّ لا يخرج منها ← المسار الموحّد، أو null */
function safeRel(name) {
  const n = String(name).replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.includes('\0')) return null;
  const parts = n.split('/').filter((x) => x !== '' && x !== '.');
  if (parts.some((x) => x === '..')) return null;
  return parts.join('/');
}
/** ← [{ name, data }] (المجلدات تُترك). يرفض: مسارٌ يخرج من الحزمة، وروابط، وتشفير، وحجمٌ فوق الحد */
function unzip(buf) {
  if (buf.length < 22) fail('ليس ملف مودٍ صالحاً (ZIP)');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail('ليس ملف مودٍ صالحاً (ZIP)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count > LIMITS.files) fail(`ملفاتٌ كثيرة في المود (${count})`);
  const out = [];
  let total = 0;
  for (let k = 0; k < count; k++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) fail('ملف المود تالف');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const xlen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const ext = buf.readUInt32LE(off + 38);
    const loc = buf.readUInt32LE(off + 42);
    const raw = buf.subarray(off + 46, off + 46 + nlen);
    const name = flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1');
    off += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (flags & 1) fail('ملف المود مشفّر');
    if (((ext >>> 16) & 0o170000) === 0o120000) fail('في المود رابطٌ رمزي (symlink)، ولا يُقبل');
    const rel = safeRel(name);
    if (!rel) fail('في المود مسارٌ غير صالح: ' + name.slice(0, 80));
    if (usize > LIMITS.file) fail('ملفٌ كبير جداً في المود: ' + rel);
    total += usize;
    if (total > LIMITS.total) fail('المود أكبر من الحد (٩٦ م.ب)');
    if (loc + 30 > buf.length || buf.readUInt32LE(loc) !== 0x04034b50) fail('ملف المود تالف');
    const start = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const comp = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(comp, { maxOutputLength: Math.max(usize, 1) });
      } catch {
        fail('تعذّر فكّ ملفٍ في المود: ' + rel);
      }
    } else fail('ضغطٌ غير معروف في المود');
    if (data.length !== usize) fail('ملف المود تالف: ' + rel);
    out.push({ name: rel, data });
  }
  return out;
}
/** [{ name, data }] ← ZIP (مضغوط deflate، والأسماء UTF-8) */
function zip(files) {
  const parts = [];
  const central = [];
  let off = 0;
  const t = new Date();
  const dosTime = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1);
  const dosDate = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useComp = comp.length < data.length;
    const body = useComp ? comp : data;
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(useComp ? 8 : 0, 8);
    h.writeUInt16LE(dosTime, 10);
    h.writeUInt16LE(dosDate, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(name.length, 26);
    parts.push(h, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(useComp ? 8 : 0, 10);
    c.writeUInt16LE(dosTime, 12);
    c.writeUInt16LE(dosDate, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(files.length, 8);
  e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

/* ================================================================ الملفات */
/** ملفات مجلد (نسبية، بلا روابط ولا ما يبدأ بنقطة إلا .well-known) */
function walk(root, limit = LIMITS.files) {
  const out = [];
  let total = 0;
  const rec = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'Thumbs.db' || e.name === 'desktop.ini') continue;
      const abs = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) rec(abs, r);
      else if (e.isFile()) {
        const size = fs.statSync(abs).size;
        total += size;
        out.push({ rel: r, abs, size });
        if (out.length > limit) fail(`ملفاتٌ كثيرة في المجلد (أكثر من ${limit})`);
        if (total > LIMITS.total) fail('المجلد أكبر من الحد (٩٦ م.ب)');
      }
    }
  };
  rec(root, '');
  return { files: out, total };
}
const rmrf = (p) => {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
};
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of walk(src).files) {
    const to = path.join(dst, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f.abs, to);
  }
}

/* ================================================================ mod.json */
function fileIn(root, rel, kind, exts) {
  const r = safeRel(rel);
  if (!r) fail(`مسارٌ غير صالح في mod.json (${kind}): ${String(rel).slice(0, 80)}`);
  const ext = path.extname(r).toLowerCase();
  if (exts && !exts.includes(ext)) fail(`${kind} يجب أن يكون ${exts.join(' أو ')}: ${r}`);
  const abs = path.join(root, ...r.split('/'));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) fail(`الملف غير موجود في المود: ${r}`);
  return r;
}
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
/** أجزاء المود وملفات كلٍّ منها: «parts» قائمة (والملفات واحدة لكلها) أو كائن (لكل جزءٍ ملفاته) */
function partsOf(m, root) {
  const out = {};
  const files = (o) => ({
    css: list(o.css).slice(0, 40).map((x) => fileIn(root, x, 'css', ['.css'])),
    js: list(o.js).slice(0, 40).map((x) => fileIn(root, x, 'js', ['.js', '.mjs'])),
  });
  const expand = (p) => (p === '*' || p === 'all' ? PARTS : PARTS.includes(p) ? [p] : fail(`جزءٌ غير معروف في parts: ${String(p).slice(0, 40)} (المعروف: ${PARTS.join('، ')}، أو *)`));
  if (m.parts && typeof m.parts === 'object' && !Array.isArray(m.parts)) {
    for (const [k, v] of Object.entries(m.parts)) for (const p of expand(k)) out[p] = files(v && typeof v === 'object' ? v : {});
  } else {
    const ps = list(m.parts == null ? 'shell' : m.parts);
    const f = files(m);
    for (const k of ps) for (const p of expand(String(k))) out[p] = f;
  }
  for (const k of Object.keys(out)) if (!out[k].css.length && !out[k].js.length) delete out[k];
  if (!Object.keys(out).length) fail('لا ملفات CSS ولا JS في المود (css و js في mod.json)');
  return out;
}
function settingsOf(arr) {
  const out = [];
  const seen = new Set();
  for (const s of list(arr).slice(0, 40)) {
    if (!s || typeof s !== 'object') continue;
    const key = String(s.key || '');
    if (!/^[a-zA-Z][\w-]{0,40}$/.test(key) || seen.has(key)) fail('مفتاح إعدادٍ غير صالح أو مكرر: ' + key.slice(0, 40));
    seen.add(key);
    const type = SETTING_TYPES.includes(s.type) ? s.type : fail(`نوع الإعداد «${key}» غير معروف (${SETTING_TYPES.join('، ')})`);
    const x = { key, type, label: str(s.label || key, 80), hint: str(s.hint, 200) };
    if (type === 'toggle') x.default = !!s.default;
    else if (type === 'range' || type === 'number') {
      x.min = Number.isFinite(+s.min) ? +s.min : type === 'range' ? 0 : -1e9;
      x.max = Number.isFinite(+s.max) ? +s.max : type === 'range' ? 1 : 1e9;
      x.step = Number.isFinite(+s.step) && +s.step > 0 ? +s.step : type === 'range' ? (x.max - x.min) / 100 : 1;
      x.default = Math.min(x.max, Math.max(x.min, Number.isFinite(+s.default) ? +s.default : x.min));
      if (s.unit) x.unit = str(s.unit, 12);
    } else if (type === 'color') x.default = /^#[0-9a-f]{6}$/i.test(s.default) ? s.default : '#c5a059';
    else if (type === 'select') {
      x.options = list(s.options)
        .slice(0, 30)
        .map((o) => (o && typeof o === 'object' ? { value: str(o.value, 60), label: str(o.label || o.value, 80) } : { value: str(o, 60), label: str(o, 80) }))
        .filter((o) => o.value);
      if (!x.options.length) fail(`الإعداد «${key}» بلا خيارات`);
      x.default = x.options.some((o) => o.value === s.default) ? s.default : x.options[0].value;
    } else x.default = str(s.default, 500);
    out.push(x);
  }
  return out;
}
/** قراءة mod.json وفحصه ← الوصف الموحّد (أو خطأٌ بالعربية) */
function readManifest(root) {
  const f = path.join(root, 'mod.json');
  if (!fs.existsSync(f)) fail('لا ملف mod.json في المود');
  let m;
  try {
    m = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    fail('mod.json ليس JSON صالحاً: ' + e.message.slice(0, 120));
  }
  if (!m || typeof m !== 'object') fail('mod.json ليس كائناً');
  const id = String(m.id || '');
  if (!ID_RE.test(id)) fail('معرّف المود (id) يجب أن يكون بحروفٍ لاتينية صغيرة وأرقام و - _ . (من ٢ إلى ٦٤): ' + id.slice(0, 64));
  const name = str(m.name, 80) || fail('اسم المود (name) مطلوب');
  const icon = m.icon ? fileIn(root, m.icon, 'icon', ['.svg', '.png', '.jpg', '.jpeg', '.webp']) : '';
  const preview = m.preview ? fileIn(root, m.preview, 'preview', ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']) : '';
  const homepage = /^https?:\/\/\S+$/i.test(String(m.homepage || '')) ? String(m.homepage).slice(0, 300) : '';
  return {
    id,
    name,
    version: str(m.version, 24) || '1.0.0',
    author: str(m.author, 80),
    description: str(m.description, 600),
    homepage,
    icon,
    preview,
    parts: partsOf(m, root),
    settings: settingsOf(m.settings),
    reload: m.reload === true || m.reload === 'page',
    warraq: str(m.warraq, 24),
  };
}
const sizeOf = (root) => {
  try {
    return walk(root).total;
  } catch {
    return 0;
  }
};

/* ================================================================ ردّ الذكاء الاصطناعي ← ملفات */
const NAME_RE = /^[\w\-. ]+(?:\/[\w\-. ]+)*\.(?:json|js|mjs|css|svg|html|md|txt)$/i;
/**
 * نصٌّ فيه ملفاتٌ في كتل كود (كما يكتبها الذكاء الاصطناعي) ← [{ name, data }]
 * الاسم: سطر «FILE: الاسم» (أو «ملف:») قبل الكتلة، أو سطرٌ فيه الاسم وحده، أو في رأس الكتلة (```js mod.js أو title="mod.js").
 * وإن تكرر ملفٌ أُخذ آخره (التصحيح يأتي بعد الأصل). ويُقبل كذلك JSON: { "files": { "الاسم": "المحتوى" } }.
 */
function parseBundle(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  try {
    const j = JSON.parse(src.trim());
    if (j && j.files && typeof j.files === 'object') return Object.entries(j.files).filter(([k, v]) => typeof v === 'string' && safeRel(k)).map(([k, v]) => ({ name: safeRel(k), data: v }));
  } catch {}
  const lines = src.split('\n');
  const out = new Map();
  // كتلةٌ واحدة: «=== FILE: الاسم ===» قبل كل ملف، و«=== END ===» في آخرها (ما يطلبه التوجيه: يُنسخ بزرٍّ واحد)
  const MARK = /^\s*={3,}\s*(?:FILE|File|file|ملف|الملف)\s*[:：]\s*(.+?)\s*={3,}\s*$/;
  const ENDM = /^\s*={3,}\s*(?:END|End|end|النهاية|انتهى)\s*={3,}\s*$/;
  if (lines.some((l) => MARK.test(l))) {
    let name = null;
    let body = [];
    const put = () => {
      if (!name) return;
      // (ما أحاطه الذكاء الاصطناعي بكتلة كودٍ رغم التوجيه: تُنزع)
      while (body.length && !body[0].trim()) body.shift();
      while (body.length && !body[body.length - 1].trim()) body.pop();
      if (body.length >= 2 && /^\s*(`{3,}|~{3,})/.test(body[0]) && /^\s*(`{3,}|~{3,})\s*$/.test(body[body.length - 1])) body = body.slice(1, -1);
      const r = safeRel(name.replace(/^[`*"'«]+|[`*"'»]+$/g, '').trim());
      if (r) out.set(r, body.join('\n') + '\n');
    };
    for (const l of lines) {
      const m = MARK.exec(l);
      if (m) {
        put();
        name = m[1];
        body = [];
      } else if (ENDM.test(l)) {
        put();
        name = null;
        body = [];
      } else if (name) {
        // سطر إغلاق الكتلة الكبرى (أربع علامات أو أكثر) بعد آخر ملف بلا «END»
        if (/^\s*`{4,}\s*$/.test(l)) {
          put();
          name = null;
          body = [];
        } else body.push(l);
      }
    }
    put();
    if (out.size) return [...out].map(([name, data]) => ({ name, data }));
  }
  let pending = null;
  const clean = (n) => String(n || '').trim().replace(/^[`*"'«]+|[`*"'»:]+$/g, '').trim();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^\s*(?:[#>*\-]+\s*)*(?:\*\*)?\s*(?:FILE|File|file|ملف|الملف)\s*[:：]\s*(.+?)\s*$/.exec(l);
    if (h && NAME_RE.test(clean(h[1]))) {
      pending = clean(h[1]);
      continue;
    }
    const alone = /^\s*(?:[#>*\-]+\s*)*(.+?)\s*$/.exec(l);
    if (alone && NAME_RE.test(clean(alone[1])) && /^\s*(`{3,}|~{3,})/.test(lines[i + 1] || '')) {
      pending = clean(alone[1]);
      continue;
    }
    const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(l);
    if (!f) continue;
    const fence = f[1];
    const info = f[2] || '';
    let name = pending;
    const t = /(?:title|file|name|filename)\s*=\s*["']?([^"'\s]+)/i.exec(info) || /(?:^|\s)([\w\-./]+\.(?:json|js|mjs|css|svg|html|md|txt))(?:\s|$)/i.exec(info);
    if (!name && t) name = clean(t[1]);
    const body = [];
    const close = new RegExp('^\\s*' + (fence[0] === '`' ? '`' : '~') + '{' + fence.length + ',}\\s*$');
    for (i++; i < lines.length && !close.test(lines[i]); i++) body.push(lines[i]);
    pending = null;
    const r = name && safeRel(name);
    if (r) out.set(r, body.join('\n').replace(/\s+$/, '') + '\n');
  }
  return [...out].map(([name, data]) => ({ name, data }));
}

/* ================================================================ السجل */
/**
 * @param {object} o
 * @param {string} o.userData   مجلد بيانات البرنامج
 * @param {string} o.galleryDir مودات المعرض (تأتي مع البرنامج)
 * @param {string} o.templateDir قالب «اصنع مودًا»
 * @param {(ev:object)=>void} o.onChange يُخبَر بكل تغيّر (فيبلّغ الصفحات)
 */
function createMods(o) {
  const DIR = path.join(o.userData, 'mods');
  const STAGE = path.join(DIR, '_staging');
  const STATE = path.join(DIR, '_state.json');
  fs.mkdirSync(DIR, { recursive: true });
  rmrf(STAGE);
  const DEF = () => ({ v: 1, enabled: {}, order: [], settings: {}, dev: {}, seeded: [], safe: false, safeReason: '', installed: {} });
  let state = DEF();
  try {
    state = { ...DEF(), ...JSON.parse(fs.readFileSync(STATE, 'utf8')) };
  } catch {}
  const save = () => {
    try {
      fs.writeFileSync(STATE + '.tmp', JSON.stringify(state, null, 1));
      fs.renameSync(STATE + '.tmp', STATE);
    } catch {}
  };
  const mods = new Map(); // id ← { m, root, dev, rev, broken }
  const errors = new Map(); // id ← [{ part, message, at }]
  const staged = new Map(); // رمز ← { dir, m, size, files, at }
  const watchers = new Map(); // id ← FSWatcher
  const devRev = new Map();
  let needsReload = false;

  const emit = (ev) => {
    try {
      o.onChange && o.onChange({ at: Date.now(), ...ev });
    } catch {}
  };
  const gallery = () => {
    const out = [];
    if (!o.galleryDir || !fs.existsSync(o.galleryDir)) return out;
    for (const e of fs.readdirSync(o.galleryDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      try {
        out.push({ root: path.join(o.galleryDir, e.name), m: readManifest(path.join(o.galleryDir, e.name)) });
      } catch {}
    }
    return out;
  };
  const isBuiltin = (id) => gallery().some((g) => g.m.id === id);

  /** المودات المثبّتة والمربوطة */
  function scan() {
    mods.clear();
    for (const e of fs.readdirSync(DIR, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const root = path.join(DIR, e.name);
      try {
        const m = readManifest(root);
        if (m.id !== e.name) fail(`معرّف المود (${m.id}) غير اسم مجلده (${e.name})`);
        mods.set(m.id, { m, root, dev: false, rev: String(state.installed[m.id] || fs.statSync(path.join(root, 'mod.json')).mtimeMs | 0) });
      } catch (err) {
        mods.set(e.name, { m: null, root, dev: false, rev: '0', broken: err.message });
      }
    }
    for (const [id, dir] of Object.entries(state.dev)) {
      try {
        if (!fs.existsSync(dir)) fail('مجلد المود غير موجود: ' + dir);
        const m = readManifest(dir);
        if (m.id !== id) fail(`تغيّر معرّف المود في mod.json (${m.id})؛ اربطه من جديد`);
        mods.set(id, { m, root: dir, dev: true, rev: 'd' + (devRev.get(id) || 0) });
      } catch (err) {
        mods.set(id, { m: null, root: dir, dev: true, rev: '0', broken: err.message });
      }
    }
    // الترتيب: ما لم يُرتَّب يُلحق بآخره
    state.order = state.order.filter((id) => mods.has(id));
    for (const id of mods.keys()) if (!state.order.includes(id)) state.order.push(id);
    syncWatchers();
  }
  /**
   * مودات المعرض القديم (كانت مع البرنامج حتى الإصدار ٢١، وصارت ملفاتٍ مستقلة يضيفها المستخدم متى شاء):
   * ما وُضع منها وحده ولم يُشغَّل ولم تُغيَّر إعداداته يُزال مرةً واحدة؛ وما سواه يبقى كأي مودٍ مثبّت.
   */
  function retire() {
    if (state.retired) return;
    for (const id of ['lamp-fire', 'dar', 'old-paper']) {
      if (!state.seeded.includes(id) || state.enabled[id] || state.dev[id] || (state.settings[id] && Object.keys(state.settings[id]).length)) continue;
      if (o.galleryDir && fs.existsSync(path.join(o.galleryDir, id))) continue;
      try {
        rmrf(path.join(DIR, id));
      } catch {}
      delete state.installed[id];
      delete state.enabled[id];
      delete state.settings[id];
      state.order = state.order.filter((x) => x !== id);
    }
    state.retired = true;
    save();
  }
  /** مودات المعرض: تُوضع أول مرة غير مفعّلة (ومن حذف أحدها لا يعود إلا من «المعرض») */
  function seed() {
    let changed = false;
    for (const g of gallery()) {
      if (state.seeded.includes(g.m.id)) continue;
      state.seeded.push(g.m.id);
      changed = true;
      if (fs.existsSync(path.join(DIR, g.m.id)) || state.dev[g.m.id]) continue;
      try {
        copyDir(g.root, path.join(DIR, g.m.id));
        state.installed[g.m.id] = Date.now();
        state.enabled[g.m.id] = false;
      } catch {}
    }
    if (changed) save();
  }

  /* ---------------- قيد الصنع: يتبع ملفاته */
  function syncWatchers() {
    for (const [id, w] of watchers) {
      if (!state.dev[id]) {
        try {
          w.close();
        } catch {}
        watchers.delete(id);
      }
    }
    for (const [id, dir] of Object.entries(state.dev)) {
      if (watchers.has(id) || !fs.existsSync(dir)) continue;
      let t = null;
      try {
        const w = fs.watch(dir, { recursive: true }, (_ev, file) => {
          if (file && /(^|[\\/])\.|~$|\.tmp$/.test(String(file))) return;
          clearTimeout(t);
          t = setTimeout(() => {
            devRev.set(id, (devRev.get(id) || 0) + 1);
            errors.delete(id);
            scan();
            emit({ reason: 'files', id });
          }, 250);
        });
        w.on('error', () => {});
        watchers.set(id, w);
      } catch {}
    }
  }

  /* ---------------- ما تراه الصفحات */
  function valuesOf(id, m) {
    const saved = state.settings[id] || {};
    const out = {};
    for (const s of m.settings) out[s.key] = saved[s.key] !== undefined ? saved[s.key] : s.default;
    return out;
  }
  /** المودات المفعّلة في جزءٍ من البرنامج، بترتيبها (الأخير يعلو) */
  function active(part) {
    const p = PARTS.includes(part) ? part : 'other';
    if (state.safe) return { safe: true, part: p, mods: [] };
    const out = [];
    for (const id of state.order) {
      const x = mods.get(id);
      if (!x || !x.m || !state.enabled[id]) continue;
      const files = x.m.parts[p];
      if (!files) continue;
      out.push({ id, name: x.m.name, version: x.m.version, base: `/mods/${encodeURIComponent(id)}/`, css: files.css, js: files.js, settings: valuesOf(id, x.m), rev: x.rev, reload: x.m.reload, dev: x.dev });
    }
    return { safe: false, part: p, mods: out };
  }
  const anyActive = () => !state.safe && state.order.some((id) => state.enabled[id] && mods.get(id) && mods.get(id).m);
  /** ملفٌّ من ملفات مود مثبّت ← { path, type, media } أو null */
  function file(id, rel) {
    const x = mods.get(String(id));
    const r = safeRel(rel);
    if (!x || !r) return null;
    const ext = path.extname(r).toLowerCase();
    if (!MIME[ext]) return null;
    const abs = path.join(x.root, ...r.split('/'));
    const relCheck = path.relative(x.root, abs);
    if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) return null;
    try {
      const st = fs.lstatSync(abs);
      if (!st.isFile()) return null;
    } catch {
      return null;
    }
    return { path: abs, type: MIME[ext], media: MEDIA.has(ext) };
  }

  /* ---------------- ما يراه «الطِّراز» */
  function publicList() {
    const items = state.order.map((id) => {
      const x = mods.get(id);
      const base = `/mods/${encodeURIComponent(id)}/`;
      if (!x.m) return { id, broken: x.broken, dev: x.dev, path: x.root, enabled: false };
      return {
        id,
        name: x.m.name,
        version: x.m.version,
        author: x.m.author,
        description: x.m.description,
        homepage: x.m.homepage,
        icon: x.m.icon ? base + x.m.icon + '?v=' + x.rev : '',
        preview: x.m.preview ? base + x.m.preview + '?v=' + x.rev : '',
        parts: Object.keys(x.m.parts),
        partNames: Object.keys(x.m.parts).map((p) => PART_NAMES[p]),
        schema: x.m.settings,
        settings: valuesOf(id, x.m),
        enabled: !!state.enabled[id],
        reload: x.m.reload,
        dev: x.dev,
        builtin: isBuiltin(id),
        path: x.root,
        size: sizeOf(x.root),
        errors: errors.get(id) || [],
        rev: x.rev,
      };
    });
    const have = new Set(mods.keys());
    const gal = gallery()
      .filter((g) => !have.has(g.m.id))
      .map((g) => ({ id: g.m.id, name: g.m.name, version: g.m.version, author: g.m.author, description: g.m.description, partNames: Object.keys(g.m.parts).map((p) => PART_NAMES[p]) }));
    return { safe: state.safe, safeReason: state.safeReason, needsReload, mods: items, gallery: gal, parts: PART_NAMES };
  }

  /* ---------------- التثبيت */
  /** فحص ملف ‎.wqmod‎ أو مجلد قبل تثبيته ← ملخّصه ورمزٌ لتثبيته */
  function inspect(src) {
    if (!src || typeof src !== 'string' || !path.isAbsolute(src) || !fs.existsSync(src)) fail('الملف غير موجود');
    const st = fs.statSync(src);
    const token = crypto.randomBytes(12).toString('hex');
    const dir = path.join(STAGE, token);
    fs.mkdirSync(dir, { recursive: true });
    try {
      if (st.isDirectory()) copyDir(src, dir);
      else {
        if (st.size > LIMITS.total) fail('الملف أكبر من الحد (٩٦ م.ب)');
        const buf = fs.readFileSync(src);
        if (buf.readUInt32LE(0) !== 0x04034b50) fail('ليس ملف مود (‎.wqmod‎ ملف ZIP فيه mod.json)');
        let files = unzip(buf);
        // حزمةٌ فيها مجلدٌ واحد يحمل المود: يُرفع ما فيه
        if (!files.some((f) => f.name === 'mod.json')) {
          const tops = new Set(files.map((f) => f.name.split('/')[0]));
          const top = [...tops][0];
          if (tops.size === 1 && files.some((f) => f.name === top + '/mod.json')) files = files.map((f) => ({ ...f, name: f.name.slice(top.length + 1) })).filter((f) => f.name);
        }
        for (const f of files) {
          if (/(^|\/)(\.|__MACOSX)/.test(f.name)) continue;
          const to = path.join(dir, ...f.name.split('/'));
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.writeFileSync(to, f.data);
        }
      }
      return summarize(dir, token);
    } catch (err) {
      rmrf(dir);
      throw err;
    }
  }
  /** المجلد المؤقت ← فحص mod.json، وملخّصٌ يُعرض قبل التثبيت (ورمزٌ يثبّته) */
  function summarize(dir, token, extra = {}) {
    {
      const m = readManifest(dir);
      const cur = mods.get(m.id);
      if (cur && cur.dev) fail(`مودٌ بالمعرّف نفسه (${m.id}) مربوطٌ «قيد الصنع»؛ افصله أولاً`);
      const { files, total } = walk(dir);
      staged.set(token, { dir, m, size: total, files: files.length, at: Date.now() });
      return {
        ...extra,
        token,
        id: m.id,
        name: m.name,
        version: m.version,
        author: m.author,
        description: m.description,
        partNames: Object.keys(m.parts).map((p) => PART_NAMES[p]),
        settings: m.settings.length,
        size: total,
        files: files.length,
        update: cur && cur.m ? { from: cur.m.version } : null,
        preview: m.preview ? 'data:' + MIME[path.extname(m.preview).toLowerCase()] + ';base64,' + fs.readFileSync(path.join(dir, ...m.preview.split('/'))).toString('base64') : '',
        icon: m.icon ? 'data:' + MIME[path.extname(m.icon).toLowerCase()] + ';base64,' + fs.readFileSync(path.join(dir, ...m.icon.split('/'))).toString('base64') : '',
      };
    }
  }
  /**
   * «اصنعه بالذكاء الاصطناعي»: ردّ الذكاء الاصطناعي كما نُسخ (ملفاتٌ نصية: FILE: الاسم ثم كتلة الكود)، وما أُرفق معه من صورٍ وأصوات
   * ← ملخّصٌ كالتثبيت من ملف، ومعه ما وُجد من ملفات وما يذكره المود ولم يُرفق (missing)
   */
  function fromText(text, attached = []) {
    const files = parseBundle(text);
    if (!files.length) fail('لم أجد في الردّ ملفات المود. انسخ كتلة الكود التي في ردّ الذكاء الاصطناعي (فيها «=== FILE: mod.json ===» ثم كل ملف)، أو الردّ كله');
    if (!files.some((f) => f.name === 'mod.json')) fail('في الردّ ملفات، لكن ليس فيها mod.json. اطلب من الذكاء الاصطناعي أن يكتبه كاملاً');
    const token = crypto.randomBytes(12).toString('hex');
    const dir = path.join(STAGE, token);
    fs.mkdirSync(dir, { recursive: true });
    try {
      let total = 0;
      const put = (rel, data) => {
        const r = safeRel(rel);
        if (!r) fail('في الردّ مسارٌ غير صالح: ' + String(rel).slice(0, 80));
        total += data.length;
        if (total > LIMITS.total) fail('المود أكبر من الحد (٩٦ م.ب)');
        const to = path.join(dir, ...r.split('/'));
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, data);
        return r;
      };
      const names = files.map((f) => put(f.name, Buffer.from(f.data, 'utf8')));
      // ما يذكره نصّ المود من صورٍ وأصواتٍ وخطوط: يوضع المرفق في مكانه المذكور (وإلا في assets/)
      const refs = new Set();
      const RE = /["'`(]((?:\.?\/)?(?:[\w\-]+\/)*[\w\-. ]+\.(?:png|jpe?g|webp|gif|avif|svg|mp3|wav|ogg|oga|m4a|opus|mp4|webm|woff2?|ttf|otf|glb|gltf|bin|json))["'`)]/gi;
      for (const f of files) for (const m of f.data.matchAll(RE)) {
        const r = safeRel(m[1]);
        if (r && !/^https?:/.test(m[1])) refs.add(r);
      }
      const added = [];
      for (const a of Array.isArray(attached) ? attached.slice(0, 400) : []) {
        if (!a || !a.name || !a.data) continue;
        const base = String(a.name).split(/[\\/]/).pop();
        const at = [...refs].find((r) => r.split('/').pop().toLowerCase() === base.toLowerCase()) || 'assets/' + base;
        added.push(put(at, Buffer.from(a.data)));
      }
      const have = new Set(walk(dir).files.map((f) => f.rel));
      const missing = [...refs].filter((r) => !have.has(r) && !/\.json$/i.test(r));
      // أيقونته وصورة بطاقته إن ذُكرتا ولم تأتيا: يُثبَّت بدونهما (ويُقال إنهما لم تُرفقا)
      try {
        const mp = path.join(dir, 'mod.json');
        const mj = JSON.parse(fs.readFileSync(mp, 'utf8'));
        let ch = false;
        for (const k of ['icon', 'preview']) {
          const r = typeof mj[k] === 'string' && safeRel(mj[k]);
          if (mj[k] != null && (!r || !have.has(r))) {
            delete mj[k];
            ch = true;
          }
        }
        if (ch) fs.writeFileSync(mp, JSON.stringify(mj, null, 2));
      } catch {}
      return summarize(dir, token, { fromText: true, found: names, added, missing });
    } catch (err) {
      rmrf(dir);
      throw err;
    }
  }
  function install(token) {
    const s = staged.get(token);
    if (!s) fail('انتهت مهلة التثبيت؛ اختر الملف مرة أخرى');
    staged.delete(token);
    const id = s.m.id;
    const to = path.join(DIR, id);
    const old = fs.existsSync(to);
    const bak = to + '.__old';
    rmrf(bak);
    if (old) fs.renameSync(to, bak);
    try {
      fs.renameSync(s.dir, to);
    } catch {
      copyDir(s.dir, to);
      rmrf(s.dir);
    }
    rmrf(bak);
    state.installed[id] = Date.now();
    // تثبيتٌ جديد: يعمل من وقته؛ وتحديث: يبقى على حاله
    if (!old || state.enabled[id] === undefined) state.enabled[id] = true;
    if (!state.order.includes(id)) state.order.push(id);
    errors.delete(id);
    save();
    scan();
    emit({ reason: old ? 'update' : 'install', id });
    return { id, updated: old };
  }
  function cancel(token) {
    const s = staged.get(token);
    if (s) rmrf(s.dir);
    staged.delete(token);
  }
  /** «قيد الصنع»: مودٌ يُشغَّل من مجلد صانعه ويتبع ملفاته */
  function link(dir) {
    if (!dir || !path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail('المجلد غير موجود');
    const m = readManifest(dir);
    const cur = mods.get(m.id);
    if (cur && !cur.dev) fail(`مودٌ بالمعرّف نفسه (${m.id}) مثبّت؛ احذفه أولاً، أو غيّر id في mod.json`);
    state.dev[m.id] = dir;
    state.enabled[m.id] = true;
    if (!state.order.includes(m.id)) state.order.push(m.id);
    errors.delete(m.id);
    save();
    scan();
    emit({ reason: 'install', id: m.id });
    return { id: m.id };
  }
  function remove(id) {
    const x = mods.get(id);
    if (!x) return false;
    if (x.dev) delete state.dev[id];
    else rmrf(path.join(DIR, id));
    delete state.enabled[id];
    delete state.settings[id];
    delete state.installed[id];
    state.order = state.order.filter((k) => k !== id);
    errors.delete(id);
    if (x.m && x.m.reload) needsReload = true;
    save();
    scan();
    emit({ reason: 'remove', id });
    return true;
  }
  /** من المعرض (ما حُذف منه يعود) */
  function addGallery(id) {
    const g = gallery().find((x) => x.m.id === id);
    if (!g) fail('ليس في المعرض');
    if (mods.has(id)) return { id };
    copyDir(g.root, path.join(DIR, id));
    state.installed[id] = Date.now();
    state.enabled[id] = true;
    if (!state.order.includes(id)) state.order.push(id);
    save();
    scan();
    emit({ reason: 'install', id });
    return { id };
  }

  /* ---------------- الحال */
  function setEnabled(id, on) {
    const x = mods.get(id);
    if (!x || !x.m) fail('المود غير موجود');
    state.enabled[id] = !!on;
    if (!on && x.m.reload) needsReload = true;
    save();
    emit({ reason: 'toggle', id, on: !!on });
    return true;
  }
  function setSettings(id, values) {
    const x = mods.get(id);
    if (!x || !x.m) fail('المود غير موجود');
    const cur = { ...(state.settings[id] || {}) };
    for (const s of x.m.settings) {
      if (!values || !(s.key in values)) continue;
      const v = values[s.key];
      if (s.type === 'toggle') cur[s.key] = !!v;
      else if (s.type === 'range' || s.type === 'number') {
        const n = +v;
        if (Number.isFinite(n)) cur[s.key] = Math.min(s.max, Math.max(s.min, n));
      } else if (s.type === 'color') {
        if (/^#[0-9a-f]{6}$/i.test(v)) cur[s.key] = String(v).toLowerCase();
      } else if (s.type === 'select') {
        if (s.options.some((op) => op.value === v)) cur[s.key] = v;
      } else cur[s.key] = str(v, 500);
    }
    state.settings[id] = cur;
    save();
    emit({ reason: 'settings', id });
    return valuesOf(id, x.m);
  }
  function resetSettings(id) {
    delete state.settings[id];
    save();
    emit({ reason: 'settings', id });
    return true;
  }
  function setOrder(ids) {
    const want = (Array.isArray(ids) ? ids : []).filter((id) => mods.has(id));
    state.order = [...want, ...state.order.filter((id) => !want.includes(id))];
    save();
    emit({ reason: 'order' });
    return state.order;
  }
  function setSafe(on, reason = '') {
    state.safe = !!on;
    state.safeReason = on ? String(reason || '') : '';
    if (on) needsReload = false;
    save();
    emit({ reason: 'safe', on: !!on });
    return true;
  }
  /** خطأٌ من مود في صفحةٍ ما (يُعرض في «الطِّراز») */
  function report(id, part, message) {
    if (!mods.has(id)) return;
    const arr = errors.get(id) || [];
    const msg = str(message, 600);
    const last = arr[arr.length - 1];
    if (last && last.message === msg && last.part === part && Date.now() - last.at < 5000) {
      last.n = (last.n || 1) + 1;
      last.at = Date.now();
    } else arr.push({ part: PARTS.includes(part) ? part : 'other', partName: PART_NAMES[part] || part, message: msg, at: Date.now() });
    while (arr.length > 20) arr.shift();
    errors.set(id, arr);
    emit({ reason: 'error', id });
  }
  const clearErrors = (id) => (errors.delete(id), emit({ reason: 'error', id }), true);
  /** «أعد تحميله»: يُقرأ من جديد وتُعاد ملفاته في الصفحات */
  function reload(id) {
    const x = mods.get(id);
    if (!x) return false;
    if (x.dev) devRev.set(id, (devRev.get(id) || 0) + 1);
    else state.installed[id] = Date.now();
    errors.delete(id);
    save();
    scan();
    emit({ reason: 'files', id });
    return true;
  }
  const reloaded = () => {
    needsReload = false;
  };

  /* ---------------- التصدير والصنع */
  function exportMod(id, out) {
    const x = mods.get(id);
    if (!x || !x.m) fail('المود غير موجود');
    readManifest(x.root);
    const files = walk(x.root).files.map((f) => ({ name: f.rel, data: fs.readFileSync(f.abs) }));
    fs.writeFileSync(out, zip(files));
    return { path: out, size: fs.statSync(out).size };
  }
  /** اسمٌ عربي ← معرّفٌ لاتيني مقبول (وإلا mod-xxxx) */
  function slug(name) {
    const s = String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return ID_RE.test(s) ? s : 'mod-' + crypto.randomBytes(3).toString('hex');
  }
  /** «اصنع مودًا»: مجلدٌ من القالب باسمه، ويُربط «قيد الصنع» */
  function create({ name, id, parts, parent }) {
    const nm = str(name, 80) || 'مودي الأول';
    let mid = ID_RE.test(String(id || '')) ? String(id) : slug(name);
    while (mods.has(mid)) mid = mid.replace(/-\d+$/, '') + '-' + Math.floor(Math.random() * 900 + 100);
    const ps = list(parts).filter((p) => PARTS.includes(p));
    const folderName = nm.replace(/[\\/:*?"<>|]+/g, ' ').trim() || mid;
    let dir = path.join(parent, folderName);
    for (let k = 2; fs.existsSync(dir); k++) dir = path.join(parent, `${folderName} (${k})`);
    copyDir(o.templateDir, dir);
    const mf = path.join(dir, 'mod.json');
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    m.id = mid;
    m.name = nm;
    m.parts = ps.length ? ps : ['shell'];
    fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');
    link(dir);
    return { id: mid, dir };
  }
  const readTpl = (n) => {
    try {
      return fs.readFileSync(path.join(o.templateDir, n), 'utf8');
    } catch {
      return '';
    }
  };
  const prompt = () => readTpl('توجيه الذكاء الاصطناعي.txt');
  const guide = () => {
    try {
      return fs.readFileSync(path.join(o.templateDir, 'دليل الصانع.md'), 'utf8');
    } catch {
      return '';
    }
  };

  retire();
  seed();
  scan();
  save();
  return {
    DIR,
    list: publicList,
    active,
    anyActive,
    file,
    inspect,
    fromText,
    prompt,
    install,
    cancel,
    link,
    remove,
    addGallery,
    setEnabled,
    setSettings,
    resetSettings,
    setOrder,
    setSafe,
    get safe() {
      return state.safe;
    },
    report,
    clearErrors,
    reload,
    reloaded,
    exportMod,
    create,
    guide,
    /** للخادم الداخلي (app/server.js): لا يرى غير هذا */
    serverHooks: () => ({ active, file, guide, prompt, safe: () => state.safe }),
    close() {
      for (const w of watchers.values()) {
        try {
          w.close();
        } catch {}
      }
      watchers.clear();
      rmrf(STAGE);
    },
  };
}

module.exports = { createMods, readManifest, parseBundle, unzip, zip, safeRel, PARTS, PART_NAMES, ModError };
