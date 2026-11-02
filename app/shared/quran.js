// التعرّف على الآيات غير المعلَّمة: نص القرآن (مشروع تنزيل، الرسم الإملائي بلا تشكيل) يُفهرس بسلاسل من أربع كلمات،
// فكل مقطع في النص تتصل فيه السلاسل الموجودة في القرآن خمس كلمات فأكثر فهو آية (أو بعضها).
// النص: shared/quran/quran-simple-clean.txt (Tanzil Project — tanzil.net، يُنسخ كما هو بلا تغيير)

const N = 4; // طول السلسلة
const MIN_WORDS = 5; // أقل ما يُعدّ آية

// توحيد الكلمة: بلا تشكيل ولا تطويل، والهمزات والألف المقصورة والتاء المربوطة صورة واحدة
const DIAC = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
export function qNorm(w) {
  return w
    .replace(DIAC, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '');
}

/**
 * فهرس القرآن من نص «تنزيل» (سورة|آية|نص في كل سطر): كل سلسلة ← رقم سورتها (٠ إن تكررت في أكثر من سورة)،
 * و ayas: كل سلسلة ← رقم آية أولها × ١٠٠٠ + رقم آية آخرها (٠ إن تكررت)، لعزو الآيات (رقم الآية من نصها)
 */
export function buildQuranIndex(txt) {
  const grams = new Map();
  const ayas = new Map();
  let sura = '';
  let words = [];
  let wa = []; // رقم آية كل كلمة
  const flush = () => {
    const su = +sura;
    for (let i = 0; i + N <= words.length; i++) {
      const g = words.slice(i, i + N).join(' ');
      const had = grams.get(g);
      grams.set(g, had === undefined || had === su ? su : 0);
      // رقم آية أول كلمة وآخرها (آيتان إن عبرت السلسلة رأس آية)
      ayas.set(g, had === undefined ? wa[i] * 1000 + wa[i + N - 1] : 0);
    }
    words = [];
    wa = [];
  };
  for (const line of String(txt).split('\n')) {
    const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] !== sura) {
      flush();
      sura = m[1];
    }
    for (const w of m[3].split(/\s+/)) {
      const n = qNorm(w);
      if (n) {
        words.push(n);
        wa.push(+m[2]);
      }
    }
  }
  flush();
  return { grams, ayas, size: grams.size };
}

/**
 * سورة الآية ومدى آياتها من نصها: { su, from, to } أو null.
 * من أرقام آيات سلاسلها التي في سورة واحدة (الأكثر)، وآخر سلسلة تنتهي في آيتها أو التي بعدها.
 */
export function ayahRange(text, index) {
  if (!index || !index.ayas || !text) return null;
  const ws = [];
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text))) {
    const n = qNorm(m[0]);
    if (n && !/^[\u0660-\u0669]+$/.test(n)) ws.push(n);
  }
  const hits = [];
  for (let i = 0; i + N <= ws.length; i++) {
    const g = ws[i] + ' ' + ws[i + 1] + ' ' + ws[i + 2] + ' ' + ws[i + 3];
    const su = index.grams.get(g);
    const ay = index.ayas.get(g);
    if (su && ay) hits.push({ su, ay: Math.floor(ay / 1000), end: ay % 1000, i });
  }
  if (!hits.length) return null;
  const votes = new Map();
  for (const h of hits) votes.set(h.su, (votes.get(h.su) || 0) + 1);
  const su = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const mine = hits.filter((h) => h.su === su);
  // سلاسل متتابعة الآيات فقط (يُترك الشاذ: سلسلةٌ تكررت في موضعٍ بعيد من السورة نفسها)
  const ays = mine.map((h) => h.ay).sort((a, b) => a - b);
  const med = ays[Math.floor(ays.length / 2)];
  const near = mine.filter((h) => Math.abs(h.ay - med) <= Math.max(3, ws.length / 6));
  if (!near.length) return null;
  const from = Math.min(...near.map((h) => h.ay));
  const to = Math.max(...near.map((h) => h.end));
  return { su, from, to };
}

