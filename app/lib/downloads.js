// تنزيل الموقع كبرنامج: نسختان (المستخدم، المبرمج)، يرفع المالك ملفات إصداراتهما ويحذف القديم.
// الملفات تُحفظ في data/downloads، وتُرفع وتُنزَّل تدفّقاً (stream) فلا تمر كلها بالذاكرة.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, readJson, updateJson } from './store.js';

export const DL_DIR = path.join(DATA_DIR, 'downloads');
fs.mkdirSync(DL_DIR, { recursive: true, mode: 0o700 });
const INDEX = 'downloads.json';
const httpErr = (status, message) => Object.assign(new Error(message), { status });

export const EDITIONS = {
  user: {
    title: 'نسخة المستخدم',
    desc: 'برنامج جاهز يعمل على جهازك بنقرة واحدة: تبحث عن الكتاب وتخرجه PDF و Word دون إعداد.',
    image: '/img/edition-user.svg',
  },
  dev: {
    title: 'نسخة المبرمج',
    desc: 'الشيفرة المصدرية كاملة مع الاختبارات والمراجع، لمن يريد أن يعدّل أو يستضيف الموقع بنفسه.',
    image: '/img/edition-dev.svg',
  },
};
// ما يُقبل رفعه: برامج وحزم مضغوطة. الملف يُنزَّل دائماً مرفقاً (لا يُعرض في المتصفح).
const EXTS = ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'xz', 'exe', 'msi', 'dmg', 'pkg', 'appimage', 'deb', 'rpm', 'apk', 'ipa'];
export const MAX_BYTES = Math.max(1, Number(process.env.WARRAQ_MAX_DOWNLOAD_MB || 2048)) * 1024 * 1024;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const extOf = (name) => {
  const m = /\.(tar\.(?:gz|xz)|[a-z0-9]{1,8})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};

const load = () => readJson(INDEX, []).filter((x) => x && EDITIONS[x.edition] && fs.existsSync(path.join(DL_DIR, x.file)));
const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt);

/** للمالك: كل الإصدارات لكل نسخة، الأحدث أولاً */
export function listDownloads() {
  const items = load().sort(byNewest);
  return Object.entries(EDITIONS).map(([key, e]) => ({ key, ...e, items: items.filter((x) => x.edition === key) }));
}

/** للمستخدم: أحدث إصدار لكل نسخة (وما قبله)، بلا تفاصيل داخلية */
export function publicDownloads() {
  const pub = (x) => ({ id: x.id, version: x.version, notes: x.notes, name: x.name, size: x.size, date: x.createdAt, url: '/downloads/file/' + x.id });
  return listDownloads().map((e) => ({ key: e.key, title: e.title, desc: e.desc, image: e.image, latest: e.items[0] ? pub(e.items[0]) : null, older: e.items.slice(1, 6).map(pub) }));
}

/**
 * رفع ملف إصدار: جسم الطلب هو الملف نفسه (تدفّقاً)، والبيانات في عنوان الطلب.
 * @param {import('node:http').IncomingMessage} req
 */
export async function saveUpload(req, { edition, version, notes, name }) {
  if (!EDITIONS[edition]) throw httpErr(400, 'اختر النسخة: المستخدم أو المبرمج');
  const fileName = clean(String(name || '').replace(/[\\/:*?"|]+/g, ' '), 120);
  const ext = extOf(fileName);
  if (!fileName || !EXTS.includes(ext.replace(/^tar\./, ''))) throw httpErr(415, 'الصيغ المقبولة: ' + EXTS.join('، '));
  const ver = clean(version, 30);
  if (!ver) throw httpErr(400, 'اكتب رقم الإصدار');
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BYTES) throw httpErr(413, `الملف أكبر من المسموح (${Math.round(MAX_BYTES / 1024 / 1024)} م.ب)`);

  const id = crypto.randomBytes(8).toString('hex');
  const file = id + '.' + ext;
  const tmp = path.join(DL_DIR, file + '.part');
  const hash = crypto.createHash('sha256');
  let size = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp, { mode: 0o600 });
    const fail = (e) => {
      out.destroy();
      fs.rm(tmp, { force: true }, () => reject(e));
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        req.unpipe(out);
        req.resume();
        return fail(httpErr(413, `الملف أكبر من المسموح (${Math.round(MAX_BYTES / 1024 / 1024)} م.ب)`));
      }
      hash.update(c);
    });
    req.on('aborted', () => fail(httpErr(400, 'انقطع الرفع')));
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', resolve);
    req.pipe(out);
  });
  if (!size) {
    fs.rmSync(tmp, { force: true });
    throw httpErr(400, 'الملف فارغ');
  }
  fs.renameSync(tmp, path.join(DL_DIR, file));
  const item = { id, edition, version: ver, notes: clean(notes, 500), name: fileName, file, size, sha256: hash.digest('hex'), downloads: 0, createdAt: new Date().toISOString() };
  await updateJson(INDEX, [], (list) => [...list, item]);
  return item;
}

export async function updateDownload(id, patch) {
  let found = null;
  await updateJson(INDEX, [], (list) => {
    const x = list.find((i) => i.id === id);
    if (!x) return list;
    if (patch.version !== undefined && clean(patch.version, 30)) x.version = clean(patch.version, 30);
    if (patch.notes !== undefined) x.notes = clean(patch.notes, 500);
    found = x;
    return list;
  });
  if (!found) throw httpErr(404, 'الإصدار غير موجود');
  return found;
}

export async function deleteDownload(id) {
  let file = null;
  await updateJson(INDEX, [], (list) => {
    const x = list.find((i) => i.id === id);
    if (x) file = x.file;
    return list.filter((i) => i.id !== id);
  });
  if (!file) throw httpErr(404, 'الإصدار غير موجود');
  fs.rmSync(path.join(DL_DIR, file), { force: true });
}

/** تنزيل ملف إصدار: مرفقاً دائماً، ويدعم الاستكمال (Range) للملفات الكبيرة */
export function serveDownload(req, res, id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return false;
  const x = load().find((i) => i.id === id);
  if (!x) return false;
  const full = path.join(DL_DIR, x.file);
  const size = fs.statSync(full).size;
  const headers = {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(x.name)}`,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = +m[1];
      if (m[2]) end = Math.min(+m[2], size - 1);
    } else start = Math.max(size - +m[2], 0);
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
  } else res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  // العدّاد: مرة لكل تنزيل يبدأ من أول الملف
  if (start === 0) updateJson(INDEX, [], (list) => list.map((i) => (i.id === id ? { ...i, downloads: (i.downloads || 0) + 1 } : i))).catch(() => {});
  fs.createReadStream(full, { start, end }).pipe(res);
  return true;
}
