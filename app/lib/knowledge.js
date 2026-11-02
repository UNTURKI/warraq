// «مصادر المعرفة»: ما يستعين به المساعد من خارج الكتاب، وراء «مصادر الكتب».
//   · مصادر العلم: أقسامٌ (عام، العقيدة، الحديث، التفسير، الفقه، الأخلاق والسلوك، الأدب، التاريخ، اللغة، وما يصنعه المالك)،
//     لكلٍّ مفاتيحه (أكثر من مفتاح) وذكاؤه الاصطناعي. يُبحث فيها بحسب النص (تلقائياً) أو بما يُختار، وتُرسل نتائجها
//     مع التوجيه مرقّمةً ليستند إليها المساعد ويذكر رقم مصدرها. «عام»: بلا مفاتيح، فالذكاء الاصطناعي حرٌّ في جوابه.
//   · مصادر الترجمة: مفاتيح محركات الترجمة (DeepL وGoogle وMicrosoft وLibreTranslate) تترجم بلا ذكاء اصطناعي،
//     و«سِوار» (معاجم مجمع الملك سلمان) يُعين بمقابلات المصطلحات؛ والذكاء الاصطناعي المختار يترجم أو يراجع ترجمة المحرك.
// المفاتيح تُحفظ مشفّرة (store.encrypt) ولا تخرج إلى الواجهة إلا مقنّعة. وكل اتصالٍ بهذه الخدمات من هنا وحده.
import crypto from 'node:crypto';
import { getConfig, setConfig, encrypt, decrypt } from './store.js';
import { aiChat, parseJsonLoose, preferredProvider, allProvidersBrief, SCOPES } from './ai.js';

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const newId = () => crypto.randomBytes(6).toString('hex');
const clip = (s, n) => String(s == null ? '' : s).replace(/\r/g, '').slice(0, n);
const cleanLabel = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
const AR = '٠١٢٣٤٥٦٧٨٩';
const arN = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const TIMEOUT = Number(process.env.KNOW_TIMEOUT_MS || 15000);
// عناوين الخدمات (تُغيَّر للاختبار وحده)
const DORAR = (process.env.KNOW_DORAR_BASE || 'https://dorar.net').replace(/\/+$/, '');
const SIWAR = (process.env.KNOW_SIWAR_BASE || 'https://siwar.ksaa.gov.sa').replace(/\/+$/, '');

/* ================================================================ الخدمات */
/** موسوعات الدرر السنية: مساراتها، وما يُبحث فيه منها */
export const DORAR_SERVICES = {
  hadith: { label: 'الموسوعة الحديثية', path: 'hadith' },
  tafseer: { label: 'موسوعة التفسير', path: 'tafseer' },
  aqeeda: { label: 'الموسوعة العقدية', path: 'aqeeda' },
  feqhia: { label: 'الموسوعة الفقهية', path: 'feqhia' },
  alakhlaq: { label: 'موسوعة الأخلاق والسلوك', path: 'alakhlaq' },
  aadab: { label: 'موسوعة الآداب الشرعية', path: 'aadab' },
  history: { label: 'الموسوعة التاريخية', path: 'history' },
};
export const HADITH_DEGREES = { 0: 'كل الدرجات', 1: 'حكم المحدثون عليها بالصحة', 2: 'صحّت أسانيدها', 3: 'حكم المحدثون عليها بالضعف', 4: 'ضعفت أسانيدها' };
export const TAFSEER_CATS = { 0: 'الآيات', 1: 'أسماء السور', 2: 'مقدمات السور', 3: 'المكي والمدني', 4: 'تفسير الآيات', 5: 'مقاصد السورة', 6: 'موضوعات السورة', 7: 'غريب الكلمات', 8: 'مشكل الإعراب', 9: 'التفسير الإجمالي', 10: 'التفسير التحليلي', 16: 'الفوائد التربوية', 17: 'الفوائد العلمية واللطائف', 18: 'بلاغة الآيات', 19: 'مناسبات السور' };

/** أنواع المفاتيح: لمصادر العلم (sci) أو الترجمة (trans) أو كليهما */
export const KEY_KINDS = {
  dorar: { label: 'الدرر السنية', for: ['sci'], hint: 'توكن خدمات موسوعات الدرر (يُرسل إلى بريدك بعد قبول طلب الوصول)', keyUrl: 'https://dorar.net/api-services/request', docs: 'https://dorar.net/api-services' },
  siwar: { label: 'سِوار — منصة المعاجم', for: ['sci', 'trans'], hint: 'مفتاح API من منصة سِوار (مجمع الملك سلمان العالمي للغة العربية): معانٍ ومقابلاتٌ ومرادفات للمفردات', keyUrl: 'https://siwar.ksaa.gov.sa/api-external', docs: 'https://siwar.ksaa.gov.sa/api-external' },
  deepl: { label: 'DeepL', for: ['trans'], engine: true, hint: 'يترجم النص كله بلا ذكاء اصطناعي. المفتاح المجاني ينتهي بـ ‎:fx', keyUrl: 'https://www.deepl.com/your-account/keys' },
  google: { label: 'Google Translate', for: ['trans'], engine: true, hint: 'Cloud Translation (الإصدار الثاني): مفتاح API من Google Cloud', keyUrl: 'https://console.cloud.google.com/apis/credentials' },
  microsoft: { label: 'Microsoft Translator', for: ['trans'], engine: true, region: true, hint: 'مفتاح Azure Translator ومنطقته (مثل westeurope)، إلا أن يكون عاماً', keyUrl: 'https://portal.azure.com' },
  libre: { label: 'LibreTranslate', for: ['trans'], engine: true, base: true, keyOptional: true, hint: 'خادم LibreTranslate (عامٌّ أو على جهازك): عنوانه، ومفتاحه إن طلب', keyUrl: 'https://libretranslate.com' },
  custom: { label: 'خدمة بحث مخصّصة', for: ['sci'], base: true, keyOptional: true, hint: 'أي API يُبحث فيه بعنوانٍ فيه {q} ويعيد JSON (قائمة نتائج فيها عنوانٌ ونص)' },
};
const ENGINE_KINDS = Object.keys(KEY_KINDS).filter((k) => KEY_KINDS[k].engine);

/** أقسام مصادر العلم الأصلية: اسمها، وموسوعتها في الدرر، وما يدلّ عليها في النص (للاختيار التلقائي) */
export const BUILTIN_CATS = [
  { id: 'general', name: 'عام', desc: 'بلا مصادر: الذكاء الاصطناعي حرٌّ في جوابه', free: true },
  { id: 'aqeeda', name: 'العقيدة', desc: 'التوحيد والإيمان والأسماء والصفات والفرق', dorar: 'aqeeda', words: ['التوحيد', 'الإيمان', 'الايمان', 'الأسماء والصفات', 'الصفات', 'القدر', 'الشرك', 'البدعة', 'العقيدة', 'الكفر', 'النفاق', 'الملائكة', 'اليوم الآخر', 'القبر', 'الشفاعة', 'الرؤية', 'العرش', 'الاستواء', 'الكرامات', 'الولاء', 'البراء', 'الصحابة', 'الإمامة', 'المعتزلة', 'الأشاعرة', 'الخوارج', 'المرجئة', 'الجهمية', 'الرافضة', 'التوسل', 'الأولياء', 'السحر', 'التميمة'] },
  { id: 'hadith', name: 'الحديث', desc: 'نصوص الأحاديث ورواتها ومصادرها وأحكام المحدثين عليها', dorar: 'hadith', words: ['صلى الله عليه وسلم', 'ﷺ', 'قال رسول الله', 'قال النبي', 'حديث', 'رواه', 'أخرجه', 'حدثنا', 'أخبرنا', 'عن النبي', 'رضي الله عنه', 'رضي الله عنها', 'صحيح البخاري', 'صحيح مسلم', 'السنن', 'المسند', 'إسناده', 'مرفوعا', 'موقوفا'] },
  { id: 'tafseer', name: 'التفسير', desc: 'تفسير الآيات وغريبها وإعرابها وفوائدها وبلاغتها', dorar: 'tafseer', words: ['﴿', 'قوله تعالى', 'قال تعالى', 'الآية', 'آية', 'سورة', 'التفسير', 'المفسرين', 'تفسير'] },
  { id: 'fiqh', name: 'الفقه', desc: 'الأحكام الفقهية ومسائلها وأقوال المذاهب وأدلتها', dorar: 'feqhia', words: ['حكم', 'يجوز', 'لا يجوز', 'واجب', 'يجب', 'سنة', 'مستحب', 'مكروه', 'حرام', 'مباح', 'الطهارة', 'الوضوء', 'الغسل', 'التيمم', 'الصلاة', 'الزكاة', 'الصيام', 'الصوم', 'الحج', 'العمرة', 'البيع', 'الربا', 'النكاح', 'الطلاق', 'العدة', 'الميراث', 'الوصية', 'الأيمان', 'النذور', 'الحدود', 'القصاص', 'الديات', 'الأضحية', 'الذبائح', 'المذهب', 'الجمهور', 'الحنفية', 'المالكية', 'الشافعية', 'الحنابلة', 'الإجماع'] },
  { id: 'akhlaq', name: 'الأخلاق والسلوك', desc: 'الأخلاق المحمودة والمذمومة وتزكية النفس', dorar: 'alakhlaq', words: ['الأخلاق', 'الخلق', 'الصبر', 'الحلم', 'الصدق', 'الكذب', 'الحسد', 'الكبر', 'التواضع', 'الغيبة', 'النميمة', 'الكرم', 'البخل', 'الإخلاص', 'الرياء', 'الحياء', 'الزهد', 'الورع', 'التوكل', 'الشكر', 'الأمانة', 'الغضب', 'العفو', 'الإحسان', 'القلب', 'النفس', 'التزكية'] },
  { id: 'adab', name: 'الأدب', desc: 'الآداب الشرعية: السلام والاستئذان والمجالس والطعام واللباس وغيرها', dorar: 'aadab', words: ['آداب', 'أدب', 'الآداب', 'السلام', 'الاستئذان', 'المجلس', 'المجالس', 'الطعام', 'الشراب', 'اللباس', 'العطاس', 'التثاؤب', 'النوم', 'السفر', 'الضيافة', 'الجار', 'الزيارة', 'المريض', 'الطريق', 'المسجد', 'الكلام'] },
  { id: 'history', name: 'التاريخ', desc: 'الأحداث والوقائع والغزوات والدول والوفيات بسنواتها', dorar: 'history', words: ['غزوة', 'معركة', 'وقعة', 'للهجرة', 'الهجرة', 'الخلافة', 'الخليفة', 'الدولة', 'فتح', 'وفاة', 'توفي', 'ولد', 'الأموية', 'العباسية', 'العثمانية', 'المماليك', 'الصليبيين', 'التتار', 'بويع', 'قتل'] },
  { id: 'lugha', name: 'اللغة', desc: 'معاني المفردات وجذورها ومرادفاتها من المعاجم (سِوار)', siwar: true, words: ['معنى', 'لغة', 'اللغة', 'المعجم', 'الغريب', 'غريب', 'جذر', 'مادة', 'لسان العرب', 'القاموس', 'مرادف', 'ضد', 'اشتقاق'] },
];
const BUILTIN = new Map(BUILTIN_CATS.map((c) => [c.id, c]));

