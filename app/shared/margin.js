// الهامش الخارجي الواسع: تضيق منطقة النص ويتّسع الهامش الذي في طرف الكتاب (لا الذي عند الكعب)،
// فيُكتب فيه (عناوين جانبية، تلخيص، تعليق). في صفحة ١٧ سم بهامشين ٢ سم: النص ١١ سم، والهامش الخارجي ٤ سم، والداخلي ٢ سم كما هو.
// والصفحة اليسرى من الكتاب: الفردية (الكتاب العربي، الأصل) أو الزوجية (odd: 'r') — والهامش الواسع دائماً في الطرف الخارجي.
// والحواشي في منطقة النص، فتضيق معه.
// يقرؤه: التنضيد (lib/book-html.js و typeset/engine.js)، و Word (lib/docx.js)، والمنضدة والمحرِّر والأساليب.

/** الأصل: عرض الهامش الخارجي (مم)، وحدوده، وأقلّ ما يبقى للنص */
export const OUTER_MARGIN = { w: 40, min: 22, max: 90, minText: 40 };

/** { on?, w?, odd? } ← ما ورد منها بقيمٍ مقبولة، أو null */
export function cleanOuterMargin(v) {
  if (!v || typeof v !== 'object') return null;
  const o = {};
  if (typeof v.on === 'boolean') o.on = v.on;
  if (v.w !== undefined && v.w !== null && v.w !== '' && Number.isFinite(+v.w)) o.w = Math.round(Math.min(OUTER_MARGIN.max, Math.max(OUTER_MARGIN.min, +v.w)) * 10) / 10;
  if (v.odd === 'l' || v.odd === 'r') o.odd = v.odd;
  return Object.keys(o).length ? o : null;
}

/**
 * هندسة الصفحة (مم): inner الهامش عند الكعب، outer الهامش في طرف الكتاب، extra ما زيد على الهامش الخارجي،
 * text عرض منطقة النص (بلا هامش التجليد)، oddRight: الصفحة الفردية يمنى (لا يكون إلا مع الهامش الواسع)
 */
export function pageGeom(S) {
  const P = (S && S.page) || { w: 170, side: 20 };
  const om = S && S.outerMargin && typeof S.outerMargin === 'object' ? S.outerMargin : null;
  const on = !!(om && om.on);
  const side = +P.side || 20;
  const w = +P.w || 170;
  const want = on ? +om.w || OUTER_MARGIN.w : side;
  const outer = on ? Math.max(side, Math.min(want, w - side - OUTER_MARGIN.minText)) : side;
  return { on, inner: side, outer, extra: Math.round((outer - side) * 100) / 100, text: Math.round((w - side - outer) * 100) / 100, oddRight: on && om.odd === 'r' };
}

/** أهي صفحة يسرى؟ (pos: موضعها في الكتاب من ١) */
export const isLeftPage = (pos, oddRight) => (Math.abs(Math.round(+pos || 1)) % 2 === 1) !== !!oddRight;
