// مصدر «مجلد على الجهاز»: مجلد فيه كتب المالك بصيغة Word (‎.docx). يُبحث في أسمائها، وكل ملف يُحوَّل عند طلبه
// إلى صيغة الكتاب نفسها التي يأتي بها «تراث» (shared/docx-import.js)، فيمر بالمسار كله كأي كتاب.
// لا شيء يُحفظ: فهرس الأسماء ونصوص آخر الكتب المفتوحة في الذاكرة فقط.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { importDocx, cleanWordOptions, wordOptionsKey } from '../shared/docx-import.js';
import { normalizeArabic, matchScore, lightStem, toArabicDigits } from '../shared/arabic.js';
import { orderVolumes } from '../shared/volset.js';

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const MAX_FILES = 5000;
const MAX_DEPTH = 5;
const MAX_BYTES = Number(process.env.WARRAQ_MAX_BOOK_MB || 120) * 1024 * 1024;
const SCAN_TTL = 20_000;
const inflate = (u8) => zlib.inflateRawSync(u8);

/** اسم الكتاب والمؤلف من اسم الملف: «اسم الكتاب - المؤلف.docx» */
function fromFileName(file) {
  const base = path.basename(file).replace(/\.docx$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.{2,}?)\s+[-–—]\s+(.{2,})$/.exec(base);
  return m ? { name: m[1].trim(), author: m[2].trim() } : { name: base, author: '' };
}

const scans = new Map(); // المسار ← { at, list, error }
/** ملفات ‎.docx في المجلد (وما تحته)، بمعرّف ثابت لكل ملف */
export function scanFolder(dir) {
  const root = path.resolve(String(dir || ''));
  const hit = scans.get(root);
  if (hit && Date.now() - hit.at < SCAN_TTL) return hit;
  const list = [];
  let error = '';
  const walk = (d, depth, rel) => {
    if (list.length >= MAX_FILES || depth > MAX_DEPTH) return;
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      if (!depth) error = e.code === 'ENOENT' ? 'المجلد غير موجود' : e.code === 'EACCES' ? 'لا صلاحية لقراءة المجلد' : e.code === 'ENOTDIR' ? 'المسار ليس مجلداً' : e.message;
      return;
    }
    ents.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    for (const e of ents) {
      if (list.length >= MAX_FILES) return;
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue; // مخفي، أو ملف Word المؤقت لمستند مفتوح
      const full = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(full, depth + 1, r);
      else if (e.isFile() && /\.docx$/i.test(e.name)) {
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        const meta = fromFileName(e.name);
        list.push({
          id: 'f' + crypto.createHash('sha1').update(r).digest('hex').slice(0, 11),
          file: full,
          rel: r,
          folder: rel || '',
          name: meta.name,
          author: meta.author,
          size: st.size,
          mtime: st.mtimeMs,
          norm: normalizeArabic(meta.name),
          authNorm: normalizeArabic(meta.author),
        });
      }
    }
  };
  if (!dir) error = 'اكتب مسار المجلد';
  else walk(root, 0, '');
  const res = { at: Date.now(), list, error, root };
  scans.set(root, res);
  if (scans.size > 30) scans.delete(scans.keys().next().value);
  return res;
}
/** نسيان فهرس مجلد (بعد تغيير مساره، أو لإعادة فحصه فوراً) */
export const forgetFolder = (dir) => scans.delete(path.resolve(String(dir || '')));

/** البحث في أسماء الكتب ومؤلفيها */
export function searchFolder(dir, q, limit = 60) {
  const { list } = scanFolder(dir);
  const nq = normalizeArabic(q);
  const words = nq.split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const b of list) {
    const hay = b.norm + ' ' + b.authNorm;
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
    hits.push({ id: b.id, name: b.name, author: b.author, cat: b.folder, score, source: 'title' });
  }
  hits.sort((x, y) => y.score - x.score || x.name.length - y.name.length);
  return hits.slice(0, limit);
}

