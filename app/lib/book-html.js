// بناء مستند HTML للطباعة من نموذج الإخراج (لا يُطبع واجهة الموقع، بل مستند مستقل مبني من البيانات)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS, PAPER } from '../shared/presets.js';
import crypto from 'node:crypto';
import { fontFaceCss } from './fonts.js';
import { getBasmala } from './basmala.js';
import { cleanPrint, textFonts } from './print.js';
import { resolvePrint } from './styles.js';
import { designCss } from '../shared/style-parts.js';
import { pageGeom } from '../shared/margin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE =
  fs.readFileSync(path.join(ROOT, 'typeset', 'kashida.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'typeset', 'engine.js'), 'utf8');
const FALLBACK = "'FreeSerif', 'DejaVu Sans', 'Traditional Arabic', 'Times New Roman', serif";

/**
 * خطوط المستند: ما رفعه المالك، ثم public/fonts، ثم خطوط الأغلفة المحلية، وأخيراً Google Fonts.
 * inline: تضمين الخط في المستند (PDF) أو ربطه برابط (المعاينة).
 */
function fontFaces(families, inline) {
  const { css, missing } = fontFaceCss(families, { inline });
  const google = missing.filter((fam) => FONTS[fam] && FONTS[fam].google).map((fam) => FONTS[fam].google);
  const link = google.length
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${google.map((g) => 'family=' + g).join('&')}&display=block">`
    : '';
  return { css, link };
}

/**
 * @param {object} o
 * @param {object} [o.extra]      إضافات الأسلوب (من بطاقة الأسلوب): { css, tpl, pages, opts } منقّاة (lib/styles.js)
 * @param {boolean} [o.preview]   مستند معاينة في المتصفح: الخطوط بروابط لا مضمّنة
 * @param {string} [o.origin]     أصل الموقع كما يراه المتصفح (للمعاينة في إطار معزول: روابط الخطوط مطلقة)
 * @param {object} [o.marks]      علامات لوحات المعاينة (معرّف أول عنوان في كل لوحة)
 * @param {object} [o.print]      إعداد الطباعة (غير محفوظ، من محرر المالك). وإلا فإعداد أسلوبه أو إعداد الموقع.
 */
export function buildBookHtml({ doc, settings: S, cover, baseUrl, extra = null, preview = false, origin = '', marks = null, print = null, editor = false, numStart = 0 }) {
  const extraCss = (extra && extra.css) || '';
  // أجزاء التصميم الجاهزة التي اختارها صاحب الأسلوب (مفاتيح معروفة): تنسيقها يُكتب هنا، بعد الأصل وقبل تنسيق البطاقة
  const partsCss = designCss(S.design, S);
  const NAMES = S.fonts.names || 'Aref Ruqaa';
  // النسخة الجاهزة للطباعة: إعدادها (تسلسل الصفحات، العنوان المختصر، البسملة، الترقيم، هامش التجليد)
  const PR = S.printReady ? (print && !S.printPreset ? cleanPrint(print) : resolvePrint(S)) : null;
  const wantsBsm = !!PR && [...PR.front, ...PR.back].some((x) => x.type === 'basmala');
  // صورة البسملة المختارة من مكتبة الموقع (قناع يُلوَّن)، وإلا نصّها بخط الرقعة
  const bsm = wantsBsm ? getBasmala(S.basmalaId) : null;
  const bsmColor = S.basmalaColor || (PR && PR.basmala.color) || (S.headingColors || {})[1] || '#000';
  const G = PR ? PR.gutterMm : 0; // هامش التجليد: يُزاد في الجهة الداخلية (يمين الفردية، يسار الزوجية)
  // خطوط اختارها المستخدم لكلماتٍ بعينها في «المحرِّر»
  const ownFonts = new Set();
  const scanSt = (st) => st && typeof st.font === 'string' && st.font.length < 81 && ownFonts.add(st.font);
  for (const bl of (doc && doc.blocks) || []) {
    scanSt(bl.st);
    for (const r of bl.runs || []) scanSt(r.st);
  }
  for (const n of Object.values((doc && doc.notes) || {})) for (const sg of n.segs || []) for (const r of sg.runs || []) scanSt(r.st);
  const RF = ['matn', 'quran', 'verse', 'h1', 'h2', 'h3'].map((k) => S.fonts[k]).filter(Boolean);
  const fams = [...new Set([...ownFonts, S.fonts.body, S.fonts.heading, S.fonts.cover, NAMES, ...RF, ...(wantsBsm && !bsm ? ['Aref Ruqaa'] : []), ...(PR ? textFonts(PR) : []), ...((extra && extra.opts && extra.opts.fonts) || [])])];
  const site = /^https?:\/\/[\w.-]+(:\d{1,5})?$/.test(String(origin)) ? String(origin) : '';
  let { css: faces, link } = fontFaces(fams, !preview);
  // الإطار المعزول لا «أصل» له: روابط خطوط الموقع تُكتب كاملة
  if (preview && site) faces = faces.replace(/url\(\/(?!\/)/g, `url(${site}/`);
  const P = S.page;
  // الهامش الخارجي الواسع: X ما زيد على الهامش في طرف الكتاب (صفحات المتن والفهرس)
  const GM = pageGeom(S);
  const X = GM.extra;
  const hc = S.headingColors || {};
  const sz = S.sizes;
  // الهامش الجانبي كما في الأسلوب (مقاسه ولونه وخطه ومحاذاته وخطه الفاصل) — والقيم نُقّيت في cleanSettings
  const SN = S.sideNote && typeof S.sideNote === 'object' ? { ...S.sideNote, font: String(S.sideNote.font || '').replace(/['"\\;{}<>]/g, '') } : {};
  /* صفحات «الجاهزة للطباعة» قبل الكتاب وبعده، بمواضعها ومقاساتها من إعداد الطباعة */
  const frontCss = () => {
    const h = PR.half;
    const b = PR.basmala;
    const inL = `calc(${P.side}mm + var(--g-l))`;
    const inR = `calc(${P.side}mm + var(--g-r))`;
    const HT = {
      bl: `left: ${inL}; bottom: ${P.bottom + 8}mm; text-align: left;`,
      br: `right: ${inR}; bottom: ${P.bottom + 8}mm; text-align: right;`,
      tl: `left: ${inL}; top: ${P.top + 8}mm; text-align: left;`,
      tr: `right: ${inR}; top: ${P.top + 8}mm; text-align: right;`,
      c: `left: ${inL}; right: ${inR}; top: 46%; transform: translateY(-50%); text-align: center; max-width: none;`,
    };
    const bw = (P.w * b.widthPct) / 100;
    return `/* العنوان المختصر */
.ht-box { position: absolute; max-width: 70%; ${HT[h.pos] || HT.bl} }
.ht-title { font-family: '${S.fonts.cover}', '${S.fonts.heading}', ${FALLBACK}; font-weight: 700; font-size: ${h.titlePt}pt; line-height: 1.5; color: ${h.color || hc[1]}; }
.ht-sub { font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; font-size: ${h.subPt}pt; line-height: 1.6; color: ${h.subColor || '#3D2314'}; margin-top: 1mm; }
.ht-author { font-family: '${NAMES}', '${S.fonts.heading}', ${FALLBACK}; font-weight: 700; font-size: ${h.subPt}pt; line-height: 1.7; color: ${h.subColor || '#3D2314'}; margin-top: 2mm; }
/* البسملة: وسطها عند النسبة المختارة من ارتفاع الصفحة */
.bsm-wrap { position: absolute; left: var(--g-l); right: var(--g-r); top: ${b.yPct}%; transform: translateY(-50%); display: flex; justify-content: center; }
.bsm-img { display: block; width: ${bw.toFixed(2)}mm; max-width: 100%; max-height: ${(P.h * 0.7).toFixed(1)}mm; object-fit: contain; }
.bsm-text { font-family: 'Aref Ruqaa', '${NAMES}', ${FALLBACK}; font-weight: 700; font-size: ${(bw * 0.38).toFixed(1)}pt; line-height: 1.6; color: ${bsmColor}; white-space: nowrap; }
/* صفحة نص حر: فقرات، لكل فقرة محاذاتها، ولكل جزء من نصها حجمه وخطه ولونه (في السطر نفسه) */
.ft-wrap { z-index: 1; position: absolute; top: ${P.top}mm; bottom: ${P.bottom}mm; left: ${inL}; right: ${inR}; display: flex; flex-direction: column; justify-content: center; }
.ft-wrap.v-top { justify-content: flex-start; } .ft-wrap.v-bottom { justify-content: flex-end; }
.ft-text { line-height: 1.75; overflow-wrap: anywhere; }
.ft-p { margin: 0; text-align: center; white-space: pre-wrap; }
.ft-p.a-start { text-align: start; } .ft-p.a-end { text-align: end; } .ft-p.a-justify { text-align: justify; }
/* صورة في صفحة النص: في سطرها (بعرضها من عرض النص)، أو حرّة (وسطها عند موضعها من الصفحة، وعرضها من عرض الصفحة) */
.ft-img { line-height: 0; } .ft-img img { display: inline-block; max-width: 100%; height: auto; }
.ft-free { position: absolute; z-index: 2; transform: translate(-50%, -50%); height: auto; display: block; }
.ft-free.behind { z-index: 0; }
/* صفحة صورة: في موضعها بعرض مختار، أو تملأ الصفحة كلها */
.fi-wrap { position: absolute; left: var(--g-l); right: var(--g-r); transform: translateY(-50%); display: flex; justify-content: center; }
.fi-img { display: block; max-width: 100%; max-height: ${(P.h * 0.9).toFixed(1)}mm; object-fit: contain; }
.fi-full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }`;
  };
  const VL = ['stack', 'stagger', 'center'].includes(S.verseLayout) ? S.verseLayout : 'line'; // نمط الشعر في الأسلوب (والثلاثي والتخميس موازيان)
  // قصائد اختار لها المستخدم وضعاً في «المحرِّر»
  const OWN_VERSE = !!(doc && Array.isArray(doc.blocks) && doc.blocks.some((b) => b.type === 'verse' && (b.vl || b.vs || b.vg != null || b.vi != null || b.vk)));
  // شطرٌ وحده في الوسط (آخر الثلاثي والمخمَّس، أو بيتٌ نُقص شطره)
  const SINGLE_VERSE = !!(doc && Array.isArray(doc.blocks) && doc.blocks.some((b) => b.type === 'verse' && (b.single || !String((b.parts || [])[0] || '').trim() || !String((b.parts || [])[1] || '').trim())));
  const SEP = VL === 'line' && S.verseSep && S.verseSep !== 'none';
  const css = `
${faces}
/* متغيرات الإعدادات: يقرؤها تنسيق بطاقة الأسلوب فيتبع ما يختاره المالك والمستخدم */
:root { --c-text: ${S.textColor}; --c-h1: ${hc[1]}; --c-h2: ${hc[2]}; --c-h3: ${hc[3]}; --c-h4: ${hc[4]}; --c-matn: ${S.matnColor}; --c-quran: ${S.quranColor};
  --c-orn: ${S.ornamentColor}; --c-rule: ${S.ruleColor}; --f-body: '${S.fonts.body}', ${FALLBACK}; --f-heading: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK};
  --f-cover: '${S.fonts.cover}', '${S.fonts.heading}', ${FALLBACK}; --f-names: '${NAMES}', '${S.fonts.cover}', ${FALLBACK};
  --page-w: ${P.w}mm; --page-h: ${P.h}mm; --m-top: ${P.top}mm; --m-bottom: ${P.bottom}mm; --m-side: ${P.side}mm;
  --s-body: ${sz.body}pt; --s-note: ${sz.note}pt; --s-h1: ${sz.h1}pt; --s-h2: ${sz.h2}pt; --s-h3: ${sz.h3}pt; --s-h4: ${sz.h4}pt; --gutter: ${G}mm;
  --m-in: ${GM.inner}mm; --m-out: ${GM.outer}mm; --text-w: ${GM.text}mm; --wide: ${X}mm;
  --paper: ${S.paper === 'yellow' ? PAPER.yellow : '#fff'}; }
@page { size: ${P.w}mm ${P.h}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--paper); }
body { direction: rtl; font-family: '${S.fonts.body}', ${FALLBACK}; color: ${S.textColor};
  font-size: ${sz.body}pt; line-height: ${S.lineHeight}; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-kerning: normal; font-variant-ligatures: common-ligatures; }
.page { width: ${P.w}mm; height: ${P.h}mm; position: relative; overflow: hidden; break-after: page; page-break-after: always; background: var(--paper); }
.page:last-child { break-after: auto; page-break-after: auto; }
.body { position: absolute; top: ${P.top}mm; bottom: ${P.bottom}mm; left: ${P.side}mm; right: ${P.side}mm; }
.page { --g-r: 0mm; --g-l: 0mm; --x-r: 0mm; --x-l: 0mm; --mside-clear: 0mm;
  --t-l: calc(${P.side}mm + var(--g-l) + var(--x-l)); --t-r: calc(${P.side}mm + var(--g-r) + var(--x-r)); }
.flow { display: flow-root; }
.flow > :first-child { margin-top: 0 !important; }
.notes { position: absolute; bottom: 0; left: 0; right: 0; display: flow-root; font-size: ${sz.note}pt; line-height: ${S.noteLineHeight}; --hang: 2.35em; }
.fnsep { display: none; width: 34%; border-top: 0.7pt solid ${S.ruleColor}; margin: 0 0 1.4mm 0; }
.notes:has(.fn) .fnsep { display: block; }
.fn { text-align: justify; text-justify: inter-word; padding-inline-start: var(--hang); text-indent: calc(-1 * var(--hang)); }
.fn .fnn { display: inline-block; width: var(--hang); text-indent: 0; font-weight: 700; }
.fn.brk { text-align-last: justify; }
.fnp { text-indent: 0; text-align: justify; }
.mside-n { position: absolute; z-index: 2; box-sizing: border-box; font-size: ${SN.size || sz.note}pt; line-height: 1.5; color: ${SN.color || 'var(--c-text)'};${SN.font ? ` font-family: '${SN.font}', var(--f-body);` : ''} text-align: ${SN.al ? { r: 'right', l: 'left', c: 'center', j: 'justify' }[SN.al] : 'center'}; text-indent: 0; overflow-wrap: anywhere; white-space: pre-line; }
.mside-n i.ew { font-style: inherit; }
${SN.rule === false ? '' : `.mside-n.r { border-left: 0.5pt solid ${S.ruleColor}; padding-left: 1.2mm; }
.mside-n.l { border-right: 0.5pt solid ${S.ruleColor}; padding-right: 1.2mm; }`}
/* نص الهامش في خانةٍ بقدره (sideNote.box) */
.mside-n.framed { border: 0.6pt solid ${S.ruleColor}; border-radius: 1.2mm; padding: 1mm 1.8mm; background: var(--paper); }
.p.dir-ltr { direction: ltr; unicode-bidi: isolate; }
.p.dir-ltr.brk { text-align-last: justify; }
${
    VL === 'line'
      ? `.fnv { text-indent: 0; display: grid; grid-template-columns: ${SEP ? '1fr auto 1fr' : '1fr 1fr'}; column-gap: ${SEP ? 3 : 5}mm; text-align: center; }`
      : `.fnv { text-indent: 0; display: grid; grid-template-columns: minmax(0, 1fr); text-align: center; }`
  }
.fnv > .hm, .verse > .hm { color: ${S.verseColor || 'inherit'}; }
.fnv > span, .verse > span { display: block; white-space: nowrap; min-width: 0; text-align: justify; text-align-last: justify; text-justify: inter-word; }
.p { margin: 0; text-align: justify; text-justify: inter-word; }
.p.first { text-indent: ${S.indentMm}mm; }
.p.brk { text-align-last: justify; }
.fr { font-size: 0.62em; position: relative; top: -0.62em; line-height: 0; font-weight: 700; }
.m, .mq { font-weight: ${S.matnBold ? 700 : 400}; color: ${S.matnColor}; }
.q { color: ${S.quranColor}; }
/* الآيات أكبر من المتن بنقطةٍ واحدة (ولا يتسع لها السطر: ارتفاعه من الفقرة) */
.q, .mq { font-size: calc(1em + 1pt); line-height: 0; }
.h .q, .h .mq, .opener-h .q { font-size: inherit; line-height: inherit; }
/* عزو الآية بعدها بنمطٍ أصغر: [البقرة: ٢٥٥] */
.qref { font-size: 0.8em; white-space: nowrap; }
${S.quranInMatn ? '.p.mt .q, .verse.mt .q { color: inherit; }' : '.mq { color: ' + S.quranColor + '; }'}
.ht { font-weight: 700; }
.kw { font-weight: 700; color: var(--c-h4, ${hc[4] || hc[3]}); }
.qm { font-weight: 700; color: ${S.quotedColor || S.matnColor}; }
.p.sh { }
.verse > .vsep, .fnv > .vsep { color: ${S.ornamentColor}; white-space: nowrap; font-size: 0.8em; align-self: center; text-align: center; text-align-last: center; word-spacing: 0.35em; padding: 0 0.2em; }
.sn { font-weight: 700; color: ${S.matnColor}; }
.shlabel { margin: 0.8mm 0 0.6mm; }
.shlabel.strong { font-weight: 700; color: ${hc[2]}; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; }
.shrule { border-top: 0.8pt solid ${S.ruleColor}; margin: 2.2mm 0 2.6mm; height: 0; }
/* كتب المتن أعلى الصفحة والشرح تحته */
.p.mt { font-weight: 700; color: ${S.matnColor}; }
/* قالب التفسير: الآية التي تُفسَّر بارزة بلون القرآن، وبينها وبين ما قبلها فسحة */
.p.mt.ay { color: ${S.quranColor}; font-weight: ${S.matnBold ? 700 : 400}; }
.p.mt.ay .q { color: inherit; }
.p.ay.first { margin-top: 2.4mm; }
.p.ay + .p:not(.ay), .p.ay + .shlabel { margin-top: 1.2mm; }
.notes.sh { position: relative; bottom: auto; margin-top: 2.2mm; font-size: ${sz.body}pt; line-height: ${S.lineHeight}; --hang: 0; }
.notes.sh .fnsep { width: 100%; margin-bottom: 1.8mm; }
.notes.sh .fn.k-sharh { padding-inline-start: 0; text-indent: ${S.indentMm}mm; text-align: justify; }
.notes.sh .fn.k-sharh.cont { text-indent: 0; }
.notes.sh .fn.k-sharh .fnn { display: inline; width: auto; margin-inline-end: 0.3em; color: ${S.matnColor}; }
.notes.sh .fn.k-sharh .fnn:empty { display: none; }
.notes.sh .fn.k-sharh .fnp { text-indent: ${S.indentMm}mm; }
.notes.sh .fn.k-fn { font-size: ${sz.note}pt; line-height: ${S.noteLineHeight}; --hang: 2.35em; }
.fnp.sub, .fnv.sub { font-size: ${(sz.note / sz.body).toFixed(3)}em; line-height: ${S.noteLineHeight}; text-indent: 0 !important; }
.fnp:not(.sub) + .fnp.sub, .fn > .fnp.sub:first-of-type { margin-top: 1.2mm; padding-top: 1mm; border-top: 0.5pt solid ${S.ruleColor}; width: 100%; }
.rs { font-size: 0.62em; position: relative; top: -0.62em; line-height: 0; font-weight: 700; }
.h { ${S.hadithBold ? 'font-weight:700;' : ''} }
.h1, .h2, .h3, .h4 { font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; break-after: avoid; }
.h1 { font-size: ${sz.h1}pt; color: ${hc[1]}; text-align: center; line-height: 1.5; margin: 7mm 0 5mm; }
.h1::after { content: ''; display: block; width: 32mm; margin: 2.2mm auto 0; border-top: 0.8pt solid ${S.ruleColor}; }
.h2 { font-size: ${sz.h2}pt; color: ${hc[2]}; text-align: center; line-height: 1.55; margin: 5mm 0 3.6mm; }
.h3 { font-size: ${sz.h3}pt; color: ${hc[3]}; text-align: start; line-height: 1.6; margin: 3.5mm 0 2.6mm; }
.h4 { font-size: ${sz.h4}pt; color: ${hc[4]}; text-align: start; line-height: 1.6; margin: 3mm 0 2.2mm; }
${
    VL === 'line'
      ? `.verse { display: grid; grid-template-columns: ${SEP ? '1fr auto 1fr' : '1fr 1fr'}; column-gap: ${SEP ? 3.5 : 7}mm; text-align: center; margin: 0.6mm 0; }`
      : `.verse { display: grid; grid-template-columns: minmax(0, 1fr); text-align: center; margin: 1mm auto 1.6mm; }`
  }
/* الشطر الثاني في السطر التالي: الأول في يمين سطره والثاني في يسار السطر الذي بعده.
   stack: بعرض السطر كله، فلا يلتقيان · stagger: أضيق، فيبدأ الثاني قبل نهاية الأول. العرض يضبطه المحرك بعد القياس. */
${VL === 'stack' || VL === 'stagger' ? '.verse > .hm:first-child, .fnv > .hm:first-child { justify-self: start; } .verse > .hm:last-child, .fnv > .hm:last-child { justify-self: end; }' : VL === 'center' ? '.verse > .hm, .fnv > .hm { justify-self: center; }' : ''}
${SINGLE_VERSE ? '.verse.vsingle { display: grid; grid-template-columns: minmax(0, 1fr); text-align: center; } .verse.vsingle > .hm { justify-self: center !important; }' : ''}
/* تنسيق المؤلف في ملفات Word: محاذاة الفقرة والعنوان، والعريض والمسطّر (واللون على العنصر نفسه) */
.p.a-c { text-align: center; text-indent: 0; } .p.a-l { text-align: left; text-indent: 0; } .p.a-r { text-align: right; }
.p.a-c.brk { text-align-last: center; } .p.a-l.brk { text-align-last: left; } .p.a-r.brk { text-align-last: right; }
.h.a-c { text-align: center; } .h.a-l { text-align: left; } .h.a-r { text-align: right; }
.fb { font-weight: 700; } .fu { text-decoration: underline; text-underline-offset: 0.3em; text-decoration-thickness: 0.05em; }
.verse.mt > .hm { color: ${S.matnColor}; font-weight: ${S.matnBold ? 700 : 400}; }
${OWN_VERSE ? `/* وضعٌ لقصيدةٍ بعينها (من «المحرِّر»): يعلو وضع الأسلوب */
.verse.vl-line { display: grid; grid-template-columns: 1fr 1fr; column-gap: 7mm; text-align: center; margin: 0.6mm 0; }
.verse.vl-line.has-sep { grid-template-columns: 1fr auto 1fr; column-gap: 3.5mm; }
.verse.vl-line > .hm:first-child, .verse.vl-line > .hm:last-child { justify-self: stretch; }
.verse.vl-stack, .verse.vl-stagger { display: grid; grid-template-columns: minmax(0, 1fr); text-align: center; margin: 1mm auto 1.6mm; }
.verse.vl-stack > .hm:first-child, .verse.vl-stagger > .hm:first-child { justify-self: start; }
.verse.vl-stack > .hm:last-child, .verse.vl-stagger > .hm:last-child { justify-self: end; }
.verse.vl-center { display: grid; grid-template-columns: minmax(0, 1fr); text-align: center; margin: 1mm auto 1.6mm; }
.verse.vl-center > .hm { justify-self: center !important; }` : ''}
/* خطٌّ لكل نوعٍ من النص (من الإعدادات): المتن، والآيات، والأبيات، والباب، والفصل، وما دونهما */
${roleFonts(S, FALLBACK)}
/* من «المحرِّر»: التفاف النص حول الصورة، والصورة خلف النص وأمامه، والإطارات، والبداية المميزة */
.page { isolation: isolate; }
.fig.fl { line-height: 0; margin-top: 1mm; margin-bottom: 1.6mm; }
.fig.fl-right { float: right; margin-left: 4mm; margin-right: 0; }
.fig.fl-left { float: left; margin-right: 4mm; margin-left: 0; }
.fig.fl .figcap { line-height: 1.5; }
.fig-abs { position: absolute; transform: translate(-50%, -50%); line-height: 0; text-align: center; }
.fig-abs.behind { z-index: -1; } .fig-abs.front { z-index: 3; }
.fig-abs img { display: block; }
.fig img.bd-line, .bd-line img { border: 0.6pt solid ${S.ruleColor}; }
.bd-frame img { padding: 1.4mm; border: 1.6pt double ${hc[1]}; background: var(--paper); }
.p.bx, .h.bx { padding: 1.8mm 3mm; margin-top: 1.4mm; margin-bottom: 1.6mm; }
.bx-box { border: 0.7pt solid ${S.ruleColor}; border-radius: 1.4mm; }
.bx-double { border: 2pt double ${hc[1]}; }
.bx-shade { background: color-mix(in srgb, ${S.ornamentColor} 12%, var(--paper)); border-radius: 1.4mm; }
.bx-side { border-inline-start: 2.2pt solid ${hc[1]}; padding-inline-start: 3.4mm; padding-top: 0.4mm; padding-bottom: 0.4mm; border-radius: 0; }
.p.bx.brk { border-bottom-left-radius: 0; border-bottom-right-radius: 0; margin-bottom: 0; }
.p.bx.cont { border-top-left-radius: 0; border-top-right-radius: 0; margin-top: 0; }
.p.bx-box.brk, .p.bx-double.brk { border-bottom-style: dashed; }
.p.bx-box.cont, .p.bx-double.cont { border-top-style: dashed; }
.p.drop { text-indent: 0; }
/* القوائم: العلامة معلّقة في أول السطر، والأسطر بعدها بمحاذاة النص */
.p.li { padding-inline-start: 2.4em; text-indent: 0; }
.p.li.first { text-indent: -2.4em; }
.p.li .lmark { display: inline-block; width: 2.4em; text-indent: 0; color: ${hc[1]}; font-weight: 700; }
.p.li-w { padding-inline-start: 4.2em; } .p.li-w.first { text-indent: -4.2em; } .p.li-w .lmark { width: 4.2em; }
.dropw { float: right; font-size: 2.55em; line-height: 1.02; margin: 0.08em 0 0 0.22em; color: ${hc[1]}; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; }
/* صور ملفات Word وجداولها */
.fig { margin: 2.2mm 0 2.6mm; text-align: center; line-height: 0; } .fig.a-l { text-align: left; } .fig.a-r { text-align: right; }
.fig img { display: inline-block; }
.figcap { font-size: ${Math.max(sz.body - 2, 8)}pt; line-height: 1.6; text-align: center; margin-top: 1.2mm; color: ${S.textColor}; }
/* صفحة صور من الملف (عنوان الكتاب، شعار الدار): كل صورة في موضعها */
.file-page .fp-flow { position: absolute; top: ${P.top}mm; bottom: ${P.bottom}mm; left: ${P.side}mm; right: ${P.side}mm; display: flex; flex-direction: column; overflow: hidden; }
.fp-i { text-align: center; line-height: 0; flex: none; } .fp-i.a-l { text-align: left; } .fp-i.a-r { text-align: right; }
.fp-i img { max-width: 100%; height: auto; display: inline-block; }
.fp-t { line-height: 1.7; font-family: var(--f-heading); } .fp-t.b { font-weight: 700; }
.fp-abs { position: absolute; height: auto; display: block; }
.tbl { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 3mm; font-size: ${Math.max(sz.body - 1.5, 8)}pt; line-height: 1.6; }
.tbl td, .tbl th { padding: 0.9mm 1.6mm; vertical-align: top; text-align: start; overflow-wrap: anywhere; font-weight: 400; }
.tbl.bd td, .tbl.bd th { border: 0.6pt solid ${S.ruleColor}; }
.tbl th, .tbl .b { font-weight: 700; } .tbl th { background: rgba(0, 0, 0, 0.045); text-align: center; }
.tbl td:empty, .tbl th:empty { height: 1.75em; }
${S.fileFmt ? '.tbl { line-height: 1.25; margin: 1mm 0; } .tbl td, .tbl th { padding: 0.35mm 1.2mm; }\n' : ''}.tbl .a-c { text-align: center; } .tbl .a-l { text-align: left; } .tbl .a-r { text-align: right; } .tbl .a-j { text-align: justify; text-align-last: justify; }
.hrule { width: 36%; height: 0; margin: 3mm auto; border-top: 0.7pt solid ${S.ruleColor}; }
/* صفحة غلاف من الملف (صورة تملأ الصفحة) */
.fc-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; } .fc-img.fill { object-fit: cover; }
.orn { text-align: center; color: ${S.ornamentColor}; margin: 2.5mm 0 3.5mm; word-spacing: 0.4em; font-size: 1.05em; line-height: 1.6; }
.rh { position: absolute; top: ${Math.max(P.top - 10.5, 3)}mm; left: ${P.side}mm; right: ${P.side}mm; display: none;
  text-align: center; font-size: 10.5pt; line-height: 1.5; color: #4a3a2e; border-bottom: 0.5pt solid ${S.ruleColor}; padding-bottom: 0.8mm;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; }
.rh.on { display: block; }
.folio { position: absolute; left: 0; right: 0; bottom: ${P.wide && Number(P.footer) > 0 ? Math.max(Number(P.footer) + 2, 3) : Math.max(P.bottom * 0.4, 3)}mm; text-align: center; font-weight: 700; font-size: ${S.preset === 'file' && Number(S.folioSize) > 0 ? Number(S.folioSize) : 15}pt; line-height: 1;${/^#[0-9a-f]{6}$/i.test(S.folioColor || '') ? ' color: ' + S.folioColor + ';' : ''} }
/* الغلاف الداخلي */
.cover .body { top: 14mm; bottom: 14mm; left: 14mm; right: 14mm; }
.cover-frame { position: absolute; inset: 0; border: 1.4pt solid ${S.ruleColor}; padding: 1.6mm; }
.cover-in { position: absolute; inset: 1.6mm; border: 0.5pt solid ${S.ruleColor}; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; padding: 12mm 8mm 9mm; }
.cv-top { min-height: 10mm; }
.cv-vol { display: inline-block; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; font-size: 15pt; color: ${hc[1]}; border-top: 0.6pt solid ${S.ruleColor}; border-bottom: 0.6pt solid ${S.ruleColor}; padding: 0.5mm 6mm; }
.cv-mid { display: flex; flex-direction: column; align-items: center; }
.cv-title { font-family: '${S.fonts.cover}', '${S.fonts.heading}', ${FALLBACK}; font-weight: 700; font-size: 36pt; line-height: 1.45; color: ${hc[1]}; }
.cv-sub { font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; font-size: 17pt; line-height: 1.6; color: #3D2314; margin-top: 2mm; }
.cv-orn { color: ${S.ornamentColor}; margin: 9mm 0 8mm; word-spacing: 0.5em; font-size: 14pt; }
.cv-label { font-size: 13pt; color: ${S.ornamentColor}; margin-bottom: 1mm; }
.cv-author { font-family: '${NAMES}', '${S.fonts.cover}', ${FALLBACK}; font-weight: 700; font-size: 22pt; line-height: 1.6; color: #3D2314; }
.cv-note { font-size: 12pt; color: #5b4a3c; }
.cv-gap { height: 9mm; }
.cv-editor { font-family: '${NAMES}', '${S.fonts.heading}', ${FALLBACK}; font-weight: 700; font-size: 18pt; line-height: 1.7; color: #3D2314; max-width: 110mm; }
.cv-bottom { font-size: 11pt; line-height: 1.7; color: #4a3a2e; }
/* الفهرس */
.toc-title { text-align: center; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; font-size: ${sz.h1}pt; color: ${hc[1]}; line-height: 1.5; margin: 2mm 0 2mm; }
.toc-rule { border-top: 0.6pt solid ${S.ruleColor}; margin: 0 0 2mm; }
.toc-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 13pt; color: #3D2314; margin-bottom: 2mm; }
.toc-e { display: flex; align-items: baseline; color: inherit; text-decoration: none; font-size: 14pt; line-height: 1.75; }
.toc-e .t { flex: 0 1 auto; max-width: calc(100% - 5.5em); }
.toc-e .ld { flex: 1 1 0; min-width: 1.5em; overflow: hidden; white-space: nowrap; margin: 0 0.35em; text-align: justify; text-align-last: justify; letter-spacing: 0; font-weight: 400; }
.toc-e .n { flex: 0 0 auto; min-width: 2.2em; text-align: left; font-weight: 700; }
.toc-e.l1 { font-weight: 700; color: ${hc[1]}; margin-top: 1.2mm; }
.toc-e.l2 { padding-inline-start: 5mm; }
.toc-e.l3 { padding-inline-start: 10mm; font-size: 13pt; }
.toc-e.l4 { padding-inline-start: 14mm; font-size: 12.5pt; }
${PR ? frontCss() : ''}
${S.template === 'research' ? researchCss(S, FALLBACK) : ''}
${S.mutun ? mutunCss(S, FALLBACK) : ''}
${S.preset === 'file' ? `/* كما في الملف: العناوين بلا زخرفة، وبمحاذاتها فيه */
.h1::after { display: none; }
.h1 { margin: 4mm 0 3mm; }
${S.headAl === 'r' ? '.h1:not(.a-c):not(.a-l), .h2:not(.a-c):not(.a-l), .h3:not(.a-c):not(.a-l), .h4:not(.a-c):not(.a-l) { text-align: start; }' : ''}` : ''}
/* عناصر قوالب الأسلوب */
.deco { position: absolute; inset: 0; pointer-events: none; }
.page.extra .body, .page.opener .body { top: 0; bottom: 0; left: 0; right: 0; }
.opener-h { all: unset; display: block; height: 100%; }
${
    G || X
      ? `/* هامش التجليد والهامش الخارجي الواسع: عرض النص ثابت ويُزاح. --g-r و --g-l ما زيد للتجليد يمين الصفحة ويسارها (عند الكعب)،
   و --x-r و --x-l ما زيد للهامش الواسع (في طرف الكتاب، صفحات المتن والفهرس). الصفحة اليسرى .pg-l كعبها يمين، واليمنى .pg-r كعبها يسار */
.page { --g-r: ${G}mm; --g-l: 0mm; }
.page.pg-r { --g-r: 0mm; --g-l: ${G}mm; }
${X ? `.page.content, .page.toc { --x-l: ${X}mm; --x-r: 0mm; }
.page.content.pg-r, .page.toc.pg-r { --x-l: 0mm; --x-r: ${X}mm; }
` : ''}.body, .rh { left: var(--t-l); right: var(--t-r); }
.cover .body { left: calc(14mm + var(--g-l)); right: calc(14mm + var(--g-r)); }
.folio { left: calc(var(--g-l) + var(--x-l)); right: calc(var(--g-r) + var(--x-r)); }`
      : ''
  }
`;
  const pv = preview ? { marks: Object.fromEntries(Object.entries(marks && typeof marks === 'object' ? marks : {}).filter(([k, v]) => /^\w{1,20}$/.test(k) && (/^[\w:-]{1,60}$/.test(String(v)) || v === '*first'))), ...(editor ? { editor: true, ...(numStart > 1 ? { numStart } : {}) } : {}) } : null;
  const data = JSON.stringify({ doc, settings: S, cover, tpl: (extra && extra.tpl) || {}, pages: (extra && extra.pages) || [], opts: (extra && extra.opts) || {}, preview: pv, front: PR ? { printReady: true, seq: PR.front, back: PR.back, half: PR.half, numbering: PR.numbering, padTo: PR.padTo, basmala: bsm ? { src: bsm.src, w: bsm.w, h: bsm.h } : null, basmalaColor: bsmColor } : { printReady: false } }).replace(/</g, '\\u003c');
  // برنامج الأسلوب (كود البطاقة): يُسجّل دواله في window.Warraq قبل أن يبدأ التنضيد
  const code = extra && typeof extra.script === 'string' && extra.script.trim() ? extra.script.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--') : '';
  // لا يعمل في المستند إلا محرك التنضيد وبرنامج الأسلوب (كلاهما بـnonce): أي سكربت أو معالج حدث في القوالب يمنعه المتصفح.
  // ولا شبكة: لا اتصال ولا صور خارجية، والخطوط من الموقع نفسه أو Google Fonts فقط.
  const nonce = crypto.randomBytes(12).toString('base64');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: ${preview ? site || "'self'" : ''} https://fonts.gstatic.com; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${(cover.title || '').replace(/</g, '')}</title>
${link}<style>${css}</style>${partsCss ? `<style id="style-design">${partsCss}</style>` : ''}${extraCss ? `<style id="style-extras">${extraCss}</style>` : ''}${S.headScheme === 'pro' ? `<style id="head-scheme">${headSchemeCss(S, hc)}</style>` : ''}</head><body><main id="book"></main>
<script type="application/json" id="book-data">${data}</script>
<script nonce="${nonce}">${ENGINE}</script>${code ? `\n<script nonce="${nonce}">(function (W) {\n'use strict';\n${code}\n})(window.Warraq);</script>` : ''}</body></html>`;
}

/**
 * تنضيد البحث العلمي: أسود خالص، تمييز العناوين بالحجم والوزن والمسافات لا بالألوان والزخارف،
 * مسافة بعد الفقرة، والملخص والمراجع والنص الإنجليزي بأحجامها، والمراجع بمسافة معلّقة، ورقم الصفحة عادي ١٢
 */
function researchCss(S, FALLBACK) {
  const after = Number(S.paraAfter) || 0;
  const hang = 8;
  // الاحتياطي في البحث أميري (مرفقٌ بترخيص OFL في public/covers/fonts): فـ Traditional Arabic إن اختير ولم يكن مثبتاً حلّ محله أميري لا خطُّ النظام
  const RF = (f) => `'${String(f || '').replace(/['"\\;{}<>]/g, '')}', 'Amiri', ${FALLBACK}`;
  const NAMES = S.fonts.names || S.fonts.heading;
  return `/* البحث العلمي */
:root { --f-body: ${RF(S.fonts.body)}; --f-heading: '${S.fonts.heading}', ${RF(S.fonts.body)}; --f-cover: '${S.fonts.cover}', ${RF(S.fonts.heading)}; --f-names: '${NAMES}', ${RF(S.fonts.heading)}; }
body { font-family: var(--f-body); }
.h1, .h2, .h3, .h4, .toc-title, .cv-sub { font-family: var(--f-heading); }
.cv-title { font-family: var(--f-cover); }
.p { margin-bottom: ${after}pt; }
.p.brk { margin-bottom: 0; }
.p.li { margin-bottom: ${Math.min(after, 3)}pt; }
.h1, .h2, .h3, .h4 { line-height: 1.5; }
.h1 { margin: 2mm 0 ${Math.max(after, 4)}pt; }
.h1::after { display: none; }
.h2 { margin: ${Math.max(after * 1.6, 6)}pt 0 ${Math.max(after, 4)}pt; }
.h3, .h4 { margin: ${Math.max(after * 1.2, 5)}pt 0 ${Math.max(after * 0.6, 3)}pt; text-align: start; }
.kw { color: inherit; }
.fnsep { width: 30%; border-top-width: 0.6pt; }
.folio { font-weight: 400; font-size: ${Number(S.folioSize) || 12}pt; }
.p.r-abs { font-size: ${Number(S.abstractSize) || 15}pt; }
.p.r-kw { text-indent: 0 !important; margin-top: 2pt; }
.p.r-ref, .p.r-refh { font-size: ${Number(S.refSize) || 14}pt; }
.p.r-ref { padding-inline-start: ${hang}mm; text-indent: 0; margin-bottom: ${Math.min(after, 4)}pt; }
.p.r-ref.first { text-indent: -${hang}mm; }
.p.r-refh { text-indent: 0 !important; font-weight: 700; margin-top: 3pt; }
.p.r-en { direction: ltr; unicode-bidi: isolate; font-family: 'Times New Roman', 'Liberation Serif', 'Tinos', ${FALLBACK}; font-size: ${Number(S.enSize) || 12}pt; }
.p.r-en.r-abs { font-size: ${Math.max(Number(S.enSize) || 12, 12)}pt; }
.p.r-en.first { text-indent: ${S.indentMm}mm; } .p.r-en.r-kw.first, .p.r-en.r-ref.first { text-indent: 0; }
.toc-e.l1 { color: inherit; }
.toc-title { margin-bottom: 3mm; }
/* صفحة عنوان البحث */
.r-title .fp-t { font-family: var(--f-heading); line-height: 1.6; }
/* الغلاف الداخلي (إن لم يأتِ البحث بصفحة عنوانه): رسمي بسيط بلا إطار ولا زخرفة */
.cover-frame { border: 0; padding: 0; }
.cover-in { border: 0; justify-content: center; gap: 10mm; }
.cv-orn { display: none; }
.cv-title { font-size: 22pt; color: inherit; }
.cv-sub { font-size: 17pt; color: inherit; }
.cv-label { color: inherit; font-size: 14pt; margin-top: 6mm; }
.cv-author, .cv-editor { font-family: var(--f-names); font-size: 16pt; color: inherit; }
.cv-note, .cv-bottom { color: inherit; }`;
}

/**
 * المتون: موضع التعليق (عنوانه، وسطوره: فارغة أو منقّطة أو خطوط، بلونها وتباعدها)، والفاصل تحت المتن،
 * وخانات أرقام الأبيات (تسع أربعة أرقام)، والعناوين في الوسط
 */
function mutunCss(S, FALLBACK) {
  const HEXOK = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  const C = HEXOK(S.mRuleColor) ? S.mRuleColor : '#B7AC98';
  const g = Number(S.mGap) || 8;
  const hc = S.headingColors || {};
  const LC = HEXOK(S.mLabelColor) ? S.mLabelColor : hc[2] || hc[1] || S.textColor;
  const LF = String(S.mLabelFont || '').replace(/['"\;{}<>]/g, '') || S.fonts.heading;
  const LS = Number(S.mLabelSize) > 0 ? Number(S.mLabelSize) : Math.max((S.sizes && S.sizes.h3) || 17, 14);
  const AL = { r: 'flex-start', c: 'center', l: 'flex-end' }[S.mLabelAl] || 'center';
  const deco = S.mLabelDeco || 'plain';
  const lead = Number(S.mLead) > 0 ? Number(S.mLead) : 0;
  // ما قبل المتن («قال الناظم رحمه الله:»)
  const IC = HEXOK(S.mIntroColor) ? S.mIntroColor : HEXOK(S.matnColor) ? S.matnColor : hc[2] || S.textColor;
  const IF = String(S.mIntroFont || '').replace(/['"\;{}<>]/g, '') || S.fonts.heading;
  const IS = Number(S.mIntroSize) > 0 ? Number(S.mIntroSize) : (S.sizes && S.sizes.body) || 16;
  const IA = { r: 'flex-start', c: 'center', l: 'flex-end' }[S.mIntroAl] || 'flex-start';
  const ideco = S.mIntroDeco || 'plain';
  const sw = Math.min(60, Math.max(28, Number(S.mSideW) || 42));
  return `/* المتون */
:root { --ml: ${g}mm; --mc: ${C}; --vnw: 2.5em; --msw: ${sw}%; --mlc: ${LC}; }
/* خانات صاحب النسخة أسفل الغلاف الداخلي: يكتب فيها الطالب (خطٌّ أو نقاط أو فراغ بعد كل خانة) */
.cv-owner { width: 78%; display: grid; grid-template-columns: max-content minmax(20mm, 1fr); gap: 5.5mm 2.5mm; align-items: baseline; margin: 6mm auto 2mm; font-family: '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: 700; font-size: 13pt; line-height: 1.4; color: var(--c-h2, #3D2314); text-align: start; }
.cv-owner.abs { position: absolute; left: 11%; right: 11%; bottom: 6mm; width: auto; margin: 0; }
.cv-of { display: contents; }
.cv-of .f { height: 1em; }
.cv-of .f-line { border-bottom: 0.7pt solid var(--c-owner-ink, #6C5949); }
/* (نقاط خانات صاحب النسخة: حدٌّ منقَّط لا قناعٌ بتدرّج — التدرّج يُرمَّز في PDF تظليلاً لا يُرى صحيحاً في كثيرٍ من القرّاء) */
.cv-of .f-dots { position: relative; }
.cv-of .f-dots::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 0; border-bottom: 1.9pt dotted var(--c-owner-ink, #6C5949); }
.h1, .h2, .h3, .h4 { text-align: center; }
${lead ? `.page:not(.mcom) .flow { line-height: ${lead}; }` : ''}
.mc { width: 100%; }
.mc-below { margin-top: 2mm; }
.msep { border-top: 0.8pt solid ${S.ruleColor}; width: 100%; margin: 0 0 3mm; }
.mc-label { display: flex; justify-content: ${AL}; margin: 0 0 2.4mm; line-height: 1.5; }
.mc-label > span { font-family: '${LF}', '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: ${S.mLabelBold === false ? 400 : 700}; color: var(--mlc); font-size: ${LS}pt; }
${deco === 'rule' ? `.mc-label > span { border-bottom: 0.9pt solid color-mix(in srgb, var(--mlc) 70%, transparent); padding: 0 2mm 0.8mm; }` : ''}
${deco === 'frame' ? `.mc-label > span { border: 0.8pt solid color-mix(in srgb, var(--mlc) 75%, transparent); border-radius: 1.4mm; padding: 0.3mm 4.5mm 0.6mm; }` : ''}
${deco === 'band' ? `.mc-label { background: color-mix(in srgb, var(--mlc) 11%, var(--paper)); border-inline-start: 1.6mm solid color-mix(in srgb, var(--mlc) 70%, transparent); padding: 0.8mm 3.5mm; }` : ''}
${deco === 'orn' ? `.mc-label > span::before, .mc-label > span::after { content: '❁'; font-size: 0.62em; color: ${S.ornamentColor || '#C5A059'}; margin: 0 2.2mm; vertical-align: 0.18em; font-weight: 400; }` : ''}
.mintro { display: flex; justify-content: ${IA}; margin: 1mm 0 1.6mm; line-height: 1.6; break-after: avoid; }
.mintro > span { font-family: '${IF}', '${S.fonts.heading}', '${S.fonts.body}', ${FALLBACK}; font-weight: ${S.mIntroBold === false ? 400 : 700}; color: ${IC}; font-size: ${IS}pt; }
${ideco === 'rule' ? `.mintro > span { border-bottom: 0.9pt solid color-mix(in srgb, ${IC} 70%, transparent); padding: 0 1.5mm 0.6mm; }` : ''}
${ideco === 'frame' ? `.mintro > span { border: 0.8pt solid color-mix(in srgb, ${IC} 75%, transparent); border-radius: 1.4mm; padding: 0.2mm 4mm 0.5mm; }` : ''}
${ideco === 'band' ? `.mintro { background: color-mix(in srgb, ${IC} 10%, var(--paper)); border-inline-start: 1.6mm solid color-mix(in srgb, ${IC} 70%, transparent); padding: 0.6mm 3.5mm; }` : ''}
${ideco === 'orn' ? `.mintro > span::before, .mintro > span::after { content: '❁'; font-size: 0.62em; color: ${S.ornamentColor || '#C5A059'}; margin: 0 2mm; vertical-align: 0.18em; font-weight: 400; }` : ''}
.mc-area { width: 100%; position: relative; }
/* أسطرُ الكتابة ونقطُها: طبقةٌ متجهة (svg يبنيها المحرك بقدر المنطقة) لا تدرّجٌ متكرر —
   التدرّج المتكرر يُرمَّز في PDF «تظليلاً» من نوع ShadingType-1 يُرى في كثيرٍ من القرّاء
   (ومنها قارئ البرنامج) شكلاً خاطئاً أو لا يُرى، والمتجه يُرى حيثما فُتح الكتاب وطُبع */
.mc-rows { position: absolute; inset: 0; display: block; pointer-events: none; color: var(--mc); }
.mc-hints { position: relative; z-index: 1; }
/* رؤوس المسائل: على سطور الكتابة نفسها، وبين كلٍّ والتي بعدها سطورٌ فارغة */
.mc-hints { margin: 0; padding: 0; list-style: none; counter-reset: mh; font-size: 0.74em; line-height: var(--ml); color: color-mix(in srgb, ${S.textColor} 52%, transparent); }
.mc-hints > li { counter-increment: mh; margin-bottom: calc(var(--ml) * var(--hk, 2)); padding-inline-start: 1.6em; text-indent: -1.6em; }
.mc-hints > li::before { content: counter(mh, arabic-indic) '- '; color: color-mix(in srgb, var(--mlc) 75%, transparent); font-weight: 700; }
.page.mcom .rh { visibility: hidden; }
/* الهامش بجانب المتن: المتن أضيق بقدره، والهامش عمودٌ بطول الصفحة */
.page.mside .flow { width: calc(100% - var(--msw)); }
.page.mside-right .flow { margin-left: var(--msw); }
.page.mside-left .flow { margin-right: var(--msw); }
.page.mside-right .notes { left: var(--msw); }
.page.mside-left .notes { right: var(--msw); }
.mc-side { position: absolute; top: 0; bottom: 0; width: calc(var(--msw) - 5mm); display: flex; flex-direction: column; }
.mside-right .mc-side { left: 0; padding-right: 0; }
.mside-left .mc-side { right: 0; }
.mside-right .mc-side::after, .mside-left .mc-side::after { content: ''; position: absolute; top: 0; bottom: 0; border-inline-start: 0.6pt solid color-mix(in srgb, ${S.ruleColor} 70%, transparent); }
.mside-right .mc-side::after { right: -2.5mm; }
.mside-left .mc-side::after { left: -2.5mm; }
.mc-side .mc-label > span { font-size: ${Math.max(10, LS * 0.8).toFixed(1)}pt; }
.mc-side .mc-area { flex: 1; }
/* أرقام الأبيات: خانة على يمين البيت (رقمه في المنظومة، والعدّ المتسلسل)، أو بين الشطرين */
.verse.vside { position: relative; }
.verse.vside-1 { padding-inline-start: var(--vnw); }
.verse.vside-2 { padding-inline-start: calc(2 * var(--vnw)); }
.verse > .vno { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; width: var(--vnw); display: flex; align-items: center; justify-content: center;
  font-size: 0.7em; font-weight: 700; color: ${hc[2] || S.ornamentColor}; border-inline-end: 0.5pt solid color-mix(in srgb, ${S.ruleColor} 55%, transparent); white-space: nowrap; }
.verse > .vno1 { inset-inline-start: var(--vnw); font-weight: 400; }
.verse.vmid-on { grid-template-columns: 1fr auto 1fr; column-gap: 3mm; }
.verse > .vsep.vmid { color: ${hc[2] || S.ornamentColor}; font-size: 0.7em; font-weight: 700; min-width: 2.2em; text-align: center; text-align-last: center; word-spacing: 0; }`;
}

/** قواعد خطوط أنواع النص (ما لم يُختر له خطٌّ يبقى على خط الكتاب أو العناوين) */
function roleFonts(S, FALLBACK) {
  const f = S.fonts || {};
  const fam = (k, base) => `font-family: '${f[k]}', '${base}', ${FALLBACK};`;
  const out = [];
  if (f.verse) out.push(`.verse > .hm, .fnv > .hm { ${fam('verse', f.body)} }`);
  if (f.matn) out.push(`.m, .mq, .qm, .sn, .p.mt, .verse.mt > .hm, .notes.sh .fn.k-sharh .fnn { ${fam('matn', f.body)} }`);
  if (f.quran) out.push(`.q, .p.mt.ay { ${fam('quran', f.body)} }`);
  if (f.h1) out.push(`.h1, .toc-title { ${fam('h1', f.heading)} }`);
  if (f.h2) out.push(`.h2 { ${fam('h2', f.heading)} }`);
  if (f.h3) out.push(`.h3, .h4 { ${fam('h3', f.heading)} }`);
  return out.join('\n');
}

/**
 * نظام العناوين المعتمد (headScheme: 'pro')، يعلو مقاسات الأسلوب ومسافاته ومحاذاته (ويبقى له خطه وألوانه):
 *   الجزء/الباب  Bold 36/44 وسط، نزول ٦٠ مم، في صفحةٍ فردية وحده والزوجية بعده بيضاء
 *   الفصل        Bold 28/36 وسط، نزول ٣٢ مم وبعده ٨ مم، يبدأ صفحةً فردية
 *   المبحث       Bold 20/28 يمين، قبله ٩ مم وبعده ٣ مم، ومعه ثلاثة أسطر مما بعده
 *   المطلب       Bold 17/24 يمين، قبله ٦ مم وبعده ٢ مم، ومعه سطران
 *   الفرع والمسألة: عريض المتن في أول فقرته بعده «:» (عنوانٌ داخل السطر)
 * (والصفحات في typeset/engine.js)
 */
function headSchemeCss(S, hc) {
  return `#book .h.hs-part, #book .h.hs-ch, #book .h.hs-h2, #book .h.hs-h3 { font-weight: 700; text-indent: 0; padding: 0; border: 0; background: none; }
#book .h.hs-part::before, #book .h.hs-part::after, #book .h.hs-ch::before, #book .h.hs-ch::after, #book .h.hs-h2::before, #book .h.hs-h2::after, #book .h.hs-h3::before, #book .h.hs-h3::after { display: none; }
/* النزول في أعلى الصفحة: حشوةٌ لا هامش (هامش أول ما في الصفحة يُلغى) */
#book .h.hs-part { font-size: 36pt; line-height: 44pt; text-align: center; margin: 0; padding-top: 60mm; color: ${hc[1]}; }
#book .h.hs-ch { font-size: 28pt; line-height: 36pt; text-align: center; margin: 0 0 8mm; padding-top: 32mm; color: ${hc[2] || hc[1]}; }
/* (المتون: لا يبدأ الجزء ولا الفصل صفحةً، فلا نزول في وسطها) */
#book .h.hs-part:not(:first-child), #book .h.hs-ch:not(:first-child) { padding-top: 0; margin-top: 12mm; margin-bottom: 6mm; }
/* (في مجرى النص بلا نزول: لوحات المعاينة) */
#book .h.hs-part.hs-flow, #book .h.hs-ch.hs-flow { padding-top: 0; margin-top: 4mm; margin-bottom: 6mm; }
#book .h.hs-h2 { font-size: 20pt; line-height: 28pt; text-align: right; margin: 9mm 0 3mm; color: ${hc[3] || hc[2]}; }
#book .h.hs-h3 { font-size: 17pt; line-height: 24pt; text-align: right; margin: 6mm 0 2mm; color: ${hc[4] || hc[3]}; }
#book .h.hs-part > *, #book .h.hs-ch > *, #book .h.hs-h2 > *, #book .h.hs-h3 > * { font-size: inherit; line-height: inherit; }
/* المبحث والمطلب في أعلى الصفحة: بلا مسافةٍ قبله */
#book .flow > .h.hs-h2:first-child, #book .flow > .h.hs-h3:first-child { margin-top: 0; }
/* صفحة الجزء: بلا ترويسةٍ ولا رقم */
#book .page.hs-partpg .rh, #book .page.hs-partpg .folio { visibility: hidden; }
#book .p .ht { font-weight: 700; color: inherit; }`;
}
