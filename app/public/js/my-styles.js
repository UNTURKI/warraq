// «أساليبي»: الأساليب التي يصنعها المستخدم (في «استوديو الأساليب» أو بالنقر في الصانع) أو يركّبها من بطاقة.
// تُحفظ في متصفحه (IndexedDB: تتسع للصور والخطوط؛ لا حساب ولا خادم)، وتظهر في صفحة الإخراج مع أساليب دار النشر.
// الأسلوب: إعدادات + إضافات (صور، CSS، قوالب، صفحات خاصة) + إعداد طباعة + خطوط. ويأتي مع كل طلب تنضيد،
// فينقّيه الخادم كما ينقّي بطاقات المالك. البرنامج (الكود) لا يدخل أسلوب مستخدم.
// وكل أسلوب يُنزَّل «بطاقة» (صورة PNG في داخلها الأسلوب) تُحفظ أو تُنقل إلى جهاز آخر، ويركّبها المالك في موقعه إن شاء.
const OLD_KEY = 'warraq.myStyles'; // الحفظ القديم (localStorage): يُنقل مرة واحدة
const PICK = 'warraq.pickStyle';
const DB = 'warraq';
const STORE = 'styles';
export const MAX_MY_STYLES = 60;
export const CARD_FORMAT = 'warraq-style';

const str = (v, max) => (typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '');
/** ما لا يخص الأسلوب من إعدادات الطلب (قالب الكتاب، خط Word…) لا يُحفظ معه */
const TRANSIENT = ['template', 'preset', 'styleId', 'docxFont', 'docxLineSpacing', 'innerCover', 'tocLevels', 'tocTitle'];
export function styleOnly(settings) {
  const s = JSON.parse(JSON.stringify(settings || {}));
  for (const k of TRANSIENT) delete s[k];
  return s;
}
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
/** هل للإضافات محتوى؟ */
export const hasExtras = (x) => !!(isObj(x) && ((x.css && String(x.css).trim()) || (x.images && Object.keys(x.images).length) || (x.templates && Object.keys(x.templates).length) || (Array.isArray(x.pages) && x.pages.length) || (x.slots && Object.keys(x.slots).length)));

function norm(x) {
  if (!isObj(x) || !/^my-[0-9a-z]{4,16}$/.test(String(x.id)) || !isObj(x.settings)) return null;
  const name = str(x.name, 60);
  if (!name) return null;
  const extras = isObj(x.extras) ? { ...x.extras, script: '' } : null;
  return {
    id: x.id,
    name,
    desc: str(x.desc, 200),
    base: /^[\w-]{1,40}$/.test(String(x.base || '')) ? String(x.base) : '',
    settings: styleOnly(x.settings),
    extras: extras && hasExtras(extras) ? extras : extras && extras.options && extras.options.blankPage === false ? extras : null,
    print: isObj(x.print) ? x.print : null,
    fonts: Array.isArray(x.fonts) ? x.fonts.filter((f) => f && typeof f.family === 'string' && typeof f.data === 'string').slice(0, 12) : [],
    updatedAt: str(x.updatedAt, 30),
    mine: true,
  };
}

