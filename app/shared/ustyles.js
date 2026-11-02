// أنماط المستخدم (كأنماط InDesign و Word): نمط فقرة (تنسيق الفقرة وحروفها) ونمط حرف (تنسيق كلمات بعينها).
// النمط مرتبط: ما يُطبَّق عليه يحمل اسمه (ps.pst للفقرة، st.cs للكلمات)، فإن عُدّل النمط تغيّر كل ما يحمله.
// الأولوية: تنسيق الكلمة نفسها، ثم نمط الحرف، ثم نمط الفقرة، ثم أسلوب الكتاب.
// تُحفظ الأنماط في الكتاب نفسه (عمليات defstyle في edits)، وتُحلّ هنا قبل التنضيد وقبل Word.

const omit = (o, k) => {
  if (!o || !(k in o)) return o;
  const { [k]: _, ...rest } = o;
  return rest;
};
/** تنسيق المقطع الفعلي: نمط الفقرة ← نمط الحرف ← تنسيقه */
export function runStyle(own, pstyle, styles) {
  const cs = own && own.cs && styles && styles[own.cs] ? styles[own.cs].st : null;
  const base = pstyle && pstyle.st ? pstyle.st : null;
  if (!cs && !base) return own && own.cs ? omit(own, 'cs') : own;
  const out = { ...(base || {}), ...(cs || {}), ...(omit(own, 'cs') || {}) };
  return Object.keys(out).length ? out : undefined;
}
/** فقرة بأنماطها محلولة */
export function resolveNode(b, styles) {
  if (!b || !styles) return b;
  const ps = b.ps && b.ps.pst ? styles[b.ps.pst] : null;
  const hasCs = (b.runs || []).some((r) => r.st && r.st.cs);
  if (!ps && !hasCs) return b.ps && b.ps.pst ? { ...b, ps: omit(b.ps, 'pst') } : b;
  const nb = { ...b };
  if (b.ps && b.ps.pst) {
    const own = omit(b.ps, 'pst');
    const merged = { ...((ps && ps.ps) || {}), ...own };
    if (Object.keys(merged).length) nb.ps = merged;
    else delete nb.ps;
    if (ps && ps.al && !b.al) nb.al = ps.al;
  }
  if (nb.runs) {
    nb.runs = nb.runs.map((r) => {
      if (r.k === 'r') return r;
      const s = runStyle(r.st, ps, styles);
      if (s === r.st) return r;
      const x = { ...r };
      if (s) x.st = s;
      else delete x.st;
      return x;
    });
  } else if (ps && ps.st) nb.st = { ...ps.st, ...(b.st || {}) };
  return nb;
}
/** المجلد بأنماطه محلولة (للتنضيد ولـ Word) */
export function resolveStyles(vol) {
  const styles = vol && vol.ustyles;
  if (!styles || !Object.keys(styles).length) return vol;
  const notes = {};
  for (const [id, n] of Object.entries(vol.notes || {})) notes[id] = n && n.segs ? { ...n, segs: n.segs.map((s) => resolveNode(s, styles)) } : n;
  return { ...vol, blocks: (vol.blocks || []).map((b) => resolveNode(b, styles)), notes };
}