/** لغات الترجمة (الرمز ← الاسم) */
export const LANGS = {
  auto: 'تلقائي',
  ar: 'العربية',
  en: 'الإنجليزية',
  fr: 'الفرنسية',
  es: 'الإسبانية',
  de: 'الألمانية',
  it: 'الإيطالية',
  pt: 'البرتغالية',
  ru: 'الروسية',
  tr: 'التركية',
  fa: 'الفارسية',
  ur: 'الأردية',
  id: 'الإندونيسية',
  ms: 'الملايوية',
  bn: 'البنغالية',
  hi: 'الهندية',
  zh: 'الصينية',
  ja: 'اليابانية',
  ko: 'الكورية',
  sw: 'السواحلية',
  ha: 'الهوسا',
  so: 'الصومالية',
  am: 'الأمهرية',
  bs: 'البوسنية',
  sq: 'الألبانية',
  az: 'الأذرية',
  uz: 'الأوزبكية',
  kk: 'الكازاخية',
  ps: 'البشتو',
  ku: 'الكردية',
  nl: 'الهولندية',
  sv: 'السويدية',
  pl: 'البولندية',
  uk: 'الأوكرانية',
  th: 'التايلاندية',
  vi: 'الفيتنامية',
  tl: 'الفلبينية',
  yo: 'اليوروبا',
};
const LANG_EN = { ar: 'Arabic', en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', tr: 'Turkish', fa: 'Persian', ur: 'Urdu', id: 'Indonesian', ms: 'Malay', bn: 'Bengali', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', sw: 'Swahili', ha: 'Hausa', so: 'Somali', am: 'Amharic', bs: 'Bosnian', sq: 'Albanian', az: 'Azerbaijani', uz: 'Uzbek', kk: 'Kazakh', ps: 'Pashto', ku: 'Kurdish', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', uk: 'Ukrainian', th: 'Thai', vi: 'Vietnamese', tl: 'Filipino', yo: 'Yoruba' };
const okLang = (l, auto = false) => (LANGS[l] && (auto || l !== 'auto') ? l : auto ? 'auto' : 'en');

/* ================================================================ الحفظ */
const DEF_SCI = { cats: [], plan: true, max: 5, auto: true };
const DEF_TRANS = { ai: '', mode: 'ai', engine: '', from: 'auto', to: 'en', keys: [], useSiwar: true, glossary: '', note: '', honor: 'keep' };

/** الأقسام كما تُعرض: الأصلية بترتيبها (وما عُدّل منها)، ثم الخاصة — والمحفوظ قد يرتّبها */
function catsOf(saved) {
  const list = Array.isArray(saved) ? saved : [];
  const byId = new Map(list.filter((x) => x && x.id).map((x) => [x.id, x]));
  const out = [];
  const order = list.map((x) => x && x.id).filter(Boolean);
  const ids = [...order, ...BUILTIN_CATS.map((c) => c.id).filter((id) => !order.includes(id))];
  for (const id of ids) {
    const s = byId.get(id) || {};
    const b = BUILTIN.get(id);
    if (!b && !s.custom) continue;
    out.push({
      id,
      name: b ? b.name : cleanLabel(s.name) || 'قسم خاص',
      desc: b ? b.desc : clip(s.desc, 200),
      builtin: !!b,
      custom: !b,
      free: !!(b && b.free),
      enabled: s.enabled !== false,
      ai: typeof s.ai === 'string' ? s.ai : '',
      keys: (Array.isArray(s.keys) ? s.keys : []).filter((k) => k && k.key).map((k) => ({ key: String(k.key), service: DORAR_SERVICES[k.service] ? k.service : '', opts: k.opts && typeof k.opts === 'object' ? k.opts : {} })),
      words: b ? b.words || [] : String(s.words || '').split(/[،,\n]+/).map((w) => w.trim()).filter(Boolean).slice(0, 60),
      wordsText: b ? '' : clip(s.words, 1200),
      dorar: b ? b.dorar || '' : DORAR_SERVICES[s.dorar] ? s.dorar : '',
      siwar: !!(b && b.siwar),
    });
  }
  return out;
}
export function getKnow() {
  const c = getConfig();
  const sci = { ...DEF_SCI, ...(c.knowSci || {}) };
  const trans = { ...DEF_TRANS, ...(c.knowTrans || {}) };
  return { keys: Array.isArray(c.knowKeys) ? c.knowKeys : [], sci: { ...sci, cats: catsOf(sci.cats) }, trans };
}
/** الأقسام كما تُحفظ (بلا ما يُعرف من الأصل) */
const storeCats = (cats) =>
  cats.map((c) => ({
    id: c.id,
    ...(c.custom ? { custom: true, name: cleanLabel(c.name) || 'قسم خاص', desc: clip(c.desc, 200), words: clip(c.wordsText ?? (c.words || []).join('، '), 1200), dorar: DORAR_SERVICES[c.dorar] ? c.dorar : '' } : {}),
    ...(c.enabled === false ? { enabled: false } : {}),
    ...(c.ai ? { ai: String(c.ai).slice(0, 80) } : {}),
    keys: (c.keys || []).map((k) => ({ key: k.key, ...(k.service ? { service: k.service } : {}), ...(k.opts && Object.keys(k.opts).length ? { opts: k.opts } : {}) })),
  }));
async function saveSci(sci) {
  await setConfig({ knowSci: { plan: !!sci.plan, max: Math.max(1, Math.min(10, sci.max | 0 || 5)), auto: sci.auto !== false, cats: storeCats(sci.cats) } });
}

/* ================================================================ المفاتيح */
const mask = (k) => (k ? (k.length > 10 ? k.slice(0, 4) : '') + '••••' + k.slice(-4) : '');
function keyOf(id) {
  const k = getKnow().keys.find((x) => x.id === id);
  if (!k) return null;
  return { ...k, key: k.keyEnc ? decrypt(k.keyEnc) : '' };
}
/** ما يُعرض من المفتاح: لا المفتاح نفسه */
function publicKey(k, know = getKnow()) {
  const key = k.keyEnc ? decrypt(k.keyEnc) : '';
  const s = kstate(k.id);
  const usedIn = know.sci.cats.filter((c) => c.keys.some((x) => x.key === k.id)).map((c) => c.name);
  if (know.trans.keys.includes(k.id) || know.trans.engine === k.id) usedIn.push('الترجمة');
  return { id: k.id, kind: k.kind, kindLabel: (KEY_KINDS[k.kind] || {}).label || k.kind, label: k.label || (KEY_KINDS[k.kind] || {}).label || k.kind, base: k.base || '', region: k.region || '', lexiconIds: k.lexiconIds || '', header: k.header || '', prefix: k.prefix ?? '', paths: k.paths || '', enabled: k.enabled !== false, keyMasked: mask(key), hasKey: !!key, engine: !!(KEY_KINDS[k.kind] || {}).engine, usedIn, state: { ...s, pausedUntil: s.pausedUntil > Date.now() ? new Date(s.pausedUntil).toISOString() : null } };
}
/** التعرّف على نوع المفتاح من شكله */
export function guessKind(key, prefer = 'sci') {
  const k = String(key || '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:fx)?$/i.test(k)) return /:fx$/i.test(k) ? 'deepl' : 'siwar';
  if (/:fx$/i.test(k)) return 'deepl';
  if (/^AIza/.test(k)) return 'google';
  if (/^[0-9a-f]{32}$/i.test(k) || /^[A-Za-z0-9]{84}$/.test(k)) return 'microsoft';
  return prefer === 'trans' ? '' : 'dorar';
}
function cleanKeyStr(raw) {
  const k = String(raw ?? '').trim().replace(/^(bearer|authorization:|apikey:?)\s+/i, '').replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
  if (k.length > 4000) throw httpErr(400, 'المفتاح طويل جداً');
  if (k && !/^[\x21-\x7e]+$/.test(k)) throw httpErr(400, 'المفتاح يحتوي أحرفاً غير صالحة (تأكد أنك نسخته كاملاً دون أحرف عربية)');
  return k;
}
function cleanUrl(raw, needQ = false) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s.replace(/\{q\}/g, 'Q__'));
  } catch {
    throw httpErr(400, 'العنوان غير صالح (مثال: https://example.com)');
  }
  if (!/^https?:$/.test(u.protocol)) throw httpErr(400, 'العنوان يجب أن يبدأ بـ http أو https');
  if (needQ && !/\{q\}/.test(s)) throw httpErr(400, 'ضع {q} في العنوان حيث تُكتب كلمات البحث، مثل: https://example.com/search?q={q}');
  return s.replace(/\/+$/, '');
}
function draftKey(b) {
  const key = cleanKeyStr(b.key);
  let kind = String(b.kind || '');
  if (!kind) kind = guessKind(key, b.for === 'trans' ? 'trans' : 'sci');
  const K = KEY_KINDS[kind];
  if (!K) throw httpErr(400, 'اختر نوع المفتاح');
  if (!key && !K.keyOptional) throw httpErr(400, 'الصق المفتاح أولاً');
  const base = K.base ? cleanUrl(b.base, kind === 'custom') : '';
  if (K.base && !base) throw httpErr(400, kind === 'custom' ? 'ضع عنوان البحث وفيه {q}' : 'ضع عنوان الخادم');
  return {
    kind,
    label: cleanLabel(b.label),
    key,
    base,
    region: K.region ? String(b.region || '').trim().replace(/[^\w-]/g, '').slice(0, 40) : '',
    lexiconIds: kind === 'siwar' ? String(b.lexiconIds || '').replace(/[^\w,\s-]/g, '').replace(/\s+/g, '').slice(0, 400) : '',
    header: kind === 'custom' ? String(b.header || '').trim().replace(/[^\w-]/g, '').slice(0, 60) : '',
    prefix: kind === 'custom' ? String(b.prefix ?? '').replace(/[\r\n]/g, '').slice(0, 30) : '',
    paths: kind === 'custom' ? String(b.paths || '').trim().slice(0, 200) : '',
  };
}
export async function addKey(b) {
  const d = draftKey(b);
  const know = getKnow();
  if (know.keys.length >= 60) throw httpErr(400, 'المفاتيح كثيرة: ٦٠ على الأكثر');
  const k = { id: newId(), kind: d.kind, label: d.label, keyEnc: d.key ? encrypt(d.key) : '', base: d.base, region: d.region, lexiconIds: d.lexiconIds, header: d.header, prefix: d.prefix, paths: d.paths, enabled: true, createdAt: new Date().toISOString() };
  await setConfig({ knowKeys: [...know.keys, k] });
  // يُربط بما طُلب: أقسام مصادر العلم (أو كل ما يوافقه منها)، أو الترجمة
  const link = Array.isArray(b.link) ? b.link.map(String) : b.link === 'auto' ? 'auto' : [];
  if (link === 'auto' || link.length) {
    const sci = getKnow().sci;
    for (const c of sci.cats) {
      if (c.free) continue;
      const fits = d.kind === 'dorar' ? !!c.dorar : d.kind === 'siwar' ? c.siwar : false;
      if ((link === 'auto' && fits) || (Array.isArray(link) && link.includes(c.id))) c.keys.push({ key: k.id, service: d.kind === 'dorar' ? c.dorar || 'hadith' : '', opts: {} });
    }
    await saveSci(sci);
  }
  if (b.for === 'trans') {
    const t = getKnow().trans;
    const keys = [...new Set([...(t.keys || []), k.id])];
    await setConfig({ knowTrans: { ...t, keys, ...(KEY_KINDS[d.kind].engine && !t.engine ? { engine: k.id } : {}) } });
  }
  return publicKey(k);
}
export async function updateKey(id, b) {
  const know = getKnow();
  const cur = know.keys.find((x) => x.id === id);
  if (!cur) throw httpErr(404, 'المفتاح غير موجود');
  const K = KEY_KINDS[cur.kind] || {};
  const q = { ...cur };
  if (b.label !== undefined) q.label = cleanLabel(b.label);
  if (typeof b.enabled === 'boolean') q.enabled = b.enabled;
  if (typeof b.key === 'string' && b.key.trim()) q.keyEnc = encrypt(cleanKeyStr(b.key));
  if (b.base !== undefined && K.base) q.base = cleanUrl(b.base, cur.kind === 'custom');
  if (b.region !== undefined && K.region) q.region = String(b.region || '').trim().replace(/[^\w-]/g, '').slice(0, 40);
  if (b.lexiconIds !== undefined && cur.kind === 'siwar') q.lexiconIds = String(b.lexiconIds || '').replace(/[^\w,\s-]/g, '').replace(/\s+/g, '').slice(0, 400);
  if (cur.kind === 'custom') {
    if (b.header !== undefined) q.header = String(b.header || '').trim().replace(/[^\w-]/g, '').slice(0, 60);
    if (b.prefix !== undefined) q.prefix = String(b.prefix ?? '').replace(/[\r\n]/g, '').slice(0, 30);
    if (b.paths !== undefined) q.paths = String(b.paths || '').trim().slice(0, 200);
  }
  await setConfig({ knowKeys: know.keys.map((x) => (x.id === id ? q : x)) });
  kreset(id);
  return publicKey(q);
}
export async function deleteKey(id) {
  const know = getKnow();
  if (!know.keys.some((x) => x.id === id)) throw httpErr(404, 'المفتاح غير موجود');
  await setConfig({ knowKeys: know.keys.filter((x) => x.id !== id) });
  const sci = getKnow().sci;
  for (const c of sci.cats) c.keys = c.keys.filter((k) => k.key !== id);
  await saveSci(sci);
  const t = getKnow().trans;
  await setConfig({ knowTrans: { ...t, keys: (t.keys || []).filter((k) => k !== id), engine: t.engine === id ? '' : t.engine } });
  kstates.delete(id);
}

