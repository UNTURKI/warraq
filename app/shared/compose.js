// تطبيق القالب والإعدادات على البنية الدلالية لإنتاج «نموذج الإخراج» الموحّد لـ PDF و Word
// Applies template (matn / sharh / hashia / tafsir), footnote toggle and ornaments.
import { suraFromHeading } from './quran.js';
import { resolveStyles } from './ustyles.js';
import { researchify } from './research.js';
import { composeMutun } from './mutun.js';
import { applyTypoRules } from './typo-rules.js';

/** وضع البيت الذي اختاره المستخدم في «المحرِّر» لقصيدةٍ بعينها (يعلو وضع الأسلوب) */
// vl نمط الشعر · vs الفاصل · vg فراغ الوسط (مم) · vi البادئة (مم) · vk الكشيدة الآلية (off: معطّلة)
const VKEYS = ['vl', 'vs', 'vg', 'vi', 'vk'];
const verseStyle = (b) => Object.fromEntries(VKEYS.filter((k) => b[k] != null && b[k] !== '').map((k) => [k, b[k]]));
const samePoemStyle = (a, b) => VKEYS.every((k) => String(a[k] ?? '') === String(b[k] ?? ''));

/**
 * الثلاثي والتخميس: أشطر القصيدة تُجمع ثلاثةً ثلاثة (أو خمسةً خمسة): كل شطرين بيتٌ موازٍ، وآخر المجموعة شطرٌ وحده في الوسط
 * (الأشطر تُؤخذ بترتيبها من أبيات القصيدة، فلا يهمّ كيف قُسّمت في الأصل)
 */
function groupPoems(out, s) {
  const res = [];
  for (let i = 0; i < out.length; ) {
    const b = out[i];
    const vl = b.type === 'verse' ? b.vl || s.verseLayout : null;
    if (vl !== 'tri' && vl !== 'khams') {
      res.push(b);
      i++;
      continue;
    }
    let j = i;
    const hs = [];
    while (j < out.length && out[j].type === 'verse' && out[j].poem === b.poem) {
      for (const p of out[j].parts || []) if (String(p || '').trim()) hs.push({ t: String(p).trim(), _i: out[j]._i });
      j++;
    }
    const n = vl === 'tri' ? 3 : 5;
    const base = { ...b };
    delete base.parts;
    delete base._i;
    delete base.vq;
    delete base.sn;
    for (let g = 0; g < hs.length; g += n) {
      const grp = hs.slice(g, g + n);
      let k = 0;
      for (; k + 1 < grp.length && k + 1 < n - 1; k += 2) res.push({ ...base, parts: [grp[k].t, grp[k + 1].t], ...(grp[k]._i != null ? { _i: grp[k]._i } : {}) });
      for (; k < grp.length; k++) res.push({ ...base, parts: [grp[k].t, ''], single: true, ...(grp[k]._i != null ? { _i: grp[k]._i } : {}) });
    }
    i = j;
  }
  return res;
}

export function hasEmbeddedMatn(block) {
  return block.type === 'para' && block.runs.some((r) => r.k === 'm');
}

/** مستويات الفهرس المختارة (الأبواب ١، الفصول ٢، العناوين الفرعية ٣ فما دون) */
export function tocLevelOk(level, s) {
  const inc =
    Array.isArray(s.tocInclude) && s.tocInclude.length ? s.tocInclude : [1, 2, 3].filter((l) => l <= (s.tocLevels || 3));
  return inc.includes(Math.min(level, 3));
}

/** fileToc: فهرس ملف Word كما هو — عناوينه كلها بمستوياتها (ما وُسم nt ليس فيه)، لا ما تختاره إعدادات الفهرس */
function collectHeadings(out, s, fileToc = false) {
  const headings = [];
  for (const b of out) {
    if (b.type === 'heading') {
      if (!b.nt) headings.push({ id: b.id, level: b.level, text: b.text });
    } else if (b.type === 'para')
      for (const r of b.runs) if (r.k === 'ht' && !fileToc) headings.push({ id: r.id, level: r.level || 3, text: r.s.trim(), inline: true });
  }
  return fileToc ? headings : headings.filter((h) => tocLevelOk(h.level, s));
}

