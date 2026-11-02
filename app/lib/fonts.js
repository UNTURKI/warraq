// مكتبة الخطوط: يرفع المالك ملفات الخط (طبيعي، عريض، أو ملف واحد لكل الأوزان)
// فتصير متاحة في كل الموقع: خط الكتاب، أساليب دور النشر، واستوديو الأغلفة.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, readJson, updateJson } from './store.js';
import { FONTS, registerFonts } from '../shared/presets.js';
import { systemFonts } from './desktop.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_FONTS = path.join(ROOT, 'public', 'fonts');
const COVER_FONTS = path.join(ROOT, 'public', 'covers', 'fonts');
export const FONT_DIR = path.join(DATA_DIR, 'fonts');
fs.mkdirSync(FONT_DIR, { recursive: true, mode: 0o700 });

const INDEX = 'fonts.json';
const MAX_BYTES = 20 * 1024 * 1024;
export const WEIGHTS = { 400: 'طبيعي', 700: 'عريض (Bold)', all: 'الكل (ملف واحد لكل الأوزان)' };
const httpErr = (status, message) => Object.assign(new Error(message), { status });

/* ------------------------------------------------------------ فحص ملف الخط */
function sniff(buf) {
  if (buf.length < 12) return null;
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'wOFF') return { ext: 'woff', mime: 'font/woff', format: 'woff' };
  if (tag === 'wOF2') return { ext: 'woff2', mime: 'font/woff2', format: 'woff2' };
  if (tag === 'OTTO') return { ext: 'otf', mime: 'font/otf', format: 'opentype' };
  if (buf.readUInt32BE(0) === 0x00010000 || tag === 'true') return { ext: 'ttf', mime: 'font/ttf', format: 'truetype' };
  return null;
}

/** جداول الخط (name, OS/2, head, fvar) من TTF/OTF/WOFF. ملفات WOFF2 لا تُفك هنا. */
function tables(buf, kind) {
  const out = {};
  const want = new Set(['name', 'OS/2', 'head', 'fvar']);
  try {
    if (kind.ext === 'ttf' || kind.ext === 'otf') {
      const n = buf.readUInt16BE(4);
      for (let i = 0; i < n; i++) {
        const o = 12 + i * 16;
        const tag = buf.toString('latin1', o, o + 4);
        if (want.has(tag)) out[tag] = buf.subarray(buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 8) + buf.readUInt32BE(o + 12));
      }
    } else if (kind.ext === 'woff') {
      const n = buf.readUInt16BE(12);
      for (let i = 0; i < n; i++) {
        const o = 44 + i * 20;
        const tag = buf.toString('latin1', o, o + 4);
        if (!want.has(tag)) continue;
        const off = buf.readUInt32BE(o + 4), comp = buf.readUInt32BE(o + 8), orig = buf.readUInt32BE(o + 12);
        const raw = buf.subarray(off, off + comp);
        out[tag] = comp < orig ? zlib.inflateSync(raw) : raw;
      }
    }
  } catch {
    /* ملف غير مقروء: نكتفي بما وُجد */
  }
  return out;
}

function nameRecords(t) {
  const names = {};
  if (!t || t.length < 6) return names;
  const count = t.readUInt16BE(2);
  const base = t.readUInt16BE(4);
  const rank = (pid, lang) => (pid === 3 && lang === 0x409 ? 3 : pid === 3 ? 2 : pid === 0 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    if (o + 12 > t.length) break;
    const pid = t.readUInt16BE(o), lang = t.readUInt16BE(o + 4), id = t.readUInt16BE(o + 6), len = t.readUInt16BE(o + 8), off = t.readUInt16BE(o + 10);
    if (![1, 2, 4, 16, 17].includes(id)) continue;
    const raw = t.subarray(base + off, base + off + len);
    let s;
    if (pid === 3 || pid === 0) {
      const sw = Buffer.from(raw);
      if (sw.length % 2) continue;
      sw.swap16();
      s = sw.toString('utf16le');
    } else s = raw.toString('latin1');
    s = s.replace(/[\u0000-\u001f]/g, '').trim();
    if (!s) continue;
    const r = rank(pid, lang);
    if (!names[id] || r > names[id].r) names[id] = { s, r };
  }
  return Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.s]));
}

/** معلومات الخط من داخله: اسم العائلة، الوزن، وهل هو خط متغير */
export function inspectFont(buf) {
  const kind = sniff(buf);
  if (!kind) return null;
  const t = tables(buf, kind);
  const n = nameRecords(t.name);
  const sub = (n[17] || n[2] || '').toLowerCase();
  let weight = t['OS/2'] && t['OS/2'].length > 6 ? t['OS/2'].readUInt16BE(4) : 0;
  const macBold = t.head && t.head.length > 46 ? (t.head.readUInt16BE(44) & 1) === 1 : false;
  if (!weight) weight = macBold || /bold|black|heavy/.test(sub) ? 700 : 400;
  const variable = !!t.fvar;
  return {
    ...kind,
    family: n[16] || n[1] || '',
    subfamily: n[17] || n[2] || '',
    weight,
    variable,
    suggest: variable ? 'all' : weight >= 600 || macBold ? '700' : '400',
  };
}

