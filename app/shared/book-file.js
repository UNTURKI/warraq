// «كتاب ورق» (‎.waraq): الكتاب كما يفهمه البرنامج، في ملف واحد يُفتح بلا اتصال ولا مصدر.
// ملف ZIP (كملفات Word) فيه:
//   mimetype            application/x-warraq-book (أول الملف، بلا ضغط)
//   manifest.json       ما الكتاب: عنوانه ومؤلفه ومجلداته، ومن أين جاء (تراث، ملف Word، PDF)، ومتى صُنع
//   style.json          أسلوبه كاملاً (الخطوط والمقاسات والألوان والقالب)، وغلافاه الداخلي والخارجي، وصيغ الإخراج
//   volumes/<المجلد>.json  نصه كما فهمه ورّاق: قطعٌ (عنوان بمستواه، فقرة، بيت، صورة بشرحها، جدول…)، وفي الفقرة مقاطع بأنواعها
//                          (نص، متن، آية، حديث، عنوان داخل السطر، إحالة) وتنسيق ما خُصّ منها (مقاس الخط، العريض، اللون)، والحواشي
//   edits.json          ما غيّره المستخدم في «المحرِّر»: عمليات تُعاد بترتيبها على النص (shared/edits.js)
//   media/              الصور (تشير إليها القطع بـ media:اسمها)
//   thumb.jpg           صورة الغلاف الصغيرة
// كل ما يحتاجه الإخراج في الملف نفسه: فلا يُجلب الكتاب من مصدره مرة أخرى.
import { makeZip, crc32 } from './zip.js';
import { zipEntries } from './docx-import.js';

export const BOOK_FORMAT = 'warraq-book';
export const BOOK_VERSION = 2;
export const BOOK_MIME = 'application/x-warraq-book';

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');
const NODE = typeof window === 'undefined' && typeof process !== 'undefined';