// كلمة عربية (بتشكيلها) في النص
// رقم الآية بين آيتين متتاليتين لا يقطعهما
const VNUM = /[(\uFD3F]\s*[0-9\u0660-\u0669]{1,3}\s*[)\uFD3E]/g;
const WORD = /[\u0621-\u064A\u0660-\u0669\u066E-\u06D3\u06D5\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+/g;

/**
 * مواضع الآيات في نص: [{ a, b }] (بداية الكلمة الأولى ونهاية الأخيرة).
 * رقم الآية بين آيتين لا يقطعهما؛ أما علامات الترقيم (، . : ؛) والأقواس والسطر الجديد فتقطعها
 * (فنص الحديث المفصول بالفواصل «بالله، وملائكته، وكتبه…» ليس آية).
 */
export function findQuran(text, index) {
  if (!index || !text) return [];
  const toks = [];
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text))) {
    const n = qNorm(m[0]);
    if (!n || /^[\u0660-\u0669]+$/.test(n)) continue;
    toks.push({ a: m.index, b: m.index + m[0].length, n });
  }
  if (toks.length < MIN_WORDS) return [];
  const out = [];
  let start = -1; // أول كلمة في المقطع الجاري
  let endWord = -1; // آخر كلمة فيه
  for (let i = 0; i + N <= toks.length; i++) {
    // لا تمتد السلسلة فوق فاصل غير مسموح
    let ok = true;
    for (let k = i; k < i + N - 1 && ok; k++) if (/[A-Za-z\n«»()[\]{}﴿﴾،؛.:!?؟]/.test(text.slice(toks[k].b, toks[k + 1].a).replace(VNUM, ' '))) ok = false;
    ok = ok && index.grams.has(toks[i].n + ' ' + toks[i + 1].n + ' ' + toks[i + 2].n + ' ' + toks[i + 3].n);
    if (ok) {
      // سلسلة لا تلي سابقتها مباشرة: مقطع جديد
      if (start < 0 || i > endWord - N + 2) {
        if (start >= 0 && endWord - start + 1 >= MIN_WORDS) out.push({ a: toks[start].a, b: toks[endWord].b });
        start = i;
      }
      endWord = i + N - 1;
    }
  }
  if (start >= 0 && endWord - start + 1 >= MIN_WORDS) out.push({ a: toks[start].a, b: toks[endWord].b });
  // مقاطع متصلة (تبدأ سلسلة قبل نهاية سابقتها): تُضم
  const merged = [];
  for (const r of out) {
    const p = merged[merged.length - 1];
    if (p && r.a <= p.b + 1) p.b = Math.max(p.b, r.b);
    else merged.push({ ...r });
  }
  return merged;
}

/** سورة النص (أكثر سلاسله نسبةً إلى سورة واحدة)، أو ٠ إن لم تُعرف */
export function suraOf(text, index) {
  if (!index || !text) return 0;
  const ws = [];
  WORD.lastIndex = 0;
  let m;
  while ((m = WORD.exec(text))) {
    const n = qNorm(m[0]);
    if (n && !/^[\u0660-\u0669]+$/.test(n)) ws.push(n);
  }
  const votes = new Map();
  for (let i = 0; i + N <= ws.length; i++) {
    const su = index.grams.get(ws[i] + ' ' + ws[i + 1] + ' ' + ws[i + 2] + ' ' + ws[i + 3]);
    if (su) votes.set(su, (votes.get(su) || 0) + 1);
  }
  let best = 0;
  let bv = 0;
  for (const [su, v] of votes) if (v > bv) [best, bv] = [su, v];
  return best;
}

// أسماء السور (ومشهور أسمائها الأخرى) لمعرفة السورة من عنوانها: «تفسير سورة البقرة»
const SURAS = ["الفاتحة|فاتحة الكتاب|الحمد","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة|براءة","يونس","هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء|بني إسرائيل","الكهف","مريم","طه","الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم","لقمان","السجدة|الم السجدة|ألم تنزيل","الأحزاب","سبأ|سبإ","فاطر|الملائكة","يس","الصافات","ص","الزمر","غافر|المؤمن","فصلت|حم السجدة","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد|القتال","الفتح","الحجرات","ق","الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة","الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك|تبارك","القلم|ن","الحاقة","المعارج|سأل سائل","نوح","الجن","المزمل","المدثر","القيامة","الإنسان|الدهر|هل أتى","المرسلات","النبأ|النبإ|عم|عم يتساءلون","النازعات","عبس","التكوير","الانفطار|الإنفطار","المطففين|التطفيف","الانشقاق|الإنشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد","الشمس","الليل","الضحى","الشرح|الانشراح|ألم نشرح","التين","العلق|اقرأ","القدر","البينة|لم يكن","الزلزلة|الزلزال","العاديات","القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر","المسد|تبت|اللهب","الإخلاص|التوحيد","الفلق","الناس"];
const SURA_OF = new Map();
SURAS.forEach((names, i) => {
  for (const n of names.split('|')) SURA_OF.set(qNorm(n), i + 1);
});
/** رقم السورة من اسمها («البقرة»، «آل عمران»، «براءة»)، أو ٠ */
export function suraByName(name) {
  const ws = String(name || '').replace(/[^\u0621-\u064A\s]/g, ' ').split(/\s+/).filter(Boolean).map(qNorm);
  if (ws[0] === 'سوره') ws.shift();
  return SURA_OF.get(ws.join(' ')) || 0;
}
/** اسم السورة برقمها */
export const suraName = (n) => (SURAS[n - 1] || '').split('|')[0];
/** رقم السورة من عنوان مثل «تفسير سورة البقرة» أو «سورة آل عمران وهي مدنية»، أو ٠ */
export function suraFromHeading(text) {
  const ws = String(text || '')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(qNorm);
  const at = ws.indexOf('سوره');
  if (at < 0) return 0;
  for (const len of [3, 2, 1]) {
    const n = SURA_OF.get(ws.slice(at + 1, at + 1 + len).join(' '));
    if (n) return n;
  }
  return 0;
}

/** فهرس واحد يُحمَّل عند الحاجة (المتصفح والعامل) */
let loading = null;
export function loadQuranIndex(url = '/shared/quran/quran-simple-clean.txt') {
  loading ||= fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(buildQuranIndex)
    .catch(() => (loading = null));
  return loading;
}