// عناصر ملفات Word التي تمرّ كما هي: صورة، جدول، صفحة غلاف، خط
const OBJECTS = ['image', 'table', 'coverpage', 'pagefig', 'hr', 'ornament', 'pagebreak'];
// صفحات كاملة من الملف (غلاف، صفحة عنوان بصورها): تبقى في كل القوالب
const PAGES = ['coverpage', 'pagefig'];
// «_i»: موضع القطعة فيما حلّله المحلّل (يحمله المحرِّر إلى الصفحة المنضَّدة ليعرف ما تحت المؤشر)
const src = (b) => (b._i != null ? { _i: b._i } : null);
// البيت: الآيات في شطريه (vq: [[الشطر، من، إلى]…])، ورقمه في الملف (sn)
const vextra = (b) => ({ ...(Array.isArray(b.vq) && b.vq.length ? { vq: b.vq } : {}), ...(b.sn > 0 ? { sn: b.sn } : {}) });
// ما يخصّ القطعة من «المحرِّر»: تنسيق الفقرة (ps)، وتنسيق القطعة كلها (st)
// والهامش الجانبي (side: { r, l }): ما يُكتب في هامش الصفحة بجانب القطعة
// وما كتبه المستخدم بيده (ue) أو أدرجه (ins): لا تمسّه قواعد المسافات
const own = (b) => ({ ...(b.ps ? { ps: b.ps } : {}), ...(b.st ? { st: b.st } : {}), ...(b.ps && b.ps.pb ? { breakBefore: true } : {}), ...(b.side ? { side: b.side } : {}), ...(b.ue || b.ins ? { ue: 1 } : {}) });
const fmtOf = (b) => ({ ...(b.al ? { al: b.al } : {}), ...own(b), ...src(b) });
const headOf = (b, id) => ({ type: 'heading', level: b.level, text: b.text, id, ...(b.al ? { al: b.al } : {}), ...(b.nt ? { nt: true } : {}), ...own(b), ...src(b) });
/** حاشية أدرجها المستخدم في «المحرِّر»: تظهر ولو كان القالب بلا حواشٍ (هو كتبها) */
const userNote = (r) => typeof r.id === 'string' && /^u[0-9a-z]{6,}$/.test(r.id);
/** فقرة كتبها المستخدم ثم فرغت: تبقى سطراً فارغاً يُكتب فيه */
const EMPTY = () => [{ k: 't', s: '\u200b', _o: 0 }];
const objOf = (b) => {
  const { pageId, mt, sh, ...rest } = b;
  return rest;
};
const docExtras = (vol) => (vol.fileToc ? { fileToc: true, ...(vol.tocTitle ? { tocTitle: vol.tocTitle } : {}) } : {});

/** حذف العناوين التي لم يبقَ تحتها نص (من الآخر حتى يُحذف الفرعي الفارغ قبل أصله) */
function pruneEmptyHeadings(out) {
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].type !== 'heading') continue;
    const next = out[i + 1];
    if (!next || (next.type === 'heading' && next.level <= out[i].level) || next.type === 'ornament') out.splice(i, 1);
  }
}