/* ------------------------------------------------------------------ base64 والضغط (المتصفح و Node) */
function b64ToBytes(b64) {
  if (NODE) return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(u8) {
  if (NODE) return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
async function deflateRaw(u8) {
  if (NODE) return new Uint8Array((await import('node:zlib')).deflateRawSync(u8, { level: 6 }));
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer());
}
async function inflateRaw(u8) {
  if (NODE) return new Uint8Array((await import('node:zlib')).inflateRawSync(u8));
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}

/* ------------------------------------------------------------------ الصور: خارج النص */
const DATA_IMG = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/;
const EXT = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', 'svg+xml': 'svg' };
const MIME_OF = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
/** كل صورة (data:) في الكائن تُستبدل بـ media:اسمها، وتُجمع في media */
function pullMedia(obj, media) {
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.length < 200 || !v.startsWith('data:image/')) return v;
      const m = DATA_IMG.exec(v);
      if (!m) return v;
      const bytes = b64ToBytes(m[2]);
      const name = crc32(bytes).toString(16).padStart(8, '0') + '-' + bytes.length.toString(36) + '.' + EXT[m[1]];
      if (!media.has(name)) media.set(name, bytes);
      return 'media:' + name;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  return walk(obj);
}
function pushMedia(obj, media) {
  const walk = (v) => {
    if (typeof v === 'string') {
      if (!v.startsWith('media:')) return v;
      const name = v.slice(6);
      const bytes = media.get(name);
      if (!bytes) return '';
      const ext = name.split('.').pop();
      return `data:${MIME_OF[ext] || 'image/png'};base64,${bytesToB64(bytes)}`;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  return walk(obj);
}

const README = `كتاب ورق (‎.waraq)
هذا الملف كتابٌ كما يفهمه برنامج «ورّاق»: نصه بأنواعه (متن، شرح، آيات، أحاديث، أبيات، عناوين، حواشٍ، صور بشروحها)،
وأسلوبه، وغلافاه، وما عُدّل فيه. يُفتح بنقرتين في ورّاق، ويُخرج منه الكتاب PDF و Word بلا اتصال.
الصيغة: ZIP، وفيه manifest.json و style.json و edits.json و volumes/*.json و media/*.
`;

/** وسم الكتاب: ملف ZIP يبدأ بـ mimetype كتاب ورق */
export function isBookFile(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 60 || b[0] !== 0x50 || b[1] !== 0x4b) return false;
  return dec.decode(b.subarray(30, 30 + 8)) === 'mimetype' && dec.decode(b.subarray(38, 38 + BOOK_MIME.length)) === BOOK_MIME;
}

/**
 * كتابٌ في ملف ← Uint8Array
 * @param {{ manifest: object, style: object, volumes: Object<string, object>, edits?: {ops:Array}, thumb?: string }} book
 */
export async function packBook(book) {
  const media = new Map();
  const now = new Date().toISOString();
  const manifest = {
    format: BOOK_FORMAT,
    version: BOOK_VERSION,
    created: now,
    ...book.manifest,
    modified: now,
  };
  const files = [{ name: 'mimetype', data: BOOK_MIME, store: true }];
  const json = (name, obj) => files.push({ name, data: JSON.stringify(obj) });
  json('manifest.json', manifest);
  json('style.json', pullMedia(book.style || {}, media));
  // الصور التي أُدرجت في «المحرِّر» تُحفظ في media كغيرها
  json('edits.json', pullMedia({ v: 1, ops: book.edits && Array.isArray(book.edits.ops) ? book.edits.ops : [] }, media));
  for (const [vol, parsed] of Object.entries(book.volumes || {})) json(`volumes/${encodeURIComponent(vol)}.json`, pullMedia(parsed, media));
  for (const [name, bytes] of media) files.push({ name: 'media/' + name, data: bytes, store: true });
  if (book.thumb) {
    const m = DATA_IMG.exec(book.thumb);
    if (m) files.push({ name: 'thumb.' + EXT[m[1]], data: b64ToBytes(m[2]), store: true });
  }
  files.push({ name: 'README.txt', data: README });
  // الضغط (deflate خام): النص يصغر كثيراً، والصور مضغوطة أصلاً
  for (const f of files) {
    if (f.store) continue;
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    f.data = raw;
    if (raw.length > 256) f.deflated = await deflateRaw(raw);
  }
  return makeZip(files.map(({ name, data, deflated }) => ({ name, data, ...(deflated ? { deflated } : {}) })));
}

/** ملف كتاب ← { manifest, style, volumes, edits, thumb } */
export async function unpackBook(bytes) {
  if (!isBookFile(bytes)) throw new Error('ليس ملف كتاب من ورّاق');
  const ents = zipEntries(bytes);
  const read = async (name) => {
    const e = ents.get(name);
    if (!e) return null;
    return e.method === 8 ? inflateRaw(e.data) : e.method === 0 ? e.data : null;
  };
  const text = async (name) => {
    const b = await read(name);
    return b ? JSON.parse(dec.decode(b)) : null;
  };
  const manifest = await text('manifest.json');
  if (!manifest || manifest.format !== BOOK_FORMAT) throw new Error('ليس ملف كتاب من ورّاق');
  if ((manifest.version | 0) > BOOK_VERSION) throw new Error('هذا الكتاب من إصدار أحدث من ورّاق: حدّث البرنامج لتفتحه');
  const media = new Map();
  for (const name of ents.keys()) if (name.startsWith('media/')) media.set(name.slice(6), await read(name));
  const volumes = {};
  for (const name of ents.keys()) {
    const m = /^volumes\/(.+)\.json$/.exec(name);
    if (m) volumes[decodeURIComponent(m[1])] = pushMedia(await text(name), media);
  }
  let thumb = '';
  for (const ext of ['jpg', 'png', 'webp']) {
    const b = await read('thumb.' + ext);
    if (b) {
      thumb = `data:${MIME_OF[ext]};base64,${bytesToB64(b)}`;
      break;
    }
  }
  return {
    manifest,
    style: pushMedia((await text('style.json')) || {}, media),
    volumes,
    edits: pushMedia((await text('edits.json')) || { v: 1, ops: [] }, media),
    thumb,
  };
}