/* ---------------- حالة كل مفتاح (في الذاكرة): الاستدعاءات، والإيقاف المؤقت عند تجاوز الحد ---------------- */
const kstates = new Map();
function kstate(id) {
  let s = kstates.get(id);
  if (!s) kstates.set(id, (s = { calls: 0, ok: 0, fails: 0, lastError: '', lastErrorAt: null, lastOkAt: null, pausedUntil: 0 }));
  return s;
}
const kreset = (id) => Object.assign(kstate(id), { pausedUntil: 0, lastError: '' });

/* ================================================================ الاتصال */
async function http(url, { method = 'GET', headers = {}, body, timeout = TIMEOUT, form } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const err = new Error(e.name === 'TimeoutError' || e.name === 'AbortError' ? 'انتهت المهلة دون رد' : 'تعذّر الاتصال بالخدمة');
    err.kind = 'network';
    err.detail = e.cause?.code || e.cause?.message || e.message || '';
    throw err;
  }
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const er = j && (j.error || j.errors || j);
    const code = (er && (er.code || er.error || (typeof er === 'string' ? er : ''))) || '';
    const e = new Error('HTTP ' + res.status);
    e.status = res.status;
    e.code = String(code).slice(0, 60);
    e.detail = String((er && (er.message || er.msg || er.detail)) || (j && j.message) || code || text || '').slice(0, 300);
    e.retryAfter = +res.headers.get('retry-after') || 0;
    throw e;
  }
  if (j === null) throw Object.assign(new Error('الخدمة لم تُعد JSON'), { kind: 'bad', detail: text.slice(0, 200) });
  return j;
}
/** رسالة الخطأ بالعربية (ورموز الدرر) */
function errMsg(e, kind) {
  const c = e.code || '';
  if (/token_missing|token_invalid/.test(c) || e.status === 401) return kind === 'dorar' ? 'التوكن غير صحيح أو أُلغي أو انتهت صلاحيته (401)' : 'المفتاح غير صحيح أو منتهٍ (401)';
  if (/client_disabled/.test(c)) return 'الحساب موقوف لدى الخدمة (403)';
  if (/encyclopedia_not_allowed/.test(c)) return 'هذا التوكن لا يملك صلاحية هذه الموسوعة (403)';
  if (e.status === 403) return 'المفتاح مرفوض أو لا يملك صلاحية هذه الخدمة (403)';
  if (e.status === 456) return 'نفدت حصة الترجمة لهذا المفتاح (456)';
  if (e.status === 429 || /rate_limit/.test(c)) return 'تجاوز حد الطلبات في الدقيقة (429)';
  if (e.status === 422 || e.status === 400) return 'رفضت الخدمة الطلب: معاملٌ ناقص أو خارج الحدود (' + e.status + ')';
  if (e.status === 404) return 'العنوان غير موجود (404)';
  if (e.status === 503 || /unavailable/.test(c)) return 'الخدمة متوقفة مؤقتاً (503)';
  if (e.status >= 500) return 'خطأ في خوادم الخدمة (' + e.status + ')';
  return e.message || 'خطأ غير متوقع';
}
/** استدعاءٌ بمفتاح: يُحسب، ويُوقف المفتاح دقيقةً إن تجاوز الحد */
async function withKey(k, fn) {
  const s = kstate(k.id);
  if (s.pausedUntil > Date.now()) throw Object.assign(new Error('موقوف مؤقتاً: ' + s.lastError), { skipped: true });
  s.calls++;
  try {
    const r = await fn();
    s.ok++;
    s.lastOkAt = new Date().toISOString();
    return r;
  } catch (e) {
    s.fails++;
    s.lastError = errMsg(e, k.kind);
    s.lastErrorAt = new Date().toISOString();
    if (e.status === 429) s.pausedUntil = Date.now() + Math.min(Math.max(e.retryAfter || 60, 20), 600) * 1000;
    else if (e.status === 401 || e.status === 403) s.pausedUntil = Date.now() + 5 * 60e3;
    e.message = s.lastError;
    throw e;
  }
}
/* ذاكرة نتائج البحث (نصف ساعة) */
const cache = new Map();
const CACHE_TTL = 30 * 60e3;
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.p;
  const p = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), p });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return p;
}
const bareQ = (q) =>
  String(q || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[﴿﴾«»"“”()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+\n/g, '\n').trim();

/* ---------------- الدرر السنية ---------------- */
async function dorarSearch(k, service, q, o = {}) {
  const S = DORAR_SERVICES[service] || DORAR_SERVICES.hadith;
  const p = new URLSearchParams({ q: bareQ(q), limit: String(Math.max(1, Math.min(20, o.limit | 0 || 5))), match: ['any', 'all', 'phrase'].includes(o.match) ? o.match : 'all', highlight: '0' });
  if (service === 'hadith' && +o.degree >= 1 && +o.degree <= 4) p.set('degree', String(+o.degree));
  if (service === 'tafseer') {
    if (+o.sura >= 1 && +o.sura <= 114) p.set('sura', String(+o.sura));
    if (o.category && /^[\d,]+$/.test(String(o.category))) p.set('category', String(o.category));
  }
  if (['aqeeda', 'feqhia', 'alakhlaq', 'aadab'].includes(service) && ['title', 'text', 'both'].includes(o.in)) p.set('in', o.in);
  if (service === 'history') {
    p.set('sort', ['newest', 'oldest', 'relevance'].includes(o.sort) ? o.sort : 'relevance');
    if (o.year != null && o.year !== '' && Number.isFinite(+o.year)) p.set('year', String(Math.round(+o.year)));
  }
  if (p.get('q').length < 2) return [];
  const url = `${DORAR}/api/v1/${S.path}/search?${p}`;
  const j = await cached('dorar|' + k.id + '|' + url, () => withKey(k, () => http(url, { headers: { authorization: 'Bearer ' + k.key } })));
  return (Array.isArray(j.data) ? j.data : []).map((x) => {
    if (service === 'hadith')
      return {
        title: [x.narrator ? 'الراوي: ' + x.narrator : '', x.muhaddith ? 'المحدث: ' + x.muhaddith : '', x.source ? 'المصدر: ' + x.source + (x.page_or_number ? ' (' + x.page_or_number + ')' : '') : ''].filter(Boolean).join(' · '),
        text: stripTags(x.text),
        grade: stripTags(x.grade || ''),
        url: x.url || '',
        extra: { narrator: x.narrator || '', muhaddith: x.muhaddith || '', source: x.source || '', num: x.page_or_number || '', sharh: (x.services && x.services.sharh) || '' },
      };
    if (service === 'tafseer') return { title: stripTags(x.title) + (x.category ? ' — ' + x.category : ''), text: stripTags(x.body || x.text), url: x.url || '' };
    if (service === 'history') return { title: stripTags(x.title) + (x.hijri_year != null ? ` (سنة ${x.hijri_year < 0 ? -x.hijri_year + ' قبل الهجرة' : x.hijri_year + 'هـ'}${x.gregorian_year ? ' / ' + x.gregorian_year + 'م' : ''})` : ''), text: stripTags(x.text), url: x.url || '' };
    return { title: stripTags(x.title), text: stripTags(x.text || x.body), url: x.url || '' };
  });
}

/* ---------------- سِوار: معاجم مجمع الملك سلمان ---------------- */
async function siwarRaw(k, q, what = 'search') {
  const p = new URLSearchParams({ query: bareQ(q).split(' ').slice(0, 3).join(' ') });
  if (k.lexiconIds) p.set('lexiconIds', k.lexiconIds);
  if (!p.get('query')) return [];
  const url = `${SIWAR}/api/v1/external/public/${what}?${p}`;
  const j = await cached('siwar|' + k.id + '|' + url, () => withKey(k, () => http(url, { headers: { apikey: k.key } })));
  return Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
}
async function siwarSearch(k, q, o = {}) {
  const list = await siwarRaw(k, q);
  return list.slice(0, Math.max(1, Math.min(10, o.limit | 0 || 5))).map((e) => {
    const senses = (e.senses || []).slice(0, 4);
    const defs = senses.map((s) => stripTags(s.definition)).filter(Boolean);
    const tr = senses.flatMap((s) => (s.translations || []).map((t) => `${t.word}${t.languageLabel ? ' (' + t.languageLabel + ')' : ''}`)).slice(0, 6);
    const ex = senses.flatMap((s) => (s.examples || []).map((x) => stripTags(x.word))).filter(Boolean).slice(0, 2);
    return {
      title: `${e.lemma || ''}${e.pos ? ' — ' + e.pos : ''}${e.root ? ' · الجذر: ' + e.root : ''} · ${e.lexiconName || 'سِوار'}`,
      text: [defs.map((d, i) => (defs.length > 1 ? `(${arN(i + 1)}) ` : '') + d).join(' '), ex.length ? 'شاهد: ' + ex.join(' ؛ ') : '', tr.length ? 'المقابل: ' + tr.join('، ') : ''].filter(Boolean).join('\n'),
      url: 'https://siwar.ksaa.gov.sa/',
    };
  });
}
/** مقابلات مفردةٍ بلغةٍ أخرى من معاجم سِوار ← ['word', …] */
async function siwarGloss(k, word, lang) {
  const list = await siwarRaw(k, word);
  const want = String(lang || 'en').toLowerCase();
  const name = LANGS[want] || '';
  const enName = (LANG_EN[want] || '').toLowerCase();
  const out = new Set();
  const bare = (x) => plainAr(x).replace(/^ال/, '').replace(/[ةه]$/, '');
  const w = bare(word);
  const near = (e) => e.isWordFormMatch || e.isLemmatizer || (() => {
    const l = bare(e.nonDiacriticsLemma || e.lemma || '');
    return l.length >= 2 && (w.includes(l) || l.includes(w));
  })();
  for (const e of list.filter(near).slice(0, 6))
    for (const s of e.senses || [])
      for (const t of s.translations || []) {
        const l = String(t.language || '').toLowerCase();
        const lab = String(t.languageLabel || '');
        if (l === want || l.startsWith(want + '-') || (l.length === 3 && l.startsWith(want.slice(0, 2))) || (name && lab.includes(name.replace(/^ال/, ''))) || (enName && lab.toLowerCase().includes(enName))) if (t.word) out.add(String(t.word).trim());
      }
  return [...out].slice(0, 4);
}

/* ---------------- خدمة بحث مخصّصة ---------------- */
const pick = (o, names) => {
  for (const n of names) {
    const v = n.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
    if (v != null && v !== '') return v;
  }
  return '';
};
async function customSearch(k, q, o = {}) {
  const url = k.base.replace(/\{q\}/g, encodeURIComponent(bareQ(q)));
  const headers = k.key ? { [k.header || 'authorization']: (k.header ? k.prefix || '' : k.prefix ?? 'Bearer ') + k.key } : {};
  const j = await cached('custom|' + k.id + '|' + url, () => withKey(k, () => http(url, { headers })));
  // مسار القائمة والحقول (اختياري): «data.items | title | text | url»
  const [lp, tp, xp, up] = String(k.paths || '').split('|').map((s) => s.trim());
  const arr = lp ? pick(j, [lp]) : Array.isArray(j) ? j : pick(j, ['data', 'results', 'items', 'hits', 'data.items', 'data.results', 'hits.hits']);
  return (Array.isArray(arr) ? arr : []).slice(0, Math.max(1, Math.min(10, o.limit | 0 || 5))).map((x) => {
    const s = x && x._source ? x._source : x;
    return { title: stripTags(String(tp ? pick(s, [tp]) : pick(s, ['title', 'name', 'heading', 'label']))), text: stripTags(String(xp ? pick(s, [xp]) : pick(s, ['text', 'body', 'content', 'description', 'snippet', 'summary']))).slice(0, 4000), url: String(up ? pick(s, [up]) : pick(s, ['url', 'link', 'href'])) };
  });
}

/** بحثٌ بمفتاحٍ واحد في قسم */
async function searchWith(kr, cat, q, o) {
  const k = keyOf(kr.key);
  if (!k || k.enabled === false) return [];
  const opts = { ...(kr.opts || {}), limit: o.limit };
  if (k.kind === 'dorar') return dorarSearch(k, kr.service || cat.dorar || 'hadith', q, opts);
  if (k.kind === 'siwar') return siwarSearch(k, q, opts);
  if (k.kind === 'custom') return customSearch(k, q, opts);
  return [];
}

/* ================================================================ اختيار الأقسام وكلمات البحث */
const STOP = new Set('في من على إلى الى عن مع هذا هذه ذلك تلك الذي التي الذين اللذين ما ماذا لماذا كيف متى أين هل لا لم لن إن ان أن أو ثم قد كان كانت يكون تكون هو هي هم هن أنا نحن أنت كل بعض غير بين عند حتى إذا اذا لو لكن بل أي قال قالت يقول وقال فقال وهو وهي به بها له لها منه منها فيه فيها عليه عليها إليه اليه رحمه الله تعالى رضي عنه عنها وسلم صلى والله بالله ذكر يذكر وذكر فهذا وهذا وهذه هنا هناك كذا مثل أيضا ايضا جدا تم ومن وما وفي وعن وعلى ولا فلا فإن وإن وأن لأن لان إنه انه أنه انها أنها كما مما ممن فيما عما وقد فقد لقد وكان وكانت يعني أي اي إنما انما وإنما فإنما لما إلا الا ألا حين حيث عليهم إليهم منهم لهم بهم فيهم كله كلها جميع سائر نحو'.split(' ').map((w) => w.replace(/[إأآٱ]/g, 'ا')));
const plainAr = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[إأآٱ]/g, 'ا');
const isStop = (w) => STOP.has(w) || (/^[وفبلك]/.test(w) && STOP.has(w.slice(1)));
/** كلمات النص المميزة بترتيب أهميتها (تكرارها، وطولها، وتقدّمها) */
function keywords(text, n = 4) {
  // تُعدّ الكلمة بصورتها المجرّدة (بلا تشكيل ولا همزات)، وتُعاد بصورتها في النص (بهمزاتها، بلا تشكيل)
  const words = String(text || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^(و|ف|ب|ك)(?=ال)/, ''))
    .filter((w) => w.length >= 3 && !isStop(plainAr(w)));
  const freq = new Map();
  const orig = new Map();
  words.forEach((w, i) => {
    const k = plainAr(w);
    if (!orig.has(k)) orig.set(k, w);
    freq.set(k, (freq.get(k) || 0) + 1 + Math.min(k.length, 8) / 10 + (i < 15 ? 0.4 : 0));
  });
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => orig.get(x[0]));
}
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** كم مرة وردت الكلمة كلمةً (لا بعض كلمة)، ولو سبقتها حروف العطف والجر */
function countWord(T, w) {
  const re = new RegExp(`(?:^|[^\\p{L}])[وفبكل]?${escRe(w)}(?=$|[^\\p{L}])`, 'gu');
  return (T.match(re) || []).length;
}
/** مقاطع يُبحث بها في قسم: الآيات للتفسير، ومتون الأحاديث للحديث، والمسألة للفقه، والحدث للتاريخ، والمفردة للمعاجم */
function heuristicQueries(cat, text, prompt) {
  const T = String(text || '').trim() || String(prompt || '');
  const P = plainAr(T);
  const out = [];
  const firstWords = (x, k) => bareQ(x).split(' ').filter((w) => !isStop(plainAr(w)) || k > 4).slice(0, k).join(' ');
  const dorar = cat.dorar || '';
  if (cat.id === 'tafseer' || dorar === 'tafseer') for (const m of T.matchAll(/﴿([^﴾]{6,})﴾/g)) out.push(bareQ(m[1]).split(' ').slice(0, 6).join(' '));
  if (cat.id === 'hadith' || dorar === 'hadith') {
    // متن الحديث: ما بين «» أولاً، ثم ما بعد «قال رسول الله ﷺ:» — بلا صيغ التعظيم
    const H = T.replace(/صلى الله عليه وسلم|ﷺ|عليه الصلاة والسلام|رضي الله عن(?:ه|ها|هما|هم)/g, ' ');
    for (const m of H.matchAll(/«([^»]{12,})»/g)) out.push(bareQ(m[1]).split(' ').slice(0, 7).join(' '));
    for (const m of H.matchAll(/(?:قال رسول الله|قال النبي|عن النبي|أن النبي|ان النبي|أن رسول الله|ان رسول الله)\s*(?:قال|يقول)?\s*[:：]?\s*[«"“]?([^»"”.:]{12,})/g)) out.push(bareQ(m[1]).split(' ').slice(0, 7).join(' '));
  }
  if (cat.id === 'fiqh' || dorar === 'feqhia') for (const m of P.matchAll(/(?:حكم|احكام|مسالة|باب)\s+((?:[\p{L}]+\s+){0,2}[\p{L}]{3,})/gu)) out.push(bareQ(m[0]).split(' ').slice(0, 4).join(' '));
  if (cat.id === 'history' || dorar === 'history') for (const m of P.matchAll(/(?:غزوة|غزوه|معركة|معركه|وقعة|وقعه|فتح|سقوط|خلافة|خلافه|بيعة|بيعه|وفاة|وفاه|مقتل|حصار|دولة|دوله)\s+(?:ال)?[\p{L}]{3,}/gu)) out.push(bareQ(m[0]));
  if (cat.siwar || cat.id === 'lugha') {
    // المعاجم: مفردةٌ واحدة (أطول الكلمات المميزة)
    const kw = keywords(T, 8).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
    out.push(...kw.slice(0, 2).map((w) => w.replace(/^ال/, '')));
    return [...new Set(out)].slice(0, 2);
  }
  // كلمات القسم الدالّة الواردة في النص (الصبر، الاستئذان…)
  const cue = [...new Set((cat.words || []).map(plainAr))].filter((w) => w.length >= 4 && countWord(P, w)).slice(0, 2);
  if (cue.length && !out.length && dorar !== 'hadith' && dorar !== 'tafseer') out.push(cue.join(' '));
  const kw = keywords(T, 4);
  if (kw.length) out.push(kw.slice(0, 3).join(' '));
  return [...new Set(out.map((q) => q.trim()).filter((q) => q.length >= 2))].slice(0, 2);
}
/** الأقسام التي يدلّ عليها النص (بلا ذكاء اصطناعي) */
function heuristicCats(cats, text) {
  const T = plainAr(text);
  const score = [];
  for (const c of cats) {
    if (c.free || !c.words.length) continue;
    let sc = 0;
    for (const w of c.words) {
      const pw = plainAr(w).trim();
      if (pw.length < 2) continue;
      const n = /\s/.test(pw) || pw.length <= 1 ? T.split(pw).length - 1 : countWord(T, pw);
      if (n) sc += Math.min(3, n) * (pw.length > 4 ? 1.4 : 1);
    }
    if (c.id === 'tafseer' && /﴿/.test(text)) sc += 4;
    if (c.id === 'hadith' && /(صلى الله عليه وسلم|ﷺ)/.test(text)) sc += 4;
    if (c.id === 'history' && /[\d٠-٩]{1,4}\s*(?:هـ|ه\b|للهجرة)/.test(text)) sc += 3;
    if (sc >= 2) score.push([c, sc]);
  }
  return score.sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
}
const PLAN_SYSTEM = [
  'أنت مخطِّط بحثٍ لمساعدٍ في كتب التراث الإسلامي. يصلك نصٌّ وسؤالٌ عنه، وقائمةُ أقسامٍ لكلٍّ منها مصادرُ يُبحث فيها بكلمات (بحثٌ نصيٌّ في موسوعات كالدرر السنية).',
  'اختر من القائمة وحدها ما يُفيد البحثُ فيه للجواب (ثلاثة أقسام على الأكثر، وقد لا يُفيد شيء)، واكتب لكلٍّ كلماتِ بحثٍ (واحدةً أو اثنتين):',
  '- كلمات البحث: من ٢ إلى ٦ كلمات عربية مميزة بلا تشكيل، منقولةٌ من النص ما أمكن: مطلع متن الحديث (لا اسم الراوي)، أو مقطعٌ من الآية، أو اسم المسألة الفقهية («حكم مس المصحف للمحدث»)، أو المصطلح، أو الحدث وسنته.',
  '- لا تبحث بكلمات عامة («حكم»، «حديث») وحدها.',
  'أعد JSON وحده: {"cats":["id"],"queries":{"id":["…"]}}',
].join('\n');
/** الأقسام وكلمات البحث: بالذكاء الاصطناعي (إن فُعّل) وإلا بالقواعد */
async function plan({ cats, text, prompt, only }) {
  const usable = cats.filter((c) => !c.free && c.enabled && c.keys.length && (!only || only.includes(c.id)));
  if (!usable.length) return { cats: [], queries: {}, how: 'none' };
  const know = getKnow();
  if (know.sci.plan) {
    try {
      const list = usable.map((c) => `- ${c.id}: ${c.name} — ${c.desc}`).join('\n');
      const r = await aiChat('editor', {
        system: PLAN_SYSTEM,
        user: `[الأقسام]\n${list}\n\n[السؤال]\n${clip(prompt, 800)}\n\n[النص]\n${clip(text, 3500)}${only ? '\n\n(اختار المستخدم هذه الأقسام: اكتب لكلٍّ منها كلمات بحث)' : ''}`,
        json: true,
        max: 500,
        temperature: 0,
        timeout: 25000,
        tag: 'تخطيط البحث',
        prefer: (know.sci.cats.find((c) => c.id === 'general') || {}).ai || undefined,
      });
      const d = r.data || {};
      const ids = (Array.isArray(d.cats) ? d.cats : []).map(String).filter((id) => usable.some((c) => c.id === id));
      const chosen = only ? usable : usable.filter((c) => ids.includes(c.id)).slice(0, 3);
      const queries = {};
      for (const c of chosen) {
        const qs = (Array.isArray(d.queries && d.queries[c.id]) ? d.queries[c.id] : []).map((q) => bareQ(q)).filter((q) => q.length >= 2).slice(0, 2);
        queries[c.id] = qs.length ? qs : heuristicQueries(c, text, prompt);
      }
      return { cats: chosen, queries, how: 'ai', provider: r.provider };
    } catch {}
  }
  const chosen = only ? usable : heuristicCats(usable, prompt + '\n' + text);
  const queries = {};
  for (const c of chosen) queries[c.id] = heuristicQueries(c, text, prompt);
  return { cats: chosen, queries, how: 'rules' };
}