/** كتب «المتن ثم ــ ثم الشرح»: المتن هو الأصل، ثم خط، ثم الشرح نصاً عادياً؛ وحاشية الشرح هي الحاشية الحقيقية */
function composeSplit(vol, s) {
  const onlyMatn = s.template === 'matn';
  const withNotes = s.footnotes !== false;
  const out = [];
  const usedNotes = {};
  let headingSeq = 0;
  for (const b of vol.blocks) {
    if (b.type === 'heading') out.push(headOf(b, 'h' + ++headingSeq));
    else if (OBJECTS.includes(b.type)) {
      // صورة أو جدول في الشرح يسقط مع الشرح في قالب المتن المجرد؛ وصفحة الغلاف تبقى دائماً
      if (onlyMatn && !b.mt && !PAGES.includes(b.type)) continue;
      out.push(objOf(b));
    } else if (b.type === 'rule') {
      if (!onlyMatn) out.push({ type: 'rule', ...src(b) });
    } else if (b.type === 'para') {
      if (onlyMatn && !b.mt) continue;
      let runs = b.runs.map((r) => (r.k === 'ht' ? { ...r, id: 'h' + ++headingSeq } : r));
      if (onlyMatn) runs = runs.filter((r) => r.k !== 'rs' && r.k !== 'r');
      runs = runs.filter((r) => {
        if (r.k !== 'r') return true;
        if ((!withNotes && !userNote(r)) || !vol.notes[r.id]) return false;
        usedNotes[r.id] = vol.notes[r.id];
        return true;
      });
      if (!runs.some((r) => r.k === 'r' || (r.s && r.s.trim()))) {
        if (!b.ins) continue;
        runs = EMPTY();
      }
      out.push({ type: 'para', runs, mt: !!b.mt, sh: !!b.sh, ...fmtOf(b) });
    } else if (b.type === 'verse') {
      if (onlyMatn && b.sh) continue;
      const prev = out[out.length - 1];
      out.push({ type: 'verse', parts: b.parts, poem: prev && prev.type === 'verse' && !!prev.mt === !!b.mt && samePoemStyle(prev, b) ? prev.poem : 'v' + out.length, ...(b.mt ? { mt: true } : {}), ...verseStyle(b), ...own(b), ...vextra(b), ...src(b) });
    }
  }
  // لا يبقى خط بلا شرح بعده
  // (بعده شرح: فقرة، أو بيت أو صورة أو جدول من ملف Word)
  for (let i = out.length - 1; i >= 0; i--) {
    const n = out[i + 1];
    if (out[i].type === 'rule' && (!n || n.type === 'heading' || n.type === 'rule' || n.type === 'ornament' || PAGES.includes(n.type) || (n.type === 'para' && !n.sh))) out.splice(i, 1);
  }
  if (onlyMatn) pruneEmptyHeadings(out);
  else applySharhEnd(out, s);
  const grouped = groupPoems(out, s);
  return applyTypoRules({ blocks: grouped, notes: { ...usedNotes }, headings: collectHeadings(grouped, s, vol.fileToc), bookHasMatn: true, layout: 'plain', split: true, ...docExtras(vol) }, s);
}

/**
 * نهاية الشرح (لكل قوالب الشرح):
 *  - page (افتراضي): كل متن جديد يبدأ في أول صفحة جديدة، ولا يُدرج بعد الشرح السابق.
 *  - ornament: ثلاثة رموز زخرفية بعد الشرح، ليعرف القارئ أن ما بعدها متن.
 * تُوضع العلامة قبل العناوين الملاصقة للمتن حتى يبقى العنوان مع متنه.
 */
function applySharhEnd(out, s) {
  if (!(s.template === 'full' || s.template === 'matn_sharh')) return;
  const mode = s.sharhEnd === 'ornament' ? 'ornament' : 'page';
  let sharhSince = false; // مرّ كلام بعد آخر متن (أو قبل أول متن)
  let prevWasMatn = false;
  let anyMatn = false;
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.type === 'heading' || b.type === 'rule' || b.type === 'ornament' || PAGES.includes(b.type) || b.type === 'hr' || b.type === 'pagebreak') continue;
    const isMatn = (b.type === 'para' && (b.mt || b.matn)) || (b.type === 'verse' && b.mt);
    if (isMatn) {
      // سطور المتن المتتالية مقطع واحد، إلا المتن المضمَّن فكل فقرة منه متن وشرح
      // (وفقرةٌ أولها تتمةُ متنٍ انتهت به الفقرة قبلها ليست متناً جديداً: لا يُفصل المتن الواحد)
      const lastRun = (x) => (x && x.runs ? [...x.runs].reverse().find((r) => r.k !== 'r' && r.s && r.s.trim()) : null);
      const firstRun = (x) => (x && x.runs ? x.runs.find((r) => r.k !== 'r' && r.s && r.s.trim()) : null);
      const prevPara = out[i - 1];
      const cont = b.matn && prevPara && prevPara.type === 'para' && (lastRun(prevPara) || {}).k === 'm' && (firstRun(b) || {}).k === 'm';
      // والمتن المضمَّن في وسط الشرح («ثم قال: ــ … ــ») استشهادٌ لا مقطعٌ جديد: المقطع الجديد ما بدأت فقرته بالمتن
      const starts = (b.matn && !cont && (firstRun(b) || {}).k === 'm') || (!b.matn && !prevWasMatn);
      if (starts && sharhSince) {
        let j = i;
        while (j > 0 && out[j - 1].type === 'heading') j--;
        if (mode === 'page') out[j].breakBefore = true;
        else if (anyMatn && out[j - 1] && out[j - 1].type !== 'ornament') {
          out.splice(j, 0, { type: 'ornament' });
          i++;
        }
      }
      anyMatn = true;
      prevWasMatn = !b.matn;
      sharhSince = b.matn && b.runs ? b.runs.some((r) => r.k !== 'm' && r.k !== 'r' && r.s && r.s.trim().length > 2) : false;
    } else {
      prevWasMatn = false;
      sharhSince = true;
    }
  }
  if (mode === 'ornament' && anyMatn && sharhSince && out.length && out[out.length - 1].type !== 'ornament') out.push({ type: 'ornament' });
}