/* ------------------------------------------------------------ المخزن */
const cleanName = (s) => String(s || '').replace(/["'\\<>{};\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const builtinName = (fam) => Object.keys(FONTS).some((k) => !FONTS[k].uploaded && k.toLowerCase() === fam.toLowerCase());

export function listFonts() {
  return readJson(INDEX, []).map((f) => ({
    ...f,
    files: Object.fromEntries(Object.entries(f.files || {}).filter(([, v]) => v && fs.existsSync(path.join(FONT_DIR, v.file)))),
  }));
}

/** الصيغة العامة: ما تحتاجه الواجهات (الكتاب، الأساليب، الأغلفة) */
export function publicFonts() {
  return listFonts()
    .filter((f) => Object.keys(f.files).length)
    .map((f) => ({
      id: f.id,
      family: f.family,
      label: f.label || f.family,
      docx: f.docx || f.family,
      weights: f.files.all || (f.files[400] && f.files[700]) ? [400, 700] : f.files[700] ? [700] : [400],
      files: Object.entries(f.files).map(([w, v]) => ({ weight: w, url: '/site-fonts/' + v.file, ext: v.ext, size: v.size })),
    }));
}

// خطوط ورّاق، ومعها في البرنامج خطوط الجهاز (تُعرف بأسمائها)
export const allFonts = () => {
  const own = publicFonts();
  const taken = new Set([...own.map((f) => f.family.toLowerCase()), ...Object.keys(FONTS).filter((k) => !FONTS[k].uploaded).map((k) => k.toLowerCase())]);
  return [...own, ...systemFonts().filter((f) => !taken.has(f.family.toLowerCase()))];
};
const sync = () => registerFonts(allFonts());
sync();

/**
 * إضافة ملف خط. weight: '400' (طبيعي) | '700' (عريض) | 'all' (الملف نفسه لكل الأوزان).
 * إن وُجدت العائلة أُضيف الملف إليها (أو استُبدل ملف الوزن نفسه).
 */
export async function addFontFile({ family, label, weight, data, name }) {
  const buf = Buffer.from(String(data || '').replace(/^data:[^,]*,/, ''), 'base64');
  if (!buf.length) throw httpErr(400, 'الملف فارغ');
  if (buf.length > MAX_BYTES) throw httpErr(413, 'الحد الأقصى ٢٠ ميغابايت للملف');
  const info = inspectFont(buf);
  if (!info) throw httpErr(415, 'الصيغ المقبولة: TTF وOTF وWOFF وWOFF2');
  const fam = cleanName(family) || cleanName(info.family) || cleanName(String(name || '').replace(/\.[^.]+$/, ''));
  if (!fam) throw httpErr(400, 'اكتب اسم الخط');
  if (builtinName(fam)) throw httpErr(409, `الاسم «${fam}» مستعمل لخط مضمّن في الموقع، اختر اسماً آخر`);
  const w = ['400', '700', 'all'].includes(String(weight)) ? String(weight) : info.suggest;
  const file = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24) + '.' + info.ext;
  fs.writeFileSync(path.join(FONT_DIR, file), buf, { mode: 0o600 });
  let out = null;
  let stale = [];
  await updateJson(INDEX, [], (list) => {
    let f = list.find((x) => x.family.toLowerCase() === fam.toLowerCase());
    if (!f) {
      f = { id: crypto.randomBytes(6).toString('hex'), family: fam, label: cleanName(label) || fam, docx: cleanName(info.family) || fam, files: {}, createdAt: new Date().toISOString() };
      list.push(f);
    }
    const before = Object.values(f.files).map((v) => v.file);
    // «الكل» يغني عن الملفات المفردة، والملف المفرد يلغي «الكل»
    if (w === 'all') f.files = {};
    else delete f.files.all;
    delete f.files[w];
    stale = before.filter((x) => x !== file && !Object.values(f.files).some((v) => v.file === x));
    f.files[w] = { file, ext: info.ext, format: info.format, size: buf.length, original: cleanName(name).slice(0, 80) };
    out = f;
    return list;
  });
  stale.forEach(cleanup);
  sync();
  return publicFonts().find((x) => x.id === out.id);
}

function cleanup(file) {
  if (!file) return;
  const used = readJson(INDEX, []).some((f) => Object.values(f.files || {}).some((v) => v && v.file === file));
  if (!used) fs.rmSync(path.join(FONT_DIR, file), { force: true });
}

export async function updateFont(id, patch) {
  let found = null;
  await updateJson(INDEX, [], (list) => {
    const f = list.find((x) => x.id === id);
    if (!f) return list;
    if (patch.label !== undefined) f.label = cleanName(patch.label) || f.family;
    found = f;
    return list;
  });
  if (!found) throw httpErr(404, 'الخط غير موجود');
  sync();
  return publicFonts().find((x) => x.id === id);
}

/** حذف العائلة كلها، أو ملف وزن واحد منها */
export async function deleteFont(id, weight) {
  const files = [];
  let found = false;
  await updateJson(INDEX, [], (list) => {
    const f = list.find((x) => x.id === id);
    if (!f) return list;
    found = true;
    if (weight && f.files[weight]) {
      files.push(f.files[weight].file);
      delete f.files[weight];
      if (Object.keys(f.files).length) return list;
    } else if (!weight) files.push(...Object.values(f.files).map((v) => v.file));
    return list.filter((x) => x.id !== id);
  });
  if (!found) throw httpErr(404, 'الخط غير موجود');
  files.forEach(cleanup);
  sync();
}

export function serveFont(res, name) {
  if (!/^[a-f0-9]{24}\.(ttf|otf|woff2?)$/.test(name)) return false;
  const f = path.join(FONT_DIR, name);
  if (!fs.existsSync(f)) return false;
  const ext = name.split('.').pop();
  res.writeHead(200, {
    'content-type': { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext],
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  });
  fs.createReadStream(f).pipe(res);
  return true;
}

/* ------------------------------------------------------------ @font-face */
const b64 = new Map();
const dataOf = (file) => {
  if (!b64.has(file)) b64.set(file, fs.readFileSync(file).toString('base64'));
  return b64.get(file);
};
const FMT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

/** مصادر عائلة خط بالترتيب: ما رفعه المالك ← public/fonts ← خطوط الأغلفة المضمّنة. null إن لم توجد محلياً */
function sources(fam) {
  const up = listFonts().find((f) => f.family === fam);
  if (up && Object.keys(up.files).length) {
    return Object.entries(up.files).map(([w, v]) => ({ weight: w === 'all' ? '100 900' : w, file: path.join(FONT_DIR, v.file), url: '/site-fonts/' + v.file, ext: v.ext }));
  }
  const slug = fam.replace(/\s+/g, '');
  const out = [];
  for (const [w, suf] of [[400, 'Regular'], [700, 'Bold']]) {
    for (const ext of ['woff2', 'ttf', 'otf']) {
      const f = `${slug}-${suf}.${ext}`;
      if (fs.existsSync(path.join(PUBLIC_FONTS, f))) {
        out.push({ weight: String(w), file: path.join(PUBLIC_FONTS, f), url: '/fonts/' + f, ext });
        break;
      }
    }
  }
  if (out.length) return out;
  // خطوط استوديو الأغلفة (WOFF محلية): تعمل بلا إنترنت
  const vf = path.join(COVER_FONTS, slug + '-VF.woff');
  if (fs.existsSync(vf)) return [{ weight: '100 900', file: vf, url: `/covers/fonts/${slug}-VF.woff`, ext: 'woff' }];
  for (const [w, suf] of [[400, 'Regular'], [700, 'Bold']]) {
    const f = path.join(COVER_FONTS, `${slug}-${suf}.woff`);
    if (fs.existsSync(f)) out.push({ weight: String(w), file: f, url: `/covers/fonts/${slug}-${suf}.woff`, ext: 'woff' });
  }
  return out.length ? out : null;
}

/**
 * قواعد @font-face لعائلات معيّنة.
 * inline=true: الخط مضمَّن في المستند (للتنضيد إلى PDF). false: روابط (للمعاينة في المتصفح).
 * @returns {{css: string, missing: string[]}}
 */
export function fontFaceCss(families, { inline = true } = {}) {
  let css = '';
  const missing = [];
  for (const fam of families) {
    const src = sources(fam);
    if (!src) {
      missing.push(fam);
      continue;
    }
    for (const s of src) {
      const url = inline ? `data:font/${s.ext};base64,${dataOf(s.file)}` : s.url;
      css += `@font-face{font-family:'${fam}';font-weight:${s.weight};font-style:normal;font-display:${inline ? 'block' : 'swap'};src:url(${url}) format('${FMT[s.ext]}');}\n`;
    }
  }
  return { css, missing };
}

/** ورقة أنماط لكل خطوط الموقع (خط الكتاب + ما رفعه المالك) لتُربط في أي صفحة */
export function siteFontsCss() {
  const fams = ['Adwa Assalaf', ...publicFonts().map((f) => f.family)];
  return fontFaceCss(fams, { inline: false }).css;
}

/** خطوط الموقع لاستوديو الأغلفة */
export function coverSiteFonts() {
  const list = [];
  if (sources('Adwa Assalaf')) list.push({ family: 'Adwa Assalaf', label: 'أضواء السلف (خط الكتاب)', weights: [400, 700] });
  for (const f of publicFonts()) list.push({ family: f.family, label: f.label, weights: f.weights });
  return list;
}
