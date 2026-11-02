// مجموعة كتب تصير مجلدات كتاب واحد (مجلد فيه ملفات Word، أو عدة ملفات يختارها المستخدم):
// يُعرف رقم كل مجلد من اسم ملفه. يعمل في المتصفح («ملف Word من جهازي») وفي Node (مجلد الكتب على الجهاز).
import { toLatinDigits, normalizeArabic } from './arabic.js';

const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'].map(normalizeArabic);
const MARK = '(?:الجزء|جزء|المجلد|مجلد|مج|ج|القسم|vol(?:ume)?|part|v)';
const clean = (s) => toLatinDigits(String(s || '')).replace(/\.(docx|pdf)$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

/** رقم المجلد من اسم الملف: «… ج٣»، «المجلد الثاني»، «02 - …»، «… (5)». والصفر = لا رقم فيه */
export function volNumberOf(name) {
  const s = clean(name);
  // بعد علامة الجزء: «ج3»، «الجزء 12»، «vol. 2»
  let m = new RegExp('(?:^|[\\s(\\[\\-–—،,.])' + MARK + '\\s*[:.\\-–—#]?\\s*(\\d{1,3})(?!\\d)', 'i').exec(s);
  if (m) return +m[1];
  // بالكلمات: «الجزء الثاني عشر» (المركّب قبل المفرد)
  const n = normalizeArabic(s);
  for (let i = ORD.length - 1; i >= 0; i--) if (new RegExp('(?:الجزء|جزء|المجلد|مجلد|القسم)\\s+' + ORD[i] + '(?:\\s|$)').test(n)) return i + 1;
  // رقم في أول الاسم أو آخره
  m = /^\(?(\d{1,3})(?!\d)/.exec(s) || /(?<!\d)(\d{1,3})\s*[)\]]?$/.exec(s);
  if (m) return +m[1];
  // رقم واحد منفرد في وسطه
  const all = s.match(/(?<!\d)\d{1,3}(?!\d)/g);
  return all && all.length === 1 ? +all[0] : 0;
}

/**
 * ترتيب ملفات المجموعة مجلداتٍ. إن كان لكل ملف رقم في اسمه ولم يتكرر رقم: فهي أرقام المجلدات (٣، ٤، ٥ تبقى كذلك).
 * وإلا رُتّبت بأسمائها ورُقّمت بالتسلسل.
 * @returns {{item: any, vol: number}[]}
 */
export function orderVolumes(items, nameOf = (x) => x.name) {
  const cmp = new Intl.Collator('ar', { numeric: true }).compare;
  const list = items.map((x) => ({ x, n: volNumberOf(nameOf(x)) }));
  const ok = list.every((e) => e.n > 0) && new Set(list.map((e) => e.n)).size === list.length;
  list.sort((a, b) => (ok ? a.n - b.n : cmp(clean(nameOf(a.x)), clean(nameOf(b.x)))));
  return list.map((e, i) => ({ item: e.x, vol: ok ? e.n : i + 1 }));
}

/** اسم المجموعة: اسم المجلد الحاوي إن عُرف، وإلا ما اشتركت فيه أسماء ملفاتها من أولها (بلا علامة الجزء) */
export function setTitle(names, folder = '') {
  const f = clean(String(folder).split(/[\\/]/).filter(Boolean).pop() || '');
  if (f) return f;
  const list = names.map(clean).filter(Boolean);
  if (!list.length) return '';
  const words = list.map((s) => s.split(' '));
  let k = 0;
  while (k < words[0].length && words.every((w) => w[k] === words[0][k])) k++;
  const common = words[0]
    .slice(0, k)
    .join(' ')
    .replace(new RegExp('[\\s(\\[\\-–—،,.]*' + MARK + '?\\s*[:.\\-–—#(\\[]*$', 'i'), '')
    .trim();
  // بلا مشترك: اسم أول ملف بلا رقمه
  return common.length >= 2 ? common : list[0].replace(new RegExp('[\\s(\\[\\-–—،,.]*' + MARK + '?\\s*[:.\\-–—#]?\\s*\\d{1,3}\\s*[)\\]]?$', 'i'), '').replace(/^\(?\d{1,3}\)?\s*[-–—.]?\s*/, '').trim() || list[0];
}