/* ====================================================================== */
/* قالب التفسير: الآية متنٌ بارز، وما تحتها تفسيرها                          */
/* ====================================================================== */

const letters = (t) => (String(t || '').match(/[\u0621-\u064A]/g) || []).length;
const runsText = (runs) => runs.map((r) => (r.k === 'r' ? '' : r.s || '')).join('');
// عناوين التفسير التي تسبق الكلام (وحدها في سطر، أو في أول الفقرة قبل «:»)
const TAFSIR_LABELS = [
  'الشرح', 'الإيضاح', 'الايضاح', 'التفسير', 'البيان', 'المعنى', 'المعنى الإجمالي', 'المعنى العام', 'المعنى الإجمالي للآية', 'المعنى الإجمالي للآيات',
  'التفسير الإجمالي', 'التفسير الإجمالي للآيات', 'الإيضاح والتفسير', 'التفسير والبيان', 'التفسير والإيضاح', 'شرح المفردات', 'المفردات', 'معاني المفردات',
  'معاني الكلمات', 'غريب الكلمات', 'غريب الألفاظ', 'المفردات اللغوية', 'اللغة', 'الإعراب', 'البلاغة', 'القراءات', 'سبب النزول', 'أسباب النزول',
  'سبب نزول الآية', 'المناسبة', 'مناسبة الآية', 'مناسبة الآيات', 'المناسبة لما قبلها', 'الفوائد', 'فوائد الآية', 'فوائد الآيات', 'من فوائد الآية',
  'من فوائد الآيات', 'الأحكام', 'الأحكام الشرعية', 'ما ترشد إليه الآيات', 'ما ترشد إليه الآية', 'هداية الآيات', 'هداية الآية', 'التوجيه',
  'فقه الحياة أو الأحكام', 'الفقه', 'الحكم', 'التأويل', 'النظم', 'المقصد', 'مقاصد السورة', 'بين يدي السورة', 'مقدمة السورة', 'تعريف بالسورة',
];
const labelNorm = (t) =>
  String(t || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const LABEL_SET = new Set(TAFSIR_LABELS.map(labelNorm));
/** فقرة هي عنوان تفسير وحده: «الإيضاح»، «[المعنى الإجمالي]»، «التفسير:» */
function wholeLabel(b) {
  if (b.runs.some((r) => r.k === 'q' || r.k === 'r' || r.k === 'ht')) return '';
  const t = runsText(b.runs).trim();
  if (t.length > 40) return '';
  return LABEL_SET.has(labelNorm(t)) ? t.replace(/^[\s([«"*ـ-]+|[\s)\]»"*:：.ـ-]+$/g, '') : '';
}
/** «الإيضاح: …» في أول الفقرة: يُبرز العنوان */
function boldLeadLabel(runs) {
  const r0 = runs[0];
  if (!r0 || r0.k !== 't') return runs;
  const m = /^\s*[([«]?([^:：()\[\]«»]{2,30}?)[)\]»]?\s*[:：]\s*/.exec(r0.s);
  if (!m || !LABEL_SET.has(labelNorm(m[1]))) return runs;
  return [{ k: 'f', s: m[0].trimEnd(), b: 1 }, { k: 't', s: ' ' + r0.s.slice(m[0].length) }, ...runs.slice(1)];
}
/** سورة الآيات في الفقرة (من أطول آياتها) */
function paraSura(b) {
  let best = null;
  for (const r of b.runs) if (r.k === 'q' && r.su && (!best || r.s.length > best.s.length)) best = r;
  return best ? best.su : 0;
}
/**
 * فقرة هي آية (أو آيات) تُفسَّر: أكثر حروفها قرآن.
 * لا تُعدّ كذلك: آية يُستشهد بها بعد كلام ينتهي بـ«:»، ولا آية من سورة غير التي يُفسَّر فيها (في مقدمات السور)،
 * ولا البسملة وحدها.
 */
function isAyahPara(b, prev, curSura) {
  if (b.type !== 'para' || b.noteHolder) return false;
  let q = 0;
  let all = 0;
  for (const r of b.runs) {
    if (r.k === 'r' || r.k === 'rs' || r.k === 'sn') continue;
    const n = letters(r.s);
    all += n;
    if (r.k === 'q' || (r.k === 'm' && r.q)) q += n;
  }
  if (q < 6 || q < all * 0.6) return false;
  const plain = runsText(b.runs).replace(/[^\u0621-\u064A]/g, '');
  if (/^بسماللهالرحمنالرحيم$/.test(plain.replace(/[أإآ]/g, 'ا'))) return false;
  if (prev && prev.type === 'para' && !prev.ay) {
    const pt = runsText(prev.runs).trim();
    if (/[:：]$/.test(pt) && letters(pt) > 60) return false;
  }
  const su = paraSura(b);
  if (curSura && su && su !== curSura) return false;
  return true;
}

/**
 * @param {{blocks:Array, notes:Object, layout?:string}} vol  ناتج parseVolume
 * @param {object} s  الإعدادات
 */
export function composeVolume(vol, s) {
  // أنماط المستخدم (من «المحرِّر») تُحلّ أولاً: كل فقرة وكلمة بتنسيقها الفعلي
  // المتون: المتن مركّباً كما في الكتب، ثم أجزاؤه ومواضع التعليق عليه (shared/mutun.js)
  if (s.mutun) return composeMutun(vol, s, composeVolume);
  // أنماط الأسلوب (تنبيه، فائدة…) تحت أنماط الكتاب نفسه: ما عرّفه المستخدم في كتابه باسمها يعلوها
  if (s.ustyles && typeof s.ustyles === 'object' && Object.keys(s.ustyles).length) vol = { ...vol, ustyles: { ...s.ustyles, ...(vol.ustyles || {}) } };
  vol = resolveStyles(vol);
  // البحث العلمي: صفحة عنوانه، ومستويات عناوينه بمصطلحات البحث، وأدوار فقراته؛ ثم يُركَّب كتاباً بلا متن بحواشيه كلها
  const research = s.template === 'research';
  if (research) {
    vol = researchify(vol, s);
    s = { ...s, template: 'full', sharhEnd: 'page' };
  }
  if (vol.layout === 'split') return composeSplit(vol, s);
  const tafsir = s.template === 'tafsir';
  const withNotes = s.footnotes !== false && (s.template === 'full' || s.template === 'matn_hashia' || tafsir);
  const withSharh = s.template === 'full' || s.template === 'matn_sharh' || tafsir;
  const isMatnBlock = (b) => b.type === 'para' && (b.mt || hasEmbeddedMatn(b));
  let bookHasMatn = vol.blocks.some(isMatnBlock);
  // متن عارض (شرطة هنا وهناك) في كتاب ليس متناً وشرحاً: لا يُسقط قالبُ المتن الكتابَ كله
  if (bookHasMatn && !withSharh) {
    let all = 0;
    let matn = 0;
    for (const b of vol.blocks) {
      if (b.type !== 'para') continue;
      for (const r of b.runs) {
        const n = r.s ? r.s.length : 0;
        all += n;
        if (b.mt || r.k === 'm') matn += n;
      }
    }
    if (all > 20000 && matn < all * 0.04) bookHasMatn = false;
  }
  let curSura = 0;

  const out = [];
  const usedNotes = {};
  let headingSeq = 0;
  let poemSeq = 0;
  let contentSinceHeading = false;

  for (const b of vol.blocks) {
    if (b.type === 'heading') {
      // كتب بلا متن مميَّز: زخرفة نهاية القسم (في وضع الزخارف)
      if (!bookHasMatn && withSharh && s.sharhEnd === 'ornament' && contentSinceHeading && b.level <= 2) {
        const last = out[out.length - 1];
        if (last && last.type !== 'ornament' && last.type !== 'heading') out.push({ type: 'ornament' });
      }
      contentSinceHeading = false;
      if (tafsir) curSura = suraFromHeading(b.text) || curSura;
      out.push(headOf(b, 'h' + ++headingSeq));
      continue;
    }
    if (OBJECTS.includes(b.type)) {
      // في قوالب المتن المجرد: صور الشرح وجداوله تسقط معه؛ وصفحة الغلاف تبقى دائماً
      if (!withSharh && bookHasMatn && !PAGES.includes(b.type)) continue;
      out.push(objOf(b));
      if (b.type !== 'hr') contentSinceHeading = true;
      continue;
    }
    if (b.type === 'label') {
      if (withSharh) out.push({ type: 'label', text: b.text, strong: b.strong, ...own(b), ...src(b) });
      continue;
    }
    if (b.type === 'verse') {
      if (!withSharh && bookHasMatn) continue; // الأبيات في الشرح غالباً
      const prevOut = out[out.length - 1];
      const poem = prevOut && prevOut.type === 'verse' && samePoemStyle(prevOut, b) ? prevOut.poem : ++poemSeq;
      out.push({ type: 'verse', parts: b.parts, poem, ...verseStyle(b), ...own(b), ...vextra(b), ...src(b) });
      contentSinceHeading = true;
      continue;
    }
    if (b.type !== 'para') continue;

    let runs = b.runs;
    let ay = false;
    if (tafsir) {
      const lb = wholeLabel(b);
      if (lb) {
        out.push({ type: 'label', text: lb, strong: true, ...src(b) });
        continue;
      }
      // المتن في التفسير هو الآية: ما عُلّم متناً مضمَّناً (شرطات) يعود نصاً
      runs = runs.map((r) => (r.k === 'm' ? (r.q ? { k: 'q', s: r.s } : { k: 't', s: r.s }) : r));
      let prevOut = null;
      for (let j = out.length - 1; j >= 0; j--) {
        if (out[j].type === 'heading') break;
        if (out[j].type === 'para') {
          prevOut = out[j];
          break;
        }
      }
      ay = !b.mt && isAyahPara({ ...b, runs }, prevOut, curSura);
      if (!ay) runs = boldLeadLabel(runs);
    }
    const embedded = !tafsir && hasEmbeddedMatn(b);
    if (!withSharh && bookHasMatn) {
      if (!isMatnBlock(b)) continue;
      if (embedded) {
        // الإبقاء على المتن فقط (مع حواشيه)
        runs = runs.filter((r) => r.k === 'm' || (r.k === 'r' && r.inMatn));
        runs = runs.flatMap((r, i) => (i && r.k === 'm' ? [{ k: 't', s: ' ' }, r] : [r]));
      }
    }
    if (!withNotes) runs = runs.filter((r) => r.k !== 'r' || userNote(r));
    runs = runs.filter((r) => r.k === 'r' || (r.s && r.s.length));
    if (!runs.some((r) => (r.k !== 'r' ? r.s.trim() : true))) {
      if (!b.ins) continue;
      runs = EMPTY();
    }
    for (const r of runs) if (r.k === 'r' && vol.notes[r.id] && (withNotes || userNote(r))) usedNotes[r.id] = vol.notes[r.id];
    runs = runs.filter((r) => r.k !== 'r' || usedNotes[r.id]);
    if (!runs.length) continue;

    // العناوين الواقعة داخل الجملة: معرّف لكل منها ليدخل الفهرس برقم صفحته
    runs = runs.map((r) => (r.k === 'ht' ? { ...r, id: 'h' + ++headingSeq } : r));
    out.push({ type: 'para', runs, matn: embedded, mt: !!b.mt || ay, ...(ay ? { ay: true } : {}), ...(b.role ? { role: b.role } : {}), ...fmtOf(b) });
    contentSinceHeading = true;
  }
  if (!bookHasMatn && withSharh && s.sharhEnd === 'ornament' && contentSinceHeading) out.push({ type: 'ornament' });
  // لا يبقى «شرح:» في آخر الكتاب بلا شرح
  while (out.length && out[out.length - 1].type === 'label') out.pop();

  // التفسير: لا صفحة جديدة لكل آية (الفصل بينها مسافة)
  if (bookHasMatn && !tafsir) applySharhEnd(out, s);
  // في قوالب المتن المجرد: حذف العناوين التي لم يبقَ تحتها متن
  if (!withSharh && bookHasMatn) pruneEmptyHeadings(out);

  const grouped = groupPoems(out, s);
  // قواعد التنضيد الأساسية: المسافات، وعزو الآيات، وقول النبي ﷺ، ونظام العناوين (shared/typo-rules.js)
  return applyTypoRules({
    blocks: grouped,
    notes: { ...usedNotes },
    headings: collectHeadings(grouped, s, vol.fileToc),
    bookHasMatn: tafsir ? false : bookHasMatn,
    layout: 'plain',
    ...(tafsir ? { ayat: out.filter((b) => b.ay).length } : {}),
    ...(research ? { research: true, ownCover: !!vol.ownCover, rstats: (vol.stats || {}).research || null } : {}),
    ...docExtras(vol),
  }, s);
}
