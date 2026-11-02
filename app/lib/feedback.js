// صندوق الشكاوى والمقترحات: يرسلها المستخدمون، ويصنّفها المالك ويحذفها
import crypto from 'node:crypto';
import { readJson, updateJson } from './store.js';

export const TYPES = { complaint: 'شكوى', suggestion: 'اقتراح', bug: 'خلل تقني', book: 'مشكلة في كتاب', other: 'أخرى' };
export const STATUSES = { new: 'جديدة', reviewing: 'قيد المراجعة', done: 'تمت المعالجة' };
const FILE = 'feedback.json';
const MAX_ITEMS = 5000;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export const listFeedback = () => readJson(FILE, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export async function addFeedback(body) {
  const message = clean(body.message, 4000);
  if (message.length < 3) throw Object.assign(new Error('اكتب رسالتك'), { status: 400 });
  const item = {
    id: crypto.randomBytes(6).toString('hex'),
    type: TYPES[body.type] ? body.type : 'other',
    message,
    contact: clean(body.contact, 200),
    bookId: /^\d{1,8}$/.test(String(body.bookId || '')) ? +body.bookId : null,
    bookName: clean(body.bookName, 200),
    page: clean(body.page, 60), // الصفحة التي أُرسلت منها
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  await updateJson(FILE, [], (list) => [...list, item].slice(-MAX_ITEMS));
  return { id: item.id };
}

export async function updateFeedback(id, patch) {
  let found = null;
  await updateJson(FILE, [], (list) =>
    list.map((f) => {
      if (f.id !== id) return f;
      found = {
        ...f,
        ...(patch.type && TYPES[patch.type] ? { type: patch.type } : {}),
        ...(patch.status && STATUSES[patch.status] ? { status: patch.status } : {}),
        ...(patch.note !== undefined ? { note: clean(patch.note, 1000) } : {}),
      };
      return found;
    }),
  );
  if (!found) throw Object.assign(new Error('غير موجودة'), { status: 404 });
  return found;
}

export async function deleteFeedback(ids) {
  const set = new Set(ids);
  let n = 0;
  await updateJson(FILE, [], (list) => list.filter((f) => (set.has(f.id) ? (n++, false) : true)));
  return n;
}
