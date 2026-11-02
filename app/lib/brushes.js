// فُرَش الرسم: يضيفها صاحب البرنامج من الإعدادات (← الخطوط)، فتصير أشكالاً لأقلام الرَّحل.
// المتصفح يقرأ ملف الفرشاة (shared/brush-import.js) ويرسل أشكالها صور PNG (حبرٌ في قناة الشفافية)، وتُحفظ هنا.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, readJson, updateJson } from './store.js';

export const BRUSH_DIR = path.join(DATA_DIR, 'brushes');
fs.mkdirSync(BRUSH_DIR, { recursive: true, mode: 0o700 });
const INDEX = 'brushes.json';
const MAX_SETS = 80;
const MAX_TIPS = 400;
const MAX_TIP_BYTES = 800 * 1024;
const MAX_SET_BYTES = 60 * 1024 * 1024;
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const list = () => {
  const l = readJson(INDEX, []);
  return Array.isArray(l) ? l : [];
};

/** ما يُعرض (للقارئ واللوحة): المجموعات وأشكالها بروابطها */
export function listBrushes() {
  return list().map((s) => ({
    id: s.id,
    name: s.name,
    file: s.file,
    format: s.format,
    added: s.added,
    tips: s.tips.map((t) => ({ n: t.n, name: t.name, w: t.w, h: t.h, sp: t.sp, ...(t.ang ? { ang: t.ang } : {}), url: `/brushes/${s.id}/${t.n}.png?v=${s.v || 1}` })),
  }));
}

/** مجموعة فُرَش جديدة: { name, file, format, tips:[{ name, w, h, sp, ang?, png:'data:image/png;base64,…' }] } */
export async function addBrushSet(b) {
  if (!b || !Array.isArray(b.tips) || !b.tips.length) throw httpErr(400, 'لا أشكال في هذه الفرشاة');
  if (b.tips.length > MAX_TIPS) throw httpErr(400, `الأشكال كثيرة: ${MAX_TIPS} على الأكثر في المجموعة`);
  if (list().length >= MAX_SETS) throw httpErr(400, `مجموعات الفُرَش كثيرة: ${MAX_SETS} على الأكثر — احذف ما لا تحتاج`);
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(BRUSH_DIR, id);
  const tips = [];
  let total = 0;
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const [n, t] of b.tips.entries()) {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(t.png || ''));
      if (!m) throw httpErr(400, 'شكلٌ غير صالح');
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > MAX_TIP_BYTES) throw httpErr(400, 'شكلٌ كبير جداً');
      if (buf.readUInt32BE(0) !== 0x89504e47) throw httpErr(400, 'شكلٌ غير صالح');
      total += buf.length;
      if (total > MAX_SET_BYTES) throw httpErr(400, 'المجموعة كبيرة جداً');
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (!w || !h || w > 1024 || h > 1024) throw httpErr(400, 'مقاس الشكل غير صالح');
      fs.writeFileSync(path.join(dir, `${n}.png`), buf);
      const sp = Number.isFinite(+t.sp) ? Math.min(5, Math.max(0.01, +t.sp)) : 0.25;
      const ang = Number.isFinite(+t.ang) ? Math.round(+t.ang) % 360 : 0;
      tips.push({ n, name: clean(t.name, 80) || `شكل ${n + 1}`, w, h, sp: Math.round(sp * 1000) / 1000, ...(ang ? { ang } : {}) });
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const rec = { id, name: clean(b.name, 80) || clean(b.file, 80) || 'فُرَش', file: clean(b.file, 160), format: clean(b.format, 60), added: new Date().toISOString(), v: 1, tips };
  await updateJson(INDEX, [], (l) => [...(Array.isArray(l) ? l : []), rec]);
  return listBrushes().find((s) => s.id === id);
}
/** تسمية المجموعة، أو أشكالها، أو حذف أشكالٍ منها */
export async function updateBrushSet(id, b) {
  let found = null;
  await updateJson(INDEX, [], (l) =>
    (Array.isArray(l) ? l : []).map((s) => {
      if (s.id !== id) return s;
      found = { ...s };
      if (typeof b.name === 'string' && clean(b.name, 80)) found.name = clean(b.name, 80);
      if (b.tipNames && typeof b.tipNames === 'object') for (const t of found.tips) if (typeof b.tipNames[t.n] === 'string' && clean(b.tipNames[t.n], 80)) t.name = clean(b.tipNames[t.n], 80);
      if (Array.isArray(b.remove) && b.remove.length) {
        const rm = new Set(b.remove.map(Number));
        for (const t of found.tips) if (rm.has(t.n)) fs.rmSync(path.join(BRUSH_DIR, id, `${t.n}.png`), { force: true });
        found.tips = found.tips.filter((t) => !rm.has(t.n));
      }
      return found;
    }),
  );
  if (!found) throw httpErr(404, 'المجموعة غير موجودة');
  if (!found.tips.length) {
    await deleteBrushSet(id);
    return null;
  }
  return listBrushes().find((s) => s.id === id);
}
export async function deleteBrushSet(id) {
  if (!/^[a-f0-9]{12}$/.test(id)) throw httpErr(404, 'المجموعة غير موجودة');
  await updateJson(INDEX, [], (l) => (Array.isArray(l) ? l : []).filter((s) => s.id !== id));
  fs.rmSync(path.join(BRUSH_DIR, id), { recursive: true, force: true });
}
/** ‎/brushes/<id>/<n>.png‎ ← المسار، أو null */
export function brushFile(rel) {
  const m = /^([a-f0-9]{12})\/(\d{1,4})\.png$/.exec(rel);
  if (!m) return null;
  const f = path.join(BRUSH_DIR, m[1], `${m[2]}.png`);
  return fs.existsSync(f) ? f : null;
}
