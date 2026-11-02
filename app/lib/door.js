// الباب الخفي للوحة التحكم: كتاب وهمي يظهر في البحث كأي كتاب.
// فتحه يكون باختيار مجلدات بعينها وقالب بعينه ثم «ابدأ الجلب والتنضيد»؛ عندها فقط يصدر الخادم تصريح دخول
// مؤقتاً (ملف تعريف ارتباط موقّع) يُظهر صفحة الدخول بكلمة السر. التركيبة لا تغادر الخادم أبداً.
import crypto from 'node:crypto';
import { SECRET, readJson, updateJson } from './store.js';
import { appendCookie } from './auth.js';
import { matchScore, normalizeArabic, toArabicDigits } from '../shared/arabic.js';
import { parseCover } from '../shared/parser.js';

export const DOOR_ID = 990417;
const FILE = 'door.json';
export const MAX_DOOR_VOLS = 100;
export const DOOR_TEMPLATES = ['matn', 'matn_sharh', 'matn_hashia', 'full', 'tafsir'];
/** الأصل: ما كان عليه الباب قبل أن يضبطه المالك (من «الحساب» في لوحته) */
export const DOOR_DEFAULT = Object.freeze({
  title: 'تذكرة النبيه إلى دار ابن فقيه',
  author: 'أبو الزبير تركي بن عبدالعزيز فقيه',
  editor: '',
  publisher: 'دار الفقهاء',
  panel: 'دار ابن فقيه', // اسم لوحة المالك (يظهر في عنوانها وترويستها وروابط الرجوع إليها)
  volumes: 22,
  // المفتاح: المجلدان ١٢ و١٤ وحدهما + قالب «متن وحاشية»
  keyVols: ['12', '14'],
  keyTemplate: 'matn_hashia',
});
// عدد صفحات كل مجلد (الأولى ثابتة كما كانت، وما زاد يُحسب من رقمه)
const PAGES = [412, 398, 455, 431, 387, 466, 402, 419, 377, 448, 425, 391, 437, 409, 462, 383, 451, 396, 428, 441, 374, 356];
const pagesOf = (n) => Array.from({ length: n }, (_, i) => PAGES[i] ?? 360 + ((i * 7919 + 131) % 110));
const httpErr = (status, message) => Object.assign(new Error(message), { status });
// الاسم الأصلي قبل تصحيحه: ما حُفظ به يتبع الأصل الجديد
const OLD_AUTHORS = ['أبو الزبير تركي عبدالعزيز فقيه'];
const text = (v, d, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : d);

function clean(d) {
  d = d && typeof d === 'object' ? d : {};
  const D = DOOR_DEFAULT;
  const volumes = Number.isInteger(d.volumes) && d.volumes >= 1 && d.volumes <= MAX_DOOR_VOLS ? d.volumes : D.volumes;
  let keyVols = [...new Set((Array.isArray(d.keyVols) ? d.keyVols : D.keyVols).map((x) => String(parseInt(x, 10))))].filter((x) => +x >= 1 && +x <= volumes).sort((a, b) => a - b);
  if (!keyVols.length) keyVols = D.keyVols.filter((x) => +x <= volumes);
  if (!keyVols.length) keyVols = ['1'];
  return {
    title: text(d.title, D.title, 120) || D.title,
    author: OLD_AUTHORS.includes(text(d.author, '', 120)) ? D.author : text(d.author, D.author, 120),
    editor: text(d.editor, D.editor, 120),
    publisher: text(d.publisher, D.publisher, 120),
    panel: text(d.panel, D.panel, 60) || D.panel,
    volumes,
    keyVols,
    keyTemplate: DOOR_TEMPLATES.includes(d.keyTemplate) ? d.keyTemplate : D.keyTemplate,
  };
}
/** إعدادات الباب (الكتاب الوهمي، واسم اللوحة، والتركيبة التي تفتحه) */
export const getDoor = () => clean(readJson(FILE, null));
/** للوحة المالك: الإعدادات وعدد صفحات كل مجلد (لرفّ المجلدات) */
export const adminDoor = () => {
  const d = getDoor();
  return { door: d, pages: pagesOf(MAX_DOOR_VOLS), max: MAX_DOOR_VOLS, defaults: DOOR_DEFAULT };
};
export async function setDoor(input) {
  const b = input && typeof input === 'object' ? input : {};
  const n = Number(b.volumes);
  if (!Number.isInteger(n) || n < 1) throw httpErr(400, 'اكتب عدد المجلدات: مجلد واحد على الأقل');
  if (n > MAX_DOOR_VOLS) throw httpErr(400, 'يا علامة عصرك وموسوعة الدنيا، اختار عدد أقل');
  if (text(b.title, '', 120).replace(/\s/g, '').length < 3) throw httpErr(400, 'اكتب اسم الكتاب الوهمي (ثلاثة أحرف فأكثر)');
  if (!text(b.panel, '', 60)) throw httpErr(400, 'اكتب اسم اللوحة');
  const keys = [...new Set((Array.isArray(b.keyVols) ? b.keyVols : []).map((x) => parseInt(x, 10)))].filter((x) => x >= 1 && x <= n);
  if (!keys.length) throw httpErr(400, 'اختر مجلداً واحداً على الأقل يفتح الباب');
  // كل المجلدات هو ما يبدأ به أي زائر: لا يصلح مفتاحاً
  if (n > 1 && keys.length === n) throw httpErr(400, 'لا تجعل المفتاح كل المجلدات: هذا ما يختاره أي زائر من أول وهلة. اختر بعضها');
  if (!DOOR_TEMPLATES.includes(b.keyTemplate)) throw httpErr(400, 'اختر القالب الذي يفتح الباب');
  const next = clean({ ...b, volumes: n, keyVols: keys.map(String) });
  await updateJson(FILE, {}, () => ({ ...next, updatedAt: new Date().toISOString() }));
  return adminDoor();
}

