// صور البسملة لصفحتها في «النسخة الجاهزة للطباعة»: مكتبة يرفع إليها المالك عدة صور، ويختار المستخدم بينها.
// كل صورة قناع (PNG شفاف: الحبر معتم وما سواه شفاف) تصنعه لوحة المالك من أي صورة تُرفع، فيصح تلوينها بأي لون.
// الأولى في المكتبة هي الافتراضية. وبلا أي صورة تُكتب البسملة نصاً بخط الرقعة.
import crypto from 'node:crypto';
import { readJson, updateJson } from './store.js';

const FILE = 'basmala.json';
const MAX = 4 * 1024 * 1024;
export const MAX_BASMALAS = 12;
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const ID_RE = /^[\w-]{1,24}$/;
const valid = (d) => d && typeof d.src === 'string' && RE.test(d.src) && d.w > 0 && d.h > 0;
const cleanName = (v, d) => (typeof v === 'string' ? v.replace(/[<>{}\\"'`\u0000-\u001f]/g, '').trim().slice(0, 40) : '') || d;

/** المخزن بصيغته الحالية (مكتبة). الصيغة القديمة (صورة واحدة) تُقرأ صورةً أولى في المكتبة. */
function load() {
  const d = readJson(FILE, {});
  if (d && Array.isArray(d.items)) return d.items.filter((x) => valid(x) && ID_RE.test(String(x.id || '')));
  if (valid(d)) return [{ id: 'b1', name: 'البسملة', src: d.src, w: d.w, h: d.h, createdAt: d.updatedAt || '' }];
  return [];
}
const pub = (x) => ({ id: x.id, name: x.name || 'البسملة', src: x.src, w: x.w, h: x.h });

/** كل صور البسملة بترتيب المالك (الأولى هي الافتراضية) */
export const listBasmalas = () => load().map(pub);

/**
 * الصورة التي تُطبع: المختارة إن وُجدت، وإلا الأولى. 'text' = بلا صورة (تُكتب بخط الرقعة).
 * @returns {{id: string, name: string, src: string, w: number, h: number}|null}
 */
export function getBasmala(id) {
  if (id === 'text') return null;
  const all = load();
  const hit = (id && all.find((x) => x.id === id)) || all[0];
  return hit ? pub(hit) : null;
}

export async function addBasmala({ name, src, w, h } = {}) {
  if (typeof src !== 'string' || !RE.test(src)) throw httpErr(415, 'صورة البسملة يجب أن تكون PNG');
  if (src.length > MAX) throw httpErr(413, 'صورة البسملة أكبر من المسموح (٣ م.ب)');
  const W = Math.round(Number(w));
  const H = Math.round(Number(h));
  if (!(W >= 20 && W <= 6000 && H >= 10 && H <= 6000)) throw httpErr(400, 'مقاس الصورة غير صالح');
  const cur = load();
  if (cur.length >= MAX_BASMALAS) throw httpErr(409, `بلغت المكتبة حدها (${MAX_BASMALAS} صورة): احذف صورة ثم أضف`);
  const item = { id: 'b' + crypto.randomBytes(4).toString('hex'), name: cleanName(name, 'بسملة ' + (cur.length + 1)), src, w: W, h: H, createdAt: new Date().toISOString() };
  await updateJson(FILE, {}, () => ({ items: [...load(), item] }));
  return pub(item);
}

/** تغيير الاسم، أو جعلها الأولى (الافتراضية) */
export async function updateBasmala(id, { name, first } = {}) {
  if (!load().some((x) => x.id === id)) throw httpErr(404, 'الصورة غير موجودة');
  await updateJson(FILE, {}, () => {
    let items = load().map((x) => (x.id === id && typeof name === 'string' ? { ...x, name: cleanName(name, x.name) } : x));
    if (first === true) items = [items.find((x) => x.id === id), ...items.filter((x) => x.id !== id)];
    return { items };
  });
  return listBasmalas();
}

export async function deleteBasmala(id) {
  if (!load().some((x) => x.id === id)) throw httpErr(404, 'الصورة غير موجودة');
  await updateJson(FILE, {}, () => ({ items: load().filter((x) => x.id !== id) }));
  return listBasmalas();
}