/* ---------------------------------------------------------------- التخزين */
// IndexedDB (يتسع للصور والخطوط)، وإن لم يتح (متصفح قديم، تصفح خاص، بيئة اختبار) فـ localStorage
const hasIDB = () => typeof indexedDB !== 'undefined';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let r;
    try {
      r = indexedDB.open(DB, 1);
    } catch (e) {
      return rej(e);
    }
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('تعذّر الحفظ على هذا الجهاز'));
  });
};
const lsRead = () => {
  try {
    const a = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const lsWrite = (list) => localStorage.setItem(OLD_KEY, JSON.stringify(list.map(({ mine, ...x }) => x)));
let useIDB = null; // يُعرف عند أول تحميل
async function readAll() {
  if (useIDB !== false && hasIDB()) {
    try {
      let list = (await tx('readonly', (st) => st.getAll())) || [];
      useIDB = true;
      // نقل الحفظ القديم مرة واحدة
      const old = lsRead();
      if (old.length) {
        const have = new Set(list.map((x) => x.id));
        const add = old.map(norm).filter((x) => x && !have.has(x.id));
        if (add.length) await tx('readwrite', (st) => add.forEach(({ mine, ...x }) => st.put(x)));
        list = [...list, ...add];
        try {
          localStorage.removeItem(OLD_KEY);
        } catch {}
      }
      return list;
    } catch {}
  }
  useIDB = false;
  return lsRead();
}
async function writeOne(rec) {
  if (useIDB) return tx('readwrite', (st) => st.put(rec));
  const list = lsRead().filter((x) => x && x.id !== rec.id);
  lsWrite([...list, rec]);
}
async function deleteOne(id) {
  if (useIDB) return tx('readwrite', (st) => st.delete(id));
  lsWrite(lsRead().filter((x) => x && x.id !== id));
}

let cache = [];
let ready = null;
/** تحميل أساليبي (مرة عند فتح الصفحة، ومن جديد بعد تغييرٍ في صفحة أخرى: force) */
export function initMyStyles(force = false) {
  if (ready && !force) return ready;
  ready = (async () => {
    const list = await readAll();
    cache = list.map(norm).filter(Boolean).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).slice(0, MAX_MY_STYLES);
    return cache;
  })();
  return ready;
}
/** أساليبي المحمَّلة (بعد initMyStyles) */
export const loadMyStyles = () => cache.slice();
export const getMyStyle = (id) => cache.find((x) => x.id === id) || null;
export const newStyleId = () => 'my-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** حفظ أسلوب (جديد أو تعديل موجود بمعرّفه). يعيد المحفوظ. */
export async function saveMyStyle(st) {
  await initMyStyles();
  const item = norm({ ...st, id: st.id || newStyleId(), updatedAt: new Date().toISOString() });
  if (!item) throw new Error('اكتب اسم الأسلوب');
  const i = cache.findIndex((x) => x.id === item.id);
  if (i < 0 && cache.length >= MAX_MY_STYLES) throw new Error('بلغت أساليبك حدّها: احذف واحداً ثم احفظ');
  try {
    const { mine, ...rec } = item;
    await writeOne(rec);
  } catch {
    throw new Error('تعذّر الحفظ على هذا الجهاز (التخزين ممتلئ أو ممنوع). نزّل بطاقة الأسلوب لتحفظه.');
  }
  if (i >= 0) cache[i] = item;
  else cache.push(item);
  return item;
}
export async function deleteMyStyle(id) {
  await initMyStyles();
  try {
    await deleteOne(id);
  } catch {}
  cache = cache.filter((x) => x.id !== id);
}

/** الأسلوب الذي يُختار عند فتح صفحة الإخراج بعد حفظه في الصانع */
export const setPick = (id) => {
  try {
    sessionStorage.setItem(PICK, id);
  } catch {}
};
export const takePick = () => {
  try {
    const id = sessionStorage.getItem(PICK);
    sessionStorage.removeItem(PICK);
    return id || '';
  } catch {
    return '';
  }
};

/** ما يُرسل مع طلب التنضيد والمعاينة لأسلوبٍ من أساليبي (null إن كان إعدادات فقط) */
export function userStylePayload(st) {
  if (!st || !st.mine) return null;
  const extras = st.extras && hasExtras(st.extras) ? st.extras : null;
  const fonts = st.fonts && st.fonts.length ? st.fonts : null;
  const print = st.print || null;
  return extras || fonts || print ? { extras, fonts, print } : null;
}

/* ---------------------------------------------------------------- البطاقة */
/** بطاقة الأسلوب بيانات (الصيغة التي يركّبها المالك في «أساليب دور النشر» ويركّبها المستخدم في أساليبه) */
export const cardOf = (st) => ({
  format: CARD_FORMAT,
  version: 2,
  name: st.name,
  desc: st.desc || '',
  settings: styleOnly(st.settings),
  ...(st.extras && hasExtras(st.extras) ? { extras: st.extras } : {}),
  ...(st.print ? { print: st.print } : {}),
  ...(st.fonts && st.fonts.length ? { fonts: st.fonts.map(({ family, label, weight, name, data }) => ({ family, label, weight, name, data })) } : {}),
  ...(st.base ? { base: st.base } : {}),
  exportedAt: new Date().toISOString(),
});
const fileName = (name, ext) => `أسلوب ${String(name).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'جديد'}.${ext}`;
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** تنزيل البطاقة: صورة PNG مرسومة بألوان الأسلوب وفي داخلها بياناته (وإن تعذّر الرسم فملف JSON) */
export async function downloadCard(st) {
  const card = cardOf(st);
  try {
    const [{ cardPng }, { embedCard }] = await Promise.all([import('/js/style-card-art.js'), import('/shared/style-card.js')]);
    const png = await cardPng({ name: card.name, settings: card.settings, extras: card.extras });
    saveBlob(new Blob([embedCard(png, card)], { type: 'image/png' }), fileName(st.name, 'warraq.png'));
  } catch {
    saveBlob(new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' }), fileName(st.name, 'warraq.json'));
  }
}

/**
 * قراءة بطاقة من ملف: صورة PNG (في داخلها البطاقة)، أو JSON، أو بطاقة نصية (جواب ذكاء اصطناعي).
 * @returns {Promise<object>} كائن البطاقة كما هو (قبل التنقية)
 */
export async function readCardFile(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error('الملف أكبر من ٤٠ م.ب');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { extractCard } = await import('/shared/style-card.js');
  let card = extractCard(bytes);
  if (!card && bytes[0] !== 0x89 && file.size < 3 * 1024 * 1024) {
    const { parseCardText } = await import('/shared/card-text.js');
    const r = parseCardText(new TextDecoder().decode(bytes));
    if (r) card = r.card;
  }
  if (!card) throw new Error('هذا الملف ليس بطاقة أسلوب. (إن كانت صورة البطاقة فُتحت في برنامج صور وحُفظت من جديد فقد زالت بياناتها)');
  return card;
}
/**
 * تركيب بطاقة في أساليبي: يفحصها الخادم وينقّيها، ثم تُحفظ هنا أسلوباً يُعدَّل.
 * @returns {Promise<{style: object, notes: string[]}>}
 */
export async function installMyCard(card) {
  const r = await fetch('/api/styles/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'تعذّر تركيب البطاقة');
  const st = await saveMyStyle({ ...j.style, id: '' });
  return { style: st, notes: j.notes || [] };
}
/** قراءة بطاقة صغيرة نصاً (للتوافق مع الصانع القديم): { name, desc, settings, base, hasExtras } */
export function readCard(text) {
  let c;
  try {
    c = JSON.parse(text);
  } catch {
    throw new Error('الملف ليس بطاقة أسلوب (ليس نصاً بصيغتها)');
  }
  if (!c || typeof c !== 'object' || c.format !== CARD_FORMAT || !c.settings || typeof c.settings !== 'object') throw new Error('هذا الملف ليس بطاقة أسلوب للورّاق');
  const x = c.extras && typeof c.extras === 'object' ? c.extras : {};
  return { name: str(c.name, 60), desc: str(c.desc, 200), settings: c.settings, base: /^[\w-]{1,40}$/.test(String(c.base || '')) ? String(c.base) : '', hasExtras: hasExtras(x) || !!(x.script && String(x.script).trim()) };
}
