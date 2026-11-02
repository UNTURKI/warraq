// كاتب Word (DOCX / OOXML) أصلي: حواشٍ سفلية حقيقية في footnotes.xml مع w:footnoteReference،
// اتجاه من اليمين لليسار، أنماط عناوين قابلة للتحرير، فهرس حقلي (TOC) وترقيم صفحات بالأرقام المشرقية.
import zlib from 'node:zlib';
import { makeZip } from '../shared/zip.js';
import { getBasmala } from './basmala.js';
import { cleanPrint } from './print.js';
import { resolvePrint } from './styles.js';
import { tintPng } from './png-tint.js';
import { escapeXml as x, toArabicDigits as ar } from '../shared/arabic.js';
import { docxFontName, NAMES_FONT, PAPER } from '../shared/presets.js';
import { sidePart } from '../shared/edits.js';
import { pageGeom } from '../shared/margin.js';

const tw = (mm) => Math.round(mm * 56.6929);
const hp = (pt) => Math.round(pt * 2);
/** نظام العناوين المعتمد في Word (المقاس/السطر بالنقطة، والمسافات بالمليمتر) — كما في lib/book-html.js */
const HS_DOCX = {
  part: { pt: 36, line: 44, jc: 'center', before: 60, after: 0, page: true },
  ch: { pt: 28, line: 36, jc: 'center', before: 32, after: 8, page: true },
  h2: { pt: 20, line: 28, jc: 'both', before: 9, after: 3 },
  h3: { pt: 17, line: 24, jc: 'both', before: 6, after: 2 },
};
const col = (c) => String(c || '#000000').replace('#', '').toUpperCase();

const NS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" mc:Ignorable="w14"';

/** الغلاف الخارجي: data URL لصورة PNG أو JPEG ← { ext, data } */
function outerImage(v) {
  const m = typeof v === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  return m ? { ext: m[1] === 'png' ? 'png' : 'jpeg', data: Buffer.from(m[2], 'base64') } : null;
}

const BR = { '()': ['(', ')'], '«»': ['«', '»'], '[]': ['[', ']'], '{}': ['{', '}'], none: ['', ''] };

/**
 * الأقزم في Word: Word يقسم الأسطر بنفسه فلا يُعرف آخر سطر، فتُربط الكلمتان الأخيرتان (مسافةٌ لا تنكسر)
 * إن كانت الأخيرة قصيرة (سبعة أحرف فأقل) والفقرة طويلة (ست كلماتٍ فأكثر): فلا تبقى وحدها في آخر الفقرة.
 */
export function bindLastWords(xml) {
  const ts = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)];
  const all = ts.map((m) => m[1]).join('');
  const words = all.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 6) return xml;
  const lastWord = words[words.length - 1].replace(/[^\p{L}\p{N}]/gu, '');
  if (!lastWord || lastWord.length > 7) return xml;
  // آخر مسافةٍ قبل آخر كلمة (من آخر النص)
  let seen = false;
  for (let k = ts.length - 1; k >= 0; k--) {
    const t = ts[k][1];
    for (let i = t.length - 1; i >= 0; i--) {
      if (/[\p{L}\p{N}]/u.test(t[i])) seen = true;
      else if (seen && t[i] === ' ') {
        const m = ts[k];
        const neu = m[0].replace('>' + t + '<', '>' + t.slice(0, i) + '\u00a0' + t.slice(i + 1) + '<');
        return xml.slice(0, m.index) + neu + xml.slice(m.index + m[0].length);
      }
    }
  }
  return xml;
}