/* ================================================================ الجمع: ما يُرسل مع التوجيه */
const SOURCE_CAP = 1100;
const CONTEXT_CAP = 14000;
/**
 * يبحث في مصادر العلم ويبني ما يُلحق بالرسالة.
 * want: { cats: ['auto'] | ['general'] | ['hadith', …], q?: كلمات بحث صريحة, text: النص, prompt: السؤال }
 * ← { block, sources:[…], used:[{id,name,n,queries}], prefer, how, errors:[…] } أو null (بلا بحث)
 */
export async function gather(want = {}) {
  const know = getKnow();
  const cats = know.sci.cats.filter((c) => c.enabled);
  let asked = Array.isArray(want.cats) ? want.cats.map(String) : [];
  if (!asked.length) asked = know.sci.auto ? ['auto'] : ['general'];
  const general = cats.find((c) => c.id === 'general');
  // «عام» وحده: بلا بحث — والذكاء الاصطناعي ذكاء قسم «عام»
  if (asked.length === 1 && asked[0] === 'general') return { block: '', sources: [], used: [], prefer: general && general.ai ? general.ai : '', how: 'general', errors: [] };
  const only = asked.includes('auto') ? null : asked.filter((id) => id !== 'general');
  const text = clip(want.text, 6000);
  const prompt = clip(want.prompt, 1200);
  let P;
  if (want.q && String(want.q).trim()) {
    const usable = cats.filter((c) => !c.free && c.keys.length && (!only || only.includes(c.id)));
    const chosen = only ? usable : heuristicCats(usable, want.q + ' ' + prompt + ' ' + text).concat(usable).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3);
    P = { cats: chosen, queries: Object.fromEntries(chosen.map((c) => [c.id, [bareQ(want.q)]])), how: 'q' };
  } else P = await plan({ cats, text, prompt, only });
  const max = know.sci.max || 5;
  const errors = [];
  const used = [];
  const all = [];
  await Promise.all(
    P.cats.map(async (c) => {
      const qs = P.queries[c.id] || [];
      const got = [];
      for (const q of qs) {
        for (const kr of c.keys) {
          try {
            let r = await searchWith(kr, c, q, { limit: max });
            // بلا نتيجة: يُجرَّب أوله (ثلاث كلمات)
            if (!r.length && q.split(' ').length > 3) r = await searchWith(kr, c, q.split(' ').slice(0, 3).join(' '), { limit: max });
            const k = keyOf(kr.key);
            for (const x of r) got.push({ ...x, cat: c.id, catName: c.name, via: (k && (k.label || KEY_KINDS[k.kind].label)) + (kr.service ? ' · ' + DORAR_SERVICES[kr.service].label : ''), q });
          } catch (e) {
            if (!e.skipped || !errors.some((x) => x.key === kr.key)) errors.push({ cat: c.name, key: kr.key, error: e.message });
          }
        }
      }
      // بلا تكرار (الرابط أو أول النص)
      const seen = new Set();
      const uniq = got.filter((x) => {
        const id = x.url || plainAr(x.text).slice(0, 80);
        if (!x.text || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      const top = uniq.slice(0, max);
      all.push(...top);
      used.push({ id: c.id, name: c.name, n: top.length, queries: qs, ai: c.ai });
    }),
  );
  // ترتيب الأقسام كما اختيرت
  const order = P.cats.map((c) => c.id);
  all.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
  used.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  // الذكاء الاصطناعي: ذكاء أول قسمٍ وُجد فيه ما يُستعان به (أو أول قسمٍ اختير)، وإلا ذكاء «عام»
  const prefer = (used.find((u) => u.n && u.ai) || used.find((u) => u.ai) || {}).ai || (general && general.ai) || '';
  if (!all.length) return { block: '', sources: [], used, prefer, how: P.how, errors };
  let size = 0;
  const lines = [];
  const sources = [];
  for (const x of all) {
    const n = sources.length + 1;
    const body = x.text.length > SOURCE_CAP ? x.text.slice(0, SOURCE_CAP) + '…' : x.text;
    const line = `[${arN(n)}] (${x.catName} · ${x.via})${x.title ? ' ' + x.title : ''}\n${body}${x.grade ? '\nخلاصة حكم المحدث: ' + x.grade : ''}${x.url ? '\n' + x.url : ''}`;
    if (size + line.length > CONTEXT_CAP && sources.length) break;
    size += line.length;
    lines.push(line);
    sources.push({ n, cat: x.cat, catName: x.catName, via: x.via, title: x.title, text: body.slice(0, 700), grade: x.grade || '', url: x.url, q: x.q });
  }
  const block = `[مصادر العلم] — نتائج البحث في ${used.filter((u) => u.n).map((u) => u.name).join('، ')} (استند إليها، واذكر رقم المصدر بين معقوفين):\n<<<\n${lines.join('\n\n')}\n>>>`;
  return { block, sources, used, prefer, how: P.how, errors };
}

/** ما يُلحق بتوجيه النظام حين تُرسل مصادر */
export function knowSystem(kind) {
  if (kind === 'fix' || kind === 'review')
    return ['مصادر العلم:', '- في آخر الرسالة «[مصادر العلم]»: نتائج بحثٍ في موسوعاتٍ موثوقة. استعن بها في التحقق من نص الآيات والأحاديث والأقوال المنقولة، ولا تغيّر ما يوافقها.'].join('\n');
  return [
    'مصادر العلم:',
    '- يصلك في آخر الرسالة «[مصادر العلم]»: نتائج بحثٍ في موسوعاتٍ موثوقة (كالدرر السنية ومعاجم سِوار)، لكلٍّ منها رقمٌ بين معقوفين.',
    '- اعتمد عليها فيما تذكره من أحاديث ودرجاتها، وتفسيرٍ، ومسائل، وأقوال، وأحداث، واذكر رقم المصدر بعد ما أخذته منه هكذا: [٢]. ولك أن تجمع: [١][٣].',
    '- درجة الحديث من «خلاصة حكم المحدث» في المصدر وحده، منسوبةً إلى قائلها (صحّحه فلان في كتابه)، ولا تحكم على حديثٍ من عندك.',
    '- ما لم تجده في المصادر فاذكره من علمك إن تيقّنته، وبعده: «(من غير المصادر المرفقة)». ولا تنسب إلى المصادر ما ليس فيها.',
    '- إن لم تتصل النتائج بالسؤال فأهملها وقل ذلك في سطر. ولا تنسخها كاملة: انقل موضع الشاهد ولخّص.',
  ].join('\n');
}

/* ================================================================ الترجمة */
/** رمز اللغة كما يفهمه كل محرك */
function engLang(kind, l, target) {
  if (!l || l === 'auto') return '';
  if (kind === 'deepl') {
    const u = l.toUpperCase();
    if (target && u === 'EN') return 'EN-US';
    if (target && u === 'PT') return 'PT-BR';
    return u;
  }
  if (kind === 'microsoft') return l === 'zh' ? 'zh-Hans' : l === 'ku' ? 'kmr' : l === 'tl' ? 'fil' : l;
  if (kind === 'google') return l === 'zh' ? 'zh-CN' : l;
  return l;
}
/** دفعات للمحرك: عددٌ وحروفٌ محدودة */
function chunk(items, maxN, maxChars) {
  const out = [];
  let cur = [];
  let n = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= maxN || n + it.text.length > maxChars)) out.push(cur), (cur = []), (n = 0);
    cur.push(it);
    n += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
/** ترجمة نصوصٍ بمحرك (بلا ذكاء اصطناعي) ← النصوص المترجمة بترتيبها */
async function engineTranslate(k, texts, from, to) {
  const t = engLang(k.kind, to, true);
  const s = engLang(k.kind, from, false);
  if (k.kind === 'deepl') {
    const base = /:fx$/i.test(k.key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const j = await withKey(k, () => http(`${base}/v2/translate`, { method: 'POST', headers: { authorization: 'DeepL-Auth-Key ' + k.key }, body: { text: texts, target_lang: t, ...(s ? { source_lang: s.split('-')[0] } : {}), preserve_formatting: true }, timeout: 60000 }));
    return (j.translations || []).map((x) => x.text);
  }
  if (k.kind === 'google') {
    const j = await withKey(k, () => http(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(k.key)}`, { method: 'POST', body: { q: texts, target: t, ...(s ? { source: s } : {}), format: 'text' }, timeout: 60000 }));
    return ((j.data && j.data.translations) || []).map((x) => x.translatedText);
  }
  if (k.kind === 'microsoft') {
    const q = new URLSearchParams({ 'api-version': '3.0', to: t });
    if (s) q.set('from', s);
    const j = await withKey(k, () => http(`https://api.cognitive.microsofttranslator.com/translate?${q}`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': k.key, ...(k.region ? { 'Ocp-Apim-Subscription-Region': k.region } : {}) }, body: texts.map((x) => ({ Text: x })), timeout: 60000 }));
    return (Array.isArray(j) ? j : []).map((x) => ((x.translations || [])[0] || {}).text || '');
  }
  if (k.kind === 'libre') {
    const j = await withKey(k, () => http(`${k.base}/translate`, { method: 'POST', body: { q: texts, source: s || 'auto', target: t, format: 'text', ...(k.key ? { api_key: k.key } : {}) }, timeout: 90000 }));
    const tt = j.translatedText;
    return Array.isArray(tt) ? tt.map(String) : [String(tt || '')];
  }
  throw httpErr(400, 'هذا المفتاح ليس محرك ترجمة');
}
async function engineAll(k, items, from, to) {
  const lim = k.kind === 'deepl' ? [45, 25000] : k.kind === 'google' ? [100, 25000] : k.kind === 'microsoft' ? [90, 45000] : [30, 12000];
  const out = new Map();
  for (const part of chunk(items, lim[0], lim[1])) {
    const tr = await engineTranslate(k, part.map((x) => x.text), from, to);
    part.forEach((x, i) => out.set(x.id, String(tr[i] == null ? '' : tr[i])));
  }
  return items.map((x) => ({ id: x.id, text: out.get(x.id) || '' }));
}
/** مسرد المستخدم: «المصطلح = مقابله» كلٌّ في سطر */
function parseGlossary(s) {
  return String(s || '')
    .split(/\n+/)
    .map((l) => /^(.+?)\s*(?:=|:|⇐|←|\t)\s*(.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ src: m[1].trim(), dst: m[2].trim() }))
    .filter((g) => g.src && g.dst)
    .slice(0, 400);
}
/** مسرد الدفعة: ما في النص من مسرد المستخدم، ومقابلات سِوار لأبرز مفرداتها */
async function glossaryFor(texts, from, to) {
  const t = getKnow().trans;
  const all = plainAr(texts.join('\n'));
  const mine = parseGlossary(t.glossary).filter((g) => all.includes(plainAr(g.src)));
  const out = mine.map((g) => ({ ...g, from: 'مسردك' }));
  const arSrc = (from === 'ar' || from === 'auto') && /[؀-ۿ]/.test(all) && to !== 'ar';
  const sk = t.useSiwar && arSrc ? (t.keys || []).map(keyOf).find((k) => k && k.kind === 'siwar' && k.enabled !== false) : null;
  if (sk) {
    const terms = keywords(texts.join(' '), 8).filter((w) => w.length >= 4 && !out.some((g) => plainAr(g.src) === w));
    const got = await Promise.all(terms.map((w) => siwarGloss(sk, w, to).catch(() => [])));
    terms.forEach((w, i) => got[i].length && out.push({ src: w, dst: got[i].join(' / '), from: 'سِوار' }));
  }
  return out.slice(0, 60);
}
const TRANS_SYSTEM = (from, to, honor, note) =>
  [
    `أنت مترجمٌ محترف لكتب التراث العربي والإسلامي${from && from !== 'auto' ? ` من ${LANGS[from]}` : ''} إلى ${LANGS[to]} (${LANG_EN[to] || to}).`,
    'أصولك:',
    '- الأمانة للمعنى بلا زيادةٍ ولا نقص، بعبارةٍ فصيحةٍ سليمةٍ في اللغة الهدف، ولا تشرح ولا تعلّق.',
    '- الآيات: ترجم معانيها بين علامتي الآية كما وصلت (﴿…﴾ أو ما يقابلها)، ولا تزد عليها، واتبع ترجمات معاني القرآن المعتمدة في المصطلحات.',
    '- الأحاديث والأقوال المنقولة: ترجمها بين علامتي التنصيص كما في الأصل، ويبقى اسم الراوي والمصدر.',
    '- المصطلحات الشرعية التي لا مقابل دقيقاً لها (الصلاة، الزكاة، التقوى، السنة…): بلفظها العربي منقولاً بالحروف اللاتينية ومعناه بين قوسين أول مرة، ثم بلفظها المنقول — إلا أن يكون في المسرد مقابلٌ فالتزمه.',
    honor === 'translate' ? '- صيغ التعظيم (ﷺ، رضي الله عنه، رحمه الله): بمقابلها في اللغة الهدف بين قوسين.' : '- صيغ التعظيم (ﷺ، رضي الله عنه، رحمه الله): تبقى بحروفها العربية كما هي.',
    '- الأعلام والكتب: بأسمائها المشهورة في اللغة الهدف إن وُجدت، وإلا منقولةً بالحروف.',
    '- احفظ الأرقام والأقواس والرموز وعلامات الحواشي كما هي، والبيت يبقى شطرين بينهما « … ».',
    note ? '- توجيه صاحب الكتاب (التزمه): ' + note : '',
  ]
    .filter(Boolean)
    .join('\n');
const TRANS_PROTOCOL = [
  'ستصلك فقرات، لكلٍّ منها معرّف (id)' + ', وقد يصل معها «draft»: ترجمة آلية أولى تراجعها وتصحّحها.',
  'وقد تكون الفقرة مقاطع بأنواعها (لتبقى الآية آيةً والحديث حديثاً بعد الترجمة): كل مقطعٍ عنصرٌ وحده بمعرّفه، ومعه "p" (رقم فقرته: مقاطع الفقرة الواحدة متتالية، فترجمها في سياقها جملةً متصلة) و"k" نوعه: q آية، h حديث، m متن، ht عنوانٌ داخل السطر، t نص.',
  '- ترجم كل مقطعٍ في عنصره وحده، ولا تنقل كلاماً من مقطعٍ إلى آخر ولا تدمج مقطعين، فإن احتاجت الجملة إلى تقديمٍ وتأخير فليبقَ معنى كل مقطعٍ في عنصره.',
  '- الآية (q): معناها وحده بين ﴿ ﴾. والحديث (h): متنه بين « ». ولا تزد في المقطع ما ليس منه.',
  'وما كان معه "n": 1 فهو حاشيةٌ من حواشي الكتاب (تعليقٌ في أسفل الصفحة): ترجمه كاملاً كسائر النص، بأسلوب الحواشي، ولا تحذف منه العزو ولا أرقام الصفحات والأجزاء ولا أسماء الكتب (اكتبها بحروف اللغة التي تترجم إليها كما يُكتب مثلها).',
  'وعلامات مثل ⟦1⟧ و⟦2⟧ في النص مواضعُ إحالات الحواشي: أبقِ كل علامةٍ كما هي، مرةً واحدة، بترتيبها، بعد الكلمة التي تقابل ما كانت بعده في الأصل.',
  'أعِد JSON وحده بهذا الشكل: {"items":[{"id":"المعرّف","text":"الترجمة"}]} — كل عنصرٍ وصلك، بترتيبه، ولا شيء خارج JSON.',
].join('\n');

/**
 * ترجمة فقرات. b: { items:[{id,text}], from, to, via: ai|engine|hybrid, engine?: keyId, ai?: 'scope:id', ctx: {title, author}, note }
 * ← { items:[{id,text}], via, engine?, provider?, model?, glossary:[…] }
 */
export async function translate(b) {
  const t = getKnow().trans;
  const items = (Array.isArray(b.items) ? b.items : [])
    .filter((x) => x && x.id != null && typeof x.text === 'string')
    .slice(0, 200)
    .map((x) => ({ id: String(x.id).slice(0, 40), text: clip(x.text, 12000), ...(/^(q|h|m|ht|t)$/.test(x.k || '') ? { k: x.k } : {}), ...(x.p != null ? { p: String(x.p).slice(0, 20) } : {}), ...(x.n ? { n: 1 } : {}) }));
  if (!items.length) throw httpErr(400, 'لا نص يُترجم');
  if (items.reduce((n, x) => n + x.text.length, 0) > 120000) throw httpErr(400, 'الدفعة طويلة: قسّمها');
  const from = okLang(b.from || t.from, true);
  const to = okLang(b.to || t.to);
  if (from === to) throw httpErr(400, 'لغة الترجمة هي لغة النص نفسها');
  let via = ['ai', 'engine', 'hybrid'].includes(b.via) ? b.via : t.mode || 'ai';
  const engKey = () => {
    const ids = [b.engine, t.engine, ...(t.keys || [])].filter(Boolean);
    for (const id of ids) {
      const k = keyOf(id);
      if (k && k.enabled !== false && KEY_KINDS[k.kind] && KEY_KINDS[k.kind].engine) return k;
    }
    return null;
  };
  let draft = null;
  let eng = null;
  if (via === 'engine' || via === 'hybrid') {
    eng = engKey();
    if (!eng) {
      if (via === 'engine') throw Object.assign(httpErr(409, 'لا محرك ترجمة: أضف مفتاح DeepL أو Google أو Microsoft أو LibreTranslate من الإعدادات ← مصادر المعرفة ← مصادر الترجمة'), { reason: 'no-engine' });
      via = 'ai';
    } else {
      draft = await engineAll(eng, items, from, to);
      if (via === 'engine') return { items: draft, via, engine: eng.label || KEY_KINDS[eng.kind].label, glossary: [] };
    }
  }
  const glossary = await glossaryFor(
    items.map((x) => x.text),
    from,
    to,
  ).catch(() => []);
  const system = [TRANS_SYSTEM(from, to, b.honor || t.honor, clip(b.note || t.note, 600)), 'طريقة الرد:\n' + TRANS_PROTOCOL].join('\n\n');
  const ctx = b.ctx || {};
  const user = [
    ctx.title ? `[الكتاب] «${clip(ctx.title, 200)}»${ctx.author ? ' — ' + clip(ctx.author, 120) : ''}` : '',
    glossary.length ? '[المسرد] (التزم هذه المقابلات)\n' + glossary.map((g) => `${g.src} = ${g.dst}`).join('\n') : '',
    '[الفقرات]',
    JSON.stringify(items.map((x, i) => ({ id: x.id, ...(x.p != null ? { p: x.p } : {}), ...(x.k ? { k: x.k } : {}), ...(x.n ? { n: 1 } : {}), text: x.text, ...(draft ? { draft: draft[i].text } : {}) }))),
  ]
    .filter(Boolean)
    .join('\n\n');
  const r = await aiChat('editor', { system, user, json: true, max: Math.min(16384, 1024 + Math.round(items.reduce((n, x) => n + x.text.length, 0) * 1.6)), temperature: 0.2, timeout: 180000, tag: 'ترجمة إلى ' + LANGS[to], prefer: b.ai || t.ai || undefined });
  const got = (r.data && Array.isArray(r.data.items) ? r.data.items : []).filter((x) => x && x.id != null);
  const map = new Map(got.map((x) => [String(x.id), String(x.text == null ? '' : x.text)]));
  const out = items.map((x, i) => ({ id: x.id, text: map.get(x.id) ?? (draft ? draft[i].text : '') }));
  return { items: out, via, ...(eng ? { engine: eng.label || KEY_KINDS[eng.kind].label } : {}), provider: r.provider, model: r.model, ms: r.ms, glossary };
}

/* ================================================================ الاختبار */
export async function testKey(b, saved) {
  const t0 = Date.now();
  let k;
  try {
    k = saved ? { ...saved } : { id: 'draft', ...draftKey(b) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const done = (o) => ({ ms: Date.now() - t0, ...o });
  try {
    if (k.kind === 'dorar') {
      // كل موسوعة: هل يملك التوكن صلاحيتها؟
      const rows = await Promise.all(
        Object.entries(DORAR_SERVICES).map(async ([id, S]) => {
          try {
            const j = await http(`${DORAR}/api/v1/${S.path}/search?q=${encodeURIComponent(id === 'history' ? 'الهجرة' : id === 'tafseer' ? 'الرحمن' : 'النية')}&limit=1`, { headers: { authorization: 'Bearer ' + k.key } });
            return { id, label: S.label, ok: true, n: (j.meta && j.meta.returned) ?? (j.data || []).length, sample: j.data && j.data[0] ? stripTags(j.data[0].text || j.data[0].body || j.data[0].title).slice(0, 120) : '' };
          } catch (e) {
            return { id, label: S.label, ok: false, error: errMsg(e, 'dorar') };
          }
        }),
      );
      const okN = rows.filter((r) => r.ok).length;
      return done({ ok: okN > 0, services: rows, error: okN ? '' : rows[0].error });
    }
    if (k.kind === 'siwar') {
      const lex = await http(`${SIWAR}/api/v1/external/public/lexicons`, { headers: { apikey: k.key } });
      const list = Array.isArray(lex) ? lex : lex.data || [];
      const s = await siwarRaw({ ...k, id: 'test' + t0 }, 'كتاب').catch(() => []);
      const langs = new Set(list.flatMap((x) => (x.translations || []).map((y) => y.languageCode)).filter(Boolean));
      return done({ ok: true, lexicons: list.length, sample: s[0] ? `${s[0].lemma}: ${stripTags(((s[0].senses || [])[0] || {}).definition || '').slice(0, 100)}` : '', langs: [...langs].slice(0, 12), names: list.slice(0, 8).map((x) => x.name) });
    }
    if (k.kind === 'custom') {
      const r = await customSearch({ ...k, id: 'test' + t0 }, 'الصلاة', { limit: 2 });
      return done({ ok: true, n: r.length, sample: r[0] ? (r[0].title || r[0].text).slice(0, 120) : '', note: r.length ? '' : 'أجاب بلا نتائج تُفهم: ضع مسار القائمة والحقول' });
    }
    if (k.kind === 'deepl') {
      const base = /:fx$/i.test(k.key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
      const u = await http(`${base}/v2/usage`, { headers: { authorization: 'DeepL-Auth-Key ' + k.key } });
      const tr = await engineTranslate(k, ['الحمد لله رب العالمين'], 'ar', 'en');
      return done({ ok: true, sample: tr[0], usage: u.character_limit ? `${u.character_count} / ${u.character_limit} حرف هذا الشهر` : '' });
    }
    if (ENGINE_KINDS.includes(k.kind)) {
      const tr = await engineTranslate(k, ['الحمد لله رب العالمين'], 'ar', 'en');
      return done({ ok: !!(tr[0] || '').trim(), sample: tr[0] || '', error: (tr[0] || '').trim() ? '' : 'أجاب برد فارغ' });
    }
    return done({ ok: false, error: 'نوع غير معروف' });
  } catch (e) {
    return done({ ok: false, error: errMsg(e, k.kind), detail: e.detail || '' });
  }
}

/* ================================================================ ما يعرفه المساعد */
/** موجزٌ للمساعد في المحرِّر: الأقسام الجاهزة، والترجمة */
export function knowBrief() {
  const know = getKnow();
  const ais = allProvidersBrief();
  const aiLabel = (v) => {
    const a = ais.find((x) => x.value === v);
    return a ? a.label : '';
  };
  const engines = (know.trans.keys || []).map((id) => know.keys.find((k) => k.id === id)).filter((k) => k && k.enabled !== false && KEY_KINDS[k.kind] && KEY_KINDS[k.kind].engine);
  return {
    auto: know.sci.auto !== false,
    plan: !!know.sci.plan,
    cats: know.sci.cats.filter((c) => c.enabled).map((c) => ({ id: c.id, name: c.name, desc: c.desc, free: c.free, ready: c.free || c.keys.some((kr) => {
        const k = know.keys.find((x) => x.id === kr.key);
        return !!k && k.enabled !== false;
      }), keys: c.keys.length, ai: aiLabel(c.ai) })),
    trans: {
      mode: know.trans.mode,
      from: know.trans.from,
      to: know.trans.to,
      ai: aiLabel(know.trans.ai),
      engines: engines.map((k) => ({ id: k.id, label: k.label || KEY_KINDS[k.kind].label })),
      engine: know.trans.engine,
      siwar: (know.trans.keys || []).some((id) => (know.keys.find((k) => k.id === id) || {}).kind === 'siwar'),
      glossary: parseGlossary(know.trans.glossary).length,
    },
    langs: LANGS,
  };
}

/* ================================================================ المسارات: /api/admin/know/* (للمالك) */
function adminView() {
  const know = getKnow();
  return {
    kinds: KEY_KINDS,
    services: Object.fromEntries(Object.entries(DORAR_SERVICES).map(([k, v]) => [k, v.label])),
    degrees: HADITH_DEGREES,
    tafseerCats: TAFSEER_CATS,
    langs: LANGS,
    keys: know.keys.map((k) => publicKey(k, know)),
    sci: { plan: know.sci.plan, max: know.sci.max, auto: know.sci.auto !== false, cats: know.sci.cats.map(({ words, ...c }) => ({ ...c, hasWords: words.length })) },
    trans: { ...know.trans, glossaryCount: parseGlossary(know.trans.glossary).length },
    ais: allProvidersBrief(),
    scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, v]) => [k, v.label])),
  };
}
const okAi = (v) => (!v ? '' : preferredProvider(String(v)) || /^(typeset|editor|rahl):[\w-]{1,40}$/.test(String(v)) ? String(v).slice(0, 80) : '');

export async function handleKnow(req, res, url, { json, readBody }) {
  const p = url.pathname;
  const m = req.method;
  if (!p.startsWith('/api/admin/know')) return false;
  if (p === '/api/admin/know' && m === 'GET') return json(res, 200, adminView()), true;
  if (p === '/api/admin/know/brief' && m === 'GET') return json(res, 200, knowBrief()), true;

  /* —— المفاتيح —— */
  if (p === '/api/admin/know/keys' && m === 'POST') {
    const k = await addKey(await readBody(req, 16 * 1024));
    return json(res, 201, { key: k, view: adminView() }), true;
  }
  if (p === '/api/admin/know/keys/test' && m === 'POST') return json(res, 200, await testKey(await readBody(req, 16 * 1024))), true;
  let mm = /^\/api\/admin\/know\/keys\/([a-f0-9]{12})(\/test)?$/.exec(p);
  if (mm) {
    if (mm[2] && m === 'POST') {
      const k = keyOf(mm[1]);
      if (!k) throw httpErr(404, 'المفتاح غير موجود');
      kreset(k.id);
      return json(res, 200, await testKey({}, k)), true;
    }
    if (m === 'PATCH') {
      await updateKey(mm[1], await readBody(req, 16 * 1024));
      return json(res, 200, adminView()), true;
    }
    if (m === 'DELETE') {
      await deleteKey(mm[1]);
      return json(res, 200, adminView()), true;
    }
  }

  /* —— مصادر العلم: الأقسام وإعدادها —— */
  if (p === '/api/admin/know/sci' && m === 'PUT') {
    const b = await readBody(req, 128 * 1024);
    const sci = getKnow().sci;
    if (typeof b.plan === 'boolean') sci.plan = b.plan;
    if (typeof b.auto === 'boolean') sci.auto = b.auto;
    if (b.max != null) sci.max = Math.max(1, Math.min(10, b.max | 0 || 5));
    if (Array.isArray(b.order)) {
      const pos = new Map(b.order.map((id, i) => [String(id), i]));
      sci.cats.sort((x, y) => (pos.get(x.id) ?? 1e6) - (pos.get(y.id) ?? 1e6));
    }
    if (b.cat && typeof b.cat === 'object') {
      const c = sci.cats.find((x) => x.id === String(b.cat.id));
      if (!c) throw httpErr(404, 'القسم غير موجود');
      const x = b.cat;
      if (typeof x.enabled === 'boolean') c.enabled = x.enabled;
      if (x.ai !== undefined) c.ai = okAi(x.ai);
      if (c.custom) {
        if (x.name !== undefined) c.name = cleanLabel(x.name) || c.name;
        if (x.desc !== undefined) c.desc = clip(x.desc, 200);
        if (x.words !== undefined) c.wordsText = clip(x.words, 1200);
        if (x.dorar !== undefined) c.dorar = DORAR_SERVICES[x.dorar] ? x.dorar : '';
      }
      if (Array.isArray(x.keys) && !c.free) {
        const have = new Set(getKnow().keys.map((k) => k.id));
        c.keys = x.keys
          .filter((k) => k && have.has(String(k.key)))
          .slice(0, 12)
          .map((k) => {
            const kind = (getKnow().keys.find((y) => y.id === k.key) || {}).kind;
            const o = k.opts && typeof k.opts === 'object' ? k.opts : {};
            const opts = {};
            if (['any', 'all', 'phrase'].includes(o.match)) opts.match = o.match;
            if (+o.degree >= 1 && +o.degree <= 4) opts.degree = +o.degree;
            if (['title', 'text', 'both'].includes(o.in)) opts.in = o.in;
            if (o.category && /^[\d,]{1,60}$/.test(String(o.category))) opts.category = String(o.category);
            if (['newest', 'oldest', 'relevance'].includes(o.sort)) opts.sort = o.sort;
            return { key: String(k.key), service: kind === 'dorar' ? (DORAR_SERVICES[k.service] ? k.service : c.dorar || 'hadith') : '', opts };
          });
      }
    }
    await saveSci(sci);
    return json(res, 200, adminView()), true;
  }
  if (p === '/api/admin/know/sci/cats' && m === 'POST') {
    const b = await readBody(req, 16 * 1024);
    const sci = getKnow().sci;
    if (sci.cats.filter((c) => c.custom).length >= 30) throw httpErr(400, 'الأقسام الخاصة كثيرة: ٣٠ على الأكثر');
    const name = cleanLabel(b.name);
    if (!name) throw httpErr(400, 'اكتب اسم القسم');
    if (sci.cats.some((c) => c.name === name)) throw httpErr(409, 'في الأقسام قسمٌ بهذا الاسم');
    const id = 'c-' + crypto.randomBytes(4).toString('hex');
    sci.cats.push({ id, name, desc: clip(b.desc, 200), custom: true, builtin: false, enabled: true, ai: okAi(b.ai), keys: [], words: [], wordsText: clip(b.words, 1200), dorar: DORAR_SERVICES[b.dorar] ? b.dorar : '' });
    await saveSci(sci);
    return json(res, 201, { id, view: adminView() }), true;
  }
  mm = /^\/api\/admin\/know\/sci\/cats\/(c-[a-f0-9]{8})$/.exec(p);
  if (mm && m === 'DELETE') {
    const sci = getKnow().sci;
    sci.cats = sci.cats.filter((c) => c.id !== mm[1] || !c.custom);
    await saveSci(sci);
    return json(res, 200, adminView()), true;
  }

  /* —— مصادر الترجمة —— */
  if (p === '/api/admin/know/trans' && m === 'PUT') {
    const b = await readBody(req, 256 * 1024);
    const t = getKnow().trans;
    const have = new Set(getKnow().keys.map((k) => k.id));
    const next = { ...t };
    if (b.ai !== undefined) next.ai = okAi(b.ai);
    if (['ai', 'engine', 'hybrid'].includes(b.mode)) next.mode = b.mode;
    if (b.engine !== undefined) next.engine = have.has(String(b.engine)) ? String(b.engine) : '';
    if (b.from !== undefined) next.from = okLang(b.from, true);
    if (b.to !== undefined) next.to = okLang(b.to);
    if (Array.isArray(b.keys)) next.keys = [...new Set(b.keys.map(String).filter((id) => have.has(id)))].slice(0, 20);
    if (typeof b.useSiwar === 'boolean') next.useSiwar = b.useSiwar;
    if (typeof b.glossary === 'string') next.glossary = clip(b.glossary, 60000);
    if (typeof b.note === 'string') next.note = clip(b.note, 600).trim();
    if (['keep', 'translate'].includes(b.honor)) next.honor = b.honor;
    await setConfig({ knowTrans: next });
    return json(res, 200, adminView()), true;
  }

  /* —— البحث والترجمة والمعجم (المختبر والمساعد) —— */
  if (p === '/api/admin/know/search' && m === 'POST') {
    const b = await readBody(req, 64 * 1024);
    const r = await gather({ cats: Array.isArray(b.cats) ? b.cats : ['auto'], q: b.q, text: b.text, prompt: b.prompt || b.q || '' });
    return json(res, 200, { sources: r.sources, used: r.used, how: r.how, errors: r.errors, prefer: r.prefer }), true;
  }
  if (p === '/api/admin/know/translate' && m === 'POST') {
    const b = await readBody(req, 600 * 1024);
    try {
      return json(res, 200, { ok: true, ...(await translate(b)) }), true;
    } catch (e) {
      return json(res, e.status || 502, { error: e.message, reason: e.reason || '', trail: e.trail || [] }), true;
    }
  }
  if (p === '/api/admin/know/lexicon' && m === 'GET') {
    const q = String(url.searchParams.get('q') || '').slice(0, 60);
    const know = getKnow();
    const ids = [...new Set([...know.sci.cats.flatMap((c) => c.keys.map((k) => k.key)), ...(know.trans.keys || [])])];
    const k = ids.map(keyOf).find((x) => x && x.kind === 'siwar' && x.enabled !== false);
    if (!k) throw httpErr(409, 'لا مفتاح لسِوار: أضفه من الإعدادات ← مصادر المعرفة');
    return json(res, 200, { results: await siwarSearch(k, q, { limit: 6 }) }), true;
  }
  throw httpErr(404, 'غير موجود');
}

/** (للاختبار) */
export const _rules = { heuristicQueries, heuristicCats, keywords, parseGlossary };