export const isDoor = (id) => +id === DOOR_ID;

/** هل يطابق البحث عنوان الكتاب؟ */
export function doorMatches(q) {
  const n = normalizeArabic(q).trim();
  if (n.replace(/\s/g, '').length < 3) return false;
  return matchScore(q, getDoor().title) >= 0.75;
}

export const doorResult = () => {
  const d = getDoor();
  return { id: DOOR_ID, name: d.title, author: d.author, cat: 'الأدب والرقائق', source: 'title', hits: 0 };
};

export function doorBook() {
  const d = getDoor();
  let start = 1;
  const volumes = pagesOf(d.volumes).map((pages, i) => {
    const v = { vol: String(i + 1), start, end: start + pages - 1, pages, parts: [] };
    start += pages;
    return v;
  });
  const info = [`الكتاب: ${d.title}`, `المؤلف: ${d.author}`, d.editor ? `المحقق: ${d.editor}` : '', `الناشر: ${d.publisher}`, 'الطبعة: الأولى', `عدد الأجزاء: ${toArabicDigits(d.volumes)}`].filter(Boolean).join('\n');
  const meta = { id: DOOR_ID, name: d.title, info };
  return {
    id: DOOR_ID,
    name: d.title,
    info,
    link: '',
    cover: { ...parseCover(meta, ''), author: d.author, editor: d.editor, publisher: d.publisher },
    volumes,
    totalPages: start - 1,
    book: { meta, indexes: { headings: [] } },
  };
}

export const doorEnrich = () => {
  const d = getDoor();
  return {
    source: 'algo',
    fields: { main_title: d.title, sub_title: '', book_type: 'matn', author_title: '', author_short: d.author === DOOR_DEFAULT.author ? 'تركي فقيه' : '', editor_name: d.editor },
  };
};

/** هل التركيبة صحيحة؟ */
export function doorOpens({ volumes, template }) {
  const d = getDoor();
  const v = [...new Set((Array.isArray(volumes) ? volumes : []).map((x) => String(x).trim()))].sort((a, b) => a - b);
  return template === d.keyTemplate && v.length === d.keyVols.length && v.every((x, i) => x === d.keyVols[i]);
}

/* ---------------- تصريح الدخول المؤقت ---------------- */
const GATE = 'warraq_gate';
const GATE_MIN = 15;
const sign = (payload) => crypto.createHmac('sha256', SECRET).update('gate:' + payload).digest('base64url');

export function issueGate(res) {
  const payload = `${Date.now() + GATE_MIN * 60e3}.${crypto.randomBytes(9).toString('base64url')}`;
  appendCookie(res, `${GATE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${GATE_MIN * 60}` + (process.env.WARRAQ_SECURE_COOKIE ? '; Secure' : ''));
}
export function clearGate(res) {
  appendCookie(res, `${GATE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}
export function hasGate(req) {
  const m = new RegExp(`(?:^|;\\s*)${GATE}=([^;]+)`).exec(req.headers.cookie || '');
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 3) return false;
  const payload = parts[0] + '.' + parts[1];
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(sign(payload));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && +parts[0] > Date.now();
}
