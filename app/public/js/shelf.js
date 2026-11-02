// الخزانة الخشبية: عدد المجلدات في كل رفّ يُحسب من عرض الرفّ نفسه (لا عدد ثابت)،
// فلا يخرج كعب مجلد عن حدّ رفّه مهما عرُضت المجلدات أو ضاقت الشاشة.
// تُستعمل في صفحة الإخراج (مجلدات الكتاب) وفي لوحة المالك (الباب الخفي).

/** أقصى عرض للخزانة كلها (px)؛ وفي الشاشة الأضيق تأخذ عرضها المتاح */
export const SHELF_MAX = 1000;
const FRAME = 28 + 24; // جانبا الخزانة (١٤+١٤) وحشو الرفّ (١٢+١٢)
const GAP = 5;

/** شاشة ضيقة (الجوال): كعوب أنحف وأقصر */
export const isNarrow = (avail) => avail < 640;

/** سماكة كعب المجلد بعدد صفحاته */
export function spineWidth(pages, narrow) {
  const w = Math.max(30, Math.min(66, Math.round((pages || 0) / 8.6)));
  return narrow ? Math.max(22, Math.round(w * 0.7)) : w;
}

/**
 * توزيع الكعوب على الرفوف بالترتيب: يمتلئ الرفّ حتى لا يتسع لكعب آخر، ثم رفّ تحته.
 * @param {number[]} widths  سماكة كل كعب
 * @param {number} avail     العرض المتاح للخزانة
 * @returns {{ rows: number[][], inner: number }}  أرقام الكعوب في كل رفّ، وعرض الرفّ من الداخل
 */
export function packShelves(widths, avail) {
  const inner = Math.max(100, Math.min(SHELF_MAX, avail || SHELF_MAX) - FRAME);
  const rows = [];
  let row = [];
  let used = 0;
  widths.forEach((w0, i) => {
    const w = Math.min(w0, inner);
    if (row.length && used + GAP + w > inner) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length ? GAP : 0) + w;
    row.push(i);
  });
  if (row.length) rows.push(row);
  return { rows, inner };
}

/** يعيد الرسم كلما تغيّر عرض الحاوية (تدوير الجوال، تغيير حجم النافذة) */
export function watchWidth(el, fn) {
  if (!el || !('ResizeObserver' in window)) return;
  let last = el.clientWidth;
  let t = 0;
  new ResizeObserver(() => {
    const w = el.clientWidth;
    if (Math.abs(w - last) < 8) return;
    last = w;
    clearTimeout(t);
    t = setTimeout(fn, 60);
  }).observe(el);
}