/**
 * «#»: البحث عن مجلد فيه كتب (لا عن كتاب واحد). كل مجلد فرعي فيه ملفات Word مجموعةٌ تصير كتاباً واحداً،
 * وملفاتها مجلداته بأرقامها التي في أسمائها. q فارغ = كل المجموعات.
 */
export function searchFolderSets(dir, q, limit = 60) {
  const { list } = scanFolder(dir);
  const groups = new Map();
  for (const b of list) {
    if (!b.folder) continue; // ما في أصل المجلد كتب منفردة
    if (!groups.has(b.folder)) groups.set(b.folder, []);
    groups.get(b.folder).push(b);
  }
  const nq = normalizeArabic(q);
  const words = nq.split(' ').filter(Boolean);
  const hits = [];
  for (const [folder, files] of groups) {
    const meta = fromFileName(folder.split('/').pop());
    const hay = normalizeArabic(folder.replace(/\//g, ' '));
    if (!words.every((w) => hay.includes(w) || (w.replace(/^(ال|و|ب|ل)/, '').length > 2 && hay.includes(w.replace(/^(ال|و|ب|ل)/, ''))) || (lightStem(w).length >= 3 && hay.includes(lightStem(w))))) continue;
    const members = orderVolumes(files, (f) => path.basename(f.file)).slice(0, 200).map((o) => ({ id: o.item.id, vol: String(o.vol), name: o.item.name }));
    const n = members.length;
    hits.push({
      id: 'd' + crypto.createHash('sha1').update(folder).digest('hex').slice(0, 11),
      set: true,
      name: meta.name,
      author: meta.author,
      cat: n === 1 ? 'مجلد واحد' : n === 2 ? 'مجلدان' : `${toArabicDigits(n)} ${n <= 10 ? 'مجلدات' : 'مجلداً'}`,
      members,
      score: words.length ? matchScore(q, meta.name) + (normalizeArabic(meta.name) === nq ? 1 : 0) : 0,
      source: 'title',
    });
  }
  hits.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name, 'ar'));
  return hits.slice(0, limit);
}

const books = new Map(); // المفتاح ← { at, data } (آخر الكتب المفتوحة، في الذاكرة فقط)
/** كتاب من المجلد محوَّلاً إلى صيغة الكتاب (مع صفحاته) */
/** options: خيارات قراءة الملف (المتن والشرح، الغلاف، التنسيق، الفهرس) — لكل خيارات نسختها في الذاكرة */
export async function folderBook(dir, id, options) {
  const opt = cleanWordOptions(options);
  const { list, error } = scanFolder(dir);
  if (error) throw httpErr(503, error);
  const e = list.find((x) => x.id === String(id));
  if (!e) throw httpErr(404, 'الكتاب غير موجود في المجلد');
  const key = e.file + '|' + e.mtime + '|' + e.size + '|' + wordOptionsKey(opt);
  const hit = books.get(key);
  if (hit) {
    hit.at = Date.now();
    return hit.data;
  }
  if (e.size > MAX_BYTES) throw httpErr(413, 'ملف الكتاب أكبر من المسموح');
  let data;
  try {
    data = await importDocx(new Uint8Array(fs.readFileSync(e.file)), { inflate, fileName: path.basename(e.file), id: e.id, options: opt });
  } catch (err) {
    throw httpErr(err.code === 'ENOENT' ? 404 : 422, 'تعذّرت قراءة ملف الكتاب: ' + err.message);
  }
  books.set(key, { at: Date.now(), data });
  // يبقى في الذاكرة آخر اثني عشر كتاباً فقط (مجموعة مجلدات تُفتح ملفاتها تباعاً)
  while (books.size > 12) {
    let oldest = null;
    for (const [k, v] of books) if (!oldest || v.at < books.get(oldest).at) oldest = k;
    books.delete(oldest);
  }
  return data;
}