function run(text, props = '') {
  if (!text) return '';
  return `<w:r><w:rPr>${props}<w:rtl/></w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
}

export function buildDocx({ doc, settings: S, cover, layout, print = null }) {
  // الأرمل واليتيم: «التحكم في الأسطر الأرملة واليتيمة» في Word (سطران على الأقل من الفقرة في كل صفحة)؛ والأقزم: bindLastWords
  const WIDOW = S.widowOrphan !== false ? '<w:widowControl/>' : '<w:widowControl w:val="0"/>';
  const RUNTS = S.runts !== false;
  // البحث العلمي (قالب research): أنماط فقراته بأدوارها
  const RESEARCH = S.template === 'research' || !!(doc && doc.research);
  const researchStyle = (role) => {
    const r = String(role || '').split(/\s+/);
    if (r.includes('en')) return 'ResEn';
    if (r.includes('kw')) return r.includes('abs') ? 'ResKeywordsAbs' : 'ResKeywords';
    if (r.includes('refh')) return 'ResRefHead';
    if (r.includes('ref')) return 'ResRef';
    if (r.includes('abs')) return 'ResAbstract';
    return '';
  };
  // النسخة الجاهزة للطباعة: إعدادها (تسلسل الصفحات قبل الكتاب وبعده، العنوان المختصر، البسملة، الترقيم، هامش التجليد)
  const PR = S.printReady ? (print && !S.printPreset ? cleanPrint(print) : resolvePrint(S)) : null;
  const wantsBsm = !!PR && [...PR.front, ...PR.back].some((it) => it.type === 'basmala');
  // صورة البسملة المختارة من مكتبة الموقع، ملوّنةً باللون المختار
  const bsmSrc = wantsBsm ? getBasmala(S.basmalaId) : null;
  const bsmHex = S.basmalaColor || (PR && PR.basmala.color) || (S.headingColors || {})[1] || '#000000';
  const bsmPng = bsmSrc ? tintPng(Buffer.from(bsmSrc.src.split(',')[1], 'base64'), bsmHex) : null;
  const G = PR ? PR.gutterMm : 0; // هامش التجليد
  // الهامش الخارجي الواسع: هامشان متقابلان (mirrorMargins) — الخارجي في طرف الكتاب والداخلي عند الكعب
  const GM = pageGeom(S);
  const media = []; // صور صفحات الطباعة: { rid, file, ext, data }
  // خلفيات الصفحات (صورٌ تملأ الصفحة خلف نصها): رأسُ صفحةٍ فيه الصورة خلف النص، لكل نوعٍ رأسه
  //   body صفحات المتن والشرح · h1 الصفحة التي يبدأ بها الباب (أول صفحة في قسمه) · toc الفهرس (قسمٌ وحده)
  const BGH = {};
  for (const k of ['body', 'h1', 'toc']) {
    const im = outerImage(S.bgs && S.bgs[k]);
    if (im) BGH[k] = { rid: 'rIdHdrBg' + k, file: `header-bg-${k}.xml`, img: `bg-${k}.${im.ext}`, ext: im.ext, data: im.data };
  }
  const F = S.docxFont || docxFontName(S.fonts.body);
  const FH = S.docxFont || docxFontName(S.fonts.heading);
  const FC = S.docxFont || docxFontName(S.fonts.cover);
  const FN = docxFontName(S.fonts.names || NAMES_FONT); // اسم المؤلف والمحقق
  // خطٌّ لكل نوعٍ من النص (ما لم يُختر خطٌّ واحد لملف Word كله)
  const RF = (k) => (!S.docxFont && S.fonts[k] ? docxFontName(S.fonts[k]) : '');
  const poems = (layout && layout.poems) || {};
  const VLAYOUT = S.verseLayout === 'stack' || S.verseLayout === 'stagger' ? S.verseLayout : 'line';
  const VSEP = VLAYOUT !== 'line' ? '' : S.verseSep === 'one' ? S.verseSepSymbol || '✽' : S.verseSep === 'three' ? [1, 2, 3].map(() => S.verseSepSymbol || '✽').join(' ') : '';

  /* أشطر القصيدة: جدول بلا حدود بعمودين متساويين، وكل شطر بمحاذاة «موزّعة» (distribute)
     فيمتد الشطر القصير ليحاذي الأطول تماماً كما في PDF */
  // وضعٌ لقصيدةٍ بعينها (من «المحرِّر») يعلو وضع الأسلوب
  const own = (st) => !!(st && (st.vl || st.vs));
  const layoutOf = (st) => (own(st) && ['line', 'stack', 'stagger'].includes(st.vl) ? st.vl : VLAYOUT);
  const sepOf = (st) => {
    if (!own(st)) return VSEP;
    if (layoutOf(st) !== 'line') return '';
    const vs = st.vs || S.verseSep;
    const sym = S.verseSepSymbol || '✽';
    return vs === 'one' ? sym : vs === 'three' ? [sym, sym, sym].join(' ') : '';
  };
  /** شطرٌ بآياته (vq على صف البيت): ما كان آيةً منه بلون الآيات */
  const hx = (r, i, rp) => {
    const t = String(r[i] || '');
    const qs = (Array.isArray(r.vq) ? r.vq : []).filter((q) => q[0] === i && q[2] > q[1]).sort((a, b) => a[1] - b[1]);
    if (!qs.length) return run(t, rp);
    const qp = rp.replace(/<w:color [^>]*\/>/, '') + `<w:color w:val="${col(S.quranColor)}"/>`;
    let out = '';
    let p = 0;
    for (const [, a, z] of qs) {
      if (a > p) out += run(t.slice(p, a), rp);
      out += run(t.slice(Math.max(a, p), z), qp);
      p = Math.max(p, z);
    }
    if (p < t.length) out += run(t.slice(p), rp);
    return out;
  };
  const verseTable = (rows, key, availTw, gapMm, sizePt, st = null) => {
    const VL = layoutOf(st);
    const SEP = sepOf(st);
    const info = poems[key];
    const gap = tw(SEP ? (SEP.length > 2 ? 16 : 9) : gapMm);
    const colMax = VL === 'stack' ? Math.floor(availTw * 0.485) : VL === 'stagger' ? Math.floor(availTw * 0.6) : Math.floor((availTw - gap) / 2);
    let w;
    if (info && info.widthMm) w = Math.min(colMax, tw(info.widthMm));
    else {
      // تقدير عند غياب القياس: طول أطول شطر بالحروف
      const len = Math.max(...rows.flat().map((t) => t.replace(/[\u064B-\u065F\u0670\u0640]/g, '').length));
      w = Math.min(colMax, Math.max(Math.round(colMax * 0.8), Math.round(len * sizePt * 20 * 0.5)));
    }
    const size = hp(sizePt * ((info && info.scale) || 1));
    const rp = (RF('verse') ? `<w:rFonts w:ascii="${x(RF('verse'))}" w:hAnsi="${x(RF('verse'))}" w:cs="${x(RF('verse'))}" w:eastAsia="${x(RF('verse'))}"/>` : '') + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` + (S.verseColor ? `<w:color w:val="${col(S.verseColor)}"/>` : '');
    const sepCell = (cw) =>
      `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:pStyle w:val="Verse"/><w:jc w:val="center"/></w:pPr>${SEP ? run(SEP, `<w:color w:val="${col(S.ornamentColor)}"/><w:sz w:val="${Math.round(size * 0.8)}"/><w:szCs w:val="${Math.round(size * 0.8)}"/>`) : ''}</w:p></w:tc>`;
    const cell = (t, cw, inner) =>
      `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>` +
      `<w:p><w:pPr><w:pStyle w:val="Verse"/><w:jc w:val="${t ? 'distribute' : 'center'}"/></w:pPr>${t ? inner || run(t, rp) : ''}</w:p></w:tc>`;
    const none = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="nil"/>`).join('');
    const tblHead = (total, cols) =>
      `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>` +
      `<w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>` +
      `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>` +
      `<w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>`;
    const tr = (cells) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`;
    if (VL === 'stack') {
      // الشطر الأول في يمين سطره، والثاني في يسار السطر الذي بعده: عمودان بينهما فرجة، وكل شطر في عموده
      const mid = Math.max(availTw - 2 * w, 1);
      return tblHead(2 * w + mid, [w, mid, w]) + rows.map((r) => tr(cell(r[0], w, hx(r, 0, rp)) + cell('', mid) + cell('', w)) + tr(cell('', w) + cell('', mid) + cell(r[1], w, hx(r, 1, rp)))).join('') + `</w:tbl>`;
    }
    if (VL === 'stagger') {
      // الشطر الثاني في السطر التالي ويبدأ قبل نهاية الأول: ثلاثة أعمدة [طرف، تداخل، طرف]، وكل شطر يملأ عمودين
      const block = Math.min(availTw, info && info.blockMm ? tw(info.blockMm) : Math.round(w * 1.74));
      const side = Math.max(block - w, 1);
      const mid = Math.max(w - side, 1);
      const span = (t, inner) =>
        `<w:tc><w:tcPr><w:tcW w:w="${side + mid}" w:type="dxa"/><w:gridSpan w:val="2"/><w:vAlign w:val="bottom"/></w:tcPr>` +
        `<w:p><w:pPr><w:pStyle w:val="Verse"/><w:jc w:val="${t ? 'distribute' : 'center'}"/></w:pPr>${t ? inner || run(t, rp) : ''}</w:p></w:tc>`;
      return tblHead(side * 2 + mid, [side, mid, side]) + rows.map((r) => tr(span(r[0], hx(r, 0, rp)) + cell('', side)) + tr(cell('', side) + span(r[1], hx(r, 1, rp)))).join('') + `</w:tbl>`;
    }
    return (
      `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${2 * w + gap}" w:type="dxa"/><w:jc w:val="center"/>` +
      `<w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>` +
      `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>` +
      `<w:tblGrid><w:gridCol w:w="${w}"/><w:gridCol w:w="${gap}"/><w:gridCol w:w="${w}"/></w:tblGrid>` +
      rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(r[0], w, hx(r, 0, rp))}${sepCell(gap)}${cell(r[1], w, hx(r, 1, rp))}</w:tr>`).join('') +
      `</w:tbl>`
    );
  };
  /** المتون: جدول الشعر بأرقام الأبيات — خاناتٌ على يمين البيت (رقمه في المنظومة، والعدّ)، والرقم بين الشطرين */
  const numberedVerseTable = (rows, key, availTw, gapMm, sizePt, st = null) => {
    const nSide = Math.max(0, ...rows.map((r) => (r.vno && r.vno.side ? r.vno.side.length : 0)));
    const VL = layoutOf(st);
    const AR = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
    if (VL !== 'line' || sepOf(st)) {
      // السلّمي ونحوه: الأرقام قبل الشطر الأول
      return verseTable(
        rows.map((r) => {
          if (!r.vno) return r;
          const pre = [...(r.vno.side || []), ...(r.vno.mid != null ? [r.vno.mid] : [])].map((n) => '(' + AR(n) + ')').join(' ') + ' ';
          const vq = (r.vq || []).map((q) => (q[0] === 0 ? [0, q[1] + pre.length, q[2] + pre.length] : q));
          return Object.assign([pre + r[0], r[1]], vq.length ? { vq } : {});
        }),
        key, availTw, gapMm, sizePt, st,
      );
    }
    const numW = Math.round(sizePt * 20 * 2.4 * 0.7);
    const avail = availTw - nSide * numW;
    const info = poems[key];
    const gap = tw(gapMm);
    const colMax = Math.floor((avail - gap) / 2);
    const len = Math.max(...rows.flat().map((t) => String(t).replace(/[\u064B-\u065F\u0670\u0640]/g, '').length));
    const w = info && info.widthMm ? Math.min(colMax, tw(info.widthMm)) : Math.min(colMax, Math.max(Math.round(colMax * 0.8), Math.round(len * sizePt * 20 * 0.5)));
    const size = hp(sizePt * ((info && info.scale) || 1));
    const rp = (RF('verse') ? fontProps(RF('verse')) : '') + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` + (S.verseColor ? `<w:color w:val="${col(S.verseColor)}"/>` : '');
    const np = `<w:b/><w:bCs/><w:color w:val="${col(hc[2] || S.ornamentColor)}"/><w:sz w:val="${Math.round(size * 0.7)}"/><w:szCs w:val="${Math.round(size * 0.7)}"/>`;
    const tc = (inner, cw, jc, va = 'bottom') => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/><w:vAlign w:val="${va}"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Verse"/><w:jc w:val="${jc}"/></w:pPr>${inner}</w:p></w:tc>`;
    const none = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="nil"/>`).join('');
    const cols = [...Array(nSide).fill(numW), w, gap, w];
    const total = cols.reduce((a, c) => a + c, 0);
    return (
      `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>` +
      rows
        .map((r) => {
          const v = r.vno || {};
          const side = Array.from({ length: nSide }, (_, i) => tc(v.side && v.side[i] != null ? run(AR(v.side[i]), np) : '', numW, 'center', 'center')).join('');
          return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${side}${tc(r[0] ? hx(r, 0, rp) : '', w, r[0] ? 'distribute' : 'center')}${tc(v.mid != null ? run(AR(v.mid), np) : '', gap, 'center', 'center')}${tc(r[1] ? hx(r, 1, rp) : '', w, r[1] ? 'distribute' : 'center')}</w:tr>`;
        })
        .join('') +
      `</w:tbl>`
    );
  };
  const sz = S.sizes;
  const P = S.page;
  const hc = S.headingColors;
  const textW = tw(GM.text - G);
  const fontProps = (f) => `<w:rFonts w:ascii="${x(f)}" w:hAnsi="${x(f)}" w:cs="${x(f)}" w:eastAsia="${x(f)}"/>`;
  const [bo, bc] = BR[S.matnBrackets] || BR['()'];
  const roleFont = (k) => (RF(k) ? fontProps(RF(k)) : '');
  const matnProps = `${roleFont('matn')}${S.matnBold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${col(S.matnColor)}"/>`;
  const quranProps = `${roleFont('quran')}<w:color w:val="${col(S.quranColor)}"/>`;
  // الآية أكبر من النص حولها بنقطةٍ واحدة، وعزوها بعدها أصغر منه
  const szAt = (pt) => `<w:sz w:val="${hp(pt)}"/><w:szCs w:val="${hp(pt)}"/>`;
  const qSize = (inNote) => szAt((inNote ? sz.note : sz.body) + 1);
  const refSize = (inNote) => szAt((inNote ? sz.note : sz.body) * 0.8);
  const verseFont = roleFont('verse');
  const headingPages = (layout && layout.headingPages) || {};
  // أرقام Word: «عربية» 1، 2، 3 (افتراضي) أو «هندية» ١، ٢، ٣
  // أرقام الصفحات والحواشي في Word عربية (1، 2، 3)؛ وWord يعرضها حسب إعداداته العربية
  const NUMFMT = 'decimal';
  const num = (n) => String(n);
  // تباعد الأسطر في Word (افتراضي 1.0)
  // والمتون: تباعد سطور المتن المختار
  const DL = doc && doc.mutun && Number(doc.mutun.lead) > 0 ? Number(doc.mutun.lead) : Number(S.docxLineSpacing) || 1;

  /* --------------------------------------------------- الحواشي */
  const footnoteXml = [];
  const noteIds = new Map(); // noteKey → w:id
  let nextFn = 1;
  const refRuns = (key) => {
    let id = noteIds.get(key);
    if (!id) {
      id = nextFn++;
      noteIds.set(key, id);
      footnoteXml.push(footnoteBody(id, doc.notes[key]));
    }
    const rp = '<w:rStyle w:val="FootnoteReference"/>';
    return (
      `<w:r><w:rPr>${rp}<w:rtl/></w:rPr><w:t>(</w:t></w:r>` +
      `<w:r><w:rPr>${rp}<w:rtl/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>` +
      `<w:r><w:rPr>${rp}<w:rtl/></w:rPr><w:t>)</w:t></w:r>`
    );
  };

  let inlineBm = 100000;
  // تنسيق كلمةٍ بعينها (من المحرِّر): يُضم إلى خصائص المقطع بترتيب Word (بلا تكرار)
  // ترتيب خصائص الحرف كما يطلبه Word
  const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'strike', 'color', 'position', 'sz', 'szCs', 'u', 'shd', 'vertAlign'];
  const HEX6 = /^#[0-9a-f]{6}$/i;
  const mergeRpr = (props, st, inNote, base) => {
    const tags = new Map();
    for (const m of String(props || '').matchAll(/<w:(\w+)(?:\s[^>]*)?\/>/g)) tags.set(m[1], m[0]);
    const pt = base || (inNote ? sz.note : sz.body);
    const k = st.size > 0 ? Math.min(4, Math.max(0.3, st.size)) : 1;
    if (st.font) tags.set('rFonts', fontProps(String(st.font).slice(0, 80)));
    if (st.bold) tags.set('b', '<w:b/>').set('bCs', '<w:bCs/>');
    if (st.it) tags.set('i', '<w:i/>').set('iCs', '<w:iCs/>');
    if (st.sk) tags.set('strike', '<w:strike/>');
    if (HEX6.test(st.color || '')) tags.set('color', `<w:color w:val="${col(st.color)}"/>`);
    if (k !== 1) {
      const v = hp(pt * k);
      tags.set('sz', `<w:sz w:val="${v}"/>`).set('szCs', `<w:szCs w:val="${v}"/>`);
    }
    if (st.ul) tags.set('u', '<w:u w:val="single"/>');
    if (HEX6.test(st.bg || '')) tags.set('shd', `<w:shd w:val="clear" w:color="auto" w:fill="${col(st.bg)}"/>`);
    if (st.va === 'sup' || st.va === 'sub') tags.set('vertAlign', `<w:vertAlign w:val="${st.va === 'sup' ? 'superscript' : 'subscript'}"/>`);
    else if (Number(st.up)) tags.set('position', `<w:position w:val="${Math.round((Number(st.up) / 100) * pt * k * 2)}"/>`);
    return [...tags.entries()].sort((a, b) => (RPR_ORDER.indexOf(a[0]) + 99) % 99 - (RPR_ORDER.indexOf(b[0]) + 99) % 99).map((x) => x[1]).join('');
  };
  function inlineRunsXml(runs, inNote = false) {
    let out = '';
    let prevK = null;
    runs.forEach((r, i) => {
      if (r.k === 'r') {
        if (!inNote) out += refRuns(r.id);
        prevK = 'r';
        return;
      }
      let s = r.s;
      let piece = '';
      if (r.k === 'm') {
        const next = runs.slice(i + 1).find((y) => y.k !== 'r');
        const lead = s.match(/^\s*/)[0];
        const trail = s.match(/\s*$/)[0];
        let core = s.trim();
        if (prevK !== 'm') core = bo + core;
        if (!next || next.k !== 'm') core += bc;
        // آيةٌ داخل المتن المضمَّن: بلون القرآن، إلا إن اختير أن تكون بلون المتن
        piece = run(lead) + run(core, r.q && !S.quranInMatn ? quranProps + qSize(inNote) : matnProps) + run(trail);
      } else if (r.k === 'ht') {
        // عنوان داخل الجملة: عريض، مع إشارة مرجعية ليظهر في الفهرس
        const bid = inlineBm++;
        piece = inNote
          ? run(s, '<w:b/><w:bCs/>')
          : `<w:bookmarkStart w:id="${bid}" w:name="_Toc_${r.id}"/>` + run(s, '<w:b/><w:bCs/>') + `<w:bookmarkEnd w:id="${bid}"/>`;
      } else if (r.k === 'rs') piece = run(s, '<w:b/><w:bCs/><w:vertAlign w:val="superscript"/>');
      else if (r.k === 'sn') piece = run(s, `<w:b/><w:bCs/><w:color w:val="${col(S.matnColor)}"/>`);
      else if (r.k === 'kw') piece = run(s, `<w:b/><w:bCs/><w:color w:val="${col(hc[4] || hc[3])}"/>`);
      else if (r.k === 'qm') piece = run(s, `<w:b/><w:bCs/><w:color w:val="${col(S.quotedColor || S.matnColor)}"/>`);
      else if (r.k === 'f') {
        piece = run(s, (r.b ? '<w:b/><w:bCs/>' : '') + (/^#[0-9a-f]{6}$/i.test(r.c || '') ? `<w:color w:val="${col(r.c)}"/>` : '') + (r.u ? '<w:u w:val="single"/>' : ''));
        // خط الملف ومقاسه في كلماته («كما في الملف»)
        if (S.fileFmt && (r.ff || +r.fz)) piece = piece.replace(/<w:r><w:rPr>([\s\S]*?)<w:rtl\/><\/w:rPr>/g, (m, pr) => `<w:r><w:rPr>${mergeRpr(pr, { ...(r.ff ? { font: r.ff } : {}), ...(+r.fz ? { size: +r.fz } : {}) }, inNote)}<w:rtl/></w:rPr>`);
      }
      else if (r.k === 'q') piece = run(s, quranProps + qSize(inNote));
      else if (r.k === 'qref') piece = run(s, refSize(inNote));
      else if (r.k === 'h') piece = run(s, S.hadithBold ? '<w:b/><w:bCs/>' : '');
      else piece = run(s);
      // تنسيق كلمةٍ بعينها (من المحرِّر): يُضم إلى خصائص كل «run» من المقطع
      if (r.st && typeof r.st === 'object') piece = piece.replace(/<w:r><w:rPr>([\s\S]*?)<w:rtl\/><\/w:rPr>/g, (m, pr) => `<w:r><w:rPr>${mergeRpr(pr, r.st, inNote)}<w:rtl/></w:rPr>`);
      out += piece;
      prevK = r.k;
    });
    return out;
  }

  /** الآية في فقرة المتن بلون المتن (إن اختير ذلك) */
  function quranMatn(b) {
    if (!S.quranInMatn || !b.mt) return b.runs;
    return b.runs.map((r) => (r.k === 'q' ? { ...r, k: 'f', b: !!S.matnBold, c: S.matnColor } : r));
  }

  function footnoteBody(id, note) {
    const segs = (note && note.segs) || [];
    const sharh = note && note.kind === 'sharh';
    const noteKey = Object.keys(doc.notes).find((k) => doc.notes[k] === note) || '';
    const styleFirst = sharh ? 'SharhText' : 'FootnoteText';
    const numColor = sharh ? `<w:color w:val="${col(S.matnColor)}"/>` : '';
    const num =
      `<w:r><w:rPr><w:b/><w:bCs/>${numColor}<w:rtl/></w:rPr><w:t>(</w:t></w:r>` +
      `<w:r><w:rPr><w:rStyle w:val="FootnoteNumber"/>${numColor}<w:rtl/></w:rPr><w:footnoteRef/></w:r>` +
      `<w:r><w:rPr><w:b/><w:bCs/>${numColor}<w:rtl/></w:rPr><w:t>)</w:t></w:r>` +
      (sharh ? `<w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>` : `<w:r><w:rPr><w:rtl/></w:rPr><w:tab/></w:r>`);
    const parts = [];
    let i = 0;
    while (i < segs.length) {
      const seg = segs[i];
      if (seg.type === 'verse') {
        const rows = [];
        while (i < segs.length && segs[i].type === 'verse') rows.push(segs[i++].parts);
        if (!parts.length) parts.push(`<w:p><w:pPr><w:pStyle w:val="${styleFirst}"/></w:pPr>${num}</w:p>`);
        parts.push(verseTable(rows, 'n' + noteKey, textW - (sharh ? 0 : tw(8)), 5, sharh ? sz.body : sz.note));
        continue;
      }
      const first = parts.length === 0;
      let pPr;
      if (seg.sub) pPr = `<w:pPr><w:pStyle w:val="FootnoteText"/><w:ind w:left="0" w:hanging="0"/></w:pPr>`;
      else if (sharh) pPr = `<w:pPr><w:pStyle w:val="SharhText"/></w:pPr>`;
      else pPr = first ? `<w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr>` : `<w:pPr><w:pStyle w:val="FootnoteText"/><w:ind w:left="${tw(8)}" w:hanging="0"/></w:pPr>`;
      parts.push(`<w:p>${pPr}${first ? num : ''}${inlineRunsXml(seg.runs, true)}</w:p>`);
      i++;
    }
    // يجب أن تنتهي الحاشية بفقرة لا بجدول
    if (!parts.length || parts[parts.length - 1].startsWith('<w:tbl>'))
      parts.push(`<w:p><w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:line="120" w:lineRule="exact"/></w:pPr>${parts.length ? '' : num}</w:p>`);
    return `<w:footnote w:id="${id}">${parts.join('')}</w:footnote>`;
  }

  /* --------------------------------------------------- الغلاف والصفحة البيضاء */
  const body = [];
  const cp = (text, { size, bold = true, color = '3D2314', font = FH, before = 0, after = 0 } = {}) =>
    `<w:p><w:pPr><w:bidi/><w:spacing w:before="${before}" w:after="${after}" w:line="${Math.round(240 * 1.4)}" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr>${fontProps(font)}${bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${hp(size)}"/><w:szCs w:val="${hp(size)}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
  const c = cover || {};
  // الغلاف الخارجي: صفحة أولى بلا هوامش، والصورة خلف النص بحجم الصفحة كاملة
  const outer = outerImage(c.outerImage);
  // الغلاف الخلفي: آخر صفحة في الملف، بلا هوامش كالأمامي
  const backOuter = outerImage(c.backImage);
  const coverRun = (rid, id, file) => {
    const W = Math.round(P.w * 36000), H = Math.round(P.h * 36000);
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${W}" cy="${H}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${id === 9001 ? 'الغلاف الخارجي' : 'الغلاف الخلفي'}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${file}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  };
  if (outer) {
    body.push(
      `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>` +
        `<w:sectPr><w:pgSz w:w="${tw(P.w)}" w:h="${tw(P.h)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/></w:sectPr></w:pPr>` +
        coverRun('rIdOuter', 9001, 'outer-cover.' + outer.ext) + `</w:p>`,
    );
  }
  // أقسام ما قبل الكتاب وما بعده: كل صفحة قسم مستقل بلا رقم
  // (مع الهامشين المتقابلين: الأيسر والأيمن للصفحة الفردية، ويتبادلان في الزوجية. والفردية يسرى في الكتاب العربي: طرفها الخارجي يسار)
  const mL = GM.on && !GM.oddRight ? GM.outer : P.side;
  const mR = GM.on && GM.oddRight ? GM.outer : P.side;
  const marOf = (l, r) => `<w:pgMar w:top="${tw(P.top)}" w:right="${tw(r)}" w:bottom="${tw(P.bottom)}" w:left="${tw(l)}" w:header="${tw(BGH.body || BGH.toc ? 0 : 8)}" w:footer="${tw(P.wide && Number(P.footer) > 0 ? Number(P.footer) : 6.5)}" w:gutter="${tw(G)}"/>`;
  const pgMar = marOf(mL, mR);
  // صفحات ما قبل الكتاب والغلاف الداخلي: بلا الهامش الواسع
  const pgMarFront = marOf(P.side, P.side);
  // التجليد عند الكعب: يمين الفردية (وهي يسرى)، أو يسارها إن كانت الفردية يمنى
  const sectEnd = G && !GM.oddRight ? '<w:bidi/><w:rtlGutter/>' : '<w:bidi/>';
  const sectFront = (extra = '') =>
    `<w:sectPr>${extra}<w:type w:val="nextPage"/><w:pgSz w:w="${tw(P.w)}" w:h="${tw(P.h)}"/>${pgMarFront}<w:pgNumType w:fmt="${NUMFMT}" w:start="1"/>${sectEnd}</w:sectPr>`;
  const blankSect = `<w:p><w:pPr><w:bidi/><w:spacing w:after="0"/>${sectFront()}</w:pPr></w:p>`;
  const frameRun = (text, size, color, font, bold = true) =>
    `<w:r><w:rPr>${fontProps(font)}${bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${hp(size)}"/><w:szCs w:val="${hp(size)}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
  const framePara = (frame, jc, inner) =>
    `<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:before="0" w:after="0" w:line="${Math.round(240 * 1.4)}" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${inner}</w:p>`;
  let drawId = 9002;
  const inlinePic = (rid, name, cxMm, ratio) => {
    const cx = Math.round(cxMm * 36000);
    const cy = Math.round(cx * ratio);
    const id = drawId++;
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${x(name)}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${x(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  };
  const fullPagePic = (rid, name) => {
    const W = Math.round(P.w * 36000), H = Math.round(P.h * 36000);
    const id = drawId++;
    return (
      `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${W}" cy="${H}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${x(name)}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${x(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
    );
  };
  const textMm = GM.text - G;
  /** صورة (data URL) ← معرّف علاقتها في الملف؛ الصورة المكررة ملف واحد. Word لا يعرض WebP */
  const mediaIds = new Map();
  const mediaFor = (src) => {
    if (mediaIds.has(src)) return mediaIds.get(src);
    const m = /^data:image\/(png|jpeg|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(src || ''));
    let rid = '';
    if (m) {
      const n = media.length + 1;
      rid = 'rIdPrint' + n;
      media.push({ rid, file: `print-${n}.${m[1]}`, ext: m[1], data: Buffer.from(m[2], 'base64') });
    }
    mediaIds.set(src, rid);
    return rid;
  };
  /** صورة حرّة: وسطها عند (xMm, yMm) من الصفحة، خلف النص (أو أمامه: front) ولا تزيحه */
  const anchorPic = (rid, name, xMm, yMm, wMm, ratio, front = false) => {
    const cx = Math.round(wMm * 36000);
    const cy = Math.round(cx * ratio);
    const id = drawId++;
    return (
      `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${front ? 251659264 + id : id}" behindDoc="${front ? 0 : 1}" locked="0" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(xMm * 36000 - cx / 2)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(yMm * 36000 - cy / 2)}</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${x(name)}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${x(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
    );
  };
  /** محتوى صفحة من صفحات التسلسل (بلا فاصل القسم). الصفحة البيضاء لا محتوى لها. */
  const seqParas = (it) => {
    if (it.type === 'half') {
      // إطار مثبّت في زاويته من منطقة النص (يعمل في Word وغيره). في الفقرة العربية: end = اليسار، start = اليمين
      const h = PR.half;
      const F0 = { bl: ['left', 'bottom', 'end'], br: ['right', 'bottom', 'start'], tl: ['left', 'top', 'end'], tr: ['right', 'top', 'start'], c: ['center', 'center', 'center'] }[h.pos] || ['left', 'bottom', 'end'];
      const frame = `<w:framePr ${h.pos === 'c' ? `w:w="${textW}" ` : ''}w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="${F0[0]}" w:yAlign="${F0[1]}"/>`;
      const out = [framePara(frame, F0[2], frameRun(c.title || '', h.titlePt, col(h.color || hc[1]), FC))];
      if (h.showSub && c.subtitle) out.push(framePara(frame, F0[2], frameRun(c.subtitle, h.subPt, col(h.subColor || '#3D2314'), FH)));
      if (h.showAuthor && c.author) out.push(framePara(frame, F0[2], frameRun(c.author, h.subPt, col(h.subColor || '#3D2314'), FN)));
      return out;
    }
    if (it.type === 'basmala') {
      const b = PR.basmala;
      const wMm = Math.min((P.w * b.widthPct) / 100, textMm);
      let inner, hMm;
      if (bsmPng) {
        hMm = (wMm * bsmPng.h) / bsmPng.w;
        inner = inlinePic('rIdBasmala', 'البسملة', wMm, bsmPng.h / bsmPng.w);
      } else {
        const pt = Math.max(12, Math.round(wMm * 0.38));
        hMm = pt * 1.6 * 0.3528;
        inner = frameRun('بسم الله الرحمن الرحيم', pt, col(bsmHex), docxFontName('Aref Ruqaa'));
      }
      const y = Math.max(0, (P.h * b.yPct) / 100 - hMm / 2);
      const frame = `<w:framePr w:w="${textW}" w:wrap="around" w:vAnchor="page" w:hAnchor="margin" w:xAlign="center" w:y="${tw(y)}"/>`;
      return [`<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>${inner}</w:p>`];
    }
    if (it.type === 'text') {
      const yAlign = { top: 'top', middle: 'center', bottom: 'bottom' }[it.v] || 'center';
      const frame = `<w:framePr w:w="${textW}" w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="center" w:yAlign="${yAlign}"/>`;
      // فقرات، ولكل جزء من النص حجمه وخطه وكونه عريضاً ولونه
      const fontOf = (f) => ({ body: F, heading: FH, cover: FC, names: FN })[f] || (S.docxFont ? S.docxFont : docxFontName(f));
      const fill = (t) => String(t || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (c[k] == null || k === 'outerImage' || k === 'backImage' ? '' : String(c[k])));
      const JC = { start: 'start', end: 'end', justify: 'both', center: 'center' };
      const ls = Math.round(240 * (Number(it.lineHeight) || 1.75) * 0.8);
      // الصور الحرّة: مثبّتة في موضعها من الصفحة (في فقرة لا ارتفاع لها أول الصفحة)
      const anchors = (it.paras || [])
        .filter((p) => p.img && p.free && mediaFor(p.img.src))
        .map((p) => anchorPic(mediaFor(p.img.src), 'صورة', (P.w * p.free.xPct) / 100, (P.h * p.free.yPct) / 100, (P.w * p.widthPct) / 100, p.img.h / p.img.w, p.layer !== 'behind'));
      const out = anchors.length ? [`<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${anchors.join('')}</w:p>`] : [];
      for (const p of it.paras || []) {
        if (p.img) {
          if (p.free || !mediaFor(p.img.src)) continue;
          // صورة في سطرها بين الفقرات: بعرضها من عرض النص
          out.push(`<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:before="0" w:after="0"/><w:jc w:val="${JC[p.align] || 'center'}"/></w:pPr>${inlinePic(mediaFor(p.img.src), 'صورة', (textMm * p.widthPct) / 100, p.img.h / p.img.w)}</w:p>`);
          continue;
        }
        out.push(
          `<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:before="0" w:after="0" w:line="${ls}" w:lineRule="auto"/><w:jc w:val="${JC[p.align] || 'center'}"/></w:pPr>` +
            p.runs.map((r) => frameRun(fill(r.t) || ' ', r.sizePt, col(r.color || S.textColor), fontOf(r.font), r.b !== false)).join('') +
            `</w:p>`,
        );
      }
      return out;
    }
    if (it.type === 'image' && it.src) {
      const rid = mediaFor(it.src);
      if (!rid) return [];
      if (it.fit === 'page') return [`<w:p><w:pPr><w:bidi/><w:spacing w:after="0"/></w:pPr>${fullPagePic(rid, 'صورة الصفحة')}</w:p>`];
      const wMm = Math.min((P.w * it.widthPct) / 100, textMm);
      const hMm = (wMm * it.h) / it.w;
      const y = Math.max(0, (P.h * it.yPct) / 100 - hMm / 2);
      const frame = `<w:framePr w:w="${textW}" w:wrap="around" w:vAnchor="page" w:hAnchor="margin" w:xAlign="center" w:y="${tw(y)}"/>`;
      return [`<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>${inlinePic(rid, 'صورة الصفحة', wMm, it.h / it.w)}</w:p>`];
    }
    return [];
  };
  /** الغلاف الداخلي */
  const coverParas = () => {
    const out = [];
    // الفراغ فوق العنوان يضيق إن طال محتوى الغلاف (أسماء طويلة، أو نص أضيق بهامش التجليد)، فلا يفيض إلى صفحة ثانية
    // تقدير متحفظ: سطر الخط العربي أعلى من حجمه (نحو ١٫٢٥)، والخط البديل في جهاز القارئ قد يكون أعرض
    const lh = (pt) => pt * 0.3528 * 1.4 * 1.25;
    const lines = (text, pt) => Math.max(1, Math.ceil((String(text || '').length * pt * 0.3528 * 0.6) / textMm));
    let need = (c.volLabel ? 8 + lh(15) : 0) + lines(c.title, 34) * lh(34) + (c.subtitle ? 2 + lines(c.subtitle, 17) * lh(17) : 0) + 16 + lh(14);
    if (c.author) need += lh(13) + lines(c.author, 22) * lh(22) + (c.authorNote ? lh(12) : 0);
    if (c.editor) need += 7 + lh(13) + lines(c.editor, 18) * lh(18);
    for (const l of [c.edition, c.publisher].filter(Boolean)) need += lines(l, 11) * lh(11);
    if (S.mutun && S.mOwner && S.mOwner.on && Array.isArray(S.mOwner.fields)) need += S.mOwner.fields.length * (lh(13) + 4) + 6;
    const baseGap = c.volLabel ? 26 : 38;
    const titleGap = Math.round(Math.max(4, Math.min(baseGap, P.h - P.top - P.bottom - 6 - need)));
    if (c.volLabel) out.push(cp(c.volLabel, { size: 15, color: col(hc[1]), before: tw(8) }));
    out.push(cp(c.title || '', { size: 34, color: col(hc[1]), font: FC, before: tw(titleGap) }));
    if (c.subtitle) out.push(cp(c.subtitle, { size: 17, before: tw(2) }));
    out.push(cp(S.ornament, { size: 14, bold: false, color: col(S.ornamentColor), before: tw(8), after: tw(8) }));
    if (c.author) {
      out.push(cp('تأليف', { size: 13, bold: false, color: col(S.ornamentColor) }));
      out.push(cp(c.author, { size: 22, font: FN }));
      if (c.authorNote) out.push(cp(c.authorNote, { size: 12, bold: false }));
    }
    if (c.editor) {
      out.push(cp(c.editorLabel || 'تحقيق', { size: 13, bold: false, color: col(S.ornamentColor), before: tw(7) }));
      out.push(cp(c.editor, { size: 18, font: FN }));
    }
    const bottomLines = [c.edition, c.publisher].filter(Boolean);
    // المتون: خانات صاحب النسخة (الاسم، رقم الهاتف…) أسفل الغلاف، وبعد كلٍّ خطٌّ أو نقاط (حرف جدولةٍ بمِلء) أو فراغ
    const own = S.mutun && S.mOwner && S.mOwner.on && Array.isArray(S.mOwner.fields) ? S.mOwner.fields.filter((f) => f && f.t) : [];
    if (bottomLines.length || own.length) {
      // إطار مثبّت أسفل الصفحة: خانات صاحب النسخة، ثم رقم الطبعة والناشر
      const frame = `<w:framePr w:w="${textW}" w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="center" w:yAlign="bottom"/>`;
      const side = Math.round(textW * 0.11);
      const LEAD = { line: 'underscore', dots: 'dot', blank: 'none' };
      own.forEach((f, i) =>
        out.push(
          `<w:p><w:pPr>${frame}<w:tabs><w:tab w:val="end" w:leader="${LEAD[f.f] || 'dot'}" w:pos="${textW - 2 * side}"/></w:tabs><w:bidi/>` +
            `<w:spacing w:before="0" w:after="${i === own.length - 1 ? (bottomLines.length ? tw(6) : 0) : tw(4)}" w:line="${Math.round(240 * 1.4)}" w:lineRule="auto"/><w:ind w:left="${side}" w:right="${side}" w:firstLine="0"/><w:jc w:val="start"/></w:pPr>` +
            run(/[:：]$/.test(f.t) ? f.t : f.t + ':', `${fontProps(FH)}<w:b/><w:bCs/><w:color w:val="3D2314"/><w:sz w:val="26"/><w:szCs w:val="26"/>`) +
            `<w:r><w:rPr><w:color w:val="6C5949"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl/></w:rPr><w:tab/></w:r></w:p>`,
        ),
      );
      bottomLines.forEach((l) =>
        out.push(
          `<w:p><w:pPr>${frame}<w:bidi/><w:spacing w:after="0" w:line="${Math.round(240 * 1.4)}" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
            run(l, `<w:color w:val="4A3A2E"/><w:sz w:val="22"/><w:szCs w:val="22"/>`) + `</w:p>`,
        ),
      );
    }
    return out;
  };
  // نهاية قسم الغلاف (بلا رقم)
  const sectBare = (type) =>
    `<w:sectPr>${type ? `<w:type w:val="${type}"/>` : ''}<w:pgSz w:w="${tw(P.w)}" w:h="${tw(P.h)}"/>${pgMarFront}<w:pgNumType w:fmt="${NUMFMT}" w:start="1"/>${sectEnd}</w:sectPr>`;
  const coverEnd = (type) => `<w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="120" w:lineRule="exact"/>${sectBare(type)}</w:pPr></w:p>`;
  // innerCover=false: الغلاف الداخلي لا يُصنع (ملف Word جاء بصفحات عنوانه)
  const noInner = S.innerCover === false || !!doc.ownCover;
  if (PR) {
    // الجاهزة للطباعة: صفحات ما قبل الكتاب بالتسلسل الذي رتّبه المالك، كل صفحة قسم
    for (const it of PR.front) {
      if (it.type === 'cover') {
        if (!noInner) body.push(...coverParas(), coverEnd('nextPage'));
      } else body.push(...seqParas(it), blankSect);
    }
  } else if (!noInner) {
    // النسخة المعتادة: الغلاف الداخلي ثم الكتاب مباشرة
    body.push(...coverParas(), coverEnd(''));
  }

  /* --------------------------------------------------- الفهرس (حقل TOC أصلي) */
  const tocXml = [];
  if (S.tocPosition !== 'none' && doc.headings.length) {
    tocXml.push(
      `<w:p><w:pPr><w:pStyle w:val="TOCTitle"/></w:pPr>${run(S.tocTitle || doc.tocTitle || 'فهرس الموضوعات')}</w:p>`,
      `<w:p><w:pPr><w:pStyle w:val="TOCHead"/></w:pPr>${run('الموضوع')}<w:r><w:rPr><w:rtl/></w:rPr><w:tab/></w:r>${run('الصفحة')}</w:p>`,
    );
    doc.headings.forEach((h, i) => {
      const bm = '_Toc_' + h.id;
      const begin = i === 0
        ? `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-${Math.max(1, ...doc.headings.map((h) => Math.min(h.level, doc.fileToc ? 4 : 3)), 1)}" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`
        : '';
      const pg = headingPages[h.id] ? num(headingPages[h.id]) : '';
      tocXml.push(
        `<w:p><w:pPr><w:pStyle w:val="TOC${Math.min(h.level, 4)}"/></w:pPr>${begin}` +
          `<w:hyperlink w:anchor="${bm}" w:history="1">${run(h.text)}<w:r><w:rPr><w:rtl/></w:rPr><w:tab/></w:r>` +
          `<w:r><w:rPr><w:rtl/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:rtl/></w:rPr><w:instrText xml:space="preserve"> PAGEREF ${bm} \\h </w:instrText></w:r>` +
          `<w:r><w:rPr><w:rtl/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>${run(pg)}<w:r><w:rPr><w:rtl/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>` +
          (i === doc.headings.length - 1 ? `<w:r><w:fldChar w:fldCharType="end"/></w:r>` : '') +
          `</w:p>`,
      );
    });
  }

  /* --------------------------------------------------- المتن */
  // رقم أول صفحة في الكتاب: بعد الغلاف الداخلي مباشرة؛ وفي الجاهزة للطباعة بعد صفحات ما قبل الكتاب، أو من ١ إن اختير ذلك
  const firstNum = PR ? (PR.numbering === 'book' ? 1 : PR.front.length + (noInner ? 0 : 1)) : noInner ? 1 : 2;
  // أقسام الكتاب: قسم واحد في المعتاد؛ وصفحة غلاف من ملف Word في وسطه تقسمه (قسمها بلا رقم صفحة)، والترقيم متصل
  let bodySects = 0;
  let needFooter2 = false;
  // o.type: كيف يبدأ القسم (nextPage، أو evenPage/oddPage: في صفحةٍ زوجية أو فردية) · o.center: محتواه في وسط الصفحة
  // القسم الجاري يبدأ بباب: صفحته الأولى بخلفية الباب (إن اختيرت)
  let sectH1 = false;
  const bodySect = (footer = 'rIdFooter1', o = {}) => {
    if (footer !== 'rIdFooter1') needFooter2 = true;
    // خلفية الصفحات في رأسها (صفحات الكتاب، لا صفحات الغلاف)، وخلفية الفهرس لقسمه
    const bg = footer === 'rIdFooter1' ? (o.toc ? BGH.toc : BGH.body) : null;
    const h1 = footer === 'rIdFooter1' && !o.toc && sectH1 && BGH.h1;
    sectH1 = false;
    return (
      `<w:sectPr>${bg ? `<w:headerReference w:type="default" r:id="${bg.rid}"/>` : ''}${h1 ? `<w:headerReference w:type="first" r:id="${BGH.h1.rid}"/>` : ''}<w:footerReference w:type="default" r:id="${footer}"/>${h1 ? `<w:footerReference w:type="first" r:id="${footer}"/>` : ''}` +
      `<w:footnotePr><w:numFmt w:val="${NUMFMT}"/><w:numRestart w:val="eachPage"/></w:footnotePr>` +
      `<w:type w:val="${o.type || 'nextPage'}"/><w:pgSz w:w="${tw(P.w)}" w:h="${tw(P.h)}"/>${pgMar}` +
      `<w:pgNumType w:fmt="${NUMFMT}"${bodySects++ === 0 ? ` w:start="${firstNum}"` : ''}/>${o.center ? '<w:vAlign w:val="center"/>' : ''}${h1 ? '<w:titlePg/>' : ''}${sectEnd}</w:sectPr>`
    );
  };
  /** رأسٌ فيه صورة الخلفية خلف النص بمقاس الصفحة كله */
  const bgHeaderXml = (k) => {
    const W = Math.round(P.w * 36000);
    const H = Math.round(P.h * 36000);
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${NS}><w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>` +
      `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${W}" cy="${H}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${9500 + ['body', 'h1', 'toc'].indexOf(k)}" name="خلفية الصفحة"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${9500 + ['body', 'h1', 'toc'].indexOf(k)}" name="${BGH[k].img}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rIdBgImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>`
    );
  };
  // محاذاة المؤلف (ملف Word): في الفقرة العربية start = اليمين، end = اليسار
  const JCA = { c: 'center', l: 'end', r: 'start' };
  const jcOf = (b) => (JCA[b.al] ? `${b.al !== 'r' ? '<w:ind w:firstLine="0"/>' : ''}<w:jc w:val="${JCA[b.al]}"/>` : '');
  // تنسيق الفقرة من «المحرِّر»: الإطار، والتظليل، والتباعد، والمسافات البادئة، والمحاذاة (بترتيب Word)
  const mixWhite = (hex, a) => {
    const n = parseInt(String(hex || '#C5A059').slice(1), 16);
    const ch = (v) => Math.round(255 - (255 - v) * a).toString(16).padStart(2, '0');
    return (ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255)).toUpperCase();
  };
  const pprTail = (b) => {
    const ps = b.ps && typeof b.ps === 'object' ? b.ps : null;
    if (!ps) return jcOf(b);
    let out = '';
    const side = (v, z, c) => ['top', 'left', 'bottom', 'right'].map((d) => `<w:${d} w:val="${v}" w:sz="${z}" w:space="4" w:color="${c}"/>`).join('');
    if (ps.bx === 'box') out += `<w:pBdr>${side('single', 6, col(S.ruleColor))}</w:pBdr>`;
    else if (ps.bx === 'double') out += `<w:pBdr>${side('double', 6, col(hc[1]))}</w:pBdr>`;
    else if (ps.bx === 'side') out += `<w:pBdr><w:right w:val="single" w:sz="18" w:space="8" w:color="${col(hc[1])}"/></w:pBdr>`;
    if (ps.bx === 'shade') out += `<w:shd w:val="clear" w:color="auto" w:fill="${mixWhite(S.ornamentColor, 0.12)}"/>`;
    const sp = [];
    if (Number.isFinite(+ps.sb)) sp.push(`w:before="${Math.max(0, tw(+ps.sb))}"`);
    if (Number.isFinite(+ps.sa)) sp.push(`w:after="${Math.max(0, tw(+ps.sa))}"`);
    if (+ps.lh > 0) sp.push(`w:line="${Math.round((240 * DL * +ps.lh) / (Number(S.lineHeight) || 1.85))}" w:lineRule="auto"`);
    if (sp.length) out += `<w:spacing ${sp.join(' ')}/>`;
    const ind = [];
    // في الفقرة العربية: اليمين أولها واليسار آخرها
    if (+ps.is) ind.push(`w:right="${tw(+ps.is)}"`);
    if (+ps.ie) ind.push(`w:left="${tw(+ps.ie)}"`);
    if (Number.isFinite(+ps.ind) && ps.ind !== null && ps.ind !== '') ind.push(+ps.ind < 0 ? `w:hanging="${tw(-ps.ind)}"` : `w:firstLine="${tw(+ps.ind)}"`);
    else if (JCA[b.al] && b.al !== 'r') ind.push('w:firstLine="0"');
    if (ind.length) out += `<w:ind ${ind.join(' ')}/>`;
    if (JCA[b.al]) out += `<w:jc w:val="${JCA[b.al]}"/>`;
    return out;
  };
  /** جدول من ملف Word: جدول حقيقي بحدوده وخلاياه المدموجة واتجاهه */
  const dataTable = (b) => {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const n = Math.max(1, ...rows.map((r) => (r.cells || []).reduce((a, c) => a + (c.span > 1 ? c.span | 0 : 1), 0)));
    const pct = Array.isArray(b.cols) && b.cols.length === n ? b.cols : Array(n).fill(100 / n);
    const sum = pct.reduce((a, v) => a + (Number(v) || 0), 0) || 100;
    const grid = pct.map((v) => Math.max(200, Math.round((textW * (Number(v) || 0)) / sum)));
    const bd = (v) => ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} ${v}/>`).join('');
    const borders = b.borders ? bd(`w:val="single" w:sz="4" w:space="0" w:color="${col(S.ruleColor)}"`) : bd('w:val="nil"');
    const sizeT = hp(Math.max(sz.body - 1.5, 8));
    // خصائص نص الخلية: العريض، ولونها من الملف، وخطها ومقاسها في «كما في الملف»
    const cellRpr = (c, hdr) => {
      const base = `${c.b || hdr ? '<w:b/><w:bCs/>' : ''}${/^#[0-9a-f]{6}$/i.test(c.c || '') ? `<w:color w:val="${col(c.c)}"/>` : ''}<w:sz w:val="${sizeT}"/><w:szCs w:val="${sizeT}"/>`;
      // (مقاس الخلية في الملف نسبةً إلى خط الكتاب، لا إلى خط الجداول)
      return S.fileFmt && (c.ff || +c.fz) ? mergeRpr(base, { ...(c.ff ? { font: c.ff } : {}), ...(+c.fz ? { size: +c.fz } : {}) }, false) : base;
    };
    const cellP = (text, c, hdr) =>
      String(text || '')
        .split('\n')
        .map(
          (line) =>
            `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0" w:line="${Math.round(240 * Math.max(DL, 1))}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="${hdr && !c.al ? 'center' : c.al === 'j' ? 'distribute' : JCA[c.al] || 'start'}"/><w:rPr>${cellRpr(c, hdr)}</w:rPr></w:pPr>` +
            run(line, cellRpr(c, hdr)) + `</w:p>`,
        )
        .join('');
    const trs = rows
      .map((r) => {
        let ci = 0;
        const tcs = (r.cells || [])
          .map((c) => {
            const span = c.span > 1 ? c.span | 0 : 1;
            const w = grid.slice(ci, ci + span).reduce((a, v) => a + v, 0) || grid[grid.length - 1];
            ci += span;
            const shade = /^#[0-9a-f]{6}$/i.test(c.bg || '') ? col(c.bg) : r.hdr ? 'EFEFEF' : '';
            return (
              `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}` +
              `${c.rs > 1 ? '<w:vMerge w:val="restart"/>' : c.skip ? '<w:vMerge/>' : ''}${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}</w:tcPr>` +
              cellP(c.skip ? '' : c.t, c, !!r.hdr) + `</w:tc>`
            );
          })
          .join('');
        return `<w:tr><w:trPr><w:cantSplit/>${r.hdr ? '<w:tblHeader/>' : ''}</w:trPr>${tcs}</w:tr>`;
      })
      .join('');
    return (
      `<w:tbl><w:tblPr>${b.rtl ? '<w:bidiVisual/>' : ''}<w:tblW w:w="${grid.reduce((a, v) => a + v, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${trs}</w:tbl>` +
      // فقرة فاصلة بعد الجدول (جدولان متلاصقان يدمجهما Word)
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>`
    );
  };
  const content = [];
  const coverAt = new Set(); // مواضع فقرات صفحات الغلاف في المحتوى
  let startsWithSect = false; // أول المحتوى فاصل قسم (غلاف أول الكتاب بعد فهرس البداية)
  // صفحات الملف في أول الكتاب (غلافه، صفحات عنوانه وشعار الدار): مكانها قبل فهرس البداية لا بعده
  let leadOpen = true;
  let leadEnd = 0;
  const tocStart = S.tocPosition === 'start' && tocXml.length > 0;
  let lastIsCover = false; // آخر الكتاب صفحة غلاف: قسمها هو القسم الأخير
  const tocEnd = S.tocPosition !== 'start' && S.tocPosition !== 'none' && tocXml.length > 0;
  let bmId = 1;
  let firstContent = true;
  // المتون: أقسامٌ للأجزاء (المقابلة بجهة، أو التوسيط)، وموضع أول الجزء الجاري، وهل أُغلق قسمه
  let muSects = false;
  let muUnitAt = 0;
  let muClosed = false;
  let listN = 0;
  let listLs = '';
  // الهوامش الجانبية (من المحرِّر): إطارٌ في هامش الصفحة الأيمن أو الأيسر بإزاء القطعة (w:framePr)، بنصه المنسَّق؛
  // والمتبادل إطارٌ في الحافة الخارجية (الفردية يميناً) أو الداخلية (الفردية يساراً): يتبدّل بين الصفحات في Word نفسه
  const SIDE_JC = { r: 'start', l: 'end', c: 'center', j: 'both' };
  const sideLines = (runs) => {
    const lines = [[]];
    for (const r of runs) {
      String(r.s || '').split('\n').forEach((piece, j) => {
        if (j) lines.push([]);
        if (piece) lines[lines.length - 1].push({ ...r, s: piece });
      });
    }
    return lines;
  };
  const sideFrames = (b) => {
    const sd = b.side && typeof b.side === 'object' ? b.side : null;
    if (!sd) return [];
    const gap = 1.6;
    const w = Math.max(8, P.side - 2 * gap);
    // في الطرف الخارجي (المتبادل out): بعرض الهامش الخارجي (الواسع إن اختير)
    const wOut = Math.max(8, GM.outer - 2 * gap);
    // مقاس الهامش ولونه وخطه كما في الأسلوب (وإلا فمقاس الحواشي)
    const SN = S.sideNote && typeof S.sideNote === 'object' ? S.sideNote : {};
    const cs = hp(+SN.size > 0 ? +SN.size : sz.note);
    const szTags = `<w:sz w:val="${cs}"/><w:szCs w:val="${cs}"/>` + (/^#[0-9a-f]{6}$/i.test(SN.color || '') ? `<w:color w:val="${col(SN.color)}"/>` : '');
    // مقاس الحواشي لكل كلمةٍ لم يُخصَّ مقاسها
    const withSize = (xml) =>
      xml.replace(/<w:rPr>([\s\S]*?)<w:rtl\/><\/w:rPr>/g, (m, pr) => {
        if (/<w:sz /.test(pr)) return m;
        const at = pr.search(/<w:(?:u|shd|vertAlign)\b/);
        return '<w:rPr>' + (at < 0 ? pr + szTags : pr.slice(0, at) + szTags + pr.slice(at)) + '<w:rtl/></w:rPr>';
      });
    const out = [];
    for (const k of ['r', 'l', 'a']) {
      const part = sidePart(sd[k]);
      if (!part) continue;
      // حدود الهامش إن اختارها المستخدم (مم): العرض والارتفاع، والبعد عن أول القطعة، والبعد عن حافة الصفحة
      const bx = part.box || {};
      if ((k === 'a' && sd.alt === 'out' ? GM.outer : P.side) < 8 && !bx.w) continue;
      const fw = bx.w || w;
      const y = bx.dy != null ? Math.round(tw(bx.dy)) || 1 : 1;
      const hAttr = bx.h ? ` w:h="${tw(bx.h)}" w:hRule="atLeast"` : '';
      const lh = part.ps && +part.ps.lh >= 0.8 && +part.ps.lh <= 5 ? +part.ps.lh : 1.3;
      const jc = SIDE_JC[part.al] || SIDE_JC[SN.al] || 'center';
      let frame;
      let bd = '';
      if (k === 'a') {
        // Word: outside يمين الفردية ويسار الزوجية، و inside عكسه. والطرف الخارجي من الكتاب يسار الفردية (إلا إن كانت يمنى)
        const xa = sd.alt === 'out' ? (GM.oddRight ? 'outside' : 'inside') : sd.alt === 'ol' ? 'inside' : 'outside';
        frame = `<w:framePr w:w="${tw(bx.w ? fw : (sd.alt === 'out' ? wOut : w) + gap)}"${hAttr} w:hSpace="0" w:wrap="around" w:vAnchor="text" w:hAnchor="page" w:xAlign="${xa}" w:y="${y}"/>`;
      } else {
        // بُعده عن حافته (x)، وإلا ففي وسط الهامش
        const edge = bx.x != null ? bx.x : bx.w ? Math.max(0.5, (P.side - fw) / 2) : gap;
        const x = Math.max(0, k === 'r' ? P.w - edge - fw : edge);
        frame = `<w:framePr w:w="${tw(fw)}"${hAttr} w:hSpace="0" w:wrap="around" w:vAnchor="text" w:hAnchor="page" w:x="${tw(x)}" w:y="${y}"/>`;
        if (SN.rule !== false) bd = k === 'r' ? `<w:pBdr><w:left w:val="single" w:sz="4" w:space="3" w:color="${col(S.ruleColor)}"/></w:pBdr>` : `<w:pBdr><w:right w:val="single" w:sz="4" w:space="3" w:color="${col(S.ruleColor)}"/></w:pBdr>`;
      }
      // نص الهامش في خانة (sideNote.box): إطارٌ حوله بدل الخط الفاصل
      if (SN.box) {
        const e = (side) => `<w:${side} w:val="single" w:sz="5" w:space="2" w:color="${col(S.ruleColor)}"/>`;
        bd = `<w:pBdr>${e('top')}${e('left')}${e('bottom')}${e('right')}</w:pBdr>`;
      }
      const ind = k === 'a' ? `<w:ind w:left="${tw(gap)}" w:right="${tw(gap)}" w:firstLine="0"/>` : '<w:ind w:firstLine="0"/>';
      for (const line of sideLines(part.runs)) {
        let body = line.length ? withSize(inlineRunsXml(line, true)) : '';
        if (SN.font) body = body.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (m, pr) => (/<w:rFonts/.test(pr) ? m : `<w:rPr>${fontProps(String(SN.font).slice(0, 80))}${pr}</w:rPr>`));
        out.push(`<w:p><w:pPr><w:keepNext/>${frame}${bd}<w:bidi/><w:spacing w:before="0" w:after="0" w:line="${Math.round(240 * lh)}" w:lineRule="auto"/>${ind}<w:jc w:val="${jc}"/></w:pPr>${body}</w:p>`);
      }
    }
    return out;
  };
  // الفقرة من اليسار إلى اليمين (ترجمةٌ إلى لغةٍ لاتينية): بلا علامة العربية في فقرتها وكلماتها
  const ltrPara = (xml) => {
    const m = /^<w:p><w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml);
    if (!m) return xml.replace(/<w:rtl\/>/g, '');
    let ppr = m[1].replace(/<w:bidi\/>/g, '');
    const at = ppr.search(/<w:(spacing|ind|contextualSpacing|jc|rPr)\b/);
    ppr = at < 0 ? ppr + '<w:bidi w:val="0"/>' : ppr.slice(0, at) + '<w:bidi w:val="0"/>' + ppr.slice(at);
    return ('<w:p><w:pPr>' + ppr + '</w:pPr>' + xml.slice(m[0].length)).replace(/<w:rtl\/>/g, '');
  };
  let lateSides = null;
  let afterPart = false; // بعد صفحة الجزء وبيضائها: ما يليها في أول صفحة جديدة أصلاً
  for (const b of doc.blocks) {
    const freshPage = afterPart;
    afterPart = false;
    if (lateSides) content.push(...lateSides), (lateSides = null);
    if (b.type !== 'pagefig' && b.type !== 'coverpage') leadOpen = false;
    if (b.type !== 'para') listLs = '';
    // الهامش الجانبي: قبل القطعة (فإطاره بإزاء أولها)، إلا ما يبدأ صفحةً جديدة فبعده
    const sides = b.side && ['para', 'heading', 'verse', 'label'].includes(b.type) ? sideFrames(b) : [];
    const sideAfter = sides.length && (b.breakBefore || (b.type === 'heading' && b.level === 1 && S.chapterNewPage));
    if (sides.length && !sideAfter) content.push(...sides);
    else if (sides.length) lateSides = sides;
    if (b.type === 'heading') {
      const lvl = Math.min(b.level, 4);
      // نظام العناوين المعتمد: مقاس العنوان ومسافاته ومحاذاته، والجزء والفصل في صفحةٍ جديدة (والجزء تليه صفحةٌ بيضاء)
      const hs = S.headScheme === 'pro' && !doc.mutun ? HS_DOCX[b.hr] : null;
      let pb = !freshPage && ((lvl === 1 && S.chapterNewPage && !doc.mutun && !firstContent && !hs) || (b.breakBefore && !firstContent) || (hs && hs.page && !firstContent)) ? '<w:pageBreakBefore/>' : '';
      // خلفية صفحة الباب: الباب يبدأ قسماً (فصفحته الأولى بخلفيته)، والفاصل فاصل القسم
      if (lvl === 1 && BGH.h1 && !doc.mutun) {
        if (pb) {
          content.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${bodySect()}</w:pPr></w:p>`);
          pb = '';
          sectH1 = true;
        } else if (firstContent) sectH1 = true;
      }
      const id = bmId++;
      // عنوان خارج فهرس الملف (nt): بشكل العنوان نفسه لكن بنمط لا يدخل الفهرس عند تحديثه
      if (hs) {
        const hp0 = `<w:spacing w:before="${tw(hs.before)}" w:after="${tw(hs.after)}" w:line="${hs.line * 20}" w:lineRule="atLeast"/><w:jc w:val="${hs.jc}"/>`;
        const rp = szAt(hs.pt);
        content.push(
          `<w:p><w:pPr><w:pStyle w:val="${b.nt ? 'HeadX' : 'Heading'}${lvl}"/>${pb}${hp0}</w:pPr><w:bookmarkStart w:id="${id}" w:name="_Toc_${b.id}"/>${run(b.text, b.st ? mergeRpr(rp, b.st, false, hs.pt) : rp)}<w:bookmarkEnd w:id="${id}"/></w:p>`,
        );
        if (b.hr === 'part') {
          content.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
          afterPart = true;
        }
      } else
      content.push(
        `<w:p><w:pPr><w:pStyle w:val="${b.nt ? 'HeadX' : 'Heading'}${lvl}"/>${pb}${pprTail(b)}</w:pPr><w:bookmarkStart w:id="${id}" w:name="_Toc_${b.id}"/>${run(b.text, b.st ? mergeRpr('', b.st, false, sz['h' + lvl]) : '')}<w:bookmarkEnd w:id="${id}"/></w:p>`,
      );
    } else if (b.type === 'para') {
      // القوائم: العلامة نصّاً في أول الفقرة، والفقرة معلّقة (كما تُرى في الإخراج)
      const ls = b.ps && /^[bdnpw]$/.test(b.ps.ls || '') ? b.ps.ls : '';
      if (ls) {
        listN = listLs === ls ? listN + 1 : Number(b.ps.lstart) > 0 ? Number(b.ps.lstart) : 1;
        listLs = ls;
      } else listLs = '';
      const ORDW = ['أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً', 'ثامناً', 'تاسعاً', 'عاشراً'];
      const AR = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
      const mark = !ls ? '' : ls === 'b' ? '•' : ls === 'd' ? '◆' : ls === 'p' ? `(${AR(listN)})` : ls === 'w' ? (ORDW[listN - 1] || AR(listN)) + ':' : AR(listN) + '-';
      const hang = ls === 'w' ? 4.2 : 2.4;
      const liPr = ls ? `<w:ind w:right="${tw((+((b.ps || {}).is) || 0) + (sz.body * hang * 25.4) / 72)}" w:hanging="${tw((sz.body * hang * 25.4) / 72)}"/>` : '';
      const tail = ls ? pprTail({ ...b, ps: { ...b.ps, is: undefined, ind: undefined } }).replace(/<w:ind [^>]*\/>/, '') : pprTail(b);
      if (ls) {
        content.push(`<w:p><w:pPr><w:pStyle w:val="${b.mt ? 'MatnTop' : b.sh ? 'SharhText' : 'BodyText'}"/>${b.breakBefore && !firstContent ? '<w:pageBreakBefore/>' : ''}${tail.replace(/(<w:jc )/, liPr + '$1') + (/<w:jc /.test(tail) ? '' : liPr)}</w:pPr>${run(mark, `<w:b/><w:bCs/><w:color w:val="${col(hc[1])}"/>`)}<w:r><w:rPr><w:rtl/></w:rPr><w:tab/></w:r>${RUNTS ? bindLastWords(inlineRunsXml(b.runs)) : inlineRunsXml(b.runs)}</w:p>`);
        if (!leadOpen) firstContent = false;
        continue;
      }
      const rstyle = RESEARCH && b.role ? researchStyle(b.role) : '';
      let pxml = `<w:p><w:pPr><w:pStyle w:val="${rstyle || (b.ay ? 'AyahText' : b.mt || b.matn ? (b.mt ? 'MatnTop' : 'BodyText') : b.sh ? 'SharhText' : 'BodyText')}"/>${b.breakBefore && !firstContent ? '<w:pageBreakBefore/>' : ''}${rstyle === 'ResEn' ? pprTail(b).replace(/<w:bidi\/>/g, '') : pprTail(b)}</w:pPr>${RUNTS && rstyle !== 'ResEn' && !/<w:jc w:val="(center|left)"/.test(pprTail(b)) ? bindLastWords(inlineRunsXml(quranMatn(b))) : inlineRunsXml(quranMatn(b))}</w:p>`;
      // النص الإنجليزي: فقرة من اليسار إلى اليمين بلا علامة العربية على كلماته
      if (rstyle === 'ResEn') pxml = pxml.replace(/<w:rtl\/>/g, '');
      else if (b.ps && b.ps.dir === 'ltr') pxml = ltrPara(pxml);
      content.push(pxml);
    } else if (b.type === 'image') {
      // صورة من ملف Word: في سطرها بعرضها من عرض النص، ولا تعلو على الصفحة
      const rid = b.w > 0 && b.h > 0 ? mediaFor(b.src) : '';
      if (rid) {
        const maxH = P.h - P.top - P.bottom - 12;
        let wMm = (textMm * Math.min(100, Math.max(5, Number(b.wPct) || 60))) / 100;
        if ((wMm * b.h) / b.w > maxH) wMm = (maxH * b.w) / b.h;
        const cap = typeof b.cap === 'string' ? b.cap.trim() : '';
        // من «المحرِّر»: التفاف النص، والصورة خلف النص وأمامه، وشفافيتها وتدويرها
        const look = (xml) => {
          let out = xml;
          if (Number(b.op) > 0 && Number(b.op) < 1) out = out.replace(`<a:blip r:embed="${rid}"/>`, `<a:blip r:embed="${rid}"><a:alphaModFix amt="${Math.round(Number(b.op) * 100000)}"/></a:blip>`);
          if (Number(b.rot)) out = out.replace('<a:xfrm>', `<a:xfrm rot="${Math.round(Number(b.rot) * 60000)}">`);
          return out;
        };
        const tinyP = (inner) => `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${inner}</w:p>`;
        if (b.wrap === 'behind' || b.wrap === 'front') {
          const bw = GM.text;
          const bh = P.h - P.top - P.bottom;
          const pc = (v, d) => (Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : d) / 100;
          content.push(tinyP(look(anchorPic(rid, 'صورة', P.side + pc(b.x, 50) * bw, P.top + pc(b.y, 30) * bh, wMm, b.h / b.w, b.wrap === 'front'))));
          firstContent = false;
          continue;
        }
        if (b.wrap === 'right' || b.wrap === 'left') {
          // مربع: النص يلتف حولها (مثبّتة في أول الفقرة التالية، إلى يمين العمود أو يساره)
          content.push(tinyP(look(inlinePic(rid, 'صورة', wMm, b.h / b.w)).replace(/<wp:inline distT="0" distB="0" distL="0" distR="0">([\s\S]*?)<wp:docPr/, (m, inner) =>
            `<wp:anchor distT="0" distB="72000" distL="${b.wrap === 'right' ? 144000 : 0}" distR="${b.wrap === 'left' ? 144000 : 0}" simplePos="0" relativeHeight="${drawId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${b.wrap}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>36000</wp:posOffset></wp:positionV>${inner}<wp:wrapSquare wrapText="bothSides"/><wp:docPr`).replace('</wp:inline>', '</wp:anchor>')));
          firstContent = false;
          continue;
        }
        content.push(`<w:p><w:pPr>${cap ? '<w:keepNext/>' : ''}${b.breakBefore && !firstContent ? '<w:pageBreakBefore/>' : ''}<w:bidi/><w:spacing w:before="120" w:after="${cap ? 40 : 140}"/><w:ind w:firstLine="0"/><w:jc w:val="${JCA[b.al] || 'center'}"/></w:pPr>${look(inlinePic(rid, 'صورة', wMm, b.h / b.w))}</w:p>`);
        // شرح الصورة: تحتها في الوسط بخط أصغر
        if (cap) {
          const cs = hp(Math.max(sz.body - 2, 8));
          cap.split('\n').forEach((line, i, a) => content.push(`<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="${i === a.length - 1 ? 140 : 0}"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>${run(line, `<w:sz w:val="${cs}"/><w:szCs w:val="${cs}"/>`)}</w:p>`));
        }
      }
    } else if (b.type === 'table') {
      content.push(dataTable(b));
    } else if (b.type === 'pagefig') {
      // صفحة صور من الملف (عنوان الكتاب، شعار الدار): قسم مستقل بلا رقم، وكل صورة في موضعها ومقاسها من الصفحة
      const frac = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
      const tiny = '<w:bidi/><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/>';
      const rows = []; // [خصائص الفقرة، محتواها]
      const anchors = [];
      for (const x of Array.isArray(b.parts) ? b.parts : []) {
        const gap = Math.round(frac(x.gap, 0) * tw(P.h));
        const pp = `<w:bidi/><w:spacing w:before="${gap}" w:after="0"/><w:ind w:firstLine="0"/><w:jc w:val="${JCA[x.al] || 'center'}"/>`;
        if (x.k === 'text') {
          const xs = Number(x.sz) >= 6 && Number(x.sz) <= 60 ? `<w:sz w:val="${hp(Number(x.sz))}"/><w:szCs w:val="${hp(Number(x.sz))}"/>` : '';
          rows.push([pp, run(String(x.t || ''), `${fontProps(FH)}${x.b ? '<w:b/><w:bCs/>' : ''}${xs}`)]);
          continue;
        }
        const rid = x.w > 0 && x.h > 0 ? mediaFor(x.src) : '';
        if (!rid) continue;
        const wMm = Math.min(frac(x.wp, 0.4) * P.w, P.w);
        if (x.abs && Number.isFinite(Number(x.abs.x)) && Number.isFinite(Number(x.abs.y))) anchors.push(anchorPic(rid, 'صورة', frac(x.abs.x, 0) * P.w + wMm / 2, frac(x.abs.y, 0) * P.h + (wMm * x.h) / x.w / 2, wMm, x.h / x.w));
        else {
          rows.push([pp, inlinePic(rid, 'صورة', Math.min(wMm, textMm), x.h / x.w)]);
          if (x.cap) rows.push([`<w:bidi/><w:spacing w:before="40" w:after="0"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>`, run(String(x.cap).replace(/\n/g, ' '))]);
        }
      }
      if (anchors.length) rows.unshift([tiny, anchors.join('')]);
      if (rows.length) {
        if ((content.length || (tocStart && !leadOpen)) && !coverAt.has(content.length - 1)) {
          if (!content.length) startsWithSect = true;
          content.push(`<w:p><w:pPr>${tiny}${bodySect()}</w:pPr></w:p>`);
        }
        lastIsCover = b === doc.blocks[doc.blocks.length - 1] && !tocEnd && !(PR && PR.back.length) && !(leadOpen && tocStart);
        rows.forEach(([pp, inner], i) => {
          if (i === rows.length - 1) coverAt.add(content.length);
          content.push(`<w:p><w:pPr>${pp}${i === rows.length - 1 && !lastIsCover ? bodySect('rIdFooter2') : ''}</w:pPr>${inner}</w:p>`);
        });
        if (leadOpen) leadEnd = content.length;
      }
    } else if (b.type === 'coverpage') {
      // صفحة غلاف من الملف: قسم مستقل بلا رقم صفحة، والصورة تملأ الصفحة
      const rid = mediaFor(b.src);
      if (rid) {
        const tiny = '<w:bidi/><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/>';
        // ما قبلها قسم يُغلق (إلا إن كان غلافاً قبلها مباشرة، أو لا شيء قبلها)
        if ((content.length || (tocStart && !leadOpen)) && !coverAt.has(content.length - 1)) {
          if (!content.length) startsWithSect = true;
          content.push(`<w:p><w:pPr>${tiny}${bodySect()}</w:pPr></w:p>`);
        }
        // غلاف في آخر الكتاب (غلاف خلفي): قسمه هو القسم الأخير، فلا تبقى بعده صفحة فارغة
        lastIsCover = b === doc.blocks[doc.blocks.length - 1] && !tocEnd && !(PR && PR.back.length) && !(leadOpen && tocStart);
        coverAt.add(content.length);
        content.push(`<w:p><w:pPr>${tiny}${lastIsCover ? '' : bodySect('rIdFooter2')}</w:pPr>${fullPagePic(rid, 'غلاف')}</w:p>`);
        if (leadOpen) leadEnd = content.length;
      }
    } else if (b.type === 'pagebreak') {
      if (!firstContent) content.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    } else if (b.type === 'hr') {
      content.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${col(S.ruleColor)}"/></w:pBdr><w:spacing w:before="120" w:after="200" w:line="120" w:lineRule="exact"/><w:ind w:left="${Math.round(textW * 0.32)}" w:right="${Math.round(textW * 0.32)}" w:firstLine="0"/></w:pPr></w:p>`);
    } else if (b.type === 'label') {
      content.push(
        `<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:keepNext/><w:ind w:firstLine="0"/></w:pPr>` +
          run(b.text, b.st ? mergeRpr(b.strong ? `<w:b/><w:bCs/><w:color w:val="${col(hc[2])}"/>` : '', b.st, false) : b.strong ? `<w:b/><w:bCs/><w:color w:val="${col(hc[2])}"/>` : '') + `</w:p>`,
      );
    } else if (b.type === 'rule') {
      // خط بين المتن وشرحه
      content.push(
        `<w:p><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${col(S.ruleColor)}"/></w:pBdr><w:spacing w:before="60" w:after="120" w:line="120" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr></w:p>`,
      );
    } else if (b.type === 'sharh') {
      // شرح بلا رقم في المتن: فقرات بنمط الشرح
      const n = doc.notes[b.id];
      for (const seg of (n && n.segs) || []) {
        if (seg.type === 'verse') content.push(verseTable([seg.parts], 'n' + b.id, textW, 7, sz.body));
        else content.push(`<w:p><w:pPr><w:pStyle w:val="${seg.sub ? 'FootnoteText' : 'SharhText'}"/></w:pPr>${inlineRunsXml(seg.runs, true)}</w:p>`);
      }
    } else if (b.type === 'verse') {
      // شطرٌ وحده (آخر الثلاثي والمخمَّس) ونمط «وسط»: كل شطر فقرةٌ في وسط السطر
      const p0 = String(b.parts[0] || '').trim();
      const p1 = String(b.parts[1] || '').trim();
      const centerAll = (b.vl || S.verseLayout) === 'center';
      if (b.single || !p0 || !p1 || centerAll) {
        const vrp = b.mt ? matnProps : verseFont + (S.verseColor ? `<w:color w:val="${col(S.verseColor)}"/>` : '');
        const vr = Object.assign([p0, p1], b.vq ? { vq: b.vq } : {});
        [0, 1].filter((i) => vr[i]).forEach((i) => content.push(`<w:p><w:pPr><w:pStyle w:val="Verse"/><w:jc w:val="center"/></w:pPr>${hx(vr, i, vrp)}</w:p>`));
        if (!leadOpen) firstContent = false;
        continue;
      }
      const last = content[content.length - 1];
      const row = b.vno || b.vq ? Object.assign([...b.parts], b.vno ? { vno: b.vno } : {}, b.vq ? { vq: b.vq } : {}) : b.parts;
      if (last && last.poem === b.poem) last.rows.push(row);
      else content.push({ poem: b.poem, rows: [row], st: b });
    } else if (b.type === 'ornament') {
      content.push(`<w:p><w:pPr><w:pStyle w:val="Ornament"/></w:pPr>${run(S.ornament)}</w:p>`);
    } else if (b.type === 'mstart') {
      // جزءٌ من المتن: في صفحة جديدة. والمقابلة بجهةٍ (أو المتن في وسط صفحته): كل جزءٍ قسمٌ يبدأ في صفحةٍ زوجية أو فردية
      // (اليمنى في الكتاب العربي زوجية الرقم) — فيزيد Word قبله صفحةً إن لزم
      const MU = doc.mutun || {};
      muSects = !!(MU.side || MU.center);
      if (muSects) {
        if (!muClosed && content.length) content.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/>${bodySect()}</w:pPr></w:p>`);
      } else if (!firstContent) content.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`);
      muUnitAt = content.length;
      muClosed = false;
      continue;
    } else if (b.type === 'mintro') {
      // ما قبل المتن («قال الناظم رحمه الله:»): ملازمٌ لما بعده
      const IC = /^#[0-9a-f]{6}$/i.test(S.mIntroColor || '') ? S.mIntroColor : /^#[0-9a-f]{6}$/i.test(S.matnColor || '') ? S.matnColor : hc[2];
      const IS = Number(S.mIntroSize) > 0 ? Number(S.mIntroSize) : sz.body;
      const IFn = S.mIntroFont && !S.docxFont ? docxFontName(S.mIntroFont) : FH;
      const deco = S.mIntroDeco || 'plain';
      const rp = `${fontProps(IFn)}${S.mIntroBold === false ? '' : '<w:b/><w:bCs/>'}<w:color w:val="${col(IC)}"/><w:sz w:val="${hp(IS)}"/><w:szCs w:val="${hp(IS)}"/>` + (deco === 'rule' ? '<w:u w:val="single"/>' : deco === 'frame' ? `<w:bdr w:val="single" w:sz="6" w:space="2" w:color="${col(IC)}"/>` : '');
      const shd = deco === 'band' ? `<w:shd w:val="clear" w:color="auto" w:fill="${mixWhite(IC, 0.1)}"/>` : '';
      const jc = { r: 'start', c: 'center', l: 'end' }[S.mIntroAl] || 'start';
      content.push(`<w:p><w:pPr><w:keepNext/>${shd}<w:spacing w:before="60" w:after="80"/><w:ind w:firstLine="0"/><w:jc w:val="${jc}"/></w:pPr>${run(deco === 'orn' ? `❁ ${b.text} ❁` : b.text, rp)}</w:p>`);
      if (!leadOpen) firstContent = false;
      continue;
    } else if (b.type === 'mcomment') {
      const MU = doc.mutun || {};
      const c = b.c || { place: MU.place, n: MU.place === 'page' ? 1 : 0 };
      const gapMm = Number(MU.gapMm) || 8;
      const gapTw = tw(gapMm);
      const ruleC = col(MU.color || '#B7AC98');
      // سطور متتالية بالحد نفسه يجمعها Word في إطار واحد: «بين» يرسم الخط بين كل سطرين، و«تحت» آخرها
      const bv = `w:val="${MU.rule === 'dots' ? 'dotted' : 'single'}" w:sz="4" w:space="0" w:color="${ruleC}"`;
      const bdr = MU.rule === 'blank' ? '' : `<w:pBdr><w:bottom ${bv}/><w:between ${bv}/></w:pBdr>`;
      const line = (t = '', brk = false) =>
        `<w:p><w:pPr>${brk ? '<w:pageBreakBefore/>' : ''}${bdr}<w:spacing w:before="0" w:after="0" w:line="${gapTw}" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr>${t ? run(t, `<w:color w:val="8A7E70"/><w:sz w:val="${hp(Math.max(sz.body * 0.72, 9))}"/><w:szCs w:val="${hp(Math.max(sz.body * 0.72, 9))}"/>`) : ''}</w:p>`;
      // رؤوس المسائل على السطور نفسها، موزّعةً بينها
      const linesWith = (n, hints, brk = false) => {
        const out = Array.from({ length: n }, () => '');
        const h = (hints || []).slice(0, n);
        const step = h.length ? Math.max(1, Math.floor(n / h.length)) : 1;
        h.forEach((t, i) => (out[Math.min(n - 1, i * step)] = `${String(i + 1).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d])}- ${t}`));
        return out.map((t, i) => line(t, brk && i === 0));
      };
      const labelText = typeof c.label === 'string' ? c.label : MU.label || '';
      const LC = /^#[0-9a-f]{6}$/i.test(S.mLabelColor || '') ? S.mLabelColor : hc[2] || hc[1];
      const LS = Number(S.mLabelSize) > 0 ? Number(S.mLabelSize) : Math.max(sz.h3 || 17, 14);
      const LF = S.mLabelFont && !S.docxFont ? docxFontName(S.mLabelFont) : FH;
      const deco = S.mLabelDeco || 'plain';
      const lbl = (small, brk = false) => {
        if (!labelText) return '';
        const size = small ? Math.max(10, LS * 0.8) : LS;
        const rp = `${fontProps(LF)}${S.mLabelBold === false ? '' : '<w:b/><w:bCs/>'}<w:color w:val="${col(LC)}"/><w:sz w:val="${hp(size)}"/><w:szCs w:val="${hp(size)}"/>` + (deco === 'rule' ? '<w:u w:val="single"/>' : deco === 'frame' ? `<w:bdr w:val="single" w:sz="6" w:space="2" w:color="${col(LC)}"/>` : '');
        const t = deco === 'orn' ? `❁ ${labelText} ❁` : labelText;
        const jc = { r: 'start', c: 'center', l: 'end' }[S.mLabelAl] || 'center';
        const shd = deco === 'band' ? `<w:shd w:val="clear" w:color="auto" w:fill="${mixWhite(LC, 0.11)}"/>` : '';
        return `<w:p><w:pPr>${brk ? '<w:pageBreakBefore/>' : ''}<w:keepNext/>${shd}<w:spacing w:before="0" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="${jc}"/></w:pPr>${run(t, rp)}</w:p>`;
      };
      // (الخط تحت السطر يزيد عليه قليلاً في Word: يُحسب له، ويبقى هامشٌ من الأمان)
      const labelMm = labelText ? (S.mLabelDeco === 'band' ? 3 : 0) + LS * 0.3528 * 1.6 + 2.2 : 0;
      const pageLines = Math.max(4, Math.floor((P.h - P.top - P.bottom - labelMm - 3) / (gapMm + 0.6)));
      if (c.place === 'below') {
        content.push(`<w:p><w:pPr><w:keepNext/><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="${col(S.ruleColor)}"/></w:pBdr><w:spacing w:before="120" w:after="60" w:line="120" w:lineRule="exact"/><w:ind w:firstLine="0"/></w:pPr></w:p>`, lbl(), ...linesWith(c.n > 0 ? c.n : Number(MU.belowLines) || 8, c.hints));
      } else if (c.place === 'page') {
        // صفحةٌ (أو صفحات) للتعليق: سطورٌ تملؤها
        // (فاصل الصفحة على أول فقرةٍ فيها، لا فقرةٌ فارغة تأخذ سطراً من أعلاها)
        for (let k = 0; k < Math.max(1, Math.min(4, c.n || 1)); k++) {
          const withLabel = !k && !!labelText;
          content.push(...(withLabel ? [lbl(false, true)] : []), ...linesWith(withLabel ? pageLines : pageLines + (labelText ? 1 : 0), k ? [] : c.hints, !withLabel));
        }
      } else if (c.place === 'side') {
        // الهامش بجانب المتن: جدولٌ بخانتين — المتن، وموضع التعليق بسطوره
        const part = content.splice(muUnitAt);
        const xml = part.map((x) => (typeof x === 'string' ? x : x.rows.some((r) => r.vno) ? numberedVerseTable(x.rows, 'p' + x.poem, Math.round(textW * (1 - (Number(MU.sideW) || 42) / 100)), 7, sz.body, x.st) : verseTable(x.rows, 'p' + x.poem, Math.round(textW * (1 - (Number(MU.sideW) || 42) / 100)), 7, sz.body, x.st)));
        const wSide = Math.round(textW * ((Number(MU.sideW) || 42) / 100));
        const wMain = textW - wSide;
        const none = ['top', 'left', 'bottom', 'right', 'insideH'].map((k) => `<w:${k} w:val="nil"/>`).join('');
        const inner = `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="${col(S.ruleColor)}"/>`;
        const matnLeft = MU.colSide === 'left';
        const cellA = `<w:tc><w:tcPr><w:tcW w:w="${wMain}" w:type="dxa"/></w:tcPr>${xml.join('') || '<w:p/>'}</w:tc>`;
        const cellB = `<w:tc><w:tcPr><w:tcW w:w="${wSide}" w:type="dxa"/></w:tcPr>${lbl(true)}${linesWith(pageLines - 2, c.hints).join('')}</w:tc>`;
        content.push(
          `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${textW}" w:type="dxa"/><w:tblBorders>${none}${inner}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
            `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
            `<w:tblGrid>${matnLeft ? `<w:gridCol w:w="${wSide}"/><w:gridCol w:w="${wMain}"/>` : `<w:gridCol w:w="${wMain}"/><w:gridCol w:w="${wSide}"/>`}</w:tblGrid>` +
            `<w:tr>${matnLeft ? cellB + cellA : cellA + cellB}</w:tr></w:tbl>`,
        );
      }
      if (muSects) {
        // يُغلق قسم الجزء: يبدأ في صفحةٍ زوجية (المتن يميناً) أو فردية (يساراً)، ومحتواه في وسط الصفحة إن اختير
        content.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/>${bodySect('rIdFooter1', { type: MU.side === 'right' ? 'evenPage' : MU.side === 'left' ? 'oddPage' : 'nextPage', center: !!MU.center })}</w:pPr></w:p>`);
        muClosed = true;
      }
      firstContent = false;
      continue;
    }
    if (!leadOpen) firstContent = false;
  }

  // تحويل مجموعات الأبيات إلى جداول
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (typeof c === 'string') continue;
    content[i] = c.rows.some((r) => r.vno) ? numberedVerseTable(c.rows, 'p' + c.poem, textW, 7, sz.body, c.st) : verseTable(c.rows, 'p' + c.poem, textW, 7, sz.body, c.st);
  }

  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  // المتون: قسم آخر جزءٍ هو القسم الأخير (لا قسمٌ فارغ بعده)
  let muLastSect = '';
  const lastC = content[content.length - 1];
  if (muClosed && typeof lastC === 'string' && /<w:sectPr>/.test(lastC) && !tocEnd && !(PR && PR.back.length)) {
    content.pop();
    muLastSect = lastC.match(/<w:sectPr>[\s\S]*<\/w:sectPr>/)[0];
  }
  let main;
  let sect = '';
  // خلفية الفهرس: الفهرس قسمٌ وحده (برأسه)، فاصله فاصل قسم لا فاصل صفحة
  const tocSect = !!BGH.toc && tocXml.length > 0;
  // فاصل القسم يبدأ صفحة جديدة: لا فاصل صفحة معه
  if (tocStart && tocSect) {
    const h1Next = sectH1;
    sectH1 = false;
    main = [...content.slice(0, leadEnd), ...tocXml, `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${bodySect('rIdFooter1', { toc: true })}</w:pPr></w:p>`, ...content.slice(leadEnd)];
    sectH1 = h1Next;
  } else if (tocStart) main = [...content.slice(0, leadEnd), ...tocXml, ...(startsWithSect || leadEnd === content.length ? [] : [pageBreak]), ...content.slice(leadEnd)];
  else if (tocXml.length && tocSect) {
    // قسم آخر الكتاب يُغلق قبل الفهرس، والفهرس هو القسم الأخير
    const close = muLastSect ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${muLastSect}</w:pPr></w:p>` : coverAt.has(content.length - 1) || (muClosed && !muLastSect) ? '' : `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${bodySect(lastIsCover ? 'rIdFooter2' : 'rIdFooter1')}</w:pPr></w:p>`;
    main = [...content, ...(close ? [close] : []), ...tocXml];
    sect = bodySect('rIdFooter1', { toc: true });
  } else if (tocXml.length) main = [...content, ...(coverAt.has(content.length - 1) || (muClosed && !muLastSect) ? [] : [pageBreak]), ...tocXml];
  else main = content;

  if (!sect) sect = muLastSect || bodySect(lastIsCover ? 'rIdFooter2' : 'rIdFooter1');
  // صفحات ما بعد الكتاب: أقسام بلا رقم (تذييلها فارغ، وإلا ورثت رقم الصفحة من قسم الكتاب)
  const backSeq = PR ? PR.back : [];
  let tail = sect;
  if (backSeq.length) needFooter2 = true;
  if (backSeq.length) {
    const noFooter = '<w:footerReference w:type="default" r:id="rIdFooter2"/>';
    const empty = `<w:p><w:pPr><w:bidi/><w:spacing w:after="0"/></w:pPr></w:p>`;
    const parts = [`<w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="120" w:lineRule="exact"/>${sect}</w:pPr></w:p>`];
    backSeq.forEach((it, i) => {
      const paras = seqParas(it);
      parts.push(...(paras.length ? paras : i === backSeq.length - 1 ? [empty] : []));
      if (i < backSeq.length - 1) parts.push(`<w:p><w:pPr><w:bidi/><w:spacing w:after="0"/>${sectFront(noFooter)}</w:pPr></w:p>`);
    });
    tail = parts.join('') + sectFront(noFooter);
  }
  // خلفيات الصفحات (ترويسات) لا تُورث إلى صفحة الغلاف الخلفي: ترويسة فارغة
  const emptyHdr = !!(backOuter && Object.keys(BGH).length);
  if (backOuter) {
    // القسم الأخير يُغلق في فقرة، ثم صفحة الغلاف الخلفي قسماً أخيراً بلا هوامش ولا رقم
    needFooter2 = true;
    const last = tail.lastIndexOf('<w:sectPr');
    tail = tail.slice(0, last) + `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${tail.slice(last)}</w:pPr></w:p>` +
      `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${coverRun('rIdBack', 9002, 'back-cover.' + backOuter.ext)}</w:p>` +
      `<w:sectPr>${emptyHdr ? '<w:headerReference w:type="default" r:id="rIdHdrEmpty"/>' : ''}<w:footerReference w:type="default" r:id="rIdFooter2"/><w:type w:val="nextPage"/><w:pgSz w:w="${tw(P.w)}" w:h="${tw(P.h)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/></w:sectPr>`;
  }

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}>` +
    // الورق الأصفر: لون صفحات الملف (ويطبعه Word إن فُعّل «طباعة ألوان الخلفية»)
    (S.paper === 'yellow' ? `<w:background w:color="${PAPER.yellow.slice(1)}"/>` : '') +
    `<w:body>` +
    body.join('') + main.join('') + tail + `</w:body></w:document>`;

  const footnotesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes ${NS}>` +
    `<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>` +
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>` +
    footnoteXml.join('') + `</w:footnotes>`;

  const footerXml0 =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:bidi/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:t>${num(firstNum)}</w:t></w:r>` +
    `<w:r><w:rPr><w:b/><w:bCs/><w:rtl/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  // رقم صفحة البحث عادي لا عريض؛ ورقم الصفحة «كما في الملف» بلونه ومقاسه فيه
  let footerXml = RESEARCH ? footerXml0.replace(/<w:b\/><w:bCs\/>/g, '') : footerXml0;
  if (!RESEARCH && S.preset === 'file' && (/^#[0-9a-f]{6}$/i.test(S.folioColor || '') || Number(S.folioSize) > 0))
    footerXml = footerXml.replace(/<w:rPr><w:b\/><w:bCs\/><w:rtl\/><\/w:rPr>/g, `<w:rPr><w:b/><w:bCs/>${/^#[0-9a-f]{6}$/i.test(S.folioColor || '') ? `<w:color w:val="${col(S.folioColor)}"/>` : ''}${Number(S.folioSize) > 0 ? `<w:sz w:val="${hp(Number(S.folioSize))}"/><w:szCs w:val="${hp(Number(S.folioSize))}"/>` : ''}<w:rtl/></w:rPr>`);

  /* --------------------------------------------------- الأنماط */
  const ls = (m) => Math.round(240 * m);
  // البحث العلمي: مسافة بعد الفقرة، وأنماط الملخص والكلمات المفتاحية والمراجع والنص الإنجليزي
  const PA = RESEARCH ? Math.round((Number(S.paraAfter) || 0) * 20) : 0;
  const szR = (pt) => `<w:sz w:val="${hp(pt)}"/><w:szCs w:val="${hp(pt)}"/>`;
  const researchStyles = !RESEARCH
    ? ''
    : `<w:style w:type="paragraph" w:styleId="ResAbstract"><w:name w:val="Research Abstract"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:rPr>${szR(Number(S.abstractSize) || 15)}</w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="ResKeywords"><w:name w:val="Research Keywords"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="ResKeywordsAbs"><w:name w:val="Research Abstract Keywords"/><w:basedOn w:val="ResKeywords"/><w:rPr>${szR(Number(S.abstractSize) || 15)}</w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="ResRef"><w:name w:val="Research Reference"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:pPr><w:spacing w:after="${Math.min(PA, 80)}"/><w:ind w:right="${tw(8)}" w:hanging="${tw(8)}" w:firstLine="0"/></w:pPr><w:rPr>${szR(Number(S.refSize) || 14)}</w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="ResRefHead"><w:name w:val="Research Reference Group"/><w:basedOn w:val="BodyText"/><w:pPr><w:keepNext/><w:spacing w:before="60"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:bCs/>${szR(Number(S.refSize) || 14)}</w:rPr></w:style>` +
      `<w:style w:type="paragraph" w:styleId="ResEn"><w:name w:val="Research English"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:bidi w:val="0"/><w:spacing w:after="${PA}" w:line="${ls(DL)}" w:lineRule="auto"/><w:ind w:firstLine="${tw(S.indentMm)}"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${szR(Number(S.enSize) || 12)}</w:rPr></w:style>`;
  const hStyle = (n, size, color, center, before, after) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:bidi/><w:spacing w:before="${before}" w:after="${after}" w:line="${ls(Math.max(DL, 1.15))}" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="${center && S.headAl !== 'r' ? 'center' : 'both'}"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr>${fontProps(RF('h' + Math.min(3, n)) || FH)}<w:b/><w:bCs/><w:color w:val="${col(color)}"/><w:sz w:val="${hp(size)}"/><w:szCs w:val="${hp(size)}"/></w:rPr></w:style>`;
  const tocStyle = (n, indentMm, bold, color) =>
    `<w:style w:type="paragraph" w:styleId="TOC${n}"><w:name w:val="toc ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>` +
    `<w:pPr><w:tabs><w:tab w:val="end" w:leader="dot" w:pos="${textW}"/></w:tabs><w:bidi/><w:spacing w:before="${n === 1 ? 60 : 0}" w:after="0" w:line="${ls(1.55)}" w:lineRule="auto"/><w:ind w:left="${tw(indentMm)}" w:right="0" w:firstLine="0"/></w:pPr>` +
    `<w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${col(color)}"/><w:sz w:val="${hp(n >= 3 ? 13 : 14)}"/><w:szCs w:val="${hp(n >= 3 ? 13 : 14)}"/></w:rPr></w:style>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${fontProps(F)}<w:color w:val="${col(S.textColor)}"/><w:sz w:val="${hp(sz.body)}"/><w:szCs w:val="${hp(sz.body)}"/><w:lang w:val="ar-SA" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="${ls(DL)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr>${WIDOW}<w:bidi/><w:jc w:val="both"/></w:pPr><w:rPr><w:rtl/></w:rPr></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/><w:spacing w:after="${PA}" w:line="${ls(DL)}" w:lineRule="auto"/><w:ind w:firstLine="${tw(S.indentMm)}"/><w:jc w:val="both"/></w:pPr></w:style>` +
    hStyle(1, sz.h1, hc[1], true, 360, 240) +
    hStyle(2, sz.h2, hc[2], true, 240, 180) +
    hStyle(3, sz.h3, hc[3], false, 180, 140) +
    hStyle(4, sz.h4, hc[4], false, 140, 120) +
    // عناوين خارج فهرس الملف: شكل العنوان بلا مستوى مخطط
    [1, 2, 3, 4].map((n) => `<w:style w:type="paragraph" w:styleId="HeadX${n}"><w:name w:val="Warraq Heading NoTOC ${n}"/><w:basedOn w:val="Heading${n}"/><w:next w:val="BodyText"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>`).join('') +
    `<w:style w:type="paragraph" w:styleId="Verse"><w:name w:val="Verse"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:bidi/><w:spacing w:after="0"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="distribute"/></w:pPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Ornament"><w:name w:val="Ornament"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:spacing w:before="80" w:after="160"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="${col(S.ornamentColor)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="AyahText"><w:name w:val="Ayah"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:pPr><w:spacing w:before="140"/><w:ind w:firstLine="0"/></w:pPr><w:rPr>${roleFont('quran')}${S.matnBold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${col(S.quranColor)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="MatnTop"><w:name w:val="Matn"/><w:basedOn w:val="BodyText"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/></w:pPr><w:rPr>${roleFont('matn')}<w:b/><w:bCs/><w:color w:val="${col(S.matnColor)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="SharhText"><w:name w:val="Sharh"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/><w:spacing w:after="0" w:line="${ls(DL)}" w:lineRule="auto"/><w:ind w:firstLine="${tw(S.indentMm)}"/><w:jc w:val="both"/></w:pPr><w:rPr><w:sz w:val="${hp(sz.body)}"/><w:szCs w:val="${hp(sz.body)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="${tw(8)}"/></w:tabs><w:bidi/><w:spacing w:after="0" w:line="${ls(DL)}" w:lineRule="auto"/><w:ind w:left="${tw(8)}" w:hanging="${tw(8)}"/><w:jc w:val="both"/></w:pPr><w:rPr><w:sz w:val="${hp(sz.note)}"/><w:szCs w:val="${hp(sz.note)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="FootnoteVerse"><w:name w:val="Footnote Verse"/><w:basedOn w:val="FootnoteText"/><w:pPr><w:tabs><w:tab w:val="clear" w:pos="${tw(8)}"/><w:tab w:val="center" w:pos="${Math.round(tw(8) + (textW - tw(8)) * 0.25)}"/><w:tab w:val="center" w:pos="${Math.round(tw(8) + (textW - tw(8)) * 0.75)}"/></w:tabs><w:ind w:left="0" w:hanging="0"/><w:jc w:val="center"/></w:pPr></w:style>` +
    `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:uiPriority w:val="99"/><w:rPr><w:b/><w:bCs/><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="FootnoteNumber"><w:name w:val="Footnote Number"/><w:rPr><w:b/><w:bCs/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr>${RESEARCH ? szR(Number(S.folioSize) || 12) : '<w:b/><w:bCs/><w:sz w:val="30"/><w:szCs w:val="30"/>'}</w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOCTitle"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${col(S.ruleColor)}"/></w:pBdr><w:spacing w:after="160"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr><w:rPr>${fontProps(FH)}<w:b/><w:bCs/><w:color w:val="${col(hc[1])}"/><w:sz w:val="${hp(sz.h1)}"/><w:szCs w:val="${hp(sz.h1)}"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="TOCHead"><w:name w:val="TOC Columns"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="end" w:pos="${textW}"/></w:tabs><w:bidi/><w:spacing w:after="120"/><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>` +
    tocStyle(1, 0, true, hc[1]) + tocStyle(2, 5, false, S.textColor) + tocStyle(3, 10, false, S.textColor) + tocStyle(4, 14, false, S.textColor) +
    researchStyles +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${col(S.textColor)}"/></w:rPr></w:style>` +
    `</w:styles>`;

  const settingsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${NS}>` +
    (S.paper === 'yellow' ? `<w:displayBackgroundShape/>` : '') +
    (G || GM.on ? `<w:mirrorMargins/>` : '') +
    `<w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
    `<w:footnotePr><w:numFmt w:val="${NUMFMT}"/><w:numRestart w:val="eachPage"/><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>` +
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
    `<w:themeFontLang w:val="en-US" w:bidi="ar-SA"/></w:settings>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    [...new Set([...(outer ? [outer.ext] : []), ...(backOuter ? [backOuter.ext] : []), ...(bsmPng ? ['png'] : []), ...media.map((m) => m.ext), ...Object.values(BGH).map((h) => h.ext)])].map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('') +
    Object.values(BGH).map((h) => `<Override PartName="/word/${h.file}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`).join('') +
    (emptyHdr ? `<Override PartName="/word/header-empty.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` : '') +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
    `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
    (needFooter2 ? `<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` : '') +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
    `<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` +
    `<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` +
    (outer ? `<Relationship Id="rIdOuter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/outer-cover.${outer.ext}"/>` : '') +
    (backOuter ? `<Relationship Id="rIdBack" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/back-cover.${backOuter.ext}"/>` : '') +
    (bsmPng ? `<Relationship Id="rIdBasmala" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/basmala.png"/>` : '') +
    (needFooter2 ? `<Relationship Id="rIdFooter2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>` : '') +
    media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.file}"/>`).join('') +
    Object.values(BGH).map((h) => `<Relationship Id="${h.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${h.file}"/>`).join('') +
    (emptyHdr ? `<Relationship Id="rIdHdrEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header-empty.xml"/>` : '') +
    `</Relationships>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${x(c.title || '')}</dc:title><dc:creator>${x(c.author || '')}</dc:creator><dc:language>ar-SA</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ورّاق</Application></Properties>`;

  return Buffer.from(
    makeZip(
      [
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rels },
        { name: 'docProps/core.xml', data: core },
        { name: 'docProps/app.xml', data: app },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/styles.xml', data: stylesXml },
        { name: 'word/settings.xml', data: settingsXml },
        { name: 'word/footnotes.xml', data: footnotesXml },
        { name: 'word/footer1.xml', data: footerXml },
        { name: 'word/_rels/document.xml.rels', data: docRels },
        ...(outer ? [{ name: `word/media/outer-cover.${outer.ext}`, data: new Uint8Array(outer.data) }] : []),
        ...(backOuter ? [{ name: `word/media/back-cover.${backOuter.ext}`, data: new Uint8Array(backOuter.data) }] : []),
        ...(emptyHdr ? [{ name: 'word/header-empty.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${NS}><w:p><w:pPr><w:bidi/></w:pPr></w:p></w:hdr>` }] : []),
        ...(bsmPng ? [{ name: 'word/media/basmala.png', data: new Uint8Array(bsmPng.data) }] : []),
        ...(needFooter2 ? [{ name: 'word/footer2.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:bidi/></w:pPr></w:p></w:ftr>` }] : []),
        ...media.map((m) => ({ name: 'word/media/' + m.file, data: new Uint8Array(m.data) })),
        // خلفيات الصفحات: رأسٌ لكل نوع، وصورته
        ...Object.entries(BGH).flatMap(([k, h]) => [
          { name: 'word/' + h.file, data: bgHeaderXml(k) },
          { name: `word/_rels/${h.file}.rels`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdBgImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${h.img}"/></Relationships>` },
          { name: 'word/media/' + h.img, data: new Uint8Array(h.data) },
        ]),
      ],
      { deflate: (u8) => zlib.deflateRawSync(u8, { level: 7 }) },
    ),
  );
}
